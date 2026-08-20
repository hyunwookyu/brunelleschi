import { describe, it, expect } from 'vitest'
import { snapDir } from '../src/core/snap'
import { analyze, DRAW_POSE } from '../src/core/camera'
import { constructedDoc } from './fixtures'
import { pt } from '../src/core/vec'

const an = analyze(constructedDoc().doc)

describe('축 스냅 — 커서 방향과 축 방향의 각차 (0.06 · 0.05)', () => {
  const start = pt(500, 300)
  // vp0(900,400) 방향 단위벡터
  const u = { x: 400 / Math.hypot(400, 100), y: 100 / Math.hypot(400, 100) }
  const perp = { x: -u.y, y: u.x }

  it('임계 안이면 붙고, 끝점이 축 직선 위로 사영된다', () => {
    const cur = pt(start.x + 200 * u.x + 11 * perp.x, start.y + 200 * u.y + 11 * perp.y)
    const s = snapDir(an, DRAW_POSE, start, cur) // 편차 11/200.3 ≈ 0.0549 < 0.06
    expect(s.axis).toBe('vp0')
    // 사영된 끝점은 시작→소실점 직선 위 (cross = 0)
    const c2 = (s.end.x - start.x) * (400 - 300) - (s.end.y - start.y) * (900 - 500)
    expect(Math.abs(c2)).toBeLessThan(1e-6)
  })

  it('반례: 임계 밖이면 자유 — 커서 좌표 그대로', () => {
    const cur = pt(start.x + 200 * u.x + 13 * perp.x, start.y + 200 * u.y + 13 * perp.y)
    const s = snapDir(an, DRAW_POSE, start, cur) // 편차 ≈ 0.0649 > 0.06
    expect(s.axis).toBeNull()
    expect(s.end).toEqual(cur)
  })

  it('화면 평행은 0.05 — 경계 양쪽', () => {
    const st = pt(200, 200)
    const inTol = snapDir(an, DRAW_POSE, st, pt(400, 200 + 200 * 0.049))
    expect(inTol.axis).toBe('H')
    expect(inTol.end.y).toBeCloseTo(200, 9) // 수평선 위로 사영
    const outTol = snapDir(an, DRAW_POSE, st, pt(400, 200 + 200 * 0.052))
    expect(outTol.axis).toBeNull()
  })
})

// 시작점 스냅은 오스냅(osnap.test.ts)이 덮는다
