// **7차 항목 1 — 복원 무대 재수립·궤도 진입 렌즈 유지** 종단 확인.
// 산출: `stage0/out/restore_pose.json`.
//
// 실획 첫 표본(2026-08-17 지시)이 잡은 자리다: 확정 뷰의 `pose === null`은 설계 표식
// (자세 항등 — doc.ts)이고 저장 누락이 아니었는데, **복원(`applyDoc2`)이 무대 카메라를
// 재수립하지 않아** 새로고침 뒤 three 카메라가 생성 기본 자세 `(3.2, 2.4, 3.6)`에 비핀으로
// 남았다. 그 상태에서 frame()·궤도·viewForDrawing이 전부 기본 자세를 읽는다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#21(회귀는 버그를 되살려 실패를 먼저 확인)** — 음성 팔이 그 되살림이다(기본 자세로
//   되돌려 같은 프로브를 잰다) · #5(배선 차 ≈ 0·투영행렬 불변은 같은 값 재적용의 **보장**이다
//   — 게이트가 아니라 **불변식 단언**으로 두고(viewCamera 머리말의 규약), 판별력은 음성
//   팔이 담당한다. 1-R′ 리뷰 [3] 대응) · #30(양성 채널 — 음성 팔이 실제로 커지는지 함께
//   본다) · #12(동작점: 확정 뷰·회전 시점 **두 상태** × 주점 **중심·중심 밖 0.23H** 두 배치 —
//   1-R′ [1] 대응: 실표본의 지평선 y=157이 중심 밖이다) · #37(주점의 출처는 이론서와
//   대조했다 — 2점은 [W/2, 지평선 y](16.2 가정 + A-4), 3점은 수심(6.3). `freeIntrinsics`는
//   **확정 해의 주점을 그대로** 이어받으므로 차수별 분기를 새로 만들지 않는다) ·
//   #22(복원 직후 캔버스 크기가 굳어 있을 수 있다 — applyDoc2가 쓰는 자리에서 자가 치유) ·
//   #25(수치는 이 원장에) · #40(게이트 수치+출처) · #28(자세 왕복 임계 1e-5의 사유 —
//   `samePose` 1e-6의 한 자릿수 위 배선 확인. `viewpoint_undo`의 1e-3은 감쇠 꼬리를 지나는
//   다른 경로라 자가 다르다 — 사유 병기).
//
// **이 확인이 말하지 않는 것**: 실획 재현(합성 픽스처다) · iPad 실기(dpr 1·데스크톱
// 뷰포트·합성 포인터다, #21) · IndexedDB가 없는 환경(사파리 프라이빗)의 복원 ·
// 숨은 탭에서 열린 복원(#22 — 자가 치유 경로는 카운터(SIZE_HEAL)로만 관측된다).
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";
import { setupConfirmed, wiringGapPx } from "./fixture.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const led: Record<string, unknown> = {};

declare global {
  interface Window { S2S: any; __SC: any }
}

/** 저장을 강제로 밀어내고(디바운스 우회) 새로고침 → 복원 완료까지 기다린다. */
async function saveAndReload(page: import("@playwright/test").Page) {
  await page.evaluate(async () => { await window.S2S.saveNow(); });
  await page.reload();
  await page.waitForFunction(() =>
    !!window.S2S && window.S2S.doc().strokes.length > 0);
}

test("복원 — 확정 뷰가 무대에 다시 물린다(재핀)", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  led.setup = await setupConfirmed(page);
  const before = await page.evaluate(() => ({
    pinned: window.S2S.camPose().pinned,
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length,
    currentView: window.S2S.currentView(),
  }));
  const gapBefore = await wiringGapPx(page);

  await saveAndReload(page);

  const after = await page.evaluate(() => ({
    pinned: window.S2S.camPose().pinned,
    poseNull: window.S2S.pose() === null,
    standing: window.S2S.standing(),
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length,
    currentView: window.S2S.currentView(),
    grid: window.S2S.showGrid(),
  }));
  const gapAfter = await wiringGapPx(page);

  // **사람 지시 1-b의 원장 증거**(1-R′ [8] 대응 — 산문이 아니라 값): 복원 직후 지평선이
  // 확정 카메라의 y에 보이고, 빈 지면을 겨냥한 스냅이 **확정 카메라 지면**(n·x = 1)의
  // 점을 내는가. on_face의 화면 거리는 정의상 0이라(#3) 여기서는 성공률이 아니라
  // **평면 잔차**(그 점이 실제로 그 지면 위인가)를 잰다.
  led.confirm_reads = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const h = S.horizon();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    // 지평선 아래·획이 없는 왼쪽 아래 — 정밀 후보가 없어 지면 스냅이 받는 자리
    const p: [number, number] = [el.clientWidth * 0.08, Math.min(el.clientHeight - 8, h.y + 220)];
    const c = S.snap(p);
    const g = g3.groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f);
    return {
      horizon: { visible: h.visible, y: +h.y.toFixed(2) },
      on_face_kind: c?.kind ?? null,
      on_face_plane_residual: c && c.kind === "on_face"
        ? Math.abs(g3.dot3(g.n, c.at) - g.d) : null,
    };
  });

  // **음성 팔 — 버그의 되살림**(#21·#30): 복원 누락이 남기던 그 상태(비핀·생성 기본 자세)로
  // 무대를 되돌리고 같은 프로브를 잰다. 이것이 커져야 위의 ≈0이 판별력 있는 배선 확인이다.
  const gapBugRevived = await page.evaluate(async () => {
    const S = window.S2S;
    S.stage.unpin(null);
    const camT = S.stage.viewport.camera;
    camT.position.set(3.2, 2.4, 3.6);                 // viewport.ts 생성 기본값
    S.stage.viewport.controls.target.set(0, 0, 0);
    S.stage.viewport.controls.update();
    camT.updateMatrixWorld(true);
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const w = el.clientWidth, h = el.clientHeight;
    const mvp = camT.projectionMatrix.clone().multiply(camT.matrixWorldInverse);
    let max = 0, n = 0;
    for (const s of S.doc().strokes) {
      if (!s.seg3d) continue;
      for (const p of s.seg3d) {
        const v = [p[0], -p[1], -p[2], 1];
        const e = mvp.elements;
        const cl = [0, 1, 2, 3].map(rw =>
          e[rw] * v[0] + e[4 + rw] * v[1] + e[8 + rw] * v[2] + e[12 + rw] * v[3]);
        const px = [w * (cl[0] / cl[3] + 1) / 2, h * (1 - cl[1] / cl[3]) / 2];
        const want = g3.project(p, ctx.principal, ctx.f);
        if (!want) continue;
        max = Math.max(max, Math.hypot(px[0] - want[0], px[1] - want[1]));
        n++;
      }
    }
    return { max, n };
  });

  led.restore_confirm = {
    before, after,
    wiring_gap_px: { before: gapBefore, after: gapAfter },
    negative_default_pose: {
      ...gapBugRevived,
      note: "복원 누락 버그의 되살림(#21) — 비핀·생성 기본 자세 (3.2,2.4,3.6)에서 같은 프로브. "
          + "수정 전 앱은 새로고침 뒤 이 상태였다(수정 전 실행에서 pinned=false로 이 시험이 실패했다).",
    },
  };

  expect(after.pinned).toBe(true);                    // **복원이 무대를 다시 물린다** — 수정의 본체
  expect(after.poseNull).toBe(true);                  // 확정 뷰 = 자세 항등(설계 표식 그대로)
  expect(after.lifted).toBe(before.lifted);
  // **불변식 단언**(#5 — 게이트 아님): 같은 확정 내적의 재적용이므로 구성상 ≈0이다.
  // 임계는 배선 오류(규약 뒤집힘·낡은 크기) 검출용이다 — stage.spec의 wiring_identity_px와 같은 자
  expect(gapAfter.max).toBeLessThan(1e-6);
  expect(gapBugRevived.max).toBeGreaterThan(50);      // 음성 팔이 실제로 벌어진다(#30)
  // 1-b의 원장 증거 — 지평선이 보이고, 지면 스냅이 확정 카메라 지면 위의 점을 낸다
  expect((led.confirm_reads as any).horizon.visible).toBe(true);
  expect((led.confirm_reads as any).on_face_kind).toBe("on_face");
  expect((led.confirm_reads as any).on_face_plane_residual).toBeLessThan(1e-9);
});

test("복원 — 저장된 시점(회전 뷰)이 자세 그대로 돌아온다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await setupConfirmed(page);
  // 결정론적 회전 시점: 뷰 큐브의 절대 스냅과 같은 경로(snapToDir, ms=0)로 자세를 만들고
  // `시점 저장`(앱 경로)으로 뷰에 담는다.
  const saved = await page.evaluate(() => {
    const S = window.S2S;
    S.stage.snapToDir([0.6, 0.35, -0.7], S.orbitCenter(), 0);
    S.saveViewpoint();
    return { pose: S.pose(), currentView: S.currentView(),
             views: S.doc().views.length };
  });
  expect(saved.pose).not.toBeNull();

  await saveAndReload(page);

  const after = await page.evaluate(() => ({
    pose: window.S2S.pose(),
    pinned: window.S2S.camPose().pinned,
    currentView: window.S2S.currentView(),
    views: window.S2S.doc().views.length,
  }));
  const flat = (p: any) => [...p.C, ...p.R[0], ...p.R[1], ...p.R[2]] as number[];
  const maxDiff = Math.max(...flat(after.pose).map((v, i) => Math.abs(v - flat(saved.pose)[i])));
  // **음성 팔**(1-R′ [2] 대응 — 세 번째 지표에도 도달 가능성 값): 수정 전 복원이 남기던
  // 기본 자세와 저장 자세의 차 — 같은 자(성분 최대 차)로 이 실행에서 잰다
  const defaultPoseDiff = await page.evaluate((savedPose) => {
    const S = window.S2S;
    const camT = S.stage.viewport.camera;
    const keep = { p: camT.position.clone(), q: camT.quaternion.clone(),
                   t: S.stage.viewport.controls.target.clone() };
    S.stage.unpin(null);
    camT.position.set(3.2, 2.4, 3.6);
    S.stage.viewport.controls.target.set(0, 0, 0);
    S.stage.viewport.controls.update();
    camT.updateMatrixWorld(true);
    const def = S.pose();
    const flat2 = (p: any) => [...p.C, ...p.R[0], ...p.R[1], ...p.R[2]] as number[];
    const d = Math.max(...flat2(def).map((v: number, i: number) =>
      Math.abs(v - flat2(savedPose)[i])));
    camT.position.copy(keep.p); camT.quaternion.copy(keep.q);
    S.stage.viewport.controls.target.copy(keep.t); S.stage.viewport.controls.update();
    camT.updateMatrixWorld(true);
    return d;
  }, saved.pose);
  led.restore_viewpoint = { saved_view: saved.currentView, restored_view: after.currentView,
                            views: after.views, pinned: after.pinned, pose_max_diff: maxDiff,
                            negative_default_pose_diff: defaultPoseDiff };
  expect(after.pinned).toBe(false);                   // 회전 시점은 핀이 아니다
  expect(after.currentView).toBe(saved.currentView);
  expect(maxDiff).toBeLessThan(1e-5);                 // setPose 왕복(§9.2)의 배선 확인(#28 사유는 머리말)
  expect(defaultPoseDiff).toBeGreaterThan(1);         // 음성 팔이 실제로 벌어진다(#30)
});

test("궤도 진입 — 렌즈(투영행렬)가 유지된다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await setupConfirmed(page);
  const r = await page.evaluate(async () => {
    const S = window.S2S;
    const camT = S.stage.viewport.camera;
    const proj0 = [...camT.projectionMatrix.elements];
    // **궤도 진입의 앱 경로 그대로**(#17) — 제스처 begin·`궤도(마우스)`가 부르는 그 함수다
    S.stage.unpin(S.orbitCenter());
    const proj1 = [...camT.projectionMatrix.elements];
    const freeIntr = S.stage.freeIntrinsics();
    // **음성 팔 — 옛 판의 되살림**(#21): 옛 unpin이 하던 45° 중심 주점 투영을 그대로 걸어
    // 성분 차를 잰다. 이것이 커야 위의 불변이 판별력 있는 확인이다(#30).
    // ⚠ 이 픽스처의 확정 주점은 정확히 화면 중심이라(1-R′ [1]) 이 값은 **f 항만의 차**다 —
    // 주점 항의 판별력은 아래 "주점 중심 밖" 시험의 음성 팔이 담당한다.
    const sc = await import("/src/s3d/sceneCam.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    sc.applyFreeAspect(camT, [el.clientWidth, el.clientHeight], 45);
    const projOld = [...camT.projectionMatrix.elements];
    const diff = (a: number[], b: number[]) =>
      Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    // 되돌린다 — 다음 시험이 이 상태를 물려받지 않게
    S.switchView(S.doc().views.find((v: any) => v.pose === null).id);
    return { keep_diff: diff(proj0, proj1), old_jump_diff: diff(proj0, projOld),
             freeIntr, ctx: { principal: S.cam.ctx().principal, f: S.cam.ctx().f } };
  });
  led.orbit_lens = {
    keep_diff: r.keep_diff, old_jump_diff: r.old_jump_diff,
    free_intr: r.freeIntr, confirmed_intr: r.ctx,
    note: "keep_diff = 궤도 진입 전후 투영행렬 최대 성분 차 — **freeIntrinsics가 핀 내적을 "
        + "그대로 이어받으므로 구성상 정확히 0이다(#5 보장 — 게이트 판정에 안 쓴다. 불변식 "
        + "단언만 건다).** old_jump_diff = 옛 판(FREE 45°·중심 주점)을 되살린 성분 차(#21의 "
        + "음성 팔 — 이 픽스처는 주점이 중심이라 f 항만의 차다. 1-R′ [1][3] 대응).",
  };
  // **불변식 단언**(#5) — 같은 내적의 재적용. 게이트 판정은 음성 팔·행동 결과가 한다
  expect(r.keep_diff).toBeLessThan(1e-9);
  expect(r.old_jump_diff).toBeGreaterThan(0.01);      // 옛 판은 실제로 점프했다(#30)
  // frame()이 읽는 내적 파라미터가 확정 카메라의 그것과 같다(#17 — 렌더와 배치 한 출처)
  expect(Math.abs(r.freeIntr.f - r.ctx.f)).toBeLessThan(1e-9);
  expect(Math.hypot(r.freeIntr.principal[0] - r.ctx.principal[0],
                    r.freeIntr.principal[1] - r.ctx.principal[1])).toBeLessThan(1e-9);
});

test("주점이 화면 중심 밖(지평선 0.23H) — 궤도 진입 렌즈·회전 시점 배치가 유지된다", async ({ page }) => {
  // **1-R′ [1](높음) 대응.** 실표본의 상태가 이쪽이다(지평선 y=157 ≈ 0.23H — 주점이 중심에서
  // ~180px 벗어난 2점 카메라). 위 시험들의 픽스처는 주점이 정확히 중심이라 주점 항의
  // 이어받기가 **구성상 0으로만** 지나갔다 — 여기서 그 절반을 실측한다(#12 동작점 추가).
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const r = await page.evaluate(async () => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const doc = await import("/src/ui/doc.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const vc = await import("/src/s3d/viewCamera.ts");
    const sc = await import("/src/s3d/sceneCam.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const W = el.clientWidth, H = el.clientHeight;
    const y = Math.round(H * 0.23);
    // 두 수평 소실점이 지평선 y 위 — 주점은 [W/2, y]로 선다(2점 가정, 이론서 16.2 + A-4)
    // 3D 획 하나(지면 y=1 위 깊이선)를 **확정 전에** 넣는다 — 배치·배선 프로브의 게이지
    const st = doc.newSStroke([[Math.round(W * 0.3), Math.round(y + 200)],
                               [Math.round(W * 0.45), Math.round(y + 120)]], S.doc().currentView);
    st.seg3d = [[0.2, 1, 3], [0.6, 1, 4.4]];
    st.axis = 1;
    S.doc().strokes.push(st);
    S.cam.loadRules({
      slots: [
        { kind: "vp", at: [W * 0.08, y], source: "two_lines", support: 2 },
        { kind: "vp", at: [W * 0.94, y], source: "horizon_x_line", support: 2 },
        null,
      ],
      horizon: y, waiting: [], depthLines: [], verticalLines: [],
    });
    S.confirmNow();
    const ctx = S.cam.ctx();
    const camT = S.stage.viewport.camera;
    const proj0 = [...camT.projectionMatrix.elements];
    // ---- 궤도 진입(앱 경로) → 렌즈 유지 · 옛 판 점프(이제 주점 항이 든다)
    S.stage.unpin(S.orbitCenter());
    const proj1 = [...camT.projectionMatrix.elements];
    const fi = S.stage.freeIntrinsics();
    // ---- 회전 시점에서 렌더 ↔ 배치(frame)의 투영이 같은가 — 배치가 그대로인가의 실측
    camT.position.set(1.4, -0.9, 1.8);
    S.stage.viewport.controls.target.set(-0.4, -1, -3.7);
    S.stage.viewport.controls.update();
    camT.updateMatrixWorld(true);
    const pose = S.pose();
    const ctxV = vc.viewPlaceCtx(pose, ctx.axisDirs, [W, H], 45, fi);
    const mvp = camT.projectionMatrix.clone().multiply(camT.matrixWorldInverse);
    let placeGap = 0;
    for (const p of st.seg3d!) {
      const v = [p[0], -p[1], -p[2], 1];
      const e = mvp.elements;
      const cl = [0, 1, 2, 3].map(rw =>
        e[rw] * v[0] + e[4 + rw] * v[1] + e[8 + rw] * v[2] + e[12 + rw] * v[3]);
      const px = [W * (cl[0] / cl[3] + 1) / 2, H * (1 - cl[1] / cl[3]) / 2];
      const want = g3.project(vc.toView(pose, p), ctxV.principal, ctxV.f);
      if (want) placeGap = Math.max(placeGap, Math.hypot(px[0] - want[0], px[1] - want[1]));
    }
    // ---- 음성 팔: 옛 판(45°·중심 주점) — 주점 오프셋이 실제로 점프를 만든다
    const projKeep = [...camT.projectionMatrix.elements];
    sc.applyFreeAspect(camT, [W, H], 45);
    const projOld = [...camT.projectionMatrix.elements];
    // 되돌린다
    camT.projectionMatrix.fromArray(projKeep);
    const diff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    return {
      principal: ctx.principal, f: ctx.f,
      principal_offset_px: Math.abs(ctx.principal[1] - H / 2),
      keep_diff: diff(proj0, proj1),
      old_jump_diff: diff(proj1, projOld),
      place_gap_px: placeGap,
      free_intr: fi,
    };
  });
  led.offcenter = {
    ...r,
    note: "주점 중심 밖(지평선 0.23H — 실표본의 상태)의 동작점(#12). place_gap_px = 회전 "
        + "시점에서 three 렌더와 배치 문맥(frame과 같은 viewPlaceCtx+freeIntrinsics)의 투영 차 — "
        + "렌더와 배치가 한 카메라라는 것의 실측(#17). old_jump_diff에는 이제 주점 항이 든다.",
  };
  expect(r.principal_offset_px).toBeGreaterThan(100); // 정말 중심 밖이다(동작점 확인)
  expect(r.keep_diff).toBeLessThan(1e-9);             // 불변식 단언(#5) — 주점 포함 이어받기
  expect(r.place_gap_px).toBeLessThan(1e-6);          // 렌더 ↔ 배치 한 카메라(#17)
  expect(r.old_jump_diff).toBeGreaterThan(0.1);       // 옛 판은 주점 항까지 점프했다(#30)
});

test.afterAll(() => {
  led.spec = "7차 항목 1 — 복원이 무대 카메라를 재수립하고, 궤도 진입이 확정 렌즈(주점 포함)를 유지한다";
  led.constants = constantsSnapshot();
  led.metric_defs = metricsSnapshot();
  led.what_this_does_not_say = [
    "실획 재현이 아니다 — 합성 상자·참 소실점 픽스처다(AS-C1)",
    "dpr 1·데스크톱 뷰포트 1440×900·합성 포인터다(#21) — iPad 실기는 안 덮는다",
    "wiring_gap ≈ 0 · keep_diff = 0 · place_gap ≈ 0은 **보장의 배선 확인(불변식 단언)**이다(#5) — " +
      "같은 내적 파라미터를 다시 적용한 결과이고, 게이트 판정이 아니다. 판별력은 음성 팔 넷" +
      "(negative_arms — 이 실행에서 잰 값)이 담당한다",
    "IndexedDB 부재 환경·숨은 탭 복원(#22 — 자가 치유는 SIZE_HEAL 카운터로만 관측)은 덮지 않는다",
    "P3(주점=수심, 이론서 6.3)의 이어받기는 같은 코드 경로(확정 해의 주점을 그대로)이나 이 원장에 " +
      "P3 동작점은 없다 — 픽스처가 2점까지다(#12의 남은 축, DEFERRED)",
  ];
  // **음성 팔 넷을 한 자리에** — selfcheck의 값 대조(#33·#40)가 한 경로로 푼다
  led.negative_arms = {
    values: [
      (led.restore_confirm as any).negative_default_pose.max,
      (led.restore_viewpoint as any).negative_default_pose_diff,
      (led.orbit_lens as any).old_jump_diff,
      (led.offcenter as any).old_jump_diff,
    ],
    note: "① 복원 누락 상태(비핀·기본 자세)의 배선 차(px) ② 같은 상태와 저장 시점 자세의 성분 차 "
        + "③ 옛 unpin(45°·중심 주점)의 투영행렬 성분 차 — 주점 중심 픽스처(f 항만) "
        + "④ 같은 되살림 — 주점 중심 밖 0.23H(주점 항 포함)",
  };
  led.gate = gate({
    registered: "⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2의 중단 조건(camera_gate)이 아니다(#41). "
      + "① 복원 직후 무대가 확정 카메라에 다시 물린다(pinned=true·확정 뷰 pose null 표식 유지) "
      + "② 저장된 회전 시점의 자세 왕복 차 < 1e-5(samePose 1e-6의 한 자릿수 위 배선 확인 — "
      + "viewpoint_undo의 1e-3은 감쇠 꼬리를 지나는 다른 경로다(#28 사유 병기)). "
      + "(배선 차·투영행렬 불변·주점 중심 밖의 렌더↔배치 투영 차(place_gap)의 ≈0은 같은 내적 "
      + "재적용의 **보장**이라 전부 게이트 밖이다 — 불변식 단언으로만 건다(#5, 2-R″ [5]로 "
      + "place_gap도 게이트에서 뺐다). 판별력은 음성 팔 넷이 담당한다)",
    reachability: "음성 팔 넷을 이 실행에서 쟀다(negative_arms) — 복원 누락 상태의 배선 차·"
      + "그 상태와 저장 자세의 성분 차·옛 unpin의 투영행렬 성분 차(주점 중심/중심 밖). "
      + "전부 통과선과 자릿수로 갈리므로 기준은 도달 가능하고 판별력이 있다",
    reachability_value: (led.negative_arms as any).values,
    reachability_source: "negative_arms/values",
    result: {
      pinned_after_reload: (led.restore_confirm as any).after.pinned,
      viewpoint_pose_max_diff: (led.restore_viewpoint as any).pose_max_diff,
    },
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "restore_pose.json"), JSON.stringify(led, null, 2));
});
