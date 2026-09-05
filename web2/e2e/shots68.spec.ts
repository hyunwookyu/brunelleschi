// web2-68 ⛳ 사진 — 사람 눈의 판정대(CLOSING · CHAIN6 「사람을 멈춰 세우지 마라 — 사진으로 남기고 간다」).
//   68-pencilcase.png  §1 — 칠 패널 전체(필통 여덟 칸 · 촉 색 · 경도 글자 · 숫자 · 눈금 표식)
//   68-grades.png      §2 — 연필 여섯 + 목탄 셋, 같은 크기·같은 압력(hill 0.3→0.7→0.3)으로 한 획씩, 위에 경도 글자
//   68-library.png     §3 — 브러시 목록 두 칸(패널 옆 · 세트 열 · 견본 행)
//
// ⚠ #104: PNG는 stage0/out/shots68/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots68-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PENCIL_GRADES68, CHARCOAL_GRADES68, PENCIL_PRESET_OF_GRADE, CHARCOAL_PRESET_OF_GRADE } from '../src/core/grades68'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots68')

const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  mkdirSync(OUTDIR, { recursive: true })
}

test('68-pencilcase.png — 칠 패널 전체(필통 여덟 · 촉 색 · 경도 · 숫자 · 눈금)', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  // 칸마다 색이 다르게 보이도록 — 탭해서 색을 고르면 adopt가 칸에 남긴다(사진만의 일 · 기기 저장은 이 컨텍스트뿐)
  const hexes = ['#2a2f36', '#3b3b3b', '#1e1e1e', '#1d5e2e', '#c0511e', '#164a9e', '#7a3030']
  for (let k = 0; k < 7; k++) {
    await page.click(`#paint-fav-${k + 1}`); await page.waitForTimeout(40)
    await page.evaluate((h) => (window as any).__b2.diag.setPaintHexForTest(h), hexes[k]!); await page.waitForTimeout(40)
  }
  await page.click('#paint-fav-1'); await page.waitForTimeout(120)
  const box = (await page.locator('#painttray').boundingBox())!
  saveBuf('68-pencilcase.png', await page.screenshot({ clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } }))
})

test('68-grades.png — 연필 여섯 + 목탄 셋 · 같은 크기·같은 압력 한 획씩 · 위에 경도 글자', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  const rows = [
    ...PENCIL_GRADES68.map(g => ({ label: `연필 ${g}`, preset: PENCIL_PRESET_OF_GRADE[g] })),
    ...CHARCOAL_GRADES68.map(g => ({ label: `목탄 ${g}`, preset: CHARCOAL_PRESET_OF_GRADE[g] })),
  ]
  // 한 판에 아홉 획 — markSampleForTest(제품 함수 · hill 압력)의 캔버스(__m61cv)를 이어 붙인다
  await page.evaluate((rows) => {
    const b2 = (window as any).__b2
    const W = 520, RH = 64
    const board = document.createElement('canvas'); board.id = 'shot68-board'
    board.width = W * 2; board.height = rows.length * RH * 2
    board.style.cssText = `position:fixed;left:40px;top:40px;width:${W}px;height:${rows.length * RH}px;z-index:99;background:#fffdf8;border:1px solid #d8d2c4`
    const g = board.getContext('2d')!
    g.setTransform(2, 0, 0, 2, 0, 0)
    g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, rows.length * RH)
    rows.forEach((r: { label: string; preset: string }, k: number) => {
      b2.diag.markSampleForTest('pencil', 'hill', 14, 68, 480, 120, { preset: r.preset, color: '#000000' })
      const cv = (window as any).__m61cv as HTMLCanvasElement
      g.drawImage(cv, 0, 0, 480, 120, 60, k * RH + 2, 450, 60)
      g.fillStyle = '#3c3831'; g.font = '600 12px system-ui, sans-serif'; g.textBaseline = 'middle'
      g.fillText(r.label, 8, k * RH + RH / 2)
      g.fillStyle = '#8d8880'; g.font = '9px system-ui, sans-serif'
      g.fillText(r.preset, 8, k * RH + RH / 2 + 14)
    })
    document.body.append(board)
  }, rows)
  await page.waitForTimeout(200)
  const box = (await page.locator('#shot68-board').boundingBox())!
  saveBuf('68-grades.png', await page.screenshot({ clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } }))
  await page.evaluate(() => document.getElementById('shot68-board')?.remove())
})

test('68-library.png — 브러시 목록 두 칸(패널 옆)', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  await page.click('#paint-brush-btn'); await page.waitForTimeout(250)
  await page.click('#brushpick-set-Tanda'); await page.waitForTimeout(600)
  const p = (await page.locator('#painttray').boundingBox())!
  const b = (await page.locator('#brushpick').boundingBox())!
  const x = Math.max(0, Math.min(p.x, b.x) - 8), y = Math.max(0, Math.min(p.y, b.y) - 8)
  saveBuf('68-library.png', await page.screenshot({ clip: { x, y, width: Math.max(p.x + p.width, b.x + b.width) - x + 8, height: Math.max(p.y + p.height, b.y + b.height) - y + 8 } }))
})
