// 브러시 작업대(web2-58 58-5) — **값을 말로 주고받는 것을 그만둔다.**
//
// 51·52가 두 번 실패한 자리: 사람은 연필 선이 어떤지 알지만 그것을 매개변수로 옮겨
// 적을 수 없다. 그래서 한 화면에서 ① 브러시를 고르고 ② 설정·매핑 곡선을 **전부**
// 손잡이로 열고 ③ 옆에서 바로 그어 보고 ④ 「굳힌다」로 기기에 남긴다(52 프리셋의 자리).
//
// **세션의 일은 값을 정하는 것이 아니라 «사람이 당긴 값을 정확히 굽는 것»이다** —
// 시험 긋기와 제품 굽기는 **같은 함수**(facetex.paintMark)를 부른다(#54): 여기서 보이는
// 것과 면에 굽히는 것이 다를 수 없다.
//
// 자리: **설정에 숨는다**(R8 — 도구가 아니라 작업대다. 평소 화면에 안 나온다).
// #97 대비: 시험 캔버스는 전역 `canvas { position:absolute; inset:0 }` 규칙에 물리므로
// position·inset을 **명시**로 되돌리고, 줄들은 flex-shrink:0을 명시한다.

import { paintMark, type MarkOpts } from '../core/facetex'
import {
  brushDef, brushDefault, setBrushTune, brushTuneJson, loadBrushTune, tunedInstrs, START_POINTS,
  INSTRS58, type Instr58, type BrushDef, type Curve5,
} from '../core/brush58'
import { MAT } from '../core/material'
import { C } from '../core/constants'
import type { Pt } from '../core/vec'

const STORE_KEY = 'b2.brushTune.v1'

const INSTR_NAME: Record<Instr58, string> = { brush: '붓', marker: '마커', cp: '색연필', pencil: '연필' }

/** 손잡이 명세 — 값 하나당 한 줄. min/max는 실험 대역(엔진 하한·상한과 다르다 — 작업대의 눈금). */
const KNOBS: { key: keyof BrushDef; name: string; min: number; max: number; step: number; tip: string }[] = [
  { key: 'spacingK', name: '간격', min: 0.05, max: 2, step: 0.01, tip: '도장 간격 — 굵기의 배수(거리 기반)' },
  { key: 'alpha', name: '불투명', min: 0.05, max: 1, step: 0.01, tip: '기저 불투명도' },
  { key: 'hardness', name: '경도', min: 0.1, max: 1, step: 0.01, tip: '도장 가장자리 — 1이면 딱딱한 원, 낮추면 풀린다' },
  { key: 'scatter', name: '산포', min: 0, max: 1.5, step: 0.01, tip: '진행 수직 흩뿌림 — 반지름의 배수' },
  { key: 'grainK', name: '결 크기', min: 0, max: 3, step: 0.01, tip: '결 격자 — 굵기의 배수(0 = 결 없음)' },
  { key: 'grainFloor', name: '결 깊이', min: 0, max: 1, step: 0.01, tip: '결의 최소 통과율 — 낮을수록 결이 깊다' },
  { key: 'tipAlpha', name: '끝 강조', min: 0, max: 1, step: 0.01, tip: '양 끝 원 강조(51의 마커 팁 — 58 기본 0)' },
  { key: 'tipLenK', name: '끝 크기', min: 0.2, max: 2, step: 0.05, tip: '끝 원의 크기 — 굵기의 배수' },
  { key: 'bristles', name: '빗살 수', min: 2, max: 12, step: 1, tip: '붓 빗살 수(bristles 모드)' },
  { key: 'splitT', name: '갈라짐 시작', min: 0.5, max: 1, step: 0.01, tip: '끝 갈라짐이 시작되는 진행도(1 = 없음)' },
  { key: 'splitK', name: '갈라짐 폭', min: 0, max: 2, step: 0.01, tip: '끝 갈라짐의 발산 폭 — 굵기의 배수' },
  { key: 'cpSkipTh', name: '구멍 문턱', min: 0, max: 1, step: 0.01, tip: '색연필 빈 알갱이 — 결이 문 아래인 칸이 뚫린다' },
  { key: 'cpSkipAlpha', name: '구멍 잔량', min: 0, max: 0.7, step: 0.01, tip: '뚫린 칸에 남는 안료' },
  // web2-60 — 압력이 문턱을 움직인다(60-2) · 속도·방향 축(60-4 — 58이 물어 둔 다섯 중 둘)
  { key: 'cpBurnish', name: '문턱↔압력', min: 0, max: 1, step: 0.01, tip: '세게 누르면 구멍이 메워진다 — 문턱 = 구멍 문턱 + 이 값 × (0.5 − 압력). 0이면 문턱 고정' },
  { key: 'speedAlphaK', name: '속도→농도', min: -1, max: 1, step: 0.01, tip: '빠른 구간이 옅어진다(+) / 진해진다(−). 속도 = 표본 간격 ÷ 굵기' },
  { key: 'speedWidthK', name: '속도→굵기', min: -1, max: 1, step: 0.01, tip: '빠른 구간이 굵어진다(+) / 가늘어진다(−)' },
  { key: 'dirK', name: '납작한 촉', min: 0, max: 1, step: 0.01, tip: '촉 축과 나란한 획이 가늘어진다 — 0이면 원형 촉' },
  { key: 'dirAngle', name: '촉 각도', min: -90, max: 90, step: 1, tip: '납작한 촉의 축(도 · 화면 기준 · 손을 따라간다 — 획을 따라가지 않는다)' },
]

/** 모드별 유효 축(2차 [6]) — 무효 손잡이는 비활성으로 **보인다**(사람이 헛되이 밀지 않게).
 *  ⚠ cpSkip*는 stamps 모드 전반에서 유효하다(문턱>0이 구멍 갈래를 «켠다» — 연필도 그 축을
 *  당길 수 있는 것이 데이터 모델의 사실 · gate_lab matrix가 값). */
const RELEVANT: Record<BrushDef['mode'], readonly string[]> = {
  band: ['alpha', 'tipAlpha', 'tipLenK'],
  stamps: ['spacingK', 'alpha', 'hardness', 'scatter', 'grainK', 'grainFloor', 'cpSkipTh', 'cpSkipAlpha',
    'cpBurnish', 'speedAlphaK', 'speedWidthK', 'dirK', 'dirAngle'],
  bristles: ['spacingK', 'alpha', 'hardness', 'scatter', 'bristles', 'splitT', 'splitK',
    'speedAlphaK', 'speedWidthK', 'dirK', 'dirAngle'],
}
// ⚠ 전제 축(문턱↔압력은 구멍 문턱 > 0 · 촉 각도는 납작한 촉 > 0 · 끝 크기는 끝 강조 > 0)을 전제가
// 꺼지면 비활성으로 «보이게» 하는 판은 검토 후 기각했다(D-W28) — mark58 ④의 «반응 + 비활성 ==
// 전체» 항등(전제를 켜고 재면 반응에 든다)과 충돌한다. 58 2차 [6] 규약 그대로: 비활성은 모드 기준.
const curvesRelevant = (mode: BrushDef['mode']): boolean => mode !== 'band'

export interface TuneLab {
  root: HTMLElement
  /** 진단·팔 — 조정 전부(JSON · 「값 꺼내기」와 같은 함수) */
  tuneJson(): string
  isOpen(): boolean
  setOpen(v: boolean): void
}

export function initTuneLab(opts: {
  /** 지금 색(hex) — 칠통의 그 값(#54: paintSel 하나) */
  hexOf: () => string
  /** 조정이 제품에 반영되게 — 면 텍스처 재굽기 + 다시 그리기 */
  rebake: () => void
  /** 알림 한 줄 */
  notify: (msg: string) => void
}): TuneLab {
  // 부팅 — 기기에 굳힌 조정을 읽는다(깨진 저장은 loadBrushTune이 키 단위로 떨군다)
  try { loadBrushTune(localStorage.getItem(STORE_KEY)) } catch { /* 사생활 모드 등 */ }

  let instr: Instr58 = 'pencil'
  let open = false
  /** 시험 획들 — {pts, press}. 손잡이가 움직이면 같은 획을 새 값으로 다시 긋는다. */
  let strokes: { pts: Pt[]; press: number[] }[] = []

  const root = document.createElement('div')
  root.id = 'tunelab'
  root.hidden = true
  // ⚠⚠ 표시는 **인라인 display로 직접** 관리한다(setOpen) — 초판이 cssText에 display:flex를
  // 박아 `hidden`(UA 규칙 · non-important)을 **이겼고**, 패널이 부팅부터 화면 오른쪽을
  // 투명하게 덮어 x≥716에서 시작하는 획의 포인터를 삼켰다(mark58 표식이 잡음 — 8획 중
  // 3획 미커밋). #97의 사촌: 스타일 검사로는 안 잡힌다 — 선언은 전부 유효하고 우선순위만
  // 틀리다.
  root.style.cssText = [
    'position:fixed', 'right:12px', 'top:56px', 'width:472px', 'max-height:calc(100vh - 80px)',
    'overflow-y:auto', 'background:#f6f3ec', 'border:1px solid #c9c2b4', 'border-radius:8px',
    'box-shadow:0 6px 24px rgba(60,56,49,.25)', 'padding:10px', 'z-index:40',
    'display:none', 'flex-direction:column', 'gap:8px', 'font-size:12px', 'color:#3c3831',
  ].join(';')

  const row = (gap = 6): HTMLDivElement => {
    const d = document.createElement('div')
    d.style.cssText = `display:flex;align-items:center;gap:${gap}px;flex-shrink:0`   // #97
    return d
  }

  // ── 머리 — 이름 + 닫기 ────────────────────────────────────────────────────
  const head = row()
  const title = document.createElement('b')
  title.textContent = '브러시 작업대'
  title.style.flex = '1'
  const closeBtn = document.createElement('button')
  closeBtn.id = 'tunelab-close'
  closeBtn.dataset.act = 'state'
  closeBtn.textContent = '닫는다'
  closeBtn.title = '작업대를 닫는다 — 굳히지 않은 조정도 이 세션에는 남는다'
  closeBtn.addEventListener('click', () => api.setOpen(false))
  head.append(title, closeBtn)

  // ── 브러시 고르기 ─────────────────────────────────────────────────────────
  const pickRow = row()
  const pickBtns = new Map<Instr58, HTMLButtonElement>()
  for (const k of INSTRS58) {
    const b = document.createElement('button')
    b.id = `tunelab-pick-${k}`
    b.dataset.act = 'state'
    b.textContent = INSTR_NAME[k]
    b.title = `${INSTR_NAME[k]} 브러시의 값을 연다`
    b.addEventListener('click', () => { instr = k; syncAll() })
    pickRow.append(b)
    pickBtns.set(k, b)
  }
  const tunedMark = document.createElement('span')
  tunedMark.id = 'tunelab-tuned'
  tunedMark.style.marginLeft = 'auto'
  pickRow.append(tunedMark)

  // ── 시험 긋기 판 — 제품과 같은 paintMark(#54) ─────────────────────────────
  const CV_W = 448, CV_H = 170
  const cv = document.createElement('canvas')
  cv.id = 'tunelab-cv'
  cv.width = CV_W * 2; cv.height = CV_H * 2                  // 또렷하게(고정 2배 — dpr 무관 결정)
  // **값 «옆»에 낙서판**(web2-60 60-4 · REFERENCE §3 Feather Stable Stroke): 패널이 스크롤돼도
  // 시험 판이 위에 붙어 있어 손잡이를 당기는 그 자리에서 자국을 본다(따로 떨어진 판이 아니다).
  // position:sticky — #97의 전역 canvas 규칙(absolute · inset:0)을 명시로 덮는 것은 종전과 같다.
  cv.style.cssText = [
    'position:sticky', 'top:0', 'inset:auto', 'z-index:1',    // #97 — 전역 canvas 규칙을 명시로 되돌린다(sticky)
    `width:${CV_W}px`, `height:${CV_H}px`, 'background:#fffdf8',
    'border:1px solid #d8d2c4', 'border-radius:4px', 'touch-action:none', 'flex-shrink:0',
  ].join(';')
  cv.title = '여기에 그어 본다 — 지금 값의 자국이 그대로 남는다(제품과 같은 함수)'

  /** 견본 획 — 판이 비어 보이지 않게, 그리고 손잡이가 «즉시» 보이게. 압력이 0.2→1→0.4로
   *  변하는 완만한 S자 하나(결정론 — 난수 없음). 사람이 그으면 그 획들이 위에 쌓인다. */
  const sampleStroke = (): { pts: Pt[]; press: number[] } => {
    const pts: Pt[] = []
    const press: number[] = []
    const n = 48
    for (let k = 0; k <= n; k++) {
      const t = k / n
      pts.push({
        x: (24 + t * (CV_W - 48)) * 2,
        y: (CV_H / 2 + Math.sin(t * Math.PI * 1.6) * 34) * 2,
      })
      const p = t < 0.5 ? 0.2 + 1.6 * t : 1 - 1.2 * (t - 0.5)
      press.push(Math.max(0.1, Math.min(1, p)) * C.PRESS_Q)
    }
    return { pts, press }
  }

  const g = cv.getContext('2d')!
  const redrawScratch = () => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, cv.width, cv.height)
    const def = brushDef(instr)
    const w = 14 * 2                                          // 시험 굵기(고정 — 굵기 자체는 칠통 슬라이더의 몫)
    const all = [sampleStroke(), ...strokes]
    all.forEach((s, idx) => {
      const o: MarkOpts = {
        color: instr === 'brush' ? MAT.HB.color : opts.hexOf(),
        baseAlpha: MAT.HB.alpha,
        seed: 1000 + idx,
        grainWpx: w,
        press: s.press,
      }
      paintMark(g, s.pts, w, def, o)
    })
  }

  // 긋기 입력 — 포인터 그대로(펜이면 압력이 실린다)
  let drawing: { pts: Pt[]; press: number[] } | null = null
  const toCv = (e: PointerEvent): Pt => {
    const r = cv.getBoundingClientRect()
    return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2 }
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId)
    drawing = { pts: [toCv(e)], press: [(e.pressure > 0 ? e.pressure : 0.5) * C.PRESS_Q] }
  })
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return
    drawing.pts.push(toCv(e))
    drawing.press.push((e.pressure > 0 ? e.pressure : 0.5) * C.PRESS_Q)
    redrawScratch()
    const def = brushDef(instr)
    paintMark(g, drawing.pts, 14 * 2, def, {
      color: instr === 'brush' ? MAT.HB.color : opts.hexOf(),
      baseAlpha: MAT.HB.alpha, seed: 1000 + strokes.length + 1, grainWpx: 14 * 2, press: drawing.press,
    })
  })
  const endDraw = () => {
    if (!drawing) return
    if (drawing.pts.length >= 2) strokes.push(drawing)
    drawing = null
    redrawScratch()
  }
  cv.addEventListener('pointerup', endDraw)
  cv.addEventListener('pointercancel', endDraw)

  const cvRow = row()
  const clearBtn = document.createElement('button')
  clearBtn.id = 'tunelab-clear'
  clearBtn.dataset.act = 'state'
  clearBtn.textContent = '판 비우기'
  clearBtn.title = '시험 획을 지운다 — 값은 그대로다'
  clearBtn.addEventListener('click', () => { strokes = []; redrawScratch() })
  cvRow.append(clearBtn)

  // ── 손잡이 전수 ──────────────────────────────────────────────────────────
  const knobWrap = document.createElement('div')
  knobWrap.id = 'tunelab-knobs'
  knobWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0'
  const knobEls = new Map<string, { range: HTMLInputElement; val: HTMLSpanElement }>()
  for (const k of KNOBS) {
    const r = row()
    const lab = document.createElement('label')
    lab.title = k.tip
    lab.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1'
    const name = document.createElement('span')
    name.textContent = k.name
    name.style.cssText = 'width:74px;flex-shrink:0'
    const range = document.createElement('input')
    range.type = 'range'
    range.id = `tunelab-k-${String(k.key)}`
    range.min = String(k.min); range.max = String(k.max); range.step = String(k.step)
    range.style.cssText = 'flex:1;min-width:120px'
    const val = document.createElement('span')
    val.style.cssText = 'width:44px;text-align:right;flex-shrink:0'
    range.addEventListener('input', () => {
      setBrushTune(instr, { [k.key]: Number(range.value) } as Partial<BrushDef>)
      val.textContent = range.value
      redrawScratch()
      syncTunedMark()
    })
    range.addEventListener('change', () => opts.rebake())     // 놓을 때 제품(면 텍스처)도 따라온다
    lab.append(name, range, val)
    r.append(lab)
    knobWrap.append(r)
    knobEls.set(String(k.key), { range, val })
  }

  // ── 매핑 곡선 둘(압력 → 농도·굵기) — 다섯 점 ────────────────────────────────
  const curveWrap = document.createElement('div')
  curveWrap.id = 'tunelab-curves'
  curveWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0'
  const curveEls = new Map<string, HTMLInputElement[]>()
  const curveVals = new Map<string, HTMLSpanElement>()
  for (const ck of ['density', 'width'] as const) {
    const r = row(4)
    const name = document.createElement('span')
    name.textContent = ck === 'density' ? '압력→농도' : '압력→굵기'
    name.title = '다섯 점 곡선 — 압력 0 · ¼ · ½ · ¾ · 1에서의 값'
    name.style.cssText = 'width:74px;flex-shrink:0'
    r.append(name)
    const els: HTMLInputElement[] = []
    for (let i = 0; i < 5; i++) {
      const range = document.createElement('input')
      range.type = 'range'
      range.id = `tunelab-c-${ck}-${i}`
      range.min = '0'; range.max = ck === 'width' ? '1.5' : '1'; range.step = '0.01'   // 굵기 배수는 1을 넘는다(51 식 1.15)
      range.title = `압력 ${['0', '¼', '½', '¾', '1'][i]}에서의 ${ck === 'density' ? '농도' : '굵기 배수'}`
      range.style.cssText = 'width:64px;flex-shrink:0'
      range.addEventListener('input', () => {
        const cur = [...brushDef(instr)[ck]] as Curve5
        cur[i] = Number(range.value)
        setBrushTune(instr, { [ck]: cur } as Partial<BrushDef>)
        curveVals.get(ck)!.textContent = cur.map(v => v.toFixed(2)).join('·')
        redrawScratch()
        syncTunedMark()
      })
      range.addEventListener('change', () => opts.rebake())
      els.push(range)
      r.append(range)
    }
    // 값 표찰(R6 · 2차 [8]) — 다섯 점의 현재 값 한 줄
    const vals = document.createElement('span')
    vals.id = `tunelab-cvals-${ck}`
    vals.style.cssText = 'font-size:10px;color:#6b6558;flex-shrink:0'
    r.append(vals)
    curveVals.set(ck, vals)
    curveEls.set(ck, els)
    curveWrap.append(r)
  }

  // ── 발 — 기본값 · 굳힌다 ──────────────────────────────────────────────────
  const foot = row()
  const resetBtn = document.createElement('button')
  resetBtn.id = 'tunelab-reset'
  resetBtn.dataset.act = 'state'
  resetBtn.textContent = '기본값'
  resetBtn.title = '이 브러시의 조정을 걷고 기본값으로 되돌린다(굳힌 것을 지우려면 이어서 「굳힌다」)'
  resetBtn.addEventListener('click', () => {
    setBrushTune(instr, null)
    syncAll()
    opts.rebake()
  })
  const bakeBtn = document.createElement('button')
  bakeBtn.id = 'tunelab-bake'
  bakeBtn.dataset.act = 'state'
  bakeBtn.textContent = '굳힌다'
  bakeBtn.title = '지금 값을 이 기기에 남긴다(문서가 아니다 — 52 프리셋의 그 자리)'
  bakeBtn.addEventListener('click', () => {
    try {
      localStorage.setItem(STORE_KEY, brushTuneJson())
      opts.notify(`${INSTR_NAME[instr]} 값을 굳혔다 — 이 기기에 남는다`)
    } catch {
      opts.notify('기기 저장이 안 된다(사생활 모드?) — 값은 이 세션에만 산다')
    }
  })
  // mypaint 출발점(2차 [13] — CC0 mypaint-brushes pencil.myb의 값만 · NOTES 58 대조표):
  // 사람이 한 번 눌러 비교하는 «출발점»이지 세션의 최종값이 아니다(굳히기 전에는 세션뿐).
  const mypaintBtn = document.createElement('button')
  mypaintBtn.id = 'tunelab-mypaint'
  mypaintBtn.dataset.act = 'state'
  mypaintBtn.textContent = 'mypaint 출발점'
  mypaintBtn.textContent = '출발점'
  mypaintBtn.title = '출발점 값을 지금 도구에 얹어 본다(세션뿐 — 마음에 들면 「굳힌다」). 연필·붓·마커: mypaint 연필(CC0 — 값만: 간격 w/8 · 경도 0.1 · 불투명 0.7 · 산포 0.5 · 압력→농도 0→1) · 색연필: 60-2 조사 값(알파 0.35 · 문턱 0.5 · 문턱↔압력 0.7 · 경도 0.6 · 납작한 촉 0.35)'
  mypaintBtn.addEventListener('click', () => {
    setBrushTune(instr, { ...START_POINTS[instr] })           // 도구별 출발점(brush58.START_POINTS — 출처는 그 표)
    syncAll()
    opts.rebake()
  })
  foot.append(resetBtn, mypaintBtn, bakeBtn)

  // ── 값을 밖으로(web2-60 60-4 — 「굳힌 값이 기기에만 있으면 다음 세션이 못 읽는다」) ──────
  // 조정 전부(브러시 넷)를 JSON 한 덩이로 보이고(선택해 복사 · 클립보드 단추), 붙여 넣어
  // 가져온다(loadBrushTune — 깨진 항은 키 단위로 떨군다 · 그 뒤 재굽기). 사람이 채팅에 붙이면
  // 다음 세션이 같은 값을 읽는다 — 값을 «말로» 옮기지 않는다(58-5의 그 원칙의 밖으로 판).
  const ioRow = row()
  const ioBox = document.createElement('textarea')
  ioBox.id = 'tunelab-json'
  ioBox.rows = 3
  ioBox.spellcheck = false
  ioBox.style.cssText = 'flex:1;min-width:120px;font:11px/1.3 ui-monospace,monospace;resize:vertical'
  ioBox.title = '조정 값 전부(JSON) — 복사해 채팅에 붙이면 다음 세션이 읽는다. 붙여 넣고 「가져온다」'
  const exportBtn = document.createElement('button')
  exportBtn.id = 'tunelab-export'
  exportBtn.dataset.act = 'state'
  exportBtn.textContent = '값 꺼내기'
  exportBtn.title = '지금 조정 전부를 JSON으로 아래 칸에 쓰고 클립보드에 복사한다'
  exportBtn.addEventListener('click', () => {
    ioBox.value = brushTuneJson()
    ioBox.select()
    try { void navigator.clipboard?.writeText(ioBox.value) } catch { /* 클립보드 없음 — 칸에서 복사 */ }
    opts.notify('조정 값을 아래 칸에 썼다(클립보드에도) — 채팅에 붙이면 다음 세션이 읽는다')
  })
  const importBtn = document.createElement('button')
  importBtn.id = 'tunelab-import'
  importBtn.dataset.act = 'state'
  importBtn.textContent = '가져온다'
  importBtn.title = '아래 칸의 JSON을 조정으로 얹는다(세션뿐 — 남기려면 「굳힌다」)'
  importBtn.addEventListener('click', () => {
    loadBrushTune(ioBox.value)
    syncAll()
    opts.rebake()
    opts.notify(`가져왔다 — 조정: ${tunedInstrs().map(k => INSTR_NAME[k]).join('·') || '없음'}(굳히려면 「굳힌다」)`)
  })
  const ioBtns = document.createElement('div')
  ioBtns.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0'
  ioBtns.append(exportBtn, importBtn)
  ioRow.append(ioBox, ioBtns)

  root.append(head, pickRow, cv, cvRow, knobWrap, curveWrap, foot, ioRow)

  const syncTunedMark = () => {
    const t = tunedInstrs()
    tunedMark.textContent = t.length > 0 ? `조정: ${t.map(k => INSTR_NAME[k]).join('·')}` : ''
  }
  const syncAll = () => {
    for (const [k, b] of pickBtns) b.classList.toggle('on', k === instr)
    const def = brushDef(instr)
    const rel = RELEVANT[def.mode]
    for (const k of KNOBS) {
      const el = knobEls.get(String(k.key))!
      el.range.value = String(def[k.key])
      el.val.textContent = String(def[k.key])
      // 무효 축은 비활성(2차 [6] — «적어도 한 도구»가 아니라 «지금 이 도구»를 보인다)
      const on = rel.includes(String(k.key))
      el.range.disabled = !on
      const rowEl = el.range.closest('label')?.parentElement as HTMLElement | null
      if (rowEl) rowEl.style.opacity = on ? '1' : '0.35'
    }
    for (const ck of ['density', 'width'] as const) {
      const els = curveEls.get(ck)!
      const on = curvesRelevant(def.mode)
      def[ck].forEach((y, i) => {
        els[i]!.value = String(y)
        els[i]!.disabled = !on
      })
      curveVals.get(ck)!.textContent = def[ck].map(v => v.toFixed(2)).join('·')
      const rowEl = els[0]!.parentElement as HTMLElement | null
      if (rowEl) rowEl.style.opacity = on ? '1' : '0.35'
    }
    syncTunedMark()
    redrawScratch()
  }

  const api: TuneLab = {
    root,
    tuneJson: () => brushTuneJson(),
    isOpen: () => open,
    setOpen(v: boolean) {
      open = v
      root.hidden = !v
      root.style.display = v ? 'flex' : 'none'   // hidden만으로는 인라인 display를 못 이긴다(위 ⚠)
      if (v) syncAll()
    },
  }
  document.body.append(root)
  return api
}

/** 진단·팔의 손잡이 — 기본값 정의(반증·대조용) */
export const tuneLabDefault = brushDefault
