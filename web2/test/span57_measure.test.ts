// web2-57 — 측정 하네스: 구간 이관의 전/후와 D-5 스윕.
//
//   pre  = 반증 손잡이(setSpanCarryForTest(false))로 **옛 거동을 그대로 재현**한 값 —
//          D-2의 «수리 전» 실측이 이 블록에 산다(수리 전 별도 실행에서도 같은 값을
//          확인했다 — NOTES 「재현」 절).
//   post = 현행(이관 켬) — 게이트 ①의 값.
//   sweep = D-5 대역: 토막 한쪽/양쪽 · 구간 중간 · 획 전체 · 구간이 여러 조각.
//
// 원장: stage0/out/span57_web2.json (LEDGER=1 — #90 · 병합-쓰기 #99: 블록 열쇠만 갈아
// 끼우고 나머지는 이월한다 · 쓰고 나서 열쇠 수를 확인한다)
//   npx vitest run test/span57_measure.test.ts

import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, type Session } from './session'
import {
  toggleFaceAt, beginErase, eraseAt, endErase, setSpanCarryForTest,
  commitPaint, setDimension, setClsThickness, faceSlotsOf,
} from '../src/app/state'
import { edgeSpanOf } from '../src/core/face'
import { pieces } from '../src/core/pieces'
import { DRAW_POSE } from '../src/core/camera'

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

function eraseOnce(s: Session, p: { x: number; y: number }): number[] {
  s.app.tool = 'eraser-pencil'
  s.app.eraserRadius = 5
  beginErase(s.app)
  const opened = eraseAt(s.app, p)
  endErase(s.app)
  return opened
}

const STUB_E4 = { x: 420, y: 426.67 }
const STUB_E5 = { x: 580, y: 426.67 }
const SPAN_E4 = { x: 620, y: 443.33 }

/** 칠 + 두께까지 얹은 장면에서 토막을 지운 전/후 — pre/post가 같은 함수로 잰다(#54) */
function stubEraseRun(carry: boolean) {
  setSpanCarryForTest(carry)
  const { s, e4, e5 } = quadScene()
  const fid = makeFace(s)
  expect(commitPaint(s.app, [470, 485, 500, 515, 530].map(x => ({ x, y: 468 }))).placed).toBe(1)
  expect(setDimension(s.app, e5.id, 3000)).toBe('scale')
  expect(setClsThickness(s.app, fid, 200)).not.toBeNull()
  const before = {
    faces: s.app.faces.length, paintGeo: s.app.paintGeo.size,
    thickness_slots: faceSlotsOf(s.app, s.app.faces[0]!) !== null,
  }
  const opened = eraseOnce(s, STUB_E4)
  const rf = s.app.faces.find(f => f.id === fid) ?? null
  const after = {
    e4_id_gone: !s.app.doc.strokes.some(x => x.id === e4.id),
    faces: s.app.faces.length, docFaces: s.app.doc.faces.length,
    paintGeo: s.app.paintGeo.size,
    thickness_slots: rf !== null && faceSlotsOf(s.app, rf) !== null,
    opened_n: opened.length,
  }
  setSpanCarryForTest(true)
  return { before, after }
}

describe('원장 — 구간 이관 전/후 · D-5 스윕', () => {
  it('pre(이관 끔 = 옛 거동)/post(현행) — 같은 장면·같은 자', () => {
    const pre = stubEraseRun(false)
    const post = stubEraseRun(true)
    OUT.def = {
      span: '면 경계 획 위에서 이웃 두 경계 직선과의 교점(면의 두 정점)이 끊는 3D 매개변수 범위 [lo,hi] — 파생(저장 안 함)',
      carry: '지우개가 획을 조각으로 갈아 끼울 때 남는 조각 합집합이 구간을 덮으면 겹침 최대 조각의 새 id로 FaceEdge.s 교체(op.edgeMoved)',
      pre_is: 'setSpanCarryForTest(false) — 옛 거동의 재현이자 D-3 반증(끄면 결함이 돌아온다). 수리 전 별도 실행(D-2)과 같은 값임을 확인했다',
      judge_92: '#92 — 판정자는 «면·칠·두께가 남아 있는가»의 수다(이관 성공의 이름표가 아니다). 열림(opened_n)은 실제 풀림 전/후 비교로 따로 센다',
      zero_note: 'opened_n 0은 게이트 목표(이관 성공 = 알림 없음)다 — 같은 카운터가 span_mid에서 1을 낸다(집계 미작동이 아니라는 반증). fixture_span.lo ≈ 0은 구성 보장(그 모서리가 끝점 접촉 t=0)이라 측정이 아니다 — 임계를 안 건다(CLAUDE §5.1 유형 3)',
    }
    OUT.pre = pre
    OUT.post = post
    // pre = 결함 그대로: 토막만 지웠는데 면·칠·두께가 전멸
    expect(pre.before).toEqual({ faces: 1, paintGeo: 1, thickness_slots: true })
    expect(pre.after).toMatchObject({ e4_id_gone: true, faces: 0, paintGeo: 0, thickness_slots: false, docFaces: 1, opened_n: 1 })
    // post = 게이트 ①: 전부 산다 · 알림 0
    expect(post.after).toMatchObject({ e4_id_gone: true, faces: 1, paintGeo: 1, thickness_slots: true, docFaces: 1, opened_n: 0 })
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
      note: 't는 3D 매개변수 — 화면 분율(2/3)이 아니다(원근 단축). hi == 절단 t가 «같은 자» 확인',
    }
    expect(Math.abs(span.hi - cutT)).toBeLessThan(1e-9)
  })

  it('D-5 스윕 — 대역 다섯: 산다/열린다가 설계 문면대로 갈린다', () => {
    const rows: Record<string, { survived: boolean; opened_n: number }> = {}
    {
      const { s } = quadScene(); makeFace(s)
      const o = eraseOnce(s, STUB_E4)
      rows.stub_one = { survived: s.app.faces.length === 1, opened_n: o.length }
    }
    {
      const { s } = quadScene(); makeFace(s)
      eraseOnce(s, STUB_E4)
      const o = eraseOnce(s, STUB_E5)
      rows.stub_both = { survived: s.app.faces.length === 1, opened_n: o.length }
    }
    {
      const { s } = quadScene(); makeFace(s)
      const o = eraseOnce(s, SPAN_E4)
      rows.span_mid = { survived: s.app.faces.length === 1, opened_n: o.length }
    }
    {
      const { s } = quadScene(); makeFace(s)
      eraseOnce(s, SPAN_E4)
      const o = eraseOnce(s, STUB_E4)             // 남은 조각까지 — 획 전체 소거
      rows.whole_stroke = { survived: s.app.faces.length === 1, opened_n: o.length }
    }
    {
      const { s } = quadScene()
      const cross = s.draw(510, 454.17, 705, 427.08)!   // 구간 안을 가로지른다 → 조각 둘
      expect(s.app.lift.lifted.has(cross.id)).toBe(true)
      makeFace(s)
      const o = eraseOnce(s, STUB_E4)
      rows.multi_piece_span = { survived: s.app.faces.length === 1, opened_n: o.length }
    }
    OUT.sweep = {
      rows,
      expected: '산다: stub_one·stub_both·multi_piece_span (opened 0) · 열린다: span_mid (opened 1) · whole_stroke의 둘째 지움은 이미 열린 면이라 opened 0(중복 알림 ⛔)',
    }
    expect(rows.stub_one).toEqual({ survived: true, opened_n: 0 })
    expect(rows.stub_both).toEqual({ survived: true, opened_n: 0 })
    expect(rows.span_mid).toEqual({ survived: false, opened_n: 1 })
    expect(rows.whole_stroke).toEqual({ survived: false, opened_n: 0 })
    expect(rows.multi_piece_span).toEqual({ survived: true, opened_n: 0 })
  })

  it('원장 쓰기(병합 — #99) · 열쇠 수 확인', () => {
    OUT.what = 'web2-57 — 면은 획의 «구간»을 든다: 이관 전/후 · 구간 값 · D-5 스윕'
    OUT.pitfall_citations = [88, 90, 92, 99]
    let prev: Record<string, unknown> = {}
    try { prev = JSON.parse(readFileSync(OUT_PATH, 'utf8')) } catch { /* 첫 실행 */ }
    mkdirSync(dirname(OUT_PATH), { recursive: true })
    writeFileSync(OUT_PATH, JSON.stringify({ ...prev, ...OUT }, null, 2))
    // 쓴 원장에 측정 열쇠가 실제로 있는가(#99 판별 ②) — 머리 열쇠만이면 빈 것이다
    if (process.env.LEDGER === '1') {
      const back = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
      for (const k of ['def', 'pre', 'post', 'fixture_span', 'sweep']) {
        expect(back, `원장 열쇠 ${k}`).toHaveProperty(k)
      }
    }
  })
})
