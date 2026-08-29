// web2-18 2부의 **손에 닿는 표면** — 획득이 실제로 일어나는가 · 표식이 보이는가 ·
// 확정하면 비워지는가 · 진단 패널이 「어떤 오스냅이었나」를 말하는가(2-c).
//
// 기전의 팔은 단위다(test/osnap.test.ts 연장선 ①~⑤ · test/extacq_measure.test.ts 분포).
// 여기는 **사람이 만지는 경로**다: 실제 포인터가 끝점 위에 머물러야 획득된다.

import { test, expect, type Page } from '@playwright/test'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 카메라를 닫고 승격 획 하나를 남긴다 — 그 끝점이 획득 대상이다 */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(500, 500); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(500 + 12 * i, 500 - 3 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(500, 500); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(500 - 12 * i, 500 - 3 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(500, 500); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(500, 500 - 18 * i)
  await page.mouse.up(); await settle(page)
}

/** 그 자리에 머문다 — 브라우저 시계로 ms만큼(포인터는 안 움직인 채 미세 이동으로 갱신) */
async function dwell(page: Page, x: number, y: number, ms: number) {
  await page.mouse.move(x, y)
  const t0 = Date.now()
  // 머무름 판정은 «같은 끝점 위에 있었나»이므로 반경 안 미세 이동은 머무름을 안 깬다
  while (Date.now() - t0 < ms) { await page.mouse.move(x, y); await settle(page) }
  await page.mouse.move(x, y)
  await settle(page)
}

const acq = (page: Page) => page.evaluate(() => (window as any).__b2.diag.extAcq())

test('③⑤ 획득 — 끝점에 머물러야 서고, 획을 확정하면 비워진다 · 표식이 화면에 남는다', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await fixture(page)

  // 승격 획의 끝점 하나를 앱에게 물어본다(좌표를 손으로 짓지 않는다)
  const endPt = await page.evaluate(() => {
    const b = (window as any).__b2
    const proj = b.diag.projectAll()
    const v = b.app.view
    for (const k of Object.keys(proj)) {
      const p = proj[k]
      if (!p) continue
      const s = { x: p.b.x * v.s + v.ox, y: p.b.y * v.s + v.oy }
      if (s.x > 60 && s.x < 1140 && s.y > 60 && s.y < 740) return { id: Number(k), ...s }
    }
    return null
  })
  expect(endPt, '승격 획의 끝점이 화면 안에 있다').not.toBeNull()

  // ② 획득 전 — 지나가기만 해서는 안 선다
  await page.mouse.move(endPt!.x, endPt!.y)
  await settle(page)
  expect((await acq(page)).acquired.length, '스치기만 해서는 획득이 안 된다').toBe(0)

  // 표식이 아직 없는 기준 화면
  const R = 12
  const clip = { x: Math.round(endPt!.x) - R, y: Math.round(endPt!.y) - R, width: R * 2, height: R * 2 }
  const before = (await page.screenshot({ clip })).toString('base64')

  // ③ 머무름 — EXT_ACQUIRE_MS를 넉넉히 넘긴다
  const ms = await page.evaluate(() => (window as any).__b2.app.osnap && 400)
  await dwell(page, endPt!.x, endPt!.y, ms + 250)
  const got = await acq(page)
  expect(got.acquired.length, '머무르면 획득된다').toBeGreaterThan(0)
  expect(got.acquired[0].id, '그 획의 끝이 획득됐다').toBe(endPt!.id)

  // 표식(2-b) — 획득한 것이 손에 보여야 한다. 픽셀이 실제로 달라진다.
  const after = (await page.screenshot({ clip })).toString('base64')
  expect(after, '획득 표식이 화면에 나타난다').not.toBe(before)

  // ⑤ 확정하면 비워진다
  await page.mouse.move(300, 620); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(300 + 10 * i, 620 - 2 * i)
  await page.mouse.up(); await settle(page)
  expect((await acq(page)).acquired.length, '획을 확정하면 획득이 비워진다').toBe(0)
})

test('2-c 진단 패널 — 「어떤 오스냅이었나」를 앱이 말한다', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await fixture(page)

  // 끝점에 붙여 한 획을 확정한다 — 시작 스냅이 실제로 잡히는 자리
  await page.mouse.move(500, 320); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(500 + 14 * i, 320 + 4 * i)
  await page.mouse.up(); await settle(page)

  const last = await page.evaluate(() => (window as any).__b2.diag.lastSnap())
  expect(last, '마지막 확정 획의 스냅 종류가 기록된다').not.toBeNull()

  await openDiag(page)
  const panel = page.locator('#diagpanel')
  await expect(panel).toContainText('마지막 획 스냅')
  await expect(panel).toContainText('지금 호버 스냅')
  await expect(panel).toContainText('연장선 획득')
  // 값은 앱이 실제로 쓴 kind 그대로다(표시용으로 다시 계산하지 않는다 — 원칙 a)
  if (last.start) await expect(panel).toContainText(`시작 ${last.start}`)
  await expect(panel).toContainText('머무름 400ms · 상한 2배')
})
