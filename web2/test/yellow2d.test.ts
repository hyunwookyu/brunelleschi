// web2-22 1부 — **옐로는 작도가 멈춘 종이**(2D). 게이트 = ①②③④.
//
// 성질 표(지시 1-a): 옐로 겹의 획은 축 스냅 ✕ · 3D 승격 ✕ · 오스냅 대상 ✕ ·
// 소실점 ✕ · 다른 종이에서 안 보임(2D — 표시 팔은 e2e). 트레이싱지는 **아무것도 안
// 바뀐다**(④ 회귀). 판정 출처는 Stroke.layer → Layer.paper 하나(#54 — 새 필드 ⛔).
//
// 반증(D-3 — 지시 문면 «둘 다 실제로 돌린다»): ㉮ 옐로 우회를 빼면(입력이 종전
// resolve를 타면) ①이 실패한다 ㉯ 1-c 전 코드(«전» 판)와의 대조 — ⚠ 지시의 «기울기
// 악화» 예측은 측정이 반증했다(변동 대역): 가르는 채널은 **후보 구조**(대기 588→200 ·
// 옐로 승격 14→0)다. 실행 기록은 NOTES 1부·0부·리뷰 대응 절.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { addLayer, setActiveLayer } from '../src/app/state'
import { osnap, defaultOsnap } from '../src/core/osnap'
import { DRAW_POSE } from '../src/core/camera'
import { axisOfStroke } from '../src/core/lift'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { liftAll } from '../src/core/lift'

const W = 1200, H = 800

/** 카메라 닫힌 픽스처 + 옐로 한 장(활성) */
function yellowSession() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  const base = s.draw(500, 500, 800, 425)!          // 바탕 획(vp0 — 3D)
  const lay = addLayer(s.app, 'yellow', { W, H })!
  expect(s.app.activeLayer).toBe(lay.id)
  return { s, lay, base }
}

describe('① 축 스냅이 안 걸린다 — 자유 방향 그대로 확정된다(각도 값)', () => {
  it('축 대역 «안»의 각도(수평서 3° 처짐)도 그대로 남는다 — 손 오차 대역(#68)', () => {
    const { s } = yellowSession()
    // 수평(H 축)에 3° 기울인 획 — 바탕이라면 축 스냅이 수평으로 눌렀을 각도다
    const a = { x: 300, y: 300 }, L = 200, deg = 3
    const b = { x: a.x + L * Math.cos(deg * Math.PI / 180), y: a.y + L * Math.sin(deg * Math.PI / 180) }
    const st = s.draw(a.x, a.y, b.x, b.y)!
    const angle = Math.atan2(st.b.y - st.a.y, st.b.x - st.a.x) * 180 / Math.PI
    expect(Math.abs(angle - deg)).toBeLessThan(1e-9)           // 각도가 그대로다
    expect(st.a).toEqual(a)                                    // 시작점 오스냅도 없다
    // 대조(같은 각도를 바탕에) — 축 스냅이 실제로 눌렀을 격자임을 증명(#69 ㉣)
    setActiveLayer(s.app, null)
    const bg = s.draw(a.x, a.y + 200, b.x, b.y + 200)!
    const bgAngle = Math.atan2(bg.b.y - bg.a.y, bg.b.x - bg.a.x) * 180 / Math.PI
    expect(Math.abs(bgAngle - deg)).toBeGreaterThan(1)         // 바탕은 축으로 붙었다(≈0°)
  })
})

describe('② 3D 승격이 없다 — lifted에도 waiting에도 없다', () => {
  it('연결될 자리(3D 끝점)에서 시작해도 안 올라간다 · 대기도 아니다', () => {
    const { s } = yellowSession()
    const st = s.draw(500, 500, 300, 450)!           // 바탕 모서리에서 시작 — 트레이싱지라면 승격
    expect(s.app.lift.lifted.has(st.id)).toBe(false)
    expect(s.app.lift.waiting.includes(st.id)).toBe(false)
    // 대조 — 같은 획이 트레이싱지에서는 올라간다(격자가 실패 가능함의 증명)
    const s2t = yellowSession().s
    setActiveLayer(s2t.app, null)
    const tr = addLayer(s2t.app, 'tracing', { W, H })!
    expect(s2t.app.activeLayer).toBe(tr.id)
    const st2 = s2t.draw(500, 500, 300, 450)!
    expect(s2t.app.lift.lifted.has(st2.id)).toBe(true)
  })
})

describe('③ 오스냅 대상이 아니다', () => {
  // 재는 방향(0·1부 리뷰 [12]): ㉠ **후보 제외** — osnap()을 직접 호출해 옐로 획이
  // 후보 집합에 없음을 잰다(입력 우회와 무관한 층 — lift 제외의 자동 귀결 #54).
  // ㉡(입력 우회 쪽 «옐로에서 그을 때 안 붙음»)은 ① 팔의 시작점 무스냅 단언이 잰다.
  it('옐로 획의 끝점 바로 옆을 조준해도 아무것도 안 잡힌다', () => {
    const { s } = yellowSession()
    const st = s.draw(300, 300, 500, 320)!
    const set = { ...defaultOsnap(), radius: 8 }
    // 끝점 1px 옆 — 바탕 획이라면 end가 잡힐 자리다
    expect(osnap(s.app.lift, DRAW_POSE, { x: st.b.x + 1, y: st.b.y + 1 }, set)).toBeNull()
    // 대조 — 바탕 획의 끝점은 같은 조준에서 잡힌다
    expect(osnap(s.app.lift, DRAW_POSE, { x: 801, y: 426 }, set)?.kind).toBe('end')
  })
})

describe('④ 트레이싱지·바탕은 종전과 같다 (회귀) · 소실점 불변', () => {
  it('옐로 자유 획 여럿이 카메라(vps·f·principal)를 안 움직인다', () => {
    const { s } = yellowSession()
    const before = {
      vps: s.app.lift.an.vps.map(v => ({ x: v.x, y: v.y })),
      f: s.app.lift.an.f,
      p: { ...s.app.lift.an.principal! },
    }
    // 소실점·수평 선언으로 읽힐 수 있는 각도들(수평 정확·지평선 교차 방향 포함)
    s.draw(200, 300, 700, 300)
    s.draw(200, 600, 800, 430)
    s.draw(600, 200, 900, 500)
    expect(s.app.lift.an.vps.map(v => ({ x: v.x, y: v.y }))).toEqual(before.vps)
    expect(s.app.lift.an.f).toBe(before.f)
    expect(s.app.lift.an.principal).toEqual(before.p)
  })

  it('트레이싱지 획은 종전대로 축·승격·오스냅을 탄다(layerrule·layer3d 팔의 재확인)', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    addLayer(s.app, 'tracing', { W, H })
    const st = s.draw(500, 500, 300, 452)!            // vp1 방향(손 오차 2px)
    expect(s.app.lift.lifted.has(st.id)).toBe(true)   // 승격 ✓
    expect(axisOfStroke(s.app.lift.an, DRAW_POSE, st.a, st.b)).toBe('vp1')   // 축 ✓
    const set = { ...defaultOsnap(), radius: 8 }
    expect(osnap(s.app.lift, DRAW_POSE, { x: st.b.x + 1, y: st.b.y + 1 }, set)?.kind).toBe('end')  // 오스냅 ✓
  })
})

describe('⑥ 저장·복원 왕복 — 옐로 획이 2D로 남는다', () => {
  it('.brnl 왕복 뒤에도 lifted·waiting 밖 · layer 소속 유지', () => {
    const { s, lay } = yellowSession()
    const st = s.draw(300, 300, 520, 360)!
    const back = parseBrnl(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))!
    const lift = liftAll(back.doc)
    expect(back.doc.strokes.find(x => x.id === st.id)!.layer).toBe(lay.id)
    expect(back.doc.layers.find(l => l.id === lay.id)!.paper).toBe('yellow')
    expect(lift.lifted.has(st.id)).toBe(false)
    expect(lift.waiting.includes(st.id)).toBe(false)
  })
})
