// 치수(web2-08 지시 4) 종단 — 진짜 입력으로: 리본 패널을 열고, **펜(마우스)으로 숫자를
// 써서** 스케일을 정하고, 그리는 동안 실시간 길이가 뜨고, 치수 스냅이 실제 길이를
// 맞추는가. 「화면의 선 · 패널의 숫자 · 확정된 3D 길이가 같아야 한다」(4-5)를 문면으로 잰다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  }
  await page.mouse.up()
  await settle(page)
}

/** 작도 + 기둥 — 기둥이 스케일의 기준 */
async function build(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  expect((await page.evaluate(() => (window as any).__b2.diag.summary())).lifted).toBe(3)
}

/** 패널 필기 칸에 세로획(«1») 하나를 긋는다 — x는 칸 안 상대좌표 */
async function writeOne(page: Page, relX: number) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('dim-ink')!.getBoundingClientRect()
    return { x: c.left, y: c.top }
  })
  await page.mouse.move(r.x + relX, r.y + 14)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(r.x + relX, r.y + 14 + i * 7)
  await page.mouse.up()
  await settle(page)
}

test('필기로 첫 치수 → 스케일 · 실시간 길이 · 셋의 일치', async ({ page }) => {
  await build(page)

  // 리본은 접혀 있다(기본) — 토글로 연다(4-3)
  expect(await page.$eval('#dimpanel', el => el.classList.contains('folded'))).toBe(true)
  await page.click('#dim-toggle')
  expect(await page.$eval('#dimpanel', el => el.classList.contains('folded'))).toBe(false)

  // 기둥이 지금 치수 창의 대상이다(마지막 획) — «11»을 써서 스케일을 정한다
  await writeOne(page, 60)
  await writeOne(page, 100)
  expect(await page.textContent('#dim-read')).toBe('11')
  const d1 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d1.mmPerUnit).not.toBeNull()              // 4-1: 첫 치수가 스케일을 정했다
  expect(d1.dims).toEqual([{ id: 4, dim: 11 }])
  expect(await page.textContent('#dim-live')).toBe('11 mm')

  // 다음 선 — 그리는 **동안** 패널에 실시간 길이가 뜬다(4-5)
  await page.mouse.move(500, 380)
  await page.mouse.down()
  await page.mouse.move(560, 366, { steps: 6 })
  await settle(page)
  const during = await page.textContent('#dim-live')
  expect(during).toMatch(/^\d+ mm$/)               // 그리는 중에 이미 실척이다
  await page.mouse.move(620, 352, { steps: 6 })
  await page.mouse.up()
  await settle(page)

  // 확정 후: 패널 숫자 == 확정 3D 길이(반올림 표시 규약 그대로)
  const d2 = await page.evaluate(() => (window as any).__b2.diag.dim())
  const live = await page.textContent('#dim-live')
  const shown = Number(live!.replace(' mm', ''))
  const solved = d2.lenOf[d2.target] as number
  expect(Math.abs(shown - solved)).toBeLessThanOrEqual(0.5)   // 표시는 정수 반올림
})

test('치수 스냅(4-7) — 실제 3D 길이가 눈금에 맞춰진다 · «다시 쓰면 대체»(4-2)', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')
  // «11» → 기둥 = 11 mm. ⚠ «1»(1mm)로 세우면 10mm 스냅이 끝점을 소실점 수렴 대역까지
  // 밀어 리프팅의 선분 매칭이 다른 직선을 잡는다 — 스냅 눈금은 스케일과 같은 자릿수여야
  // 뜻이 있다(실사용에서도 그렇다).
  await writeOne(page, 60)
  await writeOne(page, 100)
  await page.check('#chk-dimsnap')
  await page.selectOption('#dimsnap-step', '10')

  await drawLine(page, 500, 380, 620, 352)          // 기둥 끝 → vp0 축
  const d = await page.evaluate(() => (window as any).__b2.diag.dim())
  const mm = d.lenOf[d.target] as number
  expect(Math.abs(mm - Math.round(mm / 10) * 10)).toBeLessThan(1e-6)   // 실제 길이가 맞춰졌다

  // 그 선에 치수를 다시 쓴다 — 길이가 입력값으로 대체된다(4-2)
  await writeOne(page, 60)
  await writeOne(page, 100)                         // «11»
  await settle(page)
  const d2 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d2.lenOf[d.target]).toBeCloseTo(11, 6)
  expect(await page.textContent('#dim-live')).toBe('11 mm')
})

test('무스케일이면 숫자를 지어내지 않는다 — 스케일 전에는 «—»', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')
  // 스케일 전 — 그리는 동안에도 길이가 없다
  await page.mouse.move(500, 380)
  await page.mouse.down()
  await page.mouse.move(560, 366, { steps: 6 })
  await settle(page)
  expect(await page.textContent('#dim-live')).toBe('—')
  await page.mouse.up()
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.diag.dim().mmPerUnit)).toBeNull()
})
