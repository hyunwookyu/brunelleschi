// **큐브의 기준 좌표계 = 그린 공간의 축**(2026-08-18 10차 항목 6 · 7차 지시 8).
//
// 3점 구도(요 35°·피치 15°)에서 큐브 **정면 탭**이 어디로 나는가:
//   옛 기준계(three 세계 축): 카메라 초기 방향(세계 −z) — 그린 상자와 35° 어긋난다
//   새 기준계(그린 축):       **상자의 정면 입면**(그린 깊이축을 정면으로 본다)
// 판정은 시선과 그린 깊이축의 내적이다 — 세계 축이면 cos35° ≈ 0.82라 실패한다(음성 대조).
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("큐브 정면 탭 — 그린 상자의 입면으로 난다 (10차 항목 6)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const led: Record<string, unknown> = {};
  /**
   * **구도 하나를 도는 절차**(11차 항목 5 — 둘째 구도가 DEFERRED에 있었다).
   * 옛 판은 요 35°·피치 15° 하나였고, 그 구도에서 `old_frame.dot_gaze_depth`는
   * **cos35°·cos15° 외의 값이 나올 수 없어 크기가 정보량 0**이었다(#46 · 10차 리뷰어 5차 [1]).
   * 각도를 흔들면 그 값이 **cos(요)·cos(피치)를 따라가는지**가 예측 검증이 된다.
   */
  const runComposition = async (yaw: number, pitch: number) => {
    const setup = await setupConfirmed(page, { yaw, pitch });
    const cube = (await page.locator("#cube").boundingBox())!;
    const tapCenter = async () => {
      await page.mouse.click(cube.x + cube.width / 2, cube.y + cube.height / 2);
      await page.waitForTimeout(600);
    };
    const read = () => page.evaluate(() => {
      const S = window.S2S;
      const f = S.stage.basisOf().f;                              // 시선(three 세계)
      // 그린 깊이축(axis 1)을 three로 — mainL의 변환과 같은 뒤집기(viewport.ts 규약)
      const d = S.cam.ctx().axisDirs[1];
      const t: number[] = [d[0], -d[1], -d[2]];
      const L = Math.hypot(t[0], t[1], t[2]);
      const dot = (f[0] * t[0] + f[1] * t[1] + f[2] * t[2]) / L;
      return { forward: f, depth_axis_three: t.map(v => v / L),
               dot_gaze_depth: Math.abs(dot),
               // **음성 대조** — 세계 −z와의 내적. 옛 기준계면 이쪽이 1이다
               dot_gaze_world_z: Math.abs(f[2]) };
    });
    await tapCenter();
    const gaze = await read();
    // ---- **옛 기준계 대조 팔**(#30 — 산문 추론이 아니라 실행이다)
    await page.evaluate(() => window.S2S.setCubeFrame(false));
    await tapCenter();
    const oldFrame = await read();
    await page.evaluate(() => window.S2S.setCubeFrame(true));
    return { yaw, pitch, setup, gaze, old_frame: oldFrame,
             /** 예측: 옛 기준계의 시선(세계 −z)과 그린 깊이축의 내적 = cos(요)·cos(피치) */
             predicted_old_depth: Math.cos(yaw * Math.PI / 180) * Math.cos(pitch * Math.PI / 180) };
  };

  const c1 = await runComposition(35, 15);
  const c2 = await runComposition(20, 25);          // **둘째 구도**(11차 항목 5)
  led.setup = c1.setup;
  led.gaze = c1.gaze;
  led.old_frame = c1.old_frame;
  led.compositions = [c1, c2];

  for (const c of [c1, c2]) {
    // **시선이 그린 깊이축을 향한다** — 상자의 정면 입면이다.
    // ⚠ 이 값은 1에 붙는다(#5 — 비행 목표가 같은 변환(cubeUp)에서 나오므로 **배선 보장**).
    expect(c.gaze.dot_gaze_depth, `new/${c.yaw}/${c.pitch}`).toBeGreaterThan(0.99);
    expect(c.gaze.dot_gaze_world_z, `new/${c.yaw}/${c.pitch}`).toBeLessThan(0.95);
    // **옛 기준계에서는 두 값이 뒤집힌다 — 실측이다**
    expect(c.old_frame.dot_gaze_world_z, `old/${c.yaw}/${c.pitch}`).toBeGreaterThan(0.99);
    expect(c.old_frame.dot_gaze_depth, `old/${c.yaw}/${c.pitch}`).toBeLessThan(0.95);
    // ⚙️ **크기가 이제 예측을 검증한다**(11차 항목 5 · #46): 구도를 흔들면 그 값이
    // cos(요)·cos(피치)를 따라간다. 한 구도만 있을 때는 픽스처 상수라 정보량이 0이었다.
    expect(c.old_frame.dot_gaze_depth, `pred/${c.yaw}/${c.pitch}`)
      .toBeCloseTo(c.predicted_old_depth, 3);
  }
  // **두 구도의 값이 실제로 다르다** — 같으면 각도를 안 흔든 것이다(#32 · 양성 채널).
  expect(Math.abs(c1.old_frame.dot_gaze_depth - c2.old_frame.dot_gaze_depth))
    .toBeGreaterThan(0.02);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "cube_frame.json"), JSON.stringify({
    /** 자기보고 실행 수(11차 리뷰어 [12] · #38) — 구도 수 × 기준계 팔 둘. */
    runs: 2 * 2,
    spec: "10차 항목 6(+11차 항목 5의 둘째 구도) — 큐브 기준 좌표계가 그린 공간의 축이다: 3점 구도에서 정면 탭이 그린 깊이축을 정면으로 보는 시점(상자의 입면)으로 난다. 기준계는 카메라가 서는 순간 고정되고 도는 것은 자세뿐이다(7차 지시 8의 구분)",
    what_this_does_not_say: [
      "면 하나(정면)의 확인이다(#12) — 모서리·꼭짓점·재탭의 기준계 정합은 같은 변환 하나(cubeUp/cubeDown)를 지나므로 배선은 공유되지만 각 특징의 실측은 없다",
      "**본 팔의 두 값은 독립이 아니다**(리뷰어 4차 [1] · #5): dot_gaze_depth가 1이면(비행 목표가 같은 변환에서 나오는 배선 보장) dot_gaze_world_z는 픽스처(그린 깊이축의 z 성분)로 결정된다. **판별은 옛 기준계 팔(old_frame — setCubeFrame(false) 실행)이 든다** — 거기서 두 값이 실측으로 뒤집힌다",
      "⛔ **11차 항목 5가 이 한계를 해소했다**: 구도가 **둘**이 됐고(요 35°·피치 15° / 요 20°·피치 25°) `old_frame.dot_gaze_depth`가 두 구도에서 `compositions[*].predicted_old_depth`와 일치한다. ⛔ **그 일치를 ‘예측 검증’이라 부르지 않는다**(11차 리뷰어 [6] · #5 유형 3): 옛 배선의 시선이 정확히 세계 −z인 한 그 내적은 **깊이축의 −z 성분** 자체이고, 그 성분은 픽스처가 요·피치로 만든 값이라 **cos(요)·cos(피치)와 같을 수밖에 없다** — 어떤 각을 넣어도 통과하는 **항등**이다(실측 일치가 1e-16인 것이 그 표시다). 이 단언이 실제로 잡는 것은 **픽스처 매개변수화의 자기확인**(각도를 준 대로 장면이 서는가)이지 기준계 판정이 아니다. **그러므로 크기는 이 팔에서 원리적으로 정보를 실을 수 없다** — 초판이 ‘소수 셋째 자리까지’라고 적어 기계 엡실론 일치를 세 자리 일치로 낮춰 말한 것도 그 자리에서 정정한다. 두 값이 실제로 다른 것도 단언한다(같으면 각도를 안 흔든 것이다 — #32). ⚠ `gate.reachability_value`는 여전히 **한 구도의 값**이라 그 자리에서는 픽스처 결정이고, 정보는 **두 구도의 일치**에 있다. (연혁) **old_frame 팔의 값도 크기로는 정보가 없다**(리뷰어 5차 [1] · #40): 옛 배선이 세계 −z로 나는 한 dot_gaze_world_z는 항등 1이고 dot_gaze_depth는 이 픽스처에서 cos35°·cos15° 외의 값을 낼 수 없다(본 팔이 기각당한 그 상수와 같은 수다). **이 원장이 재는 것은 크기가 아니라 자리바꿈이다** — 정확히 1이 어느 슬롯에 오는가(본 팔: depth / 옛 팔: world_z)가 비행 방향의 범주 사실이고, 두 팔의 실행이 그 바꿈을 실측한다. 크기가 정보를 실으려면 요·피치를 흔든 둘째 구도에서 값이 cos(요)·cos(피치)를 따라가는지 봐야 한다 — ✅ **11차 항목 5가 했다**(`setupConfirmed`가 `yaw`·`pitch`를 받는다)",
      "판별 간격은 이 픽스처의 요·피치 곱이다 — cos35°·cos15° ≈ **0.7912**(초판이 cos35°=0.82라 적은 것은 피치를 빠뜨린 구성 오류 — [11] 정정. forward.y ≈ 0.212 = cos35°·sin15°가 그 피치다). 요·피치가 작은 구도에서는 두 기준계가 갈리지 않아 이 팔이 판별력을 잃는다",
      "P1(정면 확정)에서는 그린 축 = 세계 축이라 변환이 항등이다 — 그 경우는 기존 view_cube 팔들이 덮는다(그 팔들이 이 변경 후에도 통과한 것이 그 확인이다)",
      "표시(큐브가 그려지는 자세)의 픽셀 확인은 없다 — 재는 것은 탭 → 비행의 방향이다",
      "dpr 1·합성 마우스(#21·AS-C1)",
    ],
    thresholds: { dot_gaze_depth_min: 0.99, dot_gaze_world_z_max: 0.95, console_errors_max: 0,
      note: "e2e 배선 임계라 SHARED_CONSTANTS 비등재(D-L51·basic_flow thresholds와 같은 사유 — 전역 해시 눈사태). 값은 이 원장이 자기 안에 든다" },
    gate: {
      registered: "새 기준계: |시선·그린 깊이축| > 0.99(배선 보장 — #5 명시) · **옛 기준계 팔(setCubeFrame(false) 실측): |시선·세계 z| > 0.99 그리고 |시선·그린 깊이축| < 0.95** — 두 팔이 실측으로 뒤집힌다(판별 간격 = 이 픽스처의 cos35°·cos15° ≈ 0.7912) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "판별자는 **두 값의 자리바꿈**이다(#28 — 둘 다 적는다): old_frame.dot_gaze_world_z **정확히 1**(항등 — 옛 배선이 세계 −z로 난다는 배선 사실) 그리고 old_frame.dot_gaze_depth ≈ 0.7912(⚠ **크기는 픽스처 상수다** — 리뷰어 5차 [1] · #40: 이 값은 cos35°·cos15° 외일 수 없어 크기로는 정보량 0이고, 정보는 본 팔과의 자리바꿈(1의 슬롯 이동)에 있다). 초판이 본 팔의 world_z를 오라클로 적은 것을 [1]로 갈았고, 그 대체값도 같은 상수임을 5차 [1]이 잡았다 — 값 하나로 도달을 말할 수 없는 원장이다",
      reachability_value: (led.old_frame as any).dot_gaze_depth,
      reachability_value_fixture_determined: true,
      reachability_source: "old_frame/dot_gaze_depth",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
