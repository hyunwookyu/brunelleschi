// web2-42 3번 — **읽는 값: 투영에 따라 대체된다.**
//
//     투시일 때   렌즈길이 mm   (35mm 판형 환산 · 대각 43.27mm)
//     평행일 때   축척 1:100    (32-5의 `doc.scaleRef`에서 나온다 — 새 기제 ⛔)
//
// ⚠⚠ **환산이 맞는지를 «식을 다시 적어» 재면 항등이다**(#77 ㉡ · §5.1 자기참조 유형 3).
//     그래서 **밖에서 온 값**과 견준다: 사진의 알려진 렌즈-화각 표(35mm 판형의 대각 화각).
//     그리고 반증으로 **자를 바꾼 판**(대각 대신 가로 W)을 나란히 돌려 그 표 밖으로
//     나가는 것을 수치로 낸다.
//
// 원장: LEDGER=1 npx vitest run test/read42.test.ts  →  stage0/out/read42_web2.json

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  focal35mm, focalText, FILM35_DIAG_MM, scaleDenom, scaleText, MM_PER_CSS_PX, hfovDeg,
} from '../src/core/lens'
import { parallelPxPerUnit, setPose, setDimension, orbitPivot, type App } from '../src/app/state'
import { parallelPose, poseForElem, perspectivePose } from '../src/core/viewcube'
import { isParallel } from '../src/core/camera'
import { session } from './session'
import { W, H } from './fixtures'
import { v3 } from '../src/core/vec'
import type { CamPose } from '../src/core/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (x: number) => Number(x.toFixed(6))
const ledger: Record<string, unknown> = {}

/** **밖에서 온 값** — 35mm 판형(36×24)의 알려진 렌즈별 **대각 화각**(도).
 *  사진 자료의 표준 표이고 이 코드에서 유도한 것이 아니다(그래서 대조가 항등이 아니다). */
const KNOWN: { mm: number; diagDeg: number }[] = [
  { mm: 15, diagDeg: 110.5 },
  { mm: 24, diagDeg: 84.1 },
  { mm: 28, diagDeg: 75.4 },
  { mm: 35, diagDeg: 63.4 },
  { mm: 50, diagDeg: 46.8 },
  { mm: 85, diagDeg: 28.6 },
  { mm: 135, diagDeg: 18.2 },
]

/** 2점 작도 + 기둥 — `view42`와 같은 장면. */
function app2(): App {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(500, 500, 500, 380)
  s.draw(500, 380, 600, 362)
  return s.app
}

function frontParallel(app: App): CamPose {
  const pivot = orbitPivot(app)
  const dist = Math.max(1, Math.hypot(
    app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z))
  return parallelPose(poseForElem(app.lift.an, { kind: 'face', dirLocal: v3(-1, 0, 0) }, pivot, dist)!, pivot)
}

// ══════════════════════════════════════════════════════════════════════════
describe('42-3 ① 렌즈길이 — 35mm 판형 환산이 알려진 값과 맞는다', () => {
  it('알려진 렌즈-화각 일곱 칸에서 환산 mm가 0.5mm 안이고, 자를 바꾸면(가로 W) 벗어난다', () => {
    // 프레임 비를 **판형과 다르게** 잡는다 — 3:2로 잡으면 W와 대각이 상수배라
    // 위약 판이 「자를 바꿔도 같다」로 나와 아무것도 안 잰다(#92의 형태).
    const FW = 1200, FH = 800                     // 3:2 — 아래에서 4:3 판도 같이 돈다
    const rows: Record<string, unknown>[] = []
    let worst = 0, worstFalse = 0, bandWorst = 0
    for (const { W: fw, H: fh } of [{ W: FW, H: FH }, { W: 1200, H: 900 }, { W: 900, H: 1200 }]) {
      const diag = Math.hypot(fw, fh)
      for (const k of KNOWN) {
        // 그 대각 화각을 내는 f(문서 px) — **각에서 f를 만든다**(mm에서 만들면 항등이다)
        const f = diag / 2 / Math.tan(k.diagDeg / 2 * Math.PI / 180)
        const got = focal35mm(f, diag)
        // **반증 — 자를 «가로»로 바꾼 판**(1차 리뷰어 [3]): 초판은 `f·43.27/W`였는데 그것은
        // «자를 바꾼 것»이 아니라 **판형 대각과 프레임 가로를 어긋나게 짝지은 것**이라 모든
        // 프레임에서 참값의 정확히 (diag/W)배가 됐다 — 그러면 「3:2에서는 안 갈린다」는 이 팔의
        // 주의문이 성립하지 않는다. 일관된 «가로 자»는 **판형 가로 36 mm ↔ 프레임 가로 W**이고,
        // 그때만 3:2에서 두 자가 상쇄된다(36/1200 = 43.2666/1442.22). 그것이 프레임 셋의 근거다.
        const bad = f * 36 / fw
        worst = Math.max(worst, Math.abs(got - k.mm))
        worstFalse = Math.max(worstFalse, Math.abs(bad - k.mm))
        // [5] **표 자신의 자릿수가 주는 폭** — 표가 0.1° 자리이므로 ±0.05°가 mm로 얼마인가.
        // 잔차가 그 폭 안이면 이 팔이 낸 것은 「구현이 그만큼 정확하다」가 아니라
        // **「식이 표와, 표의 자릿수 안에서 맞다」**이다(1차 리뷰어 [5]).
        const band = (d: number) => {
          const mmOf = (t: number) => FILM35_DIAG_MM / 2 / Math.tan(t / 2 * Math.PI / 180)
          return Math.abs(mmOf(k.diagDeg - d) - mmOf(k.diagDeg + d)) / 2
        }
        rows.push({
          frame: `${fw}x${fh}`, known_mm: k.mm, known_diag_deg: k.diagDeg,
          f_doc_px: r6(f), got_mm: r6(got), falsify_using_width_mm: r6(bad),
          hfov_deg: r6(hfovDeg(f, fw)), table_rounding_band_mm: r6(band(0.05)),
        })
        bandWorst = Math.max(bandWorst, band(0.05))
        expect(Math.abs(got - k.mm), `${k.mm}mm ↔ ${k.diagDeg}°`).toBeLessThan(0.5)
      }
    }
    // 반증이 **실제로 벗어난다** — 안 벗어나면 위 대조는 자를 안 재는 것이다
    expect(worstFalse).toBeGreaterThan(5)
    expect(FILM35_DIAG_MM).toBeCloseTo(43.27, 2)
    // [3] 3:2에서는 두 자가 상쇄된다 — **그 사실을 값으로 낸다**(주의문을 말로 안 둔다)
    const diag32 = Math.hypot(FW, FH)
    const ruler32 = { film_diag_over_frame_diag: r6(FILM35_DIAG_MM / diag32), film_w_over_frame_w: r6(36 / FW) }
    ledger['gate1_focal35'] = {
      what: '알려진 35mm 렌즈-대각화각 표 ↔ 환산 mm. 프레임 비 셋(3:2 · 4:3 · 세로)에서 돌린다',
      film35_diag_mm: r6(FILM35_DIAG_MM),
      worst_err_mm: r6(worst),
      falsify_worst_err_mm_using_width: r6(worstFalse),
      table_rounding_band_worst_mm: r6(bandWorst),
      rulers_coincide_at_3_2: ruler32,
      rows,
      note: 'f를 **화각에서** 만든다 — mm에서 만들면 같은 식을 두 번 적는 항등이 된다(#77 ㉡)',
      got_mm_is_frame_invariant: (
        '⚠ **참 지표는 프레임에 대해 항등이다**(1차 리뷰어 [4]): f를 화각에서 만들면 '
        + 'mm = (43.2666/2)/tan(θ/2)로 접혀 diag가 상쇄된다 — 그래서 프레임 축은 **위약에만** '
        + '정보를 준다(같은 known_mm의 세 행에서 got_mm이 자릿수까지 같은 것이 그 증거다). '
        + '독립 관측은 **일곱**이고 스물하나가 아니다.'
      ),
      table_precision: (
        '⚠ **문(0.5 mm)이 표 자신의 자릿수보다 좁다**(1차 리뷰어 [5]): 표가 0.1° 자리이므로 '
        + `±0.05°가 주는 폭이 최악 ${bandWorst.toFixed(3)} mm다(135 mm 칸). 실측 잔차 ${worst.toFixed(6)} mm는 `
        + '그 폭 **안**이다 — 즉 이 팔이 낸 것은 「구현이 그만큼 정확하다」가 아니라 '
        + '**「식이 표와, 표의 자릿수 안에서 맞다」**이다. 판별력은 위약(자를 바꾼 판)이 준다.'
      ),
    }
  })

  it('표시 동작점이 하나가 아니다 — 1점(기본 f)과 2점(풀린 f) 둘을 낸다 (#12)', () => {
    // ⚠⚠ **1점의 f는 «임의 게이지»다**(CLAUDE.md §1 · D-L53 — 깊이 배율일 뿐이다).
    //    그 상태의 「렌즈 N mm」는 **측정이 아니라 기본값의 환산**이고, 그 사실을 여기 값으로 남긴다.
    const one = session(W, H)
    one.draw(100, 400, 1100, 400)      // 지평선(퇴화)
    one.draw(800, 400, 800, 400)       // 깊이 소실점 찍기
    one.draw(300, 600, 700, 600)       // 화면 수평 획 → 1점 잠금
    const a1 = one.app.lift.an
    const a2 = app2().lift.an
    const rows = [
      { state: '1점(P1 잠금)', fSource: a1.fSource, f_over_W: r6(a1.f! / a1.W), mm: r6(focal35mm(a1.f!, a1.diag)), text: focalText(a1.f!, a1.diag) },
      { state: '2점', fSource: a2.fSource, f_over_W: r6(a2.f! / a2.W), mm: r6(focal35mm(a2.f!, a2.diag)), text: focalText(a2.f!, a2.diag) },
    ]
    expect(a1.fSource).toBe('default')
    expect(a2.fSource).toBe('two-vp')
    expect(rows[0]!.mm).not.toBe(rows[1]!.mm)
    ledger['gate2b_operating_points'] = {
      what: '「렌즈 N mm」가 뜨는 두 국면 — 1점(기본 f · **임의 게이지**)과 2점(소실점 둘이 푼 f)',
      rows,
      caveat: (
        '⚠ 1점의 f는 `DEFAULT_F_RATIO·W`이고 **임의값이다**(깊이 배율 게이지 — CLAUDE.md §1). '
        + '그 상태의 mm는 «그 게이지를 35mm 판형으로 환산한 값»이지 잰 화각이 아니다. '
        + '`fSource`를 화면에 안 내는 규약(D-L55)은 그대로이고, 이 사실은 여기와 NOTES에 적는다.'
      ),
      fixture_f_ratio_note: (
        '⚠ 2점 픽스처의 f/W = 0.3227은 앱 자신의 구도 경고에서 **severe 대역**이다'
        + '(`confirm_rules.json`의 `fov_gate.thresholds.severe_f_ratio` 0.5 — 1차 리뷰어 [6]). '
        + '그래서 「12 mm」는 **그 픽스처의 성질**이지 앱의 대표값이 아니다.'
      ),
    }
  })

  it('화면 문자열은 정수 mm이고, 렌즈를 바꾸면 따라 바뀐다 (31-2 무회귀)', () => {
    const app = app2()
    const an = app.lift.an
    const f0 = an.f!
    const t0 = focalText(f0, an.diag)
    const t1 = focalText(f0 * 2, an.diag)         // 한 스톱 — 두 배
    expect(t0).toMatch(/^렌즈 \d+mm$/)
    expect(t1).not.toBe(t0)
    expect(focal35mm(f0 * 2, an.diag) / focal35mm(f0, an.diag)).toBeCloseTo(2, 12)
    ledger['gate2_focal_text'] = {
      f_doc_px: r6(f0), diag: r6(an.diag), text_default: t0, text_one_stop: t1,
    }
  })
})

describe('42-3 ② 축척 — 32-5의 `scaleRef`에서 나온다', () => {
  it('축척이 미정이면 「미정」이 뜨고, 치수를 주면 그 값에서 분모가 선다', () => {
    const app = app2()
    const pose = frontParallel(app)
    setPose(app, pose)
    expect(isParallel(app.pose)).toBe(true)
    const px = parallelPxPerUnit(app)!
    expect(px).toBeGreaterThan(0)

    // 아직 치수가 없다 — **미정**이다(0으로 안 만든다)
    expect(app.lift.mmPerUnit).toBeNull()
    expect(scaleDenom(app.lift.mmPerUnit, px)).toBeNull()
    expect(scaleText(null)).toBe('축척 미정')

    // 치수 하나 — 32-5의 그 경로(`setDimension`)를 그대로 부른다(새 기제 ⛔)
    const id = [...app.lift.lifted.keys()][0]!
    const g0 = app.lift.lifted.get(id)!
    const L = Math.hypot(g0.b3.x - g0.a3.x, g0.b3.y - g0.a3.y, g0.b3.z - g0.a3.z)
    setDimension(app, id, 3000)
    expect(app.lift.mmPerUnit).not.toBeNull()
    expect(app.lift.mmPerUnit!).toBeCloseTo(3000 / L, 6)
    const px2 = parallelPxPerUnit(app)!
    const den = scaleDenom(app.lift.mmPerUnit, px2)!
    // **정의대로 다시 센다** — 화면 1 CSS px가 실물 몇 mm인가 ÷ CSS px의 실물 mm
    expect(den).toBeCloseTo(app.lift.mmPerUnit! / px2 / MM_PER_CSS_PX, 9)
    expect(scaleText(den)).toMatch(/^축척 (1:|\d)/)
    ledger['gate3_scale'] = {
      what: '축척의 분모 — `lift.mmPerUnit`(32-5) ÷ 화면 배율 ÷ CSS px의 실물 mm',
      mm_per_css_px: r6(MM_PER_CSS_PX),
      px_per_unit: r6(px2),
      mm_per_unit: r6(app.lift.mmPerUnit!),
      denom: r6(den),
      text: scaleText(den),
      undefined_text: scaleText(null),
    }
  })

  it('줌하면 축척이 그만큼 바뀐다 — 화면에서 잰 길이가 자이기 때문이다', () => {
    const app = app2()
    setPose(app, frontParallel(app))
    const id = [...app.lift.lifted.keys()][0]!
    setDimension(app, id, 3000)
    const d0 = scaleDenom(app.lift.mmPerUnit, parallelPxPerUnit(app)!)!
    // 배율만 두 배로(줌과 같은 자리 — `D`가 절반이면 화면 배율이 두 배다)
    setPose(app, { ...app.pose, proj: { w: 1, D: app.pose.proj!.D / 2 } })
    const d1 = scaleDenom(app.lift.mmPerUnit, parallelPxPerUnit(app)!)!
    expect(d1).toBeCloseTo(d0 / 2, 9)
    ledger['gate4_scale_follows_zoom'] = { denom_before: r6(d0), denom_after_2x: r6(d1) }
  })
})

describe('42-3 ③ 한 자리에 하나만 — 서로를 대신한다', () => {
  it('원근에서는 축척이 정의되지 않고(null), 평행에서는 렌즈 배율이 화면에 안 실린다', () => {
    const app = app2()
    // 원근 — 화면 배율이 깊이마다 다르다: `parallelPxPerUnit`이 **null**이고
    // 그것이 곧 「원근에서 축척은 정의되지 않는다」의 코드 판이다.
    expect(isParallel(app.pose)).toBe(false)
    expect(parallelPxPerUnit(app)).toBeNull()
    expect(scaleDenom(app.lift.mmPerUnit, 0)).toBeNull()
    // 평행 — 렌즈는 들어갈 때 버려지므로(입력 경로) 배율에 안 실린다
    setPose(app, frontParallel(app))
    expect(app.viewF).toBeNull()
    expect(parallelPxPerUnit(app)).not.toBeNull()
    // 되돌아오면 다시 렌즈 자리다
    setPose(app, perspectivePose(app.pose))
    expect(parallelPxPerUnit(app)).toBeNull()
    ledger['gate5_exclusive'] = {
      perspective_px_per_unit: null,
      parallel_px_per_unit_defined: true,
      note: '두 값이 동시에 뜨지 않는 것은 **화면 코드의 분기 하나**이고(main.ts syncLens) e2e가 문자열로 잰다',
    }
  })
})

it('원장', () => {
  const payload = JSON.stringify({
    what: 'web2-42 3번 — 읽는 값이 투영에 따라 대체된다(렌즈길이 mm ↔ 축척).',
    canonical_command: 'LEDGER=1 npx vitest run test/read42.test.ts',
    why: (
      '원근에서 축척은 정의되지 않고(같은 선이 깊이마다 다른 길이로 찍힌다) 평행에서 '
      + '렌즈길이는 무의미하다(눈이 없다). 그래서 한 자리를 **서로 대신한다**.'
    ),
    conversion_basis: {
      film35: '36 × 24 mm — 대각 43.2666…(지시문의 43.27)을 **유도**한다(#88: 상수로 안 적는다)',
      formula: 'mm = f · 43.27 / diag  (f와 diag는 같은 단위 — 문서 px)',
      meaning: '화면(문서 프레임)의 대각을 그 판의 대각으로 본다 = **같은 대각 화각**을 내는 렌즈',
      scale: '분모 = mmPerUnit ÷ (화면 CSS px per 세계단위) ÷ (25.4/96) — CSS 명세가 96px = 1in',
      scale_source: '`lift.mmPerUnit` = 32-5의 `doc.scaleRef`가 정한 값. **새 기제를 안 만들었다**',
    },
    ...ledger,
    gate: {
      for: 'web2-42 3번',
      registered: [
        '알려진 35mm 렌즈-화각 일곱 칸 × 프레임 비 셋에서 환산 오차 < 0.5 mm',
        '**반증**: 자를 «판형 가로 36 ↔ 프레임 가로 W»로 바꾸면 4:3·세로에서 그 표를 벗어난다 (3:2에서는 두 자가 상쇄돼 안 갈린다 — 그 값도 낸다)',
        '표시 동작점 둘(1점 기본 f · 2점 풀린 f)에서 각각의 mm를 낸다 — 하나만 내면 동작점 하나다(#12)',
        '축척이 미정이면 「축척 미정」이 뜬다',
        '치수를 주면 분모가 `mmPerUnit`에서 서고, 줌하면 그만큼 바뀐다',
        '원근에서 화면 배율이 null이다 — 축척이 정의되지 않는다는 것의 코드 판',
        '렌즈를 바꾸면 mm가 비례해 바뀐다(31-2 무회귀)',
      ],
      reachability: (
        '**무엇이 이 기준을 넘는가**(#35): 자를 대각에서 **가로(W)**로 바꾼 판이 넘는다 — '
        + '같은 f에서 환산 mm가 알려진 값에서 최대 `falsify_worst_err_mm_using_width` 만큼 벗어난다. '
        + '문이 0.5 mm이므로 그 판은 한참 밖이다. ⚠ 프레임 비가 3:2면 W와 대각이 상수배라 **그 위약이 '
        + '안 갈린다** — 그래서 4:3과 세로 판을 같이 돌린다(그 칸이 넘는 값을 낸다).'
      ),
      reachability_note: (
        '⚠ 이것은 «기준을 달성할 수 있는가»(오라클)가 아니라 **«기준에서 떨어지는 판»**이다 — '
        + '1차 리뷰어가 그 범주 차이를 지적했다. 이 게이트의 기준(0.5 mm)은 달성 가능성이 자명하므로'
        + '(식이 맞으면 통과) 여기 적는 값은 **판별력**이다.'
      ),
      reachability_source: 'gate1_focal35/falsify_worst_err_mm_using_width',
      reachability_value: (ledger['gate1_focal35'] as { falsify_worst_err_mm_using_width: number })
        .falsify_worst_err_mm_using_width,
    },
    selfcheck_flags_known: {
      ratio_exactly_2: (
        '⚠ 「한 스톱이면 mm가 정확히 2배」·「D가 절반이면 분모가 정확히 절반」은 **대수적 귀결**이다 '
        + '(환산과 분모가 f·1/D에 선형이다). 그 2와 0.5는 아무것도 안 잰다 — 재는 것은 위의 '
        + '**밖에서 온 표**와의 대조이고, 판별력은 반증 판(가로 W)이 준다.'
      ),
      constants_snapshot_absent: '⚠ web2 라인 전체의 구멍이다(`web/test/constants.ts`에만 있다 — DEFERRED).',
    },
    pitfalls: ['#77', '#92', '#88', '#54', '#61', '#42'],
    pitfalls_note: (
      '#77 ㉡ — 환산을 같은 식으로 다시 재면 항등이라 **밖에서 온 표**와 견준다. '
      + '#92 — 자(대각 ↔ 가로)를 바꿔 그 값이 실제로 움직이는 것을 나란히 낸다. '
      + '#88 — 43.27을 상수로 안 적고 36×24에서 유도한다. '
      + '#54 — 축척의 출처는 `lift.mmPerUnit` 하나다(32-5). '
      + '#61 — 1:98을 1:100으로 **안 붙인다**(조용히 틀린 값이 된다).'
    ),
  }, null, 2)
  const out = resolve(HERE, '../../stage0/out/read42_web2.json')
  if (process.env.LEDGER === '1') {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, payload)
  }
  expect(payload.length).toBeGreaterThan(100)
})
