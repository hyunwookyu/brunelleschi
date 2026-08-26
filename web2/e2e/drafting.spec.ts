// web2-12 3부 — 제도 표현: 8 모서리 넘김 · 9 잉크 번짐 · 10 종이 결.
// **3부의 불변식: 표현만 바꾼다** — 오스냅·조각·면·lift가 수리 전후 동일해야 하고,
// 여기서는 그 판을 «넘김 꼬리 끝에서 오스냅이 안 잡힌다»(기하에 새 표적이 안 생겼다)와
// 「확정 좌표 == 재사영」(flow.spec의 불변식 k 팔)으로 잰다.

import { test, expect, type Page } from '@playwright/test'
import { PIXEL_DIFF_CH } from './thresholds'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number, steps = 10) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}

/** 잉크 겹의 상자 painted(알파>0) */
const inkBox = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round(ww! * dpr)), Math.max(1, Math.round(hh! * dpr))).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x, y, w, h])

/** 작도 완료 + 모서리 기둥 — 기둥 아래끝(500,500)은 만나고 위끝(500,300)은 자유다 */
async function corner(page: Page) {
  await drawLine(page, 100, 400, 1100, 400, 8)   // 지평선
  await drawLine(page, 500, 500, 600, 475)       // 깊이선 1
  await drawLine(page, 500, 500, 400, 475)       // 깊이선 2
  await drawLine(page, 500, 500, 500, 300)       // 기둥 — 승격된다
}

test('8 넘김 — 만나는 끝에만 꼬리가 있고, 자유 끝에는 없고, 꼬리는 스냅 표적이 아니다 · 줌 불변', async ({ page }) => {
  await boot(page)
  await corner(page)
  // 만나는 끝(아래 500,500) 너머 — 꼬리 픽셀이 있다(기둥 방향 아래로)
  const tail = await inkBox(page, 497, 502, 6, 8)
  // 자유 끝(위 500,300) 너머 — 없다(반증 조건 D-3: 전 끝에 넘기면 여기가 잡는다)
  const free = await inkBox(page, 497, 290, 6, 8)
  console.log(`[측정] 넘김 — 만나는 끝 너머 painted ${tail} · 자유 끝 너머 ${free}`)
  expect(tail).toBeGreaterThan(3)
  expect(free).toBe(0)

  // 꼬리는 기하가 아니다 — 꼬리 끝(500,505)의 오스냅이 **실제 끝점(500,500)**을 내거나
  // 없어야 한다(꼬리 끝 자체가 표적이 되면 기하를 건드린 것 — 3부 불변식의 판).
  const hit = await page.evaluate(() => (window as any).__b2.diag.osnapAt(500, 505))
  if (hit) {
    expect(Math.hypot(hit.p.x - 500, hit.p.y - 500), '스냅은 실제 끝점으로').toBeLessThan(0.5)
  }
  // 확정 좌표도 불변(a·b가 안 움직였다) — 기둥의 문서 좌표
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { a: s.a, b: s.b }
  })
  expect(st.a).toEqual({ x: 500, y: 500 })
  expect(st.b).toEqual({ x: 500, y: 300 })

  // 화면 고정(원칙 e) — 줌 2배 후 꼬리의 화면 길이가 그대로다(문서 길이가 아니다)
  await page.mouse.move(500, 500)
  for (let i = 0; i < 10; i++) {
    const s0 = await page.evaluate(() => (window as any).__b2.app.view.s)
    if (s0 >= 1.9) break
    await page.mouse.wheel(0, -350)
    await settle(page)
  }
  const zoomed = await page.evaluate(() => (window as any).__b2.app.view.s)
  // 줌 중심(500,500) 아래 꼬리 — 화면 좌표로 같은 대역이면 painted가 같은 자릿수다
  const tailZoom = await inkBox(page, 495, 502, 10, 10)
  console.log(`[측정] 넘김 줌 — 배율 ${zoomed.toFixed(2)} 꼬리 painted ${tailZoom}(전 ${tail})`)
  expect(zoomed).toBeGreaterThan(1.8)
  expect(tailZoom).toBeGreaterThan(3)
  expect(tailZoom).toBeLessThan(tail * 4)   // 문서 고정이면 길이 2배×굵기 2배 ≈ 4배를 넘는다
})

test('9 잉크 번짐 — 내림·뗌 자국·머무름 고임이 있고, 그리는 중과 뗀 뒤가 이어진다', async ({ page }) => {
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400, 8)
  await page.click('#btn-pen'); await settle(page)

  // 대기 잉크 획 — 시작·끝 자국: 몸통(1.5px)보다 끝이 굵다
  await drawLine(page, 300, 620, 700, 620, 12)
  const midBand = await inkBox(page, 495, 616, 8, 9)     // 몸통 가운데
  const endBand = await inkBox(page, 296, 616, 8, 9)     // 내림 자국
  console.log(`[측정] 번짐 끝자국 — 몸통 상자 ${midBand} · 시작 상자 ${endBand}`)
  expect(endBand).toBeGreaterThan(midBand)               // 대는 자리가 굵다

  // 머무름 — 펜을 한 자리에 머무르게(같은 점을 여러 번) 한 획
  await page.mouse.move(300, 680); await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(300 + i * 30, 680)
  for (let i = 0; i < 10; i++) await page.mouse.move(480 + (i % 2), 680)  // 고임(≥5점 묶음)
  for (let i = 1; i <= 6; i++) await page.mouse.move(480 + i * 30, 680)
  await settle(page)
  const dwellDuring = await inkBox(page, 474, 675, 12, 10)
  const plainDuring = await inkBox(page, 400, 675, 12, 10)
  await page.mouse.up(); await settle(page)
  const dwellAfter = await inkBox(page, 474, 675, 12, 10)
  const plainAfter = await inkBox(page, 400, 675, 12, 10)
  console.log(`[측정] 머무름 — 고임 상자 중${dwellDuring}/후${dwellAfter} · 맨몸통 중${plainDuring}/후${plainAfter}`)
  // ⚠ 국면 «안»에서 비교한다 — 이 획은 대기로 남아 뗌에서 몸체 렌더러가 바뀐다(벡터 →
  // rotring+파선: 설계된 상태 채널). 국면을 섞어 절대량을 견주면 그 몫이 섞인다(초판 실측
  // 이 그랬다). 뗌 연속성 자체는 draftgate의 INK 게이트(승격 경로)가 잰다.
  expect(dwellDuring).toBeGreaterThan(plainDuring)       // 머무른 자리가 고인다(그리는 중)
  expect(dwellAfter).toBeGreaterThan(plainAfter)         // 떼도 고임이 남는다(같은 함수·시드)
})

test('10 종이 결 — 겹에 마스크 한 장이 걸려 있고, 위상이 문서(팬)를 따라간다', async ({ page }) => {
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400, 8)
  await drawLine(page, 300, 550, 700, 550, 12)   // 확정 획(질감이 #brushc에)
  const mask = await page.evaluate(() => {
    const c = document.getElementById('brushc') as HTMLElement
    const s = document.getElementById('brushsnap') as HTMLElement
    const st = (el: HTMLElement) => getComputedStyle(el).maskImage || (getComputedStyle(el) as any).webkitMaskImage
    return { brushc: String(st(c)).slice(0, 30), snap: String(st(s)).slice(0, 30) }
  })
  console.log(`[측정] 종이 마스크 — brushc ${mask.brushc} · snap ${mask.snap}`)
  expect(mask.brushc).toContain('url')            // 한 장이 걸려 있다
  expect(mask.snap).toContain('url')              // 스냅샷 겹에도 같은 장(뗌 게이트의 전제)

  // 위상 = 문서 고정 — 팬(두 손가락 대신 데스크톱 확인: state.panBy와 같은 함수는
  // 입력층에 있으므로 화면 팬을 직접 낸다) 후 mask-position이 ox·oy를 따라간다
  const before = await page.evaluate(() => (document.getElementById('brushc') as HTMLElement).style.maskPosition)
  await page.evaluate(() => {
    const b = (window as any).__b2
    b.app.view = { ...b.app.view, ox: b.app.view.ox + 37, oy: b.app.view.oy + 11 }
    b.app.listeners.forEach((l: () => void) => l())
  })
  await settle(page)
  const after = await page.evaluate(() => (document.getElementById('brushc') as HTMLElement).style.maskPosition)
  console.log(`[측정] 종이 위상 — 팬 전 «${before}» 후 «${after}»`)
  expect(after).toBe('37px 11px')                 // ox·oy를 그대로 탄다(문서 고정)
  expect(after).not.toBe(before)                  // 반증(D-3): 화면 고정이면 안 움직인다
})
