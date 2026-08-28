// web2-25 4-a — **솔로(그것만 보기)**.
//
// Procreate 가 표시 체크박스를 **길게 눌러** 하는 것이고, 「대안 하나만 놓고 보고 싶다」가
// 이 도구에서 늘 나는 국면이다(트레이싱지 여러 장 = 대안 여러 개).
//
// ⚠⚠ **새 게이트를 안 만들었다**(#54): 솔로 = «나머지를 끈 것»이므로 `setLayerOn`을 그대로
// 부르고 되돌릴 켬/끔을 기억한다. 그래서 「꺼진 겹은 3D에서도 빠진다」(web2-20 4-b)에
// **자동으로 같이 걸린다** — 지시 4-a ⚠가 「정하고 적으라」 한 자리이고, 판단 근거는
// `DECISIONS.md` D-W12 [6]다. 아래 ③이 그 사실을 **값으로** 낸다.
//
//   ① 솔로 → 그것만 켜지고 나머지가 꺼진다
//   ② 다시 솔로 → **원래대로** 돌아온다(꺼져 있던 것은 꺼진 채)
//   ③ **3D에도 걸린다** — 꺼진 겹의 획이 `lift.lifted`에서 빠진다
//   ④ 손으로 눈을 건드리면 솔로가 풀린다(기억이 낡았다 — 되돌리지 않고 버린다)
//   ⑤ 종이를 바꾸면 되돌린다(솔로는 그 종이 안의 상태다)

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  addLayer, gotoSheet, isSolo, setActiveLayer, setLayerOn, setSolo, addSheet,
} from '../src/app/state'
import { DRAW_SHEET_ID } from '../src/core/types'

const VP = { W: 1200, H: 800 }

/** 카메라를 닫고 트레이싱지 셋을 얹은 뒤, 겹마다 획을 하나씩 긋는다 */
function threeLayers() {
  const s = session(VP.W, VP.H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 700, 450)
  s.draw(500, 500, 300, 450)
  s.draw(700, 450, 300, 450)
  expect(s.app.lift.an.constructionDone).toBe(true)
  const base = s.app.lift.lifted.size
  const ids: number[] = []
  for (let i = 0; i < 3; i++) {
    const lay = addLayer(s.app, 'tracing', VP)!
    ids.push(lay.id)
    setActiveLayer(s.app, lay.id)
    // 그 겹 위에 3D로 올라가는 획 하나(축 스냅이 붙는 방향)
    s.draw(500, 500 + i * 6, 700 - i * 8, 450 + i * 4)
  }
  return { app: s.app, ids, base }
}

const onOf = (app: ReturnType<typeof threeLayers>['app'], ids: number[]) =>
  ids.map(id => app.doc.layers.find(l => l.id === id)!.on)

describe('web2-25 4-a — 솔로(그것만 보기)', () => {
  it('① 솔로 → 그것만 켜지고 나머지가 꺼진다', () => {
    const { app, ids } = threeLayers()
    expect(onOf(app, ids)).toEqual([true, true, true])
    setSolo(app, ids[1]!)
    expect(onOf(app, ids)).toEqual([false, true, false])
    expect(isSolo(app, ids[1]!)).toBe(true)
    expect(isSolo(app, ids[0]!)).toBe(false)
    expect(app.activeLayer).toBe(ids[1]!)     // 보고 있는 것이 활성이다
  })

  it('② 다시 솔로 → 원래대로 돌아온다 — **꺼져 있던 것은 꺼진 채**', () => {
    const { app, ids } = threeLayers()
    setLayerOn(app, ids[0]!, false)           // 사람이 먼저 하나를 꺼 뒀다
    expect(onOf(app, ids)).toEqual([false, true, true])
    setSolo(app, ids[2]!)
    expect(onOf(app, ids)).toEqual([false, false, true])
    setSolo(app, ids[2]!)                     // 같은 것을 다시 = 끄기
    expect(onOf(app, ids)).toEqual([false, true, true])   // **원래 상태 그대로**
    expect(app.solo).toBeNull()
  })

  it('②′ 다른 겹으로 솔로를 옮기면 먼저 되돌리고 다시 건다', () => {
    const { app, ids } = threeLayers()
    setSolo(app, ids[0]!)
    setSolo(app, ids[2]!)
    expect(onOf(app, ids)).toEqual([false, false, true])
    expect(isSolo(app, ids[2]!)).toBe(true)
    setSolo(app, null)
    expect(onOf(app, ids)).toEqual([true, true, true])
  })

  it('③ 솔로가 3D에도 걸린다 — 꺼진 겹의 획이 lifted 에서 빠진다', () => {
    const { app, ids, base } = threeLayers()
    const all = app.lift.lifted.size
    expect(all).toBeGreaterThan(base)         // 겹 획들이 실제로 올라가 있다(분해능)
    setSolo(app, ids[1]!)
    const solo = app.lift.lifted.size
    expect(solo).toBeLessThan(all)            // **3D에서 빠졌다**
    // 정확히 «꺼진 두 겹의 획»만큼 빠졌다 — 손으로 둘을 끈 것과 **같은 수**여야 한다
    setSolo(app, null)
    setLayerOn(app, ids[0]!, false)
    setLayerOn(app, ids[2]!, false)
    expect(app.lift.lifted.size).toBe(solo)
  })

  it('④ 손으로 눈을 건드리면 솔로가 풀린다 — 되돌리지 않고 기억만 버린다', () => {
    const { app, ids } = threeLayers()
    setSolo(app, ids[1]!)
    expect(app.solo).not.toBeNull()
    setLayerOn(app, ids[0]!, true)            // 사람이 하나를 다시 켰다
    expect(app.solo).toBeNull()               // 기억이 낡았다 — 버린다
    expect(onOf(app, ids)).toEqual([true, true, false])   // 지금 화면이 그대로 남는다
  })

  it('⑤ 종이를 바꾸면 되돌린다 — 솔로는 그 종이 안의 상태다', () => {
    const { app, ids } = threeLayers()
    setSolo(app, ids[1]!)
    expect(onOf(app, ids)).toEqual([false, true, false])
    addSheet(app)                             // 새 종이(셔터)
    gotoSheet(app, DRAW_SHEET_ID)
    expect(app.solo).toBeNull()
    expect(onOf(app, ids)).toEqual([true, true, true])    // 꺼 둔 겹이 안 남는다
  })
})
