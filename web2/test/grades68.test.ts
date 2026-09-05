// web2-68 §2 — 경도 축의 표(core/grades68)와 보간 프리셋(app/brushes64 lerpPreset)의 단위 시험 — 브라우저 없이 전수.
//
//   ① 경도 축의 프리셋 전수가 «있는 브러시»다(오타는 조용히 폴백으로 숨는다 — #105)
//   ② 보간 프리셋의 설정 키는 전부 SETTINGS에 있고(#108 — 모르는 키 0) 두 원본의 합집합 밖 키 0 · base가 두 원본 사이
//   ③ shiftGrade — 아래로 밀면 무른 쪽(HB → 8B), 끝에서 멈춘다 · 축 밖 프리셋은 그대로
//   ④ 라벨 — 경도 축 프리셋 전수가 정확 표에 있다(사람이 제일 자주 보는 이름)
//   ⑤ 반증(D-3): 모르는 원본으로 lerpPreset을 부르면 던진다(조용한 폴백 ⛔)

import { describe, it, expect } from 'vitest'
import { PENCIL_GRADES68, CHARCOAL_GRADES68, PENCIL_PRESET_OF_GRADE, CHARCOAL_PRESET_OF_GRADE, GRADE_PRESETS68, gradeOfPreset, shiftGrade } from '../src/core/grades68'
import { PRESETS, PRESET_BY_NAME } from '../src/app/mypaintpaint'
import { lerpPreset, PENCIL_LERP_T } from '../src/app/brushes64'
import { SETTINGS } from '../src/mypaint/settings.gen'
import { BRUSH_LABEL_EXACT } from '../src/core/brushnames'

describe('web2-68 §2 — 경도 축', () => {
  it('① 경도 축의 프리셋 전수가 실재한다(연필 여섯 · 목탄 셋 · 서로 다르다)', () => {
    const names = new Set(PRESETS.map(p => p.name))
    for (const n of GRADE_PRESETS68) expect(names.has(n), `${n}이 카탈로그에 있다`).toBe(true)
    expect(new Set(GRADE_PRESETS68).size, '아홉이 서로 다르다').toBe(9)
    expect(PENCIL_GRADES68.length).toBe(6); expect(CHARCOAL_GRADES68.length).toBe(3)
  })

  it('② 보간 프리셋 — 키는 SETTINGS·두 원본 안(#108) · base_value가 두 원본 사이 · 곡선은 2b 것', () => {
    const a = PRESET_BY_NAME.get('tanda/pencil-2b')!, b = PRESET_BY_NAME.get('tanda/pencil-8b')!
    const known = new Set(SETTINGS.map(s => s.id))
    const union = new Set([...Object.keys(a.s), ...Object.keys(b.s)])
    for (const [name, t] of [['brunelleschi/pencil_4B', PENCIL_LERP_T.pencil_4B], ['brunelleschi/pencil_6B', PENCIL_LERP_T.pencil_6B]] as const) {
      const p = PRESET_BY_NAME.get(name)!
      expect(p, `${name}이 카탈로그에 있다`).toBeTruthy()
      for (const [k, v] of Object.entries(p.s)) {
        expect(known.has(k), `${name}.${k}는 libmypaint 설정이다`).toBe(true)
        expect(union.has(k), `${name}.${k}는 두 원본 중 하나에 있다`).toBe(true)
        const def = SETTINGS.find(s => s.id === k)!.def
        const av = a.s[k]?.[0] ?? def, bv = b.s[k]?.[0] ?? def
        expect(v[0], `${name}.${k} base가 사이`).toBeCloseTo(av + (bv - av) * t, 5)
        if (a.s[k]?.[1]) expect(v[1], `${name}.${k} 곡선은 2b 것`).toEqual(a.s[k]![1])
      }
    }
  })

  it('③ shiftGrade — 아래(+)로 무른 쪽 · 끝에서 멈춤 · 축 밖은 그대로', () => {
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, 1)).toBe(PENCIL_PRESET_OF_GRADE.B)
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, 99)).toBe(PENCIL_PRESET_OF_GRADE['8B'])
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE['8B'], -1)).toBe(PENCIL_PRESET_OF_GRADE['6B'])
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, -1)).toBe(PENCIL_PRESET_OF_GRADE.HB)
    expect(shiftGrade(CHARCOAL_PRESET_OF_GRADE['경'], 1)).toBe(CHARCOAL_PRESET_OF_GRADE['중'])
    expect(shiftGrade(CHARCOAL_PRESET_OF_GRADE['연'], 1)).toBe(CHARCOAL_PRESET_OF_GRADE['연'])
    expect(shiftGrade('deevad/liner', 3)).toBe('deevad/liner')
    expect(gradeOfPreset('deevad/liner')).toBeNull()
    expect(gradeOfPreset(PENCIL_PRESET_OF_GRADE['4B'])).toEqual({ kind: 'pencil', grade: '4B' })
  })

  it('④ 라벨 — 경도 축 프리셋 전수가 정확 표에 있다', () => {
    for (const n of GRADE_PRESETS68) expect(BRUSH_LABEL_EXACT[n], `${n}의 사람 쪽 이름`).toBeTruthy()
  })

  it('⑤ 반증(D-3) — 모르는 원본이면 던진다(조용한 폴백 ⛔)', () => {
    expect(() => lerpPreset('brunelleschi/x', 'tanda/pencil-2b', 'zzz/nope', 0.5, '')).toThrow()
  })
})
