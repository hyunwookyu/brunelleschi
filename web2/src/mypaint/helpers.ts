// libmypaint helpers.c의 이식(web2-62) — ISC(사본 COPYING.libmypaint). 손대지 않고 옮겼다:
// 색 공간 변환(GIMP 유래 HSV/HSL) · 10채널 스펙트럼 상향/하향(T_MATRIX_SMALL · spectral_*_small) ·
// 가중기하평균 혼합(mix_colors) · spectral_blend_factor(brushmodes.c) · rand_gauss · 각도 셈.
//
// ⚠ «정리»하지 않는다(지시 문면) — 상수·분기·부호는 C 원문 그대로다. 난수만 이 저장소의
// rng32(결정론 · Math.random ⛔ §5)를 받는다(rng-double.c의 Knuth 발생기는 시퀀스 재현이
// 목적이 아니라 «결정론»이 목적이므로 갈아 끼웠다 — D-4에 기록).

export const WGM_EPSILON = 0.001

export const clamp = (x: number, lo: number, hi: number): number => (x > hi ? hi : x < lo ? lo : x)

/** C의 fmodf가 아닌 «산술 나머지» — 음수 피제수에서 0 이상을 돌려준다 */
export const modArith = (a: number, N: number): number => a - N * Math.floor(a / N)

export function smallestAngularDifference(angleA: number, angleB: number): number {
  let a = angleB - angleA
  a = modArith(a + 180, 360) - 180
  a += a > 180 ? -360 : a < -180 ? 360 : 0
  return a
}

/** 4 균등합 가우스 근사(helpers.c rand_gauss) — rng는 [0,1) 균등 */
export function randGauss(rng: () => number): number {
  let sum = 0
  sum += rng(); sum += rng(); sum += rng(); sum += rng()
  return sum * 1.73205080757 - 3.46410161514
}

export const RADIANS = (x: number): number => (x * Math.PI) / 180
export const DEGREES = (x: number): number => (x / (2 * Math.PI)) * 360

// ── HSV / HSL (gimpcolorspace.c 유래 — 원문 그대로) ──────────────────────────────

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const v = max
  const delta = max - min
  let h = 0, s = 0
  if (delta > 0.0001) {
    s = delta / max
    if (r === max) { h = (g - b) / delta; if (h < 0) h += 6 }
    else if (g === max) h = 2 + (b - r) / delta
    else if (b === max) h = 4 + (r - g) / delta
    h /= 6
  }
  return [h, s, v]
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = h - Math.floor(h)
  s = clamp(s, 0, 1); v = clamp(v, 0, 1)
  let r = 0, g = 0, b = 0
  if (s === 0) { r = g = b = v }
  else {
    let hue = h
    if (hue === 1) hue = 0
    hue *= 6
    const i = Math.floor(hue)
    const f = hue - i
    const w = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
    switch (i) {
      case 0: r = v; g = t; b = w; break
      case 1: r = q; g = v; b = w; break
      case 2: r = w; g = v; b = t; break
      case 3: r = w; g = q; b = v; break
      case 4: r = t; g = w; b = v; break
      case 5: r = v; g = w; b = q; break
    }
  }
  return [r, g, b]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    s = l <= 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min)
    let delta = max - min
    if (delta === 0) delta = 1
    if (r === max) h = (g - b) / delta
    else if (g === max) h = 2 + (b - r) / delta
    else if (b === max) h = 4 + (r - g) / delta
    h /= 6
    if (h < 0) h += 1
  }
  return [h, s, l]
}

function hslValue(n1: number, n2: number, hue: number): number {
  if (hue > 6) hue -= 6
  else if (hue < 0) hue += 6
  if (hue < 1) return n1 + (n2 - n1) * hue
  if (hue < 3) return n2
  if (hue < 4) return n1 + (n2 - n1) * (4 - hue)
  return n1
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h - Math.floor(h)
  s = clamp(s, 0, 1); l = clamp(l, 0, 1)
  if (s === 0) return [l, l, l]
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const m1 = 2 * l - m2
  return [hslValue(m1, m2, h * 6 + 2), hslValue(m1, m2, h * 6), hslValue(m1, m2, h * 6 - 2)]
}

// ── 스펙트럼(10채널) — helpers.c L521-594 원문 상수 ─────────────────────────────

const T_MATRIX_SMALL: readonly (readonly number[])[] = [
  [0.026595621243689, 0.049779426257903, 0.022449850859496, -0.218453689278271,
    -0.256894883201278, 0.445881722194840, 0.772365886289756, 0.194498761382537,
    0.014038157587820, 0.007687264480513],
  [-0.032601672674412, -0.061021043498478, -0.052490001018404,
    0.206659098273522, 0.572496335158169, 0.317837248815438, -0.021216624031211,
    -0.019387668756117, -0.001521339050858, -0.000835181622534],
  [0.339475473216284, 0.635401374177222, 0.771520797089589, 0.113222640692379,
    -0.055251113343776, -0.048222578468680, -0.012966666339586,
    -0.001523814504223, -0.000094718948810, -0.000051604594741],
]
const SPECTRAL_R_SMALL = [0.009281362787953, 0.009732627042016, 0.011254252737167, 0.015105578649573,
  0.024797924177217, 0.083622585502406, 0.977865045723212, 1.000000000000000,
  0.999961046144372, 0.999999992756822]
const SPECTRAL_G_SMALL = [0.002854127435775, 0.003917589679914, 0.012132151699187, 0.748259205918013,
  1.000000000000000, 0.865695937531795, 0.037477469241101, 0.022816789725717,
  0.021747419446456, 0.021384940572308]
const SPECTRAL_B_SMALL = [0.537052150373386, 0.546646402401469, 0.575501819073983, 0.258778829633924,
  0.041709923751716, 0.012662638828324, 0.007485593127390, 0.006766900622462,
  0.006699764779016, 0.006676219883241]

/** rgb(0..1 · 스트레이트) → 스펙트럼 10채널(out에 «더한다» — C 원문의 += 그대로) */
export function rgbToSpectral(r: number, g: number, b: number, out: Float32Array | number[]): void {
  const offset = 1 - WGM_EPSILON
  r = r * offset + WGM_EPSILON
  g = g * offset + WGM_EPSILON
  b = b * offset + WGM_EPSILON
  for (let i = 0; i < 10; i++) {
    out[i] = (out[i] ?? 0) + SPECTRAL_R_SMALL[i]! * r + SPECTRAL_G_SMALL[i]! * g + SPECTRAL_B_SMALL[i]! * b
  }
}

export function spectralToRgb(spec: ArrayLike<number>, out: Float32Array | number[]): void {
  const offset = 1 - WGM_EPSILON
  let t0 = 0, t1 = 0, t2 = 0
  for (let i = 0; i < 10; i++) {
    t0 += T_MATRIX_SMALL[0]![i]! * spec[i]!
    t1 += T_MATRIX_SMALL[1]![i]! * spec[i]!
    t2 += T_MATRIX_SMALL[2]![i]! * spec[i]!
  }
  out[0] = clamp((t0 - WGM_EPSILON) / offset, 0, 1)
  out[1] = clamp((t1 - WGM_EPSILON) / offset, 0, 1)
  out[2] = clamp((t2 - WGM_EPSILON) / offset, 0, 1)
}

const specA = new Float32Array(10), specB = new Float32Array(10), specMix = new Float32Array(10)
const rgbTmp = new Float32Array(3)

/** 두 색(스트레이트 rgba)을 가중기하평균으로 섞는다 — a는 스머지 상태, b는 표집/브러시 색.
 *  fac = a의 몫. paint_mode 0..1이 스펙트럼 ↔ 가산을 잇는다(helpers.c mix_colors 원문). */
export function mixColors(a: ArrayLike<number>, b: ArrayLike<number>, fac: number, paintMode: number): [number, number, number, number] {
  const opaA = fac, opaB = 1 - opaA
  const outA = clamp(opaA * a[3]! + opaB * b[3]!, 0, 1)
  const sfacA = a[3] === 0 ? 0 : (opaA * a[3]!) / (a[3]! + b[3]! * opaB)
  const sfacB = 1 - sfacA
  let r = 0, g = 0, bb = 0
  if (paintMode > 0) {
    specA.fill(0); specB.fill(0)
    rgbToSpectral(a[0]!, a[1]!, a[2]!, specA)
    rgbToSpectral(b[0]!, b[1]!, b[2]!, specB)
    for (let i = 0; i < 10; i++) specMix[i] = Math.pow(specA[i]!, sfacA) * Math.pow(specB[i]!, sfacB)
    spectralToRgb(specMix, rgbTmp)
    r = rgbTmp[0]!; g = rgbTmp[1]!; bb = rgbTmp[2]!
  }
  if (paintMode < 1) {
    r = r * paintMode + (1 - paintMode) * (a[0]! * opaA + b[0]! * opaB)
    g = g * paintMode + (1 - paintMode) * (a[1]! * opaA + b[1]! * opaB)
    bb = bb * paintMode + (1 - paintMode) * (a[2]! * opaA + b[2]! * opaB)
  }
  return [r, g, bb, outA]
}

/** 가산 ↔ 스펙트럼 혼합의 매끄러운 전환(brushmodes.c spectral_blend_factor — 상수 원문) */
export function spectralBlendFactor(x: number): number {
  const verFac = 1.65, horFac = 8.0, horOffs = 3.0
  const b = x * horFac - horOffs
  return 0.5 + b / (1 + Math.abs(b) * verFac)
}

// ── sRGB ↔ 선형광(합성 규약: 전 구간 선형광 — sRGB는 «화면에 낼 때만») ───────────────

export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
export const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

/** #rrggbb → 선형광 rgb(0..1). 짧은 #rgb도 받는다. 깨진 문자열은 검정. */
export function hexToLinear(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (!Number.isFinite(n)) return [0, 0, 0]
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

/** 선형광 → 8비트 sRGB 찾아보기표(4096 칸 — 블릿의 픽셀 루프에서 pow를 안 부른다) */
export const LIN2SRGB8: Uint8Array = (() => {
  const t = new Uint8Array(4097)
  for (let i = 0; i <= 4096; i++) t[i] = Math.round(linearToSrgb(i / 4096) * 255)
  return t
})()
