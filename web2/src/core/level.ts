// 정렬된 구도 — **시선이 수평이고 롤이 0인 상태**. 그러면 수직선이 화면 수직이고
// 지평선이 화면 수평이다. 1점이냐 2점이냐는 좌우 각도(요)가 정한다.
//
// **돌려보는 것은 이 도구에서 부가기능이다.** 투시도를 그리는 목적 자체가 전지적 시점
// 모델링에 대한 반감이고, 화면이 돌아가기 시작하면 모델링 툴과 다를 바가 없다.
// 그래서 기울어진 상태는 **머무는 상태가 아니라 지나가는 상태**로 둔다 —
// 손을 떼고 잠깐 있으면 정렬로 접힌다(`autolevel.ts`가 그 시점을 잰다).
//
// 접을 때 **요와 눈높이는 그대로 두고 피치·롤만 0으로 접는다.** 남는 자유는
// 수평거리 하나이고, 그것만 조정한다(아래 `levelPose`).

import type { CamPose } from './types'
import type { Analysis } from './camera'
import { type V3, v3, add3, mul3, norm3, cross3, quatFromBasis, quatRotate, quatSlerp } from './vec'

/** 정렬 판정의 여유. 궤도 한 픽셀이 0.005 rad(≈0.29°)이므로 그보다 훨씬 작다 —
 *  「한 픽셀 돌렸는데 정렬로 친다」가 없다. 부동소수 누적(쿼터니언 곱)은 이보다 작다. */
export const LEVEL_EPS = 1e-9

const FWD = v3(0, 0, -1)
const UP = v3(0, 1, 0)
const RIGHT = v3(1, 0, 0)
const WORLD_UP = v3(0, 1, 0)

/** 시선의 세계 방향 */
export const forwardOf = (pose: CamPose): V3 => quatRotate(pose.q, FWD)

/** **정렬됐는가** — 시선이 수평(피치 0)이고 롤이 0이다.
 *  오일러각으로 풀지 않는다: 피치 0 ⟺ 시선의 y가 0, 롤 0 ⟺ 화면 오른쪽의 y가 0.
 *  짐벌 잠금이 없고 뷰 큐브 시험(`view.test.ts`)이 이미 같은 형태로 재고 있다. */
export function isLevel(pose: CamPose): boolean {
  const f = quatRotate(pose.q, FWD)
  const r = quatRotate(pose.q, RIGHT)
  const u = quatRotate(pose.q, UP)
  return Math.abs(f.y) <= LEVEL_EPS && Math.abs(r.y) <= LEVEL_EPS && u.y > 0
}

/** **좌우 각도(요) 방향** — 접었을 때 바라볼 수평 방향. 단위이고 y = 0이다.
 *
 *  보통은 시선의 수평 성분이다. **탑뷰·저면에서는 그것이 0이라 요가 정의되지 않는다** —
 *  시선이 수직축과 나란하면 좌우 기준이 없다. 그때는 **화면 위 방향**이 답한다:
 *  고개를 숙여 발밑을 볼 때 화면 위쪽에 있는 세계 방향이 곧 고개를 들면 향할 방향이다
 *  (순수 피치 −90°에서 화면 위 = (0,0,−1) = 원래 시선. 위를 볼 때는 부호가 반대다).
 *
 *  ⚠ **마지막 요를 따로 기억하지 않는다.** 포즈가 이미 그것을 들고 있고, 상태를 하나
 *  더 두면 그 둘이 갈린다(PITFALLS #54). 그리고 이 답은 극한에서 시선 성분과 일치하므로
 *  경계에서 튀지 않는다 — `level.test.ts`가 89.9°와 90°를 붙여 확인한다. */
export function yawDir(pose: CamPose): V3 {
  const f = quatRotate(pose.q, FWD)
  const h = v3(f.x, 0, f.z)
  if (Math.hypot(h.x, h.z) > 1e-6) return norm3(h)
  const u = quatRotate(pose.q, UP)
  const s = f.y > 0 ? -1 : 1              // 위를 보고 있으면 화면 위 = 뒤쪽이다
  const g = v3(u.x * s, 0, u.z * s)
  if (Math.hypot(g.x, g.z) > 1e-12) return norm3(g)
  return v3(0, 0, -1)                     // 도달 불가(시선과 화면위가 둘 다 수직일 수 없다)
}

/** **접기의 목표 포즈** — 피치·롤을 0으로 접는다.
 *
 *  유지: **요**(보던 방향) · **눈높이**(부감으로 올라갔으면 그 높이에서 수평으로 본다).
 *  조정: **수평거리 하나뿐이다** — 위 둘을 고정하면 남는 자유가 그것뿐이다.
 *
 *  왜 조정하나: 눈높이를 그대로 두고 수평으로 펴면 시선이 대상 위를 지나가므로
 *  **보던 것이 화면 밖으로 나간다**. 그러면 「그리려고 돌아온다」가 성립하지 않는다.
 *  기준은 **궤도 중심(pivot)이 화면 안에 남는 것** 하나다(지시의 문면 그대로).
 *
 *  ⚠ 초판은 여기에 「무게중심 주변으로 ¼이 남아야 한다」며 **H/4**를 썼는데,
 *  그것은 내가 지어낸 여유였고 **비용이 두 배**였다. 재 보니(narrow f=387 · wide f=3286,
 *  같은 궤도 −160,−120):
 *
 *      H/4 기준   narrow 배수 1.000 · wide 배수 11.242
 *      H/2 기준   narrow 배수 1.000 · wide 배수  5.621
 *
 *  물러나는 거리는 **f에 정비례**한다(rMin = f·|Δh| ÷ (H/2)). 건축 투시도의 정상 구도는
 *  f/W가 2~3이라 f가 크고, 그래서 **완만한 기울기에서도 크게 물러난다.** 그것은 규칙의
 *  결함이 아니라 «눈높이를 유지한 채 수평으로 본다»의 기하다 — 눈 아래 30 m에 있는
 *  것을 좁은 화각으로 수평으로 보려면 그만큼 멀어야 한다. 여유를 지어내 그 비용을
 *  두 배로 만들 이유가 없어 **지시의 문면(화면 안)으로 되돌렸다.**
 *  되돌릴 조건: 접은 뒤 대상이 화면 가장자리에 걸려 그리기 불편하다는 관측이 나오면
 *  그때 여유를 다시 넣는다(그 순간 물러나는 거리가 두 배가 된다는 것을 알고 넣는다).
 *
 *  ⚠ **물러나기만 하고 다가가지 않는다**(`max(1, …)`). 이 조정의 목적은 화면 밖으로
 *  나가는 것을 막는 것 하나이고, 가까이 당기면 사람이 안 시킨 줌인이 된다(A-3).
 *  실제로 완만한 기울기(살짝 돌려보고 돌아오는 흔한 경우)에서는 배수가 1이라 **안 움직인다**.
 *
 *  ⚠ **방향(베어링)을 안 바꾼다** — 수평 오프셋을 «늘리기»만 하므로 pivot의 화면 가로
 *  위치가 그대로다. pivot을 화면 한가운데로 끌어오면 안 시킨 옆걸음이 된다.
 *  수평 성분이 아예 없는 탑뷰에서만 요 방향 뒤로 놓는다(늘릴 오프셋이 없다). */
export function levelPose(an: Analysis, pose: CamPose, pivot: V3): CamPose {
  const b = yawDir(pose)
  const back = mul3(b, -1)
  const right = norm3(cross3(WORLD_UP, back))
  const q = quatFromBasis(right, WORLD_UP, back)

  if (an.f === null) return { p: { ...pose.p }, q }   // 카메라가 아직 없다 — 자세만 편다

  const dh = pose.p.y - pivot.y                        // 대상이 눈 아래면 양수
  // 필요한 **시선 방향** 거리. 사영의 분모는 반지름이 아니라 시선 성분이다 —
  // 반지름으로 재던 초판은 pivot이 옆으로 비껴 있을 때 화면 밖으로 새어 나갔다
  // (H/4로 재던 그때의 실측: 227.5 px > 200).
  const need = an.f * Math.abs(dh) / (an.H / 2)
  const ox = pose.p.x - pivot.x, oz = pose.p.z - pivot.z
  const along = -(ox * b.x + oz * b.z)                 // 지금 시선 방향 수평거리
  let d: V3
  if (along > 1e-9) {
    const k = Math.max(1, need / along)                // **늘리기만** 한다
    d = v3(ox * k, 0, oz * k)
  } else {
    // 탑뷰·저면(늘릴 오프셋이 없다)이거나 pivot이 뒤에 있다(팬으로 지나쳤다) —
    // 늘려서 될 일이 아니므로 요 방향 뒤로 놓는다. 지금 거리보다 가까워지지는 않는다.
    d = mul3(back, Math.max(need, Math.hypot(ox, dh, oz)))
  }
  return { p: add3(v3(pivot.x, pose.p.y, pivot.z), d), q }
}

/** 접히는 중의 중간 포즈 — 자세는 최단호, 위치는 직선. t는 0…1. */
export function lerpPose(a: CamPose, b: CamPose, t: number): CamPose {
  return {
    p: add3(a.p, mul3(v3(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z), t)),
    q: quatSlerp(a.q, b.q, t),
  }
}
