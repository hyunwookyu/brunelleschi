// 첫 앵커와 눈높이 (지시 2 · 3)
//
// 규칙 하나이고 **선의 종류를 안 가린다**:
//   첫 선이 수평선이면   그 선 자체가 Y=0
//   첫 선이 깊이선이면   그 선 자체가 Y=0
//   첫 선이 수직선이면   아래점이 Y=0
// 그 뒤는 전부 «연결»이 정한다. 연결이 없으면 대기다 — 좌표를 임의로 정하지 않는다.
//
// 눈높이(1.6)가 **Y 스케일**을 정한다. f(깊이 압축률)와 다른 축이다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { liftAll } from '../src/core/lift'
import { builder } from './fixtures'
import { DRAW_POSE, analyze } from '../src/core/camera'
import { C } from '../src/core/constants'

const HZ = [100, 400, 1100, 400] as const
const ground = (y: number) => Math.abs(y) < 1e-9

describe('3 — 눈높이가 Y 스케일을 정한다', () => {
  it('작도 카메라는 지면 위 1.6에 있다', () => {
    expect(DRAW_POSE.p.y).toBe(1.6)
    expect(C.EYE_HEIGHT).toBe(1.6)
    expect(DRAW_POSE.p.x).toBe(0)
    expect(DRAW_POSE.p.z).toBe(0)
  })

  it('f와 눈높이는 다른 축이다 — f가 바뀌어도 눈높이는 안 바뀐다', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(500, 500, 600, 475)
    const f1 = s.app.lift.an.f!
    s.draw(500, 500, 400, 475)          // 두 번째 소실점 → f가 바뀐다
    expect(s.app.lift.an.f).not.toBeCloseTo(f1, 3)
    expect(DRAW_POSE.p.y).toBe(1.6)     // Y 스케일은 그대로
  })

  it('그린 것이 대략 실척이다 — 사람 키 남짓의 기둥', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.draw(500, 500, 600, 475)          // 첫 선(깊이) — 지면
    const v = s.draw(500, 500, 500, 300)! // 그 모서리에서 세운 기둥
    const g = s.app.lift.lifted.get(v.id)!
    expect(ground(g.a3.y)).toBe(true)
    // 지평선(눈높이)보다 위로 100px 올라간 기둥 → 1.6 m보다 높고, 방 높이 대역 안
    expect(g.b3.y).toBeGreaterThan(1.6)
    expect(g.b3.y).toBeLessThan(6)
  })
})

describe('2 — 첫 선은 지면에 있다 (종류를 안 가린다)', () => {
  it('첫 선이 수평선이면 그 선 자체가 Y=0', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const h = s.draw(400, 550, 700, 550)!
    const g = s.app.lift.lifted.get(h.id)!
    expect(g.axis).toBe('H')
    expect(ground(g.a3.y) && ground(g.b3.y)).toBe(true)
  })

  it('첫 선이 깊이선이면 그 선 자체가 Y=0', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const d = s.draw(500, 500, 600, 475)!
    const g = s.app.lift.lifted.get(d.id)!
    expect(g.axis).toBe('vp0')
    expect(ground(g.a3.y) && ground(g.b3.y)).toBe(true)
  })

  it('첫 선이 수직선이면 아래점이 Y=0 — 위로 그어도', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const v = s.draw(500, 650, 500, 450)! // 아래 → 위
    const g = s.app.lift.lifted.get(v.id)!
    expect(g.axis).toBe('V')
    expect(ground(g.a3.y)).toBe(true)     // a가 아래점
    expect(g.b3.y).toBeGreaterThan(0)
  })

  it('첫 선이 수직선이면 아래점이 Y=0 — 아래로 그어도 (그은 방향과 무관)', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const v = s.draw(500, 450, 500, 650)! // 위 → 아래
    const g = s.app.lift.lifted.get(v.id)!
    expect(g.axis).toBe('V')
    expect(ground(g.b3.y)).toBe(true)     // b가 아래점
    expect(g.a3.y).toBeGreaterThan(0)
  })

  it('위로 긋든 아래로 긋든 같은 3D를 낸다', () => {
    const up = session(1200, 800); up.draw(...HZ); up.draw(500, 650, 500, 450)
    const dn = session(1200, 800); dn.draw(...HZ); dn.draw(500, 450, 500, 650)
    const gu = [...up.app.lift.lifted.values()][0]!
    const gd = [...dn.app.lift.lifted.values()][0]!
    // 방향만 반대, 점 집합은 같다
    expect(gu.a3.y).toBeCloseTo(gd.b3.y, 9)
    expect(gu.b3.y).toBeCloseTo(gd.a3.y, 9)
    expect(gu.a3.z).toBeCloseTo(gd.b3.z, 9)
  })

  it('둘째 선부터는 연결이 정한다 — 지면에 안 놓는다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.draw(500, 500, 600, 475)            // 첫 선 — 지면
    const v = s.draw(500, 500, 500, 300)! // 모서리에 연결 — 아래점만 지면
    const g = s.app.lift.lifted.get(v.id)!
    expect(ground(g.a3.y)).toBe(true)
    // 위 끝은 지면이 아니다. 「둘째도 지면에 놓는다」면 둘 다 0이 됐을 것이다.
    expect(ground(g.b3.y)).toBe(false)
  })

  it('반례: 둘째 선이 아무것에도 안 닿으면 대기다 — 지면에 임의로 안 놓는다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.draw(500, 500, 600, 475)            // 첫 선
    const v = s.draw(200, 700, 200, 600)! // 안 닿는 수직 — 지면에 놓을 «수는» 있지만 안 놓는다
    expect(s.app.lift.waiting).toContain(v.id)
    expect(s.app.lift.lifted.has(v.id)).toBe(false)
  })

  it('스냅이 걸렸으면 그 좌표가 이긴다 (2-d)', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const d = s.draw(500, 500, 600, 475)!  // 첫 선
    const g0 = s.app.lift.lifted.get(d.id)!
    // 첫 선의 먼 끝(600,475)에서 시작하는 수직 — 붙을 곳이 있으므로 지면 규칙이 아니라 연결이 정한다
    const v = s.draw(600, 475, 600, 350)!
    const g = s.app.lift.lifted.get(v.id)!
    expect(g.a3.x).toBeCloseTo(g0.b3.x, 9)
    expect(g.a3.z).toBeCloseTo(g0.b3.z, 9)
  })

  it('지우고 다시 그으면 그것이 첫 선이 된다 (2-c)', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    const first = s.draw(500, 500, 600, 475)!
    expect(s.app.lift.anchorId).toBe(first.id)
    // 그 획을 문서에서 뺀다 → 3D가 된 획이 하나도 없다 → 다음 것이 첫 선이다
    s.app.doc.strokes = s.app.doc.strokes.filter(x => x.id !== first.id)
    const b2 = builder()
    b2.doc.strokes = s.app.doc.strokes
    const again = liftAll(b2.doc)
    expect(again.lifted.size).toBe(0)
    const s2 = session(1200, 800)
    s2.draw(...HZ)
    const other = s2.draw(400, 550, 700, 550)! // 이번엔 수평선이 첫 선
    expect(s2.app.lift.anchorId).toBe(other.id)
    const g = s2.app.lift.lifted.get(other.id)!
    expect(ground(g.a3.y) && ground(g.b3.y)).toBe(true)
  })

  it('지평선은 3D 선이 아니다 (2-f)', () => {
    const s = session(1200, 800)
    const hz = s.draw(...HZ)!
    s.draw(500, 500, 600, 475)
    expect(s.app.lift.lifted.has(hz.id)).toBe(false)
    expect(s.app.lift.waiting).not.toContain(hz.id)
    expect(s.app.lift.an.roles.get(hz.id)).toBe('horizon')
  })

  it('반례: 지평선 위에서 시작하면 지면과 안 만난다 — 대기', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    // 지평선(y=400)보다 위 — 광선이 위로 가서 지면과 영영 안 만난다
    const v = s.draw(500, 300, 500, 200)!
    expect(s.app.lift.waiting).toContain(v.id)
    expect(s.app.lift.lifted.has(v.id)).toBe(false)
  })

  it('반례: 게이지 평면은 없어졌다 — 첫 선의 깊이가 f에 안 묶인다', () => {
    // 옛 규칙은 첫 앵커를 z=−f에 놓았다. 화면 위치를 바꾸면 깊이도 따라 바뀌어야 한다.
    const near = session(1200, 800); near.draw(...HZ); near.draw(400, 700, 700, 700)
    const far = session(1200, 800); far.draw(...HZ); far.draw(400, 450, 700, 450)
    const zn = [...near.app.lift.lifted.values()][0]!.a3.z
    const zf = [...far.app.lift.lifted.values()][0]!.a3.z
    const f = analyze(near.app.doc).f!
    expect(Math.abs(zn - zf)).toBeGreaterThan(1)   // 깊이가 화면 높이에 반응한다
    expect(Math.abs(zn + f)).toBeGreaterThan(1)    // −f에 안 묶여 있다
    expect(Math.abs(zf)).toBeGreaterThan(Math.abs(zn)) // 지평선에 가까울수록 멀다
  })
})
