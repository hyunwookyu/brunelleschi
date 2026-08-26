// web2-13 4부 — 자립 깃발의 화면 층: **기본 꺼짐** · 지금 경로가 진단 패널에 보인다(4-f).
// 기전의 팔은 test/own3d.test.ts(단위 — 4-a~4-d·반증). 여기는 사람이 만지는 표면만 잰다.

import { test, expect } from '@playwright/test'

test('4-f — 기본은 꺼짐(사슬이 정본)·진단 패널이 경로를 말한다·켜면 자립이 보이고 재방문에도 남는다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 기본 꺼짐 — 세션·팔이 전부 통과해도 켜는 것은 사람이다
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await expect(page.locator('#chk-own3d')).not.toBeChecked()
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toContainText('3D 경로')
  await expect(page.locator('#diagpanel')).toContainText('사슬(정본)')
  await page.click('#buildid')

  // 사람이 설정에서 켠다(이 팔이 그 사람 역할이다) — 진단이 즉시 «자립»을 말한다
  await page.click('#pane-settings summary')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toContainText('자립(실험')

  // 재방문 — 사람이 켠 값은 남는다(localStorage · renderer 선례)
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  await expect(page.locator('#chk-own3d')).toBeChecked()

  // 되돌림 — 끄면 사슬로 돌아간다(다음 팔들을 위해 localStorage도 청소)
  await page.click('#pane-settings summary')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await page.evaluate(() => localStorage.removeItem('b2-own3d'))
})
