// 치수 — 스케일·단위·파싱·표기·길이 계산의 **단일 출처**(web2-08 지시 4).
//
// 스케일 모델(4-1): 문서는 세계 단위(눈높이 게이지)로 풀리고, **첫 치수 입력이
// `Doc.mmPerUnit`(세계 1단위 = 몇 mm)을 정한다.** 그때까지 그린 것과 앞으로 그릴 것이
// 그 한 값으로 전부 실척이 된다 — 기하는 안 움직인다(환산이지 변형이 아니다).
// `constants.ts`의 눈높이 상수 주석이 미리 적어 둔 「실척 입력이 게이지를 대체한다」가
// 이 자리다 — 대체의 형태가 «지우고 다시 풀기»가 아니라 «환산 계수 하나»다(A-3).
//
// 이후 치수(4-2): `Stroke.dim`(mm)이 실려 있으면 리프팅이 **시작점과 방향만 취하고
// 길이를 그 값으로 바꾼다**(`lift.ts`). 첫 치수 획도 같은 규칙인데, mmPerUnit이 바로
// 그 획의 길이에서 나왔으므로 구성상 무변형이다 — 갈래가 하나 준다.
//
// **길이는 여기서만 계산한다**(4-5 「한 곳에서 계산해 셋이 읽는 구조」):
// 그리는 중의 미리보기(`draft.ts`가 부른다) · 리본 패널의 숫자 · 확정 3D 길이가
// 전부 `lenMm`/`solveEnd3`를 거친다. 셋의 일치는 `test/dim.test.ts`가 잰다.

import type { Analysis } from './camera'
import { rayThrough, project } from './camera'
import { closestOnLineToRay, type LiftResult } from './lift'
import type { CamPose } from './types'
import { C } from './constants'
import { type Pt, type V3, add3, sub3, mul3, len3 } from './vec'

export type Unit = 'mm' | 'cm' | 'm'
export const UNITS: Unit[] = ['mm', 'cm', 'm']
/** 단위 → mm 환산 */
export const UNIT_MM: Record<Unit, number> = { mm: 1, cm: 10, m: 1000 }

/** 3D 길이 → mm. mmPerUnit이 없으면(치수 이전) null — 무스케일을 숫자로 위장하지 않는다. */
export function lenMm(a3: V3, b3: V3, mmPerUnit: number | null): number | null {
  if (mmPerUnit === null || !(mmPerUnit > 0)) return null
  return len3(sub3(b3, a3)) * mmPerUnit
}

/** 치수 스냅(4-7) — mm를 step의 배수로. 0이 되면 한 칸을 지킨다(길이 0 획을 안 만든다). */
export function snapMm(mm: number, step: number): number {
  if (!(step > 0)) return mm
  const k = Math.round(mm / step)
  return Math.max(1, k) * step
}

/** **시작점 a3에서 축 방향 dir로, 화면점 end를 지나는 광선과의 최근접 끝점.**
 *  그리기 미리보기(실시간 길이·치수 스냅)와 리프팅이 같은 기하를 풀도록 여기 하나에 둔다.
 *  평행이거나 광선이 없으면 null. */
export function solveEnd3(
  an: Analysis, pose: CamPose, a3: V3, dir: V3, end: Pt,
): V3 | null {
  const ray = rayThrough(an, pose, end)
  if (!ray) return null
  return closestOnLineToRay(a3, dir, ray)
}

/** 끝점을 축 위에서 길이 mm로 다시 놓는다 — 방향(부호)은 지금 풀린 끝점 쪽을 지킨다.
 *  화면으로 되돌릴 수 없으면(카메라 뒤) null — 그때는 스냅을 안 건다. */
export function endAtMm(
  an: Analysis, pose: CamPose, a3: V3, dir: V3, b3: V3, mm: number, mmPerUnit: number,
): { b3: V3; end: Pt } | null {
  const d = sub3(b3, a3)
  const t = d.x * dir.x + d.y * dir.y + d.z * dir.z   // dir는 단위 — 부호가 방향이다
  if (!(mm > 0) || !(mmPerUnit > 0)) return null
  const L = mm / mmPerUnit
  const nb3 = add3(a3, mul3(dir, t >= 0 ? L : -L))
  const end = project(an, pose, nb3)
  if (!end) return null
  return { b3: nb3, end }
}

// ── 표기 (4-6 · 4-8) ─────────────────────────────────────────────────────

/** mm → 화면 문자열. 단위 환산 후 자릿수를 자른다.
 *  기본은 **읽는 자리만 반올림**한다(mm 정수 · cm 1자리 · m 3자리 — 값은 안 바뀐다).
 *  `exact`면 있는 그대로(무한소수 표기 옵션 4-8 — fp 잡음만 10자리에서 끊는다). */
export function formatMm(mm: number, unit: Unit, exact = false): string {
  const v = mm / UNIT_MM[unit]
  if (exact) {
    const s = Number(v.toFixed(10)).toString()
    return `${s} ${unit}`
  }
  const digits = unit === 'mm' ? 0 : unit === 'cm' ? 1 : 3
  return `${Number(v.toFixed(digits)).toString()} ${unit}`
}

/** 유효 네 자리로 자른 수 문자열 — 비(比)를 화면에 낼 때의 표기. 축척·재기가 같이 쓴다.
 *  치수 값(`formatMm`)과 자를 나눈 이유: 그쪽은 **단위가 붙은 길이**라 단위별 자릿수가
 *  규칙이고, 이쪽은 **단위가 없는 비**라 크기가 어디든 네 자리가 읽을 만하다. */
const num4 = (v: number): string => Number(v.toPrecision(4)).toString()

/** **축척 표기**(web2-32 5번) — 「세계 **1단위 = 몇 mm**」. null이면 «미정».
 *  ⚠ 없는 축척을 있는 척하지 않는다(지시 문면) — 미정일 때 숫자가 나가지 않는다.
 *  축척을 정할 수 있는 것은 **사람이 적은 첫 치수**뿐이고(29-1: 「도면의 치수는 잰 값이
 *  아니라 정한 값이다」), 그 판정은 `lift.scaleOf` 하나가 한다 — 여기는 표기뿐이다.
 *
 *  ⚠⚠ **초판은 「1 : 1250」으로 냈다가 1차 리뷰어 [8]에게 걸렸다**: 도면의 「1 : N」은
 *  **도면 길이 : 실제 길이**인데 여기 N은 그 양이 아니다 — 분모가 **임의 모델 단위**다
 *  (모델 단위는 임의값이다 — CLAUDE.md §1 · AS-C4/C5 계열). 단위가 다른 두 양이 같은
 *  표기를 쓰면 그것이 조용히 틀린 표시다. 그래서 **단위를 문면에 적는다**. */
export function formatScale(mmPerUnit: number | null): string {
  return mmPerUnit === null || !(mmPerUnit > 0) ? '미정' : `1단위 = ${num4(mmPerUnit)} mm`
}

/** **축척 미정일 때 재기가 내는 값**(web2-32 6번) — **모델 단위** 길이를 그대로, 단위를
 *  밝혀서 낸다. mm를 붙이면 그것이 «없는 축척을 있는 척»이다.
 *  ⚠ **이 수는 전역 배율에 불변이 아니다**(리뷰어 [8]) — 모델 전체가 k배로 풀리면 이 값도
 *  k배가 된다. 축척 없이 참인 유일한 진술은 **두 잰 값의 비**이고 그것은 재기가 둘 이상
 *  있어야 선다(`DEFERRED.md`). 그래서 「비」인 척하는 «1 : n» 표기를 안 쓴다 — 이 수가
 *  «모델 단위 길이»임을 문면이 그대로 말한다. */
export const formatUnits = (units: number): string => `${num4(units)} 단위`

// ── 어긋남 (web2-32 7번 = web2-30의 30-6) ────────────────────────────────
//
// 「적은 값」과 「잰 값」은 다른 것이다. 첫 치수가 축척을 정하고 나면(32-5) 둘째 치수부터
// 둘이 갈릴 수 있다 — **표시하되 고치지 않는다**(사람이 적은 값을 프로그램이 안 덮어쓴다).
//
// ⚠⚠ **잰 값은 «치수를 적용하기 전» 길이다**(`LiftResult.dimGeom`). 적용 «뒤» 길이를
// 재면 리프팅이 그 획의 길이를 dim으로 바꿔 놓았으므로 `dim/mmPerUnit × mmPerUnit = dim`
// — **구성상 항등**이고 아무것도 안 잰다(#77 ㉡). 29-2가 그 자리에서 1.000000을 얻고
// 기능을 걷었고(AS-C107), 30-6이 그 판정을 뒤집었다(0이었던 것은 표본이 하나여서였다).

/** 한 치수의 어긋남. `written` = 사람이 적은 값(mm) · `measured` = 모델이 가진 값(mm) ·
 *  `ratio` = 적은 값 ÷ 잰 값(1이면 같다) · `fold` = **대칭 자** `max(비, 1/비)`(≥ 1).
 *  축척이 미정이거나 그 획이 안 풀렸으면 null.
 *
 *  ⚠⚠ **`fold`가 판정의 자다**(web2-34 7번). 「배수로 틀렸다」는 방향에 무관한 진술이므로
 *  자도 방향에 무관해야 한다 — `|비 − 1|`은 위로 무한이고 **아래로 1에서 막혀** 작게 적은
 *  오독(3배 0.667 · 10배 0.9)이 통째로 샌다. 실측은 `stage0/out/skew34_web2.json`. */
export interface DimSkew { written: number; measured: number; ratio: number; fold: number }

export function dimSkew(lift: LiftResult, id: number): DimSkew | null {
  const s = lift.strokes.get(id)
  const g = lift.dimGeom.get(id)
  if (!s || s.dim === undefined || g === undefined) return null
  if (lift.mmPerUnit === null || !(lift.mmPerUnit > 0)) return null
  const measured = g * lift.mmPerUnit
  if (!(measured > 0)) return null
  const ratio = s.dim / measured
  return { written: s.dim, measured, ratio, fold: Math.max(ratio, 1 / ratio) }
}

/** 그 어긋남을 **화면이 말할 만한가** — 문턱은 `C.DIM_SKEW_FOLD` 하나다(D-C4).
 *  자연 분포(손획 지터 + 소실점 각 오차)의 꼬리 «위»에 놓인 값이다 — 이 표시가 말하려는 것은
 *  소음이 아니라 **오독**이다(web2-34 7번 · 근거는 `constants.ts`의 그 자리). */
export const skewOff = (k: DimSkew | null): boolean =>
  k !== null && k.fold > C.DIM_SKEW_FOLD

// ── 입력 파싱 (4-3 필기 · 4-4 음성) ──────────────────────────────────────
//
// 받는 형태: "3500" · "3.5" · "3,5" · "250mm" · "25cm" · "3.5m" ·
//            "3.5미터" · "이백오십 밀리" · "삼천오백" · "삼점오 미터"
// 단위가 없으면 fallback(지금 표시 단위)으로 읽는다.

const UNIT_WORDS: [RegExp, Unit][] = [
  [/(밀리미터|밀리|미리|mm)$/, 'mm'],
  [/(센티미터|센치미터|센티|센치|cm)$/, 'cm'],
  [/(미터|m)$/, 'm'],
]

const SINO: Record<string, number> = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 }
const SCALE: Record<string, number> = { 십: 10, 백: 100, 천: 1000, 만: 10000 }

/** 한국어 수사(십진 혼용 포함) → 수. 못 읽으면 null.
 *  "삼천오백"=3500 · "천이백"=1200 · "3천5백"=3500 · "만"=10000 · "삼점오"=3.5 */
export function parseKoreanNumber(text: string): number | null {
  const t = text.replace(/\s+/g, '')
  if (t.length === 0) return null
  // 소수점 「점」 — 앞뒤를 나눠 읽는다. 뒤는 자리 나열이다(삼점일사 = 3.14)
  const dot = t.indexOf('점')
  if (dot >= 0) {
    const whole = dot === 0 ? 0 : parseKoreanNumber(t.slice(0, dot))
    const fracStr = t.slice(dot + 1)
    if (whole === null || fracStr.length === 0) return null
    let frac = 0, scale = 0.1
    for (const ch of fracStr) {
      const d = /[0-9]/.test(ch) ? Number(ch) : SINO[ch]
      if (d === undefined) return null
      frac += d * scale
      scale /= 10
    }
    return whole + frac
  }
  let total = 0      // 만 단위 이상 누적
  let section = 0    // 만 미만 누적
  let digit: number | null = null
  let any = false
  for (const ch of t) {
    if (/[0-9]/.test(ch)) {
      digit = (digit ?? 0) * 10 + Number(ch)
      any = true
    } else if (ch in SINO) {
      if (digit !== null) return null   // "3삼" 같은 혼용 오염은 거부한다
      digit = SINO[ch]!
      any = true
    } else if (ch in SCALE) {
      const sc = SCALE[ch]!
      if (sc === 10000) {
        total += (section + (digit ?? (section === 0 ? 1 : 0))) * 10000
        // "만" 단독 = 1만 · "삼만" = 3만 · "십만" 류(십·만 연쇄)는 section이 든다
        section = 0
      } else {
        section += (digit ?? 1) * sc
      }
      digit = null
      any = true
    } else {
      return null
    }
  }
  if (!any) return null
  return total + section + (digit ?? 0)
}

/** 입력 문자열 → mm. 단위가 없으면 fallback으로 읽는다. 못 읽거나 0 이하면 null. */
export function parseDim(text: string, fallback: Unit): number | null {
  let t = text.trim().toLowerCase().replace(/[,，]/g, '.')
  if (t.length === 0) return null
  let unit: Unit | null = null
  for (const [re, u] of UNIT_WORDS) {
    const m = t.replace(/\s+$/, '').match(re)
    if (m) { unit = u; t = t.slice(0, t.length - m[0].length); break }
  }
  t = t.trim()
  let v: number | null = null
  if (/^[0-9]+(\.[0-9]+)?$/.test(t)) v = Number(t)
  else v = parseKoreanNumber(t)
  if (v === null || !isFinite(v) || v <= 0) return null
  return v * UNIT_MM[unit ?? fallback]
}
