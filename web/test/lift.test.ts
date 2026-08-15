// L-A.3 **초기 3D 올리기** — `docs/line_plan.md` §5.2의 성질을 잠근다.
//
// 참 3D 상자를 알려진 카메라로 투영한 뒤 그것만 주고 다시 올린다.
// **정답이 있으므로 형태를 대조할 수 있다** — 스케일 자유도 하나만 남으므로 배율을 맞추고 본다.
//
// 반례를 함께 박는다(A-4):
//   같은 축 교점은 제약이 아니다 (가림) · 이어지지 않은 획은 미배치 · 미분류 획은 미배치
import { describe, it, expect } from "vitest";
import { liftAll, findJoints, frameOf, components, LIFT_TOL, type LiftStroke, type LiftCtx }
  from "../src/s3d/lift.js";
import { transitionGap } from "../src/s3d/lift.js";
import { lineIntersect, type Pt2 } from "../src/s3d/camera.js";
import { norm3, sub3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import { scene, boxEdges, drawEdges, groundPoint } from "./scene3d.js";
import { fitGauge, perStrokeError } from "./metrics.js";
import { rng32 } from "../src/s3d/synthInk.js";

const SZ: [number, number] = [960, 672];

function boxFixture(jit = 0, seed = 5, grade: "precise" | "medium" = "precise") {
  const sc = scene(35, 15, 1000, SZ);
  const O = groundPoint(sc, [420, 470])!;
  const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
  const drawn = drawEdges(sc, edges, grade, rng32(seed), 0.12, jit, 0)!;
  const ctx: LiftCtx = {
    principal: sc.principal, f: sc.f, vps: [sc.vps[0], sc.vps[1], sc.vps[2]], imgSize: SZ,
  };
  return { sc, edges, drawn, ctx };
}

/**
 * 참 세그먼트와 놓인 세그먼트를 **최적 배율**로 맞춘 뒤의 최대 오차(상자 대각 대비).
 *
 * ⚠ **끝점 순서를 맞춰야 한다.** `representative`는 PCA 주축의 `tmin`을 `a`로 두므로
 * 참 모서리의 `a`/`b`와 **뒤집혀 나올 수 있다.** 처음에 그것을 빼먹어 제약 잔차가 1e-14인데
 * 형태 오차가 0.71로 나왔다 — 지표가 없는 오차를 세고 있었다(구 V-J와 같은 유형).
 */
function shapeError(
  placed: Map<string, { a: Vec3; b: Vec3 }>, truth: { a: Vec3; b: Vec3 }[], diag: number,
): { k: number; max: number; n: number } {
  // **정의는 `metrics.ts` 하나다** — 여기 있던 지역 구현은 `fitGauge` + `perStrokeError`와
  // 같은 식을 네 번째로 적은 것이었다(#1).
  const k = fitGauge(placed, truth);
  const errs = perStrokeError(placed, truth, diag, k);
  return { k, max: errs.length ? Math.max(...errs) : 0, n: placed.size * 2 };
}

const boxDiag = (truth: { a: Vec3; b: Vec3 }[]): number => {
  const ps = truth.flatMap(t => [t.a, t.b]);
  let m = 0;
  for (const p of ps) for (const q of ps) m = Math.max(m, norm3(sub3(p, q)));
  return m;
};

describe("초기 3D 올리기 (§5.2)", () => {
  it("정확한 투영이면 참 상자가 **배율까지** 복원된다 — 앵커도 씨앗도 없이", () => {
    const { edges, drawn, ctx } = boxFixture();
    // 잉크 노이즈를 빼고 참 끝점만 준다
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: [e.a2d, e.b2d] as Pt2[], axis: e.axis }));
    const r = liftAll(strokes, ctx);
    expect(r.placed.size).toBe(12);
    expect(r.unplaced).toEqual([]);
    const truth = edges.map(e => ({ a: e.a, b: e.b }));
    const err = shapeError(r.placed, truth, boxDiag(truth));
    expect(err.max).toBeLessThan(1e-6);
  });

  it("스케일 자유도만 남는다 — 게이지를 바꿔도 형태가 같다", () => {
    const { edges, drawn, ctx } = boxFixture();
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: [e.a2d, e.b2d] as Pt2[], axis: e.axis }));
    const a = liftAll(strokes, ctx);
    const b = liftAll(strokes, ctx, { gauge_height: 3 });
    expect(b.scale / a.scale).toBeCloseTo(3, 6);
    const truth = edges.map(e => ({ a: e.a, b: e.b }));
    const d = boxDiag(truth);
    expect(shapeError(b.placed, truth, d).max).toBeLessThan(1e-6);
  });

  it("**전환 무변화** — 세그먼트를 되쏘면 대표 직선으로 정확히 돌아온다(설계 보장)", () => {
    const { drawn, ctx } = boxFixture(0.004, 11);
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: e.axis }));
    const r = liftAll(strokes, ctx);
    expect(r.placed.size).toBeGreaterThan(0);
    const { segGap, inkGap } = transitionGap(strokes, r.placed, ctx);
    expect(Math.max(...segGap)).toBeLessThan(1e-6);        // 보장 — 임계를 걸지 않는다
    // 원본 획과의 차이는 0이 아니다 — **프리핸드를 버린 대가**(§1.1). 있음을 확인만 한다
    expect(Math.max(...inkGap)).toBeGreaterThan(0);
  });

  it("**반례** — 같은 축 두 획의 화면 교점은 제약이 아니다 (가림)", () => {
    // 노이즈가 있으면 같은 축 두 획도 정확히 평행이 아니라 어딘가에서 만난다
    const { drawn, ctx } = boxFixture(0.004, 31);
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: e.axis }));
    const frames = strokes.map(s => frameOf(s, ctx)).filter(f => !("reason" in f)) as any[];
    const joints = findJoints(frames, ctx);
    for (const j of joints) {
      expect(drawn[+j.i.slice(1)].axis).not.toBe(drawn[+j.j.slice(1)].axis);
    }
    // 3점 상자에서는 기하가 이미 막는다 — 같은 축 두 획의 교점은 **그 축의 소실점**이고
    // 그것은 화면 밖 멀리 있어 선분 밖이다. **1점 투시에서는 그렇지 않다**:
    // 소실점이 화면 안에 있으므로 깊이축 획 둘이 소실점 근처(=서로의 끝점 근처)에서 만난다.
    // 그 제약은 3D에서 정보가 없다(두 직선이 나란하므로 어떤 깊이든 만족한다).
    const one: LiftCtx = { principal: [480, 336], f: 1000, vps: [null, [480, 336], null],
                           imgSize: SZ };
    const V: Pt2 = [480, 336];
    const ray = (dx: number, dy: number, from: number, to: number): Pt2[] => {
      const L = Math.hypot(dx, dy);
      return [[V[0] + (dx / L) * from, V[1] + (dy / L) * from],
              [V[0] + (dx / L) * to, V[1] + (dy / L) * to]];
    };
    const radial: LiftStroke[] = [
      { id: "p", pts2d: ray(-1, -0.8, 10, 300), axis: 1 },
      { id: "q", pts2d: ray(1, -0.75, 10, 300), axis: 1 },
    ];
    const rf = radial.map(s => frameOf(s, one)).filter(f => !("reason" in f)) as any[];
    expect(rf.length).toBe(2);
    // 다른 조건은 전부 통과한다 — 교점이 소실점이고 두 획의 안쪽 끝점에서 10px 안이다
    const q = lineIntersect(rf[0].rep.a, rf[0].rep.b, rf[1].rep.a, rf[1].rep.b)!;
    expect(Math.hypot(q[0] - V[0], q[1] - V[1])).toBeLessThan(1e-6);
    const tol = LIFT_TOL.touch_ratio * Math.hypot(...SZ);
    for (const F of rf) {
      expect(Math.min(Math.hypot(q[0] - F.rep.a[0], q[1] - F.rep.a[1]),
                      Math.hypot(q[0] - F.rep.b[0], q[1] - F.rep.b[1]))).toBeLessThan(tol);
    }
    // 그런데 나란한 축이므로 제약이 아니다 — 이것만이 그것을 막는다
    expect(findJoints(rf, one).length).toBe(0);
  });

  it("**반례** — 몸통끼리 가로지르는 교점은 가림이므로 제약이 아니다", () => {
    // 정확한 투영에서도 상자 하나에 **가림 교차가 3개** 있다(뒤 모서리가 앞 수직 모서리를
    // 가로지른다). 그 3개를 넣으면 동차계의 영공간이 1차원이 아니게 되고 참 상자가
    // 복원되지 않는다(실측: 최소 고유값 6.95e-3, 형태 오차 0.79).
    const { edges, drawn, ctx } = boxFixture();
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: [e.a2d, e.b2d] as Pt2[], axis: e.axis }));
    const frames = strokes.map(s => frameOf(s, ctx)).filter(f => !("reason" in f)) as any[];
    const joints = findJoints(frames, ctx);
    expect(joints.length).toBe(24);                        // 꼭짓점 8 × 짝 3
    // 모든 교점이 참 3D에서 실제로 공유되는 점인가
    const shares = (i: number, j: number) => {
      const A = edges[i], B = edges[j];
      for (const p of [A.a, A.b]) for (const q of [B.a, B.b]) {
        if (norm3(sub3(p, q)) < 1e-9) return true;
      }
      return false;
    };
    for (const j of joints) expect(shares(+j.i.slice(1), +j.j.slice(1))).toBe(true);
    // 끝점 조건을 끄면(반경을 크게) 가림 교차가 실제로 섞여 든다
    const loose = findJoints(frames, ctx, { touch_ratio: 0.5 });
    const fake = loose.filter(j => !shares(+j.i.slice(1), +j.j.slice(1)));
    expect(fake.length).toBeGreaterThan(0);
  });

  it("**반례** — 이어지지 않은 획은 미배치로 남는다 (버리지 않는다)", () => {
    const { drawn, ctx } = boxFixture();
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: [e.a2d, e.b2d] as Pt2[], axis: e.axis }));
    // 상자에서 멀리 떨어진 곳에 축 획 하나를 더 둔다
    strokes.push({ id: "s99", pts2d: [[880, 60], [930, 62]] as Pt2[], axis: 0 });
    const r = liftAll(strokes, ctx);
    expect(r.placed.has("s99")).toBe(false);
    expect(r.unplaced.map(u => u.id)).toContain("s99");
    expect(r.placed.size).toBe(12);                        // 나머지는 그대로 놓인다
  });

  it("**반례** — 미분류 획은 미배치다 (조용히 놓지 않는다)", () => {
    const { drawn, ctx } = boxFixture();
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: [e.a2d, e.b2d] as Pt2[], axis: i === 0 ? "free" : e.axis }));
    const r = liftAll(strokes, ctx);
    expect(r.placed.has("s0")).toBe(false);
    expect(r.unplaced.find(u => u.id === "s0")?.reason).toContain("미분류");
  });

  it("연결 성분을 크기 순으로 낸다", () => {
    const j = [{ i: "a", j: "b", q: [0, 0] as Pt2 }, { i: "b", j: "c", q: [0, 0] as Pt2 },
               { i: "d", j: "e", q: [0, 0] as Pt2 }];
    const cs = components(["a", "b", "c", "d", "e", "f"], j);
    expect(cs[0].length).toBe(3);
    expect(cs[1].length).toBe(2);
    expect(cs[2]).toEqual(["f"]);
  });

  it("잉크 노이즈가 있어도 상자가 통째로 놓인다", () => {
    const { edges, drawn, ctx } = boxFixture(0.004, 21, "medium");
    const strokes: LiftStroke[] = drawn.map((e, i) =>
      ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: e.axis }));
    const r = liftAll(strokes, ctx);
    expect(r.placed.size).toBe(12);
    // 형태 오차의 분포는 원장이 낸다(`lift_gate.json`). 여기서는 자릿수만 잠근다
    const truth = edges.map(e => ({ a: e.a, b: e.b }));
    expect(shapeError(r.placed, truth, boxDiag(truth)).max).toBeLessThan(0.30);
  });
});
