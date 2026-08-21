import { describe, it, expect } from 'vitest'
import { liftAll, closestOnLineToRay, axisOfStroke } from '../src/core/lift'
import { analyze, project, DRAW_POSE } from '../src/core/camera'
import { constructedDoc, approxPt } from './fixtures'
import { v3, norm3 } from '../src/core/vec'

describe('리프팅 — 확정 후 경로에 판정이 없다(원칙 c)', () => {
  // ⚠ 게이지 평면(z=−f)은 폐기됐다(지시 2-e). 그것을 재던 팔이 여기 있었고,
  // 지우기만 하면 그 자리가 조용해지므로(PITFALLS #57) **지면 규칙으로 교체한다.**
  // 첫 선 규칙 전체를 재는 팔은 `test/anchor.test.ts`에 있다.
  it('첫 선이 지면(Y=0)에서 연쇄를 시작한다 — 게이지 평면을 대체했다', () => {
    const b = constructedDoc()
    const s = b.add(500, 500, 500, 300) // 모서리에서 세운 수직
    const r = liftAll(b.doc)
    // 첫 선은 **깊이선 1**이다 — 문서에서 3D가 된 획이 하나도 없을 때 그것이 첫 선이다(2-c)
    expect(r.anchorId).toBe(b.doc.strokes[1]!.id)
    expect(r.lifted.size).toBe(3) // 깊이선 둘 + 수직 — 전부 연결됐다
    const seg = r.lifted.get(s.id)!
    expect(seg.axis).toBe('V')
    // 수직선의 아래점은 지면에 붙어 있다(모서리가 지면이므로 연결로 정해진다)
    expect(seg.a3.y).toBeCloseTo(0, 9)
    expect(seg.b3.y).toBeGreaterThan(0) // 위쪽은 그 선의 길이가 정한다
    // 게이지 평면은 더 이상 안 쓴다 — z가 −f에 묶여 있지 않다
    expect(Math.abs(seg.a3.z + r.an.f!)).toBeGreaterThan(1)
  })

  it('승격된 획의 재사영 = 확정 2D 좌표 (오차 fp 수준)', () => {
    const b = constructedDoc()
    const s1 = b.add(500, 500, 500, 300)
    const s2 = b.add(500, 300, 700, 350) // vp0(900,400) 방향 — 직선 위 정확
    const r = liftAll(b.doc)
    expect(r.lifted.size).toBe(4) // 깊이선 둘도 3D 선이다(지시 1)
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
    expect(r.lifted.has(s.id)).toBe(false) // 개수가 아니라 «이 획»을 본다
    expect(r.waiting).toContain(s.id)
    expect(b.doc.strokes.some(x => x.id === s.id)).toBe(true)
  })

  it('연결은 방향이 없다 — 끝점 쪽이 확정돼 있으면 시작점을 그쪽에서 푼다', () => {
    const b = constructedDoc()
    // 끝이 먼저 확정돼 있고 시작은 허공 — X는 두 번째 패스에서 풀린다.
    // 모서리 (500,500)이 지면이므로 거기서 세운 수직 E가 먼저 올라가고,
    // 위에서 아래로 그은 X의 끝이 E의 위 끝점에 닿는다.
    const E = b.add(500, 500, 500, 300)  // 모서리에서 세운 수직
    const X = b.add(500, 200, 500, 300)  // 시작은 허공, 끝이 E의 끝점에 닿는다
    const r = liftAll(b.doc)
    expect(r.lifted.has(E.id)).toBe(true)
    expect(r.lifted.has(X.id)).toBe(true)
    const seg = r.lifted.get(X.id)!
    // 끝이 E의 시작 3D와 같고, 시작은 그 축 직선 위 광선 교점
    const e3 = r.lifted.get(E.id)!.b3
    expect(seg.b3.x).toBeCloseTo(e3.x, 6)
    expect(seg.b3.y).toBeCloseTo(e3.y, 6)
    expect(seg.b3.z).toBeCloseTo(e3.z, 6)
    const pa = project(r.an, DRAW_POSE, seg.a3)!
    expect(approxPt(pa, X.a, 1e-6)).toBe(true)
  })

  it('승격은 연쇄한다 — 먼저 그린 대기 획이 나중 앵커로 올라간다', () => {
    const b = constructedDoc()
    // sA의 시작점은 그릴 때 아직 3D가 없다(수직 sB의 위 끝). sB가 나중에 그것을 준다.
    const sA = b.add(500, 300, 700, 350) // vp0 방향, 시작 미확정 → 대기
    const sB = b.add(500, 500, 500, 300) // 모서리에서 세운 수직 — sA의 시작점을 준다
    const r = liftAll(b.doc)
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

// ⚠ **이 검사에 이가 있었다**(2026-08-21에 찾음). 아래 `before`를 `r1.lifted`에서만
// 만들기 때문에 **그때 대기 중이던 획은 아예 안 잰다** — 확정 전에 그은 획이 승격 순간
// 사라지거나 튀어도 여기서는 초록이었다. 사람이 본 증상(「지평선 다음 수직선이 깊이선
// 뒤에 사라진다」)이 그 구멍으로 빠져나갔다.
// 문서의 **모든** 획을 매 단계 재는 팔은 `test/order.test.ts`의 `watch()`에 있다
// (대기 획은 저장된 2D를 화면 위치로 본다 — 사람 눈에는 승격 여부의 구분이 없다).
// 여기서는 같은 픽스처에 대기 획을 하나 넣어 그 구멍이 닫혔는지만 확인한다.
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
    expect(before.size).toBe(3) // 1점 상태의 깊이선 1 + 내용 획 둘

    // 대기 획 — 확정 전에 그었고 아직 3D가 없다. **이것도 재야 한다.**
    const w = b.add(200, 700, 200, 600)
    const rw = liftAll(b.doc)
    expect(rw.waiting).toContain(w.id)
    const wBefore = { a: { ...w.a }, b: { ...w.b } }

    b.add(500, 500, 400, 475) // 깊이선 2 → f가 387.3으로
    const r2 = liftAll(b.doc)
    expect(r2.an.fSource).toBe('two-vp')
    // 대기 획은 f가 바뀌어도 화면에서 안 움직이고 사라지지도 않는다
    expect(r2.strokes.get(w.id)).toBeTruthy()
    expect(r2.lifted.has(w.id) || r2.waiting.includes(w.id)).toBe(true)
    expect(approxPt(w.a, wBefore.a, 1e-6) && approxPt(w.b, wBefore.b, 1e-6)).toBe(true)
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
    b.add(500, 500, 400, 475)
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
