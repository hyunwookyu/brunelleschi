// web2-52 — 재료(프리셋을 둘로 가른다)의 **순수 몫**:
//   ① 재료 집합 여덟(무늬 여섯 + 단색 둘) — 목록·판별·순환(아홉 걸음 한 바퀴)
//   ② 여섯 무늬 재료가 팔레트 톤 사다리를 실제로 가진다(materialOf가 여덟 전부에 선다)
//   ③ 시드 — 같은 면·같은 시드는 같은 무늬, 시드가 갈리면 다르다(52 게이트 「같은 재료를
//      두 면에 쓰면 무늬가 다르다」의 순수판 — 배선은 seed = face.id, render3d)
//   ④ 파일 왕복 — 재료는 문서에 산다: glass rep가 왕복을 살고, 모르는 재료는 조용히
//      강등된다(파서 규약). **무늬 텍스처는 파일에 안 들어간다**(43 전수 목록 — 구성).
// 픽셀 몫은 e2e(rep49 이식판 + mats52.spec)가 잰다.

import { describe, it, expect } from 'vitest'
import {
  REP_IDS, MATREP_IDS, isMatRepId, cycleRep, REP_NAMES, repSegments, type MatRepId,
} from '../src/core/matrep'
import { MATERIALS, materialOf, type MatId } from '../src/core/palette'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { session } from './session'
import { setDimension, toggleFaceAt } from '../src/app/state'
import type { ResolvedFace } from '../src/core/face'
import type { V3 } from '../src/core/vec'

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })
const face = (id: number, outer: V3[], normal: V3): ResolvedFace =>
  ({ id, outer, holes: [], normal, flat: 0, tris: [] })
const WALL = face(1, [v3(0, 0, 0), v3(30, 0, 0), v3(30, 25, 0), v3(0, 25, 0)], v3(0, 0, 1))

/** 선분 좌표 서명(rep49_measure의 그 자 #54 — 1e-6 반올림 문자열 합) */
const sigOf = (rf: ResolvedFace, m: 'stone' | 'wood', seed: number): string => {
  const s = repSegments(rf, m, 100, seed)
  const r = (v: number) => Math.round(v * 1e6) / 1e6
  return [...s.major, ...s.minor]
    .map(g => `${r(g.a.x)},${r(g.a.y)},${r(g.a.z)}|${r(g.b.x)},${r(g.b.y)},${r(g.b.z)}`)
    .join(';')
}

describe('52-2 재료 집합 — 여덟', () => {
  it('① 무늬 여섯 + 단색 둘 = 여덟 · 판별 · 이름 전수', () => {
    expect(REP_IDS.length).toBe(6)
    expect(MATREP_IDS.length).toBe(8)
    expect(MATREP_IDS.slice(6)).toEqual(['glass', 'metal'])
    for (const id of MATREP_IDS) expect(typeof REP_NAMES[id]).toBe('string')
    expect(isMatRepId('glass')).toBe(true)
    expect(isMatRepId('metal')).toBe(true)
    // 반증(D-3) — 판별이 실제로 거짓을 낼 수 있다
    expect(isMatRepId('gold')).toBe(false)
    expect(isMatRepId('photo')).toBe(false)
    expect(isMatRepId(undefined)).toBe(false)
  })

  it('② 순환이 아홉 걸음 한 바퀴(없음 → 여덟 → 없음) · 여덟 전부 팔레트 톤을 가진다', () => {
    let cur: MatRepId | undefined = undefined
    const seen: (MatRepId | undefined)[] = []
    for (let i = 0; i < 9; i++) { cur = cycleRep(cur); seen.push(cur) }
    expect(seen).toEqual([...MATREP_IDS, undefined])
    // 톤 사다리 — 여덟 재료 전부 MATERIALS에 산다(무늬 굽기의 바탕 톤·줄눈 톤의 출처)
    for (const id of MATREP_IDS) {
      const m = materialOf(id as MatId)
      expect(m, `${id}의 팔레트 항목`).toBeDefined()
      expect(m.tones.length).toBeGreaterThanOrEqual(2)
    }
    expect(MATERIALS.length).toBe(8)
  })
})

describe('52-1 시드 — 무늬의 불규칙은 결정론이다(rng32 · Math.random ⛔)', () => {
  it('③ 같은 (면·재료·시드) 재생성은 같고 · 시드가 갈리면 다르다 — 석재·목재', () => {
    for (const m of ['stone', 'wood'] as const) {
      const a1 = sigOf(WALL, m, 7)
      const a2 = sigOf(WALL, m, 7)
      const b = sigOf(WALL, m, 8)
      expect(a1.length, `${m} 무늬가 실제로 생성됐다`).toBeGreaterThan(0)
      expect(a1, `${m} — 같은 시드 재생성 동일`).toBe(a2)
      expect(a1, `${m} — 시드가 갈리면 무늬가 다르다(두 면 = 두 시드의 순수판)`).not.toBe(b)
    }
  })
})

describe('52-4 파일 왕복 — 재료는 문서에 · 텍스처는 파생', () => {
  // 세션 픽스처(rep49.test의 roomWithScale 그대로) — serializeBrnl은 온전한 doc을 받는다
  function roomWithScale() {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(600, 475, 500, 460)
    s.draw(400, 475, 500, 460)
    const post = s.draw(500, 500, 500, 380)!
    s.draw(600, 475, 600, 385)
    s.draw(600, 385, 500, 380)
    expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
    expect(setDimension(s.app, post.id, 2500)).toBe('scale')
    return s
  }
  it('④ glass rep가 왕복을 산다 — 재료 여덟 전부', () => {
    for (const m of MATREP_IDS) {
      const s = roomWithScale()
      s.app.doc.faces[0]!.rep = { m, s: 1 }
      const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: { s: 1, ox: 0, oy: 0 } })
      const back = parseBrnl(text)
      expect(back?.doc.faces[0]?.rep, `${m} 왕복`).toEqual({ m, s: 1 })
      // 무늬 텍스처가 파일에 없다 — 구성 확인(파생 원칙 b): 텍셀·이미지 열쇠 자체가 없다
      expect(text.includes('texel') || text.includes('image') || text.includes('data:'), '텍스처는 파일 밖').toBe(false)
    }
  })
  it('④-반증 — 모르는 재료는 조용히 강등된다(파서 규약이 실제로 일한다)', () => {
    const s = roomWithScale()
    ;(s.app.doc.faces[0] as { rep?: unknown }).rep = { m: 'gold', s: 1 }
    const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: { s: 1, ox: 0, oy: 0 } })
    const back = parseBrnl(text)
    expect(back?.doc.faces[0]?.rep, '모르는 재료 — rep 없음으로').toBeUndefined()
  })
})
