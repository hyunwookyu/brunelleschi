// 진단 패널 (web2-10 지시 4) — 값이 실제로 그 자리에 나오는가.
//
// 헤드리스가 재는 것: 열림/닫힘 배선 · 각 값이 브라우저의 현재값과 **일치**하는가
// (문구가 아니라 같은 API를 불러 대조한다) · 포인터 줄이 실입력으로 갱신되는가.
// dpr 줄은 dpr1/dpr2 프로젝트에서 **다른 값**을 요구하므로(D-C3) 표시가 고정 문자열이면
// 두 프로젝트 중 하나가 반드시 깨진다 — 판별력이 구성에 있다.
// 실기기 값(MovinkPad의 dpr·UA·필압 단계)은 이 패널로 사람이 읽는다 — DEFERRED의 자리.
import { test, expect, type Page } from '@playwright/test'

const rowText = (page: Page, key: string) => page.evaluate((k) => {
  const rows = Array.from(document.querySelectorAll('#diagpanel div'))
  const r = rows.find(d => (d.querySelector('.k')?.textContent ?? '') === k)
  return r ? (r.textContent ?? '').slice((r.querySelector('.k')?.textContent ?? '').length) : null
}, key)

test('빌드 식별자를 누르면 진단이 펴지고 값이 브라우저 현재값과 같다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await expect(page.locator('#diagpanel')).toBeHidden()   // 기본은 닫힘 — 그림을 안 가린다
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toBeVisible()

  const actual = await page.evaluate(() => ({
    hw: 'createHandwritingRecognizer' in navigator ? '있음' : '없음',
    dpr: String(window.devicePixelRatio),
    css: `${window.innerWidth}×${window.innerHeight}`,
    ua: navigator.userAgent,
  }))
  expect(await rowText(page, '필기 인식 API')).toBe(actual.hw)
  expect(await rowText(page, 'devicePixelRatio')).toBe(actual.dpr)  // dpr1↔dpr2에서 다른 값
  expect(await rowText(page, '표시 모드')).toBe('browser')          // 헤드리스 탭은 browser다
  expect(await rowText(page, '화면 CSS px')).toBe(actual.css)
  expect(await rowText(page, 'UA')).toBe(actual.ua)
  // ⚠ «—»가 아니다 — 패널을 **연 클릭 자체가** 포인터 입력이라 mouse가 이미 찍혀 있다.
  // (초판이 «—»를 기대해 실패했다 — 계측이 클릭까지 세고 있다는 증거라 판정을 바꿨다.)
  expect(await rowText(page, '마지막 포인터')).toContain('mouse')

  // 다시 누르면 닫힌다
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toBeHidden()
})

test('포인터 줄이 실입력으로 갱신된다 — pen 종류·필압이 나온다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#buildid')
  expect(await rowText(page, '마지막 포인터')).toContain('mouse')   // 연 클릭이 남긴 대조군
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const, force: 0.7 }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 400, ...pen })
  for (let i = 1; i <= 5; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200 + i * 20, y: 400, ...pen })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 400, ...pen })
  await cdp.detach()
  const row = await rowText(page, '마지막 포인터')
  console.log(`[측정] 진단 포인터 줄: ${row}`)
  expect(row).toContain('pen')
  const max = Number(/필압 최대 ([\d.]+)/.exec(row ?? '')?.[1])
  expect(max).toBeGreaterThan(0)                                    // 필압이 실린다
  expect(Number(/단계 (\d+)/.exec(row ?? '')?.[1])).toBeGreaterThanOrEqual(1)
})
