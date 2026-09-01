// web2-32 1·2번 — **화면 게이트**. 단위 팔(`test/scribble32.test.ts`·`test/writedim32.test.ts`)이
// 모형과 상태를 재고, 여기서 재는 것은 **손이 실제로 그 길을 걸을 수 있는가**다.
//
// ⚠⚠ 이 파일이 잡는 자리 둘 — 단위 팔이 못 잡는 것들이다:
//   ㉠ **닫힌 한 붓이 통째로 버려지지 않는가**(입력 → resolveCommit 경로). 「0」·「8」은
//      끝이 시작으로 돌아오므로 끝점 거리만 보면 «찍은 점»이다. 그 자리가 조용해서
//      사용자에게는 「곡선인 숫자는 안 된다」로 보였다.
//   ㉡ **승인 단계가 정말로 없는가** — 29-2의 제안 줄(#dimsuggest)이 화면에서 사라졌다.

import { test, expect, type Page } from '@playwright/test'
import { clearStore } from './store43'

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

/** 닫힌 한 붓 «0» — 끝이 시작으로 돌아온다 */
const zero = (cx: number, cy: number, r = 14) =>
  Array.from({ length: 21 }, (_, i) => {
    const th = i / 20 * Math.PI * 2
    return { x: cx + Math.cos(th) * r * 0.7, y: cy + Math.sin(th) * r }
  })

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await clearStore(page)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await line(page, 280, 560, 700, 560)       // 지평선 선언
  await line(page, 500, 560, 800, 480)       // 소실점 획 — 여기서 카메라가 닫힌다
  await line(page, 500, 560, 500, 660)       // 치수를 매길 세로선(3D)
}

const state = (page: Page) => page.evaluate(() => {
  const a = (window as any).__b2.app
  return {
    n: a.doc.strokes.length,
    text: a.doc.strokes.filter((s: any) => s.text === 1).map((s: any) => s.id),
    lifted: [...a.lift.lifted.keys()],
    waiting: [...a.lift.waiting],
    dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).map((s: any) => ({ id: s.id, dim: s.dim })),
    edit: a.dimEdit,
  }
})

/** **선을 꾹 누른다**(web2-39 1번) — 누른 자리에서 안 움직이고 `writeHoldMs`를 넘긴다.
 *  ⚠ 시간은 **앱에서 읽는다**(#88 — 팔이 상수를 손으로 들면 제품이 값을 바꿀 때 조용히 갈린다). */
async function pressHold(page: Page, x: number, y: number) {
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms + 120)
  await page.mouse.up()
  await settle(page)
}

const writing = (page: Page) => page.evaluate(() => {
  const w = (window as any).__b2.app.write
  return w === null ? null : { target: w.target, ids: [...w.ids], edit: w.edit }
})

test('㉠ 닫힌 한 붓 — 밖에서는 작도선이고, 꾹 누른 뒤에는 글씨다 (web2-39)', async ({ page }) => {
  await boot(page)
  // ⚠⚠ **web2-32의 이 팔이 뒤집혔다**: 그때는 「감긴 획 하나는 그 자리에서 글씨다」였고
  //    web2-39가 그 추측을 걷었다. 남는 것(㉠의 원래 몫)은 **버려지지 않는다**이고 —
  //    닫힌 한 붓은 끝점 거리로 보면 «찍은 점»이라 조용히 사라질 수 있다 — 그 위에
  //    **상태 밖/안**의 대조를 얹는다.
  const before = await state(page)
  await drawPath(page, zero(560, 610))
  const outside = await state(page)
  console.log(`[39 화면 ㉠ 밖] 획 ${before.n} → ${outside.n} · 글씨 ${JSON.stringify(outside.text)}`)
  expect(outside.n, '획이 남는다(버려지지 않는다)').toBe(before.n + 1)
  expect(outside.text, '**상태 밖에서는 글씨가 아니다**').toEqual([])

  // 이제 치수를 매길 선을 꾹 누르고 같은 획을 다시 긋는다
  await pressHold(page, 500, 610)
  const w = await writing(page)
  console.log(`[39 화면 ㉠ 진입] write=${JSON.stringify(w)}`)
  expect(w, '선을 꾹 누르면 글씨 상태로 들어간다').not.toBeNull()
  const mid = await state(page)
  expect(mid.n, '꾹 누름 자체는 획을 안 만든다').toBe(outside.n)
  // ⚠ **누른 자리 곁에 쓴다** — 39-3 ②의 「먼 곳」 문이 첫 획부터 서 있다(뭉치의 씨앗이
  //    누른 자리다). 화면 반대편에 그으면 그 획은 **규칙대로** 작도선이 된다.
  await drawPath(page, zero(575, 600))
  const inside = await state(page)
  console.log(`[39 화면 ㉠ 안] 글씨 ${JSON.stringify(inside.text)}`)
  expect(inside.text.length, '상태 안에서는 그 획이 글씨다').toBe(1)
  const id = inside.text[inside.text.length - 1]
  expect(inside.lifted, '글씨는 3D가 없다').not.toContain(id)
  expect(inside.waiting, '대기도 아니다').not.toContain(id)
})

test('㉡ 승인 단계가 없다 — 제안 줄이 화면에 없다 (진입은 꾹 누름이다)', async ({ page }) => {
  await boot(page)
  expect(await page.locator('#dimsuggest').count(), '29-2의 제안 줄이 사라졌다').toBe(0)
  await pressHold(page, 500, 610)
  expect(await writing(page), '꾹 눌러 들어간다').not.toBeNull()
  // 종이에 숫자를 쓴다(「25」 — 두 획). 인식은 확률적이라 **값**을 단언하지 않는다:
  // 여기서 단언하는 것은 «승인 없이 지나간다»와 «글씨로 판정된다»이다.
  await drawPath(page, [
    { x: 546, y: 600 }, { x: 552, y: 592 }, { x: 562, y: 592 }, { x: 566, y: 600 },
    { x: 556, y: 612 }, { x: 546, y: 622 }, { x: 568, y: 622 },
  ])
  await drawPath(page, [
    { x: 594, y: 592 }, { x: 578, y: 592 }, { x: 577, y: 604 }, { x: 590, y: 603 },
    { x: 595, y: 612 }, { x: 588, y: 621 }, { x: 576, y: 619 },
  ])
  await page.waitForTimeout(400)          // 인식은 비동기다(있으면 그 사이에 끝난다)
  const mid = await state(page)
  // ⚠⚠ **web2-39 2′**: 값이 실려도 잉크는 **아직 남아 있다** — 그래야 「25」가 두 획을
  //    지나며 2 → 25로 자란다. 32-2는 실리는 즉시 걷어서 이어 쓴 「5」가 혼자 남았고,
  //    그 결과가 **`dim 5`**였다(이 팔이 그 값을 냈다). 이제 25다.
  console.log(`[32-2 화면 ㉡ 쓰는 중] 글씨 ${JSON.stringify(mid.text)} · 치수 ${JSON.stringify(mid.dims)}`)
  expect(mid.dims.length, '값이 실렸다').toBe(1)
  expect(mid.dims[0].dim, '두 획이 «25»로 자란다(«5»가 아니다)').toBe(25)
  expect(mid.text.length, '잉크는 아직 남아 있다').toBe(2)
  await page.waitForTimeout(1400)         // 손이 멈춘다 — 여기서 잉크가 걷힌다
  const st = await state(page)
  console.log(`[32-2 화면 ㉡ 멈춘 뒤] 글씨 ${JSON.stringify(st.text)} · 치수 ${JSON.stringify(st.dims)}`)
  expect(st.text.length, '멈추면 손글씨가 걷힌다').toBe(0)
  expect(st.dims.length + st.text.length, '글씨로 남거나 치수가 되거나 — 둘 중 하나다').toBeGreaterThan(0)
  expect(await page.locator('#dimsuggest').count()).toBe(0)
  const notice = (await page.textContent('#notice')) ?? ''
  expect(notice, '「받는다/무시」를 묻지 않는다').not.toContain('받는다')
})

test('㉢ 치수 숫자를 눌러 고르는 길이 손에 걸린다 (사후 수정)', async ({ page }) => {
  await boot(page)
  const id = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return a.doc.strokes[a.doc.strokes.length - 1].id as number
  })
  await page.evaluate((sid) => (window as any).__b2.diag.setDimForTest(sid, 2500), id)
  await settle(page)
  const pos = await page.evaluate((sid) => (window as any).__b2.diag.dimLabelPosForTest(sid), id)
  expect(pos, '치수 숫자에 자리가 있다').toBeTruthy()
  // 그 자리를 **탭**한다 — 끌지 않으면 그리기가 아니라 «치수 짚기»다
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  const st = await state(page)
  console.log(`[32-2 화면 ㉢] 자리 (${pos.x.toFixed(0)},${pos.y.toFixed(0)}) 탭 → dimEdit=${st.edit}`)
  expect(st.edit, '그 치수가 잡힌다').toBe(id)
  // **분해능** — 그 탭이 획(소실점 표식)을 만들지 않았다
  expect(st.n, '탭이 획을 만들지 않는다').toBe(3)
})
