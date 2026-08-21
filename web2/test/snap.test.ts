import { describe, it, expect } from 'vitest'
import { snapDir } from '../src/core/snap'
import { analyze, DRAW_POSE } from '../src/core/camera'
import { constructedDoc } from './fixtures'
import { pt } from '../src/core/vec'

const an = analyze(constructedDoc().doc)

// ⚠ 임계(0.06 · 0.05)는 **폐기됐다**(지시 5-a). 그것을 재던 팔 둘이 여기 있었고,
// 지우기만 하면 그 자리가 조용해지므로(PITFALLS #57) **「항상 붙는다」를 재는 팔로 교체한다.**
describe('축 스냅 — 임계 없이 가장 가까운 축에 항상 붙는다', () => {
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

  it('옛 임계 밖에서도 붙는다 — 자유로 안 떨어진다 (임계 폐기의 반례)', () => {
    // 편차 ≈ 0.0649 > 0.06. 옛 규칙은 여기서 axis=null이었다.
    const cur = pt(start.x + 200 * u.x + 13 * perp.x, start.y + 200 * u.y + 13 * perp.y)
    const s = snapDir(an, DRAW_POSE, start, cur)
    expect(s.axis).toBe('vp0')
    expect(s.end).not.toEqual(cur)          // 축 직선 위로 옮겨졌다
  })

  it('한참 벗어나도 붙는다 — 각차가 얼마든 가장 가까운 축이다', () => {
    const st = pt(200, 200)
    for (const [dx, dy] of [[200, 60], [200, 140], [60, 200], [-200, 90], [-70, -200]] as [number, number][]) {
      const s = snapDir(an, DRAW_POSE, st, pt(st.x + dx, st.y + dy))
      expect(s.axis).not.toBeNull()
    }
  })

  it('축 셋 중 가장 가까운 것을 고른다 — 커서를 돌리면 넘어간다 (5-d)', () => {
    const st = pt(500, 500)
    const seen = new Set<string>()
    for (let deg = 0; deg < 360; deg += 5) {
      const r = (deg * Math.PI) / 180
      const s = snapDir(an, DRAW_POSE, st, pt(st.x + 300 * Math.cos(r), st.y + 300 * Math.sin(r)))
      expect(s.axis).not.toBeNull()
      seen.add(s.axis!)
    }
    // 한 바퀴 돌면 **축 셋**이 전부 한 번씩은 나온다 — 미리보기 색이 바뀔 자리다.
    // ⚠ 넷이던 시절의 H가 사람이 안 만든 축이었다(web2-03 지시 1).
    expect([...seen].sort()).toEqual(['V', 'vp0', 'vp1'])
  })

  it('향은 무시한다 — 축의 반대 방향으로 그어도 그 축이다', () => {
    // ⚠ 시작점을 두 소실점의 **중간(x=500)에 두면 안 된다** — 거기서는 vp0의 역방향이
    // vp1의 정방향과 정확히 같아서 무엇을 재는지 알 수 없다(초판이 그 함정에 걸렸다).
    const st = pt(600, 550)
    const d = { x: 900 - st.x, y: 400 - st.y }
    const l = Math.hypot(d.x, d.y)
    const fwd = snapDir(an, DRAW_POSE, st, pt(st.x + 200 * d.x / l, st.y + 200 * d.y / l))
    const back = snapDir(an, DRAW_POSE, st, pt(st.x - 200 * d.x / l, st.y - 200 * d.y / l))
    expect(fwd.axis).toBe('vp0')
    expect(back.axis).toBe('vp0')
  })

  it('반례: 축이 하나도 없으면(지평선 전) 자유다 — 그때는 축이란 것이 없다', () => {
    const bare = analyze({ frame: { W: 1200, H: 800 }, strokes: [] })
    const s = snapDir(bare, DRAW_POSE, pt(100, 100), pt(300, 260))
    expect(s.axis).toBeNull()
    expect(s.end).toEqual(pt(300, 260))
  })
})

// 시작점 스냅은 오스냅(osnap.test.ts)이 덮는다
