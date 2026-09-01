// web2-47 — 숫자와 표시의 상태·기하 팔.
// 픽스처는 paint45의 방(바닥+벽 — 앱 경로) + 치수 하나(축척). 픽셀은 e2e 몫.
// ⚠ #61이 이 회차의 중심이다 — 축척 미정이면 어느 함수도 숫자를 안 낸다(null)를 팔이 잰다.

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import {
  setDimension, toggleFaceAt, placePersonAt, gripFaceArea, floorAreaNow, volumeNow,
  undo, redo,
} from '../src/app/state'
import { niceFloor, scaleBarAt } from '../src/core/scalebar'
import { faceAreaU2, u2ToM2, floorArea, volume } from '../src/core/area'
import { findRooms } from '../src/core/room'
import { loadStencil, saveStencil, clearStencil } from '../src/core/stencil'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { project, horizonScreenY, pointOnGround } from '../src/core/camera'
import { faceFrontPose } from '../src/core/grip'
import { parallelPose } from '../src/core/viewcube'
import { lenMm } from '../src/core/dim'
import { C } from '../src/core/constants'
import { sub3, len3, v3, type V3 } from '../src/core/vec'
import type { ResolvedFace } from '../src/core/face'
import type { Face } from '../src/core/types'

const W = 1200, H = 800

function roomSession() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  const d1 = s.draw(500, 500, 600, 475)!
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  const wall = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
  const floorF = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  return { s, floorF, wall, d1 }
}

/** 축척을 준다 — 깊이선 하나에 2 m. */
function scaled() {
  const r = roomSession()
  expect(setDimension(r.s.app, r.d1.id, 2000)).toBe('scale')
  expect(r.s.app.lift.mmPerUnit).not.toBeNull()
  return r
}

describe('47-1 스케일바', () => {
  it('① 1·2·5×10ⁿ 내림', () => {
    expect(niceFloor(742)).toBe(500)
    expect(niceFloor(2000)).toBe(2000)
    expect(niceFloor(1999)).toBe(1000)
    expect(niceFloor(9.4)).toBe(5)
    expect(niceFloor(0.97)).toBe(0.5)
    expect(niceFloor(0)).toBeNull()
    expect(niceFloor(-3)).toBeNull()
  })

  it('② 축척 미정이면 안 뜬다 · 축척이 서면 뜬다 — 값이 목표 폭 안이고 끝점이 정확하다(#61)', () => {
    const r0 = roomSession()
    expect(scaleBarAt(r0.s.app.lift.an, r0.s.app.pose, r0.s.app.lift.mmPerUnit,
      { x: 200, y: 700 }, C.SCALEBAR_TARGET_PX, 'mm')).toBeNull()
    const { s } = scaled()
    const an = s.app.lift.an, pose = s.app.pose, mmPer = s.app.lift.mmPerUnit
    const bar = scaleBarAt(an, pose, mmPer, { x: 200, y: 700 }, C.SCALEBAR_TARGET_PX, 'mm')
    expect(bar).not.toBeNull()
    // 값이 1·2·5 계열이다
    const mant = bar!.mm / Math.pow(10, Math.floor(Math.log10(bar!.mm)))
    expect([1, 2, 5]).toContain(Math.round(mant))
    // 화면 폭이 목표 폭 이하(내림이므로) · 절반 이상(그 아래 계열이면 더 큰 값이 들어갔어야)
    const px = Math.hypot(bar!.b.x - bar!.a.x, bar!.b.y - bar!.a.y)
    expect(px).toBeLessThanOrEqual(C.SCALEBAR_TARGET_PX + 1e-6)
    expect(px).toBeGreaterThan(C.SCALEBAR_TARGET_PX * 0.38)   // 5→2→1 내림의 최악 비 0.4 아래 여유
    // 끝점의 «실제 길이»가 고른 값 그대로다 — 재사영이 정확하다는 검산(#61 · 반증: 선형
    // 근사로 b를 만들면 이 검산이 깨진다 — 아래 반증 팔)
    // 검산: a→b 화면 선분을 지면으로 되쏘아 길이를 재면 mm 그대로다
    const ga = pointOnGround(an, pose, bar!.a)!
    const gb = pointOnGround(an, pose, bar!.b)!
    const mm = lenMm(ga, gb, mmPer)!
    expect(Math.abs(mm - bar!.mm) / bar!.mm).toBeLessThan(1e-6)
  })

  it('③ 기준 깊이 일관 — 닻이 깊어질수록 같은 값의 화면 폭이 줄거나 값이 커진다(스윕 #12)', () => {
    const { s } = scaled()
    const an = s.app.lift.an, pose = s.app.pose, mmPer = s.app.lift.mmPerUnit
    const rows: { y: number; mm: number; px: number }[] = []
    for (const y of [760, 700, 640, 580]) {          // 화면 아래(가까움) → 위(깊음)
      const bar = scaleBarAt(an, pose, mmPer, { x: 200, y }, C.SCALEBAR_TARGET_PX, 'mm')
      if (!bar) continue
      rows.push({ y, mm: bar.mm, px: Math.hypot(bar.b.x - bar.a.x, bar.b.y - bar.a.y) })
    }
    expect(rows.length).toBeGreaterThanOrEqual(3)
    // 깊어질수록 «100px에 드는 실제 길이»는 늘거나 같다(원근) — mm 단조 비감소
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.mm).toBeGreaterThanOrEqual(rows[i - 1]!.mm)
  })

  it('④ 평행 사영 — 어느 닻에서도 같은 값·같은 폭(균일)', () => {
    const { s, wall } = scaled()
    const an = s.app.lift.an, mmPer = s.app.lift.mmPerUnit
    // 평행 정면 뷰에서는 지면이 «선»이라 pointOnGround가 못 선다 — 슬라브 정면(위에서
    // 내려보는 평행)으로 잰다: 바닥 면의 정면 뷰.
    const floorF = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
    const c2 = floorF.outer.reduce((a, p) => v3(a.x + p.x / floorF.outer.length, a.y + p.y / floorF.outer.length, a.z + p.z / floorF.outer.length), v3(0, 0, 0))
    const top = parallelPose(faceFrontPose(c2, floorF.normal, s.app.pose, 10), c2)   // 정면 + 평행(44의 그 합성)
    expect(top.proj?.w).toBe(1)
    const bars = [
      scaleBarAt(an, top, mmPer, { x: 300, y: 500 }, C.SCALEBAR_TARGET_PX, 'mm'),
      scaleBarAt(an, top, mmPer, { x: 700, y: 300 }, C.SCALEBAR_TARGET_PX, 'mm'),
      scaleBarAt(an, top, mmPer, { x: 500, y: 650 }, C.SCALEBAR_TARGET_PX, 'mm'),
    ]
    for (const b of bars) expect(b).not.toBeNull()
    const mms = bars.map(b => b!.mm)
    const pxs = bars.map(b => Math.hypot(b!.b.x - b!.a.x, b!.b.y - b!.a.y))
    expect(new Set(mms).size).toBe(1)                        // 값 균일
    for (const p of pxs) expect(Math.abs(p - pxs[0]!)).toBeLessThan(0.5)   // 폭 균일(0.5px)
  })
})

describe('47-2 사람', () => {
  it('① 지면 탭 → 접지 · 지평선 위 탭 → 거부 · 실행취소·재실행', () => {
    const { s } = scaled()
    s.app.placePerson = true
    const q = placePersonAt(s.app, { x: 450, y: 600 })
    expect(q).not.toBeNull()
    expect(Math.abs(q!.g.y)).toBeLessThan(1e-9)              // 접지(y=0)
    expect(s.app.placePerson).toBe(false)                    // 한 번 놓으면 풀린다
    expect(placePersonAt(s.app, { x: 450, y: 100 })).toBeNull()   // 지평선 위 — 거부
    undo(s.app)
    expect(s.app.doc.persons ?? []).toHaveLength(0)
    redo(s.app)
    expect(s.app.doc.persons).toHaveLength(1)
  })

  it('② 눈이 지평선에 얹힌다 — 여러 거리에서(좌표로 · 지시 문면)', () => {
    const { s } = scaled()
    const an = s.app.lift.an, pose = s.app.pose
    const hz = horizonScreenY(an, pose)!
    for (const y of [760, 680, 600, 540]) {
      const q = placePersonAt(s.app, { x: 400, y })
      if (!q) continue
      const eye = project(an, pose, { x: q.g.x, y: C.EYE_HEIGHT + q.g.y, z: q.g.z })!
      expect(Math.abs(eye.y - hz)).toBeLessThan(1e-6)
      // 발은 짚은 그 자리다
      const foot = project(an, pose, q.g)!
      expect(Math.abs(foot.x - 400)).toBeLessThan(1e-6)
      expect(Math.abs(foot.y - y)).toBeLessThan(1e-6)
    }
    expect((s.app.doc.persons ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('③ 저장 왕복 — persons가 실리고 모양 틀린 항만 버려진다', () => {
    const { s } = scaled()
    placePersonAt(s.app, { x: 450, y: 600 })
    placePersonAt(s.app, { x: 700, y: 640 })
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    const back = parseBrnl(txt)!
    expect(back.doc.persons).toHaveLength(2)
    expect(back.doc.persons![0]!.g).toEqual(s.app.doc.persons![0]!.g)
    const txt2 = serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: back.drawView })
    expect(txt2).toBe(txt)                                   // 바이트 왕복(43-1)
    const j = JSON.parse(txt)
    j.persons[0].g = { x: 1, y: 'bad' }
    const b2 = parseBrnl(JSON.stringify(j))!
    expect(b2.doc.persons).toHaveLength(1)                   // 그 항만 버렸다
    // persons 없던 옛 파일 — 열쇠가 없다(왕복 동일성)
    const r0 = roomSession()
    const t0 = serializeBrnl({ doc: r0.s.app.doc, nextId: r0.s.app.nextId, drawView: r0.s.app.drawView })
    expect(t0).not.toContain('"persons"')
  })

  it('④ 스텐실 — 기기 저장·성함 검사(발이 눈 아래)', () => {
    clearStencil()
    expect(loadStencil()).toBeNull()                         // 기본 스텐실은 비어 있다(지시)
    saveStencil({ lines: [[{ x: 10, y: 10 }, { x: 20, y: 300 }]], eyeY: 72, footY: 348 })
    expect(loadStencil()).not.toBeNull()
    saveStencil({ lines: [], eyeY: 348, footY: 72 })         // 발이 눈 위 — 성하지 않다
    expect(loadStencil()).toBeNull()
    clearStencil()
  })
})

describe('47-3 면적·부피', () => {
  it('① 축척 미정 → null(#61) · 축척이 서면 잡은 면의 값이 검산과 맞는다', () => {
    const r0 = roomSession()
    expect(u2ToM2(faceAreaU2(r0.wall), r0.s.app.lift.mmPerUnit)).toBeNull()
    const { s, floorF } = scaled()
    const mmPer = s.app.lift.mmPerUnit!
    // 검산 — 같은 정점·다른 식(신발끈을 평면 기저에서): 삼각분할 결함을 잡는다(D-3 짝)
    const n = floorF.normal
    const u = v3(1, 0, 0), w = v3(-(n.x * 1) / (n.y || 1), 0, 0)
    void u; void w
    // 바닥은 y≈0 평면 — x·z 신발끈이 그 검산이다
    let s2 = 0
    const P = floorF.outer
    for (let i = 0; i < P.length; i++) {
      const a = P[i]!, b = P[(i + 1) % P.length]!
      s2 += a.x * b.z - b.x * a.z
    }
    const shoelace = Math.abs(s2 / 2)
    const tri = faceAreaU2(floorF)
    expect(Math.abs(tri - shoelace) / shoelace).toBeLessThan(1e-9)
    const m2 = u2ToM2(tri, mmPer)!
    expect(m2).toBeGreaterThan(0)
  })

  it('② 바닥면적 — 근거 id가 값과 같이 나간다 · 놓친 슬라브만큼 정확히 모자란다', () => {
    const { s, floorF } = scaled()
    const fa = floorArea(s.app.faces, s.app.doc.faces, s.app.lift.mmPerUnit)!
    expect(fa.ids).toEqual([floorF.id])                      // 근거 = 그 슬라브
    // 놓침 시나리오 — 슬라브가 후보에서 빠지면(면 목록에서 제거) 합이 그 몫만큼 준다
    const without = floorArea(s.app.faces.filter(f => f.id !== floorF.id), s.app.doc.faces, s.app.lift.mmPerUnit)
    expect(without).toBeNull()                               // 남은 슬라브가 없다 → 숫자를 안 낸다
  })

  it('③ 부피 — 벽 높이 균일이면 바닥×높이 · 아니면 안 낸다(사유가 값이다)', () => {
    const { s } = scaled()
    const vo = volume(s.app.faces, s.app.doc.faces, s.app.lift.mmPerUnit)
    expect(vo.why).toBeNull()
    expect(vo.report).not.toBeNull()
    const fa = floorArea(s.app.faces, s.app.doc.faces, s.app.lift.mmPerUnit)!
    expect(Math.abs(vo.report!.m3 - fa.m2 * vo.report!.hM) / vo.report!.m3).toBeLessThan(1e-9)
    // 반증(D-3) — 벽 높이를 비균일로 만든 합성 벽을 더하면 why='uneven'으로 죽는다
    const tallWall: ResolvedFace = {
      ...s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!,
      id: 9901,
      outer: s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!.outer.map(p => ({ ...p, y: p.y * 3 })),
    }
    const vo2 = volume([...s.app.faces, tallWall], s.app.doc.faces, s.app.lift.mmPerUnit)
    expect(vo2.why).toBe('uneven')
    expect(vo2.report).toBeNull()
  })

  it('④ 상태 래퍼 — gripFaceArea는 잡은 면이 있어야 · floorAreaNow/volumeNow가 같은 값(#54)', () => {
    const { s } = scaled()
    expect(gripFaceArea(s.app)).toBeNull()                   // 안 잡았다
    const fa = floorAreaNow(s.app)
    const fb = floorArea(s.app.faces, s.app.doc.faces, s.app.lift.mmPerUnit)
    expect(fa).toEqual(fb)
    expect(volumeNow(s.app).report?.m3).toBe(volume(s.app.faces, s.app.doc.faces, s.app.lift.mmPerUnit).report?.m3)
  })
})

describe('47-4 실 — 알고리즘 팔(합성 벽 · ⚑의 판정 자료)', () => {
  /** 합성 벽 — 밑변 (x0,z0)→(x1,z1), 높이 h, 개구부 유무 */
  const mkWall = (id: number, x0: number, z0: number, x1: number, z1: number, hole = false): ResolvedFace => ({
    id,
    outer: [v3(x0, 0, z0), v3(x1, 0, z1), v3(x1, 2, z1), v3(x0, 2, z0)],
    holes: hole ? [[v3((x0 + x1) / 2 - 0.2, 0, (z0 + z1) / 2), v3((x0 + x1) / 2 + 0.2, 0, (z0 + z1) / 2), v3((x0 + x1) / 2 + 0.2, 1.5, (z0 + z1) / 2), v3((x0 + x1) / 2 - 0.2, 1.5, (z0 + z1) / 2)]] : [],
    normal: v3(-(z1 - z0), 0, x1 - x0),
    flat: 0,
    tris: [],
  })
  const docF = (ids: number[]): Face[] => ids.map(id => ({ id, loops: [], cls: 'wall' as const }))

  it('① 닫힌 사각 넷 → 실 1 · 헛것 0 · 넓이 정확', () => {
    const walls = [mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 4, 3), mkWall(3, 4, 3, 0, 3), mkWall(4, 0, 3, 0, 0)]
    const g = findRooms(walls, docF([1, 2, 3, 4]))
    expect(g.rooms).toHaveLength(1)
    expect(Math.abs(g.rooms[0]!.areaU2 - 12)).toBeLessThan(1e-9)
    expect([...g.rooms[0]!.wallIds].sort()).toEqual([1, 2, 3, 4])
  })

  it('② 두 실(벽 일곱 · 공유 벽 하나) → 실 2 · 개구부가 있으면 연결 1', () => {
    const walls = [
      mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 8, 0),
      mkWall(3, 8, 0, 8, 3), mkWall(4, 8, 3, 4, 3), mkWall(5, 4, 3, 0, 3),
      mkWall(6, 0, 3, 0, 0),
      mkWall(7, 4, 0, 4, 3, true),      // 공유 벽 — 개구부
    ]
    const g = findRooms(walls, docF([1, 2, 3, 4, 5, 6, 7]))
    expect(g.rooms).toHaveLength(2)
    const areas = g.rooms.map(r => r.areaU2).sort((a, b) => a - b)
    expect(Math.abs(areas[0]! - 12)).toBeLessThan(1e-9)
    expect(Math.abs(areas[1]! - 12)).toBeLessThan(1e-9)
    expect(g.links).toHaveLength(1)
    expect(g.links[0]!.wallId).toBe(7)
  })

  it('③ 열린 셋(벽 하나 빠짐) → 실 0 (헛것을 안 만든다 — ⚑의 판정 절반)', () => {
    const walls = [mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 4, 3), mkWall(3, 4, 3, 0, 3)]
    const g = findRooms(walls, docF([1, 2, 3]))
    expect(g.rooms).toHaveLength(0)
  })

  it('④ 앱 경로 — 방 픽스처(벽 하나뿐)는 실 0 (닫힌 영역이 없다 — 참)', () => {
    const { s } = scaled()
    const g = findRooms(s.app.faces, s.app.doc.faces)
    expect(g.rooms).toHaveLength(0)
  })
})
