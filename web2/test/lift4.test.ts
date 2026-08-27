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
  // web2 원장 규약(xint의 선례): 이 측정이 의존하는 상수를 그대로 싣는다 — 값이 바뀌면
  // 이 원장의 수치가 낡은 것이다(등록부 밖 STALE의 대체 — 2차 [4]).
  constants: { HEIGHTLESS_Y: C.HEIGHTLESS_Y, TAP_MAX_PX: C.TAP_MAX_PX, STRAY_MIN_PX: C.STRAY_MIN_PX },
  flags_explained: {
    'ground_residual_max_y': '지면 규칙이 놓은 Y의 fp 잔차 — 임계와의 간격이 판정이다(#35). 값의 성격은 residual_sweep가 든다',
  },
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/ground_rule_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

/** 소실점을 찍고 시작하는 장면 — vp 탭 + 그 축의 지면선 하나.
 *  ⚠ 좌표에 손 오차를 심었다(#68 · 2차 [6]) — 탭은 3px 어긋나고(지평선 스냅이 y만
 *  잡는다) 획의 시작점·겨냥은 비정수·수 px 오차다(축 스냅이 방향을 바로잡는 것까지가
 *  실사용 경로다). 이상적 좌표로만 돌면 «도달 불가»가 통과로 남는다. */
function tapped(): Session {
  const s = session(1200, 800)
  s.draw(899.4, 402.6, 899.4, 402.6)            // 탭 = 소실점(손 오차 — y는 지평선으로 스냅)
  s.draw(501.3, 651.8, 662.7, 548.2)            // vp0 축 지면선(겨냥 오차 — 축 스냅이 눕힌다)
  return s
}

describe('4-b ① — 소실점을 찍고, 거기서 뻗은(안 닿는) 선이 지면선으로 3D가 된다', () => {
  it('둘째·셋째 소실점 축 선이 연결 없이 올라간다 — 전부 Y=0', () => {
    const s = tapped()
    const d2 = s.draw(201.6, 702.3, 341.9, 638.4)!  // vp0 축 — 첫 선과 안 닿는다(손 오차)
    const d3 = s.draw(759.2, 621.7, 821.4, 576.3)!  // vp0 축 — 역시 안 닿는다
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.lifted.has(d2.id)).toBe(true)
    expect(s.app.lift.lifted.has(d3.id)).toBe(true)
    expect(s.app.lift.waiting).toEqual([])
    let maxY = 0
    for (const [, g] of s.app.lift.lifted) maxY = Math.max(maxY, Math.abs(g.a3.y), Math.abs(g.b3.y))
    ledger['ground_residual_max_y'] = maxY
    ledger['ground_scene'] = { lifted: s.app.lift.lifted.size, waiting: s.app.lift.waiting.length, waitWhy: [...s.app.lift.waitWhy.values()] }
    console.log(`[측정] 4부 ① — 지면 국면 3획 전부 3D · Y 잔차 최대 ${maxY.toExponential(3)} (임계 ${C.HEIGHTLESS_Y})`)
    expect(maxY).toBeLessThan(C.HEIGHTLESS_Y)   // 잔차 대역 — 임계 아래
  })

  it('잔차 스윕(2차 [2] — ㉣): 비정수·손 오차 격자 40에서 잔차가 0이 아니고, 임계 아래다', () => {
    // 정수 한 점의 «정확히 0»은 임계 1e-6의 자리를 못 잰다 — 시작 y·겨냥을 흔들어
    // pointOnGround의 fp 왕복이 실제로 잔차를 내는 격자를 만든다(1차 [7]의 처방을
    // 이 측정에도 적용). 잔차의 실측 대역과 임계 사이의 자릿수가 판정이다.
    let maxY = 0, nonZero = 0, n = 0
    for (let i = 0; i < 40; i++) {
      const s = session(1200, 800)
      const y0 = 520.37 + i * 6.913                 // 비정수 시작 높이(지평선 아래)
      const x0 = 180.21 + i * 17.77
      s.draw(x0, y0, x0 + 173.3, y0 - 61.7)         // 대각선 → 소실점(그어서) — 지면(makesVp)
      const g = [...s.app.lift.lifted.values()][0]
      if (!g) continue
      n++
      const r = Math.max(Math.abs(g.a3.y), Math.abs(g.b3.y))
      maxY = Math.max(maxY, r)
      if (r > 0) nonZero++
    }
    ledger['residual_sweep'] = {
      n, non_zero: nonZero, max_abs_y: maxY,
      threshold: C.HEIGHTLESS_Y,
      margin_orders: maxY > 0 ? Math.log10(C.HEIGHTLESS_Y / maxY) : null,
      note: '잔차가 0이 아닌 격자(㉣) — 임계 1e-6은 이 대역과 실제 높이(0.8대) 사이에 선다',
    }
    console.log(`[측정] 4부 잔차 스윕 — n ${n} · 0 아님 ${nonZero} · 최대 ${maxY.toExponential(3)} · 임계와 ${maxY > 0 ? Math.log10(C.HEIGHTLESS_Y / maxY).toFixed(1) : '∞'}자릿수`)
    expect(n).toBeGreaterThan(30)
    expect(nonZero).toBeGreaterThan(0)              // 격자가 0이 아닌 값을 낼 수 있다(㉣)
    expect(maxY).toBeLessThan(C.HEIGHTLESS_Y)       // 그리고 전부 임계 아래 — 자리가 실측됐다
  })
})

describe('4-b ② — 수직선이 서면 규칙이 꺼진다', () => {
  it('높이가 생긴 뒤의 소실점 축 선은 대기 — 사유 hasHeight', () => {
    const s = tapped()
    const col = s.draw(501.3, 651.8, 502.4, 521.1)!  // 첫 선 모서리에서 기둥(손 오차 — 시작 오스냅·V 스냅)
    const top = s.app.lift.lifted.get(col.id)!
    const h = Math.max(Math.abs(top.a3.y), Math.abs(top.b3.y))
    expect(h).toBeGreaterThan(C.HEIGHTLESS_Y)   // #35 — 임계 위의 실제 높이(0이 아닌 격자)
    const d = s.draw(250, 720, 420, 637)!       // vp0 축 — 아무것에도 안 닿는다
    expect(s.app.lift.lifted.has(d.id)).toBe(false)
    expect(s.app.lift.waiting).toContain(d.id)
    expect(s.app.lift.waitWhy.get(d.id)).toBe('hasHeight')
    ledger['height_scene'] = {
      column_top_y: h, over_threshold_ratio: h / C.HEIGHTLESS_Y,
      waiting: s.app.lift.waiting.length, waitWhy: [...s.app.lift.waitWhy.values()],
    }
    console.log(`[측정] 4부 ② — 기둥 높이 ${h.toFixed(6)}(임계의 ${(h / C.HEIGHTLESS_Y).toExponential(2)}배) · 규칙 꺼짐 · 사유 hasHeight`)
  })

  it('판별자 ②(2차 [5]) — 비축 대기 획이 섞이면 규칙이 안 돌고, 사유 mixedWait가 남는다', () => {
    const s = tapped()
    const free = s.draw(900.2, 401.1, 700.4, 631.7)!  // 소실점 살 — 축 미정 대기
    const d = s.draw(250, 720, 420, 637)!             // vp0 축 — 높이는 없지만 대기가 섞였다
    expect(s.app.lift.lifted.has(d.id)).toBe(false)
    expect(s.app.lift.waitWhy.get(d.id)).toBe('mixedWait')
    expect(s.app.lift.waiting).toContain(free.id)
    // 합 = 전체 검산(#43·2차 [5]) — 대기 전부에 사유가 있거나 축 미정(살)이다
    ledger['mixed_scene'] = {
      waiting: s.app.lift.waiting.length,
      reasons: [...s.app.lift.waitWhy.values()],
    }
  })

  it('③ ②의 대기선이 교점(xint)으로 정의되면 승격한다 — web2-15 경로 회귀', () => {
    const s = tapped()
    s.draw(501.3, 651.8, 502.4, 521.1)          // 기둥 — 규칙 꺼짐
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
