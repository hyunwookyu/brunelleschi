// L-A **카메라 일괄 적합** — 계획서 §5.1 "카메라는 최소제곱으로 다시 푼다"의 실제 구현.
//
// **왜 필요한가 — 측정이 가리켰다.** `lift_gate.json`의 기준 동작점(3점 요35°·피치15°,
// 끝점 오차 ≤0.01)에서
// ```
// 참 카메라   → 조용히 틀린 배치 0.079   형태 오차 중앙 0.026
// 검출 카메라 → 조용히 틀린 배치 0.641   형태 오차 중앙 0.271     (f 상대오차 중앙 0.076)
// ```
// **올리기는 맞고 카메라가 틀렸다.** AS-C4가 예고한 그대로다 — f 오차는 전역 배율 편향이라
// 화면에서는 안 보이고 돌리면 보인다. 그리고 **교점 잔차로는 잡을 수 없다**(f를 ±20% 틀리게
// 줘도 잔차가 안 움직인다. 입사 관계는 사영 불변이므로 원리적으로 그렇다).
//
// ---------------------------------------------------------------- 무엇을 고치는가
//
// 이전 경로는 소실점을 **하나씩 따로** 최소제곱으로 맞춘 뒤 수심으로 f를 냈다
// (6개 자유도 → 자유도 0의 수심 공식). 그러면 세 소실점이 **직교 방향쌍이라는 조건**이
// 적합에 들어가지 않고, 각 소실점의 잡음이 f로 그대로 넘어간다.
//
// 여기서는 **카메라를 직접 매개화한다** — 회전 R(3) + 초점거리 f(1), 주점은 이미지 중심 가정
// (이론서 16.2, AS-C5). 획 12개가 4개 미지수를 정하므로 조건수가 크게 좋아진다.
//
// **잔차는 소실점을 거치지 않는다.** 획 하나의 3D 직선은 해석 평면(눈+화면 직선) 안에 있으므로
// 그 평면의 법선 `n`과 축 방향 `d`가 **수직**이어야 한다:
// ```
// r_i = n_i(f) · d_{axis(i)}        (= 평면과 축이 이루는 각의 sin)
// ```
// 유한 소실점과 무한원 소실점을 **같은 식으로** 다룬다(c=0 축도 자연히 들어온다, 이론서 2.2).
// 가중은 길이²다 — 짧은 획의 방향 분산이 `1/len²`에 비례한다(`vpDetect.fitVp`와 같은 근거).
//
// 최소화는 **Nelder-Mead**로 한다. 미분을 손으로 쓰지 않고, 4차원이라 충분히 빠르며
// 결정론적이다(`Math.random` 금지, AS-C9).
import type { Pt2 } from "./camera.js";
import type { Axis, Rep } from "./axis.js";
import { orthonormalize3, type Mat } from "../parser/linalg.js";
import {
  rayThrough, axisDirection, unit3, cross3, sub3, add3, mul3, dot3, norm3, type Vec3,
} from "./geom3d.js";

export interface FitLine { id: string; rep: Rep; axis: 0 | 1 | 2 }

export interface FitResult {
  ok: boolean;
  f: number;
  principal: Pt2;
  /** 세 축의 3D 방향(정규직교). `vps`가 아니라 이것이 결과의 본체다. */
  axes: [Vec3, Vec3, Vec3];
  /** 각 축의 소실점. `z`가 0에 가까우면 무한원이므로 `null`(화면 평행, c=0). */
  vps: (Pt2 | null)[];
  /** 가중 잔차 제곱합(적합 목적함수). */
  cost: number;
  /** 획별 잔차 각(도) — 평면과 축이 이루는 각. 진단용. */
  residDeg: number[];
  iters: number;
  /** 초기값에서 얼마나 움직였는가(도, f 비율). 크면 초기 추정이 나빴다는 뜻이다. */
  moved: { rotDeg: number; fRatio: number };
}

export const FIT_TOL = {
  /** Nelder-Mead 반복 상한. 4차원이라 이 정도면 충분히 수렴한다. */
  max_iters: 400,
  /** 단순체 크기가 이보다 작아지면 멈춘다(회전 라디안·log f 공통 척도). */
  tol: 1e-7,
  /** 초기 단순체의 한 변 — 회전 성분(라디안). 5.7° 정도. */
  step_rot: 0.1,
  /** 초기 단순체의 한 변 — log f 성분. 10% 정도. */
  step_logf: 0.1,
  /**
   * **f가 이 배수를 넘게 움직이면 적합을 버린다.** 초기 추정이 나쁠 때 최소화가
   * 화각이 말이 안 되는 곳으로 달아나는 것을 막는다 — 그러면 조용히 틀린 카메라가 된다(A-3).
   */
  f_ratio_max: 3.0,
};
export type FitCfg = Partial<typeof FIT_TOL>;

/** 회전 벡터(로드리게스) → 3×3 행렬. */
function expmSO3(w: Vec3): Mat {
  const th = norm3(w);
  if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = mul3(w, 1 / th), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  const [x, y, z] = k;
  return [
    [c + t * x * x, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, c + t * y * y, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, c + t * z * z],
  ];
}
const applyM = (M: Mat, v: Vec3): Vec3 =>
  [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
   M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
   M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];

/** 해석 평면 법선 — **f에 의존한다**(그래서 f가 목적함수에 들어온다). */
function planeNormal(rep: Rep, principal: Pt2, f: number): Vec3 | null {
  const n = cross3(rayThrough(rep.a, principal, f), rayThrough(rep.b, principal, f));
  return norm3(n) < 1e-12 ? null : unit3(n);
}

/**
 * **초기 축 방향** — 검출된 소실점에서 얻고 **정규직교화한다**.
 * 소실점이 없는 축(화면 평행)은 나머지 둘의 외적으로 채운다. 셋 다 없으면 실패다.
 */
export function initialAxes(
  vps: (Pt2 | null)[], principal: Pt2, f: number,
): [Vec3, Vec3, Vec3] | null {
  const raw: (Vec3 | null)[] = vps.map(v => (v ? axisDirection(v, principal, f) : null));
  const known = raw.filter((d): d is Vec3 => !!d && norm3(d) > 1e-9);
  if (!known.length) return null;
  if (known.length === 1) {
    // 축 하나만 안다(1점 투시) — 나머지 둘은 화면 평행이므로 화면 축으로 채운다
    const d = unit3(known[0]);
    let u = cross3(d, [0, 1, 0]);
    if (norm3(u) < 1e-6) u = cross3(d, [1, 0, 0]);
    u = unit3(u);
    const v = unit3(cross3(d, u));
    const out: (Vec3 | null)[] = [null, null, null];
    const i0 = raw.findIndex(x => !!x);
    out[i0] = d;
    const rest = [0, 1, 2].filter(i => i !== i0);
    out[rest[0]] = u; out[rest[1]] = v;
    return out as [Vec3, Vec3, Vec3];
  }
  if (known.length === 2) {
    const missing = raw.findIndex(x => !x);
    const filled = raw.slice();
    const others = [0, 1, 2].filter(i => i !== missing);
    filled[missing] = unit3(cross3(raw[others[0]]!, raw[others[1]]!));
    return orthonormalize3(filled.map(d => unit3(d!)) as Mat) as [Vec3, Vec3, Vec3];
  }
  return orthonormalize3(raw.map(d => unit3(d!)) as Mat) as [Vec3, Vec3, Vec3];
}

/** 축 방향 → 소실점. `z`가 0에 가까우면 무한원(화면 평행)이므로 `null`. */
export function vpOf(d: Vec3, principal: Pt2, f: number, zMin = 1e-3): Pt2 | null {
  if (Math.abs(d[2]) < zMin) return null;
  return [principal[0] + (f * d[0]) / d[2], principal[1] + (f * d[1]) / d[2]];
}

/**
 * **카메라를 획 전부로 한 번에 맞춘다.** 미지수는 회전 3 + f 1이고 주점은 이미지 중심 가정이다.
 *
 * 입력은 **축이 배정된 획**이다(검출의 지지 집합). 배정이 틀린 획이 섞이면 적합이 끌려가므로
 * 호출자가 `screen`·`free`를 빼고 넣는다.
 */
export function fitCamera(
  lines: FitLine[], vps0: (Pt2 | null)[], f0: number, imgSize: [number, number],
  cfg: FitCfg = {},
): FitResult {
  const c = { ...FIT_TOL, ...cfg };
  const principal: Pt2 = [imgSize[0] / 2, imgSize[1] / 2];
  const fail: FitResult = {
    ok: false, f: f0, principal, axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], vps: [null, null, null],
    cost: Infinity, residDeg: [], iters: 0, moved: { rotDeg: 0, fRatio: 1 },
  };
  const A0 = initialAxes(vps0, principal, f0);
  if (!A0 || !(f0 > 0) || lines.length < 2) return fail;

  const used = lines.filter(L => L.rep.len > 1e-6);
  if (used.length < 2) return fail;

  /** 매개변수 p = [ωx, ωy, ωz, ln(f/f0)] → 축·f. */
  const unpack = (p: number[]): { axes: [Vec3, Vec3, Vec3]; f: number } => {
    const R = expmSO3([p[0], p[1], p[2]]);
    return {
      axes: [applyM(R, A0[0]), applyM(R, A0[1]), applyM(R, A0[2])] as [Vec3, Vec3, Vec3],
      f: f0 * Math.exp(p[3]),
    };
  };
  const cost = (p: number[]): number => {
    const { axes, f } = unpack(p);
    if (!(f > 0) || f / f0 > c.f_ratio_max || f0 / f > c.f_ratio_max) return Infinity;
    let s = 0;
    for (const L of used) {
      const n = planeNormal(L.rep, principal, f);
      if (!n) return Infinity;
      const r = dot3(n, axes[L.axis]);
      s += L.rep.len * L.rep.len * r * r;               // 길이² 가중
    }
    return s;
  };

  // ---- Nelder-Mead (4차원). 결정론적이고 미분이 필요 없다
  const n = 4;
  const simplex: number[][] = [[0, 0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const p = [0, 0, 0, 0];
    p[i] = i < 3 ? c.step_rot : c.step_logf;
    simplex.push(p);
  }
  let fv = simplex.map(cost);
  let iters = 0;
  const centroidOf = (idx: number[]) => {
    const m = [0, 0, 0, 0];
    for (const i of idx) for (let k = 0; k < n; k++) m[k] += simplex[i][k] / idx.length;
    return m;
  };
  const comb = (a: number[], b: number[], t: number) => a.map((v, k) => v + t * (b[k] - v));
  for (; iters < c.max_iters; iters++) {
    const order = fv.map((v, i) => i).sort((a, b) => fv[a] - fv[b]);
    const best = order[0], worst = order[n], second = order[n - 1];
    let spread = 0;
    for (let k = 0; k < n; k++) {
      spread = Math.max(spread, Math.abs(simplex[worst][k] - simplex[best][k]));
    }
    if (spread < c.tol) break;
    const m = centroidOf(order.slice(0, n));
    const refl = comb(m, simplex[worst], -1);                // 반사
    const fr = cost(refl);
    if (fr < fv[second]) {
      if (fr < fv[best]) {
        const exp = comb(m, simplex[worst], -2);              // 확장
        const fe = cost(exp);
        if (fe < fr) { simplex[worst] = exp; fv[worst] = fe; continue; }
      }
      simplex[worst] = refl; fv[worst] = fr; continue;
    }
    const con = comb(m, simplex[worst], 0.5);                 // 수축
    const fc = cost(con);
    if (fc < fv[worst]) { simplex[worst] = con; fv[worst] = fc; continue; }
    for (const i of order.slice(1)) {                          // 축소
      simplex[i] = comb(simplex[best], simplex[i], 0.5);
      fv[i] = cost(simplex[i]);
    }
  }
  const bi = fv.map((v, i) => i).sort((a, b) => fv[a] - fv[b])[0];
  const p = simplex[bi];
  if (!Number.isFinite(fv[bi])) return fail;
  const { axes, f } = unpack(p);
  const residDeg = used.map(L => {
    const nn = planeNormal(L.rep, principal, f);
    return nn ? (Math.asin(Math.min(1, Math.abs(dot3(nn, axes[L.axis])))) * 180) / Math.PI : 90;
  });
  const rotDeg = (norm3([p[0], p[1], p[2]]) * 180) / Math.PI;
  return {
    ok: true, f, principal, axes,
    vps: axes.map(d => vpOf(d, principal, f)),
    cost: fv[bi], residDeg, iters, moved: { rotDeg, fRatio: f / f0 },
  };
}

export { unit3, cross3, dot3, norm3, sub3, add3, mul3 };
