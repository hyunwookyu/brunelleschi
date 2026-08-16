// **규칙으로 세운 카메라가 실제로 획을 3D로 올리는가** — "전환이 안 된다"의 종단 확인.
//
// 사람 지시: "전환이 안 된다. 무엇을 그려도 대기 상태다." 원인은 둘이었다:
//   ① 카메라의 입구가 검출 초안이라 초안이 없으면 카메라가 없었다 → `vpRules`가 고쳤다
//   ② **1점 투시에서는 f가 없어 `ctx()`가 `null`이었다**(자유도 1이 남는다, 이론서 5.3) —
//      그리고 무한원 축의 방향을 넘길 자리가 없어 **화면 가로·세로 획이 못 올라갔다**
//
// 여기서 확인하는 것은 ②다. **양성 채널을 함께 둔다**(#30) — 고친 것을 도로 빼면 실제로 실패하는지.
import { describe, it, expect } from "vitest";
import { CamState, DEFAULT_LENS_MM } from "../src/ui/camState.js";
import { liftAll, type LiftStroke } from "../src/s3d/lift.js";
import { representative } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const VP: Pt2 = [480, SZ[1] / 2];                 // 1점 투시 — 소실점이 **기본 지평선 위**(피치 0)

/** 소실점으로 가는 선분(끝점 둘). `t`가 소실점 쪽으로 가는 비율이다. */
const toVp = (from: Pt2, t = 0.35): Pt2[] =>
  [from, [from[0] + (VP[0] - from[0]) * t, from[1] + (VP[1] - from[1]) * t]];

/**
 * **상자 하나의 정면 + 깊이** — 1점 투시로 그린다.
 * 정면 네 변은 화면 가로·세로이고, 네 모서리에서 소실점으로 깊이선이 간다.
 */
function drawnStrokes(): { id: string; pts: Pt2[] }[] {
  const L: Pt2 = [280, 240], R: Pt2 = [680, 240], L2: Pt2 = [280, 540], R2: Pt2 = [680, 540];
  return [
    { id: "top", pts: [L, R] },
    { id: "bottom", pts: [L2, R2] },
    { id: "left", pts: [L, L2] },
    { id: "right", pts: [R, R2] },
    { id: "d_tl", pts: toVp(L) },
    { id: "d_tr", pts: toVp(R) },
    { id: "d_bl", pts: toVp(L2) },
    { id: "d_br", pts: toVp(R2) },
  ];
}

/** 앱과 같은 경로: 획을 차례로 규칙에 넣고, 축을 붙이고, 한 번에 푼다(#17). */
function run(opts: { lens?: number | null; dropAxisDirs?: boolean } = {}) {
  const cam = new CamState(SZ);
  if (opts.lens !== undefined) cam.lensMm = opts.lens;
  cam.apply();
  const strokes = drawnStrokes();
  const events: string[] = [];
  for (const s of strokes) {
    const rep = representative(s.pts)!;
    events.push(cam.feed({ a: rep.a, b: rep.b }).event.type);
  }
  const ctx = cam.ctx();
  if (!ctx) return { cam, ctx: null, events, placed: 0, axes: [] as unknown[] };
  const input: LiftStroke[] = strokes.map(s => ({
    id: s.id, pts2d: s.pts, axis: cam.axisOf(s.pts).axis,
  }));
  const r = liftAll(input, {
    principal: ctx.principal, f: ctx.f, vps: ctx.vps, imgSize: SZ,
    // **양성 채널**(#30) — 이것을 빼면 무한원 축이 방향을 잃는다. 실제로 실패하는지 본다
    axisDirs: opts.dropAxisDirs ? undefined : ctx.axisDirs,
  });
  return { cam, ctx, events, placed: r.placed.size, axes: input.map(i => i.axis) };
}

describe("규칙 → 카메라 → 3D (전환이 실제로 되는가)", () => {
  it("깊이선 **하나**에서 1점 투시가 확정된다", () => {
    const { cam, ctx, events } = run();
    expect(cam.order()).toBe(1);
    // ⚠ **세 번째가 `screen_axis`에서 `support`로 바뀌었다**(2026-08-17 A-2):
    // 수직축은 **처음부터 화면 수직**이라 세로선이 축을 새로 세우지 않고 **지지선으로 센다**.
    // 옛 판은 그 선언을 기다렸고, 그래서 **첫 획부터 세로선이 안 그어졌다**(A-1).
    expect(events.slice(0, 4)).toEqual(["screen_axis", "support", "support", "support"]);
    // **지평선이 처음부터 있으므로 첫 깊이선에서 바로 선다**(2026-08-16 2차 지시).
    // 옛 판은 여기가 `waiting`이었고 두 번째 깊이선을 기다렸다
    expect(events[4]).toBe("vp_fixed");
    expect(cam.rules.horizon).toBeCloseTo(VP[1], 6);
    expect(ctx).not.toBeNull();
    // f의 출처는 **설정**이다 — 측정이 아니고 화면이 그렇게 낸다(CLAUDE.md §1)
    expect(cam.acc.solve().camera.fSource).toBe("setting(렌즈)");
  });

  it("축이 셋 다 붙고 획이 전부 3D로 올라간다", () => {
    const { placed, axes } = run();
    expect(new Set(axes)).toEqual(new Set([0, 1, 2]));
    expect(placed).toBe(8);                        // 여덟 획 전부
  });

  // **양성 채널**(#30) — 고친 것을 도로 빼면 실패해야 한다. 안 그러면 위 통과는 아무 뜻이 없다
  it("렌즈 설정이 없으면 카메라가 안 선다 (1점의 자유도 1)", () => {
    const { ctx, placed } = run({ lens: null });
    expect(ctx).toBeNull();
    expect(placed).toBe(0);
  });

  it("무한원 축의 방향을 안 넘기면 화면 가로·세로 획이 못 올라간다", () => {
    const withDirs = run().placed;
    const without = run({ dropAxisDirs: true }).placed;
    expect(without).toBeLessThan(withDirs);
  });

  it("기본 렌즈는 35mm 환산이다", () => {
    expect(DEFAULT_LENS_MM).toBe(35);
  });
});
