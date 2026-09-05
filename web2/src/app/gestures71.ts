// web2-71 — 몸짓: 세 앱에 이미 있는 것만(UX-FLOWS §E 합의 ⑤·⑥ · §A-6 · §C-6). 새로 발명하지 않는다.
//
// 여기는 «손가락 n개 두드림»의 판정 하나다(§1·§2·§3의 두드림이 전부 이 판정을 지난다 — #54 한 자).
//   두드림 = n개가 «동시에 닿고»(첫 접촉부터 GESTURE71_TOUCH_SYNC_MS 안) · «움직이지 않고»(각 ≤ GESTURE71_TAP_MOVE_PX) ·
//            «짧게»(≤ GESTURE71_TAP_MS) 떨어진다. 그 밖은 지금대로(두 손가락 끌기 = 이동/확대 · 회전 무변).
//   두 손가락 누르고 있기(≥ GESTURE71_HOLD_MS · 안 움직임) = GESTURE71_HOLD_REPEAT_MS마다 되돌리기 반복 — 떼면 멈춘다(Procreate).
//   같은 손가락 수의 두드림 둘이 GESTURE71_DOUBLE_MS 안 = «두 번»(§2 세 손가락 두 번 · §3 한 손가락 두 번).
// 마우스/펜에는 없다(장치가 뜻을 든다 — 67). 입력은 input.ts의 pointer 사건 셋(down/move/up|cancel)에서 들어온다.
// 표식(D-1): 마지막 몸짓의 손가락 수·지속·최대 이동·판정·«왜 아님»을 lastForTest에 남긴다 — 게이트가 그 값을 잰다.
import { C } from '../core/constants'

export interface TapVerdict { fingers: number; durationMs: number; maxMovePx: number; syncMs: number; verdict: 'tap' | 'double' | 'hold' | 'none'; why: string | null; at: number }

export interface GestureHooks {
  /** 손가락 n개 두드림(한 번) — 두 번째가 350ms 안에 오면 뒤에 onDouble이 따로 온다(§2: 세 손가락 두 번은 첫 번째의 다시하기를 «되물린다» — 호출자가 그 순서를 안다) */
  onTap: (fingers: number, p: { x: number; y: number }) => void
  onDouble: (fingers: number, p: { x: number; y: number }) => void
  /** 두 손가락 누르고 있기 — 반복 한 칸마다 */
  onHoldRepeat: (fingers: number) => void
}

interface Finger { id: number; x0: number; y0: number; t0: number; maxMove: number }

export function createGestures71(hooks: GestureHooks) {
  const fingers = new Map<number, Finger>()
  let groupT0 = 0            // 첫 손가락이 닿은 시각
  let groupMax = 0           // 이 무리에서 동시에 닿은 최대 손가락 수
  let spoiled: string | null = null   // 두드림이 아닌 이유(움직임·시간·동기) — 무리 전체에 남는다
  let lastTap: { fingers: number; at: number } | null = null
  let holdT: ReturnType<typeof setTimeout> | null = null
  let holdRepeating = false
  let last: TapVerdict | null = null
  let enabled = true

  const now = () => Date.now()   // Date.now — 가짜 시계(vitest)가 덮는다 · 판정은 ms 정수면 족하다
  const clearHold = () => { if (holdT !== null) { globalThis.clearInterval(holdT); holdT = null } holdRepeating = false }
  const centroid = () => { let x = 0, y = 0, n = 0; for (const f of fingers.values()) { x += f.x0; y += f.y0; n++ } return n ? { x: x / n, y: y / n } : { x: 0, y: 0 } }

  function armHold() {
    clearHold()
    if (fingers.size !== 2) return
    // 두 손가락 · 안 움직임 · HOLD_MS 넘게 → REPEAT_MS마다 되돌리기(Procreate 「손가락 두 개를 대고 있으면 빠르게」)
    const t = globalThis.setTimeout(() => {
      if (fingers.size !== 2 || spoiled) return
      holdRepeating = true
      hooks.onHoldRepeat(2)
      holdT = globalThis.setInterval(() => { if (fingers.size === 2 && !spoiled) hooks.onHoldRepeat(2); else clearHold() }, C.GESTURE71_HOLD_REPEAT_MS)
    }, C.GESTURE71_HOLD_MS)
    holdT = t
    // setTimeout 뒤 setInterval로 갈아 끼우므로 홀드 «시작»은 t · 반복은 interval — clearHold가 둘 다 지운다(clearInterval은 timeout id도 지운다)
  }

  return {
    down(id: number, x: number, y: number) {
      if (!enabled) return
      const t = now()
      if (fingers.size === 0) { groupT0 = t; groupMax = 0; spoiled = null }
      else if (t - groupT0 > C.GESTURE71_TOUCH_SYNC_MS) spoiled = spoiled ?? `sync ${Math.round(t - groupT0)}ms > ${C.GESTURE71_TOUCH_SYNC_MS}`
      fingers.set(id, { id, x0: x, y0: y, t0: t, maxMove: 0 })
      groupMax = Math.max(groupMax, fingers.size)
      armHold()
    },
    move(id: number, x: number, y: number) {
      const f = fingers.get(id); if (!f) return
      f.maxMove = Math.max(f.maxMove, Math.hypot(x - f.x0, y - f.y0))
      if (f.maxMove > C.GESTURE71_TAP_MOVE_PX && !spoiled) { spoiled = `move ${f.maxMove.toFixed(1)}px > ${C.GESTURE71_TAP_MOVE_PX}`; clearHold() }
    },
    /** 뗌 — 마지막 손가락이 떨어질 때 판정. cancel은 두드림이 아니다. */
    up(id: number, cancel = false) {
      const f = fingers.get(id); if (!f) return
      const t = now()
      const dur = t - groupT0
      const maxMove = Math.max(...[...fingers.values()].map(g => g.maxMove))
      fingers.delete(id)
      if (fingers.size > 0) return          // 남은 손가락이 떨어질 때 판정한다
      const wasHold = holdRepeating         // clearHold가 지우기 «전»에 읽는다
      clearHold()
      let verdict: TapVerdict['verdict'] = 'none'; let why: string | null = spoiled
      if (cancel) why = why ?? 'cancel'
      else if (wasHold) { verdict = 'hold'; why = null }
      else if (!why && dur > C.GESTURE71_TAP_MS) why = `duration ${Math.round(dur)}ms > ${C.GESTURE71_TAP_MS}`
      else if (!why) {
        verdict = 'tap'
        const p = { x: f.x0, y: f.y0 }
        if (lastTap && lastTap.fingers === groupMax && t - lastTap.at <= C.GESTURE71_DOUBLE_MS) { verdict = 'double'; lastTap = null; hooks.onDouble(groupMax, p) }
        else { lastTap = { fingers: groupMax, at: t }; hooks.onTap(groupMax, p) }
      }
      last = { fingers: groupMax, durationMs: Math.round(dur), maxMovePx: +maxMove.toFixed(1), syncMs: 0, verdict, why, at: t }
    },
    /** 진단(D-1 표식) */
    lastForTest: (): TapVerdict | null => last,
    activeFingers: () => fingers.size,
    setEnabled(v: boolean) { enabled = v; if (!v) { fingers.clear(); clearHold() } },
    resetForTest() { fingers.clear(); clearHold(); lastTap = null; last = null; spoiled = null },
  }
}
