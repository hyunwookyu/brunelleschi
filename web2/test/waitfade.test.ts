// web2-13 3-a — 대기 획 시점 감쇠(waitFadeFactor·atOwnPose)의 단위 팔.
//
// 반증 조건(D-3): 감쇠를 되돌리면(호출부가 옛 식 «own ? 1 : 0.3»으로 가면) 중간
// 각도의 기대값이 0.5 대역이 아니라 0.3/1이 되므로 아래 「중간 각도」 팔이 실패한다 —
// e2e(waitfade.spec)가 설정 체크박스로 실제 되돌림을 실행해 확인한다.

import { describe, it, expect } from 'vitest'
import { waitFadeFactor, atOwnPose, poseAngleDeg } from '../src/core/waitfade'
import { DRAW_POSE } from '../src/core/camera'
import { C } from '../src/core/constants'
import { quatAxisAngle, type Quat } from '../src/core/vec'
import type { CamPose } from '../src/core/types'

const yaw = (deg: number): CamPose => ({
  p: { ...DRAW_POSE.p },
  q: quatAxisAngle({ x: 0, y: 1, z: 0 }, (deg * Math.PI) / 180) as Quat,
})

describe('waitFadeFactor — 각도로 흐려지되 창 밖 0 도달', () => {
  it('자기 시점(각도 0) = 1 — 원래 진하기', () => {
    expect(waitFadeFactor(DRAW_POSE, undefined)).toBe(1)
    const v = yaw(25)
    expect(waitFadeFactor(v, v)).toBe(1)                      // s.view 획도 자기 포즈면 1
  })
  it('중간 각도 — 선형 감쇠(창의 절반이면 0.5 대역)', () => {
    const f = waitFadeFactor(yaw(C.WAIT_FADE_DEG / 2), undefined)
    expect(f).toBeGreaterThan(0.45)
    expect(f).toBeLessThan(0.55)
  })
  it('창(WAIT_FADE_DEG) 밖 = 정확히 0 — «자기 시점에서만 보인다»가 문자 그대로다', () => {
    expect(waitFadeFactor(yaw(C.WAIT_FADE_DEG), undefined)).toBe(0)
    expect(waitFadeFactor(yaw(90), undefined)).toBe(0)
    // s.view 획 — 다른 궤도 포즈끼리도 각도가 벌면 0(옛 own 불리언은 이것을 1로 읽었다)
    expect(waitFadeFactor(yaw(80), yaw(20))).toBe(0)
  })
  it('회전 없는 이동(팬·달리) — 종전 흐림 0.3 유지(진해지는 회귀 방지)', () => {
    const panned: CamPose = { p: { x: DRAW_POSE.p.x + 1, y: DRAW_POSE.p.y, z: DRAW_POSE.p.z }, q: DRAW_POSE.q }
    expect(waitFadeFactor(panned, undefined)).toBe(0.3)
    expect(atOwnPose(panned, undefined)).toBe(false)          // 질감도 안 얹는다
  })
  it('poseAngleDeg — 사원수 사잇각이 도 단위로 맞는다(반증: 각도를 넣은 만큼 나온다)', () => {
    expect(poseAngleDeg(DRAW_POSE.q, yaw(30).q)).toBeCloseTo(30, 6)
    expect(poseAngleDeg(yaw(20).q, yaw(50).q)).toBeCloseTo(30, 6)
  })
})
