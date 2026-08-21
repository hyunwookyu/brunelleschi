// **궤도 반경을 조절할 수 있다** (web2-06 지시 5)
//
// 증상: 돌려보다가 줌해서 거리를 맞춰도 **접히면 도로 돌아간다.** 그래서 궤도 반경이
// 사실상 «앵커가 정한 값»으로 고정돼 있었다. web2-05가 그 물음을 열린 채로 남겼다
// (HANDOFF의 AS-C14: 「돌려보다 줌해서 맞춘 거리가 접으면 사라지는가」 · 되돌릴 조건은
//  «그 사용이 관측되면»이었고 — 이번 지시가 그 관측이다).
//
// 재현(고치기 전) — 궤도 전 7.565 → 궤도 후 7.565 → 줌 ×2 후 3.782 → **접은 뒤 7.565**
//
// 고친 근거는 **궤도가 반경을 구성상 보존한다**는 것이다(회전이므로). 그러니 반경이
// 달라졌다면 궤도의 부산물일 수 없고 **사람이 정한 값**이다 — #60의 물음(「그 값이 어디서
// 왔는가」)을 한 겹 더 판 답이고, 높이와 정반대다(높이는 궤도가 바꾼다).
//
// ⚠ **줌 계산이 `input.ts` 안에 있어서 시험이 앱의 줌을 못 불렀다.** `state.ts`의
//    `dollyBy`/`panBy`로 옮겼다 — `orbitBy`를 옮긴 것과 같은 이유이고, 그것이 없었으면
//    이 파일은 앱이 아니라 자기가 쓴 산술을 쟀을 것이다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import {
  orbitBy, orbitPivot, orbitRadius, dollyBy, panBy, setPose, isDrawPose, type App,
} from '../src/app/state'
import { createAutoLevel } from '../src/app/autolevel'
import { levelPose, isLevel } from '../src/core/level'
import { DRAW_POSE } from '../src/core/camera'
import { C } from '../src/core/constants'

function drawn(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(500, 500, 500, 380)
  expect(s.app.lift.lifted.size).toBeGreaterThan(0)
  return s.app
}

/** 앱과 같은 경로로 접는다 — 가짜 시계로 지연·애니메이션을 넘긴다 */
function foldNow(app: App, act: (al: ReturnType<typeof createAutoLevel>) => void) {
  let t = 1000
  const al = createAutoLevel(app, () => t)
  al.grab()
  act(al)
  al.release()
  t += C.FOLD_DELAY_MS + C.FOLD_ANIM_MS + 1
  al.tick()
  t += C.FOLD_ANIM_MS + 1
  al.tick()
  return al
}

describe('지시 5 — 궤도 반경', () => {
  it('**재현**: 궤도 중에 줌한 반경이 접은 뒤에도 남는다', () => {
    const app = drawn()
    const r0 = orbitRadius(app)
    expect(r0).toBeCloseTo(7.565, 3)
    foldNow(app, () => {
      orbitBy(app, 90, 60)
      expect(orbitRadius(app)).toBeCloseTo(r0, 9)      // 궤도는 반경을 안 바꾼다
      dollyBy(app, 2, { x: 600, y: 400 })
      expect(orbitRadius(app)).toBeCloseTo(r0 / 2, 9)
    })
    expect(isLevel(app.pose)).toBe(true)
    expect(orbitRadius(app)).toBeCloseTo(r0 / 2, 6)     // ← 고치기 전에는 r0로 돌아갔다
  })

  it('멀어지는 쪽도 같다 — 배율이 대칭이다', () => {
    const app = drawn()
    const r0 = orbitRadius(app)
    foldNow(app, () => { orbitBy(app, -120, 80); dollyBy(app, 0.4, { x: 600, y: 400 }) })
    expect(orbitRadius(app)).toBeCloseTo(r0 / 0.4, 6)
  })

  it('**궤도가 반경을 안 바꾼다**(이 규칙의 전제) — 여덟 방향에서', () => {
    const app = drawn()
    const r0 = orbitRadius(app)
    for (const [dx, dy] of [[100, 0], [-100, 0], [0, 100], [0, -100],
                            [70, 70], [-70, 70], [70, -70], [-70, -70]] as const) {
      setPose(app, { p: { ...DRAW_POSE.p }, q: { ...DRAW_POSE.q } })
      orbitBy(app, dx, dy)
      expect(orbitRadius(app), `${dx},${dy}`).toBeCloseTo(r0, 9)
    }
  })

  it('**양성 채널**: 줌이 없으면 접기가 옛 규칙과 한 톨도 안 다르다(배율 = 1)', () => {
    const app = drawn()
    const pivot = orbitPivot(app)
    const anchor = { p: { ...app.pose.p }, q: { ...app.pose.q } }
    const y0 = app.pose.p.y, r0 = orbitRadius(app)
    orbitBy(app, 140, -90)
    const f = levelPose(anchor, app.pose, pivot)
    expect(f.p.y).toBeCloseTo(y0, 12)
    expect(Math.hypot(f.p.x - pivot.x, f.p.y - pivot.y, f.p.z - pivot.z)).toBeCloseTo(r0, 12)
  })

  it('작도 포즈의 줌은 **화면 배율**이다 — 갈래가 안 섞였다', () => {
    const app = drawn()
    expect(isDrawPose(app.pose)).toBe(true)
    const before = { ...app.pose.p }
    dollyBy(app, 2, { x: 600, y: 400 })
    expect(app.view.s).toBeCloseTo(2, 9)
    expect(app.pose.p).toEqual(before)                 // 카메라는 안 움직였다
  })

  it('3D가 없으면 궤도 줌이 아무것도 안 한다 — 돌 것이 없는 갈래', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    setPose(s.app, { p: { x: 0, y: 1.6, z: 2 }, q: { ...DRAW_POSE.q } })
    const before = { ...s.app.pose.p }
    dollyBy(s.app, 2, { x: 600, y: 400 })
    expect(s.app.pose.p).toEqual(before)
  })

  it('⚠ **안 지키는 것**: 궤도 중의 팬은 접으면 되돌아간다 (알고 남긴다 · DEFERRED)', () => {
    const app = drawn()
    const r0 = orbitRadius(app)
    let during = 0
    foldNow(app, () => {
      orbitBy(app, 60, 40)
      const before = { ...app.pose.p }
      panBy(app, 120, 0)
      during = Math.hypot(app.pose.p.x - before.x, app.pose.p.y - before.y, app.pose.p.z - before.z)
    })
    // 팬이 옮긴 거리 vs 접은 뒤 반경에 남은 몫 — **산문이 아니라 수로 남긴다**
    const kept = Math.abs(orbitRadius(app) - r0)
    // eslint-disable-next-line no-console
    console.log(`팬: 옮긴 거리 ${during.toFixed(3)} · 접은 뒤 반경 차 ${kept.toFixed(3)} (r0=${r0.toFixed(3)})`)
    expect(during).toBeGreaterThan(1)          // 팬은 실제로 옮겼고
    expect(kept / during).toBeLessThan(0.35)   // 그 대부분은 접기가 지웠다 — 「옆으로」는 안 남는다
    expect(isLevel(app.pose)).toBe(true)
  })
})
