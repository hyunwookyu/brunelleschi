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
      // ⚠ **조건을 좁혀 적는다**(리뷰어 [5]) — 합성 사건에는 활성 포인터가 **정의상 없다**.
      // 실기기에서 원래 포인터가 살아 있는 채로 재발행하면 안 던질 수도 있다(안 쟀다).
      // 이 팔이 말하는 것은 "**합성 재발행**은 던진다"까지다.
      scope: "합성 포인터 사건에 한한다. 실기기에서 활성 포인터를 그대로 재발행하는 경우는 **미측정**",
      verdict: r.cand1.threw ? "함정 실재(합성 조건) — 던졌다" : "이 조건에서는 안 던졌다" },
    c2_controls_on_ink: { ...r.cand2,
      pitfall: "three가 `pointerType !== 'touch'`를 마우스로 본다 → **펜이 궤도를 돈다**",
      harness_intervention: "①과 섞이지 않게 `setPointerCapture`를 무력화하고 쟀다",
      verdict: r.cand2.pen_orbits ? "함정 실재 — 펜이 궤도를 돌렸다" : "펜이 궤도를 안 돌렸다" },
    c3_direct: { ...r.cand3,
      pitfall_as_written: "three 최신판은 `rotateLeft` 같은 공개 API가 없다",
      damping_note: "감쇠(0.12) 때문에 한 프레임에는 요구량의 일부만 적용된다 — 재는 것은 **움직였는가**다",
      dist_note: "`dist_before = 0`이면 확정 카메라에 물린 상태(궤도 반지름 0)라 줌을 못 잰다 → 앱 팔에서 잰다",
      // ⚠ **존재와 작동을 한 문장에 묶지 않는다**(리뷰어 [10]) — 이 팔이 확인한 작동은
      // **회전 하나**다. 줌은 `dist_before = 0`이라 못 쟀고 팬은 이 팔에 값이 없다.
      verdict: r.cand3.api_complete
        ? "**함정이 사실이 아니다** — r185에 다섯 다 **있고**, 이 팔에서 **회전**이 실제로 움직였다"
        + "(줌·팬의 작동은 앱 팔에서 잰다). #23: 계획과 실제가 어긋나면 실제를 따른다"
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

  // **핀 해제의 도약을 갈라낸다**(리뷰어 [9]) — 첫 손짓의 `dist`·`polar` 델타에는
  // "확정 카메라(궤도 반지름 0)에서 자유 시점으로 나가는 재초기화"가 섞여 있다.
  // **이미 풀린 상태에서 같은 손짓**을 한 번 더 해서 그 몫을 뺀 값을 함께 낸다.
  const beforeAgain = await settle(page);
  await drag(page, 4, "touch", [500, 400], [640, 430]);            // 첫 팔과 **같은 손짓**
  const afterAgain = await settle(page);
  // **터치는 획을 안 만든다**(리뷰어 [13]) — 라우팅 표에 터치 행이 없었다
  const strokesAfterTouch = await page.evaluate(() => window.S2S.doc().strokes.length);

  const g = await page.evaluate(() => window.S2S.gestureTol());
  led.app_gestures = {
    pinned_before: before.pinned,
    pinned_after_one_finger: afterOne.pinned,
    one_finger: { input_px: { from: [500, 400], to: [640, 430], steps: 6, start: "확정 카메라(pinned)" },
                  azimuth_delta: Math.abs(afterOne.azimuth - before.azimuth),
                  polar_delta: Math.abs(afterOne.polar - before.polar),
                  dist_delta: Math.abs(afterOne.dist - before.dist) },
    // ⚠⚠ **`dist_ratio`는 측정이 아니라 설계 보장이다**(#5 · 리뷰어 [4]) — 우리가 부른
    // `dollyOut(끝거리/처음거리)`를 그대로 되받는다: 100 → 196px이므로 1/1.96 = 0.5102다.
    // **읽을 것은 값이 아니라 부호와 경로**다(벌리면 가까워진다 · 두 손가락이 줌으로 갔다).
    two_finger: { input_px: { d0: 100, d1: 196, ratio: 196 / 100 },
                  dist_ratio: afterTwo.dist / afterOne.dist,
                  guarantee: "1/1.96 = 0.5102 — `dollyOut` 호출의 항등이다. 임계를 걸지 않는다",
                  target_moved: Math.hypot(...afterTwo.target.map((v: number, i: number) =>
                                  v - afterOne.target[i])) },
    // **같은 손짓을 이미 풀린 상태에서 한 번 더** — 핀 해제 몫이 빠진 값이다
    one_finger_already_free: { input_px: { from: [500, 400], to: [640, 430], steps: 6,
                                           start: "자유 시점(이미 풀림) — **첫 팔과 같은 손짓**" },
                               azimuth_delta: Math.abs(afterAgain.azimuth - beforeAgain.azimuth),
                               polar_delta: Math.abs(afterAgain.polar - beforeAgain.polar),
                               dist_delta: Math.abs(afterAgain.dist - beforeAgain.dist) },
    strokes_after_touch_only: { before: s.strokes, after: strokesAfterTouch },
    reading: "손가락 하나가 **확정 카메라를 풀고**(pinned true → false) 방위각을 돌린다. "
           + "둘은 **거리를 줄이고**(벌림) 궤도 중심을 옮긴다. "
           + "⚠ 첫 팔은 **세 성분 전부**에 핀 해제의 재초기화가 섞여 있다(방위각도 1.2551 대 1.0860으로 "
           + "13.5% 다르다) — "
           + "그 몫이 빠진 값이 `one_finger_already_free`다. "
           + "⚠ **터치만으로는 획이 안 생긴다**(`strokes_after_touch_only`).",
  };
  led.gesture_tol = g;

  expect(afterOne.pinned).toBe(false);                              // 손가락이 `궤도` 버튼을 대신한다
  expect(Math.abs(afterOne.azimuth - before.azimuth)).toBeGreaterThan(0.05);
  expect(afterTwo.dist / afterOne.dist).toBeLessThan(1);            // 벌리면 가까워진다
  expect(strokesAfterTouch).toBe(s.strokes);                        // 터치는 획을 안 만든다
  // 핀이 풀린 뒤에도 같은 손짓이 같은 방향으로 돈다(핀 해제가 그 회전의 원인이 아니다)
  expect(Math.abs(afterAgain.azimuth - beforeAgain.azimuth)).toBeGreaterThan(0.05);
});

test("팜 리젝션 — 펜이 닿아 있는 동안 손가락이 카메라를 안 움직인다(G-2)", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);
  // 먼저 자유 시점으로 나가 둔다 — 핀 해제 여부가 아니라 **회전량**을 재기 위해서다
  await drag(page, 1, "touch", [500, 400], [560, 410]);

  const counters = () => page.evaluate(() => window.S2S.palm());
  // ── 대조군(#6): 펜 없이 같은 터치 → 움직인다
  const cnt0 = await counters();
  const c0 = await settle(page);
  await drag(page, 2, "touch", [500, 400], [620, 440]);
  const c1 = await settle(page);

  // ── 동작점 ①: 펜이 닿아 있는 동안 시작한 터치
  const cnt1 = await counters();
  await pointer(page, { type: "pointerdown", id: 7, kind: "pen", x: 300, y: 300 });
  const p0 = await settle(page);
  await drag(page, 3, "touch", [500, 400], [620, 440]);
  const p1 = await settle(page);

  // ── 동작점 ②: **펜을 뗀 뒤에도 남아 있는 터치**(쉬고 있던 손바닥)
  const cnt2 = await counters();
  await pointer(page, { type: "pointerdown", id: 4, kind: "touch", x: 500, y: 400 });   // 손바닥이 먼저 닿는다
  await pointer(page, { type: "pointerup", id: 7, kind: "pen", x: 320, y: 320 });       // 펜을 뗀다
  const h0 = await settle(page);
  for (let i = 1; i <= 6; i++)
    await pointer(page, { type: "pointermove", id: 4, kind: "touch", x: 500 + i * 20, y: 400 + i * 7 });
  const h1 = await settle(page);
  await pointer(page, { type: "pointerup", id: 4, kind: "touch", x: 620, y: 442 });

  // ── 펜이 **나중에** 내려와 진행 중인 제스처를 끊는가
  const cnt3 = await counters();
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
  // **팔별 카운터 증분**(리뷰어 [6]) — 총계만 내면 어느 팔의 0이 "문이 돌아서"인지
  // "그 경로가 아예 안 돌아서"인지 갈리지 않는다(#32). 각 팔이 자기 문을 지났음을 낸다.
  const d = (a: any, b: any) => ({
    rejected_down: b.rejected_down - a.rejected_down,
    cancelled_by_pen: b.cancelled_by_pen - a.cancelled_by_pen,
    held_after_pen_up: b.held_after_pen_up - a.held_after_pen_up,
    forwarded_down: b.forwarded_down - a.forwarded_down,
  });
  led.palm_rejection = {
    // ⚠ **입력을 원장에 적는다**(리뷰어 [1] · #25) — 대조군과 ①이 **같은 손짓**이어야
    // 그 비교가 성립한다. 원장 밖에 있으면 다음 세션이 확인할 길이 없다.
    input_px: {
      control_no_pen: { from: [500, 400], to: [620, 440], steps: 6 },
      op1_pen_touching: { from: [500, 400], to: [620, 440], steps: 6, note: "**대조군과 같다**" },
      op2_held_after_pen_up: { from: [500, 400], to: [620, 442], steps: 6 },
      pen_interrupts_gesture: { from: [540, 410], to: [660, 452], steps: 6 },
      pen_at: [300, 300],
      control_covers: "대조군의 짝은 **①뿐이다**(같은 손짓). ②는 끝점이 2px 다르고 "
                    + "'펜이 끊기'는 시작점이 40px 다르다 — 그 둘의 0은 ①의 대조군을 **빌려 읽는다**",
    },
    arm_order: ["control_no_pen", "op1_pen_touching", "op2_held_after_pen_up", "pen_interrupts_gesture"],
    arm_start_state: { control: { dist: c0.dist, pinned: c0.pinned },
                       op1: { dist: p0.dist, pinned: p0.pinned },
                       op2: { dist: h0.dist, pinned: h0.pinned },
                       pen_interrupts: { dist: b0.dist, pinned: b0.pinned },
                       note: "팔들이 **같은 페이지 상태를 이어 쓴다** — 앞 팔이 뒤 팔의 시작을 정한다" },
    control_no_pen: { moved: moved(c0, c1), counters: d(cnt0, cnt1) },
    op1_pen_touching: { moved: moved(p0, p1), counters: d(cnt1, cnt2) },
    op2_held_after_pen_up: { moved: moved(h0, h1), counters: d(cnt2, cnt3) },
    pen_interrupts_gesture: { moved: moved(b0, b1), counters: d(cnt3, palm) },
    // ⚠ **총계 = 팔 시작 전 상태 + 팔별 증분**이다. 이 시험은 팔에 들어가기 전에
    // **자유 시점으로 나가는 손짓 하나**를 먼저 하므로 그 통과 1건이 총계에만 있다 —
    // 적지 않으면 "증분 합 2 ≠ 총계 3"이 설명되지 않는다(리뷰어 2회차 [3]).
    counters_before_arms: cnt0,
    counters_total: palm,
    reading: "대조군은 움직이고 나머지 셋은 0이다. **대조군이 없으면 '터치가 원래 안 먹는 것'과 "
           + "구분이 안 된다**(#6). 동작점 둘을 다 잰다(#12) — ②가 없으면 쉬고 있던 손바닥이 "
           + "펜을 떼는 순간 궤도가 된다. **팔별 카운터 증분**이 각 팔이 자기 문을 실제로 "
           + "지났음을 낸다 — 총계만으로는 앞 팔의 상태가 막은 것과 구분이 안 된다(#32). "
           + "⚠ `moved`는 |Δ방위각|+|Δ앙각|+|Δ거리|의 합이고 `app_gestures`의 축별 델타와 "
           + "**다른 지표**다 — 두 표의 수를 견주지 않는다.",
  };

  expect(moved(c0, c1)).toBeGreaterThan(0.05);       // 대조군: 움직인다
  expect(moved(p0, p1)).toBe(0);                     // ①
  expect(moved(h0, h1)).toBe(0);                     // ②
  expect(moved(b0, b1)).toBe(0);                     // 펜이 제스처를 끊는다
  expect(palm.rejected_down).toBeGreaterThan(0);
  expect(palm.held_after_pen_up).toBeGreaterThan(0);
  expect(palm.cancelled_by_pen).toBeGreaterThan(0);
  // 팔별로도 **그 팔에서** 문이 돌았는가 — 총계가 아니라 증분으로 본다
  expect(d(cnt1, cnt2).rejected_down).toBeGreaterThan(0);          // ①이 실제로 거부했다
  expect(d(cnt2, cnt3).held_after_pen_up).toBeGreaterThan(0);      // ②가 실제로 유지했다
  expect(d(cnt3, palm).cancelled_by_pen).toBeGreaterThan(0);       // 펜이 실제로 끊었다
  expect(d(cnt0, cnt1).forwarded_down).toBeGreaterThan(0);         // 대조군은 실제로 통과했다
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
    // **섭동이 실제로 걸렸는가**(#30의 나머지 절반 · 리뷰어 2회차 [7]) — `devicePixelRatio`만
    // 읽으면 그것은 설정의 되읽기다. **캔버스 백버퍼가 css 크기의 몇 배인지**를 함께 읽는다:
    // 그것이 2면 dpr이 렌더 경로에 실제로 걸린 것이고, 그때의 회전 비 1.0이 정보다.
    const dpr = await page.evaluate(() => {
      const el = document.getElementById("ink") as HTMLCanvasElement;
      return { devicePixelRatio: window.devicePixelRatio, css_w: el.clientWidth,
               backing_w: el.width, backing_ratio: el.width / Math.max(1, el.clientWidth) };
    });

    // **양성 채널**(#30 · 리뷰어 [7]) — 비가 1.0인 것이 "규약이 지켜졌다"인지
    // "이 지표가 손짓 크기에 둔감하다"인지 갈려야 한다. **같은 팔에서 절반 손짓**을 낸다:
    // 그것이 0.5를 내면 지표는 민감하고, 그러므로 앞의 1.0이 정보다.
    // ⚠ **두 배로 안 한다** — `getAzimuthalAngle()`은 `atan2`라 (−π, π]로 **감기고**,
    // 큰 회전에서는 |Δ|가 그 감김을 탄다(실측: 두 배 입력에서 비가 3.28로 나왔다).
    // 절반은 감김에서 멀어 그 오염이 없다.
    // ⚠⚠ 기준은 **이미 풀린 상태의 같은 손짓**이어야 한다 — 첫 팔은 **핀 해제**를 포함하므로
    // 회전량이 그만큼 다르다(`app_gestures.one_finger` 1.2551 대 `one_finger_already_free` 1.0860).
    // 그래서 양성 채널은 **자유 상태의 전체 : 자유 상태의 절반**으로 잰다.
    const bFull = await settle(page);
    await drag(page, 2, "touch", [500, 400], [640, 430]);      // 전체(자유 상태)
    const aFull = await settle(page);
    const b2 = await settle(page);
    await drag(page, 3, "touch", [500, 400], [570, 415]);      // **절반**(Δx 70 · Δy 15)
    const a2 = await settle(page);

    // **팬도 잰다**(리뷰어 [7]) — 회전과 핀치는 비(比)라 dpr이 분자·분모에서 상쇄될 수 있다.
    // 픽셀 → 월드 환산이 들어가는 팬이 dpr 규약이 깨지는 자리다.
    const b3 = await settle(page);
    await pointer(page, { type: "pointerdown", id: 4, kind: "touch", x: 500, y: 400 });
    await pointer(page, { type: "pointerdown", id: 5, kind: "touch", x: 600, y: 400 });
    for (let i = 1; i <= 6; i++) {
      await pointer(page, { type: "pointermove", id: 4, kind: "touch", x: 500 + i * 10, y: 400 });
      await pointer(page, { type: "pointermove", id: 5, kind: "touch", x: 600 + i * 10, y: 400 });
    }
    await pointer(page, { type: "pointerup", id: 4, kind: "touch", x: 560, y: 400 });
    await pointer(page, { type: "pointerup", id: 5, kind: "touch", x: 660, y: 400 });
    const a3 = await settle(page);

    // ⚠ 기준값은 **dpr 1 팔이 같은 파일에서 낸 값**이다 — 파일 전체를 돌려야 있다
    // (`-g`로 이것만 돌리면 없다). 없으면 **건너뛴다** — 없는 비교를 지어내지 않는다
    const app = led.app_gestures as any;
    const one = app?.one_finger?.azimuth_delta as number | undefined;
    test.skip(one === undefined, "dpr 1 팔이 안 돌았다 — 파일 전체를 돌린다");
    const az = Math.abs(after.azimuth - before.azimuth);
    const azFull = Math.abs(aFull.azimuth - bFull.azimuth);
    const az2 = Math.abs(a2.azimuth - b2.azimuth);
    const panMoved = Math.hypot(...a3.target.map((v: number, i: number) => v - b3.target[i]));
    led.dpr2 = {
      dpr,
      perturbation_applied: { backing_ratio: dpr.backing_ratio,
        reading: "**백버퍼가 css 폭의 2배**여야 dpr 섭동이 실제로 걸린 것이다. "
               + "1이면 회전 비 1.0은 '규약이 지켜졌다'가 아니라 '섭동이 안 걸렸다'다" },
      rotate: { azimuth_delta: az, dpr1_azimuth_delta: one, ratio: az / one!,
                az_tol_rad: 1e-6,
                az_tol_note: "판정은 |az−dpr1| < 1e-6rad(6차 항목 1에서 개정 — 옛 정밀도 12는 "
                  + "판정 의도(오배선 = 비 2, Δ≈0.5rad)보다 다섯 자리 과했고 chromium-1194에서 "
                  + "5.9e-10 부동소수 차이로 상시 실패했다. 변경 전 코드에서도 재현 — 코드 결함 아님)",
                input_px: { from: [500, 400], to: [640, 430], note: "dpr 1 팔과 같은 좌표" } },
      positive_channel: { azimuth_delta_half_input: az2, azimuth_delta_full_free: azFull,
                          ratio_to_single: az2 / azFull,
                          input_px: { from: [500, 400], to: [570, 415],
                                      note: "Δx가 절반. 기준은 **자유 상태의 전체 손짓**이다 — "
                                          + "첫 팔은 핀 해제를 포함해 회전량이 다르다" },
                          reading: "**0.5에 가까워야 지표가 민감한 것**이다. 1에 붙으면 "
                                 + "앞의 비 1.0은 규약의 증거가 아니라 둔감의 증거다. "
                                 + "⚠ 두 배로 안 재는 이유: `getAzimuthalAngle()`이 `atan2`라 "
                                 + "**감긴다**(두 배 입력에서 비 3.28이 나왔다)" },
      pan: { target_moved: panMoved,
             input_px: { two_fingers_dx: 60, note: "두 손가락을 나란히 60px 민다(거리 불변 → 줌 없음)" },
             is_verdict: false,
             reading: "⚠ **판정이 아니라 기록이다** — 같은 궤도 반지름의 dpr 1 팬 팔이 없어 "
                    + "견줄 대상이 없다(값이 반지름에 비례한다). 여기서 말하는 것은 "
                    + "'dpr 2에서 팬 경로가 돈다'까지다" },
      reading: "회전 비가 1이면 css 픽셀 규약이 지켜진 것이다. **2면 dpr이 어딘가에서 곱해졌다.**",
    };
    expect(dpr.devicePixelRatio).toBe(2);
    expect(dpr.backing_ratio).toBe(2);        // 섭동이 렌더 경로까지 걸렸다
    // ⚠ 정밀도 12(5e-13)는 판정 의도보다 다섯 자리 과했다 — dpr 오배선의 신호는 **비 2**
    // (Δ≈0.5rad)이지 1e-10대 잡음이 아니다. chromium-1194 컨테이너에서 5.9e-10 차이로
    // 상시 실패했고(변경 전 코드에서도 재현 — 6차 항목 1에서 확인), HANDOFF의 "간헐"의
    // 정체가 이것이다. 1e-6rad은 여전히 오배선(0.5rad)과 다섯 자리 여유로 갈린다.
    expect(Math.abs(az - one!)).toBeLessThan(1e-6);
    // 양성 채널: 절반 손짓은 절반 돈다(죽은 구간 한 걸음이 양쪽에서 같은 비율로 빠진다)
    expect(az2 / azFull).toBeGreaterThan(0.45);
    expect(az2 / azFull).toBeLessThan(0.55);
    expect(panMoved).toBeGreaterThan(0);
  });
});
