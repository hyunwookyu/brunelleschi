// web2-11 2부 — brush 매핑의 순수부(2차 리뷰어 [17] — WebGL 없이 단위로 잰다).
import { describe, it, expect } from 'vitest'
import { BRUSH_OF, alphaColor, lumaOf, strokeColor, weightOf, pressureProfile, PRESS_N } from '../src/app/brushmap'
import { GRADES, MAT, widthOfMat } from '../src/core/material'
import { C } from '../src/core/constants'
import type { Stroke, Grade } from '../src/core/types'

const stroke = (grade: Grade, extra?: Partial<Stroke>): Stroke =>
  ({ id: 1, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, mat: { grade }, ...extra })

describe('brush 매핑(2-c)', () => {
  it('모든 경도가 브러시 이름을 갖고, 이름 그대로인 넷이 지시 문면과 같다', () => {
    for (const g of GRADES) expect(typeof BRUSH_OF[g]).toBe('string')
    expect(BRUSH_OF['2H']).toBe('2H')
    expect(BRUSH_OF['HB']).toBe('HB')
    expect(BRUSH_OF['2B']).toBe('2B')
    expect(BRUSH_OF['INK']).toBe('rotring')          // INK 자리의 제도펜(지시 문면)
  })

  it('경도 단조(2-c의 물음): 화면색 광도가 2H→2B로 **좁게라도 전부 갈리며** 어두워진다', () => {
    // 질감 급이 3계단으로 동률이 된 대신(2H·H / F·HB / B·2B) 진하기가 사이를 잇는다 —
    // 인접 급이 실제로 갈리는지가 이 팔의 물음이다(2차 [9]: MAT 표 재인용이 아니라
    // **brush에 실제로 넘어가는 색**(strokeColor)의 단조를 잰다).
    const pencil: Grade[] = ['2H', 'H', 'F', 'HB', 'B', '2B']
    const lumas = pencil.map(g => lumaOf(strokeColor(g)))
    for (let i = 1; i < lumas.length; i++) {
      expect(lumas[i]!).toBeLessThan(lumas[i - 1]!)  // 강한 단조 — 동률이면 급이 사라진 것
    }
    // 반증 조건(D-3): alphaColor가 알파를 무시하면(색만 반환) H(0.60)와 2H(0.50)가
    // 색 차만 남는데 그래도 갈린다 — 그래서 알파 무시를 «따로» 잡는다: 같은 색·다른 알파.
    expect(lumaOf(alphaColor('#808080', 0.5))).toBeGreaterThan(lumaOf(alphaColor('#808080', 0.9)))
  })

  it('alphaColor — 알파 1이면 원색 그대로, 0이면 종이색이다(혼합의 양 끝)', () => {
    expect(alphaColor('#303030', 1)).toBe('#303030')
    expect(alphaColor('#303030', 0)).toBe('#f5f3ee')
  })

  it('굵기의 출처는 widthOfMat 하나다(#54) — 니브 포함', () => {
    expect(weightOf(stroke('HB'))).toBe(widthOfMat({ grade: 'HB' }))
    expect(weightOf(stroke('INK', { mat: { grade: 'INK', w: 2.5 } }))).toBe(2.5)
  })

  it('필압 계수(1부가 이 자리를 위해 먼저였다): rawIn 점별 → 0.5..1.5 대역 · 최대 12표본', () => {
    const n = 40
    const s = stroke('HB', {
      raw: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
      rawIn: { press: Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * C.PRESS_Q)) },
    })
    const prof = pressureProfile(s)!
    expect(prof).toHaveLength(PRESS_N)
    expect(prof[0]!).toBeCloseTo(0.5, 6)             // 필압 0 → 0.5 (grain의 (0.5+p) 그대로)
    expect(prof[prof.length - 1]!).toBeCloseTo(1.5, 6)
    for (const v of prof) { expect(v).toBeGreaterThanOrEqual(0.5); expect(v).toBeLessThanOrEqual(1.5) }
    // 단조 입력 → 단조 출력(리샘플이 순서를 안 섞는다)
    for (let i = 1; i < prof.length; i++) expect(prof[i]!).toBeGreaterThanOrEqual(prof[i - 1]!)
  })

  it('rawIn이 없으면 mat.press 평균으로 균일, 그것도 없으면 null(brush.line 갈래)', () => {
    expect(pressureProfile(stroke('HB', { mat: { grade: 'HB', press: 0.4 } })))
      .toEqual([0.9, 0.9])
    expect(pressureProfile(stroke('HB'))).toBeNull()
  })

  it('INK는 필압을 안 싣는다 — 제도펜은 균일선이다', () => {
    const s = stroke('INK', {
      raw: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      rawIn: { press: [100, 4000, 8000] },
    })
    expect(pressureProfile(s)).toBeNull()
  })

  it('MAT 대조표의 전제 — grain 열은 brush로 안 옮긴다(내장 질감이 대신한다 · 2-e)', () => {
    // BRUSH_OF가 MAT.grain을 읽지 않는 것은 구조(순수 표)로 자명하다 — 여기서는
    // 표가 «연필 여섯 + 잉크 하나»를 정확히 덮는 것만 잰다(빠진 급이 런타임에 undefined로
    // 떨어지는 것을 막는 완전성 팔).
    expect(Object.keys(BRUSH_OF).sort()).toEqual([...GRADES].sort())
    expect(MAT['2B'].grain).toBeGreaterThan(0)       // 전제 확인 — MAT에는 여전히 grain이 있다(classic 몫)
  })
})
