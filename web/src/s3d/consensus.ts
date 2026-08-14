// S-2b (c) 획 간 일관성 — **체계적 왜곡이 체계적이라는 성질을 역이용한다**(AS-14).
//
// 사람이 그리는 투시에는 두 종류의 오차가 있다.
//   손떨림     무작위, 획마다 독립
//   체계적 왜곡 방향이 있고 **여러 획에 일관**. 소실점에서 멀수록·화각이 넓을수록 커진다
//
// 후자를 전자로 취급하면 판정이 흔들린다. 그러나 **일관하다는 것이 곧 단서**다 —
// 같은 축을 향하는 이웃 획들은 **같은 쪽으로** 빗나간다. 그 편향을 국소적으로 재서 빼면,
// 애매하던 획이 판정된다.
//
// **고치는 것이 아니다.** 획의 점은 하나도 움직이지 않는다(§1). 움직이는 것은 **판정 기준**뿐이다 —
// 왜곡은 오차가 아니라 의도일 수 있으므로 받아들이되 축은 알아보게 한다.
//
// **조용히 틀린 축에 배정하지 않는다**(A-3). 그래서 편향 보정에는 조건이 붙는다.
//   · 편향은 **확신 있게 판정된 이웃**에서만 온다(자기 자신과 다른 미판정 획은 못 쓴다)
//   · 이웃이 `min_support`개 미만이면 보정하지 않는다
//   · 이웃들의 편향이 서로 흩어져 있으면(일관하지 않으면) 보정하지 않는다 — 그건 왜곡이 아니다
//   · 보정 후에도 **애매성 판정은 그대로** 통과해야 한다
import type { Pt2 } from "./camera.js";
import { AXIS_TOL, angleWiden, type Axis, type AxisCam, type AxisCfg, type AxisVerdict } from "./axis.js";

export const CONSENSUS_TOL = {
  /** 이웃 반경 — 화면 대각 대비. 왜곡은 국소적으로 매끄럽다고 본다. */
  radius_ratio: 0.45,
  /** 이보다 이웃이 적으면 보정하지 않는다. 하나짜리 "합의"는 합의가 아니다. */
  min_support: 3,
  /** 이웃 편향의 흩어짐이 평균 크기의 이 배를 넘으면 일관하지 않다고 보고 포기한다. */
  max_spread_ratio: 1.0,
  /** 보정으로 넘길 수 있는 한계 — 원래 임계의 이 배까지만. 무한정 구제하지 않는다. */
  rescue_ceiling: 2.5,
};
export type ConsensusCfg = Partial<typeof CONSENSUS_TOL>;

export interface StrokeVerdict {
  /** 화면 좌표 — 이웃 판정에 대표 직선의 중점을 쓴다. */
  verdict: AxisVerdict;
}

const midOf = (v: AxisVerdict): Pt2 | null =>
  v.rep ? [(v.rep.a[0] + v.rep.b[0]) / 2, (v.rep.a[1] + v.rep.b[1]) / 2] : null;

export interface BiasField {
  /** 축별 국소 편향(부호 있는 부적합도의 평균)과 그 흩어짐. */
  at(axis: Axis, at: Pt2): { bias: number; spread: number; n: number } | null;
}

/**
 * **확신 있게 판정된 획들로 편향장(場)을 만든다.** 이것이 (d) 왜곡 모델 추정의 국소 형태다 —
 * 전역 모델을 세우지 않고 이웃 평균만 쓴다(A-3: 가장 단순한 것).
 */
export function biasField(
  verdicts: AxisVerdict[], imgSize: [number, number], cfg: ConsensusCfg = {},
): BiasField {
  const c = { ...CONSENSUS_TOL, ...cfg };
  const radius = c.radius_ratio * Math.hypot(imgSize[0], imgSize[1]);
  // 상대 순위로만 채택된 획은 편향의 근거로 쓰지 않는다 — 그 자체가 흔들린 판정이다
  const anchors = verdicts
    .filter(v => v.reason === "ok" && !v.relative && v.rep && v.scores)
    .map(v => ({ axis: v.axis, at: midOf(v)!, signed: v.scores!.find(s => s.axis === v.axis)!.signed }))
    .filter(a => Number.isFinite(a.signed));

  return {
    at(axis, at) {
      const near = anchors.filter(a => a.axis === axis
        && Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) <= radius);
      if (near.length < c.min_support) return null;
      const bias = near.reduce((s, a) => s + a.signed, 0) / near.length;
      const spread = Math.sqrt(near.reduce((s, a) => s + (a.signed - bias) ** 2, 0) / near.length);
      return { bias, spread, n: near.length };
    },
  };
}

export interface Rescue { index: number; axis: Axis; before: number; after: number; support: number; }

/**
 * 미판정 획을 이웃의 편향으로 다시 본다. **`verdicts`를 제자리에서 고치고 구제 목록을 돌려준다.**
 *
 * 구제된 획은 `reason: "ok"` · `relative: true`가 된다 — 절대 임계로 선 것이 아님을 남긴다.
 */
export function resolveByConsensus(
  verdicts: AxisVerdict[], imgSize: [number, number],
  cfg: ConsensusCfg & AxisCfg = {}, cam?: AxisCam,
): Rescue[] {
  const c = { ...CONSENSUS_TOL, ...AXIS_TOL, ...cfg };
  const field = biasField(verdicts, imgSize, cfg);
  const out: Rescue[] = [];

  verdicts.forEach((v, i) => {
    // 길이·급변·곡률로 걸린 획은 대상이 아니다 — 그것은 왜곡 문제가 아니다
    if (v.reason !== "no_axis_matches" && v.reason !== "ambiguous") return;
    if (!v.rep || !v.scores) return;
    const at = midOf(v)!;
    const tol = c.vp_dist_ratio * angleWiden(v.rep, cam, c as typeof AXIS_TOL);

    // 후보마다 국소 편향을 빼고 다시 잰다
    const fixed = v.scores.map(s => {
      const b = field.at(s.axis, at);
      if (!b || !Number.isFinite(s.signed)) return { ...s, corrected: s.m, support: 0 };
      // 이웃끼리 흩어져 있으면 왜곡이 아니라 잡음이다 — 보정하지 않는다
      if (b.spread > Math.abs(b.bias) * c.max_spread_ratio + 1e-12) {
        return { ...s, corrected: s.m, support: 0 };
      }
      return { ...s, corrected: Math.abs(s.signed - b.bias), support: b.n };
    }).sort((p, q) => p.corrected - q.corrected);

    const best = fixed[0], second = fixed[1];
    if (!best || !best.support || !Number.isFinite(best.corrected)) return;
    if (best.corrected > tol || best.m > tol * c.rescue_ceiling) return;
    // 보정 후에도 애매성 판정은 그대로 통과해야 한다
    const runnerUp = second && Number.isFinite(second.corrected) ? second.corrected : null;
    const separated = runnerUp == null
      || runnerUp > best.corrected * c.ambiguity_margin
      || runnerUp - best.corrected > c.ambiguity_floor;
    if (!separated) return;

    out.push({ index: i, axis: best.axis, before: best.m, after: best.corrected, support: best.support });
    verdicts[i] = { ...v, axis: best.axis, reason: "ok", note: "", relative: true,
                    misfit: best.corrected, runnerUp };
  });
  return out;
}
