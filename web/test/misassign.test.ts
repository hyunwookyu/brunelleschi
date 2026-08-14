// S-6 (2b) **축 오배정 되돌리기** — 산출: `stage0/out/misassign_retry.json`.
//
// S-6 (2)가 남긴 병목은 회수가 아니라 **판정**이었다: 면 위 사선의 15.8%가 축으로 오인되고,
// 그렇게 놓이면 모서리 오차 중앙이 0.448이다(`face_diagonal.json`). 판정 임계(`AXIS_TOL`)를
// 조이면 미분류가 늘고 **그것은 AS-13이 금지한다**.
//
// 임계를 건드리지 않는 경로가 하나 있다. S-6 (1)의 **정합성 검사**는 "축과 앵커가 정해지면
// 반대쪽 끝점이 예측된다"를 쓴다 — 축이 **틀리면** 그 예측이 빗나간다. 즉 검사 실패가
// **"이 축이 아니다"의 신호**다.
//
// ```
// 축 배정 → 정합성 검사 실패 → 사선으로 재시도 → 그것도 실패하면 미배치
// ```
//
// **1차 판에서 리뷰어가 여섯 가지를 잡았고 이 판이 그 대응이다.**
//
// 1. **한계 집합을 뺄셈으로 만들면 안 된다.** "retry가 check보다 더 놓는 158획"은 존재하지
//    않는 집합이다(두 팔의 배치 집합이 포함관계가 아니다 — retry는 check가 놓던 획도 잃는다).
//    **실제로 되돌린 획을 직접 센다**(`recovered`).
// 2. **절단값 0.2가 결론을 정하면 안 된다.** 0.1·0.2·0.5를 **전부** 낸다. 이것은 임계가
//    아니라 **보고용 절단값**이므로 `constants.ts`에 넣지 않는다 — 대신 결론이 절단값에
//    의존하는지가 원장에서 바로 보이게 한다.
// 3. **시드 변동폭이 결론의 여유보다 크면 그 결론은 없다.** 시드마다 따로 낸다.
// 4. **동작점을 하나 고르지 않는다**(D-S7). 끝점 겨냥 오차를 0.005/0.01/0.02로 훑는다 —
//    AS-12가 실획 자릿수를 0.028~0.051로 보고하므로 0.01 하나는 가장 유리한 자리다.
// 5. **분위를 앵커 끝과 자유 끝이 섞인 분포에서 읽으면 안 된다.** 앵커 끝은 접합 반경 안에
//    구조적으로 갇혀 있다. **획당 나쁜 쪽 끝**(`worst_end_ratio`)을 따로 낸다.
// 6. **D-S7의 ② 미배치율**(축이 정해졌는데도 못 놓인 비율)을 팔마다 낸다 — 검사를 켜면
//    이 값이 움직이고, 그것을 안 재면 `preview_gap.json`의 값이 낡는다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, PLACE_TOL, RETRY_STATS, resetRetryStats,
         type PlaceCtx, type PlaceOpts, type Stroke } from "../src/s3d/stroke.js";
import { norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, faceDiagonals, drawEdges, stat, type Scene } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

const SEEDS = [9700, 1301, 5501];
/**
 * 끝점 겨냥 오차(그림 대각 대비). **0.01 하나로 결론을 내지 않는다**(D-S7) —
 * AS-12는 실획 자릿수를 0.028~0.051로 보고한다. 0.02가 그 아래 끝에 가장 가까운 동작점이고
 * 0.01은 **가장 유리한 자리**다.
 */
const JITTERS = [0.005, 0.01, 0.02];
/** **보고용 절단값**(임계가 아니다 — 그래서 `constants.ts`에 없다). */
const CUTS = [0.1, 0.2, 0.5];

const ARMS: { key: string; opts: PlaceOpts; what: string }[] = [
  { key: "base", what: "현재 동작 — 첫 시점에는 정합성 검사가 없다",
    opts: { mode: "facing", facePlanes: PLACE_TOL.face_far_end } },
  { key: "base_nofaces", what: "면 경로도 끈다 — S-3·S-5의 첫 시점 그대로",
    opts: { mode: "facing" } },
  { key: "check", what: "정합성 검사만 켠다 — 오배정이 걸리는가, 대신 무엇을 잃는가",
    opts: { mode: "facing", facePlanes: PLACE_TOL.face_far_end,
            farEndCheck: PLACE_TOL.far_end_check } },
  { key: "retry", what: "검사 + 사선 재시도 — 걸린 것을 면 위에서 회수한다",
    opts: { mode: "facing", facePlanes: PLACE_TOL.face_far_end,
            farEndCheck: PLACE_TOL.far_end_check, retryAsFace: PLACE_TOL.face_far_end } },
  { key: "retry_0.5", what: "재시도 허용치 0.5",
    opts: { mode: "facing", facePlanes: PLACE_TOL.face_far_end,
            farEndCheck: PLACE_TOL.far_end_check, retryAsFace: 0.5 } },
  { key: "retry_0.25", what: "재시도 허용치 0.25",
    opts: { mode: "facing", facePlanes: PLACE_TOL.face_far_end,
            farEndCheck: PLACE_TOL.far_end_check, retryAsFace: 0.25 } },
];

const overs = (w: number[]) => Object.fromEntries(CUTS.map(c => [`over_${c}`, w.filter(v => v > c).length]));
const overRates = (w: number[]) =>
  Object.fromEntries(CUTS.map(c => [`over_${c}`, rate(w.filter(v => v > c).length, w.length)]));

interface Bucket { placed: number; total: number; err: number[]; worst: number[]; }
const bucket = (): Bucket => ({ placed: 0, total: 0, err: [], worst: [] });
const push = (b: Bucket, e: number[]) => {
  b.placed += 1; b.err.push(...e); b.worst.push(Math.max(...e));
};
const summary = (b: Bucket) => ({
  n: b.total, placed_rate: rate(b.placed, b.total),
  /** 양 끝을 섞은 분포. **앵커 끝은 접합 반경 안에 구조적으로 갇혀 있다** — 분위를 이것으로
   *  읽으면 안 된다(리뷰어 지적). 이전 판과 잇기 위해 남긴다. */
  corner_err_ratio: stat(b.err, 4),
  /** **획당 나쁜 쪽 끝.** 자유 끝이 지배하므로 배치 품질은 이쪽으로 읽는다. */
  worst_end_ratio: stat(b.worst, 4),
  // **비율은 따로 내지 않는다** — `n`·`placed_rate`·`worst_end_over`로 나오고,
  // 정확히 1·0인 비율은 selfcheck 플래그만 늘린다(원장 노이즈를 키우지 않는다).
  worst_end_over: overs(b.worst),
});

interface Acc {
  edges: Bucket; diagFree: Bucket; diagAxis: Bucket;
  /** **실제로 되돌린 획**(사선·모서리를 갈라 센다). 뺄셈이 아니라 직접 센 집합이다. */
  revDiag: Bucket; revEdge: Bucket;
  /** D-S7 ② — 축이 정해졌는데도 못 놓인 비율. `preview_gap.json`의 같은 이름과 짝이다. */
  classified: number; classifiedUnplaced: number;
  perSeed: Record<number, { placed: number; total: number; over: number[];
                            recovered: number; recWrong: number[];
                            /** 사선 그룹의 시드별 분해 — `face_diagonal.json`(시드 9700)과 대조하려면 필요하다. */
                            dFreeN: number; dFreePlaced: number; dAxN: number; dAxPlaced: number;
                            /** 되돌림의 사선/모서리 분해 — 기각의 핵심 근거가 여기 걸려 있다. */
                            recDiag: number; recDiagWrong: number[]; recEdge: number; recEdgeWrong: number[] }>;
  vs: Record<string, { dropped: number[]; keptN: number; keptOver: number[];
                       droppedEdges: number[]; gained: number;
                       /** **시드별 분해.** 채택 근거에도 시드 변동폭을 걸어야 한다 — 1차 판은
                        *  기각 쪽에만 걸었다(리뷰어 2차). */
                       bySeed: Record<number, { dropped: number[]; keptN: number; keptOver: number[] }> }>;
}
const acc = (): Acc => ({
  edges: bucket(), diagFree: bucket(), diagAxis: bucket(), revDiag: bucket(), revEdge: bucket(),
  classified: 0, classifiedUnplaced: 0, perSeed: {},
  vs: { base: { dropped: [], keptN: 0, keptOver: CUTS.map(() => 0), droppedEdges: [], gained: 0, bySeed: {} },
        check: { dropped: [], keptN: 0, keptOver: CUTS.map(() => 0), droppedEdges: [], gained: 0, bySeed: {} } },
});

interface Outcome { placed: boolean; worst: number; isEdge: boolean; }

describe("S-6 (2b) 축 오배정 되돌리기", () => {
  it("정합성 검사가 오배정 신호가 되는지 재고, 대조군·시드·동작점을 함께 낸다", () => {
    const res: Record<string, Record<number, Acc>> = {};
    for (const a of ARMS) { res[a.key] = {}; for (const j of JITTERS) res[a.key][j] = acc(); }
    const nDiag: Record<number, number> = {}, nAxis: Record<number, number> = {};
    for (const j of JITTERS) { nDiag[j] = 0; nAxis[j] = 0; }

    for (const J of JITTERS) for (const SEED of SEEDS) {
      const r = rng32(SEED);
      for (const a of ARMS) {
        res[a.key][J].perSeed[SEED] =
          { placed: 0, total: 0, over: CUTS.map(() => 0), recovered: 0, recWrong: CUTS.map(() => 0),
            dFreeN: 0, dFreePlaced: 0, dAxN: 0, dAxPlaced: 0,
            recDiag: 0, recDiagWrong: CUTS.map(() => 0), recEdge: 0, recEdgeWrong: CUTS.map(() => 0) };
      }

      for (let it = 0; it < 60; it++) {
        const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
        if (!O) continue;
        const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
        const edges = boxEdges(SC, O, a, b, c);
        const diags = faceDiagonals(SC, O, a, b, c);
        const drawn = drawEdges(SC, edges, "medium", r, 0.12, J);
        const dDiag = drawEdges(SC, diags as never, "medium", r, 0.12, J);
        if (!drawn || !dDiag) continue;

        // **판정은 한 번만 한다.** 팔마다 다시 하면 난수를 더 뽑아 그림이 달라진다.
        const vE = drawn.map(d => classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                                                 { principal: SC.principal, f: SC.f }));
        const vD = dDiag.map(d => classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                                                 { principal: SC.principal, f: SC.f }));
        nDiag[J] += vD.length;
        nAxis[J] += vD.filter(v => v.axis !== "free").length;
        const diag3 = norm3(sub3(edges[11].b, edges[0].a));
        const endErr = (s: Stroke, t: { a: Vec3; b: Vec3 }) =>
          [norm3(sub3(s.pts3d[0], t.a)) / diag3,
           norm3(sub3(s.pts3d[s.pts3d.length - 1], t.b)) / diag3];

        const outcomes: Record<string, Outcome[]> = {};
        for (const arm of ARMS) {
          const R = res[arm.key][J], ps = R.perSeed[SEED], oc: Outcome[] = [];
          outcomes[arm.key] = oc;
          resetStrokeIds(); resetRetryStats();
          const list: Stroke[] = drawn.map((d, i) =>
            newStroke(d.pts2d, vE[i].axis, vE[i].rep ? { a: vE[i].rep!.a, b: vE[i].rep!.b } : undefined));
          settle(list, CTX, arm.opts);
          const before = list.length;
          dDiag.forEach((d, i) => list.push(
            newStroke(d.pts2d, vD[i].axis, vD[i].rep ? { a: vD[i].rep!.a, b: vD[i].rep!.b } : undefined)));
          settle(list, CTX, arm.opts);

          for (let i = 0; i < list.length; i++) {
            const s = list[i], isEdge = i < before;
            const v = isEdge ? vE[i] : vD[i - before];
            const t = isEdge ? edges[i] : diags[i - before];
            const wasFree = v.axis === "free";
            const B = isEdge ? R.edges : (wasFree ? R.diagFree : R.diagAxis);
            B.total += 1; ps.total += 1;
            if (!isEdge) { if (wasFree) ps.dFreeN += 1; else ps.dAxN += 1; }
            if (!wasFree) R.classified += 1;                       // D-S7 ②의 분모
            if (!s.pts3d.length) {
              if (!wasFree) R.classifiedUnplaced += 1;
              oc.push({ placed: false, worst: NaN, isEdge });
              continue;
            }
            const e = endErr(s, t), w = Math.max(...e);
            push(B, e);
            ps.placed += 1;
            if (!isEdge) { if (wasFree) ps.dFreePlaced += 1; else ps.dAxPlaced += 1; }
            CUTS.forEach((c, k) => { if (w > c) ps.over[k] += 1; });
            // **되돌려진 것**: 판정은 축이었는데 배치 후 라벨이 `free`다 → 사선 경로로 놓였다.
            // **직접 센 집합이다** — 팔 사이 총계의 차가 아니다.
            if (!wasFree && s.axis === "free") {
              const T = isEdge ? R.revEdge : R.revDiag;
              push(T, e); T.total += 1;
              ps.recovered += 1;
              if (isEdge) ps.recEdge += 1; else ps.recDiag += 1;
              CUTS.forEach((c, k) => {
                if (w > c) { ps.recWrong[k] += 1; if (isEdge) ps.recEdgeWrong[k] += 1; else ps.recDiagWrong[k] += 1; }
              });
            }
            oc.push({ placed: true, worst: w, isEdge });
          }
        }
        // **무엇을 잃었는지는 합계로 안 보인다.** 기준 팔이 놓은 것을 이 팔이 안 놓았을 때,
        // 그 획이 **기준 팔에서** 얼마나 틀려 있었는지를 본다 — 자를 하나로 맞춘다.
        for (const ref of ["base", "check"] as const) {
          const ro = outcomes[ref];
          for (const arm of ARMS) {
            if (arm.key === ref) continue;
            const V = res[arm.key][J].vs[ref], oc = outcomes[arm.key];
            const S = (V.bySeed[SEED] ??= { dropped: [], keptN: 0, keptOver: CUTS.map(() => 0) });
            for (let i = 0; i < ro.length; i++) {
              if (!ro[i].placed) { if (oc[i].placed) V.gained += 1; continue; }
              if (oc[i].placed) {
                V.keptN += 1; S.keptN += 1;
                CUTS.forEach((c, k) => { if (ro[i].worst > c) { V.keptOver[k] += 1; S.keptOver[k] += 1; } });
              } else {
                V.dropped.push(ro[i].worst); S.dropped.push(ro[i].worst);
                if (ro[i].isEdge) V.droppedEdges.push(ro[i].worst);
              }
            }
          }
        }
      }
    }

    const armReport = (key: string, J: number) => {
      const R = res[key][J], arm = ARMS.find(a => a.key === key)!;
      const recN = R.revDiag.placed + R.revEdge.placed;
      const recWorst = [...R.revDiag.worst, ...R.revEdge.worst];
      return {
        what: arm.what,
        opts: { farEndCheck: arm.opts.farEndCheck ?? 0, retryAsFace: arm.opts.retryAsFace ?? 0 },
        edges: summary(R.edges),
        diag_unclassified: summary(R.diagFree),
        diag_axis_assigned: summary(R.diagAxis),
        /** D-S7 ② — `preview_gap.json`의 `unanchored_of_classified`와 **같은 양**이다. */
        unanchored_of_classified: rate(R.classifiedUnplaced, R.classified),
        /**
         * **되돌리기의 한계 품질 — 직접 센 집합이다.** 사선(설계 대상)과 모서리(끌려온 것)를
         * 갈라 센다. 섞으면 둘 다 안 보인다 — 사선은 정확하고 모서리는 아니다.
         */
        // **되돌리기가 꺼진 팔에서는 블록 자체를 내지 않는다.** 0으로 채운 통계를 내면
        // selfcheck 플래그만 100건 넘게 늘고 "집계 미작동"과 구분되지 않는다.
        recovered: recN ? {
          n: recN, wrong_over: overs(recWorst), wrong_rate: overRates(recWorst),
          diagonals: summary(R.revDiag),
          edges: summary(R.revEdge),
        } : { n: 0, note: "이 팔은 되돌리기가 꺼져 있다 — 되돌린 획이 없다" },
        vs: Object.fromEntries((["base", "check"] as const).map(ref => {
          const V = R.vs[ref];
          return [ref, {
            note: ("기준 팔이 놓은 것을 이 팔이 놓았는가. 오차는 **둘 다 기준 팔에서의 값**이다. "
                   + "`gained`가 0이 아니면 두 팔의 배치 집합이 포함관계가 아니라는 뜻이므로 "
                   + "**총계의 차로 한계 집합을 만들면 안 된다**."),
            dropped: { n: V.dropped.length, over: overs(V.dropped), rate: overRates(V.dropped) },
            /** **사선을 뺀 값** — 픽스처의 사선 비율(14%)에 결론이 얹혀 있는지 가른다. */
            dropped_edges_only: { n: V.droppedEdges.length, over: overs(V.droppedEdges),
                                  rate: overRates(V.droppedEdges) },
            kept: { n: V.keptN,
                    over: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, V.keptOver[k]])) },
            gained: V.gained,
            /** **시드별 농축비**(떨어뜨린 집단의 오류율 ÷ 남긴 집단의 오류율). 채택 근거가
             *  시드 변동폭보다 큰지 여기서 본다. */
            by_seed: SEEDS.filter(sd => V.bySeed[sd]).map(sd => {
              const S = V.bySeed[sd];
              return { seed: sd, dropped_n: S.dropped.length, kept_n: S.keptN,
                       dropped_over: overs(S.dropped),
                       kept_over: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, S.keptOver[k]])),
                       enrichment: Object.fromEntries(CUTS.map((c, k) => {
                         const dr = S.dropped.length ? S.dropped.filter(v => v > c).length / S.dropped.length : null;
                         const kr = S.keptN ? S.keptOver[k] / S.keptN : null;
                         return [`over_${c}`, dr != null && kr ? +(dr / kr).toFixed(2) : null];
                       })) };
            }),
          }];
        })),
        per_seed: SEEDS.map(s => {
          const p = R.perSeed[s];
          return { seed: s, placed: p.placed, total: p.total,
                   over: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, p.over[k]])),
                   recovered: p.recovered,
                   recovered_wrong: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, p.recWrong[k]])),
                   recovered_split: { diagonals: p.recDiag, edges: p.recEdge,
                     diagonals_wrong: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, p.recDiagWrong[k]])),
                     edges_wrong: Object.fromEntries(CUTS.map((c, k) => [`over_${c}`, p.recEdgeWrong[k]])) },
                   diag_unclassified: { n: p.dFreeN, placed: p.dFreePlaced, rate: rate(p.dFreePlaced, p.dFreeN) },
                   diag_axis_assigned: { n: p.dAxN, placed: p.dAxPlaced, rate: rate(p.dAxPlaced, p.dAxN) } };
        }),
      };
    };

    const report = {
      spec: "S-6 (2b) 축 오배정 되돌리기. 정합성 검사 실패를 '이 축이 아니다'의 신호로 쓴다.",
      constants: constantsSnapshot(),
      approach: (
        "**판정 임계를 건드리지 않는다**(AS-13이 `AXIS_TOL` 조이기를 금지한다). "
        + "S-6 (1)의 정합성 검사는 축이 틀리면 반대쪽 끝점 예측이 빗나가므로 "
        + "**검사 실패가 오배정의 신호**다. 실패하면 면 위 사선으로 재시도하고, "
        + "그것도 실패하면 미배치로 둔다(A-3: 놓지 않되 버리지 않는다)."
      ),
      reading_rules: {
        marginal_set: (
          "**한계 집합을 뺄셈으로 만들지 않는다.** 두 팔의 배치 집합은 포함관계가 아니다 — "
          + "retry는 check가 놓던 획도 잃는다(`vs.check.dropped`)고 원장이 말한다. "
          + "되돌리기의 한계 품질은 **`recovered`(직접 센 집합)**로 읽는다."
        ),
        cutoff: (
          "`over_0.1/0.2/0.5`는 **보고용 절단값이고 임계가 아니다**(그래서 `constants.ts`에 없다). "
          + "결론이 절단값에 의존하면 그 결론은 세우지 않는다 — 세 값을 다 싣는 이유가 그것이다."
        ),
        quantiles: (
          "분위는 **`worst_end_ratio`(획당 나쁜 쪽 끝)**로 읽는다. `corner_err_ratio`는 양 끝을 "
          + "섞은 분포이고 앵커 끝은 접합 반경 안에 **구조적으로** 갇혀 있어 중앙값을 끌어내린다."
        ),
        seeds: (
          "**시드 변동폭이 팔 사이 차이보다 크면 그 차이는 없다**(CLAUDE.md §5: 유효 2자리). "
          + "`per_seed`로 확인한 뒤에 결론을 쓴다."
        ),
        operating_point: (
          "**동작점을 하나 고르지 않는다**(D-S7). `by_end_jitter`가 0.005·0.01·0.02다. "
          + "AS-12는 실획 끝점 겨냥 오차를 **0.028~0.051**로 보고하므로 0.02가 그 아래 끝에 "
          + "가장 가까운 동작점이고 0.01은 **가장 유리한 자리**다."
        ),
      },
      condition: {
        grade: "medium", skew: 0.12, boxes: 60, seeds: SEEDS, end_jitter: JITTERS,
        camera: { yaw_deg: 35, pitch_deg: 15, f: SC.f, img_size: SC.imgSize },
        single_composition_warning: "구도가 하나뿐이다(직육면체, 요 35°·피치 15° 3점).",
        fixture_note: ("상자마다 면 대각선 2획 = 전체의 14%. **픽스처 설계값이고 실획 비율이 "
                       + "아니다**(AS-5). 그래서 `dropped_edges_only`를 함께 낸다."),
        vs_face_diagonal: ("시드 9700·`end_jitter` 0.01의 base 팔이 `face_diagonal.json`과 같은 "
                           + "그림이다. 다만 그 산출물은 모서리 pass에서 `facePlanes`를 껐고 "
                           + "여기는 켠다(앱과 같은 옵션) — 사선 수치는 같고 모서리 쪽이 다르다."),
      },
      by_end_jitter: Object.fromEntries(JITTERS.map(J => [String(J), {
        n_diagonals: nDiag[J],
        axis_assigned_rate: rate(nAxis[J], nDiag[J]),
        arms: Object.fromEntries(ARMS.map(a => [a.key, armReport(a.key, J)])),
      }])),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "misassign_retry.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(nDiag[0.01]).toBeGreaterThan(50);
  }, 900_000);

  it("반례: 재시도는 `farEndCheck`가 켜져 있어야 발동한다 — 검사가 없으면 신호도 없다", () => {
    const r = rng32(4242);
    const O = groundPoint(SC, [420, 460])!;
    const edges = boxEdges(SC, O, 1.1, 1.0, 0.9);
    const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01)!;
    resetStrokeIds(); resetRetryStats();
    const list = drawn.map(d => {
      const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                               { principal: SC.principal, f: SC.f });
      return newStroke(d.pts2d, v.axis as Axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
    });
    settle(list, CTX, { mode: "facing", retryAsFace: 1 });   // farEndCheck 없이
    expect(RETRY_STATS.tried).toBe(0);
  });
});
