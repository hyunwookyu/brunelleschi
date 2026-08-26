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
    expect(changes, '수리 전 동작 — 프레임마다 떨린다').toBeGreaterThan(5)
    expect(Math.min(...factors)).toBeLessThan(1)   // 실제로 흐려졌다(0 아닌 감쇠 대역까지 갔다)
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
