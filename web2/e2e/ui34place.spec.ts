// web2-34 6번 — **배치 재편**의 게이트. 「31이 더할 것을 미리 셈에 넣는다」
//
// 가르는 축은 「제도용구인가」가 아니라 **「그리는 중에 쓰는가」**다(지시 문면):
//   그리는 중에 쓴다   → 손 띠(세로바). **시점 조작도 여기다** — 그리면서 계속 쓴다
//   그리는 중에 안 쓴다 → 위 띠(#eyebar). 파일 · 설정 · 내보내기
//
// 재는 것 넷:
//   ① 자리 표 — 어느 것이 어느 띠에 있는가(값으로 · #72 ②)
//   ② 높이 예산 — 재편 뒤 남는 여유가 **버튼 두 개분** 이상인가
//   ③ **시험 삽입** — 31의 두 버튼을 실제로 넣어도 안 넘친다
//   ④ 표적 크기 무회귀 — 실기기에서 통과한 항목이다(줄이지 않는다)
//
// ⚠ 조건(#71): 뷰포트 1200×800 · dpr 둘 다. 예산은 **뷰포트가 정하는 수**라 이 크기에서만
//   같은 값이 나온다 — 원장에 뷰포트를 같이 싣는다.
import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 세로바의 높이 예산 — 띠의 아래 끝과 뷰포트 사이가 «남는 여유»다. */
const budget = (page: Page) => page.evaluate(() => {
  const b = document.getElementById('sidebar')!.getBoundingClientRect()
  return { vh: window.innerHeight, top: +b.top.toFixed(1), h: +b.height.toFixed(1),
           bottom: +b.bottom.toFixed(1), slack: +(window.innerHeight - b.bottom).toFixed(1) }
})

test('34-6 ① 자리 표 — 「그리는 중에 쓰는가」로 갈렸다 (값으로)', async ({ page }) => {
  await boot(page)
  const zones = await page.evaluate(() => ({
    top: [...document.querySelectorAll('#eyebar > button, #eyebar > details')].map(e => e.id),
    hand: [...document.querySelectorAll('#sidebar-body > button, #sidebar-body > details')].map(e => e.id),
  }))
  console.log(`[34-6 ①] 위 띠: ${zones.top.join(' · ')}`)
  console.log(`[34-6 ①] 손 띠: ${zones.hand.join(' · ')}`)
  // 위 띠 = 그리는 중에 **안** 쓰는 것. 「작도 시점으로」는 여기서 빠졌다.
  expect(zones.top).toEqual(['btn-fullscreen', 'btn-display', 'pane-file', 'pane-settings'])
  // 손 띠 = 그리는 중에 쓰는 것. **시점이 맨 위**이고 롤 둘이 롤통 하나가 됐다.
  expect(zones.hand).toEqual(['btn-draw-view', 'btn-zoom-fit', 'btn-lens', 'btn-undo', 'btn-redo', 'btn-snap',
    'btn-pencil', 'btn-pen', 'btn-eraser-pencil', 'btn-eraser-ink',
    'dim-toggle', 'btn-roll', 'btn-face'])
  // 뷰 큐브는 **단추가 아니다** — 이미 캔버스 그림쇠다(자리를 안 먹는다).
  expect(await page.locator('#btn-viewcube').count(), '뷰 큐브 단추는 없다(캔버스 그림쇠다)').toBe(0)
  const cube = await page.evaluate(() => (window as any).__b2.app.cubeLayout)
  console.log(`[34-6 ①] 뷰 큐브(캔버스) cx ${cube.cx} · cy ${cube.cy} · size ${cube.size}`)
  expect(cube.size).toBeGreaterThan(0)
})

test('34-6 ②③ 높이 예산 — 여유가 버튼 두 개분 이상이고, 31의 둘을 넣어도 안 넘친다', async ({ page }, testInfo) => {
  await boot(page)
  const before = await budget(page)
  console.log(`[34-6 ②] 재편 후 — 띠 높이 ${before.h} / 뷰포트 ${before.vh} · 남는 여유 ${before.slack}px`)
  expect(before.bottom, '세로바가 화면 안이다').toBeLessThanOrEqual(before.vh)

  // 「버튼 하나」의 자 — 이 앱에서 가장 큰 정사각 단추(`.ico-sq` 39px + 누름 여유 6)
  const unit = await page.evaluate(() =>
    +document.getElementById('btn-snap')!.getBoundingClientRect().height.toFixed(1))
  const gap = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.getElementById('sidebar-body')!).rowGap) || 0)
  const two = unit * 2 + gap * 2
  console.log(`[34-6 ②] 버튼 하나 ${unit}px · 사이 ${gap}px → 두 개분 ${two}px`)

  // ⚠⚠ **31이 그 여유를 쓰기 시작했다 — 그러니 「남는 여유」로 물으면 안 된다**(#88).
  //   34-6이 등록한 요구는 「**31의 둘이 들어갈 자리가 있는가**」이고, 그 둘 중 하나가 실물로
  //   서면(web2-31 3번 `btn-zoom-fit`) 그만큼 여유가 준다 — 문면을 그대로 두면 **자리를 제대로
  //   내주고도 빨개진다.** 그래서 재는 것을 **대상에서 유도한다**: 「31이 이미 먹은 자리」를
  //   실측해 되돌린 것이 34-6이 물었던 그 여유다(임계 92px은 **한 톨도 안 무른다**).
  //   ⚠ 목록에 **이름**을 적지 px를 적지 않는다 — 급이 바뀌면 실측이 따라온다.
  // ⚠⚠ **31의 둘이 이제 다 실물이다**(web2-31 2번이 렌즈를 넣었다) — 그래서 아래 ③의
  //   시험 삽입은 **0개**가 되고, 그것이 이 팔의 «둘을 넣어 본다»가 끝났다는 뜻이다.
  //   문면(임계 92px)은 한 톨도 안 무른다: 되돌린 여유 `slack0`가 여전히 버튼 두 개분 이상인가.
  const PLACED_BY_31 = ['btn-zoom-fit', 'btn-lens']
  const taken31 = await page.evaluate((ids) => ids.reduce((sum, id) => {
    const e = document.getElementById(id)
    if (!e) return sum
    const body = document.getElementById('sidebar-body')!
    const g = parseFloat(getComputedStyle(body).rowGap) || 0
    return sum + e.getBoundingClientRect().height + g
  }, 0), PLACED_BY_31)
  const slack0 = +(before.slack + taken31).toFixed(1)
  console.log(`[34-6 ②] 31이 이미 먹은 자리 ${taken31.toFixed(1)}px (${PLACED_BY_31.join('·')}) → 되돌린 여유 ${slack0}px`)
  expect(before.slack, '지금도 화면 안이다(여유 0 이상)').toBeGreaterThanOrEqual(0)
  expect(slack0, '31의 둘이 들어갈 자리가 있었다 — 버튼 두 개분 이상').toBeGreaterThanOrEqual(two)

  // ── ③ **시험 삽입** — 31이 더할 둘을 실제로 넣어 본다 ─────────────────────
  // 뷰 큐브는 캔버스 그림쇠라 자리를 안 먹지만, 34-6의 문면대로 **둘 다** 넣어 잰다.
  // ⚠ **web2-31 3번이 들어온 뒤로 이 삽입은 «더 보수적»이다**: 돋보기가 이미 실물로 서 있고
  //   (`btn-zoom-fit` · `.ico-m`) 뷰 큐브는 끝내 단추가 안 됐으므로, 여기 넣는 `.ico-sq` 둘은
  //   실제로 남은 것보다 큰 부담이다. 그래도 **문면을 안 고친다** — 34-6이 등록한 예산 팔이고,
  //   지금 실측되는 여유는 `zoom31_web2_dpr*.json`의 `place_*`가 따로 낸다.
  const after = await page.evaluate((placed) => {
    const body = document.getElementById('sidebar-body')!
    const first = body.firstElementChild
    // 이미 실물로 선 것만큼은 덜 넣는다 — 「둘을 넣는다」의 뜻이 «둘이 서 있다»이기 때문이다
    for (const id of ['zz-probe-cube', 'zz-probe-zoom'].slice(placed)) {
      const b = document.createElement('button')
      b.id = id
      b.className = 't ico-sq'
      b.innerHTML = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="18" height="18"/></svg>'
      body.insertBefore(b, first)
    }
    const r = document.getElementById('sidebar')!.getBoundingClientRect()
    const out = { h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1),
                  slack: +(window.innerHeight - r.bottom).toFixed(1),
                  // 실물이 둘 다 서면 시험 삽입이 **0개**다 — 그때 이 칸은 null이고
                  // 그것이 「둘을 넣어 본다」가 끝났다는 사실이다(#88: 실측에서 유도한다).
                  probe: ((e) => e ? +e.getBoundingClientRect().height.toFixed(1) : null)(
                    document.getElementById('zz-probe-cube') ?? document.getElementById('zz-probe-zoom')) }
    for (const id of ['zz-probe-cube', 'zz-probe-zoom']) document.getElementById(id)?.remove()
    return out
  }, PLACED_BY_31.length)
  console.log(`[34-6 ③] 시험 삽입 ${2 - PLACED_BY_31.length}개(각 ${after.probe ?? '—'}px) → 띠 ${after.h} · 남는 여유 ${after.slack}px`
    + `${after.probe === null ? ' · **31의 둘이 실물로 다 섰다**(zoom-fit · lens)' : ''}`)
  expect(after.slack, '31의 두 버튼을 넣어도 화면 안이다').toBeGreaterThanOrEqual(0)
  // 되돌아왔는가(계측이 화면을 안 남긴다)
  const back = await budget(page)
  expect(back.h).toBeCloseTo(before.h, 1)

  // ── ④ 표적 크기 무회귀 ────────────────────────────────────────────────────
  const targets = await page.evaluate(() =>
    ['btn-draw-view', 'btn-zoom-fit', 'btn-undo', 'btn-snap', 'btn-pencil', 'btn-pen',
     'btn-eraser-pencil', 'btn-eraser-ink', 'dim-toggle', 'btn-roll', 'btn-face']
      .map(id => { const r = document.getElementById(id)!.getBoundingClientRect(); return { id, w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }))
  console.log(`[34-6 ④] 표적: ${targets.map(t => `${t.id} ${t.w}×${t.h}`).join(' · ')}`)
  for (const t of targets) {
    expect(t.w, `${t.id} 폭`).toBeGreaterThanOrEqual(30)
    expect(t.h, `${t.id} 높이`).toBeGreaterThanOrEqual(30)
  }

  if (process.env.LEDGER === '1') {
    const dpr = testInfo.project.name
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, `place34_web2_${dpr}.json`), JSON.stringify({
      what: 'web2-34 6번 — 세로바 높이 예산과 31의 시험 삽입. 뷰포트 1200×800에서만 같은 값이 나온다(#71).',
      measured_at: 'web2-34 6번 (2026-08-30)',
      viewport: { w: 1200, h: before.vh }, dpr,
      before_this_round: { slack_px: 25, note: '재편 전 실측(같은 하네스·같은 뷰포트). DEFERRED가 적은 「37px」은 web2-32 시점의 값이고 34-3까지 오면서 25px로 줄어 있었다.' },
      after: before, unit_button_px: unit, two_buttons_px: two,
      /** web2-31 3번이 이 여유를 쓰기 시작했다 — 위 `after.slack`은 «지금 남은 것»이고
       *  34-6이 물었던 값은 그것을 되돌린 `slack_without_31`이다(#88: 대상에서 유도한다). */
      placed_by_31: PLACED_BY_31, taken_by_31_px: +taken31.toFixed(1), slack_without_31: slack0,
      /** 값 대조의 자리(#33) — `gate.reachability_source`가 이 경로를 가리킨다. */
      slack_before_after: [25, before.slack],
      probe_insert: after,
      gate: {
        slack_ge_two_buttons: before.slack >= two,
        insert_fits: after.slack >= 0,
        /** 이 기준을 **넘을 수 있는 값**(#35) — 재편 전 실측이 그 반대쪽이다. */
        /** **무엇이 이 기준을 넘을 수 있는가**(#35) — 이 팔은 «자리가 있는가»를 묻고
         *  넘는 것은 **재편을 되돌리는 것**이다. 셋 중 하나만 되돌려도 통과선 아래로 간다:
         *  파일·설정을 손 띠로 되돌리면 −71px · 롤통을 단추 둘로 되돌리면 −46px ·
         *  작도 시점을 위 띠로 되돌리면 +37px(이쪽만 늘어난다). 재편 전 실측이 25px이고
         *  통과선(버튼 두 개분)이 92px이므로 **그 상태에서 이 팔은 실제로 실패한다.** */
        reachability: `여유 px — 재편 전 **25** ↔ 후 **${before.slack}**. 통과선은 «버튼 두 개분» ${two}px이고 둘 사이에 있다. 시험 삽입 뒤 여유도 전 −67(25 − 92) ↔ 후 ${after.slack}로 부호가 갈린다.`,
        reachability_value: [25, before.slack],
        reachability_source: 'slack_before_after',
      },
    }, null, 1) + '\n')
  }
})

// ── ⑤ R5 — 「동시에 열릴 수 있는 둘」이 같은 자리를 안 쓴다 ────────────────────
//
// ⚠⚠ **34-6이 만든 다툼이 아니라 이미 있던 것이다.** 치수 리본(`#dimpanel`)은 우측의
// **세로로 긴 기둥**이고(실측 x 872..1104 · y 96..669 · 높이 573px — 아래로 못 비킨다),
// 위 띠에서 내려오는 `#display-pop`이 종전 자리(right 170)에서 그 기둥과 겹쳤다:
// **x 872..1030 · y 96..199.** 둘 다 z 11이라 **DOM에서 뒤인 치수 리본이 위로 그려졌고**,
// 그래서 치수 리본을 편 채 「표시」를 누르면 팝업이 **리본 뒤로 깔렸다.** 34-6이 파일·설정
// 서랍을 위 띠로 올리면서 그 자리가 드러났다(서랍은 `#eyebar`의 **쌓임 맥락** 안이라
// z 13을 줘도 못 이긴다 — #79가 이름 붙인 바로 그 형태다).
//
// 답은 z가 아니라 **자리를 나누는 것**이다(#79): 위 띠에서 내려오는 것은 기둥의 **왼쪽
// 길**(`--top-lane`)에 선다. 이 팔이 그 길을 값으로 지킨다.
const rectOf = (page: Page, sel: string) => page.evaluate((s) => {
  const e = document.querySelector(s) as HTMLElement | null
  if (!e) return null
  const b = e.getBoundingClientRect()
  return { x: +b.x.toFixed(0), y: +b.y.toFixed(0), r: +b.right.toFixed(0), b: +b.bottom.toFixed(0) }
}, sel)

const overlap = (a: { x: number; y: number; r: number; b: number }, c: typeof a) => {
  const ox = Math.min(a.r, c.r) - Math.max(a.x, c.x)
  const oy = Math.min(a.b, c.b) - Math.max(a.y, c.y)
  return ox > 0 && oy > 0 ? { ox: +ox.toFixed(0), oy: +oy.toFixed(0) } : null
}

test('34-6 ⑤ R5 — 위 띠에서 내려오는 것이 치수 기둥을 안 가로지른다 (+반증: 옛 자리는 겹쳤다)', async ({ page }) => {
  await boot(page)
  // 치수 리본을 편다 — 이것이 「동시에 열릴 수 있는가」의 전제다
  await page.evaluate(() => document.getElementById('dimpanel')!.classList.remove('folded'))
  const dim = (await rectOf(page, '#dimpanel'))!
  console.log(`[34-6 ⑤] 치수 기둥 x ${dim.x}..${dim.r} · y ${dim.y}..${dim.b} (높이 ${dim.b - dim.y})`)
  expect(dim.b - dim.y, '기둥이 세로로 길다 — 아래로 못 비킨다').toBeGreaterThan(400)

  const bad: string[] = []
  for (const [sel, open] of [
    ['#display-pop', async () => { await page.evaluate(() => { (document.getElementById('display-pop') as HTMLElement).hidden = false }) }],
    ['#pane-file > div', async () => { await page.evaluate(() => { (document.querySelector('#pane-file') as HTMLDetailsElement).open = true }) }],
    ['#pane-settings > div', async () => { await page.evaluate(() => { (document.querySelector('#pane-settings') as HTMLDetailsElement).open = true }) }],
  ] as const) {
    await open()
    const r = (await rectOf(page, sel))!
    const ov = overlap(dim, r)
    console.log(`[34-6 ⑤] ${sel} x ${r.x}..${r.r} · y ${r.y}..${r.b} → 기둥과 겹침 ${ov ? `${ov.ox}×${ov.oy}` : '없음'}`)
    if (ov) bad.push(`${sel} ${ov.ox}×${ov.oy}`)
  }
  expect(bad, '위 띠에서 내려오는 것이 기둥과 안 겹친다').toEqual([])

  // ── 반증(D-3) — **옛 자리(right 170)로 되돌리면 실제로 겹친다** ─────────────
  const was = await page.evaluate(() => {
    const dp = document.getElementById('display-pop') as HTMLElement
    // ⚠ 다시 띄운다 — 앞의 서랍이 열리며 R7의 `closeOtherBoxes`가 이것을 접었다.
    //   숨은 요소는 상자가 0이라 «겹침 없음»이 거저 나온다(#69 ㉣: 반증이 아무것도 안 잰다).
    dp.hidden = false
    dp.style.right = '170px'                       // web2-19 이래의 자리
    const d = document.getElementById('dimpanel')!.getBoundingClientRect()
    const p = dp.getBoundingClientRect()
    const ox = Math.min(d.right, p.right) - Math.max(d.x, p.x)
    const oy = Math.min(d.bottom, p.bottom) - Math.max(d.y, p.y)
    dp.style.right = ''
    return { ox: +ox.toFixed(0), oy: +oy.toFixed(0) }
  })
  console.log(`[34-6 ⑤ 반증] 옛 자리(right 170)의 표시 팝업 — 기둥과 ${was.ox}×${was.oy} 겹쳤다`)
  expect(was.ox, '반증: 옛 자리는 실제로 겹친다').toBeGreaterThan(0)
  expect(was.oy, '반증: 옛 자리는 실제로 겹친다').toBeGreaterThan(0)
})

// ── ⑥ R5 후속 — **겹치는 것이 «위»에 있는가**(리뷰어 [1]) ────────────────────
//
// ⚠⚠ **34-6 초판이 R5를 위 띠에서만 갈랐다.** 리뷰어가 세로바 길의 통들을 물었고
// 재 보니 **여섯 전부** 치수 기둥과 겹쳤다(`#etray` 127×243 · `#snap-pop` 94×309 —
// 34-6이 고친 표시 팝업의 158×103보다 작지 않다).
//
// 그런데 여기서 R5의 **적용 범위가 갈렸다**(측정이 정했다):
//   · 위 띠에서 내려오는 것 ↔ 치수 기둥 — **둘 다 오래 떠 있는 것**이라 자리를 나눈다.
//   · 세로바의 **펼침**(통) ↔ 치수 기둥 — 통은 **잠깐 얹히는 것**이고, 잠깐 얹히는 것이
//     오래 있는 것 «위»에 오는 것은 모든 앱의 기본 거동이다(A-3). 자리를 나눌 것이 아니라
//     **위에 있어야** 한다.
// 그리고 **위에 있지 않았다**: `#sidebar`가 `position:fixed + z-index`라 **자기 쌓임
// 맥락**을 만들고, 그 «안»의 `#tray { z-index: 12 }`가 맥락 **밖**의 `#dimpanel`(z 11)을
// 못 넘는다. 실측(수리 전) — 겹치는 자리의 `elementFromPoint`가 **리본의 자식**을 냈다:
//   연필통 (1077,314) → `pad-keys` · 촉통 (1077,399) → `dimpanel`
//   크기통 (1041,547) → 리본의 div · 롤통 (1071,628) → 리본의 label
// 즉 **넷이 통째로 리본 뒤로 깔려 있었다.** `#snap-pop`만 `#app`의 직계라 제 것을 냈다.
//
// ⚠ 답은 **z를 올린 것이 아니다**(#79) — 선언은 처음부터 12였고 맥락이 그것을 삼켰다.
//   통 넷을 맥락에서 **꺼내** 적힌 순서가 실제로 서게 했다.
test('34-6 ⑥ R5 후속 — 통은 치수 기둥 «위»에 온다 (+반증: 세로바 안에 두면 깔린다)', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => document.getElementById('dimpanel')!.classList.remove('folded'))

  /** 겹치는 자리의 한 점을 그 통이 실제로 받는가 */
  const front = (sel: string) => page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement | null
    if (!e) return { sel: s, ok: false, at: 'none', got: 'none' }
    const b = e.getBoundingClientRect()
    const d = document.getElementById('dimpanel')!.getBoundingClientRect()
    const ox = Math.min(b.right, d.right) - Math.max(b.x, d.x)
    const oy = Math.min(b.bottom, d.bottom) - Math.max(b.y, d.y)
    if (!(ox > 0 && oy > 0)) return { sel: s, ok: true, at: '겹치지 않는다', got: '—' }
    const x = (Math.max(b.x, d.x) + Math.min(b.right, d.right)) / 2
    const y = (Math.max(b.y, d.y) + Math.min(b.bottom, d.bottom)) / 2
    const top = document.elementFromPoint(x, y)
    return { sel: s, ok: e.contains(top) || e === top,
             at: `${Math.round(x)},${Math.round(y)} (겹침 ${Math.round(ox)}×${Math.round(oy)})`,
             got: top ? ((top as HTMLElement).id || top.tagName) : 'null' }
  }, sel)

  const opens: [string, string][] = [
    ['btn-pencil', '#tray'], ['btn-pen', '#pentray'], ['btn-eraser-pencil', '#etray'],
    ['btn-roll', '#rolltray'], ['btn-snap', '#snap-pop'],
  ]
  const bad: string[] = []
  for (const [btn, sel] of opens) {
    await page.click(`#${btn}`)
    const r = await front(sel)
    console.log(`[34-6 ⑥] ${sel} ${r.at} → ${r.got} · 내 것 ${r.ok}`)
    if (!r.ok) bad.push(`${sel}(${r.got})`)
  }
  expect(bad, '통이 치수 기둥 위에 온다').toEqual([])

  // 세로바를 접으면 **통도 닫힌다** — 종전에는 `#sidebar.folded`가 같이 덮었다
  await page.click('#btn-pencil')
  await page.click('#sidebar-toggle')
  const stillOpen = await page.locator('#tray.open, #pentray.open, #etray.open, #rolltray.open').count()
  console.log(`[34-6 ⑥] 세로바를 접으면 열린 통 ${stillOpen}`)
  expect(stillOpen, '접으면 통도 닫힌다 — 여는 단추가 사라졌는데 통만 뜨면 미아다').toBe(0)
  await page.click('#sidebar-toggle')

  // ── 반증(D-3) — 통을 세로바 «안»으로 되돌리면 실제로 깔린다 ─────────────────
  const was = await page.evaluate(async () => {
    const body = document.getElementById('sidebar-body')!
    for (const id of ['tray', 'pentray', 'etray', 'rolltray']) body.append(document.getElementById(id)!)
    ;(document.getElementById('btn-pencil') as HTMLElement).click()
    await new Promise(r => setTimeout(r, 80))
    const e = document.getElementById('tray')!
    const b = e.getBoundingClientRect()
    const d = document.getElementById('dimpanel')!.getBoundingClientRect()
    const x = (Math.max(b.x, d.x) + Math.min(b.right, d.right)) / 2
    const y = (Math.max(b.y, d.y) + Math.min(b.bottom, d.bottom)) / 2
    const top = document.elementFromPoint(x, y)
    const app = document.getElementById('app')!
    for (const id of ['tray', 'pentray', 'etray', 'rolltray']) app.append(document.getElementById(id)!)
    return { mine: e.contains(top) || e === top, got: top ? ((top as HTMLElement).id || top.tagName) : 'null' }
  })
  console.log(`[34-6 ⑥ 반증] 세로바 «안»으로 되돌린 연필통 — 그 자리는 ${was.got} · 내 것 ${was.mine}`)
  expect(was.mine, '반증: 세로바 안에 두면 실제로 리본 뒤로 깔린다').toBe(false)
})
