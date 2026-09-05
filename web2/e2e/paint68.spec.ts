// web2-68 §2 — 경도 축의 자(연필 여섯 · 목탄 셋). 값을 짓지 않는다(A-3): 196의 연필·목탄 후보
// **전부**를 같은 조건으로 한 획씩 긋고 둘을 잰다 — 평균 농도(1 − 평균 밝기 · 획 마스크 안) ·
// 반최대 폭(px). 표가 배치를 정한다(D-1 — 지시의 출발 배치는 후보이지 결론이 아니다).
//
//   같은 조건   markSampleForTest(오프스크린 흰 판 480×240 · 제품과 같은 함수 drawMark · 슬롯 pencil) ·
//               도형 hill(직선 위 압력 0.3→0.7→0.3 — 지시 문면) + line(상수 0.5 — 63·64의 자 · 대조) ·
//               크기 12 · 24px · 색 #000000 · 시드 68 · 종이 결·팁은 그 슬롯의 제품 기본
//   자 둘       농도 = 반최대 띠(행 프로필 ≥ 최대/2) 안 픽셀의 (255 − 밝기)/255 평균 · 폭 = 그 띠의 행 수
//   보정 켬/끔   ⚠ 제품은 58의 «크기 정직성»(radiusFor 보정 — 요청 폭 == 반최대 폭)이 있어 같은 크기
//               설정에서 폭이 프리셋과 무관하게 같다(D-4 — 지시 「폭이 넓어져야 한다」의 전제와 부딪힌다).
//               그래서 «폭 단조»는 보정 끔(프리셋 고유 기하)에서 재고, 보정 켬(제품)에서는 «폭 같음»
//               (정직성 무회귀 · 요청 폭 ± PAINT68_WIDTH_HONEST_TOL)을 잰다. 농도 단조는 둘 다.
//   판정        HB→8B 농도 단조 비증가 아님(이웃 차 ≥ PAINT68_GRADE_DENSITY_STEP_MIN) · 보정 끔 폭 단조 비감소
//               (이웃 차 ≥ PAINT68_GRADE_WIDTH_STEP_MIN) · 목탄 셋 같은 자 · 반증(D-3): 같은 프리셋을 두 자리에
//               두면 이웃 차 0으로 판정이 «실제로» 실패한다 · 결정론: 같은 프리셋 두 번 == 같은 지도
//
// 원장: stage0/out/paint68_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99). 픽셀 API 없음(__m61 지도만 — dpr2 목록 밖 · paint63 선례).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PENCIL_GRADES68, CHARCOAL_GRADES68, PENCIL_PRESET_OF_GRADE, CHARCOAL_PRESET_OF_GRADE } from '../src/core/grades68'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-68 §2 — 경도 축: 후보 전수의 농도·반최대 폭 표 · 여섯+셋의 단조 · 반증 · 결정론',
  note_pitfalls: '#108(보간 키는 SETTINGS 존재 검증 · 단언 판과 반증 판이 같은 값이면 자를 의심 — 반증이 실제로 다른 값을 낸다) · #12(동작점 둘: 12·24px × 도형 둘) · #16(분모는 반최대 띠 안 픽셀 수 — 표에 든다) · #42',
  pitfall_citations: [12, 16, 42, 108],
  selfcheck_notes: {
    identical_pairs: '결정론 판(같은 프리셋 두 번)의 «같음»은 63 게이트 ①의 규약 그대로(시드 고정 · Math.random 없음) — 반증(같은 프리셋을 두 자리)이 «다른 값»(false)을 낸다',
    zero_counters: 'tanda/charcoal-blur1 행의 n_px·ink_px·density 0은 «축 밖(번짐 — smudge 1 · 안료 없음)»의 기록값이다(후보에서 뺐다 — 지시 §2 방법 4) · 보정 «켬»의 폭 이웃 차 ≈ 0은 58 크기 정직성의 뜻 그 자체다(요청 폭 == 반최대 폭 — 프리셋과 무관) — 폭 단조는 보정 «끔» 열이 잰다',
  },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint68_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint68.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

/** 196의 연필·목탄 후보 전수(presets.gen 실측 — 지시 §2 목록) + 앱의 보간 둘. blur1은 «번짐»이라 축 밖(기록만). */
const PENCIL_CANDIDATES = [
  'classic/pencil', 'deevad/4H_pencil', 'deevad/2B_pencil', 'ramon/B-pencil', 'ramon/2B_pencil',
  'tanda/pencil-2b', 'tanda/pencil-8b', 'Dieterle/8B_Pencil#1', 'Dieterle/Pencil-_Left_Handed', 'experimental/subtle_pencil',
  'brunelleschi/pencil_4B', 'brunelleschi/pencil_6B',
] as const
const CHARCOAL_CANDIDATES = ['classic/charcoal', 'tanda/charcoal-01', 'tanda/charcoal-03', 'tanda/charcoal-04', 'tanda/charcoal-blur1'] as const

interface Meas { density: number; width_half: number; peak: number; n_px: number; ink_px: number; hash: number }
/** 자 — __m61 지도(0..255 어둡기)에서 반최대 띠의 농도와 폭. 가운데 40% 열(끝머리 압력 0.3 대역과 캡을 뺀다). */
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

async function measure(page: Page, preset: string, shape: 'hill' | 'line', wPx: number, calibOff: boolean, seed = 68): Promise<Meas> {
  return page.evaluate(([preset, shape, wPx, calibOff, seed, fn]) => {
    const b2 = (window as any).__b2
    b2.diag.setCalibOffForTest(calibOff)
    b2.diag.markSampleForTest('pencil', shape, wPx, seed, 480, 240, { preset, color: '#000000' })
    const m = (window as any).__m61
    return new Function('return ' + fn)()(m)
  }, [preset, shape, wPx, calibOff, seed, MEAS_FN] as const) as Promise<Meas>
}

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
}

/** 단조 판정 — 차례대로 이웃 차가 전부 ≥ min(비감소 · 이웃 차 값). 반증은 같은 프리셋 둘(차 0)이 false를 내는 것. */
const monotone = (vals: number[], min: number): { ok: boolean; steps: number[] } => {
  const steps = vals.slice(1).map((v, i) => +(v - vals[i]!).toFixed(4))
  return { ok: steps.every(d => d >= min), steps }
}

test('§2 후보 표 · 여섯+셋 단조 · 반증 · 결정론 (원장 paint68)', async ({ page }) => {
  test.setTimeout(600_000)
  await boot(page)
  const C = await page.evaluate(() => {
    const c = (window as any).__b2.diag.constantsForTest?.() ?? {}
    return { PAINT68_GRADE_DENSITY_STEP_MIN: c.PAINT68_GRADE_DENSITY_STEP_MIN, PAINT68_GRADE_WIDTH_STEP_MIN: c.PAINT68_GRADE_WIDTH_STEP_MIN, PAINT68_WIDTH_HONEST_TOL: c.PAINT68_WIDTH_HONEST_TOL }
  })
  expect(C.PAINT68_GRADE_DENSITY_STEP_MIN, '상수가 앱에서 온다(#88)').toBeGreaterThan(0)
  const rows: Record<string, unknown>[] = []
  const table = async (preset: string, kind: string) => {
    const r: Record<string, unknown> = { preset, kind }
    for (const shape of ['hill', 'line'] as const) for (const w of [12, 24]) for (const off of [false, true]) {
      r[`${shape}_${w}_${off ? 'raw' : 'cal'}`] = await measure(page, preset, shape, w, off)
    }
    rows.push(r)
    return r
  }
  for (const p of PENCIL_CANDIDATES) await table(p, 'pencil')
  for (const p of CHARCOAL_CANDIDATES) await table(p, p === 'tanda/charcoal-blur1' ? 'charcoal(축 밖 — 번짐)' : 'charcoal')
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(false))
  OUT.candidates = {
    def: '후보 전수 × 도형 둘(hill 0.3→0.7→0.3 · line 0.5) × 크기 둘(12 · 24px) × 보정(cal 켬 = 제품 · raw 끔 = 프리셋 고유). density = 반최대 띠 안 (255−밝기)/255 평균 · width_half = 띠 행 수(px) · peak = 행 프로필 최대/255 · n_px = 분모(#16) · ink_px = 지도에서 > 8인 픽셀',
    rows,
  }
  const of = (preset: string, key: string): Meas => rows.find(r => r.preset === preset)![key] as Meas

  // ── 여섯의 단조(지시 §2 방법 3): 농도 — 제품(cal)·고유(raw) 둘 다 · 폭 — raw(고유 기하) · cal은 «같음»(정직성)
  const verdict: Record<string, unknown> = {}
  const gates: { name: string; ok: boolean }[] = []
  for (const [axisName, grades, presetOf] of [
    ['pencil', PENCIL_GRADES68 as readonly string[], PENCIL_PRESET_OF_GRADE as Record<string, string>],
    ['charcoal', CHARCOAL_GRADES68 as readonly string[], CHARCOAL_PRESET_OF_GRADE as Record<string, string>],
  ] as const) {
    const presets = grades.map(g => presetOf[g]!)
    const v: Record<string, unknown> = { grades, presets }
    for (const key of ['hill_12', 'hill_24', 'line_12', 'line_24']) {
      const dCal = presets.map(p => of(p, `${key}_cal`).density)
      const dRaw = presets.map(p => of(p, `${key}_raw`).density)
      const wRaw = presets.map(p => of(p, `${key}_raw`).width_half)
      const wCal = presets.map(p => of(p, `${key}_cal`).width_half)
      const mdCal = monotone(dCal, C.PAINT68_GRADE_DENSITY_STEP_MIN)
      const mdRaw = monotone(dRaw, C.PAINT68_GRADE_DENSITY_STEP_MIN)
      const mwRaw = monotone(wRaw, C.PAINT68_GRADE_WIDTH_STEP_MIN)
      const req = Number(key.split('_')[1])
      const honest = wCal.map(w => +(w / req).toFixed(3))
      const honestOk = honest.every(r => Math.abs(r - 1) <= C.PAINT68_WIDTH_HONEST_TOL)
      v[key] = { density_cal: dCal, density_raw: dRaw, width_raw: wRaw, width_cal: wCal,
        mono_density_cal: mdCal, mono_density_raw: mdRaw, mono_width_raw: mwRaw, width_honest_ratio: honest, width_honest_ok: honestOk }
      gates.push({ name: `${axisName} ${key} 농도 단조(제품)`, ok: mdCal.ok })
      gates.push({ name: `${axisName} ${key} 폭 단조(고유)`, ok: mwRaw.ok })
      gates.push({ name: `${axisName} ${key} 폭 정직성(제품)`, ok: honestOk })
    }
    verdict[axisName] = v
  }
  // 반증(D-3) — 같은 프리셋을 두 자리에 두면(HB·HB) 이웃 차 0 → 단조가 «실제로» 실패한다
  const dup = [PENCIL_PRESET_OF_GRADE.HB, PENCIL_PRESET_OF_GRADE.HB, PENCIL_PRESET_OF_GRADE['2B']].map(p => of(p, 'hill_12_cal').density)
  const dupMono = monotone(dup, C.PAINT68_GRADE_DENSITY_STEP_MIN)
  // 결정론 — 같은 프리셋 두 번은 같은 지도(해시)
  const d1 = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false)
  const d2 = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false)
  const dOther = await measure(page, PENCIL_PRESET_OF_GRADE['8B'], 'hill', 12, false, 69)
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(false))
  OUT.verdict = { def: '경도 축의 단조 — 이웃 차 ≥ 상수(농도 PAINT68_GRADE_DENSITY_STEP_MIN · 폭 PAINT68_GRADE_WIDTH_STEP_MIN) · 폭 정직성(제품) = 요청 폭 대비 ±PAINT68_WIDTH_HONEST_TOL', ...verdict, gates }
  OUT.falsify_dup = { def: 'D-3 — 같은 프리셋(HB)을 두 자리에: 이웃 차 0 < 최소 → 판정 false여야 자가 무언가를 잰다', values: dup, ...dupMono }
  OUT.determinism = { def: '같은 프리셋·같은 시드 두 번 == 같은 지도 해시(63 게이트 ① 규약) · 다른 시드는 다른 해시(자가 산다)', same: d1.hash === d2.hash, hashes: [d1.hash, d2.hash], other_seed_differs: d1.hash !== dOther.hash }
  OUT.constants_used = C
  console.log('[68-§2 gates]', JSON.stringify(gates.filter(g => !g.ok).map(g => g.name)))
  expect(dupMono.ok, '반증 — 같은 프리셋 둘은 단조 판정을 실패시킨다(자가 산다)').toBe(false)
  expect(d1.hash, '결정론 — 같은 경도 두 번 == 같은 픽셀').toBe(d2.hash)
  expect(d1.hash !== dOther.hash, '다른 시드는 다른 지도(해시 자가 산다)').toBe(true)
  for (const g of gates) expect(g.ok, g.name).toBe(true)
})
