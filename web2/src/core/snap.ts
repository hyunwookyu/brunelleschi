// 스냅 — 조준이지 판정이 아니다(원칙 d).
// 미리보기에서 붙은 좌표가 그대로 확정된다. 확정에서 다시 판단하지 않는다.
// 1단계: 시작점 = 승격된 끝점(반경 8px), 방향 = 축 스냅. 오스냅 전체는 2단계.

import type { CamPose } from './types'
import { C } from './constants'
import {
  type Analysis, type AxisId, screenAxes, classifyNext,
} from './camera'
import { type Pt, pt } from './vec'

export interface DirSnap {
  axis: AxisId | null
  end: Pt
}

/** 축 스냅 — 커서 방향과 축 방향의 각차. 가장 가까운 축에 붙는다.
 *  붙으면 끝점을 그 축 직선 위로 사영한다(확정도 이 좌표). 안 붙으면 자유. */
export function snapDir(an: Analysis, pose: CamPose, start: Pt, cursor: Pt): DirSnap {
  const dx = cursor.x - start.x, dy = cursor.y - start.y
  const L = Math.hypot(dx, dy)
  if (L === 0) return { axis: null, end: cursor }
  let best: { axis: AxisId; end: Pt } | null = null
  let bestScore = 1
  for (const ax of screenAxes(an, pose)) {
    let ux: number, uy: number // 축의 화면 단위 방향 (시작점 기준)
    if (ax.vp) {
      const vx = ax.vp.x - start.x, vy = ax.vp.y - start.y
      const vl = Math.hypot(vx, vy)
      if (vl < 1e-9) continue
      ux = vx / vl; uy = vy / vl
    } else if (ax.dir) {
      const dl = Math.hypot(ax.dir.x, ax.dir.y)
      ux = ax.dir.x / dl; uy = ax.dir.y / dl
    } else continue
    const dev = Math.abs(dx * uy - dy * ux) / L // 사인 편차
    const tol = ax.vp ? C.VP_DIR_RATIO : C.SCREEN_PARALLEL_RATIO
    const score = dev / tol
    if (score < 1 && score < bestScore) {
      const t = dx * ux + dy * uy
      best = { axis: ax.id, end: pt(start.x + ux * t, start.y + uy * t) }
      bestScore = score
    }
  }
  return best ? { axis: best.axis, end: best.end } : { axis: null, end: cursor }
}

/** 작도 국면의 미리보기 — 확정과 같은 classifyNext를 쓴다 */
export { classifyNext }
