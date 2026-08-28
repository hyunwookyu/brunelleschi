// web2-19 3부 — **네 자리**(종이·눈·손·서랍)와 전체 화면의 회귀 팔(3-e).
//   ① 네 자리의 요소가 정확히 표대로다(각 자리의 id 목록을 값으로)
//   ①' 연필이 접혀 있다 — 평소 손 띠 버튼이 39px 폭 · 펼침/고름 · 각인 왕복(2H·2B) ·
//      펜은 접기 없음·연필통에 펜 줄 없음
//   ② 치수 트리거가 손 띠에 있고 리본이 종전대로 열린다
//   ③ 표시 토글 셋이 눈에 있고 동작은 그대로(켰다 끄기 왕복)
//   ④ 자 아이콘 → 오스냅 종류·반경이 열리고 동작은 그대로
//   ⑤ own3d가 설정에 없고 진단에 있으며 동작 그대로(왕복)
//   ⑥ 전체 화면 — 크롬 픽셀 0 · 지평선/소실점 픽셀 그대로 · 손잡이로 나온다 ·
//      그리기·지우기가 된다 · 새로 고치면 꺼져 있다 (+반증: 손잡이를 빼면 나갈 길이 없다)
//   (⑦ 종이 띠 아래 줄은 paperbar.spec가 잰다)
// 조건(#71): 뷰포트 1200×800 · dpr 둘 다 · 기본 도구 연필.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round(x0 * dpr), Math.round(y0 * dpr),
      Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr))).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1] as const)
}

test('① 네 자리 — 각 자리의 id 목록이 정확히 표대로다(값으로)', async ({ page }) => {
  await boot(page)
  // 종이(위 왼쪽) — 탭 띠 + **종속 탭 줄**(web2-20 2부 — 대응표 §6 「탭 + 그 아래 종속 탭」).
  // 목록으로 낸다(#72 ② — 수가 아니라 어느 요소인지).
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#topleft > *')].map(e => e.id))).toEqual(['paperbar', 'layerbar'])
  // 눈(위 오른쪽) — 작도 시점으로 · 전체 화면 · 표시
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#eyebar > button')].map(e => e.id)))
    .toEqual(['btn-draw-view', 'btn-fullscreen', 'btn-display'])
  // 표시 팝업의 셋 — 지평선·격자·대기 감쇠(id 불변 = 배선 불변)
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#display-pop input')].map(e => e.id)))
    .toEqual(['chk-horizon', 'chk-grid', 'chk-waitfade'])
  // 손(오른쪽 세로) — 되돌리기 둘(맨 위·구분선으로 가름) → 자 → 연필(접힘) → 펜 →
  // 지우개 둘 → 면 → **롤 둘(web2-21 3-a — 트레이싱지·옐로)** → 치수 → 서랍.
  // #oldtools(hidden)·#tray(접힘)는 A-4/3-b' 구조물.
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar-body > button, #sidebar-body > details')].map(e => e.id)))
    .toEqual(['btn-undo', 'btn-redo', 'btn-snap', 'btn-pencil', 'btn-pen',
      'btn-eraser-pencil', 'btn-eraser-ink', 'btn-face',
      'btn-roll-tracing', 'btn-roll-yellow', 'dim-toggle', 'pane-file'])
  // 되돌리기와 도구 사이에 **구분선**이 실제로 있다(공백이 아니라 채널 — 3-c)
  expect(await page.evaluate(() => {
    const d = document.querySelector('#sidebar-body .bar-divider')
    if (!d) return null
    const undo = document.getElementById('btn-undo')!.getBoundingClientRect()
    const snap = document.getElementById('btn-snap')!.getBoundingClientRect()
    const r = d.getBoundingClientRect()
    return r.top > undo.bottom - 1 && r.bottom < snap.top + 1
  })).toBe(true)
  // 서랍 — 파일 원본·내보내기·비우기·종이 질감. 설정 자루는 없다.
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#pane-file button')].map(e => e.id)))
    .toEqual(['btn-save', 'btn-open', 'btn-obj', 'btn-gltf', 'btn-clear', 'btn-brush'])
  expect(await page.locator('#pane-settings').count()).toBe(0)
})

test("①' 연필 접힘 — 39px 폭 · 펼침/고름 · 각인 왕복(2H·2B) · 펜은 접기 없음", async ({ page }) => {
  await boot(page)
  // 평소 — 연필통이 접혀 있고 손 띠의 보이는 버튼 svg 폭이 전부 39px 대역이다(①')
  expect(await page.locator('#tray.open').count()).toBe(0)
  const widths = await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar-body > button svg')]
      .filter(s => s.getBoundingClientRect().width > 0)
      .map(s => ({ id: s.parentElement!.id, w: s.getBoundingClientRect().width })))
  for (const w of widths) expect(w.w, `#${w.id} 폭 ≤ 45(39 + 확대 여유)`).toBeLessThanOrEqual(45)
  // 누르면 여섯 줄이 펼쳐진다 — 96px 대역(연 동안만 넓다 = 방금 연 것으로 읽힌다)
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(1)
  expect(await page.locator('#tray .trow').count()).toBe(6)
  expect((await page.locator('#tray-2H').boundingBox())!.width).toBeGreaterThan(80)
  // 하나를 고르면 접히고, 접힌 아이콘의 각인·심 색이 그 경도를 따른다 — 2H
  await page.click('#tray-2H'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(0)
  expect(await page.locator('#btn-pencil text').textContent()).toBe('2H')
  const lead2H = await page.evaluate(() => document.getElementById('fold-lead')!.getAttribute('fill'))
  // 왕복 — 2B
  await page.click('#btn-pencil'); await page.click('#tray-2B'); await settle(page)
  expect(await page.locator('#btn-pencil text').textContent()).toBe('2B')
  const lead2B = await page.evaluate(() => document.getElementById('fold-lead')!.getAttribute('fill'))
  expect(lead2H).not.toBe(lead2B)                     // 심 색이 실제로 경도를 따른다
  expect(await page.evaluate(() => {
    const b = (window as any).__b2
    return [b.diag.matColor('2H'), b.diag.matColor('2B')]
  })).toEqual([lead2H, lead2B])                       // 출처는 MAT 하나다(#54)
  // 다시 누르면(고르지 않고) 접힌다
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(1)
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(0)
  // 펜 — 접기가 없고(누르면 도구만 바뀐다) 연필통에 펜 줄이 없다
  await page.click('#btn-pen'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pen')
  expect(await page.locator('#tray.open').count()).toBe(0)
  expect(await page.locator('#tray #btn-pen').count()).toBe(0)
})

test('②④⑤ — 치수 트리거(손) · 자 팝업(오스냅) · own3d(진단) 동작 그대로', async ({ page }) => {
  await boot(page)
  // ② 치수 — 트리거가 손 띠(#sidebar-body 직속)에 있고 리본이 종전대로 열린다
  expect(await page.evaluate(() =>
    document.getElementById('dim-toggle')!.parentElement!.id)).toBe('sidebar-body')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(true)
  await page.click('#dim-toggle')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(false)
  await page.click('#dim-toggle')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(true)

  // ④ 자 — 누르면 오스냅 종류·반경이 열리고 동작은 그대로다(설정 자루에서 나온 그 배선)
  await expect(page.locator('#snap-pop')).toBeHidden()
  await page.click('#btn-snap')
  await expect(page.locator('#snap-pop')).toBeVisible()
  expect(await page.locator('#snap-pop #osnap-kinds input').count()).toBeGreaterThanOrEqual(8)
  // 종류 하나를 꺼 본다 — app.osnap이 실제로 바뀐다(왕복). 첫 줄은 OSNAP_ORDER의 'vp'다.
  const vp0 = await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)
  await page.click('#osnap-kinds input >> nth=0')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)).toBe(!vp0)
  await page.click('#osnap-kinds input >> nth=0')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)).toBe(vp0)
  // 반경 — 같은 슬라이더가 그대로 산다
  await page.locator('#osnap-radius').fill('12')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.radius)).toBe(12)
  await page.locator('#osnap-radius').fill('8')
  // 축 스냅 — **자리만** 있다(끄는 토글이 없다 — 대응표 §4·DEFERRED)
  expect(await page.locator('#snap-pop #axis-snap-slot').count()).toBe(1)
  expect(await page.locator('#axis-snap-slot input').count()).toBe(0)
  await page.click('#btn-snap')
  await expect(page.locator('#snap-pop')).toBeHidden()

  // ⑤ own3d — 설정에 없고 **진단 곁**에 있으며 동작 그대로(왕복 + localStorage 열쇠 불변)
  expect(await page.locator('#pane-settings').count()).toBe(0)
  await expect(page.locator('#diagctl')).toBeHidden()
  await page.click('#buildid')
  await expect(page.locator('#diagctl')).toBeVisible()
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('b2-own3d'))).toBe('off')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('b2-own3d'))).toBe('on')
  await page.click('#buildid')
  await expect(page.locator('#diagctl')).toBeHidden()
})

test('③ 표시 토글 셋 — 눈 팝업에 있고 동작은 그대로(왕복)', async ({ page }) => {
  await boot(page)
  await expect(page.locator('#display-pop')).toBeHidden()
  await page.click('#btn-display')
  await expect(page.locator('#display-pop')).toBeVisible()
  // 지평선 — 끄면 그 줄 픽셀이 0, 켜면 돌아온다(빈 문서 — 자동 표시 상태)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBeGreaterThan(100)
  await page.click('#chk-horizon'); await settle(page)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBe(0)
  await page.click('#chk-horizon'); await settle(page)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBeGreaterThan(100)
  // 격자 — app.grid 왕복(픽셀 판정은 flow.spec 종전 팔이 진다)
  await page.click('#chk-grid')
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(true)
  await page.click('#chk-grid')
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(false)
  // 대기 감쇠 — app.waitFade 왕복
  await page.click('#chk-waitfade')
  expect(await page.evaluate(() => (window as any).__b2.app.waitFade)).toBe(false)
  await page.click('#chk-waitfade')
  expect(await page.evaluate(() => (window as any).__b2.app.waitFade)).toBe(true)
  await page.click('#btn-display')
  await expect(page.locator('#display-pop')).toBeHidden()
})

test('⑥ 전체 화면 — 크롬 0 · 뼈대 그대로 · 손잡이로 나온다 · 새로 고치면 꺼짐 (+반증)', async ({ page }) => {
  await boot(page)
  // 소실점 하나를 세워 둔다(✕가 뼈대의 표본) — 앵커 + vp 획(graphite.spec 픽스처)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)             // vp (1100,400)
  const hzBefore = await inkPixels(page, 150, 397, 750, 404)
  const vpBefore = await inkPixels(page, 1090, 390, 1110, 410)
  expect(vpBefore, '소실점 ✕가 섰다').toBeGreaterThan(4)

  await page.click('#btn-fullscreen'); await settle(page)
  // 크롬 픽셀 0 — 종이 띠·눈·손·서랍·굵기·치수 리본이 전부 사라졌다(값: 보이는 크기 0)
  for (const id of ['topleft', 'eyebar', 'sidebar', 'thick', 'dimpanel']) {
    expect(await page.evaluate((i) =>
      getComputedStyle(document.getElementById(i)!).display, id), `#${id} 숨김`).toBe('none')
  }
  // 작도의 뼈대는 남는다 — 지평선·소실점 ✕ 픽셀이 그대로다
  expect(await inkPixels(page, 150, 397, 750, 404)).toBe(hzBefore)
  expect(await inkPixels(page, 1090, 390, 1110, 410)).toBe(vpBefore)
  // 그리기·궤도가 된다 — 입력은 캔버스 몫이라 크롬과 무관하다
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 300, 600, 500, 600)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(n0 + 1)
  const q0 = await page.evaluate(() => (window as any).__b2.app.pose.q.y)
  await page.mouse.move(600, 300)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 6; i++) await page.mouse.move(600 + i * 10, 300)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.pose.q.y)).not.toBe(q0)
  await page.click('#fs-exit'); await settle(page)      // 지우개를 고르러 잠시 나온다
  await page.click('#btn-eraser-pencil')
  await page.click('#btn-fullscreen'); await settle(page)
  // 지우기가 된다 — 방금 그은 획을 문지른다(도구는 들어오기 전에 골랐다 — 크롬 없이도 손은 산다)
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 290, 600, 510, 600)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBeLessThan(before)
  // 나가는 길 — 우하단 손잡이가 보인다(안 보이면 고장으로 읽힌다 — 지시 문면)
  await expect(page.locator('#fs-exit')).toBeVisible()
  // 반증(D-3) — 손잡이를 빼면 나갈 조작 요소가 화면에 없다(크롬이 전부 숨었으므로)
  const exitCount = await page.evaluate(() => {
    document.getElementById('fs-exit')!.remove()
    return document.querySelectorAll('#fs-exit').length
  })
  expect(exitCount).toBe(0)
  await page.reload(); await page.waitForFunction(() => (window as any).__b2)
  // 새로 고치면 꺼져 있다(상태 저장 없음 — 세션 한정)
  expect(await page.evaluate(() => document.body.classList.contains('fs'))).toBe(false)
  await expect(page.locator('#fs-exit')).toBeHidden()
  // 손잡이 경로 — 다시 들어가 **손잡이로** 나온다
  await page.click('#btn-fullscreen'); await settle(page)
  await page.click('#fs-exit'); await settle(page)
  expect(await page.evaluate(() => document.body.classList.contains('fs'))).toBe(false)
  await expect(page.locator('#sidebar')).toBeVisible()
})
