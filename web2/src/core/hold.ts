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

/** 머무름 게이트 — **표류와 창 속도, 둘 다**(web2-26 4번).
 *
 *  종전에는 「커서가 `HOLD_JITTER_PX`(4px) 상자 안에서 `HOLD_MS`(600ms) 이상」 하나였다.
 *  실기기가 「대기시간이 조금 길다」로 냈고(DEVICE-CHECK D6) 기본을 350ms로 내렸는데,
 *  **시간만 내리면 반대편으로 넘어진다**: 상자+시간의 실효 표류 속도가 `상자 ÷ 시간`이라
 *  600 → 350ms가 문턱을 6.7 → 11.4 px/s로 **넓히기** 때문이다. 그러면 천천히 그린
 *  곡선이 **더** 잘 직선화된다 — 지시가 경고한 그 방향이다.
 *
 *  그래서 조건을 「**임계 시간 동안 속도가 문턱 아래**」로 바꿨다. 문 둘:
 *   ① **표류** — ref에서의 거리가 `HOLD_JITTER_PX × holdMs / HOLD_DRIFT_REF_MS`(바닥
 *      `HOLD_JITTER_MIN_PX`) 안. 상자가 시간에 비례하므로 **실효 표류 속도 6.7 px/s가
 *      임계 시간과 무관하게 일정하다** — 이것이 「시간만 내리지 않았다」의 내용이다.
 *   ② **창 속도** — 최근 `HOLD_SPEED_WINDOW_MS` 창의 순 이동 ÷ 창이 `speedPxS` 아래.
 *      표류만으로는 「작게 빠르게 흔들다 제자리로 돌아오는 손」을 못 거른다(표류 0).
 *
 *  ⚠ 지수평활이 아니라 **이동창**이다 — 평활은 멈춘 뒤 문턱까지 내려오는 데 그리던
 *  속도의 로그만큼 걸려(실측 600ms 대역) 「빨라졌다」를 통째로 잡아먹는다.
 *
 *  순수 상태 기계(시간 주입)이고 input.ts와 시험이 같은 것을 쓴다. */
export interface HoldGate {
  ref: Pt | null
  since: number
  held: boolean
  /** 창 속도용 표본 고리 — 창보다 오래된 것은 버린다(길이 상한이 창÷표본간격이다) */
  win: { p: Pt; t: number }[]
  /** 마지막으로 잰 창 속도 px/s(진단·팔) — 표본이 창을 못 채웠으면 null */
  vel: number | null
}
export const newHoldGate = (): HoldGate =>
  ({ ref: null, since: 0, held: false, win: [], vel: null })

/** 그 임계 시간에서의 표류 허용(화면 px) — 시간에 **비례**한다(위 ①). */
export const driftAllowPx = (holdMs: number): number =>
  Math.max(C.HOLD_JITTER_MIN_PX, C.HOLD_JITTER_PX * holdMs / C.HOLD_DRIFT_REF_MS)

/** 커서 표본 하나 — 반환: 지금 머무름이 성립해 있는가.
 *  `holdMs`·`speedPxS`를 주입받는 이유는 팔(양끝: 0이면 늘, 크면 거의 안)과 화면
 *  손잡이다 — 앱은 `app.holdMs`(사람이 고친다)와 `C.HOLD_SPEED_PX_S`. */
export function tickHold(
  g: HoldGate, p: Pt, now: number,
  holdMs: number = C.HOLD_MS,
  speedPxS: number = C.HOLD_SPEED_PX_S,
  /** 표류 허용 override(화면 px) — **D-3 반증 전용**. `C.HOLD_JITTER_PX`(고정 4px)와
   *  `speedPxS = Infinity`를 함께 주면 **web2-26 이전 게이트가 그대로 재현된다**.
   *  팔이 그것으로 「시간만 내리면 반대 방향」을 같은 실행에서 실증한다. */
  driftPx?: number,
): boolean {
  // ── 창 속도 ────────────────────────────────────────────────────────────────
  g.win.push({ p: { x: p.x, y: p.y }, t: now })
  while (g.win.length > 1 && now - g.win[1]!.t >= C.HOLD_SPEED_WINDOW_MS) g.win.shift()
  const old = g.win[0]!
  const span = now - old.t
  // 창을 못 채웠으면 아직 모른다 — **0으로 본다**(표류 문이 같이 걸리므로 「빠른데
  // 표류 0」이 될 수 없고, 그래야 지연 0의 양끝 팔이 산다).
  g.vel = span > 0 ? Math.hypot(p.x - old.p.x, p.y - old.p.y) / (span / 1000) : null

  // ── 문 둘 — 하나라도 어긋나면 시계가 처음으로 돌아간다 ─────────────────────
  const allow = driftPx ?? driftAllowPx(holdMs)
  const drifted = !g.ref || Math.hypot(p.x - g.ref.x, p.y - g.ref.y) > allow
  const tooFast = g.vel !== null && g.vel > speedPxS
  if (drifted || tooFast) {
    if (drifted) g.ref = { x: p.x, y: p.y }
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
