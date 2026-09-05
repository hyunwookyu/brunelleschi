// 배선 — 상태·입력·렌더를 잇는다. 계산은 전부 core에 있다.

import { createApp, commitStroke, undo, redo, resetPose, gotoSheet, loadDoc, clearAll, isEraser, isDrawPose, orbitRadius, orbitPivot, setDimension, activeGrade, draftBrushed, setOwn3d, composeView, addLayer, addSheet, freezePoseForLayer, setActiveLayer, removeLayer, findAllFaces, commitCandidates, cancelCandidates, underlayOf, underlayBakeCount, pressOn, beginPressCalib, setPressOff, feedPressCalib, bumpDoc,
  pickDimTarget, pickTargetAt, addDimInk, stageDim, acceptDim, clearDimInk, endDimPick,
  handwritingGroup, applyRecognized, writingStrokes, pickDimLabel, moveDim, endDimEdit, dimLabelPos,
  writeActive, beginWriting, endWriting, commitWriting, writeIdleNow,
  beginHold, unlockStroke, manipLabel, duplicateGrip, lockGrip, joinGrip, faceFrontTarget, gripActive,
  frontFlyTarget, liveFaceSel, lastSelFace, faceThicknessNow, setClsThickness, setFaceThicknessEx, faceSlotsOf,
  njGrip, setStrokeNj, setJoint56OffForTest,
  commitPaint, buildPaintStrokes, injectPaintAt, tapSelectFace, cycleFaceClass, faceClassNow, cycleFaceFill, FILL_NAMES, cycleFaceMat, cycleFaceRep, paintActive, docToScreen, setPaintWLegacyForTest, worldPerPxPerpProbeForTest,
  placePersonAt, gripFaceArea, floorAreaNow, volumeNow, flashFaces, screenToDoc, roomsNow,
  measureTap, clearMeasure, zoomFit, viewScale, viewXf, setViewLensStops, resetViewLens, parallelPxPerUnit, settleActive, slidesActive, pruneSlides, settleSlides, slideAwayOf, startSlide, type Tool } from './state'
import { initPaperbar } from './paperbar'
import { initLayerbar, LAYER_GATE_MSG, ROLL_TRACING, ROLL_YELLOW } from './layerbar'
import { initInput } from './input'
import { createAutoLevel } from './autolevel'
import { isLevel, pitchSnaps } from '../core/level'
import { resize2d, draw2d, horizonVisible, setForceConstructing, refreshStencil, setPaintPreviewVectorForTest, type Draft } from './render2d'
import { loadStencil, saveStencil, clearStencil } from '../core/stencil'
import { initR3D, syncStrokes, render3d, resize3d, setDraftLine, syncCost, resetSyncCost, getHatchMode, setHatchMode, setFaceSortForTest, paintTexStats, corruptPaintTexForTest, rebakePaintTexForTest, paintTexHashForTest, setPaintBlendForTest, paintClampedVisible, paintDraftStats, paintBakeStats, resetPaintBakeStats, setPaintAccumOffForTest, setPaintPartialOffForTest, setPaintTexBudgetForTest, paintDraftFrameStats, resetPaintDraftFrameStats, setPaintFreezeOffForTest, paintFreezeOffForTest, setRepTexelSigOffForTest } from './render3d'
import { serializeBrnl, setSaveRoundForTest, parseBrnl, readBrnl, reportNotice } from '../core/file'
import { initFilePanel, type FilePanel } from './filepanel'
import { setStoreFailForTest, listDocs, getDoc, putDoc, newDocId, migrateFromLocal } from '../core/store'
import { toOBJ, toMTL, toGLTF } from '../core/export'
import { initNotice, notify, status, ask, clearNotice, confirmNear } from './notice'
import { recognizeStrokes } from '../core/handwriting'
import { OSNAP_ORDER, osnap, osnapCost, resetOsnapCost, type OsnapHit } from '../core/osnap'
import { PENCIL_GRADES, MAT, widthOfMat, gradeOf } from '../core/material'
import { type Instr, materialOf, type MatId } from '../core/palette'   // (MATERIALS·TONE_NAMES의 견본 줄은 web2-64 64-7이 지웠다 — 재료 자체는 matrep·facetex가 쓴다)
// 색상 휠(web2-48 48-7) — 기하·색 변환은 순수 모듈이 든다(이 파일은 DOM만).
import { hsvOf, hexOfHsv, svRect, svPoint, huePoint, hueAt, svAt, partAt, markerInk, type Hsv, type WheelGeom, type WheelPart } from '../core/colorwheel'
import { brushLabel, brushOrigin } from '../core/brushnames'
import type { Grade, Layer, Sheet, Stroke, CamPose } from '../core/types'
import { parseDim, formatMm, lenMm, formatScale, formatUnits, dimSkew, skewOff, UNITS, type Unit } from '../core/dim'
import { measureMm, measureUnits } from '../core/measure'
import { initDimPanel } from './dimpanel'
import { registerBox, closeOtherBoxes, openBoxIds, setBoxAwayModeForTest } from './boxes'
import { createVoice } from './voice'
import type { Pt } from '../core/vec'
import { add3, mul3 } from '../core/vec'
import { borderQuads } from '../core/border'
import { DEFAULT_CLS } from '../core/clsdef'
import { C, SETTLE_ANIM_MS, LAY_SLIDE_MS, WRITE_HOLD_MS_MIN, WRITE_HOLD_MS_MAX } from '../core/constants'
import { WAIT_INK, setWaitInkMode, waitInkMode, type WaitInkMode } from '../core/waitfade'
import {
  lensAllowed, lensStops, lensF, lensK, hfovDeg, LENS_STOP_MIN, LENS_STOP_MAX,
  focalText, focal35mm, scaleText, scaleDenom,
} from '../core/lens'
import { cubeLayoutFor, viewName, parallelAllowed } from '../core/viewcube'

const W = window.innerWidth
const H = window.innerHeight
const dpr = window.devicePixelRatio || 1

const ink = document.getElementById('ink') as HTMLCanvasElement
const gl = document.getElementById('gl') as HTMLCanvasElement
initNotice(document.getElementById('notice')!)

const app = createApp(W, H)
let ctx = resize2d(ink, W, H, dpr)
const r3d = initR3D(gl, W, H, dpr)

// brush 렌더러(web2-11 2부) — 획 겹. 켬/끔은 사람이 세로바에서 바로 바꾼다(2-b).
// 저장은 localStorage — 문서의 값이 아니라 «보는 방식»이다(원칙 b의 표시판).
import { initBrushLayer } from './brushlayer'
const RENDERER_KEY = 'b2-renderer'
try {
  const r = localStorage.getItem(RENDERER_KEY)
  if (r === 'classic' || r === 'brush') app.renderer = r
} catch { /* 저장소가 없으면 기본값(brush) */ }
const brushLayer = initBrushLayer(W, H, dpr)
import { initFilmLayer, bakeFiberTile, setFilmAlphaForTest, setFiberLegacyForTest, setGrainPre40ForTest, setOverlayLenKForTest, setPaperFiber, setPaperGrain309ForTest } from './filmlayer'
const filmLayer = initFilmLayer(W, H, dpr)

// 빌드 식별자 — 배포됐는지 화면에서 바로 안다.
// ⚠ 이것 하나가 앱을 죽이면 안 된다 — 설정이 낡은 dev 서버에서 치환이 안 돼
// 여기서 앱 전체가 서지 않은 적이 있다(2026-08-21).
declare const __BUILD_ID__: string
try {
  document.getElementById('buildid')!.textContent = __BUILD_ID__
} catch { /* 치환이 안 됐다 — 화면에만 안 뜬다 */ }

// 진단 패널(web2-10 지시 4 · web2-11 1-f 확장) — 콘솔 없는 태블릿의 판독 통로.
// ⚠ **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 종전에는 우하단 빌드 식별자를 눌렀는데,
//    그 자리를 겨눈 손이 다른 버튼 대신 그것을 눌렀다(사람 관측). 빌드 식별자는 이제
//    `pointer-events: none`인 **표시**이고, 여닫이는 **설정 패널의 「진단」**이다.
//    없애지 않은 이유: 태블릿에는 콘솔이 없어 이 길이 유일한 판독 통로다.
import { initDiagPanel } from './diagpanel'
import type { StrokeCapStats } from './input'
let inputApi: { strokeStats: () => StrokeCapStats } | null = null
/** 지금 문서의 .brnl 크기 — 저장 버튼과 같은 직렬화라 «저장하면 이 크기»다(1-f) */
const brnlBytes = () =>
  new Blob([serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView })]).size
const diagPanel = initDiagPanel(
  document.getElementById('btn-diag')!, document.getElementById('diagpanel')!,
  () => {
    const st = inputApi?.strokeStats()
    return [
      ['렌더러', app.renderer === 'brush' ? 'brush (p5.brush 2.2.2 standalone)' : 'classic (2D 캔버스 + grain)'],
      ['최근 획', st && st.pointerType
        ? `${st.points}점 (${st.pointerType}) · 이벤트 ${st.events} · coalesced 추가 ${st.extra}`
        : '—'],
      ['.brnl', `${brnlBytes()} B · 획 ${app.doc.strokes.length}`],
      // 대기의 사유(web2-17 1-c·4부) — 「아무 일도 안 일어난다」가 사유 없이 남지 않는다.
      // 원인 셋을 가른다(#43): 위쪽(올려다보기 — 팬이 답) · 그 자리(따라긋기 — 퇴화) ·
      // 높이 있음(4부 — 위치 미정: 교점·연결이 정의한다).
      ['대기 획', `${app.lift.waiting.length} (지평선 위쪽 ${[...app.lift.waitWhy.values()].filter(v => v === 'aboveHorizon').length} · 지평선 자리 ${[...app.lift.waitWhy.values()].filter(v => v === 'onHorizon').length} · 높이 있음 ${[...app.lift.waitWhy.values()].filter(v => v === 'hasHeight').length} · 비축 섞임 ${[...app.lift.waitWhy.values()].filter(v => v === 'mixedWait').length})`],
      // 「잘못 찍힌 점」 문이 버린 수(web2-13 3-b) — 조용히 버리지 않는다: 수가 말한다.
      // 크면 C.STRAY_MIN_PX가 틀린 것이다(원장 stray_gate_web2.json이 근거 대역).
      ['버린 짧은 획', `${app.strayCount} (문 ${C.STRAY_MIN_PX}px)`],
      // ── 비용(web2-18 0부) — **실기기가 읽는 자리**다. 헤드리스 표와 값이 다를 것을
      // 전제한 배치다(지시 0부 ⚠): 이 세 줄이 사람 기기의 표를 만든다.
      // 전부 **그 자리에서 읽는 현재값**이다 — 패널이 측정을 «일으키지» 않는다(패널이
      // 부하가 되면 재는 대상이 바뀐다). ①은 앱이 마지막으로 실제 그린 전량 재그리기,
      // ③은 마지막 프레임들의 3몫 합(중앙·최악), ④는 osnap 호출당 평균의 3몫 분해다.
      ['① 전량 흑연 ms', (() => {
        const f = brushLayer.lastFull()
        return `${f.ms.toFixed(2)} (그린 획 ${f.drawn}${f.clipped > 0 ? ` · 화면 밖 ${f.clipped}` : ''})`
      })()],
      ['② syncStrokes ms', `${syncCost.lastMs.toFixed(2)} (누적 ${syncCost.calls}회)`],
      // ㉢ 제스처 타일(3-c) — 돌리는 중에 흑연이 어디서 오는지가 여기 보인다
      ['제스처 타일', (() => {
        const t = brushLayer.tileStats()
        return t.frames === 0 && !t.active ? '— (아직 안 돌렸다)'
          : `${t.active ? '켜짐' : '꺼짐'} · 타일 ${t.tiles}(굽기 ${t.bakeMs}ms · ${t.bakePasses}판`
            + `${t.bakeClamped ? ` · 줄여구움 ${t.bakeClamped}` : ''}) · 붙이기 중앙 ${t.frameMsMedian}ms · 최악 ${t.frameMsMax}ms`
      })()],
      ['③ 프레임 합 ms', (() => {
        const q = frameCostQ()
        return q ? `중앙 ${q.total.toFixed(2)} · 최악 ${q.totalMax.toFixed(2)}`
          + ` (3D ${q.r3.toFixed(2)} · 흑연 ${q.bs.toFixed(2)} · 2D ${q.d2.toFixed(2)}) · 표본 ${q.n}` : '—'
      })()],
      // ── 어떤 오스냅이 이 획을 정했나(web2-18 2-c) — 사람이 「정확히 어떤 오스냅
      // 때문인지는 모르겠지만」이라고 했다. 그것을 앱이 말한다. 값은 앱이 실제로 쓴
      // `OsnapHit.kind` 그대로다(표시용으로 다시 계산하지 않는다 — 원칙 a).
      ['마지막 획 스냅', app.lastSnap
        ? `시작 ${app.lastSnap.start ?? '없음(자유)'} · 끝 ${app.lastSnap.end ?? '없음(자유)'}`
        : '—'],
      ['지금 호버 스냅', hover ? `${hover.kind}` : '—'],
      // 연장선 획득(2-b) — 상시가 아니라 획득식이라는 것이 여기 수로 보인다
      ['연장선 획득', `${app.extAcq.acquired.length}/${C.EXT_MAX_ACQUIRED}`
        + (app.extAcq.acquired.length ? ` — ${app.extAcq.acquired.map(a => `획#${a.id}${a.end === 0 ? 'a' : 'b'}`).join(' · ')}` : '')
        + ` (머무름 ${C.EXT_ACQUIRE_MS}ms · 상한 ${C.EXT_MAX_RATIO}배)`],
      ['④ osnap ms/회', osnapCost.calls === 0 ? '—'
        : `${(osnapCost.totalMs / osnapCost.calls).toFixed(3)}`
          + ` (교차 ${(osnapCost.intersectMs / osnapCost.calls).toFixed(3)}`
          + ` · 끝점병합 ${(osnapCost.endsMs / osnapCost.calls).toFixed(3)}`
          + ` · 나머지 ${(osnapCost.restMs / osnapCost.calls).toFixed(3)}) · 호출 ${osnapCost.calls}`],
      // 지금 어느 3D 경로인가(web2-13 4-f · web2-14 1번에서 정본이 뒤집혔다) —
      // 깃발이 눈에 보이는 자리. 교점 정의(4-g)의 성립·무산도 여기 센다([42] —
      // 조용히 버리지 않는다. 무산은 «끝이 대기선 위에서 끝났는데 안 선» 경우 전부다
      // (web2-16 2-b — 종전에는 A가 3D가 아니면 계수 없이 죽었다. 이제 A못줌·카메라
      // 미확정도 센다: 그 계수가 있었으면 앱이 사람보다 먼저 말했을 자리다).
      ['3D 경로', app.own3d
        ? `자립(정본 — 굳힘 ${app.doc.strokes.filter(s => s.own3).length}획 · 교점 성립 ${app.touchStats.ok}`
          + ` · 무산 ${app.touchStats.noCam + app.touchStats.aNot3d + app.touchStats.pose + app.touchStats.axis + app.touchStats.lift + app.touchStats.roundtrip + app.touchStats.layer}`
          + `(A못줌 ${app.touchStats.aNot3d}·카메라 ${app.touchStats.noCam}·시점 ${app.touchStats.pose}·방향 ${app.touchStats.axis}·리프팅 ${app.touchStats.lift}·왕복 ${app.touchStats.roundtrip}·층 ${app.touchStats.layer})`
        : '사슬(대체 — 설정에서 껐다)'],
      // 자동 저장 잔량(web2-22 3부) — 조용히 차지 않게: 상한 «가정» 대비 %가 상시 보인다
      // ⚠ web2-43부터 저장 자리는 IndexedDB이고 이 5MB는 **한 문서의 눈금**이다(저장소
      // 예산은 GiB 대역 — §0). 뜻과 근거는 `C.AUTOSAVE_LIMIT_BYTES`의 주석 하나다(#54).
      ['자동 저장', (() => {
        const l = filePanelRef?.last()
        return l
          ? `${(l.bytes / 1024).toFixed(0)} KB / 문서 눈금 ${(C.AUTOSAVE_LIMIT_BYTES / 1024 / 1024).toFixed(1)} MB — ${(l.pct * 100).toFixed(1)}%`
          : '아직 없음'
      })()],
      // 마지막 획의 교점 단계(web2-14 2번 — 지시 ①~④): 실기기에서 «왜 안 붙었나»를
      // 단계로 읽는 자리. ① 미승격인데 닿았으면 그 사유(A못줌)가 여기 보인다(2-b).
      ...(app.own3d && app.touchLast ? [[
        '교점(마지막 획)',
        (app.touchLast.lifted
          ? `① 3D ✓ · ② 닿음 ${app.touchLast.touched} · ③④ 성립 ${app.touchLast.ok}`
          : `① 그 획이 대기다 — 시작점 오스냅·축 스냅부터 본다 · ② 닿음 ${app.touchLast.touched}`)
        + (app.touchLast.touched > app.touchLast.ok
          ? ` · 무산 사유: ${(Object.entries({ 'A못줌': app.touchLast.missed.aNot3d, '카메라': app.touchLast.missed.noCam, '시점': app.touchLast.missed.pose, '방향': app.touchLast.missed.axis, '리프팅': app.touchLast.missed.lift, '왕복': app.touchLast.missed.roundtrip, '층': app.touchLast.missed.layer }) as [string, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join('·') || '없음'}`
          : ''),
      ] as [string, string]] : []),
    ]
  })

// **탈출구** — `?reset`으로 열면 워커 등록과 캐시를 전부 버리고 새로 받는다.
// 배포 전환(web/ → web2)은 같은 주소에 다른 앱이 오는 것이라 캐시가 꼬일 수 있고,
// 그때 사람이 개발자 도구 없이 스스로 빠져나올 길이 필요하다.
// ⚠ 그림(자동 저장)은 안 건드린다 — 캐시만 버린다.
if (location.search.includes('reset')) {
  void (async () => {
    if ('serviceWorker' in navigator) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    }
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k)
    }
    location.replace(location.pathname)
  })()
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // updateViaCache: 'none' — 워커 스크립트도 Pages의 max-age=600에 걸린다.
  // 갱신 확인이 HTTP 캐시에서 오면 새 워커를 늦게 본다.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .catch(() => { /* 오프라인 강화일 뿐 — 실패해도 동작 */ })
}

// 자립 깃발(web2-13 4부 → **web2-14 1번: 기본 켜짐** — 사람이 실기기 판정으로 켰다).
// ⚠ 복원(loadDoc)보다 **먼저** 읽는다: 꺼 둔 사람의 문서에 복원 경로의 recompute가
// 굳힘(Stroke.own3)을 써 버리면 「꺼짐 = 아무것도 안 한다」가 깨진다. setOwn3d가 아니라
// 직접 대입이다 — 아직 recompute가 돈 적 없는 빈 상태라 둘이 같고, 여기가 더 이르다.
const OWN3D_KEY = 'b2-own3d'
try { if (localStorage.getItem(OWN3D_KEY) === 'off') app.own3d = false } catch { /* 기본값(켜짐) */ }

// 자동 저장 복원 — 문서 프레임이 창과 다르면 화면 배율로 맞춘다(문서 좌표 불변).
// **작도 시점(drawView)과는 합성이다**(web2-17 3-c — `composeView` 한 자리): 문서 →
// drawView 화면 → 프레임 맞춤 창. 덮어쓰면 다른 창 크기에서 연 파일이 구도를 잃는다.
// ⚠ 열쇠를 **버전으로 가른다**(web2-17 2차 리뷰어 [13]): 옛 열쇠를 그대로 쓰면, 캐시된
// 옛 PWA가 v2 자동 저장을 거부하고 빈 화면으로 시작한 뒤 **첫 조작에서 그 열쇠를 v1으로
// 덮어써** 새 앱의 그림이 소실된다(옛 코드의 «빈 문서는 지운다» 경로 포함). 새 앱은 새
// 열쇠에만 쓰고, 옛 열쇠는 읽기(이행)만 한다 — 옛 PWA는 새 열쇠를 모르므로 못 건드린다.
// 대가: 두 판을 오가며 쓰면 서로의 자동 저장을 못 본다(새 열쇠가 이긴다) — 파일 저장이 답.
// ⚠⚠ **web2-43 5번이 저장소를 옮겼다** — 문서는 이제 IndexedDB(`core/store.ts`)에 산다.
// 위 두 문단의 「열쇠를 판으로 가른다」는 **그 이전의 사실**이고, 옛 열쇠 둘은 이제
// **이전(migration)의 입력**으로만 남는다: `migrateFromLocal`이 복사 → 검증 → 삭제로
// 옮기고 실패하면 옛것이 그대로 있다(팔이 실제로 실패시켜 잰다).
// 근거는 §0의 실측 — localStorage 상한 5241856 units vs 실사용 문서 238456 B(21.9개면 참).
function fitViewToFrame() {
  const fw = app.doc.frame.W, fh = app.doc.frame.H
  const draw = app.drawView ?? { s: 1, ox: 0, oy: 0 }
  if (fw === W && fh === H) { app.view = { ...draw }; return }
  const s = Math.min(W / fw, H / fh)
  app.view = composeView({ s, ox: (W - fw * s) / 2, oy: (H - fh * s) / 2 }, draw)
}
// 복원은 이제 **비동기**다(IndexedDB) — 아래 `filePanel.boot()`가 돈다.
// ⚠ 그 사이에 사람이 그리기 시작했으면 **안 덮는다**(boot 안의 그 조항).

let draft: Draft | null = null
let hover: OsnapHit | null = null
let eraserPos: Pt | null = null
let facePrev: { poly: Pt[]; mode: 'add' | 'remove' } | null = null
let dirty = true
const invalidate = () => { dirty = true }

let syncedVersion = -1
app.listeners.push(() => {
  if (app.docVersion !== syncedVersion) {
    syncedVersion = app.docVersion
    syncStrokes(r3d, app)
    updateStatus()
    // 종속 탭 줄(web2-20 2부) — 문서가 바뀌면 겹 목록·「+」의 활성 조건(카메라 닫힘)이
    // 같이 바뀐다. 여기서 다시 그린다(paperbar와 달리 겹은 문서 변화에 민감하다).
    // ⚠ 늦은 묶기 — 이 리스너는 초기화(자동 저장 복원)에서도 돌고 그때 layerbar는
    // 아직 없다(TDZ). 참조가 서면 그때부터 민다(초기 렌더는 initLayerbar 자신이 한다).
    layerbarRef?.sync()
  }
  invalidate()
})

// 자동 저장(web2-43 2번) — **커밋마다**다(주기가 아니라 사건: `app.docVersion` 변화).
// 짧은 지연 병합만 남고 그 값은 상수다(`C.AUTOSAVE_DEBOUNCE_MS` — 종전 코드에 박혀 있던
// 400을 꺼낸 것이고 값은 안 바꿨다). 저장 자체와 이름·최근 목록은 `filepanel.ts`에 산다.
//
// ⚠⚠ **복원한 판은 이미 저장소의 것이다**(web2-32 · 전량 e2e가 잡은 **선재 결함**):
// 초기화가 리스너를 울리므로 부팅 직후 지연 병합 뒤에 **방금 읽은 것을 도로 쓰는** 저장이
// 예약된다. 자동 저장은 **바뀐 것**을 남기는 일이므로 판본이 그대로면 아무 일도 안 한다
// (그 조항은 `filepanel.ts`의 `saveNow` 첫 줄이다).
// ⚠ 늦은 묶기 — layerbarRef와 같은 까닭이다(이 리스너는 초기화에서도 울리고 그때
// `filePanel`은 아직 없다). 참조가 서면 그때부터 예약한다.
let filePanelRef: FilePanel | null = null
app.listeners.push(() => { filePanelRef?.schedule() })

// **접힐 자세(임계 안 기울임)일 때 무엇이 다른지** — 잠깐 뒤 정렬로 돌아가므로 그리기가
// 유예된다. 그것이 보여야 한다. **임계 밖(머무는 자세)에서는 이 줄이 안 뜬다** — 거기서는
// 그대로 그린다(web2-08 지시 3). 새 장식을 안 만들고 이미 있는 한 줄을 쓴다(원칙 g).
const TILTED_MSG = '기울어 있다 — 놓으면 정렬로 돌아온다. 그때 그릴 수 있다'

// **접혔는데 작도가 아직 안 끝난 자리** — 이 회차가 만든 함정이다(web2-04 리뷰어 [8]).
// 접힌 포즈는 «정렬»이라 그릴 수 있는 상태로 보이는데, `analyze()`는 **작도 포즈가 아닌
// 획을 전부 내용으로 돌린다**(궤도 후의 획은 작도가 아니다). 그래서 1점 상태에서 돌려보고
// 접은 뒤 둘째 깊이선을 그으면 **소실점이 안 생기고 그 획이 대기로 남는다**
// (실측: role=content · vps 1→1 · waiting 1). 조용히 틀리지는 않지만(불변식 j) **왜 안
// 되는지가 화면에 없었다.** 규칙을 바꾸지 않고(범위) 그 자리를 한 줄로 말한다.
// ⚠ **그 길은 요를 잃는다** — 작도 시점은 `resetPose`이고 그것이 이 회차의 출발점에서
// 「요를 잃는 길」로 판정된 바로 그 경로다(2차 리뷰어 [2]). 그래서 **보러 돌아오는 길**은
// 났는데 **작도를 마치러 돌아오는 길**은 아직 요를 버려야 한다. 근본 결정(접힌 포즈에서도
// 작도를 받을 것인가 = `analyze`의 `s.view` 조항)은 범위 밖이라 `DEFERRED.md`에 올렸다.
// 여기서는 **한 번의 누름으로 가는 길**만 낸다 — 밑줄 단어는 이미 있는 기전이다(`ask`).
const UNFINISHED_MSG = '작도가 아직 안 끝났다 — 소실점은 작도 시점에서만 만든다'
const UNFINISHED_GO = '작도 시점으로(보던 방향을 잃는다)'

function updateStatus() {
  // **상태를 안 띄운다**(4-b). 차수·대기 수·스냅 반경·뷰 이름은 전부 내부 상태이고
  // 그것을 화면에 쓰는 것이 CAD의 방식이다. 남는 것은 딱 하나 —
  // **빈 화면의 첫 안내**다(web2-17 1-b: 지평선은 이미 있고, 팬이 눈높이 선언이다).
  // 줌이 막힌 구간(3-a)의 설명도 이 줄이 진다 — 첫 획이 놓이면 영영 사라진다(종전 규칙).
  if (app.doc.strokes.length === 0) status('눈높이를 정한다 — 화면을 끌어 지평선을 옮긴다 (줌은 첫 획 뒤에 열린다)')
  else if (!isLevel(app.pose) && pitchSnaps(app.pose, app.lift.an.f, app.lift.an.W)) status(TILTED_MSG)
  else if (!isDrawPose(app.pose) && !app.lift.an.constructionDone) {
    ask(UNFINISHED_MSG, [{ key: 'draw-view', label: UNFINISHED_GO, onPick: () => gotoDrawView() }])
  }
  else status('')
}

// **포즈가 바뀌면 면 미리보기를 버린다.** 그 다각형은 «그 포즈의 화면 좌표»이고
// 문서 좌표로 그려지므로, 안 버리면 돌린 뒤에도 옛 자리에 남는다
// (2026-08-21 화면 확인에서 그것이 보였다 — 궤도 뒤 파란 테두리가 제자리에 남았다).
// 다음 호버가 지금 포즈로 다시 낸다. `setPose`는 늘 새 객체를 넣으므로 동일성으로 안다.
let lastPoseRef: typeof app.pose | null = null
app.listeners.push(() => {
  if (app.pose === lastPoseRef) return
  lastPoseRef = app.pose
  if (facePrev) { facePrev = null; invalidate() }
})

// 포즈가 «상태 줄이 달라지는 자리»를 넘나들 때만 고친다 — 매 프레임 고치면 오류 알림을 덮어쓴다.
// 그 자리가 둘이라(기울었나 · 작도 시점인가) 둘을 함께 본다.
let lastPoseKey = ''
app.listeners.push(() => {
  const k = `${!isLevel(app.pose)}|${isDrawPose(app.pose)}|${pitchSnaps(app.pose, app.lift.an.f, app.lift.an.W)}`
  if (k === lastPoseKey) return
  lastPoseKey = k
  updateStatus()
})

const autolevel = createAutoLevel(app)
// 시작 동기화 — 자동 저장 복원분 포함
syncStrokes(r3d, app)
syncedVersion = app.docVersion
updateStatus()
// 부팅 직후의 예약 저장은 아래 `savedVersion` 게이트가 막는다(취소만으로는 안 됐다 —
// 초기화가 리스너를 여러 번 울려 그 뒤에 다시 예약된다. 실측: 비운 지 **50ms** 만에
// 되살아났다).

// ── 치수(web2-08 지시 4) — 창 규칙과 적용의 단일 통로 ────────────────────
// «치수 창»은 선을 그리기 시작할 때 열리고 **공간의 다음 터치(다음 획 시작)에 닫힌다**
// (지시 4-4의 듣는 구간을 필기에도 같은 규칙으로 쓴다 — 창 판정이 두 자리로 갈리지 않게).
// 그리는 동안 들어온 입력은 확정 때 적용되고, 확정 후에는 그 획(dimTarget)에 바로 적용
// — «다시 말하거나 펜으로 고친다»가 그대로 대체가 된다(setDimension이 대체다).
/** 쓰는 중의 손글씨 한 획(web2-29 1단계) — 아직 `app.dimInk`에 안 들어간 것.
 *  ⚠ 선언이 **콜백보다 앞**이어야 한다: `initInput`의 콜백 객체가 모듈 평가 중에
 *  만들어지고 그 안에서 이 이름을 닫는다(TDZ — 「Cannot access before initialization」). */
let dimInkLive: Pt[] | null = null
let dimTarget: number | null = null
let pendingDimText: string | null = null
let wasDrafting = false

function liveLenOf(id: number): string | null {
  const g = app.lift.lifted.get(id)
  if (!g) return null
  const mm = lenMm(g.a3, g.b3, app.lift.mmPerUnit)
  return mm === null ? null : formatMm(mm, app.doc.unit, app.dimExact)
}

function applyDimInput(text: string) {
  const mm = parseDim(text, app.doc.unit)
  if (mm === null) return                        // «?»·잡음 — 패널 readout이 이미 보여준다
  if (draft) { pendingDimText = text; return }   // 그리는 중 — 확정 때 적용
  if (dimTarget === null) return                 // 창이 닫혔다 — 다음 선부터
  const r = setDimension(app, dimTarget, mm)
  if (r === 'no3d') notify('아직 3D로 올라가지 않은 선이다 — 치수를 못 단다')
  else if (r === 'baseScale') notify('축척은 바탕 종이의 치수가 정한다')  // web2-21 1-b
  else if (r !== 'none') dimPanel.show(liveLenOf(dimTarget))
}

const dimPanel = initDimPanel(applyDimInput)

// ── 축척·어긋남·재기의 화면 줄(web2-32 5·6·7번) — **문서가 바뀌면 셋이 같이 갱신된다** ──
// ⚠⚠ 셋 다 **새 경로를 안 만든다**(#54): 축척은 `app.lift.mmPerUnit`·`scaleId`(=`scaleOf`가
// 고른 것)를 그대로 읽고, 어긋남은 `dimSkew`, 잰 값은 `measureMm`/`measureUnits`를
// 그대로 부른다. 여기 있는 것은 «문구»뿐이고 판정은 하나도 안 한다.
// 문구는 짧게(web2-28 3번의 규칙 — 이름이거나 짧은 문장 하나).
function syncScaleLines() {
  const mmu = app.lift.mmPerUnit
  const ref = app.lift.scaleId === null ? undefined
    : app.doc.strokes.find(x => x.id === app.lift.scaleId)
  const by = ref?.dim !== undefined ? ` · 기준 ${formatMm(ref.dim, app.doc.unit, app.dimExact)}` : ''
  dimPanel.scale(`축척 ${formatScale(mmu)}${by}`, mmu !== null)

  // 어긋남 — **지금 고른 치수**(사후 수정으로 짚었거나 방금 매긴 것)의 것만 낸다.
  // 전부 나열하면 그것이 「후보만 잔뜩」이다(32-3이 걷어낸 형태). 도면 쪽 표시는
  // 치수 숫자 옆의 «≠» 하나이고(render2d) 여기 줄은 그 하나를 풀어 말한다.
  const focus = app.dimEdit ?? dimTarget
  const k = focus === null ? null : dimSkew(app.lift, focus)
  dimPanel.skew(skewOff(k)
    ? `적은 값과 잰 값이 다르다 — 잰 값 ${formatMm(k!.measured, app.doc.unit, app.dimExact)}`
    : null)

  // 재기 — 두 점이 서면 값, 한 점만 서면 기다림, 아니면 안내.
  // **축척이 미정이면 숫자 대신 비율**이다(없는 축척을 있는 척하지 않는다).
  if (app.measurePair) {
    const mm = measureMm(app.lift, app.measurePair)
    const u = measureUnits(app.lift, app.measurePair)
    dimPanel.measure(
      mm !== null ? `잰 값 ${formatMm(mm, app.doc.unit, app.dimExact)}`
        : u !== null ? `잰 값 ${formatUnits(u)} (축척 미정)`
        : '잰 값 — 그 점이 지금 안 풀린다',
      'value')
  } else if (app.measureFrom) dimPanel.measure('재기 — 둘째 점을 짚는다', 'from')
  else dimPanel.measure('재기 — 두 점을 짚는다', 'idle')
}
app.listeners.push(syncScaleLines)
syncScaleLines()
// 음성도 확률적 입력이다(지시 8-a — 필기와 같은 규칙): 바로 적용하지 않고 스테이징한다.
const voice = createVoice((t) => dimPanel.stage(t))

inputApi = initInput(ink, app, {
  onDraftChange(d) {
    draft = d
    // 칠 미리보기(web2-59 59-1) — 커밋과 **같은 함수**로 획을 만들어 둔다(면 텍스처가 덧그린다).
    // press의 조건은 endDraft가 onPaint에 넘기는 것과 같은 식(길이 일치) — 갈리면 원칙 d가 깨진다.
    // 반증 손잡이(D-3 · paint59 ① [7]): 미리보기 «입력»을 어긋낸다 — 마지막 점 셋을 떼면 커밋과
    // 다른 획이 되어 diff가 0을 벗어나야 한다(자가 «입력의 같음»을 실제로 재는 증거). 제품 경로 ⛔.
    const rawIn = paintDraftPerturb && d ? d.raw.slice(0, Math.max(2, d.raw.length - 3)) : (d?.raw ?? [])
    app.paintDraft = d && paintActive(app) && rawIn.length >= 2
      ? buildPaintStrokes(app, rawIn, d.press && d.press.length === rawIn.length ? d.press : undefined, d.nid).strokes
      : null
    if (d) {
      if (!wasDrafting) {                        // 새 획 — 이전 치수 창이 닫힌다
        dimTarget = null
        pendingDimText = null
        dimPanel.clearInk()
        // **획이 들어오면 겹은 즉시 자리를 잡는다**(web2-40 2번 · 지시 문면: 「동작을
        // 끝까지 기다리지 말고」). 여기가 «새 획이 시작됐다»의 단일 지점이다 —
        // 동작은 이미 입력을 안 막고 있고(막는 코드가 없다) 이 줄은 **화면만 앞당긴다**.
        settleSlides(app)
      }
      // 실시간 표시(4-5) — resolveEnd가 계산한 값 그대로(한 곳 계산·셋이 읽기)
      dimPanel.show(d.lenMm !== null ? formatMm(d.lenMm, app.doc.unit, app.dimExact) : null)
    }
    wasDrafting = !!d
    invalidate()
  },
  onHover(p) { hover = p; invalidate() },
  onEraserMove(p) { eraserPos = p; invalidate() },
  // 면이 열렸다(web2-57) — 경계 구간이 지워져 면이 사라졌다(대기 — 실행취소로 돌아온다).
  // 조용히 사라지면 안 된다(43-1의 규칙) — 무엇이 사라졌는지 한 줄.
  onFacesOpened(ids) {
    notify(ids.length === 1
      ? '면이 열렸다 — 경계가 지워져 면이 사라진다(칠·두께 포함). 실행취소로 돌아온다'
      : `면 ${ids.length}장이 열렸다 — 경계가 지워져 사라진다(칠·두께 포함). 실행취소로 돌아온다`)
  },
  onFacePreview(f) { facePrev = f; invalidate() },
  onDimTap(p) {
    // 사후 수정(web2-32 2번) — **치수 숫자를 누르면** 그 치수를 고른 것이다: 값은
    // 리본의 키패드·필기로 고치고(dimTarget이 그리로 간다), 대상은 다른 선을 눌러 옮긴다
    // (32-3 「틀렸으면 사후 수정에서 대상도 바꿀 수 있어야 한다」).
    const hit = pickDimLabel(app, p)
    if (hit !== null) {
      dimTarget = hit
      const s = app.doc.strokes.find(x => x.id === hit)
      if (s?.dim !== undefined) dimPanel.stage(String(s.dim))
      status('치수 — 값을 고치거나 다른 선을 눌러 대상을 옮긴다')
      invalidate()
      return true
    }
    if (app.dimEdit !== null) {
      const to = pickTargetAt(app, p, app.osnap.radius / viewScale(app) * 2)
      if (to !== null && to !== app.dimEdit) {
        const r = moveDim(app, app.dimEdit, to)
        if (r === 'no3d') notify('아직 3D로 올라가지 않은 선이다 — 치수를 못 단다')
        else dimTarget = to
        invalidate()
        return true
      }
      endDimEdit(app)
      invalidate()
    }
    return false
  },
  onFaceToggle(r) {
    // 알림은 **오류가 있을 때만**이다(4-b) — 만들어졌으면 화면이 이미 말한다.
    if (r === 'none') notify('닫힌 루프가 아니다 — 둘러싸인 자리를 탭한다')
  },
  // ── 꾹 누름 — 글씨(web2-39)이자 잡기(web2-44)다. 배선은 `beginHold` 하나(#54) ────
  onWriteHold(p) {
    const r = beginHold(app, p, performance.now())
    if (r === null) return false            // 잡히는 것이 없다 — 아무 일도 안 한다
    // **알림은 오류가 있을 때만**이다(4-b) — 상태 줄 한 줄로 무엇이 잡혔는지만 말한다.
    switch (r.kind) {
      case 'write':
        status(r.kind === 'write' && r.via === 'dim'
          ? '글씨 — 그 자리에 다시 쓴다'
          : '잡음 — 끌면 옮긴다 · 끝을 끌면 돌린다 · 숫자를 쓰면 치수다')
        break
      case 'grip-add': status(`${r.n}개 잡음 — 같은 선을 또 누르면 이어진 것까지`); break
      case 'grip-connect': status(`이어진 것까지 ${r.n}개 잡음`); break
      case 'face':
        // 몇 장이 골라졌는지 화면이 말한다(54-2 · R6) — 고름은 칠에도 걸린다.
        status(r.faces > 1
          ? `면 ${r.faces}장 고름 — 칠은 그 안에서만 · 「정면」은 마지막 면 · 빈 곳을 꾹 누르면 풀린다`
          : '면을 잡음 — 손통·칠통에서 「정면」이 열린다 · 칠은 이 면에만')
        syncPainttray()
        break
      case 'sel-clear': status(`면 고름 ${r.n}장을 풀었다`); syncPainttray(); invalidate(); break
      case 'manip-edit': status('값 — 그 곁에 숫자를 쓴다'); break
      case 'locked':
        // 잠긴 선 — 조용히 안 잡히면 고장으로 읽힌다. 여는 길을 같은 줄에 둔다.
        ask('잠긴 선이다', [{ key: 'unlock', label: '해제', onPick: () => {
          unlockStroke(app, r.id)
          notify('잠금을 풀었다')
          invalidate()
        } }])
        invalidate()
        return true
    }
    armWriteIdle()
    invalidate()
    return true
  },
  // ── 조작이 끝났다(web2-44) — 값 표찰이 섰다. 고치는 길을 한 줄로 말한다 ────────
  onManip(kind) {
    const label = manipLabel(app)
    status(`${kind === 'move' ? '옮김' : '돌림'} ${label ?? ''} — 값을 꾹 누르면 고친다`)
    armWriteIdle()
    invalidate()
  },
  // ── 칠 한 붓(web2-45) — 면 배정·분할·확정은 state.commitPaint 하나다(#54) ──────
  // ── Injector(web2-51) — 탭이 짚은 칠 획의 속성을 되찾는다(판정은 state 하나 #54) ────
  // ── 칠 도구의 **탭**(web2-64 §3 — 사람: 「면은 탭으로 고르면 된다」) ──────────────────
  // 탭 하나에 뜻이 둘 얹힌다(#77 ㉠의 자리): ① 51의 Injector(짚은 칠 획의 속성이 지금 브러시로) ② 그 자리의 **면이 골라진다**
  // (54-2의 faceSel — 탭으로 더한다 · 빈 곳 탭이면 풀린다). 둘이 «같은 면»을 가리키므로 옛 뜻이 죽지 않는다 — 짚은 획은 그 면 위에 있다.
  // 판정은 state.tapSelectFace 하나(#54) · 탭↔짧은 획은 거리(C.PAINT67_MOUSE_TAP_MAX_PX · #93)로 input이 가른다.
  // ⚠ web2-67 §1 — 여기는 이제 **마우스만** 온다(펜 한 붓은 언제나 칠 · 손가락 탭은 onPaintFingerTap).
  onPaintTap(p) {
    const inj = injectPaintAt(app, p)
    if (inj) app.paintErase = false   // web2-67 0-6 — 속성을 집었다 = 칠할 뜻(지우개를 놓는다)
    const r = tapSelectFace(app, p)
    if (inj) syncPainttray()
    const injTxt = inj ? ` · ${SLOT_NAME[inj.i]} ${brushShort(app.paintSel.br)} ${inj.hex} ${inj.w.toFixed(1)}px를 실었다` : ''
    if (r.kind === 'face') status(`면 ${r.n}장 고름 — 칠은 고른 면 안에서만 · 빈 곳을 탭하면 풀린다${injTxt}`)
    else if (r.kind === 'clear') status(`면 고름을 풀었다(${r.n}장)${injTxt}`)
    else if (inj) status(`짚은 획의 속성을 실었다${injTxt}`)
    syncPainttray()
    invalidate()
  },
  // ── 손가락 탭(web2-67 §1) — 면 고르기 «만»이다(Injector는 긴 누름으로 갔다 · 67-1):
  //    펜 한 붓이 언제나 칠이 되면서, 고르는 몸짓은 장치(손가락)가 든다. 판정은 state 하나(#54).
  onPaintFingerTap(p) {
    const r = tapSelectFace(app, p)
    if (r.kind === 'face') status(`면 ${r.n}장 고름 — 칠은 고른 면 안에서만 · 빈 곳을 탭하면 풀린다`)
    else if (r.kind === 'clear') status(`면 고름을 풀었다(${r.n}장)`)
    syncPainttray()
    invalidate()
  },
  // ── 손가락 긴 누름(web2-67 67-1) — 51의 Injector가 옮겨 온 자리(옛 자리는 6px 탭이었다) ──
  onPaintFingerHold(p) {
    const inj = injectPaintAt(app, p)
    if (inj) {
      app.paintErase = false
      syncPainttray()
      status(`짚은 획의 속성을 실었다 — ${SLOT_NAME[inj.i]} ${brushShort(app.paintSel.br)} ${inj.hex} ${inj.w.toFixed(1)}px`)
      invalidate()
    }
  },
  onPaint(pts, press) {
    const r = commitPaint(app, pts, press)
    // 알림은 오류가 있을 때만(4-b) — 얹혔으면 화면이 말한다. 통째로 허공이면 이유를.
    // 54: 고름·주인 면이 통째로 잘랐을 때도 이유를 — 조용히 사라지면 고장으로 읽힌다.
    if (r.placed === 0) {
      notify(r.offOwn > 0
        ? (liveFaceSel(app).length > 0
          ? '고른 면 밖이다 — 칠은 고른 면 안에서만 이어진다(빈 곳을 꾹 누르면 고름이 풀린다)'
          : '시작한 면 밖이다 — 획은 자기 면에만 남는다(여러 면은 꾹 눌러 골라 둔다)')
        : '칠할 면이 없다 — 면을 먼저 지정한다(칠은 면 위에만 얹힌다)')
    }
    invalidate()
  },
  onWriteStroke(pts) {
    // ⚠ **종료 판정은 여기가 아니라 «획이 시작될 때»다**(`input.ts`) — 그래야 작도로
    //    돌아간 획이 **오스냅·축을 지나** 보통 획으로 확정된다. 여기 오는 것은 이미
    //    「글씨다」로 판정된 획뿐이다.
    commitWriting(app, pts, performance.now())
    armWriteIdle()
    invalidate()
    void maybeWriteDim()
  },
  onWriteEnd(why) {
    endWriting(app, why)
    clearWriteIdle()
    clearNotice()
    invalidate()
  },
  // ── 손글씨 치수(web2-29 1단계) ──────────────────────────────────────────
  // 인식·파싱·적용은 **이미 있는 것을 그대로 부른다**(#54): `recognizeStrokes` →
  // `parseDim` → `setDimension`. 여기는 배선과 «확정 전에 보여주기»뿐이다.
  onDimInk(pts) { dimInkLive = pts; invalidate() },
  onDimPick(p) {
    const id = pickDimTarget(app, p)
    if (id === null) { notify('치수를 매길 선을 탭한다'); return }
    status('치수 — 종이 위에 숫자를 쓴다')
    invalidate()
  },
  onDimStroke(pts) {
    addDimInk(app, pts)
    invalidate()
    void recognizeDimInk()
  },
  onMeasureTap(p) {
    // 재기(web2-32 6번) — 판정은 `state.measureTap` 하나다(오스냅·정체·남기기까지).
    // 여기는 배선과 «없을 때 이유를 말하는 것»뿐이다(알림은 오류가 있을 때만 — 4-b).
    const r = measureTap(app, p)
    if (r === 'none') notify('잴 점이 없다 — 3D로 올라간 선의 끝·중간을 짚는다')
    else if (r === 'from') status('재기 — 둘째 점을 짚는다')
    else status('재기 — 다시 짚으면 새로 잰다')
    invalidate()
  },
  onCandidateTap(excluded) {
    // 후보 모드(web2-21 4부) — 뺐으면 화면(테두리 하나 사라짐)이 말한다. 빗나감만 말한다.
    if (!excluded) notify('후보 밖이다 — 아닌 후보를 탭해서 뺀다')
    invalidate()
  },
  onCommit(a, b, raw, press, rawIn) {
    const s = commitStroke(app, a, b, raw, press, rawIn)
    // 필압 보정 절차(web2-26 6번) — 절차 중이면 이 획이 표본이다. 절차 밖이면 무해하다.
    pressCalibStep(s)
    // ⚠ **여기서 글씨를 안 읽는다**(web2-39). 이 자리는 **작도선**이 지나는 길이고,
    //    글씨는 `onWriteStroke`가 따로 진다 — 「이 획이 글씨인가」를 묻는 자리가 없다.
    const an = app.lift.an
    // **알림은 오류가 있을 때만**이다(4-b). 「소실점 N」은 차수이고 「대기한다」는 상태다 —
    // 둘 다 화면이 이미 말하고 있다(소실점 표식 · 대기 획의 점선). 거부 사유만 남긴다.
    const reject = an.rejects.get(s.id)
    if (reject) notify(reject)
    // **못 풀렸으면 이유를 말한다**(web2-27 1-5) — 종전에는 조용히 안 풀렸다.
    // 문구는 짧게(이름이거나 짧은 문장 하나 — web2-28의 규칙과 같은 결).
    else if (app.lift.waiting.includes(s.id)) {
      const why = app.lift.waitWhy.get(s.id)
      if (why === 'straddle') notify('지평선을 가로지르는 선은 놓을 자리가 없다')
      else if (why === 'onHorizon') notify('지평선을 따라 그은 선은 놓을 자리가 없다')
      else if (why === 'aboveHorizon') notify('이 선만으로는 방향이 안 정해진다')
    }
    // 치수 창 — 내용 획이면 이 획이 지금 창의 대상이다. 그리는 동안 들어온 치수를 적용한다.
    if (an.roles.get(s.id) === 'content') {
      dimTarget = s.id
      const t = pendingDimText
      pendingDimText = null
      if (t) applyDimInput(t)
      else dimPanel.show(liveLenOf(s.id))
    }
  },
}, autolevel)

// 치수 도구(web2-29 1단계) — **모드가 있다**: 이 도구를 고른 동안만 종이 위의 획이
// 손글씨로 읽힌다. ⚠⚠ 들어가는 자리는 **치수 패널 안**이다 — 리본의 치수 단추는
// 종전대로 패널만 연다(그것이 도구까지 바꾸면 web2-10의 키패드·음성 경로가 통째로
// 죽는다: 전량 e2e `dim.spec` 둘이 그것을 잡았다). 모드를 벗어나면 대상·손글씨를 놓는다.
const dimWriteBtn = document.getElementById('btn-dim-write')!
dimWriteBtn.addEventListener('click', () => {
  setTool(app.tool === 'dim' ? 'pencil' : 'dim')
  dimWriteBtn.classList.toggle('on', app.tool === 'dim')
  if (app.tool === 'dim') status('치수 — 치수를 매길 선을 탭한다')
  else { endDimPick(app); clearNotice() }
  invalidate()
})

// 치수 패널의 옵션 배선(4-4 음성 · 4-6 단위 · 4-7 스냅 · 4-8 표기)
const voiceBtn = document.getElementById('btn-voice')!
voiceBtn.addEventListener('click', () => {
  if (!voice.supported) { notify('이 브라우저에는 음성 인식이 없다 — 펜으로 쓴다'); return }
  voiceBtn.classList.toggle('on', voice.toggle())
})
const unitSel = document.getElementById('dim-unit') as HTMLSelectElement
unitSel.value = app.doc.unit
unitSel.addEventListener('change', () => {
  if ((UNITS as string[]).includes(unitSel.value)) app.doc.unit = unitSel.value as Unit
  if (dimTarget !== null) dimPanel.show(liveLenOf(dimTarget))
  syncScaleLines()                 // 축척·어긋남·잰 값도 같은 단위로 읽힌다
})
const dimSnapBox = document.getElementById('chk-dimsnap') as HTMLInputElement
dimSnapBox.checked = app.dimSnap
dimSnapBox.addEventListener('change', () => { app.dimSnap = dimSnapBox.checked })
const dimStepSel = document.getElementById('dimsnap-step') as HTMLSelectElement
dimStepSel.value = String(app.dimSnapStep)
dimStepSel.addEventListener('change', () => { app.dimSnapStep = Number(dimStepSel.value) })
const exactBox = document.getElementById('chk-exact') as HTMLInputElement
exactBox.checked = app.dimExact
exactBox.addEventListener('change', () => {
  app.dimExact = exactBox.checked
  if (dimTarget !== null) dimPanel.show(liveLenOf(dimTarget))
  syncScaleLines()
})
// 재기의 둘째 결과(web2-32 6번) — 켜면 그 뒤로 잰 것이 **도면에 남는다**.
// ⚠ 이미 잰 것을 소급해서 남기지 않는다(그러면 «몰래 생기는 치수선»이 된다).
const measureKeepBox = document.getElementById('chk-measure-keep') as HTMLInputElement
measureKeepBox.checked = app.measureKeep
measureKeepBox.addEventListener('change', () => { app.measureKeep = measureKeepBox.checked })

// ── 도구 — 연필통(web2-12 6번) · 지우개 둘 · 면 (4-h) ─────────────────────
// **선택은 색이 아니라 위치와 크기로 보인다**(4-d) — `.tool.on`의 svg가 앞으로 나온다.
// 연필통: 연필 여섯 + 펜이 가로로 누워 진하기 순으로 쌓인다. 슬라이더(4-e)의 자리를
// 잇는다 — 옛 경로는 #oldtools에 숨겨 남긴다(A-4 — 아래 TRAY 상수가 되돌리기 손잡이).
const TRAY = true
const TOOLS: Tool[] = ['pencil', 'pen', 'eraser-pencil', 'eraser-ink', 'face']
const trayEl = document.getElementById('tray')!

/** 누운 연필 한 자루(web2-19 3-b′) — **앞이 원뿔로 깎였고 단면이 노출된 심**이다.
 *  SVG 기하는 `docs/instrument-icons.md` 「펼친 연필통 줄」 정본 그대로(path 수정 금지) —
 *  심 색만 MAT에서 온다(#54: 정본 문면 「심 색의 출처는 MAT 하나다」. 정본의 예시색은
 *  예시일 뿐이다). 종전 줄(가운데 절단·단면 심)은 아래 git 이력에 있다 — 채널(심 색·
 *  경도 각인)은 같고 그림만 나아졌다. */
function pencilRowSvg(g: Grade): string {
  const lead = MAT[g].color
  return '<svg width="96" height="24" viewBox="0 0 64 16">'
    + '<rect x="1" y="3.5" width="9" height="9" rx="2" fill="#d8cfc0" />'
    + '<rect x="10" y="3.5" width="5" height="9" fill="#b8b3ab" />'
    + '<rect x="15" y="3" width="36" height="10" fill="#cfc7b6" />'
    + '<rect x="15" y="3" width="36" height="2.6" fill="#e0d9ca" />'
    + `<text x="21" y="11.6" font-family="system-ui, sans-serif" font-size="7" fill="#3c3831">${g}</text>`
    + '<path d="M51 3 L59.4 7.35 L59.4 8.65 L51 13 Z" fill="#e6dfd0" />'
    + `<path d="M59.4 7.35 L63 8 L59.4 8.65 Z" fill="${lead}" />`
    + '</svg>'
}
const trayRow = new Map<string, HTMLElement>()   // '2H'..'2B' — 펜 줄은 없다(3-b′)
for (const g of PENCIL_GRADES) {
  const b = document.createElement('button')
  b.id = `tray-${g}`
  b.className = 't tool trow'
  b.title = `${g} 연필`
  b.setAttribute('aria-label', `${g} 연필`)
  b.innerHTML = pencilRowSvg(g)
  // 하나를 고르면 **접힌다**(3-b′ — 지시 문면 「다시 누르거나 하나를 고르면 접힌다」).
  // syncGrade가 접힌 아이콘의 각인·심 색을 갱신한다 — 안 부르면 접힌 연필이 옛 경도로 남는다.
  b.addEventListener('click', () => { app.grade = g; setTool('pencil'); syncGrade(); setTrayOpen(false) })
  trayEl.append(b)
  trayRow.set(g, b)
}
// ── 펜 촉통(web2-30 2번) — 슬라이더를 없애고 **촉을 고른다** ────────────────
// **뒤집은 결정**: web2-19의 「펜은 하나뿐이니 아이콘 하나」를 여기서 뒤집는다.
// 제도 펜의 굵기는 연속값이 아니다 — 실물에 없는 조작(슬라이더)을 만들었으므로 기준이
// 있을 수 없었다(사람 관측: 「어떤 기준도 없이 허공에 있다」). `DRAFTING-MAP` 규칙 하나 —
// **아이콘이 실물이면 동작도 실물이어야 한다.** 연필은 등급으로, 펜은 촉으로 고른다.
const pentrayEl = document.getElementById('pentray')!
/** 촉 mm → 화면 px. **출처는 `C` 하나다**(#54) — 통의 견본과 그은 선이 같은 값을 읽는다. */
const nibPx = (mm: number): number => Math.round(mm * C.NIB_PX_PER_MM * 100) / 100
/** 누운 촉 한 자루 — 연필통 줄과 **같은 문법·같은 칸**(64×16 viewBox)이고 앞쪽 도형만
 *  펜의 것이다(원뿔 대신 촉). 뒤쪽 여백에 **그 굵기의 실제 선 견본**을 1:1로 긋는다:
 *  선폭이 화면 고정이므로(원칙 e) 견본의 px가 곧 그어질 선의 px다. */
function nibRowSvg(mm: number): string {
  const w = nibPx(mm)
  return '<svg width="96" height="24" viewBox="0 0 64 16">'
    + '<rect x="1" y="3.5" width="9" height="9" rx="2" fill="#8b857a" />'
    + '<rect x="10" y="3.5" width="5" height="9" fill="#6e6a63" />'
    + '<rect x="15" y="3" width="20" height="10" fill="#7f7a72" />'
    + '<rect x="15" y="3" width="20" height="2.6" fill="#98938a" />'
    + `<text x="17.5" y="11.4" font-family="system-ui, sans-serif" font-size="6.4" fill="#f2efe9">${mm.toFixed(2)}</text>`
    + '<path d="M35 3.6 L41.6 7.4 L41.6 8.6 L35 12.4 Z" fill="#5d5952" />'
    + `<rect class="nsample" x="41.6" y="${(8 - w / 2).toFixed(3)}" width="21.4" height="${w}" fill="#101014" />`
    + '</svg>'
}
const nibRow = new Map<number, HTMLElement>()
for (const mm of C.NIB_MM) {
  const b = document.createElement('button')
  b.id = `nib-${String(mm).replace('.', '_')}`
  b.className = 't tool nrow'
  b.dataset.nibMm = String(mm)
  b.dataset.nibPx = String(nibPx(mm))
  b.title = `${mm.toFixed(2)} mm 촉`
  b.setAttribute('aria-label', `${mm.toFixed(2)} mm 촉`)
  b.innerHTML = nibRowSvg(mm)
  // 하나를 고르면 **통이 접힌다**(28-1 — 하나를 고르면 끝나는 선택)
  b.addEventListener('click', () => {
    app.nib = nibPx(mm)
    setTool('pen')
    syncNib()
    syncTray()
    setPentrayOpen(false)
  })
  pentrayEl.append(b)
  nibRow.set(mm, b)
}

// 접힌 연필(3-b′) — 평소에는 이것 하나만 보인다. 누르면 연필통이 펼쳐진다(토글).
// 연필 도구 선택도 겸한다: 펜을 쓰다 눌러도 연필로 돌아온다(옛 연필 버튼의 몫 그대로).
const pencilFoldBtn = document.getElementById('btn-pencil')!
const penBtn = document.getElementById('btn-pen')!

/** ⚠⚠ **web2-30 3번 — 리본 안의 무엇도 리본의 길이를 바꾸지 않는다.**
 *  펼침은 **왼쪽으로 겹쳐 뜬다**. 세로 위치는 누른 버튼의 줄에 맞추되, 화면 위아래로
 *  넘치면 **안쪽으로 민다**(리본은 안 건드린다). 연필통·펜 촉통 둘 다 이 한 함수를 쓰고
 *  앞으로 생기는 펼침도 같다(#54). */
/** **칠 패널의 자리**(web2-65 §2 ①) — 화면 **왼쪽 가장자리**에 세로 가운데로 세운다.
 *  왜 자리를 옮겼나(사람 판정 64-panel.png): 작도 세로바(오른쪽)와 칠 패널이 둘 다 오른쪽이라
 *  답답하고, 폭이 눌려 브러시 이름이 「잉크펜 · dee…」로 끊겼다. 칠 패널은 «잠깐 얹히는 통»이
 *  아니라 **도구를 든 동안의 화면**이라(64 R8 정정) 리본 곁에 붙어 있을 이유가 없다.
 *  선례(A-3): 프로크리에이트·크리타·포토샵 전부 «그리는 도구의 상시 패널»은 반대쪽 가장자리다.
 *  ⚠ R2(리본 길이 불변)는 그대로다 — 이것도 겹쳐 뜨지 아무것도 밀지 않는다. */
function placeLeftPanel(el: HTMLElement) {
  el.style.right = 'auto'
  el.style.left = `${C.FLYOUT_EDGE_PX}px`
  el.style.top = '0px'                       // 크기를 재기 전에 자리를 비운다
  const h = el.offsetHeight
  const mid = Math.round((window.innerHeight - h) / 2)
  el.style.top = `${Math.max(C.FLYOUT_EDGE_PX, Math.min(mid, window.innerHeight - h - C.FLYOUT_EDGE_PX))}px`
}

function placeFlyout(el: HTMLElement, anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect()
  el.style.right = `${Math.round(window.innerWidth - a.left + C.FLYOUT_GAP_PX)}px`
  el.style.top = '0px'                       // 크기를 재기 전에 자리를 비운다
  const h = el.offsetHeight
  const top = Math.min(
    Math.max(C.FLYOUT_EDGE_PX, a.top),
    Math.max(C.FLYOUT_EDGE_PX, window.innerHeight - h - C.FLYOUT_EDGE_PX))
  el.style.top = `${Math.round(top)}px`
}

let trayOpen = false
let pentrayOpen = false
// ⚠ **web2-34 4번(R7)**: 「열면 나머지가 닫힌다」를 세 통이 서로 부르던 것을 그만두고
//   `closeOtherBoxes` 한 자리로 모았다 — 통이 늘 때마다 이 세 줄을 손보던 자리다(#54).
//   서랍·팝오버까지 같은 등록부에 들어 있어 이제 **전부**가 서로를 닫는다.
function setTrayOpen(v: boolean) {
  trayOpen = v
  trayEl.classList.toggle('open', v)
  if (v) { closeOtherBoxes('#tray'); placeFlyout(trayEl, pencilFoldBtn) }
}
function setPentrayOpen(v: boolean) {
  pentrayOpen = v
  pentrayEl.classList.toggle('open', v)
  if (v) { closeOtherBoxes('#pentray'); placeFlyout(pentrayEl, penBtn) }
}
// 바깥 누름으로 접힌다(R7) — 통의 «안»은 통 자신과 **그것을 여는 단추**다.
registerBox({
  id: '#tray', isOpen: () => trayOpen, close: () => setTrayOpen(false),
  zone: () => [trayEl, pencilFoldBtn],
})
registerBox({
  id: '#pentray', isOpen: () => pentrayOpen, close: () => setPentrayOpen(false),
  zone: () => [pentrayEl, penBtn],
})
pencilFoldBtn.addEventListener('click', () => {
  setTool('pencil')
  setTrayOpen(!trayOpen)
})
penBtn.addEventListener('click', () => {
  setTool('pen')
  setPentrayOpen(!pentrayOpen)
})
// 창이 바뀌면 열린 통의 자리를 다시 잡는다(리본이 옮겨 가므로)
window.addEventListener('resize', () => {
  if (trayOpen) placeFlyout(trayEl, pencilFoldBtn)
  if (pentrayOpen) placeFlyout(pentrayEl, penBtn)
  if (etrayOpen && etrayAnchor) placeFlyout(etrayEl, etrayAnchor)   // 크기통도 같다(34-3)
  if (rolltrayOpen) placeFlyout(rolltrayEl, rollBtn)                // 롤통도 같다(34-6)
  if (griptrayOpen) placeFlyout(griptrayEl, gripBtn)                // 손통도 같다(web2-44)
  if (painttrayOpen) placeLeftPanel(painttrayEl)                    // 칠 패널은 왼쪽 가장자리다(65 §2 ①)
})
if (!TRAY) {   // 되돌리기(A-4) — 옛 세로 버튼·슬라이더로
  trayEl.hidden = true
  pentrayEl.hidden = true
  document.getElementById('oldtools')!.hidden = false
}

const toolBtn: Record<Exclude<Tool, 'pencil' | 'pen'>, HTMLElement> = {
  'eraser-pencil': document.getElementById('btn-eraser-pencil')!,
  'eraser-ink': document.getElementById('btn-eraser-ink')!,
  'face': document.getElementById('btn-face')!,
  // 붓(web2-45) — 칠하기. 톤의 재료는 지금 연필 경도다(45는 기제만 — 재료는 46).
  'paint': document.getElementById('btn-paint')!,
  // 치수(web2-29 1단계) — 선택 표시는 **패널 안의 그 단추**가 진다(리본의 치수 단추는
  // 패널 여닫이라 도구 표시를 안 얹는다 — 그러면 «패널이 열렸다»와 «모드가 켜졌다»가
  // 화면에서 갈린다).
  'dim': document.getElementById('btn-dim-write')!,
  // 재기(web2-32 6번) — **새 자리에서 들어간다**(#77 ㉠): 치수 단추에 뜻을 하나 더
  // 얹으면 그 자리를 쓰던 옛 경로가 조용히 죽는다.
  // ⚠⚠ **그 자리는 치수 패널 안이다**(세로바가 아니다) — 초판이 손 띠에 뒀다가 **전량
  // e2e가 잡았다**: 세로바가 800px 화면을 12px 넘쳤다(`sidebar.spec` 812 ≤ 800).
  // 높이 예산이 이미 꽉 차 있으므로 답은 임계를 무르는 것이 아니라 자리를 옮기는 것이고,
  // 선례는 web2-29의 `btn-dim-write`(같은 이유로 이 패널에 있다). 잰 값도 여기 뜬다.
  'measure': document.getElementById('btn-measure')!,
}

/** 선택 표시 — 연필통이 펼쳐져 있으면 «지금 경도의 행»이 나와 있고(도구이면서 경도
 *  표시), 접힌 연필·펜 버튼도 도구 상태를 따른다(3-b′). */
function syncTray() {
  for (const g of PENCIL_GRADES) trayRow.get(g)!.classList.toggle('on', app.tool === 'pencil' && app.grade === g)
  // 촉 줄도 같은 규약 — 지금 고른 촉이 앞으로 나온다(web2-30 2번)
  for (const mm of C.NIB_MM) {
    nibRow.get(mm)!.classList.toggle('on', app.tool === 'pen' && Math.abs(app.nib - nibPx(mm)) < 1e-6)
  }
  // 지우개 크기 줄도 같은 규약(web2-34 3번) — **도구를 안 본다**: 크기는 두 지우개가
  // 나눠 쓰는 한 값이라(app.eraserRadius) «어느 지우개를 들었나»와 무관하다(§⑤).
  for (const r of C.ERASER_R_PX) {
    eraserRow.get(r)!.classList.toggle('on', Math.abs(app.eraserRadius - r) < 1e-6)
  }
  pencilFoldBtn.classList.toggle('on', app.tool === 'pencil')
  penBtn.classList.toggle('on', app.tool === 'pen')
}

/** 칠 패널이 섰는가(web2-64) — 패널 블록(아래)은 setTool의 첫 호출(부팅)보다 뒤에 선다: TDZ를 피하는 표식 */
let paintPanelReady = false
function setTool(t: Tool) {
  app.tool = t
  for (const k of Object.keys(toolBtn) as (keyof typeof toolBtn)[]) {
    toolBtn[k].classList.toggle('on', k === t)
  }
  syncTray()
  if (!isEraser(t)) eraserPos = null
  // 치수 모드를 벗어나면 고른 대상·손글씨를 놓는다(모드가 남아 있지 않게 — web2-29)
  if (t !== 'dim') { endDimPick(app); dimInkLive = null }
  // 글씨 상태도 도구를 떠나면 놓는다(web2-39) — 「상태 밖에서는 모든 획이 작도선」이
  // 서려면 상태가 도구를 넘어 살아남으면 안 된다. 사유는 «사람이 떠났다»이지 종료
  // 제스처가 아니다(⛔ 39-3 — 배울 것을 안 늘린다).
  if (writeActive(app)) { endWriting(app, 'left'); clearWriteIdle(); dimInkLive = null }
  // 재기도 같은 규약 — 도구를 떠나면 짚어 둔 점과 잰 값을 놓는다(도면에 남긴 것은 남는다).
  // 들어올 때는 치수 패널을 편다: 잰 값이 뜨는 자리가 거기다(새 모서리를 안 만든다 — #79).
  if (t !== 'measure') clearMeasure(app)
  else document.getElementById('dimpanel')!.classList.remove('folded')
  if (t !== 'face') {
    facePrev = null
    // 면 일괄 후보는 면 도구의 상태다(web2-21 4부) — 도구를 떠나면 취소(op 없음)
    cancelCandidates(app)
    document.getElementById('face-pop')!.hidden = true
  }
  // ⚠ **굵기 막대는 web2-34 3번에 사라졌다**(화면 규칙 R1) — 연필의 굵기는 심이,
  // 펜의 굵기는 **촉**이, 지우개의 크기는 **크기통**이 정한다. 셋 다 «고르는 것»이다.
  // 도구를 떠나면 그 통은 접는다(연필통·촉통과 같은 규약).
  if (!isEraser(t)) setEtrayOpen(false)
  // web2-64 §2 — 칠 패널은 칠 도구를 든 «동안» 항상 뜬다(R8 정정 — DECISIONS). 작도 중에는 없다.
  if (paintPanelReady) setPainttrayOpen(t === 'paint')
  syncNib()
  invalidate()
}
for (const k of Object.keys(toolBtn) as (keyof typeof toolBtn)[]) {
  toolBtn[k].addEventListener('click', () => {
    // 면 버튼을 **다시** 누르면 팝오버(web2-21 4부 — 「전부 찾기」). 손 띠에 버튼을 안
    // 늘린다(지시 4-e ⚠). 다른 도구는 종전 그대로다.
    if (k === 'face' && app.tool === 'face') { toggleFacePop(); return }
    // 붓을 **다시** 누르면 — web2-64: 패널은 도구를 든 동안 늘 떠 있으므로 여닫을 것이 없다(옛 «재누름이 칠통을 연다»는 걷었다).
    if (k === 'paint' && app.tool === 'paint') { setPainttrayOpen(true); return }
    // 재기는 **토글**이다 — 다시 누르면 연필로 돌아온다(재는 일은 잠깐 하는 일이다)
    if (k === 'measure' && app.tool === 'measure') { setTool('pencil'); return }
    // 지우개 둘 — **도구를 먼저 바꾸고 크기통을 연다**(web2-34 3번). 연필·펜 단추가
    // 이미 그 형태다(같은 순서). ⚠ 뜻을 하나 더 얹는 자리이므로 옛 뜻(도구 선택)이
    // 먼저 서고 그 뒤에 통이 온다(#77 ㉠) — 다른 지우개에서 넘어오면 **연다**,
    // 같은 지우개를 다시 누르면 **여닫는다**.
    if (isEraser(k)) {
      const again = app.tool === k
      setTool(k)
      setEtrayOpen(again ? !etrayOpen : true, toolBtn[k])
      return
    }
    setTool(k)
  })
}

// ── 면 일괄(web2-21 4부) — 팝오버·후보 흐름 ────────────────────────────────
const facePop = document.getElementById('face-pop')!
function renderFacePop() {
  facePop.textContent = ''
  // 셋 다 **명령**이다(web2-28 1번) — 누르면 볼일이 끝나므로 패널이 접힌다.
  // 표시는 여기 한 자리에서 붙인다(추측하는 코드 ⛔ — 지시 문면).
  const mk = (label: string, id: string, fn: () => void) => {
    const b = document.createElement('button')
    b.id = id
    b.dataset.act = 'cmd'
    b.textContent = label
    b.addEventListener('click', fn)
    facePop.append(b)
    return b
  }
  if (app.faceCandidates === null) {
    // 전부 켜고 빼기(4-a) — 후보를 전부 내놓고 아닌 것만 탭해서 뺀다.
    // web2-66 66-4(R3 정정) — 이 명령의 볼일은 누르는 순간 «안» 끝난다: 후보가 서면 확정·취소가
    // **이 통 안에** 뜬다. `cmd`라고 접으면 그 다음 걸음이 미아가 된다(사람 판정 — 「찾기 관련
    // 패널이 사라져버려서 면 아이콘을 다시 눌러야 하는 번거로움」). `data-fold="keep"`.
    mk('전부 찾기', 'btn-face-all', runFindAll).dataset.fold = 'keep'
  } else {
    mk(`확정 ${app.faceCandidates.length}`, 'btn-face-commit', () => {
      const n = commitCandidates(app)
      notify(n > 0 ? `면 ${n} — 실행취소 한 번에 전부 돌아온다` : '만들 면이 없다')
      facePop.hidden = true
      invalidate()
    })
    mk('취소', 'btn-face-cancel', () => {
      cancelCandidates(app)
      facePop.hidden = true
      invalidate()
    })
  }
}
/** 「전부 찾기」 — 버튼과 **밑그림 안내의 길**(web2-23 3부)이 같은 함수를 부른다(#54) */
function runFindAll() {
  const n = findAllFaces(app)
  if (n === 0) {
    cancelCandidates(app)
    notify('닫힌 영역이 없다')
    facePop.hidden = true
  } else {
    notify(`후보 ${n} — 아닌 것을 탭해서 빼고, 확정을 누른다`)
    renderFacePop()
  }
  invalidate()
}
/** 면 팝오버를 열 때 하는 일 — 내용을 짓고 자리를 잡는다(여닫이는 `FOLD_PANELS`가 진다) */
function showFacePop() {
  renderFacePop()
  const r = toolBtn.face.getBoundingClientRect()
  facePop.style.top = `${Math.round(Math.min(r.top, window.innerHeight - facePop.offsetHeight - 6))}px`
}
function toggleFacePop() {
  const p = panelOf('#face-pop')
  p.setOpen(!p.isOpen())
}
// 후보 수가 변하면(탭 배제·문서 변화로 무효화) 열린 팝오버가 따라온다
app.listeners.push(() => { if (!facePop.hidden) renderFacePop() })

// ── 굵기·크기는 **고르는 것**이다 (web2-34 3번 · 화면 규칙 R1) ─────────────
// 옛 자리에는 세로 막대(#thick)가 있었다 — 끌면 그 자리에 «그 굵기의 선»(펜)이나
// «그 크기의 원»(지우개)이 그려지는 미리보기(4-f). 펜은 30-2가 촉통으로 바꿨고,
// **지우개는 이 항목이 크기통으로 바꾼다.** 막대가 남긴 병은 값으로 찍혀 있다:
// 그 동그라미는 막대 폭 안에 들어가려고 `r = 4.5 + (v−4)/56×12`로 줄여 그렸으므로
// 실제 지우개의 **27.5%(최대) ~ 112.5%(최소)**였다 — 「동그라미가 허공에 떠 있기만
// 하다」(사람)가 그 자리를 정확히 가리킨다. 새 줄은 **줄이지 않는다**(1:1).

/** 지우개 자국의 이름 — **지름 mm의 반올림**. 자는 하나다(#54): 화면 px ↔ mm 환산은
 *  `C.NIB_PX_PER_MM` 하나뿐이고 촉 표기(`nibLabel`)가 쓰는 그 자다.
 *  넷이 `2 · 6 · 13 · 28`로 갈린다(정확한 값은 2.33 · 5.60 · 12.60 · 28.0 mm). */
const eraserLabel = (r: number): string => String(Math.round(2 * r / C.NIB_PX_PER_MM))
/** **접힌 통의 각인을 창 안에 넣는다** — 셋(연필 `fold-lead-text` · 펜 `fold-nib-text` ·
 *  지우개 둘)이 **한 함수를 쓴다**(#54 — 한 자리만 고치면 셋이 갈린다).
 *
 *  ⚠⚠ **폭의 출처는 창 `rect` 자신이다**(#88 — web2-31 마감 [2]). 옛 판은 창 폭을
 *  `6.6`·`8.8`로 **옮겨 적었고**(index.html의 rect에서 손으로 베낀 수), 창을 넓히거나
 *  좁히는 사람이 여기를 볼 이유가 없었다. 이제 rect를 DOM에서 읽으므로 결합이 코드에 보인다.
 *
 *  ⚠ **재는 것은 «잉크»이지 «전진폭»이 아니다**(web2-31 마감이 D-1로 잡았다). 옛 판은
 *  `textLength = 창 폭`을 걸었는데 `textLength`가 묶는 것은 **글리프 전진폭의 합**이고
 *  `getBBox()`가 내는 것은 **잉크 상자**다 — 글리프가 전진폭 밖으로 삐져나오는 글꼴에서는
 *  전진폭이 정확히 6.600000이어도 잉크가 6.839225로 **창을 넘는다**(이 기기의
 *  `system-ui`에서 "28"이 그랬다). 그래서 **잉크를 재고 그 비로 전진폭을 되민다**:
 *  `spacingAndGlyphs`는 잉크도 같은 배수로 줄이므로 한 번에 맞는다.
 *
 *  ⚠ **들어가면 안 건드린다** — `textLength`를 늘리는 쪽으로는 안 쓴다(한 글자에 걸면
 *  글자가 늘어난다). 높이는 어느 쪽도 안 건드리므로 `C.FOLD_MARK_MIN_RATIO`(연필 각인과
 *  같은 대역)는 그대로다. */
function fitMark(t: SVGTextElement, win: SVGGraphicsElement): void {
  t.removeAttribute('textLength')
  t.removeAttribute('lengthAdjust')
  for (let pass = 0; pass < 3; pass++) {   // 되밈은 한 번에 맞는다 — 두 번째부터는 확인이다
    let w = 0, ink = 0, adv = 0
    try { w = win.getBBox().width; ink = t.getBBox().width; adv = t.getComputedTextLength() }
    catch { return }                       // 안 그려진 상태(display:none 조상)에서는 잴 것이 없다
    if (!(w > 0) || !(adv > 0)) return
    if (ink <= w) return                   // 들어가면 안 건드린다(늘리지 않는다)
    t.setAttribute('textLength', String(adv * w / ink))
    t.setAttribute('lengthAdjust', 'spacingAndGlyphs')
  }
}

/** 크기 줄 하나 — **그 크기의 지우개 자국을 1:1로 그린다.** 캔버스의 지우개 커서와
 *  같은 그림(반경 그대로의 원 · `COL.construction` 색 · 1px 선)이고, 자국이 화면 고정
 *  px이므로 이 원의 렌더 px가 **곧 지워질 넓이**다(원칙 e — 촉통 줄의 「견본 == 그은 선」과
 *  같은 수). ⚠ 그래서 이 svg만 `--ui-scale` 배수를 안 탄다: width/height를 viewBox와
 *  같은 px로 박는다(index.html `.erow`의 주석이 그 짝). */
const ERASE_ROW_LABEL_W = 34
function eraserRowSvg(r: number): string {
  const rmax = Math.max(...C.ERASER_R_PX)
  const w = ERASE_ROW_LABEL_W + 2 * rmax + 8
  const h = Math.max(2 * r + 8, 30)
  const cx = ERASE_ROW_LABEL_W + 4 + rmax
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<text x="${ERASE_ROW_LABEL_W - 6}" y="${(h / 2 + 4).toFixed(1)}" text-anchor="end"`
    + ` font-family="system-ui, sans-serif" font-size="11" fill="#3c3831">${eraserLabel(r)}</text>`
    + `<circle class="esample" cx="${cx}" cy="${(h / 2).toFixed(1)}" r="${r}"`
    + ` fill="none" stroke="#8a7f6a" stroke-width="1" />`
    + '</svg>'
}
const etrayEl = document.getElementById('etray')!
const eraserRow = new Map<number, HTMLElement>()
for (const r of C.ERASER_R_PX) {
  const b = document.createElement('button')
  b.id = `erase-${String(r).replace('.', '_')}`
  b.className = 't erow'
  b.dataset.eraserPx = String(r)
  b.dataset.eraserMm = eraserLabel(r)
  b.title = `지름 ${eraserLabel(r)} mm 지우개`
  b.setAttribute('aria-label', `지름 ${eraserLabel(r)} mm 지우개`)
  b.innerHTML = eraserRowSvg(r)
  // 하나를 고르면 **통이 접힌다**(R3 — 고르면 끝나는 선택). 통을 여는 길이 지우개
  // 단추뿐이므로 이 자리에서는 도구가 이미 지우개다 — 도구를 안 건드린다.
  b.addEventListener('click', () => {
    app.eraserRadius = r
    syncFoldErase()
    setEtrayOpen(false)
    invalidate()
  })
  etrayEl.append(b)
  eraserRow.set(r, b)
}
let etrayOpen = false
let etrayAnchor: HTMLElement | null = null
/** 연필통·촉통과 **같은 규약**이다(#54 — 새 기제를 안 만든다): 열면 나머지가 닫히고,
 *  자리는 `placeFlyout`이 누른 단추의 줄에 맞춰 왼쪽으로 겹쳐 띄운다(R2).
 *  ⚠ 앵커가 **둘**인 유일한 통이다 — 지우개가 둘이고 크기는 그 둘이 나눠 쓰는 한 값이라
 *  통은 하나이고 **누른 쪽에 붙는다**(§⑤의 근거). */
function setEtrayOpen(v: boolean, anchor?: HTMLElement) {
  etrayOpen = v
  etrayEl.classList.toggle('open', v)
  if (v) {
    closeOtherBoxes('#etray')
    if (anchor) etrayAnchor = anchor
    if (etrayAnchor) placeFlyout(etrayEl, etrayAnchor)
  }
}
// R7 — ⚠ 이 통만 **여는 단추가 둘**이다(지우개 둘이 크기 하나를 나눠 쓴다). 둘 다
// 안으로 친다: 다른 지우개를 누르면 통이 그쪽으로 **옮겨 붙는** 것이 종전 거동이고
// (`setEtrayOpen(true, 그 단추)`), 접었다 다시 여는 깜빡임을 만들지 않는다.
registerBox({
  id: '#etray', isOpen: () => etrayOpen, close: () => setEtrayOpen(false),
  zone: () => [etrayEl, toolBtn['eraser-pencil'], toolBtn['eraser-ink']],
})

// ── 홀더펜 인디케이터 (4-e) — 연필 몸통의 창이 곧 슬라이더다 ──────────────
// 창에 지금 심이 보이고, 연필을 위아래로 밀면 바뀐다. 별도 컨트롤이 없다.
const leadEl = document.getElementById('lead')!
const leadText = document.getElementById('lead-text')!
const nibEl = document.getElementById('nib')!
// 접힌 연필·펜(web2-19 3-b′)의 각인 — 옛 요소(#oldtools 안 lead/lead-text/nib)와 **같은
// 배선을 둘 다** 갱신한다(옛 경로는 A-4 되돌리기 손잡이라 살아 있어야 한다)
const foldLead = document.getElementById('fold-lead')!
const foldNib = document.getElementById('fold-nib')!
// **접힌 통 넷의 각인과 그 창** — 각인은 «글자, 창 rect» 짝으로 든다. 폭의 출처가
// 그 rect이기 때문이다(#88 — web2-31 마감 [2]. 옛 판은 6.6·8.8을 손으로 옮겨 적었다).
// 지우개는 값이 하나이므로 **표적이 둘**이다(web2-34 3번 · R6).
const mark = (id: string) => document.getElementById(id) as unknown as SVGTextElement
const winOf = (id: string) => document.getElementById(id) as unknown as SVGGraphicsElement
const foldLeadText = mark('fold-lead-text'), foldLeadWin = winOf('fold-lead-win')
const foldNibText = mark('fold-nib-text'), foldNibWin = winOf('fold-nib-win')
const foldEraseMarks: [SVGTextElement, SVGGraphicsElement][] = [
  [mark('fold-erase-pencil-text'), winOf('fold-erase-pencil-win')],
  [mark('fold-erase-ink-text'), winOf('fold-erase-ink-win')],
]
const pencilBtn = document.getElementById('btn-pencil-old')!   // 옛 경로(A-4) — 숨겨져 있어 안 눌린다
let pencilDrag: { y: number; i: number } | null = null

/** **접힌 펜의 촉 각인**(web2-34 2번 · 화면 규칙 R6 — 접힌 통은 지금 고른 것을 말한다).
 *  연필의 `syncGrade`와 **같은 규약**이다: 접힌 아이콘의 창에 지금 고른 것을 적는다.
 *
 *  ⚠ **부팅에서도 부르는 이유**(34-2가 D-2로 잡았다): 옛 `syncThick`은 첫 줄에서
 *  `app.tool === 'pencil'`이면 **그냥 돌아갔다**. 부팅 직후 도구는 연필이므로 거기에만
 *  걸어 두면 «펜을 한 번 눌러야 말한다»가 되어 R6을 못 지킨다 — 그래서 부팅에서도 부른다.
 *  (web2-34 3번이 막대를 지우면서 그 이른 반환도 같이 없앴다 — `syncNib`은 도구를 안 본다.)
 *
 *  ⚠ **표기는 mm이고 새 표를 안 짓는다**(#54): `app.nib`은 **px**로 들고 있으므로
 *  `C.NIB_MM`을 `nibPx()`로 되짚어 이름을 찾는다(촉통 줄을 짓는 코드와 같은 대조식).
 *  **가장 가까운 것**을 고른다 — 다섯 중 하나가 아닌 값은 지금 경로에 없지만(촉통이
 *  유일한 입구다) 그때도 접힌 펜은 **무엇인가는 말해야 한다**(R6은 «비어 있음»을 허용하지
 *  않는다). 소수점 앞 0을 떼는 것은 몸통이 좁아서다 — 정본은 `docs/instrument-icons.md`. */
const nibLabel = (px: number): string => {
  const mm = C.NIB_MM.reduce((a, b) => Math.abs(nibPx(b) - px) < Math.abs(nibPx(a) - px) ? b : a)
  return mm.toFixed(2).replace(/^0/, '')
}
function syncFoldNib() {
  foldNibText.textContent = nibLabel(app.nib)
  fitMark(foldNibText, foldNibWin)   // 창에 넣는 규약은 셋이 같다(#54 · #88)
  foldNib.setAttribute('width', String(app.nib))
  foldNib.setAttribute('x', String(13 - app.nib / 2))
}
/** 펜의 촉이 바뀌면 따라오는 것 전부 — 옛 `syncThick`이 하던 일에서 **막대만 뺀 것**이다
 *  (옛 니브 사각형 `#nib`은 `#oldtools`의 되돌리기 손잡이라 그대로 갱신한다 — A-4). */
function syncNib() {
  nibEl.setAttribute('width', String(app.nib))
  nibEl.setAttribute('x', String(13 - app.nib / 2))
  syncFoldNib()
}

/** **접힌 지우개의 크기 각인**(web2-34 3번 · 화면 규칙 R6). 34-2가 접힌 펜에 세운 문법
 *  그대로다 — 접힌 아이콘의 창에 지금 고른 것을 적는다. **둘 다** 적는다: 크기는 두
 *  지우개가 나눠 쓰는 한 값이므로 어느 쪽을 보든 같은 말을 해야 한다(§⑤).
 *  ⚠ 창에 넣는 일은 `fitMark`가 한다 — 「두 글자면 좁힌다」가 아니라 **「잉크가 창을
 *  넘으면 넘는 만큼 좁힌다」**이고 창 폭은 rect에서 읽는다(#88 — web2-31 마감 [2]).
 *  높이는 안 건드리므로 연필 각인과 같은 대역이다(`C.FOLD_MARK_MIN_RATIO`). */
function syncFoldErase() {
  const label = eraserLabel(app.eraserRadius)
  for (const [t, win] of foldEraseMarks) {
    t.textContent = label
    fitMark(t, win)
  }
  syncTray()   // 크기통의 선택 표시도 같은 값을 따라간다
}

function syncGrade() {
  leadText.textContent = app.grade
  leadEl.setAttribute('fill', MAT[app.grade].color)
  // 접힌 연필(3-b′)의 경도 각인·심 색 — 옛 btn-pencil-old의 배선 그대로, 출처는 MAT(#54)
  foldLeadText.textContent = app.grade
  fitMark(foldLeadText, foldLeadWin)   // 창에 넣는 규약은 셋이 같다(#54 · #88)
  foldLead.setAttribute('fill', MAT[app.grade].color)
  syncTray()   // 연필통(6번)의 선택 표시도 경도를 따라간다
  invalidate()
}
pencilBtn.addEventListener('pointerdown', (e) => {
  pencilDrag = { y: e.clientY, i: PENCIL_GRADES.indexOf(app.grade) }
})
// 이동·뗌은 창에서 받는다 — 연필 폭이 26px이라 미는 손가락이 늘 밖으로 나간다
window.addEventListener('pointermove', (e) => {
  if (!pencilDrag) return
  // 한 칸 = 10px. 아래로 밀면 무른 심(2B 쪽)이다 — 목록이 2H→2B로 무러지는 순서와 같다.
  const step = Math.round((e.clientY - pencilDrag.y) / 10)
  const i = Math.min(PENCIL_GRADES.length - 1, Math.max(0, pencilDrag.i + step))
  const g = PENCIL_GRADES[i]!
  if (g !== app.grade) { app.grade = g; syncGrade() }
})
const endPencilDrag = () => { pencilDrag = null }
window.addEventListener('pointerup', endPencilDrag)
window.addEventListener('pointercancel', endPencilDrag)

setTool('pencil')
syncGrade()
syncFoldNib()   // R6 — 부팅 직후(도구가 연필일 때)에도 접힌 펜이 지금 촉을 말한다
syncFoldErase() // R6 — 접힌 지우개 둘도 같다(34-3). 부팅 값 C.ERASER_PX가 계단 위에 있다

/** **각인 넷을 다시 맞춘다** — 글자는 그대로 두고 창에 넣는 일만 다시 한다.
 *
 *  ⚠⚠ **왜 필요한가**(web2-31 마감이 D-1로 잡았다): 같은 글자·같은 글꼴인데도
 *  `getBBox()`가 내는 **잉크 상자가 «그려지는 배수»에 따라 달라진다**. `.tool.on svg`가
 *  고른 도구에 `scale(1.14)`를 얹으므로(index.html) "28"의 잉크가 **고른 상태 9.364343 ↔
 *  안 고른 상태 9.708766**으로 3.7% 갈린다(전진폭은 9.3643 ↔ 9.3692로 0.05%밖에 안 갈린다).
 *  그래서 «고른 채로 맞춘 각인»이 «놓은 뒤»에는 창을 넘는다 — 34-3 ④가 그 자리에서
 *  빨갰다. 배수가 **다 움직이고 난 뒤**(`transitionend`) 다시 맞추면 두 상태 모두 창 안이다.
 *  (배수가 안 움직이면 이 자리는 안 돈다 — 다시 맞출 이유가 없다.) */
function fitAllMarks() {
  fitMark(foldLeadText, foldLeadWin)
  fitMark(foldNibText, foldNibWin)
  for (const [t, win] of foldEraseMarks) fitMark(t, win)
}
document.addEventListener('transitionend', (e) => {
  if ((e as TransitionEvent).propertyName === 'transform') fitAllMarks()
}, true)

// 오스냅 설정 패널(임시 UI — 7단계에서 세로바로) — 종류별 토글·반경
const osnapPanel = document.getElementById('osnap-kinds')!
const KIND_LABEL: Record<string, string> = {
  vp: '소실점', vertex: '정점', end: '끝점', mid: '중점', int: '교차점',
  perp: '수선 발', ext: '연장선', near: '근처점',
}
for (const kind of OSNAP_ORDER) {
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  // **오스냅은 전부 상태다**(web2-28 1번 — 한 번에 여러 개를 켜고 끄는 자리라 절대 안 접는다)
  box.dataset.act = 'state'
  box.checked = app.osnap.kinds[kind]
  box.addEventListener('change', () => { app.osnap.kinds[kind] = box.checked })
  label.append(box, ` ${KIND_LABEL[kind]}`)
  osnapPanel.append(label)
}
const gridBox = document.getElementById('chk-grid') as HTMLInputElement
gridBox.checked = app.grid
gridBox.addEventListener('change', () => { app.grid = gridBox.checked; invalidate() })
// 지평선 토글(web2-12 7번 → web2-17 5부: **자동 숨김**) — 체크박스는 실제 표시 상태를
// 비춘다(자동으로 꺼지면 체크가 풀린다 — 그래야 켜는 법이 보인다). 사람이 만지면
// `horizonPref`가 굳고 자동이 더는 안 건드린다 — 판별자는 `change` 사건이다(프로그램
// 대입은 change를 안 낸다). 비우기(clearAll)가 null(자동)로 되돌린다.
// 해칭 판(web2-45 45-4 · ⚑) — «보는 방식»이라 기기 설정이다(renderer의 규약 그대로).
const hatchFaceBox = document.getElementById('chk-hatchface') as HTMLInputElement
const HATCH_KEY = 'b2-hatch'
try {
  const m = localStorage.getItem(HATCH_KEY)
  if (m === 'face' || m === 'screen') setHatchMode(m)
} catch { /* 저장소가 없으면 기본(화면 고정) */ }
hatchFaceBox.checked = getHatchMode() === 'face'
hatchFaceBox.addEventListener('change', () => {
  setHatchMode(hatchFaceBox.checked ? 'face' : 'screen')
  try { localStorage.setItem(HATCH_KEY, getHatchMode()) } catch { /* 표시만 */ }
  invalidate()
})

const horizonBox = document.getElementById('chk-horizon') as HTMLInputElement
horizonBox.checked = horizonVisible(app, window.innerWidth, window.innerHeight)
horizonBox.addEventListener('change', () => { app.horizonPref = horizonBox.checked; invalidate() })
function syncHorizonBox() {
  const vis = horizonVisible(app, window.innerWidth, window.innerHeight)
  if (horizonBox.checked !== vis) horizonBox.checked = vis   // 프로그램 대입 — change 안 뜬다
}
// 대기 획 시점 감쇠(web2-13 3-a) — 기본 켜짐. 끄면 종전 동작 그대로(A-4 — 실기기 판정용).
const waitFadeBox = document.getElementById('chk-waitfade') as HTMLInputElement
waitFadeBox.checked = app.waitFade
waitFadeBox.addEventListener('change', () => { app.waitFade = waitFadeBox.checked; invalidate() })
// 자립 깃발 체크박스 — 값 읽기는 위(복원 전)에서 끝났다. 여기는 배선만.
// 끄면 localStorage 'off'로 남는다(A-4 — 옛 사슬 경로 유지·재방문에도 유지).
// 「가린 선(은선)」(web2-23 2-a) — **표시 손잡이일 뿐이다**: 끄면 밑그림의 H 계열이
// 안 그려지고, 굽기 결과는 안 바뀐다(다시 안 굽는다 — 2-c). 기본은 켜짐(제도 관행).
const hiddenBox = document.getElementById('chk-hidden') as HTMLInputElement
hiddenBox.checked = app.showHidden
hiddenBox.addEventListener('change', () => { app.showHidden = hiddenBox.checked; invalidate() })

const own3dBox = document.getElementById('chk-own3d') as HTMLInputElement
own3dBox.checked = app.own3d
own3dBox.addEventListener('change', () => {
  setOwn3d(app, own3dBox.checked)
  try { localStorage.setItem(OWN3D_KEY, own3dBox.checked ? 'on' : 'off') } catch { /* 세션 한정 */ }
  invalidate()
})

// ── 종이 결(web2-34 1번 · 설정 서랍 · 기본 켜짐) ───────────────────────────────
// 저장은 **localStorage**다 — `RENDERER_KEY`·`HOLD_KEY`와 같은 자리이고, 그 줄이 적은
// 근거가 그대로 선다: 「문서의 값이 아니라 «보는 방식»이다(원칙 b의 표시판)」. 결은
// 획을 한 픽셀도 안 건드리므로 남의 그림을 열어도 **내 기기의 취향**이 유지되는 것이 맞다.
// ⚠ 필압 보정(`doc.press`)이 **문서**로 간 것과 갈리는 지점이 이것이다: 그쪽은 켜는
//   순간 «예전 그림의 농도»가 바뀌어 그림의 성질이 되지만, 종이 결에는 그 사정이 없다.
// **손잡이는 하나다**(#54) — 화면 체크상자도 `diag.paperFiberForTest`도 이 함수를 부른다.
const GRAIN_KEY = 'b2-grain'
const grainBox = document.getElementById('chk-grain') as HTMLInputElement
function applyPaperGrain(on: boolean, persist: boolean) {
  grainBox.checked = on                      // 프로그램 대입 — change를 안 낸다(되먹임 없음)
  setPaperFiber(on)
  if (persist) { try { localStorage.setItem(GRAIN_KEY, on ? 'on' : 'off') } catch { /* 세션 한정 */ } }
  invalidate()
}
try { if (localStorage.getItem(GRAIN_KEY) === 'off') applyPaperGrain(false, false) } catch { /* 기본값(켜짐) */ }
grainBox.addEventListener('change', () => applyPaperGrain(grainBox.checked, true))





// ── 즉시 변환(web2-32 2번) — **승인 단계가 없다** · 진입은 명시적이다(web2-39) ────
// **글씨 상태 안에서** 숫자를 쓰면 그 뭉치가 숫자로 읽히고, 읽히면 **즉시** 치수선이
// 된다. 되돌리기는 실행취소 한 번이고 값·대상은 사후에 고친다.
// ⛔ 29-2의 제안 줄(#dimsuggest)·후보 목록·오른쪽 위 알림은 web2-32가 걷었다.
// ⛔⛔ **web2-39가 걷은 것 둘**: ① 「이 획이 글씨인가」의 추측(상태가 답한다)
//     ② 「어느 선의 치수인가」의 추정(꾹 눌러 고른 그 선이다).
let writeSeq = 0

/** 글씨 획을 확정한 뒤 — 지금 뭉치를 숫자로 읽어 보고, 읽히면 그 자리에서 치수로 바꾼다.
 *  **읽기 사슬은 `state.applyRecognized` 하나다**(#54 · #62 — 단위 팔이 같은 자리를 부른다).
 *  여기 남는 것은 «비동기 껍데기»와 «알림»뿐이다. */
async function maybeWriteDim() {
  if (!writeActive(app)) return
  const ids = handwritingGroup(app)
  if (ids.length === 0) return
  const my = ++writeSeq
  const { text } = await recognizeStrokes(writingStrokes(app, ids))
  if (my !== writeSeq || !writeActive(app)) return
  const r = applyRecognized(app, text)
  if (r === 'unread') return                       // 안 읽히면 **글씨로 남는다**(2D 잉크)
  if (r === 'no3d') notify('아직 3D로 올라가지 않은 선이다 — 치수를 못 단다')
  else if (r === 'baseScale') notify('축척은 바탕 종이의 치수가 정한다')
  // **정해지면 아무 말도 안 한다**(4-b — 화면이 이미 말한다). 「선 둘이 겹친다」 알림은
  // 대상 추정과 함께 사라졌다 — 겹칠 일이 없다(누른 그 선이다).
  invalidate()
}

// ── 글씨 상태의 «멈춤» 종료(web2-39 3번) ──────────────────────────────────────
// 포인터가 멈추면 이벤트도 멈춘다 — 그래서 타이머가 `C.WRITE_IDLE_MS` 뒤에 판정을 한 번
// 더 돌린다(옐로 머무름의 `holdTimer`와 **같은 형태** · #54). 판정 자체는 `writeIdleNow`
// 하나이고 `input.ts`의 획 시작 갈래도 그것을 부른다 — 출처가 하나다.
let writeIdleTimer: number | undefined
// e2e 전용(#93 — web2-55 마감): 부하에서 손-멈춤 판정이 글씨 도중에 끼어들어
// 。25】가 。5】로 잘리는 것을 막는다 — 시험은 승인-없음을 재지 손의 속도를 재지 않는다.

function clearWriteIdle() {
  if (writeIdleTimer !== undefined) { clearTimeout(writeIdleTimer); writeIdleTimer = undefined }
}
function armWriteIdle() {
  clearWriteIdle()
  writeIdleTimer = window.setTimeout(() => {
    writeIdleTimer = undefined
    if (!writeActive(app)) return
    if (!writeIdleNow(app, performance.now())) { armWriteIdle(); return }
    endWriting(app, 'idle')
    clearNotice()
    invalidate()
  }, (app.writeIdleMsForTest ?? C.WRITE_IDLE_MS) + 16)
}

// ── 손글씨 치수(web2-29 1단계) — 인식과 «확정 전 보여주기» ────────────────────
// ⚠ **못 읽으면 손글씨를 안 지운다**(지시 문면 · #61 ⚠⚠ — 조용히 틀린 치수보다 다시
//    쓰기가 싸다). 읽었으면 값을 **물어보고**, 받으면 그때 손글씨가 사라지고 치수선이 선다.
let dimSeq = 0
async function recognizeDimInk() {
  if (app.dimPick === null || app.dimInk.length === 0) return
  const my = ++dimSeq
  const { text } = await recognizeStrokes(app.dimInk)
  if (my !== dimSeq || app.dimPick === null) return    // 그 사이에 더 썼다/그만뒀다
  const mm = parseDim(text, app.doc.unit)
  stageDim(app, text, mm)
  invalidate()
  if (mm === null) {
    // 못 읽었다 — 손글씨는 그대로 두고 다시 쓰게 한다(지우지 않는다)
    status(`치수 — 「${text || '?'}」로 읽었다. 다시 쓴다`)
    return
  }
  ask(`치수 ${formatMm(mm, app.doc.unit, app.dimExact)} —`, [
    { key: 'yes', label: '받는다', onPick: () => {
      const r = acceptDim(app)
      if (r === 'no3d') notify('아직 3D로 올라가지 않은 선이다 — 치수를 못 단다')
      else if (r === 'baseScale') notify('축척은 바탕 종이의 치수가 정한다')
      // ⚠ 「적힌 값이 잰 값과 어긋난다」 안내는 **안 만들었다** — 이 모형에서는 적힌 값이
      //   곧 길이라 어긋남이 구성상 0이다(state.ts의 D-4 주석이 정본). 발화 조건이 없다.
      else endDimPick(app)
      invalidate()
    } },
    { key: 'no', label: '다시', onPick: () => { clearDimInk(app); status('치수 — 종이 위에 숫자를 쓴다'); invalidate() } },
  ])
}

// ── web2-28 2번 — **툴팁**(펜에서만) ─────────────────────────────────────────
// 펜을 단추 위에 `C.TIP_DWELL_MS` 머무르면 그게 무엇인지 뜬다. 규칙 넷(지시 문면):
//   · 문구는 **이미 있는 `title` / `aria-label`을 읽는다** — 새 문자열 테이블 ⛔
//     (두 벌이 되면 갈라진다. 그래서 이 파일에는 툴팁 문자열이 **하나도 없다**).
//   · **펜에서만** — 손가락에는 호버가 없고, 접촉으로 띄우면 누를 때마다 방해가 된다.
//   · 그리는 중에는 안 뜬다 — 획이 시작되면 즉시 사라진다.
//   · 화면 밖으로 넘치면 **안쪽으로 뒤집는다**.
// ⚠ 브라우저 기본 툴팁과 겹치지 않게 `title`을 지우지는 **않는다** — 데스크톱 마우스
//   사용자에게는 그쪽이 여전히 길이고, 이 팁은 펜 경로에만 산다.
const tipEl = document.getElementById('tip')!
let tipTimer: number | undefined
let tipTarget: HTMLElement | null = null

function tipTextOf(el: HTMLElement): string | null {
  const t = el.getAttribute('title')
  if (t && t.trim()) return t.trim()
  const a = el.getAttribute('aria-label')
  return a && a.trim() ? a.trim() : null
}
export function hideTip() {
  if (tipTimer !== undefined) { clearTimeout(tipTimer); tipTimer = undefined }
  tipTarget = null
  tipEl.hidden = true
}
function showTipAt(el: HTMLElement, text: string) {
  tipEl.textContent = text
  tipEl.hidden = false
  const r = el.getBoundingClientRect()
  const b = tipEl.getBoundingClientRect()
  // 기본은 왼쪽(세로바가 오른쪽이다) — 넘치면 **안쪽으로 뒤집는다**
  let x = r.left - b.width - 8
  if (x < 4) x = Math.min(r.right + 8, window.innerWidth - b.width - 4)
  let y = r.top + (r.height - b.height) / 2
  y = Math.max(4, Math.min(y, window.innerHeight - b.height - 4))
  tipEl.style.left = `${Math.round(x)}px`
  tipEl.style.top = `${Math.round(y)}px`
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'pen') { hideTip(); return }        // 펜에서만(손가락 ⛔)
  // ⚠ **web2-48 48-10이 `label`을 더했다.** 45의 `chk-hatchface`와 47의 `chk-rooms`는
  // 설명을 감싼 `<label>`에 달았는데 그 태그가 이 선택자 밖이라 **펜 툴팁이 안 떴다**
  // (데스크톱의 브라우저 기본 툴팁으로만 보여서 안 드러났다 — 실기기가 펜이다).
  // 고치는 자리는 요소가 아니라 **규칙**이다(#38·#19의 요지 · 48-10이 세운 그 규칙):
  // 토글을 감싼 라벨도 «손잡이»이므로 선택자에 든다. 낱낱으로 두 요소를 고치면 셋째가 샌다.
  const el = (e.target as HTMLElement | null)?.closest('button, summary, label, [role="button"]') as HTMLElement | null
  if (!el || !tipTextOf(el)) { hideTip(); return }
  if (el === tipTarget) return                              // 같은 자리 — 시계를 다시 안 돌린다
  hideTip()
  tipTarget = el
  tipTimer = window.setTimeout(() => {
    tipTimer = undefined
    const t = tipTextOf(el)
    if (t) showTipAt(el, t)
  }, C.TIP_DWELL_MS)
}, true)
// 그리는 중에는 안 뜬다 — 획이 시작되면 즉시 사라진다. 뗌·나감·스크롤도 같이 닫는다.
for (const ev of ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave', 'wheel']) {
  document.addEventListener(ev, () => hideTip(), true)
}

// ── web2-28 1번 — **명령을 실행하면 패널이 접힌다** ────────────────────────────
// 가르는 기준은 «무엇을 눌렀느냐»가 아니라 **그것이 상태인가 명령인가**다.
//   명령 버튼(비우기·내보내기·불러오기·면 찾기 …) → 접힌다
//   상태 토글(체크박스·스위치)·연속값(슬라이더)   → 안 접힌다
// ⛔ **버튼 종류를 그때그때 추측하는 코드를 만들지 않는다**(지시 문면 — 항목이 늘 때마다
//    틀린다). 항목마다 `data-act="cmd" | "state"`를 **명시**하고 접힘은 **그 표시만** 본다.
// ⚠ 오스냅은 한 번에 여러 개를 켜고 끄는 자리라 **절대 안 접는다**(전부 state).
//   연필통은 「하나를 고르면 끝나는 선택」이라 접힌다 — 그쪽은 종전 배선이 이미 접는다.
//
// ⚠⚠ **web2-34 4번(화면 규칙 R7)이 이 표를 그대로 이어 쓴다.** 28-1은 「패널 **안**에서
//   명령을 실행했을 때」만 다뤘고 **바깥이 비어 있었다** — 이제 같은 표가
//   ① 안의 접힘(R3) ② 바깥 누름의 접힘(R7) ③ 「동시에 둘이 안 열린다」 셋을 다 든다.
//   **한 자리다**(#54): 목록이 늘면 여기 한 줄이 늘고 셋이 동시에 따라온다.
//   R3과 R7은 안 부딪힌다 — 오스냅 체크는 R3에서 안 접히지만(전부 `state`)
//   R7에서는 바깥을 누르면 접힌다.
interface Panel {
  root: string
  /** 이 통을 여는 단추 — 통의 «안»으로 친다(여닫이가 살게). 서랍은 summary가 안에 있다. */
  anchor?: string
  isOpen: () => boolean
  setOpen: (v: boolean) => void
  /** 참인 동안 바깥 누름에 안 접힌다 — R7 예외(근거는 `DECISIONS.md`의 R7 절) */
  pinned?: () => boolean
}
const byId = (s: string) => document.getElementById(s.slice(1)) as HTMLElement | null
/** 서랍(`<details>`) — 여닫이는 브라우저가 한다. 배타는 `toggle`에서 건다(아래). */
const drawerPanel = (root: string, pinned?: () => boolean): Panel => ({
  root, pinned,
  isOpen: () => !!(byId(root) as HTMLDetailsElement | null)?.open,
  setOpen: (v) => { const d = byId(root) as HTMLDetailsElement | null; if (d) d.open = v },
})
/** 팝오버 — `hidden` 하나가 상태다. 열 때 자리를 잡는 몫은 `onShow`가 진다. */
const popPanel = (root: string, anchor: string, onShow?: () => void): Panel => ({
  root, anchor,
  isOpen: () => { const e = byId(root); return !!e && !e.hidden },
  setOpen: (v) => {
    const e = byId(root)
    if (!e) return
    e.hidden = !v
    if (v) { closeOtherBoxes(root); onShow?.() }
  },
})
const FOLD_PANELS: Panel[] = [
  drawerPanel('#pane-file'),
  // 설정(web2-30 10번) — **상태 토글(필압 보정)은 안 접고 명령(진단)만 접는다**(28-1 그대로).
  // 진단을 접는 실질적 이유: 서랍과 진단 패널·자립 깃발이 **같은 우하단 모서리**를 쓴다.
  // ⚠⚠ **R7 예외 하나가 여기 있다**(web2-34 4번 · D-4로 잡았다): 필압 보정 **절차 중에는**
  //   바깥 누름에 안 접는다. 그 절차는 「캔버스에 두 획을 그으세요」이고 다음 지시와
  //   그만두기 손잡이가 **이 패널 안**에 있다(30-7이 알림 한 줄에서 여기로 옮긴 것이
  //   그 항목의 전부다) — 첫 획에 접히면 그 수리가 통째로 죽는다(#77 ㉠).
  //   판정 문면은 `#dimpanel`과 같다: **바깥을 눌러야 그 패널의 일이 된다.**
  drawerPanel('#pane-settings', () => app.pressCalib !== null),
  popPanel('#display-pop', '#btn-display'),
  popPanel('#snap-pop', '#btn-snap', () => placeSnapPop()),
  popPanel('#face-pop', '#btn-face', () => showFacePop()),
  // 렌즈(web2-31 2번) — 손잡이는 `state`라 만지는 동안 안 접히고, 「기본으로」는 `cmd`다.
  popPanel('#lens-pop', '#btn-lens', () => placeLensPop()),
]
/** 이름으로 찾는다 — 여닫이 단추가 이 표를 거쳐 열고 닫는다(직접 `hidden` 대입 ⛔) */
const panelOf = (root: string): Panel => FOLD_PANELS.find(p => p.root === root)!
function initPanelFold() {
  for (const p of FOLD_PANELS) {
    const root = document.querySelector(p.root)
    if (!root) continue
    // R7 — 바깥 누름으로 접힌다. 통의 «안»은 통 자신과 그것을 여는 단추다.
    registerBox({
      id: p.root,
      isOpen: p.isOpen,
      close: () => p.setOpen(false),
      zone: () => [byId(p.root), p.anchor ? byId(p.anchor) : null],
      pinned: p.pinned,
    })
    // 서랍은 summary를 눌러도 열리고 코드로도 열린다 — 배타는 **열린 사실**에 건다
    if (root instanceof HTMLDetailsElement) {
      root.addEventListener('toggle', () => {
        if (!root.open) return
        closeOtherBoxes(p.root)
        // ⚠ 자리는 **CSS의 «위 띠의 길»**(`--top-lane`)이 정한다 — JS가 안 잡는다.
        //   기둥(치수 리본)이 세로로 길어(573px) 그 왼쪽 한 줄이 유일한 빈 길이고,
        //   그것은 요약의 위치와 무관한 **고정된 길**이다(R5 · #79: 자리를 나눈다).
      })
    }
    // 캡처가 아니라 **버블**이다 — 그 항목의 제 동작이 먼저 돌고 나서 접는다(접힘은 뒤끝).
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement | null)?.closest('[data-act]') as HTMLElement | null
      if (!el || el.dataset.act !== 'cmd') return
      // ⚠ `data-fold="late"` — **누르는 순간 볼일이 안 끝나는 명령**이다: 그 버튼 «곁»에
      //    확인이 뜨는 자리(비우기 — web2-12 4번). 바로 접으면 **앵커가 사라져 확인이
      //    미아가 된다**(전량 e2e `flow.spec`이 잡았다). 접힘은 그 명령이 스스로 부른다.
      // ⚠ `data-fold="keep"`(web2-66 66-4 — **R3 정정**) — **연달아 쓰는 명령**이다: 접는
      //    기준은 «명령이냐»가 아니라 «그 뒤에 그 통을 또 쓸 것 같은가»다(사람 판정 —
      //    자동찾기(전부 찾기)의 다음 걸음(확정·취소)이 같은 통 안에 뜬다). 안 접는다.
      if (el.dataset.fold === 'late' || el.dataset.fold === 'keep') return
      p.setOpen(false)
    })
  }
}
initPanelFold()

// ── 필압 보정(web2-26 6번 · 옵션 · 기본 꺼짐) — 켜면 **두 획을 받는다**(지시 2) ──
// 결과는 문서에 붙는다(`doc.press`) — 기기 설정이면 옵션을 켜는 순간 예전 그림들의
// 농도까지 바뀐다. 화면 문구는 지시가 준 「필압 보정」 그대로다.
const pressBox = document.getElementById('chk-press') as HTMLInputElement
const pressCalibRow = document.getElementById('press-calib')!
const pressCalibStepEl = document.getElementById('press-calib-step')!

/** 절차의 문면 — **한 자리**다(#54). 알림 줄과 설정 패널의 줄이 같은 문자열을 읽는다.
 *  ⚠ web2-26 6번에는 알림 줄뿐이었고, 알림은 스쳐 지나가므로 **절차가 화면에 있는지**를
 *  아무도 확인할 수 없었다(30-7의 물음이 그것이다). */
const PRESS_STEP = {
  normal: '필압 보정 — 평소 세기로 한 획을 그으세요',
  hardest: '필압 보정 — 이제 가장 세게 한 획',
  nopen: '필압 보정 — 펜으로 그어야 압력이 실립니다',
  again: '필압 보정 — 두 세기가 너무 가깝습니다. 평소 세기부터 다시',
} as const

/** 화면을 상태에 맞춘다.
 *  ⚠⚠ **체크상자는 `pressOn`만 읽는다** — 절차 중에는 **꺼진 채**다(30-7 게이트 ④:
 *  「절반만 켜진 상태를 만들지 마라」). 옵션이 켜지는 시점은 `doc.press`가 서는 순간
 *  하나이고, 그 전까지는 «절차 중»이라는 별도 표시가 그 사실을 든다(#77 ㉠ — 한 손잡이에
 *  뜻을 둘 얹으면 옛 뜻이 조용히 죽는다). */
function syncPressBox(step?: string) {
  pressBox.checked = pressOn(app)
  const busy = app.pressCalib !== null
  pressCalibRow.hidden = !busy
  if (busy && step) pressCalibStepEl.textContent = step
  if (!busy) pressCalibStepEl.textContent = ''
}
function beginPressCalibUI() {
  beginPressCalib(app)
  syncPressBox(PRESS_STEP.normal)
  status(PRESS_STEP.normal)
}
pressBox.addEventListener('change', () => {
  // 체크상자는 이제 «켜짐»만 든다 — 누르면 **절차를 시작**하고 상자는 도로 꺼진다.
  if (pressBox.checked) beginPressCalibUI()
  else { setPressOff(app); syncPressBox(); clearNotice() }
  invalidate()
})
document.getElementById('btn-press-cancel')!.addEventListener('click', () => {
  // 그만두면 **꺼진 채로 남는다**(30-7 게이트) — 절반 상태가 남지 않는다
  setPressOff(app)
  syncPressBox()
  clearNotice()
  invalidate()
})
// 문서를 열면 그 문서의 보정 상태가 화면에 그대로 뜬다(문서에 붙는 설정이므로)
app.listeners.push(() => syncPressBox())
syncPressBox()

/** 확정된 획을 절차에 먹인다 — `onCommit` 뒤에 부른다(획이 문서에 든 다음). */
function pressCalibStep(s: Stroke | null) {
  if (!s || app.pressCalib === null) return
  const say = (m: string) => { status(m); syncPressBox(m) }
  switch (feedPressCalib(app, s)) {
    case 'nopen': say(PRESS_STEP.nopen); break
    case 'first': say(PRESS_STEP.hardest); break
    case 'again': say(PRESS_STEP.again); break
    case 'done': {
      const c = app.doc.press!
      notify(`필압 보정 완료 — 평소 ${c.p0.toFixed(2)} · 최대 ${c.p1.toFixed(2)}`)
      syncPressBox()          // 여기서 비로소 체크상자가 켜진다(그 전까지는 꺼진 채)
      break
    }
  }
  invalidate()
}

// ── 머무름 직선화 시간(web2-26 4번) — **기기 설정**이라 localStorage다(문서 아님).
// 손의 성질이지 그림의 성질이 아니다: 남의 그림을 열어도 내 손에 맞는 값이 유지된다.
const HOLD_KEY = 'b2-holdms'
const holdRng = document.getElementById('rng-hold') as HTMLInputElement
const holdRead = document.getElementById('hold-read')!
const clampHold = (v: number) => Math.min(C.HOLD_MS_MAX, Math.max(C.HOLD_MS_MIN, Math.round(v / 50) * 50))
const showHold = () => { holdRead.textContent = `${(app.holdMs / 1000).toFixed(2)}s` }
holdRng.min = String(C.HOLD_MS_MIN)
holdRng.max = String(C.HOLD_MS_MAX)
try {
  const saved = Number(localStorage.getItem(HOLD_KEY))
  if (Number.isFinite(saved) && saved > 0) app.holdMs = clampHold(saved)
} catch { /* 기본값 */ }
holdRng.value = String(app.holdMs)
showHold()
holdRng.addEventListener('input', () => {
  app.holdMs = clampHold(Number(holdRng.value))
  showHold()
  try { localStorage.setItem(HOLD_KEY, String(app.holdMs)) } catch { /* 세션 한정 */ }
})

// ── 글씨 꾹 누르기 시간(web2-39 1번) — **사용자가 요청한 손잡이**다.
// 위 머무름과 **같은 갈래**(기기 설정 · localStorage · 같은 대역·같은 눈금 — #54):
// 남의 그림을 열어도 내 손에 맞는 값이 유지된다. 문서에 안 들어간다.
const WHOLD_KEY = 'b2-writeholdms'
const wholdRng = document.getElementById('rng-whold') as HTMLInputElement
const wholdRead = document.getElementById('whold-read')!
const clampWHold = (v: number) =>
  Math.min(WRITE_HOLD_MS_MAX, Math.max(WRITE_HOLD_MS_MIN, Math.round(v / 50) * 50))
const showWHold = () => { wholdRead.textContent = `${(app.writeHoldMs / 1000).toFixed(2)}s` }
wholdRng.min = String(WRITE_HOLD_MS_MIN)
wholdRng.max = String(WRITE_HOLD_MS_MAX)
try {
  const saved = Number(localStorage.getItem(WHOLD_KEY))
  if (Number.isFinite(saved) && saved > 0) app.writeHoldMs = clampWHold(saved)
} catch { /* 기본값 */ }
wholdRng.value = String(app.writeHoldMs)
showWHold()
wholdRng.addEventListener('input', () => {
  app.writeHoldMs = clampWHold(Number(wholdRng.value))
  showWHold()
  try { localStorage.setItem(WHOLD_KEY, String(app.writeHoldMs)) } catch { /* 세션 한정 */ }
})

const radius = document.getElementById('osnap-radius') as HTMLInputElement
radius.value = String(app.osnap.radius)
radius.addEventListener('input', () => { app.osnap.radius = Number(radius.value) })

// ── 자(삼각자) = 스냅 묶음의 입구(web2-19 3-b) — 오스냅 종류·반경이 여기서 열린다 ──
// 설정 자루에서 나왔다 — id·배선은 위 그대로다(동작 불변 ④). 여닫기만 이 버튼이 진다.
const snapBtn = document.getElementById('btn-snap')!
const snapPop = document.getElementById('snap-pop')!
/** 자 통의 자리 — 누른 단추의 줄에 맞추되 화면 아래로 안 넘치게(선언이 위, 쓰임은 표) */
function placeSnapPop() {
  const r = snapBtn.getBoundingClientRect()
  snapPop.style.top = `${Math.round(Math.min(r.top, window.innerHeight - snapPop.offsetHeight - 6))}px`
}
// 여닫이는 **표를 거친다**(직접 `hidden` 대입 ⛔) — 여는 쪽에서 R7의 「하나만」이 걸린다
snapBtn.addEventListener('click', () => {
  const p = panelOf('#snap-pop')
  p.setOpen(!p.isOpen())
})

// ── 눈(3-a) — 표시 팝업(지평선·지면 격자·대기 획 감쇠)·전체 화면 ─────────────
const displayBtn = document.getElementById('btn-display')!
const displayPop = document.getElementById('display-pop')!
displayBtn.addEventListener('click', () => {
  const p = panelOf('#display-pop')
  p.setOpen(!p.isOpen())
})

// 전체 화면(3-d) — 크롬만 숨긴다(CSS body.fs). 작도의 뼈대(지평선·✕·격자)는 캔버스
// 몫이라 그대로다. **상태는 저장하지 않는다**(세션 한정 — 새로 고치면 꺼져 있다).
// 나가는 길은 우하단 손잡이 하나(#fs-exit) — 제스처를 새로 만들지 않는다(지시 ⚠).
document.getElementById('btn-fullscreen')!.addEventListener('click', () => {
  document.body.classList.add('fs')
  snapPop.hidden = true
  displayPop.hidden = true
})
document.getElementById('fs-exit')!.addEventListener('click', () => {
  document.body.classList.remove('fs')
})

// 파일 — 저장·열기·내보내기
function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
document.getElementById('btn-save')!.addEventListener('click', () => {
  download('drawing.brnl', serializeBrnl({
    doc: app.doc, nextId: app.nextId, drawView: app.drawView,
  }), 'application/json')
  // 성공 알림(web2-10 지시 5) — 4-b(「알림은 오류만」)의 예외다: 다운로드는 태블릿
  // PWA에서 화면에 아무 흔적이 없어 «됐는지»를 알 길이 없고, 모르고 또 누르거나
  // 저장 안 된 채 닫는 쪽이 오류다. 파일명이 정보다(HANDOFF 「남은 다듬기」의 그 행).
  notify('저장했다 — drawing.brnl')
})
const fileOpen = document.getElementById('file-open') as HTMLInputElement
document.getElementById('btn-open')!.addEventListener('click', () => fileOpen.click())
function applyOpen(data: NonNullable<ReturnType<typeof parseBrnl>>) {
  loadDoc(app, data)
  fitViewToFrame()
  paperbar.sync()
  layerbar.sync()
  unitSel.value = app.doc.unit                 // 문서의 단위가 패널에 보인다(4-6)
}
fileOpen.addEventListener('change', async () => {
  const f = fileOpen.files?.[0]
  fileOpen.value = ''
  if (!f) return
  // **읽을 수 있는 데까지 읽는다**(web2-43 1번) — 잘렸거나 필드가 깨졌으면 못 읽은 것을
  // 말하고 나머지를 연다. 조용히 빈 문서를 열지도, 통째로 버리지도 않는다.
  const { data, report } = readBrnl(await f.text())
  const msg = reportNotice(report)
  if (!data) { notify(msg ?? '.brnl 파일이 아니거나 손상됐다'); return }
  // 파일에서 연 것은 **새 문서**다(web2-43 3번) — 이름은 파일 이름이다. 그래서 지금
  // 그림을 버리지 않는다: 열기 전에 저장되고 최근 목록에 그대로 남는다.
  const name = f.name.replace(/\.(brnl|json)$/i, '').replace(/\.brnl$/i, '')
  const go = () => { void filePanel.flush().then(() => { applyOpen(data); filePanel.adoptOpened(name); if (msg) notify(msg) }) }
  if (app.doc.strokes.length === 0) { go(); return }
  // 확인은 누른 버튼 곁이다(web2-12 4번 — 상부 알림줄 왕복을 없앤다).
  // ⚠ 문구가 바뀌었다 — 이제 **안 잃는다**(먼저 저장하고 새 문서로 연다).
  confirmNear(document.getElementById('btn-open')!,
    '지금 그림을 저장하고 파일을 새 문서로 연다.',
    { label: '연다', onPick: go })
})
document.getElementById('btn-obj')!.addEventListener('click', () => {
  if (!hasGeometry()) return
  download('drawing.obj', toOBJ(app.lift, app.faces), 'text/plain')
  download('drawing.mtl', toMTL(), 'text/plain') // 재료 → 레이어 색상
  notify('내보냈다 — drawing.obj·mtl (이 앱으로 못 되돌아온다)')
})
document.getElementById('btn-gltf')!.addEventListener('click', () => {
  if (!hasGeometry()) return
  download('drawing.gltf', toGLTF(app.lift, app.faces), 'model/gltf+json')
  notify('내보냈다 — drawing.gltf (이 앱으로 못 되돌아온다)')
})
/** 내보낼 3D가 있는가 — 없으면 **빈 파일을 조용히 내려주지 않는다** */
function hasGeometry(): boolean {
  if (app.lift.lifted.size > 0 || app.faces.length > 0) return true
  notify('3D로 올라간 획이 없다 — 내보낼 것이 없다')
  return false
}

// 비우기 — 그림을 전부 지우고 지평선 단계부터 다시. 자동 저장도 함께 지운다.
// 실수로 누르는 것은 **확인 한 번**으로 막는다(A-3: 실행취소 확장보다 단순하다).
// 확인은 버튼 곁이다(web2-12 4번) — 왼쪽 옆에 떠서 버튼 자리와 안 겹치므로
// 같은 자리를 연타해도 안 지워진다(그 연타를 e2e가 실제로 한다 — D-3).
document.getElementById('btn-clear')!.addEventListener('click', () => {
  if (app.doc.strokes.length === 0) { notify('이미 비어 있다'); return }
  // ⚠⚠ **web2-43이 이 문구를 바꿨다**(그리고 뜻을 바꿨다): 비우기는 이제 **새 문서로
  // 가는 일**이고 지금 그림은 **최근 목록에 남는다**. 종전에는 「실행취소로 못 돌아온다」가
  // 사실이었다 — 자동 저장 칸이 하나뿐이라 비우면 그 그림이 정말로 사라졌기 때문이다.
  // 이제 칸이 여럿이므로 그 손실은 **까닭 없는 손실**이다. 지우고 싶으면 최근 목록의
  // ×가 그 자리이고(거기에 되돌릴 수 없는 것의 확인이 붙어 있다), 여기는 「새로 시작」이다.
  // 확인을 남겨 둔 이유: 화면의 그림이 사라지는 것은 여전히 사람이 놀랄 일이다(R4 예외).
  confirmNear(document.getElementById('btn-clear')!,
    '지금 그림을 저장하고 빈 종이로 간다.', { label: '새로 시작', onPick: doClear })
})
function doClear() {
  // 볼일이 여기서 끝난다 — **그때 접는다**(web2-28 1번의 `data-fold="late"` 짝).
  ;(document.getElementById('pane-file') as HTMLDetailsElement).open = false
  // **비우기 전에 굳힌다** — 순서가 곧 「잃지 않는다」이다(비운 뒤에 저장하면 그 저장이
  // 빈 문서를 쓰는 일이 되고, 빈 문서는 저장소에서 지워진다). `detach`는 **지금 바이트를
  // 그 자리에서 떠서** 뒤에 쓰므로 화면이 저장소를 안 기다린다.
  filePanel.detach()
  clearAll(app, window.innerWidth, window.innerHeight)
  unitSel.value = app.doc.unit
  draft = null; hover = null; eraserPos = null; facePrev = null // 지운 획을 가리키던 표식이 남지 않게
  paperbar.sync()
  layerbar.sync()
  invalidate()
}

// 종이 질감 토글(web2-11 2-b) — 두 렌더러를 그 자리에서 오간다. 비교가 목적이다.
const brushBtn = document.getElementById('btn-brush')!
function setRenderer(r: 'classic' | 'brush') {
  app.renderer = r
  brushBtn.classList.toggle('on', r === 'brush')
  try { localStorage.setItem(RENDERER_KEY, r) } catch { /* 세션 한정이 될 뿐 */ }
  invalidate()
}
brushBtn.addEventListener('click', () => setRenderer(app.renderer === 'brush' ? 'classic' : 'brush'))
brushBtn.classList.toggle('on', app.renderer === 'brush')

// 세로바 접기
const sidebar = document.getElementById('sidebar')!
document.getElementById('sidebar-toggle')!.addEventListener('click', () => {
  sidebar.classList.toggle('folded')
  // ⚠ **통 넷은 세로바 «밖»이다**(34-6 후속 — 쌓임 맥락에서 꺼냈다). 종전에는
  //   `#sidebar.folded #sidebar-body { display:none }` 한 줄이 열린 통까지 같이 덮었는데
  //   이제 안 덮는다 — 접으면서 **닫는다**. 여는 단추가 사라졌는데 통만 떠 있으면
  //   그 통은 미아다(28-1이 「비우기」에서 잡은 것과 같은 형태).
  if (sidebar.classList.contains('folded')) closeOtherBoxes('#sidebar-toggle')
})

// 종이 탭(web2-19 2부) — 시점 저장·복귀·썸네일·삭제가 전부 **띠 하나**로 옮겨 왔다
// (web2-12 5번의 뷰 팝업을 대신한다 — 「지금 어느 장인가」는 상태 표시라 늘 떠 있어야 한다).

/** 지금 화면의 썸네일 — 겹 순서대로(gl → brushc → ink) 종이색 위에 합성해 줄인다.
 *  저장 시점에 굽는다(㉮ — addSheet 머리주석). JPEG: 사진형 합성이라 PNG보다 훨씬 작다. */
function captureThumb(): string {
  const t = document.createElement('canvas')
  // ⚠ **비가 유한하지 않을 수 있다**(web2-43에서 실측): 화면이 아직(또는 전혀) 안 그려진
  // 창에서는 `W`가 0이라 `H/W`가 NaN이 되고, `Math.max(1, NaN)`은 **NaN**이라 캔버스
  // 높이가 0이 된다 — 그때 `toDataURL`이 `"data:,"`를 낸다(그림이 아니다).
  // 종전에는 그 값이 종이 썸네일에 **조용히** 들어갔다. 이제 비를 4:3으로 물린다.
  const ratio = W > 0 && H > 0 ? H / W : 0.75
  t.width = C.THUMB_W
  t.height = Math.max(1, Math.round(C.THUMB_W * ratio))
  const g = t.getContext('2d')!
  g.fillStyle = '#f5f3ee'
  g.fillRect(0, 0, t.width, t.height)
  for (const id of ['gl', 'brushc', 'ink']) {
    const c = document.getElementById(id) as HTMLCanvasElement | null
    if (c && c.width > 0) g.drawImage(c, 0, 0, t.width, t.height)
  }
  return t.toDataURL('image/jpeg', 0.72)
}

// ── 밑그림 안내(web2-23 3부) — **면이 없을 때만·한 번만** ──────────────────────
// 면이 하나도 없이 옐로를 얹으면 와이어프레임이 다 보이는 그 문제가 그대로 난다.
// **막지 않는다**(그것도 하나의 선택이다 — 밑그림 없이 자유 스케치만 할 수도 있다).
// 한 줄 안내 + **면 일괄로 가는 길**을 그 자리에서 연다(지시 3부). 매번 뜨면 잔소리가
// 되므로 세션에 한 번이다(`app.underlayNoticed`).
// 겹을 얹는 자리가 둘(종속 탭 「+」·손 띠 롤)이라 **뒤처리는 여기 하나다**(#54).
function afterAddLayer(lay: Layer) {
  if (lay.paper !== 'yellow') return
  if (app.faces.length > 0) return          // ② 면이 있으면 안 뜬다
  if (app.underlayNoticed) return           // ④ 두 번째 옐로에서는 안 뜬다
  app.underlayNoticed = true
  ask('면이 없어 뒤엣선이 다 보인다', [{
    key: 'faces',
    label: '면 만들기',
    // 팝오버를 여는 길은 **표 하나**다(직접 `hidden` 대입 ⛔ — R7의 「하나만」이 여기서 걸린다)
    onPick: () => { setTool('face'); panelOf('#face-pop').setOpen(true); runFindAll() },
  }])
}

// ── 롤이 시점을 굳힌다(web2-25 2부) — 겹을 얹는 **두 자리가 같은 함수를 부른다** ────
// 돌려본 시점은 아직 어느 종이의 시점도 아니라, 그 자리에서 겹을 얹으면 활성 종이(대개
// 작도 종이)에 붙고 **지금 화면에서는 안 보였다**. 얹기 전에 그 시점을 새 종이로 굳힌다 —
// 셔터(「+」)와 **같은 경로**(`captureSheet`)다(#54: 출처 하나 · 2-b ⚠).
let paperbarRef: { sync: () => void } | null = null
/** **셔터의 번쩍임**(web2-25 3-a) — 찍는 순간 화면이 한 번 짧게 번쩍한다.
 *  「+」가 «찍는 동작»이 됐으므로 무엇이 저장됐는지가 **그 자리에서** 보여야 한다.
 *  ⚠ **짧고 무채색**이다(지시 ⚠ — 순간 피드백 대역. 색을 안 들인다). 길이는
 *  `C.SHUTTER_FLASH_MS` 하나이고 CSS 변수로 내려 애니메이션과 제거 시각이 **같은 값**을
 *  읽는다(#54 — 두 자리에 적으면 갈린다). 겹쳐 눌러도 하나만 산다. */
function shutterFlash() {
  document.getElementById('shutter-flash')?.remove()
  const el = document.createElement('div')
  el.id = 'shutter-flash'
  el.style.setProperty('--shutter-ms', `${C.SHUTTER_FLASH_MS}ms`)
  document.body.append(el)
  window.setTimeout(() => el.remove(), C.SHUTTER_FLASH_MS)
}

/** 지금 포즈·뷰를 새 종이로 — **셔터와 롤과 시점 갱신이 다 이 함수 하나를 부른다** */
function captureSheet(): Sheet {
  const s = addSheet(app, captureThumb())
  paperbarRef?.sync()
  layerbarRef?.sync()
  return s
}
/** 겹을 얹기 직전 — 시점이 어느 종이의 것도 아니면 굳힌다(안내 한 줄) */
function beforeAddLayer() {
  if (!freezePoseForLayer(app)) return
  // 굳힌 종이의 썸네일은 **얹기 전 화면**이다(밑그림·겹이 올라가기 전) — 셔터와 같은 순간.
  const s = app.doc.sheets[app.doc.sheets.length - 1]!
  s.thumb = captureThumb()
  paperbarRef?.sync()
  notify(`이 시점을 「${s.name}」로 굳혔다`)
}

let layerbarRef: { sync: () => void } | null = null
const layerbar = initLayerbar(app, document.getElementById('layerbar')!, {
  viewport: () => ({ W, H }),
  onChange: () => invalidate(),
  notify,
  beforeAdd: beforeAddLayer,
  afterAdd: afterAddLayer,
})
layerbarRef = layerbar
// ── 롤 둘(web2-21 3-a) — 손 띠에서 종이를 한 장 뜯는다. 종속 탭의 「+」와 같은 일
// (addLayer 하나 — 같은 일을 두 자리에서 하는 것은 흠이 아니다: 연필을 랙에서도 접힌
// 아이콘에서도 고르는 것과 같다). 카메라가 닫히기 전에는 비활성 + 이유(2-a).
/** 한 장 얹는다 — 종속 탭 「+」와 **같은 일**이고 함수도 하나다(#54). */
function addRoll(paper: 'tracing' | 'yellow') {
  if (!app.lift.an.constructionDone) {
    notify(LAYER_GATE_MSG)   // 종속 탭 「+」와 같은 상수(#54 — 3·4부 리뷰 [12])
    return
  }
  beforeAddLayer()                 // 시점을 먼저 굳힌다(2-b) — 셔터와 같은 경로
  const lay = addLayer(app, paper, { W, H })
  layerbar.sync()
  invalidate()
  if (lay) afterAddLayer(lay)
}
// ── 롤통(web2-34 6번) — 종전 단추 둘이 **한 통**이 됐다. 자리를 만드는 것이 목적이고
//    문법은 연필통·촉통·크기통 그대로다(#54 — 새 기제 ⛔).
//    ⚠ **R6 비대상**: 이 통에는 «고른 것»이 없다. 두 줄이 **명령**이라(한 장 얹는다)
//    누르면 볼일이 끝나 접힌다(R3) — 면 팝오버와 같은 범주다.
const rollBtn = document.getElementById('btn-roll')!
const rolltrayEl = document.getElementById('rolltray')!
const ROLLS = [
  { paper: 'tracing' as const, name: '트레이싱지', svg: ROLL_TRACING },
  { paper: 'yellow' as const, name: '옐로', svg: ROLL_YELLOW },
]
const rollRow = new Map<string, HTMLElement>()
for (const r of ROLLS) {
  const b = document.createElement('button')
  b.id = `btn-roll-${r.paper}`   // 이름을 지킨다(#54) — 팔·문서가 이 이름으로 롤을 부른다
  b.className = 'rrow'
  b.dataset.act = 'cmd'
  b.dataset.paper = r.paper
  b.innerHTML = `${r.svg}<span>${r.name}</span>`
  b.addEventListener('click', () => { setRolltrayOpen(false); addRoll(r.paper) })
  rolltrayEl.append(b)
  rollRow.set(r.paper, b)
}
let rolltrayOpen = false
function setRolltrayOpen(v: boolean) {
  rolltrayOpen = v
  rolltrayEl.classList.toggle('open', v)
  if (v) { closeOtherBoxes('#rolltray'); placeFlyout(rolltrayEl, rollBtn) }
}
rollBtn.addEventListener('click', () => setRolltrayOpen(!rolltrayOpen))
registerBox({
  id: '#rolltray', isOpen: () => rolltrayOpen, close: () => setRolltrayOpen(false),
  zone: () => [rolltrayEl, rollBtn],
})
const syncRolls = () => {
  const done = app.lift.an.constructionDone
  rollBtn.classList.toggle('disabled', !done)
  rollBtn.title = done ? '종이를 한 장 얹는다 — 트레이싱지 · 옐로' : '소실점 작도가 끝나야 얹을 수 있다'
  for (const r of ROLLS) {
    const b = rollRow.get(r.paper)!
    b.classList.toggle('disabled', !done)
    b.title = done ? `${r.name}를 한 장 얹는다` : '소실점 작도가 끝나야 얹을 수 있다'
  }
}
app.listeners.push(syncRolls)
syncRolls()

// ── 손통(web2-44) — 잡은 것을 다루는 손잡이 넷. 문법은 롤통 그대로다(#54 — 새 기제 ⛔).
// 줄은 전부 **명령**이라 누르면 접힌다(R3 · R6 비대상). 잡은 것이 없으면 비활성이고
// 누르면 이유가 보인다(롤통의 2-a 문법). 그림 정본은 docs/instrument-icons.md.
const gripBtn = document.getElementById('btn-grip')!
const griptrayEl = document.getElementById('griptray')!
// ⚠ web2-48 48-10 — 줄마다 `tip`이 있다(28-2의 규칙: 손잡이에는 설명이 붙는다).
const GRIP_ROWS = [
  { key: 'dup', name: '복제', tip: '복제 — 잡은 선을 같은 자리에 하나 더 놓는다', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="15" height="15"/><rect x="12" y="12" width="15" height="15"/></svg>' },
  { key: 'lock', name: '잠금', tip: '잠금 — 잡은 선을 보호한다(안 잡히고 안 지워진다)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="14" width="18" height="13" rx="1.5"/><path d="M11 14 V10 a5 5 0 0 1 10 0 V14"/></svg>' },
  // web2-56 — 접합 끊기(끝단마다 — 조사한 모든 툴에 있다: 어떤 알고리즘도 100%를 못
  // 맞춘다). 벽의 끝단 = 경계 모서리 = 획이라, 잡은 «선»에 거는 토글이다(잠금의 문법).
  { key: 'njoin', name: '접합', tip: '접합 끊기 — 잡은 선(모서리)에서 벽 두께의 접합을 끊는다(끝이 평평해진다) · 다시 누르면 잇는다', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13 H14 M5 19 H14"/><path d="M20 13 H27 M20 19 H27"/><path d="M18 7 l-4 18" stroke-width="1.1"/></svg>' },
  { key: 'join', name: '맺기', tip: '맺기 — 잡은 두 선을 만나게 연장한다', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 26 H23 V9"/><path d="M23 26 l3 3 M23 9 l-3 -3" stroke-width="1.1"/></svg>' },
  { key: 'front', name: '정면', tip: '정면 — 잡은 면을 정면으로 보는 평행 투영으로 간다', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="16" height="16"/><path d="M16 3 v3 M16 26 v3 M3 16 h3 M26 16 h3" stroke-width="1.1"/></svg>' },
  // web2-45 — 면을 잡았을 때의 손잡이 둘(45-2 분류 정정 · 45-4 채움). 그림 정본은
  // docs/instrument-icons.md 「붓(칠 도구)」 절의 줄 둘.
  { key: 'cls', name: '분류', tip: '분류 — 잡은 면의 분류를 돌린다(자동·슬라브·벽·외벽·내벽·경사)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 24 L26 24"/><path d="M16 24 V8 M16 8 l-4 5 M16 8 l4 5" stroke-width="1.2"/></svg>' },
  // web2-55 — 두께: 분류가 든다(일괄) · 재누름 = 이 면만(예외). 값은 손글씨 mm(치수 문법).
  { key: 'thick', name: '두께', tip: '두께 — 숫자를 쓰면 이 분류 전부의 두께(mm)가 된다 · 다시 누르면 이 면만(예외)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6 V26 M24 6 V26" /><path d="M8 16 H24 M8 16 l3 -2 M8 16 l3 2 M24 16 l-3 -2 M24 16 l-3 2" stroke-width="1.1"/></svg>' },
  { key: 'fill', name: '채움', tip: '채움 — 잡은 면의 채움을 돌린다(없음·해칭·단색)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="20" height="16"/><path d="M9 24 L23 8 M6 19 L17 8 M15 24 L26 13" stroke-width="1.1"/></svg>' },
  // web2-46 — 면 재료(벽돌 쌓기 그림). 채움 해칭의 무늬·색이 이 값에서 나온다.
  { key: 'fmat', name: '재료', tip: '재료 — 잡은 면의 재료를 돌린다(채움의 무늬·색을 정한다)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="22" height="14"/><path d="M5 16 H27 M13 9 V16 M20 16 V23" stroke-width="1.1"/></svg>' },
  // web2-49 — 재료 표현(실치수 무늬 · 면 고정 · 보고 있는 쪽에 붙는다). 그림 정본은
  // docs/instrument-icons.md 「손통」 절 — 벽돌 켜 셋 + 어긋난 수직 줄눈(fmat의 한 켜와 갈린다).
  { key: 'rep', name: '표현', tip: '표현 — 잡은 면의 재료를 돌린다(벽돌·석재·목재·타일·기와·콘크리트·유리·금속 — 무늬는 실치수로, 유리·금속은 톤만 · 보고 있는 쪽에 붙는다)', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="22" height="18"/><path d="M5 13 H27 M5 19 H27 M12 7 V13 M20 13 V19 M12 19 V25" stroke-width="1.1"/></svg>' },
  // web2-47 — 잡은 면의 면적(근거 = 잡힌 그 면이 이미 밝다). 축척 미정이면 이유가 뜬다.
  { key: 'farea', name: '면적', tip: '면적 — 잡은 면의 면적. 축척이 없으면 숫자를 안 낸다', svg: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="8" width="20" height="16"/><path d="M10 20 h6 M10 20 v-4" stroke-width="1.1"/></svg>' },
] as const
const gripRow = new Map<string, HTMLButtonElement>()
// web2-66 66-4 — **R3 정정**: 접는 기준은 «명령이냐»가 아니라 «그 뒤에 그 통을 또 쓸 것
// 같은가»다(사람 판정 — 자동찾기의 그 번거로움). 손통에서 «돌리거나 재누름이 뜻을 갖는»
// 여섯은 제 툴팁이 이미 「다시 누르면 …」이라 말한다 — 누른 뒤 통이 닫히면 그 «다시»가
// 통을 다시 여는 일이 된다. 그 여섯은 통을 열어 둔다(한 번 쓰고 마는 명령은 종전대로 접는다).
const GRIP_REPEAT = new Set(['cls', 'thick', 'fill', 'fmat', 'rep', 'njoin'])
for (const r of GRIP_ROWS) {
  const b = document.createElement('button')
  b.id = `btn-grip-${r.key}`
  b.className = 'rrow'
  b.dataset.act = 'cmd'
  b.innerHTML = `${r.svg}<span>${r.name}</span>`
  b.title = r.tip     // 48-10 — 통을 열기 «전»에도 설명이 있다(syncGripRows는 열어야 돈다)
  b.addEventListener('click', () => { if (!GRIP_REPEAT.has(r.key)) setGriptrayOpen(false); doGripAction(r.key) })
  griptrayEl.append(b)
  gripRow.set(r.key, b)
}
let griptrayOpen = false
function setGriptrayOpen(v: boolean) {
  griptrayOpen = v
  griptrayEl.classList.toggle('open', v)
  if (v) { syncGripRows(); closeOtherBoxes('#griptray'); placeFlyout(griptrayEl, gripBtn) }
}
gripBtn.addEventListener('click', () => setGriptrayOpen(!griptrayOpen))
registerBox({
  id: '#griptray', isOpen: () => griptrayOpen, close: () => setGriptrayOpen(false),
  zone: () => [griptrayEl, gripBtn],
})
/** 줄의 활성 조건 — 값으로 판정한다(#54: 실행 함수가 보는 그 상태를 그대로 본다). */
function gripRowGate(key: string): string | null {
  const g = app.grip
  // ⚠ web2-48 48-4 — 문구가 **도구를 안 말했다**. 잡기(누름 진입)는 면·칠·치수·재기·
  // 지우개를 든 채로는 아예 안 걸리는데(`input.ts`의 그 문), 사람은 면을 만든 **직후**
  // (= 면 도구를 든 채) 「정면」을 찾는다 — 그래서 「꾹 눌러 잡으라」를 읽고 눌러도
  // 아무 일이 안 났다. 「손통이 없다」로 읽힌 것의 절반이 이것이다(48-4의 답).
  if (!g || g.ids.length === 0) return '연필·펜을 든 채로 선·면을 꾹 눌러 잡은 뒤에 쓴다(면·칠·치수 도구로는 안 잡힌다)'
  if (key === 'join' && g.ids.length !== 2) return '맺기는 **두 선**을 잡아야 한다'
  if ((key === 'front' || key === 'cls' || key === 'thick' || key === 'fill' || key === 'fmat' || key === 'rep' || key === 'farea') && g.faceId === null) {
    return `${key === 'front' ? '정면' : key === 'cls' ? '분류' : key === 'thick' ? '두께' : key === 'fill' ? '채움' : key === 'fmat' ? '재료' : key === 'rep' ? '표현' : '면적'}은 **면**을 잡아야 한다 — 연필을 든 채로 면 안쪽(경계에서 떨어진 자리)을 꾹 누른다`
  }
  return null
}
function syncGripRows() {
  for (const r of GRIP_ROWS) {
    const why = gripRowGate(r.key)
    const b = gripRow.get(r.key)!
    b.classList.toggle('disabled', why !== null)
    // ⚠ **web2-48 48-10** — 종전에는 `why ?? ''`였다: 쓸 수 있는 줄은 title이 **빈
    // 문자열**이라 툴팁이 안 떴다(뒤집힌 거동 — «못 쓸 때만» 설명이 뜬다). 이제 둘 다
    // 뜬다: 쓸 수 있으면 «무엇을 하는가», 못 쓰면 «왜 못 쓰는가».
    b.title = why ?? r.tip
  }
  gripBtn.classList.toggle('disabled', !app.grip || app.grip.ids.length === 0)
}
app.listeners.push(() => { if (griptrayOpen) syncGripRows() })
function doGripAction(key: string) {
  const why = gripRowGate(key)
  if (why !== null) { notify(why.replace(/\*\*/g, '')); return }
  if (key === 'dup') {
    const n = duplicateGrip(app)
    if (n > 0) status(`${n}개 복제됨 — 잡은 채로 끌어 자리를 준다`)
  } else if (key === 'lock') {
    const n = lockGrip(app)
    if (n > 0) notify(`${n}개 잠금 — 꾹 누르면 「해제」가 뜬다`)
  } else if (key === 'njoin') {
    // web2-56 — 접합 끊기 토글. 값 배선은 state.njGrip 하나(#54 — diag의 setNjForTest도
    // 같은 문서 필드를 지난다).
    const r = njGrip(app)
    if (r.n > 0) notify(r.on ? `${r.n}개 접합 끊음 — 그 모서리의 끝이 평평해진다(다시 누르면 잇는다)` : `${r.n}개 접합 이음`)
    else status('바뀐 것이 없다')
  } else if (key === 'join') {
    const r = joinGrip(app)
    if (r.ok) {
      if (r.changed === 0) notify('이미 만나 있다 — 연장할 것이 없다')
      // 맺어졌으면 화면이 말한다(4-b) — 알림 없음
    } else if (r.why === 'parallel') notify('평행한 두 선은 만나지 않는다')
    else if (r.why === 'skew') notify('같은 평면이 아니다 — 꼬인 위치라 맺을 수 없다')
    else if (r.why === 'dim') notify('치수가 길이를 쥐고 있다 — 치수를 지우면 맺는다')
    else if (r.why === 'notLifted') notify('아직 3D로 올라가지 않은 선이다')
  } else if (key === 'front') {
    // web2-54 54-3 — 왕복이 됐다: 한 번은 정면, 다시 누르면 직전 시점으로(발판은 state).
    const r = frontFlyTarget(app)
    if (!r) { notify('정면은 면을 잡아야 한다'); return }
    autolevel.glide(r.to)   // 42와 같은 길로 보간한다(즉시 튀면 어디로 갔는지 잃는다)
    status(r.back ? '직전 시점으로 돌아간다' : '정면 — 다시 누르면 직전 시점으로 돌아온다')
    syncPainttray()
  } else if (key === 'thick') {
    // web2-55 — 두께: 글씨 상태에 «두께 모드»를 켠다(값 배선은 applyRecognized의 thick
    // 갈래 — 조작 값(manip)의 문법 그대로 #54). 재누름이 일괄 ↔ 예외(이 면만)를 오간다.
    const w = app.write
    if (!w) { notify('두께는 면을 잡은 채로 쓴다 — 연필로 면 안쪽을 꾹 누른 뒤'); return }
    const fid = app.grip!.faceId!
    const info = faceThicknessNow(app, fid)
    const clsName = info === null ? '' : info.cls === 'slab' ? '슬라브' : info.cls === 'wall' ? '벽'
      : info.cls === 'extw' ? '외벽' : info.cls === 'intw' ? '내벽' : '경사'
    if (w.thick === 1) {
      w.thickEx = w.thickEx === 1 ? undefined : 1
    } else {
      w.thick = 1
      w.thickEx = undefined
    }
    w.thickOp = undefined      // 모드가 바뀌면 새 op다(일괄과 예외는 다른 대상)
    const cur = info === null ? '' : ` · 지금 ${info.t}mm${info.ex ? '(예외)' : ''}`
    // 축척 미정(1차 [11]) — 값은 실리되 화면에 안 그려진다: 조용한 무동작이 안 되게 말한다
    const noScale = app.lift.mmPerUnit === null ? ' ⚠ 축척이 아직 없다 — 치수를 하나 매기면 두께가 그려진다(값은 남는다)' : ''
    status((w.thickEx === 1
      ? `두께(예외) — 숫자를 쓰면 **이 면만** 그 두께가 된다${cur} · 다시 누르면 일괄로`
      : `두께 — 숫자를 쓰면 ${clsName} 분류 **전부**의 두께(mm)가 된다${cur} · 다시 누르면 이 면만`) + noScale)
  } else if (key === 'cls') {
    // 분류 정정(45-2) — 자동은 틀리므로 사람이 돌린다: 자동 → 슬라브 → 벽 → 경사 → 자동
    const r = cycleFaceClass(app, app.grip!.faceId!)
    if (r) {
      const name = r.cls === 'slab' ? '슬라브' : r.cls === 'wall' ? '벽' : r.cls === 'extw' ? '외벽' : r.cls === 'intw' ? '내벽' : '경사'
      status(`분류 — ${name}${r.auto ? ' (자동)' : ''} · 다시 누르면 돌린다`)
    }
  } else if (key === 'fill') {
    // 채움 순환(45-4 → web2-48 48-3): 없음 → 해칭 → **단색** → 없음.
    const v = cycleFaceFill(app, app.grip!.faceId!)
    status(v === undefined ? '채움을 걷었다'
      : `채움 — ${FILL_NAMES[v]}이 얹혔다(면의 성질이다 — 경계를 따라간다) · 다시 누르면 돈다`)
  } else if (key === 'farea') {
    // 47-3 — 근거는 잡힌 면 그 자체(잡기 표시가 밝힘이다). 축척 미정이면 숫자를 안 낸다(#61).
    const r = gripFaceArea(app)
    if (r === null) { notify('축척이 아직 없다 — 치수를 하나 매기면 면적이 선다'); return }
    status(`이 면 ${r.m2.toFixed(2)} m² — 잡힌 면(밝음)이 그 근거다`)
  } else if (key === 'fmat') {
    // 면 재료(web2-46) — 없음→벽돌→…→금속→없음. 채움이 꺼져 있으면 무늬가 안 보이므로
    // 그 사실을 함께 말한다(값은 저장된다 — 조용히 사라지지 않는다).
    const r = cycleFaceMat(app, app.grip!.faceId!)
    if (r) {
      const face = app.doc.faces.find(f => f.id === app.grip!.faceId)
      status(`재료 — ${r.name}${face?.fill === 1 ? '' : ' (채움을 «해칭»으로 켜면 무늬가 보인다)'} · 다시 누르면 돌린다`)
    }
  } else if (key === 'rep') {
    // 재료 표현(web2-49) — 없음→벽돌→…→콘크리트→없음. 실치수 무늬라 **축척이 있어야
    // 보인다**(값은 저장되고 표시만 기다린다 — 조용히 사라지지 않는다).
    const r = cycleFaceRep(app, app.grip!.faceId!)
    if (r === null) { notify('아직 3D로 풀리지 않은 면이다 — 표현을 붙일 쪽을 잴 수 없다'); return }
    const noScale = app.lift.mmPerUnit === null
    status(`표현 — ${r.name}(보고 있는 쪽에 붙는다)${noScale ? ' · 치수를 하나 매기면 나타난다(실치수 무늬다)' : ''} · 다시 누르면 돌린다`)
  }
  invalidate()
}
// ── 칠 패널(web2-64 §2) — **칠 도구를 든 «동안» 항상 뜬다.** 놓으면 사라진다. ─────────────────
//
// 사람 지적(2026-09-04): 「버튼·도구의 트리 구조가 복잡하고 직관적이지 않다 … 자꾸 뭘 펼쳐야 하는가? 선택된 브러시는 항상
// 떠 있고, 그걸 누르면 다른 걸 선택할 수 있다. 포토샵을 보면 한 화면에 브러시 형태·색상·투명도·크기를 한 번에 설정한다.」
//
// **R8의 정정**(지시 64 §2 — DECISIONS 「R8은 «지금 하는 일»에는 안 걸린다」): R8(늘 보이는 것은 잠깐 얹히는 것보다 약하다)은
// «경쟁하는 것들» 사이의 규칙이다. 칠 도구를 든 동안 칠 설정은 곧 그 일이라 항상 보인다 — 작도 중에는 없다.
//
// 규칙 넷(지시): ① 지금 브러시는 항상 보인다 — 자국 견본으로 ② 펼치는 것은 둘뿐 — «브러시 목록»·«색상 휠», 그 둘도 한 단계
// ③ 색상 프리셋은 없다(64-7이 견본 줄 여덟·프리셋 세 칸을 지웠다) ④ 「브러시 고르개」 → 「브러시」.
// ⛳ 게이트 ②: 칠의 어떤 설정(브러시·크기·불투명·색)에도 «두 번 펼쳐서» 닿지 않는다 — paint64 ②가 elementFromPoint로 센다(#87).
//
// 구조(위에서 아래): [지금 브러시 견본 + 이름 · 누르면 «브러시» 목록] / 크기 슬라이더 + 값 / 불투명 슬라이더 + 값 /
//   [색 원 · 누르면 색상 휠] + 최근 색 여섯 / [즐겨찾기 여섯 — 옛 «도구 넷»의 자리 · 브러시 바로가기] / 정면(54-3 그대로).
// 자리: placeFlyout(붓 단추 곁 — 46부터의 자리 · R2 리본 길이 불변). ⚠ 통 등록부(registerBox)에는 **안 든다** — 잠깐 얹히는 통이
// 아니라 «도구의 화면»이다(R7의 바깥 누름으로 안 접힌다 · 도구를 놓아야 사라진다). 브러시 목록·색상 휠은 통이다(등록 · 한 단계).
// #97: 견본 캔버스는 position:static 명시 · 줄은 flex-shrink:0(index.html #painttray > *).
const painttrayEl = document.getElementById('painttray')!
/** 슬롯(성질의 족)의 그림·이름 — 즐겨찾기 칸이 쓴다(옛 도구 넷의 그 그림 · docs/instrument-icons.md) */
const SLOT_SVG: Record<Instr, string> = {
  brush: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3 V14"/><path d="M12.5 14 h7 v4 h-7 z"/><path d="M12.5 18 C12.5 23 11.5 25.5 10.5 27.5 C13.5 26.6 18.5 26.6 21.5 27.5 C20.5 25.5 19.5 23 19.5 18 Z"/></svg>',
  marker: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="4" width="8" height="15" rx="1"/><path d="M13.5 19 L13 24 L17 28 L18.5 19"/></svg>',
  cp: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4 h6 v16 l-3 8 l-3 -8 z"/><path d="M14.2 21.5 l1.1 3 M16.9 21.5 l-1.1 3" stroke-width="1.0"/></svg>',
  pencil: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 24 L24 12 l-4 -4 L8 20 l-1 5 z"/><path d="M18 10 l4 4"/></svg>',
}
const SLOT_NAME: Record<Instr, string> = { brush: '잉크펜', marker: '마커', cp: '색연필', pencil: '연필' }
/** 브러시 id → **사람이 읽는 이름**(web2-65 §2 ③ — `ramon/100%_Opaque`가 아니라 「불투명 마커」).
 *  원 이름은 안 없어진다: 부제(#paint-brush-name의 둘째 줄)와 도움말이 그대로 든다(core/brushnames 규칙 ①). */
const brushShort = brushLabel

// ── 색상 휠(48-7) — 기하·색 변환은 `core/colorwheel.ts`가 든다(이 파일은 DOM만) ──
// 64: 휠은 **색 원을 누르면 얹히는 통**(#paint-wheelbox)에 산다 — 한 단계.
// web2-67 0-3·0-4 — 크기 136 → **244px**(사람 판정 「연속된 스펙트럼이 아니라 점군이라
// 선택폭이 적다 · 화면을 가린다」): 패널 폭(260 − 패딩 12)을 꽉 채우는 값이다. 실측:
// 고리 두께 32px · 채도·명도 판 한 변 124px(종전 67px — 손가락 표적 대역 위). 자리는
// 옆 펼침이 아니라 **패널 안 세로**(0-4)라 커져도 캔버스를 더 가리지 않는다(폭 260 불변).
const WHEEL: WheelGeom = { cx: 122, cy: 122, rOut: 120, rIn: 88 }
const wheelCv = document.createElement('canvas')
const wheelHex = document.createElement('span')

// web2-67 0-3 반증(D-3) — 옛 «2px 점군» 판을 되살린다(켜면 서로 다른 색 수가 대략
// (변/2)² 대역으로 떨어져야 한다 — 그래야 연속 게이트가 실제로 무언가를 잰다).
let wheelStepForTest = 0
function setWheelStepForTest(v: number) { wheelStepForTest = v; drawWheel(wheelHsv()) }

/** 휠을 굽는다 — 고리(색상)와 안쪽 판(채도·명도). 판은 **지금 색상**의 함수라 색상이
 *  바뀔 때마다 다시 굽는다(고리는 안 바뀌지만 한 번에 그리는 편이 단순하다 — A-3).
 *  ⚠ `Math.random` ⛔ — 여기 난수가 아예 없다(그라디언트·호).
 *  web2-67 0-3 — 판은 **그라디언트 둘 겹치기**다(점군 ⛔): 바탕 = 순색(h·s1·v1) ·
 *  가로 = 흰 → 투명(왼쪽이 s0) · 세로 = 투명 → 검정(아래가 v0). 픽셀 (x,y)의 값이
 *  정확히 HSV(h, x/w, 1−y/h)다 — svAt·svPoint의 사상과 같은 식(#54). */
function drawWheel(hsv: Hsv) {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  const S = WHEEL.rOut * 2 + 4
  if (wheelCv.width !== Math.round(S * dpr)) {
    wheelCv.width = Math.round(S * dpr); wheelCv.height = Math.round(S * dpr)
    wheelCv.style.width = `${S}px`; wheelCv.style.height = `${S}px`
  }
  const g = wheelCv.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, S, S)
  for (let a = 0; a < 360; a++) {
    g.beginPath()
    g.fillStyle = hexOfHsv({ h: a, s: 1, v: 1 })
    const t0 = (a - 90) * Math.PI / 180, t1 = (a + 1.2 - 90) * Math.PI / 180
    g.arc(WHEEL.cx, WHEEL.cy, WHEEL.rOut, t0, t1)
    g.arc(WHEEL.cx, WHEEL.cy, WHEEL.rIn, t1, t0, true)
    g.closePath(); g.fill()
  }
  const rc = svRect(WHEEL)
  if (wheelStepForTest > 0) {
    // 반증 판은 정수 정렬로 굽는다 — 소수점 자리의 AA가 칸 경계마다 «중간색»을 만들어
    // 색 수를 부풀리면(실측 11,135 — 연속판과 구분 불능) 이 반증은 아무것도 안 잰다(D-3).
    const step = wheelStepForTest
    const bx = Math.round(rc.x), by = Math.round(rc.y)
    for (let y = 0; y < rc.h; y += step) {
      for (let x = 0; x < rc.w; x += step) {
        g.fillStyle = hexOfHsv({ h: hsv.h, s: x / rc.w, v: 1 - y / rc.h })
        g.fillRect(bx + x, by + y, step, step)
      }
    }
  } else {
    g.fillStyle = hexOfHsv({ h: hsv.h, s: 1, v: 1 })
    g.fillRect(rc.x, rc.y, rc.w, rc.h)
    const gx = g.createLinearGradient(rc.x, 0, rc.x + rc.w, 0)
    gx.addColorStop(0, 'rgba(255,255,255,1)')
    gx.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gx
    g.fillRect(rc.x, rc.y, rc.w, rc.h)
    const gy = g.createLinearGradient(0, rc.y, 0, rc.y + rc.h)
    gy.addColorStop(0, 'rgba(0,0,0,0)')
    gy.addColorStop(1, 'rgba(0,0,0,1)')
    g.fillStyle = gy
    g.fillRect(rc.x, rc.y, rc.w, rc.h)
  }
  const hex = hexOfHsv(hsv)
  const ring = huePoint(WHEEL, hsv.h)
  const sv = svPoint(WHEEL, hsv)
  for (const [p, r] of [[ring, 7], [sv, 8]] as [{ x: number; y: number }, number][]) {
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2)
    g.lineWidth = 2; g.strokeStyle = markerInk(hex); g.stroke()
    g.beginPath(); g.arc(p.x, p.y, r + 1.6, 0, Math.PI * 2)
    g.lineWidth = 1; g.strokeStyle = markerInk(hex) === '#000000' ? '#ffffff' : '#000000'; g.stroke()
  }
}

/** 지금 색을 HSV로 — 상태의 정본은 `app.paintSel.hex` 하나다(#54). 휠은 그것을 그린다. */
const wheelHsv = (): Hsv => hsvOf(app.paintSel.hex) ?? { h: 0, s: 0, v: 0.5 }

// ── 최근 색 여섯(64 — 견본 줄 여덟의 자리) · 기기 저장 ────────────────────────────
const RECENT_KEY = 'b2.paintRecent64.v1'
const RECENT_N = 6
const readRecent = (): string[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(arr) ? arr.filter((h): h is string => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h)).slice(0, RECENT_N) : []
  } catch { return [] }
}
const pushRecent = (hex: string): void => {
  const list = [hex, ...readRecent().filter(h => h !== hex)].slice(0, RECENT_N)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* 사생활 모드 */ }
}

function setPaintHex(hex: string, why: string) {
  app.paintSel.hex = hex
  app.paintErase = false           // web2-67 0-6 — 색을 골랐다 = 칠할 뜻이다(지우개를 놓는다)
  // 64: 잉크펜도 색을 쓴다 — 슬롯을 안 바꾼다(48의 «색을 골랐다 = 마커» 규약은 걷었다)
  if (app.tool !== 'paint') setTool('paint')
  pushRecent(hex)
  syncPainttray()
  status(`${hex} — ${SLOT_NAME[app.paintSel.i]}${why}`)
}

// ── 즐겨찾기 여섯(64 — 옛 «도구 넷»의 자리 · 슬롯의 새 이름) · 기기 저장 ───────────────
// 칸 = {슬롯 i, 브러시 br} + **칠 사양 한 벌 {색 hex, 크기 w, 불투명 o}**(web2-66 66-3 — 사람 판정
// 「사양값을 모든 칠 도구들이 공유하는 문제 — 도구별로 따로 저장되어 있어야지」).
// 탭 = 그 칸의 브러시 «와 사양»으로 · 길게 누름(WRITE_HOLD_MS) = 지금 것 전부를 그 칸에 놔둔다.
// 그리고 **지금 브러시가 어느 칸과 같으면, 색·크기·불투명을 고칠 때마다 그 칸이 따라 기억한다**
// (프로크리에이트가 브러시마다 크기를 기억하는 그것 — syncPaintPanel의 adopt 줄). 저장은 기기
// (localStorage — 52 프리셋의 그 자리)이고 **문서 저장 형식은 안 바뀐다**(KEY_ORDER 무변 — 게이트).
// 64-1로 획이 br을 저장하므로 칸의 브러시를 바꿔도 옛 획은 안 변한다(게이트 ①).
const FAV_KEY = 'b2.brushFavs64.v1'                      // 같은 열쇠 — 새 밭(hex·w·o)은 선택이라 옛 저장이 그대로 읽힌다
const FAV_N = 6
type Fav = { i: Instr; br: string; hex?: string; w?: number; o?: number }
/** 기본 여섯 — 슬롯 넷의 기본 브러시(DEFAULT_BRUSH — AS-C186) + 목탄(연필 족) + 수채(잉크펜 족 · 흰 판에서도 그려지는 것) */
const FAV_DEFAULT: Fav[] = [
  { i: 'pencil', br: DEFAULT_BRUSH.pencil }, { i: 'brush', br: DEFAULT_BRUSH.brush }, { i: 'marker', br: DEFAULT_BRUSH.marker },
  { i: 'cp', br: DEFAULT_BRUSH.cp }, { i: 'pencil', br: 'classic/charcoal' }, { i: 'brush', br: 'deevad/watercolor_expressive' },
]
const isInstr = (v: unknown): v is Instr => v === 'brush' || v === 'marker' || v === 'cp' || v === 'pencil'
const readFavs = (): Fav[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(FAV_KEY) ?? 'null') as unknown
    if (!Array.isArray(arr)) return FAV_DEFAULT.map(f => ({ ...f }))
    return FAV_DEFAULT.map((d, k) => {
      const v = arr[k] as Partial<Fav> | undefined
      if (!(v && isInstr(v.i) && typeof v.br === 'string' && v.br.includes('/'))) return { ...d }
      const out: Fav = { i: v.i, br: v.br }
      if (typeof v.hex === 'string' && /^#[0-9a-f]{6}$/i.test(v.hex)) out.hex = v.hex
      if (typeof v.w === 'number' && Number.isFinite(v.w) && v.w > 0) out.w = v.w
      if (typeof v.o === 'number' && Number.isFinite(v.o) && v.o > 0 && v.o <= 1) out.o = v.o
      return out
    })
  } catch { return FAV_DEFAULT.map(f => ({ ...f })) }
}
const writeFavs = (fs: Fav[]): void => { try { localStorage.setItem(FAV_KEY, JSON.stringify(fs)) } catch { /* 세션 한정 */ } }

/** 크기 슬라이더 줄의 동기화(58-1) — 도구가 바뀌면 max·값이 따라온다(아래 블록이 채운다) */
let syncPaintSizeRow: () => void = () => {}
let syncPaintPanel: () => void = () => {}
let closePaintWheel: () => void = () => {}
// web2-67 0-1 — 상한 표식(옛 «한 붓마다 토스트»의 자리): frame이 켜고 끈다.
let clampDotEl: HTMLElement | null = null

{
  // ── ① 지금 브러시 — 견본 + 이름. 누르면 «브러시» 목록(한 단계 · brushpick) ──────────────
  const brushBtn = document.createElement('button')
  brushBtn.id = 'paint-brush-btn'
  brushBtn.className = 'rrow'
  brushBtn.dataset.act = 'state'
  brushBtn.title = '지금 브러시 — 누르면 브러시 목록이 열린다(196 + 앱 · 분류별 · 견본 실물)'
  const sampleCv = document.createElement('canvas')
  sampleCv.id = 'paint-brush-sample'
  const SAMPLE_W = 120, SAMPLE_H = 26      // 65 §2 ④ — 이름 자리를 준다(150이면 부제가 잘렸다)
  sampleCv.width = SAMPLE_W * 2; sampleCv.height = SAMPLE_H * 2
  sampleCv.style.cssText = `width:${SAMPLE_W}px;height:${SAMPLE_H}px;position:static;inset:auto;flex-shrink:0;border:1px solid #d8d2c4;border-radius:3px;background:#fffdf8`
  const brushName = document.createElement('span')
  brushName.id = 'paint-brush-name'
  brushName.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;overflow:hidden;text-overflow:ellipsis'
  brushBtn.append(sampleCv, brushName)
  brushBtn.addEventListener('click', () => { brushPicker.setOpen(!brushPicker.isOpen()) })
  painttrayEl.append(brushBtn)

  // ── ② 크기 **슬라이더**(web2-58 58-1) — 값이 숫자로 같이 보인다 ────────────────────
  // R1의 오적용 철회(58 · DECISIONS): 칠 도구의 크기는 이산이 아니다. 최대는 도구별 사람 값(C.PAINT58_MAX_W).
  const sizeWrap = document.createElement('label')
  sizeWrap.id = 'paint-sizes'
  sizeWrap.className = 'rrow prow'
  sizeWrap.title = '자국 굵기 — 슬롯별 최대: 잉크펜 500 · 마커 100 · 색연필 50 · 연필 50'
  const sizeLbl = document.createElement('span'); sizeLbl.className = 'prow-name'; sizeLbl.textContent = '크기'
  const sizeRange = document.createElement('input')
  sizeRange.type = 'range'
  sizeRange.id = 'paint-size-range'
  sizeRange.min = String(C.PAINT58_MIN_W)
  sizeRange.step = '0.5'
  sizeRange.style.width = '96px'
  sizeRange.style.flexShrink = '0'                     // #97
  sizeRange.title = '자국 굵기(px) — 끌어서 조절한다'
  const sizeVal = document.createElement('span')
  sizeVal.id = 'paint-size-val'
  sizeVal.style.minWidth = '38px'
  // web2-67 0-6 — 크기 줄은 «지금 든 것»의 크기다: 지우개가 켜져 있으면 지우개(최대 = 붓과
  // 같다 — 지시 문면 · 58의 규칙 그대로), 아니면 지금 슬롯. 같은 슬라이더 하나다(#54).
  const paintMaxW = (): number => (app.paintErase ? C.PAINT58_MAX_W.brush : C.PAINT58_MAX_W[app.paintSel.i])
  const sizeNow = (): number => (app.paintErase ? app.eraseSel.w : app.paintSel.w)
  const setSizeNow = (v: number): void => { if (app.paintErase) app.eraseSel.w = v; else app.paintSel.w = v }
  const syncSizeRow = syncPaintSizeRow = () => {
    const max = paintMaxW()
    sizeRange.max = String(max)
    if (sizeNow() > max) setSizeNow(max)
    if (Number(sizeRange.value) !== sizeNow()) sizeRange.value = String(sizeNow())
    sizeVal.textContent = `${sizeNow()}px`
  }
  sizeRange.addEventListener('input', () => {
    setSizeNow(Math.min(paintMaxW(), Math.max(C.PAINT58_MIN_W, Number(sizeRange.value) || C.PAINT58_MIN_W)))
    if (app.tool !== 'paint') setTool('paint')
    syncPaintPanel()                                     // 66-3 — 같은 브러시의 칸이 크기를 따라 기억한다(adopt)
  })
  sizeRange.addEventListener('change', () => status(`${app.paintErase ? '지우개' : '자국'} 굵기 ${sizeNow()}px`))
  sizeWrap.append(sizeLbl, sizeRange, sizeVal)
  painttrayEl.append(sizeWrap)
  syncSizeRow()

  // ── ③ 불투명 슬라이더(64 — 새 축 · 획이 o를 든다 · 52-3의 «불투명 손잡이 없음» 유보가 여기서 닫힌다) ────
  const opWrap = document.createElement('label')
  opWrap.id = 'paint-opacity'
  opWrap.className = 'rrow prow'
  opWrap.title = '불투명 — 획의 불투명(0.05~1). 브러시 자체의 불투명에 곱한다'
  const opLbl = document.createElement('span'); opLbl.className = 'prow-name'; opLbl.textContent = '불투명'
  const opRange = document.createElement('input')
  opRange.type = 'range'
  opRange.id = 'paint-opacity-range'
  opRange.min = '0.05'; opRange.max = '1'; opRange.step = '0.05'
  opRange.style.width = '96px'
  opRange.style.flexShrink = '0'
  opRange.title = '불투명 — 끌어서 조절한다'
  const opVal = document.createElement('span')
  opVal.id = 'paint-opacity-val'
  opVal.style.minWidth = '38px'
  const syncOpRow = () => {
    if (Number(opRange.value) !== app.paintSel.o) opRange.value = String(app.paintSel.o)
    opVal.textContent = app.paintSel.o.toFixed(2)
  }
  opRange.addEventListener('input', () => {
    app.paintSel.o = Math.min(1, Math.max(0.05, Math.round(Number(opRange.value) * 100) / 100))
    if (app.tool !== 'paint') setTool('paint')
    syncPaintPanel()                                     // 66-3 — 같은 브러시의 칸이 불투명을 따라 기억한다(adopt)
  })
  opRange.addEventListener('change', () => status(`불투명 ${app.paintSel.o.toFixed(2)}`))
  opWrap.append(opLbl, opRange, opVal)
  painttrayEl.append(opWrap)
  syncOpRow()

  // ── ④ 색 원(누르면 색상 휠 — 한 단계) + 최근 색 여섯 ──────────────────────────────
  const colorRow = document.createElement('div')
  colorRow.id = 'paint-color'
  colorRow.className = 'rrow prow'
  const colorBtn = document.createElement('button')
  colorBtn.id = 'paint-color-btn'
  colorBtn.className = 'colordot'
  colorBtn.dataset.act = 'state'
  colorBtn.title = '지금 색 — 누르면 색상 휠이 열린다'
  const recentWrap = document.createElement('div')
  recentWrap.id = 'paint-recent'
  recentWrap.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0'
  const recentBtns: HTMLButtonElement[] = []
  for (let k = 0; k < RECENT_N; k++) {
    const b = document.createElement('button')
    b.id = `paint-recent-${k + 1}`
    b.className = 'swatch'
    b.dataset.act = 'state'
    b.title = '최근 색 — 비어 있다(색을 고르면 여기 남는다)'
    b.addEventListener('click', () => { const h = b.dataset.hex; if (h) setPaintHex(h, ' — 최근 색') })
    recentBtns.push(b)
    recentWrap.append(b)
  }
  colorRow.append(colorBtn, recentWrap)
  painttrayEl.append(colorRow)
  // 색상 휠 통(등록 — R7 · 한 단계)
  // web2-67 0-4 — 옆 펼침이 아니라 **패널 안 세로**로 열린다(사람 판정 「옆으로 펼쳐져서
  // 화면을 가리는 느낌」): 색 원 줄 바로 아래 행이다. 열려도 캔버스를 가리는 폭은 패널
  // 폭(260) 그대로다. 툴팁 없음(사람 판정 「툴팁 필요없다」 — paint48 ⑦ 목록에서도 뺐다).
  const wheelBox = document.createElement('div')
  wheelBox.id = 'paint-wheelbox'
  wheelBox.className = 'rrow prow'
  wheelBox.hidden = true
  wheelCv.id = 'paint-wheel-cv'
  wheelHex.id = 'paint-hex'
  wheelHex.className = 'prow-name'
  wheelBox.append(wheelCv, wheelHex)
  painttrayEl.append(wheelBox)
  let wheelOpen = false
  const setWheelOpen = (v: boolean) => {
    wheelOpen = v
    wheelBox.hidden = !v
    if (v) {
      drawWheel(wheelHsv()); wheelHex.textContent = app.paintSel.hex
      closeOtherBoxes('#paint-wheelbox')
    }
    placeLeftPanel(painttrayEl)                 // 높이가 바뀌었다 — 세로 가운데를 다시 잡는다
  }
  closePaintWheel = () => setWheelOpen(false)
  colorBtn.addEventListener('click', () => setWheelOpen(!wheelOpen))
  registerBox({ id: '#paint-wheelbox', isOpen: () => wheelOpen, close: () => setWheelOpen(false), zone: () => [wheelBox, colorBtn] })
  // web2-67 0-2 반증(D-3) — 잠금 끔: 이동마다 partAt을 다시 계산한다(옛 거동 — 사각 코너에서
  // 링으로 넘어가면 색상이 튄다). 제품 경로는 항상 잠금이다.
  const wheelPick = (e: PointerEvent) => {
    const r = wheelCv.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    // web2-67 0-2 — **누른 영역을 떼기 전까지 잠근다**(사람 판정 「코너를 터치하려 하면
    // 자꾸 링으로 터치가 넘어가 색이 바뀐다」): 끌리는 동안의 판정은 누를 때의 영역
    // (wheelDrag)이고 좌표는 그 영역 안으로 접힌다 — 사각 밖은 가장자리 값(svAt이 접는다) ·
    // 링 밖은 각도 값(hueAt은 어디서나 각도다).
    const part = wheelDrag && !wheelLockOff ? wheelDrag : partAt(WHEEL, x, y)
    if (!part) return
    const cur = wheelHsv()
    const next: Hsv = part === 'ring'
      ? { ...cur, h: hueAt(WHEEL, x, y), s: cur.s || 1, v: cur.v || 1 }
      : { h: cur.h, ...svAt(WHEEL, x, y) }
    app.paintSel.hex = hexOfHsv(next)
    app.paintErase = false         // web2-67 0-6 — 색을 골랐다 = 칠할 뜻(setPaintHex와 같은 규약)
    if (app.tool !== 'paint') setTool('paint')
    drawWheel(next); wheelHex.textContent = app.paintSel.hex
    syncPaintPanel()
    e.preventDefault()
  }
  wheelCv.addEventListener('pointerdown', e => {
    wheelCv.setPointerCapture(e.pointerId)
    wheelDrag = partAt(WHEEL, e.offsetX, e.offsetY)
    wheelPick(e)
  })
  wheelCv.addEventListener('pointermove', e => { if (wheelDrag) wheelPick(e) })
  const wheelDone = () => { if (wheelDrag) { wheelDrag = null; pushRecent(app.paintSel.hex); syncPainttray(); status(`${app.paintSel.hex} — 색상 휠`) } }
  wheelCv.addEventListener('pointerup', wheelDone)
  wheelCv.addEventListener('pointercancel', wheelDone)

  // ── ⑤ 즐겨찾기 여섯 — 옛 «도구 넷»의 자리 ───────────────────────────────────────
  const favWrap = document.createElement('div')
  favWrap.id = 'paint-favs'
  favWrap.className = 'rrow prow'
  const favBtns: HTMLButtonElement[] = []
  const favCv: HTMLCanvasElement[] = []
  const favKey: string[] = []
  const FAV_W = 72, FAV_H = 18
  for (let k = 0; k < FAV_N; k++) {
    const b = document.createElement('button')
    b.id = `paint-fav-${k + 1}`
    b.className = 'favbtn'
    b.dataset.act = 'state'
    b.title = `즐겨찾기 ${k + 1} — 누르면 지금 브러시로 · 길게 누르면 지금 브러시를 여기 놔둔다(이 기기)`   // 48-10: 패널이 뜨기 전에도 설명이 있다(동기화가 값을 채운다)
    // 자국 견본(65 §2 ②) — #97: position:static 명시 · flex-shrink 0
    const fcv = document.createElement('canvas')
    fcv.id = `paint-fav-${k + 1}-sample`
    fcv.width = FAV_W * 2; fcv.height = FAV_H * 2
    fcv.style.cssText = `width:${FAV_W}px;height:${FAV_H}px;position:static;inset:auto;flex-shrink:0;border-radius:2px;background:#fffdf8;pointer-events:none`
    const fnm = document.createElement('span')
    fnm.className = 'favname'
    b.append(fcv, fnm)
    favCv.push(fcv)
    favKey.push('')
    let holdT: number | null = null
    let held = false
    b.addEventListener('pointerdown', () => {
      held = false
      holdT = window.setTimeout(() => {
        held = true
        const fs = readFavs()
        // 66-3 — 브러시만이 아니라 **칠 사양 한 벌**(색·크기·불투명)이 같이 남는다
        fs[k] = { i: app.paintSel.i, br: app.paintSel.br, hex: app.paintSel.hex, w: app.paintSel.w, o: app.paintSel.o }
        writeFavs(fs)
        syncPainttray()
        status(`즐겨찾기 ${k + 1} ← ${SLOT_NAME[app.paintSel.i]} · ${brushShort(app.paintSel.br)} · ${app.paintSel.hex} · ${app.paintSel.w}px(이 기기에 남는다 · 옛 획은 안 변한다)`)
      }, C.WRITE_HOLD_MS)
    })
    const cancelHold = () => { if (holdT !== null) { clearTimeout(holdT); holdT = null } }
    b.addEventListener('pointerup', cancelHold)
    b.addEventListener('pointerleave', cancelHold)
    b.addEventListener('click', () => {
      if (held) return                                   // 저장 직후의 click은 적용이 아니다
      const f = readFavs()[k]!
      pickBrush(f.i, f.br)
      // 66-3 — 그 칸이 기억하던 사양이 «같이» 온다(칸에 아직 없으면 지금 값 그대로 —
      // 그 순간부터 이 칸이 지금 값을 기억하기 시작한다 · syncPaintPanel의 adopt 줄)
      if (f.hex) app.paintSel.hex = f.hex
      if (f.w !== undefined) app.paintSel.w = Math.min(C.PAINT58_MAX_W[f.i], Math.max(C.PAINT58_MIN_W, f.w))
      if (f.o !== undefined) app.paintSel.o = Math.min(1, Math.max(0.05, f.o))
      if (app.tool !== 'paint') setTool('paint')
      syncPainttray()
      status(`${SLOT_NAME[f.i]} · ${brushShort(f.br)}${f.hex ? ` · ${f.hex}` : ''}${f.w !== undefined ? ` · ${f.w}px` : ''} — 즐겨찾기 ${k + 1}`)
    })
    favBtns.push(b)
    favWrap.append(b)
  }
  painttrayEl.append(favWrap)

  // ── ⑤′ **지우개 고정 칸**(web2-67 0-6) — 즐겨찾기 옆: 즐겨찾기가 아니라 «언제나 있는 것»이다
  //    (선 그리기의 지우개 둘이 트레이 밖 고정인 것과 같은 규약). 지우개도 «펜»이다 — 손가락은
  //    고르기(§1)라 여기 안 닿는다. ⚠ 68(필통)이 이 칸의 «자리»를 다시 볼 수 있다(지시 문면).
  {
    const row = document.createElement('div')
    row.id = 'paint-erase-row'
    row.className = 'rrow prow'
    const b = document.createElement('button')
    b.id = 'paint-erase'
    b.className = 'rrow'
    b.dataset.act = 'state'
    b.title = '지우개 — 펜 한 붓이 칠의 덮임을 지운다 · 다시 누르면 붓으로 · 스타일러스 뒷꼭지도 지우개다'
    b.innerHTML = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 25 L5.5 17.5 L17.5 5.5 L25 13 Z"/><path d="M9.2 21.2 L13.7 25.7"/><path d="M5 27 h13" stroke-width="1.1"/></svg><span id="paint-erase-lbl">지우개</span>'
    b.addEventListener('click', () => {
      app.paintErase = !app.paintErase
      if (app.tool !== 'paint') setTool('paint')
      syncPainttray()
      status(app.paintErase
        ? `지우개 — ${app.eraseSel.soft ? '부드러운' : '딱딱한'} · ${app.eraseSel.w}px · 다시 누르면 붓으로`
        : '붓으로 돌아왔다')
    })
    const soft = document.createElement('button')
    soft.id = 'paint-erase-soft'
    soft.className = 'rrow'
    soft.dataset.act = 'state'
    soft.title = '지우개의 부드러움 — 경도 축 하나: 딱딱한(기본 — 마른 매체) / 부드러운'
    soft.addEventListener('click', () => {
      app.eraseSel.soft = !app.eraseSel.soft
      if (!app.paintErase) { app.paintErase = true; if (app.tool !== 'paint') setTool('paint') }
      syncPainttray()
      status(`지우개 — ${app.eraseSel.soft ? '부드러운' : '딱딱한'}`)
    })
    row.append(b, soft)
    painttrayEl.append(row)
  }

  // ── ⑥ **정면**(web2-54 54-3) — 손통 front와 같은 배선(frontFlyTarget — #54). 왕복이다. ──
  {
    const b = document.createElement('button')
    b.id = 'btn-paint-front'
    b.className = 'rrow'
    b.dataset.act = 'state'   // 시점 이동은 색 고르기를 안 끊는다
    b.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="16" height="16"/><path d="M16 3 v3 M16 26 v3 M3 16 h3 M26 16 h3" stroke-width="1.1"/></svg><span id="paint-front-lbl">정면</span>`
    b.addEventListener('click', () => {
      const r = frontFlyTarget(app)
      if (!r) { notify('정면은 면을 골라야 한다 — 칠 도구로 면을 탭해 고른 뒤 누른다'); return }
      autolevel.glide(r.to)
      status(r.back ? '직전 시점으로 돌아간다' : '정면 — 다시 누르면 직전 시점으로 돌아온다')
      syncPainttray()
    })
    painttrayEl.append(b)
  }

  // ── 상한 표식(web2-67 0-1) — 패널 구석의 작은 점. 걸려 있는 동안만 켜진다(frame이 켜고
  //    끈다 — 술어는 render3d.paintClampedVisible 하나 #54). 설명 한 줄은 호버(title)다.
  {
    const dot = document.createElement('div')
    dot.id = 'paint-clamp-dot'
    dot.hidden = true
    dot.title = `칠 해상도 상한(${C.FACETEX_MAX_PX}px)에 걸린 면이 있다 — 그 면의 칠은 화면보다 거칠게 굽힌다`
    painttrayEl.append(dot)
    clampDotEl = dot
  }

  // ── 동기화 — 패널의 모든 값은 paintSel(정본)에서 온다(#54) ─────────────────────────
  let sampleKey = ''
  syncPaintPanel = () => {
    const ps = app.paintSel
    const key = `${ps.i}|${ps.br}|${ps.hex}`
    if (key !== sampleKey) {
      sampleKey = key
      drawBrushSample(sampleCv, ps.i, ps.br, ps.hex)
    }
    // 65 §2 ③④ — 이름은 사람 쪽 사상, 부제는 **원 이름 그대로**(줄바꿈 허용 — 안 잘린다)
    brushName.innerHTML = `<b>${brushLabel(ps.br)}</b><span style="color:#8d8880">${SLOT_NAME[ps.i]} · ${brushOrigin(ps.br)}</span>`
    brushBtn.title = `지금 브러시 «${brushLabel(ps.br)}» — 원 이름 ${ps.br}(${SLOT_NAME[ps.i]} 족). 누르면 브러시 목록이 열린다`
    syncSizeRow(); syncOpRow()
    colorBtn.style.background = ps.hex
    colorBtn.title = `지금 색 ${ps.hex} — 누르면 색상 휠이 열린다`
    const rec = readRecent()
    recentBtns.forEach((b, k) => {
      const h = rec[k]
      b.dataset.hex = h ?? ''
      b.style.background = h ?? 'transparent'
      b.style.borderStyle = h ? 'solid' : 'dashed'
      b.title = h ? `최근 색 ${h}` : '최근 색 — 비어 있다(색을 고르면 여기 남는다)'
      b.classList.toggle('on', !!h && h === ps.hex)
    })
    // 66-3 adopt — 지금 브러시가 어느 칸과 같으면 그 칸이 지금 사양(색·크기·불투명)을 기억한다
    // (프로크리에이트의 «브러시가 크기를 기억한다» — 같은 브러시를 둔 칸이 여럿이면 첫 칸이 기억).
    // 값이 달라졌을 때만 쓴다 — 이 함수는 자주 돈다.
    const fs = readFavs()
    {
      const ai = fs.findIndex(f => f.i === ps.i && f.br === ps.br)
      if (ai >= 0) {
        const f = fs[ai]!
        if (f.hex !== ps.hex || f.w !== ps.w || f.o !== ps.o) {
          fs[ai] = { ...f, hex: ps.hex, w: ps.w, o: ps.o }
          writeFavs(fs)
        }
      }
    }
    favBtns.forEach((b, k) => {
      const f = fs[k]!
      // web2-65 §2 ② — 그림(SLOT_SVG)이 아니라 **그 브러시의 실제 자국**이다. 64 §2 규칙 ①
      // 「자국 견본으로. 이름만으로는 안 된다」가 여기만 안 지켜졌었다 — 여섯이 다 비슷한
      // 연필 그림이라 구분이 안 됐다(사람 판정 64-panel.png).
      const cv = favCv[k]!
      const key = `${f.i}|${f.br}|${ps.hex}`
      if (favKey[k] !== key) { favKey[k] = key; drawBrushSample(cv, f.i, f.br, ps.hex) }
      const nm = b.querySelector('.favname')!
      nm.textContent = brushLabel(f.br)
      b.title = `즐겨찾기 ${k + 1} — ${SLOT_NAME[f.i]} · ${brushLabel(f.br)}(원 이름 ${f.br}). 누르면 지금 브러시로 · 길게 누르면 지금 브러시를 여기 놔둔다(이 기기 · 옛 획은 안 변한다)`
      b.classList.toggle('on', f.i === ps.i && f.br === ps.br)
    })
    // web2-67 0-6 — 지우개 칸의 상태(켜짐 · 경도 이름). 값의 출처는 app 하나다(#54).
    {
      const eb = document.getElementById('paint-erase')
      const sb = document.getElementById('paint-erase-soft')
      if (eb) eb.classList.toggle('on', app.paintErase)
      if (sb) {
        sb.textContent = app.eraseSel.soft ? '부드러운' : '딱딱한'
        sb.classList.toggle('on', app.paintErase && app.eraseSel.soft)
      }
    }
    if (wheelOpen) { drawWheel(wheelHsv()); wheelHex.textContent = ps.hex }
  }
}
let wheelDrag: WheelPart = null
/** web2-67 0-2 반증(D-3 · e2e 전용) — 참이면 잠금 없이 이동마다 partAt(옛 거동) */
let wheelLockOff = false
function syncPainttray() {
  // 정면 줄(54-3) — **몇 장이 골라졌는지 화면이 말한다**(54-2 · R6). 툴팁은 쓸 수 있는
  // 상태에서도 뜬다(#96 — «못 쓸 때만 설명»은 뒤집힌 거동이다).
  {
    const b = document.getElementById('btn-paint-front')
    const lbl = document.getElementById('paint-front-lbl')
    if (b && lbl) {
      const n = liveFaceSel(app).length
      const can = lastSelFace(app) !== null
      lbl.textContent = n > 1 ? `정면 · 면 ${n}장 고름` : n === 1 ? '정면 · 면 1장 고름' : '정면'
      b.classList.toggle('disabled', !can)
      b.title = can
        ? (app.frontBack ? '정면 — 다시 누르면 직전 시점으로 돌아온다'
          : `정면 — ${n > 1 ? '마지막에 고른 면' : '고른 면'}을 정면으로 본다(평행)`)
        : '정면은 면을 골라야 한다 — 칠 도구로 면을 탭해 고른 뒤 누른다'
    }
  }
  syncPaintPanel()
}
let painttrayOpen = false
/** 칠 패널 — 칠 도구를 든 동안 켜진다(setTool이 부른다). 통 등록부 밖(R8 정정 — 도구의 화면). */
function setPainttrayOpen(v: boolean) {
  painttrayOpen = v
  painttrayEl.classList.toggle('open', v)
  if (v) { syncPainttray(); placeLeftPanel(painttrayEl) }
  else { if (paintPanelReady && brushPicker.isOpen()) brushPicker.setOpen(false); closePaintWheel() }
}

// ── 숫자와 표시(web2-47) ────────────────────────────────────────────────────

// 47-3 바닥면적·부피 — 숫자는 근거와 같이 간다(#61): 값이 뜨는 순간 그 면들이 밝아진다.
document.getElementById('btn-floor-area')!.addEventListener('click', () => {
  const fa = floorAreaNow(app)
  if (!fa) {
    notify(app.lift.mmPerUnit === null
      ? '축척이 아직 없다 — 치수를 하나 매기면 면적이 선다'
      : '슬라브로 분류된 면이 없다 — 면을 지정하고(분류는 손통) 다시')
    return
  }
  const vo = volumeNow(app)
  const vTxt = vo.report
    ? ` · 부피 ${vo.report.m3.toFixed(1)} m³ (벽 높이 ${vo.report.hM.toFixed(2)} m)`
    : vo.why === 'uneven' ? ' · 부피는 안 낸다(벽 높이가 균일하지 않다 — 틀린 숫자보다 없는 숫자)'
    : vo.why === 'no-wall' ? ' · 부피는 안 낸다(벽이 없다)'
    : ''
  status(`바닥면적 ${fa.m2.toFixed(2)} m² — 슬라브 ${fa.ids.length}면의 합(밝은 면들)${vTxt}`)
  flashFaces(app, fa.ids, performance.now())
  invalidate()
  setTimeout(invalidate, 1700)   // 하이라이트가 스스로 꺼지는 프레임
})

// 47-4 실 다이어그램 토글 — 표시(파생)다. 실이 0이면 그 사실을 말한다(조용히 빈 화면 ⛔).
{
  const box = document.getElementById('chk-rooms') as HTMLInputElement
  box.addEventListener('change', () => {
    app.showRooms = box.checked
    if (box.checked) {
      const g = roomsNow(app)
      status(g.rooms.length > 0
        ? `실 ${g.rooms.length} · 연결 ${g.links.length} — 버블이 실, 선이 개구부다`
        : '닫힌 실이 없다 — 벽(분류)으로 둘러싸인 영역이 서면 버블이 뜬다')
    }
    invalidate()
  })
}

// 47-2 사람 놓기 — 자동으로 안 세운다: 누르고, 다음 지면 탭 하나가 그 자리다.
document.getElementById('btn-person')!.addEventListener('click', () => {
  refreshStencil()   // 기기 저장은 밖(다른 탭·e2e 주입)에서도 바뀐다 — 캐시를 새로 읽는다
  if (!loadStencil()) {
    notify('사람 스텐실이 아직 없다 — 설정 「사람 스텐실 그리기」에서 그린다(기기에 저장된다)')
    return
  }
  app.placePerson = true
  status('지면을 짚으면 그 자리에 선다(지평선 아래) — 한 번 놓으면 풀린다')
})
// 놓기 탭 — 창 포획 단계에서 가로챈다(그리기 기계보다 먼저 · 무장 상태에서만 한 번).
window.addEventListener('pointerdown', (ev) => {
  if (!app.placePerson) return
  const cv = document.getElementById('ink') as HTMLCanvasElement | null
  const r = (cv ?? document.body).getBoundingClientRect()
  const sp = { x: ev.clientX - r.left, y: ev.clientY - r.top }
  // 화면 밖·UI 위 탭은 그냥 두는가? — UI(버튼) 탭이면 놓기가 아니라 그 버튼이다:
  // 대상이 캔버스 계열이 아닐 때는 통과시킨다(무장은 유지 — 설정을 만지고 와도 된다).
  const t = ev.target as HTMLElement
  if (t.closest('button, input, label, #sidebar, #dimpanel, #display-pop')) return
  const q = placePersonAt(app, screenToDoc(app, sp))
  if (q) {
    ev.preventDefault(); ev.stopPropagation()
    status('섰다 — 눈이 지평선에 얹혀 있다(그 높이가 이 그림의 자다)')
  } else {
    notify('지면과 안 만난다 — 지평선 아래를 짚는다')
    app.placePerson = false
  }
  invalidate()
}, { capture: true })

// 47-2 스텐실 그리기(설정 안 — 찾는 사람만 찾는다)
{
  const modal = document.getElementById('stencil-modal')!
  const cv = document.getElementById('stencil-canvas') as HTMLCanvasElement
  const g = cv.getContext('2d')!
  const EYE_Y = 72, FOOT_Y = 348      // 캔버스 180×360 — 눈높이 행·발끝 행(그리기 규약)
  let lines: { x: number; y: number }[][] = []
  const paint = () => {
    g.clearRect(0, 0, cv.width, cv.height)
    g.strokeStyle = '#b8b2a6'; g.setLineDash([4, 3]); g.lineWidth = 1
    g.beginPath(); g.moveTo(0, EYE_Y); g.lineTo(cv.width, EYE_Y); g.stroke()   // 눈높이
    g.beginPath(); g.moveTo(0, FOOT_Y); g.lineTo(cv.width, FOOT_Y); g.stroke() // 바닥
    g.setLineDash([])
    g.fillStyle = '#b8b2a6'; g.font = '10px system-ui'
    g.fillText('눈높이', 4, EYE_Y - 3); g.fillText('바닥', 4, FOOT_Y - 3)
    g.strokeStyle = '#3c3833'; g.lineWidth = 1.6; g.lineJoin = 'round'; g.lineCap = 'round'
    for (const ln of lines) {
      if (ln.length < 2) continue
      g.beginPath()
      ln.forEach((pt0, i) => { if (i === 0) g.moveTo(pt0.x, pt0.y); else g.lineTo(pt0.x, pt0.y) })
      g.stroke()
    }
  }
  let cur: { x: number; y: number }[] | null = null
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect()
    cur = [{ x: e.clientX - r.left, y: e.clientY - r.top }]
    lines.push(cur)
    cv.setPointerCapture(e.pointerId)
  })
  cv.addEventListener('pointermove', (e) => {
    if (!cur) return
    const r = cv.getBoundingClientRect()
    cur.push({ x: e.clientX - r.left, y: e.clientY - r.top })
    paint()
  })
  cv.addEventListener('pointerup', () => { cur = null; paint() })
  document.getElementById('btn-stencil')!.addEventListener('click', () => {
    const st = loadStencil()
    lines = st ? st.lines.map(l => [...l]) : []
    modal.hidden = false
    paint()
  })
  document.getElementById('stencil-save')!.addEventListener('click', () => {
    saveStencil({ lines, eyeY: EYE_Y, footY: FOOT_Y })
    refreshStencil()
    modal.hidden = true
    notify('스텐실이 이 기기에 저장됐다 — 표시 팝업 「사람 놓기」로 세운다')
    invalidate()
  })
  document.getElementById('stencil-clear')!.addEventListener('click', () => { lines = []; paint() })
  document.getElementById('stencil-close')!.addEventListener('click', () => { modal.hidden = true })
}

let lastSheetForYellow = app.activeSheet
const paperbar = initPaperbar(app, document.getElementById('paperbar')!, {
  capture: captureSheet,
  thumb: captureThumb,
  flash: shutterFlash,
  notify,
  // 종이를 바꾸면 종속 탭 줄도 바뀐다(web2-20 2부 — 겹은 종이에 속한다)
  onGoto: () => {
    // 옐로 안내(web2-22 1-d) — 옐로 획은 2D라 그 종이에서만 보인다. 실물 그대로이고
    // 옳지만 처음 겪으면 「사라졌다」로 읽히므로, **옐로 획이 있는 종이를 떠날 때** 한 줄.
    // (종속 탭 표시 대신 이 길을 골랐다 — 사라지는 «순간»에 말하는 쪽이 읽힌다. D-W9)
    if (app.activeSheet !== lastSheetForYellow) {
      const left = lastSheetForYellow
      const yl = new Set(app.doc.layers.filter(l => l.paper === 'yellow' && l.sheet === left).map(l => l.id))
      if (yl.size > 0 && app.doc.strokes.some(s => s.layer !== undefined && yl.has(s.layer))) {
        notify('옐로 스케치는 그 종이 위의 2D다 — 이 종이에서는 안 보인다')
      }
      lastSheetForYellow = app.activeSheet
    }
    autolevel.touch(); layerbar.sync(); invalidate()
  },
})
paperbarRef = paperbar

// ── 문서 저장소(web2-43 2·3·4·5번) — 자동저장 · 이름 · 최근 드로잉 ────────────────
// **여기가 «지금 문서가 무엇인가»의 유일한 출처다**(#54). 앱 상태는 그림만 들고 있고
// 열쇠·이름·시각은 이 패널이 든다 — 그래야 이름을 바꾸는 일이 그림을 안 건드린다.
const filePanel = initFilePanel({
  app,
  serialize: () => serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView }),
  // **UI 없이 도면만**(지시 4번) — 종이 썸네일과 **같은 함수**다(새 경로 ⛔ · #54)
  thumb: captureThumb,
  notify,
  applyDoc: applyOpen,
  confirmNear,
  now: () => Date.now(),
})
filePanelRef = filePanel
// 부팅 복원 — 이전(localStorage → IndexedDB) 뒤 가장 최근 문서를 연다.
// ⚠ **상한 있는 비동기다**: 실패해도 앱은 그대로 서고(빈 문서), 실패 사실을 알린다.
void filePanel.boot()

// **되돌리기의 자리**(web2-17 1-d) — 규칙은 안 바꾼다(작도 획은 스택 밖·비우기가 답이다).
// 새 진입로에서는 첫 획이 곧 소실점 획인 경우가 흔해 «되돌리기가 아무 일도 안 하는» 장면이
// 자주 보인다 — 그때 한 줄로 말한다. 조건: 스택이 비었는데 마지막 획이 작도 획일 때만
// (내용 획만 남은 상태 — 파일에서 연 문서 등 — 는 종전대로 조용한 무동작이다).
function undoOrExplain() {
  if (app.undoStack.length === 0 && app.doc.strokes.length > 0) {
    const last = app.doc.strokes[app.doc.strokes.length - 1]!
    if (app.lift.an.roles.get(last.id) !== 'content') {
      notify('이 획은 공간을 정의했다 — 비우기로 다시 시작한다')
      return
    }
  }
  undo(app)
}
// 작도 시점으로 — 뷰는 drawView(3-b)이고, 프레임 ≠ 창이면 합성을 다시 얹는다(3-c)
function gotoDrawView() {
  resetPose(app)
  fitViewToFrame()
}
document.getElementById('btn-undo')!.addEventListener('click', () => undoOrExplain())
document.getElementById('btn-redo')!.addEventListener('click', () => redo(app))
document.getElementById('btn-draw-view')!.addEventListener('click', () => gotoDrawView())
// 돋보기(web2-31 3번) — 대상에 맞춰 화면을 채운다. **화면 크기의 출처는 r3d 하나다**
// (`resize3d`가 창 변화를 그리로 넣는다 — 여기 `W`/`H`는 첫 로드의 값이라 낡는다 · #88).
// ⚠ `level.touch()`는 「조작이 아닌 포즈 변경」의 자리다(뷰 큐브·저장한 시점과 같은 급) —
// 접기 지연만 다시 세고 붙잡지 않는다. 아무 일도 안 했으면(대상 0) 그것도 안 부른다.
document.getElementById('btn-zoom-fit')!.addEventListener('click', () => {
  const r = zoomFit(app, { W: r3d.W, H: r3d.H })
  if (r.mode !== 'none') autolevel.touch()
})
// ── 렌즈(web2-31 2번) — **보기 전용 화각**. `Camera.f`·`fSource`는 못 건드린다 ──────
// 손잡이의 눈금은 **스톱**(log2 배율)이다: 0이 확정된 f이고 ±1이 절반·두 배(렌즈 한 스톱).
// ⚠ 화면에 내는 값은 **화각(도)** 하나다 — `fSource`를 안 낸다(2026-08-17 지시 3 · D-L55).
// ⚠ 확정 전에는 단추가 꺼져 있고 팝오버도 안 열린다(지시 「확정 전에는 잠근다」).
const lensBtn = document.getElementById('btn-lens') as HTMLButtonElement
const lensRange = document.getElementById('lens-range') as HTMLInputElement
const lensRead = document.getElementById('lens-read')!
lensRange.min = String(LENS_STOP_MIN)
lensRange.max = String(LENS_STOP_MAX)
lensRange.step = String(C.LENS_STEP_LOG2)
function placeLensPop() {
  const pop = document.getElementById('lens-pop')!
  const r = lensBtn.getBoundingClientRect()
  pop.style.top = `${Math.round(Math.min(r.top, window.innerHeight - pop.offsetHeight - 6))}px`
}
/** 화면을 지금 상태로 맞춘다 — **값의 출처는 `app.viewF`와 `lift.an` 하나다**(#54:
 *  손잡이가 자기 값을 따로 들면 승격이 렌즈를 버릴 때 화면만 옛 눈금에 남는다). */
function syncLens() {
  const an = app.lift.an
  const on = lensAllowed(an)
  lensBtn.disabled = !on
  if (!on) {
    if (!document.getElementById('lens-pop')!.hidden) panelOf('#lens-pop').setOpen(false)
    lensRead.textContent = '카메라가 정해진 뒤에 쓴다'
    lensRange.value = '0'
    lensRange.disabled = true
    return
  }
  // ── 읽는 값은 **투영에 따라 대체된다**(web2-42 3번) — 한 자리에 하나만 뜬다 ──
  // 평행에서는 렌즈길이가 무의미하므로(눈이 없다) 손잡이를 잠그고 **축척**을 낸다.
  // 축척의 출처는 32-5의 `doc.scaleRef`가 정한 `lift.mmPerUnit` 하나다(새 기제 ⛔).
  if (isParallel(app.pose)) {
    lensRange.disabled = true
    lensRange.value = '0'
    lensRead.textContent = scaleText(scaleDenom(app.lift.mmPerUnit, parallelPxPerUnit(app) ?? 0))
    return
  }
  lensRange.disabled = false
  lensRange.value = String(lensStops(an, app.viewF))
  const f = lensF(an, app.viewF)!
  lensRead.textContent = `${focalText(f, an.diag)}${app.viewF === null ? ' (기본)' : ''}`
}
// 여닫이는 **표를 거친다**(직접 `hidden` 대입 ⛔ — 28-1의 규약: 배타·R7이 그 표에 걸려 있다)
lensBtn.addEventListener('click', () => {
  const p = panelOf('#lens-pop')
  p.setOpen(!p.isOpen())
})
lensRange.addEventListener('input', () => {
  setViewLensStops(app, Number(lensRange.value))
  syncLens(); invalidate()
})
document.getElementById('btn-lens-reset')!.addEventListener('click', () => {
  resetViewLens(app); syncLens(); invalidate()
})
app.listeners.push(syncLens)
syncLens()

window.addEventListener('keydown', (e) => {
  // Esc — 떠 있는 물음을 취소한다(줄이 비면 밑줄 단어가 사라져 못 누른다).
  // 물음이 없을 때는 줄을 비우는 것뿐이고, 다음 문서 변경이 안내를 다시 쓴다.
  if (e.key === 'Escape') { clearNotice(); return }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoOrExplain() }
  else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(app)
  }
})

// 창 크기 변경 — 캔버스만 따라간다. 문서 프레임(좌표계)은 불변.
window.addEventListener('resize', () => {
  const nw = window.innerWidth, nh = window.innerHeight
  const nd = window.devicePixelRatio || 1
  ctx = resize2d(ink, nw, nh, nd)
  resize3d(r3d, nw, nh, nd)
  brushLayer.resize(nw, nh, nd)
  app.cubeLayout = cubeLayoutFor(nw) // state.ts의 초기값과 **같은 함수**(#54 — 규칙이 하나다)
  invalidate()
})

// ── **비용 표식**(web2-18 0부 ③) — 「돌리는 중 1프레임 합」의 자리 ───────────────
// 세 몫을 **그리는 그 자리에서** 잰다(원칙 a — 측정용 프레임을 따로 안 돈다).
// 표본은 마지막 FRAME_COST_N개만 든다(고리 버퍼) — 누산 평균은 국면이 섞인다(#32·#43).
// 국면별로 리셋해서 읽는다(frameCostReset) — 궤도 칸에 그리기 국면의 값이 실리면
// 그 칸은 남의 값이다(web2-12 2차 리뷰어 [5]의 같은 형태).
const FRAME_COST_N = 240
interface FrameCost { r3: number; bs: number; d2: number; total: number }
let frameCosts: FrameCost[] = []
/** 표본의 중앙·최악 — **진단 패널과 e2e 원장이 같은 함수를 읽는다**(원칙 a). */
function frameCostQ() {
  if (frameCosts.length === 0) return null
  const q = (k: keyof FrameCost) => {
    const v = frameCosts.map(c => c[k]).sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)]!
  }
  const totals = frameCosts.map(c => c.total)
  return { n: frameCosts.length, r3: q('r3'), bs: q('bs'), d2: q('d2'), total: q('total'), totalMax: Math.max(...totals) }
}

let paintDraftPerturb = false
function frame() {
  autolevel.tick()   // 접힐 때가 됐으면 여기서 포즈가 움직인다(setPose가 다시 그리게 한다)
  // 정착 전이(web2-37 2번) — 색이 시간의 함수인 «그 창 동안만» 계속 그린다. 창이 닫히면
  // 이 항은 false라 프레임 고리가 평소의 «바뀔 때만»으로 돌아간다(평소에는 조용하다).
  if (settleActive(app, performance.now())) invalidate()
  // 겹을 깔고 치우는 동작(web2-40 2번) — 정착 전이와 **같은 꼴**이다: 창이 열려 있는
  // 동안만 계속 그리고, 닫히면 표를 비워 평소의 «바뀔 때만»으로 돌아간다.
  //
  // ⚠⚠ **닫히는 그 순간에 한 번 더 그린다**(화면 팔이 빨갛게 잡았다 — NOTES 40-2 D-2):
  //    창이 열린 마지막 프레임은 아직 `away > 0`인 프레임이다. 다음 프레임에서 «안 돈다»만
  //    보고 그냥 넘기면 **덜 온 종이가 화면에 그대로 굳는다** — 「끝난 화면이 동작 없이
  //    얹은 화면과 픽셀로 같다」가 그 자리에서 깨진다. 표를 비우면서 `invalidate` 한 번을
  //    같이 낸다(비울 것이 있을 때만이라 평소에는 여전히 조용하다).
  if (slidesActive(app, performance.now())) invalidate()
  else if (app.slides.size > 0 || app.slideGhosts.length > 0) {
    pruneSlides(app, performance.now())
    invalidate()
  }
  if (dirty) {
    dirty = false
    const fc0 = performance.now()
    // draft 몸체(web2-12 2번) — 확정과 같은 Line2가 그린다(질감은 아래 brushLayer.sync).
    // 눌리는 술어는 draftBrushed 하나다(#54 — state.ts 머리주석이 정본).
    const g = activeGrade(app)
    setDraftLine(r3d, app, draft && draftBrushed(app)
      ? { a: draft.start, b: draft.end, grade: g,
          w: widthOfMat({ grade: g, w: app.tool === 'pen' && app.nib !== C.NIB_PX ? app.nib : undefined }) }
      : null)
    render3d(r3d, app)
    // 상한 포화 «표식»(web2-67 0-1 — 59-1의 토스트를 갈았다: 사람 판정 「이거 걸리면 자꾸
    // 멈추는데」 — 뜻(조용히 뭉개지 마라 · 43-1)은 그대로, «형태»가 토스트 → 패널 구석의
    // 작은 점이다. 걸려 있는 동안 켜지고 안 걸리면 꺼진다 · 한 줄 설명은 호버(title)에.
    if (clampDotEl) clampDotEl.hidden = !(painttrayOpen && paintClampedVisible())
    const fc1 = performance.now()
    // 캐시 키(문서·포즈·뷰·렌더러)가 갈렸을 때만 전량을 그린다. draft가 있으면(web2-12 2번)
    // draft 전용 모드 — 확정 획은 스냅샷 겹이 들고 #brushc는 진행 중인 획 하나만 그린다.
    brushLayer.sync(app, draft)
    const fc2 = performance.now()
    filmLayer.draw(app)   // 막·위 획(web2-20 3부) — 값싼 패턴 채우기 + 2D 사영선
    draw2d(ctx, app, draft, hover, eraserPos, facePrev, dimInkLive)
    const fc3 = performance.now()
    if (frameCosts.length >= FRAME_COST_N) frameCosts.shift()
    frameCosts.push({ r3: fc1 - fc0, bs: fc2 - fc1, d2: fc3 - fc2, total: fc3 - fc0 })
    syncHorizonBox()   // 체크박스가 실제 표시 상태를 비춘다(5-a — 그려진 프레임과 같은 판정)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 로딩화면 제거(web2-10 지시 2) — 첫 프레임이 그려진 뒤에 지운다.
// frame이 먼저 등록됐으므로 이 콜백은 **첫 draw2d/render3d 다음**에 돈다(rAF는 등록 순).
// 겹 자체가 pointer-events:none이라 떠 있는 동안에도 입력을 안 막는다 — 여기서는 표시만 거둔다.
// transitionend만 믿지 않는다: prefers-reduced-motion이면 transition이 없어 안 온다.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.classList.add('gone')
  const rm = () => boot.remove()
  boot.addEventListener('transitionend', rm, { once: true })
  setTimeout(rm, 600)
})

// e2e 진단 통로 — 앱과 같은 함수·같은 상태를 본다(측정 경로와 앱 경로를 가르지 않는다)
import { project, screenAxes, vpMarks, frameAxes, isParallel, projW, horizonScreenY } from '../core/camera'
import { markShape, type MarkShape } from '../core/markshapes'
import {
  setPaintRenderer, paintRenderer, drawMark, drawMarksSeam, paintRendererId, type Instr58,
  setMarkerFlatForTest, setPaintOpaqueForTest, setPressFlatForTest, setGrainOffForTest,
} from '../core/paintseam'
import {
  mypaintRenderer, mypaintProbeForTest, calibForTest as mypaintCalibForTest, presetMappingForTest,
  lastLayerAlphaForTest, smudgeStatsForTest, resetSmudgeStatsForTest, premulViolationsForTest, layerStatsForTest, lastStrokeCapForTest, presetBaseForTest,
  setCapOffForTest, setSmudgeSelfSampleForTest, setPremulBreakForTest, setFringeBreakForTest,
  setPaintModeOffForTest, setSmudgeOffForTest, setAlphaCaptureForTest, setEventDtimeForTest, setCalibOffForTest, PRESET_CATALOG, DEFAULT_PRESET,
  setTipsOffForTest, setTipFrameLockForTest, tipsReadyForTest, tipStatsForTest, resetTipStatsForTest, tipDefaultOfForTest, onTipAssetsLoaded,
  setPaintAppendBreakForTest,
  unknownBrushIdsForTest, setTipGainOffForTest, presetStatsForTest, resetCpTilesForTest, setCpThresholdOffForTest,
  setDabLogForTest, lastDabLogForTest, markBandProbeForTest,
} from './mypaintpaint'
import { setBrushIdOffForTest } from '../core/facetex'
import { setBrushOfSlot } from '../core/file'
import { defaultBrushOf, DEFAULT_BRUSH } from '../core/paintseam'
import { drawBrushSample } from './brushpicker'
import { grainTileForTest, setPaper61ForTest, paper61ForTest, setPaperSeamBreakForTest } from '../mypaint/paper'
import { loadTipAssets, tipAtlasesForTest } from '../mypaint/tips'
import { initTuneLab } from './tunelab'
import { initBrushPicker, persistTune } from './brushpicker'

// 칠 렌더러 등록(web2-62) — 이음매의 주입 지점. **web2-64 64-6: 렌더러는 하나다** — 61의 p5.brush 판(app/p5paint.ts)과
// 런타임 전환 손잡이(setPaintEngineForTest)를 지웠다(원칙 a · #70의 그 모양: 둘이 살아 있으면 «지금 어느 것이 도는가»를 못 센다).
setPaintRenderer(mypaintRenderer)
/** 슬롯의 «지금» 브러시 — 조정(tune.base — 마지막으로 고른 것) → 기본 표. 옛 문서 이주(file.setBrushOfSlot)·슬롯 바꿈이 같은 함수를 본다(#54). */
const slotBrushOf = (i: Instr58, grade?: string): string => paintRenderer()?.brushOf?.(i) ?? defaultBrushOf(i, grade)
setBrushOfSlot((i, grade) => {
  // 조정이 없으면 등급을 본다(연필 2H/HB/2B — 62 pencilOfGrade). 조정이 있으면 그것(마지막으로 고른 브러시).
  const tuned = paintRenderer()?.brushOf?.(i)
  return tuned && tuned !== DEFAULT_PRESET[i] ? tuned : defaultBrushOf(i, grade)
})
/** **지금 브러시를 고른다** — 패널의 견본·브러시 목록·즐겨찾기가 전부 이 하나를 부른다(#54). paintSel.br가 정본(64-1)이고
 *  슬롯 조정(tune.base)은 «그 슬롯이 마지막으로 든 브러시»의 기록이다(옛 문서 이주·preset 없는 팔의 폴백). */
function pickBrush(i: Instr58, name: string): void {
  app.paintSel.i = i
  app.paintSel.br = name
  // web2-66 66-3 — 이 브러시를 기억하는 즐겨찾기 칸이 있으면 그 칸의 사양(색·크기·불투명)이
  // 같이 온다(칸을 안 눌러도 — 어떻게 들든 «그 브러시의 사양»이다). 없으면 지금 값 그대로이고,
  // 그때부터 adopt(syncPaintPanel)가 그 칸에 기억을 시작한다. 안 하면 고르개로 같은 브러시를
  // 드는 순간 지금 전역값이 그 칸을 «조용히» 덮는다(adopt의 첫 실행) — 그 갈림을 여기서 막는다.
  {
    const f = readFavs().find(v => v.i === i && v.br === name)
    if (f) {
      if (f.hex) app.paintSel.hex = f.hex
      if (f.w !== undefined) app.paintSel.w = Math.min(C.PAINT58_MAX_W[i], Math.max(C.PAINT58_MIN_W, f.w))
      if (f.o !== undefined) app.paintSel.o = Math.min(1, Math.max(0.05, f.o))
    }
  }
  app.paintErase = false           // web2-67 0-6 — 붓을 골랐다 = 지우개를 놓는다(고정 칸이 다시 켠다)
  paintRenderer()?.setBrush?.(i, name)
  persistTune()
  syncPainttray()
}

// ── 브러시 작업대(web2-58 58-5) — 설정에 숨는다(R8). 시험 긋기 == 제품 굽기(#54) ────
const tuneLab = initTuneLab({
  hexOf: () => app.paintSel.hex,
  rebake: () => { rebakePaintTexForTest(); invalidate() },
  notify: (m) => notify(m),
})
document.getElementById('btn-tunelab')?.addEventListener('click', () => tuneLab.setOpen(true))
registerBox({
  id: '#tunelab', isOpen: () => tuneLab.isOpen(), close: () => tuneLab.setOpen(false),
  zone: () => [tuneLab.root, document.getElementById('btn-tunelab')],
})
// ── 브러시 고르개(web2-62) — 칠통의 「브러시…」가 연다. 고른 것은 곧바로 기기에 남는다.
const brushPicker = initBrushPicker({
  toolOf: () => app.paintSel.i,
  hexOf: () => app.paintSel.hex,
  onPick: (tool, name) => { pickBrush(tool, name); invalidate() },   // web2-64: 옛 획은 안 변한다(br) — 재굽기 불요
  notify: (m) => notify(m),
})
registerBox({
  id: '#brushpick', isOpen: () => brushPicker.isOpen(), close: () => brushPicker.setOpen(false),
  zone: () => [brushPicker.root, document.getElementById('paint-brush-btn')],
})
// 칠 패널이 섰다(web2-64) — 패널 블록과 브러시 목록이 둘 다 선 뒤에야 켤 수 있다(부팅의 setTool은 표식 전이라 못 켰다 · TDZ)
paintPanelReady = true
setPainttrayOpen(app.tool === 'paint')
import { forwardOf, yawDir } from '../core/level'
import { loopAt, buildGraph, cyclesOf, planesOf, faceScreen } from '../core/face'
import { geomSize3 } from '../core/osnap'

const diag = {
  /** 지금 열려 있는 통(화면 규칙 R7 — web2-34 4번). 「동시에 둘이 안 열린다」를
   *  화면 형태(클래스·hidden·details.open)가 아니라 **등록부**에서 읽는 통로다. */
  openBoxes: () => openBoxIds(),
  /** R7의 **반증 손잡이**(D-3) — 'off'(안 듣는다) · 'swallow'(삼킨다) · 'on'(제자리) */
  boxAwayModeForTest: (m: 'on' | 'off' | 'swallow') => setBoxAwayModeForTest(m),
  /** **web2-59 반증**(D-3 · #30): 벡터 미리보기 되돌림 · 미리보기 흔들기.
   *  paintDraft는 미리보기 상태(사본·덧그림·포화). ⚠ 옛 엔진 전용 스위치(strokeBufferOff·
   *  grainPerStroke·stampLog)는 엔진과 함께 갔다(web2-61 — grain61_pre가 그 기록). */
  setPaintPreviewVectorForTest: (v: boolean) => { setPaintPreviewVectorForTest(v); invalidate() },
  setPaintDraftPerturbForTest: (v: boolean) => { paintDraftPerturb = v },
  paintDraft: () => ({ ...paintDraftStats(), strokes: app.paintDraft?.length ?? 0 }),
  /** web2-66 D-2 — 초안 프레임 계수기(프레임 수·ms·덧그린 획·업로드 바이트) */
  paintDraftFrames: () => paintDraftFrameStats(),
  paintDraftFramesReset: () => resetPaintDraftFrameStats(),
  /** web2-66 게이트 ①의 자 — 도장 (x,y,r) 기록 켬/끔과 마지막 자국의 기록 */
  setDabLogForTest: (v: boolean) => setDabLogForTest(v),
  lastDabLogForTest: () => lastDabLogForTest(),
  /** web2-66 게이트 ①의 반증(D-3) — 얼리기 끔: 옛 전량 되그리기 판(pre의 이동량이 돌아온다) */
  setPaintFreezeOffForTest: (v: boolean) => { setPaintFreezeOffForTest(v); invalidate() },
  paintFreezeOffForTest: () => paintFreezeOffForTest(),
  /** web2-66 반증 둘째 — 옛 굵기 표집(첫→끝 중점 — 이동의 실제 원인)을 되살린다 */
  setPaintWLegacyForTest: (v: boolean) => { setPaintWLegacyForTest(v); invalidate() },
  /** web2-66 §2 — 자국 단면 프로브(방향별 폭·평평한 몫) */
  markBandProbeForTest: (tool: Instr58, preset: string | undefined, wPx: number, dirDeg: number) =>
    markBandProbeForTest(tool, preset, wPx, dirDeg),
  /** web2-66 [H5] — 임의 두 화면 점의 굵기 환산(표집 대가의 자 — 커밋과 같은 함수 #54) */
  worldPerPxPerpForTest: (faceId: number, a: { x: number; y: number }, b: { x: number; y: number }) =>
    worldPerPxPerpProbeForTest(app, faceId, a, b),
  paintRendererId: () => paintRendererId(),
  /** **엔진 조정**(web2-61 — 이음매의 작업대 표면과 같은 배선 #54) + 재굽기 */
  setPaintParamForTest: (i: Instr58, key: string, value: number) => {
    paintRenderer()?.setParam?.(i, key, value); rebakePaintTexForTest(); invalidate()
  },
  setPaintBrushForTest: (i: Instr58, name: string) => {
    paintRenderer()?.setBrush?.(i, name); rebakePaintTexForTest(); invalidate()
  },
  resetPaintTuneForTest: (i: Instr58) => { paintRenderer()?.resetTune?.(i); rebakePaintTexForTest(); invalidate() },
  paintParamsForTest: (i: Instr58) => paintRenderer()?.params?.(i) ?? [],
  /** 결 타일(면 고정 · paint59 ④의 자) — 62부터 엔진 밖(src/mypaint/paper)의 것이다 */
  paintGrainTileForTest: () => grainTileForTest(),
  /** **web2-62 — mypaint 엔진 진단·반증** */
  mypaintProbeForTest: () => mypaintProbeForTest(),
  mypaintCalibForTest: () => mypaintCalibForTest(),
  presetMappingForTest: () => presetMappingForTest(),
  presetCatalogForTest: () => PRESET_CATALOG.map(c => ({ group: c.group, names: [...c.names] })),
  defaultPresetsForTest: () => ({ ...DEFAULT_PRESET }),
  lastLayerAlphaForTest: () => { const r = lastLayerAlphaForTest(); return r ? { a: Array.from(r.a), w: r.w, h: r.h } : null },
  smudgeStatsForTest: () => smudgeStatsForTest(),
  resetSmudgeStatsForTest: () => resetSmudgeStatsForTest(),
  premulViolationsForTest: () => premulViolationsForTest(),
  lastStrokeCapForTest: () => lastStrokeCapForTest(),
  presetBaseForTest: (name: string) => presetBaseForTest(name),
  layerStatsForTest: () => layerStatsForTest(),
  setCapOffForTest: (v: boolean) => { setCapOffForTest(v); rebakePaintTexForTest(); invalidate() },
  setSmudgeSelfSampleForTest: (v: boolean) => setSmudgeSelfSampleForTest(v),
  setPremulBreakForTest: (v: boolean) => setPremulBreakForTest(v),
  setFringeBreakForTest: (v: boolean | 'dark') => setFringeBreakForTest(v),
  setPaintModeOffForTest: (v: boolean) => setPaintModeOffForTest(v),
  setSmudgeOffForTest: (v: boolean) => setSmudgeOffForTest(v),
  // ── web2-63 팁·종이 ──
  setTipsOffForTest: (v: boolean) => { setTipsOffForTest(v); rebakePaintTexForTest(); invalidate() },
  setTipFrameLockForTest: (v: number) => setTipFrameLockForTest(v),
  setPaper61ForTest: (v: boolean) => { setPaper61ForTest(v); resetCpTilesForTest(); rebakePaintTexForTest(); invalidate() },
  paper61ForTest: () => paper61ForTest(),
  setPaperSeamBreakForTest: (v: boolean) => setPaperSeamBreakForTest(v),
  tipsReadyForTest: () => tipsReadyForTest(),
  tipStatsForTest: () => tipStatsForTest(),
  resetTipStatsForTest: () => resetTipStatsForTest(),
  tipDefaultOfForTest: (preset: string) => tipDefaultOfForTest(preset),
  tipAtlasesForTest: () => tipAtlasesForTest(),
  /** 반증(grain61 ⑥ — 리뷰어 [H4]) — 크기 자가 보정 끔(반지름 = 폭/2 · 기하 그대로) */
  setCalibOffForTest: (v: boolean) => { setCalibOffForTest(v); rebakePaintTexForTest(); invalidate() },
  /** 반증(AS-C184) — 이벤트 고정 dtime(ms) · null = 제품(걸음 ÷ 일정 속도) */
  setEventDtimeForTest: (ms: number | null) => { setEventDtimeForTest(ms); rebakePaintTexForTest(); invalidate() },
  /** web2-64 ① — 지금 브러시를 고른다(패널·즐겨찾기의 그 배선 — pickBrush 하나 #54). 슬롯 조정(tune.base)도 같이 앉힌다:
   *  «그 슬롯의 지금 브러시»(옛 문서 이주·preset 없는 팔의 폴백)가 마지막으로 고른 것이 되게. */
  pickBrushForTest: (i: Instr58, name: string) => { pickBrush(i, name); rebakePaintTexForTest(); invalidate() },
  /** web2-64 ① 반증(D-3) — 굽기가 획의 브러시 id를 무시한다(옛 결함: 슬롯의 지금 브러시로 굽는다) */
  setBrushIdOffForTest: (v: boolean) => { setBrushIdOffForTest(v); rebakePaintTexForTest(); invalidate() },
  /** web2-64 ⑧ — 읽기(파일과 같은 함수 readBrnl) + 보고 + 알림 문장 · 문서는 안 바꾼다 */
  readBrnlForTest: (text: string) => { const r = readBrnl(text); return { data: r.data, report: r.report, notice: reportNotice(r.report) } },
  /** web2-64 — 엔진이 모르는 브러시 id로 굽힌 횟수(#105 — 조용한 폴백 계수기) */
  unknownBrushIdsForTest: () => unknownBrushIdsForTest(),
  /** web2-64 64-4 반증(D-3) — 팁 농도 보정 끔(63의 옅음이 돌아온다) · 보정표는 mypaintCalibForTest(gain·meanTip·meanProc) */
  setTipGainOffForTest: (v: boolean) => { setTipGainOffForTest(v); rebakePaintTexForTest(); invalidate() },
  /** web2-64 64-2 반증(리뷰어 [H1]) — cp 슬롯의 문턱 판 끔(보통 결로) */
  setCpThresholdOffForTest: (v: boolean) => { setCpThresholdOffForTest(v); rebakePaintTexForTest(); invalidate() },
  /** web2-64 64-5 — 프리셋 하나의 사상 통계(설정 수 · 곡선 수 · 모르는 설정/입력)와 기준값 몇 */
  presetStatsForTest: (name: string) => presetStatsForTest(name),
  /** 지금 도구 슬롯(칠통) — 고르개·사진 팔이 읽는다 */
  paintInstrForTest: () => app.paintSel.i,
  /** 슬롯을 바꾼다 — web2-64: 그 슬롯의 «지금» 브러시(조정 → 기본)도 같이 든다(paintSel.br가 정본이라 i만 바꾸면 갈린다) */
  setPaintInstrForTest: (i: Instr58) => { app.paintSel.i = i; app.paintSel.br = slotBrushOf(i); syncPainttray() },
  paintSelForTest: () => ({ ...app.paintSel }),
  /** web2-64 — 색을 고른다(패널의 setPaintHex — 견본 줄이 지워진 자리의 팔 통로 · 최근 색에 남는다) */
  setPaintHexForTest: (hex: string) => setPaintHex(hex, ' — 팔'),
  /** web2-64 — 등급 흑연색(MAT — 잉크펜 기본 색의 대조 · 리뷰어 [H6]) */
  matColorForTest: (g: string): string => MAT[g as keyof typeof MAT]?.color ?? '',
  /** web2-64 — 재료의 톤 색(palette 그대로 — 46의 (재료, 톤) 사상 · 견본 줄이 지워진 자리의 팔 통로) */
  materialToneForTest: (mat: string, tone: number): string => materialOf(mat as MatId)?.tones[tone] ?? '#000000',
  /** web2-64 — 즐겨찾기·최근 색 읽기(기기 저장 — 값으로) */
  paintFavsForTest: () => readFavs(),
  paintRecentForTest: () => readRecent(),
  /** **자국 견본**(web2-61 게이트·사진의 자) — 흰 판(면 텍스처 규약)에 견본 도형 하나를
   *  제품과 같은 함수(paintMark — 이음매)로 긋고 어둡기 지도(0..255)를 window.__m61에
   *  남긴다. 화면·문서·dpr과 무관한 순수 px 판이라 원근이 자를 안 흐린다(#16 — 주기
   *  측정에 원근 정규화가 필요 없다). 부작용 없음(문서 무변 · 오프스크린). */
  markSampleForTest: (i: Instr58, shape: MarkShape, wPx: number, seed = 61, W = 480, H = 240,
    ext?: { preset?: string; over?: Record<string, number>; color?: string; bg?: string; tip?: string }) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g2 = c.getContext('2d')!
    g2.fillStyle = ext?.bg ?? '#ffffff'; g2.fillRect(0, 0, W, H)
    const sm = markShape(shape, W, H)
    setAlphaCaptureForTest(true)                 // 초안 통로는 층을 되돌린다 — 되돌리기 전 알파를 떠 둔다(팔의 자)
    try {
      drawMark(g2, {
        pts: sm.pts, press: sm.press, wPx, seed, tool: i,
        color: ext?.color ?? (i === 'brush' ? MAT.HB.color : '#8a4a3a'),
        preset: ext?.preset, over: ext?.over, tip: ext?.tip,
      })
    } finally { setAlphaCaptureForTest(false) }
    const d = g2.getImageData(0, 0, W, H).data
    const v = new Array<number>(W * H)
    for (let k = 0, j = 0; k < d.length; k += 4, j++) v[j] = 255 - (d[k]! + d[k + 1]! + d[k + 2]!) / 3
    ;(window as unknown as { __m61?: unknown }).__m61 = { v, w: W, h: H }
    ;(window as unknown as { __m61cv?: unknown }).__m61cv = c
    return { w: W, h: H }
  },
  /** **다중 자국 견본**(web2-61 — paint59 ④ 「결은 면 고정」의 자) — 흰 판 하나에 자국
   *  여럿을 같은 함수(drawMark)로 얹고 어둡기 지도를 __m61에 남긴다. 각 항은 markShape의
   *  도형을 (dx,dy)만큼 옮긴 것 — 시드·도구·굵기는 항이 정한다. */
  markMultiForTest: (
    items: { tool: Instr58; shape: MarkShape; wPx: number; seed: number; dx?: number; dy?: number;
      preset?: string; over?: Record<string, number>; color?: string; press?: number; tip?: string }[],
    W = 480, H = 240, bake = false, bg = '#ffffff',
  ) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g2 = c.getContext('2d')!
    g2.fillStyle = bg; g2.fillRect(0, 0, W, H)
    const marks = items.map(it => {
      const sm = markShape(it.shape, W, H)
      return {
        pts: sm.pts.map(p => ({ x: p.x + (it.dx ?? 0), y: p.y + (it.dy ?? 0) })),
        press: it.press !== undefined ? sm.press.map(() => it.press! * C.PRESS_Q) : sm.press,
        wPx: it.wPx, seed: it.seed, tool: it.tool,
        color: it.color ?? (it.tool === 'brush' ? MAT.HB.color : '#8a4a3a'),
        preset: it.preset, over: it.over, tip: it.tip,
      }
    })
    // bake = 굽기 통로(drawMarksSeam — 층 하나에 차례로 · 스머지가 앞 획을 본다) · 아니면 draw 하나씩
    if (bake) drawMarksSeam(g2, marks)
    else for (const m of marks) drawMark(g2, m)
    const d = g2.getImageData(0, 0, W, H).data
    const v = new Array<number>(W * H)
    for (let k = 0, j = 0; k < d.length; k += 4, j++) v[j] = 255 - (d[k]! + d[k + 1]! + d[k + 2]!) / 3
    ;(window as unknown as { __m61?: unknown }).__m61 = { v, w: W, h: H }
    ;(window as unknown as { __m61cv?: unknown }).__m61cv = c
    return { w: W, h: H }
  },
  /** 조정 전부(JSON · 실험실 「값 꺼내기」와 같은 함수 — web2-61: 엔진 조정) */
  brushTuneJson: () => tuneLab.tuneJson(),
  /** **임의의 포즈로 한 점을 사영한다**(web2-42) — 팔이 「원근 판과 얼마나 갈리는가」를
   *  재는 자리다. 사영의 출처는 `camera.project` 하나이고 여기서 식을 다시 안 적는다(#54). */
  projectWith(pose: CamPose, P: { x: number; y: number; z: number }) {
    return project(app.lift.an, pose, P)
  },
  /** 승격 획 전부의 현재 포즈 재사영 — 불변식 k 확인용 */
  projectAll(): Record<number, { a: Pt; b: Pt } | null> {
    const out: Record<number, { a: Pt; b: Pt } | null> = {}
    for (const [id, seg] of app.lift.lifted) {
      const a = project(app.lift.an, app.pose, seg.a3)
      const b = project(app.lift.an, app.pose, seg.b3)
      out[id] = a && b ? { a, b } : null
    }
    return out
  },
  screenAxes: () => screenAxes(app.lift.an, app.pose),
  /** ✕ 표식이 실제로 그려지는 소실점 — render2d·osnap과 **같은 함수**다(web2-03 지시 1) */
  vpMarks: () => vpMarks(app.lift.an, app.pose),
  /** 그 차수의 정규직교 프레임 — 축은 셋이고 서로 직교한다 */
  frame: () => {
    const fr = frameAxes(app.lift.an)
    if (!fr) return null
    const d = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z
    return {
      ids: fr.map(a => a.id),
      dots: [d(fr[0]!.dir, fr[1]!.dir), d(fr[0]!.dir, fr[2]!.dir), d(fr[1]!.dir, fr[2]!.dir)],
    }
  },
  /** 지금 떠 있는 면 미리보기 — 궤도 뒤에 안 남는지 e2e가 이것으로 본다.
   *  픽셀로는 못 가른다: 같은 2D 캔버스에 **흑연 입자**가 함께 그려져 그 창이 비지 않는다. */
  facePreview: () => facePrev,
  /** 면의 현재 포즈 화면 다각형 — 렌더와 같은 출처(`faceScreen`) */
  facePolys: () => app.faces.map(f => ({ id: f.id, poly: faceScreen(app.lift, app.pose, f.outer) })),
  /** 면 진단 — **앱과 같은 함수**를 부른다(측정 경로와 앱 경로를 안 가른다) */
  loopAt: (x: number, y: number) => {
    const r = loopAt(app.lift, app.pose, { x, y })
    return r ? { loops: r.loops.map(l => l.edges.map(e => e.s)), poly: r.poly } : null
  },
  arrangement: () => {
    const g = buildGraph(app.lift, app.pose)
    const tol = 0.01 * Math.max(...[1e-9])
    void tol
    const planes = planesOf(g, C.PLANAR_RATIO * Math.max(geomSize3(app.lift), 1e-9))
    return {
      nodes: g.nodes.length,
      edges: g.half.length / 2,
      planes: planes.map(pl => ({
        n: pl.n, d: pl.d, edges: pl.use.size,
        cycles: cyclesOf(g, pl.use).map(c => ({ n: c.he.length, area: c.area, comp: c.comp })),
      })),
    }
  },
  /** 접기 진단 — e2e가 자세를 직접 읽는다 */
  level: () => ({
    level: isLevel(app.pose),
    folding: autolevel.folding(),
    fwd: forwardOf(app.pose),
    yaw: yawDir(app.pose),
    eye: app.pose.p.y,
    /** 궤도 반경 — 눈에서 pivot까지. 줌으로 정하고 접기가 지킨다(web2-06 지시 5) */
    radius: orbitRadius(app),
    pivot: orbitPivot(app),
  }),
  /** 치수 진단(web2-08 지시 4) — 앱과 같은 상태를 읽는다 */
  dim: () => ({
    mmPerUnit: app.lift.mmPerUnit,
    unit: app.doc.unit,
    target: dimTarget,
    dims: app.doc.strokes.filter(x => x.dim !== undefined).map(x => ({ id: x.id, dim: x.dim })),
    lenOf: Object.fromEntries([...app.lift.lifted].map(([id, g]) =>
      [id, lenMm(g.a3, g.b3, app.lift.mmPerUnit)])),
    // 축척(web2-32 5번) — 어느 치수가 정했는가. 판정은 `scaleOf` 하나이고 여기는 읽기다.
    scaleId: app.lift.scaleId,
    // 어긋남(web2-32 7번) — 치수마다 「적은 값 ÷ 잰 값」. **잰 값은 적용 전 길이**다.
    skew: app.doc.strokes.filter(x => x.dim !== undefined).map(x => {
      const k = dimSkew(app.lift, x.id)
      // `fold`(대칭 자 — web2-34 7번)가 판정의 값이다. `ratio`는 방향을 보려고 같이 낸다.
      return { id: x.id, ratio: k?.ratio ?? null, fold: k?.fold ?? null, measured: k?.measured ?? null, off: skewOff(k) }
    }),
    // 재기(web2-32 6번) — **도면에 남긴 것만** 문서에 있다(기본값은 아무것도 안 남긴다)
    measures: (app.doc.measures ?? []).map(m => ({
      id: m.id, a: m.a, b: m.b, mm: measureMm(app.lift, m), units: measureUnits(app.lift, m),
    })),
    measureFrom: app.measureFrom,
    measurePair: app.measurePair,
  }),
  /** **겹 표식**(web2-18 1부) — `#gl`의 Line2가 몇 개이고 그중 잉크가 몇 개인가.
   *  판정은 **합성 화면**이 한다(#67) — 이것은 «왜 그런가»를 말하는 기전의 표식이다:
   *  1부 뒤 `ink`는 언제나 0이어야 한다(잉크 몸체가 #ink로 갔다). */
  glLines: () => {
    let ink = 0
    for (const [id] of app.lift.lifted) {
      const s = app.lift.strokes.get(id)
      if (s && gradeOf(s) === 'INK') ink++
    }
    return { line2: r3d.group.children.length, liftedTotal: app.lift.lifted.size, inkLifted: ink, renderer: app.renderer }
  },
  /** 렌더러(web2-11 2부) — e2e가 두 경로를 다 돌린다(2-b) */
  renderer: () => app.renderer,
  setRenderer,
  /** 강제 전량 재그리기 ms — 성능 원장(2-f)이 획 수를 늘려가며 부른다 */
  brushRedrawMs: () => brushLayer.redrawTimed(app),
  // ── web2-18 0부 비용 원장 통로 — 진단 패널과 **같은 값**을 읽는다(원칙 a) ──
  /** ① 앱이 마지막으로 실제 그린 전량 재그리기(ms·그린 획·화면 밖으로 걸러낸 획) */
  brushLastFull: () => brushLayer.lastFull(),
  /** ㉢ 제스처 타일(web2-18 3-c) — 굽기 비용·판 수·붙이기 프레임 ms */
  tileStats: () => brushLayer.tileStats(),
  tileStatsReset: () => brushLayer.resetTileStats(),
  /** ② syncStrokes 비용 — 문서가 바뀔 때마다 */
  syncCost: () => ({ ...syncCost }),
  /** ② 강제 실행 1회의 ms — 앱과 **같은 함수**를 부른다(측정용 사본 없음). 반복 표본용 */
  syncStrokesMs: () => { syncStrokes(r3d, app); return syncCost.lastMs },
  syncCostReset: () => resetSyncCost(),
  /** ③ 프레임 3몫 합 — 국면별로 리셋해서 읽는다(누산은 국면이 섞인다) */
  frameCost: () => frameCostQ(),
  frameCostReset: () => { frameCosts = [] },
  /** ⑩ 표식 — filmLayer.draw의 두 몫(막·위 획) ms. D-1: 어느 몫이 비싼지 경로에서 낸다 */
  filmCost: () => filmLayer.cost(),
  /** ⑩ 비용 원장(cost20) — 앱과 같은 addLayer·setActiveLayer를 부른다(측정용 사본 없음) */
  layerAdd: (paper: 'tracing' | 'yellow') => {
    const l = addLayer(app, paper, { W: window.innerWidth, H: window.innerHeight })
    if (l) { setActiveLayer(app, l.id); layerbarRef?.sync() }
    return l ? l.id : null
  },
  /** 겹을 걷는다 — 화면의 「×」와 **같은 함수**다(#54). 팔이 「걷었다 다시 꺼내면 무늬가
   *  달라야 한다」(web2-20 무회귀)를 재는 데 쓴다. */
  layerRemove: (id: number) => { removeLayer(app, id); layerbarRef?.sync(); invalidate() },
  /** ④ osnap 호출당 비용의 3몫 분해 — 4부의 문턱을 이 값이 정한다 */
  osnapCost: () => ({ ...osnapCost }),
  osnapCostReset: () => resetOsnapCost(),
  /** 재그리기 분자/분모(#43) — 「그리는 중 0회」를 수로 */
  brushStats: () => brushLayer.stats(),
  /** draft 재그리기 원장(web2-12 2번) — 이동당 비용(ms 중앙·최악)과 횟수. 국면별로 리셋 */
  draftStats: () => brushLayer.draftStats(),
  draftStatsReset: () => brushLayer.resetDraftStats(),
  /** 썸네일 굽기만의 비용(web2-12 5번 — ㉮/㉯ 대비의 분리 측정. 2차 [8]) */
  captureThumb: () => captureThumb(),
  /** 진행 중인 draft — 게이트 팔이 좌표·잠정 id를 확정 획과 대조한다(web2-12 2번) */
  draft: () => draft,
  /** D-3 반증 손잡이(web2-19 1부) — 없앤 안내 파랑을 되살려 «파랑 계수 격자가 실패
   *  가능함»을 e2e가 매 실행 증명한다(graphite.spec ①-반증). UI 없음 — 여기서만 켠다. */
  forceConstructing: (v: boolean) => { setForceConstructing(v); invalidate() },
  /** 심 색의 정본(#54) — 접힌 연필 각인 팔(zones.spec ①')이 화면 값과 대조한다 */
  matColor: (g: Grade) => MAT[g].color,
  /** 섬유 타일의 픽셀 해시(web2-20 3-c 팔) — 층별 결이 실제로 다른가·결정론인가.
   *  wrap=false는 반증 전용(감싸 그리기를 뺀 타일 — 이음매 팔이 그것으로 실패를 본다). */
  fiberTileHash: (id: number, paper: 'tracing' | 'yellow', wrap = true) => {
    const c = bakeFiberTile(id, paper, dpr, wrap)
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let h = 5381
    for (let i = 0; i < d.length; i += 97) h = ((h * 33) ^ d[i]!) >>> 0
    return h
  },
  fiberTile: (id: number, paper: 'tracing' | 'yellow' | 'paper', wrap = true) => bakeFiberTile(id, paper, dpr, wrap),
  /** 바탕 종이의 결 켬/끔 — **화면의 `#chk-grain`과 같은 손잡이다**(web2-34 1번 · #54).
   *  이름은 30-9 때 그대로 둔다(그 팔들이 이 이름을 부른다). 끄면 「셋 다 지각 대역
   *  위」가 같은 실행에서 실패한다(web2-20 3부의 옛 상태로). **저장은 안 한다** —
   *  e2e가 부르는 자리라 사람의 취향(localStorage)을 덮으면 안 된다. */
  paperFiberForTest: (v: boolean) => applyPaperGrain(v, false),
  /** D-3 반증(web2-34 1번) — 바탕 종이의 알파를 **30-9 값으로 되돌린다**. 그 상태에서
   *  「바탕이 겹보다 뚜렷하게 약하다」가 같은 실행에서 실패해야 한다. e2e 전용. */
  paperGrain309ForTest: (v: boolean) => { setPaperGrain309ForTest(v); invalidate() },
  /** D-3 반증(3-e ④) — 곱→알파로 바꿔 합성 곡선 붕괴를 본다. e2e 전용. */
  filmAlphaForTest: (v: boolean) => { setFilmAlphaForTest(v); invalidate() },
  /** 손글씨 치수(web2-29 1단계) — **화면 팔의 손잡이**: 인식은 확률적이라 e2e가 값을
   *  손으로 못 만든다. 「값을 넣는 길」과 「보이는 자리」를 갈라 재려면 이 둘이 필요하다.
   *  앱 흐름은 그대로 `setDimension`·`stageDim` 하나를 지난다(#54 — 새 경로 ⛔). */
  setDimForTest: (id: number, mm: number) => { setDimension(app, id, mm); invalidate() },
  /** 두께(web2-55)의 화면 팔 손잡이 — 값 «넣는 길»(손글씨 인식)은 확률적이라 단위 팔이
   *  지키고(thick55.test의 applyRecognized 갈래), e2e는 이 손잡이로 값을 넣어 «보이는
   *  자리»(기하·픽셀)를 잰다. 앱 흐름은 그대로 setClsThickness/setFaceThicknessEx 하나다(#54). */
  setThickForTest: (fid: number, mm: number, ex?: boolean) => {
    const r = ex ? (setFaceThicknessEx(app, fid, mm) !== null ? { ex: true } : null)
      : (() => { const q = setClsThickness(app, fid, mm); return q ? { cls: q.cls, n: q.n } : null })()
    invalidate()
    return r
  },
  clearThickExForTest: (fid: number) => { setFaceThicknessEx(app, fid, undefined); invalidate() },
  /** 분류 정의 기본값(초판) — 원장 defaults 블록의 출처(1차 [5] — 근거를 원장에) */
  clsDefaults: () => DEFAULT_CLS,
  writeIdleForTest: (ms: number | null) => { app.writeIdleMsForTest = ms },
  /** 렌더 자원 요약(1차 [3] — 20면 성능의 메모리 자) — three renderer.info + 그룹 수 */
  r3dInfo: () => ({
    faceMeshes: r3d.faceGroup.children.length,
    paintMeshes: r3d.paintGroup.children.length,
    lines: r3d.group.children.length,
    gl: { geometries: r3d.renderer.info.memory.geometries, textures: r3d.renderer.info.memory.textures },
  }),
  /** 두께 진단 — 슬롯(세계 단위)과 띠 사각의 «화면» 꼭짓점(팔이 띠를 누를 자리를 이걸로 찾는다) */
  thick55: (fid: number) => {
    const rf = app.faces.find(f => f.id === fid)
    if (!rf) return null
    const info = faceThicknessNow(app, fid)
    const slots = faceSlotsOf(app, rf)
    let band: { s0: number; len: number; scr: ({ x: number; y: number } | null)[] }[] = []
    if (slots) {
      const { quads, n } = borderQuads(rf)
      const sp = (P: { x: number; y: number; z: number }) => {
        const q = project(app.lift.an, app.pose, P)
        return q ? docToScreen(app, q) : null
      }
      band = quads.map(q => ({
        s0: q.s0, len: q.len,
        scr: [
          sp(add3(q.a, mul3(n, slots.frontW))), sp(add3(q.b, mul3(n, slots.frontW))),
          sp(add3(q.b, mul3(n, slots.backW))), sp(add3(q.a, mul3(n, slots.backW))),
        ],
      }))
    }
    return { info, slots, band }
  },
  /** 접합 진단(web2-56) — 접합 기록(승부·이동량·계단 표본 사각의 화면 사영)·기각 사유
   *  (D-1 표식)·1링 통계. 값의 출처는 recompute가 세운 app.joints 하나다(#54). */
  joint56: () => {
    const j = app.joints
    const sp = (P: { x: number; y: number; z: number }) => {
      const q = project(app.lift.an, app.pose, P)
      return q ? docToScreen(app, q) : null
    }
    return {
      joins: (j?.joins ?? []).map(r => ({ ...r, probeScr: r.probe?.map(quad => quad.map(sp)) ?? null })),
      rejects: j?.rejects ?? [],
      stats: j?.stats ?? null,
    }
  },
  /** D-3 반증 ①(지시) — 병합 걸음을 끈다: 계단이 같은 실행에서 실제로 돌아온다 */
  joint56OffForTest: (v: boolean) => { setJoint56OffForTest(v); bumpDoc(app); invalidate() },
  /** D-3 반증 ②·③(지시) — 우선순위 뒤집기·코어 표시 지우기. 분류 정의 덮어쓰기를 직접
   *  갈아 끼운다(제품 손잡이는 아직 pri·core에 없다 — 55의 «들고만 있는다» 그대로). */
  joint56SetDefForTest: (cls: keyof typeof DEFAULT_CLS, patch: Record<string, unknown> | null) => {
    const d = (app.doc.clsDefs ??= {})
    if (patch === null) delete d[cls]
    else d[cls] = { ...d[cls], ...patch }
    if (Object.keys(d).length === 0) delete app.doc.clsDefs
    bumpDoc(app)
    invalidate()
  },
  /** 접합 끊기의 시험 손잡이 — 앱 경로(setStrokeNj — undo 한 칸)를 그대로 지난다(#54) */
  setNjForTest: (id: number, on: boolean) => { const r = setStrokeNj(app, id, on); invalidate(); return r },
  stageDimForTest: (text: string, mm: number | null) => { stageDim(app, text, mm); invalidate() },
  /** 사후 수정(web2-32 2번)의 **화면 팔 손잡이** — 치수 숫자가 «어디에» 그려졌는지.
   *  그리는 자리와 누르는 자리가 같은 함수라(#54) 팔은 그 자리를 눌러 본다. */
  dimLabelPosForTest: (id: number) => dimLabelPos(app, id),
  /** D-3 반증(web2-26 2번) — 결을 dpr에 도로 묶어 「dpr 비 1.0 ± 0.15」를 깨뜨린다. e2e 전용. */
  fiberLegacyForTest: (v: boolean) => { setFiberLegacyForTest(v); invalidate() },
  /** D-3 반증(web2-40 1번) — 겹의 결을 **web2-34까지의 주기**로 되돌린다(길이·개수만).
   *  그 상태에서 「겹의 결 주기가 pre-40보다 짧다」가 같은 실행에서 실패한다. e2e 전용. */
  grainPre40ForTest: (v: boolean) => { setGrainPre40ForTest(v); invalidate() },
  /** 팔 전용(web2-40 · #12) — 겹 결의 «길이 배수 K»를 갈아 끼운다. null이면 제품 값(0.5).
   *  훑기가 「K를 더 내리면 어디가 먼저 걸리는가」를 값으로 낸다. */
  grainLenKForTest: (k: number | null) => { setOverlayLenKForTest(k); invalidate() },
  /** **깔고 치우는 동작의 지금 상태**(web2-40 2번) — 화면 팔이 「동작 중인가」와
   *  「덜 온 정도」를 값으로 읽는다. 앱이 그리는 데 쓰는 **같은 함수**다(측정 경로를
   *  따로 안 만든다 — 원칙 a). `awayOf`가 0이면 그 겹은 제자리다. */
  slide: () => ({
    ms: LAY_SLIDE_MS,
    active: slidesActive(app, performance.now()),
    ghosts: app.slideGhosts.map(g => g.layer.id),
    awayOf: Object.fromEntries(
      [...app.doc.layers.map(l => l.id), ...app.slideGhosts.map(g => g.layer.id)]
        .map(id => [id, slideAwayOf(app, id, performance.now())]),
    ),
  }),
  /** 동작을 **그 자리에서 끝낸다** — 앱이 「획이 들어오면」 부르는 것과 같은 함수다(#54).
   *  팔이 「끝난 화면이 동작 없이 얹은 화면과 픽셀로 같다」를 재는 데 쓴다. */
  slideSettleForTest: () => { settleSlides(app); invalidate() },
  /** 팔 전용 — 그 겹의 창을 **다시 연다**(앱과 **같은** `startSlide`다 — 새 경로 ⛔).
   *  창이 300 ms라 200획 장면에서는 한 창이 프레임 두어 개밖에 안 된다: 「동작 중
   *  프레임」을 표본 수만큼 모으려면 창을 다시 열어야 한다(#71 ㉠ — 조건을 만든다). */
  slideRestartForTest: (id: number) => { startSlide(app, id, 'in', performance.now()); invalidate() },
  /** 팔 전용 — 다음 프레임을 그리게 한다. «바뀔 때만» 고리를 깨우는 것뿐이고 **그리는
   *  경로는 그대로**다(정지 칸과 동작 칸이 같은 수의 프레임을 돌게 하는 데 쓴다). */
  redrawForTest: () => invalidate(),
  /** 필압 보정을 값으로 세운다(web2-26 6번) — 두 획을 받는 절차는 단위 팔이 재고,
   *  화면 팔은 **값만** 필요하다. null이면 끈다(= `doc.press`를 지운다). e2e 전용. */
  pressCalForTest: (p0: number | null, p1?: number) => {
    if (p0 === null) setPressOff(app)
    else { app.doc.press = { on: true, p0, p1: p1 ?? 0.35, gamma: 1 }; bumpDoc(app) }
    invalidate()
  },
  // web2-22 3부 — e2e가 임계를 실제로 넘겨 보는 손잡이(작은 상한 주입) + 마지막 실측
  autosaveLimitForTest: (n: number | null) => filePanelRef?.limitForTest(n),
  autosaveLast: () => filePanelRef?.last() ?? null,
  // ── web2-43 — **저장소를 그 런타임에서 본다**(#94: 문면이 아니라 행위를 잰다) ──
  /** 저장소에 실제로 든 것 — 지금 문서의 열쇠·목록·저장물·썸네일 */
  storeDump: () => filePanelRef?.dump() ?? Promise.resolve(null),
  /** 예약된 저장을 앞당긴다 — 팔이 「저장됐다」를 기다리는 자리(상한 있는 대기 #95) */
  storeFlush: () => filePanelRef?.flush() ?? Promise.resolve(),
  /** 지금 문서의 정체(이름·열쇠·시각) */
  docNow: () => filePanelRef?.current() ?? null,
  /** 저장소를 실제로 실패시킨다(D-3의 반증 손잡이) — 이전 실패 게이트가 이것을 쓴다 */
  storeFailForTest: (m: 'open' | 'put' | 'verify' | null) => setStoreFailForTest(m),
  /** 저장소를 **앱과 같은 함수로** 만진다 — 팔이 제 경로를 따로 만들면 그것을 재게 된다(#88).
   *  스펙이 `/src/core/store.ts`를 직접 들여오면 타입도 번들도 그 길을 모른다. */
  store: {
    list: () => listDocs(),
    get: (id: string) => getDoc(id),
    put: (rec: Parameters<typeof putDoc>[0]) => putDoc(rec),
    newId: (now: number) => newDocId(now),
    migrate: (now: number) => migrateFromLocal(now),
  },
  /** 최근 목록을 다시 그린다 — 팔이 저장소를 직접 만졌을 때 화면을 맞춘다 */
  recentSync: () => filePanelRef?.sync(),
  /** 목록에 **보이는** 수(저장소에는 다 있다) — 팔이 상수를 다시 안 적게 한다(#88) */
  recentLimit: () => C.RECENT_LIMIT,
  /** 오스냅 판정 그대로(web2-12 8번) — 넘김 꼬리가 스냅 대상이 아님을 팔이 잰다 */
  osnapAt: (x: number, y: number) =>
    osnap(app.lift, app.pose, { x, y }, { ...app.osnap, radius: app.osnap.radius / viewScale(app) },
      undefined, undefined, app.extAcq.acquired),
  /** 연장선 **선언** 상태(web2-30 11번) — e2e가 «왕복 없이는 절대 안 선다»를 잰다.
   *  ⚠ `hover`는 없어졌다(머무름 획득이 왕복 선언으로 바뀌었다) — 대신 왕복의 진행을 준다. */
  extAcq: () => ({
    acquired: app.extAcq.acquired.map(a => ({ ...a })),
    farD: app.extAcq.farD, declaredAt: app.extAcq.declaredAt,
  }),
  /** 마지막 확정 획의 스냅 종류(2-c) — 진단 패널과 **같은 값** */
  lastSnap: () => app.lastSnap,
  /** classic 쪽 비교치 — 같은 장면의 draw2d 1회 ms(질감 grain 포함) */
  draw2dMs: () => {
    const t0 = performance.now()
    draw2d(ctx, app, draft, hover, eraserPos, facePrev, dimInkLive)
    return performance.now() - t0
  },
  /** 성능 픽스처용 획 주입 — 실입력 경로(commitStroke)와 같은 함수를 부른다(2-f).
   *  ⚠ 측정 전용이다 — 앱 흐름은 여전히 onCommit 하나로 들어온다. */
  commitStroke: (ax: number, ay: number, bx: number, by: number,
    opts?: { press?: number[]; grade?: Grade }) => {
    // 점별 필압(rawIn)을 실으려면 **raw가 나란해야** 한다(commitStroke의 채택 조건 그대로 —
    // 측정용 우회로를 안 만든다). raw는 두 끝을 잇는 등간격 점열이다.
    // 재료의 출처는 `activeGrade`(도구 + 경도) 하나다 — 여기서 다른 길을 안 만든다:
    // 잉크는 «펜», 나머지는 «연필 + 그 경도»다(state.ts §22의 규칙 그대로).
    const t0 = app.tool, g0 = app.grade
    if (opts?.grade) {
      if (opts.grade === 'INK') app.tool = 'pen'
      else { app.tool = 'pencil'; app.grade = opts.grade }
    }
    let r: ReturnType<typeof commitStroke>
    if (opts?.press && opts.press.length > 2) {
      const n = opts.press.length
      const raw = Array.from({ length: n }, (_, i) => ({
        x: ax + ((bx - ax) * i) / (n - 1), y: ay + ((by - ay) * i) / (n - 1),
      }))
      r = commitStroke(app, { x: ax, y: ay }, { x: bx, y: by }, raw, undefined, { press: opts.press })
    } else {
      r = commitStroke(app, { x: ax, y: ay }, { x: bx, y: by })
    }
    if (opts?.grade) { app.tool = t0; app.grade = g0 }
    return r
  },
  /** 입력 캡처 진단(web2-11 1부) — 패널과 **같은 자료**를 읽는다(문자열 파싱 없이) */
  capture: () => ({
    stroke: inputApi?.strokeStats() ?? null,
    tally: diagPanel.tally(),
    lastRaw: diagPanel.lastRaw(),
    eraserBitSeen: diagPanel.eraserBitSeen(),
    pressureLevels: diagPanel.pressureLevels(),
    brnlBytes: brnlBytes(),
  }),
  // ── 밑그림(web2-23) ────────────────────────────────────────────────────
  /** 구운 밑그림을 읽는다 — 겹 id를 주면 그것, 안 주면 전부의 요약(조각·가림 수) */
  underlay: (layer?: number) => layer === undefined
    ? app.doc.underlays.map(u => ({ layer: u.layer, segs: u.segs.length, hidden: u.segs.filter(g => g.hidden).length }))
    : underlayOf(app.doc, layer),
  /** **표현 팔 전용**(2부 ①③) — 밑그림을 심는다. 굽기의 «정확성»은 단위 팔이 값으로
   *  재고(make2d.test), 화면 팔이 재는 것은 «그 자료가 이렇게 그려지는가»다: 자리와
   *  깃발을 못 박아야 F·H 대역을 픽셀에서 가를 수 있다. 앱 경로는 안 바뀐다. */
  underlaySetForTest: (layer: number, segs: { a: { x: number; y: number }; b: { x: number; y: number }; hidden: boolean }[]) => {
    const u = underlayOf(app.doc, layer)
    if (!u) return false
    u.segs = segs.map(g => ({ a: { ...g.a }, b: { ...g.b }, hidden: g.hidden }))
    invalidate()
    return true
  },
  /** 굽기 호출 수 — 「다시 안 굽는다」를 **실패할 수 있게** 재는 값(2차 리뷰 [8]) */
  underlayBakes: () => underlayBakeCount(),
  /** D-3 반증 손잡이(web2-25 5-b) — 저장 좌표 반올림을 끈다. 팔이 «반올림 있는 문서»와
   *  «없는 문서»를 **같은 재그리기 경로로** 나란히 놓고 픽셀을 견준다(roundsave.spec). */
  saveRound: (v: boolean) => setSaveRoundForTest(v),
  /** 셔터 번쩍임의 길이(3-a) — 팔이 상수를 직접 안 읽고 **앱이 쓰는 값**을 읽는다(D-C4) */
  shutterMs: () => C.SHUTTER_FLASH_MS,
  showHidden: (v?: boolean) => { if (v !== undefined) { app.showHidden = v; invalidate() } return app.showHidden },
  /** **보기 렌즈**(web2-31 2번) — 팔이 「문서 → 화면」을 손으로 펴지 않게 합성된 변환을 그대로 준다(#54).
   *  ⚠ 이것은 **진단 통로**다(`S2S`) — 화면에 나가는 값이 아니다(D-L55는 `fSource`에 걸리고
   *  그 값은 종전대로 `summary()`에만 있다). */
  /** **일곱 뷰와 투영**(web2-42) — 화면이 읽는 것과 **같은 함수**를 팔이 읽는다(#88:
   *  팔이 이름표·배율을 손으로 다시 짓지 않는다). `read`가 화면에 실제로 뜨는 문자열이다. */
  view42: () => {
    const an = app.lift.an
    const px = parallelPxPerUnit(app)
    return {
      name: viewName(an, app.pose),
      parallel: isParallel(app.pose),
      centerR: C.CUBE_CENTER_R,   // 팔이 가운데 대역을 **앱에서** 읽는다(#88)
      w: projW(app.pose),
      D: app.pose.proj?.D ?? null,
      allowed: parallelAllowed(an),
      pxPerUnit: px,
      mmPerUnit: app.lift.mmPerUnit,
      denom: scaleDenom(app.lift.mmPerUnit, px ?? 0),
      focal35: an.f === null ? null : focal35mm(lensF(an, app.viewF)!, an.diag),
      read: document.getElementById('lens-read')!.textContent,
      horizon: horizonScreenY(an, app.pose),
      vpMarks: vpMarks(an, app.pose).length,
    }
  },
  lens: () => ({
    allowed: lensAllowed(app.lift.an),
    viewF: app.viewF,
    f: app.lift.an.f,
    k: lensK(app.lift.an, app.viewF),
    stops: lensStops(app.lift.an, app.viewF),
    hfov: app.lift.an.f === null ? null : hfovDeg(lensF(app.lift.an, app.viewF)!, app.lift.an.W),
    xf: viewXf(app),
  }),
  /** **대기의 색**(web2-37 2번) — 값과 D-3 반증 손잡이가 같은 자리에 있다.
   *  인자 없이 부르면 읽기다. `off`(청색 끔) · `all`(확정에도 칠함)이 위약 판이고,
   *  팔은 **여기서 색을 읽어** 기대값을 만든다(#88 — 팔이 색을 손으로 안 든다). */
  waitInk: (mode?: WaitInkMode) => {
    if (mode !== undefined) { setWaitInkMode(mode); bumpDoc(app); invalidate() }
    const now = performance.now()
    return {
      mode: waitInkMode(),
      ink: WAIT_INK,
      settleMs: SETTLE_ANIM_MS,
      settling: [...app.settledAt.entries()]
        .filter(([, t]) => now - t < SETTLE_ANIM_MS)
        .map(([id, t]) => ({ id, elapsed: now - t })),
    }
  },
  /** **잡기**(web2-44) — 팔이 화면과 같은 상태를 읽는다(#88: 값을 손으로 안 짓는다). */
  grip44: () => {
    const sb = document.getElementById('sidebar')!.getBoundingClientRect()
    return {
      ids: app.grip?.ids ?? null,
      faceId: app.grip?.faceId ?? null,
      manip: app.grip?.manip
        ? { kind: app.grip.manip.kind, amount: app.grip.manip.amount, axis: app.grip.manip.axis, label: manipLabel(app) }
        : null,
      live: app.grip?.live ?? null,
      writeOn: writeActive(app),
      writeManip: app.write?.manip === 1,
      writeTarget: app.write?.target ?? null,
      locked: app.doc.strokes.filter(s => s.lock === 1).map(s => s.id),
      // 띠 재편의 판정자 — 세로바 상자와 화면 높이(여유는 팔이 이 둘로 계산한다)
      bar: { top: sb.top, bottom: sb.bottom, left: sb.left, right: sb.right, winH: window.innerHeight, winW: window.innerWidth },
    }
  },
  /** 면의 화면 bbox(web2-45 [8]㉡ — 인접 면 «폭 0» 실측) — 사영은 앱의 project 하나다(#54). */
  faceScreenBox45: (id: number) => {
    const f = app.faces.find(x => x.id === id)
    if (!f) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const P of f.outer) {
      const q = project(app.lift.an, app.pose, P)
      if (!q) return null
      const sp = docToScreen(app, q)
      if (sp.x < x0) x0 = sp.x; if (sp.x > x1) x1 = sp.x
      if (sp.y < y0) y0 = sp.y; if (sp.y > y1) y1 = sp.y
    }
    return { w: +(x1 - x0).toFixed(4), h: +(y1 - y0).toFixed(4) }
  },
  /** **면·칠·해칭**(web2-45) — 팔이 화면과 같은 상태를 읽는다(#88). */
  paint45: () => ({
    tool: app.tool,
    paints: app.doc.strokes.filter(s => s.paint !== undefined)
      .map(s => ({ id: s.id, f: s.paint!.f, n: (s.raw ?? []).length, grade: s.mat?.grade ?? 'HB' })),
    geoIds: [...app.paintGeo.keys()],
    hatchMode: getHatchMode(),
    hatch: r3d.hatchGroup.children.map(h => ({
      f: (h.userData as { faceId?: number }).faceId ?? null,
      order: h.renderOrder,
      segs: ((h as unknown as { geometry: { getAttribute(n: string): { count: number } } }).geometry.getAttribute('position')?.count ?? 0) / 2,
    })),
    faceOrder: r3d.faceGroup.children.map(m => ({
      f: (m.userData as { faceId?: number }).faceId ?? null, order: m.renderOrder,
    })),
    faces: app.doc.faces.map(f => ({
      id: f.id, cls: f.cls ?? null, now: faceClassNow(app, f.id), fill: f.fill === 1,
      resolved: app.faces.some(x => x.id === f.id),
    })),
  }),
  /** **숫자와 표시**(web2-47) — 팔이 화면과 같은 상태를 읽는다(#88). */
  nums47: () => ({
    persons: (app.doc.persons ?? []).map(q => ({ id: q.id, g: { ...q.g } })),
    placePerson: app.placePerson,
    floor: floorAreaNow(app),
    volume: volumeNow(app),
    gripArea: gripFaceArea(app),
    hl: app.hlFaces,
    rooms: (() => { const g = roomsNow(app); return { n: g.rooms.length, links: g.links.length, areas: g.rooms.map(r => +r.areaU2.toFixed(6)) } })(),
    showRooms: app.showRooms,
  }),
  /** **재료**(web2-46) — 칠 선택·면 재료·순서 반증 손잡이. */
  mats46: () => ({
    markerSpacing: C.MARKER_SPACING,
    /** e2e 원장의 constants_used 몫(2차 [9]) — 판정에 드는 상수를 원장이 스스로 든다 */
    constants: { MARKER_SPACING: C.MARKER_SPACING, MARKER_W_PX: C.MARKER_W_PX, CP_W_PX: C.CP_W_PX, HATCH_ALPHA: C.HATCH_ALPHA, HATCH_SPACING_PX: C.HATCH_SPACING_PX },
    paintSel: { ...app.paintSel },
    faceMats: app.doc.faces.map(f => ({ id: f.id, mat: f.mat ?? null, fill: f.fill ?? null })),
    paints: app.doc.strokes.filter(s => s.paint !== undefined)
      .map(s => ({ id: s.id, f: s.paint!.f, s: s.paint!.s ?? null, c: s.paint!.c ?? null, w: s.paint!.w ?? null, i: s.paint!.i ?? null })),
  }),
  /** **재료 표현**(web2-49) — 팔이 렌더의 결정(계열별 보임 — 쪽·밀도 하한)을 읽고,
   *  순환은 **앱과 같은 함수**(`cycleFaceRep`)를 부른다(측정 경로와 앱 경로를 안 가른다). */
  rep49: () => ({
    faces: app.doc.faces.map(f => ({ id: f.id, rep: f.rep ? { ...f.rep } : null })),
    mmPerUnit: app.lift.mmPerUnit,
    children: r3d.repGroup.children.map(h => ({
      f: (h.userData as { faceId?: number }).faceId ?? null,
      stepMm: (h.userData as { repStepMm?: number }).repStepMm ?? null,
      visible: h.visible,
      /** 판정 내역(2차 [4]) — gateRep이 남긴 «왜»: side(쪽)·lod(밀도)·pxPerMm */
      gate: (h.userData as { gate?: { side: boolean; lod: boolean; pxPerMm?: number | null } }).gate ?? null,
      order: h.renderOrder,
      segs: ((h as unknown as { geometry: { getAttribute(n: string): { count: number } } }).geometry.getAttribute('position')?.count ?? 0) / 2,
    })),
    constants: { REP_MIN_PX: C.REP_MIN_PX, REP_BRICK_COURSE_MM: C.REP_BRICK_COURSE_MM, REP_BRICK_MODULE_W_MM: C.REP_BRICK_MODULE_W_MM, REP_FRAME_BUDGET_MS: C.REP_FRAME_BUDGET_MS, REP_ZOOM_RETENTION_TOL: C.REP_ZOOM_RETENTION_TOL },
  }),
  cycleRep49: (faceId: number) => cycleFaceRep(app, faceId),
  /** 면 텍스처(web2-50) — 팔의 판정 통로 셋: 요약(자리·단계·보임) · 파생 증명의 오염 ·
   *  합성 반증(곱 → 보통 — 켜면 증상 ①②가 되살아나야 한다 · D-3 · #30) */
  paintTex: () => paintTexStats(),
  /** web2-64 게이트 ① — 굽힌 텍스처의 픽셀 해시(면·쪽별) */
  paintTexHash: () => paintTexHashForTest(),
  /** web2-65 — 굽기 계수기(D-1 표식 · 게이트 ②③④의 자): 재굽기 수·재굽힌 획 수·업로드 바이트·ms */
  paintBake: () => paintBakeStats(),
  paintBakeReset: () => { resetPaintBakeStats() },
  /** web2-65 ⑥ 반증 — 누적을 끈다(pre의 O(N)이 돌아온다) · 부분 업로드를 끈다(픽셀은 같아야 한다) */
  setPaintAccumOffForTest: (v: boolean) => { setPaintAccumOffForTest(v); invalidate() },
  setPaintPartialOffForTest: (v: boolean) => { setPaintPartialOffForTest(v); invalidate() },
  /** web2-65 ⑤ — 텍스처 바이트 상한을 낮춰 축출을 «실제로» 일으킨다(게이트 ⑦) */
  setPaintTexBudgetForTest: (bytes: number) => { setPaintTexBudgetForTest(bytes); invalidate() },
  /** web2-65 ① 반증 — 누적 얹기의 «바탕 되깔기»를 끈다: 켜면 중심 게이트(픽셀 항등)가 «빨개져야» 한다 */
  setPaintAppendBreakForTest: (v: boolean) => { setPaintAppendBreakForTest(v); rebakePaintTexForTest(); invalidate() },
  /** web2-67 0-6 — 지우개 상태(팔이 화면과 같은 값을 읽는다 #88) */
  paintEraseForTest: () => ({ on: app.paintErase, w: app.eraseSel.w, soft: app.eraseSel.soft, tipErase: app.tipErase }),
  /** web2-67 §1 게이트 ⑦ 반증 — 펜/손가락 판별 끔(옛 판: 펜도 6px 탭 · 손가락 탭 무위) */
  setGestureSplitOffForTest: (v: boolean) => { app.gestureSplitOff = v },
  /** web2-67 §2 반증(이자 D-2 재현) — 무늬 선 굵기 계단을 열쇠에서 뺀다(옛 낡은 그림이 돌아온다) */
  setRepTexelSigOffForTest: (v: boolean) => { setRepTexelSigOffForTest(v); invalidate() },
  /** web2-67 0-2 반증 — 컬러피커 잠금 끔(이동마다 partAt — 옛 거동: 코너에서 링으로 넘어간다) */
  setWheelLockOffForTest: (v: boolean) => { wheelLockOff = v },
  /** web2-67 0-3 반증 — 옛 «점군» 판(step px 격자)으로 다시 굽는다 · 0 = 제품(그라디언트) */
  setWheelStepForTest: (v: number) => { setWheelStepForTest(v) },
  /** web2-67 0-3·0-4 — 휠 기하(값): 크기·고리 두께·판 한 변. 팔이 화면과 같은 값을 읽는다(#88) */
  wheelGeom67: () => ({ ...WHEEL, S: WHEEL.rOut * 2 + 4, ringPx: WHEEL.rOut - WHEEL.rIn, sv: svRect(WHEEL) }),
  paint50Constants: () => ({ FACETEX_MIN_PX: C.FACETEX_MIN_PX, FACETEX_MAX_PX: C.FACETEX_MAX_PX,
    PAINT_MARKER_ALPHA: C.PAINT_MARKER_ALPHA, PAINT_CP_ALPHA: C.PAINT_CP_ALPHA,
    PAINT_W_FALLBACK_UNITS: C.PAINT_W_FALLBACK_UNITS,
    PAINT50_LUM_TOL: C.PAINT50_LUM_TOL, PAINT50_FORESHORTEN_TOL: C.PAINT50_FORESHORTEN_TOL,
    PAINT62_CAP_TOL: C.PAINT62_CAP_TOL, PAINT62_EDGE_ALPHA_LO: C.PAINT62_EDGE_ALPHA_LO, PAINT62_EDGE_ALPHA_HI: C.PAINT62_EDGE_ALPHA_HI,
    PAINT62_FRINGE_TOL: C.PAINT62_FRINGE_TOL, PAINT62_GREEN_HUE: C.PAINT62_GREEN_HUE, PAINT62_GREEN_SAT: C.PAINT62_GREEN_SAT,
    PAINT62_SMUDGE_RG_MIN: C.PAINT62_SMUDGE_RG_MIN, PAINT62_PAINTED_ALPHA: C.PAINT62_PAINTED_ALPHA, PAINT62_SIG_DIGITS: C.PAINT62_SIG_DIGITS,
    PAINT62_DISTINCT_MIN: C.PAINT62_DISTINCT_MIN,
    PAINT63_DISTINCT_REL: C.PAINT63_DISTINCT_REL, PAINT63_AC_MARGIN: C.PAINT63_AC_MARGIN, PAINT63_AC_MAX: C.PAINT63_AC_MAX,
    PAINT63_TILE_CORR_MAX: C.PAINT63_TILE_CORR_MAX, PAINT63_TILE_CORR_TIP_MAX: C.PAINT63_TILE_CORR_TIP_MAX, PAINT63_TILE_RATIO_TOL: C.PAINT63_TILE_RATIO_TOL, PAINT63_SEAM_RATIO_MAX: C.PAINT63_SEAM_RATIO_MAX, PAINT63_SAMESPOT_CORR: C.PAINT63_SAMESPOT_CORR, PAINT63_ASPECT_WIDTH_RATIO_MIN: C.PAINT63_ASPECT_WIDTH_RATIO_MIN,
    PAINT50_PATTERN_MIN_PX: C.PAINT50_PATTERN_MIN_PX, PAINT50_LINE_INK_MIN_PX: C.PAINT50_LINE_INK_MIN_PX,
    MATS52_SCALE_TOL: C.MATS52_SCALE_TOL, MATS52_TWO_LAYER_MIN: C.MATS52_TWO_LAYER_MIN, REP_MIN_PX: C.REP_MIN_PX,
    PAINT59_PREVIEW_DIFF_MAX: C.PAINT59_PREVIEW_DIFF_MAX, PAINT59_CROSS_TOL: C.PAINT59_CROSS_TOL, PAINT59_DRAFT_FRAME_EXTRA_MS: C.PAINT59_DRAFT_FRAME_EXTRA_MS,
    PAINT61_END_TOL: C.PAINT61_END_TOL, PAINT61_PAPER_CORR_MIN: C.PAINT61_PAPER_CORR_MIN,
    PAINT61_DRAFT_FRAME_EXTRA_DPR2_MS: C.PAINT61_DRAFT_FRAME_EXTRA_DPR2_MS, PAINT61_SIZE_TOL: C.PAINT61_SIZE_TOL,
    PAINT64_DENSITY_TOL: C.PAINT64_DENSITY_TOL, PAINT64_WET_MIN_PX: C.PAINT64_WET_MIN_PX,
    PAINT67_MOUSE_TAP_MAX_PX: C.PAINT67_MOUSE_TAP_MAX_PX, PAINT67_FINGER_TAP_MAX_PX: C.PAINT67_FINGER_TAP_MAX_PX,
    PAINT67_DOT_FRAC: C.PAINT67_DOT_FRAC, PAINT67_DOT_MIN_PX: C.PAINT67_DOT_MIN_PX,
    PAINT65_TEX_BUDGET_BYTES: C.PAINT65_TEX_BUDGET_BYTES, PAINT65_COMMIT_MS_SPREAD_MAX: C.PAINT65_COMMIT_MS_SPREAD_MAX }),
  /** 저장물 원문(파일 저장과 같은 함수 — #54) — paint50 팔이 «텍스처가 파일에 없다»를 잰다 */
  serialize: () => serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView }),
  corruptPaintTex: () => { const n = corruptPaintTexForTest(); invalidate(); return n },
  rebakePaintTex: () => { rebakePaintTexForTest(); invalidate() },
  /** 마커 평면 덮어쓰기 반증(D-3 · mats46 ②) — 켜면 겹 계단이 죽는 대역으로 재굽기 */
  setMarkerFlatForTest: (v: boolean) => { setMarkerFlatForTest(v); rebakePaintTexForTest(); invalidate() },
  /** 51 반증 둘(D-3) — 압력 평탄화 · 결 끔. 켜고 재굽기 — 해당 게이트가 죽어야 한다 */
  setPressFlatForTest: (v: boolean) => { setPressFlatForTest(v); rebakePaintTexForTest(); invalidate() },
  setPaintOpaqueForTest: (v: boolean) => { setPaintOpaqueForTest(v); rebakePaintTexForTest(); invalidate() },
  // (web2-61) 26-6의 프로필 함수(paintDensity·paintWidthFactor)는 옛 엔진과 함께 갔다 —
  // 압력 응답은 이제 엔진(브러시 정의의 pressure 곡선)의 것이다. paintProfile 통로도 걷었다.
  setGrainOffForTest: (v: boolean) => { setGrainOffForTest(v); rebakePaintTexForTest(); invalidate() },
  setPaintBlendForTest: (v: boolean) => { setPaintBlendForTest(v); invalidate() },
  /** **안 실린 수리를 손으로 걸어 보는 손잡이**(web2-48 48-1 — 수리는 되돌렸다).
   *  `true` = 잉크 겹을 **곱**으로 얹는다(흰 장막이 사라진다) · `false` = **출하 상태**.
   *  왜 안 실었는가: 이 겹은 «종이 위의 잉크»가 아니라 **#gl의 몸체 위에 얹히는 질감**
   *  이라 통짜로 곱하면 질감 × 몸체로 **흑연이 두 번 어두워진다** — `press26.spec` ②
   *  실측(dpr2 · p=0.20): 꺼짐 185.3 → 128.9 · 켬 196.0 → 127.1로 **보정의 순서까지 뒤집혔다**.
   *  `paint48.spec` ①이 증상·수리·되돌림 셋을 **같은 실행에서** 낸다. */
  setInkBlend: (v: boolean) => {
    for (const id of ['brushc', 'brushsnap']) {
      const el = document.getElementById(id)
      if (el) (el as HTMLElement).style.mixBlendMode = v ? 'multiply' : ''
    }
  },
  /** D-3 반증 손잡이(45 DEFERRED 「픽셀 순서 판별은 46 몫」) — 화가 알고리즘을 끈다.
   *  render3d의 그 손잡이를 그대로 노출한다(#54 — 여기서 다른 정렬을 만들지 않는다). */
  setFaceSort: (v: boolean) => { setFaceSortForTest(v); invalidate() },
  /** 팔이 상태를 손으로 밀고 난 뒤 한 프레임을 수동으로 청한다(web2-48 ② — 포즈를
   *  평면 건너편으로 옷긴 뒤). 버튀은 이미 있는 것을 내놓을 뿐이다 — 새 기제 ⛔. */
  invalidate: () => invalidate(),
  /** 면의 **그리는 차례와 시선 깊이**를 한 자리에서 낸다(web2-48 ⑤). 팔이 «먼 면이
   *  먼저 그려지는가»를 재려면 둘을 **같은 프레임**에서 읽어야 한다 — 깊이를
   *  팔이 따로 셀으면 그것은 앱이 쓰는 값이 아니다(#54 · 45-1의 orderByDepth와 같은 식). */
  faceDepths: () => {
    const p = app.pose.p, q = app.pose.q
    const fx = -2 * (q.x * q.z + q.w * q.y)
    const fy = -2 * (q.y * q.z - q.w * q.x)
    const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
    return r3d.faceGroup.children.map(m => {
      const u = m.userData as { faceId?: number; centroid?: { x: number; y: number; z: number } }
      const c = u.centroid ?? { x: 0, y: 0, z: 0 }
      return { f: u.faceId ?? null, order: m.renderOrder,
        depth: +((c.x - p.x) * fx + (c.y - p.y) * fy + (c.z - p.z) * fz).toFixed(6) }
    })
  },
  /** spacing 대조 팔(1차 [2][3]) — 같은 획·같은 경로에서 0.03과 출하값을 잰다 */
  setMarkerSpacing: (v: number) => { brushLayer.setMarkerSpacingForTest(v); invalidate() },
  summary: () => ({
    horizonY: app.lift.an.horizonY,
    screenHDeclared: app.lift.an.screenHDeclared,
    p1Locked: app.lift.an.p1Locked,
    drawView: app.drawView,
    waitWhy: [...app.lift.waitWhy.entries()],
    horizonPref: app.horizonPref,
    horizonShown: horizonVisible(app, window.innerWidth, window.innerHeight),
    vps: app.lift.an.vps.map(v => ({ x: v.x, y: v.y })),
    f: app.lift.an.f,
    fSource: app.lift.an.fSource,
    lifted: app.lift.lifted.size,
    waiting: app.lift.waiting,
    faces: app.faces.map(f => ({
      id: f.id, n: f.outer.length, holes: f.holes.map(h => h.length),
      tris: f.tris.length / 3, flat: f.flat,
    })),
    docFaces: app.doc.faces.length,
    strokes: app.doc.strokes.length,
    pose: app.pose,
    view: app.view,
  }),
}

declare global { interface Window { __b2?: { app: typeof app; diag: typeof diag; widthOfMat: typeof widthOfMat } } }
// `widthOfMat`을 함께 내보낸다(web2-30 2번) — 획의 굵기는 **`mat.w`가 아니라 이 함수**가
// 정한다(기본 촉이면 `mat.w`가 아예 없다). 팔이 그 사실을 우회해 상수를 베끼면 #54가 깨진다.
window.__b2 = { app, diag, widthOfMat }
// web2-63 — 팁 아틀라스·종이 높이맵을 푼다(비동기). 준비 전 자국은 절차 타원(62)이고 준비되면 굽기 텍스처를 한 번 다시 굽는다.
//   팔은 diag.tipsReadyForTest()를 기다린다(#105 — 폴백은 값으로 보인다).
void loadTipAssets().then(() => { onTipAssetsLoaded(); rebakePaintTexForTest(); invalidate() })
