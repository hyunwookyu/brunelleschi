// 지면 격자 — 공간의 정사각형을 투영한 것이다 (지시 6-h)
//
// 화면 각도 균등 분할이 **아니라는** 것이 요점이다(이론서 9.5 — 등간격은 1/(V−uₙ)이
// 등차수열). 그래서 「화면에서 간격이 같은가」가 아니라 「공간에서 정사각형인가」를 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { projectSeg, groundAxes, project, DRAW_POSE } from '../src/core/camera'
import { C } from '../src/core/constants'

const HZ = [100, 400, 1100, 400] as const
function built() {
  const s = session(1200, 800)
  s.draw(...HZ); s.draw(900, 400, 900, 400); s.draw(100, 400, 100, 400)
  return s
}

describe('6-h — 지면 격자', () => {
  it('격자 방향은 세계의 가로축 둘이다 — 둘 다 지면에 눕는다', () => {
    const s = built()
    const ga = groundAxes(s.app.lift.an)!
    expect(ga).toHaveLength(2)
    for (const d of ga) expect(Math.abs(d.y)).toBeLessThan(1e-9)
    // 2점이면 두 소실점 방향이고 서로 직교다(작도의 정의)
    expect(Math.abs(ga[0]!.x * ga[1]!.x + ga[0]!.z * ga[1]!.z)).toBeLessThan(1e-9)
  })

  it('1점이면 깊이축 + 화면 평행 가로축', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(900, 400, 900, 400)
    const ga = groundAxes(s.app.lift.an)!
    expect(ga).toHaveLength(2)
    expect(Math.abs(ga[1]!.x - 1)).toBeLessThan(1e-9) // H = (1,0,0)
  })

  it('반례: 지평선 전에는 격자가 없다', () => {
    const s = session(1200, 800)
    expect(groundAxes(s.app.lift.an)).toBeNull()
  })

  it('화면 간격이 **균등하지 않다** — 멀수록 좁아진다 (9.5)', () => {
    const s = built()
    const [u] = groundAxes(s.app.lift.an)!
    // 격자 교점을 직접 본다: u 방향으로 k칸 간 지면 점들. 이것이 9.5가 말하는 수열이다.
    const ys: number[] = []
    for (let k = 1; k <= 12; k++) {
      const p = project(s.app.lift.an, DRAW_POSE, { x: u.x * k, y: 0, z: u.z * k })
      if (p) ys.push(p.y)
    }
    expect(ys.length).toBe(12)
    const gaps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]!))
    // 단조 감소한다 — 화면 등간격이면 전부 같았을 것이다
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!)
    // 그리고 그 차이가 크다: 첫 칸이 마지막 칸의 여러 배다
    expect(gaps[0]! / gaps[gaps.length - 1]!).toBeGreaterThan(5)
  })

  it('공간에서는 정사각형이다 — 한 칸의 두 변 길이가 같다', () => {
    const s = built()
    const [u, v] = groundAxes(s.app.lift.an)!
    const step = C.GRID_STEP
    const lu = Math.hypot(u.x * step, u.z * step)
    const lv = Math.hypot(v.x * step, v.z * step)
    expect(lu).toBeCloseTo(lv, 12)
    expect(lu).toBeCloseTo(step, 12)
  })

  it('카메라 뒤로 넘어가는 선도 앞부분은 그린다 (근평면 절단)', () => {
    const s = built()
    const [u] = groundAxes(s.app.lift.an)!
    // 눈을 관통해 뒤까지 뻗는 선
    const seg = projectSeg(s.app.lift.an, DRAW_POSE,
      { x: -u.x * 50, y: 0, z: -u.z * 50 }, { x: u.x * 50, y: 0, z: u.z * 50 })
    expect(seg).not.toBeNull()
    for (const p of seg!) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true) }
  })

  it('반례: 완전히 뒤에 있는 선은 null', () => {
    const s = built()
    const seg = projectSeg(s.app.lift.an, DRAW_POSE, { x: -5, y: 0, z: 10 }, { x: 5, y: 0, z: 10 })
    expect(seg).toBeNull()
  })
})
