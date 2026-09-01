// 칠하기(web2-45 45-3) — **면 위에서의 lift**. 새 개념이 아니다(지시 문면):
//
//     선   화면에 긋는다 → 축과 점이 3D를 정한다
//     칠   화면에 긋는다 → 그 아래 «면»이 3D를 정한다
//
// 자료의 규약: **raw(그은 시점의 문서 좌표)가 정본**이고 3D 점렬은 **파생**이다(원칙 b —
// 저장하지 않고 매번 역투영한다). 그래서 면의 경계가 옮겨져도(44의 옮기기) 칠은 «그때
// 그 자리에 그은 잉크»로 남고, 평면이 그대로면 같은 3D에 다시 선다.
//
// 칠 획은 소실점·리프팅·오스냅에 **안 낀다**(옐로·글씨의 선례 — 같은 자리에서 걸러진다).
// 매체가 「면 위 잉크」라 대기도 아니다. 면이 못 풀리면(경계 획이 지워짐) 칠도 안 보인다 —
// 면의 규약 그대로(«버리지 않고 빠진다» — 경계가 돌아오면 칠도 돌아온다).

import { isPaint, type Stroke, type CamPose, type Face } from './types'
export { isPaint }
import { DRAW_POSE, rayThrough, project, type Analysis } from './camera'
import { planeDepth, faceScreen, inPoly, type ResolvedFace } from './face'
import type { LiftResult } from './lift'
import { type Pt, type V3, add3, sub3, mul3, dot3, norm3 } from './vec'

/** 풀린 면의 평면 — 중심을 지나는 최적합이 아니라 **첫 정점 + 법선**(resolveFace의
 *  평면성 문이 이미 이탈을 걸렀으므로 이 표현으로 충분하다 — 같은 자다). */
export const facePlane = (f: ResolvedFace): { n: V3; d: number } => {
  const n = norm3(f.normal)
  return { n, d: dot3(n, f.outer[0]!) }
}

/** 화면 점이 짚는 **맨 앞 면** — 폴리곤(구멍 제외) 안이고 광선이 그 평면과 만나는 것 중
 *  가장 가까운 것. 칠의 면 배정과 45-1 깊이 판정이 같은 식이다(#54). */
export function frontFaceAt(
  lift: LiftResult, pose: CamPose, faces: ResolvedFace[], p: Pt,
): number | null {
  const ray = rayThrough(lift.an, pose, p)
  if (!ray) return null
  let best: number | null = null
  let bestD = Infinity
  for (const f of faces) {
    const poly = faceScreen(lift, pose, f.outer)
    if (!poly || !inPoly(p, poly)) continue
    let inHole = false
    for (const h of f.holes) {
      const hp = faceScreen(lift, pose, h)
      if (hp && inPoly(p, hp)) { inHole = true; break }
    }
    if (inHole) continue
    const d = planeDepth(facePlane(f), ray)
    if (d < bestD) { bestD = d; best = f.id }
  }
  return best
}

/** 한 붓의 점렬 → **면별 조각**(지시: 「획이 여러 면을 지나가면 면마다 나뉘어 얹힌다」).
 *  연속한 점들이 같은 면을 짚는 동안 한 조각이다. 면 밖 점은 버리되 **센다**(조용히
 *  버리지 않는다 — 3-b 규약의 칠판). 두 점 미만 조각은 못 선다(버린 수에 든다). */
export function splitByFace(
  lift: LiftResult, pose: CamPose, faces: ResolvedFace[], pts: Pt[],
): { runs: { f: number; pts: Pt[] }[]; offFace: number } {
  const runs: { f: number; pts: Pt[] }[] = []
  let offFace = 0
  let cur: { f: number; pts: Pt[] } | null = null
  for (const p of pts) {
    const f = frontFaceAt(lift, pose, faces, p)
    if (f === null) { offFace++; cur = null; continue }
    if (cur && cur.f === f) cur.pts.push({ ...p })
    else { cur = { f, pts: [{ ...p }] }; runs.push(cur) }
  }
  const kept = runs.filter(r => r.pts.length >= 2)
  for (const r of runs) if (r.pts.length < 2) offFace += r.pts.length
  return { runs: kept, offFace }
}

/** 칠 획의 **3D 점렬**(파생) — 그은 시점(s.view)의 광선을 그 면의 평면에 떨어뜨린다.
 *  면이 목록에 없으면(못 풀림) null — 안 보인다(면의 규약). 광선이 평면과 평행하거나
 *  뒤로 가면 그 점은 건너뛴다(끊긴 점렬은 두 점 미만이면 null). */
export function liftPaint(
  lift: LiftResult, faces: ResolvedFace[], s: Stroke,
): V3[] | null {
  if (s.paint === undefined) return null
  const f = faces.find(x => x.id === s.paint!.f)
  if (!f) return null
  const pose: CamPose = s.view ?? DRAW_POSE
  const pl = facePlane(f)
  const pts = s.raw && s.raw.length >= 2 ? s.raw : [s.a, s.b]
  const out: V3[] = []
  for (const p of pts) {
    const ray = rayThrough(lift.an, pose, p)
    if (!ray) continue
    const den = dot3(pl.n, ray.d)
    if (Math.abs(den) < 1e-9) continue
    const t = (pl.d - dot3(pl.n, ray.o)) / den
    if (t <= 1e-9) continue
    out.push(add3(ray.o, mul3(ray.d, t)))
  }
  return out.length >= 2 ? out : null
}

/** 지금 시점의 화면(문서 좌표) 점렬 — 렌더가 쓴다. 사영 안 되는 점은 건너뛴다. */
export function paintScreenPts(
  an: Analysis, pose: CamPose, pts3: V3[],
): Pt[] | null {
  const out: Pt[] = []
  for (const P of pts3) {
    const q = project(an, pose, P)
    if (q) out.push(q)
  }
  return out.length >= 2 ? out : null
}

// ── 분류(45-2) — 법선만 본다 ─────────────────────────────────────────────────

export type FaceClass = 'slab' | 'wall' | 'slope'
export const FACE_CLASSES: FaceClass[] = ['slab', 'wall', 'slope']

/** 법선 → 분류. 임계는 `C.FACE_CLASS_DEG` — 법선의 «기울기 각»(수직에서 잰다):
 *  0° = 법선이 수직(슬라브) · 90° = 법선이 수평(벽) · 사이 = 경사.
 *  ⚠ 호출자가 임계를 넘긴다(#88 — 팔이 스윕한다). */
export function faceClassOf(n: V3, tolDeg: number): FaceClass {
  const l = Math.hypot(n.x, n.y, n.z)
  if (l < 1e-12) return 'slope'
  const tilt = Math.acos(Math.min(1, Math.abs(n.y) / l)) * 180 / Math.PI
  if (tilt <= tolDeg) return 'slab'
  if (tilt >= 90 - tolDeg) return 'wall'
  return 'slope'
}

/** 면의 분류 — **출처 한 자리**(#54): 사람이 정한 값(`Face.cls`)이 있으면 그것,
 *  없으면 법선 계산. 지시 문면 「자동 분류는 틀린다 — 사용자가 고칠 수 있어야 한다」. */
export function classOf(face: Face | undefined, rf: ResolvedFace, tolDeg: number): FaceClass {
  return face?.cls ?? faceClassOf(rf.normal, tolDeg)
}
