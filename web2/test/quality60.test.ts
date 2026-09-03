// web2-60 — 자국의 질: 상태·표집 몫(단위 · 픽셀은 e2e quality60.spec).
//   ① 새 축 다섯(문턱↔압력 · 속도 둘 · 방향 둘)의 기본값 — 색연필 문턱↔압력(출발점)만 0이 아니다:
//      나머지는 0이라 옛 획의 픽셀이 안 바뀐다(구조가 요구하는 기본값 변경 하나 — D-W28).
//   ② stampsOf가 도장마다 원본 표본 간격(gap)·진행 각(ang)을 싣는다 — 속도·방향 축의 입력.
//   ③ 출발점 표는 도구 넷 전부에 있고 값이 저장·복원(loadBrushTune)을 지난다.

import { describe, it, expect, afterEach } from 'vitest'
import { brushDef, setBrushTune, START_POINTS, INSTRS58, brushTuneJson, loadBrushTune } from '../src/core/brush58'
import { stampsOf } from '../src/core/facetex'
import { C } from '../src/core/constants'

afterEach(() => { for (const k of INSTRS58) setBrushTune(k, null) })

describe('60 — 새 축의 기본값(픽셀 무변의 근거)', () => {
  it('속도·방향은 넷 전부 0 · 문턱↔압력은 색연필만 출발점(C.PAINT60_CP_BURNISH) · 나머지 0', () => {
    for (const k of INSTRS58) {
      const d = brushDef(k)
      expect(d.speedAlphaK, k).toBe(0)
      expect(d.speedWidthK, k).toBe(0)
      expect(d.dirK, k).toBe(0)
      expect(d.dirAngle, k).toBe(0)
      expect(d.cpBurnish, k).toBe(k === 'cp' ? C.PAINT60_CP_BURNISH : 0)
    }
    expect(C.PAINT60_CP_BURNISH).toBeGreaterThan(0)
  })
  it('반증 — 압력 0.5에서는 문턱이 값과 무관하게 종전(cpSkipTh)이다: 식 cpSkipTh + k(0.5 − p)', () => {
    const d = brushDef('cp')
    for (const k of [0, 0.5, 1]) expect(d.cpSkipTh + k * (0.5 - 0.5)).toBe(d.cpSkipTh)
    expect(d.cpSkipTh + d.cpBurnish * (0.5 - 0.2)).toBeGreaterThan(d.cpSkipTh)   // 약하게 → 구멍 많음
    expect(d.cpSkipTh + d.cpBurnish * (0.5 - 0.8)).toBeLessThan(d.cpSkipTh)      // 세게 → 메워짐
  })
})

describe('60 — stampsOf의 속도·방향 입력', () => {
  it('느린 구간(촘촘한 표본)의 도장은 gap이 작고, 빠른 구간은 크다 · ang은 진행 방향', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 30, y: 0 }, { x: 54, y: 0 }]
    const st = stampsOf(pts, undefined, 3)
    const slow = st.filter(q => q.x < 6), fast = st.filter(q => q.x > 8)
    expect(slow.length).toBeGreaterThan(0)
    expect(fast.length).toBeGreaterThan(0)
    for (const q of slow) expect(q.gap).toBe(2)
    for (const q of fast) expect(q.gap).toBe(24)
    for (const q of st) expect(Math.abs(q.ang)).toBeLessThan(1e-9)
    const up = stampsOf([{ x: 0, y: 0 }, { x: 0, y: 10 }], undefined, 2)
    for (const q of up) expect(q.ang).toBeCloseTo(Math.PI / 2, 9)
  })
})

describe('60 — 출발점 표와 저장 왕복', () => {
  it('넷 전부 출발점이 있고, 얹은 값이 JSON 왕복을 지난다(모르는 키 없음)', () => {
    for (const k of INSTRS58) expect(Object.keys(START_POINTS[k]).length).toBeGreaterThan(0)
    setBrushTune('cp', { ...START_POINTS.cp })
    const json = brushTuneJson()
    for (const k of INSTRS58) setBrushTune(k, null)
    loadBrushTune(json)
    const d = brushDef('cp')
    expect(d.cpBurnish).toBe(START_POINTS.cp.cpBurnish)
    expect(d.dirK).toBe(START_POINTS.cp.dirK)
    expect(d.dirAngle).toBe(START_POINTS.cp.dirAngle)
    expect(d.alpha).toBe(START_POINTS.cp.alpha)
  })
})
