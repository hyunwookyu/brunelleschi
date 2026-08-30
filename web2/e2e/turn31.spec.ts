// web2-31 1번 — 뷰 큐브 90° 화살표가 **브라우저에서** 도는가.
//
// 단위 팔(`test/turn31.test.ts`)이 기하를 전부 잰다. 여기가 더하는 것은 셋이다:
//   ① 화살표가 **그려진다**(캔버스 픽셀) — 그림쇠가 실제로 있는가
//   ② 그 자리를 눌렀을 때 앱이 **화살표로 읽는다**(면 클릭이 아니라)
//   ③ 전환이 **보간된다** — 누른 직후에는 아직 목표가 아니고, 잠시 뒤 정확히 목표다
// 그리고 ④ 네 번 누르면 자세가 **정확히 돌아온다**(회전행렬 비교, 눈으로 말고).
//
// ⚠ 조건(#71): 뷰포트 1200×800 · dpr 둘 다(playwright.config의 두 판이 그대로 돈다).
//   큐브 자리는 `app.cubeLayout`에서 읽는다 — px를 여기 옮겨 적지 않는다(#88).

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
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

/** 카메라의 세 축(회전행렬) — 자세 비교는 이것으로 한다 */
const frame = (page: Page) => page.evaluate(() => {
  const q = (window as any).__b2.app.pose.q
  const rot = (v: number[]) => {
    const [x, y, z] = v as [number, number, number]
    const ux = q.x, uy = q.y, uz = q.z, w = q.w
    const cx = uy * z - uz * y, cy = uz * x - ux * z, cz = ux * y - uy * x
    const tx = 2 * cx, ty = 2 * cy, tz = 2 * cz
    const c2x = uy * tz - uz * ty, c2y = uz * tx - ux * tz, c2z = ux * ty - uy * tx
    return [x + w * tx + c2x, y + w * ty + c2y, z + w * tz + c2z]
  }
  return { right: rot([1, 0, 0]), up: rot([0, 1, 0]), back: rot([0, 0, 1]) }
})

const DEG = 180 / Math.PI
type Fr = { right: number[]; up: number[]; back: number[] }
const ang = (a: number[], b: number[]) =>
  Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * DEG
const gapDeg = (a: Fr, b: Fr) => Math.max(ang(a.right, b.right), ang(a.up, b.up), ang(a.back, b.back))

/** 2점 작도 — 지평선 · 깊이선 둘 · 기둥 하나(3D 기하가 있어야 궤도가 돈다) */
async function construct(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  const an = await page.evaluate(() => {
    const a = (window as any).__b2.app.lift.an
    return { vps: a.vps.length, done: a.constructionDone }
  })
  expect(an.vps, '소실점 둘 — 2점 구도').toBe(2)
  expect(an.done).toBe(true)
}

/** 화살표의 짚는 자리 — 큐브 크기에서 유도한다(#88: px를 옮겨 적지 않는다).
 *  배수는 `C.CUBE_ARROW_R0/R1`의 가운데다. */
async function arrowPoint(page: Page, dir: 'left' | 'right' | 'up' | 'down') {
  const cube = await page.evaluate(() => (window as any).__b2.app.cubeLayout)
  const r = cube.size * 0.79   // (R0 0.68 + R1 0.90) / 2
  const u = dir === 'left' ? [-1, 0] : dir === 'right' ? [1, 0] : dir === 'up' ? [0, -1] : [0, 1]
  return { x: cube.cx + u[0]! * r, y: cube.cy + u[1]! * r, cube }
}

test('31-1 ① 화살표가 그려진다 — 큐브 밖 네 자리에 픽셀이 있다', async ({ page }) => {
  await construct(page)
  const cube = await page.evaluate(() => (window as any).__b2.app.cubeLayout)
  const s = cube.size
  const boxes: [string, number, number, number, number][] = [
    ['left', cube.cx - s * 0.92, cube.cy - s * 0.2, cube.cx - s * 0.66, cube.cy + s * 0.2],
    ['right', cube.cx + s * 0.66, cube.cy - s * 0.2, cube.cx + s * 0.92, cube.cy + s * 0.2],
    ['up', cube.cx - s * 0.2, cube.cy - s * 0.92, cube.cx + s * 0.2, cube.cy - s * 0.66],
    ['down', cube.cx - s * 0.2, cube.cy + s * 0.66, cube.cx + s * 0.2, cube.cy + s * 0.92],
  ]
  for (const [name, x0, y0, x1, y1] of boxes) {
    const n = await inkPixels(page, x0, y0, x1, y1)
    console.log(`[31-1 ①] ${name} 화살표 픽셀 ${n}`)
    expect(n, `${name} 화살표가 그려졌다`).toBeGreaterThan(20)
  }

  // **«겹친다»와 «가린다»는 다른 물음이다**(PITFALLS #87) — 그려졌는지만 재면 절반이다.
  // 사람이 겪는 것은 `elementFromPoint`가 누구를 내는가다. 초판이 여기서 걸렸다:
  // 오른쪽 화살표가 세로바(`sidebar-body`·`btn-draw-view`) 뒤로, 위 화살표가 창 밖으로
  // 나가 있었다. 그래서 그림쇠 자리를 **화살표 뻗침에서 유도**하도록 고쳤다.
  const cover = await page.evaluate((cube) => {
    const out: Record<string, string | null> = {}
    for (const [n, ux, uy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]] as const) {
      const e = document.elementFromPoint(
        cube.cx + ux * cube.size * 0.90, cube.cy + uy * cube.size * 0.90) as HTMLElement | null
      out[n] = e ? (e.id || e.tagName) : null
    }
    return out
  }, cube)
  console.log(`[31-1 ①] 화살표 끝을 짚으면 ${JSON.stringify(cover)}`)
  for (const n of ['left', 'right', 'up', 'down']) {
    expect(cover[n], `${n} 화살표 끝이 캔버스다(가려지지도 창 밖도 아니다)`).toBe('ink')
  }
})

test('31-1 ②③④ 누르면 축 틀에서 90° 돌고, 보간하며, 네 번이면 정확히 돌아온다', async ({ page }) => {
  await construct(page)
  const before = await frame(page) as Fr

  // ② 화살표 자리를 누른다 — 큐브 면이 아니라 화살표로 읽혀야 한다
  const p = await arrowPoint(page, 'right')
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.up()

  // ③ 보간 — 누른 **직후**에는 아직 목표가 아니다(즉시 점프면 여기서 이미 끝나 있다)
  await settle(page)
  const mid = await frame(page) as Fr
  const midGap = gapDeg(before, mid)
  console.log(`[31-1 ③] 누른 직후 진행 ${midGap.toFixed(3)}° (즉시 점프면 52.24°에 이미 닿아 있다)`)
  expect(midGap, '조금은 움직였다').toBeGreaterThan(0)
  // 목표는 52.238756°다 — 그보다 **작으면** 보간이 있었다는 뜻이다(즉시 점프면 정확히 그 값).
  // 실측: dpr1 4.797° · dpr2 34.897°(느린 프레임). 문을 52.0에 둬 느린 기계에서 흔들리지 않게 한다.
  expect(midGap, '아직 목표가 아니다 — 보간 중이다').toBeLessThan(52)

  await page.waitForTimeout(500)
  await settle(page)
  const after1 = await frame(page) as Fr
  const step1 = gapDeg(before, after1)
  console.log(`[31-1 ②] 첫 누름 뒤 자세 변화 ${step1.toFixed(6)}° — **90°가 아니다**(축 틀로 양자화한 뒤 90°)`)
  expect(step1).toBeGreaterThan(1)

  // ④ **거기서** 네 번 더 — 네 번이 한 바퀴다(첫 누름은 «양자화 + 90°»라 주기 밖이다)
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(500)
    await settle(page)
  }
  const after5 = await frame(page) as Fr
  const closed = gapDeg(after1, after5)
  console.log(`[31-1 ④] 네 번 더 누른 뒤 그 자세와의 차 ${closed.toFixed(6)}°`)
  expect(closed, '네 번 = 항등').toBeLessThan(0.01)

  // 그 자세가 **축**에 정렬한다 — 앱이 그리는 ✕ 표식이 하나뿐이면 정면이다
  const marks = await page.evaluate(() => (window as any).__b2.diag.vpMarks().map((m: any) => m.id))
  console.log(`[31-1 ④] 표식 ${marks.join(' · ')}`)
  expect(marks.length, '축 정면 — 나머지 가로축은 무한원으로 간다').toBe(1)
})

test('31-1 ⑤ 위 화살표는 정확한 평면에 닿고 거기서도 그릴 수 있다', async ({ page }) => {
  await construct(page)
  const p = await arrowPoint(page, 'up')
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(500)
  await settle(page)
  const f = await frame(page) as Fr
  // 평면 = 시선이 정확히 아래(back = +Y)
  const planDeg = ang(f.back, [0, 1, 0])
  console.log(`[31-1 ⑤] 평면 오차 ${planDeg.toFixed(6)}°`)
  expect(planDeg).toBeLessThan(0.01)

  // **그리기를 막지 않는다** — 새 기제 없이 종전 규칙이 그대로 돈다
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 400, 300, 700, 320)
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  console.log(`[31-1 ⑤] 평면에서 획 ${n0} → ${n1}`)
  expect(n1).toBe(n0 + 1)
})
