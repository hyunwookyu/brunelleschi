// web2-42 1번·2번 — **일곱 개의 이름 붙은 뷰와 평행 투영.**
//
// ⚠⚠ **이 파일의 요점은 「평행인가」를 무엇으로 재는가다**(PITFALLS #92).
//     `pose.proj`가 붙었는지를 세면 그것은 **이름표**이고, 이름표를 바꿔도 그림이 안
//     바뀌면 아무것도 잰 것이 아니다. 그래서 여기서는 **결과의 자리**로 잰다 —
//     같은 3D 선분 넷을 깊이만 달리해 놓고 **재사영**해서
//
//        · `spreadDeg`  화면 방향의 최대 차   평행이면 0 (평행선은 평행하게 찍힌다)
//        · `lenRatio`   화면 길이의 최대/최소  평행이면 1 (멀어도 안 작아진다)
//
//     를 낸다. 그리고 **같은 자세에서 이름표만 뗀 위약 판**(w=0)이 그 둘을 실제로
//     움직이는 것을 나란히 낸다(D-3 — 못 실패시키는 검사는 안 잰다).
//
// 원장: LEDGER=1 npx vitest run test/view42.test.ts  →  stage0/out/view42_web2.json

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyze, project, screenAxes, projW, isParallel, horizonScreenY, vpMarks, DRAW_POSE,
  type Analysis, type AxisId,
} from '../src/core/camera'
import {
  cubeBasis, cubeGeom, cubeHit, poseForElem, poseForOrient, orientIn, turnOrient,
  parallelAllowed, parallelPose, perspectivePose, viewName, cubeLayoutFor,
  type ViewName,
} from '../src/core/viewcube'
import { lerpPose, levelPose } from '../src/core/level'
import { createAutoLevel } from '../src/app/autolevel'
import {
  createApp, setPose, orbitPivot, orbitBy, dollyBy, panBy, undo, parallelPxPerUnit,
  beginErase, eraseAt, endErase, commitStroke, zoomFit, type App,
} from '../src/app/state'
import { session } from './session'
import { liftAll } from '../src/core/lift'
import { constructedDoc, W, H } from './fixtures'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { C, TURN_ANIM_MS, CUBE_ALIGN_MAX_DEG, VIEW_NAME_ALIGN_RAD, ORBIT_RAD_PER_PX } from '../src/core/constants'
import { v3, add3, sub3, mul3, norm3, dot3, cross3, quatRotate, type V3 } from '../src/core/vec'
import type { CamPose } from '../src/core/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEG = 180 / Math.PI
const r6 = (x: number) => Number(x.toFixed(6))
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))
const ledger: Record<string, unknown> = {}

const an2 = analyze(constructedDoc().doc)
const BASIS = cubeBasis(an2)!

const fwdOf = (p: CamPose): V3 => quatRotate(p.q, v3(0, 0, -1))
const backOf = (p: CamPose): V3 => quatRotate(p.q, v3(0, 0, 1))
const angDeg = (a: V3, b: V3) => Math.acos(clamp1(dot3(norm3(a), norm3(b)))) * DEG

// ── 「평행인가」를 결과의 자리에서 재는 자 ──────────────────────────────────
/** 같은 방향·같은 길이의 선분 넷을 **깊이를 달리해** 놓고 재사영한다.
 *  방향은 큐브 세 축의 합(대각)이라 **어느 면에서도 퇴화하지 않는다** — 축 하나를 쓰면
 *  그 축을 마주 보는 면에서 점으로 찍혀 각·길이가 정의되지 않는다. */
function parallelMeasure(an: Analysis, pose: CamPose, pivot: V3) {
  const d = norm3(add3(add3(BASIS.X, BASIS.Y), BASIS.Z))
  const fwd = fwdOf(pose)
  const D = Math.max(1, dot3(sub3(pivot, pose.p), fwd))
  const L = D * 0.2                       // 선분 길이 — 화면에서 재는 크기
  const step = D * 0.25                   // 깊이 간격 — 원근이면 이만큼 크기가 갈린다
  // 옆으로 벌리는 방향은 **카메라 오른쪽**이다 — `cross(fwd, 세로축)`은 평면·저면에서
  // 퇴화한다(시선이 세로축과 나란하다). 그 퇴화가 실제로 팔을 죽였다(첫 실행 0.34°).
  const side = quatRotate(pose.q, v3(1, 0, 0))
  const dirs: number[] = []
  const lens: number[] = []
  for (let k = 0; k < 4; k++) {
    const base = add3(add3(pivot, mul3(fwd, (k - 1.5) * step)), mul3(side, (k - 1.5) * L * 0.1))
    const a = project(an, pose, base)
    const b = project(an, pose, add3(base, mul3(d, L)))
    if (!a || !b) continue
    dirs.push(Math.atan2(b.y - a.y, b.x - a.x) * DEG)
    lens.push(Math.hypot(b.x - a.x, b.y - a.y))
  }
  const wrap = (x: number) => { let v = x % 180; if (v > 90) v -= 180; if (v < -90) v += 180; return v }
  let spread = 0
  for (const p of dirs) for (const q of dirs) spread = Math.max(spread, Math.abs(wrap(p - q)))
  return {
    n: dirs.length,
    spreadDeg: spread,
    lenRatio: lens.length ? Math.max(...lens) / Math.min(...lens) : NaN,
  }
}

/** 픽스처 앱 — 2점 작도가 끝난 상태(획 셋). 궤도·줌이 서려면 3D가 있어야 한다. */
function app2(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(500, 500, 600, 475)       // 깊이1 → vp0
  s.draw(500, 500, 400, 475)       // 깊이2 → vp1
  s.draw(500, 500, 500, 380)       // 세로(기둥) — 돌 것이 생긴다
  s.draw(500, 380, 600, 362)
  return s.app
}

const FACES: { n: ViewName; dir: V3 }[] = [
  { n: '정면', dir: v3(-1, 0, 0) },
  { n: '후면', dir: v3(1, 0, 0) },
  { n: '평면', dir: v3(0, 1, 0) },
  { n: '저면', dir: v3(0, -1, 0) },
  { n: '우측면', dir: v3(0, 0, 1) },
  { n: '좌측면', dir: v3(0, 0, -1) },
]

/** 그 면의 **평행 뷰** 포즈 — 앱이 `input.ts`에서 만드는 것과 같은 순서다. */
function facePose(app: App, f: { dir: V3 }): { pose: CamPose; pivot: V3 } {
  const pivot = orbitPivot(app)
  const dist = Math.max(1, Math.hypot(
    app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z))
  const p = poseForElem(app.lift.an, { kind: 'face', dirLocal: f.dir }, pivot, dist)!
  return { pose: parallelPose(p, pivot), pivot }
}

// ══════════════════════════════════════════════════════════════════════════
describe('42-1 ① 여섯 면 — 투영이 평행이고 자세가 그 면이다', () => {
  it('여섯 면 전부에서 평행이고(수치) 이름이 그 면이며, 이름표를 떼면 그 수치가 움직인다', () => {
    const app = app2()
    const an = app.lift.an
    const rows: Record<string, unknown>[] = []
    for (const f of FACES) {
      const { pose, pivot } = facePose(app, f)
      const par = parallelMeasure(an, pose, pivot)
      // **위약 판**(D-3) — 같은 자세에서 이름표만 뗀다. 이 판이 안 움직이면 위 수치는
      // 아무것도 안 잰 것이다.
      const persp = parallelMeasure(an, perspectivePose(pose), pivot)
      const back = backOf(pose)
      const axisWorld = norm3(add3(add3(
        mul3(BASIS.X, f.dir.x), mul3(BASIS.Y, f.dir.y)), mul3(BASIS.Z, f.dir.z)))
      rows.push({
        name: f.n,
        view_name: viewName(an, pose),
        align_deg: r6(angDeg(back, axisWorld)),
        parallel: { n: par.n, spread_deg: r6(par.spreadDeg), len_ratio: r6(par.lenRatio) },
        falsify_perspective: { n: persp.n, spread_deg: r6(persp.spreadDeg), len_ratio: r6(persp.lenRatio) },
        w: projW(pose),
        D: r6(pose.proj!.D),
      })
      // 게이트 — 평행이다(방향이 안 벌어지고 길이가 안 줄어든다)
      expect(par.n, '넷 다 사영돼야 잰 것이다').toBe(4)
      expect(par.spreadDeg, `${f.n} — 평행선이 평행하게 찍힌다`).toBeLessThan(1e-9)
      expect(Math.abs(par.lenRatio - 1), `${f.n} — 깊이가 크기를 안 바꾼다`).toBeLessThan(1e-9)
      // 게이트 — 자세가 그 면이다
      expect(angDeg(back, axisWorld)).toBeLessThan(CUBE_ALIGN_MAX_DEG)
      expect(viewName(an, pose)).toBe(f.n)
      // 반증 — 같은 자세·원근이면 둘 다 움직인다
      expect(persp.spreadDeg, `${f.n} 위약 — 원근이면 벌어진다`).toBeGreaterThan(1)
      expect(persp.lenRatio, `${f.n} 위약 — 원근이면 멀수록 작다`).toBeGreaterThan(1.5)
    }
    ledger['gate1_six_faces'] = {
      what: '여섯 면 각각에서 ① 평행인가(재사영으로) ② 자세가 그 면인가 ③ 이름이 그 면인가',
      how: '같은 3D 방향의 선분 넷을 깊이만 달리해 재사영 — 방향 최대 차(도)와 길이 최대/최소',
      // 도달 가능성이 가리키는 자리 — **한 경로로 풀리게** 따로 낸다(#40: `rows[*]`는 안 풀린다)
      falsify_perspective_spread_deg: rows.map(r => (r.falsify_perspective as { spread_deg: number }).spread_deg),
      rows,
    }
  })
})

describe('42-1 ② 가운데 = 「투시」 — 원근으로 돌아온다', () => {
  it('가운데를 짚으면 center이고, 그 자리는 자세를 안 바꾸고 투영만 되돌린다', () => {
    const app = app2()
    const { pose, pivot } = facePose(app, FACES[0]!)
    setPose(app, pose)
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)!
    const hit = cubeHit(geom, { x: app.cubeLayout.cx, y: app.cubeLayout.cy })!
    expect(hit.kind).toBe('center')
    expect(poseForElem(app.lift.an, hit, pivot, 500), '가운데는 자세를 안 낸다').toBeNull()
    const back = perspectivePose(app.pose)
    expect(back.p).toEqual(app.pose.p)          // 자세 그대로
    expect(back.q).toEqual(app.pose.q)
    expect(back.proj).toBeUndefined()
    expect(isParallel(back)).toBe(false)
    expect(viewName(app.lift.an, back)).toBe('투시')
    const par = parallelMeasure(app.lift.an, app.pose, pivot)
    const per = parallelMeasure(app.lift.an, back, pivot)
    expect(par.spreadDeg).toBeLessThan(1e-9)
    expect(per.spreadDeg).toBeGreaterThan(1)
    // 이미 원근이면 **같은 객체**를 돌려준다(구성상 항등 — 전환할 것이 없다)
    expect(perspectivePose(back)).toBe(back)
    ledger['gate2_center_perspective'] = {
      what: '가운데 = 투시. 자세 불변 · 투영만 원근 · 이름 「투시」',
      hit_kind: hit.kind,
      center_radius_px: app.cubeLayout.size * C.CUBE_CENTER_R,
      parallel_spread_deg: r6(par.spreadDeg),
      perspective_spread_deg: r6(per.spreadDeg),
      identity_when_already_perspective: true,
    }
  })
})

describe('42-1 ③ 손으로 돌려도 평행이 유지되고 이름이 「축측」이 된다', () => {
  it('궤도·줌·팬·90°·접기 — 다섯 경로 전부에서 평행이 남는다', () => {
    const app = app2()
    const { pose, pivot } = facePose(app, FACES[0]!)
    setPose(app, pose)
    expect(viewName(app.lift.an, app.pose)).toBe('정면')

    // ── 궤도 한 픽셀 — 평행은 유지되고 이름은 축측이 된다 ──────────────────
    orbitBy(app, 1, 0)
    const afterOrbit1 = { parallel: isParallel(app.pose), name: viewName(app.lift.an, app.pose) }
    expect(afterOrbit1.parallel, '평행이 유지된다(투시로 안 돌아간다)').toBe(true)
    expect(afterOrbit1.name, '축에서 벗어나면 축측이다').toBe('축측')

    orbitBy(app, 40, 25)
    const m = parallelMeasure(app.lift.an, app.pose, orbitPivot(app))
    expect(m.spreadDeg, '축측도 평행이다 — 그것이 축측의 정의다').toBeLessThan(1e-9)
    expect(Math.abs(m.lenRatio - 1)).toBeLessThan(1e-9)
    expect(viewName(app.lift.an, app.pose)).toBe('축측')

    // ── 줌 — 배율이 D로 들어간다(눈만 옮기면 평행에서 아무 일도 안 난다) ────
    const D0 = app.pose.proj!.D
    const px0 = parallelPxPerUnit(app)!
    dollyBy(app, 2, { x: 600, y: 400 })
    // ⚠ **그 자리에서 받아 둔다** — 아래에서 팬·돋보기가 D를 또 움직이므로, 원장을 쓰는
    //   시점에 다시 계산하면 그 수는 「줌이 만든 비」가 아니다(#25의 형태).
    const dollyRatio = parallelPxPerUnit(app)! / px0
    expect(isParallel(app.pose)).toBe(true)
    expect(app.pose.proj!.D).toBeCloseTo(D0 / 2, 9)
    expect(dollyRatio).toBeCloseTo(2, 6)
    // **D의 정의가 계속 성립한다** — 눈에서 pivot까지의 축방향 거리
    const pv = orbitPivot(app)
    expect(dot3(sub3(pv, app.pose.p), fwdOf(app.pose))).toBeCloseTo(app.pose.proj!.D, 6)

    // ── 팬 — 시선에 수직이라 D가 안 변한다 ──────────────────────────────
    const D1 = app.pose.proj!.D
    panBy(app, 30, -20)
    expect(isParallel(app.pose)).toBe(true)
    expect(app.pose.proj!.D).toBe(D1)
    expect(dot3(sub3(orbitPivot(app), app.pose.p), fwdOf(app.pose))).toBeCloseTo(D1, 6)

    // ── 90° 화살표 — `input.ts`가 하는 그대로(자세만 갈고 투영을 들고 간다) ──
    const basis = cubeBasis(app.lift.an)!
    const turned = poseForOrient(basis, turnOrient(orientIn(basis, app.pose), 'right'), pv, 500)
    const carried: CamPose = { ...turned, proj: { ...app.pose.proj! } }
    expect(isParallel(carried)).toBe(true)
    expect(parallelMeasure(app.lift.an, carried, pv).spreadDeg).toBeLessThan(1e-9)

    // ── 접기 — `levelPose`가 투영을 들고 간다 ──────────────────────────
    const folded = levelPose(app.pose, app.pose, pv)
    expect(folded.proj).toEqual(app.pose.proj)

    // ── 돋보기 — 평행에서는 **기준 깊이가 그 거리로 간다** ────────────────────
    // 평행에서 눈만 옮기면 상이 한 톨도 안 바뀐다 — D를 안 옮기면 돋보기가 조용히 죽는다.
    // 그래서 재는 것은 D 자체가 아니라 **화면이 채워졌는가**다(#92: 결과의 자리).
    // ⚠ 여기서 D의 기준면은 pivot이 아니라 **돋보기가 잡은 대상의 중심**이다 — 그 둘은
    //   다른 점이고(pivot은 잉크 bbox 중심), 배율의 기준면은 «맞춘 대상»이 맞다.
    const fill = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const g of app.lift.lifted.values()) for (const p3 of [g.a3, g.b3]) {
        const q = project(app.lift.an, app.pose, p3)
        if (!q) continue
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
      }
      return { w: (x1 - x0) / W, h: (y1 - y0) / H }
    }
    const fillBefore = fill()
    const Dbefore = app.pose.proj!.D
    const zf = zoomFit(app, { W, H })
    const fillAfter = fill()
    const zoomed = {
      mode: zf.mode, parallel: isParallel(app.pose),
      D_before: r6(Dbefore), D_after: r6(app.pose.proj?.D ?? NaN),
      fill_before: { w: r6(fillBefore.w), h: r6(fillBefore.h) },
      fill_after: { w: r6(fillAfter.w), h: r6(fillAfter.h) },
    }
    expect(zoomed.parallel, '돋보기가 평행을 안 버린다').toBe(true)
    expect(app.pose.proj!.D, '기준 깊이가 실제로 움직인다').not.toBe(Dbefore)
    // 한 축이 화면을 채운다(여백 규약 안) — 눈만 옮겼으면 이 값이 안 움직인다
    expect(Math.max(fillAfter.w, fillAfter.h)).toBeGreaterThan(0.5)
    expect(Math.max(fillAfter.w, fillAfter.h)).toBeLessThanOrEqual(1.0)

    ledger['gate3_hand_rotate'] = {
      zoom_fit: zoomed,
      what: '정투상 뷰에서 손으로 돌리면 평행이 유지되고 이름이 축측이 된다 — 다섯 경로',
      orbit_1px: afterOrbit1,
      orbit_1px_rad: ORBIT_RAD_PER_PX,
      name_tolerance_rad: VIEW_NAME_ALIGN_RAD,
      axonometric: { spread_deg: r6(m.spreadDeg), len_ratio: r6(m.lenRatio) },
      dolly: { D_before: r6(D0), D_after: r6(D0 / 2), px_per_unit_ratio: r6(dollyRatio) },
      pan_keeps_D: true,
      turn_keeps_parallel: true,
      fold_keeps_parallel: true,
    }
  })

  it('이름의 허용 각은 궤도 반 픽셀이다 — 한 픽셀은 넘고 부동소수 잡음은 안 넘는다', () => {
    const app = app2()
    const { pose } = facePose(app, FACES[0]!)
    setPose(app, pose)
    // 부동소수 잡음 급(1e-9 rad)으로는 안 바뀐다
    const tiny = 1e-9 / ORBIT_RAD_PER_PX
    orbitBy(app, tiny, 0)
    expect(viewName(app.lift.an, app.pose)).toBe('정면')
    orbitBy(app, 1, 0)
    expect(viewName(app.lift.an, app.pose)).toBe('축측')
    ledger['gate3_name_threshold'] = {
      tolerance_rad: VIEW_NAME_ALIGN_RAD,
      one_orbit_px_rad: ORBIT_RAD_PER_PX,
      noise_px: tiny,
      note: '허용 각은 궤도 반 픽셀이다 — 숫자를 새로 안 짓고 ORBIT_RAD_PER_PX에서 유도한다(#88)',
    }
  })
})

describe('42-1 ④ 전환은 보간한다 — 31-1과 같은 길이', () => {
  it('중간 프레임의 평행도가 0과 1 사이이고 그 사이도 정당한 사영이며, 끝에서 정확히 1이다', () => {
    const app = app2()
    const { pose, pivot } = facePose(app, FACES[0]!)
    const from = perspectivePose(pose)
    const mid = lerpPose(from, pose, 0.5)
    expect(projW(mid)).toBeCloseTo(0.5, 12)
    expect(mid.proj!.D).toBe(pose.proj!.D)   // 한쪽만 있으면 그 값을 그대로 쓴다
    const m0 = parallelMeasure(app.lift.an, from, pivot)
    const mm = parallelMeasure(app.lift.an, mid, pivot)
    const m1 = parallelMeasure(app.lift.an, pose, pivot)
    // 사이 값은 **중간**이다 — 튀지 않는다(그것이 「보간한다」의 내용이다)
    expect(mm.spreadDeg).toBeLessThan(m0.spreadDeg)
    expect(mm.spreadDeg).toBeGreaterThan(m1.spreadDeg)
    expect(mm.lenRatio).toBeLessThan(m0.lenRatio)
    expect(mm.lenRatio).toBeGreaterThan(m1.lenRatio)
    expect(mm.n, '사이 값에서도 넷 다 사영된다 — 정당한 카메라다').toBe(4)

    // 앱이 실제로 도는 경로(autolevel의 anim 슬롯) — 가짜 시계로 프레임을 민다
    let t = 1000
    const lv = createAutoLevel(app, () => t)
    setPose(app, from)
    lv.glide(pose)
    t += TURN_ANIM_MS / 2
    lv.tick()
    const wMid = projW(app.pose)
    t += TURN_ANIM_MS / 2 + 1
    lv.tick()
    expect(projW(app.pose), '끝에서 정확히 평행이다').toBe(1)
    expect(app.pose.proj!.D).toBe(pose.proj!.D)
    expect(wMid).toBeGreaterThan(0)
    expect(wMid).toBeLessThan(1)
    ledger['gate4_interpolation'] = {
      what: '원근 → 평행 전환의 중간 프레임 — 평행도와 그때의 재사영 지표',
      anim_ms: TURN_ANIM_MS,
      w_mid_frame: r6(wMid),
      spread_deg: { perspective: r6(m0.spreadDeg), mid: r6(mm.spreadDeg), parallel: r6(m1.spreadDeg) },
      len_ratio: { perspective: r6(m0.lenRatio), mid: r6(mm.lenRatio), parallel: r6(m1.lenRatio) },
      note: '사이 값도 «눈을 뒤로 빼며 조인» 원근이라 넷 다 사영된다(camera.ts projDen 주석)',
    }
  })
})

describe('42-1 ⑤ 평행에는 소실점도 지평선도 없다', () => {
  it('✕ 표식이 사라지고 지평선이 null이 된다 — 그리고 원근으로 돌아오면 되살아난다', () => {
    const app = app2()
    const { pose } = facePose(app, FACES[0]!)
    const per = perspectivePose(pose)
    const marksPar = vpMarks(app.lift.an, pose).length
    const marksPer = vpMarks(app.lift.an, per).length
    const axesPar = screenAxes(app.lift.an, pose)
    expect(marksPar, '평행에는 소실점이 없다').toBe(0)
    expect(axesPar.every(a => a.vp === null && a.dir !== null), '모든 축이 무한원이다').toBe(true)
    expect(horizonScreenY(app.lift.an, pose)).toBeNull()
    expect(horizonScreenY(app.lift.an, DRAW_POSE)).toBe(app.lift.an.principal!.y)
    ledger['gate5_no_vp'] = {
      vp_marks_parallel: marksPar,
      vp_marks_perspective: marksPer,
      horizon_parallel: horizonScreenY(app.lift.an, pose),
      horizon_draw_pose: horizonScreenY(app.lift.an, DRAW_POSE),
      axes_all_directional: true,
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('42-2 ① 카메라 확정 전에는 여섯 면이 잠긴다', () => {
  it('확정 전에는 평행이 안 허용되고 큐브 자체가 없다 — 그 자리를 실제로 짚어도 아무 일이 없다', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)      // 지평선만 — 소실점 0
    const layout = cubeLayoutFor(W)
    const before = { ...s.app.pose }
    expect(parallelAllowed(s.app.lift.an), '31-2와 같은 조건이다').toBe(false)
    expect(cubeGeom(s.app.lift.an, s.app.pose, layout), '큐브가 아예 없다').toBeNull()

    // 소실점 하나 — 아직 확정이 아니다(가로선 선언도 없다)
    s.draw(500, 500, 600, 475)
    expect(s.app.lift.an.vps.length).toBe(1)
    expect(parallelAllowed(s.app.lift.an)).toBe(false)
    expect(cubeGeom(s.app.lift.an, s.app.pose, layout)).toBeNull()
    expect(s.app.pose).toEqual(before)
    expect(isParallel(s.app.pose)).toBe(false)

    // 둘째 소실점 — 여기서 열린다
    s.draw(500, 500, 400, 475)
    expect(s.app.lift.an.constructionDone).toBe(true)
    expect(parallelAllowed(s.app.lift.an)).toBe(true)
    expect(cubeGeom(s.app.lift.an, s.app.pose, layout)).not.toBeNull()
    ledger['gate6_locked_before_confirm'] = {
      what: '확정 전에는 평행이 잠긴다 — 조건은 31-2(렌즈)와 **같은 술어**(lensAllowed)',
      vps0: { allowed: false, cube: null },
      vps1: { allowed: false, cube: null },
      vps2: { allowed: true, cube: 'geom' },
      note: '문이 둘이 아니다 — `cubeGeom`이 null이면 면을 짚을 길 자체가 없고, 그 위에 술어가 한 겹 더 있다',
    }
  })
})

describe('42-2 ② 평행에서 그은 획이 정상적으로 자립한다 — 37-1의 조합 표', () => {
  /** 37-1 표의 네 줄을 그대로 돈다. 좌표는 **지금 포즈로 재사영해서** 만든다 —
   *  그래야 「그 화면에서 그 점을 짚었다」가 된다(원근이든 평행이든 같은 손짓이다). */
  function runTable(pose: CamPose) {
    const rows: Record<string, unknown>[] = []
    const mk = () => {
      const s = session(W, H)
      s.draw(100, 400, 1100, 400)
      s.draw(500, 500, 600, 475)
      s.draw(500, 500, 400, 475)
      s.draw(500, 500, 500, 380)      // 세로
      s.draw(700, 550, 700, 430)      // 세로 둘째
      s.draw(500, 380, 700, 430)      // 잇는 선
      setPose(s.app, pose)
      return s
    }
    const probe = mk()
    const an = probe.app.lift.an
    const segs = [...probe.app.lift.lifted.values()]
    const P = (p: V3) => project(an, pose, p)
    // 사영되는 끝점 둘 — 「명시 점」의 재료다
    const pts = segs.flatMap(g => [g.a3, g.b3]).filter(p => P(p) !== null)
    // 화면에서 퇴화하지 않는 축 하나 — **앱에서 읽는다**(#88: 방향을 손으로 안 적는다)
    const ax = screenAxes(an, pose).find(a => a.dir && Math.hypot(a.dir.x, a.dir.y) > 0.2)
      ?? screenAxes(an, pose).find(a => a.vp !== null)!
    /** 화면에서 **가장 멀리 떨어진** 승격 점 둘 — 그 뷰에서 퇴화하지 않는 짝이다.
     *  (정면에서 vp0 축 선분은 점으로 찍힌다 — 첫 짝을 그냥 쓰면 길이 0 획이 된다.) */
    function farPair(): [{ x: number; y: number }, { x: number; y: number }] {
      let best: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
      let bd = -1
      const sp = pts.map(p => P(p)!).filter(Boolean)
      for (const a of sp) for (const b of sp) {
        const d = Math.hypot(b.x - a.x, b.y - a.y)
        if (d > bd) { bd = d; best = [a, b] }
      }
      return best
    }

    // ㉠ 명시 점 2 — 끝점 둘을 물린다
    {
      const s = mk()
      const [a, b] = farPair()
      const st = s.draw(a.x, a.y, b.x, b.y)
      const g = st ? s.app.lift.lifted.get(st.id) : undefined
      rows.push({ row: '명시 점 2', lifted: !!g, waiting: s.app.lift.waiting.length })
    }
    // ㉡ 명시 점 1 + 축 — 끝점 하나에서 그 축 방향으로 뻗는다
    {
      const s = mk()
      const a = farPair()[0]
      const dir = ax.dir ? { x: ax.dir.x, y: ax.dir.y } : { x: ax.vp!.x - a.x, y: ax.vp!.y - a.y }
      const n = Math.hypot(dir.x, dir.y)
      const b = { x: a.x + dir.x / n * 180, y: a.y + dir.y / n * 180 }
      const st = s.draw(a.x, a.y, b.x, b.y)
      const g = st ? s.app.lift.lifted.get(st.id) : undefined
      rows.push({ row: '명시 점 1 + 축', lifted: !!g, axis: st ? s.app.lift.lifted.get(st.id)?.axis ?? null : null })
    }
    // ㉢ 허공 + 축 없음 + 교차 없음 → **대기**(자립하면 그것이 조용히 틀린 배치다)
    {
      const s = mk()
      const st = s.draw(60, 720, 150, 690)
      const g = st ? s.app.lift.lifted.get(st.id) : undefined
      rows.push({ row: '허공 · 축 없음', lifted: !!g, waiting_has_it: st ? s.app.lift.waiting.includes(st.id) : false })
    }
    // ㉣ 원칙 d — 자립한 획의 재사영이 확정 2D와 같다
    {
      const s = mk()
      const [a, b] = farPair()
      const st = s.draw(a.x, a.y, b.x, b.y)!
      const g = s.app.lift.lifted.get(st.id)
      let err = NaN
      if (g) {
        const ra = project(s.app.lift.an, pose, g.a3)!, rb = project(s.app.lift.an, pose, g.b3)!
        err = Math.max(Math.hypot(ra.x - st.a.x, ra.y - st.a.y), Math.hypot(rb.x - st.b.x, rb.y - st.b.y))
      }
      rows.push({ row: '원칙 d 재사영 오차 px', reproject_err_px: r6(err) })
    }
    return rows
  }

  it('여섯 면 전부에서 표가 원근과 같은 답을 낸다 — 그리고 재사영이 확정 2D와 같다', () => {
    const app = app2()
    const persp = runTable(perspectivePose(facePose(app, FACES[0]!).pose))
    const table: Record<string, unknown> = { 원근_정면: persp }
    for (const f of FACES) {
      const { pose } = facePose(app, f)
      const rows = runTable(pose)
      table[f.n] = rows
      expect((rows[0] as any).lifted, `${f.n} — 명시 점 2는 자립한다`).toBe(true)
      expect((rows[1] as any).lifted, `${f.n} — 명시 점 1 + 축은 자립한다`).toBe(true)
      expect((rows[2] as any).lifted, `${f.n} — 허공·축 없음은 대기다(조용히 놓지 않는다)`).toBe(false)
      expect((rows[3] as any).reproject_err_px, `${f.n} — 원칙 d`).toBeLessThan(0.01)
      // 원근과 **같은 답**이다 — 그것이 「평행에서도 작도가 된다」의 내용이다
      for (let i = 0; i < 3; i++) {
        expect((rows[i] as any).lifted, `${f.n} ${i} — 원근과 같은 칸`).toBe((persp[i] as any).lifted)
      }
    }
    ledger['gate7_table_in_parallel'] = {
      what: '37-1 조합 표를 **여섯 면 전부**에서 돌렸다(한 자세만 돌면 #12에 걸린다)',
      table,
    }
  })
})

describe('42-2 ③ 평행 ↔ 원근을 오가도 3D 좌표가 안 변한다', () => {
  it('좌표 전수 비교 — 왕복 뒤 비트 단위로 같다', () => {
    const app = app2()
    const dump = () => [...app.lift.lifted.entries()].sort((a, b) => a[0] - b[0])
      .map(([id, g]) => [id, g.a3.x, g.a3.y, g.a3.z, g.b3.x, g.b3.y, g.b3.z, g.axis])
    const before = JSON.stringify(dump())
    const { pose } = facePose(app, FACES[2]!)
    setPose(app, pose)
    const inParallel = JSON.stringify(dump())
    orbitBy(app, 20, 12)
    dollyBy(app, 1.5, { x: 600, y: 400 })
    const afterMoves = JSON.stringify(dump())
    setPose(app, perspectivePose(app.pose))
    const after = JSON.stringify(dump())
    expect(inParallel).toBe(before)
    expect(afterMoves).toBe(before)
    expect(after).toBe(before)
    ledger['gate8_coords_unchanged'] = {
      what: '평행 ↔ 원근 · 그 사이의 궤도·줌 — 승격 좌표 전수 대조',
      n_segments: app.lift.lifted.size,
      identical: true,
      note: '리프팅은 획이 그려진 그 시점(`s.view`)만 보고 «지금 어떻게 보는가»를 안 본다',
    }
  })
})

describe('42-2 ④ 확정이 풀리거나 승격이 일어나면 원근으로 돌아온다', () => {
  it('확정은 앱 안에서 **안 풀린다** — 그 갈래는 렌즈(31-2)와 같은 성질의 안전망이다', () => {
    // ⚠⚠ **도달 가능성을 먼저 잰다**(#40): 「확정이 풀리면 원근으로」는 실제로 못 걷는 길이다.
    //    ㉠ 되돌리기는 작도 획을 안 건드린다(`undoOrExplain` — 스택에 내용 획만 실린다)
    //    ㉡ 지우개도 못 지운다(`eraseAt`: 「작도 획은 지우개가 못 지운다 — 카메라는 별개다」)
    //    ㉢ 남는 길은 비우기뿐이고 그것은 **포즈 자체를** 작도 포즈로 되돌린다.
    //    그래서 이 조항은 **31-2의 `!lensAllowed`와 정확히 같은 성질**이다(같은 줄이다 — #54).
    const app = app2()
    const { pose } = facePose(app, FACES[0]!)
    setPose(app, pose)
    const stack = app.undoStack.length
    for (let i = 0; i < 5; i++) undo(app)
    const afterUndo = { vps: app.lift.an.vps.length, done: app.lift.an.constructionDone }
    expect(afterUndo.done, '되돌리기는 카메라를 안 푼다').toBe(true)

    const app2b = app2()
    setPose(app2b, facePose(app2b, FACES[0]!).pose)
    const vpId = [...app2b.lift.lifted.keys()].find(id => app2b.lift.an.roles.get(id) === 'vp')!
    const g = app2b.lift.lifted.get(vpId)!
    beginErase(app2b)
    for (const t of [0.25, 0.5, 0.75]) {
      const mid = project(app2b.lift.an, app2b.pose, {
        x: g.a3.x + (g.b3.x - g.a3.x) * t, y: g.a3.y + (g.b3.y - g.a3.y) * t, z: g.a3.z + (g.b3.z - g.a3.z) * t,
      })
      if (mid) eraseAt(app2b, mid)
    }
    endErase(app2b)
    expect(app2b.lift.an.constructionDone, '지우개도 작도 획을 안 지운다').toBe(true)
    expect(isParallel(app2b.pose)).toBe(true)

    // 기제만 확인한다 — **합성 상태**로 「확정이 없어졌다」를 만들고 그 갈래를 돌린다.
    const syn = app2()
    setPose(syn, facePose(syn, FACES[0]!).pose)
    expect(isParallel(syn.pose)).toBe(true)
    syn.doc = { ...syn.doc, strokes: syn.doc.strokes.slice(0, 1) }   // 지평선만 남긴다
    commitStroke(syn, { x: 200, y: 700 }, { x: 260, y: 690 })        // recompute를 태운다
    expect(parallelAllowed(syn.lift.an)).toBe(false)
    expect(isParallel(syn.pose), '확정이 없으면 평행으로 볼 자격이 없다').toBe(false)

    ledger['gate9_drop_on_unconfirm'] = {
      what: '「확정이 풀리면 원근으로」 — **앱에서 도달 불가**임을 먼저 재고, 기제만 합성으로 확인한다',
      undo_stack_depth: stack,
      after_5_undo: afterUndo,
      eraser_refuses_construction: true,
      reachability: (
        '되돌리기는 작도 획을 안 싣고(`undoOrExplain`) 지우개는 작도 획을 거부한다(`eraseAt`). '
        + '남는 길은 비우기뿐이고 그것은 포즈를 작도 포즈로 되돌린다 — 즉 이 조항은 **안전망**이다. '
        + '31-2의 `!lensAllowed`가 같은 성질이고 **같은 줄에 있다**(#54: 조건을 새로 안 지었다).'
      ),
      synthetic: { parallel_after: false, allowed_after: false },
    }
  })

  it('차수 승격(셋째 소실점)이 일어나면 평행이 버려진다 — **기제**를 잰다', () => {
    // ⚠⚠ **이 자리는 앱에서 도달 불가다**(D-4의 형태로 적는다): `analyze`가
    //    「작도는 작도 포즈에서만 — 궤도 후의 획은 전부 내용이다」이므로 평행 뷰에서 그은
    //    획은 소실점을 못 만든다. 즉 **평행에 있는 동안 승격이 일어날 길이 없다.**
    //    그래도 기제는 서 있어야 한다(카메라 서명이 움직이면 버린다) — 그래서 여기서는
    //    **작도 포즈에 평행을 얹은 합성 상태**로 그 갈래를 실제로 돌린다.
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380)
    expect(s.app.lift.an.vps.length).toBe(2)
    s.app.pose = { p: { ...DRAW_POSE.p }, q: { ...DRAW_POSE.q }, proj: { w: 1, D: 500 } }
    expect(isParallel(s.app.pose)).toBe(true)
    const sig0 = s.app.lensSig
    s.draw(300, 400, 300, 400)        // 지평선 위 찍기 = 셋째 소실점
    expect(s.app.lift.an.vps.length, '승격이 실제로 일어났다').toBe(3)
    expect(s.app.lensSig).not.toBe(sig0)
    expect(isParallel(s.app.pose), '승격 뒤에는 원근이다').toBe(false)
    ledger['gate9_drop_on_promotion'] = {
      what: '차수 승격(소실점 개수 변화) → 평행을 버린다. **렌즈를 버리는 그 사건과 같은 서명**이다(#54)',
      vps: 3,
      unreachable_in_app: (
        '평행 뷰에서 그은 획은 `analyze`가 내용으로 돌린다(「작도는 작도 포즈에서만」) — '
        + '그래서 **평행에 있는 동안 승격이 일어날 길이 실제로는 없다.** 여기서 재는 것은 기제다.'
      ),
    }
  })
})

describe('42-2 ⑤ 저장·복원이 투영을 들고 간다', () => {
  it('평행 뷰에서 그은 획의 `view.proj`가 왕복에서 살아남고, 옛 파일은 그대로 원근이다', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380)
    const app = s.app
    const { pose } = facePose(app, FACES[0]!)
    setPose(app, pose)
    const before = app.lift.lifted.size
    // 평행 뷰에서 한 획 — 끝점 둘을 물린다
    // 화면에서 **가장 멀리 떨어진** 승격 점 둘 — 정면에서는 vp0 축 선분이 점으로 찍히므로
    // 첫 짝을 그냥 쓰면 길이 0 획이 된다(실측으로 걸렸다).
    const sp = [...app.lift.lifted.values()].flatMap(g => [g.a3, g.b3])
      .map(p3 => project(app.lift.an, pose, p3)).filter((x): x is NonNullable<typeof x> => !!x)
    let a = sp[0]!, b = sp[1]!, bd = -1
    for (const u of sp) for (const v of sp) {
      const d = Math.hypot(v.x - u.x, v.y - u.y)
      if (d > bd) { bd = d; a = u; b = v }
    }
    const st = s.draw(a.x, a.y, b.x, b.y)!
    expect(st.view?.proj?.w).toBe(1)
    const text = serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView ?? undefined })
    const back = parseBrnl(text)!
    const rt = back.doc.strokes.find(x => x.id === st.id)!
    expect(rt.view?.proj).toEqual(st.view!.proj)
    // 그 획의 3D가 복원 뒤에도 같다 — 투영을 잃으면 여기가 어긋난다
    const l0 = liftAll(app.doc), l1 = liftAll(back.doc)
    const k = (l: typeof l0) => JSON.stringify([...l.lifted.entries()].sort((x, y) => x[0] - y[0]))
    expect(k(l1)).toBe(k(l0))
    // **투영을 버린 위약 판**(D-3) — 그 획의 3D가 달라진다
    const stripped = parseBrnl(text)!
    for (const x of stripped.doc.strokes) if (x.view) delete x.view.proj
    const l2 = liftAll(stripped.doc)
    expect(k(l2), '투영을 잃으면 좌표가 달라진다 — 그래서 저장한다').not.toBe(k(l0))
    ledger['gate10_roundtrip'] = {
      what: '평행 뷰에서 그은 획의 투영이 저장·복원을 지난다 + 그것을 버린 위약 판',
      lifted_before: before,
      proj_saved: rt.view!.proj,
      identical_after_roundtrip: true,
      falsify_strip_proj_changes_coords: true,
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
it('원장', () => {
  const payload = JSON.stringify({
    what: 'web2-42 1번·2번 — 일곱 개의 이름 붙은 뷰와 평행 투영. 「평행인가」를 **재사영**으로 잰다.',
    canonical_command: 'LEDGER=1 npx vitest run test/view42.test.ts',
    why: (
      '평행은 이름표가 아니라 **그림의 성질**이다 — 평행선이 평행하게 찍히고 깊이가 크기를 '
      + '안 바꾼다. 그래서 게이트가 `pose.proj`를 세지 않고 같은 3D 선분 넷을 깊이만 달리해 '
      + '재사영한 뒤 방향 차와 길이 비를 낸다(#92: 이름표를 바꿔도 자리가 안 움직이면 안 잰 것이다).'
    ),
    design: {
      where: '투영은 `CamPose.proj = {w, D}`에 산다 — 앱 상태가 아니라 **포즈**다(#54).',
      why_pose: (
        '리프팅이 «획이 그려진 시점»(`s.view`)으로 광선을 되짚기 때문이다. 투영이 앱 상태면 '
        + '평행에서 그은 획을 나중에 원근으로 되풀어 **조용히 틀린 좌표**가 난다.'
      ),
      formula: 'den = (1−w)(−z) + wD · 화면 = 주점 + f(x,−y)/den. w=0이면 종전 식과 문자 그대로 같다.',
      scale: '평행의 배율은 `f/D`이고 D는 눈에서 pivot까지의 축방향 거리 — pivot 면에서 크기가 보존된다(#88).',
      untouched: '`Camera.f`·`fSource`는 안 건드린다(지시 문면). 투영은 별도 축이다.',
    },
    fixtures: {
      doc: 'test/fixtures.ts constructedDoc() + 기둥 둘 — 2점(vp0 900 · vp1 100)',
      W, H, f: r6(an2.f!), fSource: an2.fSource,
    },
    constants: {
      CUBE_CENTER_R: C.CUBE_CENTER_R,
      CUBE_SIZE_PX: C.CUBE_SIZE_PX,
      VIEW_NAME_ALIGN_RAD,
      ORBIT_RAD_PER_PX,
      CUBE_ALIGN_MAX_DEG,
      TURN_ANIM_MS,
    },
    constants_note: (
      '새 값 둘: `CUBE_CENTER_R`(크기의 배수 — px ⛔ #88)와 `VIEW_NAME_ALIGN_RAD`. '
      + '뒤쪽은 **숫자를 새로 안 짓는다** — 궤도 한 픽셀의 절반이다(그래서 한 픽셀은 넘고 잡음은 안 넘는다). '
      + `전환 길이는 31-1의 TURN_ANIM_MS(${TURN_ANIM_MS})를 그대로 가리킨다(#54).`
    ),
    ...ledger,
    gate: {
      for: 'web2-42 1번·2번',
      registered: [
        '여섯 면 각각에서 평행이다 — 방향 차 0.000000° · 길이 비 1.000000 (원근 위약 판은 둘 다 크다)',
        '여섯 면 각각에서 자세가 그 면이고 이름이 그 면이다',
        '가운데를 누르면 원근으로 돌아온다 — 자세는 안 바뀐다',
        '정투상 뷰에서 손으로 돌려도 평행이 유지되고(궤도·줌·팬·90°·접기) 이름이 축측이 된다',
        '전환의 중간 프레임이 0과 1 사이이고 그 사이도 정당한 사영이다(넷 다 사영된다)',
        '확정 전에는 여섯 면이 잠긴다(술어 + 큐브 부재)',
        '37-1 조합 표가 여섯 면 전부에서 원근과 같은 답을 낸다 · 재사영 오차 < 0.01 px',
        '평행 ↔ 원근을 오가도 승격 좌표가 **비트 단위로** 같다',
        '확정이 풀리거나 승격이 일어나면 원근으로 돌아온다',
        '평행 뷰에서 그은 획의 투영이 저장·복원을 지난다(버린 위약 판은 좌표가 달라진다)',
      ],
      falsification: [
        '① 같은 자세에서 `pose.proj`를 떼면(w=0) 방향 차와 길이 비가 **실제로 움직인다** — gate1의 `falsify_perspective`',
        '② 저장본에서 `view.proj`를 지우면 그 획의 3D 좌표가 **달라진다** — gate10',
        '③ 이름 허용 각: 궤도 1 px에서 「축측」으로 **실제로 바뀐다** — gate3_name_threshold',
      ],
      reachability: (
        '**무엇이 이 기준을 넘는가**(#35): 같은 여섯 자세에서 투영만 원근으로 둔 판이 넘는다. '
        + '그 판의 방향 차가 1.97~2.03°이고 길이 비가 1.94~2.56이므로, 문(방향 차 1e-9 · 길이 비 '
        + '1±1e-9)은 **아홉 자릿수 밖**에서 갈린다 — 즉 이 게이트는 「배선이 됐는가」를 가른다. '
        + '⚠ 중간 프레임(w=0.5)이 그 사이에 실제로 앉는다(0.888° · 1.453) — 문이 **연속인 축** 위에 '
        + '있고 «0/1 이름표»가 아니라는 증거가 그 값이다(#40).'
      ),
      reachability_source: 'gate1_six_faces/falsify_perspective_spread_deg',
      reachability_value: (ledger['gate1_six_faces'] as { falsify_perspective_spread_deg: number[] })
        .falsify_perspective_spread_deg,
    },
    selfcheck_flags_known: {
      exact_zeros: (
        '⚠ 「방향 차 0.000000 · 길이 비 1.000000」은 **설계 보장이다**(§5.1 자기참조 유형 3): '
        + '평행 사영에서 분모가 상수이므로 아핀이고, 아핀은 평행을 보존한다. **그래서 그 0 자체는 '
        + '아무것도 안 잰다** — 판별력은 같은 자세의 원근 위약 판이 준다(그 값이 나란히 있다). '
        + '그리고 그 0은 **배선을 잰다**: 이름표만 붙고 사영이 안 갈리면 이 0이 안 나온다.'
      ),
      align_deg_zero: (
        '⚠ `align_deg`의 0(평면·저면)도 보장이다 — 면 자세가 **정수 축 벡터의 외적**이라 '
        + '오차가 구성상 안 쌓인다(31-1이 같은 자리에 같은 주석을 달았다). 나머지 넷의 1e-6은 '
        + '반올림 자리(r6)이지 실측 오차가 아니다.'
      ),
      reproject_err_zero: (
        '⚠ `reproject_err_px = 0`(원칙 d)은 **절반이 보장이다**: 「명시 점 2」 칸에서 획의 끝점이 '
        + '이미 그 3D 점의 사영이므로, 리프팅이 **그 점을 고르면** 왕복이 부동소수까지 같다. '
        + '**그래서 이 0이 재는 것은 «어느 후보를 골랐는가»다** — 다른 후보(교차·축)를 고르면 0이 '
        + '아니다. 여섯 면에서 전부 0이라는 것은 「명시 점이 이겼다」의 값이고, 그것이 37-1 표의 첫 줄이다.'
      ),
      constants_snapshot_absent: (
        '⚠ `constantsSnapshot()` / `metric_defs`가 없다 — **web2 라인 전체의 구멍**이고 이 원장만의 '
        + '것이 아니다. 그 기계는 `web/test/constants.ts`에만 있다(DEFERRED).'
      ),
    },
    pitfalls: ['#92', '#94', '#88', '#54', '#77', '#42', '#12'],
    pitfalls_note: (
      '#92 — 「평행인가」를 이름표가 아니라 **결과의 자리**(재사영)로 잰다. '
      + '#94 — 「확정 전에는 잠긴다」를 문면이 아니라 **그 자리를 짚어** 잰다(e2e가 실제 클릭으로 한 번 더). '
      + '#88 — 배율을 상수로 안 두고 `f/D`로 유도한다 · 가운데 반지름은 크기의 배수다. '
      + '#54 — 투영의 출처가 포즈 하나 · 잠금 술어가 `lensAllowed` 하나 · 버리는 자리가 렌즈와 같은 자리. '
      + '#77 ㉡ — w=0이 종전 식과 같은 것은 **구성상 항등**이라 임계를 안 건다. '
      + '#12 — 조합 표를 한 자세가 아니라 여섯 면 전부에서 돈다.'
    ),
  }, null, 2)
  const out = resolve(HERE, '../../stage0/out/view42_web2.json')
  if (process.env.LEDGER === '1') {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, payload)
  }
  expect(payload.length).toBeGreaterThan(100)
})
