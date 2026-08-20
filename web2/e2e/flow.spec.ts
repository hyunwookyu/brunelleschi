// 종단 — 사람이 하는 순서 그대로:
// 빈 화면 → 지평선 → 깊이선 둘 → 획 몇 개 → 돌리기 → 이어 그리기.
// 각 단계에서 픽셀이 실제로 그려졌는지 확인한다. (단계가 늘면 이 흐름도 는다)

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  }
  await page.mouse.up()
  await settle(page)
}

/** 영역의 실제 그려진 픽셀 수 — 2D 오버레이(ink) */
function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

/** 영역의 실제 그려진 픽셀 수 — 3D 캔버스(gl, preserveDrawingBuffer) */
function glPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const gl = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = gl.width; t.height = gl.height
    const ctx = t.getContext('2d')!
    ctx.drawImage(gl, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = ctx.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())

test('1단계 전체 흐름 — 지평선→소실점 둘→3D→궤도→이어 그리기', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)

  // 빈 화면
  expect(await inkPixels(page, 0, 0, 1200, 800)).toBe(0)

  // 지평선 — 수평 강제
  await drawLine(page, 100, 400, 1100, 403) // 손이 3px 튀어도 수평이 된다
  let s = await summary(page)
  expect(s.horizonY).toBe(400)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)

  // 깊이선 1 → 소실점 (900,400)
  await drawLine(page, 300, 700, 600, 550)
  s = await summary(page)
  expect(s.vps).toHaveLength(1)
  expect(Math.abs(s.vps[0].x - 900)).toBeLessThan(1e-6)
  expect(Math.abs(s.vps[0].y - 400)).toBeLessThan(1e-6)

  // 깊이선 2 → 소실점 (100,400), f² = 300·500
  await drawLine(page, 700, 700, 400, 550)
  s = await summary(page)
  expect(s.vps).toHaveLength(2)
  expect(s.fSource).toBe('two-vp')
  expect(Math.abs(s.f - Math.sqrt(150000))).toBeLessThan(1e-6)

  // 내용 획 1 — 수직(화면 평행) → 첫 앵커, 3D로
  await drawLine(page, 500, 500, 500, 300)
  s = await summary(page)
  expect(s.lifted).toBe(1)
  expect(await glPixels(page, 495, 305, 505, 495)).toBeGreaterThan(20)

  // 내용 획 2 — vp0 축으로 이어 긋기 → 연쇄 승격
  await drawLine(page, 500, 300, 700, 350)
  s = await summary(page)
  expect(s.lifted).toBe(2)

  // 불변식 k의 화면 층: 확정 좌표 = 재사영 (작도 포즈)
  const proj = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const out: { err: number }[] = []
    const pa = b2.diag.projectAll()
    for (const st of b2.app.doc.strokes) {
      const pr = pa[st.id]
      if (!pr) continue
      out.push({ err: Math.hypot(pr.a.x - st.a.x, pr.a.y - st.a.y) + Math.hypot(pr.b.x - st.b.x, pr.b.y - st.b.y) })
    }
    return out
  })
  expect(proj.length).toBe(2)
  for (const p of proj) expect(p.err).toBeLessThan(1e-3)

  // 대기 획 — 시작점이 3D에 없다. 사라지지 않는다(불변식 j)
  await drawLine(page, 900, 600, 1000, 645) // 자유 방향, 미연결
  s = await summary(page)
  expect(s.waiting).toHaveLength(1)
  expect(await inkPixels(page, 895, 595, 1005, 650)).toBeGreaterThan(20)

  // 돌리기 — 형태가 보인다
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(680, 430, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  s = await summary(page)
  const poseMoved = Math.abs(s.pose.q.y) > 1e-4
  expect(poseMoved).toBe(true)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20)

  // 이어 그리기 — 돌린 포즈에서 확정 끝점부터 vp0 축으로
  const aim = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const pa = b2.diag.projectAll()
    const ids = Object.keys(pa).map(Number).sort((a, b) => a - b)
    const endpoint = pa[ids[ids.length - 1]!]!.b
    const vp0 = b2.diag.screenAxes().find((x: any) => x.id === 'vp0')
    return { endpoint, vp: vp0?.vp ?? null }
  })
  expect(aim.vp).not.toBeNull()
  const dx = aim.vp.x - aim.endpoint.x, dy = aim.vp.y - aim.endpoint.y
  const L = Math.hypot(dx, dy)
  const t = Math.min(120, L * 0.4)
  await drawLine(page, aim.endpoint.x, aim.endpoint.y, aim.endpoint.x + dx / L * t, aim.endpoint.y + dy / L * t)
  s = await summary(page)
  expect(s.lifted).toBe(3)

  // 실행취소 — 그림만 되돌린다. 카메라(작도)는 그대로
  await page.keyboard.press('Control+z')
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(2)
  expect(s.vps).toHaveLength(2)
  await page.keyboard.press('Control+y')
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(3)

  // 작도 시점으로 — 지평선·작도선이 다시 보인다
  await page.click('#btn-draw-view')
  await settle(page)
  s = await summary(page)
  expect(Math.abs(s.pose.q.y)).toBeLessThan(1e-12)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)
})
