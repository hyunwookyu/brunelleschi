// web2-17 — 새 진입로 팔 (1-e ②~⑥ · 1-c).
//
// 지평선은 상시(문서 y = H/2)다. 사람은 긋지 않는다 — 팬으로 눈높이를 선언하고
// 첫 획부터 내용을 그린다. 남는 진입로 셋이 전부 사람의 관측 그대로 선다:
//   화면 수평 획 = 1점 선언 · 서로 다른 대각선 둘 = 2점 · 지평선 탭 = 소실점.
//
// 반증(D-3)은 코드 손잡이가 아니라 **실제 실행**으로 확인했다(NOTES web2-17 절):
//   · horizonDocY를 H/2+50으로 바꾸면 ②가 실패한다(빈 문서 지평선 위치)
//   · classifyNext의 screenHDeclared 설정을 빼면 ④가 실패한다(p1 잠금이 안 선다)

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { analyze, horizonDocY, frameAxes, DRAW_POSE, horizonScreenY } from '../src/core/camera'
import type { V3 } from '../src/core/vec'

const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z

describe('1-e ② — 지평선은 상시다', () => {
  it('빈 문서 — 지평선 화면 y = H/2 정확히 (H를 흔든다 — ㉣ 0이 아닌 격자)', () => {
    for (const H of [800, 900, 641]) {
      const s = session(1200, H)
      expect(horizonScreenY(s.app.lift.an, DRAW_POSE)).toBe(H / 2)
      expect(horizonDocY(H)).toBe(H / 2)
    }
  })
})

describe('1-e ③ — 방 실루엣 진입로 (수평 바닥 → 좌우 수직 → 상단 수평)', () => {
  it('대기 0 · screenHDeclared 참 · vps 0 · 3D 벽 하나', () => {
    const s = session(1200, 800)
    const bottom = s.draw(300, 650, 900, 650)!
    const left = s.draw(300, 650, 300, 450)!
    const right = s.draw(900, 650, 900, 450)!
    const top = s.draw(300, 450, 900, 450)!
    expect(s.app.lift.waiting).toEqual([])
    expect(s.app.lift.an.screenHDeclared).toBe(true)
    expect(s.app.lift.an.vps).toHaveLength(0)
    // 벽 하나 — 바닥은 지면(Y=0), 기둥 둘은 같은 높이로 서고, 상단이 그 꼭대기를 잇는다
    const gb = s.app.lift.lifted.get(bottom.id)!
    const gl = s.app.lift.lifted.get(left.id)!
    const gr = s.app.lift.lifted.get(right.id)!
    const gt = s.app.lift.lifted.get(top.id)!
    expect(Math.abs(gb.a3.y)).toBeLessThan(1e-9)
    expect(Math.abs(gb.b3.y)).toBeLessThan(1e-9)
    expect(gl.b3.y).toBeGreaterThan(0)
    expect(gl.b3.y).toBeCloseTo(gr.b3.y, 9)          // 같은 높이
    expect(gt.a3.y).toBeCloseTo(gl.b3.y, 9)          // 상단이 꼭대기 높이에 있다
    expect(gt.b3.y).toBeCloseTo(gr.b3.y, 9)
    // 한 평면(화면 평행 벽) — z가 넷 다 같다
    for (const g of [gl, gr, gt]) {
      expect(g.a3.z).toBeCloseTo(gb.a3.z, 9)
      expect(g.b3.z).toBeCloseTo(gb.a3.z, 9)
    }
  })
})

describe('1-e ④ — 1점 잠금 (방 실루엣 + 후퇴 대각선)', () => {
  it('vps 1 · p1Locked 참 · 축 {vp0,H,V}가 서로 직교(내적 3개를 값으로 남긴다)', () => {
    const s = session(1200, 800)
    s.draw(300, 650, 900, 650)
    s.draw(300, 650, 300, 450)
    s.draw(900, 650, 900, 450)
    s.draw(300, 450, 900, 450)
    const d = s.draw(300, 650, 420, 600)!             // 후퇴 대각선 → vp0 (900,400)
    const an = s.app.lift.an
    expect(an.roles.get(d.id)).toBe('vp')
    expect(an.vps).toHaveLength(1)
    expect(an.vps[0]!.x).toBeCloseTo(900, 6)
    expect(an.p1Locked).toBe(true)
    expect(an.constructionDone).toBe(true)
    const fr = frameAxes(an)!
    expect(fr.map(a => a.id).sort()).toEqual(['H', 'V', 'vp0'])
    const dots = [
      dot3(fr[0]!.dir, fr[1]!.dir),
      dot3(fr[0]!.dir, fr[2]!.dir),
      dot3(fr[1]!.dir, fr[2]!.dir),
    ]
    console.log(`[측정] 1-e ④ 내적 셋: ${dots.map(d => d.toExponential(3)).join(' · ')}`)
    for (const dd of dots) expect(Math.abs(dd)).toBeLessThan(1e-12)
    // 잠긴 뒤 두 번째 소실점은 못 만든다(P1 불가역 — D-L53)
    const d2 = s.draw(300, 650, 180, 600)!
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.roles.get(d2.id)).toBe('content')
  })
})

describe('1-e ⑤ — 2점: 빈 문서에서 서로 다른 대각선 둘', () => {
  it('vps 2 · f² = |PV₁||PV₂| (양변을 값으로 남긴다)', () => {
    const s = session(1200, 800)
    s.draw(500, 650, 680, 537.5)                      // → vp0 (900,400)
    s.draw(500, 650, 320, 537.5)                      // → vp1 (100,400)
    const an = s.app.lift.an
    expect(an.vps).toHaveLength(2)
    expect(an.fSource).toBe('two-vp')
    const u1 = Math.abs(an.vps[0]!.x - an.principal!.x)
    const u2 = Math.abs(an.vps[1]!.x - an.principal!.x)
    console.log(`[측정] 1-e ⑤ f² = ${(an.f! * an.f!).toFixed(6)} · |PV₁||PV₂| = ${(u1 * u2).toFixed(6)}`)
    expect(an.f! * an.f!).toBeCloseTo(u1 * u2, 6)
    expect(s.app.lift.waiting).toEqual([])            // 두 대각선 다 지면에 올라간다(makesVp)
  })
})

describe('1-e ⑥ — 기존 방식 회귀: 화면 수평 획(지평선 따라긋기) → 대각선 → 대각선', () => {
  it('⑤와 같은 상태로 수렴한다 — 따라긋기 획은 아무것도 선언하지 않는다(퇴화)', () => {
    // 옛 손버릇: 지평선을 «긋고» 시작한다. 그 획은 이제 상시 지평선(H/2=400) 위의
    // 퇴화 획이다 — 1점 선언(screenH)도, 소실점도 만들지 않는다. 뒤의 대각선 둘이
    // 종전대로 2점을 세운다. (지평선 밖의 화면 수평 획은 ③④대로 1점 선언이다.)
    const a = session(1200, 800)
    const hz = a.draw(100, 400, 1100, 400)!
    a.draw(500, 650, 680, 537.5)
    a.draw(500, 650, 320, 537.5)
    const b = session(1200, 800)                      // ⑤의 경로(따라긋기 없음)
    b.draw(500, 650, 680, 537.5)
    b.draw(500, 650, 320, 537.5)
    const anA = a.app.lift.an, anB = b.app.lift.an
    expect(anA.screenHDeclared).toBe(false)
    expect(anA.p1Locked).toBe(false)
    expect(anA.vps.map(v => v.x)).toEqual(anB.vps.map(v => v.x))
    expect(anA.f).toBe(anB.f)
    expect(anA.fSource).toBe('two-vp')
    // 대각선 둘의 3D도 같다 — 따라긋기 획이 기하에 아무 영향이 없다
    const gA = [...a.app.lift.lifted.values()].map(g => [g.a3, g.b3])
    const gB = [...b.app.lift.lifted.values()].map(g => [g.a3, g.b3])
    expect(gA.length).toBe(gB.length)
    for (let i = 0; i < gA.length; i++) {
      for (const j of [0, 1] as const) {
        for (const k of ['x', 'y', 'z'] as const) {
          expect(Math.abs(gA[i]![j]![k] - gB[i]![j]![k])).toBeLessThan(1e-9)
        }
      }
    }
    // 따라긋기 획 자신은 대기(사유 있음 — 1-c 규약)로 남는다
    expect(a.app.lift.waiting).toEqual([hz.id])
    expect(a.app.lift.waitWhy.get(hz.id)).toBe('aboveHorizon')
  })
})

describe('진입로 — 지평선 탭 = 소실점 (빈 문서에서 바로)', () => {
  it('빈 문서에서 지평선 근처를 탭하면 소실점이 선다', () => {
    const s = session(1200, 800)
    s.draw(700, 403, 700, 403)                        // 손 오차 3px — 지평선 위로 붙는다
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.vps[0]!.x).toBe(700)
    expect(s.app.lift.an.vps[0]!.y).toBe(400)
  })

  it('반례: 지평선에서 먼 탭은 종전대로 잡음이다', () => {
    const s = session(1200, 800)
    const st = s.draw(700, 500, 700, 500)
    expect(st).toBeNull()
    expect(s.app.doc.strokes).toHaveLength(0)
  })
})

describe('1-c — 첫 획이 지평선 위에서 시작하면 조용히 죽지 않는다', () => {
  it('올려다보는 첫 획 — 대기 + 사유 aboveHorizon이 남는다', () => {
    const s = session(1200, 800)
    const v = s.draw(500, 300, 500, 200)!             // 지평선(400) 위쪽 — 지면과 못 만난다
    expect(s.app.lift.waiting).toContain(v.id)
    expect(s.app.lift.waitWhy.get(v.id)).toBe('aboveHorizon')
  })

  it('반례: 지평선 아래 첫 획은 사유 없이 그냥 올라간다', () => {
    const s = session(1200, 800)
    const v = s.draw(500, 650, 500, 500)!
    expect(s.app.lift.lifted.has(v.id)).toBe(true)
    expect(s.app.lift.waitWhy.size).toBe(0)
  })
})
