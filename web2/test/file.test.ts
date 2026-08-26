import { describe, it, expect } from 'vitest'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { parseBrnlLegacy } from './legacy_web2_10'
import { toOBJ, toGLTF } from '../src/core/export'
import { liftAll } from '../src/core/lift'
import { builder, constructedDoc } from './fixtures'
import { v3, QID } from '../src/core/vec'
import { C } from '../src/core/constants'

function sampleData() {
  const b = constructedDoc()
  b.add(500, 500, 500, 300)
  b.add(500, 300, 700, 350, { p: v3(1, 2, 3), q: QID })
  return { doc: b.doc, nextId: 99, savedViews: [{ pose: { p: v3(0, 0, 5), q: QID }, view: { s: 2, ox: 10, oy: -5 } }] }
}

/** 점별 입력이 실린 표본(web2-11 1-c) — raw 4점과 나란한 배열들 */
function penData() {
  const d = sampleData()
  const s = d.doc.strokes[d.doc.strokes.length - 1]!
  s.raw = [{ x: 500, y: 300 }, { x: 560, y: 315 }, { x: 640, y: 333 }, { x: 700, y: 350 }]
  s.rawIn = {
    press: [0, 3200, 5100, 4096],
    tiltX: [40, 41, 42, 44],
    tiltY: [-12, -12, -11, -10],
    twist: [0, 3, 5, 8],
  }
  return d
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

  // ── web2-11 1-c·1-e: 점별 입력의 하위호환 ──────────────────────────────
  it('rawIn 왕복이 무손실이다', () => {
    const d = penData()
    const back = parseBrnl(serializeBrnl(d))!
    expect(back).not.toBeNull()
    expect(back.doc.strokes).toEqual(d.doc.strokes)
  })

  it('1-e 반증(D-3): 새 필드를 손으로 지운 파일이 정상으로 열린다', () => {
    const raw = JSON.parse(serializeBrnl(penData()))
    for (const s of raw.strokes) delete s.rawIn
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back).not.toBeNull()
    expect(back.doc.strokes.every(s => s.rawIn === undefined)).toBe(true)
    // 나머지는 지금과 똑같이 — 획 수·좌표 불변
    expect(back.doc.strokes.map(s => ({ id: s.id, a: s.a, b: s.b })))
      .toEqual(penData().doc.strokes.map(s => ({ id: s.id, a: s.a, b: s.b })))
  })

  it('web2-10 형식(rawIn 없음)이 그대로 열린다 — 옛 파일 팔', () => {
    // 옛 앱이 쓰던 형식 = 이 회차 직전의 serializeBrnl 출력(스냅샷 파서와 같은 b6980c9 형식).
    // rawIn·coalesced 이전에 저장된 파일에는 새 열쇠가 아예 없다.
    const old = JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
      strokes: [
        { id: 1, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } },
        { id: 2, a: { x: 500, y: 500 }, b: { x: 620, y: 470 }, raw: [{ x: 500, y: 500 }, { x: 560, y: 485 }, { x: 620, y: 470 }], mat: { grade: 'HB', press: 0.42 } },
      ],
      faces: [], unit: 'mm', nextId: 3, savedViews: [],
    })
    const back = parseBrnl(old)!
    expect(back).not.toBeNull()
    expect(back.doc.strokes).toHaveLength(2)
    expect(back.doc.strokes[1]!.mat).toEqual({ grade: 'HB', press: 0.42 })
    expect(back.doc.strokes[1]!.rawIn).toBeUndefined()
  })

  it('새 파일이 옛 앱(b6980c9 파서 스냅샷)에서 열린다 — rawIn만 버려진다', () => {
    const d = penData()
    const back = parseBrnlLegacy(serializeBrnl(d))!
    expect(back).not.toBeNull()
    expect(back.doc.strokes).toHaveLength(d.doc.strokes.length)
    // 옛 파서는 아는 열쇠만 옮기므로 rawIn은 조용히 사라지고 나머지는 그대로다
    const last = back.doc.strokes.length - 1
    expect((back.doc.strokes[last] as any).rawIn).toBeUndefined()
    expect(back.doc.strokes[last]!.raw).toEqual(d.doc.strokes[last]!.raw)
  })

  it('반례: rawIn 모양이 틀리면 거부한다(길이 불일치·대역 밖·raw 없음)', () => {
    const base = () => JSON.parse(serializeBrnl(penData()))
    const at = (r: any) => r.strokes[r.strokes.length - 1]
    // 길이 불일치
    let r = base(); at(r).rawIn.press = [1, 2]
    expect(parseBrnl(JSON.stringify(r))).toBeNull()
    // 대역 밖 필압
    r = base(); at(r).rawIn.press = [0, 1, 2, C.PRESS_Q + 1]
    expect(parseBrnl(JSON.stringify(r))).toBeNull()
    // 대역 밖 기울기
    r = base(); at(r).rawIn.tiltX = [0, 0, 0, 91]
    expect(parseBrnl(JSON.stringify(r))).toBeNull()
    // raw 없이 rawIn만
    r = base(); delete at(r).raw
    expect(parseBrnl(JSON.stringify(r))).toBeNull()
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
    // ⚠ 작도만 있는 문서는 이제 «빈» 문서가 아니다 — 깊이선도 3D 선이다(지시 1).
    // 여기서 재는 것은 «승격 기하가 0일 때의 출력»이므로 지평선만 있는 문서를 쓴다.
    const empty = liftAll(builder().doc)
    expect(empty.lifted.size).toBe(0)
    expect(toOBJ(empty)).toContain('g strokes')
    const g = JSON.parse(toGLTF(empty))
    expect(g.buffers[0].byteLength).toBe(0)
  })
})
