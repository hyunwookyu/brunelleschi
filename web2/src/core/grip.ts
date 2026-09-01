// 잡기·다루기(web2-44) — 순수 계산. 상태는 `app/state.ts`의 `app.grip` 하나다(#54).
//
// 문법(지시 「지킬 것」): 명령 목록 ⛔ · 새 제스처 ⛔ — 39의 꾹 누름이 잡고, 잡은 것
// 위에서 끄는 것이 조작이고, 값은 39의 손글씨 기제가 고친다.
//
// 옮김은 **축으로 제한한다**(지시): 획은 3D를 갖는데 끄는 손은 2차원이라, 어느 방향으로
// 옮기는지는 축이 정해야 한다. 제도에서 벽을 미는 것도 축 방향이다. 후보 축은 카메라가
// 이미 들고 있는 `an.axes`(vp0·vp1·H·V) — 새 방향을 안 짓는다(#54).
//
// 좌표의 규약: 문서는 2D가 정본이고 3D는 굳힘(`own3`)이다. 옮김·돌림·맺음은
// ① 3D를 옮기고 ② 그 획의 «자기 시점»(s.view ?? DRAW_POSE)으로 2D를 다시 사영한다 —
// 그래야 잉크 심판(own3d.ts §7: 사영 == pts2d)이 왕복에서 그대로 선다.

import type { Stroke, CamPose } from './types'
import { DRAW_POSE, project, rayThrough, type Analysis, type AxisId } from './camera'
import { closestOnLineToRay, type LiftResult } from './lift'
import {
  type Pt, type V3, type Quat, add3, sub3, mul3, dot3, cross3, norm3, len3, dist2, v3, pt,
  quatFromBasis, quatRotate,
} from './vec'

// ── 잡기 판정 ────────────────────────────────────────────────────────────────

/** 잡는 자리 — **점과 선을 갈라 센다**(#43): 끝점(점)은 돌리기의 입구, 몸통(선)은
 *  옮기기의 입구다. 두 물음의 판정자가 다르므로 결과도 갈라 낸다. */
export interface GripHit {
  id: number
  /** 'end' = 끝점 대역 안(오스냅 반경) — 돌리기 진입. 'body' = 몸통. */
  where: 'end' | 'body'
  /** where가 'end'일 때 — 어느 끝인가(0 = a, 1 = b) */
  end?: 0 | 1
}

/** 그 자리에서 잡히는 **내용 3D 획** — 없으면 null. 대역은 치수 고르기(`pickTargetAt`)와
 *  같은 자(오스냅 반경 × 2)를 호출자가 넘긴다(#54 — 새 숫자 ⛔).
 *  잠긴 획(`s.lock`)은 **안 잡힌다**(지시 「잠금」) — 후보에서 빠진다.
 *  끝점 대역은 오스냅 반경(endR) — 「짚는다」의 기존 자다. */
export function gripHitAt(
  lift: LiftResult, pose: CamPose, p: Pt, bodyR: number, endR: number,
): GripHit | null {
  let best: GripHit | null = null
  let bestD = bodyR
  for (const [id, seg] of lift.lifted) {
    const s = lift.strokes.get(id)
    if (!s || s.lock === 1) continue
    if (lift.an.roles.get(id) !== 'content') continue   // 표식·비내용은 못 잡는다
    const a = project(lift.an, pose, seg.a3)
    const b = project(lift.an, pose, seg.b3)
    if (!a || !b) continue
    const d = distToSeg(p, a, b)
    if (d < bestD) {
      // 끝점 대역이 먼저다(#43 — 점이 선을 이긴다: 오스냅의 순서 그대로)
      const da = dist2(p, a), db = dist2(p, b)
      if (da <= endR || db <= endR) best = { id, where: 'end', end: da <= db ? 0 : 1 }
      else best = { id, where: 'body' }
      bestD = d
    }
  }
  return best
}

/** 잠긴 획이 그 자리에 있는가 — 잡기 실패의 사유를 말하려고 따로 묻는다(조용히 안 잡히면
 *  「고장」으로 읽힌다). 판정식은 gripHitAt과 같고 잠긴 것만 본다. */
export function lockedHitAt(lift: LiftResult, pose: CamPose, p: Pt, bodyR: number): number | null {
  let best: number | null = null
  let bestD = bodyR
  for (const [id, seg] of lift.lifted) {
    const s = lift.strokes.get(id)
    if (!s || s.lock !== 1) continue
    const a = project(lift.an, pose, seg.a3)
    const b = project(lift.an, pose, seg.b3)
    if (!a || !b) continue
    const d = distToSeg(p, a, b)
    if (d < bestD) { best = id; bestD = d }
  }
  return best
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** **이어진 것**(지시 「꾹 누름을 한 번 더」) — 3D 끝점이 서로 닿아 있는 획의 연결 성분.
 *  «닿음»은 사슬 리프팅이 만든 **수치 동일**(matchPoint가 같은 V3를 준다)과 T자 접합
 *  (defineByTouch — 끝점이 상대 선분 위)뿐이므로, 허용은 기하 크기의 1e-6 — 공간 여유가
 *  아니라 fp 왕복 대역이다(own3d.ts OWN3_TOL_PX와 같은 성격).
 *  잠긴 획은 성분에 **안 들어온다**(잡기의 연장이므로 잡기 규칙 그대로). */
export function connectedIds(lift: LiftResult, seeds: number[], size3: number): number[] {
  const tol = Math.max(1e-9, 1e-6 * size3)
  const segOf = new Map<number, { a3: V3; b3: V3 }>()
  for (const [id, seg] of lift.lifted) {
    const s = lift.strokes.get(id)
    if (!s || s.lock === 1) continue
    if (lift.an.roles.get(id) !== 'content') continue
    segOf.set(id, seg)
  }
  const touching = (x: { a3: V3; b3: V3 }, y: { a3: V3; b3: V3 }): boolean => {
    for (const p of [x.a3, x.b3]) if (distToSeg3(p, y.a3, y.b3) <= tol) return true
    for (const p of [y.a3, y.b3]) if (distToSeg3(p, x.a3, x.b3) <= tol) return true
    return false
  }
  const out = new Set<number>(seeds.filter(id => segOf.has(id)))
  let grew = true
  while (grew) {
    grew = false
    for (const [id, seg] of segOf) {
      if (out.has(id)) continue
      for (const sid of out) {
        const ss = segOf.get(sid)
        if (ss && touching(seg, ss)) { out.add(id); grew = true; break }
      }
    }
  }
  return [...out]
}

function distToSeg3(p: V3, a: V3, b: V3): number {
  const d = sub3(b, a)
  const L2 = dot3(d, d)
  if (L2 < 1e-18) return len3(sub3(p, a))
  const t = Math.max(0, Math.min(1, dot3(sub3(p, a), d) / L2))
  return len3(sub3(p, add3(a, mul3(d, t))))
}

// ── 옮기기 — 축 제한 풀이 ────────────────────────────────────────────────────

export interface MoveSolve {
  axis: AxisId
  dir: V3
  /** 축 방향 이동량(세계 단위 · 부호 있음) */
  t: number
  /** 화면 잔차 px — 커서와 «놓이는 자리의 사영» 사이(축 제한이 삼킨 몫) */
  residualPx: number
}

/** 끌기 → 축 제한 이동. `anchor3`(잡은 3D 점)가 커서를 따라가되 **축 위에서만** 움직인다.
 *  각 후보 축에 대해: 커서 광선과 (anchor3 + dir·t) 직선의 최근접점 → t.
 *  화면 잔차(사영 ↔ 커서)가 가장 작은 축이 이긴다 — 끄는 방향이 곧 축을 고른다(지시:
 *  어느 평면 위에서 옮기는지가 «정해져야» 한다 — 손이 정한다).
 *  ⚠ 수직축(V)도 후보다 — 창을 위로 미는 것도 제도다. */
export function solveMove(
  an: Analysis, pose: CamPose, anchor3: V3, cur: Pt,
): MoveSolve | null {
  const ray = rayThrough(an, pose, cur)
  if (!ray) return null
  let best: MoveSolve | null = null
  for (const ax of an.axes) {
    const dl = len3(ax.dir)
    if (dl < 1e-9) continue
    const dir = mul3(ax.dir, 1 / dl)
    const P = closestOnLineToRay(anchor3, dir, ray)
    if (!P) continue
    const pr = project(an, pose, P)
    if (!pr) continue
    const residualPx = dist2(pr, cur)
    if (!best || residualPx < best.residualPx) {
      best = { axis: ax.id, dir, t: dot3(sub3(P, anchor3), dir), residualPx }
    }
  }
  return best
}

/** **고정된 축**을 따라 끈다 — 첫 판정이 축을 잠근 뒤의 매 이동. 커서 광선과
 *  (anchor3 + dir·t) 직선의 최근접점에서 t를 푼다. */
export function solveAlong(
  an: Analysis, pose: CamPose, anchor3: V3, dir: V3, cur: Pt,
): { t: number; residualPx: number } | null {
  const ray = rayThrough(an, pose, cur)
  if (!ray) return null
  const P = closestOnLineToRay(anchor3, dir, ray)
  if (!P) return null
  const pr = project(an, pose, P)
  if (!pr) return null
  return { t: dot3(sub3(P, anchor3), dir), residualPx: dist2(pr, cur) }
}

// ── 돌리기 — 수직축(세계 Y) 둘레 · 평면 회전 ─────────────────────────────────
// 제도의 「돌린다」는 평면(도) 위의 회전이다 — 벽의 방향을 트는 그것. 회전축은 수직축
// 하나다(새 자유도 ⛔ — 다른 축 둘레 회전은 이 라운드 범위 밖. NOTES에 근거).

/** 커서 → pivot 높이의 수평면 위 점 — 회전각의 자. 광선이 그 면과 안 만나면 null. */
export function planePointAt(an: Analysis, pose: CamPose, pivot: V3, cur: Pt): V3 | null {
  const r = rayThrough(an, pose, cur)
  if (!r || Math.abs(r.d.y) < 1e-9) return null
  const t = (pivot.y - r.o.y) / r.d.y
  if (t <= 0) return null
  return add3(r.o, mul3(r.d, t))
}

/** pivot 둘레 수평각(라디안) — planePointAt의 점에서. */
export const yawOf = (pivot: V3, p: V3): number => Math.atan2(p.z - pivot.z, p.x - pivot.x)

/** 세계 Y축 둘레 회전 */
export function rotY(p: V3, pivot: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang)
  const x = p.x - pivot.x, z = p.z - pivot.z
  return v3(pivot.x + x * c - z * s, p.y, pivot.z + x * s + z * c)
}

// ── 맺기(R=0) — 두 3D 직선을 만나도록 **연장만** 한다 ────────────────────────

export type JoinReject = 'parallel' | 'skew'

export interface JoinSolve {
  /** 만나는 점(두 직선 최근접점의 가운데) */
  P: V3
  /** 두 직선 사이 간격(세계 단위) — 같은 평면 판정의 값 */
  gap: number
  /** gap ÷ size3 — 임계와 견주는 상대값 */
  rel: number
}

/** 두 직선의 최근접 짝 → 맺는 점. 평행이면 못 맺는다.
 *  「같은 평면인가」의 임계는 **면 평면성과 같은 자**(C.PLANAR_RATIO — #54: 같은 물음,
 *  같은 자)를 호출자가 rel과 견준다 — 여기는 값만 낸다. */
export function solveJoin(
  A: { a3: V3; b3: V3 }, B: { a3: V3; b3: V3 },
): JoinSolve | { reject: JoinReject } {
  const u = sub3(A.b3, A.a3), w = sub3(B.b3, B.a3)
  const lu = len3(u), lw = len3(w)
  if (lu < 1e-12 || lw < 1e-12) return { reject: 'parallel' }
  const un = mul3(u, 1 / lu), wn = mul3(w, 1 / lw)
  const n = cross3(un, wn)
  const nl = len3(n)
  if (nl < 1e-9) return { reject: 'parallel' }
  const d0 = sub3(B.a3, A.a3)
  const bU = dot3(un, wn)
  const dU = dot3(un, d0), dW = dot3(wn, d0)
  const den = 1 - bU * bU
  const tA = (dU - bU * dW) / den
  const tB = (bU * dU - dW) / den
  const pA = add3(A.a3, mul3(un, tA))
  const pB = add3(B.a3, mul3(wn, tB))
  const gap = len3(sub3(pA, pB))
  return { P: mul3(add3(pA, pB), 0.5), gap, rel: NaN }   // rel은 호출자가 size3로 채운다
}

/** 선분을 P까지 **연장만** 한다 — P의 발(직선 위 사영)이 선분 밖이면 가까운 끝을 그리로
 *  옮기고, 안이면 **아무것도 안 바꾼다**(자르기 ⛔ — 삐져나오기는 일부러 남긴다). */
export function extendTo(seg: { a3: V3; b3: V3 }, P: V3): { a3: V3; b3: V3; changed: 0 | 1 | null } {
  const d = sub3(seg.b3, seg.a3)
  const L2 = dot3(d, d)
  if (L2 < 1e-18) return { a3: seg.a3, b3: seg.b3, changed: null }
  const t = dot3(sub3(P, seg.a3), d) / L2
  const foot = add3(seg.a3, mul3(d, t))
  if (t < 0) return { a3: foot, b3: seg.b3, changed: 0 }
  if (t > 1) return { a3: seg.a3, b3: foot, changed: 1 }
  return { a3: seg.a3, b3: seg.b3, changed: null }
}

// ── 면 정면 뷰 — 「면이 정한 뷰」(42의 일곱 뷰 옆) ───────────────────────────

/** 면 법선 정면의 자세 — 눈이 지금 있는 쪽에서 면을 정면으로 본다. 거리는 지금 거리
 *  그대로(42의 큐브 면과 같은 규약 — poseForElem이 dist를 유지한다).
 *  up: 세로 면(법선이 수평)이면 세계 Y(제도의 입면 — 위가 위다) · 수평 면(슬라브)이면
 *  법선과 수직인 화면 위쪽 후보(poseForElem의 upHint 갈래와 같은 형태). */
export function faceFrontPose(
  center: V3, normal: V3, pose: CamPose, dist: number,
): CamPose {
  const n0 = norm3(normal)
  const eye = sub3(pose.p, center)
  const back = dot3(eye, n0) >= 0 ? n0 : mul3(n0, -1)   // 지금 보는 쪽의 정면
  let upHint = v3(0, 1, 0)
  if (Math.abs(dot3(back, upHint)) > 0.99) {
    // 슬라브 — 위 힌트를 지금 카메라의 위쪽에서 가져온다(화면이 덜 튄다)
    const camUp = quatRotate(pose.q, v3(0, 1, 0))
    upHint = len3(cross3(back, camUp)) > 1e-6 ? camUp : v3(0, 0, 1)
  }
  let right = cross3(upHint, back)
  if (len3(right) < 1e-9) right = v3(1, 0, 0)
  right = norm3(right)
  const up = norm3(cross3(back, right))
  const q: Quat = quatFromBasis(right, up, back)
  return { p: add3(center, mul3(back, Math.max(1e-6, dist))), q }
}

// ── 2D 유사변환 — raw(손 잉크)를 새 끝점에 맞춰 옮긴다 ───────────────────────

/** old(a,b) → new(a,b)를 잇는 유사변환(이동·회전·배율)으로 점렬을 옮긴다.
 *  raw는 질감·표현의 원본이라 **모양을 보존**해야 한다 — 점별 재사영은 원근 아래서
 *  손떨림의 모양을 뒤틀고, 유사변환은 «같은 손 획을 그 자리에 다시 놓은 것»이 된다. */
export function mapRawSimilarity(raw: Pt[], oa: Pt, ob: Pt, na: Pt, nb: Pt): Pt[] {
  const od = { x: ob.x - oa.x, y: ob.y - oa.y }
  const nd = { x: nb.x - na.x, y: nb.y - na.y }
  const oL2 = od.x * od.x + od.y * od.y
  if (oL2 < 1e-18) {
    const dx = na.x - oa.x, dy = na.y - oa.y
    return raw.map(p => pt(p.x + dx, p.y + dy))
  }
  // 복소수 나눗셈 (nd / od) = 회전+배율
  const kr = (nd.x * od.x + nd.y * od.y) / oL2
  const ki = (nd.y * od.x - nd.x * od.y) / oL2
  return raw.map(p => {
    const vx = p.x - oa.x, vy = p.y - oa.y
    return pt(na.x + kr * vx - ki * vy, na.y + ki * vx + kr * vy)
  })
}
