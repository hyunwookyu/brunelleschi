// 뷰 큐브 — 3D 큐브. 면·모서리·꼭짓점.
// 면 = 1점 시점(피치 0, 롤 0 — 화면 가로세로가 축이 된다).
// 큐브의 기준 좌표계는 그린 공간의 축(vp0·수직·그 외적)이다. 세계 축이 아니다.

import type { CamPose } from './types'
import { dirInCamera, type Analysis } from './camera'
import {
  type Pt, type V3, type Quat, pt, v3, add3, mul3, norm3, cross3, dot3, len3,
  quatFromBasis, dist2,
} from './vec'

export interface CubeBasis { X: V3; Y: V3; Z: V3 }

/** 그린 공간의 정규직교 기저 — vp0 방향·수직·외적. 작도 전이면 null. */
export function cubeBasis(an: Analysis): CubeBasis | null {
  if (!an.constructionDone) return null
  const vp0 = an.axes.find(a => a.id === 'vp0')?.dir
  if (!vp0) return null
  const X = norm3(vp0)
  const Y = v3(0, 1, 0)
  const Z = norm3(cross3(X, Y))
  return { X, Y, Z }
}

export interface CubeLayout { cx: number; cy: number; size: number }

export type CubeElem = { kind: 'face' | 'edge' | 'corner'; dirLocal: V3 }

export interface CubeGeom {
  layout: CubeLayout
  /** 8 꼭짓점 — 화면 좌표와 깊이 */
  corners: { p: Pt; z: number; local: V3 }[]
  /** 보이는 면 — 화면 폴리곤 (꼭짓점 인덱스) */
  faces: { n: V3; poly: number[]; visible: boolean }[]
}

const CORNERS: V3[] = []
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  CORNERS.push(v3(sx, sy, sz))
}
// 면: 법선과 그 면의 꼭짓점 인덱스(둘레 순서)
const FACES: { n: V3; idx: number[] }[] = [
  { n: v3(1, 0, 0), idx: [4, 5, 7, 6] },
  { n: v3(-1, 0, 0), idx: [0, 1, 3, 2] },
  { n: v3(0, 1, 0), idx: [2, 3, 7, 6] },
  { n: v3(0, -1, 0), idx: [0, 1, 5, 4] },
  { n: v3(0, 0, 1), idx: [1, 3, 7, 5] },
  { n: v3(0, 0, -1), idx: [0, 2, 6, 4] },
]

/** 현재 포즈에서의 큐브 화면 기하 — 그리기와 판정이 같은 출처 */
export function cubeGeom(an: Analysis, pose: CamPose, layout: CubeLayout): CubeGeom | null {
  const basis = cubeBasis(an)
  if (!basis) return null
  const k = layout.size / 2 / Math.sqrt(3) * 1.35
  const corners = CORNERS.map(local => {
    const w = add3(add3(mul3(basis.X, local.x), mul3(basis.Y, local.y)), mul3(basis.Z, local.z))
    const c = dirInCamera(pose, w) // 카메라 프레임 (정사영 위젯 — 장면 사영 아님)
    return { p: pt(layout.cx + c.x * k, layout.cy - c.y * k), z: c.z, local }
  })
  const faces = FACES.map(f => {
    const w = add3(add3(mul3(basis.X, f.n.x), mul3(basis.Y, f.n.y)), mul3(basis.Z, f.n.z))
    const c = dirInCamera(pose, w)
    return { n: f.n, poly: f.idx, visible: c.z > 1e-6 }
  })
  return { layout, corners, faces }
}

function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return dist2(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** 화면 점 → 큐브 요소. 꼭짓점 > 모서리 > 면 (정확한 것이 앞선다). */
export function cubeHit(geom: CubeGeom, p: Pt): CubeElem | null {
  const visCorner = new Set<number>()
  const visEdges: [number, number][] = []
  for (const f of geom.faces) {
    if (!f.visible) continue
    for (let i = 0; i < f.poly.length; i++) {
      const a = f.poly[i]!, b = f.poly[(i + 1) % f.poly.length]!
      visCorner.add(a)
      visEdges.push([Math.min(a, b), Math.max(a, b)])
    }
  }
  for (const i of visCorner) {
    if (dist2(p, geom.corners[i]!.p) <= 8) {
      return { kind: 'corner', dirLocal: norm3(geom.corners[i]!.local) }
    }
  }
  const seen = new Set<string>()
  for (const [a, b] of visEdges) {
    const key = `${a}-${b}`
    if (seen.has(key)) continue
    seen.add(key)
    if (distToSeg(p, geom.corners[a]!.p, geom.corners[b]!.p) <= 5) {
      const la = geom.corners[a]!.local, lb = geom.corners[b]!.local
      return { kind: 'edge', dirLocal: norm3(mul3(add3(la, lb), 0.5)) }
    }
  }
  for (const f of geom.faces) {
    if (!f.visible) continue
    if (inPoly(p, f.poly.map(i => geom.corners[i]!.p))) {
      return { kind: 'face', dirLocal: f.n }
    }
  }
  return null
}

/** 큐브 요소 → 카메라 포즈. 중심을 바라보고 거리 유지, 롤 0(위 힌트 = 큐브 Y). */
export function poseForElem(
  an: Analysis, elem: CubeElem, pivot: V3, dist: number,
): CamPose | null {
  const basis = cubeBasis(an)
  if (!basis) return null
  const d = elem.dirLocal
  const back = norm3(add3(add3(mul3(basis.X, d.x), mul3(basis.Y, d.y)), mul3(basis.Z, d.z)))
  let upHint = basis.Y
  if (Math.abs(dot3(back, upHint)) > 0.99) upHint = mul3(basis.Z, -Math.sign(dot3(back, basis.Y)) || -1)
  let right = cross3(upHint, back)
  if (len3(right) < 1e-9) right = basis.X
  right = norm3(right)
  const up = norm3(cross3(back, right))
  const q: Quat = quatFromBasis(right, up, back)
  return { p: add3(pivot, mul3(back, dist)), q }
}
