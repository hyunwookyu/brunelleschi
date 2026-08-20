// **새 절차 — 지평선을 먼저 긋는다**(2026-08-20 18차 지시 q의 회귀 팔).
// 산출: `stage0/out/horizon_first.json`.
//
// 지시 q가 잠글 것 일곱:
//   ① 지평선 → 깊이선 → 깊이선으로 **2점**이 서는지
//   ② 지평선 → 깊이선 하나로 **1점**이 서는지
//   ③ 확정 후 **초기 선이 사라지고** 계산된 지평선이 **같은 y**에 있는지(지시 m)
//   ④ 그 뒤 그은 획이 **처음부터 축에 정렬**되는지
//   ⑤ 보조 소실점이 계산된 지평선 위에 찍히는지
//   ⑥ 깊이선으로 정의된 획에 **경고가 안 뜨는지**(지시 c-5)
//   ⑦ 알림이 **최상단 한 줄**로만 뜨고 **박스가 없는지**(지시 f~i)
//
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 걸리는 번호는 `progress.md` 18차 착수 표가 든다.
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("지평선을 먼저 긋는다 — 절차 전체가 앱에서 돈다", async ({ page }) => {
  await page.goto("/l.html");
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click());
  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;

  const draw = async (a: [number, number], b: [number, number]) => {
    await page.mouse.move(box.x + a[0], box.y + a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(box.x + a[0] + (b[0] - a[0]) * i / 10,
                            box.y + a[1] + (b[1] - a[1]) * i / 10);
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  const read = () => page.evaluate(() => {
    const S = window.S2S;
    const o = S.draftOverlay();
    const el = document.getElementById("status")!;
    return {
      horizon: S.horizon(), order: S.order(), standing: S.standing(),
      vps: S.camSnapshot().vps,
      strokes: S.doc().strokes.length,
      lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
      overlay_horizon_y: o ? o.horizonY : null,
      note: S.noteLine(),
      /** 지시 f~i — 최상단 한 줄인가. 박스(승격 패널·물음 패널)가 없는가. */
      status_ui: {
        text: el.textContent ?? "",
        boxes: el.querySelectorAll("div,button").length,
        acts: el.querySelectorAll("u[data-act]").length,
        top: Math.round(el.getBoundingClientRect().top),
        lines: Math.round(el.getBoundingClientRect().height),
        nowrap: getComputedStyle(el).whiteSpace,
      },
    };
  });

  const HY = Math.round(H * 0.42);            // 사용자가 고른 시선 높이
  const steps: any[] = [];
  steps.push({ label: "⓪ 빈 화면", ...(await read()) });

  // ---- ① 지평선을 긋는다. **첫 동작이고 안내는 없다**(지시 g·j)
  await draw([W * 0.2, HY], [W * 0.8, HY]);
  steps.push({ label: "① 지평선", ...(await read()) });

  // ---- ② 깊이선 하나 → 1점 확정
  await draw([W * 0.5, H * 0.72], [W * 0.28, H * 0.64]);
  steps.push({ label: "② 깊이선 하나(1점)", ...(await read()) });

  // ---- ③ 다른 방향 깊이선 → 2점 확정
  await draw([W * 0.5, H * 0.72], [W * 0.74, H * 0.65]);
  steps.push({ label: "③ 깊이선 둘(2점)", ...(await read()) });

  // ---- ④ 그 뒤 그은 획이 처음부터 축에 정렬되는지
  await draw([W * 0.42, H * 0.55], [W * 0.62, H * 0.58]);
  const after = await read();
  const axisAligned = await page.evaluate(() => {
    const S = window.S2S;
    const last = S.doc().strokes[S.doc().strokes.length - 1];
    return last ? { axis: last.axis, has3d: !!last.seg3d } : null;
  });
  steps.push({ label: "④ 확정 뒤의 획", ...after, stroke: axisAligned });

  // ---- ⑤ 보조 소실점이 계산된 지평선 위에 찍히는지
  const aux = await page.evaluate(() => {
    const S = window.S2S;
    S.addAux ? S.addAux(30) : null;
    const o = S.draftOverlay();
    const a = o && o.auxVps ? o.auxVps.find((x: any) => x && x.at) : null;
    return a ? { at: a.at, horizonY: o.horizonY, dy: Math.abs(a.at[1] - o.horizonY) } : null;
  });

  const led = {
    what: "지평선을 먼저 긋는 새 절차가 앱에서 도는가(18차 지시 q).",
    how: {
      steps: "빈 화면 → 지평선 한 획 → 깊이선 → 다른 방향 깊이선 → 그 뒤의 획. "
        + "**실제 포인터 사건**으로 그린다(#17 — 하네스가 함수를 부르지 않는다).",
      erase: "지시 m — 소실점을 만든 획은 **문서에 안 남는다**. `strokes`가 그 실측이다. "
        + "⚠⚠ **19차에 이 필드의 뜻이 좁아졌다**(#57 — 기전을 옮기면 그것을 재던 팔도 함께 "
        + "본다): 그때까지 `strokes` 0은 «문서에서도 화면에서도 사라졌다»였는데, 19차 지시 "
        + "1·2로 **화면에서는 «그리기 첫 획»까지 옅게 남는다**(작도선 · D-L114). 그러므로 "
        + "여기의 0은 이제 **문서 몫만** 말한다 — 화면 몫을 재는 것은 "
        + "`procedure_repair.json`의 `arms.A`(`seeds`·`seed_px`)이고, 이 원장은 그것을 안 든다.",
      same_y: "지시 m — 계산된 지평선이 그은 자리와 같은 y인가. 소실점 = 선 × 지평선이므로 "
        + "**같은 것이 구성의 귀결**이다(#5) — 값이 아니라 배선을 잰다.",
      one_line: "지시 f~i — `status_ui`가 그 실측이다: `boxes`(div·button 수)가 0이고 "
        + "`nowrap`이 `nowrap`이며 `top`이 0이다.",
    },
    what_this_does_not_say: [
      "dpr 1 · 마우스 합성 · 한 구도다(#12·#21).",
      "**그린 선이 3D에 옳게 놓이는가는 안 잰다** — 여기서 재는 것은 절차의 배선이다.",
      "`same_y`가 0인 것은 **설계 보장**이다(#5) — 소실점의 y가 곧 지평선이다. "
      + "값으로 안 읽는다. 측정인 것은 `strokes`(사라졌는가)와 `status_ui`다.",
      "지시 l(«지평선 전에는 그리기가 안 열린다»)이 실사용을 막는지는 **안 쟀다** — "
      + "그 판단은 사람이 그려 봐야 나온다. `DEFERRED`에 되살릴 조건을 적었다.",
    ],
    selfcheck_notes: {
      zero_strokes: "확정 뒤 `strokes`가 0인 것은 **재현하려는 동작 자체**다(지시 4·m) — "
        + "집계가 안 돈 것이 아니다. 그 뒤 ④에서 1로 는다. "
        + "⚠ 19차 이후 이 0은 **문서 몫만**이다(위 `how.erase`).",
      same_y_zero: "`overlay_horizon_y − horizon.y`가 0인 것은 보장이다(위 `how.same_y`).",
    },
    steps, aux,
    summary: {
      orders: steps.map(s => s.order),
      strokes: steps.map(s => s.strokes),
      horizon_y: steps.map(s => (s.horizon ? s.horizon.y : null)),
      overlay_horizon_y: steps.map(s => s.overlay_horizon_y),
      /** 지시 m — 그은 y와 계산된 y의 차(px). **보장**이라 값으로 안 읽는다. */
      same_y_gap: steps.map(s => (s.horizon && s.overlay_horizon_y != null
        ? Math.abs(s.horizon.y - s.overlay_horizon_y) : null)),
      /** 지시 f~i — 박스가 하나도 없어야 한다. */
      status_boxes: steps.map(s => s.status_ui.boxes),
      status_top: steps.map(s => s.status_ui.top),
      status_nowrap: steps.map(s => s.status_ui.nowrap),
      /** 지시 c-5·g — 절차대로 그으면 알림이 **안 뜬다**. */
      note_texts: steps.map(s => s.status_ui.text),
      aux_on_horizon_px: aux ? aux.dy : null,
      final_stroke: axisAligned,
    },
    gate: {
      registered: "지평선 → 깊이선 → 깊이선으로 **2점**이 서고(`summary.orders`), 소실점을 "
        + "만든 획이 **사라지며**(`summary.strokes`), 알림은 **박스 없는 한 줄**이다"
        + "(`summary.status_boxes` 전부 0).",
      reachability: "되살릴 것은 «옛 절차»다 — 지평선 없이 깊이선을 먼저 그으면 "
        + "**아무것도 안 선다**(`steps[0]`의 차수 0에서 ①까지 0을 유지한다). 그 0이 "
        + "«지평선이 실제로 문을 연다»의 증거다.",
      reachability_source: "summary/orders",
      reachability_value: null as unknown,
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  (led.gate as any).reachability_value = led.summary.orders;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "horizon_first.json"), JSON.stringify(led, null, 1));

  // ① 지평선을 긋기 전에는 아무것도 안 선다
  expect(steps[0].horizon.y).toBeNull();
  expect(steps[0].order).toBe(0);
  // ② 지평선이 그어진다 — 그 y에
  expect(steps[1].horizon.y).toBeCloseTo(HY, 0);
  expect(steps[1].order).toBe(0);
  expect(steps[1].strokes).toBe(0);            // 지평선은 **획으로 안 남는다**(지시 4)
  // ③ 깊이선 하나 = 1점
  expect(steps[2].order).toBe(1);
  expect(steps[2].standing).toBe(true);
  // ④ 다른 방향 깊이선 = 2점
  expect(steps[3].order).toBe(2);
  // ⑤ **소실점을 만든 획이 사라진다**(지시 m) — 문서에 안 남는다
  expect(steps[2].strokes).toBe(0);
  expect(steps[3].strokes).toBe(0);
  // ⑥ **계산된 지평선이 같은 y에 있다**(보장 — 값으로 안 읽지만 배선은 확인한다)
  expect(steps[3].overlay_horizon_y).toBeCloseTo(steps[3].horizon.y, 3);
  // ⑦ **알림은 박스 없는 최상단 한 줄이다**(지시 f~i)
  for (const s of steps) {
    expect(s.status_ui.boxes).toBe(0);
    expect(s.status_ui.top).toBe(0);
    expect(s.status_ui.nowrap).toBe("nowrap");
  }
  // ⑧ **절차대로 그으면 알림이 안 뜬다**(지시 g·c-5)
  expect(steps.map(s => s.status_ui.text).join("")).toBe("");
});
