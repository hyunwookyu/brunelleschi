// 브러시 고르개(web2-62) — 196개를 **분류로** 보이고, 칸마다 그 브러시의 «실제 자국 견본»을
// 그 자리에서 낸다(지시: 「견본은 그리는 그 함수로 그 자리에서 낸다 — 문서의 미리보기 PNG를
// 쓰지 마라」). 견본은 이음매 drawMark(제품과 같은 함수 #54)에 preset을 실어 긋는다.
//
// 고르면 **지금 도구 슬롯**(칠통의 연필·잉크펜·마커·색연필)에 그 브러시가 앉는다 — 저장 형식은
// 안 바뀐다(획은 도구 표식뿐 · 슬롯↔브러시는 기기 조정 tune이고 곧바로 굳힌다(localStorage —
// 작업대의 그 열쇠)). 자리: 칠통의 「브러시…」 단추 → 이 판. R7(한 번에 통 하나)은 registerBox.
//
// web2-68 §3-1 — **두 칸**(Procreate 채록 UX-FLOWS §C-3): 왼쪽 «세트» 열(최근 · Brunelleschi · Classic · Deevad ·
// Tanda · Ramon · Experimental · Kaerhon · Dieterle — 아이콘 없이 글자만) · 오른쪽 그 세트의 브러시(이름 + 견본 획 ·
// 행 높이 ≈ 48). 자리는 칠 패널의 **오른쪽 가장자리에 붙는다**(anchorRect — 화면 오른쪽 끝으로 뛰지 않는다).
// «최근»은 이 기기에서 고른 순(PAINT68_RECENT_N · 기기 저장). 세트마다 <details data-group>는 그대로 산다(옛 스펙이
// details.open으로 여는 통로 — 열리면 그 세트가 «고른 세트»가 된다 · 나머지는 hidden).

import { drawMark, paintRenderer, type Instr58 } from '../core/paintseam'
import { brushLabel, brushRawExact } from '../core/brushnames'
import { PRESET_CATALOG, PRESET_BY_NAME } from './mypaintpaint'
import { C } from '../core/constants'
import { TUNE_STORE_KEY } from './tunelab'

const INSTR_NAME: Record<Instr58, string> = { brush: '잉크펜', marker: '마커', cp: '색연필', pencil: '연필' }
/** «최근» 세트의 이름(왼쪽 열 첫 줄 · details data-group도 이 값) */
export const RECENT_GROUP = '최근'
const RECENT_KEY = 'b2.brushRecent68.v1'

export const readRecentBrushes = (): string[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(arr) ? arr.filter((n): n is string => typeof n === 'string' && PRESET_BY_NAME.has(n)).slice(0, C.PAINT68_RECENT_N) : []
  } catch { return [] }
}
export const pushRecentBrush = (name: string): void => {
  const list = [name, ...readRecentBrushes().filter(n => n !== name)].slice(0, C.PAINT68_RECENT_N)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* 사생활 모드 */ }
}

export interface BrushPicker {
  root: HTMLElement
  isOpen(): boolean
  setOpen(v: boolean): void
  /** 지금 고른 세트(값으로 — e2e) */
  currentSet(): string
}

export function initBrushPicker(opts: {
  toolOf: () => Instr58
  hexOf: () => string
  onPick: (tool: Instr58, name: string) => void
  notify: (msg: string) => void
  /** web2-68 — 붙을 자리(칠 패널의 rect). null이면 옛 자리(오른쪽 12px). */
  anchorRect?: () => DOMRect | null
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
  note.textContent = '세트를 고르면 견본이 그려진다(제품과 같은 함수). 누르면 지금 브러시가 된다 — 이미 그린 획은 안 변한다(64-1).'

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
        // 견본을 다시 그린다(팁이 바뀌면 자국이 바뀐다) — «보이는 세트»만 · 프레임마다 넷씩(밤 68이 잡았다: 두 칸이 되며 세트 하나(36)가
        // 늘 그려져 있고 팁마다 보정(calib — 프리셋|팁 열쇠)이 새로 서서 한 번에 다시 그리면 화면이 60s 넘게 멈췄다 — shots63)
        redrawVisible()
        opts.notify(`${INSTR_NAME[tool]} 팁 ← ${it.label}(이 기기에 남는다)`)
      })
      tipRow.append(b)
    }
  }

  // ── 두 칸(68) — 왼쪽 세트 열 · 오른쪽 브러시 목록 ────────────────────────────────
  const body = document.createElement('div')
  body.id = 'brushpick-body'
  body.style.cssText = 'display:flex;gap:8px;align-items:flex-start'
  const sets = document.createElement('div')
  sets.id = 'brushpick-sets'
  // 세트 열은 굴러가도 제자리(sticky) — 목록이 길어도 세트를 갈아탈 수 있다(Procreate 채록 §C-3). 판 전체가 하나로 구른다(65 §2 ④ «잘린 글자 0»의 자가 hidden 조상을 자름으로 세므로 안쪽 상자를 hidden으로 두지 않는다).
  sets.style.cssText = 'display:flex;flex-direction:column;gap:2px;width:96px;flex-shrink:0;align-self:flex-start;position:sticky;top:0;border-right:1px solid #d8d2c4;padding-right:6px'
  const list = document.createElement('div')
  list.id = 'brushpick-list'
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:0'
  body.append(sets, list)

  const CV_W = 150, CV_H = 34            // 행 높이 ≈ 48(견본 34 + 여백 — Procreate 채록 §C-3)
  const drawn = new Set<HTMLCanvasElement>()
  const samples: { name: string; cv: HTMLCanvasElement }[] = []
  const details = new Map<string, HTMLDetailsElement>()
  const setBtns = new Map<string, HTMLButtonElement>()
  let currentSet = ''

  const sampleOf = (name: string, cv: HTMLCanvasElement): void => drawBrushSample(cv, opts.toolOf(), name, opts.hexOf())

  /** «최근» 세트의 행을 지금 저장에서 다시 짓는다(고를 때마다 바뀌는 유일한 세트) */
  let fillRecent: () => void = () => {}
  /** «보이는 행»의 견본만 그린다(판 안에 든 행 — 굴리면 더 그린다). 세트 하나가 36행이고 팁마다 보정(calib — 프리셋|팁)이 새로
   *  서서, 전부 그리면 화면이 60s 넘게 멈췄다(밤 68 shots63이 잡았다). 안 보이는 행은 굴려서 닿을 때 그린다. */
  const drawVisibleRows = (): void => {
    const det = details.get(currentSet)
    if (!det || det.hidden) return
    const rr = root.getBoundingClientRect()
    for (const b of det.querySelectorAll<HTMLButtonElement>('button[data-name]')) {
      const cv = b.querySelector('canvas')
      if (!cv || drawn.has(cv)) continue
      const r = b.getBoundingClientRect()
      if (r.bottom < rr.top - 40 || r.top > rr.bottom + 40) continue
      sampleOf(b.dataset.name!, cv); drawn.add(cv)
    }
  }
  /** 팁이 바뀌었다 — 그린 것을 전부 «안 그린 것»으로 되돌리고 보이는 행부터 다시 */
  const redrawVisible = (): void => { drawn.clear(); drawVisibleRows() }
  let scrollRaf = 0
  root.addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; drawVisibleRows() }) })
  /** 세트 하나를 고른다 — 그 세트의 details만 보이고 열린다(견본은 그때 그린다 · 196개를 한 번에 그리지 않는다) */
  const selectSet = (group: string): void => {
    currentSet = group
    if (group === RECENT_GROUP) fillRecent()
    for (const [g, det] of details) {
      const on = g === group
      det.hidden = !on
      if (det.open !== on) det.open = on
    }
    for (const [g, b] of setBtns) b.classList.toggle('on', g === group)
    drawVisibleRows()
  }

  const rowOf = (name: string, tool: Instr58, cur: string | undefined, recent: boolean): HTMLButtonElement => {
    const row = document.createElement('button')
    // «최근» 행은 id를 가른다(같은 브러시가 원 세트에도 있다 — id 중복 ⛔ · 옛 스펙은 원 세트의 id를 누른다)
    row.id = `brushpick-${recent ? 'recent-' : ''}${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    row.dataset.name = name
    row.dataset.act = 'state'
    row.classList.toggle('on', name === cur)
    row.title = `${brushLabel(name)} — 원 이름 ${name}. ${PRESET_BY_NAME.get(name)?.desc || '설명 없음'}. 누르면 ${INSTR_NAME[tool]} 자리에 앉는다`
    row.style.cssText = 'display:flex;align-items:center;gap:8px;text-align:left;padding:3px 4px;min-height:48px;box-sizing:border-box'
    const cv = document.createElement('canvas')
    cv.width = CV_W * 2; cv.height = CV_H * 2
    cv.style.cssText = `width:${CV_W}px;height:${CV_H}px;position:static;inset:auto;flex-shrink:0;border:1px solid #d8d2c4;border-radius:3px;background:#fffdf8`
    // web2-65 §2 ③④ — 사람이 읽는 이름이 먼저, 원 이름은 **부제로 남는다**(안 없앤다). 자르지 않는다(줄바꿈 — 게이트 ④).
    const lab = document.createElement('span')
    lab.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;white-space:normal;overflow-wrap:anywhere'
    const labMain = document.createElement('span')
    labMain.className = 'brushpick-name'
    labMain.textContent = brushLabel(name)
    const labRaw = document.createElement('span')
    labRaw.className = 'brushpick-raw'
    labRaw.style.cssText = 'font-size:10px;color:#8d8880'
    labRaw.textContent = brushRawExact(name)
    lab.append(labMain, labRaw)
    row.append(cv, lab)
    row.addEventListener('click', () => {
      opts.onPick(tool, name)
      pushRecentBrush(name)                                   // «최근» — 이 기기에서 고른 순(68)
      for (const b of list.querySelectorAll('button[data-name]')) b.classList.toggle('on', (b as HTMLElement).dataset.name === name)
      opts.notify(`${INSTR_NAME[tool]} ← ${name}(이 기기에 남는다)`)
    })
    // 같은 이름이 두 세트(최근 + 원 세트)에 있을 수 있다 — 견본 캔버스는 행마다 따로(samples 배열)
    return row
  }

  const build = (): void => {
    list.replaceChildren(); sets.replaceChildren()
    samples.length = 0; drawn.clear(); details.clear(); setBtns.clear()
    const tool = opts.toolOf()
    const cur = paintRenderer()?.brushOf?.(tool)
    const cats: { group: string; names: string[] }[] = [{ group: RECENT_GROUP, names: readRecentBrushes() }, ...PRESET_CATALOG]
    for (const cat of cats) {
      const b = document.createElement('button')
      b.id = `brushpick-set-${cat.group === RECENT_GROUP ? 'recent' : cat.group.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      b.className = 'brushpick-set'
      b.dataset.act = 'state'
      b.dataset.group = cat.group
      b.textContent = `${cat.group} ${cat.names.length}`
      b.title = `${cat.group} 세트(${cat.names.length}) — 오른쪽에 그 브러시가 선다`
      // 자르지 않는다(65 §2 ④ 「잘린 글자 0」 — panel65 ④가 #brushpick 전수를 잰다): 긴 세트 이름(Experimental)은 줄바꿈
      b.style.cssText = 'text-align:left;padding:5px 6px;border:0;background:transparent;border-radius:4px;font-size:12px;cursor:pointer;white-space:normal;overflow-wrap:anywhere;line-height:1.2'
      b.addEventListener('click', () => selectSet(cat.group))
      setBtns.set(cat.group, b)
      sets.append(b)
      const det = document.createElement('details')
      det.className = 'brushpick-group'
      det.dataset.group = cat.group
      det.hidden = true
      const sum = document.createElement('summary')
      sum.textContent = `${cat.group} (${cat.names.length})`
      sum.title = `${cat.group} 세트`
      sum.style.cssText = 'cursor:default;font-weight:600;padding:3px 0;list-style:none'
      det.append(sum)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:2px 0 6px 0'
      const fill = (names: string[]): void => {
        wrap.replaceChildren()
        if (names.length === 0) {
          const empty = document.createElement('div')
          empty.style.cssText = 'font-size:11px;color:#8d8880;padding:4px'
          empty.textContent = cat.group === RECENT_GROUP ? '아직 없다 — 목록에서 고르면 여기 남는다(이 기기 · 8개)' : '비어 있다'
          wrap.append(empty)
        }
        for (const name of names) {
          const row = rowOf(name, tool, cur, cat.group === RECENT_GROUP)
          samples.push({ name, cv: row.querySelector('canvas')! })
          wrap.append(row)
        }
        sum.textContent = `${cat.group} (${names.length})`
        b.textContent = `${cat.group} ${names.length}`
      }
      fill(cat.names)
      if (cat.group === RECENT_GROUP) fillRecent = () => fill(readRecentBrushes())
      det.append(wrap)
      // 옛 스펙의 통로(details.open = true) — 열리면 그 세트가 «고른 세트»가 된다(왼쪽 열을 누른 것과 같다)
      det.addEventListener('toggle', () => { if (det.open && currentSet !== cat.group) selectSet(cat.group) })
      details.set(cat.group, det)
      list.append(det)
    }
    title.textContent = `브러시 — ${INSTR_NAME[tool]} 족${cur ? ` · 지금 ${cur}` : ''}`   // web2-64 규칙 ④: 「브러시 고르개」 → 「브러시»
    buildTips()
    // 처음 열 때의 세트: 지금 브러시가 든 세트(없으면 최근이 비어 있지 않으면 최근, 아니면 첫 세트)
    const curGroup = cur ? PRESET_CATALOG.find(c => c.names.includes(cur))?.group : undefined
    selectSet(curGroup ?? (readRecentBrushes().length > 0 ? RECENT_GROUP : PRESET_CATALOG[0]!.group))
  }
  const place = (): void => {
    const a = opts.anchorRect?.() ?? null
    if (a) {
      root.style.right = 'auto'
      root.style.left = `${Math.round(a.right + C.FLYOUT_GAP_PX)}px`
      root.style.top = `${Math.round(Math.max(C.FLYOUT_EDGE_PX, Math.min(a.top, window.innerHeight - root.offsetHeight - C.FLYOUT_EDGE_PX)))}px`
    } else { root.style.left = 'auto'; root.style.right = '12px'; root.style.top = '56px' }
  }

  root.append(head, note, tipRow, body)
  let open = false
  const api: BrushPicker = {
    root,
    isOpen: () => open,
    setOpen(v: boolean) {
      open = v
      root.hidden = !v
      root.style.display = v ? 'flex' : 'none'
      if (v) { build(); place(); drawVisibleRows() }
    },
    currentSet: () => currentSet,
  }
  document.body.append(root)
  return api
}

/** **자국 견본**(web2-62 고르개 · web2-64 패널의 «지금 브러시»가 같은 함수 #54) — 캔버스 실제 크기의 절반을 css px로 본다(2배 또렷).
 *  물결 하나 · 압력 .25→1→.45 · 시드 62 · 제품과 같은 drawMark(preset 실림). 잉크펜 족도 색을 쓴다(64). */
export function drawBrushSample(cv: HTMLCanvasElement, tool: Instr58, preset: string, hex: string): void {
  const g = cv.getContext('2d')!
  const W = cv.width / 2, H = cv.height / 2
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.fillStyle = '#fffdf8'
  g.fillRect(0, 0, cv.width, cv.height)
  const pts: { x: number; y: number }[] = []
  const press: number[] = []
  const n = 40
  for (let k = 0; k <= n; k++) {
    const t = k / n
    pts.push({ x: (12 + t * (W - 24)) * 2, y: (H / 2 + Math.sin(t * Math.PI * 1.6) * Math.min(7, H * 0.23)) * 2 })
    const p = t < 0.5 ? 0.25 + 1.5 * t : 1 - 1.1 * (t - 0.5)
    press.push(Math.max(0.1, Math.min(1, p)) * C.PRESS_Q)
  }
  try {
    drawMark(g, { pts, press, wPx: 9 * 2, seed: 62, tool, preset, color: hex })
  } catch {
    g.fillStyle = '#b04a3a'; g.font = '11px system-ui'; g.fillText('견본 실패', 6, 18)
  }
}

/** 고른 것을 곧바로 기기에 굳힌다(작업대의 열쇠 그대로 — 두 곳이 한 저장을 본다) */
export function persistTune(): void {
  try { localStorage.setItem(TUNE_STORE_KEY, paintRenderer()?.tuneJson?.() ?? '{}') } catch { /* 사생활 모드 */ }
}
