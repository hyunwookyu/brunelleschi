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
import { markShape } from '../core/markshapes'
import { C } from '../core/constants'
import { Brush } from '../mypaint/brush'
import { Layer, StrokeSurface, type Bbox, type StrokeOpts } from '../mypaint/surface'
import { PRESETS as MYPAINT_PRESETS, PRESET_GROUPS as MYPAINT_GROUPS, PRESET_SKIPPED_INPUTS, type Preset } from '../mypaint/presets.gen'
import { APP_PRESETS, APP_GROUP } from './brushes64'
import { DEFAULT_BRUSH, defaultBrushOf } from '../core/paintseam'
/** 브러시 전부 — mypaint 196(CC0 · 값을 짓지 않는다) + 앱 프리셋(web2-64 — 색연필의 성질로 지은 것 · brushes64.ts가 사유·값). */
export const PRESETS: readonly Preset[] = [...MYPAINT_PRESETS, ...APP_PRESETS]
export const PRESET_GROUPS: readonly string[] = [APP_GROUP, ...MYPAINT_GROUPS]
import { SETTINGS, INPUTS, S } from '../mypaint/settings.gen'
import { hexToLinear, rgbToHsv } from '../mypaint/helpers'
import { grainTile, grainTileN, grainSource, GRAIN_DEPTH, setPaperHeightTile, paperHeightLoaded } from '../mypaint/paper'
import { tipAtlas, tipsReady, tipsLoadError, paperHeightTile, TIP_CHOICES, type TipAtlas } from '../mypaint/tips'

/** 엔진(brush.ts·surface.ts)이 읽는 설정 수 — 65 중 64(restore_color는 원문 mypaint-brush.c도 안 읽는다 · 앱의 것).
 *  단위(mypaint62b.test)가 소스를 훑어 이 수와 대조한다 — 게이트 ⑥ «사상»의 값(원장 probe.mapping.engine_reads). */
export const ENGINE_SETTINGS_READ = 64
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

// ── 도구 슬롯 → 기본 브러시 — **web2-64: core(paintseam.DEFAULT_BRUSH)로 이사했다**(옛 문서 이주가 엔진 없이 이름을 알아야 한다).
// 값의 사유는 62 그대로(AS-C186 · 마커 = 딱딱한 불투명 블록 — tanda/marker-01은 paint50 ④의 원근 자가 먼 끝을 잃었다 1.46~1.58 vs 1.24) ·
// 색연필만 64-2가 앱 프리셋(brunelleschi/colored_pencil)으로 바꿨다. 이 이름들은 «되내보내기»다(옛 팔·고르개의 import 자리 무변).
export { pencilOfGrade } from '../core/paintseam'
export const DEFAULT_PRESET: Readonly<Record<Instr58, string>> = DEFAULT_BRUSH
/** 도구 캡(획 불투명도 상한 — 46·50 계약 상수 그대로) */
const TOOL_CAP: Record<Instr58, number> = { pencil: 1, brush: 1, marker: C.PAINT_MARKER_ALPHA, cp: C.PAINT_CP_ALPHA }
/** 종이 결 기본(paperK 1 = 깊이 GRAIN_DEPTH · 마커는 결 없음 — 61 그대로). cp는 아래 «문턱 판»이 따로 든다(64-2). */
const TOOL_PAPER: Record<Instr58, number> = { pencil: 1, brush: 1, marker: 0, cp: 1 }
/** web2-64 64-2 색연필 — 안료가 종이 **봉우리에만** 얹힌다(구멍): 결 타일을 «문턱 판»으로 바꾼다 — 골(타일 > 문턱)은 1(깊이 1이면 도장 알파 0 =
 *  구멍) · 봉우리는 타일 × .35(옅은 결). 압력이 알파가 아니라 **문턱을 내린다**(버니싱 — 지시 문면 · 60의 cpBurnish 자리): 문턱 = .5 + .5·p̄
 *  (획 평균 압력 · 저압 .2 → 구멍 40% · .6 → 20% · 1 → 0%). 엔진의 결 곱(1 − 깊이 × 타일)은 62 그대로 — 판의 «값»만 바뀐다(paper.ts와 같은
 *  자리 · 매핑). 문턱은 .05 눈금으로 양자화해 판을 캐시한다(1024² 판 하나 4 MB · 최대 넷). */
const CP_PEAK_K = 0.35
const cpThresholdOf = (press: number[] | null | undefined): number => {
  if (!press || press.length === 0) return 0.75                     // 압력 없음(마우스 .5 상수의 자리)
  let s = 0
  for (const v of press) s += Math.min(1, Math.max(0, v / C.PRESS_Q))
  return Math.round((0.5 + 0.5 * (s / press.length)) * 20) / 20
}
const cpTiles = new Map<number, Float32Array>()
function cpGrainTile(th: number): Float32Array {
  const hit = cpTiles.get(th)
  if (hit) return hit
  const src = grainTile()
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = src[i]! > th ? 1 : src[i]! * CP_PEAK_K
  if (cpTiles.size >= 4) cpTiles.delete(cpTiles.keys().next().value!)
  cpTiles.set(th, out)
  return out
}
/** 진단·반증 — 결 판이 바뀌면(paper61 스위치 등) 캐시를 비운다 */
export function resetCpTilesForTest(): void { cpTiles.clear() }

// ── 사람 조정(작업대·고르개 — 기기 저장) ────────────────────────────────────────
interface Tune {
  base?: string          // 슬롯에 앉힌 브러시 이름
  sizeK?: number         // 굵기 배수
  opacityK?: number      // 불투명 배수
  spacingK?: number      // 도장 간격 배수(dabs_per_* ÷ 배수)
  scatterK?: number      // 산포 배수(offset_by_random ×)
  smudgeK?: number       // 스머지 배수(smudge ×)
  paperK?: number        // 종이 결 깊이 배수(0 = 없음)
  tip?: string           // web2-63 — 슬롯의 팁('none' = 절차 타원 · 이름 = 아틀라스 · 없으면 프리셋 기본 표)
}

// ── web2-63 팁 기본 표(프리셋 → 팁) — 마른 매체만. 잉크·마커·에어브러시·둥근 붓은 팁 없음(62 경로 = ⑤ 무회귀 대상) ──
//   정확 이름이 먼저, 없으면 이름 무늬. 슬롯 조정(tune.tip)이 있으면 그것이 이긴다.
const TIP_EXACT: Record<string, string> = {
  'classic/charcoal': 'chalk-chisel', 'tanda/charcoal-01': 'chalk-chisel', 'tanda/charcoal-03': 'chalk-chisel', 'tanda/charcoal-04': 'chalk-chisel',
  'ramon/Pastel_1': 'rock-pitted', 'deevad/chalk': 'rock-pitted',
  'classic/dry_brush': 'scratches-rough',
  'ramon/B-pencil': 'scratches2',            // 63의 색연필 슬롯(빗금 이빨)
  'brunelleschi/colored_pencil': 'scratches2',   // 64-2 — 앱 색연필도 같은 팁(이름에 pencil이 들어 fine-grain으로 떨어지지 않게 정확 이름으로)
}
export function tipDefaultOf(preset: string): string | null {
  const e = TIP_EXACT[preset]
  if (e) return e
  if (/pencil/i.test(preset)) return 'fine-grain'
  return null
}
/** 자국의 팁 이름을 푼다(값으로 — 진단·보정 열쇠): mark.tip > 슬롯 조정 > 프리셋 기본 · 'none'/null = 없음 */
function tipNameFor(m: { tool: Instr58; tip?: string }, preset: string): string | null {
  if (tipsOff) return null
  const pick = m.tip !== undefined ? m.tip : (tune[m.tool]?.tip !== undefined ? tune[m.tool]!.tip! : tipDefaultOf(preset))
  return pick === null || pick === 'none' || pick === undefined ? null : pick
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
let fringeBreak: boolean | 'dark' = false
export function setFringeBreakForTest(v: boolean | 'dark'): void { fringeBreak = v }
let paintModeOff = false
export function setPaintModeOffForTest(v: boolean): void { paintModeOff = v }
let smudgeOff = false
export function setSmudgeOffForTest(v: boolean): void { smudgeOff = v }
/** 반증(AS-C184) — 이벤트마다 «고정» dtime(ms). 느린 몸짓(점이 촘촘한 끝)에 시간이 더 실려 dabs_per_second
 *  붓의 끝이 뭉친다(58 사람 계약의 그 증상). 제품은 null(걸음 ÷ 일정 속도). */
let eventDtimeMs: number | null = null
export function setEventDtimeForTest(ms: number | null): void { eventDtimeMs = ms }
/** 반증(grain61 ⑥ — 자가 보정이 게이트의 자(반최대 폭)와 같은 양을 푼다는 자기참조 물음): 보정을 끄면 반지름 = 폭/2 —
 *  프리셋의 마스크·산포에 따라 반최대 폭이 요청에서 벗어나야 한다(벗어나면 보정이 «무엇인가를 한다»는 실증). */
let calibOff = false
export function setCalibOffForTest(v: boolean): void { calibOff = v }
/** 63 반증 — 팁 전부 끔(절차 타원 = 62 경로) */
let tipsOff = false
export function setTipsOffForTest(v: boolean): void { tipsOff = v }
/** 63 반증(② 도장 반복) — 판 고정(≥ 0) · −1 = 돌려 쓴다 */
let tipFrameLock = -1
export function setTipFrameLockForTest(v: number): void { tipFrameLock = v }
/** 63 진단 — 팁 로드 상태·계수기(#105: 폴백은 값으로 보인다) */
let tipMissing = 0
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
/** web2-64 64-5 — 프리셋 하나의 사상 통계(설정·곡선·미지) + 기준값 몇(opaque·smudge·smudge_length·opaque_multiply) */
export function presetStatsForTest(name: string): { known: boolean; settings: number; curves: number; unknownSettings: string[]; unknownInputs: string[]; base: Record<string, number> } | null {
  if (!PRESET_BY_NAME.has(name)) return null
  const l = brushOf(name)
  const pick = ['opaque', 'opaque_multiply', 'opaque_linearize', 'smudge', 'smudge_length', 'radius_logarithmic', 'hardness', 'dabs_per_basic_radius', 'dabs_per_actual_radius', 'eraser']
  return { known: true, settings: l.stats.settings, curves: l.stats.curves, unknownSettings: [...l.stats.unknownSettings], unknownInputs: [...l.stats.unknownInputs],
    base: Object.fromEntries(pick.map(k => [k, l.brush.getBaseValue(SETTING_IDX.get(k)!)])) }
}
/** 진단 — 사상 통계(게이트 ⑥): 프리셋 전부를 실어 설정·곡선 수와 미지 항목을 센다 */
export function presetMappingForTest(): { presets: number; settings: number; curves: number; unknownSettings: number; unknownInputs: Record<string, number>; skipped: Record<string, number>; engine_reads: number; engine_reads_of: number } {
  let settings = 0, curves = 0, unknownSettings = 0
  const unknownInputs: Record<string, number> = {}
  for (const p of MYPAINT_PRESETS) {                  // 사상 통계는 mypaint 196의 것(앱 프리셋은 62 게이트 ⑥의 모집단 밖)
    const l = brushOf(p.name)
    settings += l.stats.settings; curves += l.stats.curves; unknownSettings += l.stats.unknownSettings.length
    for (const k of l.stats.unknownInputs) unknownInputs[k] = (unknownInputs[k] ?? 0) + 1
  }
  return { presets: MYPAINT_PRESETS.length, settings, curves, unknownSettings, unknownInputs, skipped: PRESET_SKIPPED_INPUTS, engine_reads: ENGINE_SETTINGS_READ, engine_reads_of: SETTINGS.length }
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
/** web2-64 64-4 — 팁 농도 계수(gain): **팁 판의 값을 g배**(1로 자름 · 마스크 눈금)해 같은 설정에서 팁 켬의 몸통 평균 알파가 팁 끔(절차 타원)과
 *  같아지게 한다. 팁은 «어디에 얹히나»만 정해야 하고(63 DECISIONS) «얼마나 진한가»는 절차와 같아야 한다(지시 64-4 «농도만 맞춘다»).
 *  마스크 눈금이면 성격(구멍 = 0인 자리)은 그대로다. ⚠ 첫 판(불투명 곱 opacityK)은 포화 프리셋(파스텔 opaque 1)에서 아무것도 못 했다(실측
 *  gain 2.15 · 비 .87 그대로) — 그래서 눈금을 «판»에 건다. 값은 고정점 반복(≤ 4회 · 비 → g × 절차/팁)으로 찾고 ok:false = 못 쟀다(#105 표식).
 *  잰 값(meanTip·meanProc·반복 수)을 표에 남긴다 — 게이트 ⑤(±5%)가 굵기 셋에서 다시 잰다. */
interface Calib { a: number; b: number; ok: boolean; w1: number; w2: number; gain?: number; gainOk?: boolean; meanTip?: number; meanProc?: number; gainIters?: number; meanTipRaw?: number }
const TIP_GAIN_MAX = 6
const TIP_GAIN_MIN = 0.25
let tipGainOff = false
/** 64-4 반증(D-3) — 농도 보정 끔 → 63의 옅음(−14%)이 돌아온다 */
export function setTipGainOffForTest(v: boolean): void { tipGainOff = v; calibs.clear() }
/** 눈금 판(팁 × g) — 열쇠 이름|g(두 자리) · 원본은 안 바꾼다(63 팁 원장·사진의 판이 그대로다) */
const scaledTips = new Map<string, TipAtlas>()
function scaledTip(t: TipAtlas, g: number): TipAtlas {
  if (Math.abs(g - 1) < 1e-4) return t
  const key = t.name + '|' + g.toFixed(2)
  const hit = scaledTips.get(key)
  if (hit) return hit
  const data = new Float32Array(t.data.length)
  for (let i = 0; i < data.length; i++) data[i] = Math.min(1, t.data[i]! * g)
  const out: TipAtlas = { ...t, data }
  if (scaledTips.size > 24) scaledTips.delete(scaledTips.keys().next().value!)
  scaledTips.set(key, out)
  return out
}
const calibs = new Map<string, Calib>()
const CAL_W = 512, CAL_H = 192, CAL_R1 = 6, CAL_R2 = 24
let calSurface: StrokeSurface | null = null

function measureHalfMaxWidth(name: string, radius: number, tip: TipAtlas | null): number {
  if (!calSurface) calSurface = new StrokeSurface(new Layer(CAL_W, CAL_H))
  const surf = calSurface
  surf.layer.clear()
  const l = brushOf(name)
  restoreBase(l)
  l.brush.setBaseValue(S.RADIUS_LOGARITHMIC, Math.log(radius))
  // 색은 검정 — 폭은 알파로 잰다
  l.brush.setBaseValue(S.COLOR_H, 0); l.brush.setBaseValue(S.COLOR_S, 0); l.brush.setBaseValue(S.COLOR_V, 0)
  l.brush.setRng(rng32(62))
  surf.beginStroke({ cap: 1, capExact: false, opacityK: 1, capOff: false, grain: null, grainN: 1, grainDepth: 0, snapshotAll: false, smudgeSnapshot: true, rng: rng32(63), tip, tipFrameLock: -1 })
  runStroke(l.brush, surf, Array.from({ length: 61 }, (_, k) => ({ x: 40 + (k / 60) * 432, y: CAL_H / 2 })), null, 0.5)
  surf.endStroke()
  restoreBase(l)
  const a = surf.alphaMap()
  const widths: number[] = []
  // 63: 팁 판은 희소(구멍·점열)라 «반최대 폭»이 판의 몇 픽셀만 세어 반지름을 부풀린다(파스텔 실측 — 폭 20 요청이 판 폭 3배로) →
  //   팁이면 «범위 폭»(열 최대의 25% 위 — 10%는 부드러운 판의 발치까지 세어 요청 폭 20이 반최대 10으로 보였다 · 실측)을 잰다. 절차 타원은 62의 반최대 그대로(⑤ 무회귀). 어느 자였는지는 calib_def에.
  const frac = tip ? 0.25 : 0.5
  for (let x = 120; x < 392; x += 2) {
    let mx = 0
    for (let y = 0; y < CAL_H; y++) mx = Math.max(mx, a[y * CAL_W + x]!)
    if (mx < 0.02) continue
    const th = mx * frac
    let n = 0
    for (let y = 0; y < CAL_H; y++) if (a[y * CAL_W + x]! > th) n++
    widths.push(n)
  }
  widths.sort((p, q) => p - q)
  return widths.length ? widths[Math.floor(widths.length / 2)]! : 0
}
/** 64-4 — 몸통 평균 알파(직선 견본 · 반지름 r · 압력 .5): 열마다 «열 최대의 25% 위» 대역의 알파 평균(팁 자·절차 자에 같은 대역 정의 —
 *  두 판을 같은 자로 잰다 #103). 빈 판(열 최대 < .02 전부)이면 0. */
const GAIN_W = 480, GAIN_H = 240
let gainSurface: StrokeSurface | null = null
function measureBodyMean(name: string, radius: number, tip: TipAtlas | null): number {
  // 견본 = 게이트 ⑤의 그것과 같은 함수(core/markshapes line · 480×240 · 압력 .6 상수) — 자가 갈리면 계통 편차가 난다(첫 판 실측 +6%)
  if (!gainSurface) gainSurface = new StrokeSurface(new Layer(GAIN_W, GAIN_H))
  const surf = gainSurface
  const CAL_W = GAIN_W, CAL_H = GAIN_H
  surf.layer.clear()
  const l = brushOf(name)
  restoreBase(l)
  l.brush.setBaseValue(S.RADIUS_LOGARITHMIC, Math.log(radius))
  l.brush.setBaseValue(S.COLOR_H, 0); l.brush.setBaseValue(S.COLOR_S, 0); l.brush.setBaseValue(S.COLOR_V, 0)
  l.brush.setRng(rng32(62))
  // 결 켬(제품 기본 깊이 GRAIN_DEPTH — 팁과 결이 곱해지는 그 자리에서 잰다 · 결 없이 재면 게이트 ⑤와 계통이 어긋났다: 실측 .94~.98)
  surf.beginStroke({ cap: 1, capExact: false, opacityK: 1, capOff: false, grain: grainTile(), grainN: grainTileN(), grainDepth: GRAIN_DEPTH, snapshotAll: false, smudgeSnapshot: true, rng: rng32(63 ^ 0x5bd1e995), tip, tipFrameLock: -1 })
  runStroke(l.brush, surf, markShape('line', GAIN_W, GAIN_H).pts, null, 0.6)
  surf.endStroke()
  restoreBase(l)
  const a = surf.alphaMap()
  // 대역 = paint63 ① STATS의 그 정의(#103 — 같은 자): 열마다 어둡기 > 16/255인 위·아래 가장자리 → 중앙값 안쪽 3px 띠의 알파 평균
  const X0 = 80, X1 = GAIN_W - 80, TH = 16 / 255
  const tops: number[] = [], bots: number[] = []
  for (let x = X0; x < X1; x++) {
    let t = -1, b = -1
    for (let y = 0; y < CAL_H; y++) { if (a[y * CAL_W + x]! > TH) { if (t < 0) t = y; b = y } }
    if (t >= 0) { tops.push(t); bots.push(b) }
  }
  if (tops.length < 40) return 0
  const med = (arr: number[]): number => { const s = [...arr].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]! }
  const yT = med(tops) + 3, yB = med(bots) - 3
  if (yB < yT) return 0
  // 잰 값은 **sRGB 어둡기**(흰 판 위 검정 — 사람 눈·게이트의 눈금)다: 층 알파의 평균으로 맞추면 팁(값이 흩어진 판)과 절차(고른 판)가
  // 비선형 부호화에서 갈린다(첫 판 실측 — 파스텔 알파 평균 ±1% 맞춤이 어둡기 평균에서 −9%).
  const srgb = (lin: number): number => lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055
  let sum = 0, n = 0
  for (let y = yT; y <= yB; y++) for (let x = X0; x < X1; x++) { sum += 1 - srgb(1 - a[y * CAL_W + x]!); n++ }
  return n > 0 ? sum / n : 0
}
function calib(name: string, tipName: string | null = null): Calib {
  // 63: 열쇠에 팁이 든다(같은 프리셋도 팁이 다르면 반최대 폭이 다르다 — #105) · 아틀라스가 아직 없으면 절차 판의 열쇠
  const tip = tipName ? tipAtlas(tipName) : null
  const key = tip ? name + '|' + tipName : name
  const hit = calibs.get(key)
  if (hit) return hit
  const w1 = measureHalfMaxWidth(name, CAL_R1, tip), w2 = measureHalfMaxWidth(name, CAL_R2, tip)
  const ok = w1 > 0 && w2 > 0
  // a·b는 기록(두 점의 기울기·절편 — 산포 붓의 절편이 얼마나 큰지 원장이 본다) · 되풀이는 아래 radiusFor
  const a = (w2 - w1) / (CAL_R2 - CAL_R1)
  const b = w1 - a * CAL_R1
  // ⚠ #105 — 실패는 그럴듯한 값이 아니라 표식이다: ok:false면 반지름 = 폭/2(기하 그대로)를 쓰되 표에 남긴다
  const c: Calib = { a, b, ok, w1, w2 }
  // 64-4 — 팁이 든 열쇠는 농도 계수도 잰다: 절차 판(팁 없음)의 몸통 평균을 목표로 판 눈금 g를 고정점 반복(같은 프리셋 · 반지름 = 요청 폭 20의
  // 그것 · 압력 .6 — 게이트 ⑤의 가운데 점). 비가 ±1% 안이면 멈춘다.
  if (tip && !tipGainOff) {
    const r20 = radiusFor(c, 20)
    const meanProc = measureBodyMean(name, r20, null)
    const meanRaw = measureBodyMean(name, r20, tip)
    let g = 1, meanTip = meanRaw, iters = 0
    if (meanProc > 1e-4 && meanRaw > 1e-4) {
      for (; iters < 10; iters++) {
        const ratio = meanTip / meanProc
        if (Math.abs(ratio - 1) < 0.01 || (g >= TIP_GAIN_MAX && ratio < 1) || (g <= TIP_GAIN_MIN && ratio > 1)) break
        g = Math.min(TIP_GAIN_MAX, Math.max(TIP_GAIN_MIN, g * (meanProc / Math.max(1e-4, meanTip))))
        meanTip = measureBodyMean(name, r20, scaledTip(tip, g))
      }
    }
    c.gainOk = meanProc > 1e-4 && meanRaw > 1e-4
    c.gain = c.gainOk ? g : 1                                   // ok:false면 1이되 표식이 남는다(#105)
    c.meanProc = +meanProc.toFixed(4); c.meanTipRaw = +meanRaw.toFixed(4); c.meanTip = +meanTip.toFixed(4); c.gainIters = iters
  }
  calibs.set(key, c)
  return c
}
/** 64-4 — 자국의 팁(눈금 판): 보정 끔이면 원본 · 켬이면 계수 g의 판 */
function tipFor(name: string, tipName: string, t: TipAtlas): TipAtlas {
  if (tipGainOff || calibOff) return t
  return scaledTip(t, calib(name, tipName).gain ?? 1)
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
function radiusLogFor(name: string, wPx: number, tipName: string | null = null): number {
  if (calibOff) return Math.log(Math.max(0.15, wPx / 2))
  return Math.log(radiusFor(calib(name, tipName), wPx))
}
export const calibForTest = (): Record<string, Calib> => Object.fromEntries(calibs)

// ── web2-63 팁·종이 진단·배선 ─────────────────────────────────────────────────────
/** 부팅 로드 뒤 한 번(main) — 종이 높이맵을 paper.ts에 꽂고 보정표를 비운다(팁이 있는 열쇠가 새로 선다) */
export function onTipAssetsLoaded(): void {
  const p = paperHeightTile()
  if (p && !paperHeightLoaded()) setPaperHeightTile(p.data, p.n)
  calibs.clear()
}
export function tipsReadyForTest(): { ready: boolean; error: string | null; paper: string; missing: number } {
  return { ready: tipsReady(), error: tipsLoadError(), paper: grainSource(), missing: tipMissing }
}
/** 마지막 표면의 팁 계수기(도장 수 · 판 히스토그램) + 푼 팁 이름(도구별 기본) */
export function tipStatsForTest(): { dabs: number; frames: number[]; missing: number; defaults: Record<string, string | null> } {
  const s = lastSurface
  const defaults: Record<string, string | null> = {}
  for (const tl of ['pencil', 'cp', 'marker', 'brush'] as Instr58[]) defaults[tl] = tipNameFor({ tool: tl }, tune[tl]?.base ?? DEFAULT_PRESET[tl])
  return { dabs: s?.tipDabs ?? 0, frames: s ? [...s.tipFrames] : [], missing: tipMissing, defaults }
}
export function resetTipStatsForTest(): void { const s = lastSurface; if (s) { s.tipDabs = 0; s.tipFrames.fill(0) } }
/** 프리셋의 팁 이름(기본 표 · 슬롯 조정 무시) — 팔이 «누가 팁을 받는가»를 값으로 본다 */
export const tipDefaultOfForTest = (preset: string): string | null => tipDefaultOf(preset)

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

/** 진단(#105) — 획이 든 브러시 id를 엔진이 «모른» 횟수(슬롯 기본으로 떨어졌다 — 조용한 폴백 ⛔ · 값으로 보인다) */
let unknownBrushIds = 0
export const unknownBrushIdsForTest = (): number => unknownBrushIds
function presetOf(m: SeamMark): string {
  if (m.preset) {
    if (PRESET_BY_NAME.has(m.preset)) return m.preset
    unknownBrushIds++
  }
  const t = tune[m.tool]
  if (t?.base && PRESET_BY_NAME.has(t.base)) return t.base
  return defaultBrushOf(m.tool, m.grade)
}

function paintOne(surf: StrokeSurface, m: SeamMark, draft: boolean): Bbox {
  const name = presetOf(m)
  const l = brushOf(name)
  const t = tune[m.tool] ?? {}
  const flat = (markerFlatForTest() && m.tool === 'marker') || paintOpaqueForTest()
  restoreBase(l)
  const b = l.brush
  // 크기(자가 보정 위에 배수) · 색(선형광 → HSV 기준값)
  const tipName = flat ? null : tipNameFor(m, name)
  const tipRaw = tipName ? tipAtlas(tipName) : null
  if (tipName && !tipRaw) tipMissing++                    // 아틀라스 미로드 — 절차 타원으로(값으로 남는다 · #105)
  b.setBaseValue(S.RADIUS_LOGARITHMIC, radiusLogFor(name, Math.max(0.5, m.wPx * (t.sizeK ?? 1)), tipRaw ? tipName : null))
  const tip = tipRaw && tipName ? tipFor(name, tipName, tipRaw) : null   // 64-4 — 농도 눈금 판(보정 열쇠와 같은 프리셋|팁)
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
  // #108(web2-63): 팔·실험실 전용 통로라 관용이 필요 없다 — 모르는 키는 던진다(dab_angle 오타가 조용히 무시돼 게이트 ④가 항등이 됐다)
  if (m.over) for (const [k, val] of Object.entries(m.over)) { const si = SETTING_IDX.get(k); if (si === undefined) throw new Error(`mypaint over: 모르는 설정 키 ${k}(원문 이름은 settings.gen.ts)`); b.setBaseValue(si, val) }
  if (paintModeOff) b.setBaseValue(S.PAINT_MODE, 0)
  if (smudgeOff) b.setBaseValue(S.SMUDGE, 0)
  if (flat) { b.setBaseValue(S.OPAQUE, 1); b.setBaseValue(S.HARDNESS, 1); b.setBaseValue(S.OPAQUE_LINEARIZE, 0) }
  b.setRng(rng32(m.seed))
  const paperK = grainOffForTest() || flat ? 0 : (t.paperK ?? TOOL_PAPER[m.tool])
  // 64-2 — 색연필 슬롯: 문턱 판(구멍) · 깊이 1(골 = 알파 0). 슬롯 조정 paperK 0이면 결 없음 그대로.
  const cpTh = m.tool === 'cp' && paperK > 0 ? cpThresholdOf(pressFlatForTest() ? null : m.press) : null
  const opts: StrokeOpts = {
    cap: flat ? 1 : TOOL_CAP[m.tool],
    capExact: !flat && m.tool === 'marker',          // 마커 한 획 알파 = C.PAINT_MARKER_ALPHA(46 계약 · 61 그대로)
    opacityK: flat ? 1 : (t.opacityK ?? 1) * (m.opacityK ?? 1),   // web2-64: 획의 불투명(paint.o) × 슬롯 조정 배수(팁 농도는 판의 눈금 — tipFor)
    capOff: capOffOverride,
    grain: cpTh !== null ? cpGrainTile(cpTh) : paperK > 0 ? grainTile() : null,
    grainN: grainTileN(),
    grainDepth: cpTh !== null ? 1 : Math.min(1, GRAIN_DEPTH * paperK),
    tip,
    tipFrameLock,
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
  tipChoices: () => TIP_CHOICES,
  tipOf: (tool) => tune[tool]?.tip ?? null,
  setTip: (tool, name) => {
    if (name === null) { const t = { ...tune[tool] }; delete t.tip; tune[tool] = t }
    else if (name === 'none' || TIP_CHOICES.includes(name)) tune[tool] = { ...tune[tool], tip: name }
  },
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
          else if (key === 'tip' && typeof val === 'string' && (val === 'none' || TIP_CHOICES.includes(val))) out.tip = val
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
  out.calib_def = '프리셋별 {w1,w2,ok,a,b}: w1·w2 = 반지름 6·24의 직선 견본 반최대 폭(px) · ok = 둘 다 > 0. 요청 폭 → 반지름은 «구간별 비례·로그 보간»(w ≤ w1: r = w·6/w1 · w ≥ w2: r = w·24/w2 · 사이: 로그 보간 — 절편 없음). a·b는 초판 선형 맞춤의 기울기·절편 «기록»(산포 붓의 절편이 얼마나 컸는지 — 2차 리뷰어 [12]) · 쓰이지 않는다. ok:false = 반지름 = 폭/2(#105 표식)'
  out.layers = layerStatsForTest()
  out.mapping = presetMappingForTest()
  out.premul_violations = premulViolationsTotal
  out.speed_px_s = SPEED_PX_S
  return out
}
