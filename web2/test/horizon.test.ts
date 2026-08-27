// **접힌 포즈에서도 지평선을 긋는다** (web2-06 지시 3)
//
// 증상: 돌려보고 접히면 **지평선이 사라진다.** web2-05가 픽셀로 발견하고 범위 밖이라
// 안 고쳤다(`DEFERRED.md`: 「`atDraw`를 `isLevel`로 넓히는 한 줄」).
// 그 회차의 증상 자체가 **「지평선이 위로 올라간다」**였으므로 — 사람이 지평선을 보고
// 눈높이를 읽는다는 뜻이다 — 접은 뒤 그것이 없으면 고쳤는지를 화면에서 확인할 수 없다.
//
// 원인: `render2d`가 `isDrawPose(app.pose)`에서만 그었다. 궤도 포즈에서는 지평선이 화면
// 수평선이 아니므로 **맞는 규칙이었는데**, 접힌 포즈는 피치 0이라 여전히 화면 수평선이다.
//
// ⚠ 이 팔은 「`principal.y`를 반환한다」를 **정의로 확인하지 않는다**(자기참조 · CLAUDE.md §5.1).
//    아주 먼 지면 점의 실제 사영이 그 y로 수렴하는지를 재고, 기운 포즈에서는 **안 수렴하는 것**을
//    함께 재서 「그때 null인 것이 맞다」를 보인다.

import { describe, it, expect } from 'vitest'
import { constructedDoc } from './fixtures'
import { analyze, horizonScreenY, project, DRAW_POSE } from '../src/core/camera'
import { isLevel } from '../src/core/level'
import { v3, quatAxisAngle } from '../src/core/vec'
import type { CamPose } from '../src/core/types'

const an = analyze(constructedDoc().doc)

/** 접힌 포즈 흉내 — 요만 다르고 피치·롤 0. 위치도 옮긴다(접기는 강체 회전이다). */
const folded = (yaw: number): CamPose =>
  ({ p: v3(2.4, 1.6, -3.1), q: quatAxisAngle(v3(0, 1, 0), yaw) })
/** 기운 포즈 — 궤도 중 */
const tilted = (): CamPose => ({ p: v3(0, 4.2, 2), q: quatAxisAngle(v3(1, 0, 0), -0.4) })

/** 지면 위 아주 먼 점의 화면 y — 지평선으로 수렴한다 */
const farGroundY = (pose: CamPose, dist: number) => {
  const fwd = { x: -Math.sin(0), y: 0, z: -1 }
  void fwd
  const p = project(an, pose, v3(pose.p.x + dist * 0.3, 0, pose.p.z - dist))
  return p ? p.y : null
}

describe('지시 3 — 지평선은 정렬된 포즈면 그린다', () => {
  it('작도 포즈에서 그린다 (종전대로)', () => {
    expect(isLevel(DRAW_POSE)).toBe(true)
    expect(horizonScreenY(an, DRAW_POSE)).toBe(an.horizonY)
  })

  it('**접힌 포즈에서도 그린다** — 값은 같은 화면 수평선이다', () => {
    for (const yaw of [0.3, -0.9, 2.7]) {
      const pose = folded(yaw)
      expect(isLevel(pose), `yaw=${yaw}`).toBe(true)
      expect(horizonScreenY(an, pose), `yaw=${yaw}`).toBe(an.horizonY)
    }
  })

  it('그 값이 맞다 — 먼 지면 점의 사영이 거기로 **수렴한다**(정의가 아니라 측정)', () => {
    const pose = folded(0.6)
    const y = horizonScreenY(an, pose)!
    const near = farGroundY(pose, 200)!
    const far = farGroundY(pose, 2e6)!
    expect(Math.abs(far - y)).toBeLessThan(1e-3)          // 수렴했다
    expect(Math.abs(near - y)).toBeGreaterThan(1e-3)      // 가까운 점은 아직 아니다(대조군)
    expect(Math.abs(far - y)).toBeLessThan(Math.abs(near - y))
  })

  it('**반증**: 기울면 null이다 — 그때는 실제로 화면 수평선이 아니다', () => {
    const pose = tilted()
    expect(isLevel(pose)).toBe(false)
    expect(horizonScreenY(an, pose)).toBeNull()
    // 그 포즈에서 «principal.y에 긋는다»는 틀린 답이다 — 먼 지면 점이 거기 없다
    const far = farGroundY(pose, 2e6)!
    expect(Math.abs(far - an.principal!.y)).toBeGreaterThan(50)
  })

  it('빈 문서에서도 H/2를 낸다 — 지평선은 상시다(web2-17 1-b)', () => {
    const empty = analyze({ frame: { W: 1200, H: 800 }, strokes: [], faces: [], unit: 'mm' as const })
    expect(horizonScreenY(empty, DRAW_POSE)).toBe(400)
  })
})
