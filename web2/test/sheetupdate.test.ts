// web2-25 3-c — **시점 갱신**(SketchUp Scenes 의 Update Scene).
//
// 없던 기능이다: 저장한 시점이 낡아도 되돌릴 수도 갱신할 수도 없었다 — 종이 위에서 조금
// 돌려 더 나은 각도를 찾아도 그 각도를 그 종이에 담을 길이 없었다.
//
//   ③ 갱신하면 포즈·뷰·썸네일이 지금 것으로 바뀐다
//   ④ **겹이 있는 종이는 막힌다** — 밑그림이 옛 시점의 것이라 어긋난다(「다시 뜨기 없음」과 같은 결)
//   ㉠ 작도 종이는 시점이 «정의»라 돌려본 각도로는 못 갈아 끼운다(작도 시점에서만)
//   ⑤ **실행취소 대상이 아니다** — 정하고 근거를 적었다(state.ts `updateSheet` 머리주석)
//
// 화면 몫(썸네일 스트립·셔터 번쩍임·길게 눌러 갱신)은 e2e `strip.spec.ts`가 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  addLayer, addSheet, gotoSheet, setPose, setView, sheetUpdateBlock, undo, updateSheet,
} from '../src/app/state'
import { DRAW_SHEET_ID } from '../src/core/types'
import { v3, quatAxisAngle } from '../src/core/vec'

const VP = { W: 1200, H: 800 }

function closed() {
  const s = session(VP.W, VP.H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 700, 450)
  s.draw(500, 500, 300, 450)
  s.draw(700, 450, 300, 450)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

const orbitA = { p: v3(2, 1.6, 3), q: quatAxisAngle(v3(0, 1, 0), 0.35) }
const orbitB = { p: v3(-1, 2.2, 5), q: quatAxisAngle(v3(0, 1, 0), -0.5) }

describe('web2-25 3-c — 시점 갱신', () => {
  it('③ 갱신하면 포즈·뷰·썸네일이 지금 것으로 바뀐다', () => {
    const { app } = closed()
    setPose(app, orbitA)
    const s = addSheet(app, 'THUMB-A')            // 셔터 한 장(A 각도)
    expect(s.pose!.q.y).toBeCloseTo(orbitA.q.y, 12)
    // 조금 더 돌려 더 나은 각도를 찾았다 — 그것을 이 종이에 담는다
    setPose(app, orbitB)
    setView(app, { s: 1.5, ox: 20, oy: -10 })
    expect(sheetUpdateBlock(app, s.id)).toBeNull()
    expect(updateSheet(app, s.id, 'THUMB-B')).toBe(true)
    expect(s.pose!.q.y).toBeCloseTo(orbitB.q.y, 12)
    expect(s.view!.s).toBe(1.5)
    expect(s.thumb).toBe('THUMB-B')
    // 그 종이가 활성이고 지금 보는 것이 그것이다(갱신은 «지금 보이는 것을 담는다»)
    expect(app.activeSheet).toBe(s.id)
    expect(app.pose.q.y).toBeCloseTo(orbitB.q.y, 12)
  })

  it('④ 겹이 있는 종이는 갱신이 막힌다 — 아무것도 안 바뀐다', () => {
    const { app } = closed()
    setPose(app, orbitA)
    const s = addSheet(app, 'THUMB-A')
    addLayer(app, 'yellow', VP)                   // 그 종이에 옐로 한 장
    setPose(app, orbitB)
    expect(sheetUpdateBlock(app, s.id)).toBe('layers')
    expect(updateSheet(app, s.id, 'THUMB-B')).toBe(false)
    expect(s.pose!.q.y).toBeCloseTo(orbitA.q.y, 12)   // 포즈 불변
    expect(s.thumb).toBe('THUMB-A')                    // 썸네일 불변
    // **양성 대조** — 그 겹을 지우면 같은 자리에서 갱신이 된다(막는 조항이 겹 때문임을 못 박는다)
    app.doc.layers = app.doc.layers.filter(l => l.sheet !== s.id)
    expect(sheetUpdateBlock(app, s.id)).toBeNull()
    expect(updateSheet(app, s.id, 'THUMB-B')).toBe(true)
    expect(s.thumb).toBe('THUMB-B')
  })

  it('㉠ 작도 종이 — 돌려본 각도로는 못 갈아 끼우고, 작도 시점에서는 뷰·썸네일을 다시 굽는다', () => {
    const { app } = closed()
    setPose(app, orbitA)
    expect(sheetUpdateBlock(app, DRAW_SHEET_ID)).toBe('draw-pose')
    expect(updateSheet(app, DRAW_SHEET_ID, 'X')).toBe(false)
    // 작도 시점으로 돌아오면 갱신이 열린다 — 포즈는 **여전히 안 담는다**(정본은 DRAW_POSE)
    gotoSheet(app, DRAW_SHEET_ID)
    expect(sheetUpdateBlock(app, DRAW_SHEET_ID)).toBeNull()
    setView(app, { s: 2, ox: 5, oy: 5 })
    expect(updateSheet(app, DRAW_SHEET_ID, 'DRAW-THUMB')).toBe(true)
    const draw = app.doc.sheets[0]!
    expect(draw.pose).toBeUndefined()
    expect(draw.view!.s).toBe(2)
    expect(draw.thumb).toBe('DRAW-THUMB')
  })

  it('⑤ 갱신은 실행취소 대상이 아니다 — 스택이 안 늘고 실행취소가 시점을 안 되돌린다', () => {
    const { app } = closed()
    setPose(app, orbitA)
    const s = addSheet(app, 'THUMB-A')
    const depth = app.undoStack.length
    setPose(app, orbitB)
    expect(updateSheet(app, s.id, 'THUMB-B')).toBe(true)
    expect(app.undoStack.length).toBe(depth)      // 스택이 안 늘었다
    undo(app)
    expect(s.pose!.q.y).toBeCloseTo(orbitB.q.y, 12)   // 시점은 그대로 갱신된 채다
    expect(s.thumb).toBe('THUMB-B')
    // 근거(state.ts): 종이의 시점을 다루는 몸짓이 이미 전부 스택 밖이다 — 저장·삭제·이름.
    // 그 일관성을 **다른 몸짓으로도** 못 박는다: 이름 바꾸기도 스택을 안 늘린다.
    const d2 = app.undoStack.length
    addSheet(app)
    expect(app.undoStack.length).toBe(d2)
  })
})
