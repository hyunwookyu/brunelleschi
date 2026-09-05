// web2-66 ⛳ 사진 — 사람 눈의 판정대(CLOSING).
//   66-frozen.png   ⛳ 지시가 요구한 그림 — **프레임 여럿의 도장 위치를 겹쳐 그린 그림**:
//                   pre 판(반증 스위치 — 전량 되그리기 + 옛 굵기 표집)은 번지고, post 판은 겹친다.
//   66-latency.png  획 길이(점 20·100·400) 대 «그리는 중» 프레임 시간 — pre vs post(원장 perf66에서).
//   66-marker.png   §2 — 같은 마커로 방향 넷(가로·45°·세로·135°)으로 그은 자국.
//   66-spacing.png  게이트 ⑦ — 도구 넷의 기본 간격 vs 촘촘한 판(spacingK .5) 나란히(판정은 사람).
//
// ⚠ #104: PNG는 stage0/out/shots66/(vite 감시 밖)에 쓰고 실행 뒤 web2/shots/로 옮긴다(tools/shots66-copy.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots66')
const LEDGER = (n: string) => resolve(HERE, `../../stage0/out/${n}`)

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  mkdirSync(OUTDIR, { recursive: true })
}
const save = (name: string, dataUrl: string) => {
  const b64 = dataUrl.split(',')[1]!
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), Buffer.from(b64, 'base64'))
  expect(b64.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}
async function bigBox(page: Page) {
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}
async function pickPaint(page: Page, i = 'pencil', w = 18, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 한 붓을 그리며 표본 프레임마다 도장 (x,y) 전체를 뜬다(paint66 ①의 그 자 — 같은 몸짓). */
async function frameDabs(page: Page, n: number, samples: number): Promise<number[][]> {
  return await page.evaluate(async ([n, samples]) => {
    const N = n as number, S = samples as number
    const b2 = (window as any).__b2
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    const pt = (i: number) => ({ x: 540 + (i / (N - 1)) * 310, y: 400 + (i / (N - 1)) * 40 })
    b2.diag.setDabLogForTest(true)
    fire('pointerdown', pt(0).x, pt(0).y, 0.5, 1)
    const out: number[][] = []
    const at = new Set(Array.from({ length: S }, (_, k) => Math.round(((k + 1) / S) * (N - 1))))
    for (let i = 1; i < N; i++) {
      fire('pointermove', pt(i).x, pt(i).y, 0.5, 1)
      if (at.has(i)) { await raf(); out.push([...(b2.diag.lastDabLogForTest() as number[])]) }
    }
    await raf()
    fire('pointerup', pt(N - 1).x, pt(N - 1).y, 0, 0)
    b2.diag.setDabLogForTest(false)
    await raf()
    return out
  }, [n, samples] as unknown[]) as number[][]
}

test('사진 — 66-frozen.png: 프레임 여럿의 도장 위치 겹침(수리 전 vs 후) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '그림 — dpr1 한 번')
  test.setTimeout(300_000)
  await boot(page)
  await bigBox(page)
  await pickPaint(page)
  // post 판(제품 그대로) — 표본 프레임 8
  const post = await frameDabs(page, 120, 8)
  await page.click('#btn-undo'); await page.waitForTimeout(200)
  // pre 판 — 반증 스위치 둘(전량 되그리기 + 옛 굵기 표집 = 수리 전 그대로)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintFreezeOffForTest(true); (window as any).__b2.diag.setPaintWLegacyForTest(true) })
  const pre = await frameDabs(page, 120, 8)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintFreezeOffForTest(false); (window as any).__b2.diag.setPaintWLegacyForTest(false) })
  await page.click('#btn-undo'); await page.waitForTimeout(200)
  const url = await page.evaluate((arg) => {
    const { pre, post } = arg as { pre: number[][]; post: number[][] }
    const W = 1100, H = 640, dpr = 2
    const cv = document.createElement('canvas')
    cv.width = W * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    g.fillStyle = '#faf8f3'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#3c3831'; g.font = '600 17px system-ui, sans-serif'
    g.fillText('web2-66 — 그리는 동안 프레임 8개의 «이미 그려진 도장» 위치를 겹쳐 그렸다 (한 획 · 120점 · 원근 벽)', 24, 32)
    g.font = '12px system-ui, sans-serif'; g.fillStyle = '#6b665c'
    g.fillText('수리 전: 새 점이 들어올 때마다 굵기 환산(획 첫→끝 중점)이 다시 되어 지나간 도장이 통째로 밀린다 — 번짐.  수리 후: 확정 도장은 층에 눌려 다시는 안 움직인다 — 겹침.', 24, 52)
    const panel = (frames: number[][], x0: number, label: string, color: string) => {
      // 각 판의 도장들을 제 좌표계(텍스처 px)에서 정규화해 그린다
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
      for (const f of frames) for (let i = 0; i < f.length; i += 3) {
        mnx = Math.min(mnx, f[i]!); mxx = Math.max(mxx, f[i]!)
        mny = Math.min(mny, f[i + 1]!); mxy = Math.max(mxy, f[i + 1]!)
      }
      const PW = 500, PH = 470, T = 90
      const sc = Math.min(PW / (mxx - mnx + 20), PH / (mxy - mny + 20))
      const px = (x: number) => x0 + (x - mnx + 10) * sc
      const py = (y: number) => T + (y - mny + 10) * sc
      g.strokeStyle = '#d8d2c4'; g.strokeRect(x0, T, PW, PH)
      g.fillStyle = color
      g.font = '600 13px system-ui, sans-serif'
      g.fillText(label, x0, T - 8)
      for (const f of frames) {
        for (let i = 0; i < f.length; i += 3) {
          g.globalAlpha = 0.28
          g.beginPath(); g.arc(px(f[i]!), py(f[i + 1]!), 2.4, 0, Math.PI * 2); g.fill()
        }
      }
      g.globalAlpha = 1
      // 이동량(마지막 두 표본의 앞 80%) — 그림에 값도 같이
      const a = frames[frames.length - 2]!, b = frames[frames.length - 1]!
      const m = Math.floor(Math.min(a.length, b.length) / 3 * 0.8)
      let mx = 0, sum = 0
      for (let i = 0; i < m; i++) {
        const d = Math.hypot(b[i * 3]! - a[i * 3]!, b[i * 3 + 1]! - a[i * 3 + 1]!)
        if (d > mx) mx = d
        sum += d
      }
      g.fillStyle = '#4a463f'; g.font = '12px system-ui, sans-serif'
      g.fillText(`확정 구간 이동량 — 최대 ${mx.toFixed(2)}px · 평균 ${(sum / Math.max(1, m)).toFixed(2)}px (도장 ${m}개)`, x0, T + PH + 22)
      return { mx, mean: sum / Math.max(1, m) }
    }
    const p1 = panel(pre, 40, '수리 전 — 매 프레임 전량 되그리기(도장이 번진다)', '#c0503a')
    const p2 = panel(post, 580, '수리 후 — 확정 구간을 얼린다(도장이 겹친다)', '#2f7d4f')
    return { url: cv.toDataURL('image/png'), p1, p2 }
  }, { pre, post } as unknown as Record<string, unknown>) as unknown as { url: string; p1: { mx: number }; p2: { mx: number } }
  expect(url.p1.mx, '수리 전 판은 실제로 번진다(그림이 그 증거다)').toBeGreaterThan(0.3)
  expect(url.p2.mx, '수리 후 판은 겹친다').toBe(0)
  save('66-frozen.png', url.url)
})

test('사진 — 66-latency.png: 획 길이 대 프레임 시간(pre vs post · 원장 perf66) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '그래프 — dpr1 한 번')
  await boot(page)
  const pre = JSON.parse(readFileSync(LEDGER('perf66_pre_web2_dpr1.json'), 'utf8')) as any
  const post = JSON.parse(readFileSync(LEDGER('perf66_web2_dpr1.json'), 'utf8')) as any
  type R = { n: number; a_frame_ms: { head6: number; mid6: number; tail6: number; max: number } }
  const preR = pre.abc as R[], postR = post.abc as R[]
  expect(preR.length).toBe(3); expect(postR.length).toBe(3)
  const url = await page.evaluate((arg) => {
    const { preR, postR } = arg as { preR: { n: number; a_frame_ms: { head6: number; mid6: number; tail6: number; max: number } }[]; postR: typeof preR }
    const W = 1100, H = 560, dpr = 2
    const cv = document.createElement('canvas')
    cv.width = W * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    g.fillStyle = '#faf8f3'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#3c3831'; g.font = '600 17px system-ui, sans-serif'
    g.fillText('web2-66 — 그리는 중 프레임 시간(꼬리 6이동 평균) · 획 길이 20·100·400점 (dpr1 · 원장 perf66)', 24, 32)
    g.font = '12px system-ui, sans-serif'; g.fillStyle = '#6b665c'
    g.fillText('수리 전은 매 프레임 획 «전체»를 다시 그려 프레임 시간이 길이에 비례한다(400점 꼬리 91.6ms — 「초 단위 버퍼링」의 자리). 수리 후는 «새 도장 몇»뿐이라 평평하다.', 24, 52)
    const L = 90, R = W - 60, T = 90, B = H - 80
    const maxMs = Math.max(...preR.map(r => r.a_frame_ms.tail6)) * 1.1
    const xs = [0, 1, 2]
    const x = (k: number) => L + (k / 2) * (R - L)
    const y = (ms: number) => B - (ms / maxMs) * (B - T)
    g.strokeStyle = '#d8d2c4'; g.beginPath()
    for (let k = 0; k <= 5; k++) { const yy = T + (k / 5) * (B - T); g.moveTo(L, yy); g.lineTo(R, yy) }
    g.stroke()
    g.fillStyle = '#8d8880'; g.font = '11px system-ui, sans-serif'
    for (let k = 0; k <= 5; k++) g.fillText(`${(maxMs * (1 - k / 5)).toFixed(0)} ms`, 30, T + (k / 5) * (B - T) + 4)
    for (const k of xs) g.fillText(`${preR[k]!.n}점`, x(k) - 12, B + 24)
    const line = (rows: typeof preR, color: string, label: string) => {
      g.strokeStyle = color; g.lineWidth = 2.4
      g.beginPath()
      rows.forEach((r, k) => { const px2 = x(k), py = y(r.a_frame_ms.tail6); if (k === 0) g.moveTo(px2, py); else g.lineTo(px2, py) })
      g.stroke()
      g.fillStyle = color
      rows.forEach((r, k) => {
        g.beginPath(); g.arc(x(k), y(r.a_frame_ms.tail6), 3.4, 0, Math.PI * 2); g.fill()
        g.font = '600 12px system-ui, sans-serif'
        g.fillText(`${r.a_frame_ms.tail6.toFixed(1)} ms`, x(k) + 10, y(r.a_frame_ms.tail6) - 8)
      })
      g.font = '600 13px system-ui, sans-serif'
      g.fillText(label, x(1) - 40, y(rows[1]!.a_frame_ms.tail6) - 22)
    }
    line(preR, '#c0503a', '수리 전 — 길이에 비례')
    line(postR, '#2f7d4f', '수리 후 — 평평')
    return cv.toDataURL('image/png')
  }, { preR, postR } as unknown as Record<string, unknown>)
  save('66-latency.png', url as string)
})

test('사진 — 66-marker.png: 마커 방향 넷 (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진 — dpr1 한 번')
  test.setTimeout(300_000)
  await boot(page)
  await bigBox(page)
  // §2 — 마커 방향 넷(가로·45°·세로·135°) — 벽 안에서
  await pickPaint(page, 'marker', 26, '#4a6b8a')
  const strokeDir = async (cx: number, cy: number, dx: number, dy: number) => {
    await page.mouse.move(cx - dx, cy - dy); await page.mouse.down()
    await page.mouse.move(cx, cy, { steps: 6 })
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 })
    await page.mouse.up(); await page.waitForTimeout(120)
  }
  await strokeDir(640, 390, 80, 8)      // 가로(벽의 결)
  await strokeDir(780, 430, 40, -40)    // 45°
  await strokeDir(600, 480, 6, 60)      // 세로
  await strokeDir(760, 530, 40, 40)     // 135°
  await page.waitForTimeout(300)
  saveBuf('66-marker.png', await page.screenshot({ type: 'png', clip: { x: 480, y: 300, width: 460, height: 420 } }))
})

test('사진 — 66-spacing.png: 도구별 간격(기본 vs 촘촘 · 판정은 사람) (dpr1에서만)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '화면 사진 — dpr1 한 번')
  test.setTimeout(300_000)
  await boot(page)
  await bigBox(page)
  const tools = ['pencil', 'brush', 'marker', 'cp'] as const
  for (let t = 0; t < tools.length; t++) {
    for (const [j, k] of [[0, 1], [1, 0.5]] as const) {
      await pickPaint(page, tools[t], 16, '#5a4a3a')
      await page.evaluate(([tool, kk]) => {
        const b2 = (window as any).__b2
        if ((kk as number) !== 1) b2.diag.setPaintParamForTest(tool, 'spacingK', kk)
        else b2.diag.resetPaintTuneForTest(tool)
      }, [tools[t], k] as const)
      const y = 360 + t * 60 + j * 24
      await page.mouse.move(545, y); await page.mouse.down()
      await page.mouse.move(700, y + 8, { steps: 10 })
      await page.mouse.move(850, y + 16, { steps: 10 })
      await page.mouse.up(); await page.waitForTimeout(120)
    }
    await page.evaluate((tool) => { (window as any).__b2.diag.resetPaintTuneForTest(tool) }, tools[t])
  }
  await page.waitForTimeout(300)
  saveBuf('66-spacing.png', await page.screenshot({ type: 'png', clip: { x: 480, y: 320, width: 460, height: 320 } }))
})
