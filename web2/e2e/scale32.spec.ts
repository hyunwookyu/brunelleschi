// 축척 · 재기 · 어긋남(web2-32 5·6·7번) 종단 — **화면으로** 잰다.
//
// 32-5는 새 기제를 안 만들었다(`lift.scaleOf` + `doc.scaleRef`가 이미 그 규칙이다).
// 그래서 이 팔이 재는 것은 **「미정 → 확정 → 다시 미정」의 왕복이 화면에 나오는가**다 —
// 그 왕복을 아무도 안 재고 있었다는 것이 이 항목의 실제 구멍이었다.

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

const tap = async (page: Page, x: number, y: number) => {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
}

const dimState = (page: Page) => page.evaluate(() => (window as any).__b2.diag.dim())
const screen = (page: Page) => page.evaluate(() => (window as any).__b2.diag.projectAll())

/** 작도 + 길이가 **다른** 기둥 둘 — 32-7 지시의 픽스처(「서로 다른 길이의 두 선」) */
async function build(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)     // 기둥 A
  await drawLine(page, 600, 475, 600, 400)     // 기둥 B
  const ids = await page.evaluate(() => Object.keys((window as any).__b2.diag.projectAll()).map(Number))
  expect(ids.length).toBeGreaterThanOrEqual(4)
  return { post: ids[ids.length - 2]!, post2: ids[ids.length - 1]! }
}

test('32-5 ① 치수가 없으면 축척이 미정이다 — 화면이 그렇게 말한다', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')
  expect(await page.getAttribute('#dim-scale', 'data-scale')).toBe('unset')
  expect(await page.textContent('#dim-scale')).toBe('축척 미정')
  expect((await dimState(page)).mmPerUnit).toBeNull()
  expect((await dimState(page)).scaleId).toBeNull()
})

test('32-5 ② 첫 치수가 확정으로 바꾼다 — 비가 수치로 · 어느 치수가 정했는지 나온다', async ({ page }) => {
  const { post } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  expect(await page.getAttribute('#dim-scale', 'data-scale')).toBe('set')
  const text = (await page.textContent('#dim-scale'))!
  expect(text).toMatch(/^축척 1단위 = [0-9.]+ mm · 기준 2400 mm$/)   // 값 + 「어느 치수」
  const st = await dimState(page)
  expect(st.scaleId).toBe(post)
  expect(st.mmPerUnit).toBeGreaterThan(0)
})

test('32-5 ③ 첫 치수를 지우면 미정으로 돌아가고 다음 치수가 새로 정한다 (왕복)', async ({ page }) => {
  const { post, post2 } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  expect(await page.getAttribute('#dim-scale', 'data-scale')).toBe('set')

  // 그 획을 지운다 — **별도 조작을 안 만들었다**(지시 문면): 치수를 지우는 길은
  // 그 획을 지우거나 고치는 것뿐이다. 지우개로 기둥 A를 문지른다.
  await page.click('#btn-eraser-pencil')
  const s = await screen(page)
  const seg = s[String(post)]!
  await page.mouse.move(seg.a.x, (seg.a.y + seg.b.y) / 2)
  await page.mouse.down()
  await page.mouse.move(seg.a.x + 2, (seg.a.y + seg.b.y) / 2)
  await page.mouse.up()
  await settle(page)
  expect(await page.getAttribute('#dim-scale', 'data-scale')).toBe('unset')
  expect(await page.textContent('#dim-scale')).toBe('축척 미정')

  // 다음 치수가 새로 정한다
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 1800), post2)
  await settle(page)
  expect(await page.getAttribute('#dim-scale', 'data-scale')).toBe('set')
  expect((await dimState(page)).scaleId).toBe(post2)
})

test('32-7 어긋남 — 둘째 치수에서 뜨고, 맞는 값에서는 안 뜬다(D-3 반증)', async ({ page }) => {
  const { post, post2 } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  // 치수가 하나뿐일 때 — 어긋남이 없다(그 획이 축척의 분모였다)
  expect(await page.locator('#dim-skew').isHidden()).toBe(true)
  const before = await dimState(page)
  expect(before.skew.find((k: any) => k.id === post).off).toBe(false)

  // 둘째 치수에 **맞는 값**을 준다 — 여전히 조용하다(반증 조건)
  const trueMm = (await dimState(page)).lenOf[String(post2)]
  await page.evaluate(([id, mm]) => (window as any).__b2.diag.setDimForTest(id, mm), [post2, trueMm] as const)
  await settle(page)
  expect(await page.locator('#dim-skew').isHidden()).toBe(true)
  expect((await dimState(page)).skew.find((k: any) => k.id === post2).off).toBe(false)

  // 이제 **어긋나는 값**을 준다 — 비가 1.5다
  await page.evaluate(([id, mm]) => (window as any).__b2.diag.setDimForTest(id, mm), [post2, trueMm * 1.5] as const)
  await settle(page)
  const k = (await dimState(page)).skew.find((x: any) => x.id === post2)
  expect(k.ratio).toBeCloseTo(1.5, 3)
  expect(k.off).toBe(true)
  // **고치지 않는다** — 적은 값이 그대로 남는다
  expect((await dimState(page)).dims.find((d: any) => d.id === post2).dim).toBeCloseTo(trueMm * 1.5, 3)
  // 화면 줄이 뜬다(치수 숫자를 짚어 «지금 고른 치수»로 만든 뒤)
  const pos = await page.evaluate((id) => (window as any).__b2.diag.dimLabelPosForTest(id), post2)
  await tap(page, pos.x, pos.y)
  expect(await page.locator('#dim-skew').isHidden()).toBe(false)
  expect(await page.textContent('#dim-skew')).toContain('적은 값과 잰 값이 다르다')
})

test('32-6 재기 — 기본은 패널에 표시만이고 도면에 아무것도 안 남는다', async ({ page }) => {
  const { post, post2 } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  const strokes0 = (await page.evaluate(() => (window as any).__b2.app.doc.strokes.length))
  const dims0 = (await dimState(page)).dims.length

  await page.click('#btn-measure')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('measure')
  const s = await screen(page)
  const A = s[String(post)]!, B = s[String(post2)]!
  await tap(page, A.a.x, A.a.y)
  expect(await page.getAttribute('#dim-measure', 'data-measure')).toBe('from')
  await tap(page, A.b.x, A.b.y)
  expect(await page.getAttribute('#dim-measure', 'data-measure')).toBe('value')
  // 잰 값이 실제 거리와 일치한다 — 기둥 A는 2400 mm로 적혔다
  expect(await page.textContent('#dim-measure')).toBe('잰 값 2400 mm')
  // **도면이 안 변했다**(획 수·치수 수 불변 · 남긴 재기 0)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(strokes0)
  const st = await dimState(page)
  expect(st.dims.length).toBe(dims0)
  expect(st.measures).toEqual([])

  // 다른 두 점도 — 오스냅이 걸린다(기둥 B의 끝)
  await tap(page, B.a.x, B.a.y)
  await tap(page, B.b.x, B.b.y)
  const st2 = await dimState(page)
  expect(st2.measurePair).not.toBeNull()
  expect(st2.measures).toEqual([])
  expect(await page.textContent('#dim-measure')).toMatch(/^잰 값 [0-9.]+ mm$/)
})

test('32-6 ② 켜면 도면에 남고, 실행취소로 되돌아간다 — 남는 것은 «어느 두 점»뿐이다', async ({ page }) => {
  const { post } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  await page.check('#chk-measure-keep')
  await page.click('#btn-measure')
  const s = await screen(page)
  const A = s[String(post)]!
  await tap(page, A.a.x, A.a.y)
  await tap(page, A.b.x, A.b.y)
  const st = await dimState(page)
  expect(st.measures.length).toBe(1)
  expect(st.measures[0].mm).toBeCloseTo(2400, 3)
  // ⛔ 저장되는 것에 숫자가 없다 — 직렬화를 눈으로 확인한다(지시 문면)
  const saved = await page.evaluate(() => {
    const m = (window as any).__b2.app.doc.measures
    return JSON.stringify(m)
  })
  expect(saved).not.toContain('2400')
  expect(JSON.parse(saved)[0]).toHaveProperty('a.s')
  expect(JSON.parse(saved)[0]).toHaveProperty('a.t')

  await page.keyboard.press('Control+z')
  await settle(page)
  expect((await dimState(page)).measures.length).toBe(0)
})

test('32-6 ③ 축척이 미정이면 숫자 대신 비율이다 — 없는 축척을 있는 척하지 않는다', async ({ page }) => {
  const { post } = await build(page)
  await page.click('#dim-toggle')
  await page.click('#btn-measure')
  const s = await screen(page)
  const A = s[String(post)]!
  await tap(page, A.a.x, A.a.y)
  await tap(page, A.b.x, A.b.y)
  const text = (await page.textContent('#dim-measure'))!
  expect(text).toMatch(/^잰 값 [0-9.]+ 단위 \(축척 미정\)$/)
  expect(text).not.toContain('mm')
})

test('32-6 ④ 무회귀 — 재기 도구가 치수·면·연필의 탭을 안 삼킨다(#77 ㉠)', async ({ page }) => {
  const { post } = await build(page)
  await page.click('#dim-toggle')
  await page.evaluate((id) => (window as any).__b2.diag.setDimForTest(id, 2400), post)
  await settle(page)
  // 재기를 켰다가 끈다 — 다시 누르면 연필로 돌아온다
  await page.click('#btn-measure')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('measure')
  await page.click('#btn-measure')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pencil')
  // 치수 숫자 짚기(32-2)가 여전히 산다
  const pos = await page.evaluate((id) => (window as any).__b2.diag.dimLabelPosForTest(id), post)
  await tap(page, pos.x, pos.y)
  expect(await page.evaluate(() => (window as any).__b2.app.dimEdit)).toBe(post)
  // 치수 도구(web2-29 1단계) 경로도 그대로
  await page.click('#btn-dim-write')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('dim')
})
