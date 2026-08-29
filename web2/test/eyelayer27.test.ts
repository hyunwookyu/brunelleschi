// web2-27 2번 — **눈 토글이 겹 전체를 치운다**의 상태 규칙.
//
// D-2(재현): **지시가 적은 증상은 그대로 재현되지 않았고, 같은 계열의 다른 결함이 났다.**
//   지시: 「눈을 누르면 거기서 그린 선만 사라지고 종이 자체(색조·질감)는 남는다.」
//   표식(e2e `_probe27b`, 겹 하나): 눈을 끄자 화면이 **맨 종이 값으로 정확히 돌아갔다**
//     (245.0,243.0,238.0) — 색조도 결도 같이 사라졌다.
//   표식(겹 둘, 활성=위): 활성 겹을 끄자 **남아 있는 아래 겹의 종이면까지** 사라졌다
//     (204,192,151 → 244.7,242.7,237.8 = 맨 종이. 아래 겹은 `on: true` 그대로였다).
//   원인은 같은 계열이다(#75 ㉠ — 만드는 자리와 보이는 자리가 다른 술어를 읽는다):
//     `setLayerOn`이 활성을 `null`로 떨어뜨리고 `filmSplit`은 「활성 겹이 없으면 갈림도
//     없다」로 **막을 통째로 접는다**. 지시가 준 수리(활성을 한 단계 아래로)가 그것을 고친다.
//
// 픽셀 게이트는 `e2e/eyelayer27.spec.ts`(합성 화면). 여기서는 **상태 규칙**을 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { addLayer, setActiveLayer, setLayerOn, setLayerLocked } from '../src/app/state'
import { filmSplit } from '../src/app/filmlayer'
import { onPaper } from '../src/core/types'

const W = 1200, H = 800

function closed() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

describe('27-2 ① 활성 겹을 끄면 활성이 한 단계 아래로 내려간다', () => {
  it('아래 겹이 있으면 그리로 · 없으면 종이로 (+반증: 종전처럼 null로 떨어뜨리면 막이 통째로 접힌다)', () => {
    const s = closed()
    const yel = addLayer(s.app, 'yellow', { W, H })!
    const tra = addLayer(s.app, 'tracing', { W, H })!
    expect(s.app.activeLayer).toBe(tra.id)
    setLayerOn(s.app, tra.id, false)
    expect(s.app.activeLayer, '한 단계 아래로').toBe(yel.id)
    // 그리고 **아래 겹의 막이 살아 있다** — 이것이 종전에 깨지던 자리다
    const split = filmSplit(s.app)
    expect(split).not.toBeNull()
    expect(split!.films.map(l => l.id)).toEqual([yel.id])
    // 반증(D-3) — 활성을 종이로 내려도 **켜진 겹은 그대로 보인다**(web2-27 2번의 둘째 수리:
    // 표시의 술어가 `on` 하나다). 종전에는 여기서 `null`이 나와 막이 통째로 접혔고,
    // 그래서 「껐다 켜면 종이면이 안 돌아온다」가 났다.
    setActiveLayer(s.app, null)
    const split2 = filmSplit(s.app)
    expect(split2).not.toBeNull()
    expect(split2!.films.map(l => l.id)).toEqual([yel.id])   // 켜진 겹만
    expect(split2!.above.size).toBe(0)
    // 그리고 **겹이 아예 없으면** 종전대로 갈림이 없다(비용 회계의 전제 — web2-20 3-b)
    const bare = closed()
    expect(filmSplit(bare.app)).toBeNull()
  })

  it('아래에 켜진 겹이 없으면 종이로 내려간다', () => {
    const s = closed()
    const yel = addLayer(s.app, 'yellow', { W, H })!
    setLayerOn(s.app, yel.id, false)
    expect(s.app.activeLayer).toBeNull()
  })

  it('아래 겹이 **잠겨** 있으면 건너뛴다 — 잠긴 겹은 활성이 못 된다', () => {
    const s = closed()
    const a = addLayer(s.app, 'yellow', { W, H })!
    const b = addLayer(s.app, 'tracing', { W, H })!
    setLayerLocked(s.app, a.id, true)
    setActiveLayer(s.app, b.id)
    setLayerOn(s.app, b.id, false)
    expect(s.app.activeLayer).toBeNull()      // 잠긴 a를 안 고른다
  })

  it('다시 켜도 활성은 **자동으로 안 올라간다**(사용자가 고른다 — 지시 문면)', () => {
    const s = closed()
    const yel = addLayer(s.app, 'yellow', { W, H })!
    const tra = addLayer(s.app, 'tracing', { W, H })!
    setLayerOn(s.app, tra.id, false)
    expect(s.app.activeLayer).toBe(yel.id)
    setLayerOn(s.app, tra.id, true)
    expect(s.app.activeLayer, '자동으로 안 올린다').toBe(yel.id)
  })
})

describe('27-2 ② 끈 상태에서 그은 획이 안 보이는 층에 안 들어간다', () => {
  it('활성이 내려간 겹에 들어간다 — 그리고 그 겹은 보인다', () => {
    const s = closed()
    const yel = addLayer(s.app, 'yellow', { W, H })!
    const tra = addLayer(s.app, 'tracing', { W, H })!
    setLayerOn(s.app, tra.id, false)
    const st = s.draw(400, 300, 600, 300)!
    expect(st.layer, '새 획은 내려간 활성 겹의 것이다').toBe(yel.id)
    expect(s.app.doc.layers.find(l => l.id === yel.id)!.on).toBe(true)
    expect(s.app.doc.strokes.filter(x => x.layer === tra.id)).toHaveLength(0)
  })

  it('겹이 하나뿐이면 종이로 내려가고 새 획이 종이의 것이 된다', () => {
    const s = closed()
    const yel = addLayer(s.app, 'yellow', { W, H })!
    setLayerOn(s.app, yel.id, false)
    const n0 = s.app.doc.strokes.filter(onPaper).length
    s.draw(400, 620, 600, 620)
    expect(s.app.doc.strokes.filter(onPaper).length).toBe(n0 + 1)
  })
})

describe('27-2 ③ 다시 켜면 획 수와 좌표가 왕복한다', () => {
  it('끄고 켜는 사이에 문서가 안 바뀐다 — 좌표까지', () => {
    const s = closed()
    const tra = addLayer(s.app, 'tracing', { W, H })!
    s.draw(500, 560, 500, 660)
    s.draw(560, 560, 560, 680)
    const snap = () => s.app.doc.strokes.filter(x => x.layer === tra.id)
      .map(x => [x.id, x.a.x, x.a.y, x.b.x, x.b.y])
    const before = snap()
    expect(before.length).toBe(2)
    setLayerOn(s.app, tra.id, false)
    expect(snap()).toEqual(before)                          // 문서는 안 바뀐다(표시만)
    for (const x of before) expect(s.app.lift.lifted.has(x[0] as number)).toBe(false)  // 3D에서는 빠진다
    setLayerOn(s.app, tra.id, true)
    expect(snap()).toEqual(before)
    for (const x of before) expect(s.app.lift.lifted.has(x[0] as number)).toBe(true)
  })
})
