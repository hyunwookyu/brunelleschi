// 도장 표면(web2-62) — libmypaint mypaint-tiled-surface.c의 render_dab_mask · get_color와
// brushmodes.c의 블렌드 9종을 **타일 없는 float 층** 위에 옮겼다(ISC — COPYING.libmypaint).
//
// 합성 규약(지시 62 «이 라운드가 세우고 앞으로 안 깬다»):
//   · 층은 **선형광 premultiplied RGBA Float32**. sRGB는 blit(화면에 낼 때)에서만.
//   · 층은 (0,0,0,0)으로 비운다 — 투명한 흰색은 없다.
//   · un-premultiply는 두 곳 — 안료 혼합(스펙트럼 · 표집)과 blit(내보내기).
//   · ⛳ 디버그 단언 rgb ≤ a: 획마다 획 상자를 훑는다(DEV에서 던진다 — 게이트 ②).
//
// 이 이식의 덧 셋(전부 libmypaint «밖» — 원문 블렌드는 그대로다):
//   ① **획 안 덮임 캡**: 획마다 덮임(coverage) 버퍼를 두고, 도장의 목표 불투명도(선형화 «전»
//      opaque × 도구 캡 × 종이 결)를 그 픽셀의 상한으로 삼는다. 도장이 얹혀 상한을 넘을 알파는
//      깎아서 얹는다 — 직선은 opaque_linearize대로 목표에 수렴하고(원문 거동), 자기 교차는
//      그 목표를 «못 넘는다»(지시 「한 획 자기교차는 획 불투명도를 안 넘는다」). 획 사이는
//      층 위 over 그대로 쌓인다. 반증(capOff)이 원문 누적을 되살린다.
//   ② **종이 결**: 대상 px 고정 타일이 도장 알파와 캡을 함께 깎는다(1 − 깊이·타일) — 포화 몸통도
//      이빨을 보인다(grain61 ④ 상관의 뜻). 63이 타일의 값을 높이맵으로 바꾼다.
//   ③ **획 «전» 스냅숏**: 도장이 닿기 전 타일(64²)을 떠 두고, 스머지 표집(get_color)은 그 스냅숏에서
//      읽는다 — 붓이 제 젖은 자국을 안 문다(지시 「자기 자국 오염 0」 · libmypaint가 get_color
//      전에 process_tile을 하는 그 자리를 «획 단위»로 옮긴 것). 초안(draft)은 같은 스냅숏으로 되돌린다.

import { clamp, rgbToSpectral, spectralToRgb, spectralBlendFactor, LIN2SRGB8 } from './helpers'
import type { DabSurface } from './brush'
import { GRAIN_TILE } from './paper'

const TILE = 64
const TILE_SHIFT = 6

export interface StrokeOpts {
  /** 도구 캡(0..1) — 획 덮임의 상한(색연필 .7 — 46·50 계약 상수 · min) */
  cap: number
  /** 캡을 «목표»로(마커 — 46의 한 획 알파 .55 그 자체 · 프리셋의 제 불투명과 무관하게 거기까지 쌓인다) */
  capExact: boolean
  /** 불투명 배수(실험실) — 도장 opaque와 목표에 함께 곱 */
  opacityK: number
  /** 반증 — 캡 끔(libmypaint 원문의 도장 누적) */
  capOff: boolean
  /** 종이 결 타일(0..1 · 256²) — null이면 결 없음 */
  grain: Float32Array | null
  /** 결 깊이(0..1) */
  grainDepth: number
  /** 초안 — 닿는 타일 전부를 스냅숏해 끝에 되돌린다 */
  snapshotAll: boolean
  /** 스머지 표집을 획 «전» 스냅숏에서(제품 true · 반증 false = 제 자국을 문다) */
  smudgeSnapshot: boolean
  /** 결정론 난수(표집 확률) */
  rng: () => number
}

export interface Bbox { x0: number; y0: number; x1: number; y1: number }

const emptyBox = (): Bbox => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
const boxEmpty = (b: Bbox): boolean => b.x1 < b.x0 || b.y1 < b.y0

/** 층 — 선형광 premultiplied RGBA float. 새 층은 (0,0,0,0). */
export class Layer {
  readonly data: Float32Array
  constructor(readonly w: number, readonly h: number) { this.data = new Float32Array(w * h * 4) }
  get bytes(): number { return this.data.byteLength }
  clear(): void { this.data.fill(0) }
}

export class StrokeSurface implements DabSurface {
  readonly layer: Layer
  private readonly coverage: Float32Array
  private opts: StrokeOpts | null = null
  private strokeBox: Bbox = emptyBox()
  private lastStrokeBox: Bbox = emptyBox()
  private readonly snapshot = new Map<number, Float32Array>()
  private readonly touched = new Set<number>()
  private mask = new Float32Array(0)
  private maskW = 0
  /** 진단 — 스머지 표집 통계(획 누적) */
  samplesFromSnapshot = 0
  samplesLiveTouched = 0
  samplesLiveClean = 0
  /** 진단 — rgb ≤ a 위반 수(누적) */
  premulViolations = 0
  /** 반증 — 다음 획 끝에 한 픽셀을 일부러 깬다 */
  breakPremulOnce = false
  /** 반증 — blit에서 옅은 가장자리(0<a<.3)의 rgb를 흰색으로(흰 테 ①의 재현) */
  fringeBreak = false
  dabs = 0
  /** 진단 — 이 획의 덮임 캡 최대(결 «전» 목표 × 도구 캡) = «획 불투명도»(게이트 ④의 자) */
  maxCap = 0

  constructor(layer: Layer) {
    this.layer = layer
    this.coverage = new Float32Array(layer.w * layer.h)
  }

  beginStroke(opts: StrokeOpts): void {
    this.opts = opts
    // 앞 획의 덮임을 걷는다(상자만)
    const b = this.lastStrokeBox
    if (!boxEmpty(b)) {
      for (let y = b.y0; y <= b.y1; y++) this.coverage.fill(0, y * this.layer.w + b.x0, y * this.layer.w + b.x1 + 1)
    }
    this.strokeBox = emptyBox()
    this.snapshot.clear()
    this.touched.clear()
    this.maxCap = 0
  }

  /** 획 끝 — 상자를 돌려주고 rgb ≤ a를 단언한다(DEV에서 던진다 — 층은 그대로 둔다). */
  endStroke(): Bbox {
    const b = this.strokeBox
    this.lastStrokeBox = b
    if (boxEmpty(b)) return b
    const d = this.layer.data, W = this.layer.w
    if (this.breakPremulOnce) {
      this.breakPremulOnce = false
      const i = (b.y0 * W + b.x0) * 4
      d[i] = d[i + 3]! + 0.5                        // 일부러 깬다 — 단언이 실제로 잡는지(D-3)
    }
    let bad = 0
    const eps = 1e-5
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = (y * W + x) * 4
        const a = d[i + 3]! + eps
        if (d[i]! > a || d[i + 1]! > a || d[i + 2]! > a) bad++
      }
    }
    if (bad > 0) {
      this.premulViolations += bad
      if (import.meta.env.DEV) throw new Error(`mypaint: premultiplied 위반 — rgb > a 텍셀 ${bad}개(상자 ${b.x0},${b.y0}..${b.x1},${b.y1})`)
    }
    return b
  }

  /** 초안 되돌리기 — 스냅숏 타일을 층에 되쓴다(획 «전» 상태). */
  restoreSnapshot(): void {
    const W = this.layer.w, H = this.layer.h, d = this.layer.data
    for (const [key, buf] of this.snapshot) {
      const tx = key & 0xffff, ty = key >>> 16
      const x0 = tx << TILE_SHIFT, y0 = ty << TILE_SHIFT
      const w = Math.min(TILE, W - x0), h = Math.min(TILE, H - y0)
      for (let y = 0; y < h; y++) {
        const src = y * TILE * 4, dst = ((y0 + y) * W + x0) * 4
        d.set(buf.subarray(src, src + w * 4), dst)
      }
    }
    this.snapshot.clear()
  }

  private ensureSnapshot(tx: number, ty: number): void {
    const key = (ty << 16) | tx
    if (this.snapshot.has(key)) return
    const W = this.layer.w, H = this.layer.h, d = this.layer.data
    const x0 = tx << TILE_SHIFT, y0 = ty << TILE_SHIFT
    const w = Math.min(TILE, W - x0), h = Math.min(TILE, H - y0)
    const buf = new Float32Array(TILE * TILE * 4)
    for (let y = 0; y < h; y++) {
      const src = ((y0 + y) * W + x0) * 4
      buf.set(d.subarray(src, src + w * 4), y * TILE * 4)
    }
    this.snapshot.set(key, buf)
  }

  // ── 도장 마스크(render_dab_mask 원문 — rr · AA · 두 구간 선형 감쇠) ─────────────────

  /** 마스크를 this.mask(상자 폭 maskW)에 채우고 상자를 돌려준다. 상자 밖(층 밖)은 잘린다. */
  private renderDabMask(x: number, y: number, radius: number, hardness: number, softness: number,
    aspectRatio: number, angle: number): Bbox | null {
    hardness = clamp(hardness, 0, 1)
    if (aspectRatio < 1) aspectRatio = 1
    const segment1Offset = 1.0 * (1.0 - softness)
    const segment1Slope = -(1.0 / hardness - 1.0) * (1.0 - softness)
    const segment2Offset = (hardness / (1.0 - hardness)) * (1.0 - softness)
    const segment2Slope = (-hardness / (1.0 - hardness)) * (1.0 - softness)
    const angleRad = (angle / 360) * 2 * Math.PI
    const cs = Math.cos(angleRad), sn = Math.sin(angleRad)
    const rFringe = radius + 1.0
    let x0 = Math.floor(x - rFringe), y0 = Math.floor(y - rFringe)
    let x1 = Math.floor(x + rFringe), y1 = Math.floor(y + rFringe)
    const W = this.layer.w, H = this.layer.h
    if (x0 < 0) x0 = 0
    if (y0 < 0) y0 = 0
    if (x1 > W - 1) x1 = W - 1
    if (y1 > H - 1) y1 = H - 1
    if (x1 < x0 || y1 < y0) return null
    const oneOverRadius2 = 1.0 / (radius * radius)
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (this.mask.length < bw * bh) this.mask = new Float32Array(bw * bh)
    this.maskW = bw
    const m = this.mask
    const aa = radius < 3.0
    const aaBorder = 1.0
    let rAaStart = radius > aaBorder ? radius - aaBorder : 0
    rAaStart = (rAaStart * rAaStart) / aspectRatio
    for (let yp = y0; yp <= y1; yp++) {
      for (let xp = x0; xp <= x1; xp++) {
        let rr: number
        if (aa) rr = calculateRrAntialiased(xp, yp, x, y, aspectRatio, sn, cs, oneOverRadius2, rAaStart)
        else {
          const yy = yp + 0.5 - y, xx = xp + 0.5 - x
          const yyr = (yy * cs - xx * sn) * aspectRatio
          const xxr = yy * sn + xx * cs
          rr = (yyr * yyr + xxr * xxr) * oneOverRadius2
        }
        let opa: number
        if (rr <= hardness) opa = segment1Offset + rr * segment1Slope
        else opa = segment2Offset + rr * segment2Slope
        if (rr > 1.0) opa = 0
        m[(yp - y0) * bw + (xp - x0)] = opa
      }
    }
    return { x0, y0, x1, y1 }
  }

  // ── 도장(draw_dab_internal + process_op 원문 — 블렌드 선택·불투명 몫 그대로) ────────

  drawDab(
    x: number, y: number, radius: number,
    colorR: number, colorG: number, colorB: number,
    opaque: number, hardness: number, softness: number, colorA: number,
    aspectRatio: number, angle: number,
    lockAlpha: number, colorize: number, posterize: number, posterizeNum: number,
    paint: number, capTarget: number,
  ): boolean {
    const o = this.opts
    if (!o) throw new Error('mypaint surface: beginStroke 전에 drawDab')
    opaque = clamp(opaque * o.opacityK, 0, 1)
    hardness = clamp(hardness, 0, 1)
    softness = clamp(softness, 0, 1)
    lockAlpha = clamp(lockAlpha, 0, 1)
    colorize = clamp(colorize, 0, 1)
    posterize = clamp(posterize, 0, 1)
    const postNum = clamp(Math.round(posterizeNum * 100.0), 1, 128)
    paint = clamp(paint, 0, 1)
    if (radius < 0.1) return false
    if (hardness === 0) return false
    if (softness === 1) return false
    if (opaque === 0) return false
    colorR = clamp(colorR, 0, 1); colorG = clamp(colorG, 0, 1); colorB = clamp(colorB, 0, 1)
    colorA = clamp(colorA, 0, 1)
    const normal = (1 - lockAlpha) * (1 - colorize) * (1 - posterize)
    if (aspectRatio < 1) aspectRatio = 1

    const box = this.renderDabMask(x, y, radius, hardness, softness, aspectRatio, angle)
    if (!box) return false
    this.dabs++
    // 스냅숏(닿는 타일) — 초안이거나 스머지 표집이 켜진 획
    const W = this.layer.w
    for (let ty = box.y0 >> TILE_SHIFT; ty <= box.y1 >> TILE_SHIFT; ty++) {
      for (let tx = box.x0 >> TILE_SHIFT; tx <= box.x1 >> TILE_SHIFT; tx++) {
        const key = (ty << 16) | tx
        if (o.snapshotAll || o.smudgeSnapshot) this.ensureSnapshot(tx, ty)
        this.touched.add(key)
      }
    }
    if (box.x0 < this.strokeBox.x0) this.strokeBox.x0 = box.x0
    if (box.y0 < this.strokeBox.y0) this.strokeBox.y0 = box.y0
    if (box.x1 > this.strokeBox.x1) this.strokeBox.x1 = box.x1
    if (box.y1 > this.strokeBox.y1) this.strokeBox.y1 = box.y1

    // 캡의 목표(선형화 «전» opaque × 배수 × 도구 캡)
    // 도구 캡: 색연필은 «상한»(min — 프리셋의 제 불투명이 낮으면 그것이 산다) · 마커는 «목표»(46의 한 획 알파 .55 —
    // 61이 p5 마커를 그 상수로 되맞춘 그 자리 · paint50 ④의 색상 문턱(b−r>30)이 옅은 마커에서 먼 끝을 잃는다 — 실측 1.46)
    const capBase = o.capExact ? clamp(o.cap * o.opacityK, 0, 1) : Math.min(clamp(capTarget * o.opacityK, 0, 1), o.cap)
    if (capBase > this.maxCap) this.maxCap = capBase
    const capOff = o.capOff
    const grain = o.grain, depth = o.grainDepth
    const d = this.layer.data, cov = this.coverage, mask = this.mask, mw = this.maskW

    // 스펙트럼(paint) 경로의 도장 색 — 한 번만(원문: 루프 밖)
    let specA: Float32Array | null = null
    if (paint > 0) { specA = new Float32Array(10); rgbToSpectral(colorR, colorG, colorB, specA) }
    // pigment 경로의 최소 불투명(원문 opacity = MAX(opacity, 150/32768))
    const PAINT_MIN_OPA = 150 / 32768

    for (let yp = box.y0; yp <= box.y1; yp++) {
      const gRow = grain ? (yp % GRAIN_TILE) * GRAIN_TILE : 0
      for (let xp = box.x0; xp <= box.x1; xp++) {
        const m = mask[(yp - box.y0) * mw + (xp - box.x0)]!
        if (m <= 0) continue
        const pi = yp * W + xp
        const g = grain ? 1 - depth * grain[gRow + (xp % GRAIN_TILE)]! : 1
        // 도장 알파(정규 모드 기준) — 덮임의 걸음
        const aDab = m * opaque * g
        let k: number            // 이 픽셀에서 실제로 얹는 몫(0..1) — 캡이 깎는다
        if (capOff) {
          cov[pi] = cov[pi]! + aDab * (1 - cov[pi]!)
          k = g
        } else {
          const c = cov[pi]!
          const capPix = capBase * g
          const cPrime = Math.min(capPix, c + aDab * (1 - c))
          if (cPrime <= c) continue
          const eff = c < 1 ? (cPrime - c) / (1 - c) : 0
          cov[pi] = cPrime
          k = aDab > 0 ? (eff / aDab) * g : 0
        }
        const i = pi * 4
        // ── process_op의 차례 그대로 ─────────────────────────────────────────
        if (paint < 1) {
          if (normal) {
            const opa = m * normal * opaque * (1 - paint) * k
            if (colorA === 1) {
              // Normal — premultiplied over
              const opaB = 1 - opa
              d[i + 3] = opa + opaB * d[i + 3]!
              d[i] = opa * colorR + opaB * d[i]!
              d[i + 1] = opa * colorG + opaB * d[i + 1]!
              d[i + 2] = opa * colorB + opaB * d[i + 2]!
            } else {
              // Normal_and_Eraser — 투명도를 끌고 다닌다(스머지·지우개)
              const opaB = 1 - opa
              const opaA = opa * colorA
              d[i + 3] = opaA + opaB * d[i + 3]!
              d[i] = opaA * colorR + opaB * d[i]!
              d[i + 1] = opaA * colorG + opaB * d[i + 1]!
              d[i + 2] = opaA * colorB + opaB * d[i + 2]!
            }
          }
          if (lockAlpha && colorA !== 0) {
            const opa = m * lockAlpha * opaque * (1 - colorize) * (1 - posterize) * (1 - paint) * k
            const opaB = 1 - opa
            const opaA = opa * d[i + 3]!
            d[i] = opaA * colorR + opaB * d[i]!
            d[i + 1] = opaA * colorG + opaB * d[i + 1]!
            d[i + 2] = opaA * colorB + opaB * d[i + 2]!
          }
        }
        if (paint > 0 && specA) {
          if (normal) {
            const opacity = Math.max(normal * opaque * paint, PAINT_MIN_OPA)
            const opa = m * opacity * k
            if (colorA === 1) blendNormalPaint(d, i, specA, colorR, colorG, colorB, opa)
            else blendNormalAndEraserPaint(d, i, specA, colorR, colorG, colorB, colorA, opa)
          }
          if (lockAlpha && colorA !== 0) {
            const opacity = Math.max(lockAlpha * opaque * (1 - colorize) * (1 - posterize) * paint, PAINT_MIN_OPA)
            const opa = m * opacity * k
            blendLockAlphaPaint(d, i, specA, colorR, colorG, colorB, opa)
          }
        }
        if (colorize) blendColor(d, i, colorR, colorG, colorB, m * colorize * opaque * k)
        if (posterize) blendPosterize(d, i, m * posterize * opaque * k, postNum)
      }
    }
    return true
  }

  // ── get_color(원문 — 하드니스 .5 · 표집 간격 radius·7 · 확률 1/(7·radius)) ───────────

  getColor(x: number, y: number, radius: number, paint: number): [number, number, number, number] {
    const o = this.opts!
    if (radius < 1) radius = 1
    const box = this.renderDabMask(x, y, radius, 0.5, 0.5, 1.0, 0.0)
    if (!box) return [0, 1, 0, 0]
    const sampleInterval = radius <= 2 ? 1 : Math.floor(radius * 7)
    const randomSampleRate = 1.0 / (7 * radius)
    const legacy = paint < 0
    let sumWeight = 0, sumR = 0, sumG = 0, sumB = 0, sumA = 0
    const avgSpectral = new Float32Array(10)
    const avgRgb = [0, 0, 0]
    // 원문: avg_spectral = rgb_to_spectral(sum_r,g,b)(0,0,0에서 시작) · avg_rgb = sum
    if (!legacy && paint > 0) rgbToSpectral(0, 0, 0, avgSpectral)
    let intervalCounter = 0
    const W = this.layer.w, mask = this.mask, mw = this.maskW
    const spec = new Float32Array(10)
    const rgbOut = new Float32Array(3)
    for (let yp = box.y0; yp <= box.y1; yp++) {
      for (let xp = box.x0; xp <= box.x1; xp++) {
        const m = mask[(yp - box.y0) * mw + (xp - box.x0)]!
        if (m <= 0) continue
        // 읽는 자리 — 획 «전» 스냅숏(제품) 또는 층(반증·안 닿은 타일)
        const tx = xp >> TILE_SHIFT, ty = yp >> TILE_SHIFT
        const key = (ty << 16) | tx
        let src: Float32Array, si: number
        const snap = o.smudgeSnapshot ? this.snapshot.get(key) : undefined
        if (snap) {
          src = snap; si = ((yp - (ty << TILE_SHIFT)) * TILE + (xp - (tx << TILE_SHIFT))) * 4
          this.samplesFromSnapshot++
        } else {
          src = this.layer.data; si = (yp * W + xp) * 4
          if (this.touched.has(key)) this.samplesLiveTouched++
          else this.samplesLiveClean++
        }
        const R = src[si]!, G = src[si + 1]!, B = src[si + 2]!, A = src[si + 3]!
        if (legacy) {
          sumWeight += m
          sumR += m * R; sumG += m * G; sumB += m * B; sumA += m * A
        } else {
          if (intervalCounter === 0 || o.rng() < randomSampleRate) {
            const a = m * A
            const alphaSums = a + sumA
            sumWeight += m
            let facA = 1, facB = 1
            if (alphaSums > 0) { facA = a / alphaSums; facB = 1 - facA }
            if (paint > 0 && A > 0) {
              spec.fill(0)
              rgbToSpectral(R / A, G / A, B / A, spec)
              for (let k = 0; k < 10; k++) avgSpectral[k] = Math.pow(spec[k]!, facA) * Math.pow(avgSpectral[k]!, facB)
            }
            if (paint < 1 && A > 0) {
              for (let k = 0; k < 3; k++) avgRgb[k] = (src[si + k]! * facA) / A + avgRgb[k]! * facB
            }
            sumA += a
          }
          intervalCounter = (intervalCounter + 1) % sampleInterval
        }
      }
    }
    if (!legacy) {
      spectralToRgb(avgSpectral, rgbOut)
      sumR = rgbOut[0]! * paint + (1 - paint) * avgRgb[0]!
      sumG = rgbOut[1]! * paint + (1 - paint) * avgRgb[1]!
      sumB = rgbOut[2]! * paint + (1 - paint) * avgRgb[2]!
    }
    if (sumWeight <= 0) return [0, 1, 0, 0]
    sumA /= sumWeight
    if (legacy) { sumR /= sumWeight; sumG /= sumWeight; sumB /= sumWeight }
    const outA = clamp(sumA, 0, 1)
    if (sumA > 0) {
      const demul = legacy ? sumA : 1.0
      return [clamp(sumR / demul, 0, 1), clamp(sumG / demul, 0, 1), clamp(sumB / demul, 0, 1), outA]
    }
    return [0, 1, 0, outA]
  }

  // ── blit — 층(선형광 premultiplied) → 대상 2D 캔버스(8비트 sRGB · 스트레이트 ImageData) ───

  /** 상자를 ImageData로 편다(un-premultiply → sRGB — 내보내기의 그 자리). */
  toImageData(box: Bbox, out: ImageData): void {
    const W = this.layer.w, d = this.layer.data, p = out.data
    const bw = box.x1 - box.x0 + 1
    const fringe = this.fringeBreak
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const i = (y * W + x) * 4
        const a = d[i + 3]!
        const j = ((y - box.y0) * bw + (x - box.x0)) * 4
        if (a <= 0) { p[j] = 0; p[j + 1] = 0; p[j + 2] = 0; p[j + 3] = 0; continue }
        const inv = 1 / a
        const r = clamp(d[i]! * inv, 0, 1), g = clamp(d[i + 1]! * inv, 0, 1), b = clamp(d[i + 2]! * inv, 0, 1)
        p[j] = LIN2SRGB8[Math.round(r * 4096)]!
        p[j + 1] = LIN2SRGB8[Math.round(g * 4096)]!
        p[j + 2] = LIN2SRGB8[Math.round(b * 4096)]!
        p[j + 3] = Math.round(clamp(a, 0, 1) * 255)
        if (fringe && a < 0.3) { p[j] = 255; p[j + 1] = 255; p[j + 2] = 255 }   // 반증 — 흰 테 ①의 재현
      }
    }
  }

  /** 층의 알파 지도(0..1 · 진단 — 게이트 ①④의 «옅은 가장자리»·«덮임» 자) */
  alphaMap(): Float32Array {
    const n = this.layer.w * this.layer.h
    const out = new Float32Array(n)
    const d = this.layer.data
    for (let i = 0; i < n; i++) out[i] = d[i * 4 + 3]!
    return out
  }
}

// ── 블렌드 보조(brushmodes.c 원문 — float · premultiplied) ──────────────────────────

const specB = new Float32Array(10), specR = new Float32Array(10), rgbR = new Float32Array(3)

function blendNormalPaint(d: Float32Array, i: number, specA: Float32Array, cr: number, cg: number, cb: number, opa: number): void {
  const opaB = 1 - opa
  const A = d[i + 3]!
  if (A <= 0) {
    d[i + 3] = opa + opaB * A
    d[i] = opa * cr + opaB * d[i]!
    d[i + 1] = opa * cg + opaB * d[i + 1]!
    d[i + 2] = opa * cb + opaB * d[i + 2]!
    return
  }
  const facA = opa / (opa + opaB * A)
  const facB = 1 - facA
  specB.fill(0)
  rgbToSpectral(d[i]! / A, d[i + 1]! / A, d[i + 2]! / A, specB)
  for (let k = 0; k < 10; k++) specR[k] = Math.pow(specA[k]!, facA) * Math.pow(specB[k]!, facB)
  spectralToRgb(specR, rgbR)
  const outA = opa + opaB * A
  d[i + 3] = outA
  d[i] = rgbR[0]! * outA; d[i + 1] = rgbR[1]! * outA; d[i + 2] = rgbR[2]! * outA
}

function blendNormalAndEraserPaint(d: Float32Array, i: number, specA: Float32Array, cr: number, cg: number, cb: number, ca: number, opa: number): void {
  const opaB = 1 - opa
  const opaA2 = opa * ca
  const A = d[i + 3]!
  const opaOut = opaA2 + opaB * A
  let r = 0, g = 0, b = 0
  const spectralFactor = clamp(spectralBlendFactor(A), 0, 1)
  const additiveFactor = 1 - spectralFactor
  if (additiveFactor) {
    r = opaA2 * cr + opaB * d[i]!
    g = opaA2 * cg + opaB * d[i + 1]!
    b = opaA2 * cb + opaB * d[i + 2]!
  }
  if (spectralFactor && A !== 0) {
    specB.fill(0)
    rgbToSpectral(d[i]! / A, d[i + 1]! / A, d[i + 2]! / A, specB)
    let facA = opa / (opa + opaB * A)
    facA *= ca
    const facB = 1 - facA
    for (let k = 0; k < 10; k++) specR[k] = Math.pow(specA[k]!, facA) * Math.pow(specB[k]!, facB)
    spectralToRgb(specR, rgbR)
    r = additiveFactor * r + spectralFactor * rgbR[0]! * opaOut
    g = additiveFactor * g + spectralFactor * rgbR[1]! * opaOut
    b = additiveFactor * b + spectralFactor * rgbR[2]! * opaOut
  }
  d[i + 3] = opaOut
  d[i] = r; d[i + 1] = g; d[i + 2] = b
}

function blendLockAlphaPaint(d: Float32Array, i: number, specA: Float32Array, cr: number, cg: number, cb: number, opa: number): void {
  const opaB = 1 - opa
  const A = d[i + 3]!
  const opaA = opa * A
  if (A <= 0) {
    d[i] = opaA * cr + opaB * d[i]!
    d[i + 1] = opaA * cg + opaB * d[i + 1]!
    d[i + 2] = opaA * cb + opaB * d[i + 2]!
    return
  }
  const facA = opaA / (opaA + opaB * A)
  const facB = 1 - facA
  specB.fill(0)
  rgbToSpectral(d[i]! / A, d[i + 1]! / A, d[i + 2]! / A, specB)
  for (let k = 0; k < 10; k++) specR[k] = Math.pow(specA[k]!, facA) * Math.pow(specB[k]!, facB)
  spectralToRgb(specR, rgbR)
  d[i] = rgbR[0]! * A; d[i + 1] = rgbR[1]! * A; d[i + 2] = rgbR[2]! * A
}

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722
const luma = (r: number, g: number, b: number): number => r * LUMA_R + g * LUMA_G + b * LUMA_B

/** Colorize — PDF 「Color」 비분리 블렌드(원문 set_rgb16_lum_from_rgb16 · float 판) */
function blendColor(d: Float32Array, i: number, cr: number, cg: number, cb: number, opa: number): void {
  const a = d[i + 3]!
  let r = 0, g = 0, b = 0
  if (a !== 0) { r = d[i]! / a; g = d[i + 1]! / a; b = d[i + 2]! / a }
  // SetLum(top = 색, bot = 픽셀 색)
  const botLum = luma(r, g, b), topLum = luma(cr, cg, cb)
  const diff = botLum - topLum
  let R = cr + diff, G = cg + diff, B = cb + diff
  const lum = luma(R, G, B)
  const cmin = Math.min(R, G, B), cmax = Math.max(R, G, B)
  if (cmin < 0) {
    R = lum + ((R - lum) * lum) / (lum - cmin)
    G = lum + ((G - lum) * lum) / (lum - cmin)
    B = lum + ((B - lum) * lum) / (lum - cmin)
  }
  if (cmax > 1) {
    R = lum + ((R - lum) * (1 - lum)) / (cmax - lum)
    G = lum + ((G - lum) * (1 - lum)) / (cmax - lum)
    B = lum + ((B - lum) * (1 - lum)) / (cmax - lum)
  }
  R *= a; G *= a; B *= a
  const opaB = 1 - opa
  d[i] = opa * R + opaB * d[i]!
  d[i + 1] = opa * G + opaB * d[i + 1]!
  d[i + 2] = opa * B + opaB * d[i + 2]!
}

/** Posterize — GIMP 그대로(원문은 premultiplied 값을 양자화한다 — 그대로) */
function blendPosterize(d: Float32Array, i: number, opa: number, num: number): void {
  const pr = Math.round(d[i]! * num) / num
  const pg = Math.round(d[i + 1]! * num) / num
  const pb = Math.round(d[i + 2]! * num) / num
  const opaB = 1 - opa
  d[i] = opa * pr + opaB * d[i]!
  d[i + 1] = opa * pg + opaB * d[i + 1]!
  d[i + 2] = opa * pb + opaB * d[i + 2]!
}

// ── AA rr(calculate_rr_antialiased 원문) ───────────────────────────────────────────

function calculateRSample(x: number, y: number, aspectRatio: number, sn: number, cs: number): number {
  const yyr = (y * cs - x * sn) * aspectRatio
  const xxr = y * sn + x * cs
  return yyr * yyr + xxr * xxr
}

function calculateRrAntialiased(xp: number, yp: number, x: number, y: number, aspectRatio: number,
  sn: number, cs: number, oneOverRadius2: number, rAaStart: number): number {
  const pixelRight = x - xp, pixelBottom = y - yp
  const pixelCenterX = pixelRight - 0.5, pixelCenterY = pixelBottom - 0.5
  const pixelLeft = pixelRight - 1.0, pixelTop = pixelBottom - 1.0
  let nearestX: number, nearestY: number, rNear: number, rrNear: number
  if (pixelLeft < 0 && pixelRight > 0 && pixelTop < 0 && pixelBottom > 0) {
    nearestX = 0; nearestY = 0; rNear = 0; rrNear = 0
  } else {
    // closest_point_to_line(cs, sn, cx, cy)
    const l2 = cs * cs + sn * sn
    const t = (pixelCenterX * cs + pixelCenterY * sn) / l2
    nearestX = clamp(cs * t, pixelLeft, pixelRight)
    nearestY = clamp(sn * t, pixelTop, pixelBottom)
    rNear = calculateRSample(nearestX, nearestY, aspectRatio, sn, cs)
    rrNear = rNear * oneOverRadius2
  }
  if (rrNear > 1.0) return rrNear
  // sign_point_in_line(px, py, cs, -sn)
  const vx = cs, vy = -sn
  const centerSign = (pixelCenterX - vx) * (-vy) - vx * (pixelCenterY - vy)
  const radArea1 = Math.sqrt(1.0 / Math.PI)
  let farthestX: number, farthestY: number
  if (centerSign < 0) { farthestX = nearestX - sn * radArea1; farthestY = nearestY + cs * radArea1 }
  else { farthestX = nearestX + sn * radArea1; farthestY = nearestY - cs * radArea1 }
  const rFar = calculateRSample(farthestX, farthestY, aspectRatio, sn, cs)
  const rrFar = rFar * oneOverRadius2
  if (rFar < rAaStart) return (rrFar + rrNear) * 0.5
  let visibilityNear = 1.0 - rrNear
  const delta = rrFar - rrNear
  const delta2 = 1.0 + delta
  visibilityNear /= delta2
  return 1.0 - visibilityNear
}
