// web2-19 2부 — **종이 탭**(Doc.sheets · .brnl v4)의 회귀 팔.
// 게이트 몫: ①(v3 이하 → 종이 마이그레이션) ②(왕복) ⑤(종이 삭제가 획을 안 지운다).
// 나머지: ③(「+」가 지금 포즈·뷰를 담는다) ④(탭 = 그 포즈 · 작도 종이 = DRAW_POSE+drawView)
//         ⑥(작도 종이는 못 지운다) ⑦(이름 변경 왕복).
// 반증(D-3): 작도 종이에 pose를 담으면 ④가 어긋난다 — 실제로 담아 확인한다.

import { describe, it, expect } from 'vitest'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { createApp, addSheet, deleteSheet, renameSheet, gotoSheet, loadDoc, commitStroke } from '../src/app/state'
import { DRAW_POSE } from '../src/core/camera'
import { DRAW_SHEET_ID } from '../src/core/types'
import type { CamPose } from '../src/core/types'

const QID = { x: 0, y: 0, z: 0, w: 1 }
const POSE_A: CamPose = { p: { x: 0, y: 1.6, z: -3 }, q: { x: 0, y: 0.3, z: 0, w: 0.954 } }
const POSE_B: CamPose = { p: { x: 2, y: 0.4, z: -5 }, q: { x: 0.1, y: 0, z: 0, w: 0.995 } }

/** v2 형식의 .brnl 원문 — savedViews 둘. 마이그레이션의 입력이다. */
function v2Text(version: 1 | 2 | 3 = 2): string {
  return JSON.stringify({
    format: 'brnl', version,
    frame: { W: 1200, H: 800 },
    strokes: [
      { id: 1, a: { x: 280, y: 560 }, b: { x: 700, y: 560 } },
      { id: 2, a: { x: 500, y: 560 }, b: { x: 800, y: 480 } },
    ],
    faces: [], unit: 'mm', nextId: 3,
    savedViews: [
      { pose: POSE_A, view: { s: 2, ox: 10, oy: -5 } },
      { pose: POSE_B, view: { s: 1, ox: 0, oy: 0 }, thumb: 'data:image/jpeg;base64,QUJD' },
    ],
  })
}

describe('① 마이그레이션 — v3 이하의 savedViews[i] → sheets[i+1] · 작도 종이가 앞에 선다', () => {
  it('v2: 개수·이름·포즈·썸네일이 값으로 맞는다', () => {
    const d = parseBrnl(v2Text(2))!
    expect(d).not.toBeNull()
    const sh = d.doc.sheets
    expect(sh.length).toBe(3)
    // 작도 종이 — 앞에 서고 pose가 없다(정본은 DRAW_POSE·drawView 하나씩 — #54)
    expect(sh[0]!.name).toBe('작도')
    expect(sh[0]!.pose).toBeUndefined()
    expect(sh[0]!.view).toBeUndefined()
    // 명명된 뷰 → 종이 — 이름 「종이 2」부터
    expect(sh[1]!.name).toBe('종이 2')
    expect(sh[1]!.pose).toEqual(POSE_A)
    expect(sh[1]!.view).toEqual({ s: 2, ox: 10, oy: -5 })
    expect(sh[2]!.name).toBe('종이 3')
    expect(sh[2]!.thumb).toBe('data:image/jpeg;base64,QUJD')
    // id는 획과 한 통 — 서로 다르고 nextId가 전부 위에 있다
    const ids = [sh[1]!.id, sh[2]!.id, ...d.doc.strokes.map(s => s.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.max(...ids)).toBeLessThan(d.nextId)
  })

  it('v1(지평선 획 형식)도 변환을 지나 종이가 된다 — oy 보정이 유지된다', () => {
    const t = JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
      strokes: [
        { id: 1, a: { x: 100, y: 300 }, b: { x: 1100, y: 300 } },   // 옛 지평선(수평)
        { id: 2, a: { x: 280, y: 460 }, b: { x: 700, y: 460 } },
      ],
      faces: [], unit: 'mm', nextId: 3,
      savedViews: [{ pose: POSE_A, view: { s: 2, ox: 10, oy: -5 } }],
    })
    const d = parseBrnl(t)!
    expect(d).not.toBeNull()
    expect(d.doc.sheets.length).toBe(2)
    expect(d.doc.sheets[0]!.name).toBe('작도')
    // 평행이동 보정(web2-17 2-b): dy = 400 − 300 = 100 → oy' = −5 − 100·2 = −205
    expect(d.doc.sheets[1]!.view!.oy).toBeCloseTo(-205, 9)
  })

  it('v3도 받는다(지시 2-b 문면) — **게이트 ①의 등록문이 v3이므로 v3 판을 실제로 태운다**: 종이가 v2와 똑같이 선다 · v7은 거부', () => {
    const d3 = parseBrnl(v2Text(3))!
    expect(d3).not.toBeNull()
    const d2 = parseBrnl(v2Text(2))!
    // v3 → 종이 셋(작도 + 종이 2 + 종이 3) — v2 마이그레이션과 배열 전체가 같다(2차 리뷰 [1])
    expect(d3.doc.sheets).toEqual(d2.doc.sheets)
    expect(d3.doc.sheets.length).toBe(3)
    expect(d3.doc.sheets[0]!.name).toBe('작도')
    const j = JSON.parse(v2Text(2))
    j.version = 7   // web2-23이 v6을 쓰기 시작했다 — 전방 호환 금지의 문이 한 칸 올라갔다
    expect(parseBrnl(JSON.stringify(j))).toBeNull()
  })
})

describe('② 왕복 — 이름·순서·포즈가 저장→파싱에서 같다(v6 — web2-23부터)', () => {
  it('마이그레이션 결과의 왕복', () => {
    const d = parseBrnl(v2Text(2))!
    const text = serializeBrnl({ doc: d.doc, nextId: d.nextId, drawView: { s: 1.5, ox: 12, oy: -7 } })
    expect(JSON.parse(text).version).toBe(6)   // web2-23 2-b(밑그림) — 쓰는 판은 언제나 최신 하나
    const back = parseBrnl(text)!
    expect(back).not.toBeNull()
    expect(back.doc.sheets).toEqual(d.doc.sheets)
    expect(back.drawView).toEqual({ s: 1.5, ox: 12, oy: -7 })
    // 저장 → 파싱 → 저장이 같은 문자열(자기 왕복)
    expect(serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: back.drawView })).toBe(text)
  })

  it('v4의 깨진 종이는 **그 종이만** 버린다 — 문서를 거부하지 않는다', () => {
    const d = parseBrnl(v2Text(2))!
    const j = JSON.parse(serializeBrnl({ doc: d.doc, nextId: d.nextId }))
    j.sheets[1] = { id: 'x', name: 7 }                      // 모양이 틀렸다
    const back = parseBrnl(JSON.stringify(j))!
    expect(back).not.toBeNull()
    expect(back.doc.sheets.length).toBe(2)                  // 셋 중 하나만 죽었다
    expect(back.doc.sheets[0]!.name).toBe('작도')
    expect(back.doc.sheets[1]!.name).toBe('종이 3')
  })

  it('v4에 작도 종이가 없으면(전부 pose 있음) 앞에 만들어 준다 — 늘 있다', () => {
    const d = parseBrnl(v2Text(2))!
    const j = JSON.parse(serializeBrnl({ doc: d.doc, nextId: d.nextId }))
    j.sheets = j.sheets.slice(1)                            // 작도 종이를 지운 파일
    const back = parseBrnl(JSON.stringify(j))!
    expect(back).not.toBeNull()
    expect(back.doc.sheets[0]!.name).toBe('작도')
    expect(back.doc.sheets[0]!.pose).toBeUndefined()
    expect(back.doc.sheets.length).toBe(3)
  })
})

describe('③④⑤⑥⑦ — 앱 동작', () => {
  function appWith2Strokes() {
    const app = createApp(1200, 800)
    commitStroke(app, { x: 280, y: 560 }, { x: 700, y: 560 }, [])
    commitStroke(app, { x: 500, y: 560 }, { x: 800, y: 480 }, [])
    return app
  }

  it('③ 「+」가 지금 포즈·뷰를 담는다(값으로) — 이름은 「종이 N」', () => {
    const app = appWith2Strokes()
    app.pose = POSE_A
    app.view = { s: 2, ox: 10, oy: -5 }
    const s = addSheet(app, 'data:image/jpeg;base64,QUJD')
    expect(s.pose).toEqual(POSE_A)
    expect(s.view).toEqual({ s: 2, ox: 10, oy: -5 })
    expect(s.pose).not.toBe(app.pose)                       // 복사다 — 참조가 아니다
    expect(s.name).toBe('종이 2')
    expect(app.activeSheet).toBe(s.id)
    expect(app.doc.sheets.length).toBe(2)
  })

  it('④ 탭 = 그 포즈로 · 작도 종이 = DRAW_POSE + drawView', () => {
    const app = appWith2Strokes()
    app.drawView = { s: 1.25, ox: 3, oy: 4 }
    app.pose = POSE_A
    app.view = { s: 2, ox: 10, oy: -5 }
    const s = addSheet(app)
    // 다른 데로 갔다가 탭으로 돌아온다
    app.pose = POSE_B
    app.view = { s: 1, ox: 0, oy: 0 }
    gotoSheet(app, s.id)
    expect(app.pose).toEqual(POSE_A)
    expect(app.view).toEqual({ s: 2, ox: 10, oy: -5 })
    // 작도 종이 탭 — 정본은 DRAW_POSE와 drawView 하나씩(#54)
    gotoSheet(app, DRAW_SHEET_ID)
    expect(app.pose).toEqual(DRAW_POSE)
    expect(app.view).toEqual({ s: 1.25, ox: 3, oy: 4 })
    expect(app.activeSheet).toBe(DRAW_SHEET_ID)
  })

  it('반증(D-3) — 작도 종이에 pose를 담으면 ④가 어긋난다(실제로 담아 확인)', () => {
    const app = appWith2Strokes()
    app.drawView = { s: 1.25, ox: 3, oy: 4 }
    // 작도 종이가 pose를 담았다면(출처가 둘 — #54가 막는 그 상태) 탭이 작도 시점으로
    // 못 돌아간다: gotoSheet는 pose 유무로 갈래를 정하므로 담긴 pose가 이긴다.
    app.doc.sheets[0]!.pose = { p: { ...POSE_A.p }, q: { ...POSE_A.q } }
    app.doc.sheets[0]!.view = { s: 9, ox: 99, oy: 99 }
    gotoSheet(app, DRAW_SHEET_ID)
    expect(app.pose).not.toEqual(DRAW_POSE)                 // ④의 문면이 실제로 깨진다
    expect(app.view).not.toEqual({ s: 1.25, ox: 3, oy: 4 })
  })

  it('⑤ 종이를 지워도 획이 안 지워진다(획 수 전후 동일) · 활성이면 작도로 돌아온다', () => {
    const app = appWith2Strokes()
    const before = app.doc.strokes.length
    const s = addSheet(app)
    expect(app.activeSheet).toBe(s.id)
    deleteSheet(app, s.id)
    expect(app.doc.strokes.length).toBe(before)
    expect(app.doc.sheets.length).toBe(1)
    expect(app.activeSheet).toBe(DRAW_SHEET_ID)             // 지운 종이를 보고 있었다 — 작도로
  })

  it('⑥ 작도 종이는 못 지운다', () => {
    const app = appWith2Strokes()
    deleteSheet(app, DRAW_SHEET_ID)
    expect(app.doc.sheets.length).toBe(1)
    expect(app.doc.sheets[0]!.name).toBe('작도')
  })

  it('⑦ 이름 변경이 왕복에서 남는다 — 작도 종이도 이름은 바꿀 수 있다', () => {
    const app = appWith2Strokes()
    const s = addSheet(app)
    renameSheet(app, s.id, '남측 입면')
    renameSheet(app, DRAW_SHEET_ID, '바탕')
    const text = serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView })
    const back = parseBrnl(text)!
    expect(back.doc.sheets[0]!.name).toBe('바탕')
    expect(back.doc.sheets[1]!.name).toBe('남측 입면')
  })

  it('loadDoc — 연 문서는 작도 종이에서 시작한다', () => {
    const app = createApp(1200, 800)
    const d = parseBrnl(v2Text(2))!
    loadDoc(app, d)
    expect(app.activeSheet).toBe(app.doc.sheets[0]!.id)
    expect(app.pose).toEqual(DRAW_POSE)
  })
})
