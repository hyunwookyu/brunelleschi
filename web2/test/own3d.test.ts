// web2-13 4부 — 자립 구조의 팔. ⚠ **web2-14 1번에서 기본이 켜짐으로 뒤집혔다** —
// 이제 «켜짐»이 정본이고(이 파일 밖 전량이 그 상태로 돈다) «꺼짐»은 대체 경로다.
// 꺼짐 팔들은 전부 **명시적으로 끈다**(setOwn3d(app, false)) — 기본에 기대지 않는다.
//
// 순서(지시 4부): 4-a 검증 불변식(잉크 심판)이 **먼저** 선다 — 판정할 자가 없으면
// 만든 것이 맞는지 모른다. 그다음 4-b(소유·하위호환) · 4-c(승격 사건) · 4-d(원 증상).
//
// (web2-13의) 4부 불변식 「깃발 꺼짐의 동작은 4부 전후로 동일」은 이제 **대체 경로의
// 생존 보증**으로 읽는다(A-4) — 꺼짐 팔들이 꺼진 경로가 아무것도 안 하는 것을 직접 잰다.
//
// 반증(D-3) — 이 파일이 실행하는 것:
//   4-a: own3를 일부러 어긋내면(+0.1) 불변식이 실패한다.
//   4-d: 깃발을 다시 끄면 「창문이 그대로 있다」 팔이 실패한다(= 대기로 떨어진다).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { setOwn3d, loadDoc, setDimension } from '../src/app/state'
import { len3, sub3 } from '../src/core/vec'
import { own3Deviation, OWN3_TOL_PX, camSig } from '../src/core/own3d'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import type { Analysis } from '../src/core/camera'

/** 2점(닫힌 카메라) 문서 — 벽·가이드·창문. 4-d의 시나리오를 그대로 짓는다.
 *  지평선 → vp0 깊이선 → vp1 깊이선(승격·closed) → 벽 밑선 → 가이드(벽 위 수직) →
 *  창문 넷(가이드에서 출발하는 사슬 — 가이드가 없으면 어디에도 안 닿는다). */
function wallAndWindow(own3d: boolean) {
  const s = session(1200, 800)
  setOwn3d(s.app, own3d)                  // 기본이 켜짐이 됐으므로 꺼짐도 **명시**한다(web2-14)
  s.draw(100, 400, 1100, 400)             // 지평선
  s.draw(500, 500, 600, 475)              // 깊이선 → vp0 = 900
  s.draw(500, 500, 400, 475)              // 깊이선 → vp1 = 100 (two-vp — 카메라 닫힘)
  const wall = s.draw(500, 500, 660, 460)!     // 벽 밑선(vp0 방향 — 지면)
  const guide = s.draw(580, 480, 580, 380)!    // 가이드 — 시작이 벽 선 위(근처점)
  // 창문 — 가이드 위 점에서 출발하는 닫힌 사슬(벽 밑선과는 직접 안 닿는다)
  const w1 = s.draw(580, 420, 640, 416.25)!    // vp0 방향
  const w2 = s.draw(640, 416.25, 640, 450)!    // 수직
  const w3 = s.draw(640, 450, 580, 461.54)!    // vp0 방향(반대로)
  const w4 = s.draw(580, 461.54, 580, 420)!    // 수직 — 닫는다
  return { s, wall, guide, win: [w1, w2, w3, w4] }
}

/** 「가이드라인을 전부 지운다」 — 저장 → 획 제거 → 다시 열기(4-b의 «손으로 지운
 *  파일» 조항 그대로. .brnl 왕복이 함께 검증된다 — own3 직렬화 포함). */
function eraseByReload(s: ReturnType<typeof session>, ids: number[]) {
  const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
  const data = parseBrnl(json)
  expect(data).not.toBeNull()
  data!.doc.strokes = data!.doc.strokes.filter(st => !ids.includes(st.id))
  loadDoc(s.app, data!)
}

describe('4-a — 잉크가 심판이다: 저장된 3D × 지금 카메라 = pts2d', () => {
  it('닫힌 문서의 굳힘 전 획: 불변식 통과 — 덮은 획 수 > 0 (#38)', () => {
    const { s } = wallAndWindow(true)
    const an = s.app.lift.an as Analysis
    expect(an.constructionDone).toBe(true)
    const frozen = s.app.doc.strokes.filter(st => st.own3)
    expect(frozen.length).toBeGreaterThanOrEqual(7)   // 깊이선 둘·벽·가이드·창문 넷
    for (const st of frozen) {
      const d = own3Deviation(an, st)
      expect(d, `획 ${st.id}`).not.toBeNull()
      expect(d!, `획 ${st.id}`).toBeLessThanOrEqual(OWN3_TOL_PX)
    }
  })
  it('반증(D-3): own3를 0.1 어긋내면 불변식이 실패한다 — 실제로 실행', () => {
    const { s, win } = wallAndWindow(true)
    const an = s.app.lift.an as Analysis
    const st = s.app.doc.strokes.find(x => x.id === win[0]!.id)!
    expect(own3Deviation(an, st)!).toBeLessThanOrEqual(OWN3_TOL_PX)
    st.own3 = { ...st.own3!, a: { ...st.own3!.a, x: st.own3!.a.x + 0.1 } }
    expect(own3Deviation(an, st)!).toBeGreaterThan(OWN3_TOL_PX)   // 계기가 살아 있다
  })
  it('열리지 않은 카메라(P1 미잠금)에서는 굳히지 않는다 — §9.2 닫힘이 문이다', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)              // vp0 하나 — 아직 열려 있다
    s.draw(500, 500, 500, 300)              // 기둥(리프팅은 된다)
    expect(s.app.lift.lifted.size).toBeGreaterThan(0)
    expect(s.app.lift.an.constructionDone).toBe(false)
    expect(s.app.doc.strokes.some(st => st.own3)).toBe(false)     // 굳힘 0 — 승격이 올 수 있다
  })
})

describe('4-b — 소유·하위호환 (깃발 꺼짐 = 종전과 동일)', () => {
  it('깃발 꺼짐: own3를 만들지도 읽지도 않는다 — .brnl이 종전과 같다', () => {
    const { s } = wallAndWindow(false)
    expect(s.app.doc.strokes.some(st => st.own3)).toBe(false)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    expect(json.includes('own3')).toBe(false)         // 저장 파일도 종전 그대로
  })
  it('.brnl 왕복 — own3가 보존되고 복원 후에도 불변식이 선다', () => {
    const { s } = wallAndWindow(true)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    const data = parseBrnl(json)!
    const frozen = data.doc.strokes.filter(st => st.own3)
    expect(frozen.length).toBeGreaterThanOrEqual(7)
    loadDoc(s.app, data)                              // 깃발 켠 앱이 다시 연다
    const an = s.app.lift.an as Analysis
    for (const st of s.app.doc.strokes.filter(x => x.own3)) {
      expect(own3Deviation(an, st)!).toBeLessThanOrEqual(OWN3_TOL_PX)
    }
  })
  it('모양이 틀린 own3는 그 필드만 버린다 — 문서는 산다(옛 파일·손상 방어)', () => {
    const { s } = wallAndWindow(true)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    const raw = JSON.parse(json)
    raw.strokes.find((st: any) => st.own3).own3 = { a: { x: 1 }, b: null, axis: 3 }  // 손상
    const data = parseBrnl(JSON.stringify(raw))
    expect(data).not.toBeNull()                       // 거부하지 않는다
    expect(data!.doc.strokes.filter(st => st.own3).length).toBeGreaterThan(0) // 나머지는 산다
  })
})

describe('4-c — 승격 사건: 굳힌 3D를 버리고 다시 올려 다시 굳힌다 (2부 측정의 갈래)', () => {
  it('P1 잠금에서 굳힘 → 잠금 해제 → 승격 → own3가 전부 새 값으로 (불변식 유지)', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)             // 지평선
    s.draw(500, 500, 600, 475)              // 깊이선 → vp0 = 900
    const h = s.draw(500, 500, 800, 500)!   // 화면 가로 — p1 잠금(카메라 닫힘) + 앵커
    s.draw(500, 500, 500, 300)              // 기둥
    expect(s.app.lift.an.p1Locked).toBe(true)
    expect(s.app.lift.an.constructionDone).toBe(true)
    const before = s.app.doc.strokes.filter(st => st.own3).map(st => ({ id: st.id, ax: st.own3!.a.x, az: st.own3!.a.z }))
    expect(before.length).toBeGreaterThanOrEqual(3)
    const sigLocked = camSig(s.app.lift.an as Analysis)

    // 잠금을 만든 가로 획을 지운다(§9.2의 드문 열림 경로) — 카메라 서명은 그대로다
    eraseByReload(s, [h.id])
    expect(s.app.lift.an.p1Locked).toBe(false)
    expect(camSig(s.app.lift.an as Analysis)).toBe(sigLocked)     // 사건 아님
    expect(s.app.doc.strokes.some(st => st.own3)).toBe(true)      // 굳힘 유지(영구)

    // 승격 — 두 번째 소실점. 서명이 움직인다(fSource·f·주점 전부)
    s.draw(500, 500, 400, 475)
    const anNew = s.app.lift.an as Analysis
    expect(anNew.fSource).toBe('two-vp')
    expect(camSig(anNew)).not.toBe(sigLocked)
    const after = s.app.doc.strokes.filter(st => st.own3)
    expect(after.length).toBeGreaterThanOrEqual(3)                // 다시 굳혔다
    // 옛 굳힘 값이 아니다 — 2부 측정: 굳힌 3D는 승격을 못 살아남는다(버리고 다시)
    const moved = after.filter(st => {
      const b = before.find(x => x.id === st.id)
      return b && (Math.abs(st.own3!.a.x - b.ax) > 1e-9 || Math.abs(st.own3!.a.z - b.az) > 1e-9)
    })
    expect(moved.length).toBeGreaterThan(0)
    // 그리고 새 굳힘은 불변식을 지킨다 — 잉크가 심판이다
    for (const st of after) expect(own3Deviation(anNew, st)!).toBeLessThanOrEqual(OWN3_TOL_PX)
  })
})

describe('4-d — 원 증상 재현(D-2): 가이드를 지우면 창문이 — 꺼짐: 떨어진다 / 켜짐: 그대로다', () => {
  it('깃발 꺼짐(지금 동작): 가이드 삭제 → 창문 넷이 대기로 떨어진다 — 수리 전 실패의 확인', () => {
    const { s, guide, win } = wallAndWindow(false)
    for (const w of win) expect(s.app.lift.lifted.has(w.id), `창문 ${w.id} 3D`).toBe(true)
    eraseByReload(s, [guide.id])
    for (const w of win) {
      expect(s.app.lift.lifted.has(w.id), `창문 ${w.id}`).toBe(false)
      expect(s.app.lift.waiting).toContain(w.id)                  // 표류 — 사람이 본 그 증상
    }
  })
  it('깃발 켜짐(수리 후): 가이드 삭제 → 창문이 그대로 있다 — 정의는 사건이다', () => {
    const { s, guide, win } = wallAndWindow(true)
    eraseByReload(s, [guide.id])
    const an = s.app.lift.an as Analysis
    for (const w of win) {
      expect(s.app.lift.lifted.has(w.id), `창문 ${w.id}`).toBe(true)   // 유지 — 근거는 수단이지 조건이 아니다
      const st = s.app.doc.strokes.find(x => x.id === w.id)!
      expect(own3Deviation(an, st)!).toBeLessThanOrEqual(OWN3_TOL_PX)  // 그리고 잉크와 맞는다
    }
  })
  it('반증(D-3): 켜짐 팔의 판별력 — 같은 문서에서 깃발을 끄면 「그대로 있다」가 거짓이 된다', () => {
    const { s, guide, win } = wallAndWindow(true)
    eraseByReload(s, [guide.id])
    expect(s.app.lift.lifted.has(win[0]!.id)).toBe(true)
    setOwn3d(s.app, false)                             // 깃발 끔 — own3 무시(옛 사슬이 정본)
    for (const w of win) expect(s.app.lift.lifted.has(w.id)).toBe(false)
  })
})

describe('4-g — 교점으로 정의하기: 나중에 온 선이 먼저 있던 대기선을 못 박는다 (같은 깃발)', () => {
  /** 닫힌 카메라 + 소실점 선 B(방향만 있는 대기) + 정의된 사슬 */
  function vpLineFixture() {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)              // 지평선
    s.draw(500, 500, 600, 475)               // → vp0 = 900
    s.draw(500, 500, 400, 475)               // → vp1 = 100 (닫힘)
    const B = s.draw(700, 300, 820, 360)!    // 소실점 선 — vp0을 겨눈다. 허공 → 대기
    expect(s.app.lift.waiting).toContain(B.id)
    const D1 = s.draw(500, 500, 760, 435)!   // 지면 깊이선(vp0 방향) — 정의된 사슬
    expect(s.app.lift.lifted.has(D1.id)).toBe(true)
    return { s, B, D1 }
  }

  it('정의된 선 A가 B «위에서 끝나면» B가 3D로 올라간다 — 그리고 A·근거를 지워도 유지된다', () => {
    const { s, B, D1 } = vpLineFixture()
    // A — D1 끝(정의된 점)에서 수직으로 B까지 긋고 «만나는 데서 멈춘다»(제도의 수선)
    const A = s.draw(760, 435, 760, 330)!
    expect(s.app.lift.lifted.has(A.id)).toBe(true)
    const bStroke = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(bStroke.own3).toBeDefined()                        // 사건 — 정의됐다
    expect(bStroke.own3!.axis).toBe('vp0')                    // 방향은 원래 알던 그것
    expect(s.app.lift.lifted.has(B.id)).toBe(true)
    const an = s.app.lift.an as Analysis
    expect(own3Deviation(an, bStroke)!).toBeLessThanOrEqual(OWN3_TOL_PX)  // 잉크와 맞는다
    // 만났던 선(A)과 그 사슬(D1)을 지워도 B는 유지된다 — 자립과 함께 판정(지시 문면)
    eraseByReload(s, [A.id, D1.id])
    expect(s.app.lift.lifted.has(B.id)).toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3).toBeDefined()
  })

  it('반증 ①(D-3): 방향이 미정인 대기 획은 끝점이 닿아도 정의되지 않는다', () => {
    // ⚠ web2-17 4부 정정: 옛 픽스처(700,600→790,560)는 축 스냅이 vp0으로 눕히므로
    // «방향 미정»이 아니었고 — 4부 지면 규칙이 그것을 정당하게 지면에 올린다(lift4 ①).
    // 진짜 방향 미정 획은 **소실점 살**(vp에서 뻗는 자유 획 — resolveEnd ②)이다.
    const { s } = vpLineFixture()
    const B2 = s.draw(900, 400, 700, 632)!   // vp0 살 — 자유(축 미정), 시작이 지평선 위
    expect(s.app.lift.waiting).toContain(B2.id)
    const D1b = s.draw(500, 500, 745, 438.75)!               // 정의된 깊이선
    expect(s.app.lift.lifted.has(D1b.id)).toBe(true)
    s.draw(745, 438.75, 745, 580)                            // 수직 — B2 위에서 끝난다(0.2px)
    const b2 = s.app.doc.strokes.find(x => x.id === B2.id)!
    expect(b2.own3).toBeUndefined()                          // 방향 없음 — 정의 불가
    expect(s.app.lift.waiting).toContain(B2.id)
    expect(s.app.touchStats.axis).toBeGreaterThan(0)         // 무산 사유가 계수에 잡혔다
  })

  it('반증 ②(㉯): 지나가기만 한 교차는 사건이 아니다 — 끝점이 닿아야 센다', () => {
    const { s } = vpLineFixture()
    const B4 = s.draw(700, 250, 820, 340)!   // vp0을 겨눈 또 하나의 대기선
    expect(s.app.lift.waiting).toContain(B4.id)
    // A4 — B4를 «가로질러» 지나가고 끝은 허공(위쪽)이다
    const A4 = s.draw(760, 435, 760, 200)!
    expect(s.app.lift.lifted.has(A4.id)).toBe(true)          // A4 자신은 정의된다(수직)
    const b4 = s.app.doc.strokes.find(x => x.id === B4.id)!
    expect(b4.own3).toBeUndefined()                          // 스침은 정의가 아니다
    expect(s.app.lift.waiting).toContain(B4.id)
  })

  it('깃발 꺼짐(대체 경로): 같은 몸짓이 아무것도 정의하지 않는다 — 옛 사슬 그대로', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, false)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    const B = s.draw(700, 300, 820, 360)!
    s.draw(500, 500, 760, 435)
    s.draw(760, 435, 760, 330)
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3).toBeUndefined()
    expect(s.app.lift.waiting).toContain(B.id)               // 종전 동작 — 대기 그대로
  })
})

// ── 4차 리뷰어 대응 팔 ────────────────────────────────────────────────────

import { beginErase, eraseAt, endErase } from '../src/app/state'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

describe('4차 [40] — 알려진 대가: 사슬이 끊긴 굳힘은 승격 사건에서 잃는다 (문서에 명시된 그 대가)', () => {
  it('P1 잠금 문서: 가이드로 창문 → 가이드 삭제 → 잠금 해제 → 승격 → 창문이 대기로 추락한다', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)             // 지평선
    s.draw(500, 500, 600, 475)              // 깊이선 → vp0 = 900
    const h = s.draw(500, 500, 800, 500)!   // 가로 — 잠금(닫힘)·앵커
    const guide = s.draw(600, 500, 600, 380)! // 가이드(가로 선 위에서 수직)
    // ⚠ 창문에 화면 가로(H) 획을 못 쓴다 — H 선언이 그 자체로 잠금을 유지해 승격이
    // 영영 안 온다(첫 실행이 그랬다 — fSource가 default에 머묾). 깊이+수직으로 짓는다.
    const w1 = s.draw(600, 430, 660, 424)!  // 창문 깊이(vp0 방향) — 가이드에만 닿는다
    const w2 = s.draw(660, 424, 660, 470)!  // 창문 세로
    expect(s.app.lift.an.constructionDone).toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === w1.id)!.own3).toBeDefined()

    eraseByReload(s, [guide.id])            // 사슬 절단 — 창문은 own3만으로 선다
    expect(s.app.lift.lifted.has(w1.id)).toBe(true)
    eraseByReload(s, [h.id])                // 잠금 해제(서명 불변 — 굳힘 유지)
    expect(s.app.lift.lifted.has(w1.id)).toBe(true)

    s.draw(500, 500, 400, 475)              // 승격 — 사건: own3 전부 버리고 재굳힘
    expect(s.app.lift.an.fSource).toBe('two-vp')
    // 창문은 사슬이 없어 다시 못 올라온다 — **알려진 대가**(초안 §9.1·DEFERRED 표).
    // 승격은 초기의 일이고 가이드 삭제는 그 뒤의 일이라 실사용 겹침이 좁지만, 겹치면
    // 이렇게 된다는 것을 문서와 이 팔이 함께 말한다(조용히 다른 값이 되지 않는다 —
    // 획 자체는 대기로 남아 화면에 보인다, 불변식 j).
    for (const w of [w1, w2]) {
      expect(s.app.lift.waiting).toContain(w.id)
      expect(s.app.doc.strokes.find(x => x.id === w.id)!.own3).toBeUndefined()
    }
  })
})

describe('4차 [41] — 4-g 도달 집합의 나머지 한 점: B의 «끝점»에서 끝나도 정의된다', () => {
  it('A가 B의 끝점(오스냅 후보)에서 끝난다 → 정의', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)               // vp0 = 900
    s.draw(500, 500, 400, 475)               // vp1 = 100 (닫힘)
    const B = s.draw(700, 300, 820, 360)!    // 소실점 선(대기)
    const D2 = s.draw(500, 500, 700, 450)!   // 지면 깊이선
    expect(s.app.lift.lifted.has(D2.id)).toBe(true)
    s.draw(700, 450, 700, 300)               // 수직 — B의 «시작 끝점»에서 끝난다
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(b.own3).toBeDefined()
    expect(s.app.lift.lifted.has(B.id)).toBe(true)
  })
})

describe('4차 [46] — 지우개 조각의 own3 승계: 어버이의 3D 직선을 잇는다', () => {
  it('사슬이 끊긴 own3 획을 지우개로 잘라도 남는 조각이 3D를 유지한다', () => {
    const { s, guide, win } = wallAndWindow(true)
    // 창문 가로(w1) 가운데에 수직 획 — 3D 교차를 만들어 조각을 가른다
    const vmid = s.draw(610, 418.125, 610, 455)!
    expect(s.app.lift.lifted.has(vmid.id)).toBe(true)
    eraseByReload(s, [guide.id])            // 사슬 절단 — w1은 own3 씨앗으로만 선다
    expect(s.app.lift.lifted.has(win[0]!.id)).toBe(true)
    expect(s.app.lift.lifted.has(vmid.id)).toBe(true)   // 씨앗에 붙은 사슬이 산다(4-b)
    const maxId = Math.max(...s.app.doc.strokes.map(x => x.id))
    s.app.tool = 'eraser-pencil'
    beginErase(s.app)
    eraseAt(s.app, { x: 592, y: 419.5 })    // w1의 왼쪽 조각을 지운다
    endErase(s.app)
    expect(s.app.doc.strokes.find(x => x.id === win[0]!.id)).toBeUndefined() // 원본은 갔다
    const piecesOfW1 = s.app.doc.strokes.filter(x => x.id > maxId)
    expect(piecesOfW1.length).toBeGreaterThan(0)        // 남는 조각이 등재됐다
    const an = s.app.lift.an as Analysis
    for (const p of piecesOfW1) {
      expect(p.own3, `조각 ${p.id}`).toBeDefined()       // 승계
      expect(s.app.lift.lifted.has(p.id)).toBe(true)
      expect(own3Deviation(an, p)!).toBeLessThanOrEqual(OWN3_TOL_PX)  // 잉크 심판 유지
    }
  })
})

describe('4차 [48] — own3가 없는 옛 파일을 깃발 켠 앱이 연다', () => {
  it('열리고, 닫힌 문서라 그 자리에서 굳는다(§8 이행 — 한 번 사슬로 올리고 굳히면 끝)', () => {
    const { s } = wallAndWindow(false)      // 옛 앱 형태(own3 없음)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    expect(json.includes('own3')).toBe(false)
    const s2 = session(1200, 800)
    setOwn3d(s2.app, true)
    loadDoc(s2.app, parseBrnl(json)!)
    const frozen = s2.app.doc.strokes.filter(st => st.own3)
    expect(frozen.length).toBeGreaterThanOrEqual(7)     // 이행 — 열면서 굳었다
    const an = s2.app.lift.an as Analysis
    for (const st of frozen) expect(own3Deviation(an, st)!).toBeLessThanOrEqual(OWN3_TOL_PX)
  })
})

describe('4차 [45] — 원장: 국면별 최대 어긋남 (stage0/out/own3d_invariant_web2.json)', () => {
  it('신선·왕복·삭제 후·승격 후 네 국면의 최댓값과 여유를 남긴다', () => {
    const devMax = (app: ReturnType<typeof session>['app']) => {
      const an = app.lift.an as Analysis
      let m = 0
      let n = 0
      for (const st of app.doc.strokes.filter(x => x.own3)) {
        const d = own3Deviation(an, st)
        if (d !== null) { m = Math.max(m, d); n++ }
      }
      return { max_px: m, n }
    }
    // ① 신선(굳힘 직후) ② 왕복(.brnl) ③ 가이드 삭제 후
    const { s, guide } = wallAndWindow(true)
    const fresh = devMax(s.app)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    loadDoc(s.app, parseBrnl(json)!)
    const roundtrip = devMax(s.app)
    eraseByReload(s, [guide.id])
    const deleted = devMax(s.app)
    // ④ 승격 사건 뒤(재굳힘) — 4-c 픽스처
    const s4 = session(1200, 800)
    setOwn3d(s4.app, true)
    s4.draw(100, 400, 1100, 400)
    s4.draw(500, 500, 600, 475)
    const h = s4.draw(500, 500, 800, 500)!
    s4.draw(500, 500, 500, 300)
    eraseByReload(s4, [h.id])
    s4.draw(500, 500, 400, 475)
    const promoted = devMax(s4.app)
    for (const ph of [fresh, roundtrip, deleted, promoted]) {
      expect(ph.n).toBeGreaterThan(0)                   // #38 — 빈 국면 없음
      expect(ph.max_px).toBeLessThanOrEqual(OWN3_TOL_PX)
    }
    const ledger = {
      what: '잉크 심판(4-a)의 국면별 실측 최대 어긋남 px — 통과/실패 이진이 아니라 여유가 원장에 남는다(4차 리뷰어 [45])',
      tol_px: OWN3_TOL_PX,
      tol_nature: '수치 동일성(스윕 대상 아님 — 근거는 own3d.ts 주석·AS-C47). 알려진 예외 둘: ① dim 획의 b 끝(치수가 길이를 대체) ② 축 허용각 안 어긋 잉크의 사슬 굳힘(AS-C47 둘째 예외 — 이 원장의 국면들은 앱 경로(정확값)만 덮는다). ⚠ 네 국면 최댓값 동일은 최악 획이 같은 기하라서다(web2-13 검증 절 원인 확인 — 국면 축의 판별력은 반증 팔(+0.1)이 진다)',
      phases: { fresh, roundtrip, deleted, promoted },
      margin: Object.fromEntries(Object.entries({ fresh, roundtrip, deleted, promoted })
        .map(([k, v]) => [k, v.max_px > 0 ? OWN3_TOL_PX / v.max_px : null])),
      rerun: 'npx vitest run test/own3d.test.ts (web2에서)',
    }
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'own3d_invariant_web2.json'), JSON.stringify(ledger, null, 2))
  })
})

describe('web2-14 1번 2차 [15] — 치수 대체와 «own3는 안 덮는다»의 공존', () => {
  it('굳은 획에 나중 치수: own3 필드는 불변 · 길이는 매 리프팅 파생 · .brnl 왕복에도 유지', () => {
    const s = session(1200, 800)
    setOwn3d(s.app, true)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)               // vp0
    s.draw(500, 500, 400, 475)               // vp1 — 닫힘 → 굳음
    const E = s.draw(500, 500, 660, 460)!    // 지면 깊이선 — 이 획에 치수를 단다
    const st = s.app.doc.strokes.find(x => x.id === E.id)!
    expect(st.own3).toBeDefined()
    const own3Before = JSON.stringify(st.own3)
    expect(setDimension(s.app, E.id, 2500)).toBe('scale')
    // own3 필드는 그대로다(첫 사건이 이긴다) — 길이는 리프팅이 매번 dim으로 파생한다(원칙 b)
    expect(JSON.stringify(s.app.doc.strokes.find(x => x.id === E.id)!.own3)).toBe(own3Before)
    const g1 = s.app.lift.lifted.get(E.id)!
    const mm1 = len3(sub3(g1.b3, g1.a3)) * s.app.lift.mmPerUnit!
    expect(Math.abs(mm1 - 2500)).toBeLessThan(1e-6)
    // .brnl 왕복 — own3(원값)와 dim이 각각 저장되고, 다시 열어도 길이가 dim이다
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
    loadDoc(s.app, parseBrnl(json)!)
    const g2 = s.app.lift.lifted.get(E.id)!
    const mm2 = len3(sub3(g2.b3, g2.a3)) * s.app.lift.mmPerUnit!
    expect(Math.abs(mm2 - 2500)).toBeLessThan(1e-6)
    expect(JSON.stringify(s.app.doc.strokes.find(x => x.id === E.id)!.own3)).toBe(own3Before)
  })
})
