// 면 — 닫힌 루프에 **사용자가 지정한 것만** 면이 된다(자동 생성 없음).
// 방 안의 벽 넷은 방이지 면 넷이 아니고, 창틀 사각형은 개구부다.
//
// 세 층으로 갈린다. 섞으면 「어느 좌표계인가」가 흐려진다:
//   ① **찾기**  탭한 자리를 둘러싼 최소 루프를 낸다. **평면마다 따로** 훑는다 —
//               그 까닭은 ① 절 머리말에 있다(가림이 배치를 망가뜨린다). 마디는
//               **3D에서 합친 끝점**이고 화면 교차는 마디가 아니다(`osnap`과 같은 기준).
//   ② **저장**  루프를 **획 id의 차례**로 줄인다(`types.ts`의 `FaceEdge`). 좌표를 안 담는다.
//   ③ **풀기**  이웃한 두 경계의 **3D 직선 교점**이 정점이다. 선분 끝점이 아니라 직선
//               교점인 이유: 자동 분할이 교차점에서 나누므로 삐져나온 선의 «모서리»는
//               끝점이 아니라 교점이다(지시 「닫힘 판정」의 답이 여기 있다 —
//               **끝점이 정확히 만날 필요가 없다**).
//
// 곡선: 지금은 직선뿐이다. `FaceEdge.kind`가 그 자리이고, 곡선이 오면 ③의
// `edgeLine()`·`cornerOf()` 둘만 늘어난다 — ①·②는 안 바뀐다.

import type { CamPose, Face, FaceLoop } from './types'
import { C } from './constants'
import { project, rayThrough } from './camera'
import type { LiftResult } from './lift'
import { pieces, type Piece } from './pieces'
import { geomSize3 } from './osnap'
import {
  type Pt, type V3, pt, v3, add3, sub3, mul3, dot3, cross3, dist3, len3, norm3,
} from './vec'

// ── ③ 풀기 — 경계 차례 → 3D 다각형 ───────────────────────────────────────

/** 경계 하나의 3D 직선(점 + 방향). 승격 안 된 획이면 null → 면이 안 풀린다. */
function edgeLine(lift: LiftResult, s: number): { o: V3; d: V3 } | null {
  const seg = lift.lifted.get(s)
  if (!seg) return null
  const d = sub3(seg.b3, seg.a3)
  if (len3(d) < 1e-12) return null
  return { o: seg.a3, d: norm3(d) }
}

/** 두 3D 직선의 최근접 중점 — 평행이면 null. 모서리 하나가 이것이다. */
export function cornerOf(A: { o: V3; d: V3 }, B: { o: V3; d: V3 }): V3 | null {
  const w0 = sub3(A.o, B.o)
  const b = dot3(A.d, B.d)
  const den = 1 - b * b
  if (den < 1e-12) return null
  const d = dot3(A.d, w0), e = dot3(B.d, w0)
  const sA = (b * e - d) / den
  const sB = (e - b * d) / den
  return mul3(add3(add3(A.o, mul3(A.d, sA)), add3(B.o, mul3(B.d, sB))), 0.5)
}

/** 루프 하나 → 3D 정점 차례. 정점 i = 경계 i−1 과 경계 i 의 교점. */
function loopPoints(lift: LiftResult, loop: FaceLoop): V3[] | null {
  const n = loop.edges.length
  if (n < 3) return null
  const lines: { o: V3; d: V3 }[] = []
  for (const e of loop.edges) {
    const l = edgeLine(lift, e.s)
    if (!l) return null
    lines.push(l)
  }
  const out: V3[] = []
  for (let i = 0; i < n; i++) {
    const c = cornerOf(lines[(i - 1 + n) % n]!, lines[i]!)
    if (!c) return null
    out.push(c)
  }
  return out
}

/** 다각형의 법선 — Newell(오목에도 안정) */
export function newellNormal(poly: V3[]): V3 {
  let n = v3(0, 0, 0)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    n = add3(n, v3(
      (a.y - b.y) * (a.z + b.z),
      (a.z - b.z) * (a.x + b.x),
      (a.x - b.x) * (a.y + b.y),
    ))
  }
  return norm3(n)
}

export interface ResolvedFace {
  id: number
  /** 외곽 3D 정점 */
  outer: V3[]
  /** 개구부 — 면 안의 구멍 */
  holes: V3[][]
  normal: V3
  /** 평면 이탈 — 기하 크기 대비(0이면 정확히 한 평면) */
  flat: number
  /** 삼각분할 — 외곽+개구부를 이어 자른 삼각형(3D 좌표 차례, 3개씩) */
  tris: V3[]
}

/** 면 하나를 푼다 — 경계가 다 승격돼 있고 한 평면 안이어야 한다.
 *
 *  **평면성**(지시): 허용 오차 안이면 한 평면으로 받고, 밖이면 **안 만든다**.
 *  삼각분할로 «비평면 면»을 만들 수도 있었지만 그러면 조용히 틀린 입체가 된다
 *  (A-3: 애매하면 놓지 않는다). 허용치는 3D 교차 허용 간격과 같은 급이다 —
 *  그 간격 안에서 만나는 선들로 만든 루프이므로 그보다 엄해질 수 없다. */
export function resolveFace(lift: LiftResult, face: Face, size3: number): ResolvedFace | null {
  if (face.loops.length === 0) return null
  const outer = loopPoints(lift, face.loops[0]!)
  if (!outer || outer.length < 3) return null
  const holes: V3[][] = []
  for (let i = 1; i < face.loops.length; i++) {
    const h = loopPoints(lift, face.loops[i]!)
    if (!h || h.length < 3) return null
    holes.push(h)
  }
  const normal = newellNormal(outer)
  if (len3(normal) < 0.5) return null // 퇴화 — 한 직선 위
  // 이탈은 **무게중심을 지나는 최적합 평면**에서 잰다 — 한 꼭짓점을 원점으로 삼으면
  // 그 점이 어긋난 경우에 이탈이 0으로 읽힌다(같은 점에서 재니까).
  const all = [...outer, ...holes.flat()]
  let cx = 0, cy = 0, cz = 0
  for (const p of all) { cx += p.x; cy += p.y; cz += p.z }
  const o = v3(cx / all.length, cy / all.length, cz / all.length)
  let flat = 0
  for (const p of all) flat = Math.max(flat, Math.abs(dot3(sub3(p, o), normal)))
  const rel = size3 > 0 ? flat / size3 : 0
  if (rel > C.PLANAR_RATIO) return null
  const tris = triangulate3(outer, holes, normal)
  if (tris.length === 0) return null
  return { id: face.id, outer, holes, normal, flat: rel, tris }
}

/** 문서의 면 전부 — 못 푸는 것은 **버리지 않고 빠진다**(불변식 j의 면판).
 *  경계 획이 지워지면 안 그려지고, 실행취소로 그 획이 돌아오면 면도 돌아온다. */
export function resolveFaces(lift: LiftResult, faces: Face[]): ResolvedFace[] {
  const size3 = geomSize3(lift)
  const out: ResolvedFace[] = []
  for (const f of faces) {
    const r = resolveFace(lift, f, size3)
    if (r) out.push(r)
  }
  return out
}

// ── 평면 기저 · 삼각분할 ─────────────────────────────────────────────────

/** 면 평면의 2D 기저 — 3D → 평면 좌표 */
export function planeBasis(origin: V3, normal: V3): (p: V3) => Pt {
  let u = cross3(normal, v3(0, 1, 0))
  if (len3(u) < 1e-6) u = cross3(normal, v3(1, 0, 0))
  u = norm3(u)
  const w = norm3(cross3(normal, u))
  return (p: V3) => { const d = sub3(p, origin); return pt(dot3(d, u), dot3(d, w)) }
}

/** 부호 면적 (양수 = 반시계) */
export function area2(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** 두 선분이 **끝점을 빼고** 진짜로 가로지르는가 */
function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const s = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  const d1 = s(a, b, c), d2 = s(a, b, d), d3 = s(c, d, a), d4 = s(c, d, b)
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0
}

/** 개구부를 외곽에 잇는다 — 가장 짧고 **다른 변을 안 자르는** 다리 하나씩.
 *  정점이 수십 개라 완전 탐색이 가장 단순하다(A-3). 인덱스만 다룬다. */
function bridgeHoles(outer: number[], holes: number[][], P: Pt[]): number[] {
  let ring = [...outer]
  const rest = holes.map(h => [...h])
  while (rest.length > 0) {
    const edges: [Pt, Pt][] = []
    for (let i = 0; i < ring.length; i++) edges.push([P[ring[i]!]!, P[ring[(i + 1) % ring.length]!]!])
    for (const h of rest) for (let i = 0; i < h.length; i++) edges.push([P[h[i]!]!, P[h[(i + 1) % h.length]!]!])
    let best: { hi: number; oi: number; hj: number; d: number } | null = null
    for (let hi = 0; hi < rest.length; hi++) {
      for (let oi = 0; oi < ring.length; oi++) {
        for (let hj = 0; hj < rest[hi]!.length; hj++) {
          const A = P[ring[oi]!]!, B = P[rest[hi]![hj]!]!
          const d = Math.hypot(A.x - B.x, A.y - B.y)
          if (best && d >= best.d) continue
          let ok = true
          for (const [p, q] of edges) if (segCross(A, B, p, q)) { ok = false; break }
          if (ok) best = { hi, oi, hj, d }
        }
      }
    }
    if (!best) return ring // 다리를 못 놓는다 — 개구부 없이라도 외곽은 그린다
    const h = rest[best.hi]!
    const rot = [...h.slice(best.hj), ...h.slice(0, best.hj)]
    ring = [
      ...ring.slice(0, best.oi + 1),
      ...rot, rot[0]!,
      ...ring.slice(best.oi),
    ]
    rest.splice(best.hi, 1)
  }
  return ring
}

function inTri(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const s = (u: Pt, v: Pt, w: Pt) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** 귀 자르기 — **오목 다각형을 받는다**(개구부가 있으면 다리로 이어진 뒤에 온다) */
function earClip(ring: number[], P: Pt[]): [number, number, number][] {
  if (ring.length < 3) return []
  const idx = [...ring]
  if (area2(idx.map(i => P[i]!)) < 0) idx.reverse() // 언제나 반시계로 자른다
  const out: [number, number, number][] = []
  let guard = idx.length * idx.length + 16
  while (idx.length > 3 && guard-- > 0) {
    let cut = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length]!, ib = idx[i]!, ic = idx[(i + 1) % idx.length]!
      const a = P[ia]!, b = P[ib]!, c = P[ic]!
      const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
      if (cr <= 0) continue // 볼록 귀가 아니다
      let clear = true
      for (const k of idx) {
        if (k === ia || k === ib || k === ic) continue
        if (inTri(P[k]!, a, b, c)) { clear = false; break }
      }
      if (!clear) continue
      out.push([ia, ib, ic])
      idx.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break // 자기교차 등 — 낸 만큼만 쓴다
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!])
  return out
}

/** 외곽 + 개구부 → 3D 삼각형 목록(3개씩). 평면 좌표로 내려 자르고 되올린다. */
export function triangulate3(outer: V3[], holes: V3[][], normal: V3): V3[] {
  const to2 = planeBasis(outer[0]!, normal)
  const P3: V3[] = []
  const P2: Pt[] = []
  /** 고리 하나를 표에 담는다 — 개구부는 외곽과 **반대 방향**이어야 다리가 제대로 놓인다 */
  const push = (ring: V3[], ccw: boolean): number[] => {
    const r = (area2(ring.map(to2)) >= 0) === ccw ? ring : [...ring].reverse()
    const idx: number[] = []
    for (const p of r) { idx.push(P3.length); P3.push(p); P2.push(to2(p)) }
    return idx
  }
  const outerIdx = push(outer, true)
  const holeIdx = holes.map(h => push(h, false))
  const ring = bridgeHoles(outerIdx, holeIdx, P2)
  const out: V3[] = []
  for (const [a, b, c] of earClip(ring, P2)) out.push(P3[a]!, P3[b]!, P3[c]!)
  return out
}

// ── ① 찾기 — **한 평면 안에서** 최소 루프 ────────────────────────────────
//
// ⚠ **평면마다 따로 훑는다.** 초판은 조각 전체를 한 화면 배치로 훑었고, 그래서
// 「3D에서 안 만나는데 화면에서 겹치는」 자리 — 곧 **가림** — 이 배치를 망가뜨렸다.
// 실측(2026-08-21, 벽 하나 그린 장면): 세로 기둥이 지면 대각선을 **화면에서만**
// 가로질러, 마디 10 · 변 11(순환이 둘 있어야 하는 그래프)인데 **순환이 하나**로 나왔다
// (반변 22 · 면적 0 = 나무처럼 읽혔다). 벽도 바닥도 면이 안 됐다. 각도 정렬이
// 「평면 그래프」를 전제하는데 그 전제가 깨진 것이다.
//
// **면은 한 평면에 있다.** 그러니 찾기도 한 평면 안에서 한다: 한 평면 위의 두 선분이
// 화면에서 가로지르면 3D에서도 가로지르고(그 교차는 자동 분할이 이미 마디로 만들어
// 두었다), 그래서 그 부분 그래프는 **진짜 평면 그래프**다.
// 덤으로 루프의 평면성이 **구성상** 보장된다 — `resolveFace`의 검사는 그 뒤의 확인이다.

interface HalfEdge { u: number; v: number; piece: Piece; twin: number }

export interface Graph {
  nodes: { p3: V3; p: Pt }[]
  half: HalfEdge[]
}

export interface Cycle { he: number[]; area: number; comp: number }

/** 화면 각도 — y를 뒤집어 수학 관행(반시계 = 증가)에 맞춘다 */
const angOf = (a: Pt, b: Pt) => Math.atan2(-(b.y - a.y), b.x - a.x)

/** 조각 그래프 — **마디는 3D에서 합친 끝점**이다(화면 교차는 마디가 아니다). */
export function buildGraph(lift: LiftResult, pose: CamPose): Graph {
  const ps = pieces(lift, pose).filter(p => p.lifted && p.a3 && p.b3)
  const size3 = geomSize3(lift)
  const tol = C.MERGE_RATIO * Math.max(size3, 1e-9)
  const nodes: { p3: V3; p: Pt }[] = []
  const nodeOf = (p3: V3, p: Pt): number => {
    for (let i = 0; i < nodes.length; i++) if (dist3(nodes[i]!.p3, p3) <= tol) return i
    nodes.push({ p3, p })
    return nodes.length - 1
  }
  const half: HalfEdge[] = []
  for (const pc of ps) {
    const u = nodeOf(pc.a3!, pc.a)
    const v = nodeOf(pc.b3!, pc.b)
    if (u === v) continue
    const i = half.length
    half.push({ u, v, piece: pc, twin: i + 1 })
    half.push({ u: v, v: u, piece: pc, twin: i })
  }
  return { nodes, half }
}

/** 부분 그래프(변 인덱스 집합)의 최소 순환. **그 집합이 평면 그래프여야 한다.** */
export function cyclesOf(g: Graph, use: Set<number>): Cycle[] {
  const outAt = new Map<number, number[]>()
  for (let i = 0; i < g.half.length; i++) {
    if (!use.has(i >> 1)) continue
    const u = g.half[i]!.u
    const a = outAt.get(u) ?? []
    a.push(i)
    outAt.set(u, a)
  }
  const angle = (i: number) => angOf(g.nodes[g.half[i]!.u]!.p, g.nodes[g.half[i]!.v]!.p)
  for (const list of outAt.values()) list.sort((a, b) => angle(a) - angle(b))
  const posIn = new Map<number, number>()
  for (const list of outAt.values()) list.forEach((h, k) => posIn.set(h, k))
  /** 왼쪽 면을 따라가는 다음 반변 — twin에서 **시계 방향 다음**(반시계 정렬의 하나 앞).
   *  이 규칙이 안쪽 면을 반시계(면적 > 0)로, 바깥 경계를 시계(면적 < 0)로 훑는다.
   *  ⚠ 차수 2인 마디에서는 `k+1`과 결과가 같다 — 삼각형·사각형만으로는 **부호를 못 잰다.**
   *  갈래가 있는 장면(`face.test.ts`의 「가르는 선」·「벽」)이 그것을 잰다. */
  const nextOf = (i: number): number => {
    const t = g.half[i]!.twin
    const list = outAt.get(g.half[t]!.u)!
    const k = posIn.get(t)!
    return list[(k - 1 + list.length) % list.length]!
  }
  // 연결 성분 — 개구부 판정이 이것으로 「다른 덩어리인가」를 가른다
  const comp = new Map<number, number>()
  let nc = 0
  for (const s of outAt.keys()) {
    if (comp.has(s)) continue
    comp.set(s, nc)
    const stack = [s]
    while (stack.length > 0) {
      const u = stack.pop()!
      for (const h of outAt.get(u) ?? []) {
        const v = g.half[h]!.v
        if (!comp.has(v)) { comp.set(v, nc); stack.push(v) }
      }
    }
    nc++
  }
  const seen = new Set<number>()
  const out: Cycle[] = []
  for (let s = 0; s < g.half.length; s++) {
    if (!use.has(s >> 1) || seen.has(s)) continue
    const he: number[] = []
    let cur = s
    let guard = g.half.length * 2 + 8
    do {
      seen.add(cur)
      he.push(cur)
      cur = nextOf(cur)
    } while (cur !== s && guard-- > 0 && !seen.has(cur))
    if (cur !== s) continue // 있을 수 없다(next는 전단사) — 방어
    let a = 0
    for (const i of he) {
      const p = g.nodes[g.half[i]!.u]!.p, q = g.nodes[g.half[i]!.v]!.p
      a += p.x * -q.y - q.x * -p.y
    }
    out.push({ he, area: a / 2, comp: comp.get(g.half[s]!.u)! })
  }
  return out
}

/** 후보 평면 — **마디를 공유하는 두 변**이 하나씩 정한다. 같은 평면은 합친다.
 *  변이 셋 미만인 평면은 버린다(루프가 못 선다). */
export function planesOf(g: Graph, tol: number): { n: V3; d: number; use: Set<number> }[] {
  const inc = new Map<number, number[]>()   // 마디 → 변(짝) 인덱스
  for (let i = 0; i < g.half.length; i += 2) {
    const h = g.half[i]!
    for (const u of [h.u, h.v]) {
      const a = inc.get(u) ?? []
      a.push(i >> 1)
      inc.set(u, a)
    }
  }
  const dirOf = (e: number): V3 =>
    norm3(sub3(g.nodes[g.half[e * 2]!.v]!.p3, g.nodes[g.half[e * 2]!.u]!.p3))
  const found: { n: V3; d: number }[] = []
  for (const [u, es] of inc) {
    const o = g.nodes[u]!.p3
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        let n = cross3(dirOf(es[i]!), dirOf(es[j]!))
        if (len3(n) < 1e-6) continue      // 같은 직선 — 평면을 못 정한다
        n = norm3(n)
        // 부호를 맞춘다 — 같은 평면이 두 번 들어오지 않게
        if (n.x < -1e-9 || (Math.abs(n.x) <= 1e-9 &&
            (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.z < 0)))) n = mul3(n, -1)
        const d = dot3(n, o)
        if (found.some(f => Math.abs(dot3(f.n, n)) > 1 - 1e-9 && Math.abs(f.d - d) <= tol)) continue
        found.push({ n, d })
      }
    }
  }
  const out: { n: V3; d: number; use: Set<number> }[] = []
  for (const pl of found) {
    const use = new Set<number>()
    for (let i = 0; i < g.half.length; i += 2) {
      const h = g.half[i]!
      const a = g.nodes[h.u]!.p3, b = g.nodes[h.v]!.p3
      if (Math.abs(dot3(pl.n, a) - pl.d) <= tol && Math.abs(dot3(pl.n, b) - pl.d) <= tol) use.add(i >> 1)
    }
    if (use.size >= 3) out.push({ ...pl, use })
  }
  return out
}

/** 탭 광선이 그 평면을 만나는 거리 — 뒤이거나 나란하면 Infinity(안 고른다) */
function planeDepth(pl: { n: V3; d: number }, ray: { o: V3; d: V3 }): number {
  const den = dot3(pl.n, ray.d)
  if (Math.abs(den) < 1e-9) return Infinity
  const t = (pl.d - dot3(pl.n, ray.o)) / den
  return t > 1e-9 ? t : Infinity
}

/** 순환의 화면 다각형 */
export const cyclePoly = (g: Graph, he: number[]): Pt[] =>
  he.map(i => g.nodes[g.half[i]!.u]!.p)

/** 점이 다각형 안인가 (화면 좌표, 짝홀) */
export function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 순환 → 저장 형태(획 id 차례). 이웃한 같은 획은 하나로 합친다 —
 *  한 획이 여러 조각으로 나뉘어 있어도 경계로서는 **직선 하나**다. */
function cycleToLoop(g: Graph, he: number[]): FaceLoop | null {
  const ids: number[] = []
  for (const i of he) {
    const s = g.half[i]!.piece.strokeId
    if (ids.length === 0 || ids[ids.length - 1] !== s) ids.push(s)
  }
  while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop()
  if (ids.length < 3) return null
  return { edges: ids.map(s => ({ kind: 'stroke' as const, s })) }
}

/** 탭한 자리를 둘러싼 루프 + 그 안의 개구부.
 *
 *  **고르는 규칙이 두 층이다**(지시 「어느 루프를 고르는가」의 답):
 *    · **한 평면 안에서는 가장 작은 것.** 평면마다 최소 순환만 후보이므로
 *      「작은 것과 그것을 포함한 큰 것」 중 작은 쪽이 언제나 답이다. 큰 쪽은 가르는
 *      선을 지운 뒤에 잡힌다. SketchUp이 그렇게 한다(A-3: 선례).
 *    · **평면끼리는 앞에 있는 것.** 벽과 바닥은 화면에서 겹치고(가림), 그때 사람이
 *      가리키는 것은 **가까운 쪽**이다 — 3D 도구의 집기 관행 그대로다.
 *      실측(벽 장면, 화면 (560,505) = 벽 **뒤**의 바닥): 넓이로 가르면 바닥 순환
 *      **29503**이 벽 순환 **43130**보다 작아 **바닥**이 잡혔다 — 눈에 보이는 것은 벽인데
 *      뒤엣것을 만든 셈이다. 거리로 가르면 벽이다.
 *      ⚠ 지금 면은 서로를 **안 가리고 그려지므로** 화면에는 뒤엣것도 보인다 —
 *      그 어긋남(집기는 앞, 그리기는 겹침)은 `DEFERRED.md`에 있다.
 *
 *  **개구부**는 같은 평면 안 다른 연결 성분의 바깥 경계가 통째로 안에 들어 있을 때다.
 *  외곽선이 오목한 것과 다르다 — 오목은 같은 성분이라 최소 순환 하나로 이미 나온다. */
export function loopAt(
  lift: LiftResult, pose: CamPose, p: Pt,
): { loops: FaceLoop[]; poly: Pt[] } | null {
  const g = buildGraph(lift, pose)
  const tol = C.PLANAR_RATIO * Math.max(geomSize3(lift), 1e-9)
  const ray = rayThrough(lift.an, pose, p)
  let best: { cy: Cycle; poly: Pt[]; all: Cycle[]; depth: number } | null = null
  for (const pl of planesOf(g, tol)) {
    const depth = ray ? planeDepth(pl, ray) : Infinity
    let inPlane: { cy: Cycle; poly: Pt[] } | null = null
    for (const cy of cyclesOf(g, pl.use)) {
      if (cy.area <= 1e-9) continue // 바깥 경계·가지(면적 0)
      const poly = cyclePoly(g, cy.he)
      if (!inPoly(p, poly)) continue
      if (!inPlane || cy.area < inPlane.cy.area) inPlane = { cy, poly } // ① 평면 안: 작은 것
    }
    if (!inPlane) continue
    if (!best || depth < best.depth) {                                  // ② 평면끼리: 앞엣것
      best = { ...inPlane, all: cyclesOf(g, pl.use), depth }
    }
  }
  if (!best) return null
  const outer = cycleToLoop(g, best.cy.he)
  if (!outer) return null
  const loops = [outer]
  for (const cy of best.all) {
    if (cy.comp === best.cy.comp) continue
    if (cy.area >= -1e-9) continue // 그 성분의 **바깥 경계**만 개구부 후보다
    const poly = cyclePoly(g, cy.he)
    if (!poly.every(q => inPoly(q, best!.poly))) continue
    const hole = cycleToLoop(g, cy.he)
    if (hole) loops.push(hole)
  }
  return { loops, poly: best.poly }
}

// ── 면 일괄 후보(web2-21 4부) — 커브로 닫힌 모든 영역 ─────────────────────
//
// **원칙(types.ts 「자동으로 안 만든다」)은 그대로다 — 지정의 방향만 뒤집는다**: 후보를
// 전부 내놓고 사용자가 «아닌 것만» 탭해 뺀다. 사용자가 지정한 것만 면인 것은 불변이다
// (지정이 「포함」에서 「배제」로 바뀔 뿐 — D-W8). 범위는 **모든 평면**(사람 문면:
// 「전체로 하자. '보이는 면'이라는 개념 자체가 애매하다」 — 면끼리 안 가리고 깊이도
// 안 쓰니 이 앱에 «보이는 면»의 정의가 없다 AS-C19).
//
// 안쪽 고리의 기본값은 **구멍**이다(사람이 정했다 — 벽 안의 사각형은 거의 언제나
// 개구부). `Face.loops` 구조(loops[0] 외곽·나머지 개구부) 그대로 — 새 자료구조 없음.
// 구멍이 된 성분의 자기 순환(고리 안쪽)은 후보에서 빠진다 — 채우고 싶으면 확정 뒤
// **기존 탭 하나**로 그 자리를 채운다(별도 동작 없음 — 지시 4-b).

export interface LoopCandidate { loops: FaceLoop[]; poly: Pt[] }

/** 모든 평면의 «닫힌 영역» 후보 — loopAt과 같은 재료(평면별 최소 순환·개구부 부착)를
 *  탭 없이 전부 낸다. 같은 외곽(획 id 집합)이 여러 평면에서 나오면 하나만(중복 제거). */
export function allLoops(lift: LiftResult, pose: CamPose): LoopCandidate[] {
  const g = buildGraph(lift, pose)
  const tol = C.PLANAR_RATIO * Math.max(geomSize3(lift), 1e-9)
  const out: LoopCandidate[] = []
  const seen = new Set<string>()
  const sigOf = (loop: FaceLoop): string => loop.edges.map(e => e.s).sort((a, b) => a - b).join(',')
  for (const pl of planesOf(g, tol)) {
    const cys = cyclesOf(g, pl.use)
    // 후보(면적 > 0 = 안쪽 면) + 구멍 부착. holeComps는 **평면 지역**이다 — comp 번호가
    // cyclesOf의 부분 그래프에서 나오므로 다른 평면과 안 섞인다(포함 판정도 같은 평면
    // 안에서만 — 지시 4-b ⚠).
    const cands: { comp: number; poly: Pt[]; loops: FaceLoop[] }[] = []
    const holeComps = new Set<number>()
    for (const cy of cys) {
      if (cy.area <= 1e-9) continue
      const poly = cyclePoly(g, cy.he)
      const outer = cycleToLoop(g, cy.he)
      if (!outer) continue
      const loops: FaceLoop[] = [outer]
      for (const other of cys) {
        if (other.comp === cy.comp) continue
        if (other.area >= -1e-9) continue                 // 그 성분의 바깥 경계만 구멍 후보
        const op = cyclePoly(g, other.he)
        if (!op.every(q => inPoly(q, poly))) continue     // 완전히 안에 든 것만(포함 판정)
        const hole = cycleToLoop(g, other.he)
        if (hole) { loops.push(hole); holeComps.add(other.comp) }
      }
      cands.push({ comp: cy.comp, poly, loops })
    }
    for (const c of cands) {
      // 구멍이 된 성분의 자기 순환은 후보가 아니다 — 기본값이 구멍이다(4-b)
      if (holeComps.has(c.comp)) continue
      const sig = sigOf(c.loops[0]!)
      if (seen.has(sig)) continue                          // 같은 외곽이 여러 평면에서
      seen.add(sig)
      out.push({ loops: c.loops, poly: c.poly })
    }
  }
  return out
}

// ── 면 맞히기 — 이미 있는 면 위를 탭했는가 ───────────────────────────────

/** 면의 화면 다각형 — 하나라도 사영이 안 되면 null */
export function faceScreen(lift: LiftResult, pose: CamPose, poly3: V3[]): Pt[] | null {
  const out: Pt[] = []
  for (const q of poly3) {
    const s = project(lift.an, pose, q)
    if (!s) return null
    out.push(s)
  }
  return out
}

/** 그 점 위의 면 — 여럿이면 **앞엣것**, 같은 거리면 화면에서 작은 것.
 *  `loopAt`과 **같은 순서**여야 한다(만들기와 없애기가 같은 자리를 가리켜야 하므로).
 *  개구부 안은 면이 아니다 — 뚫린 자리를 탭하면 그 아래(또는 없음)를 고른다. */
export function faceAt(
  lift: LiftResult, pose: CamPose, faces: ResolvedFace[], p: Pt,
): ResolvedFace | null {
  const ray = rayThrough(lift.an, pose, p)
  let best: ResolvedFace | null = null
  let bestKey: [number, number] = [Infinity, Infinity]
  for (const f of faces) {
    const poly = faceScreen(lift, pose, f.outer)
    if (!poly || !inPoly(p, poly)) continue
    let inHole = false
    for (const h of f.holes) {
      const hp = faceScreen(lift, pose, h)
      if (hp && inPoly(p, hp)) { inHole = true; break }
    }
    if (inHole) continue
    const depth = ray ? planeDepth({ n: f.normal, d: dot3(f.normal, f.outer[0]!) }, ray) : Infinity
    const key: [number, number] = [depth, Math.abs(area2(poly))]
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = f; bestKey = key
    }
  }
  return best
}
