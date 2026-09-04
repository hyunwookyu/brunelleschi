// web2-63 — 팁 아틀라스·종이 결 단위 시험(브라우저 없이 되는 것): 생성 메타 · 팁 마스크의 회전·비율(④) ·
// 판 고정/돌려 쓰기(②의 기제) · 종이 타일 접기(grainN) · 팁 기본 표.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TIPS, TIP_SIZE, PAPER_NAME, TIP_NAMES } from '../src/mypaint/tips.gen'
import { Layer, StrokeSurface, type StrokeOpts } from '../src/mypaint/surface'
import type { TipAtlas } from '../src/mypaint/tips'
import { rng32 } from '../src/core/material'
import { grainTile61, GRAIN_TILE, grainTile, grainTileN, setPaperHeightTile, setPaper61ForTest, grainSource } from '../src/mypaint/paper'
import { tipDefaultOf } from '../src/app/mypaintpaint'

const HERE = resolve(__dirname)

describe('① 생성 메타(tips.gen.ts) — 자산 다섯 + 종이', () => {
  it('팁 5 · 판 8 · 192² · 종이 1024² · 출처·라이선스가 비지 않는다 · PNG가 실재한다', () => {
    expect(TIP_NAMES).toEqual(['fine-grain', 'chalk-chisel', 'rock-pitted', 'scratches-rough', 'scratches2'])
    for (const t of TIPS) {
      expect(t.source.length).toBeGreaterThan(20)
      expect(t.license).toMatch(/CC0|CC-0/)
      expect(t.license_check.length).toBeGreaterThan(10)
      const png = resolve(HERE, '../src/mypaint/tips', `${t.name}.png`)
      expect(existsSync(png), `${t.name}.png`).toBe(true)
      const b = readFileSync(png)
      expect(b.readUInt32BE(16), `${t.name} 폭`).toBe(t.size * t.frames)
      expect(b.readUInt32BE(20), `${t.name} 높이`).toBe(t.size)
      if (t.name === PAPER_NAME) { expect(t.size).toBe(1024); expect(t.frames).toBe(1) }
      else { expect(t.frames).toBe(8); expect(t.size).toBe(TIP_SIZE) }
    }
  })
})

/** 합성 아틀라스 — 판 0 = 가로 막대(가운데 띠) · 판 1 = 세로 막대 · 판 2.. = 빈 판(방향 시험용) */
function barAtlas(n = 4, S = 32): TipAtlas {
  const data = new Float32Array(n * S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (Math.abs(y - S / 2 + 0.5) < S / 8) data[0 * S * S + y * S + x] = 1
    if (Math.abs(x - S / 2 + 0.5) < S / 8) data[1 * S * S + y * S + x] = 1
  }
  return { name: 'bar', n, size: S, data, meta: TIPS[0]! }
}
const opts = (over: Partial<StrokeOpts> = {}): StrokeOpts => ({
  cap: 1, capExact: false, opacityK: 1, capOff: false, grain: null, grainN: 1, grainDepth: 0, snapshotAll: false, smudgeSnapshot: true,
  rng: rng32(1), tip: null, tipFrameLock: -1, ...over,
})
/** 알파의 2차 모멘트 — 장축 각(도) · 이방성(λ1/λ2) */
function moments(a: Float32Array, W: number, H: number): { angle: number; aniso: number; mass: number } {
  let m = 0, mx = 0, my = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = a[y * W + x]!; m += v; mx += v * x; my += v * y }
  if (m < 1e-6) return { angle: 0, aniso: 1, mass: 0 }
  const cx = mx / m, cy = my / m
  let sxx = 0, syy = 0, sxy = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = a[y * W + x]!; sxx += v * (x - cx) ** 2; syy += v * (y - cy) ** 2; sxy += v * (x - cx) * (y - cy) }
  sxx /= m; syy /= m; sxy /= m
  const tr = sxx + syy, det = sxx * syy - sxy * sxy
  const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det))
  const angle = (Math.atan2(2 * sxy, sxx - syy) / 2) * 180 / Math.PI
  return { angle, aniso: l2 > 1e-9 ? l1 / l2 : Infinity, mass: m }
}
function dabWith(o: Partial<StrokeOpts>, angle: number, aspect: number): { a: Float32Array; s: StrokeSurface } {
  const s = new StrokeSurface(new Layer(96, 96))
  s.beginStroke(opts(o))
  s.drawDab(48, 48, 24, 0, 0, 0, 1, 1, 0, 1, aspect, angle, 0, 0, 0, 0, 0, 1)
  s.endStroke()
  return { a: s.alphaMap(), s }
}

describe('② 팁 마스크 — 회전·비율(게이트 ④의 기제)', () => {
  it('가로 막대 판이 dab_angle 0에서 가로 · 90에서 세로 · 비율 3은 이방성이 준다(막대가 짧아진다)', () => {
    const tip = barAtlas()
    const h = moments(dabWith({ tip, tipFrameLock: 0 }, 0, 1).a, 96, 96)
    const v = moments(dabWith({ tip, tipFrameLock: 0 }, 90, 1).a, 96, 96)
    expect(h.mass).toBeGreaterThan(50)
    expect(Math.abs(h.angle)).toBeLessThan(3)                          // 가로
    expect(Math.abs(Math.abs(v.angle) - 90)).toBeLessThan(3)           // 세로
    expect(h.aniso).toBeGreaterThan(5)
    // 비율 3: 원문 변환은 yyr에 aspect를 곱한다 — 판의 세로가 1/3로 눌린다 → 가로 막대는 더 납작(이방성 ↑)
    const sq = moments(dabWith({ tip, tipFrameLock: 0 }, 0, 3).a, 96, 96)
    expect(sq.aniso).toBeGreaterThan(h.aniso * 2)
    // 반증(D-3) — 판 1(세로 막대)을 각 0으로: 세로가 나온다(각이 판을 «돌린다»는 것과 «판이 다르다»는 것이 갈린다)
    const v2 = moments(dabWith({ tip, tipFrameLock: 1 }, 0, 1).a, 96, 96)
    expect(Math.abs(Math.abs(v2.angle) - 90)).toBeLessThan(3)
  })
  it('절차 타원(tip null)은 등방(이방성 ≈ 1) — 62 경로 그대로', () => {
    const c = moments(dabWith({}, 0, 1).a, 96, 96)
    expect(c.aniso).toBeLessThan(1.05)
  })
})

describe('③ 판 돌려 쓰기 — 잠금이면 판 하나 · 아니면 난수로 여럿(결정론)', () => {
  const stroke = (o: Partial<StrokeOpts>, seed: number): StrokeSurface => {
    const s = new StrokeSurface(new Layer(256, 64))
    s.beginStroke(opts({ ...o, rng: rng32(seed) }))
    for (let i = 0; i < 40; i++) s.drawDab(20 + i * 5, 32, 8, 0, 0, 0, 0.5, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1)
    s.endStroke()
    return s
  }
  it('잠금 0 → frames[0] = 40 · 돌려 쓰기 → 판 여러 개 · 같은 시드 = 같은 히스토그램 · 다른 시드 = 다르다', () => {
    const tip = barAtlas(8)
    const lock = stroke({ tip, tipFrameLock: 0 }, 5)
    expect(lock.tipDabs).toBe(40); expect(lock.tipFrames[0]).toBe(40)
    const a = stroke({ tip }, 5), b = stroke({ tip }, 5), c = stroke({ tip }, 6)
    expect(a.tipFrames.filter(n => n > 0).length).toBeGreaterThanOrEqual(5)
    expect(a.tipFrames).toEqual(b.tipFrames)
    expect(a.tipFrames).not.toEqual(c.tipFrames)
  })
})

describe('④ 종이 타일 — 61 값 잡음 · 높이맵 꽂기 · 대조 스위치 · 접기(grainN)', () => {
  it('높이맵을 꽂으면 grainTile이 그것(1024) · 61 스위치면 256 값 잡음 · 엔진은 grainN으로 접는다', () => {
    expect(grainSource()).toBe('value61')
    expect(grainTileN()).toBe(GRAIN_TILE)
    const n = 64
    const t = new Float32Array(n * n); for (let i = 0; i < t.length; i++) t[i] = (i % n) / (n - 1)   // 가로로 0→1
    setPaperHeightTile(t, n)
    expect(grainSource()).toBe('height'); expect(grainTileN()).toBe(64); expect(grainTile()).toBe(t)
    setPaper61ForTest(true)
    expect(grainSource()).toBe('value61'); expect(grainTile()).toBe(grainTile61())
    setPaper61ForTest(false)
    // 접기: x = 5와 x = 69는 같은 이빨(69 % 64 = 5) — 같은 자리에 같은 깎임(면 고정 · 굵기 무관의 기제)
    const s = new StrokeSurface(new Layer(128, 16))
    s.beginStroke(opts({ grain: t, grainN: n, grainDepth: 1 }))
    s.drawDab(5.5, 8, 2, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1)
    s.drawDab(69.5, 8, 2, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1)
    s.endStroke()
    const a = s.alphaMap()
    expect(a[8 * 128 + 5]).toBeCloseTo(a[8 * 128 + 69]!, 5)
    expect(a[8 * 128 + 5]!).toBeLessThan(a[8 * 128 + 4]!)            // 이빨이 깊을수록(오른쪽) 더 깎인다
    expect(() => setPaperHeightTile(new Float32Array(10), 4)).toThrow()
  })
})

describe('⑤ 팁 기본 표 — 마른 매체만 팁 · 잉크·마커는 없음', () => {
  it('연필 계열 fine-grain · 목탄 chalk-chisel · 파스텔 rock-pitted · 마른붓 scratches-rough · 색연필 scratches2 · 라이너·마커·에어브러시 null', () => {
    expect(tipDefaultOf('classic/pencil')).toBe('fine-grain')
    expect(tipDefaultOf('deevad/2B_pencil')).toBe('fine-grain')
    expect(tipDefaultOf('classic/charcoal')).toBe('chalk-chisel')
    expect(tipDefaultOf('ramon/Pastel_1')).toBe('rock-pitted')
    expect(tipDefaultOf('classic/dry_brush')).toBe('scratches-rough')
    expect(tipDefaultOf('ramon/B-pencil')).toBe('scratches2')
    for (const p of ['deevad/liner', 'ramon/100%_Opaque', 'classic/pen', 'deevad/airbrush', 'Dieterle/Round#1', 'classic/smudge']) expect(tipDefaultOf(p), p).toBeNull()
  })
})
