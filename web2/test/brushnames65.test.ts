// web2-65 §2 ③ — 브러시 이름의 사람 쪽 사상. **전수**로 돈다(브라우저 없이 — core의 순수 표).
//
// 무엇을 지키는가:
//   ① 정확 표의 열쇠가 «실제로 있는 브러시»인가(오타는 조용히 폴백으로 숨는다 — #105의 형태)
//   ② 프리셋 전수에서 이름이 비지 않고, 슬래시(원 이름 꼴)가 «표시»에 안 새어 나온다
//   ③ 원 이름은 안 없어진다 — brushOrigin/brushRawExact가 원문 그대로다
//   ④ 반증(D-3): 아는 낱말이 하나도 없는 이름은 «지어내지 않고» 정돈한 원 이름 그대로다

import { describe, it, expect } from 'vitest'
import { brushLabel, brushOrigin, brushRawExact, brushRawShort, BRUSH_LABEL_EXACT } from '../src/core/brushnames'
import { PRESETS } from '../src/app/mypaintpaint'
import { DEFAULT_BRUSH } from '../src/core/paintseam'

describe('web2-65 §2 ③ — 브러시 이름 사상', () => {
  const names = PRESETS.map(p => p.name)

  it('① 정확 표의 열쇠가 전부 «있는 브러시»다(오타 0)', () => {
    const have = new Set(names)
    const missing = Object.keys(BRUSH_LABEL_EXACT).filter(k => !have.has(k))
    expect(missing, `정확 표에 없는 브러시가 있다: ${missing.join(', ')}`).toEqual([])
  })

  it('① 슬롯 기본 넷은 전부 정확 표에 있다(사람이 제일 자주 보는 이름)', () => {
    for (const br of Object.values(DEFAULT_BRUSH)) {
      expect(BRUSH_LABEL_EXACT[br], `${br}의 사람 쪽 이름`).toBeTruthy()
    }
  })

  it('② 전수 — 이름이 비지 않고 원 이름 꼴(group/name)이 표시에 안 샌다', () => {
    const bad = names.filter(n => {
      const l = brushLabel(n)
      return l.length === 0 || l.includes('/') || l.includes('_')
    })
    expect(bad, `표시 이름이 원 이름 꼴이다: ${bad.slice(0, 5).join(', ')}`).toEqual([])
    expect(names.length).toBeGreaterThan(150)      // 196 + 앱 — 모집단이 실제로 크다(#12)
  })

  it('③ 원 이름은 안 없어진다 — 부제·도움말이 원문 그대로 든다', () => {
    expect(brushRawExact('ramon/100%_Opaque')).toBe('100%_Opaque')
    expect(brushOrigin('ramon/100%_Opaque')).toBe('ramon · 100%_Opaque')
    expect(brushLabel('ramon/100%_Opaque')).toBe('불투명 마커')
    expect(brushOrigin('tanda/marker-01')).toBe('tanda · marker-01')
  })

  it('④ 반증 — 아는 낱말이 없으면 «지어내지 않는다»(정돈한 원 이름 그대로)', () => {
    expect(brushLabel('zzz/qwerty_zxcv')).toBe('qwerty zxcv')
    expect(brushRawShort('zzz/qwerty_zxcv')).toBe('qwerty zxcv')
    // 아는 낱말이 하나라도 있으면 사상이 돈다 — 그 갈림이 실제로 있는지가 이 반증의 짝이다
    expect(brushLabel('zzz/soft_qwerty')).toBe('부드러운 qwerty')
  })

  it('숫자·등급 표기는 그대로 읽힌다(2B · 4H · 01 · 100%)', () => {
    expect(brushLabel('zzz/2B_pencil')).toBe('2B 연필')
    expect(brushLabel('zzz/marker_01')).toBe('마커 01')
    expect(brushLabel('zzz/100_brush')).toBe('100 붓')
  })
})
