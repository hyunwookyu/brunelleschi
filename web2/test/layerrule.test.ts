// web2-21 2부 — **겹은 아래를 읽고, 아래를 안 바꾼다.**
//
// 2-a 재현(D-2 — 수리 전 실패를 실제로 봤다. NOTES 2부 절에 명령 출력 원문):
//   바탕에 방향 있는 대기선 B를 두고, 트레이싱지를 얹어 그 위에서 B 위에서 끝나는 획을
//   그으면 defineByTouch가 **바탕의** B를 정의했다(own3 — 사건의 기록이라 겹을 꺼도
//   안 풀린다). 대안을 그려 봤다 지워도 바탕 3D가 이미 바뀌어 있는 결함.
// 수리: defineByTouch에 층 문 — **같은 층 안에서만** 정의한다(missed.layer로 계수).
//   지우개는 **활성 층의 획만** 지운다(eraseAt — 잠금 가드와 별개).
// 반증(D-3): 층 조건을 빼면 ①이 실패한다 — 실제로 빼서 확인(NOTES 2부 절에 실행 기록).
//
// 픽스처는 vptouch.test의 fx()와 같은 좌표(교차 후보가 B의 끝점·중점 오스냅 밖 —
// 몸통 위 자리)를 쓴다 — 층만 다르게 배치한다.

import { describe, it, expect } from 'vitest'
import { session, type Session } from './session'
import { addLayer, setActiveLayer, setLayerOn, beginErase, eraseAt, endErase } from '../src/app/state'

const W = 1200, H = 800

/** 닫힌 카메라 + 바탕 대기선 B + 바탕 지면 깊이선 D1 (vptouch fx와 같은 좌표) */
function fx() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)              // 지평선
  s.draw(500, 500, 600, 475)               // → vp0 = (900,400)
  s.draw(500, 500, 400, 475)               // → vp1 = (100,400) — 닫힘
  const B = s.draw(690, 290, 840, 365)!    // 바탕 대기선(vp0 방향) — 허공 → 대기
  expect(s.app.lift.waiting).toContain(B.id)
  const D1 = s.draw(500, 500, 720, 445)!   // 바탕 지면 깊이선 — 끝 (720,445) 정의됨
  expect(s.app.lift.lifted.has(D1.id)).toBe(true)
  return { s, B, D1 }
}

/** 겹을 얹고 그 위에서 B 위에서 끝나는 수직 획 A를 긋는다(층 문을 두드리는 몸짓) */
function drawAcross(s: Session) {
  const lay = addLayer(s.app, 'tracing', { W, H })!
  const A = s.draw(720, 445, 722, 309)!    // 시작 = D1 끝(바탕 3D) · 뗀 끝 = B 몸통 위
  expect(A.layer).toBe(lay.id)
  return { lay, A }
}

describe('겹은 아래를 안 바꾼다 — defineByTouch 층 문 (①·②·⑤ 사유 계수)', () => {
  it('① 겹 획이 바탕 대기선 위에서 끝나도 바탕이 안 굳는다 (수리 전: 굳었다 — 재현)', () => {
    const { s, B } = fx()
    const { lay } = drawAcross(s)
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(b.own3, '바탕 B가 안 굳었다').toBeUndefined()
    expect(s.app.lift.waiting).toContain(B.id)
    expect(s.app.touchStats.layer, '층 무산이 계수됐다(조용히 버리지 않는다)').toBe(1)
    expect(s.app.touchStats.ok).toBe(0)
    // 겹을 꺼도 바탕은 그대로 대기다 — «대안을 지워도 바탕이 바뀌어 있다»의 부정
    setLayerOn(s.app, lay.id, false)
    expect(s.app.lift.waiting).toContain(B.id)
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3).toBeUndefined()
  })

  it('② 읽기는 산다 — 겹 획이 바탕 3D에 붙어 자기는 승격된다(matchPoint 경로)', () => {
    const { s } = fx()
    const { A } = drawAcross(s)
    expect(s.app.lift.lifted.has(A.id), '겹 획 자신은 바탕에 붙어 올라간다').toBe(true)
  })

  it('③ 같은 겹 안에서는 종전대로 정의가 흐른다', () => {
    const { s } = fx()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    const B2 = s.draw(690, 330, 840, 380)!            // 겹 위 대기선 — vp0을 향하는 다른 살
    // (바탕 B(690,290~840,365 — x=720에서 y=305)와 33px 떨어져 겹치지 않는다 — 뗀 끝이
    //  두 선에 동시에 닿으면 층 문과 성립이 한 몸짓에 섞여 ③이 ①을 오염시킨다)
    expect(B2.layer).toBe(lay.id)
    expect(s.app.lift.waiting).toContain(B2.id)
    const A2 = s.draw(720, 445, 722, 343)!            // 같은 겹 — B2 몸통(x=720, y≈340) 위에서 뗀다
    expect(A2.layer).toBe(lay.id)
    expect(s.app.lift.lifted.has(A2.id)).toBe(true)
    const b2 = s.app.doc.strokes.find(x => x.id === B2.id)!
    expect(b2.own3, '같은 겹 — 정의가 흐른다').toBeDefined()
    expect(s.app.lift.lifted.has(B2.id)).toBe(true)
  })

  it('바탕끼리도 종전 그대로다(층 문이 종이 안 흐름을 안 막는다 — vptouch 팔과 같은 몸짓)', () => {
    const { s, B } = fx()
    const A = s.draw(720, 445, 722, 309)!             // 겹 없이 — 종이 위
    expect(A.layer).toBeUndefined()
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3).toBeDefined()
  })
})

describe('지우개는 활성 층의 획만 지운다 (④·⑤)', () => {
  const eraseOnce = (s: Session, x: number, y: number) => {
    beginErase(s.app)
    eraseAt(s.app, { x, y })
    endErase(s.app)
  }

  it('④ 겹이 활성이면 트레이싱지를 통해 밑그림을 못 지운다 · 반증 짝: 종이로 내려가면 지운다', () => {
    const { s, D1 } = fx()
    addLayer(s.app, 'tracing', { W, H })
    const n0 = s.app.doc.strokes.length
    eraseOnce(s, 610, 472.5)                          // D1 몸통 위(지면 깊이선)
    expect(s.app.doc.strokes.length, '바탕 획이 그대로다').toBe(n0)
    expect(s.app.doc.strokes.some(x => x.id === D1.id)).toBe(true)
    // 그 층으로 내려간다 — 종이가 활성이면 같은 지우개가 지운다
    setActiveLayer(s.app, null)
    eraseOnce(s, 610, 472.5)
    expect(s.app.doc.strokes.some(x => x.id === D1.id), '종이 활성 — 지워진다').toBe(false)
  })

  it('⑤ 활성 겹을 바꾸면 지울 수 있는 대상이 바뀐다', () => {
    const { s } = fx()
    const lay1 = addLayer(s.app, 'tracing', { W, H })!
    const S1 = s.draw(720, 445, 722, 309)!            // 겹1의 획(승격 — 바탕에 붙어)
    expect(S1.layer).toBe(lay1.id)
    const lay2 = addLayer(s.app, 'yellow', { W, H })!
    expect(s.app.activeLayer).toBe(lay2.id)
    eraseOnce(s, 720, 380)                            // S1 몸통 위 — 겹2가 활성이라 못 지운다
    expect(s.app.doc.strokes.some(x => x.id === S1.id), '다른 겹 활성 — 안 지워진다').toBe(true)
    setActiveLayer(s.app, lay1.id)
    eraseOnce(s, 720, 380)
    expect(s.app.doc.strokes.some(x => x.id === S1.id), '그 겹 활성 — 지워진다').toBe(false)
  })
})
