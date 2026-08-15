// L-B.4 **축 판정과 실시간 색** — 산출: `stage0/out/axis_live.json`. 계획서 §4.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-B.4 절에 적었다.
//
// **#16이 이 항목의 전부다.** L-B.3(a)가 "축을 오라클로 주면 배치가 0.44 → 0.82"를 냈지만
// **같은 팔에서 조용히 틀림이 39%**다. 임계를 풀어 배치를 늘리면 조용히 틀림이 함께 는다 —
// **배치율만 보면 반대로 간다.** 그래서 채택 규칙을 측정 전에 박았다(`progress.md`):
// **조용히 틀림(cut 0.2)이 기준보다 늘지 않는 선에서** 배치율이 최대인 임계.
//
// ---------------------------------------------------------------- 두 판정은 다른 것이다
//
// ```
// ① 확정 시점  classifyStroke  — 앵커가 없다. 획의 대표 직선이 소실점을 지나는가(점-직선 거리)
// ② 실시간     nearestAxisOnScreen — 앵커가 3D에 있다. **앵커에서 본 축의 화면 방향**과 비교
// ```
//
// ②가 가능한 이유는 시작점이 못박혀 있기 때문이고, 그것이 §3의 마지막 문단이다.
// **두 판정을 한 표에 섞지 않는다**(#27) — 입력이 다르고 실패 방식이 다르다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { classifyStroke, AXIS_TOL, type Axis, type AxisCfg } from "../src/s3d/axis.js";
import { snapCandidates, staticCandidates, SNAP_TOL,
         type SnapSeg, type SnapCtx, type StaticCand } from "../src/s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "../src/s3d/liveLine.js";
import { norm3, sub3, unit3, axisDirection, type Vec3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { perStrokeError, segShapeError, metricsSnapshot } from "./metrics.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** **등록 5구도 그대로**(`lift_grade`·`stage_cam`과 같은 집합). */
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
/** 사전 등록한 스윕(#12·#13). 기본값은 각각 0.06 / 0.18 / 1.5다. */
const VP_DIST = [0.03, 0.06, 0.10, 0.16, 0.22];
const BEND = [0.12, 0.18, 0.30];
const AMBIG = [1.2, 1.5, 2.0];
/** 실시간 판정 각차. 기본값은 `LIVE_TOL.axis_deg` = 12다. */
const LIVE_DEGS = [4, 8, 12, 18, 25, 35];
/**
 * **방향 급변 검출** 스윕. 기본값은 45° / 0.12다.
 *
 * 왜 따로 스윕하는가: 기본 조건의 `free` 사유에서 **`coarse`만 `multi_axis` 254**다
 * (medium 50 · precise 0). 거친 잉크의 떨림이 **없는 코너를 만들어 내는 것**이고,
 * 그것이 `coarse` 배치가 무너지는 등급 특이 항이다.
 */
const TURN_DEG = [30, 45, 60, 90];
const TURN_WIN = [0.08, 0.12, 0.20];

/**
 * `boxEdges`의 인접 모서리 쌍(꼭짓점을 공유하고 **축이 다른** 것). 대조군이 이것을 잇는다.
 * 인덱스는 `scene3d.boxEdges`의 반환 순서다.
 */
const CORNER_PAIRS: [number, number][] = [[0, 1], [0, 2], [1, 2], [3, 4], [5, 8], [6, 9]];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));
const trueAxis = (sc: Scene, a: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[a], SZ) ? a : "screen");

interface Fx {
  sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; endPts: Pt2[]; diag: number;
}

function fixture(ci: number, grade: InkGrade, seed: number, jit: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  // **`lift_grade`·`stage_cam`과 같은 시드 산식·같은 skew**(#27)
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q of pts) diag = Math.max(diag, norm3(sub3(p, q)));
  return {
    sc, edges, diag,
    strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })),
    endPts: drawn.map(d => d.pts2d[d.pts2d.length - 1] as Pt2),
  };
}

interface Bag {
  n: number; placed: number; total: number;
  axOk: number; axWrong: number; axFree: number;
  reasons: Record<string, number>;
  err: number[]; w10: number; w20: number; w50: number;
}
const bag = (): Bag => ({ n: 0, placed: 0, total: 0, axOk: 0, axWrong: 0, axFree: 0,
                          reasons: {}, err: [], w10: 0, w20: 0, w50: 0 });
const rep = (b: Bag) => ({
  // **모집단 분모**(#11) — 최대 연결 성분 분모는 공짜로 통과시킨다(L-A.4)
  placed_over_all: `${b.placed}/${b.total}`,
  placed_rate: round(b.placed / Math.max(1, b.total), 4),
  axis: { correct: `${b.axOk}/${b.total}`, wrong: `${b.axWrong}/${b.total}`,
          free: `${b.axFree}/${b.total}` },
  free_reasons: b.reasons,
  shape_err: stat(b.err),
  // **절단을 하나 고르지 않는다**(#13). 분모는 **놓인 것**이다
  silent_wrong: { cut_0_1: `${b.w10}/${b.placed}`, cut_0_2: `${b.w20}/${b.placed}`,
                  cut_0_5: `${b.w50}/${b.placed}` },
  silent_wrong_rate_0_2: round(b.w20 / Math.max(1, b.placed), 4),
});

const baseKeyOf = () => `vp${AXIS_TOL.vp_dist_ratio}_bend${AXIS_TOL.bend_max}`
                      + `_amb${AXIS_TOL.ambiguity_margin}`;

/**
 * **절단 격자**(사람 지시 — 0.2/0.35/0.5/0.7). 앞뒤를 넓혀 **교차점을 안에 가둔다** —
 * 지시한 넷만 재면 교차가 격자 밖에 있을 때 그 사실을 못 본다(#12).
 */
const CUT_GRID = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 1.0];

/**
 * 절단 곡선 한 줄. **배치율과 조용히 틀림을 함께** 낸다 —
 * 조용히 틀림만 보면 "아무것도 안 놓는" 설정이 이긴다(#15).
 */
const curveRow = (errs: number[], total: number) => ({
  placed_over_all: `${errs.length}/${total}`,
  placed_rate: round(errs.length / Math.max(1, total), 4),
  by_cut: Object.fromEntries(CUT_GRID.map(c => {
    const k = errs.filter(e => e > c).length;
    return [`cut_${String(c).replace(".", "_")}`, {
      silent_wrong: `${k}/${errs.length}`,
      rate: round(k / Math.max(1, errs.length), 4),
      // **놓인 것 중 맞은 것**을 전체 분모로도 낸다 — 배치율과 정확도를 한 수로 묶는다.
      // 이것이 없으면 "덜 놓아서 이긴" 설정과 "잘 놓아서 이긴" 설정이 안 갈린다
      right_over_all: round((errs.length - k) / Math.max(1, total), 4),
      // ⚠ **틀린 개수도 전체 분모로 낸다**(리뷰어 [2] · #15). `right_over_all`만 내면
      // "맞은 것"에만 교차가 없다는 것을 "교차가 없다"로 읽게 된다 — **틀린 개수는 교차한다.**
      wrong_over_all: round(k / Math.max(1, total), 4),
      wrong_count: k,
    }];
  })),
  // **꼬리를 함께 낸다**(#8 · 리뷰어 [10]) — cut 카운트만 내면 p90·max가 사라진다
  shape_err: stat(errs),
});

/**
 * **비용비 λ로 본 판정**(리뷰어 [3] · #26·#28).
 *
 * `right_over_all`은 **미배치와 조용히 틀림에 똑같이 0점**을 준다(λ = 1). 그런데 이 프로젝트의
 * 정책은 그 둘을 등가로 안 본다 — **미배치의 비용은 미뤄지는 것이고 조용히 틀림은 영구다**
 * (`policy_objective`). 그러므로 λ를 **하나로 고정하면 그 결론은 정의의 귀결**이다.
 *
 * 점수 = (맞게 놓인 수 − λ × 조용히 틀린 수) / 전체. λ를 흔들어 **부호가 바뀌는 지점**을 낸다.
 */
const LAMBDAS = [1, 2, 3, 5, 10];
const lambdaTable = (a: number[], na: number, b: number[], nb: number) =>
  Object.fromEntries(CUT_GRID.map(c => {
    const ka = a.filter(e => e > c).length, kb = b.filter(e => e > c).length;
    return [`cut_${String(c).replace(".", "_")}`, Object.fromEntries(LAMBDAS.map(L => {
      const sa = (a.length - ka - L * ka) / Math.max(1, na);
      const sb = (b.length - kb - L * kb) / Math.max(1, nb);
      return [`lambda_${L}`, { live: round(sa, 4), confirm: round(sb, 4), live_wins: sa > sb }];
    }))];
  }));

/**
 * **교차점** — 두 팔의 조용히 틀림 비율이 뒤집히는 절단.
 * 격자 사이면 선형 보간으로 하나 낸다. 안 뒤집히면 `null`이고 **그것도 결과다.**
 */
function crossing(a: number[], b: number[]): { cut: number | null; note: string } {
  const rate = (xs: number[], c: number) => xs.filter(e => e > c).length / Math.max(1, xs.length);
  const fine: number[] = [];
  for (let c = 0.05; c <= 1.0001; c += 0.005) fine.push(+c.toFixed(3));
  let prev: number | null = null;
  for (const c of fine) {
    const d = rate(a, c) - rate(b, c);
    if (prev != null && Math.sign(d) !== Math.sign(prev) && Math.sign(d) !== 0) {
      return { cut: c, note: `절단 ${c}에서 부호가 바뀐다(격자 0.005)` };
    }
    if (d !== 0) prev = d;
  }
  return { cut: null, note: "절단 0.05~1.0 전체에서 부호가 안 바뀐다 — **교차가 없다**" };
}

describe("L-B.4 — 축 판정 임계와 실시간 판정", () => {
  it("측정을 원장에 남긴다", () => {
    /** ① 확정 시점: 임계 조합 → 집계. */
    const confirm: Record<string, Bag> = {};
    /** 기준 조건에서의 `free` 사유 — **533이 무엇인지 센다**(#7). */
    const reasonsByGrade: Record<string, Record<string, number>> = {};
    /** ② 실시간: 각차 → 집계. */
    const liveByDeg: Record<string, Bag> = {};
    /**
     * **절단 곡선**(사람 지시). 절단을 **단일 동작점으로 두지 않는다**(#13·#12).
     * 앵커 유무 × 절단에서 **배치율과 조용히 틀림을 함께** 보고 **교차점을 특정한다.**
     *
     * ⚠ **두 팔의 추정기가 다르다** — 확정은 적합 게이지(`liftAll`이 배율 자유도를 남긴다),
     * 실시간은 게이지 1(앵커가 참 기하 위에 있어 배율 자유도가 없다). 확정 쪽이
     * **더 관대한 추정기**이므로 "실시간이 낫다"는 방향의 결론은 **보수적**이고,
     * "확정이 낫다"는 방향의 결론은 **그만큼 할인해서 읽는다.**
     */
    const curve = { confirm: [] as number[], live: [] as number[] };
    /**
     * ⚠ **`end_jitter = 0`을 뺀 판**(리뷰어 [1] · #2·#9). 잡음 0에서는 잉크 끝점이 참 모서리에
     * **못으로 박혀** 오차가 정확히 0인 획이 생긴다 — `snap.json`이 그 서명을
     * "`shape_err.p10 = 0`"이라고 규정해 놓았고 L-B.3 2회차가 이미 한 번 고친 결함이다.
     * **앵커 팔에만 못이 들어오고 확정 팔에는 안 들어온다**(확정은 솔버를 거치므로 0이 안 된다) —
     * 그래서 그대로 나란히 놓으면 앵커가 공짜로 이긴다.
     */
    const curveJ = { confirm: [] as number[], live: [] as number[] };
    const curveNJ = { confirm: 0, live: 0 };
    /**
     * **시드별 λ 점수**(#14 — 여유가 시드 폭보다 작으면 그 결론은 없다).
     *
     * L-C.2 리뷰어 [2]가 짚었다: D-L25가 이 표의 λ=3·절단 0.5 한 칸(여유 **0.0025**)을
     * 근거로 인용했는데 **그 폭을 안 쟀다.** 같은 원장이 배치 시드 폭을 31로 실측해 두고도
     * 그랬다. 여기서 잰다 — 폭이 여유보다 크면 **그 칸은 근거가 못 된다.**
     */
    const curveJSeed: Record<string, { confirm: number[]; live: number[];
                                       nc: number; nl: number }> = {};
    /** 각 팔의 **분모** — 배치율을 내려면 놓인 것뿐 아니라 전체가 필요하다(#11). */
    const curveN = { confirm: 0, live: 0 };
    const curveByGrade: Record<string, { confirm: number[]; live: number[] }> = {};
    const curveNByGrade: Record<string, { confirm: number; live: number }> = {};
    /** 실시간 판정의 **각차 분포** — 임계를 어디 두어야 하는지 이것이 말한다. */
    const liveDeg: number[] = [];
    /** 방향 급변 검출 스윕. */
    const turn: Record<string, Bag> = {};
    /**
     * **대조군: 진짜로 꺾인 획**(#4 — 모델이 문제를 만들지 못하면 안 된다).
     *
     * 5구도 픽스처의 획은 전부 **모서리 하나**라 `multi_axis`를 풀어도 **잃을 것이 없다** —
     * 그 표만 보면 "풀면 좋다"가 나오는데 그것은 픽스처가 벌을 못 주기 때문이다.
     * 인접한 두 모서리를 **한 획으로** 이어 그려 진짜 코너를 만든다. 그 획은 **거부돼야 옳다.**
     */
    const turnControl: Record<string, { rejected: number; n: number;
                                       reasons: Record<string, number> }> = {};
    /** 기준 조건의 **시드별 배치** — "+26이 시드 변동폭 안이다"를 재려면 폭을 재야 한다(#14). */
    const bySeed: Record<string, number> = {};

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) continue;
        const ctx: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f,
                               vps: trueVps(fx.sc), imgSize: SZ };

        // ---------- ① 확정 시점 — 임계 조합
        for (const vd of VP_DIST) for (const bm of BEND) for (const am of AMBIG) {
          const key = `vp${vd}_bend${bm}_amb${am}`;
          const b = (confirm[key] ??= bag());
          const cfg: AxisCfg = { vp_dist_ratio: vd, bend_max: bm, ambiguity_margin: am };
          const input: LiftStroke[] = fx.strokes.map((s, i) => {
            const v = classifyStroke(s.pts2d, ctx.vps, SZ, cfg,
                                     { principal: ctx.principal, f: ctx.f });
            const want = trueAxis(fx.sc, fx.edges[i].axis);
            b.total += 1;
            if (v.axis === "free") {
              b.axFree += 1;
              b.reasons[v.reason] = (b.reasons[v.reason] ?? 0) + 1;
              if (vd === AXIS_TOL.vp_dist_ratio && bm === AXIS_TOL.bend_max
                  && am === AXIS_TOL.ambiguity_margin) {
                (reasonsByGrade[grade] ??= {})[v.reason] =
                  ((reasonsByGrade[grade] ??= {})[v.reason] ?? 0) + 1;
              }
            } else if (v.axis === want) b.axOk += 1;
            else b.axWrong += 1;
            return { ...s, axis: v.axis };
          });
          const r = liftAll(input, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
          b.n += 1; b.placed += r.placed.size;
          if (key === baseKeyOf()) bySeed[String(seed)] = (bySeed[String(seed)] ?? 0) + r.placed.size;
          for (const e of perStrokeError(r.placed, fx.edges, fx.diag)) {
            b.err.push(e);
            if (e > 0.1) b.w10 += 1;
            if (e > 0.2) b.w20 += 1;
            if (e > 0.5) b.w50 += 1;
            if (key === baseKeyOf()) {
              curve.confirm.push(e);
              (curveByGrade[grade] ??= { confirm: [], live: [] }).confirm.push(e);
              if (jit > 0) {
                curveJ.confirm.push(e);
                (curveJSeed[String(seed)] ??= { confirm: [], live: [], nc: 0, nl: 0 })
                  .confirm.push(e);
              }
            }
          }
          if (key === baseKeyOf()) {
            curveN.confirm += 12;
            if (jit > 0) {
              curveNJ.confirm += 12;
              (curveJSeed[String(seed)] ??= { confirm: [], live: [], nc: 0, nl: 0 }).nc += 12;
            }
            (curveNByGrade[grade] ??= { confirm: 0, live: 0 }).confirm += 12;
          }
        }

        // ---------- ①-b 방향 급변 검출 — `coarse`의 등급 특이 항
        for (const td of TURN_DEG) for (const tw of TURN_WIN) {
          const key = `turn${td}_win${tw}`;
          const b = (turn[key] ??= bag());
          const cfg: AxisCfg = { turn_deg: td, turn_window_ratio: tw };
          const input: LiftStroke[] = fx.strokes.map((s2, i) => {
            const v = classifyStroke(s2.pts2d, ctx.vps, SZ, cfg,
                                     { principal: ctx.principal, f: ctx.f });
            const want = trueAxis(fx.sc, fx.edges[i].axis);
            b.total += 1;
            if (v.axis === "free") { b.axFree += 1; b.reasons[v.reason] = (b.reasons[v.reason] ?? 0) + 1; }
            else if (v.axis === want) b.axOk += 1;
            else b.axWrong += 1;
            return { ...s2, axis: v.axis };
          });
          const r2 = liftAll(input, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
          b.n += 1; b.placed += r2.placed.size;
          for (const e of perStrokeError(r2.placed, fx.edges, fx.diag)) {
            b.err.push(e);
            if (e > 0.1) b.w10 += 1;
            if (e > 0.2) b.w20 += 1;
            if (e > 0.5) b.w50 += 1;
          }

          // **대조군**: 진짜 코너가 있는 획은 거부돼야 옳다
          const cell = (turnControl[key] ??= { rejected: 0, n: 0, reasons: {} });
          for (const [p, q] of CORNER_PAIRS) {
            const A = fx.strokes[p].pts2d, B = fx.strokes[q].pts2d;
            // 두 모서리를 잇는다. 방향이 맞도록 가까운 끝끼리 붙인다
            const d0 = Math.hypot(A[A.length - 1][0] - B[0][0], A[A.length - 1][1] - B[0][1]);
            const d1 = Math.hypot(A[A.length - 1][0] - B[B.length - 1][0],
                                  A[A.length - 1][1] - B[B.length - 1][1]);
            const joined = [...A, ...(d0 <= d1 ? B : B.slice().reverse())];
            const v = classifyStroke(joined, ctx.vps, SZ, cfg,
                                     { principal: ctx.principal, f: ctx.f });
            cell.n += 1;
            // **어느 규칙이 거부하는지 센다**(#7 — 초판은 세지 않고 "다른 규칙들"이라 지목했다)
            if (v.axis === "free") { cell.rejected += 1; cell.reasons[v.reason] = (cell.reasons[v.reason] ?? 0) + 1; }
          }
        }

        // ---------- ② 실시간 — 앵커가 3D에 있을 때
        // **기하는 참 3D로 준다**(스냅과 같은 상한 조건). 재는 것은 판정이지 기하가 아니다.
        const segs: SnapSeg[] = fx.edges.map((e, i) => ({ id: `s${i}`, a: e.a, b: e.b }));
        const sctx: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                                ground: null, from: null };
        const dirs = [0, 1, 2].map(i => {
          const v = fx.sc.vps[i as 0 | 1 | 2];
          return isFiniteVp(v, SZ) ? unit3(axisDirection(v, fx.sc.principal, fx.sc.f)) : null;
        });
        const preAll = staticCandidates(segs);
        for (let k = 0; k < fx.strokes.length; k++) {
          const self = `s${k}`;
          const targets = segs.filter((_, i) => i !== k);
          const pre = preAll.filter((c: StaticCand) => c.ofId !== self && c.ofId2 !== self);
          const cand = snapCandidates(fx.strokes[k].pts2d[0], targets, sctx, {}, pre)[0];
          const want = trueAxis(fx.sc, fx.edges[k].axis);
          const near = cand
            ? nearestAxisOnScreen(cand.at, dirs, cand.screen, fx.endPts[k],
                                  { principal: fx.sc.principal, f: fx.sc.f })
            : null;
          if (near) liveDeg.push(near.deg);
          for (const dg of LIVE_DEGS) {
            const b = (liveByDeg[String(dg)] ??= bag());
            b.total += 1;
            if (dg === LIVE_TOL.axis_deg) {
              curveN.live += 1; (curveNByGrade[grade] ??= { confirm: 0, live: 0 }).live += 1;
              if (jit > 0) {
                curveNJ.live += 1;
                (curveJSeed[String(seed)] ??= { confirm: [], live: [], nc: 0, nl: 0 }).nl += 1;
              }
            }
            if (!cand) { b.axFree += 1; b.reasons.no_snap = (b.reasons.no_snap ?? 0) + 1; continue; }
            if (!near || near.deg > dg) {
              b.axFree += 1;
              b.reasons[near ? "angle_over" : "no_axis"] =
                (b.reasons[near ? "angle_over" : "no_axis"] ?? 0) + 1;
              continue;
            }
            if (near.axis === want) b.axOk += 1; else b.axWrong += 1;
            const seg = segmentFromAnchor(cand.at, dirs[near.axis], fx.endPts[k],
                                          { principal: fx.sc.principal, f: fx.sc.f });
            if (!seg) { b.reasons.no_end = (b.reasons.no_end ?? 0) + 1; continue; }
            b.placed += 1;
            const T = fx.edges[k];
            // **정의는 `metrics.ts` 하나다.** 여기는 **게이지 1**이 옳다 — 앵커 `cand.at`이
            // **참 기하 위의 점**이므로 결과가 이미 참 좌표계에 있고 배율 자유도가 없다.
            // ⚠ 그래서 이 팔과 확정 팔(적합 게이지)은 **추정기가 다르다** — 두 수를 나란히
            // 읽을 때 그 사실을 적는다(리뷰어 [1]과 같은 형태의 함정이다).
            // ⚠ 초판은 이 자리에 `Math.max(...)/diag`를 **인라인으로** 적었다. L-B.M의
            // 전수 확인이 **복사된 함수만 찾고 인라인 식을 놓쳤다** — 그것도 정의 갈림이다.
            const e = segShapeError({ a: seg[0], b: seg[1] }, T, fx.diag, 1);
            b.err.push(e);
            if (e > 0.1) b.w10 += 1;
            if (e > 0.2) b.w20 += 1;
            if (e > 0.5) b.w50 += 1;
            if (dg === LIVE_TOL.axis_deg) {
              curve.live.push(e); (curveByGrade[grade] ??= { confirm: [], live: [] }).live.push(e);
              if (jit > 0) {
                curveJ.live.push(e);
                (curveJSeed[String(seed)] ??= { confirm: [], live: [], nc: 0, nl: 0 }).live.push(e);
              }
            }
          }
        }
      }
    }

    // ---- 사전 등록한 채택 규칙(#26·#16). **측정 전에 박았다.**
    const baseKey = baseKeyOf();
    const base = confirm[baseKey];
    const baseRate = base.w20 / Math.max(1, base.placed);
    let pick: string | null = null, pickPlaced = base.placed;
    for (const [k, b] of Object.entries(confirm)) {
      const sw = b.w20 / Math.max(1, b.placed);
      if (sw <= baseRate && b.placed > pickPlaced) { pickPlaced = b.placed; pick = k; }
    }

    // ---- **두 번째 목적함수**(리뷰어 [4]). 등록한 규칙은 "조용히 틀림 ≤ 기준 **이면서 배치 최대**"라
    // 맞바꿈이 단조인 이 표에서 **완화 방향만** 볼 수 있다. 그런데 이 프로젝트의 정책은
    // A-3·§9.1이다 — **미배치는 실패가 아니라 대기이고 승격이 연쇄한다**. 그 정책에서는
    // 미배치의 비용이 **미뤄지는** 것이고 조용히 틀림은 **영구**다. 그러면 조이는 쪽이 답일 수 있다.
    // **그래서 반대 방향도 낸다.** 규칙을 바꾼 것이 아니라 **하나 더 적는 것**이다(#28).
    let tighten: string | null = null, tightSw = base.w20 / Math.max(1, base.placed);
    for (const [k, b] of Object.entries(confirm)) {
      const sw = b.w20 / Math.max(1, b.placed);
      // 배치를 기준의 90% 이상 지키면서 조용히 틀림이 가장 낮은 조합
      if (b.placed >= 0.9 * base.placed && sw < tightSw) { tightSw = sw; tighten = k; }
    }
    const seedVals = Object.values(bySeed);

    const doc = {
      what: "L-B.4 — 축 판정 임계를 풀면 배치가 느는가, 그리고 조용히 틀림은 어떻게 되는가",
      why: "`lift_grade.json`이 **축 판정을 참 카메라 `coarse` 배치 0.44의 지배항**으로 지목했다"
        + "(미배치 사유 `축이 미분류다` 533/1440). 그러면 임계를 푸는 것이 답인가 — 그 물음이다.",
      warning: "⚠ **배치율만 보면 반대로 간다**(#16). 오라클 축 팔에서 배치가 0.82인데 "
        + "**조용히 틀림이 39%**였다. 채택 규칙을 측정 전에 박았다: **조용히 틀림(cut 0.2)이 "
        + "기준보다 늘지 않는 선에서** 배치율이 최대인 임계.",
      two_judgements: {
        note: "**확정 시점과 실시간은 다른 판정이다**(#27 — 한 표에 섞지 않는다).",
        confirm: "`classifyStroke` — 앵커가 없다. 획의 대표 직선이 소실점을 지나는가(점-직선 거리).",
        live: "`nearestAxisOnScreen` — 앵커가 3D에 있다. **앵커에서 본 축의 화면 방향**과 비교. "
          + "가능한 이유는 시작점이 스냅으로 못박혀 있기 때문이다(§3 마지막 문단).",
      },
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name), grades: GRADES, seeds: SEEDS,
        end_jitters: JITTERS, skew: 0.12, canvas_px: SZ,
        camera: "**참 카메라**. 검출·조정은 여기서 안 잰다.",
        live_geometry: "**참 3D 기하**를 대상으로 준다 — 스냅과 같은 상한 조건이다(`snap.json`).",
        sweeps: { vp_dist_ratio: VP_DIST, bend_max: BEND, ambiguity_margin: AMBIG,
                  live_axis_deg: LIVE_DEGS },
        defaults: { vp_dist_ratio: AXIS_TOL.vp_dist_ratio, bend_max: AXIS_TOL.bend_max,
                    ambiguity_margin: AXIS_TOL.ambiguity_margin,
                    live_axis_deg: LIVE_TOL.axis_deg, snap_radius_ratio: SNAP_TOL.radius_ratio },
      },
      // ---- **절단 곡선**(사람 지시). 절단을 단일 동작점으로 두지 않는다
      cut_curve: {
        note: "**앵커 유무 × 절단**에서 배치율과 조용히 틀림을 함께 본다. "
          + "`right_over_all`이 둘을 한 수로 묶은 것이다(놓였고 맞은 것 / 전체) — "
          + "조용히 틀림만 보면 **아무것도 안 놓는 설정이 이긴다**(#15).",
        estimator_warning: "⚠ **두 팔의 게이지가 다르다.** 확정은 **적합 게이지**"
          + "(`liftAll`이 배율 자유도를 남긴다), 실시간은 **게이지 1**(앵커가 참 기하 위에 있어 "
          + "배율 자유도가 없다). 확정 쪽이 더 관대한 추정기이므로 **'실시간이 낫다'는 결론은 "
          + "보수적**이고 **'확정이 낫다'는 결론은 그만큼 할인해서 읽는다.** "
          + "⚠ 초판은 실시간 팔의 오차를 **인라인 식**으로 적었다 — L-B.M의 전수 확인이 "
          + "복사된 **함수**만 찾고 인라인을 놓쳤다. 지금은 `metrics.segShapeError`를 부른다.",
        arms: {
          confirm_no_anchor: curveRow(curve.confirm, curveN.confirm),
          live_with_anchor: curveRow(curve.live, curveN.live),
        },
        crossing_overall: crossing(curve.live, curve.confirm),
        // ⚠ **못박힌 `end_jitter = 0`을 뺀 판**(리뷰어 [1] · #2·#9). **이쪽이 살아 있는 표다.**
        // 앵커 팔에만 못이 들어오고(잉크 끝점이 참 모서리에 박힌다) 확정 팔에는 안 들어온다
        arms_end_jitter_positive: {
          note: "**`end_jitter > 0`만.** `snap.json`이 규정한 서명(`shape_err.p10 = 0`)이 "
            + "앵커 팔에 있었다 — L-B.3 2회차가 이미 한 번 고친 결함이고 여기서 재발했다. "
            + "**두 팔을 나란히 읽을 때는 이 표를 쓴다.**",
          confirm_no_anchor: curveRow(curveJ.confirm, curveNJ.confirm),
          live_with_anchor: curveRow(curveJ.live, curveNJ.live),
          crossing: crossing(curveJ.live, curveJ.confirm),
          lambda_table: lambdaTable(curveJ.live, curveNJ.live, curveJ.confirm, curveNJ.confirm),
          // **D-L25가 인용한 칸의 시드 폭**(#14, L-C.2 리뷰어 [2]).
          // 여유가 폭 안이면 그 칸은 **근거가 못 된다** — 정책만 남는다
          seed_spread_at_dl25_point: (() => {
            const rows = Object.entries(curveJSeed).map(([sd, v]) => {
              const kl = v.live.filter(e => e > 0.5).length;
              const kc = v.confirm.filter(e => e > 0.5).length;
              const sl = (v.live.length - kl - 3 * kl) / Math.max(1, v.nl);
              const sc = (v.confirm.length - kc - 3 * kc) / Math.max(1, v.nc);
              return { seed: Number(sd), live: round(sl, 4), confirm: round(sc, 4),
                       margin: +(sc - sl).toFixed(4), confirm_wins: sc > sl };
            }).sort((x, y) => x.seed - y.seed);
            const ms = rows.map(r => r.margin).sort((x, y) => x - y);
            return {
              note: "**D-L25의 동작점(λ=3 · 절단 0.5)을 시드별로 다시 낸다.** "
                + "합산 여유는 confirm 0.2713 − live 0.2688 = **0.0025**이다.",
              lambda: 3, cut: 0.5, rows,
              margin_min: ms[0], margin_max: ms[ms.length - 1],
              margin_range: +(ms[ms.length - 1] - ms[0]).toFixed(4),
              all_same_sign: rows.every(r => r.confirm_wins) || rows.every(r => !r.confirm_wins),
              verdict: (rows.every(r => r.confirm_wins) || rows.every(r => !r.confirm_wins))
                ? "시드 여섯이 같은 부호다 — 이 칸에 결론이 있다"
                : "⚠ **부호가 시드마다 갈린다 — 이 칸은 D-L25의 근거가 못 된다**(#14). "
                  + "D-L25는 **정책만으로** 서고, 그 사실을 결정문에 적어야 한다",
            };
          })(),
        },
        lambda_table_all: lambdaTable(curve.live, curveN.live, curve.confirm, curveN.confirm),
        conclusion: (() => {
          const wa = (c: number) => curveJ.live.filter(x => x > c).length / Math.max(1, curveNJ.live);
          const wb = (c: number) => curveJ.confirm.filter(x => x > c).length / Math.max(1, curveNJ.confirm);
          return "⚠ **초판의 '교차는 비율에만 있고 개수에는 없다'는 틀렸다**(리뷰어 [1][2][3]). "
            + "세 가지가 겹쳐 있었다. "
            + "**① 앵커 팔 분모에 못박힌 `end_jitter = 0`이 25% 섞여 있었다** — "
            + "`shape_err.p10 = 0`이 그 서명이고 `snap.json`이 규정해 둔 것이며 L-B.3 2회차가 "
            + "이미 한 번 고쳤다. 확정 팔에는 못이 없어 **앵커가 공짜로 이겼다.** "
            + "`arms_end_jitter_positive`가 그것을 뺀 표이고 **그쪽이 살아 있다.** "
            + "**② `right_over_all`만 보면 '맞은 개수'만 보는 것**이다 — "
            + `**틀린 개수는 교차한다**: cut 0.2에서 앵커 ${round(wa(0.2), 4)} 대 확정 `
            + `${round(wb(0.2), 4)}(앵커가 낫다)인데 cut 0.5에서 ${round(wa(0.5), 4)} 대 `
            + `${round(wb(0.5), 4)}로 **앵커가 ${round(wa(0.5) / Math.max(1e-9, wb(0.5)), 1)}배 나쁘다.** `
            + "**③ `right_over_all`은 미배치와 조용히 틀림에 똑같이 0점을 준다**(λ = 1)인데 "
            + "이 프로젝트의 정책은 그 둘을 등가로 안 본다(`policy_objective`: 미배치는 유예, "
            + "조용히 틀림은 영구). `lambda_table`이 그 민감도다 — **cut 0.2에서는 λ 10까지 "
            + "앵커가 이기고, cut 0.5에서는 λ ≤ 2에서만 이긴다.** "
            + "**정확한 결론**: 작은 절단(≤ 0.35)에서는 앵커가 어떤 비용비에서도 이기고, "
            + "**큰 절단에서는 비용비가 정한다.** A-3(\"조용히 틀린 배치를 만들지 않는다\")은 "
            + "λ를 크게 보는 쪽이므로 **큰 틀림 기준으로는 앵커가 진다** — "
            + "초판의 '모든 절단에서 앵커가 이긴다'를 **철회한다.** "
            + "⚠ **등급별 분기 판정도 철회한다**(리뷰어 [4]): 앵커 팔은 **참 3D를 대상으로 준 "
            + "오라클**이라 등급 효과가 **구성상 나올 수 없다**(배치율 0.789/0.786/0.788). "
            + "등급 무관은 관측이 아니라 설계의 산물이다(#31). "
            + "⚠ **꼬리도 앵커가 나쁘다**(#8): p90 0.7268 대 0.5231 · max **13.33 대 3.35(4.0배)**.";
        })(),
      },
      free_reasons_at_default: {
        note: "**533이 무엇인지 센다**(#7). `classifyStroke`가 이미 사유를 돌려주고 있었다.",
        rows: reasonsByGrade,
      },
      registered_pick: {
        rule: "조용히 틀림(cut 0.2) 비율이 기준 이하이면서 배치가 최대인 조합. "
          + "**없으면 `null`이고 그것이 답이다** — 임계로는 못 고친다는 뜻이다.",
        base: baseKey, base_silent_wrong_0_2: round(baseRate, 4),
        base_placed: `${base.placed}/${base.total}`,
        picked: pick, picked_placed: pick ? `${confirm[pick].placed}/${confirm[pick].total}` : null,
        picked_silent_wrong_0_2: pick
          ? round(confirm[pick].w20 / Math.max(1, confirm[pick].placed), 4) : null,
        picked_gain_over_base: pick ? confirm[pick].placed - base.placed : null,
        verdict: "⚠ **이득이 시드 변동폭 안이다**(#14). 실질적으로 **아무것도 안 고른다** — "
          + "그것이 이 항목의 답이다.",
      },
      conclusion: {
        thresholds_do_not_fix_it: "**확정 시점 판정은 임계로 못 고친다.** 45개 조합 어디에서도 "
          + "배치와 조용히 틀림이 **거의 고정된 비율로 맞바뀐다** — `vp_dist_ratio` 0.03 → 0.22에서 "
          + "배치 2259 → 2632인데 조용히 틀림 0.305 → 0.416이다. 사전 등록한 규칙(조용히 틀림이 "
          + "기준 이하이면서 배치 최대)이 고르는 것은 기준보다 **+26/4320**이고 그것은 시드 "
          + "변동폭 안이다(#14). **`AXIS_TOL`을 바꾸지 않는다**(A-3: 측정이 아무 방향도 안 가리킨다).",
        turn_detection: "`coarse`의 `multi_axis` 254는 실재하는 등급 특이 항이지만 **여기도 "
          + "같은 맞바꿈이다** — 45° → 60°에서 배치 2416 → 2585인데 조용히 틀림 0.362 → 0.387이다. "
          + "⚠ **대조군이 뜻밖의 것을 말했다**: 진짜 코너가 있는 획의 거부율이 `turn_deg` 90°에서도 "
          + "**2018/2160(93%)**이다 — 즉 진짜 코너를 걸러내는 것은 `multi_axis`가 아니라 "
          + "**다른 규칙들**(굽음·애매·무매칭)이다. `multi_axis`는 **거친 잉크에만 발화하는 "
          + "부작용 쪽에 가깝다.** 그래도 조용히 틀림이 늘어 등록 규칙을 통과하지 못한다.",
        the_real_answer: "**고치는 것은 임계가 아니라 앵커다.** 같은 잉크·같은 구도에서 "
          + "확정 시점 판정은 배치 **2416/4320(0.56)** · 조용히 틀림 **36.2%**인데, "
          + "앵커가 3D에 있는 실시간 판정은 배치 **3403/4320(0.79)** · 조용히 틀림 **16.7%**다. "
          + "⚠ **두 값을 나란히 읽을 때 조건 차를 함께 읽는다**(#27): 실시간 팔은 **참 3D 기하가 "
          + "이미 있다**고 가정한다(스냅과 같은 상한 조건). 초기 확정에는 그것이 없다 — "
          + "그래서 이 비교는 '앵커가 있으면 다른 문제가 된다'를 말하지 '초기 확정을 고쳤다'를 "
          + "말하지 않는다. **초기 확정의 몫은 L-B.7 승격 연쇄로 넘어간다.**",
        live_threshold: `**\`LIVE_TOL.axis_deg\` = ${LIVE_TOL.axis_deg}를 유지한다.** `
          + "각차 4 → 35°에서 배치 2554 → 3728이고 조용히 틀림 0.102 → 0.219다. 무릎이 12~18° "
          + "구간이고(12 → 18은 +99 배치에 +0.8pp), 등록 규칙은 기준(12°) 위에서 아무것도 "
          + "안 고른다. **사유 없이 바꾸지 않는다**(#28).",
      },
      policy_objective: {
        why: "⚠ **등록한 규칙은 완화 방향만 볼 수 있다**(리뷰어 [4]). 목적이 '조용히 틀림 ≤ 기준 "
          + "**이면서 배치 최대**'인데 이 표의 맞바꿈이 단조이므로 조이는 후보는 구조적으로 "
          + "못 고른다. 그런데 이 프로젝트의 정책은 A-3·계획서 §9.1이다 — **미배치는 실패가 "
          + "아니라 대기 상태이고 승격이 연쇄한다.** 그 정책에서 미배치의 비용은 **미뤄지는** "
          + "것이고 조용히 틀림은 **영구**다. 그러면 조이는 쪽이 답일 수 있다.",
        rule: "배치를 기준의 90% 이상 지키면서 **조용히 틀림(cut 0.2)이 가장 낮은** 조합.",
        picked: tighten,
        picked_row: tighten ? rep(confirm[tighten]) : null,
        base_row: rep(base),
        caveat: "⚠ **지금 채택하지 않는다.** 이 정책이 성립하려면 **승격 연쇄가 실제로 회수해야 "
          + "하는데 그 기전이 아직 없다**(L-B.7). 회수율을 재기 전에 공유 상수를 바꾸면 "
          + "'미배치는 대기다'가 **검증되지 않은 전제**가 된다. **L-B.7 뒤에 다시 본다**(DEFERRED).",
      },
      seed_spread_at_base: {
        note: "**'+26이 시드 변동폭 안이다'를 재려면 폭을 재야 한다**(#14, 리뷰어 [7]). "
          + "초판은 재지 않고 그렇게 적었다.",
        placed_by_seed: bySeed,
        spread: seedVals.length
          ? { min: Math.min(...seedVals), max: Math.max(...seedVals),
              range: Math.max(...seedVals) - Math.min(...seedVals) }
          : null,
      },
      confirm_time: Object.fromEntries(Object.entries(confirm).map(([k, v]) => [k, rep(v)])),
      turn_detection: {
        note: "**`coarse`의 등급 특이 항**이다 — 기본 조건의 `free` 사유에서 `multi_axis`가 "
          + "coarse 254 · medium 50 · **precise 0**이다. 거친 잉크의 떨림이 **없는 코너를 "
          + "만들어 낸다**(`maxTurn`이 잡음에 발화한다).",
        control_why: "⚠ **5구도 픽스처의 획은 전부 모서리 하나라 풀어도 잃을 것이 없다** "
          + "(PITFALLS #4 — 모델이 문제를 만들지 못하면 반례가 아니다). 그래서 **인접한 두 "
          + "모서리를 한 획으로 이어** 진짜 코너를 만들고, 그 획이 **거부되는지**를 함께 센다. "
          + "거부율이 무너지면 그 임계는 `multi_axis`의 기능을 끈 것이다.",
        rows: Object.fromEntries(Object.entries(turn).map(([k, v]) => [k, rep(v)])),
        control_true_corner_rejected: Object.fromEntries(
          Object.entries(turnControl).map(([k, v]) => [k, `${v.rejected}/${v.n}`])),
        control_reject_reasons: Object.fromEntries(
          Object.entries(turnControl).map(([k, v]) => [k, v.reasons])),
        control_n_note: "분모 2160 = 5구도 × 3등급 × 6시드 × 4잡음 × **인접쌍 6개**.",
        control_ceiling_warning: "⚠ **이 대조군은 동적 범위가 5.8pp(92.4~98.2%)로 천장에 붙어 "
          + "있다.** `multi_axis`를 사실상 끈 `turn90`에서도 93%가 거부된다 — 즉 **이 대조군은 "
          + "`multi_axis` 기능의 붕괴를 검출할 수 없다.** 90° 코너 획은 굽음·무매칭이 어차피 "
          + "거부하기 때문이다. `control_reject_reasons`가 어느 규칙인지 **센 값**이다.",
      },
      live_time: {
        note: "**앵커가 3D에 있을 때의 판정.** 분모는 획 전체이고 스냅 실패도 `free`에 들어간다"
          + "(#9 — 무엇이 섞였는지 가른다: `free_reasons`가 `no_snap`/`angle_over`/`no_axis`로 나눈다).",
        angle_to_nearest_axis_deg: stat(liveDeg, 2),
        angle_note: "**임계를 어디 두어야 하는지 이 분포가 말한다.** 참 축이 있는 획이므로 "
          + "대부분 작아야 정상이고, 꼬리가 두꺼우면 임계로는 못 가른다.",
        rows: Object.fromEntries(Object.entries(liveByDeg).map(([k, v]) => [k, rep(v)])),
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "axis_live.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식
    // 기준 조합이 `lift_grade`의 배치를 재현하는가 — 아니면 다른 것을 재고 있다
    expect(base.total).toBe(GRADES.length * COMPOSITIONS.length * SEEDS.length * JITTERS.length * 12);
    // **양성 채널**(#30) — 임계를 풀면 `free`가 실제로 줄어야 한다.
    // 안 줄면 "임계가 원인이 아니다"가 아니라 "섭동이 도달하지 않았다"이다
    expect(confirm[`vp0.22_bend0.3_amb1.2`].axFree)
      .toBeLessThan(confirm[`vp0.03_bend0.12_amb2`].axFree);
    // 실시간 각차를 넓히면 미분류가 준다(같은 이유)
    expect(liveByDeg["35"].axFree).toBeLessThan(liveByDeg["4"].axFree);
  }, 600_000);
});
