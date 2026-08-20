// 2D/3D 벡터·쿼터니언 — 코어는 three.js에 의존하지 않는다(단위 테스트를 가볍게)

export interface Pt { x: number; y: number }
export interface V3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

export const pt = (x: number, y: number): Pt => ({ x, y })
export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })

export const sub2 = (a: Pt, b: Pt): Pt => pt(a.x - b.x, a.y - b.y)
export const len2 = (a: Pt): number => Math.hypot(a.x, a.y)
export const dist2 = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
export const dot2 = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y
export const cross2 = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x

export const add3 = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub3 = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
export const mul3 = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s)
export const dot3 = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross3 = (a: V3, b: V3): V3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const len3 = (a: V3): number => Math.hypot(a.x, a.y, a.z)
export const norm3 = (a: V3): V3 => {
  const l = len3(a)
  return l > 0 ? mul3(a, 1 / l) : v3(0, 0, 0)
}
export const dist3 = (a: V3, b: V3): number => len3(sub3(a, b))

// ── 쿼터니언 ──────────────────────────────────────────────────────────────
export const QID: Quat = { x: 0, y: 0, z: 0, w: 1 }

export function quatAxisAngle(axis: V3, angle: number): Quat {
  const a = norm3(axis)
  const s = Math.sin(angle / 2)
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(angle / 2) }
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

export const quatConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })

/** 정규직교 기저(열벡터 x·y·z) → 쿼터니언 */
export function quatFromBasis(x: V3, y: V3, z: V3): Quat {
  const m00 = x.x, m01 = y.x, m02 = z.x
  const m10 = x.y, m11 = y.y, m12 = z.y
  const m20 = x.z, m21 = y.z, m22 = z.z
  const tr = m00 + m11 + m22
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    return { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s }
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    return { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s }
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s }
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 }
  }
}

/** q로 벡터 회전 */
export function quatRotate(q: Quat, p: V3): V3 {
  // v' = v + 2*cross(q.xyz, cross(q.xyz, v) + w*v)
  const u = v3(q.x, q.y, q.z)
  const t = mul3(cross3(u, p), 2)
  return add3(add3(p, mul3(t, q.w)), cross3(u, t))
}
