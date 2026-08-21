// 같은 축 획의 3D 평행 — **구성상 보장이다. 측정이 아니다.**
//
// `liftAll`은 축이 붙은 획의 끝점을 `closestOnLineToRay(a3, 축방향, 광선)`으로 놓는다.
// 결과는 정의상 `a3 + t·축방향`이므로 같은 축의 두 획은 **반드시** 평행하다.
// 그래서 탑뷰 수렴각이 0.0000°인 것은 관측이 아니라 항등이다(CLAUDE.md §5.1 유형 3).
// 임계를 걸지 않고, **팔이 판별력을 갖는지만** 확인한다(양성 채널 — PITFALLS #30).

import { describe, it, expect } from 'vitest'
import { session, toward } from './session'
import { convergenceDeg, skewGap, extent, type Seg3 } from './measure'

function twoDepth() {
  const s = session(1200, 800)
  const V0 = { x: 900, y: 400 }
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(500, 500, 500, 300)                       // 기둥
  const top = toward({ x: 500, y: 300 }, V0, 0.35)
  const a = s.draw(500, 500, toward({ x: 500, y: 500 }, V0, 0.35).x, toward({ x: 500, y: 500 }, V0, 0.35).y)!
  const b = s.draw(500, 300, top.x, top.y)!
  return { s, A: s.app.lift.lifted.get(a.id)!, B: s.app.lift.lifted.get(b.id)! }
}

describe('같은 축 = 3D 평행 (보장)', () => {
  it('같은 축의 두 깊이 획은 탑뷰에서 정확히 평행하다', () => {
    const { A, B } = twoDepth()
    expect(A.axis).toBe('vp0')
    expect(B.axis).toBe('vp0')
    expect(convergenceDeg(A, B)).toBeLessThan(1e-9)
  })

  it('양성 채널 — 한쪽 끝을 축에서 떼면 팔이 즉시 0을 벗어난다', () => {
    const { A, B } = twoDepth()
    // 끝점을 깊이 방향으로 조금 당긴다 = 「소실점 쪽으로 수렴」을 손으로 만든다
    const bent: Seg3 = { a3: B.a3, b3: { x: B.b3.x * 0.9, y: B.b3.y, z: B.b3.z * 0.9 } }
    const ang = convergenceDeg(A, bent)
    expect(ang).toBeGreaterThan(0.5)          // 팔이 실제로 반응한다
    expect(Number.isFinite(ang)).toBe(true)
  })

  it('양성 채널 — 스큐 간격도 판별력이 있다 (방향이 같아도 떨어져 있으면 0이 아니다)', () => {
    const { A, B } = twoDepth()
    const gap = skewGap(A, B) / extent([A, B])
    expect(gap).toBeGreaterThan(0)            // 두 획은 평행하되 겹치지 않는다
    expect(skewGap(A, A) / extent([A])).toBeLessThan(1e-9) // 자기 자신과는 0
  })
})
