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
import { project, screenAxes, DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, orbitBy, resetPose, undo, saveView, gotoView, commitStroke, isDrawPose, type App } from '../src/app/state'
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

/** **정렬 포즈에 롤을 얹고 아래로 deg 만큼 눕힌다.**
 *
 *  ⚠ **눕히는 축은 언제나 «정렬 포즈»의 오른쪽이다** — 정렬이므로 그것이 **수평**이고,
 *  그래야 deg = 90에서 시선이 **정확히** 수직이 된다. 롤이 실린 포즈의 오른쪽 축은
 *  수평이 아니라, 그 축으로 90° 돌리면 시선이 수직에 **안 닿는다**(초판이 그렇게 재서
 *  롤 5°에 갭 1.147°가 나왔다 — 경계 자체에 도달을 못 한 값이다).
 *  롤은 **뒤곱**이라 시선을 안 바꾸므로 순서가 「롤 먼저, 눕히기 나중」이다. */
function tipDown(level: CamPose, deg: number, rollDeg = 0): CamPose {
  const right = quatRotate(level.q, v3(1, 0, 0))          // 정렬 포즈의 수평 오른쪽
  const rolled = quatMul(level.q, quatAxisAngle(v3(0, 0, 1), rollDeg * Math.PI / 180))
  return { p: { ...level.p }, q: quatMul(quatAxisAngle(right, -deg * Math.PI / 180), rolled) }
}

/** **앵커** — 정렬 상태를 떠나기 직전의 포즈. 앱에서는 `autolevel`이 들고 있고,
 *  직접 `levelPose`를 부르는 팔은 궤도 직전의 포즈를 그대로 넘긴다(같은 뜻이다). */
const snap = (pose: CamPose): CamPose => ({ p: { ...pose.p }, q: { ...pose.q } })

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
  // ⚠ web2-08 지시 3: 접히는 것은 **임계(snapAngle = min(atan(f/6W), 8.25°)) 안** 기울기뿐이다.
  //   임계는 문서의 f를 탄다 — drawn()은 f = 0.32W라 임계 3.08° = 10.7px이고,
  //   이 파일의 접기 궤도는 전부 그 안(|dy| ≤ 8px ⇒ |피치| ≤ 2.3°)으로 조준한다.
  //   임계 밖(머무는 자세)은 `posesnap.test.ts`가 잰다. 요도 축(+37.8°/−52.3°)에서
  //   임계 밖으로 조준한다 — 우연한 1점 스냅이 단언을 흐리지 않게.
  it('재현: 피치와 롤이 0이 된다 (옛 길 셋은 이것을 못 냈다)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)

    al.grab(); orbitBy(app, -60, -8)             // 좌우로 돌리고 위로 올려다본다(임계 안)
    expect(Math.abs(pitchDeg(app.pose))).toBeGreaterThan(1.5)
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

  it('좌우 각도(요)는 새 값 · 눈높이는 **궤도 전** 값이다', () => {
    // ⚠ **이 팔이 web2-05에서 뒤집혔다.** 앞판은 「눈높이가 **궤도 후** 값으로 유지된다」를
    //   박고 있었고, 사람이 그것을 지시로 뒤집었다 — 궤도로 바뀐 높이는 사용자가 정한
    //   눈높이가 아니라 부수 효과다. 팔이 뒤집힌 것 자체가 규칙이 바뀌었다는 증거다(#57).
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const eyeBefore = app.pose.p.y
    al.grab(); orbitBy(app, -100, -8)            // 요 −28.7°(축에서 멀다) · 피치 +2.3°(임계 안)
    const yaw0 = yawDir(app.pose)
    expect(app.pose.p.y).not.toBeCloseTo(eyeBefore, 1)   // 궤도가 눈높이를 바꿨다

    foldAfterRelease(app, c, al)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 6)   // 요는 새 값
    expect(app.pose.p.y).toBeCloseTo(eyeBefore, 6)             // 눈높이는 궤도 전 값
    // 접힌 뒤의 시선 자체가 그 요다(피치 0이므로)
    expect(yawGap(forwardOf(app.pose), yaw0)).toBeCloseTo(0, 6)
  })

  it('내려다본 뒤에도 요는 새 값 · 눈높이는 궤도 전 값 (부감 — 궤도가 눈을 올린다)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const eyeBefore = app.pose.p.y
    al.grab(); orbitBy(app, 60, 8)             // 아래로 끌면 내려다본다(임계 안 · 요 17.2°)
    expect(pitchDeg(app.pose)).toBeLessThan(-1.5)
    expect(app.pose.p.y).toBeGreaterThan(DRAW_POSE.p.y)   // 눈이 올라갔다
    const yaw0 = yawDir(app.pose)

    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 6)
    expect(app.pose.p.y).toBeCloseTo(eyeBefore, 6)        // 올라간 높이가 **안 남는다**
  })

  it('탑뷰의 요는 화면 위 방향이 답한다 — 그리고 탑뷰는 이제 머문다(web2-08 지시 3)', () => {
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
    al.release(); c.advance(C.FOLD_DELAY_MS + 1)
    for (let i = 0; i < 20; i++) { al.tick(); c.advance(20) }
    expect(isLevel(app.pose)).toBe(false)            // 임계 밖 — 머무는 자세다(posesnap.test)
    expect(forwardOf(app.pose).y).toBeCloseTo(-1, 6)
  })

  it('저면의 요는 화면 위의 뒤쪽이 답한다 — 저면도 머문다', () => {
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
    al.release(); c.advance(C.FOLD_DELAY_MS + 1)
    for (let i = 0; i < 20; i++) { al.tick(); c.advance(20) }
    expect(isLevel(app.pose)).toBe(false)            // 임계 밖 — 머무는 자세다
    expect(forwardOf(app.pose).y).toBeCloseTo(1, 6)
  })

  // ── 경계(시선이 수직) — 셋을 나눠 잰다. 하나로 뭉치면 항등을 연속성으로 읽는다(#57) ──
  //
  //  초판은 「89.9°와 90°의 차가 0.2° 미만」 **하나**였고 그것이 **아무것도 안 쟀다**:
  //  픽스처가 순수 피치라 두 갈래의 답이 **항등으로 같았다**(갭 정확히 0.000000°).
  //  그리고 적어 둔 0.2°는 **틀린 값**이었다 — 롤이 있으면 갭이 정확히 롤 각이다.

  it('경계 ① 롤이 0이면 갭이 0이다 — 다만 그것은 **항등**이지 연속성이 아니다', () => {
    const app = drawn()
    const level = levelPose(snap(app.pose), app.pose, orbitPivot(app))
    for (const d of [0.1, 0.01, 0.001]) {
      const near = tipDown(level, 90 - d)
      const exact = tipDown(level, 90)
      expect(Math.hypot(forwardOf(near).x, forwardOf(near).z)).toBeGreaterThan(1e-9)
      expect(Math.hypot(forwardOf(exact).x, forwardOf(exact).z)).toBeLessThan(1e-12)
      // δ를 줄여도 «줄어드는» 것이 아니라 **처음부터 0**이다 — 그것이 항등의 표식이다
      expect(yawGap(yawDir(near), yawDir(exact))).toBeCloseTo(0, 9)
    }
  })

  it('경계 ② 롤이 있으면 갭이 **정확히 롤 각**이다 — 짐벌 잠금이고 원리적 한계다', () => {
    const app = drawn()
    const level = levelPose(snap(app.pose), app.pose, orbitPivot(app))
    for (const roll of [5, 14, 45]) {
      // 경계에 실제로 닿았는가 — 안 닿으면 아무것도 안 잰다
      expect(Math.hypot(forwardOf(tipDown(level, 90, roll)).x, forwardOf(tipDown(level, 90, roll)).z))
        .toBeLessThan(1e-12)
      for (const d of [0.1, 0.01, 0.001]) {
        // δ를 100배 줄여도 갭이 그대로다 — 줄어들면 그것이 연속이고, 여기서는 안 준다
        expect(yawGap(yawDir(tipDown(level, 90 - d, roll)), yawDir(tipDown(level, 90, roll))))
          .toBeCloseTo(roll, 6)
      }
    }
  })

  it('경계 ③ 그래서 앱에서는 안 튄다 — **앱이 롤을 만드는 길이 없다**', () => {
    const app = drawn()
    // 궤도: 세계 수직축과 카메라 오른쪽 축으로만 돈다
    for (const [dx, dy] of [[-160, -120], [120, 180], [0, 260], [300, -300], [40, 40]] as const) {
      setPose(app, DRAW_POSE)
      orbitBy(app, dx, dy)
      expect(Math.abs(rollY(app.pose))).toBeLessThan(1e-9)
    }
    // 뷰 큐브: 보이는 요소 전부(면·모서리·꼭짓점)
    setPose(app, DRAW_POSE)
    orbitBy(app, -160, -120)
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)!
    const pivot = orbitPivot(app)
    let seen = 0
    for (const c of geom.corners) {
      const pose = poseForElem(app.lift.an, { kind: 'corner', dirLocal: c.local }, pivot, 500)
      if (!pose) continue
      seen++
      // 큐브 꼭짓점 시점도 롤 0이다(위 힌트가 큐브 Y다)
      expect(Math.abs(rollY(pose))).toBeLessThan(1e-9)
    }
    expect(seen).toBe(8)
    // 접기 자신도 롤을 안 만든다
    expect(Math.abs(rollY(levelPose(snap(DRAW_POSE), app.pose, pivot)))).toBeLessThan(1e-12)
  })
})

describe('접힌 뒤에 실제로 그릴 수 있는가 — 리뷰어 [7]·[8]이 물은 것', () => {
  it('**작도는 못 끝낸다** — 접힌 포즈에서 그은 획은 소실점을 안 만든다', () => {
    // 이 회차가 만든 함정이다. 접힌 포즈는 «정렬»이라 그릴 수 있어 보이는데,
    // `analyze()`는 작도 포즈가 아닌 획을 전부 내용으로 돌린다. 규칙은 안 바꿨고
    // (범위) **화면이 그것을 말하게** 했다 — `main.ts`의 `UNFINISHED_MSG`.
    // 이 팔은 그 사실을 박아 둔다: 규칙을 바꾸면 여기가 먼저 빨개진다.
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)      // 지평선
    s.draw(500, 500, 600, 475)       // 깊이선 1 → 소실점 하나
    expect(s.app.lift.an.vps).toHaveLength(1)
    expect(s.app.lift.an.constructionDone).toBe(false)

    const pivot = orbitPivot(s.app)
    const anchor = snap(s.app.pose)
    orbitBy(s.app, -60, -140)                          // 위로 올려다본다
    expect(s.app.pose.p.y).toBeLessThan(0)             // 눈이 지면 아래로 내려간다(실측 −11.331)
    setPose(s.app, levelPose(anchor, s.app.pose, pivot))
    expect(isLevel(s.app.pose)).toBe(true)             // 정렬됐다 — 그릴 수 있어 «보인다»
    expect(isDrawPose(s.app.pose)).toBe(false)         // 그러나 작도 포즈는 아니다

    const st = s.draw(500, 500, 400, 475)              // 둘째 깊이선을 그어 본다
    expect(st).not.toBeNull()
    expect(s.app.lift.an.roles.get(st!.id)).toBe('content')   // 작도가 아니라 내용이다
    expect(s.app.lift.an.vps).toHaveLength(1)                 // 소실점이 안 늘었다
    expect(s.app.lift.waiting).toContain(st!.id)              // 사라지지 않는다(불변식 j)
  })

  it('**내용은 그려진다** — 접힌 포즈에서 이어 그으면 3D로 올라간다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const before = app.lift.lifted.size
    const anchor = snap(app.pose)
    orbitBy(app, -60, -40)
    setPose(app, levelPose(anchor, app.pose, pivot))
    expect(isLevel(app.pose)).toBe(true)
    // 확정된 3D 끝점을 지금 포즈로 사영해 그 자리에서 잇는다(사람이 하는 것)
    const seg = [...app.lift.lifted.values()][0]!
    const a = project(app.lift.an, app.pose, seg.b3)!
    const ax = screenAxes(app.lift.an, app.pose).find(x => x.id === 'vp0')!
    const t = ax.vp ? { x: a.x + (ax.vp.x - a.x) * 0.15, y: a.y + (ax.vp.y - a.y) * 0.15 }
      : { x: a.x + ax.dir!.x * 80, y: a.y + ax.dir!.y * 80 }
    const st = commitStroke(app, a, t)
    expect(app.lift.lifted.has(st.id)).toBe(true)      // 승격됐다
    expect(app.lift.lifted.size).toBe(before + 1)
  })

  it('**피치가 실린 옛 획도 그대로 풀린다** — 옛 파일이 그 자리다 (리뷰어 [7])', () => {
    // 이제 기울어 있는 동안에는 획을 못 만들지만, **이 회차 이전에 저장한 파일**에는
    // 피치가 실린 `Stroke.view`가 있을 수 있다. `flow.spec.ts`의 궤도를 좌우로만 바꾸면서
    // 그 경로를 재던 자리가 사라졌으므로 여기서 다시 잡는다 — 도달 가능하고, 안 죽었다.
    const app = drawn()
    const before = app.lift.lifted.size
    orbitBy(app, -80, -60)
    const pitch = Math.abs(Math.asin(forwardOf(app.pose).y) * 180 / Math.PI)
    expect(pitch).toBeGreaterThan(5)                   // 실제로 피치가 실렸다
    const seg = [...app.lift.lifted.values()][0]!
    const a = project(app.lift.an, app.pose, seg.b3)!
    const ax = screenAxes(app.lift.an, app.pose).find(x => x.id === 'vp0')!
    const t = ax.vp ? { x: a.x + (ax.vp.x - a.x) * 0.15, y: a.y + (ax.vp.y - a.y) * 0.15 }
      : { x: a.x + ax.dir!.x * 80, y: a.y + ax.dir!.y * 80 }
    const st = commitStroke(app, a, t)                 // 옛 앱이 하던 그대로(입력 잠금을 안 거친다)
    expect(st.view).toBeDefined()
    expect(Math.abs(st.view!.q.x)).toBeGreaterThan(1e-6)   // 피치가 쿼터니언에 있다
    expect(app.lift.lifted.has(st.id)).toBe(true)
    expect(app.lift.lifted.size).toBe(before + 1)
  })
})

describe('접기 시점 — 놓으면 잠깐 뒤', () => {
  it('계속 조작하는 동안에는 안 접힌다 (시간이 아무리 지나도)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, -8)
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
    al.grab(); orbitBy(app, -60, -8)
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
    al.grab(); orbitBy(app, -60, -8)
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
    al.grab(); orbitBy(app, -60, -8)
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

  it('궤도 도중에 전부 실행취소해도 접힌다 — 기하가 줄어든다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, -8)
    al.release()
    while (app.undoStack.length > 0) undo(app)      // 내용 획이 사라진다 → pivot이 옮겨간다
    // ⚠ **작도 획은 실행취소 대상이 아니다** — 깊이선 둘은 남아 3D로 서 있다.
    //   그래서 `lifted`가 0이 되는 일도, `an.f`가 null이 되는 일도 **없다**(실측 lifted=2·f=387.3).
    //   `levelPose`의 «f가 null» 갈래와 `orbitPivot`의 «기하 없음» 갈래는 **기울어 있는
    //   동안에는 도달 불가한 방어 갈래**이고 이 팔은 그것을 안 잰다(#57: 안 재는 것을
    //   통과로 안 적는다). 이 팔이 재는 것은 **pivot이 옮겨간 채로 접힌다**는 것 하나다.
    expect(app.lift.lifted.size).toBe(2)
    expect(app.lift.an.f).not.toBeNull()
    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    for (const v of [app.pose.p.x, app.pose.p.y, app.pose.p.z]) expect(Number.isFinite(v)).toBe(true)
  })

  it('임계 안 기울기로 저장한 시점은 접힌다 — 임계 밖으로 저장하면 산다(posesnap.test)', () => {
    // web2-08 지시 3이 종전 「예외 없음(어떤 저장 시점도 접힌다)」을 뒤집었다 —
    // 이제 임계가 가른다. 임계 안 저장 시점은 종전대로 접힌다는 것을 여기 박아 둔다.
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, -8)
    saveView(app)
    expect(app.savedViews).toHaveLength(1)
    al.release()
    setPose(app, DRAW_POSE)
    gotoView(app, 0)
    al.touch()                                  // main.ts가 부르는 자리
    expect(isLevel(app.pose)).toBe(false)       // 불러온 직후는 기울어 있다
    c.advance(C.FOLD_DELAY_MS + 1)
    for (let i = 0; i < 200 && (!isLevel(app.pose) || al.folding()); i++) { al.tick(); c.advance(20) }
    expect(isLevel(app.pose)).toBe(true)        // 그래도 접힌다
  })

  it('그리려고 누르면 지연을 안 기다린다 — foldNow', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, -8)
    al.release()
    c.advance(10)                    // 지연에 한참 못 미친다
    expect(al.tick()).toBe(false)
    al.foldNow()
    expect(al.folding()).toBe(true)
  })
})

describe('접을 때의 위치 — **궤도 전으로 통째로 돌아간다**(web2-05)', () => {
  // ⛔ **여기 있던 팔 다섯이 폐기된 기전을 재던 것이다**(#57):
  //    ‹대상이 화면에 남는다› ‹완만한 기울기에서 위치 불변› ‹가까이 안 당긴다›
  //    ‹베어링 불변› ‹먼 소실점 대역(D-5)›.
  //    그 다섯은 「눈높이를 유지하고 수평거리를 늘린다」를 판정했는데 **그 규칙이 죽었다** —
  //    앵커가 이미 «보던 구도»라 늘릴 일이 없다. 판별력이 죽은 조항을 통과로 안 적고
  //    **지우고 새 규칙의 팔로 갈았다.** 폐기 기록은 NOTES의 web2-05 절.

  it('재현: 궤도로 바뀐 높이·거리가 접은 뒤에도 남았다 — 그것이 증상이다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const before = { y: app.pose.p.y, r: Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z) }
    const anchor = snap(app.pose)
    orbitBy(app, -160, 180)                       // 좌우로 돌리고 내려다본다(부감)
    expect(app.pose.p.y).toBeGreaterThan(before.y + 1)   // 실측 1.600 → 6.590
    const folded = levelPose(anchor, app.pose, pivot)
    // **지금 규칙**: 높이도 거리도 궤도 전 값이다
    expect(folded.p.y).toBeCloseTo(before.y, 9)
    expect(Math.hypot(folded.p.x - pivot.x, folded.p.z - pivot.z)).toBeCloseTo(before.r, 9)
  })

  it('높이 · 거리 · 피치 · 롤이 궤도 전과 **같다** — 궤도 넷에서', () => {
    for (const [dx, dy] of [[-160, -120], [120, 180], [0, 260], [300, -300]] as const) {
      const app = drawn()
      const pivot = orbitPivot(app)
      const anchor = snap(app.pose)
      const r0 = Math.hypot(anchor.p.x - pivot.x, anchor.p.z - pivot.z)
      const d0 = Math.hypot(anchor.p.x - pivot.x, anchor.p.y - pivot.y, anchor.p.z - pivot.z)
      orbitBy(app, dx, dy)
      const f = levelPose(anchor, app.pose, pivot)
      expect(f.p.y).toBeCloseTo(anchor.p.y, 9)                                   // 높이
      expect(Math.hypot(f.p.x - pivot.x, f.p.z - pivot.z)).toBeCloseTo(r0, 9)    // 수평거리
      expect(Math.hypot(f.p.x - pivot.x, f.p.y - pivot.y, f.p.z - pivot.z)).toBeCloseTo(d0, 9) // 거리
      expect(pitchDeg(f)).toBeCloseTo(0, 9)                                       // 피치
      expect(rollY(f)).toBeCloseTo(0, 9)                                          // 롤
    }
  })

  it('**좌우 각도만 바뀌었다** — 앵커를 수직축 둘레로 돌린 강체 회전이다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const anchor = snap(app.pose)
    orbitBy(app, -200, 140)
    const f = levelPose(anchor, app.pose, pivot)
    const dYaw = yawGap(yawDir(app.pose), yawDir(anchor))
    expect(dYaw).toBeGreaterThan(5)                       // 실제로 좌우로 돌았다
    // 접힌 뒤 요는 **궤도의 요**이고, 앵커에서 그만큼만 돌았다
    expect(yawGap(yawDir(f), yawDir(app.pose))).toBeCloseTo(0, 6)
    expect(yawGap(yawDir(f), yawDir(anchor))).toBeCloseTo(dYaw, 6)
    // 강체 회전의 표식: pivot에서 앵커까지의 **수평 오프셋 각**도 정확히 그만큼 돌았다
    const bear = (p: { x: number; z: number }) => Math.atan2(p.x - pivot.x, -(p.z - pivot.z))
    let d = (bear(f.p) - bear(anchor.p)) * 180 / Math.PI
    d = ((d % 360) + 540) % 360 - 180
    expect(Math.abs(d)).toBeCloseTo(dYaw, 4)
  })

  it('요가 안 바뀌면 **항등**이다 — 이미 정렬이면 한 톨도 안 움직인다', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const anchor = snap(app.pose)
    const f = levelPose(anchor, app.pose, pivot)
    expect(f.p.x).toBeCloseTo(anchor.p.x, 12)
    expect(f.p.y).toBeCloseTo(anchor.p.y, 12)
    expect(f.p.z).toBeCloseTo(anchor.p.z, 12)
    expect(yawGap(yawDir(f), yawDir(anchor))).toBeCloseTo(0, 9)
  })

  it('**pivot의 화면 자리는 요 180°에서도 정확히 같다** — 그러나 그것이 보장의 전부다', () => {
    // 「대상이 화면에 남는다」를 이 규칙이 **보장하지 않는다.** 구성상 고정되는 것은
    // pivot 한 점이고, 거기서 떨어진 기하는 요와 함께 화면에서 옮겨간다.
    // 어디서 나가는지는 `fold_measure.test.ts`가 대역별로 낸다(퍼짐/거리 0.15~0.68).
    const app = drawn()
    const pivot = orbitPivot(app)
    const anchor = snap(app.pose)
    const at0 = project(app.lift.an, anchor, pivot)!
    for (const dx of [-80, -160, -314, -628]) {
      setPose(app, snap({ p: { ...anchor.p }, q: { ...DRAW_POSE.q } }))
      orbitBy(app, dx, -120)
      const f = levelPose(anchor, app.pose, pivot)
      const at1 = project(app.lift.an, f, pivot)!
      expect(at1.x).toBeCloseTo(at0.x, 6)
      expect(at1.y).toBeCloseTo(at0.y, 6)
    }
  })

  it('사용자가 정렬 상태에서 바꾼 높이·거리는 **유지된다**(지시 d)', () => {
    // 궤도로 바뀐 값만 안 남는다. 정렬 상태에서 사람이 옮긴 것은 의도이므로 앵커가 그것이다.
    const app = drawn()
    const pivot = orbitPivot(app)
    setPose(app, { p: v3(app.pose.p.x, 4.2, app.pose.p.z - 3), q: { ...app.pose.q } })
    expect(isLevel(app.pose)).toBe(true)
    const anchor = snap(app.pose)                 // 앱에서는 autolevel이 이 순간을 잡는다
    orbitBy(app, -120, 200)
    const f = levelPose(anchor, app.pose, pivot)
    expect(f.p.y).toBeCloseTo(4.2, 9)             // 사람이 정한 눈높이가 산다
  })
})

describe('앱 경로 — autolevel이 앵커를 언제 잡는가', () => {
  it('접으면 궤도 전 높이·거리로 돌아온다 (앵커를 손으로 안 넘긴다)', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const pivot = orbitPivot(app)
    const y0 = app.pose.p.y
    const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
    al.grab(); orbitBy(app, -60, 8)
    expect(app.pose.p.y).toBeGreaterThan(y0 + 0.08)  // 임계 안 기울기(2.3°)라 이동 폭이 작다
    foldAfterRelease(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(app.pose.p.y).toBeCloseTo(y0, 6)
    expect(Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)).toBeCloseTo(r0, 6)
  })

  it('앵커가 «없는» 상태가 없다 — 시작·복원·비우기가 전부 정렬 포즈다 (2차 리뷰어 [15])', () => {
    // 복원(자동 저장)·열기·비우기는 전부 `DRAW_POSE`로 들어오고 그것은 정렬이다.
    // 그래서 `createAutoLevel` 시점에 이미 앵커가 서 있고 «앵커가 없는 자리»가 없다.
    // ⚠ **기울어진 저장 시점으로 들어오는 길은 다르다** — 그때 앵커는 «그 직전의 정렬
    //   포즈»이고, 접기는 거기로 돌아간다(저장한 기울기가 안 남는 것은 예외를 안 둔 대가다).
    const app = drawn()
    expect(isLevel(app.pose)).toBe(true)                 // 시작이 정렬이다
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const pivot = orbitPivot(app)
    // 정렬 상태에서 사람이 옮긴다 → 그 자리가 앵커가 된다
    setPose(app, { p: v3(app.pose.p.x, 2.4, app.pose.p.z), q: { ...app.pose.q } })
    // 기울어진 시점을 저장했다가 불러온다 — 앵커는 위 «2.4»다
    al.grab(); orbitBy(app, -120, 8)
    saveView(app)
    al.release()
    foldAfterRelease(app, c, al)
    expect(app.pose.p.y).toBeCloseTo(2.4, 6)
    gotoView(app, 0); al.touch()                          // 기울어진 시점으로 들어온다
    expect(isLevel(app.pose)).toBe(false)
    c.advance(C.FOLD_DELAY_MS + 1)
    for (let i = 0; i < 200 && (!isLevel(app.pose) || al.folding()); i++) { al.tick(); c.advance(20) }
    expect(isLevel(app.pose)).toBe(true)
    expect(app.pose.p.y).toBeCloseTo(2.4, 6)             // 사람이 정한 높이로 돌아온다
    expect(Number.isFinite(app.pose.p.x)).toBe(true)
  })

  it('두 번 돌려도 누적되지 않는다 — 접힌 포즈가 새 앵커다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const pivot = orbitPivot(app)
    const y0 = app.pose.p.y
    const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
    for (const [dx, dy] of [[-160, 8], [200, -7], [-90, 8]] as const) {   // 셋 다 요를 바꾼다(임계 안)
      al.grab(); orbitBy(app, dx, dy)
      foldAfterRelease(app, c, al)
      expect(app.pose.p.y).toBeCloseTo(y0, 6)     // 세 번을 돌아도 그대로다
      expect(Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)).toBeCloseTo(r0, 6)
    }
  })

  it('정렬 상태에서 사람이 옮기면 앵커가 따라간다 — 궤도로 바뀐 값만 안 남는다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const pivot = orbitPivot(app)
    setPose(app, { p: v3(app.pose.p.x, 3.5, app.pose.p.z), q: { ...app.pose.q } })  // 사람이 눈높이를 올린다
    expect(isLevel(app.pose)).toBe(true)
    al.grab(); orbitBy(app, -100, 7)
    foldAfterRelease(app, c, al)
    expect(app.pose.p.y).toBeCloseTo(3.5, 6)
  })
})
