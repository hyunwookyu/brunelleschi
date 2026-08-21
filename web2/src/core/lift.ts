// 3D 리프팅 — 확정 후 경로에 판정이 없다(원칙 c).
// 시작점이 3D에 있고 방향이 축이면 끝점은 광선-직선 최근접점. 계산이다.
// 시작점이 3D에 없으면 그 획은 2D로 대기한다 — 거부가 아니라 상태다.
// 대기 획은 조건이 갖춰지면 승격하고, 승격은 연쇄한다.

import type { Doc, Stroke, CamPose } from './types'
import { C } from './constants'
import {
  analyze, type Analysis, type AxisId, DRAW_POSE,
  screenAxes, project, rayThrough, pointOnGround, type Ray,
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
  /** id → 획 (문서에서 그대로 — 조회 편의) */
  strokes: Map<number, Stroke>
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

  const strokes = new Map(doc.strokes.map(s => [s.id, s]))
  // **3D가 안 되는 것은 지평선뿐이다**(무한원 — 이론서 2.2). 깊이선은 소실점을 정의하고
  // *동시에* 사람이 그은 선이다. 3D로 남겨야 그 끝점이 오스냅·연결 대상이 된다 —
  // 안 그러면 깊이선 끝에 이어 그린 획이 붙을 데가 없어 영영 대기한다.
  // 작도 순서가 강제되던 자리가 여기다(2026-08-21 측정: 지평선→수직선→깊이선→수직선에서
  // 마지막 획이 waiting에 남았다).
  const content = doc.strokes.filter(s => an.roles.get(s.id) !== 'horizon')
  if (!an.principal || an.f === null) {
    return { an, lifted, waiting: content.map(s => s.id), anchorId, strokes }
  }

  const mergeTol = C.MERGE_RATIO * an.diag
  const pending = new Set(content.map(s => s.id))

  // 승격된 끝점·선분 목록 — 시작점 매칭 대상
  const endpoints: V3[] = []
  const segs: { a3: V3; b3: V3 }[] = []

  // 시작점·끝점의 3D 결정 — 끝점이 붙었거나, 확정된 선(선분 위) 위에 있으면 그 좌표.
  // "3D가 확정된 선과 교차하거나 끝점이 붙으면 그때 좌표가 정해진다"
  const matchPoint = (s2: Pt, pose: CamPose): V3 | null => {
    let best: V3 | null = null
    let bestD = mergeTol
    for (const p3 of endpoints) {
      const pr = project(an, pose, p3)
      if (!pr) continue
      const d = dist2(pr, s2)
      if (d <= bestD) { best = p3; bestD = d }
    }
    if (best) return best
    // 선분 위 — 광선과 선분 직선의 최근접점이 선분 안이고 사영이 일치할 때
    const ray = rayThrough(an, pose, s2)
    if (!ray) return null
    for (const seg of segs) {
      const dir = sub3(seg.b3, seg.a3)
      const p3 = closestOnLineToRay(seg.a3, norm3(dir), ray)
      if (!p3) continue
      const L = Math.hypot(dir.x, dir.y, dir.z)
      const t = L > 1e-12 ? dot3(sub3(p3, seg.a3), dir) / (L * L) : -1
      if (t < 0 || t > 1) continue
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
      let b3: V3 | null = null
      if (!a3 && axis) {
        // 연결은 방향이 없다 — 끝점 쪽이 먼저 확정돼 있으면 그쪽에서 시작점을 푼다
        b3 = matchPoint(s.b, pose)
        if (b3) {
          const dir = axisDir(an, axis)
          const ray = rayThrough(an, pose, s.a)
          if (dir && ray) a3 = closestOnLineToRay(b3, dir, ray)
        }
      }
      if (!a3 && !b3 && lifted.size === 0 && anchorId === null && axis !== null) {
        // ── 첫 선은 지면에 있다 ──────────────────────────────────────────
        // 규칙 하나이고 **선의 종류를 안 가린다.** 사람이 그리기 시작할 때 첫 선은
        // 바닥에서 시작한다 — 바닥 모서리를 긋거나, 기둥을 세우거나, 벽 하단을 긋는다.
        //
        //   수평선·깊이선  그 선 자체가 Y=0
        //   수직선         아래점이 Y=0 (위쪽 높이는 그 선의 길이가 정한다)
        //
        // 수평·깊이 축은 방향의 y 성분이 0이므로(소실점이 지평선 위에 있다) 한 끝만
        // 지면에 놓으면 **선 전체가 지면이다** — 그래서 두 경우가 한 계산으로 끝난다.
        // 아래·위는 화면 y로 가른다: 롤 0·피치 0이라 화면 y가 곧 높이 순서다.
        // (3점 = 피치 ≠ 0 에서는 다시 봐야 한다. 그때 판단한다.)
        const dir = axisDir(an, axis)
        const useB = axis === 'V' && s.b.y > s.a.y   // 아래로 그은 수직선
        const g = pointOnGround(an, pose, useB ? s.b : s.a)
        if (g && dir) {
          if (useB) {
            const rayA = rayThrough(an, pose, s.a)
            const solved = rayA ? closestOnLineToRay(g, dir, rayA) : null
            if (solved) { a3 = solved; b3 = g }
          } else {
            a3 = g
          }
          if (a3) anchorId = s.id
        }
      }
      if (!a3) continue

      if (!b3) {
        if (axis) {
          const dir = axisDir(an, axis)
          const ray = rayThrough(an, pose, s.b)
          if (dir && ray) b3 = closestOnLineToRay(a3, dir, ray)
        } else {
          // 자유 방향 — 끝점도 기존 3D에 붙어야 확정된다. 아니면 대기.
          b3 = matchPoint(s.b, pose)
        }
      }
      if (!b3) { if (anchorId === s.id) anchorId = null; continue }

      lifted.set(s.id, { a3, b3, axis })
      endpoints.push(a3, b3)
      segs.push({ a3, b3 })
      pending.delete(s.id)
      progressed = true
    }
  }

  return { an, lifted, waiting: [...pending], anchorId, strokes }
}
