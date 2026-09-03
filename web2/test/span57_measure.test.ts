// web2-57 — 측정 하네스: 구간 이관의 전/후 · 반경 축 · D-5 스윕 · 잔차 실측.
//
//   pre  = 반증 손잡이(setSpanCarryForTest(false))로 **옛 거동을 재현**한 값 — carryFaceEdges가
//          첫 줄에서 반환하므로 옛 경로와의 차이는 반환값(열림 목록)뿐이다(D-3의 자리).
//          ⚠ 수리 «전» 트리의 실측(D-2)은 별도 팔로 돌았고 그 팔은 삭제됐다 — 그 실행의
//          JSON은 없다(1차 [6] 자백). 여기 pre가 같은 값을 내는 근거는 두 실행이 **같은
//          단언 상수**(faces 0 · paintGeo 0 …)를 통과한 것이다(바이트 대조 아님 — #91의 자로는 추론).
//   post = 현행(이관 켬) — 게이트 ①의 값(#90 관문 안에서만 써진다 · #99 병합-쓰기).
//
// 원장: stage0/out/span57_web2.json
//   LEDGER=1 npx vitest run test/span57_measure.test.ts   (워커 1 · 스펙 하나씩 — #99)

import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, type Session } from './session'
import {
  toggleFaceAt, beginErase, eraseAt, endErase, setSpanCarryForTest,
  commitPaint, setDimension, setClsThickness, faceSlotsOf, undo,
  beginHold, gripBase, applyMove,
} from '../src/app/state'
import { edgeSpanOf } from '../src/core/face'
import { pieces } from '../src/core/pieces'
import { solveMove } from '../src/core/grip'
import { DRAW_POSE } from '../src/core/camera'
import { sub3, len3 } from '../src/core/vec'

afterEach(() => setSpanCarryForTest(true))

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(HERE, '../../stage0/out/span57_web2.json')
const OUT: Record<string, unknown> = {}

function quadScene() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 700, 450)
  s.draw(500, 500, 300, 450)
  const e4 = s.draw(700, 450, 400, 425)!
  const e5 = s.draw(300, 450, 600, 425)!
  return { s, e4, e5 }
}

function makeFace(s: Session): number {
  expect(toggleFaceAt(s.app, { x: 500, y: 465 })).toBe('added')
  return s.app.doc.faces[0]!.id
}

function eraseOnce(s: Session, p: { x: number; y: number }, radius = 5): number[] {
  s.app.tool = 'eraser-pencil'
  s.app.eraserRadius = radius               // 제품 크기통 값(34-3: 5·12·27·60)만 쓴다
  beginErase(s.app)
  const opened = eraseAt(s.app, p)
  endErase(s.app)
  return opened
}

const STUB_E4 = { x: 420, y: 426.67 }
const STUB_E5 = { x: 580, y: 426.67 }
const SPAN_E4 = { x: 620, y: 443.33 }

/** 칠 + 두께까지 얹은 장면에서 토막을 지운 전/후 — pre/post가 같은 함수로 잰다(#54).
 *  1차 [7]: 면 «id»의 전/후와 두께 «값»(tW·frontW·backW)을 수로 기록한다. */
function stubEraseRun(carry: boolean) {
  setSpanCarryForTest(carry)
  const { s, e4, e5 } = quadScene()
  const fid = makeFace(s)
  expect(commitPaint(s.app, [470, 485, 500, 515, 530].map(x => ({ x, y: 468 }))).placed).toBe(1)
  expect(setDimension(s.app, e5.id, 3000)).toBe('scale')
  expect(setClsThickness(s.app, fid, 200)).not.toBeNull()
  const slots0 = faceSlotsOf(s.app, s.app.faces[0]!)
  const before = {
    face_id: s.app.faces[0]!.id, faces: s.app.faces.length, paintGeo: s.app.paintGeo.size,
    paint_stroke_in_doc: s.app.doc.strokes.some(x => x.paint !== undefined),
    slots: slots0 ? { tW: slots0.tW, frontW: slots0.frontW, backW: slots0.backW } : null,
  }
  const opened = eraseOnce(s, STUB_E4)
  const rf = s.app.faces.find(f => f.id === fid) ?? null
  const slots1 = rf ? faceSlotsOf(s.app, rf) : null
  const after = {
    e4_id_gone: !s.app.doc.strokes.some(x => x.id === e4.id),
    face_id: rf?.id ?? null,                        // 게이트 「면 id 동일」의 값
    faces: s.app.faces.length, docFaces: s.app.doc.faces.length,
    paintGeo: s.app.paintGeo.size,
    paint_stroke_in_doc: s.app.doc.strokes.some(x => x.paint !== undefined),
    slots: slots1 ? { tW: slots1.tW, frontW: slots1.frontW, backW: slots1.backW } : null,
    opened_n: opened.length,
  }
  setSpanCarryForTest(true)
  return { before, after }
}

describe('원장 — 구간 이관 전/후 · 반경 축 · D-5 스윕 · 잔차', () => {
  it('pre(이관 끔 = 옛 거동)/post(현행) — 같은 장면·같은 자 · 면 id·두께 값까지', () => {
    const pre = stubEraseRun(false)
    const post = stubEraseRun(true)
    OUT.def = {
      span: '면 경계 획 위에서 이웃 두 경계 직선과의 교점(면의 두 정점)이 끊는 3D 매개변수 범위 [lo,hi] — 파생(저장 안 함 · #90 관문 안 원장만)',
      carry: '지우개가 획을 조각으로 갈아 끼울 때 남는 조각 합집합이 구간을 덮으면 조각 하나의 새 id로 FaceEdge.s 교체(op.edgeMoved) — 조각 선택 규칙은 아래 carry_choice',
      carry_choice: '«겹침 최대»를 쓰지만 결과를 가르는 것은 규칙이 아니라 **참조 여부**다 — 모든 조각이 같은 3D 직선이라 기하는 무차(#92: sweep의 then_ref_erase/then_sibling_erase 두 행이 그 갈림의 값). 규칙 자체는 임의 선택임을 여기 적는다(1차 [11])',
      eps_role: 'εt = MERGE_RATIO·size3/|획|은 **결정 임계가 아니라 부동소수 여유**다 — 지우개는 조각 단위라(pieces.ts) 절단 위치는 언제나 3D 교차점이고 반경과 무관하다(#88 실측: cut_t − hi = 1 ulp — radius_axis 행들이 그 불변의 값). #61 대응: MERGE_RATIO의 둘째 의도가 아니라 같은 «마디 합침 잡음»의 여유이고, 결정 임계가 필요해지면 제 상수를 새로 판다',
      survived: 'sweep의 survived = «풀린 면 수 == 1»(면 표시 축)이다. 칠·두께 축은 pre/post 블록이 잰다(1차 [9] — sweep에 그 축을 겹치면 행마다 분모가 달라진다 #11)',
      pre_is: 'setSpanCarryForTest(false) — 옛 거동의 재현이자 D-3 반증(끄면 결함이 돌아온다). carryFaceEdges가 첫 줄 반환이라 옛 경로와의 차이는 반환값뿐. 수리 «전» 트리의 별도 실행(D-2)은 같은 단언 상수를 통과했다 — JSON 부재는 1차 [6] 자백(#91의 자로 바이트 대조는 아니다)',
      judge_92: '#92 — 판정자는 «면·칠·두께가 남아 있는가»의 수다(이관 성공의 이름표가 아니다). 열림(opened)은 실제 풀림 전/후 비교로 따로 센다. #99 판별 ②(열쇠 수 확인)는 마지막 팔이 한다',
      zero_note: 'opened 0은 게이트 목표(이관 성공 = 알림 없음)다 — 같은 카운터가 span_mid·radius60에서 1을 낸다(집계 미작동이 아니라는 반증). fixture_span.lo ≈ 0은 구성 보장(그 모서리가 끝점 접촉 t=0)이라 측정이 아니다 — 임계를 안 건다(CLAUDE §5.1 유형 3)',
    }
    OUT.pre = pre
    OUT.post = post
    expect(pre.before).toMatchObject({ faces: 1, paintGeo: 1, paint_stroke_in_doc: true })
    expect(pre.before.slots).not.toBeNull()
    // pre = 결함 그대로: 토막만 지웠는데 면·칠·두께 표시가 전멸(칠 «획»은 doc에 남는다)
    expect(pre.after).toMatchObject({
      e4_id_gone: true, face_id: null, faces: 0, paintGeo: 0, slots: null,
      docFaces: 1, paint_stroke_in_doc: true, opened_n: 1,
    })
    // post = 게이트 ①: 면 id 동일 · 칠 1 · 두께 값 동일 · 알림 0
    expect(post.after).toMatchObject({ e4_id_gone: true, faces: 1, paintGeo: 1, docFaces: 1, opened_n: 0 })
    expect(post.after.face_id).toBe(post.before.face_id)
    expect(post.after.slots).toEqual(post.before.slots)
  })

  it('구간 값 — 픽스처의 [lo,hi]와 절단 t(같은 자 — #88)', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const ei = face.loops[0]!.edges.findIndex(e => e.s === e4.id)
    const span = edgeSpanOf(s.app.lift, face, 0, ei)!
    const cutT = pieces(s.app.lift, DRAW_POSE)
      .filter(x => x.strokeId === e4.id).map(x => x.t1).sort((a, b) => a - b)[0]!
    OUT.fixture_span = {
      lo: span.lo, hi: span.hi, cut_t: cutT,
      note: 't는 3D 매개변수 — 화면 분율(2/3)이 아니다(원근 단축). hi == 절단 t(1 ulp)는 «같은 자» 확인이자 **구성**이다: 절단은 언제나 교차점이고 구간 끝도 교차점이라 지우개 반경이 이 등호를 못 옮긴다(radius_axis가 그 값)',
    }
    expect(Math.abs(span.hi - cutT)).toBeLessThan(1e-9)
  })

  it('반경 축(1차 [1] — #12·#13) — 반경은 절단 위치가 아니라 «어느 조각이 맞는가»만 바꾼다', () => {
    const rows: Record<string, unknown> = {}
    for (const r of [5, 12] as const) {
      const { s } = quadScene(); makeFace(s)
      const o = eraseOnce(s, STUB_E4, r)
      rows[`stub_r${r}`] = { survived: s.app.faces.length === 1, opened: o.length }
      expect(s.app.faces).toHaveLength(1)
      expect(o).toEqual([])
    }
    {
      // 반경 60: 토막 자리에서 **이웃 경계(e5)의 구간 조각까지 문다** → e5의 구간이 죽어
      // 면이 열린다 — 반경이 결과를 바꾸는 유일한 길이 «맞는 조각의 집합»임의 실측.
      // ⚠ 이 행이 순서 인공물을 잡았다(1차 [1] 대응 중 실측): 같은 호출에서 e4가 먼저
      //   이관되면 e5의 이웃 경계 id가 아직 lift에 없어 구간이 «미상»으로 새고, 형제
      //   토막으로 이관돼 면이 살았다 — 구간 표를 호출 머리에서 선계산하는 수리의 근거.
      const { s, e4, e5 } = quadScene()
      const fid = makeFace(s)
      const o = eraseOnce(s, STUB_E4, 60)
      rows.stub_r60 = {
        survived: s.app.faces.length === 1, opened: o.length,
        e4_id_gone: !s.app.doc.strokes.some(x => x.id === e4.id),   // 갈렸다(이관 성공)
        e5_id_gone: !s.app.doc.strokes.some(x => x.id === e5.id),   // 갈렸고 구간 조각이 죽었다
      }
      expect(o).toEqual([fid])
      expect(s.app.faces).toHaveLength(0)
    }
    OUT.radius_axis = {
      rows,
      note: '지우개는 조각 단위(pieces.ts 머리)라 절단 t는 반경과 무관 — r5·r12는 토막 조각만 물어 산다(등호 위 덮음 그대로), r60은 이웃 경계 조각까지 물어 «그 경계의 구간»이 죽어 열린다. εt가 산다/열린다를 가른 행은 없다(eps_role — 결정 임계가 아니다)',
    }
  })

  it('D-5 스윕 — 위상 축(산다/열린다) · 다중 지움 행은 opened를 수열로(1차 [2] — #11)', () => {
    const rows: Record<string, unknown> = {}
    {
      const { s } = quadScene(); makeFace(s)
      const o = eraseOnce(s, STUB_E4)
      rows.stub_one = { survived: s.app.faces.length === 1, opened_seq: [o.length] }
    }
    {
      const { s } = quadScene(); makeFace(s)
      const o1 = eraseOnce(s, STUB_E4)
      const o2 = eraseOnce(s, STUB_E5)
      rows.stub_both = { survived: s.app.faces.length === 1, opened_seq: [o1.length, o2.length] }
    }
    {
      const { s } = quadScene(); makeFace(s)
      const o = eraseOnce(s, SPAN_E4)
      rows.span_mid = { survived: s.app.faces.length === 1, opened_seq: [o.length] }
    }
    {
      const { s } = quadScene(); makeFace(s)
      const o1 = eraseOnce(s, SPAN_E4)              // 첫 지움이 구간을 끊는다 — 여기서 알림
      const o2 = eraseOnce(s, STUB_E4)              // 남은 조각 — 이미 열린 면은 다시 안 센다
      rows.whole_stroke = { survived: s.app.faces.length === 1, opened_seq: [o1.length, o2.length] }
    }
    OUT.sweep = {
      rows,
      expected: '산다: stub_one [0] · stub_both [0,0] · 열린다: span_mid [1] · whole_stroke [1,0](첫 지움이 알림 — 둘째의 0은 중복 알림 ⛔의 값. 행마다 지움 횟수가 달라 수열로 적는다 #11)',
    }
    expect(rows.stub_one).toEqual({ survived: true, opened_seq: [0] })
    expect(rows.stub_both).toEqual({ survived: true, opened_seq: [0, 0] })
    expect(rows.span_mid).toEqual({ survived: false, opened_seq: [1] })
    expect(rows.whole_stroke).toEqual({ survived: false, opened_seq: [1, 0] })
  })

  it('다중 조각 구간 — 참조/비참조의 갈림(1차 [4]·[11])과 형제 옮김 잔차(1차 [3])', () => {
    /** 구간 «안»의 점에서 세운 수직 획 — 3D 교차로 e4가 조각 둘(P1·P2)로 갈리는데,
     *  수직 획은 지면 평면 밖이라 **루프에는 안 든다**(면 평면 안에서만 찾는다 — face.ts ①).
     *  ⚠ 초판은 지면 위 가로지르는 획을 썼는데 그 획은 루프에 흡수돼 e4가 한 루프에 두 번
     *  서고 각 자리가 제 구간으로 따로 이관됐다(아래 chord 행이 그 거동의 값) —
     *  «한 경계·여러 조각»을 재려던 픽스처가 그 상태를 못 만들었다(D-5 · #71의 형태). */
    const multiScene = () => {
      const { s, e4 } = quadScene()
      const cross = s.draw(600, 441.67, 600, 360)!
      expect(s.app.lift.lifted.has(cross.id)).toBe(true)
      const fid = makeFace(s)
      // 픽스처가 재려는 상태를 실제로 만들었는가(#88): e4는 루프에 **한 번**만 선다
      const face0 = s.app.doc.faces.find(f => f.id === fid)!
      expect(face0.loops[0]!.edges.filter(e => e.s === e4.id)).toHaveLength(1)
      const o0 = eraseOnce(s, STUB_E4)              // 토막 지움 — 이관
      expect(o0).toEqual([])
      expect(s.app.faces).toHaveLength(1)
      const face = s.app.doc.faces.find(f => f.id === fid)!
      const refIds = face.loops[0]!.edges.map(e => e.s)
      // e4 자리의 조각 둘: P1 = (700,450)~(600,441.67) · P2 = (600,441.67)~(500,433.33)
      const p1 = s.app.doc.strokes.find(x => Math.abs(x.a.x - 700) < 1 && Math.abs(x.b.x - 600) < 1)!
      const p2 = s.app.doc.strokes.find(x => Math.abs(x.a.x - 600) < 1 && Math.abs(x.b.x - 500) < 1)!
      expect(p1).toBeDefined()
      expect(p2).toBeDefined()
      return { s, fid, refIds, p1, p2, refIsP1: refIds.includes(p1.id) }
    }
    const rows: Record<string, unknown> = {}
    {
      const m = multiScene()
      rows.carry_target = { ref_is_p1: m.refIsP1 }   // 겹침 최대가 고른 조각(실측)
      const ref = m.refIsP1 ? m.p1 : m.p2
      const at = m.refIsP1 ? { x: 660, y: 446.67 } : { x: 550, y: 437.5 }
      const o = eraseOnce(m.s, at)
      rows.then_ref_erase = { erased: ref.id, survived: m.s.app.faces.length === 1, opened_seq: [o.length] }
      expect(o).toEqual([m.fid])                     // 참조 조각을 지우면 — 열린다
    }
    {
      const m = multiScene()
      const sib = m.refIsP1 ? m.p2 : m.p1
      const at = m.refIsP1 ? { x: 550, y: 437.5 } : { x: 660, y: 446.67 }
      const o = eraseOnce(m.s, at)
      rows.then_sibling_erase = {
        erased: sib.id, survived: m.s.app.faces.length === 1, opened_seq: [o.length],
        note: '**잔차**(DEFERRED web2-57 둘째 행) — 비참조 형제를 지우면 면이 산 채 경계 잉크에 틈. 다중 참조가 근본 수리(범위 밖)',
      }
      expect(m.s.app.faces).toHaveLength(1)
      expect(o).toEqual([])
    }
    {
      // 잔차의 «옮김» 판(1차 [3] — 이 회차가 새로 도달 가능하게 만든 상태): 비참조 형제를
      // 옮기면 그 잉크만 움직이고 면은 옛 직선에 남는다 — 값으로 박아 DEFERRED·실기기 ㉘의 근거.
      const m = multiScene()
      const sib = m.refIsP1 ? m.p2 : m.p1
      const at = m.refIsP1 ? { x: 550, y: 437.5 } : { x: 660, y: 446.67 }
      const before3 = m.s.app.faces[0]!.outer.map(p => ({ ...p }))
      m.s.app.tool = 'pencil'
      const r = beginHold(m.s.app, at, 1000)
      expect(r).not.toBeNull()
      expect(m.s.app.grip!.ids).toContain(sib.id)
      const { base, base3 } = gripBase(m.s.app)
      const anchor3 = { ...m.s.app.lift.lifted.get(sib.id)!.a3 }
      const sol = solveMove(m.s.app.lift.an, m.s.app.pose, anchor3, { x: at.x + 60, y: at.y - 15 })!
      expect(applyMove(m.s.app, base, base3, sol.dir, sol.t)).not.toBeNull()
      const segB = base3.get(sib.id)!, segA = m.s.app.lift.lifted.get(sib.id)!
      const sibMoved = len3(sub3(segA.a3, segB.a3))
      const faceMoved = Math.max(...m.s.app.faces[0]!.outer.map((p, i) => len3(sub3(p, before3[i]!))))
      rows.then_sibling_move = {
        sibling_moved_units: sibMoved, face_vertex_moved_max: faceMoved,
        note: '**잔차의 옮김 판** — 형제 잉크는 움직이고(>0) 면 정점은 0: 조용한 갈림. 실기기 ㉘·AS-C173',
      }
      expect(sibMoved).toBeGreaterThan(1e-6)
      expect(faceMoved).toBeLessThan(1e-9)
    }
    {
      // 덤(픽스처 정정에서 발견 — «같은 획이 한 루프에 두 번»): 지면 위 코드(chord)는 루프에
      // 흡수돼 e4가 두 자리에 서고, 이관이 **자리마다 제 구간**으로 따로 넘어탄다(새 참조 둘).
      const { s, e4 } = quadScene()
      const chord = s.draw(510, 454.17, 705, 427.08)!
      expect(s.app.lift.lifted.has(chord.id)).toBe(true)
      expect(toggleFaceAt(s.app, { x: 500, y: 465 })).toBe('added')
      const face = s.app.doc.faces[0]!
      const occ0 = face.loops[0]!.edges.filter(e => e.s === e4.id).length
      const o = eraseOnce(s, STUB_E4)
      const news = face.loops[0]!.edges.map(e => e.s).filter(id => id > chord.id)
      rows.chord_two_occurrences = {
        occurrences: occ0, survived: s.app.faces.length === 1, opened_seq: [o.length],
        distinct_new_refs: new Set(news).size,
        note: '루프에 흡수된 코드 — e4의 두 자리가 각각 P1·P2로 이관됐다(자리별 구간)',
      }
      expect(occ0).toBe(2)
      expect(s.app.faces).toHaveLength(1)
      expect(new Set(news).size).toBe(2)
    }
    OUT.multi_piece = { rows }
  })

  it('구간을 못 세우는 분기(1차 [10]) — 이웃이 죽은 채 토막을 지우면 가장 긴 조각으로 이관 · 실행취소 사슬로 복원', () => {
    const { s, e4, e5 } = quadScene()
    const fid = makeFace(s)
    const o1 = eraseOnce(s, { x: 400, y: 441.67 })   // e5 안쪽(구간) 조각 — 면이 열린다
    const o2 = eraseOnce(s, STUB_E5)                 // e5 나머지 — e5 완전 소거
    expect(s.app.doc.strokes.some(x => x.id === e5.id)).toBe(false)
    const o3 = eraseOnce(s, STUB_E4)                 // 이웃(e5) 없음 → edgeSpanOf null → 가장 긴 조각
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const carried = face.loops[0]!.edges.map(e => e.s).find(id =>
      id !== e4.id && s.app.doc.strokes.some(x => x.id === id && x.own3))
    const carriedLifted = carried !== undefined && s.app.lift.lifted.has(carried)
    undo(s.app); undo(s.app); undo(s.app)            // 사슬 전부 무르면 — 면이 돌아온다
    OUT.span_unknown = {
      opened_seq: [o1.length, o2.length, o3.length],
      ref_carried: carried !== undefined, carried_lifted: carriedLifted,
      faces_after_undo3: s.app.faces.length,
      note: '이웃 미승격이면 구간을 못 세운다 — 놓지 않되 버리지 않는다: 가장 긴 조각으로 넘겨(직선 동일) 이웃이 돌아오면 면도 돌아온다. 열림 알림은 첫 지움(e5 구간)에서 한 번',
    }
    expect(o1).toEqual([fid])
    expect(o3).toEqual([])                           // 이미 열린 면 — 중복 알림 ⛔
    expect(carried).toBeDefined()                    // 분기가 실제로 탔다(참조가 새 id)
    expect(carriedLifted).toBe(true)
    expect(s.app.faces).toHaveLength(1)
  })

  it('옮김의 수치(1차 [8]) — 이관된 조각을 옮기면 면 정점이 실제로 움직인다', () => {
    const { s, e4 } = quadScene()
    const fid = makeFace(s)
    eraseOnce(s, STUB_E4)
    const face = s.app.doc.faces.find(f => f.id === fid)!
    const carried = face.loops[0]!.edges.map(e => e.s).find(id =>
      id !== e4.id && s.app.doc.strokes.some(x => x.id === id)
      && s.app.lift.an.roles.get(id) === 'content')!
    const before3 = s.app.faces[0]!.outer.map(p => ({ ...p }))
    s.app.tool = 'pencil'
    expect(beginHold(s.app, SPAN_E4, 1000)).not.toBeNull()
    const { base, base3 } = gripBase(s.app)
    const anchor3 = { ...s.app.lift.lifted.get(carried)!.a3 }
    const sol = solveMove(s.app.lift.an, s.app.pose, anchor3, { x: 760, y: 435 })!
    expect(applyMove(s.app, base, base3, sol.dir, sol.t)).not.toBeNull()
    const moved = s.app.faces[0]!.outer.map((p, i) => len3(sub3(p, before3[i]!)))
    OUT.move = {
      sol_t_units: sol.t, face_vertex_moved_max: Math.max(...moved),
      face_vertex_moved_n: moved.filter(d => d > 1e-6).length,
      note: '게이트 ②의 수치 — 이동량과 면 정점 이동(1차 [8]). 잔차의 짝은 multi_piece.then_sibling_move(0)',
    }
    expect(Math.max(...moved)).toBeGreaterThan(1e-6)
    expect(s.app.faces).toHaveLength(1)
  })

  it('원장 쓰기(병합 — #99) · 열쇠 수 확인', () => {
    OUT.what = 'web2-57 — 면은 획의 «구간»을 든다: 이관 전/후(#90 관문) · 구간 값(#88) · 반경 축(#12·#13·#61) · D-5 스윕(#11) · 잔차(#92)'
    OUT.pitfall_citations = [11, 12, 13, 61, 88, 90, 91, 92, 99]
    let prev: Record<string, unknown> = {}
    try { prev = JSON.parse(readFileSync(OUT_PATH, 'utf8')) } catch { /* 첫 실행 */ }
    delete prev.sweep                                // 판 갈이(스윕 형태가 바뀜) — 낡은 블록 이월 ⛔
    mkdirSync(dirname(OUT_PATH), { recursive: true })
    writeFileSync(OUT_PATH, JSON.stringify({ ...prev, ...OUT }, null, 2))
    // 쓴 원장에 측정 열쇠가 실제로 있는가(#99 판별 ②) — 머리 열쇠만이면 빈 것이다
    if (process.env.LEDGER === '1') {
      const back = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
      const need = ['def', 'pre', 'post', 'fixture_span', 'radius_axis', 'sweep', 'multi_piece', 'span_unknown', 'move']
      for (const k of need) expect(back, `원장 열쇠 ${k}`).toHaveProperty(k)
      expect(Object.keys(back).length).toBeGreaterThanOrEqual(need.length + 2)
    }
  })
})
