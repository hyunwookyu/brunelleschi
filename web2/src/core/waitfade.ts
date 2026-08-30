// 대기 획의 시점 감쇠(web2-13 3-a · 개정 3 초안 §5) — **표현만**. 기하·판정 불변.
//
// 대기 획은 2D밖에 없으므로 «그 시점의 화상면 위 잉크»다. 다른 시점에서는 어디 있어야
// 하는지 답이 없다 — 종전에는 화면 좌표에 눌어붙어 흐림 0.3으로 미끄러졌다(NOTES 「구조
// 결정」의 타협 — 되돌릴 조건이 web2-13 1-e 관측으로 발동했다).
//
// 현행(web2-16 3-b): **각도 창의 이진** — 창 안 1 · 밖 0. web2-13의 연속 감쇠는
// 사람이 폐지했다(「페이드 같은 거 없이 즉시」) — 개정 2 §9.4 「다른 뷰의 2D 획은
// 숨긴다」로 돌아온 셈이고, 창(C.WAIT_FADE_DEG)이 «같은 시점»의 폭이다.
// ⚠ 각도만 본다 — 회전 없는 이동(팬·줌·달리)은 감쇠를 안 만든다. 잉크는 2D 뷰 변환을
// 함께 타므로 팬·줌에서는 실제로도 제자리다(카메라 평행이동은 대역이 좁아 각도가 대표).
//
// 옛 동작으로 가는 길(A-4): `enabled=false` — 자기 시점이면 1, 아니면 0.3(종전 규칙
// 그대로). 설정 「대기 획은 그린 시점에서만」 체크박스가 이 손잡이다. 판정은 실기기.

import { C, SETTLE_ANIM_MS } from './constants'
import { DRAW_POSE } from './camera'
import { MAT } from './material'
import type { CamPose, Grade } from './types'
import type { Quat } from './vec'

/** 두 자세의 회전 차(도) — 단위 사원수 사잇각. 0 = 같은 방향. */
export function poseAngleDeg(a: Quat, b: Quat): number {
  const d = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))
  return (2 * Math.acos(d) * 180) / Math.PI
}

/** 대기 획 표시 배율 — **이진**(web2-16 3-b가 감쇠를 폐지했다): 창 안 1 · 창 밖 0.
 *  own = 획이 그려진 포즈(`Stroke.view` — 없으면 작도 포즈의 것이다, 3-a 규칙 명시).
 *  사람이 정했다: 「페이드 같은 거 없이 즉시 화면에서 없애자. 돌아오면 보이도록」 —
 *  각도 창(C.WAIT_FADE_DEG)을 벗어나는 순간 0, 창에 돌아오면 1. 중간값이 없다.
 *  ⚠ 회전 없는 이동(팬·줌·달리)은 각도 0 = 창 안 = **1**이다 — 옛 그라디언트의
 *  0.3 흐림도 함께 폐지됐다(«종이 위에서는 다 연필선» — 흐린 중간 상태가 없어야
 *  «돌려보면 남는 것이 3D다»가 즉시 읽힌다. 잉크는 뷰 변환을 타므로 팬·줌에서
 *  기하적으로도 제자리다 — 이 파일 머리주석).
 *  ⚠ 옛 동작(감쇠 끄면)은 **호출부가 종전 식 그대로** 계산한다(`own ? α : α·0.3`,
 *  own = s.view ? !atDraw : atDraw) — 여기로 옮겨 적으면 옛 경로가 «번역»이 되어
 *  A-4의 «옛 동작으로 갈 길»이 원본과 달라질 수 있다. 옛 식은 render2d에 그대로 있다. */
export function waitFadeFactor(cur: CamPose, own: CamPose | undefined): number {
  const o = own ?? DRAW_POSE
  const deg = poseAngleDeg(cur.q, o.q)
  // 경계의 fp 부스러기(사원수 왕복이 30°를 29.999…로 낸다)는 밖으로 — «창 밖 0»이 문면이다
  return C.WAIT_FADE_DEG - deg > 1e-9 ? 1 : 0
}

/** 질감(grain·번짐·brush)이 얹히는 «자기 시점» 판정 — 종전 own 불리언의 자리.
 *  감쇠 중간값에 질감을 얹으면 몸체보다 질감이 진해 보이는 역전이 생기므로 정확히
 *  자기 시점(회전·위치 다 일치)에서만 얹는다(종전에도 own에만 얹었다). */
export const atOwnPose = (cur: CamPose, own: CamPose | undefined): boolean => {
  const o = own ?? DRAW_POSE
  return poseAngleDeg(cur.q, o.q) < 1e-6 &&
    Math.abs(cur.p.x - o.p.x) + Math.abs(cur.p.y - o.p.y) + Math.abs(cur.p.z - o.p.z) < 1e-9
}

// ── 대기의 «색»(web2-37 2번) — 논포토 블루. **표시할 것은 대기다** ─────────────────
//
// 왜 여기인가: 이 파일이 이미 «대기 획의 표현»의 자리다(위 머리주석 — 기하·판정 불변).
// 색을 render2d의 `COL`에 두면 `filmlayer`가 그것을 못 읽는다(render2d가 filmlayer를
// import하므로 반대 방향은 순환이다) — 그러면 같은 색이 두 자리에 적히고 그것이 #54다.
// `COL`의 머리주석이 이 상수를 «대기 몸체 색의 자리»로 가리킨다(#65의 규약 그대로).
//
// **확정에는 아무것도 안 붙인다**(지시문의 「하지 말 것」): 확정 획의 색·알파·굵기는
// 한 글자도 안 바뀐다. `bodyHex(g, 0)`이 `MAT[g].color`를 **그 문자열 그대로** 돌려주는
// 것이 그 보장이고, 단위 팔이 여섯 급 전부에서 그 동일성을 잰다.
//
// 왜 «농도»가 아니라 «색상»인가(지시 문면): 농도로 가르면 2H 확정선과 2B 대기선이
// 섞인다 — 경도가 이미 농도 축을 쓰고 있다. 논포토 블루는 그 축과 직교하고, 뜻이
// 정확히 「아직 진짜가 아님」이며(제판에서 안 찍히는 색), 건축가가 아는 표현이다.

/** **논포토 블루** — 제도·제판의 관습색 그대로(#A4DDED). 새로 지은 수가 아니다.
 *  알파·굵기는 **재료가 그대로 정한다**(`MAT[g]`) — 이 상수는 색상 축 하나만 든다.
 *  ⚠ 되돌릴 조건: 실기기에서 「대기선이 안 보인다」. 그때 손잡이는 이 값이지
 *  알파가 아니다(알파를 건드리면 등급 축과 다시 섞인다). */
export const WAIT_INK = '#a4dded'

/** D-3 반증 손잡이(web2-37 2번 · e2e/단위만 켠다 — 선례: render2d의 `setForceConstructing`).
 *  `off` = 청색을 끈다(전부 흑연 — 37-2 이전 판) · `all` = **확정에도 청색을 칠한다**.
 *  「대기가 청색이다」를 재는 팔은 `off`에서, 「확정은 흑연이다」를 재는 팔은 `all`에서
 *  빨개져야 한다. 둘 다 안 빨개지면 그 팔은 아무것도 안 잰다. */
export type WaitInkMode = 'on' | 'off' | 'all'
let INK_MODE: WaitInkMode = 'on'
export const setWaitInkMode = (m: WaitInkMode): void => { INK_MODE = m }
export const waitInkMode = (): WaitInkMode => INK_MODE

const hexPair = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)

/** 두 색의 선형 혼합 — t=0이 a, t=1이 b. sRGB 그대로다(브러시의 `alphaColor`와 같은 셈). */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const c = (i: number) => Math.round(hexPair(a, i) * (1 - k) + hexPair(b, i) * k)
  return `#${((c(0) << 16) | (c(1) << 8) | c(2)).toString(16).padStart(6, '0')}`
}

/** **획 몸체의 색** — `mix` 1 = 대기(논포토 블루) · 0 = 확정(재료의 흑연).
 *  0에서 재료색을 **문자열 그대로** 돌려준다(혼합의 반올림도 안 타므로 확정 픽셀이
 *  한 비트도 안 움직인다 — 「확정에 표시를 붙이지 마라」의 구성상 보장). */
export function bodyHex(g: Grade, mix: number): string {
  const base = MAT[g].color
  if (INK_MODE === 'off') return base
  const m = INK_MODE === 'all' ? 1 : mix
  if (!(m > 0)) return base
  return mixHex(base, WAIT_INK, m)
}

/** **정착 전이** — 대기가 확정이 된 뒤 경과 ms를 넣으면 1 → 0으로 내려간다.
 *  「움직임은 눈에 띄고 끝나면 사라진다」(지시 문면)이므로 양 끝이 매끈한 코사인이다:
 *  시작에서 튀지 않고 끝에서 계단이 안 생긴다. 창 밖은 정확히 0(= 확정과 동일한 픽셀). */
export function settleFade(elapsedMs: number): number {
  if (!(elapsedMs > 0)) return 1
  if (elapsedMs >= SETTLE_ANIM_MS) return 0
  return 0.5 * (1 + Math.cos((Math.PI * elapsedMs) / SETTLE_ANIM_MS))
}
