// 브러시 엔진의 «값 묶음»(web2-58 58-3) — **엔진은 하나, 브러시는 데이터다.**
//
// 51은 브러시 넷이 각자 상수(C.PAINT51_*)를 물고 있었다 — 하나를 고치면 셋이 안
// 따라왔다. 이제 넷은 이 표의 값 한 벌씩이고, 그리는 코드는 facetex의 모드 셋
// (band·stamps·bristles)뿐이다. **새 브러시는 값 한 벌이지 코드가 아니다.**
//
// 값의 정본 셋(#54):
//   기본값   아래 DEFAULTS — 51의 상수를 그대로 옮겼다(숫자를 새로 짓지 않는다).
//            ⚠ 예외 하나: 마커 tipAlpha 기본 0 — **사람 판정**(58 지시 「시작·끝 원형
//            강조가 매우 거슬린다」 · D-2 실측 mark58_pre: 팁 창 비 1.374)이 51의
//            «끝이 몸통보다 진하다»(46·51)를 대체했다. 기제는 남는다(손잡이 —
//            실험실에서 되켤 수 있다). DECISIONS 「51 문면 철회」가 그 기록이다.
//   조정값   실험실(58-5)이 «굳힌» 사람의 값 — 기기에 남는다(문서 아님 · 52 프리셋의
//            그 자리). loadBrushTune/brushTuneJson으로 main이 저장소와 잇는다.
//   획 저장  안 늘었다 — 획은 종전대로 {f,s,uv,w,c,i,press}뿐이고 «어떻게 그리는가»는
//            전부 여기서 온다(조정을 바꾸면 옛 획도 새 값으로 다시 굽힌다 — 튜닝의 뜻).
//
// 매핑 곡선: 다섯 점 폴리라인(x = 0·¼·½·¾·1의 y값). 51의 선형식(floor + slope·x)을
// 다섯 점으로 뜨면 **선형 구간에서는 값이 동일**하다(보간이 재현). ⚠ 상한 클램프가
// 걸리는 굽은 구간(density의 press>0.83)은 다섯 점 보간이 최대 5% 옅다 — 자국 값은
// 사람이 당길 것이라 눈금 오차로 받는다(NOTES 58 구현 절).

import { C } from './constants'

export type Instr58 = 'brush' | 'marker' | 'cp' | 'pencil'

/** 다섯 점 곡선 — x 0·0.25·0.5·0.75·1에서의 y. 평가는 구간 선형 보간. */
export type Curve5 = [number, number, number, number, number]

export function evalCurve(c: Curve5, x: number): number {
  const t = Math.min(1, Math.max(0, x)) * 4
  const i = Math.min(3, Math.floor(t))
  const f = t - i
  return c[i]! * (1 - f) + c[i + 1]! * f
}

/** 선형식 floor + slope·x를 다섯 점으로 뜬다 — 51 기본값의 이식기.
 *  ⚠ 상한 클램프는 **농도만**이다(min(1,…) — 51 식 그대로). 굵기 배수는 1을 넘는다
 *  (0.7 + 0.45·1 = 1.15 — 상한을 걸면 고압 굵기가 제품과 갈린다: 단위 팔이 잡았다). */
const lin5 = (floor: number, slope: number, clampTop: boolean): Curve5 =>
  [0, 0.25, 0.5, 0.75, 1].map(x => {
    const v = Math.max(0, floor + slope * x)
    return clampTop ? Math.min(1, v) : v
  }) as Curve5

export interface BrushDef {
  /** 그리기 모드 — band(연속 띠·마커) · stamps(도장 열) · bristles(빗살 도장 열·붓) */
  mode: 'band' | 'stamps' | 'bristles'
  /** 크기 슬라이더 최대(화면 px) — 58-1의 사람 값 */
  maxW: number
  /** 도장 간격 = 굵기(px) × spacingK — **거리 기반**(58-4 · D-2 실측: 원래 그랬다) */
  spacingK: number
  minSpacingPx: number
  /** 기저 알파(밴드 알파 · 도장 농도 배수) */
  alpha: number
  composite: 'source-over' | 'multiply'
  /** 압력 → 농도·굵기 곡선(51: 농도가 가파르고 굵기가 완만 — 26-6) */
  density: Curve5
  width: Curve5
  /** 결 — 격자 크기(굵기 배수 · 0 = 결 없음)와 최소 통과율 */
  grainK: number
  grainFloor: number
  /** 끝 원 강조(51 마커 팁) — 0 = 없음(58 기본 · 사람 판정) */
  tipAlpha: number
  tipLenK: number
  /** bristles 모드 — 빗살 수·끝 갈라짐(t0부터 k만큼 벌어짐 · splitT 1 = 없음) */
  bristles: number
  splitT: number
  splitK: number
  /** 진행 수직 산포(반지름 배수 · 0 = 없음) — 신규 축(실험실 몫) */
  scatter: number
  /** 도장 가장자리 경도(1 = 딱딱한 원 — 종전 경로 그대로 · <1 = 방사형 풀림) — 신규 축 */
  hardness: number
  /** 색연필 구멍(결 칸 걷어내기) — 문턱과 잔량 */
  cpSkipTh: number
  cpSkipAlpha: number
}

/** 51의 상수를 그대로 옮긴 기본값 넷 — 마커 tipAlpha 0만 예외(머리주석) */
const DEFAULTS: Record<Instr58, BrushDef> = {
  brush: {
    mode: 'bristles', maxW: C.PAINT58_MAX_W.brush,
    spacingK: 0.3, minSpacingPx: 1, alpha: 0.6, composite: 'source-over',
    density: lin5(C.PAINT51_DENSITY_FLOOR, C.PAINT51_DENSITY_SLOPE, true),
    width: lin5(C.PAINT51_WIDTH_FLOOR, C.PAINT51_WIDTH_SLOPE, false),
    grainK: 0, grainFloor: 1, tipAlpha: 0, tipLenK: 0,
    bristles: C.PAINT51_BRUSH_BRISTLES, splitT: C.PAINT51_BRUSH_SPLIT_T, splitK: C.PAINT51_BRUSH_SPLIT_K,
    scatter: 0, hardness: 1, cpSkipTh: 0, cpSkipAlpha: 0,
  },
  marker: {
    mode: 'band', maxW: C.PAINT58_MAX_W.marker,
    spacingK: 0.3, minSpacingPx: 1, alpha: C.PAINT_MARKER_ALPHA, composite: 'multiply',
    density: lin5(C.PAINT51_DENSITY_FLOOR, C.PAINT51_DENSITY_SLOPE, true),
    width: lin5(C.PAINT51_WIDTH_FLOOR, C.PAINT51_WIDTH_SLOPE, false),
    grainK: 0, grainFloor: 1,
    tipAlpha: 0 /* 51: C.PAINT51_MARKER_TIP_ALPHA — 58 사람 판정으로 기본 꺼짐 */,
    tipLenK: C.PAINT51_MARKER_TIP_LEN_K,
    bristles: 1, splitT: 1, splitK: 0, scatter: 0, hardness: 1, cpSkipTh: 0, cpSkipAlpha: 0,
  },
  cp: {
    mode: 'stamps', maxW: C.PAINT58_MAX_W.cp,
    spacingK: 0.3, minSpacingPx: 1, alpha: C.PAINT_CP_ALPHA, composite: 'source-over',
    density: lin5(C.PAINT51_DENSITY_FLOOR, C.PAINT51_DENSITY_SLOPE, true),
    width: lin5(C.PAINT51_WIDTH_FLOOR, C.PAINT51_WIDTH_SLOPE, false),
    grainK: C.PAINT51_CP_GRAIN_K, grainFloor: 0.7, tipAlpha: 0, tipLenK: 0,
    bristles: 1, splitT: 1, splitK: 0, scatter: 0, hardness: 1,
    cpSkipTh: C.PAINT51_CP_SKIP_TH, cpSkipAlpha: C.PAINT51_CP_SKIP_ALPHA,
  },
  pencil: {
    mode: 'stamps', maxW: C.PAINT58_MAX_W.pencil,
    spacingK: 0.25, minSpacingPx: 0.8, alpha: 0.85, composite: 'source-over',
    density: lin5(C.PAINT51_DENSITY_FLOOR, C.PAINT51_DENSITY_SLOPE, true),
    width: lin5(C.PAINT51_WIDTH_FLOOR, C.PAINT51_WIDTH_SLOPE, false),
    grainK: C.PAINT51_PENCIL_GRAIN_K, grainFloor: C.PAINT51_PENCIL_GRAIN_FLOOR,
    tipAlpha: 0, tipLenK: 0, bristles: 1, splitT: 1, splitK: 0, scatter: 0, hardness: 1,
    cpSkipTh: 0, cpSkipAlpha: 0,
  },
}

/** 사람이 실험실에서 «굳힌» 조정 — 기기의 것(main이 저장소와 잇는다). */
const tune: Partial<Record<Instr58, Partial<BrushDef>>> = {}

export const INSTRS58: readonly Instr58[] = ['brush', 'marker', 'cp', 'pencil']

/** 획의 저장 표식(paint.i) → 도구 이름. 0/undefined = 붓(50의 규약 그대로). */
export const instrOfTag = (i: number | undefined): Instr58 =>
  i === 1 ? 'marker' : i === 2 ? 'cp' : i === 3 ? 'pencil' : 'brush'

/** **현행 정의** — 기본값 + 사람 조정. 그리는 쪽(facetex)·실험실·팔이 전부 이것 하나를
 *  읽는다(#54). 매 호출 합성이라 조정 직후의 굽기가 바로 새 값을 본다. */
export function brushDef(i: Instr58): BrushDef {
  const t = tune[i]
  return t ? { ...DEFAULTS[i], ...t } : DEFAULTS[i]
}

export const brushDefault = (i: Instr58): BrushDef => ({ ...DEFAULTS[i] })

/** 조정을 놓는다(patch) 또는 걷는다(null). 반환 = 현행 정의. */
export function setBrushTune(i: Instr58, patch: Partial<BrushDef> | null): BrushDef {
  if (patch === null) delete tune[i]
  else tune[i] = { ...tune[i], ...patch }
  return brushDef(i)
}

/** 저장·복원(기기 저장소 몫 — main이 부른다). 모양이 틀린 항은 조용히 버리지 않고
 *  **그 키만** 떨군다(paint 파서의 규약 준용 — 숫자 아닌 값·모르는 키는 안 싣는다). */
export function brushTuneJson(): string {
  return JSON.stringify(tune)
}
export function loadBrushTune(json: string | null): void {
  for (const k of INSTRS58) delete tune[k]
  if (!json) return
  try {
    const raw = JSON.parse(json) as unknown
    if (typeof raw !== 'object' || raw === null) return
    for (const k of INSTRS58) {
      const v = (raw as Record<string, unknown>)[k]
      if (typeof v !== 'object' || v === null) continue
      const out: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(v)) {
        const def = (DEFAULTS[k] as unknown as Record<string, unknown>)[key]
        if (def === undefined) continue
        if (typeof def === 'number' && typeof val === 'number' && Number.isFinite(val)) out[key] = val
        else if (typeof def === 'string' && (val === 'source-over' || val === 'multiply' || val === 'band' || val === 'stamps' || val === 'bristles')) out[key] = val
        else if (Array.isArray(def) && Array.isArray(val) && val.length === 5 && val.every(x => typeof x === 'number' && Number.isFinite(x))) out[key] = val
      }
      if (Object.keys(out).length > 0) tune[k] = out as Partial<BrushDef>
    }
  } catch { /* 깨진 저장 — 기본값으로 */ }
}

/** 조정이 있는 도구 목록(진단·실험실 표시) */
export const tunedInstrs = (): Instr58[] => INSTRS58.filter(k => tune[k] !== undefined)
