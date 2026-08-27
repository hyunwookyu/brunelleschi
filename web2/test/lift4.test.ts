// web2-17 4부 — 지면 규칙 확대: **모델에 높이가 아직 없을 때, 소실점 축의 선은 지면선이다.**
// (web2-16 4-a 계승 — 소실점이 이미 있는 자리에서 뻗은 선이 영영 대기하던 자리를 연다.)
//
// 반증(D-3 — 실제 실행, NOTES 4부 절): 높이 판정을 뒤집으면(높이가 있을 때만 지면)
// ①이 실패한다. #35(아무것도 안 거르는 방어층) 확인: 지면 국면의 Y 잔차와 실제 높이가
// HEIGHTLESS_Y(1e-6)의 양쪽에 실측으로 갈린다 — 규칙이 ②에서 실제로 꺼진다.

import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session, type Session } from './session'
import { isStray } from '../src/core/draft'
import { C } from '../src/core/constants'

const ledger: Record<string, unknown> = {
  what: 'web2-17 4부(지면 규칙 확대)의 측정 — 지면 국면 Y 잔차 대 실제 높이, 규칙 온·오프. lift4.test.ts가 매 실행 다시 쓴다.',
  flags_explained: {
    'ground_residual_max_y': '지면 규칙이 놓은 Y의 fp 잔차 — 0이 아니어야 임계(1e-6)가 실제로 무언가를 가른다(#35). 정확히 0이면 그 사실을 note로 남긴다',
  },
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/ground_rule_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

/** 소실점을 찍고 시작하는 장면 — vp(900,400) 탭 + 그 축의 지면선 하나 */
function tapped(): Session {
  const s = session(1200, 800)
  s.draw(900, 400, 900, 400)                    // 탭 = 소실점
  s.draw(500, 650, 660, 550)                    // vp0 축 지면선(첫 선 — 종전 규칙으로도 지면)
  return s
}

describe('4-b ① — 소실점을 찍고, 거기서 뻗은(안 닿는) 선이 지면선으로 3D가 된다', () => {
  it('둘째·셋째 소실점 축 선이 연결 없이 올라간다 — 전부 Y=0', () => {
    const s = tapped()
    const d2 = s.draw(200, 700, 340, 640)!      // vp0 축 — 첫 선과 안 닿는다
    const d3 = s.draw(760, 620, 820, 577)!      // vp0 축 — 역시 안 닿는다
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.lifted.has(d2.id)).toBe(true)
    expect(s.app.lift.lifted.has(d3.id)).toBe(true)
    expect(s.app.lift.waiting).toEqual([])
    let maxY = 0
    for (const [, g] of s.app.lift.lifted) maxY = Math.max(maxY, Math.abs(g.a3.y), Math.abs(g.b3.y))
    ledger['ground_residual_max_y'] = maxY
    if (maxY === 0) {
      // 구성적 0의 해명(#35·§5.1): pointOnGround의 u = −p.y/d.y 곱셈이 이 격자에서
      // 정확히 상쇄된다(1.6 + d.y·(−1.6/d.y) — fp 왕복이 우연히 무손실). 임계(1e-6)가
      // 실제로 가르는 것은 «실제 높이»(② — 임계의 10⁵배)이고, 0 자체에 임계를 안 건다.
      ledger['ground_residual_note'] = '정확히 0 — pointOnGround의 −p.y/d.y·d.y 왕복이 이 격자에서 무손실(구성). 판별은 ②의 실제 높이(임계 10⁵배)가 진다'
    }
    ledger['ground_scene'] = { lifted: s.app.lift.lifted.size, waiting: 0 }
    console.log(`[측정] 4부 ① — 지면 국면 3획 전부 3D · Y 잔차 최대 ${maxY.toExponential(3)} (임계 ${C.HEIGHTLESS_Y})`)
    expect(maxY).toBeLessThan(C.HEIGHTLESS_Y)   // 잔차 대역 — 임계 아래
  })
})

describe('4-b ② — 수직선이 서면 규칙이 꺼진다', () => {
  it('높이가 생긴 뒤의 소실점 축 선은 대기 — 사유 hasHeight', () => {
    const s = tapped()
    const col = s.draw(500, 650, 500, 520)!     // 첫 선 모서리에서 기둥 — 높이가 선다
    const top = s.app.lift.lifted.get(col.id)!
    const h = Math.max(Math.abs(top.a3.y), Math.abs(top.b3.y))
    expect(h).toBeGreaterThan(C.HEIGHTLESS_Y)   // #35 — 임계 위의 실제 높이(0이 아닌 격자)
    const d = s.draw(250, 720, 420, 637)!       // vp0 축 — 아무것에도 안 닿는다
    expect(s.app.lift.lifted.has(d.id)).toBe(false)
    expect(s.app.lift.waiting).toContain(d.id)
    expect(s.app.lift.waitWhy.get(d.id)).toBe('hasHeight')
    ledger['height_scene'] = { column_top_y: h, waiting_reason: 'hasHeight' }
    console.log(`[측정] 4부 ② — 기둥 높이 ${h.toFixed(6)}(임계의 ${(h / C.HEIGHTLESS_Y).toExponential(2)}배) · 규칙 꺼짐 · 사유 hasHeight`)
  })

  it('③ ②의 대기선이 교점(xint)으로 정의되면 승격한다 — web2-15 경로 회귀', () => {
    const s = tapped()
    s.draw(500, 650, 500, 520)                  // 기둥 — 규칙 꺼짐
    const d = s.draw(250, 720, 420, 637)!       // 대기선(vp0 축 · 위치 미정)
    expect(s.app.lift.waiting).toContain(d.id)
    // 확정 기하(첫 선 모서리)에서 H 축으로 그어 **뗀 끝이 대기선 위** — 교점 정의(4-g)
    const cross = s.draw(500, 650, 393, 650)!
    expect(s.app.lift.lifted.has(cross.id)).toBe(true)
    expect(s.app.lift.lifted.has(d.id)).toBe(true)      // 승격했다
    expect(s.app.lift.waiting).toEqual([])
    expect(s.app.lift.waitWhy.size).toBe(0)             // 사유도 걷혔다
  })
})

describe('4-b ④ — 기존 방식(그어서 소실점을 만드는 길)이 그대로 돈다', () => {
  it('빈 문서에서 대각선 둘 — makesVp 규칙 그대로(겹침의 단일 출처 확인)', () => {
    const s = session(1200, 800)
    const d1 = s.draw(500, 650, 680, 537.5)!
    const d2 = s.draw(300, 700, 200, 662.5)!    // 서로 안 닿는 둘째 깊이선(vp1)
    expect(s.app.lift.an.vps).toHaveLength(2)
    expect(s.app.lift.lifted.has(d1.id)).toBe(true)
    expect(s.app.lift.lifted.has(d2.id)).toBe(true)
    expect(s.app.lift.waiting).toEqual([])
  })
})

describe('4-a — 틱은 획이 아니다: 이미 그렇다(확인 팔 — 문을 낮추지도 뚫지도 않는다)', () => {
  it('탭(끝점 이동 ≤ TAP_MAX_PX)은 STRAY 문에 닿지도 않는다 — bbox·문값과 무관', () => {
    // isStray = endDist > TAP_MAX && bbox < STRAY_MIN. 앞 항이 탭을 먼저 거르므로
    // STRAY_MIN을 20으로 올려도 탭은 산다(지시 4-b ⑤ — 상수를 실제로 바꾸는 대신
    // 조건 구조를 잰다: endDist ≤ 2에서는 bbox가 무엇이든 false다).
    for (const bbox of [0, 3, 5.9, 19, 50]) {
      expect(isStray(C.TAP_MAX_PX, bbox)).toBe(false)
      expect(isStray(0, bbox)).toBe(false)
    }
    // 대조군 — 탭이 아닌 짧은 획은 종전대로 걸린다/산다
    expect(isStray(C.TAP_MAX_PX + 1, C.STRAY_MIN_PX - 1)).toBe(true)
    expect(isStray(C.TAP_MAX_PX + 1, C.STRAY_MIN_PX + 10)).toBe(false)
  })

  it('지평선에서 먼 탭은 종전대로 잡음이다(resolveCommit — entry17 반례와 같은 문)', () => {
    const s = session(1200, 800)
    expect(s.draw(700, 600, 700, 600)).toBeNull()
  })
})
