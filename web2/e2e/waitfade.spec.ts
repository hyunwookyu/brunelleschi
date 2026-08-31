// web2-13 3-a·3-b — 대기 획 시점 감쇠 · 「잘못 찍힌 점」 문 (픽셀·문서로 잰다, dpr 둘)
//
// 반증(D-3) — 이 파일이 스스로 실행한다:
//   3-a: 설정 «대기 획은 그린 시점에서만»을 **실제로 꺼서**(옛 동작) 궤도 후에도
//        잉크가 남는 것을 확인한다 — 감쇠 팔의 판별력이 그 대비다.
//   3-b: 문 바로 위 길이(8px)의 획이 **정상으로 만들어지는** 것을 확인한다 —
//        경계 아래(4px)는 획 0 + 카운터 +1.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FREEZE } from './thresholds'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
}

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
    // ⚠ **지금 «보이는» 흑연 겹**을 읽는다(web2-18 3부). 제스처(궤도·팬) 동안에는
    //    `#brushc`가 아니라 `#brushsnap`이 흑연을 든다 — `#brushc`는 그때 구운 타일의
    //    아틀라스를 들고 숨는다(3-c ㉢). 캔버스 이름을 못 박은 종전 판은 제스처 중에
    //    0을 읽어 「사라졌다」로 오독했다(#67의 형태 — 겹을 바꾸면 판독 자리도 바뀐다).
    //    사람이 보는 것은 **보이는 겹**이므로 그것을 읽는다.
    const snapEl = document.getElementById('brushsnap') as HTMLCanvasElement | null
    const snapOn = !!snapEl && getComputedStyle(snapEl).display !== 'none'
    const src = (snapOn ? snapEl! : document.getElementById('brushc')) as HTMLCanvasElement
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

test('3-a → **37-4로 바뀌었다**: 대기 획은 궤도에서 «옅어지는» 것이 아니라 **버려진다**', async ({ page }) => {
  // ⚠⚠ **규칙이 대체됐다**(web2-37 4번 · 사용자 문면): 「시점을 돌렸을 때 대기선은 아예
  //    사라지는 게 맞다. 비슷한 구도라도 자꾸 다시 생기니 불편하다.」
  //    web2-14/16의 감쇠(자기 시점에서만 보인다 · 돌아오면 다시 보인다)가 **바로 그
  //    「자꾸 다시 생긴다」**였다. 그러므로 옛 문면을 지우지 않고 **뒤집힌 자리에 그대로
  //    둔다**(#57 — 지우면 그 자리가 조용해진다): 창 밖에서 0인 것은 같고, **돌아와도 0**인
  //    것이 달라진 점이다.
  await setup(page)
  await drawLine(page, 240, 590, 240, 690)           // 미연결 세로 획 — 대기
  const waiting = await page.evaluate(() => (window as any).__b2.app.lift.waiting.length)
  expect(waiting, '대기가 실제로 있다(#38 — 대상 0 방지)').toBeGreaterThan(0)
  const strokes0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const atDraw = await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(atDraw.count, '잉크 겹 벡터 점선이 없다(web2-16 3-a는 그대로다)').toBe(0)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1),
    '흑연 파선 몸체가 «보이는» 흑연 겹에 있다').toBeGreaterThan(0)

  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(900, 470, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect(await poseDeg(page)).toBeGreaterThan(35)

  expect((await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)).count).toBe(0)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)).toBe(0)
  // **문서에서도 갔다** — 옛 규칙과 갈리는 자리가 여기다(옛 판은 대기가 남아 있었다)
  const after = await page.evaluate(() => ({
    waiting: (window as any).__b2.app.lift.waiting.length,
    strokes: (window as any).__b2.app.doc.strokes.length,
  }))
  expect(after.waiting, '대기가 문서에서 갔다').toBe(0)
  expect(after.strokes).toBe(strokes0 - waiting)

  // 돌아와도 **안 돌아온다** — 그것이 사용자가 요구한 것이다
  await page.click('#btn-draw-view')
  await settle(page)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1), '돌아와도 0').toBe(0)

  // ⚠ 감쇠 설정을 꺼도(옛 동작) **안 돌아온다** — 획 자체가 없기 때문이다.
  //    옛 반증(설정을 끄면 잉크가 남는다)이 여기서 뒤집힌 것을 그대로 적어 둔다.
  await page.evaluate(() => (document.getElementById('chk-waitfade') as HTMLInputElement).click())
  await settle(page)
  expect((await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)).count,
    '감쇠를 꺼도 안 돌아온다 — 감쇠의 문제가 아니라 획이 버려졌기 때문이다').toBe(0)
})

test('3-b → **37-4로 바뀌었다**: 창(WAIT_FADE_DEG)은 이제 대기 획에 안 걸린다 · 실행취소로 되살아난다', async ({ page }) => {
  // 옛 문면은 「창 안 어디서든 같은 파선 · 나가면 0 · 돌아오면 다시 보인다」였다.
  // 37-4는 **창을 안 본다** — 광선이 바뀌면 그 순간 버린다. 창 «안»의 작은 궤도에서도 간다.
  // 대신 **실행취소로 되살아난다**(지시 문면) — 그것이 이 팔의 둘째 절반이다.
  await setup(page)
  await drawLine(page, 240, 590, 240, 690)
  const at0 = await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(at0).toBeGreaterThan(0)
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(700, 425, { steps: 6 })      // **창 안**의 작은 궤도
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const deg1 = await poseDeg(page)
  expect(deg1).toBeGreaterThan(3)
  expect(deg1, '창 안이다 — 옛 규칙이면 여기서 파선이 그대로 남는다').toBeLessThan(30)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1),
    '창 안이어도 간다 — 기준은 각도가 아니라 «광선이 바뀌었는가»다').toBe(0)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.waiting.length)).toBe(0)

  // 실행취소로 되살아난다 — ⚠ **그 궤도까지** 무른다(그래서 작도 시점 버튼이 필요 없다).
  // 획만 되돌리는 판에서는 이 다음 시점 변경에서 도로 사라졌다(실측 — `Op.pose` 주석).
  await page.keyboard.press('Control+z')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.waiting.length),
    '실행취소로 대기 획이 문서에 돌아온다').toBeGreaterThan(0)
  expect(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1),
    '화면에도 돌아온다').toBeGreaterThan(0)
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
  await openDiag(page)
  await expect(page.locator('#diagpanel')).toBeVisible()
  await expect(page.locator('#diagpanel')).toContainText('버린 짧은 획')
  await expect(page.locator('#diagpanel')).toContainText('1 (문 6px)')
  await openDiag(page)

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
  expect(await page.locator('#pane-file #btn-brush').count()).toBe(1)   // web2-19 3-a: 서랍
  // 서랍을 열고 누르면 종전 배선 그대로 renderer가 바뀐다(A-4 — 경로 생존)
  await page.click('#pane-file summary')
  await expect(page.locator('#btn-brush')).toBeVisible()
  const r0 = await page.evaluate(() => (window as any).__b2.app.renderer)
  await page.click('#btn-brush')
  const r1 = await page.evaluate(() => (window as any).__b2.app.renderer)
  expect(r1).not.toBe(r0)
  await page.click('#btn-brush')
  expect(await page.evaluate(() => (window as any).__b2.app.renderer)).toBe(r0)
})

const freezeLedger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  if (!('samples' in freezeLedger)) return
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const HERE = dirname(fileURLToPath(import.meta.url))
  const out = resolve(HERE, `../../stage0/out/wait_freeze_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-14 3번(web2-16 3부 재배선 — 몸체가 brushc 흑연 파선이 된 뒤의 실행) — 감쇠 동결(${testInfo.project.name}): 실제 중버튼 드래그 왕복 중 대기 획 상자 표본과 변화 횟수. e2e waitfade.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용(#47).`,
    def: '변화 = 이웃 표본 차 > 기준 × FREEZE.DEADBAND. 왕복 복귀는 정확 재추적이 아니라 +6px 어긋난 경로(#68 — 이상적 손 금지). 분모 = 기준값(brush 칠 픽셀 수 — 판정 겹이다. ⚠ web2-16 3부: 잉크 겹은 이 경로에서 **구조적으로 0**이다(몸체가 brushc 파선으로 이사 — ink 표본 전부 0·changes 0은 무정보가 아니라 «벡터 점선이 안 돌아온다»의 감시 채널로 남긴다. base_ink_alpha 0이 그 구조의 표시다). brushc는 창(WAIT_FADE_DEG) 안 이진으로 파선을 그린다 — base_brush_px는 3-a 전(통짜 218 대역)과 후(파선)가 갈리는 값이다(#70 ②의 버전 판별값), 3차 [F]. 표본 12개 동일값은 이 팔의 통과 조건 그 자체다(동결 = 무변화 — 한 값 분포가 정보다, 3차 [D]). ⚠ 수리 전(beginNavHold 제거) 실행의 changes 수치는 원장에 못 실었다(그 판은 fadePose 단언에서 먼저 죽는다) — 그 실행의 실패 사실만 남는다(3차 [E] — DEFERRED).',
    thresholds: FREEZE,
    falsification: 'beginNavHold 배선 제거 실행에서 이 팔이 실패했다(드래그 중 fadePose null + 표본 감쇠 — 수리 커밋 전 실행 기록은 NOTES 3번 절). 단위 navhold.test의 «동결 없이 >5회»는 판정 함수 재구성이고, 앱 경로 실측은 이 falsification 실행이다.',
    ...freezeLedger,
  }, null, 1))
})

test('web2-14 3번 → **37-4로 바뀌었다**: 왕복 궤도에서 표시가 «한 번도 안 돌아온다» · op는 하나', async ({ page }) => {
  // 옛 문면: 「드래그 중 감쇠 판정을 동결해 표시 변화 0회」. 그 수리는 실기기 판정
  // 「돌리면 서서히 사라지고 **돌아오면 다시 생겨** 성가시다」의 앞 절반이었다.
  // 37-4가 뒷 절반을 없앤다 — **다시 생기지 않는다**(획이 버려졌다).
  // 그래서 이 팔이 재는 것이 바뀐다: 변화 0회는 그대로인데 그 값이 «동결된 파선»이 아니라
  // **0**이고, 왕복해 돌아와도 0이다. 그리고 드래그 12표본이 **op를 하나만** 쌓는다
  // (프레임마다 쌓으면 실행취소가 궤도 픽셀 수만큼 필요해진다).
  await setup(page)
  await drawLine(page, 240, 590, 240, 690)           // 대기 획(3-a와 같은 자리)
  const atDraw = await inkStat(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(atDraw.count, '잉크 겹 벡터 점선 없음(web2-16 3-a는 그대로다)').toBe(0)
  const atDrawBrush = await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  expect(atDrawBrush, 'brush 겹 판별력 — 파선 몸체가 실제로 있다').toBeGreaterThan(0)
  const undo0 = await page.evaluate(() => (window as any).__b2.app.undoStack.length)

  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  const brushSamples: number[] = []
  for (let i = 1; i <= 6; i++) {                     // 왕복 — 가고
    await page.mouse.move(600 + i * 40, 400); await settle(page)
    brushSamples.push(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1))
  }
  const farDeg = await poseDeg(page)
  expect(farDeg, '왕복의 판별력 — 창 밖까지 갔다').toBeGreaterThan(30)
  expect(await page.evaluate(() => (window as any).__b2.app.fadePose !== null),
    '드래그 중 — 판정 동결 배선은 그대로다(승격 획의 질감이 그것을 쓴다)').toBe(true)
  for (let i = 5; i >= 0; i--) {                     // 오고 — 정확 재추적이 아니다(#68)
    await page.mouse.move(600 + i * 40, 406); await settle(page)
    brushSamples.push(await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1))
  }
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const after = await brushPix(page, BOX.x0, BOX.y0, BOX.x1, BOX.y1)
  const undo1 = await page.evaluate(() => (window as any).__b2.app.undoStack.length)
  console.log(`[측정] 37-4 왕복 — 12표본 ${JSON.stringify(brushSamples)} · 뗀 뒤 ${after} `
    + `· 최원점 ${farDeg.toFixed(1)}° · op ${undo1 - undo0}개`)
  freezeLedger['samples'] = {
    brush_px: brushSamples, base_brush_px: atDrawBrush, after_release: after,
    far_deg: farDeg, ops_pushed: undo1 - undo0,
    note: 'web2-37 4번으로 규칙이 바뀌었다 — 값이 «동결된 파선»이 아니라 0이고, 돌아와도 0이다.',
  }
  expect(brushSamples.every(v => v === 0), '드래그 내내 0 — 한 번도 안 돌아온다').toBe(true)
  expect(after, '뗀 뒤에도 0').toBe(0)
  expect(undo1 - undo0, '12표본이 op를 하나만 쌓는다').toBe(1)
  expect(await page.evaluate(() => (window as any).__b2.app.fadePose === null),
    '뗀 뒤 — 동결이 풀렸다').toBe(true)
})
