// 입력 배정 — 펜: 그리기 · 손가락 1개: 궤도 · 손가락 2개: 팬+줌 · 마우스: 데스크톱 확인용.
// 팜 리젝션: 펜이 닿아 있는 동안 터치를 무시한다(잉크·카메라 양쪽).
// 데스크톱 선례(SketchUp): 중버튼 궤도, 우버튼 팬, 휠 줌.

import type { App } from './state'
import { setPose, orbitPivot, beginErase, eraseAt, endErase } from './state'
import { snapDir } from '../core/snap'
import { osnap, type OsnapHit } from '../core/osnap'
import { classifyNext } from '../core/camera'
import type { Draft } from './render2d'
import {
  type Pt, type V3, pt, v3, add3, sub3, mul3, dot3,
  quatAxisAngle, quatMul, quatRotate,
} from '../core/vec'

export interface InputCallbacks {
  onDraftChange: (d: Draft | null) => void
  onHover: (h: OsnapHit | null) => void
  onCommit: (a: Pt, b: Pt, raw: Pt[]) => void
  /** 지우개 커서 위치 (지우개 도구일 때) */
  onEraserMove: (p: Pt | null) => void
}

export function initInput(canvas: HTMLCanvasElement, app: App, cb: InputCallbacks) {
  let draft: Draft | null = null
  let penDown = false
  let drawingPointer: number | null = null
  const touches = new Map<number, Pt>()
  let lastTouchMid: Pt | null = null
  let lastTouchDist = 0
  let orbitBtn: { last: Pt; mode: 'orbit' | 'pan' } | null = null

  const toPt = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect()
    return pt(e.clientX - r.left, e.clientY - r.top)
  }

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
      const oh = osnap(app.lift, app.pose, cur, app.osnap, { p3: draft.startP3 })
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
    const oh = osnap(app.lift, app.pose, p, app.osnap)
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
    if (Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) < 2) return // 탭 잡음
    cb.onCommit(d.start, d.end, d.raw)
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

  function dolly(scale: number) {
    if (!app.lift.an.constructionDone) return
    const pivot = orbitPivot(app)
    const p = add3(pivot, mul3(sub3(app.pose.p, pivot), 1 / scale))
    setPose(app, { p, q: app.pose.q })
  }

  function pan(dx: number, dy: number) {
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

  // ── 포인터 이벤트 ────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (penDown) return // 팜 리젝션
      touches.set(e.pointerId, toPt(e))
      lastTouchMid = null
      lastTouchDist = 0
      return
    }
    if (e.pointerType === 'pen') penDown = true
    if (e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = { last: toPt(e), mode: e.button === 1 ? 'orbit' : 'pan' }
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    drawingPointer = e.pointerId
    canvas.setPointerCapture(e.pointerId)
    if (app.tool === 'eraser') {
      beginErase(app)
      eraseAt(app, toPt(e))
      cb.onEraserMove(toPt(e))
      return
    }
    beginDraft(toPt(e))
  })

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (penDown) return
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, toPt(e))
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
          dolly(dist / lastTouchDist)
        }
        lastTouchMid = mid
        lastTouchDist = dist
      }
      return
    }
    if (orbitBtn) {
      const p = toPt(e)
      if (orbitBtn.mode === 'orbit') orbit(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      else pan(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      orbitBtn.last = p
      return
    }
    if (drawingPointer === e.pointerId) {
      if (app.tool === 'eraser') {
        eraseAt(app, toPt(e))
        cb.onEraserMove(toPt(e))
        return
      }
      if (draft) updateDraft(toPt(e))
      return
    }
    if (e.buttons === 0) {
      if (app.tool === 'eraser') {
        cb.onEraserMove(toPt(e))
        cb.onHover(null)
        return
      }
      cb.onEraserMove(null)
      // 호버 — 와콤 EMR 펜·마우스. 스냅 후보 표식.
      cb.onHover(osnap(app.lift, app.pose, toPt(e), app.osnap))
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
      if (app.tool === 'eraser') { endErase(app); return }
      endDraft()
    }
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    dolly(Math.exp(-e.deltaY * 0.001))
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
}
