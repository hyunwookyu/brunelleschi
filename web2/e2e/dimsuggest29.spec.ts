// web2-29 2단계 — **화면** 게이트. 단위 팔이 상태를 재고, 여기서는 **손이 실제로 걷는
// 길**을 잰다: 그냥 숫자를 썼을 때 화면이 어떻게 되는가.
//
// 핵심 순서(지시 문면): **기본은 그림이고, 치수는 제안이다.**

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  await drawLine(page, 500, 560, 500, 700)      // 치수를 매길 세로선
}

/** 「1」을 세로획 곁에 쓴다 — 인식기가 한 획 세로선을 «1»로 읽는다(단위 팔 ①의 20/20) */
async function writeOne(page: Page, x: number, y: number) {
  await drawLine(page, x, y, x, y + 28)
}

const suggestText = (page: Page) =>
  page.evaluate(() => {
    const el = document.getElementById('dimsuggest') as HTMLElement
    return el.hidden ? null : el.textContent
  })

test('① 숫자를 써도 자동으로 안 바뀐다 — 제안만 뜬다', async ({ page }) => {
  await boot(page)
  const before = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.strokes.length, dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).length }
  })
  await writeOne(page, 540, 680)
  await page.waitForFunction(() => !(document.getElementById('dimsuggest') as HTMLElement).hidden,
    undefined, { timeout: 5000 })
  const after = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return {
      n: a.doc.strokes.length,
      dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).length,
      sug: a.dimSuggest,
    }
  })
  console.log(`[29-2 화면 ①] 제안 "${await suggestText(page)}" · 획 ${before.n} → ${after.n} · 치수 ${before.dims} → ${after.dims}`)
  expect(after.sug, '제안이 섰다').not.toBeNull()
  expect(after.n, '손글씨가 문서에 그대로 있다').toBe(before.n + 1)
  expect(after.dims, '**자동으로 안 바뀐다**').toBe(before.dims)
  // 선택지 둘이 있다 — 받는다 / 무시
  expect(await page.locator('#dimsuggest u').count()).toBe(2)
})

test('② 무시하면 획으로 남는다 · 받으면 그때 바뀐다', async ({ page }) => {
  await boot(page)
  await writeOne(page, 540, 680)
  await page.waitForFunction(() => !(document.getElementById('dimsuggest') as HTMLElement).hidden,
    undefined, { timeout: 5000 })
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await page.click('#dimsuggest u[data-pick="no"]')
  await settle(page)
  const ignored = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.strokes.length, hidden: (document.getElementById('dimsuggest') as HTMLElement).hidden,
      dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).length }
  })
  console.log(`[29-2 화면 ②] 무시 — 획 ${n1} → ${ignored.n} · 제안 숨김 ${ignored.hidden} · 치수 ${ignored.dims}`)
  expect(ignored.n, '획이 그대로 남는다').toBe(n1)
  expect(ignored.hidden).toBe(true)
  expect(ignored.dims).toBe(0)

  // 다시 써서 이번엔 받는다
  await writeOne(page, 600, 680)
  await page.waitForFunction(() => !(document.getElementById('dimsuggest') as HTMLElement).hidden,
    undefined, { timeout: 5000 })
  const n2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await page.click('#dimsuggest u[data-pick="yes"]')
  await settle(page)
  const taken = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.strokes.length, dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).length,
      hidden: (document.getElementById('dimsuggest') as HTMLElement).hidden }
  })
  console.log(`[29-2 화면 ②] 받음 — 획 ${n2} → ${taken.n} · 치수 ${taken.dims} · 제안 숨김 ${taken.hidden}`)
  expect(taken.n, '손글씨가 걷힌다').toBeLessThan(n2)
  // ⚠ **무시했던 획은 안 걷힌다** — 그 말이 남는다(`dimIgnored`). 걷히는 것은 이번 묶음뿐이다.
  expect(taken.n, '무시한 획은 그림으로 남는다').toBe(n2 - 1)
  expect(taken.dims, '치수가 선다').toBe(1)
  expect(taken.hidden).toBe(true)
})

test('③ 옐로에서는 제안이 안 뜬다 (+분해능: 트레이싱지에서는 뜬다)', async ({ page }) => {
  await boot(page)
  // 트레이싱지 — 분해능(같은 실행에서 실제로 뜬다)
  await page.click('#btn-roll-tracing')
  await settle(page)
  await writeOne(page, 540, 680)
  await page.waitForFunction(() => !(document.getElementById('dimsuggest') as HTMLElement).hidden,
    undefined, { timeout: 5000 })
  console.log(`[29-2 화면 ③] 트레이싱지 — "${await suggestText(page)}"`)
  await page.click('#dimsuggest u[data-pick="no"]')
  await settle(page)
  // 옐로 — 자유 스케치다. 거기 숫자는 치수가 아니라 **메모**다.
  await page.click('#btn-roll-yellow')
  await settle(page)
  await writeOne(page, 560, 680)
  await page.waitForTimeout(1500)              // 인식이 돌 시간을 넉넉히 준다
  const yellow = await page.evaluate(() => ({
    hidden: (document.getElementById('dimsuggest') as HTMLElement).hidden,
    sug: (window as any).__b2.app.dimSuggest,
  }))
  console.log(`[29-2 화면 ③] 옐로 — 제안 숨김 ${yellow.hidden} · sug ${JSON.stringify(yellow.sug)}`)
  expect(yellow.hidden, '옐로에서는 안 뜬다').toBe(true)
  expect(yellow.sug).toBeNull()
})

test('④ 1단계 경로가 계속 작동한다 — 도구를 골라서 쓰기', async ({ page }) => {
  await boot(page)
  await page.click('#dim-toggle')
  await page.click('#btn-dim-write')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('dim')
  await page.mouse.click(500, 620)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.dimPick)).not.toBeNull()
  await drawLine(page, 300, 300, 300, 340)
  const st = await page.evaluate(() => ({
    ink: (window as any).__b2.app.dimInk.length,
    sug: (window as any).__b2.app.dimSuggest,
  }))
  console.log(`[29-2 화면 ④] 1단계 — 손글씨 ${st.ink} · 2단계 제안 ${JSON.stringify(st.sug)}`)
  expect(st.ink, '1단계의 손글씨로 들어간다').toBe(1)
  expect(st.sug, '2단계 제안은 안 끼어든다(모드가 있을 때는 그쪽이 진다)').toBeNull()
})
