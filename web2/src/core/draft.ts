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
import { C } from './constants'
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
  // ① 오스냅이 잡히면 그 점으로 간다 — 점이 방향을 이긴다(Rhino 선례)
  const oh = osnap(lift, pose, cursor, set, startP3)
  if (oh) return { end: oh.p, label: null, endSnap: oh, axis: null }

  // ② **새 축을 정의하는 획이면 자유다.** 이 한 경우만 예외이고, 예외인 이유가 분명하다:
  //    그 획은 «있는 축 중 하나»가 아니라 **축을 만드는 중**이다. 여기서 기존 축에 붙이면
  //    두 번째 소실점을 영영 못 만든다(실측: 팔 열셋이 그것으로 깨졌다).
  const cls = classifyNext(an, start, cursor)
  if (cls.role === 'vp') return { end: cursor, label: 'vp', endSnap: null, axis: null }

  // ③ 그 외에는 **항상 가장 가까운 축**이다. 임계가 없고 자유 방향도 없다(지시 5-a).
  const ds = snapDir(an, pose, start, cursor)
  return { end: ds.end, label: ds.axis, endSnap: null, axis: ds.axis }
}

/** 뗄 때 무엇을 확정하는가 — null이면 아무것도 안 남긴다(잡음).
 *
 *  **탭 = 찍기**(지시 4-d). 지평선 위를 찍으면 길이 0의 표식을 남기고 그것이 소실점이 된다
 *  (`classifyNext`가 받는다). 별도 도구도 모드도 없다 — 탭은 지금까지 잡음으로 버려지던
 *  자리이고, 클릭 = 점 찍기는 캐드 선례다(A-3). 지평선에서 먼 탭은 종전대로 잡음이다.
 *
 *  앱(`input.ts`)과 측정 하네스가 **같은 함수**를 부른다. 갈리면 하네스가 앱을 안 재게 된다. */
export function resolveCommit(
  an: Pick<Analysis, 'horizonY'>, start: Pt, end: Pt, osnapRadius: number,
): { a: Pt; b: Pt } | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) > C.TAP_MAX_PX) return { a: start, b: end }
  const hz = an.horizonY
  if (hz === null) return null
  if (Math.abs(start.y - hz) > osnapRadius) return null
  const onHz = pt(start.x, hz) // 지평선 위로 붙인다 — 붙은 좌표가 그대로 확정(원칙 d)
  return { a: onHz, b: onHz }
}
