// web2-59 — 칠 엔진의 뼈대: **상태 몫**(단위 · node에는 캔버스가 없다 — 픽셀은 e2e paint59.spec).
//
//   59-1  미리보기 획은 커밋과 **같은 함수**(buildPaintStrokes)에서 나온다 — 문서를 안 건드리고,
//         같은 입력(점렬·압력·idBase = nextId)에서 커밋이 실제로 만드는 획과 **같다**(id·uv·w·s).
//   반증  idBase가 다르면 id(=시드)가 갈린다 — 「같다」가 입력의 함수임을 같은 팔이 보인다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { commitPaint, buildPaintStrokes, toggleFaceAt } from '../src/app/state'
import type { Pt } from '../src/core/vec'

/** facetex.test의 그 방 — 벽 하나가 선다(#54: 같은 픽스처) */
function wallScene() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 300)
  s.draw(600, 475, 600, 300)
  s.draw(600, 300, 500, 300)
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  return s
}

const line = (x0: number, y: number, x1: number, n = 12): Pt[] => {
  const out: Pt[] = []
  for (let k = 0; k <= n; k++) out.push({ x: x0 + (x1 - x0) * (k / n), y })
  return out
}

describe('59-1 — 미리보기 획 == 확정 획(buildPaintStrokes ↔ commitPaint · 같은 입력)', () => {
  it('문서를 안 건드리고, 커밋이 만드는 획과 id·uv·w·쪽이 같다', () => {
    const s = wallScene()
    s.app.tool = 'paint'
    s.app.paintSel = { hex: '#3a6b35', i: 'pencil', w: 12, br: 'deevad/liner', o: 1 }
    const pts = line(515, 420, 585)
    const press = pts.map((_, i) => Math.round((0.3 + 0.5 * (i / (pts.length - 1))) * 8191))
    const n0 = s.app.doc.strokes.length, id0 = s.app.nextId
    const b = buildPaintStrokes(s.app, pts, press, s.app.nextId)
    expect(b.strokes.length, '벽 위 획 하나').toBe(1)
    expect(s.app.doc.strokes.length, '문서 무변').toBe(n0)
    expect(s.app.nextId, 'nextId 무변').toBe(id0)
    const r = commitPaint(s.app, pts, press)
    expect(r.placed).toBe(1)
    const c = s.app.doc.strokes[s.app.doc.strokes.length - 1]!
    const d = b.strokes[0]!
    expect(d.id).toBe(c.id)
    expect(d.paint!.f).toBe(c.paint!.f)
    expect(d.paint!.s).toBe(c.paint!.s)
    expect(d.paint!.w).toBe(c.paint!.w)
    expect(d.paint!.i).toBe(c.paint!.i)
    expect(d.paint!.c).toBe(c.paint!.c)
    expect(d.paint!.uv).toEqual(c.paint!.uv)
    expect(d.paint!.press).toEqual(c.paint!.press)
    expect(s.app.nextId, '커밋이 id를 그만큼 올린다').toBe(id0 + 1)
  })
  it('반증(D-3) — idBase가 다르면 id(시드)가 갈린다 · 면 밖 점렬은 획이 0(offFace가 센다)', () => {
    const s = wallScene()
    s.app.tool = 'paint'
    s.app.paintSel = { hex: '#3a6b35', i: 'pencil', w: 12, br: 'deevad/liner', o: 1 }
    const pts = line(515, 420, 585)
    const a = buildPaintStrokes(s.app, pts, undefined, s.app.nextId)
    const b = buildPaintStrokes(s.app, pts, undefined, s.app.nextId + 7)
    expect(a.strokes[0]!.id + 7).toBe(b.strokes[0]!.id)
    const off = buildPaintStrokes(s.app, line(100, 100, 200), undefined, s.app.nextId)
    expect(off.strokes.length).toBe(0)
    expect(off.offFace).toBeGreaterThan(0)
    expect(s.app.paintDraft, '미리보기 목록은 런타임 필드(기본 null)').toBeNull()
  })
})
