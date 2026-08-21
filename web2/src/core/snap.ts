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

/** 축 스냅 — **항상 붙는다. 임계가 없고 자유 방향도 없다**(지시 5-a).
 *
 *  라이노 직교 모드와 같다: 켜져 있으면 선이 축 방향으로만 그어진다. 임계 «안이냐 밖이냐»가
 *  아니라 커서 방향에서 **가장 가까운 축**을 무조건 고른다 — 각차가 얼마든 그 축이다.
 *
 *  왜 임계를 없앴나: 자유 방향 선은 이 도구에서 **의미가 없다.** 축이 아니면 3D 좌표가
 *  안 정해지고, 정해지려면 양 끝이 스냅되어야 한다. 임계를 두면 «임계 밖 → 자유 → 대기»가
 *  되어 사람이 그은 선이 3D가 안 된 채 쌓인다. 자유 방향이 필요하면 오스냅으로 두 점을
 *  잡는다 — 그것이 대각선을 그리는 방법이다(5-b. 그래서 축 스냅 토글을 안 만든다).
 *
 *  ⚠ 오스냅이 이 함수보다 앞선다(`core/draft.ts`) — 점이 방향을 이긴다.
 *  붙은 좌표가 그대로 확정된다(원칙 d). */
export function snapDir(an: Analysis, pose: CamPose, start: Pt, cursor: Pt): DirSnap {
  const dx = cursor.x - start.x, dy = cursor.y - start.y
  const L = Math.hypot(dx, dy)
  if (L === 0) return { axis: null, end: cursor }
  let best: { axis: AxisId; end: Pt } | null = null
  let bestDev = Infinity
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
    // 각차만 본다 — 향은 무시한다(축의 반대 방향으로 그어도 그 축이다).
    // |sin| 만으로는 90°와 270°를 못 가르므로 1−|cos|로 잰다.
    const cos = (dx * ux + dy * uy) / L
    const dev = 1 - Math.abs(cos)
    if (dev < bestDev) {
      const t = dx * ux + dy * uy
      best = { axis: ax.id, end: pt(start.x + ux * t, start.y + uy * t) }
      bestDev = dev
    }
  }
  // 축이 하나도 없을 때(지평선 전)만 자유다 — 그때는 아직 축이란 것이 없다.
  return best ? { axis: best.axis, end: best.end } : { axis: null, end: cursor }
}

/** 작도 국면의 미리보기 — 확정과 같은 classifyNext를 쓴다 */
export { classifyNext }
