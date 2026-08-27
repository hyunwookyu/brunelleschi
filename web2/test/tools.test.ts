// 도구 넷 — 연필 · 펜 · 지우개 둘 (지시 4-h · 4-j)
//
// **재료가 다르므로 도구가 다르다.** 연필은 경도(2H~2B)를 고르고 펜은 니브 굵기를 고른다 —
// 실제로도 홀더펜과 제도펜은 별개다. 지우개 둘이 그것과 짝이 맞는다(선따기).
//
// 초판은 「펜 하나에 경도 슬라이더, 끝이 잉크」였다. 그러면 잉크가 **가장 무른 연필**이 되고,
// 지우개 둘이 무엇을 가르는지가 슬라이더의 끝 한 칸에 걸린다.

import { describe, it, expect } from 'vitest'
import {
  createApp, commitStroke, activeGrade, isEraser,
  beginErase, eraseAt, endErase, type App,
} from '../src/app/state'
import { PENCIL_GRADES, GRADES, widthOf, MAT } from '../src/core/material'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { C } from '../src/core/constants'
import { pt } from '../src/core/vec'

function built(): App {
  const app = createApp(1200, 800)
  commitStroke(app, pt(100, 400), pt(1100, 400))   // 지평선
  commitStroke(app, pt(500, 500), pt(600, 475))    // 깊이선 1
  commitStroke(app, pt(500, 500), pt(400, 475))    // 깊이선 2
  return app
}

describe('4-h — 연필과 펜이 갈린다', () => {
  it('기본 도구는 연필이고 기본 심은 HB', () => {
    const app = createApp(1200, 800)
    expect(app.tool).toBe('pencil')
    expect(app.grade).toBe('HB')
    expect(app.nib).toBe(C.NIB_PX)
  })

  it('연필 심 목록에 잉크가 없다 — 홀더펜 창에 도는 것이 이 목록이다', () => {
    expect(PENCIL_GRADES).not.toContain('INK')
    expect(PENCIL_GRADES).toHaveLength(6)
    expect(GRADES).toContain('INK')   // 재료로서는 남아 있다
  })

  it('도구 전환이 재료를 정한다 — 펜은 언제나 잉크다 (4-j)', () => {
    const app = built()
    app.grade = '2B'
    expect(activeGrade(app)).toBe('2B')
    const p = commitStroke(app, pt(500, 500), pt(500, 300))
    expect(p.mat!.grade).toBe('2B')

    app.tool = 'pen'
    expect(activeGrade(app)).toBe('INK')   // 경도를 안 건드렸는데 잉크다
    const k = commitStroke(app, pt(500, 500), pt(600, 475))
    expect(k.mat!.grade).toBe('INK')

    app.tool = 'pencil'
    expect(activeGrade(app)).toBe('2B')    // 연필로 돌아오면 고른 심 그대로
  })

  it('경도 선택이 그린 선에 반영된다 — 여섯 전부 (4-j)', () => {
    const app = built()
    for (const g of PENCIL_GRADES) {
      app.grade = g
      const s = commitStroke(app, pt(500, 500), pt(500, 300))
      expect(s.mat!.grade).toBe(g)
      expect(widthOf(s)).toBe(MAT[g].width)   // 연필 굵기는 심이 정한다
    }
  })

  it('니브 굵기가 잉크 획에만 실린다 — 연필 굵기는 심이 정한다', () => {
    const app = built()
    app.tool = 'pen'
    app.nib = 3
    const k = commitStroke(app, pt(500, 500), pt(600, 475))
    expect(k.mat!.w).toBe(3)
    expect(widthOf(k)).toBe(3)

    app.tool = 'pencil'
    const p = commitStroke(app, pt(500, 500), pt(500, 300))
    expect(p.mat!.w).toBeUndefined()
    expect(widthOf(p)).toBe(MAT.HB.width)
  })

  it('기본 니브는 안 적는다 — 안 바꾼 값을 파일에 쌓지 않는다', () => {
    const app = built()
    app.tool = 'pen'
    const k = commitStroke(app, pt(500, 500), pt(600, 475))
    expect(k.mat!.w).toBeUndefined()
    expect(widthOf(k)).toBe(MAT.INK.width)  // 없으면 재료 기본값
  })

  it('isEraser — 그리는 도구 둘과 지우는 도구 둘', () => {
    expect(isEraser('pencil')).toBe(false)
    expect(isEraser('pen')).toBe(false)
    expect(isEraser('eraser-pencil')).toBe(true)
    expect(isEraser('eraser-ink')).toBe(true)
  })
})

describe('4-j — 지우개 둘이 도구 전환으로 갈린다', () => {
  /** 같은 자리에 연필 선과 펜 선을 겹쳐 긋는다 — 도구 전환만으로 */
  function overlapped() {
    const app = built()
    app.tool = 'pencil'; app.grade = 'HB'
    const p = commitStroke(app, pt(500, 500), pt(500, 300))
    app.tool = 'pen'
    const k = commitStroke(app, pt(500, 500), pt(500, 300))
    expect(app.lift.lifted.has(p.id)).toBe(true)
    expect(app.lift.lifted.has(k.id)).toBe(true)
    return { app, pencilId: p.id, inkId: k.id }
  }

  it('연필 지우개가 펜 선을 안 지운다', () => {
    const { app, pencilId, inkId } = overlapped()
    app.tool = 'eraser-pencil'
    beginErase(app); eraseAt(app, pt(500, 400)); endErase(app)
    expect(app.doc.strokes.some(s => s.id === pencilId)).toBe(false)
    expect(app.doc.strokes.some(s => s.id === inkId)).toBe(true)
  })

  it('펜 지우개가 연필 선을 안 지운다 — 그 반대도 그렇다', () => {
    const { app, pencilId, inkId } = overlapped()
    app.tool = 'eraser-ink'
    beginErase(app); eraseAt(app, pt(500, 400)); endErase(app)
    expect(app.doc.strokes.some(s => s.id === pencilId)).toBe(true)
    expect(app.doc.strokes.some(s => s.id === inkId)).toBe(false)
  })

  it('반례: 지우개는 작도 획(소실점 획)을 못 지운다 — 도구가 갈려도 그대로다', () => {
    // web2-17: 지평선은 획이 아니게 됐다 — 보호되는 작도 획은 소실점을 만든 획이다.
    const { app } = overlapped()
    const vpStroke = app.doc.strokes.find(s => app.lift.an.roles.get(s.id) === 'vp')!
    const mid = pt((vpStroke.a.x + vpStroke.b.x) / 2, (vpStroke.a.y + vpStroke.b.y) / 2)
    for (const t of ['eraser-pencil', 'eraser-ink'] as const) {
      app.tool = t
      beginErase(app); eraseAt(app, mid); endErase(app)
      expect(app.doc.strokes.some(s => s.id === vpStroke.id)).toBe(true)
    }
  })
})

describe('니브의 저장·복원', () => {
  it('.brnl 왕복이 니브를 보존한다', () => {
    const app = built()
    app.tool = 'pen'; app.nib = 2.4
    commitStroke(app, pt(500, 500), pt(600, 475))
    const back = parseBrnl(serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] }))!
    const s = back.doc.strokes.find(x => x.mat?.grade === 'INK')!
    expect(s.mat!.w).toBeCloseTo(2.4, 9)
  })

  it('반례: 대역 밖 니브는 거부한다 — 0이면 three.js가 조용히 안 그린다', () => {
    const app = built()
    app.tool = 'pen'; app.nib = 2
    commitStroke(app, pt(500, 500), pt(600, 475))
    const raw = JSON.parse(serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] }))
    for (const bad of [0, -1, C.NIB_MAX + 1, 'x']) {
      raw.strokes[raw.strokes.length - 1].mat.w = bad
      expect(parseBrnl(JSON.stringify(raw))).toBeNull()
    }
  })

  it('반례: 니브가 없는 옛 저장본은 그대로 열린다 — 재료 기본값이 받는다', () => {
    const app = built()
    commitStroke(app, pt(500, 500), pt(500, 300))
    const raw = JSON.parse(serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] }))
    for (const s of raw.strokes) if (s.mat) delete s.mat.w
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back).not.toBeNull()
    for (const s of back.doc.strokes) expect(widthOf(s)).toBeGreaterThan(0)
  })
})
