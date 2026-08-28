// web2-22 1부 ⑤ — **옐로 획은 그 종이에서만 보인다**(2D · 픽셀) + 안내(1-d) + 포즈 게이트.
//
//   ㉠ 옐로에 그은 획이 그 종이·그 시점에서 보인다(#layerc — 활성 겹 위 획의 자리)
//   ㉡ 다른 종이로 가면 안 보이고 **안내 한 줄**이 뜬다(1-d — 「사라졌다」 오독 방지)
//   ㉢ 돌아오면 다시 보인다
//   ㉣ 궤도로 시점을 벗어나면 사라진다(2D는 붙일 자리가 없다 — 막과 같은 게이트)

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

/** 캔버스 id의 상자 안 알파>0 픽셀 수 */
function countPixels(page: Page, id: string, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([id, x0, y0, x1, y1]) => {
    const c = document.getElementById(id as string) as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      Math.max(1, Math.round(((x1 as number) - (x0 as number)) * dpr)),
      Math.max(1, Math.round(((y1 as number) - (y0 as number)) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [id, x0, y0, x1, y1] as const)
}

test('⑤ 옐로 2D — 그 종이·그 시점에서만 보인다 · 떠나면 안내 · 돌아오면 복귀 · 궤도에 사라짐', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 카메라 닫기(수평 앵커 + 소실점 획) + 옐로 한 장
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  await page.click('#btn-roll-yellow'); await settle(page)
  // 옐로 자유 획 — 화면 가운데 대각(축이 없다)
  await drawLine(page, 420, 250, 640, 330)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { layer: s.layer, lifted: a.lift.lifted.has(s.id), waiting: a.lift.waiting.includes(s.id) }
  })
  expect(st.layer).not.toBeUndefined()
  expect(st.lifted).toBe(false)
  expect(st.waiting).toBe(false)
  // ㉠ 보인다 — 활성 겹 위 획의 자리(#layerc)
  const box = [500, 270, 560, 300] as const
  const own = await countPixels(page, 'layerc', ...box)
  expect(own).toBeGreaterThan(0)
  // ㉡ 다른 종이(궤도로 시점을 바꿔 「+」 저장)로 가면 안 보이고 안내가 뜬다
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 20; i++) await page.mouse.move(600 + i * 6, 400 + i)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  await page.click('#paper-add')
  await page.keyboard.press('Escape')   // 새 탭의 이름 편집기를 닫는다(paperbar.spec 규약)
  await settle(page)
  const other = await countPixels(page, 'layerc', ...box)
    + await countPixels(page, 'brushc', ...box)
  expect(other).toBe(0)
  await expect(page.locator('#notice')).toContainText('옐로 스케치는 그 종이 위의 2D다')
  // ㉢ 작도 종이로 돌아오면 다시 보인다 — 종이를 바꾸면 활성 겹이 풀리므로(#54 규약)
  // 이제 그리는 자리는 #brushc다(활성일 때는 #layerc — 두 캔버스 합으로 판독)
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  expect(await countPixels(page, 'layerc', ...box) + await countPixels(page, 'brushc', ...box)).toBeGreaterThan(0)
  // ㉣ 궤도로 시점만 벗어나도(같은 종이) 사라진다 — 2D는 붙일 자리가 없다
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 15; i++) await page.mouse.move(600 + i * 5, 400)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  expect(await countPixels(page, 'layerc', ...box) + await countPixels(page, 'brushc', ...box)).toBe(0)
  // 복귀(작도 시점) — 돌아온다(같은 두 캔버스 합)
  await page.click('#btn-draw-view'); await settle(page)
  expect(await countPixels(page, 'layerc', ...box) + await countPixels(page, 'brushc', ...box)).toBeGreaterThan(0)
})

test('2부 — 후행 확정: 머무르면 반듯(수평 붙음·표식·raw 소멸) · 안 머무르면 자유 그대로', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  await page.click('#btn-roll-yellow'); await settle(page)
  // ── 머무름: (300,300) → (520,310) = 2.6°(대역 안) — 끝에서 800ms 머무르고 뗀다 ──
  await page.mouse.move(300, 300)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(300 + i * 27.5, 300 + i * 1.25)
  await page.waitForTimeout(800)                       // C.HOLD_MS(600) + 타이머 여유
  // 표식 — 반듯해진 순간 끝점의 무채색 고리(#ink · 순간 피드백)
  const ring = await countPixels(page, 'ink', 508, 288, 532, 312)
  expect(ring).toBeGreaterThan(0)
  await page.mouse.up(); await settle(page)
  const held = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { a: s.a, b: s.b, raw: s.raw?.length ?? 0 }
  })
  expect(held.b.y).toBe(held.a.y)                      // 정확한 수평 — 반듯해졌다
  expect(held.raw).toBe(0)                             // 직선화 — 손떨림(raw)이 안 남는다
  // ── 대조: 같은 몸짓을 머무름 없이 — 자유 각도 그대로 ──
  await page.mouse.move(300, 400)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(300 + i * 27.5, 400 + i * 1.25)
  await page.mouse.up(); await settle(page)
  const free = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { a: s.a, b: s.b }
  })
  expect(free.b.y).toBeGreaterThan(free.a.y + 5)       // 처짐이 그대로다(≈10px)
})
