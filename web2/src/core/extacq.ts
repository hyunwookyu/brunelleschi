// 연장선 **선언**(web2-30 11번) — `ext`는 오스냅 후보가 아니라 **선언된 구속**이다.
//
// ── 왜 두 번 바뀌었나 ────────────────────────────────────────────────────────
// ① web2-18 2부: `osnap`이 승격 선분마다 그 직선을 무한히 늘려 후보로 냈다. 획이 늘수록
//    화면이 연장선으로 덮여 「허공에서 뭔가에 끌린다」가 됐다 → **머무름 획득**으로 좁혔다.
// ② web2-26 3번: 획득 띠를 넓혀 헤드리스 획득률을 40 → 100/110으로 올렸다.
// ③ **web2-30 11번(지금): ②는 실패였다.** 실제 도면에서는 거의 안 걸린다 — 픽스처는 획이
//    몇 개뿐인 깨끗한 장면이고 실제 작도는 획이 수십 개라 **포인터 근처에 끝점·중점·교점
//    후보가 늘 하나쯤 있다.** `OSNAP_ORDER`에서 점이 `ext`보다 앞이므로 연장선은
//    **수면에 못 올라온다.** 띠 넓이의 문제가 아니라 **층위의 문제**였다.
//
// ── 지금의 규칙 — 획득은 **왕복 제스처**다 ──────────────────────────────────
// 사람이 낸 규칙 그대로: 「시작점에서, 연장하려는 기존 선 방향으로 갔다가 돌아오면 활성화.」
//   · **왕복** — 획을 시작한 뒤 포인터가 `C.EXT_TRIP_MIN_PX` 넘게 나갔다가
//     그 최대 거리의 `C.EXT_TRIP_RETURN_RATIO` 아래로 되돌아오면, **그 바깥 이동이 선언**이다
//   · **1차 판정** — 바깥 이동이 어떤 기존 선(또는 그 연장) 위를 지났으면 그 선
//   · **2차 판정** — 지난 선이 없으면 바깥 이동의 **방향과 가장 잘 맞는** 선
//   · **유지** — 선언된 뒤에는 다른 왕복으로 갈아타거나 획이 끝날 때까지 산다
//   · **적용** — 후보 경쟁이 아니라 **투영**이다(축 잠금과 같은 부류 — `draft.applyExtLock`)
//
// 선례(A-3): AutoCAD의 object snap tracking은 **머무름으로 획득**하고 Rhino의 방향 잠금도
// 같은 계열이다. 공통점은 **획득이 의도적 행위**라는 것 — 가까움으로 얻어걸리지 않는다.
//
// 이 모듈은 **순수**다(시각·상태 없음 — `now`를 받는다). 단위 시험이 시계 없이 잰다.

import type { CamPose } from './types'
import { C } from './constants'
import { project } from './camera'
import type { LiftResult } from './lift'
import { type Pt, dist2 } from './vec'

/** 획득된 «선분의 한 끝» — id는 승격 획의 id, end는 0(a3 쪽) 또는 1(b3 쪽) */
export interface ExtAcq { id: number; end: 0 | 1 }

export interface ExtDwell {
  /** **선언된 구속** — 그 선분의 두 끝(`{id,0}`·`{id,1}`). 비어 있으면 구속이 없다.
   *  ⚠ 이름은 `acquired` 그대로 둔다 — `extAllowed`·진단·팔이 그 이름을 읽는다(#54). */
  acquired: ExtAcq[]
  /** 이번 획의 시작점(문서 좌표) — 왕복은 여기서 잰다. null이면 획 밖이다. */
  origin: Pt | null
  /** 시작점에서 지금까지 가장 멀리 나간 거리(문서 단위) */
  farD: number
  /** 그 최원점 — 바깥 이동의 **방향**이 이것으로 정해진다 */
  farPt: Pt | null
  /** 바깥 이동이 지난 자리들 — 「어떤 선 위를 지났나」의 1차 판정에 쓴다.
   *  `C.EXT_TRIP_PATH_MAX`개까지만 든다(오래된 것부터 버린다 — 메모리 상한). */
  path: Pt[]
  /** 선언된 시각 ms — 화면 표시가 «짧게»를 이 값으로 잰다 */
  declaredAt: number
}

export const newExtDwell = (): ExtDwell =>
  ({ acquired: [], origin: null, farD: 0, farPt: null, path: [], declaredAt: 0 })

/** 획이 시작됐다 — 왕복 판정을 처음부터 다시 연다.
 *  ⚠ **선언은 안 지운다**? 아니다 — 지운다: 「획이 끝날 때까지」가 유지의 상한이므로
 *  새 획은 구속 없이 시작한다(`clearExtAcq`가 확정 때 이미 비우지만, 취소된 획 뒤에도
 *  같은 자리에서 시작하도록 여기서도 연다). */
export function beginExtTrip(st: ExtDwell, start: Pt): void {
  st.acquired.length = 0
  st.origin = { ...start }
  st.farD = 0
  st.farPt = null
  st.path = []
  st.declaredAt = 0
}

/** 점에서 직선(무한)까지의 수직거리 — 1차 판정의 자 */
function distToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 <= 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** 승격 선분의 화면 두 끝 — 없으면 null(포즈 밖) */
function segScreen(lift: LiftResult, pose: CamPose, id: number): { a: Pt; b: Pt } | null {
  const seg = lift.lifted.get(id)
  if (!seg) return null
  const a = project(lift.an, pose, seg.a3)
  const b = project(lift.an, pose, seg.b3)
  return a && b ? { a, b } : null
}

/** 바깥 이동이 **어느 선을 선언했는가** — 1차(지나간 선) → 2차(방향이 맞는 선).
 *  둘 다 없으면 null(선언 안 함 — 조용히 아무 선이나 집지 않는다). */
export function declareFromTrip(
  lift: LiftResult, pose: CamPose, origin: Pt, far: Pt, path: readonly Pt[], tolDoc: number,
): number | null {
  // ── 1차: 바깥 이동이 그 선(또는 그 연장) **위를** 지났는가 ────────────────
  let best: { id: number; score: number } | null = null
  for (const [id] of lift.lifted) {
    const sc = segScreen(lift, pose, id)
    if (!sc) continue
    let on = 0
    for (const p of path) if (distToLine(p, sc.a, sc.b) <= tolDoc) on++
    if (on === 0) continue
    if (!best || on > best.score) best = { id, score: on }
  }
  if (best) return best.id
  // ── 2차: 바깥 이동의 **방향과 가장 잘 맞는** 선 ──────────────────────────
  const vx = far.x - origin.x, vy = far.y - origin.y
  const vL = Math.hypot(vx, vy)
  if (vL <= 0) return null
  let bestCos: number = C.EXT_TRIP_DIR_COS
  let bestId: number | null = null
  for (const [id] of lift.lifted) {
    const sc = segScreen(lift, pose, id)
    if (!sc) continue
    const dx = sc.b.x - sc.a.x, dy = sc.b.y - sc.a.y
    const dL = Math.hypot(dx, dy)
    if (dL <= 0) continue
    const cos = Math.abs((vx * dx + vy * dy) / (vL * dL))
    if (cos > bestCos) { bestCos = cos; bestId = id }
  }
  return bestId
}

/** 왕복 갱신 — 그리는 중에 포인터가 움직일 때마다 한 번.
 *  반환 = **이번에 선언이 새로 섰는가**(호출자가 표시를 갱신한다).
 *  ⚠ 순수하지 않은 것은 `st`를 제자리에서 고치는 것뿐이고 시계는 인자로 받는다. */
export function updateExtTrip(
  st: ExtDwell, lift: LiftResult, pose: CamPose, cursor: Pt, tolDoc: number, minOutDoc: number, now: number,
): boolean {
  if (!st.origin) return false
  const d = Math.hypot(cursor.x - st.origin.x, cursor.y - st.origin.y)
  if (d >= st.farD) {
    // 아직 나가는 길 — 최원점과 지나온 자리를 든다
    st.farD = d
    st.farPt = { ...cursor }
    st.path.push({ ...cursor })
    if (st.path.length > C.EXT_TRIP_PATH_MAX) st.path.shift()
    return false
  }
  // 돌아오는 길 — 충분히 나갔다가 충분히 돌아왔는가
  if (st.farD < minOutDoc) return false
  if (d > st.farD * C.EXT_TRIP_RETURN_RATIO) return false
  const id = declareFromTrip(lift, pose, st.origin, st.farPt!, st.path, tolDoc)
  if (id === null) return false
  // 같은 선을 다시 선언하면 아무 일도 없다(표시가 안 깜빡인다)
  if (st.acquired.length === 2 && st.acquired[0]!.id === id) return false
  // **두 끝을 다 연다** — 「그 선의 연장」이지 「그 끝의 연장」이 아니다(사람의 문면)
  st.acquired = [{ id, end: 0 }, { id, end: 1 }]
  st.declaredAt = now
  // 다음 왕복을 위해 판정을 다시 연다(갈아타기 — 지시 3)
  st.farD = 0
  st.farPt = null
  st.path = []
  return true
}

/** 커서 아래(반경 안)의 승격 획 끝점 — **가장 가까운 것 하나**. 없으면 null.
 *  반경은 문서 좌표다(호출자가 화면 px를 배율로 나눠 준다 — osnap과 같은 규약).
 *  ⚠ 앱의 선언 경로에서는 안 쓴다(왕복이 선을 고른다) — 팔과 진단이 읽는다. */
export function endUnderCursor(
  lift: LiftResult, pose: CamPose, cursor: Pt, radiusDoc: number,
): ExtAcq | null {
  let best: ExtAcq | null = null
  let bestD = Infinity
  for (const [id, seg] of lift.lifted) {
    for (const end of [0, 1] as const) {
      const p = project(lift.an, pose, end === 0 ? seg.a3 : seg.b3)
      if (!p) continue
      const d = dist2(p, cursor)
      if (d <= radiusDoc && d < bestD) { bestD = d; best = { id, end } }
    }
  }
  return best
}

/** **선언을 직접 세운다** — 앱은 왕복이 부르고, 팔은 이것으로 «선언된 상태»를 만든다.
 *  두 끝을 다 연다(「그 선의 연장」이지 「그 끝의 연장」이 아니다). */
export function declareExt(st: ExtDwell, id: number, now = 0): void {
  st.acquired = [{ id, end: 0 }, { id, end: 1 }]
  st.declaredAt = now
}

/** 팔 전용 — 커서 아래 끝점이 속한 선분을 선언한다(옛 «머무름 획득»의 자리를 잇는다).
 *  ⚠ 앱은 이 길로 안 온다: 앱의 선언은 **왕복**뿐이다(`updateExtTrip`). */
export function declareAtForTest(
  st: ExtDwell, lift: LiftResult, pose: CamPose, cursor: Pt, radiusDoc: number,
): boolean {
  const e = endUnderCursor(lift, pose, cursor, radiusDoc)
  if (!e) return false
  declareExt(st, e.id)
  return true
}

/** 획을 확정하면 선언을 비운다 — 다음 획은 처음부터 다시 선언한다(지시 3의 상한).
 *  ⚠ `acquired`를 **새 배열로 갈지 않고 비운다** — 같은 객체를 들고 있는 쪽이 있다. */
export function clearExtAcq(st: ExtDwell): void {
  st.acquired.length = 0
  st.origin = null
  st.farD = 0
  st.farPt = null
  st.path = []
  st.declaredAt = 0
}

/** 이 선분의 이 연장이 **후보인가** — 획득됐고 상한 안인가.
 *  `t`는 `a3 + dir·t`의 파라미터(선분 단위: 0=a3, 1=b3)이고 `over`는 `SEG_OVERSHOOT_RATIO`
 *  (그 안은 `near`의 몫이다). 획득한 끝에서 `C.EXT_MAX_RATIO` 선분 길이까지만 산다. */
export function extAllowed(acquired: readonly ExtAcq[], id: number, t: number, over: number): boolean {
  for (const a of acquired) {
    if (a.id !== id) continue
    if (a.end === 0 && t < -over && t >= -C.EXT_MAX_RATIO) return true
    if (a.end === 1 && t > 1 + over && t <= 1 + C.EXT_MAX_RATIO) return true
  }
  return false
}
