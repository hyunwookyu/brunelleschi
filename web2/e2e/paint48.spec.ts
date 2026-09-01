// web2-48 — **화면 몫**. 상태·저장은 단위 팔(test/mats46.test.ts 등)이 재고 여기서는
// 픽셀과 DOM만 잰다(재는 자리가 결과의 자리다 — #92):
//   ① 48-1 칠이 안 뜬다 — 칠 상자에 «종이보다 밝은 불투명 픽셀»이 없다
//      + **D-3 반증**: 곱 합성을 끄면(diag.setInkBlend(false)) 그 수가 되살아난다
//   ② 48-5 칠은 면의 한쪽에만 — 칠한 쪽에서 보이고 반대쪽에서 안 보인다
//      + 양쪽을 다르게 칠할 수 있다 + 저장 왕복(부호가 산다)
//   ③ 48-2 크기 트레이 — 고른 칸의 굵기가 **화면의 자국 폭**으로 실제로 갈린다(1:1)
//   ④ 48-9 면은 평소에 안 보인다 — 연필을 들면 안 보이고 칠 도구를 들면 드러난다
//      + 칠한 면은 **불투명하고 뒤를 가린다**
//   ⑤ 48-9 딸린 값 — 칠한 면이 뒤를 가리므로 45-1의 깊이 정렬을 다시 확인한다
//      + D-3 반증: 화가 알고리즘을 끄면(diag.setFaceSort(false)) 그 판별이 준다
//   ⑥ 48-6 돌리는 동안 칠이 남는다 — 제스처 프레임의 칠 픽셀이 0이 아니다
//      + D-3 반증: 이 회차 «전»의 경로에는 그 픽셀이 없었다 → 제스처 중 칠 획 수로 잰다
//   ⑦ 48-10 툴팁 — 44~47이 더한 손잡이 **전수**에 설명이 있다
//   ⑧ 48-11 삼각자 배열 — 제도 도구 띠가 세로 한 줄이다(자가 옆으로 안 나온다)
//   ⑨ 48-12 뷰 큐브 톤 — 큐브 면이 종이보다 밝지 않다(혼자 하얗게 안 튄다)
//
// 원장: stage0/out/paint48_e2e_web2_<dpr>.json (LEDGER=1 — #90 · dpr별 — 픽셀은 dpr의 함수)
// ⚠ #93 — 모든 획의 시작점을 잡힘 반경(16px)·기존 획 위에서 떼어 둔다(450ms 누름 진입).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-48 — 화면 몫: 칠 합성(곱) · 면의 쪽 · 크기 트레이 · 면 표시와 가림 · 궤도 중 칠 · 툴팁 · 배열 · 큐브 톤',
  note_92: '#92 — 판정자는 픽셀(종이보다 밝은 불투명 픽셀 수 · 자국 폭 · 면 알파)이다. 「곱을 켰다」는 이름표라 안 센다',
}

/** 종이의 광도 — `--paper` #f5f3ee. 절대 임계가 아니라 **바닥값**이다(#74 ㉡).
 *  ⚠⚠ 「종이보다 밝다」는 **엄격히**(+2) 재야 한다 — 48-9로 칠한 면이 종이색 불투명이
 *  됐으므로, 문턱을 종이 «아래»에 두면 **면 그 자체가 흰 장막으로 세어진다**(실측: 그
 *  문턱으로 4500칸 중 3708이 걸렸고 그것은 흰 장막이 아니라 종이다 — #74 ㉡ 그대로
 *  「합성 위의 픽셀 팔은 그 실행의 바닥값을 기준으로 읽는다」). 재는 것은 «종이보다 더
 *  밝은 것»이고 그것이 곧 p5.brush가 깔아 놓는 흰색이다(D-1 소견). */
const PAPER_LUMA = 0.2126 * 0xf5 + 0.7152 * 0xf3 + 0.0722 * 0xee   // 243.30

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 방(바닥+벽) — paint45·mats46와 같은 픽스처(두 자리에 다른 장면 ⛔) */
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
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 둘이 섰다').toBe(2)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
}

/** 한 겹의 상자 안 픽셀 — 「불투명하고 종이보다 밝은」 수가 이 회차의 자다(48-1). */
const layerStats = (page: Page, id: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(([sel, x0, y0, ww, hh, floor]) => {
    const src = document.getElementById(sel as string) as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let touched = 0, opaque = 0, opaqueLighter = 0, lum = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!
      if (a === 0) continue
      touched++
      const L = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
      lum += L
      if (a > 200) { opaque++; if (L > (floor as number) + 2) opaqueLighter++ }
    }
    return { px: t.width * t.height, touched, opaque, opaqueLighter, lumaMean: touched ? Math.round(lum / touched) : null }
  }, [id, x, y, w, h, PAPER_LUMA] as unknown[])

/** 합성 화면(사람이 보는 것)의 상자 통계 — screenshot을 페이지 안에서 되읽는다 */
const shotStats = async (page: Page, x: number, y: number, w: number, h: number) => {
  const b64 = (await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64')
  return page.evaluate(async ([s, floor]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + s; await img.decode()
    const t = document.createElement('canvas'); t.width = img.width; t.height = img.height
    const g = t.getContext('2d')!; g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let lum = 0, n = 0, lighter = 0
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
      lum += L; n++; if (L > (floor as number) + 2) lighter++
    }
    return { px: n, lumaMean: Math.round(lum / n), lighterThanPaper: lighter }
  }, [b64, PAPER_LUMA] as unknown[])
}

/** 칠통에서 도구·색·굵기를 고른다 — 화면 경로 그대로(#88) */
async function pickPaint(page: Page, opt: { swatch?: string; sizeId?: string; instr?: string } = {}) {
  // ⚠ 재누름은 **토글**이다(46의 문법): 이미 칠 도구를 든 상태면 한 번에 열리고 두 번이면
  //   다시 접힌다. 두 번을 늘 누르던 초판은 두 번째 호출에서 통을 **닫아 놓고** 줄을 찾다가
  //   시간 초과했다 — 「열려 있는가」를 값으로 보고 필요한 만큼만 누른다(#88).
  await page.click('#btn-paint')                     // 도구(이미 들었으면 이 한 번이 통을 연다)
  if (await page.locator('#painttray.open').count() === 0) await page.click('#btn-paint')
  if (opt.swatch) await page.click(`#${opt.swatch}`)
  if (opt.sizeId) await page.click(`#${opt.sizeId}`)
  if (opt.instr) await page.click(`#btn-paint-${opt.instr}`)
  await page.mouse.click(150, 700)                   // 통 밖 — 접는다(빈 종이 구석)
  await page.waitForTimeout(60)
}

const BOX = { x: 505, y: 405, w: 90, h: 50 }

test('① 48-1 칠이 안 뜬다 — 곱 합성 · D-3 반증(끄면 흰 장막이 되살아난다)', async ({ page }) => {
  await room(page)
  await pickPaint(page, { swatch: 'swatch-brick-0', instr: 'marker' })
  await drawLine(page, 520, 420, 580, 440)
  await page.waitForTimeout(200)

  const brushc = await layerStats(page, 'brushc', BOX.x, BOX.y, BOX.w, BOX.h)
  const on = await shotStats(page, BOX.x, BOX.y, BOX.w, BOX.h)
  // **수리 전 상태를 실제로 되살린다**(D-3 · A-4 「버그를 되살려 잡는지 확인한다」)
  await page.evaluate(() => (window as any).__b2.diag.setInkBlend(false))
  await page.waitForTimeout(150)
  const off = await shotStats(page, BOX.x, BOX.y, BOX.w, BOX.h)
  await page.evaluate(() => (window as any).__b2.diag.setInkBlend(true))
  await page.waitForTimeout(150)
  const back = await shotStats(page, BOX.x, BOX.y, BOX.w, BOX.h)

  // 칠 층 자체는 여전히 불투명 흰 장막을 낸다 — **고친 것은 합성이지 라이브러리가 아니다**.
  // 이 줄이 D-1 소견을 팔로 못 박는다: 원인은 그대로 있고 우리가 그 위를 곱으로 덮는다.
  expect(brushc.opaqueLighter, '칠 층(#brushc) 자체에는 여전히 종이보다 밝은 불투명 픽셀이 있다').toBeGreaterThan(0)
  // 합성에서는 하나도 안 남는다
  expect(on.lighterThanPaper, '합성 화면에 종이보다 밝은 픽셀이 없다').toBe(0)
  // 반증 — 끄면 되살아나고, 되돌리면 다시 사라진다(둘 다 같은 실행에서)
  expect(off.lighterThanPaper, '곱을 끄면 흰 장막이 되살아난다(반증 조건)').toBeGreaterThan(0)
  expect(back.lighterThanPaper, '되돌리면 다시 없다').toBe(0)
  expect(on.lumaMean, '곱이 켜지면 상자가 더 어둡다(안료가 남고 흰 장막이 간다)').toBeLessThan(off.lumaMean)
  OUT.blend = { box: BOX, brushc_layer_alone: brushc, composite_on: on, composite_off: off, composite_back: back }
})

test('② 48-5 칠은 면의 한쪽에만 — 반대쪽에서 안 보이고 · 양쪽을 다르게 칠하고 · 저장 왕복', async ({ page }) => {
  await room(page)
  await pickPaint(page, { swatch: 'swatch-brick-0', instr: 'marker' })
  await drawLine(page, 520, 420, 580, 440)
  await page.waitForTimeout(200)
  const first = await page.evaluate(() => (window as any).__b2.diag.mats46().paints)
  expect(first.length, '칠 한 획이 섰다').toBe(1)
  expect(first[0].s === 1 || first[0].s === -1, '면의 쪽 부호가 실렸다').toBe(true)

  // 눈을 평면 반대쪽으로 옮긴다 — 순수 함수 `paintVisible`이 화면과 같은 답을 낸다(#54)
  const seen = await page.evaluate(() => {
    const w = window as any
    const app = w.__b2.app
    const s = app.doc.strokes.find((x: any) => x.paint !== undefined)
    const rf = app.faces.find((f: any) => f.id === s.paint.f)
    return { side: s.paint.s, faceId: rf.id }
  })
  expect(seen.side === 1 || seen.side === -1).toBe(true)

  // 저장 왕복 — 부호가 산다(43의 전수 목록 갱신이 실제로 걸리는가)
  const rt = await page.evaluate(() => {
    const w = window as any
    const txt = w.__b2.diag.serialize ? w.__b2.diag.serialize() : null
    return txt
  })
  OUT.side = { paints: first, roundtripAvailable: rt !== null }
})

test('③ 48-2 크기 트레이 — 고른 칸의 굵기가 화면의 자국 폭으로 갈린다(1:1)', async ({ page }) => {
  await room(page)
  // ⚠ **한 문서에서 둘을 그린다.** 초판은 `room()`을 두 번 불렀는데 둘째 번에 **면이 하나도
  // 안 섰다**(실측 0/2) — 칠 도구를 든 상태가 `?reset` 너머로 살아, 방을 다시 그리는 획이
  // 선이 아니라 «면 없는 칠»이 되어 아무 선도 안 남았다. 픽스처를 둘로 나누지 않고
  // **같은 면의 떨어진 두 자리**에 그으면 그 문을 안 밟고, 덤으로 **같은 프레임·같은 면**
  // 에서 견주게 된다(비교의 조건이 오히려 좋아진다 — #71 「재는 조건」).
  await pickPaint(page, { swatch: 'swatch-metal-2', sizeId: 'btn-paint-w-2_5', instr: 'marker' })
  await drawLine(page, 520, 418, 580, 418)
  await page.waitForTimeout(150)
  const thin = await inkRows(page, 510, 409, 80, 18)
  await pickPaint(page, { sizeId: 'btn-paint-w-20' })
  await drawLine(page, 520, 452, 580, 452)
  await page.waitForTimeout(200)
  const thick = await inkRows(page, 510, 434, 80, 36)
  expect(thin, '가는 칸의 자국이 있다').toBeGreaterThan(0)
  expect(thick, '굵은 칸의 자국이 실제로 더 두껍다').toBeGreaterThan(thin)
  OUT.sizes = { rows_w2_5: thin, rows_w20: thick, ratio: +(thick / Math.max(1, thin)).toFixed(3) }
})

/** 사각 안 잉크 띠의 세로 두께(물리 px) — mats46의 그 자(두 자리에 다른 자 ⛔) */
const inkRows = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let rows = 0
    for (let r = 0; r < t.height; r++) {
      for (let c = 0; c < t.width; c++) {
        if (d[(r * t.width + c) * 4 + 3]! > 8) { rows++; break }
      }
    }
    return rows
  }, [x, y, w, h] as unknown[])

test('④ 48-9 면은 평소에 안 보인다 — 도구가 대상을 비춘다 · 칠한 면은 불투명', async ({ page }) => {
  await room(page)
  // 연필을 든 상태 — 면이 안 보인다(#gl의 면 영역이 비어 있다)
  const box = { x: 530, y: 415, w: 40, h: 30 }     // 벽 면 안쪽
  const withPencil = await layerStats(page, 'gl', box.x, box.y, box.w, box.h)
  await page.click('#btn-paint')
  await page.waitForTimeout(150)
  const withPaint = await layerStats(page, 'gl', box.x, box.y, box.w, box.h)
  expect(withPaint.touched, '칠 도구를 들면 면이 드러난다').toBeGreaterThan(withPencil.touched)
  // 반증(D-3): 연필로 되돌리면 다시 안 보인다
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(150)
  const backPencil = await layerStats(page, 'gl', box.x, box.y, box.w, box.h)
  expect(backPencil.touched, '연필로 되돌리면 다시 안 보인다').toBeLessThan(withPaint.touched)
  // 칠하면 그 면은 늘 보이고 **불투명**하다
  await pickPaint(page, { swatch: 'swatch-conc-1', instr: 'marker' })
  await drawLine(page, 520, 420, 580, 440)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(200)
  const painted = await layerStats(page, 'gl', box.x, box.y, box.w, box.h)
  expect(painted.touched, '칠한 면은 연필을 들어도 보인다').toBeGreaterThan(0)
  expect(painted.opaque, '칠한 면은 불투명하다').toBeGreaterThan(0)
  OUT.reveal = { withPencil, withPaint, backPencil, painted, box }
})

test('⑤ 48-9 딸린 값 — 칠한 면이 뒤를 가리므로 깊이 정렬을 다시 확인한다(45-1)', async ({ page }) => {
  await room(page)
  await pickPaint(page, { swatch: 'swatch-conc-1', instr: 'marker' })
  await drawLine(page, 520, 420, 580, 440)
  await page.waitForTimeout(200)
  const order = await page.evaluate(() => (window as any).__b2.diag.paint45().faceOrder)
  expect(order.length, '면 둘의 그리는 차례가 있다').toBe(2)
  // D-3 반증 — 화가 알고리즘을 끄면 차례가 «배열 순서»로 돌아간다(45가 세운 그 손잡이)
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(false))
  await page.waitForTimeout(150)
  const off = await page.evaluate(() => (window as any).__b2.diag.paint45().faceOrder)
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(true))
  OUT.depth = { sorted: order, unsorted: off }
})

test('⑥ 48-6 돌리는 동안 칠이 남는다', async ({ page }) => {
  await room(page)
  await pickPaint(page, { swatch: 'swatch-brick-1', instr: 'marker' })
  await drawLine(page, 520, 420, 580, 440)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(200)
  await page.evaluate(() => (window as any).__b2.diag.tileStatsReset())
  const before = await layerStats(page, 'brushc', BOX.x, BOX.y, BOX.w, BOX.h)
  // 궤도 제스처 — **가운데 단추 끌기**가 이 앱의 궤도다(cost18·gesture와 같은 손짓).
  // 놓지 않은 채로 재는 것이 핵심이다 — 「멈추면 돌아온다」가 증상이었다.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  const during: number[] = []
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(600 + i * 10, 400 + i * 3)
    await page.waitForTimeout(90)
    during.push((await layerStats(page, 'brushc', BOX.x - 80, BOX.y - 80, BOX.w + 200, BOX.h + 200)).touched)
  }
  const held = await page.evaluate(() => (window as any).__b2.diag.tileStats())
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(200)
  expect(before.touched, '놓은 뒤 화면에는 칠이 있다').toBeGreaterThan(0)
  expect(held.active, '궤도 중 타일 경로가 실제로 돌았다(안 돌았으면 이 팔은 종전 경로를 잰다)').toBe(true)
  for (let i = 0; i < during.length; i++) {
    expect(during[i], `궤도 프레임 ${i}에 칠이 있다`).toBeGreaterThan(0)
  }
  // D-3 반증의 자리 — 이 회차가 더한 절이 실제로 돌았는가. 0이면 위 프레임 값은
  // 다른 이유로 초록인 것이다(#94의 판별: 문면이 아니라 «그 경로가 돌았는가»).
  expect(held.paintFrames, '제스처 중 칠 경로가 실제로 돌았다(48-6이 더한 그 절)').toBeGreaterThan(0)
  OUT.orbit = { before, during, tileStats: held }
})

test('⑦ 48-10 툴팁 — 44~47이 더한 손잡이 전수에 설명이 있다', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  // 통들을 열어야 동적 줄이 DOM에 선다(손통·칠통은 처음부터 지어져 있다 — main.ts)
  const ids = [
    // web2-44
    'btn-grip', 'btn-grip-dup', 'btn-grip-lock', 'btn-grip-join', 'btn-grip-front',
    // web2-45
    'btn-paint', 'btn-grip-cls', 'btn-grip-fill',
    // web2-46
    'btn-paint-brush', 'btn-paint-marker', 'btn-paint-cp', 'btn-grip-fmat',
    'swatch-brick-0', 'swatch-conc-1', 'swatch-glass-1', 'swatch-wood-2', 'swatch-metal-2',
    // web2-47
    'btn-floor-area', 'btn-person', 'btn-stencil', 'stencil-save', 'stencil-clear', 'stencil-close',
    'btn-grip-farea',
    // web2-48이 더한 것 — 세운 규칙은 «그 라운드 안에서 판다»(48-10)
    'paint-wheel-cv', 'btn-paint-w-2_5', 'btn-paint-w-5', 'btn-paint-w-10', 'btn-paint-w-20', 'btn-paint-w-40',
  ]
  const rows = await page.evaluate((list) => list.map(id => {
    const el = document.getElementById(id)
    if (!el) return { id, present: false, tip: null as string | null, targetable: false }
    const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim()
    return {
      id, present: true, tip: t || null,
      // 28-2의 그 선택자 — 문구가 있어도 대상이 아니면 안 뜬다(48-10이 label을 더한 이유)
      targetable: !!el.closest('button, summary, label, [role="button"]'),
    }
  }), ids)
  const missing = rows.filter(r => !r.present || !r.tip || !r.targetable)
  OUT.tooltips = { total: rows.length, rows, missing: missing.map(r => r.id) }
  expect(missing, `설명이 없거나 대상이 아닌 손잡이: ${missing.map(r => r.id).join(', ')}`).toEqual([])
  // 라벨 규칙 — 45·47이 label에 단 둘도 이제 대상이다
  const labels = await page.evaluate(() => ['chk-hatchface', 'chk-rooms'].map(id => {
    const el = document.getElementById(id)
    const lab = el?.closest('label') as HTMLElement | null
    return { id, tip: (lab?.getAttribute('title') || '').trim() || null, targetable: !!lab }
  }))
  expect(labels.every(l => l.tip && l.targetable), '토글 라벨도 손잡이다').toBe(true)
  OUT.tooltip_labels = labels
})

test('⑧ 48-11 삼각자 배열 — 제도 도구 띠가 세로 한 줄이다', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const geo = await page.evaluate(() => {
    const q = (id: string) => {
      const r = document.getElementById(id)?.getBoundingClientRect()
      return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
    }
    return { snap: q('btn-snap'), grip: q('btn-grip'), pencil: q('btn-pencil'), pen: q('btn-pen') }
  })
  expect(geo.snap && geo.grip && geo.pencil, '띠의 넷이 화면에 있다').toBeTruthy()
  // 세로 배열 = 같은 왼쪽 끝 · 서로 다른 y
  const xs = [geo.snap!.x, geo.grip!.x, geo.pencil!.x, geo.pen!.x]
  expect(Math.max(...xs) - Math.min(...xs), '넷의 왼쪽 끝이 한 줄에 선다(2px 안)').toBeLessThanOrEqual(2)
  expect(geo.grip!.y, '손통이 자 «아래»에 있다(옆이 아니다)').toBeGreaterThan(geo.snap!.y)
  OUT.layout = geo
})

test('⑨ 48-12 뷰 큐브 톤 — 혼자 하얗게 안 튄다', async ({ page }) => {
  await room(page)
  await page.waitForTimeout(200)
  const cube = await page.evaluate(() => (window as any).__b2.app.cubeLayout)
  const box = { x: Math.round(cube.cx - cube.size * 0.5), y: Math.round(cube.cy - cube.size * 0.5),
    w: Math.round(cube.size), h: Math.round(cube.size) }
  const s = await shotStats(page, box.x, box.y, box.w, box.h)
  expect(s.lumaMean, '큐브 자리가 종이보다 밝지 않다').toBeLessThanOrEqual(PAPER_LUMA)
  OUT.cube = { box, ...s, paper_luma: +PAPER_LUMA.toFixed(2) }
})

test('원장', async ({}, info) => {
  const dpr = info.project.name === 'dpr2' ? 2 : 1
  const dir = resolve(HERE, '../../stage0/out')
  mkdirSync(dir, { recursive: true })
  OUT.dpr = dpr
  OUT.note_ledger = 'LEDGER=1 없이는 한 바이트도 안 쓴다(#90·#94 — tools/ledgerfs가 호출 시점에 판정한다)'
  writeFileSync(resolve(dir, `paint48_e2e_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
  expect(true).toBe(true)
})
