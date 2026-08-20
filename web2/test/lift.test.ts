import { describe, it, expect } from 'vitest'
import { liftAll, closestOnLineToRay, axisOfStroke } from '../src/core/lift'
import { analyze, project, DRAW_POSE } from '../src/core/camera'
import { constructedDoc, approxPt } from './fixtures'
import { v3, norm3 } from '../src/core/vec'

describe('리프팅 — 확정 후 경로에 판정이 없다(원칙 c)', () => {
  it('화면 평행 첫 획이 게이지 평면에서 연쇄를 시작한다', () => {
    const b = constructedDoc()
    const s = b.add(500, 500, 500, 300) // 수직 — 화면 평행
    const r = liftAll(b.doc)
    expect(r.anchorId).toBe(s.id)
    expect(r.lifted.size).toBe(1)
    const seg = r.lifted.get(s.id)!
    expect(seg.axis).toBe('V')
    // 게이지: z = −f, 그 평면에서 화면 1px = 세계 1단위
    expect(seg.a3.z).toBeCloseTo(-r.an.f!, 6)
    expect(seg.a3.x).toBeCloseTo(-100, 6)
    expect(seg.a3.y).toBeCloseTo(-100, 6)
  })

  it('승격된 획의 재사영 = 확정 2D 좌표 (오차 fp 수준)', () => {
    const b = constructedDoc()
    const s1 = b.add(500, 500, 500, 300)
    const s2 = b.add(500, 300, 700, 350) // vp0(900,400) 방향 — 직선 위 정확
    const r = liftAll(b.doc)
    expect(r.lifted.size).toBe(2)
    for (const [id, seg] of r.lifted) {
      const st = b.doc.strokes.find(x => x.id === id)!
      const pa = project(r.an, DRAW_POSE, seg.a3)!
      const pb = project(r.an, DRAW_POSE, seg.b3)!
      expect(approxPt(pa, st.a, 1e-6), `stroke ${id} a`).toBe(true)
      expect(approxPt(pb, st.b, 1e-6), `stroke ${id} b`).toBe(true)
    }
    expect(r.lifted.get(s2.id)!.axis).toBe('vp0')
    void s1
  })

  it('시작점이 3D에 없는 획은 대기한다 — 사라지지 않는다(불변식 j의 자료 층)', () => {
    const b = constructedDoc()
    const s = b.add(300, 200, 420, 180) // 아무 데도 안 붙는 자유 방향, 시작점 미확정
    const r = liftAll(b.doc)
    expect(r.lifted.size).toBe(0)
    expect(r.waiting).toContain(s.id)
    expect(b.doc.strokes.some(x => x.id === s.id)).toBe(true)
  })

  it('승격은 연쇄한다 — 먼저 그린 대기 획이 나중 앵커로 올라간다', () => {
    const b = constructedDoc()
    const sA = b.add(500, 500, 700, 450) // vp0 방향((900,400)에서 (500,500) 지나는 직선 위), 시작 미확정 → 대기
    const sB = b.add(500, 500, 500, 300) // 수직 앵커 — sA의 시작점과 같은 자리
    const r = liftAll(b.doc)
    expect(r.anchorId).toBe(sB.id)
    expect(r.lifted.has(sA.id)).toBe(true) // 두 번째 패스에서 연쇄 승격
    expect(r.lifted.has(sB.id)).toBe(true)
  })

  it('자유 방향은 양끝이 3D에 붙어야 확정 — 한쪽만 있으면 대기', () => {
    const b = constructedDoc()
    b.add(500, 500, 500, 300)            // 앵커
    const sf = b.add(500, 300, 640, 210) // 자유 방향, 시작만 확정
    const r = liftAll(b.doc)
    expect(r.lifted.has(sf.id)).toBe(false)
    expect(r.waiting).toContain(sf.id)
  })

  it('자유 방향 양끝이 붙으면 확정된다', () => {
    const b = constructedDoc()
    b.add(500, 500, 500, 300)            // 앵커 (수직)
    const s2 = b.add(500, 300, 700, 350) // vp0 축
    const r0 = liftAll(b.doc)
    const end2d = project(r0.an, DRAW_POSE, r0.lifted.get(s2.id)!.b3)!
    const sf = b.add(500, 500, end2d.x, end2d.y) // 두 확정점을 잇는 대각선
    const r = liftAll(b.doc)
    const seg = r.lifted.get(sf.id)
    expect(seg).toBeDefined()
    expect(seg!.axis).toBeNull()
  })
})

describe('불변식 k — 차수 승격(f 변경) 전후로 화면 위치 불변', () => {
  function oneVpDocWithContent() {
    const b = constructedDoc()
    // 작도를 1점 상태로 다시: 지평선+깊이선1만 남기고 내용 획
    b.doc.strokes.splice(2, 1) // 깊이선 2 제거 → 1점(f 기본값)
    b.add(500, 500, 500, 300)  // 앵커
    b.add(500, 300, 700, 350)  // vp0 축
    return b
  }

  it('두 번째 깊이선이 f를 바꿔도 승격 획의 재사영이 그대로다', () => {
    const b = oneVpDocWithContent()
    const r1 = liftAll(b.doc)
    expect(r1.an.fSource).toBe('default')
    const before = new Map<number, { a: any; b: any }>()
    for (const [id, seg] of r1.lifted) {
      before.set(id, {
        a: project(r1.an, DRAW_POSE, seg.a3)!,
        b: project(r1.an, DRAW_POSE, seg.b3)!,
      })
    }
    expect(before.size).toBe(2)

    b.add(700, 700, 400, 550) // 깊이선 2 → f가 387.3으로
    const r2 = liftAll(b.doc)
    expect(r2.an.fSource).toBe('two-vp')
    for (const [id, prev] of before) {
      const seg = r2.lifted.get(id)!
      const pa = project(r2.an, DRAW_POSE, seg.a3)!
      const pb = project(r2.an, DRAW_POSE, seg.b3)!
      expect(approxPt(pa, prev.a, 1e-6)).toBe(true)
      expect(approxPt(pb, prev.b, 1e-6)).toBe(true)
    }
  })

  it('버그를 되살리면 잡는다: 옛 3D를 부분 유지하면 화면이 튄다', () => {
    const b = oneVpDocWithContent()
    const r1 = liftAll(b.doc)
    const oldSegs = [...r1.lifted.values()]
    b.add(700, 700, 400, 550)
    const r2 = liftAll(b.doc)
    void r2
    // 옛 3D 좌표(부분 유지)를 새 카메라로 사영하면 확정 2D(500,500)와 어긋난다
    // — 전부 다시 푸는 이유이고, 위 불변식 검사에 이가 있다는 증거
    const anchorOld = oldSegs[0]!
    const paOld = project(r2.an, DRAW_POSE, anchorOld.a3)!
    const err = Math.hypot(paOld.x - 500, paOld.y - 500)
    expect(err).toBeGreaterThan(1)
  })
})

describe('광선-직선 최근접점', () => {
  it('평행이면 null', () => {
    const r = closestOnLineToRay(v3(0, 0, -10), v3(0, 0, -1), { o: v3(0, 0, 0), d: v3(0, 0, -1) })
    expect(r).toBeNull()
  })

  it('교차하면 정확히 교점', () => {
    const p = closestOnLineToRay(
      v3(1, 0, -5), v3(0, 1, 0),
      { o: v3(0, 0, 0), d: norm3(v3(1, 2, -5)) },
    )!
    expect(p.x).toBeCloseTo(1, 9)
    expect(p.y).toBeCloseTo(2, 9)
    expect(p.z).toBeCloseTo(-5, 9)
  })
})

describe('축 배정 — 스냅과 같은 기준으로 재계산', () => {
  it('확정 좌표가 축 위에 있으면 그 축', () => {
    const an = analyze(constructedDoc().doc)
    expect(axisOfStroke(an, DRAW_POSE, { x: 500, y: 300 }, { x: 700, y: 350 })).toBe('vp0')
    expect(axisOfStroke(an, DRAW_POSE, { x: 500, y: 500 }, { x: 500, y: 300 })).toBe('V')
    expect(axisOfStroke(an, DRAW_POSE, { x: 200, y: 600 }, { x: 700, y: 600 })).toBe('H')
  })

  it('반례: 어디에도 안 붙으면 자유', () => {
    const an = analyze(constructedDoc().doc)
    expect(axisOfStroke(an, DRAW_POSE, { x: 500, y: 500 }, { x: 700, y: 350 })).toBeNull()
  })
})
