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
  led.setup = await setupConfirmed(page);          // 3점 구도(요 35°·피치 15°) — 참 소실점

  // 큐브 중앙 탭 = 정면 면. 비행(280ms) 뒤 시선을 읽는다
  const cube = (await page.locator("#cube").boundingBox())!;
  await page.mouse.click(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.waitForTimeout(600);

  led.gaze = await page.evaluate(() => {
    const S = window.S2S;
    const f = S.stage.basisOf().f;                              // 시선(three 세계)
    // 그린 깊이축(axis 1)을 three로 — mainL의 변환과 같은 뒤집기(viewport.ts 규약)
    const d = S.cam.ctx().axisDirs[1];
    const t: number[] = [d[0], -d[1], -d[2]];
    const L = Math.hypot(t[0], t[1], t[2]);
    const dot = (f[0] * t[0] + f[1] * t[1] + f[2] * t[2]) / L;
    return { forward: f, depth_axis_three: t.map(v => v / L),
             dot_gaze_depth: Math.abs(dot),
             // **음성 대조** — 세계 −z와의 내적. 옛 기준계면 이쪽이 1이고 위가 cos35°다
             dot_gaze_world_z: Math.abs(f[2]) };
  });
  // **시선이 그린 깊이축을 향한다** — 상자의 정면 입면이다.
  // ⚠ 이 값은 1에 붙는다(#5 — 비행 목표가 같은 변환(cubeUp)에서 나오므로 **배선 보장**이다.
  // 판별은 아래 옛 기준계 팔이 든다 — 옛 배선에서는 이 값이 0.79로 떨어진다)
  expect((led.gaze as any).dot_gaze_depth).toBeGreaterThan(0.99);
  expect((led.gaze as any).dot_gaze_world_z).toBeLessThan(0.95);

  // ---- **옛 기준계 대조 팔**(#30 · 리뷰어 4차 [1] — 산문 추론이 아니라 실행이다):
  //      기준계를 세계 축으로 되돌리고 같은 탭을 하면 시선이 세계 −z로 가고
  //      그린 깊이축과는 그 구도의 곱각(cos35°·cos15° ≈ 0.7912)만큼 어긋난다.
  await page.evaluate(() => window.S2S.setCubeFrame(false));
  await page.mouse.click(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.waitForTimeout(600);
  led.old_frame = await page.evaluate(() => {
    const S = window.S2S;
    const f = S.stage.basisOf().f;
    const d = S.cam.ctx().axisDirs[1];
    const t: number[] = [d[0], -d[1], -d[2]];
    const L = Math.hypot(t[0], t[1], t[2]);
    return { dot_gaze_depth: Math.abs((f[0] * t[0] + f[1] * t[1] + f[2] * t[2]) / L),
             dot_gaze_world_z: Math.abs(f[2]) };
  });
  await page.evaluate(() => window.S2S.setCubeFrame(true));
  // **옛 기준계에서는 두 값이 정확히 뒤집힌다 — 실측이다**(추론이 아니라)
  expect((led.old_frame as any).dot_gaze_world_z).toBeGreaterThan(0.99);
  expect((led.old_frame as any).dot_gaze_depth).toBeLessThan(0.95);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "cube_frame.json"), JSON.stringify({
    spec: "10차 항목 6 — 큐브 기준 좌표계가 그린 공간의 축이다: 3점 구도에서 정면 탭이 그린 깊이축을 정면으로 보는 시점(상자의 입면)으로 난다. 기준계는 카메라가 서는 순간 고정되고 도는 것은 자세뿐이다(7차 지시 8의 구분)",
    what_this_does_not_say: [
      "면 하나(정면)의 확인이다(#12) — 모서리·꼭짓점·재탭의 기준계 정합은 같은 변환 하나(cubeUp/cubeDown)를 지나므로 배선은 공유되지만 각 특징의 실측은 없다",
      "**본 팔의 두 값은 독립이 아니다**(리뷰어 4차 [1] · #5): dot_gaze_depth가 1이면(비행 목표가 같은 변환에서 나오는 배선 보장) dot_gaze_world_z는 픽스처(그린 깊이축의 z 성분)로 결정된다. **판별은 옛 기준계 팔(old_frame — setCubeFrame(false) 실행)이 든다** — 거기서 두 값이 실측으로 뒤집힌다",
      "판별 간격은 이 픽스처의 요·피치 곱이다 — cos35°·cos15° ≈ **0.7912**(초판이 cos35°=0.82라 적은 것은 피치를 빠뜨린 구성 오류 — [11] 정정. forward.y ≈ 0.212 = cos35°·sin15°가 그 피치다). 요·피치가 작은 구도에서는 두 기준계가 갈리지 않아 이 팔이 판별력을 잃는다",
      "P1(정면 확정)에서는 그린 축 = 세계 축이라 변환이 항등이다 — 그 경우는 기존 view_cube 팔들이 덮는다(그 팔들이 이 변경 후에도 통과한 것이 그 확인이다)",
      "표시(큐브가 그려지는 자세)의 픽셀 확인은 없다 — 재는 것은 탭 → 비행의 방향이다",
      "dpr 1·합성 마우스(#21·AS-C1)",
    ],
    thresholds: { dot_gaze_depth_min: 0.99, dot_gaze_world_z_max: 0.95, console_errors_max: 0,
      note: "e2e 배선 임계라 SHARED_CONSTANTS 비등재(D-L51·basic_flow thresholds와 같은 사유 — 전역 해시 눈사태). 값은 이 원장이 자기 안에 든다" },
    gate: {
      registered: "새 기준계: |시선·그린 깊이축| > 0.99(배선 보장 — #5 명시) · **옛 기준계 팔(setCubeFrame(false) 실측): |시선·세계 z| > 0.99 그리고 |시선·그린 깊이축| < 0.95** — 두 팔이 실측으로 뒤집힌다(판별 간격 = 이 픽스처의 cos35°·cos15° ≈ 0.7912) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "**옛 기준계 팔의 |시선·그린 깊이축|이 오라클이다** — 실측 값(old_frame.dot_gaze_depth ≈ 0.79)이 본 팔의 1과 갈리는 간격이 판별력이다. 초판이 본 팔의 world_z(픽스처 상수 — #40 ②)를 오라클로 적은 것을 [1]로 갈아 끼웠다",
      reachability_value: (led.old_frame as any).dot_gaze_depth,
      reachability_source: "old_frame/dot_gaze_depth",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
