// **궤도 중심은 펜으로 딴 선의 경계 상자 중심이다** (web2-06 지시 4)
//
// 증상: 「연필로 그린 전체를 중심으로 회전하니 반경이 너무 길어진다.」
// 원인: `orbitPivot`이 **승격 기하 전체의 무게중심**이었다. 연필 구축선은 소실점 쪽으로
// 길게 뻗으므로 깊이가 크다 — 소실점 가까이서 끝나는 유도선 하나가 3D에서 **83 단위** 뒤에
// 서고, 그것 하나로 반경이 **17.335**가 됐다. 펜 획만 보면 **7.274**다.
//
// 결과물은 펜으로 딴 선이므로 그것이 돌려볼 대상이다. 연필 구축선은 경계 상자에서 뺀다.
//
// ⚠⚠ **펜이 없으면 무게중심으로 돌아간다**(1차 리뷰어 [9]). 초판은 그때도 경계 상자였고
//    구축선 하나가 상자를 늘려 **52.087**이 됐다 — 무게중심 17.335의 **3배**이고,
//    그것은 사람이 보고한 증상(「반경이 너무 길어진다」)과 **같은 방향**이다.
//    「펜 선이 없으면 연필로 대신한다」를 «종전 규칙으로 돌아간다»로 읽는다(D-4).

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import { orbitPivot, undo } from '../src/app/state'
import { DRAW_POSE } from '../src/core/camera'
import type { V3 } from '../src/core/vec'

const W = 1200, H = 800, HY = 400

/** 지평선 + 소실점 둘 + 기둥 + **멀리 뻗은 연필 구축선**(소실점 가까이서 끝난다) */
function drawn(): Session {
  const s = session(W, H)
  s.draw(100, HY, 1100, HY)
  s.draw(500, 500, 600, 475)      // 깊이선 1 → vp0 = 900
  s.draw(500, 500, 400, 475)      // 깊이선 2 → vp1 = 100
  s.draw(500, 500, 500, 300)      // 기둥
  s.draw(500, 500, 870, 407)      // 연필 구축선 — 3D에서 83 단위 뒤에 선다
  return s
}
const radius = (p: V3) =>
  Math.hypot(p.x - DRAW_POSE.p.x, p.y - DRAW_POSE.p.y, p.z - DRAW_POSE.p.z)
/** 무게중심 — 고치기 전의 규칙. **대조군으로만** 쓴다(앱은 이제 안 쓴다). */
function centroid(s: Session): V3 {
  const segs = [...s.app.lift.lifted.values()]
  let x = 0, y = 0, z = 0
  for (const g of segs) { x += g.a3.x + g.b3.x; y += g.a3.y + g.b3.y; z += g.a3.z + g.b3.z }
  const n = segs.length * 2
  return { x: x / n, y: y / n, z: z / n }
}

describe('지시 4 — 궤도 중심', () => {
  it('**펜이 있으면 펜의 경계 상자다** — 멀리 뻗은 연필 구축선이 중심을 못 끌어간다', () => {
    const s = drawn()
    expect(radius(centroid(s))).toBeCloseTo(17.335, 2)   // 고치기 전의 반경
    s.app.tool = 'pen'
    const i1 = s.draw(500, 500, 600, 475)!               // 깊이선 따기
    const i2 = s.draw(500, 500, 500, 300)!               // 기둥 따기
    expect(s.app.lift.lifted.has(i1.id)).toBe(true)
    expect(s.app.lift.lifted.has(i2.id)).toBe(true)
    const p = orbitPivot(s.app)
    expect(radius(p)).toBeCloseTo(7.274, 2)              // **반경이 2.4배 줄었다**
    // 그 값이 실제로 펜 둘의 경계 상자 중심이다
    const ink = [i1.id, i2.id].map(id => s.app.lift.lifted.get(id)!)
    const xs = ink.flatMap(g => [g.a3.x, g.b3.x])
    const ys = ink.flatMap(g => [g.a3.y, g.b3.y])
    const zs = ink.flatMap(g => [g.a3.z, g.b3.z])
    expect(p.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 9)
    expect(p.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 9)
    expect(p.z).toBeCloseTo((Math.min(...zs) + Math.max(...zs)) / 2, 9)
  })

  it('**펜이 없으면 종전 규칙(무게중심)이다** — 이 회차가 그 구간을 안 건드린다', () => {
    const s = drawn()
    expect([...s.app.lift.lifted.keys()].length).toBeGreaterThan(0)
    expect(radius(orbitPivot(s.app))).toBeCloseTo(17.335, 2)   // = 무게중심 = 이 회차 전과 같다
    expect(orbitPivot(s.app)).toEqual(centroid(s))
    // **경계 상자였으면 52.087**이었다 — 1차 리뷰어 [9]가 잡은 자리다(3배 · 증상과 같은 방향)
    const segs = [...s.app.lift.lifted.values()]
    const ax = segs.flatMap(g => [g.a3.x, g.b3.x]), ay = segs.flatMap(g => [g.a3.y, g.b3.y])
    const az = segs.flatMap(g => [g.a3.z, g.b3.z])
    const boxAll = {
      x: (Math.min(...ax) + Math.max(...ax)) / 2,
      y: (Math.min(...ay) + Math.max(...ay)) / 2,
      z: (Math.min(...az) + Math.max(...az)) / 2,
    }
    expect(radius(boxAll)).toBeCloseTo(52.087, 2)
  })

  it('저장하지 않는다 — 펜 획을 되돌리면 그 즉시 연필로 돌아간다', () => {
    const s = drawn()
    const before = orbitPivot(s.app)
    s.app.tool = 'pen'
    s.draw(500, 500, 600, 475)
    expect(orbitPivot(s.app).z).not.toBeCloseTo(before.z, 6)
    undo(s.app)
    expect(orbitPivot(s.app)).toEqual(before)
  })

  it('**반증**: 경계 상자 중심은 획 밀도에 안 끌린다 (무게중심은 끌린다)', () => {
    const s = drawn()
    s.app.tool = 'pen'
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 500, 300)
    const p1 = orbitPivot(s.app)
    // 한 귀퉁이(기둥 밑동)를 여러 번 덧그린다 — 경계 상자는 그대로여야 한다
    for (let i = 0; i < 6; i++) s.draw(500, 500, 500, 320)
    const p2 = orbitPivot(s.app)
    expect(p2).toEqual(p1)
  })

  it('3D가 없으면 종전대로 눈앞 f — 돌 것이 없을 때의 갈래', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    expect(s.app.lift.lifted.size).toBe(0)
    const p = orbitPivot(s.app)
    expect(p.x).toBe(0)
    expect(p.y).toBe(DRAW_POSE.p.y)
    expect(p.z).toBe(-s.app.lift.an.f!)
  })
})
