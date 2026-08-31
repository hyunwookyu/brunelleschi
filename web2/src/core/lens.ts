// 보기 렌즈(web2-31 2번) — **확정된 뒤에 «보는 방식»만 바꾼다.**
//
// ⚠⚠ **`Camera.f`·`fSource`를 안 건드린다.** 그 둘은 해의 출처이고 CLAUDE.md §1이
//    지키는 값이다(「깊이 스케일의 출처는 `Camera.fSource` 하나다」). 여기 있는 것은
//    **렌더가 쓰는 초점거리**뿐이고, 리프팅(`lift.ts`)은 언제나 `an.f`를 읽는다.
//    폐기 판정과 착수 조건은 `web2/NOTES.md`의 「31-0 착수 전 판정」이 정본이다.
//
// **기하** — 눈이 고정된 핀홀에서 f를 바꾸는 것은 **주점을 중심으로 한 균등 배율**이다:
//   project_f(P)  = principal + f·(x/−z, −y/−z)
//   project_kf(P) = principal + k·(project_f(P) − principal)
// 포즈가 무엇이든 그렇다(위 식에 포즈가 안 들어간다). 그래서 이 파일이 주는 것은
// **문서 좌표 위의 닮음 하나**이고, 앱은 그것을 «문서 → 화면» 변환에 한 번 합성한다
// (`state.viewXf`). 합성 자리가 하나이므로:
//   · 승격된 3D는 `project`(an.f)로 문서에 놓이고 그 위에 렌즈가 얹힌다 = 렌즈로 그린 것
//   · 종이의 2D 획(옐로·글씨·대기)도 **같은 배율**을 타므로 3D와의 1:1이 안 깨진다
//   · 화면 → 문서(`screenToDoc`)가 정확한 역이므로 **렌즈를 바꾼 상태에서 그은 획이
//     화면에서 본 자리에 놓인다**(원칙 d) — 리프팅은 렌즈를 아예 안 본다
//
// ⚠ 작도 시점에서 이것은 **화면 배율(`view.s`)과 같은 부류**다 — 눈이 고정된 이상 f는
//   상(像)의 크기이기 때문이다(그것이 f의 정의다). 갈리는 자리는 궤도 뒤다: 휠은 눈을
//   옮기고(`dollyBy`) 렌즈는 화각을 바꾼다. 그리고 렌즈는 **승격에 버려진다**(아래).

import type { Analysis } from './camera'
import type { Pt } from './vec'
import type { ViewOffset } from './types'
import { C } from './constants'

/** **렌즈가 있는가** — 카메라가 «닫힌» 뒤에만 있다(지시 「확정 전에는 잠근다」).
 *
 *  ⚠ 지시 문면의 «NONE»은 `fSource === 'none'`이지만 **web2에는 그 값이 안 선다**:
 *  `analyze()`가 소실점 0~1개에서도 **기본 f**(화면 폭의 상수배)를 두고 `'default'`를 적는다
 *  (지평선이 상시이므로 주점·f도 상시다 — web2-17). 그래서 D-4대로 **저장소에 실재하는
 *  확정 술어**를 쓴다: `constructionDone`(소실점 둘 또는 P1 잠금)이고, `own3d`의 굳힘이
 *  «카메라가 닫혔다»로 읽는 바로 그 값이다(#54 — 확정의 출처를 둘로 안 만든다). */
export const lensAllowed = (an: Analysis): boolean =>
  an.constructionDone && an.f !== null && an.f > 0 && an.principal !== null

/** **렌더가 쓰는 초점거리** — 손대지 않았으면(null) 확정된 f 그대로다. */
export const lensF = (an: Analysis, viewF: number | null): number | null =>
  viewF !== null && lensAllowed(an) ? viewF : an.f

/** **배율 k = viewF / f** — 손대지 않았으면 정확히 1이다(구성상 항등: 그때 렌더가
 *  종전과 한 픽셀도 안 다르다. 그래서 그 항등에는 임계를 안 건다 — #77 ㉡). */
export function lensK(an: Analysis, viewF: number | null): number {
  if (viewF === null || !lensAllowed(an)) return 1
  return viewF / an.f!
}

/** 대역 안으로 물린다 — `C.LENS_K_MIN`~`C.LENS_K_MAX` 배. 렌즈가 없으면 null. */
export function clampViewF(an: Analysis, f: number): number | null {
  if (!lensAllowed(an) || !isFinite(f) || !(f > 0)) return null
  return Math.min(C.LENS_K_MAX * an.f!, Math.max(C.LENS_K_MIN * an.f!, f))
}

/** 손잡이의 값(log2 배율, 0 = 기본) ↔ 초점거리. 대역은 [log2 K_MIN, log2 K_MAX]. */
export const lensStops = (an: Analysis, viewF: number | null): number =>
  Math.log2(lensK(an, viewF))
export function lensFromStops(an: Analysis, stops: number): number | null {
  if (!lensAllowed(an)) return null
  return clampViewF(an, an.f! * Math.pow(2, stops))
}
export const LENS_STOP_MIN = Math.log2(C.LENS_K_MIN)
export const LENS_STOP_MAX = Math.log2(C.LENS_K_MAX)

/** **가로 화각(도)** — 화면에 내는 값은 이것 하나다.
 *  ⚠ `fSource`를 화면에 안 낸다(2026-08-17 지시 3 · D-L55) — 화각은 «지금 어떻게
 *  보고 있는가»이지 «깊이가 측정인가 가정인가»가 아니다. */
export const hfovDeg = (f: number, W: number): number =>
  2 * Math.atan(W / (2 * f)) * 180 / Math.PI

/** 문서 좌표 위의 렌즈 — **주점을 고정점으로 하는 균등 배율**. k=1이면 같은 점을 낸다. */
export function lensDoc(an: Analysis, viewF: number | null, p: Pt): Pt {
  const k = lensK(an, viewF)
  if (k === 1) return p
  const c = an.principal!
  return { x: c.x + k * (p.x - c.x), y: c.y + k * (p.y - c.y) }
}
/** 그 역 — 화면에서 받은 점을 문서로 되돌린다(원칙 d의 자리). */
export function unlensDoc(an: Analysis, viewF: number | null, p: Pt): Pt {
  const k = lensK(an, viewF)
  if (k === 1) return p
  const c = an.principal!
  return { x: c.x + (p.x - c.x) / k, y: c.y + (p.y - c.y) / k }
}

/** **뷰 오프셋에 렌즈를 합성한다** — 「주점 고정 배율 k」는 닮음이므로 (s, o) 하나로 접힌다:
 *    s' = s·k · o' = o + s·(1−k)·주점
 *  k=1이면 **같은 객체를 그대로 돌려준다**(구성상 항등). 얼린 뷰(제스처 중)도 이 자리를
 *  지나므로 렌즈가 겹마다 갈리지 않는다(#54). */
export function lensView(an: Analysis, viewF: number | null, v: ViewOffset): ViewOffset {
  const k = lensK(an, viewF)
  if (k === 1) return v
  const c = an.principal!
  return { s: v.s * k, ox: v.ox + v.s * (1 - k) * c.x, oy: v.oy + v.s * (1 - k) * c.y }
}

/** **렌즈를 끼운 분석** — `f`만 바꾼 사본이다. 「화면에 어떻게 놓이는가」를 닫힌 식으로
 *  묻는 자리(돋보기 `fitView`/`fitPose`)가 이것을 받는다.
 *  ⚠ **리프팅에 이것을 주면 안 된다** — 그 순간 3D 좌표가 렌즈를 따라 움직인다.
 *  그것이 이 항목의 위약이고, `test/lens31.test.ts`가 실제로 그 판을 돌려 수치를 낸다. */
export function lensAn(an: Analysis, viewF: number | null): Analysis {
  const f = lensF(an, viewF)
  return f === an.f ? an : { ...an, f }
}

// ══════════════════════════════════════════════════════════════════════════
// 읽는 값(web2-42 3번) — **투영에 따라 대체된다. 한 자리에 하나만 뜬다.**
//
//     투시일 때   렌즈길이 mm   (35mm 판형 환산 — 라이노가 그렇다)
//     평행일 때   축척 1:100
//
// 원근에서 축척은 정의되지 않고(같은 선이 깊이마다 다른 길이로 찍힌다) 평행에서
// 렌즈길이는 무의미하므로(눈이 없다), **서로를 대신하는 것이 정직하다**(지시 문면).
// ⚠ `fSource`는 여전히 화면에 안 나온다(2026-08-17 지시 3 · D-L55).

/** **35mm 판형의 대각(mm)** — 36 × 24에서 **유도한다**(#88: 43.27을 상수로 옮겨 적지 않는다.
 *  판형을 바꿔 적는 사람이 이 줄을 볼 이유가 생긴다). 값은 43.2666…이고 지시문의 43.27이다. */
export const FILM35_DIAG_MM = Math.hypot(36, 24)

/** **35mm 판형 환산 초점거리(mm)** — 화면(문서 프레임)의 **대각**을 그 판의 대각으로 본다:
 *  같은 **대각 화각**을 내는 렌즈의 mm다.
 *
 *      mm = f · 43.27 / diag        (f·diag는 같은 단위 — 문서 px)
 *
 *  ⚠ 대각이 기준인 것이 요점이다: 가로(W)를 자로 쓰면 같은 화각이 다른 mm로 읽힌다
 *  (프레임 비가 3:2가 아니면 어긋난다 — 팔이 그 위약 판을 실제로 돌려 수치를 낸다). */
export const focal35mm = (f: number, diag: number): number => f * FILM35_DIAG_MM / diag

/** **CSS px 하나의 실물 크기(mm)** — CSS 명세가 `96 px = 1 in`으로 못 박은 값이다.
 *  기기의 진짜 화면 크기가 아니라 **웹이 약속한 길이**이고, 축척은 그 약속 위에 선다. */
export const MM_PER_CSS_PX = 25.4 / 96

/** **축척의 분모** — 「화면에서 1 잰 것이 실물에서 몇 배인가」. 1:100의 그 100이다.
 *
 *  `mmPerUnit` 세계 1단위의 실물 mm — **32-5의 `doc.scaleRef`가 정한 값 그대로**다
 *              (`lift.mmPerUnit`. 새 기제를 안 만든다 — 지시 문면).
 *  `pxPerUnit` 세계 1단위가 화면에서 차지하는 CSS px — 평행이면 `f/D · view.s`.
 *
 *  축척이 미정(치수 획이 없다)이면 **null**이고 화면에는 「미정」이 뜬다. */
export function scaleDenom(mmPerUnit: number | null, pxPerUnit: number): number | null {
  if (mmPerUnit === null || !(mmPerUnit > 0) || !(pxPerUnit > 0)) return null
  return mmPerUnit / pxPerUnit / MM_PER_CSS_PX
}

/** 축척의 화면 문자열 — 1보다 크면 `1:N`, 작으면(확대해 본다) `N:1`.
 *  ⚠ **표준 축척으로 안 붙인다**(1:98을 1:100으로 적으면 조용히 틀린 값이다 — #61의 형태).
 *  자릿수는 크기에 따라 준다: 100 이상은 정수, 그 아래는 소수 한 자리. */
export function scaleText(denom: number | null): string {
  if (denom === null) return '축척 미정'
  const [n, one] = denom >= 1 ? [denom, false] : [1 / denom, true]
  const t = n >= 100 ? String(Math.round(n)) : n.toFixed(1)
  return one ? `축척 ${t}:1` : `축척 1:${t}`
}

/** 렌즈길이의 화면 문자열 — 35mm 환산 mm. 정수로 읽는다(사진의 관례이고, 소수 첫째
 *  자리는 화각 0.1° 아래라 사람이 못 가른다). */
export const focalText = (f: number, diag: number): string =>
  `렌즈 ${Math.round(focal35mm(f, diag))}mm`
