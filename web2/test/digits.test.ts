// 펜 숫자 인식(4-3) — $P 점군 매칭. 템플릿 자기 인식은 판별력이 없으므로(항등)
// **흔든 표본**(이동·배율·기울임·잡음)으로 잰다. 시드 고정 — Math.random 금지 규약.

import { describe, it, expect } from 'vitest'
import { recognizeGlyph, recognizeDigits } from '../src/core/digits'
import { rng32 } from '../src/core/material'
import type { Pt } from '../src/core/vec'

/** 정규 템플릿과 같은 모양을 손 흔들림처럼 변형해 화면 좌표로 놓는다 */
function jitterGlyph(
  strokes: Pt[][], seed: number,
  opt: { x: number; y: number; s: number; rot?: number; noise?: number },
): Pt[][] {
  const rnd = rng32(seed)
  const rot = opt.rot ?? 0
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const noise = opt.noise ?? 0
  return strokes.map(st => {
    // 표집을 늘린다 — 손 획은 점이 많다
    const dense: Pt[] = []
    for (let i = 1; i < st.length; i++) {
      for (let t = 0; t < 6; t++) {
        const u = t / 6
        dense.push({ x: st[i - 1]!.x + (st[i]!.x - st[i - 1]!.x) * u, y: st[i - 1]!.y + (st[i]!.y - st[i - 1]!.y) * u })
      }
    }
    dense.push(st[st.length - 1]!)
    return dense.map(p => {
      const cx = p.x - 0.5, cy = p.y - 0.5
      return {
        x: opt.x + (cx * cos - cy * sin) * opt.s + (rnd() - 0.5) * noise,
        y: opt.y + (cx * sin + cy * cos) * opt.s + (rnd() - 0.5) * noise,
      }
    })
  })
}

// 템플릿 모양의 사본 — 인식기 내부 표와 별개로 적는다(내부가 바뀌면 이 팔이 그것을 잰다)
const SHAPES: Record<string, Pt[][]> = {
  '0': [[{ x: .5, y: 0 }, { x: .18, y: .12 }, { x: .05, y: .5 }, { x: .18, y: .88 }, { x: .5, y: 1 }, { x: .82, y: .88 }, { x: .95, y: .5 }, { x: .82, y: .12 }, { x: .5, y: 0 }]],
  '1': [[{ x: .5, y: 0 }, { x: .5, y: 1 }]],
  '2': [[{ x: .12, y: .28 }, { x: .22, y: .06 }, { x: .5, y: 0 }, { x: .78, y: .08 }, { x: .88, y: .3 }, { x: .62, y: .56 }, { x: .32, y: .76 }, { x: .1, y: 1 }, { x: .9, y: 1 }]],
  '3': [[{ x: .15, y: .1 }, { x: .5, y: 0 }, { x: .85, y: .15 }, { x: .82, y: .36 }, { x: .5, y: .48 }, { x: .85, y: .62 }, { x: .85, y: .85 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '4': [[{ x: .68, y: 0 }, { x: .12, y: .62 }, { x: .92, y: .62 }], [{ x: .68, y: .3 }, { x: .68, y: 1 }]],
  '5': [[{ x: .85, y: 0 }, { x: .22, y: 0 }, { x: .18, y: .42 }, { x: .55, y: .38 }, { x: .85, y: .58 }, { x: .82, y: .84 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '6': [[{ x: .72, y: .04 }, { x: .38, y: .28 }, { x: .18, y: .6 }, { x: .24, y: .86 }, { x: .52, y: 1 }, { x: .78, y: .84 }, { x: .72, y: .58 }, { x: .42, y: .54 }, { x: .2, y: .66 }]],
  '7': [[{ x: .1, y: 0 }, { x: .9, y: 0 }, { x: .45, y: 1 }]],
  '8': [[{ x: .5, y: .48 }, { x: .2, y: .26 }, { x: .5, y: 0 }, { x: .8, y: .26 }, { x: .5, y: .48 }, { x: .18, y: .76 }, { x: .5, y: 1 }, { x: .82, y: .76 }, { x: .5, y: .48 }]],
  '9': [[{ x: .8, y: .12 }, { x: .5, y: 0 }, { x: .2, y: .14 }, { x: .18, y: .38 }, { x: .5, y: .5 }, { x: .78, y: .38 }, { x: .8, y: .12 }], [{ x: .8, y: .16 }, { x: .74, y: 1 }]],
}

describe('글리프 하나 — 흔든 표본이 제 숫자로 읽힌다', () => {
  it('열 숫자 × 변형 넷(이동·배율·±6° 기울임·잡음 3px 급)', () => {
    const variants = [
      { x: 40, y: 40, s: 50, noise: 2 },
      { x: 120, y: 45, s: 64, rot: 0.1, noise: 2.5 },
      { x: 60, y: 38, s: 44, rot: -0.1, noise: 2 },
      { x: 90, y: 50, s: 70, noise: 3 },
    ]
    let seed = 7
    for (const [ch, shape] of Object.entries(SHAPES)) {
      for (const v of variants) {
        const r = recognizeGlyph(jitterGlyph(shape, seed++, v))
        expect(r?.ch, `${ch} @ ${JSON.stringify(v)}`).toBe(ch)
      }
    }
  })

  it('반증(D-3): 숫자가 아닌 것은 null — 가로선·지그재그', () => {
    const flat: Pt[][] = [[{ x: 0, y: 40 }, { x: 100, y: 40 }]]
    expect(recognizeGlyph(flat)).toBeNull()
    const zig: Pt[][] = [[{ x: 0, y: 0 }, { x: 20, y: 60 }, { x: 40, y: 0 }, { x: 60, y: 60 }, { x: 80, y: 0 }]]
    expect(recognizeGlyph(zig)).toBeNull()
  })
})

describe('여러 글리프 — 묶음·순서·소수점', () => {
  const put = (ch: string, x: number, seed: number, s = 50): Pt[][] =>
    jitterGlyph(SHAPES[ch]!, seed, { x, y: 40, s, noise: 1.5 })

  it('«3» «5» «0» «0» 가 3500으로 읽힌다 — 쓴 순서가 아니라 가로 자리 순서다', () => {
    const strokes = [...put('5', 100, 3), ...put('3', 40, 5), ...put('0', 160, 8), ...put('0', 220, 9)]
    expect(recognizeDigits(strokes)).toBe('3500')
  })

  it('«4»의 두 획이 한 글리프로 묶인다 — 가로로 겹치므로', () => {
    const strokes = [...put('4', 40, 11), ...put('2', 120, 13)]
    expect(recognizeDigits(strokes)).toBe('42')
  })

  it('작은 점은 소수점이다 — «3 . 5»', () => {
    const dot: Pt[][] = [[{ x: 82, y: 62 }, { x: 84, y: 64 }, { x: 83, y: 63 }]]
    const strokes = [...put('3', 40, 17), ...dot, ...put('5', 110, 19)]
    expect(recognizeDigits(strokes)).toBe('3.5')
  })

  it('못 읽는 글리프는 «?»로 남는다 — 조용히 다른 숫자가 되지 않는다', () => {
    const zig: Pt[][] = [[{ x: 100, y: 10 }, { x: 115, y: 70 }, { x: 130, y: 10 }, { x: 145, y: 70 }, { x: 160, y: 10 }]]
    const strokes = [...put('3', 40, 23), ...zig]
    expect(recognizeDigits(strokes)).toBe('3?')
  })
})
