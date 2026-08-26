// web2-14 4번 — 스냅샷 겹 고스트 회귀 팔.
//
// 결함(실기기 보고 → dpr2 재현): #brushsnap에 CSS 크기(style width/height)가 없어
// `position:absolute; inset:0`이 대체 요소(canvas)를 늘리지 못하고 **고유 크기 =
// backing(W·dpr × H·dpr)** 으로 표시됐다. dpr>1이면 그리는 동안(스냅샷 겹이 떠 있는
// 동안만) 확정 획 질감이 좌상단 기준 dpr배 자리에 «같은 장면»으로 또 보였다.
// dpr1은 고유 크기 == 뷰포트라 증상이 없다 — **dpr2 프로젝트가 판별자다**(D-C3).
//
// e2e 156팔이 못 잡은 이유(D-5): 긋는 도중을 보는 팔(draftgate)이 전부 «획 주변의
// 좁은 상자»였다 — 고스트는 dpr배 자리(장면에서 떨어진 곳)에 나므로 상자 밖이었다.
// 이 팔이 그 구멍을 막는다: **긋는 도중의 프레임을, 그리는 자리에서 떨어진 상자로** 본다.
//
// 반증(D-3): 수리(fitSnap의 CSS 크기 부여)를 되돌리면 dpr2에서 이 팔이 실패한다 —
// 실제로 되돌려 확인했다(NOTES web2-14 4번 절).

import { test, expect, type Page } from '@playwright/test'
import { PIXEL_DIFF_CH } from './thresholds'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return [...g.getImageData(0, 0, c.width, c.height).data]
  }, buf.toString('base64'))
}
function diffCount(a: number[], b: number[]): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(b[i]! - a[i]!) > PIXEL_DIFF_CH || Math.abs(b[i + 1]! - a[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(b[i + 2]! - a[i + 2]!) > PIXEL_DIFF_CH) n++
  }
  return n
}

/** 지평선 + 수평 앵커(승격) — draftgate와 같은 픽스처 */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

test('긋는 동안 장면이 다른 자리에 안 뜬다 — 스냅샷 겹 1:1 (그리는 자리 밖 상자 diff 0)', async ({ page }) => {
  await boot(page)
  await fixture(page)
  // 좌상단 사분면의 획 — 결함이 있으면 dpr2에서 이 획의 질감이 (2x,2y) 대역
  // CSS (300,400)~(700,496)에 «또» 보인다. 감시 상자가 그 대역을 덮는다.
  await page.mouse.move(150, 200); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(150 + 25 * i, 200 + 6 * i)
  await page.mouse.up(); await settle(page)

  // 감시 상자: 고스트 대역을 덮되 원본 획·그릴 획(x=900)·큐브(x>1090)와 안 겹친다.
  // 지평선(y400)이 상자를 지나지만 diff 기준이라 상시 요소는 상쇄된다.
  const box = [285, 380, 430, 135] as const
  const idle = await shot(page, ...box)

  // 긋는 도중 — 상자에서 떨어진 자리(x=900)에 긋고, 떼지 않은 채 상자를 본다
  await page.mouse.move(900, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(900, 560 - 9 * i)
  await settle(page); await settle(page)
  const mid = await shot(page, ...box)
  const midDiff = diffCount(idle, mid)

  // 겹 기하 단언 — 스냅샷 겹의 CSS 크기 == #brushc의 CSS 크기(표시 중일 때)
  const geom = await page.evaluate(() => {
    const s = document.getElementById('brushsnap')!.getBoundingClientRect()
    const c = document.getElementById('brushc')!.getBoundingClientRect()
    return { sw: s.width, sh: s.height, cw: c.width, ch: c.height }
  })
  await page.mouse.up(); await settle(page)
  const after = await shot(page, ...box)
  const afterDiff = diffCount(idle, after)

  console.log(`[측정] 스냅샷 고스트 — 긋는 중 상자 diff ${midDiff} · 뗀 뒤 ${afterDiff} · snap CSS ${geom.sw}×${geom.sh} vs brushc ${geom.cw}×${geom.ch}`)
  expect(geom.sw, 'snap CSS 폭 == brushc CSS 폭').toBe(geom.cw)
  expect(geom.sh, 'snap CSS 높이 == brushc CSS 높이').toBe(geom.ch)
  // 긋는 동안 그리는 자리 밖은 아무것도 안 변한다 — 고스트가 있으면 수백 px가 든다
  expect(midDiff, '긋는 중 원격 상자 무변화(고스트 없음)').toBe(0)
  expect(afterDiff, '뗀 뒤 원격 상자 무변화').toBe(0)
})
