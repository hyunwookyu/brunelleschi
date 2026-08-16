/**
 * ⛔ **폐기된 경로 — 배선하지 않는다.** D-L32(롤 0 사후 사영) 기각의 **근거 재현용**이다.
 *
 * L-D.0이 검출된 두 소실점에 수평을 **사후로 강제**했고 배치가 2049 → 792로 무너졌다.
 * 위약 팔(같은 크기의 임의 방향 이동)도 똑같이 무너져, 재던 것이 "롤 0"이 아니라
 * **"해를 80px 옮기는 것"**이었음이 드러났다(PITFALLS #39).
 *
 * **지우지 않는 이유**: 지우면 그 판정의 근거를 다시 만들 수 없다(CLAUDE.md의 폐기 코드 규칙).
 * `web/test/horizon.test.ts`가 이것을 부르고 `stage0/out/horizon.json`을 낸다.
 *
 * **바른 순서는 `horizon.ts`에 있다** — 첫 소실점이 지평선을 정의하고 두 번째가 거기 놓인다.
 * 그 파일이 앱에 배선된 것이고, 이 파일은 아니다.
 */
import type { Pt2 } from "./camera.js";
import type { Rep } from "./axis.js";
import { HORIZON_TOL, vpVerticalFromOrthocenter } from "./horizon.js";

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
  /** **y 성분만**의 이동량(px). 지평선 어긋남의 직접 지표다 — `shiftPx`는 x 이동을 포함한다. */
  shiftDy: number[];
}

export function applyRollZero(
  vps: (Pt2 | null)[], principal: Pt2, imgSize: [number, number],
  weights?: (number | null)[], cfg: { min_vp_sep_ratio?: number } = {},
  /**
   * **무한원 수직축에 V₃를 합성하지 않는다**(리뷰어 [2], 2026-08-16).
   * 2pt·1pt 구도에서는 수직축의 소실점이 **없는 것이 옳다**(이론서 2.2, c=0).
   * 그런데 잡음이 `P_y − h`를 0이 아니게 만들면 수심 식이 **거대한 유한 V₃**를 낸다 —
   * 그것을 카메라에 넣으면 2점 장면이 3점으로 읽힌다(D-L7이 같은 이유로 만든 조건).
   */
  noSynthesize = false,
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
  } else if (!noSynthesize && out[0] && out[1] && horizon !== null) {
    // ③ 없으면 수심 조건으로 만든다(6.3). **못 만들면 null 그대로** — 2점 투시다
    const v = vpVerticalFromOrthocenter(out[0]!, out[1]!, principal, diag, cfg);
    if (v) { out[2] = v; applied.vertical_synthesized = true; }
  }

  const shiftPx = out.map((v, i) => {
    const b = before[i];
    return v && b ? Math.hypot(v[0] - b[0], v[1] - b[1]) : 0;
  });
  const shiftDy = out.map((v, i) => {
    const b = before[i];
    return v && b ? Math.abs(v[1] - b[1]) : 0;
  });
  return { vps: out, horizon, applied, shiftPx, shiftDy };
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
