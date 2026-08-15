// L-B.3 스냅 — **반례 테스트**(A-4). 계획서 §3.
//
// L-B.2의 반례 테스트가 리뷰어에게 "판별력이 좁다"고 지적받은 자리를 피한다:
// **항등**(정의상 참)과 **단조성**(입력을 아예 안 읽는 배선 오류만 잡는 것)뿐이었다.
// 여기서는 **값 자체를 독립으로 확인하는 항목**을 넣는다 — 중점의 화면 위치, 수선 발의 직교성,
// 그리고 **가림을 교차점으로 내지 않는가**(이것은 값이 아니라 판단이고, 틀리면 조용히 틀린다).
import { describe, it, expect } from "vitest";
import { snapAt, snapCandidates, geomScale, SNAP_ORDER, SNAP_TOL,
         type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { project, groundFrame, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const P: Pt2 = [480, 336];
const F = 1000;
const ctx = (extra: Partial<SnapCtx> = {}): SnapCtx =>
  ({ principal: P, f: F, imgSize: SZ, ground: null, from: null, ...extra });
const px = (p: Vec3): Pt2 => project(p, P, F)!;

/** 깊이가 크게 다른 두 끝점 — 투시에서 화면 중점과 3D 중점이 갈린다. */
const DEEP: SnapSeg = { id: "deep", a: [-1, 0.5, 3], b: [1.5, 0.5, 9] };

describe("L-B.3 스냅 — 선례를 그대로 따르는가", () => {
  it("우선순위가 거리를 이긴다 — 중점이 더 가까워도 끝점이 이긴다", () => {
    const seg: SnapSeg = { id: "s", a: [0, 0, 5], b: [2, 0, 5] };
    const mid = px([1, 0, 5]);
    // 커서를 **중점 바로 위**에 둔다. 끝점은 훨씬 멀지만 반경 안이면 끝점이 이겨야 한다.
    const end = px([2, 0, 5]);
    const R = Math.hypot(mid[0] - end[0], mid[1] - end[1]) + 5;
    const got = snapAt(mid, [seg], ctx(), { radius_ratio: R / Math.hypot(...SZ) });
    expect(got?.kind).toBe("endpoint");
    // 반경을 좁혀 끝점을 밖으로 내보내면 그때는 중점이 이긴다 — 순위가 아니라 반경이 갈랐다
    const near = snapAt(mid, [seg], ctx(), { radius_ratio: 10 / Math.hypot(...SZ) });
    expect(near?.kind).toBe("midpoint");
  });

  it("중점은 **3D 중점의 상**이지 화면 중점이 아니다 (값을 독립으로 확인한다)", () => {
    const a2 = px(DEEP.a), b2 = px(DEEP.b);
    const screenMid: Pt2 = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
    const trueMid = px([(DEEP.a[0] + DEEP.b[0]) / 2, (DEEP.a[1] + DEEP.b[1]) / 2,
                        (DEEP.a[2] + DEEP.b[2]) / 2]);
    // 둘이 실제로 갈려야 이 테스트가 뜻이 있다(#4 — 모델이 문제를 만들지 못하면 안 된다)
    const split = Math.hypot(screenMid[0] - trueMid[0], screenMid[1] - trueMid[1]);
    expect(split).toBeGreaterThan(20);
    const got = snapCandidates(trueMid, [DEEP], ctx(), { radius_ratio: 0.02 })
      .find(c => c.kind === "midpoint");
    expect(got).toBeTruthy();
    expect(Math.hypot(got!.screen[0] - trueMid[0], got!.screen[1] - trueMid[1])).toBeLessThan(1e-6);
    // 화면 중점에 커서를 두면 중점 스냅이 **그 자리를 주지 않는다**
    const wrong = snapCandidates(screenMid, [DEEP], ctx(), { radius_ratio: 0.005 })
      .find(c => c.kind === "midpoint");
    expect(wrong).toBeUndefined();
  });

  it("화면에서만 겹치는 두 선분은 **교차점을 내지 않는다** (가림이다)", () => {
    // 앞의 수직 모서리와 뒤의 가로 모서리 — 화면에서는 가로지르지만 3D에서는 6만큼 떨어져 있다
    const front: SnapSeg = { id: "f", a: [0, -1, 4], b: [0, 1, 4] };
    const back: SnapSeg = { id: "b", a: [-2, 0, 10], b: [2, 0, 10] };
    const cross = px([0, 0, 4]);
    const onScreenBack = px([0, 0, 10]);
    // 두 선분이 화면에서 실제로 같은 자리를 지난다는 것을 먼저 확인한다(#4)
    expect(Math.hypot(cross[0] - onScreenBack[0], cross[1] - onScreenBack[1])).toBeLessThan(1e-6);
    const cands = snapCandidates(cross, [front, back], ctx(), { radius_ratio: 0.03 });
    expect(cands.some(c => c.kind === "intersection")).toBe(false);
    // 그런데도 **선 위 근처점**은 양쪽 다 나온다 — 후보가 없어서 안 나온 것이 아니다
    expect(cands.filter(c => c.kind === "on_edge").length).toBe(2);
  });

  it("3D에서 실제로 만나는 두 선분은 교차점을 낸다 (몸통 교차라도)", () => {
    // 같은 평면(z=5)의 두 대각선 — 끝점을 공유하지 않고 몸통에서 만난다
    const d1: SnapSeg = { id: "d1", a: [-1, -1, 5], b: [1, 1, 5] };
    const d2: SnapSeg = { id: "d2", a: [-1, 1, 5], b: [1, -1, 5] };
    const at = px([0, 0, 5]);
    const got = snapCandidates(at, [d1, d2], ctx(), { radius_ratio: 0.02 })
      .find(c => c.kind === "intersection");
    expect(got).toBeTruthy();
    expect(got!.at[2]).toBeCloseTo(5, 6);
    expect(Math.hypot(got!.at[0], got!.at[1])).toBeLessThan(1e-6);
  });

  it("수선 발은 기준점이 있어야 나오고, 실제로 직교한다", () => {
    const seg: SnapSeg = { id: "s", a: [-2, 0, 6], b: [2, 0, 6] };
    const from: Vec3 = [0.7, 1.3, 6];
    const foot: Vec3 = [0.7, 0, 6];
    expect(snapCandidates(px(foot), [seg], ctx(), { radius_ratio: 0.02 })
      .some(c => c.kind === "perpendicular")).toBe(false);
    const got = snapCandidates(px(foot), [seg], ctx({ from }), { radius_ratio: 0.02 })
      .find(c => c.kind === "perpendicular");
    expect(got).toBeTruthy();
    // 독립 확인: (from − foot)·(b − a) = 0
    const d = [got!.at[0] - from[0], got!.at[1] - from[1], got!.at[2] - from[2]];
    const e = [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1], seg.b[2] - seg.a[2]];
    expect(Math.abs(d[0] * e[0] + d[1] * e[1] + d[2] * e[2])).toBeLessThan(1e-9);
  });

  it("모서리를 공유하는 두 획이 끝점 후보를 **하나만** 낸다", () => {
    const a: SnapSeg = { id: "a", a: [0, 0, 5], b: [2, 0, 5] };
    const b: SnapSeg = { id: "b", a: [0, 0, 5], b: [0, 2, 5] };
    const at = px([0, 0, 5]);
    const eps = snapCandidates(at, [a, b], ctx(), { radius_ratio: 0.02 })
      .filter(c => c.kind === "endpoint" && c.dist < 1e-6);
    expect(eps.length).toBe(1);
  });

  it("반경 밖이면 `null` — **애매하면 놓지 않는다**", () => {
    const seg: SnapSeg = { id: "s", a: [0, 0, 5], b: [2, 0, 5] };
    const far: Pt2 = [px(seg.a)[0] + 300, px(seg.a)[1] + 200];
    expect(snapAt(far, [seg], ctx(), { radius_ratio: 0.02 })).toBeNull();
  });

  it("카메라 뒤의 세그먼트는 후보를 내지 않는다", () => {
    const behind: SnapSeg = { id: "z", a: [0, 0, -5], b: [2, 0, -6] };
    expect(snapCandidates([480, 336], [behind], ctx(), { radius_ratio: 0.5 })
      .filter(c => c.kind === "endpoint" || c.kind === "midpoint").length).toBe(0);
  });

  it("지면은 `ground`가 있어야 나오고, **최하위**다", () => {
    const g = groundFrame(null, P, F, 1);
    const seg: SnapSeg = { id: "s", a: [0, 1, 5], b: [2, 1, 5] };
    const at = px([0, 1, 5]);
    expect(snapCandidates(at, [seg], ctx(), { radius_ratio: 0.02 })
      .some(c => c.kind === "on_face")).toBe(false);
    const withG = snapCandidates(at, [seg], ctx({ ground: g }), { radius_ratio: 0.02 });
    expect(withG.some(c => c.kind === "on_face")).toBe(true);
    // 끝점이 이긴다 — 지면의 화면 거리가 **정의상 0**이어도(머리말) 순위가 앞선다
    expect(withG[0].kind).toBe("endpoint");
    expect(withG[withG.length - 1].kind).toBe("on_face");
  });

  it("`geomScale`이 대상 크기를 따라간다 — 3D 임계가 장면 배율에 안 흔들린다", () => {
    const s1: SnapSeg[] = [{ id: "a", a: [0, 0, 0], b: [1, 0, 0] }];
    const s10: SnapSeg[] = [{ id: "a", a: [0, 0, 0], b: [10, 0, 0] }];
    expect(geomScale(s1)).toBeCloseTo(1, 9);
    expect(geomScale(s10)).toBeCloseTo(10, 9);
    expect(geomScale([])).toBe(1);
    // 배율을 10배로 키우면 **같은 판정**이 나와야 한다(가림은 여전히 가림)
    const front: SnapSeg = { id: "f", a: [0, -1, 4], b: [0, 1, 4] };
    const back: SnapSeg = { id: "b", a: [-2, 0, 10], b: [2, 0, 10] };
    const k = (v: Vec3): Vec3 => [v[0] * 10, v[1] * 10, v[2] * 10];
    const big = [{ id: "f", a: k(front.a), b: k(front.b) },
                 { id: "b", a: k(back.a), b: k(back.b) }];
    expect(snapCandidates(px([0, 0, 4]), [front, back], ctx(), { radius_ratio: 0.03 })
      .some(c => c.kind === "intersection")).toBe(false);
    expect(snapCandidates(px(k([0, 0, 4])), big, ctx(), { radius_ratio: 0.03 })
      .some(c => c.kind === "intersection")).toBe(false);
  });

  it("우선순위 목록이 계획서 §3 그대로다", () => {
    expect([...SNAP_ORDER]).toEqual(
      ["endpoint", "midpoint", "intersection", "perpendicular", "on_edge", "on_face"]);
    expect(SNAP_TOL.radius_ratio).toBeGreaterThan(0);
  });
});
