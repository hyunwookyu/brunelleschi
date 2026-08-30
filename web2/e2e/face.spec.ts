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

/** 지면 삼각형 — 깊이선 둘 + 잇는 획 (지평선은 상시 H/2=400 — web2-17: 긋지 않는다) */
async function groundTriangle(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  const s = await summary(page)
  expect(s.lifted).toBe(3)
  expect(s.waiting).toEqual([])
}

/** 면 팝오버를 다시 연다(web2-28 1번 — 명령은 실행하면 접힌다) */
async function reopenFacePop(page: Page) {
  if (await page.locator('#face-pop').evaluate(e => (e as HTMLElement).hidden)) {
    await page.click('#btn-face')
    await settle(page)
  }
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
  // web2-17: 지평선(330)은 상시 400으로 — 옛 장면을 +70 평행이동(1-a: 카메라·3D 불변)
  await drawLine(page, 470, 630, 780, 570)
  await drawLine(page, 470, 630, 160, 570)
  await drawLine(page, 780, 570, 300, 540)
  await drawLine(page, 160, 570, 640, 540)
  await drawLine(page, 470, 630, 470, 470)
  await drawLine(page, 470, 470, 780, 425)
  await drawLine(page, 780, 570, 780, 425)
  expect(await summary(page).then(s => s.waiting)).toEqual([])

  const wallWin = [600, 480, 660, 510] as const     // 벽 안, 선이 안 지나간다
  const floorWin = [330, 565, 380, 585] as const    // 바닥 안, 벽에 안 가린다
  expect(await countPixels(page, 'gl', ...wallWin)).toBe(0)
  expect(await countPixels(page, 'gl', ...floorWin)).toBe(0)

  await page.click('#btn-face')
  await tap(page, 620, 495)
  await tap(page, 350, 575)
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

test('면 일괄(web2-21 4부) — 팝오버 「전부 찾기」 · 후보는 테두리만(채움 0) · 탭해 빼기 · 확정은 채움 · 실행취소 한 번 (픽셀)', async ({ page }) => {
  // 지면 삼각형 + 가르는 선 = 두 칸 — 후보 둘이 뜨는 최소 장면
  await groundTriangle(page)
  await drawLine(page, 500, 560, 500, 495)
  await page.click('#btn-face')                       // 면 도구
  await page.click('#btn-face')                       // 다시 — 팝오버(4-e: 손 띠 버튼 안 늘림)
  await expect(page.locator('#face-pop')).toBeVisible()
  await page.click('#btn-face-all'); await settle(page)
  // ⚠ **web2-28 1번이 「전부 찾기」를 명령으로 표시했다** — 누르면 팝오버가 접힌다
  //   (지시의 표가 「면 찾기」를 명령 쪽에 든다). 후보를 빼는 몸짓은 **캔버스 탭**이므로
  //   그때 팝오버가 덮고 있지 않은 편이 옳다. 이어서 「확정」을 누르려면 다시 연다.
  await reopenFacePop(page)
  const st1 = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.faceCandidates?.length ?? null, faces: a.doc.faces.length }
  })
  expect(st1.n).toBe(2)                               // 후보 둘
  expect(st1.faces).toBe(0)                           // 아직 면이 아니다 — 물어보는 중
  // ⑤ **테두리만** — 두 칸의 안쪽 견본 상자에 채움 픽셀이 없다(확정 면의 채움은 #ink에
  // 그려지므로 같은 캔버스의 같은 자리를 확정 후와 나란히 잰다 — 대조가 곧 분해능 확인).
  // 견본 상자는 경계·파선 테두리를 피해 칸 «안쪽»에 둔다 — 첫 판의 (385..405,520..532)는
  // 빗변 테두리가 상자 귀퉁이를 지나 10px이 잡혔다(왼 칸 (445..465,510..522)로 이동).
  // 두 캔버스 다 잰다(3·4부 리뷰 [6] — 후보가 그려지는 겹은 #ink이므로 «후보 채움 회귀»는
  // #ink에서만 잡힌다. 견본 상자는 칸 안쪽이라 테두리 파선은 안 걸린다 — 반증(D-3):
  // 후보 폴리곤에 fill을 강제하면 ink 상자가 0을 벗어나 이 팔이 실패한다, NOTES 실행 기록).
  const leftBefore = await countPixels(page, 'gl', 445, 510, 465, 522)
  const rightBefore = await countPixels(page, 'gl', 535, 510, 555, 522)
  const leftBeforeInk = await countPixels(page, 'ink', 445, 510, 465, 522)
  const rightBeforeInk = await countPixels(page, 'ink', 535, 510, 555, 522)
  expect(leftBefore).toBe(0)                          // 채움(#gl) 없음
  expect(rightBefore).toBe(0)
  expect(leftBeforeInk).toBe(0)                       // 후보 겹(#ink)에도 채움 없음 — 테두리뿐
  expect(rightBeforeInk).toBe(0)
  // ③ 하나를 탭해 빼면 그것만 빠진다 — 왼 칸을 뺀다
  await tap(page, 455, 515)
  expect(await page.evaluate(() => (window as any).__b2.app.faceCandidates.length)).toBe(1)
  // ⚠⚠ **web2-34 4번(화면 규칙 R7)** — 캔버스 탭은 이 팝오버의 «바깥»이므로 빼는 몸짓에
  //   팝오버가 접힌다. 위 주석이 이미 판정한 그대로다(「후보를 빼는 몸짓은 캔버스 탭이므로
  //   그때 팝오버가 덮고 있지 않은 편이 옳다」) — 28-1은 그것을 「전부 찾기」에서만 했고
  //   R7이 **모든 캔버스 탭에** 걸어 준다. 확정을 누르려면 다시 연다(그 길이 `reopenFacePop`).
  expect(await page.locator('#face-pop').evaluate(e => (e as HTMLElement).hidden),
    'R7 — 캔버스 탭에 팝오버가 접힌다').toBe(true)
  await reopenFacePop(page)
  // 확정 — 남은 오른 칸만 면이 된다(팝오버가 후보 수를 따라온다)
  await page.click('#btn-face-commit'); await settle(page)
  const st2 = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { cand: a.faceCandidates, faces: a.doc.faces.length, undo: a.undoStack.length }
  })
  expect(st2.cand).toBeNull()
  expect(st2.faces).toBe(1)
  // 채움은 #gl(three.js 면 메시)이고 후보 테두리는 #ink다 — 채움 판독은 gl에서
  const rightAfter = await countPixels(page, 'gl', 535, 510, 555, 522)
  const leftAfter = await countPixels(page, 'gl', 445, 510, 465, 522)
  expect(rightAfter).toBeGreaterThan(0)               // 확정된 면만 채워진다(형태가 가른다)
  expect(leftAfter).toBe(0)                           // 뺀 칸은 안 채워졌다
  // ④ 실행취소 **한 번**에 전부 돌아온다
  await page.keyboard.press('Control+z'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.faces.length)).toBe(0)
  expect(await countPixels(page, 'gl', 535, 510, 555, 522)).toBe(0)
  // 착수 표 #69 ㉠ — 확정 면이 이미 있는 장면에서 후보 표시가 기존 표시를 **안 가린다**
  // (나란히): 다시실행으로 오른 칸 면을 되살리고 「전부 찾기」 — 남는 후보(왼 칸)가 뜬
  // 동안에도 확정 면의 채움이 그대로다.
  await page.keyboard.press('Control+y'); await settle(page)
  const fillBack = await countPixels(page, 'gl', 535, 510, 555, 522)
  expect(fillBack).toBeGreaterThan(0)
  await page.click('#btn-face')                       // 팝오버 다시(도구는 이미 면)
  await page.click('#btn-face-all'); await settle(page)
  // ⚠ **web2-28 1번이 「전부 찾기」를 명령으로 표시했다** — 누르면 팝오버가 접힌다
  //   (지시의 표가 「면 찾기」를 명령 쪽에 든다). 후보를 빼는 몸짓은 **캔버스 탭**이므로
  //   그때 팝오버가 덮고 있지 않은 편이 옳다. 이어서 「확정」을 누르려면 다시 연다.
  await reopenFacePop(page)
  expect(await page.evaluate(() => (window as any).__b2.app.faceCandidates.length)).toBe(1)  // 기존 면 제외
  expect(await countPixels(page, 'gl', 535, 510, 555, 522)).toBe(fillBack)   // 안 가려졌다
  await page.click('#btn-face-cancel'); await settle(page)
})
