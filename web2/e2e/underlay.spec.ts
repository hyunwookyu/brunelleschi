// web2-23 2·3부의 화면 몫 — **밑그림이 실제로 그렇게 그려지는가**.
//
//   ① 보이는 선이 F, 가린 선이 H로 그려진다(픽셀 대역 값으로)
//   ② 「가린 선 빼기」 옵션이 돈다(끄면 H 자리의 잉크가 사라진다)
//   ③ 은선이 **파선이 아니다**(그 선을 따라 끊긴 곳 0)
//   3부 ① 면 0에서 안내가 뜨고 굽기는 정상으로 끝난다 · ② 면이 있으면 안 뜬다
//        ③ 안내에서 면 일괄로 갈 수 있다 · ④ 두 번째 옐로에서는 안 뜬다
//
// ⚠ ①②③은 **표현의 팔**이다: 자리와 깃발을 `underlaySetForTest`로 못 박고 그 자료가
//   어떻게 그려지는지를 픽셀로 읽는다. 굽기의 «정확성»(무엇이 hidden 인가)은 단위 팔
//   (test/make2d.test.ts)이 값으로 재고 여기서 겹쳐 재지 않는다 — 한 팔이 두 물음을
//   재면 어느 쪽이 깨졌는지 못 가른다.
// ⚠⚠ 판정 캔버스는 **막(#film)**이고 그 막에는 **종이 결(섬유)**이 곱해져 있다 —
//   그래서 절대 임계(예: 「밝기 200 아래면 잉크」)를 쓰면 섬유가 잉크로 세어진다
//   (초판이 dpr2에서 그렇게 깨졌다: 섬유는 색조의 0.82배라 dpr에 따라 밝기가 갈린다).
//   여기서는 **빈 줄의 바닥값**을 그 실행에서 재고 그것을 기준으로 읽는다.

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

/** 탭 — 누른 자리에서 안 움직이고 뗀다(면 도구의 몸짓) */
async function tap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
}

/** 지면 삼각형 — 깊이선 둘 + 잇는 획(face.spec의 장면 그대로). 카메라가 닫힌다. */
async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  expect(s.lifted).toBe(3)
}

/** 막의 한 가로줄 — 칸(문서 x)마다 **가장 어두운 밝기**. 굵기 1~2px이라 ±2px 훑는다. */
function rowProfile(page: Page, y: number, x0: number, x1: number) {
  return page.evaluate(([y, x0, x1]) => {
    const c = document.getElementById('film') as HTMLCanvasElement
    if (!c || c.width === 0) return null
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const g = t.getContext('2d')!
    const X = Math.round((x0 as number) * dpr)
    const W = Math.max(1, Math.round(((x1 as number) - (x0 as number)) * dpr))
    const Y = Math.round(((y as number) - 2) * dpr)
    const Hh = Math.max(1, Math.round(4 * dpr))
    const d = g.getImageData(X, Y, W, Hh).data
    const cols: number[] = []
    for (let cx = 0; cx < W; cx++) {
      let best = 255
      for (let cy = 0; cy < Hh; cy++) {
        const i = (cy * W + cx) * 4
        const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3
        if (lum < best) best = lum
      }
      cols.push(best)
    }
    return { cols, min: Math.min(...cols) }
  }, [y, x0, x1] as const)
}

/** 그 줄이 «바닥(빈 줄)보다 확실히 어두운» 칸 수와 그 사이 끊긴 곳 수 */
function inkRun(cols: number[], floor: number, margin = 12) {
  const on = cols.map(v => v < floor - margin)
  const first = on.indexOf(true), last = on.lastIndexOf(true)
  let gaps = 0
  for (let i = first + 1; i >= 1 && i <= last; i++) if (!on[i] && on[i - 1]) gaps++
  return { on: on.filter(Boolean).length, total: on.length, gaps }
}

const X0 = 320, X1 = 680
const Y_VIS = 300, Y_HID = 360, Y_BLANK = 330

/** 옐로 한 장을 얹고 밑그림을 **알려진 자리**로 심는다 — 보이는 선 / 가린 선 한 줄씩 */
async function yellowWithUnderlay(page: Page) {
  await page.click('#btn-roll-yellow')
  await settle(page)
  const info = await page.evaluate(([yv, yh, x0, x1]) => {
    const b2 = (window as any).__b2
    const lay = b2.app.doc.layers[b2.app.doc.layers.length - 1]
    const baked = b2.diag.underlay(lay.id)      // 앱 경로가 실제로 구웠는가(심기 전에)
    const set = b2.diag.underlaySetForTest(lay.id, [
      { a: { x: x0 as number, y: yv as number }, b: { x: x1 as number, y: yv as number }, hidden: false },
      { a: { x: x0 as number, y: yh as number }, b: { x: x1 as number, y: yh as number }, hidden: true },
    ])
    return { layer: lay.id, bakedSegs: baked ? baked.segs.length : -1, set }
  }, [Y_VIS, Y_HID, X0 - 20, X1 + 20] as const)
  await settle(page)
  return info
}

test('① F·H가 픽셀 대역에서 갈린다 · ③ 은선이 파선이 아니다', async ({ page }) => {
  await boot(page)
  const info = await yellowWithUnderlay(page)
  expect(info.set).toBe(true)
  expect(info.bakedSegs).toBeGreaterThan(0)      // 앱 경로가 실제로 구웠다

  const blank = (await rowProfile(page, Y_BLANK, X0, X1))!
  const vis = (await rowProfile(page, Y_VIS, X0, X1))!
  const hid = (await rowProfile(page, Y_HID, X0, X1))!
  const floor = blank.min                        // 그 실행의 종이+결 바닥

  // 둘 다 바닥보다 확실히 어둡다 = 그려졌다
  expect(vis.min).toBeLessThan(floor - 12)
  expect(hid.min).toBeLessThan(floor - 12)
  // **가린 선이 더 옅다** — F(#707070·알파 0.68)보다 H(#868686·알파 0.60)가 밝다.
  // 절대값이 아니라 **둘의 차**로 읽는다(막의 곱이 둘 다 노랗게 물들이므로).
  expect(hid.min).toBeGreaterThan(vis.min + 4)

  // ③ 파선이 아니다 — 은선을 따라 끊긴 곳이 없다(파선이면 여러 번 끊긴다)
  const rHid = inkRun(hid.cols, floor)
  expect(rHid.on).toBeGreaterThan(rHid.total * 0.9)
  expect(rHid.gaps).toBe(0)
  // 대조 — 보이는 선도 마찬가지로 이어진다(둘 다 실선이다)
  expect(inkRun(vis.cols, floor).gaps).toBe(0)

  // ③′ **양성 대조**(#74 ㉠의 짝 — 「0」은 그 척도가 0이 아닐 수 있어야 뜻이 있다):
  // 같은 실행에서 **일부러 끊은** 은선을 심으면 `gaps`가 실제로 오른다. 이 줄이 없으면
  // 「파선 픽셀 0」은 «척도가 아무것도 안 재는 경우»와 화면에서 구별되지 않는다.
  await page.evaluate(([y, x0, x1]) => {
    const b2 = (window as any).__b2
    const lay = b2.app.doc.layers[b2.app.doc.layers.length - 1]
    const mid = ((x0 as number) + (x1 as number)) / 2
    b2.diag.underlaySetForTest(lay.id, [
      { a: { x: x0 as number, y: y as number }, b: { x: mid - 40, y: y as number }, hidden: true },
      { a: { x: mid + 40, y: y as number }, b: { x: x1 as number, y: y as number }, hidden: true },
    ])
  }, [Y_HID, X0 - 20, X1 + 20] as const)
  await settle(page)
  const broken = (await rowProfile(page, Y_HID, X0, X1))!
  expect(inkRun(broken.cols, floor).gaps).toBeGreaterThan(0)
})

test('② 「가린 선 빼기」 옵션이 돈다 — 끄면 H 자리의 잉크가 사라지고 F는 남는다', async ({ page }) => {
  await boot(page)
  await yellowWithUnderlay(page)
  const floor = (await rowProfile(page, Y_BLANK, X0, X1))!.min
  expect((await rowProfile(page, Y_HID, X0, X1))!.min).toBeLessThan(floor - 12)

  // 표시 팝오버의 체크 상자 — **화면의 길**로 끈다(진단 손잡이가 아니라)
  await page.click('#btn-display')
  await page.uncheck('#chk-hidden')
  await settle(page)
  // 은선이 사라졌다 — 그 줄이 빈 줄의 바닥 대역으로 돌아온다
  expect((await rowProfile(page, Y_HID, X0, X1))!.min).toBeGreaterThan(floor - 12)
  // 보이는 선은 그대로다
  expect((await rowProfile(page, Y_VIS, X0, X1))!.min).toBeLessThan(floor - 12)

  // 되돌리면 돌아온다 — **굽기는 다시 안 돈다**(표시 손잡이일 뿐이다: 2-a)
  await page.check('#chk-hidden')
  await settle(page)
  expect((await rowProfile(page, Y_HID, X0, X1))!.min).toBeLessThan(floor - 12)
  expect(await page.evaluate(() => (window as any).__b2.diag.underlay()[0].segs)).toBe(2)
})

test('3부 ①④ — 면 0에서 안내가 뜨고 굽기는 정상으로 끝난다 · 두 번째에는 안 뜬다', async ({ page }) => {
  await boot(page)
  await page.click('#btn-roll-yellow')
  await settle(page)
  await expect(page.locator('#notice')).toContainText('면이 없어')
  await expect(page.locator('#notice u[data-pick="faces"]')).toBeVisible()
  const n1 = await page.evaluate(() => (window as any).__b2.diag.underlay())
  expect(n1.length).toBe(1)
  expect(n1[0].segs).toBeGreaterThan(0)          // 막지 않는다 — 굽기는 정상으로 끝난다

  // ④ 두 번째 옐로에서는 안 뜬다(잔소리가 되지 않는다)
  await page.evaluate(() => { document.getElementById('notice')!.textContent = '' })
  await page.click('#btn-roll-yellow')
  await settle(page)
  await expect(page.locator('#notice')).toHaveText('')
  expect(await page.evaluate(() => (window as any).__b2.diag.underlay().length)).toBe(2)
})

test('3부 ② — 면이 있으면 안내가 안 뜬다', async ({ page }) => {
  await boot(page)
  await page.click('#btn-face')
  await tap(page, 500, 530)                      // 삼각형 안 — 면 하나
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.faces.length)).toBe(1)

  await page.evaluate(() => { document.getElementById('notice')!.textContent = '' })
  await page.click('#btn-roll-yellow')
  await settle(page)
  await expect(page.locator('#notice')).not.toContainText('면이 없어')

  // **양성 대조**(#74 ㉠의 짝): 「안 뜬다」가 «안내가 아예 죽었다»와 구별되려면 같은
  // 실행에서 뜨는 자리가 있어야 한다. 면을 실행취소로 없애고 한 장 더 얹으면 뜬다.
  await page.click('#btn-undo')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.faces.length)).toBe(0)
  await page.click('#btn-roll-yellow')
  await settle(page)
  await expect(page.locator('#notice')).toContainText('면이 없어')
})

test('3부 ③ — 안내의 「면 만들기」가 면 일괄을 실제로 연다', async ({ page }) => {
  await boot(page)
  // 닫힌 영역은 있지만 **면으로 확정하지는 않은** 상태 — 안내가 뜨고 그 길이 일괄로 간다
  await page.click('#btn-roll-yellow')
  await settle(page)
  await expect(page.locator('#notice u[data-pick="faces"]')).toBeVisible()
  await page.click('#notice u[data-pick="faces"]')
  await settle(page)
  // 면 도구로 옮겨 갔고 후보가 섰다(팝오버에 「확정 N」이 있다)
  await expect(page.locator('#btn-face')).toHaveClass(/on/)
  await expect(page.locator('#btn-face-commit')).toBeVisible()
})
