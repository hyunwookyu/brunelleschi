// 정렬로 접기 — 돌려보다가 그리려면 정렬된 구도로 돌아와야 한다.
//
// **재현(D-2)**: 이 파일의 첫 팔이 수리 전에 실패한다. 그때 표식이 낸 것(경로 전체):
//     [궤도 후]      yaw=−45.837° pitch=+34.377° eye.y=−2.511
//     [①resetPose]  yaw=  0.000° pitch=  0.000°   ← 요를 잃는다(작도 시점으로 간다)
//     [②큐브 옆면]  yaw= −7.239° / −52.239°       ← 큐브 축에 붙는다(보던 방향이 아니다)
//     [②큐브 윗면]  pitch=90.000°                 ← 정렬이 아니다
//     [③저장 시점]  저장한 것이 없으면 길이 아니다
// 「피치·롤 0 + 요 유지」를 내는 길이 **하나도 없었다**. 그것이 이 회차가 고친 것이다.
//
// 궤도는 `orbitBy`(state.ts)를 부른다 — 앱 입력과 **같은 함수**다. 손으로 쿼터니언을
// 굴리면 시험이 앱을 안 재게 된다(draft.ts·classifyNext와 같은 이유).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { project, DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, orbitBy, resetPose, type App } from '../src/app/state'
import { createAutoLevel } from '../src/app/autolevel'
import { isLevel, levelPose, yawDir, forwardOf } from '../src/core/level'
import { cubeGeom, cubeHit, poseForElem } from '../src/core/viewcube'
import { C } from '../src/core/constants'
import type { CamPose } from '../src/core/types'
import { v3, dot3, quatAxisAngle, quatMul, quatRotate, type V3 } from '../src/core/vec'

/** 작도 → 내용 획 하나. 3D 기하가 있어야 궤도가 돈다. */
function drawn(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)   // 지평선
  s.draw(500, 500, 600, 475)    // 깊이선 1 → vp0
  s.draw(500, 500, 400, 475)    // 깊이선 2 → vp1
  s.draw(500, 500, 500, 380)    // 내용 획 (수직)
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s.app
}

/** **실사용 대역의 구도**(D-5) — 소실점이 화면 폭의 2.5·3배 밖이다.
 *  위 `drawn()`은 f ≈ 387(f/W = 0.32)이고 여기는 f ≈ 3286(f/W = 2.74)이다.
 *  접기의 «물러나는 거리»가 `f`에 정비례하므로(rMin = f·|Δh| ÷ (H/4)) **같은 기울기에서
 *  8.5배**가 된다 — 좁은 픽스처만으로는 그 대역을 안 재게 된다(web2-03 2-d와 같은 형태). */
function drawnWide(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)     // 지평선
  s.draw(3600, 400, 3600, 400)    // vp0 = +3000 = 2.5W (찍기)
  s.draw(-3000, 400, -3000, 400)  // vp1 = −3600 = 3W   (찍기)
  s.draw(500, 300, 500, 500)      // 기둥 — 첫 선이므로 아래점이 지면이다
  expect(s.app.lift.an.vps.length).toBe(2)
  expect(s.app.lift.an.f!).toBeGreaterThan(3000)
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s.app
}

/** 가짜 시계 — 「계속 조작하면 안 접힌다」를 잰다 */
function clock() {
  let t = 1000
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

const pitchDeg = (pose: CamPose) => Math.asin(Math.max(-1, Math.min(1, forwardOf(pose).y))) * 180 / Math.PI
const rollY = (pose: CamPose) => quatRotate(pose.q, v3(1, 0, 0)).y
/** 두 요 방향 사이 각(도) */
const yawGap = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) * 180 / Math.PI

/** 카메라 자신의 오른쪽 축으로 돌린다(궤도의 세로 성분과 같은 축) */
function pitchBy(pose: CamPose, deg: number): CamPose {
  const right = quatRotate(pose.q, v3(1, 0, 0))
  const R = quatAxisAngle(right, deg * Math.PI / 180)
  return { p: { ...pose.p }, q: quatMul(R, pose.q) }
}

/** 손을 떼고 지연을 넘긴 뒤 접기가 끝날 때까지 돌린다 */
function foldAfterRelease(app: App, c: ReturnType<typeof clock>, al: ReturnType<typeof createAutoLevel>) {
  al.release()
  c.advance(C.FOLD_DELAY_MS + 1)
  for (let i = 0; i < 200 && (!isLevel(app.pose) || al.folding()); i++) {
    al.tick()
    c.advance(20)
  }
}

describe('접기 — 상하로 회전한 뒤 놓으면 정렬로 돌아온다', () => {
  it('재현: 피치와 롤이 0이 된다 (옛 길 셋은 이것을 못 냈다)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)

    al.grab(); orbitBy(app, -160, -120)          // 좌우로 돌리고 위로 올려다본다
    expect(Math.abs(pitchDeg(app.pose))).toBeGreaterThan(5)
    expect(isLevel(app.pose)).toBe(false)

    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(pitchDeg(app.pose)).toBeCloseTo(0, 9)
    expect(rollY(app.pose)).toBeCloseTo(0, 9)
  })

  it('옛 길 셋은 「피치·롤 0 + 요 유지」를 못 낸다 — 이 회차가 왜 필요했나', () => {
    const app = drawn()
    orbitBy(app, -160, -120)
    const yaw0 = yawDir(app.pose)
    const keep: CamPose = { p: { ...app.pose.p }, q: { ...app.pose.q } }

    // ① 작도 시점 — 정렬이지만 **요를 잃는다**
    resetPose(app)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeGreaterThan(5)
    setPose(app, keep)

    // ② 뷰 큐브 — 보이는 면 전부. 정렬을 내도 요가 큐브 축에 붙는다.
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)!
    const pivot = orbitPivot(app)
    const dist = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z)
    let anyKept = false
    let faces = 0
    for (const f of geom.faces) {
      if (!f.visible) continue
      const ctr = f.poly.reduce(
        (a, i) => ({ x: a.x + geom.corners[i]!.p.x / 4, y: a.y + geom.corners[i]!.p.y / 4 }), { x: 0, y: 0 })
      const hit = cubeHit(geom, ctr)
      if (!hit) continue
      const pose = poseForElem(app.lift.an, hit, pivot, dist)
      if (!pose) continue
      faces++
      if (isLevel(pose) && yawGap(yawDir(pose), yaw0) < 0.5) anyKept = true
    }
    expect(faces).toBeGreaterThan(0)          // 길을 실제로 훑었는가
    expect(anyKept).toBe(false)

    // ③ 저장한 시점 — 저장한 것이 없으면 길이 아니다
    expect(app.savedViews.length).toBe(0)
  })

  it('좌우 각도(요)와 눈높이가 유지된다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -200, -140)
    const yaw0 = yawDir(app.pose)
    const eye0 = app.pose.p.y

    foldAfterRelease(app, c, al)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 6)
    expect(app.pose.p.y).toBeCloseTo(eye0, 9)
    // 접힌 뒤의 시선 자체가 그 요다(피치 0이므로)
    expect(yawGap(forwardOf(app.pose), yaw0)).toBeCloseTo(0, 6)
  })

  it('내려다본 뒤에도 요·눈높이가 유지된다 (부감 — 눈이 위로 올라간다)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, 120, 180)          // 아래로 끌면 내려다본다
    expect(pitchDeg(app.pose)).toBeLessThan(-5)
    expect(app.pose.p.y).toBeGreaterThan(DRAW_POSE.p.y)
    const yaw0 = yawDir(app.pose), eye0 = app.pose.p.y

    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 6)
    expect(app.pose.p.y).toBeCloseTo(eye0, 9)
  })

  it('탑뷰에서도 접힌다 — 요는 화면 위 방향이 답한다', () => {
    const app = drawn()
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)!
    const pivot = orbitPivot(app)
    const top = poseForElem(app.lift.an, { kind: 'face', dirLocal: v3(0, 1, 0) }, pivot, 500)!
    expect(forwardOf(top).y).toBeCloseTo(-1, 6)      // 똑바로 내려다본다
    expect(geom.faces.length).toBe(6)

    // 시선의 수평 성분이 0이라 요가 «시선»으로는 정의되지 않는다
    const f = forwardOf(top)
    expect(Math.hypot(f.x, f.z)).toBeLessThan(1e-9)
    // 화면 위 방향이 답한다 — 단위이고 수평이다
    const y = yawDir(top)
    expect(y.y).toBe(0)
    expect(Math.hypot(y.x, y.z)).toBeCloseTo(1, 9)
    const up = quatRotate(top.q, v3(0, 1, 0))
    expect(yawGap(y, v3(up.x, 0, up.z))).toBeLessThan(1e-4)

    setPose(app, top)
    const c = clock()
    const al = createAutoLevel(app, c.now)
    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(forwardOf(app.pose), y)).toBeCloseTo(0, 6)
  })

  it('저면에서도 접힌다 — 올려다볼 때는 화면 위가 뒤쪽이다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const bottom = poseForElem(app.lift.an, { kind: 'face', dirLocal: v3(0, -1, 0) }, pivot, 500)!
    expect(forwardOf(bottom).y).toBeCloseTo(1, 6)    // 똑바로 올려다본다
    const y = yawDir(bottom)
    const up = quatRotate(bottom.q, v3(0, 1, 0))
    expect(yawGap(y, v3(-up.x, 0, -up.z))).toBeLessThan(1e-4)

    setPose(app, bottom)
    const c = clock()
    const al = createAutoLevel(app, c.now)
    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
  })

  it('요의 답이 경계에서 안 튄다 — 89.9°와 90°가 같은 방향을 낸다', () => {
    const app = drawn()
    const level = levelPose(app.lift.an, app.pose, orbitPivot(app))
    const near = pitchBy(level, -89.9)     // 거의 탑뷰 — 시선 성분이 답한다
    const exact = pitchBy(level, -90)      // 정확히 탑뷰 — 화면 위가 답한다
    expect(Math.hypot(forwardOf(near).x, forwardOf(near).z)).toBeGreaterThan(1e-6)
    expect(Math.hypot(forwardOf(exact).x, forwardOf(exact).z)).toBeLessThan(1e-9)
    expect(yawGap(yawDir(near), yawDir(exact))).toBeLessThan(0.2)
    // 올려다보는 쪽도 같다
    expect(yawGap(yawDir(pitchBy(level, 89.9)), yawDir(pitchBy(level, 90)))).toBeLessThan(0.2)
  })
})

describe('접기 시점 — 놓으면 잠깐 뒤', () => {
  it('계속 조작하는 동안에는 안 접힌다 (시간이 아무리 지나도)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, -120)
    const tilted = pitchDeg(app.pose)

    for (let i = 0; i < 50; i++) {         // 붙잡은 채로 100초
      al.grab()
      c.advance(2000)
      expect(al.tick()).toBe(false)
    }
    expect(isLevel(app.pose)).toBe(false)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilted, 12)
  })

  it('지연 안에서는 안 접히고, 지연을 넘기면 접힌다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, -120)
    al.release()

    // ⚠ **상대 시간으로 재면 판별자가 아니다.** `advance(DELAY − 1)`로 적었더니
    //   지연을 0으로 만들어도 시각이 1 ms 되감겨 「아직 아니다」가 그냥 성립했다
    //   (#57: 가를 것이 없는데 통과로 읽힌다). 그래서 **비율로 재고 값에 하한을 건다.**
    expect(C.FOLD_DELAY_MS).toBeGreaterThan(0)
    c.advance(C.FOLD_DELAY_MS * 0.99)
    expect(al.tick()).toBe(false)
    expect(al.folding()).toBe(false)
    expect(isLevel(app.pose)).toBe(false)

    c.advance(C.FOLD_DELAY_MS * 0.02)
    expect(al.tick()).toBe(true)
    expect(al.folding()).toBe(true)
  })

  it('접히는 중에 다시 잡으면 접기가 취소된다 — 돌리는 동안은 자유롭다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, -120)
    al.release(); c.advance(C.FOLD_DELAY_MS + 1)
    al.tick()
    expect(al.folding()).toBe(true)
    const mid = pitchDeg(app.pose)

    al.grab()
    expect(al.folding()).toBe(false)
    c.advance(5000)
    expect(al.tick()).toBe(false)
    expect(pitchDeg(app.pose)).toBeCloseTo(mid, 12)   // 그 자리에 선다
  })

  it('애니메이션으로 잇는다 — 한 프레임에 안 튄다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, -120)
    const p0 = pitchDeg(app.pose)
    al.release(); c.advance(C.FOLD_DELAY_MS + 1)

    al.tick()                                  // 첫 걸음
    expect(al.folding()).toBe(true)
    expect(Math.abs(pitchDeg(app.pose) - p0)).toBeLessThan(Math.abs(p0) * 0.5)

    const seen: number[] = []
    for (let i = 0; i < 40 && al.folding(); i++) {
      c.advance(C.FOLD_ANIM_MS / 10)
      al.tick()
      seen.push(pitchDeg(app.pose))
    }
    expect(seen.length).toBeGreaterThanOrEqual(8)   // 여러 프레임에 걸친다
    expect(isLevel(app.pose)).toBe(true)
    // 단조로 줄어든다 — 되돌아가거나 넘어서지 않는다
    for (let i = 1; i < seen.length; i++) {
      expect(Math.abs(seen[i]!)).toBeLessThanOrEqual(Math.abs(seen[i - 1]!) + 1e-9)
    }
  })

  it('이미 정렬이면 아무것도 안 한다 — 작도 시점이 흔들리지 않는다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    expect(isLevel(app.pose)).toBe(true)
    al.release(); c.advance(60000)
    expect(al.tick()).toBe(false)
    expect(app.pose.p).toEqual(DRAW_POSE.p)
  })

  it('그리려고 누르면 지연을 안 기다린다 — foldNow', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, -120)
    al.release()
    c.advance(10)                    // 지연에 한참 못 미친다
    expect(al.tick()).toBe(false)
    al.foldNow()
    expect(al.folding()).toBe(true)
  })
})

describe('접을 때의 위치 — 물러나기만 한다', () => {
  it('대상이 화면에 남는다 — pivot이 화면 안', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    for (const [dx, dy] of [[-160, -120], [120, 180], [0, 260], [300, -300]] as const) {
      setPose(app, DRAW_POSE)
      orbitBy(app, dx, dy)
      const folded = levelPose(app.lift.an, app.pose, pivot)
      const s = project(app.lift.an, folded, pivot)
      expect(s).not.toBeNull()
      expect(Math.abs(s!.y - app.lift.an.principal!.y)).toBeLessThanOrEqual(H / 2 + 1e-6)
      expect(s!.y).toBeGreaterThanOrEqual(-1e-6)
      expect(s!.y).toBeLessThanOrEqual(H + 1e-6)
    }
  })

  it('완만한 기울기에서는 위치를 안 건드린다 — 안 시킨 줌인이 없다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    orbitBy(app, -40, -12)                  // 약 3.4° — 살짝 돌려봤다
    expect(Math.abs(pitchDeg(app.pose))).toBeLessThan(6)
    const before = { ...app.pose.p }
    const folded = levelPose(app.lift.an, app.pose, pivot)
    expect(folded.p.x).toBeCloseTo(before.x, 9)
    expect(folded.p.y).toBeCloseTo(before.y, 9)
    expect(folded.p.z).toBeCloseTo(before.z, 9)
  })

  it('가까이 당기지 않는다 — 수평거리가 줄어드는 일이 없다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    for (const [dx, dy] of [[-160, -120], [120, 180], [60, 40], [-300, 300]] as const) {
      setPose(app, DRAW_POSE)
      orbitBy(app, dx, dy)
      const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
      const folded = levelPose(app.lift.an, app.pose, pivot)
      const r1 = Math.hypot(folded.p.x - pivot.x, folded.p.z - pivot.z)
      expect(r1).toBeGreaterThanOrEqual(r0 - 1e-9)
    }
  })

  it('먼 소실점 구도(D-5) — 좁은 픽스처가 못 재는 것이 여기서 난다', () => {
    // **같은 궤도**를 두 구도에 건다. 좁은 픽스처(f=387)는 **아예 안 물러나고**
    // 먼 소실점 구도(f=3286)는 크게 물러난다 — 좁은 것만 재면 이 갈래가 한 번도 안 돈다.
    const ratio = (app: ReturnType<typeof drawn>) => {
      const pivot = orbitPivot(app)
      orbitBy(app, -160, -120)
      const folded = levelPose(app.lift.an, app.pose, pivot)
      const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
      const r1 = Math.hypot(folded.p.x - pivot.x, folded.p.z - pivot.z)
      const s = project(app.lift.an, folded, pivot)!
      return { k: r1 / r0, dy: Math.abs(s.y - app.lift.an.principal!.y) }
    }
    const narrow = ratio(drawn())
    const wide = ratio(drawnWide())
    expect(narrow.k).toBeCloseTo(1, 6)          // 좁은 구도 — 물러날 일이 없다
    expect(wide.k).toBeGreaterThan(3)           // 먼 소실점 — 크게 물러난다
    for (const r of [narrow, wide]) expect(r.dy).toBeLessThanOrEqual(H / 2 + 1e-6)
  })

  it('베어링을 안 바꾼다 — pivot의 화면 가로 위치가 그대로다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    orbitBy(app, -160, -120)
    const folded = levelPose(app.lift.an, app.pose, pivot)
    // 요를 고정하고 수평 오프셋을 «늘리기»만 하므로 pivot의 방위각이 그대로다
    const bearing = (p: { x: number; z: number }) =>
      Math.atan2(pivot.x - p.x, -(pivot.z - p.z))
    expect(bearing(folded.p)).toBeCloseTo(bearing(app.pose.p), 9)
  })
})
