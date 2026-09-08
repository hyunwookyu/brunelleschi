// web2-75 ⛳ 사진 셋 —
//   75-slice.png  자르는 단위: 구간 크기별 «한 구간 최대 ms»·«한 호출 최대 ms»와 그 옆의 «준비 한 번»
//   75-open.png   열기: 캐시 없음 ↔ 있음(칠이 다 채워지기까지 · 굽기 ms · 캐시에서 온 면)
//   75-hud.png    §4 — `?perf=1` 화면이 **열기의 세 몫과 캐시에서 온 면 수**를 든다(74는 원장에만 있었다)
//
// ⚠ 둘 다 **원장 JSON에서 그린 그림**이다(perf75_web2_dpr2) — 사진이 수치를 새로 만들지 않는다(#47).
//   원장이 없으면 그 사진은 건너뛴다. 산출물은 stage0/out/shots75/ → tools/shots75-copy.mjs(#104의 두 단계).

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { barChart, type BarGroup } from './chart73'

/* eslint-disable @typescript-eslint/no-explicit-any */
const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots75')
const LEDGER = resolve(HERE, '../../stage0/out/perf75_web2_dpr2.json')
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const readLedger = (): Record<string, any> | null =>
  existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) as Record<string, any> : null

test.describe.configure({ mode: 'serial' })

test('75-slice.png — 자르는 단위: 구간 크기별 최대와 «준비 한 번»', async ({ page }) => {
  test.setTimeout(300_000)
  const L = readLedger()
  test.skip(!L?.S1_sweep, '원장 perf75_web2_dpr2.json이 없다 — 먼저 계측을 돌린다')
  const rows = (L!.S1_sweep.rows as any[])
  const app = L!.S1_sweep.slice_pts_app
  const s0 = L!.S1_0
  const groups: BarGroup[] = [
    { label: `한 구간이 먹는 «점 수» (기계에 안 흔들리는 자)`, unit: '점',
      bars: rows.map(r => ({ name: r.slicePts === 'inf' ? '획 하나(수리 전)' : `구간 ${r.slicePts}`, v: r.chunkPtsMax,
        color: r.slicePts === 'inf' ? '#b4483c' : (r.slicePts === app ? '#2f6f4f' : '#8b8378') })) },
    { label: '한 구간 최대 (ms · SwiftShader 기록)', unit: 'ms',
      bars: rows.map(r => ({ name: r.slicePts === 'inf' ? '획 하나(수리 전)' : `구간 ${r.slicePts}`, v: r.strokeMsMax,
        color: r.slicePts === 'inf' ? '#b4483c' : (r.slicePts === app ? '#2f6f4f' : '#8b8378') })) },
    { label: '`bake.commit` 한 호출 최대 (ms)', unit: 'ms',
      bars: rows.map(r => ({ name: r.slicePts === 'inf' ? '획 하나(수리 전)' : `구간 ${r.slicePts}`, v: r.commitMsMax,
        color: r.slicePts === 'inf' ? '#b4483c' : (r.slicePts === app ? '#2f6f4f' : '#8b8378') })) },
    { label: '총 ms (자를수록 조금 는다 — 맞바꿈)', unit: 'ms',
      bars: rows.map(r => ({ name: r.slicePts === 'inf' ? '획 하나(수리 전)' : `구간 ${r.slicePts}`, v: r.ms,
        color: r.slicePts === 'inf' ? '#b4483c' : (r.slicePts === app ? '#2f6f4f' : '#8b8378') })) },
    { label: '⚠ 자르기가 «못 자르는» 것 — 판마다 한 번의 준비(보정)', unit: 'ms',
      bars: [
        { name: '차가운 판: 획 하나 최대', v: s0.cold.strokeMsMax, color: '#b4483c' },
        { name: '그중 보정 한 번', v: s0.coldWarmup.calibMaxMs, color: '#c9803a' },
        { name: '준비가 끝난 뒤: 획 하나 최대', v: s0.warmSecond.strokeMsMax, color: '#2f6f4f' },
      ] },
  ]
  const buf = await barChart(page, 'web2-75 §1 — 자르는 단위를 «획»에서 «점 구간»으로',
    `픽셀은 다섯 행이 같다(sameTex ${rows.every(r => r.sameTex)}) · 앱 상수 구간 ${app}점 · 픽스처 획 ${L!.fixture?.paintStrokes ?? '?'} · ${L!.gl?.renderer ?? 'GPU 이름 없음'}`,
    groups)
  saveBuf('75-slice.png', buf)
})

test('75-open.png — 열기: 캐시 없음 ↔ 있음', async ({ page }) => {
  test.setTimeout(300_000)
  const L = readLedger()
  test.skip(!L?.S3_open, '원장에 §3이 없다')
  const o = L!.S3_open
  const groups: BarGroup[] = [
    { label: '칠이 다 채워지기까지 (ms)', unit: 'ms',
      bars: [{ name: '캐시 없음', v: o.cold.allPaintMs, color: '#b4483c' }, { name: '캐시 있음', v: o.warm.allPaintMs, color: '#2f6f4f' }] },
    { label: '그중 굽기 (ms)', unit: 'ms',
      bars: [{ name: '캐시 없음', v: o.cold.bakeMs, color: '#b4483c' }, { name: '캐시 있음', v: o.warm.bakeMs, color: '#2f6f4f' }] },
    { label: '연 뒤 첫 프레임 (ms)', unit: 'ms',
      bars: [{ name: '캐시 없음', v: o.cold.firstInteractiveMs, color: '#b4483c' }, { name: '캐시 있음', v: o.warm.firstInteractiveMs, color: '#2f6f4f' }] },
    { label: '면을 어디서 얻었나 (수)', unit: '면',
      bars: [{ name: '캐시 없음 · 구움', v: o.cold.bakes, color: '#b4483c' }, { name: '캐시 있음 · 구움', v: o.warm.bakes, color: '#8b8378' },
        { name: '캐시 있음 · 캐시에서', v: o.warm.cache.applied, color: '#2f6f4f' }] },
    { label: '열기의 세 몫 — 캐시 없음 (ms)', unit: 'ms',
      bars: [{ name: '파싱', v: o.cold.parseMs, color: '#8b8378' }, { name: '세우기', v: o.cold.applyMs, color: '#8b8378' }, { name: '굽기', v: o.cold.bakeMs, color: '#b4483c' }] },
  ]
  const buf = await barChart(page, 'web2-75 §3 — 굽힌 그림 캐시(열기)',
    `그림은 같다(해시 동일 ${o.same_picture}) · 캐시에서 온 면 ${o.warm.cache.applied}/${o.warm.faces} · 담은 바이트 ${(o.wrote_after_cold.writeBytes / 1048576).toFixed(1)} MB · ${L!.gl?.renderer ?? 'GPU 이름 없음'}`,
    groups)
  saveBuf('75-open.png', buf)
})

test('75-hud.png — §4: ?perf=1 화면이 열기 세 몫과 캐시 셈을 든다', async ({ page }) => {
  test.setTimeout(300_000)
  // 부하 문서를 세우고 저장한 뒤 `?perf=1`로 다시 연다 — 열기의 굽기가 이름 붙은 멈춤을 낸다(74의 그 길)
  await page.goto('/?reset')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.evaluate(() => (window as any).__b2.diag.store.clearForTest())
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
  }
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560],
    [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await line(l[0], l[1], l[2], l[3])
  for (const x of [580, 660, 740, 820]) await line(x, 335, x, 690)
  for (const y of [400, 470, 540, 610]) await line(505, y, 895, y)
  await page.click('#btn-face')
  for (const cx of [540, 620, 700, 780, 860]) for (const cy of [365, 435, 505, 575, 645]) { await page.mouse.click(cx, cy); await page.waitForTimeout(25) }
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  await page.evaluate(() => Object.assign((window as any).__b2.app.paintSel, { hex: '#7a4a3a', w: 22, o: 1 }))
  for (const cx of [540, 620, 700, 780, 860]) for (const cy of [365, 435, 505, 575, 645]) {
    await page.mouse.move(cx - 26, cy - 8); await page.mouse.down()
    await page.mouse.move(cx + 10, cy + 4, { steps: 2 }); await page.mouse.move(cx + 26, cy + 10, { steps: 2 })
    await page.mouse.up(); await page.waitForTimeout(20)
  }
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(800)
  // ⚠ **한 번 더 연다.** 그리는 동안의 카메라와 «다시 열었을 때»의 카메라가 다르면 굽기 열쇠(famBits·texelQ)가
  //   달라 캐시가 안 맞는다 — 그것이 이 캐시의 규약이다(열쇠가 그림에 의존하는 것 전부 · #110). 사람이 겪는
  //   자리는 «같은 문서를 두 번째로 여는 것»이므로 사진도 그 자리를 든다.
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 120_000 })
  await page.waitForFunction(() => (window as any).__b2.diag.texCache().writes > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2500)
  await page.goto('/?perf=1')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForTimeout(9000)
  const dbg = await page.evaluate(() => ({ cache: (window as any).__b2.diag.texCache(),
    tex: ((window as any).__b2.diag.paintTex() as any[]).map(e => [e.key, e.level, e.w]).slice(0, 4) }))
  console.log('75-hud-dbg', JSON.stringify(dbg))
  const buf = await page.screenshot({ fullPage: false })
  saveBuf('75-hud.png', buf)
  const final = await page.evaluate(() => ({ text: (window as any).__b2.diag.perfHudForTest().text as string,
    els: document.querySelectorAll('#perfhud').length, cache: (window as any).__b2.diag.texCache() }))
  expect(final.els, '화면은 하나다').toBe(1)
  expect(final.text, '§4 — 열기의 세 몫이 화면에 있다').toContain('파싱')
  expect(final.text, '§4 — 세우기').toContain('세우기')
  expect(final.text, '§4 — 굽기').toContain('굽기')
  expect(final.text, '§3 — 캐시에서 온 면 수가 화면에 있다').toContain('캐시에서')
  expect(final.text, '§4 — 사람이 실제로 기다리는 값(칠 다 채움)이 화면에 있다').toContain('칠 다 채움')
  expect(final.cache.applied, '사진이 «캐시에서 온 면»을 실제로 든다').toBeGreaterThan(0)
  expect(final.text, '74가 세운 문면은 그대로다(최장 간격)').toContain('최장 간격')
  expect(final.text, '옛 이름은 없다(p95)').not.toContain('p95')
  console.log('75-hud', JSON.stringify({ text: final.text, cache: final.cache }))
})
