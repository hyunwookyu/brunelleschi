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
  // **시선이 그린 깊이축을 향한다** — 상자의 정면 입면이다
  expect((led.gaze as any).dot_gaze_depth).toBeGreaterThan(0.99);
  // **세계 축이 아니다**(음성 대조 — 요 35° 구도라 두 판정이 겹칠 수 없다)
  expect((led.gaze as any).dot_gaze_world_z).toBeLessThan(0.95);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "cube_frame.json"), JSON.stringify({
    spec: "10차 항목 6 — 큐브 기준 좌표계가 그린 공간의 축이다: 3점 구도에서 정면 탭이 그린 깊이축을 정면으로 보는 시점(상자의 입면)으로 난다. 기준계는 카메라가 서는 순간 고정되고 도는 것은 자세뿐이다(7차 지시 8의 구분)",
    what_this_does_not_say: [
      "면 하나(정면)의 확인이다(#12) — 모서리·꼭짓점·재탭의 기준계 정합은 같은 변환 하나(cubeUp/cubeDown)를 지나므로 배선은 공유되지만 각 특징의 실측은 없다",
      "P1(정면 확정)에서는 그린 축 = 세계 축이라 변환이 항등이다 — 그 경우는 기존 view_cube 팔들이 덮는다(그 팔들이 이 변경 후에도 통과한 것이 그 확인이다)",
      "표시(큐브가 그려지는 자세)의 픽셀 확인은 없다 — 재는 것은 탭 → 비행의 방향이다",
      "dpr 1·합성 마우스(#21·AS-C1)",
    ],
    thresholds: { dot_gaze_depth_min: 0.99, dot_gaze_world_z_max: 0.95, console_errors_max: 0 },
    gate: {
      registered: "3점 구도 정면 탭 뒤 |시선·그린 깊이축| > 0.99 · |시선·세계 z| < 0.95(음성 대조 — 옛 기준계는 이 값이 1이 되고 위가 cos35°=0.82로 실패한다) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "음성 대조 필드(dot_gaze_world_z)가 오라클이다 — 옛 기준계(세계 축)에서는 두 단언의 참 거짓이 정확히 뒤집힌다(요 35° 구도가 두 축을 0.82로 가른다). 실측 값이 그 판별 간격 안에 있다",
      reachability_value: (led.gaze as any).dot_gaze_world_z,
      reachability_source: "gaze/dot_gaze_world_z",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
