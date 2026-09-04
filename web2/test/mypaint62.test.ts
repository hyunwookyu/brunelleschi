// web2-62 — mypaint 이식의 단위 몫(픽셀·브라우저 없이 node에서 도는 것).
//   ① 사상(mapping) — 조각선형 · 상수 · 경계(C 원문의 분기 그대로)
//   ② 스펙트럼 — rgb → 스펙트럼 → rgb 왕복이 항등 근처 · 파랑×노랑 WGM = 초록(색상각) ·
//      반증: paint_mode 0의 가산 혼합은 초록이 아니다
//   ③ 프리셋 충실도(게이트 ⑥) — 196개 전부: .myb의 설정 키가 65 안 · 곡선 점 수 일치 ·
//      건너뛴 입력은 surfacemap_*뿐
//   ④ 표면 — 덮임 캡: 같은 자리에 도장을 거듭 얹어도 목표를 안 넘는다 · 반증(capOff)은 넘는다 ·
//      두 «획»은 쌓인다 · rgb ≤ a 단언이 일부러 깬 픽셀을 잡는다 · 결정론(같은 시드 = 같은 층)
//   ⑤ 종이 결 — 타일이 0..1이고 깊이가 캡을 깎는다(포화 몸통이 결을 보인다)

import { describe, it, expect } from 'vitest'
import { Mapping } from '../src/mypaint/mapping'
import { rgbToSpectral, spectralToRgb, mixColors, rgbToHsv, hsvToRgb, hexToLinear } from '../src/mypaint/helpers'
import { Brush } from '../src/mypaint/brush'
import { Layer, StrokeSurface, type StrokeOpts } from '../src/mypaint/surface'
import { PRESETS, PRESET_SKIPPED_INPUTS } from '../src/mypaint/presets.gen'
import { SETTINGS, INPUTS, S, I, SETTINGS_COUNT, INPUTS_COUNT, STATES_COUNT } from '../src/mypaint/settings.gen'
import { grainTile, GRAIN_TILE } from '../src/mypaint/paper'
import { rng32 } from '../src/core/material'

const SIDX = new Map(SETTINGS.map((s, i) => [s.id, i]))
const IIDX = new Map(INPUTS.map((s, i) => [s.id, i]))

describe('62 ① 사상', () => {
  it('상수 사상은 base_value · 곡선은 조각선형 · 범위 밖은 끝 구간 연장(C 원문)', () => {
    const m = new Mapping(INPUTS_COUNT)
    m.baseValue = 0.5
    const inp = new Float32Array(INPUTS_COUNT)
    expect(m.calculate(inp)).toBe(0.5)
    expect(m.isConstant()).toBe(true)
    m.setN(I.PRESSURE, 3)
    m.setPoint(I.PRESSURE, 0, 0, 0); m.setPoint(I.PRESSURE, 1, 0.5, 1); m.setPoint(I.PRESSURE, 2, 1, 0)
    expect(m.isConstant()).toBe(false)
    inp[I.PRESSURE] = 0.25
    expect(m.calculate(inp)).toBeCloseTo(0.5 + 0.5, 6)
    inp[I.PRESSURE] = 0.75
    expect(m.calculate(inp)).toBeCloseTo(0.5 + 0.5, 6)
    inp[I.PRESSURE] = 2                                 // 마지막 구간의 연장(원문 — 클램프 없음)
    expect(m.calculate(inp)).toBeCloseTo(0.5 - 2, 6)
    expect(() => m.setN(I.PRESSURE, 1)).toThrow()      // 점 하나로는 선형이 안 선다(assert 그대로)
  })
})

describe('62 ② 스펙트럼 혼합', () => {
  it('rgb → 스펙트럼 → rgb 왕복이 항등 근처(원문 T_MATRIX_SMALL)', () => {
    for (const [r, g, b] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5], [0.9, 0.7, 0.1]]) {
      const spec = new Float32Array(10)
      rgbToSpectral(r!, g!, b!, spec)
      const out = new Float32Array(3)
      spectralToRgb(spec, out)
      expect(Math.abs(out[0]! - r!)).toBeLessThan(0.06)
      expect(Math.abs(out[1]! - g!)).toBeLessThan(0.06)
      expect(Math.abs(out[2]! - b!)).toBeLessThan(0.06)
    }
  })
  it('파랑 × 노랑(반반) — 스펙트럼(paint 1)은 초록 색상각 · 반증: 가산(paint 0)은 초록이 아니다', () => {
    const blue = [0.05, 0.1, 0.8, 1], yellow = [0.9, 0.8, 0.05, 1]
    const mixP = mixColors(blue, yellow, 0.5, 1)
    const mixA = mixColors(blue, yellow, 0.5, 0)
    const hueOf = (c: number[]): number => rgbToHsv(c[0]!, c[1]!, c[2]!)[0] * 360
    const satOf = (c: number[]): number => rgbToHsv(c[0]!, c[1]!, c[2]!)[1]
    const hP = hueOf(mixP), hA = hueOf(mixA)
    expect(hP).toBeGreaterThan(70); expect(hP).toBeLessThan(170)          // 초록 대역
    expect(satOf(mixP)).toBeGreaterThan(0.3)
    expect(hA > 70 && hA < 170 && satOf(mixA) > 0.3).toBe(false)         // 가산은 회색빛(초록 아님)
  })
  it('hsv 왕복 · hex → 선형광', () => {
    const [h, s, v] = rgbToHsv(0.2, 0.6, 0.4)
    const [r, g, b] = hsvToRgb(h, s, v)
    expect(r).toBeCloseTo(0.2, 6); expect(g).toBeCloseTo(0.6, 6); expect(b).toBeCloseTo(0.4, 6)
    const lin = hexToLinear('#808080')
    expect(lin[0]).toBeCloseTo(0.2158, 3)
  })
})

describe('62 ③ 프리셋 충실도(게이트 ⑥)', () => {
  it('설정 65 · 입력 18 · 상태 44 — brushsettings.json 그대로', () => {
    expect(SETTINGS_COUNT).toBe(65); expect(INPUTS_COUNT).toBe(18); expect(STATES_COUNT).toBe(44)
    expect(S.OPAQUE).toBe(0); expect(S.PRESSURE_GAIN_LOG).toBe(64)
  })
  it('196개 전부가 실리고, 설정 키는 전부 65 안이며 곡선 점 수가 원문과 같다 · 건너뛴 입력은 surfacemap_*뿐', () => {
    expect(PRESETS.length).toBe(196)
    let settings = 0, curves = 0
    const unknownInputs: Record<string, number> = {}
    for (const p of PRESETS) {
      const b = new Brush()
      const st = b.loadPreset(p, SIDX, IIDX)
      expect(st.unknownSettings, `${p.name} 모르는 설정`).toEqual([])
      settings += st.settings; curves += st.curves
      for (const k of st.unknownInputs) unknownInputs[k] = (unknownInputs[k] ?? 0) + 1
      // 실린 값이 원문과 같다(base · 곡선 점)
      for (const [key, val] of Object.entries(p.s)) {
        const si = SIDX.get(key)!
        expect(b.getBaseValue(si)).toBe(val[0])
        if (val.length > 1) for (const [ik, pts] of Object.entries(val[1]!)) {
          const ii = IIDX.get(ik)
          if (ii === undefined) continue
          expect(b.getMappingN(si, ii)).toBe(pts.length)
        }
      }
    }
    // 알 수 없는 입력(surfacemap_*)은 생성기가 이미 걷어 표(PRESET_SKIPPED_INPUTS)에 남겼다 —
    // 로더에는 하나도 안 온다(0). 표의 열쇠가 그 둘뿐인 것이 «누락 0»의 예외 값이다.
    expect(unknownInputs).toEqual({})
    expect(Object.keys(PRESET_SKIPPED_INPUTS).sort()).toEqual(['surfacemap_x', 'surfacemap_y'])
    expect(settings).toBeGreaterThan(190 * 10)       // 압축 뒤에도 설정 항목이 넉넉히 남는다(신호 실재)
    expect(curves).toBeGreaterThan(1500)
  })
})

// ── ④ 표면 ────────────────────────────────────────────────────────────────────
const opts = (over: Partial<StrokeOpts> = {}): StrokeOpts => ({
  cap: 1, capExact: false, opacityK: 1, capOff: false, grain: null, grainN: GRAIN_TILE, grainDepth: 0, snapshotAll: false, smudgeSnapshot: true,
  rng: rng32(1), tip: null, tipFrameLock: -1, ...over,
})
/** 같은 자리에 도장 n번(목표 opaque) — 중심 픽셀 알파 */
function stampN(surf: StrokeSurface, n: number, opaque: number, capTarget = opaque): number {
  for (let k = 0; k < n; k++) surf.drawDab(16, 16, 6, 0.2, 0.3, 0.4, opaque, 0.9, 0, 1, 1, 0, 0, 0, 0, 0.05, 0, capTarget)
  return surf.layer.data[(16 * surf.layer.w + 16) * 4 + 3]!
}

describe('62 ④ 표면 — 덮임 캡 · 획 사이 · 단언 · 결정론', () => {
  it('한 획 안: 도장을 거듭 얹어도 목표(0.5)를 안 넘는다 · 반증(capOff)은 넘는다', () => {
    const a = new StrokeSurface(new Layer(32, 32))
    a.beginStroke(opts())
    const one = stampN(a, 1, 0.3, 0.5)
    const many = stampN(a, 30, 0.3, 0.5)
    a.endStroke()
    expect(one).toBeGreaterThan(0.2)
    expect(many).toBeLessThanOrEqual(0.5 + 1e-6)
    expect(many).toBeGreaterThan(0.49)                           // 목표에 «수렴»한다(안 얹히는 게 아니다)
    const b = new StrokeSurface(new Layer(32, 32))
    b.beginStroke(opts({ capOff: true }))
    const raw = stampN(b, 31, 0.3, 0.5)
    b.endStroke()
    expect(raw).toBeGreaterThan(0.9)                             // libmypaint 원문의 누적(반증)
  })
  it('획 «사이»는 쌓인다(over) — 두 획의 알파 > 한 획', () => {
    const a = new StrokeSurface(new Layer(32, 32))
    a.beginStroke(opts()); stampN(a, 10, 0.3, 0.5); a.endStroke()
    const one = a.layer.data[(16 * 32 + 16) * 4 + 3]!
    a.beginStroke(opts()); stampN(a, 10, 0.3, 0.5); a.endStroke()
    const two = a.layer.data[(16 * 32 + 16) * 4 + 3]!
    expect(two).toBeGreaterThan(one * 1.4)
    expect(two).toBeCloseTo(one + one * (1 - one), 3)
  })
  it('rgb ≤ a — 정상 획은 위반 0 · 일부러 깬 픽셀은 잡힌다(D-3)', () => {
    const a = new StrokeSurface(new Layer(32, 32))
    a.beginStroke(opts()); stampN(a, 5, 0.6); a.endStroke()
    expect(a.premulViolations).toBe(0)
    a.beginStroke(opts()); stampN(a, 1, 0.6)
    a.breakPremulOnce = true
    let threw = false
    try { a.endStroke() } catch { threw = true }
    expect(a.premulViolations).toBeGreaterThan(0)
    expect(threw).toBe(import.meta.env.DEV === true)
  })
  it('결정론 — 같은 시드·같은 도장 = 같은 층 · 스냅숏 되돌림은 층을 획 «전»으로', () => {
    const run = (): Float32Array => {
      const a = new StrokeSurface(new Layer(32, 32))
      a.beginStroke(opts({ rng: rng32(7) }))
      for (let k = 0; k < 5; k++) a.drawDab(10 + k * 2, 12, 4, 0.5, 0.2, 0.1, 0.4, 0.5, 0, 1, 1, 0, 0, 0, 0, 0.05, 0.5, 0.4)
      a.endStroke()
      return a.layer.data.slice()
    }
    const x = run(), y = run()
    expect(Array.from(x)).toEqual(Array.from(y))
    const a = new StrokeSurface(new Layer(32, 32))
    a.beginStroke(opts()); stampN(a, 3, 0.5); a.endStroke()
    const before = a.layer.data.slice()
    a.beginStroke(opts({ snapshotAll: true })); stampN(a, 3, 0.5); a.endStroke()
    expect(a.layer.data[(16 * 32 + 16) * 4 + 3]!).toBeGreaterThan(before[(16 * 32 + 16) * 4 + 3]!)
    a.restoreSnapshot()
    expect(Array.from(a.layer.data)).toEqual(Array.from(before))
  })
  it('스머지 표집은 획 «전» 스냅숏에서 — 제 자국을 문 표본 0 · 반증(smudgeSnapshot false)은 0이 아니다', () => {
    const mk = (self: boolean): StrokeSurface => {
      const a = new StrokeSurface(new Layer(64, 64))
      a.beginStroke(opts()); for (let k = 0; k < 8; k++) a.drawDab(20 + k * 3, 30, 6, 0.8, 0.1, 0.1, 0.9, 0.9, 0, 1, 1, 0, 0, 0, 0, 0.05, 0, 0.9); a.endStroke()
      a.beginStroke(opts({ smudgeSnapshot: !self }))
      for (let k = 0; k < 6; k++) { a.drawDab(24 + k * 4, 30, 6, 0.1, 0.1, 0.8, 0.6, 0.6, 0, 1, 1, 0, 0, 0, 0, 0.05, 0, 0.6); a.getColor(24 + k * 4, 30, 6, 0) }
      a.endStroke()
      return a
    }
    const p = mk(false), f = mk(true)
    expect(p.samplesFromSnapshot).toBeGreaterThan(0)
    expect(p.samplesLiveTouched).toBe(0)
    expect(f.samplesLiveTouched).toBeGreaterThan(0)
    const c = p.getColor(30, 30, 6, 0)
    expect(c[3]).toBeGreaterThan(0.3)                            // 빨강 획을 실제로 문다
    expect(c[0]).toBeGreaterThan(c[2])
  })
})

describe('62 ⑤ 종이 결', () => {
  it('타일 256² · 0..1 · 결정론 · 깊이가 포화 몸통의 캡을 깎는다(결이 보인다)', () => {
    const t = grainTile()
    expect(t.length).toBe(GRAIN_TILE * GRAIN_TILE)
    let mn = 1, mx = 0
    for (const v of t) { if (v < mn) mn = v; if (v > mx) mx = v }
    expect(mn).toBeGreaterThanOrEqual(0); expect(mx).toBeLessThanOrEqual(1); expect(mx - mn).toBeGreaterThan(0.5)
    const a = new StrokeSurface(new Layer(48, 48))
    a.beginStroke(opts({ grain: t, grainDepth: 0.42 }))
    for (let k = 0; k < 40; k++) a.drawDab(24, 24, 10, 0.1, 0.1, 0.1, 1, 0.9, 0, 1, 1, 0, 0, 0, 0, 0.05, 0, 1)
    a.endStroke()
    // 몸통(중심 ±4) 알파 = 1 − 0.42×타일 대역 — 타일과의 상관이 강한 음수
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let y = 20; y <= 28; y++) for (let x = 20; x <= 28; x++) {
      const v = a.layer.data[(y * 48 + x) * 4 + 3]!, g = t[(y % GRAIN_TILE) * GRAIN_TILE + (x % GRAIN_TILE)]!
      n++; sa += v; sb += g; saa += v * v; sbb += g * g; sab += v * g
    }
    const cov = sab / n - (sa / n) * (sb / n)
    const corr = cov / (Math.sqrt(saa / n - (sa / n) ** 2) * Math.sqrt(sbb / n - (sb / n) ** 2))
    expect(corr).toBeLessThan(-0.9)
  })
})
