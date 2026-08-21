// **지평선을 긋고 수평선을 스냅으로 그린다** (web2-06 지시 2)
//
// 증상: 지평선을 긋고 수평선을 그으면 **스냅이 안 붙고 먼 소실점이 생겼다.**
// 재현 표식(고치기 전) — 지평선만 그은 상태에서 (300,600)→(700,600−d):
//
//     d=1.5px → content/H  (붙는다)
//     d=2px   → vp @ x=40300  (33W)
//     d=5px   → vp @ x=16300  (13.3W) → 그은 뒤 vps=[16300] · 주점이 그리로 옮겨간다
//
// 손이 겨냥해서 만드는 오차가 **1.5px**를 넘는 순간 카메라가 망가졌고, 그 획은 작도 획이라
// **실행취소도 안 된다**(state.ts: role==='content'인 획만 op에 들어간다).
//
// 원인: 「지평선과 평행한가」를 **포인터 잡음**(`PARALLEL_PX`)으로만 재고 있었다.
// 그것은 「이 획으로 무한원과 구별할 수 있는가」의 답이고, 물음의 나머지 절반
// — **「그 소실점이 사람이 그리는 구도 안인가」** — 이 없었다. `VP_FAR_W = 6`이 그 자리다.
//
// ⚠ 대가가 있다(#59): 6W 밖 소실점은 **그어서** 못 만든다. 아래 「대가」 팔이 그것을 박는다.
// 대비표는 NOTES의 web2-06 지시 2 절. 6W 밖은 지평선 위를 **찍어** 만든다(지시 4-b).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { resolveEnd } from '../src/core/draft'
import { analyze } from '../src/core/camera'
import { C } from '../src/core/constants'

const W = 1200, H = 800, HY = 400

/** 지평선만 그은 상태에서 수평 의도로 한 획 — h = 지평선 이격, R = 가로 폭, d = 겨냥 오차 */
function horiz(h: number, R: number, d: number) {
  const s = session(W, H)
  s.draw(100, HY, 1100, HY)
  const st = s.draw(300, HY + h, 300 + R, HY + h - d)!
  return { st, an: analyze(s.app.doc), s }
}

describe('지시 2 — 수평선이 스냅으로 그어진다', () => {
  it('**재현**: 처짐 5px의 수평 의도가 소실점을 안 만든다 (고치기 전 x=16300)', () => {
    const { st, an } = horiz(200, 400, 5)
    expect(an.vps).toHaveLength(0)
    expect(an.screenHDeclared).toBe(true)
    expect(st.b.y).toBe(st.a.y)              // 붙은 좌표가 그대로 확정된다(원칙 d)
    expect(an.principal!.x).toBe(W / 2)      // 주점이 안 끌려갔다
  })

  it('겨냥 오차 대역 — h=200·R=400에서 8px까지 붙는다 (고치기 전 1.5px)', () => {
    for (const d of [0, 1, 2, 3, 5, 8]) {
      expect(horiz(200, 400, d).an.vps.length, `${d}px`).toBe(0)
    }
    // 흡수 한계는 h·R/(6W) = 11.1px. 그 밖은 종전대로 소실점이다 — **반증 조건**이다.
    expect(200 * 400 / (C.VP_FAR_W * W)).toBeCloseTo(11.1, 1)
    expect(horiz(200, 400, 12).an.vps.length).toBe(1)
  })

  it('길게 그으면 더 흡수한다 — 겨냥 오차는 길이에 비례한다', () => {
    expect(horiz(200, 800, 20).an.vps.length).toBe(0)   // 한계 22.2px
    expect(horiz(200, 800, 24).an.vps.length).toBe(1)
  })

  it('1점 작도 — 소실점 하나 뒤의 수평선(뒷벽)이 둘째 소실점을 안 만든다', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    s.draw(700, HY, 700, HY)                 // 찍기 → vp0
    const st = s.draw(300, 600, 620, 595)!   // 뒷벽 윗선 — 처짐 5px
    const an = analyze(s.app.doc)
    expect(an.vps).toHaveLength(1)
    expect(st.b.y).toBe(st.a.y)
    expect(an.p1Locked).toBe(true)           // 화면 수평축 선언 + 깊이 소실점 하나 = 1점
  })

  it('미리보기가 그대로 확정된다 — `resolveEnd`가 이미 수평을 낸다', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    const start = { x: 300, y: 600 }
    const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an, start,
      { p3: null }, { x: 700, y: 595 }, { ...s.app.osnap })
    expect(r.axis).toBe('H')
    expect(r.end.y).toBe(start.y)
  })

  it('**반증(양성 채널)**: 5W 소실점을 향한 깊이선은 그대로 소실점이 된다', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    s.app.doc.strokes.push({ id: 900, a: { x: 900, y: HY }, b: { x: 900, y: HY } })
    // 왼쪽 5W(=6000px)를 향해: h=150 · R=600 → 처짐 15px
    const st = s.draw(700, 550, 100, 550 - 150 * 600 / 6000)!
    const an = analyze(s.app.doc)
    expect(an.vps).toHaveLength(2)
    expect(an.roles.get(st.id)).toBe('vp')
  })

  it('**대가**(#59): 6W 밖은 그어서 못 만든다 — 그 길은 지평선 위를 찍는 것이다', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    s.app.doc.strokes.push({ id: 900, a: { x: 900, y: HY }, b: { x: 900, y: HY } })
    const st = s.draw(700, 550, 100, 550 - 150 * 600 / (10 * W))!   // 10W를 향해
    expect(analyze(s.app.doc).vps).toHaveLength(1)                  // ← 고치기 전에는 2였다
    expect(st.b.y).toBe(st.a.y)                                     // H로 붙었다
    // 찍기로는 만들어진다(화면 밖이므로 팬·줌으로 데려온 뒤 찍는 것이 앱에서의 경로다)
    s.app.doc.strokes.push({ id: 901, a: { x: -11400, y: HY }, b: { x: -11400, y: HY } })
    // ⚠ 이 문서는 이미 H가 선언돼 **1점으로 잠겼다** — 찍기도 안 받는다(지시 2-a).
    //    즉 「H로 읽힌 뒤에 찍어서 되돌리기」는 **안 된다.** 순서가 먼저다.
    expect(analyze(s.app.doc).vps).toHaveLength(1)
  })

  it('**남은 구멍**: 지평선 바로 아래의 짧은 획은 여전히 좁다 (h=40·R=300 → 1.5px)', () => {
    // 그 대역은 `PARALLEL_PX`가 먼저 걸리는 자리다(경계 = min(6W, h·R/1.5) 중 뒤 항).
    expect(Math.min(C.VP_FAR_W * W, 40 * 300 / C.PARALLEL_PX)).toBe(C.VP_FAR_W * W)
    expect(horiz(40, 300, 2).an.vps.length).toBe(1)   // 2px만 어긋나도 소실점이다
    expect(horiz(40, 300, 1).an.vps.length).toBe(0)
    // 흡수 한계 = h·R/(6W) = 1.67px. 지평선에 붙어 그으면 이 회차의 이득이 거의 없다.
    expect(40 * 300 / (C.VP_FAR_W * W)).toBeCloseTo(1.67, 2)
  })
})
