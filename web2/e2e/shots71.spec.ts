// web2-71 ⛳ 사진 — 71-gestures.png(정사 스냅 전/후 + 「—×—」 · 한 판에 둘) · 71-hold.png(칠 획 멈춤 전/후 — 같은 획)
// 산출물은 stage0/out/shots71/ → tools/shots71-copy.mjs. dpr2 목록에 든다(screenshot).
import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots71')
const saveBuf = (name: string, buf: Buffer) => { mkdirSync(OUTDIR, { recursive: true }); writeFileSync(resolve(OUTDIR, name), buf); expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000) }
async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(300)
}
async function drawBox(page: Page) {
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const) {
    await page.mouse.move(l[0], l[1]); await page.mouse.down(); await page.mouse.move((l[0] + l[2]) / 2, (l[1] + l[3]) / 2, { steps: 4 }); await page.mouse.move(l[2], l[3], { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(60)
  }
  await page.waitForTimeout(200)
  // 면을 세운다(paint67 bigBox 그대로 — 칠은 면 위에서만 산다 · #103)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(100)
  await page.click('#btn-pencil'); await page.click('#btn-pencil'); await page.waitForTimeout(100)
}
/** 두 장을 한 판에 — 왼쪽 전 · 오른쪽 후(캔버스 그림으로 합성 · 사진용) */
async function sideBySide(page: Page, a: Buffer, b: Buffer, label: string): Promise<Buffer> {
  return Buffer.from(await page.evaluate(async ([a64, b64, label]) => {
    const load = (s: string) => new Promise<HTMLImageElement>(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s })
    const [ia, ib] = await Promise.all([load(a64 as string), load(b64 as string)])
    const cv = document.createElement('canvas'); cv.width = ia.width * 2 + 16; cv.height = ia.height + 28
    const g = cv.getContext('2d')!; g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, cv.width, cv.height)
    g.drawImage(ia, 0, 28); g.drawImage(ib, ia.width + 16, 28)
    g.fillStyle = '#3c3831'; g.font = '14px system-ui'; g.fillText(`${label} — 전`, 8, 20); g.fillText(`${label} — 후`, ia.width + 24, 20)
    return cv.toDataURL('image/png').split(',')[1]!
  }, [a.toString('base64'), b.toString('base64'), label]), 'base64')
}

test.describe.configure({ mode: 'serial' })

test('71-gestures.png — 정사 스냅 전/후 + 「—×—」', async ({ page }) => {
  await boot(page); await drawBox(page)
  await page.evaluate(() => (window as any).__b2.diag.orbitByForTest(12, 0)); await page.waitForTimeout(400)   // 정사에서 ±12° — 스냅 대역 안
  const before = await page.screenshot()
  const snapped = await page.evaluate(() => (window as any).__b2.diag.orthoSnapForTest())
  await page.waitForTimeout(800)
  const after = await page.screenshot()
  console.log(`[71-gestures] 스냅 ${snapped} · 「—×—」 ${await page.evaluate(() => !document.getElementById('ortho-mark')!.hidden)}`)
  saveBuf('71-gestures.png', await sideBySide(page, before, after, '정사 스냅(한 손가락 두 번)'))
})

test('71-hold.png — 칠 획 멈춤 전/후(같은 획)', async ({ page }) => {
  await boot(page); await drawBox(page)
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(200)
  const cdp = await page.context().newCDPSession(page)
  const pen = { pointerType: 'pen' as const }
  const drag = async (y: number) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y, button: 'left', ...pen, force: 0.5 }); for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: y + Math.sin(i / 3) * 36, button: 'left', ...pen, force: 0.5 }) }
  await drag(480); await page.waitForTimeout(60)
  const before = await page.screenshot()   // 멈추기 전 — 곡선 미리보기
  await page.waitForTimeout(C.GESTURE71_PAINT_HOLD_MS + 120)
  const after = await page.screenshot()    // 멈춘 뒤 — 직선 띠
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 480, button: 'left', ...pen, force: 0 })
  await cdp.detach()
  saveBuf('71-hold.png', await sideBySide(page, before, after, '칠 획 끝 멈춤 400ms(같은 획)'))
})
