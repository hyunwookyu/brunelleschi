// web2-65 ⛳ 사진 — 사람 눈의 판정대(CLOSING 「사진은 게이트가 통과해도 그림이 나쁜 것을 잡는 유일한 수단」).
//   65-perf.png    획 수 대 «커밋 한 번»의 시간 그래프 — **수리 전 vs 수리 후**(지시 「숫자만이 아니라 그림으로」).
//                  값의 출처는 원장 둘(perf65_pre_web2_dpr1.json · perf65_web2_dpr1.json)이다 — 여기서 새로 안 잰다.
//   65-panel.png   §2 뒤의 칠 패널(왼쪽 가장자리 · 즐겨찾기 여섯이 «자국 견본» · 사람 쪽 이름)
//   65-panel-brushes.png  브러시 목록이 열린 판(사람 쪽 이름 + 원 이름 부제)
//
// ⚠ #104: PNG는 stage0/out/shots65/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots65-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots65')
const LEDGER = (n: string) => resolve(HERE, `../../stage0/out/${n}`)

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  mkdirSync(OUTDIR, { recursive: true })
}
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const save = (name: string, dataUrl: string) => {
  const b64 = dataUrl.split(',')[1]!
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), Buffer.from(b64, 'base64'))
  expect(b64.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}

type Row = { n: number; ms: number; bakedStrokes: number; appendStrokes: number; uploadBytes: number }

test('사진 — 65-perf.png: 획 수 대 커밋 시간(수리 전 vs 후) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '그래프 — dpr1 한 번')
  await boot(page)
  const pre = JSON.parse(readFileSync(LEDGER('perf65_pre_web2_dpr1.json'), 'utf8')) as any
  const post = JSON.parse(readFileSync(LEDGER('perf65_web2_dpr1.json'), 'utf8')) as any
  const preRows = pre.a_commit_series.rows as Row[]
  const postRows = post.a_commit_series.rows as Row[]
  expect(preRows.length, '수리 전 원장의 획 계열').toBe(60)
  expect(postRows.length, '수리 후 원장의 획 계열').toBe(60)
  const preE = pre.e_three_faces.last_commit as { ms: number }
  const postE = post.e_three_faces.last_commit as { ms: number }
  const url = await page.evaluate((arg) => {
    const { preRows, postRows, preE, postE } = arg as { preRows: Row[]; postRows: Row[]; preE: { ms: number }; postE: { ms: number } }
    const W = 1100, H = 620, dpr = 2
    const cv = document.createElement('canvas')
    cv.width = W * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    g.fillStyle = '#faf8f3'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#3c3831'
    g.font = '600 17px system-ui, sans-serif'
    g.fillText('web2-65 칠 성능 — 획 하나를 커밋할 때 «다시 굽는» 시간 (면 하나 · dpr1 · 원장 perf65)', 24, 32)
    g.font = '12px system-ui, sans-serif'
    g.fillStyle = '#6b665c'
    g.fillText('수리 전은 커밋마다 그 면의 획을 «전부» 다시 굽는다(N번째 획 = N개 재굽기 → 세션 전체로 O(N²)).  수리 후는 «새 획 하나»만 얹는다.', 24, 52)
    // 축
    const L = 70, R = W - 260, T = 78, B = H - 60
    const maxMs = Math.max(...preRows.map(r => r.ms)) * 1.05
    const x = (n: number) => L + ((n - 1) / 59) * (R - L)
    const y = (ms: number) => B - (ms / maxMs) * (B - T)
    g.strokeStyle = '#d8d2c4'; g.lineWidth = 1
    g.beginPath()
    for (let k = 0; k <= 5; k++) { const yy = T + (k / 5) * (B - T); g.moveTo(L, yy); g.lineTo(R, yy) }
    g.stroke()
    g.fillStyle = '#8d8880'; g.font = '11px system-ui, sans-serif'
    for (let k = 0; k <= 5; k++) {
      const v = maxMs * (1 - k / 5)
      g.fillText(`${v.toFixed(0)} ms`, 20, T + (k / 5) * (B - T) + 4)
    }
    for (const n of [1, 10, 20, 30, 40, 50, 60]) g.fillText(String(n), x(n) - 6, B + 18)
    g.fillStyle = '#6b665c'; g.font = '12px system-ui, sans-serif'
    g.fillText('그 면에 쌓인 칠 획 수', (L + R) / 2 - 60, B + 40)
    const line = (rows: Row[], color: string) => {
      g.strokeStyle = color; g.lineWidth = 2.2
      g.beginPath()
      rows.forEach((r, i) => { const px = x(r.n), py = y(r.ms); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py) })
      g.stroke()
      g.fillStyle = color
      for (const r of rows) { g.beginPath(); g.arc(x(r.n), y(r.ms), 2.2, 0, Math.PI * 2); g.fill() }
    }
    line(preRows, '#c0503a')
    line(postRows, '#2f7d4f')
    // 이름표 — **줄 곁**에 둔다(오른쪽 표와 안 겹치게: 초판이 표 머리를 덮었다)
    g.font = '600 13px system-ui, sans-serif'
    g.fillStyle = '#c0503a'; g.fillText('수리 전 — 전량 재굽기', x(34) - 30, y(preRows[33]!.ms) - 14)
    g.fillStyle = '#2f7d4f'; g.fillText('수리 후 — 누적(얹기)', x(34) - 30, y(postRows[33]!.ms) - 14)
    // 값 표
    const rowsTxt: [string, string, string][] = [
      ['획 수', '수리 전', '수리 후'],
      ...[1, 10, 30, 60].map(n => [String(n), `${preRows[n - 1]!.ms.toFixed(1)} ms`, `${postRows[n - 1]!.ms.toFixed(1)} ms`] as [string, string, string]),
      ['다시 그린 획(60)', String(preRows[59]!.bakedStrokes), String(postRows[59]!.bakedStrokes)],
      ['얹은 획(60)', String(preRows[59]!.appendStrokes), String(postRows[59]!.appendStrokes)],
      ['업로드(60)', `${(preRows[59]!.uploadBytes / 1024).toFixed(0)} KB`, `${(postRows[59]!.uploadBytes / 1024).toFixed(0)} KB`],
      ['면 셋 · 각 20획', `${preE.ms.toFixed(0)} ms`, `${postE.ms.toFixed(1)} ms`],
    ]
    let ty = T + 30
    g.font = '12px system-ui, sans-serif'
    for (const [a, b, c] of rowsTxt) {
      g.fillStyle = a === '획 수' ? '#3c3831' : '#4a463f'
      g.font = a === '획 수' ? '600 12px system-ui, sans-serif' : '12px system-ui, sans-serif'
      g.fillText(a, R + 16, ty)
      g.fillStyle = a === '획 수' ? '#3c3831' : '#c0503a'; g.fillText(b, R + 128, ty)
      g.fillStyle = a === '획 수' ? '#3c3831' : '#2f7d4f'; g.fillText(c, R + 190, ty)
      ty += 19
    }
    g.fillStyle = '#8d8880'; g.font = '11px system-ui, sans-serif'
    g.fillText(`면 셋 마지막 커밋: ${preE.ms.toFixed(0)} ms → ${postE.ms.toFixed(1)} ms (${(preE.ms / Math.max(0.1, postE.ms)).toFixed(0)}배)`, R + 16, ty + 10)
    return cv.toDataURL('image/png')
  }, { preRows, postRows, preE, postE } as unknown as Record<string, unknown>)
  save('65-perf.png', url)
})

test('사진 — 65-panel.png: §2 뒤의 칠 패널 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진 — dpr1 한 번')
  await boot(page)
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(40)
  }
  await line(60, 620, 1140, 620); await line(500, 700, 900, 610); await line(500, 700, 150, 620); await line(900, 610, 640, 560)
  await line(150, 620, 640, 560); await line(500, 700, 500, 330); await line(900, 610, 900, 330); await line(900, 330, 500, 330)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(80)
  await page.click('#btn-paint'); await page.waitForTimeout(200)
  await line(540, 420, 860, 400)
  await line(560, 460, 840, 450)
  await page.waitForTimeout(300)
  saveBuf('65-panel.png', await page.screenshot({ type: 'png' }))
  await page.click('#paint-brush-btn'); await page.waitForTimeout(200)
  await page.evaluate(() => {
    for (const gname of ['Brunelleschi', 'Classic']) {
      const d = document.querySelector(`#brushpick-list details[data-group="${gname}"]`) as HTMLDetailsElement | null
      if (d) d.open = true
    }
  })
  await page.waitForTimeout(700)
  saveBuf('65-panel-brushes.png', await page.screenshot({ type: 'png' }))
})
