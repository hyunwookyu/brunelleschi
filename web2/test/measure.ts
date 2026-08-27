// 측정 팔 — 3D 결과를 **화면이 아닌 곳에서** 잰다.
//
// 왜 따로 두는가: 화면 투영은 우연히 맞을 수 있다. 3D에서 한 점으로 모이는 선들도
// 그 수렴점이 시선 방향에 있으면 화면에서는 소실점으로 보인다 — 화면만 보면 안 갈린다.
// 그래서 **위에서 본 투영(y를 버린 xz 평면)**에서 잰다. 사람이 돌려봐야 보이던 것을
// 코드가 스스로 본다.
//
// 재는 것 둘 — 방향과 만남은 다른 양이다:
//   ① 수렴각  두 방향이 이루는 각(탑뷰). 평행이면 0.
//   ② 스큐 간격 두 무한직선의 최근접 거리. 방향이 같아도 이것이 0이면 겹치고,
//      방향이 다르면서 이것이 0이면 **실제로 한 점에서 만난다**(= 수렴).
// 방향만 보면 ②를 놓친다 — 지난 불변식이 못 잡은 자리가 여기다.

import type { V3 } from '../src/core/vec'

export interface Seg3 { a3: V3; b3: V3 }

/** 위에서 본 투영 — y(높이)를 버린다 */
export const top = (v: V3) => ({ x: v.x, z: v.z })

const dirOf = (s: Seg3): V3 => ({ x: s.b3.x - s.a3.x, y: s.b3.y - s.a3.y, z: s.b3.z - s.a3.z })

/** 탑뷰에서 두 선분 방향이 이루는 각(도). 0 = 평행, 90 = 직교. 향은 무시한다. */
export function convergenceDeg(p: Seg3, q: Seg3): number {
  const a = top(dirOf(p)), b = top(dirOf(q))
  const la = Math.hypot(a.x, a.z), lb = Math.hypot(b.x, b.z)
  if (la < 1e-12 || lb < 1e-12) return NaN
  // ⚠ **`acos(|cos|)`로 재면 0 근처에서 분해능이 바닥난다**(web2-18 2부에서 실측으로 잡혔다):
  // cos가 1의 한 ulp 아래(1−2.2e-16)로 반올림되기만 해도 acos가 √(2ε)=2.1e-8 rad =
  // **1.2e-6°**를 낸다 — 실제 각(방향 성분 차 1.5e-15에서 1.6e-14°)의 여덟 자릿수 위다.
  // parallel.test의 「구성상 보장」 팔이 임계 1e-9°였는데, 그 팔은 **cos가 정확히 1.0으로
  // 반올림되는 동안만** 통과하고 있었다(재는 것이 기하가 아니라 마지막 ulp였다).
  // atan2(|외적|, 내적)은 작은 각에서도 상대 정확도를 유지하고 큰 각에서는 같은 값이다 —
  // 양성 채널 팔(>0.5°)의 답은 안 바뀐다.
  const cross = Math.abs(a.x * b.z - a.z * b.x)
  const dot = Math.abs(a.x * b.x + a.z * b.z)
  return (Math.atan2(cross, dot) * 180) / Math.PI
}

/** 3D 방향이 이루는 각(도) — 탑뷰가 아닌 온전한 방향 비교 */
export function dirAngleDeg(p: Seg3, q: Seg3): number {
  const a = dirOf(p), b = dirOf(q)
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z)
  if (la < 1e-12 || lb < 1e-12) return NaN
  const cos = Math.abs((a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb))
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI
}

/** 두 무한직선의 최근접 거리. 평행이면 평행선 간 거리. */
export function skewGap(p: Seg3, q: Seg3): number {
  const u = dirOf(p), v = dirOf(q)
  const w = { x: p.a3.x - q.a3.x, y: p.a3.y - q.a3.y, z: p.a3.z - q.a3.z }
  const d = (m: V3, n: V3) => m.x * n.x + m.y * n.y + m.z * n.z
  const a = d(u, u), b = d(u, v), c = d(v, v), dd = d(u, w), e = d(v, w)
  const den = a * c - b * b
  let sc: number, tc: number
  if (Math.abs(den) < 1e-12 * a * c) {           // 평행 — 한쪽을 고정한다
    sc = 0; tc = c > 1e-12 ? e / c : 0
  } else {
    sc = (b * e - c * dd) / den
    tc = (a * e - b * dd) / den
  }
  const dx = w.x + sc * u.x - tc * v.x
  const dy = w.y + sc * u.y - tc * v.y
  const dz = w.z + sc * u.z - tc * v.z
  return Math.hypot(dx, dy, dz)
}

/** 기하 크기 — 간격을 이것으로 나눠 비로 본다(절대 px 임계를 안 쓴다) */
export function extent(segs: Seg3[]): number {
  let lo = Infinity, hi = -Infinity
  for (const s of segs) for (const p of [s.a3, s.b3]) {
    for (const v of [p.x, p.y, p.z]) { if (v < lo) lo = v; if (v > hi) hi = v }
  }
  return hi > lo ? hi - lo : 1
}

/** 「같은 축인데 3D에서 만난다」 — 방향각과 스큐 간격을 함께 본다.
 *  수렴 = 방향이 다르고(각 > tolDeg) 그 둘이 실제로 가까이 만난다(간격/크기 작음). */
export function converges(p: Seg3, q: Seg3, tolDeg = 0.01, gapRatio = 0.01): boolean {
  const ang = convergenceDeg(p, q)
  if (!(ang > tolDeg)) return false
  return skewGap(p, q) / extent([p, q]) < gapRatio
}
