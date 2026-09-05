// web2-65 §2 — **칠 패널 다듬기 넷**의 게이트.
//
//   ① 자리      칠 패널이 오른쪽 세로바(#sidebar)와 «안 겹친다» · 화면 안이다(34-6).
//   ② 즐겨찾기   여섯 칸이 «그 브러시의 실제 자국»이고 서로 **픽셀로 다르다**.
//   ③ 이름 사상  `100% Opaque` 같은 원 이름이 «표시»에 그대로 안 나온다 — 원 이름은 **부제·도움말**에 산다.
//   ④ 잘림 0    화면 폭 둘(800 · 1200)에서 «잘린 글자 0» — 패널과 브러시 목록 전수.
//
// 자의 자리: 화면 사각(getBoundingClientRect) · 견본 캔버스 픽셀(getImageData) ·
// `scrollWidth/scrollHeight > clientWidth/clientHeight`(말줄임·넘침의 정의 그 자체).
// 원장: stage0/out/panel65_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-65 §2 — 칠 패널: ①자리(세로바와 안 겹침) ②즐겨찾기 여섯이 픽셀로 다름 ③원 이름 사상 ④잘린 글자 0(폭 800·1200)',
  note_pitfalls: '#96(손잡이가 늘면 34-0 표를 그 라운드 안에서 다시 — paint64 ⑦이 그 자리) · #97(견본 캔버스는 position:static·flex-shrink 0) · #87(펼침은 화면에서 눌러 센다) · #12(폭 둘 · 칸 여섯 — 동작점 하나로 주장하지 않는다) · #99 · #101',
  note_meter: '「잘렸다」 = ① 제 상자가 hidden·clip으로 자르는데 내용이 더 크다 ② 조상 중 hidden·clip 상자 밖으로 사각이 나갔다. overflow:visible의 넘침(글자는 다 보인다)과 auto·scroll(굴려서 닿는다)은 «잘린 것이 아니다» — 초판이 그 둘을 세어 거짓 양성을 냈고 실측이 고쳤다',
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31·paint50의 no_constants_snapshot이 정본 · 그 기계는 web/test/constants.ts에만 있다)' },
  pitfall_citations: [12, 87, 96, 97, 99, 101],
  selfcheck_notes: { zero_counters: 'p4의 잘린 칸 0이 게이트 ④의 «통과»다 — 자가 산다는 증거는 같은 원장의 falsify(자르는 CSS를 주입하면 1건, 걷으면 0)다' },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/panel65_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/panel65.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

// ── selfcheck 몫(§5) — 이 원장이 스스로 밝히는 것 ──────────────────────────────
// ⚠ web2 라인에는 `constantsSnapshot()` 기계가 없다(라인 유보 — lens31·paint50의 그 자리와 같다).
// 그래서 STALE 자동 판정 대신 «인용 규약»(문서가 `원장.json@해시`로 적는다)이 그 몫을 진다.


async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.click('#btn-paint')
  await page.waitForTimeout(200)
}

/** 그 요소 안에서 «잘린» 칸 전부.
 *
 *  ⚠ **「잘렸다」의 정의**(초판이 틀렸다 — 실측이 고쳤다): `scrollWidth > clientWidth`만으로는
 *  안 된다. `overflow: visible`인 칸은 넘쳐도 **글자가 다 보인다**(선이 밖으로 나갈 뿐이고
 *  줄 높이(line-height)가 상자보다 1~2px 큰 것은 어디에나 있다 — 초판이 「1.00」·「정면」을
 *  잘렸다고 셌다). 글자가 **안 보이게 되는** 자리는 둘뿐이다:
 *    ㉠ 제 상자가 `overflow`를 자르고(hidden·clip·auto·scroll) 내용이 그보다 크다
 *    ㉡ 조상 중에 자르는 상자가 있고 이 칸의 사각이 그 밖으로 나갔다
 *  둘 다 본다. 반증(D-3)은 시험 안에서 «자르는 규칙을 일부러 넣어» 이 자가 실제로 무는지 낸다. */
const clipped = (page: Page, root: string) => page.evaluate((sel) => {
  const r = document.querySelector(sel as string) as HTMLElement | null
  if (!r) return { root: sel, exists: false, checked: 0, rows: [] as { id: string; text: string; why: string; sw: number; cw: number; sh: number; ch: number }[] }
  // ⚠ **자르는 것은 hidden·clip뿐이다.** `auto`·`scroll`은 «굴려서 닿는다» — 목록의 아래쪽
  // 줄을 「잘렸다」고 세면 스크롤 가능한 목록 전부가 거짓 양성이 된다(실측: 브러시 목록의
  // 접힌 아래 줄 열넷이 그렇게 잡혔다). 굴릴 수 있는 것은 안 잘린 것이다.
  const cuts = (v: string) => v === 'hidden' || v === 'clip'
  const out: { id: string; text: string; why: string; sw: number; cw: number; sh: number; ch: number }[] = []
  let checked = 0
  for (const el of Array.from(r.querySelectorAll('*'))) {
    const e = el as HTMLElement
    if (e.children.length > 0) continue                    // 잎만
    const t = (e.textContent ?? '').trim()
    if (t.length === 0) continue
    if (e.offsetParent === null && e.getClientRects().length === 0) continue   // 안 보이는 것은 뺀다
    checked++
    const cs = getComputedStyle(e)
    const row = { id: e.id || e.className || e.tagName, text: t.slice(0, 40), why: '', sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }
    if ((cuts(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) || (cuts(cs.overflowY) && e.scrollHeight > e.clientHeight + 1)) {
      out.push({ ...row, why: '제 상자가 자른다' })
      continue
    }
    // ㉡ 조상이 자르는가 — 사각이 그 안에 드는지 본다(1px 여유: 테두리 반올림)
    const b = e.getBoundingClientRect()
    let p: HTMLElement | null = e.parentElement
    let cut = ''
    while (p && cut === '') {
      const pc = getComputedStyle(p)
      if (cuts(pc.overflowX) || cuts(pc.overflowY)) {
        const pb = p.getBoundingClientRect()
        if (b.right > pb.right + 1 || b.left < pb.left - 1 || b.bottom > pb.bottom + 1 || b.top < pb.top - 1) {
          cut = `조상 ${p.id || p.className || p.tagName}이 자른다`
        }
      }
      if (p === r) break
      p = p.parentElement
    }
    if (cut !== '') out.push({ ...row, why: cut })
  }
  return { root: sel, exists: true, checked, rows: out }
}, root)

const rect = (page: Page, sel: string) => page.evaluate((s) => {
  const e = document.querySelector(s as string) as HTMLElement | null
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight }
}, sel)

test('① 자리 — 칠 패널이 세로바와 안 겹치고 화면 안이다', async ({ page }) => {
  await boot(page)
  const rows: Record<string, unknown>[] = []
  for (const [w, h] of [[1200, 800], [800, 800]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(250)
    const p = await rect(page, '#painttray')
    const bar = await rect(page, '#sidebar')
    expect(p, '칠 패널이 떠 있다').not.toBeNull()
    expect(bar, '세로바가 있다').not.toBeNull()
    const overlap = p && bar ? Math.max(0, Math.min(p.right, bar.right) - Math.max(p.left, bar.left)) * Math.max(0, Math.min(p.bottom, bar.bottom) - Math.max(p.top, bar.top)) : -1
    // ⚠⚠ 리뷰어 [H6] — 세로바와의 겹침 0은 «답답함»의 답이지 **대가**의 값이 아니다.
    // 패널은 도구를 든 «동안 항상» 뜨므로(64 R8) 그 사각만큼 **그릴 수 있는 화면이 준다** —
    // 옛 자리(오른쪽)는 이미 세로바가 있던 띠였고 새 자리는 전에 비어 있던 화면이다.
    // 밤 1차의 빨강 넷이 그 대가의 실측이었다(픽스처의 칠 셋이 패널에 먹혔다 — 놓인 획 30 → 27).
    const coveredFrac = p ? +((p.w * p.h) / (w * h)).toFixed(4) : null
    rows.push({ vw: w, vh: h, panel: p, sidebar: bar, overlap_px2: overlap,
      covered_px2: p ? p.w * p.h : null, covered_frac_of_viewport: coveredFrac })
    expect(overlap, `폭 ${w}: 패널이 세로바와 안 겹친다`).toBe(0)
    expect(p!.left, `폭 ${w}: 왼쪽 가장자리 안`).toBeGreaterThanOrEqual(0)
    expect(p!.right, `폭 ${w}: 오른쪽 화면 안`).toBeLessThanOrEqual(w)
    expect(p!.top, `폭 ${w}: 위 화면 안`).toBeGreaterThanOrEqual(0)
    expect(p!.bottom, `폭 ${w}: 아래 화면 안(34-6)`).toBeLessThanOrEqual(h)
  }
  await page.setViewportSize({ width: 1200, height: 800 })
  OUT.p1_place = {
    note: '패널은 화면 «왼쪽 가장자리»다 — 작도 세로바(오른쪽)와 겹치는 넓이 0. ⚠ 그 대신 «캔버스»를 그만큼 덮는다(covered_frac_of_viewport) — 그것이 이 자리의 대가이고, 사람이 그 자리에 못 긋는다는 뜻이다(리뷰어 [H6] · DEFERRED 65)',
    rows }
})

test('② 필통 일곱(68 판갈이) — 칸마다 도구 그림이 있고 촉 색이 그 칸의 색이며 그림 종류가 갈린다', async ({ page }) => {
  // web2-68 §1 — 65의 «실제 자국 견본»(paint-fav-k-sample 캔버스)은 «도구 그림»(SVG · 촉에 그 칸의 색)으로 갈렸다
  // (사람 판정 「필통 시스템으로」). 이 팔이 지키던 요구(칸이 서로 구분된다 · 값으로)는 그대로다 — 자가 픽셀 해시에서
  // «그림 종류 + 촉 색»으로 바뀌었을 뿐이다. 본체 게이트는 case68 ③(촉 fill == 칸 hex)이다.
  await boot(page)
  const cells = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#paint-favs > button.favbtn')).map(b => {
      const el = b as HTMLElement
      const tip = el.querySelector('svg .tip') as SVGElement | null
      return { id: el.id, kind: el.dataset.kind ?? '', br: el.dataset.br ?? '', hex: el.dataset.hex ?? '', tip_fill: tip?.getAttribute('fill') ?? null, grade: (el.querySelector('.pcgrade') as HTMLElement | null)?.textContent ?? '', nums: (el.querySelector('.pcnums') as HTMLElement | null)?.textContent ?? '' }
    }))
  const kinds = new Set(cells.map(c => c.kind))
  OUT.p2_favs = { note: '필통 일곱 칸 — 그림 종류(kind) · 브러시 · 촉 fill == 칸 hex · 경도 · 숫자', cells, distinct_kinds: kinds.size }
  expect(cells.length, '도구 칸 일곱(68)').toBe(7)
  for (const c of cells) {
    expect(c.tip_fill, `${c.id}: 촉 색 == 칸 hex`).toBe(c.hex)
    expect(c.nums, `${c.id}: 숫자 둘(px · %)`).toMatch(/px · \d+%$/)
  }
  expect(kinds.size, '그림 종류가 갈린다(연필·목탄·색연필·마커·붓·잉크펜 여섯)').toBe(6)
})

test('③ 이름 사상 — 원 이름은 «표시»가 아니라 부제·도움말에 산다', async ({ page }) => {
  await boot(page)
  // 마커 칸(68 기본 채움의 다섯째 — 옛 여섯 칸의 셋째)을 눌러 지금 브러시로 만든다
  await page.click('#paint-fav-5')
  await page.waitForTimeout(150)
  const sel = await page.evaluate(() => (window as any).__b2.diag.paintSelForTest() as { i: string; br: string })
  const shown = await page.evaluate(() => {
    const b = document.querySelector('#paint-brush-name b') as HTMLElement
    const sub = document.querySelector('#paint-brush-name span') as HTMLElement
    const btn = document.getElementById('paint-brush-btn') as HTMLElement
    return { label: (b?.textContent ?? '').trim(), sub: (sub?.textContent ?? '').trim(), title: btn?.title ?? '' }
  })
  OUT.p3_names = { note: '표시는 사람 쪽 이름, 원 이름은 부제와 도움말에 그대로', sel, shown }
  // web2-66 §2 자 판갈이 — 마커 기본이 brunelleschi/marker(납작 촉)로 바뀌었다(옛 ramon/100%_Opaque는 원형).
  // 자의 뜻(표시는 사람 쪽 · 원 이름은 부제·도움말)은 그대로다.
  expect(sel.br, '마커 칸의 브러시').toBe('brunelleschi/marker')
  expect(shown.label, '표시 이름이 원 이름이 아니다').not.toContain('brunelleschi/marker')
  expect(shown.label, '사람 쪽 이름').toBe('마커')
  // 부제는 원 이름을 « · »로 갈라 적는다(brushOrigin — «brunelleschi · marker») — 두 조각으로 잰다
  expect(shown.sub, '부제에 원 이름(무리)이 산다').toContain('brunelleschi')
  expect(shown.sub, '부제에 원 이름(이름)이 산다').toContain('marker')
  expect(shown.title, '도움말에 원 이름이 산다').toContain('brunelleschi/marker')
})

test('④ 잘린 글자 0 — 패널·브러시 목록 전수 · 화면 폭 둘(800 · 1200)', async ({ page }) => {
  await boot(page)
  const rows: Record<string, unknown>[] = []
  for (const [w, h] of [[1200, 800], [800, 800]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(250)
    const panel = await clipped(page, '#painttray')
    // 브러시 목록도 연다 — 분류 하나를 펴서 «실제 칸»을 만든다(닫힌 목록은 아무것도 안 잰다)
    await page.click('#paint-brush-btn')
    await page.waitForTimeout(200)
    await page.evaluate(() => {
      const d = document.querySelector('#brushpick-list details[data-group="Tanda"]') as HTMLDetailsElement | null
      if (d) d.open = true
    })
    await page.waitForTimeout(300)
    const pick = await clipped(page, '#brushpick')
    await page.click('#brushpick-close')
    await page.waitForTimeout(150)
    rows.push({ vw: w, vh: h, panel, pick })
    expect(panel.checked, `폭 ${w}: 패널에서 잰 칸이 있다`).toBeGreaterThan(5)
    expect(pick.checked, `폭 ${w}: 목록에서 잰 칸이 있다`).toBeGreaterThan(10)
    expect(panel.rows, `폭 ${w}: 패널에 잘린 칸 0`).toEqual([])
    expect(pick.rows, `폭 ${w}: 브러시 목록에 잘린 칸 0`).toEqual([])
  }
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(250)
  // ── D-3 반증: **자르는 규칙을 일부러 넣는다** — 이 자가 실제로 물어야 한다(안 물면 아무것도 안 잰 것이다)
  await page.evaluate(() => {
    const st = document.createElement('style')
    st.id = 'clip65-falsify'
    st.textContent = '#paint-brush-name b { display:block; width:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }'
    document.head.append(st)
  })
  await page.waitForTimeout(200)
  const broke = await clipped(page, '#painttray')
  await page.evaluate(() => { document.getElementById('clip65-falsify')?.remove() })
  await page.waitForTimeout(200)
  const healed = await clipped(page, '#painttray')
  expect(broke.rows.length, '반증 — 자르는 규칙을 넣으면 자가 문다').toBeGreaterThanOrEqual(1)
  expect(healed.rows, '반증을 걷으면 다시 0').toEqual([])
  OUT.p4_clip = {
    note: '잘림 = 「제 상자가 자르는데 내용이 더 크다」 또는 「조상이 자르는데 사각이 밖으로 나갔다」. overflow: visible의 넘침은 «잘린 것이 아니다»(글자가 다 보인다)',
    rows, falsify: { rows: broke.rows, healed: healed.rows.length },
  }
})
