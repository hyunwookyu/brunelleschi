// libmypaint mypaint-brush.c의 이식(web2-62 · ISC — 사본 COPYING.libmypaint).
//
// 상태기계 그대로다: 설정 65(Mapping) · 상태 44 · 입력 18 · 스머지 버킷 256(각 9칸) ·
// stroke_to의 도장 걸음(count_dabs_to · 선형 보간) · update_states_and_setting_values의 입력
// 정규화(마법 상수 — «정리하지 않는다» 지시 문면) · prepare_and_draw_dab(opaque_linearize ·
// 방향 오프셋 · 스머지 갱신/적용 · 색 동역학 · AA 하드니스 보정 · 픽셀 스냅).
//
// 갈아 끼운 것 하나: 난수. rng-double.c(Knuth)는 «결정론»이 목적이므로 이 저장소의 rng32
// (시드 = 획 id — §5 Math.random ⛔)를 받는다. 시퀀스가 C와 같지는 않다(D-4에 기록).
//
// 버린 것: 대칭(mypaint-symmetry) · print_inputs · 획 분할(stroke_to의 반환 — 값은 내되 안 쓴다) ·
// json-c 로더(프리셋은 presets.gen.ts가 이미 JSON이다 — loadPreset).

import { S, I, ST, SETTINGS, SETTINGS_COUNT, INPUTS_COUNT, STATES_COUNT } from './settings.gen'
import { Mapping } from './mapping'
import {
  clamp, modArith, smallestAngularDifference, randGauss, RADIANS, DEGREES,
  rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, mixColors, WGM_EPSILON,
} from './helpers'
import type { Preset } from './presets.gen'

const ACTUAL_RADIUS_MIN = 0.2
const ACTUAL_RADIUS_MAX = 1000
const GRID_SIZE = 256.0

// 스머지 버킷 칸(mypaint-brush.c enum)
const SMUDGE_R = 0, SMUDGE_G = 1, SMUDGE_B = 2, SMUDGE_A = 3
const PREV_COL_R = 4, PREV_COL_G = 5, PREV_COL_B = 6, PREV_COL_A = 7, PREV_COL_RECENTNESS = 8
const SMUDGE_BUCKET_SIZE = 9
const NUM_BUCKETS = 256

/** 도장을 받는 표면 — mypaint_surface_draw_dab / get_color의 자리. capTarget은 이 이식의
 *  덧(획 안 덮임 캡 — 선형화 «전» 목표 불투명도 · 지시 62 「획 안은 안 쌓인다」). */
export interface DabSurface {
  drawDab(
    x: number, y: number, radius: number,
    colorR: number, colorG: number, colorB: number,
    opaque: number, hardness: number, softness: number, colorA: number,
    aspectRatio: number, angle: number,
    lockAlpha: number, colorize: number, posterize: number, posterizeNum: number,
    paint: number, capTarget: number,
  ): boolean
  getColor(x: number, y: number, radius: number, paint: number): [number, number, number, number]
}

export class Brush {
  readonly settings: Mapping[] = []
  readonly settingsValue = new Float32Array(SETTINGS_COUNT)
  readonly states = new Float64Array(STATES_COUNT)
  readonly smudgeBuckets = new Float32Array(NUM_BUCKETS * SMUDGE_BUCKET_SIZE)
  private minBucketUsed = -1
  private maxBucketUsed = -1
  private randomInput = 0
  private skip = 0
  private skipLastX = 0
  private skipLastY = 0
  private skippedDtime = 0
  private readonly speedMappingGamma = [0, 0]
  private readonly speedMappingM = [0, 0]
  private readonly speedMappingQ = [0, 0]
  private resetRequested = true
  private strokeTotalPaintingTime = 0
  private strokeCurrentIdlingTime = 0
  /** 결정론 난수 — 획마다 setRng(rng32(seed)) */
  rng: () => number = () => 0.5
  private readonly inputs = new Float32Array(INPUTS_COUNT)

  constructor() {
    for (let i = 0; i < SETTINGS_COUNT; i++) this.settings.push(new Mapping(INPUTS_COUNT))
    this.reset()
    this.newStroke()
    this.settingsBaseValuesHaveChanged()
    this.resetRequested = true
  }

  // ── 상태 접근(C 매크로 STATE/SETTING/BASEVAL) ────────────────────────────────
  private st(i: number): number { return this.states[i]! }
  private setSt(i: number, v: number): void { this.states[i] = v }
  private sv(i: number): number { return this.settingsValue[i]! }
  private base(i: number): number { return this.settings[i]!.baseValue }

  setRng(rng: () => number): void { this.rng = rng }

  reset(): void {
    this.skip = 0; this.skipLastX = 0; this.skipLastY = 0; this.skippedDtime = 0
    this.states.fill(0)
    this.setSt(ST.FLIP, -1)
    if (this.minBucketUsed !== -1) {
      const lo = this.minBucketUsed * SMUDGE_BUCKET_SIZE
      const hi = (this.maxBucketUsed + 1) * SMUDGE_BUCKET_SIZE
      this.smudgeBuckets.fill(0, lo, hi)
      this.minBucketUsed = -1; this.maxBucketUsed = -1
    }
  }

  /** mypaint_brush_reset — 다음 strokeTo가 지금 상태와 무관할 때(획 시작) */
  requestReset(): void { this.resetRequested = true }

  /** 획 시작을 (x,y)에 «못 박는다» — 이 이식의 덧(결정론 · D-4 기록). C 원문은 리셋 «전»에 느린 추적
   *  (slow_tracking)·추적 잡음이 앞 획의 마지막 X/Y와 새 첫 점을 섞어, 같은 획·같은 시드라도 앞 획에 따라
   *  첫 점이 달라진다(deevad/spray·classic/charcoal — 실측: 같은 시드 셋이 도장 364·387·341). 상태를 비우고
   *  X/Y를 첫 점에 두면 그 섞임이 항등이 된다(x = x0 + (x0 − x0)·fac). 리셋 요청은 그대로 두어 원문의
   *  리셋 갈래(random_input 새로 · STROKE 1.0)가 첫 이벤트에서 그대로 돈다. */
  primeAt(x: number, y: number, speed = 0): void {
    this.reset()
    this.setSt(ST.X, x); this.setSt(ST.Y, y)
    this.setSt(ST.ACTUAL_X, x); this.setSt(ST.ACTUAL_Y, y)
    // 속도 저역 필터를 «정상 상태»에서 시작한다(이 이식의 시각은 일정 속도 합성이라 정상 상태 = 그 속도 —
    // AS-C184). 원문은 0에서 출발해 speed2_slowness(.8s)만큼 오르는데, 합성 속도 300 px/s에서는 그 오르막이
    // 240px이라 속도 곡선 붓(tanda/marker-01의 radius↔speed2)의 획 «머리»가 통째로 빠졌다(paint50 ④ 실측 —
    // 띠가 css 600부터 시작 · 480~600 없음).
    this.setSt(ST.NORM_SPEED1_SLOW, speed); this.setSt(ST.NORM_SPEED2_SLOW, speed)
    this.resetRequested = true
  }

  newStroke(): void { this.strokeCurrentIdlingTime = 0; this.strokeTotalPaintingTime = 0 }

  setBaseValue(id: number, value: number): void {
    this.settings[id]!.baseValue = value
    this.settingsBaseValuesHaveChanged()
  }
  getBaseValue(id: number): number { return this.settings[id]!.baseValue }
  setMappingN(id: number, input: number, n: number): void { this.settings[id]!.setN(input, n) }
  getMappingN(id: number, input: number): number { return this.settings[id]!.getN(input) }
  setMappingPoint(id: number, input: number, index: number, x: number, y: number): void {
    this.settings[id]!.setPoint(input, index, x, y)
  }
  isConstant(id: number): boolean { return this.settings[id]!.isConstant() }
  getState(i: number): number { return this.states[i]! }

  /** mypaint_brush_from_defaults — 곡선 전부 걷고 기본값 + opaque_multiply의 압력 곡선 */
  fromDefaults(): void {
    for (let s = 0; s < SETTINGS_COUNT; s++) {
      for (let i = 0; i < INPUTS_COUNT; i++) this.settings[s]!.setN(i, 0)
      this.settings[s]!.baseValue = SETTINGS[s]!.def
    }
    this.settings[S.OPAQUE_MULTIPLY]!.setN(I.PRESSURE, 2)
    this.settings[S.OPAQUE_MULTIPLY]!.setPoint(I.PRESSURE, 0, 0, 0)
    this.settings[S.OPAQUE_MULTIPLY]!.setPoint(I.PRESSURE, 1, 1, 1)
    this.settingsBaseValuesHaveChanged()
  }

  /** 프리셋(.myb version 3 — presets.gen.ts의 압축 꼴)을 싣는다. 기본값에서 출발해(from_defaults)
   *  프리셋의 설정을 덮는다 — libmypaint의 from_string과 같은 결과. 돌려주는 값은 사상 통계
   *  (게이트 ⑥ «설정 전부 사상 · 누락 0»의 자). */
  loadPreset(p: Preset, settingIdx: ReadonlyMap<string, number>, inputIdx: ReadonlyMap<string, number>):
    { settings: number; curves: number; unknownSettings: string[]; unknownInputs: string[] } {
    this.fromDefaults()
    // ⚠ 프리셋의 «opaque_multiply»는 압축에서 빠졌을 수 있다(기본값과 같고 곡선이 없을 때) —
    // 그러면 from_defaults의 압력 곡선이 남는다. libmypaint도 같다(from_defaults 뒤 from_string이
    // 그 설정을 안 건드리면 기본 곡선이 산다).
    let nS = 0, nC = 0
    const unknownSettings: string[] = [], unknownInputs: string[] = []
    for (const [key, val] of Object.entries(p.s)) {
      const si = settingIdx.get(key)
      if (si === undefined) { unknownSettings.push(key); continue }
      nS++
      const m = this.settings[si]!
      m.baseValue = val[0]
      // 프리셋이 곡선을 «명시»하면 그 입력만 덮는다 — 명시 안 한 입력의 기본 곡선(opaque_multiply의
      // 압력)은 산다. 다만 프리셋이 그 설정을 적으면서 곡선을 안 적은 것은 «곡선 없음»의 뜻이다
      // (.myb 원문은 항상 inputs를 적는다 — 빈 {}면 곡선 없음). 압축은 빈 곡선을 생략하므로
      // 여기서 그 설정의 곡선을 전부 걷고 명시된 것만 싣는다.
      for (let i = 0; i < INPUTS_COUNT; i++) m.setN(i, 0)
      if (val.length > 1) {
        for (const [ik, pts] of Object.entries(val[1]!)) {
          const ii = inputIdx.get(ik)
          if (ii === undefined) { unknownInputs.push(ik); continue }
          m.setN(ii, pts.length)
          for (let k = 0; k < pts.length; k++) m.setPoint(ii, k, pts[k]![0]!, pts[k]![1]!)
          nC++
        }
      }
    }
    this.settingsBaseValuesHaveChanged()
    return { settings: nS, curves: nC, unknownSettings, unknownInputs }
  }

  private expDecay(T: number, t: number): number {
    if (T <= 0.001) return 0
    return Math.exp(-t / T)
  }

  settingsBaseValuesHaveChanged(): void {
    for (let i = 0; i < 2; i++) {
      const gamma = Math.exp(i === 0 ? this.base(S.SPEED1_GAMMA) : this.base(S.SPEED2_GAMMA))
      const fix1_x = 45.0, fix1_y = 0.5, fix2_x = 45.0, fix2_dy = 0.015
      const c1 = Math.log(fix1_x + gamma)
      const m = fix2_dy * (fix2_x + gamma)
      const q = fix1_y - m * c1
      this.speedMappingGamma[i] = gamma
      this.speedMappingM[i] = m
      this.speedMappingQ[i] = q
    }
  }

  private directionalOffsets(baseRadius: number, brushFlip: number): [number, number] {
    const offsetMult = Math.exp(this.sv(S.OFFSET_MULTIPLIER))
    if (!Number.isFinite(offsetMult)) return [0, 0]
    let dx = this.sv(S.OFFSET_X)
    let dy = this.sv(S.OFFSET_Y)
    const offsetAngleAdj = this.sv(S.OFFSET_ANGLE_ADJ)
    const dirAngleDy = this.st(ST.DIRECTION_ANGLE_DY)
    const dirAngleDx = this.st(ST.DIRECTION_ANGLE_DX)
    // C의 fmodf(부호 보존) 그대로
    const angleDeg = (DEGREES(Math.atan2(dirAngleDy, dirAngleDx)) - 90) % 360
    const offsetAngle = this.sv(S.OFFSET_ANGLE)
    if (offsetAngle) {
      const dirAngle = RADIANS(angleDeg + offsetAngleAdj)
      dx += Math.cos(dirAngle) * offsetAngle
      dy += Math.sin(dirAngle) * offsetAngle
    }
    const viewRotation = this.st(ST.VIEWROTATION)
    const offsetAngleAsc = this.sv(S.OFFSET_ANGLE_ASC)
    if (offsetAngleAsc) {
      const ascension = this.st(ST.ASCENSION)
      const ascAngle = RADIANS(ascension - viewRotation + offsetAngleAdj)
      dx += Math.cos(ascAngle) * offsetAngleAsc
      dy += Math.sin(ascAngle) * offsetAngleAsc
    }
    const viewOffset = this.sv(S.OFFSET_ANGLE_VIEW)
    if (viewOffset) {
      const viewAngle = RADIANS(viewRotation + offsetAngleAdj)
      dx += Math.cos(-viewAngle) * viewOffset
      dy += Math.sin(-viewAngle) * viewOffset
    }
    const offsetDirMirror = Math.max(0, this.sv(S.OFFSET_ANGLE_2))
    if (offsetDirMirror) {
      const dirMirrorAngle = RADIANS(angleDeg + offsetAngleAdj * brushFlip)
      const offsetFactor = offsetDirMirror * brushFlip
      dx += Math.cos(dirMirrorAngle) * offsetFactor
      dy += Math.sin(dirMirrorAngle) * offsetFactor
    }
    const offsetAscMirror = Math.max(0, this.sv(S.OFFSET_ANGLE_2_ASC))
    if (offsetAscMirror) {
      const ascension = this.st(ST.ASCENSION)
      const ascAngle = RADIANS(ascension - viewRotation + offsetAngleAdj * brushFlip)
      const offsetFactor = brushFlip * offsetAscMirror
      dx += Math.cos(ascAngle) * offsetFactor
      dy += Math.sin(ascAngle) * offsetFactor
    }
    const offsetViewMirror = Math.max(0, this.sv(S.OFFSET_ANGLE_2_VIEW))
    if (offsetViewMirror) {
      const offsetFactor = brushFlip * offsetViewMirror
      const offsetAngleRad = RADIANS(viewRotation + offsetAngleAdj)
      dx += Math.cos(-offsetAngleRad) * offsetFactor
      dy += Math.sin(-offsetAngleRad) * offsetFactor
    }
    const lim = 3240
    const baseMul = baseRadius * offsetMult
    return [clamp(dx * baseMul, -lim, lim), clamp(dy * baseMul, -lim, lim)]
  }

  /** 시뮬레이션 한 걸음(도장마다 한두 번) — 입력 정규화의 마법 상수는 C 원문 그대로 */
  private updateStatesAndSettingValues(
    stepDdab: number, stepDx: number, stepDy: number, stepDpressure: number,
    stepDeclination: number, stepAscension: number, stepDtime: number,
    stepViewzoom: number, stepViewrotation: number,
    stepDeclinationX: number, stepDeclinationY: number, stepBarrelRotation: number,
  ): void {
    if (stepDtime < 0) stepDtime = 0.001
    else if (stepDtime === 0) stepDtime = 0.001

    this.setSt(ST.X, this.st(ST.X) + (stepDx))
    this.setSt(ST.Y, this.st(ST.Y) + (stepDy))
    this.setSt(ST.PRESSURE, this.st(ST.PRESSURE) + (stepDpressure))
    this.setSt(ST.DECLINATION, this.st(ST.DECLINATION) + (stepDeclination))
    this.setSt(ST.ASCENSION, this.st(ST.ASCENSION) + (stepAscension))
    this.setSt(ST.DECLINATIONX, this.st(ST.DECLINATIONX) + (stepDeclinationX))
    this.setSt(ST.DECLINATIONY, this.st(ST.DECLINATIONY) + (stepDeclinationY))
    this.setSt(ST.VIEWZOOM, stepViewzoom)
    const viewrotation = modArith(DEGREES(stepViewrotation) + 180.0, 360.0) - 180.0
    this.setSt(ST.VIEWROTATION, viewrotation)

    { // gridmap
      const x = this.st(ST.ACTUAL_X), y = this.st(ST.ACTUAL_Y)
      const scale = Math.exp(this.sv(S.GRIDMAP_SCALE))
      const scaleX = this.sv(S.GRIDMAP_SCALE_X), scaleY = this.sv(S.GRIDMAP_SCALE_Y)
      const scaledSize = scale * GRID_SIZE
      this.setSt(ST.GRIDMAP_X, (modArith(Math.abs(x * scaleX), scaledSize) / scaledSize) * GRID_SIZE)
      this.setSt(ST.GRIDMAP_Y, (modArith(Math.abs(y * scaleY), scaledSize) / scaledSize) * GRID_SIZE)
      if (x < 0) this.setSt(ST.GRIDMAP_X, GRID_SIZE - this.st(ST.GRIDMAP_X))
      if (y < 0) this.setSt(ST.GRIDMAP_Y, GRID_SIZE - this.st(ST.GRIDMAP_Y))
    }

    const baseRadius = Math.exp(this.base(S.RADIUS_LOGARITHMIC))
    this.setSt(ST.BARREL_ROTATION, this.st(ST.BARREL_ROTATION) + (stepBarrelRotation))

    if (this.st(ST.PRESSURE) <= 0) this.setSt(ST.PRESSURE, 0)
    const pressure = this.st(ST.PRESSURE)

    { // stroke 시작/끝(stroke 입력용)
      const lim = 0.0001
      const threshold = this.base(S.STROKE_THRESHOLD)
      const started = this.st(ST.STROKE_STARTED)
      if (!started && pressure > threshold + lim) {
        this.setSt(ST.STROKE_STARTED, 1)
        this.setSt(ST.STROKE, 0)
      } else if (started && pressure <= threshold * 0.9 + lim) {
        this.setSt(ST.STROKE_STARTED, 0)
      }
    }

    const normDx = (stepDx / stepDtime) * this.st(ST.VIEWZOOM)
    const normDy = (stepDy / stepDtime) * this.st(ST.VIEWZOOM)
    const normSpeed = Math.hypot(normDx, normDy)
    const normDist = Math.hypot(stepDx / stepDtime / baseRadius, stepDy / stepDtime / baseRadius) * stepDtime

    const inp = this.inputs
    inp[I.PRESSURE] = pressure * Math.exp(this.base(S.PRESSURE_GAIN_LOG))
    inp[I.SPEED1] = Math.log(this.speedMappingGamma[0]! + this.st(ST.NORM_SPEED1_SLOW)) * this.speedMappingM[0]! + this.speedMappingQ[0]!
    inp[I.SPEED2] = Math.log(this.speedMappingGamma[1]! + this.st(ST.NORM_SPEED2_SLOW)) * this.speedMappingM[1]! + this.speedMappingQ[1]!
    inp[I.RANDOM] = this.randomInput
    inp[I.STROKE] = Math.min(this.st(ST.STROKE), 1.0)
    const dirAngle = Math.atan2(this.st(ST.DIRECTION_DY), this.st(ST.DIRECTION_DX))
    inp[I.DIRECTION] = modArith(DEGREES(dirAngle) + viewrotation + 180.0, 180.0)
    const dirAngle360 = Math.atan2(this.st(ST.DIRECTION_ANGLE_DY), this.st(ST.DIRECTION_ANGLE_DX))
    inp[I.DIRECTION_ANGLE] = (DEGREES(dirAngle360) + viewrotation + 360.0) % 360.0
    inp[I.TILT_DECLINATION] = this.st(ST.DECLINATION)
    inp[I.TILT_ASCENSION] = modArith(this.st(ST.ASCENSION) + viewrotation + 180.0, 360.0) - 180.0
    inp[I.VIEWZOOM] = this.base(S.RADIUS_LOGARITHMIC) - Math.log(baseRadius / this.st(ST.VIEWZOOM))
    inp[I.ATTACK_ANGLE] = smallestAngularDifference(this.st(ST.ASCENSION), modArith(DEGREES(dirAngle360) + 90, 360))
    inp[I.BRUSH_RADIUS] = this.base(S.RADIUS_LOGARITHMIC)
    inp[I.GRIDMAP_X] = clamp(this.st(ST.GRIDMAP_X), 0, GRID_SIZE)
    inp[I.GRIDMAP_Y] = clamp(this.st(ST.GRIDMAP_Y), 0, GRID_SIZE)
    inp[I.TILT_DECLINATIONX] = this.st(ST.DECLINATIONX)
    inp[I.TILT_DECLINATIONY] = this.st(ST.DECLINATIONY)
    inp[I.CUSTOM] = this.st(ST.CUSTOM_INPUT)
    inp[I.BARREL_ROTATION] = modArith(this.st(ST.BARREL_ROTATION), 360)

    for (let i = 0; i < SETTINGS_COUNT; i++) this.settingsValue[i] = this.settings[i]!.calculate(inp)

    this.setSt(ST.DABS_PER_BASIC_RADIUS, this.sv(S.DABS_PER_BASIC_RADIUS))
    this.setSt(ST.DABS_PER_ACTUAL_RADIUS, this.sv(S.DABS_PER_ACTUAL_RADIUS))
    this.setSt(ST.DABS_PER_SECOND, this.sv(S.DABS_PER_SECOND))

    {
      const fac = 1.0 - this.expDecay(this.sv(S.SLOW_TRACKING_PER_DAB), stepDdab)
      this.setSt(ST.ACTUAL_X, this.st(ST.ACTUAL_X) + ((this.st(ST.X) - this.st(ST.ACTUAL_X)) * fac))
      this.setSt(ST.ACTUAL_Y, this.st(ST.ACTUAL_Y) + ((this.st(ST.Y) - this.st(ST.ACTUAL_Y)) * fac))
    }
    { // slow speed
      const fac1 = 1.0 - this.expDecay(this.sv(S.SPEED1_SLOWNESS), stepDtime)
      this.setSt(ST.NORM_SPEED1_SLOW, this.st(ST.NORM_SPEED1_SLOW) + ((normSpeed - this.st(ST.NORM_SPEED1_SLOW)) * fac1))
      const fac2 = 1.0 - this.expDecay(this.sv(S.SPEED2_SLOWNESS), stepDtime)
      this.setSt(ST.NORM_SPEED2_SLOW, this.st(ST.NORM_SPEED2_SLOW) + ((normSpeed - this.st(ST.NORM_SPEED2_SLOW)) * fac2))
    }
    { // slow speed, 벡터
      let timeConstant = Math.exp(this.sv(S.OFFSET_BY_SPEED_SLOWNESS) * 0.01) - 1.0
      if (timeConstant < 0.002) timeConstant = 0.002
      const fac = 1.0 - this.expDecay(timeConstant, stepDtime)
      this.setSt(ST.NORM_DX_SLOW, this.st(ST.NORM_DX_SLOW) + ((normDx - this.st(ST.NORM_DX_SLOW)) * fac))
      this.setSt(ST.NORM_DY_SLOW, this.st(ST.NORM_DY_SLOW) + ((normDy - this.st(ST.NORM_DY_SLOW)) * fac))
    }
    { // 방향(dabtime 저역 통과)
      let dx = stepDx * this.st(ST.VIEWZOOM)
      let dy = stepDy * this.st(ST.VIEWZOOM)
      const stepInDabtime = Math.hypot(dx, dy)
      const fac = 1.0 - this.expDecay(Math.exp(this.sv(S.DIRECTION_FILTER) * 0.5) - 1.0, stepInDabtime)
      const dxOld = this.st(ST.DIRECTION_DX), dyOld = this.st(ST.DIRECTION_DY)
      this.setSt(ST.DIRECTION_ANGLE_DX, this.st(ST.DIRECTION_ANGLE_DX) + ((dx - this.st(ST.DIRECTION_ANGLE_DX)) * fac))
      this.setSt(ST.DIRECTION_ANGLE_DY, this.st(ST.DIRECTION_ANGLE_DY) + ((dy - this.st(ST.DIRECTION_ANGLE_DY)) * fac))
      if ((dxOld - dx) ** 2 + (dyOld - dy) ** 2 > (dxOld + dx) ** 2 + (dyOld + dy) ** 2) { dx = -dx; dy = -dy }
      this.setSt(ST.DIRECTION_DX, this.st(ST.DIRECTION_DX) + ((dx - this.st(ST.DIRECTION_DX)) * fac))
      this.setSt(ST.DIRECTION_DY, this.st(ST.DIRECTION_DY) + ((dy - this.st(ST.DIRECTION_DY)) * fac))
    }
    { // custom input
      const fac = 1.0 - this.expDecay(this.sv(S.CUSTOM_INPUT_SLOWNESS), 0.1)
      this.setSt(ST.CUSTOM_INPUT, this.st(ST.CUSTOM_INPUT) + ((this.sv(S.CUSTOM_INPUT) - this.st(ST.CUSTOM_INPUT)) * fac))
    }
    { // stroke length
      const frequency = Math.exp(-this.sv(S.STROKE_DURATION_LOGARITHMIC))
      const stroke = Math.max(0, this.st(ST.STROKE) + normDist * frequency)
      const wrap = 1.0 + Math.max(0, this.sv(S.STROKE_HOLDTIME))
      if (stroke >= wrap && wrap > 9.9 + 1.0) this.setSt(ST.STROKE, 1.0)
      else if (stroke >= wrap) this.setSt(ST.STROKE, stroke % wrap)
      else this.setSt(ST.STROKE, stroke)
    }
    // 최종 반지름
    const radiusLog = this.sv(S.RADIUS_LOGARITHMIC)
    let ar = Math.exp(radiusLog)
    if (ar < ACTUAL_RADIUS_MIN) ar = ACTUAL_RADIUS_MIN
    if (ar > ACTUAL_RADIUS_MAX) ar = ACTUAL_RADIUS_MAX
    this.setSt(ST.ACTUAL_RADIUS, ar)
    this.setSt(ST.ACTUAL_ELLIPTICAL_DAB_RATIO, this.sv(S.ELLIPTICAL_DAB_RATIO))
    this.setSt(ST.ACTUAL_ELLIPTICAL_DAB_ANGLE, modArith(this.sv(S.ELLIPTICAL_DAB_ANGLE) - viewrotation + 180.0, 180.0) - 180.0)
  }

  private fetchSmudgeBucket(): number {
    const idx = clamp(Math.round(this.sv(S.SMUDGE_BUCKET)), 0, NUM_BUCKETS - 1)
    if (this.minBucketUsed === -1 || this.minBucketUsed > idx) this.minBucketUsed = idx
    if (this.maxBucketUsed < idx) this.maxBucketUsed = idx
    return idx * SMUDGE_BUCKET_SIZE
  }

  /** 스머지 색 갱신 — 돌려주는 값 true면 «일찍 끝내라»(smudge_transparency 문) */
  private updateSmudgeColor(
    surface: DabSurface, b: number, smudgeLength: number, px: number, py: number,
    radius: number, legacySmudge: boolean, paintFactor: number,
  ): boolean {
    const sb = this.smudgeBuckets
    let updateFactor = Math.max(0.01, smudgeLength)
    let r: number, g: number, bb: number, a: number
    const smudgeLengthLog = this.sv(S.SMUDGE_LENGTH_LOG)
    const recentness = sb[b + PREV_COL_RECENTNESS]! * updateFactor
    sb[b + PREV_COL_RECENTNESS] = recentness
    const margin = 0.0000000000000001
    if (recentness < Math.min(1.0, Math.pow(0.5 * updateFactor, smudgeLengthLog) + margin)) {
      if (recentness === 0) updateFactor = 0
      sb[b + PREV_COL_RECENTNESS] = 1.0
      const radiusLog = this.sv(S.SMUDGE_RADIUS_LOG)
      const smudgeRadius = clamp(radius * Math.exp(radiusLog), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX)
      ;[r, g, bb, a] = surface.getColor(px, py, smudgeRadius, legacySmudge ? -1.0 : paintFactor)
      const smudgeOpLim = this.sv(S.SMUDGE_TRANSPARENCY)
      if ((smudgeOpLim > 0 && a < smudgeOpLim) || (smudgeOpLim < 0 && a > -smudgeOpLim)) return true
      sb[b + PREV_COL_R] = r; sb[b + PREV_COL_G] = g; sb[b + PREV_COL_B] = bb; sb[b + PREV_COL_A] = a
    } else {
      r = sb[b + PREV_COL_R]!; g = sb[b + PREV_COL_G]!; bb = sb[b + PREV_COL_B]!; a = sb[b + PREV_COL_A]!
    }
    if (legacySmudge) {
      const facOld = updateFactor
      const facNew = (1.0 - updateFactor) * a
      sb[b + SMUDGE_R] = facOld * sb[b + SMUDGE_R]! + facNew * r
      sb[b + SMUDGE_G] = facOld * sb[b + SMUDGE_G]! + facNew * g
      sb[b + SMUDGE_B] = facOld * sb[b + SMUDGE_B]! + facNew * bb
      sb[b + SMUDGE_A] = clamp(facOld * sb[b + SMUDGE_A]! + facNew, 0, 1)
    } else if (a > WGM_EPSILON * 10) {
      const prev = [sb[b + SMUDGE_R]!, sb[b + SMUDGE_G]!, sb[b + SMUDGE_B]!, sb[b + SMUDGE_A]!]
      const sampled = [r, g, bb, a]
      const nw = mixColors(prev, sampled, updateFactor, paintFactor)
      sb[b + SMUDGE_R] = nw[0]; sb[b + SMUDGE_G] = nw[1]; sb[b + SMUDGE_B] = nw[2]; sb[b + SMUDGE_A] = nw[3]
    } else {
      sb[b + SMUDGE_A] = (sb[b + SMUDGE_A]! + a) / 2
    }
    return false
  }

  /** 스머지 적용 — 색을 고쳐 쓰고 eraser_target_alpha를 돌려준다 */
  private applySmudge(b: number, smudgeValue: number, legacySmudge: boolean, paintFactor: number, col: [number, number, number]): number {
    const sb = this.smudgeBuckets
    const smudgeFactor = Math.min(1.0, smudgeValue)
    const eraserTargetAlpha = clamp((1.0 - smudgeFactor) + smudgeFactor * sb[b + SMUDGE_A]!, 0, 1)
    if (eraserTargetAlpha > 0) {
      if (legacySmudge) {
        const colFactor = 1.0 - smudgeFactor
        col[0] = (smudgeFactor * sb[b + SMUDGE_R]! + colFactor * col[0]) / eraserTargetAlpha
        col[1] = (smudgeFactor * sb[b + SMUDGE_G]! + colFactor * col[1]) / eraserTargetAlpha
        col[2] = (smudgeFactor * sb[b + SMUDGE_B]! + colFactor * col[2]) / eraserTargetAlpha
      } else {
        const smudgeColor = [sb[b + SMUDGE_R]!, sb[b + SMUDGE_G]!, sb[b + SMUDGE_B]!, sb[b + SMUDGE_A]!]
        const brushColor = [col[0], col[1], col[2], 1.0]
        const nw = mixColors(smudgeColor, brushColor, smudgeFactor, paintFactor)
        col[0] = nw[0]; col[1] = nw[1]; col[2] = nw[2]
      }
    } else {
      col[0] = 1; col[1] = 0; col[2] = 0
    }
    return eraserTargetAlpha
  }

  /** stroke_to에서만 부른다 — 도장 하나를 준비해 표면에 넘긴다. 표면이 바뀌면 true. */
  private prepareAndDrawDab(surface: DabSurface, linear: boolean): boolean {
    const opaqueFac = this.sv(S.OPAQUE_MULTIPLY)
    let opaque = Math.max(0, this.sv(S.OPAQUE))
    opaque = clamp(opaque * opaqueFac, 0, 1)
    // 이 이식의 덧: 선형화 «전»의 opaque가 획 안 덮임의 목표(캡)다 — 지시 62 「획 안은 안 쌓인다」
    const capTarget = opaque
    const opaqueLinearize = this.base(S.OPAQUE_LINEARIZE)
    if (opaqueLinearize) {
      let dabsPerPixel = (this.st(ST.DABS_PER_ACTUAL_RADIUS) + this.st(ST.DABS_PER_BASIC_RADIUS)) * 2.0
      if (dabsPerPixel < 1) dabsPerPixel = 1
      dabsPerPixel = 1.0 + opaqueLinearize * (dabsPerPixel - 1.0)
      const alpha = opaque
      const beta = 1.0 - alpha
      const betaDab = Math.pow(beta, 1.0 / dabsPerPixel)
      opaque = 1.0 - betaDab
    }

    let x = this.st(ST.ACTUAL_X)
    let y = this.st(ST.ACTUAL_Y)
    const baseRadius = Math.exp(this.base(S.RADIUS_LOGARITHMIC))
    const offs = this.directionalOffsets(baseRadius, this.st(ST.FLIP))
    x += offs[0]; y += offs[1]

    const viewZoom = this.st(ST.VIEWZOOM)
    const offsetBySpeed = this.sv(S.OFFSET_BY_SPEED)
    if (offsetBySpeed) {
      x += (this.st(ST.NORM_DX_SLOW) * offsetBySpeed * 0.1) / viewZoom
      y += (this.st(ST.NORM_DY_SLOW) * offsetBySpeed * 0.1) / viewZoom
    }
    const offsetByRandom = this.sv(S.OFFSET_BY_RANDOM)
    if (offsetByRandom) {
      const amp = Math.max(0, offsetByRandom)
      x += randGauss(this.rng) * amp * baseRadius
      y += randGauss(this.rng) * amp * baseRadius
    }

    let radius = this.st(ST.ACTUAL_RADIUS)
    const radiusByRandom = this.sv(S.RADIUS_BY_RANDOM)
    if (radiusByRandom) {
      const noise = randGauss(this.rng) * radiusByRandom
      const radiusLog = this.sv(S.RADIUS_LOGARITHMIC) + noise
      radius = clamp(Math.exp(radiusLog), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX)
      const alphaCorrection = (this.st(ST.ACTUAL_RADIUS) / radius) ** 2
      if (alphaCorrection <= 1.0) opaque *= alphaCorrection
    }

    const paintFactor = this.sv(S.PAINT_MODE)
    const paintSettingConstant = this.settings[S.PAINT_MODE]!.isConstant()
    const legacySmudge = paintFactor <= 0 && paintSettingConstant

    const col: [number, number, number] = hsvToRgb(this.base(S.COLOR_H), this.base(S.COLOR_S), this.base(S.COLOR_V))

    const smudgeLength = this.sv(S.SMUDGE_LENGTH)
    if (smudgeLength < 1.0 && (this.sv(S.SMUDGE) !== 0 || !this.settings[S.SMUDGE]!.isConstant())) {
      const b = this.fetchSmudgeBucket()
      const returnEarly = this.updateSmudgeColor(surface, b, smudgeLength, Math.round(x), Math.round(y), radius, legacySmudge, paintFactor)
      if (returnEarly) return false
    }

    let eraserTargetAlpha = 1.0
    const smudgeValue = this.sv(S.SMUDGE)
    if (smudgeValue > 0) {
      const b = this.fetchSmudgeBucket()
      eraserTargetAlpha = this.applySmudge(b, smudgeValue, legacySmudge, paintFactor, col)
    }
    if (this.sv(S.ERASER)) eraserTargetAlpha *= 1.0 - this.sv(S.ERASER)

    const usingHsvDynamics = !!(this.sv(S.CHANGE_COLOR_H) || this.sv(S.CHANGE_COLOR_HSV_S) || this.sv(S.CHANGE_COLOR_V))
    const usingHslDynamics = !!(this.sv(S.CHANGE_COLOR_L) || this.sv(S.CHANGE_COLOR_HSL_S))
    const usingColorDynamics = usingHsvDynamics || usingHslDynamics
    if (linear && usingColorDynamics) {
      col[0] = Math.pow(col[0], 1 / 2.2); col[1] = Math.pow(col[1], 1 / 2.2); col[2] = Math.pow(col[2], 1 / 2.2)
    }
    if (usingHsvDynamics) {
      let [h, s, v] = rgbToHsv(col[0], col[1], col[2])
      h += this.sv(S.CHANGE_COLOR_H)
      s += s * v * this.sv(S.CHANGE_COLOR_HSV_S)
      v += this.sv(S.CHANGE_COLOR_V)
      const rgb = hsvToRgb(h, s, v)
      col[0] = rgb[0]; col[1] = rgb[1]; col[2] = rgb[2]
    }
    if (usingHslDynamics) {
      let [h, s, l] = rgbToHsl(col[0], col[1], col[2])
      l += this.sv(S.CHANGE_COLOR_L)
      s += s * Math.min(Math.abs(1.0 - l), Math.abs(l)) * 2.0 * this.sv(S.CHANGE_COLOR_HSL_S)
      const rgb = hslToRgb(h, s, l)
      col[0] = rgb[0]; col[1] = rgb[1]; col[2] = rgb[2]
    }
    if (linear && usingColorDynamics) {
      col[0] = Math.pow(col[0], 2.2); col[1] = Math.pow(col[1], 2.2); col[2] = Math.pow(col[2], 2.2)
    }

    let hardness = clamp(this.sv(S.HARDNESS), 0, 1)
    const softness = clamp(this.sv(S.SOFTNESS), 0, 1)
    // AA — 잉크 브러시에 «놀랍도록 잘 듣는» 그 시도(원문 주석)
    const currentFadeoutInPixels = radius * (1.0 - hardness)
    const minFadeoutInPixels = this.sv(S.ANTI_ALIASING)
    if (currentFadeoutInPixels < minFadeoutInPixels) {
      const currentOpticalRadius = radius - ((1.0 - hardness) * radius) / 2.0
      const hardnessNew = (currentOpticalRadius - minFadeoutInPixels / 2.0) / (currentOpticalRadius + minFadeoutInPixels / 2.0)
      const radiusNew = minFadeoutInPixels / (1.0 - hardnessNew)
      hardness = hardnessNew
      radius = radiusNew
    }

    const snapToPixel = this.sv(S.SNAP_TO_PIXEL)
    if (snapToPixel > 0) {
      const snappedX = Math.floor(x) + 0.5, snappedY = Math.floor(y) + 0.5
      x = x + (snappedX - x) * snapToPixel
      y = y + (snappedY - y) * snapToPixel
      let snappedRadius = Math.round(radius * 2.0) / 2.0
      if (snappedRadius < 0.5) snappedRadius = 0.5
      if (snapToPixel > 0.9999) snappedRadius -= 0.0001
      radius = radius + (snappedRadius - radius) * snapToPixel
    }

    return surface.drawDab(
      x, y, radius, col[0], col[1], col[2], opaque, hardness, softness, eraserTargetAlpha,
      this.st(ST.ACTUAL_ELLIPTICAL_DAB_RATIO), this.st(ST.ACTUAL_ELLIPTICAL_DAB_ANGLE),
      this.sv(S.LOCK_ALPHA), this.sv(S.COLORIZE), this.sv(S.POSTERIZE), this.sv(S.POSTERIZE_NUM),
      paintFactor, capTarget,
    )
  }

  private countDabsTo(x: number, y: number, dt: number): number {
    const baseRadiusLog = this.base(S.RADIUS_LOGARITHMIC)
    const baseRadius = clamp(Math.exp(baseRadiusLog), ACTUAL_RADIUS_MIN, ACTUAL_RADIUS_MAX)
    if (this.st(ST.ACTUAL_RADIUS) === 0) this.setSt(ST.ACTUAL_RADIUS, baseRadius)
    const dx = x - this.st(ST.X), dy = y - this.st(ST.Y)
    let dist: number
    if (this.st(ST.ACTUAL_ELLIPTICAL_DAB_RATIO) > 1.0) {
      const angleRad = RADIANS(this.st(ST.ACTUAL_ELLIPTICAL_DAB_ANGLE))
      const cs = Math.cos(angleRad), sn = Math.sin(angleRad)
      const yyr = (dy * cs - dx * sn) * this.st(ST.ACTUAL_ELLIPTICAL_DAB_RATIO)
      const xxr = dy * sn + dx * cs
      dist = Math.sqrt(yyr * yyr + xxr * xxr)
    } else dist = Math.hypot(dx, dy)
    const res1 = (dist / this.st(ST.ACTUAL_RADIUS)) * this.st(ST.DABS_PER_ACTUAL_RADIUS)
    const res2 = (dist / baseRadius) * this.st(ST.DABS_PER_BASIC_RADIUS)
    const res3 = dt * this.st(ST.DABS_PER_SECOND)
    let res4 = res1 + res2 + res3
    if (Number.isNaN(res4) || res4 < 0) res4 = 0
    return res4
  }

  /** mypaint_brush_stroke_to — 이동 이벤트마다 한 번. 돌려주는 값은 «획이 끝났거나 비었다»(C의
   *  획 분할 술어 — 여기서는 안 쓴다). 그린 도장 수를 세어 두었다(dabsDrawn — 진단). */
  dabsDrawn = 0
  strokeTo(
    surface: DabSurface, x: number, y: number, pressure: number,
    xtilt: number, ytilt: number, dtime: number,
    viewzoom = 1.0, viewrotation = 0.0, barrelRotation = 0.0, linear = true,
  ): boolean {
    const maxDtime = 5
    let tiltAscension = 0.0, tiltDeclination = 90.0, tiltDeclinationX = 90.0, tiltDeclinationY = 90.0
    if (xtilt !== 0 || ytilt !== 0) {
      xtilt = clamp(xtilt, -1, 1); ytilt = clamp(ytilt, -1, 1)
      tiltAscension = DEGREES(Math.atan2(-xtilt, ytilt))
      const rad = Math.hypot(xtilt, ytilt)
      tiltDeclination = 90 - rad * 60
      tiltDeclinationX = xtilt * 60
      tiltDeclinationY = ytilt * 60
    }
    if (pressure <= 0) pressure = 0
    if (!Number.isFinite(x) || !Number.isFinite(y) || x > 1e10 || y > 1e10 || x < -1e10 || y < -1e10) {
      x = 0; y = 0; pressure = 0; viewzoom = 0; viewrotation = 0; barrelRotation = 0
    }
    if (dtime <= 0) dtime = 0.0001

    if (dtime > 0.100 && pressure && this.st(ST.PRESSURE) === 0) {
      this.strokeTo(surface, x, y, 0.0, 90.0, 0.0, dtime - 0.0001, viewzoom, viewrotation, 0.0, linear)
      dtime = 0.0001
    }

    if (this.skip > 0.001) {
      const dist = Math.hypot(this.skipLastX - x, this.skipLastY - y)
      this.skipLastX = x; this.skipLastY = y
      this.skippedDtime += dtime
      this.skip -= dist
      dtime = this.skippedDtime
      if (this.skip > 0.001 && !(dtime > maxDtime || this.resetRequested)) return false
      this.skip = 0; this.skipLastX = 0; this.skipLastY = 0; this.skippedDtime = 0
    }

    { // 가상 커서 위치 — 잡음 먼저, 그다음 느린 추적
      if (this.base(S.TRACKING_NOISE)) {
        const baseRadius = Math.exp(this.base(S.RADIUS_LOGARITHMIC))
        const noise = baseRadius * this.base(S.TRACKING_NOISE)
        if (noise > 0.001) {
          this.skip = 0.5 * noise
          this.skipLastX = x; this.skipLastY = y
          x += noise * randGauss(this.rng)
          y += noise * randGauss(this.rng)
        }
      }
      const fac = 1.0 - this.expDecay(this.base(S.SLOW_TRACKING), 100.0 * dtime)
      x = this.st(ST.X) + (x - this.st(ST.X)) * fac
      y = this.st(ST.Y) + (y - this.st(ST.Y)) * fac
    }

    if (dtime > maxDtime || this.resetRequested) {
      this.resetRequested = false
      this.reset()
      this.randomInput = this.rng()
      this.setSt(ST.X, x); this.setSt(ST.Y, y); this.setSt(ST.PRESSURE, pressure)
      this.setSt(ST.ACTUAL_X, x); this.setSt(ST.ACTUAL_Y, y)
      this.setSt(ST.STROKE, 1.0)
      return true
    }

    let painted: 0 | 1 | 2 = 0            // UNKNOWN · YES · NO
    let dtimeLeft = dtime
    let stepDdab: number, stepDx: number, stepDy: number, stepDpressure: number, stepDtime: number
    let stepDeclination: number, stepAscension: number, stepDeclinationX: number, stepDeclinationY: number, stepBarrel: number

    let dabsMoved = this.st(ST.PARTIAL_DABS)
    let dabsTodo = this.countDabsTo(x, y, dtime)
    while (dabsMoved + dabsTodo >= 1.0) {
      {
        if (dabsMoved > 0) { stepDdab = 1.0 - dabsMoved; dabsMoved = 0 }
        else stepDdab = 1.0
        const frac = stepDdab / dabsTodo
        stepDx = frac * (x - this.st(ST.X))
        stepDy = frac * (y - this.st(ST.Y))
        stepDpressure = frac * (pressure - this.st(ST.PRESSURE))
        stepDtime = frac * (dtimeLeft - 0.0)
        stepDeclination = frac * (tiltDeclination - this.st(ST.DECLINATION))
        stepDeclinationX = frac * (tiltDeclinationX - this.st(ST.DECLINATIONX))
        stepDeclinationY = frac * (tiltDeclinationY - this.st(ST.DECLINATIONY))
        stepAscension = frac * smallestAngularDifference(this.st(ST.ASCENSION), tiltAscension)
        stepBarrel = frac * smallestAngularDifference(this.st(ST.BARREL_ROTATION), barrelRotation * 360)
        this.updateStatesAndSettingValues(stepDdab, stepDx, stepDy, stepDpressure, stepDeclination, stepAscension,
          stepDtime, viewzoom, viewrotation, stepDeclinationX, stepDeclinationY, stepBarrel)
      }
      this.setSt(ST.FLIP, -this.st(ST.FLIP))
      const paintedNow = this.prepareAndDrawDab(surface, linear)
      if (paintedNow) { painted = 1; this.dabsDrawn++ }
      else if (painted === 0) painted = 2
      this.randomInput = this.rng()
      dtimeLeft -= stepDtime
      dabsTodo = this.countDabsTo(x, y, dtimeLeft)
    }
    {
      stepDdab = dabsTodo
      stepDx = x - this.st(ST.X)
      stepDy = y - this.st(ST.Y)
      stepDpressure = pressure - this.st(ST.PRESSURE)
      stepDeclination = tiltDeclination - this.st(ST.DECLINATION)
      stepDeclinationX = tiltDeclinationX - this.st(ST.DECLINATIONX)
      stepDeclinationY = tiltDeclinationY - this.st(ST.DECLINATIONY)
      stepAscension = smallestAngularDifference(this.st(ST.ASCENSION), tiltAscension)
      stepDtime = dtimeLeft
      stepBarrel = smallestAngularDifference(this.st(ST.BARREL_ROTATION), barrelRotation * 360)
      this.updateStatesAndSettingValues(stepDdab, stepDx, stepDy, stepDpressure, stepDeclination, stepAscension,
        stepDtime, viewzoom, viewrotation, stepDeclinationX, stepDeclinationY, stepBarrel)
    }
    this.setSt(ST.PARTIAL_DABS, dabsMoved + dabsTodo)

    // 획 분할 논리(undo/redo용) — 값만 계산해 둔다(부르는 쪽이 안 쓴다)
    if (painted === 0) {
      painted = (this.strokeCurrentIdlingTime > 0 || this.strokeTotalPaintingTime === 0) ? 2 : 1
    }
    if (painted === 1) {
      this.strokeTotalPaintingTime += dtime
      this.strokeCurrentIdlingTime = 0
      if (this.strokeTotalPaintingTime > 4 + 3 * pressure && stepDpressure >= 0) return true
    } else {
      this.strokeCurrentIdlingTime += dtime
      if (this.strokeTotalPaintingTime === 0) {
        if (this.strokeCurrentIdlingTime > 1.0) return true
      } else if (this.strokeTotalPaintingTime + this.strokeCurrentIdlingTime > 0.9 + 5 * pressure) return true
    }
    return false
  }
}
