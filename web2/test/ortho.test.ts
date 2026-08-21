// 탑뷰에서 직사각형인가 — 그리고 옛 불변식이 왜 못 잡았나 (web2-03 지시 1-a·1-e·1-f)
//
// **화면에서는 안 보이고 탑뷰에서만 보인다.** 1점으로 상자를 그리면 바닥이 평행사변형이
// 된다(고치기 전 실측 **73.9677°**). 「그려 보고 안다」로는 못 잡는 자리라 이 파일이 지킨다.
// 축 목록·소실점 표식·스냅 포획은 `axes.test.ts`가 잰다 — 여기서 다시 재지 않는다.
//
// ── D-3 반증 조건 ─────────────────────────────────────────────────────
// `analyze()`의 **1점 주점 보정**(`vps.length === 1 → principal.x = vps[0].x`)을 지우면
// 아래 `1-a` 넷 중 셋이 빨개진다(되살려 확인함 · 2026-08-21).
// ⚠ **1-e의 두 팔은 반대다** — 그 둘은 고치기 **전에도** 통과했고 지금도 통과한다.
// 그것이 이 파일의 요점이다: 옛 불변식은 이 결함에 판별력이 **없었다**.
// 그러니 그 둘은 「검사」가 아니라 **왜 못 잡았는지의 증거**로 읽는다.

import { describe, it, expect } from 'vitest'
import { session, toward } from './session'
import { analyze, frameAxes, type Analysis } from '../src/core/camera'
import type { V3 } from '../src/core/vec'

const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z)
const angDeg = (a: V3, b: V3) =>
  Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / (len3(a) * len3(b))))) * 180 / Math.PI

const HZ = [100, 400, 1100, 400] as const

/** 1점 박스의 바닥면 — 앞 가로변 하나와 그 양 끝에서 뻗는 깊이변 둘 */
function onePointFloor(vpx = 900) {
  const s = session(1200, 800)
  s.draw(...HZ)
  const vp = { x: vpx, y: 400 }
  const A = { x: 400, y: 600 }, B = { x: 700, y: 600 }
  const t1 = toward(A, vp, 0.35)
  const d1 = s.draw(A.x, A.y, t1.x, t1.y)!        // 깊이변 1 (소실점을 만든다)
  const h = s.draw(A.x, A.y, B.x, B.y)!           // 앞 가로변
  const t2 = toward(B, vp, 0.35)
  const d2 = s.draw(B.x, B.y, t2.x, t2.y)!        // 깊이변 2
  return { s, d1, h, d2 }
}

/** 탑뷰 = (x, z) 평면. 세계 y를 버린 것이 곧 위에서 내려다본 그림이다. */
const top = (p: V3) => ({ u: p.x, v: p.z })
const topVec = (a: V3, b: V3) => ({ u: b.x - a.x, v: b.z - a.z })
const topAngle = (p: { u: number; v: number }, q: { u: number; v: number }) =>
  Math.acos(Math.max(-1, Math.min(1,
    (p.u * q.u + p.v * q.v) / (Math.hypot(p.u, p.v) * Math.hypot(q.u, q.v))))) * 180 / Math.PI

describe('1-a — 탑뷰에서 직사각형인가', () => {
  it('1점 박스의 바닥면은 탑뷰에서 직각이다', () => {
    const { s, d1, h } = onePointFloor()
    const g1 = s.app.lift.lifted.get(d1.id)!
    const gh = s.app.lift.lifted.get(h.id)!
    expect(g1.axis).toBe('vp0')
    expect(gh.axis).toBe('H')
    // 두 변이 같은 모서리에서 뻗는다 — 탑뷰의 한 꼭짓점
    expect(top(g1.a3).u).toBeCloseTo(top(gh.a3).u, 9)
    expect(top(g1.a3).v).toBeCloseTo(top(gh.a3).v, 9)
    const a = topVec(g1.a3, g1.b3), b = topVec(gh.a3, gh.b3)
    expect(topAngle(a, b)).toBeCloseTo(90, 6)
  })

  it('반대쪽 모서리도 직각이다 — 평행사변형이 아니라 직사각형', () => {
    const { s, h, d2 } = onePointFloor()
    const gh = s.app.lift.lifted.get(h.id)!
    const g2 = s.app.lift.lifted.get(d2.id)!
    const a = topVec(g2.a3, g2.b3), b = topVec(gh.b3, gh.a3)
    expect(topAngle(a, b)).toBeCloseTo(90, 6)
  })

  it('깊이변 둘은 탑뷰에서 평행하다 — 같은 축이므로', () => {
    const { s, d1, d2 } = onePointFloor()
    const a = topVec(s.app.lift.lifted.get(d1.id)!.a3, s.app.lift.lifted.get(d1.id)!.b3)
    const b = topVec(s.app.lift.lifted.get(d2.id)!.a3, s.app.lift.lifted.get(d2.id)!.b3)
    expect(topAngle(a, b)).toBeCloseTo(0, 6)
  })

  it('소실점 자리를 바꿔도 직각이다 — 화면 어디에 찍든', () => {
    for (const vpx of [200, 450, 600, 800, 1150]) {
      const { s, d1, h } = onePointFloor(vpx)
      const g1 = s.app.lift.lifted.get(d1.id)
      const gh = s.app.lift.lifted.get(h.id)
      expect(g1, `vpx=${vpx}`).toBeTruthy()
      expect(gh, `vpx=${vpx}`).toBeTruthy()
      const a = topVec(g1!.a3, g1!.b3), b = topVec(gh!.a3, gh!.b3)
      expect(topAngle(a, b), `vpx=${vpx}`).toBeCloseTo(90, 6)
    }
  })
})

describe('1-e — 기존 불변식이 왜 못 잡았나', () => {
  it('「같은 축의 두 획은 3D 방향이 같다」는 축이 기울어도 통과한다', () => {
    // 깊이변 둘은 서로 평행하다 — 축이 74°로 기울어 있어도 «둘 다 같은 74°»이므로
    // 그 검사는 통과한다. 방향이 같아도 **축이 틀어져 있으면 형태가 틀린다.**
    const { s, d1, d2 } = onePointFloor()
    const g1 = s.app.lift.lifted.get(d1.id)!, g2 = s.app.lift.lifted.get(d2.id)!
    const u = topVec(g1.a3, g1.b3), v = topVec(g2.a3, g2.b3)
    expect(topAngle(u, v)).toBeCloseTo(0, 6)   // ← 옛 불변식이 보던 것. 고치기 전에도 통과했다.
    // 그것이 판별력이 없다는 증거: 같은 문서에서 **H와의 각**은 90°여야 하고,
    // 고치기 전에는 73.9677°였다. 위 1-a가 그 자리를 지킨다.
  })

  it('「불변식 k(화면이 안 튄다)」도 통과한다 — 화면에서는 안 보이는 결함이다', () => {
    // 리프팅은 2D에서 매번 다시 푼다. 축이 기울어도 **그 축으로 푼 3D를 도로 사영하면**
    // 원래 2D다. 그래서 k는 이 결함에 대해 아무것도 안 잰다(자기참조 유형 3).
    const { s, d1, h } = onePointFloor()
    const an = s.app.lift.an
    for (const st of [d1, h]) {
      const g = s.app.lift.lifted.get(st.id)!
      const pa = project(an, DRAW_POSE, g.a3)!, pb = project(an, DRAW_POSE, g.b3)!
      expect(Math.hypot(pa.x - st.a.x, pa.y - st.a.y)).toBeLessThan(1e-6)
      expect(Math.hypot(pb.x - st.b.x, pb.y - st.b.y)).toBeLessThan(1e-6)
    }
  })
})

import { project, DRAW_POSE } from '../src/core/camera'

describe('1-f — 여분의 소실점과 깊이축 기울기는 같은 뿌리인가', () => {
  it('뿌리는 하나다 — `an.axes`가 정규직교 프레임이 아니었다', () => {
    // 두 증상이 한 문장에서 나온다:
    //   2점 → H가 **넷째 축**으로 남아 스냅을 가져갔다(사람이 안 만든 소실점)
    //   1점 → H는 진짜 축인데 깊이축이 그것과 **73.9677°**였다(탑뷰 평행사변형)
    const one = analyze(onePointFloor().s.app.doc)
    const fr1 = frameAxes(one)!
    expect(fr1.map(a => a.id).sort()).toEqual(one.axes.map(a => a.id).sort())
    expect(fr1).toHaveLength(3)
  })

  it('⚠ 그러나 수리는 둘이고 서로를 대신하지 못한다 (되살려 확인함)', () => {
    // 되살림 ①(2점에서도 H를 넣는다) → `axes.test.ts`의 팔 **넷**이 빨개진다.
    //                                   `ortho.test.ts`는 **전부 통과한다.**
    // 되살림 ②(1점 주점 보정을 지운다) → `ortho.test.ts`의 팔 **셋**이 빨개진다.
    //                                   2점 축 개수 팔은 **전부 통과한다.**
    // 두 집합이 서로소다 — 그래서 「H를 지웠더니 기울기도 사라졌다」가 **아니다.**
    // 뿌리는 같고 손댈 자리는 둘이었다. 이 팔은 그 사실을 문서가 아니라 코드에 남긴다:
    // 1점 프레임에 H가 **있고**(첫째 수리와 무관), 그 H가 깊이축과 직교한다(둘째 수리).
    const an = analyze(onePointFloor().s.app.doc)
    const H = an.axes.find(a => a.id === 'H')!
    const d = an.axes.find(a => a.id === 'vp0')!
    expect(H).toBeTruthy()                                  // ① 이 안 지운 것
    expect(Math.abs(H.dir.x * d.dir.x + H.dir.z * d.dir.z)).toBeLessThan(1e-12) // ② 가 고친 것
  })
})

