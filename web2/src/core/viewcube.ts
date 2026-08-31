// 뷰 큐브 — 3D 큐브. 면·모서리·꼭짓점.
// 면 = 1점 시점(피치 0, 롤 0 — 화면 가로세로가 축이 된다).
// 큐브의 기준 좌표계는 그린 공간의 축(vp0·수직·그 외적)이다. 세계 축이 아니다.

import type { CamPose } from './types'
import { dirInCamera, isParallel, type Analysis } from './camera'
import { lensAllowed } from './lens'
import { C, VIEW_NAME_ALIGN_RAD } from './constants'
import {
  type Pt, type V3, type Quat, pt, v3, add3, sub3, mul3, norm3, cross3, dot3, len3,
  quatFromBasis, quatRotate, dist2,
} from './vec'

export interface CubeBasis { X: V3; Y: V3; Z: V3 }

/** 그린 공간의 정규직교 기저 — vp0 방향·수직·외적. 작도 전이면 null. */
export function cubeBasis(an: Analysis): CubeBasis | null {
  if (!an.constructionDone) return null
  const vp0 = an.axes.find(a => a.id === 'vp0')?.dir
  if (!vp0) return null
  const X = norm3(vp0)
  const Y = v3(0, 1, 0)
  const Z = norm3(cross3(X, Y))
  return { X, Y, Z }
}

export interface CubeLayout { cx: number; cy: number; size: number }

/** 큐브에서 짚은 것. **`center`가 「투시」다**(web2-42 1번 — 일곱 뷰의 가운데).
 *  ⚠ 꼭짓점·모서리는 **31-1의 범위 그대로**다(지시: 「꼭짓점 방향을 되살리지 마라」 —
 *  90° 화살표가 면만 쓰는 그 결정을 안 건드린다). */
export type CubeElem = { kind: 'face' | 'edge' | 'corner' | 'center'; dirLocal: V3 }

export interface CubeGeom {
  layout: CubeLayout
  /** 8 꼭짓점 — 화면 좌표와 깊이 */
  corners: { p: Pt; z: number; local: V3 }[]
  /** 보이는 면 — 화면 폴리곤 (꼭짓점 인덱스) */
  faces: { n: V3; poly: number[]; visible: boolean }[]
}

const CORNERS: V3[] = []
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  CORNERS.push(v3(sx, sy, sz))
}
// 면: 법선과 그 면의 꼭짓점 인덱스(둘레 순서)
const FACES: { n: V3; idx: number[] }[] = [
  { n: v3(1, 0, 0), idx: [4, 5, 7, 6] },
  { n: v3(-1, 0, 0), idx: [0, 1, 3, 2] },
  { n: v3(0, 1, 0), idx: [2, 3, 7, 6] },
  { n: v3(0, -1, 0), idx: [0, 1, 5, 4] },
  { n: v3(0, 0, 1), idx: [1, 3, 7, 5] },
  { n: v3(0, 0, -1), idx: [0, 2, 6, 4] },
]

/** 현재 포즈에서의 큐브 화면 기하 — 그리기와 판정이 같은 출처 */
export function cubeGeom(an: Analysis, pose: CamPose, layout: CubeLayout): CubeGeom | null {
  const basis = cubeBasis(an)
  if (!basis) return null
  const k = layout.size / 2 / Math.sqrt(3) * 1.35
  const corners = CORNERS.map(local => {
    const w = add3(add3(mul3(basis.X, local.x), mul3(basis.Y, local.y)), mul3(basis.Z, local.z))
    const c = dirInCamera(pose, w) // 카메라 프레임 (정사영 위젯 — 장면 사영 아님)
    return { p: pt(layout.cx + c.x * k, layout.cy - c.y * k), z: c.z, local }
  })
  const faces = FACES.map(f => {
    const w = add3(add3(mul3(basis.X, f.n.x), mul3(basis.Y, f.n.y)), mul3(basis.Z, f.n.z))
    const c = dirInCamera(pose, w)
    return { n: f.n, poly: f.idx, visible: c.z > 1e-6 }
  })
  return { layout, corners, faces }
}

function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return dist2(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** 화면 점 → 큐브 요소. 꼭짓점 > 모서리 > 면 (정확한 것이 앞선다). */
export function cubeHit(geom: CubeGeom, p: Pt): CubeElem | null {
  // ── 가운데 = 「투시」(web2-42 1번) — **꼭짓점보다 먼저 본다** ─────────────────
  // ⚠ 아이소메트릭에 가까운 자세에서는 **앞 꼭짓점이 정확히 화면 중심에 사영된다**
  //   (국소 (1,1,1)이 카메라를 향하면 c ≈ (0,0,1) → 화면 (0,0)). 그래서 순서를 정해야
  //   하고, 「투시」가 이긴다: 투시로 돌아가는 길은 **언제나 열려 있어야 한다**(지시 문면).
  //   잃는 것은 그 자세에서 «앞 꼭짓점 하나»뿐이고 그 꼭짓점의 시점은 **지금 보고 있는
  //   바로 그 자세**라 누를 이유가 없다. 나머지 꼭짓점·모서리는 종전 그대로다.
  if (dist2(p, pt(geom.layout.cx, geom.layout.cy)) <= geom.layout.size * C.CUBE_CENTER_R) {
    return { kind: 'center', dirLocal: v3(0, 0, 0) }
  }
  const visCorner = new Set<number>()
  const visEdges: [number, number][] = []
  for (const f of geom.faces) {
    if (!f.visible) continue
    for (let i = 0; i < f.poly.length; i++) {
      const a = f.poly[i]!, b = f.poly[(i + 1) % f.poly.length]!
      visCorner.add(a)
      visEdges.push([Math.min(a, b), Math.max(a, b)])
    }
  }
  for (const i of visCorner) {
    if (dist2(p, geom.corners[i]!.p) <= 8) {
      return { kind: 'corner', dirLocal: norm3(geom.corners[i]!.local) }
    }
  }
  const seen = new Set<string>()
  for (const [a, b] of visEdges) {
    const key = `${a}-${b}`
    if (seen.has(key)) continue
    seen.add(key)
    if (distToSeg(p, geom.corners[a]!.p, geom.corners[b]!.p) <= 5) {
      const la = geom.corners[a]!.local, lb = geom.corners[b]!.local
      return { kind: 'edge', dirLocal: norm3(mul3(add3(la, lb), 0.5)) }
    }
  }
  for (const f of geom.faces) {
    if (!f.visible) continue
    if (inPoly(p, f.poly.map(i => geom.corners[i]!.p))) {
      return { kind: 'face', dirLocal: f.n }
    }
  }
  return null
}

/** 큐브 요소 → 카메라 포즈. 중심을 바라보고 거리 유지, 롤 0(위 힌트 = 큐브 Y). */
export function poseForElem(
  an: Analysis, elem: CubeElem, pivot: V3, dist: number,
): CamPose | null {
  // 가운데(투시)는 **자세를 안 바꾼다** — 바꾸는 것은 투영뿐이다(`perspectivePose`).
  if (elem.kind === 'center') return null
  const basis = cubeBasis(an)
  if (!basis) return null
  const d = elem.dirLocal
  const back = norm3(add3(add3(mul3(basis.X, d.x), mul3(basis.Y, d.y)), mul3(basis.Z, d.z)))
  let upHint = basis.Y
  if (Math.abs(dot3(back, upHint)) > 0.99) upHint = mul3(basis.Z, -Math.sign(dot3(back, basis.Y)) || -1)
  let right = cross3(upHint, back)
  if (len3(right) < 1e-9) right = basis.X
  right = norm3(right)
  const up = norm3(cross3(back, right))
  const q: Quat = quatFromBasis(right, up, back)
  return { p: add3(pivot, mul3(back, dist)), q }
}

// ══════════════════════════════════════════════════════════════════════════
// 90° 화살표 — **기준 틀은 화면이 아니라 축이다**(web2-31 1번)
//
// ⚠⚠ 이 절의 요점은 «어느 프레임에서 90°를 도는가» 하나다. 2점 투시의 **초기 화면은
//    이미 축에 대해 돌아가 있다**(표준 픽스처에서 vp0 축과 37.76°). 그 화면을 큐브의
//    정면으로 삼고 90°씩 돌면 네 자세 모두 37.76° 어긋난 채로 돌아 **영원히 진짜
//    입면에 못 닿는다.** 그래서 틀을 정하는 것은 축이다 — `cubeBasis`(vp0·수직·외적)가
//    이미 그 틀이고, 여기서 하는 일은 **그 틀 안의 정수 축 벡터로 자세를 양자화**한 뒤
//    그 안에서만 90°를 도는 것이다. 초기 카메라는 틀 «안의 한 위치»일 뿐이다.
//
//    1점일 때도 규칙은 같다 — `cubeBasis`의 X는 1점에서 정확히 (0,0,−1)이 되므로
//    (주점 = 깊이 소실점이라 vp0 방향에 가로 성분이 없다) 초기 화면이 «마침» 정면과
//    일치한다. 그것은 결과지 정의가 아니다(지시 문면 그대로).
//
// 모서리·꼭짓점은 이 경로에 없다 — 90° 화살표는 **면만** 쓴다(지시: 범위를 안 넓힌다).
// 기존 `cubeHit`의 corner/edge 거동은 종전 그대로다.

export type CubeTurn = 'left' | 'right' | 'up' | 'down'

/** 면 자세 — **큐브 국소 좌표의 정수 축 벡터** 둘. `back` = 카메라 뒤(시선의 반대),
 *  `up` = 화면 위. 성분이 0/±1뿐이라 90° 회전이 **정수 연산**이고 오차가 안 쌓인다. */
export interface FaceOrient { back: V3; up: V3 }

const AXIS_OF = (v: V3): number =>
  (Math.abs(v.x) >= Math.abs(v.y) && Math.abs(v.x) >= Math.abs(v.z)) ? 0
    : (Math.abs(v.y) >= Math.abs(v.z)) ? 1 : 2

const UNIT = (i: number, s: number): V3 => i === 0 ? v3(s, 0, 0) : i === 1 ? v3(0, s, 0) : v3(0, 0, s)

const COMP = (v: V3, i: number): number => i === 0 ? v.x : i === 1 ? v.y : v.z

/** 세계 방향 → 큐브 국소 성분 */
export function toCubeLocal(basis: CubeBasis, w: V3): V3 {
  return v3(dot3(basis.X, w), dot3(basis.Y, w), dot3(basis.Z, w))
}

/** 국소 성분 → 세계 방향(단위) */
export function fromCubeLocal(basis: CubeBasis, l: V3): V3 {
  return norm3(add3(add3(mul3(basis.X, l.x), mul3(basis.Y, l.y)), mul3(basis.Z, l.z)))
}

/** 가장 가까운 면 축. `avoid`가 주어지면 그 축은 후보에서 뺀다(back과 up이 같은 축에
 *  앉는 퇴화를 막는다 — 정확히 45°인 동점은 x→y→z 순으로 결정적으로 갈린다). */
function nearestAxis(v: V3, avoid?: number): V3 {
  let bi = -1, bv = -1
  for (let i = 0; i < 3; i++) {
    if (i === avoid) continue
    const m = Math.abs(COMP(v, i))
    if (m > bv + 1e-12) { bv = m; bi = i }
  }
  if (bi < 0) return v3(0, 1, 0)
  return UNIT(bi, COMP(v, bi) < 0 ? -1 : 1)
}

/** **지금 자세를 «틀 안의 면»으로 읽는다.** 여기가 갈리는 자리다 —
 *  `basis`에 축 틀을 주면 축 기준이고, 카메라 자신의 right/up/back을 주면 화면 기준이다.
 *  (그 «화면 기준» 판이 이 항목의 반증 조건이다 — `test/turn31.test.ts`.) */
export function orientIn(basis: CubeBasis, pose: CamPose): FaceOrient {
  const back = nearestAxis(toCubeLocal(basis, quatRotate(pose.q, v3(0, 0, 1))))
  const up = nearestAxis(toCubeLocal(basis, quatRotate(pose.q, v3(0, 1, 0))), AXIS_OF(back))
  return { back, up }
}

/** 단위 축 k 둘레로 v를 ±90° — cos 0 · sin ±1이라 곱셈이 없다(정확히 90°) */
const rot90 = (v: V3, k: V3, s: 1 | -1): V3 => {
  const d = dot3(k, v)
  const c = cross3(k, v)
  return v3(k.x * d + s * c.x, k.y * d + s * c.y, k.z * d + s * c.z)
}

/** **정확히 90°.** 좌/우는 **틀의 세로축(국소 Y)** 둘레 — 화면의 위가 아니다.
 *  상/하는 화면 오른쪽(= up × back) 둘레라 입면 ↔ 평면을 오간다.
 *  향: 오른쪽 화살표는 **화면 오른쪽에 있던 면**을 정면으로 데려온다(위도 같은 형태). */
export function turnOrient(o: FaceOrient, t: CubeTurn): FaceOrient {
  const k = (t === 'left' || t === 'right') ? v3(0, 1, 0) : cross3(o.up, o.back)
  const s: 1 | -1 = (t === 'right' || t === 'down') ? 1 : -1
  return { back: rot90(o.back, k, s), up: rot90(o.up, k, s) }
}

/** 면 자세 → 카메라 포즈. 중심을 보고 거리 유지 — `poseForElem`과 같은 규약이다
 *  (가로 면에서는 up이 틀의 세로축이라 두 함수가 같은 포즈를 낸다). */
export function poseForOrient(
  basis: CubeBasis, o: FaceOrient, pivot: V3, dist: number,
): CamPose {
  const back = fromCubeLocal(basis, o.back)
  const up = fromCubeLocal(basis, o.up)
  const right = norm3(cross3(up, back))
  const q: Quat = quatFromBasis(right, norm3(cross3(back, right)), back)
  return { p: add3(pivot, mul3(back, dist)), q }
}

// ── 화살표 그림쇠 — 큐브 둘레 넷 ──────────────────────────────────────────
// **크기는 전부 `layout.size`에서 유도한다**(PITFALLS #88 — 예약값을 상수로 옮겨 적으면
// 큐브를 키우는 사람이 여기를 볼 이유가 없다). 바깥 반경이 `size`보다 작으므로
// `input.ts`가 이미 쓰는 «큐브 반경 밖이면 무시» 문이 그대로 화살표를 덮는다.

/** **그림쇠의 자리 — 한 자리에서만 계산한다**(#54: `state.ts`와 `main.ts`가 각자 적던 것).
 *
 *  바깥으로 뻗는 것이 이제 화살표 끝이므로 **그것이 여백에 닿게** 잡는다:
 *  `cx = W − 오른쪽 여백 − 뻗침` · `cy = 위 여백 + 뻗침`. 화살표를 키우거나 큐브를
 *  키우면 자리가 **저절로** 따라온다 — 그 결합이 코드에 보이는 것이 요점이다(#88). */
export function cubeLayoutFor(W: number): CubeLayout {
  const size = C.CUBE_SIZE_PX
  const reach = size * C.CUBE_ARROW_R1
  return { cx: W - C.CUBE_MARGIN_RIGHT_PX - reach, cy: C.CUBE_MARGIN_TOP_PX + reach, size }
}

export interface CubeArrow { turn: CubeTurn; u: Pt; tip: Pt; poly: Pt[] }

const DIRS: { turn: CubeTurn; u: Pt }[] = [
  { turn: 'left', u: pt(-1, 0) },
  { turn: 'right', u: pt(1, 0) },
  { turn: 'up', u: pt(0, -1) },
  { turn: 'down', u: pt(0, 1) },
]

/** 네 화살표의 화면 삼각형 — 그리기와 판정이 같은 출처 */
export function cubeArrows(layout: CubeLayout): CubeArrow[] {
  const r0 = layout.size * C.CUBE_ARROW_R0
  const r1 = layout.size * C.CUBE_ARROW_R1
  const h = layout.size * C.CUBE_ARROW_HALF
  return DIRS.map(({ turn, u }) => {
    const n = pt(-u.y, u.x)                       // 화살표 방향의 수직
    const tip = pt(layout.cx + u.x * r1, layout.cy + u.y * r1)
    const b = pt(layout.cx + u.x * r0, layout.cy + u.y * r0)
    return {
      turn, u, tip,
      poly: [tip, pt(b.x + n.x * h, b.y + n.y * h), pt(b.x - n.x * h, b.y - n.y * h)],
    }
  })
}

/** 화면 점 → 화살표. 화살표를 감싸는 띠(반경 r0..r1 · 옆폭 ±h)로 잡는다 —
 *  삼각형 자체는 꼭짓점 쪽이 바늘구멍이라 손가락으로 못 짚는다(A-3: 짚는 대역은 넉넉히). */
export function arrowHit(layout: CubeLayout, p: Pt): CubeTurn | null {
  const dx = p.x - layout.cx, dy = p.y - layout.cy
  const r0 = layout.size * C.CUBE_ARROW_R0
  const r1 = layout.size * C.CUBE_ARROW_R1
  const h = layout.size * C.CUBE_ARROW_HALF
  for (const { turn, u } of DIRS) {
    const along = dx * u.x + dy * u.y
    const side = Math.abs(dx * -u.y + dy * u.x)
    if (along >= r0 && along <= r1 && side <= h) return turn
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════
// 일곱 개의 이름 붙은 뷰(web2-42 1번) — **면을 누르면 자세와 투영이 같이 정해진다**
//
//   여섯 면   평면 · 저면 · 정면 · 후면 · 좌측면 · 우측면   → 평행이 따라온다
//   가운데    투시                                        → 원근으로 돌아온다
//
// 「평행을 켜고 정면으로 간다」가 아니라 그냥 **정면으로 간다**. 이름이 곧 상태다.
// 그래서 «평행 토글»이라는 것이 이 앱에 없다(지시 「하지 말 것」).
//
// ⚠ 이름은 **큐브의 틀**로 읽는다(`cubeBasis` — vp0 방향 · 수직 · 그 외적). 세계 축이
//   아니다. 1점 그림에서 그 X가 정확히 깊이 방향이 되므로 「정면」이 사람이 그린 그
//   정면이다(31-1 머리주석의 그 성질을 그대로 쓴다).

/** **평행으로 볼 수 있는가** — 31-2(보기 렌즈)와 **같은 조건**이다(지시 문면).
 *  평행에는 소실점이 없으므로 첫 획으로 카메라를 못 푼다 → 카메라가 닫힌 뒤에만.
 *  술어를 새로 안 짓는다(#54) — `lensAllowed` 하나가 「카메라가 닫혔는가」의 답이다. */
export const parallelAllowed = lensAllowed

/** **평행으로 본 같은 자리** — 배율은 `f / D`이고 `D`는 **눈에서 pivot까지의 축방향 거리**다.
 *
 *  ⚠ 배율을 상수로 안 둔다(#88 — 예약값은 대상에서 유도한다): `f/D`이므로 **pivot 면에서
 *  원근과 크기가 정확히 같다**. 그래서 전환이 그 면을 기준으로 «펴지는» 것으로 보이고
 *  대상이 화면에서 안 튄다. 눈은 그대로 둔다(평행에서 눈의 «거리»는 상이 아니라 D가 정한다). */
export function parallelPose(pose: CamPose, pivot: V3): CamPose {
  const fwd = quatRotate(pose.q, v3(0, 0, -1))
  const D = Math.max(1e-6, dot3(sub3(pivot, pose.p), fwd))
  return { p: pose.p, q: pose.q, proj: { w: 1, D } }
}

/** **원근으로 되돌린 같은 자리** — 자세는 그대로다(가운데 「투시」가 이것이다).
 *  이미 원근이면 **같은 객체를 그대로 돌려준다**(구성상 항등 — 전환할 것이 없다). */
export const perspectivePose = (pose: CamPose): CamPose =>
  pose.proj ? { p: pose.p, q: pose.q } : pose

/** 화면에 쓰는 이름. **「도면」이라는 말을 안 쓴다**(지시: 도면은 잘라내고 주기까지 붙은 것이다). */
export type ViewName = '투시' | '평면' | '저면' | '정면' | '후면' | '좌측면' | '우측면' | '축측'

/** 큐브 국소 축 → 이름. 시선의 **반대**(back = 눈이 있는 쪽)로 읽는다.
 *  X = vp0 방향이므로 **그 축을 마주 보는 것이 정면**이다(back = −X). */
function nameOfBack(b: V3): ViewName | null {
  if (b.y > 0.5) return '평면'
  if (b.y < -0.5) return '저면'
  if (b.x < -0.5) return '정면'
  if (b.x > 0.5) return '후면'
  if (b.z > 0.5) return '우측면'
  if (b.z < -0.5) return '좌측면'
  return null
}

/** **지금 무엇을 보고 있는가**(web2-42 1번 — 화면에 이름으로 표시한다).
 *
 *  · 원근이면 **투시**다 — 자세와 무관하다(원근에서 「정면」은 이 앱에서 그냥 1점 그림이다).
 *  · 평행이면 축에 **정렬됐는지**로 갈린다: 정렬이면 그 면 이름, 아니면 **축측**.
 *    허용 각은 `VIEW_NAME_ALIGN_RAD`(궤도 반 픽셀) — 손으로 한 픽셀만 돌려도 축측이 되고
 *    부동소수 잡음으로는 안 바뀐다. */
export function viewName(an: Analysis, pose: CamPose): ViewName {
  if (!isParallel(pose)) return '투시'
  const basis = cubeBasis(an)
  if (!basis) return '축측'
  const back = toCubeLocal(basis, quatRotate(pose.q, v3(0, 0, 1)))
  const near = nearestAxis(back)
  const cos = Math.min(1, Math.max(-1, dot3(norm3(back), near)))
  if (Math.acos(cos) > VIEW_NAME_ALIGN_RAD) return '축측'
  return nameOfBack(near) ?? '축측'
}
