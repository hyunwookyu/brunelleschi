// 재기(web2-32 6번) — **두 점을 짚으면 길이가 나온다.** 오스냅이 걸린다.
//
// 결과가 둘이다(지시 문면):
//   ① **패널에 표시만** — 도면에 아무것도 안 남는다. **기본값이다.**
//   ② **치수선을 넣는다** — 도면에 남는다. 잰 값이다.
//
// ⚠⚠ **잰 값과 적은 값은 다른 것이다**(지시가 자료구조에서 가르라고 했다):
//   · 적은 값(`Stroke.dim`) — 사람이 정했다. 축척의 근거이고 어긋남 판정의 한쪽이다.
//   · 잰 값 — 모델에서 나왔다. 축척이 바뀌면 따라 바뀐다. **파생값이므로 숫자를
//     저장하지 않는다**(원칙 b). 치수선을 넣은 경우에도 저장하는 것은
//     **「어느 두 점을 재는가」**뿐이다.
//
// **선례는 면이다**(`types.ts`의 `Face`: 「저장하는 것은 경계의 정체이고 좌표가 아니다 —
// 정점은 이웃한 두 경계의 3D 직선 교점으로 매번 계산한다. 그래서 차수 승격으로 전부
// 다시 올라가도 면이 따라온다」). 재는 점의 «정체»도 같은 급으로 적는다: **어느 획의
// 어디인가**(획 id + 그 선분 위의 매개변수 t). 좌표를 적으면 차수가 승격되거나 축척이
// 바뀌는 순간 그 점이 도면에서 떨어져 나온다.

import type { LiftResult } from './lift'
import { lenMm } from './dim'
import { type V3, sub3, add3, mul3, dot3, len3, dist3 } from './vec'

/** 재는 점 하나의 **정체** — 좌표가 아니다. `s` = 획 id, `t` = 그 3D 선분 위의 매개변수
 *  (0 = a3 · 1 = b3 · 0.5 = 중점). 끝점·중점·교차점·근처점 오스냅이 전부 이 형태로 적힌다 —
 *  어느 오스냅이든 답은 «어떤 선분 위의 한 점»이기 때문이다(소실점만 아니고, 그것은
 *  무한원이라 3D 점이 아니라서 애초에 후보가 아니다). */
export interface MeasurePoint { s: number; t: number }

/** 도면에 남긴 재기 하나(선택 ②). **숫자가 없다** — 값은 매번 계산이다. */
export interface Measure {
  id: number
  a: MeasurePoint
  b: MeasurePoint
}

/** 정체 → 지금의 3D 좌표. 그 획이 아직(또는 이제) 3D가 아니면 null —
 *  안 풀린 것은 **실패가 아니라 대기**다(A-3 · 개정 2 §9.1): 도면에서 안 지운다. */
export function measurePoint3(lift: LiftResult, mp: MeasurePoint): V3 | null {
  const seg = lift.lifted.get(mp.s)
  if (!seg) return null
  return add3(seg.a3, mul3(sub3(seg.b3, seg.a3), mp.t))
}

/** 잰 값 — **세계 단위** 길이. 두 끝 중 하나라도 안 풀리면 null. */
export function measureUnits(lift: LiftResult, m: Pick<Measure, 'a' | 'b'>): number | null {
  const p = measurePoint3(lift, m.a)
  const q = measurePoint3(lift, m.b)
  if (!p || !q) return null
  return len3(sub3(q, p))
}

/** 잰 값 — **mm**. 축척이 미정이면 null이다(없는 축척을 있는 척하지 않는다 — 그때
 *  화면은 `formatRatio`로 비만 낸다). 길이 계산의 출처는 `dim.lenMm` 하나다(#54). */
export function measureMm(lift: LiftResult, m: Pick<Measure, 'a' | 'b'>): number | null {
  const p = measurePoint3(lift, m.a)
  const q = measurePoint3(lift, m.b)
  if (!p || !q) return null
  return lenMm(p, q, lift.mmPerUnit)
}

/** 3D 점 → **정체**(어느 획의 어디인가). 오스냅이 준 `p3`를 그대로 받는다.
 *  가장 가까운 승격 선분을 고르고 그 위의 매개변수를 낸다 — 선분 밖으로는 안 나간다
 *  (클램프: 무한 연장에 정체를 매기면 «조용히 틀린» 점이 된다 — web2-13 1-d의 형태).
 *  어떤 선분에도 안 붙으면 null: 그때는 **도면에 남길 수 없다**(표시만 할 수는 있다).
 *  ⚠ `tol`은 **세계 단위**다 — 호출부가 기하 크기에서 낸다(절대값을 여기 안 박는다). */
export function identifyPoint(lift: LiftResult, p3: V3, tol: number): MeasurePoint | null {
  let best: MeasurePoint | null = null
  let bestD = tol
  for (const [id, seg] of lift.lifted) {
    const d = sub3(seg.b3, seg.a3)
    const L2 = dot3(d, d)
    if (L2 < 1e-18) continue
    const t = Math.max(0, Math.min(1, dot3(sub3(p3, seg.a3), d) / L2))
    const dist = dist3(add3(seg.a3, mul3(d, t)), p3)
    if (dist <= bestD) { bestD = dist; best = { s: id, t } }
  }
  return best
}
