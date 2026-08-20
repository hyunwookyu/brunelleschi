// **미리보기 방향 = 확정된 방향 = 소실점을 지나는 방향**(2026-08-18 7차 지시 1-c·1-d·1-e).
// 산출: `stage0/out/confirm_dir.json`.
//
// ## 사용자가 본 것
//
// > 소실점 표식 x≈1376, 지평선 y≈883. 확정된 선들은 (1355, 963) 근처에 모인다 —
// > 소실점보다 60~80px 아래. **그리는 중인 선은 소실점을 정확히 지난다.**
// > 미리보기는 스냅되고 확정은 안 된다.
//
// 원인은 `pts2d`였다: 카메라가 선 뒤의 확정 경로가 `frame() ? raw : resolve2d(raw)`로
// **원시 커서 궤적을 그대로** 문서에 넣었고(`mainL.onStrokeEnd`), 규칙(`feedStroke`)도 그
// 원시 방향을 받았다. 3D는 축으로 놓이는데 **문서에 남는 2D 선은 안 놓인 방향**이었다.
//
// 고친 자리 둘:
//   ① `placeLive`가 확정된 3D 세그먼트를 되쏘아 `pts2d`에 적는다
//      (`applySnapToStart`·`applySnapToEnd`가 이미 쓰던 규약 그대로 — #17)
//   ② `onStrokeEnd`가 **먼저 놓고 그 다음에 규칙에 넣는다**
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   **되쓰기는 설계 보장이다**(`lift.ts`의 `segGap = 0`) — 그래서 "각도 오차 0"을 재는 것은
//        측정이 아니라 **배선 확인**이다. 판정 대상은 그 배선이고, 되살림(#25)이 그것을 가른다
//   #12  한 각도·한 구도의 확인이다 — 동작점을 하나 고르지 않는다는 규칙의 예외가 아니라
//        **부족분을 적는 것**이다(아래 `what_this_does_not_say`)
//   #17  미리보기와 확정이 같은 함수를 부른다(`resolveLive`) — 이 팔이 그 주장을 종단에서 잠근다
//   #21  dpr 1·마우스 합성이다
//   #25  되살림 확인의 값은 원장 밖이다(커밋되지 않는 임시 판)
//   #41  이 게이트는 **이 항목이 등록한 것**이고 CLAUDE.md §2의 중단 조건이 아니다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene, openDrawing } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 두 방향의 각차(도) — 부호·뒤집힘 무관. */
const ANGLE = `(a, b) => {
  const d = (Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])) * 180 / Math.PI;
  const m = ((d % 180) + 180) % 180;
  return Math.min(m, 180 - m);
}`;

test("확정된 선이 소실점을 지난다 — 미리보기와 각도 오차 0 (7차 지시 1-c·1-d·1-e)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page);
  const setup = await setupScene(page);
  expect(setup.hasCamera).toBe(true);
  // **획을 3D로 올린다** — 앱의 확정 경로 그대로다(`stage.spec.ts`와 같은 관문, #17)
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(60);

  const box = (await page.locator("#ink").boundingBox())!;
  const led: Record<string, unknown> = {};
  led.setup = setup;

  // ---- 겨냥점을 만든다: **놓인 획의 끝점**에서 시작해 VP0 쪽으로 **일부러 5° 틀어** 긋는다.
  //      5°를 트는 이유는 "스냅이 실제로 방향을 고쳤는가"를 재기 위해서다 —
  //      정확히 겨냥하면 되쓰기가 있으나 없으나 같은 값이 나와 아무것도 안 갈린다(#5).
  const aim = await page.evaluate(() => {
    const S = window.S2S, sc = window.__SC;
    const lifted = S.doc().strokes.filter((x: any) => x.seg3d);
    const st = lifted[0];
    const a = st.pts2d[0] as [number, number];
    const vp = sc.vps[0] as [number, number];
    const u = [vp[0] - a[0], vp[1] - a[1]];
    const L = Math.hypot(u[0], u[1]);
    const th = (5 * Math.PI) / 180;                 // **일부러 5° 튼다**
    const d = [(u[0] * Math.cos(th) - u[1] * Math.sin(th)) / L,
               (u[0] * Math.sin(th) + u[1] * Math.cos(th)) / L];
    const R = 170;
    return { a, vp, b: [a[0] + d[0] * R, a[1] + d[1] * R] as [number, number],
             lifted: lifted.length };
  });
  led.aim = aim;

  // ---- 긋는다. **떼기 직전에 미리보기를 읽는다**(같은 함수를 부른다는 주장의 종단 확인)
  await page.mouse.move(box.x + aim.a[0], box.y + aim.a[1]);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + aim.a[0] + (aim.b[0] - aim.a[0]) * i / 8,
                          box.y + aim.a[1] + (aim.b[1] - aim.a[1]) * i / 8);
  }
  const preview = await page.evaluate(async (ANGLE_SRC) => {
    const S = window.S2S, sc = window.__SC;
    const g = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const lv = S.live();
    if (!lv || !lv.seg) return null;
    // **확정 시점에서는 세계 = 시점**이므로 그대로 되쏜다(`stage.isPinned`)
    const p0 = g.project(lv.seg[0], ctx.principal, ctx.f);
    const p1 = g.project(lv.seg[1], ctx.principal, ctx.f);
    if (!p0 || !p1) return null;
    const angle = eval(`(${ANGLE_SRC})`) as (a: number[], b: number[]) => number;
    const ax = lv.axis;
    const vp = ax != null ? S.cam.vps()[ax] : sc.vps[0];
    return {
      axis: ax, screen: [p0, p1],
      dir: [p1[0] - p0[0], p1[1] - p0[1]],
      /** 미리보기 선이 그 축의 소실점을 지나는가 — 시작점에서 소실점으로 가는 방향과의 각차 */
      to_vp_deg: angle([p1[0] - p0[0], p1[1] - p0[1]], [vp[0] - p0[0], vp[1] - p0[1]]),
    };
  }, ANGLE);
  await page.mouse.up();
  await page.waitForTimeout(60);
  led.preview = preview;
  expect(preview).toBeTruthy();

  // ---- 확정된 획을 읽는다
  const confirmed = await page.evaluate(async (ANGLE_SRC) => {
    const S = window.S2S;
    const angle = eval(`(${ANGLE_SRC})`) as (a: number[], b: number[]) => number;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    const a = st.pts2d[0], b = st.pts2d[st.pts2d.length - 1];
    const ax = typeof st.axis === "number" ? st.axis : null;
    const vp = ax != null ? S.cam.vps()[ax] : null;
    return {
      axis: st.axis, placed: !!st.seg3d,
      pts2d: [a, b],
      /** **1-d**: 시작점은 스냅된 자리다(위치) */
      snap_start: st.snapStart ? st.snapStart.kind : null,
      snap_end: st.snapEnd ? st.snapEnd.kind : null,
      /** **1-e ①**: 확정된 `pts2d` 방향이 소실점을 지나는가 */
      to_vp_deg: vp ? angle([b[0] - a[0], b[1] - a[1]], [vp[0] - a[0], vp[1] - a[1]]) : null,
      /** 규칙이 그 선을 어떻게 읽는가 — 확정 방향을 받았는지의 확인(1-c) */
      rule_axis: S.cam.axisOf(st.pts2d),
    };
  }, ANGLE);
  led.confirmed = confirmed;

  // ---- **1-e ②**: 미리보기 방향과 확정된 `pts2d` 방향의 각차
  const dirDeg = await page.evaluate(async ({ ANGLE_SRC, pv }) => {
    const S = window.S2S;
    const angle = eval(`(${ANGLE_SRC})`) as (a: number[], b: number[]) => number;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    const a = st.pts2d[0], b = st.pts2d[st.pts2d.length - 1];
    return angle([b[0] - a[0], b[1] - a[1]], pv);
  }, { ANGLE_SRC: ANGLE, pv: preview!.dir });
  led.preview_vs_confirm_deg = dirDeg;

  // ---- 판정
  expect(confirmed.placed).toBe(true);
  expect(confirmed.snap_start).toBeTruthy();              // **1-d 위치**: 시작점이 붙었다
  expect(typeof confirmed.axis).toBe("number");           // **1-d 축**: 방향이 축으로 정해졌다
  expect(confirmed.to_vp_deg!).toBeLessThan(0.01);        // **소실점을 지난다**
  expect(dirDeg).toBeLessThan(0.01);                      // **미리보기와 같다**
  // 겨냥은 5° 틀어 놓았다 — 되쓰기가 없으면 이 값이 5° 근처로 남는다(양성 채널 #30)
  expect(preview!.to_vp_deg).toBeLessThan(0.01);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "confirm_dir.json"), JSON.stringify({
    spec: "7차 지시 1-c·1-d·1-e — 확정된 `pts2d`의 방향이 미리보기와 같고 그 축의 소실점을 지난다. "
        + "시작점은 스냅된 자리(위치)이고 방향은 축이 정한다(1-d: 둘 다 성립한다). "
        + "겨냥을 **일부러 5° 틀어** 그어서 되쓰기가 실제로 방향을 고치는지 본다.",
    what_this_does_not_say: [
      "**한 구도·한 각도(5°)·한 축(VP0)의 확인이다**(#12) — 각도 스윕을 안 돌렸다",
      "**되쓰기는 설계 보장이다**(#5: `lift.ts`의 `segGap = 0`). 그래서 '각도 오차 0'은 "
        + "측정이 아니라 **배선 확인**이고, 판정 대상은 그 배선이다",
      "**되살림 확인(A-4·#25)**: `placeLive`의 `pts2d` 되쓰기 블록을 지우면 `to_vp_deg`가 "
        + "겨냥한 5° 근처로 남아 이 팔이 실패한다 — 되살린 판은 커밋되지 않으므로 값은 원장 밖이다",
      "**확정 뷰(pinned)에서만이다** — 돌린 시점에서는 `pts2d`가 그 뷰의 화면 좌표이고 "
        + "이 팔은 그 경우를 안 본다",
      "dpr 1·마우스 합성이다(#21·AS-C1)",
      "⚠ **판정 임계 0.01°는 공유 상수(`test/constants.ts`)에 안 넣는다**(7-R 리뷰어 [11]). "
        + "사유는 D-L49·D-L51·`OSNAP_RADIUS_PX`와 같은 자리다: 전역 해시가 하나뿐이라 넣으면 "
        + "이 값에 의존한 적 없는 원장 40여 개가 STALE이 된다. 그리고 이 값은 **측정 임계가 "
        + "아니라 배선 문턱**이다 — 참값이 정확히 0(설계 보장)이고 되살림 판은 4.52°라 "
        + "0.01과 1.0 사이 어디에 두어도 판정이 같다. 임계가 결론을 정하지 않는다(#13의 반대 상황). "
        + "값은 이 원장의 `thresholds`에 그대로 적히므로 바뀌면 원장이 달라진다",
    ],
    thresholds: { to_vp_deg_max: 0.01, preview_vs_confirm_deg_max: 0.01, console_errors_max: 0 },
    gate: {
      registered: "확정된 `pts2d`의 방향이 ① 그 축의 소실점을 지나고(각차 < 0.01°) "
        + "② 미리보기 방향과 같다(각차 < 0.01°). 시작점은 스냅된 자리다(`snapStart` 있음). "
        + "겨냥은 5° 틀어 준다 · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — "
        + "되쏘기 항등은 `lift.ts`의 보장이고(#5) 판정 대상은 그 보장이 확정 경로에 배선됐는가다. "
        + "자명하지 않은 몫은 **겨냥을 5° 틀어 놓은 것**이다: 배선이 없으면 그 5°가 그대로 남는다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
