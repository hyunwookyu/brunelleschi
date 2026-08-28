// web2-20 4부 — 겹과 3D.
//   ① 소실점 획이 든 겹을 꺼도 vps·f·principal 그대로(analyze는 겹을 안 본다 — 2-a로
//     실제로는 소실점 획이 겹에 못 들지만 규칙은 규칙이다: 문서를 손으로 만들어 태운다)
//   ② 꺼진 겹 획이 lifted에서 빠진다  ③ 그 획에 점이 안 물린다(오스냅 자동 제외)
//   ④ 껐다 켜면 3D가 같다(좌표 값 — own3 필드 유지)  ⑤ 잠근 겹이 물리고 안 지워진다
//   ⑥ 경계가 꺼진 겹에 있는 면이 대기가 된다(불변식 j)
//   반증(D-3 — 둘 다 실제 실행): liftAll의 겹 필터를 끄면 ②가 실패한다(우회 경로로 실증) ·
//     analyze에 필터가 «있다면» ①이 실패한다(꺼진 겹의 소실점 획을 뺀 analyze와 대조).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { addLayer, setActiveLayer, setLayerOn, setLayerLocked, beginErase, eraseAt, endErase } from '../src/app/state'
import { liftAll } from '../src/core/lift'
import { analyze } from '../src/core/camera'
import { osnap, defaultOsnap } from '../src/core/osnap'
import { resolveFaces } from '../src/core/face'

const W = 1200, H = 800

function closedSession() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

describe('①③ analyze는 겹을 안 본다 · 꺼진 겹 획은 점이 안 물린다', () => {
  it('① 소실점 획을 손으로 겹에 넣고 꺼도 카메라 불변 (+반증: analyze에 필터를 넣으면 갈린다)', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    // 규칙의 판을 실제로 태운다(2-a가 막는 상태를 손으로 만든다) — 소실점 획을 겹에 소속
    const vpStroke = s.app.doc.strokes[1]!
    vpStroke.layer = lay.id
    setLayerOn(s.app, lay.id, false)
    const an = s.app.lift.an
    expect(an.vps.length).toBe(1)
    expect(an.vps[0]!.x).toBeCloseTo(1100, 6)
    expect(an.f).not.toBeNull()
    // 반증 — «analyze가 겹을 본다면» 어떻게 갈리는지: 꺼진 겹 획을 뺀 문서의 analyze는
    // 소실점을 잃는다. 지금 analyze가 그와 **다르다**는 것이 ①의 내용이다.
    const filtered = analyze({ ...s.app.doc, strokes: s.app.doc.strokes.filter(x => x.layer === undefined) })
    expect(filtered.vps.length).toBe(0)
    expect(an.vps.length).not.toBe(filtered.vps.length)
    vpStroke.layer = undefined   // 뒷정리(다른 팔과 공유 안 하지만 명시)
  })

  it('③ 꺼진 겹 획의 끝점에 오스냅이 안 물린다(리프팅 제외의 자동 귀결 — 별도 필터 없음)', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    // 앵커(수평 3D 선) 위에서 내려긋는 수직 — 연결돼 승격되는 획(자유 획은 대기라 못 쓴다)
    const st = s.draw(400, 560, 400, 640)!
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
    const set = { ...defaultOsnap(), radius: 8 }
    const hit1 = osnap(s.app.lift, s.app.pose, { x: 401, y: 641 }, set)
    expect(hit1?.kind).toBe('end')
    setLayerOn(s.app, lay.id, false)
    const hit2 = osnap(s.app.lift, s.app.pose, { x: 401, y: 641 }, set)
    expect(hit2?.kind ?? null).not.toBe('end')         // 끝점 후보가 사라졌다
    expect(s.app.lift.lifted.has(st.id)).toBe(false)   // 리프팅에서 빠졌으니
  })
})

describe('②④ 리프팅 제외와 왕복', () => {
  it('② 꺼진 겹 획이 lifted에서 빠진다 · 대기에도 없다 (+반증: 필터를 우회하면 올라간다)', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    const st = s.draw(400, 560, 400, 640)!
    expect(s.app.lift.lifted.has(st.id)).toBe(true)
    setLayerOn(s.app, lay.id, false)
    expect(s.app.lift.lifted.has(st.id)).toBe(false)
    expect(s.app.lift.waiting.includes(st.id)).toBe(false)   // 꺼짐 ≠ 대기
    // 반증 — 겹 필터가 없다면(우회: layers를 켠 것처럼 바꾼 문서) 그 획이 올라간다.
    // «필터를 빼면 ②가 실패한다»를 우회 경로의 실행으로 실증한다.
    const bypass = liftAll({ ...s.app.doc, layers: s.app.doc.layers.map(l => ({ ...l, on: true })) })
    expect(bypass.lifted.has(st.id)).toBe(true)
  })

  it('④ 껐다 켜면 3D가 같다(좌표 값) · own3 필드가 산다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'yellow', { W, H })!
    setActiveLayer(s.app, lay.id)
    const st = s.draw(400, 560, 400, 640)!
    const seg0 = s.app.lift.lifted.get(st.id)!
    const own0 = s.app.doc.strokes.find(x => x.id === st.id)!.own3
    expect(seg0).toBeDefined()
    setLayerOn(s.app, lay.id, false)
    expect(s.app.doc.strokes.find(x => x.id === st.id)!.own3).toEqual(own0)   // 기록 유지
    setLayerOn(s.app, lay.id, true)
    const seg1 = s.app.lift.lifted.get(st.id)!
    expect(seg1.a3).toEqual(seg0.a3)
    expect(seg1.b3).toEqual(seg0.b3)
  })
})

describe('⑤⑥ 잠금과 면', () => {
  it('⑤ 잠근 겹의 획 — 점이 물리고(3D에 있다) 지우개가 못 지운다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    const st = s.draw(400, 560, 400, 640)!
    setLayerLocked(s.app, lay.id, true)
    expect(s.app.lift.lifted.has(st.id)).toBe(true)          // 보이고 3D에 있다
    const set = { ...defaultOsnap(), radius: 8 }
    expect(osnap(s.app.lift, s.app.pose, { x: 401, y: 641 }, set)?.kind).toBe('end')  // 물린다
    const n0 = s.app.doc.strokes.length
    beginErase(s.app)
    eraseAt(s.app, { x: 400, y: 600 })
    endErase(s.app)
    expect(s.app.doc.strokes.length).toBe(n0)                // 안 지워졌다
    // 반증 짝 — 잠금을 풀면 같은 지우개가 지운다(가드가 실제로 갈랐다)
    // ⚠ web2-21 2부부터 지우개는 **활성 층의 획만** 지운다(layerrule.test) — 잠그면
    // 활성이 풀리므로, 이 반증이 잠금 가드만 재려면 그 겹을 도로 활성으로 잡아야 한다.
    setLayerLocked(s.app, lay.id, false)
    setActiveLayer(s.app, lay.id)
    beginErase(s.app)
    eraseAt(s.app, { x: 400, y: 600 })
    endErase(s.app)
    expect(s.app.doc.strokes.length).toBeLessThan(n0)
  })

  it('⑥ 경계 획이 꺼진 겹에 있으면 그 면은 안 풀린다(불변식 j) — 켜면 돌아온다', () => {
    // 지면 삼각형(면이 풀리는 픽스처 — face.spec의 것) + 한 변을 겹으로
    const s = session(W, H)
    s.draw(500, 560, 760, 495)
    s.draw(500, 560, 240, 495)
    const edge = s.draw(760, 495, 240, 495)!
    expect(s.app.lift.lifted.size).toBe(3)
    // 면 지정(경계 셋)
    s.app.doc.faces.push({ id: 90, loops: [{ edges: s.app.doc.strokes.map(x => ({ kind: 'stroke' as const, s: x.id })) }] })
    expect(resolveFaces(s.app.lift, s.app.doc.faces).length).toBe(1)
    // 카메라를 닫고(겹을 얹으려면) — 위 픽스처는 vps 2가 이미 섰는지 확인
    if (!s.app.lift.an.constructionDone) {
      // 지면 삼각형은 2점을 세운다(두 깊이선) — 안 닫혔으면 이 픽스처가 못 쓰는 것
      expect(s.app.lift.an.constructionDone).toBe(true)
    }
    const lay = addLayer(s.app, 'tracing', { W, H })!
    edge.layer = lay.id                                     // 한 변을 겹 소속으로(손으로)
    setLayerOn(s.app, lay.id, false)
    expect(resolveFaces(s.app.lift, s.app.doc.faces).length).toBe(0)   // 면이 대기로
    setLayerOn(s.app, lay.id, true)
    expect(resolveFaces(s.app.lift, s.app.doc.faces).length).toBe(1)   // 돌아온다
  })
})
