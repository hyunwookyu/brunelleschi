// 원장 — web2-34 7번(**어긋남 문턱을 자연 분포 위에 다시 놓는다**).
//
// 문제: `DIM_SKEW_RATIO` 0.02는 **소음 기준**으로 잡힌 값인데 이 표시의 목적은 소음이 아니라
// **오독**이다(지시 문면). 손으로 그린 투시도의 비례는 원래 10~20% 어긋나고, 오독은 **배수**로
// 틀린다(9000↔3000은 3배 · 자릿수 누락은 10배).
//
// 이 원장이 재는 것 다섯:
//  ① **자연 분포** — 「사람이 옳은 값을 적었는데도 잰 값과 벌어지는 폭」. 출처는 적은 값이
//     아니라 **기하**다: 끝점 지터 · 소실점 각 오차 · 축척을 정한 첫 치수 자체의 오차.
//  ② **옛 문턱의 재현(D-2)** — 0.02가 그 분포에서 실제로 얼마나 뜨는가(사용자가 말한 병).
//  ③ **문턱 스윕** — 문턱마다 오탐(자연)과 잡음(3배·10배 오독, **양방향**).
//  ④ **자의 모양** — `|비−1|`(비대칭) ↔ `max(비, 1/비)`(대칭). **작게 적은 쪽**에서 갈린다.
//  ⑤ **문턱의 두 경계** — 아래는 오탐이 늘고 위는 3배 오독을 놓친다. 새 값이 그 사이인가.
//
// 정본 명령: LEDGER=1 npx vitest run test/skew34_measure.test.ts
// (LEDGER=1이 없으면 원장을 안 쓴다 — 전량 실행의 병렬 판이 못 덮는다.)

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPS, cells, SCALE_MM, HY, type Cell } from './skew34scene'
import { C } from '../src/core/constants'
import { W, H } from './fixtures'

const HERE = dirname(fileURLToPath(import.meta.url))
const r4 = (v: number) => Number(v.toFixed(4))
const SEEDS = [1, 2, 3, 4, 5]
/** 자연 대역의 끝점 지터(그림 대각 대비 σ). **대역의 출처는 `camera_gate`의 기준 부분집합**
 *  `by_axis_err_baseline_3pt_jitter_le_0_01`(= 지터 ≤ 0.01)이다 — `camera_gate.json@f351839a`. */
const JITS = [0, 0.005, 0.01]
const BEYOND = 0.03                    // 대역 «밖» — 참고 행으로만 낸다(그 자리는 그림이 깨진다)
/** 소실점 각 오차(도). `deg_0.25` 행이 **실측 축 방향 오차 0.5°**의 자리다
 *  (그 행의 `axis_dir_err_deg.median` = 0.4838 — `camera_gate.json@f351839a`). */
const DEGS = [0, 0.25]

const quant = (v: number[], p: number): number => {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!
}
const dist = (v: number[]) => ({
  n: v.length,
  median: r4(quant(v, 0.5)), p90: r4(quant(v, 0.9)), p95: r4(quant(v, 0.95)),
  p99: r4(quant(v, 0.99)), max: r4(Math.max(...v)),
})
const kn = (k: number, n: number) => ({ k, n, rate: r4(n ? k / n : 0) })

/** 한 배수(mult)에 대해 대역 전체를 훑는다. mult 1 = 자연 분포. */
function sweep(mult: number, jits = JITS, round = false): Cell[] {
  const out: Cell[] = []
  for (const c of COMPS) for (const jit of jits) for (const deg of DEGS) for (const sd of SEEDS)
    for (const k of cells(c, jit, deg, sd, mult, round)) out.push(k)
  return out
}
/** 그리려던 칸 수(분모의 출처를 명시한다 — #11) */
const attempted = (jits: number[]) => COMPS.length * jits.length * DEGS.length * SEEDS.length * 11

describe('원장 — web2-34 7번 어긋남 문턱', () => {
  it('자연 분포 · 옛 문턱 재현 · 문턱 스윕 · 자의 모양 · 두 경계', () => {
    // ── ① 자연 분포 ────────────────────────────────────────────────────
    const nat = sweep(1)
    const folds = nat.map(k => k.fold)
    const natural_overall = { ...dist(folds), attempted: attempted(JITS), lifted: kn(nat.length, attempted(JITS)) }

    // 대역별(지터 × 소실점 각) — 어느 성분이 얼마를 만드는가
    const by_band = JITS.flatMap(jit => DEGS.map(deg => {
      const v = nat.filter(k => k.jit === jit && k.deg === deg)
      const n0 = COMPS.length * SEEDS.length * 11
      return {
        jit, deg, lifted: kn(v.length, n0),
        ...(v.length ? dist(v.map(k => k.fold)) : { n: 0, median: NaN, p90: NaN, p95: NaN, p99: NaN, max: NaN }),
      }
    }))
    // 구도별 — 픽스처가 실사용 대역을 덮는지(D-5)를 눈으로 본다
    const by_comp = COMPS.map(c => {
      const v = nat.filter(k => k.comp === c.name)
      return { comp: c.name, lifted: kn(v.length, JITS.length * DEGS.length * SEEDS.length * 11), ...dist(v.map(k => k.fold)) }
    })
    // 씨별 — **꼬리는 씨에 약하다**(#14). 중앙값과 꼬리를 따로 낸다.
    const by_seed = SEEDS.map(sd => {
      const v = nat.filter(k => k.seed === sd).map(k => k.fold)
      return { seed: sd, ...dist(v), over_2: kn(v.filter(x => x > 2).length, v.length) }
    })
    // 대역 «밖»(지터 0.03 = σ가 오스냅 반경의 두 배 남짓) — 참고 행이다
    const beyondCells = sweep(1, [BEYOND])
    const beyond_band = {
      jit: BEYOND, lifted: kn(beyondCells.length, attempted([BEYOND])),
      ...dist(beyondCells.map(k => k.fold)),
      note: '**대역 밖이다** — 그림 자체가 안 선다(위 `lifted` 비율을 보라). 문턱을 이 행으로 정하지 않는다.',
    }

    // ── ② 옛 문턱의 재현 (D-2) ─────────────────────────────────────────
    // 옛 자는 `|비 − 1| > 0.02`다. 잡음 0인 칸(지터 0 · 각 0)은 **구성상 정확히 1**이라
    // 안 뜬다 — 그 칸이 DEFERRED가 적은 「잡음 폭 0」의 픽스처이므로 **따로 센다**.
    const OLD = 0.02
    const quiet = nat.filter(k => k.jit === 0 && k.deg === 0)
    const noisy = nat.filter(k => !(k.jit === 0 && k.deg === 0))
    const old_threshold = {
      ruler: '|적은 값 ÷ 잰 값 − 1| > 0.02  (web2-32 7번의 값)',
      fires_all: kn(nat.filter(k => Math.abs(k.ratio - 1) > OLD).length, nat.length),
      fires_noisy_only: kn(noisy.filter(k => Math.abs(k.ratio - 1) > OLD).length, noisy.length),
      fires_noiseless_control: kn(quiet.filter(k => Math.abs(k.ratio - 1) > OLD).length, quiet.length),
      note: (
        '**옛 픽스처가 본 것이 아래 세 번째 줄이다** — 잡음 폭 0에서는 0/220이라 「문턱 절반에서 '
        + '안 뜬다」가 성립했다(DEFERRED의 그 행). 흔들림을 태우면 첫·둘째 줄이 나오고, 그것이 '
        + '사용자가 말한 「2%면 거의 모든 치수에 뜬다」다.'
      ),
    }

    // ── ③ 문턱 스윕 (오탐 ↔ 놓침) ──────────────────────────────────────
    // 오독은 **양방향**이다: 3배 크게 적은 것과 3배 작게 적은 것은 비가 3과 0.333이라
    // **다른 값**이다. 자가 비 하나면 작게 적은 쪽이 먼저 샌다 — 그것을 ④가 잰다.
    const up3 = sweep(3), dn3 = sweep(1 / 3), up10 = sweep(10), dn10 = sweep(1 / 10)
    const TS = [1.2, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5]
    const over = (v: Cell[], t: number) => kn(v.filter(k => k.fold > t).length, v.length)
    // ⚠ **원장의 자와 제품의 자가 같은지**를 그 자리에서 묻는다(#54) — `over(nat, T)`는
    // fold로 세고 `off`는 `skewOff`가 낸 값이다. 둘이 갈리면 원장이 딴 자를 쓰는 것이다.
    expect(nat.filter(k => k.off).length).toBe(nat.filter(k => k.fold > C.DIM_SKEW_FOLD).length)
    const threshold_sweep = TS.map(t => ({
      fold_threshold: t,
      false_positive_natural: over(nat, t),
      catch_3x_up: over(up3, t), catch_3x_down: over(dn3, t),
      catch_10x_up: over(up10, t), catch_10x_down: over(dn10, t),
    }))

    // ── ④ 자의 모양 — 비 하나 ↔ 대칭 ──────────────────────────────────
    // ⚠⚠ **이 항목에서 가장 조용히 틀리기 쉬운 자리다.** 「출발 가설 2배(100%)」를 옛 자에
    // 그대로 넣으면(|비−1| > 1) **작게 적은 오독이 통째로 샌다**: 3배 작게 적으면 |0.333−1|
    // = 0.667이고 **자릿수를 통째로 빠뜨려도**(10배 작게) |0.1−1| = 0.9라 둘 다 1보다 작다.
    const asym = (v: Cell[], t: number) => kn(v.filter(k => Math.abs(k.ratio - 1) > t).length, v.length)
    const ruler_shape = {
      symmetric: 'fold = max(비, 1/비) > 문턱   ← **고른 자**',
      asymmetric: '|비 − 1| > 문턱              ← 옛 자',
      at_100_percent: {
        note: '지시의 출발 가설(2배 = 100%)을 두 자에 각각 넣은 값이다. **같은 크기인데 답이 갈린다.**',
        asymmetric_false_positive: asym(nat, 1),
        asymmetric_catch_3x_up: asym(up3, 1), asymmetric_catch_3x_down: asym(dn3, 1),
        asymmetric_catch_10x_up: asym(up10, 1), asymmetric_catch_10x_down: asym(dn10, 1),
        symmetric_false_positive: over(nat, 2),
        symmetric_catch_3x_up: over(up3, 2), symmetric_catch_3x_down: over(dn3, 2),
        symmetric_catch_10x_up: over(up10, 2), symmetric_catch_10x_down: over(dn10, 2),
      },
      why: (
        '`fold`는 **뒤집어도 같은 값**이다(fold(r) == fold(1/r)) — 「배수로 틀렸다」가 방향에 '
        + '무관한 진술이므로 자도 방향에 무관해야 한다. 비 하나짜리 자는 위쪽이 무한이고 '
        + '아래쪽이 1에서 막혀 있어 **아래쪽에 1보다 큰 문턱을 못 놓는다**.'
      ),
    }

    // ── ⑤ 오탐의 소재 — 무엇이 꼬리를 만드나 ───────────────────────────
    const T = C.DIM_SKEW_FOLD
    const fp = nat.filter(k => k.fold > T)
    const tally = (key: (k: Cell) => string) => {
      const m = new Map<string, number>()
      for (const k of fp) m.set(key(k), (m.get(key(k)) ?? 0) + 1)
      return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]))
    }
    const fp_sources = {
      at_threshold: T,
      total: kn(fp.length, nat.length),
      by_comp: tally(k => k.comp), by_edge: tally(k => k.edge), by_jit: tally(k => String(k.jit)),
      note: (
        '꼬리는 **고르게 퍼진 잡음이 아니다** — 뒤쪽 세로 모서리(`vert3`)와 소실점이 먼 구도에 '
        + '몰려 있다. 둘 다 «지평선에 가까운 깊이»라 재구성 오차가 발산하는 자리다(이론서 2.2). '
        + '그래서 문턱을 더 올려도 이 칸들은 안 사라진다 — 아래 `boundaries.lower`가 그 근거다.'
      ),
    }

    // ── ⑥ 사람은 둥근 수를 적는다 — 50 mm 눈금 반올림의 몫 ──────────────
    const rounded = sweep(1, JITS, true)
    const rounding = {
      step_mm: 50,
      exact: dist(folds), rounded: dist(rounded.map(k => k.fold)),
      over_threshold_exact: over(nat, T), over_threshold_rounded: over(rounded, T),
      note: '치수 스냅 눈금(50 mm)으로 반올림해도 분포가 안 움직인다 — 이 성분은 이 대역에서 무시해도 된다(확인하고 적는다, 짐작으로 빼지 않는다).',
    }

    // ── 두 경계 (D-3 반증) ─────────────────────────────────────────────
    const row = (t: number) => threshold_sweep.find(r => r.fold_threshold === t)!
    const boundaries = {
      chosen: T,
      lower: {
        what: '**아래 경계 = 오탐**. 문턱을 내리면 자연 분포의 어깨를 자르기 시작한다.',
        at_1_2: row(1.2).false_positive_natural, at_1_5: row(1.5).false_positive_natural,
        at_1_75: row(1.75).false_positive_natural, at_chosen: row(2).false_positive_natural,
        note: (
          '1.75 위로는 오탐이 거의 안 준다(꼬리가 «퍼진 잡음»이 아니라 «재구성이 깨진 칸»이라 '
          + '그렇다 — `fp_sources`). 즉 2 위로 더 올려도 **오탐으로 사는 것이 없다**.'
        ),
      },
      upper: {
        what: '**위 경계 = 놓침**. 문턱을 올리면 3배 오독이 새어 나간다(10배는 훨씬 위에서 샌다).',
        at_chosen_3x_up: row(2).catch_3x_up, at_chosen_3x_down: row(2).catch_3x_down,
        at_2_5_3x_up: row(2.5).catch_3x_up, at_2_75_3x_up: row(2.75).catch_3x_up,
        at_3_3x_up: row(3).catch_3x_up, at_3_3x_down: row(3).catch_3x_down,
        at_3_5_3x_up: row(3.5).catch_3x_up,
        note: (
          '3배 오독의 fold는 **정확히 3이 아니다** — 자연 흔들림이 곱해져 3 언저리에 퍼진다. '
          + '그래서 문턱 3.0은 절반을 놓친다. 위 경계는 «3»이 아니라 **2.75 근처**다.'
        ),
      },
      verdict: `아래 경계(오탐이 늘기 시작하는 자리) < ${T} < 위 경계(3배가 새기 시작하는 자리)`,
    }

    for (const r of by_band) console.log(`[34-7 자연] ${JSON.stringify(r)}`)
    for (const r of threshold_sweep) console.log(`[34-7 스윕] ${JSON.stringify(r)}`)
    console.log(`[34-7 옛문턱] ${JSON.stringify(old_threshold)}`)
    console.log(`[34-7 자] ${JSON.stringify(ruler_shape.at_100_percent)}`)

    // ── 팔의 단언(원장은 스스로 게이트를 진다) ─────────────────────────
    expect(old_threshold.fires_noiseless_control.k).toBe(0)          // 옛 픽스처가 본 그 0
    expect(old_threshold.fires_noisy_only.rate).toBeGreaterThan(0.5) // 흔들림을 태우면 절반 넘게 뜬다
    expect(natural_overall.median).toBeLessThan(1.2)                 // 자연 어긋남의 «보통»
    expect(row(2).catch_10x_up.rate).toBe(1)
    expect(row(2).catch_10x_down.rate).toBe(1)
    expect(row(2).catch_3x_up.rate).toBeGreaterThan(0.95)
    expect(row(2).catch_3x_down.rate).toBeGreaterThan(0.9)
    expect(row(2).false_positive_natural.rate).toBeLessThan(0.06)
    // 반증(D-3) — 위 경계가 실제로 있다: 3.0에서 3배가 절반 넘게 샌다
    expect(row(3).catch_3x_up.rate).toBeLessThan(0.5)
    // 반증(D-3) — 비 하나짜리 자를 100%로 두면 작게 적은 오독이 **통째로** 샌다
    expect(ruler_shape.at_100_percent.asymmetric_catch_3x_down.k).toBe(0)
    expect(ruler_shape.at_100_percent.asymmetric_catch_10x_down.k).toBe(0)

    const out = resolve(HERE, '../../stage0/out/skew34_web2.json')
    const payload = {
      what: 'web2-34 7번 — 어긋남 문턱을 **자연 분포** 위에 다시 놓는다. 자연 분포 · 옛 문턱 재현 · 문턱 스윕(양방향) · 자의 모양 · 문턱의 두 경계.',
      why: (
        '0.02는 **소음** 기준으로 잡힌 값인데 이 표시의 목적은 **오독**이다(지시 34-7). '
        + '손으로 그린 투시도의 비례는 원래 10~20% 어긋나고 오독은 배수로 틀린다. '
        + '`DEFERRED.md`의 「어긋남 문턱 0.02의 «여유»를 못 쟀다」가 이 원장으로 닫힌다 — '
        + '그 행이 요구한 것이 「끝점 지터·카메라 섭동을 태운 픽스처로 잰 값 자체의 비 분포를 '
        + '재서 문턱과 나란히 낸다」였다.'
      ),
      trap: (
        '⚠⚠ **문턱을 먼저 고르고 픽스처를 맞추면 안 된다.** 순서는 «자연 분포를 재고 → 그 꼬리 '
        + '위에 문턱을 놓는다»다. 그리고 ⚠⚠ **자를 비 하나로 두면 작게 적은 오독이 샌다** — '
        + '같은 «100%»가 위로는 2배이고 아래로는 «절대 도달 못 하는 값»이다(`ruler_shape`).'
      ),
      conditions: {
        scene: '상자 하나(모서리 12) + 지평선. 소실점 둘은 지평선 위. **앱 경로(`session.draw`)로 그린다** — 스냅·축 판정이 지터를 도로 잡아 주는 것까지 앱이 내는 값이다.',
        intent: `사람은 **흔들리지 않은 상자**의 비례를 적는다 — 첫 치수(앞 세로 모서리)에 ${SCALE_MM} mm를 적어 축척을 정하고, 나머지 모서리에는 그 상자에서 나오는 «옳은» 값을 적는다. 그러므로 비가 1이 아닌 것은 **전부 기하의 흔들림**이다.`,
        jitter: `끝점 σ = (그림 대각) × {${JITS.join(', ')}} — 대역의 출처는 camera_gate.json@f351839a의 기준 부분집합 \`by_axis_err_baseline_3pt_jitter_le_0_01\`(지터 ≤ 0.01)`,
        camera: `소실점 각 오차 = {${DEGS.join(', ')}}° — 0.25°가 **실측 축 방향 오차 0.5°**의 자리다(camera_gate.json@f351839a의 \`deg_0.25\` 행: axis_dir_err_deg median 0.4838). 축마다 부호가 따로 정해진다`,
        seeds: SEEDS, compositions: COMPS.map(c => c.name),
        viewport: { W, H, horizon_y: HY },
        denominator: `구도 ${COMPS.length} × 지터 ${JITS.length} × 각 ${DEGS.length} × 씨 ${SEEDS.length} × 모서리 11 = ${attempted(JITS)} 칸을 시도하고, 3D로 안 올라간 칸은 빠진다(#11 — 분모를 밝힌다)`,
        command: 'LEDGER=1 npx vitest run test/skew34_measure.test.ts',
      },
      constants: {
        DIM_SKEW_FOLD: C.DIM_SKEW_FOLD,
        retired_DIM_SKEW_RATIO: 0.02,
        OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX,
        dim_snap_step_mm: 50,
      },
      constants_note: (
        '`DIM_SKEW_FOLD`는 **배수**다: `max(적은 값 ÷ 잰 값, 잰 값 ÷ 적은 값) > 이 값`이면 뜬다. '
        + '옛 `DIM_SKEW_RATIO`(비 편차 0.02)는 **없앴다** — 자의 모양이 바뀌었으므로 이름도 바뀐다. '
        + '⚠ `OSNAP_RADIUS_PX`를 같이 싣는 이유: 지터 σ가 이 반경을 넘으면 시작점이 옛 끝점에 '
        + '안 붙어 그림이 통째로 갈린다(지터 0.03 행이 그 자리다).'
      ),
      natural_overall, by_band, by_comp, by_seed, beyond_band,
      old_threshold, threshold_sweep, ruler_shape, fp_sources, rounding, boundaries,
      gate: {
        '① 자연 분포를 수치로 낸다': `${natural_overall.n}칸 · 중앙 ${natural_overall.median} · p90 ${natural_overall.p90} · p95 ${natural_overall.p95} · p99 ${natural_overall.p99} · 최대 ${natural_overall.max}(fold). 씨별 변동폭은 \`by_seed\`(#14)`,
        '② 그 분포에서 오탐률이 낮다': `문턱 ${T}에서 ${boundaries.lower.at_chosen.k}/${boundaries.lower.at_chosen.n}`,
        '③ 배수 오독은 전부 잡힌다': `3배 위 ${row(2).catch_3x_up.k}/${row(2).catch_3x_up.n} · 3배 아래 ${row(2).catch_3x_down.k}/${row(2).catch_3x_down.n} · 10배 위·아래 각 ${row(2).catch_10x_up.k}/${row(2).catch_10x_up.n} · ${row(2).catch_10x_down.k}/${row(2).catch_10x_down.n}`,
        '④ 반증(D-3)': (
          `문턱을 3.0으로 올리면 3배 위가 ${row(3).catch_3x_up.k}/${row(3).catch_3x_up.n}로 무너진다(위 경계가 실재한다). `
          + `그리고 자를 비 하나로 두고 같은 100%를 주면 3배 아래 ${ruler_shape.at_100_percent.asymmetric_catch_3x_down.k}/${ruler_shape.at_100_percent.asymmetric_catch_3x_down.n} · `
          + `10배 아래 ${ruler_shape.at_100_percent.asymmetric_catch_10x_down.k}/${ruler_shape.at_100_percent.asymmetric_catch_10x_down.n}로 **통째로 샌다**.`
        ),
        '⑤ 재현(D-2)': `옛 문턱 0.02는 흔들림을 태운 칸에서 ${old_threshold.fires_noisy_only.k}/${old_threshold.fires_noisy_only.n} 뜬다 — 그것이 사용자가 말한 병이다. 잡음 0인 대조 칸에서는 ${old_threshold.fires_noiseless_control.k}/${old_threshold.fires_noiseless_control.n}이고 **그것이 옛 픽스처가 본 전부**였다`,
        '⑥ 고치지 않는다(#61)': '이 회차는 자와 문턱만 바꿨다 — 적은 값은 여전히 안 덮어쓴다(`skew34.test.ts`가 그 회귀를 진다)',
        reachability: (
          '**무엇이 이 판정을 넘을 수 있는가**(#35). ㉠ 자연 분포가 지금보다 훨씬 넓어지면 '
          + `문턱 ${T}의 오탐이 는다 — 그 자리가 \`by_band\`의 지터 축이고, 대역 밖(0.03) 행이 `
          + '실제로 그 방향을 보여 준다. ㉡ 자가 다시 비 하나가 되면 `ruler_shape`의 아래쪽 '
          + '두 칸이 0으로 떨어진다(같은 실행 안에서 반대 값이 나온다 — D-3). ㉢ 「잰 값」을 '
          + '치수 적용 «뒤» 길이로 되돌리면 **모든 칸의 비가 1**이 되어 자연 분포가 통째로 '
          + '죽는다(#77 ㉡ · AS-C119) — `natural_overall.median`이 1.0000이면 그 일이 난 것이다.'
        ),
        reachability_value: natural_overall.median,
        // ⚠ 구분자는 **`/`**다(selfcheck의 `_resolve`)
        reachability_source: 'natural_overall/median',
      },
      selfcheck_notes: {
        'by_band[jit=0,deg=0].* = 1.0000': (
          '**정상이고 대조군이다** — 흔들림이 없으면 같은 상자를 두 번 그린 것이라 비가 구성상 '
          + '1이다(자기참조 유형 3 · CLAUDE.md §5.1). 이 칸에는 임계를 안 건다. **이 칸 하나가 '
          + 'web2-32의 픽스처 전부**였고 그래서 「문턱 절반에서 안 뜬다」가 잡음 0에서만 보였다 '
          + '— DEFERRED가 적은 그 결함이다. 옆 칸들(지터·각을 태운)이 재는 값이다.'
        ),
        'old_threshold.fires_noiseless_control = 0/220 (k = 0 · rate = 0)': (
          '**죽은 계수가 아니라 이 회차의 재현 대상이다** — 잡음 폭 0인 대조 칸에서는 옛 문턱조차 '
          + '한 칸도 안 뜬다. 그 0이 web2-32가 본 전부였고, DEFERRED가 「그래서 여유를 못 쟀다」로 '
          + '적은 자리다. 분해능의 짝은 바로 위 줄(`fires_noisy_only` 719/1009)이다: 같은 문턱·같은 '
          + '자인데 흔들림을 태우면 71.3%가 된다. **둘이 갈리는 것이 이 회차의 D-2 재현이다.**'
        ),
        'by_band[*].lifted.rate = 1 · by_comp[0·2].lifted.rate = 1': (
          '**정상이다** — 지터가 작은 대역·소실점이 가까운 구도에서는 열두 모서리가 전부 3D로 오른다. '
          + '이 열이 죽은 계수가 아니라는 짝은 같은 열의 **0.7909**(지터 0.01)와 **0.2159**(대역 밖 '
          + '0.03)다: 같은 계산이 대역을 넓히면 1에서 내려온다. 분모의 출처는 `conditions.denominator`.'
        ),
        'threshold_sweep[*].catch_10x_*.rate = 1': (
          '**정상이다** — 자릿수 누락(10배)은 자연 분포의 최대(fold '
          + `${natural_overall.max})보다 훨씬 밖이라 문턱이 무엇이든 잡힌다. 이 열이 재는 것은 `
          + '«잡히는가»가 아니라 **어디서부터 안 잡히는가**이고, 그 자리는 3.5 위다.'
        ),
        'ruler_shape.at_100_percent.asymmetric_catch_*_down.k = 0': (
          '**이것이 이 회차의 결론이다 — 죽은 계수가 아니다.** 비 하나짜리 자에 100%를 주면 '
          + '아래쪽 오독은 |비−1|이 1을 못 넘어(3배 0.667 · 10배 0.9) **한 칸도 안 뜬다**. '
          + '분해능의 짝은 바로 위 줄(`asymmetric_catch_3x_up`)이다: 같은 자·같은 문턱에서 '
          + '위쪽은 거의 다 잡는다. 둘이 갈리는 것이 «자가 비대칭이다»의 증거다.'
        ),
        'constants/metric_defs 스냅샷 없음': (
          '**web2 라인 전체의 유보다**(`DEFERRED.md`) — 이 라인은 `constantsSnapshot()`을 안 쓰고 '
          + '`constants` 블록을 손으로 적는다. 그래서 문서는 이 원장을 **이름으로** 가리킨다.'
        ),
      },
      pitfalls: ['#12', '#14', '#11', '#61', '#75', '#77', '#54', '#42', '#35', '#26'],
      pitfalls_note: (
        '#12 — 옛 0.02는 동작점이었고 이 원장이 그것을 **측정 위의 값**으로 바꾼다. '
        + '#14 — 꼬리는 씨에 약하다: 씨별 「fold > 2」가 `by_seed.over_2`이고 폭이 넓다. '
        + '중앙값은 씨에 강하다(전부 1.0x). **결론은 중앙이 아니라 두 경계 사이의 거리가 진다.** '
        + '#11 — 모든 수를 분자/분모로 적고 분모의 출처를 `conditions.denominator`에 밝힌다. '
        + '#75 ㉣ — 자를 바꿨으므로 **옛 자를 읽던 팔을 같이 고쳤다**(`scale32.test.ts` · '
        + '`scale32_measure.test.ts` · `e2e/scale32.spec.ts`). #26 — 못 잰 것을 잰다고 안 적는다: '
        + '실기기 손획 표본은 **여전히 0**이고 이 분포는 **합성**이다(아래).'
      ),
      what_this_does_not_say: (
        '⚠ 이 분포는 **합성 지터**이지 실기기 손획 표본이 아니다(AS-L9·AS-C1 계열의 표본 0이 '
        + '여기서도 그대로다). 지터 대역의 근거는 `web/` 라인의 `camera_gate`가 쓴 것과 같은 '
        + '대역이고, 소실점 각 0.25°도 그 원장이 «실측 0.5°에 대응한다»고 등록한 값이다. '
        + '그러므로 이 원장이 세우는 것은 「**손획 오차의 참분포**」가 아니라 '
        + '「**그 대역에서 문턱 2배가 오탐과 놓침 사이에 있다**」이다.'
      ),
    }
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify(payload, null, 2))
      console.log(`[원장] ${out}`)
    } else {
      console.log('[34-7] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
  }, 60_000)
})
