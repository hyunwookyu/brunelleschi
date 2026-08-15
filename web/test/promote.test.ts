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
import { snapCandidates, staticCandidates, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "../src/s3d/liveLine.js";
import { unit3, axisDirection } from "../src/s3d/geom3d.js";
import { classifyStroke, AXIS_TOL, type Axis, type AxisCfg } from "../src/s3d/axis.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

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

/** 한 세그먼트의 참값 대비 오차(구조 대각 대비). 끝점 짝은 가까운 쪽으로 맞춘다. */
function segErr(seg: LiftSeg, t: TrueEdge, diag: number): number {
  const d0 = Math.max(norm3(sub3(seg.a, t.a)), norm3(sub3(seg.b, t.b)));
  const d1 = Math.max(norm3(sub3(seg.a, t.b)), norm3(sub3(seg.b, t.a)));
  return Math.min(d0, d1) / diag;
}

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
}
const bag = (): Bag => ({ n: 0, total: 0, confirmed: 0, pendingN: 0, recovered: 0, reasons: {},
                          recoveredA: 0, reasonsA: {}, errRecoveredA: [],
                          aw10: 0, aw20: 0, aw50: 0,
                          errConfirmed: [], errRecovered: [],
                          cw10: 0, cw20: 0, cw50: 0, rw10: 0, rw20: 0, rw50: 0, drift: [] });
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
  // **절단을 하나 고르지 않는다**(#13). 분모는 각각 그 집합이다
  confirmed_silent_wrong: { cut_0_1: `${b.cw10}/${b.confirmed}`, cut_0_2: `${b.cw20}/${b.confirmed}`,
                            cut_0_5: `${b.cw50}/${b.confirmed}` },
  recovered_silent_wrong: { cut_0_1: `${b.rw10}/${b.recovered}`, cut_0_2: `${b.rw20}/${b.recovered}`,
                            cut_0_5: `${b.rw50}/${b.recovered}` },
  // **합쳐서 본다** — 채택 규칙이 (배치 + 회수)와 조용히 틀림을 함께 요구한다
  all_silent_wrong: {
    cut_0_2: `${b.cw20 + b.rw20}/${b.confirmed + b.recovered}`,
    cut_0_5: `${b.cw50 + b.rw50}/${b.confirmed + b.recovered}`,
    rate_0_2: round((b.cw20 + b.rw20) / Math.max(1, b.confirmed + b.recovered), 4),
    rate_0_5: round((b.cw50 + b.rw50) / Math.max(1, b.confirmed + b.recovered), 4),
  },
  committed_drift: stat(b.drift, 12),
  // ---- 두 번째 기전(앵커). **이것이 실제로 회수하는 쪽이다**
  anchor_recovered_over_pending: `${b.recoveredA}/${b.pendingN}`,
  anchor_recovery_rate: round(b.recoveredA / Math.max(1, b.pendingN), 4),
  anchor_not_recovered_reasons: b.reasonsA,
  anchor_recovered_shape_err: stat(b.errRecoveredA),
  anchor_recovered_silent_wrong: {
    cut_0_1: `${b.aw10}/${b.recoveredA}`, cut_0_2: `${b.aw20}/${b.recoveredA}`,
    cut_0_5: `${b.aw50}/${b.recoveredA}`,
  },
  anchor_all_silent_wrong: {
    cut_0_2: `${b.cw20 + b.aw20}/${b.confirmed + b.recoveredA}`,
    cut_0_5: `${b.cw50 + b.aw50}/${b.confirmed + b.recoveredA}`,
    rate_0_2: round((b.cw20 + b.aw20) / Math.max(1, b.confirmed + b.recoveredA), 4),
    rate_0_5: round((b.cw50 + b.aw50) / Math.max(1, b.confirmed + b.recoveredA), 4),
  },
  anchor_placed_total_over_all: `${b.confirmed + b.recoveredA}/${b.total}`,
});

describe("L-B.7 — 승격 연쇄가 실제로 회수하는가", () => {
  it("측정을 원장에 남긴다", () => {
    const arms: Record<string, Bag> = {};
    /** 대조군: **승격 없이** 같은 미배치 집합을 다시 푼다 — 아무 일도 안 일어나야 한다. */
    const control = { tried: 0, extra: 0 };

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
          for (const [id, seg] of first.placed) {
            const e = segErr(seg, fx.edges[+id.slice(1)], fx.diag);
            b.errConfirmed.push(e);
            if (e > 0.1) b.cw10 += 1;
            if (e > 0.2) b.cw20 += 1;
            if (e > 0.5) b.cw50 += 1;
          }

          // ---- 대기: 못 놓인 획들. **이것이 회수율의 분모다**
          const pending = input.filter(s => !first.placed.has(s.id));
          b.pendingN += pending.length;
          if (!pending.length) continue;

          // ---- 승격
          const committed = new Map(first.placed);
          const pr = promote(pending, input, first.placed, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
          b.recovered += pr.promoted.size;
          for (const [k2, v] of Object.entries(pr.reasons)) b.reasons[k2] = (b.reasons[k2] ?? 0) + v;
          for (const [id, seg] of pr.promoted) {
            const e = segErr(seg, fx.edges[+id.slice(1)], fx.diag);
            b.errRecovered.push(e);
            if (e > 0.1) b.rw10 += 1;
            if (e > 0.2) b.rw20 += 1;
            if (e > 0.5) b.rw50 += 1;
          }
          // ---- 판정 ③: **기존 기하를 안 움직였는가**
          b.drift.push(committedDrift(committed, first.placed));

          // ---- **두 번째 기전: 앵커로 올린다**(§3·§7의 실시간 경로를 대기 획에 적용).
          // 대상은 **확정된 3D 기하**다 — 새로 놓인 것에 시작점이 붙으면 앵커가 생긴다.
          {
            const segs: SnapSeg[] = [...first.placed].map(([id, sg]) => ({ id, a: sg.a, b: sg.b }));
            const sctx: SnapCtx = { principal: ctx.principal, f: ctx.f, imgSize: SZ,
                                    ground: null, from: null };
            const pre = staticCandidates(segs);
            const dirs = [0, 1, 2].map(i => {
              const v = fx.sc.vps[i as 0 | 1 | 2];
              return isFiniteVp(v, SZ) ? unit3(axisDirection(v, ctx.principal, ctx.f)) : null;
            });
            const pa = promoteByAnchor(pending, (st) => {
              const a2 = st.pts2d[0], b2 = st.pts2d[st.pts2d.length - 1];
              const cand = segs.length
                ? snapCandidates(a2, segs, sctx, {}, pre)[0] : undefined;
              if (!cand) return { seg: null, why: "no_snap" };
              const near = nearestAxisOnScreen(cand.at, dirs, cand.screen, b2,
                                               { principal: ctx.principal, f: ctx.f });
              if (!near || near.deg > LIVE_TOL.axis_deg) return { seg: null, why: "angle_over" };
              const sg = segmentFromAnchor(cand.at, dirs[near.axis], b2,
                                           { principal: ctx.principal, f: ctx.f });
              return sg ? { seg: sg, why: "" } : { seg: null, why: "no_end" };
            });
            b.recoveredA += pa.promoted.size;
            for (const [k3, v] of Object.entries(pa.reasons)) b.reasonsA[k3] = (b.reasonsA[k3] ?? 0) + v;
            for (const [id, sg] of pa.promoted) {
              const e = segErr(sg, fx.edges[+id.slice(1)], fx.diag);
              b.errRecoveredA.push(e);
              if (e > 0.1) b.aw10 += 1;
              if (e > 0.2) b.aw20 += 1;
              if (e > 0.5) b.aw50 += 1;
            }
          }

          // ---- **대조군**(#6): 승격 없이 미배치 집합만 다시 푼다.
          // 같은 입력을 같은 솔버에 다시 넣는 것이므로 **새로 놓이는 것이 없어야** 한다.
          if (name === "base") {
            control.tried += pending.length;
            const again = liftAll(pending, ctx);
            control.extra += again.placed.size;
          }
        }
      }
    }

    // ---- 사전 등록한 채택 규칙(#26). **측정 전에 박았다.**
    // **두 기전 중 실제로 회수하는 쪽으로 판정한다** — 등록 규칙의 "(배치 + 회수)"는
    // 회수 기전을 지정하지 않았고, 일괄 재풀이는 0을 회수한다
    const rate = (b: Bag) => (b.cw20 + b.aw20) / Math.max(1, b.confirmed + b.recoveredA);
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
      },
      conclusion: {
        batch_resolve_recovers_nothing: "**§9.1의 '§5.4의 일괄 풀이를 재사용한다'는 이 구현에서 "
          + "아무것도 회수하지 못한다 — 세 팔 모두 0이다.** 사유가 `축이 미분류다`(지배항)와 "
          + "`구조에 이어지지 않았다`인데 **둘 다 획 하나의 성질**이라 문맥을 더 준다고 안 바뀐다. "
          + "축 라벨이 없으면 `frameOf`가 서지 않고, 그것은 같이 푸나 따로 푸나 같다.",
        anchor_recovers: "**실제로 회수하는 것은 앵커다** — 대기 획의 시작점이 확정된 기하에 "
          + "붙으면 §3·§7의 실시간 경로가 그 획을 놓는다. 기준 조건에서 **720/1904 = 37.8%**. "
          + "즉 **승격은 '다시 푸는 것'이 아니라 '앵커가 생기는 것'이다.** "
          + "계획서 §9.1의 문장을 그렇게 고쳐야 한다(#23).",
        but_quality_does_not_improve: "⚠ **회수된 것이 확정된 것보다 낫지 않다**(#16). "
          + "회수 720의 조용히 틀림이 cut 0.2에서 **314(43.6%)** · cut 0.5에서 **169(23.5%)**인데 "
          + "확정 2416은 각각 42.3% · 20.9%다. **승격은 개수를 늘리고 품질은 그대로 둔다.** "
          + "그러므로 '미배치는 대기다'는 **개수 회수에 대해서만 참**이고, "
          + "'나중에 더 정확히 놓인다'는 뜻이 아니다.",
        why_not_recovered: "**추측하지 말고 센다**(#7). 기준 조건에서 `no_snap` **813** · "
          + "`angle_over` 371이다 — 대기 획의 시작점이 **확정된 기하 근처에 아예 없다**는 것이 "
          + "지배항이다. 그럴 수밖에 없다: 그 획들이 대기인 이유가 바로 안 이어졌기 때문이다.",
        d_l18: "**D-L18 기각**(등록 규칙대로). 조이기는 (배치 + 회수)가 2976으로 기준 3136보다 "
          + "**작다** — 회수가 그 차이를 못 메운다(회수율이 두 팔에서 37.8% 대 37.2%로 같기 때문이다). "
          + "⚠ 다만 조이기는 조용히 틀림을 **cut 0.2에서 0.426 → 0.385 · cut 0.5에서 0.215 → 0.182**로 "
          + "낮춘다. **등록 규칙이 개수를 우선하도록 짜여 있어서 기각된 것**이고, "
          + "품질을 우선하는 목적함수에서는 여전히 조이기가 이긴다. **규칙을 사후에 바꾸지 않는다**(#28) — "
          + "기각으로 적고 그 사실을 함께 적는다.",
      },
      by_arm: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, rep(v)])),
      constants: constantsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "promote.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식
    // **승격은 기존 기하를 안 움직인다** — 되살릴 수 있는 검사다(덮어쓰면 0이 아니게 된다)
    for (const b of Object.values(arms)) expect(Math.max(0, ...b.drift)).toBe(0);
    // 기준 조합이 `axis_live`의 확정 배치를 재현하는가 — 아니면 다른 것을 재고 있다
    expect(arms.base.total).toBe(GRADES.length * COMPOSITIONS.length * SEEDS.length * JITTERS.length * 12);
    expect(arms.base.confirmed).toBe(2416);
    // **양성 채널**(#30) — 조이면 확정 배치가 실제로 줄어야 한다
    expect(arms.tighten.confirmed).toBeLessThan(arms.base.confirmed);
    expect(arms.loosen.confirmed).toBeGreaterThan(arms.base.confirmed);
  }, 300_000);
});
