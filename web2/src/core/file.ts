// .brnl 저장·복원 — 문서(획·프레임)와 시점만 담는다.
// 카메라·소실점·리프팅은 파생이므로 저장하지 않는다(원칙 b) — 복원 후 다시 계산된다.

import type { Doc, Stroke, CamPose, ViewOffset } from './types'

export interface BrnlData {
  doc: Doc
  nextId: number
  savedViews: { pose: CamPose; view: ViewOffset }[]
}

export function serializeBrnl(d: BrnlData): string {
  return JSON.stringify({
    format: 'brnl',
    version: 1,
    frame: d.doc.frame,
    strokes: d.doc.strokes,
    nextId: d.nextId,
    savedViews: d.savedViews,
  })
}

const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x)
const isPt = (p: any): boolean => p && isNum(p.x) && isNum(p.y)
const isV3 = (p: any): boolean => p && isNum(p.x) && isNum(p.y) && isNum(p.z)
const isQuat = (q: any): boolean => q && isNum(q.x) && isNum(q.y) && isNum(q.z) && isNum(q.w)

export function parseBrnl(text: string): BrnlData | null {
  let raw: any
  try { raw = JSON.parse(text) } catch { return null }
  if (!raw || raw.format !== 'brnl' || raw.version !== 1) return null
  if (!raw.frame || !isNum(raw.frame.W) || !isNum(raw.frame.H)) return null
  if (!Array.isArray(raw.strokes)) return null
  const strokes: Stroke[] = []
  for (const s of raw.strokes) {
    if (!isNum(s?.id) || !isPt(s?.a) || !isPt(s?.b)) return null
    const st: Stroke = { id: s.id, a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y } }
    if (Array.isArray(s.raw) && s.raw.every(isPt)) st.raw = s.raw.map((p: any) => ({ x: p.x, y: p.y }))
    if (s.view) {
      if (!isV3(s.view.p) || !isQuat(s.view.q)) return null
      st.view = { p: { ...s.view.p }, q: { ...s.view.q } }
    }
    strokes.push(st)
  }
  const savedViews: BrnlData['savedViews'] = []
  if (Array.isArray(raw.savedViews)) {
    for (const v of raw.savedViews) {
      if (!v || !isV3(v.pose?.p) || !isQuat(v.pose?.q)) continue
      if (!isNum(v.view?.s) || !isNum(v.view?.ox) || !isNum(v.view?.oy)) continue
      savedViews.push({ pose: { p: { ...v.pose.p }, q: { ...v.pose.q } }, view: { ...v.view } })
    }
  }
  const maxId = strokes.reduce((m, s) => Math.max(m, s.id), 0)
  const nextId = isNum(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1
  return {
    doc: { frame: { W: raw.frame.W, H: raw.frame.H }, strokes },
    nextId,
    savedViews,
  }
}
