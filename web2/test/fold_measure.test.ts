// **측정 하네스 — 접을 때 얼마나 물러나는가.** NOTES가 인용하는 표를 여기서 낸다.
//
// ⚠ **이 수치는 `stage0/out` 원장 밖이다**(PITFALLS #25). 넣으려면 `constants.json`을
//    web2의 `C`까지 넓혀야 하는데, 그러면 그 파일의 해시가 바뀌어 **기존 web/ 원장
//    101개가 전부 STALE로 뒤집힌다**(`selfcheck.scan_stale_constants`). 범위를 안 넓히려고
//    (A-3) 여기 두고, 대신 **이름으로 다시 돌릴 수 있게** 했다:
//        npx vitest run test/fold_measure.test.ts
//    되돌릴 조건: web2가 원장 규약을 갖추면(constants.json이 web2 상수를 함께 들면) 옮긴다.
//
// 재는 것: 접기가 **수평거리를 몇 배로 늘리는가**. 규칙은 「pivot이 화면 안에 남는다」이고
// 필요한 거리는 `f·|Δh| ÷ (H/2)`이므로 **f에 정비례**한다 — 그래서 구도 둘을 함께 잰다.

import { it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, orbitBy } from '../src/app/state'
import { levelPose } from '../src/core/level'
import { C } from '../src/core/constants'

function build(wide: boolean) {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  if (wide) {
    s.draw(3600, 400, 3600, 400)    // vp0 = +3000 = 2.5W
    s.draw(-3000, 400, -3000, 400)  // vp1 = −3600 = 3W
    s.draw(500, 300, 500, 500)      // 기둥
  } else {
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380)
  }
  return s.app
}

const ORBITS = [[-160, -120], [120, 180], [0, 260]] as const

it('접기의 물러나는 배수 — 구도 둘 × 궤도 셋', () => {
  const lines: string[] = [`H=${H} · 규칙: pivot이 화면 안(|Δ| ≤ H/2) · FOLD_DELAY_MS=${C.FOLD_DELAY_MS}`]
  for (const wide of [false, true]) {
    const app = build(wide)
    const pivot = orbitPivot(app)
    const base = { ...app.pose.p }
    const f = app.lift.an.f!
    lines.push(`${wide ? 'wide  ' : 'narrow'} f=${f.toFixed(1)} (f/W=${(f / W).toFixed(2)})`)
    for (const [dx, dy] of ORBITS) {
      setPose(app, { p: { ...base }, q: { ...DRAW_POSE.q } })
      orbitBy(app, dx, dy)
      const fold = levelPose(app.lift.an, app.pose, pivot)
      const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
      const r1 = Math.hypot(fold.p.x - pivot.x, fold.p.z - pivot.z)
      lines.push(`  궤도(${dx},${dy})  r0=${r0.toFixed(3)}  r1=${r1.toFixed(3)}  배수=${(r1 / r0).toFixed(3)}`)
      expect(r1).toBeGreaterThanOrEqual(r0 - 1e-9)   // 물러나기만 한다
    }
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
})
