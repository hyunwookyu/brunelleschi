// brush 렌더러(web2-11 2부) — p5.brush **표준 빌드**(dist/brush.esm.js · p5 불요 ·
// WebGL2)로 «획»을 종이에 그린 것처럼 그린다.
//
// 범위(2-a): **획뿐이다.** 3D(Line2)·작도선(지평선)·소실점 ✕·오스냅 기호·면·치수·미리보기는
// 전부 종전 자리(three.js·ink 캔버스)에 남는다. 「2D는 내가 그린 것, 3D는 확정된 기하」 —
// 이 갈림은 DECISIONS.md에 결정으로 있다.
//
// 겹 구조: #gl(three.js) 아래 → #brushc(이 파일) → #ink(2D 오버레이) 위.
//   - **대기 획**: web2-16 3-a부터 몸체가 **흑연 파선**으로 여기서 그려진다(각도 창 안 —
//     이진, 3-b). 파선이 곧 «대기» 상태 채널이다(불변식 j — 채널은 남고 재질만 흑연이 됐다.
//     #65: 정보를 지우지 않는다). ink의 벡터 점선은 이 경로(brush+감쇠 판정)에서는 안
//     그린다 — 감쇠 판정을 끄면(A-4) 종전대로 통짜 몸체 + ink 점선이다.
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
import { docToScreen, isDrawPose, activeGrade, draftBrushed, fadeRef } from './state'
import { filmSplit, yellowVisible } from './filmlayer'
import { atOwnPose, waitFadeFactor } from '../core/waitfade'
import { project } from '../core/camera'
import { gradeOf, rng32 } from '../core/material'
import { C } from '../core/constants'
import { isFlat2d, type Stroke } from '../core/types'
import { pt, type Pt } from '../core/vec'
import type { Draft } from './render2d'
// 매핑·색·필압 계수는 순수 모듈이다 — 단위가 WebGL 없이 잰다(test/brushmap.test.ts)
import { BRUSH_OF, strokeColor, weightOf, pressureProfile, strokeColorAt, weightAt, rawPressProfile } from './brushmap'
import { remapPress } from '../core/press'

export interface BrushLayer {
  canvas: HTMLCanvasElement
  /** 캐시 키가 갈렸으면 전량 다시 그린다. 반환 = 이번에 실제로 그렸는가.
   *  draft(web2-12 2번)가 있으면 **draft 전용 모드**로 돈다 — 아래 syncDraft 절. */
  sync(app: App, draft?: Draft | null): boolean
  /** 강제 재그리기 + 소요 ms — 성능 원장(2-f)이 부른다 */
  redrawTimed(app: App): number
  /** **비용 표식**(web2-18 0부 ①) — 마지막 «전량» 재그리기의 ms와 그때의 획 수.
   *  `redrawTimed`(강제 실행)와 다르다: 이것은 **앱이 실제로 그린 그 프레임**의 값이라
   *  실기기 진단 패널이 읽을 수 있다(측정용 실행을 패널이 일으키면 패널이 부하가 된다).
   *  `clipped`는 그 재그리기에서 화면 밖으로 걸러낸 획 수 — 3-c ㉠이 채운다(그 전에는 0). */
  lastFull(): { ms: number; drawn: number; clipped: number }
  /** 분자/분모 카운터(#43) — 「그리는 중 재그리기 0회」를 산문이 아니라 수로:
   *  syncs = sync 호출 수(프레임 몫), redraws = 그중 실제로 다시 그린 수.
   *  ⚠ web2-12 2번 뒤에도 이 정의는 산다 — redraws는 **전량**(확정 획) 재그리기만 세고,
   *  draft 한 획 재그리기는 draftStats가 따로 센다(섞으면 «그리는 중 0회»가 안 재진다). */
  stats(): { syncs: number; redraws: number }
  /** ㉢ 제스처 타일 원장(web2-18 3-c) — 굽기 비용·판 수·붙이기 프레임 ms */
  tileStats(): { active: boolean; tiles: number; frames: number; bakeMs: number; bakePasses: number; bakeClamped: number; frameMsMedian: number; frameMsMax: number }
  resetTileStats(): void
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
    // ⚠ CSS 크기를 **명시**한다(web2-14 4번). canvas는 대체 요소라 `inset:0`이 못 늘린다 —
    // style이 없으면 고유 크기(backing = W·dpr)로 표시돼, dpr>1에서 이 겹만 dpr배로 깔렸다.
    // 그리는 동안 확정 획 질감이 좌상단 기준 dpr배 자리에 «같은 장면»으로 또 보인 실기기
    // 증상이 그것이다(dpr1은 고유 크기 == 뷰포트라 무증상 — e2e snapghost.spec이 dpr2로 잰다).
    const w = `${cw}px`, h = `${ch}px`
    if (snap.style.width !== w) snap.style.width = w
    if (snap.style.height !== h) snap.style.height = h
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
  // ⚠ lsig(web2-24 4부): **겹 구성·활성이 키에 든다** — 활성 겹이 바뀌면 이 겹이 그릴
  // 획의 집합(split.above 밖·yellowVisible)이 바뀌는데 docVersion은 그대로라, 키에 없으면
  // 겹을 갈아탄 순간 옐로 획이 화면에서 사라진다(다음 편집까지 스테일 — 3차 [7]의 새 팔
  // (#brushc 픽셀)이 실측으로 잡은 잠복 결함. web2-22의 통짜 몸체 시절부터 있었다).
  const layersSig = (app: App): string =>
    `${app.activeLayer}|${app.doc.layers.map(l => `${l.id}:${l.on ? 1 : 0}:${l.paper}`).join(',')}`
  let last: { renderer: string; docVersion: number; pose: unknown; hold: unknown; s: number; ox: number; oy: number; w: number; waitFade: boolean; lsig: string } | null = null
  const dirty = (app: App): boolean =>
    !last || last.renderer !== app.renderer || last.docVersion !== app.docVersion ||
    last.pose !== app.pose || last.hold !== app.fadePose || last.s !== app.view.s ||
    last.ox !== app.view.ox || last.oy !== app.view.oy || last.w !== cw || last.waitFade !== app.waitFade ||
    last.lsig !== layersSig(app)
  const remember = (app: App) => {
    last = { renderer: app.renderer, docVersion: app.docVersion, pose: app.pose, hold: app.fadePose,
      s: app.view.s, ox: app.view.ox, oy: app.view.oy, w: cw, waitFade: app.waitFade, lsig: layersSig(app) }
  }

  function drawStroke(app: App, s: Stroke, a: Pt, b: Pt) {
    const g = gradeOf(s)
    // ── 필압 보정(web2-26 6번 · 옵션) — **꺼짐이면 이 갈래에 한 번도 안 들어온다** ──
    // p5.brush는 **획당 한 색**이라 농도를 점별로 못 싣는다. 그래서 켠 획만 마디로 나눠
    // 마디마다 색·굵기를 다시 준다(마디 수 `C.PRESS_SEGMENTS` — 새 숫자 ⛔, PRESS_N 급).
    if (drawStrokeCalibrated(app, s, a, b)) return
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

  /** 보정 켠 획 — 마디마다 색·굵기가 갈린다. 켜져 있지 않거나 이 획에 압력이 없으면
   *  **아무것도 안 하고 false**를 돌려준다(종전 경로가 그대로 돈다 — 픽셀 무회귀의 근거).
   *  시드는 **획당 한 번**이다(계약 3) — 마디마다 `brush.line`을 불러도 시퀀스가 결정론이다
   *  (`drawWaitingDashed`가 이미 같은 규약으로 조각을 긋는다 — 선례를 따른다). */
  function drawStrokeCalibrated(app: App, s: Stroke, a: Pt, b: Pt): boolean {
    const cal = app.doc.press
    if (!cal || !cal.on) return false
    const raw = rawPressProfile(s)
    if (!raw) return false
    const g = gradeOf(s)
    brush.seed(s.id)
    brush.noiseSeed(s.id)
    const n = C.PRESS_SEGMENTS
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      const tm = (t0 + t1) / 2
      const pr = raw[Math.min(raw.length - 1, Math.round(tm * (raw.length - 1)))]!
      const pm = remapPress(pr, cal)
      brush.set(BRUSH_OF[g], strokeColorAt(g, pm), weightAt(s, pm))
      brush.line(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0,
        a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1)
    }
    return true
  }

  /** **점렬 몸체**(web2-24 4-b — 옐로 전용): raw가 정본 기하라 화면 점렬을 그대로 긋는다.
   *  시드·재료·필압 규약은 drawStroke와 같다 — 다른 것은 «두 점 보간»이 «점렬»이 된 것뿐.
   *  필압은 pressureProfile을 점렬 진행률 t로 다시 표본한다(재표본 규약 그대로). */
  function drawStrokeRaw(app: App, s: Stroke, pts: Pt[]) {
    const g = gradeOf(s)
    brush.seed(s.id)
    brush.noiseSeed(s.id)
    brush.set(BRUSH_OF[g], strokeColor(g), weightOf(s))
    const cal = app.doc.press
    const raw = cal && cal.on ? rawPressProfile(s) : null
    if (raw) {
      // 보정 켠 점렬 — 마디마다 색·굵기를 다시 준다(위 `drawStrokeCalibrated`와 같은 규약)
      for (let i = 0; i + 1 < pts.length; i++) {
        const t = pts.length > 2 ? i / (pts.length - 2) : 0
        const pr = raw[Math.min(raw.length - 1, Math.round(t * (raw.length - 1)))]!
        const pm = remapPress(pr, cal!)
        brush.set(BRUSH_OF[g], strokeColorAt(g, pm), weightAt(s, pm))
        brush.line(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y)
      }
      return
    }
    const prof = pressureProfile(s)
    const n = pts.length
    const sp: [number, number, number][] = pts.map((p, i) => {
      const t = n > 1 ? i / (n - 1) : 0
      const pr = prof ? prof[Math.min(prof.length - 1, Math.round(t * (prof.length - 1)))]! : 0.5
      return [p.x, p.y, pr]
    })
    brush.spline(sp, 0)   // curvature 0 — 점 사이는 직선 세그먼트(점렬 자체가 곡선을 든다)
  }

  /** 대기 획의 **흑연 파선**(web2-16 3-a) — 벡터 점선을 버리고 확정 획과 같은 브러시로
   *  긋되 파선으로 남긴다: 제도에서 파선은 «아직/숨은»의 계열이다(A-3 — 숨은선).
   *  패턴은 종전 벡터 점선의 규격 그대로(C.WAIT_DASH_* — 상태 채널의 연속성. #65:
   *  정보를 지우지 않는다 — 채널의 «재질»만 바뀐다). 좌표는 화면 px(계약 1).
   *  시드는 획당 한 번 — 조각마다 brush.line을 불러도 시퀀스가 결정론이다(계약 3). */
  function drawWaitingDashed(s: Stroke, a: Pt, b: Pt) {
    const g = gradeOf(s)
    brush.seed(s.id)
    brush.noiseSeed(s.id)
    brush.set(BRUSH_OF[g], strokeColor(g), weightOf(s))
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 1e-6) return
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
    const on = C.WAIT_DASH_ON_PX, period = C.WAIT_DASH_ON_PX + C.WAIT_DASH_OFF_PX
    for (let t = 0; t < L; t += period) {
      const e = Math.min(t + on, L)
      brush.line(a.x + ux * t, a.y + uy * t, a.x + ux * e, a.y + uy * e)
    }
  }

  // 0부 ① — 마지막 전량 재그리기의 실측(앱이 실제로 그린 그 프레임)
  let lastFullMs = 0, lastDrawn = 0, lastClipped = 0

  /** **화면 밖 잘라내기**(web2-18 3-c ㉠) — 이 획이 화면에 조금이라도 걸치는가.
   *  0부가 낸 표에서 궤도 1프레임의 **99% 넘는 몫**이 이 겹의 전량 재그리기였고, 그 안에서
   *  화면 밖 획도 투영되고 붓질까지 됐다. 돌리면 상당수가 밖으로 나간다 — 그것부터 자른다.
   *
   *  ⚠ **여유를 입자 반경만큼 준다**(지시 3-c ㉠ ⚠). 획 «중심»이 화면 밖이어도 붓의 입자는
   *  안으로 들어올 수 있다. p5.brush의 입자 퍼짐은 라이브러리 내부값이라 우리가 못 읽으므로
   *  **굵기의 배수로 상한을 잡는다**: 화면 고정 굵기의 대역이 1.1~4 px(`MAT`·니브)이고
   *  브러시 질감의 퍼짐이 그 몇 배를 넘지 않는다.
 *
 *  **24인 근거는 실측 + 여유다**(e2e gesture.spec ②-b가 매 실행 다시 잰다): 기본 재료의
 *  입자가 획 중심에서 옆으로 번지는 거리가 **2 px**이었다. 굵기 대역의 상한(니브 4 px)과
 *  더해도 6 px 대역이므로 24는 그 네 배다 — 자를 것이 확실한 것만 자른다. 동작점 하나이고
 *  스윕이 없다(#12 · AS-C57). 되돌릴 조건: 실기기에서 「가장자리에서 획이 툭 사라진다」.
 *  ⚠ **반증을 실제로 돌렸다**: 여유를 0으로 두면 ②-b가 빨개진다(중심이 −1 px인 세로획의
 *  입자가 안 들어온다). ⚠ 첫 판의 ②(팬으로 훑기)는 **여유의 판별력이 없었다** — 그 팬에서는
 *  획의 한 끝이 늘 화면 안이라 상자 검사가 안 걸린다(#69 ㉣의 형태. 그래서 ②-b를 세웠다).
   *  ⚠ 대기 획의 **파선**도 같은 상자를 쓴다 — 파선은 획 안에서만 그려지므로 상자가 같다. */
  const CLIP_MARGIN_PX = 24
  let clipW = 0, clipH = 0        // 잘라내기 상자 — redraw 시작 때 한 번 읽는다
  const offScreen = (a: Pt, b: Pt): boolean => {
    const m = CLIP_MARGIN_PX
    if (a.x < -m && b.x < -m) return true
    if (a.y < -m && b.y < -m) return true
    if (a.x > clipW + m && b.x > clipW + m) return true
    if (a.y > clipH + m && b.y > clipH + m) return true
    return false
  }

  function redraw(app: App) {
    const tFull = performance.now()
    let drawn = 0, clipped = 0
    clipW = cw; clipH = ch
    brush.clear()
    if (app.renderer === 'brush') {
      brush.push()
      // 원점이 캔버스 가운데다(standalone 규약) — 좌상단 화면 좌표로 옮긴다
      brush.translate(-cw / 2, -ch / 2)
      const atDraw = isDrawPose(app.pose)
      const waiting = new Set(app.lift.waiting)
      const split = filmSplit(app)   // 위 획(활성 겹과 그 위)은 #layerc 몫(web2-20 3부)
      const yset = yellowVisible(app)  // 옐로 겹의 2D 획(web2-22 1부 — 그 종이·그 시점만)
      for (const s of app.doc.strokes) {
        const id = s.id
        if (split && s.layer !== undefined && split.above.has(s.layer)) continue
        // 옐로 획 — 2D다(승격도 대기도 아님): 문서 좌표 그대로, 제 재료의 몸체.
        // **정본 기하는 raw 점렬이다**(web2-24 4-b — 프리핸드). 머무름 갈음·짧은 획은
        // 두 점이라 종전 경로 그대로다. 잘라내기는 점렬 bbox의 두 모서리로 판정
        // (offScreen은 두 점이 같은 변 밖일 때만 참이라 bbox 모서리 대입이 보수적으로 옳다).
        // 글씨 획(web2-32 1번)도 이 갈래다 — **같은 규격**이므로 술어가 하나다(isFlat2d)
        if (isFlat2d(s, yset)) {
          if (s.raw && s.raw.length > 2) {
            const spts = s.raw.map(p => docToScreen(app, p))
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
            for (const p of spts) {
              if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x
              if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y
            }
            if (offScreen({ x: x0, y: y0 }, { x: x1, y: y1 })) { clipped++; continue }
            drawn++
            drawStrokeRaw(app, s, spts)
            continue
          }
          const ya = docToScreen(app, s.a), yb = docToScreen(app, s.b)
          if (offScreen(ya, yb)) { clipped++; continue }
          drawn++
          drawStroke(app, s, ya, yb)
          continue
        }
        if (waiting.has(id)) {
          // 대기 획(web2-16 3-a·3-b) — 기본(감쇠 판정 켜짐): 각도 창 **안**이면 흑연
          // 파선으로 그린다(waitFadeFactor 이진 — 창 밖은 즉시 0. 몸체가 이 겹으로
          // 옮겨 왔고 ink의 벡터 점선은 이 경로에서 안 그린다 — render2d 같은 조건).
          // 판정 포즈는 fadeRef(web2-14 3번 — 제스처 중 동결. 빼면 왕복 깜빡임이 돌아온다).
          // 끄면 종전 식 그대로(A-4): own에서만 통짜 몸체 + ink 점선은 render2d 몫.
          if (app.waitFade) {
            if (waitFadeFactor(fadeRef(app), s.view) <= 0) continue
            const wa = docToScreen(app, s.a), wb = docToScreen(app, s.b)
            if (offScreen(wa, wb)) { clipped++; continue }
            drawn++
            drawWaitingDashed(s, wa, wb)
          } else {
            const own = s.view ? !atDraw : atDraw
            if (!own) continue
            const oa = docToScreen(app, s.a), ob = docToScreen(app, s.b)
            if (offScreen(oa, ob)) { clipped++; continue }
            drawn++
            drawStroke(app, s, oa, ob)
          }
        } else {
          const seg = app.lift.lifted.get(id)
          if (!seg) continue
          if (gradeOf(s) === 'INK') continue // 잉크 승격선은 Line2가 균일하게 그린다 — 질감 없음(grain과 동일)
          const a = project(app.lift.an, app.pose, seg.a3)
          const b = project(app.lift.an, app.pose, seg.b3)
          if (!a || !b) continue
          const sa = docToScreen(app, a), sb = docToScreen(app, b)
          if (offScreen(sa, sb)) { clipped++; continue }
          drawn++
          drawStroke(app, s, sa, sb)
        }
      }
      brush.pop()
    }
    brush.render()
    lastFullMs = performance.now() - tFull
    lastDrawn = drawn
    lastClipped = clipped
  }

  // ── draft 그리기(web2-12 2번) — 진행 중인 획을 확정과 같은 브러시·재료·시드로 ──
  // 잠정 id(draft.nid = 확정될 nextId)가 시드라 뗄 때 입자가 안 바뀐다(게이트).
  // INK는 여기서 안 그린다 — 잉크 확정선의 몸체는 Line2의 균일선이고(질감 없음, redraw의
  // 같은 분기) 미리보기 몸체(ink 겹의 균일 벡터선)가 이미 그 모습이다.
  // ⚠ 「작도 획(소실점 정의선)도 밖」은 web2-19 1부가 없앴다 — 그 획은 진짜 모서리라
  // 확정되면 질감으로 그려지므로 미리보기도 같아야 한다(state.ts draftBrushed가 정본).
  const draftEligible = (app: App, d: Draft | null | undefined): d is Draft =>
    !!d && draftBrushed(app)
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


  // ── ㉢ **획별 질감 캐시**(web2-18 3-c ㉢) — 돌리는 중에도 흑연이 남는다 ────────────
  //
  // 사람이 정한 구속(3-b): **질감은 안 끈다.** 벡터선 대체·질감 토글·「돌리는 동안만
  // classic」은 전부 금지다. 줄일 것은 **획당 비용**이지 질감이 아니다.
  //
  // 0부 표가 지목한 자리는 하나였다: 궤도 1프레임의 **99% 넘는 몫**이 이 겹의 전량
  // 재그리기이고(render3d·draw2d는 400획에서도 1 ms 아래), ㉠(화면 밖 잘라내기)만으로는
  // 그 표가 안 움직였다(픽스처의 획이 궤도 중에도 거의 화면 안이다 — 실측 147.7 ms).
  //
  // 방법: 한 획의 흑연을 **자기 좌표계**(가로로 누운 길이 L × 굵기 w)에 한 번 굽고,
  // 제스처 중에는 그 타일을 새 두 끝점으로 **아핀 변환**해 붙인다. 확정 기하가 직선이라
  // 사영도 직선이므로 성립한다(지시 3-c ㉢). 놓으면 정확히 다시 굽는다 —
  // **정본은 언제나 놓은 뒤 화면**이다.
  //
  // 굽는 자리: `#brushc` 자신을 **아틀라스**로 쓴다. 획들을 가로로 누워 격자에 담아
  // **한 번의 render()**로 그린 뒤 조각마다 2D 타일로 떠 온다(획마다 render를 부르면
  // 그 자체가 전량 재그리기만큼 든다). 제스처 동안 `#brushc`는 숨고 `#brushsnap`(2D)이
  // 타일을 붙인다 — 종이 마스크가 두 겹에 다 걸려 있어 결이 이어진다.
  //
  // ⚠ **대가**: 길이 방향으로만 배율이 실리므로 큰 회전에서 결이 늘거나 눌린다.
  //   그 정도는 e2e가 픽셀로 재고 원장에 적는다(gesture_tiles_web2.json).
  // ⚠ 화면보다 긴 획은 캔버스에 안 들어간다 — **줄여 굽고 늘려 붙인다**(안 그리지 않는다:
  //   ①「궤도 중 모든 프레임에 흑연이 있다」가 사람의 구속이다). 그 수는 원장이 센다.
  //
  // ⚠ **아틀라스는 2D 캔버스 한 장이고 타일은 그 안의 사각형이다.** 획마다 캔버스를 만들어
  //   `#brushc`에서 따로 떠 오던 초판은 **WebGL 판독을 획 수만큼** 일으켜 굽기가 400획에서
  //   ~300 ms였다(1차 리뷰어 [4]가 «최악 프레임이 오히려 늘었다»로 잡았다 — 중앙값만 보고
  //   게이트를 닫을 뻔했다). WebGL→2D 복사는 **판당 한 번**이면 되고 나머지는 2D→2D다.
  interface Tile {
    /** 아틀라스 안의 사각형(물리 px — 판독 좌표) */
    sx: number; sy: number; sw: number; sh: number
    /** 구울 때의 화면 길이(CSS px) — 붙일 때 배율의 분모 */
    bakedL: number
    /** 타일 안에서 획이 시작하는 x(CSS px) — 입자가 끝 너머로 번지는 여유 */
    pad: number
    /** 타일 크기(CSS px)와 그 안의 획 중심선 y */
    w: number; h: number; midY: number
  }
  /** 아틀라스 — 2D 캔버스 한 장(판이 여럿이면 세로로 쌓는다) */
  const atlas = document.createElement('canvas')
  const TILE_PAD_PX = 10          // 끝 너머 입자 여유 — CLIP_MARGIN_PX와 같은 물음의 작은 판
  const TILE_H_MULT = 7           // 타일 높이 = 굵기 × 이것(입자가 옆으로 번지는 몫)
  let tiles = new Map<number, Tile>()
  let tileSig = ''                // 어떤 상태로 구웠나 — 문서·렌더러·배율이 바뀌면 다시 굽는다
  let tiled = false               // 지금 제스처 타일 경로로 그리고 있는가
  let bakeMs = 0, bakePasses = 0, bakeClamped = 0
  let tileFrames = 0, tileFrameMs: number[] = []

  /** 이 제스처에서 그릴 «획 + 그때의 화면 선분» 목록 — redraw와 **같은 판정**을 쓴다.
   *  (승격/대기·감쇠·잉크 제외·화면 밖 잘라내기 전부 그대로 — 두 자리에 다른 규칙을 안 둔다) */
  function gestureList(app: App): { s: Stroke; a: Pt; b: Pt; dashed: boolean }[] {
    const out: { s: Stroke; a: Pt; b: Pt; dashed: boolean }[] = []
    const atDraw = isDrawPose(app.pose)
    const waiting = new Set(app.lift.waiting)
    const split = filmSplit(app)   // redraw와 같은 제외(두 자리에 다른 규칙을 안 둔다)
    const yset = yellowVisible(app)  // redraw와 같은 옐로 2D 갈래(web2-22 1부)
    for (const s of app.doc.strokes) {
      if (split && s.layer !== undefined && split.above.has(s.layer)) continue
      if (isFlat2d(s, yset)) {
        out.push({ s, a: docToScreen(app, s.a), b: docToScreen(app, s.b), dashed: false })
        continue
      }
      if (waiting.has(s.id)) {
        if (app.waitFade) {
          if (waitFadeFactor(fadeRef(app), s.view) <= 0) continue
          out.push({ s, a: docToScreen(app, s.a), b: docToScreen(app, s.b), dashed: true })
        } else {
          const own = s.view ? !atDraw : atDraw
          if (!own) continue
          out.push({ s, a: docToScreen(app, s.a), b: docToScreen(app, s.b), dashed: false })
        }
      } else {
        const seg = app.lift.lifted.get(s.id)
        if (!seg) continue
        if (gradeOf(s) === 'INK') continue     // 잉크 몸체는 #ink다(web2-18 1부)
        const a = project(app.lift.an, app.pose, seg.a3)
        const b = project(app.lift.an, app.pose, seg.b3)
        if (!a || !b) continue
        out.push({ s, a: docToScreen(app, a), b: docToScreen(app, b), dashed: false })
      }
    }
    return out
  }

  /** 아틀라스 한 판을 굽고 타일로 떠 온다. 반환 = 이번 판에 담은 항목 수 */
  function bakePass(app: App, items: { s: Stroke; L: number; h: number; w: number }[], from: number, pass: number): number {
    const dpr = snap.width / Math.max(1, cw)
    fitSnap()
    brush.clear()
    brush.push()
    brush.translate(-cw / 2, -ch / 2)
    const placed: { s: Stroke; x: number; y: number; w: number; h: number; L: number }[] = []
    let x = 0, y = 0, rowH = 0
    let i = from
    for (; i < items.length; i++) {
      const it = items[i]!
      const tw = it.L + TILE_PAD_PX * 2
      if (x + tw > cw) { x = 0; y += rowH; rowH = 0 }
      if (y + it.h > ch) break                     // 이 판은 찼다 — 다음 판으로
      const midY = y + it.h / 2
      const a = pt(x + TILE_PAD_PX, midY)
      const b = pt(x + TILE_PAD_PX + it.L, midY)
      // **확정 그리기와 같은 함수**를 부른다 — 타일이 «다른 붓»으로 구워지면 안 된다
      const dashed = app.lift.waiting.includes(it.s.id) && app.waitFade
      if (dashed) drawWaitingDashed(it.s, a, b)
      else drawStroke(app, it.s, a, b)
      placed.push({ s: it.s, x, y, w: tw, h: it.h, L: it.L })
      x += tw
      rowH = Math.max(rowH, it.h)
    }
    brush.pop()
    brush.render()
    // **판 한 장을 통째로** 아틀라스에 복사한다(WebGL 판독 1회) — 그 뒤 타일은 그 안의
    // 사각형일 뿐이라 붙일 때 추가 복사가 없다. 판독은 straight alpha 컨텍스트라 합성과 같다.
    const g = atlas.getContext('2d')!
    const oy = pass * Math.round(ch * dpr)
    g.clearRect(0, oy, atlas.width, Math.round(ch * dpr))
    g.drawImage(canvas, 0, oy)
    for (const q of placed) {
      tiles.set(q.s.id, {
        sx: Math.round(q.x * dpr), sy: oy + Math.round(q.y * dpr),
        sw: Math.max(1, Math.round(q.w * dpr)), sh: Math.max(1, Math.round(q.h * dpr)),
        bakedL: q.L, pad: TILE_PAD_PX, w: q.w, h: q.h, midY: q.h / 2,
      })
    }
    return i - from
  }

  /** 판 수 미리 세기 — `bakePass`의 배치 규칙과 **같은 셈**이다(두 자리에 다른 식을 안 둔다) */
  function estimatePasses(items: { L: number; h: number }[]): number {
    let x = 0, y = 0, rowH = 0, passes = 1
    for (const it of items) {
      const tw = it.L + TILE_PAD_PX * 2
      if (x + tw > cw) { x = 0; y += rowH; rowH = 0 }
      if (y + it.h > ch) { passes++; x = 0; y = 0; rowH = 0 }
      x += tw; rowH = Math.max(rowH, it.h)
    }
    return passes
  }

  /** 제스처 시작 — 지금 화면의 획들을 타일로 굽는다 */
  function bakeTiles(app: App) {
    const t0 = performance.now()
    tiles = new Map()
    bakePasses = 0; bakeClamped = 0
    const list = gestureList(app)
    const items = list.map(({ s, a, b }) => {
      const L0 = Math.hypot(b.x - a.x, b.y - a.y)
      const maxL = Math.max(8, cw - TILE_PAD_PX * 2)
      if (L0 > maxL) bakeClamped++
      const w = weightOf(s)
      return { s, L: Math.max(1, Math.min(L0, maxL)), h: Math.ceil(w * TILE_H_MULT) + 6, w }
    })
    // 아틀라스 크기 — 판 수를 모르므로 **먼저 필요한 판 수를 세고** 한 번에 잡는다.
    // (캔버스 크기 변경은 내용을 지우므로 도중에 늘릴 수 없다.)
    const dpr = snap.width / Math.max(1, cw)
    const need = Math.max(1, Math.min(24, estimatePasses(items)))
    const aw = Math.round(cw * dpr), ah = Math.round(ch * dpr) * need
    if (atlas.width !== aw || atlas.height !== ah) { atlas.width = aw; atlas.height = ah }
    let done = 0
    while (done < items.length && bakePasses < need) {
      const n = bakePass(app, items, done, bakePasses)
      bakePasses++
      if (n === 0) break                            // 한 항목도 못 담았다 — 무한 루프 방지
      done += n
    }
    bakeMs = performance.now() - t0
  }

  /** 제스처 프레임 — 타일을 지금 두 끝점으로 아핀 변환해 붙인다(O(획) drawImage) */
  function drawTiled(app: App) {
    const t0 = performance.now()
    fitSnap()
    const dpr = snap.width / Math.max(1, cw)
    const g = snap.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, snap.width, snap.height)
    for (const { s, a, b } of gestureList(app)) {
      const t = tiles.get(s.id)
      if (!t) continue
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 1e-6) continue
      if (offScreen(a, b)) continue                 // ㉠ — 붙일 때도 같은 상자
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
      const k = L / t.bakedL                        // **길이 방향만** 배율(굵기는 화면 고정)
      // 타일 국소 (pad, midY) → 화면 a. 굵기 축(세로)에는 배율을 안 싣는다.
      const m11 = ux * k, m12 = uy * k, m21 = -uy, m22 = ux
      const tx = a.x - (m11 * t.pad + m21 * t.midY)
      const ty = a.y - (m12 * t.pad + m22 * t.midY)
      g.setTransform(m11 * dpr, m12 * dpr, m21 * dpr, m22 * dpr, tx * dpr, ty * dpr)
      g.drawImage(atlas, t.sx, t.sy, t.sw, t.sh, 0, 0, t.w, t.h)
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
    tileFrames++
    if (tileFrameMs.length < 400) tileFrameMs.push(performance.now() - t0)
  }

  /** 제스처 경로를 켜고 끈다 — `#brushc`는 아틀라스를 들고 숨는다 */
  function setTiled(on: boolean) {
    if (tiled === on) return
    tiled = on
    canvas.style.visibility = on ? 'hidden' : ''
    snap.style.display = on ? '' : 'none'
    if (!on) { tiles = new Map(); tileSig = '' }
  }

  let syncs = 0, redraws = 0, blank = false
  return {
    canvas,
    sync(app, draft) {
      syncs++
      paperPhase(app)   // 종이 위상 — 문서(팬)를 따라간다(10번)
      // ── ㉢ 제스처(궤도·팬) — 타일 경로 ────────────────────────────────────
      // 판정자는 `app.fadePose`다: 그것이 «지금 잡고 있다»의 단일 출처이고(web2-14 3번),
      // 대기 획 감쇠 동결도 같은 값을 읽는다 — 두 자리에 다른 술어를 안 둔다(#54).
      // draft(그리는 중)가 우선이다 — 그때는 스냅샷 겹이 이미 그 자리를 쓴다.
      const gesture = app.renderer === 'brush' && app.fadePose !== null && !draftEligible(app, draft)
      if (gesture) {
        // 굽는 조건: 문서·렌더러·배율이 그대로면 다시 안 굽는다(제스처 내내 한 번).
        // ⚠ 배율(줌)이 바뀌면 다시 굽는다 — 화면 고정 굵기가 배율에 안 실려야 한다.
        const sig = `${app.docVersion}|${app.renderer}|${app.view.s}|${cw}x${ch}|${app.waitFade}`
        if (!tiled || sig !== tileSig) {
          bakeTiles(app)
          tileSig = sig
          setTiled(true)
        }
        drawTiled(app)
        paperPhase(app)
        last = null            // 놓으면 전량 재그리기가 정확히 다시 굽는다(정본은 놓은 뒤 화면)
        return true
      }
      if (tiled) setTiled(false)

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
    lastFull: () => ({ ms: lastFullMs, drawn: lastDrawn, clipped: lastClipped }),
    tileStats: () => {
      const v = [...tileFrameMs].sort((a, b) => a - b)
      return {
        active: tiled, tiles: tiles.size, frames: tileFrames,
        bakeMs: +bakeMs.toFixed(2), bakePasses, bakeClamped,
        frameMsMedian: v.length ? +v[Math.floor(v.length / 2)]!.toFixed(3) : 0,
        frameMsMax: v.length ? +v[v.length - 1]!.toFixed(3) : 0,
      }
    },
    resetTileStats: () => { tileFrames = 0; tileFrameMs = [] },
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
