// web2-19 1부 — 파선 ✕ 예고의 **좌표 정본 팔**(회귀 ②).
// resolveEnd가 낸 draft.vp가 «획 연장 ∩ 지평선»과 정확히 같은가를 **독립 산술**로 대조한다
// (classifyNext를 다시 불러 견주면 자기참조다 — 기대값은 테스트가 직선 방정식으로 직접 푼다).
//
// 반증(D-3): 소실점을 안 만드는 획(화면 평행·짧은 획)에서는 vp가 **없어야** 한다 —
// 있으면 예고가 거짓말을 하는 것이다.

import { describe, it, expect } from 'vitest'
import { createApp } from '../src/app/state'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { C } from '../src/core/constants'
import type { Pt } from '../src/core/vec'

const W = 1200, H = 800
const HZ = H / 2                       // 지평선 = 프레임 상수(web2-17 1부)

function endOf(app: ReturnType<typeof createApp>, a: Pt, b: Pt) {
  const set = { ...app.osnap, radius: app.osnap.radius / app.view.s }
  const oh = resolveStart(app.lift, app.pose, a, set)
  const start = oh ? oh.p : a
  return { start, r: resolveEnd(app.lift, app.pose, app.lift.an, start, { p3: oh?.p3 ?? null }, b, set) }
}

describe('web2-19 1부 ② — 파선 ✕ 좌표', () => {
  it('vp 정의선의 draft.vp = 획 연장 ∩ 지평선 (독립 산술 대조)', () => {
    const app = createApp(W, H)
    // e2e 픽스처와 다른 수(자기복제 방지): (430, 620) → (730, 540) — 기울어 올라가는 획
    const a = { x: 430, y: 620 }, b = { x: 730, y: 540 }
    const { start, r } = endOf(app, a, b)
    expect(r.label).toBe('vp')
    expect(r.vp).toBeDefined()
    // 독립 산술 — 직선 (start→b)를 y=HZ까지 연장: x = sx + (HZ−sy)·(bx−sx)/(by−sy)
    const ex = start.x + (HZ - start.y) * (b.x - start.x) / (b.y - start.y)
    expect(Math.abs(r.vp!.x - ex)).toBeLessThan(1e-9)
    expect(Math.abs(r.vp!.y - HZ)).toBeLessThan(1e-9)
    // 원칙 d — 이 좌표가 확정 시 vps에 들어갈 값 그대로인가는 아래 둘째 팔이 커밋해 대조.
  })

  // ⚠ **이 등식은 측정이 아니라 구성 보장이다**(§5.1 자기참조 유형 3 — 1차 리뷰 [16]):
  // vp 갈래의 확정 끝점은 커서 그대로이고(resolveCommit이 안 바꾼다) analyze가 같은
  // 입력을 다시 분류하므로, 지금 배선에서는 같을 수밖에 없다. 이 팔의 몫은 값 임계가
  // 아니라 **배선 회귀 채널**이다 — 미리보기와 확정 경로가 앞으로 갈라지면(끝점 다듬기
  // 등) 여기서 걸린다. 그래서 원장에 안 싣고 임계도 안 건다.
  it('예고가 그대로 확정된다 — 커밋 후 vps[0] == draft.vp (구성 보장의 배선 채널 · 원칙 d)', async () => {
    const { session } = await import('./session')
    const s = session(W, H)
    const app = s.app
    const a = { x: 430, y: 620 }, b = { x: 730, y: 540 }
    const { r } = endOf(app, a, b)
    expect(r.vp).toBeDefined()
    s.draw(a.x, a.y, b.x, b.y)
    expect(app.lift.an.vps.length).toBe(1)
    expect(Math.abs(app.lift.an.vps[0]!.x - r.vp!.x)).toBeLessThan(1e-9)
    expect(Math.abs(app.lift.an.vps[0]!.y - r.vp!.y)).toBeLessThan(1e-9)
  })

  it('반증 — 소실점을 안 만드는 획에는 vp가 없다', () => {
    const app = createApp(W, H)
    // 화면 평행 가로(처짐 0) — content(H 선언)
    const h = endOf(app, { x: 300, y: 560 }, { x: 700, y: 560 })
    expect(h.r.label).not.toBe('vp')
    expect(h.r.vp).toBeUndefined()
    // 소실점 최소 길이 미만(kL < VP_MIN_LEN_RATIO·diag)의 기운 획 — 짧아서 content
    const diag = Math.hypot(W, H)
    const L = C.VP_MIN_LEN_RATIO * diag * 0.6
    const sh = endOf(app, { x: 500, y: 600 }, { x: 500 + L * 0.96, y: 600 - L * 0.28 })
    expect(sh.r.label).not.toBe('vp')
    expect(sh.r.vp).toBeUndefined()
  })
})
