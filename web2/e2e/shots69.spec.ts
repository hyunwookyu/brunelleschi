// web2-69 ⛳ 사진 — 사람 눈의 판정대(CLOSING · CHAIN6).
//   69-before.png  기본 상태(새 문서 · 연필) — 옮기기 «전»(트리 64f878e에서 한 번 찍었다 · SHOT69_BEFORE=1일 때만 돈다 — 그 뒤 트리에서는 뜻이 없다)
//   69-after.png   기본 상태 — 옮긴 «뒤»
//   69-paint.png   칠 도구를 든 상태 — 옮긴 뒤
// ⚠ #104: PNG는 stage0/out/shots69/에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots69-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots69')
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
  await page.waitForTimeout(300)
  mkdirSync(OUTDIR, { recursive: true })
}

test('69-before.png — 옮기기 전 기본 상태(한 번 · SHOT69_BEFORE=1)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2' || process.env.SHOT69_BEFORE !== '1', '옮기기 전 트리에서 한 번 찍는 사진')
  await boot(page)
  saveBuf('69-before.png', await page.screenshot())
})

test('69-after.png — 옮긴 뒤 기본 상태 · 69-paint.png — 칠 도구를 든 상태', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진은 dpr1 하나')
  await boot(page)
  saveBuf('69-after.png', await page.screenshot())
  await page.click('#btn-paint'); await page.waitForTimeout(300)
  saveBuf('69-paint.png', await page.screenshot())
})
