// web2-70 ⛳ 사진 — CLOSING ⛔ 「사진은 게이트가 통과해도 그림이 나쁜 것을 잡는 유일한 수단」.
//   70-icons.png       쓰는 아이콘 전부를 한 판에(§3 — 화면에 있는 svg를 모아 격자로)
//   70-panels.png      모든 판을 연 합성 한 장 · 밝은 판(§4)
//   70-panels-dark.png 같은 것 · 어두운 판([data-theme=dark] — 사람이 뒤에 고른다 · 멈추지 않는다)
// 산출물은 stage0/out/shots70/ → tools/shots70-copy.mjs가 web2/shots/로 옮긴다(#104). dpr2 목록에 든다(screenshot).
import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots70')
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
/** 판을 전부 연다(합성 — R7 «한 번에 하나»를 사진을 위해 잠깐 무시하고 hidden만 푼다 · 저장 없음) */
async function openAll(page: Page) {
  await page.evaluate(() => {
    document.getElementById('btn-paint')!.click()
    ;(document.getElementById('pane-settings') as HTMLDetailsElement).open = true
    const dim = document.getElementById('dimpanel')!; if (dim.classList.contains('folded')) document.getElementById('dim-toggle')!.click()
  })
  await page.waitForTimeout(300)
  await page.evaluate(() => document.getElementById('paint-brush-btn')!.click())   // 브러시 목록은 마지막에(다른 통을 닫는 손잡이라)
  await page.waitForTimeout(400)
  await page.evaluate(() => { for (const id of ['display-pop', 'lens-pop']) { const e = document.getElementById(id); if (e) e.hidden = false } })   // 합성 — 사진을 위해 hidden만 푼다(자 통은 렌즈와 같은 자리라 뺀다)
  await page.waitForTimeout(200)
}

test.describe.configure({ mode: 'serial' })

test('70-icons.png — 쓰는 아이콘 전부를 한 판에(격자 · 이름 아래)', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const seen = new Map<string, string>()
    for (const s of Array.from(document.querySelectorAll('svg'))) {
      if (s.closest('#boot') || s.closest('#icon-sheet')) continue
      const key = s.getAttribute('class') || (s.closest('[id]') as HTMLElement | null)?.id || s.outerHTML.slice(0, 40)
      if (!seen.has(key)) seen.set(key, s.outerHTML)
    }
    const sheet = document.createElement('div'); sheet.id = 'icon-sheet'
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99;background:var(--panel);color:var(--ink);display:grid;grid-template-columns:repeat(10,1fr);gap:var(--gap);padding:calc(2*var(--gap));overflow:auto;font:var(--fs-num) var(--font);align-content:start'
    for (const [k, html] of seen) {
      const cell = document.createElement('div'); cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:var(--gap-in);min-height:64px'
      const box = document.createElement('div'); box.style.cssText = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center'; box.innerHTML = html
      const sv = box.querySelector('svg')!; sv.removeAttribute('width'); sv.removeAttribute('height'); (sv as unknown as HTMLElement).style.cssText = 'width:100%;height:100%'
      const lab = document.createElement('span'); lab.textContent = k.replace(/^ico\s*/, '').replace(/^lucide-/, '').slice(0, 18); lab.style.cssText = 'color:var(--ink-2);font-variant-numeric:tabular-nums'
      cell.append(box, lab); sheet.append(cell)
    }
    document.body.append(sheet)
  })
  await page.waitForTimeout(200)
  const n = await page.evaluate(() => document.querySelectorAll('#icon-sheet svg').length)
  console.log(`[70-icons] 아이콘 ${n}`)
  saveBuf('70-icons.png', await page.screenshot())
  await page.evaluate(() => document.getElementById('icon-sheet')?.remove())
})

test('70-panels.png — 모든 판을 연 합성 · 밝은 판 / 70-panels-dark.png — 같은 것 · 어두운 판', async ({ page }) => {
  await boot(page)
  await openAll(page)
  saveBuf('70-panels.png', await page.screenshot())
  await page.evaluate(() => (window as any).__b2.diag.setThemeForTest('dark'))
  await page.waitForTimeout(300)
  const dark = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), panel: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() }))
  console.log(`[70-panels-dark] theme ${dark.theme} · --panel ${dark.panel}`)
  expect(dark.theme).toBe('dark')
  saveBuf('70-panels-dark.png', await page.screenshot())
  await page.evaluate(() => (window as any).__b2.diag.setThemeForTest('light'))
})
