// web2-45 — 칠하기(45-3)·분류(45-2)·채움(45-4)의 상태·기하 팔.
//
// 픽스처는 faces45_measure의 방(바닥+벽 — 앱 경로)이다. 칠의 «저절로 맞는다»(지시)를
// D-4대로 확인 대상으로 둔다 — 왕복 오차를 값으로 낸다(⚠ 이 왕복은 구성상에 가깝다:
// 광선→평면→재사영은 같은 카메라에서 항등이다. 재는 것은 **배선**(면 배정·평면식·포즈
// 규약)이 실제로 그 항등을 지나는가다 — #5의 규약대로 여기 적는다).

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import {
  commitPaint, cycleFaceClass, faceClassNow, cycleFaceFill, undo, redo,
  toggleFaceAt, beginErase, eraseAt, endErase,
} from '../src/app/state'
import { faceClassOf, splitByFace, frontFaceAt } from '../src/core/paint'
import { hatchSegments } from '../src/core/hatch'
import { facePlane } from '../src/core/paint'
import { C } from '../src/core/constants'
import { DRAW_POSE, project } from '../src/core/camera'
import { dot3, sub3, len3, v3, type V3, type Pt } from '../src/core/vec'
import type { ResolvedFace } from '../src/core/face'

const W = 1200, H = 800

/** 방(바닥+벽) — faces45_measure 장면 1과 같은 좌표(앱 경로). */
function roomSession(): { s: Session; floorId: number; wallId: number } {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')   // 바닥(벽 왼 모서리 x=500 밖)
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')   // 벽
  expect(s.app.faces.length).toBe(2)
  // 어느 것이 벽인가 — 법선의 y로 가른다(#92: 이름표가 아니라 성질로)
  const wall = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
  const floor = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  return { s, floorId: floor.id, wallId: wall.id }
}

describe('45-3 칠하기 — 면 배정·분할·왕복', () => {
  it('① 한 붓이 벽·바닥 둘을 지나면 면마다 나뉘어 얹힌다 · 허공 점은 센다', () => {
    const { s, floorId, wallId } = roomSession()
    // 벽 안(550,430) → 벽 왼 모서리(x=500)를 넘어 **바닥 전용 구역**(x<500) → 허공.
    // ⚠ 겹침 구역(벽 뒤에 바닥이 비치는 x≥500 띠)에서는 앞 면(벽)이 이긴다 — 그 규칙
    //   자체는 아래 frontFaceAt 팔이 잰다. 나뉨을 재려면 전용 구역을 지나야 한다.
    const pts: Pt[] = []
    for (let t = 0; t <= 20; t++) pts.push({ x: 550 - t * 5, y: 430 + t * 2.4 })    // 벽→바닥(450,478)
    for (let t = 1; t <= 5; t++) pts.push({ x: 450 - t * 45, y: 478 + t * 32 })     // 바닥→허공
    const r = commitPaint(s.app, pts)
    expect(r.placed).toBeGreaterThanOrEqual(2)
    const paints = s.app.doc.strokes.filter(x => x.paint !== undefined)
    const fs = new Set(paints.map(x => x.paint!.f))
    expect(fs.has(wallId)).toBe(true)
    expect(fs.has(floorId)).toBe(true)
    expect(r.offFace).toBeGreaterThan(0)              // 허공 몫이 실제로 세어진다
    // 리프팅·카메라 오염 없음 — 칠 획은 lifted·waiting 어디에도 없다
    for (const p of paints) {
      expect(s.app.lift.lifted.has(p.id)).toBe(false)
      expect(s.app.lift.waiting.includes(p.id)).toBe(false)
    }
    // 실행취소 한 번 = 붓 하나
    undo(s.app)
    expect(s.app.doc.strokes.some(x => x.paint !== undefined)).toBe(false)
    redo(s.app)
    expect(s.app.doc.strokes.filter(x => x.paint !== undefined).length).toBe(paints.length)
  })

  it('② 왕복 — 얹힌 3D를 같은 시점으로 재사영하면 그은 잉크 그대로다(D-4 · #5 배선 확인)', () => {
    const { s, wallId } = roomSession()
    const pts: Pt[] = []
    for (let t = 0; t <= 12; t++) pts.push({ x: 515 + t * 6, y: 470 - t * 5 })   // 벽 안
    const r = commitPaint(s.app, pts)
    expect(r.placed).toBe(1)
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.f).toBe(wallId)
    const g3 = s.app.paintGeo.get(p.id)!
    expect(g3.length).toBe(p.raw!.length)
    let maxErr = 0
    for (let i = 0; i < g3.length; i++) {
      const q = project(s.app.lift.an, DRAW_POSE, g3[i]!)!
      maxErr = Math.max(maxErr, Math.hypot(q.x - p.raw![i]!.x, q.y - p.raw![i]!.y))
    }
    expect(maxErr).toBeLessThan(1e-6)
    // D-3 — 자가 실제로 잰다: 딴 점과 견주면 값이 난다
    const q0 = project(s.app.lift.an, DRAW_POSE, g3[0]!)!
    expect(Math.hypot(q0.x - (p.raw![0]!.x + 1), q0.y - p.raw![0]!.y)).toBeGreaterThan(0.9)
  })

  it('③ 지우개 — 칠 획은 통째로 지워지고 잠그면 안 지워진다', () => {
    const { s } = roomSession()
    const pts: Pt[] = []
    for (let t = 0; t <= 10; t++) pts.push({ x: 515 + t * 7, y: 465 - t * 4 })
    commitPaint(s.app, pts)
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    p.lock = 1
    beginErase(s.app); eraseAt(s.app, { x: 550, y: 445 }); endErase(s.app)
    expect(s.app.doc.strokes.find(x => x.id === p.id), '잠긴 칠은 남는다').toBeDefined()
    delete p.lock
    beginErase(s.app); eraseAt(s.app, { x: 550, y: 445 }); endErase(s.app)
    expect(s.app.doc.strokes.find(x => x.id === p.id), '해제하면 지워진다(D-3 짝)').toBeUndefined()
  })

  it('④ 채운 면 위에 선을 그으면 — 선은 정상으로 서고 채움은 안 바뀐다(지시 45-4)', () => {
    const { s, wallId } = roomSession()
    expect(cycleFaceFill(s.app, wallId)).toBe(1)   // web2-48 48-3: 토글 → 순환(첫 칸이 해칭)
    const st = s.draw(520, 490, 520, 400)!            // 벽 위를 지나는 보통 세로선
    expect(s.app.lift.lifted.has(st.id), '선이 정상으로 3D에 선다').toBe(true)
    expect(s.app.doc.faces.find(f => f.id === wallId)!.fill).toBe(1)
  })
})

describe('45-2 분류 — 법선만 · 경계 스윕 · 사람의 정정', () => {
  it('① 경계 스윕 — 임계 양옆에서 실제로 갈린다(#12 — 한 점 ⛔)', () => {
    const tol = C.FACE_CLASS_DEG
    const at = (tiltDeg: number) => {
      const r = tiltDeg * Math.PI / 180
      return faceClassOf(v3(Math.sin(r), Math.cos(r), 0), tol)
    }
    expect(at(0)).toBe('slab')
    expect(at(tol - 0.1)).toBe('slab')
    expect(at(tol + 0.1)).toBe('slope')
    expect(at(45)).toBe('slope')
    expect(at(90 - tol - 0.1)).toBe('slope')
    expect(at(90 - tol + 0.1)).toBe('wall')
    expect(at(90)).toBe('wall')
  })

  it('② 방의 자동 분류 — 바닥은 슬라브, 벽은 벽', () => {
    const { s, floorId, wallId } = roomSession()
    expect(faceClassNow(s.app, floorId)).toBe('slab')
    expect(faceClassNow(s.app, wallId)).toBe('wall')
  })

  it('③ 사람의 정정이 이긴다 — 돌리기 네 칸 · 실행취소', () => {
    const { s, wallId } = roomSession()
    expect(faceClassNow(s.app, wallId)).toBe('wall')
    const r1 = cycleFaceClass(s.app, wallId)!          // 자동 → slab
    expect(r1.cls).toBe('slab'); expect(r1.auto).toBe(false)
    expect(faceClassNow(s.app, wallId)).toBe('slab')   // 정정이 계산을 이긴다
    cycleFaceClass(s.app, wallId)                      // slab → wall
    cycleFaceClass(s.app, wallId)                      // wall → slope
    const r4 = cycleFaceClass(s.app, wallId)!          // slope → 자동
    expect(r4.auto).toBe(true)
    expect(r4.cls).toBe('wall')
    undo(s.app)                                        // 자동 → slope로 되돌아간다
    expect(faceClassNow(s.app, wallId)).toBe('slope')
    redo(s.app)
    expect(faceClassNow(s.app, wallId)).toBe('wall')
  })
})

describe('45-4 채움 — 해칭 두 판 · 개구부 추종', () => {
  /** 합성 벽면(수직 평면 · 구멍 하나) — hatch는 tris를 안 읽으므로 이만큼이면 선다. */
  function wallWithHole(): ResolvedFace {
    const z = -8
    const outer: V3[] = [v3(-2, 0, z), v3(2, 0, z), v3(2, 2.4, z), v3(-2, 2.4, z)]
    const hole: V3[] = [v3(-0.5, 0.8, z), v3(0.5, 0.8, z), v3(0.5, 1.6, z), v3(-0.5, 1.6, z)]
    return { id: 999, outer, holes: [hole], normal: v3(0, 0, 1), flat: 0, tris: [] }
  }
  const an = () => roomSession().s.app.lift.an

  it('① 두 판 다 선다 — 선분이 전부 면 평면 위다', () => {
    const A = an()
    const f = wallWithHole()
    const pl = facePlane(f)
    for (const mode of ['screen', 'face'] as const) {
      const segs = hatchSegments(A, DRAW_POSE, f, mode, C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
      expect(segs.length, mode).toBeGreaterThan(4)
      for (const sg of segs) {
        expect(Math.abs(dot3(pl.n, sg.a) - pl.d), mode).toBeLessThan(1e-9)
        expect(Math.abs(dot3(pl.n, sg.b) - pl.d), mode).toBeLessThan(1e-9)
      }
    }
  })

  it('② 개구부를 따라 잘린다 — 구멍을 지우면 잉크 길이가 실제로 는다(D-3 반증 짝)', () => {
    const A = an()
    const f = wallWithHole()
    const solid: ResolvedFace = { ...f, holes: [] }
    for (const mode of ['screen', 'face'] as const) {
      const withHole = hatchSegments(A, DRAW_POSE, f, mode, C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
      const noHole = hatchSegments(A, DRAW_POSE, solid, mode, C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
      const total = (xs: typeof withHole) => xs.reduce((sum, sg) => sum + len3(sub3(sg.b, sg.a)), 0)
      expect(total(withHole), mode).toBeLessThan(total(noHole) - 1e-6)
      // 구멍 안을 지나는 선분이 없다 — 선분 중점이 구멍 사각 안이면 실패
      for (const sg of withHole) {
        const m = v3((sg.a.x + sg.b.x) / 2, (sg.a.y + sg.b.y) / 2, (sg.a.z + sg.b.z) / 2)
        const inside = m.x > -0.5 && m.x < 0.5 && m.y > 0.8 && m.y < 1.6
        expect(inside, mode).toBe(false)
      }
    }
  })

  it('③ ⚑의 판별 — 시점을 돌리면 화면 판은 갈리고 면 판은 그대로다', () => {
    const { s, wallId } = roomSession()
    const rf = s.app.faces.find(f => f.id === wallId)!
    const poseB = { p: v3(1.2, 1.4, 1.5), q: { x: 0.05, y: 0.22, z: 0.01, w: 0.975 } }
    const sig = (segs: { a: V3; b: V3 }[]) =>
      segs.map(x => `${x.a.x.toFixed(6)},${x.a.y.toFixed(6)},${x.b.x.toFixed(6)}`).join('|')
    const faceA = hatchSegments(s.app.lift.an, DRAW_POSE, rf, 'face', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    const faceB = hatchSegments(s.app.lift.an, poseB, rf, 'face', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    expect(sig(faceA), '면 판은 포즈 무관').toBe(sig(faceB))
    const scrA = hatchSegments(s.app.lift.an, DRAW_POSE, rf, 'screen', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    const scrB = hatchSegments(s.app.lift.an, poseB, rf, 'screen', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    expect(sig(scrA) === sig(scrB), '화면 판은 시점을 따라 미끄러진다').toBe(false)
  })

  it('④ 채움 토글 — 면의 성질(저장 필드)·실행취소', () => {
    const { s, wallId } = roomSession()
    expect(cycleFaceFill(s.app, wallId)).toBe(1)   // web2-48 48-3: 토글 → 순환(첫 칸이 해칭)
    expect(s.app.doc.faces.find(f => f.id === wallId)!.fill).toBe(1)
    undo(s.app)
    expect(s.app.doc.faces.find(f => f.id === wallId)!.fill).toBeUndefined()
    redo(s.app)
    expect(s.app.doc.faces.find(f => f.id === wallId)!.fill).toBe(1)
  })
})

describe('배선 — 허공 붓·면 앞뒤', () => {
  it('허공에만 그으면 아무것도 안 얹힌다(placed 0) · frontFaceAt이 앞 면을 낸다', () => {
    const { s, wallId } = roomSession()
    const r = commitPaint(s.app, [{ x: 200, y: 620 }, { x: 260, y: 640 }, { x: 320, y: 660 }])
    expect(r.placed).toBe(0)
    expect(r.offFace).toBeGreaterThan(0)
    // 벽·바닥이 겹치지 않는 자리 — 벽 안 점은 벽을 낸다
    expect(frontFaceAt(s.app.lift, s.app.pose, s.app.faces, { x: 550, y: 430 })).toBe(wallId)
    const { runs } = splitByFace(s.app.lift, s.app.pose, s.app.faces, [{ x: 550, y: 430 }, { x: 552, y: 432 }])
    expect(runs.length).toBe(1)
    expect(runs[0]!.f).toBe(wallId)
  })
})
