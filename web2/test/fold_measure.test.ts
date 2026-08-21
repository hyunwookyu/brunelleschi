// **측정 하네스 — 접을 때 무엇이 얼마나 움직이는가.** NOTES가 인용하는 표를 여기서 낸다.
//
// ⚠ **이 수치는 `stage0/out` 원장 밖이다**(PITFALLS #25). 넣으려면 `constants.json`을
//    web2의 `C`까지 넓혀야 하는데, 그러면 그 파일의 해시가 바뀌어 **기존 web/ 원장
//    101개가 전부 STALE로 뒤집힌다**(`selfcheck.scan_stale_constants`). 범위를 안 넓히려고
//    (A-3) 여기 두고, 대신 **이름으로 다시 돌릴 수 있게** 했다:
//        npx vitest run test/fold_measure.test.ts
//    되돌릴 조건: web2가 원장 규약을 갖추면(constants.json이 web2 상수를 함께 들면) 옮긴다.
//
// 재는 것 넷:
//   ① 접기가 **수평거리를 몇 배로 늘리는가** — `rMin = f·|Δh| ÷ (H/2)`라 **f에 정비례**한다.
//   ② 접힌 뒤 **pivot이 화면 어디에 앉는가** — 부감(눈이 위)과 앙각(아래) **양쪽**.
//   ③ **기하 bbox**가 화면 안에 들어오는가 — pivot 한 점만 보던 판은 최대 131.8 px 샜다
//      (web2-04 리뷰어 [10]). 지금 규칙은 `spanY`를 더해 그것을 덮는다. 이 표의
//      「bbox밖」 열이 **전부 «없음»이어야** 한다 — 팔이 그것을 단언한다.
//   ④ 화각 대역 **셋** — 이론서 18.4의 관행 하한 `d ≥ W`(f/W = 1)를 **가운데에 둔다**.
//      초판은 f/W = 0.32와 2.74 **극단 둘**뿐이었다(리뷰어 [3] · PITFALLS #12).

import { it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { project, DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, liftedPoints, orbitBy } from '../src/app/state'
import { levelPose } from '../src/core/level'
import { C } from '../src/core/constants'

/** 소실점을 **찍어서** 만든다 — 화면 안에서 그으면 픽스처가 구도가 아니라 임계를 시험한다 */
function build(u1: number, u2: number) {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)                       // 지평선 (주점 x = 600)
  s.draw(600 + u1, 400, 600 + u1, 400)              // vp0
  s.draw(600 + u2, 400, 600 + u2, 400)              // vp1
  s.draw(500, 300, 500, 500)                        // 기둥 — 첫 선이므로 아래점이 지면이다
  return s.app
}

// f² = |u1||u2| 이므로 f/W = sqrt(|u1 u2|)/W.
//   좁음  300·−500      → f ≈ 387   (f/W 0.32 · 화각 ≈114° — 이론서 18.4의 «90° 초과» 구간)
//   관행  1200·−1200    → f = 1200  (f/W 1.00 · 화각 ≈ 53° — 18.4의 실무 관행 하한 d ≥ W)
//   좁은 화각 3000·−3600 → f ≈ 3286 (f/W 2.74 · 화각 ≈ 20°)
const BANDS = [
  { name: '넓은 화각', u1: 300, u2: -500 },
  { name: '관행 d≥W ', u1: 1200, u2: -1200 },
  { name: '좁은 화각', u1: 3000, u2: -3600 },
] as const

/** 부감(아래로 끌면 내려다본다·눈이 올라간다)과 앙각(위로 끌면 올려다본다·눈이 내려간다) */
const ORBITS = [
  { name: '앙각 완만', dx: -160, dy: -120 },
  { name: '앙각 급  ', dx: 0, dy: -260 },
  { name: '부감 완만', dx: 120, dy: 180 },
  { name: '부감 급  ', dx: 0, dy: 260 },
] as const

it('접기가 무엇을 얼마나 움직이는가 — 화각 셋 × 궤도 넷', () => {
  const lines: string[] = [
    `W=${W} H=${H} · 규칙: **기하 끝점 전부**가 화면 세로 안(주점에서 |Δy| ≤ H/2 = ${H / 2}) · FOLD_DELAY_MS=${C.FOLD_DELAY_MS}`,
    '  (Δy 부호: + 는 지평선 **아래**(부감) · − 는 **위**(앙각). bbox는 화면 밖으로 나간 px)',
  ]
  for (const band of BANDS) {
    const app = build(band.u1, band.u2)
    const an = app.lift.an
    const pivot = orbitPivot(app)
    const base = { ...app.pose.p }
    lines.push(`${band.name} f=${an.f!.toFixed(1)} (f/W=${(an.f! / W).toFixed(2)})`)
    for (const o of ORBITS) {
      setPose(app, { p: { ...base }, q: { ...DRAW_POSE.q } })
      orbitBy(app, o.dx, o.dy)
      const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
      const fold = levelPose(an, app.pose, pivot, liftedPoints(app))
      const r1 = Math.hypot(fold.p.x - pivot.x, fold.p.z - pivot.z)

      const sp = project(an, fold, pivot)
      const dy = sp ? sp.y - an.principal!.y : NaN

      // ③ 기하 bbox — 승격된 3D 끝점 전부를 접힌 포즈로 사영한다
      let out = 0, seen = 0
      for (const seg of app.lift.lifted.values()) {
        for (const P of [seg.a3, seg.b3]) {
          const q = project(an, fold, P)
          if (!q) continue
          seen++
          out = Math.max(out, -q.x, q.x - W, -q.y, q.y - H)
        }
      }
      lines.push(`  ${o.name} 눈 ${app.pose.p.y >= pivot.y ? '위' : '아래'}` +
        `  배수=${(r1 / r0).toFixed(3)}` +
        `  pivot Δy=${dy >= 0 ? '+' : ''}${dy.toFixed(1)}` +
        `  bbox밖=${out <= 0 ? '없음' : out.toFixed(1) + 'px'} (점 ${seen})`)

      expect(r1).toBeGreaterThanOrEqual(r0 - 1e-9)          // 물러나기만 한다
      expect(Math.abs(dy)).toBeLessThanOrEqual(H / 2 + 1e-6)   // pivot은 당연히 안이다
      expect(out).toBeLessThanOrEqual(1e-6)                   // **기하 전체**가 화면 안이다
    }
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
})
