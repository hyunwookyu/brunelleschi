// web2-22 2부 — 후행 확정(머무름) 회귀 팔.
//
// 판정은 core/hold.ts(순수 — 시간 주입)이고 input.ts가 같은 함수를 부른다(원칙 a).
// 지시 팔: ① 머무르면 반듯(각도 전/후) ② 안 머무르면 자유 그대로 ③ 수평 대역 붙음(값)
// ④ 소실점 방향으로는 안 붙는다 ⑤ 반듯 미리보기 == 확정(뗌 무변화) ⑥ 트레이싱지·
// 바탕에서는 안 돈다 ⑦ 지연 양끝(0 = 늘 · 크게 = 거의 안).
// 반증(D-3): 머무름 판정을 빼면 ①이 실패한다 — 실행 기록은 NOTES 2부 절.

import { describe, it, expect } from 'vitest'
import { newHoldGate, tickHold, yellowEnd } from '../src/core/hold'
import { session } from './session'
import { addLayer, setActiveLayer } from '../src/app/state'
import { C } from '../src/core/constants'
import { DRAW_POSE } from '../src/core/camera'
import { axisOfStroke } from '../src/core/lift'

const W = 1200, H = 800
const angleOf = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI

describe('머무름 게이트(tickHold — 가짜 시계)', () => {
  it('① 한 자리에 HOLD_MS 머무르면 성립 · ② 움직이면 리셋', () => {
    const g = newHoldGate()
    expect(tickHold(g, { x: 100, y: 100 }, 0)).toBe(false)
    expect(tickHold(g, { x: 101, y: 101 }, C.HOLD_MS - 1)).toBe(false)   // 지터 안·시간 미달
    expect(tickHold(g, { x: 101, y: 100 }, C.HOLD_MS)).toBe(true)        // 성립
    // 크게 움직이면 리셋 — 다시 머물러야 한다
    expect(tickHold(g, { x: 200, y: 100 }, C.HOLD_MS + 10)).toBe(false)
    expect(tickHold(g, { x: 200, y: 100 }, C.HOLD_MS + 10 + C.HOLD_MS - 1)).toBe(false)
    expect(tickHold(g, { x: 200, y: 100 }, C.HOLD_MS + 10 + C.HOLD_MS)).toBe(true)
  })

  it('⑦ 지연 양끝 — 0이면 둘째 표본부터 늘 · 아주 크면 사실상 안 된다', () => {
    // 첫 표본은 기준 설정이다(머무름은 «어디서부터»가 있어야 잰다) — 판정은 둘째부터
    const g0 = newHoldGate()
    tickHold(g0, { x: 0, y: 0 }, 0, 0)
    expect(tickHold(g0, { x: 0, y: 0 }, 0, 0)).toBe(true)                // holdMs 0 — 늘 반듯
    const g1 = newHoldGate()
    tickHold(g1, { x: 0, y: 0 }, 0, 1e9)
    expect(tickHold(g1, { x: 0, y: 0 }, 60_000, 1e9)).toBe(false)        // 1분을 머물러도 아직
  })
})

describe('반듯해진 끝점(yellowEnd)', () => {
  it('① 머무르면 수평 3° 처짐이 정확한 수평이 된다(각도 전/후) · ② 안 머무르면 그대로', () => {
    const start = { x: 100, y: 100 }
    const cur = { x: 300, y: 100 + 200 * Math.tan(3 * Math.PI / 180) }   // 3° 처짐
    expect(Math.abs(angleOf(start, cur) - 3)).toBeLessThan(1e-9)
    const held = yellowEnd(start, cur, true)
    expect(held.snapped).toBe('H')
    expect(angleOf(start, held.end)).toBe(0)                             // 반듯 — 정확히 0°
    const free = yellowEnd(start, cur, false)
    expect(free.end).toEqual(cur)                                        // ② 자유 그대로
    expect(free.snapped).toBeNull()
  })

  it('③ 수평·수직 대역(YELLOW_SNAP_DEG) — 안·밖의 경계 값', () => {
    const start = { x: 0, y: 0 }
    const at = (deg: number) => ({ x: 200 * Math.cos(deg * Math.PI / 180), y: 200 * Math.sin(deg * Math.PI / 180) })
    expect(yellowEnd(start, at(C.YELLOW_SNAP_DEG - 0.1), true).snapped).toBe('H')
    expect(yellowEnd(start, at(C.YELLOW_SNAP_DEG + 0.1), true).snapped).toBeNull()   // 대역 밖 — 직선화만
    expect(yellowEnd(start, at(90 - C.YELLOW_SNAP_DEG + 0.1), true).snapped).toBe('V')
    expect(yellowEnd(start, at(90 - C.YELLOW_SNAP_DEG - 0.1), true).snapped).toBeNull()
    // 대역 밖 대각은 각도가 안 바뀐다(직선화만 — 확정 기하는 이미 직선)
    const diag = yellowEnd(start, at(40), true)
    expect(Math.abs(angleOf(start, diag.end) - 40)).toBeLessThan(1e-9)
  })

  it('④ 소실점 방향으로는 안 붙는다 — 소실점을 정확히 겨눈 각도도 그대로다', () => {
    // 표준 픽스처의 vp0 = (900,400). 시작 (500,500)에서 소실점을 «정확히» 겨눈 방향 —
    // 작도(트레이싱지)라면 축이 잡을 각도(−14°)인데, 옐로의 반듯함에는 그 갈래가 없다.
    const start = { x: 500, y: 500 }
    const cur = { x: 700, y: 450 }                                       // vp0 방향(정확)
    const held = yellowEnd(start, cur, true)
    expect(held.snapped).toBeNull()
    expect(held.end).toEqual(cur)                                        // 각도 그대로
  })
})

describe('⑤⑥ — 앱 경로(session)', () => {
  function yellowSession() {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    const lay = addLayer(s.app, 'yellow', { W, H })!
    return { s, lay }
  }

  it('⑤ 반듯해진 미리보기가 그대로 확정된다 — 같은 yellowEnd 값이 커밋 좌표다', () => {
    const { s } = yellowSession()
    // 미리보기의 판정(yellowEnd)과 확정 경로가 같은 함수라는 것이 원칙 d의 형태 —
    // 세션에서 «머무른 획»을 그대로 재현: 반듯 end를 계산해 그 좌표로 커밋한다(입력이
    // 하는 그대로 — input.ts는 d.end에 이미 반듯 값이 들어 있다).
    const start = { x: 300, y: 300 }
    const cur = { x: 520, y: 310 }                                       // 2.6° — 대역 안
    const y = yellowEnd(start, cur, true)
    const st = s.draw(start.x, start.y, y.end.x, y.end.y)!
    expect(st.a).toEqual(start)
    expect(st.b).toEqual(y.end)                                          // 뗌 무변화
    expect(st.b.y).toBe(start.y)                                         // 정확한 수평
    expect(st.raw === undefined || st.raw.length <= 2).toBe(true)        // 직선화(raw 소멸)
  })

  it('⑥ 트레이싱지·바탕에서는 안 돈다 — 같은 몸짓이 종전(축 스냅) 결과를 낸다', () => {
    const { s, lay } = yellowSession()
    // 트레이싱지 — 수평 3° 처짐이 축 스냅(H)으로 붙는 것은 «옐로 반듯»이 아니라 종전
    // 축 경로다: yellowEnd가 개입 안 했음은 raw·경로가 아니라 axis 배정으로 갈린다.
    setActiveLayer(s.app, null)
    const tr = addLayer(s.app, 'tracing', { W, H })!
    expect(s.app.activeLayer).toBe(tr.id)
    const st = s.draw(300, 620, 500, 630)!                               // 2.9° 처짐
    // «축이 걸렸다» = 옐로 갈래가 아니다(옐로면 축 배정 자체가 없다 — yellow2d ①)
    expect(axisOfStroke(s.app.lift.an, DRAW_POSE, st.a, st.b)).not.toBeNull()
    // 바탕 — 같다(session의 옐로 갈래가 tracing·바탕에서 안 탄다: yellowActive false)
    setActiveLayer(s.app, null)
    const bg = s.draw(300, 660, 500, 670)!
    expect(axisOfStroke(s.app.lift.an, DRAW_POSE, bg.a, bg.b)).not.toBeNull()
    void lay
  })
})
