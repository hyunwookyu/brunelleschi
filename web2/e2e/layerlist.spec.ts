// web2-25 4부의 화면 몫 — **겹: 요약/목록 · 솔로**.
//
// 사람의 문면: 「종이에 딸린 옐/트의 **토글 표시 역시 아직은 쓰기 불편**하게 되어 있다.」
// 왜 불편했는가: 겹이 34×28 짜리 작은 탭인데 그 안에 눈·자물쇠를 우겨넣었다. Procreate 의
// 레이어 행이 넉넉한 이유는 **가로로 길기 때문**이다.
//
//   ① 접힌 요약에 **수가 맞다**
//   ② 펼치면 목록이 나오고 각 줄의 눈·자물쇠가 **넓게 눌린다**(상자 실측)
//   ③ 길게 눌러 **솔로**가 되고 다시 눌러 돌아온다
//   ④ 솔로가 **3D에도 걸린다**(정한 대로 — D-W12 [6])
//   ⑤ 종이를 바꾸면 목록이 바뀐다(회귀 — layerbar.spec ⑥이 그 자리)
//
// 상태 값(켬/끔 배열·되돌리기·lifted 수)은 단위 팔(`test/solo.test.ts`)이 재고 여기서
// 겹쳐 재지 않는다 — 여기서 재는 것은 **손이 닿는가**다.

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

/** 카메라를 닫고 트레이싱지 셋을 얹는다(겹마다 획 하나) */
async function threeLayers(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-roll-tracing')
    await settle(page)
    await drawLine(page, 500, 560, 780 - i * 14, 486 + i * 6)
  }
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(3)
}

const openList = async (page: Page) => {
  if (await page.locator('#layer-list').count() === 0) {
    await page.click('#layer-summary'); await settle(page)
  }
}

/** 길게 누르기 — C.PAPER_LONGPRESS_MS(500) 위로 */
async function longPress(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await settle(page)
}

test('①② 접으면 요약(수) · 펼치면 목록 — 줄의 눈·자물쇠가 넓게 눌린다', async ({ page }) => {
  await threeLayers(page)
  // ① 평소에는 **요약 하나** — 롤 아이콘에 쌓인 수
  await expect(page.locator('#layer-summary')).toHaveCount(1)
  await expect(page.locator('#layer-summary .lsum-n')).toHaveText('3')
  await expect(page.locator('#layer-list')).toHaveCount(0)   // 기본은 접힘
  // ② 누르면 세로 목록이 내려온다 — 줄마다 [롤 아이콘 | 번호 | 눈 | 자물쇠 | ×]
  await page.click('#layer-summary'); await settle(page)
  await expect(page.locator('#layer-list .lrow')).toHaveCount(3)
  // 번호는 아래(먼저 얹은 것)부터 1이고 목록은 **나중 것이 위**다
  expect(await page.locator('#layer-list .lrow .lrow-n').allTextContents()).toEqual(['3', '2', '1'])
  // **줄이 넓다** — 손가락이 정확히 안 가도 된다(Procreate 레이어 행의 이유)
  const geo = await page.evaluate(() => {
    const row = document.querySelector('#layer-list .lrow')!.getBoundingClientRect()
    const eye = document.querySelector('#layer-list .lrow .leye')!.getBoundingClientRect()
    const lock = document.querySelector('#layer-list .lrow .llock')!.getBoundingClientRect()
    return { rowH: row.height, rowW: row.width, eye: [eye.width, eye.height], lock: [lock.width, lock.height] }
  })
  expect(geo.rowH).toBeGreaterThanOrEqual(34)   // 옛 탭은 28px 높이였다
  expect(geo.rowW).toBeGreaterThanOrEqual(190)  // 옛 탭은 34px 폭이었다
  expect(Math.min(...geo.eye)).toBeGreaterThanOrEqual(16)
  expect(Math.min(...geo.lock)).toBeGreaterThanOrEqual(16)
  // ⚠⚠ **줄의 «가운데»가 몸통이어야 한다** — 초판(min-width 148)은 눈이 가운데로 밀려
  //   «줄을 눌렀는데 켬/끔이 토글되는» 상태였고 전량 e2e가 그것을 잡았다(paper.spec ②·
  //   cost20.spec ⑩ — 활성이 안 바뀌었다). 「줄이 넓으니 손가락이 정확히 안 가도 된다」가
  //   이 팔이 지키는 요구다(지시 4-a).
  const mid = await page.evaluate(() => {
    const r = document.querySelector('#layer-list .lrow')!.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement
    return { inCtl: !!el.closest('.lctl'), inRow: !!el.closest('.lrow') }
  })
  expect(mid.inRow).toBe(true)
  expect(mid.inCtl, '줄 가운데가 눈·자물쇠가 아니다').toBe(false)
  // 다시 누르면 접힌다(연필통과 같은 어법)
  await page.click('#layer-summary'); await settle(page)
  await expect(page.locator('#layer-list')).toHaveCount(0)
})

test('③④ 길게 눌러 솔로 — 그것만 보이고 3D에도 걸린다 · 다시 눌러 돌아온다', async ({ page }) => {
  await threeLayers(page)
  const st = () => page.evaluate(() => {
    const a = (window as any).__b2.app
    return { on: a.doc.layers.map((l: any) => l.on), solo: a.solo?.layer ?? null, lifted: a.lift.lifted.size }
  })
  const before = await st()
  expect(before.on).toEqual([true, true, true])
  await openList(page)
  // 가운데 줄(번호 2)을 길게 누른다
  const rows = page.locator('#layer-list .lrow')
  await longPress(page, '#layer-list .lrow:nth-child(2)')
  const solo = await st()
  expect(solo.on).toEqual([false, true, false])
  expect(solo.solo).not.toBeNull()
  // ④ **3D에도 걸린다** — 꺼진 겹의 획이 빠진다(정한 대로 · D-W12 [6])
  expect(solo.lifted).toBeLessThan(before.lifted)
  // 화면이 그 사실을 말한다 — 줄에 솔로 표시 · 접어도 요약이 그것을 말한다
  await expect(rows.nth(1)).toHaveClass(/solo/)
  await expect(page.locator('#notice')).toContainText('만 보인다')
  await page.click('#layer-summary'); await settle(page)
  await expect(page.locator('#layer-summary')).toHaveClass(/solo/)
  // ③ 다시 길게 누르면 돌아온다
  await page.click('#layer-summary'); await settle(page)
  await longPress(page, '#layer-list .lrow:nth-child(2)')
  const back = await st()
  expect(back.on).toEqual([true, true, true])
  expect(back.solo).toBeNull()
  expect(back.lifted).toBe(before.lifted)
  await expect(page.locator('#layer-summary')).not.toHaveClass(/solo/)
})
