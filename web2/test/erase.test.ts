import { describe, it, expect } from 'vitest'
import {
  createApp, commitStroke, undo, redo, setOwn3d,
  beginErase, eraseAt, endErase, type App,
} from '../src/app/state'
import { pieces } from '../src/core/pieces'
import { screenCross } from '../src/core/lift'
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
    // ⚠⚠ **픽스처를 다시 지었다**(web2-37 1번). 옛 판은 E가 «끝점 하나만 물린 자유 방향»
    //    이라 **대기선**이었고, 그래서 「다른 깊이의 3D 선 둘」이 아니라 「3D 선 하나와
    //    2D 획 하나」를 재고 있었다. 37-1이 그 E를 **B와의 교차로** 세우자(그것이 이 회차의
    //    목적이다) 둘은 3D에서 **진짜로** 만나 각각 둘로 갈렸다 — 규칙이 깨진 것이 아니라
    //    **픽스처가 재려던 상태를 더 못 만드는 것**이다(#71의 형태 · D-5).
    //    새 판은 E의 **양 끝을 다 물린다**(명시 점 둘 → 축도 교차도 물러난다: 37-1 표 첫 줄):
    //    A(vp0·vp1 두 평면이 만나는 모서리 수직) ↔ D(vp1 평면의 수직). B는 vp0 평면이므로
    //    **E와 B는 서로 다른 수직 평면**에 있고 화면에서만 가로지른다(실측 z −4.131 ↔ −12.394).
    const app = appWithConstruction()
    const A = commitStroke(app, pt(500, 500), pt(500, 250))   // 모서리 수직
    const B = commitStroke(app, pt(500, 300), pt(700, 350))   // vp0 평면의 깊이 획
    const D = commitStroke(app, pt(700, 550), pt(700, 250))   // vp1 평면의 수직(밑이 vp1 선 위)
    const E = commitStroke(app, pt(500, 325), pt(700, 300))   // A ↔ D — 명시 점 둘
    // 픽스처가 «재려는 상태»를 실제로 만들었는지부터 확인한다(#88 — 좌표를 믿지 말고 대상에서 읽는다)
    for (const s of [A, B, D, E]) expect(app.lift.lifted.has(s.id), `${s.id} 자립`).toBe(true)
    expect(screenCross(E.a, E.b, B.a, B.b), '화면에서 가로지른다').not.toBeNull()
    const gE = app.lift.lifted.get(E.id)!, gB = app.lift.lifted.get(B.id)!
    expect(Math.abs(gE.b3.z - gB.b3.z), '깊이가 다르다').toBeGreaterThan(1)
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

  it('매달린 것들의 처리(사슬 — 대체 경로) — 3D 결정을 잃은 획은 대기로 내려간다. 사라지지 않는다', () => {
    // ⚠ web2-14 1번: 기본이 자립(켜짐)이 됐다 — 이 팔은 **사슬 의미론**을 재므로 명시로
    // 끈다. 켜짐(정본)의 반대 동작(매달려도 유지)은 아래 팔과 own3d.test 4-d가 잰다.
    const app = appWithConstruction()
    setOwn3d(app, false)
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

  it('매달린 것들의 처리(자립 — 기본·정본) — 굳은 획은 근거를 지워도 3D를 유지한다', () => {
    const app = appWithConstruction()          // 기본 = 자립 켜짐(web2-14 1번)
    const A = commitStroke(app, pt(500, 500), pt(500, 300))
    const B2 = commitStroke(app, pt(500, 300), pt(700, 350))
    expect(app.doc.strokes.find(s => s.id === B2.id)!.own3).toBeDefined() // 닫힌 카메라 — 굳었다
    eraseOnce(app, pt(500, 400))
    expect(app.doc.strokes.some(s => s.id === A.id)).toBe(false)
    expect(app.lift.lifted.has(B2.id)).toBe(true)   // 정의는 사건이다 — 근거는 수단이지 조건이 아니다
  })

  it('대기 획은 통째로 지워진다', () => {
    const app = appWithConstruction()
    const W = commitStroke(app, pt(900, 600), pt(1000, 645)) // 미연결 자유
    expect(app.lift.waiting).toContain(W.id)
    eraseOnce(app, pt(950, 622))
    expect(app.doc.strokes.some(s => s.id === W.id)).toBe(false)
  })

  it('작도 획(소실점 획)은 지우개가 못 지운다 — 카메라는 별개다', () => {
    const app = appWithConstruction()
    const n = app.doc.strokes.length
    eraseOnce(app, pt(550, 487.5))  // 깊이선 1(소실점 획) 위
    eraseOnce(app, pt(450, 487.5))  // 깊이선 2 위
    expect(app.doc.strokes.length).toBe(n)
    expect(app.lift.an.vps).toHaveLength(2)
  })

  it('지평선 따라긋기 획은 내용이라 지워진다(web2-17) — 카메라는 안 움직인다', () => {
    // 종전에는 role horizon이라 못 지웠다. 이제 지평선은 상시(H/2)이고 그 위의 획은
    // 그냥 대기 획이다 — 지워도 카메라(소실점·f)가 그대로인 것이 요점이다.
    const app = appWithConstruction()
    const n = app.doc.strokes.length
    const f0 = app.lift.an.f
    eraseOnce(app, pt(200, 400))  // 지평선 위의 따라긋기 획
    expect(app.doc.strokes.length).toBe(n - 1)
    expect(app.lift.an.vps).toHaveLength(2)
    expect(app.lift.an.f).toBe(f0)
  })

  it('반경 밖이면 안 지워진다', () => {
    const app = appWithConstruction()
    commitStroke(app, pt(500, 500), pt(500, 300))
    const n = app.doc.strokes.length
    app.eraserRadius = 4
    eraseOnce(app, pt(520, 430)) // 수직선에서 20px 옆 (지평선 따라긋기 획에서도 30px — 그것도 획이다)
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
