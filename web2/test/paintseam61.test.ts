// web2-61 — 이음매(core/paintseam)의 상태 몫(단위 · 픽셀은 e2e grain61/bake61.spec).
//   ① 도구 표식 매핑(instrOfTag) — 저장 규약(paint.i) 그대로(50의 규약).
//   ② drawMark는 등록된 렌더러에 위임한다 · 등록 없으면 던진다(조용히 안 그리는 것 ⛔) ·
//      2점 미만은 안 부른다.
//   ③ drawMarksSeam — drawMany가 있으면 그리로(목록 차례 그대로) · 없으면 draw를 돈다 ·
//      2점 미만은 거른다.
//   ④ 반증 스위치 넷 — 켜고 끄기가 읽기에 실린다(엔진 중립 — 어느 엔진이 와도 같은 뜻).
//   반증(D-3): ②의 «던진다»는 렌더러를 등록하면 실제로 사라진다 — 같은 팔이 등록 전후를
//   다 본다(등록 전 throw · 등록 후 위임 — 검사가 스스로 실패 조건을 실행한다).

import { describe, it, expect, afterEach } from 'vitest'
import {
  instrOfTag, INSTRS58, setPaintRenderer, paintRendererId, drawMark, drawMarksSeam,
  setMarkerFlatForTest, markerFlatForTest, setPaintOpaqueForTest, paintOpaqueForTest,
  setPressFlatForTest, pressFlatForTest, setGrainOffForTest, grainOffForTest,
  type PaintRenderer, type SeamMark,
} from '../src/core/paintseam'

const mark = (n: number, seed = 1): SeamMark => ({
  pts: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
  color: '#000', wPx: 4, seed, tool: 'pencil',
})
const g = {} as CanvasRenderingContext2D    // 위임 확인만 — 렌더러 목이 픽셀을 안 만진다

afterEach(() => {
  setMarkerFlatForTest(false); setPaintOpaqueForTest(false)
  setPressFlatForTest(false); setGrainOffForTest(false)
})

describe('61 — 이음매', () => {
  it('① instrOfTag — 저장 표식 그대로(0/undefined = 붓)', () => {
    expect(instrOfTag(undefined)).toBe('brush')
    expect(instrOfTag(0)).toBe('brush')
    expect(instrOfTag(1)).toBe('marker')
    expect(instrOfTag(2)).toBe('cp')
    expect(instrOfTag(3)).toBe('pencil')
    expect(INSTRS58).toEqual(['brush', 'marker', 'cp', 'pencil'])
  })

  it('② 등록 전 throw → 등록 후 위임(반증을 같은 팔이 실행) · 2점 미만은 안 부른다', () => {
    // ⚠ 다른 팔이 등록해 뒀을 수 있다 — 이 팔이 처음으로 «없음» 상태를 만들어 본다
    const calls: SeamMark[] = []
    const mock: PaintRenderer = { id: 'mock61', draw: (_g, m) => { calls.push(m) } }
    setPaintRenderer(null as unknown as PaintRenderer)
    expect(() => drawMark(g, mark(3))).toThrow()
    setPaintRenderer(mock)
    expect(paintRendererId()).toBe('mock61')
    drawMark(g, mark(3))
    expect(calls.length).toBe(1)
    drawMark(g, mark(1))                       // 2점 미만 — 위임 없음
    expect(calls.length).toBe(1)
  })

  it('③ drawMarksSeam — drawMany 우선(차례 그대로) · 없으면 draw 루프 · 2점 미만 거름', () => {
    const seen: number[] = []
    const many: PaintRenderer = {
      id: 'many', draw: () => { throw new Error('drawMany가 있으면 draw는 안 온다') },
      drawMany: (_g, ms) => { for (const m of ms) seen.push(m.seed) },
    }
    setPaintRenderer(many)
    drawMarksSeam(g, [mark(3, 11), mark(1, 12), mark(5, 13)])
    expect(seen).toEqual([11, 13])             // 차례 보존 · 1점짜리 걸러짐
    const seen2: number[] = []
    const loop: PaintRenderer = { id: 'loop', draw: (_g, m) => { seen2.push(m.seed) } }
    setPaintRenderer(loop)
    drawMarksSeam(g, [mark(2, 21), mark(2, 22)])
    expect(seen2).toEqual([21, 22])
  })

  it('④ 반증 스위치 넷 — 쓰기가 읽기에 실린다', () => {
    for (const [set, get] of [
      [setMarkerFlatForTest, markerFlatForTest],
      [setPaintOpaqueForTest, paintOpaqueForTest],
      [setPressFlatForTest, pressFlatForTest],
      [setGrainOffForTest, grainOffForTest],
    ] as const) {
      expect(get()).toBe(false)
      set(true)
      expect(get()).toBe(true)
      set(false)
    }
  })
})
