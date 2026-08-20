// 2D 오버레이 — 작도선·대기 획·미리보기·표식·뷰 큐브.
// dpr 규약의 단일 출처는 resize2d() 하나다: 기록 좌표는 CSS px,
// 백버퍼는 CSS×dpr, ctx 변환으로 CSS px 그대로 그린다. (dpr 1과 2 모두 e2e로 확인)
// 뷰 오프셋(화면 팬·줌)은 그리기 변환으로만 얹는다 — 문서 좌표는 안 바뀐다.
// 선 굵기·표식 크기는 화면 고정(배율로 나눈다).

import type { App } from './state'
import { isDrawPose } from './state'
import { screenAxes, type Role } from '../core/camera'
import { cubeGeom } from '../core/viewcube'
import { C } from '../core/constants'
import type { OsnapHit } from '../core/osnap'
import type { Pt, V3 } from '../core/vec'

export interface Draft {
  start: Pt
  end: Pt
  raw: Pt[]
  /** 미리보기 라벨 — 'horizon' | 'vp' | 축id | null(자유) */
  label: string | null
  startSnap: OsnapHit | null
  startP3: V3 | null
  endSnap: OsnapHit | null
}

export function resize2d(canvas: HTMLCanvasElement, W: number, H: number, dpr: number) {
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

const COL = {
  construction: '#8a7f6a',
  waiting: '#555',
  waitingDim: 'rgba(85,85,85,0.25)',
  preview: '#1a6ac2',
  vpMark: '#b04a3a',
  snap: '#1a9c50',
  cubeFace: 'rgba(255,253,248,0.85)',
  cubeEdge: '#8a8378',
}

export function draw2d(
  ctx: CanvasRenderingContext2D, app: App,
  draft: Draft | null, hover: OsnapHit | null, eraser: Pt | null,
) {
  const an = app.lift.an
  const { W, H } = app.doc.frame
  const dpr = window.devicePixelRatio || 1
  const v = app.view
  const is = 1 / v.s // 화면 고정 크기 보정

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy)

  // 보이는 문서 영역
  const x0 = -v.ox * is, x1 = (W - v.ox) * is
  const y0 = -v.oy * is, y1 = (H - v.oy) * is

  const atDraw = isDrawPose(app.pose)

  // 작도선 — 작도 포즈에서만 원본 세그먼트를 보인다.
  if (atDraw) {
    ctx.strokeStyle = COL.construction
    ctx.lineWidth = C.LINE_W_GUIDE * is
    for (const s of app.doc.strokes) {
      const role = an.roles.get(s.id) as Role | undefined
      if (role !== 'horizon' && role !== 'vp') continue
      ctx.beginPath()
      if (role === 'horizon' && an.horizonY !== null) {
        ctx.moveTo(x0, an.horizonY); ctx.lineTo(x1, an.horizonY)
      } else {
        ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y)
      }
      ctx.stroke()
    }
  }

  // 대기 획 — 사라지지 않는다(불변식 j). 자기 포즈가 아니면 흐리게.
  for (const id of app.lift.waiting) {
    const s = app.lift.strokes.get(id)
    if (!s) continue
    const own = s.view ? !atDraw : atDraw
    ctx.strokeStyle = own ? COL.waiting : COL.waitingDim
    ctx.lineWidth = C.LINE_W_RESULT * is
    ctx.setLineDash([5 * is, 4 * is])
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke()
    ctx.setLineDash([])
  }

  // 소실점 표식 — 현재 포즈 기준(불변식 i: 표시=스냅=그리드가 같은 출처)
  for (const ax of screenAxes(an, app.pose)) {
    if (!ax.vp) continue
    if (ax.vp.x < x0 - 50 || ax.vp.x > x1 + 50 || ax.vp.y < y0 - 50 || ax.vp.y > y1 + 50) continue
    ctx.strokeStyle = COL.vpMark
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(ax.vp.x - 6 * is, ax.vp.y - 6 * is); ctx.lineTo(ax.vp.x + 6 * is, ax.vp.y + 6 * is)
    ctx.moveTo(ax.vp.x - 6 * is, ax.vp.y + 6 * is); ctx.lineTo(ax.vp.x + 6 * is, ax.vp.y - 6 * is)
    ctx.stroke()
  }

  // 미리보기 — 붙은 좌표가 그대로 확정된다(원칙 d)
  if (draft) {
    ctx.strokeStyle = COL.preview
    ctx.lineWidth = C.LINE_W_RESULT * is
    ctx.beginPath(); ctx.moveTo(draft.start.x, draft.start.y); ctx.lineTo(draft.end.x, draft.end.y); ctx.stroke()
    if (draft.startSnap) mark(ctx, draft.startSnap, is)
    if (draft.endSnap) mark(ctx, draft.endSnap, is)
  } else if (hover) {
    mark(ctx, hover, is)
  }

  // 지우개 커서 — 반경은 화면 px
  if (eraser && app.tool === 'eraser') {
    ctx.strokeStyle = '#b04a3a'
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.arc(eraser.x, eraser.y, app.eraserRadius * is, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 뷰 큐브 — 화면 공간 (그리기와 판정이 같은 cubeGeom)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const geom = cubeGeom(an, app.pose, app.cubeLayout)
  if (geom) {
    for (const f of geom.faces) {
      if (!f.visible) continue
      ctx.fillStyle = COL.cubeFace
      ctx.strokeStyle = COL.cubeEdge
      ctx.lineWidth = 1
      ctx.beginPath()
      f.poly.forEach((i, k) => {
        const p = geom.corners[i]!.p
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }
}

/** 오스냅 표식 — Rhino 관행의 형태 구분: 끝 □ · 정점 ◆ · 중 △ · 교차 ✕ · 수선 ⊥ · 연장 ▫ · 근처 ○ */
function mark(ctx: CanvasRenderingContext2D, h: OsnapHit, is: number) {
  const { x, y } = h.p
  const r = 4 * is, r5 = 5 * is
  ctx.strokeStyle = COL.snap
  ctx.lineWidth = 1.5 * is
  ctx.setLineDash([])
  ctx.beginPath()
  switch (h.kind) {
    case 'end':
      ctx.strokeRect(x - r, y - r, r * 2, r * 2); return
    case 'vertex':
      ctx.moveTo(x, y - r5); ctx.lineTo(x + r5, y); ctx.lineTo(x, y + r5); ctx.lineTo(x - r5, y); ctx.closePath(); break
    case 'mid':
      ctx.moveTo(x, y - r5); ctx.lineTo(x + r5, y + r); ctx.lineTo(x - r5, y + r); ctx.closePath(); break
    case 'int':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r)
      ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); break
    case 'perp':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r)
      ctx.moveTo(x - r, y); ctx.lineTo(x + 1 * is, y); break
    case 'ext':
      ctx.setLineDash([2 * is, 2 * is]); ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.setLineDash([]); return
    case 'near':
      ctx.arc(x, y, r, 0, Math.PI * 2); break
  }
  ctx.stroke()
}
