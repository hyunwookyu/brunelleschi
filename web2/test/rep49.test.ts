// web2-49 — 재료 표현의 거동 팔.
//
// 순수 기하(치수·개구부·기저·시드)는 손으로 지은 ResolvedFace로 재고(생성기가 받는 것이
// 그 모양 전부다), 흐름(순환·쪽·저장·실행취소)은 세션 픽스처로 잰다.
//
// ⚠ #5 표기: 「생성 간격 == 상수」 류는 생성기 구성의 귀결이라 **배선 확인**으로 적는다.
// 측정의 몫은 (a) mm↔세계 환산이 축척을 실제로 지나는가(축척을 바꿔 다시 잰다)
// (b) 시드·쪽·저장이 갈리는 자리에서 실제로 갈리는가다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { setDimension, cycleFaceRep, toggleFaceAt, undo, redo } from '../src/app/state'
import { repSegments, repBasis, cycleRep, isRepId, REP_IDS } from '../src/core/matrep'
import { paintSideAt, sideOfPlane, facePlane } from '../src/core/paint'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import type { ResolvedFace } from '../src/core/face'
import type { V3 } from '../src/core/vec'
import { C } from '../src/core/constants'

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })

/** 손으로 지은 면 — xy 평면(법선 +z)의 벽. 단위: 세계 1 = 1로 두고 mmPerUnit로 조정. */
function wallFace(w: number, h: number, holes: V3[][] = []): ResolvedFace {
  return {
    id: 1,
    outer: [v3(0, 0, 0), v3(w, 0, 0), v3(w, h, 0), v3(0, h, 0)],
    holes,
    normal: v3(0, 0, 1),
    flat: 0,
    tris: [],
  }
}

/** 바닥(슬라브 — 법선 수직·y-up) */
function slabFace(w: number, d: number): ResolvedFace {
  return {
    id: 2,
    outer: [v3(0, 0, 0), v3(w, 0, 0), v3(w, 0, d), v3(0, 0, d)],
    holes: [],
    normal: v3(0, 1, 0),
    flat: 0,
    tris: [],
  }
}

describe('순환·판별', () => {
  it('없음→벽돌→…→금속→없음(52 — 여덟) · isRepId는 무늬 여섯만', () => {
    // ⚠ web2-52가 순환을 여덟로 넓혔다(유리·금속 — 단색 재료). 무늬 판별(isRepId)은
    // 여전히 여섯이다 — 생성기가 받는 집합과 순환 집합이 갈렸다(mats52.test가 정본).
    const seen: (string | undefined)[] = []
    let cur: ReturnType<typeof cycleRep> = undefined
    for (let i = 0; i <= REP_IDS.length + 2; i++) { cur = cycleRep(cur); seen.push(cur) }
    expect(seen).toEqual([...REP_IDS, 'glass', 'metal', undefined])
    expect(isRepId('brick')).toBe(true)
    expect(isRepId('glass')).toBe(false)     // 무늬 없음 — repSegments의 집합 밖(단색)
  })
})

describe('실치수 — 벽돌 켜가 축척을 지나 67mm다', () => {
  // 세계 1단위 = 100mm 라고 하자(mmPerUnit=100). 3m × 2m 벽 = 세계 30 × 20.
  it('켜 간격 × mmPerUnit == 67 (배선 확인) · 축척을 바꾸면 세계 간격이 따라 바뀐다 (측정)', () => {
    const f = wallFace(30, 20)
    const a = repSegments(f, 'brick', 100, f.id)
    expect(a.major.length).toBeGreaterThan(10)
    // 켜 선들의 y(세계) — 이웃 간격
    const ys = [...new Set(a.major.map(s => s.a.y.toFixed(6)))].map(Number).sort((p, q) => p - q)
    for (let i = 1; i < ys.length; i++) {
      expect((ys[i]! - ys[i - 1]!) * 100).toBeCloseTo(C.REP_BRICK_COURSE_MM, 6)
    }
    // **축척이 실제로 지나간다**: mmPerUnit을 두 배로 → 세계 간격이 절반(mm는 그대로)
    const b = repSegments(f, 'brick', 200, f.id)
    const ys2 = [...new Set(b.major.map(s => s.a.y.toFixed(6)))].map(Number).sort((p, q) => p - q)
    expect((ys2[1]! - ys2[0]!) * 200).toBeCloseTo(C.REP_BRICK_COURSE_MM, 6)
    expect(ys2[1]! - ys2[0]!).toBeCloseTo((ys[1]! - ys[0]!) / 2, 6)
    expect(b.major.length).toBeGreaterThan(a.major.length)   // 같은 벽에 켜가 더 들어간다
    // 반증(D-3): 축척 미정이면 아무것도 안 나온다 — 좌표를 임의로 짓지 않는다
    expect(repSegments(f, 'brick', null, f.id).major.length).toBe(0)
  })

  it('막힌줄눈 — 이웃 켜의 수직 줄눈이 반절 어긋난다', () => {
    const f = wallFace(30, 20)
    const r = repSegments(f, 'brick', 100, f.id)
    // 부선(수직 줄눈)을 켜 띠(y구간)별로 묶어 x 집합을 비교
    const byBand = new Map<string, Set<number>>()
    for (const s of r.minor) {
      const k = Math.min(s.a.y, s.b.y).toFixed(4)
      if (!byBand.has(k)) byBand.set(k, new Set())
      byBand.get(k)!.add(Number(s.a.x.toFixed(6)))
    }
    const bands = [...byBand.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(e => e[1])
    expect(bands.length).toBeGreaterThan(3)
    const x0 = [...bands[0]!].sort((a, b) => a - b)
    const x1 = [...bands[1]!].sort((a, b) => a - b)
    // 어긋남 = 모듈의 반(200mm/2 = 100mm = 세계 1.0 @ mmPerUnit 100)
    expect(Math.abs(x1[0]! - x0[0]!) * 100).toBeCloseTo(C.REP_BRICK_MODULE_W_MM / 2, 6)
  })

  it('개구부 — 구멍 안으로는 선이 안 지나간다', () => {
    const hole = [v3(10, 5, 0), v3(20, 5, 0), v3(20, 12, 0), v3(10, 12, 0)]
    const f = wallFace(30, 20, [hole])
    const r = repSegments(f, 'brick', 100, f.id)
    for (const s of [...r.major, ...r.minor]) {
      const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2
      const inside = mx > 10 + 1e-6 && mx < 20 - 1e-6 && my > 5 + 1e-6 && my < 12 - 1e-6
      expect(inside).toBe(false)
    }
    // 판별력(D-3): 구멍이 없으면 그 자리를 지나는 선이 실제로 있다
    const r0 = repSegments(wallFace(30, 20), 'brick', 100, f.id)
    const through = [...r0.major].some(s => {
      const my = (s.a.y + s.b.y) / 2
      return my > 5 && my < 12 && Math.min(s.a.x, s.b.x) < 10 && Math.max(s.a.x, s.b.x) > 20
    })
    expect(through).toBe(true)
  })
})

describe('시드 — 석재·목재의 불규칙', () => {
  it('같은 면은 다시 그려도 같고, 다른 면(다른 시드)은 다르다', () => {
    const f = wallFace(30, 20)
    const a = repSegments(f, 'stone', 100, 7)
    const b = repSegments(f, 'stone', 100, 7)
    const c = repSegments(f, 'stone', 100, 8)
    const sig = (r: typeof a) => JSON.stringify([...r.major, ...r.minor].map(s => [s.a.x, s.a.y, s.b.x, s.b.y]))
    expect(sig(a)).toBe(sig(b))                     // 결정론 — 다시 그려도 같다
    expect(sig(a)).not.toBe(sig(c))                 // 시드가 실제로 가른다
    // 목재 결도 같은 규약
    const wa = repSegments(f, 'wood', 100, 7), wc = repSegments(f, 'wood', 100, 8)
    expect(sig(wa)).not.toBe(sig(wc))
  })
})

describe('기저 — 원점·방향의 자동 규칙 (⚑의 자동판)', () => {
  it('벽: 켜가 수평(u가 세계 수평·v가 위) · 슬라브: 퇴화 표시가 선다', () => {
    const w = repBasis(wallFace(30, 20))
    expect(w.degenerate).toBe(false)
    expect(Math.abs(w.u.y)).toBeLessThan(1e-9)      // 가로축은 수평
    expect(w.v.y).toBeGreaterThan(0.99)             // 세로축은 위
    const s = repBasis(slabFace(30, 20))
    expect(s.degenerate).toBe(true)                 // «평면 안의 수평»이 못 선다 — 표시
    // 퇴화여도 기저는 직교로 선다(무늬는 나온다 — 방향만 규칙이 못 고른 것)
    const dot = s.u.x * s.v.x + s.u.y * s.v.y + s.u.z * s.v.z
    expect(Math.abs(dot)).toBeLessThan(1e-9)
  })
})

// ── 흐름 — 세션 픽스처(방 벽 — mats46의 그 픽스처) ─────────────────────────────
function roomWithScale() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  const post = s.draw(500, 500, 500, 380)!
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  expect(setDimension(s.app, post.id, 2500)).toBe('scale')
  const face = s.app.doc.faces[0]!
  const rf = s.app.faces.find(f => f.id === face.id)!
  return { s, face, rf }
}

describe('흐름 — 순환·쪽·저장·실행취소', () => {
  it('순환이 쪽을 «지금 카메라 쪽»으로 싣는다 · 반대쪽에서는 안 보이는 판정', () => {
    const { s, face, rf } = roomWithScale()
    const r = cycleFaceRep(s.app, face.id)!
    expect(r.name).toBe('벽돌')
    expect(face.rep).toEqual({ m: 'brick', s: paintSideAt(rf, s.app.pose) })
    // 반대쪽 카메라 — 면 평면 대칭점에서 보면 쪽이 뒤집힌다(48-5 무회귀의 단위판)
    const pl = facePlane(rf)
    const p = s.app.pose.p
    const d = pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z - pl.d
    const mirror = { x: p.x - 2 * d * pl.n.x, y: p.y - 2 * d * pl.n.y, z: p.z - 2 * d * pl.n.z }
    expect(sideOfPlane(pl, mirror)).toBe(-face.rep!.s)
    // 무늬가 실제로 나온다(축척이 섰으므로)
    const segs = repSegments(rf, 'brick', s.app.lift.mmPerUnit!, face.id)
    expect(segs.major.length).toBeGreaterThan(0)
  })

  it('저장 왕복 — rep이 살아 돌아온다 · 쪽 없는 rep은 통째로 버려진다', () => {
    const { s, face } = roomWithScale()
    cycleFaceRep(s.app, face.id)
    const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: { s: 1, ox: 0, oy: 0 } })
    const back = parseBrnl(text)!
    expect(back.doc.faces[0]!.rep).toEqual(face.rep)
    // 모양 검사 — s가 빠지면(옛 편집기·손상) 무늬가 «양쪽에 보이는» 채로 살아나면 안 된다
    const raw = JSON.parse(text)
    delete raw.faces[0].rep.s
    const back2 = parseBrnl(JSON.stringify(raw))!
    expect(back2.doc.faces[0]!.rep).toBeUndefined()
  })

  it('실행취소·다시실행 — 값이 깊은 사본으로 오간다', () => {
    const { s, face } = roomWithScale()
    cycleFaceRep(s.app, face.id)                       // → 벽돌
    const first = { ...face.rep! }
    cycleFaceRep(s.app, face.id)                       // → 석재
    expect(face.rep!.m).toBe('stone')
    undo(s.app)
    expect(face.rep).toEqual(first)
    undo(s.app)
    expect(face.rep).toBeUndefined()
    redo(s.app)
    expect(face.rep).toEqual(first)
  })
})
