/**
 * **L-D.0 — 롤 0 제약과 지평선 수평 고정**(사람 지시, 2026-08-16).
 *
 * 이론서 3.1: 수평면에 놓인 모든 방향의 소실점은 한 직선 위에 있고 그것이 **지평선**이다.
 * 카메라 롤이 0이면 **그 직선이 화면 수평**이다. 그러면 미지수가 하나 준다
 * (이론서 §5.3 자유도 회계: 자세 R = pan·tilt·roll 3 → 2).
 *
 * **왜 하는가**: L-A.6에서 자동 검출이 실패한 원인이 **지렛대 부족**이었다 —
 * 축당 4획에서 축 방향 오차 중앙 7.40°이고 획을 100까지 늘려도 단조로 안 준다
 * (`camera_gate.json@34db7279`의 `by_strokes_per_axis`: 7.40 / 10.04 / 10.09 / 4.53°).
 * 임계는 약 1°다. 이 제약이 미지수 하나를 없앤다.
 *
 * **세 귀결** — 전부 이론서에 근거가 있다:
 *   ① 수평 축 소실점 둘은 **같은 y**를 갖는다(= 지평선 높이 `h`). 이론서 3.1
 *   ② 첫 소실점이 잡히면 `h`가 확정되므로 **두 번째는 획 하나로 정해진다** —
 *      그 획을 연장해 `y = h`와 만나는 점이다(3획 교점 클러스터가 필요 없다)
 *   ③ 세 번째(수직) 소실점은 **수심 조건**으로 좁혀진다(이론서 6.3):
 *      주점 `P`가 삼각형 `V₁V₂V₃`의 수심이고 `V₁V₂`가 수평이므로
 *      `V₃`에서 내린 수선은 **수직선**이고 따라서 `V₃.x = P.x`.
 *      `V₁`에서 내린 수선이 `P`를 지난다는 조건이 `V₃.y`를 정한다:
 *          `(P − V₁) · (V₃ − V₂) = 0`
 *        → `(Pₓ − x₁)(Pₓ − x₂) + (P_y − h)(y₃ − h) = 0`
 *        → `y₃ = h − (Pₓ − x₁)(Pₓ − x₂) / (P_y − h)`
 *
 * ⚠ **전제는 롤 0이다.** 종이를 기울여 그리면 깨진다. A-3에 따라 **가장 단순한 쪽**
 * (롤 0 고정)으로 시작하고, 실사용에서 문제가 되면 `QUESTIONS.md` (d)로 되돌아본다.
 * ⚠ `P_y == h`(지평선이 주점을 지난다 = 피치 0 = 2점 투시)면 `y₃`가 무한대로 간다 —
 * **그것이 옳다**: 수직축이 화면 평행이 되어 소실점이 무한원이다(이론서 2.2). `null`을 낸다.
 */
import type { Pt2 } from "./camera.js";
import type { Rep } from "./axis.js";

/** 지평선 조작의 임계. **`test/constants.ts`에 등록한다**(D-C4). */
export const HORIZON_TOL = {
  /**
   * 획을 지평선으로 연장할 때 **너무 수평이면 교점이 발산한다.**
   * 획 방향과 수평선의 각이 이 값보다 작으면 두 번째 소실점을 안 낸다.
   * 값의 근거: `min_spread_mult`(1.5) × `support_deg`(2.5) = 3.75°와 같은 자리 —
   * **국소화 가능성 조건**이고 D-L7이 같은 이유로 그 배수를 골랐다.
   */
  min_slope_deg: 3.75,
  /**
   * 지평선 위 두 소실점이 **너무 가까우면** 수심 관계가 조건수를 잃는다.
   * 화면 대각 대비. 이론서 6.5의 예각 조건이 실패하는 자리와 같은 방향이다.
   */
  min_vp_sep_ratio: 0.15,
} as const;

/**
 * 소실점 하나에서 **지평선 높이**를 읽는다 — 롤 0이면 그 y가 곧 지평선이다.
 *
 * ⚠ **수평 축의 소실점이어야 한다.** 수직 축 소실점의 y는 지평선이 아니다.
 * 판별은 부르는 쪽이 한다(축 라벨이 있으면 그것으로, 없으면 `verticalOf`).
 */
export function horizonFrom(vp: Pt2): number {
  return vp[1];
}

/** 화면에서 가장 **세로**에 가까운 대표 직선을 가진 인덱스. 없으면 −1. */
export function mostVertical(reps: Rep[]): number {
  let bi = -1, bv = -1;
  reps.forEach((r, i) => {
    const dx = Math.abs(r.b[0] - r.a[0]), dy = Math.abs(r.b[1] - r.a[1]);
    const v = dx < 1e-9 ? Infinity : dy / dx;
    if (v > bv) { bv = v; bi = i; }
  });
  return bi;
}

/**
 * **획 하나 + 지평선 → 두 번째 소실점**(L-D.0 c).
 *
 * 그 획의 대표 직선을 연장해 `y = h`와 만나는 점이다. 3획 교점 클러스터가 필요 없다 —
 * 지평선이 이미 자유도 하나를 먹었기 때문이다.
 *
 * `null`을 내는 경우: 획이 **너무 수평**이라 교점이 발산할 때(`min_slope_deg`).
 * ⚠ 그때 폴백은 기존 검출이다 — 이 함수가 못 낸다고 소실점이 없는 것이 아니다.
 */
export function vpOnHorizon(
  rep: Rep, h: number, cfg: { min_slope_deg?: number } = {},
): Pt2 | null {
  const c = { ...HORIZON_TOL, ...cfg };
  const dx = rep.b[0] - rep.a[0], dy = rep.b[1] - rep.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  // 수평선과의 각(0~90°). 작으면 `y = h`와의 교점이 멀리 달아난다.
  const slope = (Math.asin(Math.min(1, Math.abs(dy) / len)) * 180) / Math.PI;
  if (slope < c.min_slope_deg) return null;
  const t = (h - rep.a[1]) / dy;
  const x = rep.a[0] + t * dx;
  return Number.isFinite(x) ? [x, h] : null;
}

/**
 * **수심 조건으로 세 번째 소실점을 낸다**(이론서 6.3, L-D.0 d).
 *
 * `V₁`·`V₂`가 지평선 위(같은 y = h)에 있고 주점 `P`가 수심일 때
 * `V₃ = (Pₓ, h − (Pₓ−x₁)(Pₓ−x₂)/(P_y−h))`.
 *
 * `null`을 내는 경우:
 *   - `P_y == h` — 피치 0이라 수직축이 **화면 평행**이다(무한원. 이론서 2.2). 2점 투시다
 *   - 두 소실점이 너무 가깝다(`min_vp_sep_ratio`) — 수심 관계의 조건수가 죽는다
 *
 * ⚠ **위/아래는 이 식이 정한다**(부호가 따라온다) — 주점이 지평선 위에 있으면
 * `P_y − h < 0`이고, `(Pₓ−x₁)(Pₓ−x₂)`는 주점이 두 소실점 **사이**에 있을 때 음수다
 * (그것이 정상 구도다). 두 음수의 몫이 양수이므로 `y₃ = h − (양수) < h`가 되어
 * **수직 소실점이 지평선 위쪽**에 온다 — 올려다보는 구도. 반대면 아래다.
 */
export function vpVerticalFromOrthocenter(
  v1: Pt2, v2: Pt2, principal: Pt2, diag: number,
  cfg: { min_vp_sep_ratio?: number } = {},
): Pt2 | null {
  const c = { ...HORIZON_TOL, ...cfg };
  if (Math.abs(v1[0] - v2[0]) < c.min_vp_sep_ratio * diag) return null;
  const h = (v1[1] + v2[1]) / 2;                    // 롤 0이면 같아야 한다
  const dy = principal[1] - h;
  if (Math.abs(dy) < 1e-6) return null;             // 피치 0 — 수직축은 무한원이다
  const y3 = h - ((principal[0] - v1[0]) * (principal[0] - v2[0])) / dy;
  return Number.isFinite(y3) ? [principal[0], y3] : null;
}

/**
 * **검출 결과를 롤 0 제약으로 사영한다**(L-D.0 a·b).
 *
 * 하는 일 셋:
 *   ① 수평 축 소실점 둘의 y를 **하나의 지평선 높이로 모은다** — 지지 수로 가중한 평균
 *   ② 수직 축 소실점의 x를 **주점의 x로 옮긴다**
 *   ③ 수직 축이 없으면 **수심 조건으로 만들어 낸다**(이론서 6.3)
 *
 * `vps`는 축 번호 순이고 **`vps[2]`가 수직축**이다(`orderVps`의 관례).
 * `null`은 그 축의 소실점이 무한원(화면 평행)이라는 뜻이고 **그대로 둔다** —
 * 롤 0 제약은 무한원 판정을 바꾸지 않는다.
 *
 * ⚠ **주점을 이미지 중심으로 가정한다**(이론서 16.2 · AS-C5). 그 가정이 여기 들어간다는
 * 사실이 결론에 붙는다 — `fSource`가 화면에 나오는 것과 같은 이유다(CLAUDE.md §1).
 */
export interface RollZeroResult {
  vps: (Pt2 | null)[];
  /** 확정된 지평선 높이(화면 y). 수평 소실점이 하나도 없으면 `null`. */
  horizon: number | null;
  /** 이 사영이 실제로 한 일 — **0이면 제약이 아무것도 안 했다**(#32). */
  applied: { horizon_merged: number; vertical_x_moved: boolean; vertical_synthesized: boolean };
  /** 사영 전후 소실점 이동량(px). 0이면 검출이 이미 롤 0을 만족한 것이다. */
  shiftPx: number[];
}

export function applyRollZero(
  vps: (Pt2 | null)[], principal: Pt2, imgSize: [number, number],
  weights?: (number | null)[], cfg: { min_vp_sep_ratio?: number } = {},
): RollZeroResult {
  const diag = Math.hypot(imgSize[0], imgSize[1]);
  const out = vps.slice();
  const before = vps.map(v => (v ? ([v[0], v[1]] as Pt2) : null));
  const applied = { horizon_merged: 0, vertical_x_moved: false, vertical_synthesized: false };

  // ① 수평 축(0·1)의 y를 하나로 모은다 — 지지 수로 가중한다(획이 많은 쪽이 더 믿을 만하다)
  const hIdx = [0, 1].filter(i => out[i]);
  let horizon: number | null = null;
  if (hIdx.length) {
    let sw = 0, sy = 0;
    for (const i of hIdx) {
      const w = Math.max(1, weights?.[i] ?? 1);
      sw += w; sy += w * out[i]![1];
    }
    horizon = sy / sw;
    for (const i of hIdx) out[i] = [out[i]![0], horizon];
    applied.horizon_merged = hIdx.length;
  }

  // ② 수직 축의 x를 주점의 x로 — 롤 0이면 수직선의 소실점은 주점 바로 위/아래다
  if (out[2]) {
    out[2] = [principal[0], out[2]![1]];
    applied.vertical_x_moved = true;
  } else if (out[0] && out[1] && horizon !== null) {
    // ③ 없으면 수심 조건으로 만든다(6.3). **못 만들면 null 그대로** — 2점 투시다
    const v = vpVerticalFromOrthocenter(out[0]!, out[1]!, principal, diag, cfg);
    if (v) { out[2] = v; applied.vertical_synthesized = true; }
  }

  const shiftPx = out.map((v, i) => {
    const b = before[i];
    return v && b ? Math.hypot(v[0] - b[0], v[1] - b[1]) : 0;
  });
  return { vps: out, horizon, applied, shiftPx };
}

/**
 * **제약 아래에서 두 수평 소실점을 다시 적합한다**(L-D.0 a의 올바른 형태).
 *
 * ⚠ **사영과 다르다.** `applyRollZero`는 이미 나온 소실점의 y를 나중에 맞춘다 — 그러면
 * 소실점이 **자기 지지선에서 벗어나고** 그 뒤 `liftAll`의 정합성 검사가 전부 거절한다.
 * 실측으로 그렇게 됐다(배치 2049 → 792). **미실행을 반증으로 처리하지 않으려면**(#32)
 * 제약을 **적합 안에** 넣은 판을 함께 재야 한다. 그것이 이 함수다.
 *
 * 미지수 셋 `(x₁, x₂, h)`를 **한 번의 최소제곱**으로 푼다. 직선 `i`를 단위법선 `nᵢ`와
 * `cᵢ = nᵢ·aᵢ`로 적으면 점 `p`의 잔차가 `nᵢ·p − cᵢ`이고, 지지 집합 A는 `(x₁, h)`를,
 * B는 `(x₂, h)`를 쓴다. 가중은 **길이²**다(D-L5와 같은 근거 — 짧은 획의 방향 분산이 `1/len²`).
 *
 * 정규방정식은 3×3이고 직접 푼다(외부 의존 없음). 특이하면 `null`.
 */
export function fitHorizonPair(supA: Rep[], supB: Rep[]): { v1: Pt2; v2: Pt2; h: number } | null {
  if (supA.length < 2 || supB.length < 2) return null;
  // 미지수 순서: [x1, x2, h]
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const r = [0, 0, 0];
  const add = (rep: Rep, xi: 0 | 1) => {
    const dx = rep.b[0] - rep.a[0], dy = rep.b[1] - rep.a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) return;
    const nx = -dy / L, ny = dx / L;                 // 단위 법선
    const c = nx * rep.a[0] + ny * rep.a[1];
    const w = L * L;                                 // 길이² 가중(D-L5)
    // 잔차 = nx·x_i + ny·h − c  → 계수 벡터 g
    const g = [0, 0, ny];
    g[xi] = nx;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) M[i][j] += w * g[i] * g[j];
      r[i] += w * g[i] * c;
    }
  };
  for (const s of supA) add(s, 0);
  for (const s of supB) add(s, 1);

  // 3×3 가우스 소거(부분 피벗)
  const A = M.map((row, i) => [...row, r[i]]);
  for (let k = 0; k < 3; k++) {
    let p = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) < 1e-12) return null;      // 특이 — 지지 방향이 못 편다
    [A[k], A[p]] = [A[p], A[k]];
    for (let i = k + 1; i < 3; i++) {
      const f = A[i][k] / A[k][k];
      for (let j = k; j < 4; j++) A[i][j] -= f * A[k][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = A[i][3];
    for (let j = i + 1; j < 3; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  if (!x.every(Number.isFinite)) return null;
  return { v1: [x[0], x[2]], v2: [x[1], x[2]], h: x[2] };
}
