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
import { docToScreen, isDrawPose, activeGrade, draftBrushed } from './state'
import { atOwnPose } from '../core/waitfade'
import { project } from '../core/camera'
import { gradeOf, rng32 } from '../core/material'
import { C } from '../core/constants'
import type { Stroke } from '../core/types'
import type { Pt } from '../core/vec'
import type { Draft } from './render2d'
// 매핑·색·필압 계수는 순수 모듈이다 — 단위가 WebGL 없이 잰다(test/brushmap.test.ts)
import { BRUSH_OF, strokeColor, weightOf, pressureProfile } from './brushmap'

export interface BrushLayer {
  canvas: HTMLCanvasElement
  /** 캐시 키가 갈렸으면 전량 다시 그린다. 반환 = 이번에 실제로 그렸는가.
   *  draft(web2-12 2번)가 있으면 **draft 전용 모드**로 돈다 — 아래 syncDraft 절. */
  sync(app: App, draft?: Draft | null): boolean
  /** 강제 재그리기 + 소요 ms — 성능 원장(2-f)이 부른다 */
  redrawTimed(app: App): number
  /** 분자/분모 카운터(#43) — 「그리는 중 재그리기 0회」를 산문이 아니라 수로:
   *  syncs = sync 호출 수(프레임 몫), redraws = 그중 실제로 다시 그린 수.
   *  ⚠ web2-12 2번 뒤에도 이 정의는 산다 — redraws는 **전량**(확정 획) 재그리기만 세고,
   *  draft 한 획 재그리기는 draftStats가 따로 센다(섞으면 «그리는 중 0회»가 안 재진다). */
  stats(): { syncs: number; redraws: number }
  /** draft 재그리기 원장(web2-12 2번) — 이동당 비용의 분자/분모와 ms 표본.
   *  ⚠ 표본은 **국면별로 리셋해서 읽는다**(resetDraftStats) — 누산기를 국면·렌더러
   *  칸에 그대로 실으면 실행 0인 칸에 남의 값이 실린다(2차 리뷰어 [5] · #32·#43). */
  draftStats(): { redraws: number; msMedian: number; msMax: number }
  resetDraftStats(): void
  resize(W: number, H: number, dpr: number): void
}

/** p5.brush 2.2.2의 캔버스 컨텍스트를 **straight alpha**로 잡는다(web2-12 1번).
 *
 *  라이브러리는 `getContext('webgl2', {premultipliedAlpha: true, ...})`를 하드코딩하는데,
 *  정작 `clear()`가 버퍼를 **(1,1,1,0) — 흰색·알파 0**으로 채운다. premultiplied 규약에서
 *  rgb ≤ α여야 하므로 이 값은 규약 위반이고, 합성기가 `dst = src.rgb + dst.rgb×(1−α)`로
 *  **흰색을 가산**해 — 겹 아래(#gl)의 Line2·면 전체가 흰 장막에 덮였다. 잉크 확정선은
 *  Line2만 그리므로 「펜 획이 떼면 사라진다」로 관측된 것이 이것이다(e2e materials.spec가
 *  합성 화면으로 잰다 — 수리 전 실패·수리 후 통과를 확인했다).
 *
 *  버퍼의 실제 내용(흰 배경·straight AA 경계)은 straight alpha 해석과 맞으므로
 *  `premultipliedAlpha: false`가 올바른 선언이다 — 획 픽셀(전부 불투명, AS-C35)의 색은
 *  변하지 않고 빈 픽셀(α=0)만 투명해진다. 결정론 해시(buffer 내용)도 안 변한다.
 *  라이브러리가 attrs를 하드코딩해 주입 통로가 없으므로, createCanvas가 도는 동안만
 *  getContext를 감싼다(생성되는 캔버스는 #brushc 하나뿐이라 #gl에는 안 닿는다). */
function withStraightAlpha<T>(fn: () => T): T {
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    return orig.call(this, type, type === 'webgl2' ? { ...(attrs as object), premultipliedAlpha: false } : attrs)
  } as typeof orig
  try { return fn() } finally { HTMLCanvasElement.prototype.getContext = orig }
}

export function initBrushLayer(W: number, H: number, dpr: number): BrushLayer {
  let canvas = withStraightAlpha(() =>
    brush.createCanvas(W, H, { parent: '#app', pixelDensity: dpr, id: 'brushc' }))
  let cw = W, ch = H

  // ── 스냅샷 겹(web2-12 2번) — 그리는 동안 확정 획을 이 2D 캔버스가 든다 ──────
  // 전량 재그리기는 이동당 못 돈다(full_redraw_ms — 100획 대역에서 이미 프레임 예산 밖).
  // 대신: 펜 다운 때 #brushc(확정 획들)를 여기로 한 번 뜨고(#brushc 바로 아래 겹),
  // 그리는 동안 #brushc는 **draft 한 획만** 지웠다 그린다(이동당 비용 = 획 1).
  // 뗄 때 정상 재그리기가 확정 획 전체(+새 획)를 #brushc에 되그리고 이 겹은 걷힌다.
  // drawImage 판독은 straight alpha 컨텍스트(위 withStraightAlpha)라 합성과 같은 값이다.
  const snap = document.createElement('canvas')
  snap.id = 'brushsnap'
  snap.style.zIndex = '1'            // #gl(1)과 #brushc(1) 사이 — DOM 순서가 가른다
  snap.style.pointerEvents = 'none'
  snap.style.display = 'none'
  canvas.parentElement!.insertBefore(snap, canvas)

  // ⚠ draft «몸체»는 이 겹의 일이 아니다(2차 리뷰어 [1] 대응의 결론): 확정 몸체가
  // Line2이므로 draft 몸체도 **Line2 그 자체**가 그린다(render3d.setDraftLine — #gl은
  // 이 겹 아래라 순서도 맞다). 2D 캔버스 벡터로 흉내 낸 중간판은 반투명 합성의 파이프라인
  // 차(채널 17~32 대역, dpr2 실측)가 뗌 순간에 보여서 걷었다 — 같은 셰이더·같은 재질이
  // 같은 픽셀을 내는 것이 구성적 답이다.
  const fitSnap = () => {
    if (snap.width !== canvas.width || snap.height !== canvas.height) {
      snap.width = canvas.width; snap.height = canvas.height
    }
  }
  // 내장 브러시는 큰 캔버스 기준이라 그대로는 크다/작다 — 1을 기준으로 두고 실측으로 판단
  // (brush_perf_web2의 폭 실측 행이 배수·픽셀 폭을 남긴다. 눈 판정은 실기기 몫).
  brush.scaleBrushes(1)

  // ── 종이 결 — 획마다가 아니라 **한 장**(web2-12 10번) ─────────────────────
  // 확인 결과(D-1 — NOTES): p5.brush의 질감은 시드에서 나오는데 우리가 결정론 계약(2-d)
  // 으로 **획마다 seed(id)를 리셋**하므로 획마다 독립이다 — 공유 종이가 없다.
  // 그래서 타일 노이즈 한 장을 CSS 알파 마스크로 이 겹(과 스냅샷 겹)에 곱한다 —
  // 모든 획이 같은 종이 이빨을 지난다. **위상은 문서 고정**(팬을 따라간다 — 종이가 그림과
  // 같이 움직여야 종이답다) · **결 크기는 화면 고정**(원칙 e — 줌해도 이빨이 안 커진다).
  // 비용: mask-position 갱신뿐(합성기 몫) — 재그리기·판독(getImageData)에는 안 걸린다
  // (마스크는 합성 단계라 캔버스 버퍼·결정론 해시가 불변이다 — brush.spec의 해시가 그 증거).
  const paper = (() => {
    const t = document.createElement('canvas')
    t.width = 128; t.height = 128
    const g = t.getContext('2d')!
    const img = g.createImageData(128, 128)
    const rng = rng32(7)               // 고정 시드 — 실행마다 같은 종이(§5 재현성)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = 255 - Math.floor(rng() * 56)   // 알파 199..255 — 이빨 깊이 ~22%
    }
    g.putImageData(img, 0, 0)
    return t.toDataURL('image/png')
  })()
  const applyPaper = (el: HTMLElement) => {
    el.style.webkitMaskImage = `url(${paper})`
    el.style.maskImage = `url(${paper})`
    el.style.webkitMaskRepeat = 'repeat'
    el.style.maskRepeat = 'repeat'
  }
  applyPaper(canvas)
  applyPaper(snap)
  const paperPhase = (app: App) => {
    const pos = `${Math.round(app.view.ox) % 128}px ${Math.round(app.view.oy) % 128}px`
    if (canvas.style.maskPosition !== pos) {
      canvas.style.maskPosition = pos
      canvas.style.webkitMaskPosition = pos
    }
    if (snap.style.maskPosition !== pos) {
      snap.style.maskPosition = pos
      snap.style.webkitMaskPosition = pos
    }
  }

  // 캐시 키 — 이 값들이 전부 같으면 다시 안 그린다. 그리는 중(draft·호버)에는 어느 것도
  // 안 바뀌므로 **획을 긋는 동안 이 겹의 비용은 0**이다(위 머리주석).
  let last: { renderer: string; docVersion: number; pose: unknown; s: number; ox: number; oy: number; w: number; waitFade: boolean } | null = null
  const dirty = (app: App): boolean =>
    !last || last.renderer !== app.renderer || last.docVersion !== app.docVersion ||
    last.pose !== app.pose || last.s !== app.view.s || last.ox !== app.view.ox ||
    last.oy !== app.view.oy || last.w !== cw || last.waitFade !== app.waitFade
  const remember = (app: App) => {
    last = { renderer: app.renderer, docVersion: app.docVersion, pose: app.pose,
      s: app.view.s, ox: app.view.ox, oy: app.view.oy, w: cw, waitFade: app.waitFade }
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
          // web2-13 3-a: 감쇠 켜짐이면 «자기 포즈»가 각도 0(atOwnPose)이다 —
          // s.view 획이 다른 궤도 포즈에서도 own으로 읽히던 헐거움이 함께 닫힌다.
          // 끄면 종전 식 그대로(A-4).
          const own = app.waitFade ? atOwnPose(app.pose, s.view) : (s.view ? !atDraw : atDraw)
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

  // ── draft 그리기(web2-12 2번) — 진행 중인 획을 확정과 같은 브러시·재료·시드로 ──
  // 잠정 id(draft.nid = 확정될 nextId)가 시드라 뗄 때 입자가 안 바뀐다(게이트).
  // INK는 여기서 안 그린다 — 잉크 확정선의 몸체는 Line2의 균일선이고(질감 없음, redraw의
  // 같은 분기) 미리보기 몸체(ink 겹의 균일 벡터선)가 이미 그 모습이다. 작도 획(지평선·
  // 소실점 정의선)도 밖 — 확정돼도 재료 질감이 없다(안내색 미리보기 그대로).
  const draftEligible = (app: App, d: Draft | null | undefined): d is Draft =>
    !!d && draftBrushed(app, d.label)
  /** draft를 확정과 같은 형태의 Stroke로 — 재료·니브·점별 필압 전부 commitStroke와 같은 규칙 */
  const draftStroke = (app: App, d: Draft): Stroke => {
    const s: Stroke = { id: d.nid, a: d.start, b: d.end, mat: { grade: activeGrade(app) } }
    if (app.tool === 'pen' && app.nib !== C.NIB_PX) s.mat!.w = app.nib
    // rawIn 채택 조건도 확정(commitStroke)과 같다 — raw>2·나란함. 갈리면 뗄 때 프로필이 튄다.
    if (d.press && d.raw.length > 2 && d.press.length === d.raw.length) s.rawIn = { press: d.press }
    return s
  }
  let draftActive = false
  let draftKey = ''                 // (end·점 수)가 같으면 이동이 없던 프레임 — 안 그린다
  let draftRedraws = 0
  let draftMs: number[] = []
  function drawDraftOnly(app: App, d: Draft) {
    const t0 = performance.now()
    const s = draftStroke(app, d)
    // 질감만 — 몸체는 Line2(render3d.setDraftLine)가 이 겹 아래(#gl)에서 그린다
    brush.clear()
    brush.push()
    brush.translate(-cw / 2, -ch / 2)
    drawStroke(app, s, docToScreen(app, d.start), docToScreen(app, d.end))
    brush.pop()
    brush.render()
    draftRedraws++
    if (draftMs.length < 400) draftMs.push(performance.now() - t0)
  }

  let syncs = 0, redraws = 0, blank = false
  return {
    canvas,
    sync(app, draft) {
      syncs++
      paperPhase(app)   // 종이 위상 — 문서(팬)를 따라간다(10번)
      if (draftEligible(app, draft)) {
        // 시작(또는 그리는 중 뷰·문서가 움직인 드문 경우) — 확정 획을 굳혀 스냅샷으로
        if (!draftActive || dirty(app)) {
          if (dirty(app)) { remember(app); redraw(app); redraws++ }
          fitSnap()
          const g2 = snap.getContext('2d')!
          g2.clearRect(0, 0, snap.width, snap.height)
          g2.drawImage(canvas, 0, 0)
          snap.style.display = ''
          draftActive = true
          draftKey = ''
        }
        const key = `${draft.end.x},${draft.end.y},${draft.raw.length},${draft.start.x},${draft.start.y}`
        if (key !== draftKey) { draftKey = key; drawDraftOnly(app, draft) }
        return false
      }
      if (draftActive) {
        // 끝 — 겹을 걷고 확정 상태를 되그린다(확정이 있었으면 docVersion으로도 dirty지만,
        // 잡음 취소(커밋 없음)도 캔버스에 draft 잔상이 있으므로 무조건 되그린다)
        draftActive = false
        snap.style.display = 'none'
        last = null
      }
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
    draftStats: () => {
      const s = [...draftMs].sort((a, b) => a - b)
      return {
        redraws: draftRedraws,
        msMedian: s.length ? s[Math.floor(s.length / 2)]! : 0,
        msMax: s.length ? s[s.length - 1]! : 0,
      }
    },
    resetDraftStats: () => { draftMs = []; draftRedraws = 0 },
    redrawTimed(app) {
      const t0 = performance.now()
      redraw(app)
      return performance.now() - t0
    },
    resize(W2, H2, dpr2) {
      canvas.remove()
      canvas = withStraightAlpha(() =>
        brush.createCanvas(W2, H2, { parent: '#app', pixelDensity: dpr2, id: 'brushc' }))
      applyPaper(canvas)
      cw = W2; ch = H2
      last = null
    },
  }
}
