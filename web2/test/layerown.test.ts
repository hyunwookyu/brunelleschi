// web2-26 1번 — **획의 층 소유권**. 「트레이싱지의 중요한 점은 종이에 그려놓은 원래
// 모델에 영향이 없다는 것이다」(web2-21)가 지켜지는지.
//
// D-2(먼저 재현한다): 실기기가 「선따기 뒤 종이가 달라진다」로 냈다(DEVICE-CHECK E2).
//   지시가 준 픽스처(긋기만)는 **재현이 안 됐다** — 종이 3 그대로였다(D-4: 사람이 준
//   경로는 후보다). 표식(D-1)을 커밋·지우개 두 자리에 심고 나서야 갈렸다:
//   오염은 **지우개 조각**에서 났다(E2의 실제 몸짓이 「확대해서 바깥 토막 지우기」다).
//   조각이 `layer`를 안 물려받아 `onPaper`가 참이 됐고, 그래서
//     ① 겹을 꺼도 종이에 남고  ② 겹을 걷어도(layer === id만 걷는다) 눌러앉는다.
//
// D-3(반증 조건): 각 팔마다 **승계를 손으로 벗겨** 그 팔이 실제로 실패하는 것을 본다.
//   벗기지 않으면 이 팔은 아무것도 안 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  addLayer, setActiveLayer, setLayerOn, removeLayer,
  beginErase, eraseAt, endErase,
} from '../src/app/state'
import { onPaper } from '../src/core/types'
import type { App } from '../src/app/state'

const W = 1200, H = 800

const paperCount = (app: App) => app.doc.strokes.filter(onPaper).length
const layerCount = (app: App, id: number) => app.doc.strokes.filter(s => s.layer === id).length

/** 종이에 «열린 모서리» 셋 — 둘째 획이 소실점을 닫는다(constructionDone) */
function paperThree() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  s.draw(500, 560, 500, 660)
  expect(paperCount(s.app)).toBe(3)
  return s
}

describe('26-1 게이트 — 종이 3 · 트레이싱 1 · 걷으면 종이 3', () => {
  it('지시 픽스처(긋기만) — 세 값이 맞는다', () => {
    const s = paperThree()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    s.draw(500, 560, 500, 700)                 // 종이의 세로선을 따라 긋는다
    expect(paperCount(s.app)).toBe(3)
    expect(layerCount(s.app, lay.id)).toBe(1)
    setLayerOn(s.app, lay.id, false)
    expect(paperCount(s.app)).toBe(3)          // 끈 상태에서 종이만 = 3
    setLayerOn(s.app, lay.id, true)
    removeLayer(s.app, lay.id)
    expect(paperCount(s.app)).toBe(3)          // 걷어도 종이는 그대로
    expect(s.app.doc.strokes.length).toBe(3)
  })

  it('선따기 + 바깥 토막 지우기 — 조각이 겹에 남는다 (재현했던 증상)', () => {
    const s = paperThree()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    // 가로선을 가로질러 길게 — 지우개가 잘라 **조각 둘**이 나는 자리를 만든다
    s.draw(500, 500, 500, 700)
    beginErase(s.app)
    eraseAt(s.app, { x: 500, y: 510 })         // 바깥(위) 토막만
    endErase(s.app)

    expect(paperCount(s.app)).toBe(3)          // ← 수리 전 4였다
    expect(layerCount(s.app, lay.id)).toBe(1)
    const frag = s.app.doc.strokes.find(x => x.layer === lay.id)!
    expect(frag.own3).toBeTruthy()             // 조각도 3D를 승계한다(web2-13 4부 그대로)

    setLayerOn(s.app, lay.id, false)
    expect(paperCount(s.app)).toBe(3)
    expect(s.app.lift.lifted.has(frag.id)).toBe(false)   // 꺼진 겹은 3D에서도 빠진다

    setLayerOn(s.app, lay.id, true)
    removeLayer(s.app, lay.id)
    expect(paperCount(s.app)).toBe(3)
    expect(s.app.doc.strokes.length).toBe(3)   // 걷으면 그 획도 그 3D도 같이 간다
  })

  it('반증(D-3) — 조각의 층을 손으로 벗기면 위 두 팔이 그대로 실패한다', () => {
    const s = paperThree()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    s.draw(500, 500, 500, 700)
    beginErase(s.app)
    eraseAt(s.app, { x: 500, y: 510 })
    endErase(s.app)
    const frag = s.app.doc.strokes.find(x => x.layer === lay.id)!
    delete frag.layer                          // ← 승계가 없던 시절의 상태
    expect(paperCount(s.app)).toBe(4)          // 오염(종전 증상)
    removeLayer(s.app, lay.id)
    expect(paperCount(s.app)).toBe(4)          // 걷어도 눌러앉는다
  })
})

describe('26-1 — 아래 층의 3D는 읽을 수 있고 쓸 수 없다', () => {
  it('겹 획이 종이의 3D를 근거로 자기 3D를 세운다 (읽기는 흐른다)', () => {
    const s = paperThree()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    const t = s.draw(600, 560, 600, 640)!      // 종이의 가로선(3D) 위에서 내려긋는다
    expect(t.layer).toBe(lay.id)
    expect(s.app.lift.lifted.has(t.id)).toBe(true)   // 아래 3D를 근거로 자립했다
  })

  // ⚙️ 「겹이 종이의 대기선을 굳히지 못한다」와 그 **층 무산 계수**는 `layerrule.test.ts`가
  //    정본이다(web2-21 2부 · defineByTouch의 층 문). 여기서 다시 안 쓴다 — 팔이 둘이면
  //    규칙의 출처가 둘이 된다(#54). 이 파일이 더하는 것은 **커밋·지우개 조각의 소유**다.

  it('겹 획이 종이의 대기선을 굳히지 못한다 (쓰기는 안 흐른다 — 결과만 다시 확인)', () => {
    const s = paperThree()
    const w = s.draw(300, 400, 620, 400)!      // 종이의 자유 대기선
    expect(s.app.lift.waiting.includes(w.id)).toBe(true)
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    s.draw(400, 300, 400, 400)                 // 겹에서 그 대기선 위로 내려 찍는다
    const paperW = s.app.doc.strokes.find(x => x.id === w.id)!
    expect(paperW.own3).toBeFalsy()            // 종이의 3D가 안 바뀐다
    expect(s.app.lift.waiting.includes(w.id)).toBe(true)     // 여전히 대기다
  })
})

describe('26-1 — 커밋 소유에는 예외가 없다', () => {
  it('잠긴/꺼진 겹이 활성인 경계 상태에서도 새 획이 종이로 안 떨어진다', () => {
    const s = paperThree()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    // setActiveLayer는 이 상태를 안 만든다 — 문서를 연 직후 같은 경계를 손으로 만든다
    lay.locked = true
    s.draw(500, 560, 500, 700)
    expect(paperCount(s.app)).toBe(3)          // ← 종전에는 4(종이로 떨어졌다)
    lay.locked = false
    lay.on = false
    s.draw(520, 560, 520, 700)
    expect(paperCount(s.app)).toBe(3)
  })
})
