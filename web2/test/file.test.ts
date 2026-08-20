import { describe, it, expect } from 'vitest'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { toOBJ, toGLTF } from '../src/core/export'
import { liftAll } from '../src/core/lift'
import { constructedDoc } from './fixtures'
import { v3, QID } from '../src/core/vec'

function sampleData() {
  const b = constructedDoc()
  b.add(500, 500, 500, 300)
  b.add(500, 300, 700, 350, { p: v3(1, 2, 3), q: QID })
  return { doc: b.doc, nextId: 99, savedViews: [{ pose: { p: v3(0, 0, 5), q: QID }, view: { s: 2, ox: 10, oy: -5 } }] }
}

describe('.brnl 저장·복원', () => {
  it('왕복이 무손실이다', () => {
    const d = sampleData()
    const text = serializeBrnl(d)
    const back = parseBrnl(text)!
    expect(back).not.toBeNull()
    expect(back.doc.frame).toEqual(d.doc.frame)
    expect(back.doc.strokes).toEqual(d.doc.strokes)
    expect(back.nextId).toBe(99)
    expect(back.savedViews).toEqual(d.savedViews)
    // 파생(카메라)이 저장 안 됐는데도 복원 후 같은 계산이 나온다
    const l1 = liftAll(d.doc)
    const l2 = liftAll(back.doc)
    expect(l2.an.f).toBe(l1.an.f)
    expect(l2.lifted.size).toBe(l1.lifted.size)
  })

  it('반례: 깨진 입력은 null', () => {
    expect(parseBrnl('not json')).toBeNull()
    expect(parseBrnl('{}')).toBeNull()
    expect(parseBrnl(JSON.stringify({ format: 'brnl', version: 2 }))).toBeNull()
    expect(parseBrnl(JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 100, H: 100 },
      strokes: [{ id: 1, a: { x: 0, y: 0 }, b: { x: 'bad', y: 0 } }],
    }))).toBeNull()
  })

  it('nextId가 획 id와 안 겹치게 복원된다', () => {
    const d = sampleData()
    const raw = JSON.parse(serializeBrnl(d))
    delete raw.nextId
    const back = parseBrnl(JSON.stringify(raw))!
    const maxId = Math.max(...back.doc.strokes.map(s => s.id))
    expect(back.nextId).toBeGreaterThan(maxId)
  })
})

describe('내보내기', () => {
  const lift = liftAll((() => { const b = constructedDoc(); b.add(500, 500, 500, 300); b.add(500, 300, 700, 350); return b.doc })())

  it('OBJ — 선분당 정점 2, l 요소 1', () => {
    const obj = toOBJ(lift)
    const vLines = obj.split('\n').filter(l => l.startsWith('v '))
    const lLines = obj.split('\n').filter(l => l.startsWith('l '))
    expect(vLines).toHaveLength(lift.lifted.size * 2)
    expect(lLines).toHaveLength(lift.lifted.size)
    // 첫 정점 좌표가 리프팅 값과 같다
    const first = [...lift.lifted.values()][0]!
    const nums = vLines[0]!.split(' ').slice(1).map(Number)
    expect(nums[0]).toBeCloseTo(first.a3.x, 9)
    expect(nums[1]).toBeCloseTo(first.a3.y, 9)
    expect(nums[2]).toBeCloseTo(first.a3.z, 9)
    for (const l of vLines) {
      expect(l.split(' ').slice(1).map(Number).every(isFinite)).toBe(true)
    }
  })

  it('glTF — LINES 프리미티브, 버퍼 크기·내용 일치', () => {
    const g = JSON.parse(toGLTF(lift))
    expect(g.asset.version).toBe('2.0')
    expect(g.meshes[0].primitives[0].mode).toBe(1)
    const n = lift.lifted.size
    expect(g.accessors[0].count).toBe(n * 2)
    expect(g.buffers[0].byteLength).toBe(n * 2 * 3 * 4)
    // base64를 풀어 첫 float를 대조
    const b64 = g.buffers[0].uri.split(',')[1]
    const buf = Buffer.from(b64, 'base64')
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, n * 6)
    const first = [...lift.lifted.values()][0]!
    expect(f32[0]).toBeCloseTo(first.a3.x, 4)
    expect(f32[2]).toBeCloseTo(first.a3.z, 3)
  })

  it('반례: 빈 문서도 유효한 출력', () => {
    const empty = liftAll(constructedDoc().doc)
    expect(empty.lifted.size).toBe(0)
    expect(toOBJ(empty)).toContain('g strokes')
    const g = JSON.parse(toGLTF(empty))
    expect(g.buffers[0].byteLength).toBe(0)
  })
})
