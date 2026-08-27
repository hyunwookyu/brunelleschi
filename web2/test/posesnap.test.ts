// **시점 스냅** (web2-08 지시 3) — 정렬은 **의도적으로 가져왔을 때만** 걸린다.
//
// 증상(재현 · D-2): 어떤 자세로 돌려놓아도 놓고 잠깐 지나면 **무조건** 2점 투시 정렬로
// 접혔다 — 내려다보거나 올려다보는 시점에 머물 수가 없었다. 수리 전에는 이 파일의
// 첫 팔이 실패한다(접혀 버린다).
//
// 규칙: 임계 = `snapAngle(f, W)` = **min(atan(f/6W), 8.25°)** 하나다.
//   · |피치| ≤ 임계 → 정렬로 접는다(접는 «방법» — 앵커·요·반경 규칙 — 은 불변)
//   · |피치| > 임계 → **기울인 채 둔다** — 머무는 상태다
//   · 정렬 상태에서 요가 축과 임계 안 → 그 축으로 붙는다(2점 → 1점)
// drawn() 픽스처는 f = 0.32W(넓은 화각)라 임계가 **3.08° = 10.7px**이다.
// 임계의 근거는 `constants.ts`의 POSE_SNAP_RAD 주석과 NOTES에 있다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { setPose, orbitPivot, orbitBy, addSheet, gotoSheet, commitStroke, beginErase, eraseAt, endErase, type App } from '../src/app/state'
import { createAutoLevel } from '../src/app/autolevel'
import { isLevel, forwardOf, yawDir, snapAngle, POSE_SNAP_RAD } from '../src/core/level'
import { poseForElem } from '../src/core/viewcube'
import { project, screenAxes } from '../src/core/camera'
import { C } from '../src/core/constants'
import type { CamPose } from '../src/core/types'
import { v3, dot3, norm3, type V3 } from '../src/core/vec'

function drawn(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)   // 지평선
  s.draw(500, 500, 600, 475)    // 깊이선 1 → vp0=(900,400)
  s.draw(500, 500, 400, 475)    // 깊이선 2 → vp1=(100,400)
  s.draw(500, 500, 500, 380)    // 내용 획
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s.app
}

function clock() {
  let t = 1000
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

const pitchDeg = (pose: CamPose) =>
  Math.asin(Math.max(-1, Math.min(1, forwardOf(pose).y))) * 180 / Math.PI
const yawGap = (a: V3, b: V3) =>
  Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) * 180 / Math.PI

/** 놓고 지연을 넘겨 접기가 끝나거나 포기할 때까지 돌린다 */
function settle(app: App, c: ReturnType<typeof clock>, al: ReturnType<typeof createAutoLevel>) {
  al.release()
  c.advance(C.FOLD_DELAY_MS + 1)
  for (let i = 0; i < 200; i++) {
    const moved = al.tick()
    c.advance(20)
    if (!moved && !al.folding()) break
  }
}

// 궤도 1px = ORBIT_RAD_PER_PX(0.005 rad). 정렬에서 dy px 끌면 피치가 정확히 −dy·0.005 rad,
// dx px 끌면 요가 +dx·0.005 rad이다 — 임계를 px로 환산해 경계 양쪽을 조준한다.
const epsPx = (app: App) => snapAngle(app.lift.an.f, W) / 0.005

describe('임계 밖 — 기울인 채 둔다 (재현: 수리 전에는 무조건 접혔다)', () => {
  it('내려다보는 시점이 산다 — 놓고 아무리 지나도 안 접힌다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, 120)          // 내려다본다 — 피치 ≈ −34°
    const tilt = pitchDeg(app.pose)
    expect(Math.abs(tilt)).toBeGreaterThan(snapAngle(app.lift.an.f, W) * 180 / Math.PI)
    settle(app, c, al)
    c.advance(60000)
    expect(al.tick()).toBe(false)
    expect(isLevel(app.pose)).toBe(false)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilt, 9)   // 한 톨도 안 움직인다
  })

  it('올려다보는 시점도 산다 — 부호 대칭', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, 80, -120)
    const tilt = pitchDeg(app.pose)
    expect(tilt).toBeGreaterThan(8.5)
    settle(app, c, al)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilt, 9)
  })

  it('뷰 큐브 윗면(탑뷰)이 머무는 시점이 됐다 — 종전 「예외 없음」 규칙의 폐기 지점', () => {
    // web2-04는 «기울어진 상태는 지나가는 상태»였고 탑뷰도 1.2 s 뒤 접혔다.
    // 지시 3이 그 규칙을 뒤집는다 — 임계 밖 자세는 머무는 상태다.
    const app = drawn()
    const top = poseForElem(app.lift.an, { kind: 'face', dirLocal: v3(0, 1, 0) }, orbitPivot(app), 500)!
    setPose(app, top)
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.touch()
    settle(app, c, al)
    expect(forwardOf(app.pose).y).toBeCloseTo(-1, 6)  // 여전히 똑바로 내려다본다
  })

  it('기울여 저장한 시점이 산다 — 「보관할 길이 없다」가 풀렸다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, 120)
    const sh = addSheet(app)
    al.release()
    setPose(app, { p: { x: 0, y: C.EYE_HEIGHT, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } })
    gotoSheet(app, sh.id); al.touch()
    const tilt = pitchDeg(app.pose)
    expect(Math.abs(tilt)).toBeGreaterThan(8.5)
    settle(app, c, al)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilt, 9)   // 저장한 기울기가 남는다
  })

  it('그리려고 눌러도 안 접힌다 — foldNow가 false를 내고 그 자세에서 그린다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -160, 120)
    al.release()
    const tilt = pitchDeg(app.pose)
    expect(al.foldNow()).toBe(false)
    expect(al.folding()).toBe(false)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilt, 12)
  })
})

describe('임계 안 — 종전대로 접힌다 (기존 기전이 안 죽었다)', () => {
  it('살짝 기울인 채 놓으면 접힌다 — foldNow도 true다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, -8)             // 피치 ≈ 2.3° < 3.08° · 요 −17.2°(축에서 멀다)
    expect(isLevel(app.pose)).toBe(false)
    const yaw0 = yawDir(app.pose)
    settle(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 6)   // 요는 새 값(축 근처가 아니다)
  })

  it('경계 양쪽을 가른다 — 임계 1.05배는 남고 0.95배는 접힌다 (반증 조건 · D-3)', () => {
    for (const [k, folds] of [[1.05, false], [0.95, true]] as const) {
      const app = drawn()
      const c = clock()
      const al = createAutoLevel(app, c.now)
      al.grab(); orbitBy(app, -60, -epsPx(app) * k)
      const before = pitchDeg(app.pose)
      settle(app, c, al)
      expect(isLevel(app.pose), `k=${k}`).toBe(folds)
      if (!folds) expect(pitchDeg(app.pose)).toBeCloseTo(before, 9)
    }
  })

  it('임계 = min(atan(f/6W), 8.25°) — 두 갈래를 양쪽 픽스처로 가른다 (D-5 · 1차 리뷰어 [1][2])', () => {
    // ① 상한 갈래(망원): f≈2.7W이면 atan(f/6W)=24.5°인데 상한 8.25°가 자른다 —
    //    12° 내려다보기가 산다. **f 비례 단독이었다면 여기서 접힌다**(기각한 대안의 반례).
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(3600, 400, 3600, 400)     // vp0 = 2.5W (찍기)
    s.draw(-3000, 400, -3000, 400)   // vp1 = 3W (찍기)
    s.draw(500, 300, 500, 500)
    expect(s.app.lift.an.f! / W).toBeGreaterThan(2)   // 좁은 화각이다
    expect(snapAngle(s.app.lift.an.f, W)).toBeCloseTo(POSE_SNAP_RAD, 12)  // 상한이 걸렸다
    const c = clock()
    const al = createAutoLevel(s.app, c.now)
    al.grab(); orbitBy(s.app, -60, 42)               // 피치 ≈ −12°
    const tilt = pitchDeg(s.app.pose)
    settle(s.app, c, al)
    expect(pitchDeg(s.app.pose)).toBeCloseTo(tilt, 9)

    // ② 대역 갈래(광각): drawn()은 f=0.32W라 atan(f/6W)=3.08°다. 5.7° 기울기의 세로
    //    소실점은 f/tan(5.7°) ≈ 3.2W — 작도 대역(6W) **안**이라 세로선이 화면에서
    //    명백히 모인다. 그것은 접지 않는다 — **고정 8.25° 단독이었다면 여기서 접힌다**
    //    (초판이 그랬고 1차 리뷰어 [1]이 잡았다).
    const app = drawn()
    expect(snapAngle(app.lift.an.f, W)).toBeLessThan(POSE_SNAP_RAD)       // 대역이 걸렸다
    const c2 = clock()
    const al2 = createAutoLevel(app, c2.now)
    al2.grab(); orbitBy(app, -60, 20)                // 피치 ≈ −5.7°
    const tilt2 = pitchDeg(app.pose)
    settle(app, c2, al2)
    expect(pitchDeg(app.pose)).toBeCloseTo(tilt2, 9)
  })
})

describe('2점 → 1점 — 요가 축과 임계 안이면 그 축으로 붙는다', () => {
  // drawn()의 가로축 요(도): vp0 ≈ +37.8° · vp1 ≈ −52.3° (+180° 짝 포함)
  const AXIS0_DEG = Math.atan2(300, 387.298) * 180 / Math.PI

  it('축 근처에서 놓으면 정확히 그 축을 본다 — 1점 정렬', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const ax = app.lift.an.axes.find(a => a.id === 'vp0')!.dir
    al.grab(); orbitBy(app, (AXIS0_DEG - 2) / 0.2865, 0)    // 축에서 2° 못 미친 요 — 임계(3.08°) 안
    expect(isLevel(app.pose)).toBe(true)                     // 좌우 궤도는 정렬을 안 깬다
    expect(yawGap(yawDir(app.pose), ax)).toBeGreaterThan(1)  // 아직 축 위가 아니다
    settle(app, c, al)
    expect(yawGap(yawDir(app.pose), ax)).toBeCloseTo(0, 5)   // 축에 붙었다
    expect(isLevel(app.pose)).toBe(true)
  })

  it('축에서 임계 밖이면 요를 안 건드린다 — 2점 구도가 마음대로 안 돈다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, -60, 0)                          // 요 17.2° — 어느 축에서도 멀다
    const yaw0 = yawDir(app.pose)
    settle(app, c, al)
    expect(yawGap(yawDir(app.pose), yaw0)).toBeCloseTo(0, 9)
  })

  it('기울인 채 접힐 때도 요 스냅이 함께 걸린다 — 임계 안 피치 + 축 근처 요', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const ax = app.lift.an.axes.find(a => a.id === 'vp0')!.dir
    al.grab(); orbitBy(app, (AXIS0_DEG - 2) / 0.2865, -8)
    expect(isLevel(app.pose)).toBe(false)
    settle(app, c, al)
    expect(isLevel(app.pose)).toBe(true)
    expect(yawGap(yawDir(app.pose), ax)).toBeCloseTo(0, 5)
  })

  it('반대 방향(축의 −쪽)도 붙는다 — 후보는 ±축 넷이다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    const ax = app.lift.an.axes.find(a => a.id === 'vp0')!.dir
    const back = v3(-ax.x, 0, -ax.z)
    al.grab(); orbitBy(app, (AXIS0_DEG + 180 + 2) / 0.2865, 0)   // −vp0 요 근처
    settle(app, c, al)
    // acos가 1 근처에서 정밀도를 잃어 정확히 같은 방향도 ~1e-8 rad로 나온다 — 5자리로 잰다
    expect(yawGap(yawDir(app.pose), back)).toBeCloseTo(0, 5)
  })

  it('정확히 축 위면 아무것도 안 한다 — 항등에 애니메이션을 걸지 않는다', () => {
    const app = drawn()
    const c = clock()
    const al = createAutoLevel(app, c.now)
    al.grab(); orbitBy(app, AXIS0_DEG / 0.2865, 0)
    const ax = app.lift.an.axes.find(a => a.id === 'vp0')!.dir
    // 궤도 픽셀 환산 오차만큼 축에서 어긋나 있다 — 먼저 한 번 붙인다
    settle(app, c, al)
    expect(yawGap(yawDir(app.pose), ax)).toBeCloseTo(0, 5)
    // 축 위에서 다시 지연을 넘겨도 tick이 아무것도 안 한다
    c.advance(C.FOLD_DELAY_MS + 1)
    expect(al.tick()).toBe(false)
    expect(al.folding()).toBe(false)
  })
})

describe('머무는 자세에서의 입력 — 조용히 틀린 배치를 만들지 않는가 (1차 리뷰어 [5])', () => {
  it('그린 획이 3D로 올라가고 **그 포즈의 사영이 확정 2D와 일치한다**(불변식 k)', () => {
    const app = drawn()
    orbitBy(app, -160, 120)                            // 임계 밖 — 머무는 자세
    expect(pitchDeg(app.pose)).toBeLessThan(-20)
    const seg = [...app.lift.lifted.values()][0]!
    const a = project(app.lift.an, app.pose, seg.b3)!  // 확정 끝점에서 잇는다(사람이 하는 것)
    const ax = screenAxes(app.lift.an, app.pose).find(x => x.id === 'vp0')!
    const t = ax.vp ? { x: a.x + (ax.vp.x - a.x) * 0.15, y: a.y + (ax.vp.y - a.y) * 0.15 }
      : { x: a.x + ax.dir!.x * 80, y: a.y + ax.dir!.y * 80 }
    const st = commitStroke(app, a, t)
    expect(st.view).toBeDefined()                      // 그 포즈가 실려 있다
    expect(app.lift.lifted.has(st.id)).toBe(true)      // 3D로 올라갔다
    const g = app.lift.lifted.get(st.id)!
    const pa = project(app.lift.an, st.view!, g.a3)!
    const pb = project(app.lift.an, st.view!, g.b3)!
    expect(pa.x).toBeCloseTo(st.a.x, 6)                // 확정 2D = 3D의 사영 (실측 fp 급)
    expect(pa.y).toBeCloseTo(st.a.y, 6)
    expect(pb.x).toBeCloseTo(st.b.x, 6)
    expect(pb.y).toBeCloseTo(st.b.y, 6)
  })

  it('지우개도 열려 있다 — 남는 조각이 **원래 3D 직선 위**에 다시 선다', () => {
    // 수직 획을 깊이축 획이 가로질러 조각이 둘이 되게 한다(한 조각이면 지우개가
    // 통째로 지워 «남는 조각»이라는 물음 자체가 없다 — 첫 판이 그래서 아무것도 안 쟀다)
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 300)      // 수직 — 3D에 선다
    s.draw(500, 400, 560, 385)      // 수직선 위 (500,400)에서 vp0 쪽으로 — 3D 교차를 만든다
    const app = s.app
    const vert = app.doc.strokes[3]!
    expect(app.lift.lifted.has(vert.id)).toBe(true)
    const before = app.lift.lifted.get(vert.id)!
    orbitBy(app, -160, 120)                            // 임계 밖 — 머무는 자세
    // 위쪽 조각의 3D 중간쯤(꼭대기 90%)을 지금 포즈로 사영해 지운다 — 사람이 화면에서 하는 것
    const hi3 = v3(
      before.a3.x + (before.b3.x - before.a3.x) * 0.9,
      before.a3.y + (before.b3.y - before.a3.y) * 0.9,
      before.a3.z + (before.b3.z - before.a3.z) * 0.9)
    const hi2 = project(app.lift.an, app.pose, hi3)!
    app.tool = 'eraser-pencil'
    beginErase(app); eraseAt(app, hi2); endErase(app)
    expect(app.doc.strokes.some(s => s.id === vert.id)).toBe(false)   // 원본이 잘렸다
    const pieces = app.doc.strokes.filter(s => s.view && s.id > vert.id)
    expect(pieces.length).toBeGreaterThan(0)
    // 각 조각이 다시 3D로 서고, 끝점이 원래 직선에서 안 벗어난다
    const d = norm3(v3(before.b3.x - before.a3.x, before.b3.y - before.a3.y, before.b3.z - before.a3.z))
    const distToLine = (p: V3) => {
      const w = v3(p.x - before.a3.x, p.y - before.a3.y, p.z - before.a3.z)
      const t = w.x * d.x + w.y * d.y + w.z * d.z
      return Math.hypot(w.x - d.x * t, w.y - d.y * t, w.z - d.z * t)
    }
    for (const s of pieces) {
      const g = app.lift.lifted.get(s.id)
      expect(g, `조각 ${s.id}이 대기로 떨어졌다`).toBeDefined()
      expect(distToLine(g!.a3)).toBeLessThan(1e-6)
      expect(distToLine(g!.b3)).toBeLessThan(1e-6)
    }
  })
})
