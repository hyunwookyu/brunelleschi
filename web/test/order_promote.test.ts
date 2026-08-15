// L-C.1 **차수 승격** — 산출: `stage0/out/order_promote.json`. 계획서 §6.1.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-C.1 절에 적었다.
//
// ---------------------------------------------------------------- 무엇을 재는가
//
// §6.2가 이미 반증됐다(AS-L6): 재투영 잔차는 **사영 불변**이라 승격 전후에 둘 다 0이다.
// 그러므로 "승격이 잘 됐는가"를 그 신호로 못 잰다. **참값 대조 하나뿐이다.**
//
// ```
// 참 장면은 3점  →  카메라를 2점으로 준다(수직 소실점을 무한원으로) →  전부 올린다
//               →  참 수직 소실점을 넣어 승격  →  전부 다시 올린다  →  전후를 짝지어 본다
// ```
//
// **대조군은 가짜 승격이다**(#6): 참 장면이 **2점**(피치 0)인데 없는 세 번째 소실점을 넣는다.
// 그쪽에서 나빠지지 않으면 이 측정은 승격을 재는 것이 아니다 — **양성 채널**(#30).
//
// ⚠ **#11** — 승격 전 배치 집합과 후 배치 집합은 다른 집합이다. 비율끼리 견주지 않고
// **같은 획에서 전후를 짝지어** 본다(`paired_*`).
// ⚠ **#1** — 전후는 **카메라가 다르므로 게이지도 각각 적합한다.** 같은 게이지로 재면
// 그 차이는 형태가 아니라 게이지 차이다(L-B.M이 걸린 그 자리).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteOrder, orderOf, type OrderStroke } from "../src/s3d/promoteOrder.js";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx, type LiftSeg } from "../src/s3d/lift.js";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { snapCandidates, staticCandidates, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { norm3, sub3, project } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { fitGauge, segShapeError, silentWrong, metricsSnapshot } from "./metrics.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

const SZ: [number, number] = [960, 672];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];

/**
 * **참 장면이 3점인 구도**(승격이 옳은 자리)와 **참 장면이 2점인 구도**(승격이 틀린 자리).
 * 구도 이름·시드 산식은 `axis_live`·`promote`와 같다(#27).
 */
const TRUE_3PT = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
];
const TRUE_2PT = [
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));
const trueAxis = (sc: Scene, a: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[a], SZ) ? a : "screen");

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: OrderStroke[]; diag: number }

function fixture(C: typeof TRUE_3PT[number], grade: InkGrade, seed: number, jit: number): Fx | null {
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q of pts) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, diag,
           strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[],
                                           axis: "free" as Axis, userAxis: false, snapStart: null })) };
}

/** **같은 획에서 전후를 짝지어** 센다(#11) — 비율끼리 견주면 다른 집합의 비교가 된다. */
interface Paired {
  bothPlaced: number; onlyBefore: number; onlyAfter: number; neither: number;
  errBefore: number[]; errAfter: number[];
  improved: number; worsened: number; same: number;
  /**
   * **한쪽만 놓인 획의 형태 오차**(L-C.2 리뷰어 [4]).
   *
   * 짝이 없으니 **전후를 견줄 수는 없다** — 그것이 `errBefore`/`errAfter`를 `both_placed`로
   * 좁힌 이유다. 그러나 **D-L25의 목적함수는 짝짓기를 안 한다**: 점수가
   * `(놓였고 맞은 것 − λ·조용히 틀린 것) / 전체`라 **놓인 것 전부의 오차**가 필요하다.
   * 이것이 없으면 승격의 등록 규칙을 D-L25로 다시 채점할 수 없다 — 실제로 못 했다.
   * 게이지는 각 팔의 것을 쓴다(#1: 카메라가 다르다).
   */
  errOnlyBefore: number[]; errOnlyAfter: number[];
}
const paired = (): Paired => ({ bothPlaced: 0, onlyBefore: 0, onlyAfter: 0, neither: 0,
                                errBefore: [], errAfter: [], improved: 0, worsened: 0, same: 0,
                                errOnlyBefore: [], errOnlyAfter: [] });
const pairedRep = (p: Paired) => ({
  note: "**같은 획에서 전후를 짝짓는다**(#11). `both_placed` 안에서만 형태 오차를 **견준다** — "
    + "한쪽만 놓인 획은 견줄 짝이 없다. 다만 **오차 자체는 그쪽도 잰다**(`only_*_shape_err`) — "
    + "D-L25의 목적함수가 놓인 것 전부를 보기 때문이다.",
  both_placed: p.bothPlaced, only_before: p.onlyBefore, only_after: p.onlyAfter, neither: p.neither,
  placed_delta: p.onlyAfter - p.onlyBefore,
  shape_err_before: stat(p.errBefore), shape_err_after: stat(p.errAfter),
  silent_wrong_before: silentWrong(p.errBefore), silent_wrong_after: silentWrong(p.errAfter),
  per_stroke: { improved: p.improved, worsened: p.worsened, same: p.same },
  only_before_shape_err: stat(p.errOnlyBefore), only_after_shape_err: stat(p.errOnlyAfter),
  only_before_silent_wrong: silentWrong(p.errOnlyBefore),
  only_after_silent_wrong: silentWrong(p.errOnlyAfter),
  shape_err_measured: { both: `${p.errBefore.length}/${p.bothPlaced}`,
                        only_before: `${p.errOnlyBefore.length}/${p.onlyBefore}`,
                        only_after: `${p.errOnlyAfter.length}/${p.onlyAfter}` },
});

/**
 * **D-L25로 다시 채점한다**(2026-08-16 사람이 정한 목적함수).
 *
 * `점수 = (놓였고 맞은 것 − λ·조용히 틀린 것) / 전체`. 분모는 **획 전부**이므로
 * 미배치가 0점을 받고 조용히 틀림이 −λ를 받는다 — 그것이 "미배치는 유예, 틀림은 영구"다.
 *
 * ⚠ **λ와 절단을 하나만 내지 않는다**(#12·#13) — 절단에서 승자가 뒤집히는 것을 이 프로젝트가
 * 이미 봤다(`axis_live.cut_curve`). 표로 낸다.
 */
function dl25(all: number[], placed: number, total: number, lam: number, cut: number): number {
  const wrong = all.filter(e => e > cut).length;
  return +((placed - wrong - lam * wrong) / Math.max(1, total)).toFixed(4);
}

/** 스냅 대상을 새로 만든다 — 시작점을 이웃 획의 끝점에 붙인다(앱 경로와 같은 함수). */
function attachSnaps(fx: Fx, placed: Map<string, LiftSeg>): number {
  const segs: SnapSeg[] = [...placed].map(([id, s]) => ({ id, a: s.a, b: s.b }));
  if (!segs.length) return 0;
  const sctx: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                          ground: null, from: null };
  const pre = staticCandidates(segs);
  let n = 0;
  for (const s of fx.strokes) {
    const own = segs.filter(g => g.id !== s.id);
    if (!own.length) continue;
    const c = snapCandidates(s.pts2d[0], own, sctx,
                             {}, pre.filter(x => x.ofId !== s.id && x.ofId2 !== s.id))[0];
    if (!c) continue;
    s.snapStart = { kind: c.kind, at: c.at, ofId: c.ofId };
    s.pts2d = [[c.screen[0], c.screen[1]], ...s.pts2d.slice(1)];
    n += 1;
  }
  return n;
}

describe("L-C.1 — 차수 승격이 전부 다시 푸는가, 그리고 나아지는가", () => {
  it("측정을 원장에 남긴다", () => {
    /** 참 3점 구도에서 2점 → 3점 승격(**옳은 승격**). */
    const real = paired();
    /** 참 2점 구도에서 없는 세 번째를 넣는 승격(**가짜 승격 — 대조군**). */
    const spurious = paired();
    const snapAgg = { had: 0, reanchored: 0, target_unplaced: 0, behind_camera: 0,
                      drift: [] as number[] };
    /** 차수가 실제로 바뀌었는가 — **안 바뀌면 승격을 안 잰 것이다**(#32의 실행 카운터). */
    const orders = { before: [] as number[], after: [] as number[] };
    /** 시드별 표제 수치(#14). */
    const bySeed: Record<string, { both: number; wB: number; wA: number }> = {};
    /**
     * **시드별 D-L25 점수**(#14 — 여유가 시드 폭보다 작으면 그 결론은 없다).
     *
     * L-C.2 리뷰어 [2]가 짚은 자리다: 같은 세션이 D-L21 재채점은 시드 폭 때문에 보류하면서
     * 다른 수는 폭을 안 보고 박았다. **여기서는 먼저 잰다.**
     */
    const dl25Seed: Record<string, { total: number; pB: number; pA: number;
                                     eB: number[]; eA: number[] }> = {};

    const run = (
      C: typeof TRUE_3PT[number], bag: Paired, spuriousArm: boolean, grade: InkGrade,
      seed: number, jit: number,
    ) => {
      const fx = fixture(C, grade, seed, jit);
      if (!fx) return;
      const truth = trueVps(fx.sc);
      // ---- 승격 **전** 카메라: 수직 소실점을 **뺀다**(2점으로 본다)
      const before: (Pt2 | null)[] = spuriousArm ? truth : [truth[0], truth[1], null];
      // ---- 승격 **후**: 참 3점(옳은 팔) / **없는 세 번째를 지어넣기**(가짜 팔)
      const after: (Pt2 | null)[] = spuriousArm
        ? [truth[0], truth[1], [SZ[0] / 2, SZ[1] * 4] as Pt2]   // 아래쪽 가짜 수직 소실점
        : truth;
      const ctxB: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f, vps: before, imgSize: SZ };
      const ctxA: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f, vps: after, imgSize: SZ };
      orders.before.push(orderOf(before, SZ));
      orders.after.push(orderOf(after, SZ));

      // ---- 승격 전: 축을 판정하고 올린다(= 초기 확정 그대로)
      const inB: LiftStroke[] = fx.strokes.map(s => ({
        id: s.id, pts2d: s.pts2d,
        axis: classifyStroke(s.pts2d, before, SZ, {},
                             { principal: fx.sc.principal, f: fx.sc.f }).axis,
      }));
      const rB = liftAll(inB, ctxB, { touch_ratio: LIFT_TOL.touch_ratio });
      // 스냅을 실제로 붙인다 — **그것이 있어야 "조용히 풀린다"를 잴 수 있다**
      attachSnaps(fx, rB.placed);

      // ---- 승격: 전부 다시 푼다
      const pr = promoteOrder(fx.strokes, ctxA, {});
      snapAgg.had += pr.snap.had; snapAgg.reanchored += pr.snap.reanchored;
      snapAgg.target_unplaced += pr.snap.target_unplaced;
      snapAgg.behind_camera += pr.snap.behind_camera;
      snapAgg.drift.push(...pr.snap.drift_px);

      // ---- **전후를 짝짓는다**. 게이지는 **각각 적합**한다(#1 — 카메라가 다르다)
      const kB = rB.placed.size ? fitGauge(rB.placed, fx.edges) : null;
      const kA = pr.placed.size ? fitGauge(pr.placed, fx.edges) : null;
      // **시드별 D-L25 자루**(#14). 참 승격 팔만 — 가짜 팔은 대조군이다
      const ds = spuriousArm ? null
        : (dl25Seed[String(seed)] ??= { total: 0, pB: 0, pA: 0, eB: [], eA: [] });
      for (const s of fx.strokes) {
        const b = rB.placed.get(s.id), a = pr.placed.get(s.id);
        if (ds) {
          ds.total += 1;
          if (b) { ds.pB += 1; if (kB != null) ds.eB.push(segShapeError(b, fx.edges[+s.id.slice(1)], fx.diag, kB)); }
          if (a) { ds.pA += 1; if (kA != null) ds.eA.push(segShapeError(a, fx.edges[+s.id.slice(1)], fx.diag, kA)); }
        }
        if (b && a) {
          bag.bothPlaced += 1;
          if (kB == null || kA == null) continue;
          const t = fx.edges[+s.id.slice(1)];
          const eB = segShapeError(b, t, fx.diag, kB), eA = segShapeError(a, t, fx.diag, kA);
          bag.errBefore.push(eB); bag.errAfter.push(eA);
          if (eA < eB - 1e-9) bag.improved += 1;
          else if (eA > eB + 1e-9) bag.worsened += 1;
          else bag.same += 1;
          if (!spuriousArm) {
            const sr = (bySeed[String(seed)] ??= { both: 0, wB: 0, wA: 0 });
            sr.both += 1;
            if (eB > 0.2) sr.wB += 1;
            if (eA > 0.2) sr.wA += 1;
          }
        } else if (b) {
          bag.onlyBefore += 1;
          // **오차는 잰다**(리뷰어 [4]) — 견줄 짝이 없을 뿐 D-L25는 이 획도 센다
          if (kB != null) bag.errOnlyBefore.push(segShapeError(b, fx.edges[+s.id.slice(1)], fx.diag, kB));
        } else if (a) {
          bag.onlyAfter += 1;
          if (kA != null) bag.errOnlyAfter.push(segShapeError(a, fx.edges[+s.id.slice(1)], fx.diag, kA));
        } else bag.neither += 1;
      }
    };

    for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
      for (const C of TRUE_3PT) run(C, real, false, grade, seed, jit);
      for (const C of TRUE_2PT) run(C, spurious, true, grade, seed, jit);
    }

    // ---- 사전 등록한 채택 규칙(#26). **측정 전에 박았다.**
    const rate = (w: number[], c: number) => w.filter(e => e > c).length / Math.max(1, w.length);
    const gainsPlacement = real.onlyAfter >= real.onlyBefore;
    const notWorse = rate(real.errAfter, 0.2) <= rate(real.errBefore, 0.2);
    const verdict = gainsPlacement && notWorse
      ? "**승격을 자동으로 걸 수 있다** — 배치가 안 줄고 조용히 틀림도 안 는다"
      : "**승격을 자동으로 걸지 않는다** — 등록한 두 조건을 함께 만족하지 못한다(§6.2 사용자 확인)";

    const seedRatios = Object.values(bySeed)
      .map(r => (r.wA / Math.max(1, r.both)) / Math.max(1e-9, r.wB / Math.max(1, r.both)))
      .sort((x, y) => x - y);

    const doc = {
      what: "L-C.1 — 차수 승격(§6.1)이 전부 다시 풀고, 그 결과가 나아지는가",
      why: "계획서 §1.2의 **고유한 것 둘 중 두 번째**다. 그리고 §6.2의 자동 신호가 "
        + "이미 반증됐으므로(AS-L6) **참값 대조 말고는 잴 것이 없다.**",
      method: {
        promotion: "참 장면이 3점인 구도에서 **카메라를 2점으로 준다**(수직 소실점을 무한원으로) → "
          + "전부 올린다 → **참 수직 소실점을 넣어 승격** → 전부 다시 올린다.",
        control: "**가짜 승격**(#6·#30): 참 장면이 **2점**(피치 0)인데 **없는 세 번째 소실점**을 "
          + "지어넣는다. 여기서 나빠지지 않으면 이 측정은 승격을 재는 것이 아니다.",
        pairing: "**같은 획에서 전후를 짝짓는다**(#11). 비율끼리 견주면 다른 집합의 비교다.",
        gauge: "전후는 **카메라가 다르므로 게이지도 각각 적합한다**(#1). 같은 게이지로 재면 "
          + "그 차이는 형태가 아니라 게이지 차이다 — L-B.M이 정확히 그 자리에서 걸렸다.",
        snap: "승격 전에 **스냅을 실제로 붙인다**. 안 붙이면 '조용히 풀린다'를 잴 대상이 없다.",
      },
      conditions: {
        true_3pt: TRUE_3PT.map(c => c.name), true_2pt: TRUE_2PT.map(c => c.name),
        grades: GRADES, seeds: SEEDS, end_jitters: JITTERS, skew: 0.12, canvas_px: SZ,
        camera: "**참 소실점**을 넣고 뺀다 — 검출·조정 오차는 여기서 안 잰다(그것은 L-A·L-B다).",
        spurious_vp: "화면 아래 [480, 2688] — 캔버스 밖이지만 `isFiniteVp` 안이다",
      },
      // **차수가 실제로 바뀌었는가**(#32의 실행 카운터). 안 바뀌었으면 승격을 안 잰 것이다
      order_changed: {
        note: "**입력이 실제로 승격인지 먼저 센다**(#32). 전후 차수가 같으면 그 실행은 "
          + "승격에 대한 정보가 0이다.",
        before: stat(orders.before, 2), after: stat(orders.after, 2),
        all_promoted: orders.before.every((b, i) => orders.after[i] > b),
      },
      real_promotion: pairedRep(real),
      spurious_promotion_control: pairedRep(spurious),
      // ---- **D-L25로 다시 채점한다**(리뷰어 [4]: 등록 규칙을 대체했으면 이것도 대상이다)
      dl25_rescore: (() => {
        const total = real.bothPlaced + real.onlyBefore + real.onlyAfter + real.neither;
        const errB = [...real.errBefore, ...real.errOnlyBefore];
        const errA = [...real.errAfter, ...real.errOnlyAfter];
        const pB = real.bothPlaced + real.onlyBefore, pA = real.bothPlaced + real.onlyAfter;
        // ⚠ **절단을 셋만 내면 "모든 절단에서"가 셋을 가리킨다**(#13 — 2회차 리뷰어).
        // 절단 곡선은 같은 물음에서 0.1~1.0의 11점을 냈고 0.6~1.0에서 우열이 뒤집혔다
        const CUTS = [0.1, 0.2, 0.35, 0.5, 0.7, 1];
        const cell = (eB: number[], eA: number[], b0: number, a0: number, n: number,
                      lam: number, cut: number) => {
          const b = dl25(eB, b0, n, lam, cut), a = dl25(eA, a0, n, lam, cut);
          return { before: b, after: a, promotion_wins: a > b,
                   // **여유를 획수로도 낸다**(#14 — 비율만 보면 8획과 800획이 같아 보인다)
                   margin: +(a - b).toFixed(4), margin_strokes: Math.round((a - b) * n) };
        };
        const table: Record<string, unknown> = {};
        for (const cut of CUTS) for (const lam of [1, 2, 3, 5, 10]) {
          table[`cut_${cut}_lambda_${lam}`] = cell(errB, errA, pB, pA, total, lam, cut);
        }
        // ---- **양성 채널**(#30, 2회차 리뷰어): 새 목적함수가 **가짜 승격을 벌하는가**.
        // 안 벌하면 "합산으로 승격이 이긴다"가 목적함수의 편향(덜 놓으면 유리해지는 성질)인지
        // 승격의 성질인지 구분되지 않는다 — L-C.1이 세운 대조군을 그대로 다시 채점한다
        const sTotal = spurious.bothPlaced + spurious.onlyBefore + spurious.onlyAfter
                     + spurious.neither;
        const sErrB = [...spurious.errBefore, ...spurious.errOnlyBefore];
        const sErrA = [...spurious.errAfter, ...spurious.errOnlyAfter];
        const spB = spurious.bothPlaced + spurious.onlyBefore;
        const spA = spurious.bothPlaced + spurious.onlyAfter;
        const sTable: Record<string, unknown> = {};
        for (const cut of CUTS) for (const lam of [1, 2, 3, 5, 10]) {
          sTable[`cut_${cut}_lambda_${lam}`] = cell(sErrB, sErrA, spB, spA, sTotal, lam, cut);
        }
        return {
          note: "**D-L25가 옛 등록 규칙을 대체했으므로 이 규칙도 다시 채점한다**(리뷰어 [4]). "
            + "옛 규칙('배치가 안 줄면서 조용히 틀림이 안 는다')은 배치 −168 하나로 기각됐다. "
            + "D-L25는 배치와 틀림을 **한 수**로 합쳐 λ가 비율을 정한다.",
          caveat: "⚠ **`only_*` 획은 짝이 없다** — 승격 전후에서 **다른 획 집합**이므로 "
            + "이 점수는 짝지은 비교가 아니다(#11). 분모(전체 획)는 같다. "
            + "⚠ **게이지 적합 모집단도 다르다**(2회차 리뷰어): 승격 전 1122획 · 후 954획에서 "
            + "각각 적합한다. D-L22가 같은 종류의 비교에서 **부분집합 효과를 1.3pp로 실측**해 "
            + "놓았고 여기 합산 여유는 **2.6pp**다 — 여유가 이미 알려진 편향의 2배 안이다. "
            + "**그 몫을 안 갈랐다**(DEFERRED). "
            + "⚠ **여유를 비율로만 읽지 않는다**(#14) — `margin_strokes`를 함께 낸다. "
            + "λ=2·절단 0.5 칸의 여유는 **9획**이고, 같은 세션이 8획짜리 칸(λ 표)을 "
            + "'근거가 못 된다'고 철회했다. **같은 기준을 적용하면 그 칸도 못 쓴다.**",
          total_strokes: total,
          placed_before: pB, placed_after: pA,
          err_n_before: errB.length, err_n_after: errA.length,
          table,
          spurious_control_rescore: {
            note: "**양성 채널**(#30) — 같은 산식을 **가짜 승격**(참 2점 장면에 없는 세 번째 "
              + "소실점을 넣은 것)에 건다. 여기서 점수가 나빠져야 위 표가 승격을 재는 것이다. "
              + "안 나빠지면 그것은 **목적함수의 편향**이지 승격의 성질이 아니다.",
            total_strokes: sTotal, placed_before: spB, placed_after: spA,
            table: sTable,
            at_registered_point: cell(sErrB, sErrA, spB, spA, sTotal, 3, 0.5),
          },
          // **등록 동작점**(D-L25: λ=3 · 절단 0.5)에서의 판정
          at_registered_point: cell(errB, errA, pB, pA, total, 3, 0.5),
          // **시드 폭이 먼저다**(#14, 리뷰어 [2]) — 여유가 이 폭보다 작으면 결론이 없다
          seed_spread_at_registered_point: (() => {
            const rows = Object.entries(dl25Seed).map(([sd, v]) => {
              const b = dl25(v.eB, v.pB, v.total, 3, 0.5), a = dl25(v.eA, v.pA, v.total, 3, 0.5);
              return { seed: Number(sd), before: b, after: a, margin: +(a - b).toFixed(4),
                       promotion_wins: a > b };
            }).sort((x, y) => x.seed - y.seed);
            const ms = rows.map(r => r.margin).sort((x, y) => x - y);
            return {
              note: "시드별 (승격 후 − 승격 전) 점수 차. **전부 같은 부호여야** 결론이 선다.",
              rows,
              margin_min: ms[0], margin_max: ms[ms.length - 1],
              margin_range: +(ms[ms.length - 1] - ms[0]).toFixed(4),
              all_same_sign: rows.every(r => r.promotion_wins) || rows.every(r => !r.promotion_wins),
              verdict: rows.every(r => r.promotion_wins)
                ? "**시드 여섯 전부에서 승격이 이긴다** — D-L25 동작점에서 결론이 선다"
                : rows.every(r => !r.promotion_wins)
                  ? "시드 여섯 전부에서 승격이 진다"
                  : "⚠ **부호가 시드마다 갈린다 — 이 동작점에서는 결론이 없다**(#14). "
                    + "⚠ **양성 채널은 별개로 산다**: 같은 산식이 가짜 승격에는 **−295획**을 "
                    + "매기고 절단 여섯 전부에서 벌한다(`spurious_control_rescore`) — "
                    + "즉 **목적함수는 눈이 떠 있고, 결론이 없는 것은 참 승격의 효과가 "
                    + "시드 폭 안이기 때문이다.**",
            };
          })(),
        };
      })(),
      snap_reanchor: {
        note: "**양성 채널이 먼저다**(#30). `drift_px`가 0이면 '차수 승격에서 스냅이 조용히 "
          + "풀린다'는 걱정 자체가 없는 것이다 — 옛 화면 점과 **새 상**의 화면 거리다.",
        // ⚠ **범위가 위의 배치 지표와 다르다**(#11 · L-C.2 리뷰어 [5])
        scope: "⚠ **이 블록만 두 팔을 합산한다** — 참 승격 216장면 + **가짜 승격 대조군 72장면**이다. "
          + "위의 `real_promotion`·`spurious_promotion_control`은 갈려 있는데 여기는 안 갈렸다. "
          + "**참 승격만의 값은 `order_undo.json`에 있다**(had 1676 · reanchored 1381 · lost 295). "
          + "혼입값(2391 / 1908 / 483)을 참 승격의 수로 인용하면 안 된다 — 실제로 그렇게 인용됐고 고쳤다.",
        had: snapAgg.had, reanchored: snapAgg.reanchored,
        target_unplaced: snapAgg.target_unplaced, behind_camera: snapAgg.behind_camera,
        sum_check: snapAgg.reanchored + snapAgg.target_unplaced + snapAgg.behind_camera
                   === snapAgg.had,
        drift_px: stat(snapAgg.drift, 3),
        caveat: "⚠ **끝점·중점 말고는 매개변수가 안 정해진다.** 교차점·수선 발·선 위는 "
          + "두 선분의 관계라 한 대상만으로는 못 되돌린다 — `a`쪽 끝점으로 근사한다. "
          + "정확히 하려면 `snapStart`가 매개변수를 들어야 하고 그것은 `snap.ts` 변경이다(DEFERRED).",
      },
      seed_spread: {
        note: "표제 수치의 시드별 값(#14). **여유가 이 폭보다 작으면 그 결론은 없다.**",
        after_over_before_silent_0_2: seedRatios.map(r => round(r, 3)),
        crosses_one: seedRatios[0] < 1 && seedRatios[seedRatios.length - 1] > 1,
      },
      registered_rule: {
        rule: "**승격이 옳으려면** 같은 획 집합에서 배치가 안 줄면서 조용히 틀림(cut 0.2)이 "
          + "안 늘어야 한다. 둘 중 하나라도 안 되면 **자동으로 걸지 않는다**(§6.2 사용자 확인).",
        placement_delta: real.onlyAfter - real.onlyBefore,
        silent_before_0_2: round(rate(real.errBefore, 0.2), 4),
        silent_after_0_2: round(rate(real.errAfter, 0.2), 4),
        verdict,
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "order_promote.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식
    // **입력이 실제로 승격이다**(#32) — 아니면 아래 수치가 승격에 대한 정보가 아니다
    expect(doc.order_changed.all_promoted).toBe(true);
    // **대조군이 움직인다**(#30) — 가짜 승격이 실제로 나쁘지 않으면 이 측정은 아무것도 안 잰다
    expect(rate(spurious.errAfter, 0.2)).toBeGreaterThan(rate(spurious.errBefore, 0.2));
    // 사유 카운터의 합이 분모와 같다(#10 — 뺄셈으로 만들지 않는다)
    expect(doc.snap_reanchor.sum_check).toBe(true);
  }, 300_000);
});
