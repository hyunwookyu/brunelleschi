// 재료 표현(web2-49) — **벽돌은 그림이 아니라 숫자다.**
//
// 입면·투시에서 «그 면이 무슨 재료인가»를 보이게 하는 것. 도면 해칭(단면 규격 기호 —
// 화면 고정, ISO 128)과 **다른 물건**이다: 벽돌은 벽에 붙어 있고 원근을 받아야 하므로
// **면 고정**이고, 이미지가 아니라 **절차**다 — 190×57에 줄눈 10을 축척대로 그리면 맞고,
// 이미지를 붙이면 줌할 때 안 맞는다(지시 문면).
//
// 생성 좌표계: 면 평면의 (u,v)를 **mm 단위**로 놓는다 — 치수가 리터럴이 되고,
// 세계 좌표 환산은 `mmPerUnit`(lift.scaleOf의 파생) 하나뿐이다(#54).
// **축척 미정이면 안 그린다** — 좌표를 임의로 짓지 않는다(47 스케일바의 선례).
//
// 불규칙(석재 켜·나무 결)은 **시드**다: `rng32(face.id)` — 같은 면은 다시 그려도 같고,
// 다른 면은 같은 재료라도 다르다(§5 재현성 · Math.random ⛔).
//
// 무늬는 저장하지 않는다(원칙 b — 면의 함수. 픽셀로 구우면 경계 변화를 못 따라간다).
// 저장하는 것은 `Face.rep = { m, s }`(사람의 결정 — 어느 재료·어느 쪽)뿐이다.

import type { V3 } from './vec'
import { type Pt, pt, add3, mul3, cross3, norm3, len3 } from './vec'
import type { ResolvedFace } from './face'
import { clipLine } from './hatch'
import { rng32 } from './material'
import { C } from './constants'

export type RepId = 'brick' | 'stone' | 'wood' | 'tile' | 'roof' | 'conc'
export const REP_IDS: RepId[] = ['brick', 'stone', 'wood', 'tile', 'roof', 'conc']
export const REP_NAMES: Record<RepId, string> = {
  brick: '벽돌', stone: '석재', wood: '목재', tile: '타일', roof: '기와', conc: '콘크리트',
}
export const isRepId = (v: unknown): v is RepId =>
  typeof v === 'string' && (REP_IDS as string[]).includes(v)

/** 순환(손통 「표현」 줄) — 없음→벽돌→…→콘크리트→없음. cls·mat 순환과 같은 문법. */
export const cycleRep = (cur: RepId | undefined): RepId | undefined => {
  if (cur === undefined) return REP_IDS[0]
  const i = REP_IDS.indexOf(cur)
  return i + 1 < REP_IDS.length ? REP_IDS[i + 1] : undefined
}

export interface Seg3 { a: V3; b: V3 }

/** **밀도 하한(LOD)의 규칙 그 자체** — 이 무늬 계열이 이 투영 밀도에서 보이는가.
 *  한 자리(#54): 렌더(gateRep)와 팔이 **같은 함수**를 부른다. 작은 축척에서 재료 표현을
 *  생략하는 제도 관례의 코드판이다 — 간격의 투영 px가 문 아래면 그 계열을 숨긴다. */
export const repFamilyVisible = (stepMm: number, pxPerMm: number): boolean =>
  stepMm * pxPerMm >= C.REP_MIN_PX

/** 두 계열의 보임 — **부선은 주선 없이 못 선다**(계층). 벽돌의 켜(주선 67mm)가 줄눈
 *  (부선 200mm)보다 촘촘하므로, 계열별 문만 보면 «켜는 사라지고 줄눈만 남는» 대역이
 *  생긴다 — 켜 없는 수직 줄눈은 벽돌로 안 읽힌다(말뚝처럼 보인다). 무늬의 뼈대가
 *  사라지면 세부도 같이 접는다. */
export const repVisibleFamilies = (
  majorStepMm: number, minorStepMm: number, pxPerMm: number,
): { major: boolean; minor: boolean } => {
  const major = repFamilyVisible(majorStepMm, pxPerMm)
  return { major, minor: major && repFamilyVisible(minorStepMm, pxPerMm) }
}

export interface RepSegs {
  /** 주선 — 켜·격자(무늬의 뼈대) */
  major: Seg3[]
  /** 부선 — 수직 줄눈·결(주선보다 먼저 사라져도 되는 세부) */
  minor: Seg3[]
  /** 계열별 특성 간격 mm — 렌더의 밀도 하한(LOD) 판정이 이 값에 축척·투영을 곱한다 */
  majorStepMm: number
  minorStepMm: number
}

/** 무늬 기저 — **원점·방향의 자동 규칙**(⚑ — 조절 UI는 이번에 안 만든다. 자동판을
 *  세우고 빈도를 재서 보고하고 멈춘다 — 지시 문면).
 *
 *  · 가로축 u = 평면 안의 수평(up × n) — 벽돌 켜는 수평으로 쌓인다.
 *  · 세로축 v = n × u — 평면 안에서 u에 수직. v가 아래를 보면 뒤집어 «위»로 세운다
 *    (켜는 바닥에서 위로 센다).
 *  · **퇴화**: 슬라브(법선이 수직)는 «평면 안의 수평»이 온 방향이라 규칙이 못 고른다 —
 *    세계 Z, 그마저 퇴화면 X로 대체하고 `degenerate`로 표시한다(⚑ 측정이 이 표를 센다).
 *  · 위상 원점 = 면 외곽의 (u,v) 최소 모서리 — 무늬가 면의 좌하단에서 시작한다. */
export function repBasis(rf: ResolvedFace): {
  origin: V3; u: V3; v: V3; degenerate: boolean
} {
  const n = norm3(rf.normal)
  let u = cross3({ x: 0, y: 1, z: 0 }, n)
  const degenerate = len3(u) < 1e-6
  if (degenerate) {
    u = cross3(n, { x: 0, y: 0, z: 1 })
    if (len3(u) < 1e-6) u = cross3(n, { x: 1, y: 0, z: 0 })
  }
  u = norm3(u)
  let v = norm3(cross3(n, u))
  if (v.y < -1e-9) { v = mul3(v, -1); u = mul3(u, -1) }  // «위»로 — 손대칭 유지(u도 뒤집는다)
  return { origin: rf.outer[0]!, u, v, degenerate }
}

/** 면 외곽·개구부를 (u,v) **mm** 좌표 루프로 — 반환에 mm 사각(min/max)도 얹는다. */
function loopsMm(rf: ResolvedFace, mmPerUnit: number): {
  loops: Pt[][]; u0: number; v0: number; u1: number; v1: number
  basis: ReturnType<typeof repBasis>
} | null {
  const basis = repBasis(rf)
  // `face.planeBasis`는 자기 기저(y-up 규칙 없음)를 쓴다 — 여기서는 «우리» 기저(u,v)로
  // 직접 사영한다(#54: 기저의 출처가 둘이면 방향 규칙이 갈린다).
  const proj = (P: V3): Pt => {
    const dx = P.x - basis.origin.x, dy = P.y - basis.origin.y, dz = P.z - basis.origin.z
    return pt(
      (dx * basis.u.x + dy * basis.u.y + dz * basis.u.z) * mmPerUnit,
      (dx * basis.v.x + dy * basis.v.y + dz * basis.v.z) * mmPerUnit,
    )
  }
  const outer = rf.outer.map(proj)
  if (outer.length < 3) return null
  const loops = [outer, ...rf.holes.map(h => h.map(proj))]
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
  for (const p of outer) {
    if (p.x < u0) u0 = p.x
    if (p.y < v0) v0 = p.y
    if (p.x > u1) u1 = p.x
    if (p.y > v1) v1 = p.y
  }
  return { loops, u0, v0, u1, v1, basis }
}

/** (u,v) mm → 3D 세계 좌표 */
const lift3 = (
  b: { origin: V3; u: V3; v: V3 }, mmPerUnit: number,
) => (p: Pt): V3 =>
  add3(add3(b.origin, mul3(b.u, p.x / mmPerUnit)), mul3(b.v, p.y / mmPerUnit))

/** 가로선 y=y0 를 다각형으로 절단해 mm 선분들로 */
function hLine(loops: Pt[][], y: number): { a: Pt; b: Pt }[] {
  return clipLine(pt(0, y), pt(1, 0), loops).map(([t0, t1]) => ({ a: pt(t0, y), b: pt(t1, y) }))
}

/** 세로선 x=x0 를 다각형으로 절단하고 [yLo,yHi] 띠로 자른 mm 선분들 */
function vLineBand(loops: Pt[][], x: number, yLo: number, yHi: number): { a: Pt; b: Pt }[] {
  const out: { a: Pt; b: Pt }[] = []
  for (const [t0, t1] of clipLine(pt(x, 0), pt(0, 1), loops)) {
    const a = Math.max(t0, yLo), b = Math.min(t1, yHi)
    if (b - a > 1e-9) out.push({ a: pt(x, a), b: pt(x, b) })
  }
  return out
}

/** 켜(수평 띠) + 켜마다 수직 줄눈 — 벽돌·기와·석재가 공유하는 뼈대.
 *  `courseAt(k)`가 켜 높이를, `jointsIn(k, u0, u1)`이 그 켜의 수직 줄눈 x들을 낸다. */
function coursesAndJoints(
  loops: Pt[][], box: { u0: number; v0: number; u1: number; v1: number },
  courseAt: (k: number) => number,
  jointsIn: (k: number, u0: number, u1: number) => number[],
): { major: { a: Pt; b: Pt }[]; minor: { a: Pt; b: Pt }[] } {
  const major: { a: Pt; b: Pt }[] = []
  const minor: { a: Pt; b: Pt }[] = []
  let y = box.v0, k = 0
  // 상한: 무늬 계열 하나가 1만 켜를 넘으면 그 면은 축척이 틀린 것이다 — 조용히 얼지 않는다
  while (k < 10000) {
    const h = courseAt(k)
    const yTop = y + h
    if (yTop < box.v1 - 1e-9) major.push(...hLine(loops, yTop))
    for (const x of jointsIn(k, box.u0, box.u1)) {
      minor.push(...vLineBand(loops, x, y, Math.min(yTop, box.v1)))
    }
    y = yTop
    k++
    if (y >= box.v1 - 1e-9) break
  }
  return { major, minor }
}

/** 면 하나의 재료 표현 — 3D 선분(주/부) 목록. 축척 미정(mmPerUnit ≤ 0·null)이면 빈 결과.
 *  결정론: 같은 (면 기하, 재료, 시드)에서 언제나 같다 — 시드는 호출자가 face.id를 준다. */
export function repSegments(
  rf: ResolvedFace, m: RepId, mmPerUnit: number | null, seed: number,
): RepSegs {
  const empty: RepSegs = { major: [], minor: [], majorStepMm: 0, minorStepMm: 0 }
  if (!mmPerUnit || mmPerUnit <= 0) return empty
  const L = loopsMm(rf, mmPerUnit)
  if (!L) return empty
  const { loops } = L
  const basis = L.basis
  const box = { u0: L.u0, v0: L.v0, u1: L.u1, v1: L.v1 }
  const up = lift3(basis, mmPerUnit)
  const done = (r: { major: { a: Pt; b: Pt }[]; minor: { a: Pt; b: Pt }[] },
    majorStepMm: number, minorStepMm: number): RepSegs => ({
    major: r.major.map(s => ({ a: up(s.a), b: up(s.b) })),
    minor: r.minor.map(s => ({ a: up(s.a), b: up(s.b) })),
    majorStepMm, minorStepMm,
  })

  if (m === 'brick') {
    const cw = C.REP_BRICK_MODULE_W_MM, ch = C.REP_BRICK_COURSE_MM
    const r = coursesAndJoints(loops, box, () => ch, (k, u0, u1) => {
      const off = (k % 2) * (cw / 2)                    // 막힌줄눈 — 켜마다 반절
      const xs: number[] = []
      for (let x = u0 + off; x < u1; x += cw) if (x > u0 + 1e-9) xs.push(x)
      return xs
    })
    return done(r, ch, cw)
  }
  if (m === 'roof') {
    const cw = C.REP_ROOF_TILE_W_MM, ch = C.REP_ROOF_COURSE_MM
    const r = coursesAndJoints(loops, box, () => ch, (k, u0, u1) => {
      const off = (k % 2) * (cw / 2)
      const xs: number[] = []
      for (let x = u0 + off; x < u1; x += cw) if (x > u0 + 1e-9) xs.push(x)
      return xs
    })
    return done(r, ch, cw)
  }
  if (m === 'stone') {
    const [h0, h1] = C.REP_STONE_COURSE_MM as readonly number[] as [number, number]
    const [j0, j1] = C.REP_STONE_JOINT_MM as readonly number[] as [number, number]
    const rnd = rng32(seed)
    // 켜 높이·줄눈 자리를 시드에서 미리 뽑는다 — 절단과 얽히지 않는 결정론
    const heights: number[] = []
    const jointRows: number[][] = []
    let acc = 0
    while (acc < box.v1 - box.v0 + h1 && heights.length < 10000) {
      const h = h0 + rnd() * (h1 - h0)
      heights.push(h)
      const xs: number[] = []
      let x = box.u0 + rnd() * (j1 - j0)
      while (x < box.u1) { xs.push(x); x += j0 + rnd() * (j1 - j0) }
      jointRows.push(xs)
      acc += h
    }
    const r = coursesAndJoints(loops, box, k => heights[k] ?? h1, k => jointRows[k] ?? [])
    return done(r, (h0 + h1) / 2, (j0 + j1) / 2)
  }
  if (m === 'wood') {
    const pw = C.REP_WOOD_PLANK_MM
    const rnd = rng32(seed)
    const major: { a: Pt; b: Pt }[] = []
    const minor: { a: Pt; b: Pt }[] = []
    let k = 0
    for (let y = box.v0 + pw; y < box.v1 - 1e-9 && k < 10000; y += pw, k++) {
      major.push(...hLine(loops, y))
    }
    // 결 — 판마다 시드 대시 1~2개(가로 · 판 안 임의 y · 길이 300~900)
    k = 0
    for (let y = box.v0; y < box.v1 - 1e-9 && k < 10000; y += pw, k++) {
      const nGrain = 1 + Math.floor(rnd() * 2)
      for (let g = 0; g < nGrain; g++) {
        const gy = y + (0.2 + 0.6 * rnd()) * Math.min(pw, box.v1 - y)
        const gx = box.u0 + rnd() * (box.u1 - box.u0)
        const gl = 300 + rnd() * 600
        for (const [t0, t1] of clipLine(pt(0, gy), pt(1, 0), loops)) {
          const a = Math.max(t0, gx), b = Math.min(t1, gx + gl)
          if (b - a > 1e-9) minor.push({ a: pt(a, gy), b: pt(b, gy) })
        }
      }
    }
    return done({ major, minor }, pw, pw)
  }
  if (m === 'tile') {
    const t = C.REP_TILE_MM
    const major: { a: Pt; b: Pt }[] = []
    let k = 0
    for (let y = box.v0 + t; y < box.v1 - 1e-9 && k < 10000; y += t, k++) major.push(...hLine(loops, y))
    k = 0
    for (let x = box.u0 + t; x < box.u1 - 1e-9 && k < 10000; x += t, k++) {
      major.push(...vLineBand(loops, x, box.v0, box.v1))
    }
    return done({ major, minor: [] }, t, t)
  }
  // conc — 거푸집 판 격자(가로 판높이 1200 · 세로 판폭 600). 폼타이 자국은 안 만든다
  // (지시 「하지 말 것」의 정신 — 광원 없는 장식·죽은 데이터를 안 늘린다).
  const pwv = C.REP_CONC_PANEL_W_MM, phv = C.REP_CONC_PANEL_H_MM
  const major: { a: Pt; b: Pt }[] = []
  let k = 0
  for (let y = box.v0 + phv; y < box.v1 - 1e-9 && k < 10000; y += phv, k++) major.push(...hLine(loops, y))
  k = 0
  for (let x = box.u0 + pwv; x < box.u1 - 1e-9 && k < 10000; x += pwv, k++) {
    major.push(...vLineBand(loops, x, box.v0, box.v1))
  }
  return done({ major, minor: [] }, Math.min(phv, pwv), Math.min(phv, pwv))
}
