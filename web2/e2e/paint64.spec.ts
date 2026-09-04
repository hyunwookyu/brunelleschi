// web2-64 — 칠의 화면 게이트(지시 64 「게이트」 표의 값 몫).
//
//   ① 옛 획이 안 바뀐다   브러시 A로 긋고 «지금 브러시»를 B로 바꿔도(고르개·즐겨찾기) 굽힌 텍스처의 픽셀이 같다.
//                         D-2: 수리 전 트리에서 이 팔이 빨갛다(옛 결함 — 획이 슬롯만 들고 슬롯의 브러시가 갈린다).
//                         반증(D-3): 브러시 id 저장을 끄면(setBrushIdOffForTest) 옛 결함이 돌아온다 — 해시가 바뀐다.
//   ⑧ 저장 왕복            브러시 id·불투명이 파일에 들고(직렬화) 되읽힌다 · 옛 문서(id 없음)는 슬롯 기본으로 이주 + 알림 한 줄.
//
// 자의 자리: diag.paintTexHash — 굽힌 텍스처 캔버스(확정본 · #107 되돌림과 무관)의 해시·잉크 픽셀 수.
// 원장: stage0/out/paint64_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-64 — 칠의 화면 게이트: ①옛 획 불변(브러시 id) ⑧저장 왕복·이주',
  note_pitfalls: '#108(단언=반증 «같은 값»이면 자부터 — 반증 스위치가 해시를 실제로 바꾸는 것을 먼저 본다) · #107(확정본 캔버스) · #103(같은 장면을 두 번 읽는다 — ink 수가 장면 확인) · #99 · #101 · #12(슬롯 넷 × 브러시 쌍)',
  scene: 'paint50의 bigBox(오른쪽 벽 · 축척 2500) — 벽 한 면에 획 하나씩',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint64_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  if (process.env.LEDGER !== '1') return
  const f = LEDGER_OF(info.project.name)
  mkdirSync(dirname(f), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint64.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** paint50의 그 상자 — 오른쪽 벽(500,700)(900,610)(900,330)(500,330) · 축척 2500mm. */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 15_000 })
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

type TexHash = { key: string; level: number; hash: number; ink: number }
const texHash = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as TexHash[])
/** 굽기가 «실제로 다시 돌았다»를 값으로 — 재굽기 뒤 프레임을 기다린다 */
const rebakeAndWait = async (page: Page) => {
  await page.evaluate(() => (window as any).__b2.diag.rebakePaintTex())
  await page.waitForTimeout(250)
}

test('① D-2 재현·수리 · D-3 반증 — 브러시를 바꿔도 옛 획의 픽셀이 같다(슬롯 넷)', async ({ page }) => {
  test.setTimeout(180_000)
  await bigBox(page)
  const rows: Record<string, unknown> = {}
  // 슬롯 넷 × (A → B) — A로 긋고 «지금 브러시»를 B로 바꾼 뒤 재굽기
  const PAIRS: { i: string; a: string; b: string }[] = [
    { i: 'marker', a: 'ramon/100%_Opaque', b: 'tanda/marker-01' },
    { i: 'pencil', a: 'classic/pencil', b: 'deevad/2B_pencil' },
    { i: 'cp', a: 'ramon/B-pencil', b: 'classic/charcoal' },
    { i: 'brush', a: 'deevad/liner', b: 'classic/pen' },
  ]
  let y = 380
  for (const pr of PAIRS) {
    // 지금 브러시 = A(제품 경로 — 패널이 하는 그것 · 수리 전 트리에서는 슬롯 조정만)
    await page.evaluate(([i, a]) => (window as any).__b2.diag.pickBrushForTest(i, a), [pr.i, pr.a] as const)
    await page.click('#btn-paint')
    await page.waitForTimeout(80)
    await drawLine(page, 530, y, 860, y - 20)
    await page.waitForTimeout(250)
    const h0 = await texHash(page)
    expect(h0.length, `${pr.i} — 굽힌 텍스처가 있다`).toBeGreaterThan(0)
    const ink0 = h0.reduce((s, r) => s + r.ink, 0)
    expect(ink0, `${pr.i} — 잉크 픽셀이 실재한다(#103 장면 확인)`).toBeGreaterThan(200)
    // 지금 브러시를 B로 — 옛 획은 A로 그은 것이다
    await page.evaluate(([i, b]) => (window as any).__b2.diag.pickBrushForTest(i, b), [pr.i, pr.b] as const)
    await rebakeAndWait(page)
    const h1 = await texHash(page)
    const same = h0.length === h1.length && h0.every((r, k) => r.hash === h1[k]!.hash && r.ink === h1[k]!.ink)
    // 반증(D-3 · #108 — 단언과 «같은 값»이 아니어야 한다): id 저장을 끄면 굽기가 슬롯의 «지금» 브러시(B)를 읽어 픽셀이 바뀐다
    await page.evaluate(() => (window as any).__b2.diag.setBrushIdOffForTest(true))
    await rebakeAndWait(page)
    const hOff = await texHash(page)
    const offSame = h0.length === hOff.length && h0.every((r, k) => r.hash === hOff[k]!.hash)
    await page.evaluate(() => (window as any).__b2.diag.setBrushIdOffForTest(false))
    await rebakeAndWait(page)
    const hBack = await texHash(page)
    const backSame = h0.length === hBack.length && h0.every((r, k) => r.hash === hBack[k]!.hash)
    rows[pr.i] = { a: pr.a, b: pr.b, ink_a: ink0, same_after_b: same, falsification_idoff_same: offSame, back_same: backSame,
      hashes: { a: h0.map(r => r.hash), b: h1.map(r => r.hash), off: hOff.map(r => r.hash) } }
    expect(same, `${pr.i} — 브러시를 B로 바꿔도 옛 획(A)의 픽셀이 같다`).toBe(true)
    expect(offSame, `${pr.i} — 반증: id 저장을 끄면 옛 결함(픽셀이 바뀐다)이 돌아온다`).toBe(false)
    expect(backSame, `${pr.i} — 반증을 끄면 원래 픽셀로 돌아온다`).toBe(true)
    y += 50
  }
  OUT.old_strokes = {
    def: '슬롯 넷 × 브러시 쌍(A → B): A로 벽에 획 하나 → paintTexHash(굽힌 캔버스 해시·잉크 수) → 지금 브러시를 B로(pickBrushForTest = 패널의 그 배선) → 재굽기 → 해시 같음. 반증 = setBrushIdOffForTest(굽기가 획의 br을 무시하고 슬롯의 지금 브러시를 읽는다 — 옛 결함의 재현) → 해시 다름 · 되돌리면 같음',
    rows,
  }
})

test('⑧ 저장 왕복 — br·o가 파일에 들고 되읽힌다 · 옛 문서(br 없음)는 슬롯 기본으로 이주 + 알림', async ({ page }) => {
  await bigBox(page)
  await page.evaluate(() => (window as any).__b2.diag.pickBrushForTest('marker', 'tanda/marker-01'))
  await page.evaluate(() => { (window as any).__b2.app.paintSel.o = 0.6 })
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  await drawLine(page, 530, 400, 860, 380)
  await page.waitForTimeout(200)
  const ser = await page.evaluate(() => (window as any).__b2.diag.serialize() as string)
  const paints = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint).map((s: any) => ({ br: s.paint.br, o: s.paint.o, i: s.paint.i })))
  expect(paints.length, '칠 획이 섰다').toBeGreaterThan(0)
  expect(paints.every((p: any) => p.br === 'tanda/marker-01'), '획이 브러시 id를 든다').toBe(true)
  expect(paints.every((p: any) => p.o === 0.6), '획이 불투명을 든다').toBe(true)
  expect(ser.includes('"br":"tanda/marker-01"'), '직렬화에 br이 든다').toBe(true)
  expect(ser.includes('"o":0.6'), '직렬화에 o가 든다').toBe(true)
  // 되읽기 — 같은 값
  const back = await page.evaluate((t) => {
    const r = (window as any).__b2.diag.readBrnlForTest(t)
    return { ok: !!r.data, migrated: r.report.migratedBrush, notice: r.notice,
      brs: r.data ? r.data.doc.strokes.filter((s: any) => s.paint).map((s: any) => [s.paint.br, s.paint.o]) : [] }
  }, ser)
  expect(back.ok).toBe(true)
  expect(back.migrated, '새 파일은 이주 0').toBe(0)
  expect(back.brs.every((p: [string, number]) => p[0] === 'tanda/marker-01' && p[1] === 0.6), '되읽은 획이 같은 br·o').toBe(true)
  // 옛 문서 — br을 지운 파일: 슬롯의 «지금 기본 브러시»로 이주하고 알림 한 줄
  const old = ser.replace(/"br":"[^"]+",?/g, '').replace(/,"o":0\.6/g, '')
  const mig = await page.evaluate((t) => {
    const r = (window as any).__b2.diag.readBrnlForTest(t)
    return { ok: !!r.data, migrated: r.report.migratedBrush, notice: r.notice,
      brs: r.data ? r.data.doc.strokes.filter((s: any) => s.paint).map((s: any) => s.paint.br) : [] }
  }, old)
  expect(mig.ok).toBe(true)
  expect(mig.migrated, '옛 획 전부가 이주됐다').toBe(paints.length)
  expect(mig.brs.every((b: string) => b === 'tanda/marker-01'), '이주 = 그 슬롯(마커)의 «지금» 브러시').toBe(true)
  expect(String(mig.notice), '조용히 하지 않는다 — 알림 한 줄').toContain('브러시')
  OUT.roundtrip = { def: '획 → 직렬화(br·o 포함) → 되읽기 같음 · br을 지운 옛 파일 → migratedBrush = 칠 획 수 · 이주 값 = 슬롯의 지금 브러시 · reportNotice에 «브러시»', paints: paints.length, migrated: mig.migrated, notice: mig.notice }
})

// ── ③④⑤ + 64-5 — 자국의 값(견본 판 · 문서 무관) ────────────────────────────────────────────────
import { STATS_FN, distinct, FLOORS, type Stat } from './drystats'

async function bootBlank(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 15_000 })
}
/** 직선 w · 압력 상수 · 시드 — 팁 이름은 'none' | 이름 | undefined(프리셋 기본) */
const drawStats = (page: Page, rows: { key: string; preset: string; tip?: string; seed?: number; w?: number; press?: number; tool?: string }[]) =>
  page.evaluate(([rs, fn]) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const stats = new Function('return ' + fn)()
    const out: Record<string, Stat> = {}
    for (const r of rs as { key: string; preset: string; tip?: string; seed?: number; w?: number; press?: number; tool?: string }[]) {
      b2.diag.markMultiForTest([{ tool: r.tool ?? 'brush', shape: 'line', wPx: r.w ?? 20, seed: r.seed ?? 63, preset: r.preset, tip: r.tip, press: r.press ?? 0.6, color: '#2a2a30' }], W, H, false)
      const m = (window as any).__m61 as { v: number[] }
      out[r.key] = stats(m.v, W, H)
    }
    return out
  }, [rows, STATS_FN] as const)

test('③ 색연필이 갈린다 — cp(brunelleschi/colored_pencil) vs 연필(classic/pencil) · 빈 몫·거칠기 · 반증 = 같은 프리셋', async ({ page }) => {
  await bootBlank(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const REL = cs.PAINT63_DISTINCT_REL as number
  const SEEDS = [63, 64, 65]
  const rows: Record<string, unknown> = {}
  let minRel = Infinity, minRelOld = Infinity, maxSame = 0
  for (const seed of SEEDS) {
    // 슬롯대로 긋는다(제품 조건 — cp 슬롯은 문턱 판(64-2)이 도는 자리 · 연필 슬롯은 결 깊이 .42)
    const st = await drawStats(page, [
      { key: 'cp', preset: 'brunelleschi/colored_pencil', seed, tool: 'cp' },
      { key: 'pencil', preset: 'classic/pencil', seed, tool: 'pencil' },
      { key: 'cp_old', preset: 'ramon/B-pencil', seed, tool: 'cp' },
      { key: 'pencil2', preset: 'classic/pencil', seed: seed + 100, tool: 'pencil' },
    ])
    const d = distinct(st.cp!, st.pencil!, FLOORS)
    const dOld = distinct(st.cp_old!, st.pencil!, FLOORS)
    const dSame = distinct(st.pencil!, st.pencil2!, FLOORS)
    minRel = Math.min(minRel, d.rel); minRelOld = Math.min(minRelOld, dOld.rel); maxSame = Math.max(maxSame, dSame.rel)
    rows[String(seed)] = { stats: st, cp_vs_pencil: d, cp_old_vs_pencil: dOld, same_pencil: dSame }
    expect(st.cp!.ok && st.pencil!.ok, '자국 실재').toBe(true)
  }
  // 64-2의 뜻: 색연필은 «구멍»(빈 몫)이 흑연보다 크고 «한 번 지나가면 옅다»(평균) — 값으로
  const st63 = (rows['63'] as { stats: Record<string, Stat> }).stats
  OUT.cp = {
    def: '직선 w20 · 압력 .6 · 시드 셋 — cp(앱 프리셋 brunelleschi/colored_pencil + scratches2 팁 + 결 1.6 + 버니싱) vs classic/pencil(fine-grain 팁)의 갈림 rel(63 ①의 자 · 둘째 특징 · 문 C.PAINT63_DISTINCT_REL) · cp_old = ramon/B-pencil(63까지의 cp 슬롯 — 지시 「그것은 연필이다」) · 반증 = classic/pencil 시드 둘(같은 프리셋 → 문 아래)',
    threshold: REL, min_rel: minRel, min_rel_old_cp: minRelOld, falsification_same_max_rel: maxSame,
    empty_share: { cp: st63.cp!.empty_share, pencil: st63.pencil!.empty_share, cp_old: st63.cp_old!.empty_share },
    roughness: { cp: st63.cp!.roughness, pencil: st63.pencil!.roughness, cp_old: st63.cp_old!.roughness },
    mean: { cp: st63.cp!.mean, pencil: st63.pencil!.mean, cp_old: st63.cp_old!.mean },
    rows,
  }
  expect(minRel, 'cp가 pencil과 갈린다(시드 셋 전부 문 위)').toBeGreaterThan(REL)
  expect(st63.cp!.empty_share, '색연필의 빈 몫(구멍)이 흑연보다 크다').toBeGreaterThan(st63.pencil!.empty_share)
  expect(maxSame, '반증 — 같은 프리셋(시드만)은 문 아래').toBeLessThanOrEqual(REL)
})

test('⑤ 농도 일치 — 팁 있음/없음이 같은 설정에서 같은 농도(±5%) · 마른 매체 × 굵기 셋 · 반증 = 보정 끔', async ({ page }) => {
  test.setTimeout(240_000)
  await bootBlank(page)
  const cs5 = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const TOL = cs5.PAINT64_DENSITY_TOL as number
  const DRY = [
    { key: 'pencil', preset: 'classic/pencil' }, { key: 'charcoal', preset: 'classic/charcoal' }, { key: 'pastel', preset: 'ramon/Pastel_1' },
    { key: 'drybrush', preset: 'classic/dry_brush' }, { key: 'cp_old', preset: 'ramon/B-pencil' }, { key: 'cp', preset: 'brunelleschi/colored_pencil' },
  ]
  const WS = [10, 20, 40]
  const measure = async (): Promise<Record<string, { on: number; off: number; ratio: number }>> => {
    const out: Record<string, { on: number; off: number; ratio: number }> = {}
    for (const w of WS) {
      const on = await drawStats(page, DRY.map(d => ({ key: d.key, preset: d.preset, w })))
      const off = await drawStats(page, DRY.map(d => ({ key: d.key, preset: d.preset, w, tip: 'none' })))
      for (const d of DRY) {
        const a = on[d.key]!, b = off[d.key]!
        out[`${d.key}@${w}`] = { on: a.mean, off: b.mean, ratio: b.mean > 0 ? +(a.mean / b.mean).toFixed(3) : 0 }
      }
    }
    return out
  }
  const fixed = await measure()
  await page.evaluate(() => (window as any).__b2.diag.setTipGainOffForTest(true))
  const raw = await measure()
  await page.evaluate(() => (window as any).__b2.diag.setTipGainOffForTest(false))
  const calib = await page.evaluate(() => (window as any).__b2.diag.mypaintCalibForTest()) as Record<string, { gain?: number; gainOk?: boolean; meanTip?: number; meanProc?: number }>
  const gains = Object.fromEntries(Object.entries(calib).filter(([k]) => k.includes('|')).map(([k, v]) => [k, { gain: v.gain, ok: v.gainOk, meanTip: v.meanTip, meanProc: v.meanProc }]))
  const dev = (m: Record<string, { ratio: number }>) => Math.max(...Object.values(m).map(v => Math.abs(v.ratio - 1)))
  OUT.density = {
    def: '직선 · 압력 .6 · 굵기 10/20/40 · 마른 매체 여섯(63의 다섯 + 새 cp) — 몸통 평균 어둡기(63 ①의 자) 팁 켬 ÷ 팁 끔(tip none · 절차 타원) · 문 ±5%(지시 64-4). 보정 = 프리셋|팁 열쇠의 gain(반지름 12 직선 견본 · 절차 평균 ÷ 팁 평균 · 상한 3 · opacityK 경로 — 성격(구멍)은 그대로) · 반증 = setTipGainOffForTest → 63의 옅음(연필 .86)이 돌아온다',
    tol: TOL, with_gain: fixed, with_gain_max_dev: +dev(fixed).toFixed(3), without_gain: raw, without_gain_max_dev: +dev(raw).toFixed(3), calib_gains: gains,
  }
  for (const [k, v] of Object.entries(fixed)) expect(Math.abs(v.ratio - 1), k + ' — 팁 켬/끔 농도 비 ' + v.ratio + ' (±' + TOL + ')').toBeLessThanOrEqual(TOL)
  expect(dev(raw), '반증 — 보정을 끄면 어느 매체가 문 밖으로 나간다(63의 옅음)').toBeGreaterThan(TOL)
})

test('④ 젖은 브러시 전수 — 흰 판에서 빈 프리셋 전부가 «색 위»에서는 돈다(빈 칸 0 — 아니면 그 이름을 값으로) · 64-5 탐침', async ({ page }) => {
  test.setTimeout(300_000)
  await bootBlank(page)
  const r = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const cat = b2.diag.presetCatalogForTest() as { group: string; names: string[] }[]
    const W = 360, H = 120
    const TH = b2.diag.paint50Constants().PAINT62_PAINTED_ALPHA as number
    // ① 흰 판에서 빈 것(62 ⑦의 그 판정 — 최대 층 알파 < 문)
    const empties: string[] = []
    for (const c of cat) for (const n of c.names) {
      b2.diag.markSampleForTest('brush', 'line', 12, 62, W, H, { preset: n, color: '#3a3a44' })
      const L = b2.diag.lastLayerAlphaForTest() as { a: number[] }
      let mx = 0
      for (let y = H / 2 - 14; y <= H / 2 + 14; y++) for (let x = 60; x < W - 60; x++) if (L.a[y * W + x]! > mx) mx = L.a[y * W + x]!
      if (mx < TH) empties.push(n)
    }
    // ② 색 위 — 굽기 통로(drawMarksSeam · 한 층에 차례로 · 스머지가 앞 획을 본다): 바탕 = 100%_Opaque 빨강 w60 가로띠 ·
    //    그 위에 젖은 프리셋 파랑 w14 물결. «돈다» = 바탕만 그린 판과의 픽셀 차(RGB 합 차 > 12)가 ≥ 40px.
    const base = [{ tool: 'marker', shape: 'line', wPx: 60, seed: 5, preset: 'ramon/100%_Opaque', color: '#c0392b', press: 1 }]
    const pixels = (): Uint8ClampedArray => new Uint8ClampedArray((window as any).__m61cv.getContext('2d').getImageData(0, 0, W, H).data)
    const changedPx = (A: Uint8ClampedArray, B: Uint8ClampedArray): number => {
      let changed = 0
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i]! - B[i]!) + Math.abs(A[i + 1]! - B[i + 1]!) + Math.abs(A[i + 2]! - B[i + 2]!) > 12) changed++
      return changed
    }
    b2.diag.markMultiForTest(base, W, H, true)
    const A = pixels()
    const diffOf = (name: string): number => {
      b2.diag.markMultiForTest([...base, { tool: 'brush', shape: 'wave', wPx: 14, seed: 7, preset: name, color: '#1e4fd0', press: 0.8 }], W, H, true)
      return changedPx(A, pixels())
    }
    const onColor: Record<string, number> = {}
    for (const n of empties) onColor[n] = diffOf(n)
    // 반증 — «아무것도 안 하는» 대조: 바탕만 두 번 = 차 0
    b2.diag.markMultiForTest(base, W, H, true)
    const nothing = changedPx(A, pixels())
    // 64-5 — watercolor-02-paint: 사상 통계(65/65인가) · smudge 켬/끔의 흰 판 평균 알파
    const wc = 'tanda/watercolor-02-paint'
    const stats = b2.diag.presetStatsForTest(wc)
    const meanOf = (): number => {
      b2.diag.markSampleForTest('brush', 'line', 20, 62, W, H, { preset: wc, color: '#1e4fd0' })
      const L = b2.diag.lastLayerAlphaForTest() as { a: number[] }
      let s = 0, n = 0
      for (let y = H / 2 - 10; y <= H / 2 + 10; y++) for (let x = 60; x < W - 60; x++) { s += L.a[y * W + x]!; n++ }
      return +(s / n).toFixed(4)
    }
    const wcOn = meanOf()
    b2.diag.setSmudgeOffForTest(true)
    const wcOff = meanOf()
    b2.diag.setSmudgeOffForTest(false)
    const wcOnColor = diffOf(wc)
    const waterStats = b2.diag.presetStatsForTest('tanda/watercolor-02-water')
    const opaqueOf: Record<string, number> = {}
    for (const n of empties) opaqueOf[n] = (b2.diag.presetStatsForTest(n) as { base: Record<string, number> }).base.opaque!
    return { empties, onColor, nothing, opaqueOf, wc: { stats, mean_white_smudge_on: wcOn, mean_white_smudge_off: wcOff, changed_on_color: wcOnColor, water_variant: waterStats } }
  })
  const MIN = (await page.evaluate(() => (window as any).__b2.diag.paint50Constants())).PAINT64_WET_MIN_PX as number
  const dead = Object.entries(r.onColor).filter(([, n]) => n < MIN).map(([k]) => k)
  // 색 위에서도 안 도는 것 — 프리셋의 제 불투명이 .05 이하(deevad/rough .0154 — «large low opacity brush» 원문 설명)면 «값으로 설명된 것»이고
  // 그 밖은 진짜 결함(지시 64-3). 이름은 어느 쪽이든 원장에 남는다.
  const deadUnexplained = dead.filter(k => (r.opaqueOf[k] ?? 1) > 0.05)
  OUT.wet = {
    def: '흰 판 빈칸(62 ⑦의 판정 — 최대 층 알파 < C.PAINT62_PAINTED_ALPHA · 직선 12px) 전부를 «색 위»(100%_Opaque 빨강 w60 띠 · 굽기 통로)에 파랑 w14 물결로 긋고 바탕만 판과의 픽셀 차(RGB 합 > 12) ≥ 40px이면 돈다 · dead = 색 위에서도 안 도는 이름(지시: 「그것이 진짜 결함」) · 반증 = 바탕만 두 번(차 0)',
    empties_on_white: r.empties.length, changed_px: r.onColor, min_changed_px: MIN, dead, dead_explained_opaque: Object.fromEntries(dead.map(k => [k, r.opaqueOf[k]])),
    dead_unexplained: deadUnexplained, falsification_nothing_changed: r.nothing,
  }
  OUT.watercolor = {
    def: '64-5 — tanda/watercolor-02-paint가 흐릿한 이유: 사상 통계(모르는 설정/입력 0이면 이식 밖) · smudge .95(스머지 버킷이 «빈 층»을 문다 — 흰 판 평균 알파 켬 vs 끔) · 색 위에서는 돈다(changed_on_color). 판정 = 프리셋 값(smudge .95 + 빈 층)이지 이식 결함이 아니다 — smudge 끔에서 평균이 «크게» 오르면 그 증거',
    ...r.wc,
  }
  expect(r.nothing, '반증 — 바탕만 두 번은 차 0').toBe(0)
  expect(r.empties.length, '흰 판 빈칸이 있다(62 ⑦ 42개 대역)').toBeGreaterThan(20)
  expect(deadUnexplained, '색 위에서도 안 도는 프리셋 중 제 불투명(≤ .05)으로 설명 안 되는 것 — 있으면 이름이 값으로(지시 64-3)').toEqual([])
  expect(r.wc.stats.unknownSettings, '64-5 — 설정 사상 밖 0').toEqual([])
  expect(r.wc.mean_white_smudge_off, '64-5 — smudge를 끄면 흰 판에서 진해진다(흐림의 정체 = smudge .95 × 빈 층)').toBeGreaterThan(r.wc.mean_white_smudge_on * 2)
})

// ── ②⑥⑦ — 화면(패널·탭)의 값 ─────────────────────────────────────────────────────────────

/** 요소가 «지금 눌리는가» — elementFromPoint(#87 · 문면이 아니라 화면에서). 보이고(크기 > 0) 중심을 찍으면 그 요소(또는 자손)가 나온다. */
const HIT_FN = `(function(id){
  const el = document.getElementById(id)
  if (!el) return { id, exists: false, hit: false }
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return { id, exists: true, hit: false, rect: [r.x, r.y, r.width, r.height] }
  const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return { id, exists: true, hit: !!t && (t === el || el.contains(t)), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], top: t ? (t.id || t.tagName) : null }
})`
const hit = (page: Page, id: string) => page.evaluate(([i, fn]) => new Function('return ' + fn)()(i), [id, HIT_FN] as const) as Promise<{ id: string; exists: boolean; hit: boolean; rect?: number[]; top?: string | null }>

test('② 두 번 펼침 0 — 칠의 설정 전수(브러시·크기·불투명·색·즐겨찾기)가 0단계(항상) 또는 1단계(한 번 누름) · 반증 = 작도 중에는 0개', async ({ page }) => {
  await bootBlank(page)
  // 반증 먼저(D-3): 작도 도구(연필)에서는 패널 요소가 하나도 안 눌린다(패널은 «칠 도구를 든 동안»만 — R8 정정의 반쪽)
  await page.click('#btn-pencil')
  const off = await Promise.all(['paint-brush-btn', 'paint-size-range', 'paint-opacity-range', 'paint-color-btn', 'paint-fav-1'].map(id => hit(page, id)))
  expect(off.every(h => !h.hit), '반증 — 작도 중에는 칠 설정이 화면에 없다').toBe(true)
  // 칠 도구를 든다 — 0단계: 누르지 않고 닿는 것
  await page.click('#btn-paint')
  await page.waitForTimeout(120)
  const ZERO = ['paint-brush-btn', 'paint-brush-sample', 'paint-size-range', 'paint-size-val', 'paint-opacity-range', 'paint-opacity-val', 'paint-color-btn',
    'paint-recent-1', 'paint-fav-1', 'paint-fav-2', 'paint-fav-3', 'paint-fav-4', 'paint-fav-5', 'paint-fav-6', 'btn-paint-front']
  const zero = await Promise.all(ZERO.map(id => hit(page, id)))
  const zeroBad = zero.filter(h => !h.hit)
  // 1단계: 한 번 눌러 닿는 것 둘 — 브러시 목록(견본 누름) · 색상 휠(색 원 누름)
  await page.click('#paint-brush-btn')
  await page.waitForTimeout(150)
  const pickOpen = await page.evaluate(() => (window as any).__b2.diag.openBoxes() as string[])
  const firstGroup = await page.locator('#brushpick-list details').first()
  await firstGroup.locator('summary').click()
  await page.waitForTimeout(200)
  const firstRow = await page.locator('#brushpick-list details[open] button[data-name]').first()
  const rowId = await firstRow.getAttribute('id')
  const rowHit = await hit(page, rowId!)
  await page.click('#brushpick-close')
  await page.click('#paint-color-btn')
  await page.waitForTimeout(120)
  const wheelOpen = await page.evaluate(() => (window as any).__b2.diag.openBoxes() as string[])
  const wheelHit = await hit(page, 'paint-wheel-cv')
  // 두 통은 서로 배타(R7 · 한 번에 하나) · 패널은 등록부 밖(통이 아니다)
  await page.click('#paint-brush-btn')
  await page.waitForTimeout(120)
  const both = await page.evaluate(() => (window as any).__b2.diag.openBoxes() as string[])
  await page.click('#brushpick-close')
  // 세로 예산(#97 짝 — 넘침 0)
  const ov = await page.evaluate(() => { const t = document.getElementById('painttray')!; return { sw: t.scrollWidth, cw: t.clientWidth, sh: t.scrollHeight, ch: t.clientHeight, vh: window.innerHeight, bottom: Math.round(t.getBoundingClientRect().bottom) } })
  OUT.depth = {
    def: '칠 도구를 든 상태에서 설정 요소의 «단계» = 닿기까지 누른 횟수. 0단계 = 패널(항상) — elementFromPoint로 실제로 눌린다 · 1단계 = 브러시 목록(견본 누름 → 첫 분류의 첫 칸이 눌린다) · 색상 휠(색 원 누름 → 휠 캔버스가 눌린다). 2단계 0. 반증 = 연필 도구에서는 0단계 요소가 0개 · 두 통은 배타(R7)',
    zero_stage: zero, zero_stage_missing: zeroBad.map(h => h.id), one_stage: { brush_list_open: pickOpen, brush_row: rowHit, wheel_open: wheelOpen, wheel: wheelHit }, exclusive_boxes: both,
    overflow: ov, falsification_pencil: off.map(h => ({ id: h.id, hit: h.hit })),
  }
  expect(zeroBad, '0단계 — 패널의 설정 전부가 «지금» 눌린다').toEqual([])
  expect(pickOpen, '브러시 목록이 한 번에 열렸다').toContain('#brushpick')
  expect(rowHit.hit, '1단계 — 목록의 칸이 눌린다').toBe(true)
  expect(wheelOpen, '색상 휠이 한 번에 열렸다').toContain('#paint-wheelbox')
  expect(wheelHit.hit, '1단계 — 휠 캔버스가 눌린다').toBe(true)
  expect(both.length, 'R7 — 통은 한 번에 하나').toBeLessThanOrEqual(1)
  expect(ov.sh, '#97 — 세로 넘침 0').toBe(ov.ch)
  expect(ov.bottom, '패널이 화면 안(34-6)').toBeLessThanOrEqual(ov.vh)
})

test('⑦ 34-0 — 패널 손잡이 전수의 툴팁(48-10) · 즐겨찾기 탭/길게 누름 · 브러시 목록 고르기 → 지금 브러시 · 최근 색', async ({ page }) => {
  await bootBlank(page)
  await page.click('#btn-paint')
  await page.waitForTimeout(120)
  const titles = await page.evaluate(() => {
    const ids = ['paint-brush-btn', 'paint-sizes', 'paint-size-range', 'paint-opacity', 'paint-opacity-range', 'paint-color-btn', 'paint-recent-1', 'paint-fav-1', 'paint-fav-6', 'btn-paint-front']
    return Object.fromEntries(ids.map(id => [id, (document.getElementById(id) as HTMLElement | null)?.title ?? null]))
  })
  const noTitle = Object.entries(titles).filter(([, t]) => !t || t.length < 4).map(([k]) => k)
  // 즐겨찾기 3(마커) 탭 → 지금 브러시 · 슬롯이 바뀐다
  const fav3 = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[2] as { i: string; br: string }
  await page.click('#paint-fav-3')
  await page.waitForTimeout(80)
  const sel3 = await page.evaluate(() => (window as any).__b2.diag.paintSelForTest())
  // 브러시 목록에서 고르기 → 지금 브러시(br)만 바뀐다 · 슬롯 그대로 · 옛 획은 안 변한다(①이 값)
  await page.click('#paint-brush-btn')
  await page.waitForTimeout(120)
  await page.evaluate(() => { (document.querySelector('#brushpick-list details[data-group="Tanda"]') as HTMLDetailsElement).open = true })
  await page.waitForTimeout(150)
  await page.click('#brushpick-tanda_marker-01')
  await page.waitForTimeout(120)
  const selPick = await page.evaluate(() => (window as any).__b2.diag.paintSelForTest())
  const nameShown = await page.locator('#paint-brush-name').innerText()
  // 목록을 닫는다(패널 위에 얹혀 있다 — 한 단계의 통) · 길게 눌러 즐겨찾기 6에 놔둔다(WRITE_HOLD_MS 450 — 600 대기) → 기기 저장
  await page.click('#brushpick-close'); await page.waitForTimeout(80)
  const b6 = await page.locator('#paint-fav-6').boundingBox()
  await page.mouse.move(b6!.x + b6!.width / 2, b6!.y + b6!.height / 2)
  await page.mouse.down(); await page.waitForTimeout(620); await page.mouse.up()
  await page.waitForTimeout(100)
  const favs = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()) as { i: string; br: string }[]
  // 최근 색 — 색을 고르면 첫 칸에 남는다 · 새로고침 뒤에도(기기)
  await page.evaluate(() => (window as any).__b2.diag.setPaintHexForTest('#1e7fd0'))
  await page.waitForTimeout(60)
  const recent = await page.evaluate(() => (window as any).__b2.diag.paintRecentForTest()) as string[]
  await page.goto('/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const favs2 = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()) as { i: string; br: string }[]
  const recent2 = await page.evaluate(() => (window as any).__b2.diag.paintRecentForTest()) as string[]
  OUT.panel = {
    def: '34-0(#96) — 손잡이 전수 툴팁 · R1(슬라이더 = 연속값 · 58 정정) · R3(전부 data-act state — 패널은 접히지 않는다) · R6(값 표찰 · 견본 · 이름) · R7(브러시 목록·휠은 통) · R8 정정(패널은 도구를 든 동안 항상 — 통 밖) · 즐겨찾기 탭=적용 · 길게=저장(기기) · 목록 고르기 = br만',
    titles, no_title: noTitle, fav3, sel_after_fav3: sel3, sel_after_pick: selPick, name_shown: nameShown, favs_after_hold: favs, favs_after_reload: favs2, recent, recent_after_reload: recent2,
  }
  expect(noTitle, '툴팁 전수(48-10)').toEqual([])
  expect(sel3.i, '즐겨찾기 3 탭 → 슬롯').toBe(fav3.i)
  expect(sel3.br, '즐겨찾기 3 탭 → 브러시').toBe(fav3.br)
  expect(selPick.br, '목록에서 고르면 지금 브러시').toBe('tanda/marker-01')
  expect(selPick.i, '슬롯은 그대로').toBe(fav3.i)
  expect(nameShown, '견본 곁에 이름이 보인다(R6)').toContain('marker-01')
  expect(favs[5]!.br, '길게 누름 → 그 칸에 지금 브러시').toBe('tanda/marker-01')
  expect(favs2[5]!.br, '새로고침 뒤에도(기기 저장)').toBe('tanda/marker-01')
  expect(recent[0], '최근 색 첫 칸').toBe('#1e7fd0')
  expect(recent2[0], '최근 색도 기기에').toBe('#1e7fd0')
})

test('⑥ 면 탭 — 칠 도구의 탭이 면을 고른다 · 짧은 획(문턱 위)은 칠 · 빈 곳 탭이 푼다 · 반증 = 연필 도구의 같은 탭은 안 고른다', async ({ page }) => {
  await bigBox(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const TAP = cs.PAINT64_TAP_MAX_PX as number
  // 반증 먼저 — 연필 도구(작도)에서 면 안을 탭해도 faceSel이 안 는다
  await page.click('#btn-pencil')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const selPencil = await page.evaluate(() => (window as any).__b2.app.faceSel.length)
  // 칠 도구 — 탭(움직임 0)
  await page.click('#btn-paint'); await page.waitForTimeout(80)
  const strokes0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const selTap = await page.evaluate(() => (window as any).__b2.app.faceSel.length)
  const strokesTap = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 문턱 «아래»의 흔들린 탭(대각 TAP−2) — 고르기 · 칠 아님
  const under = Math.max(1, Math.round((TAP - 2) / Math.SQRT2))
  await page.mouse.click(760, 470); await page.waitForTimeout(60)                 // 다시 탭(같은 면 — 맨 뒤로 · 수 그대로)
  await page.mouse.move(700, 480); await page.mouse.down(); await page.mouse.move(700 + under, 480 + under, { steps: 2 }); await page.mouse.up()
  await page.waitForTimeout(80)
  const selUnder = await page.evaluate(() => (window as any).__b2.app.faceSel.length)
  const strokesUnder = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 문턱 «위»의 짧은 획(대각 TAP+4) — 칠 · 고름 수 그대로
  const over = Math.round((TAP + 4) / Math.SQRT2)
  await page.mouse.move(700, 480); await page.mouse.down(); await page.mouse.move(700 + over, 480 + over, { steps: 3 }); await page.mouse.up()
  await page.waitForTimeout(200)
  const selOver = await page.evaluate(() => (window as any).__b2.app.faceSel.length)
  const strokesOver = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 빈 곳 탭 — 고름이 풀린다
  await page.mouse.click(300, 200); await page.waitForTimeout(80)
  const selClear = await page.evaluate(() => (window as any).__b2.app.faceSel.length)
  OUT.face_tap = {
    def: `칠 도구의 한 붓이 raw bbox 대각 ≤ C.PAINT64_TAP_MAX_PX(${TAP} · 화면 px)이면 탭 = 면 고르기(+51 Injector) · 넘으면 칠. 경계 양쪽(문턱 −2 · +4)에서 잰다 · 빈 곳 탭 = 풀기 · 반증 = 연필 도구의 같은 탭은 안 고른다(작도 중에는 옛 뜻 그대로)`,
    threshold_px: TAP, sel_pencil_tap: selPencil, sel_after_tap: selTap, strokes_delta_tap: strokesTap - strokes0,
    under: { diag_px: +(under * Math.SQRT2).toFixed(1), sel: selUnder, strokes_delta: strokesUnder - strokesTap },
    over: { diag_px: +(over * Math.SQRT2).toFixed(1), sel: selOver, strokes_delta: strokesOver - strokesUnder },
    sel_after_empty_tap: selClear,
  }
  expect(selPencil, '반증 — 연필 도구의 탭은 면을 안 고른다').toBe(0)
  expect(selTap, '칠 도구의 탭이 면을 고른다').toBe(1)
  expect(strokesTap - strokes0, '탭은 칠이 아니다').toBe(0)
  expect(selUnder, '문턱 아래의 흔들린 탭도 고르기(수 그대로 — 같은 면)').toBe(1)
  expect(strokesUnder - strokesTap, '문턱 아래 — 칠 0').toBe(0)
  expect(strokesOver - strokesUnder, '문턱 위의 짧은 획은 칠이다').toBeGreaterThan(0)
  expect(selOver, '짧은 획은 고름을 안 바꾼다').toBe(1)
  expect(selClear, '빈 곳 탭이 고름을 푼다').toBe(0)
})
