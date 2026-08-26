// .brnl 저장·복원 — 문서(획·프레임)와 시점만 담는다.
// 카메라·소실점·리프팅은 파생이므로 저장하지 않는다(원칙 b) — 복원 후 다시 계산된다.

import type { Doc, Stroke, Face, CamPose, ViewOffset, Grade, RawInput } from './types'
import { GRADES } from './material'
import { UNITS, type Unit } from './dim'
import { C } from './constants'

export interface BrnlData {
  doc: Doc
  nextId: number
  /** thumb(web2-12 5번) — **선택**이다: 없으면(옛 파일) 번호만으로 고른다. */
  savedViews: { pose: CamPose; view: ViewOffset; thumb?: string }[]
}

export function serializeBrnl(d: BrnlData): string {
  return JSON.stringify({
    format: 'brnl',
    version: 1,
    frame: d.doc.frame,
    strokes: d.doc.strokes,
    // 면은 **경계의 정체**만 담긴다(획 id 차례) — 좌표는 복원 후 다시 풀린다.
    // 옛 파일에는 이 열쇠가 없고 그때는 면이 없는 문서로 읽힌다(version은 그대로 1).
    faces: d.doc.faces,
    // 치수(web2-08 지시 4) — 표시 단위·스케일 기준 획은 사용자의 결정이라 담는다.
    // 스케일 값(mmPerUnit)은 파생이라 안 담는다(dim에서 복원 후 다시 계산 — 원칙 b).
    // 옛 파일에는 이 열쇠들이 없고 그때는 mm 문서로 읽힌다(version 그대로 1).
    unit: d.doc.unit,
    scaleRef: d.doc.scaleRef,
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
    // 점별 입력(web2-11 1-c) — **전부 선택**이다: 없으면(옛 파일·손으로 지운 파일) 지금까지와
    // 같다. 있는데 모양이 틀리면(raw와 길이 불일치·비수·대역 밖) **거부한다** — mat.w와
    // 같은 규약(모르는 값으로 조용히 틀리게 그리지 않는다). 대역은 types.ts의 양자화 정의.
    if (s.rawIn !== undefined && s.rawIn !== null) {
      if (typeof s.rawIn !== 'object' || !st.raw) return null
      const n = st.raw.length
      const ri: RawInput = {}
      const take = (key: keyof RawInput, lo: number, hi: number): boolean => {
        const arr = (s.rawIn as any)[key]
        if (arr === undefined) return true
        if (!Array.isArray(arr) || arr.length !== n) return false
        if (!arr.every((v: unknown) => isNum(v) && v >= lo && v <= hi)) return false
        ri[key] = arr.map(Number)
        return true
      }
      if (!take('press', 0, C.PRESS_Q)) return null
      if (!take('tiltX', -90, 90)) return null
      if (!take('tiltY', -90, 90)) return null
      if (!take('twist', 0, 359)) return null
      if (Object.keys(ri).length > 0) st.rawIn = ri
    }
    if (s.view) {
      if (!isV3(s.view.p) || !isQuat(s.view.q)) return null
      st.view = { p: { ...s.view.p }, q: { ...s.view.q } }
    }
    // 치수 mm — 0 이하·비수는 거부한다(길이 0 획은 lift가 조용히 못 푼다)
    if (s.dim !== undefined) {
      if (!isNum(s.dim) || s.dim <= 0) return null
      st.dim = s.dim
    }
    // 자립 3D(web2-13 4부 — 깃발 뒤) — **선택**: 없으면(옛 파일·옛 앱이 재저장한 파일)
    // 종전 그대로다. 모양이 틀리면 **그 필드만 버린다** — rawIn·mat.w의 «거부»와 다른
    // 규약인 이유: own3는 사슬로 언제든 다시 세울 수 있는 «굳힘»이라(§8 이행) 잃어도
    // 조용히 틀리게 그려질 값이 아니라 다시 계산될 값이다. 문서를 거부하면 잃는 것이
    // 더 크다. 깃발이 꺼져 있으면 읽혀도 아무 데도 안 쓰인다.
    if (s.own3 && isV3(s.own3.a) && isV3(s.own3.b) &&
        (s.own3.axis === null || typeof s.own3.axis === 'string')) {
      st.own3 = { a: { ...s.own3.a }, b: { ...s.own3.b }, axis: s.own3.axis ?? null }
    }
    if (s.mat) {
      if (!GRADES.includes(s.mat.grade as Grade)) return null
      st.mat = { grade: s.mat.grade as Grade }
      if (isNum(s.mat.press)) st.mat.press = s.mat.press
      // 니브 굵기 — 대역 밖이면 **거부한다**(모르는 경도와 같은 급). 굵기 0이나 음수가
      // 들어오면 three.js가 조용히 안 그리므로 「사라졌다」가 된다.
      if (s.mat.w !== undefined) {
        if (!isNum(s.mat.w) || s.mat.w < C.NIB_MIN || s.mat.w > C.NIB_MAX) return null
        st.mat.w = s.mat.w
      }
    }
    strokes.push(st)
  }
  // ── 면 ──────────────────────────────────────────────────────────────
  // 경계가 가리키는 획이 없으면 **거부하지 않고 그 면만 버린다** — 획은 지워질 수
  // 있고 그때 면이 못 풀리는 것은 정상 상태다(불변식 j의 면판). 손상 판정은
  // 「모양이 틀렸다」에만 건다.
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
      const sv: BrnlData['savedViews'][number] =
        { pose: { p: { ...v.pose.p }, q: { ...v.pose.q } }, view: { ...v.view } }
      // 썸네일(web2-12 5번) — 선택 필드. 모양이 다르면(문자열 아님·data:image 아님·과대)
      // **그 필드만 버린다**: 뷰 자체(포즈)는 정상이므로 rawIn류의 «거부»가 아니라 강등이다.
      if (typeof v.thumb === 'string' && v.thumb.startsWith('data:image/') && v.thumb.length < 300000) {
        sv.thumb = v.thumb
      }
      savedViews.push(sv)
    }
  }
  // id는 획과 면이 **한 통**이다(면이 획을 가리키므로 겹치면 읽기 어렵다)
  const maxId = Math.max(
    strokes.reduce((m, s) => Math.max(m, s.id), 0),
    faces.reduce((m, f) => Math.max(m, f.id), 0),
  )
  const nextId = isNum(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1
  // 단위 — 없으면(옛 파일) mm. 모양이 틀리면 거부한다.
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
