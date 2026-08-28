// **필압 보정**(web2-26 6번 · 옵션 · 기본 꺼짐) — 재료표의 **앞단**이다.
//
// 사람의 증상 진술(그대로): 「스타일러스로 가장 자연스러운 필압으로 그리면, 그 정도는
// 실제 연필이라면 매우 약하게 그은 것에 해당한다. 따라서 나의 필압에 비해 너무 진하게
// 나온다, 진하기의 하한선이 너무 높다. HB, 2B라도 약하게 그리면 약하게 나오는 게
// 연필이고, 명확한 선을 그을 땐 종이가 찢어질 듯 연필을 세우고 눌러가면서 작도한다.
// 이 불일치는 앱상 진한 연필일수록 크게 느껴진다.」
// 사람의 판단: 「보통 건축가들은 그 정도까지 신경 쓰지 않으므로 **기본값은 현행 유지**.
// 옵션으로 넣어라.」 → 그래서 이 모듈의 함수들은 **꺼짐에서 한 번도 안 불린다.**
//
// ⚠⚠ **D-4 — 지시 3의 원인 후보가 틀렸다.** 「농도와 굵기가 지금 한 계수를 공유하고
// 있을 가능성이 크니 확인하라」 → 확인했더니 **공유가 아니라 부재**였다: 필압은
// `pressureProfile`을 타고 **굵기에만** 실리고(p5.brush의 점별 pressure), 농도는
// `strokeColor(grade)`가 등급 상수로 낸다. 즉 「약하게 그으면 옅게」가 **아예 없었다** —
// 「하한선이 너무 높다」의 정체가 그것이다(하한 = 천장 = 등급 알파 하나).
//
// ── 모형 ──────────────────────────────────────────────────────────────────
//   ① 재매핑    p' = clamp((p − p0) / (p1 − p0), 0, 1) ^ γ
//   ② 농도      alpha(p') = 바닥 + (천장_g − 바닥) · p'^k_g          ← **가파르게**
//   ③ 굵기      width(p') = 기본_g · (WIDTH_MIN + (1 − WIDTH_MIN)·p') ← **완만하게**
// 등급은 **천장과 기울기**를 정하고 **바닥은 안 정한다**(지시 4). 바닥은 전 등급 공통이라
// 2B도 약하게 그으면 거의 안 보인다 — 「진한 연필일수록 어긋남이 크다」가 그 자리였다
// (2B는 위로 남은 여유가 커서 바닥이 높으면 그만큼 더 많이 버린다).

import type { Grade } from './types'
import { MAT } from './material'
import { C } from './constants'

/** 문서 머리에 저장하는 보정 — **기기가 아니라 문서다**(지시 5).
 *  압력은 원값으로 저장하고 그릴 때 매핑하므로(원칙 b), 이 값이 기기 설정이면 옵션을
 *  켜는 순간 **예전에 그린 그림들의 농도까지 전부 바뀐다**. 파생이 아니라 설정이므로
 *  원칙 b의 「파생은 저장하지 않는다」에 안 걸린다(면·unit·scaleRef와 같은 급). */
export interface PressCal {
  on: boolean
  /** 사람이 «평소 세기»로 내는 압력 — 이 아래는 전부 바닥이다 */
  p0: number
  /** 사람이 «가장 세게» 낼 때의 압력 — 이 위는 전부 천장이다 */
  p1: number
  /** 재매핑의 굽음 — 1이면 직선. 사람이 안 고른다(보정 절차가 1을 쓴다). */
  gamma: number
}

/** 초안값 — 보정을 안 한 채 켰을 때. 「센서가 주는 0~1 중 사람이 실제로 쓰는 구간은
 *  아래쪽 3분의 1 정도다. 1.0은 스케치 중 도달하지 않는 값이다」(지시 1). */
export const defaultPressCal = (): PressCal => ({ on: false, p0: 0, p1: C.PRESS_CAL_P1, gamma: 1 })

/** 값이 성립하는가 — 저장·복원과 보정 절차가 **같은 술어**를 쓴다(#54) */
export const validPressCal = (c: PressCal): boolean =>
  Number.isFinite(c.p0) && Number.isFinite(c.p1) && Number.isFinite(c.gamma) &&
  c.p0 >= 0 && c.p1 <= 1 && c.p1 - c.p0 >= C.PRESS_CAL_MIN_SPAN && c.gamma > 0 && c.gamma <= 4

/** ① 재매핑 — 센서 압력(0..1) → 표현 압력(0..1) */
export function remapPress(p: number, cal: PressCal): number {
  const span = cal.p1 - cal.p0
  if (!(span > 0)) return Math.min(1, Math.max(0, p))
  const t = Math.min(1, Math.max(0, (p - cal.p0) / span))
  return cal.gamma === 1 ? t : Math.pow(t, cal.gamma)
}

/** 등급의 **기울기 지수** — 무를수록 작다(= 낮은 압력에서 천장에 닿는다 · 지시 4).
 *  ⛔ 새 색·새 굵기를 안 짓는다(#54) — 천장은 `MAT[g].alpha` 그대로이고 여기 있는 것은
 *  «천장까지 얼마나 빨리 가는가» 하나다. */
export const PRESS_SLOPE: Record<Grade, number> = {
  '2H': 1.8, 'H': 1.6, 'F': 1.4, 'HB': 1.2, 'B': 0.9, '2B': 0.7, 'INK': 1,
}

/** ② 농도 — 바닥은 **전 등급 공통**이고 천장만 등급이 정한다 */
export function pressAlpha(g: Grade, pMapped: number): number {
  const ceil = MAT[g].alpha
  const floor = Math.min(C.PRESS_FLOOR_ALPHA, ceil)
  const t = Math.min(1, Math.max(0, pMapped))
  return floor + (ceil - floor) * Math.pow(t, PRESS_SLOPE[g])
}

/** ③ 굵기 배수 — 농도보다 **완만하다**. 실제 연필은 세게 누르면 굵기가 1.5~2배 느는
 *  동안 농도는 거의 검정까지 간다(지시 3) — 그 비를 `PRESS_WIDTH_MIN`이 든다. */
export function pressWidthFactor(pMapped: number): number {
  const t = Math.min(1, Math.max(0, pMapped))
  return C.PRESS_WIDTH_MIN + (1 - C.PRESS_WIDTH_MIN) * t
}

/** 보정 절차의 산술(지시 2) — 두 획의 압력 **중앙값**에서 `p0`·`p1`을 뽑는다.
 *  곡선 편집기 ⛔(이 앱 성격에 안 맞는다). 중앙값인 이유: 획의 시작·끝은 눌렀다 떼는
 *  과도 구간이라 평균이 그쪽으로 끌린다.
 *  돌려주는 것이 성립 안 하면(간격이 너무 좁다) `null` — 부르는 쪽이 다시 받는다. */
export function calFromMedians(normal: number, hardest: number): PressCal | null {
  const c: PressCal = { on: true, p0: Math.min(normal, hardest), p1: Math.max(normal, hardest), gamma: 1 }
  return validPressCal(c) ? c : null
}

/** 표본 배열의 중앙값 — 보정 절차가 쓴다(빈 배열이면 null) */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2
}
