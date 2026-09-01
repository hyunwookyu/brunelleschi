// 면적·부피(web2-47 47-3) — 축척과 면이 있으니 나온다. ⚠ **숫자는 그림보다 무겁다**
// (지시 문면 — #61의 자리): ① 값은 반드시 «어느 면들의 합»인지와 같이 나간다(근거 id
// 목록 — 표시 계층이 그 면을 밝힌다) ② 축척 미정이면 null(무스케일을 숫자로 위장 ⛔)
// ③ 부피는 전제(벽 높이 균일)가 안 서면 **안 낸다** — 틀린 숫자는 없는 숫자보다 나쁘다.
//
// 면적의 자: ResolvedFace.tris(외곽+개구부 삼각분할)의 삼각형 넓이 합 — 개구부가 구성상
// 빠진다. 검산은 팔이 평면 신발끈으로 따로 한다(같은 정점·다른 식 — 삼각분할 결함을 잡는다).

import type { ResolvedFace } from './face'
import type { Face } from './types'
import { classOf } from './paint'
import { sub3, cross3, len3, type V3 } from './vec'
import { C } from './constants'

/** 면 넓이(세계 단위² — 삼각형 합). */
export function faceAreaU2(rf: Pick<ResolvedFace, 'tris'>): number {
  let s = 0
  const t = rf.tris
  for (let i = 0; i + 2 < t.length; i += 3) {
    s += len3(cross3(sub3(t[i + 1]!, t[i]!), sub3(t[i + 2]!, t[i]!))) / 2
  }
  return s
}

/** 세계 단위² → m². 축척 미정이면 null. */
export const u2ToM2 = (u2: number, mmPerUnit: number | null): number | null =>
  mmPerUnit === null || !(mmPerUnit > 0) ? null : u2 * (mmPerUnit / 1000) ** 2

export interface AreaReport {
  /** 근거 — 이 합에 든 면 id들(표시 계층이 이 목록을 밝힌다) */
  ids: number[]
  m2: number
}

/** **바닥면적** — 유효 분류가 슬라브인 «풀린» 면들의 합. 근거 id 목록이 값과 같이 나간다.
 *  못 풀린 면은 여기 못 든다(45의 규약 — 대기는 합에 안 들고, 그 사실이 신뢰 구간의
 *  이유다: 45 기준선의 놓침이 이 합을 모자라게 만든다). */
export function floorArea(
  faces: ResolvedFace[], docFaces: Face[], mmPerUnit: number | null,
): AreaReport | null {
  if (mmPerUnit === null || !(mmPerUnit > 0)) return null
  const ids: number[] = []
  let u2 = 0
  for (const rf of faces) {
    const df = docFaces.find(f => f.id === rf.id)
    if (classOf(df, rf, C.FACE_CLASS_DEG) !== 'slab') continue
    ids.push(rf.id)
    u2 += faceAreaU2(rf)
  }
  if (ids.length === 0) return null
  return { ids, m2: u2ToM2(u2, mmPerUnit)! }
}

export interface VolumeReport {
  ids: number[]          // 근거 — 바닥 슬라브들
  wallIds: number[]      // 높이를 준 벽들
  m3: number
  hM: number             // 쓴 높이(m)
}

/** **부피** — 바닥 슬라브 × 인접 벽의 균일 높이. 전제가 안 서면 null과 사유를 낸다:
 *  ① 벽이 없다 ② 벽 높이가 균일하지 않다(±tol 밖). 프리즘 근사다 — 경사 지붕은 못 잰다
 *  (그때는 안 내는 것이 규약이다). */
export function volume(
  faces: ResolvedFace[], docFaces: Face[], mmPerUnit: number | null, tolRel = 0.02,
): { report: VolumeReport | null; why: 'no-scale' | 'no-slab' | 'no-wall' | 'uneven' | null } {
  if (mmPerUnit === null || !(mmPerUnit > 0)) return { report: null, why: 'no-scale' }
  const slabs = faces.filter(rf => classOf(docFaces.find(f => f.id === rf.id), rf, C.FACE_CLASS_DEG) === 'slab')
  if (slabs.length === 0) return { report: null, why: 'no-slab' }
  const walls = faces.filter(rf => classOf(docFaces.find(f => f.id === rf.id), rf, C.FACE_CLASS_DEG) === 'wall')
  if (walls.length === 0) return { report: null, why: 'no-wall' }
  // 벽 높이 = 그 벽 정점 y의 범위(슬라브 면 기준이 아니라 벽 자신의 — 바닥이 y=0 국면이다)
  const hs = walls.map(w => {
    let lo = Infinity, hi = -Infinity
    for (const p of w.outer) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y }
    return hi - lo
  })
  const hMax = Math.max(...hs), hMin = Math.min(...hs)
  if (!(hMin > 0) || (hMax - hMin) / hMax > tolRel) return { report: null, why: 'uneven' }
  const h = (hMax + hMin) / 2
  let u2 = 0
  const ids = slabs.map(s => s.id)
  for (const s of slabs) u2 += faceAreaU2(s)
  const m2 = u2ToM2(u2, mmPerUnit)!
  const hM = h * mmPerUnit / 1000
  return { report: { ids, wallIds: walls.map(w => w.id), m3: m2 * hM, hM }, why: null }
}
