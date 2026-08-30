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
import { deleteSheet, renameSheet, gotoSheet, sheetUpdateBlock, updateSheet } from './state'
import { DRAW_SHEET_ID, paperName, type Sheet } from '../core/types'
import { C } from '../core/constants'
import { registerBox, closeOtherBoxes } from './boxes'

export interface PaperbarHooks {
  /** **지금 시점을 새 종이로 굳힌다** — 셔터(「+」)·롤(web2-25 2부)·시점 갱신이 **같은
   *  함수 하나**를 부른다(#54). 썸네일 굽기도 그 안이다(저장 시점에 굽는다 — saveView ㉮). */
  capture: () => Sheet
  /** 지금 화면의 썸네일 — 시점 갱신(3-c)이 다시 굽는 자리 */
  thumb: () => string
  /** **셔터의 번쩍임**(3-a) — 찍는 순간 화면이 한 번 짧게 번쩍한다(짧고 무채색) */
  flash: () => void
  /** 막힌 이유를 한 줄로(3-c ⛔ — 「다시 뜨기 없음」과 같은 결) */
  notify: (msg: string) => void
  /** 시점이 바뀌었다 — 다시 그리기·접기 타이머 */
  onGoto: () => void
}

/** Phosphor light camera (MIT · `@phosphor-icons/core` assets/light/camera-light.svg — path 그대로) */
const CAMERA_PATH = 'M208,58H179.21L165,36.67A6,6,0,0,0,160,34H96a6,6,0,0,0-5,2.67L76.78,58H48A22,22,0,0,0,26,80V192a22,22,0,0,0,22,22H208a22,22,0,0,0,22-22V80A22,22,0,0,0,208,58Zm10,134a10,10,0,0,1-10,10H48a10,10,0,0,1-10-10V80A10,10,0,0,1,48,70H80a6,6,0,0,0,5-2.67L99.21,46h57.57L171,67.33A6,6,0,0,0,176,70h32a10,10,0,0,1,10,10ZM128,90a42,42,0,1,0,42,42A42,42,0,0,0,128,90Zm0,72a30,30,0,1,1,30-30A30,30,0,0,1,128,162Z'

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
    // ── 시점 갱신(web2-25 3-c) — SketchUp Scenes 의 Update Scene. **막히면 이유를 준다** ──
    const block = sheetUpdateBlock(app, sheetId)
    const upd = document.createElement('u')
    upd.dataset.pick = 'update'
    upd.textContent = '이 시점으로 갱신'
    if (block) {
      upd.classList.add('blocked')
      upd.title = block === 'layers'
        ? '이 종이에는 겹이 얹혀 있다 — 밑그림이 옛 시점의 것이라 어긋난다. 새 종이를 만든다'
        : '작도 종이의 시점은 작도 시점이다 — 작도 시점에서만 갱신한다'
      upd.addEventListener('click', () => {
        closePop()
        hooks.notify(block === 'layers'
          ? '겹이 얹힌 종이는 시점을 갱신하지 않는다 — 새 종이를 만든다'
          : '작도 종이의 시점은 작도 시점이다')
      })
    } else {
      upd.addEventListener('click', () => {
        closePop()
        if (updateSheet(app, sheetId, hooks.thumb())) {
          hooks.flash()          // 다시 찍은 것이다 — 셔터와 같은 피드백
          render()
          hooks.onGoto()
        }
      })
    }
    pop.append(upd)
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
        del.replaceWith(confirmRow(sheet.name, () => { deleteSheet(app, sheetId); closePop(); render(); hooks.onGoto() }, sheetId))
      })
      pop.append(del)
    }
    document.body.append(pop)
    closeOtherBoxes('#paper-pop')     // 동시에 둘이 열리지 않는다(R7)
    const r = tab.getBoundingClientRect()
    pop.style.left = `${Math.round(Math.max(4, r.left))}px`
    pop.style.top = `${Math.round(r.bottom + 4)}px`
    // 바깥 누름 = 닫힘(화면 규칙 R7). ⚠ **이 세 줄이 R7의 선례였다** — web2-34 4번이
    // 같은 규약을 `boxes.ts` 한 자리로 옮기고 나머지 통(연필통·촉통·크기통·자·표시·면·
    // 서랍 둘)을 그리로 데려갔다(#54 — 새 기제를 안 만든다). 거동은 그대로다.
    popAway = registerBox({
      id: '#paper-pop',
      isOpen: () => pop !== null,
      close: () => closePop(),
      zone: () => [pop, tab],
    })
  }

  /** **되돌릴 수 없는 것을 묻는 자리의 예외**(web2-30 4번) — 화면의 말은 이름이거나 짧은
   *  동사구라는 규칙(28-3)에 조항 하나를 더했다: **되돌릴 수 없는 것을 묻는 자리에서는
   *  판단 근거가 화면에 남는다.** 그 순간 손은 단추 위에 있지 호버 상태가 아니라 툴팁이
   *  닿지 않는다. ⚠ 그리고 근거는 **대상을 밝혀야** 근거다 — 「같이 간다」만으로는 무엇이
   *  같이 가는지를 말하지 않는다. 여기서 함께 지워지는 것은 **그 종이에 얹은 겹과 그 위의
   *  획**이다(`state.deleteSheet`가 정본). 얹은 것이 없으면 그 말을 **안 붙인다** —
   *  없는 경고는 근거가 아니라 잡음이다. */
  function alsoGoes(sheetId: number): string {
    const layers = app.doc.layers.filter(l => l.sheet === sheetId)
    if (layers.length === 0) return ''
    const ids = new Set(layers.map(l => l.id))
    const cnt = app.doc.strokes.filter(x => x.layer !== undefined && ids.has(x.layer)).length
    const kinds: string[] = []
    for (const paper of ['yellow', 'tracing'] as const) {
      const n = layers.filter(l => l.paper === paper).length
      if (n > 0) kinds.push(`${paperName(paper)} ${n}장`)
    }
    // 「…장」으로 끝나므로 조사는 언제나 「과」다(받침 ㅇ) — 붙임 규칙을 안 만든다
    return `이 종이에 얹은 ${kinds.join(' · ')}과 그 위의 획 ${cnt}개도 함께 지워진다. `
  }

  function confirmRow(name: string, onYes: () => void, sheetId: number): HTMLElement {
    const row = document.createElement('span')
    row.className = 'paper-confirm'
    row.append(`「${name}」를 지운다. ${alsoGoes(sheetId)}`)
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
      // **썸네일 + 이름**(3-b) — 시점은 이름이 아니라 그림으로 알아본다. 그림이 없는 종이
      // (아직 한 번도 안 찍은 작도 종이)는 **같은 크기의 빈 종이**가 자리를 지킨다 —
      // 띠의 높이가 종이마다 들쭉날쭉하면 스트립이 아니라 목록이 된다.
      if (s.thumb) {
        const img = document.createElement('img')
        img.className = 'pthumb'
        img.src = s.thumb
        img.alt = ''
        tab.append(img)
      } else {
        const ph = document.createElement('span')
        ph.className = 'pthumb'
        tab.append(ph)
      }
      const label = document.createElement('span')
      label.className = 'pname'
      label.textContent = s.name
      tab.append(label)
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
    // **셔터**(web2-25 3-a) — 「+」를 «찍는 동작»으로 바꿨다. 크롬의 「+」는 «빈 것을 하나
    // 더 만든다»는 뜻인데 여기서 하는 일은 «지금 보이는 것을 한 장으로 남긴다»라 뜻이 다르다.
    // Phosphor light camera (MIT · @phosphor-icons/core assets/light/camera-light.svg 그대로)
    add.innerHTML = '<svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16" style="vertical-align:-3px"><path d="CAMPATH"/></svg>'.replace('CAMPATH', CAMERA_PATH)
    add.title = '지금 보고 있는 시점을 한 장으로 남긴다'
    add.addEventListener('click', () => {
      hooks.flash()    // 찍는 순간 화면이 한 번 번쩍한다 — 무엇이 저장됐는지가 그 자리에서 보인다
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
