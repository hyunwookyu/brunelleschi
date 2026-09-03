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
import { brushDef, instrOfTag, evalCurve, type BrushDef } from './brush58'
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

/** 칠 한 획을 텍스처 캔버스에 긋는다 — 도구별 합성(질은 51의 몫 — 여기는 «옮기기»만):
 *  붓(흑연)  MAT 경도 색·알파 그대로(#54 — 종전 drawPaintGraphite의 색과 같은 출처)
 *  마커      hex · canvas 'multiply' — **겹치면 진해진다**(46의 계약 — 기제만 바뀌었다)
 *  색연필    hex · source-over 부분 알파(완전히 덮이지 않는다) */
/** **반증 손잡이**(D-3 · mats46 ② — 겹침 계단의 도달 가능성): 마커를 «평면 덮어쓰기»
 *  (source-over · 알파 1)로 굽는다 — 겹쳐도 같은 색이라 계단이 죽는다. 출하(multiply ·
 *  PAINT_MARKER_ALPHA)가 «겹치면 진해진다»를 만드는 그 조합임을 같은 실행에서 증명한다.
 *  ⚠ 알파만 1.0으로 두는 판은 반증이 못 된다 — multiply는 알파 1에서도 곱으로 계속
 *  어두워진다(실측: 상대 계단 0.44 — 절반 문을 안 넘었다). 제품 경로는 안 부른다. */
let markerFlatOverride = false
export function setMarkerFlatForTest(v: boolean): void { markerFlatOverride = v }
/** 52 1차 [1] — «획 아래로 무늬가 비친다»의 반증 스위치: 마커를 알파 1(불투명)로 굽는다.
 *  비침의 기제가 층간 합성이 아니라 **획 알파 < 1**(층이 같은 캔버스 안이어도)임을 가른다 —
 *  켜면 획이 무늬를 덮어 띠 안 대비가 죽어야 한다. 제품 경로는 안 부른다. */
let paintOpaqueOverride = false
export function setPaintOpaqueForTest(v: boolean): void { paintOpaqueOverride = v }
export const paintOpaqueForTest = (): boolean => paintOpaqueOverride

// ── 자국의 질(web2-51) — 압력 프로필·결 해시(팔과 제품이 같은 함수 — #54) ─────────

/** 반증 스위치 둘(D-3 · e2e 전용 — #30): 압력 평탄화(프로필이 상수 — 압력 게이트가
 *  죽어야 한다) · 결 끔(grain ≡ 1 — 결 게이트가 죽어야 한다). 제품 경로는 안 부른다. */
let pressFlatOverride = false
export function setPressFlatForTest(v: boolean): void { pressFlatOverride = v }
let grainOffOverride = false
export function setGrainOffForTest(v: boolean): void { grainOffOverride = v }

// ── 스트로크 버퍼(web2-59 59-2) · 결은 획에 한 번(59-3) ──────────────────────────
// 계약: **한 획 안에서 커버리지는 그 획의 불투명도(def.alpha)를 넘지 못하고, 도장이 겹쳐도
// 안 쌓인다** — 도장은 획 전용 커버리지 지도에 **최대값**으로 모이고, 그 지도를 **한 번**
// 불투명도로 얹는다. 획과 획 «사이»는 종전대로 쌓인다(그것이 겹치면 진해지는 것의 자리다).
// GIMP CONSTANT · Photoshop Opacity(대 Flow) · google/ink SelfOverlap::kDiscard — 드로잉
// 엔진의 표준이지 발명이 아니다(A-3). ⚠ 마커(band)는 예외다 — 46의 «겹치면 진해진다»
// (multiply) 계약 그대로(59 지시 문면).
// 결(59-3): 도장마다 읽던 결(도장 중심의 칸 하나가 도장 전체를 물들였다)을 **모인 커버리지에
// 한 번 곱한다** — 마스크의 칸은 **면 고정**(텍스처 px ÷ cellPx · cellPx = 굵기(세계)×grainK×
// px/unit이라 단계가 바뀌어도 같은 칸)이다. 그래서 같은 자리를 두 번 칠하면 같은 봉우리다.
// 반증 손잡이 둘(D-3 · #30 — 제품 경로는 안 부른다):
//   strokeBufferOff  — 옛 엔진(도장마다 source-over · 결 도장마다)으로 되돌린다. 게이트 ②
//                      (교차 누적)이 되살아나야 한다.
//   grainPerStroke   — 마스크의 결 좌표에 획 시드를 섞는다(면 고정이 깨진다). 게이트 ④
//                      (두 획의 결 상관)이 죽어야 한다.
let strokeBufferOff = false
export function setStrokeBufferOffForTest(v: boolean): void { strokeBufferOff = v }
export const strokeBufferOffForTest = (): boolean => strokeBufferOff
let grainPerStrokeOverride = false
export function setGrainPerStrokeForTest(v: boolean): void { grainPerStrokeOverride = v }

/** 획 전용 버퍼 — bbox 크기의 캔버스를 **재사용**한다(미리보기가 이동마다 부르므로 할당을
 *  매번 하면 GC가 프레임을 문다). 크기별 몇 장만 든다. */
const scratchPool = new Map<string, HTMLCanvasElement>()
function scratchOf(w: number, h: number, tag: string): CanvasRenderingContext2D {
  const key = `${tag}:${w}x${h}`
  let c = scratchPool.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = w; c.height = h
    if (scratchPool.size >= 8) {
      const oldest = scratchPool.keys().next().value
      if (oldest !== undefined) scratchPool.delete(oldest)
    }
    scratchPool.set(key, c)
  }
  const sg = c.getContext('2d')!
  sg.setTransform(1, 0, 0, 1, 0, 0)
  sg.globalCompositeOperation = 'source-over'
  sg.globalAlpha = 1
  sg.clearRect(0, 0, w, h)
  return sg
}

/** 압력(0..1) → 농도 배수 — 지시 «농도의 기울기가 굵기보다 가파르다»(26-6)의 왼쪽. */
export const paintDensity = (press: number): number =>
  pressFlatOverride ? 0.7
    : Math.min(1, C.PAINT51_DENSITY_FLOOR + C.PAINT51_DENSITY_SLOPE * press)
/** 압력(0..1) → 굵기 배수 — 오른쪽(완만). */
export const paintWidthFactor = (press: number): number =>
  pressFlatOverride ? 0.925
    : C.PAINT51_WIDTH_FLOOR + C.PAINT51_WIDTH_SLOPE * press

/** **결 해시** — UV 격자 칸의 결정론 값(0..1). 시드는 격자 정수 좌표만이라(실행·획 무관)
 *  같은 면 자리는 언제나 같은 이빨이다 — «종이 결에 걸린다»의 코드판. Math.random ⛔. */
export function grain01(qu: number, qv: number): number {
  if (grainOffOverride) return 1
  let h = (qu * 374761393 + qv * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** **도장 기록**(web2-58 D-1 표식 — 수동적·행동 무변): 켜 두면 stamp()가 찍는 자리를
 *  도구 표식과 함께 쌓는다. 끝점 뭉침의 «단위 길이당 도장 수»를 제품 경로 그대로 잰다. */
let stampLog: { x: number; y: number; i: number }[] | null = null
let stampLogInstr = 0
export function setStampLogForTest(on: boolean): void { stampLog = on ? [] : null }
export function stampLogForTest(): { x: number; y: number; i: number }[] { return stampLog ?? [] }

/** 획의 점렬(px)을 등간격 도장(stamp) 자리로 편다 — {x, y, t(0..1), press(0..1)}.
 *  **거리 기반이다**(58-4 D-2가 확인 — 등호장 재표집: 손이 느려져도 표집이 몰리지 않는다). */
export function stampsOf(
  pts: Pt[], press: number[] | undefined, spacingPx: number,
): { x: number; y: number; t: number; press: number }[] {
  const segLen: number[] = []
  let L = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
    segLen.push(d); L += d
  }
  if (L < 1e-9) return []
  const prAt = (t: number): number => {
    if (!press || press.length === 0) return 0.5
    const i = Math.min(press.length - 1, Math.round(t * (press.length - 1)))
    return Math.min(1, Math.max(0, press[i]! / C.PRESS_Q))
  }
  const out: { x: number; y: number; t: number; press: number }[] = []
  const n = Math.max(2, Math.ceil(L / spacingPx))
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * L
    let acc = 0, i = 0
    while (i < segLen.length && acc + segLen[i]! < target) { acc += segLen[i]!; i++ }
    const segT = segLen[i]! > 1e-9 ? (target - acc) / segLen[i]! : 0
    const a = pts[Math.min(i, pts.length - 1)]!, b = pts[Math.min(i + 1, pts.length - 1)]!
    out.push({ x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT, t: k / n, press: prAt(k / n) })
  }
  return out
}

/** 도장 하나(원) — 알파·반지름은 부른 쪽이 정한다. 경도 < 1이면 가장자리가 방사형으로
 *  풀린다(58 실험실 축 — 기본 1은 종전 경로 그대로: 픽셀 무회귀). */
function stamp(
  g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number,
  hardness = 1, color?: string,
) {
  if (alpha <= 0 || r <= 0) return
  if (stampLog) stampLog.push({ x, y, i: stampLogInstr })
  g.globalAlpha = Math.min(1, alpha)
  if (hardness < 1 && color) {
    const grad = g.createRadialGradient(x, y, r * Math.max(0, hardness), x, y, r)
    grad.addColorStop(0, color)
    grad.addColorStop(1, color + '00')     // hex + 투명 — 캔버스 8자리 hex
    const keep = g.fillStyle
    g.fillStyle = grad
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    g.fillStyle = keep
    return
  }
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}

/** 압력 → 농도·굵기 — **정의(BrushDef)의 곡선**으로 평가한다(58-3: 브러시는 데이터).
 *  반증 스위치(pressFlat)는 종전 상수 그대로 — 스위치의 뜻(프로필이 상수)이 불변이다. */
const densityOf = (def: BrushDef, press: number): number =>
  pressFlatOverride ? 0.7 : evalCurve(def.density, press)
const widthFactorOf = (def: BrushDef, press: number): number =>
  pressFlatOverride ? 0.925 : evalCurve(def.width, press)
/** 결 통과율 — grainFloor + (1−grainFloor)·grain (연필 tooth·색연필 잔결이 같은 식이었다) */
const toothOf = (def: BrushDef, gr: number): number =>
  def.grainFloor + (1 - def.grainFloor) * gr

/** paintMark의 문맥 — 제품(굽기)과 실험실(시험 긋기)이 같은 값 꼴로 넘긴다. */
export interface MarkOpts {
  /** 자국 색(hex) — 붓(흑연)은 MAT 등급색이 들어온다 */
  color: string
  /** bristles 모드의 기저 알파(제품 = MAT[grade].alpha) */
  baseAlpha: number
  /** 결정론 시드(제품 = 획 id) — Math.random ⛔ (§5) */
  seed: number
  /** 결 격자 환산의 기준 굵기 px(= wWorld × pxPerUnit — 하한 없는 원값) */
  grainWpx: number
  /** 점별 압력(양자화 눈금 — C.PRESS_Q 나눔은 stampsOf 안) */
  press?: number[]
}

/** **한 자국을 긋는다** — 엔진의 전부다(58-3: 모드 셋 · 나머지는 def의 값).
 *  제품(drawStrokeTex — uv → px 변환 뒤)과 실험실(58-5 — 화면 px 그대로)이 **이 함수
 *  하나**를 부른다(#54: 실험실이 보여주는 것 == 제품이 굽는 것). */
export function paintMark(
  g: CanvasRenderingContext2D, pts: Pt[], wPx: number, def: BrushDef, o: MarkOpts,
): void {
  if (pts.length < 2) return
  if (def.mode !== 'band' && !strokeBufferOff) { markBuffered(g, pts, wPx, def, o); return }
  paintMarkLegacy(g, pts, wPx, def, o)
}

/** 색 → rgb(0..255) — hex(#rgb·#rrggbb)는 직접, 그 밖은 캔버스가 정규화한 값(1×1 · 캐시). */
const rgbCache = new Map<string, [number, number, number]>()
function rgbOf(color: string): [number, number, number] {
  const hit = rgbCache.get(color)
  if (hit) return hit
  let out: [number, number, number]
  const m6 = /^#([0-9a-f]{6})/i.exec(color)
  const m3 = /^#([0-9a-f]{3})$/i.exec(color)
  if (m6) out = [parseInt(m6[1]!.slice(0, 2), 16), parseInt(m6[1]!.slice(2, 4), 16), parseInt(m6[1]!.slice(4, 6), 16)]
  else if (m3) out = [parseInt(m3[1]![0]! + m3[1]![0]!, 16), parseInt(m3[1]![1]! + m3[1]![1]!, 16), parseInt(m3[1]![2]! + m3[1]![2]!, 16)]
  else {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1
    const g = c.getContext('2d')!
    g.fillStyle = color; g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    out = [d[0]!, d[1]!, d[2]!]
  }
  rgbCache.set(color, out)
  return out
}

/** **버퍼 경로**(59-2·59-3) — 도장 모드 둘(stamps·bristles)의 현행 엔진.
 *  도장 → 획 커버리지 지도(마른 매체 stamps는 **최대값 합집합** — 도장이 겹쳐도 안 쌓인다:
 *  GIMP CONSTANT · google/ink SelfOverlap::kDiscard의 그 뜻 · 젖은 매체 bristles는 빗살이
 *  쌓이되 캡이 상한) → 결 마스크 한 번(면 고정 칸 · stamps) → 색연필 구멍(stamps) →
 *  불투명도 한 번으로 얹기. 지도는 소프트웨어(Float32 · bbox 크기)다 — 캔버스 2D에는 «알파의
 *  최대값» 합성이 없고(lighten은 알파를 합집합으로 더한다) ctx.filter(luminanceToAlpha)는
 *  사파리(iPad)가 없다. 비용은 bbox 면적 × 도장 겹침 수 — paint59 ⑥이 값으로 든다.
 *  ⚠ 「흐름(flow)을 쌓고 캡만 두는 판」(Krita Wash · PS Flow<100%)은 검토 후 기각했다:
 *  저압 교차에서 교차 p95가 몸통보다 1.23배(실측 — NOTES 59 구현 절) — 사람이 보는 «꺾이는
 *  곳의 뭉침»이 절반 남는다. 도장 알파(압력 농도)가 곧 획의 «불투명도 곡선»이 되는 이 판이
 *  mypaint(opaque × pressure→opacity)와 같은 꼴이다. */
function markBuffered(
  g: CanvasRenderingContext2D, pts: Pt[], wPx: number, def: BrushDef, o: MarkOpts,
): void {
  const W = (g.canvas as HTMLCanvasElement).width, H = (g.canvas as HTMLCanvasElement).height
  if (W <= 0 || H <= 0) return
  const spacingPx = Math.max(def.minSpacingPx, wPx * def.spacingK)
  const scatRng = def.scatter > 0 ? rng32(o.seed ^ 0x5bd1) : null
  const scatOf = (): number => (scatRng ? (scatRng() - 0.5) * 2 * def.scatter * (wPx / 2) : 0)
  // ── 도장 목록(위치·반지름·알파) — 51의 표집·압력·빗살 값 그대로 ─────────────────────
  const dabs: { x: number; y: number; r: number; a: number }[] = []
  const st = stampsOf(pts, o.press, spacingPx)
  if (def.mode === 'stamps') {
    for (const q of st) dabs.push({ x: q.x, y: q.y + scatOf(), r: (wPx / 2) * widthFactorOf(def, q.press), a: densityOf(def, q.press) })
  } else {
    const rng = rng32(o.seed)
    const nodes: number[] = []
    for (let k = 0; k < C.PAINT51_BRUSH_FLOW_NODES; k++) nodes.push(0.5 + 0.5 * rng())
    const flow = (t: number): number => {
      const x = t * (nodes.length - 1)
      const i = Math.min(nodes.length - 2, Math.floor(x))
      const f = x - i
      return nodes[i]! * (1 - f) + nodes[i + 1]! * f
    }
    const bristles = Math.max(2, Math.round(def.bristles))
    const offs: { o: number; a: number; w: number }[] = []
    for (let b = 0; b < bristles; b++) {
      offs.push({ o: (b / (bristles - 1) - 0.5) * 0.8 + (rng() - 0.5) * 0.2, a: 0.5 + 0.5 * rng(), w: 0.3 + 0.35 * rng() })
    }
    for (let i = 0; i + 1 < st.length; i++) {
      const q = st[i]!, q2 = st[i + 1]!
      const dx = q2.x - q.x, dy = q2.y - q.y
      const dl = Math.hypot(dx, dy) || 1
      const nx = -dy / dl, ny = dx / dl
      const split = q.t > def.splitT
        ? ((q.t - def.splitT) / Math.max(1e-9, 1 - def.splitT)) * def.splitK
        : 0
      for (const b of offs) {
        const off = (b.o * (1 + split * 2)) * wPx + scatOf()
        dabs.push({ x: q.x + nx * off, y: q.y + ny * off,
          r: (wPx / 2) * b.w * widthFactorOf(def, q.press) * (split > 0 ? 0.7 : 1),
          a: o.baseAlpha * b.a * flow(q.t) * densityOf(def, q.press) })
      }
    }
  }
  if (dabs.length === 0) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const d of dabs) {
    if (d.r <= 0 || d.a <= 0) continue
    if (d.x - d.r < x0) x0 = d.x - d.r
    if (d.y - d.r < y0) y0 = d.y - d.r
    if (d.x + d.r > x1) x1 = d.x + d.r
    if (d.y + d.r > y1) y1 = d.y + d.r
  }
  if (!(x0 <= x1)) return
  const bx = Math.max(0, Math.floor(x0) - 1), by = Math.max(0, Math.floor(y0) - 1)
  const bw = Math.min(W, Math.ceil(x1) + 2) - bx, bh = Math.min(H, Math.ceil(y1) + 2) - by
  if (bw <= 0 || bh <= 0) return
  // ── 커버리지 지도 — 도장의 최대값(겹쳐도 안 쌓인다) · 가장자리 AA(반 px) · 경도 풀림 ──
  const cov = new Float32Array(bw * bh)
  const hard = Math.min(1, Math.max(0, def.hardness))
  const wet = def.mode === 'bristles'
  for (const d of dabs) {
    if (d.r <= 0 || d.a <= 0) continue
    if (stampLog) stampLog.push({ x: d.x, y: d.y, i: stampLogInstr })
    const cx = d.x - bx, cy = d.y - by, r = d.r
    const inner = r * hard
    const py0 = Math.max(0, Math.floor(cy - r - 1)), py1 = Math.min(bh - 1, Math.ceil(cy + r + 1))
    const px0 = Math.max(0, Math.floor(cx - r - 1)), px1 = Math.min(bw - 1, Math.ceil(cx + r + 1))
    for (let py = py0; py <= py1; py++) {
      const dy = py + 0.5 - cy
      const row = py * bw
      for (let px = px0; px <= px1; px++) {
        const dx = px + 0.5 - cx
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r + 0.5) continue
        let v = d.a
        if (dist > inner) v *= hard < 1 ? Math.max(0, (r - dist) / Math.max(1e-9, r - inner)) : Math.min(1, r + 0.5 - dist)
        // 마른 매체(stamps — 연필·색연필): 최대값 — 도장이 겹쳐도 안 쌓인다.
        // 젖은 매체(bristles — 붓): 빗살이 겹치며 쌓인다(흐름) — 캡(불투명도)이 상한이다.
        //   붓까지 최대값으로 두면 빗살 넷의 낮은 알파(51 값)가 몸통을 못 만든다(paint45 ①
        //   픽셀 451 → 69 실측 — 값 무변의 계약이 깨진다). 젖은 붓은 빗살이 겹쳐 진해지는
        //   것이 물리이기도 하다. 교차의 상한은 캡이 든다(paint59 ② cap_ratio).
        if (wet) cov[row + px] = cov[row + px]! + v - cov[row + px]! * v
        else if (v > cov[row + px]!) cov[row + px] = v
      }
    }
  }
  // ── 결 — 획의 «모인 커버리지»에 한 번(59-3). 칸은 면 고정(텍스처 px ÷ cellPx) ────────
  // 결·구멍은 stamps 모드의 축이다(51 그대로 · 실험실 RELEVANT 표와 같은 경계 — bristles에
  // 먹게 두면 «비활성 손잡이가 반응»해 mark58 ④가 잡는다: 실측 25/23).
  if (def.mode === 'stamps' && def.grainK > 0 && !grainOffOverride) {
    const cellPx = Math.max(1, o.grainWpx * def.grainK)
    const seedOff = grainPerStrokeOverride ? (o.seed * 7919) | 0 : 0
    let rowQy = NaN
    const rowTooth = new Float32Array(bw)
    for (let py = 0; py < bh; py++) {
      const qy = Math.floor((by + py) / cellPx)
      if (qy !== rowQy) {
        rowQy = qy
        let curQx = NaN, curT = 1
        for (let px = 0; px < bw; px++) {
          const qx = Math.floor((bx + px) / cellPx)
          if (qx !== curQx) { curQx = qx; curT = toothOf(def, grain01(qx + seedOff, qy)) }
          rowTooth[px] = curT
        }
      }
      const row = py * bw
      for (let px = 0; px < bw; px++) cov[row + px] = cov[row + px]! * rowTooth[px]!
    }
  }
  // ── 색연필 구멍(51 그대로 — 결 칸을 걷어낸다 · 잔량 cpSkipAlpha) ─────────────────────
  if (def.mode === 'stamps' && def.cpSkipTh > 0) {
    const cellPx = Math.max(1.5, o.grainWpx * def.grainK)
    const keep = Math.min(1, def.cpSkipAlpha / Math.max(1e-9, def.alpha))   // 구멍의 잔량(살짝 남는다)
    const hr = cellPx * 0.38
    for (let qy = Math.floor(by / cellPx); qy <= Math.floor((by + bh) / cellPx); qy++) {
      for (let qx = Math.floor(bx / cellPx); qx <= Math.floor((bx + bw) / cellPx); qx++) {
        if (grain01(qx, qy) >= def.cpSkipTh) continue
        const cx = (qx + 0.5) * cellPx - bx, cy = (qy + 0.5) * cellPx - by
        const py0 = Math.max(0, Math.floor(cy - hr - 1)), py1 = Math.min(bh - 1, Math.ceil(cy + hr + 1))
        const px0 = Math.max(0, Math.floor(cx - hr - 1)), px1 = Math.min(bw - 1, Math.ceil(cx + hr + 1))
        for (let py = py0; py <= py1; py++) {
          const dy = py + 0.5 - cy
          for (let px = px0; px <= px1; px++) {
            const dx = px + 0.5 - cx
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > hr + 0.5) continue
            const edge = Math.min(1, hr + 0.5 - dist)             // 구멍 가장자리 AA
            const f = 1 - edge * (1 - keep)
            const i = py * bw + px
            cov[i] = cov[i]! * f
          }
        }
      }
    }
  }
  // ── 지도 → 픽셀(색 + 알파) → 한 번 얹는다(불투명도가 상한이다) ──────────────────────
  const [cr, cg, cb] = rgbOf(o.color)
  const img = new ImageData(bw, bh)
  const px8 = img.data
  for (let i = 0; i < cov.length; i++) {
    const a = cov[i]!
    if (a <= 0) continue
    const k = i * 4
    px8[k] = cr; px8[k + 1] = cg; px8[k + 2] = cb; px8[k + 3] = Math.round(Math.min(1, a) * 255)
  }
  const sg = scratchOf(bw, bh, 'buf')
  sg.putImageData(img, 0, 0)
  g.save()
  g.globalCompositeOperation = def.composite
  g.globalAlpha = Math.min(1, def.alpha)
  g.drawImage(sg.canvas, 0, 0, bw, bh, bx, by, bw, bh)
  g.restore()
}

/** **옛 엔진**(51~58 · 도장마다 source-over · 결 도장마다) — 반증 손잡이(strokeBufferOff)
 *  전용으로 남긴다(A-4: 게이트를 통과시킨 뒤에도 되돌릴 수 있어야 한다). 마커(band)는
 *  이 경로가 현행이다(예외 — 머리주석). */
function paintMarkLegacy(
  g: CanvasRenderingContext2D, pts: Pt[], wPx: number, def: BrushDef, o: MarkOpts,
): void {
  const spacingPx = Math.max(def.minSpacingPx, wPx * def.spacingK)
  const scatRng = def.scatter > 0 ? rng32(o.seed ^ 0x5bd1) : null
  const scatOf = (): number => (scatRng ? (scatRng() - 0.5) * 2 * def.scatter * (wPx / 2) : 0)
  g.save()
  g.lineCap = 'round'
  g.lineJoin = 'round'

  if (def.mode === 'band') {
    // ── 띠(마커) — 연속 선(multiply · 겹치면 진해진다) + 끝 원(tipAlpha — 기본 0) ────
    g.globalCompositeOperation = (markerFlatOverride || paintOpaqueOverride) ? 'source-over' : def.composite
    g.globalAlpha = (markerFlatOverride || paintOpaqueOverride) ? 1 : def.alpha
    g.strokeStyle = o.color
    g.lineWidth = wPx
    g.beginPath()
    g.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
    g.stroke()
    if (!markerFlatOverride && def.tipAlpha > 0) {
      // 팁(51의 «끝이 몸통보다 진하다») — **58부터 기본 꺼짐**(사람 판정 「시작·끝 원형
      // 강조가 매우 거슬린다」 · mark58_pre 실측 1.374). 기제는 손잡이로 남는다(실험실).
      g.fillStyle = o.color
      const tipR = (wPx / 2) * def.tipLenK
      g.globalAlpha = def.tipAlpha
      for (const e of [pts[0]!, pts[pts.length - 1]!]) {
        g.beginPath(); g.arc(e.x, e.y, tipR, 0, Math.PI * 2); g.fill()
      }
    }
    g.restore()
    return
  }

  if (def.mode === 'stamps' && def.cpSkipTh > 0) {
    // ── 색연필 — 결이 굵고(거친 UV 격자) 색이 완전히 덮이지 않는다(빈 알갱이) ───────
    // ⚠ 도장 단위 건너뜀(초판)은 이웃 도장의 번짐이 칸을 도로 덮어 구멍이 안 남았다
    // (dpr2 실측). **긁개 캔버스**에 이 획만 그리고 결 칸을 destination-out으로 뚫은 뒤
    // 본판에 합성한다 — 남의 획은 안 지운다.
    const scratch = document.createElement('canvas')
    scratch.width = (g.canvas as HTMLCanvasElement).width
    scratch.height = (g.canvas as HTMLCanvasElement).height
    const sg = scratch.getContext('2d')!
    sg.fillStyle = o.color
    sg.globalCompositeOperation = 'source-over'
    const st = stampsOf(pts, o.press, spacingPx)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const q of st) {
      const so = scatOf()
      const gr2 = grain01(Math.floor(q.x * 7.13), Math.floor(q.y * 7.13))   // 잔결(도장별 미세 변화)
      stamp(sg, q.x, q.y + so, (wPx / 2) * widthFactorOf(def, q.press),
        def.alpha * toothOf(def, gr2) * densityOf(def, q.press), def.hardness, o.color)
      if (q.x < x0) x0 = q.x
      if (q.y < y0) y0 = q.y
      if (q.x > x1) x1 = q.x
      if (q.y > y1) y1 = q.y
    }
    // 결 칸 뚫기 — UV 격자(굵기 배수 셀 · 세계 고정)에서 grain이 문 아래인 칸을 걷어낸다
    const cellPx = Math.max(1.5, o.grainWpx * def.grainK)
    const m = wPx
    sg.globalCompositeOperation = 'destination-out'
    sg.fillStyle = '#000'
    for (let qy = Math.floor((y0 - m) / cellPx); qy <= Math.floor((y1 + m) / cellPx); qy++) {
      for (let qx = Math.floor((x0 - m) / cellPx); qx <= Math.floor((x1 + m) / cellPx); qx++) {
        const gr = grain01(qx, qy)
        if (gr >= def.cpSkipTh) continue
        sg.globalAlpha = 1 - def.cpSkipAlpha / def.alpha   // 구멍의 잔량(살짝 남는다)
        sg.beginPath()
        sg.arc((qx + 0.5) * cellPx, (qy + 0.5) * cellPx, cellPx * 0.38, 0, Math.PI * 2)
        sg.fill()
      }
    }
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.drawImage(scratch, 0, 0)
    g.restore()
    return
  }

  if (def.mode === 'stamps') {
    // ── 연필(51 신설) — 종이 결에 걸린 불연속 · 압력이 농도(가파름)·굵기(완만)를 움직인다 ──
    g.globalCompositeOperation = def.composite
    g.fillStyle = o.color
    const cellPx = Math.max(1, o.grainWpx * def.grainK)
    const st = stampsOf(pts, o.press, spacingPx)
    for (const q of st) {
      const so = scatOf()
      const gr = def.grainK > 0 ? grain01(Math.floor(q.x / cellPx), Math.floor(q.y / cellPx)) : 1
      stamp(g, q.x, q.y + so, (wPx / 2) * widthFactorOf(def, q.press),
        def.alpha * toothOf(def, gr) * densityOf(def, q.press), def.hardness, o.color)
    }
    g.restore()
    return
  }

  // ── 붓(bristles) — 획 안 농도 흐름 · 끝 갈라짐(빗살 발산) ─────────────────────────
  g.globalCompositeOperation = def.composite
  g.strokeStyle = o.color
  const rng = rng32(o.seed)                     // 결정론 — 획마다 같은 빗살·같은 흐름(§5)
  const nodes: number[] = []
  for (let k = 0; k < C.PAINT51_BRUSH_FLOW_NODES; k++) nodes.push(0.5 + 0.5 * rng())
  const flow = (t: number): number => {
    const x = t * (nodes.length - 1)
    const i = Math.min(nodes.length - 2, Math.floor(x))
    const f = x - i
    return nodes[i]! * (1 - f) + nodes[i + 1]! * f
  }
  const bristles = Math.max(2, Math.round(def.bristles))
  const st = stampsOf(pts, o.press, spacingPx)
  // 빗살의 가로 배치·개별 세기(획당 고정 — rng 순서가 결정론의 전부다)
  const offs: { o: number; a: number; w: number }[] = []
  for (let b = 0; b < bristles; b++) {
    offs.push({ o: (b / (bristles - 1) - 0.5) * 0.8 + (rng() - 0.5) * 0.2, a: 0.5 + 0.5 * rng(), w: 0.3 + 0.35 * rng() })
  }
  g.fillStyle = o.color
  for (let i = 0; i + 1 < st.length; i++) {
    const q = st[i]!, q2 = st[i + 1]!
    // 진행 방향의 수직(빗살이 벌어지는 축)
    const dx = q2.x - q.x, dy = q2.y - q.y
    const dl = Math.hypot(dx, dy) || 1
    const nx = -dy / dl, ny = dx / dl
    const split = q.t > def.splitT
      ? ((q.t - def.splitT) / Math.max(1e-9, 1 - def.splitT)) * def.splitK
      : 0
    for (const b of offs) {
      const off = (b.o * (1 + split * 2)) * wPx + scatOf()
      stamp(g, q.x + nx * off, q.y + ny * off,
        (wPx / 2) * b.w * widthFactorOf(def, q.press) * (split > 0 ? 0.7 : 1),
        o.baseAlpha * b.a * flow(q.t) * densityOf(def, q.press) * def.alpha, def.hardness, o.color)
    }
  }
  g.restore()
}

function drawStrokeTex(
  g: CanvasRenderingContext2D, s: Stroke, box: UvBox, dims: { h: number; pxPerUnit: number },
) {
  const p = s.paint!
  stampLogInstr = p.i ?? 0                        // 도장 기록의 도구 표식(0 = 붓)
  const uv = p.uv!
  const toPx = (u: number, v: number): Pt =>
    pt((u - box.u0) * dims.pxPerUnit, dims.h - (v - box.v0) * dims.pxPerUnit)
  const pts: Pt[] = []
  for (let i = 0; i + 1 < uv.length; i += 2) pts.push(toPx(uv[i]!, uv[i + 1]!))
  const wWorld = p.w ?? C.PAINT_W_FALLBACK_UNITS
  const wPx = Math.max(0.5, wWorld * dims.pxPerUnit)
  const grade = s.mat?.grade ?? 'HB'
  const def = brushDef(instrOfTag(p.i))
  // 색 — 붓(흑연)은 MAT 등급색, 색이 있는 도구(마커·색연필·연필)는 획의 hex.
  // hex가 없는 band·stamps 획은 종전처럼 흑연 규약(bristles 경로)으로 떨어진다.
  const useHex = def.mode !== 'bristles' && p.c
  const effDef = useHex ? def : brushDef('brush')
  // 결 칸의 자(59-3 · 면 고정): 획의 세계 굵기를 **2^(1/4) 사다리**로 양자화한 값이다.
  // 굵기 그대로 쓰면 같은 자리의 두 획이 원근(worldPerPxPerp — 화면 자리마다 다른 환산)
  // 으로 0.5%쯤 다른 굵기를 얻고, 그 차가 1024px 텍스처를 가로질러 결 칸 경계를 몇 px씩
  // 밀어 «같은 봉우리»가 안 된다(paint59 ④ 실측: 안쪽 행 상관 .949). 사다리 안(±9%)의
  // 굵기는 정확히 같은 격자를 본다 — 결 크기 = 굵기 배수(grainK)의 뜻은 눈금 오차로 산다.
  const wGrain = Math.pow(2, Math.round(Math.log2(Math.max(1e-9, wWorld)) * 4) / 4)
  paintMark(g, pts, wPx, effDef, {
    color: useHex ? p.c! : MAT[grade].color,
    baseAlpha: MAT[grade].alpha,
    seed: s.id,
    grainWpx: wGrain * dims.pxPerUnit,
    press: p.press,
  })
}

/** **미리보기 획을 덧그린다**(web2-59 59-1) — 굽힌 텍스처(확정 획 전부) 위에 그리는 중의
 *  획을 **같은 함수(drawStrokeTex → paintMark)·같은 해상도**로 얹는다. 굽기와 갈릴 길이
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
    drawStrokeTex(g, s, box, dims)
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
  for (const s of strokes) {
    if (inTex(s, rf.id, side)) drawStrokeTex(g, s, box, dims)
  }
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
