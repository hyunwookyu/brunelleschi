// web2-20 2부 — 종속 탭(겹)의 배선판.
//   ① 카메라 닫히기 전 「+」 비활성 + 안내 ② 닫힌 뒤 얹힌다 ③ rect 기본값이 화면과
//   같다(값으로) ④ 새 획이 활성 겹으로 ⑤ 겹 삭제 → 실행취소 → 획이 돌아온다
//   ⑥ 종이를 바꾸면 종속 탭 줄이 바뀐다 ⑦ (state 몫은 layerops.test — 여기서는 배선)
//   + **형태가 가른다**: 부모 탭(배타적)은 겹침 0 · 자식 탭(가산적)은 서로 겹친다(상자
//     실측 — 이 UI의 유일한 오독 위험을 팔이 형태로 잰다. 지시 2부 ⚠).
// 값 정본은 layerops.test — 여기는 사람 경로(클릭·팝업)가 그 값에 닿는지다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 카메라를 닫는 픽스처 — 수평 앵커 + 소실점 획(1점 잠김) */
async function closeCamera(page: Page) {
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
}

test('①② 얹기 문 — 닫히기 전 비활성+안내 · 닫힌 뒤 트레이싱지가 얹힌다', async ({ page }) => {
  await boot(page)
  // ① 빈 문서 — 「+」가 비활성이고 누르면 이유가 한 줄로 보인다(2-a)
  await expect(page.locator('#layer-add')).toHaveClass(/disabled/)
  await page.click('#layer-add'); await settle(page)
  await expect(page.locator('#notice')).toContainText('소실점 작도가 끝나야')
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  // ② 카메라를 닫으면 얹힌다
  await closeCamera(page)
  await expect(page.locator('#layer-add')).not.toHaveClass(/disabled/)
  await page.click('#layer-add'); await settle(page)
  await expect(page.locator('#layer-pop .lpick')).toHaveCount(2)   // 종이 종류 **둘**뿐(지시 0)
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settle(page)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, on: a.doc.layers[0]?.on }
  })
  expect(st.n).toBe(1)
  expect(st.active).not.toBeNull()
  expect(st.on).toBe(true)
  await expect(page.locator('#layerbar .lpaper')).toHaveCount(1)
})

test('③④ rect 기본값(값으로) · 새 획이 활성 겹으로 · 켬/끔·잠금 표식', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]'); await settle(page)
  // ③ rect = 지금 화면에서 **짧은 변 5% 인셋 + 층별 흔들림**(web2-21 3-b — 종전 «화면
  // 전체»는 필터로 보였다). 값 정본은 layerops.test — 여기서는 배선이 그 규약에 닿는지
  // (뷰 항등 s1·o0: 인셋 40 · 이동 ±6 · 크기 ±4).
  const rect = await page.evaluate(() => (window as any).__b2.app.doc.layers[0].rect)
  expect(rect.x).toBeGreaterThanOrEqual(34); expect(rect.x).toBeLessThanOrEqual(46)
  expect(rect.y).toBeGreaterThanOrEqual(34); expect(rect.y).toBeLessThanOrEqual(46)
  expect(1200 - rect.w).toBeGreaterThanOrEqual(70); expect(1200 - rect.w).toBeLessThanOrEqual(90)
  expect(800 - rect.h).toBeGreaterThanOrEqual(70); expect(800 - rect.h).toBeLessThanOrEqual(90)
  // ④ 새 획이 활성 겹으로
  await drawLine(page, 300, 620, 500, 640)
  const last = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { layer: s.layer, active: a.activeLayer }
  })
  expect(last.layer).toBe(last.active)
  // 켬/끔 — 눈 표식이 실제 상태를 민다(배선)
  await page.click('#layerbar .lpaper .leye'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].on)).toBe(false)
  expect(await page.evaluate(() => (window as any).__b2.app.activeLayer)).toBeNull()
  await page.click('#layerbar .lpaper .leye'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].on)).toBe(true)
  // 잠금 — 배선(값은 layerops.test)
  await page.click('#layerbar .lpaper .llock'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].locked)).toBe(true)
  await page.click('#layerbar .lpaper .llock'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].locked)).toBe(false)
})

test('롤 둘(web2-21 3-a) — 닫히기 전 비활성+안내 · 누르면 그 종이가 얹히고 활성', async ({ page }) => {
  await boot(page)
  // ② 카메라 닫히기 전 — 비활성(흐림)이고 누르면 이유가 보인다
  await expect(page.locator('#btn-roll-tracing')).toHaveClass(/disabled/)
  await expect(page.locator('#btn-roll-yellow')).toHaveClass(/disabled/)
  await page.click('#btn-roll-tracing'); await settle(page)
  await expect(page.locator('#notice')).toContainText('소실점 작도가 끝나야')
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  // ① 닫힌 뒤 — 트레이싱지 롤 → 한 장 얹히고 활성 · 옐로 롤 → 옐로가 얹힌다
  await closeCamera(page)
  await expect(page.locator('#btn-roll-tracing')).not.toHaveClass(/disabled/)
  await page.click('#btn-roll-tracing'); await settle(page)
  let st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, paper: a.doc.layers[0]?.paper }
  })
  expect(st.n).toBe(1)
  expect(st.paper).toBe('tracing')
  expect(st.active).not.toBeNull()
  await page.click('#btn-roll-yellow'); await settle(page)
  st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, paper: a.doc.layers[1]?.paper }
  })
  expect(st.n).toBe(2)
  expect(st.paper).toBe('yellow')
  // 종속 탭 줄도 함께 민다(layerbar.sync 배선)
  await expect(page.locator('#layerbar .lpaper')).toHaveCount(2)
})

test('⑤ 겹 삭제(길게 눌러 확인 — 획 수 알림) → 실행취소로 돌아온다', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settle(page)
  await drawLine(page, 300, 620, 500, 640)
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const tab = page.locator('#layerbar .lpaper')
  const bb = (await tab.boundingBox())!
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up(); await settle(page)
  await expect(page.locator('#layer-pop')).toContainText('획 1개')   // 확인 문구가 수를 알린다
  await page.click('#layer-pop u[data-pick="yes"]'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(before - 1)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  await page.click('#btn-undo'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(before)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(1)
})

test('⑥ 종이를 바꾸면 종속 탭 줄이 바뀐다 · 형태 — 부모 겹침 0 ↔ 자식 겹침 >0', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  // 겹 둘(트레이싱지·옐로) — 자식 탭의 겹침을 잰다
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settle(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]'); await settle(page)
  await expect(page.locator('#layerbar .lpaper')).toHaveCount(2)
  // 형태(지시 2부 ⚠) — 자식 탭 상자는 서로 겹친다(가산적 더미) · 부모 탭은 겹침 0(배타적 줄)
  const boxes = await page.evaluate(() => {
    const of = (sel: string) => [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, w: r.width }
    })
    return { child: of('#layerbar .lpaper'), parent: of('#paperbar .ptab[data-sheet]') }
  })
  expect(boxes.child[0]!.x + boxes.child[0]!.w).toBeGreaterThan(boxes.child[1]!.x)   // 겹친다
  if (boxes.parent.length >= 2) {
    expect(boxes.parent[0]!.x + boxes.parent[0]!.w).toBeLessThanOrEqual(boxes.parent[1]!.x + 0.5)
  }
  // ⑥ 새 종이로 가면 줄이 비고(그 종이의 겹이 없다), 돌아오면 다시 둘이다
  await page.click('#paper-add')
  await page.keyboard.press('Escape'); await settle(page)
  await expect(page.locator('#layerbar .lpaper')).toHaveCount(0)
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  await expect(page.locator('#layerbar .lpaper')).toHaveCount(2)
})
