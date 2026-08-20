// 앱 상태 — 문서(획 목록)와 뷰 포즈. 카메라·소실점·리프팅은 전부 계산으로 나온다.
//
// 실행취소는 op 단위다: 획 추가 op, 지우개 한 번의 드래그 op.
// 그림만 되돌린다 — 작도(카메라)는 op에 들어가지 않는다.

import { emptyDoc, type Doc, type Stroke, type CamPose, type ViewOffset } from '../core/types'
export type { ViewOffset }
import { liftAll, type LiftResult } from '../core/lift'
import { DRAW_POSE } from '../core/camera'
import { defaultOsnap, type OsnapSettings } from '../core/osnap'
import { pieces, distToPiece, type Piece } from '../core/pieces'
import { C } from '../core/constants'
import { type Pt, type V3, v3 } from '../core/vec'

export interface Op {
  removed: { stroke: Stroke; index: number }[]
  added: Stroke[]
}

export interface App {
  doc: Doc
  undoStack: Op[]
  redoStack: Op[]
  pose: CamPose
  nextId: number
  /** 문서가 바뀔 때마다 다시 계산 — 유일한 캐시이고 doc에서만 나온다 */
  lift: LiftResult
  /** 문서 변경 카운터 — 렌더가 기하 재구축 시점을 안다 (포즈 변경과 구분) */
  docVersion: number
  /** 오스냅 설정 — 종류별 켜고 끄기, 반경 (Rhino 관행) */
  osnap: OsnapSettings
  tool: 'pen' | 'eraser'
  eraserRadius: number
  /** 지우개 드래그 한 번의 누적 op (드래그가 끝나면 undoStack으로) */
  activeErase: Op | null
  /** 화면 조작(뷰 오프셋) — 그리는 중의 팬·줌. 문서 좌표는 안 바뀐다. */
  view: ViewOffset
  /** 저장된 시점 */
  savedViews: { pose: CamPose; view: ViewOffset }[]
  cubeLayout: { cx: number; cy: number; size: number }
  listeners: (() => void)[]
}

export function createApp(W: number, H: number): App {
  const doc = emptyDoc(W, H)
  return {
    doc,
    undoStack: [],
    redoStack: [],
    pose: DRAW_POSE,
    nextId: 1,
    lift: liftAll(doc),
    docVersion: 0,
    osnap: defaultOsnap(),
    tool: 'pen',
    eraserRadius: C.ERASER_PX,
    activeErase: null,
    view: { s: 1, ox: 0, oy: 0 },
    savedViews: [],
    cubeLayout: { cx: W - 180, cy: 80, size: 80 },
    listeners: [],
  }
}

/** 화면 좌표 ↔ 문서 좌표 — 뷰 오프셋의 단일 출처 */
export const screenToDoc = (app: App, p: Pt): Pt =>
  ({ x: (p.x - app.view.ox) / app.view.s, y: (p.y - app.view.oy) / app.view.s })
export const docToScreen = (app: App, p: Pt): Pt =>
  ({ x: p.x * app.view.s + app.view.ox, y: p.y * app.view.s + app.view.oy })

export const isDrawPose = (pose: CamPose): boolean =>
  Math.abs(pose.p.x) + Math.abs(pose.p.y) + Math.abs(pose.p.z) < 1e-12 &&
  Math.abs(pose.q.x) + Math.abs(pose.q.y) + Math.abs(pose.q.z) < 1e-12

function recompute(app: App) {
  app.lift = liftAll(app.doc)
  app.docVersion++
  for (const l of app.listeners) l()
}

export function commitStroke(app: App, a: Pt, b: Pt, raw?: Pt[]) {
  const s: Stroke = { id: app.nextId++, a, b }
  if (raw && raw.length > 2) s.raw = raw
  if (!isDrawPose(app.pose)) s.view = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  app.doc.strokes.push(s)
  // 작도 획(지평선·깊이선)은 실행취소 대상이 아니다 — role은 추가 후 계산으로 안다
  recompute(app)
  if (app.lift.an.roles.get(s.id) === 'content') {
    app.undoStack.push({ removed: [], added: [s] })
    app.redoStack = []
  }
  return s
}

function removeById(doc: Doc, id: number): { stroke: Stroke; index: number } | null {
  const i = doc.strokes.findIndex(s => s.id === id)
  if (i < 0) return null
  return { stroke: doc.strokes.splice(i, 1)[0]!, index: i }
}

export function undo(app: App) {
  const op = app.undoStack.pop()
  if (!op) return
  for (const s of op.added) removeById(app.doc, s.id)
  for (const r of [...op.removed].sort((a, b) => a.index - b.index)) {
    app.doc.strokes.splice(Math.min(r.index, app.doc.strokes.length), 0, r.stroke)
  }
  app.redoStack.push(op)
  recompute(app)
}

export function redo(app: App) {
  const op = app.redoStack.pop()
  if (!op) return
  for (const r of op.removed) removeById(app.doc, r.stroke.id)
  app.doc.strokes.push(...op.added)
  app.undoStack.push(op)
  recompute(app)
}

// ── 지우개 — 닿으면 그 조각이 사라진다 ────────────────────────────────────
// 승격 획은 3D 교차에서 나뉜 조각 단위, 대기 획은 통째.
// 매달린 것들의 처리: 삭제로 3D 결정을 잃은 획은 대기로 내려간다.
// 사라지지 않는다(불변식 j) — 사라지는 것은 지운 조각뿐이다.

export function beginErase(app: App) {
  app.activeErase = { removed: [], added: [] }
}

export function eraseAt(app: App, p: Pt) {
  if (!app.activeErase) return
  const ps = pieces(app.lift, app.pose)
  // 지우개 반경은 화면 px — 문서 좌표에서는 배율로 나눈다
  const hits = ps.filter(x => distToPiece(p, x) <= app.eraserRadius / app.view.s)
  if (hits.length === 0) return
  const byStroke = new Map<number, Piece[]>()
  for (const h of hits) {
    const arr = byStroke.get(h.strokeId) ?? []
    arr.push(h)
    byStroke.set(h.strokeId, arr)
  }
  const op = app.activeErase
  for (const [id, hit] of byStroke) {
    // 작도 획은 지우개가 못 지운다 — 카메라는 별개다
    const role = app.lift.an.roles.get(id)
    if (role !== 'content') continue
    const kept = ps.filter(x => x.strokeId === id && !hit.includes(x))
    const rm = removeById(app.doc, id)
    if (!rm) continue
    const newStrokes: Stroke[] = kept.map(k => {
      const s: Stroke = { id: app.nextId++, a: k.a, b: k.b }
      if (!isDrawPose(app.pose)) s.view = { p: { ...app.pose.p }, q: { ...app.pose.q } }
      return s
    })
    app.doc.strokes.push(...newStrokes)
    // 드래그 안에서 이미 만든 조각을 또 지우면 — 그 조각은 op에서 지우고 원본은 그대로
    const idxInAdded = op.added.findIndex(s => s.id === id)
    if (idxInAdded >= 0) op.added.splice(idxInAdded, 1)
    else op.removed.push(rm)
    op.added.push(...newStrokes)
  }
  recompute(app)
}

export function endErase(app: App) {
  const op = app.activeErase
  app.activeErase = null
  if (op && (op.removed.length > 0 || op.added.length > 0)) {
    app.undoStack.push(op)
    app.redoStack = []
  }
}

export function setPose(app: App, pose: CamPose) {
  app.pose = pose
  for (const l of app.listeners) l()
}

export function setView(app: App, v: ViewOffset) {
  app.view = v
  for (const l of app.listeners) l()
}

/** 작도 시점 — 포즈와 뷰 오프셋 둘 다 원래대로 */
export function resetPose(app: App) {
  app.view = { s: 1, ox: 0, oy: 0 }
  setPose(app, DRAW_POSE)
}

export function saveView(app: App) {
  app.savedViews.push({
    pose: { p: { ...app.pose.p }, q: { ...app.pose.q } },
    view: { ...app.view },
  })
  for (const l of app.listeners) l() // 자동 저장이 듣는다
}

/** .brnl 복원 — 문서·시점만 갈아끼우고 나머지는 전부 다시 계산 */
export function loadDoc(app: App, data: { doc: Doc; nextId: number; savedViews: App['savedViews'] }) {
  app.doc = data.doc
  app.nextId = data.nextId
  app.savedViews = data.savedViews
  app.undoStack = []
  app.redoStack = []
  app.pose = DRAW_POSE
  app.view = { s: 1, ox: 0, oy: 0 }
  recompute(app)
}

export function gotoView(app: App, i: number) {
  const v = app.savedViews[i]
  if (!v) return
  app.view = { ...v.view }
  setPose(app, { p: { ...v.pose.p }, q: { ...v.pose.q } })
}

/** 궤도 중심 — 승격 기하의 무게중심, 없으면 게이지 깊이의 시선 위 점 */
export function orbitPivot(app: App): V3 {
  const segs = [...app.lift.lifted.values()]
  if (segs.length === 0) {
    const f = app.lift.an.f ?? 1000
    return v3(0, 0, -f)
  }
  let x = 0, y = 0, z = 0
  for (const s of segs) {
    x += s.a3.x + s.b3.x; y += s.a3.y + s.b3.y; z += s.a3.z + s.b3.z
  }
  const n = segs.length * 2
  return v3(x / n, y / n, z / n)
}
