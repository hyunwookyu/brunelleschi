// web2-51 — 자국의 질의 **순수 몫**: 압력 프로필(농도 기울기 > 굵기 기울기 — 지시의 그
// 부등식을 제품 함수 그 자체로 잰다 #54) · 결 해시(결정론 · 분포) · Injector의 속성 전수.
// 픽셀(자국의 모양)은 e2e(brush51.spec)가 잰다.

import { describe, it, expect } from 'vitest'
import { paintDensity, paintWidthFactor, grain01, setPressFlatForTest, setGrainOffForTest } from '../src/core/facetex'
import { C } from '../src/core/constants'
import { session } from './session'
import { commitPaint, injectPaintAt, toggleFaceAt } from '../src/app/state'

describe('압력 프로필 — 농도가 굵기보다 가파르다(26-6 · 지시 문면)', () => {
  it('기울기 부등식이 상수 그 자체로 선다 — 그리고 프로필이 실제로 그 기울기를 낸다', () => {
    expect(C.PAINT51_DENSITY_SLOPE).toBeGreaterThan(C.PAINT51_WIDTH_SLOPE)
    // 함수의 실측 기울기(두 점 차분 — 포화 전 구간)
    const dSlope = (paintDensity(0.6) - paintDensity(0.2)) / 0.4
    const wSlope = (paintWidthFactor(0.6) - paintWidthFactor(0.2)) / 0.4
    expect(dSlope).toBeCloseTo(C.PAINT51_DENSITY_SLOPE, 10)
    expect(wSlope).toBeCloseTo(C.PAINT51_WIDTH_SLOPE, 10)
    expect(dSlope).toBeGreaterThan(wSlope)
    // 단조·대역
    expect(paintDensity(0)).toBeGreaterThan(0)
    expect(paintDensity(1)).toBeLessThanOrEqual(1)
    expect(paintWidthFactor(1)).toBeGreaterThan(paintWidthFactor(0))
  })
  it('⚠ 반증(D-3) — 평탄화 스위치를 켜면 같은 자(두 점 차분)가 실제로 0을 낸다', () => {
    setPressFlatForTest(true)
    try {
      expect((paintDensity(0.6) - paintDensity(0.2)) / 0.4).toBe(0)
      expect((paintWidthFactor(0.6) - paintWidthFactor(0.2)) / 0.4).toBe(0)
    } finally { setPressFlatForTest(false) }
    expect((paintDensity(0.6) - paintDensity(0.2)) / 0.4).toBeGreaterThan(0.1)
    // 결 끔 스위치 — grain이 균일(1)해진다(결 게이트가 죽는 대역의 실재)
    setGrainOffForTest(true)
    try {
      expect(grain01(3, 7)).toBe(1)
      expect(grain01(11, 29)).toBe(1)
    } finally { setGrainOffForTest(false) }
    expect(grain01(3, 7)).not.toBe(grain01(11, 29))
  })
})

describe('결 해시(grain01) — 결정론 · 실행 무관 · 분포', () => {
  it('같은 칸 → 같은 값(결정론) · 이웃 칸과 갈린다 · [0,1) 대역 · 분포가 몰리지 않는다', () => {
    expect(grain01(3, 7)).toBe(grain01(3, 7))
    let diff = 0
    const vals: number[] = []
    for (let u = 0; u < 40; u++) {
      for (let v = 0; v < 40; v++) {
        const g = grain01(u, v)
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThan(1)
        vals.push(g)
        if (g !== grain01(u + 1, v)) diff++
      }
    }
    expect(diff / vals.length, '이웃과 다른 비율').toBeGreaterThan(0.95)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    expect(Math.abs(mean - 0.5), '평균이 가운데 대역').toBeLessThan(0.05)
    // 4분위 점유 — 어느 분위도 비지 않는다(뭉친 해시는 결이 아니라 얼룩이다)
    const q = [0, 0, 0, 0]
    for (const g of vals) q[Math.min(3, Math.floor(g * 4))]!++
    for (const n of q) expect(n / vals.length).toBeGreaterThan(0.15)
  })
})

describe('Injector — 짚은 획의 속성 전수(i·c·w)가 실린다', () => {
  const scene = () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380); s.draw(600, 475, 600, 385); s.draw(600, 385, 500, 380)
    expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
    return s
  }
  it('마커·색연필·연필·붓 넷 전부 — 되찾은 값이 그린 값이다', () => {
    const s = scene()
    const cases = [
      { i: 'marker' as const, hex: '#1e7fd0', w: 20, y: 400 },
      { i: 'cp' as const, hex: '#c07a5b', w: 2.5, y: 420 },
      { i: 'pencil' as const, hex: '#3a6b35', w: 5, y: 440 },
      { i: 'brush' as const, hex: '#a8a29a', w: 10, y: 460 },
    ]
    for (const cse of cases) {
      s.app.paintSel = { hex: cse.hex, i: cse.i, w: cse.w }
      const pts = Array.from({ length: 9 }, (_, t) => ({ x: 515 + t * 8, y: cse.y }))
      expect(commitPaint(s.app, pts).placed).toBe(1)
    }
    for (const cse of cases) {
      s.app.paintSel = { hex: '#000000', i: 'brush', w: 40 }        // 일부러 다르게
      const r = injectPaintAt(s.app, { x: 550, y: cse.y })
      expect(r, `${cse.i} 획을 짚었다`).not.toBeNull()
      expect(r!.i, '도구').toBe(cse.i)
      if (cse.i !== 'brush') expect(r!.hex, '색').toBe(cse.hex)
      // 굵기 — 세계 저장 → 같은 면·같은 시점 재환산이라 그린 px로 돌아온다
      expect(Math.abs(r!.w - cse.w) / cse.w, '굵기(환산 왕복)').toBeLessThan(0.01)
      expect(s.app.paintSel.i).toBe(cse.i)
    }
    // ⚠ 반증(D-3) — 허공 탭은 아무것도 안 바꾼다
    s.app.paintSel = { hex: '#000000', i: 'brush', w: 40 }
    expect(injectPaintAt(s.app, { x: 200, y: 200 })).toBeNull()
    expect(s.app.paintSel.w).toBe(40)
  })
})
