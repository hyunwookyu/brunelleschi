// 스케일바(web2-47 47-1) — **공간에 놓인 자**다. 지도 앱의 유동 축척바 방식(지시 문면):
// 목표 폭에 들어가는 실제 길이를 구하고 1·2·5×10ⁿ 중 가장 큰 값으로 내린다.
//
// 투시의 뒤틀림(지시): 같은 실제 길이가 깊이마다 다른 화면 길이가 된다 — **놓는 깊이를
// 정해 놓고 그 자리에서 계산한다**. 기준은 «화면 아래쪽 지면»: 고정 화면 닻(anchor)을
// 지면으로 쏘아(pointOnGround) 그 접지점의 깊이가 기준이다. 평행 사영에서는 깊이가
// 무관하므로 같은 식이 그대로 진짜 도면의 스케일바가 된다(균일성은 팔이 잰다).
//
// ⚠ #61(조용히 틀린 치수)의 자리다 — 막대의 끝점은 «고른 값만큼 지면을 간 3D 점의
// 정확한 재사영»이다. 목표 폭 안 배율의 선형 근사로 늘리지 않는다(투시에서 그 근사가
// 조용히 틀린다). 42-3(화면 축척 문자)과 겹치지 않는다 — 그쪽은 비(比), 이쪽은 자다.
//
// 축척 미정(mmPerUnit null)이면 null — 무스케일을 숫자로 위장하지 않는다(lenMm의 규약).

import type { CamPose } from './types'
import { pointOnGround, project, type Analysis } from './camera'
import { sub3, add3, mul3, len3, type V3, type Pt } from './vec'
import { formatMm } from './dim'
import type { Unit } from './dim'

export interface ScaleBar {
  /** 막대 두 끝(문서 좌표 — 화면 변환은 표시 계층 몫) */
  a: Pt
  b: Pt
  /** 고른 실제 길이(mm — 1·2·5×10ⁿ) */
  mm: number
  /** 표시 문자열(단위는 문서 단위) */
  label: string
  /** 기준 접지점(3D — 팔이 깊이 일관성을 재는 자리) */
  g: V3
}

/** 1·2·5×10ⁿ 중 x 이하의 최댓값. x ≤ 0이면 null. */
export function niceFloor(x: number): number | null {
  if (!(x > 0)) return null
  const e = Math.floor(Math.log10(x))
  for (const m of [5, 2, 1]) {
    const v = m * Math.pow(10, e)
    if (v <= x + 1e-12) return v
  }
  return Math.pow(10, e - 1) * 5   // x가 10^e 바로 아래 대역(예: 0.9·10^e < 1·10^e)
}

/** 막대를 계산한다 — 닻(문서 좌표)에서 화면 오른쪽으로 목표 폭만큼 간 지면 구간.
 *  못 세우면(축척 미정 · 닻이 지평선 위 · 지면 이탈) null — 안 뜬다. */
export function scaleBarAt(
  an: Analysis, pose: CamPose, mmPerUnit: number | null,
  anchor: Pt, targetPx: number, unit: Unit,
): ScaleBar | null {
  if (mmPerUnit === null || !(mmPerUnit > 0)) return null
  const g = pointOnGround(an, pose, anchor)
  if (!g) return null
  const g2 = pointOnGround(an, pose, { x: anchor.x + targetPx, y: anchor.y })
  if (!g2) return null
  const span = sub3(g2, g)
  const L = len3(span)
  if (!(L > 1e-9)) return null
  const mmAcross = L * mmPerUnit          // 목표 폭에 들어가는 실제 길이(그 깊이에서)
  const mm = niceFloor(mmAcross)
  if (mm === null) return null
  // 끝점 = 고른 길이만큼 «지면 방향 그대로» 간 3D 점의 정확한 재사영(#61 — 근사 ⛔)
  const b3 = add3(g, mul3(span, (mm / mmPerUnit) / L))
  const a2 = project(an, pose, g)
  const b2 = project(an, pose, b3)
  if (!a2 || !b2) return null
  return { a: a2, b: b2, mm, label: formatMm(mm, unit), g }
}
