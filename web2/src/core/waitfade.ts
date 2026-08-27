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

import { C } from './constants'
import { DRAW_POSE } from './camera'
import type { CamPose } from './types'
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
