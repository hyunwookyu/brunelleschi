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
import { scene, boxEdges, drawEdges, groundPoint, stat, round, perStrokeError,
         type Scene, type TrueEdge } from "./scene3d.js";
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

describe("L-B.4 — 축 판정 임계와 실시간 판정", () => {
  it("측정을 원장에 남긴다", () => {
    /** ① 확정 시점: 임계 조합 → 집계. */
    const confirm: Record<string, Bag> = {};
    /** 기준 조건에서의 `free` 사유 — **533이 무엇인지 센다**(#7). */
    const reasonsByGrade: Record<string, Record<string, number>> = {};
    /** ② 실시간: 각차 → 집계. */
    const liveByDeg: Record<string, Bag> = {};
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
    const turnControl: Record<string, { rejected: number; n: number }> = {};

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
          for (const e of perStrokeError(r.placed, fx.edges, fx.diag)) {
            b.err.push(e);
            if (e > 0.1) b.w10 += 1;
            if (e > 0.2) b.w20 += 1;
            if (e > 0.5) b.w50 += 1;
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
          const cell = (turnControl[key] ??= { rejected: 0, n: 0 });
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
            if (v.axis === "free") cell.rejected += 1;
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
            const e = Math.max(norm3(sub3(seg[0], T.a)), norm3(sub3(seg[1], T.b))) / fx.diag;
            b.err.push(e);
            if (e > 0.1) b.w10 += 1;
            if (e > 0.2) b.w20 += 1;
            if (e > 0.5) b.w50 += 1;
          }
        }
      }
    }

    // ---- 사전 등록한 채택 규칙(#26·#16). **측정 전에 박았다.**
    const baseKey = `vp${AXIS_TOL.vp_dist_ratio}_bend${AXIS_TOL.bend_max}`
                  + `_amb${AXIS_TOL.ambiguity_margin}`;
    const base = confirm[baseKey];
    const baseRate = base.w20 / Math.max(1, base.placed);
    let pick: string | null = null, pickPlaced = base.placed;
    for (const [k, b] of Object.entries(confirm)) {
      const sw = b.w20 / Math.max(1, b.placed);
      if (sw <= baseRate && b.placed > pickPlaced) { pickPlaced = b.placed; pick = k; }
    }

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
