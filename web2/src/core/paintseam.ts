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

// ── web2-64: 슬롯의 «기본 브러시 id» — core의 것이다(이사: 62의 DEFAULT_PRESET은 app/mypaintpaint에 있었다).
// 왜 core인가: 옛 문서 이주(file.ts — 브러시 id 없는 칠 획 → 그 슬롯의 기본)가 이름만 필요하고 엔진은 몰라야 한다.
// 값은 62의 그것(AS-C186 — 세션의 선택 · CC0 프리셋 그대로) + 64-2의 색연필(app/brunelleschi 프리셋 — 64-2 절).
/** 연필 등급 → 프리셋(2H·H → 4H · F·HB → classic · B·2B → 2B) — 62 그대로 */
export const pencilOfGrade = (grade?: string): string =>
  grade === '2H' || grade === 'H' ? 'deevad/4H_pencil'
    : grade === 'B' || grade === '2B' ? 'deevad/2B_pencil' : 'classic/pencil'
export const DEFAULT_BRUSH: Readonly<Record<Instr58, string>> = {
  pencil: 'classic/pencil',            // 등급이 오면 pencilOfGrade가 가른다
  brush: 'deevad/liner',               // 잉크펜 — 제도 라이너(불투명 1 · AA 2)
  marker: 'brunelleschi/marker',       // web2-66 §2 — 납작한 촉(타원 도장 · 고정 각). 옛 기본 ramon/100%_Opaque는 원형이었다(사람 판정 「마커의 단면은 원형이 아니다」) — 그 값 위에 단면만 얹은 앱 프리셋
  cp: 'brunelleschi/colored_pencil',   // web2-64-2 — 색연필의 성질로 지은 앱 프리셋(ramon/B-pencil은 «연필»이었다)
}
/** 슬롯(+등급) → 기본 브러시 id — 이주·초기값·«지금 브러시 없음»의 폴백이 전부 이 한 함수다(#54) */
export const defaultBrushOf = (tool: Instr58, grade?: string): string =>
  tool === 'pencil' ? pencilOfGrade(grade) : DEFAULT_BRUSH[tool]

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
  /** 브러시 id(web2-62 — 고르개 견본·팔의 통로 → **web2-64: 제품 굽기도 넣는다**. 획이 `paint.br`로 브러시 id를
   *  들고(64-1 · 원칙 a) 굽기가 그것을 싣는다. 없으면 엔진이 슬롯 조정(tune) → 기본 표로 떨어진다 — 옛 팔·작업대의 길). */
  preset?: string
  /** web2-64 — 획의 불투명(0..1 · `paint.o`). 엔진의 불투명 배수에 곱한다. 없으면 1. */
  opacityK?: number
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

/** 자국 하나가 캔버스에 실제로 닿은 사각(대상 캔버스 px · 닫힌 구간). x1 < x0이면 «안 그렸다». */
export interface MarkBox { x0: number; y0: number; x1: number; y1: number }

export interface PaintRenderer {
  /** 'mypaint'(62) — 원장·진단이 어느 엔진이 그렸는지 값으로 남긴다(61의 'p5brush'는 64-6이 지웠다 — 렌더러는 하나다) */
  id: string
  draw(g: CanvasRenderingContext2D, m: SeamMark): void
  /** 묶음(굽기 최적화의 통로 — 없으면 이음매가 draw를 돈다). 그리는 차례는 목록 차례다. */
  drawMany?(g: CanvasRenderingContext2D, marks: SeamMark[]): void
  /** web2-65 — **누적 얹기**: 굽기(drawMany)가 세운 «살아 있는 층» 위에 자국 하나를 더 얹고
   *  그 자국의 사각만 다시 합성한다(`bg` = 획 없는 바탕 — 더티 사각을 여기서 되깐다).
   *  결과는 «전량 재굽기와 픽셀로 같다» — 층의 상태가 같고 자국 생성이 획마다 독립이기 때문이다
   *  (획마다 primeAt·newStroke·setRng로 리셋 · 덮임은 beginStroke가 앞 획의 상자를 지운다 —
   *  「0 아닌 덮임 ⊆ 마지막 획 상자」가 층의 불변식이다).
   *  층이 없으면(예산 축출·크기 변화) **null** — 부르는 쪽은 전량 재굽기로 떨어진다. */
  appendMark?(g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement): MarkBox | null
  /** 이 캔버스의 층이 살아 있는가(굽기가 세운 그대로 · 크기도 맞는가) */
  hasLayer?(canvas: HTMLCanvasElement): boolean
  /** 이 캔버스의 층을 놓는다(⑤ 메모리 — 안 보이는 면을 버릴 때 딸린 층도 같이) */
  releaseLayer?(canvas: HTMLCanvasElement): void
  /** web2-66 §1 ㉠㉡ — **초안 세션**: 그리는 중인 자국의 «새 점만» 층에 눌러 담고 그 사각만
   *  다시 합성한다. 이미 놓인 도장은 안 움직인다(게이트 ①). 반환 'rebuild' = 얼린 결정이
   *  갈렸다(부르는 쪽이 층을 다시 세우고 재먹임) · null = 세션 불가(옛 전량 판으로). */
  draftFeed?(g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement): MarkBox | 'rebuild' | null
  /** 세션의 획을 완결한다(남은 점 + 펜 떼기 + endStroke) — 층이 굽기로 얹은 것과 같아진다.
   *  null = 세션이 그 획이 아니다(부르는 쪽은 전량 재굽기로). */
  draftFinish?(g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement): MarkBox | null
  /** 세션을 버린다 — 층의 미완 도장은 부르는 쪽이 재굽기로 지운다 */
  draftCancel?(canvas: HTMLCanvasElement): void
  /** 이 캔버스에 초안 세션이 열려 있는가(진단) */
  draftOpen?(canvas: HTMLCanvasElement): boolean
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

/** web2-65 — 자국 하나를 **얹는다**(굽기가 세운 층 위에). 못 얹으면 null(전량 재굽기로 떨어진다). */
export function appendMarkSeam(
  g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement,
): MarkBox | null {
  if (!renderer) throw new Error('칠 렌더러가 등록되지 않았다 — main이 부팅에서 setPaintRenderer를 부른다')
  if (!renderer.appendMark || !renderer.hasLayer) return null
  if (!renderer.hasLayer(g.canvas)) return null
  if (m.pts.length < 2) return { x0: 0, y0: 0, x1: -1, y1: -1 }   // 점 하나 — 층도 화면도 안 바뀐다
  return renderer.appendMark(g, m, bg)
}
/** web2-66 — 초안 세션에 자국을 먹인다(새 점만). 'rebuild'/null의 뜻은 PaintRenderer.draftFeed. */
export function draftFeedSeam(
  g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement,
): MarkBox | 'rebuild' | null {
  if (!renderer?.draftFeed || !renderer.hasLayer) return null
  if (!renderer.hasLayer(g.canvas)) return null
  return renderer.draftFeed(g, m, bg)
}
/** web2-66 — 세션의 획을 완결한다(펜 떼기까지 — 굽기로 얹은 것과 같은 층). */
export function draftFinishSeam(
  g: CanvasRenderingContext2D, m: SeamMark, bg: HTMLCanvasElement,
): MarkBox | null {
  if (!renderer?.draftFinish || !renderer.hasLayer) return null
  if (!renderer.hasLayer(g.canvas)) return null
  return renderer.draftFinish(g, m, bg)
}
/** web2-66 — 세션을 버린다(층의 미완 도장은 부르는 쪽이 재굽기로 지운다). */
export const draftCancelSeam = (canvas: HTMLCanvasElement): void => { renderer?.draftCancel?.(canvas) }
/** web2-66 — 초안 세션 지원 여부(렌더러가 세 손잡이를 다 내놓는가) */
export const draftSeamSupported = (): boolean =>
  !!(renderer?.draftFeed && renderer.draftFinish && renderer.draftCancel && renderer.hasLayer)

/** 이 캔버스에 굽기가 세운 층이 살아 있는가 — 누적의 전제(값으로 보인다) */
export const paintLayerAlive = (canvas: HTMLCanvasElement): boolean =>
  renderer?.hasLayer?.(canvas) ?? false
/** 이 캔버스의 층을 놓는다(⑤ 메모리) */
export const releasePaintLayer = (canvas: HTMLCanvasElement): void => { renderer?.releaseLayer?.(canvas) }

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
