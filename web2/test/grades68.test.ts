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
import { lerpPreset, PENCIL_LERP_T, PENCIL_FAMILY, familySizeK } from '../src/app/brushes64'
import { SETTINGS } from '../src/mypaint/settings.gen'
import { BRUSH_LABEL_EXACT } from '../src/core/brushnames'

describe('web2-68 §2 — 경도 축', () => {
  it('① 경도 축의 프리셋 전수가 실재한다(연필 여섯 · 목탄 셋 · 서로 다르다)', () => {
    const names = new Set(PRESETS.map(p => p.name))
    for (const n of GRADE_PRESETS68) expect(names.has(n), `${n}이 카탈로그에 있다`).toBe(true)
    expect(new Set(GRADE_PRESETS68).size, '아홉이 서로 다르다').toBe(9)
    expect(PENCIL_GRADES68.length).toBe(6); expect(CHARCOAL_GRADES68.length).toBe(3)
  })

  it('② 가족 프리셋(개정) — 뿌리의 설정 전부를 물려받고 매개 셋만 다르다 · 키는 SETTINGS 안(#108)', () => {
    const known = new Set(SETTINGS.map(s => s.id))
    for (const [root, names] of [['classic/pencil', GRADE_PRESETS68.slice(0, 6)], ['classic/charcoal', GRADE_PRESETS68.slice(6)]] as const) {
      const r = PRESET_BY_NAME.get(root)!
      for (const name of names) {
        const p = PRESET_BY_NAME.get(name)!
        expect(p, `${name}이 카탈로그에 있다`).toBeTruthy()
        expect(Object.keys(p.s).sort(), `${name}: 설정 키 집합이 뿌리와 같다`).toEqual(Object.keys(r.s).sort())
        for (const [k, v] of Object.entries(p.s)) {
          expect(known.has(k), `${name}.${k}는 libmypaint 설정이다`).toBe(true)
          if (!['opaque', 'radius_logarithmic', 'hardness'].includes(k)) expect(v, `${name}.${k}는 뿌리 그대로`).toEqual(r.s[k])
          else if (r.s[k]?.[1]) expect(v[1], `${name}.${k} 곡선은 뿌리 것`).toEqual(r.s[k]![1])
        }
      }
    }
    // 반지름 등비(HB → 8B sizeK8B — 측정 폭 비 2.0의 되먹임 끝값 · AS-C201) · hardness 등차(× .7) · 크기 배수 = exp(반지름 차)
    const hb = PRESET_BY_NAME.get('brunelleschi/pencil_HB')!, b8 = PRESET_BY_NAME.get('brunelleschi/pencil_8B')!
    expect(Math.exp(b8.s.radius_logarithmic![0] - hb.s.radius_logarithmic![0])).toBeCloseTo(PENCIL_FAMILY.sizeK8B, 3)
    expect(familySizeK('brunelleschi/pencil_8B')).toBeCloseTo(PENCIL_FAMILY.sizeK8B, 3)
    expect(familySizeK('brunelleschi/pencil_HB')).toBe(1)
    expect(familySizeK('classic/pencil'), '뿌리·다른 프리셋은 배수 1(58 정직성 무변)').toBe(1)
    expect(familySizeK('brunelleschi/charcoal_S')).toBeCloseTo(1.2, 6)
    expect(b8.s.hardness![0] / hb.s.hardness![0]).toBeCloseTo(0.7, 3)
    // (초판 lerpPreset은 기록으로 남는다 — 키가 두 원본 안이라는 규약)
    const l = lerpPreset('brunelleschi/x_lerp', 'tanda/pencil-2b', 'tanda/pencil-8b', PENCIL_LERP_T.pencil_4B, '')
    for (const k of Object.keys(l.s)) expect(known.has(k)).toBe(true)
  })

  it('③ shiftGrade — 아래(+)로 무른 쪽 · 끝에서 멈춤 · 축 밖은 그대로', () => {
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, 1)).toBe(PENCIL_PRESET_OF_GRADE.B)
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, 99)).toBe(PENCIL_PRESET_OF_GRADE['8B'])
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE['8B'], -1)).toBe(PENCIL_PRESET_OF_GRADE['6B'])
    expect(shiftGrade(PENCIL_PRESET_OF_GRADE.HB, -1)).toBe(PENCIL_PRESET_OF_GRADE.HB)
    expect(shiftGrade(CHARCOAL_PRESET_OF_GRADE['경'], 1)).toBe(CHARCOAL_PRESET_OF_GRADE['중'])
    expect(shiftGrade(CHARCOAL_PRESET_OF_GRADE['연'], 1)).toBe(CHARCOAL_PRESET_OF_GRADE['연'])
    expect(shiftGrade('deevad/liner', 3)).toBe('deevad/liner')
    expect(gradeOfPreset('classic/pencil'), '옛 획의 뿌리는 HB로 읽힌다').toEqual({ kind: 'pencil', grade: 'HB' })
    expect(shiftGrade('classic/pencil', 1), '뿌리에서 끌면 가족의 B').toBe(PENCIL_PRESET_OF_GRADE.B)
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
