// 면 — 닫힌 루프가 있을 때 만들 수 있고 없앨 수 있다.
//
// 지시의 확인 목록 넷(삼각형·사각형·오목 다각형·개구부)을 각각 **만들고 지운다.**
// 앞의 셋은 **앱과 같은 경로**(`session`)로 그린다 — 손으로 doc에 밀어넣으면
// 스냅·오스냅을 안 거쳐 앱이 실제로 만드는 기하를 안 재게 된다.
// 개구부만 **합성 lift**를 쓴다: 지금 앱은 아무 데도 안 붙은 루프를 3D로 못 올린다
// (그 사실 자체를 아래 「개구부의 앱 경로가 막혀 있다」가 잰다).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { constructedDoc } from './fixtures'
import { analyze, DRAW_POSE, project } from '../src/core/camera'
import { liftAll, type LiftResult, type LiftedSeg } from '../src/core/lift'
import { buildGraph, cyclesOf, planesOf, loopAt, faceAt, resolveFace, resolveFaces, area2, triangulate3, newellNormal, faceScreen } from '../src/core/face'
import { geomSize3, intersections3 } from '../src/core/osnap'
import { toggleFaceAt, undo, redo, beginErase, eraseAt, endErase, isEraser } from '../src/app/state'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { toOBJ, toGLTF } from '../src/core/export'
import { C } from '../src/core/constants'
import type { Face, Stroke } from '../src/core/types'
import { v3, norm3, sub3, dot3, type V3, type Pt } from '../src/core/vec'

/** 임계를 안 걸고 잰 평면 이탈 — `resolveFace`와 같은 식(무게중심 + Newell) */
function measuredFlat(lift: LiftResult, size3: number): number {
  const poly = [101, 102, 103, 104].map(id => lift.lifted.get(id)!.a3)
  const n = newellNormal(poly)
  const c = poly.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4, z: a.z + p.z / 4 }), { x: 0, y: 0, z: 0 })
  return Math.max(...poly.map(p => Math.abs((p.x - c.x) * n.x + (p.y - c.y) * n.y + (p.z - c.z) * n.z))) / size3
}

// ── 도형 셋 — 앱 경로로 그린다 ────────────────────────────────────────────
// 셋 다 **지면(Y=0)**에 놓인다. 지면 축으로 그은 선은 지면을 안 벗어나므로
// 평면성이 «구성상» 보장되고, 그래서 이 팔들은 평면성이 아니라 **루프 찾기**를 잰다.

/** 삼각형 — 최소 도형. 깊이선 둘 + 그 끝을 잇는 한 획. */
function triangle() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(500, 500, 700, 450)       // 깊이선 1 → vp0 (900,400)
  s.draw(500, 500, 300, 450)       // 깊이선 2 → vp1 (100,400)
  s.draw(700, 450, 300, 450)       // 두 끝을 잇는다 (양끝이 오스냅)
  return s
}

/** 사각형 — **끝점이 안 만난다.** 두 획이 삐져나온 채 가로지르고, 자동 분할이
 *  그 교차점에서 나눠 루프가 생긴다(지시 「닫힘 판정」의 답). */
function quad() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 700, 450)
  s.draw(500, 500, 300, 450)
  s.draw(700, 450, 400, 425)       // vp1 방향 — 교차점 (500,433.3)을 지나 더 간다
  s.draw(300, 450, 600, 425)       // vp0 방향 — 마찬가지
  return s
}

/** 오목 육각형 — 지그재그로 여섯 획, 마지막이 첫 획의 시작점에 붙는다.
 *  꺾임 부호가 하나만 반대인 것이 「오목」의 정의다. */
function concave() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 520, 740, 448)
  s.draw(740, 448, 580, 436)
  s.draw(580, 436, 468, 448.6)
  s.draw(468, 448.6, 357.6, 434)
  s.draw(357.6, 434, 249.1, 440.8)
  s.draw(249.1, 440.8, 500, 520)
  return s
}

/** 화면 다각형의 꺾임 부호 — 오목 꼭짓점 세기 */
const turns = (P: Pt[]): number[] => P.map((_, i) => {
  const a = P[(i - 1 + P.length) % P.length]!, b = P[i]!, c = P[(i + 1) % P.length]!
  return Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
})

// ── 합성 lift — 개구부·평면성처럼 앱이 아직 못 만드는 배치를 잰다 ──────────

function synthLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    const a = project(an, DRAW_POSE, s.a3)!, b = project(an, DRAW_POSE, s.b3)!
    strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null }
}

/** 지면의 축 정렬 사각형 — id 넷을 쓴다 */
function groundRect(id0: number, x0: number, x1: number, z0: number, z1: number, y = 0) {
  const c = [v3(x0, y, z0), v3(x1, y, z0), v3(x1, y, z1), v3(x0, y, z1)]
  return c.map((a, i) => ({ id: id0 + i, a3: a, b3: c[(i + 1) % 4]! }))
}

// ══════════════════════════════════════════════════════════════════════════

describe('면 — 만들기', () => {
  it('삼각형 — 탭하면 면이 되고 다시 탭하면 없어진다', () => {
    const s = triangle()
    expect(s.app.lift.waiting).toEqual([1])   // 지평선 따라긋기 획 — 퇴화 대기(web2-17)
    expect(s.app.doc.faces).toHaveLength(0)          // **자동으로 안 만든다**
    expect(toggleFaceAt(s.app, { x: 500, y: 470 })).toBe('added')
    expect(s.app.doc.faces).toHaveLength(1)
    expect(s.app.faces[0]!.outer).toHaveLength(3)
    expect(s.app.faces[0]!.tris).toHaveLength(3)      // 삼각형 하나 = 정점 3
    expect(toggleFaceAt(s.app, { x: 500, y: 470 })).toBe('removed')
    expect(s.app.doc.faces).toHaveLength(0)
    expect(s.app.faces).toHaveLength(0)
  })

  it('사각형 — **끝점이 안 만나도** 된다. 교차가 모서리다', () => {
    const s = quad()
    // 삐져나온 꼬리가 실제로 있다 — 네 획 중 둘은 서로의 끝점에 안 붙었다
    expect(buildGraph(s.app.lift, DRAW_POSE).nodes.length).toBeGreaterThan(4)
    expect(toggleFaceAt(s.app, { x: 500, y: 465 })).toBe('added')
    const f = s.app.faces[0]!
    expect(f.outer).toHaveLength(4)
    expect(f.tris).toHaveLength(6)                    // 삼각형 둘
    // 모서리는 **직선 교점**이다 — 화면으로 되사영해 확인한다
    const poly = faceScreen(s.app.lift, DRAW_POSE, f.outer)!
    const near = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6
    expect(poly.some(p => near(p, { x: 500, y: 500 }))).toBe(true)
    expect(poly.some(p => near(p, { x: 500, y: 1300 / 3 }))).toBe(true)   // (500, 433.333…)
    expect(toggleFaceAt(s.app, { x: 500, y: 465 })).toBe('removed')
    expect(s.app.faces).toHaveLength(0)
  })

  it('오목 다각형 — 오목 꼭짓점이 정확히 하나, 삼각형은 n−2개', () => {
    const s = concave()
    expect(s.app.lift.waiting).toEqual([1])   // 지평선 따라긋기 획 — 퇴화 대기(web2-17)
    expect(toggleFaceAt(s.app, { x: 450, y: 475 })).toBe('added')
    const f = s.app.faces[0]!
    expect(f.outer).toHaveLength(6)
    expect(f.tris).toHaveLength(12)                   // 4 삼각형 = 6−2
    const t = turns(faceScreen(s.app.lift, DRAW_POSE, f.outer)!)
    expect(t.filter(x => x > 0)).toHaveLength(1)      // **오목하다**
    expect(t.filter(x => x < 0)).toHaveLength(5)
    expect(toggleFaceAt(s.app, { x: 450, y: 475 })).toBe('removed')
    expect(s.app.faces).toHaveLength(0)
  })

  it('개구부 — 안쪽 루프가 통째로 들어 있으면 구멍이다(오목과 다르다)', () => {
    const lift = synthLift([
      ...groundRect(101, -6, 6, -10, -22),
      ...groundRect(201, -2, 2, -14, -18),
    ])
    // 고리 사이를 탭한다
    const found = loopAt(lift, DRAW_POSE, { x: 600, y: 455 })!
    expect(found.loops).toHaveLength(2)               // 외곽 + 개구부
    expect(found.loops[0]!.edges.map(e => e.s).sort()).toEqual([101, 102, 103, 104])
    expect(found.loops[1]!.edges.map(e => e.s).sort()).toEqual([201, 202, 203, 204])

    const face: Face = { id: 1, loops: found.loops }
    const r = resolveFace(lift, face, 40)!
    expect(r.holes).toHaveLength(1)
    expect(r.outer).toHaveLength(4)
    expect(r.holes[0]!).toHaveLength(4)
    // 삼각분할의 넓이 = 외곽 − 개구부 (구멍이 진짜로 비었다)
    const triArea = (() => {
      let a = 0
      for (let i = 0; i + 2 < r.tris.length; i += 3) {
        const p = r.tris[i]!, q = r.tris[i + 1]!, s2 = r.tris[i + 2]!
        // 지면이므로 (x,z) 평면 넓이
        a += Math.abs((q.x - p.x) * (s2.z - p.z) - (q.z - p.z) * (s2.x - p.x)) / 2
      }
      return a
    })()
    expect(triArea).toBeCloseTo(12 * 12 - 4 * 4, 6)

    // **지우기 쪽** — `toggleFaceAt`이 «없앤다»를 정할 때 부르는 판정이 `faceAt`이다.
    // 개구부는 앱 경로로 못 만들어 토글을 통째로 못 태우므로(아래 「앱이 아직 못 하는 것」)
    // 그 **판정 자체**를 잰다: 고리 사이는 그 면이고, **구멍 안은 면이 아니다.**
    expect(faceAt(lift, DRAW_POSE, [r], { x: 600, y: 455 })!.id).toBe(1)
    expect(faceAt(lift, DRAW_POSE, [r], { x: 600, y: 439 })).toBeNull()
    // 그 면이 목록에서 빠지면 (= 없앤 뒤) 같은 자리가 비어 있다
    expect(faceAt(lift, DRAW_POSE, [], { x: 600, y: 455 })).toBeNull()
  })

  it('개구부 — 안쪽 루프 자체도 면이 될 수 있다(구멍을 메운다)', () => {
    const lift = synthLift([
      ...groundRect(101, -6, 6, -10, -22),
      ...groundRect(201, -2, 2, -14, -18),
    ])
    const inner = loopAt(lift, DRAW_POSE, { x: 600, y: 439 })!
    expect(inner.loops).toHaveLength(1)               // 그 안에는 더 이상 구멍이 없다
    expect(inner.loops[0]!.edges.map(e => e.s).sort()).toEqual([201, 202, 203, 204])
  })
})

describe('면 — 어느 루프를 고르는가', () => {
  it('**가장 작은 것**을 고른다 — 가르는 선이 있으면 그 반쪽이다', () => {
    const s = quad()
    const whole = loopAt(s.app.lift, DRAW_POSE, { x: 500, y: 465 })!   // **자르기 전에** 잰다
    expect(whole.loops[0]!.edges).toHaveLength(4)
    // 사각형을 가로지르는 선 하나 — (500,500) ↔ (500,433.3) 대각(양끝이 오스냅)
    s.draw(500, 500, 500, 1300 / 3)
    // 자른 뒤에는 전체가 최소 순환이 아니다 — 반쪽을 탭하면 그 반쪽만 나온다
    const left = loopAt(s.app.lift, DRAW_POSE, { x: 420, y: 460 })!
    const right = loopAt(s.app.lift, DRAW_POSE, { x: 580, y: 460 })!
    expect(left.loops[0]!.edges).toHaveLength(3)
    expect(right.loops[0]!.edges).toHaveLength(3)
    expect(left.loops[0]!.edges.map(e => e.s)).not.toEqual(right.loops[0]!.edges.map(e => e.s))
    // 그 둘의 넓이 합 = 자르기 전 전체 (큰 쪽은 «작은 것들을 지운 뒤에» 다시 잡힌다)
    expect(Math.abs(area2(left.poly)) + Math.abs(area2(right.poly)))
      .toBeCloseTo(Math.abs(area2(whole.poly)), 6)
  })
})

describe('면 — 반증 조건 (D-3)', () => {
  it('열린 루프는 면이 안 된다 — 한 변을 빼면 «none»이다', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 700, 450)
    s.draw(500, 500, 300, 450)
    // 잇는 획을 **안 긋는다** — 열린 «V»자다
    expect(toggleFaceAt(s.app, { x: 500, y: 470 })).toBe('none')
    expect(s.app.doc.faces).toHaveLength(0)
    // 그 한 획을 그으면 그때 된다 (같은 탭, 같은 자리)
    s.draw(700, 450, 300, 450)
    expect(toggleFaceAt(s.app, { x: 500, y: 470 })).toBe('added')
  })

  it('루프 **밖**을 탭하면 «none»이다', () => {
    const s = triangle()
    expect(toggleFaceAt(s.app, { x: 200, y: 700 })).toBe('none')
    expect(s.app.doc.faces).toHaveLength(0)
  })

  it('비평면 루프는 거부한다 — 임계 양쪽에서 갈린다', () => {
    // 지면 사각형 하나를 만들고 한 꼭짓점만 y로 띄운다.
    // 기하 크기(size3)를 인자로 직접 주므로 임계가 그대로 보인다.
    // ⚠ **띄운 높이 = 이탈이 아니다.** 법선은 Newell 최적합이라 네 점 중 하나를 h만큼
    //   띄우면 이탈은 대략 h/2다 — 그래서 임계와 h를 바로 견주면 안 된다(그렇게 적었다가
    //   초판이 틀렸다). 여기서는 **잰 값**으로 양쪽을 가른다.
    const size3 = 40
    const lift = (y: number) => synthLift(groundRect(101, -6, 6, -10, -22).map((s, i) => ({
      id: s.id,
      a3: i === 0 ? v3(s.a3.x, y, s.a3.z) : s.a3,
      b3: i === 3 ? v3(s.b3.x, y, s.b3.z) : s.b3,
    })))
    const face: Face = {
      id: 1, loops: [{ edges: [101, 102, 103, 104].map(s => ({ kind: 'stroke' as const, s })) }],
    }
    // **이탈은 띄운 높이에 (거의) 선형이다** — 잰 값을 그대로 적는다.
    // 초판이 「법선이 함께 기울어서 5배가 아니다」로 적었는데 **그것이 틀렸다**(2차 [7]):
    // 잔차는 정확히 h/4이고, 5배에 못 미치는 몫은 **분모(geomSize3)가 h만큼 커진 것**이다.
    const flats = [0.4, 0.8, 1.2, 1.6, 2.0].map(h => resolveFace(lift(h), face, size3)?.flat
      ?? measuredFlat(lift(h), size3))
    expect(flats[0]!).toBeCloseTo(0.0024993, 6)
    expect(flats[1]!).toBeCloseTo(0.0049945, 6)   // 2배에서 0.06% 모자란다(분모가 컸다)
    expect(flats[2]!).toBeCloseTo(0.0074813, 6)
    expect(flats[3]!).toBeCloseTo(0.0099558, 6)
    expect(flats[4]!).toBeCloseTo(0.0124141, 6)
    // **임계를 바짝 감싼다**(2차 [7]: 통과 점이 임계의 0.25배로 헐거웠다) — 1.6 통과 · 1.62 거부
    expect(resolveFace(lift(1.6), face, size3)!.flat).toBeLessThan(C.PLANAR_RATIO)
    expect(resolveFace(lift(1.62), face, size3)).toBeNull()
    // 평면 그대로면 이탈이 0이다 — 띄운 만큼 늘어나는 것을 위에서 봤으므로 이것은 측정이다
    expect(resolveFace(lift(0), face, size3)!.flat).toBe(0)
  })

  it('평면성과 3D 교차가 **같은 분모**를 쓴다 — 장면을 10배로 키워 잰다', () => {
    // `PLANAR_RATIO`의 근거는 「`INTERSECT_GAP_RATIO`와 같은 물음의 앞뒤」이고, 그 논증은
    // **분모가 같은 양일 때만** 선다. 초판은 `PLANAR_RATIO === INTERSECT_GAP_RATIO`를 봤는데
    // 그것은 **상수 동치**라 분모를 판정하지 않는다(2차 [8]). 여기서는 **장면을 키워** 잰다:
    // 두 경계가 **둘 다 정확히 10배**가 되면 둘이 같은 양에 비례한다는 뜻이다.
    const face: Face = {
      id: 1, loops: [{ edges: [101, 102, 103, 104].map(s => ({ kind: 'stroke' as const, s })) }],
    }
    const measure = (k: number) => {
      const mk = (h: number) => synthLift(groundRect(101, -6 * k, 6 * k, -10 * k, -22 * k).map((s, i) => ({
        id: s.id,
        a3: i === 0 ? v3(s.a3.x, h, s.a3.z) : s.a3,
        b3: i === 3 ? v3(s.b3.x, h, s.b3.z) : s.b3,
      })))
      const sz = geomSize3(mk(0))
      let lo = 0, hi = 100 * k
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (resolveFace(mk(m), face, sz)) lo = m; else hi = m }
      let l2 = 0, h2 = 100 * k
      for (let i = 0; i < 60; i++) {
        const m = (l2 + h2) / 2
        const l = synthLift([
          { id: 1, a3: v3(-5 * k, 0, -12 * k), b3: v3(5 * k, 0, -12 * k) },
          { id: 2, a3: v3(0, m, -17 * k), b3: v3(0, m, -7 * k) },
          { id: 3, a3: v3(-5 * k, 0, -20 * k), b3: v3(5 * k, 0, -20 * k) },
        ])
        if (intersections3(l).length > 0) l2 = m; else h2 = m
      }
      return { size3: sz, planar: lo, gap: l2 }
    }
    const one = measure(1), ten = measure(10)
    expect(one.size3).toBeCloseTo(16.9706, 3)
    expect(ten.size3 / one.size3).toBeCloseTo(10, 6)
    expect(one.planar).toBeCloseTo(0.6794, 4)
    expect(one.gap).toBeCloseTo(0.1640, 4)
    expect(ten.planar / one.planar).toBeCloseTo(10, 6)       // 평면 경계 — 10배
    expect(ten.gap / one.gap).toBeCloseTo(10, 6)             // 교차 경계 — 10배
    // 평면 경계의 잔차는 h/4다 — 0.6794/4 = 0.169842 ≈ 0.01 · 16.9706 = 0.169706.
    // ⚠ 정확히 같지 않다(차 1.4e−4): 분모 `geomSize3`가 **띄운 높이만큼 함께 커지기** 때문이고,
    //   그것이 바로 위 「선형에서 0.06% 모자란다」와 같은 몫이다.
    expect(one.planar / 4).toBeCloseTo(C.PLANAR_RATIO * one.size3, 3)
    expect(one.planar / 4 - C.PLANAR_RATIO * one.size3).toBeCloseTo(1.359e-4, 6)
  })

  it('면을 못 만든 탭은 문서에 아무것도 안 남긴다 — id도 안 쓴다', () => {
    const s = triangle()
    const before = s.app.nextId
    const ops = s.app.undoStack.length              // 그리기가 이미 쌓아 둔 것
    expect(toggleFaceAt(s.app, { x: 200, y: 700 })).toBe('none')
    expect(s.app.nextId).toBe(before)
    expect(s.app.undoStack).toHaveLength(ops)       // 면 op가 안 쌓였다
  })
})

describe('면 — 선이 지워지면', () => {
  it('경계 획이 사라지면 면도 안 그려진다. **문서에는 남고** 실행취소로 돌아온다', () => {
    const s = triangle()
    toggleFaceAt(s.app, { x: 500, y: 470 })
    expect(s.app.faces).toHaveLength(1)
    // 잇는 획(마지막)을 지운다 — 지우개는 조각을 지운다
    s.app.tool = 'eraser-pencil'
    expect(isEraser(s.app.tool)).toBe(true)
    beginErase(s.app)
    eraseAt(s.app, { x: 500, y: 450 })
    endErase(s.app)
    expect(s.app.faces).toHaveLength(0)               // 안 그려진다
    expect(s.app.doc.faces).toHaveLength(1)           // **버려지지 않았다**(불변식 j)
    undo(s.app)
    expect(s.app.faces).toHaveLength(1)               // 획이 돌아오면 면도 돌아온다
  })

  it('면을 만든 것·없앤 것 둘 다 실행취소된다', () => {
    const s = triangle()
    toggleFaceAt(s.app, { x: 500, y: 470 })
    expect(s.app.faces).toHaveLength(1)
    undo(s.app)
    expect(s.app.doc.faces).toHaveLength(0)
    redo(s.app)
    expect(s.app.faces).toHaveLength(1)
    toggleFaceAt(s.app, { x: 500, y: 470 })           // 없앤다
    expect(s.app.doc.faces).toHaveLength(0)
    undo(s.app)
    expect(s.app.doc.faces).toHaveLength(1)
    expect(s.app.faces).toHaveLength(1)
  })
})

describe('면 — 저장·내보내기', () => {
  it('.brnl 왕복 — 면은 **경계의 정체**만 담기고 좌표는 다시 풀린다', () => {
    const s = triangle()
    toggleFaceAt(s.app, { x: 500, y: 470 })
    const text = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: [] })
    expect(JSON.parse(text).faces[0].loops[0].edges[0]).toHaveProperty('kind', 'stroke')
    expect(JSON.stringify(JSON.parse(text).faces)).not.toMatch(/"z"/) // 좌표가 없다
    const back = parseBrnl(text)!
    expect(back.doc.faces).toHaveLength(1)
    const lift = liftAll(back.doc)
    const faces = resolveFaces(lift, back.doc.faces)
    expect(faces).toHaveLength(1)
    expect(faces[0]!.outer).toHaveLength(3)
  })

  it('면이 없는 옛 파일도 열린다 — `faces` 열쇠가 없어도 거부 안 한다', () => {
    const raw = JSON.parse(serializeBrnl({
      doc: triangle().app.doc, nextId: 9, savedViews: [],
    }))
    delete raw.faces
    const back = parseBrnl(JSON.stringify(raw))!
    expect(back.doc.faces).toEqual([])
  })

  it('모양이 틀린 면은 파일을 거부한다 — 경계 둘짜리 루프', () => {
    const raw = JSON.parse(serializeBrnl({ doc: triangle().app.doc, nextId: 9, savedViews: [] }))
    raw.faces = [{ id: 1, loops: [{ edges: [{ kind: 'stroke', s: 2 }, { kind: 'stroke', s: 3 }] }] }]
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()
  })

  it('OBJ·glTF — **삼각형으로** 나간다(형식이 구멍을 못 담는다)', () => {
    const lift = synthLift([
      ...groundRect(101, -6, 6, -10, -22),
      ...groundRect(201, -2, 2, -14, -18),
    ])
    const found = loopAt(lift, DRAW_POSE, { x: 600, y: 455 })!
    const r = resolveFace(lift, { id: 1, loops: found.loops }, 40)!
    const obj = toOBJ(lift, [r])
    expect(obj).toContain('g FACE')
    const fLines = obj.split('\n').filter(l => l.startsWith('f '))
    expect(fLines).toHaveLength(r.tris.length / 3)
    for (const l of fLines) expect(l.split('#')[0]!.trim().split(/\s+/)).toHaveLength(4) // f + 정점 3
    const gl = JSON.parse(toGLTF(lift, [r]))
    const prim = gl.meshes[0].primitives.find((p: any) => p.mode === 4)
    expect(prim).toBeTruthy()
    expect(gl.accessors[prim.attributes.POSITION].count).toBe(r.tris.length)
  })
})

describe('면 — 회귀', () => {
  // 이 회차가 고친 결함(`lift.ts`): 끝점 오스냅으로 붙인 자리를 **축 풀이가 덮어써서**
  // 루프가 안 닫혔다. 되살리는 조건이 「닫는 획이 어느 축의 허용각(3.4°) 안」이다.
  it('붙인 끝점을 lift가 지킨다 — 축 허용각 안이어도', () => {
    const s = concave()
    const ids = [...s.app.lift.lifted.keys()]
    const first = s.app.lift.lifted.get(ids[0]!)!
    const last = s.app.lift.lifted.get(ids[ids.length - 1]!)!
    // 마지막 획의 끝 = 첫 획의 시작. **정확히 같은 점**이어야 루프가 닫힌다.
    expect(last.b3).toEqual(first.a3)
    // 되살리면 나무가 된다 — 마디 7·순환 1(면적 0). 지금은 마디 6·순환 2다.
    const g = buildGraph(s.app.lift, DRAW_POSE)
    expect(g.nodes).toHaveLength(6)
    const cy = cyclesOf(g, new Set(g.half.map((_, i) => i >> 1)))
    expect(cy).toHaveLength(2)
    expect(cy.filter(c => c.area > 1e-9)).toHaveLength(1)
  })

  // #63 수리(점이 방향을 이긴다)의 **대가**를 잰다(2차 [9]) — 「팔 전부 통과」는 대가의 부재가 아니다.
  it('끝점이 이긴 획은 선언 축에서 얼마나 어긋나는가 — 허용각 안이지만 0은 아니다', () => {
    const s = concave()
    const ids = [...s.app.lift.lifted.keys()]
    const seg = s.app.lift.lifted.get(ids[ids.length - 1]!)!
    expect(seg.axis).toBe('vp1')                             // 축은 vp1로 배정됐고
    const dir = norm3(sub3(seg.b3, seg.a3))
    const ax = s.app.lift.an.axes.find(a => a.id === 'vp1')!
    const deg = Math.acos(Math.min(1, Math.abs(dot3(dir, norm3(ax.dir))))) * 180 / Math.PI
    // **3D 방향은 그 축에서 1.1223° 어긋나 있다** — 끝점을 지켰기 때문이다.
    expect(deg).toBeCloseTo(1.1223, 3)
    // 상한은 축 판정의 허용각이다(VP_DIR_RATIO = 0.06 → asin ≈ 3.44°) — 그보다 크면
    // 애초에 그 축으로 배정되지 않았을 것이므로 **구성상 그 안이다**.
    expect(deg).toBeLessThan(Math.asin(C.VP_DIR_RATIO) * 180 / Math.PI)
  })

  it('평면 배치 — 안쪽 면은 반시계(양수), 바깥 경계는 시계(음수)', () => {
    const s = triangle()
    const g = buildGraph(s.app.lift, DRAW_POSE)
    const cy = cyclesOf(g, new Set(g.half.map((_, i) => i >> 1)))
    expect(cy).toHaveLength(2)
    const [pos, neg] = [cy.filter(c => c.area > 0), cy.filter(c => c.area < 0)]
    expect(pos).toHaveLength(1)
    expect(neg).toHaveLength(1)
    expect(pos[0]!.area).toBeCloseTo(-neg[0]!.area, 6)
  })

  // ── **가림** — 이 회차가 두 번째로 고친 결함 ────────────────────────────
  // 초판은 조각 전체를 **한** 화면 배치로 훑었다. 세로 기둥이 지면 대각선을 화면에서만
  // 가로지르자(3D에서는 안 만난다) 평면 그래프 전제가 깨져 **순환이 하나(면적 0)**로
  // 나왔고 벽도 바닥도 면이 안 됐다. 지금은 **평면마다** 훑는다.
  it('가림 — 기둥이 지면선을 화면에서만 가로질러도 벽과 바닥이 각각 면이 된다', () => {
    // web2-17: 지평선은 상시 H/2=400 — 옛 장면(지평선 330)을 통째로 +70 평행이동했다
    // (1-a: 평행이동은 카메라·3D를 안 바꾼다). 지평선 획 자체는 이제 없다 — id가 1씩 준다.
    const s = session(1200, 800)
    s.draw(470, 630, 780, 570)       // 지면 vp0
    s.draw(470, 630, 160, 570)       // 지면 vp1
    s.draw(780, 570, 300, 540)       // 지면 — 삐져나온다
    s.draw(160, 570, 640, 540)       // 지면 — 삐져나온다 (여기서 기둥과 화면 교차가 난다)
    s.draw(470, 630, 470, 470)       // 기둥
    s.draw(470, 470, 780, 425)       // 벽 윗변
    s.draw(780, 570, 780, 425)       // 오른쪽 기둥
    const g = buildGraph(s.app.lift, DRAW_POSE)
    expect(g.nodes).toHaveLength(10)
    expect(g.half.length / 2).toBe(11)
    // **한 배치로 훑으면** 순환이 하나(면적 0)다 — 되살린 결함이 여기서 보인다
    const whole = cyclesOf(g, new Set(g.half.map((_, i) => i >> 1)))
    expect(whole).toHaveLength(1)
    expect(whole[0]!.area).toBeCloseTo(0, 6)
    // **평면마다 훑으면** 지면과 벽이 각각 선다
    const planes = planesOf(g, C.PLANAR_RATIO * 50)
    const withFace = planes.filter(pl => cyclesOf(g, pl.use).some(c => c.area > 1e-9))
    expect(withFace.length).toBeGreaterThanOrEqual(2)
    const wall = loopAt(s.app.lift, DRAW_POSE, { x: 600, y: 500 })!
    const floor = loopAt(s.app.lift, DRAW_POSE, { x: 400, y: 580 })!  // 벽에 안 가린 자리
    expect(wall.loops[0]!.edges.map(e => e.s)).toEqual([1, 7, 6, 5])
    expect(floor.loops[0]!.edges.map(e => e.s)).toEqual([1, 3, 4, 2])
    // 둘 다 실제로 면이 된다 — 벽은 수직 평면이므로 «지면만 된다»가 아니다
    expect(toggleFaceAt(s.app, { x: 600, y: 500 })).toBe('added')
    expect(toggleFaceAt(s.app, { x: 400, y: 580 })).toBe('added')
    expect(s.app.faces).toHaveLength(2)
    expect(Math.abs(s.app.faces[0]!.normal.y)).toBeCloseTo(0, 9)   // 벽 — 수직면
    expect(Math.abs(s.app.faces[1]!.normal.y)).toBeCloseTo(1, 9)   // 바닥 — 수평면
  })

  it('가림 — 벽 **뒤의** 바닥을 탭하면 앞엣것(벽)을 집는다', () => {
    const s = session(1200, 800)
    s.draw(100, 330, 1100, 330)
    s.draw(470, 560, 780, 500)
    s.draw(470, 560, 160, 500)
    s.draw(780, 500, 300, 470)
    s.draw(160, 500, 640, 470)
    s.draw(470, 560, 470, 400)
    s.draw(470, 400, 780, 355)
    s.draw(780, 500, 780, 355)
    // (560,505)는 화면에서 바닥 안이기도 하고 벽 안이기도 하다 — 벽이 앞이다
    expect(loopAt(s.app.lift, DRAW_POSE, { x: 560, y: 505 })!.loops[0]!.edges.map(e => e.s))
      .toEqual([2, 8, 7, 6])
    // 넓이로 가르던 초판은 여기서 바닥을 집었다(벽이 더 크므로) — 그것이 결함이었다
  })

  it('삼각분할은 오목·개구부에서도 n−2 · n+2h−2개를 낸다', () => {
    // 오목 육각형: 4개
    const hex = concave()
    toggleFaceAt(hex.app, { x: 450, y: 475 })
    expect(hex.app.faces[0]!.tris.length / 3).toBe(6 - 2)
    // 개구부 하나짜리: 정점 총 8(외곽 4 + 구멍 4) · 구멍 1 → 8 + 2·1 − 2 = 8
    const lift = synthLift([
      ...groundRect(101, -6, 6, -10, -22),
      ...groundRect(201, -2, 2, -14, -18),
    ])
    const found = loopAt(lift, DRAW_POSE, { x: 600, y: 455 })!
    const r = resolveFace(lift, { id: 1, loops: found.loops }, 40)!
    expect(r.tris.length / 3).toBe(8 + 2 * 1 - 2)
  })

  it('법선·평면 기저 — 지면 사각형의 법선은 ±y다', () => {
    const poly = [v3(-1, 0, -5), v3(1, 0, -5), v3(1, 0, -7), v3(-1, 0, -7)]
    const n = newellNormal(poly)
    expect(Math.abs(n.y)).toBeCloseTo(1, 12)
    expect(triangulate3(poly, [], n)).toHaveLength(6)
  })
})

// ── 차수 승격 — 「좌표를 안 담으므로 면이 따라온다」의 실측 ────────────────
// 이 프로젝트의 고유한 둘 중 하나가 승격이고(CLAUDE.md §1.2), 그때 **전부 다시 올라간다**.
// 면이 좌표를 담았으면 그 순간 낡은 값이 된다 — 그래서 경계의 정체만 담았고, 그 결정이
// 실제로 값을 하는지는 **승격을 한 번 태워** 봐야 안다(리뷰어 [12]).
describe('면 — 차수 승격을 견딘다', () => {
  /** 1점 상태의 벽 사각형 — vp0과 V만 쓴다.
   *  ⚠ **자유 방향 획을 못 쓴다**: 작도가 안 끝난 상태에서 비스듬한 획은 «새 소실점»이 되고
   *  (실측: (500,380)→(700,450)이 vp=(557,400)을 만들었다), 화면 수평 획은 1점으로 **잠근다**
   *  (`p1Locked`). 그래서 승격을 남겨 두려면 축 둘로만 그려야 한다. */
  function wall1pt() {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 700, 450)      // 깊이선 1 → vp0 (900,400) · 지면
    s.draw(500, 500, 500, 380)      // 왼쪽 기둥 (V)
    s.draw(700, 450, 700, 370)      // 오른쪽 기둥 (V)
    s.draw(500, 380, 720, 391)      // 윗변 (vp0) — 오른쪽 기둥을 지나 조금 더
    return s
  }

  it('1점에서 만든 면이 2점 승격 뒤에도 선다 — 좌표는 전부 다시 풀린다', () => {
    const s = wall1pt()
    const an1 = s.app.lift.an
    expect(an1.vps).toHaveLength(1)
    expect(an1.fSource).toBe('default')
    expect(an1.f).toBe(1044)                       // 0.87 · 1200
    expect(toggleFaceAt(s.app, { x: 600, y: 420 })).toBe('added')
    const before = s.app.faces[0]!
    expect(before.outer).toHaveLength(4)
    expect(before.flat).toBe(0)
    const o0 = { ...before.outer[0]! }

    // 두 번째 깊이선 → **승격**. 카메라가 바뀌고 문서 전체가 다시 올라간다.
    const st = s.draw(700, 520, 600, 495)
    const an2 = s.app.lift.an
    expect(an2.roles.get(st!.id)).toBe('vp')
    expect(an2.vps).toHaveLength(2)
    expect(an2.fSource).toBe('two-vp')
    expect(an2.f).toBeCloseTo(337.638860, 5)       // f가 실제로 바뀌었다 (1044 → 337.6)
    expect(s.app.lift.waiting).toEqual([1])        // 지평선 따라긋기 획 — 퇴화 대기(web2-17)

    const after = s.app.faces[0]!
    expect(after.id).toBe(before.id)               // 같은 면이다
    expect(after.outer).toHaveLength(4)
    // **좌표는 전부 달라졌다** — 낡은 값을 들고 있었다면 여기서 안 움직였을 것이다
    expect(o0.z).toBeCloseTo(-16.704, 3)
    expect(after.outer[0]!.z).toBeCloseTo(-5.402221765, 6)
    // 그런데도 **평면성은 그대로**다 — 승격이 면을 비평면으로 만들지 않았다
    expect(after.flat).toBeLessThan(1e-12)
  })

  it('.brnl 복원도 같은 자리다 — 파일에는 획 id만 있다', () => {
    const s = wall1pt()
    toggleFaceAt(s.app, { x: 600, y: 420 })
    const back = parseBrnl(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: [] }))!
    const lift = liftAll(back.doc)
    const faces = resolveFaces(lift, back.doc.faces)
    expect(faces).toHaveLength(1)
    expect(faces[0]!.outer).toHaveLength(4)
    expect(faces[0]!.outer[0]!.z).toBeCloseTo(s.app.faces[0]!.outer[0]!.z, 12)
  })
})

describe('면 — 앱이 아직 못 하는 것 (측정으로 남긴다)', () => {
  it('개구부 한계가 좁아졌다(web2-17 4부) — 지면 국면의 소실점 축 선은 올라가고, 비축·수직 표류는 여전히 대기다', () => {
    const s = quad()
    const before = s.app.lift.lifted.size
    // 사각형 안쪽에 아무 것에도 안 닿는 소실점 축 획 — **이제 지면선으로 올라간다**
    // (4부 지면 규칙 확대: 모델에 높이가 없고 대기가 전부 소실점 축이면 지면이다.
    //  종전에는 여기서 대기였다 — 그 한계가 이 자리에서 좁아졌다).
    const st = s.draw(480, 470, 560, 462)
    expect(st).not.toBeNull()
    expect(s.app.lift.lifted.size).toBe(before + 1)
    // 남은 한계: **높이 위의 안쪽 고리**(개구부 — 벽에 붙은 창)는 여전히 못 올린다.
    // 지평선 위쪽의 수직 표류가 그 대역의 최소 표본이다 — 대기(실패가 아니다).
    const v = s.draw(200, 300, 200, 250)
    expect(v).not.toBeNull()
    expect(s.app.lift.waiting).toContain(v!.id)
    expect(s.app.lift.lifted.has(v!.id)).toBe(false)
  })
})
