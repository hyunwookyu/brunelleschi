// **소실점에서 출발하는 획은 자유다** (web2-06 지시 1)
//
// 증상: 소실점을 눌러 아래로 뻗으면 획이 **지평선 위로 납작하게 눌렸다.**
// 재현 표식(고치기 전) — 지평선 + 찍은 소실점 vp0=(900,400) 위에서:
//
//     [vp0에서 (700,600)] startSnap=vp@900,400  cls=content  end=(700.0,400.0) label=H
//     [vp0에서 (800,700)] startSnap=vp@900,400  cls=content  end=(900.0,700.0) label=V
//     [vp0에서 (600,500)] startSnap=vp@900,400  cls=content  end=(600.0,400.0) label=H
//
// 원인: `snapDir`이 **임계 없이 늘 가장 가까운 축**에 붙인다(지시 5-a). 그 규칙이 맞는
// 자리는 「있는 축 중 하나를 고르는 획」이고, 소실점에서 뻗는 획은 그 물음이 아니다 —
// 그 획은 **소실점의 다발 중 어느 살(ray)을 쓸지 고르는 중**이다. 소실점을 지나는 직선은
// 어느 방향이든 그 소실점의 살이므로 «가장 가까운 축»이라는 물음 자체가 성립하지 않는다.
//
// ⚠ `classifyNext`는 이 획을 못 막는다 — `vpDeviation`이 겹친 자리에서 null을 내고
// (시작점 = 소실점이라 방향이 없다) 그것이 `vpScore = 0`(붙었다)으로 읽혀 `content`가 된다.
// 그래서 자유 갈래(role==='vp')로도 안 빠졌다. 표식이 그 갈림을 그대로 냈다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { analyze, vpAt, DRAW_POSE } from '../src/core/camera'

const W = 1200, H = 800, HY = 400

/** 지평선 + 찍은 소실점 하나 */
function withVp() {
  const s = session(W, H)
  s.draw(100, HY, 1100, HY)
  s.draw(900, HY, 900, HY)      // 탭 = 소실점 찍기
  return s
}
const set = (s: ReturnType<typeof withVp>) => ({ ...s.app.osnap })

function end(s: ReturnType<typeof withVp>, ax: number, ay: number, bx: number, by: number) {
  const oh = resolveStart(s.app.lift, s.app.pose, { x: ax, y: ay }, set(s))
  const start = oh ? oh.p : { x: ax, y: ay }
  return resolveEnd(s.app.lift, s.app.pose, s.app.lift.an, start,
    { p3: oh?.p3 ?? null }, { x: bx, y: by }, set(s))
}

describe('지시 1 — 소실점에서 출발하는 획', () => {
  it('커서 자리에 그대로 끝난다 (축에 안 붙는다)', () => {
    const s = withVp()
    for (const [bx, by] of [[700, 600], [800, 700], [600, 500], [1100, 250]] as const) {
      const r = end(s, 900, HY, bx, by)
      expect(r.end, `(${bx},${by})`).toEqual({ x: bx, y: by })
      expect(r.axis, `(${bx},${by})`).toBeNull()
      expect(r.label, `(${bx},${by})`).toBeNull()
    }
  })

  it('소실점 «근처»를 눌러도 같다 — 판정은 붙은 좌표가 한다(원칙 d)', () => {
    const s = withVp()
    const r = end(s, 903, HY + 2, 700, 600)   // 오스냅 반경 8px 안
    expect(r.end).toEqual({ x: 700, y: 600 })
  })

  it('그 획이 새 소실점을 만들지 않는다 — 소실점 개수가 그대로다', () => {
    const s = withVp()
    const st = s.draw(900, HY, 700, 600)!
    const an = analyze(s.app.doc)
    expect(st.b).toEqual({ x: 700, y: 600 })
    expect(an.vps).toHaveLength(1)
    expect(an.roles.get(st.id)).toBe('content')
  })

  it('끝점 오스냅은 여전히 이긴다 — 점이 방향을 이긴다(Rhino 선례)', () => {
    const s = withVp()
    s.draw(500, 500, 700, 466)          // vp0 쪽 깊이선 — 끝점이 3D로 선다
    const target = s.app.doc.strokes.at(-1)!
    const r = end(s, 900, HY, target.a.x + 3, target.a.y - 2)
    expect(r.endSnap?.kind).toBe('end')
    expect(r.end).toEqual(target.a)
  })

  it('**반증**: 소실점에서 출발하지 않으면 종전대로 축에 붙는다', () => {
    const s = withVp()
    const r = end(s, 500, 600, 700, 590)   // 그냥 화면 위의 점에서
    expect(r.axis).not.toBeNull()
    expect(r.end).not.toEqual({ x: 700, y: 590 })
  })

  it('`vpAt`은 소실점 자리에서만 답한다 (반증 조건)', () => {
    const s = withVp()
    const an = s.app.lift.an
    expect(vpAt(an, DRAW_POSE, { x: 900, y: HY })).toBe('vp0')
    expect(vpAt(an, DRAW_POSE, { x: 900.5, y: HY })).toBeNull()
    expect(vpAt(an, DRAW_POSE, { x: 900, y: HY + 1 })).toBeNull()
  })
})
