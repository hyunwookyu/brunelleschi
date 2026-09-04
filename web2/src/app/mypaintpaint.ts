// 칠 렌더러 — **mypaint 판**(web2-62). 이음매(core/paintseam)의 뒤다: 부르는 쪽(facetex 굽기·
// 미리보기 · 작업대 · 팔)은 이 파일을 모른다. main의 setPaintRenderer 한 줄이 61(p5.brush)에서
// 이것으로 바뀌었다.
//
// 구조:
//   · 엔진 = src/mypaint(libmypaint ISC 이식 — brush 상태기계 · surface 도장/블렌드/표집) ·
//     브러시 = presets.gen.ts(mypaint-brushes 196 · CC0) — 값을 짓지 않는다(지시).
//   · 층(선형광 premultiplied float)은 **대상 캔버스마다** 하나(LRU · 바이트 예산): 굽기(drawMany)가
//     새로 세우고, 초안(draw)은 그 층 위에 «스냅숏-되돌림»으로 얹어 층을 안 바꾼다 — 초안이
//     굽힌 안료와 실제로 섞이고(안료 혼합·스머지) 미리보기==확정본이 산다.
//   · 도구 슬롯 넷(pencil·brush(잉크펜)·marker·cp) ↔ 브러시 이름. 저장 형식은 안 바뀐다(paint.i
//     그대로) — 슬롯에 어떤 브러시를 앉히는가는 기기 조정(tune · 굳힌다)의 몫이다.
//   · 크기: 프리셋마다 «반지름 → 반최대 폭»을 두 반지름에서 실측해 선형으로 되푼다(자가 보정 —
//     숫자를 짓지 않는다 A-3 · #105: 실패는 값 1이 아니라 표식 ok:false).
//   · 압력: 저장 눈금 → 0..1 그대로(프리셋의 압력 곡선이 그 응답이다 — 61의 다리 없음).
//   · 시간: 점렬에 시각이 없다 — 일정 속도(SPEED_PX_S)로 dtime을 합성한다(AS-C184).

import {
  markerFlatForTest, paintOpaqueForTest, pressFlatForTest, grainOffForTest,
  type PaintRenderer, type SeamMark, type ParamDesc, type Instr58,
} from '../core/paintseam'
import { rng32 } from '../core/material'
import { C } from '../core/constants'
import { Brush } from '../mypaint/brush'
import { Layer, StrokeSurface, type Bbox, type StrokeOpts } from '../mypaint/surface'
import { PRESETS, PRESET_GROUPS, PRESET_SKIPPED_INPUTS, type Preset } from '../mypaint/presets.gen'
import { SETTINGS, INPUTS, S } from '../mypaint/settings.gen'
import { hexToLinear, rgbToHsv } from '../mypaint/helpers'
import { grainTile, GRAIN_DEPTH } from '../mypaint/paper'

/** 합성 속도(px/s) — 점렬에 시각이 없으므로 dtime = 걸음 ÷ 이 값(AS-C184). */
export const SPEED_PX_S = 300
/** 층 예산(바이트) — 1024² float 층이 16MB라 여섯 장 남짓. 넘치면 오래된 캔버스의 층을 버린다. */
const LAYER_BUDGET = 96 * 1024 * 1024

export const PRESET_BY_NAME: ReadonlyMap<string, Preset> = new Map(PRESETS.map(p => [p.name, p]))
export const SETTING_IDX: ReadonlyMap<string, number> = new Map(SETTINGS.map((s, i) => [s.id, i]))
export const INPUT_IDX: ReadonlyMap<string, number> = new Map(INPUTS.map((s, i) => [s.id, i]))

/** 분류별 이름 목록(고르개의 정본 — order.conf 차례) */
export const PRESET_CATALOG: readonly { group: string; names: string[] }[] =
  PRESET_GROUPS.map(g => ({ group: g, names: PRESETS.filter(p => p.group === g).map(p => p.name) }))

// ── 도구 슬롯 → 기본 브러시(세션이 정했다 — 지시 「사람을 멈춰 세우지 마라」 · ⚑ 사진이 판정대) ──
/** 연필 등급 → 프리셋(2H·H → 4H · F·HB → classic · B·2B → 2B) */
export const pencilOfGrade = (grade?: string): string =>
  grade === '2H' || grade === 'H' ? 'deevad/4H_pencil'
    : grade === 'B' || grade === '2B' ? 'deevad/2B_pencil' : 'classic/pencil'
export const DEFAULT_PRESET: Record<Instr58, string> = {
  pencil: 'classic/pencil',            // 등급이 오면 pencilOfGrade가 가른다
  brush: 'deevad/liner',               // 잉크펜 슬롯 — 제도 라이너(불투명 1 · AA 2)
  marker: 'ramon/100%_Opaque',         // 둥근·딱딱한 불투명 블록(균일 띠 — 61의 마커 계약 · 압력 무관 = 실물 마커) · 끌 마커는 고르개에
                                       // ⚠ tanda/marker-01(hardness .6)은 가장자리가 부드러워 paint50 ④의 원근 자가 먼 끝을 잃었다(1.46~1.58 vs 1.24 —
                                       // 텍스처 안 띠는 균일 · 딱딱한 liner는 1.29): 자의 결이 아니라 마커의 «날»이 다른 것 — 사진이 판정대
  cp: 'ramon/B-pencil',                // 색연필 — 연필 엔진 + 색(PAINT-TIERS)
}
/** 도구 캡(획 불투명도 상한 — 46·50 계약 상수 그대로) */
const TOOL_CAP: Record<Instr58, number> = { pencil: 1, brush: 1, marker: C.PAINT_MARKER_ALPHA, cp: C.PAINT_CP_ALPHA }
/** 종이 결 기본(paperK 1 = 깊이 GRAIN_DEPTH · 마커는 결 없음 — 61 그대로) */
const TOOL_PAPER: Record<Instr58, number> = { pencil: 1, brush: 1, marker: 0, cp: 1 }

// ── 사람 조정(작업대·고르개 — 기기 저장) ────────────────────────────────────────
interface Tune {
  base?: string          // 슬롯에 앉힌 브러시 이름
  sizeK?: number         // 굵기 배수
  opacityK?: number      // 불투명 배수
  spacingK?: number      // 도장 간격 배수(dabs_per_* ÷ 배수)
  scatterK?: number      // 산포 배수(offset_by_random ×)
  smudgeK?: number       // 스머지 배수(smudge ×)
  paperK?: number        // 종이 결 깊이 배수(0 = 없음)
}
const MUL_KEYS = ['sizeK', 'opacityK', 'spacingK', 'scatterK', 'smudgeK', 'paperK'] as const
const tune: Partial<Record<Instr58, Tune>> = {}
const LABELS: Record<typeof MUL_KEYS[number], string> = {
  sizeK: '굵기 배수', opacityK: '불투명 배수', spacingK: '간격 배수', scatterK: '산포 배수', smudgeK: '스머지 배수', paperK: '종이 결',
}

// ── 반증 스위치(e2e 전용 — 제품 경로는 안 부른다) ─────────────────────────────────
let capOffOverride = false
export function setCapOffForTest(v: boolean): void { capOffOverride = v }
let smudgeSelfOverride = false
export function setSmudgeSelfSampleForTest(v: boolean): void { smudgeSelfOverride = v }
let premulBreakOnce = false
export function setPremulBreakForTest(v: boolean): void { premulBreakOnce = v }
let fringeBreak = false
export function setFringeBreakForTest(v: boolean): void { fringeBreak = v }
let paintModeOff = false
export function setPaintModeOffForTest(v: boolean): void { paintModeOff = v }
let smudgeOff = false
export function setSmudgeOffForTest(v: boolean): void { smudgeOff = v }
/** 반증(AS-C184) — 이벤트마다 «고정» dtime(ms). 느린 몸짓(점이 촘촘한 끝)에 시간이 더 실려 dabs_per_second
 *  붓의 끝이 뭉친다(58 사람 계약의 그 증상). 제품은 null(걸음 ÷ 일정 속도). */
let eventDtimeMs: number | null = null
export function setEventDtimeForTest(ms: number | null): void { eventDtimeMs = ms }
/** 층 추적(진단) — 마지막으로 그린 캔버스의 표면 */
let lastSurface: StrokeSurface | null = null
/** 진단 — draw(초안 통로)는 층을 되돌리므로, 팔이 켜면 되돌리기 «전» 알파 지도를 떠 둔다 */
let captureAlpha = false
let capturedAlpha: { a: Float32Array; w: number; h: number } | null = null
export function setAlphaCaptureForTest(v: boolean): void { captureAlpha = v }
let premulViolationsTotal = 0

// ── 브러시(프리셋마다 하나 — 기준 base 값을 따로 들고 획마다 덮고 되돌린다) ────────────
interface Loaded { brush: Brush; base: Float32Array; stats: ReturnType<Brush['loadPreset']> }
const loaded = new Map<string, Loaded>()
function brushOf(name: string): Loaded {
  const hit = loaded.get(name)
  if (hit) return hit
  const p = PRESET_BY_NAME.get(name)
  if (!p) throw new Error(`mypaint: 모르는 브러시 ${name}`)
  const brush = new Brush()
  const stats = brush.loadPreset(p, SETTING_IDX, INPUT_IDX)
  const base = new Float32Array(SETTINGS.length)
  for (let i = 0; i < SETTINGS.length; i++) base[i] = brush.getBaseValue(i)
  const l = { brush, base, stats }
  loaded.set(name, l)
  return l
}
/** 진단 — 사상 통계(게이트 ⑥): 프리셋 전부를 실어 설정·곡선 수와 미지 항목을 센다 */
export function presetMappingForTest(): { presets: number; settings: number; curves: number; unknownSettings: number; unknownInputs: Record<string, number>; skipped: Record<string, number> } {
  let settings = 0, curves = 0, unknownSettings = 0
  const unknownInputs: Record<string, number> = {}
  for (const p of PRESETS) {
    const l = brushOf(p.name)
    settings += l.stats.settings; curves += l.stats.curves; unknownSettings += l.stats.unknownSettings.length
    for (const k of l.stats.unknownInputs) unknownInputs[k] = (unknownInputs[k] ?? 0) + 1
  }
  return { presets: PRESETS.length, settings, curves, unknownSettings, unknownInputs, skipped: PRESET_SKIPPED_INPUTS }
}

// ── 층(대상 캔버스마다) ──────────────────────────────────────────────────────────
interface Entry { canvas: HTMLCanvasElement; surface: StrokeSurface; bytes: number; tick: number }
const entries = new Map<HTMLCanvasElement, Entry>()
let tickN = 0
let bytesTotal = 0
function evictIfNeeded(): void {
  while (bytesTotal > LAYER_BUDGET && entries.size > 1) {
    let oldest: Entry | null = null
    for (const e of entries.values()) if (!oldest || e.tick < oldest.tick) oldest = e
    if (!oldest) break
    entries.delete(oldest.canvas)
    bytesTotal -= oldest.bytes
  }
}
/** 캔버스의 층 — 없거나 크기가 다르면 새로(투명). fresh면 비운다(굽기 — 획 전부를 다시 얹는다). */
function surfaceFor(canvas: HTMLCanvasElement, fresh: boolean): StrokeSurface {
  const w = canvas.width, h = canvas.height
  let e = entries.get(canvas)
  if (e && (e.surface.layer.w !== w || e.surface.layer.h !== h)) {
    entries.delete(canvas); bytesTotal -= e.bytes; e = undefined
  }
  if (!e) {
    const layer = new Layer(w, h)
    const surface = new StrokeSurface(layer)
    e = { canvas, surface, bytes: layer.bytes + w * h * 4, tick: ++tickN }
    entries.set(canvas, e)
    bytesTotal += e.bytes
    evictIfNeeded()
  } else {
    e.tick = ++tickN
    if (fresh) e.surface.layer.clear()
  }
  return e.surface
}
/** 진단 — 층 현황 */
export const layerStatsForTest = (): { layers: number; bytes: number; budget: number } => ({ layers: entries.size, bytes: bytesTotal, budget: LAYER_BUDGET })

// ── 크기 자가 보정(프리셋마다 «반지름 → 반최대 폭» 두 점 — 구간별 비례·로그 보간) ────────
// ⚠ 초판의 선형 맞춤(w = a·r + b)은 산포가 큰 붓(chalk·spray2·coarse_bulk — 절편 b가 10~97px)에서
// 작은 요청 폭의 반지름을 0 이하로 내어 «자국 없음»을 만들었다(paint62 ⑦ unexplained 5 — 실측이
// 잡았다). 폭은 반지름에 비례한다(마스크·산포 둘 다 base_radius 배)는 것이 원문의 구조이므로
// 절편을 두지 않는다: 요청 폭이 두 점 사이면 로그 보간, 밖이면 가까운 점에서 비례.
interface Calib { a: number; b: number; ok: boolean; w1: number; w2: number }
const calibs = new Map<string, Calib>()
const CAL_W = 512, CAL_H = 192, CAL_R1 = 6, CAL_R2 = 24
let calSurface: StrokeSurface | null = null

function measureHalfMaxWidth(name: string, radius: number): number {
  if (!calSurface) calSurface = new StrokeSurface(new Layer(CAL_W, CAL_H))
  const surf = calSurface
  surf.layer.clear()
  const l = brushOf(name)
  restoreBase(l)
  l.brush.setBaseValue(S.RADIUS_LOGARITHMIC, Math.log(radius))
  // 색은 검정 — 폭은 알파로 잰다
  l.brush.setBaseValue(S.COLOR_H, 0); l.brush.setBaseValue(S.COLOR_S, 0); l.brush.setBaseValue(S.COLOR_V, 0)
  l.brush.setRng(rng32(62))
  surf.beginStroke({ cap: 1, capExact: false, opacityK: 1, capOff: false, grain: null, grainDepth: 0, snapshotAll: false, smudgeSnapshot: true, rng: rng32(63) })
  runStroke(l.brush, surf, Array.from({ length: 61 }, (_, k) => ({ x: 40 + (k / 60) * 432, y: CAL_H / 2 })), null, 0.5)
  surf.endStroke()
  restoreBase(l)
  const a = surf.alphaMap()
  const widths: number[] = []
  for (let x = 120; x < 392; x += 2) {
    let mx = 0
    for (let y = 0; y < CAL_H; y++) mx = Math.max(mx, a[y * CAL_W + x]!)
    if (mx < 0.02) continue
    const th = mx / 2
    let n = 0
    for (let y = 0; y < CAL_H; y++) if (a[y * CAL_W + x]! > th) n++
    widths.push(n)
  }
  widths.sort((p, q) => p - q)
  return widths.length ? widths[Math.floor(widths.length / 2)]! : 0
}
function calib(name: string): Calib {
  const hit = calibs.get(name)
  if (hit) return hit
  const w1 = measureHalfMaxWidth(name, CAL_R1), w2 = measureHalfMaxWidth(name, CAL_R2)
  const ok = w1 > 0 && w2 > 0
  // a·b는 기록(두 점의 기울기·절편 — 산포 붓의 절편이 얼마나 큰지 원장이 본다) · 되풀이는 아래 radiusFor
  const a = (w2 - w1) / (CAL_R2 - CAL_R1)
  const b = w1 - a * CAL_R1
  // ⚠ #105 — 실패는 그럴듯한 값이 아니라 표식이다: ok:false면 반지름 = 폭/2(기하 그대로)를 쓰되 표에 남긴다
  const c: Calib = { a, b, ok, w1, w2 }
  calibs.set(name, c)
  return c
}
/** 요청 폭(px) → 반지름: 두 점 사이는 로그 보간 · 밖은 가까운 점에서 비례(절편 없음) */
function radiusFor(c: Calib, wPx: number): number {
  if (!c.ok) return Math.max(0.15, wPx / 2)
  if (wPx <= c.w1) return Math.max(0.15, (wPx * CAL_R1) / c.w1)
  if (wPx >= c.w2 || c.w2 <= c.w1) return Math.max(0.15, (wPx * CAL_R2) / c.w2)
  const t = (Math.log(wPx) - Math.log(c.w1)) / (Math.log(c.w2) - Math.log(c.w1))
  return Math.exp(Math.log(CAL_R1) + t * (Math.log(CAL_R2) - Math.log(CAL_R1)))
}
/** 요청 폭(px) → radius_logarithmic 기준값 */
function radiusLogFor(name: string, wPx: number): number {
  return Math.log(radiusFor(calib(name), wPx))
}
export const calibForTest = (): Record<string, Calib> => Object.fromEntries(calibs)

function restoreBase(l: Loaded): void {
  for (let i = 0; i < SETTINGS.length; i++) l.brush.settings[i]!.baseValue = l.base[i]!
  l.brush.settingsBaseValuesHaveChanged()
}

// ── 획 하나 ─────────────────────────────────────────────────────────────────
/** 점렬을 stroke_to로 흘린다 — 첫 점은 리셋(펜 대기) · 끝에 압력 0(펜 떼기). */
function runStroke(brush: Brush, surf: StrokeSurface, pts: { x: number; y: number }[], press: number[] | null, pressConst: number): void {
  const n = pts.length
  const pAt = (i: number): number => {
    if (!press || press.length === 0) return pressConst
    const t = n > 1 ? i / (n - 1) : 0
    const raw = press[Math.min(press.length - 1, Math.round(t * (press.length - 1)))]!
    return Math.min(1, Math.max(0, raw / C.PRESS_Q))
  }
  brush.primeAt(pts[0]!.x, pts[0]!.y, SPEED_PX_S)   // 앞 획의 끝이 첫 점을 안 끈다(결정론) · 속도 필터 정상 상태(brush.primeAt 주석)
  brush.newStroke()
  brush.strokeTo(surf, pts[0]!.x, pts[0]!.y, pAt(0), 0, 0, 0.001)
  // 원문은 리셋 «다음» 구간에 도장을 안 찍는다(dabs_per_* 상태가 첫 update 전이라 0 — count_dabs_to). 이벤트가
  // 성긴 점렬(팔·굽기 재생 — 60px 걸음)에서는 그 구간이 통째로 빈다(paint50 ④ 실측). 반 픽셀짜리 이벤트를 하나
  // 넣어 그 «죽은 구간»을 무시할 길이에 쓴다(원문 거동 그대로 · 잃는 것 .5px).
  if (n > 1) {
    const q = pts[1]!, dd = Math.hypot(q.x - pts[0]!.x, q.y - pts[0]!.y)
    if (dd > 1) brush.strokeTo(surf, pts[0]!.x + ((q.x - pts[0]!.x) / dd) * 0.5, pts[0]!.y + ((q.y - pts[0]!.y) / dd) * 0.5, pAt(0), 0, 0, 0.0005)
  }
  let prev = pts[0]!
  for (let i = 1; i < n; i++) {
    const p = pts[i]!
    const dt = eventDtimeMs !== null ? eventDtimeMs / 1000 : Math.max(0.0005, Math.hypot(p.x - prev.x, p.y - prev.y) / SPEED_PX_S)
    brush.strokeTo(surf, p.x, p.y, pAt(i), 0, 0, dt)
    prev = p
  }
  brush.strokeTo(surf, prev.x, prev.y, 0, 0, 0, 0.001)
}

function presetOf(m: SeamMark): string {
  if (m.preset && PRESET_BY_NAME.has(m.preset)) return m.preset
  const t = tune[m.tool]
  if (t?.base && PRESET_BY_NAME.has(t.base)) return t.base
  return m.tool === 'pencil' ? pencilOfGrade(m.grade) : DEFAULT_PRESET[m.tool]
}

function paintOne(surf: StrokeSurface, m: SeamMark, draft: boolean): Bbox {
  const name = presetOf(m)
  const l = brushOf(name)
  const t = tune[m.tool] ?? {}
  const flat = (markerFlatForTest() && m.tool === 'marker') || paintOpaqueForTest()
  restoreBase(l)
  const b = l.brush
  // 크기(자가 보정 위에 배수) · 색(선형광 → HSV 기준값)
  b.setBaseValue(S.RADIUS_LOGARITHMIC, radiusLogFor(name, Math.max(0.5, m.wPx * (t.sizeK ?? 1))))
  const [lr, lg, lb] = hexToLinear(m.color)
  const [h, s, v] = rgbToHsv(lr, lg, lb)
  b.setBaseValue(S.COLOR_H, h); b.setBaseValue(S.COLOR_S, s); b.setBaseValue(S.COLOR_V, v)
  // 사람 배수(간격·산포·스머지) — 기준값에 곱
  if (t.spacingK && t.spacingK !== 1) {
    b.setBaseValue(S.DABS_PER_ACTUAL_RADIUS, b.getBaseValue(S.DABS_PER_ACTUAL_RADIUS) / t.spacingK)
    b.setBaseValue(S.DABS_PER_BASIC_RADIUS, b.getBaseValue(S.DABS_PER_BASIC_RADIUS) / t.spacingK)
    b.setBaseValue(S.DABS_PER_SECOND, b.getBaseValue(S.DABS_PER_SECOND) / t.spacingK)
  }
  if (t.scatterK !== undefined && t.scatterK !== 1) b.setBaseValue(S.OFFSET_BY_RANDOM, b.getBaseValue(S.OFFSET_BY_RANDOM) * t.scatterK)
  if (t.smudgeK !== undefined && t.smudgeK !== 1) b.setBaseValue(S.SMUDGE, b.getBaseValue(S.SMUDGE) * t.smudgeK)
  // 반증·팔 덮개(설정 기준값 — 이름은 brushsettings의 internal_name)
  if (m.over) for (const [k, val] of Object.entries(m.over)) { const si = SETTING_IDX.get(k); if (si !== undefined) b.setBaseValue(si, val) }
  if (paintModeOff) b.setBaseValue(S.PAINT_MODE, 0)
  if (smudgeOff) b.setBaseValue(S.SMUDGE, 0)
  if (flat) { b.setBaseValue(S.OPAQUE, 1); b.setBaseValue(S.HARDNESS, 1); b.setBaseValue(S.OPAQUE_LINEARIZE, 0) }
  b.setRng(rng32(m.seed))
  const paperK = grainOffForTest() || flat ? 0 : (t.paperK ?? TOOL_PAPER[m.tool])
  const opts: StrokeOpts = {
    cap: flat ? 1 : TOOL_CAP[m.tool],
    capExact: !flat && m.tool === 'marker',          // 마커 한 획 알파 = C.PAINT_MARKER_ALPHA(46 계약 · 61 그대로)
    opacityK: flat ? 1 : (t.opacityK ?? 1),
    capOff: capOffOverride,
    grain: paperK > 0 ? grainTile() : null,
    grainDepth: Math.min(1, GRAIN_DEPTH * paperK),
    snapshotAll: draft,
    smudgeSnapshot: !smudgeSelfOverride,
    rng: rng32(m.seed ^ 0x5bd1e995),
  }
  surf.beginStroke(opts)
  if (premulBreakOnce) { surf.breakPremulOnce = true; premulBreakOnce = false }
  surf.fringeBreak = fringeBreak
  runStroke(b, surf, m.pts, pressFlatForTest() ? null : (m.press ?? null), 0.5)
  restoreBase(l)
  let box: Bbox
  const v0 = surf.premulViolations
  try { box = surf.endStroke() } finally { premulViolationsTotal += surf.premulViolations - v0 }   // 누적(캔버스가 바뀌어도)
  return box
}

// ── blit — 층 상자 → 대상 2D 캔버스(source-over · 스트레이트 ImageData) ──────────────
let scratch: HTMLCanvasElement | null = null
function blit(g: CanvasRenderingContext2D, surf: StrokeSurface, box: Bbox): void {
  if (box.x1 < box.x0 || box.y1 < box.y0) return
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1
  if (!scratch || scratch.width < bw || scratch.height < bh) {
    scratch = document.createElement('canvas')
    scratch.width = Math.max(bw, scratch?.width ?? 0); scratch.height = Math.max(bh, scratch?.height ?? 0)
  }
  const sg = scratch.getContext('2d')!
  const img = sg.createImageData(bw, bh)
  surf.toImageData(box, img)
  sg.putImageData(img, 0, 0)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.drawImage(scratch, 0, 0, bw, bh, box.x0, box.y0, bw, bh)
  g.restore()
}
const union = (a: Bbox, b: Bbox): Bbox => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })

/** 한 자국(초안·견본·작업대) — 캔버스의 층 위에 스냅숏-되돌림으로 얹는다(층 불변). */
function drawOne(g: CanvasRenderingContext2D, m: SeamMark): void {
  const surf = surfaceFor(g.canvas, false)
  lastSurface = surf
  if (!captureAlpha) capturedAlpha = null       // 캡처는 팔이 켠 그 획의 것 — 다음 초안이 지운다
  let box: Bbox
  try { box = paintOne(surf, m, true) }
  catch (e) { surf.restoreSnapshot(); throw e }
  blit(g, surf, box)
  if (captureAlpha) capturedAlpha = { a: surf.alphaMap(), w: surf.layer.w, h: surf.layer.h }
  surf.restoreSnapshot()
}

/** 굽기 — 층을 새로 세우고 획 전부를 차례로 얹은 뒤 한 번 blit. 빈 목록이면 층만 비운다(옛 획의
 *  유령을 지운다 — 이음매가 빈 목록도 넘긴다). */
function drawMany(g: CanvasRenderingContext2D, marks: SeamMark[]): void {
  const surf = surfaceFor(g.canvas, true)
  lastSurface = surf
  capturedAlpha = null
  if (marks.length === 0) return
  let box: Bbox | null = null
  for (const m of marks) {
    const b = paintOne(surf, m, false)
    if (b.x1 >= b.x0) box = box ? union(box, b) : b
  }
  if (box) blit(g, surf, box)
}

export const mypaintRenderer: PaintRenderer = {
  id: 'mypaint',
  draw: drawOne,
  drawMany,
  brushChoices: () => PRESETS.map(p => p.name),
  brushOf: (tool) => tune[tool]?.base ?? DEFAULT_PRESET[tool],
  setBrush: (tool, name) => { if (PRESET_BY_NAME.has(name)) tune[tool] = { ...tune[tool], base: name } },
  params: (tool): ParamDesc[] => {
    const t = tune[tool] ?? {}
    return MUL_KEYS.map(k => ({
      key: k, label: LABELS[k],
      min: k === 'scatterK' || k === 'paperK' || k === 'smudgeK' ? 0 : 0.1,
      max: k === 'paperK' ? 2 : 4, step: 0.05,
      value: t[k] ?? (k === 'paperK' ? TOOL_PAPER[tool] : 1),
    }))
  },
  setParam: (tool, key, value) => { tune[tool] = { ...tune[tool], [key]: value } },
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
        const out: Tune = {}
        for (const [key, val] of Object.entries(v)) {
          if (key === 'base' && typeof val === 'string' && PRESET_BY_NAME.has(val)) out.base = val
          else if ((MUL_KEYS as readonly string[]).includes(key) && typeof val === 'number' && Number.isFinite(val))
            (out as Record<string, number>)[key] = val
        }
        if (Object.keys(out).length > 0) tune[k] = out
      }
    } catch { /* 깨진 저장 — 기본값 */ }
  },
}

// ── 진단(팔·원장이 값으로 본다) ──────────────────────────────────────────────────
/** 마지막 층의 알파 지도(0..1 · 폭·높이) — 게이트 ①④의 «옅은 가장자리»·«덮임» 자 */
export function lastLayerAlphaForTest(): { a: Float32Array; w: number; h: number } | null {
  if (capturedAlpha) return capturedAlpha
  if (!lastSurface) return null
  return { a: lastSurface.alphaMap(), w: lastSurface.layer.w, h: lastSurface.layer.h }
}
export function smudgeStatsForTest(): { fromSnapshot: number; liveTouched: number; liveClean: number } {
  const s = lastSurface
  return s ? { fromSnapshot: s.samplesFromSnapshot, liveTouched: s.samplesLiveTouched, liveClean: s.samplesLiveClean } : { fromSnapshot: 0, liveTouched: 0, liveClean: 0 }
}
export function resetSmudgeStatsForTest(): void {
  const s = lastSurface
  if (s) { s.samplesFromSnapshot = 0; s.samplesLiveTouched = 0; s.samplesLiveClean = 0 }
}
export const premulViolationsForTest = (): number => premulViolationsTotal
/** 프리셋의 기준값 몇(팔이 «빈 자국»의 사유를 값으로 가르는 데 쓴다) */
export function presetBaseForTest(name: string): Record<string, number> | null {
  if (!PRESET_BY_NAME.has(name)) return null
  const b = brushOf(name).brush
  const pick = ['eraser', 'smudge', 'posterize', 'opaque', 'lock_alpha', 'smudge_transparency', 'colorize', 'paint_mode', 'dabs_per_actual_radius', 'dabs_per_basic_radius', 'dabs_per_second', 'tracking_noise']
  return Object.fromEntries(pick.map(k => [k, b.getBaseValue(SETTING_IDX.get(k)!)]))
}
/** 마지막 획의 덮임 캡 최대(«획 불투명도» — 게이트 ④: 자기교차가 이것을 못 넘는다) */
export const lastStrokeCapForTest = (): number => lastSurface?.maxCap ?? 0

/** 탐침(bake62.spec) — 실재 · 결정론 · 비용(면 20×획 40 · 획별) · 보정표 · 층 · 사상 */
export function mypaintProbeForTest(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  out.presets = PRESETS.length
  out.groups = PRESET_CATALOG.map(c => ({ group: c.group, n: c.names.length }))
  const draw1 = (seed: number): { hash: number; ink: number } => {
    const t = document.createElement('canvas')
    t.width = 480; t.height = 240
    const g = t.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, 480, 240)
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i <= 24; i++) pts.push({ x: 40 + i * 16, y: 120 + Math.sin(i / 4) * 30 })
    drawOne(g, { pts, color: '#3a3a44', wPx: 20, seed, tool: 'pencil' })
    const d = g.getImageData(0, 0, 480, 240).data
    let h = 0, ink = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! + d[i + 1]! + d[i + 2]!
      if (v < 740) ink++
      h = (Math.imul(h, 31) + v) | 0
    }
    return { hash: h, ink }
  }
  const a = draw1(7), b = draw1(7), c2 = draw1(8)
  out.markPx = a.ink
  out.deterministic = a.hash === b.hash
  out.seed_differs = a.hash !== c2.hash
  const face = document.createElement('canvas')
  face.width = 512; face.height = 512
  const fg = face.getContext('2d')!
  const tools: Instr58[] = ['pencil', 'cp', 'marker', 'brush']
  for (const tl of tools) calib(DEFAULT_PRESET[tl])
  const mkMarks = (f: number): SeamMark[] => {
    const list: SeamMark[] = []
    for (let s = 0; s < 40; s++) {
      const tl = tools[s % 4]!
      const y = 20 + (s % 20) * 24
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i <= 12; i++) pts.push({ x: 20 + i * 30, y: y + Math.sin(i / 2) * 8 })
      list.push({ pts, color: '#4a4a52', wPx: 16, seed: f * 100 + s, tool: tl })
    }
    return list
  }
  const tA = performance.now()
  for (let f = 0; f < 20; f++) drawMany(fg, mkMarks(f))
  out.bake_stress_20faces_x40strokes_ms = +(performance.now() - tA).toFixed(1)
  const tC = performance.now()
  for (let f = 0; f < 20; f++) drawMany(fg, mkMarks(f).slice(0, 2))
  out.bake_20faces_40strokes_total_ms = +(performance.now() - tC).toFixed(1)
  const tB = performance.now()
  for (let f = 0; f < 2; f++) for (const m of mkMarks(f)) drawOne(fg, m)
  out.bake_perstroke_2x40_ms = +(performance.now() - tB).toFixed(1)
  out.calib = calibForTest()
  out.layers = layerStatsForTest()
  out.mapping = presetMappingForTest()
  out.premul_violations = premulViolationsTotal
  out.speed_px_s = SPEED_PX_S
  return out
}
