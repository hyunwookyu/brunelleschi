// 1점 잠금 — 화면 수평선을 그은 이상 2점 투시일 수 없다 (지시 2)
//
// 근거는 이론서 2.2다: 화면 수평인 축은 그 소실점이 **무한원**에 있고, 그것이 1점 투시의
// 정의다. 그러면 세 축(화면 수평 H · 화면 수직 V · 깊이 소실점 하나)이 다 정해지므로
// **두 번째 수평 소실점이 생길 자리가 없다.** 그 뒤 그은 대각선은 자유 방향이거나 실수다.
//
// 되살려 확인(2026-08-21 실행): `p1Locked`를 상수 false로 두면 이 파일의 팔 **여섯**이
// 빨개진다(2점으로 전환되고 f가 two-vp가 된다). 잠금과 무관한 반례 팔 셋은 그대로 통과한다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { analyze, P1_LOCK_REASON } from '../src/core/camera'
import { C } from '../src/core/constants'
import { axisOfStroke } from '../src/core/lift'
import { DRAW_POSE } from '../src/core/camera'

const HZ = [100, 400, 1100, 400] as const
const D1 = [500, 650, 680, 537.5] as const   // 깊이선 → vp0 = (900,400)
const HR = [500, 650, 700, 650] as const     // 화면 수평 — 여기서 1점이 선언된다
const DIAG = [300, 700, 200, 500] as const   // 실수로 그은 대각선 (잠금 전이면 vp=(150,400))

/** 지평선 → 깊이선 → 수평선 — 잠긴 상태 */
function locked() {
  const s = session(1200, 800)
  s.draw(...HZ); s.draw(...D1); s.draw(...HR)
  return s
}

describe('2 — 화면 수평축이 선언되면 1점으로 잠근다', () => {
  it('수평선 하나로 잠긴다 — 깊이 소실점이 이미 있으므로', () => {
    const s = locked()
    expect(s.app.lift.an.screenHDeclared).toBe(true)
    expect(s.app.lift.an.p1Locked).toBe(true)
    expect(s.app.lift.an.constructionDone).toBe(true)  // 세 축이 다 정해졌다(2-b)
  })

  it('그 뒤 대각선을 그어도 1점이 유지된다 (2-d)', () => {
    const s = locked()
    const d = s.draw(...DIAG)!
    const an = s.app.lift.an
    expect(an.vps).toHaveLength(1)
    expect(an.fSource).toBe('default')
    expect(an.roles.get(d.id)).toBe('content')
  })

  it('그 대각선이 축 셋 중 하나가 된다 — 자유 방향이 없다 (2-c)', () => {
    const s = locked()
    const d = s.draw(...DIAG)!
    const ax = axisOfStroke(s.app.lift.an, DRAW_POSE, d.a, d.b)
    expect(ax).not.toBeNull()
    expect(['vp0', 'H', 'V']).toContain(ax)
    expect(ax).not.toBe('vp1')  // 두 번째 소실점 축은 존재하지 않는다
  })

  it('찍기도 안 받는다 — 지평선 위 탭이 두 번째 소실점을 못 만든다 (2-a 「어떤 획도」)', () => {
    const s = locked()
    const t = s.draw(300, 400, 300, 400)!   // 지평선 위를 찍는다
    const an = s.app.lift.an
    expect(an.vps).toHaveLength(1)
    expect(an.roles.get(t.id)).toBe('content')
    expect(an.rejects.get(t.id)).toBe(P1_LOCK_REASON)
  })

  it('순서를 바꿔도 같다 — 수평선을 깊이선보다 먼저 그어도 잠긴다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.draw(...HR)                      // 아직 깊이 소실점이 없다 → 안 잠긴다
    expect(s.app.lift.an.p1Locked).toBe(false)
    s.draw(...D1)                      // 깊이 소실점 하나 → 이제 세 축이 다 있다
    expect(s.app.lift.an.p1Locked).toBe(true)
    s.draw(...DIAG)
    expect(s.app.lift.an.vps).toHaveLength(1)
  })

  it('반례: 수평선이 없으면 잠기지 않는다 — 같은 대각선이 2점으로 간다', () => {
    // 이 팔이 없으면 「잠금」이 아니라 「소실점을 아예 못 만든다」와 구별되지 않는다.
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(...D1)
    expect(s.app.lift.an.p1Locked).toBe(false)
    s.draw(...DIAG)
    expect(s.app.lift.an.vps).toHaveLength(2)
    expect(s.app.lift.an.fSource).toBe('two-vp')
  })

  it('반례: 짧은 수평 획은 선언이 아니다 — 방향을 못 믿는 길이', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(...D1)
    s.draw(600, 700, 610, 700)         // MIN_DIR_LEN_RATIO 아래
    expect(s.app.lift.an.screenHDeclared).toBe(false)
    expect(s.app.lift.an.p1Locked).toBe(false)
  })

  it('반례: 2점이 이미 섰으면 수평 획이 상태를 안 바꾼다', () => {
    const s = session(1200, 800)
    s.draw(...HZ); s.draw(...D1); s.draw(...DIAG)  // 2점
    expect(s.app.lift.an.vps).toHaveLength(2)
    s.draw(...HR)
    const an = s.app.lift.an
    expect(an.vps).toHaveLength(2)
    expect(an.fSource).toBe('two-vp')
    expect(an.p1Locked).toBe(false)     // 2점의 「끝」은 vps.length >= 2 쪽이다
    expect(an.constructionDone).toBe(true)
  })

  it('저장·복원이 상태를 바꾸지 않는다 — 잠금은 계산이지 저장이 아니다', () => {
    const s = locked()
    const again = analyze(JSON.parse(JSON.stringify(s.app.doc)))
    expect(again.p1Locked).toBe(true)
    expect(again.vps).toHaveLength(1)
  })
})

describe('2 — 잠금이 «걸리는 조건»의 경계 (2차 리뷰어 지적)', () => {
  it('선언의 임계는 SCREEN_PARALLEL_RATIO다 — 2.87° 안', () => {
    expect(C.SCREEN_PARALLEL_RATIO).toBe(0.05)
    const deg = Math.asin(C.SCREEN_PARALLEL_RATIO) * 180 / Math.PI
    expect(deg).toBeGreaterThan(2.8)
    expect(deg).toBeLessThan(2.9)
  })

  it('반례: 아주 먼 소실점을 향한 깊이선은 거의 수평이어도 H 선언이 아니다', () => {
    // 소실점이 |Δx| ≳ 5000px 밖이면 그쪽을 향한 깊이선이 화면에서 2.87° 안에 들어온다.
    // 그것을 「H축 선언」으로 읽으면 **2점을 그리는 중에 문서가 1점으로 잠긴다.**
    const s = session(1200, 800)
    s.draw(...HZ)
    // 화면 밖 소실점을 찍어 만든다(화면을 줄여 찍는 것과 같은 결과 — 찍기가 그 길이다)
    s.app.doc.strokes.push({ id: 900, a: { x: 6000, y: 400 }, b: { x: 6000, y: 400 } })
    // 위 찍기는 TAP 경로를 안 타므로(하네스가 아니라 직접 넣었다) 대신 vps를 확인한다
    const an0 = analyze(s.app.doc)
    expect(an0.vps.length).toBeGreaterThanOrEqual(1)
    const vp = an0.vps[0]!
    expect(Math.abs(vp.x)).toBeGreaterThan(5000)
    // 그 소실점을 향한 획 — 화면에서 2.87° 안이다
    const a = { x: 500, y: 650 }
    const t = 0.06
    const b = { x: a.x + (vp.x - a.x) * t, y: a.y + (vp.y - a.y) * t }
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    expect(Math.abs(b.y - a.y) / L).toBeLessThan(C.SCREEN_PARALLEL_RATIO)  // 정말 거의 수평이다
    s.app.doc.strokes.push({ id: 901, a, b })
    const an = analyze(s.app.doc)
    expect(an.roles.get(901)).toBe('content')
    expect(an.screenHDeclared).toBe(false)   // ← 선언이 아니다
    expect(an.p1Locked).toBe(false)          // ← 잠기지 않는다
  })

  it('같은 자리에서 H가 더 잘 맞으면 선언이다 — 소실점 쪽이 아니라 진짜 수평이면', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.app.doc.strokes.push({ id: 900, a: { x: 6000, y: 400 }, b: { x: 6000, y: 400 } })
    s.app.doc.strokes.push({ id: 901, a: { x: 500, y: 650 }, b: { x: 800, y: 650 } }) // 정확히 수평
    const an = analyze(s.app.doc)
    expect(an.screenHDeclared).toBe(true)
    expect(an.p1Locked).toBe(true)
  })

  it('잠금은 되돌릴 수 있다 — 선언한 획을 지우면 풀린다 (저장이 아니라 계산이므로)', () => {
    const s = locked()
    expect(s.app.lift.an.p1Locked).toBe(true)
    const hr = s.app.doc.strokes.find(x => x.a.y === 650 && x.b.y === 650)!
    s.app.doc.strokes = s.app.doc.strokes.filter(x => x.id !== hr.id)
    expect(analyze(s.app.doc).p1Locked).toBe(false)
    expect(analyze(s.app.doc).screenHDeclared).toBe(false)
  })
})
