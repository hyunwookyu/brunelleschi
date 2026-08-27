// web2-13 3-a → **web2-16 3-b 개정** — 대기 획 표시 판정(waitFadeFactor·atOwnPose).
// 사람이 감쇠(그라디언트)를 폐지했다: 「페이드 같은 거 없이 즉시」. 이제 이진이다 —
// 창 안 1 · 창 밖 0. 중간값이 없다.
//
// 반증 조건(D-3): **페이드를 되살리면**(1 − 각도/창의 그라디언트로 돌아가면) 아래
// 「창 안 어디든 1」 팔이 실패한다(창 절반에서 0.5가 나온다) — 그 실행을 실제로 했다
// (그라디언트 식을 임시 복원해 실패 확인 후 제거 — NOTES 3부 기록).

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

describe('waitFadeFactor — 이진: 창 안 1 · 창 밖 0 (web2-16 3-b)', () => {
  it('자기 시점(각도 0) = 1 — 원래 진하기', () => {
    expect(waitFadeFactor(DRAW_POSE, undefined)).toBe(1)
    const v = yaw(25)
    expect(waitFadeFactor(v, v)).toBe(1)                      // s.view 획도 자기 포즈면 1
  })
  it('창 안 어디든 1 — 중간값이 없다(이진. 반증: 페이드를 되살리면 창 절반에서 0.5가 나와 실패)', () => {
    expect(waitFadeFactor(yaw(C.WAIT_FADE_DEG / 2), undefined)).toBe(1)
    expect(waitFadeFactor(yaw(C.WAIT_FADE_DEG * 0.9), undefined)).toBe(1)
    // 전 대역이 {0,1}뿐이다 — 그라디언트가 되살아나면 이 훑기가 잡는다
    for (let d = 0; d <= 90; d += 3) {
      const f = waitFadeFactor(yaw(d), undefined)
      expect(f === 0 || f === 1, `deg ${d} → ${f}`).toBe(true)
    }
  })
  it('창(WAIT_FADE_DEG) 밖 = 정확히 0 — «자기 시점에서만 보인다»가 문자 그대로다', () => {
    expect(waitFadeFactor(yaw(C.WAIT_FADE_DEG), undefined)).toBe(0)
    expect(waitFadeFactor(yaw(90), undefined)).toBe(0)
    // s.view 획 — 다른 궤도 포즈끼리도 각도가 벌면 0(옛 own 불리언은 이것을 1로 읽었다)
    expect(waitFadeFactor(yaw(80), yaw(20))).toBe(0)
  })
  it('회전 없는 이동(팬·달리) — 각도 0 = 창 안 = 1 (옛 0.3 흐림도 폐지 — 3-b)', () => {
    const panned: CamPose = { p: { x: DRAW_POSE.p.x + 1, y: DRAW_POSE.p.y, z: DRAW_POSE.p.z }, q: DRAW_POSE.q }
    expect(waitFadeFactor(panned, undefined)).toBe(1)
    expect(atOwnPose(panned, undefined)).toBe(false)          // 질감·정의 판정은 여전히 정확 포즈만
  })
  it('poseAngleDeg — 사원수 사잇각이 도 단위로 맞는다(반증: 각도를 넣은 만큼 나온다)', () => {
    expect(poseAngleDeg(DRAW_POSE.q, yaw(30).q)).toBeCloseTo(30, 6)
    expect(poseAngleDeg(yaw(20).q, yaw(50).q)).toBeCloseTo(30, 6)
  })
})
