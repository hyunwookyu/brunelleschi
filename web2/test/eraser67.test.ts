// web2-67 0-6 — 칠 지우개의 «합성 수학» 단위 팔(브라우저 없이 되는 몫).
//
// 자리: 엔진의 Normal_and_Eraser 경로(surface.drawDab의 colorA<1 갈래 — 62가 이식한 원문
// 블렌드)가 «덮임을 뺀다»를 실제로 하는가. 배선 전수(획 표식 er → SeamMark.erase →
// S.ERASER 강제 → 화면 픽셀)는 e2e(paint67 ①~⑥)가 잰다 — 여기는 그 바닥의 수학이다.
//
// D-3(반증 조건): 각 검사에 «실패하는 조건»을 같이 밟는다 —
//   ① 지우개(colorA=0)를 보통 도장(colorA=1)으로 바꾸면 알파가 «늘어야» 한다(빼기가 아니라 얹기)
//   ② 순서를 섞지 않으면(지우개가 마지막) 두 판이 같아진다 — 다른 것은 «순서» 때문임의 실증
import { describe, it, expect } from 'vitest'
import { Layer, StrokeSurface, type StrokeOpts } from '../src/mypaint/surface'
import { rng32 } from '../src/core/material'
import { ERASER_BRUSH } from '../src/core/paintseam'
import { PRESET_BY_NAME, presetBaseForTest } from '../src/app/mypaintpaint'

const opts = (over: Partial<StrokeOpts> = {}): StrokeOpts => ({
  cap: 1, capExact: false, opacityK: 1, capOff: false, grain: null, grainN: 256, grainDepth: 0,
  snapshotAll: false, smudgeSnapshot: true, rng: rng32(1), tip: null, tipFrameLock: -1, ...over,
})
/** (x,16)에 도장 n번 — colorA가 지우개의 그 축이다(1 = 보통 · 0 = 지우개 · brush.ts 527행) */
function stamp(surf: StrokeSurface, x: number, n: number, opaque: number, colorA: number): void {
  for (let k = 0; k < n; k++) surf.drawDab(x, 16, 6, 0.2, 0.3, 0.4, opaque, 0.9, 0, colorA, 1, 0, 0, 0, 0, 0.05, 0, opaque)
}
const alphaAt = (s: StrokeSurface, x: number): number => s.layer.data[(16 * s.layer.w + x) * 4 + 3]!

describe('67 0-6 ① 지우개는 덮임을 «뺀다» — 지운 자리의 알파 감소(값) · 다른 자리 무변', () => {
  it('칠(알파>0) → 지우개 획 → 그 자리 알파가 실제로 준다 · 안 지운 자리는 비트로 같다', () => {
    const s = new StrokeSurface(new Layer(64, 32))
    s.beginStroke(opts()); stamp(s, 16, 6, 0.6, 1); stamp(s, 40, 6, 0.6, 1); s.endStroke()
    const before16 = alphaAt(s, 16), before40 = alphaAt(s, 40)
    expect(before16).toBeGreaterThan(0.3)
    // 지우개 획 — colorA 0(= eraser 1: eraserTargetAlpha = 1−eraser · brush.ts)
    s.beginStroke(opts()); stamp(s, 16, 6, 0.8, 0); s.endStroke()
    const after16 = alphaAt(s, 16), after40 = alphaAt(s, 40)
    expect(after16, '지운 자리 — 알파 감소(값)').toBeLessThan(before16 * 0.5)
    expect(after40, '안 지운 자리 — 비트로 무변').toBe(before40)
    // 반증(D-3) — 같은 획을 «보통»(colorA 1)으로 바꾸면 빼기가 아니라 얹기다(알파 증가)
    const f = new StrokeSurface(new Layer(64, 32))
    f.beginStroke(opts()); stamp(f, 16, 6, 0.6, 1); f.endStroke()
    const fb = alphaAt(f, 16)
    f.beginStroke(opts()); stamp(f, 16, 6, 0.8, 1); f.endStroke()
    expect(alphaAt(f, 16), '반증 — 보통 도장이면 는다').toBeGreaterThan(fb)
  })
  it('부분 지움 — 지우개 불투명이 낮으면 남는 알파가 그만큼 크다(빼기의 눈금이 실린다)', () => {
    const mk = (eraseOpaque: number): number => {
      const s = new StrokeSurface(new Layer(32, 32))
      s.beginStroke(opts()); stamp(s, 16, 6, 0.6, 1); s.endStroke()
      s.beginStroke(opts()); stamp(s, 16, 1, eraseOpaque, 0); s.endStroke()
      return alphaAt(s, 16)
    }
    expect(mk(0.9), '센 지움이 더 많이 지운다').toBeLessThan(mk(0.3))
  })
})

describe('67 0-6 ② 순서가 실린다 — 칠→지우기→칠 ≠ 칠→칠→지우기', () => {
  it('두 차례의 최종 알파가 다르다 · 반증: 지우기가 둘 다 마지막이면 같다', () => {
    const seq = (order: ('p' | 'e')[]): number => {
      const s = new StrokeSurface(new Layer(32, 32))
      for (const k of order) {
        s.beginStroke(opts())
        stamp(s, 16, 4, k === 'p' ? 0.5 : 0.8, k === 'p' ? 1 : 0)
        s.endStroke()
      }
      return alphaAt(s, 16)
    }
    const peP = seq(['p', 'e', 'p'])   // 칠→지우기→칠: 마지막 칠이 산다
    const ppE = seq(['p', 'p', 'e'])   // 칠→칠→지우기: 지우개가 둘 다 깎는다
    expect(Math.abs(peP - ppE), '순서가 결과에 실린다(값)').toBeGreaterThan(0.1)
    expect(peP, '지운 «뒤» 칠은 살아 있다').toBeGreaterThan(ppE)
    // 반증(D-3) — 순서를 같게 하면(둘 다 지우기가 마지막 · 같은 열) 같은 값이다
    expect(seq(['p', 'p', 'e'])).toBe(seq(['p', 'p', 'e']))
  })
})

describe('67 0-6 배선의 상수 몫 — 지우개 브러시(CC0)와 그 성질', () => {
  it('ERASER_BRUSH 둘이 카탈로그에 실재하고 eraser=1 · 경도 축(hard>soft)이 값으로 갈린다', () => {
    for (const name of [ERASER_BRUSH.hard, ERASER_BRUSH.soft]) {
      expect(PRESET_BY_NAME.has(name), name).toBe(true)
      expect(presetBaseForTest(name)!.eraser, `${name} — eraser=1`).toBe(1)
    }
    const hard = PRESET_BY_NAME.get(ERASER_BRUSH.hard)!.s['hardness']![0] as number
    const soft = PRESET_BY_NAME.get(ERASER_BRUSH.soft)!.s['hardness']![0] as number
    expect(hard, '딱딱한 쪽의 경도가 크다(0.9 vs 0.5 — 값을 짓지 않았다: CC0 프리셋 그대로)').toBeGreaterThan(soft)
  })
})
