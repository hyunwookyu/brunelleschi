// **화면 팬 대 공간 팬**(2026-08-18 10차 항목 5) — 지시 문면 그대로:
// "그리는 중에는 화면 팬(뷰 오프셋), 궤도 후에는 공간 팬."
//
// 재는 것:
//   ① 핀 상태(그리는 중)의 두 손가락 = **종이 밀기** — 카메라(공간)·문서(pts2d)는 불변이고
//      표시 오프셋(viewPan)만 쌓인다. 핀이 안 풀린다.
//   ② 3D 층이 잉크 층과 **같이 민다** — three 카메라의 투영이 정확히 viewPan만큼 이동한다
//      (stage.setViewPan이 주점을 옮긴 창을 다시 건다 — sceneCam 산식).
//   ③ 입력이 표시를 되돌린다 — 밀린 화면에서 끝점의 **표시 위치**를 겨냥해 그으면
//      문서 좌표의 그 끝점에 스냅된다(InkCanvas.local이 오프셋을 뺀다 — 같은 훅, #17).
//   ④ 궤도로 풀린 뒤의 두 손가락 = **공간 팬**(종전 그대로) — viewPan은 안 움직인다.
import { test, expect, type Page } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

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
  led.setup = await setupConfirmed(page);
  expect((led.setup as any).lifted).toBeGreaterThan(0);

  // ---- ① 핀 상태 두 손가락 — 종이 팬. 카메라·문서 불변
  const before = await page.evaluate(() => ({
    pose: window.S2S.camPose(),
    pan: window.S2S.viewPan(),
    pts0: window.S2S.doc().strokes[0].pts2d.map((p: number[]) => [...p]),
  }));
  const proj0 = await projectFirst(page);
  await twoFingerPan(page, [21, 22], 60, 40);
  const after = await page.evaluate(() => ({
    pose: window.S2S.camPose(),
    pan: window.S2S.viewPan(),
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
    three_shift: [proj1.x - proj0.x, proj1.y - proj0.y],
  };
  expect((led.screen_pan as any).pinned_after).toBe(true);          // **핀이 안 풀렸다**
  expect((led.screen_pan as any).pose_moved).toBe(0);               // 공간 불변
  expect((led.screen_pan as any).doc_moved).toBe(0);                // 문서 불변 — 표시만 민다
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
             start_doc_gap: Math.hypot(st.pts2d[0][0] - tgt.doc[0], st.pts2d[0][1] - tgt.doc[1]) };
  }, target as any);
  // 표시 위치를 겨냥했는데 **문서 좌표의 끝점**에 붙었다 — 입력 되돌림이 배선됐다
  expect(["endpoint", "vertex"]).toContain((led.draw_panned as any).snap_start);
  expect((led.draw_panned as any).start_doc_gap).toBeLessThan(1);

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
    spec: "10차 항목 5 — 화면 팬 대 공간 팬: 핀 상태(그리는 중)의 두 손가락은 종이를 밀고(카메라·문서 불변, 표시 오프셋만), 3D 층이 같은 오프셋으로 함께 밀리며, 밀린 화면의 입력은 오프셋을 되돌려 문서 좌표에 스냅된다. 궤도로 풀린 뒤에는 종전의 공간 팬이다. 합성 PointerEvent — 앱 라우터를 그대로 지난다(#17)",
    what_this_does_not_say: [
      "핀치(줌)의 화면/공간 구분은 **안 다뤘다** — 핀 상태의 핀치는 화면 팬 갈래에 들어와 **무시된다**(dolly 성분을 안 쓴다). 화면 줌(표시 배율)은 좌표 규약 전반(스냅 조리개의 화면 px 정의 등)에 닿는 별도 항목이다(DEFERRED)",
      "화면 밖 소실점 가장자리 표식·잠정 그리드의 클리핑은 **문서 좌표의 화면 사각형** 기준 그대로다 — 팬이 크면 표식이 표시 밖으로 나갈 수 있다(표시 결함이지 좌표 결함이 아니다. DEFERRED)",
      "dpr 1·합성 터치의 확인이다(#21·AS-C1) — 실기(아이패드)의 두 손가락 감각은 실기 확인의 문이다",
      "three_shift의 ±0.5px는 투영 산식 차(three 행렬 ↔ principal+f·x/z)의 부동소수 여유다 — 정확도 임계가 아니라 배선 판정이다(#5)",
    ],
    thresholds: { three_shift_tol_px: 0.5, start_doc_gap_max_px: 1, console_errors_max: 0 },
    gate: {
      registered: "핀 상태 두 손가락 뒤: 핀 유지·pose 불변·문서 불변·viewPan≈(60,40)·three 투영 이동=viewPan(±0.5px) · 밀린 화면에서 끝점 표시 위치를 겨냥한 획이 문서 끝점에 스냅(끝점/정점·문서 격차<1px) · 궤도 후 두 손가락: target 이동>0.01·viewPan 불변 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "궤도 후 팔(④)이 음성 대조다 — 같은 두 손가락 손짓이 궤도 뒤에는 화면 팬이 아니라 공간 팬으로 간다(target_moved가 그 값). 화면 팬이 아무 데서나 받으면 ④의 viewPan이 움직여 실패한다",
      reachability_value: (led.space_pan as any).target_moved,
      reachability_source: "space_pan/target_moved",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
