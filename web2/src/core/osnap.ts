// 오스냅 — Rhino Osnap 관행을 그대로 따른다(새로 설계하지 않는다).
// 종류: 소실점 > 정점 > 끝점 > 중점 > 교차점 > 수선 발 > 연장선 > 근처점 (정확한 것이 앞선다).
// 종류별 켜고 끄기, 반경 조절. 반경은 화면 px(포인터 정밀도의 문제라 선례가 절대 px).
//
// 교차점은 3D에서 실제로 만나는 것만 쓴다 — 화면에서 가로지르는 것은 대개 가림이다.
// 대기 획(2D)은 끝점·중점만 후보다 — 2D 교차는 가림과 구별할 수 없다.

import type { CamPose } from './types'
import { C } from './constants'
import { project, rayThrough, vpMarks } from './camera'
import type { LiftResult } from './lift'
import {
  type Pt, type V3, pt, add3, sub3, mul3, dot3, dist2, dist3, len3,
} from './vec'

export type OsnapKind = 'vp' | 'vertex' | 'end' | 'mid' | 'int' | 'perp' | 'ext' | 'near'
// 소실점이 맨 앞이다 — 작도가 정한 **정확한 점**이고, 그 자리에 다른 후보가 겹치는 일은
// 드물다(지평선 위). 나머지 순서는 Rhino 관행 그대로.
export const OSNAP_ORDER: OsnapKind[] = ['vp', 'vertex', 'end', 'mid', 'int', 'perp', 'ext', 'near']

export interface OsnapSettings {
  radius: number
  kinds: Record<OsnapKind, boolean>
}

export const defaultOsnap = (): OsnapSettings => ({
  radius: C.OSNAP_RADIUS_PX,
  kinds: { vp: true, vertex: true, end: true, mid: true, int: true, perp: true, ext: true, near: true },
})

export interface OsnapHit {
  kind: OsnapKind
  p: Pt
  /** 3D가 있는 후보면 그 좌표 — 대기 획 후보는 null */
  p3: V3 | null
}

/** 3D 선분 위 최근접점 (páram 클램프) */
function closestOnSeg3(p: V3, a: V3, b: V3): V3 {
  const ab = sub3(b, a)
  const L2 = dot3(ab, ab)
  if (L2 < 1e-18) return a
  const t = Math.max(0, Math.min(1, dot3(sub3(p, a), ab) / L2))
  return add3(a, mul3(ab, t))
}

/** 두 3D 선분의 최근접 쌍 */
function segSegClosest3(a1: V3, b1: V3, a2: V3, b2: V3): { p1: V3; p2: V3; d: number } {
  const d1 = sub3(b1, a1), d2 = sub3(b2, a2), r = sub3(a1, a2)
  const A = dot3(d1, d1), E = dot3(d2, d2), F = dot3(d2, r)
  let s = 0, t = 0
  if (A > 1e-18 && E > 1e-18) {
    const B = dot3(d1, d2), Cc = dot3(d1, r)
    const denom = A * E - B * B
    s = denom > 1e-18 ? Math.max(0, Math.min(1, (B * F - Cc * E) / denom)) : 0
    t = Math.max(0, Math.min(1, (B * s + F) / E))
    s = Math.max(0, Math.min(1, (B * t - Cc) / A))
  }
  const p1 = add3(a1, mul3(d1, s))
  const p2 = add3(a2, mul3(d2, t))
  return { p1, p2, d: dist3(p1, p2) }
}

/** 직선(무한) P0+t·d 위, 광선과의 최근접 파라미터 t (평행이면 null) */
function lineRayT(P0: V3, dir: V3, ro: V3, rd: V3): number | null {
  const dl = len3(dir)
  if (dl < 1e-12) return null
  const a = mul3(dir, 1 / dl)
  const w0 = sub3(P0, ro)
  const B = dot3(a, rd)
  const denom = 1 - B * B
  if (denom < 1e-12) return null
  const D = dot3(a, w0)
  const E = dot3(rd, w0)
  return ((B * E - D) / denom) / dl // 원래 dir 단위의 t
}

/** 승격 기하의 3D 크기(bbox 대각) — 병합·교차 임계의 기준 */
export function geomSize3(lift: LiftResult): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const seg of lift.lifted.values()) {
    for (const p of [seg.a3, seg.b3]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
  }
  if (!isFinite(minX)) return 0
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
}

/** 3D 실제 교차점들 — 간격 ≤ 0.01·기하 크기 (3단계 자동 분할도 이 목록을 쓴다) */
export function intersections3(lift: LiftResult): { p3: V3; ids: [number, number] }[] {
  const size = geomSize3(lift)
  if (size <= 0) return []
  const tol = C.INTERSECT_GAP_RATIO * size
  const segs = [...lift.lifted.entries()]
  const out: { p3: V3; ids: [number, number] }[] = []
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [idA, A] = segs[i]!
      const [idB, B] = segs[j]!
      const c = segSegClosest3(A.a3, A.b3, B.a3, B.b3)
      if (c.d <= tol) {
        out.push({ p3: mul3(add3(c.p1, c.p2), 0.5), ids: [idA, idB] })
      }
    }
  }
  return out
}

interface Candidate { kind: OsnapKind; p: Pt; p3: V3 | null; d: number }

/** 오스냅 — 커서 근처의 최우선 후보. start는 수선 발 계산용(그리는 중일 때). */
export function osnap(
  lift: LiftResult,
  pose: CamPose,
  cursor: Pt,
  set: OsnapSettings,
  start?: { p3: V3 | null },
): OsnapHit | null {
  const an = lift.an
  const R = set.radius
  const cands: Candidate[] = []
  const push = (kind: OsnapKind, p: Pt | null, p3: V3 | null) => {
    if (!p) return
    const d = dist2(p, cursor)
    if (d <= R) cands.push({ kind, p, p3, d })
  }

  // 소실점 — 현재 포즈의 화면 위치(불변식 i: 표시=스냅이 같은 출처인 screenAxes).
  // p3는 null이다: 소실점은 무한원에 있어 3D 점이 아니다. 방향으로만 쓴다.
  // **화면 밖이어도 목록에서 안 뺀다** — 팬으로 들어오면 반경 검사가 알아서 받는다.
  if (set.kinds.vp) {
    for (const ax of vpMarks(an, pose)) push('vp', ax.vp, null)
  }

  const size3 = geomSize3(lift)
  const mergeTol3 = C.MERGE_RATIO * Math.max(size3, 1e-9)

  // 끝점·정점 — 3D 병합(0.002·크기)으로 정점(≥2획 공유)을 가른다
  const ends: { p3: V3; count: number }[] = []
  for (const seg of lift.lifted.values()) {
    for (const p3 of [seg.a3, seg.b3]) {
      const found = ends.find(e => dist3(e.p3, p3) <= mergeTol3)
      if (found) found.count++
      else ends.push({ p3, count: 1 })
    }
  }
  for (const e of ends) {
    const kind: OsnapKind = e.count >= 2 ? 'vertex' : 'end'
    if (set.kinds[kind]) push(kind, project(an, pose, e.p3), e.p3)
  }

  // 중점 — 3D 중점의 사영 (투시에서 화면 중점과 다르다 — 3D가 정본)
  if (set.kinds.mid) {
    for (const seg of lift.lifted.values()) {
      const m3 = mul3(add3(seg.a3, seg.b3), 0.5)
      push('mid', project(an, pose, m3), m3)
    }
  }

  // 교차점 — 3D 실제 교차만
  if (set.kinds.int) {
    for (const x of intersections3(lift)) push('int', project(an, pose, x.p3), x.p3)
  }

  // 수선 발 — 그리는 중이고 시작점이 3D일 때, 시작점에서 각 선분에 내린 발
  if (set.kinds.perp && start?.p3) {
    for (const seg of lift.lifted.values()) {
      const foot = closestOnSeg3(start.p3, seg.a3, seg.b3)
      // 발이 선분 안일 때만 (클램프가 끝점에 닿았으면 끝점 스냅의 몫)
      if (dist3(foot, seg.a3) > mergeTol3 && dist3(foot, seg.b3) > mergeTol3) {
        push('perp', project(an, pose, foot), foot)
      }
    }
  }

  // 근처점·연장선 — 광선과 3D 직선의 최근접점. 파라미터가 선분 안이면 근처점, 밖이면 연장선
  const ray = rayThrough(an, pose, cursor)
  if (ray && (set.kinds.near || set.kinds.ext)) {
    for (const seg of lift.lifted.values()) {
      const dir = sub3(seg.b3, seg.a3)
      const t = lineRayT(seg.a3, dir, ray.o, ray.d)
      if (t === null) continue
      const over = C.SEG_OVERSHOOT_RATIO
      if (t >= -over && t <= 1 + over) {
        if (!set.kinds.near) continue
        const tc = Math.max(0, Math.min(1, t))
        const p3 = add3(seg.a3, mul3(dir, tc))
        push('near', project(an, pose, p3), p3)
      } else {
        if (!set.kinds.ext) continue
        const p3 = add3(seg.a3, mul3(dir, t))
        push('ext', project(an, pose, p3), p3)
      }
    }
  }

  // 대기 획 — 끝점·중점만, 2D에서 (자기 포즈에서만 유효하지만 좌표는 포즈 무관 화면값)
  for (const id of lift.waiting) {
    const s = lift.strokes.get(id)
    if (!s) continue
    if (set.kinds.end) { push('end', s.a, null); push('end', s.b, null) }
    if (set.kinds.mid) push('mid', pt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2), null)
  }

  // 정확한 것이 앞선다 — 종류 우선순위, 같은 종류면 가까운 것
  for (const kind of OSNAP_ORDER) {
    const inKind = cands.filter(c => c.kind === kind)
    if (inKind.length === 0) continue
    inKind.sort((x, y) => x.d - y.d)
    const c = inKind[0]!
    return { kind: c.kind, p: c.p, p3: c.p3 }
  }
  return null
}
