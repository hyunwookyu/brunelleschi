// 정렬된 구도 — **시선이 수평이고 롤이 0인 상태**. 그러면 수직선이 화면 수직이고
// 지평선이 화면 수평이다. 1점이냐 2점이냐는 좌우 각도(요)가 정한다.
//
// ⚠⚠ **web2-08 지시 3이 「무조건 접기」를 뒤집었다.** 종전 규칙(web2-04)은 기울어진
// 상태를 «지나가는 상태»로 두고 어떤 자세든 손을 떼면 정렬로 접었다 — 사람이 그것을
// 「내려다보거나 올려다보기도 해야 하는데 무조건 2점 투시로 찾아간다」로 뒤집었다.
// 지금 규칙: **정렬은 임계(`snapAngle` = min(atan(f/6W), 8.25°)) 안으로 의도적으로
// 가져왔을 때만 걸린다**(`foldTarget`).
// 임계 밖 자세는 머무는 상태다. 요도 같은 형태다 — 축과 임계 안이면 1점으로 붙는다.
// 접는 «시점»은 여전히 `autolevel.ts`가 잰다.
//
// 접을 때 **궤도 전 카메라 상태로 통째로 돌아가고 요만 새 값을 쓴다**(web2-05).
//
// ⚠⚠ **web2-04는 「눈높이를 유지한다」였고 그것이 틀렸다**(사람이 지시로 뒤집었다):
// **궤도로 바뀐 높이는 사용자가 정한 눈높이가 아니라 돌려보느라 생긴 부수 효과**다.
// 실측이 그것을 그대로 보였다 — 궤도 전 눈높이 1.600 · 수평거리 7.111이던 것이
// 궤도 후 6.590이 되고 **접은 뒤에도 6.590으로 남았으며** 거리는 7.191 → 9.926으로 늘었다.
// 화면에서는 「지평선이 위로 심하게 올라간다」로 보인다(그림이 지평선 아래로 내려간다).
//
// 그래서 접기는 **정렬 상태를 떠나기 직전의 포즈(anchor)를 세계 수직축 둘레로
// 요 차이만큼 돌린 것**이다 — 높이·피치·롤·베어링이 그대로이고 요만 새 값이다.
// **전환이 안 느껴진다**: 돌려보기 전과 후가 좌우 각도만 다르다.
//
// ⚠ web2-06 지시 5로 **pivot까지의 거리 하나가 더 «새 값»이 됐다** — 궤도가 거리를
// 구성상 보존하므로(회전이다) 거리 변화는 **사람이 줌으로 정한 것**이기 때문이다.
// 줌이 없었으면 배율이 정확히 1이라 위 문장이 그대로 성립한다(`levelPose`의 주석).
//
// ⛔ **그 대가로 web2-04의 «물러나기» 기전이 통째로 죽었다**(#57) — 「대상이 화면에
// 남도록 수평거리를 늘린다」는 앵커가 이미 «보던 구도»이므로 필요가 없어졌다.
// 그것을 재던 게이트(배수 표·pivot 화면 안·베어링 불변·D-5 대역 팔)도 함께 처리했다.

import type { CamPose } from './types'
import { C, POSE_SNAP_RAD } from './constants'
import { type V3, v3, add3, sub3, mul3, len3, norm3, cross3, quatFromBasis, quatRotate, quatSlerp } from './vec'

/** 정렬 판정의 여유. 궤도 한 픽셀이 0.005 rad(≈0.29°)이므로 그보다 훨씬 작다 —
 *  「한 픽셀 돌렸는데 정렬로 친다」가 없다. 부동소수 누적(쿼터니언 곱)은 이보다 작다. */
export const LEVEL_EPS = 1e-9

// 시점 스냅 임계의 상한 — 정의와 근거는 `constants.ts`의 `POSE_SNAP_RAD`에 있다(임계의 자리).
export { POSE_SNAP_RAD }

/** **시점 스냅 임계(rad)** — `min(atan(f/6W), 상한)`. 두 물음의 AND다:
 *  ① 그 문서의 f로, 그 기울기의 소실점이 작도 대역(6W) 밖인가(화면에서 정렬과 구별 불가)
 *  ② 자세가 상한(기본 f의 ①값 ≈ 8.25°) 안인가(내려다보는 자세가 아닌가).
 *  근거 전문은 `constants.ts`. f를 모르면(작도 전 — 그때 포즈는 늘 작도 포즈다) 상한만 쓴다. */
export function snapAngle(f: number | null, W: number): number {
  if (f === null || !(W > 0)) return POSE_SNAP_RAD
  return Math.min(Math.atan(f / (C.VP_FAR_W * W)), POSE_SNAP_RAD)
}

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
 *  더 두면 그 둘이 갈린다(PITFALLS #54).
 *
 *  ⚠⚠ **경계에서 튀는가 — 롤이 0일 때만 안 튄다.** 실측(같은 요, 시선을 수직으로 몰면서):
 *
 *      롤  0° → δ=0.1°/0.01°/0.001° 모두 갭 **0.000000°**  (항등이다 — 아래 참고)
 *      롤  5° → 셋 모두 **5.000000°**
 *      롤 14° → 셋 모두 **14.000000°**
 *      롤 45° → 셋 모두 **45.000000°**
 *
 *  δ를 줄여도 갭이 안 준다 — **불연속이고, 갭이 정확히 롤 각이다.** 원리다:
 *  시선이 정확히 수직이면 **요와 롤이 같은 자유도가 된다**(짐벌 잠금). 그 자세에서 남은
 *  정보(화면 위·오른쪽)는 전부 롤에 실려 있으므로 «롤을 뺀 요»라는 것이 없다.
 *  화면 위를 쓰는 것은 **「돌려 놓은 화면 방향으로 접는다」는 선택**이고, 탑뷰에서 화면을
 *  돌려 봤으면 그 방향으로 서는 것이 오히려 맞다.
 *
 *  ⚠ **앱은 롤을 만들지 않는다** — 궤도는 세계 수직축과 카메라 오른쪽 축으로만 돌고
 *  (실측 궤도 뒤 `right.y = 2.776e-17`), 뷰 큐브도 롤 0을 낸다. 그래서 **도달 가능한
 *  자세에서는 갭이 0이다.** 다만 그 0은 «연속이라 0»이 아니라 **항등이라 0**이므로
 *  「롤 0 팔이 연속성을 확인한다」고 적으면 안 잰 것을 통과로 적는 것이다(#57).
 *  `level.test.ts`가 셋을 나눠 잰다: 항등 · 롤이 있으면 정확히 롤 각 · 앱이 롤을 안 만든다. */
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

/** **접기의 목표 포즈** — 앵커를 세계 수직축 둘레로 요 차이만큼 돌린 것.
 *
 *  `anchor` = **정렬 상태를 떠나기 직전의 포즈.** 궤도든 뷰 큐브든 저장 시점이든
 *  «정렬을 떠나는 순간»을 한 규칙으로 잡는다(`autolevel.ts`가 그 자리를 지킨다).
 *  그것이 곧 지시의 「궤도 시작 시 카메라 상태」다 — 궤도 중에 눈높이를 바꿀 길이 없으므로
 *  **궤도 시작 시점의 값이 곧 사용자가 정한 값**이다(지시 d).
 *
 *  **되돌리는 것**: 피치 · 롤 · 베어링 — 앵커를 통째로 쓴다.
 *  **새로 쓰는 것**: ① 좌우 각도(요) ② **pivot까지의 거리**. 둘 다 사용자가 정한 것이다.
 *  **눈높이**: 되돌리는 것이 **아니다** — `pivot.y + (anchor.y − pivot.y)·k`로 **같은 배율**을
 *  탄다(1차 리뷰어 [5]). 줌이 없으면 `k = 1`이라 그대로이고, pivot이 눈높이에 있으면
 *  줌이 있어도 그대로다. ⚠ 이것은 #60의 재발이 아니다 — **정렬 포즈에서 그냥 줌해도 같은
 *  일이 난다**(팔 있음). 궤도가 만든 값이 아니라 줌이 만든 값이다.
 *
 *  ⚠⚠ **거리가 왜 «새로 쓰는 것»인가**(web2-06 지시 5) — #60의 물음을 한 겹 더 판 답이다:
 *  **궤도는 pivot 둘레의 회전이므로 거리를 구성상 보존한다**(실측: 궤도 전 7.225 → 궤도 후
 *  7.225). 그러니 거리가 달라졌다면 그것은 **궤도의 부산물일 수 없고** 사람이 줌으로 정한
 *  값이다. 높이는 반대다 — 궤도가 그대로 바꾼다(그것이 #60이 잡은 것).
 *  고치기 전에는 접기가 그 줌을 통째로 지웠다(줌 후 3.613 → **접은 뒤 7.225**).
 *
 *  구현은 앵커의 pivot 기준 변위를 **`rC/rA`배 한 뒤** 돌리는 것이다. 줌이 없었으면
 *  `rC = rA`라 배율이 **정확히 1**이고 옛 규칙과 한 톨도 안 달라진다(팔이 그것을 잰다).
 *  ⚠ 팬은 안 지킨다 — 팬도 거리를 조금 바꾸므로 그만큼 배율에 섞이지만, «옆으로 옮긴 것»을
 *  접힌 뒤 어떻게 읽어야 하는지는 잰 것이 없다(`DEFERRED.md`).
 *
 *  구현은 **pivot을 지나는 수직축 둘레의 회전 + 반지름 배율** 하나다. 회전은 y를 안
 *  건드리고 거리를 보존하므로 «높이·베어링이 그대로»가 **구성상 보장**되고, 배율은
 *  그 셋을 같은 비로만 늘린다(방향이 안 바뀐다). 따로 맞출 값이 없다.
 *  회전각은 각도로 안 뽑는다(래핑이 없다): 두 수평 단위벡터에서 `cos = a·b`,
 *  `sin = (a×b).y` 를 바로 만들어 쓴다.
 *
 *  ⚠ 앵커가 이미 지금 요와 같으면 `cos=1 · sin=0`이라 **항등**이다 — 「이미 정렬이면
 *  아무것도 안 건드린다」가 그래서 성립한다. */
export function levelPose(anchor: CamPose, pose: CamPose, pivot: V3, yaw?: V3): CamPose {
  const bNew = yaw ?? yawDir(pose)          // 새 요 (지시 3: 축에 스냅될 때만 밖에서 든다)
  const bOld = yawDir(anchor)               // 앵커의 요(정렬이므로 곧 그 시선)
  const cos = bOld.x * bNew.x + bOld.z * bNew.z
  const sin = bOld.z * bNew.x - bOld.x * bNew.z   // (bOld × bNew).y

  // 앵커의 변위를 **지금 반경**으로 맞춘다 — 줌이 없었으면 k = 1(항등)이다
  const A = sub3(anchor.p, pivot)
  const rA = len3(A)
  const k = rA > 1e-9 ? len3(sub3(pose.p, pivot)) / rA : 1
  const dx = A.x * k, dy = A.y * k, dz = A.z * k
  const p = v3(
    pivot.x + dx * cos + dz * sin,
    pivot.y + dy,                           // 회전이 y를 안 건드린다 — 높이는 배율만 탄다
    pivot.z - dx * sin + dz * cos,
  )
  const back = mul3(bNew, -1)
  const right = norm3(cross3(WORLD_UP, back))
  // 투영은 **지금 것을 그대로 들고 간다**(web2-42) — 접기는 자세를 되돌리는 일이지
  // 「평행을 껐다 켜는」 일이 아니다. 앵커의 것이 아니라 `pose`의 것을 쓴다:
  // 정투상 뷰에서 접혀도 정투상으로 남는다(지시: 손으로 돌려도 평행이 유지된다).
  return { p, q: quatFromBasis(right, WORLD_UP, back), ...(pose.proj ? { proj: { ...pose.proj } } : {}) }
}

/** **피치가 임계 안인가** — 이 자세는 놓으면(또는 누르면) 정렬로 접힌다.
 *  임계 밖이면 머무는 자세다: 그때의 누름은 접기가 아니라 그리기다(입력·면 미리보기가
 *  같은 술어를 본다 — 판정이 두 자리로 갈리지 않게 #54). 임계는 문서의 f를 탄다(snapAngle). */
export function pitchSnaps(pose: CamPose, f: number | null, W: number): boolean {
  const fy = forwardOf(pose).y
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, fy)))) <= snapAngle(f, W)
}

/** **접기의 목표가 있는가** — 시점 스냅의 판정 하나가 여기다(web2-08 지시 3).
 *
 *  · |피치| > 임계(`snapAngle`) → **null. 기울인 채 둔다** — 머무는 상태다.
 *  · |피치| ≤ 임계 → 정렬로 접는다(앵커·요·반경 규칙은 `levelPose` 그대로).
 *    이때 요가 어느 가로축과 임계 안이면 **그 축으로 붙는다**(2점 → 1점). 후보는
 *    **그 차수의 프레임에 실제로 있는 가로축**이다 — `Analysis.axes`가 차수별로
 *    이미 가른다(1점 {vp0, H}, 2점 {vp0, vp1} — 2점에 H는 없다). ± 양방향 넷(1점 둘×2).
 *  · 이미 정렬이고 붙일 축도 없으면 null — 항등에 애니메이션을 안 건다.
 *
 *  `axes`는 문서의 세계 축 방향(`Analysis.axes`) 그대로다 — 가로축(y=0)만 보고
 *  세로축(V)은 요의 후보가 아니므로 걸러진다. 판정과 목표가 한 함수에서 나온다(#54). */
export function foldTarget(
  anchor: CamPose, pose: CamPose, pivot: V3,
  opt: { axes: V3[]; f: number | null; W: number },
): CamPose | null {
  if (!pitchSnaps(pose, opt.f, opt.W)) return null
  const b = yawDir(pose)
  // 요 후보 — 가로축의 ±. 가장 가까운 것 하나이고 임계 밖이면 없다.
  let bestAng = snapAngle(opt.f, opt.W)
  let snap: V3 | null = null
  for (const a of opt.axes) {
    if (Math.abs(a.y) > 1e-9) continue
    const h = Math.hypot(a.x, a.z)
    if (h < 1e-9) continue
    for (const s of [1, -1] as const) {
      const d = v3(a.x * s / h, 0, a.z * s / h)
      const ang = Math.acos(Math.max(-1, Math.min(1, b.x * d.x + b.z * d.z)))
      if (ang <= bestAng) { bestAng = ang; snap = d }
    }
  }
  // 이미 정렬이고 요도 (사실상) 축 위거나 축 근처가 아니면 — 할 일이 없다.
  // 항등 여유 1e-6 rad: acos는 1 근처에서 정밀도를 잃어 정확히 같은 방향도 ~1e-8 rad로
  // 나온다(√(2·ulp)). 궤도 1px(5e-3 rad)보다 세 자릿수 아래라 «한 픽셀을 항등으로
  // 읽는» 일은 없다.
  if (isLevel(pose) && (snap === null || bestAng <= 1e-6)) return null
  return levelPose(anchor, pose, pivot, snap ?? undefined)
}

/** 접히는 중의 중간 포즈 — 자세는 최단호, 위치는 직선. t는 0…1.
 *
 *  **투영도 보간한다**(web2-42 1번 — 「원근 ↔ 평행 전환은 시각적으로 크므로 튀면 어디로
 *  갔는지 잃는다」). 보간하는 것은 **평행도 w** 하나다: 기준 깊이 D는 한쪽에만 있으면
 *  그쪽 값을 그대로 쓴다(원근 쪽에서는 D가 식에 안 들어가므로 «없는 값»이지 0이 아니다).
 *  중간 w도 정당한 사영이라는 근거는 `camera.ts`의 `projDen` 주석이다. */
export function lerpPose(a: CamPose, b: CamPose, t: number): CamPose {
  const out: CamPose = {
    p: add3(a.p, mul3(v3(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z), t)),
    q: quatSlerp(a.q, b.q, t),
  }
  const wa = a.proj?.w ?? 0, wb = b.proj?.w ?? 0
  const w = wa + (wb - wa) * t
  if (w > 0) {
    const Da = a.proj?.D, Db = b.proj?.D
    const D = Da === undefined ? Db! : Db === undefined ? Da : Da + (Db - Da) * t
    out.proj = { w, D }
  }
  return out
}
