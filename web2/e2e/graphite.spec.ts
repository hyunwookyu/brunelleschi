// web2-19 1부 — **획은 흑연이다.** 소실점 정의선(label 'vp')의 몸체에서 안내 파랑을
// 뺐다 — 몸체는 언제나 재료색이고, 「이 획이 소실점을 만든다」는 **생길 자리의 파선 ✕**가
// 말한다(1-b). 여기가 그 회귀 팔이다:
//   ① 몸체가 흑연 — 그리는 중 #ink(벡터 미리보기 겹)에 **파랑 픽셀 0** + 몸체가 실제로
//      있다(#gl의 Line2 픽셀 > 0 — 없으면 «파랑 0»은 아무것도 안 잰 격자다, #69 ㉣).
//   ①-반증(D-3) — **파랑을 일부러 살려**(진단 손잡이 __b2.diag.forceConstructing) 같은
//      격자가 빨개지는 것을 본다. 손잡이 없이 코드를 되살리는 대신 판정식을 그대로 태우는
//      전용 통로다 — 격자가 실패 가능함을 매 실행 증명한다.
//   ② 파선 ✕가 예상 자리에 — draft.vp 좌표가 획 연장 ∩ 지평선(값 대조는 단위 팔
//      graphite.test.ts가 정본 — 여기서는 그 자리 둘레에 픽셀이 실제로 생기는 것).
//   ③ 떼는 순간 몸체 무변화 — 몸체 대역(끝점·✕·지평선 밖) 합성 diff ≈ 0.
//   ④ 면 미리보기 색 그대로 — 초록(«만든다»)이 남아 있다(1-b ⚠ — 예고이지 몸체가 아니다).
//
// 조건(#71): dpr 둘 다 · 기본 렌더러(brush) · 뷰 1200×800(지평선 400).

import { test, expect, type Page } from '@playwright/test'
import { PIXEL_DIFF_CH } from './thresholds'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 캔버스 창의 픽셀을 (r,g,b,a) 평탄 배열로 — dpr는 캔버스 백버퍼 크기가 진다 */
function pixelsOf(page: Page, id: string, x0: number, y0: number, w: number, h: number) {
  return page.evaluate(([id, x0, y0, w, h]) => {
    const c = document.getElementById(id as string) as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    return [...t.getContext('2d')!.getImageData(
      Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      Math.max(1, Math.round((w as number) * dpr)), Math.max(1, Math.round((h as number) * dpr)),
    ).data]
  }, [id, x0, y0, w, h] as const)
}

/** 안내 파랑(COL.preview #1a6ac2 · r26 g106 b194) 판정 — 파랑이 지배적인 픽셀.
 *  흑연(무채색 — 채널 차 작음)·면 초록(g 지배)·축 안내 #555와 안 겹친다. */
function countBlue(d: number[]): number {
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! > 0 && d[i + 2]! > 150 && d[i]! < 100 && d[i + 2]! - d[i]! > 80) n++
  }
  return n
}
function countAlpha(d: number[]): number {
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
  return n
}
/** 면 미리보기 초록(COL.snap #1a9c50 · r26 g156 b80) — g 지배 픽셀 */
function countGreen(d: number[]): number {
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! > 0 && d[i + 1]! > 110 && d[i + 1]! - d[i]! > 50 && d[i + 1]! - d[i + 2]! > 40) n++
  }
  return n
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

// 픽스처 — 수평 앵커(280,560→700,560: 첫 화면 평행 획 = 앵커·승격) 위 (500,560)에서
// 시작해 지평선 쪽으로 (800,480). 이 획의 미리보기 라벨은 'vp'다(수리 전 = 파랑 몸체).
// 소실점이 생길 자리: 연장 ∩ 지평선 = (1100, 400) — 화면 안(W=1200), 몸체 대역과 떨어져 있다.
const VP_X = 1100, VP_Y = 400
/** 몸체 대역 — 획 가운데(620~680 구간, y 495~535). 끝점·✕·지평선·앵커 줄이 전부 밖이다. */
const BAND = [620, 495, 60, 40] as const

async function fixture(page: Page) {
  await boot(page)
  await drawLine(page, 280, 560, 700, 560)
}

/** vp 획을 긋는 중간까지 — 뗄지는 호출자가 정한다 */
async function dragVpStroke(page: Page) {
  await page.mouse.move(500, 560)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(500 + 30 * i, 560 - 8 * i)
  await settle(page)
}

test('① 몸체가 흑연 — vp 정의선 미리보기에 파랑 픽셀 0 · 몸체는 실제로 있다', async ({ page }) => {
  await fixture(page)
  await dragVpStroke(page)
  const label = await page.evaluate(() => (window as any).__b2.diag.draft()?.label ?? null)
  expect(label, '이 픽스처가 소실점 정의선을 재고 있다').toBe('vp')
  const ink = await pixelsOf(page, 'ink', ...BAND)
  expect(countBlue(ink), '벡터 미리보기 겹의 몸체 대역 — 파랑 0').toBe(0)
  // «파랑 0»이 «아무것도 없음»이 아니다(#69 ㉣) — 몸체는 Line2(#gl)에 실제로 있다
  const gl = await pixelsOf(page, 'gl', ...BAND)
  expect(countAlpha(gl), '몸체(Line2)가 그 대역에 있다').toBeGreaterThan(20)
  await page.mouse.up()
  await settle(page)
})

test('①-반증(D-3) — 파랑을 일부러 살리면 같은 격자가 빨개진다', async ({ page }) => {
  await fixture(page)
  // 진단 손잡이 — 판정식(countBlue·BAND)이 실패 **가능**함을 그 판정식 그대로 증명한다
  await page.evaluate(() => { (window as any).__b2.diag.forceConstructing(true) })
  await dragVpStroke(page)
  const ink = await pixelsOf(page, 'ink', ...BAND)
  expect(countBlue(ink), '되살린 파랑이 같은 격자에 걸린다').toBeGreaterThan(0)
  await page.mouse.up()
  await page.evaluate(() => { (window as any).__b2.diag.forceConstructing(false) })
})

test('② 파선 ✕ — 소실점이 생길 자리에 예고가 뜬다 (좌표는 단위 팔이 정본)', async ({ page }) => {
  await fixture(page)
  // 긋기 전 — 그 자리는 비어 있다(지평선은 y=400 한 줄이라 세로로 벗어난 픽셀이 없다)
  const before = await pixelsOf(page, 'ink', VP_X - 8, VP_Y - 8, 16, 16)
  await dragVpStroke(page)
  const vp = await page.evaluate(() => (window as any).__b2.diag.draft()?.vp ?? null)
  expect(vp, 'draft가 소실점 자리를 안다').not.toBeNull()
  expect(Math.abs(vp.x - VP_X)).toBeLessThan(1e-6)
  expect(Math.abs(vp.y - VP_Y)).toBeLessThan(1e-6)
  const during = await pixelsOf(page, 'ink', VP_X - 8, VP_Y - 8, 16, 16)
  expect(countAlpha(during) - countAlpha(before), '✕ 픽셀이 생겼다').toBeGreaterThan(8)
  await page.mouse.up()
  await settle(page)
})

test('③ 떼는 순간 몸체 무변화 — 몸체 대역 합성 diff ≈ 0', async ({ page }) => {
  await fixture(page)
  await dragVpStroke(page)
  const before = await shot(page, ...BAND)
  await page.mouse.up()
  await settle(page)
  const after = await shot(page, ...BAND)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { lifted: a.lift.lifted.has(s.id), n: a.doc.strokes.length }
  })
  expect(st.n, '획이 실제로 확정됐다').toBe(2)
  expect(st.lifted, '소실점 정의선이 3D로 올라갔다(지면 규칙)').toBe(true)
  // 대역: 몸체만(끝점·✕·지평선 밖). draftgate와 같은 채널 문턱이다.
  expect(diffCount(before, after), '몸체 무변화').toBeLessThanOrEqual(8)
})

test('④ 면 미리보기 색 그대로 — «만든다»의 초록이 남아 있다', async ({ page }) => {
  await boot(page)
  // face.spec의 지면 삼각형 그대로
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  await page.click('#btn-face')
  await page.mouse.move(500, 530)
  await settle(page)
  const win = await pixelsOf(page, 'ink', 470, 515, 60, 30)
  expect(countGreen(win), '면 미리보기가 초록으로 두른다').toBeGreaterThan(0)
})
