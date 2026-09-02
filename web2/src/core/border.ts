// web2-55 — **테두리(세 번째 슬롯)의 기하**. 테두리는 단면이 아니라 **실제 표면**이다
// (사람 문면: 「벽이 중간에 끝날 수도 있고 문틀일 수도 있는데 단면으로만 처리할 수는
// 없다」) — 그래서 칠할 수 있고, 칠의 좌표는 **(경계거리 s, 두께 방향 u)** 둘 다
// **세계 단위**다(50의 uv 선례 — 실치수 mm는 mmPerUnit 파생).
//
// ⚠ **정규화(UV)를 쓰지 않는 것이 이 파일의 존재 이유다**(지시): t를 200 → 300으로
// 바꾸면 정규화 칠은 1.5배로 늘어난다. s·u가 세계 단위면 안 늘어나고 **새로 생긴 폭이
// 빈 채로 남는다** — 그것이 옳다.
//
// 띠의 몸: 경계 루프(외곽 + 개구부 — 문틀이 개구부 띠다)의 이웃 정점 쌍마다 사각 하나 —
//   A+n·f, B+n·f, B+n·b, A+n·b   (n = 면 법선 · f/b = 앞/뒤 오프셋 — clsdef.slotOffsets)
// 자유단 캡은 **평평(butt)** — 코너 계단은 56이 고친다(이 라운드는 «벽 한 장»까지).
//
// s의 자: 루프들을 이어 붙인 누적 호길이(외곽 먼저, 개구부 순서대로). ⚠ 루프 이음선
// (s=0)과 루프 경계를 넘는 한 붓은 끊긴다 — 조각으로 나뉜다(면 밖 점을 세는 splitByFace
// 규약과 같은 자리). 그 유보는 원장 def가 든다.

import type { ResolvedFace } from './face'
import { rayThrough, type Analysis } from './camera'
import type { CamPose } from './types'
import { add3, sub3, mul3, dot3, norm3, len3, cross3, type V3, type Pt } from './vec'

export interface BorderQuad {
  a: V3; b: V3              // 중심선 경계의 두 정점
  dir: V3                    // a→b 단위 방향
  len: number                // |b−a|
  s0: number                 // 이 변의 시작 호길이(전 루프 누적)
  out: V3                    // 띠의 바깥 법선(dir × n — 감김이 정하는 쪽)
}

/** 띠 사각 목록 — 외곽 + 개구부 전부. n은 rf.normal(단위) 하나다. */
export function borderQuads(rf: ResolvedFace): { quads: BorderQuad[]; n: V3; total: number } {
  const n = norm3(rf.normal)
  const quads: BorderQuad[] = []
  let s = 0
  const loops: V3[][] = [rf.outer, ...rf.holes]
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!, b = loop[(i + 1) % loop.length]!
      const d = sub3(b, a)
      const L = len3(d)
      if (L < 1e-9) continue
      const dir = mul3(d, 1 / L)
      quads.push({ a, b, dir, len: L, s0: s, out: norm3(cross3(dir, n)) })
      s += L
    }
  }
  return { quads, n, total: s }
}

/** (s, u) → 3D — u는 «뒤 표면에서 잰 거리»(0 = 뒤 · tW = 앞). backW가 기준점이다. */
export function borderTo3(
  rf: ResolvedFace, frontW: number, backW: number, s: number, u: number,
): V3 | null {
  const { quads, n, total } = borderQuads(rf)
  if (quads.length === 0 || total <= 0) return null
  let sc = ((s % total) + total) % total
  for (const q of quads) {
    if (sc <= q.s0 + q.len + 1e-9 && sc >= q.s0 - 1e-9) {
      const along = Math.min(q.len, Math.max(0, sc - q.s0))
      return add3(add3(q.a, mul3(q.dir, along)), mul3(n, backW + u))
    }
  }
  return null
}

/** 테두리 획의 3D 점렬(파생) — paintGeo의 테두리판. uv = (s,u) 짝 목록. */
export function borderGeoOf(
  rf: ResolvedFace, frontW: number, backW: number, uv: number[],
): V3[] | null {
  const out: V3[] = []
  for (let i = 0; i + 1 < uv.length; i += 2) {
    const P = borderTo3(rf, frontW, backW, uv[i]!, uv[i + 1]!)
    if (P) out.push(P)
  }
  return out.length >= 2 ? out : null
}

/** 화면 점이 짚는 띠 자리 — 광선 ∩ 각 사각의 평면, 사각 안(0≤along≤len ·
 *  backW≤offset≤frontW)이면 후보. 가장 가까운 것 하나. frontFaceAt의 띠판이다. */
export function borderHitAt(
  an: Analysis, pose: CamPose, rf: ResolvedFace, frontW: number, backW: number, p: Pt,
): { s: number; u: number; depth: number } | null {
  if (frontW - backW <= 1e-12) return null
  const ray = rayThrough(an, pose, p)
  if (!ray) return null
  const { quads, n } = borderQuads(rf)
  let best: { s: number; u: number; depth: number } | null = null
  for (const q of quads) {
    const den = dot3(q.out, ray.d)
    if (Math.abs(den) < 1e-12) continue
    const d0 = dot3(q.out, q.a)
    const t = (d0 - dot3(q.out, ray.o)) / den
    if (t <= 1e-9) continue
    const P = add3(ray.o, mul3(ray.d, t))
    const rel = sub3(P, q.a)
    const along = dot3(rel, q.dir)
    if (along < -1e-9 || along > q.len + 1e-9) continue
    const off = dot3(rel, n)
    if (off < backW - 1e-9 || off > frontW + 1e-9) continue
    if (!best || t < best.depth) {
      best = { s: q.s0 + Math.min(q.len, Math.max(0, along)), u: off - backW, depth: t }
    }
  }
  return best
}
