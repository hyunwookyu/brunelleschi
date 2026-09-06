// web2-73 ⛳ 사진 셋 —
//   73-arms.png     네 팔(①빈 ②선만 ③면까지 ④칠까지)의 p95·최장 차단·삼각형·그리기 호출과 걸음별 ms(원장에서 그린다)
//   73-open.png     「칠 전부 채워지기」의 네 몫 + 쉬는 중 예산 훑기(원장에서 그린다)
//   73-perfhud.png  `?perf=1` 실기기 모드 화면(큰 글씨 셋 — 사람이 아이패드에서 볼 그 자리)
//
// ⚠ 73-arms·73-open은 **원장 JSON에서 그린 그림**이다(perf73_web2_dpr2) — 사진이 수치를 새로 만들지 않는다
//   (#47). 원장이 없으면 그 사진은 건너뛴다. 산출물은 stage0/out/shots73/ → tools/shots73-copy.mjs.

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { barChart, type BarGroup } from './chart73'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots73')
const LEDGER = resolve(HERE, '../../stage0/out/perf73_web2_dpr2.json')
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const readLedger = (): Record<string, any> | null =>
  existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) as Record<string, any> : null

test.describe.configure({ mode: 'serial' })

const COLORS = ['#8a8378', '#5b7fa5', '#c98a3a', '#3f7d5a'] as const
const ARMS = ['①빈', '②선만', '③면까지', '④칠까지'] as const

test('73-arms.png — 네 팔(같은 카메라 · 같은 몸짓 720px · dpr2) · 걸음별 ms(원장 인용)', async ({ page }) => {
  const L = readLedger()
  test.skip(!L || !L.A_arms, '원장이 없다 — 먼저 perf73를 돌린다')
  const A = L!.A_arms as Record<string, any>
  const gl = L!.gl as { renderer: string }
  const bars = (f: (a: any) => number) => ARMS.map((a, i) => ({ name: a, v: f(A[a]), color: COLORS[i]! }))
  const stepBars = (k: string) => ARMS.map((a, i) => ({ name: a, v: A[a].steps_ms[k].p95, color: COLORS[i]! }))
  const groups: BarGroup[] = [
    { label: '프레임 p95', unit: 'ms', bars: bars(a => a.p95) },
    { label: '메인 최장 차단', unit: 'ms', bars: bars(a => a.longestBlockMs) },
    { label: 'fps', unit: '', bars: bars(a => a.fps) },
    { label: '삼각형(마지막 프레임)', unit: '개', bars: bars(a => a.triangles) },
    { label: '그리기 호출', unit: '회', bars: bars(a => a.drawCalls) },
    { label: '걸음 render p95', unit: 'ms', bars: stepBars('render') },
    { label: '걸음 gatePaintTex p95', unit: 'ms', bars: stepBars('gatePaintTex') },
    { label: '걸음 sortFaces p95', unit: 'ms', bars: stepBars('sortFaces') },
    { label: '걸음 revealFaces p95', unit: 'ms', bars: stepBars('revealFaces') },
  ]
  const buf = await barChart(page, `web2-73 §1 — 네 팔(같은 카메라 · 같은 몸짓 720px · dpr2) · GPU: ${gl.renderer}`,
    '원장 perf73_web2_dpr2.json@A_arms — ①빈(획 0) ②선만(칠 0·면 0) ③면까지(면 23·칠 0 = 72의 bare) ④칠까지(72 픽스처 전량). 팔 사이의 «차»가 몫이다.', groups)
  saveBuf('73-arms.png', buf)
})

test('73-open.png — 「칠 전부 채워지기」의 네 몫 · 쉬는 중 예산 훑기(원장 인용)', async ({ page }) => {
  const L = readLedger()
  test.skip(!L || !L.B_parts, '원장이 없다 — 먼저 perf73를 돌린다')
  const P = L!.B_parts as Record<string, any>
  const S = L!.B_idle_sweep as Record<string, any>
  const keys = Object.keys(S)
  const groups: BarGroup[] = [
    { label: '네 몫(지금 · 12ms)', unit: 'ms', bars: [
      { name: '굽기 CPU', v: P.bake_ms, color: '#c25b4a' },
      { name: '업로드(GL 호출)', v: P.upload_ms, color: '#c98a3a' },
      { name: '분할 대기(논 시간)', v: P.wait_ms, color: '#5b7fa5' },
      { name: '그 밖', v: P.other_ms, color: '#8a8378' },
      { name: '벽시계(칠 전부)', v: P.wall_ms, color: '#3f7d5a' }] },
    { label: '예산별 칠 전부', unit: 'ms', bars: keys.map((k, i) => ({ name: `idle ${S[k].idleMs}ms`, v: S[k].allPaintMs, color: i === 0 ? '#3f7d5a' : '#5b7fa5' })) },
    { label: '예산별 첫 상호작용', unit: 'ms', bars: keys.map((k, i) => ({ name: `idle ${S[k].idleMs}ms`, v: S[k].firstInteractiveMs, color: i === 0 ? '#3f7d5a' : '#8a8378' })) },
    { label: '예산별 메인 최장 차단', unit: 'ms', bars: keys.map((k, i) => ({ name: `idle ${S[k].idleMs}ms`, v: S[k].longestBlockMs, color: i === 0 ? '#3f7d5a' : '#c25b4a' })) },
  ]
  const buf = await barChart(page, 'web2-73 §2 — 「칠 전부 채워지기」의 네 몫과 쉬는 중 예산(dpr2 · 면 23 · 칠 920)',
    '원장 perf73_web2_dpr2.json@B_parts·B_idle_sweep — 네 몫의 합은 구성상 벽시계다(other = 뺄셈). 판정은 장부 vs 벽시계(±5%). 예산은 §3이 값을 고른다.', groups)
  saveBuf('73-open.png', buf)
})

test('73-perfhud.png — ?perf=1 실기기 모드(큰 글씨 셋)', async ({ page }) => {
  await page.goto('/?reset&perf=1')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
  }
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await line(l[0], l[1], l[2], l[3])
  await page.mouse.move(300, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 40; i++) { await page.mouse.move(300 + i * 6, 400 + i, { steps: 1 }); await page.waitForTimeout(16) }
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(700)
  const buf = await page.screenshot({ fullPage: false })
  saveBuf('73-perfhud.png', buf)
  expect(await page.evaluate(() => document.querySelectorAll('#perfhud').length)).toBe(1)
})
