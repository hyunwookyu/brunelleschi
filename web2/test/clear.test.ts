// 비우기 — 그림도 작도도 전부 버리고 지평선 단계로 돌아간다.
// 실행취소 대상이 아니다(작도 획이 op에 없다) — 그래서 UI가 확인을 한 번 받는다.

import { describe, it, expect } from 'vitest'
import {
  createApp, commitStroke, undo, redo, clearAll, saveView, setPose, setView, type App,
} from '../src/app/state'
import { DRAW_POSE } from '../src/core/camera'
import { pt, v3, QID } from '../src/core/vec'

/** 작도(지평선 + 소실점 둘) + 내용 획 + 시점 하나 — 지울 것이 다 있는 앱 */
function fullApp(): App {
  const app = createApp(1200, 800)
  commitStroke(app, pt(100, 400), pt(1100, 400))
  commitStroke(app, pt(300, 700), pt(600, 550)) // vp (900,400)
  commitStroke(app, pt(700, 700), pt(400, 550)) // vp (100,400)
  commitStroke(app, pt(500, 500), pt(500, 300)) // 앵커 — 3D로
  commitStroke(app, pt(500, 300), pt(700, 350)) // 연쇄
  saveView(app)
  return app
}

describe('비우기', () => {
  it('그림·작도·시점이 전부 사라지고 지평선 단계로 돌아간다', () => {
    const app = fullApp()
    expect(app.doc.strokes.length).toBe(5)
    expect(app.lift.an.vps).toHaveLength(2)
    expect(app.lift.lifted.size).toBe(2)

    clearAll(app, 1200, 800)

    expect(app.doc.strokes).toHaveLength(0)
    expect(app.lift.lifted.size).toBe(0)
    expect(app.lift.waiting).toHaveLength(0)
    // 카메라가 사라진다 — 지평선부터 다시다(작도 획도 같이 버린 결과)
    expect(app.lift.an.horizonY).toBeNull()
    expect(app.lift.an.vps).toHaveLength(0)
    expect(app.savedViews).toHaveLength(0)
    expect(app.nextId).toBe(1)
  })

  it('시점(포즈·뷰 오프셋)도 작도 시점으로 돌아온다', () => {
    const app = fullApp()
    setPose(app, { p: v3(10, 20, 30), q: QID })
    setView(app, { s: 2.5, ox: -100, oy: 40 })

    clearAll(app, 1200, 800)

    expect(app.pose).toEqual(DRAW_POSE)
    expect(app.view).toEqual({ s: 1, ox: 0, oy: 0 })
  })

  it('빈 상태에서 새로 그리면 처음과 똑같이 진행한다 (찌꺼기가 없다)', () => {
    const app = fullApp()
    clearAll(app, 1200, 800)

    commitStroke(app, pt(100, 400), pt(1100, 400))
    expect(app.lift.an.horizonY).toBe(400)
    commitStroke(app, pt(300, 700), pt(600, 550))
    expect(app.lift.an.vps).toHaveLength(1)
    const s = commitStroke(app, pt(700, 700), pt(400, 550))
    expect(app.lift.an.vps).toHaveLength(2)
    // id가 1부터 다시 나간다 — 옛 문서의 id와 안 섞인다
    expect(s.id).toBe(3)
  })

  it('실행취소·다시실행이 지운 것을 되살리지 않는다 (확인이 그 자리를 대신한다)', () => {
    const app = fullApp()
    clearAll(app, 1200, 800)

    undo(app)
    expect(app.doc.strokes).toHaveLength(0)
    redo(app)
    expect(app.doc.strokes).toHaveLength(0)
    expect(app.undoStack).toHaveLength(0)
    expect(app.redoStack).toHaveLength(0)
  })

  it('프레임(좌표계)은 지금 창 크기로 새로 잡는다', () => {
    const app = fullApp()
    clearAll(app, 900, 600)
    expect(app.doc.frame).toEqual({ W: 900, H: 600 })

    // 반례: 옛 프레임을 붙들면 주점이 화면 가운데를 벗어난다.
    // 새 프레임에서 그은 지평선·깊이선의 소실점이 새 폭 기준으로 나오는지 본다.
    commitStroke(app, pt(50, 300), pt(850, 300))
    commitStroke(app, pt(200, 550), pt(450, 430)) // → 지평선과의 교점
    expect(app.lift.an.horizonY).toBe(300)
    expect(app.lift.an.vps).toHaveLength(1)
    expect(app.lift.an.vps[0]!.x).toBeCloseTo(200 + 250 * (550 - 300) / (550 - 430), 6)
  })

  it('문서 버전이 올라가 렌더·자동 저장이 듣는다', () => {
    const app = fullApp()
    let heard = 0
    app.listeners.push(() => { heard++ })
    const v0 = app.docVersion
    clearAll(app, 1200, 800)
    expect(app.docVersion).toBeGreaterThan(v0)
    expect(heard).toBeGreaterThan(0)
  })
})
