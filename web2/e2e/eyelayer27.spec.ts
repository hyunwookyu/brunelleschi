// web2-27 2번 — **눈 토글이 겹 전체를 치운다**의 픽셀 게이트.
//
// 지시 게이트: 「겹을 끄면 **종이면·획·결이 모두** 사라진다(렌더 픽셀 비교)」.
// ⚠ 판정은 **그 실행의 맨 종이 값과의 비교**다(#74 ㉡ — 절대 밝기 임계 ⛔). 26-2가 결의
//   진폭을 지각 대역으로 올렸으므로 더 그렇다: 결이 남아 있으면 sd가 남고, 색조가 남으면
//   평균이 남는다. **둘 다** 맨 종이로 돌아와야 「겹 전체가 사라졌다」다.
//
// D-2(재현): 표식이 낸 것은 지시가 적은 증상과 **달랐다** — 겹 하나에서는 눈을 끄면 이미
//   맨 종이로 돌아갔고, **겹 둘에서 활성 겹을 끄자 남아 있는 아래 겹의 종이면까지** 사라졌다
//   (204,192,151 → 244.7,242.7,237.8). ③이 그 자리를 지킨다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function addPaper(page: Page, paper: 'tracing' | 'yellow') {
  await page.click('#layer-add')
  await page.click(`#layer-pop .lpick[data-paper="${paper}"]`)
  await settle(page)
}

async function openList(page: Page) {
  if (await page.locator('#layer-list').count() === 0) {
    await page.click('#layer-summary')
    await settle(page)
  }
}

/** 그 겹의 눈을 누른다 — **id로 짚는다**(줄 순서로 짚으면 목록이 다시 그려질 때 어긋난다) */
async function clickEye(page: Page, id: number) {
  await openList(page)
  await page.locator(`#layer-list [data-layer="${id}"] .leye`).click()
  await settle(page)
}
const layerIds = (page: Page) =>
  page.evaluate(() => (window as any).__b2.app.doc.layers.map((l: any) => l.id) as number[])

/** 조각의 평균 RGB와 휘도 표준편차 — 색조는 평균이, **결은 sd가** 든다 */
async function patch(page: Page, x = 300, y = 200, w = 60, h = 60) {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let r = 0, gg = 0, b = 0, n = 0
    const L: number[] = []
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]!; gg += d[i + 1]!; b += d[i + 2]!; n++
      L.push(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!)
    }
    const m = L.reduce((a, v) => a + v, 0) / L.length
    return {
      rgb: [r / n, gg / n, b / n] as [number, number, number],
      sd: Math.sqrt(L.reduce((a, v) => a + (v - m) ** 2, 0) / L.length),
    }
  }, buf.toString('base64'))
}

const rgbDiff = (a: [number, number, number], b: [number, number, number]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

test('① 겹을 끄면 종이면·획·결이 모두 사라진다 — 맨 종이로 돌아온다', async ({ page }) => {
  await boot(page)
  const bare = await patch(page)
  await addPaper(page, 'yellow')
  await drawLine(page, 330, 195, 560, 205)        // 그 겹 위의 획
  const on = await patch(page)
  const [yid] = await layerIds(page)
  await clickEye(page, yid!)
  const off = await patch(page)
  console.log(`[27-2 ①] 맨 종이 ${bare.rgb.map(v => v.toFixed(1))} sd ${bare.sd.toFixed(3)}`)
  console.log(`[27-2 ①] 겹 켬   ${on.rgb.map(v => v.toFixed(1))} sd ${on.sd.toFixed(3)}`)
  console.log(`[27-2 ①] 겹 끔   ${off.rgb.map(v => v.toFixed(1))} sd ${off.sd.toFixed(3)}`)
  // 분해능(#69 ㉣) — 켠 상태가 실제로 갈렸어야 「사라졌다」가 뜻이 있다
  expect(rgbDiff(on.rgb, bare.rgb), '겹이 켜지면 색조가 실제로 바뀐다').toBeGreaterThan(20)
  // ⚠⚠ **web2-30 9번이 이 자를 갈았다**: 이제 **맨 종이에도 결이 있다**(`bare.sd` ≈ 3.8).
  //   그러면 «뺄셈»으로 잰 겹의 몫이 실제보다 작아 보인다(5.4 − 3.8 = 1.6) — 두 결은
  //   독립이라 **분산이 더해지기** 때문이다. 30-9가 세운 산술 그대로 제곱으로 뺀다
  //   (#74 ㉡: 그 실행의 바닥값을 쓰되, 빼는 방법은 sqrt(신호²−바닥²)).
  //   요구는 그대로다 — 「겹이 켜지면 **그 겹의** 결이 실제로 선다」.
  const layerGrain = Math.sqrt(Math.max(0, on.sd * on.sd - bare.sd * bare.sd))
  console.log(`[27-2 ①] 겹의 결 몫 sqrt(${on.sd.toFixed(3)}² − ${bare.sd.toFixed(3)}²) = ${layerGrain.toFixed(3)}`)
  expect(layerGrain, '겹이 켜지면 결이 실제로 선다').toBeGreaterThan(2)
  // 게이트 — 색조도 결도 **맨 종이 값으로** 돌아온다
  expect(rgbDiff(off.rgb, bare.rgb), '색조가 남지 않는다').toBeLessThan(1)
  expect(Math.abs(off.sd - bare.sd), '결이 남지 않는다').toBeLessThan(0.3)
})

test('② 다시 켜면 겹과 그 획이 그대로 돌아온다 (픽셀·획 수 왕복)', async ({ page }) => {
  await boot(page)
  await addPaper(page, 'yellow')
  await drawLine(page, 330, 195, 560, 205)
  const on1 = await patch(page)
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const [yid] = await layerIds(page)
  await clickEye(page, yid!)
  expect(await page.evaluate((id) => (window as any).__b2.app.doc.layers.find((l: any) => l.id === id).on, yid)).toBe(false)
  await clickEye(page, yid!)
  expect(await page.evaluate((id) => (window as any).__b2.app.doc.layers.find((l: any) => l.id === id).on, yid)).toBe(true)
  const on2 = await patch(page)
  const n2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  console.log(`[27-2 ②] 켬 → 끔 → 켬 — rgb 차 ${rgbDiff(on2.rgb, on1.rgb).toFixed(3)} · sd ${on1.sd.toFixed(3)} → ${on2.sd.toFixed(3)} · 획 ${n1} → ${n2}`)
  expect(n2).toBe(n1)
  expect(rgbDiff(on2.rgb, on1.rgb)).toBeLessThan(1)
  expect(Math.abs(on2.sd - on1.sd)).toBeLessThan(0.3)
})

test('③ 활성 겹을 꺼도 **아래 겹의 종이면은 남는다** (재현했던 증상)', async ({ page }) => {
  await boot(page)
  await addPaper(page, 'yellow')
  await addPaper(page, 'tracing')          // 활성 = 트레이싱(위)
  const both = await patch(page)
  const st0 = await page.evaluate(() => (window as any).__b2.app.activeLayer)
  const ids = await layerIds(page)
  await clickEye(page, ids[ids.length - 1]!)      // 맨 위(활성 = 트레이싱)
  const after = await patch(page)
  const st1 = await page.evaluate(() => ({
    active: (window as any).__b2.app.activeLayer,
    layers: (window as any).__b2.app.doc.layers.map((l: any) => ({ id: l.id, paper: l.paper, on: l.on })),
  }))
  console.log(`[27-2 ③] 겹 둘 ${both.rgb.map(v => v.toFixed(1))} → 위 끔 ${after.rgb.map(v => v.toFixed(1))} · 활성 ${st0} → ${st1.active}`)
  // 활성이 **한 단계 아래로** 내려갔다(null이 아니다)
  expect(st1.active).not.toBeNull()
  expect(st1.active).not.toBe(st0)
  const yellow = st1.layers.find((l: any) => l.paper === 'yellow')!
  expect(yellow.on, '아래 겹은 그대로 켜져 있다').toBe(true)
  expect(st1.active).toBe(yellow.id)
  // 그리고 그 겹의 종이면이 화면에 **남아 있다** — 수리 전에는 맨 종이로 돌아갔다
  const bareLike = 243
  expect(after.rgb[2], '노란 색조가 남아 있다(파랑 채널이 내려가 있다)').toBeLessThan(bareLike - 40)
})
