import { describe, it, expect } from 'vitest'
import { serializeBrnl, parseBrnl, type BrnlData } from '../src/core/file'
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
  // 종이 하나(web2-19 2부) — 옛 savedViews 표본의 자리를 잇는다
  b.doc.sheets.push({ id: 98, name: '종이 2', pose: { p: v3(0, 0, 5), q: QID }, view: { s: 2, ox: 10, oy: -5 } })
  return { doc: b.doc, nextId: 99 }
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
    expect(back.doc.sheets).toEqual(d.doc.sheets)
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

  it('web2-10 형식(version 1)이 변환을 지나 열린다 — 지평선 획이 버려진다(web2-17 2-b)', () => {
    // 옛 형식의 첫 획은 지평선이다. 이제 지평선은 상시(H/2)라 그 획은 버려지고
    // 나머지가 통째로 평행이동된다. 이 표본은 지평선이 이미 400(=H/2)이라 dy=0이다 —
    // 이동 자체의 값 검증은 legacy_web2_16.json 오라클 팔(migrate.test.ts)이 한다.
    const old = JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
      strokes: [
        { id: 1, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } },
        { id: 2, a: { x: 500, y: 500 }, b: { x: 620, y: 470 }, raw: [{ x: 500, y: 500 }, { x: 560, y: 485 }, { x: 620, y: 470 }], mat: { grade: 'HB', press: 0.42 } },
      ],
      faces: [], unit: 'mm', nextId: 3,
    })
    const back = parseBrnl(old)!
    expect(back).not.toBeNull()
    expect(back.doc.strokes).toHaveLength(1)                     // 지평선 획이 버려졌다
    expect(back.doc.strokes[0]!.id).toBe(2)
    expect(back.doc.strokes[0]!.a).toEqual({ x: 500, y: 500 })   // dy=0 — 좌표 불변
    expect(back.doc.strokes[0]!.mat).toEqual({ grade: 'HB', press: 0.42 })
    expect(back.doc.strokes[0]!.rawIn).toBeUndefined()
  })

  it('새 파일(version 2)은 옛 앱(b6980c9 파서 스냅샷)이 **거부한다** — web2-17 2-a의 의도다', () => {
    // 종전 보장(「새 파일이 옛 앱에서 열린다」)을 이 회차가 **의도적으로** 버렸다:
    // 옛 앱은 첫 획을 지평선으로 읽으므로 v2 문서를 열면 조용히 다른 그림이 된다.
    // 거부하고 빈 화면으로 시작하는 쪽이 낫다(지시 2-a — #54 계열의 판단).
    const d = penData()
    expect(parseBrnlLegacy(serializeBrnl(d))).toBeNull()
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

// ── 종이 썸네일(web2-12 5번 → web2-19 2부: 종이로 이사) — 선택 필드·하위호환·강등 규약 ──
describe('sheets[].thumb (web2-12 5번 → web2-19)', () => {
  const withThumb = () => {
    const d = sampleData()
    d.doc.sheets[1]!.thumb = 'data:image/jpeg;base64,QUJD'
    return d
  }

  it('왕복 — thumb가 살아서 돌아온다(선택 필드)', () => {
    const back = parseBrnl(serializeBrnl(withThumb()))!
    expect(back.doc.sheets[1]!.thumb).toBe('data:image/jpeg;base64,QUJD')
  })

  it('thumb 없는 종이가 그대로 열린다 — 하위호환 팔', () => {
    const back = parseBrnl(serializeBrnl(sampleData()))!
    expect(back.doc.sheets).toHaveLength(2)
    expect(back.doc.sheets[1]!.thumb).toBeUndefined()
  })

  it('새 파일(version 4)은 옛 앱(b6980c9 파서 스냅샷)이 거부한다 — thumb 이전에 version에서 끊긴다', () => {
    expect(parseBrnlLegacy(serializeBrnl(withThumb()))).toBeNull()
  })

  it('반례: 모양이 틀린 thumb는 **그 필드만 강등**된다 — 종이(포즈)는 산다', () => {
    for (const bad of [123, 'http://evil/img.png', 'data:image/png;base64,' + 'A'.repeat(300001)]) {
      const r = JSON.parse(serializeBrnl(withThumb()))
      r.sheets[1].thumb = bad
      const back = parseBrnl(JSON.stringify(r))!
      expect(back).not.toBeNull()
      expect(back.doc.sheets).toHaveLength(2)
      expect(back.doc.sheets[1]!.thumb).toBeUndefined()
    }
  })
})
