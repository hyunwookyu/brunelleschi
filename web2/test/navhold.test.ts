// web2-14 3번 — 대기 획 감쇠의 «떨림» 제거: 제스처(궤도) 동안 판정 동결(㉮).
//
// 실기기 판정: 「돌리면 서서히 사라지고 돌아오면 다시 생겨 성가시다」 — 감쇠가 카메라에
// 실시간 반응한 것. 수리: beginNavHold/endNavHold가 판정 포즈(fadeRef)를 제스처 동안
// 동결한다. 렌더(render2d·brushlayer)가 읽는 것이 바로 fadeRef이므로 이 팔이 그 판정을
// 직접 잰다(측정 경로 == 앱 경로).
//
// 반증(D-3 — 지시 문면): 「궤도를 왕복시켜 표시 상태가 몇 번 바뀌는지 센다. 수리 전
// 여러 번 → 수리 후 0~1회.」 아래 팔이 두 수를 나란히 낸다 — 동결 없이(수리 전 판정 =
// app.pose 직접) 같은 왕복을 재면 변화가 여러 번이다: 이 대비가 팔의 판별력이다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { beginNavHold, endNavHold, fadeRef, orbitBy } from '../src/app/state'
import { waitFadeFactor } from '../src/core/waitfade'

function fx() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)              // 지평선
  s.draw(500, 500, 600, 475)               // → vp0 (승격 기하 — 궤도가 돈다)
  s.draw(500, 500, 400, 475)               // → vp1 (닫힘)
  const W = s.draw(690, 290, 840, 365)!    // 대기 소실점 선 — 감쇠 대상
  expect(s.app.lift.waiting).toContain(W.id)
  return { s, W }
}

describe('제스처 동안 감쇠 판정 동결 — 왕복 궤도의 표시 변화 0~1회', () => {
  it('동결 중 왕복: factor 변화 0회 · 놓으면 재판정 한 번 · 해제 후 fadeRef == pose', () => {
    const { s } = fx()
    const app = s.app
    const factors: number[] = []
    beginNavHold(app)                       // 손가락이 닿았다(input.ts와 같은 호출)
    for (let i = 0; i < 20; i++) { orbitBy(app, 15, 0); factors.push(waitFadeFactor(fadeRef(app), undefined)) }
    for (let i = 0; i < 20; i++) { orbitBy(app, -15, 0); factors.push(waitFadeFactor(fadeRef(app), undefined)) }
    let changes = 0
    for (let i = 1; i < factors.length; i++) if (Math.abs(factors[i]! - factors[i - 1]!) > 1e-9) changes++
    expect(changes, '돌리는 동안 아무 일도 안 일어난다').toBe(0)
    expect(factors[0]!).toBe(1)             // 시작이 자기 시점 — 동결값 1 유지
    endNavHold(app)                         // 놓았다 — 재판정 한 번
    const after = waitFadeFactor(fadeRef(app), undefined)
    // 순수 요 왕복은 제자리로 돌아온다 — 재판정도 1(fp 대역). 표시 변화 총 0회다.
    expect(after).toBeGreaterThan(0.999)
    expect(app.fadePose).toBeNull()         // 동결이 실제로 풀렸다
  })

  it('반증(D-3) — 동결 없이(수리 전 판정) 같은 왕복은 변화가 여러 번이다: 팔의 판별력', () => {
    const { s } = fx()
    const app = s.app
    const factors: number[] = []
    // beginNavHold 없이 — 수리 전 렌더가 하던 그대로 app.pose를 직접 읽는다
    for (let i = 0; i < 20; i++) { orbitBy(app, 15, 0); factors.push(waitFadeFactor(app.pose, undefined)) }
    for (let i = 0; i < 20; i++) { orbitBy(app, -15, 0); factors.push(waitFadeFactor(app.pose, undefined)) }
    let changes = 0
    for (let i = 1; i < factors.length; i++) if (Math.abs(factors[i]! - factors[i - 1]!) > 1e-9) changes++
    // ⚠ web2-16 3-b(이진)로 기대값이 바뀌었다: 그라디언트 시절엔 프레임마다 떨렸고(>5),
    // 이진에서는 창 경계를 나갔다 돌아오는 **2회**다. 동결 팔(위 0회)의 판별력은 그대로다 —
    // 동결 없이 변화가 «있다»는 것이 이 팔의 몫이다.
    expect(changes, '동결 없으면 왕복에서 표시가 변한다(나감·돌아옴)').toBeGreaterThanOrEqual(2)
    expect(Math.min(...factors)).toBe(0)   // 창 밖에서 실제로 사라졌다(이진 0)
  })

  it('중첩 제스처 — 두 번째 grab이 동결값을 안 덮는다(처음 값이 이긴다)', () => {
    const { s } = fx()
    const app = s.app
    beginNavHold(app)
    const held = app.fadePose
    orbitBy(app, 100, 0)
    beginNavHold(app)                       // 손가락 추가 등 — 갱신이면 동결이 아니다
    expect(app.fadePose).toBe(held)
    endNavHold(app)
  })
})

// ── 접기 애니메이션도 동결 구간이다(3번 2차 [4/6]) ────────────────────────────
// 접기는 뷰 큐브(즉시 점프)와 달리 300ms 연속 회전이다(AS-C12) — 놓고 1.2s 뒤 도는
// 그 구간을 동결 안 하면 감쇠가 다시 프레임마다 반응한다. 시계 주입으로 잰다.

import { createAutoLevel } from '../src/app/autolevel'
import { C } from '../src/core/constants'

describe('접기 애니메이션 동안 동결 — 끝나면 해제·재판정', () => {
  it('임계 안 자세에서 접힐 때: 애니 중 factor 상수 · 끝에 해제·정렬 factor', () => {
    const { s } = fx()
    const app = s.app
    let t = 0
    const level = createAutoLevel(app, () => t)
    // 임계 안 소요(작은 궤도) — 제스처 형태 그대로: grab → 돌림 → release
    level.grab(); beginNavHold(app)
    orbitBy(app, 0, 8)                        // 피치 ≈2.3° — 접힘 임계 안(f≈387 → atan(f/6W)≈3.1°. 순수 요는 이미 정렬이라 안 접힌다)
    level.release(); endNavHold(app)
    const releasedFactor = waitFadeFactor(fadeRef(app), undefined)
    // web2-16 3-b: 창 안은 1이다(이진 — 그라디언트 시절엔 <1이었다). 재판정 자체는
    // fadePose가 풀린 것(아래 단언)이 증거다.
    expect(releasedFactor).toBe(1)
    // 지연을 지나 접기 시작 — 애니 동안 동결
    t = C.FOLD_DELAY_MS + 1
    expect(level.tick()).toBe(true)           // 첫 걸음
    expect(app.fadePose, '애니 시작 — 동결').not.toBeNull()
    const fs: number[] = []
    for (let k = 1; k <= 5; k++) { t = C.FOLD_DELAY_MS + 1 + (C.FOLD_ANIM_MS * k) / 6; level.tick(); fs.push(waitFadeFactor(fadeRef(app), undefined)) }
    for (let i = 1; i < fs.length; i++) expect(Math.abs(fs[i]! - fs[i - 1]!)).toBeLessThan(1e-9)
    // 끝 — 정확히 목표에 앉고 동결 해제·재판정
    t = C.FOLD_DELAY_MS + C.FOLD_ANIM_MS + 10
    level.tick()
    expect(app.fadePose).toBeNull()
    expect(waitFadeFactor(fadeRef(app), undefined), '접힌 자리(요 0 복귀) — 원 진하기').toBeGreaterThan(0.999)
  })
})
