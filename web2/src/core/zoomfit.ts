// 돋보기 — **대상에 맞춰 화면을 채운다**(web2-31 3번). 라이노의 Zoom Selected / Zoom Extents.
//
// ⚠⚠ **이동만 한다.** `Camera.f` · `fSource`를 안 건드린다(지시 문면: 「화각을 몰래 바꾸면
// 31-2와 뒤섞인다」). 그래서 이 파일에는 f를 **쓰는** 식만 있고 **정하는** 식이 없다 —
// `Analysis`를 읽기만 하는 것이 CLAUDE.md §1의 「깊이 스케일의 출처는 `fSource` 하나다」와
// 같은 규약이다.
//
// ── **닫힌 식이다 — 반복 탐색이 없다** ────────────────────────────────────────
// 사영이 비선형이라 「조금 다가가 보고 다시 재는」 반복이 자연스러워 보이는데, **자세 q를
// 고정하면** 조건이 카메라 위치에 대해 **선형**이 된다. 위치를 자세의 세 축으로 쓰면
//
//     p = C − fwd·d + right·a + up·b        (C = 대상 bbox 중심 — 기준점일 뿐 식과 무관)
//
// 이고, 대상 점 Pᵢ에 대해
//
//     Dᵢ = (Pᵢ−p)·fwd  = gᵢ + d        (a·b가 안 들어온다 — 두 축이 fwd와 직교)
//     Aᵢ = (Pᵢ−p)·right = aᵢ − a
//     Bᵢ = (Pᵢ−p)·up    = bᵢ − b
//     화면(문서 좌표) = ( px + f·Aᵢ/Dᵢ , py − f·Bᵢ/Dᵢ )      ← `camera.ts`의 `project` 그대로
//
// 「화면 안에 든다」를 곱으로 풀면 **세 축이 갈라진다**:
//
//     docX ≥ x₀ ⟺ f·(aᵢ−a) ≥ (x₀−px)·Dᵢ ⟺ a ≤ aᵢ − (x₀−px)·Dᵢ/f
//     docX ≤ x₁ ⟺                        a ≥ aᵢ − (x₁−px)·Dᵢ/f
//
// 즉 d를 정하면 a의 허용 구간이 닫힌 식으로 나오고, **그 구간의 폭이 d의 1차식**이다:
//
//     폭_a(d) = ((x₁−x₀)/f)·d + Kₐ ,  Kₐ = min(aᵢ − c₀gᵢ) − max(aᵢ − c₁gᵢ)
//
// 기울기가 양수(x₁>x₀)이므로 폭은 **d에 대해 단조 증가**하고 0이 되는 점이 정확히 하나다.
// 세로도 같다. 그래서 답은 `d* = max(d_a, d_b)` — **탐색도 수렴 판정도 필요 없다.**
// 그 d*에서 한 축은 폭이 0(딱 맞는 축, 여백이 정확히 지정값)이고 다른 축은 남은 구간의
// 가운데에 놓인다(그 축의 여백은 지정값보다 크다 — 대상의 종횡비가 화면과 다른 만큼).
//
// ⚠ **여백은 px가 아니라 화면 크기의 비다**(#88) — 창이 커지면 여백도 같이 큰다.
//   화면 사각형을 문서 좌표로 되돌리는 자리는 `fitRectDoc` 하나다(#54).

import { project, type Analysis } from './camera'
import { C } from './constants'
import type { CamPose, ViewOffset } from './types'
import { type V3, type Pt, v3, add3, sub3, mul3, dot3, quatRotate } from './vec'

/** 화면(캔버스 CSS px) — 문서 프레임과 다를 수 있다 */
export interface Screen { W: number; H: number }

/** 대상이 들어가야 하는 사각형 — **문서 좌표**다 */
export interface FitRect { x0: number; x1: number; y0: number; y1: number }

/** 근평면 여유 — **`render3d`가 실제로 자르는 자리**와 같은 값이다(#54) */
const C_NEAR = C.RENDER_NEAR_UNITS
/** 대상이 «한 점»인지의 문턱(세계 단위) — 그보다 작으면 채울 것이 없다 */
const DEGENERATE = 1e-12

/** 화면의 여백 안쪽 사각형 → 문서 좌표. 뷰 오프셋의 역이고 **출처가 여기 하나**다(#54).
 *  `margin`은 각 변의 비(0.10 = 사방 10%)이므로 대상이 채우는 것은 `1 − 2·margin`이다. */
export function fitRectDoc(view: ViewOffset, sc: Screen, margin: number): FitRect {
  const s = view.s
  return {
    x0: (margin * sc.W - view.ox) / s,
    x1: ((1 - margin) * sc.W - view.ox) / s,
    y0: (margin * sc.H - view.oy) / s,
    y1: ((1 - margin) * sc.H - view.oy) / s,
  }
}

/** **맞춤의 셈** — 포즈만이 아니라 «왜 그 거리인가»를 같이 낸다(원장·게이트가 읽는다).
 *
 *  `framable` = **그 렌즈로 그 여백을 실제로 낼 수 있는가.** 닫힌 식이 내는 거리 `dExact`가
 *  근평면 여유(`dNear`)보다 가까우면 «채우려면 대상 안으로 들어가야 하는» 구도다 —
 *  깊이가 가로세로를 압도하는 대상(시선과 나란한 선)과 아주 넓은 화각에서 난다.
 *  그때는 **근평면까지만 다가간다**: 여백이 지정값보다 커지고, 대신 **아무것도 안 잘린다.**
 *  조용히 틀린 화면을 만들지 않는다(A-3) — 그 사실을 `framable: false`로 말한다. */
export interface FitPlan {
  pose: CamPose
  /** 실제로 쓴 거리(기준점까지, 시선 방향) */
  d: number
  /** 닫힌 식의 답 — 여백이 정확히 지정값이 되는 거리 */
  dExact: number
  /** 근평면 여유가 허용하는 가장 가까운 거리 */
  dNear: number
  framable: boolean
  /** 맞춘 뒤 가장 가까운 대상 점의 깊이(세계 단위) — 근평면 이상이어야 한다 */
  nearestDepth: number
}

/** **카메라를 옮겨 대상을 채운다** — 자세 `q`도 `f`도 `fSource`도 안 바뀐다.
 *  대상이 없거나 카메라가 아직 안 정해졌으면(주점·f 없음) `null`. */
export function fitPlan(
  an: Analysis, pose: CamPose, view: ViewOffset, pts: V3[], sc: Screen, margin: number,
): FitPlan | null {
  if (!an.principal || an.f === null || pts.length === 0) return null
  const f = an.f, px = an.principal.x, py = an.principal.y
  const r = fitRectDoc(view, sc, margin)
  if (!(r.x1 > r.x0) || !(r.y1 > r.y0)) return null

  const fwd = quatRotate(pose.q, v3(0, 0, -1))
  const right = quatRotate(pose.q, v3(1, 0, 0))
  const up = quatRotate(pose.q, v3(0, 1, 0))

  // 기준점 C — bbox 중심. **식은 기준점에 무관하다**(옮기면 d·a·b가 같이 옮겨간다):
  // 수치를 0 근처에 두려고 고른다.
  let lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity)
  for (const p of pts) {
    lo = v3(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
    hi = v3(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
  }
  const C = v3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
  const spread = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)

  const c0 = (r.x0 - px) / f, c1 = (r.x1 - px) / f     // 가로 두 변
  const e0 = (py - r.y0) / f, e1 = (r.y1 - py) / f     // 세로 두 변 (화면 y는 아래로 큰다)
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, minG = Infinity
  for (const P of pts) {
    const w = sub3(P, C)
    const a = dot3(w, right), b = dot3(w, up), g = dot3(w, fwd)
    if (a - c0 * g < minA) minA = a - c0 * g
    if (a - c1 * g > maxA) maxA = a - c1 * g
    if (b + e1 * g < minB) minB = b + e1 * g
    if (b - e0 * g > maxB) maxB = b - e0 * g
    if (g < minG) minG = g
  }
  // 폭이 0이 되는 거리 — 두 축의 답 중 **먼 쪽**이 딱 맞는 축이다
  const dA = -(minA - maxA) * f / (r.x1 - r.x0)
  const dB = -(minB - maxB) * f / (r.y1 - r.y0)
  const dExact = Math.max(dA, dB)
  // 어떤 점도 근평면 안으로 못 온다 — Dᵢ = d + gᵢ ≥ 근평면
  const dNear = C_NEAR - minG
  let d = Math.max(dExact, dNear)
  // **대상이 한 점으로 뭉쳤다** — 어느 거리에서나 «채워지지» 않으므로 답이 없다.
  // 거리를 임의로 짓지 않고 **지금 거리를 지킨다**(그 자리에서 가운데로만 옮긴다).
  if (spread <= DEGENERATE) d = Math.max(dNear, dot3(sub3(C, pose.p), fwd))
  if (!Number.isFinite(d)) return null

  // 남은 두 축은 각자의 허용 구간 가운데. 딱 맞는 축은 구간 폭이 0이라 가운데가 곧 그 값이다.
  const a = ((minA - c0 * d) + (maxA - c1 * d)) / 2
  const b = ((minB + e1 * d) + (maxB - e0 * d)) / 2
  const p = add3(add3(C, mul3(fwd, -d)), add3(mul3(right, a), mul3(up, b)))
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null
  // **평행이면 기준 깊이도 그 거리로 간다**(web2-42): 평행의 배율이 `f/D`이므로 눈만
  // 옮기면 상이 한 톨도 안 바뀐다 — 그러면 돋보기가 정투상 뷰에서 조용히 죽는다.
  // `d`는 「그 거리에서 대상이 화면을 채운다」의 답이고, 그 거리를 D로 쓰면 **평행에서도
  // 같은 크기로 채워진다**(pivot 면에서 두 사영이 같은 배율이라는 그 성질이다).
  // ⚠ 새 식이 아니다 — `parallelPose`가 「D = 눈에서 대상까지의 축방향 거리」이고
  //    이 눈은 정확히 C에서 `d`만큼 뒤에 있다(위 `p`의 정의).
  // ⚠⚠ **기준면이 pivot에서 «맞춘 대상»으로 옮겨간다** — 그 둘은 다른 점이다(pivot은
  //    잉크 bbox 중심). 배율의 기준면은 지금 채우려는 그 대상이 맞으므로 그것이 옳고,
  //    「D = pivot까지의 거리」는 **평행에 들어갈 때의 규약**이지 상시 불변식이 아니다.
  return {
    pose: { p, q: { ...pose.q }, ...(pose.proj ? { proj: { w: pose.proj.w, D: d } } : {}) },
    d, dExact, dNear, framable: dExact >= dNear, nearestDepth: d + minG,
  }
}

/** 맞춤의 결과 포즈만 — 앱이 쓰는 겉면이다 */
export function fitPose(
  an: Analysis, pose: CamPose, view: ViewOffset, pts: V3[], sc: Screen, margin: number,
): CamPose | null {
  return fitPlan(an, pose, view, pts, sc, margin)?.pose ?? null
}

/** **화면을 옮겨 대상을 채운다**(작도 시점의 갈래) — 포즈도 `f`도 안 바뀐다.
 *
 *  ⚠ 작도 시점에서 카메라를 옮기면 **종이와 그림의 1:1이 깨진다**(2D 획은 문서 좌표에
 *  박혀 있고 3D만 움직인다). 그래서 이 국면의 「이동」은 `dollyBy`·`panBy`가 이미 하는 것과
 *  **같은 것**이다 — 뷰 오프셋(팬·줌). 판정도 그 둘과 같은 술어(`isDrawPose`)를 쓴다(#54).
 *
 *  카메라 뒤의 점은 화면 자리가 없으므로 **앞에 있는 점만** 담는다(뒤엣것까지 화면에
 *  넣으라는 답이 없다 — 그 국면의 답은 카메라를 옮기는 쪽 갈래다). */
export function fitView(
  an: Analysis, pose: CamPose, pts: V3[], sc: Screen, margin: number,
  clamp: { min: number; max: number },
): ViewOffset | null {
  if (pts.length === 0) return null
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0
  for (const P of pts) {
    const q: Pt | null = project(an, pose, P)
    if (!q) continue
    n++
    if (q.x < x0) x0 = q.x
    if (q.x > x1) x1 = q.x
    if (q.y < y0) y0 = q.y
    if (q.y > y1) y1 = q.y
  }
  if (n === 0) return null
  const inner = 1 - 2 * margin
  const w = x1 - x0, h = y1 - y0
  const s0 = Math.min(w > 0 ? inner * sc.W / w : Infinity, h > 0 ? inner * sc.H / h : Infinity)
  if (!Number.isFinite(s0) || !(s0 > 0)) return null      // 한 점으로 뭉쳤다 — 채울 것이 없다
  const s = Math.min(clamp.max, Math.max(clamp.min, s0))
  return { s, ox: (sc.W - s * (x0 + x1)) / 2, oy: (sc.H - s * (y0 + y1)) / 2 }
}

/** **실측 여백** — 게이트가 읽는 값이자 진단의 값. 대상의 화면 bbox와 화면 사이의 틈을
 *  각 축에서 **화면 크기로 나눈** 비이고, 「여백 10%」가 뜻하는 것은 **좁은 축의 값**이다
 *  (대상의 종횡비가 화면과 다르면 다른 축은 반드시 더 넓다).
 *
 *  `inside`가 false면 여백을 말할 것이 없다 — 대상이 화면 밖으로 나갔다는 뜻이다.
 *  ⚠ **뒤로 넘어간 점이 하나라도 있으면 `inside`는 false**다(화면 자리가 없다). */
export function marginOf(
  an: Analysis, pose: CamPose, view: ViewOffset, pts: V3[], sc: Screen,
): { inside: boolean; mx: number; my: number; min: number; box: FitRect } | null {
  if (pts.length === 0) return null
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const P of pts) {
    const q = project(an, pose, P)
    if (!q) return { inside: false, mx: NaN, my: NaN, min: NaN, box: { x0: NaN, x1: NaN, y0: NaN, y1: NaN } }
    const sx = q.x * view.s + view.ox, sy = q.y * view.s + view.oy
    if (sx < x0) x0 = sx
    if (sx > x1) x1 = sx
    if (sy < y0) y0 = sy
    if (sy > y1) y1 = sy
  }
  const mx = Math.min(x0, sc.W - x1) / sc.W
  const my = Math.min(y0, sc.H - y1) / sc.H
  return {
    inside: x0 >= 0 && y0 >= 0 && x1 <= sc.W && y1 <= sc.H,
    mx, my, min: Math.min(mx, my), box: { x0, x1, y0, y1 },
  }
}
