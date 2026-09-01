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
import { repBasis } from './matrep'
import type { ResolvedFace } from './face'
import { hatch2d } from './hatch'
import { facePlane } from './paint'
import { rayThrough, type Analysis } from './camera'
import { hatchSpecOf, hatchHexOf } from './palette'
import { MAT } from './material'
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
  an: Analysis, pose: CamPose, rf: ResolvedFace, pts: Pt[],
): number[] | null {
  const pl = facePlane(rf)
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

/** 이 획이 이 (면, 쪽)의 텍스처에 드는가 — 쪽 없는 옛 형식은 파서가 이미 버렸다. */
const inTex = (s: Stroke, faceId: number, side: 1 | -1): boolean =>
  s.paint !== undefined && s.paint.f === faceId && s.paint.s === side &&
  s.paint.uv !== undefined && s.paint.uv.length >= 4

/** 칠 한 획을 텍스처 캔버스에 긋는다 — 도구별 합성(질은 51의 몫 — 여기는 «옮기기»만):
 *  붓(흑연)  MAT 경도 색·알파 그대로(#54 — 종전 drawPaintGraphite의 색과 같은 출처)
 *  마커      hex · canvas 'multiply' — **겹치면 진해진다**(46의 계약 — 기제만 바뀌었다)
 *  색연필    hex · source-over 부분 알파(완전히 덮이지 않는다) */
function drawStrokeTex(
  g: CanvasRenderingContext2D, s: Stroke, box: UvBox, dims: { h: number; pxPerUnit: number },
) {
  const p = s.paint!
  const uv = p.uv!
  const toPx = (u: number, v: number): Pt =>
    pt((u - box.u0) * dims.pxPerUnit, dims.h - (v - box.v0) * dims.pxPerUnit)
  g.save()
  const grade = s.mat?.grade ?? 'HB'
  if (p.i === 1 && p.c) {          // 마커
    g.globalCompositeOperation = 'multiply'
    g.globalAlpha = C.PAINT_MARKER_ALPHA
    g.strokeStyle = p.c
  } else if (p.i === 2 && p.c) {   // 색연필
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = C.PAINT_CP_ALPHA
    g.strokeStyle = p.c
  } else {                          // 붓(흑연) — 경도의 색·알파
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = MAT[grade].alpha
    g.strokeStyle = MAT[grade].color
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(0.5, (p.w ?? C.PAINT_W_FALLBACK_UNITS) * dims.pxPerUnit)
  g.beginPath()
  const p0 = toPx(uv[0]!, uv[1]!)
  g.moveTo(p0.x, p0.y)
  for (let i = 2; i + 1 < uv.length; i += 2) {
    const q = toPx(uv[i]!, uv[i + 1]!)
    g.lineTo(q.x, q.y)
  }
  g.stroke()
  g.restore()
}

/** **굽는다** — 흰 바탕 + (이 면·이 쪽의) 획 전부, 획 id 차례(그린 차례 = 쌓인 차례).
 *  면 고정 해칭(hatchMode 'face' · web2-45의 둘째 판)은 획보다 **아래**에 깐다
 *  (52-4의 차례 «톤·무늬가 아래, 손으로 그은 것이 위»를 지금부터 지킨다).
 *  결정론: 같은 입력 → 같은 픽셀(캔버스 2D 벡터 연산뿐 — 시드 없음). */
export function bakeFaceTex(
  canvas: HTMLCanvasElement, rf: ResolvedFace, box: UvBox, level: number,
  strokes: Stroke[], side: 1 | -1,
  hatchFace: { face: Face; spacingWorld: number } | null,
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
  if (hatchFace) drawHatchTex(g, rf, box, dims, hatchFace.face, hatchFace.spacingWorld)
  for (const s of strokes) {
    if (inTex(s, rf.id, side)) drawStrokeTex(g, s, box, dims)
  }
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
