// web2-39 — **화면 게이트**. 단위 팔(`test/writeenter39.test.ts`)이 모형과 상태를 재고,
// 여기서 재는 것은 **손이 실제로 그 길을 걸을 수 있는가**다.
//
// ⚠⚠ 이 파일이 잡는 자리 셋 — 단위 팔이 못 잡는 것들이다:
//   ㉠ **꾹 누름이 실제로 시간으로 갈리는가** — 짧게 누르면 안 들어가고 길게 누르면
//      들어간다. 단위 팔은 `beginWriting`을 직접 부르므로 **시계를 안 지난다**.
//   ㉡ **그 몸짓이 획을 안 만드는가** — 누름은 그리기의 입구이기도 하다. 진입으로
//      소진된 몸짓이 뗌에서 획·소실점 표식으로 흘러가면 조용히 그림이 는다.
//   ㉢ **설정 손잡이가 화면에 있고 값이 앱에 닿는가**(사용자 요청) — 슬라이더를 움직이면
//      `app.writeHoldMs`가 따라오고, 그 값이 실제 누름 판정에 먹힌다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawPath(page: Page, pts: { x: number; y: number }[]) {
  await page.mouse.move(pts[0]!.x, pts[0]!.y)
  await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()
  await settle(page)
}

const line = (page: Page, ax: number, ay: number, bx: number, by: number) =>
  drawPath(page, Array.from({ length: 9 }, (_, i) => ({ x: ax + (bx - ax) * i / 8, y: ay + (by - ay) * i / 8 })))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await line(page, 280, 560, 700, 560)       // 지평선 선언
  await line(page, 500, 560, 800, 480)       // 소실점 획 — 카메라가 닫힌다
  await line(page, 500, 560, 500, 660)       // 치수를 매길 세로선(3D)
}

const state = (page: Page) => page.evaluate(() => {
  const a = (window as any).__b2.app
  return {
    n: a.doc.strokes.length,
    text: a.doc.strokes.filter((s: any) => s.text === 1).map((s: any) => s.id),
    dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).map((s: any) => ({ id: s.id, dim: s.dim })),
    write: a.write === null ? null : { target: a.write.target, ids: [...a.write.ids], edit: a.write.edit },
    holdMs: a.writeHoldMs as number,
  }
})

/** 누른 채로 ms만큼 있다가 뗀다 — **움직이지 않는다**(이동은 그리기다) */
async function pressFor(page: Page, x: number, y: number, ms: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
  await settle(page)
}

test('㉠ 꾹 누름은 시간으로 갈린다 — 짧으면 안 들어가고 길면 들어간다', async ({ page }) => {
  await boot(page)
  const base = await state(page)
  // 짧게 — 문의 절반. 탭·짧은 누름은 종전 경로 그대로다.
  await pressFor(page, 500, 610, Math.round(base.holdMs / 2))
  const short = await state(page)
  console.log(`[39 화면 ㉠ 짧게 ${Math.round(base.holdMs / 2)}ms] write=${JSON.stringify(short.write)} · 획 ${short.n}`)
  expect(short.write, '문 아래에서는 안 들어간다').toBeNull()
  // 길게 — 문 + 여유
  await pressFor(page, 500, 610, base.holdMs + 150)
  const long = await state(page)
  console.log(`[39 화면 ㉠ 길게 ${base.holdMs + 150}ms] write=${JSON.stringify(long.write)} · 획 ${long.n}`)
  expect(long.write, '문 위에서는 들어간다').not.toBeNull()
  expect(long.write!.target, '누른 그 선이 대상이다').toBe(base.n)   // 마지막 획 id = 획 수
})

test('㉡ 진입한 몸짓은 획을 안 만든다 — 그리고 상태 밖 세로선 셋은 치수를 안 만든다', async ({ page }) => {
  await boot(page)
  const before = await state(page)

  // ── 사용자가 겪은 그 동작: 짧은 세로 작도선 셋 ─────────────────────────
  for (const x of [600, 630, 660]) await line(page, x, 620, x, 660)
  const hatched = await state(page)
  console.log(`[39 화면 ㉡ 해칭] 획 ${before.n} → ${hatched.n} · 글씨 ${JSON.stringify(hatched.text)} · 치수 ${JSON.stringify(hatched.dims)}`)
  expect(hatched.n, '획 셋이 그대로 남는다').toBe(before.n + 3)
  expect(hatched.text, '**글씨가 하나도 없다**').toEqual([])
  expect(hatched.dims, '**치수가 하나도 안 생긴다**').toEqual([])

  // ── 진입 몸짓이 획을 안 만든다 ─────────────────────────────────────────
  await pressFor(page, 500, 610, hatched.holdMs + 150)
  const held = await state(page)
  console.log(`[39 화면 ㉡ 진입] 획 ${hatched.n} → ${held.n} · write=${JSON.stringify(held.write)}`)
  expect(held.write, '들어갔다').not.toBeNull()
  expect(held.n, '누름은 획을 안 만든다').toBe(hatched.n)
})

test('㉢ 설정 손잡이가 화면에 있고 그 값이 실제로 먹힌다 (사용자 요청)', async ({ page }) => {
  await boot(page)
  const rng = page.locator('#rng-whold')
  await expect(rng, '설정에 손잡이가 있다').toHaveCount(1)
  // 값을 크게 올린다 — 그러면 «종전이면 들어갔을 시간»에 안 들어가야 한다
  const base = await state(page)
  await rng.evaluate((el: HTMLInputElement) => {
    el.value = '1200'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const after = await state(page)
  console.log(`[39 화면 ㉢] holdMs ${base.holdMs} → ${after.holdMs} · 읽기 «${await page.textContent('#whold-read')}»`)
  expect(after.holdMs, '앱이 그 값을 든다').toBe(1200)
  expect(await page.textContent('#whold-read')).toBe('1.20s')

  // **그 값이 판정에 먹히는가** — 옛 값(+여유)만큼 눌러도 안 들어간다
  await pressFor(page, 500, 610, base.holdMs + 200)
  const shortNow = await state(page)
  console.log(`[39 화면 ㉢ 옛 값만큼] write=${JSON.stringify(shortNow.write)}`)
  expect(shortNow.write, '올린 문 아래라 안 들어간다').toBeNull()
  // 새 값만큼 누르면 들어간다(반증판이 실제로 선다 — D-3)
  await pressFor(page, 500, 610, 1200 + 200)
  const longNow = await state(page)
  console.log(`[39 화면 ㉢ 새 값만큼] write=${JSON.stringify(longNow.write)}`)
  expect(longNow.write, '새 문 위에서는 들어간다').not.toBeNull()
})
