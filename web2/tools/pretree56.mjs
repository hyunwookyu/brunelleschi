// web2-56 — **t=0 픽셀 항등의 부모 트리 대조**(착수 표 (a) · 2차 리뷰어 [11]).
// 55의 pre_tree 절차(비상주 — 세션 수행) 재현: 같은 장면(코너 방 · 면 지정 · 축척 ·
// 단색 채움 — 전부 t=0)을 두 트리(현행 · 부모 4eecab5 워크트리)의 dev 서버에서 그리고
// #gl 원시 바이트의 해시를 dpr 1·2로 대조한다. 접합 코드가 t=0 경로의 픽셀을 한 바이트도
// 안 바꿨는가의 실측이다(코드 경로 논증 j56(v,0,null)=v 의 값판).
//
// 실행:  node tools/pretree56.mjs <포트A(현행)> <포트B(부모)>
// 출력:  stage0/out/join56_pretree_web2.json (LEDGER=1에서만 — ledgerfs 규약)

import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ⚠ 원장 관문(#90): LEDGER=1이 아니면 한 바이트도 안 쓴다 — playwright 밖이라 ledgerguard
// 배선이 안 닿는 자리이므로 같은 규약을 스스로 지킨다(gates54.mjs의 그 꼴).
if (process.env.LEDGER !== '1') {
  console.error('[원장 관문] LEDGER=1이 아니므로 안 쓴다 (pretree56.mjs)')
  process.exit(2)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const [portA, portB] = [process.argv[2], process.argv[3]]
if (!portA || !portB) { console.error('usage: node tools/pretree56.mjs <portA> <portB>'); process.exit(2) }

async function drawLine(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** join56.spec cornerScene과 같은 장면 — t=0(두께 없음)까지만 */
async function scene(page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!window.__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  const post = await page.evaluate(() => window.__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => window.__b2.diag.setDimForTest(i, 2500), post)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(550, 430); await page.waitForTimeout(60)
  await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  await drawLine(page, 400, 475, 400, 385)
  await drawLine(page, 400, 385, 500, 380)
  await page.click('#btn-face')
  await page.mouse.click(450, 430); await page.waitForTimeout(60)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  // 벽 둘 단색 채움 — 면 메시 경로(48-9)가 t=0에서 실제로 그려지게. recompute 방아쇠는
  // 같은 치수의 재설정(setDimension — 두 트리에 공히 있는 경로)이다.
  await page.evaluate(() => {
    const app = window.__b2.app
    for (const f of app.faces) {
      if (Math.abs(f.normal.y) < 0.5) {
        const face = app.doc.faces.find(x => x.id === f.id)
        if (face) face.fill = 2
      }
    }
  })
  await page.evaluate((i) => window.__b2.diag.setDimForTest(i, 2500), post)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
}

async function glSha(page) {
  const bytes = await page.evaluate(() => {
    const src = document.getElementById('gl')
    const t = document.createElement('canvas')
    t.width = src.width; t.height = src.height
    const g = t.getContext('2d')
    g.drawImage(src, 0, 0)
    const d = g.getImageData(0, 0, t.width, t.height).data
    return { w: t.width, h: t.height, b64: (() => {
      let s = ''
      for (let i = 0; i < d.length; i += 65536) s += String.fromCharCode(...d.subarray(i, Math.min(i + 65536, d.length)))
      return btoa(s)
    })() }
  })
  const buf = Buffer.from(bytes.b64, 'base64')
  return { w: bytes.w, h: bytes.h, sha: createHash('sha256').update(buf).digest('hex') }
}

const out = { what: 'web2-56 — t=0 픽셀 항등의 부모 트리(4eecab5) 대조: 같은 장면(코너 방 · 채움 · 축척 · t=0)의 #gl sha256을 dpr 1·2로. 일회 측정(세션 수행 · 스펙 비상주 — 55 pre_tree의 그 규약)', runs: {} }
const browser = await chromium.launch()
let allSame = true
for (const dpr of [1, 2]) {
  const shas = {}
  for (const [name, port] of [['current', portA], ['parent', portB]]) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr,
      baseURL: `http://localhost:${port}`,
    })
    const page = await ctx.newPage()
    await scene(page)
    shas[name] = await glSha(page)
    await ctx.close()
  }
  const same = shas.current.sha === shas.parent.sha
  allSame = allSame && same
  out.runs[`dpr${dpr}`] = { current: shas.current, parent: shas.parent, identical: same }
  console.log(`dpr${dpr}: current ${shas.current.sha.slice(0, 12)} / parent ${shas.parent.sha.slice(0, 12)} → ${same ? '동일' : '다름!'}`)
}
await browser.close()
mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
writeFileSync(resolve(HERE, '../../stage0/out/join56_pretree_web2.json'), JSON.stringify(out, null, 2))
process.exit(allSame ? 0 : 1)
