// web2-30 1번 — **손가락 규칙**(H4를 실기기 항목에서 내리고 회귀로 처리한다).
//
// 실기기 H4: 「펜을 쓴 뒤에는 손가락으로 **궤도를 못 돈다**」. 원인은 web2-26 5번이
// `fingerPans`에 `penUsed` 항을 더한 것이다 — 그 회차가 「손가락 = 이동」이라고만 적고
// **궤도를 언급하지 않았다**.
//
// 새 규칙(지시 30-1):
//   두 손가락 = 이동 + 확대            (3D 유무·펜 유무와 **무관하게 동일**)
//   한 손가락 = 3D 있으면 궤도, 없으면 이동
//   펜 획이 진행 중이면 손가락 제스처를 전부 무시  ← 배선이라 e2e(gesture.spec)의 몫
//
// D-2(재현): 아래 ②의 첫 줄이 그것이다. `penUsed = true` + 기하 있음에서 `fingerPans`가
//   **참**이었고(= 이동), 그래서 궤도가 안 돌았다. 지금은 거짓이다.
// D-3(반증): 각 팔이 **갈리는 조건**을 함께 든다 — ②는 기하를 비우면 도로 이동이 되고,
//   ①은 기하를 채우면 도로 궤도가 된다. 한쪽만 재면 「늘 참」을 재는 격자가 된다.
//
// ⚠ D-4 — 지시 게이트의 마지막 줄 「펜 미사용 세션: 한 손가락이 **여전히 그린다**」는
//   **이 코드의 사실이 아니다**(web2-26 5번이 이미 못 박았다 · #77 ㉣ 「지시의 전제가
//   낡을 수 있다」). 손가락은 이 앱에서 한 번도 그린 적이 없다 — `pointerdown`의 touch
//   갈래가 draft를 만들기 전에 반환한다. 그래서 ④는 「그린다」 대신 **「현행 유지 =
//   획이 안 는다」**를 잰다. 지시의 뜻(펜 미사용 세션의 거동을 바꾸지 않는다)은 그것이다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { fingerPans, orbitBy, panBy, dollyBy, createApp, type App } from '../src/app/state'
import { pt } from '../src/core/vec'

const W = 1200, H = 800

const viewOf = (app: App) => ({ ...app.view })
const poseOf = (app: App) => ({ p: { ...app.pose.p }, q: { ...app.pose.q } })

/** 상자 하나 — 카메라가 닫히고 기하가 선다(돌 것이 생긴다) */
function closed() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  s.draw(500, 560, 500, 660)
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s
}

describe('30-1 ① 3D 없음 + 펜 사용함 — 한 손가락이 이동한다, 획을 안 만든다', () => {
  it('이동이 실제로 화면을 옮긴다 (+반증: 기하를 채우면 궤도로 갈린다)', () => {
    const app = createApp(W, H)
    app.penUsed = true
    expect(app.lift.lifted.size).toBe(0)
    expect(fingerPans(app)).toBe(true)

    const v0 = viewOf(app), n0 = app.doc.strokes.length
    panBy(app, 40, 20)
    expect(app.view.ox).toBe(v0.ox + 40)
    expect(app.view.oy).toBe(v0.oy + 20)
    expect(app.doc.strokes.length).toBe(n0)   // 손가락은 안 그린다

    // 반증(D-3) — 기하가 있으면 같은 술어가 **거짓**이다
    const s = closed()
    s.app.penUsed = true
    expect(fingerPans(s.app)).toBe(false)
  })
})

describe('30-1 ② 3D 있음 + 펜 사용함 — 한 손가락이 궤도를 돈다 (H4 회귀)', () => {
  it('재현: 26-5에서는 이 자리가 «이동»이었다 · 지금은 궤도이고 실제로 돈다', () => {
    const s = closed()
    s.app.penUsed = true
    // 재현(D-2) — 26-5의 식 `penUsed || lifted.size === 0`이면 여기서 **참**이었다.
    expect(s.app.penUsed || s.app.lift.lifted.size === 0).toBe(true)   // 옛 식
    expect(fingerPans(s.app)).toBe(false)                              // 새 식
    // 그리고 궤도가 실제로 돈다 — 술어만 갈리고 동작이 안 돌면 H4가 안 고쳐진다
    const pose0 = poseOf(s.app), v0 = viewOf(s.app)
    orbitBy(s.app, 30, 12)
    expect(poseOf(s.app)).not.toEqual(pose0)
    expect(viewOf(s.app)).toEqual(v0)          // 궤도는 화면 오프셋을 안 건드린다

    // 반증(D-3) — 기하를 비우면 도로 이동이다(같은 술어가 갈린다)
    const a = createApp(W, H)
    a.penUsed = true
    expect(fingerPans(a)).toBe(true)
  })

  it('펜을 안 쓴 세션에서도 같다 — 두 갈래가 한 식으로 합쳐졌다', () => {
    const s = closed()
    expect(s.app.penUsed).toBe(false)
    expect(fingerPans(s.app)).toBe(false)      // 3D 있음 → 궤도
    const a = createApp(W, H)
    expect(fingerPans(a)).toBe(true)           // 3D 없음 → 이동
  })
})

describe('30-1 ③ 두 손가락은 두 상태에서 **동일**하다 — 중심 이동 = 이동, 거리 변화 = 확대', () => {
  it('3D 유무·펜 유무 네 조합에서 팬과 줌의 결과가 같은 갈래로 간다', () => {
    // ⓐ 기하 없음(작도 포즈) — 팬은 화면 오프셋, 줌은 `view.s`
    for (const used of [false, true]) {
      const s = session(W, H)
      s.app.penUsed = used
      s.draw(300, 500, 700, 500)               // 줌은 첫 획 뒤에 산다(state.ts dollyBy)
      const v = viewOf(s.app)
      panBy(s.app, 10, 5)
      expect(s.app.view.ox).toBe(v.ox + 10)
      expect(s.app.view.oy).toBe(v.oy + 5)
      const s0 = s.app.view.s
      dollyBy(s.app, 1.25, pt(W / 2, H / 2))
      expect(s.app.view.s).toBeCloseTo(s0 * 1.25, 9)
    }
    // ⓑ 기하 있음(작도 포즈 그대로) — 팬·줌이 아직 화면 갈래다. **두 상태에서 같다**
    const drawPose: { dOx: number; dOy: number; ds: number }[] = []
    for (const used of [false, true]) {
      const s = closed()
      s.app.penUsed = used
      const v = viewOf(s.app)
      panBy(s.app, 10, 5)
      dollyBy(s.app, 1.25, pt(W / 2, H / 2))
      drawPose.push({ dOx: s.app.view.ox - v.ox, dOy: s.app.view.oy - v.oy, ds: s.app.view.s / v.s })
    }
    expect(drawPose[0]).toEqual(drawPose[1])
    expect(drawPose[0]!.ds).toBeCloseTo(1.25, 9)      // 분해능 — 줌이 실제로 걸렸다
    expect(drawPose[0]!.dOx).not.toBe(0)

    // ⓒ 궤도를 돈 뒤(작도 포즈를 벗어난 상태) — 팬·줌이 카메라 갈래다. 역시 **두 상태에서 같다**
    const orbited: { dp: number; ddist: number }[] = []
    for (const used of [false, true]) {
      const s = closed()
      s.app.penUsed = used
      orbitBy(s.app, 25, 10)                          // 작도 포즈를 벗어난다
      const p0 = { ...s.app.pose.p }
      panBy(s.app, 10, 5)
      const p1 = { ...s.app.pose.p }
      dollyBy(s.app, 1.25, pt(W / 2, H / 2))
      const p2 = s.app.pose.p
      orbited.push({
        dp: Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z),
        ddist: Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z),
      })
    }
    expect(orbited[0]!.dp).toBeCloseTo(orbited[1]!.dp, 12)
    expect(orbited[0]!.ddist).toBeCloseTo(orbited[1]!.ddist, 12)
    expect(orbited[0]!.dp).toBeGreaterThan(0)         // 분해능 — 팬이 카메라를 옮겼다
    expect(orbited[0]!.ddist).toBeGreaterThan(0)      // 분해능 — 줌이 카메라를 옮겼다
  })
})

describe('30-1 ④ 펜 미사용 세션 — 거동이 안 바뀐다', () => {
  it('D-4: 「여전히 그린다」는 이 코드의 사실이 아니다 — 재는 것은 «획이 안 는다»', () => {
    const s = closed()
    const n0 = s.app.doc.strokes.length
    expect(s.app.penUsed).toBe(false)
    orbitBy(s.app, 40, 40)
    panBy(s.app, 40, 40)
    expect(s.app.doc.strokes.length).toBe(n0)
  })
})
