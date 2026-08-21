// **측정 하네스 — 접기가 궤도 전 상태를 얼마나 되돌리는가.** NOTES가 인용하는 표를 낸다.
//
// ⛔⛔ **이 파일은 web2-05에서 통째로 갈렸다**(#57). 앞판은 「눈높이를 유지하고 대상이
//     화면에 남도록 **수평거리를 늘린다**」를 재던 것이고 — 화각 셋 × 궤도 넷 × 화면 둘의
//     «물러나는 배수» 표 — **그 기전이 죽었다.** 접기가 궤도 전 포즈로 통째로 돌아가므로
//     늘릴 일이 없다. 판별력이 죽은 조항을 통과로 안 적고 **재는 것을 바꿨다.**
//     앞판이 낸 수(배수 1.000~30.529 · ×2.000 · Δy ±387.8)는 **폐기된 기전의 값**이므로
//     어디에도 인용하지 않는다. 폐기 기록은 `NOTES.md`의 web2-05 절.
//
// ⚠ **이 수치는 `stage0/out` 원장 밖이다**(PITFALLS #25). 넣으려면 `constants.json`을
//    web2의 `C`까지 넓혀야 하고 그러면 기존 web/ 원장 101개가 전부 STALE로 뒤집힌다.
//    범위를 안 넓히려고(A-3) 여기 두고 **이름으로 다시 돌릴 수 있게** 했다:
//        npx vitest run test/fold_measure.test.ts
//
// 재는 것 셋:
//   ① **궤도 전 → 궤도 후 → 접은 뒤**의 높이 · 거리 · 피치 · 요. 지시가 요구한 표식 그대로다.
//      「접은 뒤 == 궤도 전」이 높이·거리·피치에서 성립하고 요만 다르면 통과다.
//   ② 대역을 **화각 셋**으로 훑는다 — 이 규칙은 f에 안 걸리므로(강체 회전) 대역이 값을
//      안 바꿔야 한다. **안 바뀌는 것이 곧 관측**이다(앞판은 f에 정비례해 흔들렸다).
//   ③ **누적되지 않는가** — 세 번 돌려 접어도 높이·거리가 그대로여야 한다.

import { it, expect } from 'vitest'
import { session } from './session'
import { DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, orbitBy } from '../src/app/state'
import { levelPose, forwardOf, yawDir, isLevel } from '../src/core/level'
import type { CamPose } from '../src/core/types'
import { dot3 } from '../src/core/vec'
import { C } from '../src/core/constants'

function build(W: number, H: number, u1: number, u2: number) {
  const s = session(W, H)
  const hy = H / 2, px = W / 2
  s.draw(100, hy, W - 100, hy)                      // 지평선
  s.draw(px + u1, hy, px + u1, hy)                  // vp0 (찍기)
  s.draw(px + u2, hy, px + u2, hy)                  // vp1 (찍기)
  s.draw(px - 100, hy - 100, px - 100, hy + 100)    // 기둥
  return s.app
}

// f² = |u₁||u₂|.  넓은 화각 ≈114° · 관행 d≥W ≈53°(이론서 18.4) · 좁은 화각 ≈20°
const BANDS = [
  { name: '넓은 화각', u1: 300, u2: -500 },
  { name: '관행 d≥W ', u1: 1200, u2: -1200 },
  { name: '좁은 화각', u1: 3000, u2: -3600 },
] as const

const ORBITS = [
  { name: '앙각 완만', dx: -160, dy: -120 },
  { name: '앙각 급  ', dx: 0, dy: -260 },
  { name: '부감 완만', dx: 120, dy: 180 },
  { name: '부감 급  ', dx: 0, dy: 260 },
] as const

const snap = (p: CamPose): CamPose => ({ p: { ...p.p }, q: { ...p.q } })
const pitchDeg = (p: CamPose) => Math.asin(Math.max(-1, Math.min(1, forwardOf(p).y))) * 180 / Math.PI
const yawDeg = (p: CamPose) => { const d = yawDir(p); return Math.atan2(d.x, -d.z) * 180 / Math.PI }
const gapDeg = (a: CamPose, b: CamPose) =>
  Math.acos(Math.max(-1, Math.min(1, dot3(yawDir(a), yawDir(b))))) * 180 / Math.PI

it('접기가 궤도 전으로 되돌리는가 — 화각 셋 × 궤도 넷', () => {
  const lines: string[] = [
    `규칙: 접기 = **앵커를 pivot의 수직축 둘레로 요 차이만큼 돌린 강체 회전.** ` +
    `FOLD_DELAY_MS=${C.FOLD_DELAY_MS} · FOLD_ANIM_MS=${C.FOLD_ANIM_MS}`,
    '  높이 = 눈높이 · 거리 = pivot까지 3D 거리 · 수평 = pivot까지 수평거리',
  ]
  for (const band of BANDS) {
    const app = build(1200, 800, band.u1, band.u2)
    const pivot = orbitPivot(app)
    const base = snap(app.pose)
    const d0 = Math.hypot(base.p.x - pivot.x, base.p.y - pivot.y, base.p.z - pivot.z)
    const r0 = Math.hypot(base.p.x - pivot.x, base.p.z - pivot.z)
    lines.push(`${band.name} f=${app.lift.an.f!.toFixed(1)} (f/W=${(app.lift.an.f! / 1200).toFixed(2)})` +
      `  궤도 전: 높이=${base.p.y.toFixed(3)} 거리=${d0.toFixed(3)} 수평=${r0.toFixed(3)} 피치=0.000° 요=${yawDeg(base).toFixed(3)}°`)
    for (const o of ORBITS) {
      setPose(app, snap({ p: { ...base.p }, q: { ...DRAW_POSE.q } }))
      orbitBy(app, o.dx, o.dy)
      const t = snap(app.pose)
      const f = levelPose(base, app.pose, pivot)
      const dT = Math.hypot(t.p.x - pivot.x, t.p.y - pivot.y, t.p.z - pivot.z)
      const dF = Math.hypot(f.p.x - pivot.x, f.p.y - pivot.y, f.p.z - pivot.z)
      const rF = Math.hypot(f.p.x - pivot.x, f.p.z - pivot.z)
      lines.push(`  ${o.name}  궤도 후: 높이=${t.p.y.toFixed(3)} 거리=${dT.toFixed(3)} 피치=${pitchDeg(t).toFixed(3)}° 요=${yawDeg(t).toFixed(3)}°` +
        `  →  접은 뒤: 높이=${f.p.y.toFixed(3)} 거리=${dF.toFixed(3)} 수평=${rF.toFixed(3)} 피치=${pitchDeg(f).toFixed(3)}° 요=${yawDeg(f).toFixed(3)}°`)

      // ① 높이·거리·피치·롤이 궤도 전 그대로
      expect(f.p.y).toBeCloseTo(base.p.y, 9)
      expect(dF).toBeCloseTo(d0, 9)
      expect(rF).toBeCloseTo(r0, 9)
      expect(pitchDeg(f)).toBeCloseTo(0, 9)
      expect(isLevel(f)).toBe(true)
      // ② 요만 새 값 — 궤도의 요와 같다
      expect(gapDeg(f, t)).toBeLessThan(1e-4)
    }
  }

  // ③ 누적되지 않는가 — 접힌 포즈를 새 앵커로 세 번
  const app = build(1200, 800, 1200, -1200)
  const pivot = orbitPivot(app)
  const y0 = app.pose.p.y
  const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
  const acc: string[] = []
  for (const [dx, dy] of [[-160, 180], [200, -140], [0, 240]] as const) {
    const anchor = snap(app.pose)
    orbitBy(app, dx, dy)
    setPose(app, levelPose(anchor, app.pose, pivot))
    acc.push(`높이=${app.pose.p.y.toFixed(6)} 수평=${Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z).toFixed(6)} 요=${yawDeg(app.pose).toFixed(3)}°`)
    expect(app.pose.p.y).toBeCloseTo(y0, 9)
    expect(Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)).toBeCloseTo(r0, 9)
  }
  lines.push('세 번 접어도 누적되지 않는다: ' + acc.join(' | '))

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
})
