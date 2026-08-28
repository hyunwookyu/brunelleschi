// web2-23 2부 — 밑그림의 **저장과 생애**. 표현(F·H 픽셀·파선 0)은 e2e 몫이고
// 여기는 자료의 물음이다:
//
//   ④ v5·v6 왕복에서 밑그림이 같다
//   ⑤ 겹 삭제 → 실행취소로 밑그림이 돌아온다
//   ⑥ 밑그림이 깨진 파일이 **겹은 살린 채** 열린다
//   (+) 굽는 계기는 «얹는 순간» 하나다 — 트레이싱지는 안 굽고, 다시 뜨는 길이 없다(2-c)
//
// ⑦(굽기 전후 바이트)는 원장 하네스가 낸다(`cost23_measure.test.ts`).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { addLayer, removeLayer, setActiveLayer, undo, redo, underlayOf, toggleFaceAt, type App } from '../src/app/state'
import { serializeBrnl, parseBrnl } from '../src/core/file'

const W = 1200, H = 800

/** 작도 + 지면 삼각형(면 하나) — 그 위에 옐로를 얹으면 밑그림이 구워진다 */
function scene(): ReturnType<typeof session> {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(500, 500, 700, 450)       // 깊이선 1 → vp0
  s.draw(500, 500, 300, 450)       // 깊이선 2 → vp1
  s.draw(700, 450, 300, 450)       // 두 끝을 잇는다 — 닫힌 삼각형
  return s
}

const yellow = (app: App) => addLayer(app, 'yellow', { W, H })!

describe('web2-23 2부 — 밑그림의 저장과 생애', () => {
  it('굽는 계기는 «옐로를 얹는 순간» 하나 — 트레이싱지는 안 굽는다(2-c)', () => {
    const s = scene()
    const tr = addLayer(s.app, 'tracing', { W, H })!
    expect(underlayOf(s.app.doc, tr.id)).toBeNull()
    const y = yellow(s.app)
    const u = underlayOf(s.app.doc, y.id)
    expect(u).not.toBeNull()
    expect(u!.segs.length).toBeGreaterThan(0)
    // 3D 선분마다 적어도 조각 하나 — 굽기가 실제로 아래를 읽었다
    expect(u!.segs.length).toBeGreaterThanOrEqual(s.app.lift.lifted.size)
  })

  it('④ v6 왕복 — 밑그림이 그대로 돌아온다(직렬화 문자열 자기 왕복까지)', () => {
    const s = scene()
    const y = yellow(s.app)
    const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId })
    expect(JSON.parse(text).version).toBe(6)
    const back = parseBrnl(text)!
    expect(back).not.toBeNull()
    expect(back.doc.underlays).toEqual(s.app.doc.underlays)
    expect(underlayOf(back.doc, y.id)!.segs).toEqual(underlayOf(s.app.doc, y.id)!.segs)
    // ⚠ «문자열 자기 왕복»은 여기 안 건다 — 이 문서에는 `own3`가 실려 있고 파싱이
    // 열쇠 차례를 바꾼다(mat ↔ own3, web2-13부터의 성질이라 이 회차와 무관하다).
    // 재는 것은 **값의 왕복**이므로 위의 toEqual 셋이 정본이다.
    expect(parseBrnl(serializeBrnl({ doc: back.doc, nextId: back.nextId }))!.doc.underlays)
      .toEqual(s.app.doc.underlays)
  })

  it('④′ v5(밑그림 없는 옛 파일)도 그대로 열린다 — underlays 는 빈 배열', () => {
    const s = scene()
    yellow(s.app)
    const raw = JSON.parse(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))
    delete raw.underlays
    raw.version = 5
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back).not.toBeNull()
    expect(back.doc.underlays).toEqual([])
    expect(back.doc.layers.length).toBe(1)      // 겹은 그대로다
  })

  it('⑤ 겹 삭제 → 밑그림도 간다 · 실행취소로 같이 돌아온다 · 다시실행으로 또 간다', () => {
    const s = scene()
    const y = yellow(s.app)
    const before = underlayOf(s.app.doc, y.id)!
    expect(before.segs.length).toBeGreaterThan(0)
    removeLayer(s.app, y.id)
    expect(s.app.doc.underlays.length).toBe(0)
    undo(s.app)
    expect(s.app.doc.layers.some(l => l.id === y.id)).toBe(true)
    expect(underlayOf(s.app.doc, y.id)).toEqual(before)   // 좌표·깃발까지 같다
    redo(s.app)
    expect(underlayOf(s.app.doc, y.id)).toBeNull()
  })

  it('⑥ 밑그림이 깨진 파일이 **겹은 살린 채** 열린다(문서를 거부하지 않는다)', () => {
    const s = scene()
    const y = yellow(s.app)
    const raw = JSON.parse(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))
    expect(raw.underlays.length).toBe(1)
    raw.underlays[0].segs[0] = { a: { x: 1, y: 2 }, hidden: 'yes' }   // 모양이 틀렸다
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back).not.toBeNull()                       // 문서는 열린다
    expect(back.doc.layers.some(l => l.id === y.id)).toBe(true)   // 겹은 산다
    expect(back.doc.strokes.length).toBe(s.app.doc.strokes.length)
    expect(back.doc.underlays).toEqual([])            // 그 밑그림만 버려졌다
  })

  it('⑥′ 없는 겹을 가리키는 밑그림은 버려진다 — 그릴 자리가 없다', () => {
    const s = scene()
    yellow(s.app)
    const raw = JSON.parse(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))
    raw.underlays[0].layer = 9999
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back.doc.underlays).toEqual([])
    expect(back.doc.layers.length).toBe(1)
  })

  it('밑그림은 **사건의 기록**이다 — 뒤에 무엇을 해도 다시 안 굽는다(2-c ⛔)', () => {
    const s = scene()
    const y = yellow(s.app)
    const snap = JSON.stringify(underlayOf(s.app.doc, y.id))
    // 아래를 고친다: 획을 더 긋고 면을 만든다 — 그래도 밑그림은 그대로다.
    // ⚠ 옐로가 활성인 채로 그으면 그 획은 **옐로의 2D**다(web2-22 1부) — 아래를 고치려면
    //   종이로 내려와야 한다. 이 한 줄이 없으면 «아래가 안 바뀐 것»을 재게 된다.
    setActiveLayer(s.app, null)
    s.draw(500, 500, 500, 300)
    toggleFaceAt(s.app, { x: 500, y: 465 })
    expect(s.app.doc.faces.length).toBe(1)
    expect(JSON.stringify(underlayOf(s.app.doc, y.id))).toBe(snap)
    // 다시 뜨려면 **새 옐로를 한 장 더** 얹는다 — 그러면 쌓인 순서가 작업 이력이다
    const y2 = yellow(s.app)
    expect(s.app.doc.underlays.length).toBe(2)
    expect(underlayOf(s.app.doc, y2.id)!.segs.length)
      .toBeGreaterThan(underlayOf(s.app.doc, y.id)!.segs.length)   // 그 사이 획이 늘었다
  })
})
