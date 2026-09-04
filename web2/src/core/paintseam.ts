// 칠 렌더러의 **이음매**(web2-61 지시 문면) — 엔진 중립.
//
//   들어가는 것   점렬(대상 캔버스 px) + 점별 압력(저장 눈금 0..PRESS_Q) + 색(hex) +
//                굵기(px) + 시드 + 도구 표식 + **대상 캔버스(2D 컨텍스트)**
//   나오는 것    그 캔버스에 그려진 자국
//
// **엔진은 이 뒤에 숨는다.** 부르는 쪽(facetex 굽기·미리보기 · 작업대 · 팔)은 등록된
// 렌더러가 p5.brush인지 mypaint(62)인지 모른다 — 62는 setPaintRenderer로 갈아끼운다.
// 등록은 부팅(main)이 한다 — core가 app을 모르는 방향을 지키는 주입 지점이다.

import type { Pt } from './vec'

/** 칠 도구 넷 — 획 저장 표식(paint.i)의 열거. 종전 brush58의 그 이름(이사 — 엔진 데이터
 *  (BrushDef)는 옛 엔진과 함께 갔고, 도구의 «이름»은 이음매의 것이다). */
export type Instr58 = 'brush' | 'marker' | 'cp' | 'pencil'
export const INSTRS58: readonly Instr58[] = ['brush', 'marker', 'cp', 'pencil']

/** 획의 저장 표식(paint.i) → 도구 이름. 0/undefined = 붓(50의 규약 그대로). */
export const instrOfTag = (i: number | undefined): Instr58 =>
  i === 1 ? 'marker' : i === 2 ? 'cp' : i === 3 ? 'pencil' : 'brush'

export interface SeamMark {
  /** 대상 캔버스 px 점렬(2점 이상) */
  pts: Pt[]
  /** 점별 압력 — 저장 눈금(0..C.PRESS_Q). 없으면 0.5 상수로 본다 */
  press?: number[]
  /** 자국 색(hex — 붓(흑연)은 부르는 쪽이 MAT 등급색을 넣는다) */
  color: string
  /** 굵기(대상 캔버스 px) */
  wPx: number
  /** 결정론 시드(제품 = 획 id) — Math.random ⛔ (§5) */
  seed: number
  /** 도구(brush·marker·cp·pencil) — 어느 브러시로 그릴지는 엔진의 일이다 */
  tool: Instr58
  /** 연필 등급(있으면 — 2B·HB·2H 갈래의 입력. 지시 「연필: 2B·HB·2H(등급에 따라)」) */
  grade?: string
  /** web2-62 — 브러시 이름(엔진이 알면 도구 슬롯 대신 이 브러시로 · 고르개 견본·팔의 통로.
   *  제품 굽기는 안 넣는다 — 저장 형식 무변: 획은 도구 표식(paint.i)뿐이다). */
  preset?: string
  /** web2-62 — 엔진 설정 기준값 덮개(팔·실험실 전용 — 키는 엔진의 설정 이름). 제품 경로는 안 넣는다. */
  over?: Record<string, number>
  /** web2-63 — 팁 이름('none' = 팁 없음 · 절차 타원). 팔·고르개 견본의 통로 — 제품 굽기는 안 넣는다(슬롯의 팁은 기기 조정 tune). */
  tip?: string
}

/** 실험실 손잡이 서술 — 엔진이 제 매개변수를 «데이터»로 내놓는다(작업대가 이것만 읽는다).
 *  62의 mypaint도 같은 꼴로 내놓는다 — 작업대는 엔진을 모른다. */
export interface ParamDesc {
  key: string
  label: string
  min: number
  max: number
  step: number
  value: number
}

export interface PaintRenderer {
  /** 'p5brush'(61) · 'mypaint'(62) — 원장·진단이 어느 엔진이 그렸는지 값으로 남긴다 */
  id: string
  draw(g: CanvasRenderingContext2D, m: SeamMark): void
  /** 묶음(굽기 최적화의 통로 — 없으면 이음매가 draw를 돈다). 그리는 차례는 목록 차례다. */
  drawMany?(g: CanvasRenderingContext2D, marks: SeamMark[]): void
  /** 작업대 몫(선택) — 도구별 브러시 후보·손잡이·조정 저장 */
  brushChoices?(tool: Instr58): string[]
  brushOf?(tool: Instr58): string
  setBrush?(tool: Instr58, name: string): void
  params?(tool: Instr58): ParamDesc[]
  setParam?(tool: Instr58, key: string, value: number): void
  resetTune?(tool: Instr58): void
  tuneJson?(): string
  loadTune?(json: string | null): void
  /** web2-63 — 슬롯의 팁(비트맵 도장): 후보 목록 · 지금 값('none' | 이름 | null = 프리셋 기본) · 앉히기 */
  tipChoices?(): readonly string[]
  tipOf?(tool: Instr58): string | null
  setTip?(tool: Instr58, name: string | null): void
}

let renderer: PaintRenderer | null = null

export function setPaintRenderer(r: PaintRenderer): void { renderer = r }
export const paintRendererId = (): string => renderer?.id ?? 'none'
export const paintRenderer = (): PaintRenderer | null => renderer

/** 한 자국을 긋는다 — 이음매의 전부. */
export function drawMark(g: CanvasRenderingContext2D, m: SeamMark): void {
  if (!renderer) throw new Error('칠 렌더러가 등록되지 않았다 — main이 부팅에서 setPaintRenderer를 부른다')
  if (m.pts.length < 2) return
  renderer.draw(g, m)
}

/** 여러 자국 — 굽기(bakeFaceTex)의 통로. 차례 = 목록 차례(그린 차례 = 쌓인 차례). */
export function drawMarksSeam(g: CanvasRenderingContext2D, marks: SeamMark[]): void {
  if (!renderer) throw new Error('칠 렌더러가 등록되지 않았다 — main이 부팅에서 setPaintRenderer를 부른다')
  const list = marks.filter(m => m.pts.length >= 2)
  // web2-62: 빈 목록도 drawMany에 «넘긴다» — 엔진이 그 캔버스의 층을 비울 기회다(획 전부를
  // 지운 면을 다시 구우면 옛 획의 유령이 층에 남는 것을 막는다). draw 갈래는 종전대로 안 부른다.
  if (renderer.drawMany) { renderer.drawMany(g, list); return }
  for (const m of list) renderer.draw(g, m)
}

// ── 반증 스위치(D-3 · #30 — e2e 전용 · 제품 경로는 안 부른다) — **엔진 중립**이라 이음매가
// 든다: 어느 엔진이 등록돼 있든 같은 뜻으로 걸린다(62 이월).
//   markerFlat  마커를 평면 덮어쓰기(겹침 계단이 죽는다 — mats46 ②의 반증)
//   paintOpaque 자국을 불투명으로(획 아래 비침이 죽는다 — paint50 · 52 1차 [1]의 반증)
//   pressFlat   압력을 상수로(압력 게이트가 죽는다 — 51 계열)
//   grainOff    종이 결 끔(결 게이트가 죽는다 — 59 ④ 계열)
let markerFlatOverride = false
export function setMarkerFlatForTest(v: boolean): void { markerFlatOverride = v }
export const markerFlatForTest = (): boolean => markerFlatOverride
let paintOpaqueOverride = false
export function setPaintOpaqueForTest(v: boolean): void { paintOpaqueOverride = v }
export const paintOpaqueForTest = (): boolean => paintOpaqueOverride
let pressFlatOverride = false
export function setPressFlatForTest(v: boolean): void { pressFlatOverride = v }
export const pressFlatForTest = (): boolean => pressFlatOverride
let grainOffOverride = false
export function setGrainOffForTest(v: boolean): void { grainOffOverride = v }
export const grainOffForTest = (): boolean => grainOffOverride
