// 칠 렌더러 — **p5.brush 판**(web2-61). 이음매(core/paintseam)의 뒤다: 부르는 쪽은 이
// 파일을 모른다(62가 mypaint 판으로 갈아끼우는 자리 — main의 setPaintRenderer 한 줄).
//
// 구조: 오프스크린 1024×1024(FACETEX_MAX_PX) WebGL2 캔버스 한 장에 p5.brush로 긋고,
// render() 뒤 자국 bbox만 2D 긁개로 떠 대상 캔버스(면 텍스처·작업대 판)에 합성한다.
//   - **컨텍스트를 먼저 잡는다**(premultipliedAlpha:false · preserveDrawingBuffer:true) —
//     brushlayer가 실측한 그 결함(#brushc 흰 장막 — premultiplied 규약 위반)과 같은 자리.
//   - 대상 전환은 brushtarget.claim 하나 — brushlayer(#brushc)와 싱글턴을 나눠 쓴다.
//     전환·굽기 비용의 실측은 bake61 원장(⚑ 「재서 정할 것」의 판정 — 간다).
//   - 굵기: p5.brush의 weight는 브러시별 배수라 px가 아니다 — **세션 1회 자가 보정**
//     (직선을 긋고 잉크 폭을 재서 px/weight — 숫자를 짓지 않는다 A-3 · 결정론 렌더라 값도
//     결정론 · 진단 p5calibForTest가 값으로 내놓는다).
//   - **종이 결은 면 고정**(D-W27 ⛔ · 59-3의 그 계약): 결은 브러시(시드=획)가 아니라
//     **종이(대상 px 격자 · 시드 고정)**의 것이다 — 두 획이 같은 자리를 지나면 같은 이빨.
//     보간 값 잡음(모자이크 아님 — 게이트 ①)이고 굵기와 무관(게이트 ④)이다.
//     brushlayer의 종이 마스크(128 타일 · rng32(7))와 같은 생각의 텍스처 판이다.
//   - 마커는 겹치면 진해진다(46 ⛔): 마커 자국은 multiply로 합성(옛 band 모드의 그 자리).
//
// 조정(작업대 몫): 도구별 «내장 브러시 선택 + 매개변수 patch». 내장에서 출발하고 새로
// 짓지 않는다(지시). patch는 brush.add(`t61-<도구>`, {…})로 파생 브러시를 만들어 싣는다.

import * as brush from 'p5.brush/standalone'
import { claimBrushTarget } from './brushtarget'
import {
  markerFlatForTest, paintOpaqueForTest, pressFlatForTest, grainOffForTest,
  type PaintRenderer, type SeamMark, type ParamDesc, type Instr58,
} from '../core/paintseam'
import { rng32 } from '../core/material'
import { C } from '../core/constants'
import type { Pt } from '../core/vec'

const BAKE = C.FACETEX_MAX_PX                 // 1024 — 면 텍스처 상한과 같은 자(#54)

let bake: HTMLCanvasElement | null = null
function bakeCanvas(): HTMLCanvasElement {
  if (!bake) {
    bake = document.createElement('canvas')
    bake.width = BAKE; bake.height = BAKE
    // 속성 선점 — 이후 load()의 getContext는 같은 컨텍스트를 돌려준다(속성 무시)
    bake.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
  }
  return bake
}

// ── 도구 → 브러시(내장에서 출발 — 지시 표) · 사람 조정(파생 브러시 + 배수) ──────────
/** 연필 등급 → 내장 연필(2H·H → 2H · F·HB → HB · B·2B → 2B) */
const pencilOfGrade = (grade?: string): string =>
  grade === '2H' || grade === 'H' ? '2H' : grade === 'B' || grade === '2B' ? '2B' : 'HB'

const BASE_BRUSH: Record<Instr58, string> = {
  pencil: 'HB',            // 등급이 오면 pencilOfGrade가 가른다
  cp: 'cpencil',
  marker: 'marker61',      // 46의 정의를 잇되 markerTip만 끈다(58 사람 계약 — BASE_PARAMS 주석)
  brush: 'charcoal',
}

/** 사람 조정 — 도구별 {브러시 선택 · 배수 여섯}. 실험실이 이음매의 params/setParam으로
 *  읽고 쓴다. 저장은 기기(main — 58 「굳힌다」의 그 자리). 배수 1 = 내장 그대로(무변). */
interface P5Tune {
  base?: string                       // 내장 브러시 선택(기본 BASE_BRUSH)
  weightK?: number                    // 굵기 배수(px 보정 위에 얹힌다)
  opacityK?: number                   // 불투명 배수
  scatterK?: number                   // 산포 배수
  grainK?: number                     // 결 배수(내장 grain이 null이면 무효)
  sharpK?: number                     // 날카로움 배수(내장 sharpness가 null이면 무효)
  spacingK?: number                   // 간격 배수
}
const tune: Partial<Record<Instr58, P5Tune>> = {}
const MUL_KEYS = ['weightK', 'opacityK', 'scatterK', 'grainK', 'sharpK', 'spacingK'] as const

/** 내장 브러시의 매개변수 원본 — 라이브러리에 조회 API가 없어 **파생 브러시(배수 조정)를
 *  만들 때의 기준**이다. 값은 p5.brush 2.2.2 소스(_standard_brushes — MIT 의존성)의 그대로:
 *  [weight, scatter, sharpness, grain, opacity, spacing, pressure, type]. 새 수를 짓지
 *  않는다(A-3) — marker46만 46이 잰 spacing(C.MARKER_SPACING) 하나가 다르다(brushlayer 그대로). */
const BASE_PARAMS: Record<string, Record<string, unknown>> = {
  '2B': { weight: 0.3, scatter: 0.75, sharpness: 0.45, grain: 0.8, opacity: 180, spacing: 0.1, pressure: { curve: [0.1, 0.3], min_max: [1.1, 0.9] } },
  HB: { weight: 0.3, scatter: 0.6, sharpness: 0.3, grain: 0.7, opacity: 170, spacing: 0.1, pressure: { curve: [0.15, 0.2], min_max: [1.1, 0.9] } },
  '2H': { weight: 0.2, scatter: 0.6, sharpness: 0.3, grain: 0.75, opacity: 120, spacing: 0.1, pressure: { curve: [0.15, 0.2], min_max: [1.1, 0.9] } },
  cpencil: { weight: 0.35, scatter: 0.55, sharpness: 0.8, grain: 0.7, opacity: 75, spacing: 0.1, pressure: { curve: [0.15, 0.2], min_max: [0.95, 1.1] } },
  pastel: { weight: 0.7, scatter: 5, sharpness: 0.91, grain: 1, opacity: 30, spacing: 0.085 / 3, pressure: { mode: 'gaussian', curve: [0.4, 0.05], min_max: [1.09, 0.93] }, type: 'default', rotate: 'natural', markerTip: true, noise: 1 },
  crayon: { weight: 0.33, scatter: 1.9, sharpness: 0.75, grain: 2, opacity: 159, spacing: 0.07, pressure: [1.1, 0.9], type: 'default', rotate: 'natural', markerTip: true, noise: 1 },
  charcoal: { weight: 0.35, scatter: 1.5, sharpness: 0.68, grain: 2, opacity: 120, spacing: 0.03, pressure: { curve: [0.15, 0.4], min_max: [1.1, 0.95] } },
  spray: { weight: 0.2, scatter: 6, sharpness: 15, grain: 40, opacity: 90, spacing: 0.5, pressure: { curve: [0.2, 0.35], min_max: [0.7, 1] }, type: 'spray' },
  marker: { weight: 2, scatter: 0.2, sharpness: null, grain: null, opacity: 1, spacing: 0.03, pressure: { curve: [0.35, 0.25], min_max: [1.2, 0.85] }, type: 'marker' },
  marker46: { weight: 2, scatter: 0.2, sharpness: null, grain: null, opacity: 1, spacing: C.MARKER_SPACING, pressure: { curve: [0.35, 0.25], min_max: [1.2, 0.85] }, type: 'marker' },
  // **칠 마커의 제품 정의**(web2-61) — marker46에서 markerTip 하나만 끈다: p5의 marker
  // 팁(양 끝을 도장 열 번으로 강조)이 58의 사람 계약(「시작·끝 원형 강조가 매우 거슬린다」 —
  // 기본 팁 0 · D-2)과 정면 충돌한다. 46 선례 그대로 «내장에서 한 값만 바꾼» 파생이다.
  // 켠 판(marker46)은 실험실 후보이자 ③ 게이트의 반증 팔로 남는다.
  marker61: { weight: 2, scatter: 0.2, sharpness: null, grain: null, opacity: 1, spacing: C.MARKER_SPACING, pressure: { curve: [0.35, 0.25], min_max: [1.2, 0.85] }, type: 'marker', markerTip: false },
}

/** BASE_PARAMS에만 있는 브러시(marker61)의 1회 등록 — 그리기 앞에서 부른다. */
let registered = false
function ensureRegistered(): void {
  if (registered) return
  brush.add('marker61', { ...BASE_PARAMS.marker61! })
  registered = true
}

/** 도구의 기준 브러시 이름(조정·등급 반영 — 크기 반영 전) */
function baseNameOf(tool: Instr58, grade?: string): string {
  const t = tune[tool]
  return t?.base ?? (tool === 'pencil' ? pencilOfGrade(grade) : BASE_BRUSH[tool])
}

/** **크기는 파생 브러시가 든다** — p5.brush의 산포·간격은 «획 weight × param»이라 획
 *  weight로 굵기를 20배 키우면 자국이 점구름이 된다(초판 실측 — 사진이 잡았다. 잉크 폭이
 *  아니라 산포 반경이 20배가 된 것). 라이브러리의 답이 scaleBrushes(param.weight·scatter·
 *  spacing을 «함께» k배)인데 그것은 전역이라 선 겹(brushlayer — 배율 1 보정)을 물들인다.
 *  그래서 **같은 셈을 파생 브러시로** 한다: 크기 사다리(√2 걸음)마다 s61-<기준>-<칸>을
 *  등록하고, 획 weight는 사다리 안 잔차(0.84..1.19)만 든다 — 어느 크기에서나 같은 자국이
 *  비례로 커진다. 사람 조정 배수는 같은 등록에 함께 얹는다. */
const derived = new Map<string, string>()   // `${기준}|${사다리 칸}|${배수들}` → 등록 이름
const LADDER = Math.SQRT2
function sizedBrush(tool: Instr58, wPx: number, grade?: string): { name: string; u: number } {
  const t = tune[tool]
  const base = baseNameOf(tool, grade)
  const w1 = calib(base)                                     // 기준 브러시의 실측 폭(px/weight)
  const ki = Math.max(0, Math.round(Math.log(Math.max(1e-9, wPx / w1)) / Math.log(LADDER)))
  const k = Math.pow(LADDER, ki)
  const u = (wPx / (w1 * k)) * (t?.weightK ?? 1)
  const noMul = !t || MUL_KEYS.every(mk => mk === 'weightK' || (t[mk] ?? 1) === 1)
  if (ki === 0 && noMul) return { name: base, u }
  const key = `${base}|${ki}|${MUL_KEYS.map(mk => t?.[mk] ?? 1).join(',')}`
  const hit = derived.get(key)
  if (hit) return { name: hit, u }
  const bp = BASE_PARAMS[base] ?? BASE_PARAMS.HB!
  const name = `s61-${derived.size}`
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const mul = (v: unknown, m: number): unknown => (num(v) === null ? v : num(v)! * m)
  brush.add(name, {
    ...bp,
    // 크기의 몫 — 도장 지름·산포만 k배. ⚠ spacing은 **경로상 절대 px 걸음**(draw()의
    // stepSize — 소스 실측)이라 k배 하면 도장 수가 1/k이 되어 자국이 사라진다(첫 판 사진이
    // 잡았다). √k배(비용 절반 절충)도 대 보았다 — 연필·색연필이 눈에 띄게 성긴 점열이 됐다
    // (사진 대조 · 기각). 도장 밀도는 내장 그대로 두고 비용은 문(⑥ dpr2 전용 문)이 든다.
    weight: mul(bp.weight, k),
    scatter: mul(bp.scatter, k * (t?.scatterK ?? 1)),
    spacing: Math.max(0.005, (num(bp.spacing) ?? 0.1) * (t?.spacingK ?? 1)),
    // 사람 조정 배수의 몫
    opacity: mul(bp.opacity, t?.opacityK ?? 1),
    grain: mul(bp.grain, t?.grainK ?? 1),
    sharpness: mul(bp.sharpness, t?.sharpK ?? 1),
  })
  derived.set(key, name)
  return { name, u }
}

// ── px/weight 자가 보정 ────────────────────────────────────────────────────────
const pxPerWeight = new Map<string, number>()

function measureWidth(name: string): number {
  ensureRegistered()
  const c = bakeCanvas()
  claimBrushTarget(c)
  brush.clear()
  brush.seed(1)
  brush.noiseSeed(1)
  brush.push()
  brush.translate(-BAKE / 2, -BAKE / 2)
  brush.set(name, '#000000', 1)
  const pts: [number, number, number][] = []
  for (let k = 0; k <= 16; k++) pts.push([100 + (k / 16) * 400, 200, 0.5])
  brush.spline(pts, 0)
  brush.pop()
  brush.render()
  const t = document.createElement('canvas')
  t.width = 300; t.height = 160
  const g = t.getContext('2d')!
  g.drawImage(c, 200, 120, 300, 160, 0, 0, 300, 160)
  const d = g.getImageData(0, 0, 300, 160).data
  const widths: number[] = []
  for (let x = 0; x < 300; x += 3) {
    let n = 0
    for (let y = 0; y < 160; y++) if (d[(y * 300 + x) * 4 + 3]! > 25) n++
    if (n > 0) widths.push(n)
  }
  widths.sort((a, b) => a - b)
  return widths.length ? widths[Math.floor(widths.length / 2)]! : 1
}

function calib(name: string): number {
  let v = pxPerWeight.get(name)
  if (v === undefined) {
    v = Math.max(0.5, measureWidth(name))
    pxPerWeight.set(name, v)
  }
  return v
}

/** 진단 — 보정표(원장·리뷰가 값으로 본다) */
export const p5calibForTest = (): Record<string, number> => Object.fromEntries(pxPerWeight)

// ── 종이 결(면 고정) — 값 잡음 타일 한 장(고정 시드 · 획·시드 무관) ────────────────
// 이빨 깊이는 alpha 0..GRAIN_DEPTH — destination-out 마스크로 자국 알파를 깎는다.
// 칸(GRAIN_CELL px)은 **대상 px 기준 고정**(굵기 무관 — 게이트 ④의 답). 보간(스무드스텝)이라
// 축 정렬 모자이크가 아니다(게이트 ①의 답). 마커는 결이 없다(옛 grainK=0 그대로).
const GRAIN_TILE = 256
const GRAIN_CELL = 4                          // 타일(256)을 나눠떨어지게 — 3은 격자 색인이 NaN이 돼 타일이 비었다(실측)
const GRAIN_DEPTH = 0.42
let grainTile: HTMLCanvasElement | null = null
function grainCanvas(): HTMLCanvasElement {
  if (grainTile) return grainTile
  const t = document.createElement('canvas')
  t.width = GRAIN_TILE; t.height = GRAIN_TILE
  const g = t.getContext('2d')!
  const img = g.createImageData(GRAIN_TILE, GRAIN_TILE)
  const n = GRAIN_TILE / GRAIN_CELL
  // 격자 값(고정 시드 — 실행·획 무관: «같은 종이») — 타일 경계가 이어지게 격자를 순환시킨다
  const rng = rng32(61)
  const cell = new Float32Array(n * n)
  for (let i = 0; i < cell.length; i++) cell[i] = rng()
  const at = (i: number, j: number): number => cell[((j % n + n) % n) * n + ((i % n + n) % n)]!
  const smooth = (x: number): number => x * x * (3 - 2 * x)
  for (let y = 0; y < GRAIN_TILE; y++) {
    for (let x = 0; x < GRAIN_TILE; x++) {
      const fx = x / GRAIN_CELL, fy = y / GRAIN_CELL
      const i = Math.floor(fx), j = Math.floor(fy)
      const tx = smooth(fx - i), ty = smooth(fy - j)
      const v = at(i, j) * (1 - tx) * (1 - ty) + at(i + 1, j) * tx * (1 - ty) +
        at(i, j + 1) * (1 - tx) * ty + at(i + 1, j + 1) * tx * ty
      img.data[(y * GRAIN_TILE + x) * 4 + 3] = Math.round(v * GRAIN_DEPTH * 255)
    }
  }
  g.putImageData(img, 0, 0)
  grainTile = t
  return t
}

// ── 긁개(bbox 크기 재사용 — facetex scratchPool의 그 이유: 미리보기가 이동마다 부른다) ──
let scratch: HTMLCanvasElement | null = null
function scratchCtx(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch || scratch.width < w || scratch.height < h) {
    scratch = document.createElement('canvas')
    scratch.width = Math.max(w, scratch?.width ?? 0)
    scratch.height = Math.max(h, scratch?.height ?? 0)
  }
  const g = scratch.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.clearRect(0, 0, w, h)
  return g
}

const isMarker = (m: SeamMark): boolean => m.tool === 'marker'

/** 압력 열(저장 눈금) → p5.brush 압력 — pressFlat이면 상수(반증 — 압력 게이트가 죽는다).
 *  ⚠ 다리(51 → p5): 표준 팁의 도장 지름은 **압력 제곱**(drawDefault — 소스 실측)이라
 *  입력을 그대로 주면 압력 0.5(마우스)가 1/4 굵기의 성긴 자국이 된다. 51의 압력→굵기
 *  응답(C.PAINT51_WIDTH_FLOOR + SLOPE·p — 제품이 지켜온 그 곡선)을 제곱근으로 합성해
 *  넘긴다: (√(0.7+0.45p))² = 51의 굵기 배수 그대로. 새 수를 짓지 않는다(A-3). */
function press01(m: SeamMark, i: number): number {
  const p = pressFlatForTest() ? 0.5
    : !m.press || m.press.length === 0 ? 0.5
    : (() => {
        const t = m.pts.length > 1 ? i / (m.pts.length - 1) : 0
        const raw = m.press[Math.min(m.press.length - 1, Math.round(t * (m.press.length - 1)))]!
        return Math.min(1, Math.max(0, raw / C.PRESS_Q))
      })()
  return Math.min(1, Math.sqrt(Math.max(0.05, C.PAINT51_WIDTH_FLOOR + C.PAINT51_WIDTH_SLOPE * p)))
}

/** 한 무리(같은 합성 모드의 연속 자국)를 p5 캔버스에 긋고 bbox만 떠서 대상에 합성한다. */
function drawGroup(g: CanvasRenderingContext2D, marks: SeamMark[]): void {
  ensureRegistered()
  const c = bakeCanvas()
  claimBrushTarget(c)
  brush.clear()
  brush.push()
  brush.translate(-BAKE / 2, -BAKE / 2)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  let wMax = 0
  for (const m of marks) {
    const { name, u } = sizedBrush(m.tool, m.wPx, m.grade)
    brush.seed(m.seed)
    brush.noiseSeed(m.seed)
    brush.set(name, m.color, u)
    const pts: [number, number, number][] = m.pts.map((p, i) => [p.x, p.y, press01(m, i)])
    brush.spline(pts, 0)
    // **획마다 마스크를 캔버스로 누른다** — 같은 색의 연속 획을 마스크 하나에 모으면 «획
    // 사이는 쌓인다»(59·46 ⛔ — 마스크는 한 번만 합성된다)가 죽는다. paint59 ②의 새 반증
    // (두 획 교차)이 실제로 잡았다(비 1.006 — 안 쌓임). render()는 합성 플러시일 뿐이라
    // 읽어오기(drawImage)는 무리 끝에 한 번 그대로다.
    brush.render()
    for (const p of m.pts) {
      if (p.x < x0) x0 = p.x
      if (p.y < y0) y0 = p.y
      if (p.x > x1) x1 = p.x
      if (p.y > y1) y1 = p.y
    }
    wMax = Math.max(wMax, m.wPx * (tune[m.tool]?.weightK ?? 1))
  }
  brush.pop()
  brush.render()
  const W = g.canvas.width, H = g.canvas.height
  // bbox — 입자 번짐 여유(굵기 2배 + 8px · brushlayer CLIP_MARGIN의 그 물음)
  const mg = wMax * 2 + 8
  const bx = Math.max(0, Math.floor(x0 - mg)), by = Math.max(0, Math.floor(y0 - mg))
  const bw = Math.min(Math.min(W, BAKE), Math.ceil(x1 + mg)) - bx
  const bh = Math.min(Math.min(H, BAKE), Math.ceil(y1 + mg)) - by
  if (bw <= 0 || bh <= 0) return
  const sg = scratchCtx(bw, bh)
  sg.drawImage(c, bx, by, bw, bh, 0, 0, bw, bh)
  // 종이 결 — 대상 px 위상(bx·by로 정렬)의 타일을 알파에서 깎는다(destination-out).
  // 마커 무리는 결이 없다(옛 grainK=0 그대로) — 무리는 합성 모드로 갈라져 있어 도구가 섞이지 않는다.
  if (!grainOffForTest() && !isMarker(marks[0]!)) {
    sg.save()
    sg.globalCompositeOperation = 'destination-out'
    const pat = sg.createPattern(grainCanvas(), 'repeat')!
    const ph = new DOMMatrix().translate(-(bx % GRAIN_TILE), -(by % GRAIN_TILE))
    pat.setTransform(ph)
    sg.fillStyle = pat
    sg.fillRect(0, 0, bw, bh)
    sg.restore()
  }
  // 반증 스위치 — 평면/불투명 덮어쓰기(자국 픽셀 알파를 1로 · e2e 전용이라 픽셀 루프 비용 허용)
  const flat = (markerFlatForTest() && isMarker(marks[0]!)) || paintOpaqueForTest()
  if (flat) {
    const img = sg.getImageData(0, 0, bw, bh)
    const d = img.data
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 25) d[i] = 255
    sg.putImageData(img, 0, 0)
  }
  g.save()
  g.globalCompositeOperation = !flat && isMarker(marks[0]!) ? 'multiply' : 'source-over'
  g.globalAlpha = 1
  g.drawImage(scratch!, 0, 0, bw, bh, bx, by, bw, bh)
  g.restore()
}

function drawP5Mark(g: CanvasRenderingContext2D, m: SeamMark): void {
  drawGroup(g, [m])
}

/** 묶음 — 마커가 아닌 «연속» 자국만 한 무리로 굽는다(차례 보존 — 그린 차례 = 쌓인 차례.
 *  무리 안 획 사이는 획마다 render() 플러시로 p5 캔버스에 over로 쌓인다).
 *  ⚠ **마커는 획마다 저 혼자다**: p5의 마커 합성은 안료 «혼합»이라 같은 색을 두 번 그어도
 *  안 진해진다(paint59 ② 반증 실측 — 두 번이 0.93배로 오히려 옅었다). 「겹치면 진해진다」
 *  (46 ⛔)의 기제는 획별 multiply 합성(옛 band 모드의 그 자리)이므로 마커 획 하나 =
 *  무리 하나 = 텍스처 multiply 한 번이어야 한다. */
function drawP5Marks(g: CanvasRenderingContext2D, marks: SeamMark[]): void {
  let i = 0
  while (i < marks.length) {
    if (isMarker(marks[i]!)) { drawGroup(g, [marks[i]!]); i++; continue }
    let j = i + 1
    while (j < marks.length && !isMarker(marks[j]!)) j++
    drawGroup(g, marks.slice(i, j))
    i = j
  }
}

/** 결 타일 표식(D-1 — paint59 ④의 자): 타일 알파 지도(0..1)를 값으로 내놓는다. */
export function p5grainTileForTest(): { v: number[]; n: number } {
  const t = grainCanvas()
  const g = t.getContext('2d')!
  const d = g.getImageData(0, 0, GRAIN_TILE, GRAIN_TILE).data
  const v: number[] = []
  for (let i = 3; i < d.length; i += 4) v.push(d[i]! / 255)
  return { v, n: GRAIN_TILE }
}

export const p5PaintRenderer: PaintRenderer = {
  id: 'p5brush',
  draw: drawP5Mark,
  drawMany: drawP5Marks,
  brushChoices: (tool) =>
    tool === 'pencil' ? ['2B', 'HB', '2H'] :
    tool === 'cp' ? ['cpencil'] :
    tool === 'marker' ? ['marker61', 'marker46', 'marker'] :
    ['charcoal', 'pastel', 'crayon', 'spray', '2B'],
  brushOf: (tool) => tune[tool]?.base ?? BASE_BRUSH[tool],
  setBrush: (tool, name) => { tune[tool] = { ...tune[tool], base: name } },
  params: (tool): ParamDesc[] => {
    const t = tune[tool] ?? {}
    const labels: Record<typeof MUL_KEYS[number], string> = {
      weightK: '굵기 배수', opacityK: '불투명 배수', scatterK: '산포 배수',
      grainK: '결 배수', sharpK: '날 배수', spacingK: '간격 배수',
    }
    return MUL_KEYS.map(k => ({
      key: k, label: labels[k], min: k === 'scatterK' ? 0 : 0.1, max: 4, step: 0.05,
      value: t[k] ?? 1,
    }))
  },
  setParam: (tool, key, value) => {
    tune[tool] = { ...tune[tool], [key]: value }
  },
  resetTune: (tool) => { delete tune[tool] },
  tuneJson: () => JSON.stringify(tune),
  loadTune: (json) => {
    for (const k of Object.keys(tune)) delete tune[k as Instr58]
    if (!json) return
    try {
      const raw = JSON.parse(json) as Record<string, unknown>
      if (typeof raw !== 'object' || raw === null) return
      for (const k of ['brush', 'marker', 'cp', 'pencil'] as Instr58[]) {
        const v = raw[k]
        if (typeof v !== 'object' || v === null) continue
        const out: P5Tune = {}
        for (const [key, val] of Object.entries(v)) {
          if (key === 'base' && typeof val === 'string') out.base = val
          else if ((MUL_KEYS as readonly string[]).includes(key) &&
            typeof val === 'number' && Number.isFinite(val)) (out as Record<string, number>)[key] = val
        }
        if (Object.keys(out).length > 0) tune[k] = out
      }
    } catch { /* 깨진 저장 — 기본값 */ }
  },
}

// ── ⚑ 굽는 길 탐침(web2-61 「재서 정할 것」 — bake61.spec이 원장으로 남긴다) ──────────

export function p5probeForTest(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  out.box = brush.box()
  const c = bakeCanvas()

  const draw1 = (): string => {
    const t = document.createElement('canvas')
    t.width = 480; t.height = 240
    const g = t.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 240)
    const pts = [] as Pt[]
    for (let i = 0; i <= 24; i++) pts.push({ x: 40 + i * 16, y: 120 + Math.sin(i / 4) * 30 })
    drawP5Mark(g, { pts, color: '#3a3a44', wPx: 20, seed: 7, tool: 'pencil' })
    const d = g.getImageData(0, 0, 480, 240).data
    let h = 0, ink = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! + d[i + 1]! + d[i + 2]!
      if (v < 740) ink++
      h = (Math.imul(h, 31) + v) | 0
    }
    out.markPx = ink
    return `${h}`
  }
  const h1 = draw1(), h2 = draw1()
  out.deterministic = h1 === h2

  const c2 = document.createElement('canvas')
  c2.width = 256; c2.height = 256
  c2.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
  const t0 = performance.now()
  const ROUND = 4
  for (let i = 0; i < ROUND; i++) { claimBrushTarget(c2); claimBrushTarget(c) }
  out.switch_ms_per = +(((performance.now() - t0) / (ROUND * 2))).toFixed(2)

  const face = document.createElement('canvas')
  face.width = 512; face.height = 512
  const fg = face.getContext('2d')!
  const tools: Instr58[] = ['pencil', 'cp', 'marker', 'brush']
  for (const tl of tools) calib(baseNameOf(tl))
  const mkMarks = (f: number): SeamMark[] => {
    const list: SeamMark[] = []
    for (let s = 0; s < 40; s++) {
      const tl = tools[s % 4]!
      const y = 20 + (s % 20) * 24
      const pts = [] as Pt[]
      for (let i = 0; i <= 12; i++) pts.push({ x: 20 + i * 30, y: y + Math.sin(i / 2) * 8 })
      list.push({ pts, color: '#4a4a52', wPx: 16, seed: f * 100 + s, tool: tl })
    }
    return list
  }
  const tA = performance.now()
  for (let f = 0; f < 20; f++) drawP5Marks(fg, mkMarks(f))
  out.bake_20x40_ms = +(performance.now() - tA).toFixed(1)
  const tB = performance.now()
  for (let f = 0; f < 2; f++) for (const m of mkMarks(f)) drawP5Mark(fg, m)
  out.bake_perstroke_2x40_ms = +(performance.now() - tB).toFixed(1)
  out.calib = p5calibForTest()
  return out
}
