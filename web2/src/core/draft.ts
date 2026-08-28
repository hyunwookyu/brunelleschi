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
import type { ExtAcq } from './extacq'
import { snapDir } from './snap'
import { lenMm, snapMm, solveEnd3, endAtMm } from './dim'
import { C } from './constants'
import { type Pt, type V3, pt } from './vec'

export interface EndResolve {
  end: Pt
  /** 'vp' | 축id | null(자유) — 'horizon'은 web2-17에서 없어졌다(지평선은 획이 아니다) */
  label: string | null
  endSnap: OsnapHit | null
  /** 축 스냅이 붙었으면 그 축 — 오스냅이 이겼으면 null */
  axis: AxisId | null
  /** **이 획이 만들 소실점 자리**(role 'vp'일 때 — web2-19 1-b). 몸체는 재료색이고
   *  「소실점을 만든다」는 이 자리의 파선 ✕가 말한다. 값은 classifyNext가 낸 것
   *  그대로다(확정 시 vps에 들어갈 바로 그 좌표 — 원칙 d: 예고가 그대로 확정된다). */
  vp?: Pt
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

/** 수선의 발 — 오스냅 점 p를 조준선(start→through의 무한 직선)에 사영한다(2-a).
 *  직선은 양방향이다 — 축의 반대 방향으로 긋는 것도 그 축이다(snapDir과 같은 규약).
 *  퇴화(조준선 길이 ~0)면 p를 그대로 돌려준다 — 그때는 사영할 방향이 없다. */
function footOnAim(start: Pt, through: Pt, p: Pt): Pt {
  const ux = through.x - start.x, uy = through.y - start.y
  const L2 = ux * ux + uy * uy
  if (L2 < 1e-12) return p
  const t = ((p.x - start.x) * ux + (p.y - start.y) * uy) / L2
  return pt(start.x + ux * t, start.y + uy * t)
}

/** 시작점 — 오스냅만 본다. `extAcq`는 획득된 연장선(web2-18 2부 — 없으면 ext가 안 난다). */
export function resolveStart(
  lift: LiftResult, pose: CamPose, p: Pt, set: OsnapSettings,
  extAcq: readonly ExtAcq[] = [],
): OsnapHit | null {
  return osnap(lift, pose, p, set, undefined, undefined, extAcq)
}

/** 끝점 — 오스냅 → 축 스냅(+치수 스냅) → 자유 (지평선 강제 갈래는 web2-17에서 삭제) */
export function resolveEnd(
  lift: LiftResult, pose: CamPose, an: Analysis,
  start: Pt, startP3: { p3: V3 | null },
  cursor: Pt, set: OsnapSettings, dim?: DimOpts,
  /** 획득된 연장선(web2-18 2부) — 여기 없는 선분의 연장은 후보가 아니다 */
  extAcq: readonly ExtAcq[] = [],
  /** 직전 판정(web2-26 3번 — 선 후보의 이력). 호출자가 `draft.endSnap`을 그대로 준다. */
  prevSnap?: OsnapHit | null,
): EndResolve {
  const a3 = startP3.p3
  const scale = dim?.mmPerUnit ?? null

  // ⓪ **조준선 먼저**(web2-15 1번) — 겉보기 교차는 «지금 그리는 획이 따라갈 직선»이
  //    있어야 성립한다(지시 1-a). 그 직선은 아래 ④의 축 스냅이 정하므로 순서를 뒤집어
  //    한 번 미리 푼다(같은 `snapDir` 호출 — 두 자리에 다른 식을 두지 않는다. 아래는
  //    이 값을 재사용한다). 자유로 갈 획(②·③)은 방향이 안 정해지므로 조준선이 없다.
  const freeVp = vpAt(an, pose, start)
  const cls = freeVp ? null : classifyNext(an, start, cursor)
  const ds0 = (!freeVp && cls!.role !== 'vp') ? snapDir(an, pose, start, cursor) : null
  const aim = ds0?.axis ? { start, through: ds0.end } : undefined

  // ① 오스냅이 잡히면 그 점으로 간다.
  //    치수 스냅도 점을 안 이긴다 — 사람이 붙인 점은 그대로 확정된다(원칙 d · #63).
  //
  //    ── 축이 걸린 획에서는 «점이 방향을 이긴다»가 **안 선다**(web2-16 2-a) ──
  //    제도에서 축을 걸고 그은 선은 휘지 않는다 — 무언가와 만나면 **축선이 그것을
  //    지나는 자리**에서 만난다. 오스냅 점을 그대로 받으면 끝이 축선 밖으로 밀리고,
  //    그 밀림÷길이가 축 허용각을 넘으면 axisOfStroke가 축을 못 줘 획이 3D로 안
  //    올라간다 — 조용한 무산(web2-15 2차 [3]: edge_band 297칸 중 52칸 · 짧은 획일수록
  //    심하다. L40에서 28). 그래서 축이 걸린 획에서 **2D(대기) 특징점**은 축이 방향을
  //    주고 오스냅은 그 방향 위의 위치만 준다: 점을 축선에 사영한다(수선의 발). xint는
  //    구성상 이미 축선 위라 그대로다. 선례(A-3): SketchUp 추론 잠금 · Rhino 직교+오스냅.
  //    끝은 구성상 축선 위이므로 축이 산다 — 두 구속이 같이 선다.
  //    ⚠ **3D 특징점(p3 있음)은 종전대로 점이 그대로 이긴다**(#63 — 뒤집지 않는다).
  //    비대칭의 근거: 3D 점에 붙으면 양 끝이 3D라 획이 축 없이도 승격된다(끝점 매칭 —
  //    #63의 면 회귀 팔이 그 동작을 지킨다: 루프가 닫혀야 면이 선다). 죽는 것은 **줄 것이
  //    없는 2D 특징점**에 끌려갈 때뿐이고, 그때만 축이 이겨야 둘 다 산다.
  //    ⚠ 축이 안 걸린 획(자유·소실점 살·축 정의)에서는 종전대로 점이 그대로 이긴다.
  const oh = osnap(lift, pose, cursor, set, startP3, aim, extAcq, prevSnap)
  if (oh) {
    if (ds0?.axis && oh.p3 === null) {
      const end = oh.kind === 'xint' ? oh.p : footOnAim(start, ds0.end, oh.p)
      const dir = an.axes.find(x => x.id === ds0.axis)?.dir
      const b3 = a3 && dir ? solveEnd3(an, pose, a3, dir, end) : null
      return {
        end, label: ds0.axis, endSnap: oh, axis: ds0.axis,
        lenMm: a3 && b3 ? lenMm(a3, b3, scale) : null,
      }
    }
    const mm = a3 && oh.p3 ? lenMm(a3, oh.p3, scale) : null
    return { end: oh.p, label: null, endSnap: oh, axis: null, lenMm: mm }
  }

  // ② **소실점에서 뻗는 획은 자유다**(web2-06 지시 1). 축 스냅이 이 획을 지평선 위로
  //    납작하게 눌렀다(실측: vp0=(900,400)에서 (700,600)으로 그으면 끝점이 (700,400)).
  //    이 획은 «있는 축 중 하나»를 고르는 것이 아니라 **그 소실점의 살을 고르는 중**이고,
  //    소실점을 지나는 직선은 어느 방향이든 그 소실점의 살이다 — 「가장 가까운 축」이라는
  //    물음 자체가 성립하지 않는다. 끝점 오스냅(①)은 그대로 이긴다(점이 방향을 이긴다).
  if (freeVp) return { end: cursor, label: null, endSnap: null, axis: null, lenMm: null }

  // ③ **새 축을 정의하는 획이면 자유다.** 이 한 경우만 예외이고, 예외인 이유가 분명하다:
  //    그 획은 «있는 축 중 하나»가 아니라 **축을 만드는 중**이다. 여기서 기존 축에 붙이면
  //    두 번째 소실점을 영영 못 만든다(실측: 팔 열셋이 그것으로 깨졌다).
  if (cls!.role === 'vp') return { end: cursor, label: 'vp', endSnap: null, axis: null, lenMm: null, vp: cls!.vp }

  // ④ 그 외에는 **항상 가장 가까운 축**이다. 임계가 없고 자유 방향도 없다(지시 5-a).
  const ds = ds0!            // ⓪에서 이미 풀었다 — 같은 인자·같은 함수(두 번 안 부른다)
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
/** 「잘못 찍힌 점」 문(web2-13 3-b · 개정 3 초안 §6) — **탭도 아니고 획도 아닌** 대역을
 *  애초에 만들지 않는다. 만들고 숨기면 안 보이는데 교차·면·오스냅에 참여하는 지뢰가 된다.
 *
 *  둘 다 **화면 css px**로 받는다(호출부가 × view.s로 환산 — dpr는 캔버스 변환이 진다).
 *  - endDistPx ≤ TAP_MAX_PX 는 **탭이다** — 여기 안 걸린다(소실점 찍기 경로 불변.
 *    resolveCommit이 종전대로 판정한다 — 3부 불변식: 판정·기하 안 바뀜).
 *  - bboxDiagPx 로 잰다 — 끝점 거리로 재면 닫힌 한 붓(끝이 시작으로 돌아온 획)이
 *    오폐기된다(`stray_gate_web2.json` 첫 실측이 보였다). 탭이 살짝 끌린 것은 bbox도 작다.
 *  - 값 근거·실획 대비 폐기율은 C.STRAY_MIN_PX 주석과 원장. 버린 수는 진단 패널이 센다. */
export const isStray = (endDistPx: number, bboxDiagPx: number): boolean =>
  endDistPx > C.TAP_MAX_PX && bboxDiagPx < C.STRAY_MIN_PX

export function resolveCommit(
  an: Pick<Analysis, 'horizonY'>, start: Pt, end: Pt, osnapRadius: number,
): { a: Pt; b: Pt } | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) > C.TAP_MAX_PX) return { a: start, b: end }
  const hz = an.horizonY
  if (Math.abs(start.y - hz) > osnapRadius) return null
  const onHz = pt(start.x, hz) // 지평선 위로 붙인다 — 붙은 좌표가 그대로 확정(원칙 d)
  return { a: onHz, b: onHz }
}
