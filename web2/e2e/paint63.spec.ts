// web2-63 — 비트맵 팁 + 종이 결의 게이트 여섯(지시 63 「게이트」 표).
//
//   ① 마른 매체가 갈린다  연필·목탄·파스텔·마른붓·색연필을 같은 압력으로 그어 자국의 통계(가장자리 거칠기 · 빈 픽셀 몫 ·
//                        알파 분포)가 서로 갈린다 — 열 쌍 전부. 팁 «끔»(62 판)이 D-2의 재현 · 반증 = 같은 프리셋·같은 팁 다섯.
//   ② 도장 반복 없음      판을 돌려 쓴 결과 도장 주기의 자기상관 봉우리가 없다 · 반증 = 판 고정(frame 0)이면 봉우리가 선다.
//   ③ 결이 종이다         굵기 2배에서 타일 상관이 같은 부호·크기(대상 px 고정) · 같은 자리 두 획(다른 시드)의 잔차가 상관한다 ·
//                        반증 = 결 끔.
//   ④ 회전·비율           dab_angle 0/90 · elliptical_dab_ratio 3이 팁 자국의 폭을 바꾼다 · 반증 = 비율 1이면 안 바뀐다.
//                        (기제의 단위 시험은 test/mypaint63.test.ts ② — 합성 막대 판의 2차 모멘트)
//   ⑤ 무회귀              팁 없는 자국 + 61 결 = 62 기준 해시(ref63 원장 · 63 이전 트리에서 뜸)와 «같다» · 새 결에서는 다르다(기록) ·
//                        반증 = 팁 켜면 연필·색연필 슬롯의 해시가 갈린다.
//   ⑥ 62 게이트 전부       paint62.spec 재실행(원장) — 이 파일이 아니라 그 파일의 값.
//   + 탐침                아틀라스 메모리 · 팁 로드 · 굽기 비용(팁 켬/끔).
//
// 자의 자리: diag.markSampleForTest / markMultiForTest — 62의 자 그대로(#107 캡처 통로) · 팁·종이 스위치는 63의 진단.
// 원장: stage0/out/paint63_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { REF63_ROWS, REF63_LEDGER, hashRows } from './ref63.spec'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-63 — 비트맵 팁·종이 결 게이트: ①마른 매체 갈림 ②도장 반복 없음 ③결이 종이 ④회전·비율 ⑤무회귀(62 해시) + 탐침',
  note_pitfalls: '#107(62 캡처 통로 그대로) · #105(팁 로드는 값 — tipsReady를 기다리고 잰다 · 보정 열쇠에 팁) · #103(⑤는 같은 행 정의를 두 트리에서) · #99 · #101 · #12(①은 다섯 × 열 쌍 · ②③은 도구 셋)',
  scene: '호출마다 markSample/markMulti가 새 캔버스를 만든다(문서·뷰 무관)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint63_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  if (process.env.LEDGER !== '1') return
  const f = LEDGER_OF(info.project.name)
  mkdirSync(dirname(f), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, engine: 'mypaint+tips',
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint63.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  // #105 — 팁·종이는 비동기 로드 · 준비를 «값으로» 기다린다(상한 15s — #95)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 15_000 })
  const ready = await page.evaluate(() => (window as any).__b2.diag.tipsReadyForTest())
  expect(ready.error, '팁 로드 오류 없음').toBeNull()
  expect(ready.paper, '종이 결 = 높이맵').toBe('height')
}

/** 마른 매체 다섯(프리셋 + 기본 팁) — ①의 행. 같은 압력(.6 상수) · 같은 굵기 20 · 직선. */
const DRY = [
  { key: 'pencil', preset: 'classic/pencil' },
  { key: 'charcoal', preset: 'classic/charcoal' },
  { key: 'pastel', preset: 'ramon/Pastel_1' },
  { key: 'drybrush', preset: 'classic/dry_brush' },
  { key: 'cp', preset: 'ramon/B-pencil' },
] as const

/** 자국 통계(어둡기 지도 0..255 · 몸통 띠는 열별 위/아래 가장자리의 중앙값 안쪽 3px) */
const STATS_FN = `(function(v, W, H){
  const X0 = 80, X1 = W - 80, TH = 16
  const tops = [], bots = []
  for (let x = X0; x < X1; x++) {
    let t = -1, b = -1
    for (let y = 0; y < H; y++) { const q = v[y * W + x]; if (q > TH) { if (t < 0) t = y; b = y } }
    tops.push(t); bots.push(b)
  }
  const valid = tops.map((t, i) => t >= 0 && bots[i] >= 0)
  const nValid = valid.filter(Boolean).length
  if (nValid < 40) return { ok: false, n: nValid }
  // 가장자리 거칠기 = 위 가장자리 − 9열 이동 평균의 표준편차(위·아래 합침)
  const rough = (arr) => {
    const res = []
    for (let i = 4; i < arr.length - 4; i++) {
      if (!valid[i]) continue
      let s = 0, n = 0
      for (let k = -4; k <= 4; k++) if (valid[i + k]) { s += arr[i + k]; n++ }
      res.push(arr[i] - s / n)
    }
    const m = res.reduce((a, b) => a + b, 0) / res.length
    return Math.sqrt(res.reduce((a, b) => a + (b - m) * (b - m), 0) / res.length)
  }
  const roughness = (rough(tops) + rough(bots)) / 2
  const med = (a) => { const s = a.filter((_, i) => valid[i]).slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] }
  const yT = med(tops) + 3, yB = med(bots) - 3
  let n = 0, empty = 0, sum = 0
  const vals = []
  for (let y = yT; y <= yB; y++) for (let x = X0; x < X1; x++) { const q = v[y * W + x]; n++; if (q < 8) empty++; sum += q; vals.push(q) }
  vals.sort((p, q) => p - q)
  return { ok: true, roughness: +roughness.toFixed(3), empty_share: +(empty / n).toFixed(4), mean: +(sum / n / 255).toFixed(4),
    p95: +(vals[Math.floor(vals.length * 0.95)] / 255).toFixed(4), body_h: yB - yT + 1, n }
})`

type Stat = { ok: boolean; roughness: number; empty_share: number; mean: number; p95: number; body_h: number }
const drawStats = (page: Page, rows: { key: string; preset: string; tip?: string; seed?: number }[]) =>
  page.evaluate(([rs, fn]) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const stats = new Function('return ' + fn)()
    const out: Record<string, Stat> = {}
    for (const r of rs as { key: string; preset: string; tip?: string; seed?: number }[]) {
      b2.diag.markMultiForTest([{ tool: 'brush', shape: 'line', wPx: 20, seed: r.seed ?? 63, preset: r.preset, tip: r.tip, press: 0.6, color: '#2a2a30' }], W, H, false)
      const m = (window as any).__m61 as { v: number[] }
      out[r.key] = stats(m.v, W, H)
    }
    return out
  }, [rows, STATS_FN] as const)

/** 두 통계의 «갈림» — 특징 넷의 상대 차(|a−b| / max(|a|,|b|, floor))를 내림차순으로: rel = **둘째**(특징 둘이 함께 갈려야
 *  갈린 것 — 하나(빈 몫)만으로는 같은 팁·같은 프리셋의 시드 요동도 .4~.7이 나왔다(첫 실행 실측 · D-3)) · by = 그 둘. */
function distinct(a: Stat, b: Stat, floors: Record<string, number>): { rel: number; by: string; top: number } {
  const ds = (['roughness', 'empty_share', 'mean', 'p95'] as const).map(k => ({
    k, d: Math.abs(a[k] - b[k]) / Math.max(Math.abs(a[k]), Math.abs(b[k]), floors[k] ?? 1e-9),
  })).sort((p, q) => q.d - p.d)
  return { rel: +ds[1]!.d.toFixed(3), by: `${ds[0]!.k}+${ds[1]!.k}`, top: +ds[0]!.d.toFixed(3) }
}
const FLOORS = { roughness: 0.5, empty_share: 0.05, mean: 0.03, p95: 0.05 }

test('① 마른 매체 다섯이 갈린다 — 열 쌍 전부 · 팁 끔(62 판) 재현 · 반증(같은 프리셋·같은 팁)', async ({ page }) => {
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const REL = cs.PAINT63_DISTINCT_REL as number
  const on = await drawStats(page, DRY.map(d => ({ key: d.key, preset: d.preset })))
  await page.evaluate(() => (window as any).__b2.diag.setTipsOffForTest(true))
  const off = await drawStats(page, DRY.map(d => ({ key: d.key, preset: d.preset })))
  await page.evaluate(() => (window as any).__b2.diag.setTipsOffForTest(false))
  // 반증: 같은 프리셋(classic/pencil) · 같은 팁(fine-grain) · 시드만 다른 다섯
  const same = await drawStats(page, [1, 2, 3, 4, 5].map(k => ({ key: `s${k}`, preset: 'classic/pencil', tip: 'fine-grain', seed: 100 + k })))
  const pairs = (st: Record<string, Stat>) => {
    const keys = Object.keys(st), out: Record<string, { rel: number; by: string }> = {}
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) out[`${keys[i]}|${keys[j]}`] = distinct(st[keys[i]!]!, st[keys[j]!]!, FLOORS)
    return out
  }
  const pOn = pairs(on), pOff = pairs(off), pSame = pairs(same)
  const count = (p: Record<string, { rel: number }>) => Object.values(p).filter(x => x.rel > REL).length
  OUT.dry = {
    def: `직선 w20 · 압력 .6 상수 · 시드 63 · 몸통 띠(열별 가장자리 중앙값 안쪽 3px)의 통계 넷: roughness = 위/아래 가장자리 − 9열 이동평균의 sd(px) · empty_share = 띠 안 어둡기 < 8 몫 · mean · p95(어둡기/255). 쌍의 갈림 rel = 특징 넷의 상대 차(바닥 ${JSON.stringify(FLOORS)})의 **둘째로 큰 값**(특징 둘이 함께 갈려야 — top은 첫째 · 기록) · 문 > ${REL}. tips_on = 63 · tips_off = 62 판(D-2 재현 — 62의 프리셋 다섯도 이 자로는 이미 갈린다면 그 사실을 그대로 적는다: 지시의 «다 비슷해 보인다»는 사람 눈의 말이고 이 자는 통계다 · 팁이 더한 것은 min_rel의 차) · same = 반증(classic/pencil + fine-grain × 시드 다섯)`,
    threshold: { distinct_rel: REL },
    tips_on: { stats: on, pairs: pOn, distinct_pairs: count(pOn), of: Object.keys(pOn).length, min_rel: Math.min(...Object.values(pOn).map(x => x.rel)) },
    tips_off: { stats: off, pairs: pOff, distinct_pairs: count(pOff), of: Object.keys(pOff).length, min_rel: Math.min(...Object.values(pOff).map(x => x.rel)) },
    falsification_same: { stats: same, pairs: pSame, distinct_pairs: count(pSame), of: Object.keys(pSame).length, max_rel: Math.max(...Object.values(pSame).map(x => x.rel)) },
    tip_defaults: await page.evaluate((rows) => Object.fromEntries((rows as string[]).map(p => [p, (window as any).__b2.diag.tipDefaultOfForTest(p)])), DRY.map(d => d.preset)),
  }
  for (const d of DRY) expect(on[d.key]!.ok, `${d.key} 자국 실재`).toBe(true)
  expect(count(pOn), '팁 켬 — 열 쌍 전부 갈린다').toBe(Object.keys(pOn).length)
  expect(count(pSame), '반증 — 같은 프리셋·같은 팁은 안 갈린다(0)').toBe(0)
})

/** 2차원 이동 자기상관 — 몸통 띠(±8px)의 잔차(21×21 상자 평균을 뺀 어둡기)를 x로 L만큼 밀어 픽셀 상관(lag 1..60) · 봉우리는 lag ≥ 6.
 *  판이 고정이면 도장마다 같은 무늬가 도장 간격마다 되풀이돼 그 lag에서 상관이 선다 · 판을 돌려 쓰면 무늬가 매번 달라 안 선다.
 *  (첫 실측: 열 «평균» 프로파일은 판 무늬를 평균으로 지워 둘 다 봉우리가 없었다 — 자가 아무것도 안 쟀다 · D-3) */
const AC_FN = `(function(v, W, H){
  const X0 = 40, X1 = W - 40, Y0 = Math.round(H/2) - 8, Y1 = Math.round(H/2) + 8, R = 10
  const res = new Float32Array(W * H)
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x < X1; x++) {
    let s = 0, n = 0
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) { s += v[yy * W + xx]; n++ } }
    res[y * W + x] = v[y * W + x] - s / n
  }
  let best = -1, lag = 0
  const ac = []
  for (let L = 1; L <= 60; L++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x + L < X1; x++) {
      const a = res[y * W + x], b = res[y * W + x + L]
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b
    }
    const cov = sab / n - (sa / n) * (sb / n), da = Math.sqrt(Math.max(0, saa / n - (sa / n) ** 2)), db = Math.sqrt(Math.max(0, sbb / n - (sb / n) ** 2))
    const r = da > 1e-9 && db > 1e-9 ? cov / (da * db) : 0
    ac.push(+r.toFixed(3))
    if (L >= 6 && r > best) { best = r; lag = L }
  }
  let mean = 0, nn = 0
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x < X1; x++) { mean += v[y * W + x]; nn++ }
  return { peak: +best.toFixed(3), lag, mean: +(mean / nn).toFixed(2), ac_lag1_60: ac }
})`
const autocorr = (page: Page, preset: string, frameLock: number, spacingK = 1) =>
  page.evaluate(([p, lock, sk, fn]) => {
    const b2 = (window as any).__b2
    const W = 640, H = 120
    b2.diag.setTipFrameLockForTest(lock as number)
    b2.diag.markMultiForTest([{ tool: 'brush', shape: 'line', wPx: 20, seed: 7, preset: p, press: 0.6, color: '#2a2a30',
      over: sk === 1 ? undefined : { dabs_per_basic_radius: 0, dabs_per_second: 0, dabs_per_actual_radius: sk, offset_by_random: 0, radius_by_random: 0 } }], W, H, false)
    b2.diag.setTipFrameLockForTest(-1)
    const m = (window as any).__m61 as { v: number[] }
    const st = b2.diag.tipStatsForTest()
    return { ...(new Function('return ' + fn)())(m.v, W, H), dabs: st.dabs, frames_used: st.frames.filter((n: number) => n > 0).length }
  }, [preset, frameLock, spacingK, AC_FN] as const)

test('② 도장 반복이 안 보인다 — 판 돌려 쓰기 vs 판 고정(반증)', async ({ page }) => {
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const MARGIN = cs.PAINT63_AC_MARGIN as number, MAX = cs.PAINT63_AC_MAX as number
  // 도장 간격을 성기게(반지름당 .8 — 판이 겹쳐 뭉개지면 어느 쪽도 봉우리가 없다 → 자가 아무것도 안 잰다(D-3)): 기본 간격 판도 기록
  const rows: Record<string, unknown> = {}
  for (const [key, preset] of [['charcoal', 'classic/charcoal'], ['pencil', 'classic/pencil'], ['cp', 'ramon/B-pencil']] as const) {
    const rot = await autocorr(page, preset, -1, 0.8), lock = await autocorr(page, preset, 0, 0.8)
    const rotD = await autocorr(page, preset, -1), lockD = await autocorr(page, preset, 0)
    rows[key] = { sparse: { rotate: rot, lock }, default_spacing: { rotate: rotD, lock: lockD } }
  }
  OUT.repeat = {
    def: `직선 w20 · 압력 .6 · 몸통 띠(±8px) 잔차(21×21 상자 평균 뺌)의 2차원 x-이동 자기상관 최대(lag 6..60 — lag ≤ 5는 잔차의 근거리 상관이라 뺀다 · ac_lag1_60이 전 배열). rotate = 판 8을 도장마다 난수로 · lock = 판 0 고정(반증). sparse = 도장 자리를 «주기적으로»(dabs_per_actual_radius .8 · 다른 둘 0 · offset_by_random 0 · radius_by_random 0 — 자리 흔들림이 있으면 판을 고정해도 주기가 없어 자가 아무것도 못 잰다: 첫 두 실행 실측) — 이 판에서만 «판 고정 = 봉우리 · 돌려 쓰기 = 없음»이 갈린다 · default_spacing = 프리셋 그대로. 단언 둘: sparse에서 lock.peak − rotate.peak ≥ ${MARGIN}(판 고정은 도장마다 같은 무늬 → 봉우리 · 돌려 쓰기는 무늬가 갈려 봉우리가 준다 — 주기 자리의 «봉우리 자체»는 도장 «봉투»의 것이라 남는다: 목탄 rotate .47@16 = 판 여덟이 다 가로 띠라 봉투가 되풀이) · default_spacing(제품 간격·자리 흔들림 그대로)에서 rotate.peak ≤ ${MAX}`,
    threshold: { margin: MARGIN, rotate_max: MAX },
    rows,
  }
  for (const key of ['charcoal', 'pencil', 'cp']) {
    const r = (rows[key] as { sparse: { rotate: { peak: number; frames_used: number }; lock: { peak: number; frames_used: number } } }).sparse
    expect(r.rotate.frames_used, `${key} 돌려 쓴 판 수 ≥ 5`).toBeGreaterThanOrEqual(5)
    expect(r.lock.frames_used, `${key} 고정 = 판 하나`).toBe(1)
    expect(r.lock.peak - r.rotate.peak, `${key} 반증 — 판 고정이 봉우리를 세운다`).toBeGreaterThanOrEqual(MARGIN)
    const d = (rows[key] as { default_spacing: { rotate: { peak: number } } }).default_spacing
    expect(d.rotate.peak, `${key} 제품 간격·돌려 쓰기 — 봉우리 없음`).toBeLessThanOrEqual(MAX)
  }
})

/** 결 타일과 자국 어둡기의 픽셀 상관(paint59 ④의 자 — 포화 몸통) + 같은 자리 두 획의 잔차 상관 */
const grainCorr = (page: Page, tool: string, wPx: number, preset?: string, bodyTh = 60) =>
  page.evaluate(([t, w, p, th]) => {
    const b2 = (window as any).__b2
    b2.diag.markMultiForTest([{ tool: t, shape: 'line', wPx: w, seed: 11, preset: p, press: 0.8, color: '#2a2a30' }], 480, 240, false)
    const m = (window as any).__m61 as { v: number[]; w: number; h: number }
    const tile = b2.diag.paintGrainTileForTest() as { v: number[]; n: number; source: string }
    const W = m.w, H = m.h, N = tile.n
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let y = 0; y < H; y++) for (let x = 60; x < W - 60; x++) {
      const v = m.v[y * W + x]!
      if (v < (th as number)) continue
      const g = tile.v[(y % N) * N + (x % N)]!
      n++; sa += v; sb += g; saa += v * v; sbb += g * g; sab += v * g
    }
    if (n < 1500) return { n, corr: null, source: tile.source, tile_n: N }
    const cov = sab / n - (sa / n) * (sb / n), da = Math.sqrt(saa / n - (sa / n) ** 2), db = Math.sqrt(sbb / n - (sb / n) ** 2)
    return { n, corr: da > 1e-9 && db > 1e-9 ? +(cov / (da * db)).toFixed(4) : null, source: tile.source, tile_n: N }
  }, [tool, wPx, preset, bodyTh] as const)
const sameSpot = (page: Page, preset: string, seeds: [number, number]) =>
  page.evaluate(([p, ss]) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const resid = (seed: number): { r: number[]; body: boolean[] } => {
      b2.diag.markMultiForTest([{ tool: 'brush', shape: 'line', wPx: 24, seed, preset: p, press: 0.7, color: '#2a2a30' }], W, H, false)
      const v = ((window as any).__m61 as { v: number[] }).v
      const r: number[] = new Array(W * H).fill(0), body: boolean[] = new Array(W * H).fill(false)
      for (let y = 0; y < H; y++) for (let x = 70; x < W - 70; x++) {
        // 11×11 이동평균을 뺀 잔차(도장·결의 고주파만 남는다)
        let s = 0, n = 0
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) { s += v[yy * W + xx]!; n++ } }
        const mean = s / n
        r[y * W + x] = v[y * W + x]! - mean
        body[y * W + x] = mean > 40
      }
      return { r, body }
    }
    const a = resid(ss[0]), b = resid(ss[1])
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let i = 0; i < W * H; i++) {
      if (!a.body[i] || !b.body[i]) continue
      const p1 = a.r[i]!, p2 = b.r[i]!
      n++; sa += p1; sb += p2; saa += p1 * p1; sbb += p2 * p2; sab += p1 * p2
    }
    if (n < 1500) return { n, corr: null }
    const cov = sab / n - (sa / n) * (sb / n), da = Math.sqrt(saa / n - (sa / n) ** 2), db = Math.sqrt(sbb / n - (sb / n) ** 2)
    return { n, corr: da > 1e-9 && db > 1e-9 ? +(cov / (da * db)).toFixed(4) : null }
  }, [preset, seeds] as const)

test('③ 결이 종이다 — 굵기 2배에서 타일 상관 불변 · 같은 자리 두 획의 잔차 상관 · 반증(결 끔)', async ({ page }) => {
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const TILE_MAX = cs.PAINT63_TILE_CORR_MAX as number, SPOT = cs.PAINT63_SAMESPOT_CORR as number
  const TIP_MAX = cs.PAINT63_TILE_CORR_TIP_MAX as number
  const w26 = await grainCorr(page, 'brush', 26), w52 = await grainCorr(page, 'brush', 52)
  // 팁 매체(몸통 문턱 20 — 옅은 매체): 같은 타일이 팁 자국의 어둡기도 깎는가(«같은 봉우리에 얹힌다»의 값 — 타일이 둘의 공통 원인)
  const tipped: Record<string, unknown> = {}
  for (const [key, preset] of [['charcoal', 'classic/charcoal'], ['pencil', 'classic/pencil'], ['cp', 'ramon/B-pencil']] as const)
    tipped[key] = await grainCorr(page, 'brush', 20, preset, 20)
  const spotCharcoal = await sameSpot(page, 'classic/charcoal', [301, 302])
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  const w26off = await grainCorr(page, 'brush', 26)
  const tippedOff: Record<string, unknown> = {}
  for (const [key, preset] of [['charcoal', 'classic/charcoal'], ['pencil', 'classic/pencil'], ['cp', 'ramon/B-pencil']] as const)
    tippedOff[key] = await grainCorr(page, 'brush', 20, preset, 20)
  const spotOff = await sameSpot(page, 'classic/charcoal', [301, 302])
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  OUT.paper = {
    def: `tile_corr = 몸통 어둡기와 결 타일(높이맵 1024² · 대상 px 접기 · 값 = 이빨 깊이)의 픽셀 상관. 포화 몸통(잉크펜 슬롯 · 어둡기 ≥ 60): 결이 대상 px 고정이면 굵기 26·52에서 같은 부호·같은 크기(문 ≤ ${TILE_MAX}) · 팁 매체(목탄·연필·색연필 w20 · 몸통 ≥ 20): 같은 타일이 팁 자국도 깎는다(문 ≤ ${TIP_MAX} — «같은 자리 = 같은 봉우리»의 값: 타일이 두 획의 공통 원인) · same_spot = 같은 경로·다른 시드 두 획의 11×11 잔차 상관(기록 — 팁 판이 시드로 갈려 도장 잡음이 잔차를 지배하므로 종이 몫이 작다: 첫 실측 목탄 .095) · 반증 = 결 끔(grain_off → 0 대역)`,
    threshold: { tile_corr_max: TILE_MAX, tile_corr_tip_max: TIP_MAX, same_spot_min_record_only: SPOT },
    tile_corr: { w26, w52, ratio: w26.corr && w52.corr ? +(w52.corr / w26.corr).toFixed(3) : null, tipped },
    same_spot_record: { charcoal: spotCharcoal },
    falsification_grain_off: { w26: w26off, tipped: tippedOff, same_spot_charcoal: spotOff },
  }
  expect(w26.source, '결 출처 = 높이맵').toBe('height')
  expect(w26.corr!, '26px — 결과 음의 상관').toBeLessThanOrEqual(TILE_MAX)
  expect(w52.corr!, '52px — 같은 결(굵기 무관)').toBeLessThanOrEqual(TILE_MAX)
  for (const key of ['charcoal', 'pencil', 'cp']) {
    const t = tipped[key] as { corr: number | null; n: number }
    expect(t.corr, `${key} — 팁 자국도 같은 타일에 깎인다`).not.toBeNull()
    expect(t.corr!, `${key} — 팁 자국도 같은 타일에 깎인다`).toBeLessThanOrEqual(TIP_MAX)
    expect(Math.abs((tippedOff[key] as { corr: number | null }).corr ?? 0), `${key} 반증 — 결 끔이면 0 대역`).toBeLessThan(0.1)
  }
  expect(Math.abs(w26off.corr ?? 0), '반증 — 결 끔이면 타일 상관 0 대역').toBeLessThan(0.1)
})

/** 몸통 폭(열별 어둡기 > 16인 픽셀 수의 중앙값) — 각·비율 덮개로 */
const bodyWidth = (page: Page, preset: string, over: Record<string, number>) =>
  page.evaluate(([p, ov]) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    b2.diag.markMultiForTest([{ tool: 'brush', shape: 'line', wPx: 20, seed: 5, preset: p, press: 0.7, color: '#2a2a30', over: ov }], W, H, false)
    const v = ((window as any).__m61 as { v: number[] }).v
    const ws: number[] = []
    for (let x = 80; x < W - 80; x += 2) { let n = 0; for (let y = 0; y < H; y++) if (v[y * W + x]! > 16) n++; if (n > 0) ws.push(n) }
    ws.sort((a, b) => a - b)
    return { width: ws.length ? ws[Math.floor(ws.length / 2)]! : 0, cols: ws.length }
  }, [preset, over] as const)

test('④ 회전·비율 — elliptical_dab_angle 0/90 × elliptical_dab_ratio 3이 팁 자국의 폭을 바꾼다 · 반증(비율 1)', async ({ page }) => {
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const MIN = cs.PAINT63_ASPECT_WIDTH_RATIO_MIN as number
  const rows: Record<string, unknown> = {}
  for (const [key, preset] of [['charcoal', 'classic/charcoal'], ['drybrush', 'classic/dry_brush']] as const) {
    // 도장 방향 추적을 끄고(direction 입력 없음) 각을 고정해야 «각»의 효과가 순수하다: dab_angle 기준값 덮개
    // 설정 이름은 libmypaint의 것: elliptical_dab_ratio · elliptical_dab_angle(첫 실행이 dab_angle을 넣어 무시됐다 — 폭 비 1 · D-3이 잡았다)
    const a0 = await bodyWidth(page, preset, { elliptical_dab_ratio: 3, elliptical_dab_angle: 0 })
    const a90 = await bodyWidth(page, preset, { elliptical_dab_ratio: 3, elliptical_dab_angle: 90 })
    const r1a0 = await bodyWidth(page, preset, { elliptical_dab_ratio: 1, elliptical_dab_angle: 0 })
    const r1a90 = await bodyWidth(page, preset, { elliptical_dab_ratio: 1, elliptical_dab_angle: 90 })
    rows[key] = { ratio3: { angle0: a0, angle90: a90, width_ratio: +(Math.max(a0.width, a90.width) / Math.max(1, Math.min(a0.width, a90.width))).toFixed(3) },
      ratio1: { angle0: r1a0, angle90: r1a90, width_ratio: +(Math.max(r1a0.width, r1a90.width) / Math.max(1, Math.min(r1a0.width, r1a90.width))).toFixed(3) } }
  }
  OUT.rotation = {
    def: `직선 w20 몸통 폭(열별 어둡기 > 16 픽셀 수 중앙값). 비율 3에서 각 0과 90의 폭 비 ≥ ${MIN}(타원의 긴 축이 경로에 가로/세로) · 반증 = 비율 1이면 폭 비 < ${MIN}(각이 뜻이 없다). 기제(합성 막대 판의 2차 모멘트)는 단위 시험 mypaint63 ②`,
    threshold: { width_ratio_min: MIN },
    rows,
  }
  for (const key of ['charcoal', 'drybrush']) {
    const r = rows[key] as { ratio3: { width_ratio: number }; ratio1: { width_ratio: number } }
    expect(r.ratio3.width_ratio, `${key} 비율 3 — 각이 폭을 바꾼다`).toBeGreaterThanOrEqual(MIN)
    expect(r.ratio1.width_ratio, `${key} 반증 — 비율 1이면 각이 뜻이 없다`).toBeLessThan(MIN)
  }
})

test('⑤ 무회귀 — 팁 없는 자국 + 61 결 = 62 기준 해시(ref63 원장) · 새 결에서는 다르다(기록) · 반증(팁 켬)', async ({ page }) => {
  await boot(page)
  const ref = JSON.parse(readFileSync(REF63_LEDGER, 'utf8')) as { rows: Record<string, { hash: number; ink: number }>; tree_note: string }
  await page.evaluate(() => (window as any).__b2.diag.setPaper61ForTest(true))
  const paper61 = await page.evaluate(() => (window as any).__b2.diag.tipsReadyForTest().paper)
  const noTip61 = await hashRows(page, REF63_ROWS, { tip: 'none' })
  const tip61 = await hashRows(page, REF63_ROWS)                       // 반증 — 슬롯 기본 팁(연필·색연필)이 켜진다
  await page.evaluate(() => (window as any).__b2.diag.setPaper61ForTest(false))
  const noTipHeight = await hashRows(page, REF63_ROWS, { tip: 'none' })
  const rows: Record<string, unknown> = {}
  for (const r of REF63_ROWS) {
    rows[r.key] = { ref: ref.rows[r.key], no_tip_paper61: noTip61[r.key], same_as_ref: noTip61[r.key]!.hash === ref.rows[r.key]!.hash,
      tip_default_paper61: tip61[r.key], differs_with_tip: tip61[r.key]!.hash !== ref.rows[r.key]!.hash,
      no_tip_height_paper: noTipHeight[r.key], differs_with_height_paper: noTipHeight[r.key]!.hash !== ref.rows[r.key]!.hash }
  }
  OUT.noregress = {
    def: 'ref63 원장(63 이전 트리 · 62 엔진)의 어둡기 지도 해시(FNV-1a 32) + 자국 픽셀 수와 같은 행을 이 트리에서 다시 그린 값. no_tip_paper61(팁 없음 + 61 값 잡음 결) = 62 경로 그대로 → 해시 «같음» 단언(행 여덟 전부). tip_default_paper61 = 슬롯 기본 팁 → 연필·색연필 슬롯만 갈린다(반증 · 팁 안 받는 여섯은 같다). no_tip_height_paper = 새 종이 결 → 결을 쓰는 행은 갈린다(기록 — 마커는 결 0이라 같다)',
    ref_tree: ref.tree_note,
    paper_switch_seen: paper61,
    rows,
    same_count: Object.values(rows).filter(r => (r as { same_as_ref: boolean }).same_as_ref).length,
    of: REF63_ROWS.length,
  }
  expect(paper61, '61 결 스위치가 실제로 결 출처를 바꾼다').toBe('value61')
  for (const r of REF63_ROWS) {
    expect(noTip61[r.key]!.hash, `${r.key} — 팁 없음 + 61 결 = 62 해시`).toBe(ref.rows[r.key]!.hash)
    expect(noTip61[r.key]!.ink, `${r.key} — 자국 픽셀 수도 같다`).toBe(ref.rows[r.key]!.ink)
  }
  // 반증: 팁을 받는 슬롯 둘은 갈리고, 안 받는 여섯은 같다
  for (const r of REF63_ROWS) {
    const receives = r.key === 'pencil_slot_wave' || r.key === 'cp_slot_wave'
    expect(tip61[r.key]!.hash !== ref.rows[r.key]!.hash, `${r.key} — 팁 ${receives ? '켬이면 갈린다' : '안 받으면 같다'}`).toBe(receives)
  }
})

test('탐침 — 팁 로드·아틀라스 메모리·기본 팁·굽기 비용(팁 켬/끔)', async ({ page }) => {
  await boot(page)
  const probe = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const ready = b2.diag.tipsReadyForTest()
    const defaults = b2.diag.tipStatsForTest().defaults
    const pOn = b2.diag.mypaintProbeForTest() as Record<string, unknown>
    b2.diag.setTipsOffForTest(true)
    const pOff = b2.diag.mypaintProbeForTest() as Record<string, unknown>
    b2.diag.setTipsOffForTest(false)
    const pick = (p: Record<string, unknown>) => ({ bake_20faces_40strokes_total_ms: p.bake_20faces_40strokes_total_ms, bake_perstroke_2x40_ms: p.bake_perstroke_2x40_ms, bake_stress_20faces_x40strokes_ms: p.bake_stress_20faces_x40strokes_ms, markPx: p.markPx, deterministic: p.deterministic, seed_differs: p.seed_differs })
    return { ready, defaults, tips_on: pick(pOn), tips_off: pick(pOff), calib_keys: Object.keys(pOn.calib as object).filter(k => k.includes('|')) }
  })
  OUT.probe = {
    ...probe,
    atlas_bytes_float32: 5 * 8 * 192 * 192 * 4 + 1024 * 1024 * 4,
    atlas_def: '팁 5 × 판 8 × 192² Float32 + 종이 1024² Float32 = 상주 메모리(값) · PNG 전송량은 tips.gen.ts png_bytes 합',
  }
  expect(probe.ready.ready).toBe(true)
  expect(probe.defaults.pencil).toBe('fine-grain')
  expect(probe.defaults.cp).toBe('scratches2')
  expect(probe.defaults.marker).toBeNull()
  expect(probe.defaults.brush).toBeNull()
  expect(probe.tips_on.deterministic).toBe(true)
  expect(probe.calib_keys.length, '팁이 든 보정 열쇠가 선다(#105)').toBeGreaterThan(0)
})
