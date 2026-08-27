// web2-16 2부 — **축이 방향을 지킨다**: 대기선의 끝점·중점 오스냅이 축스냅된 획의
// 끝을 축선 밖으로 밀어 정의를 조용히 죽이던 결함(web2-15 2차 [3] — edge_band
// 297칸 중 52칸 · 짧은 획일수록 심하다)의 수리 팔.
//
// 수리(2-a): 축이 걸린 획에서 **2D(대기) 특징점** 오스냅은 점을 조준선(축선)에
// **사영**한다(수선의 발 — draft.ts resolveEnd ①). 끝이 구성상 축선 위라 축이 산다.
// ⚠ 3D 특징점(p3 있음)은 종전대로 점이 이긴다(#63 유지 — 비대칭의 근거는 draft.ts 주석).
// 수리(2-b): 문(끝이 B 위) 안에서 A가 못 주면 «A못줌(aNot3d)»·카메라 미확정이면
// «noCam»이 센다(own3d.ts defineByTouch — 종전에는 계수 없이 죽었다).
//
// 픽스처(#68 — 그리고 2차 [4]가 초판 산술을 잡았다): 오스냅이 이기는 순간 끝은
// **특징점**으로 가므로, 사영이 없을 때의 밀림원은 손 오차(dx)가 아니라 **픽스처 상수
// off=4**다. 밀림각 = 4/L: 4/40=10% > 허용 5% > 4/110=3.6% — **길이 축이 가른다**
// (#69 ㉣: 넘는 칸과 안 넘는 칸이 둘 다 있는 격자다). 손 오차 축(dx 2~5px)이 가르는
// 것은 «후보가 잡히는가·어느 후보가 이기는가»(문 8px 안의 위치)이지 밀림량이 아니다 —
// 완벽한 손(오차 0)이면 문 판정이 실사용을 안 덮으므로(#68) 오차를 태운다.
//
// 반증(D-3 — 실행 기록은 NOTES): draft.ts의 사영(footOnAim 호출)을 빼면
//  · ②(끝=축선 항등)는 전 칸 실패 — ⚠ 이 단언은 사영이 돌았는가의 자기참조라(§5.1
//    유형 3) 반증의 판정자로 안 쓴다.
//  · ②를 뺀 변형에서 **③④가 끝점 L40·L70에서 실패**(4/L > 5% — 축 손실 → B 미정의),
//    L110은 3.6% < 5%라 생존 — 위 산술 그대로 갈린다.
//  · 칸별 전수는 원장이 든다: xint_web2.json edge_band **w15 열**(사영만 없는 국면 —
//    297칸 중 52 죽음 · L40 28·L70 19·L110 5). 실제로 빼서 확인하고 되돌렸다.
//
// 헤드리스가 재는 것: 후보 종류·사영 좌표·축 유지·승격·정의·계수(아래 전부).
// 실기기가 재는 것: 수선 연결선이 손에 읽히는가 · 8px 반경이 손에 맞는가(DEFERRED).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { axisOfStroke } from '../src/core/lift'
import { C } from '../src/core/constants'

/** 조준 자리 aimX에 특징점(끝점/중점)이 오도록 대기선 B를 놓고, 지면 깊이선 + 씨앗
 *  세로선으로 **3D 시작점**을 특징점 위 L px에 앉힌다(edge_band 하네스와 같은 작도 —
 *  겨냥점을 손으로 계산해 적지 않는다). */
function fxFeature(band: '끝점' | '중점', L: number) {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)              // 지평선
  s.draw(500, 500, 600, 475)               // → vp0
  s.draw(500, 500, 400, 475)               // → vp1 — 카메라 닫힘
  const g = s.draw(500, 500, 720, 445)!    // 지면 깊이선 — 끝 (720,445)가 3D
  expect(s.app.lift.lifted.has(g.id)).toBe(true)
  const aimX = g.b.x
  // ⚠ 특징점을 조준선(x=aimX)에서 4px **비켜** 놓는다 — 정확히 위에 놓으면 씨앗
  // 세로선의 연장 매칭(LINE_MATCH_PX 0.5)이 B를 사슬로 먼저 리프팅한다(edge_band
  // 하네스의 off와 같은 자리다). 4px는 오스냅 반경(8) 안·연장 매칭(0.5) 밖이다.
  const off = 4
  const bx = band === '끝점' ? aimX - off : aimX + off - 75   // 중점 = 시작에서 +75
  const B = s.draw(bx, 240, bx + 150, 315)!              // vp0 방향 대기선
  expect(s.app.lift.waiting).toContain(B.id)
  const bs = s.app.doc.strokes.find(x => x.id === B.id)!
  const target = band === '끝점' ? bs.a
    : { x: (bs.a.x + bs.b.x) / 2, y: (bs.a.y + bs.b.y) / 2 }
  const v = s.draw(aimX, g.b.y, aimX, target.y + L)!     // 씨앗 세로선 — 3D
  expect(s.app.lift.lifted.has(v.id)).toBe(true)
  expect(s.app.lift.waiting).toContain(B.id)             // 씨앗이 B를 먼저 정의하지 않았다
  return { s, B, target, start: v.b }
}

const setOf = (s: ReturnType<typeof session>) =>
  ({ ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s })

function previewAt(s: ReturnType<typeof session>, start: { x: number; y: number }, cur: { x: number; y: number }) {
  const set = setOf(s)
  const oh = resolveStart(s.app.lift, s.app.pose, start, set)
  return resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
    oh ? oh.p : start, { p3: oh?.p3 ?? null }, cur, set, { mmPerUnit: null, snapStep: null })
}

// 손 오차(#68) — 축수직 성분이 실린 격자. 밀림각 dx/L이 축 허용(0.05)을 넘는 칸이
// 격자에 실제로 있다(위 머리주석의 산술 — #69 ㉣).
const HAND: [number, number][] = [[2, 0], [4, 2], [5, -2], [3, 3], [5, 0]]
const LENGTHS = [40, 70, 110]

describe('2-a — 축이 걸린 획에서 대기선 끝점·중점 오스냅은 축선 위로 사영된다', () => {
  for (const band of ['끝점', '중점'] as const) {
    for (const L of LENGTHS) {
      it(`${band} · L${L} — ① 후보는 점 오스냅 ② 끝은 축선 위 ③ 축 유지·승격 ④ B 정의 ⑤ 계수 불변`, () => {
        for (const [dx, dy] of HAND) {
          const { s, B, target, start } = fxFeature(band, L)
          const cur = { x: target.x + dx, y: target.y + dy }
          const r = previewAt(s, start, cur)
          // ① 이긴 후보가 그 특징점이다(end/mid — xint가 대신 잡은 것이 아니다).
          //    끝점 자리는 end, 중점 자리는 mid가 이긴다(OSNAP_ORDER 그대로).
          expect(r.endSnap?.kind, `${band} L${L} (${dx},${dy}) 후보`)
            .toBe(band === '끝점' ? 'end' : 'mid')
          // ② 끝은 축선(x = start.x — V축 세로) 위다. 특징점 자체가 아니다(사영됐다).
          expect(Math.abs(r.end.x - start.x), '끝이 축선 위').toBeLessThan(1e-9)
          // 표시 계약 — 기호(특징점)와 끝(사영)이 갈라져야 수선 연결선이 뜬다(render2d).
          expect(Math.hypot(r.end.x - r.endSnap!.p.x, r.end.y - r.endSnap!.p.y),
            '기호≠끝 — 어느 쪽이 이겼는지 보이는 신호').toBeGreaterThan(0)
          // ③ 축이 산다 — 확정해도 축·승격이 유지된다.
          expect(r.axis, '미리보기 축').toBe('V')
          const A = s.draw(start.x, start.y, cur.x, cur.y)!
          expect(axisOfStroke(s.app.lift.an, s.app.pose, A.a, A.b),
            `${band} L${L} (${dx},${dy}) 확정 축`).toBe('V')
          expect(s.app.lift.lifted.has(A.id), 'A 승격').toBe(true)
          // ④ B가 3D로 올라갔다 — 정의가 섰다.
          expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3,
            `${band} L${L} (${dx},${dy}) B 정의`).toBeTruthy()
          // ⑤ 이 경로에서 무산 계수는 안 오른다(성립이므로) — ok만 오른다.
          expect(s.app.touchStats.ok).toBeGreaterThan(0)
          expect(s.app.touchStats.aNot3d + s.app.touchStats.noCam).toBe(0)
        }
      })
    }
  }
})

describe('2-a — 규칙이 뒤집히지 않는 자리 둘(반증 짝)', () => {
  it('축이 안 걸린 획(소실점에서 뻗는 자유 획)에서는 점이 그대로 이긴다', () => {
    const { s, target } = fxFeature('끝점', 70)
    // vp0(900,400)에서 뻗는 획은 자유다(web2-06 지시 1) — 조준선이 없다.
    const r = previewAt(s, { x: 900, y: 400 }, { x: target.x + 3, y: target.y + 2 })
    expect(r.endSnap?.kind).toBe('end')
    expect(r.end.x, '사영 없음 — 특징점 그대로').toBeCloseTo(target.x, 9)
    expect(r.end.y).toBeCloseTo(target.y, 9)
    expect(r.axis).toBeNull()
  })

  it('3D 특징점은 축이 걸려 있어도 점이 그대로 이긴다(#63 유지 — 면 루프가 닫히는 근거)', () => {
    const { s } = fxFeature('끝점', 70)
    // 지면 깊이선의 3D 끝(720,445)을 축스냅된 세로획으로 겨눈다 — 손 오차 3px.
    const start = { x: 723, y: 560 }
    const g2 = s.draw(500, 500, start.x, start.y)!       // 그 시작점을 3D로
    expect(s.app.lift.lifted.has(g2.id)).toBe(true)
    const r = previewAt(s, start, { x: 723, y: 448 })    // (720,445)에서 (3,3)px
    // (720,445)는 지면 깊이선 g와 씨앗 세로선 v가 공유한다 → vertex로 잡힌다(정점도 3D 점이다)
    expect(['end', 'vertex']).toContain(r.endSnap?.kind)
    expect(r.endSnap?.p3, '3D 특징점이다').toBeTruthy()
    expect(r.end.x, '사영 없음 — 3D 점 그대로(양 끝이 3D라 축 없이도 승격된다)')
      .toBeCloseTo(720, 6)
    expect(r.axis).toBeNull()
  })
})

describe('2-b — 무산 계수: 문 안에서 죽으면 사유가 남는다', () => {
  it('A가 3D를 못 주면 aNot3d가 오른다 — 「후보도 못 된 채 죽는 것」(#43)의 그 자리', () => {
    const { s, B } = fxFeature('끝점', 70)
    // 허공(3D 아닌 자리)에서 시작해 B 위에서 끝나는 획 — A가 못 준다.
    // ⚠ 시작을 «B 몸통점에서 vp0 반대쪽으로» 정렬해 놓는다 — 축 스냅이 끝을 안 옮기게
    // (대각으로 그으면 축 스냅이 끝을 문 밖(>8px)으로 옮겨 아무것도 안 잰다 — #69 ㉣).
    const bs = s.app.doc.strokes.find(x => x.id === B.id)!
    const mid = { x: (bs.a.x + bs.b.x) / 2, y: (bs.a.y + bs.b.y) / 2 }
    const vp0 = { x: 900, y: 400 }
    const st = { x: mid.x + (mid.x - vp0.x) * 0.6, y: mid.y + (mid.y - vp0.y) * 0.6 }
    s.draw(st.x, st.y, mid.x, mid.y)                     // 시작이 허공 → A 대기
    expect(s.app.touchStats.aNot3d, '계수가 오른다(2-b) — 종전에는 0이었다').toBeGreaterThan(0)
    expect(s.app.doc.strokes.find(x => x.id === B.id)!.own3, 'B는 여전히 대기').toBeUndefined()
  })

  it('카메라가 안 닫혔으면 noCam이 오른다', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)                          // 지평선만 — 카메라 미확정
    const B = s.draw(690, 290, 840, 365)!                // 대기 획
    expect(s.app.lift.waiting).toContain(B.id)
    const bs = s.app.doc.strokes.find(x => x.id === B.id)!
    // 세로로 정렬해 긋는다 — 축 스냅(V)이 끝을 안 옮기고 B.a 위에서 끝난다
    s.draw(bs.a.x, bs.a.y + 90, bs.a.x, bs.a.y)
    expect(s.app.touchStats.noCam).toBeGreaterThan(0)
  })

  it('문 밖(끝이 어느 대기선 위도 아니다)은 안 센다 — 종전 규약 유지', () => {
    const { s } = fxFeature('끝점', 70)
    s.draw(200, 700, 300, 640)                           // 허공에서 허공으로
    expect(s.app.touchStats.aNot3d).toBe(0)
    expect(s.app.touchStats.noCam).toBe(0)
  })
})
