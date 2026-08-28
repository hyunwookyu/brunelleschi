// web2-20 2부 — 얹기 규칙·삭제 규약의 상태 팔(state.ts 연산).
//   ①(2-a) 카메라가 닫히기 전에는 못 얹는다 — addLayer가 null(+반증: 닫힌 뒤에는 얹힌다)
//   ③(2-b) rect 기본값 = 지금 보이는 화면(값으로 — 팬·줌 상태에서)
//   ④ 새 획이 활성 겹으로 · 종이 밖에 그으면 확정 시점에 rect가 자란다
//   ⑤(2-c) 겹 삭제 → 실행취소 → 획·겹이 돌아온다
//   ⑦(2-c) 겹이 있는 종이를 지우면 획이 딸려 가고 실행취소로 돌아온다(규약 변경 —
//     web2-19 DEFERRED 행이 닫히는 자리) · 겹 없는 종이는 종전대로 실행취소 밖
//   + 활성 규칙: 활성=자동 켬 · 잠긴 겹 활성 불가 · 종이 바꾸면 활성 해제

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { addLayer, removeLayer, setActiveLayer, setLayerOn, setLayerLocked, deleteSheet, addSheet, gotoSheet, undo, redo } from '../src/app/state'
import { DRAW_SHEET_ID } from '../src/core/types'
import { serializeBrnl, parseBrnl } from '../src/core/file'

const W = 1200, H = 800

/** 카메라를 닫는 픽스처 — 수평 앵커(H 선언) + 소실점 획 → p1Locked → constructionDone */
function closedSession() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

describe('① 얹기 문(2-a) — 카메라가 닫히기 전에는 못 얹는다', () => {
  it('빈 문서(작도 전)에서는 null · 닫힌 뒤에는 얹힌다(반증 짝)', () => {
    const s = session(W, H)
    expect(s.app.lift.an.constructionDone).toBe(false)
    expect(addLayer(s.app, 'tracing', { W, H })).toBeNull()
    expect(s.app.doc.layers.length).toBe(0)
    s.draw(280, 560, 700, 560)
    s.draw(500, 560, 800, 480)
    const lay = addLayer(s.app, 'tracing', { W, H })
    expect(lay).not.toBeNull()
    expect(s.app.doc.layers.length).toBe(1)
    expect(s.app.activeLayer).toBe(lay!.id)         // 새 겹이 맨 위에 얹히고 활성
    expect(lay!.on).toBe(true)
  })
})

describe('③ rect 기본값(2-b) — 지금 보이는 화면(값으로)', () => {
  it('팬·줌 상태의 화면 사각 { -ox/s, -oy/s, W/s, H/s }', () => {
    // web2-21 3-b — 기본값이 «화면 전체»에서 **짧은 변 5% 인셋 + 층별 흔들림**으로 바뀌었다.
    // 정확값 대신 규약을 값 범위로 잰다(흔들림이 rng32(id)라 정확값은 구현 재계산이 된다):
    // 화면 px 기준 인셋 40(=0.05·800), 흔들림 평행이동 ±6 · 크기 ±4.
    const s = closedSession()
    s.app.view = { s: 2, ox: -100, oy: 40 }
    const lay = addLayer(s.app, 'yellow', { W, H })!
    const v = s.app.view
    const leftScreen = lay.rect.x * v.s + v.ox                 // 문서 → 화면
    const topScreen = lay.rect.y * v.s + v.oy
    expect(leftScreen).toBeGreaterThanOrEqual(40 - 6)
    expect(leftScreen).toBeLessThanOrEqual(40 + 6)
    expect(topScreen).toBeGreaterThanOrEqual(40 - 6)
    expect(topScreen).toBeLessThanOrEqual(40 + 6)
    expect(W - lay.rect.w * v.s).toBeGreaterThanOrEqual(80 - 4 - 6)  // 짧은 변 5%×2 − 흔들림
    expect(W - lay.rect.w * v.s).toBeLessThanOrEqual(80 + 4 + 6)
    expect(H - lay.rect.h * v.s).toBeGreaterThanOrEqual(80 - 4 - 6)
    expect(H - lay.rect.h * v.s).toBeLessThanOrEqual(80 + 4 + 6)
    // ③ 새 겹의 rect가 화면보다 작다(값으로 — 3부 회귀 팔 ③)
    expect(lay.rect.w * v.s).toBeLessThan(W)
    expect(lay.rect.h * v.s).toBeLessThan(H)
  })

  it('④(3부) 같은 종류 두 장의 오프셋이 다르다 · ⑤ 저장·복원 뒤 오프셋이 같다', () => {
    const s = closedSession()
    const l1 = addLayer(s.app, 'tracing', { W, H })!
    const l2 = addLayer(s.app, 'tracing', { W, H })!
    // 시드 = layer.id(섬유와 같은 출처) — 두 장이 정확히 겹치면 한 장으로 보인다
    expect(l1.rect.x === l2.rect.x && l1.rect.y === l2.rect.y).toBe(false)
    expect(l1.rect.w === l2.rect.w && l1.rect.h === l2.rect.h).toBe(false)
    // ⑤ 오프셋은 rect 자체로 저장된다 — 왕복 뒤 값으로 같다(시드가 문서에 있다)
    const back = parseBrnl(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))!
    expect(back.doc.layers.map(l => l.rect)).toEqual(s.app.doc.layers.map(l => l.rect))
  })
})

describe('④ 새 획이 활성 겹으로 · rect 성장(확정 시점)', () => {
  it('활성 겹으로 가고, 종이 밖 획이 rect를 넓힌다', () => {
    const s = closedSession()
    s.app.view = { s: 1, ox: 0, oy: 0 }
    const lay = addLayer(s.app, 'tracing', { W, H })!
    const r0 = { ...lay.rect }                       // 긋기 전에 찍는다 — 뒤에 찍으면 못 잰다
    const st = s.draw(300, 600, 500, 620)!
    expect(st.layer).toBe(lay.id)
    // 인셋 rect 안(web2-21 3-b — 기본값이 화면 전체가 아니라 인셋) — 안 자란다
    expect(lay.rect).toEqual(r0)
    // 오른쪽 밖으로 긋는다 — 확정 시점에 자란다(x1이 끝점을 덮는다)
    const out = s.draw(1100, 600, 1400, 630)!
    expect(out.layer).toBe(lay.id)
    expect(lay.rect.x + lay.rect.w).toBeGreaterThanOrEqual(1400)
    expect(lay.rect.x).toBe(r0.x)                    // 반대쪽은 안 움직인다
  })

  it('활성 해제(null)면 종이에 직접 — layer 필드가 없다', () => {
    const s = closedSession()
    addLayer(s.app, 'tracing', { W, H })
    setActiveLayer(s.app, null)
    const st = s.draw(300, 600, 500, 620)!
    expect(st.layer).toBeUndefined()
  })

  it('활성 규칙 — 잠긴 겹은 활성 불가 · 끄면 활성 해제 · 활성으로 만들면 자동 켬 · 종이 바꾸면 해제', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setLayerLocked(s.app, lay.id, true)
    expect(s.app.activeLayer).toBeNull()             // 잠그면 활성이 풀린다
    setActiveLayer(s.app, lay.id)
    expect(s.app.activeLayer).toBeNull()             // 잠긴 겹은 활성이 못 된다
    setLayerLocked(s.app, lay.id, false)
    setActiveLayer(s.app, lay.id)
    expect(s.app.activeLayer).toBe(lay.id)
    setLayerOn(s.app, lay.id, false)
    expect(s.app.activeLayer).toBeNull()             // 끄면 활성이 풀린다
    setActiveLayer(s.app, lay.id)
    expect(s.app.doc.layers[0]!.on).toBe(true)       // 활성으로 만들면 자동으로 켜진다
    const sh = addSheet(s.app)
    gotoSheet(s.app, sh.id)
    expect(s.app.activeLayer).toBeNull()             // 겹은 종이에 속한다
    gotoSheet(s.app, DRAW_SHEET_ID)
  })
})

describe('⑤ 겹 삭제(2-c) — 실행취소 대상', () => {
  it('삭제 → 획·겹이 사라진다 → 실행취소 → 둘 다 돌아온다(자리까지) → 다시실행', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    s.draw(300, 600, 500, 620)
    s.draw(320, 640, 520, 660)
    const before = s.app.doc.strokes.length
    removeLayer(s.app, lay.id)
    expect(s.app.doc.strokes.length).toBe(before - 2)
    expect(s.app.doc.layers.length).toBe(0)
    undo(s.app)
    expect(s.app.doc.strokes.length).toBe(before)
    expect(s.app.doc.layers.length).toBe(1)
    expect(s.app.doc.strokes.filter(x => x.layer === lay.id).length).toBe(2)
    redo(s.app)
    expect(s.app.doc.strokes.length).toBe(before - 2)
    expect(s.app.doc.layers.length).toBe(0)
  })
})

describe('⑦ 종이 삭제 규약 변경(2-c) — 겹이 있으면 실행취소 대상', () => {
  it('겹이 있는 종이 삭제 → 겹·획이 딸려 간다 → 실행취소로 전부 돌아온다', () => {
    const s = closedSession()
    const sh = addSheet(s.app)                        // 종이 2(활성이 된다)
    const lay = addLayer(s.app, 'yellow', { W, H })!
    expect(lay.sheet).toBe(sh.id)
    s.draw(300, 600, 500, 620)
    const nStrokes = s.app.doc.strokes.length
    const nUndo = s.app.undoStack.length
    deleteSheet(s.app, sh.id)
    expect(s.app.doc.sheets.length).toBe(1)
    expect(s.app.doc.layers.length).toBe(0)
    expect(s.app.doc.strokes.length).toBe(nStrokes - 1)
    expect(s.app.undoStack.length).toBe(nUndo + 1)    // 실행취소 대상이 됐다(규약 변경)
    undo(s.app)
    expect(s.app.doc.sheets.length).toBe(2)
    expect(s.app.doc.layers.length).toBe(1)
    expect(s.app.doc.strokes.length).toBe(nStrokes)
  })

  it('겹 없는 종이 삭제는 종전대로 실행취소 밖(web2-19 규약 유지)', () => {
    const s = closedSession()
    const sh = addSheet(s.app)
    const nUndo = s.app.undoStack.length
    deleteSheet(s.app, sh.id)
    expect(s.app.doc.sheets.length).toBe(1)
    expect(s.app.undoStack.length).toBe(nUndo)        // op가 안 쌓인다
  })
})
