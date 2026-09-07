// web2-74 ⛳ 사진 둘 —
//   74-hud.png   `?perf=1` 화면 — **멈춤 목록이 이름을 단** 그 자리(부하 문서를 열고 굽는 동안)
//   74-arms.png  세 팔(그냥 / ?nothumb=1 / ?nosave=1)의 막대 — 멈춤 횟수·문턱 사다리·저장 갈래 ms
//
// ⚠ 74-arms는 **원장 JSON에서 그린 그림**이다(perf74_web2_dpr2) — 사진이 수치를 새로 만들지 않는다(#47).
//   원장이 없으면 그 사진은 건너뛴다. 산출물은 stage0/out/shots74/ → tools/shots74-copy.mjs(#104의 두 단계).

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { barChart, type BarGroup } from './chart73'

/* eslint-disable @typescript-eslint/no-explicit-any */
const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots74')
const LEDGER = resolve(HERE, '../../stage0/out/perf74_web2_dpr2.json')
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const readLedger = (): Record<string, any> | null =>
  existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) as Record<string, any> : null

test.describe.configure({ mode: 'serial' })

test('74-hud.png — ?perf=1 화면: 멈춤 목록이 이름을 달았다', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?reset&perf=1')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForLoadState('networkidle')
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
  }
  // 상자 + 벽 안 격자(72·73의 그 픽스처와 같은 자리) — 굽을 것이 있어야 이름이 붙는다
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
  // 칠을 두껍게 얹어 굽기가 실제로 프레임을 잡게 한다
  for (const cx of [540, 620, 700, 780, 860]) for (const cy of [365, 435, 505, 575, 645]) {
    await page.mouse.move(cx - 26, cy - 8); await page.mouse.down()
    await page.mouse.move(cx + 10, cy + 4, { steps: 2 }); await page.mouse.move(cx + 26, cy + 10, { steps: 2 })
    await page.mouse.up(); await page.waitForTimeout(20)
  }
  // ⛳ **이름이 자연히 붙는 자리는 «열 때»다**(§4 실측: 열기의 99.8%가 굽기 · 한 프레임 909ms).
  //   저장하고 그대로 다시 연다 — 사람이 앱을 여는 그 길이다(팔이 제 길을 만들지 않는다 #88).
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(1500)
  await page.goto('/?perf=1')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForTimeout(9000)
  const st = await page.evaluate(() => ({ stalls: (window as any).__b2.diag.perfStalls(), text: (window as any).__b2.diag.perfHudForTest().text as string }))
  // 이름이 하나도 안 붙었으면 **구동 판**으로 만든다(표식 안에서 막는다) — 사진에 그 사실을 적는다.
  //   ⚠ 이 갈래를 타면 화면의 이름 몇 줄은 «인위»다. 자연 판은 열기의 굽기가 낸다(위).
  if (!st.stalls.recent.some((s: any) => s.mark !== '?')) {
    await page.evaluate(async () => {
      const b2 = (window as any).__b2
      for (const [n, ms] of [['bake.commit', 700], ['save.serialize', 350], ['save.thumb', 450]] as [string, number][]) {
        b2.diag.blockInMarkForTest(n, ms)
        await new Promise(r => setTimeout(r, 350))
      }
    })
    await page.waitForTimeout(700)
  }
  const buf = await page.screenshot({ fullPage: false })
  saveBuf('74-hud.png', buf)
  const final = await page.evaluate(() => ({ n: (window as any).__b2.diag.perfStalls().n, text: (window as any).__b2.diag.perfHudForTest().text as string, els: document.querySelectorAll('#perfhud').length }))
  expect(final.els, '화면은 하나다').toBe(1)
  expect(final.n, '멈춤이 목록에 있다').toBeGreaterThanOrEqual(1)
  expect(final.text, '「최장 간격」이 문면에 있다').toContain('최장 간격')
  expect(final.text, '멈춤 줄이 문면에 있다').toContain('t=')
  // 이 사진의 뜻은 «이름이 붙는다»이다 — 하나라도 표식 이름이어야 한다
  expect(/·\s(save|bake|tex|doc|list)\./.test(final.text), '목록의 어느 줄이 표식 이름을 달았다').toBe(true)
})

test('74-arms.png — 세 팔의 막대(원장 인용)', async ({ page }) => {
  const L = readLedger()
  test.skip(!L || !L.S2_arms || !L.S2_verdict, '원장이 없다 — 먼저 perf74를 돌린다')
  const A = L!.S2_arms as Record<string, any>
  const V = L!.S2_verdict as Record<string, any>
  const B = L!.S3_before_after as Record<string, any> | undefined
  const names = Object.keys(A)
  const C = ['#c25b4a', '#c98a3a', '#3f7d5a'] as const
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const chainOf = (m: Record<string, { ms: number }>) =>
    ['save.serialize', 'save.put', 'save.thumb', 'list.read', 'list.render'].reduce((t, k) => t + (m[k]?.ms ?? 0), 0)
  const thumbOf = (m: Record<string, { ms: number }>) => m['save.thumb']?.ms ?? 0
  const meanChain = (n: string) => sum((A[n].marks as Record<string, { ms: number }>[]).map(chainOf)) / A[n].marks.length
  const meanThumb = (n: string) => sum((A[n].marks as Record<string, { ms: number }>[]).map(thumbOf)) / A[n].marks.length
  const idx200 = (A[names[0]!].gap_thresholds as number[]).indexOf(200)
  const idx400 = (A[names[0]!].gap_thresholds as number[]).indexOf(400)
  const groups: BarGroup[] = [
    { label: '멈춤 ≥ 200ms · 세 실행의 합 (⚠ 팔을 못 가른다)', unit: '회',
      bars: names.map((n, i) => ({ name: n, v: sum(A[n].stall_n as number[]), color: C[i]! })) },
    { label: '같은 자료 · 문턱 ≥ 400ms (아홉 실행 전부 0 = 잡음 바닥이 200~244ms)', unit: '회',
      bars: names.map((n, i) => ({ name: n, v: sum((A[n].gap_n as number[][]).map(r => r[idx400]!)), color: C[i]! })) },
    { label: '문턱 ≥ 200ms (사다리 · 위 첫 줄과 같은 수)', unit: '회',
      bars: names.map((n, i) => ({ name: n, v: sum((A[n].gap_n as number[][]).map(r => r[idx200]!)), color: C[i]! })) },
    { label: '⛳ 저장 갈래 ms / 몸짓(획 10붓) — 기계에 안 흔들리는 자', unit: 'ms',
      bars: names.map((n, i) => ({ name: n, v: Math.round(meanChain(n) * 10) / 10, color: C[i]! })) },
    { label: '그 중 썸네일(toDataURL)', unit: 'ms',
      bars: names.map((n, i) => ({ name: n, v: Math.round(meanThumb(n) * 10) / 10, color: C[i]! })) },
  ]
  if (B) {
    groups.push({ label: '§3-3 전/후 — 몸짓당 toDataURL 호출', unit: '회', bars: [
      { name: '수리 전(저장마다)', v: B.thumb_calls_mean.pre, color: '#c25b4a' },
      { name: '지금(쉴 때·닫을 때)', v: B.thumb_calls_mean.post, color: '#3f7d5a' }] })
    groups.push({ label: '§3-3 전/후 — 저장 갈래 ms', unit: 'ms', bars: [
      { name: '수리 전', v: B.save_chain_ms_mean.pre, color: '#c25b4a' },
      { name: '지금', v: B.save_chain_ms_mean.post, color: '#3f7d5a' }] })
  }
  const buf = await barChart(page,
    'web2-74 §2 — 세 팔(그냥 / ?nothumb=1 / ?nosave=1 · 같은 문서 · 같은 몸짓 · 세 번씩 · dpr2 · 면 23 · 칠 920)',
    `원장 perf74_web2_dpr2.json@S2_arms·S2_verdict·S3_before_after — ⚠ 「멈춤 ≥ 문턱」은 이 기계에서 팔을 못 가른다(팔 안 변동 ${V.within_arm_spread_max} ↔ 팔 사이 ${V.between_arm_spread} · ≥400ms는 전부 0). 지목은 표식의 호출 수와 ms가 했다: 썸네일이 저장 갈래의 71.1%.`,
    groups)
  saveBuf('74-arms.png', buf)
})
