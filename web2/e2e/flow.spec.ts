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

  // ── 2단계: 오스냅 ────────────────────────────────────────────────────
  // 호버 — 수직획 중간 근처에서 근처점 표식이 뜬다
  await page.mouse.move(200, 100) // 먼저 빈 곳
  await settle(page)
  expect(await inkPixels(page, 492, 442, 512, 462)).toBe(0)
  await page.mouse.move(502, 450)
  await settle(page)
  expect(await inkPixels(page, 492, 442, 512, 462)).toBeGreaterThan(5) // 표식 픽셀

  // 선분 위 시작 — 수직획 사영 위 (500,450)에서 수평으로 → 3D로 올라간다
  const liftedBefore = (await summary(page)).lifted
  await drawLine(page, 502, 450, 650, 452) // 오스냅이 (500,450)으로, 축 스냅이 수평으로
  s = await summary(page)
  expect(s.lifted).toBe(liftedBefore + 1)

  // ── 3단계: 자동 분할 + 지우개 ────────────────────────────────────────
  // 수평획을 관통하는 세로획 → T자에서 수평획이 갈린다
  await drawLine(page, 600, 450, 600, 520)
  s = await summary(page)
  const liftedT = s.lifted
  expect(await glPixels(page, 612, 444, 645, 457)).toBeGreaterThan(5) // 오른쪽 조각이 있다

  // 지우개 — 오른쪽 조각만 지운다
  await page.click('#btn-eraser')
  await page.mouse.move(630, 450)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(liftedT) // 조각 교체 — 남은 왼쪽 + 세로획은 그대로
  expect(await glPixels(page, 612, 444, 645, 457)).toBe(0) // 지운 자리가 비었다
  expect(await glPixels(page, 500, 444, 596, 457)).toBeGreaterThan(5) // 왼쪽 조각은 남았다

  // 실행취소 — 지우개 한 번이 통째로 돌아온다
  await page.keyboard.press('Control+z')
  await settle(page)
  expect(await glPixels(page, 612, 444, 645, 457)).toBeGreaterThan(5)
  await page.click('#btn-pen')

  // ── 4단계: 화면 줌(뷰 오프셋) · 뷰 큐브 ─────────────────────────────
  // 그리는 중(작도 포즈)의 줌은 화면 조작 — 문서 좌표는 안 바뀐다
  await page.mouse.move(600, 300)
  await page.mouse.wheel(0, -300)
  await settle(page)
  s = await summary(page)
  expect(s.view.s).toBeGreaterThan(1.05)
  const hy = Math.round(400 * s.view.s + s.view.oy)
  expect(await inkPixels(page, 0, hy - 3, 1200, hy + 4)).toBeGreaterThan(100) // 지평선이 새 화면 위치에

  // 확대 상태에서도 그리기가 성립한다 — 화면 좌표는 역변환되어 문서로
  const sx = 500 * s.view.s + s.view.ox, sy = 450 * s.view.s + s.view.oy
  const liftedZ = s.lifted
  await drawLine(page, sx, sy, sx + 100, sy + 2)
  s = await summary(page)
  expect(s.lifted).toBe(liftedZ + 1)

  // 작도 시점 — 뷰 오프셋도 같이 돌아온다
  await page.click('#btn-draw-view')
  await settle(page)
  s = await summary(page)
  expect(s.view.s).toBe(1)

  // 뷰 큐브 — 보이고, 면을 클릭하면 롤 0 시점으로 선다
  expect(await inkPixels(page, 970, 30, 1070, 130)).toBeGreaterThan(10)
  await page.mouse.move(1020, 80)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  s = await summary(page)
  const movedDist = Math.hypot(s.pose.p.x, s.pose.p.y, s.pose.p.z)
  expect(movedDist).toBeGreaterThan(1) // 시점이 섰다
  const rightY = await page.evaluate(() => {
    const q = (window as any).__b2.app.pose.q
    // right = q · (1,0,0) 의 y 성분 — 롤 0이면 0
    return 2 * (q.x * q.y + q.w * q.z) // 회전행렬 m10
  })
  expect(Math.abs(rightY)).toBeLessThan(1e-6)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20) // 형태가 보인다

  await page.click('#btn-draw-view')

  // ── 5단계: 자동 저장 — 새로고침해도 그림과 카메라(재계산)가 남는다 ──
  const beforeReload = await summary(page)
  await page.waitForTimeout(600) // 자동 저장 디바운스
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(beforeReload.strokes)
  expect(s.vps).toHaveLength(2)
  expect(s.lifted).toBe(beforeReload.lifted)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20)
  // 빌드 식별자가 보인다
  const buildId = await page.textContent('#buildid')
  expect(buildId && buildId.length).toBeGreaterThan(3)
})
