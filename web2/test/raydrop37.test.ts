// web2-37 4번 — **대기 획은 광선이 바뀌면 버린다.**
//
// 대기 획의 유일한 내용은 「그 시점의 화면 위 어디」다. 3D가 없으니 공간에 자리가 없고
// 화면 좌표가 전부다. 시점이 바뀌면 그 좌표가 가리키던 **광선이 달라지므로 그 정보는
// 거짓이 된다.** 「애매하면 놓지 않되 버리지 않는다」와 안 부딪힌다 — 그 원칙은 **아직 쓸
// 수 있는** 정보를 버리지 말라는 것이고, 시점이 바뀐 뒤의 대기 획은 쓸 수 있는 정보가 아니다.
//
//     버린다   궤도 · 뷰 큐브 90° · 렌즈 변경     ← 광선이 바뀐다
//     따라간다 이동 · 확대                        ← 화면평면이 미끄러질 뿐
//
// ⚠ **반증 조건**(D-3): 「버린다」쪽만 재면 **전부 버리는 판**에서도 초록이다. 그래서 두 축을
// 한 팔에서 같이 잰다 — 이동·확대에서 **남는가**가 그 판을 빨갛게 만든다(아래 위약 칸이
// 그것을 실제로 보인다). 승격 획이 그대로인지도 같이 잰다(대기만 가야 한다).

import { describe, it, expect } from 'vitest'
import { orbitBy, panBy, dollyBy, setPose, setViewF, resetViewLens, undo, redo, isDrawPose } from '../src/app/state'
import { DRAW_POSE } from '../src/core/camera'
import { session } from './session'
import { W, H } from './fixtures'

/** 발판: 작도 셋 + 세로 하나(3D가 선다) + **대기로 남는 자유 획 둘**.
 *  ⚠ 대기 획이 실제로 생겼는지부터 확인한다 — 0건이면 이 팔은 아무것도 안 잰다(#32). */
function scene() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)        // 지평선(대기 — onHorizon)
  s.draw(500, 500, 600, 475)         // 깊이1 → vp0
  s.draw(500, 500, 400, 475)         // 깊이2 → vp1
  s.draw(500, 500, 500, 300)         // 세로 — 3D가 선다
  s.draw(240, 210, 330, 175)         // 허공의 자유 획(대기)
  s.draw(220, 620, 300, 660)         // 또 하나(대기)
  return s
}

const snap = (app: ReturnType<typeof session>['app']) => ({
  strokes: app.doc.strokes.length,
  lifted: [...app.lift.lifted.keys()].sort((a, b) => a - b),
  waiting: [...app.lift.waiting].sort((a, b) => a - b),
})

describe('37-4 — 대기 획은 광선이 바뀌면 버린다', () => {
  it('궤도 후 대기 획이 사라진다 · 확정 획은 그대로', () => {
    const s = scene()
    const before = snap(s.app)
    expect(before.waiting.length, '대기 획이 있어야 이 팔이 무엇이든 잰다').toBeGreaterThan(0)
    orbitBy(s.app, 60, 12)
    const after = snap(s.app)
    console.log(`[37-4 궤도] 대기 ${before.waiting.length} → ${after.waiting.length} `
      + `· 승격 ${before.lifted.length} → ${after.lifted.length} `
      + `· 획 ${before.strokes} → ${after.strokes}`)
    expect(after.waiting).toEqual([])
    expect(after.lifted, '승격 획은 한 개도 안 간다').toEqual(before.lifted)
    expect(after.strokes).toBe(before.strokes - before.waiting.length)
  })

  it('뷰 큐브 90°(setPose)도 같은 문을 지난다 — 손잡이 이름이 아니라 광선이 기준이다', () => {
    const s = scene()
    const before = snap(s.app)
    const p = s.app.pose
    setPose(s.app, { p: { x: p.p.x + 1, y: p.p.y, z: p.p.z }, q: { ...p.q } })
    expect(snap(s.app).waiting).toEqual([])
    expect(snap(s.app).lifted).toEqual(before.lifted)
  })

  it('렌즈 변경도 버린다 — f가 달라지면 같은 화면점이 다른 광선이다', () => {
    const s = scene()
    const before = snap(s.app)
    const f = s.app.lift.an.f
    if (f === null) return                       // 렌즈가 잠긴 국면 — 잴 것이 없다
    const took = setViewF(s.app, f * 1.6)
    if (!took) return                            // 확정 전에는 렌즈가 안 먹는다(31-2)
    console.log(`[37-4 렌즈] 대기 ${before.waiting.length} → ${snap(s.app).waiting.length}`)
    expect(snap(s.app).waiting).toEqual([])
    expect(snap(s.app).lifted).toEqual(before.lifted)
    resetViewLens(s.app)
  })

  it('⚠ 이동·확대에서는 **남는다** — 화면평면이 미끄러질 뿐이다 (이 칸이 반증이다)', () => {
    const s = scene()
    const before = snap(s.app)
    expect(isDrawPose(s.app.pose), '작도 포즈에서의 이동·확대다').toBe(true)
    panBy(s.app, 40, -25)
    const afterPan = snap(s.app)
    dollyBy(s.app, 1.4, { x: 600, y: 400 })
    const afterZoom = snap(s.app)
    console.log(`[37-4 이동·확대] 대기 ${before.waiting.length} → 이동 ${afterPan.waiting.length} `
      + `→ 확대 ${afterZoom.waiting.length}`)
    // 「전부 버리는 판」은 여기서 빨개진다 — 그래서 위 세 칸에 판별력이 있다
    expect(afterPan.waiting).toEqual(before.waiting)
    expect(afterZoom.waiting).toEqual(before.waiting)
    expect(afterZoom.strokes).toBe(before.strokes)
  })

  it('대기 획이 화면평면을 따라간다 — 이동한 만큼 화면에서 옮겨진다(문서 좌표는 불변)', () => {
    const s = scene()
    const wid = s.app.lift.waiting[0]!
    const st = s.app.doc.strokes.find(x => x.id === wid)!
    const a0 = { ...st.a }
    const v0 = { ...s.app.view }
    panBy(s.app, 40, -25)
    const v1 = s.app.view
    // 문서 좌표는 그대로이고(원칙 b) 화면 자리는 뷰가 옮긴다 — 그것이 「따라간다」의 내용이다
    expect(s.app.doc.strokes.find(x => x.id === wid)!.a).toEqual(a0)
    expect(v1.ox - v0.ox).toBe(40)
    expect(v1.oy - v0.oy).toBe(-25)
  })

  it('실행취소로 되살아난다 — **그 궤도까지** 무른다(안 그러면 다음 시점 변경에서 또 간다)', () => {
    const s = scene()
    const before = snap(s.app)
    const pose0 = { p: { ...s.app.pose.p }, q: { ...s.app.pose.q } }
    orbitBy(s.app, 60, 12)
    expect(snap(s.app).waiting).toEqual([])
    expect(s.app.pose.p).not.toEqual(pose0.p)          // 실제로 돌았다
    undo(s.app)
    const back = snap(s.app)
    // ⚠ 획만 되돌리면 «되살아난다»가 쓸모없다 — 돌아온 대기 획의 내용은 「그 시점의 화면
    //   위 어디」인데 지금 시점이 그 시점이 아니고, 다음 시점 변경에서 **또 버려진다**
    //   (실측으로 그랬다: 실행취소 → 작도 시점 버튼 → 도로 사라졌다).
    expect(s.app.pose.p, '시점도 돌아온다').toEqual(pose0.p)
    expect(s.app.pose.q, '시점도 돌아온다').toEqual(pose0.q)
    console.log(`[37-4 실행취소] 획 ${before.strokes} → 궤도 후 ${before.strokes - before.waiting.length} → 되살림 ${back.strokes}`)
    expect(back.strokes).toBe(before.strokes)
    expect(back.waiting).toEqual(before.waiting)
    redo(s.app)
    expect(snap(s.app).strokes).toBe(before.strokes - before.waiting.length)
    expect(s.app.pose.p, '다시 실행은 그 궤도도 다시 건다').not.toEqual(pose0.p)
  })

  it('버릴 것이 없으면 op를 안 쌓는다 — 궤도마다 실행취소가 쌓이지 않는다', () => {
    const s = scene()
    orbitBy(s.app, 60, 12)                    // 여기서 한 번 버린다
    const depth = s.app.undoStack.length
    orbitBy(s.app, 20, 5)
    orbitBy(s.app, -20, -5)
    expect(s.app.undoStack.length, '두 번째·세 번째 궤도는 아무것도 안 쌓는다').toBe(depth)
  })

  it('작도 포즈로 되돌아가도 승격 획은 그대로다 — 버려진 것은 대기뿐이다', () => {
    const s = scene()
    const lifted0 = snap(s.app).lifted
    orbitBy(s.app, 60, 12)
    setPose(s.app, DRAW_POSE)
    expect(snap(s.app).lifted).toEqual(lifted0)
  })
})
