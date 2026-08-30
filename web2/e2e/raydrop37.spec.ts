// web2-37 4번 — **화면 몫**: 브라우저에서 실제로 돌려 대기 획이 사라지는가, 이동에서는
// 남는가, **경고가 안 뜨는가**. 기하는 단위 팔(`test/raydrop37.test.ts`)이 잰다.
//
// ⚠ 「사라진다」만 재면 **전부 지우는 판**에서도 초록이다 — 이동 칸이 그 판을 빨갛게 한다.

import { test, expect, type Page } from '@playwright/test'

const B2 = (page: Page) => page.evaluate(() => {
  const app = (window as never as { __b2: { app: { doc: { strokes: unknown[] }; lift: { waiting: number[]; lifted: Map<number, unknown> } } } }).__b2.app
  return { strokes: app.doc.strokes.length, waiting: app.lift.waiting.length, lifted: app.lift.lifted.size }
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

async function scene(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)     // 지평선
  await drawLine(page, 500, 500, 600, 475)      // vp0
  await drawLine(page, 500, 500, 400, 475)      // vp1
  await drawLine(page, 500, 500, 500, 300)      // 세로 — 3D가 선다
  await drawLine(page, 240, 200, 330, 165)      // 허공의 자유 획 — 대기
}

test('궤도 후 대기 획이 사라지고 승격 획은 남는다 · 경고가 안 뜬다', async ({ page }) => {
  await scene(page)
  const before = await B2(page)
  expect(before.waiting, '대기 획이 있어야 이 팔이 무엇이든 잰다').toBeGreaterThan(0)
  expect(before.lifted).toBeGreaterThan(0)

  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(880, 460, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(120)

  const after = await B2(page)
  expect(after.waiting, '대기는 간다').toBe(0)
  expect(after.lifted, '승격은 그대로다').toBe(before.lifted)
  expect(after.strokes).toBe(before.strokes - before.waiting)

  // **조용해야 한다** — 경고도 확인 대화도 뜨지 않는다(지시 문면).
  // ⚠ `#notice`는 **늘 있는 빈 줄**이다(`notice.ts` — 「평소에는 비어 있다」). 그러므로
  //    존재를 세면 안 되고 **내용**을 본다. 밑줄 선택지(`u[data-pick]`)는 물음의 서명이다.
  expect((await page.locator('#notice').textContent())?.trim() ?? '', '알림 줄이 비어 있다').toBe('')
  expect(await page.locator('#notice u[data-pick]').count(), '물음이 안 떠 있다').toBe(0)
  const dialogs = await page.locator('dialog[open], [role="alertdialog"], [role="dialog"]').count()
  expect(dialogs, '어떤 대화상자도 안 뜬다').toBe(0)
})

test('⚠ 확대에서는 남는다 — 이 칸이 «전부 지우는 판»을 빨갛게 한다', async ({ page }) => {
  // ⚠ 여기서 재는 것은 **확대**뿐이다(휠이 앱에 실제로 배선된 손잡이라서다).
  //    이동(팬)은 손가락 둘·스페이스 끌기라 화면 팔로는 흔들리므로 단위 팔이 잰다
  //    (`test/raydrop37.test.ts`의 「이동·확대에서는 남는다」·「화면평면을 따라간다」).
  await scene(page)
  const before = await B2(page)
  expect(before.waiting).toBeGreaterThan(0)
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(120)
  const after = await B2(page)
  expect(after.waiting, '확대는 광선을 안 바꾼다').toBe(before.waiting)
  expect(after.strokes).toBe(before.strokes)
})
