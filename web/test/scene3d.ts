// S-3 측정용 합성 장면 — **정답 3D가 있는** 투시 그림을 만든다.
//
// S-2는 화면에서 상자를 작도했다(2D 정답만 있다). S-3이 재는 것은 **깊이**이므로
// 반대로 간다: 3D 상자를 먼저 세우고 → 알려진 카메라로 투영하고 → 그 위에 잉크 노이즈를
// 얹는다. 그러면 각 모서리의 **참 3D 위치**를 알고 있으므로 배치 결과와 대조할 수 있다.
//
// **자기확인 차단**(HANDOFF 경고 2·D-S4): 노이즈는 2D에서만 얹는다. 배치가 쓰는 수학
// (광선-평면)으로 정답을 만들지 않는다. 활 마루(skew)도 0.5(대칭)를 쓰지 않는다 —
// 대칭 활은 최소제곱 주축이 참 방향과 정확히 나란해져 판정이 공짜로 맞는다(S-2에서 걸렸다).
import type { Pt2 } from "../src/s3d/camera.js";
import {
  project, unit3, add3, sub3, mul3, dot3, norm3, cross3, groundFrame, rayThrough, rayPlane,
  EYE_HEIGHT, type Vec3, type Plane,
} from "../src/s3d/geom3d.js";
import { renderInk, gauss, type InkGrade } from "../src/s3d/synthInk.js";

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface Scene {
  principal: Pt2;
  f: number;
  imgSize: [number, number];
  /** 관례: 0 가로 · 1 안쪽 · 2 수직. `vps[2]`가 수직축이다. */
  vps: [Pt2, Pt2, Pt2];
  axes: [Vec3, Vec3, Vec3];
  ground: Plane;
}

/**
 * 요(yaw)·피치로 세운 카메라. 피치가 0이 아니면 **지면이 카메라 좌표계의 y = const 가 아니다** —
 * 3점 투시가 그런 경우이고, 지면을 y로 두면 씨앗이 틀린 자리에 떨어진다.
 */
export function scene(
  yawDeg = 35, pitchDeg = 15, f = 1000, imgSize: [number, number] = [960, 672],
): Scene {
  const y = rad(yawDeg), t = rad(pitchDeg);
  const rx = (v: Vec3): Vec3 => [v[0], v[1] * Math.cos(t) - v[2] * Math.sin(t),
                                 v[1] * Math.sin(t) + v[2] * Math.cos(t)];
  const axes: [Vec3, Vec3, Vec3] = [
    rx([Math.cos(y), 0, Math.sin(y)]),      // 가로
    rx([-Math.sin(y), 0, Math.cos(y)]),     // 안쪽
    rx([0, 1, 0]),                          // 수직(아래 +) — 지면 법선
  ];
  const principal: Pt2 = [imgSize[0] / 2, imgSize[1] / 2];
  const vp = (d: Vec3): Pt2 => [principal[0] + (f * d[0]) / d[2], principal[1] + (f * d[1]) / d[2]];
  return {
    principal, f, imgSize,
    vps: [vp(axes[0]), vp(axes[1]), vp(axes[2])],
    axes,
    ground: groundFrame(vp(axes[2]), principal, f, EYE_HEIGHT),
  };
}

/** 화면 점 → 지면 위 참 3D 점. 상자를 지면에 세울 때 쓴다. */
export function groundPoint(sc: Scene, s: Pt2): Vec3 | null {
  return rayPlane([0, 0, 0], rayThrough(s, sc.principal, sc.f), sc.ground.n, sc.ground.d);
}

export interface TrueEdge { a: Vec3; b: Vec3; axis: 0 | 1 | 2; }

/**
 * 지면에 세운 직육면체의 12모서리 — **그리는 순서대로**.
 * 앵커 체인이 씨앗 모서리에서 뻗어 나가도록 연결된 순서로 낸다(§4.2).
 * 위쪽은 `−axes[2]`다(수직축이 아래를 향한다).
 */
export function boxEdges(sc: Scene, O: Vec3, a: number, b: number, c: number): TrueEdge[] {
  const [e0, e1, e2] = sc.axes;
  const A = add3(O, mul3(e0, a)), B = add3(O, mul3(e1, b));
  const AB = add3(A, mul3(e1, b));
  const up = (p: Vec3) => sub3(p, mul3(e2, c));
  const Ou = up(O), Au = up(A), Bu = up(B), ABu = up(AB);
  return [
    { a: O, b: A, axis: 0 },
    { a: O, b: B, axis: 1 },
    { a: O, b: Ou, axis: 2 },
    { a: A, b: AB, axis: 1 },
    { a: B, b: AB, axis: 0 },
    { a: A, b: Au, axis: 2 },
    { a: B, b: Bu, axis: 2 },
    { a: AB, b: ABu, axis: 2 },
    { a: Ou, b: Au, axis: 0 },
    { a: Ou, b: Bu, axis: 1 },
    { a: Au, b: ABu, axis: 1 },
    { a: Bu, b: ABu, axis: 0 },
  ];
}

export interface DrawnEdge extends TrueEdge { pts2d: Pt2[]; a2d: Pt2; b2d: Pt2; }

/**
 * **면 위 사선 두 개**(§4.3 측정용). 상자의 두 면에 대각선을 긋는다 —
 * 어떤 소실점도 향하지 않으므로 축 판정에서 `no_axis_matches`가 되고, 면 위에 놓여야 한다.
 * `axis`는 정답이 없으므로 `-1`로 표시한다.
 */
export function faceDiagonals(sc: Scene, O: Vec3, a: number, b: number, c: number)
: { a: Vec3; b: Vec3; axis: -1 }[] {
  const [e0, e1, e2] = sc.axes;
  const A = add3(O, mul3(e0, a)), B = add3(O, mul3(e1, b));
  const AB = add3(A, mul3(e1, b));
  const up = (p: Vec3) => sub3(p, mul3(e2, c));
  return [
    { a: O, b: AB, axis: -1 },          // 바닥면(축0×축1)의 대각선
    { a: O, b: up(A), axis: -1 },       // 옆면(축0×축2)의 대각선
  ];
}

// ---------------------------------------------------------------- S-2b 체계적 왜곡

/**
 * **체계적 왜곡 — 사람이 수렴을 완화해 그리는 것**(AS-14, 이론서 18.4).
 *
 * 손떨림은 무작위이고 획마다 독립이지만, 이것은 **방향이 있고 여러 획에 일관**하다.
 * 18.4: 화각 60° 이내는 평면-구면 차이가 선 굵기 이하이고, 넘어가면 주변부 신장이 감지된다 —
 * 사람은 그 구간에서 수렴을 완화해 그린다. 건축 투시 작도의 관행이기도 하다.
 *
 * 모델은 **위치 의존 깊이 압축**이다. 투영의 수렴은 깊이로 나누는 데서 오므로 깊이를 기준면 쪽으로
 * 당기면 수렴이 약해진다. 그 당기는 양을 **화각의 함수**로 둔다.
 *
 * ```
 * t = |u_true − P| / f                      (tan 반각)
 * λ(t) = 1 − warp · max(0, t/t60 − 1)       (60° 안이면 1 = 그대로)
 * z'   = z_ref + (z − z_ref) · λ(t)         u = P + f · x / z'
 * ```
 *
 * - `warp = 0` 왜곡 없음 · 클수록 가장자리에서 더 완화(축측 쪽으로)
 * - **점의 함수라 여러 획에 일관**하고, 두 획이 공유하는 모서리는 **여전히 한 점**이다
 * - **사영변환이 아니다.** λ가 위치마다 다르므로 다른 카메라로 흡수되지 않는다.
 *   _처음에는 λ를 상수로 뒀는데 그것은 `[f,0,0,0; 0,f,0,0; 0,0,λ,c]`라는 **정상 카메라**였다 —
 *   깊이 방향 아핀 자유도(이론서 16.4) 그 자체이고, 획 투표(§3.1)가 알아서 흡수한다.
 *   반례 테스트가 그것을 잡았다._
 *
 * **이것은 사람 획을 잰 모델이 아니다.** 표본이 없다(AS-13). 성질만 맞춘 대용물이며,
 * 맞춘 성질은 셋이다 — 위치 의존 · 획 간 일관 · 비사영. 실제 값은 S-10에서 잰다.
 */
export const WARP_T60 = 0.5773502692;         // tan(30°) — 18.4의 화각 60° 기준

export function warpLambda(uTrue: Pt2, sc: Scene, warp: number): number {
  if (warp <= 0) return 1;
  const t = Math.hypot(uTrue[0] - sc.principal[0], uTrue[1] - sc.principal[1]) / sc.f;
  return 1 - warp * Math.max(0, t / WARP_T60 - 1);
}

export function projectWarped(p: Vec3, sc: Scene, zRef: number, warp: number): Pt2 | null {
  const u = project(p, sc.principal, sc.f);
  if (!u) return null;
  if (warp <= 0) return u;
  const z = zRef + (p[2] - zRef) * warpLambda(u, sc, warp);
  if (z <= 1e-9) return null;
  return [sc.principal[0] + (p[0] * sc.f) / z, sc.principal[1] + (p[1] * sc.f) / z];
}

/**
 * 왜곡이 실제로 "덜 수렴"시키는지 확인한다 — **겉보기 소실점이 참값보다 멀어져야 한다.**
 * 같은 축 모서리들의 왜곡된 상을 최소제곱으로 만나게 해 겉보기 소실점을 낸다.
 * 반환값은 `|겉보기 − 주점| / |참 VP − 주점|`이며 1보다 크면 덜 수렴한 것이다.
 */
export function apparentVpRatio(sc: Scene, edges: TrueEdge[], zRef: number, warp: number,
                                axis: 0 | 1 | 2): number | null {
  const lines: { p: Pt2; d: Pt2 }[] = [];
  for (const e of edges) {
    if (e.axis !== axis) continue;
    const a = projectWarped(e.a, sc, zRef, warp), b = projectWarped(e.b, sc, zRef, warp);
    if (!a || !b) continue;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    lines.push({ p: a, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] });
  }
  if (lines.length < 2) return null;
  // 최소제곱 교점: Σ (I − dd^T) x = Σ (I − dd^T) p
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const { p, d } of lines) {
    const m11 = 1 - d[0] * d[0], m12 = -d[0] * d[1], m22 = 1 - d[1] * d[1];
    a11 += m11; a12 += m12; a22 += m22;
    b1 += m11 * p[0] + m12 * p[1];
    b2 += m12 * p[0] + m22 * p[1];
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return null;
  const x = (a22 * b1 - a12 * b2) / det, y = (a11 * b2 - a12 * b1) / det;
  const dTrue = Math.hypot(sc.vps[axis][0] - sc.principal[0], sc.vps[axis][1] - sc.principal[1]);
  const dApp = Math.hypot(x - sc.principal[0], y - sc.principal[1]);
  return dTrue < 1e-9 ? null : dApp / dTrue;
}

/**
 * 참 모서리를 투영하고 그 위에 잉크 노이즈를 얹는다. **노이즈는 2D에만 있다.**
 *
 * `endJitter`는 **끝점을 겨냥해 빗나가는 양**(그림 대각 대비 σ)이다. 이것이 없으면 안 된다 —
 * `renderInk`의 활은 `sin(πu)`라 **양 끝에서 정확히 0**이고, 고주파는 점 간격에 비례해
 * 0.3px 수준이다. 즉 끝점이 참 모서리에 **못으로 박혀 있다**. 그 상태로 앵커 체인을 재면
 * "오차가 누적되지 않는다"가 나오는데, 그것은 체인의 성질이 아니라 **노이즈 모델의 성질**이다
 * (HANDOFF 경고 2가 말한 자기확인). 실획 모델의 `closure_gap`(시종점 어긋남)이 이 성분이며
 * `renderInk`는 그것을 구현하지 않았다 — 여기서 명시적 인자로 넣고 스윕한다.
 */
export function drawEdges(
  sc: Scene, edges: TrueEdge[], grade: InkGrade, r: () => number, skew: number,
  endJitter = 0, warp = 0,
): DrawnEdge[] | null {
  // 체계적 왜곡(S-2b): 기준 깊이는 그림 중심의 깊이로 둔다 — 그 부근은 그대로 그려진다.
  const zRef = warp <= 0 ? 0
    : edges.reduce((s, e) => s + e.a[2] + e.b[2], 0) / (2 * edges.length);
  const proj: [Pt2, Pt2][] = [];
  for (const e of edges) {
    const a = projectWarped(e.a, sc, zRef, warp), b = projectWarped(e.b, sc, zRef, warp);
    if (!a || !b) return null;
    proj.push([a, b]);
  }
  const xs = proj.flat().map(p => p[0]), ys = proj.flat().map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const jit = (p: Pt2): Pt2 =>
    endJitter <= 0 ? p : [p[0] + gauss(r) * endJitter * diag, p[1] + gauss(r) * endJitter * diag];
  return edges.map((e, i) => {
    // 획마다 **따로** 빗나간다 — 같은 모서리를 두 획이 겨냥해도 끝점이 어긋난다
    const a2 = jit(proj[i][0]), b2 = jit(proj[i][1]);
    const pts2d = renderInk([a2, b2], grade, r, diag, skew) as Pt2[];
    return { ...e, pts2d, a2d: a2, b2d: b2 };
  });
}

// ---------------------------------------------------------------- 회전 후 보기

/** 수직축을 지나는 축 둘레로 점을 돌린다 — "돌려서 본다"를 흉내 낸다(§4.4 판단 기준). */
export function rotateAbout(p: Vec3, center: Vec3, axis: Vec3, deg: number): Vec3 {
  const k = unit3(axis), th = rad(deg), c = Math.cos(th), s = Math.sin(th);
  const v = sub3(p, center);
  // 로드리게스
  const rot = add3(add3(mul3(v, c), mul3(cross3(k, v), s)), mul3(k, dot3(k, v) * (1 - c)));
  return add3(center, rot);
}

/** 점열의 현에서 벗어난 **최대 수직거리**. 2D·3D 공용(떨림 진폭). */
export function chordDeviation(pts: number[][]): number {
  if (pts.length < 3) return 0;
  const a = pts[0], b = pts[pts.length - 1];
  const d = a.map((v, i) => b[i] - v);
  const L = Math.hypot(...d);
  if (L < 1e-12) return 0;
  const u = d.map(v => v / L);
  let m = 0;
  for (const p of pts) {
    const w = p.map((v, i) => v - a[i]);
    const t = w.reduce((s, v, i) => s + v * u[i], 0);
    m = Math.max(m, Math.hypot(...w.map((v, i) => v - u[i] * t)));
  }
  return m;
}

export const median = (xs: number[]): number | null => {
  const v = xs.filter(Number.isFinite).sort((p, q) => p - q);
  if (!v.length) return null;
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
};
export const quantile = (xs: number[], q: number): number | null => {
  const v = xs.filter(Number.isFinite).sort((p, q2) => p - q2);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
};
export const round = (x: number | null, k = 4): number | null =>
  x == null || !Number.isFinite(x) ? null : +x.toFixed(k);
/**
 * 요약 통계. **작은 쪽 꼬리도 낸다** — `ray_axis_deg`처럼 "작을수록 위험한" 지표를
 * median/p90/max로만 내면 재려는 위험과 반대 방향을 보게 된다(리뷰어 지적).
 */
export const stat = (xs: number[], k = 4) => ({
  n: xs.filter(Number.isFinite).length,
  min: round(quantile(xs, 0), k),
  p10: round(quantile(xs, 0.1), k),
  median: round(median(xs), k),
  p90: round(quantile(xs, 0.9), k),
  max: round(quantile(xs, 1), k),
});
export { norm3, sub3, add3, mul3, dot3, unit3, project };
