import { describe, it, expect } from 'vitest'
import { GRADES, MAT, rng32 } from '../src/core/material'
import { toOBJ, toMTL, toGLTF } from '../src/core/export'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { liftAll } from '../src/core/lift'
import {
  createApp, commitStroke, beginErase, eraseAt, endErase, type App,
} from '../src/app/state'
import { builder } from './fixtures'
import { pt } from '../src/core/vec'

function appWithConstruction(): App {
  const app = createApp(1200, 800)
  commitStroke(app, pt(100, 400), pt(1100, 400))
  commitStroke(app, pt(500, 500), pt(600, 475))
  commitStroke(app, pt(500, 500), pt(400, 475))
  return app
}

describe('경도표 — 2H→2B 단조, 잉크는 균일', () => {
  it('무를수록 진하고 굵고 입자가 많다', () => {
    const pencil = GRADES.filter(g => g !== 'INK')
    for (let i = 1; i < pencil.length; i++) {
      expect(MAT[pencil[i]!].alpha).toBeGreaterThan(MAT[pencil[i - 1]!].alpha)
      expect(MAT[pencil[i]!].width).toBeGreaterThanOrEqual(MAT[pencil[i - 1]!].width)
      expect(MAT[pencil[i]!].grain).toBeGreaterThanOrEqual(MAT[pencil[i - 1]!].grain)
    }
    expect(MAT.INK.grain).toBe(0)
    expect(MAT.INK.alpha).toBe(1)
  })

  it('rng32 — 같은 시드는 같은 수열 (입자가 프레임마다 안 흔들린다)', () => {
    const a = rng32(42), b = rng32(42)
    for (let i = 0; i < 10; i++) expect(a()).toBe(b())
    const c = rng32(43)
    expect(c()).not.toBe(rng32(42)())
  })
})

describe('지우개 둘 — 겹쳐 있어도 서로 안 건드린다 (선따기)', () => {
  function overlapped(): { app: App; pencilId: number; inkId: number } {
    const app = appWithConstruction()
    app.grade = 'HB'
    const p = commitStroke(app, pt(500, 500), pt(500, 300)) // 흑연 (앵커)
    app.grade = 'INK'
    const k = commitStroke(app, pt(500, 500), pt(500, 300)) // 같은 자리에 잉크
    expect(app.lift.lifted.has(p.id)).toBe(true)
    expect(app.lift.lifted.has(k.id)).toBe(true)
    return { app, pencilId: p.id, inkId: k.id }
  }

  it('연필 지우개는 흑연만 지운다', () => {
    const { app, pencilId, inkId } = overlapped()
    app.tool = 'eraser-pencil'
    beginErase(app); eraseAt(app, pt(500, 400)); endErase(app)
    expect(app.doc.strokes.some(s => s.id === pencilId)).toBe(false)
    expect(app.doc.strokes.some(s => s.id === inkId)).toBe(true)
  })

  it('펜 지우개는 잉크만 지운다', () => {
    const { app, pencilId, inkId } = overlapped()
    app.tool = 'eraser-ink'
    beginErase(app); eraseAt(app, pt(500, 400)); endErase(app)
    expect(app.doc.strokes.some(s => s.id === pencilId)).toBe(true)
    expect(app.doc.strokes.some(s => s.id === inkId)).toBe(false)
  })

  it('지운 조각의 남은 부분은 재료를 유지한다', () => {
    const app = appWithConstruction()
    app.grade = '2B'
    commitStroke(app, pt(500, 500), pt(500, 300))
    commitStroke(app, pt(500, 450), pt(700, 450))
    commitStroke(app, pt(600, 450), pt(600, 520))
    app.tool = 'eraser-pencil'
    beginErase(app); eraseAt(app, pt(660, 450)); endErase(app)
    const kept = app.doc.strokes.find(s => s.a.x === 500 && s.a.y === 450)
    expect(kept?.mat?.grade).toBe('2B')
  })
})

describe('재료의 저장·내보내기', () => {
  it('.brnl 왕복이 재료를 보존한다', () => {
    const app = appWithConstruction()
    app.grade = '2H'
    commitStroke(app, pt(500, 500), pt(500, 300), undefined, 0.7)
    const back = parseBrnl(serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] }))!
    const s = back.doc.strokes.find(x => x.mat?.grade === '2H')!
    expect(s).toBeDefined()
    expect(s.mat!.press).toBeCloseTo(0.7, 9)
  })

  it('반례: 모르는 경도는 거부한다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    const raw = JSON.parse(serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] }))
    raw.strokes[raw.strokes.length - 1].mat = { grade: '9B' }
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()
  })

  it('OBJ — 재료가 레이어(g·usemtl)가 되고 MTL이 색을 댄다', () => {
    const app = appWithConstruction()
    app.grade = 'HB'
    commitStroke(app, pt(500, 500), pt(500, 300))
    app.grade = 'INK'
    commitStroke(app, pt(500, 300), pt(700, 350))
    const obj = toOBJ(app.lift)
    expect(obj).toContain('g HB')
    expect(obj).toContain('usemtl HB')
    expect(obj).toContain('g INK')
    const mtl = toMTL()
    expect(mtl).toContain('newmtl HB')
    expect(mtl).toContain('newmtl INK')
  })

  it('glTF — 재료별 프리미티브와 색', () => {
    const app = appWithConstruction()
    app.grade = 'HB'
    commitStroke(app, pt(500, 500), pt(500, 300))
    app.grade = 'INK'
    commitStroke(app, pt(500, 300), pt(700, 350))
    const g = JSON.parse(toGLTF(app.lift))
    expect(g.meshes[0].primitives).toHaveLength(2)
    expect(g.materials.map((m: any) => m.name).sort()).toEqual(['HB', 'INK'])
    // 개수를 손으로 박지 않는다 — 승격 기하에서 끌어온다(깊이선도 3D 선이라 함께 나간다)
    const segs = app.lift.lifted.size
    expect(segs).toBe(4) // 깊이선 둘 + HB 수직 + INK 깊이 획
    const total = g.accessors.reduce((n: number, a: any) => n + a.count, 0)
    expect(total).toBe(segs * 2)                       // 선분마다 정점 둘
    expect(g.buffers[0].byteLength).toBe(segs * 2 * 3 * 4) // 정점마다 float3
  })

  it('반례: 빈 문서도 유효한 glTF', () => {
    // ⚠ 작도만 있는 문서는 이제 «빈» 문서가 아니다 — 깊이선도 3D 선이다(지시 1).
    const empty = liftAll(builder().doc)
    expect(empty.lifted.size).toBe(0)
    const g = JSON.parse(toGLTF(empty))
    expect(g.buffers[0].byteLength).toBe(0)
  })
})
