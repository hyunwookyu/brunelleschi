// .brnl 저장·복원 — 문서(획·프레임)와 시점만 담는다.
// 카메라·소실점·리프팅은 파생이므로 저장하지 않는다(원칙 b) — 복원 후 다시 계산된다.

import type { Doc, Stroke, Face, Sheet, ViewOffset, Grade, RawInput } from './types'
import { drawSheet, DRAW_SHEET_ID } from './types'
import { horizonDocY } from './camera'
import { GRADES } from './material'
import { UNITS, type Unit } from './dim'
import { C } from './constants'

export interface BrnlData {
  doc: Doc
  nextId: number
  /** 작도 시점(web2-17 3-c) — **선택**: 없으면(옛 파일·변환된 v1) 원점으로 연다.
   *  모양이 틀리면 이 필드만 버린다(썸네일의 선례 — 구도는 잃어도 다시 잡히는 값이다). */
  drawView?: ViewOffset | null
}

/** version 4(web2-19 2-b): 종이(Doc.sheets)가 savedViews를 대신한다.
 *  역사: 1 = 첫 획이 지평선이던 형식(읽으며 변환 — web2-17 2-b) · 2 = 지평선 없는 형식 ·
 *  3 = 쓰인 적 없음(지시 2-b 문면 「1~3을 다 받는다」대로 2와 같은 모양으로 읽는다) ·
 *  4 = sheets. **5 이상은 거부** — 전방 호환을 흉내내지 않는다(2-c ③의 규약 그대로).
 *  옛 PWA는 version≠1·2를 거부하고 빈 화면으로 시작한다 — 조용히 틀리게 여는 것보다 낫다. */
export function serializeBrnl(d: BrnlData): string {
  return JSON.stringify({
    format: 'brnl',
    version: 4,
    frame: d.doc.frame,
    strokes: d.doc.strokes,
    // 면은 **경계의 정체**만 담긴다(획 id 차례) — 좌표는 복원 후 다시 풀린다.
    faces: d.doc.faces,
    // 치수(web2-08 지시 4) — 표시 단위·스케일 기준 획은 사용자의 결정이라 담는다.
    // 스케일 값(mmPerUnit)은 파생이라 안 담는다(dim에서 복원 후 다시 계산 — 원칙 b).
    unit: d.doc.unit,
    scaleRef: d.doc.scaleRef,
    nextId: d.nextId,
    // 종이(web2-19 2-b) — 배열 0이 작도 종이(pose·view 없음 — 정본은 DRAW_POSE·drawView).
    sheets: d.doc.sheets,
    // 작도 시점(web2-17 3-c) — 없으면 열쇠 자체를 안 쓴다(왕복 동일성 — 2-c ② 팔)
    ...(d.drawView ? { drawView: d.drawView } : {}),
  })
}

const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x)
const isPt = (p: any): boolean => p && isNum(p.x) && isNum(p.y)
const isV3 = (p: any): boolean => p && isNum(p.x) && isNum(p.y) && isNum(p.z)
const isQuat = (q: any): boolean => q && isNum(q.x) && isNum(q.y) && isNum(q.z) && isNum(q.w)

export function parseBrnl(text: string): BrnlData | null {
  let raw: any
  try { raw = JSON.parse(text) } catch { return null }
  // 1~4를 받는다(web2-19 2-b — 1~3은 savedViews 형식·4는 sheets).
  // 5 이상은 **거부** — 전방 호환을 흉내내지 않는다(2-c ③).
  if (!raw || raw.format !== 'brnl' || ![1, 2, 3, 4].includes(raw.version)) return null
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

  // 썸네일 검사(web2-12 5번) — 선택 필드. 모양이 다르면(문자열 아님·data:image 아님·과대)
  // **그 필드만 버린다**: 뷰 자체(포즈)는 정상이므로 rawIn류의 «거부»가 아니라 강등이다.
  const takeThumb = (t: unknown): string | undefined =>
    typeof t === 'string' && t.startsWith('data:image/') && t.length < 300000 ? t : undefined

  // 옛 형식(1~3)의 명명된 뷰 — 마이그레이션의 입력이다(아래 「종이」 절)
  const savedViews: { pose: NonNullable<Sheet['pose']>; view: ViewOffset; thumb?: string }[] = []
  if (raw.version !== 4 && Array.isArray(raw.savedViews)) {
    for (const v of raw.savedViews) {
      if (!v || !isV3(v.pose?.p) || !isQuat(v.pose?.q)) continue
      if (!isNum(v.view?.s) || !isNum(v.view?.ox) || !isNum(v.view?.oy)) continue
      const sv: (typeof savedViews)[number] =
        { pose: { p: { ...v.pose.p }, q: { ...v.pose.q } }, view: { s: v.view.s, ox: v.view.ox, oy: v.view.oy } }
      const th = takeThumb(v.thumb)
      if (th) sv.thumb = th
      savedViews.push(sv)
    }
  }
  // v4의 종이 — **모양이 틀리면 그 종이만 버린다**(문서를 거부하지 않는다 — 지시 2-b).
  // 유효한 모양은 둘뿐이다: pose·view가 **둘 다** 있는 종이, 또는 둘 다 없는 작도 종이.
  // 한쪽만 있으면 그 종이는 죽은 모양이다(포즈 없는 화면·화면 없는 포즈 — 앉을 수 없다).
  const rawSheets: Sheet[] = []
  if (raw.version === 4 && Array.isArray(raw.sheets)) {
    for (const s of raw.sheets) {
      if (!s || !isNum(s.id) || typeof s.name !== 'string' || s.name.length === 0 || s.name.length > 200) continue
      const hasPose = s.pose !== undefined || s.view !== undefined
      const entry: Sheet = { id: s.id, name: s.name }
      if (hasPose) {
        if (!isV3(s.pose?.p) || !isQuat(s.pose?.q)) continue
        if (!isNum(s.view?.s) || !isNum(s.view?.ox) || !isNum(s.view?.oy)) continue
        entry.pose = { p: { ...s.pose.p }, q: { ...s.pose.q } }
        entry.view = { s: s.view.s, ox: s.view.ox, oy: s.view.oy }
      }
      const th = takeThumb(s.thumb)
      if (th) entry.thumb = th
      rawSheets.push(entry)
    }
  }
  // id는 획·면·종이가 **한 통**이다(겹이 종이를 가리키게 되므로 — 지시 2-b)
  const maxId = Math.max(
    strokes.reduce((m, s) => Math.max(m, s.id), 0),
    faces.reduce((m, f) => Math.max(m, f.id), 0),
    rawSheets.reduce((m, s) => Math.max(m, s.id), 0),
  )
  let nextId = isNum(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1
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
  // 작도 시점(web2-17 3-c) — 선택. 모양이 틀리면 **이 필드만** 버린다(썸네일의 선례).
  let drawView: ViewOffset | null = null
  if (raw.drawView && isNum(raw.drawView.s) && isNum(raw.drawView.ox) && isNum(raw.drawView.oy)) {
    drawView = { s: raw.drawView.s, ox: raw.drawView.ox, oy: raw.drawView.oy }
  }

  // ── version 1 → 2 변환(web2-17 2-b) — 문서를 통째로 평행이동하고 지평선 획을 버린다 ──
  // 옛 형식의 첫 획은 구성상 지평선이다(작도 포즈·수평 강제 — view가 없다). 그 y를 H/2로
  // 옮기면 새 카메라(지평선 = H/2 상수)에서 **같은 3D**가 나온다(1-a — 사영이 상대 좌표라
  // 평행이동이 소거된다. 팔 legacy_web2_16.json 오라클이 값으로 지킨다).
  if (raw.version === 1 && strokes.length > 0) {
    const first = strokes[0]!
    // 가드(2차 리뷰어 [5]) — 옛 앱의 첫 획은 구성상 지평선(정확히 수평·작도 포즈)이다.
    // 아니면(손 편집·손상) 이 변환의 전제가 깨진 것이고, 내용 획을 버리고 dy를 틀리게
    // 잡아 **문서 전체를 조용히 어긋나게** 열 수 있다 — 거부가 낫다(2-a와 같은 판단).
    if (first.a.y !== first.b.y || first.view) return null
    const hzOld = (first.a.y + first.b.y) / 2
    const dy = horizonDocY(raw.frame.H) - hzOld   // 출처는 camera.ts 하나다(1-b 원칙 a)
    strokes.shift()               // 지평선 획 폐기 — 작도 획이었고 3D가 없었다(무한원)
    for (const s of strokes) {
      s.a.y += dy
      s.b.y += dy
      if (s.raw) for (const p of s.raw) p.y += dy
      // own3(3D)·view(포즈)·dim·rawIn은 안 건드린다 — 3D 기하가 구성상 그대로다(1-a)
    }
    // 저장된 화면 오프셋은 문서 좌표를 향한다 — 같은 화면 그림이 유지되려면
    // o' = o − dy·s (화면 y = s·(y+dy) + o' = s·y + o).
    for (const v of savedViews) v.view.oy -= dy * v.view.s
    // scaleRef가 버린 획을 가리키면 그 열쇠만 버린다(면의 선례 — 문서를 거부하지 않는다)
    if (scaleRef === first.id) scaleRef = undefined
  }

  // ── 종이(web2-19 2-b) ────────────────────────────────────────────────
  // v1~v3: savedViews[i] → sheets[i+1](이름 「종이 2」…) · 작도 종이는 여기서 만든다.
  //   id는 nextId에서 할당한다(한 통 — 겹이 가리킬 값이라 유일해야 한다).
  // v4: 읽은 종이를 그대로 쓰되 **작도 종이가 늘 앞에 서게** 한다: 배열 0이 pose 없는
  //   종이면 그것이 작도이고, 아니면(없거나 뒤에 있거나 죽었거나) 앞에 만들어 준다.
  //   0이 아닌 자리의 pose 없는 종이는 죽은 모양이다(작도는 하나다) — 그 종이만 버린다.
  let sheets: Sheet[]
  if (raw.version === 4) {
    const first = rawSheets[0] && !rawSheets[0].pose ? [rawSheets.shift()!] : [drawSheet()]
    sheets = [...first, ...rawSheets.filter(s => s.pose)]
  } else {
    sheets = [drawSheet(), ...savedViews.map((v, i) => ({
      id: nextId + i, name: `종이 ${i + 2}`, pose: v.pose, view: v.view,
      ...(v.thumb ? { thumb: v.thumb } : {}),
    }))]
    nextId += savedViews.length
  }
  // 작도 종이 id가 다른 것과 겹치면(손 편집 파일) 예약값으로 되돌린다 — 참조가 갈린다
  if (sheets.slice(1).some(s => s.id === sheets[0]!.id)) sheets[0] = { ...sheets[0]!, id: DRAW_SHEET_ID }

  const doc: Doc = { frame: { W: raw.frame.W, H: raw.frame.H }, strokes, faces, sheets, unit }
  if (scaleRef !== undefined) doc.scaleRef = scaleRef
  return { doc, nextId, drawView }
}
