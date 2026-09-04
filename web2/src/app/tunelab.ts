// 브러시 작업대(web2-58 58-5 · web2-61 판갈이) — **역할이 바뀌었다**(61 지시 문면):
// 「값을 찾는 곳」이 아니라 **「고른 브러시를 확인하고 미세 조정하는 곳」**이다.
//
// 손잡이는 **엔진의 매개변수**에 붙는다 — 이 파일은 이음매(core/paintseam)의 작업대
// 표면(brushChoices·params·setParam·…)만 알고, 그 뒤가 p5.brush(61)인지 mypaint(62)인지
// 모른다. 옛 판(BrushDef 손잡이 23 + 곡선 둘)은 옛 엔진과 함께 갔다(git 이력이 정본).
//
// 사는 것 셋(지시 문면): 「값 꺼내기」 · 「가져온다」 · 「굳힌다」(기기 저장 — 52 프리셋 자리).
// 시험 긋기와 제품 굽기는 **같은 함수**(이음매 drawMark)를 부른다(#54): 여기서 보이는
// 것과 면에 굽히는 것이 다를 수 없다.
//
// 자리: **설정에 숨는다**(R8). #97 대비: 시험 캔버스는 전역 `canvas` 규칙에 물리므로
// position·inset을 명시로 되돌리고, 줄들은 flex-shrink:0을 명시한다.

import { drawMark, paintRenderer, INSTRS58, type Instr58 } from '../core/paintseam'
import { MAT } from '../core/material'
import { C } from '../core/constants'
import type { Pt } from '../core/vec'

export const TUNE_STORE_KEY = 'b2.paintTune61.v1'
const STORE_KEY = TUNE_STORE_KEY

const INSTR_NAME: Record<Instr58, string> = { brush: '잉크펜', marker: '마커', cp: '색연필', pencil: '연필' }

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
  const eng = () => paintRenderer()
  // 부팅 — 기기에 굳힌 조정을 읽는다(깨진 저장은 loadTune이 키 단위로 떨군다)
  try { eng()?.loadTune?.(localStorage.getItem(STORE_KEY)) } catch { /* 사생활 모드 등 */ }

  let instr: Instr58 = 'pencil'
  let open = false
  /** 시험 획들 — {pts, press}. 손잡이가 움직이면 같은 획을 새 값으로 다시 긋는다. */
  let strokes: { pts: Pt[]; press: number[] }[] = []

  const root = document.createElement('div')
  root.id = 'tunelab'
  root.hidden = true
  // ⚠⚠ 표시는 **인라인 display로 직접** 관리한다(setOpen) — 58 초판이 cssText의 display:flex로
  // `hidden`을 이겨 패널이 투명하게 포인터를 삼킨 그 결함(#97의 사촌) 그대로의 처방이다.
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

  // ── 도구 고르기 ───────────────────────────────────────────────────────────
  const pickRow = row()
  const pickBtns = new Map<Instr58, HTMLButtonElement>()
  for (const k of INSTRS58) {
    const b = document.createElement('button')
    b.id = `tunelab-pick-${k}`
    b.dataset.act = 'state'
    b.textContent = INSTR_NAME[k]
    b.title = `${INSTR_NAME[k]}의 브러시·값을 연다`
    b.addEventListener('click', () => { instr = k; syncAll() })
    pickRow.append(b)
    pickBtns.set(k, b)
  }
  const tunedMark = document.createElement('span')
  tunedMark.id = 'tunelab-tuned'
  tunedMark.style.marginLeft = 'auto'
  pickRow.append(tunedMark)

  // ── 시험 긋기 판 — 제품과 같은 함수(이음매 drawMark · #54) ─────────────────
  const CV_W = 448, CV_H = 170
  const cv = document.createElement('canvas')
  cv.id = 'tunelab-cv'
  cv.width = CV_W * 2; cv.height = CV_H * 2                  // 또렷하게(고정 2배 — dpr 무관 결정)
  // **값 «옆»에 낙서판**(web2-60 · REFERENCE §3 Feather Stable Stroke): sticky — 패널을
  // 내려도 판이 위에 붙는다. #97의 전역 canvas 규칙을 명시로 덮는 것은 종전과 같다.
  cv.style.cssText = [
    'position:sticky', 'top:0', 'inset:auto', 'z-index:1',
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
  const drawOne = (s: { pts: Pt[]; press: number[] }, idx: number) => {
    drawMark(g, {
      pts: s.pts, press: s.press, wPx: 14 * 2, seed: 1000 + idx, tool: instr,
      color: instr === 'brush' ? MAT.HB.color : opts.hexOf(),
    })
  }
  const redrawScratch = () => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.clearRect(0, 0, cv.width, cv.height)
    g.fillStyle = '#fffdf8'                                   // 흰 판(면 텍스처 규약 — 곱의 항등 쪽)
    g.fillRect(0, 0, cv.width, cv.height)
    const all = [sampleStroke(), ...strokes]
    all.forEach((s, idx) => drawOne(s, idx))
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
    drawOne(drawing, strokes.length + 1)
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

  // ── 브러시 고르기(도구별 — 엔진의 후보 목록) ───────────────────────────────
  const brushRow = row()
  brushRow.id = 'tunelab-brushes'
  const brushLabel = document.createElement('span')
  brushLabel.textContent = '브러시'
  brushLabel.style.cssText = 'width:74px;flex-shrink:0'
  brushRow.append(brushLabel)
  const brushBtnWrap = document.createElement('div')
  brushBtnWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;flex:1'
  brushRow.append(brushBtnWrap)

  // ── 손잡이 — 엔진의 매개변수(데이터 — params()가 정본) ─────────────────────
  const knobWrap = document.createElement('div')
  knobWrap.id = 'tunelab-knobs'
  knobWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0'

  const rebuildKnobs = () => {
    knobWrap.replaceChildren()
    const list = eng()?.params?.(instr) ?? []
    for (const k of list) {
      const r = row()
      const lab = document.createElement('label')
      lab.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1'
      const name = document.createElement('span')
      name.textContent = k.label
      name.style.cssText = 'width:74px;flex-shrink:0'
      const range = document.createElement('input')
      range.type = 'range'
      range.id = `tunelab-k-${k.key}`
      range.min = String(k.min); range.max = String(k.max); range.step = String(k.step)
      range.value = String(k.value)
      range.style.cssText = 'flex:1;min-width:120px'
      const val = document.createElement('span')
      val.style.cssText = 'width:44px;text-align:right;flex-shrink:0'
      val.textContent = String(k.value)
      range.addEventListener('input', () => {
        eng()?.setParam?.(instr, k.key, Number(range.value))
        val.textContent = range.value
        redrawScratch()
        syncTunedMark()
      })
      range.addEventListener('change', () => opts.rebake())   // 놓을 때 제품(면 텍스처)도 따라온다
      lab.append(name, range, val)
      r.append(lab)
      knobWrap.append(r)
    }
  }

  const rebuildBrushes = () => {
    brushBtnWrap.replaceChildren()
    const e = eng()
    const cur = e?.brushOf?.(instr)
    for (const name of e?.brushChoices?.(instr) ?? []) {
      const b = document.createElement('button')
      b.id = `tunelab-b-${name}`
      b.dataset.act = 'state'
      b.textContent = name.includes('/') ? name.split('/')[1]! : name
      b.title = `${INSTR_NAME[instr]}를 «${name}» 브러시로 그린다(엔진 내장 — 출발점)`
      b.style.fontSize = '10px'
      b.classList.toggle('on', name === cur)
      b.addEventListener('click', () => {
        e?.setBrush?.(instr, name)
        syncAll()
        opts.rebake()
      })
      brushBtnWrap.append(b)
    }
  }

  // ── 발 — 기본값 · 굳힌다 ──────────────────────────────────────────────────
  const foot = row()
  const resetBtn = document.createElement('button')
  resetBtn.id = 'tunelab-reset'
  resetBtn.dataset.act = 'state'
  resetBtn.textContent = '기본값'
  resetBtn.title = '이 도구의 조정을 걷고 내장 기본으로 되돌린다(굳힌 것을 지우려면 이어서 「굳힌다」)'
  resetBtn.addEventListener('click', () => {
    eng()?.resetTune?.(instr)
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
      localStorage.setItem(STORE_KEY, eng()?.tuneJson?.() ?? '{}')
      opts.notify(`${INSTR_NAME[instr]} 값을 굳혔다 — 이 기기에 남는다`)
    } catch {
      opts.notify('기기 저장이 안 된다(사생활 모드?) — 값은 이 세션에만 산다')
    }
  })
  foot.append(resetBtn, bakeBtn)

  // ── 값을 밖으로(web2-60의 그 원칙 — 값을 «말로» 옮기지 않는다) ────────────────
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
    ioBox.value = eng()?.tuneJson?.() ?? '{}'
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
    eng()?.loadTune?.(ioBox.value)
    syncAll()
    opts.rebake()
    opts.notify('가져왔다(굳히려면 「굳힌다」)')
  })
  const ioBtns = document.createElement('div')
  ioBtns.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0'
  ioBtns.append(exportBtn, importBtn)
  ioRow.append(ioBox, ioBtns)

  root.append(head, pickRow, cv, cvRow, brushRow, knobWrap, foot, ioRow)

  const syncTunedMark = () => {
    const j = eng()?.tuneJson?.() ?? '{}'
    tunedMark.textContent = j !== '{}' ? '조정 있음' : ''
  }
  const syncAll = () => {
    for (const [k, b] of pickBtns) b.classList.toggle('on', k === instr)
    rebuildBrushes()
    rebuildKnobs()
    syncTunedMark()
    redrawScratch()
  }

  const api: TuneLab = {
    root,
    tuneJson: () => eng()?.tuneJson?.() ?? '{}',
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
