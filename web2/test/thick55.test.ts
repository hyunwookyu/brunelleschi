// web2-55 — 두께와 분류의 상태·기하 팔.
//
// 픽스처는 paint45의 방(바닥+벽 — 앱 경로)이다. 재는 것:
//   ① 분류 정의 병합(clsDefOf — 기본값 위 부분 덮어쓰기) · slotOffsets(가운데/한쪽 · t=0)
//   ② faceThickness — 예외(Face.ex.t)가 분류를 이긴다 · **반증(D-3)**: 예외를 걷으면
//      분류의 t가 다시 다스린다(지시 문면 «예외를 덮으면 계측이 살아 있음»의 상태판)
//   ③ setClsThickness 일괄 — 같은 분류의 면 «전부»가 따라 바뀌고 예외 준 면만 안 바뀐다
//      · op 재사용(«2»→«25» 두 번 실어도 실행취소 **한 번**에 처음으로)
//   ④ faceSlotsOf — 축척 미정이면 null(두께는 실측 mm — 자 없이 못 그린다) ·
//      축척이 서면 tW = t/mmPerUnit(49의 그 자)
//   ⑤ 띠 좌표의 «미터» 불변(지시 ⛔ 정규화) — 같은 (s,u)는 t가 커져도 평면 안 같은
//      자리다(법선 방향만 이동) · **반증**: 정규화(u/tW)로 읽으면 실제로 자리가 는다
//   ⑥ 저장 왕복 — clsDefs·ex·e가 바이트로 돈다(43-1 ①의 규약은 roundtrip43이 지키고,
//      여기서는 55 필드의 값 보존만 짚는다)

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import {
  toggleFaceAt, setClsThickness, setFaceThicknessEx, faceSlotsOf, faceThicknessNow,
  undo, setDimension, beginHold, applyRecognized, endWriting, writeActive,
} from '../src/app/state'
import { clsDefOf, DEFAULT_CLS, slotOffsets, faceThickness } from '../src/core/clsdef'
import { borderQuads, borderTo3 } from '../src/core/border'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { sub3, len3, dot3, norm3 } from '../src/core/vec'

const W = 1200, H = 800

/** 방(바닥+벽) — paint45 roomSession과 같은 좌표(앱 경로). */
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
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  expect(s.app.faces.length).toBe(2)
  const wall = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
  const floor = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  return { s, floorId: floor.id, wallId: wall.id }
}

/** 축척을 세운다 — 기둥(500,500→500,380)이 문서에서 여섯째 획이다(paint50 bigBox의 문법). */
function withScale(s: Session, mm = 2500) {
  const post = s.app.doc.strokes[5]!
  expect(setDimension(s.app, post.id, mm)).toBe('scale')
  expect(s.app.lift.mmPerUnit).not.toBeNull()
}

describe('55 ① 분류 정의 — 병합과 슬롯', () => {
  it('기본값은 전부 t=0이고 덮어쓰기는 필드 단위로 병합된다', () => {
    for (const k of Object.keys(DEFAULT_CLS) as (keyof typeof DEFAULT_CLS)[]) {
      expect(DEFAULT_CLS[k].t).toBe(0)
    }
    const doc = { clsDefs: { wall: { t: 200 } } }
    const d = clsDefOf(doc, 'wall')
    expect(d.t).toBe(200)
    expect(d.off).toBe(DEFAULT_CLS.wall.off)     // 안 덮은 필드는 기본값
    expect(d.pri).toBe(DEFAULT_CLS.wall.pri)
    expect(clsDefOf(doc, 'slab').t).toBe(0)      // 딴 분류는 무변
  })
  it('slotOffsets — 가운데는 ±t/2 · 한쪽은 (0, −t) · t=0은 (0,0)', () => {
    expect(slotOffsets(200, 'c')).toEqual({ front: 100, back: -100 })
    expect(slotOffsets(200, 's')).toEqual({ front: 0, back: -200 })
    expect(slotOffsets(0, 'c')).toEqual({ front: 0, back: 0 })
  })
})

describe('55 ② 예외가 분류를 이긴다 (+반증: 걷으면 돌아온다)', () => {
  it('faceThickness — ex.t > 분류 t · 예외 제거 후 분류 값', () => {
    const doc = { clsDefs: { wall: { t: 200 } } }
    const face = { id: 1, loops: [], ex: { t: 350 } } as never
    const a = faceThickness(doc, face, 'wall')
    expect(a).toEqual({ t: 350, off: 'c', ex: true })
    const b = faceThickness(doc, { id: 1, loops: [] } as never, 'wall')
    expect(b).toEqual({ t: 200, off: 'c', ex: false })   // 반증 — 예외가 없으면 분류가 다스린다
  })
})

describe('55 ③ 일괄과 예외 — 상태 경로', () => {
  it('setClsThickness — 같은 분류 전부 · 예외 면만 남는다 · op 재사용 = 실행취소 한 번', () => {
    const { s, floorId, wallId } = roomSession()
    // 벽에 예외 먼저 — 그 뒤 분류 일괄이 이 면을 안 건드린다(지시 게이트)
    expect(setFaceThicknessEx(s.app, wallId, 300)).not.toBeNull()
    const r1 = setClsThickness(s.app, wallId, 200)!      // 벽 분류 일괄 t=200
    expect(r1.cls).toBe('wall')
    expect(r1.n).toBe(0)                                  // 이 방의 벽은 하나뿐이고 그건 예외다
    expect(faceThicknessNow(s.app, wallId)).toEqual({ cls: 'wall', t: 300, ex: true })
    expect(faceThicknessNow(s.app, floorId)).toEqual({ cls: 'slab', t: 0, ex: false })
    // 예외를 걷으면(D-3 반증) 분류의 200이 이 면을 다시 다스린다
    expect(setFaceThicknessEx(s.app, wallId, undefined)).not.toBeNull()
    expect(faceThicknessNow(s.app, wallId)).toEqual({ cls: 'wall', t: 200, ex: false })
    // op 재사용 — «2»→«25»처럼 같은 뭉치의 재적용은 op 하나다: undo 한 번에 200 이전(0)으로
    const depth0 = s.app.undoStack.length
    const ra = setClsThickness(s.app, wallId, 2)!
    const rb = setClsThickness(s.app, wallId, 25, ra.op)!
    expect(s.app.undoStack.length).toBe(depth0 + 1)
    expect(faceThicknessNow(s.app, wallId)!.t).toBe(25)
    undo(s.app)
    expect(faceThicknessNow(s.app, wallId)!.t).toBe(200)  // 뭉치 전 값으로 — 한 번에
    void rb
  })
})

describe('55 ④ faceSlotsOf — 축척이 자다', () => {
  it('축척 미정이면 null · 축척이 서면 tW = t/mmPerUnit', () => {
    const { s, wallId } = roomSession()
    setClsThickness(s.app, wallId, 200)
    const rf = s.app.faces.find(f => f.id === wallId)!
    expect(faceSlotsOf(s.app, rf), '축척 미정 — 두께를 못 그린다(값은 남는다)').toBeNull()
    withScale(s)
    const rf2 = s.app.faces.find(f => f.id === wallId)!
    const slots = faceSlotsOf(s.app, rf2)!
    expect(slots).not.toBeNull()
    const mmPer = s.app.lift.mmPerUnit!
    expect(slots.tW).toBeCloseTo(200 / mmPer, 9)
    expect(slots.frontW).toBeCloseTo(slots.tW / 2, 9)     // 기본 가운데
    expect(slots.backW).toBeCloseTo(-slots.tW / 2, 9)
  })
})

describe('55 ⑤ 띠 좌표는 세계 단위다 — t가 커져도 자국 자리가 안 는다', () => {
  it('같은 (s,u)의 3D가 t 200→300에서 평면 안 성분 불변(법선 이동만) · 반증 = 정규화', () => {
    const { s, wallId } = roomSession()
    withScale(s)
    const rf = s.app.faces.find(f => f.id === wallId)!
    const mmPer = s.app.lift.mmPerUnit!
    const n = norm3(rf.normal)
    const probe = { s: 0.7, u: 0.02 }                     // 세계 단위의 한 자리
    const of200 = slotOffsets(200 / mmPer, 'c')
    const of300 = slotOffsets(300 / mmPer, 'c')
    const P200 = borderTo3(rf, of200.front, of200.back, probe.s, probe.u)!
    const P300 = borderTo3(rf, of300.front, of300.back, probe.s, probe.u)!
    const d = sub3(P300, P200)
    const alongN = dot3(d, n)
    const inPlane = len3(sub3(d, { x: n.x * alongN, y: n.y * alongN, z: n.z * alongN }))
    expect(inPlane, '평면 안 성분 0 — (s,u)는 미터라 t와 무관').toBeLessThan(1e-9)
    expect(Math.abs(alongN), '법선 성분 = 뒤 표면의 이동량').toBeCloseTo(
      Math.abs(of300.back - of200.back), 9)
    // 반증(D-3) — 정규화(u를 tW 비율로 저장)했다면: 같은 «비율»의 3D는 u 자리가 실제로 는다
    const uNorm = probe.u / (200 / mmPer)                 // t=200에서의 비율
    const Pn300 = borderTo3(rf, of300.front, of300.back, probe.s, uNorm * (300 / mmPer))!
    const dn = len3(sub3(Pn300, P300))
    expect(dn, '정규화 저장이었다면 자국이 1.5배 자리로 밀린다 — 그 어긋남이 실재').toBeGreaterThan(1e-6)
  })
  it('borderQuads — 외곽+개구부 전부 · 누적 호길이가 총합과 맞는다', () => {
    const { s, wallId } = roomSession()
    const rf = s.app.faces.find(f => f.id === wallId)!
    const { quads, total } = borderQuads(rf)
    expect(quads.length).toBeGreaterThanOrEqual(4)
    const sum = quads.reduce((m, q) => m + q.len, 0)
    expect(sum).toBeCloseTo(total, 9)
    const last = quads[quads.length - 1]!
    expect(last.s0 + last.len).toBeCloseTo(total, 9)
  })
})

describe('55 ⑥ 저장 왕복 — 55 필드의 값 보존', () => {
  it('clsDefs·ex가 왕복하고, 없으면 열쇠가 안 생긴다(옛 문서 바이트 무변의 반쪽)', () => {
    const { s, wallId } = roomSession()
    const bytes0 = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: null })
    expect(bytes0.includes('clsDefs'), 't=0 문서에 55 열쇠가 없다').toBe(false)
    expect(bytes0.includes('"ex"'), '예외 없는 문서에 ex가 없다').toBe(false)
    setClsThickness(s.app, wallId, 200)
    setFaceThicknessEx(s.app, wallId, 350)
    const bytes = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: null })
    const back = parseBrnl(bytes)!
    expect(back).not.toBeNull()
    expect(back.doc.clsDefs?.wall?.t).toBe(200)
    expect(back.doc.faces.find(f => f.id === wallId)?.ex?.t).toBe(350)
    const bytes2 = serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: null })
    expect(bytes2, '재직렬화 바이트 동일(43-1 ①의 55판)').toBe(bytes)
  })
})

describe('55 ⑦ 손글씨 배선 — applyRecognized의 두께 갈래(값 넣는 길의 판정자)', () => {
  it('면을 잡고(thick 모드) 숫자가 분류 t로 실린다 · 재적용은 op 하나 · 예외 모드는 이 면만', () => {
    const { s, wallId } = roomSession()
    // 면 잡기(꾹 누름) — 글씨 세션이 열린다(44의 규약 그대로)
    const r = beginHold(s.app, { x: 550, y: 430 }, 1000)
    expect(r?.kind).toBe('face')
    expect(writeActive(s.app)).toBe(true)
    const w = s.app.write!
    // 손통 「두께」의 상태 전환(main의 doGripAction이 하는 그 둘) — 여기서는 상태로 직접
    w.thick = 1
    // 글씨 잉크가 있어야 인식 갈래가 돈다(applyRecognized의 handwritingGroup 문) — 실제
    // 글씨 획 하나를 앱 경로로 쓴다(session.write — input의 글씨 갈래 그대로).
    const wr = s.write([{ x: 552, y: 424 }, { x: 553, y: 434 }, { x: 551, y: 440 }], 1200)
    expect(wr.asText).toBe(true)
    // «2» → «25» — 값이 획마다 다시 실려도 undo 한 칸
    const depth0 = s.app.undoStack.length
    expect(applyRecognized(s.app, '2')).toBe('applied')
    expect(applyRecognized(s.app, '25')).toBe('applied')
    expect(s.app.undoStack.length).toBe(depth0 + 1)
    expect(faceThicknessNow(s.app, wallId)).toEqual({ cls: 'wall', t: 25, ex: false })
    // 예외 모드(재누름) — 이 면만
    w.thickEx = 1
    w.thickOp = undefined
    expect(applyRecognized(s.app, '300')).toBe('applied')
    expect(faceThicknessNow(s.app, wallId)).toEqual({ cls: 'wall', t: 300, ex: true })
    // 못 읽는 값은 unread — 손글씨로 남는 규약(치수와 같다)
    expect(applyRecognized(s.app, 'abc')).toBe('unread')
    endWriting(s.app, 'idle')
    expect(s.app.write).toBeNull()
  })
})
