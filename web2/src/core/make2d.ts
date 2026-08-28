// 굽기(make2d) — **옐로를 얹는 그 순간 한 번** 도는 은선 계산(web2-23 1부).
//
// 사람의 말 안에 싸게 만드는 조건이 이미 있다 — 「**눌러놓은 선**」. 얹는 순간
// 한 번 계산하고 그 뒤로는 **그림**이다. 프레임마다 안 돈다(그래서 여기에는
// 캐시도 무효화도 없다 — 결과는 `Doc.underlays`에 사건으로 남는다: `types.ts`).
//
// 재료는 셋이다:
//   ① 켜진 겹의 **3D 선분 전부**(`lift.lifted` — 꺼진 겹·옐로 겹은 이미 빠져 있다)
//   ② `app.faces`의 **풀린 면**(외곽 + 개구부)
//   ③ 그 종이의 **시점**(pose)
//
// ⚠ **법선은 안 쓴다**(지시 1-a). 가림은 「이 조각이 이 면보다 뒤인가」이지 면이 어느
//   쪽을 보는가가 아니다 — 법선이 필요해지는 것은 그림자이고 이 회차 밖이다.
//   (평면의 방정식 n·x = d 에는 법선이 들어가지만 그것은 «평면의 좌표»이지 «면의 앞뒤»가
//    아니다 — 부호를 한 번도 안 읽는다.)
// ⚠ **화면 표시 규약은 안 건드린다.** 면은 지금대로 `depthTest:false`의 옅은 채색이고
//   (AS-C19) 면끼리 안 가린다. 깊이는 **이 굽기 안에서만** 쓴다 — 근거는 `DECISIONS.md`
//   D-W11(「면끼리 안 가린다」를 결함으로 읽고 고치려는 다음 사람을 막는다).
// ⚠ **옐로 겹 자신의 획은 대상이 아니다**(2D다) — `liftAll`이 이미 뺐다(#54: 별도
//   필터를 만들지 않는다). 그 아래 3D만이 굽힌다.
//
// 사영의 출처는 `camera.ts` 하나다(원칙 a) — `projectSeg`(카메라 앞 잘라내기까지
// 그 규약 그대로) · `rayThrough` · `face.ts`의 `planeDepth`(면과 광선의 만남).

import { C } from './constants'
import { projectSeg, projectPolyNear, rayThrough } from './camera'
import type { CamPose } from './types'
import { closestOnLineToRay, type LiftResult } from './lift'
import { faceScreen, inPoly, planeDepth, type ResolvedFace } from './face'
import { geomSize3 } from './osnap'
import { type Pt, type V3, pt, sub3, dot3, norm3, len3 } from './vec'

/** 구운 조각 하나 — 화면(=문서) 좌표의 선분과 깃발 하나. 폴리라인 목록의 마디다. */
export interface UnderlaySeg { a: Pt; b: Pt; hidden: boolean }

/** D-3 반증 손잡이 — **둘 다 실제로 돌린다**(지시 1-c). 앱에는 UI가 없다: 이 인자를
 *  기본값으로 두면 앱 경로이고, 팔이 갈아 끼워 격자가 **갈리는 것**을 본다. */
export interface BakeOptions {
  /** 같은 평면 조항(1-c) — 끄면 벽의 모서리가 **자기 벽에 가려** 사라져야 한다 */
  coplanar?: boolean
  /** 깊이 비교를 뒤집는다 — 뒤집으면 가린 선과 보이는 선이 맞바뀌어야 한다 */
  flipDepth?: boolean
  /** 근평면 잘라내기(web2-25 1-a) — **끄면 web2-23의 동작**(꼭짓점 하나라도 뒤면 면을
   *  통째로 버린다)이다. 실내 시점에서 좌우 벽·바닥이 `dropped`로 새어 나가야 한다. */
  nearClip?: boolean
}

export interface BakeResult {
  segs: UnderlaySeg[]
  /** 굽는 데 실제로 쓴 면 수 — **0이면 전부 visible**이고 3부 안내가 그것을 읽는다 */
  faces: number
  /** 대상이 된 3D 선분 수(사영이 된 것만) */
  lines: number
  /** 자른 조각 수(병합 전) — 비용 원장이 읽는 일감의 크기 */
  pieces: number
  /** 굽기에서 **빠진** 면 수 — 근평면 잘라내기 뒤에도 남는 것은 «전부 카메라 뒤»뿐이다.
   *  web2-25 1부의 판정자다(실내 시점에서 이 값이 0이어야 한다 — 수리 전에는 2 이상). */
  dropped: number
}

/** 면 하나의 화면 그림자 — 다각형(외곽·개구부)과 그 **평면**(n·x = d). */
interface ScreenFace { n: V3; d: number; outer: Pt[]; holes: Pt[][] }

/** 화면 선분 AB 위에서 CD와 만나는 파라미터 t(끝점은 안 센다 — 자를 자리가 아니다) */
function crossParam(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x, ry = b.y - a.y
  const sx = d.x - c.x, sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = c.x - a.x, qy = c.y - a.y
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  if (!(t > 0 && t < 1) || !(u >= 0 && u <= 1)) return null
  return t
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

/** 굽는다 — **한 번 돈다**. 결과는 2D 폴리라인 목록 + 깃발 하나(지시 1-a ⑤). */
export function bakeUnderlay(
  lift: LiftResult, faces: ResolvedFace[], pose: CamPose, opt: BakeOptions = {},
): BakeResult {
  const coplanarOn = opt.coplanar !== false
  const flip = opt.flipDepth === true
  const nearClipOn = opt.nearClip !== false
  const an = lift.an
  // 같은 평면 조항과 깊이의 «만난다» 여유는 **같은 임계 하나**다(1-c). 면의 평면성
  // 허용과 같은 물음이라 값도 같다(`PLANAR_RATIO` — 새 숫자를 짓지 않는다 #54):
  // 그 두께 안에서 만난 선들로 만든 면이므로, 그보다 엄하게 가리면 자기 면의 모서리가
  // 사라지고 그보다 헐겁게 가리면 실제로 가린 것을 놓친다.
  const tol = C.PLANAR_RATIO * Math.max(geomSize3(lift), 1e-9)

  const sfs: ScreenFace[] = []
  let dropped = 0
  for (const f of faces) {
    // **근평면에서 잘라낸 뒤 사영한다**(web2-25 1-a) — `projectSeg`가 선분에 하는 일의
    // 다각형판이고 `NEAR_Z` 하나를 같이 읽는다(#54). 꼭짓점 하나가 카메라 뒤라고 면을
    // 통째로 버리면 실내 시점에서 좌우 벽·바닥이 전부 빠진다(web2-23의 알려진 한계).
    const poly = (p3: V3[]) => nearClipOn
      ? projectPolyNear(lift.an, pose, p3)
      : faceScreen(lift, pose, p3)             // 반증 손잡이 — web2-23의 동작(자르지 않는다)
    const outer = poly(f.outer)
    if (!outer) { dropped++; continue }        // **전부** 카메라 뒤 — 그 면은 화면에 없다
    const holes: Pt[][] = []
    let ok = true
    for (const h of f.holes) {
      const hp = poly(h)
      // 개구부가 통째로 뒤면 그 자리는 바깥 고리에서도 이미 잘려 나갔다 — 면은 산다.
      // (자르지 않는 옛 갈래에서는 사영이 안 되는 개구부가 면을 통째로 버렸다 — 그대로.)
      if (hp) holes.push(hp)
      else if (!nearClipOn) { ok = false; break }
    }
    if (!ok) { dropped++; continue }
    sfs.push({ n: f.normal, d: dot3(f.normal, f.outer[0]!), outer, holes })
  }

  const segs: UnderlaySeg[] = []
  let pieces = 0
  let lines = 0
  for (const [, seg] of lift.lifted) {
    const scr = projectSeg(an, pose, seg.a3, seg.b3)
    if (!scr) continue                          // 통째로 카메라 뒤(그 규약 그대로 — 1-c)
    const [A, B] = scr
    if (Math.hypot(B.x - A.x, B.y - A.y) < 1e-9) continue
    const dv = sub3(seg.b3, seg.a3)
    if (len3(dv) < 1e-12) continue
    lines++
    const dir = norm3(dv)

    /** 화면 점 m에서 이 선분이 어느 면에 가리는가 — **중점 하나로 조각의 답이 정해진다**
     *  (조각 안에서는 앞뒤가 안 바뀐다: 자를 자리를 이미 다 넣었으므로). */
    const coveredAt = (m: Pt): boolean => {
      const ray = rayThrough(an, pose, m)
      if (!ray) return false
      // 그 화면 점을 사영으로 갖는 **3D 선 위의 점** — 광선과의 최근접점이 곧 그것이다
      // (사영이 상대 좌표라 화면 파라미터와 3D 파라미터가 원근으로 어긋난다 — 그래서
      //  화면에서 선형 보간하지 않는다).
      const P = closestOnLineToRay(seg.a3, dir, ray)
      if (!P) return false
      const tSeg = dot3(sub3(P, ray.o), ray.d)
      if (tSeg <= 0) return false
      for (const sf of sfs) {
        if (!inPoly(m, sf.outer)) continue
        if (sf.holes.some(h => inPoly(m, h))) continue    // 개구부 안은 뚫린 자리다
        // 같은 평면의 면과는 안 잰다(1-c) — 벽의 모서리는 벽 면 **위**에 있어 깊이
        // 비교가 퇴화한다. 이 조항을 빼면 벽 모서리가 자기 벽에 가려 사라진다.
        if (coplanarOn &&
            Math.abs(dot3(sf.n, seg.a3) - sf.d) <= tol &&
            Math.abs(dot3(sf.n, seg.b3) - sf.d) <= tol) continue
        const tF = planeDepth(sf, ray)
        if (!isFinite(tF)) continue
        if (flip ? tSeg < tF - tol : tSeg > tF + tol) return true
      }
      return false
    }

    // ── 자를 자리 — 면 다각형(외곽·개구부)의 변과 만나는 화면 파라미터 전부 ──
    const cuts = [0, 1]
    for (const sf of sfs) {
      for (const ring of [sf.outer, ...sf.holes]) {
        for (let i = 0; i < ring.length; i++) {
          const t = crossParam(A, B, ring[i]!, ring[(i + 1) % ring.length]!)
          if (t !== null) cuts.push(t)
        }
      }
    }
    cuts.sort((x, y) => x - y)

    // ── 조각마다 판정하고 **같은 깃발끼리 잇는다**(폴리라인 목록) ──
    let runFrom = 0
    let runHidden: boolean | null = null
    let runTo = 0
    const push = () => {
      if (runHidden === null) return
      segs.push({ a: lerpPt(A, B, runFrom), b: lerpPt(A, B, runTo), hidden: runHidden })
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i]!, t1 = cuts[i + 1]!
      if (t1 - t0 < 1e-9) continue                       // 겹친 자름 — 조각이 아니다
      pieces++
      const h = coveredAt(lerpPt(A, B, (t0 + t1) / 2))
      if (runHidden === null) { runFrom = t0; runHidden = h }
      else if (h !== runHidden) { push(); runFrom = t0; runHidden = h }
      runTo = t1
    }
    push()
  }
  return { segs, faces: sfs.length, lines, pieces, dropped }
}
