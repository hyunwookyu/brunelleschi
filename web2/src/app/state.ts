// 앱 상태 — 문서(획 목록)와 뷰 포즈. 카메라·소실점·리프팅은 전부 계산으로 나온다.

import { emptyDoc, type Doc, type Stroke, type CamPose } from '../core/types'
import { liftAll, type LiftResult } from '../core/lift'
import { DRAW_POSE } from '../core/camera'
import { defaultOsnap, type OsnapSettings } from '../core/osnap'
import { type Pt, type V3, v3 } from '../core/vec'

export interface App {
  doc: Doc
  redoStack: Stroke[]
  pose: CamPose
  nextId: number
  /** 문서가 바뀔 때마다 다시 계산 — 유일한 캐시이고 doc에서만 나온다 */
  lift: LiftResult
  /** 문서 변경 카운터 — 렌더가 기하 재구축 시점을 안다 (포즈 변경과 구분) */
  docVersion: number
  /** 오스냅 설정 — 종류별 켜고 끄기, 반경 (Rhino 관행) */
  osnap: OsnapSettings
  listeners: (() => void)[]
}

export function createApp(W: number, H: number): App {
  const doc = emptyDoc(W, H)
  return {
    doc,
    redoStack: [],
    pose: DRAW_POSE,
    nextId: 1,
    lift: liftAll(doc),
    docVersion: 0,
    osnap: defaultOsnap(),
    listeners: [],
  }
}

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
  app.redoStack = [] // 새 획이 들어오면 다시실행 갈래는 사라진다 (선례)
  recompute(app)
  return s
}

/** 실행취소 — 그림만 되돌린다. 작도(카메라)는 별개다. */
export function undo(app: App) {
  const roles = app.lift.an.roles
  for (let i = app.doc.strokes.length - 1; i >= 0; i--) {
    if (roles.get(app.doc.strokes[i]!.id) === 'content') {
      app.redoStack.push(app.doc.strokes.splice(i, 1)[0]!)
      recompute(app)
      return
    }
  }
}

export function redo(app: App) {
  const s = app.redoStack.pop()
  if (!s) return
  app.doc.strokes.push(s)
  recompute(app)
}

export function setPose(app: App, pose: CamPose) {
  app.pose = pose
  for (const l of app.listeners) l()
}

export function resetPose(app: App) { setPose(app, DRAW_POSE) }

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
