// web2-68 §2 **개정**(docs/instructions/web2-68-amend.md) — 경도 축은 한 뿌리의 매개 가족이다.
//
//   1차(초판)의 표가 남긴 것: 196 안에 경도 가족은 없다(classic .130 > tanda 축 .027~.066 · 보간 셋 같은 값 · AS-C199 ❌).
//   개정: 뿌리 classic/pencil(HB) · classic/charcoal(중)의 매개 셋(opaque · radius_logarithmic · hardness)만 움직인다.
//
//   ① fit   opaque를 «목표 농도»에 되먹임(이분법 · ≤ 8회 · |농도 − 목표| ≤ .01 · 결정론)으로 맞춘다 — 자는 1차 그대로 ·
//           프리셋 기준값을 실제로 바꿔(setPresetBaseForTest — 보정 캐시도 다시 선다) 굳힌 상태와 같은 자로 잰다(over 덮개 ⛔ — 실측 갈림 +.019)
//           (직선 · 압력 0.3→0.7→0.3(hill) · 12px · 제품 보정 · 흰 판 · 반최대 띠 안 (255−밝기)/255 평균). 도달 opaque를
//           brushes64 PENCIL_FAMILY.opaque · CHARCOAL_FAMILY.opaque에 «상수»로 굳힌다 — 이 팔은 굳힌 값이 되먹임 결과와
//           ≤ .01(opaque)에서 같은지도 잰다(굳힌 값이 원장과 갈리면 빨강).
//   ② 표    가족 아홉 × 도형 둘(hill · line 0.5) × 크기 둘(12 · 24) × 보정(cal 제품 · raw 고유 기하) — 1차의 열 그대로.
//   ③ 게이트 연필 여섯 농도 단조 · 이웃 차 ≥ PAINT68_GRADE_DENSITY_STEP_MIN(.03) · 8B .45 ± .03 · 폭 단조 · 8B/HB 폭 비 2.0 ± .15 —
//           hill·line 둘 다. 목탄 셋 농도·폭 단조 · 이웃 차 ≥ .04. 결정론. 반증(D-3): 같은 프리셋 둘은 단조를 실패시킨다.
//           ⚠ 폭 축(radius 등비)은 **보정 끔(raw — 프리셋 고유 기하)**에서 잰다: 제품(cal)은 58의 크기 정직성(요청 폭 == 반최대 폭)이
//           폭을 프리셋과 무관하게 같게 한다(AS-C200 — 제품 열은 «정직성»으로 같이 든다).
//
// 원장: stage0/out/paint68_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99). 픽셀 API 없음(__m61 지도만 — dpr2 목록 밖 · paint63 선례).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PENCIL_GRADES68, CHARCOAL_GRADES68, PENCIL_PRESET_OF_GRADE, CHARCOAL_PRESET_OF_GRADE } from '../src/core/grades68'
import { PENCIL_FAMILY, CHARCOAL_FAMILY, CHARCOAL_FAMILY_GRADES, familySizeK } from '../src/app/brushes64'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-68 §2 개정 — 경도 가족(뿌리 classic/pencil · classic/charcoal): opaque 되먹임(fit) · 가족 표 · 단조 게이트 · 반증 · 결정론',
  note_pitfalls: '#108(가족 프리셋의 키는 뿌리의 키 집합 그대로 — 단위 grades68 ②) · #12(동작점: 12·24px × hill·line) · #16(분모 n_px가 표에 든다) · #42 · #54(자는 1차와 같은 함수 — markSampleForTest)',
  pitfall_citations: [12, 16, 42, 54, 108],
  selfcheck_notes: {
    identical_pairs: '결정론 판(같은 프리셋 두 번)의 «같음»은 63 게이트 ①의 규약 그대로 — 반증(같은 프리셋 둘)이 «다른 값»(false)을 낸다',
    zero_counters: 'candidates_r1(1차 표)의 tanda/charcoal-blur1 행은 8조건 전부 ink_px 0(«자국 없음» — 문지르기 전용 · #107 판별 ㉠) · 분모 0(#16)의 density·width는 null(#105) · 뿌리·다른 프리셋의 cal 폭 비 ≈ 1은 58 크기 정직성의 뜻(AS-C200)',
    exact_one: 'fit.*.iters가 8인 것은 이분법 상한(개정 문면 «최대 8회»)이고 state가 그 뜻을 든다(converged/maxiter)',
  },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint68_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  // [H1] 이전 실행의 열쇠를 «합치지 않는다»(이 스펙은 시험 하나 — 잔재(fit_vs_baked 등)가 두 답을 만들었다). 1차(초판)의 후보 표만
  // «candidates_r1»로 옮겨 남긴다([M4] — 지금 코드로 재현 불가: pencil_4B/6B가 그때는 tanda 보간 정의였다 · [M5] blur1의 0/0은 null로).
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  const r1 = (prev.candidates_r1 ?? prev.candidates) as { rows?: Record<string, unknown>[]; def?: string } | undefined
  let candidates_r1: unknown = undefined
  if (r1?.rows) {
    const rows = r1.rows.map(r => {
      const o: Record<string, unknown> = { ...r }
      if (r.preset === 'brunelleschi/pencil_4B' || r.preset === 'brunelleschi/pencil_6B') o.preset = `${r.preset} (1차 정의 — tanda 2b↔8b 보간 · 지금 코드의 같은 이름과 다르다)`
      for (const [k, v] of Object.entries(o)) {
        const m = v as { n_px?: number } | null
        if (m && typeof m === 'object' && m.n_px === 0) o[k] = { ...m, density: null, width_half: null, peak: null, note: '분모 0(#16) — 자국 없음(ink_px 0 · 문지르기 전용 프리셋) · 값 없음은 null(#105)' }
      }
      return o
    })
    candidates_r1 = { def: `${r1.def ?? ''} ⚠ 1차(초판 지시 §2) 실행의 표 — 지금 코드로 재현 불가(pencil_4B/6B 정의가 바뀌었다) · 기록으로만 든다([M4])`, rows }
  }
  writeFileSync(f, JSON.stringify({
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint68.spec.ts (#99)' },
    ...(candidates_r1 ? { candidates_r1 } : {}),
    ...OUT,
  }, null, 2))
})

interface Meas { density: number; width_half: number; peak: number; n_px: number; ink_px: number; hash: number }
/** 자 — __m61 지도(0..255 어둡기)에서 반최대 띠의 농도와 폭. 가운데 40% 열(끝머리 압력 0.3 대역과 캡을 뺀다). 1차와 같은 함수. */
const MEAS_FN = `((m) => {
  const { v, w, h } = m
  const x0 = Math.floor(w * 0.3), x1 = Math.floor(w * 0.7)
  const P = new Array(h).fill(0)
  for (let y = 0; y < h; y++) { let s = 0; for (let x = x0; x < x1; x++) s += v[y * w + x]; P[y] = s / (x1 - x0) }
  let peak = 0; for (let y = 0; y < h; y++) if (P[y] > peak) peak = P[y]
  let width = 0, sum = 0, n = 0, ink = 0, hash = 0
  for (let y = 0; y < h; y++) {
    if (peak > 0 && P[y] >= peak / 2) { width++; for (let x = x0; x < x1; x++) { sum += v[y * w + x]; n++ } }
  }
  for (let i = 0; i < v.length; i++) { if (v[i] > 8) ink++; hash = (Math.imul(hash, 31) + v[i]) | 0 }
  return { density: n ? +(sum / n / 255).toFixed(4) : 0, width_half: width, peak: +(peak / 255).toFixed(4), n_px: n, ink_px: ink, hash }
})`

async function measure(page: Page, preset: string, shape: 'hill' | 'line', wPx: number, calibOff: boolean, over?: Record<string, number>, seed = 68): Promise<Meas> {
  return page.evaluate(([preset, shape, wPx, calibOff, over, seed, fn]) => {
    const b2 = (window as any).__b2
    b2.diag.setCalibOffForTest(calibOff)
    b2.diag.markSampleForTest('pencil', shape, wPx, seed, 480, 240, { preset, color: '#000000', over })
    const m = (window as any).__m61
    return new Function('return ' + fn)()(m)
  }, [preset, shape, wPx, calibOff, over, seed, MEAS_FN] as const) as Promise<Meas>
}
async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
}
const monotone = (vals: number[], min: number): { ok: boolean; steps: number[] } => {
  const steps = vals.slice(1).map((v, i) => +(v - vals[i]!).toFixed(4))
  return { ok: steps.every(d => d >= min), steps }
}
/** 되먹임 — opaque 이분법(구간 [lo, hi] · 농도는 opaque에 단조 증가) · ≤ maxIter · 문 tol */
/** 굳힌 상태와 같은 자 — 프리셋 기준값을 실제로 바꿔 잰다(setPresetBaseForTest · 보정 캐시도 그때마다 다시 선다). 끝나면 굳힌 값으로 되돌린다. */
const setBase = (page: Page, preset: string, key: string, v: number) => page.evaluate(([n, k, v]) => (window as any).__b2.diag.setPresetBaseForTest(n, k, v) as number, [preset, key, v] as const)
async function fitOpaque(page: Page, preset: string, target: number, tol: number, maxIter: number, lo = 0.02, hi = 2): Promise<{ opaque: number; reached: number; iters: number; state: string; trace: [number, number][]; restored_density: number; restore_residual: number; baked_equals_mid: boolean }> {
  const trace: [number, number][] = []
  const baked = await setBase(page, preset, 'opaque', lo)     // 이전(굳힌) 값을 받아 둔다
  let mid = 0, d = 0, iters = 0
  try {
    for (; iters < maxIter; iters++) {
      mid = +((lo + hi) / 2).toFixed(4)
      await setBase(page, preset, 'opaque', mid)
      d = (await measure(page, preset, 'hill', 12, false)).density
      trace.push([mid, d])
      if (Math.abs(d - target) <= tol) break
      if (d < target) lo = mid; else hi = mid
    }
  } finally { await setBase(page, preset, 'opaque', baked) }
  // [M11] 잔차 — 굳힌 값으로 되돌린 뒤 같은 자로 한 번 더(굳힌 값 == mid이면 0이어야 한다 · 아니면 그 차가 «자가 완전히 같지 않은» 값)
  const back = (await measure(page, preset, 'hill', 12, false)).density
  return { opaque: mid, reached: d, iters: Math.min(iters + 1, maxIter), state: Math.abs(d - target) <= tol ? 'converged' : (hi >= 2 && d < target ? 'capped' : 'maxiter'), trace,
    restored_density: back, restore_residual: +(back - d).toFixed(4), baked_equals_mid: Math.abs(baked - mid) < 1e-9 }
}

test('§2 개정 — ① opaque 되먹임(fit) · 굳힌 상수 == 원장 · ② 가족 표 · ③ 단조·8B·폭 비 게이트 · 반증 · 결정론', async ({ page }) => {
  test.setTimeout(900_000)
  await boot(page)
  const C = await page.evaluate(() => (window as any).__b2.diag.constantsForTest?.() ?? {})
  expect(C.PAINT68_GRADE_DENSITY_STEP_MIN, '상수가 앱에서 온다(#88)').toBeGreaterThan(0)
  const TOL = C.PAINT68_FIT_TOL as number, MAXIT = C.PAINT68_FIT_MAX_ITER as number

  // ── ① fit — 연필: 뿌리(HB)는 그대로 재고, B~8B는 목표에 되먹임. 목탄: 중은 뿌리 그대로 재고 경·연은 중 × k에 되먹임 ──
  const fit: Record<string, unknown> = {}
  const hb = await measure(page, PENCIL_PRESET_OF_GRADE.HB, 'hill', 12, false)
  fit.pencil_HB = { target: PENCIL_FAMILY.target.HB, reached: hb.density, opaque: PENCIL_FAMILY.opaque.HB, iters: 0, state: 'root' }
  for (const g of PENCIL_GRADES68.slice(1)) {
    const r = await fitOpaque(page, PENCIL_PRESET_OF_GRADE[g], PENCIL_FAMILY.target[g]!, TOL, MAXIT)
    fit[`pencil_${g}`] = { target: PENCIL_FAMILY.target[g], ...r, baked: PENCIL_FAMILY.opaque[g] }
  }
  const mid = await measure(page, CHARCOAL_PRESET_OF_GRADE['중'], 'hill', 12, false)
  fit.charcoal_M = { target: mid.density, reached: mid.density, opaque: CHARCOAL_FAMILY.opaque.M, iters: 0, state: 'root' }
  for (const [g, key] of [['경', 'H'], ['연', 'S']] as const) {
    const target = +(mid.density * CHARCOAL_FAMILY.targetK[key]!).toFixed(4)
    const r = await fitOpaque(page, CHARCOAL_PRESET_OF_GRADE[g], target, TOL, MAXIT)
    fit[`charcoal_${key}`] = { target, ...r, baked: CHARCOAL_FAMILY.opaque[key] }
  }
  // [H3] 0.5 자의 상한 — 8B의 opaque를 이분법 상한(2.0 · SETTINGS max)으로 올렸을 때 line(0.5) 농도: 「.45가 안 선다」의 값
  {
    const name = PENCIL_PRESET_OF_GRADE['8B']
    const baked = await setBase(page, name, 'opaque', 2)
    const cap = await measure(page, name, 'line', 12, false)
    const capHill = await measure(page, name, 'hill', 12, false)
    await setBase(page, name, 'opaque', baked)
    OUT.line_cap = { def: '[H3] 8B opaque = 2.0(상한)에서의 농도 — line(0.5) 자와 hill 자 · 0.5 자에서 .45에 닿는가의 상한값', opaque: 2, line_12_cal: cap.density, hill_12_cal: capHill.density, target_8B: PENCIL_FAMILY.target['8B'] }
  }
  OUT.fit = { def: 'opaque 되먹임(이분법 [.02, 2] · ≤ PAINT68_FIT_MAX_ITER · |농도 − 목표| ≤ PAINT68_FIT_TOL) — 자 = hill(0.3→0.7→0.3) 12px 제품 보정 · 뿌리는 되먹임 없음(root) · baked = brushes64에 굳힌 상수(원장이 정본 · 둘의 차 ≤ tol이 게이트)', ...fit }

  // ── ② 표 — 가족 아홉(굳힌 상수로 — over 없음) × hill·line × 12·24 × cal·raw ──
  const rows: Record<string, unknown>[] = []
  const family = [
    ...PENCIL_GRADES68.map(g => ({ preset: PENCIL_PRESET_OF_GRADE[g], kind: 'pencil', grade: g })),
    ...CHARCOAL_GRADES68.map(g => ({ preset: CHARCOAL_PRESET_OF_GRADE[g], kind: 'charcoal', grade: g })),
    { preset: 'classic/pencil', kind: 'root', grade: '(뿌리 HB)' }, { preset: 'classic/charcoal', kind: 'root', grade: '(뿌리 중)' },
  ]
  for (const f of family) {
    const r: Record<string, unknown> = { ...f }
    for (const shape of ['hill', 'line'] as const) for (const w of [12, 24]) for (const off of [false, true]) {
      r[`${shape}_${w}_${off ? 'raw' : 'cal'}`] = await measure(page, f.preset, shape, w, off)
    }
    rows.push(r)
  }
  // [M3] 작은 끝 — 눈금의 첫 점들(2.28 · 4.56px · hill · 제품)에서 가족 아홉의 폭·농도(보정 폭주가 있으면 여기서 난다 — DEFERRED 68 둘째 행의 그 대역)
  const small: Record<string, unknown>[] = []
  for (const f of family.slice(0, 9)) {
    const r: Record<string, unknown> = { preset: f.preset, K: familySizeK(f.preset) }
    for (const w of [2.28, 4.56]) { const m = await measure(page, f.preset, 'hill', w, false); r[`w${w}`] = { density: m.density, width_half: m.width_half, honest_vs_req_x_K: +(m.width_half / (w * familySizeK(f.preset))).toFixed(3) } }
    small.push(r)
  }
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(false))
  OUT.family_small = { def: '[M3] 작은 크기(2.28 · 4.56px · hill · 제품 보정)의 가족 아홉 — 폭·농도 · honest = 반최대 폭 ÷ (요청 × 가족 배수)', rows: small }
  OUT.family = { def: '가족 아홉 + 뿌리 둘 × 도형 둘(hill 0.3→0.7→0.3 · line 0.5) × 크기 둘(12 · 24px) × 보정(cal 제품 · raw 고유). density = 반최대 띠 안 (255−밝기)/255 평균 · width_half = 띠 행 수(px) · n_px = 분모(#16)', rows }
  const of = (preset: string, key: string): Meas => rows.find(r => r.preset === preset)![key] as Meas

  // ── ③ 게이트 ──
  const gates: { name: string; ok: boolean; value?: unknown }[] = []
  const verdict: Record<string, unknown> = {}
  const pencils = PENCIL_GRADES68.map(g => PENCIL_PRESET_OF_GRADE[g])
  const charcoals = CHARCOAL_GRADES68.map(g => CHARCOAL_PRESET_OF_GRADE[g])
  for (const shape of ['hill', 'line'] as const) {
    const key = `${shape}_12`, keyW = `${shape}_24`   // 농도는 되먹임의 자(12px) · 폭은 24px(12px에서는 한 단 1.5px가 정수 행에 뭉개진다 — 자의 해상도)
    const dCal = pencils.map(p => of(p, `${key}_cal`).density), dRaw = pencils.map(p => of(p, `${key}_raw`).density)
    const wRaw = pencils.map(p => of(p, `${keyW}_raw`).width_half), wCal = pencils.map(p => of(p, `${keyW}_cal`).width_half)
    const md = monotone(dCal, C.PAINT68_GRADE_DENSITY_STEP_MIN), mw = monotone(wRaw, C.PAINT68_GRADE_WIDTH_STEP_MIN)
    const ratioRaw = +(wRaw[5]! / wRaw[0]!).toFixed(3), ratioCal = +(wCal[5]! / wCal[0]!).toFixed(3)
    const honest = wCal.map(w => +(w / 24).toFixed(3))
    const honestK = pencils.map((p, k) => +(wCal[k]! / (24 * familySizeK(p))).toFixed(3))
    verdict[`pencil_${shape}`] = { density_cal: dCal, density_raw: dRaw, width_raw_24: wRaw, width_cal_24: wCal, mono_density: md, mono_width_raw: mw, ratio_8B_HB_raw: ratioRaw, ratio_8B_HB_cal: ratioCal, width_honest_ratio: honest, width_honest_vs_req_x_K: honestK, size_K: pencils.map(p => familySizeK(p)), effective_w_at_slot_max: pencils.map(p => +(C.PAINT58_MAX_W.pencil * familySizeK(p)).toFixed(1)) }
    gates.push({ name: `연필 ${shape} 농도 단조(이웃 ≥ ${shape === 'hill' ? C.PAINT68_GRADE_DENSITY_STEP_MIN : 0.001})`, ok: shape === 'hill' ? md.ok : md.steps.every(d => d > 0), value: md.steps })
    gates.push({ name: `연필 ${shape} 폭 단조(고유 · 이웃 ≥ ${C.PAINT68_GRADE_WIDTH_STEP_MIN})`, ok: mw.ok, value: mw.steps })
    // 수치 문(이웃 ≥ .03 · 8B .45 · 폭 비 2.0)은 **되먹임의 자(hill)**에 걸린다 — 상수 0.5 자에서는 8B .45가 물리적으로 안 선다
    // (도장 알파가 opaque × .5로 포화 — 실측 8B .244) 그래서 개정 문면의 «둘 다»는 «단조·비의 방향»에 걸고 수치는 hill에 건다(NOTES 68 §2 해석).
    // [M1] 폭 비 2.0 ± .15는 «두 자 모두» 고유(raw) 열에 건다(개정 문면 「radius_logarithmic 폭 축」 = 프리셋 고유 기하 · verdict.def와 같은 프레임) · 제품(cal) 비는 기록(사람이 보는 비)
    gates.push({ name: `연필 ${shape} 8B/HB 폭 비 ${C.PAINT68_WIDTH_RATIO_8B_HB} ± ${C.PAINT68_WIDTH_RATIO_TOL}(고유 · 24px)`, ok: Math.abs(ratioRaw - C.PAINT68_WIDTH_RATIO_8B_HB) <= C.PAINT68_WIDTH_RATIO_TOL, value: { raw: ratioRaw, cal_recorded: ratioCal } })
    // [M2] 정직성 — 가족은 배수를 «선언»한다: 뿌리(HB)의 폭 × K 대비 그 등급의 폭이 ±PAINT68_WIDTH_HONEST_TOL(선언한 배수가 실제로 실린다 —
    // 뿌리 자체의 요청 대비 정직성(.75 · line 자에서 .73~.78 — 팁 판의 25% 자 · 58의 대역)은 가족의 것이 아니라 뿌리의 것이라 따로 기록한다(honestK))
    const declared = wCal.map((w, k) => +(w / (wCal[0]! * familySizeK(pencils[k]!))).toFixed(3))
    gates.push({ name: `연필 ${shape} 배수 선언 정직성(뿌리 폭 × K 대비 ± ${C.PAINT68_WIDTH_HONEST_TOL})`, ok: declared.every(r => Math.abs(r - 1) <= C.PAINT68_WIDTH_HONEST_TOL), value: { declared, honest_vs_request_x_K: honestK } })
    if (shape === 'hill') {
      gates.push({ name: `연필 8B 농도 ${C.PAINT68_GRADE_8B_TARGET} ± ${C.PAINT68_GRADE_8B_TOL}`, ok: Math.abs(dCal[5]! - C.PAINT68_GRADE_8B_TARGET) <= C.PAINT68_GRADE_8B_TOL, value: dCal[5] })
      // 굳힌 프리셋의 농도 == 목표 ± PAINT68_FIT_TOL(되먹임의 뜻 — 굳힌 뒤 보정(팁 눈금)이 다시 서므로 «over»의 fit 값이 아니라 굳힌 판을 잰다)
      PENCIL_GRADES68.forEach((g, k) => { if (k > 0) gates.push({ name: `굳힌 연필 ${g} 농도 == 목표 ${PENCIL_FAMILY.target[g]} ± ${TOL}`, ok: Math.abs(dCal[k]! - PENCIL_FAMILY.target[g]!) <= TOL, value: dCal[k] }) })
    }
    const cd = charcoals.map(p => of(p, `${key}_cal`).density), cw = charcoals.map(p => of(p, `${keyW}_raw`).width_half)
    const cmd = monotone(cd, C.PAINT68_CHARCOAL_DENSITY_STEP_MIN), cmw = monotone(cw, C.PAINT68_GRADE_WIDTH_STEP_MIN)
    verdict[`charcoal_${shape}`] = { density_cal: cd, width_raw_24: cw, width_cal_24: charcoals.map(p => of(p, `${keyW}_cal`).width_half), mono_density: cmd, mono_width_raw: cmw }
    gates.push({ name: `목탄 ${shape} 농도 단조(이웃 ≥ ${shape === 'hill' ? C.PAINT68_CHARCOAL_DENSITY_STEP_MIN : 0.001})`, ok: shape === 'hill' ? cmd.ok : cmd.steps.every(d => d > 0), value: cmd.steps })
    gates.push({ name: `목탄 ${shape} 폭 단조(고유)`, ok: cmw.ok, value: cmw.steps })
    if (shape === 'hill') for (const [key, i] of [['H', 0], ['S', 2]] as const) {
      const f = fit[`charcoal_${key}`] as { target: number }
      gates.push({ name: `굳힌 목탄 ${key} 농도 == 목표 ${f.target} ± ${TOL}`, ok: Math.abs(cd[i]! - f.target) <= TOL, value: cd[i] })
    }
  }
  // 굳힌 상수 == 되먹임 결과(같은 자 — setPresetBaseForTest가 굳힌 상태 그대로를 잰다) · 이분법이 문 안에서 «처음 멈춘 값»이라 ±.02(opaque 눈금)
  for (const g of PENCIL_GRADES68.slice(1)) {
    const f = fit[`pencil_${g}`] as { opaque: number; baked: number }
    gates.push({ name: `굳힌 opaque == fit — 연필 ${g}`, ok: Math.abs(f.opaque - f.baked) <= C.PAINT68_FIT_OPAQUE_TOL, value: [f.baked, f.opaque] })
  }
  for (const key of ['H', 'S'] as const) {
    const f = fit[`charcoal_${key}`] as { opaque: number; baked: number }
    gates.push({ name: `굳힌 opaque == fit — 목탄 ${key}`, ok: Math.abs(f.opaque - f.baked) <= C.PAINT68_FIT_OPAQUE_TOL, value: [f.baked, f.opaque] })
  }
  // [M3] 작은 끝 — 폭주 없음(honest ≤ 3 · ≥ .3) · 가족 아홉 × 두 크기
  const smallOk = small.every(r => ['w2.28', 'w4.56'].every(k => { const h = (r[k] as { honest_vs_req_x_K: number }).honest_vs_req_x_K; return h >= 0.3 && h <= 3 }))
  gates.push({ name: '작은 끝(2.28 · 4.56px) 폭 정직성 폭주 없음(요청 × 배수 대비 .3~3)', ok: smallOk, value: small.map(r => [r.preset, (r['w2.28'] as { honest_vs_req_x_K: number }).honest_vs_req_x_K, (r['w4.56'] as { honest_vs_req_x_K: number }).honest_vs_req_x_K]) })
  // [M12] 반증 — 폭 비 게이트(HB vs HB → 비 1.0 → false) · 굳힌 == fit 게이트(굳힌 값에 .05를 더한 판 → false)
  const wHB = of(PENCIL_PRESET_OF_GRADE.HB, 'hill_24_raw').width_half
  OUT.falsify_width = { def: 'D-3 — 같은 프리셋(HB·HB)의 폭 비 = 1.0 → 2.0 ± .15 판정이 실제로 false', ratio: +(wHB / wHB).toFixed(3), ok: Math.abs(wHB / wHB - C.PAINT68_WIDTH_RATIO_8B_HB) <= C.PAINT68_WIDTH_RATIO_TOL }
  {
    const f = fit.pencil_8B as { opaque: number; baked: number }
    OUT.falsify_fit_gate = { def: 'D-3 — 굳힌 값에 .05를 더한 판(1차 잔재 fit_vs_baked의 그 차 대역)은 «굳힌 == fit ± .025»가 실제로 false', baked_plus: +(f.baked + 0.05).toFixed(4), fit: f.opaque, ok: Math.abs(f.opaque - (f.baked + 0.05)) <= C.PAINT68_FIT_OPAQUE_TOL }
  }
  // 반증(D-3) · 결정론
  const dup = [PENCIL_PRESET_OF_GRADE.HB, PENCIL_PRESET_OF_GRADE.HB, PENCIL_PRESET_OF_GRADE['2B']].map(p => of(p, 'hill_12_cal').density)
  const dupMono = monotone(dup, C.PAINT68_GRADE_DENSITY_STEP_MIN)
  const d1 = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false)
  const d2 = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false)
  const dOther = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false, undefined, 69)
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(false))
  OUT.verdict = { def: '개정 게이트 — 연필: 농도 단조(이웃 ≥ .03) · 8B .45 ± .03 · 폭 단조(고유) · 8B/HB 폭 비 2.0 ± .15(고유) — hill·line 둘 · 목탄: 농도(이웃 ≥ .04)·폭 단조 · 굳힌 opaque == fit', ...verdict, gates }
  OUT.falsify_dup = { def: 'D-3 — 같은 프리셋(HB)을 두 자리에: 이웃 차 0 < 최소 → 판정 false여야 자가 무언가를 잰다', values: dup, ...dupMono }
  OUT.determinism = { def: '같은 프리셋·같은 시드 두 번 == 같은 지도 해시(63 게이트 ①) · 다른 시드는 다른 해시', same: d1.hash === d2.hash, hashes: [d1.hash, d2.hash], other_seed_differs: d1.hash !== dOther.hash }
  OUT.constants_used = C
  OUT.charcoal_grades_map = Object.fromEntries(CHARCOAL_FAMILY_GRADES.map((k, i) => [k, CHARCOAL_GRADES68[i]]))
  console.log('[68-§2 fit]', JSON.stringify(Object.fromEntries(Object.entries(fit).map(([k, v]) => [k, { o: (v as any).opaque, d: (v as any).reached, t: (v as any).target, s: (v as any).state }]))))
  console.log('[68-§2 gates red]', JSON.stringify(gates.filter(g => !g.ok).map(g => [g.name, g.value])))
  expect(dupMono.ok, '반증 — 같은 프리셋 둘은 단조 판정을 실패시킨다(자가 산다)').toBe(false)
  expect((OUT.falsify_width as { ok: boolean }).ok, '반증 — HB·HB 폭 비 1.0은 2.0 ± .15를 실패시킨다').toBe(false)
  expect((OUT.falsify_fit_gate as { ok: boolean }).ok, '반증 — 굳힌 값 + .05는 «굳힌 == fit»을 실패시킨다').toBe(false)
  expect(d1.hash, '결정론 — 같은 경도 두 번 == 같은 픽셀').toBe(d2.hash)
  expect(d1.hash !== dOther.hash, '다른 시드는 다른 지도').toBe(true)
  for (const g of gates) expect(g.ok, `${g.name} — ${JSON.stringify(g.value)}`).toBe(true)
})
