// 종단 — **그리기 규칙 둘**(web2-06 지시 1·2). 단위는 `vpray`·`hsnap`이 재고,
// 여기서는 **진짜 입력**(마우스 이동 여덟 걸음)으로 같은 것을 잰다: 사람이 손으로 긋는
// 경로에는 중간 이동마다 미리보기가 다시 도는 단계가 있고, 그 경로를 거쳐도 같은 좌표가
// 확정되는지는 하네스가 못 본다(하네스는 시작·끝 두 점만 준다).

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
const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())
const lastStroke = (page: Page) =>
  page.evaluate(() => { const d = (window as any).__b2.app.doc.strokes; return d[d.length - 1] })

test('지시 2 — 지평선을 긋고 **수평선이 스냅으로 그어진다**', async ({ page }) => {
  // 고치기 전: 처짐 5px의 수평 의도가 **x=16300(13.3W) 소실점**을 만들고 주점이 그리로 갔다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await drawLine(page, 300, 600, 700, 595)           // 수평 의도 — 5px 어긋나게
  const s = await summary(page)
  expect(s.vps).toHaveLength(0)                      // 소실점이 안 생겼고
  expect(s.f).toBeCloseTo(0.87 * 1200, 6)            // f가 기본값 그대로다
  const st = await lastStroke(page)
  expect(st.b.y).toBe(st.a.y)                        // 획이 **정확히 수평**이다

  // 그 뒤에도 깊이선은 그대로 소실점을 만든다(양성 채널 — 규칙이 다 막은 게 아니다)
  await drawLine(page, 500, 500, 620, 470)
  expect((await summary(page)).vps.length).toBe(1)
})

test('지시 1 — **소실점에서 뻗는 획은 커서 자리에 그대로 끝난다**', async ({ page }) => {
  // 고치기 전: 축 스냅이 그 획을 지평선 위로 눌렀다((900,400)→(700,600)이 끝점 (700,400)).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await page.mouse.move(900, 400)                    // 탭 = 소실점 찍기
  await page.mouse.down(); await page.mouse.up()
  await settle(page)
  expect((await summary(page)).vps).toEqual([{ x: 900, y: 400 }])

  await drawLine(page, 901, 401, 700, 600)           // 소실점을 눌러(1px 빗나가게) 아래로
  const st = await lastStroke(page)
  expect(st.a).toEqual({ x: 900, y: 400 })           // 시작점은 소실점에 붙고
  expect(st.b).toEqual({ x: 700, y: 600 })           // 끝점은 커서 그대로다
  expect((await summary(page)).vps).toHaveLength(1)  // 새 소실점을 안 만든다
})
