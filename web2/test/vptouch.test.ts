// web2-14 2번 — 「소실점 선이 안 이어진다」의 재현·수리 팔.
//
// 실기기 판정: 4-g(교점 정의)가 코드에는 있는데 손으로는 안 된다. §D를 탄다:
// D-2 재현 — 손이 실제로 하는 몸짓(축 스냅으로 긋고 대기선 위 «근처»에서 뗀다 —
// 픽셀 단위로는 못 맞춘다)을 세션 하네스(앱과 같은 함수)로 흉내 낸다.
// D-1 표식 — 지시의 단계 ①~④를 touchStats(무산 사유 계수)와 단언으로 가른다.
//
// 수리 전 실측(이 파일의 재현 팔이 실패하던 상태 — NOTES web2-14 2번 절):
//   ① A는 3D가 된다(축 스냅 + 시작점 오스냅) ✓
//   ② 닿음 판정도 성립한다(distToSeg ≤ 오스냅 반경) ✓
//   ③ **위치 계산이 거부된다** — P(A의 뗀 끝 3D)의 사영이 손 오차 δpx만큼 B 잉크에서
//      벗어나 있고, 왕복 문(LINE_MATCH_PX 0.5px)이 그 δ를 그대로 거부한다.
//      missed.roundtrip이 그 표식이다. 손의 δ는 오스냅 반경(8px) 대역이므로
//      0.5px 문은 손으로 열 수 없다 — «코드에는 있는데 손으로는 안 된다»의 기전.
//
// 수리 둘(둘 다 이 파일이 잰다):
//   (a) 대기 획의 **그린 구간**이 2D 오스냅(near) 대상이 된다(㉮) — 끝점이 B 잉크 위에
//       정확히 붙고, 오스냅 기호가 «붙었다»를 그리는 중에 보인다(가시성 채널).
//   (b) 사건의 자리 P를 «A의 뗀 끝» 대신 **A의 3D 직선 ∩ B의 해석면**(눈과 B 잉크
//       선분이 만드는 평면)으로 푼다 — proj(P)가 구성상 B 잉크 위라 왕복이 fp 대역이 된다.
//       손 오차는 «어디서 뗐나»에만 남고 «B가 어디 서나»에는 안 실린다.
//
// 반증(D-3 — 지시 문면 그대로): 끝점을 반경 밖으로 떨어뜨리면 안 올라간다 ·
// 방향(축) 없는 대기 획은 닿아도 안 올라간다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { commitStroke } from '../src/app/state'
import { resolveEnd, resolveStart } from '../src/core/draft'
import { project, DRAW_POSE, type Analysis } from '../src/core/camera'
import { own3Deviation, OWN3_TOL_PX } from '../src/core/own3d'

/** 닫힌 카메라(2점) + 대기 소실점 선 B + 정의된 지면 깊이선 D1.
 *  B의 교차 후보 지점이 B의 끝점·중점 오스냅 반경 **밖**에 있게 좌표를 골랐다 —
 *  끝점·중점 스냅이 대신 잡아 주는 우연(own3d.test 4-g 픽스처가 그랬다)을 배제한다. */
function fx() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)              // 지평선
  s.draw(500, 500, 600, 475)               // → vp0 = (900,400)
  s.draw(500, 500, 400, 475)               // → vp1 = (100,400) — 닫힘
  const B = s.draw(690, 290, 840, 365)!    // 소실점 선(vp0 방향) — 허공 → 대기
  expect(s.app.lift.waiting).toContain(B.id)
  const D1 = s.draw(500, 500, 720, 445)!   // 지면 깊이선 — 끝 (720,445) 정의됨
  expect(s.app.lift.lifted.has(D1.id)).toBe(true)
  // x=720 세로선과 B의 교차는 (720, 305.7) — B 시작(690,290)에서 33.9px,
  // B 중점(≈764,329)에서 49.8px: 어느 점 오스냅도 안 잡는 «몸통 위» 자리다.
  return { s, B, D1 }
}

describe('재현(D-2) — 손의 몸짓: 축 스냅 세로선을 대기선 «근처»에서 뗀다', () => {
  it('(b) 단독 — near 끄고: 교차점에서 3px 어긋나게 떼도 B가 3D로 올라간다 (수리 전: 왕복 문이 거부)', () => {
    const { s, B } = fx()
    // ⚠ near를 끈다(2차 [6][7][9]) — 켜져 있으면 (a)가 끝을 B 잉크 위로 붙여 δ=0이 되므로
    // «손 오차가 남은 채로도 (b)가 푼다»를 못 잰다. 끈 상태가 곧 수리 전 재현 조건이고
    // (near 끈 사용자·기호를 무시한 손 둘 다 실존 경로) (b)의 단독 검증이다.
    s.app.osnap.kinds.near = false
    // ⚠ web2-15 추가: `xint`도 끈다. 안 끄면 겉보기 교차가 끝을 B 잉크 위에 «정확히»
    // 얹어 δ=0이 되므로 이 팔이 (b)를 안 재게 된다 — near만 끄던 문면이 web2-15에서
    // 조용히 무효가 되는 자리였다(몸통의 답이 near → xint로 바뀌었다).
    s.app.osnap.kinds.xint = false
    // 손: (720,445)에서 수직으로 올려 긋고, 교차(720,305.7) 근처 (722,309)에서 뗀다 —
    // 축 스냅이 x=720으로 붙이므로 확정 끝은 (720,309): 교차에서 3.3px, B 잉크에서 2.9px.
    const A = s.draw(720, 445, 722, 309)!
    expect(s.app.lift.lifted.has(A.id), 'A 자체는 3D다(단계 ①)').toBe(true)
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    // 단계 ②~④가 전부 통과해야 한다 — 수리 전에는 ③(왕복)이 막았다(missed.roundtrip 1)
    expect(s.app.touchStats.roundtrip, '왕복 거부 0 (수리 전 1 — 표식)').toBe(0)
    expect(s.app.touchStats.ok, '사건 성립').toBe(1)
    expect(b.own3, 'B가 정의됐다').toBeDefined()
    expect(b.own3!.axis).toBe('vp0')
    expect(s.app.lift.lifted.has(B.id)).toBe(true)
    // 그리고 정의된 3D는 잉크 심판을 통과한다 — B의 잉크가 정본(§7)
    expect(own3Deviation(s.app.lift.an as Analysis, b)!).toBeLessThanOrEqual(OWN3_TOL_PX)
    // 사건의 자리는 A의 직선 위다 — 뗀 끝의 손 오차는 B의 위치에 안 실린다:
    // B own3의 사영이 B 자신의 잉크에 앉는다(아래) — 그것이 그 문장의 실측 형태다
    const pa = project(s.app.lift.an as Analysis, DRAW_POSE, b.own3!.a)!
    // B own3.a는 잉크 시작(690,290)의 리프팅 — 잉크 위 fp 대역(위 own3Deviation이 정본)
    expect(Math.hypot(pa.x - b.a.x, pa.y - b.a.y)).toBeLessThanOrEqual(OWN3_TOL_PX)
  })

  it('수리 (a) — 대기선 몸통이 오스냅 대상이다: 끝이 B 잉크 위에 «정확히» 붙고 기호가 보인다', () => {
    // ⚠ web2-15: 몸통의 답이 `near`(수직 발) → `xint`(겉보기 교차)로 바뀌었다.
    // 이 팔이 재는 것(«붙는다» + «그린 구간 위» + 가시성 채널)은 그대로다 — 종류만
    // 갈렸고, 바뀐 이유는 near가 축을 깨뜨렸기 때문이다(osnap.ts 대기 획 블록 · xint.test).
    const { s, B } = fx()
    // 커서를 B 몸통 근처(교차 아님 — 임의의 몸통 위 지점 근처)에 둔다
    const set = { ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s }
    const oh = resolveStart(s.app.lift, s.app.pose, { x: 720, y: 445 }, set)   // 세션과 같은 경로
    const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
      oh ? oh.p : { x: 720, y: 445 }, { p3: oh?.p3 ?? null },
      { x: 722, y: 309 }, set, { mmPerUnit: null, snapStep: null })
    expect(r.endSnap, '오스냅이 잡혔다 — 가시성 채널(기호가 이 hit를 그린다)').not.toBeNull()
    expect(r.endSnap!.kind).toBe('xint')
    // 붙은 점은 B의 «그린 구간» 위다(무한 연장 아님 — 조용히 틀린 배치 금지, web2-13 1-d)
    const bs = s.app.doc.strokes.find(x => x.id === B.id)!
    const d = (() => {  // 점-선분 거리
      const dx = bs.b.x - bs.a.x, dy = bs.b.y - bs.a.y
      const L2 = dx * dx + dy * dy
      const t = Math.max(0, Math.min(1, ((r.end.x - bs.a.x) * dx + (r.end.y - bs.a.y) * dy) / L2))
      return Math.hypot(r.end.x - (bs.a.x + t * dx), r.end.y - (bs.a.y + t * dy))
    })()
    expect(d).toBeLessThan(1e-9)
  })

  it('반증 ①(D-3) — 끝점을 반경 밖(11px)으로 떨어뜨리면 안 올라간다', () => {
    const { s, B } = fx()
    const A = s.draw(720, 445, 720, 318)!   // 끝 (720,318): B 잉크에서 10.9px — 반경 8 밖
    expect(s.app.lift.lifted.has(A.id)).toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3).toBeUndefined()
    expect(s.app.lift.waiting).toContain(B.id)
    expect(s.app.touchStats.ok).toBe(0)
  })

  it('반증 ②(D-3) — 방향(축)이 없는 대기 획은 닿아도 안 올라간다', () => {
    const { s } = fx()
    // ⚠ 세션 경로로는 자유 대기 획을 못 만든다 — 축 스냅이 «항상» 붙는다(snap.ts 5-a).
    // 자유 획은 지우개 조각·옛 파일·끝점 오스냅 승리에서 실존하므로 직접 주입한다.
    const B2 = commitStroke(s.app, { x: 700, y: 600 }, { x: 790, y: 560 })
    expect(s.app.lift.waiting).toContain(B2.id)
    const D2 = s.draw(500, 500, 745, 438.75)!
    expect(s.app.lift.lifted.has(D2.id)).toBe(true)
    s.draw(745, 438.75, 745, 578)           // 수직 — B2의 잉크 위(교차 y≈580)에서 끝난다
    expect(s.app.doc.strokes.find(x => x.id === B2.id)!.own3).toBeUndefined()
    expect(s.app.lift.waiting).toContain(B2.id)
    expect(s.app.touchStats.axis).toBeGreaterThanOrEqual(1)   // 무산 사유가 계수로 남는다
  })

  it('(a)+(b) 통합 — near 켠 기본: 몸통을 겨냥해 떼면 끝이 잉크 위에 붙고 B가 정의된다', () => {
    const { s, B } = fx()
    const A = s.draw(720, 445, 722, 309)!            // 기본 설정 — 몸통 스냅이 끝을 B 잉크 위로
    expect(s.app.lift.lifted.has(A.id)).toBe(true)
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(b.own3).toBeDefined()
    expect(s.app.touchStats.ok).toBe(1)
    // ⚠ 종전 대가 기록(web2-14 2차 [8]): «점이 방향을 이기므로 A의 확정 끝이 축선에서
    // near 발까지 이동한다». **web2-15에서 그 대가가 없어졌다** — 겉보기 교차는 구성상
    // 축선 위이므로 두 구속이 같이 선다. 그 이동이 바로 실기기 실패의 원인이었다.
  })

  it('반증 ③(2차 [1] — 왕복 문이 수리 후에도 실제로 잰다): 잉크가 축선에서 벗어난 B는 거부된다', () => {
    const { s } = fx()
    // 자유 주입 — vp0 방향에서 살짝(≈1.3°) 벗어난 잉크. axisOfStroke의 허용각(3.4°) 안이라
    // 축은 배정되지만, 이상적 축선의 사영과 잉크가 0.5px 넘게 어긋난다 → 왕복 문의 몫.
    // ⚠ 끝점이 어느 3D에도 안 닿는 자리로 골랐다 — 첫 판은 B와 시작점을 공유해 교점이
    // 아니라 **사슬**로 올라갔다(그 실행이 잉크 심판의 둘째 예외를 드러냈다 — NOTES·AS-C47).
    const B3 = commitStroke(s.app, { x: 300, y: 250 }, { x: 500, y: 295 })  // 정확값은 y=300
    expect(s.app.lift.waiting).toContain(B3.id)
    s.app.osnap.kinds.near = false                   // 몸통 스냅 없이 — 축 스냅 그대로 긋는다
    s.app.osnap.kinds.xint = false                   // (web2-15 — 몸통의 새 답도 같이 끈다)
    const D = s.draw(500, 500, 430, 482)!            // vp1 방향 지면선 — 끝 (430,482.5)
    expect(s.app.lift.lifted.has(D.id)).toBe(true)
    s.draw(430, 482.5, 430, 281)                     // 수직 — B3와의 교차(≈y279.3) 근처에서 뗀다
    const b3 = s.app.doc.strokes.find(x => x.id === B3.id)!
    expect(b3.own3, '어긋난 잉크는 정의하지 않는다 — 잉크 심판(§7)이 못 서므로').toBeUndefined()
    expect(s.app.lift.waiting).toContain(B3.id)
    expect(s.app.touchStats.roundtrip, '왕복 문이 발화했다 — 검사가 살아 있다').toBeGreaterThanOrEqual(1)
  })

  it('반증 ④(2차 [9] — 그린 구간 밖): B의 연장 근처에서 떼면 안 붙고 안 정의된다', () => {
    const { s, B } = fx()
    // B는 (690,290)→(838.5,367.8). 연장선(무한)은 (870,383.5) 대역을 지난다 — 구간 밖.
    const D = s.draw(500, 500, 860, 410)!            // 지면 깊이선 — 그 근처까지
    expect(s.app.lift.lifted.has(D.id)).toBe(true)
    s.draw(860, 410, 868, 385)                       // 연장 위 근처에서 뗀다(구간 끝점에서 >8px)
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(b.own3, '무한 연장은 사건이 아니다(web2-13 1-d — 조용히 틀린 배치 금지)').toBeUndefined()
    expect(s.app.lift.waiting).toContain(B.id)
  })
})
