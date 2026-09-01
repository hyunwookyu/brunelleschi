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
import { commitPaint, cycleFaceMat, cycleFaceFill, undo, redo, toggleFaceAt } from '../src/app/state'
import { paintSideAt, paintVisible, facePlane } from '../src/core/paint'
import { add3, mul3, dot3 } from '../src/core/vec'
import {
  MATERIALS, MAT_IDS, isMatId, materialOf, clampTone, toneHex, isHex6, solidHexOf,
  hatchSpecOf, hatchHexOf, paintHexOf, cycleMat, HATCH_DEFAULT_HEX, SOLID_DEFAULT_HEX, type MatId,
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

  it('③ 순환·강등의 순수 규칙 (⛔ 「톤 자동」은 web2-48 48-8이 없앨다)', () => {
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
// ⚠⚠ **web2-48이 이 절의 뜻을 바꿨다.** 46은 (재료, 톤) 쌍을 칠에 실었고 「톤 자동」이
// 분류의 제안을 따랐는데, 48-7이 그 좁힘을 정정했고(색상 휠 — 임의의 색) 48-8이 제안을
// 없앴다. 그래서 재는 것도 바뀐다: **「제안이 제안에 그치는가」가 아니라 「고른 색이
// 그대로 나가는가」**다. 46의 팔을 지우지 않고 **그 자리에서 다시 겨눈다**(#65 — 정보를
// 지우지 않는다: 이 절의 픽스처·구조가 그대로 서 있고 판정만 새 규약을 본다).
describe('46-2 → 48 칠 — 도구·색·굵기·면의 쪽', () => {
  it('① 붓(기본)은 45 그대로 — 색·도구가 안 실린다(무회귀)', () => {
    const { s } = roomSession()
    expect(s.app.paintSel.i).toBe('brush')          // 기본값 자체가 45다
    commitPaint(s.app, wallPts())
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.c).toBeUndefined()
    expect(p.paint!.i).toBeUndefined()
    expect(paintHexOf(p)).toBeNull()
  })

  it('② 마커 — 고른 색이 그대로 실린다(48-7: 재료 프리셋 밖의 임의 색도)', () => {
    const { s, floorId, wallId } = roomSession()
    // 재료 표에 **없는** 색을 고른다 — 46이던 (재료, 톤) 쌍으로는 담을 수 없던 값이다.
    s.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 10 }
    commitPaint(s.app, floorPts())
    commitPaint(s.app, wallPts())
    const ps = s.app.doc.strokes.filter(x => x.paint !== undefined)
    const onFloor = ps.find(x => x.paint!.f === floorId)!
    const onWall = ps.find(x => x.paint!.f === wallId)!
    // 분류(슬라브 ↔ 벽)가 달라도 색이 **안 갈린다** — 자동 제안이 없어졌다(48-8)
    expect(onFloor.paint!.c).toBe('#1e7fd0')
    expect(onWall.paint!.c).toBe('#1e7fd0')
    expect(onFloor.paint!.i).toBe(1)
    expect(paintHexOf(onFloor)).toBe('#1e7fd0')
  })

  it('③ 굵기(48-2) — 크기 트레이의 값이 획에 실리고, 붓에도 실린다', () => {
    const { s } = roomSession()
    s.app.paintSel = { hex: '#8a6238', i: 'cp', w: C.PAINT_W_PX[0]! }
    commitPaint(s.app, wallPts())
    const p1 = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p1.paint!.w).toBe(C.PAINT_W_PX[0])
    expect(p1.paint!.i).toBe(2)
    // 붓(흑연)도 같은 트레이를 쓴다 — 세 도구 전부 두께가 없다는 것이 48-2의 증상이었다
    s.app.paintSel = { hex: '#8a6238', i: 'brush', w: C.PAINT_W_PX[4]! }
    commitPaint(s.app, floorPts())
    const p2 = s.app.doc.strokes.filter(x => x.paint !== undefined).at(-1)!
    expect(p2.paint!.w).toBe(C.PAINT_W_PX[4])
    expect(p2.paint!.c).toBeUndefined()             // 붓은 색이 안 나간다(흑연)
  })

  it('④ 면의 쪽(48-5) — 칠할 때 카메라가 있던 쪽의 부호가 실린다', () => {
    const { s, wallId } = roomSession()
    s.app.paintSel = { hex: '#c07a5b', i: 'marker', w: 10 }
    commitPaint(s.app, wallPts())
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.f).toBe(wallId)
    expect(p.paint!.s === 1 || p.paint!.s === -1).toBe(true)
    // 같은 부호를 순수 함수가 다시 낸다(#54 — 상태와 규칙이 같은 자를 쓴다)
    const rf = s.app.faces.find(f => f.id === wallId)!
    expect(paintSideAt(rf, s.app.pose)).toBe(p.paint!.s)
    // 그 쪽에서는 보이고, 평면 건너편에서는 안 보인다
    expect(paintVisible(s.app.faces, p, s.app.pose)).toBe(true)
    const pl = facePlane(rf)
    // 눈을 평면 반대쪽으로 옮긴 가짜 포즈 — 거리는 부호가 뒤집힐 만큼만
    const dist = dot3(pl.n, s.app.pose.p) - pl.d
    const other = { ...s.app.pose, p: add3(s.app.pose.p, mul3(pl.n, -2 * dist)) }
    expect(paintVisible(s.app.faces, p, other)).toBe(false)
    // ⚠ 반증(D-3): 부호가 없는 «옛 획»은 어느 쪽에서도 보인다(45·46 그대로)
    const legacy = { paint: { f: wallId } }
    expect(paintVisible(s.app.faces, legacy, other)).toBe(true)
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

describe('48-3 단색 채움 — 순환·색·실행취소', () => {
  it('① 없음 → 해칭(1) → 단색(2) → 없음 · 실행취소가 그 사슬을 되짚는다', () => {
    const { s, wallId } = roomSession()
    const face = () => s.app.doc.faces.find(f => f.id === wallId)!
    expect(face().fill).toBeUndefined()
    expect(cycleFaceFill(s.app, wallId)).toBe(1)
    expect(cycleFaceFill(s.app, wallId)).toBe(2)
    expect(cycleFaceFill(s.app, wallId)).toBeUndefined()
    // 되짚기 — `to: boolean` 한 칸으로는 못 하던 일이다(해칭↔단색을 가른다)
    undo(s.app); expect(face().fill).toBe(2)
    undo(s.app); expect(face().fill).toBe(1)
    undo(s.app); expect(face().fill).toBeUndefined()
    redo(s.app); expect(face().fill).toBe(1)
    redo(s.app); expect(face().fill).toBe(2)
  })

  it('② 단색의 색 — 재료가 있으면 그 중간 톤, 없으면 무채색 기본', () => {
    expect(solidHexOf({})).toBe(SOLID_DEFAULT_HEX)
    expect(solidHexOf({ mat: 'brick' })).toBe(materialOf('brick').tones[1])
    // 두 톤 재료(유리)는 중간이 곧 마지막이다 — 대역 밖을 안 짚는다
    expect(solidHexOf({ mat: 'glass' })).toBe(materialOf('glass').tones[1])
    // 모르는 재료는 기본으로 물러난다(해칭의 그 규약 그대로)
    expect(solidHexOf({ mat: 'gold' })).toBe(SOLID_DEFAULT_HEX)
    // ⚠ 반증(D-3): 단색은 해칭 «선» 색과 다른 톤을 쓴다(면은 몸통 · 선은 그림자)
    expect(solidHexOf({ mat: 'brick' })).not.toBe(hatchHexOf({ mat: 'brick' }))
  })
})

describe('46-4 → 48 저장 왕복 — paint.s/c/i/w · Face.fill · Face.mat', () => {
  it('① 성한 값은 왕복하고, 모양이 틀리면 그 몫만 강등된다(문서 거부 ⛔)', () => {
    const { s, wallId } = roomSession()
    s.app.paintSel = { hex: '#666d75', i: 'marker', w: 20 }
    commitPaint(s.app, wallPts())
    cycleFaceMat(s.app, wallId)                       // 벽 = 벽돌
    cycleFaceFill(s.app, wallId); cycleFaceFill(s.app, wallId)   // 벽 = 단색(2)
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    const back = parseBrnl(txt)!
    expect(back).not.toBeNull()
    const p = back.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint).toEqual(expect.objectContaining({ c: '#666d75', i: 1, w: 20 }))
    expect(p.paint!.s === 1 || p.paint!.s === -1).toBe(true)
    expect(back.doc.faces.find(f => f.id === wallId)!.mat).toBe('brick')
    expect(back.doc.faces.find(f => f.id === wallId)!.fill).toBe(2)
    // 두 번째 저장이 바이트로 같다(43-1의 규약이 새 필드에도 선다)
    const txt2 = serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: back.drawView })
    expect(txt2).toBe(txt)
    // 강등 — 색이 hex가 아니다(도구까지 함께 버린다: 어떤 촉인지 모르는 색은 안 받는다)
    const j = JSON.parse(txt)
    const jp = j.strokes.find((x: any) => x.paint !== undefined)
    jp.paint.c = 'rebeccapurple'
    const b2 = parseBrnl(JSON.stringify(j))!
    const p2 = b2.doc.strokes.find(x => x.paint !== undefined)!
    expect(p2.paint!.f).toBe(wallId)                  // 칠 자체는 산다(흑연 강등)
    expect(p2.paint!.c).toBeUndefined()
    expect(p2.paint!.i).toBeUndefined()
    // 면의 쪽 — 대역 밖이면 그 필드만 버린다(양쪽에서 보임 = 45·46 거동)
    jp.paint.c = '#666d75'; jp.paint.s = 0
    expect(parseBrnl(JSON.stringify(j))!.doc.strokes.find(x => x.paint !== undefined)!.paint!.s).toBeUndefined()
    // 굵기 — 0·음수·대역 밖은 그 필드만 버린다(three/p5가 조용히 안 그리는 값)
    jp.paint.s = 1
    for (const bad of [0, -3, 1e9]) {
      jp.paint.w = bad
      expect(parseBrnl(JSON.stringify(j))!.doc.strokes.find(x => x.paint !== undefined)!.paint!.w).toBeUndefined()
    }
    jp.paint.w = 20
    // 면 채움 — 모르는 값이면 그 필드만
    j.faces.find((f: any) => f.id === wallId).fill = 9
    j.faces.find((f: any) => f.id === wallId).mat = 7
    const b3 = parseBrnl(JSON.stringify(j))!
    expect(b3.doc.faces.find(f => f.id === wallId)!.mat).toBeUndefined()   // 그 필드만
    expect(b3.doc.faces.find(f => f.id === wallId)!.fill).toBeUndefined()
    expect(b3.doc.strokes.find(x => x.paint !== undefined)!.paint!.c).toBe('#666d75')
  })

  it('② 옛 파일(45 이전 모양)이 그대로 열린다 — paint.f만', () => {
    const { s } = roomSession()
    s.app.paintSel = { hex: '#a8a29a', i: 'brush', w: 10 }
    commitPaint(s.app, wallPts())                     // 붓 — 색 없음
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    expect(txt).not.toContain('"c"')                  // 안 쓰는 열쇠는 파일에 없다(왕복 동일성)
    const back = parseBrnl(txt)!
    expect(back.doc.strokes.find(x => x.paint !== undefined)!.paint!.f)
      .toBe(s.app.doc.strokes.find(x => x.paint !== undefined)!.paint!.f)
  })

  it('③ **web2-46 파일의 (재료, 톤)이 색으로 옮겨 열린다**(48-7 — 무손실)', () => {
    const { s, wallId } = roomSession()
    commitPaint(s.app, wallPts())
    const txt = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView })
    const j = JSON.parse(txt)
    const jp = j.strokes.find((x: any) => x.paint !== undefined)
    // 46이 쓰던 그 모양 그대로 밀어 넣는다(그때의 파일에는 c도 s도 w도 없다)
    jp.paint = { f: wallId, m: 'brick', t: 1, i: 1 }
    const back = parseBrnl(JSON.stringify(j))!
    const p = back.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.c).toBe(toneHex('brick', 1))      // 그 쌍이 가리키던 값 그대로
    expect(isHex6(p.paint!.c)).toBe(true)
    expect(p.paint!.i).toBe(1)
    expect(p.paint!.s).toBeUndefined()                // 옛 파일 = 양쪽에서 보인다
    expect(paintHexOf(p)).toBe(materialOf('brick').tones[1])
    // ⚠ 반증(D-3): 재료가 모르는 값이면 옮기지 않는다(흑연 강등 — 조용히 틀린 색 ⛔)
    jp.paint = { f: wallId, m: 'gold', t: 1, i: 1 }
    expect(parseBrnl(JSON.stringify(j))!.doc.strokes.find(x => x.paint !== undefined)!.paint!.c)
      .toBeUndefined()
  })
})
