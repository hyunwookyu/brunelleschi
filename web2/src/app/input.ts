// 입력 배정 — 펜: 그리기 · 손가락 1개: 궤도 · 손가락 2개: 팬+줌 · 마우스: 데스크톱 확인용.
// 팜 리젝션: 펜이 닿아 있는 동안 터치를 무시한다(잉크·카메라 양쪽).
// 데스크톱 선례(SketchUp): 중버튼 궤도, 우버튼 팬, 휠 줌.

import type { App } from './state'
import {
  setPose, setView, orbitPivot, beginErase, eraseAt, endErase,
  screenToDoc, isDrawPose,
} from './state'
import { snapDir } from '../core/snap'
import { osnap, type OsnapHit } from '../core/osnap'
import { classifyNext } from '../core/camera'
import { cubeGeom, cubeHit, poseForElem } from '../core/viewcube'
import type { Draft } from './render2d'
import {
  type Pt, type V3, pt, v3, add3, sub3, mul3, dot3,
  quatAxisAngle, quatMul, quatRotate,
} from '../core/vec'

export interface InputCallbacks {
  onDraftChange: (d: Draft | null) => void
  onHover: (h: OsnapHit | null) => void
  /** press — 펜 필압 평균 (마우스는 undefined) */
  onCommit: (a: Pt, b: Pt, raw: Pt[], press?: number) => void
  /** 지우개 커서 위치 (지우개 도구일 때) */
  onEraserMove: (p: Pt | null) => void
}

export function initInput(canvas: HTMLCanvasElement, app: App, cb: InputCallbacks) {
  let draft: Draft | null = null
  let penDown = false
  let drawingPointer: number | null = null
  let pressSamples: number[] = []
  const touches = new Map<number, Pt>()
  let lastTouchMid: Pt | null = null
  let lastTouchDist = 0
  let orbitBtn: { last: Pt; mode: 'orbit' | 'pan' } | null = null

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
    const an = app.lift.an
    draft.raw.push(cur)
    draft.endSnap = null
    if (an.horizonY === null) {
      // 지평선 — 수평 강제
      draft.end = pt(cur.x, draft.start.y)
      draft.label = 'horizon'
    } else {
      const oh = osnap(app.lift, app.pose, cur, osnapSet(), { p3: draft.startP3 })
      if (oh) {
        draft.end = oh.p
        draft.endSnap = oh
        draft.label = null
      } else {
        const ds = snapDir(an, app.pose, draft.start, cur)
        if (ds.axis) {
          draft.end = ds.end
          draft.label = ds.axis
        } else {
          draft.end = cur
          const cls = classifyNext(an, draft.start, cur)
          draft.label = cls.role === 'vp' ? 'vp' : null
        }
      }
    }
    cb.onDraftChange(draft)
  }

  function beginDraft(p: Pt) {
    const oh = osnap(app.lift, app.pose, p, osnapSet())
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
    if (Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) < 2) return // 탭 잡음
    cb.onCommit(d.start, d.end, d.raw, press)
  }

  // ── 카메라 조작 ──────────────────────────────────────────────────────
  function rotateAroundPivot(axis: V3, angle: number, pivot: V3) {
    const R = quatAxisAngle(axis, angle)
    const p = add3(pivot, quatRotate(R, sub3(app.pose.p, pivot)))
    const q = quatMul(R, app.pose.q)
    setPose(app, { p, q })
  }

  function orbit(dx: number, dy: number) {
    if (!app.lift.an.constructionDone) return // 3D가 서기 전에는 돌 것이 없다
    const pivot = orbitPivot(app)
    rotateAroundPivot(v3(0, 1, 0), -dx * 0.005, pivot)
    const right = quatRotate(app.pose.q, v3(1, 0, 0))
    rotateAroundPivot(right, -dy * 0.005, pivot)
  }

  // 팬·줌 — 그리는 중(작도 포즈)에는 화면 조작(뷰 오프셋), 궤도 후에는 공간 조작.
  // dx·dy·중심은 화면 좌표다.
  function dolly(scale: number, center: Pt) {
    if (isDrawPose(app.pose)) {
      const v = app.view
      const s = Math.min(8, Math.max(0.2, v.s * scale))
      const k = s / v.s
      setView(app, { s, ox: center.x - k * (center.x - v.ox), oy: center.y - k * (center.y - v.oy) })
      return
    }
    if (!app.lift.an.constructionDone) return
    const pivot = orbitPivot(app)
    const p = add3(pivot, mul3(sub3(app.pose.p, pivot), 1 / scale))
    setPose(app, { p, q: app.pose.q })
  }

  function pan(dx: number, dy: number) {
    if (isDrawPose(app.pose)) {
      const v = app.view
      setView(app, { s: v.s, ox: v.ox + dx, oy: v.oy + dy })
      return
    }
    if (!app.lift.an.constructionDone) return
    const pivot = orbitPivot(app)
    const view = quatRotate(app.pose.q, v3(0, 0, -1))
    const depth = Math.max(1, dot3(sub3(pivot, app.pose.p), view))
    const k = depth / (app.lift.an.f ?? 1000)
    const right = quatRotate(app.pose.q, v3(1, 0, 0))
    const up = quatRotate(app.pose.q, v3(0, 1, 0))
    const p = add3(app.pose.p, add3(mul3(right, -dx * k), mul3(up, dy * k)))
    setPose(app, { p, q: app.pose.q })
  }

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
    if (pose) setPose(app, pose)
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
      return
    }
    if (e.pointerType === 'pen') penDown = true
    if (e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = { last: toScreen(e), mode: e.button === 1 ? 'orbit' : 'pan' }
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (tryCube(toScreen(e))) return
    drawingPointer = e.pointerId
    canvas.setPointerCapture(e.pointerId)
    if (app.tool !== 'pen') {
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
      return
    }
    if (drawingPointer === e.pointerId) {
      if (app.tool !== 'pen') {
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
      if (app.tool !== 'pen') {
        cb.onEraserMove(toPt(e))
        cb.onHover(null)
        return
      }
      cb.onEraserMove(null)
      // 호버 — 와콤 EMR 펜·마우스. 스냅 후보 표식.
      cb.onHover(osnap(app.lift, app.pose, toPt(e), osnapSet()))
    }
  })

  const release = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId)
      lastTouchMid = null
      lastTouchDist = 0
      return
    }
    if (e.pointerType === 'pen') penDown = false
    if (orbitBtn && e.pointerType === 'mouse' && e.button !== 0) { orbitBtn = null; return }
    if (drawingPointer === e.pointerId) {
      drawingPointer = null
      if (app.tool !== 'pen') { endErase(app); return }
      endDraft()
    }
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    dolly(Math.exp(-e.deltaY * 0.001), toScreen(e))
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
}
