// web2-20 2부 — 종속 탭(겹)의 배선판.
//   ① 카메라 닫히기 전 「+」 비활성 + 안내 ② 닫힌 뒤 얹힌다 ③ rect 기본값이 화면과
//   같다(값으로) ④ 새 획이 활성 겹으로 ⑤ 겹 삭제 → 실행취소 → 획이 돌아온다
//   ⑥ 종이를 바꾸면 겹 목록이 바뀐다 ⑦ (state 몫은 layerops.test — 여기서는 배선)
//   + **형태가 가른다**: 종이 탭(배타적)은 **탭이 여럿·겹침 0** · 겹(가산적)은 **요약
//     하나에 수가 붙는다**(상자·수 실측 — 이 UI의 오독 위험을 팔이 형태로 잰다).
// 값 정본은 layerops.test — 여기는 사람 경로(클릭·팝업)가 그 값에 닿는지다.
//
// 6' **web2-25 4부가 겹의 형태를 갈았다**(사람의 문면 「토글 표시가 쓰기 불편하다」):
//   겹쳐 놓은 탭 더미 -> **접으면 요약 · 펼치면 세로 목록**(연필통과 같은 어법).
//   이 파일의 팔이 지키던 요구(「+ 문 · rect 기본값 · 눈·자물쇠가 실제 상태를 민다 ·
//   삭제와 실행취소 · 종이를 바꾸면 줄이 바뀐다」)는 **전부 그대로 유효**하고 **닿는
//   자리만** 옮겼다(#74 3의 판별 물음). 갈린 것은 「자식 탭이 서로 겹친다」 하나이고,
//   그것이 말하던 «가산적»은 이제 **요약의 수**가 말한다.

import { test, expect, type Page } from '@playwright/test'
import { settleSlide } from './slidesettle'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 겹 목록을 편다 — 기본은 **접힘**(요약 하나)이다(web2-25 4-a) */
async function openList(page: Page) {
  if (await page.locator('#layer-list').count() === 0) {
    await page.click('#layer-summary')
    await settle(page)
  }
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 카메라를 닫는 픽스처 — 수평 앵커 + 소실점 획(1점 잠김) */
async function closeCamera(page: Page) {
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
}

test('①② 얹기 문 — 닫히기 전 비활성+안내 · 닫힌 뒤 트레이싱지가 얹힌다', async ({ page }) => {
  await boot(page)
  // ① 빈 문서 — 「+」가 비활성이고 누르면 이유가 한 줄로 보인다(2-a)
  await expect(page.locator('#layer-add')).toHaveClass(/disabled/)
  await page.click('#layer-add'); await settle(page)
  await expect(page.locator('#notice')).toContainText('소실점 작도가 끝나야')
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  // ② 카메라를 닫으면 얹힌다
  await closeCamera(page)
  await expect(page.locator('#layer-add')).not.toHaveClass(/disabled/)
  await page.click('#layer-add'); await settle(page)
  await expect(page.locator('#layer-pop .lpick')).toHaveCount(2)   // 종이 종류 **둘**뿐(지시 0)
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settleSlide(page); await settle(page)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, on: a.doc.layers[0]?.on }
  })
  expect(st.n).toBe(1)
  expect(st.active).not.toBeNull()
  expect(st.on).toBe(true)
  await expect(page.locator('#layer-summary .lsum-n')).toHaveText('1')
  await openList(page)
  await expect(page.locator('#layer-list .lrow')).toHaveCount(1)
})

test('③④ rect 기본값(값으로) · 새 획이 활성 겹으로 · 켬/끔·잠금 표식', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]'); await settleSlide(page); await settle(page)
  // ③ rect = 지금 화면에서 **짧은 변 5% 인셋 + 층별 흔들림**(web2-21 3-b — 종전 «화면
  // 전체»는 필터로 보였다). 값 정본은 layerops.test — 여기서는 배선이 그 규약에 닿는지
  // (뷰 항등 s1·o0: 인셋 40 · 이동 ±6 · 크기 ±4).
  const rect = await page.evaluate(() => (window as any).__b2.app.doc.layers[0].rect)
  expect(rect.x).toBeGreaterThanOrEqual(34); expect(rect.x).toBeLessThanOrEqual(46)
  expect(rect.y).toBeGreaterThanOrEqual(34); expect(rect.y).toBeLessThanOrEqual(46)
  expect(1200 - rect.w).toBeGreaterThanOrEqual(70); expect(1200 - rect.w).toBeLessThanOrEqual(90)
  expect(800 - rect.h).toBeGreaterThanOrEqual(70); expect(800 - rect.h).toBeLessThanOrEqual(90)
  // ④ 새 획이 활성 겹으로
  await drawLine(page, 300, 620, 500, 640)
  const last = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { layer: s.layer, active: a.activeLayer }
  })
  expect(last.layer).toBe(last.active)
  // 켬/끔 — 눈 표식이 실제 상태를 민다(배선). 자리가 **목록의 줄 안**으로 옮겨 왔다.
  await openList(page)
  await page.click('#layer-list .lrow .leye'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].on)).toBe(false)
  expect(await page.evaluate(() => (window as any).__b2.app.activeLayer)).toBeNull()
  await page.click('#layer-list .lrow .leye'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].on)).toBe(true)
  // 잠금 — 배선(값은 layerops.test)
  await page.click('#layer-list .lrow .llock'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].locked)).toBe(true)
  await page.click('#layer-list .lrow .llock'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers[0].locked)).toBe(false)
})

test('롤 둘(web2-21 3-a) — 닫히기 전 비활성+안내 · 누르면 그 종이가 얹히고 활성', async ({ page }) => {
  await boot(page)
  // ② 카메라 닫히기 전 — 비활성(흐림)이고 누르면 이유가 보인다
  await expect(page.locator('#btn-roll-tracing')).toHaveClass(/disabled/)
  await expect(page.locator('#btn-roll-yellow')).toHaveClass(/disabled/)
  await page.click('#btn-roll'); await page.click('#btn-roll-tracing'); await settle(page)
  await expect(page.locator('#notice')).toContainText('소실점 작도가 끝나야')
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  // ① 닫힌 뒤 — 트레이싱지 롤 → 한 장 얹히고 활성 · 옐로 롤 → 옐로가 얹힌다
  await closeCamera(page)
  await expect(page.locator('#btn-roll-tracing')).not.toHaveClass(/disabled/)
  await page.click('#btn-roll'); await page.click('#btn-roll-tracing'); await settle(page)
  let st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, paper: a.doc.layers[0]?.paper }
  })
  expect(st.n).toBe(1)
  expect(st.paper).toBe('tracing')
  expect(st.active).not.toBeNull()
  await page.click('#btn-roll'); await page.click('#btn-roll-yellow'); await settle(page)
  st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { n: a.doc.layers.length, active: a.activeLayer, paper: a.doc.layers[1]?.paper }
  })
  expect(st.n).toBe(2)
  expect(st.paper).toBe('yellow')
  // 겹 요약도 함께 민다(layerbar.sync 배선)
  await expect(page.locator('#layer-summary .lsum-n')).toHaveText('2')
})

// ── web2-34 2번 전수 점검이 찾은 둘째 R6 위반 ────────────────────────────────
// 34-0 전수 대조표와 DECISIONS의 R6 절이 둘 다 「겹 요약은 **이미 지킨다**」로 적어 뒀는데
// **실측이 뒤집었다**(D-4 — 사람이 준 근거는 확인 대상이지 결론이 아니다): 요약의 롤은
// **맨 위 겹**을 그리고 있었고, 아래 겹을 골라 두면 접힌 통이 「지금 무엇에 그리는가」를
// 틀리게 말했다. 연필의 각인·펜의 촉 각인과 같은 요구다.
test('R6 접힌 겹 요약 — 롤이 **지금 그리는 겹**을 말한다(맨 위가 아니다) · 반증 포함',
  async ({ page }) => {
    await boot(page)
    await closeCamera(page)
    // 아래=트레이싱지 · 위=옐로. 얹은 직후의 활성은 맨 위(옐로)다.
    await page.click('#layer-add')
    await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settleSlide(page); await settle(page)
    await page.click('#layer-add')
    await page.click('#layer-pop .lpick[data-paper="yellow"]'); await settleSlide(page); await settle(page)
    const read = () => page.evaluate(() => {
      const sum = document.getElementById('layer-summary')!
      return {
        active: (window as any).__b2.app.activeLayer as number | null,
        shown: sum.dataset.paper!, n: sum.dataset.active!,
        // 옐로 롤만 고리를 `#e9d98a`로 채운다 — 그림 자체가 어느 종이인지 말한다
        yellowInk: sum.querySelector('svg')!.outerHTML.includes('e9d98a'),
        count: sum.querySelector('.lsum-n')!.textContent,
      }
    })
    const a = await read()
    console.log(`[34-2 겹] 얹은 직후 — ${JSON.stringify(a)}`)
    expect(a.shown).toBe('yellow'); expect(a.yellowInk).toBe(true); expect(a.n).toBe('2')

    // **아래 겹(트레이싱지)을 고르고 통을 접는다** — 여기가 종전에 틀리던 자리다
    await openList(page)
    const bottomId = await page.evaluate(() => (window as any).__b2.app.doc.layers[0]!.id as number)
    await page.click(`#layer-list .lrow[data-layer="${bottomId}"]`); await settle(page)
    await page.click('#layer-summary'); await settle(page)          // 다시 접는다
    expect(await page.locator('#layer-list').count(), '접혔다').toBe(0)
    const b = await read()
    console.log(`[34-2 겹] 아래 겹을 고른 뒤 — ${JSON.stringify(b)}`)
    expect(b.active, '활성이 실제로 아래 겹이다').toBe(bottomId)
    expect(b.shown, '접힌 요약이 지금 그리는 겹을 말한다').toBe('tracing')
    expect(b.yellowInk, '그림도 따라간다 — 옐로의 색이 빠진다').toBe(false)
    expect(b.n).toBe('1')
    expect(b.count, '수는 그대로 «장수»다(다른 채널 — #77 ㉠)').toBe('2')
    expect(await page.getAttribute('#layer-summary', 'title'))
      .toContain('1번에 그린다')

    // **반증(D-3)** — 옛 배선(맨 위 겹을 그린다)을 같은 자리에 되돌리면 빨개진다
    const old = await page.evaluate(() => {
      const layers = (window as any).__b2.app.doc.layers
      const top = layers[layers.length - 1]
      return { paper: top.paper as string, n: layers.length }
    })
    console.log(`[34-2 겹 반증] 옛 배선(맨 위 겹)이 그렸을 값 = ${old.paper}/${old.n}번 · `
      + `지금 값 = ${b.shown}/${b.n}번 — 둘이 갈린다`)
    expect(old.paper, '반증: 옛 배선이면 이 팔이 실제로 빨개진다').not.toBe(b.shown)
  })

test('⑤ 겹 삭제(줄의 × → 확인 — 획 수 알림) → 실행취소로 돌아온다', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settleSlide(page); await settle(page)
  await drawLine(page, 300, 620, 500, 640)
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 지우기의 자리가 **목록의 줄 안**으로 옮겨 왔다(확인 한 번의 규약은 그대로 — 획 수를 알린다)
  await openList(page)
  await page.click('#layer-list .lrow .ldel'); await settle(page)
  await expect(page.locator('#layer-pop')).toContainText('획 1개')   // 확인 문구가 수를 알린다
  await page.click('#layer-pop u[data-pick="yes"]'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(before - 1)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(0)
  await page.click('#btn-undo'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(before)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.layers.length)).toBe(1)
})

test('⑥ 종이를 바꾸면 겹 목록이 바뀐다 · 형태 — 종이는 탭이 여럿 ↔ 겹은 요약 하나+수', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  // 겹 둘(트레이싱지·옐로) — 자식 탭의 겹침을 잰다
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="tracing"]'); await settleSlide(page); await settle(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]'); await settleSlide(page); await settle(page)
  // **형태가 가른다**(web2-25 4-a로 갈렸다): 겹은 «가산적»이라 **요약 하나에 수**가 붙고,
  // 종이는 «배타적»이라 **탭이 여럿이고 서로 안 겹친다**. 옛 판의 「자식 탭이 겹친다」가
  // 말하던 것을 이 수가 이어받는다.
  await expect(page.locator('#layer-summary')).toHaveCount(1)
  await expect(page.locator('#layer-summary .lsum-n')).toHaveText('2')
  await openList(page)
  await expect(page.locator('#layer-list .lrow')).toHaveCount(2)
  const parent = await page.evaluate(() =>
    [...document.querySelectorAll('#paperbar .ptab[data-sheet]')].map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, w: r.width }
    }))
  if (parent.length >= 2) {
    expect(parent[0]!.x + parent[0]!.w).toBeLessThanOrEqual(parent[1]!.x + 0.5)
  }
  await page.click('#paper-add')
  await page.keyboard.press('Escape'); await settle(page)
  await expect(page.locator('#layer-summary')).toHaveCount(0)
  await expect(page.locator('#layer-list')).toHaveCount(0)
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  await expect(page.locator('#layer-summary .lsum-n')).toHaveText('2')
})
