// .brnl 저장·복원 — 문서(획·프레임)와 시점만 담는다.
// 카메라·소실점·리프팅은 파생이므로 저장하지 않는다(원칙 b) — 복원 후 다시 계산된다.

import type { Doc, Stroke, Face, Sheet, Layer, Paper, ViewOffset, Grade, RawInput, Underlay, UnderlaySegment, CamPose, Person } from './types'
import { drawSheet, DRAW_SHEET_ID } from './types'
import { horizonDocY } from './camera'
import { GRADES } from './material'
import { UNITS, type Unit } from './dim'
import { validPressCal } from './press'
import { isMatId, isHex6 } from './palette'
import { isRepId } from './matrep'
import type { Measure } from './measure'
import { C } from './constants'

export interface BrnlData {
  doc: Doc
  nextId: number
  /** 작도 시점(web2-17 3-c) — **선택**: 없으면(옛 파일·변환된 v1) 원점으로 연다.
   *  모양이 틀리면 이 필드만 버린다(썸네일의 선례 — 구도는 잃어도 다시 잡히는 값이다). */
  drawView?: ViewOffset | null
}

/** version 6(web2-23 2-b): 밑그림(Doc.underlays)이 실린다.
 *  역사: 1 = 첫 획이 지평선(읽으며 변환) · 2 = 지평선 없음 · 3 = 쓰인 적 없음(v2 모양으로
 *  읽는다) · 4 = sheets · 5 = layers · 6 = underlays. **7 이상은 거부** — 전방 호환을
 *  흉내내지 않는다. 열쇠가 없으면 그 항이 없는 문서다(옛 판 — 그대로 열린다).
 *  ⚠ 판을 올려도 **쓰는 판은 언제나 최신 하나**다(옛 판으로 되쓰지 않는다) — 밑그림이
 *  없는 문서도 v6으로 나가고, 그때 `underlays` 열쇠 자체를 안 쓴다(왕복 동일성). */
export interface SerializeOptions {
  /** **저장 좌표 반올림**(web2-25 5-b) — 끄면 배정밀도 그대로다. 기본 켬.
   *  ⚠ 반증·측정 손잡이다(`make2d.ts`의 `BakeOptions`와 같은 어법) — 앱에는 UI가 없다. */
  round?: boolean
}

/** **저장할 때만 좌표를 소수 첫째 자리로 반올림한다**(web2-25 5-b).
 *
 *  왜: 점렬이 배정밀도 그대로 JSON에 실린다(`123.45678901234567` — 한 수에 18자).
 *  0.1px 는 눈에 안 보인다 — **솎기 임계(0.5px · AS-C82)보다도 촘촘하다**. 즉 이 반올림이
 *  버리는 것은 이미 «없는 것으로 친» 대역 안이다.
 *
 *  ⚠⚠ **메모리의 값을 깎지 않는다**(지시 5-b ⚠). 여기서 새 객체를 만들어 내보낼 뿐이고
 *  `Doc`의 점은 그대로다 — 그리는 동안의 기하가 저장 형식에 끌려가면 안 된다.
 *  ⚠ **문서 px 좌표에만 건다.** 3D(`own3`)·포즈·`view.s`·치수(mm)는 단위가 달라 0.1이
 *  «안 보이는 대역»이 아니다 — 안 건드린다(그 사실을 팔이 단언한다).
 *
 *  ⚠⚠⚠ **깎는 것은 표현용 점렬(`raw`) 하나다.** 확정 끝점 `a`·`b`도, 밑그림 마디도 안 깎는다.
 *  까닭은 **잉크 심판**이다(own3d.ts §7): 자립 3D(`own3`)는 「그 3D를 지금 카메라로 다시
 *  사영하면 획의 끝점에 떨어진다」를 `OWN3_TOL_PX`(**0.01px**)로 지킨다. `a`·`b`를 0.1
 *  단위로 옮기면 그 어긋남이 최대 0.05px라 **불변식이 왕복에서 깨진다**(own3d.test 넷이
 *  실제로 빨개져 잡았다 — 팔이 옳았고 초판이 틀렸다: #74 ㉢의 판별 물음 그대로 「그 팔이
 *  지키던 요구가 지금도 유효한가」 → 유효하다). 그리고 잃는 것도 없다: 표가 말하듯
 *  끝점은 획당 두 점이고 바이트의 큰 몫은 `raw`다(`filesize25_web2.json`). */
const r1 = (v: number): number => Math.round(v * 10) / 10
const roundPt = (p: { x: number; y: number }) => ({ ...p, x: r1(p.x), y: r1(p.y) })
/** 칠 uv의 반올림 — **세계 단위**라 0.1이 아니라 1e-4다(면 폭 O(1) 단위 · 텍스처
 *  1024px에서 1e-4 단위 ≈ 0.02px — 픽셀 아래). raw와 같은 이유(바이트의 큰 몫)다. */
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4
const roundStroke = (s: Stroke): Stroke => {
  let out = s
  if (out.raw) out = { ...out, raw: out.raw.map(roundPt) }
  if (out.paint?.uv) out = { ...out, paint: { ...out.paint, uv: out.paint.uv.map(r4) } }
  return out
}

/** 반증 손잡이(e2e 전용 — `diag.saveRound`) — 저장 반올림의 **기본값**을 끈다.
 *  앱에는 UI가 없다. 팔이 「반올림 있는 문서」와 「없는 문서」를 **같은 재그리기 경로로**
 *  나란히 놓고 픽셀을 견주는 데 쓴다(5-c ③ — 그러지 않으면 «생으로 그린 화면 ↔ 문서에서
 *  다시 그린 화면»의 차가 섞여 반올림 몫을 못 가른다). */
let roundDefault = true
export const setSaveRoundForTest = (v: boolean): void => { roundDefault = v }

/** **열쇠 차례**(web2-43 1번) — 저장물의 열쇠 순서를 **쓰는 쪽이 정한다**.
 *
 *  왜 필요한가: 43-1의 게이트는 「저장 → 로드 → 재저장이 **바이트로 동일**」인데, 열쇠
 *  차례가 «그 객체를 누가 만들었는가»에 딸려 있으면 그것이 성립하지 않는다. 실측(초판):
 *  앱이 만든 획은 `…,mat,own3`이고 파서가 만든 획은 `…,own3,mat`이라 **같은 문서가 다른
 *  바이트로 나갔다**. 값은 하나도 안 다른데 바이트가 달랐다.
 *
 *  ⚠ **형식 «개선»이 아니다**(지시문 「하지 말 것」): 열쇠 이름도 값도 구조도 안 바뀐다 —
 *  같은 열쇠의 **차례**만 고정한다. 옛 저장물은 그대로 열리고(파서는 차례를 안 본다),
 *  이 판으로 다시 나갈 때 차례가 정규형이 된다. 38이 바꿀 «이름»과 겹치지 않는다.
 *
 *  ⚠⚠ **이 목록에 없는 열쇠는 저장에서 사라진다**(`JSON.stringify`의 배열 replacer 규약).
 *  그것이 이 방식의 값이자 위험이다 — 그래서 짝으로 **`test/roundtrip43.test.ts`의 게이트 ②**가
 *  있다: `types.ts`·`measure.ts`·`press.ts`의 인터페이스 필드를 소스에서 긁어 픽스처의
 *  저장물과 대조하므로, 새 필드를 여기 안 적으면 **그 팔이 빨개진다**(조용히 안 사라진다).
 *
 *  차례는 **선언 차례**다(types.ts를 그대로 따른다). 한 벌뿐이므로 안쪽 모양의 열쇠도
 *  같은 목록에 산다 — 위상 정렬이 서는 것을 그 팔이 값으로 지킨다. */
const KEY_ORDER: string[] = [
  'format', 'version', 'frame', 'W', 'H',
  'strokes', 'id', 'a', 'b', 'x', 'y', 'z', 'raw', 'rawIn',
  'name', 'pose', 'p', 'q', 'proj', 'view', 'mat', 'dim', 'layer', 'own3', 'axis', 'text', 'lock',
  // 칠(web2-45 → 46 → **48**): f 면 id · s 면의 쪽(48-5) · c 색 hex(48-7) · i 도구 ·
  // w 자국 굵기(48-2). ⚠ `m`은 **면 재료**(Face.mat)가 아직 쓰고, `s`·`t`·`w`는 아래
  // 면·치수 줄에도 있는 이름이라 여기서 새로 안 적는다(이 배열은 열쇠 «차례»의 전역
  // 목록이고 이름이 겹치는 것은 정상이다 — 43-1 ①이 바이트로 지킨다).
  // web2-50: uv(면 위 좌표 — 정본)가 늘었다. press는 아래 줄에 이미 있다(전역 차례 목록).
  'paint', 'f', 'uv', 'm', 'i', 'c',
  // rep(web2-49 — 재료 표현 {m, s}: 열쇠 m·s는 위 칠 줄과 면 줄에 이미 있다)
  'faces', 'loops', 'edges', 'kind', 's', 't', 'ox', 'oy', 'cls', 'fill', 'rep',
  'unit', 'scaleRef', 'grade', 'press', 'w', 'h', 'D', 'tiltX', 'tiltY', 'twist',
  'nextId', 'sheets', 'thumb',
  'layers', 'sheet', 'paper', 'rect', 'on', 'locked', 'p0', 'p1', 'gamma',
  'underlays', 'segs', 'hidden',
  'measures', 'drawView',
  'persons', 'g',
]

export function serializeBrnl(d: BrnlData, opt: SerializeOptions = {}): string {
  const round = opt.round ?? roundDefault
  const strokes = round ? d.doc.strokes.map(roundStroke) : d.doc.strokes
  return JSON.stringify({
    format: 'brnl',
    version: 6,
    frame: d.doc.frame,
    strokes,
    // 면은 **경계의 정체**만 담긴다(획 id 차례) — 좌표는 복원 후 다시 풀린다.
    faces: d.doc.faces,
    // 치수(web2-08 지시 4) — 표시 단위·스케일 기준 획은 사용자의 결정이라 담는다.
    // 스케일 값(mmPerUnit)은 파생이라 안 담는다(dim에서 복원 후 다시 계산 — 원칙 b).
    unit: d.doc.unit,
    scaleRef: d.doc.scaleRef,
    // 필압 보정(web2-26 6번) — **꺼져 있으면 아예 안 쓴다**: 옛 문서와 바이트가 같아야
    // 「꺼짐에서 지금과 픽셀 단위로 동일」의 짝(파일도 안 바뀐다)이 선다.
    press: d.doc.press && d.doc.press.on ? { ...d.doc.press } : undefined,
    nextId: d.nextId,
    // 종이(web2-19 2-b) — 배열 0이 작도 종이(pose·view 없음 — 정본은 DRAW_POSE·drawView).
    sheets: d.doc.sheets,
    // 겹(web2-20 1부) — 배열 순서 = 쌓인 순서(뒤가 위). 없으면 열쇠를 안 쓴다(왕복 동일성).
    ...(d.doc.layers.length > 0 ? { layers: d.doc.layers } : {}),
    // 밑그림(web2-23 2-b) — 사건의 기록이라 담는다(면·겹과 같은 급). 없으면 열쇠 없음.
    // ⚠ 파일이 커지는 자리가 여기다(조각마다 점 둘) — 크기는 원장이 잰다(2-b ⚠).
    // ⚠ **밑그림은 안 깎는다** — 표가 그것을 안 지목했다(`filesize25_web2.json`
    // components_utf8: 밑그림은 문서의 0.1% 대역이다). 그리고 web2-23이 세운
    // **왕복 동일성**(`underlay.test` ④)이 그 자리에 있다 — 얻는 것 없이 규약만 깬다.
    ...(d.doc.underlays.length > 0 ? { underlays: d.doc.underlays } : {}),
    // **도면에 남긴 재기**(web2-32 6번) — 담기는 것은 「어느 두 점을 재는가」뿐이다.
    // ⚠⚠ **잰 값(mm)은 안 담는다** — 파생이다(원칙 b). 축척이 바뀌면 따라 바뀌어야 하는데
    // 숫자를 담으면 그 순간 굳어 «조용히 틀린 치수»가 된다(#61의 형태). 없으면 열쇠 없음.
    ...(d.doc.measures && d.doc.measures.length > 0 ? { measures: d.doc.measures } : {}),
    // 놓은 사람(web2-47) — 접지점뿐이다(모습은 기기의 스텐실 — 원칙 b). 없으면 열쇠 없음.
    ...(d.doc.persons && d.doc.persons.length > 0 ? { persons: d.doc.persons } : {}),
    // 작도 시점(web2-17 3-c) — 없으면 열쇠 자체를 안 쓴다(왕복 동일성 — 2-c ② 팔)
    ...(d.drawView ? { drawView: d.drawView } : {}),
  }, KEY_ORDER)
}

const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x)
/** 재는 점의 «정체» 모양 — 획 id와 그 선분 위 매개변수(0..1). `core/measure.ts` 참조. */
const isMeasurePoint = (p: any): boolean => p && isNum(p.s) && isNum(p.t) && p.t >= 0 && p.t <= 1
const isPt = (p: any): boolean => p && isNum(p.x) && isNum(p.y)
const isV3 = (p: any): boolean => p && isNum(p.x) && isNum(p.y) && isNum(p.z)
const isQuat = (q: any): boolean => q && isNum(q.x) && isNum(q.y) && isNum(q.z) && isNum(q.w)

/** **평행 사영 필드**(web2-42 2번) — 포즈에 붙는 선택 값. 없으면 원근이다(옛 파일 그대로).
 *  모양이 틀리면 **그 필드만 버린다**(own3·layer의 규약): 잃어도 «원근으로 본다»일 뿐이라
 *  조용히 틀린 좌표가 안 난다 — 문서를 거부하면 잃는 것이 더 크다.
 *  ⚠ `w`는 0…1, `D`는 양수다. 저장되는 것은 **완전 평행(w=1)뿐**이지만(전환 중에는
 *  아무도 저장을 안 한다) 사이 값도 정당한 사영이라 받아서 그대로 둔다. */
function takeProj(raw: any): CamPose['proj'] | undefined {
  const j = raw?.proj
  if (!j || !isNum(j.w) || !isNum(j.D)) return undefined
  if (j.w < 0 || j.w > 1 || j.D <= 0) return undefined
  return { w: j.w, D: j.D }
}
const withProj = (pose: CamPose, raw: any): CamPose => {
  const proj = takeProj(raw)
  return proj ? { ...pose, proj } : pose
}

/** 파서가 버린 것의 셈 — web2-50: uv 없는 옛 칠 획(45~48)을 획째 버리고 센다.
 *  부른 쪽(readBrnl)이 이 수를 보고문에 실어 **여는 순간 한 줄**로 말한다(43-1 규약). */
export interface ParseInfo { droppedPaint: number }

export function parseBrnl(text: string, info?: ParseInfo): BrnlData | null {
  let raw: any
  try { raw = JSON.parse(text) } catch { return null }
  // 1~6을 받는다(1~3은 savedViews 형식·4는 sheets·5는 layers·6은 underlays).
  // 7 이상은 **거부** — 전방 호환을 흉내내지 않는다(web2-19 2-c ③).
  if (!raw || raw.format !== 'brnl' || ![1, 2, 3, 4, 5, 6].includes(raw.version)) return null
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
      st.view = withProj({ p: { ...s.view.p }, q: { ...s.view.q } }, s.view)
    }
    // 치수 mm — 0 이하·비수는 거부한다(길이 0 획은 lift가 조용히 못 푼다)
    if (s.dim !== undefined) {
      if (!isNum(s.dim) || s.dim <= 0) return null
      st.dim = s.dim
    }
    // 겹 소속(web2-20 1부) — 선택. 모양이 틀리면 **그 필드만 버린다**(종이에 직접으로
    // 강등 — 겹 참조는 잃어도 획이 살아야 한다). 없는 겹을 가리키는 강등은 아래
    // layers 파싱 뒤에 한 번 더 돈다(참조 검증은 목록이 서야 가능하다).
    if (s.layer !== undefined && s.layer !== null) {
      if (isNum(s.layer)) st.layer = s.layer
    }
    // 자립 3D(web2-13 4부 — 깃발 뒤) — **선택**: 없으면(옛 파일·옛 앱이 재저장한 파일)
    // 종전 그대로다. 모양이 틀리면 **그 필드만 버린다** — rawIn·mat.w의 «거부»와 다른
    // 규약인 이유: own3는 사슬로 언제든 다시 세울 수 있는 «굳힘»이라(§8 이행) 잃어도
    // 조용히 틀리게 그려질 값이 아니라 다시 계산될 값이다. 문서를 거부하면 잃는 것이
    // 더 크다. 깃발이 꺼져 있으면 읽혀도 아무 데도 안 쓰인다.
    // 글씨 획(web2-32 1번) — **선택**이고 값은 1 하나다. 없으면(옛 파일) 작도선이다.
    // 모양이 틀리면 **그 필드만 버린다**(own3와 같은 규약 — 판정은 다시 설 수 있다).
    if (s.text === 1) st.text = 1
    // 잠금(web2-44) — text와 같은 규격(값 1 하나 · 모양이 틀리면 그 필드만 버린다:
    // 잃어도 «안 잠김»일 뿐이라 조용히 틀린 기하가 안 난다).
    if (s.lock === 1) st.lock = 1
    // 칠 획 — ⚠⚠ **web2-50: 정본이 면 위 좌표(uv)다.** uv(짝수 길이 ≥4 유한수)와
    // 쪽(±1)이 **같이 서야** 받는다(쪽 없는 칠 = 양쪽에 보이는 칠 ⛔ — rep의 규약 그대로).
    // **uv 없는 칠(45~48 형식)은 획째 버리고 센다** — 사용자 확정 「잃어도 상관없다」
    // (50 지시 · 마이그레이션 ⛔). 조용하면 안 되므로(43-1) 센 수가 여는 순간 알림이 된다.
    if (s.paint !== undefined && s.paint !== null) {
      const p = s.paint
      const uvOk = Array.isArray(p.uv) && p.uv.length >= 4 && p.uv.length % 2 === 0 &&
        p.uv.every((v: unknown) => isNum(v))
      if (!isNum(p.f) || !uvOk || !(p.s === 1 || p.s === -1)) {
        if (info) info.droppedPaint++
        continue                             // 이 획을 통째로 버린다(다음 획으로)
      }
      st.paint = { f: p.f, s: p.s, uv: p.uv.map(Number) }
      // 점별 필압(50 — 정본 목록의 «압력») — 길이가 uv 점 수와 같아야 받는다. 틀리면
      // 그 필드만 버린다(질은 51의 몫이라 잃어도 조용히 틀린 기하가 안 난다).
      if (Array.isArray(p.press) && p.press.length === p.uv.length / 2 &&
        p.press.every((v: unknown) => isNum(v) && (v as number) >= 0 && (v as number) <= C.PRESS_Q)) {
        st.paint.press = p.press.map(Number)
      }
      // 색 — 도구(i)와 **같이** 성해야 받는다(48-7의 규약 그대로).
      if (isHex6(p.c) && (p.i === 1 || p.i === 2)) {
        st.paint.c = p.c; st.paint.i = p.i
      }
      // 굵기 — **세계 단위**(50 — px에서 바뀌었다. 옛 px 값은 위에서 획째 버려져 여기
      // 안 닿는다). 양수 유한값만, 터무니없는 값은 그 필드만 버린다(대체 폭으로 물러난다).
      if (isNum(p.w) && p.w > 0 && p.w <= 1e6) st.paint.w = p.w
    }
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
      const face: Face = { id: f.id, loops }
      // 분류 정정·채움(web2-45) — 모양이 틀리면 **그 필드만 버린다**(own3의 규약:
      // 잃어도 «자동 분류»·«채움 없음»일 뿐이라 조용히 틀린 기하가 안 난다).
      if (f.cls === 'slab' || f.cls === 'wall' || f.cls === 'slope') face.cls = f.cls
      // 채움(web2-45 1=해칭 · **web2-48 48-3에서 2=단색**) — 모르는 값이면 그 필드만 버린다
      if (f.fill === 1 || f.fill === 2) face.fill = f.fill
      if (isMatId(f.mat)) face.mat = f.mat   // web2-46 — 모양이 틀리면 그 필드만 버린다
      // 재료 표현(web2-49) — m·s 둘이 **같이** 서야 산다(쪽 없는 무늬는 48-5 위반이라
      // 통째로 버린다 — 조용히 «양쪽에 보이는 무늬»를 만들지 않는다).
      if (isRepId(f.rep?.m) && (f.rep.s === 1 || f.rep.s === -1)) {
        face.rep = { m: f.rep.m, s: f.rep.s }
      }
      faces.push(face)
    }
  }

  // 썸네일 검사(web2-12 5번) — 선택 필드. 모양이 다르면(문자열 아님·data:image 아님·과대)
  // **그 필드만 버린다**: 뷰 자체(포즈)는 정상이므로 rawIn류의 «거부»가 아니라 강등이다.
  const takeThumb = (t: unknown): string | undefined =>
    typeof t === 'string' && t.startsWith('data:image/') && t.length < 300000 ? t : undefined

  // 옛 형식(1~3)의 명명된 뷰 — 마이그레이션의 입력이다(아래 「종이」 절)
  const savedViews: { pose: NonNullable<Sheet['pose']>; view: ViewOffset; thumb?: string }[] = []
  if (raw.version < 4 && Array.isArray(raw.savedViews)) {
    for (const v of raw.savedViews) {
      if (!v || !isV3(v.pose?.p) || !isQuat(v.pose?.q)) continue
      if (!isNum(v.view?.s) || !isNum(v.view?.ox) || !isNum(v.view?.oy)) continue
      const sv: (typeof savedViews)[number] =
        { pose: withProj({ p: { ...v.pose.p }, q: { ...v.pose.q } }, v.pose), view: { s: v.view.s, ox: v.view.ox, oy: v.view.oy } }
      const th = takeThumb(v.thumb)
      if (th) sv.thumb = th
      savedViews.push(sv)
    }
  }
  // v4의 종이 — **모양이 틀리면 그 종이만 버린다**(문서를 거부하지 않는다 — 지시 2-b).
  // 유효한 모양은 둘뿐이다: pose·view가 **둘 다** 있는 종이, 또는 둘 다 없는 작도 종이.
  // 한쪽만 있으면 그 종이는 죽은 모양이다(포즈 없는 화면·화면 없는 포즈 — 앉을 수 없다).
  const rawSheets: Sheet[] = []
  if (raw.version >= 4 && Array.isArray(raw.sheets)) {
    for (const s of raw.sheets) {
      if (!s || !isNum(s.id) || typeof s.name !== 'string' || s.name.length === 0 || s.name.length > 200) continue
      const hasPose = s.pose !== undefined || s.view !== undefined
      const entry: Sheet = { id: s.id, name: s.name }
      if (hasPose) {
        if (!isV3(s.pose?.p) || !isQuat(s.pose?.q)) continue
        if (!isNum(s.view?.s) || !isNum(s.view?.ox) || !isNum(s.view?.oy)) continue
        entry.pose = withProj({ p: { ...s.pose.p }, q: { ...s.pose.q } }, s.pose)
        entry.view = { s: s.view.s, ox: s.view.ox, oy: s.view.oy }
      }
      const th = takeThumb(s.thumb)
      if (th) entry.thumb = th
      rawSheets.push(entry)
    }
  }
  // 겹(web2-20 1부) — v5의 layers. **모양이 틀리면 거부한다**(겹은 획의 소속이다 —
  // mat.w·rawIn과 같은 규약: 모르는 값으로 조용히 틀리게 그리지 않는다).
  // ⚠ 참조 강등(없는 종이/겹)은 거부가 아니다 — 아래에서 따로 돈다.
  const layers: Layer[] = []
  if (raw.layers !== undefined && raw.layers !== null) {
    if (!Array.isArray(raw.layers)) return null
    for (const l of raw.layers) {
      if (!isNum(l?.id) || !isNum(l?.sheet)) return null
      if (l.paper !== 'tracing' && l.paper !== 'yellow') return null
      const r = l.rect
      if (!r || !isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h) || r.w <= 0 || r.h <= 0) return null
      if (typeof l.on !== 'boolean' || typeof l.locked !== 'boolean') return null
      layers.push({ id: l.id, sheet: l.sheet, paper: l.paper as Paper,
        rect: { x: r.x, y: r.y, w: r.w, h: r.h }, on: l.on, locked: l.locked })
    }
  }

  // ── 밑그림(web2-23 2-b) — **모양이 틀리면 그 밑그림만 버린다**(겹은 남는다) ────
  // 규약의 근거는 썸네일의 선례다: 밑그림은 «다시 그릴 수 있는 그림»이 아니라 잃으면
  // 끝인 사건이지만, 그것을 잃었다고 **획까지 못 열게 하는 것이 더 큰 손실**이다.
  // (거부 규약인 것들 — mat.w·rawIn·layers — 은 «있는데 모르는 값이면 조용히 틀리게
  //  그린다»가 성립하는 자리다. 밑그림은 없으면 그냥 안 그린다.)
  const underlays: Underlay[] = []
  if (Array.isArray(raw.underlays)) {
    for (const u of raw.underlays) {
      if (!u || !isNum(u.layer) || !Array.isArray(u.segs)) continue
      const segs: UnderlaySegment[] = []
      let ok = true
      for (const g of u.segs) {
        if (!isPt(g?.a) || !isPt(g?.b) || typeof g.hidden !== 'boolean') { ok = false; break }
        segs.push({ a: { x: g.a.x, y: g.a.y }, b: { x: g.b.x, y: g.b.y }, hidden: g.hidden })
      }
      if (!ok) continue
      underlays.push({ layer: u.layer, segs })
    }
  }

  // 재기(web2-32 6번) — 모양이 틀리면 **거부**하고(rawIn류), 가리키는 획이 없으면
  // 그 재기만 버린다(면의 선례 그대로 — 문서를 거부하지 않는다). t는 선분 위 매개변수라
  // 0..1 밖이면 정체가 아니다(무한 연장에 정체를 매기면 조용히 틀린 점이 된다).
  const measures: Measure[] = []
  if (raw.measures !== undefined) {
    if (!Array.isArray(raw.measures)) return null
    for (const m of raw.measures) {
      if (!isNum(m?.id) || !isMeasurePoint(m?.a) || !isMeasurePoint(m?.b)) return null
      measures.push({ id: m.id, a: { s: m.a.s, t: m.a.t }, b: { s: m.b.s, t: m.b.t } })
    }
  }

  // 놓은 사람(web2-47) — 접지점. 모양이 틀린 항은 **그 항만 버린다**(layer의 규약 —
  // 사람 하나를 잃어도 문서가 살아야 한다. 접지는 다시 짚으면 된다).
  const persons: Person[] = []
  if (Array.isArray(raw.persons)) {
    for (const q of raw.persons) {
      if (isNum(q?.id) && isV3(q?.g)) persons.push({ id: q.id, g: { x: q.g.x, y: q.g.y, z: q.g.z } })
    }
  }

  // id는 획·면·종이·겹·재기가 **한 통**이다(겹이 종이·획이 겹을 가리키므로 — 지시 1부)
  const maxId = Math.max(
    strokes.reduce((m, s) => Math.max(m, s.id), 0),
    faces.reduce((m, f) => Math.max(m, f.id), 0),
    rawSheets.reduce((m, s) => Math.max(m, s.id), 0),
    layers.reduce((m, l) => Math.max(m, l.id), 0),
    measures.reduce((m, x) => Math.max(m, x.id), 0),
    persons.reduce((m, x) => Math.max(m, x.id), 0),
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
  if (raw.version >= 4) {
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

  // ── 겹 참조 강등(web2-20 1부) — 문서를 거부하지 않는다 ─────────────────
  // Layer.sheet가 없는 종이를 가리키면 **그 겹을 버린다**(그 위의 획은 아래에서 강등).
  const sheetIds = new Set(sheets.map(s => s.id))
  const keptLayers = layers.filter(l => sheetIds.has(l.sheet))
  // Stroke.layer가 없는 겹을 가리키면 **그 필드만 버린다**(종이에 직접으로 강등)
  const layerIds = new Set(keptLayers.map(l => l.id))
  for (const s of strokes) {
    if (s.layer !== undefined && !layerIds.has(s.layer)) delete s.layer
  }
  // 밑그림이 없는 겹을 가리키면 **그 밑그림을 버린다** — 겹 없는 밑그림은 그릴 자리가
  // 없다(겹의 rect·포즈가 그리는 조건이다). 겹당 하나만 남긴다(먼저 것이 이긴다).
  const seenUnderlay = new Set<number>()
  const keptUnderlays = underlays.filter(u => {
    if (!layerIds.has(u.layer) || seenUnderlay.has(u.layer)) return false
    seenUnderlay.add(u.layer)
    return true
  })

  const doc: Doc = { frame: { W: raw.frame.W, H: raw.frame.H }, strokes, faces, sheets, layers: keptLayers, underlays: keptUnderlays, unit }
  if (scaleRef !== undefined) doc.scaleRef = scaleRef
  // 가리키는 획이 없는 재기는 그것만 버린다(면의 선례) — 빈 배열이면 열쇠를 안 만든다
  // (왕복 동일성: 없던 파일이 열쇠를 얻고 돌아오지 않는다).
  const strokeIds = new Set(strokes.map(x => x.id))
  const keptMeasures = measures.filter(m => strokeIds.has(m.a.s) && strokeIds.has(m.b.s))
  if (keptMeasures.length > 0) doc.measures = keptMeasures
  if (persons.length > 0) doc.persons = persons   // 빈 배열이면 열쇠 없음(왕복 동일성)
  // 필압 보정(web2-26 6번) — **성립하는 값만 받는다**(`validPressCal`이 저장·복원·보정
  // 절차의 술어 하나다 #54). 깨진 값은 조용히 버린다: 그림은 그대로 열리고 옵션만 꺼진다
  // (문서를 거부하지 않는다 — scaleRef·면의 선례 그대로).
  if (raw.press && typeof raw.press === 'object') {
    const r = raw.press as Record<string, unknown>
    if (r.on === true && isNum(r.p0) && isNum(r.p1) && isNum(r.gamma)) {
      const cal = { on: true, p0: r.p0, p1: r.p1, gamma: r.gamma }
      if (validPressCal(cal)) doc.press = cal
    }
  }
  return { doc, nextId, drawView }
}

// ── web2-43 1번 · **깨진 파일 읽기** ──────────────────────────────────────────
//
// 지시문: 「저장물이 잘렸거나 필드가 빠졌을 때 **조용히 빈 문서를 열지 마라.** 읽을 수
// 있는 데까지 읽고, 무엇을 못 읽었는지 알린다. **전부 버리는 것과 조용히 일부만 여는 것
// 둘 다 금지**다.」
//
// ⚠⚠ **`parseBrnl`은 안 건드린다.** 그 함수의 «거부» 규약은 앞 회차들이 자리마다 근거를
// 적어 세운 것이고(`mat.w`·`rawIn`·`layers`: 「모르는 값으로 조용히 틀리게 그리지 않는다」),
// 팔 열다섯이 그 거부를 값으로 지킨다. 여기서 여는 것은 **그 다음 층**이다:
//
//     readBrnl(text) = ① 엄격 파서를 먼저 부른다 → 되면 그대로다(왕복 동일성 불변)
//                      ② 안 되면 **건져 읽는다**(salvage) — 못 읽은 것을 세어 **알린다**
//
// 이 배치의 값: «성한 파일»의 경로가 한 바이트도 안 바뀌므로 43-1의 바이트 동일성 게이트가
// 이 기능 때문에 흔들리지 않는다. 그리고 건지기는 **엄격 파서를 판정자로 재사용한다**
// (획 하나만 담은 최소 문서를 만들어 통과하는지 본다) — 규칙을 두 벌 적지 않는다(#54).

/** 무엇을 못 읽었는가 — 화면에 그대로 나가는 값이다(조용히 잃지 않는다). */
export interface BrnlReport {
  /** 문서가 열리는가 */
  ok: boolean
  /** 못 열었으면 까닭 — `json`(아무것도 못 건졌다) · `shape`(형식·판이 아니다) */
  reason?: 'json' | 'shape'
  /** 엄격 파서가 실패해 **건져 읽었다** */
  salvaged: boolean
  /** JSON 자체가 안 풀렸다(잘린 저장물) */
  truncated: boolean
  /** 버린 획 수 */
  droppedStrokes: number
  /** 통째로 버린 항목의 이름들(예: `measures` · `layers`) */
  droppedKeys: string[]
  /** 살린 획 수 */
  keptStrokes: number
  /** web2-50 — uv 없는 옛 칠 획을 획째 버린 수(구조 전환 · 사용자 확정 「잃어도 상관없다」) */
  droppedPaint: number
}

const cleanReport = (n: number, droppedPaint: number): BrnlReport =>
  ({ ok: true, salvaged: false, truncated: false, droppedStrokes: 0, droppedKeys: [], keptStrokes: n, droppedPaint })

/** 값 하나의 끝 — `i`가 값의 첫 글자일 때 그 값 **다음** 자리를 낸다. 잘렸으면 −1.
 *  문자열 안의 괄호·역슬래시를 센다(잘린 파일에는 닫히지 않은 문자열이 있다). */
function endOfValue(t: string, i: number): number {
  const open = t[i]
  if (open !== '{' && open !== '[') return -1
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  for (let k = i; k < t.length; k++) {
    const c = t[k]!
    if (inStr) {
      if (c === '\\') { k++; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) return k + 1 }
  }
  return -1
}

/** **잘린 저장물에서 건진다** — 완결된 것만 취한다(반쯤 쓰인 획은 안 읽는다).
 *  머리(format·version·frame)와 `strokes` 배열의 **온전한 원소들**이 건지는 대상이다. */
function salvageTruncated(text: string): any | null {
  const fmt = /"format"\s*:\s*"brnl"/.exec(text)
  const ver = /"version"\s*:\s*(\d+)/.exec(text)
  if (!fmt || !ver) return null
  const out: any = { format: 'brnl', version: Number(ver[1]) }
  const frameAt = text.indexOf('"frame":')
  if (frameAt < 0) return null
  const fs = text.indexOf('{', frameAt)
  const fe = fs < 0 ? -1 : endOfValue(text, fs)
  if (fe < 0) return null
  try { out.frame = JSON.parse(text.slice(fs, fe)) } catch { return null }
  out.strokes = []
  const sAt = text.indexOf('"strokes":')
  if (sAt >= 0) {
    let k = text.indexOf('[', sAt) + 1
    while (k > 0 && k < text.length) {
      while (k < text.length && (text[k] === ',' || text[k] === ' ' || text[k] === '\n' || text[k] === '\r' || text[k] === '\t')) k++
      if (text[k] !== '{') break
      const e = endOfValue(text, k)
      if (e < 0) break                       // 여기서 잘렸다 — 이 원소는 안 읽는다
      try { out.strokes.push(JSON.parse(text.slice(k, e))) } catch { break }
      k = e
    }
  }
  return out
}

/** 이 획 하나가 엄격 파서를 통과하는가 — **판정자를 재사용한다**(규칙을 두 벌 안 적는다). */
function strokeOk(frame: unknown, s: unknown): boolean {
  return parseBrnl(JSON.stringify({ format: 'brnl', version: 6, frame, strokes: [s] })) !== null
}

/** 통째로 버릴 수 있는 항목 — **값이 낮은 것부터**. 획과 화지는 여기 없다(그것이 문서다). */
const OPTIONAL_KEYS = ['measures', 'underlays', 'layers', 'faces', 'sheets', 'press',
  'scaleRef', 'unit', 'drawView', 'savedViews', 'nextId', 'rawIn'] as const

/** **문서를 여는 유일한 통로**(앱의 두 자리 — 파일 열기·자동 저장 복원 — 이 이것을 부른다).
 *  성한 파일이면 `parseBrnl` 그대로이고, 아니면 건져 읽고 **무엇을 못 읽었는지** 낸다. */
export function readBrnl(text: string): { data: BrnlData | null; report: BrnlReport } {
  const pinfo: ParseInfo = { droppedPaint: 0 }
  const strict = parseBrnl(text, pinfo)
  if (strict) return { data: strict, report: cleanReport(strict.doc.strokes.length, pinfo.droppedPaint) }

  const rep: BrnlReport = { ok: false, salvaged: true, truncated: false, droppedStrokes: 0, droppedKeys: [], keptStrokes: 0, droppedPaint: 0 }
  let raw: any = null
  try { raw = JSON.parse(text) } catch { rep.truncated = true }
  if (rep.truncated) raw = salvageTruncated(text)
  if (!raw || raw.format !== 'brnl' || !Array.isArray(raw.strokes)) {
    rep.reason = rep.truncated ? 'json' : 'shape'
    return { data: null, report: rep }
  }
  // 판이 미래면 못 읽는다 — 흉내내지 않는다(web2-19 2-c ③ 그대로)
  if (![1, 2, 3, 4, 5, 6].includes(raw.version)) { rep.reason = 'shape'; return { data: null, report: rep } }

  // ① 획을 하나씩 판정한다 — 못 읽는 획만 버린다(문서를 안 버린다)
  const kept = raw.strokes.filter((s: unknown) => strokeOk(raw.frame, s))
  rep.droppedStrokes = raw.strokes.length - kept.length
  const body: any = { ...raw, strokes: kept }

  // ② 그래도 안 열리면 **값이 낮은 항목부터** 하나씩 버리며 다시 시도한다
  const salvInfo: ParseInfo = { droppedPaint: 0 }
  const tryParse = () => { salvInfo.droppedPaint = 0; return parseBrnl(JSON.stringify(body), salvInfo) }
  let data = tryParse()
  for (const key of OPTIONAL_KEYS) {
    if (data) break
    if (body[key] === undefined) continue
    delete body[key]
    rep.droppedKeys.push(key)
    data = tryParse()
  }
  if (!data) { rep.reason = 'shape'; return { data: null, report: rep } }
  rep.ok = true
  rep.keptStrokes = data.doc.strokes.length
  rep.droppedPaint = salvInfo.droppedPaint
  return { data, report: rep }
}

/** 화면에 나갈 한 줄 — **무엇을 못 읽었는지 말한다**(R4: 짧은 서술).
 *  성한 파일이면 `null`이다(알림은 오류만 — web2-10 4-b). */
export function reportNotice(r: BrnlReport): string | null {
  // web2-50 — 옛 칠을 버렸으면 성한 파일이어도 말한다(「버린다는 사실이 조용하면 안 된다」).
  const paintMsg = r.droppedPaint > 0
    ? `옛 칠 ${r.droppedPaint}획을 버렸다 — 칠 구조가 바뀌었다(선·면은 그대로다)` : null
  if (r.ok && !r.salvaged) return paintMsg
  if (!r.ok) return r.truncated ? '파일이 잘렸다 — 건질 획이 없다' : '.brnl 파일이 아니거나 손상됐다'
  const lost: string[] = []
  if (r.droppedStrokes > 0) lost.push(`획 ${r.droppedStrokes}`)
  if (r.droppedKeys.length > 0) lost.push(r.droppedKeys.join('·'))
  const head = r.truncated ? '파일이 잘렸다' : '파일이 손상됐다'
  const base = lost.length > 0
    ? `${head} — 획 ${r.keptStrokes}개까지 읽었다. 못 읽은 것: ${lost.join(' · ')}`
    : `${head} — 획 ${r.keptStrokes}개까지 읽었다`
  return paintMsg ? `${base} · ${paintMsg}` : base
}
