// web2-30 — 손으로 찾은 것들의 **화면 게이트**.
//   30-2  펜 굵기: 슬라이더를 없애고 촉으로
//   30-3  펼침은 겹쳐 뜬다 — 리본이 길이를 바꾸지 않는다 · 빌드 식별자는 입력을 안 받는다
//   30-4  되돌릴 수 없는 것을 묻는 자리에서는 **대상을 밝힌다**
//   30-10 설정 자리 — 필압 보정이 눈에서 나왔다
//
// D-2(재현): 30-3 ①은 수리 전에 **실패한다** — 통을 펼치면 리본 버튼의 중심이 아래로
//   밀렸고, 그래서 「누르려던 자리에서 버전 표시가 눌린다」가 났다(사람 관측).
// D-3(반증): 각 팔이 갈리는 조건을 함께 든다 — 30-3 ①은 «통이 실제로 펼쳐졌다»를 같은
//   실행에서 확인하고(안 펼쳐지면 「안 움직였다」는 늘 참이다), 30-4는 **얹은 겹이 없는**
//   종이에서 그 문장이 **안 붙는 것**을 먼저 잰다.

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

/** 리본(#sidebar)의 모든 버튼 중심 — 통을 열기 전후로 **바뀌면 안 된다** */
const ribbonCenters = (page: Page) => page.evaluate(() => {
  const out: Record<string, [number, number]> = {}
  for (const b of document.querySelectorAll('#sidebar button, #sidebar summary')) {
    const el = b as HTMLElement
    if (el.closest('#tray, #pentray, [hidden]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    out[el.id || (el.getAttribute('aria-label') ?? '?')] = [r.left + r.width / 2, r.top + r.height / 2]
  }
  return out
})

const rectsOf = (page: Page, sel: string) => page.evaluate((s) =>
  [...document.querySelectorAll(s)].map(e => {
    const r = (e as HTMLElement).getBoundingClientRect()
    return { id: (e as HTMLElement).id, x: r.left, y: r.top, w: r.width, h: r.height }
  }), sel)

/** 상자 하나 — 카메라를 닫는다(겹·종이 얹기가 열린다) */
async function closeCamera(page: Page) {
  for (const seg of [[280, 560, 700, 560], [500, 560, 800, 480], [500, 560, 500, 660]] as const) {
    const [ax, ay, bx, by] = seg
    await page.mouse.move(ax, ay)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6)
    await page.mouse.up()
  }
  await settle(page)
}

/** 종이 탭을 길게 눌러 팝업을 연다(web2-20 2-c의 몸짓 — paperbar.spec과 같은 길).
 *
 *  ⚠ **앞선 탭 누름과 «두 번 탭»으로 짝지어지지 않게 끊는다.** 두 번 탭은 이름 편집을
 *  여는데(paperbar.ts `dblclick`), 편집 입력이 떠 있으면 팝오버의 「지운다」를 누르는
 *  순간 그 입력이 blur → commit → **render → closePop**이라 팝오버가 통째로 사라진다.
 *  초판이 그렇게 걸렸고, 원인은 추측이 아니라 **표식**이 냈다(D-1: `#paper-pop`의 제거에
 *  스택을 걸었더니 `HTMLInputElement.commit → render → closePop`이 나왔다). */
async function longPressTab(page: Page, sheetId: number) {
  await page.waitForTimeout(600)
  if (await page.locator('.ptab-edit').count()) {
    await page.keyboard.press('Escape')
    await settle(page)
  }
  const tab = page.locator(`#paperbar .ptab[data-sheet="${sheetId}"]`)
  const b = (await tab.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await settle(page)
}

// ── 30-3 ────────────────────────────────────────────────────────────────
test('30-3 ① 통을 펼쳐도 리본의 모든 버튼 중심이 **그대로**다 (연필통·펜 촉통 둘 다)', async ({ page }) => {
  await boot(page)
  const before = await ribbonCenters(page)
  expect(Object.keys(before).length, '분해능 — 리본에 버튼이 실제로 있다').toBeGreaterThan(8)

  for (const [btn, tray] of [['#btn-pencil', '#tray'], ['#btn-pen', '#pentray']] as const) {
    await page.click(btn)
    await settle(page)
    const rows = await rectsOf(page, `${tray} button`)
    expect(rows.length, `${tray}가 실제로 펼쳐졌다`).toBeGreaterThan(0)
    expect(rows.every(r => r.w > 0 && r.h > 0), '줄이 실제로 보인다').toBe(true)

    const after = await ribbonCenters(page)
    const moved = Object.keys(before).filter(k =>
      !after[k] || Math.abs(after[k]![0] - before[k]![0]) > 0.01 || Math.abs(after[k]![1] - before[k]![1]) > 0.01)
    console.log(`[30-3 ①] ${tray} 펼침 — 줄 ${rows.length} · 움직인 버튼 ${moved.length} ${JSON.stringify(moved)}`)
    expect(moved, '리본 안의 무엇도 리본의 길이를 바꾸지 않는다').toEqual([])

    const vp = page.viewportSize()!
    for (const r of rows) {
      expect(r.y, `${r.id} 위쪽`).toBeGreaterThanOrEqual(0)
      expect(r.y + r.h, `${r.id} 아래쪽`).toBeLessThanOrEqual(vp.height)
      expect(r.x, `${r.id} 왼쪽`).toBeGreaterThanOrEqual(0)
    }
    await page.click(btn)   // 접는다
    await settle(page)
  }
})

test('30-3 ② 아래쪽 앵커에서 열어도 통이 화면 안이다 · 리본이 화면 밖으로 안 나간다', async ({ page }) => {
  await boot(page)
  const vp = page.viewportSize()!
  // 연필통은 여섯 줄이라 아래쪽 앵커에서 가장 잘 넘친다 — 앵커를 화면 맨 아래로 몬다
  await page.evaluate(() => {
    const b = document.getElementById('btn-pencil')!
    b.style.position = 'fixed'
    b.style.right = '2px'
    b.style.bottom = '0px'
    b.style.top = 'auto'
  })
  await page.click('#btn-pencil')
  await settle(page)
  const rows = await rectsOf(page, '#tray button')
  const lo = Math.min(...rows.map(r => r.y))
  const hi = Math.max(...rows.map(r => r.y + r.h))
  console.log(`[30-3 ②] 아래쪽 앵커 — 통 세로 ${lo.toFixed(1)}..${hi.toFixed(1)} / 화면 ${vp.height}`)
  expect(lo).toBeGreaterThanOrEqual(0)
  expect(hi).toBeLessThanOrEqual(vp.height)

  const bar = await rectsOf(page, '#sidebar')
  expect(bar[0]!.y).toBeGreaterThanOrEqual(0)
  expect(bar[0]!.y + bar[0]!.h).toBeLessThanOrEqual(vp.height)
})

test('30-3 별건 — 빌드 식별자는 **입력을 안 받는다** (+반증: 진단은 설정에서 열린다)', async ({ page }) => {
  await boot(page)
  const pe = await page.evaluate(() => getComputedStyle(document.getElementById('buildid')!).pointerEvents)
  console.log(`[30-3 별건] #buildid pointer-events = ${pe}`)
  expect(pe).toBe('none')

  // 통이 열린 상태에서 그 자리를 눌러도 반응이 없다
  await page.click('#btn-pencil')
  await settle(page)
  const box = (await rectsOf(page, '#buildid'))[0]!
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await settle(page)
  expect(await page.evaluate(() => (document.getElementById('diagpanel') as HTMLElement).hidden),
    '빌드 식별자를 눌러도 진단이 안 열린다').toBe(true)

  // 반증 — 판독 통로 자체는 살아 있다(설정 → 진단). 없어지면 태블릿에 통로가 없다.
  await page.click('#pane-settings > summary')
  await page.click('#btn-diag')
  await settle(page)
  expect(await page.evaluate(() => (document.getElementById('diagpanel') as HTMLElement).hidden)).toBe(false)
  expect((await page.textContent('#diagpanel'))!.length).toBeGreaterThan(20)
})

// ── 30-2 ────────────────────────────────────────────────────────────────
test('30-2 슬라이더가 사라졌다 · 다섯 촉 · 견본 == 그은 선 · 고르면 접힌다', async ({ page }) => {
  await boot(page)
  await page.click('#btn-pen')
  await settle(page)
  // ⚠ **web2-34 3번이 막대를 통째로 지웠다**(화면 규칙 R1을 지우개로 쓸어냈다) — 30-2가
  //   지키던 요구(「펜에는 굵기 슬라이더가 없다」)는 그대로 유효하고 **더 세졌다**:
  //   `display:none`을 묻던 자리에서 이제 **DOM에 없다**를 묻는다(#75 ㉣ — 그 팔이
  //   무엇을 묻고 있었는지를 다시 적는다). 지우개 판은 `ui34.spec` ①이 잰다.
  const thickCount = await page.locator('#thick').count()
  console.log(`[30-2] #thick 요소 수 = ${thickCount} (web2-34 3번에 사라졌다)`)
  expect(thickCount, '굵기 슬라이더가 어디에도 없다').toBe(0)

  const nibs = await page.evaluate(() =>
    [...document.querySelectorAll('#pentray button')].map(e => ({
      id: (e as HTMLElement).id,
      mm: Number((e as HTMLElement).dataset.nibMm),
      px: Number((e as HTMLElement).dataset.nibPx),
      sample: Number((e.querySelector('.nsample') as SVGRectElement).getAttribute('height')),
    })))
  console.log(`[30-2] 촉 ${nibs.length} — ${nibs.map(n => `${n.mm}mm=${n.px}px`).join(' · ')}`)
  expect(nibs.map(n => n.mm)).toEqual([0.18, 0.25, 0.35, 0.5, 0.7])
  // 「1:1」 — 견본이 선언한 굵기와 그어질 선의 굵기가 **같은 값**이다(선폭은 화면 고정 · 원칙 e)
  for (const n of nibs) expect(n.sample).toBeCloseTo(n.px, 6)

  for (const n of nibs) {
    await page.click(`#${n.id}`)
    await settle(page)
    expect(await page.evaluate(() => document.getElementById('pentray')!.classList.contains('open')),
      '고르면 통이 접힌다').toBe(false)
    const nib = await page.evaluate(() => (window as any).__b2.app.nib)
    expect(nib).toBeCloseTo(n.px, 6)

    await page.mouse.move(300, 300)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(300 + 30 * i, 300 + 8 * i)
    await page.mouse.up()
    await settle(page)
    // ⚠ 굵기의 출처는 **`widthOfMat`**이다(#54) — 기본 촉(0.35 mm = 1.5 px)이면 `mat.w`가
    //    아예 없고 `MAT.INK.width`로 떨어진다. 팔이 `mat.w`만 읽으면 그 한 줄에서 undefined다.
    const drawn = await page.evaluate(() => {
      const b2 = (window as any).__b2
      const d = b2.app.doc
      return b2.widthOfMat(d.strokes[d.strokes.length - 1].mat) as number
    })
    console.log(`[30-2] ${n.mm}mm — 견본 ${n.sample} · app.nib ${nib} · 그은 선 ${drawn}`)
    expect(drawn, '견본의 굵기 == 그어진 선의 굵기').toBeCloseTo(n.sample, 6)

    await page.click('#btn-pen')   // 다음 촉을 고르려고 통을 다시 편다
    await settle(page)
  }
})

// ── 30-10 ───────────────────────────────────────────────────────────────
test('30-10 설정 자리 — 눈에 필압 보정이 없고, 설정에서 켜고 끌 수 있다', async ({ page }) => {
  await boot(page)
  await page.click('#btn-display')
  await settle(page)
  const eyeText = (await page.textContent('#display-pop')) ?? ''
  console.log(`[30-10] 눈 팝업 문구 "${eyeText.replace(/\s+/g, ' ').trim()}"`)
  expect(eyeText).not.toContain('필압')
  expect(await page.locator('#display-pop #chk-press').count()).toBe(0)

  await page.click('#pane-settings > summary')
  await settle(page)
  expect(await page.locator('#pane-settings #chk-press').count(), '설정에 있다').toBe(1)

  await page.click('#chk-press')   // ⚠ `check()`는 못 쓴다 — 상자가 도로 꺼지는 것이 설계다(30-7 ④)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.pressCalib !== null)).toBe(true)
  // 상태 토글이므로 **패널이 안 접힌다**(28-1)
  expect(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open)).toBe(true)

  await page.click('#btn-press-cancel')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.pressCalib)).toBe(null)
})

// ── 30-4 ────────────────────────────────────────────────────────────────
test('30-4 되돌릴 수 없는 물음은 **대상을 밝힌다** (+반증: 얹은 것이 없으면 그 말이 없다)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await page.click('#paper-add')
  await settle(page)
  const ids = await page.evaluate(() =>
    ((window as any).__b2.app.doc.sheets as { id: number }[]).map(s => s.id))
  const target = ids[ids.length - 1]!

  // 반증(D-3) 먼저 — **얹은 겹이 없으면** 「함께 지워진다」가 **안 붙는다**
  await longPressTab(page, target)
  await page.click('#paper-pop u[data-pick="delete"]')
  await settle(page)
  const bare = (await page.textContent('.paper-confirm'))!
  console.log(`[30-4 반증] 겹 없음 — "${bare.replace(/\s+/g, ' ').trim()}"`)
  expect(bare).toContain('지운다')
  expect(bare).not.toContain('함께 지워진다')
  await page.mouse.click(600, 300)   // 팝업 밖 — 닫는다
  await settle(page)

  // 겹을 하나 얹고 그 위에 획을 그린다
  await page.click(`#paperbar .ptab[data-sheet="${target}"]`)
  await settle(page)
  await page.click('#btn-roll'); await page.click('#btn-roll-yellow')
  await settle(page)
  await page.mouse.move(400, 300)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(400 + 20 * i, 300 + 6 * i)
  await page.mouse.up()
  await settle(page)
  const onLayer = await page.evaluate(() =>
    ((window as any).__b2.app.doc.strokes as { layer?: number }[]).filter(s => s.layer !== undefined).length)
  expect(onLayer, '분해능 — 겹 위에 획이 실제로 올라갔다').toBeGreaterThan(0)

  await longPressTab(page, target)
  await page.click('#paper-pop u[data-pick="delete"]')
  await settle(page)
  const said = (await page.textContent('.paper-confirm'))!
  console.log(`[30-4] 겹 있음 — "${said.replace(/\s+/g, ' ').trim()}"`)
  expect(said).toContain('옐로')
  expect(said).toContain('함께 지워진다')
  expect(said).toMatch(/획 \d+개/)
})
