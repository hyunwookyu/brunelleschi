// web2-13 3-a·3-b — 대기 획 시점 감쇠 · 「잘못 찍힌 점」 문 (픽셀·문서로 잰다, dpr 둘)
//
// 반증(D-3) — 이 파일이 스스로 실행한다:
//   3-a: 설정 «대기 획은 그린 시점에서만»을 **실제로 꺼서**(옛 동작) 궤도 후에도
//        잉크가 남는 것을 확인한다 — 감쇠 팔의 판별력이 그 대비다.
//   3-b: 문 바로 위 길이(8px)의 획이 **정상으로 만들어지는** 것을 확인한다 —
//        경계 아래(4px)는 획 0 + 카운터 +1.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 영역의 그려진 픽셀 수와 알파 합 — 2D 오버레이(ink). level.spec의 inkPixels에
 *  알파 합을 더한 것: 흐림(0.3)은 «칠해진 픽셀 수»를 안 바꾸고 진하기만 낮추므로
 *  옅어짐의 판별은 count가 아니라 alphaSum이 진다(첫 실행이 count 동수로 그것을 보였다). */
function inkStat(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0, a = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) { n++; a += d[i]! }
    return { count: n, alphaSum: a }
  }, [x0, y0, x1, y1])
}

/** #brushc(WebGL2 · preserveDrawingBuffer) 상자의 칠해진 픽셀 — brush.spec의 brushBox 판.
 *  대기 획은 겹 **둘**에 그려진다(#ink 점선 + brush 렌더러의 #brushc 질감 몸체) —
 *  #67: 한 겹 판독만으로는 «사람이 보는 화면에서 사라졌다»를 말할 수 없다(3차 리뷰어 [26]). */
function brushPix(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((x1! - x0!) * dpr))
    t.height = Math.max(1, Math.round((y1! - y0!) * dpr))
    const c = t.getContext('2d')!
    c.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = c.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

/** 합성 화면(스크린샷 — 사람이 보는 것) 상자 — materials.spec의 shot 판 */
async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return [...g.getImageData(0, 0, c.width, c.height).data]
  }, buf.toString('base64'))
}
/** 채널 차 8 초과 픽셀 수 — materials.spec의 diffCount 판(AA는 걸리고 압축 요동은 안 걸린다) */
function diffCount(base: number[], now: number[]): number {
  let n = 0
  for (let i = 0; i < base.length; i += 4) {
    if (Math.abs(base[i]! - now[i]!) > 8 || Math.abs(base[i + 1]! - now[i + 1]!) > 8 ||
        Math.abs(base[i + 2]! - now[i + 2]!) > 8) n++
  }
  return n
}

/** 지금 포즈가 작도 포즈에서 몇 도 돌아갔나 — 앱의 사원수로 그 자리에서 계산 */
const poseDeg = (page: Page) => page.evaluate(() => {
  const q = (window as any).__b2.app.pose.q
  return (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI
})

/** 카메라(1점) + 오른쪽에 기둥 하나 — 왼쪽 아래는 비워 둔다(측정 상자 자리) */
async function setup(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await drawLine(page, 800, 500, 900, 475)           // 깊이선 → vp0
  await drawLine(page, 800, 500, 800, 350)           // 기둥(앵커)
  // 지평선 «표시»는 끈다 — 궤도 후 지평선이 측정 상자를 가로지르면 잉크가 섞인다.
  // (카메라·판정은 그대로다 — 표시 토글은 표현 계층. web2-12 7번)
  await page.evaluate(() => {
    const b = document.getElementById('chk-horizon') as HTMLInputElement
    if (b.checked) b.click()
  })
  await settle(page)
}

const BOX = { x0: 225, y0: 575, x1: 255, y1: 705 } as const

test('3-a — 대기 획은 자기 시점에서만: 작도 포즈 잉크 > 0 → 궤도(>창) 후 0 → 되돌리면 다시 보인다(반증)', async ({ page }) => {
  await setup(page)
  // 허공의 **미연결 세로 획** — 대기로 남는다(게이지는 한 번뿐 — 두 번째 화면 평행
  // 미연결 획은 대기다, NOTES 「첫 앵커」). ⚠ 자유 대각선은 안 된다 — 지평선과 만나
  // 두 번째 소실점을 만들어 버린다(첫 실행이 그랬다 — vpx −75·f²>0로 승격 발화).
  await drawLine(page, 240, 590, 240, 690)
  const waiting = await page.evaluate(() => (window as any).__b2.app.lift.waiting.length)
  expect(waiting).toBeGreaterThan(0)                 // 대기가 실제로 있다(#38 — 대상 0 방지)
  const atDraw = await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(atDraw.count).toBeGreaterThan(0)            // 자기 시점 — 원래 진하기로 보인다

  // 궤도 — 감쇠 창(WAIT_FADE_DEG=30°)을 확실히 넘긴다. 회전량은 앱의 사원수로 확인.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(900, 470, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect(await poseDeg(page)).toBeGreaterThan(35)    // 창 밖이다

  const afterOrbit = await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(afterOrbit.count).toBe(0)                   // «자기 시점에서만 보인다» — 0 도달
  // 겹 ② — brush 질감 몸체도 비어 있다(#67 · [26]: 대기 획을 그리는 겹은 둘 다 재야 한다)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)).toBe(0)
  // 합성 기준 — 사람이 보는 화면(스크린샷)의 이 상자. 아래 되돌림과의 diff가
  // «합성 채널이 이 획을 실제로 본다»의 증인이다(겹별 0 + 합성 감도 = 합성에서 사라짐).
  const fadedShot = await shot(page, BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0)

  // ── 반증(D-3): 설정을 꺼서(옛 동작) 같은 자리에서 잉크가 «남는» 것을 본다 ──
  await page.evaluate(() => (document.getElementById('chk-waitfade') as HTMLInputElement).click())
  await settle(page)
  const oldBehavior = await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(oldBehavior.count).toBeGreaterThan(0)       // 옛 동작 — 흐림 0.3으로 눌어붙는다
  expect(oldBehavior.alphaSum).toBeLessThan(atDraw.alphaSum * 0.6) // 옅다 — 개수는 같고 알파가 준다(0.3 대역)
  // 합성 감도 증인 — 되돌리자 합성 화면이 그 상자에서 실제로 달라진다(스크린샷 diff > 0).
  const unfadedShot = await shot(page, BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0)
  const d = diffCount(fadedShot, unfadedShot)
  console.log(`[측정] waitfade 합성 diff(감쇠 ↔ 옛 동작) ${d}px`)
  expect(d).toBeGreaterThan(0)
})

test('3-a — 승격된 획은 영향이 없다: 궤도를 돌려도 3D가 제자리를 댄다(#gl 몫 — 문서로 확인)', async ({ page }) => {
  await setup(page)
  // 기둥은 리프팅돼 있다 — 감쇠는 waiting만 만진다. 궤도 후에도 lifted가 그대로인 것을
  // 문서로 확인한다(픽셀은 #gl 몫이라 이 spec 밖 — materials.spec가 합성을 잰다).
  const before = await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)
  expect(before).toBeGreaterThan(0)
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(850, 460, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)).toBe(before)
})

test('3-b — 잘못 찍힌 점: 문 아래(4px)는 안 만들고 세고, 문 위(8px)는 정상으로 만든다(반증)', async ({ page }) => {
  await setup(page)
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

  await drawLine(page, 400, 650, 404, 650)           // 4px — 탭(2px) 위 · 문(6px) 아래
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const c1 = await page.evaluate(() => (window as any).__b2.app.strayCount)
  expect(n1).toBe(n0)                                // 획이 «애초에» 안 생겼다
  expect(c1).toBe(1)                                 // 조용히 버리지 않는다 — 수가 말한다
  // 그 수가 **사람 눈에 닿는 자리**(진단 패널)에 실제로 보인다([36] — 상태값만 재면
  // 패널 배선이 끊겨도 팔이 초록이라 «조용히 버리는» 상태로 돌아간다)
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toBeVisible()
  await expect(page.locator('#diagpanel')).toContainText('버린 짧은 획')
  await expect(page.locator('#diagpanel')).toContainText('1 (문 6px)')
  await page.click('#buildid')

  await drawLine(page, 400, 650, 408, 650)           // 8px — 문 위(경계 6 포함 위쪽)
  const n2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n2).toBe(n0 + 1)                            // 반증 — 문 바로 위는 정상 획이다
  expect(await page.evaluate(() => (window as any).__b2.app.strayCount)).toBe(1)

  // 탭 경로 불변 — 지평선 위 탭은 여전히 소실점 찍기다(3부 불변식: 판정 안 바뀜)
  await page.mouse.move(300, 400)
  await page.mouse.down(); await page.mouse.up()
  await settle(page)
  const vps = await page.evaluate(() => (window as any).__b2.diag.summary().vps.length)
  expect(vps).toBe(2)                                // vp0 + 방금 찍은 것
})

test('3-c — 종이 질감 버튼이 세로바에 없고 설정 안에 있다 · 눌리면 여전히 renderer를 바꾼다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 설정이 닫혀 있으면 안 보인다 — 도구 사이에 서 있지 않다(실수로 못 누른다)
  await expect(page.locator('#btn-brush')).toBeHidden()
  expect(await page.locator('#pane-settings #btn-brush').count()).toBe(1)
  // 설정을 열고 누르면 종전 배선 그대로 renderer가 바뀐다(A-4 — 경로 생존)
  await page.click('#pane-settings summary')
  await expect(page.locator('#btn-brush')).toBeVisible()
  const r0 = await page.evaluate(() => (window as any).__b2.app.renderer)
  await page.click('#btn-brush')
  const r1 = await page.evaluate(() => (window as any).__b2.app.renderer)
  expect(r1).not.toBe(r0)
  await page.click('#btn-brush')
  expect(await page.evaluate(() => (window as any).__b2.app.renderer)).toBe(r0)
})
