// 면 텍스처(web2-50) — **칠의 파생 표시층**. 정본은 획 목록이다(`Stroke.paint.uv` —
// 면 평면 좌표 · 세계 단위)이고 텍스처는 거기서 **굽는다**(원칙 b — 저장하지 않는다).
//
// 왜 이 구조인가(지시 「왜」): 종전 칠은 2D 스탬프(#brushc — 화면 겹)를 3D 면 위에
// 얹으려 했고 합성이 그 사이에서 무너졌다 — 증상 여섯(흰 뜸·블렌드 불가·회전 중 소실·
// 원근 미적용·개구부 깨짐·양면)이 전부 한 뿌리다. 면 하나가 자기 텍스처(앞·뒤 둘)를
// 갖고 칠이 그 텍스처에 그려지면, 합성은 2D 캔버스 «안»의 일이 되고 원근·깊이·회전은
// 3D 사영이 공짜로 맞춘다(3D 페인팅 도구들의 그 구조다 — A-3 선례).
//
// 좌표 규약(#54 — 출처 한 자리):
//   기저      `repBasis(rf)` 그대로(web2-49의 무늬 기저 — u = 평면 안 수평 · v = 위).
//   uv        기저 원점(rf.outer[0]) 기준 **세계 단위**. mm가 아니다 — 축척이 미정이어도
//             칠할 수 있어야 한다(무늬는 실치수라 mm·축척 대기, 칠은 잉크라 즉시).
//   굵기 w    **세계 단위**다. 선폭은 화면 고정(원칙 e)이지만 **칠은 면 위 안료**라
//             원근을 받는다 — 가까운 쪽이 굵고 먼 쪽이 가늘다(증상 ④의 답). 그 «다름»의
//             결정이 이 줄이다. 환산은 그은 순간 «화면 px ÷ 그 자리의 px/세계단위».
//
// 합성 규약: 텍스처는 **흰 바탕(불투명)** 위에 안료를 얹고, 면에는 **곱하기**로 입는다
// (render3d — MultiplyBlending). 흰 텍셀이 항등이라 ① 부드러운 가장자리는 흰쪽으로
// 옅어질 뿐 밝힐 수 없고(증상 ①) ② 아래 선·면이 언제나 비친다(증상 ② — 48-1의
// «흰 장막»이 구조로 소멸한다. DEFERRED «칠은 제 겹을 가져야 한다» 행이 이 형태로 닫혔다).

import type { Stroke, Face, CamPose } from './types'
import { drawMark, drawMarksSeam, appendMarkSeam, draftFeedSeam, draftFinishSeam, draftCancelSeam, draftSeamSupported, instrOfTag, type SeamMark, type MarkBox } from './paintseam'
import { repBasis, repSegments, repVisibleFamilies, isRepId, type MatRepId } from './matrep'
import type { ResolvedFace } from './face'
import { hatch2d } from './hatch'
import { facePlane } from './paint'
import { rayThrough, type Analysis } from './camera'
import { hatchSpecOf, hatchHexOf, materialOf, type MatId } from './palette'
import { MAT, rng32 } from './material'
import { C } from './constants'
import { type Pt, type V3, pt, add3, mul3, dot3 } from './vec'

/** 면의 uv 상자 — 기저와 외곽의 (u,v) 폭. 전부 **세계 단위**다. */
export interface UvBox {
  basis: ReturnType<typeof repBasis>
  u0: number; v0: number; u1: number; v1: number
}

export function uvBoxOf(rf: ResolvedFace): UvBox {
  const basis = repBasis(rf)
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
  for (const P of rf.outer) {
    const q = uvOf(basis, P)
    if (q.x < u0) u0 = q.x
    if (q.y < v0) v0 = q.y
    if (q.x > u1) u1 = q.x
    if (q.y > v1) v1 = q.y
  }
  return { basis, u0, v0, u1, v1 }
}

/** 3D → (u,v) 세계 단위(기저 원점 기준) */
export function uvOf(b: UvBox['basis'], P: V3): Pt {
  const dx = P.x - b.origin.x, dy = P.y - b.origin.y, dz = P.z - b.origin.z
  return pt(dx * b.u.x + dy * b.u.y + dz * b.u.z, dx * b.v.x + dy * b.v.y + dz * b.v.z)
}

/** (u,v) → 3D */
export const uvTo3 = (b: UvBox['basis'], u: number, v: number): V3 =>
  add3(add3(b.origin, mul3(b.u, u)), mul3(b.v, v))

/** **그은 순간의 화면 점렬 → uv**(정본을 만드는 자리 — commitPaint가 부른다).
 *  광선을 그 면의 평면에 떨어뜨리고(45 liftPaint의 그 식) 기저로 사영한다.
 *  평면과 평행하거나 뒤로 가는 점은 건너뛴다 — 두 점 미만이면 null(그 조각은 못 선다). */
export function uvFromScreen(
  an: Analysis, pose: CamPose, rf: ResolvedFace, pts: Pt[], shift = 0,
): number[] | null {
  // web2-55: shift = 광선을 떨어뜨릴 평면의 법선 방향 오프셋(세계 단위) — 두께가 있으면
  // 붓이 닿는 것은 중심면이 아니라 **앞/뒤 표면**이다(커서 밑에 칠이 앉으려면 그 평면).
  // uv 기저는 중심면 것 그대로라 저장 값의 뜻은 안 바뀐다(t는 렌더 오프셋일 뿐).
  const pl0 = facePlane(rf)
  const pl = shift === 0 ? pl0 : { n: pl0.n, d: pl0.d + shift }
  const basis = repBasis(rf)
  const out: number[] = []
  for (const p of pts) {
    const ray = rayThrough(an, pose, p)
    if (!ray) continue
    const den = dot3(pl.n, ray.d)
    if (Math.abs(den) < 1e-9) continue
    const t = (pl.d - dot3(pl.n, ray.o)) / den
    if (t <= 1e-9) continue
    const q = uvOf(basis, add3(ray.o, mul3(ray.d, t)))
    out.push(q.x, q.y)
  }
  return out.length >= 4 ? out : null
}

/** **uv → 3D 점렬**(파생 — paintGeo·지우개 판정이 읽는다. 45의 liftPaint 자리를 잇는다). */
export function paintGeoOf(rf: ResolvedFace, s: Stroke): V3[] | null {
  const uv = s.paint?.uv
  if (!uv || uv.length < 4) return null
  const basis = repBasis(rf)
  const out: V3[] = []
  for (let i = 0; i + 1 < uv.length; i += 2) out.push(uvTo3(basis, uv[i]!, uv[i + 1]!))
  return out
}

/** 해상도 단계 — 화면에서 차지하는 크기(px)를 2^n으로 **올림 양자화**하고 상한·하한에
 *  가둔다(⚑ — 값의 근거는 원장 `paint50_web2.json`의 `tex_budget`). 양자화가 재굽기
 *  문턱을 겸한다: 단계가 같으면 줌이 움직여도 안 굽는다(널뛰기 방지). */
export function texLevel(screenPx: number): number {
  const want = Math.max(C.FACETEX_MIN_PX, Math.min(C.FACETEX_MAX_PX, screenPx))
  let lv = C.FACETEX_MIN_PX
  while (lv < want) lv *= 2
  return Math.min(lv, C.FACETEX_MAX_PX)
}

/** 텍스처 픽셀 규격 — 긴 변이 level, 비율은 uv 상자 그대로(등방 배율 하나 — 왜곡 없음). */
export function texDims(box: UvBox, level: number): { w: number; h: number; pxPerUnit: number } {
  const su = Math.max(1e-9, box.u1 - box.u0), sv = Math.max(1e-9, box.v1 - box.v0)
  const k = level / Math.max(su, sv)
  return { w: Math.max(2, Math.ceil(su * k)), h: Math.max(2, Math.ceil(sv * k)), pxPerUnit: k }
}

/** 이 획이 이 (면, 쪽)의 텍스처에 드는가 — 쪽 없는 옛 형식은 파서가 이미 버렸다.
 *  web2-55: side 'e' = 테두리 슬롯(획의 e=1 · 쪽 없음)이다. */
const inTex = (s: Stroke, faceId: number, side: 1 | -1 | 'e'): boolean =>
  s.paint !== undefined && s.paint.f === faceId &&
  (side === 'e' ? s.paint.e === 1 : s.paint.s === side && s.paint.e === undefined) &&
  s.paint.uv !== undefined && s.paint.uv.length >= 4

// ── 엔진은 이음매 뒤로 갔다(web2-61) ─────────────────────────────────────────────
// 손으로 짠 도장 루프(51~60 — band·stamps·bristles 세 모드, 스트로크 버퍼, 결 격자,
// 색연필 구멍, 속도·방향 축)는 **지웠다**(61 지시 «고치지 말고 버린다» — 이력은 git
// aeb8419~fb1fb96 · 수리 전 자국 값은 grain61_pre_* 원장이 동결분이다). 지금 이 파일은
// 「어디에 무엇을 굽는가」(uv·해상도·차례·합성)만 알고, 「자국이 어떻게 생기는가」는
// core/paintseam의 drawMark(등록된 엔진 — 61 p5.brush · 62 mypaint)가 안다.
// 반증 스위치(markerFlat·paintOpaque·pressFlat·grainOff)는 엔진 중립이라 paintseam으로
// 이사했다 — import 자리가 바뀌었을 뿐 뜻은 그대로다(D-3 · #30).

/** 획 하나 → 이음매 자국(SeamMark) — uv를 텍스처 px로 펴고 색·굵기·시드를 싣는다.
 *  결 칸의 굵기 사다리(59)는 걷혔다 — 새 종이 결은 대상 px 고정이라 굵기와 무관하다
 *  (게이트 ④의 답 · 엔진(p5paint)의 결 절이 정본). */
// web2-64 반증 스위치(D-3 · 게이트 ①) — 굽기가 획의 브러시 id를 «무시»하면 렌더러가 슬롯의 지금 브러시를 읽는다 = 옛 결함.
let brushIdOff = false
export function setBrushIdOffForTest(v: boolean): void { brushIdOff = v }
export const brushIdOffForTest = (): boolean => brushIdOff

function markOfStroke(s: Stroke, box: UvBox, dims: { h: number; pxPerUnit: number }): SeamMark {
  const p = s.paint!
  const uv = p.uv!
  const toPx = (u: number, v: number): Pt =>
    pt((u - box.u0) * dims.pxPerUnit, dims.h - (v - box.v0) * dims.pxPerUnit)
  const pts: Pt[] = []
  for (let i = 0; i + 1 < uv.length; i += 2) pts.push(toPx(uv[i]!, uv[i + 1]!))
  const wWorld = p.w ?? C.PAINT_W_FALLBACK_UNITS
  const grade = s.mat?.grade ?? 'HB'
  const tool = instrOfTag(p.i)
  // 색 — 획의 hex(#54 그대로). web2-64: 잉크펜도 색을 든다 — 없는 옛 획만 등급 흑연색(옛 규약 그대로).
  const color = p.c ?? MAT[grade].color
  return {
    pts, press: p.press, color,
    wPx: Math.max(0.5, wWorld * dims.pxPerUnit),
    seed: s.id, tool, grade,
    // web2-64 64-1 — 획이 든 브러시 id가 굽기를 정한다(슬롯의 «지금» 브러시가 아니다 — 원칙 a). 반증 스위치는 옛 결함.
    preset: brushIdOff ? undefined : p.br,
    opacityK: p.o,
  }
}

/** **미리보기 획을 덧그린다**(web2-59 59-1) — 굽힌 텍스처(확정 획 전부) 위에 그리는 중의
 *  획을 **같은 함수(markOfStroke → drawMark)·같은 해상도**로 얹는다. 굽기와 갈릴 길이
 *  없다: 다른 것은 «어느 캔버스 위에»뿐이고 그것은 render3d가 base 사본으로 되돌린다. */
export function drawDraftOnTex(
  canvas: HTMLCanvasElement, rf: ResolvedFace, box: UvBox, level: number,
  strokes: Stroke[], side: 1 | -1 | 'e',
): number {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) return 0
  const g = canvas.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  let n = 0
  for (const s of strokes) {
    if (!inTex(s, rf.id, side)) continue
    drawMark(g, markOfStroke(s, box, dims))
    n++
  }
  return n
}

/** **굽는다** — 흰 바탕 + (이 면·이 쪽의) 획 전부, 획 id 차례(그린 차례 = 쌓인 차례).
 *  면 고정 해칭(hatchMode 'face' · web2-45의 둘째 판)은 획보다 **아래**에 깐다
 *  (52-4의 차례 «톤·무늬가 아래, 손으로 그은 것이 위»를 지금부터 지킨다).
 *  결정론: 같은 입력 → 같은 픽셀(캔버스 2D 벡터 연산뿐 — 시드 없음). */
/** web2-52 — 굽기 입력의 재료 몫: 어느 재료를, 어느 시드로, 어느 밀도(px/mm)에서. */
export interface RepBake { m: MatRepId; seed: number; mm: number; pxPerMm: number | null; texelPerPx: number }

export function bakeFaceTex(
  canvas: HTMLCanvasElement, rf: ResolvedFace, box: UvBox, level: number,
  strokes: Stroke[], side: 1 | -1 | 'e',
  hatchFace: { face: Face; spacingWorld: number } | null,
  rep: RepBake | null = null,
  /** web2-65 — 획 «없는» 바탕(흰 + 재료 + 해칭)의 사본을 받을 캔버스. 누적 얹기가 더티
   *  사각을 여기서 되깐다(그래야 얹기의 합성이 굽기와 «같은 식»이 된다 — appendMarkOnTex).
   *  안 주면 종전과 한 글자도 안 다르다. */
  bgOut: HTMLCanvasElement | null = null,
): void {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) {
    canvas.width = dims.w; canvas.height = dims.h
  }
  const g = canvas.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.fillStyle = '#ffffff'                      // 곱의 항등 — 안 칠한 자리는 아래를 안 바꾼다
  g.fillRect(0, 0, dims.w, dims.h)
  // 차례는 제도 그대로(52-4): 톤·무늬가 바닥 → 도면 위 면 고정 해칭 → 손으로 그은 칠
  if (rep) drawRepTex(g, rf, box, dims, rep)
  if (hatchFace) drawHatchTex(g, rf, box, dims, hatchFace.face, hatchFace.spacingWorld)
  // web2-65 — 바탕의 사본을 여기서 뜬다(획 «전»). 획이 얹히기 전의 이 상태가 누적의 기준이다.
  if (bgOut) {
    if (bgOut.width !== dims.w || bgOut.height !== dims.h) { bgOut.width = dims.w; bgOut.height = dims.h }
    const bg = bgOut.getContext('2d')!
    bg.setTransform(1, 0, 0, 1, 0, 0)
    bg.globalCompositeOperation = 'copy'
    bg.globalAlpha = 1
    bg.drawImage(canvas, 0, 0)
  }
  // 획은 묶음 통로(drawMarksSeam)로 — 엔진이 같은 합성 모드의 연속 획을 한 패스에 굽는다
  // (차례는 목록 차례 그대로 = 그린 차례. 비용 실측은 bake61 원장).
  drawMarksSeam(g, strokes.filter(s => inTex(s, rf.id, side)).map(s => markOfStroke(s, box, dims)))
}

/** **획 하나를 얹는다**(web2-65 ③ — 굽기의 누적 판). 굽힌 텍스처 위에 «새 획 하나»만 더
 *  그리고 그 자국의 사각만 다시 합성한다. 전량 재굽기와 **픽셀로 같다**(사유는 이음매의
 *  appendMark 주석 — 층 상태가 같고 자국 생성이 획마다 독립이다).
 *  못 얹으면 **null**(층이 없다·크기가 안 맞는다·이 (면,쪽)의 획이 아니다) — 부르는 쪽은
 *  전량 재굽기로 떨어진다. 굽기와 **같은 함수**(markOfStroke)를 쓴다: 두 길이 갈릴 자리가 없다(#54). */
export function appendMarkOnTex(
  canvas: HTMLCanvasElement, bg: HTMLCanvasElement, rf: ResolvedFace, box: UvBox,
  level: number, s: Stroke, side: 1 | -1 | 'e',
): MarkBox | null {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) return null
  if (bg.width !== dims.w || bg.height !== dims.h) return null
  if (!inTex(s, rf.id, side)) return null
  return appendMarkSeam(canvas.getContext('2d')!, markOfStroke(s, box, dims), bg)
}

// ── web2-66 §1 ㉠㉡ — 초안 세션의 배선(자국 변환은 굽기와 **같은 함수** markOfStroke — #54) ──

/** 그리는 중인 획을 세션에 먹인다(새 점만 · 닿은 사각만 합성). 'rebuild'/null의 뜻은 이음매. */
export function draftFeedOnTex(
  canvas: HTMLCanvasElement, bg: HTMLCanvasElement, rf: ResolvedFace, box: UvBox,
  level: number, s: Stroke, side: 1 | -1 | 'e',
): MarkBox | 'rebuild' | null {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) return null
  if (bg.width !== dims.w || bg.height !== dims.h) return null
  if (!inTex(s, rf.id, side)) return null
  return draftFeedSeam(canvas.getContext('2d')!, markOfStroke(s, box, dims), bg)
}

/** 세션의 획을 완결한다(펜 떼기까지) — 층이 이 획을 굽기로 얹은 것과 같아진다(커밋 인계). */
export function draftFinishOnTex(
  canvas: HTMLCanvasElement, bg: HTMLCanvasElement, rf: ResolvedFace, box: UvBox,
  level: number, s: Stroke, side: 1 | -1 | 'e',
): MarkBox | null {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) return null
  if (bg.width !== dims.w || bg.height !== dims.h) return null
  if (!inTex(s, rf.id, side)) return null
  return draftFinishSeam(canvas.getContext('2d')!, markOfStroke(s, box, dims), bg)
}

/** 세션을 버린다 — 층의 미완 도장은 rebuildStrokesOnTex/재굽기가 지운다. */
export const draftCancelOnTex = (canvas: HTMLCanvasElement): void => draftCancelSeam(canvas)
export const draftSupported = (): boolean => draftSeamSupported()

/** **획들만 다시 세운다**(초안 재구축의 바닥) — 캔버스 ← 바탕(획 없는 판) 사본, 그 위에
 *  확정 획 전부를 굽기 통로(drawMarksSeam — 층을 새로 세운다)로. bakeFaceTex에서 바탕
 *  구성(흰/재료/해칭)만 뺀 것이라 그 결과와 픽셀로 같다(같은 함수 · #54). */
export function rebuildStrokesOnTex(
  canvas: HTMLCanvasElement, bg: HTMLCanvasElement, rf: ResolvedFace, box: UvBox,
  level: number, strokes: Stroke[], side: 1 | -1 | 'e',
): boolean {
  const dims = texDims(box, level)
  if (canvas.width !== dims.w || canvas.height !== dims.h) return false
  if (bg.width !== dims.w || bg.height !== dims.h) return false
  const g = canvas.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'copy'
  g.globalAlpha = 1
  g.drawImage(bg, 0, 0)
  g.globalCompositeOperation = 'source-over'
  drawMarksSeam(g, strokes.filter(s => inTex(s, rf.id, side)).map(s => markOfStroke(s, box, dims)))
  return true
}

/** web2-52 — 재료를 텍스처에: 기본 톤(밝음)으로 바탕을 물들이고(곱 — 종이가 그 톤이 된다)
 *  무늬 선(그림자 톤)을 얹는다. **생성은 49의 `repSegments` 그대로**고 그리는 자리만
 *  바뀌었다(지시 52-1 «바뀌는 것은 어디에 그리는가 한 줄이다»). 계열 보임(밀도 하한)은
 *  49의 `repVisibleFamilies`가 같은 문(C.REP_MIN_PX)으로 판정한다 — 굵기는 텍셀 1이고
 *  텍스처 단계가 화면 크기를 따르므로 «굵기 화면 고정»의 49 규약이 근사로 산다.
 *  유리·금속(단색)은 바탕 톤만이다 — 무늬가 없다는 것이 그 재료의 정의다(52-2). */
function drawRepTex(
  g: CanvasRenderingContext2D, rf: ResolvedFace, box: UvBox,
  dims: { w: number; h: number; pxPerUnit: number }, rep: RepBake,
) {
  const mat = materialOf(rep.m as MatId)
  if (!mat) return
  g.save()
  g.globalAlpha = 1
  g.fillStyle = mat.tones[0]!                          // 밝음 — 종이 톤(곱이라 항상 어둡히기만)
  g.fillRect(0, 0, dims.w, dims.h)
  if (isRepId(rep.m) && rep.mm > 0) {
    const segs = repSegments(rf, rep.m, rep.mm, rep.seed)
    const fams = repVisibleFamilies(segs.majorStepMm, segs.minorStepMm, rep.pxPerMm ?? 0)
    const draw = (list: { a: V3; b: V3 }[]) => {
      g.beginPath()
      for (const s of list) {
        const a = uvOf(box.basis, s.a), b = uvOf(box.basis, s.b)
        g.moveTo((a.x - box.u0) * dims.pxPerUnit, dims.h - (a.y - box.v0) * dims.pxPerUnit)
        g.lineTo((b.x - box.u0) * dims.pxPerUnit, dims.h - (b.y - box.v0) * dims.pxPerUnit)
      }
      g.stroke()
    }
    g.strokeStyle = mat.tones[mat.tones.length - 1]!   // 그림자 — 줄눈·결의 선
    // 선폭 = 화면 1px 상당 텍셀(49의 «굵기 화면 고정» — 1텍셀 고정이면 축소 표집에서
    // 0.7px 대역으로 뭉개져 줄눈의 어두움이 바탕과 섞인다: rep49 ③이 실제로 걸렸다)
    g.lineWidth = Math.max(1, rep.texelPerPx)
    // 알파 1 — 0.85는 이중 감쇠였다(축소 표집이 이미 바탕과 섞는다 · dpr2에서 줄눈
    // 어두움이 검출 문턱(370) 아래로 희석돼 rep49 ③이 걸렸다 — 그 실측이 이 값의 사유)
    g.globalAlpha = 1
    if (fams.major) draw(segs.major)
    if (fams.minor) draw(segs.minor)
  }
  g.restore()
}

/** 면 고정 해칭을 텍스처에 — 생성(각도·간격·짝수-홀수 절단)은 45의 `hatch2d` 그대로다
 *  (#54 — 생성 코드는 안 바뀌고 그리는 자리만 바뀐다 · 지시 「면 고정 판만 텍스처로」). */
function drawHatchTex(
  g: CanvasRenderingContext2D, rf: ResolvedFace, box: UvBox,
  dims: { h: number; pxPerUnit: number }, face: Face, spacingWorld: number,
) {
  const loops: Pt[][] = [rf.outer.map(P => uvOf(box.basis, P))]
  for (const h of rf.holes) loops.push(h.map(P => uvOf(box.basis, P)))
  const spec = hatchSpecOf(face)
  const segs = hatch2d(loops, spacingWorld, spec.angleDeg)
  if (spec.cross) segs.push(...hatch2d(loops, spacingWorld, spec.angleDeg + 90))
  g.save()
  g.globalAlpha = C.HATCH_ALPHA
  g.strokeStyle = hatchHexOf(face)
  g.lineWidth = 1
  g.beginPath()
  for (const s of segs) {
    g.moveTo((s.a.x - box.u0) * dims.pxPerUnit, dims.h - (s.a.y - box.v0) * dims.pxPerUnit)
    g.lineTo((s.b.x - box.u0) * dims.pxPerUnit, dims.h - (s.b.y - box.v0) * dims.pxPerUnit)
  }
  g.stroke()
  g.restore()
}
