// **규칙으로 세운 카메라가 실제로 획을 3D로 올리는가** — "전환이 안 된다"의 종단 확인.
//
// 사람 지시: "전환이 안 된다. 무엇을 그려도 대기 상태다." 원인은 둘이었다:
//   ① 카메라의 입구가 검출 초안이라 초안이 없으면 카메라가 없었다 → `vpRules`가 고쳤다
//   ② **1점 투시에서는 f가 없어 `ctx()`가 `null`이었다**(자유도 1이 남는다, 이론서 5.3) —
//      그리고 무한원 축의 방향을 넘길 자리가 없어 **화면 가로·세로 획이 못 올라갔다**
//
// ⚠⚠ **2026-08-17 지시 1이 ②의 처리를 다시 바꿨다.** C-2의 거리점 경로는 폐기됐다
// (대각선이 거리점인지 2점 승격인지 기하로 구분 불가). **P1(가로선 확정)의 f는 임의값**이다 —
// 깊이 배율일 뿐이고 형태는 정확하다(`frontalWorld` 게이지). 그래서 대각선 없이도 3D가 선다.
// 반례는 **NONE**(가로선 없는 소실점 하나)이다 — 거기서는 여전히 안 선다.
//
// 여기서 확인하는 것은 ②다. **양성 채널을 함께 둔다**(#30) — 고친 것을 도로 빼면 실제로 실패하는지.
import { describe, it, expect } from "vitest";
import { CamState, P1_F_RATIO } from "../src/ui/camState.js";
import { liftAll, type LiftStroke } from "../src/s3d/lift.js";
import { representative } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const VP: Pt2 = [480, SZ[1] / 2];                 // 1점 투시 — 소실점이 **기본 지평선 위**(피치 0)

/** 소실점으로 가는 선분(끝점 둘). `t`가 소실점 쪽으로 가는 비율이다. */
const toVp = (from: Pt2, t = 0.35): Pt2[] =>
  [from, [from[0] + (VP[0] - from[0]) * t, from[1] + (VP[1] - from[1]) * t]];

/** 옛 거리점 자리(지평선 위, 소실점에서 700px) — 지금은 **축을 안 향하는 깊이선**의 예다.
 * 규칙은 이 선을 거절하고(P1 확정 뒤의 깊이선은 기존 소실점을 향해야 한다) 획은 2D로 남는다. */
const DP: Pt2 = [VP[0] + 700, SZ[1] / 2];
const toDp = (from: Pt2, t = 0.35): Pt2[] =>
  [from, [from[0] + (DP[0] - from[0]) * t, from[1] + (DP[1] - from[1]) * t]];

/**
 * **상자 하나의 정면 + 깊이** — 1점 투시로 그린다.
 * 정면 네 변은 화면 가로·세로이고, 네 모서리에서 소실점으로 깊이선이 간다.
 * **마지막 하나는 바닥 대각선**이고 그것이 시거리를 정한다(C-2).
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
    // **바닥 대각선** — 소실점이 아니라 거리점을 향한다(7.4). 이 하나가 f를 정한다
    { id: "diag", pts: toDp(L2) },
  ];
}

/** 앱과 같은 경로: 획을 차례로 규칙에 넣고, 축을 붙이고, 한 번에 푼다(#17). */
function run(opts: { noDiagonal?: boolean; dropAxisDirs?: boolean } = {}) {
  const cam = new CamState(SZ);
  // **지평선이 첫 동작이다**(18차 지시 j) — 그 y가 곧 소실점의 y다(픽스처의 VP가 그 위에 있다).
  cam.setHorizon(VP[1]);
  cam.apply();
  const strokes = opts.noDiagonal ? drawnStrokes().filter(s => s.id !== "diag") : drawnStrokes();
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
  it("깊이선 **하나**에서 1점 투시가 확정되고 임의 f로 선다 (지시 1 — P1)", () => {
    const { cam, ctx, events } = run();
    expect(cam.order()).toBe(1);
    // ⚠ **세 번째가 `screen_axis`에서 `support`로 바뀌었다**(2026-08-17 A-2):
    // 수직축은 **처음부터 화면 수직**이라 세로선이 축을 새로 세우지 않고 **지지선으로 센다**.
    expect(events.slice(0, 4)).toEqual(["screen_axis", "support", "support", "support"]);
    // ⚠⚠ **18차로 대기가 사라졌다** — 지평선이 있으므로 **첫 깊이선이 곧 소실점**이다
    // (`vp_fixed`). 그 뒤 같은 소실점을 향한 선들은 지지선이다.
    // ⛔ 아래 옛 주석은 은퇴한 계약이다(2026-08-17 4차 지시 3 —
    // "소실점은 그린 선의 교점"이 2차의 "지평선 × 선 하나"를 되돌렸다)
    // ⚠⚠ **둘 → 셋으로 늘었다**(2026-08-18 8차 지시 1-a): 옛 판은 화면 가로축이 있으면
    // (= 옛 정의로 P1이면) 두 선으로 정했는데, P1이 **깊이 소실점을 요구**하게 되면서
    // 그 지름길이 없어졌다. 이제 **셋째 선이 정한다**(D-L69의 기본 경로).
    // ⚠ 14차 항목 3(D-L96): **선언된** 가로축(hint "screen")이면 둘로 정한다 — 이
    // 픽스처는 hint 없이 먹이므로(무의도 분류) 종전 계약 그대로다(그 갈래는
    // vp_rules.test.ts의 14차 절이 잠근다).
    expect(events[4]).toBe("vp_fixed");
    // 나머지 깊이선 셋은 **같은 소실점**을 만든다 — 지지선이다
    expect(events.slice(5, 8)).toEqual(["support", "support", "support"]);
  });

  it("축이 셋 다 붙고 획이 전부 3D로 올라간다", () => {
    const { placed, axes } = run();
    expect(new Set(axes.filter(a => typeof a === "number"))).toEqual(new Set([0, 1, 2]));
    // 여덟 획 전부. **대각선은 축이 없으므로 안 올라간다** — 그것이 옳다(A-3)
    expect(placed).toBe(8);
  });

  // **양성 채널**(#30) — P1의 "임의 f로 선다"가 공허하지 않은지: 대각선 없이도 서고,
  // **가로선이 없으면(NONE·소실점 하나) 안 선다** — 그 문이 임의 f의 유일한 조건이다.
  it("대각선이 없어도 선다 — P1은 임의 f다 (지시 5-4의 해소)", () => {
    const { ctx, placed } = run({ noDiagonal: true });
    expect(ctx).not.toBeNull();
    expect(placed).toBe(8);
  });

  it("**반례** — 지평선을 안 그으면 아무것도 안 선다(18차 지시 l)", () => {
    // ⚠⚠ **옛 반례(«가로선 없는 소실점 하나는 NONE»)는 대상이 사라졌다.** 그때는 깊이선이
    // 대기했고 «가로선이 있어야 1점»이었다. 새 절차에서는 **지평선 + 깊이선 하나**가 1점이고,
    // 없는 것은 «가로선»이 아니라 **지평선**이다. 그 자리를 이 반례가 이어받는다.
    const cam = new CamState(SZ);
    expect(cam.hasHorizon()).toBe(false);
    const r1 = representative(toVp([280, 240]))!;
    expect(cam.feed({ a: r1.a, b: r1.b }).event.type).toBe("rejected");
    const r2 = representative(toVp([280, 540]))!;
    expect(cam.feed({ a: r2.a, b: r2.b }).event.type).toBe("rejected");
    expect(cam.order()).toBe(0);
    expect(cam.ctx()).toBeNull();
  });

  it("무한원 축의 방향을 안 넘기면 화면 가로·세로 획이 못 올라간다", () => {
    const withDirs = run().placed;
    const without = run({ dropAxisDirs: true }).placed;
    expect(without).toBeLessThan(withDirs);
  });

  /** ⛔ 렌즈 경로는 코드에서 통째로 빠졌다(지시 2) — `lensMm` 필드 자체가 없다. */
});
