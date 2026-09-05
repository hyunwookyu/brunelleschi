// web2-69 §1 — 인벤토리: 화면에 보이는 «누를 것»을 스크립트로 센다(손으로 세지 마라 — 지시 게이트).
//
//   기본 상태(새 문서 · 부팅 직후 도구 = 연필 · 저장된 설정 없음 · ?reset) → 누를 것 전수(id · 자리 · 종류 · 라벨 · 툴팁 · 보임)
//   도구를 하나씩 들고(연필 · 펜 · 지우개 둘 · 면 · 칠) 그때 «더» 나타나는 것
//   카드(설정 pane-settings · 보기 display-pop · 파일 pane-file · 치수 dimpanel)를 열었을 때의 것(뒤 탭 수 = 카드 열기 1 + 누르기 1)
//   ?dev=1 — 개발 메뉴의 것(없으면 DOM에 없다 · 미생성)
//
//   «누를 것» = button · input · select · summary · [role=button] · a[href] · 눈금 점(.tick) · 경도 글자(.pcgrade) — 보이는 것(rect > 0 · visibility)만.
//   자리 = 조상 중 첫 «판»(topleft/eyebar/sidebar/dimpanel/painttray/tray…/pane-file/pane-settings/display-pop/brushpick/떠 있음).
//
// 원장: stage0/out/inventory69_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99) — INVENTORY.md의 행은 이 원장에서 만든다(tools/inventory69-md.mjs).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-69 §1 인벤토리 — 화면의 누를 것 전수(기본 · 도구별 · 카드별 · 개발) · §3 전수 왕복(표의 모든 id가 닿는다)',
  note_pitfalls: '#42 · #96/#97(툴팁·닿음 — 34-0 규약) · #12(상태 여섯 × 카드 넷 — 동작점이 하나가 아니다) · #91(«안 바뀌었는가»가 아니라 «닿는가»를 잰다)',
  pitfall_citations: [12, 42, 91, 96, 97],
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/inventory69_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({ ...prev, conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/inventory69.spec.ts (#99)' }, ...OUT }, null, 2))
})

export interface Pressable { id: string; tag: string; type: string; zone: string; label: string; title: string; aria: string; hidden_kind: string }
/** 페이지 안 셈 — «보이는 누를 것» 전수(순서 = DOM 순서). 자리는 첫 판 조상. */
export const CENSUS_FN = `(() => {
  const ZONES = ['topleft','paperbar','layerbar','eyebar','pane-file','pane-settings','display-pop','sidebar','dimpanel','painttray','brushpick','tray','pentray','etray','rolltray','griptray','face-pop','lens-pop','snap-pop','tunelab','stencil-modal','filepanel','devmenu','layer-pop','paper-pop','confirm-pop']
  // 보인다 = 크기가 있고 «화면 안»이다(닫힌 서랍의 내용은 x = −734에 놓여 있다 — 크기만 보면 세어진다 · 1차 실측 35 → 23)
  // «눌린다» = 가운데의 elementFromPoint가 자기(또는 자손)다(#97 — 34-0 규약). 닫힌 서랍의 내용은 화면 안 좌표(x 481)에 놓여 있어도 눌리지 않는다(1차 실측 35 → 23)
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false; const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)) }
  const sel = 'button, input, select, textarea, summary, [role=button], a[href], .tick, .pcgrade'
  const out = []
  for (const e of Array.from(document.querySelectorAll(sel))) {
    if (!vis(e)) continue
    if (e.closest('[hidden]')) continue
    if (e.matches('#devmenu > summary')) continue   // 개발 메뉴의 접힘 손잡이는 메뉴의 «틀»이다(항목 셋이 누를 것) — ?dev=1이면 펼쳐진 채
    let zone = '떠 있음', z = e
    while (z && z !== document.body) { if (z.id && ZONES.includes(z.id)) { zone = z.id; break } z = z.parentElement }
    const tag = e.tagName.toLowerCase()
    const type = tag === 'input' ? (e.getAttribute('type') || 'text') : tag === 'summary' ? 'summary' : e.classList.contains('tick') ? 'tick' : e.classList.contains('pcgrade') ? 'grade' : tag
    const text = (e.textContent || '').replace(/\\s+/g, ' ').trim()
    const hasSvg = !!e.querySelector('svg, canvas')
    const label = text.length > 0 ? text.slice(0, 24) : ''
    const rc = e.getBoundingClientRect()
    out.push({ id: e.id || (e.className ? '.' + String(e.className).split(' ')[0] : tag), tag, type, zone, label, has_icon: hasSvg, title: e.getAttribute('title') || '', aria: e.getAttribute('aria-label') || '', rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)] })
  }
  return out
})()`
export const census = (page: Page) => page.evaluate(`(${CENSUS_FN.replace(/^\(/, '').replace(/\)\(\)$/, '')})()`) as Promise<(Pressable & { has_icon: boolean })[]>

async function boot(page: Page, q = '/?reset') {
  await page.goto(q)
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(200)
}
const ids = (list: { id: string }[]) => list.map(p => p.id)
const diff = (a: string[], b: string[]) => b.filter(x => !a.includes(x))

test('§1 전수 — 기본 상태 · 도구별 추가 · 카드별 · 개발 메뉴(?dev=1) — 값으로', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  const base = await census(page)
  const tools: Record<string, unknown> = {}
  const toolAdds: Record<string, string[]> = {}
  for (const t of ['btn-pencil', 'btn-pen', 'btn-eraser-pencil', 'btn-eraser-ink', 'btn-face', 'btn-paint']) {
    await page.click(`#${t}`); await page.waitForTimeout(150)
    const c = await census(page)
    toolAdds[t] = diff(ids(base), ids(c))
    tools[t] = { total: c.length, added: toolAdds[t], removed: diff(ids(c), ids(base)), added_items: c.filter(p => toolAdds[t]!.includes(p.id)) }
    // 도구를 놓는다(통이 열렸으면 닫힌다) — 연필로
    await page.click('#btn-pencil'); await page.waitForTimeout(80)
    if (t !== 'btn-pencil') { await page.click('#btn-pencil'); await page.waitForTimeout(60) }
  }
  // 카드들 — 열었을 때 «더» 보이는 것(뒤 탭 수 2의 근거)
  const cards: Record<string, unknown> = {}
  const openCard = async (name: string, open: () => Promise<void>, close: () => Promise<void>) => {
    await open(); await page.waitForTimeout(200)
    const c = await census(page)
    const added = diff(ids(base), ids(c))
    cards[name] = { total: c.length, added, added_items: c.filter(p => added.includes(p.id)) }
    await close(); await page.waitForTimeout(120)
  }
  await openCard('pane-file', async () => { await page.click('#pane-file > summary') }, async () => { await page.click('#pane-file > summary') })
  await openCard('pane-settings', async () => { await page.click('#pane-settings > summary') }, async () => { await page.click('#pane-settings > summary') })
  await openCard('display-pop', async () => { await page.click('#btn-display') }, async () => { await page.keyboard.press('Escape'); await page.evaluate(() => (document.getElementById('display-pop') as HTMLElement).hidden = true) })
  await openCard('dimpanel', async () => { await page.click('#dim-toggle') }, async () => { await page.click('#dim-toggle') })
  // 개발 메뉴 — ?dev=1 없으면 DOM에 없다(미생성) · 있으면 그 안의 것
  const devIds = await page.evaluate(() => Array.from(document.querySelectorAll('#devmenu button, #devmenu input, #devmenu select')).map(e => e.id))
  await boot(page, '/?reset&dev=1')
  const devOn = await census(page)
  const devIdsOn = await page.evaluate(() => Array.from(document.querySelectorAll('#devmenu button, #devmenu input, #devmenu select')).map(e => e.id))
  // 개발 메뉴는 설정 서랍 맨 아래 «접힘» — 서랍과 접힘을 열어 «더» 나타나는 것을 센다(탭 3)
  await page.click('#pane-settings > summary'); await page.waitForTimeout(200)
  const devOpen = await census(page)
  OUT.census = { def: '«보이는 누를 것»(button·input·select·summary·role=button·a[href]·눈금 점·경도 글자 — rect > 0 · hidden 조상 없음) · 자리 = 첫 판 조상 · 기본 상태(?reset · 연필) · 도구별 «더» 나타난 것 · 카드별 «더» 나타난 것 · 개발 메뉴(?dev=1)',
    base: { total: base.length, by_zone: Object.fromEntries([...new Set(base.map(p => p.zone))].map(z => [z, base.filter(p => p.zone === z).length])), items: base },
    tools, cards, dev: { without_flag_ids: devIds, with_flag_total: devOn.length, with_flag_added: diff(ids(base), ids(devOn)), devmenu_ids: devIdsOn, open_total: devOpen.length, open_added: diff(ids(base), ids(devOpen)), open_added_items: devOpen.filter(p => !ids(base).includes(p.id)) } }
  expect(base.length, '기본 상태의 누를 것이 세어졌다').toBeGreaterThan(10)
  expect(devIds, '?dev=1 없이는 개발 메뉴가 DOM에 없다(미생성)').toEqual([])
  expect(devIdsOn, '?dev=1이면 개발 메뉴에 진단·작업대·자립 깃발').toEqual(['btn-diag', 'btn-tunelab', 'chk-own3d'])
  expect(devOn.length, '?dev=1이어도 기본 상태의 셈은 같다(접힘 — 서랍 안)').toBe(base.length)
})

// ── §1 게이트 ② — 표의 행 수 == DOM 실측 · §3 게이트 전수 왕복(표의 모든 id가 닿는다) · 반증 둘 ──
const INVENTORY = resolve(HERE, '../../docs/reference/INVENTORY.md')
interface Row { state: string; id: string; verdict: string; tapsAfter: number }
function readRows(): Row[] {
  const md = readFileSync(INVENTORY, 'utf8')
  const rows: Row[] = []
  for (const line of md.split('\n')) {
    const m = line.match(/^\| (기본|도구:[^|]+|카드:[^|]+|개발\(\?dev=1\)) \| ([^|]+) \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| (\d+) \| ([^|]+) \| [^|]+ \| (\d+) \| [^|]+ \|$/)
    if (m) rows.push({ state: m[1]!.trim(), id: m[2]!.trim(), verdict: m[4]!.trim(), tapsAfter: Number(m[5]) })
  }
  return rows
}
const TOOL_OF: Record<string, string> = { '도구:연필': 'btn-pencil', '도구:펜': 'btn-pen', '도구:연필 지우개': 'btn-eraser-pencil', '도구:펜 지우개': 'btn-eraser-ink', '도구:면': 'btn-face', '도구:칠': 'btn-paint' }
const CARD_OF: Record<string, string> = { '카드:pane-file': 'pane-file', '카드:pane-settings': 'pane-settings', '카드:display-pop': 'display-pop', '카드:dimpanel': 'dimpanel' }
/** 그 상태를 «연다»(카드 열기 1 · 도구 누름 1 · 개발은 서랍 + 접힘) — 표의 «뒤 탭 수»가 이 걸음 수 + 누르기 1 */
async function openState(page: Page, state: string): Promise<number> {
  await page.click('#btn-pencil'); await page.waitForTimeout(60); await page.click('#btn-pencil'); await page.waitForTimeout(60)   // 통을 접는다
  await page.evaluate(() => { for (const id of ['pane-file', 'pane-settings']) (document.getElementById(id) as HTMLDetailsElement).open = false; (document.getElementById('display-pop') as HTMLElement).hidden = true })
  if (!(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded')))) { await page.click('#dim-toggle'); await page.waitForTimeout(120) }   // 치수판도 접는다(상태가 새지 않게)
  if (state === '기본') return 0
  if (TOOL_OF[state]) { await page.click(`#${TOOL_OF[state]}`); await page.waitForTimeout(150); return 1 }
  if (state === '카드:pane-file' || state === '카드:pane-settings') { await page.click(`#${CARD_OF[state]} > summary`); await page.waitForTimeout(150); return 1 }
  if (state === '카드:display-pop') { await page.click('#btn-display'); await page.waitForTimeout(150); return 1 }
  if (state === '카드:dimpanel') { const folded = await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded')); if (folded) await page.click('#dim-toggle'); await page.waitForTimeout(150); return 1 }
  if (state === '개발(?dev=1)') { await page.click('#pane-settings > summary'); await page.waitForTimeout(150); return 1 }   // 개발 메뉴는 ?dev=1이면 펼쳐진 채(탭 2)
  throw new Error(`모르는 상태 ${state}`)
}
/** id(또는 .class · 태그)의 n번째 보이는 것이 «눌리는가»(elementFromPoint) */
const HIT_FN = `((sel, n) => {
  const list = sel.startsWith('.') ? Array.from(document.querySelectorAll(sel)) : sel.startsWith('#') ? Array.from(document.querySelectorAll(sel)) : Array.from(document.querySelectorAll(sel))
  const vis = list.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight })
  const e = vis[n]
  if (!e) return { hit: false, why: 'none', n_vis: vis.length }
  const r = e.getBoundingClientRect()
  const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return { hit: !!t && (t === e || e.contains(t)), why: t ? (t.id || t.tagName) : null, n_vis: vis.length }
})`
const hitNth = (page: Page, sel: string, n: number) => page.evaluate(([s, n, fn]) => new Function('return ' + fn)()(s, n), [sel, n, HIT_FN] as const) as Promise<{ hit: boolean; why: string | null; n_vis: number }>
const selOf = (id: string, state: string): string => id.startsWith('.') ? id : id === 'button' ? (CARD_OF[state] ? `#${CARD_OF[state]} button:not([id])` : 'button:not([id])') : `#${id}`

test('§1 ② 표의 행 수 == DOM 실측 · §3 전수 왕복 — 표의 모든 id가 «그 상태에서» 닿는다 · 반증 둘', async ({ page }) => {
  test.setTimeout(300_000)
  const rows = readRows()
  expect(rows.length, '표가 있다').toBeGreaterThan(50)
  // ② 행 수 == 실측(상태마다) — 원장의 census와 같은 함수로 다시 센다(표를 만든 트리와 지금 트리가 같다)
  await boot(page, '/?reset&dev=1')
  const base = await census(page)
  const byState: Record<string, string[]> = {}
  for (const r of rows) (byState[r.state] ??= []).push(r.id)
  const counts: Record<string, { table: number; dom: number }> = { '기본': { table: byState['기본']!.length, dom: base.length } }
  for (const [state, tool] of Object.entries(TOOL_OF)) {
    await openState(page, state); const c = await census(page)
    const added = diff(ids(base), ids(c))
    counts[state] = { table: (byState[state] ?? []).length, dom: state === '도구:펜 지우개' ? 0 : added.length }   // 펜 지우개의 크기통은 연필 지우개와 같은 통(표에 한 번)
    void tool
  }
  // ?dev=1로 부팅했으므로 설정 서랍의 «더»에는 개발 메뉴 셋이 섞인다 — 자리(zone devmenu)로 가른다(표도 그렇게 갈라 적는다)
  for (const state of Object.keys(CARD_OF)) { await openState(page, state); const c = await census(page); const addedItems = c.filter(p => !ids(base).includes(p.id)); counts[state] = { table: (byState[state] ?? []).length, dom: addedItems.filter(p => p.zone !== 'devmenu').length } }
  { await openState(page, '개발(?dev=1)'); const c = await census(page); counts['개발(?dev=1)'] = { table: (byState['개발(?dev=1)'] ?? []).length, dom: c.filter(p => p.zone === 'devmenu').length } }
  // ③ 전수 왕복 — 상태별로 열고 id마다 닿는지
  const misses: { state: string; id: string; why: string | null }[] = []
  let reached = 0
  for (const state of Object.keys(byState)) {
    await openState(page, state)
    const seenIdx: Record<string, number> = {}
    for (const id of byState[state]!) {
      const sel = selOf(id, state)
      const n = seenIdx[sel] ?? 0; seenIdx[sel] = n + 1
      const h = await hitNth(page, sel, n)
      if (h.hit) reached++; else misses.push({ state, id, why: h.why })
    }
  }
  // 반증 ①(D-3) — 표에서 id 하나를 빼면 «행 수 == 실측»이 실제로 깨진다
  const falsifyTable = (byState['기본']!.length - 1) === base.length
  // 반증 ②(D-3) — DOM에서 하나를 감추면 «닿는다»가 실제로 깨진다
  await openState(page, '카드:display-pop')
  await page.evaluate(() => { (document.getElementById('btn-person') as HTMLElement).style.visibility = 'hidden' })
  const hidden = await hitNth(page, '#btn-person', 0)
  await page.evaluate(() => { (document.getElementById('btn-person') as HTMLElement).style.visibility = '' })
  OUT.roundtrip = { def: '§1 ② 표(INVENTORY.md)의 상태별 행 수 == 같은 함수로 다시 센 DOM 실측 · §3 전수 왕복: 표의 모든 id를 그 상태를 열고 elementFromPoint로 «닿는다» · 반증 ①: 표에서 한 행을 빼면 셈이 갈린다 · 반증 ②: 요소 하나를 감추면 닿지 않는다',
    counts, rows_total: rows.length, reached, misses, max_taps_after: Math.max(...rows.map(r => r.tapsAfter)), taps_over_2: rows.filter(r => r.tapsAfter > 2).map(r => `${r.id}(${r.state}) ${r.tapsAfter}`), falsify_table_mismatch: !falsifyTable, falsify_hidden_unreached: !hidden.hit }
  for (const [state, c] of Object.entries(counts)) expect(c.table, `${state}: 표 행 수 == DOM 실측(${c.dom})`).toBe(c.dom)
  expect(misses, '전수 왕복 — 닿지 않는 id 0(기존 기능 전부 살아 있음 ㉠)').toEqual([])
  expect(reached, '닿은 수 == 행 수').toBe(rows.length)
  expect(!falsifyTable, '반증 ① — 한 행을 빼면 셈이 갈린다').toBe(true)
  expect(hidden.hit, '반증 ② — 감춘 요소는 닿지 않는다').toBe(false)
})

test('§3 게이트 — 새 문서 격자 꺼짐 · 저장 설정 존중(b2-grid) · 축 스냅 무변(항상 켜져 있다)', async ({ page }) => {
  await boot(page)
  const g0 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, box: (document.getElementById('chk-grid') as HTMLInputElement).checked, saved: localStorage.getItem('b2-grid'), axis: document.getElementById('axis-snap-slot')?.textContent?.trim() ?? null }))
  // 사람이 켠다 → 기기에 남는다 → 새로 열어도 켜진 채(저장 설정 존중)
  await page.click('#pane-settings > summary'); await page.waitForTimeout(120)
  await page.click('#chk-grid'); await page.waitForTimeout(80)
  const g1 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, saved: localStorage.getItem('b2-grid') }))
  await page.goto('/'); await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2); await page.waitForTimeout(200)
  const g2 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, box: (document.getElementById('chk-grid') as HTMLInputElement).checked, axis: document.getElementById('axis-snap-slot')?.textContent?.trim() ?? null }))
  // 되돌린다(다른 팔에 안 새게)
  await page.evaluate(() => localStorage.removeItem('b2-grid'))
  OUT.grid = { def: '새 문서(?reset · 저장 없음) 격자 표시 꺼짐(DIRECTION 「격자와 축만 기본 꺼짐」) · 사람이 켜면 b2-grid=on이 남고 새로 열어도 켜진 채 · 축 스냅은 토글이 없다(「항상 켜져 있다」 — 표시와 무관 · 무변)', fresh: g0, after_on: g1, reopened: g2 }
  expect(g0.grid, '새 문서 격자 꺼짐').toBe(false); expect(g0.box).toBe(false); expect(g0.saved, '저장 없음').toBeNull()
  expect(g1.grid, '켰다').toBe(true); expect(g1.saved, '기기에 남는다').toBe('on')
  expect(g2.grid, '저장 설정 존중 — 새로 열어도 켜진 채').toBe(true); expect(g2.box).toBe(true)
  expect(g2.axis, '축 스냅 무변(항상 켜져 있다)').toBe(g0.axis); expect(g0.axis).toBe('항상 켜져 있다')
})
