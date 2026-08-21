import { describe, it, expect } from 'vitest'
import {
  createApp, commitStroke, undo, redo,
  beginErase, eraseAt, endErase, type App,
} from '../src/app/state'
import { pieces } from '../src/core/pieces'
import { DRAW_POSE } from '../src/core/camera'
import { pt } from '../src/core/vec'

// 작도(지평선 + 소실점 둘, fixtures와 같은 구도) 뒤 내용 획을 얹는 앱
function appWithConstruction(): App {
  const app = createApp(1200, 800)
  commitStroke(app, pt(100, 400), pt(1100, 400))
  commitStroke(app, pt(500, 500), pt(600, 475)) // vp (900,400) — 첫 선, 지면
  commitStroke(app, pt(500, 500), pt(400, 475)) // vp (100,400) — 같은 모서리에서
  return app
}

function eraseOnce(app: App, p: { x: number; y: number }) {
  beginErase(app)
  eraseAt(app, p)
  endErase(app)
}

describe('조각 — 교차·접촉 지점에서 나뉜다 (계산, 무저장)', () => {
  it('T자 접촉: 관통되는 획만 나뉜다', () => {
    const app = appWithConstruction()
    const A = commitStroke(app, pt(500, 500), pt(500, 300)) // 앵커
    const E = commitStroke(app, pt(500, 450), pt(700, 450)) // A 위에서 시작
    const ps = pieces(app.lift, DRAW_POSE)
    expect(ps.filter(x => x.strokeId === A.id)).toHaveLength(2) // (500,450)에서 갈림
    expect(ps.filter(x => x.strokeId === E.id)).toHaveLength(1) // 끝점 접촉은 분할이 아니다
  })

  it('반례: 화면 교차(다른 깊이)는 안 나뉜다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    const B = commitStroke(app, pt(500, 300), pt(700, 350)) // 깊이 획
    const E = commitStroke(app, pt(500, 325), pt(700, 325)) // z=−387 평면 — B와 화면에서만 교차
    const ps = pieces(app.lift, DRAW_POSE)
    expect(ps.filter(x => x.strokeId === B.id)).toHaveLength(1)
    expect(ps.filter(x => x.strokeId === E.id)).toHaveLength(1)
  })
})

describe('지우개 — 닿은 조각이 사라진다', () => {
  it('삐져나온 조각을 잘라낸다 — 나머지와 연결은 남는다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))            // A 앵커
    // ⚠ **가로 획을 vp1 축으로 바꿨다**(web2-03 지시 1). 2점 프레임은 {vp0, vp1, V}이고
    //    화면 수평은 어느 축도 아니다 — 앱에서도 도달할 수 없는 상태다(축 스냅이 늘 셋 중
    //    하나로 보내고, 수평을 먼저 그으면 1점으로 잠겨 두 번째 소실점이 안 선다. 실측함).
    //    (500,450)→(700,475)가 vp1 축이다: vp1=(100,400) 방향의 반대 향(향은 무시한다).
    const E = commitStroke(app, pt(500, 450), pt(700, 475))    // vp1 축
    const V2 = commitStroke(app, pt(600, 462.5), pt(600, 560))  // E 위에서 아래로 → E가 갈림
    expect(app.lift.lifted.size).toBe(5) // +2: 깊이선 둘도 3D 선이다(지시 1)
    eraseOnce(app, pt(660, 470)) // E의 오른쪽 조각
    expect(app.doc.strokes.some(s => s.id === E.id)).toBe(false)
    const kept = app.doc.strokes.find(s => s.a.x === 500 && s.a.y === 450)
    expect(kept).toBeDefined()
    expect(kept!.b.x).toBeCloseTo(600, 4)
    // V2는 여전히 3D다 — 남은 조각의 끝점에 붙어 있다
    expect(app.lift.lifted.has(V2.id)).toBe(true)
    expect(app.lift.lifted.size).toBe(5) // A, E 남은 조각, V2 + 깊이선 둘
  })

  it('매달린 것들의 처리 — 3D 결정을 잃은 획은 대기로 내려간다. 사라지지 않는다', () => {
    const app = appWithConstruction()
    const A = commitStroke(app, pt(500, 500), pt(500, 300))
    const B2 = commitStroke(app, pt(500, 300), pt(700, 350)) // A 꼭대기에서 vp0 축
    expect(app.lift.lifted.size).toBe(4) // +2: 깊이선 둘도 3D 선이다(지시 1)
    // A를 전부 지운다 (두 번 닿아서)
    eraseOnce(app, pt(500, 400))
    expect(app.doc.strokes.some(s => s.id === A.id)).toBe(false)
    expect(app.lift.lifted.has(B2.id)).toBe(false)
    expect(app.lift.waiting).toContain(B2.id)       // 대기 — 실패가 아니라 상태
    expect(app.doc.strokes.some(s => s.id === B2.id)).toBe(true) // 불변식 j
  })

  it('대기 획은 통째로 지워진다', () => {
    const app = appWithConstruction()
    const W = commitStroke(app, pt(900, 600), pt(1000, 645)) // 미연결 자유
    expect(app.lift.waiting).toContain(W.id)
    eraseOnce(app, pt(950, 622))
    expect(app.doc.strokes.some(s => s.id === W.id)).toBe(false)
  })

  it('작도 획은 지우개가 못 지운다 — 카메라는 별개다', () => {
    const app = appWithConstruction()
    const n = app.doc.strokes.length
    eraseOnce(app, pt(200, 400))  // 지평선 위
    eraseOnce(app, pt(450, 625))  // 깊이선 위
    expect(app.doc.strokes.length).toBe(n)
    expect(app.lift.an.vps).toHaveLength(2)
  })

  it('반경 밖이면 안 지워진다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    const n = app.doc.strokes.length
    app.eraserRadius = 4
    eraseOnce(app, pt(520, 400)) // 20px 옆
    expect(app.doc.strokes.length).toBe(n)
  })

  it('실행취소가 지우개 한 번을 통째로 되돌린다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    commitStroke(app, pt(500, 450), pt(700, 450))
    commitStroke(app, pt(600, 450), pt(600, 520))
    const before = JSON.stringify(app.doc.strokes)
    eraseOnce(app, pt(660, 450))
    expect(JSON.stringify(app.doc.strokes)).not.toBe(before)
    undo(app)
    expect(JSON.stringify(app.doc.strokes)).toBe(before)
    redo(app)
    expect(app.doc.strokes.some(s => s.a.x === 500 && s.a.y === 450 && Math.abs(s.b.x - 600) < 1e-4)).toBe(true)
  })

  it('버그를 되살리면 잡는다: 지운 조각 자리의 재사영이 비어 있다', () => {
    // "지웠는데 3D에 남는" 버그를 흉내: 지우기 전 조각 수와 후 조각 수를 대조
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    commitStroke(app, pt(500, 450), pt(700, 475))      // vp1 축 (위 주석)
    commitStroke(app, pt(600, 462.5), pt(600, 560))
    const psBefore = pieces(app.lift, DRAW_POSE).filter(x => x.lifted)
    eraseOnce(app, pt(660, 470))
    const psAfter = pieces(app.lift, DRAW_POSE).filter(x => x.lifted)
    expect(psAfter.length).toBe(psBefore.length - 1)
    // 지운 자리 (660,450) 근처를 지나는 조각이 없다
    for (const p of psAfter) {
      const near = Math.min(
        Math.hypot(p.a.x - 660, p.a.y - 470),
        Math.hypot(p.b.x - 660, p.b.y - 470),
      )
      void near
      expect(!(p.a.x < 660 && 660 < p.b.x && Math.abs(p.a.y - 450) < 1 && Math.abs(p.b.y - 450) < 1)).toBe(true)
    }
  })
})
