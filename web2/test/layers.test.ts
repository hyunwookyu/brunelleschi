// web2-20 1부 — 겹 자료 구조 · .brnl v5의 회귀 팔.
//   ① v4·v5 왕복 ② 겹 없는 파일이 그대로 열린다 ③ 없는 겹/종이를 가리키는 참조가
//   강등된다. (④ «그 종이의 시점에서 팬해도 겹이 그림에 대해 안 움직인다»는 rect가
//   문서 좌표라는 뜻이고 픽셀 판정은 3부의 막 렌더가 서야 잰다 — 3부 팔이 진다.)
// 모양 규약: 겹 자체가 깨지면 **거부**(mat.w·rawIn과 같은 급 — 획의 소속이다) ·
// 참조가 깨지면 **강등**(겹은 버리고 획은 종이 직접으로).

import { describe, it, expect } from 'vitest'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import type { Layer } from '../src/core/types'

const POSE_A = { p: { x: 0, y: 1.6, z: -3 }, q: { x: 0, y: 0.3, z: 0, w: 0.954 } }

/** v5 원문 — 종이 둘(작도 + 종이 2) · 겹 둘(종이 2 위 tracing·yellow) · 획 셋
 *  (하나는 겹 4 위, 하나는 겹 5 위, 하나는 종이 직접) */
function v5Text(): string {
  return JSON.stringify({
    format: 'brnl', version: 5,
    frame: { W: 1200, H: 800 },
    strokes: [
      { id: 1, a: { x: 280, y: 560 }, b: { x: 700, y: 560 } },
      { id: 2, a: { x: 500, y: 560 }, b: { x: 800, y: 480 }, layer: 4 },
      { id: 3, a: { x: 300, y: 600 }, b: { x: 400, y: 600 }, layer: 5 },
    ],
    faces: [], unit: 'mm', nextId: 6,
    sheets: [
      { id: 0, name: '작도' },
      { id: 9, name: '종이 2', pose: POSE_A, view: { s: 1, ox: 0, oy: 0 } },
    ],
    layers: [
      { id: 4, sheet: 9, paper: 'tracing', rect: { x: 100, y: 100, w: 600, h: 400 }, on: true, locked: false },
      { id: 5, sheet: 9, paper: 'yellow', rect: { x: 50, y: 50, w: 300, h: 200 }, on: false, locked: true },
    ],
  })
}

describe('① v5 왕복 · v4 하위호환', () => {
  it('v5 왕복 — 겹·소속·순서가 그대로 돌아온다(직렬화 문자열 자기 왕복까지)', () => {
    const d = parseBrnl(v5Text())!
    expect(d).not.toBeNull()
    expect(d.doc.layers.length).toBe(2)
    expect(d.doc.layers[0]).toEqual({ id: 4, sheet: 9, paper: 'tracing', rect: { x: 100, y: 100, w: 600, h: 400 }, on: true, locked: false })
    expect(d.doc.layers[1]!.paper).toBe('yellow')
    expect(d.doc.strokes[1]!.layer).toBe(4)
    expect(d.doc.strokes[0]!.layer).toBeUndefined()
    const text = serializeBrnl({ doc: d.doc, nextId: d.nextId })
    expect(JSON.parse(text).version).toBe(5)
    const back = parseBrnl(text)!
    expect(back.doc.layers).toEqual(d.doc.layers)
    expect(back.doc.strokes).toEqual(d.doc.strokes)
    expect(serializeBrnl({ doc: back.doc, nextId: back.nextId })).toBe(text)
  })

  it('② 겹 없는 파일(v4 모양)이 그대로 열린다 — layers는 빈 배열·열쇠는 왕복에서 안 생긴다', () => {
    const j = JSON.parse(v5Text())
    delete j.layers
    j.strokes.forEach((s: any) => delete s.layer)
    j.version = 4
    const d = parseBrnl(JSON.stringify(j))!
    expect(d).not.toBeNull()
    expect(d.doc.layers).toEqual([])
    const text = serializeBrnl({ doc: d.doc, nextId: d.nextId })
    expect('layers' in JSON.parse(text)).toBe(false)   // 없으면 열쇠를 안 쓴다(왕복 동일성)
  })

  it('모양이 틀리면 **거부**한다 — 겹은 획의 소속이다(mat.w·rawIn과 같은 규약)', () => {
    for (const mut of [
      (j: any) => { j.layers[0].paper = 'mylar' },          // 모르는 종이
      (j: any) => { j.layers[0].rect = { x: 0, y: 0, w: -5, h: 10 } },  // 음수 크기
      (j: any) => { j.layers[0].on = 'yes' },               // 불리언 아님
      (j: any) => { j.layers = { 0: {} } },                 // 배열 아님
      (j: any) => { delete j.layers[0].sheet },             // 소속 없음
    ]) {
      const j = JSON.parse(v5Text())
      mut(j)
      expect(parseBrnl(JSON.stringify(j)), JSON.stringify(j.layers).slice(0, 60)).toBeNull()
    }
  })
})

describe('③ 참조 강등 — 문서를 거부하지 않는다', () => {
  it('Layer.sheet가 없는 종이를 가리키면 그 겹을 버리고, 그 위의 획은 종이 직접으로 강등', () => {
    const j = JSON.parse(v5Text())
    j.layers[0].sheet = 777                                // 없는 종이
    const d = parseBrnl(JSON.stringify(j))!
    expect(d).not.toBeNull()
    expect(d.doc.layers.length).toBe(1)                    // tracing(겹 4)이 죽었다
    expect(d.doc.layers[0]!.id).toBe(5)
    expect(d.doc.strokes[1]!.layer).toBeUndefined()        // 겹 4 위의 획 — 직접으로
    expect(d.doc.strokes[2]!.layer).toBe(5)                // 겹 5는 산다
  })

  it('Stroke.layer가 없는 겹을 가리키면 그 필드만 버린다', () => {
    const j = JSON.parse(v5Text())
    j.strokes[1].layer = 999
    const d = parseBrnl(JSON.stringify(j))!
    expect(d).not.toBeNull()
    expect(d.doc.strokes[1]!.layer).toBeUndefined()
    expect(d.doc.layers.length).toBe(2)                    // 겹은 안 다친다
  })

  it('반증 — 참조가 성한 문서에서는 강등이 안 돈다(위 팔이 «무조건 지우기»가 아니다)', () => {
    const d = parseBrnl(v5Text())!
    expect(d.doc.layers.length).toBe(2)
    expect(d.doc.strokes[1]!.layer).toBe(4)
  })

  it('id 한 통 — nextId가 겹 id 위에 선다', () => {
    const j = JSON.parse(v5Text())
    j.nextId = 2                                           // 손상 — 겹 id(5)보다 작다
    const d = parseBrnl(JSON.stringify(j))!
    expect(d.nextId).toBeGreaterThan(Math.max(...d.doc.layers.map((l: Layer) => l.id)))
  })
})
