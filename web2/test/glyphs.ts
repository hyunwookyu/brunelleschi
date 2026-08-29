// 손글씨 숫자 픽스처 — **한 자리다**(#54). web2-29 1단계가 만들었고 web2-32가 같은 것을
// 읽는다(글씨/작도선 가르기·대상 판정). ⚠ 인식기 템플릿이 아니라 «사람이 또박또박 쓴
// 것»의 흉내이고, 흔들기(jit)는 rng32로 태운다(Math.random ⛔ #14).

import { rng32 } from '../src/core/material'
import type { Pt } from '../src/core/vec'

export const SHAPES: Record<string, Pt[][]> = {
  '0': [[{ x: .5, y: 0 }, { x: .15, y: .2 }, { x: .08, y: .5 }, { x: .15, y: .8 }, { x: .5, y: 1 }, { x: .85, y: .8 }, { x: .92, y: .5 }, { x: .85, y: .2 }, { x: .5, y: 0 }]],
  '1': [[{ x: .5, y: 0 }, { x: .5, y: 1 }]],
  '2': [[{ x: .12, y: .26 }, { x: .3, y: .04 }, { x: .6, y: .04 }, { x: .86, y: .28 }, { x: .6, y: .58 }, { x: .3, y: .78 }, { x: .1, y: 1 }, { x: .9, y: 1 }]],
  '3': [[{ x: .15, y: .1 }, { x: .5, y: 0 }, { x: .84, y: .16 }, { x: .8, y: .36 }, { x: .5, y: .48 }, { x: .84, y: .62 }, { x: .84, y: .85 }, { x: .5, y: 1 }, { x: .16, y: .9 }]],
  '4': [[{ x: .68, y: 0 }, { x: .12, y: .62 }, { x: .92, y: .62 }], [{ x: .68, y: .3 }, { x: .68, y: 1 }]],
  '5': [[{ x: .85, y: 0 }, { x: .22, y: 0 }, { x: .18, y: .42 }, { x: .55, y: .38 }, { x: .85, y: .58 }, { x: .82, y: .84 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '6': [[{ x: .72, y: .04 }, { x: .38, y: .28 }, { x: .18, y: .6 }, { x: .24, y: .86 }, { x: .52, y: 1 }, { x: .78, y: .84 }, { x: .72, y: .58 }, { x: .42, y: .54 }, { x: .2, y: .66 }]],
  '7': [[{ x: .1, y: 0 }, { x: .9, y: 0 }, { x: .45, y: 1 }]],
  '8': [[{ x: .5, y: .48 }, { x: .2, y: .26 }, { x: .5, y: 0 }, { x: .8, y: .26 }, { x: .5, y: .48 }, { x: .18, y: .76 }, { x: .5, y: 1 }, { x: .82, y: .76 }, { x: .5, y: .48 }]],
  '9': [[{ x: .8, y: .12 }, { x: .5, y: 0 }, { x: .2, y: .14 }, { x: .18, y: .38 }, { x: .5, y: .5 }, { x: .78, y: .38 }, { x: .8, y: .12 }], [{ x: .8, y: .16 }, { x: .74, y: 1 }]],
}

/** 한 글자를 그 자리·그 크기로 놓는다. `jit`이 손 흔들림(px)이다. */
export function glyph(ch: string, x0: number, y0: number, w: number, h: number, seed: number, jit = 0): Pt[][] {
  const r = rng32(seed)
  const src = ch === '.' ? [[{ x: .5, y: .95 }, { x: .55, y: 1 }]] : SHAPES[ch]!
  return src.map(st => st.map(p => ({
    x: x0 + p.x * w + (r() - 0.5) * 2 * jit,
    y: y0 + p.y * h + (r() - 0.5) * 2 * jit,
  })))
}

/** 여러 글자를 나란히 — 글자 폭 `w`, 사이 `gap` */
export function write(text: string, x0: number, y0: number, seed: number, jit = 0, w = 22, h = 34, gap = 8): Pt[][] {
  const out: Pt[][] = []
  let x = x0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const cw = ch === '.' ? w * 0.35 : w
    out.push(...glyph(ch, x, y0, cw, h, seed + i * 977, jit))
    x += cw + gap
  }
  return out
}
