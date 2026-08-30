// 축척·재기·어긋남(web2-32 5·6·7번) — **세 항목이 한 몸이다.**
//
//   적은 값 = 정한 값       손글씨 치수(32-1·32-2)
//   잰 값   = 모델이 가진 값  재기(32-6)
//   첫 치수가 축척을 정한다(32-5) → 둘째부터 두 값이 갈릴 수 있다 → 어긋남(32-7)
//
// D-2(재현 먼저): 30-6이 「어긋남이 늘 0이다」로 걸렸고 그 0은 **표본이 하나**여서였다.
// 아래 ①이 그 0을 먼저 재현하고, ②가 둘째 치수로 발화시킨다.
// D-3(반증 조건): 어긋나지 «않는» 픽스처에서 안 뜨는 것 · 첫 치수를 지우면 미정으로
// 돌아오는 것 · 잰 값이 파일에 숫자로 안 들어가는 것 — 셋 다 실제로 실패시켜 본다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { setDimension, addLayer, setLayerOn, type App } from '../src/app/state'
import { formatScale, formatRatio, dimSkew, skewOff, lenMm } from '../src/core/dim'
import { measureUnits, measureMm, identifyPoint, measurePoint3 } from '../src/core/measure'
import { liftAll } from '../src/core/lift'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { geomSize3 } from '../src/core/osnap'
import { C } from '../src/core/constants'
import { len3, sub3 } from '../src/core/vec'

/** 작도 + 길이가 **다른** 수직 기둥 둘 — 32-7 지시의 픽스처다(「서로 다른 길이의 두 선」) */
function two() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)                  // 지평선
  s.draw(500, 500, 600, 475)                   // 깊이선 1 → vp0
  s.draw(500, 500, 400, 475)                   // 깊이선 2 → vp1
  const post = s.draw(500, 500, 500, 380)!     // 기둥 A(수직)
  const post2 = s.draw(600, 475, 600, 400)!    // 기둥 B(수직) — A와 길이가 다르다
  expect(s.app.lift.lifted.has(post.id)).toBe(true)
  expect(s.app.lift.lifted.has(post2.id)).toBe(true)
  const L = (id: number) => {
    const g = s.app.lift.lifted.get(id)!
    return len3(sub3(g.b3, g.a3))
  }
  expect(Math.abs(L(post.id) / L(post2.id) - 1)).toBeGreaterThan(0.05)  // 정말 다르다
  return { s, app: s.app, post, post2, L }
}

const tol3 = (app: App) => C.MERGE_RATIO * Math.max(geomSize3(app.lift), 1e-9)

describe('32-5 축척 — 첫 치수가 정한다(있던 것을 화면에 드러낸다)', () => {
  it('치수가 없으면 미정이다 — 기준 획도 없다', () => {
    const { app } = two()
    expect(app.lift.mmPerUnit).toBeNull()
    expect(app.lift.scaleId).toBeNull()
    expect(formatScale(app.lift.mmPerUnit)).toBe('미정')
  })

  it('첫 치수가 확정으로 바꾼다 — 비가 수치로 나오고 «어느 치수가 정했는가»가 나온다', () => {
    const { app, post } = two()
    expect(setDimension(app, post.id, 2400)).toBe('scale')
    expect(app.lift.scaleId).toBe(post.id)
    // 비의 수치 — 「2400 mm ÷ 무치수 풀이 길이」 그대로다(새 경로 ⛔ · #54)
    const geom = app.lift.dimGeom.get(post.id)!
    expect(app.lift.mmPerUnit!).toBeCloseTo(2400 / geom, 9)
    expect(formatScale(app.lift.mmPerUnit)).toMatch(/^1 : [0-9.]+$/)
    // 기준 획의 dim이 화면 문구의 「기준」이다
    expect(app.doc.strokes.find(x => x.id === app.lift.scaleId)!.dim).toBe(2400)
  })

  it('첫 치수를 지우면 미정으로 돌아가고 다음 치수가 새로 정한다', () => {
    const { app, post, post2 } = two()
    setDimension(app, post.id, 2400)
    expect(app.lift.scaleId).toBe(post.id)
    // ① 치수 하나뿐 — 지우면 미정이다
    delete app.doc.strokes.find(x => x.id === post.id)!.dim
    delete app.doc.scaleRef
    let lf = liftAll(app.doc)
    expect(lf.mmPerUnit).toBeNull()
    expect(lf.scaleId).toBeNull()
    expect(formatScale(lf.mmPerUnit)).toBe('미정')
    // ② 다음 치수가 새로 정한다 — 기준이 그 획으로 간다
    app.doc.strokes.find(x => x.id === post2.id)!.dim = 1800
    lf = liftAll(app.doc)
    expect(lf.scaleId).toBe(post2.id)
    expect(lf.mmPerUnit).not.toBeNull()
  })

  it('반증(D-3): 축척이 미정인데 숫자가 나오면 이 표기는 아무것도 안 재는 것이다', () => {
    expect(formatScale(null)).toBe('미정')
    expect(formatScale(0)).toBe('미정')       // 퇴화도 미정이다(있는 척하지 않는다)
    expect(formatScale(2.5)).toBe('1 : 2.5')
  })
})

describe('32-7 어긋남 — 표시하되 고치지 않는다', () => {
  it('D-2 재현: **치수가 하나면 어긋남이 0이다** — 모형의 성질이 아니라 표본 수의 성질', () => {
    const { app, post } = two()
    setDimension(app, post.id, 2400)
    const k = dimSkew(app.lift, post.id)!
    expect(k.ratio).toBeCloseTo(1, 12)        // 그 획이 축척의 분모였다 — 구성상 0이다
    expect(skewOff(k)).toBe(false)
  })

  it('둘째 치수에 축척과 어긋나는 값을 적으면 **검출된다** (비가 1이 아니다)', () => {
    const { app, post, post2 } = two()
    setDimension(app, post.id, 2400)                       // 첫째 — 축척을 정한다
    const g0 = app.lift.lifted.get(post2.id)!
    const trueMm = lenMm(g0.a3, g0.b3, app.lift.mmPerUnit)!
    expect(setDimension(app, post2.id, trueMm * 1.5)).toBe('applied')  // 어긋나는 값
    const k = dimSkew(app.lift, post2.id)!
    expect(k.ratio).toBeCloseTo(1.5, 6)
    expect(Math.abs(k.ratio - 1)).toBeGreaterThan(C.DIM_SKEW_RATIO * 10)  // 문턱의 열 배 밖
    expect(skewOff(k)).toBe(true)
    expect(k.measured).toBeCloseTo(trueMm, 6)
    // ⚠⚠ **반증(D-3) — 이 검사가 무엇을 안 재는지**: 치수를 «적용한 뒤» 길이로 재면
    // 리프팅이 그 획을 dim으로 늘려 놓았으므로 비가 **정확히 1**이다(구성상 항등 —
    // #77 ㉡ · 29-2가 그 자리에서 1.000000을 얻고 기능을 걷었다). 같은 픽스처에서
    // 두 자가 갈리는 것을 여기서 보인다: 항등 쪽 1.000000 ↔ 적용 전 쪽 1.5.
    const g1 = app.lift.lifted.get(post2.id)!
    const afterMm = lenMm(g1.a3, g1.b3, app.lift.mmPerUnit)!
    expect(afterMm / app.doc.strokes.find(x => x.id === post2.id)!.dim!).toBeCloseTo(1, 9)
    expect(k.ratio).not.toBeCloseTo(1, 2)
    // **고치지 않는다** — 적은 값이 그대로 남는다(#61)
    expect(app.doc.strokes.find(x => x.id === post2.id)!.dim).toBeCloseTo(trueMm * 1.5, 6)
  })

  it('반증(D-3): 어긋나지 않는 픽스처에서는 안 뜬다 — 문턱 안쪽도 안 뜬다', () => {
    const { app, post, post2 } = two()
    setDimension(app, post.id, 2400)
    const g = app.lift.lifted.get(post2.id)!
    const trueMm = lenMm(g.a3, g.b3, app.lift.mmPerUnit)!
    setDimension(app, post2.id, trueMm)                    // 딱 맞는 값
    expect(skewOff(dimSkew(app.lift, post2.id))).toBe(false)
    // 문턱의 절반만 어긋나게 하면 여전히 조용하다(문턱이 실제로 자를 하고 있다)
    setDimension(app, post2.id, trueMm * (1 + C.DIM_SKEW_RATIO / 2))
    expect(skewOff(dimSkew(app.lift, post2.id))).toBe(false)
    // 두 배로 넘기면 뜬다 — 같은 픽스처에서 갈린다
    setDimension(app, post2.id, trueMm * (1 + C.DIM_SKEW_RATIO * 2))
    expect(skewOff(dimSkew(app.lift, post2.id))).toBe(true)
  })

  it('축척이 미정이면 어긋남도 없다 — 잴 자가 없다', () => {
    const { app, post } = two()
    expect(dimSkew(app.lift, post.id)).toBeNull()
  })
})

describe('32-6 재기 — 잰 값은 파생이다', () => {
  it('축척이 정해지면 잰 값이 실제 거리와 일치한다', () => {
    const { app, post, post2 } = two()
    setDimension(app, post.id, 2400)
    const A = { s: post.id, t: 0 }, B = { s: post.id, t: 1 }
    expect(measureMm(app.lift, { a: A, b: B })!).toBeCloseTo(2400, 6)
    // 다른 획도 — 그 획의 실제 3D 길이 그대로
    const g = app.lift.lifted.get(post2.id)!
    expect(measureMm(app.lift, { a: { s: post2.id, t: 0 }, b: { s: post2.id, t: 1 } })!)
      .toBeCloseTo(lenMm(g.a3, g.b3, app.lift.mmPerUnit)!, 6)
  })

  it('축척이 미정이면 숫자 대신 비율이다 — mm가 안 나간다', () => {
    const { app, post } = two()
    const m = { a: { s: post.id, t: 0 }, b: { s: post.id, t: 1 } }
    expect(measureMm(app.lift, m)).toBeNull()
    const u = measureUnits(app.lift, m)!
    expect(u).toBeGreaterThan(0)
    expect(formatRatio(u)).toMatch(/^1 : [0-9.]+$/)
    expect(formatRatio(u)).not.toMatch(/mm|cm|m$/)
  })

  it('축척이 바뀌면 잰 값이 따라 바뀐다 — 저장된 숫자가 아니다', () => {
    const { app, post, post2 } = two()
    const m = { a: { s: post2.id, t: 0 }, b: { s: post2.id, t: 1 } }
    setDimension(app, post.id, 2400)
    const v1 = measureMm(app.lift, m)!
    setDimension(app, post.id, 4800)          // 같은 획에 다시 입력 = 축척이 두 배
    const v2 = measureMm(app.lift, m)!
    expect(v2 / v1).toBeCloseTo(2, 6)
  })

  it('두 점의 «정체»가 오스냅 네 갈래에서 다 잡힌다 (D-5 — 하나만 되면 실사용에서 걸린다)', () => {
    const { app, post } = two()
    setDimension(app, post.id, 2400)
    const g = app.lift.lifted.get(post.id)!
    const at = (t: number) => ({ x: g.a3.x + (g.b3.x - g.a3.x) * t,
                                 y: g.a3.y + (g.b3.y - g.a3.y) * t,
                                 z: g.a3.z + (g.b3.z - g.a3.z) * t })
    const t = tol3(app)
    expect(identifyPoint(app.lift, g.a3, t)).toEqual({ s: post.id, t: 0 })       // 끝점
    expect(identifyPoint(app.lift, g.b3, t)!.t).toBeCloseTo(1, 9)                // 끝점
    expect(identifyPoint(app.lift, at(0.5), t)!.t).toBeCloseTo(0.5, 9)           // 중점
    expect(identifyPoint(app.lift, at(0.25), t)!.t).toBeCloseTo(0.25, 9)         // 근처점·교점
    // 그 정체가 다시 좌표를 낸다(왕복)
    const back = measurePoint3(app.lift, identifyPoint(app.lift, at(0.25), t)!)!
    expect(back.x).toBeCloseTo(at(0.25).x, 9)
  })

  it('반증(D-3): 어느 선분에도 안 붙는 점은 정체가 없다 — 도면에 못 남긴다', () => {
    const { app } = two()
    const far = { x: 1e6, y: 1e6, z: 1e6 }
    expect(identifyPoint(app.lift, far, tol3(app))).toBeNull()
  })

  it('겹에서 잰 것이 아래 종이에 안 나타난다 (26-1 회귀)', () => {
    // 소유는 «어느 획을 재는가»가 정한다 — 새 규칙 ⛔(#54): 그 획이 안 보이면
    // `lifted`에서 빠지고, 그러면 잰 점이 안 풀려 화면에도 값에도 안 나온다.
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    const base = s.draw(500, 500, 800, 325)!
    const lay = addLayer(s.app, 'tracing', { W, H })!
    const onLayer = s.draw(500, 500, 300, 450)!
    expect(onLayer.layer).toBe(lay.id)
    setDimension(s.app, base.id, 2000)
    const m = { a: { s: onLayer.id, t: 0 }, b: { s: onLayer.id, t: 1 } }
    expect(measureMm(s.app.lift, m)).not.toBeNull()      // 겹이 켜져 있을 때는 잰다
    setLayerOn(s.app, lay.id, false)
    expect(measureMm(s.app.lift, m)).toBeNull()          // 끄면 아래 종이에 안 나타난다
    expect(measurePoint3(s.app.lift, m.a)).toBeNull()
    setLayerOn(s.app, lay.id, true)
    expect(measureMm(s.app.lift, m)).not.toBeNull()      // 다시 켜면 돌아온다
  })

  it('⛔ **잰 값이 파일에 숫자로 저장되지 않는다** — 남는 것은 「어느 두 점」뿐이다', () => {
    const { app, post, post2 } = two()
    setDimension(app, post.id, 2400)
    app.doc.measures = [{ id: 9001, a: { s: post.id, t: 0 }, b: { s: post2.id, t: 1 } }]
    const json = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const raw = JSON.parse(json)
    expect(raw.measures).toEqual([{ id: 9001, a: { s: post.id, t: 0 }, b: { s: post2.id, t: 1 } }])
    // 직렬화 어디에도 잰 값(mm)이 없다 — 눈으로 확인하는 자리다(지시 문면)
    const mm = measureMm(app.lift, app.doc.measures[0]!)!
    expect(mm).toBeGreaterThan(0)
    expect(JSON.stringify(raw.measures)).not.toContain(String(Math.round(mm)))
    // 왕복해도 값은 «다시 계산»으로만 나온다
    const back = parseBrnl(json)!
    expect(back.doc.measures).toEqual(app.doc.measures)
    expect(measureMm(liftAll(back.doc), back.doc.measures![0]!)!).toBeCloseTo(mm, 6)
  })
})
