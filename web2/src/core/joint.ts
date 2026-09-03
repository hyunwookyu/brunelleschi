// web2-56 — **접합**. 사람이 짚은 병: 「연속된 외벽은 코너에서 ㄴ자형 단면선이 오프셋된
// 모양이어야 하는데 단면의 중점을 직각으로 계단처럼 공유하는 구조가 생긴다」.
// 원인: 면(벽)마다 따로 오프셋해 굳히면 코너의 사각 기둥 하나가 어느 쪽 몸에도 안 들고,
// 캡이 상대 몸을 뚫는다 — 세그먼트 union의 그 병(지시 문면 · Region Union의 그 문제).
//
// 조사 다섯(Revit·ArchiCAD·VisualARQ·IFC·IfcOpenShell)이 수렴한 구조가 병합 걸음인데,
// **분류당 층이 하나이므로 걸음이 «두 오프셋 평면의 교선»으로 축약된다**(지시 — 순수 산술).
// 이 앱의 벽은 「면(중심면) + slotOffsets(앞/뒤) + 띠」(55)라, 접합의 구현은
// **접합 모서리 정점의 면내 이동(shift)** 하나다:
//
//   무승부(core·pri 같음)  양쪽 다 이동 — 안쪽↔안쪽·바깥↔바깥 평면의 교선까지.
//                          그 결과가 45° 마이터다(**별도 모드 ⛔** — 지시: 전부 무승부인
//                          경우일 뿐이다. 구성이 다르면 저절로 버트가 된다).
//   승부                   이긴 쪽은 진 쪽 «먼» 평면까지 관통, 진 쪽은 이긴 쪽 «가까운»
//                          평면에 부딪혀 끝난다(버트).
//   T(끝 ↔ 경로)           줄기가 이기면 관통(먼 평면), 지면·비기면 가까운 평면에서 멈춘다.
//                          막대는 안 움직인다(단일 층 — 막대를 가르는 것은 층이 여럿인
//                          날의 일이다).
//
// 이동을 앞/뒤 면 복사와 띠 사각에 그대로 적용하면 접합 모서리의 띠 사각이 **저절로
// 캡(마이터/버트 면)이 된다** — 프로필 조립 단계가 따로 없다(렌더는 정점만 옮긴다).
// ⛔ 솔리드를 합치지 않는다 — 각 면이 자기 앞/뒤/띠를 끝까지 유지한다(지시).
//
// **동점·차례는 안정된 면 열쇠로 가른다**(외곽 무게중심+법선 양자화 — 생성 순서 ⛔:
// 잘라내기·붙여넣기로 결과가 바뀌면 안 된다. 지시의 「안정 id」 게이트가 이 자리다).
//
// D-1 표식: 기각마다 사유(reason)를 남긴다 — 「접합이 안 붙는다」가 오면 후보부터 만지지
// 말고 rejects에서 어느 문에서 떨어졌는지 먼저 읽는다.

import { add3, sub3, mul3, dot3, cross3, norm3, len3, type V3 } from './vec'

/** 접합 입력 — 두께가 실제로 선 면만 온다(t>0 · 축척 확정). 오프셋은 세계 단위. */
export interface JointFaceIn {
  id: number
  outer: V3[]
  holes: V3[][]
  /** 단위 법선 */
  normal: V3
  /** 앞/뒤 표면 오프셋(세계 단위 · front ≥ back) — clsdef.slotOffsets의 값 그대로 */
  frontW: number
  backW: number
  core: 0 | 1
  pri: number
  /** 외곽 모서리 i(정점 i → i+1)의 획 id — 접합 끊기(Stroke.nj)의 판정에 쓴다 */
  edgeStrokes: (number | null)[]
  /** 접합이 끊긴 모서리 인덱스(외곽) — nj가 걸린 획의 모서리 */
  brokenEdges: Set<number>
}

export interface JointOpt {
  /** 치유 반경(세계 단위) — 모서리가 교선에서 이 안이면 붙는다(밖이면 안 붙는다 #71) */
  cleanupW: number
  /** 연장 상한(세계 단위) — 필요한 이동이 이보다 크면 붙이지 않는다 */
  maxExtW: number
  /** 평행 판정 — |법선 내적|이 이 이상이면 두 면은 접합 후보가 아니다 */
  parDot: number
}

export interface JoinRec {
  kind: 'L' | 'T'
  /** 면 id — T에서는 a가 줄기(끝), b가 막대(경로)다 */
  a: number
  b: number
  edgeA: number
  edgeB: number | null
  strokeA: number | null
  strokeB: number | null
  /** 무승부(마이터)인가 — 승부면 winner가 있다 */
  tie: boolean
  winner: number | null
  /** 이동량(세계 단위 · 면의 바깥 방향 양수) — 반증 팔(우선순위 뒤집기)이 이 값을 본다 */
  extA: { front: number; back: number }
  extB: { front: number; back: number } | null
  /** L 전용 — 계단(코너의 덮이지 않는 사각 기둥) 표본 사각: [끝0, 중간, 끝1] 높이의
   *  [기준, +바깥B, +바깥B+바깥A, +바깥A] — 픽셀 게이트가 이 안의 종이색을 센다 */
  probe: V3[][] | null
}

export interface JointsOut {
  /** 면 id → (정점 열쇠 → 앞/뒤 표면의 면내 이동 벡터) — 렌더가 정점에 더한다 */
  shifts: Map<number, Map<string, { f: V3; b: V3 }>>
  joins: JoinRec[]
  /** D-1 표식 — 평행·거리·상한 어느 문에서 떨어졌는가 */
  rejects: { a: number; b: number; reason: string }[]
  /** 1링(지시 6) — 이번 계산에서 서명이 바뀌어 다시 걸은 쌍과 그 면들 */
  stats: { computed: number; cached: number; recomputedFaces: number[] }
}

/** 정점 열쇠 — 렌더의 삼각·띠 정점과 이동표를 잇는 유일한 자물쇠(#54) */
export const vkey = (p: V3): string => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`

/** **안정된 면 열쇠** — 외곽 무게중심 + 법선(부호 정규화) 양자화. 지우고 같은 자리에
 *  다시 그려도 같다(생성 순서·id ⛔ — 지시의 게이트). */
export function stableFaceKey(outer: V3[], normal: V3): string {
  let cx = 0, cy = 0, cz = 0
  for (const p of outer) { cx += p.x; cy += p.y; cz += p.z }
  const n = outer.length || 1
  let nn = norm3(normal)
  // 감김이 뒤집혀도 같은 열쇠 — 첫 0 아닌 성분을 양수로
  const lead = Math.abs(nn.x) > 1e-9 ? nn.x : Math.abs(nn.y) > 1e-9 ? nn.y : nn.z
  if (lead < 0) nn = mul3(nn, -1)
  const q = (v: number) => v.toFixed(4)
  return `${q(cx / n)},${q(cy / n)},${q(cz / n)}|${q(nn.x)},${q(nn.y)},${q(nn.z)}`
}

interface Line3 { o: V3; d: V3 }

/** 두 중심면의 교선 — 최소 노름 해 */
function planeIntersection(nA: V3, dA: number, nB: V3, dB: number): Line3 | null {
  const d = cross3(nA, nB)
  const L = len3(d)
  if (L < 1e-12) return null
  const dl = mul3(d, 1 / L)
  const ab = dot3(nA, nB)
  const den = 1 - ab * ab
  if (den < 1e-12) return null
  const ka = (dA - dB * ab) / den
  const kb = (dB - dA * ab) / den
  return { o: add3(mul3(nA, ka), mul3(nB, kb)), d: dl }
}

const distToLine = (p: V3, l: Line3): number => len3(cross3(sub3(p, l.o), l.d))

/** 면 평면 안 2D 사영 — 점-다각형 판정(T 검출)용 */
function planeBasis(o: V3, n: V3): { o: V3; e1: V3; e2: V3 } {
  const ref = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const e1 = norm3(cross3(n, ref))
  return { o, e1, e2: norm3(cross3(n, e1)) }
}
function inPoly2(p: V3, loop: V3[], b: { o: V3; e1: V3; e2: V3 }): boolean {
  const px = dot3(sub3(p, b.o), b.e1), py = dot3(sub3(p, b.o), b.e2)
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = dot3(sub3(loop[i]!, b.o), b.e1), yi = dot3(sub3(loop[i]!, b.o), b.e2)
    const xj = dot3(sub3(loop[j]!, b.o), b.e1), yj = dot3(sub3(loop[j]!, b.o), b.e2)
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 외곽 안이되 개구부 안은 아니다 — 줄기가 창(개구부)을 짚으면 몸이 없다 */
function inFace(p: V3, f: JointFaceIn): boolean {
  const b = planeBasis(f.outer[0]!, f.normal)
  if (!inPoly2(p, f.outer, b)) return false
  for (const h of f.holes) if (inPoly2(p, h, b)) return false
  return true
}

const centroidOf = (loop: V3[]): V3 => {
  let x = 0, y = 0, z = 0
  for (const p of loop) { x += p.x; y += p.y; z += p.z }
  const n = loop.length || 1
  return { x: x / n, y: y / n, z: z / n }
}

/** 접합 후보 모서리 — 교선에 나란하고(cleanup 안) 끊기지 않은 외곽 모서리. 여럿이면
 *  교선에 가장 가까운 것(동률이면 양자화 중점 열쇠 — 인덱스는 생성 순서 냄새가 있다). */
function jointEdgeOf(f: JointFaceIn, L: Line3, opt: JointOpt):
  { i: number; v0: V3; v1: V3; dist: number } | null {
  let best: { i: number; v0: V3; v1: V3; dist: number } | null = null
  const n = f.outer.length
  for (let i = 0; i < n; i++) {
    if (f.brokenEdges.has(i)) continue
    const v0 = f.outer[i]!, v1 = f.outer[(i + 1) % n]!
    const e = sub3(v1, v0)
    const eL = len3(e)
    if (eL < 1e-9) continue
    if (Math.abs(dot3(mul3(e, 1 / eL), L.d)) < opt.parDot) continue
    const d0 = distToLine(v0, L), d1 = distToLine(v1, L)
    const d = Math.max(d0, d1)
    if (d > opt.cleanupW) continue
    if (!best || d < best.dist - 1e-12
      || (Math.abs(d - best.dist) <= 1e-12 && vkey(centroidOf([v0, v1])) < vkey(centroidOf([best.v0, best.v1])))) {
      best = { i, v0, v1, dist: d }
    }
  }
  return best
}

/** (core, pri) 비교 — 코어가 윗자리(지시: 2단 정렬 키). 0 = 무승부(마이터의 자리). */
const cmpKey = (a: JointFaceIn, b: JointFaceIn): number =>
  a.core !== b.core ? a.core - b.core : a.pri - b.pri

interface PairEval {
  rec: JoinRec | null
  reject: string | null
  shiftsA: [string, { f: V3; b: V3 }][]
  shiftsB: [string, { f: V3; b: V3 }][]
}

/** 한 쌍을 평가한다 — 검출 · 승부 · 이동량. 순수 함수(캐시의 단위). */
function evalPair(A: JointFaceIn, B: JointFaceIn, opt: JointOpt): PairEval {
  const none = (reason: string): PairEval => ({ rec: null, reject: reason, shiftsA: [], shiftsB: [] })
  const nA = norm3(A.normal), nB = norm3(B.normal)
  if (Math.abs(dot3(nA, nB)) >= opt.parDot) return none('parallel')
  const L = planeIntersection(nA, dot3(nA, A.outer[0]!), nB, dot3(nB, B.outer[0]!))
  if (!L) return none('parallel')
  const eA = jointEdgeOf(A, L, opt)
  const eB = jointEdgeOf(B, L, opt)

  // ── L(끝 ↔ 끝) — 양쪽 다 모서리가 있고 교선 위 구간이 겹친다 ──────────────
  if (eA && eB) {
    const t = (v: V3) => dot3(v, L.d)
    const a0 = Math.min(t(eA.v0), t(eA.v1)), a1 = Math.max(t(eA.v0), t(eA.v1))
    const b0 = Math.min(t(eB.v0), t(eB.v1)), b1 = Math.max(t(eB.v0), t(eB.v1))
    if (Math.min(a1, b1) - Math.max(a0, b0) > 1e-9) {
      return joinL(A, B, eA, eB, nA, nB, L, opt)
    }
  }
  // ── T(끝 ↔ 경로) — 한쪽 끝 모서리의 중점이 상대 면 몸 안이다 ──────────────
  const tryT = (S: JointFaceIn, Bar: JointFaceIn, eS: { i: number; v0: V3; v1: V3 } | null,
    nS: V3, nBar: V3): PairEval | null => {
    if (!eS) return null
    const mid = mul3(add3(eS.v0, eS.v1), 0.5)
    // 양쪽 검사 — 경계 근처가 아니라 진짜 «경로 안»인가(εa = 치유 반경)
    const perp = norm3(cross3(nBar, L.d))
    const ea = opt.cleanupW * 0.5
    if (!inFace(add3(mid, mul3(perp, ea)), Bar) || !inFace(sub3(mid, mul3(perp, ea)), Bar)) return null
    return joinT(S, Bar, eS, nS, nBar, opt)
  }
  const tA = tryT(A, B, eA, nA, nB); if (tA) return tA
  const tB = tryT(B, A, eB, nB, nA); if (tB) return tB
  return none(eA || eB ? 'no-counterpart' : 'no-edge')
}

/** 바깥 방향(면 평면 안 · 교선에 수직 · 몸에서 멀어지는 쪽) */
function outwardOf(f: JointFaceIn, n: V3, L: Line3, edgeMid: V3): V3 {
  let u = norm3(cross3(n, L.d))
  if (dot3(u, sub3(centroidOf(f.outer), edgeMid)) > 0) u = mul3(u, -1)
  return u
}

/** 한 면의 두 표면을 목표 평면(상대의 오프셋 평면)으로 옮기는 이동량.
 *  반환 null = 이동이 상한(maxExtW)을 넘거나 퇴화(연장 방향이 목표와 나란). */
function shiftsToward(
  f: JointFaceIn, n: V3, u: V3, edge: { v0: V3; v1: V3 },
  target: { n: V3; base: V3; off: number }, own: number, opt: JointOpt,
): [string, V3][] | null {
  const den = dot3(target.n, u)
  if (Math.abs(den) < 1e-9) return null
  const c = dot3(target.n, target.base) + target.off
  const out: [string, V3][] = []
  for (const v of [edge.v0, edge.v1]) {
    const p = add3(v, mul3(n, own))
    const s = (c - dot3(target.n, p)) / den
    if (Math.abs(s) > opt.maxExtW) return null
    out.push([vkey(v), mul3(u, s)])
  }
  return out
}

function joinL(
  A: JointFaceIn, B: JointFaceIn,
  eA: { i: number; v0: V3; v1: V3 }, eB: { i: number; v0: V3; v1: V3 },
  nA: V3, nB: V3, L: Line3, opt: JointOpt,
): PairEval {
  const none = (reason: string): PairEval => ({ rec: null, reject: reason, shiftsA: [], shiftsB: [] })
  const uA = outwardOf(A, nA, L, mul3(add3(eA.v0, eA.v1), 0.5))
  const uB = outwardOf(B, nB, L, mul3(add3(eB.v0, eB.v1), 0.5))
  const dA = mul3(uA, -1), dB = mul3(uB, -1)
  const hA = dot3(nA, dB)   // A의 어느 표면이 B 몸 쪽(안쪽)인가
  const hB = dot3(nB, dA)
  if (Math.abs(hA) < 1e-6 || Math.abs(hB) < 1e-6) return none('degenerate')
  const innerA = hA > 0 ? A.frontW : A.backW, outerA = hA > 0 ? A.backW : A.frontW
  const innerB = hB > 0 ? B.frontW : B.backW, outerB = hB > 0 ? B.backW : B.frontW
  const cmp = cmpKey(A, B)
  // 표면별 목표 오프셋 — 무승부: 같은 쪽끼리(마이터가 결과로 나온다) · 승부: 이긴 쪽은
  // 진 쪽 «바깥»(관통), 진 쪽은 이긴 쪽 «안쪽»(버트)
  const tgtA = (own: number): number => cmp === 0
    ? (own === innerA ? innerB : outerB)
    : cmp > 0 ? outerB : innerB
  const tgtB = (own: number): number => cmp === 0
    ? (own === innerB ? innerA : outerA)
    : cmp < 0 ? outerA : innerA
  const sAf = shiftsToward(A, nA, uA, eA, { n: nB, base: B.outer[0]!, off: tgtA(A.frontW) }, A.frontW, opt)
  const sAb = shiftsToward(A, nA, uA, eA, { n: nB, base: B.outer[0]!, off: tgtA(A.backW) }, A.backW, opt)
  const sBf = shiftsToward(B, nB, uB, eB, { n: nA, base: A.outer[0]!, off: tgtB(B.frontW) }, B.frontW, opt)
  const sBb = shiftsToward(B, nB, uB, eB, { n: nA, base: A.outer[0]!, off: tgtB(B.backW) }, B.backW, opt)
  if (!sAf || !sAb || !sBf || !sBb) return none('max-extension')
  const merge = (sf: [string, V3][], sb: [string, V3][]): [string, { f: V3; b: V3 }][] =>
    sf.map(([k, f], i) => [k, { f, b: sb[i]![1] }])
  // 계단 표본 — 코너에서 두 몸 «바깥» 사각 기둥(수리 전에 어느 몸에도 안 드는 그 기둥).
  // 기준점은 모서리 끝·중점을 교선 위로 사영한 점이다(치유로 붙는 판도 같은 자로 재게).
  const proj = (v: V3) => add3(L.o, mul3(L.d, dot3(sub3(v, L.o), L.d)))
  const probe = [eA.v0, mul3(add3(eA.v0, eA.v1), 0.5), eA.v1].map(v => {
    const base = proj(v)
    const va = mul3(nA, outerA), vb = mul3(nB, outerB)
    return [base, add3(base, vb), add3(add3(base, vb), va), add3(base, va)]
  })
  return {
    rec: {
      kind: 'L', a: A.id, b: B.id, edgeA: eA.i, edgeB: eB.i,
      strokeA: A.edgeStrokes[eA.i] ?? null, strokeB: B.edgeStrokes[eB.i] ?? null,
      tie: cmp === 0, winner: cmp === 0 ? null : cmp > 0 ? A.id : B.id,
      extA: { front: dot3(sAf[0]![1], uA), back: dot3(sAb[0]![1], uA) },
      extB: { front: dot3(sBf[0]![1], uB), back: dot3(sBb[0]![1], uB) },
      probe,
    },
    reject: null,
    shiftsA: merge(sAf, sAb),
    shiftsB: merge(sBf, sBb),
  }
}

function joinT(
  S: JointFaceIn, Bar: JointFaceIn, eS: { i: number; v0: V3; v1: V3 },
  nS: V3, nBar: V3, opt: JointOpt,
): PairEval {
  const none = (reason: string): PairEval => ({ rec: null, reject: reason, shiftsA: [], shiftsB: [] })
  const L = planeIntersection(nS, dot3(nS, S.outer[0]!), nBar, dot3(nBar, Bar.outer[0]!))
  if (!L) return none('parallel')
  const uS = outwardOf(S, nS, L, mul3(add3(eS.v0, eS.v1), 0.5))
  const dS = mul3(uS, -1)
  const h = dot3(nBar, dS)   // 줄기 몸이 막대 평면의 어느 쪽인가
  if (Math.abs(h) < 1e-6) return none('degenerate')
  const near = h > 0 ? Bar.frontW : Bar.backW
  const far = h > 0 ? Bar.backW : Bar.frontW
  const cmp = cmpKey(S, Bar)
  // 줄기가 이기면 관통(먼 평면 — 지시: 「내벽 구조체가 외벽 마감을 뚫고 외벽 구조체에서
  // 멈춘다」의 단일 층 판: 코어를 이기면 끝까지, 못 이기면 가까운 면에서) · 지면·비기면 버트
  const off = cmp > 0 ? far : near
  const sf = shiftsToward(S, nS, uS, eS, { n: nBar, base: Bar.outer[0]!, off }, S.frontW, opt)
  const sb = shiftsToward(S, nS, uS, eS, { n: nBar, base: Bar.outer[0]!, off }, S.backW, opt)
  if (!sf || !sb) return none('max-extension')
  return {
    rec: {
      kind: 'T', a: S.id, b: Bar.id, edgeA: eS.i, edgeB: null,
      strokeA: S.edgeStrokes[eS.i] ?? null, strokeB: null,
      tie: cmp === 0, winner: cmp > 0 ? S.id : cmp < 0 ? Bar.id : null,
      extA: { front: dot3(sf[0]![1], uS), back: dot3(sb[0]![1], uS) },
      extB: null, probe: null,
    },
    reject: null,
    shiftsA: sf.map(([k, f], i) => [k, { f, b: sb[i]![1] }]),
    shiftsB: [],
  }
}

/** 쌍 서명 — 이 쌍의 결과를 정하는 입력 전부의 양자화(1링 캐시의 자물쇠) */
function sigOfFace(f: JointFaceIn): string {
  const q = (v: number) => v.toFixed(6)
  const pts = f.outer.map(p => `${q(p.x)},${q(p.y)},${q(p.z)}`).join(';')
  return `${pts}|${q(f.frontW)},${q(f.backW)}|${f.core},${f.pri}|${[...f.brokenEdges].sort((a, b) => a - b).join(',')}`
}

export type JointCache = Map<string, { sig: string; ev: PairEval }>

/** 접합 전부 — 차례는 안정 열쇠 정렬(입력 차례 무관 · 생성 순서 ⛔). 한 모서리는 한
 *  접합만 가진다(먼저 선 접합이 이긴다 — 결정론적 차례라 «먼저»도 안정적이다). */
export function computeJoints(
  faces: JointFaceIn[], opt: JointOpt, cache?: JointCache,
): JointsOut {
  const keyed = faces
    .map(f => ({ f, k: stableFaceKey(f.outer, f.normal) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
  const shifts = new Map<number, Map<string, { f: V3; b: V3 }>>()
  const joins: JoinRec[] = []
  const rejects: { a: number; b: number; reason: string }[] = []
  const usedEdge = new Set<string>()
  const usedVert = new Set<string>()
  const touched = new Set<string>()
  let computed = 0, cached = 0
  const recomputedFaces = new Set<number>()
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const A = keyed[i]!.f, B = keyed[j]!.f
      const pairKey = `${keyed[i]!.k}|${keyed[j]!.k}`
      const sig = `${sigOfFace(A)}||${sigOfFace(B)}`
      touched.add(pairKey)
      let ev = cache?.get(pairKey)?.sig === sig ? cache!.get(pairKey)!.ev : null
      if (ev) { cached++ } else {
        ev = evalPair(A, B, opt)
        computed++
        if (ev.rec) { recomputedFaces.add(A.id); recomputedFaces.add(B.id) }
        cache?.set(pairKey, { sig, ev })
      }
      if (!ev.rec) {
        if (ev.reject && ev.reject !== 'parallel') rejects.push({ a: A.id, b: B.id, reason: ev.reject })
        continue
      }
      // 한 모서리·한 정점은 한 접합만 — 세 벽이 한 구석에 몰리면 안정 차례의 첫 쌍이 이긴다
      const rec = ev.rec
      const ekA = `${rec.a}:${rec.edgeA}`
      const ekB = rec.edgeB !== null ? `${rec.b}:${rec.edgeB}` : null
      const verts = [...ev.shiftsA.map(([k]) => `${rec.a}:${k}`), ...ev.shiftsB.map(([k]) => `${rec.b}:${k}`)]
      if (usedEdge.has(ekA) || (ekB && usedEdge.has(ekB)) || verts.some(v => usedVert.has(v))) {
        rejects.push({ a: A.id, b: B.id, reason: 'edge-used' })
        continue
      }
      usedEdge.add(ekA)
      if (ekB) usedEdge.add(ekB)
      for (const v of verts) usedVert.add(v)
      const put = (fid: number, entries: [string, { f: V3; b: V3 }][]) => {
        if (entries.length === 0) return
        const m = shifts.get(fid) ?? new Map<string, { f: V3; b: V3 }>()
        for (const [k, v] of entries) m.set(k, v)
        shifts.set(fid, m)
      }
      put(rec.a, ev.shiftsA)
      put(rec.b, ev.shiftsB)
      joins.push(rec)
    }
  }
  // 이번 회차에 안 닿은 캐시 행은 걷는다(면이 움직이면 열쇠가 바뀌어 옛 행이 남는다)
  if (cache) for (const k of [...cache.keys()]) if (!touched.has(k)) cache.delete(k)
  return { shifts, joins, rejects, stats: { computed, cached, recomputedFaces: [...recomputedFaces].sort((a, b) => a - b) } }
}
