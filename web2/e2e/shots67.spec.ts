// web2-67 ⛳ 사진 — 사람 눈의 판정대(CLOSING).
//   67-gestures.png  §1 — 한 장면에 셋: 손가락 탭으로 고른 벽 두 판(강조) · 펜 «점» 넷(슬롯별) ·
//                    고른 두 판을 가로지른 펜 한 붓(이어그리기 — 바닥은 비었다).
//   67-eraser.png    0-6 — 칠한 면(마커로 채운 판)에 지우개로 글자 「ㄱ」 하나.
//
// ⚠ #104: PNG는 stage0/out/shots67/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots67-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots67')

const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}
async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  mkdirSync(OUTDIR, { recursive: true })
}
async function pen(page: Page, pts: [number, number][], buttons = 1) {
  await page.evaluate(([list, btn]) => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, {
      pointerType: 'pen', pointerId: 7, isPrimary: true, buttons: b, pressure: b === 0 ? 0 : 0.55,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', list[0]![0], list[0]![1], btn))
    for (let i = 1; i < list.length; i++) el.dispatchEvent(mk('pointermove', list[i]![0], list[i]![1], btn))
    el.dispatchEvent(mk('pointerup', list[list.length - 1]![0], list[list.length - 1]![1], 0))
  }, [pts, buttons] as const)
  await page.waitForTimeout(120)
}
async function fingerTap(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, b: number) => new PointerEvent(type, {
      pointerType: 'touch', pointerId: 91, isPrimary: true, buttons: b, pressure: b ? 0.5 : 0,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', 1))
    el.dispatchEvent(mk('pointerup', 0))
  }, [x, y] as const)
  await page.waitForTimeout(120)
}

test('67-gestures.png — 손가락 탭 고름 · 펜 점 넷 · 고른 두 판을 가로지른 한 붓', async ({ page }) => {
  test.setTimeout(300_000)
  await boot(page)
  // paint54의 room3(바닥 + 벽 두 판)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 550, 487, 550, 383)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(525, 430); await page.waitForTimeout(60)
  await page.mouse.click(575, 430); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.click('#btn-paint'); await page.waitForTimeout(80)
  // 펜 «점» 넷 — 슬롯별(왼쪽 벽판 위쪽에 나란히 · 사람 눈이 보게 굵게)
  const slots = [['pencil', '#2a2f36'], ['brush', '#164a9e'], ['marker', '#c0511e'], ['cp', '#1d5e2e']] as const
  for (let k = 0; k < 4; k++) {
    await page.evaluate(([i, h]) => {
      const b2 = (window as any).__b2
      b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w: 16 })
    }, slots[k]!)
    await pen(page, [[510 + k * 12, 398]])
  }
  // 손가락 탭 둘 — 벽 두 판 고름(강조가 화면에 남는다)
  await fingerTap(page, 525, 430)
  await fingerTap(page, 575, 430)
  // 펜 한 붓 — 바닥에서 출발해 두 벽판을 가로지른다(고른 집합 밖 바닥은 빈다)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('marker'); Object.assign(b2.app.paintSel, { hex: '#7a3030', w: 12 })
  })
  await pen(page, [[455, 470], [500, 452], [520, 447], [548, 440], [566, 434], [585, 430]])
  // 장면이 작다 — 판정대는 크게(줌 인 · 사진만의 일: 문서·판정 무변)
  await page.mouse.move(540, 440)
  for (let k = 0; k < 7; k++) { await page.mouse.wheel(0, -160); await page.waitForTimeout(80) }
  await page.waitForTimeout(400)
  saveBuf('67-gestures.png', await page.screenshot())
})

test('67-eraser.png — 칠한 면에 지우개로 글자 「ㄱ」', async ({ page }) => {
  test.setTimeout(300_000)
  await boot(page)
  // paint50의 큰 상자 — 오른쪽 벽 하나
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
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  // 마커로 벽을 채운다(가로 줄 여러 번)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('marker'); Object.assign(b2.app.paintSel, { hex: '#c9803a', w: 46 })
  })
  await page.click('#btn-paint'); await page.waitForTimeout(80)
  for (let y = 360; y <= 560; y += 34) {
    await pen(page, [[530, y], [640, y + 4], [750, y + 8], [860, y + 12]])
  }
  // 지우개(딱딱한)로 글자 「ㄱ」 — 가로획 + 오른쪽 세로획
  await page.click('#paint-erase'); await page.waitForTimeout(80)
  await page.evaluate(() => { (window as any).__b2.app.eraseSel.w = 22 })
  await pen(page, [[600, 410], [660, 415], [720, 421]])
  await pen(page, [[720, 421], [716, 470], [710, 520]])
  await page.waitForTimeout(300)
  saveBuf('67-eraser.png', await page.screenshot())
})
