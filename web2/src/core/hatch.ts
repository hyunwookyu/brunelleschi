// 프리셋 채움 — 해칭(web2-45 45-4). **면의 함수다**: 픽셀로 굽지 않고 경계에서 매번
// 만든다(지시 — 개구부가 바뀌면 자동으로 따라 잘린다 · 원칙 b: 파생은 저장하지 않는다).
//
// **판이 둘이다**(⚑ — 사람이 눈으로 고른다 · 지시 「미리 정하지 마라. 둘 다 만들고 물어라」):
//   화면 고정(screen)  선 간격·각이 화면에 붙는다 — 종이 위의 해칭(제도답다).
//                      시점을 돌리면 무늬가 면 위에서 미끄러진다. 매 시점 다시 만든다.
//   면 고정(face)      선이 면 위에 붙는다 — 시점을 돌려도 따라 돈다(3D 렌더처럼 보일 수 있다).
//                      간격은 **작도 포즈에서의 화면 px**를 세계 길이로 굳힌 값이다
//                      (문서에서만 나오는 결정론 — 포즈 무관·저장 불요).
//
// 산출은 **3D 선분 짝**이다 — 렌더(three)가 면과 선 사이 차례로 긋는다(톤은 선 아래).

import type { CamPose } from './types'
import { DRAW_POSE, rayThrough, project, type Analysis } from './camera'
import { planeBasis, type ResolvedFace } from './face'
import { facePlane } from './paint'
import { type Pt, type V3, add3, sub3, mul3, dot3, cross3, norm3, len3, pt } from './vec'

export type HatchMode = 'screen' | 'face'

/** 다각형(구멍 포함) 안의 평행선 절단 — 짝수-홀수 규칙.
 *  선: o + t·d (d 단위벡터) · 반환: [t0,t1] 구간들. */
function clipLine(o: Pt, d: Pt, loops: Pt[][]): [number, number][] {
  const ts: number[] = []
  for (const poly of loops) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!
      const ex = b.x - a.x, ey = b.y - a.y
      const den = d.x * ey - d.y * ex
      if (Math.abs(den) < 1e-12) continue
      const u = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den     // 선 위 매개
      const v = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den   // 변 위 매개
      if (v >= 0 && v < 1) ts.push(u)
    }
  }
  ts.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < ts.length; i += 2) {
    if (ts[i + 1]! - ts[i]! > 1e-9) out.push([ts[i]!, ts[i + 1]!])
  }
  return out
}

/** 2D 평면(어느 좌표든)에서 다각형+구멍을 덮는 해칭 구간을 낸다. */
function hatch2d(
  loops: Pt[][], spacing: number, angleDeg: number,
): { a: Pt; b: Pt }[] {
  if (loops.length === 0 || loops[0]!.length < 3) return []
  const ang = angleDeg * Math.PI / 180
  const d = pt(Math.cos(ang), Math.sin(ang))          // 선 방향
  const n = pt(-d.y, d.x)                              // 이송 방향
  let s0 = Infinity, s1 = -Infinity
  for (const poly of loops) for (const p of poly) {
    const s = p.x * n.x + p.y * n.y
    if (s < s0) s0 = s
    if (s > s1) s1 = s
  }
  const out: { a: Pt; b: Pt }[] = []
  // 위상은 0 기준(결정론) — 시작 오프셋을 격자에 맞춘다
  for (let s = Math.ceil(s0 / spacing) * spacing; s <= s1; s += spacing) {
    const o = pt(n.x * s, n.y * s)
    for (const [t0, t1] of clipLine(o, d, loops)) {
      out.push({ a: pt(o.x + d.x * t0, o.y + d.y * t0), b: pt(o.x + d.x * t1, o.y + d.y * t1) })
    }
  }
  return out
}

/** 작도 포즈에서 면 중심의 «세계 1단위 = 화면 px» — 면 고정 판의 간격 환산(결정론:
 *  포즈·줌 무관, 문서에서만 나온다). 사영이 안 서면 null(그 면은 해칭 없음). */
function pxPerUnitAt(an: Analysis, center: V3, u: V3): number | null {
  const p0 = project(an, DRAW_POSE, center)
  const p1 = project(an, DRAW_POSE, add3(center, mul3(u, 0.01)))
  if (!p0 || !p1) return null
  return Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.01
}

/** 면 하나의 해칭 — 3D 선분 짝 목록.
 *  screen: 지금 포즈의 화면에서 만들고 광선으로 면 평면에 되떨어뜨린다(시점의 함수).
 *  face: 면 평면 기저에서 만든다(문서의 함수 — 포즈 무관). */
export function hatchSegments(
  an: Analysis, pose: CamPose, f: ResolvedFace, mode: HatchMode,
  spacingPx: number, angleDeg: number,
): { a: V3; b: V3 }[] {
  const pl = facePlane(f)
  if (mode === 'screen') {
    const loops: Pt[][] = []
    const proj = (poly: V3[]): Pt[] | null => {
      const out: Pt[] = []
      for (const P of poly) {
        const q = project(an, pose, P)
        if (!q) return null                            // 화면 뒤가 섞이면 그 면은 쉰다
        out.push(q)
      }
      return out
    }
    const outer = proj(f.outer)
    if (!outer) return []
    loops.push(outer)
    for (const h of f.holes) {
      const hp = proj(h)
      if (hp) loops.push(hp)
    }
    const segs2 = hatch2d(loops, spacingPx, angleDeg)
    const out: { a: V3; b: V3 }[] = []
    const drop = (p: Pt): V3 | null => {
      const ray = rayThrough(an, pose, p)
      if (!ray) return null
      const den = dot3(pl.n, ray.d)
      if (Math.abs(den) < 1e-9) return null
      const t = (pl.d - dot3(pl.n, ray.o)) / den
      if (t <= 1e-9) return null
      return add3(ray.o, mul3(ray.d, t))
    }
    for (const s of segs2) {
      const A = drop(s.a), B = drop(s.b)
      if (A && B) out.push({ a: A, b: B })
    }
    return out
  }
  // ── 면 고정 ────────────────────────────────────────────────────────────────
  const origin = f.outer[0]!
  const toPlane = planeBasis(origin, pl.n)
  // 기저의 실제 축 벡터(planeBasis 내부와 같은 식 — u·w를 되만든다)
  let u = cross3(pl.n, { x: 0, y: 1, z: 0 })
  if (len3(u) < 1e-6) u = cross3(pl.n, { x: 1, y: 0, z: 0 })
  u = norm3(u)
  const w = norm3(cross3(pl.n, u))
  let cx = 0, cy = 0, cz = 0
  for (const p of f.outer) { cx += p.x; cy += p.y; cz += p.z }
  const center: V3 = { x: cx / f.outer.length, y: cy / f.outer.length, z: cz / f.outer.length }
  const ppu = pxPerUnitAt(an, center, u)
  if (!ppu || ppu <= 0) return []
  const spacingWorld = spacingPx / ppu
  const loops: Pt[][] = [f.outer.map(toPlane)]
  for (const h of f.holes) loops.push(h.map(toPlane))
  const segs2 = hatch2d(loops, spacingWorld, angleDeg)
  const lift3 = (p: Pt): V3 => add3(add3(origin, mul3(u, p.x)), mul3(w, p.y))
  return segs2.map(s => ({ a: lift3(s.a), b: lift3(s.b) }))
}
