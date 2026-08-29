// web2-28 — **화면 다듬기**의 게이트. 거동은 안 바꾼다.
//   ① 명령을 실행하면 패널이 접힌다 · 상태는 안 접힌다 (**전수**)
//   ② 툴팁 — 펜에서만 · 그리는 중 안 뜬다 · 넘치면 안쪽으로
//   ③ 화면 문자열 (표는 NOTES가 정본 — 여기서는 «바꿈»으로 판정한 것만 못 박는다)
//   ④ 손 리본 순서
//
// ⚠ #75 ㉣ / #76 ㉣ — UI의 형태를 갈면 그 형태를 뜻으로 읽던 팔이 깨진다. 이 회차가
//   갈아 놓은 자리를 읽는 팔은 `zones.spec ①`(자리별 id 목록)·`icons.spec`·`sidebar.spec`이고
//   착수 표에 적었다. 판정자는 전량 e2e다.

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

/** 패널이 펴져 있는가 — 접힘의 «형태»가 패널마다 다르므로 한 자리에 모은다 */
const openOf = (page: Page, root: string) => page.evaluate((sel) => {
  const el = document.querySelector(sel) as HTMLElement | null
  if (!el) return null
  if (el.tagName === 'DETAILS') return (el as HTMLDetailsElement).open
  return !el.hidden
}, root)

test('28-1 ① 명령은 접고 상태는 안 접는다 — **전수**', async ({ page }) => {
  await boot(page)
  page.on('filechooser', fc => { void fc.setFiles([]) })
  // 획을 하나 그린다 — 비우기는 **빈 문서에서는 확인을 안 띄운다**(「이미 비어 있다」).
  // 그 상태로 재면 `data-fold="late"` 갈래가 **아무것도 안 재게 된다**(#69 ㉣).
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(280 + 420 * i / 8, 560)
  await page.mouse.up(); await settle(page)

  // 먼저 **표시가 빠진 항목이 없다**를 확인한다 — 그게 이 규칙의 전제다.
  // (버튼 종류를 추측하는 코드를 안 만들기로 했으므로, 표시가 없으면 조용히 «상태»가 된다.)
  const unmarked = await page.evaluate(() => {
    const roots = ['#pane-file', '#display-pop', '#snap-pop']
    const out: string[] = []
    for (const r of roots) {
      const el = document.querySelector(r)
      if (!el) continue
      for (const n of el.querySelectorAll('button, input')) {
        if (!(n as HTMLElement).dataset.act) out.push(`${r} ${(n as HTMLElement).id || n.tagName}`)
      }
    }
    return out
  })
  console.log(`[28-1] 표시 없는 항목: ${unmarked.length === 0 ? '없음' : unmarked.join(', ')}`)
  expect(unmarked).toEqual([])

  // ── 명령 전수 — 실행하면 그 패널이 접힌다 ────────────────────────────────
  const cmds = await page.evaluate(() =>
    [...document.querySelectorAll('#pane-file [data-act="cmd"]')].map(e => e.id))
  console.log(`[28-1] 파일 서랍의 명령: ${cmds.join(', ')}`)
  expect(cmds.length, '명령이 실제로 여럿 있다(#69 ㉣ — 공집합이면 통과가 무의미하다)').toBeGreaterThan(3)
  // ⚠ **접힘의 시점은 «볼일이 끝난 때»다.** 누르는 순간 그 버튼 «곁»에 확인이 뜨는
  //   명령(비우기 — web2-12 4번)은 바로 접으면 **앵커가 사라져 확인이 미아가 된다**
  //   (전량 e2e `flow.spec`이 잡았다). 그런 항목은 `data-fold="late"`로 표시하고
  //   **확인을 누른 뒤** 접힌다 — 표시를 읽는다는 규칙은 그대로다.
  for (const id of cmds) {
    await page.evaluate(() => { (document.getElementById('pane-file') as HTMLDetailsElement).open = true })
    expect(await openOf(page, '#pane-file'), `${id} 누르기 전`).toBe(true)
    const late = await page.getAttribute(`#${id}`, 'data-fold') === 'late'
    await page.click(`#${id}`)
    await settle(page)
    if (late) {
      // 아직 안 접힌다 — 확인이 그 버튼 곁에 떠 있어야 하기 때문이다(앵커가 살아 있다)
      expect(await openOf(page, '#pane-file'), `${id}는 확인 전에는 안 접힌다`).toBe(true)
      expect(await page.locator('#confirm-pop').count(), `${id} 확인이 떠 있다`).toBe(1)
      const btn = (await page.locator(`#${id}`).boundingBox())!
      const pop = (await page.locator('#confirm-pop').boundingBox())!
      expect(pop.x + pop.width, '확인이 그 버튼 곁이다').toBeLessThanOrEqual(btn.x + 1)
      await page.click('#confirm-pop u[data-pick="yes"]')
      await settle(page)
      expect(await openOf(page, '#pane-file'), `${id}는 확인 뒤에 접힌다`).toBe(false)
    } else {
      expect(await openOf(page, '#pane-file'), `${id} 실행 후 접힌다`).toBe(false)
    }
    await page.keyboard.press('Escape')
    await settle(page)
  }

  // ── 상태 전수 — 눌러도 안 접힌다 ────────────────────────────────────────
  await page.click('#btn-display')
  await settle(page)
  const states = await page.evaluate(() =>
    [...document.querySelectorAll('#display-pop [data-act="state"]')].map(e => e.id))
  console.log(`[28-1] 눈 팝업의 상태: ${states.join(', ')}`)
  expect(states.length).toBeGreaterThan(3)
  for (const id of states) {
    const el = page.locator(`#${id}`)
    if (await el.evaluate(e => (e as HTMLInputElement).type === 'range')) {
      await el.evaluate(e => { (e as HTMLInputElement).value = '500'; e.dispatchEvent(new Event('input', { bubbles: true })) })
    } else {
      await el.click()
    }
    await settle(page)
    expect(await openOf(page, '#display-pop'), `${id}는 안 접는다`).toBe(true)
  }

  // ── 오스냅은 **절대** 안 접는다(한 번에 여러 개를 켜고 끄는 자리다) ──────
  await page.click('#btn-display')      // 눈 팝업 닫기
  await page.click('#btn-snap')
  await settle(page)
  const boxes = page.locator('#osnap-kinds input')
  const n = await boxes.count()
  expect(n).toBeGreaterThan(5)
  for (let i = 0; i < n; i++) {
    await boxes.nth(i).click()
    expect(await openOf(page, '#snap-pop'), `오스냅 ${i}번을 눌러도 안 접힌다`).toBe(true)
  }
  await page.locator('#osnap-radius').evaluate(e => {
    (e as HTMLInputElement).value = '12'; e.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(await openOf(page, '#snap-pop')).toBe(true)
})

test('28-1 ①\' 면 찾기는 명령이다 — 실행하면 접힌다', async ({ page }) => {
  await boot(page)
  await page.click('#btn-face')      // 도구 선택
  await page.click('#btn-face')      // 다시 누르면 팝오버
  await settle(page)
  expect(await openOf(page, '#face-pop')).toBe(true)
  const marked = await page.evaluate(() =>
    [...document.querySelectorAll('#face-pop button')].map(e => ({ id: e.id, act: (e as HTMLElement).dataset.act })))
  console.log(`[28-1'] 면 팝오버: ${JSON.stringify(marked)}`)
  expect(marked.every(m => m.act === 'cmd'), '면 팝오버는 전부 명령이다').toBe(true)
  await page.click('#btn-face-all')
  await settle(page)
  expect(await openOf(page, '#face-pop'), '「전부 찾기」 뒤에는 접힌다').toBe(false)
})

test('28-2 ② 툴팁 — 펜에서만 · 600ms · 그리는 중 안 뜸 · 화면 안쪽', async ({ page }) => {
  await boot(page)
  const tipVisible = () => page.evaluate(() => !(document.getElementById('tip') as HTMLElement).hidden)
  const hoverPen = (sel: string) => page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'pen', bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }))
  }, sel)
  const hoverTouch = (sel: string) => page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'touch', bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }))
  }, sel)

  // 펜 — 머무르면 뜬다(문구는 그 단추의 title이다: 새 문자열 테이블이 없다는 증거)
  await hoverPen('#btn-snap')
  expect(await tipVisible(), '뜨기 전').toBe(false)
  await page.waitForFunction(() => !(document.getElementById('tip') as HTMLElement).hidden, undefined, { timeout: 3000 })
  const tip = await page.evaluate(() => {
    const t = document.getElementById('tip') as HTMLElement
    const r = t.getBoundingClientRect()
    return { text: t.textContent, x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const title = await page.getAttribute('#btn-snap', 'title')
  console.log(`[28-2] 팁 "${tip.text}" · 단추 title "${title}" · 자리 (${tip.x.toFixed(0)}, ${tip.y.toFixed(0)})`)
  expect(tip.text).toBe(title)
  // 화면 안쪽이다(넘치면 뒤집는다)
  expect(tip.x).toBeGreaterThanOrEqual(0)
  expect(tip.y).toBeGreaterThanOrEqual(0)
  expect(tip.x + tip.w).toBeLessThanOrEqual(1200)
  expect(tip.y + tip.h).toBeLessThanOrEqual(800)

  // 그리는 중에는 사라진다 — 획이 시작되면 즉시
  await page.mouse.move(400, 400)
  await page.mouse.down()
  expect(await tipVisible(), '그리는 중에는 안 뜬다').toBe(false)
  await page.mouse.up()

  // 손가락 — **안 뜬다**(반증: 같은 자리·같은 시간)
  await hoverTouch('#btn-snap')
  await page.waitForTimeout(900)
  expect(await tipVisible(), '손가락으로는 안 뜬다').toBe(false)
})

test('28-2 ②\' 리본·패널의 모든 단추에 문구가 있다 — 빈 title 없음', async ({ page }) => {
  await boot(page)
  const empty = await page.evaluate(() => {
    const roots = ['#sidebar', '#eyebar', '#topleft', '#display-pop', '#snap-pop', '#pane-file']
    const out: string[] = []
    for (const r of roots) {
      const root = document.querySelector(r)
      if (!root) continue
      for (const b of root.querySelectorAll('button, summary')) {
        const el = b as HTMLElement
        if (el.closest('[hidden]')) continue          // 숨긴 옛 경로(#oldtools)는 화면이 아니다
        const has = (el.getAttribute('title') ?? '').trim() || (el.getAttribute('aria-label') ?? '').trim()
          || (el.textContent ?? '').trim()
        if (!has) out.push(`${r} ${el.id || el.tagName}`)
      }
    }
    return out
  })
  console.log(`[28-2'] 문구 없는 단추: ${empty.length === 0 ? '없음' : empty.join(', ')}`)
  expect(empty).toEqual([])
})

test('28-3 ③ 화면 문구 — 「바꿈」으로 판정한 자리', async ({ page }) => {
  await boot(page)
  const text = async (sel: string) => (await page.textContent(sel))?.trim() ?? ''
  await page.evaluate(() => { (document.getElementById('pane-file') as HTMLDetailsElement).open = true })
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll('#pane-file .head')].map(e => (e.textContent ?? '').trim()))
  console.log(`[28-3] 파일 서랍 머리: ${JSON.stringify(heads)}`)
  // 설명이 화면에서 빠졌다 — 「나가기만 한다」·「다시 연다」는 이제 title이다
  expect(heads).toEqual(['원본 .brnl', '내보내기', '종이'])
  for (const h of heads) expect(h).not.toContain('—')
  expect(await text('#btn-brush')).toBe('질감')          // 상위(「종이」)가 이미 말한 낱말을 뺐다
  // 눈 팝업 — 설명 꼬리가 빠졌다
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('#display-pop label')].map(e => (e.textContent ?? '').trim()))
  console.log(`[28-3] 눈 팝업: ${JSON.stringify(labels)}`)
  expect(labels.some(l => l.includes('밑그림의 H 계열')), '설명이 화면에서 빠졌다').toBe(false)
  expect(labels.some(l => l.startsWith('가린 선(은선)')), '이름은 남았다').toBe(true)
  // 그리고 그 설명은 **툴팁으로 옮겨졌다**(28-2가 읽는다) — 정보를 지우지 않았다
  const t = await page.getAttribute('#display-pop label:has(#chk-hidden)', 'title')
  expect(t ?? '').toContain('H 계열')
  // 전문 용어는 그대로다(순화 ⛔ — 지시 문면)
  await page.click('#btn-snap')
  const snapText = await text('#snap-pop')
  for (const term of ['오스냅', '축 스냅', '소실점']) expect(snapText).toContain(term)
})

test('28-4 ④ 손 리본 순서 — 자 → 연필 → 펜 → 지우개 둘 → 치수 → 롤 둘 → 면', async ({ page }) => {
  await boot(page)
  const order = await page.evaluate(() => {
    const want = ['btn-snap', 'btn-pencil', 'btn-pen', 'btn-eraser-pencil', 'btn-eraser-ink',
      'dim-toggle', 'btn-roll-tracing', 'btn-roll-yellow', 'btn-face']
    const all = [...document.querySelectorAll('#sidebar-body button')]
      .filter(b => !(b as HTMLElement).closest('[hidden]'))
      .map(b => b.id)
    return { seen: all.filter(id => want.includes(id)), want, all }
  })
  console.log(`[28-4] 순서: ${order.seen.join(' → ')}`)
  expect(order.seen).toEqual(order.want)
  // 손가락 표적 크기 무회귀 — 실기기에서 통과한 항목이다(DEVICE-CHECK A5)
  const sizes = await page.evaluate(() =>
    ['btn-snap', 'btn-pencil', 'btn-pen', 'btn-eraser-pencil', 'dim-toggle', 'btn-roll-yellow', 'btn-face']
      .map(id => { const r = document.getElementById(id)!.getBoundingClientRect(); return { id, w: r.width, h: r.height } }))
  console.log(`[28-4] 표적: ${sizes.map(s => `${s.id} ${s.w.toFixed(0)}×${s.h.toFixed(0)}`).join(' · ')}`)
  for (const s of sizes) {
    expect(s.w, `${s.id} 폭`).toBeGreaterThanOrEqual(30)
    expect(s.h, `${s.id} 높이`).toBeGreaterThanOrEqual(30)
  }
})
