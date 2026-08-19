// **작도 화면 복귀 종단**(2026-08-19 14차 항목 6 · D-L97).
//
// 사용자 보고의 회귀 팔: "화면이 돌아간 순간부터 모델링 화면이 된다. 소실점과 지평선이
// 사라지고 그리기가 안 되며 돌아올 길이 없다." 재는 것(지시 6-g — 1점·2점 각각):
//   ⓪ 확정 직후(핀) — 작도 화면: 지평선 전폭 표시 · 복귀 버튼 꺼짐(상태 표시 겸용 6-d).
//   ① 급한 내려보기 궤도 → **모델링**: 지평선 행 덮임 소멸 · 실측 피치가 임계 밖 · 버튼 켜짐.
//   ② 모델링에서는 **안 그려진다**(6-e) — 획 수 불변 + 복귀 안내.
//   ①′ 얕은 내려보기(모델링·지평선이 화면 안일 자세) — 그 행도 덮임 0: "표시가 꺼진 것"과
//      "지평선이 화면 밖인 것"을 가른다(6-R1 [7] — 원인 둘·값 하나를 안 만든다).
//   ③ 「작도 시점으로」 → **2점 작도**: 실측 피치 ≈ 0(#49 — 각도 필드) · 수직축 무한원 ·
//      수평 소실점 둘의 y 일치 = 지평선 = 주점 행(정합 — 6-R1 [1]) · 재덮임 · 버튼 꺼짐.
//   ④ 복귀한 2점 시점에서 그리기·스냅이 돈다.
//   ⑤ 큐브 면 탭(재탭 규칙 D-L76) → **1점 작도**: 수평 유한 하나 · **그 시점에서도 그리기·
//      스냅**(지시 g "1점과 2점 각각" — 6-R1 [3]).
//   ⑥ 큐브 **모서리** 탭 → 2점 작도(지시 6-a "모서리가 2점" — 6-R1 [3]).
//
// 픽스처는 **피치 0(직립 그린 축)**이다 — 그린 수직축이 기울면(3점 구도) 복귀 뷰의 그린
// 지평선이 화면에서 기울어 한 y로 못 그린다(6-R1 [1]이 잡은 기울임 픽스처의 어긋남 —
// D-L97 한계·DEFERRED). 판정은 범주 + 실측 각도(#49)다. 값 자체는 원장 필드가 든다(#47).
import { test, expect } from "@playwright/test";
import { setupConfirmed } from "./fixture.js";
import { ONE_POINT_TOL } from "../src/s3d/onePoint.js";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 지평선 행의 잉크 캔버스 덮임 비율 — 8px 걸음으로 그 행을 훑어 칠해진 표본의 비다. */
const horizonRowCoverage = (page: import("@playwright/test").Page, y: number) =>
  page.evaluate((yy) => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const ctx = el.getContext("2d")!;
    const dpr = el.width / el.clientWidth;
    const w = el.clientWidth;
    let hit = 0, n = 0;
    // 지평선은 파선(6 on/4 off)이라 표본 창을 6px 폭으로 둔다 — 간격(4px)보다 넓어
    // 파선 어느 위상에서도 최소 1px은 잡힌다(창이 좁으면 덮임이 위상 잡음이 된다)
    for (let x = 4; x < w - 10; x += 8) {
      n++;
      const d = ctx.getImageData(Math.round(x * dpr), Math.round((yy - 2) * dpr),
                                 Math.ceil(6 * dpr), Math.ceil(5 * dpr)).data;
      let m = 0;
      for (let i = 3; i < d.length; i += 4) m = Math.max(m, d[i]);
      if (m > 8) hit++;
    }
    return { row_y: yy, hit, n, ratio: n ? hit / n : 0 };  // row_y — 어느 행을 훑었는지 원장이 든다(R2 [N2])
  }, y);

/** 상태·각도·버튼을 한 번에 — 판정 단위(각도 #49)와 상태 표시(버튼 6-d)를 원장이 든다. */
const stateNow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('#bar button[data-act="draft"]');
    return { state: window.S2S.viewState(), judge: window.S2S.draftJudge(),
             draft_btn_enabled: btn ? !btn.disabled : null };
  });

test("작도 화면 복귀 — 돌린 뒤 소실점·지평선·그리기가 돌아온다 (14차 항목 6)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const led: Record<string, unknown> = {};

  led.setup = await setupConfirmed(page, { pitch: 0 });   // **직립 그린 축**(머리말)
  expect((led.setup as any).lifted).toBeGreaterThan(0);

  // ---- ⓪ 확정 직후 — 작도 화면(핀). 지평선 전폭 · 복귀 버튼 꺼짐
  const pinnedOverlay = await page.evaluate(() => window.S2S.draftOverlay());
  led.pinned = await stateNow(page);
  expect((led.pinned as any).state).toBe("draft_pinned");
  expect((led.pinned as any).draft_btn_enabled).toBe(false);        // 작도에서는 꺼져 있다(6-d)
  expect((pinnedOverlay as any).horizonY).not.toBeNull();
  led.pinned_horizon_row = await horizonRowCoverage(page, (pinnedOverlay as any).horizonY);
  expect((led.pinned_horizon_row as any).ratio).toBeGreaterThan(0.8);

  // ---- ① 급한 내려보기 궤도(버튼 경로) → 모델링: 실측 피치 임계 밖 · 버튼 켜짐 · 덮임 소멸
  const setPose = (py: number, ty: number) => page.evaluate(([yy, tt]) => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    camT.position.set(1.8, yy, 2.4);
    const ctl = S.stage.viewport.controls;
    ctl.target.set(0.6, tt, -4.2);
    ctl.update();
    camT.updateMatrixWorld(true);
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click();
    S.refresh();
  }, [py, ty]);
  await setPose(6.0, 0.4);
  led.model = await stateNow(page);
  expect((led.model as any).state).toBe("model");
  expect(Math.abs((led.model as any).judge.pitchDeg))
    .toBeGreaterThan(ONE_POINT_TOL.hand_deg);                        // **각도로 잰 모델링**(#49)
  expect((led.model as any).draft_btn_enabled).toBe(true);           // 모델링에서 켜진다(6-d·f)
  led.model_horizon_row = await horizonRowCoverage(page, (pinnedOverlay as any).horizonY);
  expect((led.model_horizon_row as any).ratio).toBeLessThan(0.2);

  // ---- ② 모델링에서는 안 그려진다(6-e) — 획 수 불변 + 복귀 안내
  const frameBox = (await page.locator("#frame").boundingBox())!;
  const strokesBefore = await page.evaluate(() => window.S2S.doc().strokes.length);
  await page.mouse.move(frameBox.x + 180, frameBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 320, frameBox.y + 210, { steps: 5 });
  await page.mouse.up();
  led.model_blocked = await page.evaluate((n) => ({
    strokes_before: n, strokes_after: window.S2S.doc().strokes.length,
    note_mentions_return: /모델링 화면/.test(window.S2S.snapNote() ?? "") }), strokesBefore);
  expect((led.model_blocked as any).strokes_after).toBe(strokesBefore);
  expect((led.model_blocked as any).note_mentions_return).toBe(true);

  // ---- ①′ 얕은 내려보기(모델링) — **지평선이 화면 안일 자세**에서도 그 행이 비어 있다:
  //      덮임 0의 원인이 "화면 밖"이 아니라 **표시 게이트**임을 가른다(6-R1 [7])
  await setPose(1.6, 0.4);                                           // 완만한 내려보기
  led.model_shallow = await stateNow(page);
  expect((led.model_shallow as any).state).toBe("model");
  const shallowOv = await page.evaluate(() => window.S2S.draftOverlay());
  led.model_shallow_would_be_horizon = {
    y: (shallowOv as any)?.horizonY ?? null,
    on_screen: (shallowOv as any)?.horizonY != null
      && (shallowOv as any).horizonY > 0
      && (shallowOv as any).horizonY < (led.setup as any).canvas[1],
  };
  expect((led.model_shallow_would_be_horizon as any).on_screen).toBe(true);
  led.model_shallow_horizon_row = await horizonRowCoverage(page, (shallowOv as any).horizonY);
  expect((led.model_shallow_horizon_row as any).ratio).toBeLessThan(0.2);

  // ---- ③ 「작도 시점으로」 → 2점 작도. 실측 피치 ≈ 0 · 소실점·지평선·주점의 정합(6-c)
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="draft"]')!.click();
  });
  await page.waitForTimeout(450);                                    // snapToDir 280ms + 여유
  led.returned = await stateNow(page);
  expect((led.returned as any).state).toBe("draft_two");
  expect(Math.abs((led.returned as any).judge.pitchDeg)).toBeLessThan(0.1);  // **피치를 접었다**
  expect((led.returned as any).judge.yawOffDeg).toBeGreaterThan(ONE_POINT_TOL.hand_deg); // 요는 축 사이
  expect((led.returned as any).draft_btn_enabled).toBe(false);       // 작도 복귀 — 버튼이 도로 꺼진다
  const ov = await page.evaluate(() => window.S2S.draftOverlay());
  led.returned_overlay = {
    horizon_y: (ov as any).horizonY,
    principal_y: (ov as any).principal[1],
    vps_h: [(ov as any).vps[0], (ov as any).vps[1]],
    vps_h_finite: [(ov as any).vps[0], (ov as any).vps[1]].filter(Boolean).length,
    vp_vertical_infinite: (ov as any).vps[2] == null,                // 정확 복귀(피치 0)의 서명
    // **정합**(6-R1 [1]): 피치 0·직립 축이면 수평 소실점 둘의 y = 지평선 = 주점 행이다
    vps_y_gap: ((ov as any).vps[0] && (ov as any).vps[1])
      ? Math.abs((ov as any).vps[0][1] - (ov as any).vps[1][1]) : null,
    horizon_vs_principal: Math.abs((ov as any).horizonY - (ov as any).principal[1]),
  };
  expect((led.returned_overlay as any).vps_h_finite).toBe(2);
  expect((led.returned_overlay as any).vp_vertical_infinite).toBe(true);
  expect((led.returned_overlay as any).vps_y_gap).toBeLessThan(1);
  expect((led.returned_overlay as any).horizon_vs_principal).toBeLessThan(1);
  led.returned_horizon_row = await horizonRowCoverage(page, (ov as any).horizonY);
  expect((led.returned_horizon_row as any).ratio).toBeGreaterThan(0.8);

  // ---- ④ 복귀한 2점 시점에서 그리기·스냅이 돈다
  const aimAtLifted = async () => {
    const target = await page.evaluate(async () => {
      const S = window.S2S;
      const vc = await import("/src/s3d/viewCamera.ts");
      const g3 = await import("/src/s3d/geom3d.ts");
      const pose = S.pose();
      const fi = S.stage.freeIntrinsics();
      const s0 = S.doc().strokes.filter((s: any) => s.seg3d)[0];
      const a = g3.project(vc.toView(pose, s0.seg3d[0]), fi.principal, fi.f);
      const b = g3.project(vc.toView(pose, s0.seg3d[1]), fi.principal, fi.f);
      return a && b ? { a, b: [a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5] } : null;
    });
    expect(target).not.toBeNull();
    const n0 = await page.evaluate(() => window.S2S.doc().strokes.length);
    await page.mouse.move(frameBox.x + (target as any).a[0] + 2, frameBox.y + (target as any).a[1] + 2);
    await page.mouse.down();
    await page.mouse.move(frameBox.x + (target as any).b[0], frameBox.y + (target as any).b[1], { steps: 5 });
    await page.mouse.up();
    return page.evaluate((n) => {
      const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
      return { strokes_grew: window.S2S.doc().strokes.length === n + 1,
               snap_start: st.snapStart ? st.snapStart.kind : null };
    }, n0);
  };
  led.draw_two_point = await aimAtLifted();
  expect((led.draw_two_point as any).strokes_grew).toBe(true);
  expect((led.draw_two_point as any).snap_start).not.toBeNull();

  // ---- ⑤ 큐브 면 탭(재탭 규칙 D-L76 — 지시 6-b) → 1점 작도 + **그 시점의 그리기·스냅**
  const cube = (await page.locator("#cube").boundingBox())!;
  const S_PX = cube.width * 0.22;
  await page.mouse.click(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.waitForTimeout(400);
  led.one_point = await stateNow(page);
  expect((led.one_point as any).state).toBe("draft_one");
  expect((led.one_point as any).judge.yawOffDeg).toBeLessThan(0.1);  // 요가 축으로 갔다
  const ov1 = await page.evaluate(() => window.S2S.draftOverlay());
  led.one_point_overlay = {
    horizon_y: (ov1 as any).horizonY,
    principal_y: (ov1 as any).principal[1],
    vps_h_finite: [(ov1 as any).vps[0], (ov1 as any).vps[1]].filter(Boolean).length,
    vp_vertical_infinite: (ov1 as any).vps[2] == null,
    horizon_vs_principal: Math.abs((ov1 as any).horizonY - (ov1 as any).principal[1]),
    // **1점의 서명은 "정렬 축 소실점 = 주점"이다** — 시선과 나란한 축의 소실점이 주점에
    // 온다(이론서 2.2). ⚠ "수평 유한 정확히 1"은 서명이 아니다: 측정된 두 수평축이
    // 정확히 직교가 아니라(검출 잔차) 직교 쪽 축의 소실점이 무한원 문턱 안 유한 원거리로
    // 남을 수 있다 — 유한 수는 기록만 한다
    aligned_vp_dist_to_principal: Math.min(
      ...[(ov1 as any).vps[0], (ov1 as any).vps[1]].filter(Boolean)
        .map((v: number[]) => Math.hypot(v[0] - (ov1 as any).principal[0],
                                         v[1] - (ov1 as any).principal[1]))),
  };
  expect((led.one_point_overlay as any).vps_h_finite).toBeGreaterThan(0);
  expect((led.one_point_overlay as any).aligned_vp_dist_to_principal).toBeLessThan(1);
  expect((led.one_point_overlay as any).vp_vertical_infinite).toBe(true);
  expect((led.one_point_overlay as any).horizon_vs_principal).toBeLessThan(1);
  led.one_point_horizon_row = await horizonRowCoverage(page, (ov1 as any).horizonY);
  expect((led.one_point_horizon_row as any).ratio).toBeGreaterThan(0.8);
  led.draw_one_point = await aimAtLifted();                     // 지시 g — 1점 쪽 스냅
  expect((led.draw_one_point as any).strokes_grew).toBe(true);
  expect((led.draw_one_point as any).snap_start).not.toBeNull();

  // ---- ⑥ 큐브 **모서리** 탭 → 2점 작도(지시 6-a "모서리가 2점" — 수평 모서리)
  await page.mouse.click(cube.x + cube.width / 2 + 0.8 * S_PX, cube.y + cube.height / 2);
  await page.waitForTimeout(400);
  led.edge_tap = await stateNow(page);
  expect((led.edge_tap as any).state).toBe("draft_two");
  expect(Math.abs((led.edge_tap as any).judge.pitchDeg)).toBeLessThan(0.1);
  const ovE = await page.evaluate(() => window.S2S.draftOverlay());
  led.edge_overlay = {
    vps_h_finite: [(ovE as any).vps[0], (ovE as any).vps[1]].filter(Boolean).length,
    vp_vertical_infinite: (ovE as any).vps[2] == null,
  };
  expect((led.edge_overlay as any).vps_h_finite).toBe(2);
  expect((led.edge_overlay as any).vp_vertical_infinite).toBe(true);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "draft_return.json"), JSON.stringify({
    spec: "14차 항목 6(D-L97) — 작도 화면 복귀 종단: 확정(핀 작도·버튼 꺼짐) → 급한 궤도(모델링 — 실측 피치 임계 밖·지평선 소멸·그리기 차단·버튼 켜짐) → 얕은 궤도(지평선이 화면 안일 자세에서도 덮임 0 — 표시 게이트의 귀속) → 「작도 시점으로」(2점 — 피치 실측 0·수평 소실점 y 일치=지평선=주점 행·재덮임·그리기·스냅) → 큐브 면 탭(1점 — D-L76 재탭·그리기·스냅) → 큐브 모서리 탭(2점). 합성 마우스 — 앱 버튼·큐브 경로 그대로(#17). 픽스처는 직립 그린 축(피치 0 확정)",
    what_this_does_not_say: [
      "**지평선 행 덮임(ratio)의 값은 픽스처 상수다**(#46) — 판정은 범주(작도 > thresholds.horizon_row_draft_min ↔ 모델링 < horizon_row_model_max)이고 두 문턱 사이 간격이 판별 간격이다. 이 픽스처에서 1/0으로 포화하는 것은 지평선이 전폭 파선이라는 구성의 귀결이다",
      "**동작점**(#12): 모델링 자세 둘(급함·얕음)·복귀 세 경로(버튼·면 탭·모서리 탭) 각 1회. 임의 요·피치 스윕은 안 돌렸고, 수직 응시 특이점은 draft_pose 단위 팔이 잰다. ⚠ **작도 밴드의 끝(피치 ≈ hand_deg)은 안 쟀다** — 게이트의 '수직축 무한원'은 **정확 복귀(피치 0)의 서명**이지 밴드 전체의 성질이 아니다(피치가 임계 안이라도 0이 아니면 수직 소실점이 유한 원거리일 수 있다 — 판정 상태와 무한원 표기는 그 경계에서 갈린다)",
      "**픽스처가 직립 그린 축(피치 0 확정)이다** — 그린 수직축이 기운 구도(3점)에서는 복귀 뷰(up = 세계 Y)의 그린 지평선이 화면에서 기울어 수평 소실점 둘의 y가 어긋나고, 한 y의 수평선 표시는 근사가 된다(6-R1 [1]이 기운 픽스처에서 실측한 어긋남 — D-L97 한계·DEFERRED. 이 원장의 정합 판정 vps_y_gap·horizon_vs_principal은 직립 픽스처의 것이다)",
      "**격자 픽셀은 안 잰다**(6-R1 [7]) — 표시 셋(소실점·지평선·격자) 중 잰 것은 지평선 행과 소실점 유한/무한원 가족뿐이다. 격자는 같은 게이트(drawBelowInk)와 같은 문맥(viewOverlayCtx)을 지나므로 배선은 공유하나, 칠해짐 자체의 실측은 없다",
      "**재탭 임계의 경계 스윕은 view_cube_hit 단위 팔(vitest)이 잰다**(R2 [N6] 정정 — 종단 경계 팔은 없다: view_cube.json ws의 그 문장 그대로) — 값은 view_cube.json의 ui_constants.CUBE_TOL.retap_cos 필드가 든다(#47). 여기서는 '실제로 도는가'(지시 6-b)만 잰다",
      "**복귀 뒤 각도·정합의 near-zero/정확 0(피치 ~1e-15·요 이탈 정확 0 — 축 스냅의 귀결 · vps_y_gap 0·주점 정합 ~1e-13)은 정확 스냅의 보장 서명이다**(selfcheck near-zero 플래그의 원인 — §5): snapToDir가 정확한 방향으로 돌리고 픽스처 축이 정확 직교라 잔차가 부동소수 꼬리뿐이다. 판정 임계(pitch_return_max_deg 0.1·coherence_max_px 1)는 그 보장이 깨졌을 때(스냅이 다른 프레임으로 가거나 표시가 다른 출처를 쓸 때)를 가르는 배선 여유다 — 정확도 측정이 아니다",
      "드로잉 차단(②)은 **획 수 불변**으로 잰다 — 포인터 캡처 자체를 안 하므로 잉크 표시가 없는 것은 구성의 귀결이다(보장 — #5)",
    ],
    /** 판별자(왕복) 한 자리 — gate.reachability_source가 이 필드를 가리킨다(#40 값 대조). */
    horizon_row_roundtrip: [
      (led.pinned_horizon_row as any).ratio,
      (led.model_horizon_row as any).ratio,
      (led.returned_horizon_row as any).ratio,
    ],
    /**
     * 판정 임계의 출처(6-R1 [5]): `ONE_POINT_TOL.hand_deg`는 test/constants.ts **밖**이라
     * 전역 해시가 못 잡는다 — 값을 여기 싣고, **바뀌면 이 원장을 재실행한다**
     * (one_point_direct.json의 algo_constants와 같은 규약). ⚠ 이 상수는 이제 **두 판정**
     * (손 정렬 자동 스냅 발동 · 작도/모델링 구분)을 정한다 — D-L97의 결합 기록.
     */
    algo_constants: { ONE_POINT_TOL: { ...ONE_POINT_TOL } },
    thresholds: { horizon_row_draft_min: 0.8, horizon_row_model_max: 0.2,
      pitch_return_max_deg: 0.1, yaw_snap_max_deg: 0.1, coherence_max_px: 1,
      settle_ms: 450, console_errors_max: 0,
      note: "e2e 배선 임계라 SHARED_CONSTANTS 비등재(D-L51 사유 — 전역 해시 눈사태). 값은 이 원장이 자기 안에 든다" },
    gate: gate({
      registered: "⓪ 확정 직후 draft_pinned·복귀 버튼 꺼짐·지평선 행 덮임 > horizon_row_draft_min · ① 급한 궤도 뒤 model·실측 |pitchDeg| > hand_deg·버튼 켜짐·같은 행 덮임 < horizon_row_model_max · ② model에서 획 시작 차단(획 수 불변·안내 문구) · ①′ 얕은 궤도(지평선이 화면 안)에서도 덮임 < model_max — 소멸의 귀속은 표시 게이트다 · ③ 「작도 시점으로」 뒤 draft_two·|pitchDeg| < pitch_return_max_deg·요는 축 사이·버튼 꺼짐·수평 유한 2·수직 무한원(정확 복귀의 서명 — 밴드 전체의 성질이 아니다)·수평 소실점 y 격차 < coherence_max_px·지평선 = 주점 행(± coherence_max_px)·재덮임 · ④ 2점 시점에서 3D 끝점 겨냥 획이 붙고 획 수가 는다 · ⑤ 면 탭 뒤 draft_one·요 이탈 < yaw_snap_max_deg·정렬 축 소실점 = 주점(± coherence_max_px — 유한 수는 기록만: 직교 잔차로 둘일 수 있다)·지평선 = 주점 행·같은 그리기·스냅 · ⑥ 모서리 탭 뒤 draft_two·수평 유한 2 · 콘솔 오류 0. ⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "판별자는 지평선 행 덮임의 **왕복**(draft → model → draft — horizon_row_roundtrip)과 획 수(차단 0 ↔ 복원 +1)와 **실측 각도**(model의 pitchDeg > hand_deg ↔ 복귀의 pitchDeg < 0.1 — 판정이 쓰는 단위 #49)다(#28 — 셋 다 적는다). 표시 게이트가 죽으면(옛 판: 핀 전용) ③⑤의 재덮임이 model 쪽 값에 머물고, 복귀가 죽으면 pitchDeg가 안 접힌다",
      reachability_value: [
        (led.pinned_horizon_row as any).ratio,
        (led.model_horizon_row as any).ratio,
        (led.returned_horizon_row as any).ratio,
      ],
      reachability_source: "horizon_row_roundtrip",
      // ⚠ 값이 정확히 [1, 0, 1]로 포화한다(#40 ② 플래그 자리 — selfcheck가 잡는 것이
      // 맞고 원인은 이것이다 §5) — 지평선 행이 전폭 파선이라 덮임이 전부/전무로 갈리는
      // 구성의 귀결이고, 판정은 크기가 아니라 **문턱 횡단의 왕복**이다. 각도 판별자
      // (model/returned의 judge.pitchDeg)는 포화하지 않는 연속량이다.
      reachability_value_fixture_determined: true,
    }),
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
