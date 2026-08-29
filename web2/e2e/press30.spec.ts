// web2-30 7번 — **필압 보정 절차가 실제로 화면에 있는가**(실측 공백).
//
// 왜 이 팔이 있는가: web2-26 6번의 게이트는 통과 보고됐지만 실측값이 **전부 합성 압력**
// (`diag.pressCalForTest`로 손으로 세운 값)이었다. 지시문에는 「켤 때 두 획을 받는다 —
// 평소 세기로 하나, 가장 세게 하나」가 있었는데, 합성값으로도 게이트가 통과되므로
// **그 절차가 화면에 실제로 존재하는지 자체가 확인되지 않았다.** 여기서는 **손으로 세우는
// 통로를 한 번도 안 쓴다** — 압력은 전부 CDP 실입력(`force`)이다.
//
// D-2(재현): ①이 그 자리다 — 절차가 화면에 «머무르는지»를 본다. web2-26에는 알림 한 줄
//   뿐이었고 알림은 스쳐 지나가므로 사람이 절차를 못 본다(사용자가 토글도 못 찾았다).
// D-3(반증): ②는 **서로 다른 두 입력이 서로 다른 값을 만드는 것**을 같은 실행에서 잰다.
//   한 쌍만 재면 「무엇을 넣어도 그 값이 나온다」와 구별이 안 된다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 펜으로 한 획 — 압력 `force` 균일. **합성 PointerEvent는 pressure가 안 실린다.** */
async function penLine(page: Page, ax: number, ay: number, bx: number, by: number, force: number) {
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, ...pen, force })
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + (bx - ax) * i / 8, y: ay + (by - ay) * i / 8, ...pen, force })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, ...pen, force: 0 })
  await cdp.detach()
  await settle(page)
}

/** 마우스로 한 획 — 압력이 **안 실린다**(상수 0.5). 「펜으로 그어야 한다」 갈래의 입력. */
async function mouseLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function openSettings(page: Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
}

const state = (page: Page) => page.evaluate(() => {
  const b2 = (window as any).__b2
  const row = document.getElementById('press-calib') as HTMLElement
  return {
    checked: (document.getElementById('chk-press') as HTMLInputElement).checked,
    rowShown: !row.hidden,
    step: (document.getElementById('press-calib-step') as HTMLElement).textContent ?? '',
    busy: b2.app.pressCalib !== null,
    press: b2.app.doc.press ? { ...b2.app.doc.press } : null,
  }
})

test('30-7 ① 절차가 화면에 뜬다 — 켜면 두 획을 받고, 받는 동안 옵션은 **꺼진 채**다', async ({ page }) => {
  await boot(page)
  await openSettings(page)

  const s0 = await state(page)
  expect(s0.checked).toBe(false)
  expect(s0.rowShown).toBe(false)

  await page.click('#chk-press')   // ⚠ `check()`는 못 쓴다 — 상자가 도로 꺼지는 것이 설계다(30-7 ④)
  await settle(page)
  const s1 = await state(page)
  console.log(`[30-7 ①] 시작 — 체크 ${s1.checked} · 절차줄 ${s1.rowShown} "${s1.step}"`)
  expect(s1.rowShown, '절차가 화면에 뜬다').toBe(true)
  expect(s1.step).toContain('평소 세기')
  expect(s1.busy).toBe(true)
  expect(s1.checked, '게이트 ④ — 마치기 전에는 옵션이 안 켜진다').toBe(false)
  expect(s1.press, '문서에도 아직 아무것도 안 섰다').toBe(null)

  // 첫 획(평소 세기)
  await penLine(page, 300, 300, 560, 300, 0.30)
  const s2 = await state(page)
  console.log(`[30-7 ①] 첫 획 뒤 — "${s2.step}" · 체크 ${s2.checked}`)
  expect(s2.step).toContain('가장 세게')
  expect(s2.checked, '아직도 꺼진 채다').toBe(false)

  // 둘째 획(가장 세게)
  await penLine(page, 300, 360, 560, 360, 0.90)
  const s3 = await state(page)
  console.log(`[30-7 ①] 완료 — 체크 ${s3.checked} · 절차줄 ${s3.rowShown} · p0 ${s3.press?.p0} · p1 ${s3.press?.p1}`)
  expect(s3.busy).toBe(false)
  expect(s3.rowShown, '끝나면 절차줄이 사라진다').toBe(false)
  expect(s3.checked, '이때 비로소 켜진다').toBe(true)
  expect(s3.press).not.toBe(null)
  expect(s3.press!.on).toBe(true)
})

test('30-7 ② 서로 다른 두 입력이 **서로 다른 p0·p1**을 만든다 (반증 짝)', async ({ page }) => {
  const runs: { pair: [number, number]; p0: number; p1: number }[] = []
  for (const pair of [[0.20, 0.80], [0.45, 0.95]] as [number, number][]) {
    await boot(page)
    await openSettings(page)
    await page.click('#chk-press')   // ⚠ `check()`는 못 쓴다 — 상자가 도로 꺼지는 것이 설계다(30-7 ④)
    await settle(page)
    await penLine(page, 300, 300, 560, 300, pair[0])
    await penLine(page, 300, 360, 560, 360, pair[1])
    const s = await state(page)
    expect(s.press, `압력 ${pair} 에서 보정이 섰다`).not.toBe(null)
    runs.push({ pair, p0: s.press!.p0, p1: s.press!.p1 })
    console.log(`[30-7 ②] 입력 ${pair[0]}/${pair[1]} → p0 ${s.press!.p0.toFixed(4)} · p1 ${s.press!.p1.toFixed(4)}`)
  }
  // 입력이 다르면 값도 다르다 — 이 줄이 없으면 「무엇을 넣어도 같은 값」과 구별이 안 된다
  expect(runs[0]!.p0).not.toBeCloseTo(runs[1]!.p0, 3)
  expect(runs[0]!.p1).not.toBeCloseTo(runs[1]!.p1, 3)
  // 그리고 값이 **입력을 따라간다**(더 세게 그으면 p0가 크다)
  expect(runs[1]!.p0).toBeGreaterThan(runs[0]!.p0)
  expect(runs[1]!.p1).toBeGreaterThan(runs[0]!.p1)
})

test('30-7 ③ 산출된 값이 문서에 저장되고 **왕복한다** (기기가 아니라 문서 — 26-6)', async ({ page }) => {
  await boot(page)
  await openSettings(page)
  await page.click('#chk-press')   // ⚠ `check()`는 못 쓴다 — 상자가 도로 꺼지는 것이 설계다(30-7 ④)
  await settle(page)
  await penLine(page, 300, 300, 560, 300, 0.25)
  await penLine(page, 300, 360, 560, 360, 0.85)
  const before = (await state(page)).press!
  expect(before).not.toBe(null)

  // 왕복은 **자동 저장**으로 본다(`serializeBrnl`이 `doc.press`를 싣는다 — file.ts).
  // ⚠ 자동 저장은 **400ms 미룸**이다 — 바로 새로고침하면 아직 안 쓴 것을 재게 된다
  //   (초판이 그렇게 걸렸다: `after`가 null이었는데 저장 형식이 아니라 **시점**이 원인).
  await page.waitForTimeout(700)
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  const after = (await state(page)).press
  console.log(`[30-7 ③] 왕복 — 전 p0 ${before.p0.toFixed(4)} p1 ${before.p1.toFixed(4)} · 후 ${JSON.stringify(after)}`)
  expect(after, '새로고침 뒤에도 그 문서의 보정이 남는다').not.toBe(null)
  expect(after!.p0).toBeCloseTo(before.p0, 6)
  expect(after!.p1).toBeCloseTo(before.p1, 6)
  // 화면도 그 상태를 그대로 든다
  await openSettings(page)
  expect((await state(page)).checked).toBe(true)
})

test('30-7 ④ 절차를 중간에 그만두면 **꺼진 채로 남는다** · 펜이 아니면 절차가 안 넘어간다', async ({ page }) => {
  await boot(page)
  await openSettings(page)
  await page.click('#chk-press')   // ⚠ `check()`는 못 쓴다 — 상자가 도로 꺼지는 것이 설계다(30-7 ④)
  await settle(page)

  // 마우스 획 — 압력이 없다. 절차가 **안 넘어가고** 그 사실을 말한다.
  await mouseLine(page, 300, 300, 560, 300)
  const s1 = await state(page)
  console.log(`[30-7 ④] 마우스 획 뒤 — "${s1.step}"`)
  expect(s1.busy, '아직 절차 중이다').toBe(true)
  expect(s1.step).toContain('펜으로')

  // 그만둔다
  await page.click('#btn-press-cancel')
  await settle(page)
  const s2 = await state(page)
  console.log(`[30-7 ④] 그만둔 뒤 — 체크 ${s2.checked} · 절차줄 ${s2.rowShown} · 문서 ${JSON.stringify(s2.press)}`)
  expect(s2.busy).toBe(false)
  expect(s2.rowShown).toBe(false)
  expect(s2.checked, '옵션은 꺼진 채로 남는다').toBe(false)
  expect(s2.press, '문서에 절반 상태가 안 남는다').toBe(null)
})
