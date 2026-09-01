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

// ── 면의 «쪽»(web2-48 48-5) — 칠은 한쪽에만 붙는다 ───────────────────────────
// 사람 지적: 「면을 중심선 취급하는 이상 벽의 두께는 구현되지 않으니, 그리기는 벽의 한
// 면에만 적용되어야 하는 것 아닌가.」 맞다 — 45가 틀렸다.
//
// 판정자는 **평면의 부호 거리**다: `n·P − d`. `n`은 그 면의 저장된 법선(경계 루프의
// 감김에서 나온다 — 좌표가 아니라 «정체»라 차수 승격·잡아 옮기기에도 안 뒤집힌다).
// 그래서 이 부호는 **평면의 쪽**을 가리키지 «어느 화면»을 가리키는 게 아니다 —
// 나중에 벽에 두께가 오면 `+1`은 법선 쪽 표면, `−1`은 반대쪽 표면으로 그대로 간다.
// **그 이어짐이 이 표현을 고른 유일한 이유다**(지시: 「이어짐을 깨뜨리지 않는 형태로」).

export type FaceSide = 1 | -1

/** 이 점이 그 평면의 어느 쪽인가. **0(평면 위)은 +1로 접는다** — 눈이 평면에 정확히
 *  얹히는 것은 측정 가능한 상태가 아니고(부동소수), 그때는 칠이 보이는 쪽이 안전하다
 *  (「애매하면 놓지 않는다」 — 안 보이는 쪽으로 접으면 칠이 조용히 사라진다). */
export const sideOfPlane = (pl: { n: V3; d: number }, P: V3): FaceSide =>
  dot3(pl.n, P) - pl.d >= 0 ? 1 : -1

/** **칠할 때 카메라가 있던 쪽** — 이 값이 그대로 `Stroke.paint.s`가 된다.
 *  ⚠ 평행 사영에서도 `pose.p`가 정답이다: 평행은 «눈을 뒤로 빼면서 조이는» 족이라
 *  눈이 여전히 그 쪽에 있다(camera.ts projDen 주석 — 광선의 원점이 pose.p다). */
export const paintSideAt = (f: ResolvedFace, pose: CamPose): FaceSide =>
  sideOfPlane(facePlane(f), pose.p)

/** **이 칠이 지금 보이는가**(48-5의 게이트). 부호가 없으면(45·46 옛 파일) 언제나 보인다 —
 *  옛 거동 그대로다(조용한 변형 ⛔). 면이 못 풀리면 애초에 안 그린다(면의 규약). */
export function paintVisible(
  faces: ResolvedFace[], s: Pick<Stroke, 'paint'>, pose: CamPose,
): boolean {
  const side = s.paint?.s
  if (side !== 1 && side !== -1) return true
  const f = faces.find(x => x.id === s.paint!.f)
  if (!f) return false
  return paintSideAt(f, pose) === side
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
): { runs: { f: number; pts: Pt[]; idx: number[] }[]; offFace: number } {
  const runs: { f: number; pts: Pt[]; idx: number[] }[] = []
  let offFace = 0
  let cur: { f: number; pts: Pt[]; idx: number[] } | null = null
  // idx = 원래 점렬에서의 자리(web2-50) — 점별 필압을 조각에 나눠 실을 때 정렬이 필요하다
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const f = frontFaceAt(lift, pose, faces, p)
    if (f === null) { offFace++; cur = null; continue }
    if (cur && cur.f === f) { cur.pts.push({ ...p }); cur.idx.push(i) }
    else { cur = { f, pts: [{ ...p }], idx: [i] }; runs.push(cur) }
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
