// web2-62 ⛳ 사진 — 사람 눈의 판정대(CHAIN5 「모든 라운드가 사진을 낸다」).
//   62-<tool>.png      슬롯 넷(연필·색연필·마커·잉크펜) × 획 셋(직선·물결·자기교차)
//   62-catalog-<group>.png  분류별 196 전수 — 이름 + 물결 견본(제품과 같은 함수 · 고르개의 견본과 같은 길)
//   62-overlap.png     겹침 물성(파랑 위 노랑 = 초록 · paint_mode 끔 대조) + 젖은 붓(빨강 위 스머지)
//   62-vs-61.png       슬롯 넷의 물결 — 왼쪽 mypaint(62) · 오른쪽 p5.brush(61 · 엔진 갈아끼움 팔)
//
// ⚠ #104: PNG는 stage0/out/shots62/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots62-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots62')
const TOOLS = ['pencil', 'cp', 'marker', 'brush'] as const

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  mkdirSync(OUTDIR, { recursive: true })
}
const save = (name: string, dataUrl: string) => {
  const b64 = dataUrl.split(',')[1]!
  writeFileSync(resolve(OUTDIR, name), Buffer.from(b64, 'base64'))
  expect(b64.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}

test('사진 — 슬롯 넷 × 셋 · 62-vs-61 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px — dpr1 한 번이면 같은 그림')
  test.setTimeout(180_000)
  await boot(page)
  const defaults = await page.evaluate(() => (window as any).__b2.diag.defaultPresetsForTest()) as Record<string, string>
  for (const tool of TOOLS) {
    const dataUrl = await page.evaluate(([t, preset]) => {
      const b2 = (window as any).__b2
      const W = 480, H = 240
      const sheet = document.createElement('canvas')
      sheet.width = W; sheet.height = H * 3 + 30
      const sg = sheet.getContext('2d')!
      sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
      const shapes = ['line', 'wave', 'cross'] as const
      shapes.forEach((sh, i) => {
        b2.diag.markSampleForTest(t, sh, 20)
        sg.drawImage((window as any).__m61cv as HTMLCanvasElement, 0, 30 + i * H)
      })
      sg.fillStyle = '#3c3831'; sg.font = '16px system-ui'
      sg.fillText(`${t} = ${preset} — line / wave / cross · w20 · mypaint`, 12, 20)
      return sheet.toDataURL('image/png')
    }, [tool, defaults[tool]] as const)
    save(`62-${tool}.png`, dataUrl)
  }
  // 62-vs-61 — 왼쪽 mypaint · 오른쪽 p5.brush(엔진 갈아끼움 팔)
  const vs = await page.evaluate((tools) => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const sheet = document.createElement('canvas')
    sheet.width = W * 2 + 20; sheet.height = H * tools.length + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    for (const engine of ['mypaint', 'p5brush'] as const) {
      b2.diag.setPaintEngineForTest(engine)
      tools.forEach((t, i) => {
        b2.diag.markSampleForTest(t, 'wave', 20)
        sg.drawImage((window as any).__m61cv as HTMLCanvasElement, engine === 'mypaint' ? 0 : W + 20, 30 + i * H)
      })
    }
    b2.diag.setPaintEngineForTest('mypaint')
    sg.fillStyle = '#3c3831'; sg.font = '16px system-ui'
    sg.fillText('62 mypaint(왼쪽)  vs  61 p5.brush(오른쪽) — pencil / cp / marker / brush · wave · w20', 12, 20)
    return sheet.toDataURL('image/png')
  }, [...TOOLS])
  save('62-vs-61.png', vs)
})

test('사진 — 겹침 물성 · 젖은 붓 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px')
  await boot(page)
  const dataUrl = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const W = 480, H = 240
    const sheet = document.createElement('canvas')
    sheet.width = W * 2 + 20; sheet.height = H + 30
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
    const overlap = (paintOff: boolean) => {
      b2.diag.setPaintModeOffForTest(paintOff)
      b2.diag.markMultiForTest([
        { tool: 'brush', shape: 'line', wPx: 28, seed: 11, preset: 'classic/pen', color: '#2040e0', over: { paint_mode: 1, opaque: 1, opaque_linearize: 0 }, press: 1, dy: -40 },
        { tool: 'brush', shape: 'wave', wPx: 28, seed: 12, preset: 'classic/pen', color: '#f0d020', over: { paint_mode: 1, opaque: 0.5, opaque_linearize: 0 }, press: 1, dy: -40 },
        { tool: 'brush', shape: 'line', wPx: 24, seed: 21, preset: 'deevad/liner', color: '#d02020', press: 0.8, dy: 70 },
        { tool: 'brush', shape: 'line', wPx: 30, seed: 22, preset: 'classic/smudge', color: '#000000', dy: 84, press: 0.7 },
      ], W, H, true)
      b2.diag.setPaintModeOffForTest(false)
      return (window as any).__m61cv as HTMLCanvasElement
    }
    sg.drawImage(overlap(false), 0, 30)
    sg.drawImage(overlap(true), W + 20, 30)
    sg.fillStyle = '#3c3831'; sg.font = '16px system-ui'
    sg.fillText('겹침 물성: 파랑 위 노랑(paint_mode 1 · 왼쪽) vs 끔(오른쪽) · 아래: 빨강 위 스머지(젖은 붓)', 12, 20)
    return sheet.toDataURL('image/png')
  })
  save('62-overlap.png', dataUrl)
})

test('사진 — 분류별 196 전수 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px')
  test.setTimeout(300_000)
  await boot(page)
  const groups = await page.evaluate(() => ((window as any).__b2.diag.presetCatalogForTest() as { group: string; names: string[] }[]).map(c => c.group))
  for (const g of groups) {
    const dataUrl = await page.evaluate((group) => {
      const b2 = (window as any).__b2
      const cat = (b2.diag.presetCatalogForTest() as { group: string; names: string[] }[]).find(c => c.group === group)!
      const CW = 300, CH = 60, COLS = 3
      const rows = Math.ceil(cat.names.length / COLS)
      const sheet = document.createElement('canvas')
      sheet.width = CW * COLS + 20; sheet.height = rows * (CH + 22) + 30
      const sg = sheet.getContext('2d')!
      sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
      sg.fillStyle = '#3c3831'; sg.font = '15px system-ui'
      sg.fillText(`${group} — ${cat.names.length} · wave · w14 · 잉크펜 슬롯 색(#3a3a44) · mypaint`, 12, 20)
      cat.names.forEach((name, i) => {
        const cx = 10 + (i % COLS) * CW, cy = 30 + Math.floor(i / COLS) * (CH + 22)
        b2.diag.markSampleForTest('brush', 'wave', 14, 62, CW - 10, CH, { preset: name, color: '#3a3a44' })
        sg.drawImage((window as any).__m61cv as HTMLCanvasElement, cx, cy + 16)
        sg.fillStyle = '#3c3831'; sg.font = '11px system-ui'
        sg.fillText(name, cx + 2, cy + 12)
      })
      return sheet.toDataURL('image/png')
    }, g)
    save(`62-catalog-${g}.png`, dataUrl)
  }
})
