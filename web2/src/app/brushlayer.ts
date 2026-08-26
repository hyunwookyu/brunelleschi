// brush 렌더러(web2-11 2부) — p5.brush **표준 빌드**(dist/brush.esm.js · p5 불요 ·
// WebGL2)로 «획»을 종이에 그린 것처럼 그린다.
//
// 범위(2-a): **획뿐이다.** 3D(Line2)·작도선(지평선)·소실점 ✕·오스냅 기호·면·치수·미리보기는
// 전부 종전 자리(three.js·ink 캔버스)에 남는다. 「2D는 내가 그린 것, 3D는 확정된 기하」 —
// 이 갈림은 DECISIONS.md에 결정으로 있다.
//
// 겹 구조: #gl(three.js) 아래 → #brushc(이 파일) → #ink(2D 오버레이) 위.
//   - **대기 획(자기 포즈)**: 몸체를 여기서 그린다. ink의 파선은 남는다 — 파선은 질감이
//     아니라 «대기» 상태 채널이다(불변식 j의 표시. 정보를 지우지 않는다 — #65의 교훈).
//   - **승격 획**: 선 본체는 Line2가 그대로 그리고(⛔ 3D 불변), 여기서는 **재료 질감**을
//     사영 위에 얹는다 — 종전 grain()의 자리를 잇는다(2-e: grain은 꺼지되 안 지워진다).
//   - **다른 포즈의 대기 획**: 안 그린다 — 종전에도 grain이 own에만 얹혔다(같은 규칙).
//   - **미리보기(draft)**: 여기서 안 그린다 — 지연이 먼저다(2-f: 선이 펜을 못 따라오면
//     질감이 무의미하다). 그리는 중에는 ink의 종전 미리보기가 돌고, 뗄 때 이 겹이 그린다.
//     그래서 그리는 동안 이 겹은 **재그리기 0회**다(입력이 캐시 키를 안 건드린다).
//
// 재그리기: (docVersion, pose 동일성, view 값, 크기, 켜짐)이 캐시 키다. 전량 다시 그린다 —
// 비용은 stage0/out/brush_perf_web2.json이 획 10·100·500에서 잰다(2-f).
//
// 계약 셋(2-d):
//   1. 화면 고정 굵기 — **화면 좌표로 그린다**(docToScreen을 우리가 먼저 적용). 줌은 캐시
//      키를 깨서 다시 그릴 뿐 굵기에 안 실린다 — `is = 1/v.s`와 같은 답의 다른 형태다.
//   2. 굵기의 단일 출처 — `widthOfMat` 하나(#54). 여기서 다른 굵기를 만들지 않는다.
//   3. 결정론 — **획마다 brush.seed(id)·noiseSeed(id)**(grain의 rng32(s.id)와 같은 방식 —
//      표준 빌드의 시드 API를 dist export에서 실측: `V as seed`·`W as noiseSeed`).
//      Math.random을 시드로 안 쓴다(§5). e2e가 «같은 문서 → 같은 픽셀»을 해시로 잰다.

import * as brush from 'p5.brush/standalone'
import type { App } from './state'
import { docToScreen, isDrawPose } from './state'
import { project } from '../core/camera'
import { gradeOf } from '../core/material'
import type { Stroke } from '../core/types'
import type { Pt } from '../core/vec'
// 매핑·색·필압 계수는 순수 모듈이다 — 단위가 WebGL 없이 잰다(test/brushmap.test.ts)
import { BRUSH_OF, strokeColor, weightOf, pressureProfile } from './brushmap'

export interface BrushLayer {
  canvas: HTMLCanvasElement
  /** 캐시 키가 갈렸으면 전량 다시 그린다. 반환 = 이번에 실제로 그렸는가. */
  sync(app: App): boolean
  /** 강제 재그리기 + 소요 ms — 성능 원장(2-f)이 부른다 */
  redrawTimed(app: App): number
  /** 분자/분모 카운터(#43) — 「그리는 중 재그리기 0회」를 산문이 아니라 수로:
   *  syncs = sync 호출 수(프레임 몫), redraws = 그중 실제로 다시 그린 수 */
  stats(): { syncs: number; redraws: number }
  resize(W: number, H: number, dpr: number): void
}

export function initBrushLayer(W: number, H: number, dpr: number): BrushLayer {
  let canvas = brush.createCanvas(W, H, { parent: '#app', pixelDensity: dpr, id: 'brushc' })
  let cw = W, ch = H
  // 내장 브러시는 큰 캔버스 기준이라 그대로는 크다/작다 — 1을 기준으로 두고 실측으로 판단
  // (brush_perf_web2의 폭 실측 행이 배수·픽셀 폭을 남긴다. 눈 판정은 실기기 몫).
  brush.scaleBrushes(1)

  // 캐시 키 — 이 값들이 전부 같으면 다시 안 그린다. 그리는 중(draft·호버)에는 어느 것도
  // 안 바뀌므로 **획을 긋는 동안 이 겹의 비용은 0**이다(위 머리주석).
  let last: { renderer: string; docVersion: number; pose: unknown; s: number; ox: number; oy: number; w: number } | null = null
  const dirty = (app: App): boolean =>
    !last || last.renderer !== app.renderer || last.docVersion !== app.docVersion ||
    last.pose !== app.pose || last.s !== app.view.s || last.ox !== app.view.ox ||
    last.oy !== app.view.oy || last.w !== cw
  const remember = (app: App) => {
    last = { renderer: app.renderer, docVersion: app.docVersion, pose: app.pose,
      s: app.view.s, ox: app.view.ox, oy: app.view.oy, w: cw }
  }

  function drawStroke(app: App, s: Stroke, a: Pt, b: Pt) {
    const g = gradeOf(s)
    brush.seed(s.id)          // 결정론 — 획마다 같은 시드(계약 3)
    brush.noiseSeed(s.id)
    brush.set(BRUSH_OF[g], strokeColor(g), weightOf(s))
    const prof = pressureProfile(s)
    if (!prof) {
      brush.line(a.x, a.y, b.x, b.y)
    } else {
      const pts: [number, number, number][] = prof.map((p, i) => {
        const t = i / (prof.length - 1)
        return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, p]
      })
      brush.spline(pts, 0)    // curvature 0 — 확정 기하는 직선이다(§1: 손떨림은 버린다)
    }
  }

  function redraw(app: App) {
    brush.clear()
    if (app.renderer === 'brush') {
      brush.push()
      // 원점이 캔버스 가운데다(standalone 규약) — 좌상단 화면 좌표로 옮긴다
      brush.translate(-cw / 2, -ch / 2)
      const atDraw = isDrawPose(app.pose)
      const waiting = new Set(app.lift.waiting)
      for (const s of app.doc.strokes) {
        const id = s.id
        if (waiting.has(id)) {
          // 대기 획 — 자기 포즈에서만(grain과 같은 규칙). 좌표는 문서 → 화면.
          const own = s.view ? !atDraw : atDraw
          if (!own) continue
          drawStroke(app, s, docToScreen(app, s.a), docToScreen(app, s.b))
        } else {
          const seg = app.lift.lifted.get(id)
          if (!seg) continue
          if (gradeOf(s) === 'INK') continue // 잉크 승격선은 Line2가 균일하게 그린다 — 질감 없음(grain과 동일)
          const a = project(app.lift.an, app.pose, seg.a3)
          const b = project(app.lift.an, app.pose, seg.b3)
          if (!a || !b) continue
          drawStroke(app, s, docToScreen(app, a), docToScreen(app, b))
        }
      }
      brush.pop()
    }
    brush.render()
  }

  let syncs = 0, redraws = 0, blank = false
  return {
    canvas,
    sync(app) {
      syncs++
      if (!dirty(app)) return false
      // classic이고 이미 비어 있으면 지우기 재실행도 생략한다 — 계측(2차 재리뷰 [2]:
      // classic 카운터가 0이 아니면 «캐시 성공»과 «겹 미사용»이 안 갈린다)과 낭비 둘 다의 답.
      if (app.renderer === 'classic' && blank) { remember(app); return false }
      remember(app)
      redraw(app)
      blank = app.renderer === 'classic'
      // redraws는 **획을 실제로 그린** 재그리기만 센다 — classic의 «비우기» 패스는 밖이다
      if (app.renderer === 'brush') redraws++
      return true
    },
    stats: () => ({ syncs, redraws }),
    redrawTimed(app) {
      const t0 = performance.now()
      redraw(app)
      return performance.now() - t0
    },
    resize(W2, H2, dpr2) {
      canvas.remove()
      canvas = brush.createCanvas(W2, H2, { parent: '#app', pixelDensity: dpr2, id: 'brushc' })
      cw = W2; ch = H2
      last = null
    },
  }
}
