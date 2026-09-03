// web2-57 — 면은 획의 «구간»을 든다.
//
// 결함(사람 실사용): 판정된 영역으로 면을 만든 뒤 삐져나간 토막을 지우개로 정리하면
// **면이 통째로 사라졌다**(50 이후 칠이, 55 이후 두께가 같이 날아간다). 원인은
// eraseAt이 남는 조각을 **새 id의 새 획**으로 갈아 끼우는 것 — 면은 획 id로 경계를
// 든다(FaceEdge.s). 답은 «구간»: 면이 실제로 쓰는 범위(이웃 경계 직선과의 교점
// 매개변수)는 파생으로 계산되고, 지우개가 그 구간을 **덮는 조각**을 남기면 참조가
// 그 조각으로 넘어탄다(op.edgeMoved — 실행취소 대상). 구간 자체가 지워지면 면이
// 열린다(대기 · 불변식 j) — 조용하면 안 된다(eraseAt이 열린 면 id를 돌려준다).
//
// 게이트(지시): ① 토막 지움 → 면 산다(id·칠·두께 동일) ② 옮김 → 따라온다(무회귀)
// ③ 구간 지움 → 열리고 사라진다(알림 값) ④ 반증(D-3): 이관을 끄면 결함 재현
// ⑤ 저장 왕복 — 새 필드 없음(KEY_ORDER 무변)

import { describe, it, expect, afterEach } from 'vitest'
import { session, type Session } from './session'
import {
  toggleFaceAt, beginErase, eraseAt, endErase, undo, redo,
  commitPaint, setDimension, setClsThickness, faceSlotsOf, setSpanCarryForTest,
  beginHold, gripBase, applyMove,
} from '../src/app/state'
import { edgeSpanOf } from '../src/core/face'
import { pieces } from '../src/core/pieces'
import { DRAW_POSE } from '../src/core/camera'
import { solveMove } from '../src/core/grip'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { liftAll } from '../src/core/lift'
import { resolveFaces } from '../src/core/face'
import { sub3, len3, type V3 } from '../src/core/vec'
import type { Stroke } from '../src/core/types'

afterEach(() => setSpanCarryForTest(true))

// ── 픽스처 — face.test.ts의 quad(끝점이 안 만나는 사각형) 그대로: 두 획이 서로를
// 가로질러 삐져나간다. 교차 (500,433.33)이 모서리이고 그 너머가 «토막»이다.
function quadScene() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)               // 지평선
  s.draw(500, 500, 700, 450)                // 깊이선 vp0 (900,400) — role vp
  s.draw(500, 500, 300, 450)                // 깊이선 vp1 (100,400) — role vp
  const e4 = s.draw(700, 450, 400, 425)!    // vp1축 — (500,433.33)을 지나 삐져나감
  const e5 = s.draw(300, 450, 600, 425)!    // vp0축 — 마찬가지
  return { s, e4, e5 }
}

function makeFace(s: Session): number {
  expect(toggleFaceAt(s.app, { x: 500, y: 465 })).toBe('added')
  return s.app.doc.faces[0]!.id
}

function eraseOnce(s: Session, p: { x: number; y: number }): number[] {
  s.app.tool = 'eraser-pencil'
  s.app.eraserRadius = 5                    // 제품 크기통의 최소(34-3) — 이웃 조각을 안 문다
  beginErase(s.app)
  const opened = eraseAt(s.app, p)
  endErase(s.app)
  return opened
}

const STUB_E4 = { x: 420, y: 426.67 }       // e4의 토막(구간 밖) 위
const SPAN_E4 = { x: 620, y: 443.33 }       // e4의 구간(모서리 (700,450)~(500,433.33)) 위

describe('구간 — 파생 계산(edgeSpanOf)', () => {
  it('경계마다 이웃 직선 교점이 끊는 [lo,hi]가 나온다 — e4의 구간이 토막을 뺀 절반대다', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const ei = face.loops[0]!.edges.findIndex(e => e.s === e4.id)
    expect(ei).toBeGreaterThanOrEqual(0)
    const span = edgeSpanOf(s.app.lift, face, 0, ei)!
    expect(span).not.toBeNull()
    // e4: (700,450)→(400,425). 모서리 = 끝점(t=0)과 e5와의 교차. ⚠ t는 **3D 매개변수**다 —
    // 화면 분율(2/3)이 아니다(원근 단축). 기대값은 같은 자(조각의 절단 t)에서 읽는다(#88).
    const cutT = pieces(s.app.lift, DRAW_POSE)
      .filter(x => x.strokeId === e4.id).map(x => x.t1).sort((a, b) => a - b)[0]!
    expect(cutT).toBeGreaterThan(0.01)
    expect(cutT).toBeLessThan(0.99)
    expect(span.lo).toBeCloseTo(0, 6)
    expect(span.hi).toBeCloseTo(cutT, 6)
  })

  it('이웃 경계가 안 풀리면 null — 구간은 면이 풀릴 때만 선다', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const ei = face.loops[0]!.edges.findIndex(e => e.s === e4.id)
    const broken = { ...face, loops: [{ edges: face.loops[0]!.edges.map(e => ({ ...e })) }] }
    broken.loops[0]!.edges[(ei + 1) % broken.loops[0]!.edges.length]!.s = 99999
    expect(edgeSpanOf(s.app.lift, broken, 0, ei)).toBeNull()
  })
})

describe('게이트 ① — 삐져나간 토막을 지운다 → 면이 산다', () => {
  it('면 id 동일 · 참조는 구간을 덮는 새 조각으로 넘어탄다 · 열림 알림 0 (D-3 반증의 짝)', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    expect(s.app.faces).toHaveLength(1)
    const opened = eraseOnce(s, STUB_E4)
    expect(opened).toEqual([])                                  // 이관 성공 — 알림이 안 난다
    expect(s.app.doc.strokes.some(x => x.id === e4.id)).toBe(false)  // 획은 실제로 갈렸다
    expect(s.app.doc.faces).toHaveLength(1)
    expect(s.app.doc.faces[0]!.id).toBe(fid)                    // 면 id 동일
    expect(s.app.faces).toHaveLength(1)                         // **면이 산다**
    expect(s.app.faces[0]!.id).toBe(fid)
    const face = s.app.doc.faces[0]!
    expect(face.loops[0]!.edges.some(e => e.s === e4.id)).toBe(false)  // 옛 id가 아니라
    // 기하 불변 — 모서리는 직선 교점이라 이관 전후 같은 자리다
    const near = (a: V3, b: V3) => len3(sub3(a, b)) < 1e-9
    const before = quadScene()
    makeFace(before.s)
    for (let i = 0; i < 4; i++) {
      expect(near(s.app.faces[0]!.outer[i]!, before.s.app.faces[0]!.outer[i]!)).toBe(true)
    }
  })

  it('칠 픽셀(uv 기하) 동일 · 두께 동일 — 피해의 크기가 0이 된다', () => {
    const { s, e5 } = quadScene()
    const fid = makeFace(s)
    // 칠 — 면 위 한 붓(앱 경로 commitPaint). 두께 — 축척(치수) + 분류 두께.
    const pts = [470, 485, 500, 515, 530].map(x => ({ x, y: 468 }))
    expect(commitPaint(s.app, pts).placed).toBe(1)
    expect(setDimension(s.app, e5.id, 3000)).toBe('scale')
    expect(setClsThickness(s.app, fid, 200)).not.toBeNull()
    const geoBefore = [...s.app.paintGeo.values()][0]!.map(p => ({ ...p }))
    const slotsBefore = faceSlotsOf(s.app, s.app.faces[0]!)!
    expect(slotsBefore).not.toBeNull()
    const opened = eraseOnce(s, STUB_E4)
    expect(opened).toEqual([])
    expect(s.app.faces).toHaveLength(1)
    expect(s.app.paintGeo.size).toBe(1)                         // 칠이 산다
    const geoAfter = [...s.app.paintGeo.values()][0]!
    expect(geoAfter).toHaveLength(geoBefore.length)
    for (let i = 0; i < geoAfter.length; i++) {
      expect(len3(sub3(geoAfter[i]!, geoBefore[i]!))).toBeLessThan(1e-9)   // 같은 자리
    }
    const slotsAfter = faceSlotsOf(s.app, s.app.faces[0]!)!     // 두께가 산다
    expect(slotsAfter.tW).toBeCloseTo(slotsBefore.tW, 12)
    expect(slotsAfter.frontW).toBeCloseTo(slotsBefore.frontW, 12)
  })

  it('양쪽 토막을 차례로 지워도 산다 — 이관이 이관 위에 선다', () => {
    const { s } = quadScene()
    const fid = makeFace(s)
    eraseOnce(s, STUB_E4)                                       // e4 토막
    expect(s.app.faces).toHaveLength(1)
    eraseOnce(s, { x: 580, y: 426.67 })                         // e5 토막((500,433.33) 너머)
    expect(s.app.faces).toHaveLength(1)
    expect(s.app.faces[0]!.id).toBe(fid)
  })

  it('구간이 여러 조각이어도(수직 획이 3D에서 가른다) 토막 지움에 산다 · 참조 조각을 지우면 열린다', () => {
    const { s, e4 } = quadScene()
    // e4의 구간 안 (600,441.67)에 수직 획을 세운다 — 3D 교차로 e4가 조각 둘로 갈리지만
    // 수직 획은 지면 평면 밖이라 루프에는 안 든다(경계 하나 · 조각 여럿 — 재려는 상태).
    const cross = s.draw(600, 441.67, 600, 360)!
    expect(s.app.lift.lifted.has(cross.id)).toBe(true)
    const fid = makeFace(s)
    expect(s.app.doc.faces[0]!.loops[0]!.edges.filter(e => e.s === e4.id)).toHaveLength(1)
    expect(s.app.faces).toHaveLength(1)
    const opened = eraseOnce(s, STUB_E4)                        // 토막(구간 밖)
    expect(opened).toEqual([])
    expect(s.app.faces).toHaveLength(1)                         // 조각 합집합이 구간을 덮는다
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const ref = face.loops[0]!.edges.map(e => e.s)
    // 참조가 넘어탄 조각을 지운다 → 구간이 다친다 → 열린다
    const carriedId = ref.find(id => id > cross.id)!            // 새 조각 id(원획들보다 크다)
    expect(carriedId).toBeDefined()
    const refPiece = s.app.doc.strokes.find(x => x.id === carriedId)!
    const mid = { x: (refPiece.a.x + refPiece.b.x) / 2, y: (refPiece.a.y + refPiece.b.y) / 2 }
    const opened2 = eraseOnce(s, mid)                           // 참조 조각의 몸통
    expect(opened2).toEqual([fid])
    expect(s.app.faces).toHaveLength(0)
  })
})

describe('게이트 ② — 획을 옮긴다 → 면이 따라온다 (무회귀 · 이관 뒤에도)', () => {
  it('이관된 조각을 옮기면 면이 같이 움직인다 — 구간이 따라 움직인다', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    eraseOnce(s, STUB_E4)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const carried = face.loops[0]!.edges.map(e => e.s).find(id =>
      id !== e4.id && s.app.doc.strokes.some(x => x.id === id)
      && s.app.lift.an.roles.get(id) === 'content')!
    const before = s.app.faces[0]!.outer.map(p => ({ ...p }))
    s.app.tool = 'pencil'
    const r = beginHold(s.app, SPAN_E4, 1000)                   // 이관된 조각 몸통
    expect(r).not.toBeNull()
    expect(s.app.grip!.ids).toContain(carried)
    const { base, base3 } = gripBase(s.app)
    const anchor3 = { ...s.app.lift.lifted.get(carried)!.a3 }
    // vp0 방향으로 끈다(제 축(vp1)로 끌면 제 직선 위 미끄러짐이라 면이 안 변한다)
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 760, y: 435 })!
    expect(sol).not.toBeNull()
    expect(applyMove(s.app, base, base3, sol.dir, sol.t)).not.toBeNull()
    expect(s.app.faces).toHaveLength(1)                         // 여전히 풀린다
    const after = s.app.faces[0]!.outer
    const moved = after.some((p, i) => len3(sub3(p, before[i]!)) > 1e-6)
    expect(moved).toBe(true)                                    // **따라왔다**
  })
})

describe('게이트 ③ — 구간 자체를 지운다 → 면이 열리고, 조용하지 않다', () => {
  it('구간 위를 지우면 면이 사라지고(대기 — 불변식 j) 열린 면 id가 나온다 · 실행취소로 돌아온다', () => {
    const { s } = quadScene()
    const fid = makeFace(s)
    const opened = eraseOnce(s, SPAN_E4)
    expect(opened).toEqual([fid])                               // **조용하지 않다**
    expect(s.app.faces).toHaveLength(0)                         // 열려서 사라진다
    expect(s.app.doc.faces).toHaveLength(1)                     // 버려지지 않는다(불변식 j)
    undo(s.app)
    expect(s.app.faces).toHaveLength(1)                         // 획이 돌아오면 면도 돌아온다
  })

  it('획 전체를 지워도 같다 — 조각이 하나도 안 남으면 열린다', () => {
    const { s } = quadScene()
    const fid = makeFace(s)
    // e4를 전부 지운다(두 조각을 차례로)
    eraseOnce(s, SPAN_E4)
    const opened2 = eraseOnce(s, STUB_E4)
    expect(s.app.faces).toHaveLength(0)
    expect(opened2).toEqual([])                                 // 이미 열려 있던 면은 다시 안 센다
    expect([fid]).toEqual([fid])
  })
})

describe('반증(D-3) — 구간 이관을 끄면 결함이 재현된다', () => {
  it('setSpanCarryForTest(false): 토막만 지워도 면이 죽는다(옛 참조 그대로)', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    setSpanCarryForTest(false)
    const opened = eraseOnce(s, STUB_E4)
    expect(s.app.faces).toHaveLength(0)                         // **결함 재현** — 이 검사가 잰다
    expect(s.app.doc.faces[0]!.loops[0]!.edges.some(e => e.s === e4.id)).toBe(true) // 참조가 낡았다
    expect(opened).toEqual([fid])                               // 열림 감지는 이관과 별개로 산다
  })
})

describe('실행취소 — 이관도 한 op다', () => {
  it('undo: 참조가 옛 획으로 돌아온다 · redo: 다시 넘어탄다', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    eraseOnce(s, STUB_E4)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const carriedId = face.loops[0]!.edges.find(e => e.s !== undefined && e.s !== e4.id
      && s.app.doc.strokes.some(x => x.id === e.s && x.own3))!.s
    undo(s.app)
    expect(s.app.doc.strokes.some(x => x.id === e4.id)).toBe(true)
    expect(face.loops[0]!.edges.some(e => e.s === e4.id)).toBe(true)   // 참조도 돌아왔다
    expect(s.app.faces).toHaveLength(1)
    redo(s.app)
    expect(face.loops[0]!.edges.some(e => e.s === carriedId)).toBe(true)
    expect(s.app.faces).toHaveLength(1)
  })
})

describe('저장 왕복 — 새 필드가 없다(구간은 파생)', () => {
  it('이관 뒤 .brnl 왕복 — 면이 그대로 풀린다 · 좌표는 여전히 안 담긴다', () => {
    const { s } = quadScene()
    makeFace(s)
    eraseOnce(s, STUB_E4)
    const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId })
    // "z"는 face.test 저장 팔의 종전 검사(좌표 미저장) 준용 · 따옴표 포함 키 검색이라
    // "loops"의 lo에는 안 걸린다. 반증(D-3): 이 패턴이 실제로 그 키를 잡는지 그 자리에서.
    expect(JSON.stringify({ lo: 1 })).toMatch(/"lo"/)
    expect(JSON.stringify({ loops: 1 })).not.toMatch(/"lo"/)
    expect(JSON.stringify(JSON.parse(text).faces)).not.toMatch(/"z"|"span"|"lo"|"hi"/)
    const back = parseBrnl(text)!
    const faces = resolveFaces(liftAll(back.doc), back.doc.faces)
    expect(faces).toHaveLength(1)
    expect(faces[0]!.outer).toHaveLength(4)
  })
})

describe('회귀 — 종전 거동', () => {
  it('경계가 하나뿐인 조각(삼각형 잇는 획)을 지우면 종전대로 열린다(face.test 317 유지)', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 700, 450)
    s.draw(500, 500, 300, 450)
    s.draw(700, 450, 300, 450)
    expect(toggleFaceAt(s.app, { x: 500, y: 470 })).toBe('added')
    const fid = s.app.doc.faces[0]!.id
    const opened = eraseOnce(s, { x: 500, y: 450 })
    expect(opened).toEqual([fid])                               // 이제는 조용하지도 않다
    expect(s.app.faces).toHaveLength(0)
    expect(s.app.doc.faces).toHaveLength(1)
    undo(s.app)
    expect(s.app.faces).toHaveLength(1)
  })
})
