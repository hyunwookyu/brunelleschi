// 2D 오버레이 — 작도선·대기 획·미리보기·표식·뷰 큐브.
// dpr 규약의 단일 출처는 resize2d() 하나다: 기록 좌표는 CSS px,
// 백버퍼는 CSS×dpr, ctx 변환으로 CSS px 그대로 그린다. (dpr 1과 2 모두 e2e로 확인)
// 뷰 오프셋(화면 팬·줌)은 그리기 변환으로만 얹는다 — 문서 좌표는 안 바뀐다.
// 선 굵기·표식 크기는 화면 고정(배율로 나눈다).

import type { App } from './state'
import { isDrawPose, isEraser, activeGrade } from './state'
import { screenAxes, project, projectSeg, groundAxes } from '../core/camera'
import { cubeGeom } from '../core/viewcube'
import { C } from '../core/constants'
import { MAT, gradeOf, rng32, widthOf, widthOfMat } from '../core/material'
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
  grid: 'rgba(120,116,110,0.18)',
  construction: '#8a7f6a',
  waiting: '#555',
  waitingDim: 'rgba(85,85,85,0.25)',
  // 색을 줄인 규칙(4-c)은 **상시냐 순간이냐**로 가른다:
  //   상시 표시 — 무채색. 작도선·소실점 ✕·지우개 커서.
  //   그리는 중에만 — 색을 남긴다. 작도 미리보기·축 색 넷·오스냅 표식.
  // 화면에 늘 떠 있는 것이 그림보다 눈에 띄던 것이 문제였고, 순간 피드백은 그 문제가 아니다.
  // 색이 곧 정보인 자리(어느 축에 붙었나 · 무슨 오스냅인가)라 회색조로 만들면 정보가 죽는다.
  preview: '#1a6ac2',
  // ⚠ 붉은색이었다 — 화면에 **상시** 떠 있는 표식이라 그림보다 눈에 띄었다(지시 3-c 대조표).
  // 소실점은 지평선과 같은 급의 작도 표식이므로 같은 색으로 물러난다.
  vpMark: '#8a7f6a',
  // 축 색 — **그리는 중 미리보기에만** 쓴다(원칙: 확정된 선은 재료 색이다).
  // 붙은 축이 즉시 보이고, 커서를 돌리면 색이 넘어간다(지시 5-d).
  axis: { vp0: '#c2571a', vp1: '#1a7fc2', H: '#1a9c50', V: '#7a4fc2' } as Record<string, string>,
  // ⚠ 강조색(#1a6ac2)으로 합치려다 되돌렸다 — vp1 축 색(#1a7fc2)과 사실상 같은 파랑이라
  // 「축에 붙었다」와 「점에 붙었다」가 화면에서 안 갈린다. 순간 피드백끼리는 갈려야 한다.
  snap: '#1a9c50',
  cubeFace: 'rgba(252,251,248,0.80)',
  cubeEdge: '#b0a99c',
}

export function draw2d(
  ctx: CanvasRenderingContext2D, app: App,
  draft: Draft | null, hover: OsnapHit | null, eraser: Pt | null,
) {
  const an = app.lift.an
  const dpr = window.devicePixelRatio || 1
  const v = app.view
  const is = 1 / v.s // 화면 고정 크기 보정
  const cw = ctx.canvas.width / dpr, ch = ctx.canvas.height / dpr

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy)

  // 보이는 문서 영역 (캔버스 기준)
  const x0 = -v.ox * is, x1 = (cw - v.ox) * is
  const y0 = -v.oy * is, y1 = (ch - v.oy) * is

  const atDraw = isDrawPose(app.pose)

  // 지면 격자 — **공간의 정사각형을 투영한 것**이다(이론서 9.5). 화면 각도 균등 분할이 아니다.
  // 아주 연하게, 무채색 — 사용자가 그린 선이 가장 눈에 띄어야 한다(6-h 「선 우선순위」).
  if (app.grid) {
    const ga = groundAxes(an)
    if (ga) {
      const [u, v] = ga
      const step = C.GRID_STEP, n = C.GRID_HALF, span = step * n
      ctx.strokeStyle = COL.grid
      ctx.lineWidth = 1 * is
      ctx.beginPath()
      for (let k = -n; k <= n; k++) {
        for (const [d, e] of [[u, v], [v, u]] as const) {
          const o = { x: e.x * k * step, y: 0, z: e.z * k * step }
          const seg = projectSeg(an, app.pose,
            { x: o.x - d.x * span, y: 0, z: o.z - d.z * span },
            { x: o.x + d.x * span, y: 0, z: o.z + d.z * span })
          if (!seg) continue
          ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y)
        }
      }
      ctx.stroke()
    }
  }

  // 작도선 — **지평선뿐이다.** 무한원이라 3D가 없고(이론서 2.2) 화면 전폭으로 긋는다.
  // 깊이선은 작도선이 아니다 — 소실점을 정의하면서 동시에 그은 3D 선이고,
  // 승격됐으면 three.js가, 아직이면 아래 「대기 획」이 그린다. 여기서 또 그리면 두 번 그려진다.
  if (atDraw && an.horizonY !== null) {
    ctx.strokeStyle = COL.construction
    ctx.lineWidth = C.LINE_W_GUIDE * is
    ctx.beginPath()
    ctx.moveTo(x0, an.horizonY); ctx.lineTo(x1, an.horizonY)
    ctx.stroke()
  }

  // 대기 획 — 사라지지 않는다(불변식 j). 자기 포즈가 아니면 흐리게. 색은 재료.
  for (const id of app.lift.waiting) {
    const s = app.lift.strokes.get(id)
    if (!s) continue
    const own = s.view ? !atDraw : atDraw
    const m = MAT[gradeOf(s)]
    ctx.strokeStyle = m.color
    ctx.globalAlpha = own ? m.alpha : m.alpha * 0.3
    ctx.lineWidth = widthOf(s) * is
    ctx.setLineDash([5 * is, 4 * is])
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    if (m.grain > 0 && own) grain(ctx, s.id, s.a, s.b, m.grain, m.alpha, s.mat?.press, is)
  }

  // 질감 — 흑연 입자. 자로 그은(승격된) 선에도 재료가 보인다.
  // 획별 시드 고정(rng32) — 프레임마다 같은 입자, Math.random 없음.
  for (const [id, seg] of app.lift.lifted) {
    const s = app.lift.strokes.get(id)
    if (!s) continue
    const m = MAT[gradeOf(s)]
    if (m.grain <= 0) continue // 잉크는 균일하고 선명하다
    const a = project(an, app.pose, seg.a3)
    const b = project(an, app.pose, seg.b3)
    if (!a || !b) continue
    grain(ctx, s.id, a, b, m.grain, m.alpha, s.mat?.press, is)
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

  // 미리보기 — 붙은 좌표가 그대로 확정된다(원칙 d). 작도 중엔 안내색, 이후엔 재료색.
  if (draft) {
    const g = activeGrade(app)
    const m = MAT[g]
    // 미리보기 굵기도 **확정과 같은 함수**에서 나온다(원칙 d: 붙은 것이 그대로 확정된다)
    const drawW = widthOfMat({ grade: g, w: g === 'INK' ? app.nib : undefined })
    // 안내색은 «카메라를 건드리는 획»에만. `!constructionDone`을 함께 보던 초판은
    // 1점 상태에서 그린 **내용 획까지** 작도선처럼 파랗게 칠했다 — 아직 못 그린다는 신호로 읽힌다.
    const constructing = draft.label === 'horizon' || draft.label === 'vp'
    const axisCol = draft.label ? COL.axis[draft.label] : undefined
    ctx.strokeStyle = constructing ? COL.preview : (axisCol ?? m.color)
    ctx.lineWidth = (constructing ? C.LINE_W_RESULT : drawW) * is
    ctx.beginPath(); ctx.moveTo(draft.start.x, draft.start.y); ctx.lineTo(draft.end.x, draft.end.y); ctx.stroke()
    if (draft.startSnap) mark(ctx, draft.startSnap, is)
    if (draft.endSnap) mark(ctx, draft.endSnap, is)
  } else if (hover) {
    mark(ctx, hover, is)
  }

  // 지우개 커서 — 반경은 화면 px
  if (eraser && isEraser(app.tool)) {
    ctx.strokeStyle = COL.construction
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

/** 흑연 입자 — 종이 결에 걸리는 알갱이. 필압이 밀도·진하기에 얹힌다. */
function grain(
  ctx: CanvasRenderingContext2D, seed: number, a: Pt, b: Pt,
  amount: number, alpha: number, press: number | undefined, is: number,
) {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L < 2) return
  const px = -dy / L, py = dx / L
  const p = press ?? 0.5
  const rnd = rng32(seed * 2654435761)
  const n = Math.min(400, Math.round(L * amount * (0.5 + p)))
  ctx.fillStyle = '#404040'
  ctx.globalAlpha = alpha * 0.28 * (0.5 + p)
  for (let i = 0; i < n; i++) {
    const t = rnd()
    const off = (rnd() + rnd() - 1) * 1.6 * is // 결 폭
    const r = (0.4 + rnd() * 0.7) * is
    ctx.fillRect(a.x + dx * t + px * off, a.y + dy * t + py * off, r, r)
  }
  ctx.globalAlpha = 1
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
