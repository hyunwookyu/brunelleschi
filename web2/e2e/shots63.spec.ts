// web2-63 ⛳ 사진 — 사람 눈의 판정대(CHAIN5 「모든 라운드가 사진을 낸다」 · 지시 63 「마른 매체 전 종류를 포함할 것」).
//   63-<medium>.png   마른 매체 다섯(연필·목탄·파스텔·마른붓·색연필) × 획 셋(직선·물결·자기교차) — 팁 켬(제품)
//   63-vs-62.png      다섯 매체의 물결 — 왼쪽 63(팁 + 높이맵 결) · 오른쪽 62(팁 끔 + 61 값 잡음 결)
//   63-tips.png       팁 아틀라스 다섯의 판 8(엔진이 실제로 읽는 그 값) + 종이 타일 조각
//   63-paper.png      잉크펜 포화 몸통(결이 드러나는 자리)의 확대 — 63 높이맵 vs 61 값 잡음
//   63-picker.png     브러시 고르개의 팁 줄(화면)
//
// ⚠ #104: PNG는 stage0/out/shots63/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots63-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots63')
const MEDIA = [
  ['pencil', 'classic/pencil'], ['charcoal', 'classic/charcoal'], ['pastel', 'ramon/Pastel_1'],
  ['drybrush', 'classic/dry_brush'], ['cp', 'ramon/B-pencil'],
] as const

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

test('사진 — 매체 다섯 × 셋 · 63-vs-62 · 팁 아틀라스 · 종이 · 고르개 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px — dpr1 한 번이면 같은 그림')
  test.setTimeout(240_000)
  await boot(page)
  for (const [key, preset] of MEDIA) {
    const dataUrl = await page.evaluate(([k, p]) => {
      const b2 = (window as any).__b2
      const W = 480, H = 240
      const sheet = document.createElement('canvas')
      sheet.width = W; sheet.height = H * 3 + 30
      const sg = sheet.getContext('2d')!
      sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
      const shapes = ['line', 'wave', 'cross'] as const
      shapes.forEach((sh, i) => {
        b2.diag.markSampleForTest('brush', sh, 20, 61, W, H, { preset: p, color: '#2a2a30' })
        sg.drawImage((window as any).__m61cv as HTMLCanvasElement, 0, 30 + i * H)
      })
      const tip = b2.diag.tipDefaultOfForTest(p)
      sg.fillStyle = '#3c3831'; sg.font = '16px system-ui'
      sg.fillText(`${k} = ${p} + 팁 ${tip} — line / wave / cross · w20 · 63`, 12, 20)
      return sheet.toDataURL('image/png')
    }, [key, preset] as const)
    save(`63-${key}.png`, dataUrl)
  }
  // 63-vs-62
  const vs = await page.evaluate((media) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const sheet = document.createElement('canvas')
    sheet.width = W * 2 + 20; sheet.height = H * media.length + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    sg.fillStyle = '#3c3831'; sg.font = '16px system-ui'
    sg.fillText('왼쪽: 63(비트맵 팁 + 높이맵 결) · 오른쪽: 62(팁 없음 + 61 값 잡음 결) — 물결 w20', 12, 20)
    media.forEach(([k, p], i) => {
      b2.diag.markSampleForTest('brush', 'wave', 20, 61, W, H, { preset: p, color: '#2a2a30' })
      sg.drawImage((window as any).__m61cv as HTMLCanvasElement, 0, 30 + i * H)
      b2.diag.setTipsOffForTest(true); b2.diag.setPaper61ForTest(true)
      b2.diag.markSampleForTest('brush', 'wave', 20, 61, W, H, { preset: p, color: '#2a2a30' })
      b2.diag.setTipsOffForTest(false); b2.diag.setPaper61ForTest(false)
      sg.drawImage((window as any).__m61cv as HTMLCanvasElement, W + 20, 30 + i * H)
      sg.fillStyle = '#b04a3a'; sg.font = '13px system-ui'; sg.fillText(`${k} = ${p}`, 8, 30 + i * H + 14)
    })
    return sheet.toDataURL('image/png')
  }, MEDIA.map(m => [m[0], m[1]] as [string, string]))
  save('63-vs-62.png', vs)
  // 63-tips — 아틀라스(엔진이 읽는 값) + 종이 조각
  const tips = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const at = b2.diag.tipAtlasesForTest() as { name: string; n: number; size: number; data: number[] }[]
    const paper = b2.diag.paintGrainTileForTest() as { v: number[]; n: number; source: string }
    const cell = 96
    const sheet = document.createElement('canvas')
    sheet.width = 8 * cell + 20; sheet.height = at.length * (cell + 18) + 30 + cell + 18
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    sg.fillStyle = '#3c3831'; sg.font = '14px system-ui'
    sg.fillText('팁 아틀라스 다섯 × 판 8(192² → 96 표시 · 검정 = 칠) · 마지막 줄: 종이 결 타일 조각(높이맵 1024² 중 192² · 검정 = 골)', 10, 18)
    at.forEach((a, r) => {
      const y0 = 30 + r * (cell + 18)
      sg.fillStyle = '#3c3831'; sg.font = '12px system-ui'; sg.fillText(`${a.name} · ${a.n}판`, 10, y0 + 12)
      for (let f = 0; f < a.n; f++) {
        const c = document.createElement('canvas'); c.width = a.size; c.height = a.size
        const g = c.getContext('2d')!
        const img = g.createImageData(a.size, a.size)
        for (let i = 0; i < a.size * a.size; i++) { const v = Math.round(255 - a.data[f * a.size * a.size + i]! * 255); img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
        g.putImageData(img, 0, 0)
        sg.drawImage(c, 10 + f * cell, y0 + 16, cell - 4, cell - 4)
      }
    })
    const y0 = 30 + at.length * (cell + 18)
    sg.fillStyle = '#3c3831'; sg.fillText(`종이 ${paper.source} · ${paper.n}²`, 10, y0 + 12)
    const c = document.createElement('canvas'); c.width = 192; c.height = 192
    const g = c.getContext('2d')!
    const img = g.createImageData(192, 192)
    for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) { const v = Math.round(255 - paper.v[y * paper.n + x]! / 0.42 * 255); const i = (y * 192 + x) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255 }
    g.putImageData(img, 0, 0)
    sg.drawImage(c, 10, y0 + 16, cell - 4, cell - 4)
    sg.drawImage(c, 10 + cell, y0 + 16, cell * 2, cell - 4)
    return sheet.toDataURL('image/png')
  })
  save('63-tips.png', tips)
  // 63-paper — 포화 몸통 확대(높이맵 vs 61)
  const paper = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const sheet = document.createElement('canvas')
    sheet.width = 2 * 480 + 20; sheet.height = 260 + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    sg.fillStyle = '#3c3831'; sg.font = '14px system-ui'
    sg.fillText('잉크펜(포화 몸통 w40) 가운데 240×120을 2배 확대 — 왼쪽 63 높이맵 결 · 오른쪽 61 값 잡음 결(같은 획)', 10, 18)
    const draw = (x0: number) => {
      b2.diag.markSampleForTest('brush', 'line', 40, 61, W, H, { color: '#2a2a30' })
      const cv = (window as any).__m61cv as HTMLCanvasElement
      sg.imageSmoothingEnabled = false
      sg.drawImage(cv, 120, 60, 240, 120, x0, 30, 480, 240)
    }
    draw(0)
    b2.diag.setPaper61ForTest(true); draw(500); b2.diag.setPaper61ForTest(false)
    return sheet.toDataURL('image/png')
  })
  save('63-paper.png', paper)
})

test('사진 — 브러시 고르개의 팁 줄(화면 · dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진 하나면 된다')
  await boot(page)
  // 단추는 칠통 안(면을 고르면 보인다) — 사진은 고르개 판 자체가 목적이라 단추를 프로그램으로 누른다
  await page.evaluate(() => (document.getElementById('btn-brushpick') as HTMLButtonElement).click())
  await page.waitForSelector('#brushpick-tips button')
  const tips = await page.$$eval('#brushpick-tips button', bs => bs.map(b => (b as HTMLElement).dataset.tip))
  expect(tips).toEqual(['default', 'none', 'fine-grain', 'chalk-chisel', 'rock-pitted', 'scratches-rough', 'scratches2'])
  // 팁을 고르면 슬롯 조정에 남고(기기) · «기본»으로 되돌리면 지워진다
  await page.click('#brushpick-tip-chalk-chisel')
  const picked = await page.evaluate(() => JSON.parse((window as any).__b2.diag.brushTuneJson()))
  expect(picked.brush?.tip).toBe('chalk-chisel')
  await page.click('#brushpick-tip-default')
  const back = await page.evaluate(() => JSON.parse((window as any).__b2.diag.brushTuneJson()))
  expect(back.brush?.tip).toBeUndefined()
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } })
  writeFileSync(resolve(OUTDIR, '63-picker.png'), png)
  expect(png.length).toBeGreaterThan(2000)
})
