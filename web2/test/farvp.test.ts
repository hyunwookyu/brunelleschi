// 먼 소실점 대역 (web2-03 지시 2)
//
// 건축 투시도의 소실점은 보통 화면 폭의 2~3배이고 완만한 구도면 그보다 멀다 —
// **그 대역이 정상 구도다.** 그런데 그 획들이 「화면 수평」으로 읽혀 문서가 1점으로 잠겼다.
//
// ── 고치기 전 실측 (2-a·2-b) ──────────────────────────────────────────
// 경계는 **고정 px가 아니었다.** 「화면 평행」을 비(2.87°)로 재고 있었고, 그 비가 뜻하는
// 소실점 거리는 시작점이 지평선에서 떨어진 거리 h에 비례한다: 경계 ≈ h × 20.
//
//     h= 40px → 0.7W    h= 80px → 1.3W    h=150px → 2.5W
//     h=250px → 4.2W    h=400px → 6.7W        (W = 화면 폭 1200)
//
// 지난 세션이 「5000px」이라 적은 것은 **그 픽스처의 h가 250이었기 때문**이고, 상수가 아니다.
//
// ── 2-c 비교 방식이 대역을 덮었나: **안 덮었다.** 자리가 둘이었다 ──────────
//   ① 「지평선과 평행한가」를 비로 쟀다      → 처짐을 **px**로 재도록 바꿨다(`PARALLEL_PX`)
//   ② 「기존 소실점에 붙었나」를 **획 길이**로 나눴다 → **소실점까지의 거리**로 나눈다
//      (그것이 sin(각도)다. 획이 길수록 절대 허용이 커지던 것이 ②의 결함이다)
//   둘은 **같은 형태**다 — 비로 재야 할 것과 절대로 재야 할 것을 서로 바꿔 잡았다(2-d).
//
// ── D-3 반증 조건 ─────────────────────────────────────────────────────
// ①을 되살리면(비로 재기) `2-e` 표의 h 작은 행부터 빨개진다.
// ②를 되살리면(획 길이로 나누기) 긴 획 행이 빨개진다. 둘 다 실행해 확인했다(NOTES의 표).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { wideDoc } from './fixtures'
import { analyze } from '../src/core/camera'
import { axisOfStroke } from '../src/core/lift'
import { DRAW_POSE } from '../src/core/camera'
import { C } from '../src/core/constants'

const W = 1200, HY = 400

/** 지평선 + 오른쪽 소실점(찍기) 뒤, 왼쪽 **멀리** 있는 소실점을 향해 깊이선을 긋는다.
 *  h = 시작점이 지평선에서 떨어진 거리 · R = 획의 가로 폭 · D = 소실점까지의 가로 거리 */
function drawFar(h: number, R: number, D: number) {
  const s = session(W, 800)
  s.draw(100, HY, 1100, HY)
  s.app.doc.strokes.push({ id: 900, a: { x: 900, y: HY }, b: { x: 900, y: HY } })
  const A = { x: 700, y: HY + h }
  const B = { x: A.x - R, y: A.y - h * R / D }
  const st = s.draw(A.x, A.y, B.x, B.y)!
  return { s, st, an: analyze(s.app.doc) }
}

describe('2-e — 각 거리 대역에서 2점이 유지된다', () => {
  // 사람이 든 대역: 「화면 폭의 두세 배가 보통, 완만하면 5000px(≈4.2W)을 넘는다」
  const BANDS = [1, 2, 3, 5] as const

  it('**최악 구도**에서도 사람이 든 대역 전부가 선다 (고치기 전 0.7W에서 깨졌다)', () => {
    // 최악 = 지평선에 바짝 붙어(h=40) 짧게(R=300) 긋는 것. 이 조합의 경계가 6.7W다.
    for (const k of BANDS) {
      const { an } = drawFar(40, 300, k * W)
      expect(an.vps.length, `${k}W`).toBe(2)
      expect(an.fSource, `${k}W`).toBe('two-vp')
    }
  })

  it('h를 바꿔도 그 대역이 유지된다 — 경계가 h에 **끌려가지 않는다**', () => {
    // 고치기 전에는 h가 경계를 그대로 정했다(h×20): h=40이면 0.7W에서 이미 깨졌다.
    for (const h of [40, 80, 150, 250, 400]) {
      for (const k of BANDS) {
        expect(drawFar(h, 300, k * W).an.vps.length, `h=${h} ${k}W`).toBe(2)
      }
    }
  })

  // ⛔ **web2-06 지시 2가 이 조항을 뒤집었다.** 「긴 획은 20W까지」는 이제 **안 선다** —
  //    `VP_FAR_W = 6`이 대역을 6W에서 끊는다. 통과/실패로 안 적고 **뒤집힌 것으로 적는다**
  //    (#57: 규칙이 바뀌면 그 규칙을 재던 조항을 함께 처리한다).
  //    잃은 것: 6W 밖을 **그어서** 만드는 길. 얻은 것: 수평 의도가 손 겨냥 오차를 흡수한다
  //    (실측 대비표는 NOTES의 web2-06 지시 2 절). 6W 밖은 **지평선 위를 찍어** 만든다.
  it('⛔(뒤집힘) 길이는 이제 대역을 안 늘린다 — 경계가 6W에서 끊긴다', () => {
    for (const k of [1, 2, 3, 5]) {
      expect(drawFar(150, 600, k * W).an.vps.length, `${k}W`).toBe(2)   // 사람이 든 대역은 그대로
    }
    for (const k of [8, 10, 20]) {
      expect(drawFar(150, 600, k * W).an.vps.length, `${k}W`).toBe(1)   // ← 고치기 전에는 2였다
    }
    // 길이를 늘려도 같다 — 경계가 h·R에 안 끌려간다(그것이 이 회차가 바꾼 것이다)
    expect(drawFar(150, 1200, 10 * W).an.vps.length).toBe(1)
    // 짧은 획은 종전대로 `PARALLEL_PX`가 먼저 끊는다(경계 = min(6W, h·R/1.5) 중 뒤 항)
    expect(drawFar(150, 150, 20 * W).an.vps.length).toBe(1)
  })

  it('그 획이 실제로 새 축이 된다 — 만들어 놓고 안 쓰면 소용없다', () => {
    // ⚠ 10W였다 — web2-06 지시 2로 그 거리가 대역 밖이 되어 **5W로 내렸다**(경계는 6W).
    const { s, st, an } = drawFar(150, 600, 5 * W)
    expect(an.vps).toHaveLength(2)
    expect(axisOfStroke(an, DRAW_POSE, st.a, st.b)).toBe('vp1')
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
  })

  it('세 축은 그 대역에서도 서로 직교한다', () => {
    for (const k of BANDS) {
      const { an } = drawFar(150, 600, k * W)
      const d = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z
      const ax = an.axes
      expect(ax, `${k}W`).toHaveLength(3)
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        expect(Math.abs(d(ax[i]!.dir, ax[j]!.dir)), `${k}W ${ax[i]!.id}·${ax[j]!.id}`).toBeLessThan(1e-12)
      }
    }
  })
})

describe('2-b — 경계는 어디이고 무엇의 함수인가', () => {
  // ⛔ **web2-06 지시 2가 경계를 둘로 만들었다** — `min(6W, h·R/1.5)`.
  //    앞 항(6W)이 「그 소실점이 작도 대역 안인가」(구도가 답한다), 뒤 항이 종전의
  //    「이 획으로 무한원과 구별할 수 있는가」(포인터가 답한다)다. 둘은 OR이고,
  //    **거의 언제나 6W가 먼저 걸린다** — h·R < 10800인 아주 짧고 낮은 획에서만 뒤 항이 이긴다.
  it('경계는 `min(6W, h·R/1.5)`이다 — 두 물음의 최솟값', () => {
    expect(C.PARALLEL_PX).toBe(1.5)
    expect(C.VP_FAR_W).toBe(6)
    const edge = (h: number, R: number) => Math.min(C.VP_FAR_W * W, h * R / C.PARALLEL_PX)
    for (const [h, R] of [[40, 300], [150, 600], [400, 400], [10, 100]] as const) {
      const E = edge(h, R)
      expect(drawFar(h, R, E * 0.9).an.vps.length, `h=${h} R=${R} 안쪽`).toBe(2)
      expect(drawFar(h, R, E * 1.3).an.vps.length, `h=${h} R=${R} 바깥`).toBe(1)
    }
    // **어느 항이 이겼나** — 앞의 셋은 6W, 마지막(h=10·R=100)만 처짐이 이긴다
    expect(edge(40, 300)).toBe(C.VP_FAR_W * W)
    expect(edge(150, 600)).toBe(C.VP_FAR_W * W)
    expect(edge(10, 100)).toBeCloseTo(667, 0)
  })

  it('그 경계가 사람이 든 작도 대역 밖이다 — 1~5W는 안, 6W가 경계', () => {
    // 사람이 든 대역: 「보통 2~3W, 완만하면 5000px(≈4.2W)」
    expect(5000 / W).toBeLessThan(C.VP_FAR_W)
    expect(C.VP_FAR_W).toBeGreaterThan(5)
    // ⛔ 옛 조항(「최악 구도에서도 6.7W · 흔한 구도는 50W」)은 **뒤집혔다** —
    //    그 수들은 뒤 항(h·R/1.5)의 값이고 이제 앞 항이 먼저 걸린다. 크기의 근거로만 읽는다.
  })

  it('반례: 경계 밖에서는 «수평»으로 읽는 것이 맞다 — 처짐이 포인터 잡음 아래다', () => {
    const { st, an } = drawFar(40, 300, 40 * 300 / C.PARALLEL_PX * 2)  // 처짐 0.75px
    expect(Math.abs(st.b.y - st.a.y)).toBeLessThan(C.PARALLEL_PX)
    expect(an.vps).toHaveLength(1)
    expect(an.screenHDeclared).toBe(true)      // H로 읽었고
    expect(an.p1Locked).toBe(true)             // 1점으로 잠갔다 — 그것이 맞는 판정이다
  })
})

describe('2-d — 같은 형태가 남아 있는가: 임계를 **획 길이**로 나누던 자리', () => {
  // ⚠ 이 describe의 첫 판은 **아무것도 안 쟀다**(D-3이 잡았다). 짧은 획만 썼는데
  //    이 결함은 **긴 획에서만** 난다 — 길수록 절대 허용이 커지는 것이 결함의 내용이다.
  //    그리고 1점 상태에서는 H가 후보로 남아 늘 H가 이겨서 판정이 가려졌다.
  //    되살려 보고 통과하는 것을 확인한 뒤 아래로 다시 썼다.

  it('긴 획이 **향이 반대인** 기존 소실점에 붙지 않는다 — 그래서 새 소실점이 선다', () => {
    // 실측 기하: (700,440)에서 왼쪽으로 875px, 소실점은 왼쪽 3200px.
    //   d/L      = 0.0486 ≤ 0.06  → 「vp0(오른쪽)에 붙었다」 ← 결함
    //   d/|a→vp| = 0.208  > 0.06  → 안 붙는다 ← 맞다 (실제 각도 12°)
    const { an, st } = drawFar(40, 875, 3200)
    expect(Math.abs(st.b.y - st.a.y)).toBeGreaterThan(C.PARALLEL_PX)  // H 갈래가 아니다
    expect(an.vps, '긴 획이 vp0에 붙어 새 소실점을 못 만들었다').toHaveLength(2)
  })

  it('같은 각도면 길이와 무관하게 같은 판정이다 — 임계가 길이에 안 끌려간다', () => {
    // vp0을 향해 정확히 겨눈 획: 길이가 얼마든 vp0이다(양성 채널 — 아래 반례와 짝이다)
    const s = session(W, 800)
    s.draw(100, HY, 1100, HY)
    s.app.doc.strokes.push({ id: 900, a: { x: 900, y: HY }, b: { x: 900, y: HY } })
    const an = analyze(s.app.doc)
    const A = { x: 500, y: 500 }
    const dir = { x: 900 - A.x, y: 400 - A.y }
    const n = Math.hypot(dir.x, dir.y)
    for (const len of [80, 200, 400]) {
      const B = { x: A.x + dir.x / n * len, y: A.y + dir.y / n * len }
      expect(axisOfStroke(an, DRAW_POSE, A, B), `len=${len}`).toBe('vp0')
    }
  })

  it('반례: 같은 각도로 **빗나간** 획은 길이와 무관하게 안 붙는다', () => {
    // 여기가 판별자다. `d/L`이면 길이가 늘수록 붙어 버린다.
    const s = session(W, 800)
    s.draw(100, HY, 1100, HY)
    s.app.doc.strokes.push({ id: 900, a: { x: 900, y: HY }, b: { x: 900, y: HY } })
    s.app.doc.strokes.push({ id: 901, a: { x: -3000, y: HY }, b: { x: -3000, y: HY } })
    const an = analyze(s.app.doc)          // 2점 — H가 후보에서 빠져 판정이 안 가려진다
    expect(an.axes.map(a => a.id).sort()).toEqual(['V', 'vp0', 'vp1'])
    const A = { x: 500, y: 500 }
    const dir = { x: 900 - A.x, y: 400 - A.y }
    const n = Math.hypot(dir.x, dir.y)
    const th = 10 * Math.PI / 180                     // vp0에서 10° 빗나가게 튼다
    const u = { x: dir.x / n * Math.cos(th) - dir.y / n * Math.sin(th),
                y: dir.x / n * Math.sin(th) + dir.y / n * Math.cos(th) }
    for (const len of [80, 200, 400, 900]) {
      const B = { x: A.x + u.x * len, y: A.y + u.y * len }
      expect(axisOfStroke(an, DRAW_POSE, A, B), `len=${len}`).not.toBe('vp0')
    }
  })
})

describe('2-d — 픽스처를 실제 작도 대역으로 넓혔다', () => {
  // `constructedDoc()`는 소실점이 0.25W·0.4W로 **화면 안**이다. 그 좁음이 이 결함을
  // 단위·종단 어디서도 안 걸리게 했다. `wideDoc()`는 2.5W·3W다.
  it('먼 구도에서도 축은 셋이고 서로 직교한다', () => {
    const an = analyze(wideDoc().doc)
    expect(an.vps).toHaveLength(2)
    expect(an.fSource).toBe('two-vp')
    expect(an.axes.map(a => a.id).sort()).toEqual(['V', 'vp0', 'vp1'])
    const d = (x: any, y: any) => x.x * y.x + x.y * y.y + x.z * y.z
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      expect(Math.abs(d(an.axes[i]!.dir, an.axes[j]!.dir))).toBeLessThan(1e-12)
    }
  })

  it('먼 구도에서도 그린 획이 3D로 올라간다', () => {
    const s = session(W, 800)
    s.draw(100, HY, 1100, HY)
    s.app.doc.strokes.push({ id: 900, a: { x: 3600, y: HY }, b: { x: 3600, y: HY } })
    s.app.doc.strokes.push({ id: 901, a: { x: -3000, y: HY }, b: { x: -3000, y: HY } })
    const v = s.draw(500, 650, 500, 480)!      // 수직 — 첫 선이므로 아래점이 지면
    const d1 = s.draw(500, 650, 700, 630)!     // 그 모서리에서 vp0 쪽
    expect(s.app.lift.waiting).toEqual([])
    expect(s.app.lift.lifted.get(v.id)!.axis).toBe('V')
    expect(s.app.lift.lifted.get(d1.id)!.axis).toBe('vp0')
    expect(Math.abs(s.app.lift.lifted.get(d1.id)!.a3.y)).toBeLessThan(1e-9)  // 지면
  })

  it('f가 두 소실점에서 나온다 — 먼 구도의 화각', () => {
    const an = analyze(wideDoc().doc)
    expect(an.f! * an.f!).toBeCloseTo(3000 * 3600, 3)
    // f/W ≈ 2.74 → 아주 좁은 화각(망원). 이론서 18.4의 상한은 없다(D-L93).
    expect(an.f! / W).toBeGreaterThan(2)
  })
})
