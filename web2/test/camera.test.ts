import { describe, it, expect } from 'vitest'
import { analyze, screenAxes, DRAW_POSE, classifyNext } from '../src/core/camera'
import { C } from '../src/core/constants'
import { builder, constructedDoc, W, H } from './fixtures'
import { v3, quatAxisAngle } from '../src/core/vec'

describe('작도 폴드 — 소실점은 깊이선과 지평선의 교점(계산)', () => {
  it('첫 획이 지평선이 된다', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    const an = analyze(b.doc)
    expect(an.horizonY).toBe(400)
    expect(an.principal).toEqual({ x: W / 2, y: 400 })
    expect(an.fSource).toBe('default')
    expect(an.f).toBeCloseTo(C.DEFAULT_F_RATIO * W, 9)
  })

  it('깊이선 → 소실점 = 교점, 오차 0 (불변식 h)', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    const s = b.add(300, 700, 600, 550)
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(1)
    const vp = an.vps[0]!
    expect(vp.strokeId).toBe(s.id)
    // 소실점이 깊이선의 직선 위에 정확히 있다 — cross = 0
    const cross = (vp.x - s.a.x) * (s.b.y - s.a.y) - (vp.y - s.a.y) * (s.b.x - s.a.x)
    expect(Math.abs(cross)).toBeLessThan(1e-9)
    expect(vp.y).toBe(400)
    expect(vp.x).toBeCloseTo(900, 9)
  })

  it('두 번째 소실점 → f² = |PV₁|·|PV₂|', () => {
    const an = analyze(constructedDoc().doc)
    expect(an.vps).toHaveLength(2)
    expect(an.vps[1]!.x).toBeCloseTo(100, 9)
    expect(an.fSource).toBe('two-vp')
    expect(an.f! * an.f!).toBeCloseTo(300 * 500, 6)
    expect(an.constructionDone).toBe(true)
  })

  it('작도가 끝나면 더 만들 수 없다 — 이후 대각선은 내용 획', () => {
    const b = constructedDoc()
    const s = b.add(200, 100, 700, 300) // 어느 축에도 안 붙는 대각선
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(2)
    expect(an.roles.get(s.id)).toBe('content')
  })

  it('반례: 같은 쪽 소실점은 f²≤0 — 거부되고 획은 남는다', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    b.add(300, 700, 600, 550)            // vp1 = (900,400), u1=+300
    const s = b.add(800, 700, 900, 550)  // 교점 x=1000 → u2=+400, 같은 쪽
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(1)
    expect(an.roles.get(s.id)).toBe('content')
    expect(an.rejects.get(s.id)).toMatch(/f²/)
  })

  it('반례: 짧은 획은 소실점을 못 만든다 — 획은 남고 카메라는 안 건드린다', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    const diag = Math.hypot(W, H)
    const L = C.VP_MIN_LEN_RATIO * diag * 0.9 // 임계 바로 아래
    const s = b.add(400, 600, 400 + L * 0.6, 600 - L * 0.8)
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(0)
    expect(an.roles.get(s.id)).toBe('content')
  })

  it('반례: 화면 평행 획은 소실점이 아니라 내용', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    const s1 = b.add(200, 600, 800, 600)  // 수평
    const s2 = b.add(500, 200, 500, 700)  // 수직
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(0)
    expect(an.roles.get(s1.id)).toBe('content')
    expect(an.roles.get(s2.id)).toBe('content')
  })

  it('기존 소실점에 붙는 획은 내용이 된다 (붙으면 기존, 안 붙으면 새것)', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    b.add(300, 700, 600, 550)                 // vp1 = (900,400)
    const s = b.add(100, 600, 500, 500)       // (900,400)을 정확히 향한다
    const an = analyze(b.doc)
    expect(an.vps).toHaveLength(1)
    expect(an.roles.get(s.id)).toBe('content')
  })
})

describe('screenAxes — 표시·스냅·그리드의 단일 출처 (불변식 i)', () => {
  it('작도 포즈에서 유한 소실점이 그린 교점에 정확히 재사영된다', () => {
    const an = analyze(constructedDoc().doc)
    const axes = screenAxes(an, DRAW_POSE)
    const vp0 = axes.find(a => a.id === 'vp0')!
    const vp1 = axes.find(a => a.id === 'vp1')!
    expect(vp0.vp!.x).toBeCloseTo(900, 6)
    expect(vp0.vp!.y).toBeCloseTo(400, 6)
    expect(vp1.vp!.x).toBeCloseTo(100, 6)
    expect(vp1.vp!.y).toBeCloseTo(400, 6)
  })

  it('화면 평행 축은 무한원 — 방향만 나온다', () => {
    // ⚠ H는 **1점 문서에서 본다.** 2점의 프레임은 {vp0, vp1, V}이고 H는 후보가 아니다
    //    (web2-03 지시 1 — 사람이 만들지 않은 넷째 축이 스냅을 가져갔다).
    const two = screenAxes(analyze(constructedDoc().doc), DRAW_POSE)
    expect(two.map(a => a.id).sort()).toEqual(['V', 'vp0', 'vp1'])
    const v = two.find(a => a.id === 'V')!
    expect(v.vp).toBeNull()
    expect(Math.abs(v.dir!.x)).toBeLessThan(1e-12)

    const b = builder()
    b.add(100, 400, 1100, 400)
    b.add(500, 500, 600, 475)          // 소실점 하나 — 1점
    const one = screenAxes(analyze(b.doc), DRAW_POSE)
    const h = one.find(a => a.id === 'H')!
    expect(h.vp).toBeNull()
    expect(Math.abs(h.dir!.y)).toBeLessThan(1e-12)
  })

  it('돌린 포즈에서도 같은 출처에서 나온다 — 요 회전이면 소실점이 수평으로 움직인다', () => {
    const an = analyze(constructedDoc().doc)
    const pose = { p: v3(0, 0, 0), q: quatAxisAngle(v3(0, 1, 0), 0.2) }
    const axes = screenAxes(an, pose)
    const vp0 = axes.find(a => a.id === 'vp0')!
    expect(vp0.vp).not.toBeNull()
    expect(vp0.vp!.y).toBeCloseTo(400, 6) // 수평축 소실점은 지평선 위에 남는다
    expect(vp0.vp!.x).not.toBeCloseTo(900, 0)
  })

  it('버그를 되살리면 잡는다: 소실점을 반올림해 저장했다면 h가 깨진다', () => {
    // 소실점 x를 1px 격자로 반올림한 "저장된 값"은 교점 정확성 검사를 통과하지 못한다
    const b = builder()
    b.add(100, 400, 1100, 400)
    const s = b.add(300, 701, 600, 550) // 교점 x가 정수가 아니게
    const an = analyze(b.doc)
    const vp = an.vps[0]!
    const rounded = { x: Math.round(vp.x), y: vp.y }
    const cross = (rounded.x - s.a.x) * (s.b.y - s.a.y) - (rounded.y - s.a.y) * (s.b.x - s.a.x)
    expect(Math.abs(cross)).toBeGreaterThan(1e-9) // 반올림 값은 걸린다
    const exact = (vp.x - s.a.x) * (s.b.y - s.a.y) - (vp.y - s.a.y) * (s.b.x - s.a.x)
    expect(Math.abs(exact)).toBeLessThan(1e-9)    // 계산 값은 통과
  })
})

describe('classifyNext — 미리보기와 확정이 같은 함수', () => {
  it('작도 중 대각선은 새 소실점 예고', () => {
    const b = builder()
    b.add(100, 400, 1100, 400)
    const an = analyze(b.doc)
    const cls = classifyNext(an, { x: 300, y: 700 }, { x: 600, y: 550 })
    expect(cls.role).toBe('vp')
    expect(cls.vp!.x).toBeCloseTo(900, 9)
  })
})
