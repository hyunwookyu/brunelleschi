// W-0/W-2 획 → 엣지 — 계획서 §6.2 처리. **측정 대상이자 앱에 들어갈 코드**(DECISIONS D-A5).
//
// 평면 파서의 `recognizeRectilinear`는 지배 프레임(축 정렬)을 잡아 H/V 런으로 자른다.
// 투시에서는 못 쓴다 — 엣지는 소실점 방향으로 가므로 화면상 각도가 제각각이다.
// 여기서는 **프레임 없이** 방향 변화만으로 코너를 잡는다.
//
// 용어
//   run     코너와 코너 사이의 한 구간. 직선이면 엣지 후보 하나.
//   residual 그 구간 원본 점들의 최대 수직편차 ÷ 구간 길이. 휘었으면 커진다.
import type { Pt } from "../parser/types.js";
import { resample, gaussianSmooth1d, hypot, ptSegDist } from "../parser/geometry.js";

export const WIRE_TOL = {
  resample: 3.0,        // 리샘플 간격(px)
  // 평활·코너 임계는 **스윕으로 골랐다**(W-0, stage0/out/corner_tol_sweep.json).
  // 24개 격자에서 규칙: ① 없는 코너 생성 ≤0.02 ② 합성 exact 최대 ③ 동점이면 평활 큰 쪽.
  // 초기값(35°/2.0)은 얕은 코너(45~70°)를 절반 넘게 놓쳤다 — exact 0.71, shallow 0.25.
  // 10°까지 내리면 다시 나빠진다(exact 0.86, spurious 0.05) → 20°는 격자 끝이 아닌 내부 최적.
  smooth_sigma: 1.5,    // 코너 검출 전 평활. 실획 고주파(방향각 중앙 1.6~1.9°)를 지우되 코너는 남긴다
  turn_window: 4,       // 방향 추정 창(리샘플 점 수)
  corner_deg: 20,       // 이 각을 넘는 방향 변화 = 코너
  min_corner_sep: 5,    // 코너 사이 최소 점 수(같은 코너의 중복 검출 방지)
  // 이보다 짧은 런은 코너 잡음으로 보고 흡수. **획 경로 길이 대비 비율**이다.
  // 절대 픽셀로 두면 확대·해상도·도형 크기에 따라 다른 것을 재게 된다 —
  // 폐기된 `GRADE_NOISE={2,8,20}px`가 정확히 그 결함이었다(assumptions V-s).
  min_run_ratio: 0.05,
  // 이것만 절대값이다: 입력 장치가 낸 점 몇 개짜리 탭을 획으로 보지 않기 위한 바닥.
  // 도형 크기가 아니라 **입력 해상도**의 문제이므로 비율로 바꾸면 안 된다.
  tap_px: 8,
  // residual 이 이하면 직선으로 본다. 실측 저주파 활(lf_bow σ: precise 0.031 /
  // medium 0.056 / coarse 0.094 — 변 길이 대비)을 넘겨야 하므로 0.05로는 precise 획도
  // 11% 탈락한다. 0.10은 **1/4원(0.207)보다 얕은 호를 직선으로 읽는다**는 대가를 진다.
  // 얕은 호와 휜 직선은 실제로 구분 불가에 가깝고, 이 도구의 범위는 직선이다.
  straight_tol: 0.10,
};
export type WireCfg = Partial<typeof WIRE_TOL>;

export interface Seg { a: Pt; b: Pt; len: number; residual: number; straight: boolean; }
export type StrokeKind = "dot" | "line" | "polyline" | "curve";
export interface StrokeParse {
  kind: StrokeKind;
  runs: Seg[];
  corners: Pt[];
  pathLen: number;
  /** 끝점 직선거리 ÷ 경로길이. 1에 가까우면 곧다(등급 판정과 같은 양). */
  directness: number;
}

function smoothPath(rs: Pt[], sigma: number): Pt[] {
  if (sigma <= 0 || rs.length < 5) return rs.slice();
  const xs = gaussianSmooth1d(rs.map(p => p[0]), sigma);
  const ys = gaussianSmooth1d(rs.map(p => p[1]), sigma);
  return xs.map((x, i) => [x, ys[i]] as Pt);
}

export function pathLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** 창 기반 방향 변화각(도). 프레임을 쓰지 않으므로 투시 방향에 무관하다. */
function turnAngles(rs: Pt[], w: number): number[] {
  const n = rs.length, out = new Array(n).fill(0);
  for (let i = w; i < n - w; i++) {
    const ax = rs[i][0] - rs[i - w][0], ay = rs[i][1] - rs[i - w][1];
    const bx = rs[i + w][0] - rs[i][0], by = rs[i + w][1] - rs[i][1];
    const la = hypot(ax, ay), lb = hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    out[i] = Math.acos(cos) * 180 / Math.PI;
  }
  return out;
}

/** 한 구간의 최대 수직편차 ÷ 길이. 직선 적합의 잔차를 정규화한 것. */
function residualRatio(pts: Pt[], i0: number, i1: number): { len: number; residual: number } {
  const a = pts[i0], b = pts[i1];
  const len = hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return { len: 0, residual: 0 };
  let m = 0;
  for (let k = i0 + 1; k < i1; k++) m = Math.max(m, ptSegDist(pts[k], a, b));
  return { len, residual: m / len };
}

/**
 * 획 하나 → 직선 런들. **코너 검출은 방향 변화의 국소 최대만 채택**한다
 * (임계를 넘는 점을 전부 코너로 쓰면 한 코너가 창 폭만큼 중복된다).
 */
export function parseStroke(points: Pt[], cfg: WireCfg = {}): StrokeParse {
  const c = { ...WIRE_TOL, ...cfg };
  const raw = points.map(p => [p[0], p[1]] as Pt);
  const total = pathLength(raw);
  if (raw.length < 2 || total < c.tap_px) {
    return { kind: "dot", runs: [], corners: [], pathLen: total, directness: 1 };
  }
  const rs0 = resample(raw, c.resample);
  if (rs0.length < 3) {
    const len = hypot(rs0[rs0.length - 1][0] - rs0[0][0], rs0[rs0.length - 1][1] - rs0[0][1]);
    const seg: Seg = { a: rs0[0], b: rs0[rs0.length - 1], len, residual: 0, straight: true };
    return { kind: "line", runs: [seg], corners: [], pathLen: total, directness: 1 };
  }
  return parseResampled(rs0, c, total);
}

function parseResampled(rs0: Pt[], c: typeof WIRE_TOL, total: number): StrokeParse {
  const minRun = Math.max(c.tap_px * 0.5, c.min_run_ratio * total);
  const rs = smoothPath(rs0, c.smooth_sigma);
  const n = rs.length;
  const chord = hypot(rs[n - 1][0] - rs[0][0], rs[n - 1][1] - rs[0][1]);
  const directness = total > 1e-9 ? chord / total : 1;

  const w = Math.max(2, Math.floor(c.turn_window));
  const turns = turnAngles(rs, w);
  // 국소 최대만 코너로 채택 + 최소 간격
  const corners: number[] = [];
  for (let i = w; i < n - w; i++) {
    if (turns[i] < c.corner_deg) continue;
    let isMax = true;
    for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) {
      if (turns[k] > turns[i]) { isMax = false; break; }
    }
    if (!isMax) continue;
    if (corners.length && i - corners[corners.length - 1] < c.min_corner_sep) continue;
    corners.push(i);
  }

  // 런 구성 + 너무 짧은 런 흡수
  let bounds = [0, ...corners, n - 1];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = 1; k < bounds.length - 1; k++) {
      const L = hypot(rs[bounds[k]][0] - rs[bounds[k - 1]][0], rs[bounds[k]][1] - rs[bounds[k - 1]][1]);
      if (L < minRun) { bounds.splice(k, 1); changed = true; break; }
    }
    if (!changed) break;
  }
  const lastL = bounds.length >= 2
    ? hypot(rs[bounds[bounds.length - 1]][0] - rs[bounds[bounds.length - 2]][0],
            rs[bounds[bounds.length - 1]][1] - rs[bounds[bounds.length - 2]][1])
    : 0;
  if (bounds.length > 2 && lastL < minRun) bounds.splice(bounds.length - 2, 1);

  const runs: Seg[] = [];
  for (let k = 1; k < bounds.length; k++) {
    const { len, residual } = residualRatio(rs, bounds[k - 1], bounds[k]);
    if (len < 1e-9) continue;
    runs.push({
      a: rs[bounds[k - 1]], b: rs[bounds[k]], len, residual,
      straight: residual <= c.straight_tol,
    });
  }
  const cornerPts = bounds.slice(1, -1).map(i => rs[i]);

  let kind: StrokeKind;
  if (!runs.length) kind = "dot";
  else if (runs.some(r => !r.straight)) kind = "curve";
  else if (runs.length === 1) kind = "line";
  else kind = "polyline";

  return { kind, runs, corners: cornerPts, pathLen: total, directness };
}

// ---------------------------------------------------------------- 덧그림(같은 위치 재방문)

/** 두 선분의 각도차(0~90°). 방향(부호)은 무시한다 — 되돌아 그은 덧그림도 같은 엣지다. */
export function segAngleDiff(p: Seg, q: Seg): number {
  const ap = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
  const aq = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]);
  let d = Math.abs(ap - aq) * 180 / Math.PI % 180;
  return d > 90 ? 180 - d : d;
}

export interface OvertraceScore { angle: number; dist: number; overlap: number; merge: boolean; }

// dist_ratio 는 **벽 두께와 덧그림을 가르는 띠**다. 덧그림은 보통 길이의 2% 안쪽으로
// 어긋나고, 벽 두께 두 줄은 그보다 멀다. 0.05로 두면 200px 변 기준 10px 이상 떨어진
// 나란한 선은 접히지 않는다. **그보다 얇은 벽은 한 줄로 접힌다**(DEFERRED 기록).
export const OVERTRACE_TOL = { angle_deg: 18, dist_ratio: 0.05, overlap: 0.45 };

/**
 * q가 p를 덧그린 것인가. 세 조건을 **함께** 본다.
 *   angle   방향이 같은가
 *   dist    짧은 쪽 끝점들이 긴 쪽 선에서 얼마나 떨어져 있는가 (긴 쪽 길이 대비)
 *   overlap 긴 쪽에 사영했을 때 겹치는 구간 비율
 * 셋 중 하나만 보면 평행한 다른 엣지(벽 두께 두 줄)를 같은 것으로 본다.
 */
export function overtraceScore(p: Seg, q: Seg, tol = OVERTRACE_TOL): OvertraceScore {
  const angle = segAngleDiff(p, q);
  const [lo, hi] = p.len >= q.len ? [q, p] : [p, q];
  const dx = hi.b[0] - hi.a[0], dy = hi.b[1] - hi.a[1];
  const L2 = dx * dx + dy * dy || 1e-12;
  const proj = (pt: Pt) => ((pt[0] - hi.a[0]) * dx + (pt[1] - hi.a[1]) * dy) / L2;
  const t0 = proj(lo.a), t1 = proj(lo.b);
  const dist = Math.max(ptSegDist(lo.a, hi.a, hi.b), ptSegDist(lo.b, hi.a, hi.b)) / hi.len;
  const ov = Math.max(0, Math.min(1, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)));
  const overlap = ov / Math.max(1e-9, Math.abs(t1 - t0));
  return {
    angle, dist, overlap,
    merge: angle <= tol.angle_deg && dist <= tol.dist_ratio && overlap >= tol.overlap,
  };
}

/** 덧그림 그룹 묶기 — 대표 엣지 하나로 접는다. 반환: 각 seg의 그룹 번호. */
export function groupOvertraces(segs: Seg[], tol = OVERTRACE_TOL): number[] {
  const g = segs.map((_, i) => i);
  const find = (i: number): number => (g[i] === i ? i : (g[i] = find(g[i])));
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++)
      if (overtraceScore(segs[i], segs[j], tol).merge) g[find(j)] = find(i);
  return segs.map((_, i) => find(i));
}

// ---------------------------------------------------------------- 지나침(교차점을 넘어 그은 것)

export const OVERSHOOT_MAX = 0.25;   // 꼬리가 이보다 길면 지나침이 아니라 의도된 십자 교차다

export interface Overshoot { seg: number; other: number; tail: number; tailPx: number; }

/**
 * seg가 other와 교차한 뒤 **조금 더 나간** 경우를 센다.
 * 꼬리 비율 tail = min(t, 1-t). 0에 가까울수록 끝점이 교차점 바로 뒤에서 멈춘 것.
 * tail 이 크면(≈0.5) 두 선이 가운데서 만난 것이므로 지나침이 아니다.
 */
export function overshoots(segs: Seg[], maxTail = OVERSHOOT_MAX): Overshoot[] {
  const out: Overshoot[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const t = crossParam(segs[i], segs[j]);
      if (t == null) continue;
      const [ti, tj] = t;
      if (ti <= 0 || ti >= 1 || tj < 0 || tj > 1) continue;   // 둘 다 실제로 만나야 한다
      const tail = Math.min(ti, 1 - ti);
      if (tail > 0 && tail <= maxTail) out.push({ seg: i, other: j, tail, tailPx: tail * segs[i].len });
    }
  }
  return out;
}

/** 두 선분의 교차 매개변수 (t_p, t_q). 평행이면 null. */
export function crossParam(p: Seg, q: Seg): [number, number] | null {
  const r = [p.b[0] - p.a[0], p.b[1] - p.a[1]];
  const s = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const qp = [q.a[0] - p.a[0], q.a[1] - p.a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return [t, u];
}

// ---------------------------------------------------------------- 양방향 적합도 (W-0 2차)
//
// **왜 또 지표를 만드는가**: 1획=1엣지는 검출기가 둔감할수록 오르고(코너를 놓쳐 런이 하나가 된다),
// 덮임률은 검출기가 과민할수록 오른다(잘게 쪼갤수록 직선 런이 늘어난다). 둘 다 **한쪽으로만**
// 속는다. 리뷰어가 두 번째 결함을 짚었고, 실제로 스윕에서 임계 10°(없는 코너 0.05)가
// 덮임률에서는 채택안을 이긴다.
//
// 양쪽을 동시에 벌하는 양은 하나뿐이다: **같은 허용오차를 지키는 데 필요한 최소 엣지 수**와
// 검출기가 실제로 낸 엣지 수의 비교. 잘게 쪼개면 detected가 늘고, 놓치면 조각이 허용오차를
// 못 지켜 minimal이 늘어난다. **정답 라벨이 필요 없다** — 실획에서 바로 잰다(V-o 준수).

/**
 * 최소 분할 (DP). 모든 조각이 `straight_tol`을 지키는 가장 적은 분할 수.
 *
 * 소박한 O(n³)(모든 (i,j) 쌍마다 편차를 다시 재는 것)은 실획 수백 장에서 못 쓴다.
 * 두 가지로 줄인다: ① i에서 j를 늘리며 **편차를 누적**해 재계산을 피한다
 * ② 한 번 허용오차를 넘고 나면 더 늘려도 대개 못 돌아오므로 **연속 초과 K회에서 끊는다**.
 * ②는 근사이지만 한쪽으로만 틀린다 — 최소분할을 **과대**평가할 수 있고 과소평가하지 않는다.
 * 과대평가는 검출기를 유리하게 만들지 않는다(detected가 minimal보다 작아져 under_fit이 된다).
 */
const MIN_SEG_GIVEUP = 12;

export function minimalSegments(points: Pt[], cfg: WireCfg = {}): { n: number; feasible: boolean } {
  const c = { ...WIRE_TOL, ...cfg };
  // **검출기와 같은 전처리를 거쳐야 한다.** 평활 전 원본에서 재면 detected와 minimal이
  // 서로 다른 곡선에서 나온 값이 되어 비교가 성립하지 않는다.
  // (리뷰어가 out_of_scope_rate가 21개 설정 전부에서 소수점 넷째 자리까지 같은 것을 보고
  //  이 비대칭을 짚었다 — σ가 바뀌어도 값이 안 움직이면 σ를 안 쓰고 있다는 뜻이다.)
  const rs = smoothPath(resample(points.map(p => [p[0], p[1]] as Pt), c.resample), c.smooth_sigma);
  const n = rs.length;
  if (n < 3) return { n: 1, feasible: true };
  const INF = 1e9;
  const dp = new Array<number>(n).fill(INF);
  dp[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    if (dp[i] >= INF) continue;
    let bad = 0;
    for (let j = i + 1; j < n; j++) {
      const { len, residual } = segResidual(rs, i, j);
      const ok = len >= c.tap_px && residual <= c.straight_tol;
      if (ok) {
        bad = 0;
        if (dp[i] + 1 < dp[j]) dp[j] = dp[i] + 1;
      } else if (len >= c.tap_px) {
        if (++bad >= MIN_SEG_GIVEUP) break;
      }
    }
  }
  return dp[n - 1] >= INF ? { n: 0, feasible: false } : { n: dp[n - 1], feasible: true };
}

function segResidual(pts: Pt[], i0: number, i1: number): { len: number; residual: number } {
  const a = pts[i0], b = pts[i1];
  const len = hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return { len: 0, residual: 0 };
  let m = 0;
  for (let k = i0 + 1; k < i1; k++) m = Math.max(m, ptSegDist(pts[k], a, b));
  return { len, residual: m / len };
}

export interface Fidelity {
  detected: number; minimal: number; feasible: boolean;
  verdict: "optimal" | "over_split" | "under_fit" | "out_of_scope";
}

/**
 * 검출기가 낸 엣지 수 ↔ 허용오차를 지키는 최소 엣지 수.
 *   optimal      같다 — 잉크가 딱 그만큼의 엣지다
 *   over_split   더 많다 — 떨림을 코너로 오인해 쪼갰다
 *   under_fit    더 적다 — 코너를 놓쳐 허용오차를 못 지키는 조각이 남았다
 *   out_of_scope 어떤 분할로도 허용오차를 못 지킨다 = 곡선. 이 도구의 범위 밖(§1.2)
 */
export function fidelity(points: Pt[], cfg: WireCfg = {}): Fidelity {
  const pr = parseStroke(points, cfg);
  const m = minimalSegments(points, cfg);
  const detected = pr.runs.length;
  if (!m.feasible) return { detected, minimal: 0, feasible: false, verdict: "out_of_scope" };
  const verdict = detected === m.n ? "optimal" : detected > m.n ? "over_split" : "under_fit";
  return { detected, minimal: m.n, feasible: true, verdict };
}
