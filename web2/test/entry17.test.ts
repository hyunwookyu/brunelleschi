// web2-17 — 새 진입로 팔 (1-e ②~⑥ · 1-c).
//
// 지평선은 상시(문서 y = H/2)다. 사람은 긋지 않는다 — 팬으로 눈높이를 선언하고
// 첫 획부터 내용을 그린다. 남는 진입로 셋이 전부 사람의 관측 그대로 선다:
//   화면 수평 획 = 1점 선언 · 서로 다른 대각선 둘 = 2점 · 지평선 탭 = 소실점.
//
// 반증(D-3)은 코드 손잡이가 아니라 **실제 실행**으로 확인했다(NOTES web2-17 절):
//   · horizonDocY를 H/2+50으로 바꾸면 ②가 실패한다(빈 문서 지평선 위치)
//   · classifyNext의 screenHDeclared 설정을 빼면 ④가 실패한다(p1 잠금이 안 선다)

import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { analyze, horizonDocY, frameAxes, DRAW_POSE, horizonScreenY } from '../src/core/camera'
import { C } from '../src/core/constants'
import type { V3 } from '../src/core/vec'

const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z

// 원장 — 이 파일의 측정을 stage0/out에 남긴다(§5 · 2차 리뷰어 [10]). 매 실행 다시 써진다.
const ledger: Record<string, unknown> = {
  what: 'web2-17 1-e ②~⑥·경계 팔의 측정 — entry17.test.ts가 매 실행 다시 쓴다. 문서는 필드 이름만 인용(#47).',
  flags_explained: {
    'axis_dots=0': '1점 주점 보정의 구성적 결과(설계 보장) — 0 아닌 입력의 직교는 axes.test가 잰다',
    'two_vp.f2': 'f² = |PV₁||PV₂|는 정의의 항등(설계 보장) — 임계를 안 건다(#37)',
  },
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/entry17_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

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
    ledger['room_silhouette'] = {
      waiting: s.app.lift.waiting.length, screenHDeclared: s.app.lift.an.screenHDeclared,
      vps: s.app.lift.an.vps.length, lifted: s.app.lift.lifted.size,
      wall_height_3d: gl.b3.y, wall_z: gb.a3.z,
    }
    console.log(`[측정] 1-e ③ — 대기 0 · screenH 참 · vps 0 · 벽 높이 ${gl.b3.y.toFixed(6)} · z ${gb.a3.z.toFixed(6)}`)
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
    // ⚠ 이 0은 1점 주점 보정(principal.x = vp0.x)의 구성적 결과이기도 하다 — 0이 아닌
    // 입력의 직교는 axes.test 「소실점을 화면 어디에 두든 직교다」(vpx 8자리)가 지킨다.
    ledger['p1_lock'] = { vps: an.vps.length, p1Locked: an.p1Locked, axis_dots: dots }
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
    // ⚠ f² = |PV₁||PV₂|는 **정의의 항등**이다(f가 그 곱의 제곱근으로 계산된다 — #37·
    //   §5.1 유형 3). 지시가 양변을 값으로 적으라 해 남기되, 판정력은 vps 좌표·fSource에
    //   있다 — 원장에도 «설계 보장»으로 적는다.
    console.log(`[측정] 1-e ⑤ f² = ${(an.f! * an.f!).toFixed(6)} · |PV₁||PV₂| = ${(u1 * u2).toFixed(6)} (항등 — 판정은 vps·fSource)`)
    ledger['two_vp'] = { vps: an.vps.map(v => ({ x: v.x, y: v.y })), f: an.f, fSource: an.fSource,
      f2_identity_note: 'f² = |PV₁||PV₂|는 구성상 항등(설계 보장) — 임계를 안 건다' }
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
    expect(a.app.lift.waitWhy.get(hz.id)).toBe('onHorizon')   // 따라긋기 — 위쪽과 가른다(#43)
  })
})

describe('퇴화 대역의 경계 — |y − H/2| ≤ OSNAP_RADIUS_PX가 «퇴화 대 1점 선언»을 가른다', () => {
  // 2차 리뷰어 [4] — 이 경계가 이제 «P1 불가역 잠금 대 대기»를 가르므로 양쪽을 값으로
  // 잰다. 대역 자체는 동작점 하나다(#12 — «지평선 위인가»의 기존 임계 재사용. 실기기에서
  // 손이 지평선을 따라 그을 때 8px 안에 드는가는 DEFERRED 실기기 표가 최종).
  it('경계 안(≤8px) = 퇴화 · 경계 밖(≥9px) = 1점 선언 — 양쪽에서 플립한다', () => {
    const results: { off: number; declared: boolean }[] = []
    for (const off of [0, 3, 7, 8, 9, 12, 20]) {
      const s = session(1200, 800)
      s.draw(300, 400 + off, 800, 400 + off)          // 화면 수평 획(축 스냅이 정확 수평으로)
      results.push({ off, declared: s.app.lift.an.screenHDeclared })
    }
    ledger['band_boundary'] = { radius_px: C.OSNAP_RADIUS_PX, results }
    console.log(`[측정] 퇴화 경계 — ${results.map(r => `${r.off}px:${r.declared ? '선언' : '퇴화'}`).join(' · ')}`)
    for (const r of results) {
      expect(r.declared, `off=${r.off}`).toBe(r.off > C.OSNAP_RADIUS_PX)
    }
    // 경계 밖 선언은 그대로 P1 잠금으로 이어진다(불가역 — 위 ④의 규칙과 같다)
    const s = session(1200, 800)
    s.draw(300, 410, 800, 410)                        // 대역 밖 10px — 1점 선언
    s.draw(300, 650, 420, 600)                        // 후퇴 대각선 → vps 1 → 잠금
    expect(s.app.lift.an.p1Locked).toBe(true)
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
  // ⚠⚠ **web2-27 1번이 이 자리의 답을 바꿨다.** 사람의 요구(「조용히 죽지 않는다」)는
  //    그대로 유효하고, 답이 「대기 + 사유」에서 「**천장에 놓인다**」로 갈렸다.
  //    사용자가 낸 규칙(지평선 기준 mirror)의 기하학적 정체가 `pointOnCeiling`이다.
  //    사유가 남는 자리는 이제 **걸치는 선**뿐이다(정의상 불가능) — 아래 둘째 팔.
  it('올려다보는 첫 획 — **천장에 놓인다**(종전: 대기 + aboveHorizon)', () => {
    const s = session(1200, 800)
    const v = s.draw(500, 300, 500, 200)!             // 지평선(400) 위쪽 세로선
    expect(s.app.lift.lifted.has(v.id)).toBe(true)
    expect(s.app.lift.waitWhy.has(v.id)).toBe(false)
    const seg = s.app.lift.lifted.get(v.id)!
    // 위 끝이 천장 평면에 앉는다 — 값의 근거는 `ceiling27.test.ts`가 정본이다
    expect(Math.max(seg.a3.y, seg.b3.y)).toBeCloseTo(2 * C.EYE_HEIGHT, 6)
  })

  it('걸치는 선(깊이 축)은 접지되지 않고 **사유가 남는다** — 정의상 불가능이다', () => {
    // 빈 문서에 지평선을 가로지르는 대각선 — 소실점을 만들고(role 'vp') 그 축은 vp0다.
    // 방향의 y가 0이므로 선 전체가 한 수평면인데 그 평면이 곧 눈높이다 → 무한대.
    // ⚠ 이것이 **조용히 틀린 배치**의 실제 모습이었다: 수리 전에는 `s.a`만 보고 지면에
    //   앉아 **눈 뒤까지 뻗는 선분**이 됐다(실측 z −16.704 → +16.704 — 눈이 원점이다).
    const s = session(1200, 800)
    const st = s.draw(400, 500, 800, 300)!
    expect(s.app.lift.an.roles.get(st.id)).toBe('vp')      // 소실점은 그대로 선다
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.lifted.has(st.id)).toBe(false)       // 접지되지 않는다
    expect(s.app.lift.waitWhy.get(st.id)).toBe('straddle') // 이유가 남는다(조용하지 않다)
  })

  it('반례: 지평선 아래 첫 획은 사유 없이 그냥 올라간다', () => {
    const s = session(1200, 800)
    const v = s.draw(500, 650, 500, 500)!
    expect(s.app.lift.lifted.has(v.id)).toBe(true)
    expect(s.app.lift.waitWhy.size).toBe(0)
  })
})
