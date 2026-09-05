// web2-15 2번 — **Pro Pen 3E 지우개 끝**이 그 획 하나를 지우개로 보낸다.
//
// 실기기 관측(사람 · Wacom MovinkPad Pro 14 + Pro Pen 3E · 안드로이드 15 크롬):
//   · 지우개로 그리는 **내내** `buttons`가 32다 → 판정의 정본은 이 비트다.
//     (`button === 5`는 누름·뗌 «순간»에만 온다 — 그리는 동안 유효하지 않다.)
//   · **호버에는 안 온다**(「호버링만 할 땐 뜨지 않는다」) → 전환도 커서도 접촉 순간부터다.
// 그래서 이 팔은 **합성 PointerEvent**로 그 신호를 만든다 — 헤드리스가 잴 수 있는 것은
// 「그 신호를 받으면 무엇을 하는가」이고, 「기기가 그 신호를 보내는가」는 이미 사람이 답했다.
//
// 설계(지시 2-b): **도구를 바꾸지 않는다.** `pointerdown`에서 비트가 서 있으면 그 획만
// 지우개 경로로 보낸다. 뗌과 동시에 아무것도 안 남으므로 되돌릴 것이 없다 —
// 호버에 신호가 없어 전환이 접촉 순간에만 일어나는 것이 그 설계의 이유다.
//
// 재는 것 ①~④(지시 문면) + 반증(D-3): 32 비트를 빼면 지우개 경로로 **안 가는가** —
// 실제로 빼서 확인한다. ④(일반 펜에서 절대 안 지워진다)가 가장 중요하다.

// web2-69 §3 — 개발 메뉴(진단·작업대·자립 깃발)는 ?dev=1일 때만 DOM에 있다: 이 스펙은 그 항목을 누른다 → dev=1로 연다(«열기» 한 줄 판갈이)
import { test, expect, type Page } from '@playwright/test'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/?dev=1')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 펜 한 획 — `buttons`를 그대로 실어 캔버스에 합성 PointerEvent를 쏜다.
 *  캔버스가 듣는 것은 `pointerdown`/`pointermove`/`pointerup`이므로 셋을 다 보낸다.
 *  ⚠ `setPointerCapture`는 합성 id에 안 걸리므로 예외를 삼킨다(패치). */
async function penStroke(page: Page, buttons: number, ax: number, ay: number, bx: number, by: number, steps = 6) {
  await page.evaluate(([btn, x0, y0, x1, y1, n]) => {
    // 입력을 듣는 것은 잉크 캔버스다(main.ts: initInput(ink, ...))
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, {
      pointerType: 'pen', pointerId: 7, buttons: b, pressure: b === 0 ? 0 : 0.5,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', x0!, y0!, btn!))
    for (let i = 1; i <= n!; i++) {
      el.dispatchEvent(mk('pointermove', x0! + (x1! - x0!) * i / n!, y0! + (y1! - y0!) * i / n!, btn!))
    }
    el.dispatchEvent(mk('pointerup', x1!, y1!, 0))
  }, [buttons, ax, ay, bx, by, steps])
  await settle(page)
}

const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
const tool = (page: Page) => page.evaluate(() => (window as any).__b2.app.tool)
const tipErase = (page: Page) => page.evaluate(() => (window as any).__b2.app.tipErase)

/** 이 팔이 지울 대상 — 지평선(작도 획은 못 지운다) 대신 **내용 획**을 만든다.
 *  마우스로 그어 «펜 지우개와 무관하게 이미 있던 획»을 세운다. */
async function seed(page: Page) {
  const drawMouse = async (ax: number, ay: number, bx: number, by: number) => {
    await page.mouse.move(ax, ay); await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6)
    await page.mouse.up(); await settle(page)
  }
  await drawMouse(100, 400, 1100, 400)     // 지평선(작도)
  await drawMouse(400, 600, 700, 600)      // 내용 획 — 지울 대상
  return strokeCount(page)
}

test('① 지우개 끝(buttons 32)으로 그으면 그 획이 지워진다 · ② 선택 도구는 안 바뀐다', async ({ page }) => {
  await boot(page)
  const t0 = await tool(page)
  const n0 = await seed(page)
  await penStroke(page, 32, 400, 600, 700, 600)      // 내용 획 위를 지우개로 훑는다
  const n1 = await strokeCount(page)
  console.log(`[측정] 지우개 끝 — 획 ${n0} → ${n1} · 도구 ${t0} → ${await tool(page)}`)
  expect(n1, '그 획이 없어졌다(조각도 안 남는 전면 통과)').toBeLessThan(n0)
  expect(await tool(page), '사이드바 도구는 그대로 연필이다 — 바뀌면 실패다').toBe(t0)
  expect(t0).toBe('pencil')
  expect(await tipErase(page), '뗀 뒤 깃발이 내려간다 — 되돌릴 상태가 없다').toBe(false)
})

test('③ 뗀 뒤 다음 획은 연필로 그어진다 — 새 획이 생긴다', async ({ page }) => {
  await boot(page)
  await seed(page)
  await penStroke(page, 32, 400, 600, 700, 600)      // 지우개 획
  const n1 = await strokeCount(page)
  await penStroke(page, 1, 350, 680, 650, 680)       // 일반 펜 접촉
  const n2 = await strokeCount(page)
  console.log(`[측정] 뗀 뒤 연필 — 획 ${n1} → ${n2}`)
  expect(n2, '다음 획은 그어진다(지우개 상태가 안 남았다)').toBeGreaterThan(n1)
  expect(await tool(page)).toBe('pencil')
})

test('④ **가장 중요** — 일반 펜(buttons 1)에서는 절대 안 지워진다', async ({ page }) => {
  await boot(page)
  const n0 = await seed(page)
  await penStroke(page, 1, 400, 600, 700, 600)       // 같은 자리를 일반 펜으로
  const n1 = await strokeCount(page)
  console.log(`[측정] 일반 펜 — 획 ${n0} → ${n1}`)
  expect(n1, '지워지기는커녕 획이 늘어야 한다').toBeGreaterThanOrEqual(n0)
  expect(await tipErase(page)).toBe(false)
})

test('반증(D-3) — 32 비트를 실제로 빼면 지우개 경로로 안 간다 · 진단 줄이 그 판정을 보인다', async ({ page }) => {
  await boot(page)
  // 비트 있음 → 깃발이 선다(접촉 중에만 — 호버에는 신호가 없다)
  await page.evaluate(() => {
    const el = (document.getElementById('ink') as any)
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.__capPatched = true }
    el.dispatchEvent(new PointerEvent('pointerdown', {
      pointerType: 'pen', pointerId: 9, buttons: 32, pressure: 0.5,
      clientX: 500, clientY: 600, bubbles: true,
    }))
  })
  expect(await tipErase(page), '비트 있음 — 지우개 경로').toBe(true)
  await page.evaluate(() => {
    (document.getElementById('ink') as any).dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'pen', pointerId: 9, buttons: 0, clientX: 500, clientY: 600, bubbles: true,
    }))
  })
  expect(await tipErase(page)).toBe(false)
  // 비트 뺌 → 안 선다. **32만 뺀 같은 이벤트**다(다른 것을 안 바꿨다)
  await page.evaluate(() => {
    const el = document.getElementById('ink') as any
    el.dispatchEvent(new PointerEvent('pointerdown', {
      pointerType: 'pen', pointerId: 9, buttons: 1, pressure: 0.5,
      clientX: 500, clientY: 600, bubbles: true,
    }))
  })
  expect(await tipErase(page), '비트 없음 — 절대 전환하지 않는다').toBe(false)
  await page.evaluate(() => {
    (document.getElementById('ink') as any).dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'pen', pointerId: 9, buttons: 0, clientX: 500, clientY: 600, bubbles: true,
    }))
  })
  // 진단 패널이 «지금 어느 쪽으로 인식 중인가»를 보인다(지시 2-b 마지막 줄)
  await openDiag(page)
  const row = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#diagpanel div'))
    const r = rows.find(d => d.textContent?.includes('지우개 끝 신호'))
    return r?.textContent ?? ''
  })
  console.log(`[측정] 진단 줄 — ${row}`)
  expect(row).toContain('판정=buttons&32')
  expect(row, '마지막 관측이 buttons 1이었으므로 «연필»로 읽혀야 한다').toContain('연필')
})
