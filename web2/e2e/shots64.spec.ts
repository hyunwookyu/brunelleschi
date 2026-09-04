// web2-64 ⛳ 사진 — 사람 눈의 판정대(CLOSING 「사진은 게이트가 통과해도 그림이 나쁜 것을 잡는 유일한 수단」 · 지시 64 「⛳ 사진」).
//   64-panel.png        칠 패널(칠 도구를 든 화면 · 세로바 곁) + 브러시 목록이 열린 판 + 색상 휠이 열린 판
//   64-cp.png           색연필 전후 — 왼쪽 63의 cp(ramon/B-pencil) · 오른쪽 64의 cp(brunelleschi/colored_pencil) × 직선·물결·자기교차 · 압력 셋
//   64-catalog-wet.png  흰 판에서 빈 프리셋 전부(62 ⑦의 42)를 «색 위»(100%_Opaque 빨강 띠)에 그은 카탈로그(이름 + 물결) — 64-3
//
// ⚠ #104: PNG는 stage0/out/shots64/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots64-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots64')

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 15_000 })
  mkdirSync(OUTDIR, { recursive: true })
}
const save = (name: string, dataUrl: string) => {
  const b64 = dataUrl.split(',')[1]!
  writeFileSync(resolve(OUTDIR, name), Buffer.from(b64, 'base64'))
  expect(b64.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const saveBuf = (name: string, buf: Buffer) => {
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}

test('사진 — 칠 패널(닫힘 · 브러시 목록 · 색상 휠) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진 — dpr1 한 번')
  await boot(page)
  // 방 하나(paint50의 상자)를 그려 두면 사진에 맥락이 있다 — 벽 위에 획도 하나
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(40)
  }
  await line(60, 620, 1140, 620); await line(500, 700, 900, 610); await line(500, 700, 150, 620); await line(900, 610, 640, 560)
  await line(150, 620, 640, 560); await line(500, 700, 500, 330); await line(900, 610, 900, 330); await line(900, 330, 500, 330)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(80)
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  await page.evaluate(() => { const b2 = (window as any).__b2; b2.diag.setPaintHexForTest('#c0603a'); b2.diag.setPaintHexForTest('#3a6fb0'); b2.diag.setPaintHexForTest('#8a6238') })
  await line(540, 420, 860, 400)
  await page.waitForTimeout(250)
  saveBuf('64-panel.png', await page.screenshot({ type: 'png' }))
  await page.click('#paint-brush-btn'); await page.waitForTimeout(150)
  await page.evaluate(() => { (document.querySelector('#brushpick-list details[data-group="Brunelleschi"]') as HTMLDetailsElement).open = true; (document.querySelector('#brushpick-list details[data-group="Classic"]') as HTMLDetailsElement).open = true })
  await page.waitForTimeout(600)
  saveBuf('64-panel-brushes.png', await page.screenshot({ type: 'png' }))
  await page.click('#brushpick-close')
  await page.click('#paint-color-btn'); await page.waitForTimeout(150)
  saveBuf('64-panel-wheel.png', await page.screenshot({ type: 'png' }))
})

test('사진 — 색연필 전후 · 젖은 카탈로그(색 위) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px')
  test.setTimeout(300_000)
  await boot(page)
  // 64-cp — 왼쪽 63 cp(B-pencil) · 오른쪽 64 cp(colored_pencil) · 둘 다 cp 슬롯(문턱 판) · 압력 .25/.6/1 × 직선 · 물결 · 자기교차
  const cp = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const W = 480, H = 200
    const rows: [string, number][] = [['line', 0.25], ['line', 0.6], ['line', 1], ['wave', 0.6], ['cross', 0.6]]
    const sheet = document.createElement('canvas')
    sheet.width = W * 2 + 20; sheet.height = H * rows.length + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    sg.fillStyle = '#3c3831'; sg.font = '15px system-ui'
    sg.fillText('색연필 — 왼쪽: 63(ramon/B-pencil = 흑연) · 오른쪽: 64(brunelleschi/colored_pencil — 봉우리에만 · 압력이 문턱을 내린다) · cp 슬롯 · w20 · #8a3a2a', 12, 20)
    rows.forEach(([sh, p], i) => {
      for (const [k, preset] of [[0, 'ramon/B-pencil'], [1, 'brunelleschi/colored_pencil']] as const) {
        b2.diag.markMultiForTest([{ tool: 'cp', shape: sh, wPx: 20, seed: 64, preset, color: '#8a3a2a', press: p }], W, H, false)
        sg.drawImage((window as any).__m61cv as HTMLCanvasElement, k * (W + 20), 30 + i * H)
      }
      sg.fillStyle = '#b04a3a'; sg.font = '12px system-ui'; sg.fillText(`${sh} · 압력 ${p}`, 8, 30 + i * H + 14)
    })
    return sheet.toDataURL('image/png')
  })
  save('64-cp.png', cp)
  // 64-catalog-wet — 흰 판 빈 프리셋 전부를 색 위에(굽기 통로 · 바탕 = 100%_Opaque 빨강 띠 · 프리셋 파랑 물결)
  const wet = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const cat = b2.diag.presetCatalogForTest() as { group: string; names: string[] }[]
    const TH = b2.diag.paint50Constants().PAINT62_PAINTED_ALPHA as number
    const PW = 360, PH = 120
    const empties: string[] = []
    for (const c of cat) for (const n of c.names) {
      b2.diag.markSampleForTest('brush', 'line', 12, 62, PW, PH, { preset: n, color: '#3a3a44' })
      const L = b2.diag.lastLayerAlphaForTest() as { a: number[] }
      let mx = 0
      for (let y = PH / 2 - 14; y <= PH / 2 + 14; y++) for (let x = 60; x < PW - 60; x++) if (L.a[y * PW + x]! > mx) mx = L.a[y * PW + x]!
      if (mx < TH) empties.push(n)
    }
    const CW = 300, CH = 70, COLS = 3
    const rows = Math.ceil(empties.length / COLS)
    const sheet = document.createElement('canvas')
    sheet.width = CW * COLS + 20; sheet.height = rows * (CH + 22) + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    sg.fillStyle = '#3c3831'; sg.font = '15px system-ui'
    sg.fillText(`흰 판에서 빈 프리셋 ${empties.length} — 두 색 위(100%_Opaque 빨강 w60 + 파랑 w34 반겹침)에 노랑 w14 물결 · 굽기 통로(스머지가 앞 획을 본다) · 64-3`, 12, 20)
    empties.forEach((name, i) => {
      const cx = 10 + (i % COLS) * CW, cy = 30 + Math.floor(i / COLS) * (CH + 22)
      b2.diag.markMultiForTest([
        { tool: 'marker', shape: 'line', wPx: 60, seed: 5, preset: 'ramon/100%_Opaque', color: '#c0392b', press: 1 },
        { tool: 'marker', shape: 'line', wPx: 34, seed: 6, preset: 'ramon/100%_Opaque', color: '#2050c8', press: 1, dy: 16 },
        { tool: 'brush', shape: 'wave', wPx: 14, seed: 7, preset: name, color: '#e8c020', press: 0.8 },
      ], CW - 10, CH, true)
      sg.drawImage((window as any).__m61cv as HTMLCanvasElement, cx, cy + 16)
      sg.fillStyle = '#3c3831'; sg.font = '11px system-ui'
      sg.fillText(name, cx + 2, cy + 12)
    })
    return sheet.toDataURL('image/png')
  })
  save('64-catalog-wet.png', wet)
})
