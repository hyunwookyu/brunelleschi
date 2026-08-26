// 면 — **픽셀로 확인한다.** 좌표만으로는 안 보이는 것을 못 잡는다(지시).
//
// 잰 것: ① 면 도구를 고르고 탭하면 그 영역이 실제로 칠해진다
//        ② 다시 탭하면 그 픽셀이 사라진다
//        ③ 미리보기(2D)가 탭 전에 그 영역을 두른다
//        ④ 경계 선을 지우면 칠이 사라진다 — 실행취소로 돌아온다
//        ⑤ 면이 **선을 안 가린다**(선 우선순위) — 칠한 뒤에도 선 픽셀이 그대로다

import { test, expect, type Page } from '@playwright/test'

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

/** 탭 — 누른 자리에서 안 움직이고 뗀다(면 도구의 몸짓) */
async function tap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
}

function countPixels(page: Page, id: 'ink' | 'gl', x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([id, x0, y0, x1, y1]) => {
    const c = document.getElementById(id as string) as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      Math.max(1, Math.round(((x1 as number) - (x0 as number)) * dpr)),
      Math.max(1, Math.round(((y1 as number) - (y0 as number)) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [id, x0, y0, x1, y1] as const)
}

const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())

/** 지면 삼각형 — 지평선 + 깊이선 둘 + 잇는 획 */
async function groundTriangle(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  const s = await summary(page)
  expect(s.lifted).toBe(3)
  expect(s.waiting).toEqual([])
}

test('면 — 탭하면 칠해지고 다시 탭하면 사라진다 (픽셀)', async ({ page }) => {
  await groundTriangle(page)

  // 삼각형 **안쪽**의 작은 창 — 선이 안 지나가는 자리라 칠만 세어진다
  const win = [470, 515, 530, 545] as const
  expect(await countPixels(page, 'gl', ...win)).toBe(0)

  await page.click('#btn-face')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('face')

  // ③ 미리보기 — 탭하기 전에 2D 오버레이가 그 영역을 두른다
  await page.mouse.move(500, 530)
  await settle(page)
  const prevInk = await countPixels(page, 'ink', ...win)
  expect(prevInk).toBeGreaterThan(0)

  // ① 탭 → 칠해진다
  await tap(page, 500, 530)
  let s = await summary(page)
  expect(s.docFaces).toBe(1)
  expect(s.faces[0].n).toBe(3)
  expect(s.faces[0].tris).toBe(1)
  expect(s.faces[0].flat).toBe(0)          // 지면이라 정확히 한 평면이다
  // 커서를 치워 미리보기를 끄고 3D 칠만 센다
  await page.mouse.move(50, 750)
  await settle(page)
  const filled = await countPixels(page, 'gl', ...win)
  expect(filled).toBeGreaterThan(1000)

  // ② 다시 탭 → 사라진다
  await tap(page, 500, 530)
  await page.mouse.move(50, 750)
  await settle(page)
  s = await summary(page)
  expect(s.docFaces).toBe(0)
  expect(await countPixels(page, 'gl', ...win)).toBe(0)
})

test('면 — 선을 안 가린다. 경계를 지우면 칠이 사라지고 실행취소로 돌아온다 (픽셀)', async ({ page }) => {
  await groundTriangle(page)

  // 잇는 획 위의 작은 창 — **선 픽셀**을 센다
  const onLine = [480, 490, 520, 500] as const
  const before = await countPixels(page, 'gl', ...onLine)
  expect(before).toBeGreaterThan(10)

  await page.click('#btn-face')
  await tap(page, 500, 530)
  await page.mouse.move(50, 750)
  await settle(page)
  expect(await summary(page).then(s => s.docFaces)).toBe(1)

  // ⑤ 면이 선을 안 가린다 — 선 자리 픽셀이 줄지 않았다
  expect(await countPixels(page, 'gl', ...onLine)).toBeGreaterThanOrEqual(before)

  // ④ 경계 획을 지운다 → 칠이 사라진다
  const win = [470, 515, 530, 545] as const
  expect(await countPixels(page, 'gl', ...win)).toBeGreaterThan(1000)
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(500, 495)
  await page.mouse.down()
  await page.mouse.move(505, 495)
  await page.mouse.up()
  await settle(page)
  let s = await summary(page)
  expect(s.faces).toHaveLength(0)         // 안 그려진다
  expect(s.docFaces).toBe(1)              // **문서에는 남아 있다**(불변식 j)
  expect(await countPixels(page, 'gl', ...win)).toBe(0)

  // 실행취소 → 획이 돌아오고 면도 돌아온다
  await page.click('#btn-undo')
  await settle(page)
  s = await summary(page)
  expect(s.faces).toHaveLength(1)
  expect(await countPixels(page, 'gl', ...win)).toBeGreaterThan(1000)
})

test('면 — 루프가 아닌 자리를 탭하면 알림 한 줄이 뜬다', async ({ page }) => {
  await groundTriangle(page)
  await page.click('#btn-face')
  await tap(page, 150, 720)               // 아무 루프도 안 두른 자리
  expect(await page.textContent('#notice')).toContain('닫힌 루프가 아니다')
  expect(await summary(page).then(s => s.docFaces)).toBe(0)
})

// 가림 — 세로 기둥이 지면선을 **화면에서만** 가로지르는 장면. 초판은 여기서 배치가
// 망가져 벽도 바닥도 면이 안 됐다(순환 하나·면적 0). 지금은 평면마다 훑는다.
test('면 — 벽(수직면)과 바닥(수평면)이 각각 칠해진다 (픽셀)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 330, 1100, 330)
  await drawLine(page, 470, 560, 780, 500)
  await drawLine(page, 470, 560, 160, 500)
  await drawLine(page, 780, 500, 300, 470)
  await drawLine(page, 160, 500, 640, 470)
  await drawLine(page, 470, 560, 470, 400)
  await drawLine(page, 470, 400, 780, 355)
  await drawLine(page, 780, 500, 780, 355)
  expect(await summary(page).then(s => s.waiting)).toEqual([])

  const wallWin = [600, 410, 660, 440] as const     // 벽 안, 선이 안 지나간다
  const floorWin = [330, 495, 380, 515] as const    // 바닥 안, 벽에 안 가린다
  expect(await countPixels(page, 'gl', ...wallWin)).toBe(0)
  expect(await countPixels(page, 'gl', ...floorWin)).toBe(0)

  await page.click('#btn-face')
  await tap(page, 620, 425)
  await tap(page, 350, 505)
  await page.mouse.move(60, 760)
  await settle(page)

  const s = await summary(page)
  expect(s.docFaces).toBe(2)
  expect(s.faces.map((f: any) => f.n)).toEqual([4, 4])
  expect(await countPixels(page, 'gl', ...wallWin)).toBeGreaterThan(1000)
  expect(await countPixels(page, 'gl', ...floorWin)).toBeGreaterThan(500)

  // 돌려보면 **면이 3D에 있다** — 화면 다각형이 옮겨가고 **칠이 그것을 따라간다.**
  // ⚠ 「칠이 줄어든다」로 적었다가 틀렸다(실측 238079 → 276888) — 아래로 기울이면
  //   바닥이 커진다. 재는 것은 «면이 화면에 붙어 있지 않은가»이지 넓이가 아니다.
  const polys = (p: Page) => p.evaluate(() => (window as any).__b2.diag.facePolys())
  const mid = (poly: any[]) => ({
    x: poly.reduce((a, q) => a + q.x, 0) / poly.length,
    y: poly.reduce((a, q) => a + q.y, 0) / poly.length,
  })
  const wallBefore = mid((await polys(page))[0].poly)
  await page.mouse.move(600, 430)
  await page.mouse.down({ button: 'middle' })
  // ⚠ 위아래 몫은 임계 안에 둔다(이 픽스처는 f = 0.32W라 3.08° = 10.7px) — web2-08
  //   지시 3 뒤로 임계 밖 자세는 «머무는 자세»가 되어 면 미리보기가 뜨는 것이 맞는
  //   자리가 된다. 여기서 재는 것은 «접힐 자세(임계 안)에서는 미리보기가 없다»이므로
  //   그 대역 안에서 돌린다.
  for (let i = 0; i < 12; i++) await page.mouse.move(600 - i * 8, 430 - Math.round(i * 0.7))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const wallAfter = mid((await polys(page))[0].poly)
  expect(Math.hypot(wallAfter.x - wallBefore.x, wallAfter.y - wallBefore.y)).toBeGreaterThan(20)
  // 옮겨간 자리가 칠해져 있고, 떠난 자리와 겹치지 않는다
  const box = (c: { x: number; y: number }) => [c.x - 8, c.y - 8, c.x + 8, c.y + 8] as const
  expect(await countPixels(page, 'gl', ...box(wallAfter))).toBeGreaterThan(100)
  // 궤도 뒤에 **면 미리보기가 안 남는다** — 옛 포즈의 다각형이 제자리에 남던 자리.
  // ⚠ 픽셀로는 못 가른다: 같은 2D 캔버스에 흑연 입자가 함께 그려져 그 창이 안 빈다
  //   (그렇게 재려다 실패했다). 미리보기 자체를 본다 — 그것이 그려지는 유일한 조건이다.
  //   미리보기 → 픽셀의 연결은 위 첫 팔의 ③이 이미 쟀다.
  expect(await page.evaluate(() => (window as any).__b2.diag.facePreview())).toBeNull()
  // 접힐 자세(임계 안 기울기)면 커서를 올려도 안 뜬다 — 그때 누름은 접기이지 면이 아니다
  await page.mouse.move(620, 425)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.diag.facePreview())).toBeNull()
})
