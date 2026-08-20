// 조각 — 교차·접촉 지점에서 세그먼트가 나뉜다(자동 분할).
// 저장하지 않는다: 문서의 획과 교차 목록(intersections3)에서 매번 계산한다(원칙 b).
// 목적은 삐져나온 부분을 잘라내는 것 — 지우개는 조각 단위로 지운다.
//
// 승격 획: 3D 실제 교차에서만 나뉜다(화면 교차는 가림 — osnap과 같은 기준).
// 대기 획: 깊이를 모르므로 나뉘지 않는다 — 통째로 한 조각.

import type { CamPose } from './types'
import { project } from './camera'
import type { LiftResult } from './lift'
import { intersections3 } from './osnap'
import { type Pt, type V3, add3, sub3, mul3, dot3 } from './vec'

export interface Piece {
  strokeId: number
  /** 3D 파라미터 구간 (대기 획이면 0..1) */
  t0: number
  t1: number
  /** 현재 포즈의 화면 끝점 — 지우개 판정과 분할 좌표가 이것 */
  a: Pt
  b: Pt
  lifted: boolean
}

/** 승격 획의 3D 파라미터 t 지점의 화면 좌표 */
function at(lift: LiftResult, pose: CamPose, id: number, t: number): Pt | null {
  const seg = lift.lifted.get(id)!
  const p3: V3 = add3(seg.a3, mul3(sub3(seg.b3, seg.a3), t))
  return project(lift.an, pose, p3)
}

/** 문서 전체의 조각 목록 */
export function pieces(lift: LiftResult, pose: CamPose): Piece[] {
  const out: Piece[] = []

  // 교차 파라미터 수집 (승격 획)
  const cuts = new Map<number, number[]>()
  for (const x of intersections3(lift)) {
    for (const id of x.ids) {
      const seg = lift.lifted.get(id)!
      const d = sub3(seg.b3, seg.a3)
      const L2 = dot3(d, d)
      if (L2 < 1e-18) continue
      const t = dot3(sub3(x.p3, seg.a3), d) / L2
      if (t > 1e-6 && t < 1 - 1e-6) {
        // 끝점 접촉(t=0·1)은 분할이 아니다
        const arr = cuts.get(id) ?? []
        arr.push(t)
        cuts.set(id, arr)
      }
    }
  }

  for (const [id] of lift.lifted) {
    const ts = [0, ...(cuts.get(id) ?? []).sort((a, b) => a - b), 1]
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]!, t1 = ts[i + 1]!
      if (t1 - t0 < 1e-6) continue
      const a = at(lift, pose, id, t0)
      const b = at(lift, pose, id, t1)
      if (!a || !b) continue
      out.push({ strokeId: id, t0, t1, a, b, lifted: true })
    }
  }

  // 대기 획 — 통째로 (자기 화면 좌표)
  for (const id of lift.waiting) {
    const s = lift.strokes.get(id)
    if (!s) continue
    out.push({ strokeId: id, t0: 0, t1: 1, a: s.a, b: s.b, lifted: false })
  }

  return out
}

/** 점-선분 화면 거리 */
export function distToPiece(p: Pt, piece: Piece): number {
  const dx = piece.b.x - piece.a.x, dy = piece.b.y - piece.a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - piece.a.x, p.y - piece.a.y)
  const t = Math.max(0, Math.min(1, ((p.x - piece.a.x) * dx + (p.y - piece.a.y) * dy) / L2))
  return Math.hypot(p.x - (piece.a.x + dx * t), p.y - (piece.a.y + dy * t))
}
