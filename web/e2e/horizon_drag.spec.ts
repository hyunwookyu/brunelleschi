// **지평선을 선 위에서 끌 수 있다 — 그리고 소실점이 서면 잠긴다**
// (2026-08-19 15차 항목 5 · D-L104). 산출: `stage0/out/horizon_drag.json`.
//
// 사용자 지시 5(압축 기록): *"선 위에서 드래그 · 토글 부착 · 확정 후 조작 가능 여부 판단."*
//
// 재현(수리 전 — `arms.off`가 그것을 되살린다): `horizonGrab`이 **어느 상태에서도**
// 참이 안 됐다. 두 술어가 상호배타이기 때문이다 —
//   · `horizonVisible()`   = 슬롯 0·1 중 하나가 `kind: "vp"`   (소실점이 **서야** 참)
//   · `horizonAdjustable()`= 어느 슬롯도 `kind: "vp"`가 아님    (소실점이 **서면** 거짓)
// `horizonGrab`은 둘 다 요구했다. 손잡이가 그려지지도, 잡히지도 않았다 — 끌기 경로 전체가
// 죽은 코드였다. ⚠ 이것은 D-L45가 등재한 "확정 후 잠금"이 **아니다**: 잠금은 확정 뒤의
// 규약인데 확정 **전에도** 안 잡혔다.
//
// **확정 후 조작 가능 여부의 답은 «못 옮긴다»이다**(D-L104) — 근거는 새로 재지 않고
// D-L32의 실측(사후 사영이 배치를 2049 → 792로 떨어뜨렸다)을 든다. 이 원장이 더하는 것은
// **잠김이 화면에 말해지는가**(버튼 라벨 "지평선 잠김" · `disabled`)다.
//
// 착수 시 `PITFALLS.md`를 읽었다(표는 `progress.md`의 이 항목 착수 절):
//   #12 상태 넷(빈 화면·토글 켬·소실점 섬·확정 후) · #17 반경은 `PICK_TOL` 그대로
//   #21 dpr 1 · #30 되살림은 `setShowHorizon(false)` · #35 도달 불가를 안전으로 안 읽는다
//   #40·#46 도달 가능성 값은 **연속량**(끌어서 실제로 옮겨진 px) — 상태 수가 아니다
//   #47 수치를 산문에 안 박는다 · #49 잡기 판정의 단위(세로 px)를 그린 선과 맞춘다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { PICK_TOL } from "../src/ui/pick.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 지금 상태의 지평선 — 보임·잠김·잡힘(선 위 세 자리에서). */
const READ = `(() => {
  const S = window.S2S;
  const h = S.horizon();
  const w = document.getElementById("ink").clientWidth;
  return {
    y: Math.round(h.y * 10) / 10,
    visible: h.visible, adjustable: h.adjustable,
    toggle: S.showHorizon(),
    grab_at: [0.15, 0.5, 0.85].map(t => S.horizonGrab([w * t, h.y])),
    grab_off: S.horizonGrab([w * 0.5, h.y + 70]),
  };
})()`;

/** 지평선을 `dy`만큼 끌고 실제로 옮겨진 양을 낸다. */
async function drag(page: any, dy: number) {
  const box = (await page.locator("#frame").boundingBox())!;
  const st: any = await page.evaluate(READ);
  const y0 = st.y;
  const x = box.x + box.width * 0.5;
  await page.mouse.move(x, box.y + y0);
  await page.mouse.down();
  await page.mouse.move(x, box.y + y0 + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const after: any = await page.evaluate(READ);
  return { requested_dy_px: dy, y_before: y0, y_after: after.y,
           moved_px: Math.round((after.y - y0) * 10) / 10,
           strokes: await page.evaluate(() => window.S2S.doc().strokes.length) };
}

/** 상태 넷을 돈다. `on`이 토글(= 측정 스위치, #30). */
async function suite(page: any, on: boolean) {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate((v: boolean) => window.S2S.setShowHorizon(v), on);
  const empty = await page.evaluate(READ);
  const dragged = await drag(page, 60);
  await setupScene(page);
  await page.evaluate((v: boolean) => window.S2S.setShowHorizon(v), on);
  const stood = await page.evaluate(READ);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(60);
  const confirmed = await page.evaluate(READ);
  return { on, empty, dragged, stood, confirmed };
}

test("지평선 — 선 위에서 끌리고, 소실점이 서면 잠긴다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  const armOn: any = await suite(page, true);
  const armOff: any = await suite(page, false);

  const led: any = {
    what: "지평선이 **선 위 어디서나** 끌리는가, 그리고 소실점이 선 뒤에는 잠기고 그 잠김이 "
      + "화면에 말해지는가(지시 5).",
    how: {
      arms: "상태 넷(빈 화면 · 끌기 · 소실점 섬 · 확정 후)을 **토글 켬/끔**으로 두 번 돈다. "
        + "끔이 수리 전 거동이다(#30) — 그 팔에서 `grab_at`이 **전부 거짓**인 것이 재현이다.",
      grab: "`grab_at`은 선 위 **세 자리**(가로 15%·50%·85%)에서 묻는다 — 손잡이 하나가 "
        + "아니라 «선 위에서»가 지시이기 때문이다. `grab_off`는 선에서 70px 떨어진 반례다.",
      moved: "끌기의 효과는 **실제로 옮겨진 px**(`dragged.moved_px`)로 잰다 — 요청한 dy가 "
        + "아니다(#49: 판정이 드는 양은 결과다). 화면 경계에서 잘리므로 둘이 갈릴 수 있다.",
    },
    what_this_does_not_say: [
      "dpr 1·마우스·한 픽스처다(#12·#21). 터치의 지평선 끌기는 여기서 안 돈다 — "
      + "그 라우팅은 `touch_route.spec.ts`가 든다.",
      "**«확정 후 못 옮긴다»의 근거를 여기서 재지 않는다**(#5) — 그 값은 D-L32의 실측"
      + "(사후 사영 배치 2049 → 792)이고 이 원장은 **잠겼는가와 그것을 말하는가**만 든다.",
      "**지평선을 옮긴 뒤의 배치 정확도는 안 잰다** — 옮기는 것이 열리는 상태에는 놓인 획이 "
      + "아직 없다(소실점이 서기 전이다). 그래서 잴 배치가 구성상 없다.",
      "**롤이 있는 시점의 잡기는 안 잰다**(#49의 잔여): 그려지는 지평선은 두 소실점을 잇는 "
      + "**선분**인데(D-L101) 잡기 판정은 스칼라 y 밴드다. 둘이 갈리는 것은 소실점이 선 "
      + "뒤이고 그때는 **안 잡히므로** 지금은 갈릴 자리가 없다 — 확정 후 끌기가 열리면 "
      + "그때 점-선분 거리로 옮긴다(`DEFERRED`).",
      "토글 자체의 화면 칠해짐(버튼 라벨·`disabled`)은 `toggle.locked`로만 잰다 — "
      + "픽셀은 안 잰다.",
    ],
    arms: { on: armOn, off: armOff },
    summary: {
      on_grab_empty: armOn.empty.grab_at,
      off_grab_empty: armOff.empty.grab_at,
      on_grab_confirmed: armOn.confirmed.grab_at,
      off_grab_confirmed: armOff.confirmed.grab_at,
      on_visible: [armOn.empty.visible, armOn.stood.visible, armOn.confirmed.visible],
      off_visible: [armOff.empty.visible, armOff.stood.visible, armOff.confirmed.visible],
      locked: [armOn.empty.toggle.locked, armOn.stood.toggle.locked,
               armOn.confirmed.toggle.locked],
      moved_px: [armOn.dragged.moved_px, armOff.dragged.moved_px],
      /** 두 팔의 **차** — 게이트 값(#40). 스위치를 끄면 0이 된다 */
      moved_gap_px: Math.round((armOn.dragged.moved_px - armOff.dragged.moved_px) * 10) / 10,
      strokes_after_drag: [armOn.dragged.strokes, armOff.dragged.strokes],
      grab_off_line: [armOn.empty.grab_off, armOff.empty.grab_off],
    },
    gate: {
      registered: "지평선이 선 위 세 자리에서 잡히고 실제로 옮겨지며, 소실점이 선 뒤에는 "
        + "잠기고 그 잠김이 `toggle.locked`로 나온다. 판정은 `summary`의 필드가 든다(#47).",
      reachability: "**옛 경로가 실제로 못 끌었는가** — 값은 두 팔의 **차**"
        + "(`moved_gap_px` = 켬에서 옮겨진 px − 끔에서 옮겨진 px)다. 0이면 이 원장은 "
        + "아무것도 안 말한다(#32·#40). 상태 **수**를 값으로 안 쓴다(#46) — 옮겨진 px가 "
        + "연속량이다. 두 팔의 값 자체는 `summary.moved_px`가 든다.",
      reachability_value: null as unknown,
      reachability_source: "summary/moved_gap_px",
      reachability_value_fixture_determined: false,
      result: {} as Record<string, unknown>,
    },
    selfcheck_notes: {
      off_moved_zero: "`moved_px[1]`(끔 팔)이 정확히 0인 것은 **수리 전 거동의 재현**이다 — "
        + "보장이 아니라 이 원장이 재려는 결함 자체이고, 그래서 임계를 건다(#5와 반대 방향: "
        + "0이 나와야 재현이 성립한다).",
      strokes_zero: "`strokes_after_drag` 0은 **끌기가 획으로 안 샌다**는 뜻이다(D-L45의 "
        + "`dragMode` 분기). 끔 팔의 0은 다른 이유다 — 잡히지 않아 그 자리가 그리는 자리가 "
        + "되는데, 그 끌기는 획으로 남을 수도 있다(그 수가 여기 그대로 나온다).",
    },
    ui_constants: { pick_radius_ratio: PICK_TOL.radius_ratio },
    pitfall_citations: [5, 12, 17, 21, 25, 30, 32, 35, 40, 42, 46, 47, 49, 50],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.moved_gap_px;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "horizon_drag.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **재현**(#30·#40) — 토글이 없던 거동에서는 어느 자리에서도 안 잡히고 안 옮겨진다
  expect(armOff.empty.grab_at).toEqual([false, false, false]);
  expect(armOff.dragged.moved_px).toBe(0);
  // **지시 5-a** — 켜면 **선 위 세 자리 전부**에서 잡히고 실제로 옮겨진다
  expect(armOn.empty.grab_at).toEqual([true, true, true]);
  expect(Math.abs(armOn.dragged.moved_px)).toBeGreaterThan(10);
  // **반례** — 선에서 떨어지면 안 잡힌다(밴드가 화면 전체가 아니다)
  expect(armOn.empty.grab_off).toBe(false);
  // **지시 5-c** — 소실점이 서면 잠기고, 잠김이 나온다. 확정 후에도 그대로다
  expect(armOn.stood.toggle.locked).toBe(true);
  expect(armOn.confirmed.toggle.locked).toBe(true);
  expect(armOn.confirmed.grab_at).toEqual([false, false, false]);
  // **잠긴 뒤에도 지평선은 보인다**(D-L59 ② — 결과로서의 지평선)
  expect(armOn.confirmed.visible).toBe(true);
  expect(armOff.confirmed.visible).toBe(true);
  // **끌기가 획으로 안 샌다**(D-L45의 `dragMode`)
  expect(armOn.dragged.strokes).toBe(0);
});
