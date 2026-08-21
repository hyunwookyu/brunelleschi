// 미리보기 결정 — 한 획의 시작점·끝점이 무엇이 되는가.
//
// **여기 하나에서만 정한다.** 앱(input.ts)과 측정 하네스가 같은 함수를 부른다 —
// 측정 경로와 앱 경로를 가르면 측정이 앱을 안 재게 된다(camera.ts의 classifyNext와 같은 이유).
//
// 순서: 오스냅(점)이 축 스냅(방향)을 이긴다 — Rhino 선례.

import type { CamPose } from './types'
import type { Analysis, AxisId } from './camera'
import { classifyNext } from './camera'
import type { LiftResult } from './lift'
import { osnap, type OsnapHit, type OsnapSettings } from './osnap'
import { snapDir } from './snap'
import { type Pt, pt } from './vec'

export interface EndResolve {
  end: Pt
  /** 'horizon' | 'vp' | 축id | null(자유) */
  label: string | null
  endSnap: OsnapHit | null
  /** 축 스냅이 붙었으면 그 축 — 오스냅이 이겼으면 null */
  axis: AxisId | null
}

/** 시작점 — 오스냅만 본다 */
export function resolveStart(
  lift: LiftResult, pose: CamPose, p: Pt, set: OsnapSettings,
): OsnapHit | null {
  return osnap(lift, pose, p, set)
}

/** 끝점 — 지평선 강제 → 오스냅 → 축 스냅 → 자유 */
export function resolveEnd(
  lift: LiftResult, pose: CamPose, an: Analysis,
  start: Pt, startP3: { p3: import('./vec').V3 | null },
  cursor: Pt, set: OsnapSettings,
): EndResolve {
  if (an.horizonY === null) {
    return { end: pt(cursor.x, start.y), label: 'horizon', endSnap: null, axis: null }
  }
  const oh = osnap(lift, pose, cursor, set, startP3)
  if (oh) return { end: oh.p, label: null, endSnap: oh, axis: null }
  const ds = snapDir(an, pose, start, cursor)
  if (ds.axis) return { end: ds.end, label: ds.axis, endSnap: null, axis: ds.axis }
  const cls = classifyNext(an, start, cursor)
  return { end: cursor, label: cls.role === 'vp' ? 'vp' : null, endSnap: null, axis: null }
}
