// web2-24 4부 — **옐로가 실제로 프리핸드가 된다**: raw(손 점렬)가 옐로 획의 정본 기하다.
//
// D-2(재현 먼저): 이 파일의 ①·⑥은 수리 **전에 실패**해야 한다 — 지금 옐로 호는
// 시작·끝을 잇는 현으로 무너지고(brushlayer 「curvature 0」), 지우개는 옐로 획을
// **아예 못 집는다**(옐로는 lift 밖이라 pieces에 없다 — 코드 표식 D-1). 수리 전
// 실행의 실패 원문은 NOTES 4부 절에 있다.
//
// 팔(지시 4-e의 단위 몫):
//   ① 옐로에 호를 그으면 확정 기하가 곡선으로 남는다(현 대비 최대 이탈 값으로)
//   ② 머무르면 직선으로 갈음된다(raw=[a,b] — 이탈 0)
//   ④ 트레이싱지·바탕은 종전대로 직선이다(회귀 — raw 저장 규약 불변)
//   ⑥ 지우개가 곡선 몸통을 정확히 집는다(현으로 재면 실패하는 격자 — 화살 몸통에서
//      지우면 지워지고, 현 위(호에서 먼 자리)에서 지우면 안 지워진다)
//   + RDP 솎기: 눈에 안 보이는 임계(C.RAW_SIMPLIFY_PX)에서 원본 대비 이탈이 임계 아래
//
// 반증(D-3 — 지시 문면 「둘 다 실제로 돌린다」):
//   ㉮ raw 정본을 빼고 {a,b}로 되돌리면 ①이 실패하는가 — 수리 전 실행이 그것이다
//      (NOTES 4부에 원문). 이 파일 안에서는 «현만 남긴 기하»의 이탈이 0임을 같이 박는다.
//   ㉯ 솎기 임계를 5px로 키우면 이탈이 눈에 보인다 — yellowraw_measure가 5px 변이를
//      실제로 돌려 원장에 남기고, 여기서는 임계 대소를 단언한다.

import { describe, it, expect } from 'vitest'
import { createApp, commitStroke, beginErase, eraseAt, endErase, addLayer, type App } from '../src/app/state'
import { distToPolyline } from '../src/core/freehand'
import { C } from '../src/core/constants'
import { pt, type Pt } from '../src/core/vec'

const W = 1200, H = 800

/** 작도 완료(카메라 닫힘 — 겹은 그 뒤에만 얹힌다) + 옐로 겹 활성 */
function yellowApp(): App {
  const app = createApp(W, H)
  commitStroke(app, pt(500, 500), pt(600, 475))
  commitStroke(app, pt(500, 500), pt(400, 475))
  const lay = addLayer(app, 'yellow', { W, H })
  expect(lay).not.toBeNull()
  return app
}

/** 손 호 — 현에서 sag px 처진 원호 점렬(coalesced 대역: 점 n개) */
function arc(a: Pt, b: Pt, sag: number, n = 40): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * sag
    pts.push({ x, y })
  }
  return pts
}

/** 점렬의 현(양 끝 직선) 대비 최대 이탈 px */
const chordDev = (pts: Pt[]): number => {
  const a = pts[0]!, b = pts[pts.length - 1]!
  let d = 0
  for (const p of pts) d = Math.max(d, distToPolyline(p, [a, b]))
  return d
}

describe('4부 ① — 옐로 호의 확정 기하가 곡선으로 남는다', () => {
  it('sag 30px 호 → 저장된 raw의 현 대비 이탈이 호를 따른다', () => {
    const app = yellowApp()
    const raw = arc(pt(300, 300), pt(700, 320), 30)
    const s = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
    // 정본 기하 = raw 점렬(항상 실린다 — 4-b 「저장」)
    expect(s.raw, '옐로 획은 raw를 항상 싣는다').toBeDefined()
    const dev = chordDev(s.raw!)
    // 호의 sag 30px이 확정 기하에 남는다(솎기 임계 0.5px 안 오차)
    expect(dev).toBeGreaterThan(30 - 1)
    expect(dev).toBeLessThan(30 + 1)
    // 반증 ㉮의 산술 반쪽 — «현만 남긴 기하»({a,b})라면 이탈이 정확히 0이라 위 단언이
    // 실패한다(수리 전 실행이 그 상태였다 — NOTES 4부 원문)
    expect(chordDev([s.a, s.b])).toBe(0)
  })

  it('RDP 솎기 — 원본 대비 이탈이 임계(0.5px) 아래, 점 수는 준다', () => {
    const app = yellowApp()
    const raw = arc(pt(300, 300), pt(700, 320), 30, 200)   // 촘촘한 손(coalesced 수백 점)
    const s = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
    expect(s.raw!.length).toBeLessThan(raw.length)
    // 원본 각 점 → 솎은 점렬까지 거리(표현 오차)
    let dev = 0
    for (const p of raw) dev = Math.max(dev, distToPolyline(p, s.raw!))
    expect(dev).toBeLessThanOrEqual(C.RAW_SIMPLIFY_PX)
  })
})

describe('4부 ② — 머무르면 직선으로 갈음(입력이 [a,b]를 보낸다 — 22 2부 그대로)', () => {
  it('held 확정(raw=[a,b]) → 이탈 0', () => {
    const app = yellowApp()
    // input.endDraft의 held 갈래가 보내는 그대로 — 점렬이 직선으로 갈음된 뒤의 커밋
    const s = commitStroke(app, pt(300, 300), pt(700, 320), [pt(300, 300), pt(700, 320)])
    expect(s.raw === undefined || chordDev(s.raw) === 0, '갈음 뒤 기하는 직선').toBe(true)
  })
})

describe('4부 ④ — 트레이싱지·바탕은 종전대로 직선이다(회귀)', () => {
  it('트레이싱지 겹의 호: 기하는 {a,b}(raw는 질감용 그대로 — 정본 아님)', () => {
    const app = createApp(W, H)
    commitStroke(app, pt(500, 500), pt(600, 475))
    commitStroke(app, pt(500, 500), pt(400, 475))
    const lay = addLayer(app, 'tracing', { W, H })!
    const raw = arc(pt(300, 300), pt(700, 320), 30)
    const s = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
    expect(s.layer).toBe(lay.id)
    // 종전 규약 그대로: raw는 «있으면 질감·필압용»이고 확정 기하는 a·b다.
    // 솎기도 안 걸린다(옐로만의 성질 — 4-b ⚠) — 점 수가 원본 그대로다.
    expect(s.raw!.length).toBe(raw.length)
  })

  it('바탕(겹 없음)의 호: 종전 그대로', () => {
    const app = createApp(W, H)
    commitStroke(app, pt(500, 500), pt(600, 475))
    commitStroke(app, pt(500, 500), pt(400, 475))
    const raw = arc(pt(500, 500), pt(700, 450), 10)
    const s = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
    expect(s.raw === undefined || s.raw.length === raw.length).toBe(true)
  })
})

describe('4부 ⑥ — 지우개가 곡선 몸통을 집는다(현으로 재면 실패하는 격자)', () => {
  // sag 40 호: 몸통 중앙 (500, 340)·현 중앙 (500, 300) — 지우개 반경 12보다 멀리
  // 떨어져 있어 «현으로 재는» 구현은 몸통 지우기가 실패하고 현 지우기가 성공한다(반대).
  function arcStroke(app: App) {
    const raw = arc(pt(300, 300), pt(700, 300), 40)
    return commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
  }
  const eraseOnce = (app: App, p: Pt) => { beginErase(app); eraseAt(app, p); endErase(app) }

  it('몸통(호 위)에서 지우면 지워진다', () => {
    const app = yellowApp()
    const s = arcStroke(app)
    eraseOnce(app, pt(500, 340))            // 호의 배 — 현에서 40px
    expect(app.doc.strokes.some(x => x.id === s.id), '호 몸통이 집힌다').toBe(false)
  })

  it('현 위(호에서 먼 자리)에서 지우면 안 지워진다 — 현으로 재는 구현의 반증', () => {
    const app = yellowApp()
    const s = arcStroke(app)
    eraseOnce(app, pt(500, 300))            // 현 중앙 — 호 몸통에서 40px
    expect(app.doc.strokes.some(x => x.id === s.id), '현은 잉크가 아니다').toBe(true)
  })

  it('활성 겹이 옐로가 아니면 옐로 획은 안 지워진다(층 규칙 회귀 — web2-21 2부)', () => {
    const app = yellowApp()
    const s = arcStroke(app)
    app.activeLayer = null                   // 종이로 내려온다
    eraseOnce(app, pt(500, 340))
    expect(app.doc.strokes.some(x => x.id === s.id)).toBe(true)
  })
})
