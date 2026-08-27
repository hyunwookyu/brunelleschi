// web2-12 5번 — 명명된 뷰: 번호가 아니라 **썸네일**로 고르고, 삭제할 수 있다.
// 썸네일은 저장 시점에 굽는다(㉮) — 한 장의 바이트·생성 시간·뷰 수(1·5·20)에 따른
// .brnl 크기를 원장(views_thumb_web2.json)에 남긴다(지시 문면 그대로).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/views_thumb_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-12 5번(${testInfo.project.name}) — 뷰 썸네일의 실측: 한 장 바이트·저장 탭 소요 ms·뷰 1/5/20에서의 .brnl 크기. e2e views.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: '썸네일 = C.THUMB_W(px) 폭 JPEG(품질 0.72 — 동작점 AS-C39). save_ms = «시점 저장» 버튼 click 왕복(굽기+목록 갱신 포함) · capture_ms = **굽기만**(diag.captureThumb — ㉮의 결정이 딛는 양. 2차 [8]·#49) · regen_view_ms = **㉯의 한 뷰 몫**(gotoView+전량 재그리기+굽기 — «열 때 다시 그린다»면 뷰마다 이만큼 든다). brnl_bytes_*는 같은 문서(획 셋)에서 뷰 수만 는 값.',
    // 기준값 보존(#47·web2-17 2차 [16]) — 잠복 결함 인과의 «전» 값. 622e9ac에서 실측한
    // 상수라 재실행에 안 낡는다(그 커밋의 화면에는 상시 지평선·대기 파선이 없었다).
    baseline_622e9ac_thumb_bytes_median: 1499,
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

test('썸네일 저장·펼침·선택 복귀·삭제 — 그리고 뷰 수에 따른 비용 원장', async ({ page }) => {
  test.setTimeout(90_000)
  await fixture(page)

  // 저장 — 썸네일이 실린다
  const t0 = Date.now()
  await page.click('#btn-save-view')
  const saveMs = Date.now() - t0
  const v0 = await page.evaluate(() => {
    const v = (window as any).__b2.app.savedViews[0]
    return { thumb: v.thumb?.slice(0, 15) ?? null, bytes: v.thumb?.length ?? 0 }
  })
  expect(v0.thumb).toBe('data:image/jpeg')
  expect(v0.bytes).toBeGreaterThan(500)   // 빈 문자열·깨진 캡처가 아니다

  // 다른 포즈로 궤도한 상태에서 둘째 뷰 저장
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 10; i++) await page.mouse.move(600 + i * 8, 400)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  const posedB = await pose(page)
  await page.click('#btn-save-view'); await settle(page)

  // 작도 시점으로 돌아간 뒤 — 펼쳐서 **둘째 썸네일**로 복귀한다
  await page.click('#btn-draw-view'); await settle(page)
  await page.click('#btn-views'); await settle(page)
  expect(await page.locator('#views-pop .vrow').count()).toBe(2)
  expect(await page.locator('#views-pop .vpick img').count()).toBe(2)  // 눈으로 보고 고른다
  await page.locator('#views-pop .vpick').nth(1).click(); await settle(page)
  const poseNow = await pose(page)
  expect(Math.abs(poseNow.q.y - posedB.q.y)).toBeLessThan(1e-9)        // 그 시점으로 갔다
  expect(await page.locator('#views-pop').count()).toBe(0)             // 고르면 닫힌다

  // 삭제 — 지우는 길이 생겼다(✕). 실행취소 대상이 아니다(결정 — state.ts deleteView).
  await page.click('#btn-views'); await settle(page)
  await page.locator('#views-pop .vdel').nth(0).click(); await settle(page)
  // 확인 한 번(2차 [7] — 실행취소 밖 파괴 조작의 4번 규칙). 확인 전에는 안 지워진다.
  expect(await page.evaluate(() => (window as any).__b2.app.savedViews.length)).toBe(2)
  await page.click('#confirm-pop u[data-pick="yes"]'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.savedViews.length)).toBe(1)
  expect(await page.locator('#views-pop .vrow').count()).toBe(1)
  // 반증(D-3): 남은 뷰가 옛 «둘째»다(첫째를 지웠으므로) — 인덱스가 안 밀렸으면 잡힌다
  const left = await page.evaluate(() => (window as any).__b2.app.savedViews[0].pose.q.y)
  expect(Math.abs(left - posedB.q.y)).toBeLessThan(1e-9)
  await page.mouse.click(300, 300); await settle(page)                 // 바깥 — 닫힌다
  expect(await page.locator('#views-pop').count()).toBe(0)

  // 비용 — 뷰 1·5·20에서 .brnl 크기(지시 문면: 늘려가며 본다)
  const brnl = () => page.evaluate(() => (window as any).__b2.diag.capture().brnlBytes)
  await page.evaluate(() => { const a = (window as any).__b2.app; a.savedViews.splice(0) })
  await page.click('#btn-save-view'); await settle(page)
  const b1 = await brnl()
  const thumbBytes: number[] = []
  const saveTimes: number[] = [saveMs]
  while (await page.evaluate(() => (window as any).__b2.app.savedViews.length) < 20) {
    const t = Date.now()
    await page.click('#btn-save-view')
    saveTimes.push(Date.now() - t)
    const n = await page.evaluate(() => {
      const vs = (window as any).__b2.app.savedViews
      return vs[vs.length - 1].thumb.length
    })
    thumbBytes.push(n)
    if (await page.evaluate(() => (window as any).__b2.app.savedViews.length) === 5) ledger['brnl_bytes_5'] = await brnl()
  }
  const b20 = await brnl()
  // ㉮/㉯ 대비의 실측(2차 [8] — ㉯를 산문으로 기각하지 않는다):
  // capture_ms = 굽기만 · regen_view_ms = ㉯라면 «펼칠 때» 뷰마다 드는 몫(시점 이동 +
  // 전량 재그리기 + 굽기 — 지금 저장된 20뷰로 실제로 돌려 잰다).
  const capMs: number[] = []
  for (let i = 0; i < 10; i++) {
    capMs.push(await page.evaluate(() => {
      const d = (window as any).__b2.diag
      const t0 = performance.now()
      d.captureThumb()
      return performance.now() - t0
    }))
  }
  const regenMs: number[] = []
  for (let i = 0; i < 20; i++) {
    regenMs.push(await page.evaluate((idx) => {
      const b = (window as any).__b2
      const t0 = performance.now()
      b.app.view = { ...b.app.savedViews[idx].view }
      b.app.pose = { p: { ...b.app.savedViews[idx].pose.p }, q: { ...b.app.savedViews[idx].pose.q } }
      b.diag.brushRedrawMs()
      b.diag.captureThumb()
      return performance.now() - t0
    }, i))
  }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
  ledger['capture_ms_median'] = Number(med(capMs).toFixed(2))
  ledger['regen_view_ms_median'] = Number(med(regenMs).toFixed(2))
  ledger['regen_view_ms_max'] = Number(Math.max(...regenMs).toFixed(2))
  console.log(`[측정] ㉮/㉯ — 굽기만 중앙 ${ledger['capture_ms_median']}ms · ㉯ 한 뷰 몫 중앙 ${ledger['regen_view_ms_median']}ms 최악 ${ledger['regen_view_ms_max']}ms`)
  thumbBytes.sort((a, b) => a - b)
  saveTimes.sort((a, b) => a - b)
  ledger['thumb_bytes_median'] = thumbBytes[Math.floor(thumbBytes.length / 2)]
  ledger['save_ms_median'] = saveTimes[Math.floor(saveTimes.length / 2)]
  ledger['save_ms_max'] = saveTimes[saveTimes.length - 1]
  ledger['brnl_bytes_1'] = b1
  ledger['brnl_bytes_20'] = b20
  console.log(`[측정] 썸네일 — 장 중앙 ${ledger['thumb_bytes_median']}B · 저장 탭 중앙 ${ledger['save_ms_median']}ms 최악 ${ledger['save_ms_max']}ms · .brnl 뷰1 ${b1}B 뷰5 ${ledger['brnl_bytes_5']}B 뷰20 ${b20}B`)
  // 목록이 20이어도 펼침이 화면 안이다(#views-pop max-height 스크롤)
  await page.click('#btn-views'); await settle(page)
  const pop = (await page.locator('#views-pop').boundingBox())!
  const vh = await page.evaluate(() => window.innerHeight)
  expect(pop.y).toBeGreaterThanOrEqual(0)
  expect(pop.y + pop.height).toBeLessThanOrEqual(vh)
  expect(await page.locator('#views-pop .vrow').count()).toBe(20)
})

test('옛 파일(썸네일 없음)이 정상으로 열리고 번호로 고를 수 있다 — 하위호환 팔', async ({ page }) => {
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
  expect(await page.evaluate(() => (window as any).__b2.app.savedViews.length)).toBe(1)
  await page.click('#btn-views'); await settle(page)
  expect(await page.locator('#views-pop .vpick img').count()).toBe(0)  // 썸네일 없음
  expect(await page.locator('#views-pop .vpick').first().textContent()).toBe('1')  // 번호 폴백
  await page.locator('#views-pop .vpick').first().click(); await settle(page)
  const q = await page.evaluate(() => (window as any).__b2.app.pose.q.y)
  expect(Math.abs(q - 0.3)).toBeLessThan(1e-9)
})
