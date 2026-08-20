// 3D 리프팅 — 확정 후 경로에 판정이 없다(원칙 c).
// 시작점이 3D에 있고 방향이 축이면 끝점은 광선-직선 최근접점. 계산이다.
// 시작점이 3D에 없으면 그 획은 2D로 대기한다 — 거부가 아니라 상태다.
// 대기 획은 조건이 갖춰지면 승격하고, 승격은 연쇄한다.

import type { Doc, Stroke, CamPose } from './types'
import { C } from './constants'
import {
  analyze, type Analysis, type AxisId, DRAW_POSE,
  screenAxes, project, rayThrough, pointAtGaugeDepth, type Ray,
} from './camera'
import {
  type Pt, type V3, add3, sub3, mul3, dot3, dist2, norm3,
} from './vec'

export interface LiftedSeg {
  a3: V3
  b3: V3
  axis: AxisId | null
}

export interface LiftResult {
  an: Analysis
  lifted: Map<number, LiftedSeg>
  /** 내용 획인데 아직 3D 미확정 — 실패가 아니라 대기 */
  waiting: number[]
  /** 게이지 앵커가 된 획 (전역 스케일의 게이지 — 유일한 자유 선택) */
  anchorId: number | null
}

/** 직선 P0+t·a 와 광선의 최근접점(직선 위의 점). 평행이면 null. */
export function closestOnLineToRay(P0: V3, a: V3, r: Ray): V3 | null {
  const w0 = sub3(P0, r.o)
  const B = dot3(a, r.d)
  const denom = 1 - B * B
  if (denom < 1e-12) return null
  const D = dot3(a, w0)
  const E = dot3(r.d, w0)
  const t = (B * E - D) / denom
  return add3(P0, mul3(a, t))
}

/** 획의 축 배정 — 확정 좌표가 이미 스냅돼 있으므로(원칙 d) 재계산은 안정적이다.
 *  기준은 스냅과 같다: 유한 축은 수직거리/길이 ≤ VP_DIR_RATIO,
 *  화면 평행 축은 벗어남/길이 ≤ SCREEN_PARALLEL_RATIO. 가장 가까운 것. */
export function axisOfStroke(an: Analysis, pose: CamPose, a: Pt, b: Pt): AxisId | null {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L === 0) return null
  let best: AxisId | null = null
  let bestScore = 1 // score = 편차/임계 — 1 미만이면 붙는다
  for (const ax of screenAxes(an, pose)) {
    let dev: number, tol: number
    if (ax.vp) {
      dev = Math.abs((ax.vp.x - a.x) * dy - (ax.vp.y - a.y) * dx) / (L * L)
      tol = C.VP_DIR_RATIO
    } else if (ax.dir) {
      // 화면 방향 축 — 획 방향과의 사인 편차
      const dl = Math.hypot(ax.dir.x, ax.dir.y)
      dev = Math.abs(dx * ax.dir.y - dy * ax.dir.x) / (L * dl)
      tol = C.SCREEN_PARALLEL_RATIO
    } else continue
    const score = dev / tol
    if (score < 1 && score < bestScore) { best = ax.id; bestScore = score }
  }
  return best
}

const axisDir = (an: Analysis, id: AxisId): V3 | null =>
  an.axes.find(x => x.id === id)?.dir ?? null

/** 문서 전체를 처음부터 리프팅한다 — 카메라가 바뀌면(2점 승격) 전부 다시 푼다. */
export function liftAll(doc: Doc): LiftResult {
  const an = analyze(doc)
  const lifted = new Map<number, LiftedSeg>()
  let anchorId: number | null = null

  const content = doc.strokes.filter(s => an.roles.get(s.id) === 'content')
  if (!an.principal || an.f === null) {
    return { an, lifted, waiting: content.map(s => s.id), anchorId }
  }

  const mergeTol = C.MERGE_RATIO * an.diag
  const pending = new Set(content.map(s => s.id))
  const byId = new Map(content.map(s => [s.id, s]))

  // 승격된 끝점 목록 — 시작점 매칭 대상
  const endpoints: V3[] = []
  const pushEnd = (p: V3) => { endpoints.push(p) }

  const matchPoint = (s2: Pt, pose: CamPose): V3 | null => {
    let best: V3 | null = null
    let bestD = mergeTol
    for (const p3 of endpoints) {
      const pr = project(an, pose, p3)
      if (!pr) continue
      const d = dist2(pr, s2)
      if (d <= bestD) { best = p3; bestD = d }
    }
    return best
  }

  let progressed = true
  while (progressed) {
    progressed = false
    for (const s of content) {
      if (!pending.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const axis = axisOfStroke(an, pose, s.a, s.b)

      let a3 = matchPoint(s.a, pose)
      if (!a3 && lifted.size === 0 && anchorId === null && (axis === 'H' || axis === 'V')) {
        // 첫 앵커 — 화면 평행 획이 게이지 평면(z=−f)에서 연쇄를 시작한다.
        // 전역 스케일은 원리적으로 모호하므로 이것은 단위 선택이지 임의 좌표가 아니다.
        a3 = pointAtGaugeDepth(an, pose, s.a)
        if (a3) anchorId = s.id
      }
      if (!a3) continue

      let b3: V3 | null = null
      if (axis) {
        const dir = axisDir(an, axis)
        const ray = rayThrough(an, pose, s.b)
        if (dir && ray) b3 = closestOnLineToRay(a3, dir, ray)
      } else {
        // 자유 방향 — 끝점도 기존 3D에 붙어야 확정된다. 아니면 대기.
        b3 = matchPoint(s.b, pose)
      }
      if (!b3) { if (anchorId === s.id) anchorId = null; continue }

      lifted.set(s.id, { a3, b3, axis })
      pushEnd(a3); pushEnd(b3)
      pending.delete(s.id)
      progressed = true
    }
  }

  return { an, lifted, waiting: [...pending], anchorId }
}
