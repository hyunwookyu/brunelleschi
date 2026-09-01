// web2-29 1단계 — **화면** 게이트. 단위 팔(`test/dimwrite29.test.ts`)이 모형과 상태를 잰다.
// 여기서 재는 것은 **손이 실제로 그 길을 걸을 수 있는가**와 **치수선이 실제로 보이는가**다.
//
// ⚠⚠ #75 ㉠ — 만드는 자리와 보이는 자리. 치수는 지금까지 화면에 **한 번도 안 그려졌다**:
//   `Stroke.dim`은 리프팅의 입력이고 보이는 자리가 없었다. 이 회차가 그 자리를 만들었으므로
//   **「값을 넣었다」가 아니라 「화면에 떴다」로** 판정한다.
// ⚠ #74 ㉠ — 「겹의 치수가 안 보인다」는 **치수를 아예 안 그려도** 통과한다. 그래서 같은
//   실행에서 **종이의 치수는 실제로 보인다**를 분해능으로 짝지운다.

import { test, expect, type Page } from '@playwright/test'
import { clearStore } from './store43'
import { settleSlide } from './slidesettle'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await clearStore(page)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  await drawLine(page, 500, 560, 500, 660)      // 치수를 매길 세로선
}

/** #ink의 조각에서 «비어 있지 않은» 픽셀 수 — 치수선·글자가 여기 그려진다 */
const inkPixels = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x, y, w, h]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const g = c.getContext('2d')!
    const k = window.devicePixelRatio || 1
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) n++
    return n
  }, [x, y, w, h] as const)

test('① 치수선이 실제로 화면에 뜬다 (+분해능: 값을 넣기 전에는 없다)', async ({ page }) => {
  await boot(page)
  const id = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return a.doc.strokes[a.doc.strokes.length - 1].id as number
  })
  // 치수선은 그 선의 **화면 수직으로 오프셋된 자리**에 선다(C.DIM_OFFSET_PX = 14).
  // 세로선의 화면 법선은 (−dy, dx)/L = (−1, 0)이라 **왼쪽**이다 — 띠를 양쪽으로 잡는다.
  const band = { x: 460, y: 565, w: 80, h: 90 }
  const before = await inkPixels(page, band.x, band.y, band.w, band.h)
  await page.evaluate((sid) => {
    const b2 = (window as any).__b2
    b2.diag.setDimForTest(sid, 2500)
  }, id)
  await settle(page)
  const after = await inkPixels(page, band.x, band.y, band.w, band.h)
  console.log(`[29-1 화면 ①] 치수 넣기 전 ${before}px → 후 ${after}px`)
  expect(after, '치수선·값이 그려진다').toBeGreaterThan(before + 40)
})

test('② 손으로 써서 치수가 들어간다 — 도구 → 탭 → 쓰기 → 받는다', async ({ page }) => {
  await boot(page)
  // 치수 도구를 고른다 — **패널 안의 「종이에 쓰기」**다. 리본의 치수 단추는 패널만 연다
  // (그것이 도구까지 바꾸면 web2-10의 키패드·음성 경로가 죽는다 — `dim.spec` 둘이 잡았다).
  await page.click('#dim-toggle')
  await page.click('#btn-dim-write')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('dim')
  expect(await page.textContent('#notice')).toContain('탭')
  // 대상 탭
  await page.mouse.click(500, 610)
  await settle(page)
  const picked = await page.evaluate(() => (window as any).__b2.app.dimPick)
  console.log(`[29-1 화면 ②] 고른 대상 ${picked}`)
  expect(picked).not.toBeNull()
  expect(await page.textContent('#notice')).toContain('숫자를 쓴다')
  // 종이 위에 쓴다 — **획이 문서에 안 들어간다**(손글씨다)
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 300, 300, 300, 340)
  const st = await page.evaluate(() => ({
    strokes: (window as any).__b2.app.doc.strokes.length,
    ink: (window as any).__b2.app.dimInk.length,
  }))
  console.log(`[29-1 화면 ②] 획 ${n0} → ${st.strokes} · 손글씨 ${st.ink}`)
  expect(st.strokes, '손글씨는 문서에 안 들어간다').toBe(n0)
  expect(st.ink, '손글씨로 들어간다').toBe(1)
  // 인식은 비동기다 — 물음이 뜨거나(읽었다) 「다시 쓴다」가 뜬다(못 읽었다). 둘 다 정상.
  await page.waitForFunction(() => {
    const t = document.getElementById('notice')?.textContent ?? ''
    return t.includes('치수') && (t.includes('받는다') || t.includes('다시 쓴다'))
  }, undefined, { timeout: 5000 })
  const notice = await page.textContent('#notice')
  console.log(`[29-1 화면 ②] 인식 뒤 알림: "${notice}"`)
  // 손으로 쓴 「1」은 읽힐 수도 아닐 수도 있다 — **값을 넣는 길 자체**는 진단 손잡이로 잰다.
  await page.evaluate(() => (window as any).__b2.diag.stageDimForTest('2500', 2500))
  await page.click('#notice u[data-pick="yes"]')
  await settle(page)
  const done = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { dim: a.doc.strokes.find((s: any) => s.dim !== undefined)?.dim ?? null, ink: a.dimInk.length, pick: a.dimPick }
  })
  console.log(`[29-1 화면 ②] 받은 뒤 — dim ${done.dim} · 손글씨 ${done.ink} · 대상 ${done.pick}`)
  expect(done.dim).toBe(2500)
  expect(done.ink, '받으면 손글씨가 사라진다').toBe(0)
  expect(done.pick, '대상도 놓는다').toBeNull()
})

test('③ 못 읽으면 손글씨가 남는다 — 「다시」를 눌러야 지워진다', async ({ page }) => {
  await boot(page)
  await page.click('#dim-toggle')
  await page.click('#btn-dim-write')
  await page.mouse.click(500, 610)
  await settle(page)
  await drawLine(page, 300, 300, 340, 320)        // 숫자가 아닌 획
  await page.waitForFunction(() => (document.getElementById('notice')?.textContent ?? '').includes('치수'),
    undefined, { timeout: 5000 })
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { ink: a.dimInk.length, staged: a.dimStaged, notice: document.getElementById('notice')?.textContent }
  })
  console.log(`[29-1 화면 ③] 손글씨 ${st.ink} · staged ${JSON.stringify(st.staged)} · "${st.notice}"`)
  expect(st.ink, '못 읽어도 손글씨가 남는다').toBeGreaterThan(0)
  expect(st.staged?.mm ?? null, '값이 안 섰다').toBeNull()
  expect(await page.evaluate(() => (window as any).__b2.app.dimPick), '대상도 그대로다').not.toBeNull()
})

test('④ 겹에서 쓴 치수가 아래 종이에 안 나타난다 (26-1 회귀) — 분해능 짝', async ({ page }) => {
  await boot(page)
  const ids = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const a = b2.app
    const paperId = a.doc.strokes[a.doc.strokes.length - 1].id
    b2.diag.setDimForTest(paperId, 2500)          // 종이의 치수 — **분해능**이다
    return { paperId }
  })
  await settle(page)
  const bandPaper = { x: 460, y: 565, w: 80, h: 90 }
  const paperOn = await inkPixels(page, bandPaper.x, bandPaper.y, bandPaper.w, bandPaper.h)
  // 겹을 얹고 그 위에 선을 그어 치수를 준다
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="tracing"]')
  await settleSlide(page)     // web2-40 2번 — 덜 온 종이를 재지 않는다(그 파일 머리주석)
  await settle(page)
  await drawLine(page, 620, 560, 620, 680)
  const layId = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const a = b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    b2.diag.setDimForTest(s.id, 3000)
    return { stroke: s.id, layer: s.layer }
  })
  await settle(page)
  const bandLayer = { x: 580, y: 565, w: 80, h: 110 }
  const layerOn = await inkPixels(page, bandLayer.x, bandLayer.y, bandLayer.w, bandLayer.h)
  // 겹을 끈다
  await page.click('#layer-summary')
  await page.locator(`#layer-list [data-layer="${layId.layer}"] .leye`).click()
  await settle(page)
  const layerOff = await inkPixels(page, bandLayer.x, bandLayer.y, bandLayer.w, bandLayer.h)
  const paperStill = await inkPixels(page, bandPaper.x, bandPaper.y, bandPaper.w, bandPaper.h)
  console.log(`[29-1 화면 ④] 겹 치수 켬 ${layerOn}px → 끔 ${layerOff}px · 종이 치수 ${paperOn}px → ${paperStill}px`)
  expect(layerOn, '겹의 치수가 실제로 그려졌다(분해능)').toBeGreaterThan(40)
  expect(layerOff, '겹을 끄면 그 치수도 사라진다').toBeLessThan(layerOn / 3)
  expect(paperStill, '종이의 치수는 그대로 보인다 — 그래서 ④가 «안 그려서» 통과한 것이 아니다')
    .toBeGreaterThan(paperOn / 2)
})
