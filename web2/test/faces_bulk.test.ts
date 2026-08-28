// web2-21 4부 — **면 일괄 생성(전부 켜고 빼기)**.
//
// 원칙(types.ts 「사용자가 지정한 것만 면이다」)은 그대로다 — 지정의 방향만 「포함」에서
// 「배제」로 뒤집는다(D-W8). 지시 회귀 팔:
//   ① 닫힌 영역 다섯·개구부 하나인 장면에서 후보가 정확히 나온다(개수 값으로) — 합성
//   ② 안쪽 고리가 기본으로 구멍이다(loops.length === 2) — 합성 + 앱 경로
//   ③ 하나를 탭해 빼면 그것만 빠진다 — 앱 경로
//   ④ 실행취소 한 번에 전부 돌아온다 — 앱 경로(한 op)
//   ⑥ 안쪽 고리를 기존 탭으로 채우면 면이 된다 — 앱 경로
//   (⑤ 미리보기 테두리만 = e2e face.spec · ⑦ 비용 = faces_bulk_measure)
// 반증(D-3): 포함 판정(op.every(inPoly))을 빼면 ②′(장면 B)가 실패한다 — 실제로 빼서
// 확인했다(NOTES 4부 절에 명령 출력 원문).
//
// ⚠ 합성 장면의 근거: 개구부(벽의 창)는 앱 경로로 못 올린다(1-a 갈래 ③ —
// opening21_web2.json). 지면 위의 «떨어진 닫힌 사각»은 앱 경로로 올라가므로(지면 규칙
// 확대 — web2-17 4부) 앱 팔은 그 국면을 쓴다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { findAllFaces, excludeCandidateAt, commitCandidates, cancelCandidates, toggleFaceAt, undo, redo } from '../src/app/state'
import { allLoops, inPoly } from '../src/core/face'
import { analyze, DRAW_POSE, project } from '../src/core/camera'
import type { LiftResult, LiftedSeg } from '../src/core/lift'
import { constructedDoc } from './fixtures'
import type { Stroke } from '../src/core/types'
import { v3, type V3 } from '../src/core/vec'

// ── 합성 lift(face.test의 것과 같은 형태) — 다층 평면 장면을 만드는 유일한 길 ──
function synthLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    const a = project(an, DRAW_POSE, s.a3)!, b = project(an, DRAW_POSE, s.b3)!
    strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null }
}
const rect = (id0: number, c: V3[]) => c.map((a, i) => ({ id: id0 + i, a3: a, b3: c[(i + 1) % 4]! }))
const groundRect = (id0: number, x0: number, x1: number, z0: number, z1: number) =>
  rect(id0, [v3(x0, 0, z0), v3(x1, 0, z0), v3(x1, 0, z1), v3(x0, 0, z1)])
const wallRect = (id0: number, x0: number, x1: number, y0: number, y1: number, z: number) =>
  rect(id0, [v3(x0, y0, z), v3(x1, y0, z), v3(x1, y1, z), v3(x0, y1, z)])

const edgeIds = (l: { edges: { s: number }[] }) => l.edges.map(e => e.s).sort((a, b) => a - b)

describe('①② — 닫힌 영역 다섯 · 개구부 하나 (합성 — 지면 격자 + 벽 + 창)', () => {
  /** 지면 사각(내부 십자로 4칸) + 벽(지면 가장자리 공유) + 벽 안 떨어진 창 */
  const scene = () => synthLift([
    ...groundRect(101, -6, 6, -10, -22),
    { id: 301, a3: v3(-6, 0, -16), b3: v3(6, 0, -16) },     // 십자 가로
    { id: 302, a3: v3(0, 0, -10), b3: v3(0, 0, -22) },      // 십자 세로
    { id: 402, a3: v3(6, 0, -10), b3: v3(6, 4, -10) },      // 벽(아랫변 = 101 공유)
    { id: 403, a3: v3(6, 4, -10), b3: v3(-6, 4, -10) },
    { id: 404, a3: v3(-6, 4, -10), b3: v3(-6, 0, -10) },
    ...wallRect(501, -2, 2, 1, 3, -10),                      // 창 — 어디에도 안 닿는다
  ])

  it('① 후보 다섯(지면 4칸 + 벽) — 개수 값으로 · 모든 평면(4-c)', () => {
    const cands = allLoops(scene(), DRAW_POSE)
    expect(cands).toHaveLength(5)
    // 지면 4칸(구멍 없음) + 벽(구멍 하나) — 평면 두 개가 다 훑혔다(4-c 「전체로 하자」)
    expect(cands.filter(c => c.loops.length === 1)).toHaveLength(4)
    expect(cands.filter(c => c.loops.length === 2)).toHaveLength(1)
  })

  it('② 안쪽 고리(창)가 기본으로 구멍이다 — loops.length === 2 · 창 안쪽은 후보가 아니다', () => {
    const cands = allLoops(scene(), DRAW_POSE)
    const wall = cands.find(c => c.loops.length === 2)!
    expect(edgeIds(wall.loops[1]!)).toEqual([501, 502, 503, 504])   // 구멍 = 창
    // 창 안쪽 순환은 후보 목록에 없다 — 채우려면 확정 뒤 기존 탭(⑥)
    for (const c of cands) expect(edgeIds(c.loops[0]!)).not.toEqual([501, 502, 503, 504])
  })

  it('②′(반증 장면 B) — 같은 평면인데 밖에 있는 고리는 구멍이 아니다(포함 판정)', () => {
    // 벽 + 안의 창 + **밖의** 떨어진 사각(같은 평면) — 포함 판정(op.every(inPoly))을 빼면
    // 밖의 사각도 구멍으로 붙어 loops가 3이 된다(D-3 — 실제로 빼서 실패를 확인).
    const lift = synthLift([
      ...wallRect(401, -6, 6, 0, 4, -10),
      ...wallRect(501, -2, 2, 1, 3, -10),
      ...wallRect(601, 8, 10, 1, 2, -10),
    ])
    const cands = allLoops(lift, DRAW_POSE)
    const wall = cands.find(c => edgeIds(c.loops[0]!).join() === '401,402,403,404')!
    expect(wall.loops).toHaveLength(2)                               // 창만 구멍이다
    expect(edgeIds(wall.loops[1]!)).toEqual([501, 502, 503, 504])
    // 밖의 사각은 제 후보로 남는다(구멍이 아니므로 안쪽도 안 빠진다)
    expect(cands.some(c => edgeIds(c.loops[0]!).join() === '601,602,603,604')).toBe(true)
  })
})

// ── 앱 경로 — quad 장면(face.test의 좌표 그대로) ───────────────────────────
const vpY0 = (x: number, x0: number, y0: number) => 400 + ((y0 - 400) / (x0 - 900)) * (x - 900)
const vpY1 = (x: number, x0: number, y0: number) => 400 + ((y0 - 400) / (x0 - 100)) * (x - 100)
function quadScene() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 700, 450)
  s.draw(500, 500, 300, 450)
  s.draw(700, 450, 400, 425)
  s.draw(300, 450, 600, 425)
  return s
}
/** quad + 가르는 선 = 두 칸 */
function splitScene() {
  const s = quadScene()
  s.draw(500, 500, 500, 1300 / 3)
  return s
}
/** quad + **떨어진** 닫힌 사각(끝점 이음·전부 소실점 축 — 지면 규칙으로 올라간다) */
function holeScene() {
  const s = quadScene()
  const P1 = { x: 430, y: 472 }
  const P2 = { x: 530, y: vpY0(530, 430, 472) }
  const P3 = { x: 580, y: vpY1(580, P2.x, P2.y) }
  const P4 = { x: 480, y: vpY0(480, P3.x, P3.y) }
  const rectIds = [
    s.draw(P1.x, P1.y, P2.x, P2.y)!,
    s.draw(P2.x, P2.y, P3.x, P3.y)!,
    s.draw(P3.x, P3.y, P4.x, P4.y)!,
    s.draw(P4.x, P4.y, P1.x, P1.y)!,
  ].map(x => x.id)
  for (const id of rectIds) expect(s.app.lift.lifted.has(id)).toBe(true)
  return { s, rectIds, inner: { x: 505, y: 468 } }   // inner = 사각 안쪽 화면점
}

describe('③④⑥ — 앱 경로: 빼기 · 한 op 실행취소 · 구멍 채우기', () => {
  it('③ 하나를 탭해 빼면 그것만 빠진다', () => {
    const s = splitScene()
    expect(findAllFaces(s.app)).toBe(2)
    expect(excludeCandidateAt(s.app, { x: 420, y: 460 })).toBe(true)   // 왼 칸을 뺀다
    expect(s.app.faceCandidates).toHaveLength(1)
    // 남은 것은 오른 칸이다 — 오른쪽 점이 그 폴리곤 안에 있다
    expect(inPoly({ x: 580, y: 460 }, s.app.faceCandidates![0]!.poly)).toBe(true)
    // 후보 밖 탭은 아무것도 안 뺀다
    expect(excludeCandidateAt(s.app, { x: 200, y: 700 })).toBe(false)
    expect(s.app.faceCandidates).toHaveLength(1)
  })

  it('④ 확정은 **한 op** — 실행취소 한 번에 전부 돌아온다 · 다시실행', () => {
    const s = splitScene()
    expect(findAllFaces(s.app)).toBe(2)
    const ops0 = s.app.undoStack.length
    expect(commitCandidates(s.app)).toBe(2)
    expect(s.app.faces).toHaveLength(2)
    expect(s.app.undoStack.length).toBe(ops0 + 1)          // 한 op에 담겼다(4-e)
    expect(s.app.faceCandidates).toBeNull()
    undo(s.app)
    expect(s.app.faces).toHaveLength(0)
    expect(s.app.doc.faces).toHaveLength(0)
    redo(s.app)
    expect(s.app.faces).toHaveLength(2)
  })

  it('②(앱 경로)·⑥ 떨어진 고리는 구멍으로 — 기존 탭 하나로 채워진다 · 이미 있는 면은 후보에서 빠진다', () => {
    const { s, rectIds, inner } = holeScene()
    expect(findAllFaces(s.app)).toBe(1)
    const c = s.app.faceCandidates![0]!
    expect(c.loops).toHaveLength(2)                        // ② 기본값이 구멍이다
    expect(edgeIds(c.loops[1]!)).toEqual([...rectIds].sort((a, b) => a - b))
    expect(commitCandidates(s.app)).toBe(1)
    expect(s.app.faces[0]!.holes).toHaveLength(1)          // 구멍이 실제로 뚫렸다
    // ⑥ 채우고 싶으면 **기존 탭 하나** — 별도 동작이 없다(지시 4-b)
    expect(toggleFaceAt(s.app, inner)).toBe('added')
    expect(s.app.faces).toHaveLength(2)
    // 다시 「전부 찾기」 — 이미 면인 것은 후보에서 빠진다(중복 생성 없음)
    expect(findAllFaces(s.app)).toBe(0)
    cancelCandidates(s.app)
  })

  it('문서가 바뀌면 후보가 낡지 않게 버려진다(안전망)', () => {
    const s = splitScene()
    expect(findAllFaces(s.app)).toBe(2)
    s.draw(500, 470, 560, 460)                             // 아무 획 — recompute
    expect(s.app.faceCandidates).toBeNull()
  })
})
