// web2-47 — 숫자와 표시의 **화면 몫**. 기하·값은 단위 팔(test/nums47*.test.ts)이 재고
// 여기서는 «화면에 실제로 있다»(픽셀 · #92)와 UI 배선만:
//   ① 스케일바 — 축척 없으면 그 자리(좌하)에 잉크 0 · 치수 하나로 축척이 서면 잉크가 생긴다
//   ② 사람 — 스텐실 없으면 안내 · 있으면 지면 탭이 세우고 접지 자리에 잉크가 생긴다
//   ③ 바닥면적 — 값이 뜨고 근거 면이 실제로 밝아진다(#61 — 픽셀로)
//   ④ 실 다이어그램 — 토글이 상태에 실리고, 닫힌 실 없는 픽스처에서 «없다»를 말한다
//
// 원장: stage0/out/nums47_e2e_web2_<dpr>.json (LEDGER=1 — #90)
// ⚠ #93 — 탭·획 시작점은 기존 획·잡힘 반경(16px) 밖.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-47 — 화면 몫: 스케일바 잉크 · 사람 세움 · 면적 근거 하이라이트 · 실 토글',
  note_92: '#92 — 판정자는 픽셀(잉크 수)과 diag 값이다',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

async function room(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(550, 430); await page.waitForTimeout(60)
  expect(await page.evaluate(() => (window as any).__b2.app.faces.length)).toBe(2)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
}

/** 두 번째 획(깊이선)에 치수 2 m — 축척이 선다(dim.spec의 setDimForTest 경로) */
async function giveScale(page: Page) {
  const id = await page.evaluate(() => (window as any).__b2.app.doc.strokes[1].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2000), id)
  await page.waitForTimeout(120)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.mmPerUnit)).not.toBeNull()
}

/** #ink 사각 안 잉크 픽셀 수(알파>0) */
const inkAt = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x, y, w, h])

test('① 스케일바 — 축척 없으면 없다 · 서면 좌하에 잉크가 생긴다', async ({ page }) => {
  await room(page)
  const H = await page.evaluate(() => innerHeight)
  const box = { x: 16, y: H - 70, w: 150, h: 60 }
  const before = await inkAt(page, box.x, box.y, box.w, box.h)
  await giveScale(page)
  const after = await inkAt(page, box.x, box.y, box.w, box.h)
  expect(after, '막대·눈금·라벨의 잉크').toBeGreaterThan(before + 60)
  // 막대의 «폭»을 픽셀로 읽는다(1차 [M14] · #92 — 떴다(잉크 수)가 아니라 결과의 자리):
  // 막대 행 대역(닻 y ±3px)의 잉크 x-범위 = 막대+끝눈금의 화면 폭.
  const widthPx = await page.evaluate(([yc]) => {
    const src = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round(160 * dpr); t.height = Math.round(8 * dpr)
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(12 * dpr), Math.round((yc! - 4) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let lo = Infinity, hi = -Infinity
    for (let r = 0; r < t.height; r++) for (let c = 0; c < t.width; c++) {
      if (d[(r * t.width + c) * 4 + 3]! > 0) { if (c < lo) lo = c; if (c > hi) hi = c }
    }
    return hi >= lo ? (hi - lo + 1) / dpr : 0
  }, [H - 34])
  expect(widthPx, '폭이 목표 대역 안(내림 비 0.4 ~ 목표+눈금 여유)').toBeGreaterThan(38)
  expect(widthPx).toBeLessThan(104)
  OUT.scalebar = { def: '좌하 상자(16, H−70, 150×60) #ink 잉크 수 — 축척 전/후 · width_px = 막대 행 대역(±4px)의 잉크 x-범위(끝눈금 포함 — #92: 폭이 결과의 자리다)', before, after, width_px: +widthPx.toFixed(1) }
})

test('⑤ 실 양성 — 4벽 방(앱 경로)에서 버블이 실제로 그려진다(#92 — 1차 [M14]②·[H4]의 e2e 판)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 520, 458)
  await drawLine(page, 400, 475, 520, 458)
  await page.click('#btn-face')
  await page.mouse.click(465, 477); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 520, 458, 520, 368)
  await drawLine(page, 600, 385, 520, 368)
  await page.click('#btn-face'); await page.mouse.click(558, 412); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 385, 500, 380)
  await page.click('#btn-face'); await page.mouse.click(508, 430); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await drawLine(page, 400, 475, 400, 390)
  await drawLine(page, 500, 380, 400, 390)
  await page.click('#btn-face'); await page.mouse.click(430, 455); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await drawLine(page, 400, 390, 520, 368)
  await page.click('#btn-face'); await page.mouse.click(508, 375); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  const faces = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(faces, '바닥+벽 넷').toBe(5)
  const before = await inkAt(page, 400, 390, 160, 100)
  await page.click('#btn-display')
  await page.click('#chk-rooms')
  await page.waitForTimeout(150)
  const d = await page.evaluate(() => (window as any).__b2.diag.nums47())
  expect((d.rooms as { n: number }).n, '실 1').toBe(1)
  const during = await inkAt(page, 400, 390, 160, 100)
  expect(during, '버블·라벨의 잉크가 실제로 있다').toBeGreaterThan(before + 80)
  OUT.rooms_positive = {
    def: '앱 경로 4벽 방(단위 rooms_app_positive와 같은 픽스처·마우스판) — 실 1 · 버블 상자(400,390,160×100) #ink 잉크 전/중',
    rooms: d.rooms, before, during,
  }
})

test('② 사람 — 스텐실이 서면 지면 탭이 세운다 · 눈이 지평선에(diag 좌표)', async ({ page }) => {
  await room(page)
  await giveScale(page)
  // 표시 팝업 — 스텐실 없으면 놓기가 안내만 한다(값: persons 0)
  await page.click('#btn-display')
  await page.click('#btn-person')
  expect((await page.evaluate(() => (window as any).__b2.diag.nums47().persons)).length).toBe(0)
  // 기기 스텐실을 심는다(설정 캔버스와 같은 형식 — 저장 표면이 같다)
  await page.evaluate(() => {
    localStorage.setItem('b2-stencil-person', JSON.stringify({
      lines: [[{ x: 90, y: 348 }, { x: 90, y: 100 }], [{ x: 70, y: 72 }, { x: 110, y: 72 }]],
      eyeY: 72, footY: 348,
    }))
  })
  await page.click('#btn-display')                     // cmd가 팝업을 접었다 — 다시 연다
  await page.click('#btn-person')
  await page.waitForTimeout(60)
  const before = await inkAt(page, 320, 480, 160, 200)
  await page.mouse.click(400, 620)                     // 지면(지평선 400 아래 · 획 밖 #93)
  await page.waitForTimeout(150)
  const d = await page.evaluate(() => (window as any).__b2.diag.nums47())
  expect((d.persons as unknown[]).length, '섰다').toBe(1)
  expect(d.placePerson, '한 번 놓으면 풀린다').toBe(false)
  const after = await inkAt(page, 320, 480, 160, 200)
  expect(after, '사람의 잉크가 실제로 있다').toBeGreaterThan(before + 40)
  OUT.person = { def: '접지(400,620) 주변 상자(320,480,160×200) #ink 잉크 수 — 세움 전/후 · diag.persons', before, after, persons: (d.persons as unknown[]).length }
})

test('③ 바닥면적 — 값과 근거가 같이 간다(#61): 상태줄 + 면 하이라이트 픽셀', async ({ page }) => {
  await room(page)
  await giveScale(page)
  const before = await inkAt(page, 420, 455, 100, 30)  // 바닥 면 안(획·해칭 밖 띠)
  await page.click('#btn-display')
  await page.click('#btn-floor-area')
  await page.waitForTimeout(150)
  const d = await page.evaluate(() => (window as any).__b2.diag.nums47())
  expect(d.floor, '값이 섰다').not.toBeNull()
  expect((d.hl?.ids as number[] | undefined)?.length ?? 0, '근거 면이 지목됐다').toBeGreaterThan(0)
  const during = await inkAt(page, 420, 455, 100, 30)
  expect(during, '근거 면이 실제로 밝다(픽셀)').toBeGreaterThan(before + 100)
  await page.waitForTimeout(1800)
  const afterFade = await inkAt(page, 420, 455, 100, 30)
  expect(afterFade, '1.6초 뒤 걷힌다').toBeLessThan(during)
  OUT.floor_area = {
    def: '바닥 면 안 상자(420,455,100×30) #ink 잉크 수 — 하이라이트 전/중/후 · diag.floor(m²·근거 id)',
    before, during, after_fade: afterFade,
    floor_m2: (d.floor as { m2: number }).m2, evidence: (d.floor as { ids: number[] }).ids,
  }
})

test('④ 실 다이어그램 — 토글이 실리고 · 닫힌 실 없는 픽스처는 «없다»가 값이다', async ({ page }) => {
  await room(page)
  await page.click('#btn-display')
  await page.click('#chk-rooms')
  await page.waitForTimeout(100)
  const d = await page.evaluate(() => (window as any).__b2.diag.nums47())
  expect(d.showRooms).toBe(true)
  expect((d.rooms as { n: number }).n, '벽 하나 — 닫힌 실이 없다(참)').toBe(0)
  OUT.rooms_toggle = { def: '방 픽스처(벽 1) — 토글 상태·실 수(0이 참). 실이 서는 판은 단위 합성 팔(nums47_web2.json rooms)', rooms: d.rooms }
})

test.afterAll(async ({ }, testInfo) => {
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  OUT.dpr_project = testInfo.project.name
  writeFileSync(resolve(outDir, `nums47_e2e_web2_${testInfo.project.name}.json`), JSON.stringify(OUT, null, 2))
})
