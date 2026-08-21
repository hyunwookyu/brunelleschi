// 종단 — **돌려보다가 그리려면 정렬된 구도로 돌아와야 한다.**
// 단위(`test/level.test.ts`)는 가짜 시계로 재고, 여기서는 **진짜 시계와 진짜 입력**으로 잰다:
// 중버튼을 잡고 있는 동안 안 접히는가 · 놓으면 접히는가 · 기울어 있는 동안 획이 안 생기는가.

import { test, expect, type Page } from '@playwright/test'

const FOLD_DELAY_MS = 1200
const FOLD_ANIM_MS = 300

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  }
  await page.mouse.up()
  await settle(page)
}

const lev = (page: Page) => page.evaluate(() => (window as any).__b2.diag.level())
const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

/** 요 두 방향 사이 각(도) */
const yawGap = (a: any, b: any) =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI

/** 중버튼으로 위아래로 끈다 — 놓지 않는다 */
async function tiltDown(page: Page) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(640, 500, { steps: 8 })
  await settle(page)
}

async function waitFolded(page: Page) {
  await page.waitForFunction(
    () => (window as any).__b2.diag.level().level && !(window as any).__b2.diag.level().folding,
    null, { timeout: 10_000 })
  await settle(page)
}

test('돌려본 뒤 정렬로 접힌다 — 놓으면 · 잡고 있으면 안 접힌다 · 기울어 있으면 안 그려진다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)

  // 작도 — 지평선 · 깊이선 둘 · 기둥 하나(3D 기하가 있어야 궤도가 돈다)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  expect((await page.evaluate(() => (window as any).__b2.diag.summary())).lifted).toBe(3)
  expect((await lev(page)).level).toBe(true)

  // ── 기울인다 ────────────────────────────────────────────────────────
  const eyeBefore = (await lev(page)).eye          // **궤도 전** 눈높이 — 접으면 여기로 돌아온다
  await tiltDown(page)
  let s = await lev(page)
  expect(s.level).toBe(false)
  expect(Math.abs(s.fwd.y)).toBeGreaterThan(0.05)      // 실제로 위아래로 돌았다
  // **기울어 있을 때 무엇이 다른지 보인다** — 한 줄이 그것을 말한다
  expect(await page.textContent('#notice')).toContain('기울어')

  // ── 잡고 있는 동안에는 안 접힌다 (지연의 두 배를 기다린다) ──────────
  const held = s
  await page.waitForTimeout(FOLD_DELAY_MS * 2)
  await settle(page)
  s = await lev(page)
  expect(s.level).toBe(false)
  expect(s.fwd.y).toBeCloseTo(held.fwd.y, 12)          // 한 톨도 안 움직였다

  // ── 놓으면 접힌다 ──────────────────────────────────────────────────
  const yaw0 = s.yaw
  expect(Math.abs(s.eye - eyeBefore)).toBeGreaterThan(0.5)   // 궤도가 눈높이를 바꿨다
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)          // 놓자마자는 아직 그대로다
  await waitFolded(page)
  s = await lev(page)
  expect(s.level).toBe(true)
  expect(Math.abs(s.fwd.y)).toBeLessThan(1e-9)         // 피치 0
  expect(yawGap(s.yaw, yaw0)).toBeLessThan(1e-3)       // 좌우 각도는 **새 값**
  expect(s.eye).toBeCloseTo(eyeBefore, 6)              // 눈높이는 **궤도 전** 값(web2-05)
  expect(await page.textContent('#notice')).not.toContain('기울어')

  // ── 기울어 있는 동안에는 획이 안 생긴다 ─────────────────────────────
  const n0 = await strokeCount(page)
  await tiltDown(page)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0)             // 하나도 안 늘었다
  // 그 누름이 죽은 클릭이 아니다 — 접기를 당긴다
  await waitFolded(page)

  // ── 접힌 뒤에는 그려진다 ───────────────────────────────────────────
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0 + 1)
  expect(FOLD_ANIM_MS).toBeLessThan(FOLD_DELAY_MS)     // 상수 대조 — 값이 바뀌면 여기가 안다
})

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

test('소실점에 커서를 올리면 **붙었다는 표식이 뜬다** — 픽셀로 잰다', async ({ page }) => {
  // 재현: 스냅 판정은 돌았는데 `render2d`의 `mark()` switch에 `'vp'`가 없어
  // **빈 경로에 stroke**가 되어 아무것도 안 그려졌다. 상시 떠 있는 ✕만 남아
  // 「붙었다」와 「안 붙었다」가 화면에서 구별되지 않았다 —
  // 실측(수리 전): 소실점 둘레 픽셀 **80 → 80(차 0)**, 같은 조건에서 끝점 **10 → 72(+62)**.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  const vps = await page.evaluate(() => (window as any).__b2.diag.summary().vps)
  expect(vps[0]).toEqual({ x: 900, y: 400 })

  // 커서를 멀리 — ✕만 있는 상태
  await page.mouse.move(200, 700)
  await settle(page)
  const away = await inkPixels(page, 885, 385, 915, 415)
  expect(away).toBeGreaterThan(0)                 // ✕는 상시 표시다(대조군이 비면 안 잰다)

  // 커서를 소실점 위로 — **표식이 더해져야 한다**
  await page.mouse.move(900, 400)
  await settle(page)
  const on = await inkPixels(page, 885, 385, 915, 415)
  // 실측(dpr 1): 수리 전 **80 → 80(차 0)** · 수리 후 **80 → 182(차 +102)**.
  // 임계 20은 실측 102의 **5분의 1**이다 — dpr·안티에일리어싱 여유를 두되 «0과 가른다»는
  // 목적에 필요한 만큼만. 대조군(끝점)은 배경 10에 +62였다.
  expect(on).toBeGreaterThan(away + 20)           // 수리 전에는 차가 **0**이었다

  // 그리고 실제로 그 점에서 시작한다 — 붙은 좌표가 그대로 확정된다(원칙 d)
  await drawLine(page, 903, 402, 700, 550)        // 3 px 빗나가게 누른다
  const st = await page.evaluate(() => {
    const d = (window as any).__b2.app.doc.strokes
    return d[d.length - 1]
  })
  expect(st.a).toEqual({ x: 900, y: 400 })        // 소실점에 붙었다
})

test('작도가 안 끝난 채 접히면 그 길이 화면에 뜬다 — 한 번 누르면 작도 시점으로', async ({ page }) => {
  // 이 회차가 만든 함정의 화면 층(2차 리뷰어 [2]). 접힌 포즈는 정렬이라 그릴 수 있어
  // 보이는데 **소실점은 못 만든다.** 그 사실과 **가는 길**이 한 줄에 함께 있어야 한다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)        // 지평선
  await drawLine(page, 500, 500, 600, 475)         // 깊이선 1 — 소실점 하나뿐이다
  expect(await page.evaluate(() => (window as any).__b2.diag.summary().vps.length)).toBe(1)

  await tiltDown(page)
  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  expect((await lev(page)).level).toBe(true)
  const line = await page.textContent('#notice')
  expect(line).toContain('작도가 아직 안 끝났다')
  // **밑줄 단어가 실제로 있고 눌리면 작도 시점으로 간다**
  await page.click('#notice u[data-pick="draw-view"]')
  await settle(page)
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  expect(Math.abs(s.pose.q.y)).toBeLessThan(1e-12)   // 작도 시점 — 요가 0이다(그 길의 대가)
  // 그 자리에서는 소실점이 만들어진다
  await drawLine(page, 500, 500, 400, 475)
  expect(await page.evaluate(() => (window as any).__b2.diag.summary().vps.length)).toBe(2)
})

test('**접힌 뒤에도 지평선이 그려진다** — 픽셀로 잰다 (web2-06 지시 3)', async ({ page }) => {
  // 재현: `render2d`가 지평선을 **작도 포즈에서만** 그었다. 접힌 포즈는 피치 0이라
  // 지평선이 그대로 화면 수평선인데도 사라졌고, 그래서 web2-05의 증상(「지평선이 위로
  // 올라간다」)을 **고친 뒤에 화면에서 확인할 수가 없었다.**
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)

  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  // 지평선 자리의 가로 띠 — CSS px로 환산한 픽셀 수(dpr 1·2에서 같은 눈금으로 읽는다)
  const band = async () => (await inkPixels(page, 0, 397, 1200, 403)) / (dpr * dpr)

  await page.mouse.move(200, 700)          // 커서를 띠 밖으로 (호버 표식이 안 섞이게)
  await settle(page)
  const atDraw = await band()
  expect(atDraw).toBeGreaterThan(600)      // 작도 포즈 — 화면 전폭의 선이 있다

  // 기울인다 — 그때는 **없는 것이 맞다**(화면 수평선이 아니다). 반증 조건이다.
  await tiltDown(page)
  await settle(page)
  const tilted = await band()
  expect(tilted).toBeLessThan(atDraw / 4)

  // 놓아 접는다 — **다시 있어야 한다**. 고치기 전에는 여기가 `tilted` 수준이었다.
  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  await page.mouse.move(200, 700)
  await settle(page)
  const folded = await band()
  expect((await lev(page)).level).toBe(true)
  expect(folded).toBeGreaterThan(600)
  expect(folded).toBeGreaterThan(tilted * 4)
})

test('**돌려보다 줌한 거리가 접어도 남는다** — 궤도 반경 (web2-06 지시 5)', async ({ page }) => {
  // 재현: 접기가 앵커로 통째로 돌아가면서 **줌까지 지웠다**(단위 실측 7.565 → 줌 3.782 →
  // 접은 뒤 7.565). 궤도는 pivot 둘레의 회전이라 반경을 구성상 보존하므로, 반경이
  // 달라졌다면 그것은 사람이 정한 값이다 — 그래서 접기가 지킨다.
  // 여기서는 **진짜 입력**으로 잰다(휠). 계산이 `input.ts`에 있던 동안은 시험이 못 부르던 길이다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)

  const r0 = (await lev(page)).radius
  expect(r0).toBeGreaterThan(0)

  await tiltDown(page)                                  // 중버튼을 잡은 채 기울인다
  expect((await lev(page)).radius).toBeCloseTo(r0, 6)   // 궤도는 반경을 안 바꾼다

  await page.mouse.wheel(0, -400)                       // 다가간다
  await settle(page)
  const rZoom = (await lev(page)).radius
  expect(rZoom).toBeLessThan(r0 * 0.9)

  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  expect((await lev(page)).level).toBe(true)
  expect((await lev(page)).radius).toBeCloseTo(rZoom, 6)   // ← 고치기 전에는 r0로 돌아갔다
})
