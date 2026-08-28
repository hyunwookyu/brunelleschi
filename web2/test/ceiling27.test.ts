// web2-27 1번 — **지평선 위에 그은 첫 선**의 게이트.
//
// 현상: 첫 획을 지평선보다 **위**에 그으면 접지가 안 됐다 — `pointOnGround`가 지평선
//   위/선상의 점에 `null`을 돌려주기 때문이다. 계산으로는 옳다(위로 가는 광선은 바닥면과
//   안 만난다). **없는 것은 «위 갈래»였다.**
//
// 사용자가 낸 규칙: 「지평선 위에 그은 선의 첫 시작점을 지평선 기준으로 **mirror**해서
//   그 반대점(지평선 아래 점)을 원점으로 삼는다.」
// 그 규칙의 기하학적 정체: 눈높이 면에 대해 광선을 뒤집으면 바닥과 한 점 `G`에서 만나고,
//   `G`를 되뒤집으면 `(G.x, 2·EYE_HEIGHT, G.z)` — **원래 광선이 그 평면과 만나는 점**이다.
//   근사가 아니라 정확히 그 점이고, 이 파일이 **그것을 좌표로 확인한다**(눈으로 말고).
//
// D-3(반증): 팔마다 「그렇지 않은 자리」를 나란히 둔다 — 아래에서 시작하면 바닥이고,
//   걸치면 아무 데도 안 놓이며, 지평선 자리면 종전대로 평행이다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { pointOnGround, pointOnCeiling, DRAW_POSE, analyze } from '../src/core/camera'
import { C } from '../src/core/constants'
import { emptyDoc } from '../src/core/types'

const W = 1200, H = 800, HZ = H / 2      // 빈 문서의 지평선 화면 y
const CEIL = 2 * C.EYE_HEIGHT

describe('27-1 ① 천장 갈래 자체 — 바닥의 거울상이다', () => {
  it('pointOnCeiling은 위 광선에서만 값을 주고, 그 점의 y가 정확히 2·EYE_HEIGHT다', () => {
    const an = analyze(emptyDoc(W, H))
    for (const y of [100, 200, 300, HZ - 20]) {
      const p = pointOnCeiling(an, DRAW_POSE, { x: 500, y })!
      expect(p, `y=${y}`).not.toBeNull()
      expect(p.y).toBeCloseTo(CEIL, 12)
      expect(pointOnGround(an, DRAW_POSE, { x: 500, y })).toBeNull()   // 바닥은 그대로 null
    }
    // 반증(D-3) — 아래·선상에서는 천장이 null이고 바닥이 값을 준다(정확히 뒤집혀 있다)
    for (const y of [HZ + 20, 600, 700]) {
      expect(pointOnCeiling(an, DRAW_POSE, { x: 500, y }), `y=${y}`).toBeNull()
      expect(pointOnGround(an, DRAW_POSE, { x: 500, y })!.y).toBeCloseTo(0, 12)
    }
    expect(pointOnCeiling(an, DRAW_POSE, { x: 500, y: HZ })).toBeNull()   // 지평선 자리 — 평행
    expect(pointOnGround(an, DRAW_POSE, { x: 500, y: HZ })).toBeNull()
  })

  it('**거울상임을 값으로** — 같은 x에서 위·아래 대칭점의 3D가 눈높이 면에 대해 대칭이다', () => {
    const an = analyze(emptyDoc(W, H))
    for (const d of [40, 90, 150]) {
      const up = pointOnCeiling(an, DRAW_POSE, { x: 700, y: HZ - d })!
      const dn = pointOnGround(an, DRAW_POSE, { x: 700, y: HZ + d })!
      expect(up.x).toBeCloseTo(dn.x, 9)
      expect(up.z).toBeCloseTo(dn.z, 9)
      expect(up.y - C.EYE_HEIGHT).toBeCloseTo(C.EYE_HEIGHT - dn.y, 12)   // 눈높이에 대해 대칭
    }
  })
})

describe('27-1 ② 위에서 시작 — 첫 선이 천장 평면에 놓인다 (좌표로)', () => {
  it('화면 수평 첫 선(위) — 두 끝이 모두 y = 2·EYE_HEIGHT', () => {
    const s = session(W, H)
    const st = s.draw(300, 250, 900, 250)!
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
    const g = s.app.lift.lifted.get(st.id)!
    expect(g.a3.y).toBeCloseTo(CEIL, 9)
    expect(g.b3.y).toBeCloseTo(CEIL, 9)
    // 반증 — 같은 획을 지평선 아래에 그으면 두 끝이 **바닥**이다
    const t = session(W, H)
    const tt = t.draw(300, 550, 900, 550)!
    const tg = t.app.lift.lifted.get(tt.id)!
    expect(tg.a3.y).toBeCloseTo(0, 9)
    expect(tg.b3.y).toBeCloseTo(0, 9)
  })

  it('세로 첫 선(전부 위) — **위 끝**이 천장에 붙고 아래로 내려온다(바닥 규칙의 거울상)', () => {
    const s = session(W, H)
    const st = s.draw(500, 300, 500, 200)!     // 화면 위로 그은 세로선
    const g = s.app.lift.lifted.get(st.id)!
    expect(Math.max(g.a3.y, g.b3.y)).toBeCloseTo(CEIL, 9)
    expect(Math.min(g.a3.y, g.b3.y)).toBeLessThan(CEIL)
    // 반증 — 아래로 그은 세로선은 **아래 끝**이 바닥이다(종전 규칙 그대로)
    const t = session(W, H)
    const tt = t.draw(500, 500, 500, 650)!
    const tg = t.app.lift.lifted.get(tt.id)!
    expect(Math.min(tg.a3.y, tg.b3.y)).toBeCloseTo(0, 9)
  })

  it('**지평선을 가로지르는 세로선은 종전대로 바닥이다** — 눈앞의 기둥이 그것이다', () => {
    // 이 팔이 없으면 「걸치면 거부」를 세로선까지 넓혀 **가장 흔한 획**이 죽는다
    // (실제로 초판이 그랬고 `fold_measure`의 기둥이 통째로 대기로 떨어졌다).
    const s = session(W, H)
    const st = s.draw(500, 300, 500, 500)!     // 눈높이를 관통하는 기둥
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
    const g = s.app.lift.lifted.get(st.id)!
    expect(Math.min(g.a3.y, g.b3.y)).toBeCloseTo(0, 9)          // 아래 끝이 바닥
    expect(Math.max(g.a3.y, g.b3.y)).toBeGreaterThan(C.EYE_HEIGHT)   // 눈높이 위로 올라간다
  })
})

describe('27-1 ③ 걸치는 선은 접지되지 않고 이유가 남는다', () => {
  it('깊이 축이 지평선을 가로지르면 straddle — **조용히 틀린 배치**를 안 만든다', () => {
    // 수리 전: `s.a`만 보고 지면에 앉아 **눈 뒤까지 뻗는 선분**이 됐다
    //   (실측 z −16.704 → +16.704 — 눈이 원점이다). 그것이 「무한대로 간다」의 실제 모습이다.
    const s = session(W, H)
    const st = s.draw(400, 500, 800, 300)!
    expect(s.app.lift.an.roles.get(st.id)).toBe('vp')     // 소실점은 그대로 선다
    expect(s.app.lift.lifted.has(st.id)).toBe(false)
    expect(s.app.lift.waitWhy.get(st.id)).toBe('straddle')
    // 반증 — 같은 방향을 **지평선 아래에서만** 그으면 접지된다(대역이 실패 가능하다)
    const t = session(W, H)
    const tt = t.draw(400, 640, 800, 520)!
    expect(t.app.lift.lifted.has(tt.id)).toBe(true)
  })

  it('지평선 자리(따라긋기)는 종전대로 onHorizon — 사유가 갈린다', () => {
    const s = session(W, H)
    const hz = s.draw(100, HZ, 1100, HZ)!
    expect(s.app.lift.waitWhy.get(hz.id)).toBe('onHorizon')
  })
})

describe('27-1 ④ isFirstLine은 그리기 순서가 아니라 lift 상태다 — 위 → 아래 순서', () => {
  it('위 선이 먼저 자립하고, 그 다음 아래 선이 그 위 선을 근거로 풀린다', () => {
    // 지금까지 아래 선만 검사해 왔다(지시 4) — 이 순서를 **별도 픽스처로** 확인한다.
    const s = session(W, H)
    const up = s.draw(300, 250, 900, 250)!          // ① 위 — 천장에 자립
    expect(s.app.lift.lifted.has(up.id)).toBe(true)
    expect(s.app.lift.lifted.get(up.id)!.a3.y).toBeCloseTo(CEIL, 9)
    const down = s.draw(300, 250, 300, 560)!        // ② 위 선의 끝에서 아래로 — 연결로 풀린다
    expect(s.app.lift.lifted.has(down.id)).toBe(true)
    const dg = s.app.lift.lifted.get(down.id)!
    // 위 끝은 천장에 붙어 있고(연결) 아래로 내려간다 — **두 선 모두 자립했다**
    expect(Math.max(dg.a3.y, dg.b3.y)).toBeCloseTo(CEIL, 6)
    expect(Math.min(dg.a3.y, dg.b3.y)).toBeLessThan(CEIL - 0.5)
    expect(s.app.lift.waiting).toEqual([])
  })

  it('아래 → 위 순서도 그대로 돈다 (무회귀 — 이 순서는 종전부터 검사돼 왔다)', () => {
    const s = session(W, H)
    const down = s.draw(300, 560, 900, 560)!
    expect(s.app.lift.lifted.get(down.id)!.a3.y).toBeCloseTo(0, 9)
    const up = s.draw(300, 560, 300, 250)!
    expect(s.app.lift.lifted.has(up.id)).toBe(true)
    expect(s.app.lift.waiting).toEqual([])
  })
})

describe('27-1 ⑤ 위에서 시작한 그림이 공간에서 일관되게 돈다', () => {
  it('궤도를 돌려도 천장 평면의 y가 안 바뀐다 — 3D는 시점과 무관하다', async () => {
    const s = session(W, H)
    const a = s.draw(300, 250, 900, 250)!
    s.draw(300, 250, 300, 560)
    s.draw(900, 250, 900, 560)
    const before = [...s.app.lift.lifted.values()].map(g => [g.a3.y, g.b3.y])
    // 시점을 돌린다 — 문서 좌표(3D)는 안 바뀌어야 한다
    const { orbitBy } = await import('../src/app/state')
    orbitBy(s.app, 40, 25)
    const after = [...s.app.lift.lifted.values()].map(g => [g.a3.y, g.b3.y])
    expect(after).toEqual(before)
    expect(s.app.lift.lifted.get(a.id)!.a3.y).toBeCloseTo(CEIL, 9)
  })
})
