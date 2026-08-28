// web2-19 2부 — **종이 탭 띠**(views.spec를 대체한다: 명명된 뷰가 종이가 됐다).
// 회귀 팔의 e2e 몫: ③(「+」가 지금 포즈·뷰를 담는다 — 값으로) ④(탭 = 그 포즈 ·
// 작도 종이 = DRAW_POSE+drawView) ⑤(종이 삭제가 획을 안 지운다) ⑥(작도 종이는 삭제
// 항목이 없다) ⑦(띠 아래에 다른 줄이 붙는다 — web2-20의 조건) + 이름 편집(두 번 탭) ·
// 길게 눌러 썸네일 · v1 파일 열기(① 마이그레이션의 배선판 — 값 정본은 sheets.test).
// 썸네일 비용 원장(㉮/㉯ — web2-12 5번)은 그대로 잇는다: views_thumb_web2.json.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율·#71 ㉠의 문 — web2-24 3부 전면화).
  // 팔은 그대로 돈다 — 원장만 안 덮는다. 정본 명령: LEDGER=1 npx playwright test paperbar --workers=1
  if (process.env.LEDGER !== '1') return
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/views_thumb_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-12 5번 → web2-19 2부(${testInfo.project.name}) — 종이 썸네일의 실측: 한 장 바이트·「+」 소요 ms·종이 1/5/20에서의 .brnl 크기. e2e paperbar.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: '썸네일 = C.THUMB_W(px) 폭 JPEG(품질 0.72 — 동작점 AS-C39). add_ms = 「+」 click 왕복(굽기+띠 갱신 포함) · capture_ms = **굽기만**(diag.captureThumb) · regen_view_ms = **기각된 대안 ㉯**(열 때 다시 굽기 — web2-12 5번에서 기각)이 들었을 종이당 몫(이동+전량 재그리기+굽기) — 기각 근거를 매 실행 다시 재는 값이다(#57: 기각을 산 채로 재는 채널). brnl_bytes_*는 같은 문서(획 셋)에서 종이 수만 는 값(작도 종이 제외 수).',
    baseline_622e9ac_thumb_bytes_median: 1499,
    conditions: {
      workers: testInfo.config.workers, project: testInfo.project.name,
      time_validity: '⚠ 시간 칸(add_ms·capture_ms·regen_view_ms)은 이 conditions.workers에서 나온 값이다 — 워커가 1이 아니면 dpr 겹침 몫이 섞여 **전/후 비교로는 무효**다(#71 ㉠ — test_cost·cost18과 같은 규약). 시간 비교의 정본은 --workers=1 단독 실행이고, 여기 값은 대역 감각용이다',
    },
    ...ledger,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function fixture(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(500, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(500, 560 - 9 * i)
  await page.mouse.up(); await settle(page)
}

const pose = (page: Page) => page.evaluate(() => (window as any).__b2.app.pose)
const sheets = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.sheets)
const strokeN = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
/** 「+」 — 만든 탭의 이름 입력이 열리므로 Escape로 닫고 기본 이름을 둔다 */
async function addPaper(page: Page) {
  await page.click('#paper-add')
  await page.keyboard.press('Escape')
  await settle(page)
}

test('③④⑤⑥ — 「+」·탭 복귀·삭제(획 불변)·작도 종이 · 비용 원장', async ({ page }) => {
  test.setTimeout(90_000)
  await fixture(page)

  // 띠가 늘 떠 있다 — 작도 종이 탭 하나 + 「+」
  expect(await page.locator('#paperbar .ptab[data-sheet]').count()).toBe(1)
  await expect(page.locator('#paperbar .ptab[data-sheet="0"]')).toHaveText('작도')

  // ③ 「+」 = 지금 포즈·뷰를 담는다 — 궤도한 상태에서 저장하고 값으로 대조
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 10; i++) await page.mouse.move(600 + i * 8, 400)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  const posedB = await pose(page)
  await addPaper(page)
  const s1 = await page.evaluate(() => {
    const sh = (window as any).__b2.app.doc.sheets
    const s = sh[sh.length - 1]
    return { name: s.name, pose: s.pose, thumb: s.thumb?.slice(0, 15) ?? null, bytes: s.thumb?.length ?? 0 }
  })
  expect(s1.name).toBe('종이 2')
  expect(Math.abs(s1.pose.q.y - posedB.q.y)).toBeLessThan(1e-9)
  expect(s1.thumb).toBe('data:image/jpeg')
  expect(s1.bytes).toBeGreaterThan(500)   // 빈 문자열·깨진 캡처가 아니다

  // ④ 작도 탭 → DRAW_POSE · 종이 탭 → 그 포즈
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  const atDraw = await pose(page)
  expect(Math.abs(atDraw.q.y)).toBeLessThan(1e-12)
  expect(Math.abs(atDraw.q.w - 1)).toBeLessThan(1e-12)
  const id1 = (await sheets(page))[1].id
  await page.click(`#paperbar .ptab[data-sheet="${id1}"]`); await settle(page)
  const back = await pose(page)
  expect(Math.abs(back.q.y - posedB.q.y)).toBeLessThan(1e-9)

  // 길게 누르면 — 썸네일 팝업(⑥의 절반: 작도 종이 팝업에는 «지운다»가 없다)
  const tab1 = page.locator(`#paperbar .ptab[data-sheet="${id1}"]`)
  const bb = (await tab1.boundingBox())!
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)          // C.PAPER_LONGPRESS_MS(500) 위
  await page.mouse.up(); await settle(page)
  await expect(page.locator('#paper-pop img')).toHaveCount(1)
  await expect(page.locator('#paper-pop u[data-pick="delete"]')).toHaveCount(1)

  // ⑤ 삭제 — 확인 한 번. **획 수는 전후 동일**(종이는 획을 소유하지 않는다 — 이 회차)
  const nBefore = await strokeN(page)
  await page.click('#paper-pop u[data-pick="delete"]'); await settle(page)
  expect((await sheets(page)).length).toBe(2)               // 확인 전에는 안 지워진다
  await page.click('#paper-pop u[data-pick="yes"]'); await settle(page)
  const nAfter = await strokeN(page)
  expect((await sheets(page)).length).toBe(1)
  expect(nAfter).toBe(nBefore)
  // 게이트 ⑤의 값을 원장에 남긴다(2차 리뷰 [4] — 게이트 판정이 원장 밖 산문에 살지 않게)
  ledger['gate_5_delete'] = { strokes_before: nBefore, strokes_after: nAfter, sheets_before: 2, sheets_after: 1 }
  // 지운 종이를 보고 있었다 — 작도로 돌아온다
  const afterDel = await pose(page)
  expect(Math.abs(afterDel.q.y)).toBeLessThan(1e-12)

  // ⑥ 작도 종이 — 길게 눌러도 «지운다»가 없다
  const tab0 = page.locator('#paperbar .ptab[data-sheet="0"]')
  const b0 = (await tab0.boundingBox())!
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up(); await settle(page)
  await expect(page.locator('#paper-pop')).toHaveCount(1)
  await expect(page.locator('#paper-pop u[data-pick="delete"]')).toHaveCount(0)
  await page.mouse.click(400, 400); await settle(page)      // 바깥 — 닫힌다
  await expect(page.locator('#paper-pop')).toHaveCount(0)

  // 비용 — 종이 1·5·20에서 .brnl 크기(web2-12 5번의 원장을 잇는다)
  const brnl = () => page.evaluate(() => (window as any).__b2.diag.capture().brnlBytes)
  const t0 = Date.now()
  await addPaper(page)
  const addTimes: number[] = [Date.now() - t0]
  const b1 = await brnl()
  const thumbBytes: number[] = []
  while ((await sheets(page)).length - 1 < 20) {
    const t = Date.now()
    await addPaper(page)
    addTimes.push(Date.now() - t)
    thumbBytes.push(await page.evaluate(() => {
      const sh = (window as any).__b2.app.doc.sheets
      return sh[sh.length - 1].thumb.length
    }))
    if ((await sheets(page)).length - 1 === 5) ledger['brnl_bytes_5'] = await brnl()
  }
  const b20 = await brnl()
  const capMs: number[] = []
  for (let i = 0; i < 10; i++) {
    capMs.push(await page.evaluate(() => {
      const d = (window as any).__b2.diag
      const t = performance.now()
      d.captureThumb()
      return performance.now() - t
    }))
  }
  const regenMs: number[] = []
  for (let i = 1; i <= 20; i++) {
    regenMs.push(await page.evaluate((idx) => {
      const b = (window as any).__b2
      const sh = b.app.doc.sheets[idx]
      const t = performance.now()
      b.app.view = { ...sh.view }
      b.app.pose = { p: { ...sh.pose.p }, q: { ...sh.pose.q } }
      b.diag.brushRedrawMs()
      b.diag.captureThumb()
      return performance.now() - t
    }, i))
  }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
  ledger['capture_ms_median'] = Number(med(capMs).toFixed(2))
  ledger['regen_view_ms_median'] = Number(med(regenMs).toFixed(2))
  ledger['regen_view_ms_max'] = Number(Math.max(...regenMs).toFixed(2))
  thumbBytes.sort((a, b2) => a - b2)
  addTimes.sort((a, b2) => a - b2)
  ledger['thumb_bytes_median'] = thumbBytes[Math.floor(thumbBytes.length / 2)]
  ledger['add_ms_median'] = addTimes[Math.floor(addTimes.length / 2)]
  ledger['add_ms_max'] = addTimes[addTimes.length - 1]
  ledger['brnl_bytes_1'] = b1
  ledger['brnl_bytes_20'] = b20
  console.log(`[측정] 종이 썸네일 — 장 중앙 ${ledger['thumb_bytes_median']}B · 「+」 중앙 ${ledger['add_ms_median']}ms 최악 ${ledger['add_ms_max']}ms · .brnl 종이1 ${b1}B 종이5 ${ledger['brnl_bytes_5']}B 종이20 ${b20}B · 굽기만 중앙 ${ledger['capture_ms_median']}ms · ㉯ 한 장 몫 중앙 ${ledger['regen_view_ms_median']}ms`)

  // 탭이 20개여도 띠가 눈 띠(#eyebar) 앞에서 멈춘다(#paperbar overflow-x — web2-19 3부
  // 전량에서 실제로 걸렸다: 띠가 눈을 덮어 「+」 클릭이 가로채였다)
  const barBox = (await page.locator('#paperbar').boundingBox())!
  const eyeBox = (await page.locator('#eyebar').boundingBox())!
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(eyeBox.x - 1)
})

test('이름 — 두 번 탭이 편집을 연다 · 문서에 남는다(⑦의 e2e 몫)', async ({ page }) => {
  await fixture(page)
  await addPaper(page)
  const id1 = (await sheets(page))[1].id
  await page.dblclick(`#paperbar .ptab[data-sheet="${id1}"]`)
  const input = page.locator('#paperbar .ptab-edit')
  await expect(input).toHaveCount(1)
  await input.fill('남측 입면')
  await input.press('Enter'); await settle(page)
  await expect(page.locator(`#paperbar .ptab[data-sheet="${id1}"]`)).toHaveText('남측 입면')
  expect((await sheets(page))[1].name).toBe('남측 입면')
  // 저장 파일에도 남는다 — 앱과 같은 직렬화(진단 통로)
  const bytes = await page.evaluate(() => (window as any).__b2.diag.capture().brnlBytes)
  expect(bytes).toBeGreaterThan(0)
})

test('① 배선 — v1 파일을 열면 명명된 뷰가 종이 탭으로 선다(값 정본은 sheets.test)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  const old = JSON.stringify({
    format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
    strokes: [{ id: 1, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } }],
    nextId: 2,
    savedViews: [{ pose: { p: { x: 0, y: 1.6, z: -3 }, q: { x: 0, y: 0.3, z: 0, w: 0.954 } },
      view: { s: 1, ox: 0, oy: 0 } }],
  })
  await page.setInputFiles('#file-open', { name: 'old.brnl', mimeType: 'application/json', buffer: Buffer.from(old) })
  await settle(page)
  const sh = await sheets(page)
  expect(sh.length).toBe(2)
  expect(sh[0].name).toBe('작도')
  expect(sh[1].name).toBe('종이 2')
  // 탭 둘 + «+»가 띠에 실제로 섰고, 종이 탭이 그 포즈로 간다
  expect(await page.locator('#paperbar .ptab[data-sheet]').count()).toBe(2)
  await page.click(`#paperbar .ptab[data-sheet="${sh[1].id}"]`); await settle(page)
  const q = await page.evaluate(() => (window as any).__b2.app.pose.q.y)
  expect(Math.abs(q - 0.3)).toBeLessThan(1e-9)
})

test('⑦ 띠 아래에 다른 줄이 붙을 수 있다 — web2-20의 자리(고정 높이 없음)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 종속 탭 줄을 실제로 붙여 본다 — 붙인 줄이 띠 «아래»에 서면 자리가 열려 있는 것이다
  const rects = await page.evaluate(() => {
    const top = document.getElementById('topleft')!
    const row = document.createElement('div')
    row.id = 'test-underlay-row'
    row.textContent = '종속 탭 자리'
    row.style.font = '12px system-ui'
    top.append(row)
    const bar = document.getElementById('paperbar')!.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    row.remove()
    return { barBottom: bar.bottom, rowTop: r.top, rowLeft: r.left, barLeft: bar.left }
  })
  expect(rects.rowTop).toBeGreaterThanOrEqual(rects.barBottom - 0.5)   // 아래에 붙었다
  expect(Math.abs(rects.rowLeft - rects.barLeft)).toBeLessThan(20)     // 같은 기둥이다
})
