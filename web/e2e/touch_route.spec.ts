// **입력 라우팅**(2026-08-17 사람 지시 G) — 산출: `stage0/out/touch_route.json`.
//
// 지시문: "다만 선례를 먼저 확인한다. **세 후보의 함정을 적어뒀으니 실제로 어느 것이 걸리는지
// 재고 정한다.**" 그래서 이 하네스가 **후보 셋을 실제 브라우저에서 각각 실행하고** 무엇이
// 걸리는지 잰다. 콘솔에서 확인하고 `progress.md`에만 적으면 그 측정은 죽는다(#25).
//
// 후보 셋(HANDOFF가 적어 둔 함정 그대로):
//   ① 터치를 렌더러 캔버스로 **재발행**   — ⚠ `setPointerCapture`가 합성 `pointerId`에서 던진다
//   ② `OrbitControls`를 **잉크 캔버스**에 — ⚠ three가 `pointerType !== 'touch'`를 마우스로 본다
//   ③ **제스처 직접 처리**                — ⚠ "three 최신판은 `rotateLeft` 같은 공개 API가 없다"
//
// ⚠ **이 원장은 게이트를 등록하지 않는다.** 통과선이 있는 측정이 아니라 **사실 확인 셋**이고
// (걸린다/안 걸린다), 그래서 `gate` 블록이 없다. 중단 조건과도 무관하다(#41).
//
// **양성 채널**(#30): "카메라가 안 움직였다"가 함정의 증거이려면 **같은 하네스에서 움직이는 팔**이
// 있어야 한다. ③이 그 팔이다 — 공개 API를 직접 부르면 방위각이 움직인다.
// **대조군**(#6): 팜 리젝션의 "안 움직인다"는 **펜 없이 같은 터치를 넣으면 움직인다**와 짝이다.
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { setupScene, setupConfirmed } from "./fixture.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const led: Record<string, unknown> = {};

/** 캔버스 위의 포인터 사건 하나. **앱의 라우터를 그대로 지난다**(#17). */
async function pointer(page: Page, ev: {
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
  id: number; kind: "touch" | "pen" | "mouse"; x: number; y: number;
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

/** 한 손가락을 눌러 끌고 뗀다(죽은 구간을 넘도록 여러 걸음). */
async function drag(page: Page, id: number, kind: "touch" | "pen" | "mouse",
                    from: [number, number], to: [number, number], steps = 6) {
  await pointer(page, { type: "pointerdown", id, kind, x: from[0], y: from[1] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await pointer(page, { type: "pointermove", id, kind,
                          x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t });
  }
  await pointer(page, { type: "pointerup", id, kind, x: to[0], y: to[1] });
}

const pose = (page: Page) => page.evaluate(() => window.S2S.camPose());
/** 방위각·앙각·거리가 얼마나 움직였나 — "카메라가 움직였다"의 척도 하나 */
const moved = (a: any, b: any) =>
  Math.abs(a.azimuth - b.azimuth) + Math.abs(a.polar - b.polar) + Math.abs(a.dist - b.dist);

/**
 * **감쇠가 멎을 때까지 기다린다.** `OrbitControls.enableDamping`이 켜져 있어(앱 설정 그대로)
 * 손을 뗀 뒤에도 몇 프레임 더 움직인다 — 그것을 안 기다리면 **다음 팔의 '0'이 앞 팔의 관성으로
 * 오염된다**(실제로 걸렸다: 팜 리젝션 팔이 0.0725를 냈고 그것은 앞 제스처의 잔여였다).
 * 하네스가 감쇠를 끄지 않는다 — 끄면 앱 경로가 아니게 된다(#17).
 */
async function settle(page: Page, tries = 60) {
  let prev = await pose(page);
  for (let i = 0; i < tries; i++) {
    await page.waitForTimeout(50);
    const now = await pose(page);
    if (moved(prev, now) === 0) return now;
    prev = now;
  }
  return prev;
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "touch_route.json"), JSON.stringify({
    spec: "G 입력 라우팅 — 잉크 캔버스가 three 캔버스를 덮은 상태에서 터치를 어디로 보낼 것인가",
    instruction: "2026-08-17 사람 지시 G (펜=그리기 · 손가락1=궤도 · 손가락2=팬/줌 · 마우스=버튼 모드)",
    what_this_does_not_say: [
      "실기기 — chromium의 **합성 포인터 사건**이다. 실제 아이패드의 손바닥 접촉 형태·"
        + "펜 이벤트 순서는 재지 않는다(AS-C1과 같은 자리: 실기 표본 0)",
      "제스처의 **감**(감도·관성) — 재는 것은 '어느 API가 불렸고 카메라가 움직였나'까지다",
      "동시 접촉의 시간차 — 사건을 순서대로 던지므로 실제 손바닥의 겹침 시간은 안 재진다",
    ],
    condition: {
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1",
      three: "r0.185.1 (`OrbitControls.js`)",
      pointer_events: "`new PointerEvent(...)` 합성. **앱의 라우터(`InkCanvas`)를 그대로 지난다**",
      gesture_tol: "아래 `gesture_tol` — `src/capture/camGesture.ts`의 `GESTURE_TOL` 실측값",
    },
    constants: constantsSnapshot(),
    // ⚠ **이 하네스는 `metrics.ts`를 안 부른다** — 재는 것이 각도·비율이 아니라 "어느 API가 불렸나"다.
    // 그래도 스냅샷을 적는다: 없으면 selfcheck가 "낡았는지 판정 불가"로 센다. **부르지 않는다는
    // 사실을 여기 적어 두는 것**이 #33의 사각지대(해시는 부르는 하네스만 덮는다)를 남기는 방법이다.
    metric_defs: { ...metricsSnapshot(), uses_metrics: false },
    ...led,
  }, null, 2), "utf-8");
});

test("후보 셋 — 어느 함정이 실제로 걸리나", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);

  const r = await page.evaluate(async () => {
    const S = window.S2S;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const gl = S.stage.viewport.renderer.domElement as HTMLCanvasElement;
    const c = S.stage.viewport.controls;
    const az = () => c.getAzimuthalAngle();

    // ── 후보 ① **재발행** — 합성 pointerId를 렌더러 캔버스에 던진다.
    // `OrbitControls.onPointerDown`이 첫 포인터에서 `setPointerCapture(pointerId)`를 부른다.
    c.enabled = true;
    let thrown: string | null = null;
    const onErr = (e: ErrorEvent) => { thrown = String(e.message); };
    window.addEventListener("error", onErr);
    const az0 = az();
    const rect = gl.getBoundingClientRect();
    gl.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 90001, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: rect.left + 200, clientY: rect.top + 200, buttons: 1 }));
    document.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 90001, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: rect.left + 300, clientY: rect.top + 240, buttons: 1 }));
    window.removeEventListener("error", onErr);
    const cand1 = { threw: thrown !== null, message: thrown, azimuth_delta: Math.abs(az() - az0) };

    // ── 후보 ② **`OrbitControls`를 잉크 캔버스에** — 펜이 궤도를 도는가.
    // ①의 예외와 섞이지 않게 `setPointerCapture`를 **하네스가 무력화한다**(개입을 명시한다).
    // ⚠ 페이지 안에서는 `three/...` 맨 지정자를 못 푼다 — **살아 있는 인스턴스의 생성자**를 쓴다
    const OC = c.constructor as new (cam: unknown, el: Element) => any;
    const cap = el.setPointerCapture; (el as any).setPointerCapture = () => {};
    const probe = new OC(S.stage.viewport.camera, el);
    probe.enableDamping = false;
    const az1 = probe.getAzimuthalAngle();
    el.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 90002, pointerType: "pen", isPrimary: true, bubbles: true,
      clientX: 200, clientY: 200, buttons: 1 }));
    document.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 90002, pointerType: "pen", isPrimary: true, bubbles: true,
      clientX: 320, clientY: 240, buttons: 1 }));
    const cand2 = { pen_orbits: Math.abs(probe.getAzimuthalAngle() - az1) > 1e-9,
                    azimuth_delta: Math.abs(probe.getAzimuthalAngle() - az1) };
    document.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 90002, pointerType: "pen", isPrimary: true, bubbles: true }));
    probe.dispose();
    (el as any).setPointerCapture = cap;

    // ── 후보 ③ **직접 처리** — 공개 API가 있는가, 그리고 실제로 카메라를 움직이는가(양성 채널)
    const api = ["rotateLeft", "rotateUp", "pan", "dollyIn", "dollyOut"];
    const present = api.filter(k => typeof (c as any)[k] === "function");
    const az2 = az(), d2 = c.getDistance();
    c.rotateLeft(0.2); c.dollyOut(1.25);
    // ⚠ `dist_before`가 0이면 `dist_ratio`는 0/0이다 — **확정 카메라에 물려 있으면
    // 궤도 반지름이 0**이라(카메라와 target이 원점에 겹친다) 줌은 여기서 의미가 없다.
    // 그래서 이 팔의 판정은 **방위각**으로 한다(줌은 앱 팔에서 잰다).
    const cand3 = { public_api: present, api_complete: present.length === api.length,
                    azimuth_delta: Math.abs(az() - az2), dist_before: d2,
                    dist_ratio: d2 > 0 ? c.getDistance() / d2 : null };
    c.rotateLeft(-0.2); c.dollyIn(1.25);          // 되돌려 놓는다
    c.enabled = false;
    return { cand1, cand2, cand3 };
  });

  // ③은 **양성 채널**이다 — 이것이 안 움직이면 ①·②의 0은 아무 말도 안 한다(#30)
  expect(r.cand3.api_complete).toBe(true);
  // ⚠ 감쇠(`dampingFactor` 0.12) 때문에 **한 번의 `update()`로는 요구량의 일부만** 적용된다 —
  // 0.2 라디안을 넣으면 그 프레임에는 ~0.024가 움직인다. 재는 것은 **움직였는가**다
  expect(r.cand3.azimuth_delta).toBeGreaterThan(0.005);
  led.candidates = {
    note: "세 후보를 같은 페이지에서 실행했다. **③이 양성 채널**이다(#30).",
    c1_redispatch: { ...r.cand1,
      pitfall: "합성 pointerId에서 `setPointerCapture`가 던진다",
      verdict: r.cand1.threw ? "함정 실재 — 던졌다" : "이 조건에서는 안 던졌다" },
    c2_controls_on_ink: { ...r.cand2,
      pitfall: "three가 `pointerType !== 'touch'`를 마우스로 본다 → **펜이 궤도를 돈다**",
      harness_intervention: "①과 섞이지 않게 `setPointerCapture`를 무력화하고 쟀다",
      verdict: r.cand2.pen_orbits ? "함정 실재 — 펜이 궤도를 돌렸다" : "펜이 궤도를 안 돌렸다" },
    c3_direct: { ...r.cand3,
      pitfall_as_written: "three 최신판은 `rotateLeft` 같은 공개 API가 없다",
      damping_note: "감쇠(0.12) 때문에 한 프레임에는 요구량의 일부만 적용된다 — 재는 것은 **움직였는가**다",
      dist_note: "`dist_before = 0`이면 확정 카메라에 물린 상태(궤도 반지름 0)라 줌을 못 잰다 → 앱 팔에서 잰다",
      verdict: r.cand3.api_complete
        ? "**함정이 사실이 아니다** — r185에 다섯 다 있고 카메라가 움직인다(#23: 실제를 따른다)"
        : "공개 API가 모자란다",
      source: "node_modules/three/examples/jsm/controls/OrbitControls.js" },
    chosen: "③ — 라우팅만 직접 하고 **카메라는 `OrbitControls` 공개 API**로 움직인다(A-3)",
  };
});

test("앱 종단 — 손가락 1개는 궤도, 2개는 팬·줌", async ({ page }) => {
  await page.goto("/l.html");
  const s = await setupConfirmed(page);
  expect(s.lifted).toBeGreaterThan(0);

  const before = await pose(page);
  expect(before.pinned).toBe(true);              // 확정 카메라에 물려 있다

  // 손가락 하나 — 궤도
  await drag(page, 1, "touch", [500, 400], [640, 430]);
  const afterOne = await settle(page);   // ⚠ **감쇠를 기다린다** — 안 기다리면 부분 적용값이다

  // 손가락 둘 — 팬·줌(벌리면 가까워진다)
  await pointer(page, { type: "pointerdown", id: 2, kind: "touch", x: 500, y: 400 });
  await pointer(page, { type: "pointerdown", id: 3, kind: "touch", x: 600, y: 400 });
  for (let i = 1; i <= 6; i++) {
    await pointer(page, { type: "pointermove", id: 2, kind: "touch", x: 500 - i * 8, y: 400 + i * 2 });
    await pointer(page, { type: "pointermove", id: 3, kind: "touch", x: 600 + i * 8, y: 400 + i * 2 });
  }
  await pointer(page, { type: "pointerup", id: 2, kind: "touch", x: 452, y: 412 });
  await pointer(page, { type: "pointerup", id: 3, kind: "touch", x: 648, y: 412 });
  const afterTwo = await settle(page);

  const g = await page.evaluate(() => window.S2S.gestureTol());
  led.app_gestures = {
    pinned_before: before.pinned,
    pinned_after_one_finger: afterOne.pinned,
    one_finger: { azimuth_delta: Math.abs(afterOne.azimuth - before.azimuth),
                  polar_delta: Math.abs(afterOne.polar - before.polar),
                  dist_delta: Math.abs(afterOne.dist - before.dist) },
    two_finger: { dist_ratio: afterTwo.dist / afterOne.dist,
                  target_moved: Math.hypot(...afterTwo.target.map((v: number, i: number) =>
                                  v - afterOne.target[i])) },
    reading: "손가락 하나가 **확정 카메라를 풀고**(pinned true → false) 방위각을 돌린다. "
           + "둘은 **거리를 줄이고**(벌림) 궤도 중심을 옮긴다.",
  };
  led.gesture_tol = g;

  expect(afterOne.pinned).toBe(false);                              // 손가락이 `궤도` 버튼을 대신한다
  expect(Math.abs(afterOne.azimuth - before.azimuth)).toBeGreaterThan(0.05);
  expect(afterTwo.dist / afterOne.dist).toBeLessThan(1);            // 벌리면 가까워진다
});

test("팜 리젝션 — 펜이 닿아 있는 동안 손가락이 카메라를 안 움직인다(G-2)", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);
  // 먼저 자유 시점으로 나가 둔다 — 핀 해제 여부가 아니라 **회전량**을 재기 위해서다
  await drag(page, 1, "touch", [500, 400], [560, 410]);

  // ── 대조군(#6): 펜 없이 같은 터치 → 움직인다
  const c0 = await settle(page);
  await drag(page, 2, "touch", [500, 400], [620, 440]);
  const c1 = await settle(page);

  // ── 동작점 ①: 펜이 닿아 있는 동안 시작한 터치
  await pointer(page, { type: "pointerdown", id: 7, kind: "pen", x: 300, y: 300 });
  const p0 = await settle(page);
  await drag(page, 3, "touch", [500, 400], [620, 440]);
  const p1 = await settle(page);

  // ── 동작점 ②: **펜을 뗀 뒤에도 남아 있는 터치**(쉬고 있던 손바닥)
  await pointer(page, { type: "pointerdown", id: 4, kind: "touch", x: 500, y: 400 });   // 손바닥이 먼저 닿는다
  await pointer(page, { type: "pointerup", id: 7, kind: "pen", x: 320, y: 320 });       // 펜을 뗀다
  const h0 = await settle(page);
  for (let i = 1; i <= 6; i++)
    await pointer(page, { type: "pointermove", id: 4, kind: "touch", x: 500 + i * 20, y: 400 + i * 7 });
  const h1 = await settle(page);
  await pointer(page, { type: "pointerup", id: 4, kind: "touch", x: 620, y: 442 });

  // ── 펜이 **나중에** 내려와 진행 중인 제스처를 끊는가
  await pointer(page, { type: "pointerdown", id: 5, kind: "touch", x: 500, y: 400 });
  await pointer(page, { type: "pointermove", id: 5, kind: "touch", x: 540, y: 410 });
  const b0 = await settle(page);
  await pointer(page, { type: "pointerdown", id: 8, kind: "pen", x: 300, y: 300 });     // 펜이 이긴다
  for (let i = 1; i <= 6; i++)
    await pointer(page, { type: "pointermove", id: 5, kind: "touch", x: 540 + i * 20, y: 410 + i * 7 });
  const b1 = await settle(page);
  await pointer(page, { type: "pointerup", id: 8, kind: "pen", x: 300, y: 300 });
  await pointer(page, { type: "pointerup", id: 5, kind: "touch", x: 660, y: 452 });

  const palm = await page.evaluate(() => window.S2S.palm());
  led.palm_rejection = {
    control_no_pen: { moved: moved(c0, c1) },
    op1_pen_touching: { moved: moved(p0, p1) },
    op2_held_after_pen_up: { moved: moved(h0, h1) },
    pen_interrupts_gesture: { moved: moved(b0, b1) },
    counters: palm,
    reading: "대조군은 움직이고 나머지 셋은 0이다. **대조군이 없으면 '터치가 원래 안 먹는 것'과 "
           + "구분이 안 된다**(#6). 동작점 둘을 다 잰다(#12) — ②가 없으면 쉬고 있던 손바닥이 "
           + "펜을 떼는 순간 궤도가 된다.",
  };

  expect(moved(c0, c1)).toBeGreaterThan(0.05);       // 대조군: 움직인다
  expect(moved(p0, p1)).toBe(0);                     // ①
  expect(moved(h0, h1)).toBe(0);                     // ②
  expect(moved(b0, b1)).toBe(0);                     // 펜이 제스처를 끊는다
  expect(palm.rejected_down).toBeGreaterThan(0);
  expect(palm.held_after_pen_up).toBeGreaterThan(0);
  expect(palm.cancelled_by_pen).toBeGreaterThan(0);
});

test("펜과 마우스는 잉크로 간다 — 라우팅이 장치로 갈린다", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);
  const n0 = await page.evaluate(() => window.S2S.doc().strokes.length);
  const p0 = await settle(page);

  // 펜 — 그린다(카메라는 안 움직인다)
  await drag(page, 11, "pen", [400, 300], [560, 300]);
  const afterPen = await page.evaluate(() => window.S2S.doc().strokes.length);
  const p1 = await settle(page);

  // 마우스 — 기본은 잉크다
  await drag(page, 12, "mouse", [400, 340], [560, 340]);
  const afterMouse = await page.evaluate(() => window.S2S.doc().strokes.length);

  // 마우스 — `궤도(마우스)`를 누르면 카메라로 간다(데스크톱 확인용)
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click());
  const m0 = await settle(page);
  await drag(page, 13, "mouse", [400, 380], [560, 420]);
  const m1 = await settle(page);
  const afterOrbitMouse = await page.evaluate(() => window.S2S.doc().strokes.length);

  led.device_routing = {
    strokes: { start: n0, after_pen: afterPen, after_mouse: afterMouse,
               after_mouse_in_orbit: afterOrbitMouse },
    camera_moved: { by_pen: moved(p0, p1), by_mouse_in_orbit: moved(m0, m1) },
    reading: "펜·마우스는 잉크로, 터치는 카메라로 간다. 마우스는 `궤도(마우스)` 동안만 카메라다. "
           + "⚠ **`pointer-events: none` 전환을 지웠으므로** 궤도 중에도 잉크 캔버스가 사건을 받는다.",
  };

  expect(afterPen).toBe(n0 + 1);
  expect(moved(p0, p1)).toBe(0);                     // 펜은 카메라를 안 건드린다
  expect(afterMouse).toBe(afterPen + 1);
  expect(afterOrbitMouse).toBe(afterMouse);          // 궤도 모드의 마우스는 획을 안 만든다
  expect(moved(m0, m1)).toBeGreaterThan(0.01);
});

/**
 * **dpr 2에서도 같은 각이 나온다**(#21 — dpr 1에서만 확인하지 않는다).
 *
 * 제스처 델타는 **css 픽셀**이어야 하고 회전 분모도 css 높이여야 한다. 어느 한쪽에 dpr이
 * 곱해지면 같은 손짓이 **두 배로 돈다** — 그리고 그 버그는 데스크톱(dpr 1)에서 안 보인다.
 * 잉크의 dpr 규약이 바로 그렇게 새었다(D-C3).
 */
test.describe("dpr 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("같은 손짓이 같은 각을 돈다 — 제스처 좌표는 css 픽셀이다(#21)", async ({ page }) => {
    await page.goto("/l.html");
    await setupConfirmed(page);
    const before = await pose(page);
    await drag(page, 1, "touch", [500, 400], [640, 430]);      // dpr 1 팔과 **같은 좌표**
    const after = await settle(page);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    // ⚠ 기준값은 **dpr 1 팔이 같은 파일에서 낸 값**이다 — 파일 전체를 돌려야 있다
    // (`-g`로 이것만 돌리면 없다). 없으면 **건너뛴다** — 없는 비교를 지어내지 않는다
    const one = (led.app_gestures as any)?.one_finger?.azimuth_delta as number | undefined;
    test.skip(one === undefined, "dpr 1 팔이 안 돌았다 — 파일 전체를 돌린다");
    led.dpr2 = { dpr, azimuth_delta: Math.abs(after.azimuth - before.azimuth),
                 dpr1_azimuth_delta: one,
                 ratio: one ? Math.abs(after.azimuth - before.azimuth) / one : null,
                 reading: "비가 1이면 css 픽셀 규약이 지켜진 것이다. **2면 dpr이 어딘가에서 곱해졌다.**" };
    expect(dpr).toBe(2);
    expect(Math.abs(after.azimuth - before.azimuth)).toBeCloseTo(one!, 12);
  });
});
