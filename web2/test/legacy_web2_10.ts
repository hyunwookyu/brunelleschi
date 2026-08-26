// **web2-10 배포판(b6980c9)의 parseBrnl 스냅샷** — 수정 금지.
//
// 왜 있는가(web2-11 1-e): 「새 파일이 옛 앱에서 어떻게 되는가」를 재려면 옛 파서가
// 필요한데, 배포된 PWA는 사람마다 갱신 시점이 달라 옛 파서가 실사용에 남아 있다.
// src/core/file.ts를 web2-11이 고치기 **직전**(원격 main b6980c9 상태)에 그대로 떠 왔다
// (§3의 복사 금지는 참조 저장소 코드 얘기다 — 이 저장소 자신의 코드는 대상이 아니다).
// 이 파서가 새 필드(rawIn)를 **어떻게 다루는지**(무시하는지 거부하는지)를 팔이 실측한다.

import type { Doc, Stroke, Face, CamPose, ViewOffset, Grade } from '../src/core/types'
import { GRADES } from '../src/core/material'
import { UNITS, type Unit } from '../src/core/dim'
import { C } from '../src/core/constants'

export interface BrnlData {
  doc: Doc
  nextId: number
  savedViews: { pose: CamPose; view: ViewOffset }[]
}

const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x)
const isPt = (p: any): boolean => p && isNum(p.x) && isNum(p.y)
const isV3 = (p: any): boolean => p && isNum(p.x) && isNum(p.y) && isNum(p.z)
const isQuat = (q: any): boolean => q && isNum(q.x) && isNum(q.y) && isNum(q.z) && isNum(q.w)

export function parseBrnlLegacy(text: string): BrnlData | null {
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
    if (s.dim !== undefined) {
      if (!isNum(s.dim) || s.dim <= 0) return null
      st.dim = s.dim
    }
    if (s.mat) {
      if (!GRADES.includes(s.mat.grade as Grade)) return null
      st.mat = { grade: s.mat.grade as Grade }
      if (isNum(s.mat.press)) st.mat.press = s.mat.press
      if (s.mat.w !== undefined) {
        if (!isNum(s.mat.w) || s.mat.w < C.NIB_MIN || s.mat.w > C.NIB_MAX) return null
        st.mat.w = s.mat.w
      }
    }
    strokes.push(st)
  }
  const faces: Face[] = []
  if (Array.isArray(raw.faces)) {
    for (const f of raw.faces) {
      if (!isNum(f?.id) || !Array.isArray(f.loops) || f.loops.length === 0) return null
      const loops = []
      let ok = true
      for (const l of f.loops) {
        if (!Array.isArray(l?.edges) || l.edges.length < 3) { ok = false; break }
        const edges = []
        for (const e of l.edges) {
          if (e?.kind !== 'stroke' || !isNum(e.s)) { ok = false; break }
          edges.push({ kind: 'stroke' as const, s: e.s })
        }
        if (!ok) break
        loops.push({ edges })
      }
      if (!ok) return null
      faces.push({ id: f.id, loops })
    }
  }

  const savedViews: BrnlData['savedViews'] = []
  if (Array.isArray(raw.savedViews)) {
    for (const v of raw.savedViews) {
      if (!v || !isV3(v.pose?.p) || !isQuat(v.pose?.q)) continue
      if (!isNum(v.view?.s) || !isNum(v.view?.ox) || !isNum(v.view?.oy)) continue
      savedViews.push({ pose: { p: { ...v.pose.p }, q: { ...v.pose.q } }, view: { ...v.view } })
    }
  }
  const maxId = Math.max(
    strokes.reduce((m, s) => Math.max(m, s.id), 0),
    faces.reduce((m, f) => Math.max(m, f.id), 0),
  )
  const nextId = isNum(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1
  let unit: Unit = 'mm'
  if (raw.unit !== undefined) {
    if (!UNITS.includes(raw.unit)) return null
    unit = raw.unit
  }
  let scaleRef: number | undefined
  if (raw.scaleRef !== undefined && raw.scaleRef !== null) {
    if (!isNum(raw.scaleRef)) return null
    scaleRef = raw.scaleRef
  }
  const doc: Doc = { frame: { W: raw.frame.W, H: raw.frame.H }, strokes, faces, unit }
  if (scaleRef !== undefined) doc.scaleRef = scaleRef
  return { doc, nextId, savedViews }
}
