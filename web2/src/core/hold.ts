// 후행 확정(머무름) — **옐로 전용**(web2-22 2부 · QuickShape 어법).
//
// 사람이 정한 것: 스냅을 완전히 없앨 건 아니지만 **토글을 띄워놓고 스케치하는 것이
// 싫다.** 선례 둘(지시가 조사했다): Procreate QuickShape(제스처 — 끝에서 머무르면
// 반듯) ↔ Clip Studio 자(메뉴 토글이 하나 더). 사람이 싫다는 감각이 정확히 후자라
// **제스처 쪽**으로 간다. 토글 ⛔ — 기본 동작이 언제나 켜져 있다.
//
// 원칙 d와의 순서(2-b): 머무름은 **확정 전 판정**이다 — 머무르면 «미리보기가»
// 반듯해지고, 그 상태로 떼면 그대로 확정된다. 순서를 뒤집지 않는다.
//
// 시각은 **살아 있는 값**(호출자가 넣는 now — #73 ㉡: 동결 참조 금지)이고, 넣는
// 구조라 시험이 가짜 시계로 양끝(지연 0·큰 값)을 잰다(팔 ⑦).

import { C } from './constants'
import type { Pt } from './vec'

/** 머무름 게이트 — 커서가 HOLD_JITTER_PX 안에서 HOLD_MS 이상 머물렀는가.
 *  순수 상태 기계(시간 주입) — input.ts와 시험이 같은 것을 쓴다. */
export interface HoldGate { ref: Pt | null; since: number; held: boolean }
export const newHoldGate = (): HoldGate => ({ ref: null, since: 0, held: false })

/** 커서 표본 하나 — 반환: 지금 머무름이 성립해 있는가.
 *  holdMs를 주입받는 이유는 팔 ⑦(양끝: 0이면 늘, 크면 거의 안)이다 — 앱은 C.HOLD_MS. */
export function tickHold(g: HoldGate, p: Pt, now: number, holdMs = C.HOLD_MS): boolean {
  if (!g.ref || Math.hypot(p.x - g.ref.x, p.y - g.ref.y) > C.HOLD_JITTER_PX) {
    g.ref = { x: p.x, y: p.y }
    g.since = now
    g.held = false
  } else if (now - g.since >= holdMs) {
    g.held = true
  }
  return g.held
}

/** 반듯해진 끝점 — **직선화가 먼저다**(이 앱의 확정 기하는 이미 직선 a→b라 직선화는
 *  raw를 [a,b]로 줄이는 것이 전부다 — 호출자 몫). 그다음 **화면 수평·수직**에
 *  가까우면(YELLOW_SNAP_DEG) 거기까지 붙는다. ⛔ 소실점 방향 없음(지시 2-a).
 *  머무르지 않았으면(held=false) 커서 그대로다(팔 ②). */
export function yellowEnd(start: Pt, cur: Pt, held: boolean): { end: Pt; snapped: 'H' | 'V' | null } {
  if (!held) return { end: cur, snapped: null }
  const dx = cur.x - start.x, dy = cur.y - start.y
  if (Math.hypot(dx, dy) < 1e-9) return { end: cur, snapped: null }
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI)   // 0..180
  if (ang <= C.YELLOW_SNAP_DEG || ang >= 180 - C.YELLOW_SNAP_DEG) {
    return { end: { x: cur.x, y: start.y }, snapped: 'H' }
  }
  if (Math.abs(ang - 90) <= C.YELLOW_SNAP_DEG) {
    return { end: { x: start.x, y: cur.y }, snapped: 'V' }
  }
  return { end: cur, snapped: null }                          // 직선화만(각도 그대로)
}
