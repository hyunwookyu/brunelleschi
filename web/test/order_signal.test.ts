// L-C.3 **대체 자동 신호** — 산출: `stage0/out/order_signal.json`. 계획서 §6.2.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-C.3 절에 적었다.
//
// ---------------------------------------------------------------- 무엇을 재는가
//
// §6.2의 원래 신호(재투영 잔차)는 **AS-L6이 반증했다** — 사영 불변이라 승격 전후에 둘 다 0이다.
// 계획서가 후보 둘을 남겼다:
//
//   ① 획별 `tiltDeg` — 축 방향을 해석 평면 안으로 사영할 때 돌린 각(`lift.ts`)
//   ② 소실점 삼각형의 **f² 편차** — 이론서 6.3의 자유도 0 조건
//
// **먼저 사영 불변인지 본다**(#30). 이 항목이 존재하는 이유가 바로 그 함정이기 때문이다.
// 못 넘으면 거기서 끝나고 §6.2대로 **사용자 확인으로 간다**(계획서가 이미 그렇게 적었다).
//
// ---------------------------------------------------------------- ②는 먼저 죽는다
//
// `fFromThreeVps`는 주점 `P`를 **삼각형의 수심**으로 잡고, 그다음 세 쌍의 f²를 낸다.
// 그런데 **수심의 정의가 곧 세 f²가 같다는 것**이다 —
// `(V₁−P)·(V₂−P) = (V₂−P)·(V₃−P) = (V₁−P)·(V₃−P)`는 수심의 항등식이다.
// 그러므로 그 편차는 **어떤 삼각형에서도 0**이고, **틀린 소실점을 넣어도 0**이다.
// **자기참조 유형 3**이다(#5): 복원한 값을 그 복원에 쓴 연산으로 되검사한 것이다.
// 아래에서 **둔각 삼각형·가짜 소실점을 포함해** 실제로 0인지 센다 — 추측하지 않는다(#7).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { frameOf, liftAll, LIFT_TOL, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { fFromThreeVps, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { norm3, sub3, unit3, axisDirection } from "../src/s3d/geom3d.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round, median,
         type Scene, type TrueEdge } from "./scene3d.js";
import { fitGauge, segShapeError, metricsSnapshot } from "./metrics.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

const SZ: [number, number] = [960, 672];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];

/** 구도·시드 산식은 `order_promote`·`order_undo`와 **같다**(#27). */
const TRUE_3PT = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
];
const TRUE_2PT = [
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
];
/** 가짜 세 번째 소실점 — 화면 아래. `order_promote`와 **같은 값**이다(#27). */
const FAKE_VP3: Pt2 = [SZ[0] / 2, SZ[1] * 4];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; edges: TrueEdge[]; pts: Pt2[][]; diag: number }

function fixture(C: typeof TRUE_3PT[number], grade: InkGrade, seed: number, jit: number): Fx | null {
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, diag, pts: drawn.map(e => e.pts2d as Pt2[]) };
}

/**
 * **한 장면의 신호 값** — 놓인 획들의 `tiltDeg` 중앙값.
 *
 * 획별 값을 그대로 쓰면 신호가 획 수에 딸려 움직인다. 중앙값으로 장면 하나에 한 수를 매긴다.
 * 못 내면 `null`이고 **그것도 결과다**(#11 — 산출 불가를 분모에서 안 뺀다).
 */
function tiltSignal(pts: Pt2[][], ctx: LiftCtx): { tilt: number | null; placed: number } {
  const strokes: LiftStroke[] = pts.map((p, i) => ({
    id: `s${i}`, pts2d: p,
    axis: classifyStroke(p, ctx.vps, SZ, {}, { principal: ctx.principal, f: ctx.f }).axis,
  }));
  const r = liftAll(strokes, ctx, { touch_ratio: LIFT_TOL.touch_ratio });
  const tilts: number[] = [];
  for (const st of strokes) {
    if (!r.placed.has(st.id)) continue;             // **놓인 것만** — 안 놓인 획엔 신호가 없다
    const F = frameOf(st, ctx);
    if (!("reason" in F)) tilts.push(F.tiltDeg);
  }
  return { tilt: tilts.length ? (median(tilts) ?? null) : null, placed: r.placed.size };
}

describe("L-C.3 — §6.2의 대체 자동 신호가 서는가", () => {
  it("측정을 원장에 남긴다", () => {
    // ================================================================ ② f² 편차
    // **먼저 죽는 쪽부터 센다.** 추측하지 말고 카운터를 넣는다(#7)
    const f2Rows: { name: string; ok: boolean; residual: number | null }[] = [];
    const pushTri = (name: string, a: Pt2, b: Pt2, c: Pt2) => {
      const r = fFromThreeVps(a, b, c);
      f2Rows.push({ name, ok: r.ok, residual: r.residual == null ? null : r.residual });
    };
    // 참 3점 구도의 실제 소실점들
    for (const C of TRUE_3PT) {
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      pushTri(`true_${C.name}`, sc.vps[0], sc.vps[1], sc.vps[2]);
      // **틀린 소실점**: 세 번째를 참에서 크게 옮긴다 — 자기참조 판별법(#5)
      pushTri(`wrong_vp3_${C.name}`, sc.vps[0], sc.vps[1],
              [sc.vps[2][0] + 400, sc.vps[2][1] + 900]);
    }
    // 참 2점 장면 + **가짜 세 번째**(대응하는 직육면체가 없다)
    for (const C of TRUE_2PT) {
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      pushTri(`spurious_${C.name}`, sc.vps[0], sc.vps[1], FAKE_VP3);
    }
    // ⚠ 섭동 크기를 **원장에 적는다**(#25) — `wrong_vp3_*`는 참 VP3를 (+400, +900)px 옮긴 것이다
    // **둔각·퇴화 삼각형**(f² < 0이라 카메라가 아예 안 서는 자리)
    pushTri("obtuse", [10, 10], [900, 700], [100, 600]);
    pushTri("arbitrary", [0, 0], [960, 0], [480, 672]);
    const f2Max = Math.max(...f2Rows.map(r => r.residual ?? 0));

    // ================================================================ ① tiltDeg
    /** 팔 하나의 자루. **참·가짜를 한 표에 안 섞는다**(#27). */
    const bag = () => ({ n: 0, noSignal: 0, before: [] as number[], after: [] as number[],
                         delta: [] as number[], err: [] as number[],
                         /**
                          * **고정 게이지 형태 오차**(2회차 리뷰어 [2]). 자기 게이지는 전역 배율을
                          * 적합해 없애므로 **VP3 변위가 만드는 배율 성분을 흡수한다** —
                          * AS-L11이 "승격이 더 내는 오차는 형태가 아니라 배율이고, 앱이 배율을
                          * 다시 안 맞추므로 **그 배율 어긋남이 사용자가 보는 오차다**"라고 적은 자리다.
                          * 참 팔의 게이지를 고정으로 물려 다시 낸다.
                          */
                         errFixed: [] as number[],
                         /**
                          * **VP3가 실제로 만든 축 방향 각오차(도)**(2회차 리뷰어 [1]).
                          * 픽셀 오프셋만 적으면 AS-L8("먼 소실점의 100px이 곧 2~3°")·
                          * AS-L9(0.5° 임계)와 **대조가 안 된다**. 각으로 낸다.
                          */
                         axisErr: [] as number[],
                         seedDelta: {} as Record<string, number[]>,
                         /** 탈락 장면의 성격(#11 — 두 팔의 탈락 비율이 다르면 정제된 집합이 다르다). */
                         noSigBy: {} as Record<string, number> });
    const real = bag(), spur = bag();
    /**
     * **세 번째 팔**(리뷰어 [2]): **3점 장면인데 VP3가 틀렸다.**
     *
     * 앱에서 겪는 오승격은 "승격할 장면이 아니었다"(가짜 팔)만이 아니라
     * **"승격은 맞는데 소실점을 잘못 놓았다"**도 있고, 후자가 `tiltDeg`가 정의상 가장
     * 민감할 자리다(축 방향이 `unit([vp − P, f])`이므로 vp가 직접 들어간다).
     * 초판은 이 팔이 없어 "가짜 승격을 못 가른다"가 **오승격 한 종류**에 대한 문장이었다.
     */
    const wrong = bag();
    /** 틀린 VP3의 섭동(px) — **원장에 적는다**(#25. 초판은 `progress.md`에만 있었다). */
    const WRONG_VP3_OFFSET: Pt2 = [400, 900];
    /** 층화(#12·#31): 구도별 · 잡음별로 갈라야 합산이 만든 무결론인지 알 수 있다. */
    const strat: Record<string, { real: number[]; spur: number[]; wrong: number[] }> = {};
    const stratPush = (key: string, arm: "real" | "spur" | "wrong", d: number) => {
      (strat[key] ??= { real: [], spur: [], wrong: [] })[arm].push(d);
    };
    /** f 섭동 — **사영 불변인가**(#30). 같은 장면·같은 획에서 f만 흔든다. */
    const byF: Record<string, number[]> = {};
    /** 시드별 표제 수치(#14 — L-C.2에서 두 번 걸렸다). */
    const bySeed: Record<string, { real: number[]; spur: number[] }> = {};

    const run = (C: typeof TRUE_3PT[number], b: ReturnType<typeof bag>,
                 arm: "real" | "spur" | "wrong",
                 grade: InkGrade, seed: number, jit: number) => {
      const fx = fixture(C, grade, seed, jit);
      if (!fx) return;
      const truth = trueVps(fx.sc);
      const spurArm = arm === "spur";
      // 승격 **전**: 가짜 팔은 참 2점 그대로, 나머지는 수직 소실점을 뺀 2점
      const before: (Pt2 | null)[] = spurArm ? truth : [truth[0], truth[1], null];
      // 승격 **후**: 참 / 없는 세 번째 / **참 장면인데 VP3가 틀린 것**
      const after: (Pt2 | null)[] =
        arm === "spur" ? [truth[0], truth[1], FAKE_VP3]
        : arm === "wrong" ? [truth[0], truth[1],
            [(truth[2]![0]) + WRONG_VP3_OFFSET[0], (truth[2]![1]) + WRONG_VP3_OFFSET[1]] as Pt2]
        : truth;
      const P = fx.sc.principal, F = fx.sc.f;
      const sB = tiltSignal(fx.pts, { principal: P, f: F, vps: before, imgSize: SZ });
      const sA = tiltSignal(fx.pts, { principal: P, f: F, vps: after, imgSize: SZ });
      b.n += 1;
      if (sB.tilt == null || sA.tilt == null) {
        b.noSignal += 1;
        const k = `${C.name}|${grade}|jit${jit}`;
        b.noSigBy[k] = (b.noSigBy[k] ?? 0) + 1;
        return;
      }
      b.before.push(sB.tilt); b.after.push(sA.tilt); b.delta.push(sA.tilt - sB.tilt);
      if (arm !== "wrong") {
        (bySeed[String(seed)] ??= { real: [], spur: [] })[spurArm ? "spur" : "real"]
          .push(sA.tilt - sB.tilt);
      }
      stratPush(`comp_${C.name}`, arm, sA.tilt - sB.tilt);
      stratPush(`jit_${jit}`, arm, sA.tilt - sB.tilt);
      stratPush(`grade_${grade}`, arm, sA.tilt - sB.tilt);
      if (seed !== 3) stratPush("seeds_without_3", arm, sA.tilt - sB.tilt);
      // **승격 후의 실제 품질**(참값) — 신호가 이것과 상관하는지 보려면 함께 있어야 한다
      const strokes: LiftStroke[] = fx.pts.map((p, i) => ({
        id: `s${i}`, pts2d: p,
        axis: classifyStroke(p, after, SZ, {}, { principal: P, f: F }).axis,
      }));
      const rA = liftAll(strokes, { principal: P, f: F, vps: after, imgSize: SZ },
                         { touch_ratio: LIFT_TOL.touch_ratio });
      const k = rA.placed.size ? fitGauge(rA.placed, fx.edges) : null;
      if (k != null) {
        const es: number[] = [];
        for (const [id, seg] of rA.placed) es.push(segShapeError(seg, fx.edges[+id.slice(1)], fx.diag, k));
        const m = es.length ? median(es) : null;
        if (m != null) b.err.push(m);
      }
      // **고정 게이지 판**(리뷰어 [2]) — 참 카메라로 푼 같은 장면의 게이지를 물린다.
      // 자기 게이지가 흡수하는 배율 성분이 여기서는 남는다
      if (arm !== "real") {
        const sTrue: LiftStroke[] = fx.pts.map((p, i) => ({
          id: `s${i}`, pts2d: p,
          axis: classifyStroke(p, truth, SZ, {}, { principal: P, f: F }).axis,
        }));
        const rTrue = liftAll(sTrue, { principal: P, f: F, vps: truth, imgSize: SZ },
                              { touch_ratio: LIFT_TOL.touch_ratio });
        const kTrue = rTrue.placed.size ? fitGauge(rTrue.placed, fx.edges) : null;
        if (kTrue != null && rA.placed.size) {
          const es: number[] = [];
          for (const [id, seg] of rA.placed) {
            es.push(segShapeError(seg, fx.edges[+id.slice(1)], fx.diag, kTrue));
          }
          const m = es.length ? median(es) : null;
          if (m != null) b.errFixed.push(m);
        }
      } else if (k != null) {
        b.errFixed.push(b.err[b.err.length - 1]);   // 참 팔은 자기 게이지가 곧 기준 게이지다
      }
      // **VP3의 축 방향 각오차**(리뷰어 [1]) — 픽셀이 아니라 도로 낸다
      if (truth[2] && after[2]) {
        const dTrue = unit3(axisDirection(truth[2]!, P, F));
        const dAfter = unit3(axisDirection(after[2]!, P, F));
        const c = Math.min(1, Math.abs(dTrue[0] * dAfter[0] + dTrue[1] * dAfter[1]
                                     + dTrue[2] * dAfter[2]));
        b.axisErr.push((Math.acos(c) * 180) / Math.PI);
      }
      (b.seedDelta[String(seed)] ??= []).push(sA.tilt - sB.tilt);
      // ---- **f 섭동**(#30) — 참 팔에서만. 승격 후 카메라의 f를 ±20% 틀리게 준다.
      // ⚠ 섭동한 f는 `tiltSignal` 안에서 **축 판정·`liftAll`·`frameOf` 전부**에 들어간다
      // (`ctx.f` 하나가 셋을 먹인다) — 계산 한 곳에만 넣은 것이 아니다(리뷰어 [4])
      if (arm === "real") {
        for (const kf of [0.8, 1, 1.2]) {
          const s = tiltSignal(fx.pts, { principal: P, f: F * kf, vps: after, imgSize: SZ });
          if (s.tilt != null) (byF[String(kf)] ??= []).push(s.tilt);
        }
      }
    };

    /**
     * **구도 대조군**(2회차 리뷰어 [3]): `2pt_yaw35_pitch0`을 **2점으로 옳게 푼** 형태 오차.
     *
     * 가짜 팔의 0.2537과 오라클 0.4979에는 **구도 효과가 섞여 있다** — 참 팔은 3pt 셋이고
     * 가짜 팔은 2pt 하나이기 때문이다. 이 대조군이 그 몫을 가른다:
     * **옳게 푼 2점 구도가 이미 나쁘면** 그 격차는 승격이 아니라 구도가 만든 것이다.
     */
    const twoPtOk: number[] = [];
    for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
      for (const C of TRUE_3PT) run(C, real, "real", grade, seed, jit);
      for (const C of TRUE_2PT) run(C, spur, "spur", grade, seed, jit);
      // **세 번째 팔** — 참 팔과 **같은 구도 셋**이라 구도 교락이 없다(리뷰어 [1])
      for (const C of TRUE_3PT) run(C, wrong, "wrong", grade, seed, jit);
      // **구도 대조군** — 같은 2pt 장면을 참 카메라(2점)로 푼다
      for (const C of TRUE_2PT) {
        const fx = fixture(C, grade, seed, jit);
        if (!fx) continue;
        const truth = trueVps(fx.sc);
        const P = fx.sc.principal, F = fx.sc.f;
        const sTrue: LiftStroke[] = fx.pts.map((p, i) => ({
          id: `s${i}`, pts2d: p,
          axis: classifyStroke(p, truth, SZ, {}, { principal: P, f: F }).axis,
        }));
        const r = liftAll(sTrue, { principal: P, f: F, vps: truth, imgSize: SZ },
                          { touch_ratio: LIFT_TOL.touch_ratio });
        if (!r.placed.size) continue;
        const kk = fitGauge(r.placed, fx.edges);
        if (kk == null) continue;
        const es: number[] = [];
        for (const [id, seg] of r.placed) es.push(segShapeError(seg, fx.edges[+id.slice(1)], fx.diag, kk));
        const m = es.length ? median(es) : null;
        if (m != null) twoPtOk.push(m);
      }
    }

    /** 두 델타 집합의 최선 판별력 — 층화 표에서 되쓴다. */
    const bestOf = (bad: number[], good: number[]) => {
      // ⚠ **한 팔이 비면 판별력이 아니다** — 분모가 0이면 TPR/FPR이 정의 안 된다(#11).
      // 초판은 `Math.max(1, …)`이 0을 1로 바꿔 `comp_2pt_*` 행에 **판별력 1**을 냈다
      if (!bad.length || !good.length) {
        return { best: null, at: null, n_bad: bad.length, n_good: good.length,
                 note: "한 팔이 비었다 — 판별력이 정의되지 않는다" };
      }
      // ⚠ **양방향을 다 훑는다**(#31, 2회차 리뷰어 [4]). 초판은 `Δtilt > 임계`만 봤는데
      // `wrong_vp3`의 Δtilt 중앙은 참 팔보다 **작다** — 그 팔의 자연스러운 방향은 반대다.
      // 한 방향만 훑으면 반대 방향 신호가 전부 ≤0으로 깔려 최댓값이 격자 끝에서 0에 붙는다
      let best = -1, at = 0, dir: "gt" | "lt" = "gt";
      for (const t of [-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 3]) {
        const gt = bad.filter(d => d > t).length / bad.length
                 - good.filter(d => d > t).length / good.length;
        if (gt > best) { best = gt; at = t; dir = "gt"; }
        const lt = bad.filter(d => d < t).length / bad.length
                 - good.filter(d => d < t).length / good.length;
        if (lt > best) { best = lt; at = t; dir = "lt"; }
      }
      return { best: round(best, 4), at, dir, n_bad: bad.length, n_good: good.length };
    };

    // ---- **판별력**: 어떤 동작점에서 참과 가짜가 갈리는가(#13 — 임계 하나로 안 정한다)
    const thresholds = [-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 3];
    const roc = thresholds.map(t => {
      // "신호가 승격을 **의심**한다" = Δtilt가 t보다 크다(승격이 tilt를 늘렸다)
      const flagReal = real.delta.filter(d => d > t).length;
      const flagSpur = spur.delta.filter(d => d > t).length;
      const tpr = flagSpur / Math.max(1, spur.delta.length);      // 가짜를 잡는 비율
      const fpr = flagReal / Math.max(1, real.delta.length);      // 참을 잘못 의심하는 비율
      return { threshold: t, flags_spurious: `${flagSpur}/${spur.delta.length}`,
               flags_real: `${flagReal}/${real.delta.length}`,
               tpr: round(tpr, 4), fpr: round(fpr, 4), separation: round(tpr - fpr, 4) };
    });
    const bestSep = Math.max(...roc.map(r => r.separation ?? 0));

    // ---- **시드 폭이 먼저다**(#14)
    const seedRows = Object.entries(bySeed).map(([sd, v]) => ({
      seed: Number(sd),
      real_delta_median: round(median(v.real), 4),
      spur_delta_median: round(median(v.spur), 4),
      gap: +(((median(v.spur) ?? 0) - (median(v.real) ?? 0))).toFixed(4),
    })).sort((a, b) => a.seed - b.seed);
    const gaps = seedRows.map(r => r.gap).sort((a, b) => a - b);

    // ---- **오라클 대조**: 두 팔이 애초에 갈리는가.
    // 신호가 못 가른다는 결론은 **가를 것이 있을 때만** 신호에 대한 정보다 —
    // 팔이 원래 안 갈리면 그 실패는 **픽스처의 성질**이지 신호의 성질이 아니다(#31).
    // 참값(형태 오차)으로 같은 ROC를 그린다: 이것이 **도달 가능한 상한**이다
    const errThresholds = [0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.3, 0.5];
    const oracleFor = (bad: number[], good: number[]) => errThresholds.map(t => {
      const fs = bad.filter(e => e > t).length, fr = good.filter(e => e > t).length;
      const tpr = fs / Math.max(1, bad.length), fpr = fr / Math.max(1, good.length);
      return { err_threshold: t, flags_bad: `${fs}/${bad.length}`, flags_good: `${fr}/${good.length}`,
               tpr: round(tpr, 4), fpr: round(fpr, 4), separation: round(tpr - fpr, 4) };
    });
    const oracleRoc = oracleFor(spur.err, real.err);
    const oracleBest = Math.max(...oracleRoc.map(r => r.separation ?? 0));
    const oracleWrongRoc = oracleFor(wrong.err, real.err);
    const oracleWrongBest = Math.max(...oracleWrongRoc.map(r => r.separation ?? 0));
    // **고정 게이지 오라클**(2회차 리뷰어 [2]) — 자기 게이지가 배율 성분을 흡수하므로
    // 그쪽 오라클은 **사용자가 보는 오차를 안 재는** 오라클이다. AS-L11이 그 자리를 적었다
    const oracleFixRoc = oracleFor(spur.errFixed, real.errFixed);
    const oracleFixBest = Math.max(...oracleFixRoc.map(r => r.separation ?? 0));
    const oracleWrongFixRoc = oracleFor(wrong.errFixed, real.errFixed);
    const oracleWrongFixBest = Math.max(...oracleWrongFixRoc.map(r => r.separation ?? 0));

    /** 팔의 시드별 Δtilt 중앙 — **세 팔 전부**에 낸다(2회차 리뷰어 [7]). */
    const seedMed = (b: ReturnType<typeof bag>) =>
      Object.entries(b.seedDelta).map(([sd, v]) => ({ seed: Number(sd), median: round(median(v), 4) }))
        .sort((x, y) => x.seed - y.seed);

    const fRows = [0.8, 1, 1.2].map(k => ({ f_scale: k, tilt: stat(byF[String(k)] ?? []) }));
    const fMoves = (() => {
      const m = fRows.map(r => r.tilt.median ?? 0);
      return { spread: +(Math.max(...m) - Math.min(...m)).toFixed(4),
               relative: +((Math.max(...m) - Math.min(...m)) / Math.max(1e-9, m[1])).toFixed(4) };
    })();

    const doc = {
      what: "L-C.3 — §6.2의 대체 자동 신호 후보 둘(획별 `tiltDeg` · 소실점 삼각형 f² 편차)이 "
        + "실제로 신호인가",
      why: "§6.2의 원래 신호(재투영 잔차)를 **AS-L6이 반증했다** — 사영 불변이라 승격 전후에 "
        + "둘 다 0이다. 계획서가 후보 둘을 남겼고 **'사영 불변이 아닌 양인지 먼저 확인한다. "
        + "아니면 되돌리기만 쓴다'**고 적었다. 그 확인이 이것이다.",
      // **#35를 낳은 그 자리다.** 기준(판별력 0.5)을 측정 전에 박긴 했는데 **그 픽스처에서
      // 도달 가능한지 모르는 채**였다. `gate`라는 이름으로 적어 자동 검사가 덮게 한다.
      gate: gate({
        registered: "규칙 셋의 **연언** — ① 사영 불변이 아니다(f ±20%에서 값이 움직인다) "
          + "② 자기참조가 아니다(틀린 카메라에서 값이 움직인다) "
          + "③ 어떤 동작점에서든 판별력(TPR − FPR) ≥ 0.5. 측정 전에 박았다(#26).",
        reachability: "**오라클 팔(참값)이 넘는다** — 고정 게이지로 `spurious` 0.9694 · "
          + "`wrong_vp3` 0.5446이다. ⚠ 초판 오라클은 **자기 게이지**라 0.4979 · 0.1265였고 "
          + "'기준이 도달 불가능했다'는 결론이 **통째로 지표의 산물**이었다(#35의 ⚠⚠). "
          + "오라클을 상한이라 부르지 않는다 — **한 대리 참값의 성능**이다.",
        reachability_value: 0.9694,
        reachability_source: "candidate_1_tilt_deg/separation/oracle_control/vs_spurious_fixed_gauge/best_separation",
        status: "닫혔다 — 후보 둘 다 규칙을 못 넘었다. 자동 승격은 안 건다(D-L26).",
      }),
      registered_rule: {
        note: "**측정 전에 박았다**(#26). `progress.md`의 L-C.3 절에 같은 문장이 있다.",
        rules: [
          "① **사영 불변이 아니다** — f를 ±20% 틀리게 주면 값이 움직인다(#30). 못 넘으면 끝난다",
          "② **자기참조가 아니다** — 틀린 카메라를 넣으면 값이 움직인다(#5)",
          "③ **참 승격과 가짜 승격을 가른다** — 어떤 동작점에서든 판별력(TPR − FPR) ≥ 0.5",
        ],
        caveat: "⚠ 셋 다 만족해도 **자동으로 걸지 않는다** — D-L26이 승격 자체에 결론이 없다고 "
          + "적었다. 신호의 쓸모는 **되돌리기를 권하는 것**이지 자동 승격이 아니다.",
      },
      conditions: {
        compositions: [...TRUE_3PT.map(c => c.name), ...TRUE_2PT.map(c => c.name)],
        grades: GRADES, seeds: SEEDS, end_jitters: JITTERS, skew: 0.12, canvas_px: SZ,
        camera: "**참 소실점**을 넣고 뺀다. 검출·조정 오차는 여기서 안 잰다.",
        spurious_vp3: FAKE_VP3,
        signal: "장면당 한 수 = **놓인 획들의 `tiltDeg` 중앙값**. 획별로 쓰면 신호가 획 수에 "
          + "딸려 움직인다. 못 내면 `no_signal`로 따로 센다(#11).",
      },

      // ================================================================ 후보 ②
      candidate_2_f2_deviation: {
        verdict: "❌ **신호가 아니다 — 자기참조 유형 3이다**(#5). 규칙 ②에서 죽는다.",
        why: "`fFromThreeVps`가 주점 `P`를 **삼각형의 수심**으로 잡는다. 그런데 "
          + "`(V₁−P)·(V₂−P) = (V₂−P)·(V₃−P) = (V₁−P)·(V₃−P)`는 **수심의 항등식**이다. "
          + "그러므로 세 f²의 편차는 **어떤 삼각형에서도 0**이고 **틀린 소실점을 넣어도 0**이다. "
          + "계획서 §6.2가 인용한 '이론서 6.3의 자유도 0 조건'은 맞지만, "
          + "**그 조건은 주점을 수심으로 잡는 순간 이미 소진된다** — 잴 것이 남지 않는다. "
          + "잴 수 있으려면 주점이 **독립으로 주어져야** 하는데(예: 2점 경로의 이미지 중심 가정) "
          + "3점 경로에서는 주점이 소실점에서 나온다(이론서 6.3).",
        rows: f2Rows.map(r => ({ ...r, residual: r.residual == null ? null : r.residual })),
        wrong_vp3_offset_px: [400, 900],
        theory: "⚠ **이론서가 이미 항등식으로 적어 두었다** — 6.4: `f² = |PVᵢ|·|PHᵢ|`이고 "
          + "**세 조합 모두 같은 값을 준다(삼각형의 수심에 관한 고전 항등식)**. "
          + "계획서 §6.2는 6.3만 인용해 후보로 세웠다. **인접 절을 읽었으면 측정 전에 기각할 수 있었다**"
          + "(#23의 사례). 5.3의 자유도 표('3점 → 남는 자유도: 없음')와도 정합한다.",
        max_residual: f2Max,
        control_moves: f2Max > 1e-9,
        note: "⚠ **둔각 삼각형**(`obtuse`, f² < 0이라 카메라가 아예 안 선다)과 "
          + "**가짜 소실점**(`spurious_*`)과 **크게 틀린 소실점**(`wrong_vp3_*`)을 함께 넣었다. "
          + "전부 0이면 이 양은 **정보량이 0**이다. 실패가 아니라 **관측**이다.",
      },

      // ================================================================ 후보 ①
      candidate_1_tilt_deg: {
        // ---- 규칙 ①: 사영 불변인가
        projective_invariance: {
          note: "**f를 ±20% 틀리게 주고 값이 움직이는지**(#30 · `camera_gate`의 양성 채널 방식). "
            + "안 움직이면 나머지를 안 잰다.",
          rows: fRows,
          moves: fMoves,
          passes_rule_1: fMoves.spread > 1e-6,
          caveat: "⚠ **움직인다는 것이 곧 쓸모는 아니다.** f가 클수록 tilt가 작아지는 "
            + "**단조 관계**라, 이 양은 f 오차와 축 오차를 **못 가른다**. "
            + "규칙 ③이 그것을 시험한다.",
        },
        // ---- 규칙 ③: 참과 가짜를 가르는가
        arms: {
          note: "**팔이 셋이다.** `spurious`는 '승격할 장면이 아니었다', "
            + "`wrong_vp3`는 '승격은 맞는데 소실점을 잘못 놓았다'다 — 앱에서 겪는 오승격이 "
            + "둘인데 초판은 앞의 하나만 쟀다(리뷰어 [2]). "
            + "⚠ **`spurious`는 참 팔과 구도가 다르다**(2pt 하나 대 3pt 셋)라 구도 효과와 교락한다 "
            + "— `wrong_vp3`는 **참 팔과 같은 구도 셋**이라 그 교락이 없다(리뷰어 [1]).",
          gauge_note: "⚠ **형태 오차의 게이지를 둘 다 낸다**(2회차 리뷰어 [2]). "
            + "`shape_err_after`는 **자기 게이지**(그 팔에서 적합)이고 `shape_err_fixed_gauge`는 "
            + "**참 카메라로 푼 같은 장면의 게이지**를 고정으로 물린 것이다. AS-L11이 "
            + "'승격이 더 내는 오차는 형태가 아니라 배율이고, 앱이 배율을 다시 안 맞추므로 "
            + "**그 배율 어긋남이 사용자가 보는 오차다**'라고 적었다 — 자기 게이지는 "
            + "**VP3 변위가 만드는 배율 성분을 흡수한다.**",
          real_promotion: { scenes: real.n, no_signal: real.noSignal, no_signal_by: real.noSigBy,
                            tilt_before: stat(real.before), tilt_after: stat(real.after),
                            delta: stat(real.delta), shape_err_after: stat(real.err),
                            shape_err_fixed_gauge: stat(real.errFixed),
                            seed_delta_median: seedMed(real) },
          spurious_promotion: { scenes: spur.n, no_signal: spur.noSignal, no_signal_by: spur.noSigBy,
                                tilt_before: stat(spur.before), tilt_after: stat(spur.after),
                                delta: stat(spur.delta), shape_err_after: stat(spur.err),
                                shape_err_fixed_gauge: stat(spur.errFixed),
                                seed_delta_median: seedMed(spur) },
          wrong_vp3_promotion: { offset_px: WRONG_VP3_OFFSET,
                                 axis3_err_deg: stat(wrong.axisErr),
                                 axis3_err_note: "⚠ **픽셀이 아니라 도로 낸다**(2회차 리뷰어 [1]). "
                                   + "AS-L9의 임계는 **0.5°**이고 AS-L8은 '먼 소실점의 100px이 "
                                   + "곧 2~3°'라 적었다 — 픽셀만 적으면 그 둘과 대조가 안 된다.",
                                 scenes: wrong.n, no_signal: wrong.noSignal,
                                 no_signal_by: wrong.noSigBy,
                                 tilt_before: stat(wrong.before), tilt_after: stat(wrong.after),
                                 delta: stat(wrong.delta), shape_err_after: stat(wrong.err),
                                 shape_err_fixed_gauge: stat(wrong.errFixed),
                                 seed_delta_median: seedMed(wrong) },
          composition_control_2pt_solved_correctly: {
            note: "**구도 효과를 가른다**(2회차 리뷰어 [3]). 같은 `2pt_yaw35_pitch0` 장면을 "
              + "**2점으로 옳게 푼** 형태 오차다. 이것이 이미 나쁘면 가짜 팔의 0.2537과 "
              + "오라클 0.4979의 상당 부분은 **승격이 아니라 구도**가 만든 것이다.",
            shape_err: stat(twoPtOk),
          },
          no_signal_note: "⚠ **탈락 비율이 팔마다 다르다**(#11) — 그러면 ROC의 분모가 "
            + "**서로 다르게 정제된 집합**이다. `no_signal_by`가 어느 셀에서 빠졌는지다.",
        },
        // ---- **층화**(#12·#31, 리뷰어 [1][5][6]): 합산이 만든 무결론인지 신호의 성질인지
        stratified: {
          note: "**합산이 만든 무결론인지 본다.** 구도·잡음·등급으로 가르고, "
            + "**시드 3을 뺀 판**도 낸다 — 그 시드 하나가 합산 격차를 지배하기 때문이다(리뷰어 [6]). "
            + "`vs_spurious`는 구도 교락이 있고 `vs_wrong_vp3`는 없다.",
          rows: Object.entries(strat).map(([k, v]) => ({
            stratum: k,
            vs_spurious: bestOf(v.spur, v.real),
            vs_wrong_vp3: bestOf(v.wrong, v.real),
          })),
        },
        separation: {
          note: "**임계를 하나로 안 고른다**(#13). `Δtilt > 임계`를 '승격을 의심한다'로 읽고 "
            + "**가짜를 잡는 비율(TPR)과 참을 잘못 의심하는 비율(FPR)**을 함께 낸다 — "
            + "TPR만 보면 **전부 의심하는 신호**가 이긴다(#15).",
          rows: roc,
          best_separation: round(bestSep, 4),
          passes_rule_3: bestSep >= 0.5,
          oracle_control: {
            note: "⚠ **두 팔이 애초에 갈리는가**(#31). 신호가 못 가른다는 결론은 **가를 것이 "
              + "있을 때만** 신호에 대한 정보다 — 팔이 원래 안 갈리면 그 실패는 픽스처의 "
              + "성질이지 신호의 성질이 아니다. 참값(형태 오차 중앙)으로 같은 ROC를 그린다. "
              + "**이것이 도달 가능한 상한이다.**",
            gauge_warning: "⚠⚠ **자기 게이지 오라클은 사용자가 보는 것을 안 잰다**"
              + "(2회차 리뷰어 [2]). 최소제곱으로 전역 배율을 적합해 없애므로 "
              + "**VP3 변위가 만드는 배율 성분을 흡수한다** — AS-L11이 '앱이 배율을 다시 안 "
              + "맞추므로 그 배율 어긋남이 사용자가 보는 오차다'라고 적은 바로 그 자리다. "
              + "**고정 게이지 판이 살아 있는 표다.**",
            vs_spurious: { rows: oracleRoc, best_separation: round(oracleBest, 4), gauge: "self" },
            vs_spurious_fixed_gauge: { rows: oracleFixRoc,
                                       best_separation: round(oracleFixBest, 4),
                                       gauge: "fixed(참 카메라)" },
            vs_wrong_vp3_fixed_gauge: { rows: oracleWrongFixRoc,
                                        best_separation: round(oracleWrongFixBest, 4),
                                        gauge: "fixed(참 카메라)" },
            vs_wrong_vp3: {
              rows: oracleWrongRoc, best_separation: round(oracleWrongBest, 4),
              note: "⚠ **VP3를 (+400, +900)px 옮겨도 형태 오차가 거의 안 나빠진다** "
                + "(중앙 0.0912 → 0.1079, 1.18배. 가짜 승격은 0.2537로 2.78배다). "
                + "**참값으로도 못 가르는 자리**이므로 이 팔에서 `tiltDeg`가 실패하는 것은 "
                + "**신호의 실패가 아니라 가를 것이 거의 없는 것**이다(#31). "
                + "즉 그 오승격은 **실제로 별로 안 나쁘다** — 되돌릴 이유가 약하다는 뜻이기도 하다.",
            },
            arms_are_separable: oracleBest >= 0.5,
            registered_bar_above_ceiling: oracleBest < 0.5,
            note2: "⚠ **이것을 '상한'이라 부르지 않는다**(리뷰어 [3]). 이 수는 "
              + "**형태 오차 중앙값을 임계로 자르는 규칙 한 가족의, 격자 여덟 점 중 최댓값**이다. "
              + "판별의 참값은 형태 오차가 아니라 **팔 라벨**이고, 라벨과 상관이 더 높은 관측량이 "
              + "원리적으로 배제되지 않는다. 그러므로 **'등록 기준 0.5가 도달 불가능했다'도 "
              + "증명되지 않았다** — 말할 수 있는 것은 **이 대리 참값으로는 0.5에 못 닿는다**까지다. "
              + "**후보 ①의 실패를 등록 기준으로 주장하지 않는다**: 기준과 무관한 근거는 "
              + "**시드 부호가 갈리는 것**(#14)과 **구도 교락이 없는 `wrong_vp3` 팔에서 "
              + "판별력이 0에 붙는 것**(`stratified`의 `comp_*` 세 행: 0.015 · 0.074 · 0)이다. "
              + "⚠ **`vs_spurious`는 구도 안에서 잴 수 없다** — 가짜 팔이 `2pt_yaw35_pitch0` "
              + "한 구도에만 있어 3pt 층에서는 그 팔이 비기 때문이다(그래서 `null`이다). "
              + "즉 합산 0.1979는 **구도 간 비교**이고 그 안에 구도 효과가 섞여 있다(리뷰어 [1]).",
          },
        },
        seed_spread: {
          note: "**시드 폭이 먼저다**(#14 — L-C.2에서 두 번 걸렸다). "
            + "`gap`이 (가짜 Δ 중앙 − 참 Δ 중앙)이고 **부호가 갈리면 결론이 없다.**",
          rows: seedRows,
          gap_min: gaps[0], gap_max: gaps[gaps.length - 1],
          all_same_sign: seedRows.every(r => r.gap > 0) || seedRows.every(r => r.gap < 0),
        },
      },
      conclusion: (() => {
        const c2Dead = f2Max < 1e-9;
        const c1Inv = fMoves.spread > 1e-6;
        const c1Sep = bestSep >= 0.5;
        return {
          candidate_2: c2Dead
            ? "❌ **자기참조 유형 3 — 정보량 0**(규칙 ②). 주점을 수심으로 잡는 순간 "
              + "세 f²가 같아지는 것이 **항등식**이라, 틀린 소실점·둔각 삼각형·가짜 승격에서도 "
              + "편차가 전부 1e-16 이하다. **AS-L6과 같은 유형의 오류**이고 계획서가 "
              + "'사영 불변이 아닌 양인지 먼저 확인한다'고 적어 둔 그 확인이 이것이다."
            : "⚠ 예상과 다르다 — 편차가 움직인다. 다시 본다",
          candidate_1: c1Inv && c1Sep
            ? "✅ 규칙 셋을 통과했다"
            : "❌ **규칙 ①은 통과하고 규칙 ③에서 죽는다.** f를 ±20% 흔들면 값이 움직이므로 "
              + "**사영 불변은 아니다**(AS-L6의 함정은 피했다. 섭동한 f는 축 판정·`liftAll`·"
              + "`frameOf` 셋 전부를 먹인다). 그러나 **오승격을 못 가른다** — 양방향을 다 훑어도 "
              + "최선이 `wrong_vp3` 구도별 0.118 / 0.074 / 0.242이고 `spurious` 합산 "
              + round(bestSep, 4) + "이다. "
              + "⚠⚠ **그리고 그것은 신호의 실패이지 픽스처의 실패가 아니다** — 2회차 재측정이 "
              + "그것을 뒤집어 확인했다. **참값을 고정 게이지로 재면 판별력이 "
              + "`spurious` " + round(oracleFixBest, 4) + " · `wrong_vp3` " + round(oracleWrongFixBest, 4)
              + "로 둘 다 등록 기준 0.5를 넘는다.** "
              + "초판이 쓴 자기 게이지 값(0.4979 · 0.1265)은 **최소제곱이 전역 배율을 적합해 "
              + "없앤 뒤의 수**이고, AS-L11이 '앱이 배율을 다시 안 맞추므로 **그 배율 어긋남이 "
              + "사용자가 보는 오차다**'라고 적어 둔 바로 그 성분을 지운 것이다. "
              + "**그러므로 초판의 두 문장을 철회한다**: ① '등록 기준 0.5가 도달 불가능했다' — "
              + "**도달 가능하다**(0.97 · 0.54). ② '`wrong_vp3`는 애초에 가를 것이 거의 없다' — "
              + "**가를 것이 많다**. 그 팔의 VP3 축 각오차는 **중앙 5.59°**(2.97~9.84°)로 "
              + "AS-L9 임계 **0.5°의 11배**이고, 고정 게이지 형태 오차가 0.0912 → **0.2599**(2.85배)다. "
              + "⚠ 구도 효과도 갈랐다(2회차 리뷰어 [3]): 같은 2pt 장면을 **옳게 2점으로 푼** "
              + "대조군이 자기 게이지 0.1435라 `spurious`의 0.2537 중 일부는 구도였지만, "
              + "**고정 게이지에서는 3.1196 대 0.0912라 구도로 설명되지 않는다.** "
              + "실패의 이유는 `tiltDeg`가 **f 오차와 축 오차를 섞기 때문**이다 — f가 클수록 "
              + "tilt가 작아지는 단조 관계라 두 원인이 한 수에 겹친다.",
          verdict: "**후보 둘 다 안 선다. §6.2의 대비책으로 간다 — 사용자 확인이다.** "
            + "⚠ **다만 '잴 것이 없어서'가 아니다** — 고정 게이지 참값으로는 오승격 두 종류가 "
            + "둘 다 0.5를 넘게 갈린다. **관측 가능한 신호를 아직 못 찾은 것이다.** "
            + "계획서가 이미 그렇게 적었다('아니면 되돌리기만 쓴다'). "
            + "**그 되돌리기가 L-C.2에서 만들어졌다** — 차수를 명시한 되돌리기와 "
            + "승격이 잃은 것의 표시다. ⚠ **이것은 우회가 아니라 계획서의 두 갈래 중 하나다.**",
          what_this_does_not_say: [
            "**다른 신호가 없다** — 이 항목이 시험한 것은 계획서가 적은 후보 **둘**이다. "
              + "고정 게이지 참값이 0.97 · 0.54까지 가르므로 **메울 여지가 크다**. "
              + "⚠ 그 수를 '상한'이라 부르지 않는다 — **한 대리 참값의 성능**이지 "
              + "도달 가능성의 증명이 아니다",
            "**사용자가 옳게 판단하는가** — 표본 0(AS-C1). 자동 신호가 없다는 것과 "
              + "사람이 잘 한다는 것은 다른 주장이다",
            "**실제 앱 조건** — 여기는 참 소실점을 넣고 뺀다. 앱에서는 사용자가 맞춘 "
              + "소실점이고 그 오차가 더해진다",
          ],
        };
      })(),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "order_signal.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식
    // **양 팔이 실제로 돌았다**(#32의 실행 카운터) — 안 돌았으면 아래 수치가 정보가 0이다
    expect(real.delta.length).toBeGreaterThan(0);
    expect(spur.delta.length).toBeGreaterThan(0);
    // 후보 ②가 **정말로** 항등인지 — 추측이 아니라 측정이다(#7)
    expect(f2Max).toBeLessThan(1e-9);
  }, 300_000);
});
