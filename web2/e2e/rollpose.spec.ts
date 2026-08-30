// web2-25 2부의 화면 몫 — **롤이 시점을 굳힌다**(지금 사는 결함).
//
// 사람의 문면: 「시점을 돌려보다가 … 롤 모양 아이콘을 눌렀을 때 **옐/트가 추가는 되지만
// 화면에 보이지 않는 문제.**」
//
//   ① 돌린 시점에서 롤 → 종이가 하나 늘고 **그 시점에서 막이 보인다**(픽셀)
//   ⓪ 재현(D-2) — 굳히지 않는 경로(`diag.layerAdd`)로 얹으면 **막 픽셀이 0**이다
//   ② 활성 종이의 시점 그대로면 종이가 **안 는다**(작도 시점에서 롤)
//
// 상태(종이 수·겹의 소속)와 저장·복원은 단위 팔(`test/rollpose.test.ts`)이 값으로 재고
// 여기서 겹쳐 재지 않는다 — 여기서 재는 것은 **화면에 보이는가** 하나다.

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

/** 지면 삼각형 — 카메라가 닫힌다(겹은 그 뒤에만 얹힌다 — web2-20 2-a) */
async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  expect(s.lifted).toBe(3)
}

/** 궤도 — 중버튼 끌기(cost20 orbitFrames와 **같은 몸짓**) */
async function orbit(page: Page) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
}

/** 막(#film)에 실제로 칠해진 픽셀 수 — 알파로 센다(색조·섬유의 절대 밝기 ⛔ #74 ㉡:
 *  여기서 묻는 것은 «그려졌는가»이지 «얼마나 어두운가»가 아니므로 알파가 옳은 채널이다). */
function filmPainted(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('film') as HTMLCanvasElement
    if (!c || c.width === 0) return 0
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const d = t.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) n++
    return n
  })
}

const state = (page: Page) => page.evaluate(() => {
  const app = (window as any).__b2.app
  return {
    sheets: app.doc.sheets.length,
    active: app.activeSheet,
    layers: app.doc.layers.map((l: any) => ({ id: l.id, sheet: l.sheet, paper: l.paper })),
  }
})

test('⓪ 재현(D-2) — 굳히지 않고 얹으면 겹은 늘고 막 픽셀은 0이다', async ({ page }) => {
  await boot(page)
  await orbit(page)
  const before = await state(page)
  // 굳히지 않는 경로 — 원장 하네스가 쓰는 `diag.layerAdd`(앱과 같은 `addLayer`를 부르되
  // 앞처리 없이). 이것이 web2-25 이전의 롤이 하던 일 그대로다.
  await page.evaluate(() => (window as any).__b2.diag.layerAdd('yellow'))
  await settle(page)
  const after = await state(page)
  expect(after.layers.length).toBe(before.layers.length + 1)   // «추가는 된다»
  expect(after.sheets).toBe(before.sheets)                     // 종이는 안 늘었다
  expect(await filmPainted(page)).toBe(0)                      // «그런데 안 보인다»
})

test('① 돌린 시점에서 롤 → 종이가 하나 늘고 그 시점에서 막이 보인다', async ({ page }) => {
  await boot(page)
  await orbit(page)
  const before = await state(page)
  expect(await filmPainted(page)).toBe(0)                      // 얹기 전에는 막이 없다
  await page.click('#btn-roll'); await page.click('#btn-roll-yellow')
  await settle(page)
  const after = await state(page)
  expect(after.sheets).toBe(before.sheets + 1)                 // 시점이 종이로 굳었다
  expect(after.active).not.toBe(before.active)
  // 새 겹이 **그 새 종이**에 붙었다
  const lay = after.layers[after.layers.length - 1]!
  expect(lay.sheet).toBe(after.active)
  expect(lay.paper).toBe('yellow')
  // 그리고 **보인다** — 이것이 이 부의 요구다
  expect(await filmPainted(page)).toBeGreaterThan(1000)
})

test('② 활성 종이의 시점 그대로면 종이가 안 는다 — 작도 시점에서 롤', async ({ page }) => {
  await boot(page)
  const before = await state(page)
  await page.click('#btn-roll'); await page.click('#btn-roll-tracing')
  await settle(page)
  const after = await state(page)
  expect(after.sheets).toBe(before.sheets)                     // 안 는다
  expect(after.active).toBe(before.active)
  expect(after.layers.length).toBe(before.layers.length + 1)
  expect(await filmPainted(page)).toBeGreaterThan(1000)        // 그리고 보인다(작도 시점)
})
