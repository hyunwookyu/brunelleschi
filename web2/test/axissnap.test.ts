// 축 스냅이 기본이다 — 자유 방향은 없다 (지시 5)
//
// 규칙 둘: 오스냅이 잡히면 그 점으로 / 없으면 가장 가까운 축. 끝이다.
// 예외는 하나뿐이고 이유가 분명하다 — **새 축을 정의하는 획**(소실점을 만드는 중).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { resolveEnd } from '../src/core/draft'
import { defaultOsnap } from '../src/core/osnap'
import { DRAW_POSE } from '../src/core/camera'

const HZ = [100, 400, 1100, 400] as const
/** 지평선 + 소실점 둘 (찍어서 — 짧고 확실하다) */
function built() {
  const s = session(1200, 800)
  s.draw(...HZ); s.draw(900, 400, 900, 400); s.draw(100, 400, 100, 400)
  return s
}

describe('5 — 임의 방향으로 그어도 축 셋 중 하나가 된다', () => {
  it('한 바퀴 어느 각도로 그어도 축이 붙는다 (5-f)', () => {
    const s = built()
    s.draw(500, 500, 500, 300)          // 기둥 하나 세워 붙을 데를 만든다
    let free = 0, total = 0
    for (let deg = 0; deg < 360; deg += 7) {
      const r = (deg * Math.PI) / 180
      const cur = { x: 500 + 220 * Math.cos(r), y: 500 + 220 * Math.sin(r) }
      const e = resolveEnd(s.app.lift, DRAW_POSE, s.app.lift.an,
        { x: 500, y: 500 }, { p3: null }, cur, defaultOsnap())
      total++
      // 오스냅이 이기는 경우는 축이 아니어도 좌표가 정해진다 — 자유가 아니다
      if (!e.axis && !e.endSnap) free++
    }
    expect(total).toBe(52)
    expect(free).toBe(0)
  })

  it('오스냅으로 양 끝이 정해지면 축을 안 따른다 — 그것이 대각선 긋는 법이다 (5-b)', () => {
    const s = built()
    const v = s.draw(500, 500, 500, 300)!          // 기둥
    const d = s.draw(500, 500, 700, 450)!          // vp0 쪽 바닥선
    const g = s.app.lift.lifted.get(d.id)!
    // 기둥 꼭대기에서 바닥선 끝점으로 — 양 끝이 기존 점이므로 축이 아니어도 3D가 된다
    const topScr = { x: 500, y: 300 }
    const endScr = { x: d.b.x, y: d.b.y }
    const diag = s.draw(topScr.x, topScr.y, endScr.x, endScr.y)!
    const gd = s.app.lift.lifted.get(diag.id)
    expect(gd).toBeDefined()
    expect(s.app.lift.waiting).not.toContain(diag.id)
    void v; void g
  })

  it('새 소실점을 정의하는 획만 자유다 — 그 한 경우가 예외인 이유', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const e = resolveEnd(s.app.lift, DRAW_POSE, s.app.lift.an,
      { x: 500, y: 500 }, { p3: null }, { x: 700, y: 430 }, defaultOsnap())
    expect(e.label).toBe('vp')
    expect(e.axis).toBeNull()
    expect(e.end).toEqual({ x: 700, y: 430 })   // 안 굽힌다 — 축을 만드는 중이다
  })

  it('미리보기가 붙은 축을 낸다 — 커서를 돌리면 넘어간다 (5-d)', () => {
    const s = built()
    const seen = new Set<string>()
    for (let deg = 0; deg < 360; deg += 5) {
      const r = (deg * Math.PI) / 180
      const e = resolveEnd(s.app.lift, DRAW_POSE, s.app.lift.an,
        { x: 500, y: 550 }, { p3: null }, { x: 500 + 250 * Math.cos(r), y: 550 + 250 * Math.sin(r) },
        defaultOsnap())
      if (e.axis) seen.add(e.axis)
    }
    expect([...seen].sort()).toEqual(['H', 'V', 'vp0', 'vp1'])
  })
})

describe('5-c — 대기가 거의 사라진다', () => {
  it('연결된 채 임의 방향으로 서른 번 그으면 대기가 0이다', () => {
    const s = built()
    s.draw(500, 550, 500, 350)           // 첫 기둥 — 지면에서
    let at = { x: 500, y: 550 }
    for (let i = 0; i < 30; i++) {
      const r = ((i * 47) % 360) * Math.PI / 180
      const nx = at.x + 120 * Math.cos(r), ny = at.y + 120 * Math.sin(r)
      const st = s.draw(at.x, at.y, nx, ny)
      if (st) { const g = s.app.lift.lifted.get(st.id); if (g) at = { x: st.b.x, y: st.b.y } }
    }
    expect(s.app.lift.waiting).toEqual([])
    expect(s.app.lift.lifted.size).toBeGreaterThan(25)
  })

  it('연장선 오스냅에 붙인 끝점은 3D가 된다 — 리프팅이 되찾는다', () => {
    // 6-g: 「연장선 — 원 선과 같은 3D 직선 위이므로 좌표가 즉시 정해진다」.
    // 초판은 리프팅의 선분 위 검사가 t∈[0,1]로 잠겨 있어 그 좌표를 도로 버렸다.
    const s = built()
    s.draw(500, 550, 500, 350)              // 기둥
    const d = s.draw(500, 550, 700, 500)!   // vp0 쪽 바닥선
    const g = s.app.lift.lifted.get(d.id)!
    // 그 바닥선의 **연장** 위 한 점을 화면에서 집는다 (선분 밖)
    const ext = { x: d.b.x + (d.b.x - d.a.x) * 0.5, y: d.b.y + (d.b.y - d.a.y) * 0.5 }
    const e = resolveEnd(s.app.lift, DRAW_POSE, s.app.lift.an,
      { x: 500, y: 350 }, { p3: null }, ext, defaultOsnap())
    expect(e.endSnap?.kind).toBe('ext')
    const st = s.draw(500, 350, ext.x, ext.y)!
    expect(s.app.lift.waiting).not.toContain(st.id)
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
    void g
  })

  it('반례: 그래도 대기가 남는 경우 — 지평선 위에서 시작하면 지면과 안 만난다', () => {
    // 축은 붙는다(방향은 정해진다). 못 정하는 것은 **시작점의 좌표**다.
    const s = built()
    const v = s.draw(400, 200, 400, 300)!   // 지평선(400)보다 위 — 첫 선인데 지면과 안 만난다
    expect(s.app.lift.waiting).toContain(v.id)
  })
})
