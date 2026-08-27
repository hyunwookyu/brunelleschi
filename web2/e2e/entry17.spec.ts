// web2-17 — 새 진입로 종단 팔.
// 지평선은 상시(H/2) — 긋지 않는다. 팬이 눈높이 선언이고 첫 획이 시점을 굳힌다.
// 빈 문서 지평선 픽셀(1-e ②)은 flow.spec 머리가 함께 잰다 — 여기는 진입로·배선.

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
const boot = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
}

test('1-e ③④ 종단 — 방 실루엣 → 후퇴 대각선 = 1점 잠금', async ({ page }) => {
  await boot(page)
  await drawLine(page, 300, 650, 900, 650)   // 바닥 (화면 수평 = 1점 선언)
  await drawLine(page, 300, 650, 300, 450)   // 좌 기둥
  await drawLine(page, 900, 650, 900, 450)   // 우 기둥
  await drawLine(page, 300, 450, 900, 450)   // 상단
  let s = await summary(page)
  expect(s.waiting).toEqual([])
  expect(s.screenHDeclared).toBe(true)
  expect(s.vps).toHaveLength(0)
  expect(s.lifted).toBe(4)                   // 3D 벽 하나
  await drawLine(page, 300, 650, 420, 600)   // 후퇴 대각선 → (900,400)
  s = await summary(page)
  expect(s.vps).toHaveLength(1)
  expect(Math.abs(s.vps[0].x - 900)).toBeLessThan(1e-6)
  expect(s.p1Locked).toBe(true)
})

test('2-c ④ 배선 — 옛 자동 저장(v1·지평선 520)이 변환을 지나 열린다', async ({ page }) => {
  await page.addInitScript(() => {
    // 옛 열쇠에 심는다 — 새 앱의 «옛 열쇠 읽기 이행»(D-W4)까지 이 팔이 잰다
    localStorage.setItem('b2-autosave', JSON.stringify({
      format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
      strokes: [
        { id: 1, a: { x: 100, y: 520 }, b: { x: 1100, y: 520 } },
        { id: 2, a: { x: 500, y: 620 }, b: { x: 600, y: 595 } },
      ],
      faces: [], unit: 'mm', nextId: 3, savedViews: [],
    }))
  })
  await boot(page)
  const s = await summary(page)
  expect(s.strokes).toBe(1)                          // 지평선 획이 버려졌다
  expect(s.vps).toEqual([{ x: 900, y: 400 }])        // (900,520) → dy=−120 → (900,400)
  expect(s.lifted).toBe(1)
  const st = await page.evaluate(() => (window as any).__b2.app.doc.strokes[0])
  expect(st.a).toEqual({ x: 500, y: 500 })           // 620 − 120
  expect(s.drawView).toBeNull()                      // 옛 파일 — 작도 시점 없음(3-d ⑤)
})

test('3-a·3-b 배선 — 선언 전 줌 차단 · 팬 → 첫 획 = drawView', async ({ page }) => {
  await boot(page)
  // 선언 전 줌 — view가 안 움직인다(무반응의 설명은 첫 안내 문구가 진다)
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -240)
  await settle(page)
  let s = await summary(page)
  expect(s.view).toEqual({ s: 1, ox: 0, oy: 0 })
  expect(await page.textContent('#notice')).toContain('눈높이를 정한다')
  // 팬(마우스 우버튼) — 눈높이 선언
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(640, 340)
  await page.mouse.up({ button: 'right' })
  await settle(page)
  s = await summary(page)
  expect(s.view.oy).toBeCloseTo(-60, 6)
  expect(s.view.ox).toBeCloseTo(40, 6)
  expect(s.drawView).toBeNull()
  // 첫 획 — 시점이 굳는다
  await drawLine(page, 500, 650, 700, 650)
  s = await summary(page)
  expect(s.drawView).toEqual({ s: 1, ox: 40, oy: -60 })
  // 첫 획 뒤 줌은 산다
  await page.mouse.wheel(0, -240)
  await settle(page)
  s = await summary(page)
  expect(s.view.s).toBeGreaterThan(1)
  expect(s.drawView).toEqual({ s: 1, ox: 40, oy: -60 })   // 굳은 값은 그대로
})

test('1-d — 첫 획이 소실점 획이면 되돌리기가 한 줄로 말한다(규칙은 그대로)', async ({ page }) => {
  await boot(page)
  await drawLine(page, 500, 650, 680, 537.5)         // 대각선 — 소실점 획(작도)
  let s = await summary(page)
  expect(s.vps).toHaveLength(1)
  expect(s.strokes).toBe(1)
  await page.click('#btn-undo')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(1)                          // 안 되돌아간다 — P1 계열은 비우기다
  expect(await page.textContent('#notice')).toContain('비우기로 다시 시작')
})
