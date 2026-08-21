// **궤도 반경을 조절할 수 있다** (web2-06 지시 5)
//
// 증상: 돌려보다가 줌해서 거리를 맞춰도 **접히면 도로 돌아간다.** 그래서 궤도 반경이
// 사실상 «앵커가 정한 값»으로 고정돼 있었다. web2-05가 그 물음을 열린 채로 남겼다
// (HANDOFF의 AS-C14: 「돌려보다 줌해서 맞춘 거리가 접으면 사라지는가」 · 되돌릴 조건은
//  «그 사용이 관측되면»이었고 — 이번 지시가 그 관측이다).
//
// 재현(고치기 전) — 궤도 전 7.225 → 궤도 후 7.225 → 줌 ×2 후 3.613 → **접은 뒤 7.225**
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
  orbitBy, orbitPivot, orbitRadius, dollyBy, panBy, setPose, isDrawPose, undo, type App,
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
    expect(r0).toBeCloseTo(7.225, 3)
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

  it('**눈높이는 보존되지 않는다 — pivot 기준으로 같은 배율을 탄다**(1차 리뷰어 [5])', () => {
    // 문서 둘이 갈려 있었다: NOTES는 「되돌리는 것 = 높이」, HANDOFF는 「높이도 배율만큼
    // 따라간다」. 참인 것은 **pivot 기준 변위에 배율이 걸린다**이고, 그래서
    // **pivot이 눈높이에 있으면 그대로**이고 아니면 움직인다. `fold_measure`의 픽스처는
    // pivot이 눈높이에 있어(기둥이 지평선을 걸친다) **이 물음을 못 가른다** — D-5의 자리다.
    const app = drawn()
    const pv = orbitPivot(app)
    const y0 = app.pose.p.y
    expect(pv.y).not.toBeCloseTo(y0, 2)          // 이 픽스처는 pivot이 눈높이에 없다(판별력)
    foldNow(app, () => { orbitBy(app, 90, 60); dollyBy(app, 2, { x: 600, y: 400 }) })
    expect(app.pose.p.y - pv.y).toBeCloseTo((y0 - pv.y) / 2, 6)
    expect(app.pose.p.y).toBeLessThan(y0)        // 다가가면 눈높이가 pivot 쪽으로 내려간다

    // **정렬 포즈에서 그냥 줌해도 같은 일이 난다** — 그래서 «궤도의 부산물»이 아니다(#62)
    const app2 = drawn()
    const pv2 = orbitPivot(app2), y2 = app2.pose.p.y
    setPose(app2, { p: { x: 0.001, y: y2, z: 0 }, q: { ...DRAW_POSE.q } })  // 작도 포즈를 벗어난다
    dollyBy(app2, 2, { x: 600, y: 400 })
    expect(app2.pose.p.y - pv2.y).toBeCloseTo((y2 - pv2.y) / 2, 3)
  })

  it('작도 포즈의 줌은 **화면 배율**이다 — 갈래가 안 섞였다', () => {
    const app = drawn()
    expect(isDrawPose(app.pose)).toBe(true)
    const before = { ...app.pose.p }
    dollyBy(app, 2, { x: 600, y: 400 })
    expect(app.view.s).toBeCloseTo(2, 9)
    expect(app.pose.p).toEqual(before)                 // 카메라는 안 움직였다
  })

  it('**pivot이 바뀌면 배율이 1에서 어긋나는가** — 1차 리뷰어의 확인 요청', () => {
    // 물음: 같은 세션의 지시 4가 pivot을 옮긴다. 반경은 `|eye − pivot|`이므로 pivot이
    // 옮겨가면 사람이 아무것도 안 해도 반경이 바뀐다 — 그러면 「반경이 변했다면 사람이
    // 정한 것」이라는 #62의 논거가 그 자리에서 안 서는 것 아닌가?
    //
    // 답: **배율은 같은 pivot으로 두 거리를 재는 «비»라 pivot 이동이 대부분 상쇄된다.**
    // 그리고 **기울어 있는 동안 pivot을 바꿀 길이 거의 없다** — 그리기도 지우기도
    // 기울면 막혀 있다(`input.ts`). 남는 길은 **실행취소**뿐이고, 그것도 궤도가 옛 pivot
    // 둘레의 회전이라 새 pivot 기준으로는 두 거리가 정확히 같지 않아 **조금** 어긋난다.
    const s = session(W, H)
    s.draw(100, 400, 1100, 400); s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475); s.draw(500, 500, 500, 380)
    s.app.tool = 'pen'; s.draw(500, 500, 600, 475)      // 펜 획 — pivot이 여기 붙는다
    const app = s.app
    const y0 = app.pose.p.y
    foldNow(app, () => { orbitBy(app, 90, 60); undo(app) })  // 기울어 있는 동안 펜 획을 되돌린다
    // 실측: 반경 7.448 → (실행취소로 pivot이 튄다) 6.783 → 접은 뒤 6.783 · 눈높이 1.600 → 1.598
    expect(app.pose.p.y).toBeCloseTo(y0, 2)             // 어긋남이 **0.01 아래**다
    expect(app.pose.p.y).not.toBe(y0)                   // 그러나 0은 아니다 — 알고 적는다
    expect(isLevel(app.pose)).toBe(true)
  })

  it('3D가 없으면 궤도 줌이 아무것도 안 한다 — 돌 것이 없는 갈래', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    setPose(s.app, { p: { x: 0, y: 1.6, z: 2 }, q: { ...DRAW_POSE.q } })
    const before = { ...s.app.pose.p }
    dollyBy(s.app, 2, { x: 600, y: 400 })
    expect(s.app.pose.p).toEqual(before)
  })

  it('⚠ **팬은 «옆으로»를 안 남긴다 — 다만 팬이 반경에 남긴 몫은 줌으로 읽힌다**', () => {
    // ⚠ 1차 리뷰어 [10]: 초판은 「팬이 2.240 옮기면 0.306만 남는다(13.7%)」로 적었는데
    //    **2.240은 카메라 이동 거리이고 0.306은 반경 차**라 같은 양이 아니었다.
    //    같은 양으로 다시 잰다 — 반경 대 반경, 그리고 «옆으로»가 지워지는 것은 따로 잰다.
    const app = drawn()
    const pivot0 = orbitPivot(app)
    const anchor = { p: { ...app.pose.p }, q: { ...app.pose.q } }
    const r0 = orbitRadius(app), y0 = app.pose.p.y
    let rPan = 0, moved = 0
    foldNow(app, () => {
      orbitBy(app, 60, 40)
      const before = { ...app.pose.p }
      panBy(app, 120, 0)
      moved = Math.hypot(app.pose.p.x - before.x, app.pose.p.y - before.y, app.pose.p.z - before.z)
      rPan = orbitRadius(app)
    })
    const rFold = orbitRadius(app)
    // eslint-disable-next-line no-console
    console.log(`팬: 이동 ${moved.toFixed(3)} · 반경 ${r0.toFixed(3)} → ${rPan.toFixed(3)} → 접은 뒤 ${rFold.toFixed(3)}`)
    // ① 팬이 만든 **반경** 변화는 그대로 남는다 — 규칙이 그것을 «줌»과 구별하지 못한다
    expect(rFold).toBeCloseTo(rPan, 6)
    expect(Math.abs(rPan - r0)).toBeGreaterThan(0.05)      // 팬이 반경을 실제로 건드렸다
    // ①′ **그 몫은 눈높이까지 움직인다**(2차 리뷰어 [N4]) — 배율이 y에도 걸리기 때문이다.
    //     #60이 보던 그 양이 «팬»이라는 다른 경로로 새는 것이므로 수로 박는다.
    //     실측(팬 방향 넷): (120,0) 1.600 → **1.562** · (0,120) 1.717 · (−200,0) **1.879** · (0,−200) 1.643
    expect(app.pose.p.y).toBeCloseTo(1.562, 3)
    expect(Math.abs(app.pose.p.y - y0)).toBeGreaterThan(0.03)   // 안 새지 않는다 — 샌다
    // ② 그러나 «옆으로 옮긴 것»은 지워진다 — 접은 뒤 카메라는 앵커의 베어링 위에 있다
    const b = { x: anchor.p.x - pivot0.x, z: anchor.p.z - pivot0.z }
    const c = { x: app.pose.p.x - pivot0.x, z: app.pose.p.z - pivot0.z }
    const cross = Math.abs(b.x * c.z - b.z * c.x) / Math.hypot(b.x, b.z)  // 앵커 베어링에서의 옆 거리
    expect(cross).toBeGreaterThan(1)          // 요가 달라졌으니 옆에 있는 것은 맞고
    // 그 옆 거리가 **팬이 만든 것이 아니라 요가 만든 것**임을 팬 없이 같은 궤도로 확인한다
    const app2 = drawn()
    foldNow(app2, () => { orbitBy(app2, 60, 40) })
    const c2 = { x: app2.pose.p.x - pivot0.x, z: app2.pose.p.z - pivot0.z }
    const cross2 = Math.abs(b.x * c2.z - b.z * c2.x) / Math.hypot(b.x, b.z)
    // **반경으로 나눠서 견준다** — 접은 자리는 반경에 비례하고, 팬이 그 반경을 조금 바꿨다.
    // 그 비가 같다는 것이 곧 «옆으로 옮긴 몫은 안 남았다»이다.
    expect(cross / rFold).toBeCloseTo(cross2 / orbitRadius(app2), 6)
    expect(isLevel(app.pose)).toBe(true)
  })
})
