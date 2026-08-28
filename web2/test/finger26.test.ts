// web2-26 5번 — **한 손가락으로 화면을 옮길 수 있어야 한다**.
//
// 실기기(DEVICE-CHECK G9): 「눈높이 선언 단계(web2-17)에서 화면 이동에 두 손가락을
//   요구한다. 그 단계는 2D 상태라 두 손가락을 쓰려는 사람이 없다.」
//
// D-2(재현): 아래 ①이 그것이다 — 선언 단계에서는 `lifted`가 비어 `orbitBy`가 **첫 줄에서
//   반환한다.** 즉 한 손가락이 아무것도 안 한다(«궤도가 안 된다»가 아니라 **아무 일도 안
//   난다**). 두 손가락만 팬이었다.
// D-4(사람이 준 근거는 후보다): 지시가 적은 「현행(한 손가락 그리기, 두 손가락 이동)」은
//   이 코드가 아니다 — 손가락은 **한 번도 그린 적이 없다**. ③이 그 사실을 못 박는다.
// D-3(반증): 각 팔마다 `penUsed`를 뒤집어 판정이 실제로 갈리는 것을 본다.
//
// ⚠ 화면 손짓 자체(pointerdown/move의 배선)는 e2e `gesture.spec`의 몫이다. 여기서는
//   **뜻을 정하는 술어**(`fingerPans`)와 그 술어가 부르는 두 함수의 결과를 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { fingerPans, orbitBy, panBy, createApp, type App } from '../src/app/state'

const W = 1200, H = 800

const viewOf = (app: App) => ({ ...app.view })
const poseOf = (app: App) => ({ p: { ...app.pose.p }, q: { ...app.pose.q } })

function closed() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  s.draw(500, 560, 500, 660)
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s
}

describe('26-5 ① 눈높이 선언 단계 — 한 손가락이 화면을 옮긴다', () => {
  it('재현: 돌 것이 없으면 궤도는 아무 일도 안 한다 · 지금은 그 자리가 이동이다', () => {
    const app = createApp(W, H)
    expect(app.lift.lifted.size).toBe(0)          // 선언 단계 — 아직 기하가 없다
    // 재현(D-2) — 종전 배선(한 손가락 = 궤도)이 이 상태에서 **아무것도 안 한다**
    const pose0 = poseOf(app)
    orbitBy(app, 40, 20)
    expect(poseOf(app)).toEqual(pose0)
    // 지금 — 술어가 「이동」을 가리키고, 이동은 실제로 화면을 옮긴다
    expect(fingerPans(app)).toBe(true)
    const v0 = viewOf(app)
    panBy(app, 40, 20)
    expect(app.view.ox).toBe(v0.ox + 40)
    expect(app.view.oy).toBe(v0.oy + 20)
  })
})

describe('26-5 ② 펜을 한 번이라도 쓴 세션 — 손가락은 이동이다', () => {
  it('기하가 있어도 penUsed면 이동으로 갈린다 (+반증: penUsed를 내리면 궤도로 돌아간다)', () => {
    const s = closed()
    // 펜을 안 쓴 상태 — 종전 그대로 궤도다
    expect(s.app.penUsed).toBe(false)
    expect(fingerPans(s.app)).toBe(false)
    const pose0 = poseOf(s.app)
    orbitBy(s.app, 30, 0)
    expect(poseOf(s.app)).not.toEqual(pose0)      // 분해능: 이 장면에서 궤도가 실제로 돈다

    // 펜을 한 번 쓴 뒤 — 이동이다. **새 세션에서 잰다**(위에서 돌린 시점이 안 섞이게).
    const t = closed()
    t.app.penUsed = true
    expect(fingerPans(t.app)).toBe(true)
    const q1 = { ...t.app.pose.q }, v1 = viewOf(t.app)
    panBy(t.app, 25, -10)
    // 작도 포즈의 팬은 **뷰 오프셋**이다(3D를 안 건드린다 — state.ts panBy)
    expect(t.app.pose.q).toEqual(q1)              // 시점이 «돌지» 않는다
    expect(t.app.view.ox).toBe(v1.ox + 25)        // 화면이 옮겨진다
    expect(t.app.view.oy).toBe(v1.oy - 10)

    // 반증(D-3) — 내리면 판정이 도로 궤도다. 이 줄이 없으면 ②는 「늘 참」을 재는 격자다.
    t.app.penUsed = false
    expect(fingerPans(t.app)).toBe(false)
  })

  it('한 번 참이면 세션 안에서 안 내려간다 — 펜을 내려놓아도 손가락의 뜻이 안 바뀐다', () => {
    const s = closed()
    s.app.penUsed = true
    s.draw(600, 560, 600, 640)                    // 그 뒤로 무엇을 하든
    expect(s.app.penUsed).toBe(true)
    expect(fingerPans(s.app)).toBe(true)
  })
})

describe('26-5 ③ 손가락은 그리지 않는다 — 펜을 쓴 뒤에도, 쓰기 전에도', () => {
  it('D-4: 「현행 = 한 손가락 그리기」는 이 코드가 아니다 (touch 갈래가 draft 앞에서 반환한다)', () => {
    // 코드의 사실을 팔로 못 박는다: `pointerdown`의 touch 갈래에는 `beginDraft`가 없다.
    // (배선 자체의 e2e는 `gesture.spec`. 여기서는 **그 갈래가 그리기와 무관하다**는 것을
    //  구조로 확인한다 — 획 수가 손가락 손짓으로 안 는다.)
    const s = closed()
    const n0 = s.app.doc.strokes.length
    s.app.penUsed = true
    panBy(s.app, 40, 40)                          // 손가락 이동
    expect(s.app.doc.strokes.length).toBe(n0)     // 획이 안 는다
    s.app.penUsed = false
    orbitBy(s.app, 40, 40)                        // 손가락 궤도
    expect(s.app.doc.strokes.length).toBe(n0)
  })
})

describe('26-5 ④ 두 손가락은 종전 그대로다', () => {
  it('penUsed와 무관하게 두 손가락은 팬+줌이다 — 이 회차가 안 건드린 자리', () => {
    const s = closed()
    for (const used of [false, true]) {
      s.app.penUsed = used
      const v = viewOf(s.app)
      panBy(s.app, 10, 5)
      expect(s.app.view.ox).toBe(v.ox + 10)
      expect(s.app.view.oy).toBe(v.oy + 5)
    }
  })
})
