// web2-71 — 두드림 판정(gestures71.ts)의 단위 시험: 손가락 수·동시·이동·지속·두 번·누르고 있기 · 반증(문턱 넘김) · 결정론(가짜 시계)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGestures71 } from '../src/app/gestures71'
import { C } from '../src/core/constants'

describe('web2-71 두드림 판정', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const make = () => {
    const log: string[] = []
    const g = createGestures71({ onTap: (n) => log.push(`tap${n}`), onDouble: (n) => log.push(`double${n}`), onHoldRepeat: (n) => log.push(`hold${n}`) })
    return { g, log }
  }
  it('두 손가락 두드림(동시 · 안 움직임 · 짧게) = tap2', () => {
    const { g, log } = make()
    g.down(1, 100, 100); vi.advanceTimersByTime(10); g.down(2, 140, 100)
    vi.advanceTimersByTime(60)
    g.up(1); g.up(2)
    expect(log).toEqual(['tap2'])
    expect(g.lastForTest()?.verdict).toBe('tap'); expect(g.lastForTest()?.fingers).toBe(2)
  })
  it('세 손가락 두드림 둘이 350ms 안 = tap3 + double3 · 밖이면 tap3 둘', () => {
    const { g, log } = make()
    const tap3 = () => { g.down(1, 100, 100); g.down(2, 140, 100); g.down(3, 180, 100); vi.advanceTimersByTime(50); g.up(1); g.up(2); g.up(3) }
    tap3(); vi.advanceTimersByTime(200); tap3()
    expect(log).toEqual(['tap3', 'double3'])
    vi.advanceTimersByTime(C.GESTURE71_DOUBLE_MS + 50); tap3(); vi.advanceTimersByTime(C.GESTURE71_DOUBLE_MS + 50); tap3()
    expect(log.slice(2)).toEqual(['tap3', 'tap3'])
  })
  it('반증 — 9px 움직이면 두드림 아님(why move) · 300ms면 아님(why duration) · 둘째 손가락이 100ms 뒤면 아님(why sync) · 8px·250ms는 두드림', () => {
    const { g, log } = make()
    g.down(1, 100, 100); g.down(2, 140, 100); g.move(1, 100 + C.GESTURE71_TAP_MOVE_PX + 1, 100); vi.advanceTimersByTime(50); g.up(1); g.up(2)
    expect(log).toEqual([]); expect(g.lastForTest()?.why).toContain('move')
    g.down(1, 100, 100); g.down(2, 140, 100); vi.advanceTimersByTime(C.GESTURE71_TAP_MS + 50); g.up(1); g.up(2)
    expect(log).toEqual([]); expect(g.lastForTest()?.why).toContain('duration')
    g.down(1, 100, 100); vi.advanceTimersByTime(C.GESTURE71_TOUCH_SYNC_MS + 20); g.down(2, 140, 100); vi.advanceTimersByTime(30); g.up(1); g.up(2)
    expect(log).toEqual([]); expect(g.lastForTest()?.why).toContain('sync')
    g.down(1, 100, 100); g.down(2, 140, 100); g.move(1, 100 + C.GESTURE71_TAP_MOVE_PX, 100); vi.advanceTimersByTime(C.GESTURE71_TAP_MS); g.up(1); g.up(2)
    expect(log).toEqual(['tap2'])
  })
  it('두 손가락 누르고 있기 — 400ms 뒤 hold2 · 250ms마다 반복 · 떼면 멈춤 · 판정 hold', () => {
    const { g, log } = make()
    g.down(1, 100, 100); g.down(2, 140, 100)
    vi.advanceTimersByTime(C.GESTURE71_HOLD_MS + 5)
    expect(log).toEqual(['hold2'])
    vi.advanceTimersByTime(C.GESTURE71_HOLD_REPEAT_MS * 2 + 5)
    expect(log.length).toBe(3)
    g.up(1); g.up(2)
    vi.advanceTimersByTime(1000)
    expect(log.length, '떼면 멈춘다').toBe(3)
    expect(g.lastForTest()?.verdict).toBe('hold')
  })
  it('cancel은 두드림이 아니다 · 한 손가락 두 번 = double1', () => {
    const { g, log } = make()
    g.down(1, 100, 100); vi.advanceTimersByTime(30); g.up(1, true)
    expect(log).toEqual([]); expect(g.lastForTest()?.why).toBe('cancel')
    g.down(1, 100, 100); vi.advanceTimersByTime(30); g.up(1); vi.advanceTimersByTime(100); g.down(1, 100, 100); vi.advanceTimersByTime(30); g.up(1)
    expect(log).toEqual(['tap1', 'double1'])
  })
})
