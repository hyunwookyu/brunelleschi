// 오스냅 — Rhino Osnap 관행을 그대로 따른다(새로 설계하지 않는다).
// 종류: 소실점 > 정점 > 끝점 > 중점 > 교차점 > 수선 발 > 연장선 > 근처점 (정확한 것이 앞선다).
// 종류별 켜고 끄기, 반경 조절. 반경은 화면 px(포인터 정밀도의 문제라 선례가 절대 px).
//
// 교차점(`int`)은 3D에서 실제로 만나는 것만 쓴다 — 화면에서 가로지르는 것은 대개 가림이다.
// 대기 획(2D)은 끝점·중점·**몸통**이 후보다. 몸통의 답은 조준선 유무로 갈린다(web2-15 1번):
//   · 조준선 있음(축 스냅이 붙은 획) → `xint` **겉보기 교차** — 조준 광선 ∩ B의 그린 구간.
//   · 조준선 없음(자유 획) → `near` 근처점 — 종전대로 수직 발.
// 3D 획끼리의 «화면 교차»는 여전히 후보가 아니다(가림과 구별 불가 — #64). 대기 획은
// 다르다: 3D가 없으니 가릴 것도 없고, 조준선은 **내가 지금 그 잉크를 겨눈 것**이다.
// 선례는 AutoCAD의 apparent intersection · Rhino의 같은 오스냅이다(A-3 — 새로 안 짠다).

import type { CamPose } from './types'
import { C } from './constants'
import { project, rayThrough, vpMarks } from './camera'
import type { LiftResult } from './lift'
import { type ExtAcq, extAllowed } from './extacq'
import {
  type Pt, type V3, pt, add3, sub3, mul3, dot3, dist2, dist3, len3,
} from './vec'

export type OsnapKind = 'vp' | 'vertex' | 'end' | 'mid' | 'int' | 'xint' | 'perp' | 'ext' | 'near'
// 소실점이 맨 앞이다 — 작도가 정한 **정확한 점**이고, 그 자리에 다른 후보가 겹치는 일은
// 드물다(지평선 위). 나머지 순서는 Rhino 관행 그대로.
// `xint`(겉보기 교차)는 `int` 바로 뒤다 — **두 구속이 정한 정확한 점**이라 발·연장·근처보다
// 앞서지만(그 셋이 가리던 것이 web2-15의 증상이다), 실제 3D 교차보다는 뒤다(한쪽이 2D다).
// 끝점·중점은 여전히 앞선다 — B의 «특징점»을 겨냥한 것은 그쪽이 더 정확한 답이다.
export const OSNAP_ORDER: OsnapKind[] = ['vp', 'vertex', 'end', 'mid', 'int', 'xint', 'perp', 'ext', 'near']

/** 조준선(web2-15 1번) — **지금 그리는 획이 따라갈 화면 직선**이다.
 *  축 스냅이 붙은 획만 준다: 시작점과 방향이 이미 정해졌으므로 «어디서 뗐나»가 아니라
 *  «어디서 만나나»가 답이다(지시 1-a). 자유 획(소실점에서 뻗는 획·축을 만드는 획)은
 *  방향이 안 정해져 조준선이 없다 — 그때는 겉보기 교차가 성립하지 않는다. */
export interface OsnapAim { start: Pt; through: Pt }

export interface OsnapSettings {
  radius: number
  kinds: Record<OsnapKind, boolean>
}

export const defaultOsnap = (): OsnapSettings => ({
  radius: C.OSNAP_RADIUS_PX,
  kinds: { vp: true, vertex: true, end: true, mid: true, int: true, xint: true, perp: true, ext: true, near: true },
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

/** 화면 조준 **광선**(start → through, 앞쪽만) ∩ 화면 **선분**(a→b) — 겉보기 교차.
 *  둘 다 클램프한다: 광선은 뒤로 안 가고(뒤에 있는 교차는 «지금 긋는 획»이 아니다),
 *  선분은 **그린 구간**만이다(무한 연장에 걸면 «조용히 틀린 배치» — web2-13 1-d).
 *  평행(외적 ~0)이면 null — 답이 하나가 아니다. */
function raySegCross(start: Pt, through: Pt, a: Pt, b: Pt): Pt | null {
  const rx = through.x - start.x, ry = through.y - start.y
  const sx = b.x - a.x, sy = b.y - a.y
  const den = rx * sy - ry * sx
  const rl = Math.hypot(rx, ry), sl = Math.hypot(sx, sy)
  if (rl < 1e-9 || sl < 1e-9) return null
  // 평행 판정은 **정규화한 사인**으로 — 길이가 길면 den이 커져 각도 감각과 어긋난다
  if (Math.abs(den) / (rl * sl) < 1e-6) return null
  const qx = a.x - start.x, qy = a.y - start.y
  const t = (qx * sy - qy * sx) / den        // 광선 파라미터
  const u = (qx * ry - qy * rx) / den        // 선분 파라미터
  if (t < 0) return null                     // 뒤쪽
  if (u < 0 || u > 1) return null            // 그린 구간 밖
  return pt(start.x + t * rx, start.y + t * ry)
}

/** **비용 표식**(web2-18 0부 ④) — `osnap()` 한 번의 시간을 세 몫으로 가른다.
 *  D-1 그대로다: 무엇을 고칠지(4부를 열지)는 후보가 아니라 이 표식이 정한다.
 *  앱이 실제로 쓰는 경로에 심는다 — 측정용 사본을 안 만든다(원칙 a).
 *  비용은 호출당 `performance.now()` 다섯(≈0.5µs)이고 osnap 자체가 그보다 세 자릿수 크다.
 *  ⚠ `rest`는 뺄셈이라 **음수가 날 수 있다**(타이머 분해능) — 원장이 그대로 적는다. */
export const osnapCost = { calls: 0, totalMs: 0, intersectMs: 0, endsMs: 0, restMs: 0 }
export function resetOsnapCost(): void {
  osnapCost.calls = 0; osnapCost.totalMs = 0
  osnapCost.intersectMs = 0; osnapCost.endsMs = 0; osnapCost.restMs = 0
}

interface Candidate { kind: OsnapKind; p: Pt; p3: V3 | null; d: number }

/** 오스냅 — 커서 근처의 최우선 후보. start는 수선 발 계산용(그리는 중일 때). */
export function osnap(
  lift: LiftResult,
  pose: CamPose,
  cursor: Pt,
  set: OsnapSettings,
  start?: { p3: V3 | null },
  aim?: OsnapAim,
  /** **획득된 연장선**(web2-18 2부) — 여기 없는 선분의 연장은 후보가 아니다.
   *  안 주면 빈 목록으로 본다: `ext`는 **획득 없이는 한 번도 안 난다**(팔 ②가 지킨다). */
  extAcq: readonly ExtAcq[] = [],
): OsnapHit | null {
  const t0 = performance.now()
  let tInt = 0, tEnds = 0
  const an = lift.an
  const R = set.radius
  const cands: Candidate[] = []
  /** `from`을 주면 구멍(반경)을 **거기서** 잰다 — 기본은 커서다.
   *  겉보기 교차만 다른 자를 쓴다(아래 ⚠ — 손의 «수직» 오차는 축 스냅이 이미 버렸다). */
  const push = (kind: OsnapKind, p: Pt | null, p3: V3 | null, from?: Pt) => {
    if (!p) return
    const d = dist2(p, from ?? cursor)
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
  const tEnds0 = performance.now()
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
  tEnds = performance.now() - tEnds0

  // 중점 — 3D 중점의 사영 (투시에서 화면 중점과 다르다 — 3D가 정본)
  if (set.kinds.mid) {
    for (const seg of lift.lifted.values()) {
      const m3 = mul3(add3(seg.a3, seg.b3), 0.5)
      push('mid', project(an, pose, m3), m3)
    }
  }

  // 교차점 — 3D 실제 교차만
  if (set.kinds.int) {
    const tInt0 = performance.now()
    const xs = intersections3(lift)
    tInt = performance.now() - tInt0
    for (const x of xs) push('int', project(an, pose, x.p3), x.p3)
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
    for (const [id, seg] of lift.lifted) {
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
        // ── 연장선은 **획득식**이다(web2-18 2-b) ─────────────────────────────
        // 종전에는 여기서 모든 승격 선분의 연장이 무한 길이로 후보가 됐다 — 획이 늘수록
        // 화면이 연장선으로 덮여 「허공에서 뭔가에 끌린다」가 됐고, 조준 경로 내내 잡혀
        // `near`·`xint`를 가렸다(web2-15가 우회로 넘긴 그 자리). 이제 **획득한 끝에서
        // 그 선분 길이의 EXT_MAX_RATIO배까지**만 산다 — 판정은 `extacq.extAllowed` 하나다.
        if (!set.kinds.ext) continue
        if (!extAllowed(extAcq, id, t, over)) continue
        const p3 = add3(seg.a3, mul3(dir, t))
        push('ext', project(an, pose, p3), p3)
      }
    }
  }

  // 대기 획 — 끝점·중점·**몸통**, 2D에서 (자기 포즈에서만 유효하지만 좌표는 포즈 무관
  // 화면값). ⚠ 구간 클램프 — 무한 연장에 걸면 «조용히 틀린 배치»다(web2-13 1-d).
  //
  // ── 몸통의 답이 web2-15에서 바뀌었다: `near` → `xint`(조준선이 있을 때) ──
  // web2-14가 near를 열었는데 실기기에서 **여전히 안 됐다**. 표식이 낸 기전 둘
  // (재현: `xint_web2.json` · 팔 `xint.test.ts`):
  //   ① near는 커서를 B에 **수직으로 붙인다** — 축 스냅으로 정한 획의 끝이 축선에서
  //      최대 반경(8px)만큼 밀린다. 그 밀림이 획 길이 대비 축 허용각을 넘으면
  //      `axisOfStroke`가 축을 못 주고 A 자신이 안 올라가 **정의가 조용히 무산**된다
  //      (무산 계수도 안 오른다 — defineByTouch가 «A가 3D가 아니다»에서 먼저 나간다).
  //   ② 그 전에 `ext`·`perp`가 near를 **가린다**. 다른 3D 선에서 이어 그으면 그 선의
  //      연장(ext)이 조준 경로 내내 잡혀 near는 한 번도 못 이긴다 — 사람이 본 것이
  //      「스냅이 안 잡힌다」의 이 절반이다.
  // 답은 **겉보기 교차**다(AutoCAD apparent intersection · Rhino — A-3 선례 그대로):
  // 축스냅된 A는 시작점과 방향이 정해졌으므로 B와 만나는 자리가 **하나**다. 손이 어디서
  // 멈추든 답이 같다 — 「붙인다」가 아니라 「만나는 데까지 늘린다」(지시 1-a).
  // ⚠ 조준선이 있으면 near를 **안 낸다**: 두 답이 경쟁하면 ①이 되살아난다. 조준선이
  // 없는 획(자유 — 소실점에서 뻗는 획·축을 만드는 획)에는 축이 없으므로 near가 그대로다.
  // 우선순위는 OSNAP_ORDER 그대로라 끝점·중점이 몸통보다 앞선다(끝 근처에서는 종전 동작).
  for (const id of lift.waiting) {
    const s = lift.strokes.get(id)
    if (!s) continue
    if (set.kinds.end) { push('end', s.a, null); push('end', s.b, null) }
    if (set.kinds.mid) push('mid', pt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2), null)
    // 겉보기 교차 — 조준선이 있을 때만. 있으면 «몸통»의 답은 이것 하나다(아래 ⚠).
    if (aim && set.kinds.xint) {
      const p = raySegCross(aim.start, aim.through, s.a, s.b)
      // ⚠ 구멍을 **축스냅된 끝**(`aim.through`)에서 잰다 — 커서에서 재면 축에 수직인
      // 손 오차가 문에 다시 실린다. 그 성분은 축 스냅이 이미 버린 값이고, 그것을 문에
      // 태우는 것이 #68이 잡은 형태다(«오차가 안 실리는 값으로 바꾼다»). 남는 것은
      // 「조준선을 따라 얼마나 못 미쳤나/지나쳤나」 하나 — 그것만이 의도의 표시다.
      if (p) push('xint', p, null, aim.through)
    } else if (!aim && set.kinds.near) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y
      const L2 = dx * dx + dy * dy
      if (L2 > 1e-12) {
        const t = Math.max(0, Math.min(1, ((cursor.x - s.a.x) * dx + (cursor.y - s.a.y) * dy) / L2))
        push('near', pt(s.a.x + t * dx, s.a.y + t * dy), null)
      }
    }
  }

  // 계측 마감(0부 ④) — 어느 갈래로 나가든 한 번 적는다
  const done = <T>(v: T): T => {
    const total = performance.now() - t0
    osnapCost.calls++
    osnapCost.totalMs += total
    osnapCost.intersectMs += tInt
    osnapCost.endsMs += tEnds
    osnapCost.restMs += total - tInt - tEnds
    return v
  }

  // 정확한 것이 앞선다 — 종류 우선순위, 같은 종류면 가까운 것
  for (const kind of OSNAP_ORDER) {
    const inKind = cands.filter(c => c.kind === kind)
    if (inKind.length === 0) continue
    inKind.sort((x, y) => x.d - y.d)
    const c = inKind[0]!
    return done({ kind: c.kind, p: c.p, p3: c.p3 })
  }
  return done(null)
}
