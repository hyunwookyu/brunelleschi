// 알림 — 화면 최상단 한 줄(원칙 g). 박스 없음. 평소에는 비어 있다.
// 선택이 필요하면 그 줄에 **밑줄 단어**로 붙인다(캐드 명령줄 선례) — 대화상자를 안 띄운다.

import { registerBox } from './boxes'

let el: HTMLElement | null = null
let timer: number | undefined

export function initNotice(node: HTMLElement) { el = node }

/** 줄을 비운다 — 물음이 떠 있었다면 그것이 취소된 것이다(단어가 사라지므로 못 누른다) */
export function clearNotice() {
  if (!el) return
  clearTimeout(timer)
  el.textContent = ''
}

/** 잠깐 떴다 사라지는 알림 */
export function notify(msg: string, ms = 2500) {
  if (!el) return
  el.textContent = msg
  clearTimeout(timer)
  timer = window.setTimeout(() => { if (el) el.textContent = '' }, ms)
}

/** 상태 줄 — 작도 안내처럼 상태가 지속되는 동안 유지 */
export function status(msg: string) {
  if (!el) return
  clearTimeout(timer)
  el.textContent = msg
}

export interface Choice {
  /** 선택자용 키(언어 무관) — `#notice u[data-pick="yes"]` */
  key: string
  label: string
  onPick?: () => void
}

/** 물음 — 같은 한 줄에 밑줄 단어로 선택지를 붙인다. 사라지지 않는다(누를 때까지).
 *  다른 알림·상태가 줄을 덮으면 그것이 곧 취소다 — 따로 상태를 두지 않는다.
 *  ⚠ web2-12 4번부터 **버튼이 있는 물음은 여기로 오지 않는다**(confirmNear — 그 버튼
 *  곁에 뜬다). 남는 쓰임은 앵커가 없는 상태 물음(작도 미완 안내)뿐이다. */
export function ask(msg: string, choices: Choice[]) {
  if (!el) return
  clearTimeout(timer)
  el.textContent = `${msg} `
  choices.forEach((c, i) => {
    if (i > 0) el!.append(' / ')
    const u = document.createElement('u')
    u.textContent = c.label
    u.dataset.pick = c.key
    u.addEventListener('click', () => { clearNotice(); c.onPick?.() })
    el!.append(u)
  })
}

// ── 버튼 곁 확인(web2-12 4번) — 「확인이 상부 대화창에 떠서 손이 왕복한다」의 답 ──────
// 누른 버튼의 **왼쪽 옆**에 뜬다: 손이 그 자리에 있고, 확인 단어가 버튼과 **다른
// 자리**라 같은 곳을 연타해도 확인이 눌리지 않는다(연타 방어 — e2e가 실제로 연타한다).
// 비우기는 실행취소 대상이 아니라 이 확인이 유일한 방어선이다(지시 문면).
let pop: HTMLElement | null = null
let awayRm: (() => void) | null = null
export function dismissConfirm() {
  pop?.remove()
  pop = null
  awayRm?.()
  awayRm = null
}
export function confirmNear(anchor: HTMLElement, msg: string,
  yes: { label: string; onPick: () => void }) {
  dismissConfirm()
  clearNotice()
  const r = anchor.getBoundingClientRect()
  pop = document.createElement('div')
  pop.className = 'confirm-pop'
  pop.id = 'confirm-pop'
  const text = document.createElement('span')
  text.textContent = msg
  const u = document.createElement('u')
  u.textContent = yes.label
  u.dataset.pick = 'yes'
  u.addEventListener('click', () => { dismissConfirm(); yes.onPick() })
  const no = document.createElement('u')
  no.textContent = '취소'
  no.dataset.pick = 'no'
  no.addEventListener('click', dismissConfirm)
  pop.append(text, u, no)
  document.body.append(pop)
  // 버튼의 왼쪽, 세로는 버튼 가운데 정렬 — 화면 위로 안 나가게 아래로만 민다
  pop.style.right = `${Math.round(window.innerWidth - r.left + 10)}px`
  pop.style.top = `${Math.round(Math.max(6, r.top + r.height / 2 - pop.offsetHeight / 2))}px`
  // 바깥 누름 = 취소. 여는 것은 'click'(pointerdown·up이 이미 끝난 뒤)이므로
  // 지금 부착해도 이 열림의 pointerdown이 되돌아 닫는 일은 없다 — 즉시 단다.
  // ⚠ 규약은 `boxes.ts` 한 자리로 옮겼다(web2-34 4번 · R7 · #54). 거동은 그대로다:
  //   «안»은 이 팝오버뿐이고 **앵커는 안 넣는다** — 같은 버튼을 다시 눌러도 걷힌다
  //   (같은 자리 연타로 지워지지 않게 하는 방어의 일부다 — web2-12 4번 · flow.spec).
  // ⚠⚠ `exclusive: false` — 이것은 «통»이 아니라 **열린 서랍 안의 단추에 곁딸린 확인**이라
  //   그 서랍과 **함께 떠 있는 것이 설계**다(#69 ㉣ · `data-fold="late"`의 짝).
  awayRm = registerBox({
    id: '#confirm-pop',
    isOpen: () => pop !== null,
    close: () => dismissConfirm(),
    zone: () => [pop],
    exclusive: false,
  })
}
