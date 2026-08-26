// 미리보기 결정 — 한 획의 시작점·끝점이 무엇이 되는가.
//
// **여기 하나에서만 정한다.** 앱(input.ts)과 측정 하네스가 같은 함수를 부른다 —
// 측정 경로와 앱 경로를 가르면 측정이 앱을 안 재게 된다(camera.ts의 classifyNext와 같은 이유).
//
// 순서: 오스냅(점)이 축 스냅(방향)을 이긴다 — Rhino 선례.

import type { CamPose } from './types'
import type { Analysis, AxisId } from './camera'
import { classifyNext, vpAt } from './camera'
import type { LiftResult } from './lift'
import { osnap, type OsnapHit, type OsnapSettings } from './osnap'
import { snapDir } from './snap'
import { lenMm, snapMm, solveEnd3, endAtMm } from './dim'
import { C } from './constants'
import { type Pt, type V3, pt } from './vec'

export interface EndResolve {
  end: Pt
  /** 'horizon' | 'vp' | 축id | null(자유) */
  label: string | null
  endSnap: OsnapHit | null
  /** 축 스냅이 붙었으면 그 축 — 오스냅이 이겼으면 null */
  axis: AxisId | null
  /** **지금 그리고 있는 선의 실척 길이 mm** — 스케일·3D가 서야 값이 있다(web2-08 지시 4-5).
   *  치수 스냅이 걸렸으면 스냅된 값이다. 리본 패널·확정 3D와 같은 계산이다(`core/dim.ts`). */
  lenMm: number | null
}

/** 치수 옵션 — 입력(input.ts)과 하네스가 같은 값을 넘긴다.
 *  `snapStep` null = 치수 스냅 꺼짐(기본. 지시 4-7 — 옵션이다). */
export interface DimOpts {
  mmPerUnit: number | null
  snapStep: number | null
}

/** 시작점 — 오스냅만 본다 */
export function resolveStart(
  lift: LiftResult, pose: CamPose, p: Pt, set: OsnapSettings,
): OsnapHit | null {
  return osnap(lift, pose, p, set)
}

/** 끝점 — 지평선 강제 → 오스냅 → 축 스냅(+치수 스냅) → 자유 */
export function resolveEnd(
  lift: LiftResult, pose: CamPose, an: Analysis,
  start: Pt, startP3: { p3: V3 | null },
  cursor: Pt, set: OsnapSettings, dim?: DimOpts,
): EndResolve {
  if (an.horizonY === null) {
    return { end: pt(cursor.x, start.y), label: 'horizon', endSnap: null, axis: null, lenMm: null }
  }
  const a3 = startP3.p3
  const scale = dim?.mmPerUnit ?? null
  // ① 오스냅이 잡히면 그 점으로 간다 — 점이 방향을 이긴다(Rhino 선례).
  //    치수 스냅도 점을 안 이긴다 — 사람이 붙인 점은 그대로 확정된다(원칙 d · #63).
  const oh = osnap(lift, pose, cursor, set, startP3)
  if (oh) {
    const mm = a3 && oh.p3 ? lenMm(a3, oh.p3, scale) : null
    return { end: oh.p, label: null, endSnap: oh, axis: null, lenMm: mm }
  }

  // ② **소실점에서 뻗는 획은 자유다**(web2-06 지시 1). 축 스냅이 이 획을 지평선 위로
  //    납작하게 눌렀다(실측: vp0=(900,400)에서 (700,600)으로 그으면 끝점이 (700,400)).
  //    이 획은 «있는 축 중 하나»를 고르는 것이 아니라 **그 소실점의 살을 고르는 중**이고,
  //    소실점을 지나는 직선은 어느 방향이든 그 소실점의 살이다 — 「가장 가까운 축」이라는
  //    물음 자체가 성립하지 않는다. 끝점 오스냅(①)은 그대로 이긴다(점이 방향을 이긴다).
  if (vpAt(an, pose, start)) return { end: cursor, label: null, endSnap: null, axis: null, lenMm: null }

  // ③ **새 축을 정의하는 획이면 자유다.** 이 한 경우만 예외이고, 예외인 이유가 분명하다:
  //    그 획은 «있는 축 중 하나»가 아니라 **축을 만드는 중**이다. 여기서 기존 축에 붙이면
  //    두 번째 소실점을 영영 못 만든다(실측: 팔 열셋이 그것으로 깨졌다).
  const cls = classifyNext(an, start, cursor)
  if (cls.role === 'vp') return { end: cursor, label: 'vp', endSnap: null, axis: null, lenMm: null }

  // ④ 그 외에는 **항상 가장 가까운 축**이다. 임계가 없고 자유 방향도 없다(지시 5-a).
  const ds = snapDir(an, pose, start, cursor)
  // ── 실시간 길이 + 치수 스냅(web2-08 지시 4-5·4-7) ─────────────────────
  // 시작점이 3D에 있고 축이 정해졌을 때만 길이가 정의된다 — 그때 미리보기 길이는
  // **리프팅이 확정할 값과 같은 계산**이다(`solveEnd3` — 같은 최근접점 풀이).
  // 치수 스냅이 켜져 있으면 끝점을 축 위에서 스냅된 길이 자리로 옮긴다 —
  // **표시만이 아니라 확정 좌표가 그 길이다**(지시 4-7 문면).
  if (a3 && ds.axis) {
    const dir = an.axes.find(x => x.id === ds.axis)?.dir
    if (dir) {
      const b3 = solveEnd3(an, pose, a3, dir, ds.end)
      if (b3) {
        const mm = lenMm(a3, b3, scale)
        if (mm !== null && dim?.snapStep) {
          const snapped = snapMm(mm, dim.snapStep)
          const at = endAtMm(an, pose, a3, dir, b3, snapped, scale!)
          if (at) return { end: at.end, label: ds.axis, endSnap: null, axis: ds.axis, lenMm: snapped }
        }
        return { end: ds.end, label: ds.axis, endSnap: null, axis: ds.axis, lenMm: mm }
      }
    }
  }
  return { end: ds.end, label: ds.axis, endSnap: null, axis: ds.axis, lenMm: null }
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
