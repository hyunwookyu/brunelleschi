// 종속 탭 줄(web2-20 2부) — **겹은 도구가 아니라 종이다**: 종이 띠 바로 아래 줄
// (web2-19 2-c가 비워 둔 자리). **지금 활성인 종이의 겹만** 보이고, 종이를 바꾸면 줄도 바뀐다.
//
// ⚙️⚙️ **web2-25 4부가 형태를 갈았다 — 사람의 문면: 「토글 표시 역시 아직은 쓰기 불편하다」.**
//   왜 불편했는가: 겹이 34×28 짜리 작은 탭인데 그 안에 눈·자물쇠를 우겨넣었다. Procreate 의
//   레이어 행이 넉넉한 이유는 **가로로 길기 때문**이다 — 한 행에 [썸네일|이름|표시]가 다 든다.
//   그래서 **연필통과 같은 어법**으로 통일했다:
//     · 평소에는 **요약 하나** — 롤 아이콘에 쌓인 수(「3」)
//     · 누르면 **세로 목록** — 한 줄에 [롤 아이콘 | 번호 | 눈 | 자물쇠 | ×]. 줄이 넓다
//     · **길게 누르면 솔로**(그것만 보기) — Procreate 가 표시 체크박스를 길게 눌러 하는 것
//   ⚠ 옛 형태(겹쳐 놓은 종이를 옆에서 본 탭 더미)는 «가산적임»을 형태로 말했다. 그 뜻은
//   요약의 **수**가 이어받는다 — 종이는 탭이 여럿이고(배타적) 겹은 하나에 수가 붙는다.
//
// ⚠ 앱은 겹의 목적을 제안하지 않는다(지시 0 ⚠⚠) — 화면에 뜨는 것은 종이 종류 둘
// (트레이싱지·옐로)과 켬/끔·잠금뿐이다. 「층」·「레이어」라는 말을 화면에 안 쓴다.

import type { App } from './state'
import { addLayer, isSolo, removeLayer, setActiveLayer, setLayerOn, setLayerLocked, setSolo } from './state'
import type { Layer, Paper } from '../core/types'
import { paperName } from '../core/types'
import { C } from '../core/constants'
import { registerBox, closeOtherBoxes } from './boxes'
import { ICON_EYE, ICON_EYE_OFF, ICON_LOCK, ICON_PLUS, sized } from '../ui/icons'

// web2-70 §3 — 눈·자물쇠·「+」는 아이콘 세트(Lucide · src/ui/icons.ts)에서 — Phosphor 이식은 지웠다(#109 지운 것의 목록 · NOTES 70)

// 롤 아이콘 — docs/instrument-icons.md 「트레이싱지 롤 / 옐로 트레이스 롤」 정본 그대로
// (path 수정 금지 · 옐로만 고리를 var(--pic-yellow)로 채운다 — 선 아이콘의 유일한 색 예외).
// export — 손 띠의 롤 버튼(web2-21 3-a·main.ts)이 같은 정본을 쓴다(#54: 그림 출처 하나).
export const ROLL_TRACING = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>'
export const ROLL_YELLOW = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path fill="var(--pic-yellow)" stroke="none" fill-rule="evenodd" d="M13.5 6.8 a8.2 8.2 0 1 1 0 16.4 a8.2 8.2 0 1 1 0 -16.4 Z M13.5 12.2 a2.8 2.8 0 1 0 0 5.6 a2.8 2.8 0 1 0 0 -5.6 Z"/><circle cx="13.5" cy="15" r="8.2"/><circle cx="13.5" cy="15" r="2.8"/><path d="M13.5 23.2 H27.5"/></svg>'

/** 2-a 안내 문구 — 종속 탭 「+」와 손 띠 롤 버튼(web2-21 3-a)이 같은 문구를 **한 상수**로
 *  쓴다(#54 — 문자열 복제는 자동이 못 잡는 두 자리다, 3·4부 리뷰 [12]). */
export const LAYER_GATE_MSG = '소실점 작도가 끝나야 종이를 얹을 수 있다'

export interface LayerbarHooks {
  /** 새 겹의 rect 기본값(2-b) = 지금 보이는 화면 — 뷰포트 크기는 호출부가 안다 */
  viewport: () => { W: number; H: number }
  onChange: () => void
  /** 눌리지 않는 이유가 보여야 한다(2-a) — 한 줄 안내 채널 */
  notify: (msg: string) => void
  /** 겹을 얹기 **직전** 한 번(web2-25 2부) — 돌려본 시점이면 그것을 새 종이로 굳힌다.
   *  ⚠ 겹을 얹는 자리가 둘(이 「+」와 손 띠의 롤)이라 **앞처리도 한 함수**여야 한다(#54) —
   *  한쪽만 굳히면 「어떤 길로는 보이고 어떤 길로는 안 보인다」가 난다. */
  beforeAdd?: () => void
  /** 겹을 얹은 **뒤** 한 번(web2-23 3부) — 옐로의 밑그림 안내가 여기 걸린다.
   *  겹을 얹는 자리가 둘(이 「+」와 손 띠의 롤)이라 **뒤처리는 한 함수**여야 한다(#54). */
  afterAdd?: (layer: Layer) => void
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
    closeOtherBoxes('#layer-pop')     // 동시에 둘이 열리지 않는다(R7)
    const r = anchor.getBoundingClientRect()
    pop.style.left = `${Math.round(Math.max(4, r.left))}px`
    pop.style.top = `${Math.round(r.bottom + 4)}px`
    // 바깥 누름 = 닫힘(화면 규칙 R7). ⚠ **이 세 줄이 R7의 선례였다** — web2-34 4번이
    // 같은 규약을 `boxes.ts` 한 자리로 옮겼다(#54). 거동은 그대로다.
    popAway = registerBox({
      id: '#layer-pop',
      isOpen: () => pop !== null,
      close: () => closePop(),
      zone: () => [pop, anchor],
    })
  }

  /** 목록이 펼쳐졌는가 — **접으면 요약, 펼치면 목록**(web2-25 4-a). 연필통과 같은 어법이다.
   *  런타임 상태이고 기본은 **접힘**이다(요약 하나). */
  let open = false

  function render() {
    closePop()
    host.textContent = ''
    const layers = app.doc.layers.filter(l => l.sheet === app.activeSheet)

    // ── 접힌 요약 하나(4-a) — 롤 아이콘 + 쌓인 수. 겹이 없으면 요약도 없다 ──────────
    // ⚠ 종이 탭(배타적)과의 차이가 여기서도 형태로 남는다: 종이는 **탭이 여럿**이고
    //   겹은 **하나에 수가 붙는다**(가산적임을 그 수가 말한다).
    if (layers.length > 0) {
      // ⚠⚠ **web2-34 2번(화면 규칙 R6 — 접힌 통은 지금 고른 것을 말한다)**: 요약의 롤은
      //   **지금 그리는 겹**(활성)이다. 종전에는 **맨 위 겹**을 그렸고, 아래 겹을 골라
      //   두면 접힌 요약이 «지금 무엇에 그리는지»를 **틀리게 말했다** — 실측으로 잡았다
      //   (활성 3 = 트레이싱지인데 요약은 옐로를 그렸다). 34-0 전수 대조표와 DECISIONS의
      //   「겹 요약은 이미 지킨다」가 **짐작이었고 측정이 뒤집었다**(D-4).
      // ⚠ **수(`.lsum-n`)는 그대로 «장수»다** — 그 수는 «겹은 가산적»을 말하는 다른
      //   채널이고 layerbar·layerlist의 팔이 그 뜻으로 읽는다. 한 손잡이에 뜻을 하나 더
      //   얹으면 옛 뜻이 조용히 죽는다(#77 ㉠) — 그래서 **그림만** 활성을 따른다.
      const top = layers[layers.length - 1]!
      const cur = layers.find(l => l.id === app.activeLayer) ?? top
      const curN = layers.indexOf(cur) + 1
      const sum = document.createElement('button')
      sum.id = 'layer-summary'
      sum.className = 'lsum' + (open ? ' open' : '') + (app.solo ? ' solo' : '')
      sum.dataset.active = String(curN)
      sum.dataset.paper = cur.paper
      sum.innerHTML = (cur.paper === 'yellow' ? ROLL_YELLOW : ROLL_TRACING)
        + `<span class="lsum-n">${layers.length}</span>`
      sum.title = open ? '겹 목록을 접는다'
        : `${paperName(cur.paper)} ${curN}번에 그린다 — 얹은 종이 ${layers.length}장, 눌러서 목록`
      sum.addEventListener('click', () => { open = !open; render() })
      host.append(sum)
    } else {
      open = false
    }

    // 「+」 — 카메라가 닫히기 전에는 비활성(2-a). 눌리지 않는 이유가 보여야 한다.
    const add = document.createElement('button')
    add.id = 'layer-add'
    add.className = 'ltab ladd'
    add.innerHTML = sized(ICON_PLUS, 11)
    const done = app.lift.an.constructionDone
    add.classList.toggle('disabled', !done)
    add.title = done ? '종이를 얹는다 — 트레이싱지·옐로' : '소실점 작도가 끝나야 얹을 수 있다'
    add.addEventListener('click', () => {
      if (!app.lift.an.constructionDone) {
        hooks.notify(LAYER_GATE_MSG)
        return
      }
      openPopAt(add, p => {
        for (const [paper, svg] of [
          ['tracing', ROLL_TRACING],
          ['yellow', ROLL_YELLOW],
        ] as [Paper, string][]) {
          const label = paperName(paper)
          const b = document.createElement('button')
          b.className = 'lpick'
          b.dataset.paper = paper
          b.innerHTML = `${svg}<span>${label}</span>`
          b.addEventListener('click', () => {
            hooks.beforeAdd?.()          // 시점을 먼저 굳힌다(2-b) — 롤과 같은 함수
            const lay = addLayer(app, paper, hooks.viewport())
            closePop()
            render()
            hooks.onChange()
            if (lay) hooks.afterAdd?.(lay)
          })
          p.append(b)
        }
      })
    })
    host.append(add)

    // ── 펼친 목록(4-a) — 한 줄에 [롤 아이콘 | 번호 | 눈 | 자물쇠 | ×]. **줄이 넓다** ──
    if (open && layers.length > 0) {
      const list = document.createElement('div')
      list.id = 'layer-list'
      // 나중에 얹은 것이 위로 — 쌓인 순서를 세로가 그대로 말한다(번호는 아래부터 1)
      layers.forEach((lay, i) => list.prepend(layerRow(lay, i + 1)))
      host.append(list)
    }
  }

  /** 목록의 한 줄 — [롤 아이콘 | 번호 | 눈 | 자물쇠 | ×]. 몸통 = 활성으로 · **길게 = 솔로**. */
  function layerRow(lay: Layer, n: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'lrow ' + lay.paper
      + (lay.on ? ' on' : '')
      + (app.activeLayer === lay.id ? ' active' : '')
      + (lay.locked ? ' locked' : '')
      + (isSolo(app, lay.id) ? ' solo' : '')
    row.dataset.layer = String(lay.id)
    const icon = document.createElement('span')
    icon.className = 'lrow-icon'
    icon.innerHTML = lay.paper === 'yellow' ? ROLL_YELLOW : ROLL_TRACING
    const num = document.createElement('span')
    num.className = 'lrow-n'
    num.textContent = String(n)
    row.append(icon, num)

    // 몸통 = 활성으로(켜짐 겸). 잠긴 겹은 활성이 못 된다(state가 지킨다).
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.lctl')) return   // 표식 몫
      if (lpFired) { lpFired = false; return }                 // 길게 누른 손을 뗀 것
      setActiveLayer(app, lay.id)
      render()
      hooks.onChange()
    })
    // **길게 누르면 솔로**(4-a) — Procreate 가 표시 체크박스를 길게 눌러 하는 것.
    // 다시 길게 누르면 돌아온다. 시간·이동 허용은 종이 탭과 같은 값(새 숫자 ⛔ #54).
    let lpTimer: number | undefined
    let lpStart: { x: number; y: number } | null = null
    let lpFired = false
    row.addEventListener('pointerdown', e => {
      lpStart = { x: e.clientX, y: e.clientY }
      lpTimer = window.setTimeout(() => {
        lpTimer = undefined
        lpFired = true
        const was = isSolo(app, lay.id)
        setSolo(app, was ? null : lay.id)
        render()
        hooks.onChange()
        hooks.notify(was ? '전부 다시 보인다' : `${n}번만 보인다 — 길게 눌러 되돌린다`)
      }, C.PAPER_LONGPRESS_MS)
    })
    const cancel = () => { clearTimeout(lpTimer); lpTimer = undefined; lpStart = null }
    row.addEventListener('pointerup', cancel)
    row.addEventListener('pointercancel', cancel)
    row.addEventListener('pointermove', e => {
      if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > C.OSNAP_RADIUS_PX) cancel()
    })

    // 켬/끔 표식(= 토글) · 잠금 표식(= 토글) — **줄이 넓어 손가락이 정확히 안 가도 된다**
    const eye = document.createElement('button')
    eye.className = 'lctl leye'
    eye.innerHTML = sized(lay.on ? ICON_EYE : ICON_EYE_OFF, 14)
    eye.title = lay.on ? '끈다 — 안 보이고 3D에서 빠진다' : '켠다'
    eye.addEventListener('click', () => { setLayerOn(app, lay.id, !lay.on); render(); hooks.onChange() })
    const lock = document.createElement('button')
    lock.className = 'lctl llock'
    lock.innerHTML = sized(ICON_LOCK, 14)
    lock.title = lay.locked ? '잠금을 푼다' : '잠근다 — 보이지만 편집이 막힌다'
    lock.addEventListener('click', () => { setLayerLocked(app, lay.id, !lay.locked); render(); hooks.onChange() })
    // 지우기 — 확인 한 번(획 수를 알린다. web2-20 2-c 규약 그대로, 자리만 줄 안으로 왔다)
    const del = document.createElement('button')
    del.className = 'lctl ldel'
    del.textContent = '×'
    del.title = paperName(lay.paper) + '를 지운다'
    del.addEventListener('click', () => {
      const cnt = app.doc.strokes.filter(x => x.layer === lay.id).length
      openPopAt(del, p => {
        const span = document.createElement('span')
        // 30-4 — **대상을 밝힌다.** 「이 종이」는 틀린 말이었다(지우는 것은 종이가 아니라
        // 그 위에 **얹은 겹**이다) — 종이 삭제는 `paperbar`의 다른 확인이다.
        span.textContent = `이 ${paperName(lay.paper)}를 지운다 — 그 위의 획 ${cnt}개도 함께 지워진다(실행취소로 돌아온다). `
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
    })
    row.append(eye, lock, del)
    return row
  }

  render()
  return { sync: render }
}
