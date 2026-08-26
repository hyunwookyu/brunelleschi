// 모서리 넘김(web2-12 8번) — **표현 판정만** 한다: 승격 획의 어느 끝이 «다른 획과
// 만나는가»를 3D에서 가른다. 기하는 여기서도 밖에서도 안 움직인다 — a·b는 불변이고
// 이 판정은 그리는 쪽(render2d)이 꼬리를 몇 px 그릴지에만 쓰인다.
//
// **만나는 끝만 넘긴다** — 제도 관행이 그렇다(넘김은 모서리·교차에서 생긴다. 자유 끝은
// 선이 거기서 끝나도록 그은 것이므로 지나치지 않는다 — 지시 문면의 «후자»).
// 대기 획은 안 넘긴다: 만남의 정본이 3D(승격 좌표)인데 대기 획에는 그것이 없다 —
// 화면 좌표 일치는 시점에 따라 생겼다 사라지는 «가짜 만남»을 만든다(#64의 형태).

import type { LiftResult } from './lift'
import type { V3 } from './vec'

export interface EndMeets { a: boolean; b: boolean }

const d2 = (p: V3, q: V3): number =>
  (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2

/** 점–세그먼트 거리² */
function distSeg2(p: V3, a: V3, b: V3): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
  if (len2 <= 0) return d2(p, a)
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2))
  return d2(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t })
}

// 캐시 — lift는 recompute마다 새 객체다(state.ts). 궤도 중 매 프레임 다시 안 센다.
const cache = new WeakMap<LiftResult, Map<number, EndMeets>>()

/** 승격 획별 «만나는 끝» — 끝점이 다른 승격 획의 끝점과 일치하거나 몸통 위에 있으면.
 *  허용 오차는 장면 크기 대비 1e-6 — 오스냅으로 붙은 점은 사실상 정확히 일치한다
 *  (허용을 넓혀 «가까운 끝»까지 넘기면 안 만난 선이 만난 것처럼 읽힌다 — #63의 규율:
 *  배정에는 허용이 필요하지만 이 판정은 «이미 정해진 좌표»의 일치 확인이다). */
export function overshootEnds(lift: LiftResult): Map<number, EndMeets> {
  const hit = cache.get(lift)
  if (hit) return hit
  const segs = [...lift.lifted.entries()]
  let size2 = 0
  for (const [, s] of segs) size2 = Math.max(size2, d2(s.a3, s.b3))
  const tol2 = Math.max(size2, 1) * 1e-12   // (1e-6)² 상대
  const out = new Map<number, EndMeets>()
  for (const [id, s] of segs) {
    const m: EndMeets = { a: false, b: false }
    for (const [oid, o] of segs) {
      if (oid === id) continue
      if (!m.a && distSeg2(s.a3, o.a3, o.b3) < tol2) m.a = true
      if (!m.b && distSeg2(s.b3, o.a3, o.b3) < tol2) m.b = true
      if (m.a && m.b) break
    }
    out.set(id, m)
  }
  cache.set(lift, out)
  return out
}
