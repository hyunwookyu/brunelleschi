// 소실점 — 스냅 대상이고, 찍어서도 만든다 (지시 4)
//
// 두 길이 있다: **선을 그어** 지평선과의 교점으로 만들거나, **지평선 위를 찍어서** 만들거나.
// 둘은 `classifyNext`의 같은 출구로 나오므로 카메라가 구별하지 못한다(4-c).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { osnap, defaultOsnap, OSNAP_ORDER } from '../src/core/osnap'
import { DRAW_POSE } from '../src/core/camera'
import { C } from '../src/core/constants'
import { pt } from '../src/core/vec'

const HZ = [100, 400, 1100, 400] as const
/** 탭 — 같은 자리를 누르고 뗀다. 확정 규칙은 `resolveCommit`이 정한다(앱과 같은 함수). */
const tap = (s: ReturnType<typeof session>, x: number, y: number) => s.draw(x, y, x, y)

describe('4 — 소실점을 찍어서 만든다', () => {
  it('지평선 위를 찍으면 그 자리가 소실점이다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    tap(s, 900, 403)                       // 3px 벗어나도 지평선에 붙는다
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.vps[0]!.x).toBeCloseTo(900, 9)
    expect(s.app.lift.an.vps[0]!.y).toBeCloseTo(400, 9)
  })

  it('찍은 소실점 둘이면 2점이 선다 — f는 그어서 만든 것과 같다 (4-c)', () => {
    const tapped = session(1200, 800)
    tapped.draw(...HZ); tap(tapped, 900, 400); tap(tapped, 100, 400)
    const drawn = session(1200, 800)
    drawn.draw(...HZ); drawn.draw(500, 500, 600, 475); drawn.draw(500, 500, 400, 475)
    expect(tapped.app.lift.an.vps.map(v => v.x)).toEqual(drawn.app.lift.an.vps.map(v => v.x))
    expect(tapped.app.lift.an.fSource).toBe('two-vp')
    expect(tapped.app.lift.an.f).toBeCloseTo(drawn.app.lift.an.f!, 9)
    // 축 방향까지 같다 — 카메라가 두 경로를 구별하지 못한다
    for (const [i, ax] of tapped.app.lift.an.axes.entries()) {
      const other = drawn.app.lift.an.axes[i]!
      expect(ax.id).toBe(other.id)
      expect(ax.dir.x).toBeCloseTo(other.dir.x, 9)
      expect(ax.dir.z).toBeCloseTo(other.dir.z, 9)
    }
  })

  it('찍은 소실점에서 뻗은 선이 3D가 된다 (4-e)', () => {
    const s = session(1200, 800)
    s.draw(...HZ); tap(s, 900, 400); tap(s, 100, 400)
    const d = s.draw(500, 500, 600, 475)!   // 찍어 만든 vp0 쪽 — 첫 선이므로 지면
    const g = s.app.lift.lifted.get(d.id)!
    expect(g.axis).toBe('vp0')
    expect(Math.abs(g.a3.y)).toBeLessThan(1e-9)
    expect(Math.abs(g.b3.y)).toBeLessThan(1e-9)
  })

  it('찍은 표식은 3D 선이 아니다 — 점이고 무한원에 있다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const m = tap(s, 900, 400)!
    expect(s.app.lift.lifted.has(m.id)).toBe(false)
    expect(s.app.lift.waiting).not.toContain(m.id)
    expect(s.app.lift.an.roles.get(m.id)).toBe('vp')
  })

  it('반례: 지평선에서 먼 탭은 소실점이 아니다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    expect(tap(s, 900, 500)).toBeNull()          // 확정 자체가 안 된다 — 잡음
    expect(s.app.doc.strokes).toHaveLength(1)    // 지평선뿐
    expect(s.app.lift.an.vps).toHaveLength(0)
  })

  it('반례: f² ≤ 0이면 안 받는다 — 같은 쪽에 둘째를 찍으면 거부', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    tap(s, 900, 400)                             // 주점 x=600 기준 오른쪽
    const bad = tap(s, 1000, 400)!               // 또 오른쪽 → 직교 불가
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.rejects.get(bad.id)).toContain('f²')
  })

  it('반례: 이미 소실점이 있는 자리를 또 찍으면 안 겹친다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    tap(s, 900, 400)
    const again = tap(s, 903, 400)!
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.rejects.get(again.id)).toBeTruthy()
  })
})

describe('4-a — 소실점이 스냅 대상이다', () => {
  it('소실점 근처에서 스냅이 잡히고, 가장 앞선 종류다', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    const hit = osnap(s.app.lift, DRAW_POSE, pt(903, 402), defaultOsnap())!
    expect(hit.kind).toBe('vp')
    expect(hit.p.x).toBeCloseTo(900, 6)
    expect(hit.p3).toBeNull()      // 무한원 — 3D 점이 아니다
    expect(OSNAP_ORDER[0]).toBe('vp')
  })

  it('반경 밖이면 안 잡힌다', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    const far = osnap(s.app.lift, DRAW_POSE, pt(900 + C.OSNAP_RADIUS_PX + 5, 400), defaultOsnap())
    expect(far?.kind).not.toBe('vp')
  })

  it('꺼 두면 안 잡힌다 (종류별 토글)', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    const set = defaultOsnap(); set.kinds.vp = false
    const hit = osnap(s.app.lift, DRAW_POSE, pt(903, 402), set)
    expect(hit?.kind).not.toBe('vp')
  })

  it('화면 밖 소실점도 목록에서 안 뺀다 — 팬으로 들어오면 잡힌다', () => {
    // 프레임을 좁게 잡아 소실점이 캔버스 밖에 오게 한다
    const s = session(600, 800)
    s.draw(50, 400, 550, 400)
    s.draw(300, 500, 380, 480)   // 소실점이 x ≫ 600
    const v = s.app.lift.an.vps[0]!
    expect(v.x).toBeGreaterThan(600)
    const hit = osnap(s.app.lift, DRAW_POSE, pt(v.x + 2, 401), defaultOsnap())!
    expect(hit.kind).toBe('vp')
  })
})
