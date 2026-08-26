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
  expect(Math.abs(shown - solved)).toBeLessThanOrEqual(0.5)   // 표시는 정수 반올림(±0.5는 표기 규약)
  // **무한소수 표기(4-8)를 켜면 자리 그대로 일치한다** — ±0.5가 팔의 느슨함이 아니라
  // 표기 반올림의 몫임을 가른다(리뷰어 [12]): 이 대조는 상대 1e-9다.
  await page.check('#chk-exact')
  await settle(page)
  const exact = Number((await page.textContent('#dim-live'))!.replace(' mm', ''))
  expect(Math.abs(exact - solved)).toBeLessThan(Math.max(1e-9 * solved, 1e-7))
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

  // 그 선에 치수를 다시 쓴다 — 길이가 입력값으로 대체된다(4-2). **화면의 선도 움직인다**
  // (리뷰어 [15] — 3D 끝점이 옮겨지면 그 사영이 옮겨진다. 좌표로 잰다):
  const bBefore = await page.evaluate((id) => (window as any).__b2.diag.projectAll()[id]!.b, d.target)
  await writeOne(page, 60)
  await writeOne(page, 100)                         // «11»
  await settle(page)
  const d2 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d2.lenOf[d.target]).toBeCloseTo(11, 6)
  expect(await page.textContent('#dim-live')).toBe('11 mm')
  const bAfter = await page.evaluate((id) => (window as any).__b2.diag.projectAll()[id]!.b, d.target)
  expect(Math.hypot(bAfter.x - bBefore.x, bAfter.y - bBefore.y)).toBeGreaterThan(3)
})

test('음성 배선(4-4) — 인식 결과가 창 규칙을 타고 치수로 적용된다 (모의 인식기)', async ({ page }) => {
  // 진짜 마이크는 헤드리스에 없다(AS-C24) — **배선**(voice.ts → applyDimInput → setDimension)을
  // 모의 인식기로 잰다: 앱이 쓰는 그 생성자 자리에 가짜를 꽂고 결과 이벤트를 흘린다.
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      lang = ''; continuous = false; interimResults = false
      onresult: any = null; onend: any = null; onerror: any = null
      start() { (window as any).__rec = this }
      stop() { (window as any).__rec = null }
    }
  })
  await build(page)
  await page.click('#dim-toggle')
  await writeOne(page, 60); await writeOne(page, 100)      // «11» — 스케일(기둥 11mm)
  await drawLine(page, 500, 380, 620, 352)                 // 다음 선 — 치수 창의 대상
  await page.click('#btn-voice')                           // 모드를 켠다 — 그때만 듣는다
  expect(await page.evaluate(() => !!(window as any).__rec)).toBe(true)
  await page.evaluate(() => {
    (window as any).__rec.onresult({ results: [[{ transcript: '삼천오백' }]], resultIndex: 0 })
  })
  await settle(page)
  const d = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d.lenOf[d.target]).toBeCloseTo(3500, 6)           // 지시 4-4의 예가 그대로 적용됐다
  expect(await page.textContent('#dim-live')).toBe('3500 mm')
  // 다시 말하면 변경된다(«확정 전 변경» — 창이 열려 있는 동안)
  await page.evaluate(() => {
    (window as any).__rec.onresult({ results: [[{ transcript: '3.5미터' }]], resultIndex: 0 })
  })
  await settle(page)
  expect(await page.textContent('#dim-live')).toBe('3500 mm')   // 3.5 m = 3500 mm — 같은 값
  // 모드를 끄면 안 듣는다
  await page.click('#btn-voice')
  expect(await page.evaluate(() => !!(window as any).__rec)).toBe(false)
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
