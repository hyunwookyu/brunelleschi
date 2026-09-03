// web2-58 — 엔진은 하나, 브러시는 데이터(brush58.ts)의 상태 몫.
// 화면·픽셀 몫은 e2e(mark58.spec · brush51.spec ②⑤)가 잰다.

import { describe, it, expect, afterEach } from 'vitest'
import {
  brushDef, brushDefault, setBrushTune, brushTuneJson, loadBrushTune, tunedInstrs,
  evalCurve, instrOfTag, INSTRS58, type Curve5,
} from '../src/core/brush58'
import { paintDensity, paintWidthFactor } from '../src/core/facetex'
import { C } from '../src/core/constants'

afterEach(() => { for (const k of INSTRS58) setBrushTune(k, null) })

describe('기본값 — 51의 상수를 그대로 옮겼다(숫자를 새로 짓지 않는다)', () => {
  it('넷의 기본값이 51 상수·58 사람 값과 정합하다', () => {
    expect(brushDef('marker').alpha).toBe(C.PAINT_MARKER_ALPHA)
    expect(brushDef('cp').alpha).toBe(C.PAINT_CP_ALPHA)
    expect(brushDef('cp').grainK).toBe(C.PAINT51_CP_GRAIN_K)
    expect(brushDef('pencil').grainK).toBe(C.PAINT51_PENCIL_GRAIN_K)
    expect(brushDef('pencil').grainFloor).toBe(C.PAINT51_PENCIL_GRAIN_FLOOR)
    expect(brushDef('brush').bristles).toBe(C.PAINT51_BRUSH_BRISTLES)
    expect(brushDef('brush').splitT).toBe(C.PAINT51_BRUSH_SPLIT_T)
    // 58 사람 값 — 슬라이더 최대
    expect({
      brush: brushDef('brush').maxW, marker: brushDef('marker').maxW,
      cp: brushDef('cp').maxW, pencil: brushDef('pencil').maxW,
    }).toEqual({ brush: 500, marker: 100, cp: 50, pencil: 50 })
    // 58 계약 뒤집힘 — 마커 팁 기본 0(사람 판정 · D-W26)
    expect(brushDef('marker').tipAlpha).toBe(0)
  })

  it('곡선 기본값 == 51 선형식(선형 구간 정확 일치 · 클램프 구간 최대 5% 유보)', () => {
    const d = brushDef('pencil')
    // press가 클램프 밖(≤ (1−floor)/slope ≈ 0.833)이면 다섯 점 보간 == 식 그 자체
    for (const p of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75]) {
      expect(evalCurve(d.density, p)).toBeCloseTo(paintDensity(p), 12)
      expect(evalCurve(d.width, p)).toBeCloseTo(paintWidthFactor(p), 12)
    }
    // 클램프 구간(0.75..1)의 유보 — 문서화된 눈금 오차 안(≤ 5% · brush58.ts 머리주석)
    let worst = 0
    for (let p = 0.75; p <= 1.0001; p += 0.01) {
      worst = Math.max(worst, Math.abs(evalCurve(d.density, p) - paintDensity(p)))
    }
    expect(worst).toBeLessThan(0.05)
    expect(worst).toBeGreaterThan(0)          // 유보가 실재한다 — 0이면 이 유보 문장이 거짓
  })

  it('evalCurve — 보간과 경계(반증: 평평한 곡선은 어느 x에서도 같다)', () => {
    const c: Curve5 = [0, 0.25, 0.5, 0.75, 1]
    expect(evalCurve(c, 0)).toBe(0)
    expect(evalCurve(c, 1)).toBe(1)
    expect(evalCurve(c, 0.125)).toBeCloseTo(0.125, 12)
    expect(evalCurve(c, -1)).toBe(0)          // 클램프
    expect(evalCurve(c, 2)).toBe(1)
    const flat: Curve5 = [0.7, 0.7, 0.7, 0.7, 0.7]
    for (const p of [0, 0.3, 0.9]) expect(evalCurve(flat, p)).toBe(0.7)
  })

  it('instrOfTag — 저장 표식의 왕복(0/undefined = 붓 · 50 규약)', () => {
    expect(instrOfTag(undefined)).toBe('brush')
    expect(instrOfTag(0)).toBe('brush')
    expect(instrOfTag(1)).toBe('marker')
    expect(instrOfTag(2)).toBe('cp')
    expect(instrOfTag(3)).toBe('pencil')
  })
})

describe('조정(tune) — 사람이 당긴 값의 층', () => {
  it('setBrushTune은 그 브러시만 바꾸고, null이 걷는다(브러시별 격리 — D-3)', () => {
    const before = brushDef('cp').alpha
    setBrushTune('pencil', { alpha: 0.3, spacingK: 1.2 })
    expect(brushDef('pencil').alpha).toBe(0.3)
    expect(brushDef('pencil').spacingK).toBe(1.2)
    expect(brushDef('pencil').grainK).toBe(C.PAINT51_PENCIL_GRAIN_K)  // 안 만진 키는 기본
    expect(brushDef('cp').alpha).toBe(before)                          // 격리
    expect(tunedInstrs()).toEqual(['pencil'])
    setBrushTune('pencil', null)
    expect(brushDef('pencil').alpha).toBe(brushDefault('pencil').alpha)
    expect(tunedInstrs()).toEqual([])
  })

  it('저장 왕복 — brushTuneJson → loadBrushTune이 같은 정의를 되살린다', () => {
    setBrushTune('marker', { tipAlpha: 0.35, tipLenK: 0.9 })
    setBrushTune('brush', { density: [0.1, 0.2, 0.5, 0.9, 1] as Curve5 })
    const json = brushTuneJson()
    setBrushTune('marker', null); setBrushTune('brush', null)
    expect(brushDef('marker').tipAlpha).toBe(0)
    loadBrushTune(json)
    expect(brushDef('marker').tipAlpha).toBe(0.35)
    expect(brushDef('brush').density).toEqual([0.1, 0.2, 0.5, 0.9, 1])
    expect(new Set(tunedInstrs())).toEqual(new Set(['marker', 'brush']))
  })

  it('깨진 저장 — 키 단위로 떨구고 조용히 죽지 않는다(모르는 키·틀린 꼴 ⛔)', () => {
    loadBrushTune('{"marker":{"tipAlpha":"x","alpha":0.4,"evil":9,"density":[1,2,3]}}')
    expect(brushDef('marker').alpha).toBe(0.4)                 // 맞는 키는 산다
    expect(brushDef('marker').tipAlpha).toBe(0)                // 틀린 꼴(문자열)은 떨어진다
    expect((brushDef('marker') as unknown as Record<string, unknown>).evil).toBeUndefined()
    expect(brushDef('marker').density).toEqual(brushDefault('marker').density)  // 길이 3 곡선 ⛔
    loadBrushTune('not json')
    expect(tunedInstrs()).toEqual([])                          // 통째 깨짐 → 기본값
    loadBrushTune(null)
    expect(tunedInstrs()).toEqual([])
  })
})
