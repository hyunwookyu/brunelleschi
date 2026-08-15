// L-B.7 **승격 연쇄** — 산출: `stage0/out/promote.json`. 계획서 §9.1.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-B.7 절에 적었다.
//
// **이 항목이 D-L18을 가른다.** L-B.4가 "축 판정 임계를 조이는 쪽이 유력한데 회수 기전이
// 없어서 못 따른다"로 미뤄 뒀다. 여기서 그 기전을 만들고 **회수율을 잰다.**
//
// ```
// 조이기가 옳으려면:  (배치 + 회수)가 기준 이상이면서 **조용히 틀림이 낮아야** 한다
// 둘 중 하나라도 안 되면 D-L18은 기각이다   ← 측정 전에 박았다(#26)
// ```
//
// ⚠ **#16이 이 항목의 함정이다** — "승격이 회수한다"가 참이어도 **회수된 것이 조용히 틀리면**
// 아무것도 안 고친 것이다. 회수율과 **회수된 것의 형태 오차**를 반드시 함께 낸다.
// ⚠ **#3** — 미배치를 다시 풀면 일부가 놓이는 것은 거의 정의상 참이다.
// 재는 것은 "놓이는가"가 아니라 **"얼마나, 그리고 맞게"**다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx, type LiftSeg } from "../src/s3d/lift.js";
import { promote, promoteByAnchor, committedDrift } from "../src/s3d/promote.js";
import { snapCandidates, staticCandidates, SNAP_TOL, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "../src/s3d/liveLine.js";
import { unit3, axisDirection, mul3 } from "../src/s3d/geom3d.js";
import { classifyStroke, AXIS_TOL, type Axis, type AxisCfg } from "../src/s3d/axis.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { fitGauge, segShapeError, silentWrong, metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** **등록 5구도 그대로**(`axis_live`·`lift_grade`와 같은 집합·같은 시드 산식). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const SZ: [number, number] = [960, 672];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];

/** **D-L18이 유력하다고 본 조합**과 기준. 여기서 갈린다. */
const ARMS: Record<string, AxisCfg> = {
  base: { vp_dist_ratio: AXIS_TOL.vp_dist_ratio, bend_max: AXIS_TOL.bend_max,
          ambiguity_margin: AXIS_TOL.ambiguity_margin },
  tighten: { vp_dist_ratio: 0.03, bend_max: 0.18, ambiguity_margin: 2.0 },
  loosen: { vp_dist_ratio: 0.22, bend_max: 0.18, ambiguity_margin: 1.2 },
};

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));
const trueAxis = (sc: Scene, a: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[a], SZ) ? a : "screen");

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; diag: number }

function fixture(ci: number, grade: InkGrade, seed: number, jit: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q of pts) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, diag,
           strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })) };
}

// **형태 오차 정의는 `metrics.ts` 하나다.** 여기 있던 `segErr`가 게이지를 안 없앴고
// (= 고정 게이지 1), 그래서 같은 2416획이 `axis_live.json` 0.1222 대 이 원장 0.1533으로
// 갈렸다(리뷰어 L-B.7 [1]). `liftAll`은 깊이를 `gauge_height`로 정규화하므로
// **절대 배율은 자유도**이고, 그것을 안 없애고 뺀 값은 형태 오차가 아니다.
//
// 승격에서 쓰는 게이지는 **확정 집합에서 적합한 것**이다 — 회수 획은 이미 확정된 틀에
// 붙으므로, 회수 집합만 따로 다시 적합하면 "붙는다"는 성질 자체가 지워진다.

interface Bag {
  n: number; total: number; confirmed: number; pendingN: number;
  recovered: number; reasons: Record<string, number>;
  /** 두 번째 기전 — 앵커로 올린 것. */
  recoveredA: number; reasonsA: Record<string, number>;
  errRecoveredA: number[]; aw10: number; aw20: number; aw50: number;
  errConfirmed: number[]; errRecovered: number[];
  cw10: number; cw20: number; cw50: number;
  rw10: number; rw20: number; rw50: number;
  drift: number[];
  /** 확정이 0이라 게이지가 안 정해진 장면 수. **이 장면의 형태 오차는 분모에 없다**(#11). */
  noGauge: number;
  // ---- 연쇄(리뷰어 [4]) — 2회차 이후가 "연쇄"다
  /** 회차 번호 → 그 회차가 회수한 획 수. `[2]`부터가 연쇄의 증거다. */
  chainByRound: Record<number, number>;
  /** 장면마다 몇 회에서 멈췄는가. 1이면 그 장면은 연쇄가 없었다. */
  chainRounds: number[];
  /** 2회차 이후에 추가로 회수된 총합. */
  chainExtra: number;
  errChainExtra: number[]; xw20: number; xw50: number;
  // ---- 일괄 기전 재측정(리뷰어 [2][3], PITFALLS #32) — **실행됐는지부터 센다**
  batchAfter: number; batchAfterIn: number; batchAfterSolved: number;
  batchOracle: number; batchOracleIn: number; batchOracleSolved: number;
  batchOracleReasons: Record<string, number>;
  errBatchOracle: number[]; ow20: number; ow50: number;
  // ---- 게이지 추정기 대조(리뷰어 [1]) — 회수를 **자기 게이지**로도 잰다
  errRecoveredASelf: number[]; asw20: number; asw50: number;
  /** 확정을 **회수의 게이지**로 잰 것 — 추정기를 맞바꿔 본다. */
  errConfirmedFromA: number[]; cfw20: number;
  // ---- 오라클 축 앵커(리뷰어 [4]) — 일괄 팔과 축 정보를 맞춘 대조군
  anchorOracle: number; errAnchorOracle: number[]; aow20: number; aow50: number;
  /** 오라클 팔들의 **자기 게이지** 판(2회차 리뷰어 [1]) — 확정과 견주려면 추정기를 맞춰야 한다. */
  errAnchorOracleSelf: number[]; errBatchOracleSelf: number[];
  /** 확정을 회수 게이지로 잰 부분집합의 **자기 게이지** 판(2회차 [6]) — 부분집합 효과를 가른다. */
  errConfirmedSubsetSelf: number[]; csw20: number;
  /** 그 부분집합에서 빠진 획 수 — 1979 대 2416의 차를 카운터로 남긴다(#11). */
  confirmedSubsetSkipped: number;
  /** **오라클 축 × 동작점** 스윕(2회차 [2]) — 실 라벨 스윕과 오라클 일괄을 견주면 교란이 남는다. */
  opSweepOracle: Record<string, { pending: number; got: number; w20: number; errN: number }>;
  /** 시드별 표제 수치(2회차 [8] · #14). */
  seedRows: Record<string, { recA: number; pend: number; aw20: number; aErrN: number;
                             asw20: number; asErrN: number; cw20: number; cErrN: number;
                             batchOracle: number; anchorOracle: number }>;
  /** 확정 집합을 구도로 가른다(2회차 [7]). */
  confirmByComp: Record<string, { n: number; w20: number }>;
  /** 연쇄를 구도로 가른다(2회차 [14]). */
  chainByComp: Record<string, number>;
  // ---- 동작점 스윕(리뷰어 [5] · #12)
  opSweep: Record<string, { pending: number; got: number; w20: number; errN: number }>;
  /** 대기 획이 0이라 연쇄 회차를 셀 것이 없던 장면(#11 — 338 대 360의 차이). */
  noPending: number;
}
/** 연쇄 상한. 도달하면 원장에 적는다 — **조용히 자르지 않는다.** */
const CHAIN_MAX_ROUNDS = 8;

/** 앵커 팔의 **동작점**. 거부 사유가 전부 이 둘의 귀결이므로 한 점만 재면 안 된다(#12). */
const OP_BASE = { axis_deg: LIVE_TOL.axis_deg, radius_ratio: SNAP_TOL.radius_ratio };
const OP_SWEEP = [
  { axis_deg: 4, radius_ratio: SNAP_TOL.radius_ratio },
  { axis_deg: 20, radius_ratio: SNAP_TOL.radius_ratio },
  { axis_deg: LIVE_TOL.axis_deg, radius_ratio: 0.02 },
  { axis_deg: LIVE_TOL.axis_deg, radius_ratio: 0.10 },
  { axis_deg: 20, radius_ratio: 0.10 },
];

/**
 * **회수율을 등급·잡음으로 가른다**(리뷰어 [11] · PITFALLS #12).
 * 합산 한 점으로 "37.8%"라고 적으면 그 값이 어느 조건에서도 유지되는지 알 수 없다.
 */
interface Cellule { pending: number; anchor: number; chain: number; w20: number; errN: number }
const cellule = (): Cellule => ({ pending: 0, anchor: 0, chain: 0, w20: 0, errN: 0 });
const celluleRep = (c: Cellule) => ({
  anchor_recovered_over_pending: `${c.anchor}/${c.pending}`,
  anchor_recovery_rate: round(c.anchor / Math.max(1, c.pending), 4),
  chain_extra: c.chain,
  anchor_silent_wrong_0_2: `${c.w20}/${c.errN}`,
});
const bag = (): Bag => ({ n: 0, total: 0, confirmed: 0, pendingN: 0, recovered: 0, reasons: {},
                          recoveredA: 0, reasonsA: {}, errRecoveredA: [],
                          aw10: 0, aw20: 0, aw50: 0,
                          errConfirmed: [], errRecovered: [],
                          cw10: 0, cw20: 0, cw50: 0, rw10: 0, rw20: 0, rw50: 0, drift: [],
                          noGauge: 0,
                          chainByRound: {}, chainRounds: [], chainExtra: 0,
                          errChainExtra: [], xw20: 0, xw50: 0,
                          batchAfter: 0, batchAfterIn: 0, batchAfterSolved: 0,
                          batchOracle: 0, batchOracleIn: 0, batchOracleSolved: 0,
                          batchOracleReasons: {}, errBatchOracle: [], ow20: 0, ow50: 0,
                          errRecoveredASelf: [], asw20: 0, asw50: 0,
                          errConfirmedFromA: [], cfw20: 0,
                          anchorOracle: 0, errAnchorOracle: [], aow20: 0, aow50: 0,
                          errAnchorOracleSelf: [], errBatchOracleSelf: [],
                          errConfirmedSubsetSelf: [], csw20: 0, confirmedSubsetSkipped: 0,
                          opSweepOracle: {}, seedRows: {}, confirmByComp: {}, chainByComp: {},
                          opSweep: {}, noPending: 0 });
const rep = (b: Bag) => ({
  scenes: b.n,
  // **분모를 적는다**(#11). 회수율의 분모는 **그 조건에서 실제로 미배치인 획**이다
  confirmed_over_all: `${b.confirmed}/${b.total}`,
  pending_after_confirm: `${b.pendingN}/${b.total}`,
  recovered_over_pending: `${b.recovered}/${b.pendingN}`,
  recovery_rate: round(b.recovered / Math.max(1, b.pendingN), 4),
  placed_total_over_all: `${b.confirmed + b.recovered}/${b.total}`,
  not_recovered_reasons: b.reasons,
  confirmed_shape_err: stat(b.errConfirmed),
  recovered_shape_err: stat(b.errRecovered),
  // **분모는 형태 오차를 실제로 잰 집합이다**(#11) — 확정이 0인 장면은 게이지가 안 정해져
  // 회수 획도 못 잰다. `scenes_without_gauge`가 그 장면 수다
  scenes_without_gauge: b.noGauge,
  shape_err_measured: { confirmed: `${b.errConfirmed.length}/${b.confirmed}`,
                        recovered: `${b.errRecovered.length}/${b.recovered}`,
                        anchor: `${b.errRecoveredA.length}/${b.recoveredA}` },
  // **절단을 하나 고르지 않는다**(#13). 분모는 각각 그 집합이다
  confirmed_silent_wrong: { cut_0_1: `${b.cw10}/${b.errConfirmed.length}`,
                            cut_0_2: `${b.cw20}/${b.errConfirmed.length}`,
                            cut_0_5: `${b.cw50}/${b.errConfirmed.length}` },
  recovered_silent_wrong: { cut_0_1: `${b.rw10}/${b.errRecovered.length}`,
                            cut_0_2: `${b.rw20}/${b.errRecovered.length}`,
                            cut_0_5: `${b.rw50}/${b.errRecovered.length}` },
  // **합쳐서 본다** — 채택 규칙이 (배치 + 회수)와 조용히 틀림을 함께 요구한다
  all_silent_wrong: {
    cut_0_2: `${b.cw20 + b.rw20}/${b.errConfirmed.length + b.errRecovered.length}`,
    cut_0_5: `${b.cw50 + b.rw50}/${b.errConfirmed.length + b.errRecovered.length}`,
    rate_0_2: round((b.cw20 + b.rw20) / Math.max(1, b.errConfirmed.length + b.errRecovered.length), 4),
    rate_0_5: round((b.cw50 + b.rw50) / Math.max(1, b.errConfirmed.length + b.errRecovered.length), 4),
  },
  committed_drift: stat(b.drift, 12),
  // ---- 두 번째 기전(앵커). **이것이 실제로 회수하는 쪽이다**
  anchor_recovered_over_pending: `${b.recoveredA}/${b.pendingN}`,
  anchor_recovery_rate: round(b.recoveredA / Math.max(1, b.pendingN), 4),
  anchor_not_recovered_reasons: b.reasonsA,
  anchor_recovered_shape_err: stat(b.errRecoveredA),
  anchor_recovered_silent_wrong: {
    cut_0_1: `${b.aw10}/${b.errRecoveredA.length}`, cut_0_2: `${b.aw20}/${b.errRecoveredA.length}`,
    cut_0_5: `${b.aw50}/${b.errRecoveredA.length}`,
  },
  anchor_all_silent_wrong: {
    cut_0_2: `${b.cw20 + b.aw20}/${b.errConfirmed.length + b.errRecoveredA.length}`,
    cut_0_5: `${b.cw50 + b.aw50}/${b.errConfirmed.length + b.errRecoveredA.length}`,
    rate_0_2: round((b.cw20 + b.aw20) / Math.max(1, b.errConfirmed.length + b.errRecoveredA.length), 4),
    rate_0_5: round((b.cw50 + b.aw50) / Math.max(1, b.errConfirmed.length + b.errRecoveredA.length), 4),
  },
  anchor_placed_total_over_all: `${b.confirmed + b.recoveredA}/${b.total}`,
  // ---- **연쇄 자체**(리뷰어 [4]). 1회차는 위의 `anchor_*`와 같은 양이다
  chain: {
    note: "**회차별** 회수. `round_2` 이상이 있어야 '승격은 연쇄한다'가 측정된 것이다. "
      + "`rounds_used`가 장면마다 몇 회에서 멈췄는지다(1 = 연쇄 없음).",
    recovered_by_round: b.chainByRound,
    extra_after_round_1: b.chainExtra,
    rounds_used: stat(b.chainRounds, 2),
    // **분모를 적는다**(#11 · 리뷰어 [12]) — `rounds_used.n`이 `scenes`보다 작은 이유다
    rounds_denominator: `${b.chainRounds.length}/${b.n} (대기 0인 장면 ${b.noPending}개 제외)`,
    hit_round_cap: b.chainRounds.filter(r => r >= CHAIN_MAX_ROUNDS).length,
    fixture_note: "⚠ **장면당 획이 12개**(상자 하나의 모서리)다. 12획 그래프에서 연쇄 깊이가 "
      + "4를 넘기 어려운 것은 **픽스처가 정하는 상한에 가깝다** — '수렴한다'를 일반 명제로 "
      + "읽지 않는다. 상자 둘 이상은 안 쟀다(DEFERRED).",
    round_cap: CHAIN_MAX_ROUNDS,
    extra_shape_err: stat(b.errChainExtra),
    extra_silent_wrong: { cut_0_2: `${b.xw20}/${b.errChainExtra.length}`,
                          cut_0_5: `${b.xw50}/${b.errChainExtra.length}` },
    chain_placed_total_over_all: `${b.confirmed + b.recoveredA + b.chainExtra}/${b.total}`,
  },
  // ---- **일괄 기전 재측정**(리뷰어 [2][3] · PITFALLS #32). **실행 카운터를 먼저 낸다**
  batch_reexamined: {
    note: "초판의 회수 0은 **거름이 대기 집합을 전부 비워 솔버에 한 획도 안 닿은 것**이었다. "
      + "`solved_pending`이 0이면 그 실행은 **기전에 대한 정보가 0이다**(#32). "
      + "`축이 미분류다`는 판정기의 결과이지 획의 성질이 아니므로 **축을 주고 다시 돌린다**. "
      + "⚠ **개수만 읽지 않는다**(#16) — `silent_wrong`을 반드시 함께 읽는다.",
    promoted_equals_solved: "⚠ `promoted`는 `solved_pending − dropped_by_connection`이다. "
      + "여섯 조건에서 둘이 같은 것은 **연결 거름이 한 건도 안 걸렸기 때문**이지 항등이어서가 아니다.",
    after_chain: { input: b.batchAfterIn, solved_pending: b.batchAfterSolved,
                   promoted: b.batchAfter },
    oracle_axis: { input: b.batchOracleIn, solved_pending: b.batchOracleSolved,
                   promoted: b.batchOracle, not_promoted_reasons: b.batchOracleReasons,
                   shape_err: stat(b.errBatchOracle),
                   silent_wrong: { cut_0_2: `${b.ow20}/${b.errBatchOracle.length}`,
                                   cut_0_5: `${b.ow50}/${b.errBatchOracle.length}` } },
    // **축 정보를 맞춘 대조군**(리뷰어 [4]) — 일괄 팔에만 오라클을 주면 기전 차이와
    // 축 정보 차이가 섞인다. 앵커에도 같은 오라클을 주고 비교한다
    oracle_axis_anchor_control: {
      note: "앵커 팔에 **같은 오라클 축**을 준 것. `oracle_axis.promoted`와 이것을 견주는 것이 "
        + "**기전 비교**이고, `anchor_recovered_over_pending`(실제 라벨)과 견주면 "
        + "**축 정보의 몫**이다.",
      promoted_over_pending: `${b.anchorOracle}/${b.pendingN}`,
      rate: round(b.anchorOracle / Math.max(1, b.pendingN), 4),
      shape_err: stat(b.errAnchorOracle),
      silent_wrong: { cut_0_2: `${b.aow20}/${b.errAnchorOracle.length}`,
                      cut_0_5: `${b.aow50}/${b.errAnchorOracle.length}` },
    },
  },
  // ---- **게이지 추정기 대조**(리뷰어 [1] · #3·#31). 확정은 `fit`, 회수는 `고정`이라
  // 추정기가 다르다. 최소제곱 적합은 정의상 오차를 낮추므로 **편향의 방향이 정해져 있다**
  gauge_estimator_control: {
    note: "'회수가 확정보다 나쁘다'가 **배치의 성질인지 추정기의 성질인지** 가른다. "
      + "회수 집합을 **자기 게이지**(회수만으로 적합)로도 재고, 확정 집합을 **회수의 게이지**로도 잰다. "
      + "네 값이 같은 방향을 가리켜야 결론이 선다.",
    // **절단을 하나 고르지 않는다**(#13 · 2회차 [5]) — 등록한 셋을 다 낸다.
    // 그리고 **형태 오차 자체도 낸다**(#8 · 2회차 [3]) — cut 0.2 비율의 비를
    // "형태 격차"라 부르면 꼬리가 사라진다
    recovered_fixed_gauge: { shape_err: stat(b.errRecoveredA), ...silentWrong(b.errRecoveredA) },
    recovered_self_gauge: { shape_err: stat(b.errRecoveredASelf), ...silentWrong(b.errRecoveredASelf) },
    confirmed_self_gauge: { shape_err: stat(b.errConfirmed), ...silentWrong(b.errConfirmed) },
    confirmed_recovered_gauge: { shape_err: stat(b.errConfirmedFromA), ...silentWrong(b.errConfirmedFromA) },
    // **같은 부분집합의 자기 게이지**(2회차 [6]) — 추정기와 부분집합 교체를 가른다
    confirmed_subset_self_gauge: { shape_err: stat(b.errConfirmedSubsetSelf),
                                   ...silentWrong(b.errConfirmedSubsetSelf),
                                   skipped_not_in_subset: b.confirmedSubsetSkipped },
    // **오라클 팔의 자기 게이지**(2회차 [1]) — 확정과의 비교 다리를 놓으려면 필요하다
    anchor_oracle_self_gauge: { shape_err: stat(b.errAnchorOracleSelf),
                                ...silentWrong(b.errAnchorOracleSelf) },
    batch_oracle_self_gauge: { shape_err: stat(b.errBatchOracleSelf),
                               ...silentWrong(b.errBatchOracleSelf) },
    ratios_note: "**배수를 하나로 적지 않는다**(#8). cut 0.2 비율의 비 · 형태 오차 중앙의 비 · "
      + "p90의 비가 서로 다르다 — 셋을 다 읽는다.",
  },
  // **시드 변동폭**(2회차 [8] · #14). 이 프로젝트는 0.6pp를 시드 폭으로 기각한 적이 있다
  seed_spread: {
    note: "표제 수치의 시드별 값. **결론의 여유가 이 폭보다 작으면 그 결론은 없다.**",
    rows: Object.fromEntries(Object.entries(b.seedRows).map(([s, r]) => [s, {
      anchor_recovered_over_pending: `${r.recA}/${r.pend}`,
      anchor_rate: round(r.recA / Math.max(1, r.pend), 4),
      recovered_fixed_silent_0_2: round(r.aw20 / Math.max(1, r.aErrN), 4),
      recovered_self_silent_0_2: round(r.asw20 / Math.max(1, r.asErrN), 4),
      confirmed_silent_0_2: round(r.cw20 / Math.max(1, r.cErrN), 4),
      self_over_confirmed_ratio: round((r.asw20 / Math.max(1, r.asErrN))
                                     / Math.max(1e-9, r.cw20 / Math.max(1, r.cErrN)), 3),
    }])),
  },
  // ---- **동작점 스윕**(리뷰어 [5] · #12). 앵커 거부 사유가 두 상수의 귀결이므로
  // 한 점만 재면 37.8%는 배치의 성질이 아니라 **그 상수의 통과율**이다
  anchor_operating_points: {
    note: "`axis_deg`와 `radius_ratio`를 바꿔 본다. 기준은 "
      + `axis${OP_BASE.axis_deg}_rad${OP_BASE.radius_ratio}다.`,
    base: { got_over_pending: `${b.recoveredA}/${b.pendingN}`,
            silent_0_2: `${b.aw20}/${b.errRecoveredA.length}` },
    sweep: Object.fromEntries(Object.entries(b.opSweep).map(([k, c]) => [k, {
      got_over_pending: `${c.got}/${c.pending}`,
      rate: round(c.got / Math.max(1, c.pending), 4),
      silent_0_2: `${c.w20}/${c.errN}`,
      silent_rate_0_2: round(c.w20 / Math.max(1, c.errN), 4),
    }])),
    // **오라클 축 × 동작점**(2회차 [2]). 위 스윕은 **실 라벨**이라 오라클 일괄과 견주면
    // [4]가 제거한 축 정보 교란이 되살아난다. 축을 맞춘 채로 동작점을 흔든 것이 이것이다
    sweep_oracle_axis: Object.fromEntries(Object.entries(b.opSweepOracle).map(([k, c]) => [k, {
      got_over_pending: `${c.got}/${c.pending}`,
      rate: round(c.got / Math.max(1, c.pending), 4),
      silent_0_2: `${c.w20}/${c.errN}`,
      silent_rate_0_2: round(c.w20 / Math.max(1, c.errN), 4),
    }])),
  },
  // **확정과 연쇄도 구도로 가른다**(2회차 [7][14])
  confirmed_by_composition: Object.fromEntries(Object.entries(b.confirmByComp).map(([k, c]) =>
    [k, { silent_wrong_0_2: `${c.w20}/${c.n}`, rate: round(c.w20 / Math.max(1, c.n), 4) }])),
  chain_extra_by_composition: b.chainByComp,
});

describe("L-B.7 — 승격 연쇄가 실제로 회수하는가", () => {
  it("측정을 원장에 남긴다", () => {
    const arms: Record<string, Bag> = {};
    /** 대조군: **승격 없이** 같은 미배치 집합을 다시 푼다 — 아무 일도 안 일어나야 한다. */
    const control = { tried: 0, extra: 0, errFixed: [] as number[], errSelf: [] as number[],
                      fw20: 0, sw20: 0 };
    /** **양성 채널**(리뷰어 [6]) — 덮어쓰기를 켜면 `committedDrift`가 0이 아니어야 한다. */
    const driftPositive: number[] = [];
    /** **기준 팔만** 등급·잡음·구도로 가른다(리뷰어 [11]). */
    const byGrade: Record<string, Cellule> = {};
    const byJit: Record<string, Cellule> = {};
    const byComp: Record<string, Cellule> = {};

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) continue;
        const ctx: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f,
                               vps: trueVps(fx.sc), imgSize: SZ };

        for (const [name, cfg] of Object.entries(ARMS)) {
          const b = (arms[name] ??= bag());
          b.n += 1; b.total += fx.strokes.length;

          // ---- 확정: 축을 판정하고 한 번에 푼다(= L-A의 초기 확정 그대로)
          const input: LiftStroke[] = fx.strokes.map(s => ({
            ...s,
            axis: classifyStroke(s.pts2d, ctx.vps, SZ, cfg,
                                 { principal: ctx.principal, f: ctx.f }).axis,
          }));
          const first = liftAll(input, ctx);
          b.confirmed += first.placed.size;
          // **확정 집합이 게이지를 정한다.** 회수 획은 이 게이지로 잰다 — 새로 적합하지 않는다.
          // 확정이 비면 게이지가 안 정해지므로 그 장면의 형태 오차는 **안 센다**(분모에서 뺀다).
          const kFix = first.placed.size ? fitGauge(first.placed, fx.edges) : null;
          if (kFix == null) b.noGauge += 1;
          const err = (sg: LiftSeg, id: string): number | null =>
            kFix == null ? null : segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFix);
          for (const [id, seg] of first.placed) {
            const e = err(seg, id);
            if (e == null) continue;
            b.errConfirmed.push(e);
            if (e > 0.1) b.cw10 += 1;
            if (e > 0.2) b.cw20 += 1;
            if (e > 0.5) b.cw50 += 1;
          }

          // ---- 대기: 못 놓인 획들. **이것이 회수율의 분모다**
          const pending = input.filter(s => !first.placed.has(s.id));
          b.pendingN += pending.length;
          // **분모를 적는다**(#11) — 여기서 빠지는 장면이 `chain.rounds_used.n`과 `committed_drift.n`이
          // 360보다 작은 이유다. 안 적으면 그 차이가 설명되지 않는다(리뷰어 [12])
          if (!pending.length) { b.noPending += 1; continue; }

          // ---- 승격
          const committed = new Map(first.placed);
          const pr = promote(pending, input, first.placed, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
          b.recovered += pr.promoted.size;
          for (const [k2, v] of Object.entries(pr.reasons)) b.reasons[k2] = (b.reasons[k2] ?? 0) + v;
          for (const [id, seg] of pr.promoted) {
            const e = err(seg, id);
            if (e == null) continue;
            b.errRecovered.push(e);
            if (e > 0.1) b.rw10 += 1;
            if (e > 0.2) b.rw20 += 1;
            if (e > 0.5) b.rw50 += 1;
          }
          // ---- 판정 ③: **기존 기하를 안 움직였는가**
          b.drift.push(committedDrift(committed, first.placed));

          // ---- **두 번째 기전: 앵커로 올린다**(§3·§7의 실시간 경로를 대기 획에 적용).
          // 대상은 **확정된 3D 기하**다 — 새로 놓인 것에 시작점이 붙으면 앵커가 생긴다.
          //
          // ⚠ **한 회분만 재면 연쇄를 잰 것이 아니다**(리뷰어 [4]). 회수된 획이 다시 앵커가 되어
          // 다음 회를 여는 것이 §9.1의 "승격은 연쇄한다"이므로, **더 안 늘 때까지 돈다.**
          const sctx: SnapCtx = { principal: ctx.principal, f: ctx.f, imgSize: SZ,
                                  ground: null, from: null };
          const dirs = [0, 1, 2].map(i => {
            const v = fx.sc.vps[i as 0 | 1 | 2];
            return isFiniteVp(v, SZ) ? unit3(axisDirection(v, ctx.principal, ctx.f)) : null;
          });
          /**
           * 한 회 — `committed`를 스냅 대상으로 두고 `rest`를 앵커로 올린다. 축 라벨도 낸다.
           *
           * `op`가 **동작점**이다(리뷰어 [5] · #12). 거부 사유가 `angle_over`·`no_snap` 둘뿐이라
           * 회수율은 **이 두 상수의 통과율**이다 — 한 점만 재면 그 값은 상수의 성질이다.
           * `oracleAxis`를 주면 축 판정을 건너뛴다 — **일괄 팔과 축 정보를 맞추는 대조군**이다(리뷰어 [4]).
           */
          const anchorRound = (
            rest: LiftStroke[], committedNow: Map<string, LiftSeg>,
            op: { axis_deg: number; radius_ratio: number } = OP_BASE,
            oracleAxis = false,
          ) => {
            const segs: SnapSeg[] = [...committedNow].map(([id, sg]) => ({ id, a: sg.a, b: sg.b }));
            const pre = staticCandidates(segs);
            const axisOf = new Map<string, Axis>();
            const pa = promoteByAnchor(rest, (st) => {
              const a2 = st.pts2d[0], b2 = st.pts2d[st.pts2d.length - 1];
              const cand = segs.length
                ? snapCandidates(a2, segs, sctx, { radius_ratio: op.radius_ratio }, pre)[0] : undefined;
              if (!cand) return { seg: null, why: "no_snap" };
              let ax: 0 | 1 | 2;
              if (oracleAxis) {
                const t = trueAxis(fx.sc, fx.edges[+st.id.slice(1)].axis as 0 | 1 | 2);
                if (typeof t !== "number" || !dirs[t]) return { seg: null, why: "oracle_axis_screen" };
                ax = t;
              } else {
                const near = nearestAxisOnScreen(cand.at, dirs, cand.screen, b2,
                                                 { principal: ctx.principal, f: ctx.f });
                if (!near || near.deg > op.axis_deg) return { seg: null, why: "angle_over" };
                ax = near.axis as 0 | 1 | 2;
              }
              const sg = segmentFromAnchor(cand.at, dirs[ax], b2,
                                           { principal: ctx.principal, f: ctx.f });
              if (sg) axisOf.set(st.id, ax as Axis);
              return sg ? { seg: sg, why: "" } : { seg: null, why: "no_end" };
            });
            return { ...pa, axisOf };
          };

          // ---- 1회차: 기존 보고와 같은 양(비교 가능성을 지킨다)
          const r1 = anchorRound(pending, first.placed);
          b.recoveredA += r1.promoted.size;
          for (const [k3, v] of Object.entries(r1.reasons)) b.reasonsA[k3] = (b.reasonsA[k3] ?? 0) + v;
          for (const [id, sg] of r1.promoted) {
            const e = err(sg, id);
            if (e == null) continue;
            b.errRecoveredA.push(e);
            if (e > 0.1) b.aw10 += 1;
            if (e > 0.2) b.aw20 += 1;
            if (e > 0.5) b.aw50 += 1;
          }
          // **회수를 자기 게이지로도 잰다**(리뷰어 [1] · #3). 확정은 `fit`(자기 집합)이고 회수는
          // `고정`(확정 집합)이라 **추정기가 다르다** — 최소제곱 적합은 정의상 오차를 낮추므로
          // 편향의 **방향이 정해져 있다**(#31). 같은 원장이 그 크기를 이미 쟀다(대조군 207획에서 중앙 2.0배).
          // 그래서 회수 집합에도 자기 게이지를 적용해 **두 값을 나란히 낸다.** 안 그러면
          // "회수가 나쁘다"와 "게이지가 그렇게 만든다"를 이 원장으로 못 가른다.
          if (r1.promoted.size) {
            const kSelfA = fitGauge(r1.promoted, fx.edges);
            for (const [id, sg] of r1.promoted) {
              const e = segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kSelfA);
              b.errRecoveredASelf.push(e);
              if (e > 0.2) b.asw20 += 1;
              if (e > 0.5) b.asw50 += 1;
            }
          }
          // **확정 집합도 고정 게이지의 반대편에서 본다** — 확정을 회수와 같은 추정기로 두면
          // 어떻게 되는가. 확정은 자기 게이지가 곧 `fit`이므로 여기서는 **회수 게이지**를 빌려 준다
          if (r1.promoted.size && first.placed.size) {
            const kFromA = fitGauge(r1.promoted, fx.edges);
            const kSelf2 = fitGauge(first.placed, fx.edges);
            for (const [id, sg] of first.placed) {
              const e = segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFromA);
              b.errConfirmedFromA.push(e);
              if (e > 0.2) b.cfw20 += 1;
              // **같은 부분집합의 자기 게이지 판**(2회차 [6]) — 그래야 0.469 대 0.362의 차 중
              // 추정기의 몫과 **부분집합 교체**의 몫이 갈린다
              const e2 = segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kSelf2);
              b.errConfirmedSubsetSelf.push(e2);
              if (e2 > 0.2) b.csw20 += 1;
            }
          } else b.confirmedSubsetSkipped += first.placed.size;
          // ---- **오라클 축 앵커**(리뷰어 [4]) — 일괄 팔과 **축 정보를 맞춘 대조군**.
          // 이것이 없으면 "일괄 1154 > 앵커 720"에서 기전 차이와 축 정보 차이가 안 갈린다
          {
            const ro = anchorRound(pending, first.placed, OP_BASE, true);
            b.anchorOracle += ro.promoted.size;
            for (const [id, sg] of ro.promoted) {
              const e = err(sg, id);
              if (e == null) continue;
              b.errAnchorOracle.push(e);
              if (e > 0.2) b.aow20 += 1;
              if (e > 0.5) b.aow50 += 1;
            }
            // **자기 게이지 판**(2회차 [1]) — 확정(자기 게이지)과 견주려면 추정기를 맞춰야 한다
            if (ro.promoted.size) {
              const k = fitGauge(ro.promoted, fx.edges);
              for (const [id, sg] of ro.promoted) {
                b.errAnchorOracleSelf.push(segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, k));
              }
            }
            // ---- **오라클 축 × 동작점**(2회차 [2]) — 실 라벨 스윕과 오라클 일괄을 견주면
            // [4]가 막 제거한 축 정보 교란이 되살아난다. 축을 맞춘 채로 동작점을 흔든다
            for (const op of OP_SWEEP) {
              const rr = anchorRound(pending, first.placed, op, true);
              const key = `axis${op.axis_deg}_rad${op.radius_ratio}`;
              const c = (b.opSweepOracle[key] ??= { pending: 0, got: 0, w20: 0, errN: 0 });
              c.pending += pending.length; c.got += rr.promoted.size;
              for (const [id, sg] of rr.promoted) {
                const e = err(sg, id);
                if (e == null) continue;
                c.errN += 1; if (e > 0.2) c.w20 += 1;
              }
            }
          }
          // ---- **두 번째 동작점**(리뷰어 [5] · #12). 거부 사유가 두 상수의 귀결이므로
          // 한 점만 재면 37.8%는 그 상수의 성질이다
          for (const op of OP_SWEEP) {
            const rr = anchorRound(pending, first.placed, op);
            const key = `axis${op.axis_deg}_rad${op.radius_ratio}`;
            const c = (b.opSweep[key] ??= { pending: 0, got: 0, w20: 0, errN: 0 });
            c.pending += pending.length; c.got += rr.promoted.size;
            for (const [id, sg] of rr.promoted) {
              const e = err(sg, id);
              if (e == null) continue;
              c.errN += 1; if (e > 0.2) c.w20 += 1;
            }
          }

          // ---- **2회차 이후 — 연쇄 자체**(리뷰어 [4]). 더 안 늘 때까지.
          const chainAxis = new Map<string, Axis>(r1.axisOf);
          const cur = new Map(first.placed);
          for (const [id, sg] of r1.promoted) cur.set(id, sg);
          let rest = pending.filter(s => !r1.promoted.has(s.id));
          let round = 1;
          while (round < CHAIN_MAX_ROUNDS && rest.length) {
            const rn = anchorRound(rest, cur);
            if (!rn.promoted.size) break;
            round += 1;
            b.chainByRound[round] = (b.chainByRound[round] ?? 0) + rn.promoted.size;
            for (const [id, sg] of rn.promoted) {
              cur.set(id, sg);
              chainAxis.set(id, rn.axisOf.get(id)!);
              const e = err(sg, id);
              if (e == null) continue;
              b.errChainExtra.push(e);
              if (e > 0.2) b.xw20 += 1;
              if (e > 0.5) b.xw50 += 1;
            }
            rest = rest.filter(s => !rn.promoted.has(s.id));
          }
          b.chainRounds.push(round);
          // ---- **시드별 표제 수치**(2회차 [8] · #14) — 이 프로젝트는 0.6pp를 시드 폭으로 기각했다
          {
            const sr = (b.seedRows[String(seed)] ??= { recA: 0, pend: 0, aw20: 0, aErrN: 0,
                                                       asw20: 0, asErrN: 0, cw20: 0, cErrN: 0,
                                                       batchOracle: 0, anchorOracle: 0 });
            sr.recA += r1.promoted.size; sr.pend += pending.length;
            if (kFix != null) {
              for (const [id, sg] of r1.promoted) {
                sr.aErrN += 1;
                if (segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFix) > 0.2) sr.aw20 += 1;
              }
              for (const [id, sg] of first.placed) {
                sr.cErrN += 1;
                if (segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFix) > 0.2) sr.cw20 += 1;
              }
            }
            if (r1.promoted.size) {
              const ks = fitGauge(r1.promoted, fx.edges);
              for (const [id, sg] of r1.promoted) {
                sr.asErrN += 1;
                if (segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, ks) > 0.2) sr.asw20 += 1;
              }
            }
          }
          // ---- **확정과 연쇄를 구도로 가른다**(2회차 [7][14]) — 회수만 갈라 놓으면
          // 1.10배가 층 효과와 섞이고, 연쇄는 1점 구도에서 0인 것이 안 보인다
          if (name === "base" && kFix != null) {
            const cc = (b.confirmByComp[COMPOSITIONS[ci].name] ??= { n: 0, w20: 0 });
            for (const [id, sg] of first.placed) {
              cc.n += 1;
              if (segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFix) > 0.2) cc.w20 += 1;
            }
            b.chainByComp[COMPOSITIONS[ci].name] =
              (b.chainByComp[COMPOSITIONS[ci].name] ?? 0)
              + ((cur.size - first.placed.size) - r1.promoted.size);
          }
          if (name === "base") {
            const extra = (cur.size - first.placed.size) - r1.promoted.size;
            for (const c of [byGrade[grade] ??= cellule(), byJit[`jit_${jit}`] ??= cellule(),
                             byComp[COMPOSITIONS[ci].name] ??= cellule()]) {
              c.pending += pending.length; c.anchor += r1.promoted.size; c.chain += extra;
              for (const [id, sg] of r1.promoted) {
                const e = err(sg, id);
                if (e == null) continue;
                c.errN += 1; if (e > 0.2) c.w20 += 1;
              }
            }
          }
          b.chainExtra += (cur.size - first.placed.size) - r1.promoted.size;

          // ---- **[2][3] 축을 준 뒤 일괄 기전을 돌린다**(#32).
          // 초판은 대기 1904가 거름에서 전부 걸려 **솔버에 한 획도 안 닿은 것**을 두고
          // "기전이 회수를 못 한다"고 적었다. `축이 미분류다`는 **판정기의 결과이지 획의 성질이
          // 아니다** — 축을 주면 실행될 수 있다. 두 팔로 가른다:
          //   ⓐ 연쇄가 붙인 축 + 연쇄가 키운 확정 집합
          //   ⓑ **오라클 축**(참값) — 어떤 축 판정기도 이보다 나을 수 없는 상한
          {
            const labeled = rest.map(s => ({ ...s, axis: chainAxis.get(s.id) ?? s.axis }));
            const curInput: LiftStroke[] = [...cur.keys()].map(id =>
              ({ ...input.find(s => s.id === id)!, axis: chainAxis.get(id) ?? input.find(s => s.id === id)!.axis }));
            const pb = promote(labeled, curInput, cur, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
            b.batchAfter += pb.promoted.size;
            b.batchAfterIn += pb.exec.pendingIn;
            b.batchAfterSolved += pb.exec.solvedPending;

            const oracle = pending.map(s => ({ ...s,
              axis: trueAxis(fx.sc, fx.edges[+s.id.slice(1)].axis as 0 | 1 | 2) }));
            const po = promote(oracle, input.map(s => ({
              ...s, axis: first.placed.has(s.id)
                ? trueAxis(fx.sc, fx.edges[+s.id.slice(1)].axis as 0 | 1 | 2) : s.axis,
            })), first.placed, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
            b.batchOracle += po.promoted.size;
            b.batchOracleIn += po.exec.pendingIn;
            b.batchOracleSolved += po.exec.solvedPending;
            for (const [k4, v] of Object.entries(po.reasons)) {
              b.batchOracleReasons[k4] = (b.batchOracleReasons[k4] ?? 0) + v;
            }
            for (const [id, sg] of po.promoted) {
              const e = err(sg, id);
              if (e == null) continue;
              b.errBatchOracle.push(e);
              if (e > 0.2) b.ow20 += 1;
              if (e > 0.5) b.ow50 += 1;
            }
            // **자기 게이지 판**(2회차 [1])
            if (po.promoted.size) {
              const k = fitGauge(po.promoted, fx.edges);
              for (const [id, sg] of po.promoted) {
                b.errBatchOracleSelf.push(segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, k));
              }
            }
          }

          // ---- **대조군**(#6): 승격 없이 미배치 집합만 다시 푼다.
          // 같은 입력을 같은 솔버에 다시 넣는 것이므로 **새로 놓이는 것이 없어야** 한다.
          if (name === "base") {
            control.tried += pending.length;
            const again = liftAll(pending, ctx);
            control.extra += again.placed.size;
            // **놓인 것의 형태 오차를 잰다**(리뷰어 [5]). "배율이 정해지지 않는다"는 논증이지
            // 측정이 아니었다(#7). 두 게이지로 낸다 — 확정 집합의 게이지(승격이 쓰는 것)와
            // **자기 게이지**(배율을 공짜로 주는 관대한 읽기)다. 둘이 갈리면 그것이 답이다
            if (again.placed.size && kFix != null) {
              const kSelf = fitGauge(again.placed, fx.edges);
              for (const [id, sg] of again.placed) {
                const eFix = segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kFix);
                const eSelf = segShapeError(sg, fx.edges[+id.slice(1)], fx.diag, kSelf);
                control.errFixed.push(eFix); control.errSelf.push(eSelf);
                if (eFix > 0.2) control.fw20 += 1;
                if (eSelf > 0.2) control.sw20 += 1;
              }
            }
          }

          // ---- **양성 채널**(리뷰어 [6] · #30): `committed_drift = 0`이 되살릴 수 있는 검사인가.
          // 기준 팔은 승격이 기존 기하를 **안 쓰므로** 0이 자명해 보인다. 덮어쓰기를 켠 팔을
          // 돌려 **0이 아닌 값**을 본다 — 안 움직이면 그 지표는 측정이 아니라 항등이다(#5).
          if (name === "base" && first.placed.size) {
            const overwritten = new Map(first.placed);
            for (const [id, sg] of first.placed) {
              overwritten.set(id, { a: mul3(sg.a, 1.01), b: mul3(sg.b, 1.01) });
            }
            driftPositive.push(committedDrift(first.placed, overwritten));
          }
        }
      }
    }

    // ---- 사전 등록한 채택 규칙(#26). **측정 전에 박았다.**
    // **두 기전 중 실제로 회수하는 쪽으로 판정한다** — 등록 규칙의 "(배치 + 회수)"는
    // 회수 기전을 지정하지 않았고, 일괄 재풀이는 0을 회수한다
    const rate = (b: Bag) =>
      (b.cw20 + b.aw20) / Math.max(1, b.errConfirmed.length + b.errRecoveredA.length);
    const total = (b: Bag) => b.confirmed + b.recoveredA;
    const verdict = total(arms.tighten) >= total(arms.base) && rate(arms.tighten) < rate(arms.base)
      ? "D-L18 채택 — 조이기가 (배치+회수)를 안 잃으면서 조용히 틀림을 낮춘다"
      : "**D-L18 기각** — 조이기가 등록한 두 조건을 함께 만족하지 못한다";

    const doc = {
      what: "L-B.7 — 승격 연쇄가 미배치를 실제로 회수하는가, 그리고 회수된 것이 맞는가",
      why: "계획서 §9.1의 '미배치는 실패가 아니라 대기 상태다'가 **이 구현에서 참인지**가 "
        + "여기서 갈린다. 그리고 **D-L18**(축 판정 임계를 조이는 쪽)이 이 회수율에 달려 있다.",
      method: {
        promote: "**같은 `liftAll`을 재사용한다**(§9.1이 그렇게 적었다) — 대기 획과 확정 획을 "
          + "함께 풀고, 확정 획들이 정해 주는 배율로 새로 놓인 것만 채택한다. "
          + "**확정 성분과 이어진 것만** 올린다(떨어진 덩어리는 배율이 안 전달된다).",
        not_a_recompute: "**기존 기하는 안 움직인다.** 다시 푼 값으로 덮지 않는다 — 그것은 승격이 "
          + "아니라 재계산이고 차수 승격(§6.1)의 일이다. `committed_drift`가 그것을 잠근다.",
        warning: "⚠ **#16** — 회수율이 높아도 **회수된 것이 조용히 틀리면 아무것도 안 고친 것**이다. "
          + "⚠ **#3** — 다시 풀면 일부가 놓이는 것은 거의 정의상 참이다. 재는 것은 **얼마나, 맞게**다.",
      },
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name), grades: GRADES, seeds: SEEDS,
        end_jitters: JITTERS, skew: 0.12, canvas_px: SZ,
        camera: "**참 카메라**. 검출·조정은 여기서 안 잰다.",
        arms: ARMS,
        same_as_axis_live: "구도·시드 산식·skew·잡음 축이 `axis_live.json`·`lift_grade.json`과 "
          + "같다 — 아니면 D-L18을 가르는 것이 아니다(#27).",
        // **앵커 팔의 조건을 적는다**(리뷰어 [12]) — 없으면 다른 원장의 앵커 수치와 나란히 못 읽는다
        anchor_arm: {
          snap_target: "**확정된 3D 기하**(`first.placed`) — 오차가 있는 것이다. "
            + "`snap.json`·`axis_live.json`은 **참 3D**를 스냅 대상으로 썼다. "
            + "그래서 이 원장의 앵커 수치를 그 둘과 직접 비교하지 않는다(#27).",
          axis_deg: LIVE_TOL.axis_deg,
          snap_radius_ratio: SNAP_TOL.radius_ratio,
          chain: `더 안 늘 때까지 반복하되 상한 ${CHAIN_MAX_ROUNDS}회. 도달 횟수를 원장에 적는다.`,
        },
        metric_gauge: "형태 오차는 `metrics.ts` 하나에서 온다. **확정 집합이 게이지를 정하고 "
          + "회수 획은 그 게이지로 잰다** — 회수 획만 다시 적합하면 '이미 확정된 틀에 붙는다'는 "
          + "성질이 지워진다. 초판의 `segErr`(게이지 1)가 같은 2416획을 0.1533으로 냈고 "
          + "`axis_live.json`은 0.1222였다(리뷰어 [1]).",
      },
      registered_rule: {
        rule: "**조이기가 옳으려면** (배치 + 회수)가 기준 이상이면서 **조용히 틀림(cut 0.2)이 "
          + "낮아야** 한다. 둘 중 하나라도 안 되면 D-L18은 기각이다.",
        base_total: `${total(arms.base)}`, tighten_total: `${total(arms.tighten)}`,
        base_silent_0_2: round(rate(arms.base), 4), tighten_silent_0_2: round(rate(arms.tighten), 4),
        verdict,
      },
      control_resolve_without_promotion: {
        note: "**승격 없이** 미배치 집합만 다시 푼다(#6). 같은 입력을 같은 솔버에 다시 넣는 "
          + "것이므로 **새로 놓이는 것이 거의 없어야** 한다 — 있다면 승격의 이득 중 그만큼은 "
          + "'기존 기하와 함께 푸는 것'이 아니라 **'분모가 줄어든 것'**에서 온다.",
        newly_placed_over_pending: `${control.extra}/${control.tried}`,
        rate: round(control.extra / Math.max(1, control.tried), 4),
        // **논증이 아니라 측정으로 처분한다**(리뷰어 [5] · #7). "배율이 정해지지 않는다"를
        // 두 게이지로 가른다: 확정 집합의 게이지(승격이 쓰는 것) 대 자기 게이지(공짜 배율)
        measured_not_argued: {
          note: "확정 게이지로 재면 **배율이 안 맞아 크게 틀리고**, 자기 게이지로 재면 "
            + "형태만 남는다. 둘의 격차가 곧 '배율이 정해지지 않는다'의 크기다.",
          shape_err_committed_gauge: stat(control.errFixed),
          shape_err_self_gauge: stat(control.errSelf),
          silent_wrong_0_2: { committed_gauge: `${control.fw20}/${control.errFixed.length}`,
                              self_gauge: `${control.sw20}/${control.errSelf.length}` },
        },
      },
      // **양성 채널**(리뷰어 [6] · #30) — `committed_drift = 0`이 항등이 아님을 보인다
      committed_drift_positive_channel: {
        note: "기준 팔의 `committed_drift`는 전부 0이고 selfcheck가 '분포 전체가 0'으로 "
          + "플래그한다. **원인 확인**: 확정 기하를 1.01배로 덮어쓴 반례 팔을 같은 함수에 넣으면 "
          + "0이 아니다 — 즉 이 지표는 **되살릴 수 있는 검사**이지 설계 보장이 아니다(#5의 판별법). "
          + "덮어쓰기를 켜면 값이 움직이므로 '측정이 안 도는 것'과 구분된다.",
        overwritten_arm_drift: stat(driftPositive, 6),
        base_arm_drift_is_zero: true,
      },
      conclusion: {
        batch_was_never_executed: "**초판의 '일괄 기전이 아무것도 회수하지 못한다'는 측정이 "
          + "아니었다**(PITFALLS #32). 대기 "
          + `${arms.base.pendingN}가 거름에서 전부 걸려 **솔버에 한 획도 안 닿았다** — `
          + "입력이 0인 실행의 결과는 기전에 대한 정보가 0이다. "
          + "`축이 미분류다`는 **판정기의 결과이지 획의 성질이 아니다.**",
        batch_works_when_given_axes: "**축을 주면 일괄 기전이 실행되고 크게 회수한다.** "
          + `오라클 축에서 입력 ${arms.base.batchOracleIn} · 솔버가 놓은 것 `
          + `**${arms.base.batchOracleSolved}** · 채택 **${arms.base.batchOracle}** `
          + `(= ${round(arms.base.batchOracle / Math.max(1, arms.base.batchOracleIn), 4)})다. `
          + "즉 **§9.1의 일괄 기전은 반증되지 않았다** — 막고 있던 것은 **축 판정**이고, "
          + "그것이 L-B.3(a)·L-B.4가 지배항으로 지목한 바로 그것이다. "
          + "⚠ **앵커 720과 직접 견주지 않는다**(리뷰어 [4]) — 그 720은 실제 축 라벨이라 "
          + "기전 차이와 축 정보 차이가 섞인다. **축을 맞춘 대조군**은 앵커 "
          + `**${arms.base.anchorOracle}/${arms.base.pendingN}**이고, 그것과 견주면 일괄이 `
          + `${round(arms.base.batchOracle / Math.max(1, arms.base.anchorOracle), 2)}배 많다. `
          + `나머지(${arms.base.anchorOracle} 대 ${arms.base.recoveredA})가 **축 정보의 몫**이다. `
          + "⚠ **오라클은 상한이다.** 실제 축 라벨(연쇄가 붙인 것)로는 "
          + `${arms.base.batchAfter}/${arms.base.batchAfterIn}밖에 안 된다.`,
        batch_places_more_and_worse: "⚠ **개수만 읽으면 반대로 간다**(#15·#16 — 이 항목이 "
          + "착수에 등록한 번호다). 오라클 일괄이 회수한 "
          + `${arms.base.batchOracle}의 조용히 틀림이 cut 0.2에서 `
          + `**${arms.base.ow20}/${arms.base.errBatchOracle.length} = `
          + `${round(arms.base.ow20 / Math.max(1, arms.base.errBatchOracle.length), 3)}**로 `
          + `축을 맞춘 앵커(${arms.base.aow20}/${arms.base.errAnchorOracle.length} = `
          + `${round(arms.base.aow20 / Math.max(1, arms.base.errAnchorOracle.length), 3)})보다도, `
          + `확정(${arms.base.cw20}/${arms.base.errConfirmed.length} = `
          + `${round(arms.base.cw20 / Math.max(1, arms.base.errConfirmed.length), 3)})보다도 **나쁘다.** `
          + "⚠ **추정기를 맞춰도 유지된다**(2회차 리뷰어 [1]): 셋을 **전부 자기 게이지**로 재면 "
          + `일괄 ${arms.base.errBatchOracleSelf.filter(e => e > 0.2).length}/`
          + `${arms.base.errBatchOracleSelf.length} = `
          + `${round(arms.base.errBatchOracleSelf.filter(e => e > 0.2).length / Math.max(1, arms.base.errBatchOracleSelf.length), 3)} · `
          + `앵커 ${arms.base.errAnchorOracleSelf.filter(e => e > 0.2).length}/`
          + `${arms.base.errAnchorOracleSelf.length} = `
          + `${round(arms.base.errAnchorOracleSelf.filter(e => e > 0.2).length / Math.max(1, arms.base.errAnchorOracleSelf.length), 3)} · `
          + `확정 ${round(arms.base.cw20 / Math.max(1, arms.base.errConfirmed.length), 3)}다. `
          + "즉 정확히 적으면 **\"축을 주면 더 많이, 더 틀리게 놓는다\"**이고, "
          + "⚠ **축을 맞춘 앵커는 오히려 확정보다 낫다**(자기 게이지에서) — 초판은 그것을 "
          + "\"확정보다도 나쁘다\"로 적었고 그것은 **고정 게이지와 fit을 견준 결과**였다. "
          + "§9.1이 살아난 것은 **개수 기전으로서**이지 품질 기전으로서가 아니다.",
        anchor_recovers: "**지금 실제로 회수하는 것은 앵커다** — 대기 획의 시작점이 확정된 기하에 "
          + `붙으면 §3·§7의 실시간 경로가 그 획을 놓는다. 기준 조건 1회차 `
          + `**${arms.base.recoveredA}/${arms.base.pendingN}**. `
          + "즉 **승격은 '다시 푸는 것'이 아니라 '앵커가 생기는 것'이다**(D-L20).",
        chain_happens: "**연쇄가 실제로 일어난다**(리뷰어 [4]). 2회차 이후 추가 회수 "
          + `**${arms.base.chainExtra}**이고 회차별로 `
          + `${JSON.stringify(arms.base.chainByRound)}다. 상한 ${CHAIN_MAX_ROUNDS}회에 `
          + `도달한 장면은 ${arms.base.chainRounds.filter(r => r >= CHAIN_MAX_ROUNDS).length}개다 — `
          + "**이 픽스처에서 수렴한다**(장면당 12획이라 깊이 4는 그래프가 정하는 상한에 가깝다). "
          + "⚠ **구도로 가르면 3점 구도의 현상이다**(2회차 리뷰어 [14]): "
          + `${Object.entries(arms.base.chainByComp).map(([k, v]) => `${k} ${v}`).join(" · ")}로 `
          + "**1점 구도는 0이다.** '승격은 연쇄한다'를 구도와 무관하게 적지 않는다. "
          + "게이트 3번의 원장 측 증거가 이것이고 브라우저 확인은 L-B.8 뒤에 한다.",
        but_quality_does_not_improve: (() => {
          const B = arms.base;
          const g = (w: number, n: number) => round(w / Math.max(1, n), 4);
          const ratios = Object.values(B.seedRows)
            .map(r => (r.asw20 / Math.max(1, r.asErrN)) / Math.max(1e-9, r.cw20 / Math.max(1, r.cErrN)))
            .sort((x, y) => x - y);
          const fixedRatios = Object.values(B.seedRows)
            .map(r => (r.aw20 / Math.max(1, r.aErrN)) / Math.max(1e-9, r.cw20 / Math.max(1, r.cErrN)))
            .sort((x, y) => x - y);
          return "**승격이 더 내는 오차는 형태가 아니라 배율이다.** 회수 720을 확정 집합의 게이지로 "
            + `재면 cut 0.2 **${B.aw20}/${B.errRecoveredA.length} = ${g(B.aw20, B.errRecoveredA.length)}**이고 `
            + `확정은 **${B.cw20}/${B.errConfirmed.length} = ${g(B.cw20, B.errConfirmed.length)}**다 — `
            + `배수 ${round(fixedRatios[0], 2)}~${round(fixedRatios[fixedRatios.length - 1], 2)}(시드 6, 전부 1보다 크다). `
            + "**이 격차는 실재한다.** "
            + `그런데 같은 720획을 **자기 게이지**로 재면 ${B.asw20}/${B.errRecoveredASelf.length} = `
            + `${g(B.asw20, B.errRecoveredASelf.length)}이고 배수가 `
            + `**${round(ratios[0], 2)}~${round(ratios[ratios.length - 1], 2)}로 1을 가로지른다** — `
            + "**시드 폭 안이므로 그 결론은 없다**(#14). 즉 **형태만 보면 회수와 확정이 구분되지 않고, "
            + "차이는 전부 확정된 틀과 배율이 안 맞는 데서 온다.** 앱이 회수 획에 배율을 다시 안 맞추므로 "
            + "**그 배율 어긋남이 사용자가 보는 오차다.** "
            + "⚠ **다만 꼬리는 자기 게이지에서도 나쁘다**(#8): p90이 "
            + `**${stat(B.errRecoveredASelf).p90} 대 ${stat(B.errConfirmed).p90}**(≈2배)이고 중앙은 `
            + `${stat(B.errRecoveredASelf).median} 대 ${stat(B.errConfirmed).median}다. `
            + "**cut 0.2 비율 · 중앙 · p90의 배수가 서로 다르므로 '격차 N배'를 한 수로 적지 않는다.** "
            + "⚠ **이 항목은 두 번 고쳤다.** 초판 '같다'(게이지 없음) → '1.5배 나쁘다'(고정 게이지) → "
            + "**'배율 몫은 실재하고 형태 몫은 시드 폭 안'**(추정기 대조 + 시드 폭). "
            + "**같은 추정기로 재고 시드 폭을 보기 전까지 배수를 인용하지 않는다.**";
        })(),
        quality_collapses_in_low_order_compositions: "⚠ **구도로 가르면 결론이 갈린다**(리뷰어 [2] · #9). "
          + "기준 팔 앵커 회수의 조용히 틀림(cut 0.2)이 구도별로 "
          + `${Object.entries(byComp).map(([k, v]) => `${k} ${v.w20}/${v.errN}`).join(" · ")}이고, `
          + "**같은 층의 확정**은 "
          + `${Object.entries(arms.base.confirmByComp).map(([k, v]) => `${k} ${v.w20}/${v.n}`).join(" · ")}다`
          + "(2회차 리뷰어 [7] — 층을 맞춰야 배수가 층 효과와 안 섞인다). "
          + "**1점 구도는 확정도 0.635로 나쁜데 회수는 0.968이다.** 자유도가 가장 적은 구도이고, "
          + "승격이 가장 위험한 자리가 바로 거기다. **'미배치는 대기다'를 구도와 무관하게 적지 않는다.**",
        why_not_recovered: "**추측하지 말고 센다**(#7). 기준 조건 앵커 팔의 거부 사유는 "
          + `${JSON.stringify(arms.base.reasonsA)}다 — 대기 획의 시작점이 **확정된 기하 근처에 `
          + "아예 없다**는 것이 지배항이다. 그럴 수밖에 없다: 그 획들이 대기인 이유가 바로 안 "
          + "이어졌기 때문이다. ⚠ **거부 사유가 둘뿐이라 '축이 정해지면 반드시 놓인다'가 "
          + "구성상 항등이다**(리뷰어 [13]) — 앵커 회수율은 '축 판정 + 스냅의 통과율'이지 "
          + "'배치가 맞는가'가 아니다. 맞는가는 위의 조용히 틀림이 답한다.",
        recovery_rate_is_not_one_number: "⚠ **37.8%는 1회차·합산 한 점이고 조건을 가르면 "
          + "안 유지된다**(리뷰어 [11] · #12). 등급으로는 "
          + `${Object.entries(byGrade).map(([k, v]) => `${k} ${v.anchor}/${v.pending}`).join(" · ")}로 `
          + "비슷한데, **끝점 잡음**으로는 "
          + `${Object.entries(byJit).sort().map(([k, v]) => `${k} ${v.anchor}/${v.pending}`).join(" · ")}, `
          + "**구도**로는 "
          + `${Object.entries(byComp).map(([k, v]) => `${k} ${v.anchor}/${v.pending}`).join(" · ")}로 `
          + "벌어진다. **구도 축이 잡음 축에 버금간다**(리뷰어 [2]). "
          + "⚠ **연쇄를 넣으면 배율이 달라진다**(리뷰어 [6]) — 잡음축은 1회차 기준 "
          + `${round((byJit["jit_0"].anchor / byJit["jit_0"].pending)
                   / (byJit["jit_0.05"].anchor / byJit["jit_0.05"].pending), 2)}배인데 `
          + "연쇄 포함이면 "
          + `${round(((byJit["jit_0"].anchor + byJit["jit_0"].chain) / byJit["jit_0"].pending)
                   / ((byJit["jit_0.05"].anchor + byJit["jit_0.05"].chain) / byJit["jit_0.05"].pending), 2)}배다. `
          + "실획이 어느 대역인지는 표본이 0이다(AS-C1) — **회수율을 한 값으로 인용하지 않는다.**",
        recovery_rate_depends_on_the_operating_point: "⚠ **37.8%는 두 상수의 통과율이다**"
          + "(리뷰어 [5] · #12). 거부 사유가 `angle_over`·`no_snap` 둘뿐이므로 회수율은 "
          + `\`axis_deg\`·\`radius_ratio\`가 정한다. 스윕: `
          + `${Object.entries(arms.base.opSweep).map(([k, c]) =>
               `${k} ${c.got}/${c.pending}(틀림 ${round(c.w20 / Math.max(1, c.errN), 3)})`).join(" · ")}. `
          + "**개수와 조용히 틀림이 여기서도 단조로 맞바뀐다.** "
          + "⚠ **강건성은 오라클 축 스윕으로 본다**(2회차 리뷰어 [2]) — 실 라벨 스윕을 "
          + "오라클 일괄과 견주면 [4]가 막 제거한 **축 정보 교란이 되살아난다.** "
          + `축을 맞춘 스윕: ${Object.entries(arms.base.opSweepOracle).map(([k, c]) =>
               `${k} ${c.got}/${c.pending}`).join(" · ")}. `
          + `가장 헐거운 점도 ${Math.max(...Object.values(arms.base.opSweepOracle).map(c => c.got))}로 `
          + `오라클 일괄 ${arms.base.batchOracle}에 못 미친다 — **판정이 동작점을 바꿔도 유지된다.** `
          + "⚠ 오라클 축에서는 `axis_deg`가 **아무 효과가 없다**(각도 시험을 건너뛰기 때문이다) — "
          + "그래서 그 스윕이 실제로 흔드는 것은 **스냅 반경 하나**다.",
        d_l18: "**D-L18 기각**(등록 규칙대로, D-L21 유지). 조이기는 (배치 + 회수)가 "
          + `${total(arms.tighten)}으로 기준 ${total(arms.base)}보다 **작고**, 회수율이 두 팔에서 `
          + `${round(arms.tighten.recoveredA / Math.max(1, arms.tighten.pendingN), 3)} 대 `
          + `${round(arms.base.recoveredA / Math.max(1, arms.base.pendingN), 3)}로 비슷해 차이를 못 메운다. `
          + "⚠ **초판의 서술을 고친다**(리뷰어 [10]): 등록 규칙은 '개수 우선'이 아니라 "
          + "**두 조건의 연언**(개수 ≥ 기준 **그리고** 조용히 틀림 < 기준)이었다. 단조 맞바꿈 아래서 "
          + "그것을 통과하려면 회수가 그 단조성을 깨야 했고 안 깼다 — **충족 가능하되 좁은 규칙**이었다. "
          + `다만 조이기는 조용히 틀림을 ${round(rate(arms.base), 4)} → ${round(rate(arms.tighten), 4)}로 `
          + "낮추므로 품질 우선 목적함수에서는 여전히 이긴다. **규칙을 사후에 바꾸지 않는다**(#28).",
      },
      by_arm: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, rep(v)])),
      // **합산 한 점으로 적지 않는다**(리뷰어 [11] · #12) — 기준 팔을 등급·잡음·구도로 가른다
      base_by_grade: Object.fromEntries(Object.entries(byGrade).map(([k, v]) => [k, celluleRep(v)])),
      base_by_end_jitter: Object.fromEntries(Object.entries(byJit).map(([k, v]) => [k, celluleRep(v)])),
      base_by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) => [k, celluleRep(v)])),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "promote.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식
    // **승격은 기존 기하를 안 움직인다** — 되살릴 수 있는 검사다(덮어쓰면 0이 아니게 된다)
    for (const b of Object.values(arms)) expect(Math.max(0, ...b.drift)).toBe(0);
    // **양성 채널**(리뷰어 [6] · #30) — 덮어쓰면 그 0이 실제로 깨져야 한다.
    // 안 깨지면 `committedDrift`는 측정이 아니라 항등이고 게이트로 쓸 수 없다(#5)
    expect(driftPositive.length).toBeGreaterThan(0);
    expect(Math.min(...driftPositive)).toBeGreaterThan(0);
    // **연쇄가 실제로 있다**(리뷰어 [4]) — 2회차 이후 회수가 0이면 "연쇄한다"를 못 적는다
    expect(arms.base.chainExtra).toBeGreaterThan(0);
    expect(arms.base.chainByRound[2]).toBeGreaterThan(0);
    // **일괄 기전은 축을 주면 실행된다**(리뷰어 [2][3] · #32) — 초판의 0은 미실행이었다
    expect(arms.base.batchOracleSolved).toBeGreaterThan(0);
    // 기준 조합이 `axis_live`의 확정 배치를 재현하는가 — 아니면 다른 것을 재고 있다
    expect(arms.base.total).toBe(GRADES.length * COMPOSITIONS.length * SEEDS.length * JITTERS.length * 12);
    expect(arms.base.confirmed).toBe(2416);
    // **양성 채널**(#30) — 조이면 확정 배치가 실제로 줄어야 한다
    expect(arms.tighten.confirmed).toBeLessThan(arms.base.confirmed);
    expect(arms.loosen.confirmed).toBeGreaterThan(arms.base.confirmed);
  }, 300_000);
});
