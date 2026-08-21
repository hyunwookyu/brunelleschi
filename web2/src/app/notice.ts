// 알림 — 화면 최상단 한 줄(원칙 g). 박스 없음. 평소에는 비어 있다.
// 선택이 필요하면 그 줄에 **밑줄 단어**로 붙인다(캐드 명령줄 선례) — 대화상자를 안 띄운다.

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
 *  다른 알림·상태가 줄을 덮으면 그것이 곧 취소다 — 따로 상태를 두지 않는다. */
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
