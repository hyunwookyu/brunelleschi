// 브러시 고르개(web2-62) — 196개를 **분류로 접어** 보이고, 칸마다 그 브러시의 «실제 자국 견본»을
// 그 자리에서 낸다(지시: 「견본은 그리는 그 함수로 그 자리에서 낸다 — 문서의 미리보기 PNG를
// 쓰지 마라」). 견본은 이음매 drawMark(제품과 같은 함수 #54)에 preset을 실어 긋는다.
//
// 고르면 **지금 도구 슬롯**(칠통의 연필·잉크펜·마커·색연필)에 그 브러시가 앉는다 — 저장 형식은
// 안 바뀐다(획은 도구 표식뿐 · 슬롯↔브러시는 기기 조정 tune이고 곧바로 굳힌다(localStorage —
// 작업대의 그 열쇠)). 자리: 칠통의 「브러시…」 단추 → 이 판. R7(한 번에 통 하나)은 registerBox.

import { drawMark, paintRenderer, type Instr58 } from '../core/paintseam'
import { PRESET_CATALOG, PRESET_BY_NAME } from './mypaintpaint'
import { MAT } from '../core/material'
import { C } from '../core/constants'
import { TUNE_STORE_KEY } from './tunelab'

const INSTR_NAME: Record<Instr58, string> = { brush: '잉크펜', marker: '마커', cp: '색연필', pencil: '연필' }

export interface BrushPicker {
  root: HTMLElement
  isOpen(): boolean
  setOpen(v: boolean): void
}

export function initBrushPicker(opts: {
  toolOf: () => Instr58
  hexOf: () => string
  onPick: (tool: Instr58, name: string) => void
  notify: (msg: string) => void
}): BrushPicker {
  const root = document.createElement('div')
  root.id = 'brushpick'
  root.hidden = true
  root.style.cssText = [
    'position:fixed', 'right:12px', 'top:56px', 'width:400px', 'max-height:calc(100vh - 80px)',
    'overflow-y:auto', 'background:#f6f3ec', 'border:1px solid #c9c2b4', 'border-radius:8px',
    'box-shadow:0 6px 24px rgba(60,56,49,.25)', 'padding:10px', 'z-index:40',
    'display:none', 'flex-direction:column', 'gap:6px', 'font-size:12px', 'color:#3c3831',
  ].join(';')

  const head = document.createElement('div')
  head.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0'
  const title = document.createElement('b')
  title.id = 'brushpick-title'
  title.style.flex = '1'
  const closeBtn = document.createElement('button')
  closeBtn.id = 'brushpick-close'
  closeBtn.dataset.act = 'state'
  closeBtn.textContent = '닫는다'
  closeBtn.title = '고르개를 닫는다'
  closeBtn.addEventListener('click', () => api.setOpen(false))
  head.append(title, closeBtn)

  const note = document.createElement('div')
  note.style.cssText = 'font-size:11px;color:#6b665c;flex-shrink:0'
  note.textContent = '분류를 열면 견본이 그려진다(제품과 같은 함수). 누르면 지금 도구 자리에 앉는다 — 이 기기에 남는다.'

  // web2-63 — 팁 줄: 지금 슬롯의 비트맵 팁(없음 · 다섯) — 프리셋 기본(null)이면 «기본» 표시. 기기 조정(tune.tip)이고 곧바로 굳힌다.
  const tipRow = document.createElement('div')
  tipRow.id = 'brushpick-tips'
  tipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;flex-shrink:0;padding:2px 0;border-bottom:1px solid #d8d2c4'
  const buildTips = (): void => {
    tipRow.replaceChildren()
    const r = paintRenderer()
    if (!r?.tipChoices || !r.tipOf || !r.setTip) return
    const tool = opts.toolOf()
    const cur = r.tipOf(tool)
    const lab = document.createElement('span')
    lab.textContent = `팁(도장 비트맵) — ${INSTR_NAME[tool]}:`
    lab.style.cssText = 'font-weight:600'
    tipRow.append(lab)
    const items: { key: string | null; label: string; title: string }[] = [
      { key: null, label: '기본', title: '프리셋의 기본 팁(연필·목탄·파스텔·마른붓·색연필 계열은 팁 · 잉크·마커는 없음)' },
      { key: 'none', label: '없음', title: '절차 타원 도장(62 그대로)' },
      ...r.tipChoices().map(n => ({ key: n, label: n, title: `${n} — tips/src/tips.json의 출처·라이선스(CC0)` })),
    ]
    for (const it of items) {
      const b = document.createElement('button')
      b.id = `brushpick-tip-${it.key ?? 'default'}`
      b.dataset.act = 'state'
      b.dataset.tip = it.key ?? 'default'
      b.textContent = it.label
      b.title = it.title
      b.classList.toggle('on', cur === it.key)
      b.addEventListener('click', () => {
        r.setTip!(tool, it.key)
        persistTune()
        for (const q of tipRow.querySelectorAll('button')) q.classList.toggle('on', q === b)
        // 견본을 다시 그린다(팁이 바뀌면 자국이 바뀐다)
        for (const [name, cv] of samples) if (drawn.has(cv)) sampleOf(name, cv)
        opts.notify(`${INSTR_NAME[tool]} 팁 ← ${it.label}(이 기기에 남는다)`)
      })
      tipRow.append(b)
    }
  }

  const list = document.createElement('div')
  list.id = 'brushpick-list'
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px'

  const CV_W = 176, CV_H = 30
  const drawn = new Set<HTMLCanvasElement>()
  const samples = new Map<string, HTMLCanvasElement>()

  const sampleOf = (name: string, cv: HTMLCanvasElement): void => {
    const g = cv.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.fillStyle = '#fffdf8'
    g.fillRect(0, 0, cv.width, cv.height)
    const tool = opts.toolOf()
    const pts: { x: number; y: number }[] = []
    const press: number[] = []
    const n = 40
    for (let k = 0; k <= n; k++) {
      const t = k / n
      pts.push({ x: (12 + t * (CV_W - 24)) * 2, y: (CV_H / 2 + Math.sin(t * Math.PI * 1.6) * 7) * 2 })
      const p = t < 0.5 ? 0.25 + 1.5 * t : 1 - 1.1 * (t - 0.5)
      press.push(Math.max(0.1, Math.min(1, p)) * C.PRESS_Q)
    }
    try {
      drawMark(g, {
        pts, press, wPx: 9 * 2, seed: 62, tool, preset: name,
        color: tool === 'brush' ? MAT.HB.color : opts.hexOf(),
      })
    } catch {
      g.fillStyle = '#b04a3a'; g.font = '11px system-ui'; g.fillText('견본 실패', 6, 18)
    }
  }

  const build = (): void => {
    list.replaceChildren()
    samples.clear(); drawn.clear()
    const tool = opts.toolOf()
    const cur = paintRenderer()?.brushOf?.(tool)
    for (const cat of PRESET_CATALOG) {
      const det = document.createElement('details')
      det.className = 'brushpick-group'
      det.dataset.group = cat.group
      const sum = document.createElement('summary')
      sum.textContent = `${cat.group} (${cat.names.length})`
      sum.title = `${cat.group} 분류를 연다`
      sum.style.cssText = 'cursor:pointer;font-weight:600;padding:3px 0'
      det.append(sum)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:2px 0 6px 8px'
      for (const name of cat.names) {
        const row = document.createElement('button')
        row.id = `brushpick-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        row.dataset.name = name
        row.dataset.act = 'state'
        row.classList.toggle('on', name === cur)
        row.title = `${name} — ${PRESET_BY_NAME.get(name)?.desc || '설명 없음'}. 누르면 ${INSTR_NAME[tool]} 자리에 앉는다`
        row.style.cssText = 'display:flex;align-items:center;gap:8px;text-align:left;padding:2px 4px'
        const cv = document.createElement('canvas')
        cv.width = CV_W * 2; cv.height = CV_H * 2
        cv.style.cssText = `width:${CV_W}px;height:${CV_H}px;position:static;inset:auto;flex-shrink:0;border:1px solid #d8d2c4;border-radius:3px;background:#fffdf8`
        const lab = document.createElement('span')
        lab.textContent = name.split('/')[1] ?? name
        lab.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
        row.append(cv, lab)
        row.addEventListener('click', () => {
          opts.onPick(tool, name)
          for (const b of list.querySelectorAll('button[data-name]')) b.classList.toggle('on', (b as HTMLElement).dataset.name === name)
          opts.notify(`${INSTR_NAME[tool]} ← ${name}(이 기기에 남는다)`)
        })
        samples.set(name, cv)
        wrap.append(row)
      }
      det.append(wrap)
      det.addEventListener('toggle', () => {
        if (!det.open) return
        // 분류를 열 때 그 분류의 견본만 그린다(196개를 한 번에 그리지 않는다 — 여는 만큼)
        for (const name of cat.names) {
          const cv = samples.get(name)!
          if (drawn.has(cv)) continue
          sampleOf(name, cv)
          drawn.add(cv)
        }
      })
      list.append(det)
    }
    title.textContent = `브러시 고르개 — ${INSTR_NAME[tool]} 자리${cur ? ` · 지금 ${cur}` : ''}`
    buildTips()
  }

  root.append(head, note, tipRow, list)
  let open = false
  const api: BrushPicker = {
    root,
    isOpen: () => open,
    setOpen(v: boolean) {
      open = v
      root.hidden = !v
      root.style.display = v ? 'flex' : 'none'
      if (v) build()
    },
  }
  document.body.append(root)
  return api
}

/** 고른 것을 곧바로 기기에 굳힌다(작업대의 열쇠 그대로 — 두 곳이 한 저장을 본다) */
export function persistTune(): void {
  try { localStorage.setItem(TUNE_STORE_KEY, paintRenderer()?.tuneJson?.() ?? '{}') } catch { /* 사생활 모드 */ }
}
