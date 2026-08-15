// L-A.7 **소실점의 동차(각도) 표현** — 계획서 §5.4의 발산 대응.
//
// 문제: 가이드 선 둘이 나란해지면 교점이 날아간다. 브라우저에서 핸들을 24px 끄니
// 소실점이 `−360` → `−37639`로 갔다. `min_guide_ratio`는 완화이지 해결이 아니다.
//
// ---------------------------------------------------------------- 무엇이 실제로 고쳐지는가
//
// **⚠ 재매개화는 아무것도 고치지 않는다**(PITFALLS #24 — D-L2에서 이미 한 번 걸렸다).
// 그래서 무엇이 고쳐지고 무엇이 안 고쳐지는지 먼저 갈라 둔다.
//
// **고쳐지는 것 — 표현의 발산.** 소실점을 2D 점 `(x, y)`가 아니라 **동차 3-벡터**로 두면
// 두 직선의 교점이 `v = ℓ₁ × ℓ₂`이고 **나눗셈이 없다**. 나란하면 `v₂ = 0`이 되어
// **무한원이 자연스러운 극한**으로 나온다(이론서 2.2의 c=0 축이 바로 그 상태다).
// 단위 길이로 정규화하면 값이 유계이고, 핸들을 끌 때 **연속적으로** 움직인다.
//
// **안 고쳐지는 것 — 카메라의 발산.** `f² = −(V₁−P)·(V₂−P)`(6.2)는 소실점이 멀어지면
// 실제로 발산한다. 그것은 표현의 문제가 아니라 **기하가 그렇다** — 축이 화면과 나란해지면
// 그 축은 f를 정하지 못한다. 그때는 소실점 개수가 줄어 **1·2점 분기로 떨어지는 것이 정답**이다
// (이론서 5.3의 자유도 회계). 그래서 §c의 **무한원 스냅**이 필요하고,
// 동차 표현은 그 스냅을 **연속적으로** 만들어 주는 수단이다.
//
// ---------------------------------------------------------------- 좌표계
//
// 정규화 이미지 좌표를 쓴다 — 원점은 이미지 중심, 단위는 **화면 대각**.
// ```
// x̂ = (x − cx) / diag,   ŷ = (y − cy) / diag,   동차점 = [x̂, ŷ, 1]
// ```
// 그러면 `v`의 세 성분이 같은 차원이라 단위 벡터로 정규화하는 것이 뜻을 갖는다.
// `|v₂|`가 작을수록 먼 소실점이고, 0이면 무한원이다.
//
// ⚠ 이것은 **기준 f = 대각**을 쓰는 표현 선택이지 카메라의 f가 아니다.
// 카메라 해(6.2·6.3)는 여기서 유도한 소실점 위치를 그대로 받는다 — 계산이 안 바뀐다.
import type { Pt2 } from "./camera.js";
import { unit3, cross3, norm3, type Vec3 } from "./geom3d.js";

export const HOMOG_TOL = {
  /**
   * **무한원 스냅 임계(도)** — 두 가이드 선의 방향 각차가 이보다 작으면 소실점을
   * 무한원으로 본다(§c). 그 축은 화면 평행이고 카메라는 한 차수 낮게 읽는다.
   *
   * 왜 각차인가: 교점의 위치 불확실도는 `노이즈 / 방향 각차`에 비례한다.
   * `vpDetect.min_spread_mult`가 검출에서 쓰는 것과 **같은 양**이고, 거기서는
   * `support_deg`의 1.5배(3.75°)였다. 여기서는 사용자가 직접 끄는 값이라
   * 더 조인다 — 값은 `vp_homog.json`의 조건수 측정이 정한다.
   */
  snap_deg: 3.0,
  /**
   * **퇴화 판정** — 두 동차 직선의 외적 크기(정규화 후)가 이보다 작으면 **같은 직선**이라
   * 소실점이 정의되지 않는다.
   *
   * ⚠ **나란한 것과 같은 직선인 것은 다르다.** 처음에 "각차가 0에 가까우면 퇴화"로 적었고
   * 그것이 틀렸다 — 서로 다른 두 평행선의 외적은 `(b·Δc, −a·Δc, 0)`으로 **0이 아니고**,
   * 그 점이 바로 무한원 소실점이다(이론서 2.2). 각차로 퇴화를 판정하면
   * **정상적인 무한원을 퇴화로 버린다**(반례 테스트가 잡았다).
   */
  degenerate_cross: 1e-9,
};
export type HomogCfg = Partial<typeof HOMOG_TOL>;

export interface NormFrame { cx: number; cy: number; diag: number }
export const frameOf = (imgSize: [number, number]): NormFrame =>
  ({ cx: imgSize[0] / 2, cy: imgSize[1] / 2, diag: Math.hypot(imgSize[0], imgSize[1]) });

export const toNorm = (p: Pt2, F: NormFrame): Vec3 =>
  [(p[0] - F.cx) / F.diag, (p[1] - F.cy) / F.diag, 1];
export const fromNorm = (x: number, y: number, F: NormFrame): Pt2 =>
  [x * F.diag + F.cx, y * F.diag + F.cy];

/** 두 점을 지나는 **동차 직선**. 나눗셈이 없다. */
export const lineThroughH = (a: Pt2, b: Pt2, F: NormFrame): Vec3 =>
  cross3(toNorm(a, F), toNorm(b, F));

/** 두 가이드 선의 **방향 각차**(도, 0~90). 발산의 원인이자 스냅의 기준이다. */
export function separationDeg(g1: { a: Pt2; b: Pt2 }, g2: { a: Pt2; b: Pt2 }): number {
  const ang = (g: { a: Pt2; b: Pt2 }) => {
    let t = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]);
    if (t < 0) t += Math.PI;
    return t;
  };
  let d = Math.abs(ang(g1) - ang(g2)) * 180 / Math.PI;
  if (d > 90) d = 180 - d;
  return d;
}

export interface HomogVp {
  /** 동차 소실점(정규화 좌표, **단위 벡터**). 유계이고 연속이다. */
  v: Vec3;
  /** 두 가이드의 방향 각차(도). */
  sepDeg: number;
  /** 무한원인가 — 각차가 스냅 임계 미만이거나 `v₂`가 0에 가깝다. */
  infinite: boolean;
  /** 유한일 때의 화면 좌표. 무한원이면 `null`. */
  point: Pt2 | null;
  /** 두 직선이 사실상 같은 직선이라 소실점이 정의되지 않는다. */
  degenerate: boolean;
}

/**
 * 가이드 선 둘 → 동차 소실점. **나눗셈 없이** 구하고, 유한할 때만 화면 좌표로 내린다.
 *
 * 나란한 입력에서 값이 튀지 않는 것이 요점이다 — `v`는 언제나 단위 벡터이고,
 * 나란해질수록 `v₂ → 0`으로 **연속적으로** 간다. 옛 경로는 그 지점에서 `1/det`가 폭발했다.
 */
export function vpFromGuides(
  g1: { a: Pt2; b: Pt2 }, g2: { a: Pt2; b: Pt2 }, imgSize: [number, number], cfg: HomogCfg = {},
): HomogVp {
  const c = { ...HOMOG_TOL, ...cfg };
  const F = frameOf(imgSize);
  // 직선을 단위 길이로 정규화해야 외적 크기가 척도에 무관해진다(퇴화 판정의 기준)
  const L1 = unit3(lineThroughH(g1.a, g1.b, F));
  const L2 = unit3(lineThroughH(g2.a, g2.b, F));
  const raw = cross3(L1, L2);
  const sepDeg = separationDeg(g1, g2);
  if (norm3(raw) < c.degenerate_cross) {
    // **같은 직선**이다 — 나란한 것과 다르다(위 `degenerate_cross`)
    return { v: [0, 0, 1], sepDeg, infinite: true, point: null, degenerate: true };
  }
  const v = unit3(raw);
  // **각차가 스냅 임계 미만이면 무한원으로 본다**(§c). 그 축은 화면 평행이고
  // 카메라는 한 차수 낮게 읽는다 — 1·2점 분기가 정답이다(이론서 5.3).
  const infinite = sepDeg < c.snap_deg || Math.abs(v[2]) < 1e-9;
  return {
    v, sepDeg, infinite, degenerate: false,
    point: infinite ? null : fromNorm(v[0] / v[2], v[1] / v[2], F),
  };
}

/**
 * 동차 소실점 사이의 **각거리**(도) — 조건수 측정의 대상.
 *
 * 2D 위치 차이는 무한원 근처에서 발산하지만 이 양은 **언제나 유계(0~90°)**다.
 * 그래서 "핸들 1px이 얼마나 움직였는가"를 발산 없이 비교할 수 있다.
 */
export function angleBetweenVp(a: Vec3, b: Vec3): number {
  const c = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return (Math.acos(c) * 180) / Math.PI;
}
