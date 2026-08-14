// S-6 (3) **경사 소실점** — 산출: `stage0/out/incline_vp.json`.
//
// 계획서 §4.3은 "경사 VP는 대응 수평 VP의 바로 위/아래(이론서 15.1). **검출이 어렵지 않다**"고
// 적었고, 그 문장은 **근거 없는 예상이라고 이미 정정돼 있다**. W-2가 "짧은 선은 틀린 VP에도
// 아주 잘 맞는다"를 쟀기 때문이다. **그래서 위험부터 잰다 — 가르지 못하면 만들지 않는다**(A-3).
//
// 15.1을 정확히 읽으면 위험의 정체가 먼저 보인다. 경사 방향은 `cos t · e_h − sin t · e_v`이고
// **그 방향들의 소실점은 전부 `VP_h`와 `VP_v`를 잇는 직선 위에 있다.** 즉 경사 VP 후보 집합은
// 점이 아니라 **직선**(1-매개변수 족)이다. 그러면 획 하나로는 원리적으로 못 가른다 —
// 획의 대표 직선은 그 직선과 (평행하지 않는 한) **반드시 한 점에서 만나고**, 그 교점을
// "이 획의 경사 VP"라 부르면 부적합도가 **정확히 0**이 된다. 축 획도 마찬가지다
// (그 교점이 바로 `VP_h`이고 그것은 족의 `t = 0`이다).
//
// 그러므로 검출은 **평행한 경사 획 둘 이상**이 같은 점에서 만나는지를 봐야 한다.
// 이 측정이 재는 것은 그 둘째 경로다:
//
//   두 평행 경사 획의 교점이 **참 경사 VP에서 얼마나 벗어나는가**를
//   **참 경사 VP와 수평 VP 사이 거리로 나눈다**(`vp_sep_ratio`).
//   1을 넘으면 "경사인지 수평축인지" 가를 수 없다는 뜻이다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, representative, vpMisfit, AXIS_TOL } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, PLACE_TOL,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { norm3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, drawEdges, stat,
         add3, sub3, mul3, unit3, type Scene, type TrueEdge } from "./scene3d.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
/** 앱과 같은 배치 옵션(D-S16). **지금 사용자가 겪는 것**을 재려면 이것이어야 한다. */
const APP = { mode: "facing" as const, farEndCheck: PLACE_TOL.far_end_check,
              facePlanes: PLACE_TOL.face_far_end, freeBendMax: AXIS_TOL.bend_max,
              retryAsFace: PLACE_TOL.retry_as_face, freeSpan: PLACE_TOL.span_far_end };
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/** 화면 소실점. `d[2] <= 0`이면 카메라 뒤라 상이 없다. */
function vpOf(d: Vec3): Pt2 | null {
  const u = unit3(d);
  if (Math.abs(u[2]) < 1e-9) return null;             // 무한원 (2.2 c=0)
  return [SC.principal[0] + (SC.f * u[0]) / u[2], SC.principal[1] + (SC.f * u[1]) / u[2]];
}

/** 두 직선(각각 두 점으로 주어진다)의 교점. 거의 평행하면 `null`. */
function meet(a1: Pt2, a2: Pt2, b1: Pt2, b2: Pt2): Pt2 | null {
  const dx1 = a2[0] - a1[0], dy1 = a2[1] - a1[1];
  const dx2 = b2[0] - b1[0], dy2 = b2[1] - b1[1];
  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b1[0] - a1[0]) * dy2 - (b1[1] - a1[1]) * dx2) / den;
  return [a1[0] + dx1 * t, a1[1] + dy1 * t];
}

const dist = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** 경사각(도). 0이면 수평축 그대로다. */
const SLOPES = [10, 20, 30, 45];
const SEEDS = [8821, 1301, 5501];
/**
 * **몇 획으로 추정하는가.** 리뷰어 지적: 획 둘의 교점은 가능한 추정기 중 **가장 약한 것**이다.
 * 이론서 15.4(계단의 등간격 반복)·15.5(박공의 대칭)는 더 강한 구속을 주고, §3.1 누산기는
 * 이미 여러 획을 최소제곱으로 묶는 구조다. **그것을 재지 않고 "만들지 않는다"고 할 수 없다.**
 */
const NSTROKES = [2, 3, 4, 6];

/** 여러 직선의 **최소제곱 교점**. `Σ(I − dd^T)x = Σ(I − dd^T)p` — §3.1 누산기와 같은 식이다. */
function meetMany(lines: { p: Pt2; d: Pt2 }[]): Pt2 | null {
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const { p, d } of lines) {
    const m11 = 1 - d[0] * d[0], m12 = -d[0] * d[1], m22 = 1 - d[1] * d[1];
    a11 += m11; a12 += m12; a22 += m22;
    b1 += m11 * p[0] + m12 * p[1];
    b2 += m12 * p[0] + m22 * p[1];
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return null;
  return [(a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det];
}

describe("S-6 (3) 경사 소실점 — 위험부터 잰다", () => {
  it("경사 VP 후보는 **점이 아니라 직선**이다 — VP_h와 VP_v를 잇는 선 위에 있다", () => {
    const [e0, , e2] = SC.axes;
    const vh = vpOf(e0)!, vv = vpOf(e2)!;
    for (const deg of SLOPES) {
      const t = (deg * Math.PI) / 180;
      const d = add3(mul3(e0, Math.cos(t)), mul3(e2, -Math.sin(t)));   // e2는 아래 방향
      const vi = vpOf(d)!;
      // 세 점이 한 직선 위에 있다 — 외적이 0
      const cr = (vi[0] - vh[0]) * (vv[1] - vh[1]) - (vi[1] - vh[1]) * (vv[0] - vh[0]);
      expect(Math.abs(cr) / (dist(vh, vv) * Math.max(1, dist(vh, vi)))).toBeLessThan(1e-9);
    }
  });

  it("반례: 획 **하나**로는 못 가른다 — 어떤 획에도 부적합도 0인 경사 VP가 존재한다", () => {
    const r = rng32(31337);
    const O = groundPoint(SC, [420, 460])!;
    const edges = boxEdges(SC, O, 1.2, 1.0, 0.9);
    const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01)!;
    const [e0, , e2] = SC.axes;
    const vh = vpOf(e0)!, vv = vpOf(e2)!;
    // **축 0 모서리**(경사가 전혀 아닌 획)를 골라, 경사 VP 족과의 교점을 구한다
    for (const d of drawn.filter(x => x.axis === 0)) {
      const rep = representative(d.pts2d)!;
      const hit = meet(rep.a, rep.b, vh, vv);
      expect(hit).not.toBeNull();
      // 그 교점을 "이 획의 경사 VP"라 부르면 부적합도가 0이다 — 기각할 수단이 없다
      expect(vpMisfit(rep, hit!)).toBeLessThan(1e-9);
    }
  });

  it("평행 경사 획 여럿으로 검출되는지 재고 원장에 남긴다", () => {
    const [e0, e1, e2] = SC.axes;
    const vh = vpOf(e0)!, vv = vpOf(e2)!;
    /** 경사각별 누산. `sep`는 참 경사 VP와 수평 VP의 화면 거리다. */
    const by: Record<number, {
      n: number; est: number[]; sepPx: number[]; lenRatio: number[];
      /** 추정 오차 ÷ 두 VP 사이 거리. **1을 넘으면 못 가른다.** */
      ratio: number[]; wrongSide: number; verdict: Record<string, number>;
      /** 추정 VP가 참 경사 VP보다 **수평 VP에 더 가까운** 비율 — 그러면 축으로 읽힌다. */
      closerToAxis: number;
      /** **획 수별** 최소제곱 추정. 획 둘은 가능한 추정기 중 가장 약한 것이다. */
      byN: Record<number, { ratio: number[]; err: number[]; closerToAxis: number; n: number }>;
      /** **지금 실제로 어떻게 놓이는가.** 경사 VP를 안 만든 상태의 배치 결과(참값 대조). */
      placed: number; tried: number; cornerErr: number[]; worst: number[];
    }> = {};
    for (const s of [0, ...SLOPES]) {
      by[s] = { n: 0, est: [], sepPx: [], lenRatio: [], ratio: [], wrongSide: 0,
                verdict: {}, closerToAxis: 0, placed: 0, tried: 0, cornerErr: [], worst: [],
                byN: Object.fromEntries(NSTROKES.map(k =>
                  [k, { ratio: [], err: [], closerToAxis: 0, n: 0 }])) };
    }
    /** 시드별 top-line — 20°·30°의 중앙 ratio가 임계 1의 같은 쪽에 머무는지 본다. */
    const perSeed: Record<number, Record<number, number[]>> = {};
    for (const sd of SEEDS) { perSeed[sd] = {}; for (const s of [0, ...SLOPES]) perSeed[sd][s] = []; }

    for (const SEED of SEEDS) {
    const r = rng32(SEED);
    for (let it = 0; it < 80; it++) {
      const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
      if (!O) continue;
      const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
      // **상자를 먼저 세운다** — 서까래가 붙을 기존 기하가 있어야 실제 배치를 잴 수 있다.
      const boxT = boxEdges(SC, O, a, b, c);
      const boxD = drawEdges(SC, boxT, "medium", r, 0.12, 0.01);
      const diag3 = norm3(sub3(boxT[11].b, boxT[0].a));
      for (const deg of [0, ...SLOPES]) {
        const t = (deg * Math.PI) / 180;
        const d = unit3(add3(mul3(e0, Math.cos(t)), mul3(e2, -Math.sin(t))));
        const vi = vpOf(d);
        if (!vi) continue;
        // **평행한 서까래 여럿** — 지붕의 서까래. 같은 방향이므로 소실점이 같다.
        // 최대 6개까지 만들어 두고 **획 수별로** 추정 정확도를 본다.
        const maxN = NSTROKES[NSTROKES.length - 1];
        const rafters: TrueEdge[] = [];
        for (let k = 0; k < maxN; k++) {
          const P = add3(O, mul3(e1, (b * k) / (maxN - 1)));
          rafters.push({ a: P, b: add3(P, mul3(d, a)), axis: 0 });
        }
        const drawn = drawEdges(SC, rafters, "medium", r, 0.12, 0.01);
        if (!drawn) continue;
        const reps = drawn.map(x => representative(x.pts2d));
        if (reps.some(x => !x)) continue;
        // **획 둘의 교점은 양 끝 서까래로 잡는다** — 밑변이 가장 길어 가장 유리한 조건이다.
        const est = meet(reps[0]!.a, reps[0]!.b, reps[maxN - 1]!.a, reps[maxN - 1]!.b);
        if (!est) continue;

        const B = by[deg];
        B.n += 1;
        const sep = dist(vi, vh);
        const err = dist(est, vi);
        B.est.push(err);
        B.sepPx.push(sep);
        B.lenRatio.push(reps[0]!.len / Math.hypot(...SC.imgSize));
        B.ratio.push(sep > 1e-9 ? err / sep : Infinity);
        if (dist(est, vh) < dist(est, vi)) B.closerToAxis += 1;
        perSeed[SEED][deg].push(sep > 1e-9 ? err / sep : NaN);
        // **획 수별 최소제곱 추정** — 획 둘보다 강한 추정기가 가르는지 본다(§3.1 누산기 경로).
        for (const K of NSTROKES) {
          // **양 끝을 항상 포함해 고르게 뽑는다** — 획 수만 달라지고 밑변은 그대로여야
          // 비교가 성립한다(앞에서 K개를 그냥 자르면 K=2가 밑변 1/5로 불리해진다).
          const pick = Array.from({ length: K }, (_, j) =>
            Math.round((j * (maxN - 1)) / (K - 1)));
          const lines = pick.map(i => reps[i]).map(x => {
            const L = Math.hypot(x!.b[0] - x!.a[0], x!.b[1] - x!.a[1]);
            return { p: x!.a, d: [(x!.b[0] - x!.a[0]) / L, (x!.b[1] - x!.a[1]) / L] as Pt2 };
          });
          const e2p = meetMany(lines);
          if (!e2p) continue;
          const N = B.byN[K];
          N.n += 1;
          const ek = dist(e2p, vi);
          N.err.push(ek);
          if (sep > 1e-9) N.ratio.push(ek / sep);
          if (dist(e2p, vh) < dist(e2p, vi)) N.closerToAxis += 1;
        }
        // 지금 판정기가 이 획을 무엇이라 부르는가 — **경사 VP를 안 만든 상태의 실제 위험**
        const v = classifyStroke(drawn[0].pts2d, SC.vps, SC.imgSize, {},
                                 { principal: SC.principal, f: SC.f });
        const key = v.axis === "free" ? `free:${v.reason}` : `axis${v.axis}`;
        B.verdict[key] = (B.verdict[key] ?? 0) + 1;

        // **지금 실제로 어떻게 놓이는가** — 앱과 같은 옵션으로 상자에 서까래를 붙인다.
        // **양 끝 서까래 둘만** 붙인다(박공 하나). 여섯을 다 붙이면 나란한 획끼리 앵커를
        // 나눠 가져 배치 동역학이 달라지고, 재려는 것(경사가 어떻게 놓이는가)이 흐려진다.
        if (!boxD) continue;
        const pair = [drawn[0], drawn[maxN - 1]], pairT = [rafters[0], rafters[maxN - 1]];
        resetStrokeIds();
        const list: Stroke[] = boxD.map(x => {
          const w = classifyStroke(x.pts2d, SC.vps, SC.imgSize, {},
                                   { principal: SC.principal, f: SC.f });
          return newStroke(x.pts2d, w.axis, w.rep ? { a: w.rep.a, b: w.rep.b } : undefined);
        });
        settle(list, CTX, APP);
        const before = list.length;
        pair.forEach(x => {
          const w = classifyStroke(x.pts2d, SC.vps, SC.imgSize, {},
                                   { principal: SC.principal, f: SC.f });
          list.push(newStroke(x.pts2d, w.axis, w.rep ? { a: w.rep.a, b: w.rep.b } : undefined));
        });
        settle(list, CTX, APP);
        for (let k = before; k < list.length; k++) {
          const st = list[k], tr = pairT[k - before];
          B.tried += 1;
          if (!st.pts3d.length) continue;
          B.placed += 1;
          const e = [norm3(sub3(st.pts3d[0], tr.a)) / diag3,
                     norm3(sub3(st.pts3d[st.pts3d.length - 1], tr.b)) / diag3];
          B.cornerErr.push(...e);
          B.worst.push(Math.max(...e));
        }
      }
    }
    }

    const report = {
      spec: "S-6 (3) 경사 소실점. **위험부터 잰다** — 가르지 못하면 만들지 않는다(A-3).",
      constants: constantsSnapshot(),
      theory: (
        "이론서 15.1: 경사 VP는 대응 수평 VP의 바로 위/아래. **정확히 읽으면 후보 집합이 "
        + "점이 아니라 직선이다** — 경사 방향 `cos t·e_h − sin t·e_v`의 소실점은 전부 "
        + "`VP_h`–`VP_v` 직선 위에 있다(불변식 테스트로 잠갔다)."
      ),
      why_single_stroke_fails: (
        "**획 하나로는 원리적으로 못 가른다.** 대표 직선은 그 후보 직선과 한 점에서 만나므로 "
        + "어떤 획에도 부적합도 **정확히 0**인 경사 VP가 존재한다 — 축 0 모서리조차 그렇다"
        + "(그 교점이 `VP_h`이고 족의 `t = 0`이다). 반례 테스트가 이것을 잠근다. "
        + "그러므로 검출은 **평행한 경사 획 둘 이상**의 교점으로만 시도할 수 있다."
      ),
      metric: (
        "`ratio` = |두 획의 교점 − 참 경사 VP| ÷ |참 경사 VP − 수평 VP|. "
        + "**1을 넘으면 경사인지 수평축인지 가를 수 없다** — 추정 오차가 두 가설 사이 간격보다 크다. "
        + "`closer_to_axis_rate`는 추정 VP가 참 경사 VP보다 수평 VP에 더 가까운 비율이다."
      ),
      condition: { grade: "medium", skew: 0.12, end_jitter: 0.01, boxes: 80, seeds: SEEDS,
                   camera: { yaw_deg: 35, pitch_deg: 15, f: SC.f, img_size: SC.imgSize },
                   single_composition_warning: "구도가 하나뿐이다(직육면체, 요 35°·피치 15° 3점). 등급도 medium 하나다.",
                   note: ("경사각 0°는 **대조군**이다 — 수평축 그대로이므로 참 VP가 곧 `VP_h`이고 "
                          + "`vp_separation_px`가 0이다. 그래서 0°의 `ratio`와 `closer_to_axis_rate`는 "
                          + "**정의되지 않는다**(두 거리가 같은 양이다) — 범위를 말할 때 넣지 않는다.") },
      axis_tol: { vp_dist_ratio: AXIS_TOL.vp_dist_ratio, ambiguity_margin: AXIS_TOL.ambiguity_margin },
      by_slope_deg: Object.fromEntries([0, ...SLOPES].map(s => {
        const B = by[s];
        return [String(s), {
          n: B.n,
          vp_separation_px: stat(B.sepPx, 1),
          estimate_err_px: stat(B.est, 1),
          /** **이 값이 판정을 정한다.** 획 둘의 교점. */
          ratio: stat(B.ratio, 3),
          /** **획 수별 최소제곱 추정** — 획을 더 묶으면 갈리는가. */
          by_n_strokes: Object.fromEntries(NSTROKES.map(K => {
            const N = B.byN[K];
            return [String(K), { n: N.n, ratio: stat(N.ratio, 3), err_px: stat(N.err, 1),
                                 closer_to_axis_rate: rate(N.closerToAxis, N.n) }];
          })),
          /** 시드별 중앙 `ratio` — 임계 1의 같은 쪽에 머무는가. */
          ratio_median_by_seed: Object.fromEntries(SEEDS.map(sd => {
            const v = perSeed[sd][s].filter(Number.isFinite).sort((p, q) => p - q);
            return [String(sd), v.length ? +v[v.length >> 1].toFixed(3) : null];
          })),
          closer_to_axis_rate: rate(B.closerToAxis, B.n),
          stroke_len_ratio: stat(B.lenRatio, 4),
          /** 경사 VP를 **안 만든 지금** 이 획들이 어떻게 판정되는가. */
          verdict_now: B.verdict,
          /**
           * **지금 실제로 어떻게 놓이는가**(앱과 같은 옵션, 참값 대조).
           * 얕은 경사가 축으로 읽히면 그것이 조용히 틀린 배치다 — 그 크기가 여기 나온다.
           */
          placed_now: {
            n: B.tried, placed_rate: rate(B.placed, B.tried),
            corner_err_ratio: stat(B.cornerErr, 4),
            worst_end_ratio: stat(B.worst, 4),
            worst_end_over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
              [`over_${c}`, B.worst.filter(v => v > c).length])),
          },
        }];
      })),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "incline_vp.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(by[30].n).toBeGreaterThan(30);
  }, 300_000);
});
