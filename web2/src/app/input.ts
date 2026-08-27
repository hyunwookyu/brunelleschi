// 입력 배정 — 펜: 그리기 · 손가락 1개: 궤도 · 손가락 2개: 팬+줌 · 마우스: 데스크톱 확인용.
// 팜 리젝션: 펜이 닿아 있는 동안 터치를 무시한다(잉크·카메라 양쪽).
// 데스크톱 선례(SketchUp): 중버튼 궤도, 우버튼 팬, 휠 줌.

import type { App } from './state'
import {
  orbitPivot, orbitBy, dollyBy, panBy, setPose, beginErase, eraseAt, endErase,
  screenToDoc, isEraser, toggleFaceAt, facePreview, beginNavHold, endNavHold,
} from './state'
import { osnap, type OsnapHit } from '../core/osnap'
import { updateExtDwell } from '../core/extacq'
import { isLevel, pitchSnaps } from '../core/level'
import type { LevelHooks } from './autolevel'
import { resolveStart, resolveEnd, resolveCommit, isStray } from '../core/draft'
import { filmSplit } from './filmlayer'
import { C } from '../core/constants'
import { cubeGeom, cubeHit, poseForElem } from '../core/viewcube'
import type { Draft } from './render2d'
import type { RawInput } from '../core/types'
import { type Pt, pt } from '../core/vec'

/** 최근 획의 캡처 통계(web2-11 1-a·1-f) — 진단 패널·e2e 원장이 읽는다 */
export interface StrokeCapStats {
  pointerType: string
  /** 브라우저가 실제로 전달한 move 이벤트 수 */
  events: number
  /** 획에 실린 점 수(coalesced 포함, 시작점 포함) */
  points: number
  /** coalesced로 «더» 받은 점 수 = Σ(묶음 크기 − 1). 안 썼으면 버려졌을 수다. */
  extra: number
}

export interface InputCallbacks {
  onDraftChange: (d: Draft | null) => void
  onHover: (h: OsnapHit | null) => void
  /** press — 펜 필압 평균 (마우스는 undefined) · rawIn — 점별 필압·기울기(펜만, 1-c) */
  onCommit: (a: Pt, b: Pt, raw: Pt[], press?: number, rawIn?: RawInput) => void
  /** 지우개 커서 위치 (지우개 도구일 때) */
  onEraserMove: (p: Pt | null) => void
  /** 면 도구의 미리보기 — 지금 탭하면 무엇이 될지(원칙 d) */
  onFacePreview: (f: { poly: Pt[]; mode: 'add' | 'remove' } | null) => void
  /** 면 지정·해제 결과 — 알림 한 줄이 이것을 읽는다 */
  onFaceToggle: (r: 'added' | 'removed' | 'none') => void
}

export function initInput(
  canvas: HTMLCanvasElement, app: App, cb: InputCallbacks, level: LevelHooks,
) {
  let draft: Draft | null = null
  let penDown = false
  let drawingPointer: number | null = null
  let drawingType = ''
  let pressSamples: number[] = []
  // 점별 표본(1-c) — draft.raw와 **나란히** 쌓인다(같은 이벤트에서 같이 push).
  // 양자화는 확정 때 한 번(quantIn) — 그리는 중에는 날값을 든다.
  let samples: { p: number; tx: number | null; ty: number | null; tw: number | null }[] = []
  // 최근 획 통계(1-a·1-f). 값의 성격: 마지막으로 **끝난** 획이 아니라 «지금까지» —
  // 그리는 중에도 갱신되어 패널이 실시간으로 읽는다.
  let capStats: StrokeCapStats = { pointerType: '', events: 0, points: 0, extra: 0 }

  /** coalesced 묶음(1-a) — 없는 브라우저·합성 이벤트(빈 목록)는 `[e]`로 떨어진다.
   *  `app.coalesce = false`가 반증 손잡이다(D-3: 끄면 점 수가 이벤트당 1로 떨어진다). */
  const bundleOf = (e: PointerEvent): PointerEvent[] => {
    if (!app.coalesce) return [e]
    const evs = e.getCoalescedEvents?.()
    return evs && evs.length > 0 ? evs : [e]
  }
  /** 점별 표본 하나 — 기울기·twist는 **관측 그대로**(안 오면 null. 1-b: 폴백은 2부가
   *  이 관측에서 정한다 — 여기서 0을 지어 넣으면 마우스가 «수직 펜»이 된다). */
  const sampleOf = (e: PointerEvent) => ({
    p: e.pressure,
    tx: typeof e.tiltX === 'number' ? e.tiltX : null,
    ty: typeof e.tiltY === 'number' ? e.tiltY : null,
    tw: typeof (e as any).twist === 'number' ? (e as any).twist : null,
  })
  // ── 펜의 지우개 끝(web2-15 2-b) ─────────────────────────────────────
  // 실기기 관측(Wacom Pro Pen 3E · MovinkPad Pro 14 · 안드로이드 15 크롬):
  // **지우개로 그리는 내내 `buttons`가 32**다. 일반 펜 접촉은 `buttons 1`이라 깨끗이
  // 갈린다. `button === 5`는 누름·뗌 «순간»에만 오므로 판정에 못 쓴다 — 정본은 이 비트다.
  // ⚠ 이 비트가 없으면 **절대 전환하지 않는다.** 다른 신호로 추측하지 않는다
  // (「조용히 틀린 배치를 만들지 않는다」의 지우개판 — 잘못 감지하면 그리다가 지워진다).
  // ⚠ 호버에는 신호가 없다(실기기 확인: 「호버링만 할 땐 뜨지 않는다」) — 그래서 판정도
  // 커서도 **닿아야** 뜬다. 호버 미리보기는 불가능하다(HANDOFF에 적었다).
  const TIP_ERASE_BIT = 32
  const isTipErase = (e: PointerEvent) => e.pointerType === 'pen' && (e.buttons & TIP_ERASE_BIT) !== 0
  /** 지금 획을 지우개로 보내는가 — 끝이 켰거나(획 하나) 사이드바 도구가 지우개거나 */
  const erasingNow = () => app.tipErase || isEraser(app.tool)
  /** 무엇을 지우는가 — 끝은 **연필 지우개**가 기본이다(DECISIONS 「제도 매체」: 가장 흔한
   *  동작이고 선따기가 그것이다. 잉크 지우개는 드물고 파괴적이라 명시적 선택으로 남긴다). */
  const eraseKind = () => (app.tipErase ? 'eraser-pencil' as const : undefined)

  const touches = new Map<number, Pt>()
  let lastTouchMid: Pt | null = null
  let lastTouchDist = 0
  let orbitBtn: { last: Pt; mode: 'orbit' | 'pan' } | null = null
  let faceDown: Pt | null = null

  /** 화면 좌표 (뷰 오프셋 적용 전) */
  const toScreen = (e: PointerEvent | WheelEvent): Pt => {
    const r = canvas.getBoundingClientRect()
    return pt(e.clientX - r.left, e.clientY - r.top)
  }
  /** 문서 좌표 — 그리기·스냅·지우개는 이것 */
  const toPt = (e: PointerEvent): Pt => screenToDoc(app, toScreen(e))
  /** 오스냅 반경은 화면 px — 문서 좌표용으로 배율 보정 */
  const osnapSet = () => ({ ...app.osnap, radius: app.osnap.radius / app.view.s })
  /** **연장선 획득 머무름**(web2-18 2-b) — 포인터가 움직일 때마다 한 번. 호버든
   *  그리는 중이든 같은 자리에서 돈다(AutoCAD·Rhino도 명령 중에 획득한다 — A-3).
   *  반환 = 표시가 달라졌는가(획득 표식을 다시 그려야 하는가). */
  const tickExt = (p: Pt): boolean =>
    updateExtDwell(app.extAcq, app.lift, app.pose, p,
      app.osnap.radius / app.view.s, performance.now())
  /** 치수 옵션 — 스냅은 켜져 있을 때만 step이 실린다(지시 4-7) */
  const dimOpts = () => ({
    mmPerUnit: app.lift.mmPerUnit,
    snapStep: app.dimSnap ? app.dimSnapStep : null,
  })

  // ── 획 미리보기 — 확정과 같은 함수로(스냅이 그대로 확정된다, 원칙 d) ──
  // 끝점 결정: 오스냅(점)이 축 스냅(방향)을 이긴다 — Rhino 선례.
  // ⚠ 미리보기 판정(resolveEnd)은 **전달 이벤트당 한 번**이다 — coalesced 점마다 돌리면
  // 판정 비용이 묶음 크기배가 되는데 끝점은 어차피 마지막 점이다. 점 수집만 촘촘하다.
  function updateDraft(e: PointerEvent) {
    if (!draft) return
    const bundle = bundleOf(e)
    capStats.events++
    capStats.extra += bundle.length - 1
    const r0 = canvas.getBoundingClientRect()
    for (const c of bundle) {
      draft.raw.push(screenToDoc(app, pt(c.clientX - r0.left, c.clientY - r0.top)))
      samples.push(sampleOf(c))
      // 점별 필압을 미리보기에도(web2-12 2번) — 양자화 식은 quantIn과 같다(한 곳이어야
      // 미리보기·확정이 같은 프로필을 낸다). 펜만 — 마우스는 상수 0.5라 정보가 없다(AS-C33).
      if (draft.press) draft.press.push(quantPress(c.pressure))
    }
    capStats.points = draft.raw.length
    const cur = toPt(e)
    tickExt(cur)
    const r = resolveEnd(
      app.lift, app.pose, app.lift.an,
      draft.start, { p3: draft.startP3 }, cur, osnapSet(), dimOpts(), app.extAcq.acquired,
    )
    draft.end = r.end
    draft.label = r.label
    draft.endSnap = r.endSnap
    draft.lenMm = r.lenMm
    draft.vp = r.vp          // 소실점 예고 자리(web2-19 1-b) — 파선 ✕가 읽는다
    cb.onDraftChange(draft)
  }

  /** 필압 양자화 — quantIn과 같은 식(0..C.PRESS_Q 정수). 둘이 갈리면 뗄 때 입자가 튄다. */
  const quantPress = (p: number): number => Math.round(Math.min(1, Math.max(0, p)) * C.PRESS_Q)

  // ── 활성 겹 rect 끌기(web2-20 2-b) ────────────────────────────────────────
  let rectDrag: { id: number; edges: { l: boolean; r: boolean; t: boolean; b: boolean }; last: Pt } | null = null
  function tryRectDrag(e: PointerEvent): boolean {
    const split = filmSplit(app)
    if (!split || app.activeLayer === null) return false
    const lay = app.doc.layers.find(l => l.id === app.activeLayer)
    if (!lay || lay.locked || split.films.every(f => f.id !== lay.id)) return false
    const p = screenToDoc(app, toScreen(e))
    const tol = C.OSNAP_RADIUS_PX / app.view.s
    const nearV = (x: number) => Math.abs(p.x - x) <= tol && p.y >= lay.rect.y - tol && p.y <= lay.rect.y + lay.rect.h + tol
    const nearH = (y: number) => Math.abs(p.y - y) <= tol && p.x >= lay.rect.x - tol && p.x <= lay.rect.x + lay.rect.w + tol
    const edges = {
      l: nearV(lay.rect.x), r: nearV(lay.rect.x + lay.rect.w),
      t: nearH(lay.rect.y), b: nearH(lay.rect.y + lay.rect.h),
    }
    if (!edges.l && !edges.r && !edges.t && !edges.b) return false
    rectDrag = { id: lay.id, edges, last: p }
    canvas.setPointerCapture(e.pointerId)
    e.preventDefault()
    return true
  }
  function dragRect(e: PointerEvent) {
    if (!rectDrag) return
    const lay = app.doc.layers.find(l => l.id === rectDrag!.id)
    if (!lay) { rectDrag = null; return }
    const p = screenToDoc(app, toScreen(e))
    const dx = p.x - rectDrag.last.x
    const dy = p.y - rectDrag.last.y
    rectDrag.last = p
    const r = lay.rect
    let { x, y, w, h } = r
    if (rectDrag.edges.l) { x += dx; w -= dx }
    if (rectDrag.edges.r) { w += dx }
    if (rectDrag.edges.t) { y += dy; h -= dy }
    if (rectDrag.edges.b) { h += dy }
    if (w > 8 && h > 8) lay.rect = { x, y, w, h }   // 뒤집힘 방지 — 최소 8 doc px
    cb.onDraftChange(null)                            // 다시 그리기(값 채널 재사용)
  }

  function beginDraft(p: Pt, e: PointerEvent) {
    samples = [sampleOf(e)]
    capStats = { pointerType: e.pointerType, events: 1, points: 1, extra: 0 }
    const oh = resolveStart(app.lift, app.pose, p, osnapSet(), app.extAcq.acquired)
    draft = {
      start: oh ? oh.p : p,
      end: oh ? oh.p : p,
      raw: [p],
      label: null,
      startSnap: oh,
      startP3: oh?.p3 ?? null,
      endSnap: null,
      lenMm: null,
      // 잠정 id(web2-12 2번) — 확정이 쓸 바로 그 값. 그리는 동안 다른 확정이 없으므로
      // (포인터 캡처) 뗄 때 commitStroke의 nextId++가 정확히 이 값을 준다.
      nid: app.nextId,
      ...(e.pointerType === 'pen' ? { press: [quantPress(e.pressure)] } : {}),
    }
    cb.onDraftChange(draft)
  }

  /** 점별 표본 → 저장형(1-c) — 펜에만, raw와 길이가 맞을 때만.
   *  양자화(정수)는 여기 한 번이다 — 값·근거는 `types.ts`의 `RawInput`과 `C.PRESS_Q`. */
  function quantIn(sm: typeof samples, n: number): RawInput | undefined {
    if (drawingType !== 'pen' || sm.length !== n || n === 0) return undefined
    const ri: RawInput = { press: sm.map(s => Math.round(Math.min(1, Math.max(0, s.p)) * C.PRESS_Q)) }
    // 기울기·twist는 **한 점이라도 관측된 축만** 싣는다(안 오는 기기에서 배열을 안 만든다)
    if (sm.some(s => s.tx !== null)) ri.tiltX = sm.map(s => Math.round(s.tx ?? 0))
    if (sm.some(s => s.ty !== null)) ri.tiltY = sm.map(s => Math.round(s.ty ?? 0))
    if (sm.some(s => s.tw !== null && s.tw !== 0)) ri.twist = sm.map(s => Math.round(s.tw ?? 0))
    return ri
  }

  function endDraft() {
    if (!draft) return
    const d = draft
    draft = null
    cb.onDraftChange(null)
    // mat.press(획 평균)는 **종전 그대로 전달 이벤트 표본의 평균**이다 — coalesced 표본을
    // 섞으면 옛 파일·현재 렌더가 보는 값이 미세하게 달라진다(1부: 화면은 그대로).
    const press = pressSamples.length > 0
      ? pressSamples.reduce((a, b) => a + b, 0) / pressSamples.length
      : undefined
    pressSamples = []
    const rawIn = quantIn(samples, d.raw.length)
    samples = []
    // 「잘못 찍힌 점」 문(web2-13 3-b) — 탭 대역 위·STRAY 문 아래의 raw bbox는 획을
    // **애초에 안 만든다.** 탭(끝점 이동 ≤ TAP_MAX_PX)은 여기 안 걸리고 종전 경로
    // (resolveCommit — 소실점 찍기/잡음 폐기)로 그대로 간다. 버린 수는 진단 패널.
    {
      const endDistPx = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) * app.view.s
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const p of d.raw) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y
      }
      const bboxDiagPx = d.raw.length >= 2 ? Math.hypot(x1 - x0, y1 - y0) * app.view.s : 0
      if (isStray(endDistPx, bboxDiagPx)) { app.strayCount++; return }
    }
    const c = resolveCommit(app.lift.an, d.start, d.end, app.osnap.radius / app.view.s)
    if (!c) return // 잡음 — 지평선에서 먼 탭
    // **어떤 오스냅이 이 획을 정했는가**(web2-18 2-c) — 사람이 「정확히 어떤 오스냅
    // 때문인지 모르겠다」고 했다. 앱이 실제로 쓴 값을 그대로 든다(다시 계산하지 않는다).
    // ⚠ commitStroke가 획득을 비우므로 **그 전에** 적는다.
    app.lastSnap = { start: d.startSnap?.kind ?? null, end: d.endSnap?.kind ?? null }
    cb.onCommit(c.a, c.b, d.raw, press, rawIn)
  }

  // ── 카메라 조작 — 궤도는 state.ts의 orbitBy 하나다(시험이 같은 함수를 부른다) ──
  const orbit = (dx: number, dy: number) => orbitBy(app, dx, dy)

  // 팬·줌 — **계산은 `state.ts`에 있다**(입력과 시험이 같은 함수를 부른다 · 지시 5).
  // dx·dy·중심은 화면 좌표다.
  const dolly = (scale: number, center: Pt) => dollyBy(app, scale, center)
  const pan = (dx: number, dy: number) => panBy(app, dx, dy)

  // 뷰 큐브 — 화면 좌표로 판정. 잡히면 그 시점으로.
  function tryCube(sp: Pt): boolean {
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)
    if (!geom) return false
    if (Math.hypot(sp.x - app.cubeLayout.cx, sp.y - app.cubeLayout.cy) > app.cubeLayout.size) return false
    const elem = cubeHit(geom, sp)
    if (!elem) return false
    const pivot = orbitPivot(app)
    const dist = Math.max(1, Math.hypot(
      app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z))
    const pose = poseForElem(app.lift.an, elem, pivot, dist)
    if (pose) { setPose(app, pose); level.touch() }
    return true
  }

  // ── 포인터 이벤트 ────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (penDown) return // 팜 리젝션
      if (touches.size === 0 && tryCube(toScreen(e))) return
      touches.set(e.pointerId, toScreen(e))
      lastTouchMid = null
      lastTouchDist = 0
      level.grab()
      beginNavHold(app)   // 제스처 동안 감쇠 판정 동결(web2-14 3번)
      return
    }
    if (e.pointerType === 'pen') penDown = true
    // **매 접촉에서 다시 정한다** — 신호가 없으면 false다. 뗌이 유실돼도 다음 접촉이
    // 스스로 바로잡으므로 «되돌리기»가 없다(state.ts `tipErase` 주석이 정본).
    app.tipErase = isTipErase(e)
    if (e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = { last: toScreen(e), mode: e.button === 1 ? 'orbit' : 'pan' }
      level.grab()
      beginNavHold(app)   // 제스처 동안 감쇠 판정 동결(web2-14 3번)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (tryCube(toScreen(e))) return
    // **접힐 자세(임계 안)면 그 누름이 접기를 당긴다** — 곧 정렬될 화면에 긋게 두면
    // 확정 좌표가 접히기 전 포즈의 것이 된다. 죽은 클릭도 안 만든다 — 접히면 바로 그린다.
    // **임계 밖(머무는 자세)이면 foldNow가 false다 — 그 자세에서 그대로 그린다**(지시 3).
    // 그때의 획은 `commitStroke`가 `view`를 실어 그 포즈의 2D로 남기고, 연결이 닿으면
    // 3D로 올라간다(`lift.ts`가 `s.view` 포즈로 푼다 — 기존 기전이다).
    if (!isLevel(app.pose) && level.foldNow()) return
    // 활성 겹의 가장자리 끌기(web2-20 2-b) — 변·모서리를 잡으면 그리기가 아니라 크기다.
    // 잡는 반경은 오스냅 반경 재사용(새 숫자를 안 짓는다). 막이 보일 때만(같은 filmSplit).
    if (tryRectDrag(e)) return
    drawingPointer = e.pointerId
    drawingType = e.pointerType
    canvas.setPointerCapture(e.pointerId)
    // **면 도구는 탭이다** — 누르는 동안 아무것도 안 만들고, 뗄 때 판정한다.
    // 누름에서 바로 만들면 «잘못 눌렀다»를 뗌으로 취소할 길이 없다.
    // 지우개 끝이 **먼저**다 — 손에 든 것이 지우개면 사이드바에 무엇이 눌려 있든
    // 지운다(도구는 그대로 남는다 — 뗌과 동시에 아무것도 안 남는다).
    if (app.tool === 'face' && !app.tipErase) { faceDown = toPt(e); return }
    if (erasingNow()) {
      beginErase(app)
      eraseAt(app, toPt(e), eraseKind())
      cb.onEraserMove(toPt(e))
      return
    }
    pressSamples = e.pointerType === 'pen' && e.pressure > 0 ? [e.pressure] : []
    beginDraft(toPt(e), e)
  })

  canvas.addEventListener('pointermove', (e) => {
    if (rectDrag) { dragRect(e); return }
    if (e.pointerType === 'touch') {
      if (penDown) return
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, toScreen(e))
      level.grab()
      const pts = [...touches.values()]
      if (pts.length === 1) {
        const p = pts[0]!
        if (lastTouchMid) orbit(p.x - lastTouchMid.x, p.y - lastTouchMid.y)
        lastTouchMid = p
      } else if (pts.length >= 2) {
        const mid = pt((pts[0]!.x + pts[1]!.x) / 2, (pts[0]!.y + pts[1]!.y) / 2)
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
        if (lastTouchMid && lastTouchDist > 0) {
          pan(mid.x - lastTouchMid.x, mid.y - lastTouchMid.y)
          dolly(dist / lastTouchDist, mid)
        }
        lastTouchMid = mid
        lastTouchDist = dist
      }
      return
    }
    if (orbitBtn) {
      const p = toScreen(e)
      if (orbitBtn.mode === 'orbit') orbit(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      else pan(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      orbitBtn.last = p
      level.grab()
      return
    }
    if (drawingPointer === e.pointerId) {
      if (erasingNow()) {
        eraseAt(app, toPt(e), eraseKind())
        cb.onEraserMove(toPt(e))
        return
      }
      if (app.tool === 'face') { cb.onFacePreview(facePreview(app, toPt(e))); return }
      if (draft) {
        if (e.pointerType === 'pen' && e.pressure > 0) pressSamples.push(e.pressure)
        updateDraft(e)
      }
      return
    }
    if (e.buttons === 0) {
      if (isEraser(app.tool)) {
        cb.onEraserMove(toPt(e))
        cb.onHover(null)
        return
      }
      cb.onEraserMove(null)
      if (app.tool === 'face') {
        // **접힐 자세(임계 안 기울임)에서는 미리보기가 없다** — 그때 누름은 접기이지 면이
        // 아니다. 머무는 자세(임계 밖)에서는 누름이 면 토글이므로 미리보기도 뜬다(지시 3).
        const acts = isLevel(app.pose) || !pitchSnaps(app.pose, app.lift.an.f, app.lift.an.W)
        cb.onFacePreview(acts ? facePreview(app, toPt(e)) : null)
        cb.onHover(null)
        return
      }
      // 호버 — 와콤 EMR 펜·마우스. 스냅 후보 표식.
      // 머무름이 먼저다(2-b) — 이 이동으로 획득이 서면 **그 자리에서** ext가 후보가 된다.
      const hp = toPt(e)
      if (tickExt(hp)) cb.onDraftChange(draft)   // 획득 표식이 달라졌다 — 다시 그린다
      cb.onHover(osnap(app.lift, app.pose, hp, osnapSet(), undefined, undefined, app.extAcq.acquired))
    }
  })

  const release = (e: PointerEvent) => {
    if (rectDrag) {
      rectDrag = null
      for (const l of app.listeners) l()   // 자동 저장 — rect는 문서의 값이다
      return
    }
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId)
      lastTouchMid = null
      lastTouchDist = 0
      if (touches.size === 0) { level.release(); endNavHold(app) } else level.grab()
      return
    }
    if (e.pointerType === 'pen') penDown = false
    if (orbitBtn && e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = null; level.release(); endNavHold(app); return
    }
    if (drawingPointer === e.pointerId) {
      drawingPointer = null
      if (erasingNow()) {
        endErase(app)
        if (app.tipErase) {
          app.tipErase = false        // 그 획 하나로 끝난다 — 도구는 처음부터 안 바꿨다
          cb.onEraserMove(null)       // 커서도 같이 사라진다(사이드바 지우개는 종전대로 남는다)
        }
        return
      }
      if (app.tool === 'face') {
        const d = faceDown
        faceDown = null
        if (!d) return
        const p = toPt(e)
        // 끌었으면 취소다 — 탭 대역(`TAP_MAX_PX`)은 찍기와 같은 기준을 쓴다
        if (Math.hypot(p.x - d.x, p.y - d.y) > C.TAP_MAX_PX / app.view.s) return
        cb.onFaceToggle(toggleFaceAt(app, d))
        cb.onFacePreview(facePreview(app, d))
        return
      }
      endDraft()
    }
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    dolly(Math.exp(-e.deltaY * 0.001), toScreen(e))
    level.touch()
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // 진단·원장 통로(1-a·1-f) — 패널과 e2e가 같은 값을 읽는다
  return { strokeStats: () => ({ ...capStats }) }
}
