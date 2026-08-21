// **측정 하네스 — 접을 때 무엇이 얼마나 움직이는가.** NOTES가 인용하는 표를 여기서 낸다.
//
// ⚠ **이 수치는 `stage0/out` 원장 밖이다**(PITFALLS #25). 넣으려면 `constants.json`을
//    web2의 `C`까지 넓혀야 하는데, 그러면 그 파일의 해시가 바뀌어 **기존 web/ 원장
//    101개가 전부 STALE로 뒤집힌다**(`selfcheck.scan_stale_constants`). 범위를 안 넓히려고
//    (A-3) 여기 두고, 대신 **이름으로 다시 돌릴 수 있게** 했다:
//        npx vitest run test/fold_measure.test.ts
//    되돌릴 조건: web2가 원장 규약을 갖추면(constants.json이 web2 상수를 함께 들면) 옮긴다.
//
// 재는 것 여섯 (2차 리뷰어가 넷을 더 물었다):
//   ① 접기가 **수평거리를 몇 배로 늘리는가**.
//   ② 접힌 뒤 **pivot이 화면 어디에 앉는가** — 부감(눈이 위)과 앙각(아래) **양쪽**.
//   ③ **기하 bbox**가 화면 안에 들어오는가 — pivot 한 점만 보던 판은 최대 131.8 px 샜다
//      (1차 [10]). 지금 규칙은 끝점 전부를 본다. 「bbox밖」 열이 **전부 «없음»**이어야 한다.
//   ④ 화각 대역 **셋** — 이론서 18.4의 관행 하한 `d ≥ W`(f/W = 1)를 **가운데에 둔다**.
//      초판은 f/W = 0.32와 2.74 **극단 둘**뿐이었다(1차 [3] · PITFALLS #12).
//   ⑤ **접기 전 수평거리 r₀** — 배수는 `rMin/r₀`이고 r₀가 대역마다 다르다. 그것을 안 내면
//      「배수가 f에 정비례한다」로 잘못 읽힌다(2차 [4]). **정비례하는 것은 rMin이지 배수가 아니다.**
//   ⑥ **기준 셋을 한 줄에** — pivot 한 점(폐기) · 기하 끝점(현행) · 허용 H/4(폐기).
//      낡은 판의 수를 산문에 남기지 않고 **매 실행에 함께 낸다**(2차 [3] · #42⑥).
//      그리고 **화면 크기 둘**에서 돌린다 — 배수가 H에 반비례하므로 한 점이면 #12다(2차 [12]).

import { it, expect } from 'vitest'
import { session } from './session'
import { project, DRAW_POSE, type Analysis } from '../src/core/camera'
import { setPose, orbitPivot, liftedPoints, orbitBy } from '../src/app/state'
import { levelPose } from '../src/core/level'
import { C } from '../src/core/constants'
import type { V3 } from '../src/core/vec'

/** 소실점을 **찍어서** 만든다 — 화면 안에서 그으면 픽스처가 구도가 아니라 임계를 시험한다 */
function build(W: number, H: number, u1: number, u2: number) {
  const s = session(W, H)
  const hy = H / 2, px = W / 2
  s.draw(100, hy, W - 100, hy)                      // 지평선 (주점 x = W/2)
  s.draw(px + u1, hy, px + u1, hy)                  // vp0
  s.draw(px + u2, hy, px + u2, hy)                  // vp1
  // ⚠ 기둥이 **pivot에 대해 상하 대칭**이다(pivot = 승격 기하의 무게중심 = 그 중점).
  //    그래서 요가 0인 궤도(dx = 0)에서는 부감·앙각이 **자명하게 같은 값**을 낸다 —
  //    그 두 행은 부호를 확인할 뿐 새 정보가 아니다(2차 리뷰어 [6]). 완만 행(dx ≠ 0)이 낸다.
  s.draw(px - 100, hy - 100, px - 100, hy + 100)    // 기둥 — 첫 선이므로 아래점이 지면이다
  return s.app
}

// f² = |u₁||u₂| 이므로 f/W = sqrt(|u₁u₂|)/W.
//   넓은 화각 300·−500     → f ≈ 387   (f/W 0.32 · ≈114° — 이론서 18.4의 «90° 초과» 구간)
//   관행     1200·−1200    → f = 1200  (f/W 1.00 · ≈ 53° — 18.4의 실무 관행 하한 d ≥ W)
//   좁은 화각 3000·−3600   → f ≈ 3286  (f/W 2.74 · ≈ 20°)
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

/** 배수는 `H`에 **반비례**한다(`rMin = f·… ÷ (H/2)`). 한 점이면 #12다. */
const SCREENS = [{ W: 1200, H: 800 }, { W: 1200, H: 600 }] as const

it('접기가 무엇을 얼마나 움직이는가 — 화면 둘 × 화각 셋 × 궤도 넷', () => {
  const lines: string[] = [
    '규칙: **기하 끝점 전부**가 화면 세로 안(주점에서 |Δy| ≤ H/2). ' +
    `FOLD_DELAY_MS=${C.FOLD_DELAY_MS} · FOLD_ANIM_MS=${C.FOLD_ANIM_MS}`,
    '  배수 = 접은 뒤 수평거리 ÷ 접기 전 r₀.  기준 셋을 나란히 낸다:',
    '    pivot = 궤도 중심 한 점(폐기) · bbox = 기하 끝점 전부(**현행**) · H4 = 허용을 H/4로(폐기)',
    '  Δy 부호: + 는 지평선 **아래**(부감) · − 는 **위**(앙각)',
  ]
  for (const scr of SCREENS) {
    lines.push(`### 화면 ${scr.W}×${scr.H} (허용 |Δy| ≤ ${scr.H / 2})`)
    for (const band of BANDS) {
      const app = build(scr.W, scr.H, band.u1, band.u2)
      const an = app.lift.an
      const anH4: Analysis = { ...an, H: an.H / 2 }   // 폐기된 기준을 **같은 경로로** 낸다
      const pivot = orbitPivot(app)
      const base = { ...app.pose.p }
      lines.push(`${band.name} f=${an.f!.toFixed(1)} (f/W=${(an.f! / scr.W).toFixed(2)})`)
      for (const o of ORBITS) {
        setPose(app, { p: { ...base }, q: { ...DRAW_POSE.q } })
        orbitBy(app, o.dx, o.dy)
        const r0 = Math.hypot(app.pose.p.x - pivot.x, app.pose.p.z - pivot.z)
        const pts = liftedPoints(app)
        const kOf = (a: Analysis, p: V3[]) => {
          const f = levelPose(a, app.pose, pivot, p)
          return Math.hypot(f.p.x - pivot.x, f.p.z - pivot.z) / r0
        }
        const kPivot = kOf(an, []), kBbox = kOf(an, pts), kH4 = kOf(anH4, pts)

        const fold = levelPose(an, app.pose, pivot, pts)
        const sp = project(an, fold, pivot)
        const dy = sp ? sp.y - an.principal!.y : NaN

        let out = 0, seen = 0
        for (const P of pts) {
          const q = project(an, fold, P)
          if (!q) continue
          seen++
          out = Math.max(out, -q.x, q.x - scr.W, -q.y, q.y - scr.H)
        }
        lines.push(`  ${o.name} 눈${app.pose.p.y >= pivot.y ? '위' : '아래'}` +
          ` r₀=${r0.toFixed(2)}  배수 pivot=${kPivot.toFixed(3)} bbox=${kBbox.toFixed(3)}` +
          `(×${(kBbox / kPivot).toFixed(3)}) H4=${kH4.toFixed(3)}(×${(kH4 / kBbox).toFixed(3)})` +
          `  Δy=${dy >= 0 ? '+' : ''}${dy.toFixed(1)}` +
          `  bbox밖=${out <= 0 ? '없음' : out.toFixed(1) + 'px'} (점 ${seen})`)

        expect(kBbox).toBeGreaterThanOrEqual(1 - 1e-9)            // 물러나기만 한다
        expect(kBbox).toBeGreaterThanOrEqual(kPivot - 1e-9)       // 기하까지 보면 더 물러난다
        expect(kH4).toBeGreaterThanOrEqual(kBbox - 1e-9)          // 여유를 넣으면 더 물러난다
        expect(Math.abs(dy)).toBeLessThanOrEqual(scr.H / 2 + 1e-6)
        expect(out).toBeLessThanOrEqual(1e-6)                     // **기하 전체**가 화면 안이다
        expect(seen).toBeGreaterThan(0)
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
})
