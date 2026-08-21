// 종단 — **돌려보다가 그리려면 정렬된 구도로 돌아와야 한다.**
// 단위(`test/level.test.ts`)는 가짜 시계로 재고, 여기서는 **진짜 시계와 진짜 입력**으로 잰다:
// 중버튼을 잡고 있는 동안 안 접히는가 · 놓으면 접히는가 · 기울어 있는 동안 획이 안 생기는가.

import { test, expect, type Page } from '@playwright/test'

const FOLD_DELAY_MS = 1200
const FOLD_ANIM_MS = 300

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

const lev = (page: Page) => page.evaluate(() => (window as any).__b2.diag.level())
const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

/** 요 두 방향 사이 각(도) */
const yawGap = (a: any, b: any) =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI

/** 중버튼으로 위아래로 끈다 — 놓지 않는다 */
async function tiltDown(page: Page) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(640, 500, { steps: 8 })
  await settle(page)
}

async function waitFolded(page: Page) {
  await page.waitForFunction(
    () => (window as any).__b2.diag.level().level && !(window as any).__b2.diag.level().folding,
    null, { timeout: 10_000 })
  await settle(page)
}

test('돌려본 뒤 정렬로 접힌다 — 놓으면 · 잡고 있으면 안 접힌다 · 기울어 있으면 안 그려진다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)

  // 작도 — 지평선 · 깊이선 둘 · 기둥 하나(3D 기하가 있어야 궤도가 돈다)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  expect((await page.evaluate(() => (window as any).__b2.diag.summary())).lifted).toBe(3)
  expect((await lev(page)).level).toBe(true)

  // ── 기울인다 ────────────────────────────────────────────────────────
  await tiltDown(page)
  let s = await lev(page)
  expect(s.level).toBe(false)
  expect(Math.abs(s.fwd.y)).toBeGreaterThan(0.05)      // 실제로 위아래로 돌았다
  // **기울어 있을 때 무엇이 다른지 보인다** — 한 줄이 그것을 말한다
  expect(await page.textContent('#notice')).toContain('기울어')

  // ── 잡고 있는 동안에는 안 접힌다 (지연의 두 배를 기다린다) ──────────
  const held = s
  await page.waitForTimeout(FOLD_DELAY_MS * 2)
  await settle(page)
  s = await lev(page)
  expect(s.level).toBe(false)
  expect(s.fwd.y).toBeCloseTo(held.fwd.y, 12)          // 한 톨도 안 움직였다

  // ── 놓으면 접힌다 ──────────────────────────────────────────────────
  const yaw0 = s.yaw, eye0 = s.eye
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)          // 놓자마자는 아직 그대로다
  await waitFolded(page)
  s = await lev(page)
  expect(s.level).toBe(true)
  expect(Math.abs(s.fwd.y)).toBeLessThan(1e-9)         // 피치 0
  expect(yawGap(s.yaw, yaw0)).toBeLessThan(1e-3)       // 좌우 각도 유지
  expect(s.eye).toBeCloseTo(eye0, 9)                   // 눈높이 유지
  expect(await page.textContent('#notice')).not.toContain('기울어')

  // ── 기울어 있는 동안에는 획이 안 생긴다 ─────────────────────────────
  const n0 = await strokeCount(page)
  await tiltDown(page)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0)             // 하나도 안 늘었다
  // 그 누름이 죽은 클릭이 아니다 — 접기를 당긴다
  await waitFolded(page)

  // ── 접힌 뒤에는 그려진다 ───────────────────────────────────────────
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0 + 1)
  expect(FOLD_ANIM_MS).toBeLessThan(FOLD_DELAY_MS)     // 상수 대조 — 값이 바뀌면 여기가 안다
})
