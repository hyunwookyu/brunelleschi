// 실(web2-47 47-4) — **벽으로 둘러싸인 닫힌 영역**. 평면에서 찾는 것이라 면 찾기와 같은
// 기제다(지시 문면): 벽 면들의 **바닥 자취**(밑변을 지면에 내린 2D 선분)로 평면 그래프를
// 세우고, 반변(half-edge) 회전 규칙으로 최소 닫힌 둘레들을 뽑는다 — 유계인 것이 실이다.
//
// ⚠ 이 갈래는 ⚑다(지시: 실 인식이 안 서면 거기서 멈춘다 — 47-1~3만으로 한 라운드).
// 그래서 이 모듈은 **측정이 먼저다**: room47 팔이 «찾아야 할 실 몇 / 헛것 몇»을 내고,
// 그 값이 서야 연결·다이어그램이 따라온다.
//
// 연결(문): 두 실이 같은 벽 자취를 나눠 갖고 그 벽에 개구부(구멍)가 있으면 잇는다.

import type { ResolvedFace } from './face'
import type { Face } from './types'
import { classOf } from './paint'
import { C } from './constants'

export interface Room {
  /** 둘레(지면 2D — x,z) */
  poly: { x: number; z: number }[]
  /** 넓이(세계 단위² — 신발끈 · 양수) */
  areaU2: number
  /** 둘레를 이룬 벽 면 id들(근거 — #61) */
  wallIds: number[]
}

export interface RoomGraph {
  rooms: Room[]
  /** 연결 — 개구부가 잇는 두 실(rooms 인덱스) */
  links: { a: number; b: number; wallId: number }[]
}

interface Seg2 { a: { x: number; z: number }; b: { x: number; z: number }; wallId: number; hasHole: boolean }

/** 벽 면의 바닥 자취 — 밑변(y가 최저 대역인 정점들 사이의 변)을 지면 2D로. */
function baseTrace(rf: ResolvedFace): { a: { x: number; z: number }; b: { x: number; z: number } } | null {
  let lo = Infinity
  for (const p of rf.outer) if (p.y < lo) lo = p.y
  const size = rf.outer.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)), 1)
  const tol = 1e-6 * size + 1e-9
  const base = rf.outer.filter(p => p.y - lo < Math.max(tol, 0.02 * size))
  if (base.length < 2) return null
  // 밑변 = 바닥 대역 정점들 중 가장 먼 두 점(벽이 사각이면 그 둘이 밑변이다)
  let bi = 0, bj = 1, bd = -1
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
    const d = (base[i]!.x - base[j]!.x) ** 2 + (base[i]!.z - base[j]!.z) ** 2
    if (d > bd) { bd = d; bi = i; bj = j }
  }
  if (!(bd > tol * tol)) return null
  return { a: { x: base[bi]!.x, z: base[bi]!.z }, b: { x: base[bj]!.x, z: base[bj]!.z } }
}

/** 실 찾기 — 벽들의 바닥 자취로 최소 닫힌 둘레(유계 면)를 뽑는다. */
/** D-3 위약(1차 [M9]) — 회전 규칙을 첫 판(idx−1)으로 되돌린다. 팔 전용. */
let rotForTest: 1 | -1 = 1
export function setRoomRotForTest(v: 1 | -1): void { rotForTest = v }

export function findRooms(faces: ResolvedFace[], docFaces: Face[]): RoomGraph {
  const walls = faces.filter(rf => classOf(docFaces.find(f => f.id === rf.id), rf, C.FACE_CLASS_DEG) === 'wall')
  const segs: Seg2[] = []
  let size = 1
  for (const w of walls) {
    const t = baseTrace(w)
    if (!t) continue
    segs.push({ ...t, wallId: w.id, hasHole: w.holes.length > 0 })
    for (const p of w.outer) size = Math.max(size, Math.abs(p.x), Math.abs(p.z))
  }
  const tol = 1e-4 * size
  // 정점 병합
  const verts: { x: number; z: number }[] = []
  const vid = (p: { x: number; z: number }): number => {
    for (let i = 0; i < verts.length; i++) {
      if ((verts[i]!.x - p.x) ** 2 + (verts[i]!.z - p.z) ** 2 < tol * tol) return i
    }
    verts.push({ ...p }); return verts.length - 1
  }
  interface He { from: number; to: number; wallId: number; twin: number; next: number; used: boolean }
  const hes: He[] = []
  for (const sg of segs) {
    const i = vid(sg.a), j = vid(sg.b)
    if (i === j) continue
    const k = hes.length
    hes.push({ from: i, to: j, wallId: sg.wallId, twin: k + 1, next: -1, used: false })
    hes.push({ from: j, to: i, wallId: sg.wallId, twin: k, next: -1, used: false })
  }
  // 각 정점에서 나가는 반변을 각도로 정렬 — next(he) = he.twin의 시계방향 다음 나감
  const outAt: number[][] = verts.map(() => [])
  hes.forEach((h, i) => outAt[h.from]!.push(i))
  const angOf = (h: He): number => Math.atan2(verts[h.to]!.z - verts[h.from]!.z, verts[h.to]!.x - verts[h.from]!.x)
  for (const list of outAt) list.sort((x, y) => angOf(hes[x]!) - angOf(hes[y]!))
  for (const h of hes) {
    const list = outAt[h.to]!
    const back = hes[h.twin]!
    const idx = list.indexOf(h.twin)
    // 반시계 다음(큰 각 쪽으로 한 칸) — 최소 회전 규칙(첫 판 idx−1은 공유 벽을 건너뛰어
    // 바깥 둘레 안쪽을 한 덩어리로 감았다 — 실측 24로 잡았다)
    h.next = list[(idx + rotForTest + list.length) % list.length]!
    void back
  }
  const rooms: Room[] = []
  for (let i = 0; i < hes.length; i++) {
    if (hes[i]!.used) continue
    const loop: number[] = []
    let cur = i, guard = 0
    while (!hes[cur]!.used && guard++ < hes.length + 2) {
      hes[cur]!.used = true
      loop.push(cur)
      cur = hes[cur]!.next
      if (cur === i) break
    }
    if (cur !== i || loop.length < 3) continue
    // 신발끈(x–z 평면) — 음수 = 유계(시계방향 규칙에서), 부호로 바깥 면을 거른다
    let s2 = 0
    for (const k of loop) {
      const a = verts[hes[k]!.from]!, b = verts[hes[k]!.to]!
      s2 += a.x * b.z - b.x * a.z
    }
    const area = s2 / 2
    if (!(Math.abs(area) > tol * tol)) continue
    if (area > 0) continue                         // 바깥 둘레(방향 규칙의 귀결) — 실이 아니다
    rooms.push({
      poly: loop.map(k => ({ ...verts[hes[k]!.from]! })),
      areaU2: Math.abs(area),
      wallIds: [...new Set(loop.map(k => hes[k]!.wallId))],
    })
  }
  // 연결 — 두 실이 나눠 갖는 벽에 개구부가 있으면 잇는다
  const holeWall = new Set(segs.filter(sg => sg.hasHole).map(sg => sg.wallId))
  const links: RoomGraph['links'] = []
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    const shared = rooms[a]!.wallIds.filter(w => rooms[b]!.wallIds.includes(w))
    for (const w of shared) if (holeWall.has(w)) links.push({ a, b, wallId: w })
  }
  return { rooms, links }
}
