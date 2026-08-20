// 2D 오버레이 — 작도선·대기 획·미리보기·표식.
// dpr 규약의 단일 출처는 resize2d() 하나다: 기록 좌표는 CSS px,
// 백버퍼는 CSS×dpr, ctx 변환으로 CSS px 그대로 그린다. (dpr 1과 2 모두 e2e로 확인)

import type { App } from './state'
import { isDrawPose } from './state'
import { screenAxes, DRAW_POSE, type Role } from '../core/camera'
import { C } from '../core/constants'
import type { Pt } from '../core/vec'

export interface Draft {
  start: Pt
  end: Pt
  raw: Pt[]
  /** 미리보기 라벨 — 'horizon' | 'vp' | 축id | null(자유) */
  label: string | null
  startHit: boolean
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
}

export function draw2d(ctx: CanvasRenderingContext2D, app: App, draft: Draft | null, hover: Pt | null) {
  const an = app.lift.an
  const { W, H } = app.doc.frame
  ctx.clearRect(0, 0, W, H)
  const atDraw = isDrawPose(app.pose)

  // 작도선 — 작도 포즈에서만 원본 세그먼트를 보인다.
  // 궤도 후에는 파생 표식(소실점)만 — 작도선은 방향 정의라 3D 깊이가 없다.
  if (atDraw) {
    ctx.strokeStyle = COL.construction
    ctx.lineWidth = C.LINE_W_GUIDE
    for (const s of app.doc.strokes) {
      const role = an.roles.get(s.id) as Role | undefined
      if (role !== 'horizon' && role !== 'vp') continue
      ctx.beginPath()
      if (role === 'horizon' && an.horizonY !== null) {
        // 지평선은 전폭으로
        ctx.moveTo(0, an.horizonY); ctx.lineTo(W, an.horizonY)
      } else {
        ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y)
      }
      ctx.stroke()
    }
  }

  // 대기 획 — 사라지지 않는다(불변식 j). 자기 포즈가 아니면 흐리게.
  for (const id of app.lift.waiting) {
    const s = app.doc.strokes.find(x => x.id === id)
    if (!s) continue
    const own = s.view ? !atDraw /* 근사: 정확 포즈 비교는 4단계 시점 저장에서 */ : atDraw
    ctx.strokeStyle = own ? COL.waiting : COL.waitingDim
    ctx.lineWidth = C.LINE_W_RESULT
    ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke()
    ctx.setLineDash([])
  }

  // 소실점 표식 — 현재 포즈 기준(불변식 i: 표시=스냅=그리드가 같은 출처)
  for (const ax of screenAxes(an, app.pose)) {
    if (!ax.vp) continue
    if (ax.vp.x < -50 || ax.vp.x > W + 50 || ax.vp.y < -50 || ax.vp.y > H + 50) continue
    ctx.strokeStyle = COL.vpMark
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ax.vp.x - 6, ax.vp.y - 6); ctx.lineTo(ax.vp.x + 6, ax.vp.y + 6)
    ctx.moveTo(ax.vp.x - 6, ax.vp.y + 6); ctx.lineTo(ax.vp.x + 6, ax.vp.y - 6)
    ctx.stroke()
  }

  // 미리보기 — 붙은 좌표가 그대로 확정된다(원칙 d)
  if (draft) {
    ctx.strokeStyle = COL.preview
    ctx.lineWidth = C.LINE_W_RESULT
    ctx.beginPath(); ctx.moveTo(draft.start.x, draft.start.y); ctx.lineTo(draft.end.x, draft.end.y); ctx.stroke()
    if (draft.startHit) mark(ctx, draft.start, COL.snap)
  } else if (hover) {
    mark(ctx, hover, COL.snap)
  }
}

function mark(ctx: CanvasRenderingContext2D, p: Pt, col: string) {
  ctx.strokeStyle = col
  ctx.lineWidth = 1.5
  ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
}
