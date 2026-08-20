// 알림 — 화면 최상단 한 줄(원칙 g). 박스 없음. 평소에는 비어 있다.

let el: HTMLElement | null = null
let timer: number | undefined

export function initNotice(node: HTMLElement) { el = node }

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
