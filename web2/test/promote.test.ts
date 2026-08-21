// 차수 승격(f 변경)이 무엇을 바꾸고 무엇을 안 바꾸는가 — **양성 채널이 있는 팔**
//
// ⚠ 이 파일이 있는 이유: 「불변식 k 통과」가 **측정이 아니라 구성상 보장**이기 때문이다
// (CLAUDE.md §5.1의 자기참조 유형 3 · PITFALLS #30 「입사 관계에서 유도한 양은 f에
// 반응하지 않는다」). 리프팅은 2D 좌표에서 매번 다시 푸는데, 시작점은 사영 일치로 찾고
// 끝점은 광선 교점으로 놓는다 — 그러니 **어떤 f를 넣어도 작도 시점 재사영은 원래 2D다.**
// 0이 나오는 것이 당연하므로 그 0에 임계를 걸어 봐야 아무것도 안 잰다.
//
// 그래서 **같은 승격이 실제로 기하를 바꿨다는 것을 따로 보인다** — 궤도 시점에서.
// 그 값이 0이면 위의 0도 무의미하다는 뜻이다(양성 채널).

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { project, DRAW_POSE } from '../src/core/camera'
import { quatAxisAngle, type Quat, type V3 } from '../src/core/vec'

const ORBIT = { p: { x: 3, y: 1.6, z: 3 } as V3, q: quatAxisAngle({ x: 0, y: 1, z: 0 }, 0.4) as Quat }

/** 1점 상태에서 기둥까지 세운 문서 */
function onePoint() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)   // 소실점 1 — f는 임의 게이지(DEFAULT_F_RATIO)
  s.draw(500, 500, 500, 300)   // 기둥
  return s
}

const shot = (s: ReturnType<typeof session>, pose: any) => {
  const m = new Map<number, { a: any; b: any }>()
  for (const [id, g] of s.app.lift.lifted) {
    const a = project(s.app.lift.an, pose, g.a3), b = project(s.app.lift.an, pose, g.b3)
    if (a && b) m.set(id, { a, b })
  }
  return m
}
const maxMove = (was: Map<number, any>, now: Map<number, any>) => {
  let w = 0
  for (const [id, p] of was) {
    const q = now.get(id); if (!q) continue
    w = Math.max(w, Math.hypot(q.a.x - p.a.x, q.a.y - p.a.y), Math.hypot(q.b.x - p.b.x, q.b.y - p.b.y))
  }
  return w
}

describe('승격 — 작도 시점은 안 움직이고, 기하는 실제로 바뀐다', () => {
  it('작도 시점 재사영은 정확히 0 — 다만 이것은 **보장이지 측정이 아니다**', () => {
    const s = onePoint()
    const before = shot(s, DRAW_POSE)
    expect(s.app.lift.an.fSource).toBe('default')
    s.draw(500, 500, 400, 475)              // 소실점 2 → f 확정
    expect(s.app.lift.an.fSource).toBe('two-vp')
    expect(maxMove(before, shot(s, DRAW_POSE))).toBeLessThan(1e-9)
  })

  it('양성 채널 — 같은 승격이 궤도 시점에서는 크게 움직인다 (0이면 위 검사가 헛것이다)', () => {
    const s = onePoint()
    const before = shot(s, ORBIT)
    const f1 = s.app.lift.an.f!
    s.draw(500, 500, 400, 475)
    const f2 = s.app.lift.an.f!
    expect(Math.abs(f2 - f1)).toBeGreaterThan(100)      // f가 실제로 바뀌었다
    const moved = maxMove(before, shot(s, ORBIT))
    // 1점의 f는 **임의 게이지**다(이론서 16.2·16.4: 남는 자유도는 깊이 방향 아핀변환).
    // 그 배율로 만든 입체를 돌려 보면, 승격으로 f가 확정될 때 형상이 실제로 바뀐다.
    // 크기를 여기 박아 둔다 — 조용히 달라지면 이 팔이 먼저 깨진다.
    //
    // ⚠ **범위만으로는 안 깨지고 죽는다**(PITFALLS #56 · 리뷰어 [12]). 100~400은 넓어서
    // 리프팅 규칙이 바뀌어도 값이 그 안에서 움직이면 아무 말을 안 한다. 그래서 **실측값을
    // 함께 박는다**: `248.276`(2026-08-21 재측정. 지시 1·2 **전후로 같다** — 같은 하네스로
    // 기준 커밋 c4a4b4d에서도 248.276이 나왔다. web2/HANDOFF의 「206 px」는 그 이전 값이고
    // 이 픽스처를 안 낸다). 결정적이므로 오차 대역이 좁아도 된다.
    expect(moved).toBeGreaterThan(100)
    expect(moved).toBeLessThan(400)
    expect(moved).toBeCloseTo(248.276, 2)
  })

  it('그래서 1점에서 궤도한 화면은 «아직 정해지지 않은 깊이»를 보여 준다 — 알려진 귀결', () => {
    // 궤도 게이트를 「소실점 둘」에서 「3D 기하가 있는가」로 푼 것(지시 1)의 대가다.
    // 되돌리면 1점에서 못 도는데, 그것이 사람이 「순서가 강제된다」고 읽은 자리였다.
    // 값을 감추지 않고 팔에 남긴다(A-3: 측정을 따른다 · 범위를 넓히지 않는다).
    const s = onePoint()
    expect(s.app.lift.an.fSource).toBe('default')  // 임의 게이지
    expect(s.app.lift.lifted.size).toBeGreaterThan(0) // 그래도 돌 것은 있다
  })
})
