// **축 스냅** — 단위 시험과 **반례**(2026-08-16 사람 지시 1·3).
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 번호:
//   #5   "축을 정확히 따른다"는 **설계 보장**이다 — 시험이 그것을 측정으로 부르지 않는다
//   #30  양성 채널 — **모호 장치가 안 발동하는 경우**를 함께 확인한다. 늘 발동하면 판정이 아니다
//   #38  덮는 대상 수 — 모호 시험이 실제로 두 후보를 만드는지 본다(하나면 공허하다)
import { describe, it, expect } from "vitest";
import { axisCandidates, chooseAxis, snapToAxis, SNAP_TOL_AXIS } from "../src/s3d/axisSnap.js";
import { project, rayThrough, add3, mul3, unit3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const CTX = { principal: [SZ[0] / 2, SZ[1] / 2] as Pt2, f: 1000 };
/** 축 셋 — 화면 가로 · 안쪽(깊이) · 화면 세로. 1점 투시의 배치다. */
const DIRS: (Vec3 | null)[] = [[1, 0, 0], [0, 0, 1], [0, 1, 0]];
const ANCHOR: Vec3 = [-0.4, 0.3, 4];
const A2 = project(ANCHOR, CTX.principal, CTX.f)!;

/** 앵커에서 축 방향으로 간 점의 화면 위치 — 커서를 그 언저리에 둔다. */
function along(axis: 0 | 1 | 2, t: number): Pt2 {
  return project(add3(ANCHOR, mul3(unit3(DIRS[axis] as Vec3), t)), CTX.principal, CTX.f)!;
}

describe("축 스냅 — 그리는 동안 방향을 강제한다", () => {
  it("커서가 어긋나도 **축 방향으로** 뻗는다 (커서를 따라가지 않는다)", () => {
    const on = along(0, 1.2);
    // 축 선에서 **60px 벗어난** 커서
    const cursor: Pt2 = [on[0], on[1] + 60];
    const ch = snapToAxis(ANCHOR, DIRS, A2, cursor, CTX);
    expect(ch.pick!.axis).toBe(0);
    // 끝점은 축 위에 있다 — 커서 자리가 아니다
    expect(Math.hypot(ch.pick!.screenEnd[0] - cursor[0],
                      ch.pick!.screenEnd[1] - cursor[1])).toBeGreaterThan(10);
    // 그리고 그 끝점은 **앵커–축 직선 위**다: 3D에서 방향이 정확히 축이다
    const d = unit3(DIRS[0] as Vec3);
    const v = [ch.pick!.seg[1][0] - ANCHOR[0], ch.pick!.seg[1][1] - ANCHOR[1],
               ch.pick!.seg[1][2] - ANCHOR[2]] as Vec3;
    const L = Math.hypot(v[0], v[1], v[2]);
    const cos = Math.abs((v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / L);
    expect(cos).toBeCloseTo(1, 9);                 // **설계 보장이다**(#5) — 측정이 아니다
  });

  it("길이는 커서를 그 직선에 **수직 투영**한 지점까지다", () => {
    const on = along(0, 1.5);
    const cursor: Pt2 = [on[0], on[1] + 40];
    const ch = snapToAxis(ANCHOR, DIRS, A2, cursor, CTX);
    // 끝점의 3D는 커서 광선과 축 직선의 최근접점이다 — 그 두 방향이 서로 수직이어야 한다
    const q = ch.pick!.seg[1];
    const r = rayThrough(cursor, CTX.principal, CTX.f);
    const w: Vec3 = [q[0] - r[0] * (q[0] * r[0] + q[1] * r[1] + q[2] * r[2]),
                     q[1] - r[1] * (q[0] * r[0] + q[1] * r[1] + q[2] * r[2]),
                     q[2] - r[2] * (q[0] * r[0] + q[1] * r[1] + q[2] * r[2])];
    const d = unit3(DIRS[0] as Vec3);
    expect(Math.abs(w[0] * d[0] + w[1] * d[1] + w[2] * d[2])).toBeLessThan(1e-6);
  });

  it("**긋는 방향과 무관하다** — 반대로 그어도 같은 축이다(3-c)", () => {
    const fwd = snapToAxis(ANCHOR, DIRS, A2, along(0, 1.2), CTX);
    const back = snapToAxis(ANCHOR, DIRS, A2, along(0, -1.2), CTX);
    expect(fwd.pick!.axis).toBe(0);
    expect(back.pick!.axis).toBe(0);
  });

  // **양성 채널**(#30) — 후보가 셋인데 하나만 고른다. 늘 같은 것을 고르면 판정이 아니다
  it("커서 방향을 바꾸면 고르는 축이 바뀐다", () => {
    expect(snapToAxis(ANCHOR, DIRS, A2, along(0, 1.2), CTX).pick!.axis).toBe(0);
    expect(snapToAxis(ANCHOR, DIRS, A2, along(1, 1.2), CTX).pick!.axis).toBe(1);
    expect(snapToAxis(ANCHOR, DIRS, A2, along(2, 1.2), CTX).pick!.axis).toBe(2);
  });

  it("축이 하나도 없으면 아무것도 안 고른다 — 없는 판정을 지어내지 않는다", () => {
    const ch = snapToAxis(ANCHOR, [null, null, null], A2, [500, 500], CTX);
    expect(ch.pick).toBeNull();
    expect(ch.ambiguous).toBe(false);
  });
});

describe("모호한 방향 — 커서 위치로 가른다 (사람 지시 3)", () => {
  /**
   * **주점 근처의 겹침**을 만든다. 앵커를 주점 바로 옆에 두면 깊이축(소실점 = 주점)의
   * 화면 방향이 **주점을 향하는 방향**이 되어 세로축과 거의 겹친다 —
   * 지시문이 든 바로 그 자리다("화면 정중앙에서 세로선").
   */
  const NEAR: Vec3 = [0.004, 0.35, 4];
  const NEAR2 = project(NEAR, CTX.principal, CTX.f)!;
  /**
   * ⚠ **커서는 앵커와 소실점 사이에 있어야 한다.** 소실점을 지나친 화면 점은 그 축에서
   * **카메라 뒤**라 후보가 아예 안 생긴다 — 처음에 150px 위에 뒀다가 깊이 후보가 사라져
   * 모호 구간이 성립하지 않았다(#38: 덮는 대상이 0이면 그 시험은 공허하다).
   * 앵커는 y≈423, 소실점(주점)은 y=336이라 그 사이인 60px 위를 쓴다.
   */
  const UP = 60;

  it("겹치는 자리에서 실제로 모호 구간에 들어간다 (**덮는 대상이 0이 아니다**, #38)", () => {
    const cursor: Pt2 = [NEAR2[0], NEAR2[1] - UP];
    const cands = axisCandidates(NEAR, DIRS, NEAR2, cursor, CTX);
    const ch = chooseAxis(cands);
    expect(ch.ambiguous).toBe(true);
    expect(ch.tied.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ch.tied.map(t => t.axis))).toEqual(new Set([1, 2]));
  });

  it("커서를 좌우로 옮기면 **해석이 바뀐다** — 규칙을 설명할 필요가 없다(3-d)", () => {
    const up: Pt2 = [NEAR2[0], NEAR2[1] - UP];
    const picks = new Set<number>();
    for (const dx of [-30, -8, 0, 8, 30]) {
      const ch = snapToAxis(NEAR, DIRS, NEAR2, [up[0] + dx, up[1]], CTX);
      picks.add(ch.pick!.axis);
    }
    // 두 해석이 실제로 **둘 다 나온다** — 하나로 고정되면 이 장치는 없는 것이다(#30)
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });

  it("고른 것은 **커서에 더 가까운 쪽**이다", () => {
    const cursor: Pt2 = [NEAR2[0] + 8, NEAR2[1] - UP];
    const ch = snapToAxis(NEAR, DIRS, NEAR2, cursor, CTX);
    for (const t of ch.tied) expect(ch.pick!.cursorDist).toBeLessThanOrEqual(t.cursorDist + 1e-9);
  });

  // **양성 채널**(#30) — 명백한 자리에서는 발동하지 않는다. 늘 켜지면 "모호"가 아니다
  it("명백하면 모호 구간이 아니다 — 평소에는 보이지 않는다(3-a)", () => {
    const ch = snapToAxis(ANCHOR, DIRS, A2, along(0, 1.5), CTX);
    expect(ch.ambiguous).toBe(false);
    expect(ch.tied.length).toBe(1);
  });

  it("임계를 0으로 하면 모호 구간이 없어진다 — 임계가 실제로 그 자리를 정한다", () => {
    const cursor: Pt2 = [NEAR2[0], NEAR2[1] - UP];
    const cands = axisCandidates(NEAR, DIRS, NEAR2, cursor, CTX);
    expect(chooseAxis(cands, { ambiguous_deg: 0 }).ambiguous).toBe(false);
    expect(chooseAxis(cands, { ambiguous_deg: 90 }).tied.length).toBe(cands.length);
  });

  it("기본 임계가 등록돼 있다", () => {
    expect(SNAP_TOL_AXIS.ambiguous_deg).toBeGreaterThan(0);
  });
});
