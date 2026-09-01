// web2-46 — 재료 팔레트·마커·색연필의 상태·저장 팔.
//
// 픽스처는 paint45의 방(바닥+벽 — 앱 경로)이다. 재는 것:
// ① 팔레트가 «재료 목록»으로 성한가(무늬 상호 판별·톤 단조) — 값의 성질만. 색이 쓸
//    만한가는 눈 판정(실기기 — 46 ⚑)이라 여기서 안 잰다.
// ② 분류의 톤 «제안»이 제안에 그치는가 — 사람이 고른 톤이 그대로 남는가(지시 측정 항목).
// ③ 저장 왕복 — paint.m/t/i · Face.mat. 모양이 틀리면 그 몫만 강등되는가.
// 픽셀(마커 누적·경계·순서)은 e2e 몫이다(mats46.spec — WebGL이 없는 여기서는 못 잰다).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { commitPaint, cycleFaceMat, undo, redo, toggleFaceAt } from '../src/app/state'
import {
  MATERIALS, MAT_IDS, isMatId, materialOf, clampTone, toneHex, suggestTone,
  hatchSpecOf, hatchHexOf, paintHexOf, cycleMat, HATCH_DEFAULT_HEX, type MatId,
} from '../src/core/palette'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { lumaOf } from '../src/app/brushmap'
import { C } from '../src/core/constants'
import type { Pt } from '../src/core/vec'

const W = 1200, H = 800

/** paint45와 같은 방(바닥+벽) — 픽스처를 새로 안 짓는다(두 자리에 다른 장면 ⛔). */
function roomSession() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  const wall = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
  const floor = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  return { s, floorId: floor.id, wallId: wall.id }
}

const floorPts = (): Pt[] => {
  const pts: Pt[] = []
  for (let t = 0; t <= 10; t++) pts.push({ x: 420 + t * 5, y: 472 + t * 1 })   // 바닥 전용 구역(x<500)
  return pts
}
const wallPts = (): Pt[] => {
  const pts: Pt[] = []
  for (let t = 0; t <= 10; t++) pts.push({ x: 515 + t * 7, y: 465 - t * 4 })   // 벽 안
  return pts
}

describe('46-1 팔레트 — 재료 목록의 성질', () => {
  it('① 다섯 재료 · 톤 둘셋 · hex 성함 · 무늬(각도·간격·교차) 상호 판별', () => {
    expect(MATERIALS.length).toBe(5)
    const specs = new Set<string>()
    for (const m of MATERIALS) {
      expect(m.tones.length).toBeGreaterThanOrEqual(2)
      expect(m.tones.length).toBeLessThanOrEqual(3)
      for (const t of m.tones) expect(t).toMatch(/^#[0-9a-f]{6}$/)
      specs.add(`${m.hatch.angleDeg}|${m.hatch.spacingPx}|${m.hatch.cross ? 1 : 0}`)
    }
    expect(specs.size).toBe(5)   // 어느 두 재료도 같은 무늬가 아니다
    // 반증(D-3): 판별식이 실제로 실패할 수 있다 — 무늬를 복제한 목록이면 집합이 준다
    const broken = MATERIALS.map(m => ({ ...m, hatch: MATERIALS[0]!.hatch }))
    expect(new Set(broken.map(m => `${m.hatch.angleDeg}|${m.hatch.spacingPx}|${m.hatch.cross ? 1 : 0}`)).size).toBe(1)
  })

  it('② 톤이 밝음→그림자로 실제로 어두워진다(광도 단조 — 이름이 아니라 값)', () => {
    for (const m of MATERIALS) {
      for (let i = 1; i < m.tones.length; i++) {
        expect(lumaOf(m.tones[i]!)).toBeLessThan(lumaOf(m.tones[i - 1]!))
      }
    }
  })

  it('③ 제안·순환·강등의 순수 규칙', () => {
    // 제안 — 빛의 코사인 차례(구성적 근거 — palette.ts 머리주석)
    expect(suggestTone('slab')).toBe(0)
    expect(suggestTone('slope')).toBe(1)
    expect(suggestTone('wall')).toBe(2)
    // 두 톤 재료(유리)에 «그림자»를 물으면 마지막 톤으로 잘린다
    expect(clampTone(materialOf('glass'), 2)).toBe(1)
    expect(toneHex('glass', 2)).toBe(materialOf('glass').tones[1])
    // 순환 — 없음→다섯→없음(한 바퀴가 정확히 6걸음)
    let cur: MatId | undefined = undefined
    const seen: (MatId | undefined)[] = []
    for (let i = 0; i < 6; i++) { cur = cycleMat(cur); seen.push(cur) }
    expect(seen).toEqual([...MAT_IDS, undefined])
    expect(isMatId('gold')).toBe(false)
  })

  it('④ 면의 해칭 규격 — 재료 없으면 45의 기본 그대로(무회귀)', () => {
    expect(hatchSpecOf({})).toEqual({ angleDeg: C.HATCH_ANGLE_DEG, spacingPx: C.HATCH_SPACING_PX })
    expect(hatchHexOf({})).toBe(HATCH_DEFAULT_HEX)
    const b = hatchSpecOf({ mat: 'brick' })
    expect(b).toEqual(materialOf('brick').hatch)
    expect(hatchHexOf({ mat: 'brick' })).toBe(materialOf('brick').tones[2])
    // 모양이 틀린 mat은 기본으로 강등(파서가 막지만 방어가 이중이다)
    expect(hatchSpecOf({ mat: 'gold' })).toEqual(hatchSpecOf({}))
  })
})

describe('46-2 칠 — 도구·톤 해석 (제안은 제안에 그친다)', () => {
  it('① 붓(기본)은 45 그대로 — m/t/i가 안 실린다(무회귀)', () => {
    const { s } = roomSession()
    expect(s.app.paintSel.i).toBe('brush')          // 기본값 자체가 45다
    commitPaint(s.app, wallPts())
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.m).toBeUndefined()
    expect(p.paint!.i).toBeUndefined()
    expect(paintHexOf(p)).toBeNull()
  })

  it('② 마커 + 톤 자동 — 칠하는 면의 분류가 제안한 톤으로 굳는다(슬라브 0 · 벽 2)', () => {
    const { s, floorId, wallId } = roomSession()
    s.app.paintSel = { m: 'brick', t: 'auto', i: 'marker' }
    commitPaint(s.app, floorPts())
    commitPaint(s.app, wallPts())
    const ps = s.app.doc.strokes.filter(x => x.paint !== undefined)
    const onFloor = ps.find(x => x.paint!.f === floorId)!
    const onWall = ps.find(x => x.paint!.f === wallId)!
    expect(onFloor.paint!.t).toBe(0)                 // 슬라브 → 밝음
    expect(onWall.paint!.t).toBe(2)                  // 벽 → 그림자
    expect(onFloor.paint!.m).toBe('brick')
    expect(onFloor.paint!.i).toBe(1)
    expect(paintHexOf(onFloor)).toBe(materialOf('brick').tones[0])
  })

  it('③ 사람이 고른 톤은 그대로 남는다 — 분류가 달라도 제안이 안 덮는다(지시 측정 항목)', () => {
    const { s, floorId, wallId } = roomSession()
    s.app.paintSel = { m: 'wood', t: 1, i: 'cp' }    // 사람의 선택(중간)
    commitPaint(s.app, floorPts())                   // 슬라브(제안은 0)
    commitPaint(s.app, wallPts())                    // 벽(제안은 2)
    const ps = s.app.doc.strokes.filter(x => x.paint !== undefined)
    expect(ps.find(x => x.paint!.f === floorId)!.paint!.t).toBe(1)   // 제안 0이 안 덮었다
    expect(ps.find(x => x.paint!.f === wallId)!.paint!.t).toBe(1)      // 제안 2가 안 덮었다
    expect(ps.every(x => x.paint!.i === 2)).toBe(true)
    // 선택 상태도 안 움직였다 — 칠이 선택을 되쓰지 않는다
    expect(s.app.paintSel.t).toBe(1)
  })

  it('④ 두 톤 재료(유리) + 자동 벽 — 제안 2가 마지막 톤(1)으로 잘린다', () => {
    const { s, wallId } = roomSession()
    s.app.paintSel = { m: 'glass', t: 'auto', i: 'marker' }
    commitPaint(s.app, wallPts())
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.f).toBe(wallId)
    expect(p.paint!.t).toBe(1)
  })
})

describe('46-3 면 재료 — 순환·실행취소', () => {
  it('① 없음→벽돌→…→금속→없음 · 실행취소가 «전»으로, 다시 실행이 «후»로', () => {
    const { s, wallId } = roomSession()
    const face = () => s.app.doc.faces.find(f => f.id === wallId)!
    expect(face().mat).toBeUndefined()
    const names: string[] = []
    for (let i = 0; i < 6; i++) names.push(cycleFaceMat(s.app, wallId)!.name)
    expect(names).toEqual(['벽돌', '콘크리트', '유리', '나무', '금속', '기본'])
    expect(face().mat).toBeUndefined()               // 한 바퀴 돌아 없음
    undo(s.app)                                       // «금속»으로
    expect(face().mat).toBe('metal')
    undo(s.app)
    expect(face().mat).toBe('wood')
    redo(s.app)
    expect(face().mat).toBe('metal')
    redo(s.app)
    expect(face().mat).toBeUndefined()
  })
})

describe('46-4 저장 왕복 — paint.m/t/i · Face.mat', () => {
  it('① 성한 값은 왕복하고, 모양이 틀리면 그 몫만 강등된다(문서 거부 ⛔)', () => {
    const { s, wallId } = roomSession()
    s.app.paintSel = { m: 'metal', t: 0, i: 'marker' }
    commitPaint(s.app, wallPts())
    cycleFaceMat(s.app, wallId)                       // 벽 = 벽돌
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    const back = parseBrnl(txt)!
    expect(back).not.toBeNull()
    const p = back.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint).toEqual(expect.objectContaining({ m: 'metal', t: 0, i: 1 }))
    expect(back.doc.faces.find(f => f.id === wallId)!.mat).toBe('brick')
    // 두 번째 저장이 바이트로 같다(43-1의 규약이 새 필드에도 선다)
    const txt2 = serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: back.drawView })
    expect(txt2).toBe(txt)
    // 강등 — m이 모르는 재료
    const j = JSON.parse(txt)
    const jp = j.strokes.find((x: any) => x.paint !== undefined)
    jp.paint.m = 'gold'
    const b2 = parseBrnl(JSON.stringify(j))!
    const p2 = b2.doc.strokes.find(x => x.paint !== undefined)!
    expect(p2.paint!.f).toBe(wallId)                  // 칠 자체는 산다(흑연 강등)
    expect(p2.paint!.m).toBeUndefined()
    expect(p2.paint!.t).toBeUndefined()
    expect(p2.paint!.i).toBeUndefined()
    // 강등 — 톤 대역 밖 / 도구 밖 / 면 재료
    jp.paint.m = 'metal'; jp.paint.t = 5
    expect(parseBrnl(JSON.stringify(j))!.doc.strokes.find(x => x.paint !== undefined)!.paint!.m).toBeUndefined()
    jp.paint.t = 0; jp.paint.i = 3
    expect(parseBrnl(JSON.stringify(j))!.doc.strokes.find(x => x.paint !== undefined)!.paint!.m).toBeUndefined()
    jp.paint.i = 1
    j.faces.find((f: any) => f.id === wallId).mat = 7
    const b3 = parseBrnl(JSON.stringify(j))!
    expect(b3.doc.faces.find(f => f.id === wallId)!.mat).toBeUndefined()   // 그 필드만
    expect(b3.doc.strokes.find(x => x.paint !== undefined)!.paint!.m).toBe('metal')
  })

  it('② 옛 파일(45 이전 모양)이 그대로 열린다 — paint.f만', () => {
    const { s } = roomSession()
    commitPaint(s.app, wallPts())                     // 붓 — m 없음
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    expect(txt).not.toContain('"m"')                  // 안 쓰는 열쇠는 파일에 없다(왕복 동일성)
    const back = parseBrnl(txt)!
    expect(back.doc.strokes.find(x => x.paint !== undefined)!.paint).toEqual(
      { f: back.doc.strokes.find(x => x.paint !== undefined)!.paint!.f })
  })
})
