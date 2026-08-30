// web2-23 1부 — 굽기(make2d)의 회귀 팔 여섯 중 다섯(⑥ 비용 표는 원장 하네스가 낸다).
//
//   ① 벽 뒤의 선이 hidden 이 된다 (조각 수·좌표 값으로)
//   ② 벽 자신의 모서리는 visible 로 남는다 (같은 평면 조항)
//   ③ 개구부 너머의 선이 visible 이다 (창이 뚫려 있다)
//   ④ 면이 없으면 전부 visible
//   ⑤ 옐로 자신의 획은 굽기에 안 든다
//   반증(D-3 — **둘 다 실제로 돌린다**): ㉮ 같은 평면 조항을 빼면 ②가 실패하는가
//                                        ㉯ 깊이 비교를 뒤집으면 ①이 뒤집히는가
//
// 장면은 **합성 lift**다(face.test.ts의 선례) — 벽 뒤·개구부 너머 같은 배치를 앱 경로로
// 세우는 것은 다른 회차의 일이고(web2-24가 관통선으로 열었다), 여기서 재는 것은
// «굽기»이지 «리프팅»이 아니다. ⑤만 앱 경로다(옐로 겹이 실제로 빠지는가의 물음이라).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { constructedDoc } from './fixtures'
import { analyze, DRAW_POSE, project, rayThrough } from '../src/core/camera'
import { closestOnLineToRay, type LiftResult, type LiftedSeg } from '../src/core/lift'
import { planeDepth, resolveFaces } from '../src/core/face'
import { geomSize3 } from '../src/core/osnap'
import { bakeUnderlay } from '../src/core/make2d'
import { addLayer, commitStroke } from '../src/app/state'
import { C } from '../src/core/constants'
import type { Face, Stroke } from '../src/core/types'
import { v3, dot3, sub3, norm3, type V3 } from '../src/core/vec'

/** 합성 lift — 3D를 직접 놓고 그 사영을 획 좌표로 둔다(face.test.ts와 같은 방식) */
function synthLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    const a = project(an, DRAW_POSE, s.a3)!, b = project(an, DRAW_POSE, s.b3)!
    strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null, scaleId: null, dimGeom: new Map() }
}

/** 고리 하나를 선분 넷으로 — 이웃한 두 변의 3D 직선 교점이 정점이 된다(face.ts ③) */
function ring(id0: number, pts: V3[]): { id: number; a3: V3; b3: V3 }[] {
  return pts.map((p, i) => ({ id: id0 + i, a3: p, b3: pts[(i + 1) % pts.length]! }))
}

// ── 장면 — 정면 벽(z=−5) + 개구부 + 벽 뒤/앞/개구부 너머의 선 ────────────────
// 카메라는 작도 포즈(눈 (0,1.6,0) · −z 를 본다). 사영 배율은 z=−5 에서 f/5 ≈ 77.5 px/단위.
//   벽    화면 x 445.1~754.9 · y 291.6~523.9
//   개구부 화면 x 553.5~646.5 · y 369.0~446.5
const WALL = [v3(-2, 0, -5), v3(2, 0, -5), v3(2, 3, -5), v3(-2, 3, -5)]
const HOLE = [v3(-0.6, 1, -5), v3(0.6, 1, -5), v3(0.6, 2, -5), v3(-0.6, 2, -5)]
/** 벽 뒤(z=−8)로 벽보다 **넓게** 지나는 가로선 — 가운데만 가려야 한다(①) */
const BEHIND = { id: 9, a3: v3(-4, 0.5, -8), b3: v3(4, 0.5, -8) }
/** 개구부 너머(z=−8)의 짧은 선 — 창이 뚫려 있으므로 보인다(③) */
const THRU = { id: 10, a3: v3(-0.3, 1.5, -8), b3: v3(0.3, 1.5, -8) }
/** 벽 앞(z=−3)의 선 — 언제나 보인다(㉯가 이것을 뒤집는다) */
const FRONT = { id: 11, a3: v3(-1, 1.5, -3), b3: v3(1, 1.5, -3) }
/** **벽 면 위에 그은 선**(같은 평면·면의 «안»을 가로지른다) — ②가 실제로 재는 것이 이것이다.
 *  벽의 네 모서리는 면 다각형의 **경계 위**라 포함 판정이 그것을 «밖»으로 읽어 조항 없이도
 *  살아남는다(= 그 팔만으로는 실패 불가능한 격자다 — #69 ㉣). 면 안을 지나는 이 선만이
 *  같은 평면 조항을 실제로 통과한다. */
const RAIL = { id: 12, a3: v3(-2, 1.2, -5), b3: v3(2, 1.2, -5) }

function scene(warp = 0) {
  // warp: 벽의 한 꼭짓점을 평면 밖으로 민다(손으로 그린 루프의 «거의 평면»을 흉내낸다).
  const wall = warp === 0 ? WALL : [WALL[0]!, WALL[1]!, v3(2, 3, -5 - warp), WALL[3]!]
  const lift = synthLift([...ring(1, wall), ...ring(5, HOLE), BEHIND, THRU, FRONT, RAIL])
  const faces: Face[] = [{
    id: 100,
    loops: [
      { edges: [1, 2, 3, 4].map(s => ({ kind: 'stroke' as const, s })) },
      { edges: [5, 6, 7, 8].map(s => ({ kind: 'stroke' as const, s })) },
    ],
  }]
  return { lift, resolved: resolveFaces(lift, faces) }
}

/** 값이 그 자리인가 — 장면이 화면 좌표로 갈리게 짜였다 */
const near = (v: number, target: number, eps = 1.5) => Math.abs(v - target) <= eps

describe('web2-23 1부 — 굽기(은선)', () => {
  const { lift, resolved } = scene()

  it('장면이 실제로 섰다 — 면 하나(개구부 하나)와 3D 선분 열하나', () => {
    expect(resolved.length).toBe(1)
    expect(resolved[0]!.holes.length).toBe(1)
    expect(lift.lifted.size).toBe(12)
  })

  it('① 벽 뒤의 선이 hidden 이 된다 — 조각 셋(보임·가림·보임)이고 경계가 벽 가장자리다', () => {
    const r = bakeUnderlay(lift, resolved, DRAW_POSE)
    const mine = r.segs.filter(s => near(s.a.y, 453.3, 2) && near(s.b.y, 453.3, 2))
    expect(mine.length).toBe(3)
    expect(mine.map(s => s.hidden)).toEqual([false, true, false])
    // 가려지기 시작하는 자리 = 벽의 화면 왼쪽 가장자리(445.1) · 끝나는 자리 = 오른쪽(754.9)
    const mid = mine[1]!
    expect(mid.a.x).toBeCloseTo(445.1, 0)
    expect(mid.b.x).toBeCloseTo(754.9, 0)
    // 개구부는 이 선의 높이(y≈453)보다 위(y ≤ 446.5)라 여기서는 안 뚫린다 — 한 덩어리다
    expect(mid.b.x - mid.a.x).toBeGreaterThan(300)
  })

  it('② 벽 자신의 모서리와 벽 위에 그은 선이 visible 로 남는다 — 같은 평면 조항(1-c)', () => {
    const r = bakeUnderlay(lift, resolved, DRAW_POSE)
    // ㉠ 벽 네 변의 사영 = 벽 화면 사각의 변. 그 위의 조각이 하나라도 hidden 이면 실패다.
    const onWall = r.segs.filter(s =>
      (near(s.a.x, 445.1) && near(s.b.x, 445.1)) ||
      (near(s.a.x, 754.9) && near(s.b.x, 754.9)) ||
      (near(s.a.y, 523.9) && near(s.b.y, 523.9)) ||
      (near(s.a.y, 291.6) && near(s.b.y, 291.6)))
    expect(onWall.length).toBeGreaterThanOrEqual(4)
    expect(onWall.every(s => !s.hidden)).toBe(true)
    // ㉡ **면의 안을 가로지르는 같은 평면 선**(RAIL) — 조항이 실제로 걸리는 자리다.
    //    ㉠만으로는 이 팔이 실패 불가능하다(경계 위의 점은 포함 판정이 밖으로 읽는다).
    const rail = r.segs.filter(s => near(s.a.y, 431.0, 2) && near(s.b.y, 431.0, 2))
    expect(rail.length).toBe(1)               // 잘리지 않고 한 덩어리로 보인다
    expect(rail[0]!.hidden).toBe(false)
  })

  it('③ 개구부 너머의 선이 visible 이다 — 창이 뚫려 있다', () => {
    const r = bakeUnderlay(lift, resolved, DRAW_POSE)
    const thru = r.segs.filter(s => near(s.a.y, 404.8, 2) && near(s.b.y, 404.8, 2))
    expect(thru.length).toBe(1)
    expect(thru[0]!.hidden).toBe(false)
    // 반례 대조 — 같은 깊이(z=−8)인데 개구부 밖을 지나는 ①의 가운데는 hidden 이다.
    // (「깊이가 얕아서 보이는 것」이 아니라 «구멍이라서 보이는 것»임을 값으로 가른다)
    expect(r.segs.some(s => s.hidden)).toBe(true)
  })

  it('④ 면이 없으면 전부 visible — 굽기는 정상으로 끝난다(3부의 국면)', () => {
    const r = bakeUnderlay(lift, [], DRAW_POSE)
    expect(r.faces).toBe(0)
    expect(r.segs.length).toBe(12)            // 자를 자리가 없으니 선분당 조각 하나
    expect(r.segs.every(s => !s.hidden)).toBe(true)
  })

  it('⑤ 옐로 겹 자신의 획은 굽기에 안 든다 — 그 아래 3D 만이다', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)               // 지평선
    s.draw(500, 500, 700, 450)                // 깊이선 1
    s.draw(500, 500, 300, 450)                // 깊이선 2
    const before = bakeUnderlay(s.app.lift, s.app.faces, s.app.pose)
    const lay = addLayer(s.app, 'yellow', { W: 1200, H: 800 })!
    // 옐로 겹 위에 획 셋 — 2D 다(web2-22 1부). 굽기의 대상 선분 수가 안 늘어야 한다.
    for (let i = 0; i < 3; i++) {
      commitStroke(s.app, { x: 300 + i * 20, y: 600 }, { x: 400 + i * 20, y: 620 })
    }
    expect(s.app.doc.strokes.filter(x => x.layer === lay.id).length).toBe(3)
    const after = bakeUnderlay(s.app.lift, s.app.faces, s.app.pose)
    expect(after.lines).toBe(before.lines)
    expect(after.segs.length).toBe(before.segs.length)
  })

  // ── 반증 D-3 — **실제로 돌린다** ────────────────────────────────────────
  //
  // ⚠ 정면 벽(위 장면)으로는 이 반증이 **발화하지 않는다** — 조항을 빼도 결과가 같다.
  //   까닭이 둘이다: ㉠ 정확히 같은 평면이면 조각의 깊이와 면의 깊이가 **정확히 같아서**
  //   부등식이 어느 쪽으로도 안 기울고 ㉡ 정면 벽은 광선이 면에 거의 수직이라 어긋남이
  //   깊이로 안 증폭된다. 조항이 실제로 일하는 자리는 **비스듬히 보는 면 + 손으로 그린
  //   «거의 평면»**이다: 면의 깊이는 t = (d − n·o)/(n·rd) 라서 n·rd 가 작아질수록
  //   평면 계수의 작은 어긋남이 깊이에서 1/(n·rd) 배로 커진다. 그래서 반증 장면을
  //   따로 세운다(#69 ㉣ — 격자가 실패할 수 있는 자리여야 한다).
  function sideScene(warp: number) {
    // 옆 벽(x ≈ 1.2 · z −3~−12) — 눈에서 비스듬하다. 한 꼭짓점을 평면 밖으로 민다.
    // 꼭짓점을 **눈 쪽으로** 민다: 그래야 최적합 평면이 기울며 벽 위의 선이 그 평면의
    // «뒤»로 떨어진다(반대로 밀면 앞으로 떨어져 조항이 없어도 안 가려진다 — 값으로 확인했다).
    const wall = [v3(1.2, 0, -3), v3(1.2, 0, -12), v3(1.2 - warp, 3, -12), v3(1.2, 3, -3)]
    // 그 벽 **위에** 그은 선(면의 안을 지난다) — 같은 평면 조항이 지키는 대상
    const rail = { id: 12, a3: v3(1.2, 1.2, -4), b3: v3(1.2, 1.2, -11) }
    const lift = synthLift([...ring(1, wall), rail])
    const faces: Face[] = [{ id: 100, loops: [{ edges: [1, 2, 3, 4].map(s => ({ kind: 'stroke' as const, s })) }] }]
    return { lift, resolved: resolveFaces(lift, faces) }
  }

  it('㉮ 반증 — 같은 평면 조항을 빼면 ②가 실패한다(벽 위의 선이 자기 벽에 가려 사라진다)', () => {
    const { lift: L, resolved: R } = sideScene(0.1)
    expect(R.length).toBe(1)
    expect(R[0]!.flat).toBeLessThan(C.PLANAR_RATIO)     // 면은 선다(이탈이 허용 안)
    const hidden = (opt: { coplanar?: boolean }) =>
      bakeUnderlay(L, R, DRAW_POSE, opt).segs.filter(s => s.hidden).length
    // 조항이 있으면 가린 조각이 **하나도 없다**(그 장면에는 뒤엣것이 없다)
    expect(hidden({})).toBe(0)
    // 빼면 생긴다 — 벽 위의 선(그리고 모서리)이 자기 벽에 가린 것으로 읽힌다
    expect(hidden({ coplanar: false })).toBeGreaterThan(0)
    // **왜 갈리는지를 값으로 못 박는다**(장면을 손대면 뜻이 조용히 바뀌는 것을 막는다):
    // 벽 위의 선은 두 끝이 평면에서 tol 안이고(= 조항이 걸린다) 그런데도 깊이 차가
    // tol을 넘는다(= 조항이 없으면 가린다). 이 두 부등식이 반증의 내용 전부다.
    const f = R[0]!
    const d = dot3(f.normal, f.outer[0]!)
    const tol = C.PLANAR_RATIO * geomSize3(L)
    const rail = L.lifted.get(12)!
    const devA = Math.abs(dot3(f.normal, rail.a3) - d)
    const devB = Math.abs(dot3(f.normal, rail.b3) - d)
    expect(Math.max(devA, devB)).toBeLessThan(tol)      // 같은 평면으로 읽힌다
    const m = project(L.an, DRAW_POSE, v3(
      (rail.a3.x + rail.b3.x) / 2, (rail.a3.y + rail.b3.y) / 2, (rail.a3.z + rail.b3.z) / 2))!
    const ray = rayThrough(L.an, DRAW_POSE, m)!
    const P = closestOnLineToRay(rail.a3, norm3(sub3(rail.b3, rail.a3)), ray)!
    expect(dot3(sub3(P, ray.o), ray.d) - planeDepth({ n: f.normal, d }, ray)).toBeGreaterThan(tol)
  })

  it('㉯ 반증 — 깊이 비교를 뒤집으면 ①이 뒤집힌다(뒤엣선이 보이고 앞엣선이 가린다)', () => {
    const flip = bakeUnderlay(lift, resolved, DRAW_POSE, { flipDepth: true })
    const behind = flip.segs.filter(s => near(s.a.y, 453.3, 2) && near(s.b.y, 453.3, 2))
    expect(behind.length).toBeGreaterThan(0)
    expect(behind.every(s => !s.hidden)).toBe(true)      // 뒤엣선이 전부 보인다(뒤집혔다)
    // 그리고 **앞엣선**(z=−3 · 화면 y ≈ 412.9)이 가린 것으로 읽힌다 — 양쪽이 갈린다
    const front = flip.segs.filter(s => near(s.a.y, 412.9, 2) && near(s.b.y, 412.9, 2))
    expect(front.length).toBeGreaterThan(0)
    expect(front.some(s => s.hidden)).toBe(true)
  })
})
