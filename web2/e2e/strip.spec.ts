// web2-25 3부의 화면 몫 — **셔터 · 썸네일 스트립 · 시점 갱신**.
//
// 사람의 문면: 「종이의 저장 역시 크롬의 탭 추가 버튼처럼 되어 있는데, **좀더 직관적인
// 방식**으로 바꿀 필요가 있어 보인다.」 · (썸네일 스트립은) 「**항상 표시하는 걸로 가자.**」
//
//   ① 셔터로 종이가 생기고 **썸네일이 그 장면이다**
//   ② 스트립이 **늘 보인다**(접히지 않는다) · 종이마다 썸네일 칸이 하나
//   ③ 길게 눌러 갱신하면 **포즈·썸네일이 바뀐다**
//   ④ **겹이 있으면 갱신이 막히고 안내가 뜬다**
//   ⑤ 셔터의 번쩍임이 **짧고 무채색**이다
//
// 상태(포즈·뷰·실행취소)는 단위 팔(`test/sheetupdate.test.ts`)이 값으로 재고 여기서
// 겹쳐 재지 않는다 — 여기서 재는 것은 **화면에서 그렇게 되는가**다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  expect(s.lifted).toBe(3)
}

async function orbit(page: Page) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
}

const sheets = (page: Page) => page.evaluate(() =>
  (window as any).__b2.app.doc.sheets.map((s: any) =>
    ({ id: s.id, name: s.name, thumb: (s.thumb ?? '').slice(0, 15), pose: s.pose ?? null })))

/** 길게 누르기 — 종이 탭의 팝업을 연다(C.PAPER_LONGPRESS_MS 500 위로) */
async function longPress(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await settle(page)
}

test('① 셔터로 종이가 생기고 썸네일이 그 장면이다 · ② 스트립이 늘 보인다', async ({ page }) => {
  await boot(page)
  // ② 처음부터 띠가 보이고 종이마다 썸네일 칸이 하나다(작도 종이는 아직 빈 종이 칸)
  await expect(page.locator('#paperbar')).toBeVisible()
  expect(await page.locator('#paperbar .ptab[data-sheet] .pthumb').count()).toBe(1)
  const h0 = (await page.locator('#paperbar').boundingBox())!.height
  // 지시 3-b의 대역(45~50px) 안이다 — 28px 띠가 아니고, 목록처럼 두껍지도 않다(AS-C89)
  expect(h0).toBeGreaterThanOrEqual(45)
  expect(h0).toBeLessThanOrEqual(50)

  await orbit(page)
  await page.click('#paper-add')
  await settle(page)
  await page.keyboard.press('Escape')       // 방금 만든 탭의 이름 편집을 닫는다
  await settle(page)

  const sh = await sheets(page)
  expect(sh.length).toBe(2)
  expect(sh[1].name).toBe('종이 2')
  expect(sh[1].thumb).toBe('data:image/jpeg')      // 그 장면이 실제로 구워졌다
  expect(sh[1].pose).not.toBeNull()
  // 썸네일 칸이 둘이고 새 종이 것은 실제 그림이다(빈 칸이 아니다)
  expect(await page.locator('#paperbar .ptab[data-sheet] .pthumb').count()).toBe(2)
  expect(await page.locator(`#paperbar .ptab[data-sheet="${sh[1].id}"] img.pthumb`).count()).toBe(1)
  // ② 띠는 여전히 그 대역이다(접히지 않는다 — 사람이 늘 표시로 정했다)
  const h1 = (await page.locator('#paperbar').boundingBox())!.height
  expect(Math.abs(h1 - h0)).toBeLessThanOrEqual(2)
})

test('⑤ 셔터의 번쩍임이 짧고 무채색이다 — 화면에 실제로 머문 시간을 잰다', async ({ page }) => {
  await boot(page)
  // ⚠ **상수를 상수 대역과 견주지 않는다**(리뷰 [14] — 그것은 설계 보장에 임계를 건 것이다).
  //   재는 것은 **화면에 실제로 머문 시간**이다: 덮개가 뜬 순간부터 DOM에서 사라질 때까지를
  //   페이지 안에서 `performance.now()`로 잰다. 실패 조건이 분명하다 — 상수를 0이나 3000으로
  //   바꾸면 이 팔이 그 자리에서 깨진다.
  const seen = await page.evaluate(async () => {
    const t0 = performance.now()
    const el0 = document.getElementById('shutter-flash')
    if (el0) el0.remove()
    ;(document.getElementById('paper-add') as HTMLElement).click()
    const el = document.getElementById('shutter-flash')
    if (!el) return null
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    const appeared = performance.now()
    await new Promise<void>(res => {
      const tick = () => {
        if (!document.getElementById('shutter-flash')) res()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return { bg, aliveMs: performance.now() - appeared, sincePress: appeared - t0 }
  })
  expect(seen, '누르는 순간 덮개가 있다').not.toBeNull()
  // **순간 피드백 대역**이다 — 눈이 «번쩍였다»로 읽을 만큼은 길고, «가려졌다»로 읽힐 만큼
  // 길지는 않다.
  // ⚠⚠ **아래 문(48ms)은 «세 프레임»이고 그 수를 반증이 정했다**(#71 ㉢ — 임계가 지표의
  //   분해능 아래면 아무것도 안 잰다): 초판은 16ms(한 프레임)였는데 **상수를 0으로 바꿔도
  //   관측이 18.4ms**라 통과했다 — rAF 폴링의 해상도가 한 프레임이라 0과 16을 못 가른다.
  //   세 프레임으로 올리니 0에서 실제로 깨진다(NOTES 3-a 반증 절이 두 실행을 다 적는다).
  expect(seen!.aliveMs, `화면에 머문 시간 ${seen!.aliveMs}ms`).toBeGreaterThan(48)
  expect(seen!.aliveMs, `화면에 머문 시간 ${seen!.aliveMs}ms`).toBeLessThan(400)
  // **무채색**이다 — r == g == b(색을 안 들였다 — 지시 3-a ⚠)
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(seen!.bg)!
  expect(rgb[1]).toBe(rgb[2])
  expect(rgb[2]).toBe(rgb[3])
  // 그리고 **스스로 사라졌다**(위 대기가 그것을 기다린 것이다)
  expect(await page.locator('#shutter-flash').count()).toBe(0)
  await page.keyboard.press('Escape')
  const constMs = await page.evaluate(() => (window as any).__b2.diag.shutterMs())
  console.log(`[측정] shutter — 화면에 머문 시간 ${seen!.aliveMs.toFixed(1)}ms (상수 ${constMs}ms)`)

  // ── 원장(CLAUDE.md §5 — 측정은 반드시 stage0/out에 JSON으로) · LEDGER=1 문 ──────
  //   정본 명령: LEDGER=1 npx playwright test e2e/strip.spec.ts --workers=1
  if (process.env.LEDGER === '1') {
    const dpr = test.info().project.name
    const suffix = dpr === 'dpr1' ? '' : `_${dpr}`
    const dir = resolve(HERE, '../../stage0/out')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, `shutter25_web2${suffix}.json`), JSON.stringify({
      what: 'web2-25 3-a — 셔터의 번쩍임이 **화면에 실제로 머문 시간**. '
        + '정본 명령: LEDGER=1 npx playwright test e2e/strip.spec.ts --workers=1',
      run: {
        date: '2026-08-28', project: dpr,
        method: '페이지 안에서 `#paper-add`를 누른 **직후**부터 `#shutter-flash`가 DOM에서 '
          + '사라질 때까지를 `performance.now()`로 잰다(rAF 폴링). ⚠ **상수를 상수 대역과 '
          + '견주지 않는다**(리뷰 1차 [14]) — 그것은 설계 보장에 임계를 건 것이다.',
      },
      constant_ms: constMs,
      alive_ms: Number(seen!.aliveMs.toFixed(1)),
      since_press_ms: Number(seen!.sincePress.toFixed(1)),
      background: seen!.bg,
      gate: {
        min_ms: 48, max_ms: 400,
        registered: '화면 잔존이 48~400ms 안이다. ⚠ **CLAUDE.md §2의 중단 조건이 아니다**(#41) — '
          + '이 항목이 등록한 팔의 문일 뿐이다.',
        reachability: '**둘 다 실제로 넘겼다**(D-3): 상수를 0으로 두면 관측 18.4→24.6ms로 '
          + '아래 문이 깨지고, 3000으로 두면 2994.2ms로 위 문이 깨진다. ⚠ 초판의 아래 문 16ms'
          + '(한 프레임)는 **지표의 분해능 아래**라 상수 0에서도 통과했다(18.4ms) — 그래서 '
          + '세 프레임(48ms)으로 올렸다(#71 ㉢).',
        for: '세 프레임(48ms)보다 길고 «가려졌다»로 읽힐 만큼 길지 않다. ⚠ 아래 문이 «한 프레임»이면 지표의 분해능 아래라 상수 0에서도 통과한다(실측 18.4ms) — #71 ㉢',
        reachability_source: '반증(D-3) — 상수를 0/3000으로 바꿔 **실제로 실패시켰다**. '
          + '기록은 web2/NOTES.md 3-a 반증 절',
        reachability_value: [0, 3000] },
      note: '⚠⚠ **화면 잔존은 상수보다 짧다**(관측 대역 80~115ms ↔ 상수 120ms). rAF 폴링의 '
        + '해상도(≈16ms)와 `setTimeout` 지연이 그 차의 몫이고, **dpr2에서 더 짧다**(프레임이 '
        + '무거워 폴링 간격이 벌어진다). 그러므로 AS-C90의 근거 대역(관행 100~150ms)은 '
        + '**상수의 대역**이지 화면 잔존의 대역이 아니다 — 사람이 보는 것은 이 alive_ms이고 '
        + 'dpr2에서 그것이 100 아래로 내려간다(리뷰 2차 [5]). 실기기 판정(DEVICE-CHECK D10)이 '
        + '「찍힌 줄 몰랐다」를 내면 상수를 올리는 근거가 이 값이다.',
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인 원장은 상수 스냅샷 등록부 밖(공통 형태)',
      },
    }, null, 2))
  }
})

test('③ 길게 눌러 갱신하면 포즈·썸네일이 바뀐다', async ({ page }) => {
  await boot(page)
  await orbit(page)
  await page.click('#paper-add')
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  const before = (await sheets(page))[1]
  // 더 돌려 다른 각도를 찾는다 — 그러면 그 종이의 시점이 아니게 된다
  await orbit(page)
  await longPress(page, `#paperbar .ptab[data-sheet="${before.id}"]`)
  await expect(page.locator('#paper-pop u[data-pick="update"]')).toBeVisible()
  await expect(page.locator('#paper-pop u[data-pick="update"]')).not.toHaveClass(/blocked/)
  await page.click('#paper-pop u[data-pick="update"]')
  await settle(page)
  const after = (await sheets(page))[1]
  expect(after.pose.q.y).not.toBeCloseTo(before.pose.q.y, 6)   // 포즈가 갈렸다
  expect(after.thumb).toBe('data:image/jpeg')
  // 그리고 지금 보는 것이 그 종이다(갱신 = 지금 보이는 것을 담는다)
  const st = await page.evaluate(() => (window as any).__b2.app.activeSheet)
  expect(st).toBe(after.id)
})

test('④ 겹이 있으면 갱신이 막히고 안내가 뜬다', async ({ page }) => {
  await boot(page)
  await orbit(page)
  await page.click('#btn-roll'); await page.click('#btn-roll-yellow')     // 시점이 굳고 그 종이에 옐로가 얹힌다(2부)
  await settle(page)
  const sh = await sheets(page)
  expect(sh.length).toBe(2)
  await orbit(page)
  await longPress(page, `#paperbar .ptab[data-sheet="${sh[1].id}"]`)
  const upd = page.locator('#paper-pop u[data-pick="update"]')
  await expect(upd).toHaveClass(/blocked/)
  await upd.click()
  await settle(page)
  // 안내가 뜬다 — 그리고 **새 종이를 만들라**고 말한다(「다시 뜨기 없음」과 같은 결)
  await expect(page.locator('#notice')).toContainText('새 종이')
  const after = await sheets(page)
  expect(after[1].pose.q.y).toBeCloseTo(sh[1].pose.q.y, 12)   // 아무것도 안 바뀌었다
  expect(after.length).toBe(2)
})
