// web2-44 — 손: 잡기·옮기기·돌리기·복제·잠금·맺기·면 정면 뷰(상태 연산).
//
// 픽스처: fixtures.constructedDoc과 같은 카메라(지평선 y=400 · vp0=(900,400) ·
// vp1=(100,400) · f≈387)를 **session.draw로** 세운다(하네스가 앱과 같은 함수를 지나야
// 스냅·역할이 실제와 같다 — session.ts 머리주석).
//
// ⚠ **소실점을 만든 획(role 'vp')은 못 잡는다** — 카메라가 그 잉크에서 나오므로(analyze)
// 그것을 옮기면 카메라가 움직여 굳힌 3D 전부가 낡는다. gripHitAt이 content만 받는 것이
// 그 방어이고, ⑩이 그것을 값으로 잰다.

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import {
  beginHold, holdTargetAt, gripDragStartAt, gripBase, applyMove, applyRotate, finishManip,
  applyManipValue, duplicateGrip, lockGrip, unlockStroke, joinGrip, faceFrontTarget,
  undo, redo, eraseAt, beginErase, endErase, toggleFaceAt, endWriting, writeActive,
  setDimension,
} from '../src/app/state'
import { own3Deviation, OWN3_TOL_PX } from '../src/core/own3d'
import { solveMove, solveAlong, connectedIds, mapRawSimilarity } from '../src/core/grip'
import { geomSizeOf } from '../src/core/lift'
import { DRAW_POSE, project, isParallel } from '../src/core/camera'
import { sub3, len3, cross3, norm3, dot3, v3, type V3 } from '../src/core/vec'
import type { Stroke } from '../src/core/types'

const W = 1200, H = 800

/** 카메라를 닫는다 — 2점(fixtures.constructedDoc의 좌표 그대로). */
function twoVpSession(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)     // 지평선
  s.draw(500, 500, 600, 475)      // 깊이선 1 → vp0 (900,400)
  s.draw(500, 500, 400, 475)      // 깊이선 2 → vp1 (100,400)
  expect(s.app.lift.an.constructionDone).toBe(true)
  expect(s.app.lift.an.vps.length).toBe(2)
  return s
}

/** 내용 획 — 모서리에서 세로 기둥 하나. 잡기의 기본 대상. */
function withColumn(s: Session): Stroke {
  const col = s.draw(500, 500, 500, 340)!
  expect(s.app.lift.lifted.has(col.id)).toBe(true)
  expect(s.app.lift.an.roles.get(col.id)).toBe('content')
  return col
}

const now0 = 1000

describe('잡기 — 꾹 누름의 갈래(web2-44 · 39의 연장)', () => {
  it('① 선을 누르면 잡히고 글씨 상태가 함께 선다(39 보존)', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    const r = beginHold(s.app, { x: 500, y: 420 }, now0)   // 기둥 몸통
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('write')                          // 39의 진입이 그대로 산다
    expect(s.app.grip?.ids).toEqual([col.id])
    expect(writeActive(s.app)).toBe(true)
    expect(s.app.write?.target).toBe(col.id)
  })

  it('② 빈 곳은 아무 일도 없다(빈 곳 경로 ⛔ — 39-1 문면)', () => {
    const s = twoVpSession()
    withColumn(s)
    expect(holdTargetAt(s.app, { x: 900, y: 700 })).toBeNull()
    expect(beginHold(s.app, { x: 900, y: 700 }, now0)).toBeNull()
    expect(s.app.grip).toBeNull()
  })

  it('③ 다른 선을 누르면 잡음에 더해진다(여럿 잡기) · 글씨 대상은 마지막 선', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    const beam = s.draw(500, 340, 620, 310)!               // 기둥 꼭대기에서 vp0 쪽
    expect(s.app.lift.lifted.has(beam.id)).toBe(true)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const r2 = beginHold(s.app, { x: 560, y: 325 }, now0 + 10)
    expect(r2!.kind).toBe('grip-add')
    expect(new Set(s.app.grip!.ids)).toEqual(new Set([col.id, beam.id]))
    expect(s.app.write?.target).toBe(beam.id)
  })

  it('④ 잡힌 선을 또 누르면 이어진 것까지(연결 성분)', () => {
    const s = twoVpSession()
    // ⚠ 떨어진 지면선은 **높이가 서기 전에** 긋는다 — 지면 규칙(extendOnce)은 장면에
    //   높이가 없을 때만 돌므로(lift.ts) 기둥 뒤에 그으면 대기로 남는다.
    const far = s.draw(820, 470, 880, 455)!                // 떨어진 지면선(vp0 축)
    expect(s.app.lift.lifted.has(far.id)).toBe(true)
    const col = withColumn(s)
    const beam = s.draw(500, 340, 620, 310)!               // 기둥과 끝점 공유
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const r2 = beginHold(s.app, { x: 500, y: 420 }, now0 + 10)
    expect(r2!.kind).toBe('grip-connect')
    const got = new Set(s.app.grip!.ids)
    expect(got.has(col.id)).toBe(true)
    expect(got.has(beam.id)).toBe(true)                    // 이어진 것은 들어온다
    expect(got.has(far.id)).toBe(false)                    // 떨어진 것은 안 들어온다
  })

  it('⑤ 잡기 세션 = 글씨 세션 — endWriting이 잡음을 놓는다', () => {
    const s = twoVpSession()
    withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    expect(s.app.grip).not.toBeNull()
    endWriting(s.app, 'far')
    expect(s.app.grip).toBeNull()
    expect(writeActive(s.app)).toBe(false)
  })

  it('⑩ 소실점을 만든 획(role vp)은 못 잡는다 — 카메라 방어', () => {
    const s = twoVpSession()
    withColumn(s)
    // 깊이선 1의 몸통을 누른다 — 기둥이 아니라 그 자리엔 vp 획뿐인 지점
    const hit = holdTargetAt(s.app, { x: 580, y: 480 })
    // 잡히더라도 vp 획이면 안 된다 — line이면 content여야 한다
    if (hit && hit.kind === 'line') {
      expect(s.app.lift.an.roles.get(hit.id)).toBe('content')
    }
    const depth1 = s.app.doc.strokes[1]!
    expect(s.app.lift.an.roles.get(depth1.id)).toBe('vp')
    // gripHitAt 경로로 그 획이 잡혔다면 실패다
    beginHold(s.app, { x: 580, y: 480 }, now0)
    expect(s.app.grip?.ids ?? []).not.toContain(depth1.id)
  })
})

describe('옮기기 — 축 제한 · 원칙 d · 실행취소', () => {
  it('① 축 제한: 이동 벡터가 고른 축과 평행하다(외적 0)', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const before = { ...s.app.lift.lifted.get(col.id)! }
    const b3a = { ...before.a3 }, b3b = { ...before.b3 }
    const { base, base3 } = gripBase(s.app)
    // vp0 방향으로 끈다 — solveMove가 화면 잔차로 축을 고른다
    const anchor3 = { ...s.app.lift.lifted.get(col.id)!.a3 }
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 560, y: 485 })
    expect(sol).not.toBeNull()
    const after = applyMove(s.app, base, base3, sol!.dir, sol!.t)
    expect(after).not.toBeNull()
    const na = s.app.lift.lifted.get(col.id)!
    const d1 = sub3(na.a3, b3a)
    const d2 = sub3(na.b3, b3b)
    // 두 끝이 같은 벡터로 움직였고 그 벡터가 축과 평행하다
    expect(len3(sub3(d1, d2))).toBeLessThan(1e-9 * Math.max(1, len3(d1)))
    expect(len3(cross3(norm3(d1), sol!.dir))).toBeLessThan(1e-9)
    expect(Math.abs(len3(d1) - Math.abs(sol!.t))).toBeLessThan(1e-9 * Math.max(1, Math.abs(sol!.t)))
  })

  it('② 잉크 심판: 옮긴 뒤에도 own3 사영 == 2D 끝점(OWN3_TOL_PX)', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const { base, base3 } = gripBase(s.app)
    const anchor3 = { ...s.app.lift.lifted.get(col.id)!.a3 }
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 560, y: 485 })!
    applyMove(s.app, base, base3, sol.dir, sol.t)
    const st = s.app.doc.strokes.find(x => x.id === col.id)!
    const dev = own3Deviation(s.app.lift.an, st)
    expect(dev).not.toBeNull()
    expect(dev!).toBeLessThanOrEqual(OWN3_TOL_PX)
  })

  it('③ 실행취소 한 번에 기하가 전부 돌아온다 · 다시실행이 되민다', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const st = s.app.doc.strokes.find(x => x.id === col.id)!
    const beforeA = { ...st.a }, beforeB = { ...st.b }
    const before3 = { a: { ...st.own3!.a }, b: { ...st.own3!.b } }
    const { base, base3 } = gripBase(s.app)
    const anchor3 = { ...s.app.lift.lifted.get(col.id)!.a3 }
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 560, y: 485 })!
    const after = applyMove(s.app, base, base3, sol.dir, sol.t)!
    finishManip(s.app, 'move', base, base3, after, {
      axis: sol.axis, dir: sol.dir, amount: sol.t, labelAt: { x: 560, y: 485 },
    })
    const movedA = { ...st.a }
    expect(movedA.x).not.toBeCloseTo(beforeA.x, 6)
    undo(s.app)
    expect(st.a.x).toBeCloseTo(beforeA.x, 9)
    expect(st.a.y).toBeCloseTo(beforeA.y, 9)
    expect(st.b.x).toBeCloseTo(beforeB.x, 9)
    expect(st.own3!.a.x).toBeCloseTo(before3.a.x, 12)
    expect(st.own3!.b.z).toBeCloseTo(before3.b.z, 12)
    redo(s.app)
    expect(st.a.x).toBeCloseTo(movedA.x, 9)
  })

  it('④ 값 수정(손글씨 기제): 300을 쓰면 이동량이 정확히 300mm가 된다', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    // 축척: 기둥에 2000mm — 문서 순서상 첫 치수 획
    expect(setDimension(s.app, col.id, 2000)).toBe('scale')
    const mmPer = s.app.lift.mmPerUnit!
    expect(mmPer).toBeGreaterThan(0)
    const beam = s.draw(500, 340, 620, 310)!
    beginHold(s.app, { x: 560, y: 325 }, now0)
    expect(s.app.grip!.ids).toContain(beam.id)
    const { base, base3 } = gripBase(s.app)
    const anchor3 = { ...s.app.lift.lifted.get(beam.id)!.a3 }
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 560, y: 300 })!
    const after = applyMove(s.app, base, base3, sol.dir, sol.t)!
    finishManip(s.app, 'move', base, base3, after, {
      axis: sol.axis, dir: sol.dir, amount: sol.t, labelAt: { x: 560, y: 300 },
    })
    const b3 = base3.get(beam.id)!
    expect(applyManipValue(s.app, 300)).toBe(true)
    const na = s.app.lift.lifted.get(beam.id)!
    const movedMm = len3(sub3(na.a3, b3.a3)) * mmPer
    expect(movedMm).toBeCloseTo(300, 6)
  })
})

describe('돌리기 — 수직축 · 길이 보존', () => {
  it('끝점을 잡으면 돌리기 진입 · 90° 돌리면 방향이 직교하고 길이가 보존된다', () => {
    const s = twoVpSession()
    withColumn(s)
    const beam = s.draw(500, 340, 620, 310)!
    beginHold(s.app, { x: 560, y: 325 }, now0)
    // 몸통 = 옮기기, 끝 = 돌리기(#43 — 점과 선을 갈라 센다)
    const bodyStart = gripDragStartAt(s.app, { x: 560, y: 325 })
    expect(bodyStart?.kind).toBe('move')
    const seg0 = s.app.lift.lifted.get(beam.id)!
    const endScreen = project(s.app.lift.an, s.app.pose, seg0.a3)!
    const endStart = gripDragStartAt(s.app, endScreen)
    expect(endStart?.kind).toBe('rotate')
    const pivot = (endStart as { pivot: V3 }).pivot
    const a0 = { ...seg0.a3 }, b0 = { ...seg0.b3 }
    const len0 = len3(sub3(b0, a0))
    const { base, base3 } = gripBase(s.app)
    const after = applyRotate(s.app, base, base3, pivot, Math.PI / 2)
    expect(after).not.toBeNull()
    const seg1 = s.app.lift.lifted.get(beam.id)!
    const len1 = len3(sub3(seg1.b3, seg1.a3))
    expect(len1).toBeCloseTo(len0, 9)
    // y는 안 바뀐다(수직축 둘레)
    expect(seg1.a3.y).toBeCloseTo(a0.y, 9)
    expect(seg1.b3.y).toBeCloseTo(b0.y, 9)
    // 수평 성분이 90° 돌았다
    const h0 = norm3(v3(b0.x - a0.x, 0, b0.z - a0.z))
    const h1 = norm3(v3(seg1.b3.x - seg1.a3.x, 0, seg1.b3.z - seg1.a3.z))
    expect(Math.abs(dot3(h0, h1))).toBeLessThan(1e-9)
  })
})

describe('복제 · 잠금', () => {
  it('복제: 같은 기하의 새 획 — 잡음이 사본으로 옮겨 가고 실행취소가 걷는다', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    const n0 = s.app.doc.strokes.length
    const n = duplicateGrip(s.app)
    expect(n).toBe(1)
    expect(s.app.doc.strokes.length).toBe(n0 + 1)
    const copyId = s.app.grip!.ids[0]!
    expect(copyId).not.toBe(col.id)
    const copy = s.app.doc.strokes.find(x => x.id === copyId)!
    expect(copy.a.x).toBeCloseTo(500, 9)
    expect(copy.own3!.a.y).toBeCloseTo(s.app.doc.strokes.find(x => x.id === col.id)!.own3!.a.y, 12)
    undo(s.app)
    expect(s.app.doc.strokes.length).toBe(n0)
  })

  it('잠금 전수: 잠긴 획은 잡기·지우개·맺기 어디서도 안 걸린다 · 해제 짝(D-3)', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    beginHold(s.app, { x: 500, y: 420 }, now0)
    expect(lockGrip(s.app)).toBe(1)
    const st = s.app.doc.strokes.find(x => x.id === col.id)!
    expect(st.lock).toBe(1)
    // ① 잡기 — line이 아니라 locked로 잡힌다
    const hit = holdTargetAt(s.app, { x: 500, y: 420 })
    expect(hit?.kind).toBe('locked')
    // ② 지우개 — 안 지워진다
    beginErase(s.app)
    eraseAt(s.app, { x: 500, y: 420 })
    endErase(s.app)
    expect(s.app.doc.strokes.find(x => x.id === col.id)).toBeDefined()
    // ③ 맺기 — 잠긴 획은 잡히지도 않으므로 두 개를 못 채운다(구성상 차단)
    // 반증 짝(D-3): 해제하면 같은 지우개 획이 실제로 지운다
    expect(unlockStroke(s.app, col.id)).toBe(true)
    beginErase(s.app)
    eraseAt(s.app, { x: 500, y: 420 })
    endErase(s.app)
    expect(s.app.doc.strokes.find(x => x.id === col.id)).toBeUndefined()
    // 실행취소 사슬: 지움 → 해제 → 잠금 순으로 돌아온다
    undo(s.app)   // 지움 취소
    expect(s.app.doc.strokes.find(x => x.id === col.id)).toBeDefined()
    undo(s.app)   // 해제 취소 → 다시 잠김
    expect(s.app.doc.strokes.find(x => x.id === col.id)!.lock).toBe(1)
    undo(s.app)   // 잠금 취소
    expect(s.app.doc.strokes.find(x => x.id === col.id)!.lock).toBeUndefined()
  })
})

describe('맺기(R=0) — 연장만 한다', () => {
  /** 지면 위에서 서로 다른 축의 두 선(안 만나는 자리)을 세운다 */
  function groundPair(s: Session): { id1: number; id2: number } {
    // vp0 축 지면선(왼쪽 아래) · vp1 축 지면선(오른쪽 아래) — 화면에서 안 만난다
    const l1 = s.draw(200, 560, 320, 520)!    // vp0 쪽
    const l2 = s.draw(760, 560, 640, 520)!    // vp1 쪽
    expect(s.app.lift.lifted.has(l1.id)).toBe(true)
    expect(s.app.lift.lifted.has(l2.id)).toBe(true)
    // 지면(Y=0) 위 — 같은 평면
    const g1 = s.app.lift.lifted.get(l1.id)!
    const g2 = s.app.lift.lifted.get(l2.id)!
    expect(Math.abs(g1.a3.y)).toBeLessThan(1e-6)
    expect(Math.abs(g2.a3.y)).toBeLessThan(1e-6)
    return { id1: l1.id, id2: l2.id }
  }

  it('같은 평면의 두 선 — 둘 다 만나는 점까지 연장되고, 자르지 않는다', () => {
    const s = twoVpSession()
    const { id1, id2 } = groundPair(s)
    const len0 = (id: number) => {
      const g = s.app.lift.lifted.get(id)!
      return len3(sub3(g.b3, g.a3))
    }
    const L1 = len0(id1), L2 = len0(id2)
    beginHold(s.app, { x: 260, y: 540 }, now0)
    beginHold(s.app, { x: 700, y: 540 }, now0 + 10)
    expect(s.app.grip!.ids.length).toBe(2)
    const r = joinGrip(s.app)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.changed).toBeGreaterThan(0)
    // 연장만: 길이는 줄지 않는다
    expect(len0(id1)).toBeGreaterThanOrEqual(L1 - 1e-9)
    expect(len0(id2)).toBeGreaterThanOrEqual(L2 - 1e-9)
    // 두 선이 실제로 만난다 — 각 선의 끝점 중 하나가 P에 있다
    const near = (id: number) => {
      const g = s.app.lift.lifted.get(id)!
      return Math.min(len3(sub3(g.a3, r.P)), len3(sub3(g.b3, r.P)))
    }
    const size3 = geomSizeOf(s.app.lift.lifted)
    expect(near(id1)).toBeLessThan(1e-6 * size3)
    expect(near(id2)).toBeLessThan(1e-6 * size3)
  })

  it('꼬인 위치(다른 평면)는 거부하고 이유를 낸다 · 평행도 거부', () => {
    const s = twoVpSession()
    // 지면의 vp0 선 · 공중의 vp1 선(기둥 꼭대기에서) — 꼬인 위치
    const l1 = s.draw(200, 560, 320, 520)!
    withColumn(s)
    const l2 = s.draw(500, 340, 400, 355)!    // vp1 축(방향 (100,400)−(500,340)) · 높이 위
    expect(s.app.lift.lifted.has(l2.id)).toBe(true)
    beginHold(s.app, { x: 260, y: 540 }, now0)
    beginHold(s.app, { x: 450, y: 347 }, now0 + 10)
    expect(new Set(s.app.grip!.ids)).toEqual(new Set([l1.id, l2.id]))
    const r = joinGrip(s.app)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.why).toBe('skew')
    // 평행: 같은 축의 지면선 둘 — **높이 없는 새 장면**에서(지면 규칙이 돌게)
    const s2 = twoVpSession()
    const p1 = s2.draw(200, 620, 340, 570)!
    const p2 = s2.draw(500, 620, 640, 570)!
    expect(s2.app.lift.lifted.has(p1.id)).toBe(true)
    expect(s2.app.lift.lifted.has(p2.id)).toBe(true)
    beginHold(s2.app, { x: 270, y: 595 }, now0 + 20)
    beginHold(s2.app, { x: 570, y: 595 }, now0 + 30)
    expect(new Set(s2.app.grip!.ids)).toEqual(new Set([p1.id, p2.id]))
    const r2 = joinGrip(s2.app)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.why).toBe('parallel')
  })

  it('치수가 길이를 쥔 획은 거부한다(조용히 풀리는 대신)', () => {
    const s = twoVpSession()
    const { id1, id2 } = groundPair(s)
    setDimension(s.app, id1, 3000)
    beginHold(s.app, { x: 260, y: 540 }, now0)
    beginHold(s.app, { x: 700, y: 540 }, now0 + 10)
    expect(new Set(s.app.grip!.ids)).toEqual(new Set([id1, id2]))
    const r = joinGrip(s.app)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toBe('dim')
  })
})

describe('면 정면 뷰 — 면이 정한 뷰(42의 일곱 뷰 옆)', () => {
  it('면을 잡으면 정면 목표가 서고, 시선이 법선과 나란하며 평행 사영이다', () => {
    const s = twoVpSession()
    // 벽면: 모서리 기둥 + 지면선 + 맞은편 기둥 + 상단 — vp0 방향 벽
    // ⚠ 밑변은 **깊이선 그 자체**다 — 같은 3D 직선 위에 밑변을 또 그으면 이웃 경계가
    //   한 직선이 되어 모서리(cornerOf)가 안 선다(초판 픽스처가 그랬다 — loopPoints null).
    //   실제 그림도 그렇다: 벽 밑변을 두 번 긋지 않는다.
    const colA = s.draw(500, 500, 500, 380)!
    const colB = s.draw(600, 475, 600, 385)!   // 깊이선 1의 끝에서 세운 기둥
    const top = s.draw(600, 385, 500, 380)!
    for (const st of [colA, colB, top]) {
      expect(s.app.lift.lifted.has(st.id)).toBe(true)
    }
    const r = toggleFaceAt(s.app, { x: 550, y: 430 })
    expect(r).toBe('added')
    expect(s.app.faces.length).toBe(1)
    // 면 안을 꾹 누른다 — 경계에서 떨어진 안쪽
    const hit = holdTargetAt(s.app, { x: 550, y: 432 })
    expect(hit?.kind).toBe('face')
    const hr = beginHold(s.app, { x: 550, y: 432 }, now0)
    expect(hr?.kind).toBe('face')
    expect(s.app.grip!.faceId).toBe(s.app.faces[0]!.id)
    expect(s.app.grip!.ids.length).toBeGreaterThanOrEqual(3)
    const to = faceFrontTarget(s.app)
    expect(to).not.toBeNull()
    // 평행 사영(카메라가 닫혀 있으므로 허용된다)
    expect(isParallel(to!)).toBe(true)
    // 시선(–z of pose) == ±법선 — 각도 0
    const f = s.app.faces[0]!
    const n = norm3(f.normal)
    // 포즈의 back = 눈 위치 − 면 중심 방향 == quatRotate(q, +z). 대신 위치로 잰다:
    let cx = 0, cy = 0, cz = 0
    for (const p of f.outer) { cx += p.x; cy += p.y; cz += p.z }
    const c = v3(cx / f.outer.length, cy / f.outer.length, cz / f.outer.length)
    const eyeDir = norm3(sub3(to!.p, c))
    expect(Math.abs(Math.abs(dot3(eyeDir, n)) - 1)).toBeLessThan(1e-9)
  })
})

describe('원장 밖 보조 — 유사변환·연결 성분(순수 함수)', () => {
  it('mapRawSimilarity: 끝점이 정확히 새 자리로 가고 모양(상대 배치)이 보존된다', () => {
    const raw = [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }]
    const out = mapRawSimilarity(raw, raw[0]!, raw[2]!, { x: 100, y: 100 }, { x: 100, y: 120 })
    expect(out[0]!.x).toBeCloseTo(100, 9)
    expect(out[0]!.y).toBeCloseTo(100, 9)
    expect(out[2]!.x).toBeCloseTo(100, 9)
    expect(out[2]!.y).toBeCloseTo(120, 9)
    // 가운데 점: 현에서의 수직 오프셋 1(길이 10의 1/10)이 새 현(길이 20)에서 2로 — 배율 보존
    expect(out[1]!.y).toBeCloseTo(110, 9)
    expect(out[1]!.x).toBeCloseTo(100 - 2, 9)
  })

  it('connectedIds: 끝점 공유 사슬은 이어지고 떨어진 것은 안 이어진다', () => {
    const s = twoVpSession()
    const col = withColumn(s)
    const beam = s.draw(500, 340, 620, 310)!
    const far = s.draw(820, 470, 880, 455)!
    const got = new Set(connectedIds(s.app.lift, [col.id], geomSizeOf(s.app.lift.lifted)))
    expect(got.has(beam.id)).toBe(true)
    expect(got.has(far.id)).toBe(false)
  })
})
