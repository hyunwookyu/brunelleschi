// **화면 팬 대 공간 팬**(2026-08-18 10차 항목 5) — 지시 문면 그대로:
// "그리는 중에는 화면 팬(뷰 오프셋), 궤도 후에는 공간 팬."
//
// 재는 것:
//   ⓪ **카메라 전(P0)**의 두 손가락도 종이 밀기다 — "그리는 중"은 핀 상태만이 아니라
//      카메라가 서기 전 전부다(mainL screenPan의 조건: isPinned || !standing).
//   ① 핀 상태(그리는 중)의 두 손가락 = **종이 밀기** — 카메라(공간)·문서(pts2d)는 불변이고
//      표시 오프셋(viewPan)만 쌓인다. 핀이 안 풀린다. **Camera.principal(문서 좌표의
//      주점 — 복원의 값)도 불변이다** — viewPan이 옮기는 것은 three 표시 창뿐이다.
//   ② 3D 층이 잉크 층과 **같이 민다** — three 카메라의 투영이 정확히 viewPan만큼 이동한다
//      (stage.setViewPan이 주점을 옮긴 창을 다시 건다 — sceneCam 산식).
//   ③ 입력이 표시를 되돌린다 — 밀린 화면에서 끝점의 **표시 위치**를 겨냥해 그으면
//      문서 좌표의 그 끝점에 스냅된다(InkCanvas.local이 오프셋을 뺀다 — 같은 훅, #17).
//   ③″ **화면 줌**(2026-08-19 14차 항목 5 · D-L94) — 핀 상태의 핀치·휠 = 종이 확대.
//      카메라·문서·주점 불변, viewZoom만 쌓인다(달리가 아니다). 3D 층이 같은 배율로
//      확대되고(three 투영 = 문서×z + 팬), 조리개는 **표시 px**다(D-L56 — 판별 팔 포함).
//   ④ 궤도로 풀린 뒤의 두 손가락 = **공간 팬**(종전 그대로) — viewPan은 안 움직인다.
import { test, expect, type Page } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

async function pointer(page: Page, ev: {
  type: "pointerdown" | "pointermove" | "pointerup";
  id: number; kind: "touch" | "pen"; x: number; y: number;
}) {
  await page.evaluate((e) => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(e.type, {
      pointerId: e.id, pointerType: e.kind, isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + e.x, clientY: r.top + e.y, buttons: e.type === "pointerup" ? 0 : 1,
      pressure: e.type === "pointerup" ? 0 : 0.5,
    }));
  }, ev);
}

/** 두 손가락을 **나란히** (dx, dy)만큼 민다 — 거리 불변이라 핀치 성분이 없다. */
async function twoFingerPan(page: Page, ids: [number, number], dx: number, dy: number) {
  await pointer(page, { type: "pointerdown", id: ids[0], kind: "touch", x: 500, y: 400 });
  await pointer(page, { type: "pointerdown", id: ids[1], kind: "touch", x: 560, y: 400 });
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    await pointer(page, { type: "pointermove", id: ids[0], kind: "touch",
                          x: 500 + dx * t, y: 400 + dy * t });
    await pointer(page, { type: "pointermove", id: ids[1], kind: "touch",
                          x: 560 + dx * t, y: 400 + dy * t });
  }
  await pointer(page, { type: "pointerup", id: ids[0], kind: "touch", x: 500 + dx, y: 400 + dy });
  await pointer(page, { type: "pointerup", id: ids[1], kind: "touch", x: 560 + dx, y: 400 + dy });
}

/** 두 손가락을 **벌린다/오므린다** — 중점 고정, 거리 d0 → d1(핀치 성분만). */
async function twoFingerPinch(page: Page, ids: [number, number],
                              cx: number, cy: number, d0: number, d1: number) {
  await pointer(page, { type: "pointerdown", id: ids[0], kind: "touch", x: cx - d0 / 2, y: cy });
  await pointer(page, { type: "pointerdown", id: ids[1], kind: "touch", x: cx + d0 / 2, y: cy });
  for (let i = 1; i <= 6; i++) {
    const d = d0 + (d1 - d0) * (i / 6);
    await pointer(page, { type: "pointermove", id: ids[0], kind: "touch", x: cx - d / 2, y: cy });
    await pointer(page, { type: "pointermove", id: ids[1], kind: "touch", x: cx + d / 2, y: cy });
  }
  await pointer(page, { type: "pointerup", id: ids[0], kind: "touch", x: cx - d1 / 2, y: cy });
  await pointer(page, { type: "pointerup", id: ids[1], kind: "touch", x: cx + d1 / 2, y: cy });
}

/** 3D 획 하나의 첫 끝점이 three 카메라로 화면 어디에 오는가(css px). */
const projectFirst = (page: Page) => page.evaluate(() => {
  const S = window.S2S;
  const st = S.doc().strokes.find((s: any) => s.seg3d)!;
  const c = S.stage.viewport.camera;
  c.updateMatrixWorld(true);
  const p = st.seg3d[0];
  const v = new (c.position.constructor)(p[0], -p[1], -p[2]).project(c);
  const el = document.getElementById("ink") as HTMLCanvasElement;
  return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight,
           id: st.id };
});

test("화면 팬 — 그리는 중엔 종이가 밀리고, 궤도 뒤엔 공간이 민다 (10차 항목 5)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const led: Record<string, unknown> = {};

  // ---- ⓪ **카메라 전(P0) 화면 팬**(리뷰어 4차 [9]) — 서기 전에도 두 손가락은 종이다
  const p0Before = await page.evaluate(() => ({
    standing: window.S2S.cam.standing(), pan: window.S2S.viewPan(), pose: window.S2S.camPose(),
  }));
  await twoFingerPan(page, [11, 12], 30, 20);
  const p0After = await page.evaluate(() => ({
    standing: window.S2S.cam.standing(), pan: window.S2S.viewPan(), pose: window.S2S.camPose(),
  }));
  led.p0_screen_pan = { standing_before: (p0Before as any).standing,
                        standing_after: (p0After as any).standing,
                        pan_before: (p0Before as any).pan, pan_after: (p0After as any).pan,
                        // 게이트의 "카메라 불개방"에 대응하는 값(리뷰어 5차 [11]) —
                        // standing 불변만으로는 "제스처가 자세를 안 건드렸다"가 아니다
                        pose_moved: Math.abs((p0After as any).pose.azimuth - (p0Before as any).pose.azimuth)
                                  + Math.abs((p0After as any).pose.polar - (p0Before as any).pose.polar)
                                  + Math.abs((p0After as any).pose.dist - (p0Before as any).pose.dist) };
  expect((led.p0_screen_pan as any).standing_before).toBe(false);
  expect((led.p0_screen_pan as any).standing_after).toBe(false);   // 카메라가 안 열렸다
  expect((led.p0_screen_pan as any).pose_moved).toBe(0);           // 자세도 안 건드렸다
  expect((led.p0_screen_pan as any).pan_after[0]).toBeCloseTo(30, 0);
  expect((led.p0_screen_pan as any).pan_after[1]).toBeCloseTo(20, 0);
  // 이후 팔들이 (60,40)을 기준으로 재도록 되돌린다 — 픽스처 획도 문서 (0,0) 기준으로 긋는다
  await page.evaluate(() => window.S2S.setViewPan([0, 0]));

  led.setup = await setupConfirmed(page);
  expect((led.setup as any).lifted).toBeGreaterThan(0);

  // ---- ① 핀 상태 두 손가락 — 종이 팬. 카메라·문서 불변
  const before = await page.evaluate(() => ({
    pose: window.S2S.camPose(),
    pan: window.S2S.viewPan(),
    principal: [...window.S2S.cam.ctx().principal],
    pts0: window.S2S.doc().strokes[0].pts2d.map((p: number[]) => [...p]),
  }));
  const proj0 = await projectFirst(page);
  await twoFingerPan(page, [21, 22], 60, 40);
  const after = await page.evaluate(() => ({
    pose: window.S2S.camPose(),
    pan: window.S2S.viewPan(),
    principal: [...window.S2S.cam.ctx().principal],
    pts0: window.S2S.doc().strokes[0].pts2d.map((p: number[]) => [...p]),
  }));
  const proj1 = await projectFirst(page);
  led.screen_pan = {
    pan_before: (before as any).pan, pan_after: (after as any).pan,
    pinned_before: (before as any).pose.pinned, pinned_after: (after as any).pose.pinned,
    pose_moved: Math.abs((after as any).pose.azimuth - (before as any).pose.azimuth)
              + Math.abs((after as any).pose.polar - (before as any).pose.polar)
              + Math.abs((after as any).pose.dist - (before as any).pose.dist),
    doc_moved: Math.hypot((after as any).pts0[0][0] - (before as any).pts0[0][0],
                          (after as any).pts0[0][1] - (before as any).pts0[0][1]),
    // **Camera.principal 불변**(리뷰어 4차 [8]) — 복원(이론서 6.3·16.2의 주점)은 문서
    // 좌표의 값이고 viewPan이 옮기는 것은 three 표시 창(pinTo의 principal+viewPan)뿐이다
    principal_moved: Math.hypot((after as any).principal[0] - (before as any).principal[0],
                                (after as any).principal[1] - (before as any).principal[1]),
    three_shift: [proj1.x - proj0.x, proj1.y - proj0.y],
  };
  expect((led.screen_pan as any).pinned_after).toBe(true);          // **핀이 안 풀렸다**
  expect((led.screen_pan as any).pose_moved).toBe(0);               // 공간 불변
  expect((led.screen_pan as any).doc_moved).toBe(0);                // 문서 불변 — 표시만 민다
  expect((led.screen_pan as any).principal_moved).toBe(0);          // 복원의 주점 불변
  expect((led.screen_pan as any).pan_after[0]).toBeCloseTo(60, 0);
  expect((led.screen_pan as any).pan_after[1]).toBeCloseTo(40, 0);
  // **3D 층이 잉크와 같이 밀렸다** — 투영 이동 = viewPan(±0.5px)
  expect(Math.abs((led.screen_pan as any).three_shift[0] - 60)).toBeLessThan(0.5);
  expect(Math.abs((led.screen_pan as any).three_shift[1] - 40)).toBeLessThan(0.5);

  // ---- ③ 밀린 화면에서 그리기 — 표시 위치를 겨냥하면 문서의 그 점에 스냅된다
  const target = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes.find((s: any) => s.seg3d)!;
    const g = S.cam.ctx();
    const p = st.seg3d[0];
    const scr = [g.principal[0] + (g.f * p[0]) / p[2], g.principal[1] + (g.f * p[1]) / p[2]];
    const pan = S.viewPan();
    return { doc: scr, display: [scr[0] + pan[0], scr[1] + pan[1]] };
  });
  await pointer(page, { type: "pointerdown", id: 31, kind: "pen",
                        x: (target as any).display[0], y: (target as any).display[1] });
  for (let i = 1; i <= 5; i++) {
    await pointer(page, { type: "pointermove", id: 31, kind: "pen",
                          x: (target as any).display[0] + i * 20, y: (target as any).display[1] + i * 0.4 });
  }
  await pointer(page, { type: "pointerup", id: 31, kind: "pen",
                        x: (target as any).display[0] + 100, y: (target as any).display[1] + 2 });
  led.draw_panned = await page.evaluate((tgt) => {
    const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
    return { snap_start: st.snapStart ? st.snapStart.kind : null,
             start_doc_gap: Math.hypot(st.pts2d[0][0] - tgt.doc[0], st.pts2d[0][1] - tgt.doc[1]),
             // **판별의 실체**(리뷰어 4차 [6]): 겨냥한 표시 위치와 문서 끝점의 거리 = |pan|.
             // 스냅은 저장된 좌표를 돌려주므로 start_doc_gap<1은 스냅이 문 순간 자동이다 —
             // 재는 것은 **되돌린 입력이 스냅 조리개(8px) 안에 들어갔다는 사실**이고,
             // 안 되돌리면 |pan|≈72px만큼 어긋나 스냅이 못 문다(snap_start=null로 실패)
             aim_display_offset: Math.hypot(60, 40) };
  }, target as any);
  // 표시 위치를 겨냥했는데 **문서 좌표의 끝점**에 붙었다 — 입력 되돌림이 배선됐다
  expect(["endpoint", "vertex"]).toContain((led.draw_panned as any).snap_start);
  expect((led.draw_panned as any).start_doc_gap).toBeLessThan(1);
  // 겨냥 어긋남(≈72px)이 조리개(8px)를 훨씬 넘는다 — 되돌림 없이는 스냅이 불가능한 구도다
  expect((led.draw_panned as any).aim_display_offset).toBeGreaterThan(OSNAP_RADIUS_PX * 3);

  // ---- ③′ **되돌림의 직접 실측**(리뷰어 4차 [6] — 스냅 없는 팔): 스냅 대상이 없는
  //      빈 자리의 표시 좌표를 겨냥해 그으면 pts2d = 표시 − viewPan 이어야 한다
  const rawAim: [number, number] = [880, 160];
  await pointer(page, { type: "pointerdown", id: 32, kind: "pen", x: rawAim[0], y: rawAim[1] });
  for (let i = 1; i <= 5; i++) {
    await pointer(page, { type: "pointermove", id: 32, kind: "pen",
                          x: rawAim[0] + i * 16, y: rawAim[1] + i * 0.3 });
  }
  await pointer(page, { type: "pointerup", id: 32, kind: "pen", x: rawAim[0] + 80, y: rawAim[1] + 1.5 });
  led.draw_raw = await page.evaluate((aim) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    const pan = S.viewPan();
    return { snap_start: st.snapStart ? st.snapStart.kind : null,
             start: [...st.pts2d[0]],
             pan_at_draw: [...pan],                                 // 이 팔의 동작점(리뷰어 5차 [9])
             expected: [aim[0] - pan[0], aim[1] - pan[1]],
             gap: Math.hypot(st.pts2d[0][0] - (aim[0] - pan[0]),
                             st.pts2d[0][1] - (aim[1] - pan[1])),
             // 되돌림이 **안** 됐을 때의 격차 — 위 gap의 판별 간격이 실측으로 원장에 남는다
             gap_if_unreverted: Math.hypot(st.pts2d[0][0] - aim[0], st.pts2d[0][1] - aim[1]) };
  }, rawAim);
  expect((led.draw_raw as any).snap_start).toBeNull();              // 스냅이 안 낀 원 입력이다
  expect((led.draw_raw as any).gap).toBeLessThan(1);                // pts2d = 표시 − viewPan
  // 되돌림 없이는 |pan|≈72px — gap 0이 자명하지 않다는 것을 같은 실행이 든다
  expect((led.draw_raw as any).gap_if_unreverted).toBeGreaterThan(OSNAP_RADIUS_PX * 3);

  // ---- ③″ **화면 줌**(2026-08-19 14차 항목 5 · D-L94): 핀 상태의 핀치 = 종이 확대.
  //      f를 바꾸는 달리가 아니다 — 카메라·문서·주점 불변, 표시 배율(viewZoom)만 쌓인다.
  //      옛 판은 이 배율을 **버렸다**(위 ①의 팬 갈래가 dolly 성분을 무시) — 핀 상태에
  //      줌이 없어서 확대하려면 궤도로 풀 수밖에 없었다(사용자 보고의 원인).
  {
    // 잉크 층 픽셀 대조용 2D 픽스처 획(리뷰어 [15]) — 핀치 중심 근처라 z=2에서도 표시 안이다.
    // 실제 저장 좌표(pts2d)를 아래에서 다시 읽으므로 스냅이 끼어도 무방하다.
    await pointer(page, { type: "pointerdown", id: 55, kind: "pen", x: 430, y: 370 });
    for (let i = 1; i <= 5; i++) {
      await pointer(page, { type: "pointermove", id: 55, kind: "pen", x: 430 + i * 20, y: 370 + i * 0.5 });
    }
    await pointer(page, { type: "pointerup", id: 55, kind: "pen", x: 530, y: 372.5 });
    const inkFix = await page.evaluate(() => {
      const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
      return { mid: [...st.pts2d[Math.floor(st.pts2d.length / 2)]] };
    });
    const PINCH_C: [number, number] = [480, 380];
    const z0 = await page.evaluate(() => ({
      zoom: window.S2S.viewZoom(), pan: window.S2S.viewPan(), pose: window.S2S.camPose(),
      principal: [...window.S2S.cam.ctx().principal],
      pts0: window.S2S.doc().strokes[0].pts2d.map((p: number[]) => [...p]),
    }));
    await twoFingerPinch(page, [51, 52], PINCH_C[0], PINCH_C[1], 120, 240); // 비 2.0
    const z1 = await page.evaluate(() => ({
      zoom: window.S2S.viewZoom(), pan: window.S2S.viewPan(), pose: window.S2S.camPose(),
      principal: [...window.S2S.cam.ctx().principal],
      pts0: window.S2S.doc().strokes[0].pts2d.map((p: number[]) => [...p]),
    }));
    const projZ = await projectFirst(page);
    const docPt = await page.evaluate(() => {
      const S = window.S2S;
      const st = S.doc().strokes.find((s: any) => s.seg3d)!;
      const g = S.cam.ctx();
      const p = st.seg3d[0];
      const vp = S.cam.vps().find((v: any) => v);
      return { pt: [g.principal[0] + (g.f * p[0]) / p[2], g.principal[1] + (g.f * p[1]) / p[2]],
               vp: vp ? [vp[0], vp[1]] : null };
    });
    const zc = (z1 as any).zoom, pan = (z1 as any).pan;
    const z0z = (z0 as any).zoom, z0p = (z0 as any).pan;
    led.screen_zoom = {
      zoom_before: z0z, zoom_after: zc,
      pan_before_zoom: z0p, pan_after_zoom: pan,               // 팬은 고정점 유지로 **움직인다**
      pinch_center_display: PINCH_C,
      // **핀치 중점이 고정점이다**(리뷰어 [1] — 원장 밖 주장이었다): 중점 아래 문서점
      // (C−팬)/z 이 핀치 전후 같아야 한다. 문서 px 격차 실측.
      fixed_point_gap: Math.hypot(
        (PINCH_C[0] - pan[0]) / zc - (PINCH_C[0] - z0p[0]) / z0z,
        (PINCH_C[1] - pan[1]) / zc - (PINCH_C[1] - z0p[1]) / z0z),
      pinned_after: (z1 as any).pose.pinned,
      pose_moved: Math.abs((z1 as any).pose.azimuth - (z0 as any).pose.azimuth)
                + Math.abs((z1 as any).pose.polar - (z0 as any).pose.polar)
                + Math.abs((z1 as any).pose.dist - (z0 as any).pose.dist),
      doc_moved: Math.hypot((z1 as any).pts0[0][0] - (z0 as any).pts0[0][0],
                            (z1 as any).pts0[0][1] - (z0 as any).pts0[0][1]),
      // **Camera.principal 불변**(리뷰어 [4]) — 줌은 팬보다 되쓰기 위험이 크다(주점' = z·주점)
      principal_moved: Math.hypot((z1 as any).principal[0] - (z0 as any).principal[0],
                                  (z1 as any).principal[1] - (z0 as any).principal[1]),
      // **3D 층이 같은 배율로 확대됐다** — three 투영 = 문서×z + 팬(±0.5px)
      three_gap: Math.hypot(projZ.x - ((docPt as any).pt[0] * zc + pan[0]),
                            projZ.y - ((docPt as any).pt[1] * zc + pan[1])),
      // z를 **안** 곱했을 때의 격차(리뷰어 [3] — draw_raw.gap_if_unreverted 선례): 실측
      // projZ 와 비배율 예측(문서+팬)의 거리 — three 층 배선이 죽으면 three_gap이 이 값이 된다
      three_gap_if_unscaled: Math.hypot(projZ.x - ((docPt as any).pt[0] + pan[0]),
                                        projZ.y - ((docPt as any).pt[1] + pan[1])),
      // ⚠ **설계 보장이지 독립 측정이 아니다**(#5 유형 3 — 리뷰어 [3]): 소실점 표시 좌표를
      // 시험 코드가 같은 아핀(vp×z+팬)으로 계산하므로, three_gap이 서면 이 값은 대수적으로
      // 그 이하다(전개하면 두 식이 같다). 임계를 걸지 않고 값만 남긴다(CLAUDE.md §5).
      vp_relative_gap: (docPt as any).vp
        ? Math.hypot(
            (((docPt as any).vp[0] * zc + pan[0]) - projZ.x)
              - zc * ((docPt as any).vp[0] - (docPt as any).pt[0]),
            (((docPt as any).vp[1] * zc + pan[1]) - projZ.y)
              - zc * ((docPt as any).vp[1] - (docPt as any).pt[1]))
        : null,
      view_zoom_lim: await page.evaluate(() => window.S2S.viewZoomLim()), // 클램프 대조(리뷰어 [11])
    };
    expect((led.screen_zoom as any).pinned_after).toBe(true);       // 핀이 안 풀렸다
    expect((led.screen_zoom as any).pose_moved).toBe(0);            // 공간 불변 — 달리가 아니다
    expect((led.screen_zoom as any).doc_moved).toBe(0);             // 문서 불변
    expect((led.screen_zoom as any).principal_moved).toBe(0);       // 복원의 주점 불변
    expect((led.screen_zoom as any).zoom_after).toBeGreaterThan(1.8);
    expect((led.screen_zoom as any).zoom_after).toBeLessThan(2.2);
    expect((led.screen_zoom as any).fixed_point_gap).toBeLessThan(0.5);
    expect((led.screen_zoom as any).three_gap).toBeLessThan(0.5);
    expect((led.screen_zoom as any).three_gap_if_unscaled).toBeGreaterThan(50); // 판별 간격
    // **잉크 층이 실제로 확대돼 그려졌다**(리뷰어 [15] — 픽셀 대조): 픽스처 획 중간점의
    // **배율 표시 위치**(문서×z+팬)에 칠이 있다. 비배율 위치와의 거리가 판별 간격이다.
    led.ink_zoom_pixels = await page.evaluate((args) => {
      const [mx, my, zz, px, py] = args;
      const el = document.getElementById("ink") as HTMLCanvasElement;
      const ctx = el.getContext("2d")!;
      const dpr = el.width / el.clientWidth;                        // 시험은 dpr 1(#21)
      const sampleMax = (x: number, y: number) => {
        const r = 3, d = ctx.getImageData(Math.round((x - r) * dpr), Math.round((y - r) * dpr),
                                          Math.ceil(2 * r * dpr) + 1, Math.ceil(2 * r * dpr) + 1);
        let m = 0;
        for (let i = 3; i < d.data.length; i += 4) m = Math.max(m, d.data[i]);
        return m;
      };
      const sx = mx * zz + px, sy = my * zz + py;
      return { scaled_display: [sx, sy], painted_alpha: sampleMax(sx, sy),
               gap_if_unscaled: Math.hypot(sx - (mx + px), sy - (my + py)) };
    }, [(inkFix as any).mid[0], (inkFix as any).mid[1], zc, pan[0], pan[1]]);
    expect((led.ink_zoom_pixels as any).painted_alpha).toBeGreaterThan(0);
    expect((led.ink_zoom_pixels as any).gap_if_unscaled).toBeGreaterThan(50);
    // **확대된 화면에서 그리기** — 끝점의 표시 위치(문서×z+팬)를 겨냥하면 문서 그 점에
    // 스냅되고, 조리개는 **표시 px**다(D-L56 확대·축소 무관): z=2에서 표시 12px 어긋난
    // 겨냥은 문서 6px인데도 안 붙어야 한다(문서 px 조리개라면 붙는다 — 판별 팔).
    const disp: [number, number] = [(docPt as any).pt[0] * zc + pan[0],
                                    (docPt as any).pt[1] * zc + pan[1]];
    const drawFrom = async (id: number, at: [number, number]) => {
      await pointer(page, { type: "pointerdown", id, kind: "pen", x: at[0], y: at[1] });
      for (let i = 1; i <= 5; i++) {
        await pointer(page, { type: "pointermove", id, kind: "pen",
                              x: at[0] + i * 24, y: at[1] + i * 0.5 });
      }
      await pointer(page, { type: "pointerup", id, kind: "pen", x: at[0] + 120, y: at[1] + 2.5 });
      return page.evaluate(() => {
        const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
        return { snap_start: st.snapStart ? st.snapStart.kind : null, start: [...st.pts2d[0]] };
      });
    };
    const nearAim = await drawFrom(61, [disp[0] + 6, disp[1]]);     // 표시 6px 안 — 붙는다
    led.zoom_draw_near = { ...(nearAim as any),
      doc_gap: Math.hypot((nearAim as any).start[0] - (docPt as any).pt[0],
                          (nearAim as any).start[1] - (docPt as any).pt[1]) };
    expect(["endpoint", "vertex"]).toContain((led.zoom_draw_near as any).snap_start);
    expect((led.zoom_draw_near as any).doc_gap).toBeLessThan(1);
    const farAim = await drawFrom(62, [disp[0] + 12, disp[1]]);     // 표시 12px — 조리개 밖
    led.zoom_draw_far = { snap_start: (farAim as any).snap_start,
      // 되돌림 검산: pts2d = (표시 − 팬)/z — 문서 6px 지점(±1px)
      doc_offset: Math.hypot((farAim as any).start[0] - (docPt as any).pt[0],
                             (farAim as any).start[1] - (docPt as any).pt[1]) };
    expect((led.zoom_draw_far as any).snap_start).toBeNull();       // **표시 px 조리개다**
    expect((led.zoom_draw_far as any).doc_offset).toBeGreaterThan(5);
    expect((led.zoom_draw_far as any).doc_offset).toBeLessThan(7);
    // **z=2에서 되돌림의 정밀도**(리뷰어 [9] — ③′의 줌 대응 팔): 스냅 없는 빈 자리의
    // 표시 좌표를 겨냥하면 pts2d = (표시 − 팬)/z 이어야 한다. 스냅이 안 낀 원 입력의 실측.
    const rawAim2: [number, number] = [940, 60];                    // 문서 ≈ (650, 180) — 빈 자리
    const rawZ = await drawFrom(63, rawAim2);
    led.zoom_draw_raw = {
      snap_start: (rawZ as any).snap_start, start: (rawZ as any).start,
      zoom_at_draw: zc, pan_at_draw: pan,
      gap: Math.hypot((rawZ as any).start[0] - (rawAim2[0] - pan[0]) / zc,
                      (rawZ as any).start[1] - (rawAim2[1] - pan[1]) / zc),
      // /z 나눗셈이 죽었을 때의 격차(판별 간격 — draw_raw.gap_if_unreverted 선례)
      gap_if_undivided: Math.hypot((rawZ as any).start[0] - (rawAim2[0] - pan[0]),
                                   (rawZ as any).start[1] - (rawAim2[1] - pan[1])),
    };
    expect((led.zoom_draw_raw as any).snap_start).toBeNull();
    expect((led.zoom_draw_raw as any).gap).toBeLessThan(1);
    expect((led.zoom_draw_raw as any).gap_if_undivided).toBeGreaterThan(100);
    // **휠도 화면 줌이다**(핀 상태 데스크톱) — 카메라 불개방·커서가 고정점(리뷰어 [1])
    const WHEEL_C: [number, number] = [480, 380];
    const w0 = await page.evaluate(() => ({ zoom: window.S2S.viewZoom(), pan: window.S2S.viewPan(),
                                            pose: window.S2S.camPose() }));
    await page.evaluate((c) => {
      const el = document.getElementById("ink") as HTMLCanvasElement;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, bubbles: true, cancelable: true,
                                                 clientX: r.left + c[0], clientY: r.top + c[1] }));
    }, WHEEL_C);
    const w1 = await page.evaluate(() => ({ zoom: window.S2S.viewZoom(), pan: window.S2S.viewPan(),
                                            pose: window.S2S.camPose() }));
    led.wheel_zoom = { zoom_before: (w0 as any).zoom, zoom_after: (w1 as any).zoom,
                       pinned_after: (w1 as any).pose.pinned,
                       cursor_display: WHEEL_C,
                       // 커서 아래 문서점 (C−팬)/z 의 휠 전후 격차 — 고정점 실측(문서 px)
                       fixed_point_gap: Math.hypot(
                         (WHEEL_C[0] - (w1 as any).pan[0]) / (w1 as any).zoom
                           - (WHEEL_C[0] - (w0 as any).pan[0]) / (w0 as any).zoom,
                         (WHEEL_C[1] - (w1 as any).pan[1]) / (w1 as any).zoom
                           - (WHEEL_C[1] - (w0 as any).pan[1]) / (w0 as any).zoom) };
    expect((led.wheel_zoom as any).zoom_after).toBeGreaterThan((led.wheel_zoom as any).zoom_before);
    expect((led.wheel_zoom as any).pinned_after).toBe(true);        // 휠이 핀을 안 푼다
    expect((led.wheel_zoom as any).fixed_point_gap).toBeLessThan(0.5);
    // **z<1(축소) 동작점**(리뷰어 [11] — #12: 확대 한쪽뿐이었다): 축소에서는 문서 조리개
    // = radiusPx/z 가 **커진다** — 표시 6px 겨냥은 문서 12px인데 표시 px 조리개(8px)라
    // **붙는다**. 문서 px 조리개(8px)였다면 12>8이라 거부 — 확대 팔과 반대 방향의 판별이다.
    await page.evaluate(() => window.S2S.setViewZoom(1));           // 배율만 1로(팬 유지)
    await twoFingerPinch(page, [56, 57], PINCH_C[0], PINCH_C[1], 240, 120); // 비 0.5 — 축소
    const zo = await page.evaluate(() => ({ zoom: window.S2S.viewZoom(), pan: window.S2S.viewPan(),
                                            pose: window.S2S.camPose() }));
    const zoDisp: [number, number] = [
      (docPt as any).pt[0] * (zo as any).zoom + (zo as any).pan[0],
      (docPt as any).pt[1] * (zo as any).zoom + (zo as any).pan[1]];
    const outAim = await drawFrom(64, [zoDisp[0] + 6, zoDisp[1]]);  // 표시 6px = 문서 12px
    led.zoom_out_draw = {
      zoom_at_draw: (zo as any).zoom, pinned_after: (zo as any).pose.pinned,
      snap_start: (outAim as any).snap_start,
      // 겨냥의 문서 어긋남 — 조리개 판정이 실제로 받은 값(표시 6px ÷ z)
      aim_doc_offset: 6 / (zo as any).zoom,
      doc_gap: Math.hypot((outAim as any).start[0] - (docPt as any).pt[0],
                          (outAim as any).start[1] - (docPt as any).pt[1]) };
    expect((led.zoom_out_draw as any).zoom_at_draw).toBeGreaterThan(0.45);
    expect((led.zoom_out_draw as any).zoom_at_draw).toBeLessThan(0.55);
    expect((led.zoom_out_draw as any).aim_doc_offset).toBeGreaterThan(OSNAP_RADIUS_PX); // 문서 조리개면 거부되는 구도
    expect(["endpoint", "vertex"]).toContain((led.zoom_out_draw as any).snap_start);    // 그런데 붙었다 — 표시 px다
    expect((led.zoom_out_draw as any).doc_gap).toBeLessThan(1);
    // 다음 팔(④ 공간 팬)을 팬 동작점에서 재도록 배율·오프셋을 ①의 실측값 그대로 되돌린다
    // (리터럴 [60,40]이 아니라 — 제스처 누적의 부동소수 끝자리까지 같아야 ④의 등호가 선다)
    await page.evaluate((p) => { window.S2S.setViewZoom(1); window.S2S.setViewPan(p); },
                        (led.screen_pan as any).pan_after);
  }

  // ---- ④ 궤도로 풀린 뒤 — 두 손가락은 **공간 팬**이고 viewPan은 안 움직인다
  await pointer(page, { type: "pointerdown", id: 41, kind: "touch", x: 500, y: 400 });
  for (let i = 1; i <= 6; i++) {
    await pointer(page, { type: "pointermove", id: 41, kind: "touch", x: 500 + i * 20, y: 400 + i * 5 });
  }
  await pointer(page, { type: "pointerup", id: 41, kind: "touch", x: 620, y: 430 });
  await page.waitForTimeout(400);                                   // 감쇠 꼬리
  const orbit0 = await page.evaluate(() => ({ pose: window.S2S.camPose(), pan: window.S2S.viewPan() }));
  expect((orbit0 as any).pose.pinned).toBe(false);                  // 궤도가 실제로 풀렸다
  await twoFingerPan(page, [42, 43], 50, 0);
  await page.waitForTimeout(400);
  const orbit1 = await page.evaluate(() => ({ pose: window.S2S.camPose(), pan: window.S2S.viewPan() }));
  led.space_pan = {
    pan_unchanged: (orbit1 as any).pan,
    target_moved: Math.hypot(
      (orbit1 as any).pose.target[0] - (orbit0 as any).pose.target[0],
      (orbit1 as any).pose.target[1] - (orbit0 as any).pose.target[1],
      (orbit1 as any).pose.target[2] - (orbit0 as any).pose.target[2]),
  };
  expect((led.space_pan as any).pan_unchanged).toEqual((led.screen_pan as any).pan_after);
  expect((led.space_pan as any).target_moved).toBeGreaterThan(0.01); // **공간이 움직였다**

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "view_pan.json"), JSON.stringify({
    spec: "10차 항목 5(팬) + 14차 항목 5(줌 — D-L94) — 화면 팬·줌 대 공간 조작: 핀 상태(그리는 중)의 두 손가락 이동·핀치·휠은 종이를 밀고 확대하며(카메라·문서·주점 불변 — 표시 오프셋·배율만), 3D 층이 같은 아핀으로 따라오고, 입력은 배율·오프셋을 되돌려 문서 좌표에 스냅된다(조리개는 표시 px — D-L56). 궤도로 풀린 뒤에는 종전의 공간 팬·달리다. 합성 PointerEvent — 앱 라우터를 그대로 지난다(#17)",
    what_this_does_not_say: [
      "⛔ (14차 항목 5로 닫힘) ~~핀치(줌)의 화면/공간 구분은 안 다뤘다~~ — ③″ 팔이 든다. 남은 것: 핀치·휠의 **감도 곡선**(배율 한계의 체감 — 값은 screen_zoom.view_zoom_lim 필드가 든다. 측정 최대 zoom≈2.26·최소≈0.5는 클램프 [0.2, 8]에 안 닿았다)은 실기 확인의 문이고, 잉크 층 선 굵기가 배율을 따라 확대되는데 3D 층 화면 굵기는 불변이라 배율≠1에서 두 층의 굵기가 갈린다(알려진 표시 한계 — D-L94·DEFERRED 14차 행)",
      "**vp_relative_gap은 독립 측정이 아니다**(#5 유형 3 — 리뷰어 [3]): 소실점의 표시 좌표를 시험 코드가 three_gap과 같은 아핀(×z+팬)으로 계산하므로 three_gap이 서면 대수적으로 그 이하다. 임계를 안 걸고 값만 남긴다(§5 — 보장이면 임계를 걸지 않는다). 독립 판별은 three_gap_if_unscaled(비배율 대안값)와 잉크 픽셀 팔이 진다",
      "**잉크 픽셀 팔은 배율 위치에 칠이 있다는 것만 잰다** — 비배율 위치의 공백은 안 잰다(그 자리에 다른 획이 있을 수 있어 공백 단언이 픽스처 의존이 된다). 판별 간격은 gap_if_unscaled(배율↔비배율 위치 거리)가 든다",
      "**줌 팔의 정확 0·near-zero는 selfcheck가 플래그하는 자리들이고 원인은 셋이다**(§5 — 각 플래그의 원인 확인): ① zoom_draw_near·zoom_out_draw의 doc_gap 0 = 스냅이 저장 좌표를 돌려주는 설계 보장(③ start_doc_gap과 같은 성격 — 판정은 snap_start의 붙음/거부가 진다) ② zoom_draw_raw.gap 0 = expected가 같은 산식의 중복 계산(#5 유형 3 — draw_raw 주석과 같은 성격. 판별은 gap_if_undivided가 진다) ③ fixed_point_gap의 near-zero = 배선 판정 — 중점·커서가 엉뚱한 좌표계(예: 문서 좌표)로 setViewZoom에 들어가면 고정점이 어긋나 커진다. 정확도 임계가 아니다",
      "화면 밖 소실점 가장자리 표식·잠정 그리드의 클리핑은 **문서 좌표의 화면 사각형** 기준 그대로다 — 팬이 크면 표식이 표시 밖으로 나갈 수 있다(표시 결함이지 좌표 결함이 아니다. DEFERRED)",
      "**③의 start_doc_gap<1은 되돌림의 정밀도를 재지 않는다**(리뷰어 4차 [6] · #5) — 스냅이 저장된 좌표를 돌려주므로 문 순간 격차는 자동으로 준다. ③이 재는 것은 되돌린 입력이 조리개(8px) 안에 들었다는 **성패**(겨냥 어긋남 ≈72px ≫ 8px라 되돌림 없이는 불가능)이고, 되돌림의 **수치 자체**는 ③′(draw_raw — 스냅 없는 팔)의 gap<1px이 잰다",
      "P0 팔(⓪)은 viewPan 축적과 카메라 불개방만 본다 — P0에는 3D 층·pinTo가 없어 three_shift 대응 확인이 성립하지 않는다",
      "dpr 1·합성 터치의 확인이다(#21·AS-C1) — 실기(아이패드)의 두 손가락 감각은 실기 확인의 문이다. **두 손가락 = 종이 밀기라는 의도 해석 자체도 전제다**(AS-L39)",
      "three_shift의 ±0.5px는 투영 산식 차(three 행렬 ↔ principal+f·x/z)의 부동소수 여유다 — 정확도 임계가 아니라 배선 판정이다(#5)",
      "**화면 팬의 동작점은 (30,20)과 (60,40) 둘이고, 각 판정은 그중 하나 위에만 서 있다**(#12 — 리뷰어 5차 [9]: 초판의 '(50,0) 포함 셋'은 과대다 — (50,0)은 궤도 후 공간 팬 팔의 손짓 크기라 viewPan 동작점이 아니다). P0 팔은 (30,20)·핀 팔들은 (60,40) 하나씩이다. 누적 한계(화면 몇 배를 밀 수 있는가)·큰 팬에서의 표식 클리핑은 안 쟀다(후자는 DEFERRED)",
      "**draw_raw의 expected는 시험 대상과 같은 산식(표시 − viewPan)/z 을 시험 코드에서 중복 계산한 값이다**(#5 유형 3 — 리뷰어 5차 [10]): 이 팔이 가르는 것은 **배선**(안 되돌리면 gap = gap_if_unreverted ≈ 72px — 같은 실행이 그 대안 격차를 실측으로 든다)이지 산식 자체의 옳음이 아니다. ⚠ 14차 정정(리뷰어 [14]): 초판의 'gap 0 정수 산술 정확 일치'는 /z 나눗셈 도입으로 깨졌다 — 현행 gap은 ~2e-13(부동소수 꼬리)이고 '그대로'가 아니라 산술 경로가 바뀐 것이다",
    ],
    thresholds: { three_shift_tol_px: 0.5, start_doc_gap_max_px: 1, draw_raw_gap_max_px: 1,
      aim_offset_min_px: OSNAP_RADIUS_PX * 3, space_pan_target_moved_min: 0.01, console_errors_max: 0,
      // 14차 ③″(리뷰어 [13] — 산문에만 있던 셋을 필드로): 줌 팔의 판정 값 전부
      zoom_band: [1.8, 2.2], zoom_out_band: [0.45, 0.55], zoom_affine_tol_px: 0.5,
      zoom_fixed_point_tol_px: 0.5, zoom_aim_display_near_px: 6, zoom_aim_display_far_px: 12,
      zoom_counterfactual_min_px: { three_unscaled: 50, ink_unscaled: 50, draw_undivided: 100 },
      note: "e2e 배선 임계라 SHARED_CONSTANTS 비등재(D-L51·basic_flow thresholds와 같은 사유 — 전역 해시 눈사태). 값은 이 원장이 자기 안에 든다" },
    gate: {
      registered: "카메라 전 두 손가락: viewPan 축적·카메라 불개방 · 핀 상태 두 손가락 뒤: 핀 유지·pose 불변·문서 불변·주점(Camera.principal) 불변·viewPan≈(60,40)·three 투영 이동=viewPan(±0.5px) · 밀린 화면에서 끝점 표시 위치를 겨냥한 획이 문서 끝점에 스냅(끝점/정점·문서 격차<1px·겨냥 어긋남>24px) · 스냅 없는 자리의 획: pts2d=표시−viewPan(<1px) · **[14차 ③″] 핀 상태 핀치(비 2.0): 핀 유지·pose 0·문서 0·주점 0·viewZoom∈zoom_band·핀치 중점 고정점(문서 <0.5px)·three 투영=문서×z+팬(±0.5px, 비배율 대안값 >50px)·잉크 층 배율 위치에 칠(픽셀 대조) · 확대 화면 그리기: 표시 6px 겨냥 스냅·표시 12px(문서 6px) 겨냥 불스냅·스냅 없는 자리 pts2d=(표시−팬)/z(<1px, /z 부재 대안값 >100px) · 휠(핀): viewZoom 증가·핀 유지·커서 고정점(문서 <0.5px) · 축소(비 0.5): 표시 6px(문서 12px) 겨냥이 붙는다(문서 px 조리개면 12>8 거부 — 반대 방향 판별)** · 궤도 후 두 손가락: target 이동>0.01·viewPan 불변 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "궤도 후 팔(④)이 음성 대조이고 **판별자는 둘이다**(#28 — 리뷰어 4차 [7]): (a) viewPan 불변(pan_unchanged == screen_pan.pan_after — 화면 팬이 아무 데서나 받으면 여기가 움직여 실패) (b) target_moved>0.01(같은 손짓이 공간 팬으로 갔다는 양성 증거). 수치 하나를 고르면 (b)다 — (a)는 등호 판정이라 값이 판별 간격을 안 보여 준다",
      reachability_value: (led.space_pan as any).target_moved,
      reachability_source: "space_pan/target_moved",
      // [14차 ③″]의 도달 가능성(리뷰어 [12] — #40 ⑥: 조항을 더했으면 값도 더한다):
      // 각 판별이 무엇이었으면 반대로 넘어졌는지의 실측 대안값들
      reachability_zoom: {
        aperture_doc_would_attach: { value: (led.zoom_draw_far as any).doc_offset, threshold: OSNAP_RADIUS_PX,
          note: "확대 팔: 문서 px 조리개였다면 6<8이라 붙는다 — 불스냅이 판별" },
        aperture_doc_would_reject: { value: (led.zoom_out_draw as any).aim_doc_offset, threshold: OSNAP_RADIUS_PX,
          note: "축소 팔: 문서 px 조리개였다면 12>8이라 거부 — 스냅이 판별(반대 방향)" },
        three_gap_if_unscaled: (led.screen_zoom as any).three_gap_if_unscaled,
        draw_gap_if_undivided: (led.zoom_draw_raw as any).gap_if_undivided,
        ink_gap_if_unscaled: (led.ink_zoom_pixels as any).gap_if_unscaled,
      },
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
