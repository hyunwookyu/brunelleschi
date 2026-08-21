// 입력 배정 — 펜: 그리기 · 손가락 1개: 궤도 · 손가락 2개: 팬+줌 · 마우스: 데스크톱 확인용.
// 팜 리젝션: 펜이 닿아 있는 동안 터치를 무시한다(잉크·카메라 양쪽).
// 데스크톱 선례(SketchUp): 중버튼 궤도, 우버튼 팬, 휠 줌.

import type { App } from './state'
import {
  orbitPivot, orbitBy, dollyBy, panBy, setPose, beginErase, eraseAt, endErase,
  screenToDoc, isEraser, toggleFaceAt, facePreview,
} from './state'
import { osnap, type OsnapHit } from '../core/osnap'
import { isLevel } from '../core/level'
import type { LevelHooks } from './autolevel'
import { resolveStart, resolveEnd, resolveCommit } from '../core/draft'
import { C } from '../core/constants'
import { cubeGeom, cubeHit, poseForElem } from '../core/viewcube'
import type { Draft } from './render2d'
import { type Pt, pt } from '../core/vec'

export interface InputCallbacks {
  onDraftChange: (d: Draft | null) => void
  onHover: (h: OsnapHit | null) => void
  /** press — 펜 필압 평균 (마우스는 undefined) */
  onCommit: (a: Pt, b: Pt, raw: Pt[], press?: number) => void
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
  let pressSamples: number[] = []
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

  // ── 획 미리보기 — 확정과 같은 함수로(스냅이 그대로 확정된다, 원칙 d) ──
  // 끝점 결정: 오스냅(점)이 축 스냅(방향)을 이긴다 — Rhino 선례.
  function updateDraft(cur: Pt) {
    if (!draft) return
    draft.raw.push(cur)
    const r = resolveEnd(
      app.lift, app.pose, app.lift.an,
      draft.start, { p3: draft.startP3 }, cur, osnapSet(),
    )
    draft.end = r.end
    draft.label = r.label
    draft.endSnap = r.endSnap
    cb.onDraftChange(draft)
  }

  function beginDraft(p: Pt) {
    const oh = resolveStart(app.lift, app.pose, p, osnapSet())
    draft = {
      start: oh ? oh.p : p,
      end: oh ? oh.p : p,
      raw: [p],
      label: null,
      startSnap: oh,
      startP3: oh?.p3 ?? null,
      endSnap: null,
    }
    cb.onDraftChange(draft)
  }

  function endDraft() {
    if (!draft) return
    const d = draft
    draft = null
    cb.onDraftChange(null)
    const press = pressSamples.length > 0
      ? pressSamples.reduce((a, b) => a + b, 0) / pressSamples.length
      : undefined
    pressSamples = []
    const c = resolveCommit(app.lift.an, d.start, d.end, app.osnap.radius / app.view.s)
    if (!c) return // 잡음 — 지평선에서 먼 탭
    cb.onCommit(c.a, c.b, d.raw, press)
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
      return
    }
    if (e.pointerType === 'pen') penDown = true
    if (e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = { last: toScreen(e), mode: e.button === 1 ? 'orbit' : 'pan' }
      level.grab()
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (tryCube(toScreen(e))) return
    // **기울어 있으면 획을 안 만든다**(그리기도 지우기도). 대신 그 누름이 접기를 당긴다 —
    // 죽은 클릭을 만들지 않는다. 접히면 바로 그릴 수 있다.
    if (!isLevel(app.pose)) { level.foldNow(); return }
    drawingPointer = e.pointerId
    canvas.setPointerCapture(e.pointerId)
    // **면 도구는 탭이다** — 누르는 동안 아무것도 안 만들고, 뗄 때 판정한다.
    // 누름에서 바로 만들면 «잘못 눌렀다»를 뗌으로 취소할 길이 없다.
    if (app.tool === 'face') { faceDown = toPt(e); return }
    if (isEraser(app.tool)) {
      beginErase(app)
      eraseAt(app, toPt(e))
      cb.onEraserMove(toPt(e))
      return
    }
    pressSamples = e.pointerType === 'pen' && e.pressure > 0 ? [e.pressure] : []
    beginDraft(toPt(e))
  })

  canvas.addEventListener('pointermove', (e) => {
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
      if (app.tool === 'face') { cb.onFacePreview(facePreview(app, toPt(e))); return }
      if (isEraser(app.tool)) {
        eraseAt(app, toPt(e))
        cb.onEraserMove(toPt(e))
        return
      }
      if (draft) {
        if (e.pointerType === 'pen' && e.pressure > 0) pressSamples.push(e.pressure)
        updateDraft(toPt(e))
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
        // **기울어 있으면 미리보기도 없다** — 그때 누름은 접기이지 면이 아니다.
        // 보여 놓고 안 되는 것이 「죽은 클릭」이고, 그것을 안 만든다는 것이 그 규칙이다.
        cb.onFacePreview(isLevel(app.pose) ? facePreview(app, toPt(e)) : null)
        cb.onHover(null)
        return
      }
      // 호버 — 와콤 EMR 펜·마우스. 스냅 후보 표식.
      cb.onHover(osnap(app.lift, app.pose, toPt(e), osnapSet()))
    }
  })

  const release = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId)
      lastTouchMid = null
      lastTouchDist = 0
      if (touches.size === 0) level.release(); else level.grab()
      return
    }
    if (e.pointerType === 'pen') penDown = false
    if (orbitBtn && e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = null; level.release(); return
    }
    if (drawingPointer === e.pointerId) {
      drawingPointer = null
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
      if (isEraser(app.tool)) { endErase(app); return }
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
}
