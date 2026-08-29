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

const acq = (page: Page) => page.evaluate(() => (window as any).__b2.diag.extAcq())

test('30-11 선언 — **왕복**을 해야 서고, 획을 확정하면 비워진다 · 표식이 화면에 남는다', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await fixture(page)

  // 승격 획 하나의 화면 두 끝을 앱에게 물어본다(좌표를 손으로 짓지 않는다)
  const seg = await page.evaluate(() => {
    const b = (window as any).__b2
    const proj = b.diag.projectAll()
    const v = b.app.view
    const on = (p: { x: number; y: number }) => p.x > 60 && p.x < 1140 && p.y > 60 && p.y < 740
    for (const k of Object.keys(proj)) {
      const p = proj[k]
      if (!p) continue
      const a = { x: p.a.x * v.s + v.ox, y: p.a.y * v.s + v.oy }
      const bb = { x: p.b.x * v.s + v.ox, y: p.b.y * v.s + v.oy }
      if (on(a) && on(bb) && Math.hypot(bb.x - a.x, bb.y - a.y) > 120) return { id: Number(k), a, b: bb }
    }
    return null
  })
  expect(seg, '길고 화면 안에 든 승격 획이 있다').not.toBeNull()

  // ② **스치기만 해서는 안 선다**(종전 머무름 획득이 여기서 섰다 — 지금은 안 선다)
  await page.mouse.move(seg!.b.x, seg!.b.y)
  await page.waitForTimeout(700)
  await settle(page)
  expect((await acq(page)).acquired.length, '호버로는 한 번도 안 선다').toBe(0)

  // ③ **왕복** — 획을 시작한 뒤 그 선 방향으로 나갔다가 돌아온다
  const ux = (seg!.b.x - seg!.a.x) / Math.hypot(seg!.b.x - seg!.a.x, seg!.b.y - seg!.a.y)
  const uy = (seg!.b.y - seg!.a.y) / Math.hypot(seg!.b.x - seg!.a.x, seg!.b.y - seg!.a.y)
  const sx = (seg!.a.x + seg!.b.x) / 2, sy = (seg!.a.y + seg!.b.y) / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let k = 1; k <= 12; k++) await page.mouse.move(sx + ux * 12 * k, sy + uy * 12 * k)
  const outed = await acq(page)
  expect(outed.acquired.length, '나가는 길에는 아직 선언이 없다').toBe(0)
  for (let k = 1; k <= 12; k++) await page.mouse.move(sx + ux * (144 - 10 * k), sy + uy * (144 - 10 * k))
  await settle(page)
  const got = await acq(page)
  console.log(`[30-11 e2e] 왕복 뒤 — acquired ${JSON.stringify(got.acquired)} · farD ${got.farD.toFixed(1)}`)
  expect(got.acquired.length, '왕복하면 선언된다').toBe(2)
  expect(got.acquired[0].id, '그 선이 선언됐다').toBe(seg!.id)

  // 표식 — 선언한 것이 손에 보여야 한다. 그 끝 둘레의 픽셀이 실제로 달라진다.
  const R = 12
  const clip = { x: Math.round(seg!.b.x) - R, y: Math.round(seg!.b.y) - R, width: R * 2, height: R * 2 }
  const marked = (await page.screenshot({ clip })).toString('base64')

  // ⑤ 확정하면 비워진다
  await page.mouse.up()
  await settle(page)
  expect((await acq(page)).acquired.length, '획을 확정하면 선언이 비워진다').toBe(0)
  const cleared = (await page.screenshot({ clip })).toString('base64')
  expect(marked, '선언 중과 확정 뒤의 화면이 다르다(표식이 실제로 있었다)').not.toBe(cleared)
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
