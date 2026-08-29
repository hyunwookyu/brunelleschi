// web2-29 2단계 — **모드를 없앤다**의 게이트.
//
// 핵심 순서(지시 문면): **기본은 그림이고, 치수는 제안이다.**
//   「먼저 바꾸고 되돌리게 하면 숫자처럼 생긴 스케치를 그릴 때마다 방해가 된다.」
//
// 게이트 넷:
//   ① 숫자를 써도 **자동으로 안 바뀐다**(제안만 뜬다)
//   ② 무시하면 **획으로 남는다**
//   ③ **옐로에서는 제안이 안 뜬다**
//   ④ 1단계 경로(도구를 골라서 쓰기)가 계속 작동한다
//
// ⚠ #74 ㉠ — ③은 **제안 자체를 아예 안 만들어도** 통과한다. 그래서 같은 실행에서
//   **종이·트레이싱지에서는 제안이 실제로 선다**를 분해능으로 짝지운다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  handwritingGroup, nearestDimTarget, proposeDim, acceptSuggest, dismissSuggest, retargetSuggest,
  pickDimTarget, stageDim, acceptDim, undo,
  addLayer, setActiveLayer, commitStroke,
} from '../src/app/state'
import { onPaper } from '../src/core/types'
import { C } from '../src/core/constants'
import type { App } from '../src/app/state'
import type { Pt } from '../src/core/vec'

const W = 1200, H = 800

function closed() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 종이 위에 «작은 획 넷»을 놓는다 — 숫자를 쓴 셈이다(인식 자체는 ①이 재지 않는다). */
function writeSmall(app: App, x0: number, y0: number, n = 4): number[] {
  const ids: number[] = []
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 26
    const raw: Pt[] = [{ x, y: y0 }, { x: x + 12, y: y0 + 8 }, { x: x + 4, y: y0 + 22 }]
    const st = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
    ids.push(st.id)
  }
  return ids
}

describe('29-2 ① 숫자를 써도 자동으로 안 바뀐다 — 제안만 뜬다', () => {
  it('제안을 세워도 문서가 그대로다 (획 수·치수 둘 다)', () => {
    const s = closed()
    // ⚠ 대상 추정은 **가장 가까운 3D 획**이다 — 픽스처의 손글씨를 그 선 곁에 둔다.
    //   (초판은 지평선 쪽에 써 놓고 세로선을 기대했다: 실측이 그것을 곧바로 잡았다.)
    const target = s.draw(500, 560, 500, 700)!
    const before = { n: s.app.doc.strokes.length, dim: s.app.doc.strokes.find(x => x.id === target.id)!.dim }
    const ids = writeSmall(s.app, 520, 690)
    const group = handwritingGroup(s.app)
    console.log(`[29-2 ①] 손글씨 묶음 ${JSON.stringify(group)} (쓴 것 ${JSON.stringify(ids)})`)
    expect(group).toEqual(ids)
    expect(proposeDim(s.app, group, '2500', 2500)).toBe(true)
    // **제안이 떴을 뿐** — 문서는 안 바뀐다
    expect(s.app.dimSuggest).not.toBeNull()
    expect(s.app.doc.strokes.length, '손글씨가 그대로 문서에 있다').toBe(before.n + ids.length)
    expect(s.app.doc.strokes.find(x => x.id === target.id)!.dim, '치수는 아직 없다').toBe(before.dim)
    console.log(`[29-2 ①] 제안 — 대상 ${s.app.dimSuggest!.target} · 값 ${s.app.dimSuggest!.mm}`)
    expect(s.app.dimSuggest!.target).toBe(target.id)     // 가장 가까운 3D 획
  })

  it('받으면 그때 비로소 바뀐다 — 손글씨가 걷히고 치수가 선다 · 실행취소 한 번에 돌아온다', () => {
    const s = closed()
    const target = s.draw(500, 560, 500, 700)!
    const ids = writeSmall(s.app, 520, 690)
    const n0 = s.app.doc.strokes.length
    proposeDim(s.app, handwritingGroup(s.app), '2500', 2500)
    const r = acceptSuggest(s.app)
    console.log(`[29-2 ①'] 받음 ${r} — 획 ${n0} → ${s.app.doc.strokes.length}`)
    expect(r === 'applied' || r === 'scale').toBe(true)
    expect(s.app.doc.strokes.length, '손글씨가 걷힌다').toBe(n0 - ids.length)
    expect(s.app.doc.strokes.find(x => x.id === target.id)!.dim).toBe(2500)
    expect(s.app.dimSuggest).toBeNull()
    // **실행취소 한 번**에 손글씨가 통째로 돌아온다(획을 지우는 일이므로 지우개와 같은 급)
    undo(s.app)
    expect(s.app.doc.strokes.length, '한 번에 돌아온다').toBe(n0)
    for (const id of ids) expect(s.app.doc.strokes.some(x => x.id === id), `${id} 복귀`).toBe(true)
  })
})

describe('29-2 ② 무시하면 획으로 남는다', () => {
  it('무시해도 문서가 그대로고, 그 획들은 여전히 그림이다', () => {
    const s = closed()
    s.draw(500, 560, 500, 660)
    const ids = writeSmall(s.app, 300, 300)
    const n0 = s.app.doc.strokes.length
    proposeDim(s.app, handwritingGroup(s.app), '2500', 2500)
    dismissSuggest(s.app)
    expect(s.app.dimSuggest).toBeNull()
    expect(s.app.doc.strokes.length, '획이 그대로 남는다').toBe(n0)
    for (const id of ids) expect(s.app.doc.strokes.some(x => x.id === id)).toBe(true)
    expect(s.app.doc.strokes.every(x => x.dim === undefined), '치수는 안 생겼다').toBe(true)
    console.log(`[29-2 ②] 무시 — 획 ${n0} 그대로 · 치수 0`)
    // ⚠ **그 말이 남는다** — 곁에 숫자를 하나 더 써도 무시한 획은 다시 안 묶인다.
    //   없으면 「무시하면 그림으로 남는다」가 **그 순간만** 참이다(실측: 받는 순간 같이 걷혔다).
    const more = writeSmall(s.app, 500, 300, 2)
    const g2 = handwritingGroup(s.app)
    console.log(`[29-2 ②'] 새 묶음 ${JSON.stringify(g2)} — 무시한 ${JSON.stringify(ids)}는 안 들어간다`)
    expect(g2).toEqual(more)
    for (const id of ids) expect(g2.includes(id), `${id}는 그림이다`).toBe(false)
  })
})

describe('29-2 ③ 옐로에서는 제안이 안 뜬다 (+분해능: 종이·트레이싱지에서는 뜬다)', () => {
  it('같은 손글씨를 세 매체에 써서 나란히 잰다', () => {
    const rows: { where: string; group: number }[] = []
    // 종이
    const a = closed()
    a.draw(500, 560, 500, 660)
    writeSmall(a.app, 300, 300)
    rows.push({ where: '종이', group: handwritingGroup(a.app).length })
    // 트레이싱지
    const b = closed()
    b.draw(500, 560, 500, 660)
    const tra = addLayer(b.app, 'tracing', { W, H })!
    setActiveLayer(b.app, tra.id)
    writeSmall(b.app, 300, 300)
    rows.push({ where: '트레이싱지', group: handwritingGroup(b.app).length })
    // 옐로 — **자유 스케치이고 스냅도 안 걸린다: 거기 숫자는 치수가 아니라 메모다**
    const c = closed()
    c.draw(500, 560, 500, 660)
    const yel = addLayer(c.app, 'yellow', { W, H })!
    setActiveLayer(c.app, yel.id)
    writeSmall(c.app, 300, 300)
    rows.push({ where: '옐로', group: handwritingGroup(c.app).length })

    for (const r of rows) console.log(`[29-2 ③] ${r.where} — 손글씨 묶음 ${r.group}`)
    expect(rows[0]!.group, '종이에서는 뜬다(분해능)').toBeGreaterThan(0)
    expect(rows[1]!.group, '트레이싱지에서도 뜬다(분해능)').toBeGreaterThan(0)
    expect(rows[2]!.group, '옐로에서는 안 뜬다').toBe(0)
  })

  it('큰 획은 그림이다 — 글자 대역을 넘으면 묶음이 안 선다(그것이 기본이다)', () => {
    const s = closed()
    s.draw(500, 560, 500, 660)
    // 글자 대역(`DIM_GLYPH_MAX_PX`)을 넘는 획
    const big: Pt[] = [{ x: 200, y: 200 }, { x: 200 + C.DIM_GLYPH_MAX_PX * 2, y: 260 }]
    commitStroke(s.app, big[0]!, big[1]!, big)
    console.log(`[29-2 ③'] 큰 획(${C.DIM_GLYPH_MAX_PX * 2}px) — 묶음 ${handwritingGroup(s.app).length}`)
    expect(handwritingGroup(s.app)).toEqual([])
  })
})

describe('29-2 ④ 1단계 경로가 계속 작동한다', () => {
  it('도구를 골라 대상을 탭하고 값을 받는 길이 그대로다', () => {
    const s = closed()
    const target = s.draw(500, 560, 500, 660)!
    expect(pickDimTarget(s.app, { x: 500, y: 610 })).toBe(target.id)
    stageDim(s.app, '2500', 2500)
    const r = acceptDim(s.app)
    console.log(`[29-2 ④] 1단계 경로 — ${r} · dim ${s.app.doc.strokes.find(x => x.id === target.id)!.dim}`)
    expect(r === 'applied' || r === 'scale').toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === target.id)!.dim).toBe(2500)
  })
})

describe('29-2 ⑤ 어디에 매길지 — 추정하고, 틀렸으면 바꿀 수 있다', () => {
  it('가장 가까운 선을 고르고, 다른 선을 탭하면 그리로 옮겨간다', () => {
    const s = closed()
    const near = s.draw(500, 560, 500, 700)!
    const far = s.draw(680, 560, 680, 720)!
    writeSmall(s.app, 520, 690)                 // near 쪽에 가깝게 쓴다
    const ids = handwritingGroup(s.app)
    expect(nearestDimTarget(s.app, ids)).toBe(near.id)
    proposeDim(s.app, ids, '2500', 2500)
    expect(s.app.dimSuggest!.target).toBe(near.id)
    // 틀렸으면 지정할 수 있어야 한다(지시 문면) — 다른 선을 탭한다
    expect(retargetSuggest(s.app, { x: 680, y: 660 })).toBe(true)
    expect(s.app.dimSuggest!.target).toBe(far.id)
    console.log(`[29-2 ⑤] 대상 ${near.id} → ${far.id}`)
    // 대역 밖 탭은 아무 일도 안 한다(제안이 안 흔들린다)
    expect(retargetSuggest(s.app, { x: 100, y: 120 })).toBe(false)
    expect(s.app.dimSuggest!.target).toBe(far.id)
    // 그리고 받으면 **그 선**에 붙는다
    acceptSuggest(s.app)
    expect(s.app.doc.strokes.find(x => x.id === far.id)!.dim).toBe(2500)
    expect(s.app.doc.strokes.find(x => x.id === near.id)!.dim).toBeUndefined()
    expect(s.app.doc.strokes.filter(onPaper).length).toBeGreaterThan(0)
  })
})
