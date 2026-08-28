// web2-26 6번 — **필압 보정**의 화면 게이트.
//
// 단위 팔(`test/press26.test.ts`)이 재는 것은 모형(재매핑·천장·기울기·왕복)이다.
// 여기서는 **렌더가 실제로 갈리는가**를 픽셀로 본다:
//   ① 꺼짐 → 켰다 다시 끔 = **픽셀 단위로 동일**(옵션이 흔적을 안 남긴다)
//   ② 켬 → 약한 획이 화면에서 실제로 옅다 · 세게 그은 획과 갈린다
//   ③ 2H는 켠 상태에서도 2B의 어두움에 못 간다
//
// ⚠ 필압은 **CDP 실입력**(`force`)으로 싣는다 — 합성 PointerEvent는 pressure가 안 실린다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 펜으로 한 획 — 압력 `force` 균일 */
async function penLine(page: Page, ax: number, ay: number, bx: number, by: number, force: number) {
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, ...pen, force })
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + (bx - ax) * i / 8, y: ay + (by - ay) * i / 8, ...pen, force })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, ...pen, force: 0 })
  await cdp.detach()
  await settle(page)
}

/** 조각의 **어두운 쪽 5분위** 휘도 — 작을수록 진하다.
 *  ⚠ 평균이 아니다: 획은 1.4px 남짓이라 상자 평균은 **dpr에 따라 희석 비가 달라진다**
 *  (dpr2에서 같은 CSS 상자에 픽셀이 네 배라 획의 몫이 그만큼 준다 — 실측 차 6.4 → 1.6).
 *  «획이 얼마나 진한가»는 획의 **심**이 답이고, 5분위가 그 심을 안정적으로 집는다(#74 ㉡ 계열). */
async function darkness(page: Page, x: number, y: number, w: number, h: number): Promise<number> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const L: number[] = []
    for (let i = 0; i < d.length; i += 4) L.push(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!)
    L.sort((a, b) => a - b)
    return L[Math.floor(L.length * 0.05)]!
  }, buf.toString('base64'))
}

async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<string> {
  return (await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64')
}

/** 보정을 손으로 세운다 — 두 획을 받는 절차는 단위 팔이 재고, 화면 팔은 값만 필요하다 */
const setCal = (page: Page, p0: number, p1: number) =>
  page.evaluate(([p0, p1]) => (window as any).__b2.diag.pressCalForTest(p0, p1), [p0, p1] as const)
const clearCal = (page: Page) =>
  page.evaluate(() => (window as any).__b2.diag.pressCalForTest(null))
const pickGrade = (page: Page, g: string) =>
  page.evaluate((g) => { (window as any).__b2.app.grade = g }, g)

/** 카메라를 닫는다 — 그래야 시험 획이 **승격된 몸체**로 그려진다(대기 획은 파선 경로다) */
async function closeCamera(page: Page) {
  await penLine(page, 280, 560, 700, 560, 0.4)
  await penLine(page, 500, 560, 800, 480, 0.4)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
}

test('① 꺼진 문서의 렌더가 픽셀 단위로 동일하다 (+분해능: 켜면 실제로 갈린다)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await penLine(page, 600, 560, 600, 700, 0.18)      // 약하게 그은 획(승격된다)
  const off1 = await shot(page, 580, 580, 60, 120)
  await setCal(page, 0.05, 0.35)
  await settle(page)
  const on = await shot(page, 580, 580, 60, 120)
  await clearCal(page)
  await settle(page)
  const off2 = await shot(page, 580, 580, 60, 120)
  console.log(`[26-6 ①] 꺼짐 == 껐다 켰다 다시 끔: ${off1 === off2} · 켬과 다름: ${on !== off1}`)
  expect(off2, '옵션이 흔적을 안 남긴다').toBe(off1)
  // 분해능(#69 ㉣) — 「같다」가 뜻이 있으려면 **다를 수도 있어야** 한다
  expect(on, '켜면 실제로 갈린다').not.toBe(off1)
})

test('② 켠 상태에서 약한 획이 화면에서 옅다 — 꺼짐의 같은 획과 견준다(지시 게이트)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  // 같은 획을 두고 **옵션만** 갈랐다 — 그래야 차가 보정의 몫이다(#75 ㉢의 형태)
  await penLine(page, 600, 560, 600, 700, 0.20)      // 약하게(지시의 p=0.2)
  const off = await darkness(page, 592, 600, 16, 80)
  await setCal(page, 0.05, 0.35)
  const on = await darkness(page, 592, 600, 16, 80)
  const bare = await darkness(page, 720, 600, 16, 80)
  console.log(`[26-6 ②] p=0.20 — 꺼짐 ${off.toFixed(1)} · 켬 ${on.toFixed(1)} · 빈 종이 ${bare.toFixed(1)}`)
  expect(on, '켠 상태의 p=0.2가 꺼진 상태보다 옅다').toBeGreaterThan(off + 5)
  expect(on, '그래도 그려지기는 한다').toBeLessThan(bare - 3)

  // 그리고 켠 상태 안에서 세기가 갈린다 — 약한 획 ↔ 센 획
  await penLine(page, 660, 560, 660, 700, 0.34)
  const strong = await darkness(page, 652, 600, 16, 80)
  console.log(`[26-6 ②'] 켬 — 약한 획 ${on.toFixed(1)} · 센 획 ${strong.toFixed(1)}`)
  expect(strong, '센 획이 약한 획보다 진하다').toBeLessThan(on - 5)
})

test('③ 켠 상태에서 2H는 2B의 어두움에 못 간다 — 등급이 천장을 정한다', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await setCal(page, 0.05, 0.35)
  await pickGrade(page, '2B')
  await penLine(page, 600, 560, 600, 700, 0.34)      // 2B · 최대
  await pickGrade(page, '2H')
  await penLine(page, 660, 560, 660, 700, 0.34)      // 2H · 최대
  const soft = await darkness(page, 592, 600, 16, 80)
  const hard = await darkness(page, 652, 600, 16, 80)
  console.log(`[26-6 ③] 2B(최대) ${soft.toFixed(1)} · 2H(최대) ${hard.toFixed(1)}`)
  expect(hard, '2H는 아무리 눌러도 2B만큼 검어지지 않는다').toBeGreaterThan(soft + 3)
})
