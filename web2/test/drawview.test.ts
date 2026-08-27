// web2-17 3부 — 팬으로 눈높이를 선언한다 · 작도 시점(drawView) 저장 (3-d ①~⑤).
//
// 반증(D-3): 합성(composeView)을 덮어쓰기로 바꾸면 ④가 실패한다 — 아래 「반증」 팔이
// 덮어쓰기의 결과를 직접 계산해 «합성과 다르고 구도를 잃는다»를 값으로 보인다.

import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createApp, commitStroke, panBy, dollyBy, setPose, resetPose, clearAll, loadDoc,
  composeView, docToScreen,
} from '../src/app/state'
import { parseBrnl, serializeBrnl } from '../src/core/file'
import { DRAW_POSE } from '../src/core/camera'
import { pt, v3, quatAxisAngle } from '../src/core/vec'

// 원장 — 3-d ④의 화면 좌표를 stage0/out에 남긴다(§5 · 2차 리뷰어 [3][10])
const ledger: Record<string, unknown> = {
  what: 'web2-17 3-d 팔의 측정 — 합성(composeView) 화면 좌표. drawview.test.ts가 매 실행 다시 쓴다.',
  flags_explained: {
    'fit.ox/oy=0 · corners_plain.tl=0': '기하값이다 — 800×600을 1200×900에 맞추면 여백이 정확히 0이고 좌상 모서리가 (0,0)이다(카운터가 아니다)',
  },
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/drawview_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

describe('3-a — 첫 획 전에는 팬만, 줌은 막힌다', () => {
  it('② 첫 획 전 줌이 view를 안 바꾼다 · 첫 획 뒤 줌은 종전대로 바꾼다', () => {
    const app = createApp(1200, 800)
    dollyBy(app, 1.5, pt(600, 400))
    expect(app.view).toEqual({ s: 1, ox: 0, oy: 0 })     // 막혔다 — 두 번째 선언은 없다
    panBy(app, 40, -30)
    expect(app.view).toEqual({ s: 1, ox: 40, oy: -30 })  // 팬은 그대로 산다
    commitStroke(app, pt(500, 650), pt(700, 650))        // 첫 획
    dollyBy(app, 1.5, pt(600, 400))
    expect(app.view.s).toBeCloseTo(1.5, 9)               // 이제 줌이 산다
  })
})

describe('3-b — 첫 획이 시점을 굳힌다', () => {
  it('① 팬 → 첫 획 → drawView가 그 팬과 같다(값으로)', () => {
    const app = createApp(1200, 800)
    panBy(app, 33, -48)
    expect(app.drawView).toBeNull()
    commitStroke(app, pt(500, 650), pt(700, 650))
    expect(app.drawView).toEqual({ s: 1, ox: 33, oy: -48 })
    // 둘째 획은 안 건드린다 — 판정이 «밀어 넣기 전 길이»라 첫 획에서만 굳는다
    panBy(app, 100, 100)
    commitStroke(app, pt(500, 650), pt(500, 500))
    expect(app.drawView).toEqual({ s: 1, ox: 33, oy: -48 })
  })

  it('resetPose(작도 시점으로)가 drawView로 돌아간다 — 궤도 뒤에도', () => {
    const app = createApp(1200, 800)
    panBy(app, 33, -48)
    commitStroke(app, pt(500, 650), pt(700, 650))
    setPose(app, { p: v3(3, 1.6, 3), q: quatAxisAngle(v3(0, 1, 0), 0.4) })
    panBy(app, 10, 10)   // 궤도 포즈의 팬 — 카메라 이동(별개)
    resetPose(app)
    expect(app.pose).toEqual(DRAW_POSE)
    expect(app.view).toEqual({ s: 1, ox: 33, oy: -48 })
  })

  it('clearAll이 drawView를 버린다 — 다음 첫 획이 새로 굳힌다', () => {
    const app = createApp(1200, 800)
    panBy(app, 33, -48)
    commitStroke(app, pt(500, 650), pt(700, 650))
    clearAll(app, 1200, 800)
    expect(app.drawView).toBeNull()
    resetPose(app)
    expect(app.view).toEqual({ s: 1, ox: 0, oy: 0 })
  })
})

describe('3-c — 저장·복원과 프레임 맞춤의 합성', () => {
  const saved = () => {
    const app = createApp(1200, 800)
    panBy(app, 33, -48)
    commitStroke(app, pt(500, 650), pt(700, 650))
    commitStroke(app, pt(500, 650), pt(680, 537.5))
    return serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView })
  }

  it('③ 저장 → 복원 → view가 drawView다 · 궤도 뒤 「작도 시점으로」가 그리로 돌아간다', () => {
    const app = createApp(1200, 800)
    const data = parseBrnl(saved())!
    expect(data.drawView).toEqual({ s: 1, ox: 33, oy: -48 })
    loadDoc(app, data)
    expect(app.view).toEqual({ s: 1, ox: 33, oy: -48 })
    setPose(app, { p: v3(3, 1.6, 3), q: quatAxisAngle(v3(0, 1, 0), 0.4) })
    resetPose(app)
    expect(app.view).toEqual({ s: 1, ox: 33, oy: -48 })
  })

  it('④ 다른 창 크기 — 합성이 구도를 보존한다(화면 좌표로 잰다)', () => {
    // 프레임 800×600 문서를 1200×900 창에서 연다: fit = {s:1.5, ox:0, oy:0}
    // (main.ts fitViewToFrame과 같은 식 — min(1200/800, 900/600) = 1.5, 남는 폭 0).
    const draw = { s: 1, ox: 30, oy: -20 }
    const fit = { s: 1.5, ox: (1200 - 800 * 1.5) / 2, oy: (900 - 600 * 1.5) / 2 }
    const composed = composeView(fit, draw)
    expect(composed).toEqual({ s: 1.5, ox: 45, oy: -30 })
    // 구도 보존 = 문서점의 화면 좌표가 «작도 화면 좌표 × s_fit + o_fit»이다.
    const appNew = { view: composed } as any
    const appOld = { view: draw } as any
    for (const p of [pt(0, 0), pt(400, 300), pt(800, 600), pt(123, 456)]) {
      const oldScr = docToScreen(appOld, p)
      const newScr = docToScreen(appNew, p)
      expect(newScr.x).toBeCloseTo(oldScr.x * fit.s + fit.ox, 9)
      expect(newScr.y).toBeCloseTo(oldScr.y * fit.s + fit.oy, 9)
    }
    // drawView가 없으면(identity) 프레임이 창 안에 그대로 들어온다 — 화면 좌표
    const plain = composeView(fit, { s: 1, ox: 0, oy: 0 })
    const tl = docToScreen({ view: plain } as any, pt(0, 0))
    const br = docToScreen({ view: plain } as any, pt(800, 600))
    expect(tl).toEqual({ x: 0, y: 0 })
    expect(br).toEqual({ x: 1200, y: 900 })
    ledger['compose_800x600_in_1200x900'] = {
      fit, draw, composed,
      corners_plain: { tl, br },
      note: '구도 보존 검증: 문서점 화면좌표 = 작도 화면좌표 × s_fit + o_fit (팔이 4점에서 잰다)',
    }
    console.log(`[측정] 3-d ④ — fit ${JSON.stringify(fit)} · 합성 ${JSON.stringify(composed)} · 프레임 화면 (0,0)~(1200,900)`)
  })

  it('반증(D-3) — 합성을 덮어쓰기로 바꾸면 ④가 실패한다', () => {
    // 덮어쓰기 ㉮: fit이 이긴다 → 작도 팬(30,−20)이 사라져 구도를 잃는다
    const draw = { s: 1, ox: 30, oy: -20 }
    const fit = { s: 1.5, ox: 0, oy: 0 }
    const composed = composeView(fit, draw)
    const overwriteFit = fit
    expect(docToScreen({ view: overwriteFit } as any, pt(0, 0)))
      .not.toEqual(docToScreen({ view: composed } as any, pt(0, 0)))
    // 덮어쓰기 ㉯: draw가 이긴다 → 배율 1이라 800×600 프레임이 1200×900 창을 안 채운다
    const overwriteDraw = draw
    const br = docToScreen({ view: overwriteDraw } as any, pt(800, 600))
    expect(br.x).toBeLessThan(1200 * 0.75)               // 창 폭의 3/4에도 못 미친다 — 구도가 다르다
  })

  it('⑤ drawView 없는 파일(2부 변환을 지난 옛 파일)이 identity로 열린다', () => {
    const app = createApp(1200, 800)
    panBy(app, 99, 99)   // 열기 전의 화면 상태 — 복원이 덮어야 한다
    const v1 = JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
      strokes: [
        { id: 1, a: { x: 100, y: 520 }, b: { x: 1100, y: 520 } },
        { id: 2, a: { x: 500, y: 620 }, b: { x: 620, y: 590 } },
      ],
      faces: [], unit: 'mm', nextId: 3,
    })
    const data = parseBrnl(v1)!
    expect(data.drawView).toBeNull()
    loadDoc(app, data)
    expect(app.view).toEqual({ s: 1, ox: 0, oy: 0 })
    expect(app.drawView).toBeNull()
  })

  it('drawView 모양이 틀리면 그 필드만 버린다(썸네일의 선례)', () => {
    const good = parseBrnl(saved())!
    const j = JSON.parse(saved())
    j.drawView = { s: 'x', ox: 1, oy: 2 }
    const bad = parseBrnl(JSON.stringify(j))!
    expect(bad).not.toBeNull()
    expect(bad.drawView).toBeNull()
    expect(bad.doc.strokes.length).toBe(good.doc.strokes.length)
  })
})
