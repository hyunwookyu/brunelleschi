// 종이 탭 띠(web2-19 2부) — **명명된 뷰가 「종이」가 된다.** 위 왼쪽, 늘 떠 있다
// (「지금 어느 장인가」는 상태 표시다 — 팝업은 열어야 안다. 지시 2-c).
//
// 층위(2-a): 파일(.brnl) = 대상 하나 / **종이(탭) = 그 대상을 그린 한 장 · 하나만 활성** /
// 겹(종속 탭) = web2-20. 비유의 눈금은 스케치북이 아니라 **도면집**이다 — 여러 장인데
// 건물은 하나다: 종이가 늘어도 3D는 하나이고, 새 종이에 그린 선이 옛 종이에도 나타난다.
//
// 몸짓: 탭 = 그 종이로 · 「+」 = 지금 포즈·뷰를 새 종이로(빈 장을 먼저 만들지 않는다 —
// 사람이 답한 셋의 3) · 두 번 탭 = 이름 편집 · **길게 눌러** 썸네일·이름·삭제.
// 삭제 확인은 팝업 안 밑줄 단어다(confirmNear의 어법 그대로 — 그 함수는 오른쪽 세로바
// 전용 배치(왼쪽 옆)라 왼쪽 끝의 탭에서는 화면 밖으로 나간다. 어법만 가져온다).
//
// ⚠ web2-20이 이 띠 **아래**에 종속 탭 줄을 붙인다(지시 2-c ⚠⚠) — #topleft가 세로
// flex 기둥이고 이 모듈은 첫 줄(#paperbar)만 소유한다. 높이를 하드코딩하지 않는다.

import type { App } from './state'
import { deleteSheet, renameSheet, gotoSheet } from './state'
import { DRAW_SHEET_ID, type Sheet } from '../core/types'
import { C } from '../core/constants'

export interface PaperbarHooks {
  /** **지금 시점을 새 종이로 굳힌다** — 셔터(「+」)·롤(web2-25 2부)·시점 갱신이 **같은
   *  함수 하나**를 부른다(#54). 썸네일 굽기도 그 안이다(저장 시점에 굽는다 — saveView ㉮). */
  capture: () => Sheet
  /** 시점이 바뀌었다 — 다시 그리기·접기 타이머 */
  onGoto: () => void
}

export interface Paperbar {
  /** 문서·활성이 바뀐 뒤 다시 그린다(loadDoc·비우기·삭제) */
  sync: () => void
}

export function initPaperbar(app: App, host: HTMLElement, hooks: PaperbarHooks): Paperbar {
  let pop: HTMLElement | null = null
  let popAway: (() => void) | null = null
  function closePop() {
    pop?.remove(); pop = null
    popAway?.(); popAway = null
  }

  /** 탭 하나를 인라인 이름 편집으로 바꾼다 — Enter/blur가 확정, Esc가 취소 */
  function beginRename(tab: HTMLElement, sheetId: number) {
    const sheet = app.doc.sheets.find(s => s.id === sheetId)
    if (!sheet) return
    const input = document.createElement('input')
    input.className = 'ptab-edit'
    input.value = sheet.name
    input.maxLength = 40
    tab.textContent = ''
    tab.append(input)
    input.focus()
    input.select()
    let done = false
    const commit = () => {
      if (done) return
      done = true
      const v = input.value.trim()
      if (v) renameSheet(app, sheetId, v)
      render()
    }
    input.addEventListener('blur', commit)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit()
      if (e.key === 'Escape') { done = true; render() }
      e.stopPropagation()
    })
  }

  /** 길게 누르면 — 썸네일·이름 항목·삭제(작도 종이는 삭제 없음). 지시 2-c의 세 몸짓. */
  function openPop(tab: HTMLElement, sheetId: number) {
    closePop()
    const sheet = app.doc.sheets.find(s => s.id === sheetId)
    if (!sheet) return
    pop = document.createElement('div')
    pop.id = 'paper-pop'
    if (sheet.thumb) {
      const img = document.createElement('img')
      img.src = sheet.thumb
      img.alt = sheet.name
      pop.append(img)
    }
    const name = document.createElement('u')
    name.dataset.pick = 'rename'
    name.textContent = '이름'
    name.addEventListener('click', () => { closePop(); beginRename(tab, sheetId) })
    pop.append(name)
    if (sheetId !== app.doc.sheets[0]!.id) {
      const del = document.createElement('u')
      del.dataset.pick = 'delete'
      del.textContent = '지운다'
      del.addEventListener('click', () => {
        // 확인 한 번 — 실행취소 대상이 아니다(web2-12 deleteView 규약 그대로).
        // ⚠ 다음 회차에 이 규약이 바뀐다(겹이 종이에 붙으면 종이 삭제 = 획 삭제 — DEFERRED).
        del.replaceWith(confirmRow(sheet.name, () => { deleteSheet(app, sheetId); closePop(); render(); hooks.onGoto() }))
      })
      pop.append(del)
    }
    document.body.append(pop)
    const r = tab.getBoundingClientRect()
    pop.style.left = `${Math.round(Math.max(4, r.left))}px`
    pop.style.top = `${Math.round(r.bottom + 4)}px`
    const away = (e: PointerEvent) => {
      if (pop && !(e.target instanceof Node && (pop.contains(e.target) || tab.contains(e.target)))) closePop()
    }
    window.addEventListener('pointerdown', away, true)
    popAway = () => window.removeEventListener('pointerdown', away, true)
  }

  function confirmRow(name: string, onYes: () => void): HTMLElement {
    const row = document.createElement('span')
    row.className = 'paper-confirm'
    row.append(`「${name}」를 지운다. `)
    const yes = document.createElement('u')
    yes.dataset.pick = 'yes'
    yes.textContent = '지운다'
    yes.addEventListener('click', onYes)
    const no = document.createElement('u')
    no.dataset.pick = 'no'
    no.textContent = '취소'
    no.addEventListener('click', closePop)
    row.append(yes, ' ', no)
    return row
  }

  /** 활성 표시만 제자리 갱신 — 탭 요소를 안 갈아치운다(dblclick·팝업 앵커가 산다) */
  function updateActive() {
    for (const el of host.querySelectorAll<HTMLElement>('.ptab[data-sheet]')) {
      el.classList.toggle('on', Number(el.dataset.sheet) === app.activeSheet)
    }
  }

  function render() {
    closePop()
    host.textContent = ''
    for (const s of app.doc.sheets) {
      const tab = document.createElement('button')
      tab.className = 'ptab' + (s.id === app.activeSheet ? ' on' : '')
      tab.dataset.sheet = String(s.id)
      tab.textContent = s.name
      tab.title = s.pose ? s.name : `${s.name} — 작도 시점`
      // 탭 = 그 종이로. 이미 활성이어도 다시 그 포즈로(구도를 손으로 돌렸다 돌아오는 몸짓).
      // ⚠ 여기서 render()를 부르지 않는다 — 탭 요소가 갈리면 **두 번째 탭(dblclick)이
      // 죽은 요소에 떨어져** 이름 편집이 영영 안 열린다. 활성 표시만 제자리에서 바꾼다.
      tab.addEventListener('click', () => {
        if (lpFired) { lpFired = false; return }   // 길게 누른 손을 뗀 것 — 이동 아님
        gotoSheet(app, s.id)
        hooks.onGoto()
        updateActive()
      })
      tab.addEventListener('dblclick', () => beginRename(tab, s.id))
      // 길게 누르기 — 이동 허용은 오스냅 반경(8px)을 재사용한다(새 숫자를 안 짓는다 #54:
      // «누른 자리에서 벗어나지 않았다»는 같은 물음이다). 시간은 C.PAPER_LONGPRESS_MS.
      let lpTimer: number | undefined
      let lpStart: { x: number; y: number } | null = null
      let lpFired = false
      tab.addEventListener('pointerdown', e => {
        lpStart = { x: e.clientX, y: e.clientY }
        lpTimer = window.setTimeout(() => { lpTimer = undefined; lpFired = true; openPop(tab, s.id) }, C.PAPER_LONGPRESS_MS)
      })
      const cancel = () => { clearTimeout(lpTimer); lpTimer = undefined; lpStart = null }
      tab.addEventListener('pointerup', cancel)
      tab.addEventListener('pointercancel', cancel)
      tab.addEventListener('pointermove', e => {
        if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > C.OSNAP_RADIUS_PX) cancel()
      })
      host.append(tab)
    }
    const add = document.createElement('button')
    add.id = 'paper-add'
    add.className = 'ptab'
    // Phosphor light plus (MIT · @phosphor-icons/core assets/light/plus-light.svg 그대로 — web2-19 4부)
    add.innerHTML = '<svg viewBox="0 0 256 256" fill="currentColor" width="12" height="12" style="vertical-align:-1px"><path d="PLUSPATH"/></svg>'.replace('PLUSPATH', 'M222,128a6,6,0,0,1-6,6H134v82a6,6,0,0,1-12,0V134H40a6,6,0,0,1,0-12h82V40a6,6,0,0,1,12,0v82h82A6,6,0,0,1,222,128Z')
    add.title = '지금 보고 있는 시점을 새 종이로'
    add.addEventListener('click', () => {
      const s = hooks.capture()
      hooks.onGoto()   // 활성 종이가 바뀌었다 — 종속 탭 줄(web2-20)도 따라온다
      render()
      // 기본 이름 「종이 N」 — 바로 편집 가능(지시 2-c). 방금 만든 탭을 찾아 연다.
      const tab = host.querySelector<HTMLElement>(`[data-sheet="${s.id}"]`)
      if (tab) beginRename(tab, s.id)
    })
    host.append(add)
  }

  render()
  return { sync: render }
}
