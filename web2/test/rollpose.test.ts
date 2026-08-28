// web2-25 2부 — **롤이 시점을 굳힌다**(지금 사는 결함).
//
// 증상(사람의 문면): 「시점을 돌려보다가 어떤 시점에서 옐로우/트레이싱지를 얹고 싶어서
// 롤 모양 아이콘을 눌렀을 때 … **옐/트가 추가는 되지만 화면에 보이지 않는 문제.**」
//
// 원인(2-a — **후보였고 재현이 확인했다**): 겹은 종이에 붙고 막은 그 종이의 시점에서만
// 그려진다(web2-20 3-a·3-d — `atSheetPose`). 돌려본 시점은 아직 어느 종이의 시점도
// 아니므로 겹이 **활성 종이**(대개 작도 종이)에 얹히고 지금 화면에서는 안 보인다.
//
// 답(2-b): **롤을 누를 때 지금 포즈가 활성 종이의 포즈와 다르면 그 시점을 새 종이로
// 굳히고 그 위에 얹는다.** 「+ 는 각도를 찾은 뒤 저장한다」와 **같은 규칙**이다 —
// 롤을 누르는 것도 「이 각도에서 시작한다」는 선언이다.
//
//   ① 돌린 시점에서 롤 → 종이가 하나 늘고 **그 시점에서 막이 보인다**(여기서는
//      `atSheetPose` 참 + 겹이 새 종이에 붙었다. 픽셀은 e2e `rollpose.spec` ①)
//   ② 활성 종이의 시점 그대로면 종이가 **안 는다**
//   ③ 새 종이가 저장·복원에서 남는다
//   ④ 셔터와 롤이 같은 함수를 부른다 → `static.test.ts`(정적 검사)
//   **재현(D-2)**: 굳히지 않고 얹으면 `atSheetPose`가 거짓이고 겹이 작도 종이에 붙는다

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  addLayer, addSheet, atSheetPose, freezePoseForLayer, gotoSheet, loadDoc, setPose, createApp,
} from '../src/app/state'
import { DRAW_SHEET_ID } from '../src/core/types'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { v3, quatAxisAngle } from '../src/core/vec'

const VP = { W: 1200, H: 800 }

/** 카메라를 닫은 문서 하나 — 겹은 `constructionDone` 뒤에만 얹힌다(web2-20 2-a) */
function closed() {
  const s = session(VP.W, VP.H)
  s.draw(100, 400, 1100, 400)     // 지평선
  s.draw(500, 500, 700, 450)      // 깊이선 1
  s.draw(500, 500, 300, 450)      // 깊이선 2
  s.draw(700, 450, 300, 450)      // 닫는 획
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 궤도로 돌린 것과 같은 포즈 — 앱의 `setPose`를 그대로 부른다(사본 없음) */
function orbit(app: ReturnType<typeof createApp>) {
  setPose(app, { p: v3(2, 1.6, 3), q: quatAxisAngle(v3(0, 1, 0), 0.35) })
}

describe('web2-25 2부 — 롤이 시점을 굳힌다', () => {
  it('재현(D-2) — 굳히지 않고 얹으면 겹이 작도 종이에 붙고 그 시점에서는 안 보인다', () => {
    const { app } = closed()
    expect(atSheetPose(app)).toBe(true)              // 작도 종이의 시점이다
    orbit(app)
    expect(atSheetPose(app)).toBe(false)             // 이제 어느 종이의 시점도 아니다
    const before = app.doc.sheets.length
    const lay = addLayer(app, 'yellow', VP)!         // **굳히지 않고** 얹는다(옛 경로)
    expect(app.doc.sheets.length).toBe(before)       // 종이가 안 는다
    expect(lay.sheet).toBe(DRAW_SHEET_ID)            // 작도 종이에 붙었다
    // 그리고 이것이 증상이다 — 막의 게이트가 거짓이라 화면에 안 뜬다(web2-20 3-d)
    expect(atSheetPose(app)).toBe(false)
  })

  it('① 돌린 시점에서 롤 → 종이가 하나 늘고 겹이 그 종이에 붙는다(막의 게이트가 참)', () => {
    const { app } = closed()
    orbit(app)
    const before = app.doc.sheets.length
    const s = freezePoseForLayer(app)                // 롤이 얹기 전에 부르는 그 함수
    expect(s).not.toBeNull()
    expect(app.doc.sheets.length).toBe(before + 1)
    expect(s!.name).toBe(`종이 ${before + 1}`)       // 이름 규약(2-b)
    const lay = addLayer(app, 'yellow', VP)!
    expect(lay.sheet).toBe(s!.id)
    expect(app.activeSheet).toBe(s!.id)
    // **막이 보인다** — 게이트가 참이다(픽셀 판정은 e2e rollpose.spec ①)
    expect(atSheetPose(app)).toBe(true)
    // 굳힌 포즈가 지금 포즈다(값으로)
    expect(s!.pose!.p.x).toBeCloseTo(app.pose.p.x, 12)
    expect(s!.pose!.q.y).toBeCloseTo(app.pose.q.y, 12)
  })

  it('② 활성 종이의 시점 그대로면 종이가 안 는다 — 작도 종이에서도, 저장 종이에서도', () => {
    const { app } = closed()
    // ㉠ 작도 시점 — 아무 일도 안 한다
    expect(freezePoseForLayer(app)).toBeNull()
    expect(app.doc.sheets.length).toBe(1)
    // ㉡ 돌려서 한 장 굳히고, **그 종이의 시점 그대로** 다시 부르면 또 안 는다
    orbit(app)
    const s = freezePoseForLayer(app)!
    expect(app.doc.sheets.length).toBe(2)
    expect(freezePoseForLayer(app)).toBeNull()
    expect(app.doc.sheets.length).toBe(2)
    // ㉢ 그 종이를 떠났다 돌아와도(gotoSheet가 포즈를 되돌린다) 안 는다
    gotoSheet(app, DRAW_SHEET_ID)
    gotoSheet(app, s.id)
    expect(freezePoseForLayer(app)).toBeNull()
    expect(app.doc.sheets.length).toBe(2)
  })

  it('③ 굳힌 종이와 그 위의 겹이 저장·복원에서 남는다', () => {
    const { app } = closed()
    orbit(app)
    const s = freezePoseForLayer(app)!
    const lay = addLayer(app, 'yellow', VP)!
    const txt = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const back = parseBrnl(txt)!
    const app2 = createApp(VP.W, VP.H)
    loadDoc(app2, back)
    const sheet2 = app2.doc.sheets.find(x => x.id === s.id)
    expect(sheet2).toBeTruthy()
    expect(sheet2!.name).toBe(s.name)
    expect(sheet2!.pose!.p.x).toBeCloseTo(s.pose!.p.x, 12)
    expect(sheet2!.pose!.q.y).toBeCloseTo(s.pose!.q.y, 12)
    expect(app2.doc.layers.find(l => l.id === lay.id)!.sheet).toBe(s.id)
    // 그 종이로 가면 막의 게이트가 다시 참이다(복원된 포즈가 같은 값이다)
    gotoSheet(app2, s.id)
    expect(atSheetPose(app2)).toBe(true)
  })

  it('음성 대조 — 굳히는 것은 **얹을 때**뿐이다: 셔터 없이 돌리기만 하면 종이가 안 는다', () => {
    const { app } = closed()
    orbit(app)
    orbit(app)
    expect(app.doc.sheets.length).toBe(1)
    // 셔터(addSheet)는 그 자체로 한 장을 만든다 — 두 경로가 같은 함수를 부른다는 것이
    // 정적 검사의 몫이고, 여기서는 «굳히기»가 부수 효과가 아님을 못 박는다
    addSheet(app)
    expect(app.doc.sheets.length).toBe(2)
  })
})
