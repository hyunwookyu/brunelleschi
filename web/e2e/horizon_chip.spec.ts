// **지평선 토글이 선 위에 있다**(2026-08-20 16차 항목 0 · D-L104 후속).
// 산출: `stage0/out/horizon_chip.json`.
//
// 지시 원문(`docs/instructions/16.md` 지시 5): *"지평선에 토글을 붙인다 — **켜고 끄기를
// 그 자리에서**."* 15차 판(D-L104)은 토글을 하단바(접이식 메뉴 안)에만 뒀다 — 그 자리가
// 아니다. 16차가 옮긴 배선을 이 원장이 잰다:
//
//   끔 → 켬   가장자리 손잡이 자리의 **탭**(선이 없어도 손잡이는 있다)
//   켬 → 끔   같은 손잡이의 **무이동 탭**(움직이면 끌기 — 그 갈림도 잰다)
//
// ⚠ **끌기 자체는 `horizon_drag.json`이 든다** — 이 원장은 «토글의 자리»만 잰다.
// 하단바 버튼은 그대로 남는다(같은 상태를 두 자리가 만진다 — 배선은 `SHOW_HORIZON` 하나다).
//
// 착수 시 `PITFALLS.md`를 읽었다(표는 `progress.md`의 16차 항목 0 절):
//   #12 동작점 — 탭 둘·끌기 하나·딴 자리 탭 하나 · #17 판정 띠는 `PICK_TOL` 재사용
//   #21 dpr 1 · #30 되살림 = 이 손잡이를 안 쓰는 것(하단바 경로가 옛 거동 그대로다)
//   #32 각 팔이 실제로 그 상태에 갔음을 필드로 남긴다 · #38 팔 수를 스스로 적는다
//   #40·#46 게이트 값은 상태 비트 넷 + 끌기/탭 갈림의 연속량(moved px) · #47 수치는 필드
//   #53 팔 순서가 상태를 바꾼다 — 각 팔이 `state_before`를 그 자리에서 읽는다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { PICK_TOL } from "../src/ui/pick.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("지평선 토글 — 선 위 손잡이가 켜고 끈다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const box = (await page.locator("#frame").boundingBox())!;

  const read = () => page.evaluate(() => {
    const S = window.S2S;
    const c = S.horizonChip();
    return { toggle: S.showHorizon(), chip_at: c.at.map((v: number) => Math.round(v * 10) / 10),
             y: Math.round(S.horizon().y * 10) / 10,
             strokes: S.doc().strokes.length };
  });
  const tap = async (p: [number, number]) => {
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.down();
    // 캡처는 2점부터 획이다(`inkCanvas.onUp`) — 1px만 움직여 «탭»을 획으로 만든다
    await page.mouse.move(box.x + p[0] + 1, box.y + p[1]);
    await page.mouse.up();
    await page.waitForTimeout(60);
  };

  // ---- ① 끔 → 켬: 손잡이 자리 탭
  const s0: any = await read();
  await tap(s0.chip_at);
  const s1: any = await read();

  // ---- ② 켬 → 끔: 같은 손잡이의 무이동 탭(끌기 경로를 지나는 탭 — 갈림의 한쪽)
  await tap(s1.chip_at);
  const s2: any = await read();

  // ---- ③ 다시 켜고, 손잡이 **밖**(선 가운데)에서 끌면 — 토글이 아니라 끌기다(갈림의 다른 쪽)
  await tap(s2.chip_at);
  const s3: any = await read();
  const dragDy = 50;
  await page.mouse.move(box.x + box.width * 0.5, box.y + s3.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + s3.y + dragDy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const s4: any = await read();

  // ---- ④ 반례 — 손잡이에서 먼 자리의 탭은 토글도 끌기도 아니다(그리기 탭이다)
  const far: [number, number] = [box.width * 0.3, Math.max(30, s4.y - 200)];
  await tap(far);
  const s5: any = await read();

  // ---- ⑤ **잠김(확정 후) 상태의 손잡이 자리 탭**(1차 리뷰어 [10]) — 지배적 상태는
  // 확정 뒤인데 거기서 이 탭이 무엇이 되는지 안 재고 있었다. 가로챔 조건
  // (`canSetHorizon`)이 거짓이므로 **그리기 탭이 되는 것**이 설계다 — 그것을 잰다.
  // ⚠ setupConfirmed가 획을 그리므로 이 팔은 반드시 맨 뒤다(#53 — 순서가 상태를 바꾼다).
  await setupConfirmed(page);
  const s6: any = await read();
  // 그 자리를 실제로 덮고 있는 요소를 먼저 읽는다 — 확정 후 지평선이 화면 위쪽이면
  // 손잡이 자리(오른쪽 가장자리)가 상단 우측 도구 묶음(#tools) 아래일 수 있다.
  const lockedSpotEl = await page.evaluate((at: number[]) => {
    const fr = document.getElementById("frame")!.getBoundingClientRect();
    const el = document.elementFromPoint(fr.left + at[0], fr.top + at[1]);
    return el ? { id: el.id || null, tag: el.tagName,
                  in_tools: !!el.closest("#tools"), in_bar: !!el.closest("#bar") } : null;
  }, s6.chip_at);
  await tap(s6.chip_at);
  const s7: any = await read();

  const canvas = await page.evaluate(() => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return [el.clientWidth, el.clientHeight];
  });
  const bandPx = Math.round(PICK_TOL.radius_ratio * Math.hypot(canvas[0], canvas[1]) * 100) / 100;

  const led: any = {
    what: "지평선 토글이 **선 위 손잡이**로 켜고 꺼지는가, 그리고 손잡이 탭(토글)과 선 끌기"
      + "(피치)가 갈리는가(16차 지시 5 — «켜고 끄기를 그 자리에서»).",
    how: {
      arms: "탭 켬(①) → 탭 끔(②) → 탭 켬 + 선 가운데 끌기(③) → 먼 자리 탭(④). 전부 실제 "
        + "포인터다. 각 팔의 앞 상태를 그 자리에서 읽는다(#53 — 팔 순서가 상태를 바꾼다).",
      split: "«탭 = 토글 · 끌기 = 이동»의 갈림은 **무이동**(`PICK_TOL` 띠)과 **손잡이 위 "
        + "시작**의 논리곱이다 — 선 가운데서 시작한 끌기는 토글에 안 걸린다(③이 그 반례다).",
    },
    what_this_does_not_say: [
      "dpr 1·마우스뿐이다(#21). 손가락 탭의 정밀도는 실획 표본이 판정자다.",
      "잠김(확정 후) 상태의 **잠김 표시**(버튼 라벨·disabled)는 `horizon_drag.json`의 "
      + "확정 팔이 들고, **그 상태의 손잡이 자리 탭**은 이 원장의 ⑤ 팔이 든다(1차 리뷰어 "
      + "[10]로 추가 — 초판은 위임처가 다른 양(표시)을 재는데 «든다»라고 적었다).",
      "손잡이에서 시작한 **띠보다 짧은 끌기**는 토글로 읽힌다 — 그 경계의 비용은 알고 "
      + "고른 규약이다(끌기는 보통 선 가운데서 시작한다). 경계 스윕은 안 했다.",
    ],
    setup: { canvas, band_px: bandPx, arms: 5, chip_at: s0.chip_at },
    states: { initial: s0, after_tap_on: s1, after_tap_off: s2, re_on: s3,
              after_drag: s4, after_far_tap: s5,
              confirmed: s6, after_locked_tap: s7 },
    summary: {
      tap_turns_on: !s0.toggle.on && s1.toggle.on,
      tap_turns_off: s1.toggle.on && !s2.toggle.on,
      /** 끔 탭이 지평선을 안 옮겼는가 — 탭이 끌기로 새면 여기가 벗어난다 */
      off_tap_moved_px: Math.round(Math.abs(s2.y - s1.y) * 10) / 10,
      /** 선 가운데 끌기는 토글이 아니라 이동이다 — 켜진 채 y가 움직인다 */
      drag_kept_on: s4.toggle.on,
      drag_moved_px: Math.round(Math.abs(s4.y - s3.y) * 10) / 10,
      /**
       * **명령한 끌기량**(1차 리뷰어 [4] — 이것이 없으면 `drag_moved_px`가 측정인지
       * 명령값의 반사인지 안 갈린다). 판정은 비(`drag_follow_ratio` ≈ 1 — 1:1 따라옴)다.
       */
      drag_commanded_px: dragDy,
      drag_follow_ratio: Math.round(Math.abs(s4.y - s3.y) / dragDy * 1000) / 1000,
      far_tap_no_toggle: s5.toggle.on === s4.toggle.on,
      /**
       * ⑤ 잠김 상태 — 탭이 토글을 안 만진다(잠김). ⚠ **획 증분은 그 자리를 덮은 요소에
       * 달려 있다**(`locked_spot_element`): 이 픽스처는 확정 후 지평선이 화면 위쪽(y ≈ 69)
       * 이라 손잡이 자리가 #tools 아래이고 탭이 캔버스에 안 닿는다 — 증분 0은 «가로챔»이
       * 아니라 **UI 겹침**이다. 그 사실을 값과 함께 든다(#32 — 미도달을 판정으로 안 쓴다).
       */
      locked_after_confirm: s6.toggle.locked === true,
      locked_tap_no_toggle: s7.toggle.on === s6.toggle.on,
      locked_tap_strokes_delta: s7.strokes - s6.strokes,
      locked_spot_element: lockedSpotEl,
      /**
       * ⚠ 먼 탭은 **획이 된다**(1px 획 — 그리기의 정상 경로다). 손잡이 탭 둘이 획을 안
       * 만든 것(`states`의 strokes 불변)과의 대비가 «가로챔이 손잡이에서만»의 증거다.
       */
      far_tap_strokes_delta: s5.strokes - s4.strokes,
      chip_tap_strokes_delta: s2.strokes - s0.strokes,
    },
    gate: {
      registered: "손잡이 탭이 켜고(`tap_turns_on`) 끄고(`tap_turns_off`), 끔 탭이 지평선을 "
        + "안 옮기고(`off_tap_moved_px` = 0), 선 가운데 끌기는 켜진 채 옮기며"
        + "(`drag_kept_on` · `drag_moved_px` > 0), 먼 탭은 아무것도 안 바꾼다"
        + "(`far_tap_no_toggle`).",
      registered_note: "⚠ **이 항목이 등록한 게이트다 — CLAUDE.md §2 중단 조건 아님**(#41).",
      reachability: "하단바 버튼 경로가 남아 있으므로(#30) 이 손잡이가 죽어도 토글은 된다 — "
        + "이 원장이 재는 것은 **자리**다.",
      /** 실제로 재는 양(#46): 비트들 + 연속량(`drag_follow_ratio` — 명령 대비 이동 비). */
      reachability_bits: null as unknown,
      /**
       * ⛔ 초판은 `reachability_value`에 `drag_moved_px`(50 = 명령값의 반사)를 넣었다 —
       * 게이트 결과의 복사이고 크기는 명령이 정한다(1차 리뷰어 [3][4]). 오라클 팔(토글이
       * 끌기를 죽이는 배선을 되살려 비가 0이 되는 대조)은 안 만들었다 — 적기만 한다(#35).
       */
      reachability_absent: "오라클 팔 없음 — drag_follow_ratio는 이 게이트의 결과 자체다. "
        + "기준을 넘는 것(비 0)은 «탭 가로챔이 끌기를 삼키는 배선»인데 그 되살림 팔은 없다.",
      result: {} as Record<string, unknown>,
    },
    selfcheck_notes: {
      follow_ratio_one: "`drag_follow_ratio` 정확히 1.0은 **설계의 귀결**이다(#5) — "
        + "`setHorizon`이 포인터 y를 그대로 쓰므로 마지막 좌표가 곧 지평선이다. 이 팔이 "
        + "재는 것은 값의 크기가 아니라 **끌기 경로가 살아 있고 토글 가로챔이 그것을 안 "
        + "삼킨다**는 것이다 — 가로챔이 끌기를 삼키면 0, 좌표 규약이 새면(dpr) 2·0.5가 "
        + "된다(그 자리가 dpr 2 팔이다).",
      off_tap_zero: "`off_tap_moved_px` = 0은 **토글 탭이 끌기로 안 새는 것**이 판정이다 — "
        + "탭 중에도 down→up 사이 좌표가 흔들리면 setHorizon이 돌 수 있는 자리를 막았다"
        + "(down에서 안 적용하고 up의 토글 가지가 이동을 건너뛴다).",
    },
    pitfall_citations: [12, 17, 21, 30, 32, 38, 40, 41, 46, 47, 53],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_bits = { ...led.summary };
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "horizon_chip.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  expect(s0.toggle.on).toBe(false);                    // 기본 끔(D-L104 그대로)
  expect(s1.toggle.on).toBe(true);
  expect(s2.toggle.on).toBe(false);
  expect(led.summary.off_tap_moved_px).toBe(0);
  expect(s3.toggle.on).toBe(true);
  expect(s4.toggle.on).toBe(true);                     // 끌기는 토글이 아니다
  expect(led.summary.drag_moved_px).toBeGreaterThan(dragDy * 0.5);
  expect(led.summary.far_tap_no_toggle).toBe(true);
  // **손잡이 탭은 획을 안 만들고**(가로챘다) **먼 탭은 획이 된다**(그리기의 것 그대로다)
  expect(led.summary.chip_tap_strokes_delta).toBe(0);
  expect(led.summary.far_tap_strokes_delta).toBe(1);
  // 끌기는 명령을 1:1로 따라온다(± 탭 띠 안 — 마지막 좌표가 곧 지평선이다)
  expect(Math.abs(led.summary.drag_follow_ratio - 1)).toBeLessThan(0.1);
  // ⑤ 잠김 — 탭이 토글을 안 만진다. 획 증분의 판정은 덮은 요소로 갈린다:
  // 캔버스가 받았으면 그리기 탭(+1), UI(#tools 등)가 덮었으면 캔버스 미도달(0)이다
  expect(led.summary.locked_after_confirm).toBe(true);
  expect(led.summary.locked_tap_no_toggle).toBe(true);
  const spot: any = led.summary.locked_spot_element;
  expect(led.summary.locked_tap_strokes_delta)
    .toBe(spot && (spot.in_tools || spot.in_bar) ? 0 : 1);
});

// **dpr 2에서도 손잡이 탭이 선다**(#21 — 1차 리뷰어 [5]: 새 UI 배선을 dpr 1에서만 재지
// 않는다. 같은 세션의 지시 4가 dpr 2 실패를 다루는 마당이었다). 판정은 위 팔의 ①·②와
// 같은 탭 켬/끔 — 좌표 규약(css px)이 dpr에 안 걸리는지가 내용이다.
test.describe("dpr 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("손잡이 탭 켬/끔이 dpr 2에서도 선다", async ({ page }) => {
    await page.goto("/l.html");
    await page.waitForFunction(() => !!window.S2S);
    const box = (await page.locator("#frame").boundingBox())!;
    const read = () => page.evaluate(() => {
      const S = window.S2S;
      const el = document.getElementById("ink") as HTMLCanvasElement;
      return { on: S.showHorizon().on, chip_at: S.horizonChip().at,
               backing_ratio: el.width / Math.max(1, el.clientWidth) };
    });
    const s0: any = await read();
    // **섭동이 실제로 걸렸는가**(#30의 나머지 절반 — touch_route dpr 2 팔의 규약 그대로)
    expect(s0.backing_ratio).toBeGreaterThan(1.5);
    await page.mouse.move(box.x + s0.chip_at[0], box.y + s0.chip_at[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + s0.chip_at[0] + 1, box.y + s0.chip_at[1]);
    await page.mouse.up();
    await page.waitForTimeout(60);
    const s1: any = await read();
    expect(s0.on).toBe(false);
    expect(s1.on).toBe(true);
    await page.mouse.move(box.x + s1.chip_at[0], box.y + s1.chip_at[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + s1.chip_at[0] + 1, box.y + s1.chip_at[1]);
    await page.mouse.up();
    await page.waitForTimeout(60);
    const s2: any = await read();
    expect(s2.on).toBe(false);
  });
});
