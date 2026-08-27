// 연장선 **획득**(web2-18 2부) — `ext` 오스냅은 상시가 아니라 획득식이다.
//
// 왜 바꿨나(2-a): `osnap.ts`가 승격된 선분마다 그 직선을 **무한히 늘려** 커서 광선과의
// 최근접점을 후보로 냈다. 길이 상한도 획득 절차도 없었으므로 획이 늘수록 화면이
// 연장선으로 덮이고, 반경(8px) 안에 하나라도 들면 끌렸다. 사람이 본 것이 그것이다
// (「스타일러스를 떼기 전에 허공에서도 어딘가에 스냅이 잡혀 끌려다니는 느낌 · 네모 표시」 —
// 파선 네모가 `ext`의 기호다). web2-15가 이미 그 증상을 `osnap.ts` 주석에 적어 뒀고
// (「그 선의 연장(ext)이 조준 경로 내내 잡혀 near는 한 번도 못 이긴다」) `xint`로
// **우회**했다 — 이 회차가 원인을 친다.
//
// 선례 그대로다(A-3 — 새로 설계하지 않는다): AutoCAD의 Extension도 Rhino의 Ext도
// **상시가 아니다**. 끝점 위에 잠깐 머물러 그 선을 **획득**해야 그 연장이 산다.
// 지금처럼 모든 선의 연장이 항상 떠 있는 동작은 두 도구 다 안 한다.
//
// 규칙 넷:
//   · **획득** — 커서가 어떤 승격 선분의 끝점 오스냅 반경 안에 `C.EXT_ACQUIRE_MS` 머문다
//   · **개수** — 최대 2, LRU(앞이 최신). 획을 확정하면 비운다
//   · **길이 상한** — 획득한 끝점에서 `C.EXT_MAX_RATIO × 그 선분 길이`까지만 후보다
//   · **표시** — 획득한 끝점에 표식이 남는다(render2d — 안 보이면 또 조용한 동작이다)
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
  /** 획득된 끝점들 — 최대 `C.EXT_MAX_ACQUIRED`, **앞이 최신**(LRU) */
  acquired: ExtAcq[]
  /** 지금 머무르고 있는 끝점(아직 획득 전일 수 있다) */
  hover: ExtAcq | null
  /** 그 끝점에 머물기 시작한 시각 ms */
  since: number
}

export const newExtDwell = (): ExtDwell => ({ acquired: [], hover: null, since: 0 })

const same = (a: ExtAcq | null, b: ExtAcq | null): boolean =>
  a !== null && b !== null && a.id === b.id && a.end === b.end

/** 커서 아래(반경 안)의 승격 획 끝점 — **가장 가까운 것 하나**. 없으면 null.
 *  반경은 문서 좌표다(호출자가 화면 px를 배율로 나눠 준다 — osnap과 같은 규약). */
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

/** 머무름 갱신 — 같은 끝점에 `C.EXT_ACQUIRE_MS` 이상 머물면 **획득**한다.
 *  반환값은 «표시가 달라졌는가»(획득 목록이나 머무는 끝점이 바뀌었는가) — 호출자가
 *  다시 그릴지 정한다. 상태는 `st`를 제자리에서 고친다.
 *
 *  ⚠ **이미 획득된 끝점 위에 다시 머물러도 목록은 안 흔든다** — 같은 것을 LRU 앞으로
 *  올리는 «갱신»만 한다. 안 그러면 그 위를 지나는 것만으로 다른 획득이 밀려난다. */
export function updateExtDwell(
  st: ExtDwell, lift: LiftResult, pose: CamPose, cursor: Pt, radiusDoc: number, now: number,
): boolean {
  const under = endUnderCursor(lift, pose, cursor, radiusDoc)
  let changed = false
  if (!same(under, st.hover)) {
    st.hover = under
    st.since = now
    changed = true
  }
  if (!under) return changed
  if (now - st.since < C.EXT_ACQUIRE_MS) return changed
  const at = st.acquired.findIndex(a => a.id === under.id && a.end === under.end)
  if (at === 0) return changed                       // 이미 최신 — 아무 일도 없다
  if (at > 0) { st.acquired.splice(at, 1); st.acquired.unshift(under); return true }
  st.acquired.unshift(under)
  if (st.acquired.length > C.EXT_MAX_ACQUIRED) st.acquired.length = C.EXT_MAX_ACQUIRED
  return true
}

/** 획을 확정하면 획득을 비운다(지시 2-b) — 다음 획은 처음부터 다시 획득한다.
 *  ⚠ `acquired`를 **새 배열로 갈지 않고 비운다** — 같은 객체를 들고 있는 쪽이 있다. */
export function clearExtAcq(st: ExtDwell): void {
  st.acquired.length = 0
  st.hover = null
  st.since = 0
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
