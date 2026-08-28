// 종속 탭 줄(web2-20 2부) — **겹은 도구가 아니라 종이다**: 종이 띠 바로 아래 줄
// (web2-19 2-c가 비워 둔 자리). **지금 활성인 종이의 겹만** 보이고, 종이를 바꾸면 줄도
// 바뀐다. 부모 탭(배타적)과의 형태 차이: 겹 탭은 **겹쳐 놓은 종이를 옆에서 본 모습** —
// 서로 겹치고(가산적임이 형태로 보인다), 활성인 것이 앞으로 나온다. 이 겹침을 e2e가
// 상자로 잰다(부모 탭은 겹침 0·자식 탭은 겹침 >0 — 오독 위험의 팔).
//
// ⚠ 앱은 겹의 목적을 제안하지 않는다(지시 0 ⚠⚠) — 화면에 뜨는 것은 종이 종류 둘
// (트레이싱지·옐로)과 켬/끔·잠금뿐이다. 「층」·「레이어」라는 말을 화면에 안 쓴다.

import type { App } from './state'
import { addLayer, removeLayer, setActiveLayer, setLayerOn, setLayerLocked } from './state'
import type { Layer, Paper } from '../core/types'
import { C } from '../core/constants'

// Phosphor light(MIT · @phosphor-icons/core assets/light — path 그대로. web2-19 4부와 같은 이식)
const EYE = 'M245.48,125.57c-.34-.78-8.66-19.23-27.24-37.81C201,70.54,171.38,50,128,50S55,70.54,37.76,87.76c-18.58,18.58-26.9,37-27.24,37.81a6,6,0,0,0,0,4.88c.34.77,8.66,19.22,27.24,37.8C55,185.47,84.62,206,128,206s73-20.53,90.24-37.75c18.58-18.58,26.9-37,27.24-37.8A6,6,0,0,0,245.48,125.57ZM128,194c-31.38,0-58.78-11.42-81.45-33.93A134.77,134.77,0,0,1,22.69,128,134.56,134.56,0,0,1,46.55,95.94C69.22,73.42,96.62,62,128,62s58.78,11.42,81.45,33.94A134.56,134.56,0,0,1,233.31,128C226.94,140.21,195,194,128,194Zm0-112a46,46,0,1,0,46,46A46.06,46.06,0,0,0,128,82Zm0,80a34,34,0,1,1,34-34A34,34,0,0,1,128,162Z'
const EYE_SLASH = 'M52.44,36A6,6,0,0,0,43.56,44L64.44,67c-37.28,21.9-53.23,57-53.92,58.57a6,6,0,0,0,0,4.88c.34.77,8.66,19.22,27.24,37.8C55,185.47,84.62,206,128,206a124.91,124.91,0,0,0,52.57-11.25l23,25.29a6,6,0,0,0,8.88-8.08Zm48.62,71.32,45,49.52a34,34,0,0,1-45-49.52ZM128,194c-31.38,0-58.78-11.42-81.45-33.93A134.57,134.57,0,0,1,22.69,128c4.29-8.2,20.1-35.18,50-51.91L92.89,98.3a46,46,0,0,0,61.35,67.48l17.81,19.6A113.47,113.47,0,0,1,128,194Zm6.4-99.4a6,6,0,0,1,2.25-11.79,46.17,46.17,0,0,1,37.15,40.87,6,6,0,0,1-5.42,6.53l-.56,0a6,6,0,0,1-6-5.45A34.1,34.1,0,0,0,134.4,94.6Zm111.08,35.85c-.41.92-10.37,23-32.86,43.12a6,6,0,1,1-8-8.94A134.07,134.07,0,0,0,233.31,128a134.67,134.67,0,0,0-23.86-32.07C186.78,73.42,159.38,62,128,62a120.19,120.19,0,0,0-19.69,1.6,6,6,0,1,1-2-11.83A131.12,131.12,0,0,1,128,50c43.38,0,73,20.54,90.24,37.76,18.58,18.58,26.9,37,27.24,37.81A6,6,0,0,1,245.48,130.45Z'
const LOCK = 'M208,82H174V56a46,46,0,0,0-92,0V82H48A14,14,0,0,0,34,96V208a14,14,0,0,0,14,14H208a14,14,0,0,0,14-14V96A14,14,0,0,0,208,82ZM94,56a34,34,0,0,1,68,0V82H94ZM210,208a2,2,0,0,1-2,2H48a2,2,0,0,1-2-2V96a2,2,0,0,1,2-2H208a2,2,0,0,1,2,2Z'

// 롤 아이콘 — docs/instrument-icons.md 「트레이싱지 롤 / 옐로 트레이스 롤」 정본 그대로
// (path 수정 금지 · 옐로만 고리를 #e9d98a로 채운다 — 선 아이콘의 유일한 색 예외).
// export — 손 띠의 롤 버튼(web2-21 3-a·main.ts)이 같은 정본을 쓴다(#54: 그림 출처 하나).
export const ROLL_TRACING = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>'
export const ROLL_YELLOW = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path fill="#e9d98a" stroke="none" fill-rule="evenodd" d="M13.5 6.8 a8.2 8.2 0 1 1 0 16.4 a8.2 8.2 0 1 1 0 -16.4 Z M13.5 12.2 a2.8 2.8 0 1 0 0 5.6 a2.8 2.8 0 1 0 0 -5.6 Z"/><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>'

const glyph = (d: string, size = 12): string =>
  `<svg viewBox="0 0 256 256" fill="currentColor" width="${size}" height="${size}"><path d="${d}"/></svg>`

export interface LayerbarHooks {
  /** 새 겹의 rect 기본값(2-b) = 지금 보이는 화면 — 뷰포트 크기는 호출부가 안다 */
  viewport: () => { W: number; H: number }
  onChange: () => void
  /** 눌리지 않는 이유가 보여야 한다(2-a) — 한 줄 안내 채널 */
  notify: (msg: string) => void
}

export interface Layerbar {
  sync: () => void
}

export function initLayerbar(app: App, host: HTMLElement, hooks: LayerbarHooks): Layerbar {
  let pop: HTMLElement | null = null
  let popAway: (() => void) | null = null
  function closePop() {
    pop?.remove(); pop = null
    popAway?.(); popAway = null
  }
  function openPopAt(anchor: HTMLElement, build: (pop: HTMLElement) => void) {
    closePop()
    pop = document.createElement('div')
    pop.id = 'layer-pop'
    build(pop)
    document.body.append(pop)
    const r = anchor.getBoundingClientRect()
    pop.style.left = `${Math.round(Math.max(4, r.left))}px`
    pop.style.top = `${Math.round(r.bottom + 4)}px`
    const away = (e: PointerEvent) => {
      if (pop && !(e.target instanceof Node && (pop.contains(e.target) || anchor.contains(e.target)))) closePop()
    }
    window.addEventListener('pointerdown', away, true)
    popAway = () => window.removeEventListener('pointerdown', away, true)
  }

  function render() {
    closePop()
    host.textContent = ''
    const layers = app.doc.layers.filter(l => l.sheet === app.activeSheet)
    // 쌓인 순서(뒤가 위)를 왼→오로 — 오른쪽 탭이 위에 겹치게 z도 같이 준다
    layers.forEach((lay, i) => host.append(layerTab(lay, i)))
    // 「+」 — 카메라가 닫히기 전에는 비활성(2-a). 눌리지 않는 이유가 보여야 한다.
    const add = document.createElement('button')
    add.id = 'layer-add'
    add.className = 'ltab ladd'
    add.innerHTML = '<svg viewBox="0 0 256 256" fill="currentColor" width="11" height="11"><path d="M222,128a6,6,0,0,1-6,6H134v82a6,6,0,0,1-12,0V134H40a6,6,0,0,1,0-12h82V40a6,6,0,0,1,12,0v82h82A6,6,0,0,1,222,128Z"/></svg>'
    const done = app.lift.an.constructionDone
    add.classList.toggle('disabled', !done)
    add.title = done ? '종이를 얹는다 — 트레이싱지·옐로' : '소실점 작도가 끝나야 얹을 수 있다'
    add.addEventListener('click', () => {
      if (!app.lift.an.constructionDone) {
        hooks.notify('소실점 작도가 끝나야 종이를 얹을 수 있다')
        return
      }
      openPopAt(add, p => {
        for (const [paper, label, svg] of [
          ['tracing', '트레이싱지', ROLL_TRACING],
          ['yellow', '옐로', ROLL_YELLOW],
        ] as [Paper, string, string][]) {
          const b = document.createElement('button')
          b.className = 'lpick'
          b.dataset.paper = paper
          b.innerHTML = `${svg}<span>${label}</span>`
          b.addEventListener('click', () => {
            addLayer(app, paper, hooks.viewport())
            closePop()
            render()
            hooks.onChange()
          })
          p.append(b)
        }
      })
    })
    host.append(add)
  }

  function layerTab(lay: Layer, i: number): HTMLElement {
    const tab = document.createElement('div')
    tab.className = 'ltab lpaper ' + lay.paper
      + (lay.on ? ' on' : '')
      + (app.activeLayer === lay.id ? ' active' : '')
      + (lay.locked ? ' locked' : '')
    tab.dataset.layer = String(lay.id)
    tab.style.zIndex = String(i + 1)   // 뒤(위 겹)가 앞 탭 위로 — 옆에서 본 더미
    // 몸통 = 활성으로(켜짐 겸). 잠긴 겹은 활성이 못 된다(state가 지킨다).
    tab.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.lctl')) return   // 표식 몫
      if (lpFired) { lpFired = false; return }   // 길게 누른 손을 뗀 것 — 활성 아님
      setActiveLayer(app, lay.id)
      render()
      hooks.onChange()
    })
    // 길게 누르면 — 삭제(확인 한 번: 획 수를 알린다 — 2-c). 시간·이동 허용은 종이 탭과
    // 같은 값(C.PAPER_LONGPRESS_MS · OSNAP_RADIUS_PX — 같은 몸짓에 다른 숫자를 안 짓는다).
    let lpTimer: number | undefined
    let lpStart: { x: number; y: number } | null = null
    let lpFired = false   // 길게 누른 뒤의 click이 render→closePop으로 팝업을 닫는 것을 막는다
    tab.addEventListener('pointerdown', e => {
      lpStart = { x: e.clientX, y: e.clientY }
      lpTimer = window.setTimeout(() => {
        lpTimer = undefined
        lpFired = true
        const n = app.doc.strokes.filter(s => s.layer === lay.id).length
        openPopAt(tab, p => {
          const span = document.createElement('span')
          span.textContent = `이 종이를 지운다 — 그 위의 획 ${n}개가 같이 간다(실행취소로 돌아온다). `
          const yes = document.createElement('u')
          yes.dataset.pick = 'yes'
          yes.textContent = '지운다'
          yes.addEventListener('click', () => { removeLayer(app, lay.id); closePop(); render(); hooks.onChange() })
          const no = document.createElement('u')
          no.dataset.pick = 'no'
          no.textContent = '취소'
          no.addEventListener('click', closePop)
          p.append(span, yes, ' ', no)
        })
      }, C.PAPER_LONGPRESS_MS)
    })
    const cancel = () => { clearTimeout(lpTimer); lpTimer = undefined; lpStart = null }
    tab.addEventListener('pointerup', cancel)
    tab.addEventListener('pointercancel', cancel)
    tab.addEventListener('pointermove', e => {
      if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > C.OSNAP_RADIUS_PX) cancel()
    })
    // 켬/끔 표식(= 토글) · 잠금 표식(= 토글)
    const eye = document.createElement('button')
    eye.className = 'lctl leye'
    eye.innerHTML = glyph(lay.on ? EYE : EYE_SLASH)
    eye.title = lay.on ? '끈다 — 안 보이고 3D에서 빠진다' : '켠다'
    eye.addEventListener('click', () => { setLayerOn(app, lay.id, !lay.on); render(); hooks.onChange() })
    const lock = document.createElement('button')
    lock.className = 'lctl llock'
    lock.innerHTML = glyph(LOCK)
    lock.title = lay.locked ? '잠금을 푼다' : '잠근다 — 보이지만 편집이 막힌다'
    lock.addEventListener('click', () => { setLayerLocked(app, lay.id, !lay.locked); render(); hooks.onChange() })
    tab.append(eye, lock)
    return tab
  }

  render()
  return { sync: render }
}
