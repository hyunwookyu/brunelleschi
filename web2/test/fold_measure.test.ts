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
//   ④ **대상이 화면에 남는가 — 보장이 아니다.** 이 규칙이 «구성상» 보존하는 것은
//      pivot 한 점의 화면 자리이고(요를 180° 돌려도 같다), **pivot에서 떨어진 기하는
//      요와 함께 화면에서 옮겨간다.** 어디서 나가는지를 재서 대역별로 낸다 —
//      「앵커가 괜찮았으니 접은 뒤도 괜찮다」는 **귀납이지 보장이 아니다**.

import { it, expect } from 'vitest'
import { session } from './session'
import { DRAW_POSE } from '../src/core/camera'
import { setPose, orbitPivot, orbitBy } from '../src/app/state'
import { levelPose, forwardOf, yawDir, isLevel } from '../src/core/level'
import type { CamPose } from '../src/core/types'
import { dot3, v3 } from '../src/core/vec'
import { project as proj } from '../src/core/camera'
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
  // ⚠ 셋째를 `dx = 0`으로 뒀더니 **요가 안 바뀌어 그 회차가 항등**이었다(2차 리뷰어 [16]) —
  //    「세 번」의 셋째가 「두 번」과 같은 시험이었다. 셋 다 요를 바꾸게 고쳤다.
  for (const [dx, dy] of [[-160, 180], [200, -140], [-90, 240]] as const) {
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

/** **화면에 남는 대역** — pivot 둘레 반지름 ρ의 점을 방위 여덟에 놓고 요를 훑는다.
 *  나가기 시작하는 ρ/R이 이 규칙이 덮는 대역이다. **「보장된다」가 아니라 «여기까지»다.**
 *
 *  ⚠ **별도 `it`이다** — 앞의 앵커 복원 단언과 한 덩어리로 두면 그쪽이 먼저 깨져
 *  이 검사의 판별력이 가려진다(2차 리뷰어 [4]). 갈라야 「이 팔을 무엇이 빨갛게 하는가」가 나온다.
 *
 *  **동작점**(#12): ρ 스텝 = R의 **1%** · 요 스텝 = **40 px**(≈11.5°) · 방위 **8**.
 *  ⚠ 해상도를 확인했다 — ρ 스텝을 절반(0.5%)으로, 방위를 **32**로 올려도
 *  **셋 중 둘이 그대로**이고 관행 대역만 0.380 → **0.375**(ρ 한 칸)다. 격자값이 아니라
 *  경계값으로 읽어도 되는 자릿수는 **소수 둘째 자리**다. */
it('접은 뒤 대상이 화면에 남는 대역 — 보장이 아니다', () => {
  const lines: string[] = ['화면에 남는 대역 (pivot 둘레 8방위 · 요 0~180° 훑기):']
  const bounds: number[] = []
  for (const band of BANDS) {
    const app = build(1200, 800, band.u1, band.u2)
    const an = app.lift.an, pv = orbitPivot(app)
    const b2 = snap(app.pose)
    const R = Math.hypot(b2.p.x - pv.x, b2.p.z - pv.z)
    let bound: number | null = null
    for (let k = 1; k <= 200 && bound === null; k++) {
      const rho = R * k * 0.01
      for (let d = 0; d <= 628; d += 40) {
        setPose(app, { p: { ...b2.p }, q: { ...DRAW_POSE.q } })
        orbitBy(app, -d, -120)
        const f = levelPose(b2, app.pose, pv)
        let leaves = false
        for (let i = 0; i < 8; i++) {
          const th = i * Math.PI / 4
          const q = proj(an, f, v3(pv.x + rho * Math.cos(th), pv.y, pv.z + rho * Math.sin(th)))
          if (!q || q.x < 0 || q.x > 1200 || q.y < 0 || q.y > 800) { leaves = true; break }
        }
        if (leaves) { bound = k * 0.01; break }
      }
    }
    const fw = an.f! / 1200
    lines.push(`  ${band.name} f/W=${fw.toFixed(2)}: 퍼짐/거리 **${bound === null ? '>2.00' : bound.toFixed(2)}** 부터 나간다` +
      `   (닫힌 예측 1/(2·f/W) = ${(1 / (2 * fw)).toFixed(2)})`)
    expect(bound).not.toBeNull()                       // 어딘가에서는 나간다 — 「보장」이 아니다
    expect(bound!).toBeLessThan(1 / (2 * fw) * 1.05)   // 닫힌 예측 아래(가로만 본 상한이다)
    bounds.push(Number(bound!.toFixed(2)))
  }
  // ⚠ **실측값을 함께 박는다** — 상한 단언만 두면 「더 일찍 나가게」 회귀해도 통과한다
  //    (2차 리뷰어 [12]). 판별력은 이 세 줄에서 나온다.
  expect(bounds).toEqual([0.68, 0.38, 0.15])
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
})
