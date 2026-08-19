// **작도 화면 복귀 종단**(2026-08-19 14차 항목 6 · D-L97).
//
// 사용자 보고의 회귀 팔: "화면이 돌아간 순간부터 모델링 화면이 된다. 소실점과 지평선이
// 사라지고 그리기가 안 되며 돌아올 길이 없다." 재는 것(지시 6-g — 1점·2점 각각):
//   ⓪ 확정 직후(핀) — 작도 화면: 지평선이 화면 전폭으로 깔려 있다(픽셀 대조).
//   ① 임의 각도(급한 내려보기)로 돌리면 **모델링 화면**: 지평선 행 덮임이 무너진다.
//   ② 모델링 화면에서는 **안 그려진다**(지시 6-e) — 획 수 불변, 복귀 안내가 나온다.
//   ③ 「작도 시점으로」 버튼 → **2점 작도 시점**(피치를 접고 요 유지 — 지시 6-a):
//      소실점·지평선이 그 시점 값으로 다시 나오고(지시 6-c) 수직축 소실점은 무한원이다.
//   ④ 복귀한 시점에서 **그리기·스냅이 돈다** — 3D 끝점의 이 시점 화면 좌표를 겨냥하면 붙는다.
//   ⑤ 큐브 면 탭(재탭 규칙 D-L66) → **1점 작도 시점**(지시 6-b): 유한 수평 소실점 가족이
//      하나로 줄고 상태가 draft_one이다.
//
// 판정은 **범주**다(#46 — 요·피치·픽스처 좌표는 상수): 상태 전환(viewState)·지평선 행
// 덮임의 유무·획 수 불변·스냅 붙음. 값 자체는 원장 필드가 든다(#47).
import { test, expect } from "@playwright/test";
import { setupConfirmed } from "./fixture.js";
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
    return { hit, n, ratio: n ? hit / n : 0 };
  }, y);

test("작도 화면 복귀 — 돌린 뒤 소실점·지평선·그리기가 돌아온다 (14차 항목 6)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const led: Record<string, unknown> = {};

  led.setup = await setupConfirmed(page);
  expect((led.setup as any).lifted).toBeGreaterThan(0);

  // ---- ⓪ 확정 직후 — 작도 화면(핀). 지평선이 화면 전폭으로 깔려 있다
  const pinnedOverlay = await page.evaluate(() => window.S2S.draftOverlay());
  led.pinned_state = await page.evaluate(() => window.S2S.viewState());
  expect(led.pinned_state).toBe("draft_pinned");
  expect((pinnedOverlay as any).horizonY).not.toBeNull();
  led.pinned_horizon_row = await horizonRowCoverage(page, (pinnedOverlay as any).horizonY);
  expect((led.pinned_horizon_row as any).ratio).toBeGreaterThan(0.8);

  // ---- ① 임의 각도로 돌린다(궤도 버튼 경로 + 급한 내려보기 — 어느 기준계로도 모델링) →
  //      지평선 행 덮임이 무너진다("소실점과 지평선이 사라지고"의 실측)
  await page.evaluate(() => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    camT.position.set(1.8, 6.0, 2.4);
    const ctl = S.stage.viewport.controls;
    ctl.target.set(0.6, 0.4, -4.2);
    ctl.update();
    camT.updateMatrixWorld(true);
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click();
    S.refresh();
  });
  led.model_state = await page.evaluate(() => window.S2S.viewState());
  expect(led.model_state).toBe("model");
  led.model_horizon_row = await horizonRowCoverage(page, (pinnedOverlay as any).horizonY);
  expect((led.model_horizon_row as any).ratio).toBeLessThan(0.2);

  // ---- ② 모델링 화면에서는 안 그려진다(지시 6-e) — 획 수 불변 + 복귀 안내
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
  expect((led.model_blocked as any).note_mentions_return).toBe(true);  // 복귀 안내가 나왔다

  // ---- ③ 「작도 시점으로」 → 2점 작도 시점(요 유지·피치 접음). 소실점·지평선이 그 시점
  //      값으로 다시 나온다(지시 6-c — 표시 출처는 배치와 같은 frame()이다 #17)
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="draft"]')!.click();
  });
  await page.waitForTimeout(450);                          // snapToDir 280ms + 여유
  led.returned_state = await page.evaluate(() => window.S2S.viewState());
  expect(led.returned_state).toBe("draft_two");
  const ov = await page.evaluate(() => window.S2S.draftOverlay());
  led.returned_overlay = {
    horizon_y: (ov as any).horizonY,
    vps_h_finite: [(ov as any).vps[0], (ov as any).vps[1]].filter(Boolean).length,
    vp_vertical_infinite: (ov as any).vps[2] == null,      // **피치 0의 서명** — 수직축 무한원
  };
  expect((led.returned_overlay as any).horizon_y).not.toBeNull();
  expect((led.returned_overlay as any).vps_h_finite).toBeGreaterThan(0);
  expect((led.returned_overlay as any).vp_vertical_infinite).toBe(true);
  led.returned_horizon_row = await horizonRowCoverage(page, (ov as any).horizonY);
  expect((led.returned_horizon_row as any).ratio).toBeGreaterThan(0.8);

  // ---- ④ 복귀한 시점에서 그리기·스냅이 돈다 — 3D 끝점의 이 시점 화면 좌표를 겨냥한다
  const target = await page.evaluate(async () => {
    const S = window.S2S;
    const vc = await import("/src/s3d/viewCamera.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const pose = S.pose();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const fi = S.stage.freeIntrinsics();
    const s0 = S.doc().strokes.filter((s: any) => s.seg3d)[0];
    const a = g3.project(vc.toView(pose, s0.seg3d[0]), fi.principal, fi.f);
    const b = g3.project(vc.toView(pose, s0.seg3d[1]), fi.principal, fi.f);
    return a && b ? { a, b: [a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5],
                      w: el.clientWidth, h: el.clientHeight } : null;
  });
  expect(target).not.toBeNull();
  await page.mouse.move(frameBox.x + (target as any).a[0] + 2, frameBox.y + (target as any).a[1] + 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + (target as any).b[0], frameBox.y + (target as any).b[1], { steps: 5 });
  await page.mouse.up();
  led.draw_after_return = await page.evaluate((n) => {
    const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
    return { strokes_grew: window.S2S.doc().strokes.length === n + 1,
             snap_start: st.snapStart ? st.snapStart.kind : null };
  }, strokesBefore);
  expect((led.draw_after_return as any).strokes_grew).toBe(true);   // **그리기가 돌아왔다**
  expect((led.draw_after_return as any).snap_start).not.toBeNull(); // **스냅이 돈다**

  // ---- ⑤ 큐브 면 탭(재탭 규칙 D-L66 — 지시 6-b) → 1점 작도 시점
  const cube = (await page.locator("#cube").boundingBox())!;
  await page.mouse.click(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.waitForTimeout(400);
  led.one_point_state = await page.evaluate(() => window.S2S.viewState());
  expect(led.one_point_state).toBe("draft_one");
  const ov1 = await page.evaluate(() => window.S2S.draftOverlay());
  led.one_point_overlay = {
    horizon_y: (ov1 as any).horizonY,
    vps_h_finite: [(ov1 as any).vps[0], (ov1 as any).vps[1]].filter(Boolean).length,
    vp_vertical_infinite: (ov1 as any).vps[2] == null,
  };
  // **1점의 서명** — 시선과 나란한 축의 소실점 하나만 화면 안 유한이다(다른 수평축은
  // 화면과 나란해 무한원·수직축도 무한원 — 이론서 2.2)
  expect((led.one_point_overlay as any).vps_h_finite).toBe(1);
  expect((led.one_point_overlay as any).vp_vertical_infinite).toBe(true);
  expect((led.one_point_overlay as any).horizon_y).not.toBeNull();
  led.one_point_horizon_row = await horizonRowCoverage(page, (ov1 as any).horizon_y ?? (ov1 as any).horizonY);
  expect((led.one_point_horizon_row as any).ratio).toBeGreaterThan(0.8);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "draft_return.json"), JSON.stringify({
    spec: "14차 항목 6(D-L97) — 작도 화면 복귀 종단: 확정(핀·작도) → 임의 궤도(모델링 — 지평선 소멸·그리기 차단) → 「작도 시점으로」(2점 복귀 — 소실점·지평선 재표시·그리기·스냅 복원) → 큐브 면 탭(1점 복귀 — D-L66 재탭). 합성 마우스 이벤트 — 앱 버튼·큐브 경로 그대로(#17)",
    what_this_does_not_say: [
      "**지평선 행 덮임(ratio)의 값은 픽스처 상수다**(#46) — 판정은 범주(작도 >0.8 ↔ 모델링 <0.2)이고 두 문턱 사이 간격이 판별 간격이다. 획이 그 행을 가로지르면 모델링 쪽이 0이 아니게 되는 것까지가 이 지표의 잡음 여유다",
      "**동작점이 하나씩이다**(#12) — 모델링 자세 한 종류(급한 내려보기)·복귀 두 경로(버튼·큐브 면 탭) 각 1회. 임의 요·피치 스윕은 안 돌렸고, 수직 응시 특이점(draftPose의 기본값 갈래)은 단위 팔이 잰다",
      "**viewState·draftOverlay는 앱의 같은 출처다**(#17 — viewOverlayCtx/frame()): 이 원장이 재는 것은 그 출처가 화면에 실제로 칠해지는가(지평선 행 픽셀)와 상태 전환·차단·복원의 범주다. 소실점 좌표의 참값 대조는 안 한다(그 수학은 viewCamera 단위 팔·이론서 2.2의 자리다)",
      "**1점 복귀의 큐브 탭은 면 중앙 클릭 하나다** — 재탭 임계(retap_cos 30°)의 경계 스윕은 view_cube 팔(basic_flow)이 잰다. 여기서는 '실제로 도는가'(지시 6-b의 물음)만 잰다",
      "드로잉 차단(②)은 **획 수 불변**으로 잰다 — 잉크 캔버스에 순간 표시가 있는지는 안 본다(포인터 캡처 자체를 안 하므로 구성상 없다 — 보장이지 측정이 아니다 #5)",
    ],
    /** 판별자(왕복) 한 자리 — gate.reachability_source가 이 필드를 가리킨다(#40 값 대조). */
    horizon_row_roundtrip: [
      (led.pinned_horizon_row as any).ratio,
      (led.model_horizon_row as any).ratio,
      (led.returned_horizon_row as any).ratio,
    ],
    thresholds: { horizon_row_draft_min: 0.8, horizon_row_model_max: 0.2,
      settle_ms: 450, console_errors_max: 0,
      note: "e2e 배선 임계라 SHARED_CONSTANTS 비등재(D-L51 사유 — 전역 해시 눈사태). 값은 이 원장이 자기 안에 든다" },
    gate: gate({
      registered: "⓪ 확정 직후 draft_pinned·지평선 행 덮임 > horizon_row_draft_min · ① 급한 내려보기 궤도 뒤 model·같은 행 덮임 < horizon_row_model_max · ② model에서 획 시작 차단(획 수 불변) · ③ 「작도 시점으로」 뒤 draft_two·수직축 소실점 무한원·수평 유한 ≥ 1·지평선 행 재덮임 · ④ 복귀 시점에서 3D 끝점 겨냥 획이 스냅으로 붙고 획 수가 는다 · ⑤ 큐브 면 탭 뒤 draft_one·수평 유한 정확히 1 · 콘솔 오류 0. ⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "판별자는 지평선 행 덮임의 **왕복**(draft >0.8 → model <0.2 → draft >0.8)과 획 수(차단 0 ↔ 복원 +1)다(#28 — 둘 다 적는다). 덮임 왕복이 수치 판별자다 — 표시 게이트가 죽으면(옛 판: 핀 전용) ③⑤의 재덮임이 model 쪽 값에 머문다",
      reachability_value: [
        (led.pinned_horizon_row as any).ratio,
        (led.model_horizon_row as any).ratio,
        (led.returned_horizon_row as any).ratio,
      ],
      reachability_source: "horizon_row_roundtrip",
      // ⚠ 값이 정확히 [1, 0, 1]로 포화한다(#40 ② 플래그 자리 — selfcheck가 잡는 것이
      // 맞고 원인은 이것이다 §5) — 이 픽스처에서 지평선 행은 전폭 파선이라 덮임이
      // 전부/전무로 갈리는 것이 구성의 귀결이고, 판정은 크기가 아니라 **문턱(0.8/0.2)
      // 횡단의 왕복**이다. 획이 그 행을 지나는 픽스처면 0·1이 아니게 된다(잡음 여유 —
      // what_this_does_not_say [0]).
      reachability_value_fixture_determined: true,
    }),
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
