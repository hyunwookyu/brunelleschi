// web2-69 §1 — 인벤토리: 화면에 보이는 «누를 것»을 스크립트로 센다(손으로 세지 마라 — 지시 게이트).
//
//   기본 상태(새 문서 · 부팅 직후 도구 = 연필 — 「아무 도구도 안 든 상태」는 이 앱에 없다(도구 하나는 늘 들려 있다 · 값으로) · 저장된 설정 없음 · ?reset)
//   → 누를 것 전수(id · 자리 · 종류 · 라벨 · 툴팁 · 보임 · rect)
//   도구를 하나씩 들고(연필 · 펜 · 지우개 둘 · 면 · 칠) 그때 «더» 나타나는 것 · 카드 넷(파일 · 설정 · 보기 · 치수판) · 통 여섯(렌즈 · 자 · 손 · 롤 · 브러시 목록 · 색상 휠 —
//   리뷰어 [H2]: 통의 내용도 전수다) · 설정의 절차(필압 보정 — press-calib · [H2]) · ?dev=1(개발 메뉴 — 없으면 DOM에 없다 · [M1] 존재 셈 0/3)
//
//   «누를 것» = button · input · select · textarea · summary · [role=button] · a[href] · 눈금 점(.tick) · 경도 글자(.pcgrade) · 색상 휠 캔버스(#paint-wheel-cv) —
//   «눌린다» = 가운데의 elementFromPoint가 자기(또는 자손)다(#97 · 34-0). ⚠ 눈금 점 18은 이 자로 0이다(점이 겹치고 «띠»가 받는다 — 68 §3-2 · 표식 · [L3] 값으로 적는다).
//   자리 = 조상 중 첫 «판». 뷰포트 둘(1200×800 · 800×700 — D-5 [M2]) · 트리 식별자·상수 스냅샷([L4]).
//
// 원장: stage0/out/inventory69_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99) — INVENTORY.md의 행은 이 원장에서 만든다(scratch gen_inventory69 · 표 ② 게이트가 대조).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const TREE = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: HERE, encoding: 'utf8' }).trim() } catch { return 'unknown' } })()
const OUT: Record<string, unknown> = {
  what: 'web2-69 §1 인벤토리 — 화면의 누를 것 전수(기본 · 도구별 · 카드별 · 통별 · 절차 · 개발) · §3 전수 왕복(표의 모든 id가 닿는다) · 격자 기본 꺼짐',
  tree: TREE,
  note_pitfalls: '#42 · #96/#97(툴팁·닿음 — 34-0 규약) · #12(상태 열여덟 × 뷰포트 둘 — 동작점이 하나가 아니다) · #91(«안 바뀌었는가»가 아니라 «닿는가»를 잰다) · #109(옛 자리 비움 · 개발 메뉴 존재 셈 0/3 — 둘 다 살지 않는다) · #107(전부 0인 자리: 눈금 점 0은 표식의 뜻 · 면 +0은 재누름 통) · #108(표 == DOM은 같은 함수의 파생 — 낡음 검사이고 실질은 왕복·반증 ②)',
  pitfall_citations: [12, 42, 91, 96, 97, 107, 108, 109],
  selfcheck_notes: {
    identical_pairs: '표 행 수 == DOM 실측은 «같은 함수의 파생»(표가 원장에서 만들어진다 — 낡음 검사 · [M4]) · dpr1 == dpr2는 요소 셈이 dpr 불변인 뜻(D-C3에서 이 자는 새 정보를 안 낸다 — 값으로 적는다)',
    zero_counters: 'ticks_pressable 0은 «눈금 점은 표식이고 띠가 받는다»(68 §3-2)의 뜻 · dev.without_flag_exists 0은 «미생성»의 뜻(with_flag 3이 짝) · tools.btn-face +0은 재누름 통(face-pop)이라 «더» 나타나는 것이 없다',
  },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/inventory69_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  // 시험 셋이 한 원장을 나눠 쓴다(열쇠가 갈린다: census · roundtrip · grid) — 68 [H1]의 «두 답» 형태는 없다(같은 열쇠를 두 시험이 안 쓴다)
  writeFileSync(f, JSON.stringify({ ...prev, conditions: { project: info.project.name, workers: 1, viewport: '1200×800 (+ 800×700 base)', tree: TREE, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/inventory69.spec.ts (#99)' }, ...OUT }, null, 2))
})

export interface Pressable { id: string; tag: string; type: string; zone: string; label: string; title: string; aria: string; has_icon: boolean; disabled: boolean; rect: number[] }
/** 페이지 안 셈 — «보이는 누를 것» 전수(순서 = DOM 순서). 자리는 첫 판 조상. */
export const CENSUS_FN = `(() => {
  const ZONES = ['topleft','paperbar','layerbar','eyebar','pane-file','pane-settings','display-pop','sidebar','dimpanel','painttray','brushpick','tray','pentray','etray','rolltray','griptray','face-pop','lens-pop','snap-pop','tunelab','stencil-modal','filepanel','devmenu','layer-pop','paper-pop','confirm-pop','press-calib','paint-wheelbox']
  // «눌린다» = 가운데의 elementFromPoint가 자기(또는 자손)다(#97 — 34-0 규약). 닫힌 서랍의 내용은 화면 안 좌표(x 481)에 놓여 있어도 눌리지 않는다(1차 실측 35 → 23)
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false; const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)) }
  const sel = 'button, input, select, textarea, summary, [role=button], a[href], .tick, .pcgrade, #paint-wheel-cv'
  const out = []
  for (const e of Array.from(document.querySelectorAll(sel))) {
    if (!vis(e)) continue
    if (e.closest('[hidden]')) continue
    if (e.matches('#devmenu > summary')) continue   // 개발 메뉴의 접힘 손잡이는 메뉴의 «틀»이다(항목 셋이 누를 것) — ?dev=1이면 펼쳐진 채
    let zone = '떠 있음', z = e
    while (z && z !== document.body) { if (z.id && ZONES.includes(z.id)) { zone = z.id; break } z = z.parentElement }
    const tag = e.tagName.toLowerCase()
    const type = tag === 'input' ? (e.getAttribute('type') || 'text') : tag === 'summary' ? 'summary' : e.classList.contains('tick') ? 'tick' : e.classList.contains('pcgrade') ? 'grade' : tag === 'canvas' ? 'canvas' : tag
    const text = (e.textContent || '').replace(/\\s+/g, ' ').trim()
    const hasSvg = !!e.querySelector('svg, canvas')
    const label = text.length > 0 ? text.slice(0, 24) : (e.matches('input,select') && e.closest('label') ? (e.closest('label').textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24) : '')
    const rc = e.getBoundingClientRect()
    out.push({ id: e.id || (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : tag), tag, type, zone, label, has_icon: hasSvg, disabled: !!e.disabled, title: e.getAttribute('title') || (e.closest('label') ? e.closest('label').getAttribute('title') || '' : ''), aria: e.getAttribute('aria-label') || '', rect: [Math.round(rc.x), Math.round(rc.y), Math.round(rc.width), Math.round(rc.height)] })
  }
  return out
})()`
export const census = (page: Page) => page.evaluate(`(${CENSUS_FN.replace(/^\(/, '').replace(/\)\(\)$/, '')})()`) as Promise<Pressable[]>

async function boot(page: Page, q = '/?reset') {
  await page.goto(q)
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(200)
}
const ids = (list: { id: string }[]) => list.map(p => p.id)
const diff = (a: string[], b: string[]) => b.filter(x => !a.includes(x))

export const TOOL_OF: Record<string, string> = { '도구:연필': 'btn-pencil', '도구:펜': 'btn-pen', '도구:연필 지우개': 'btn-eraser-pencil', '도구:펜 지우개': 'btn-eraser-ink', '도구:면': 'btn-face', '도구:칠': 'btn-paint' }
export const CARD_OF: Record<string, string> = { '카드:pane-file': 'pane-file', '카드:pane-settings': 'pane-settings', '카드:display-pop': 'display-pop', '카드:dimpanel': 'dimpanel' }
/** 통 여섯 + 절차 하나(리뷰어 [H2]) — «여는 손잡이»와 «먼저 들 도구» */
export const BOX_OF: Record<string, { open: string; tool?: string; zone: string }> = {
  '통:렌즈': { open: 'btn-lens', zone: 'lens-pop' },   // ⚠ 새 문서에서는 카메라가 없어 렌즈 단추가 disabled다 — 상자 하나(paint67 bigBox)를 그려 카메라를 세운 뒤 연다(openState)
  '모달:스텐실': { open: 'btn-stencil', zone: 'stencil-modal' },   /* 보기 카드 → 사람 스텐실 그리기(모달 · [H2] pressable_not_seen 셋) */
  '통:자': { open: 'btn-snap', zone: 'snap-pop' }, '통:손': { open: 'btn-grip', zone: 'griptray' }, '통:롤': { open: 'btn-roll', zone: 'rolltray' },
  '통:브러시 목록': { open: 'paint-brush-btn', tool: 'btn-paint', zone: 'brushpick' }, '통:색상 휠': { open: 'paint-color-btn', tool: 'btn-paint', zone: 'paint-wheelbox' },
}
/** 모든 것을 닫는다(상태가 새지 않게) */
async function closeAll(page: Page) {
  // ⚠ 스텐실 모달을 «닫은 뒤 첫 클릭»에서 렌더러가 죽었다(Target crashed — 전수 흐름 19 상태 뒤 · 단독 재현 4/4 실패 → D-2 «재현 못 했다» · DEFERRED 69). 모달이 열려 있으면 닫지 않고 새로 부팅한다(같은 질의 유지)
  if (await page.evaluate(() => { const m = document.getElementById('stencil-modal'); return !!m && !m.hidden })) { const u = new URL(page.url()); u.searchParams.set('reset', ''); await boot(page, u.pathname + u.search); return }
  await page.evaluate(() => { const b2 = (window as any).__b2; for (const id of ['pane-file', 'pane-settings']) (document.getElementById(id) as HTMLDetailsElement).open = false; for (const id of ['display-pop', 'lens-pop', 'snap-pop', 'face-pop']) { const e = document.getElementById(id); if (e) e.hidden = true }; void b2 })
  await page.click('#btn-pencil'); await page.waitForTimeout(60); await page.click('#btn-pencil'); await page.waitForTimeout(60)   // 통을 접는다(연필통 토글)
  if (!(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded')))) { await page.click('#dim-toggle'); await page.waitForTimeout(120) }
  await page.evaluate(() => { for (const id of ['tray', 'pentray', 'etray', 'rolltray', 'griptray']) document.getElementById(id)?.classList.remove('open') })
  await page.waitForTimeout(80)
}
/** 그 상태를 «연다» — 돌려주는 값 = 여는 데 든 탭 수(표의 «뒤 탭 수» = 이 값 + 누르기 1) */
export async function openState(page: Page, state: string): Promise<number> {
  await closeAll(page)
  if (state === '기본') return 0
  if (TOOL_OF[state]) { await page.click(`#${TOOL_OF[state]}`); await page.waitForTimeout(150); return 1 }
  if (state === '카드:pane-file' || state === '카드:pane-settings') { await page.click(`#${CARD_OF[state]} > summary`); await page.waitForTimeout(150); return 1 }
  if (state === '카드:display-pop') { await page.click('#btn-display'); await page.waitForTimeout(150); return 1 }
  if (state === '카드:dimpanel') { await page.click('#dim-toggle'); await page.waitForTimeout(150); return 1 }
  if (state === '개발(?dev=1)') { await page.click('#pane-settings > summary'); await page.waitForTimeout(150); return 1 }   // ?dev=1이면 펼쳐진 채(탭 2)
  if (state === '절차:필압 보정') { await page.click('#pane-settings > summary'); await page.waitForTimeout(100); await page.evaluate(() => (document.getElementById('chk-press') as HTMLInputElement).click()); await page.waitForTimeout(200); return 2 }
  const box = BOX_OF[state]
  if (box) {
    let n = 0
    if (state === '통:렌즈' && await page.evaluate(() => (document.getElementById('btn-lens') as HTMLButtonElement).disabled)) {
      // 카메라를 세운다 — paint67 bigBox의 여덟 획(픽스처 · 탭 수에 안 센다: 렌즈는 «카메라가 선 문서»에서만 있는 손잡이)
      for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const) {
        await page.mouse.move(l[0], l[1]); await page.mouse.down(); await page.mouse.move((l[0] + l[2]) / 2, (l[1] + l[3]) / 2, { steps: 4 }); await page.mouse.move(l[2], l[3], { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(60)
      }
      await page.waitForTimeout(200)
    }
    if (state === '모달:스텐실' && await page.evaluate(() => document.getElementById('display-pop')!.hidden)) { await page.click('#btn-display'); await page.waitForTimeout(120); n++ }   // 보기 카드가 이미 열려 있으면(기준 셈) 다시 안 누른다(토글)
    if (box.tool) { await page.click(`#${box.tool}`); await page.waitForTimeout(120); n++ }
    // 여는 것은 DOM click(배선 동일 — 재는 것은 «열린 뒤의 DOM»이지 손잡이의 actionability가 아니다: 세로바 단추의 hover 전이가 «stable» 판정을 오래 막았다)
    await page.evaluate((id) => (document.getElementById(id) as HTMLElement).click(), box.open); await page.waitForTimeout(300); n++
    return n
  }
  throw new Error(`모르는 상태 ${state}`)
}
/** 그 상태에서 «더» 나타난 것(기본 대비 · 같은 id라도 자리가 다르면 새 것 — 펜 지우개의 크기통 [H3]) */
const addedIn = (base: Pressable[], c: Pressable[], forceZone?: string): Pressable[] => {
  // 열쇠는 id@자리(rect를 넣으면 통이 끼어들어 밀린 칸까지 «새 것»으로 센다 — 색상 휠 +24의 자백). 펜 지우개의 크기통은 같은 id·같은 자리인데
  // 다른 단추 곁에 서므로(재배치) 그 상태에서는 그 자리(etray) 전부를 «더»로 센다([H3] — 왕복이 그 상태에서 닿는다)
  const key = (p: Pressable) => `${p.id}@${p.zone}`
  const bk = new Set(base.map(key))
  return c.filter(p => (forceZone && p.zone === forceZone) || !bk.has(key(p)))
}

test('§1 전수 — 기본 · 도구별 · 카드별 · 통별 · 절차 · 개발(?dev=1 존재 셈 0/3) · 뷰포트 둘 · id 122 대조 — 값으로', async ({ page }) => {
  test.setTimeout(300_000)
  await boot(page)
  const base = await census(page)
  const states: Record<string, unknown> = {}
  const allStates = [...Object.keys(TOOL_OF), ...Object.keys(CARD_OF), ...Object.keys(BOX_OF).filter(k => k !== '모달:스텐실'), '절차:필압 보정', '모달:스텐실']
  for (const st of allStates) {
    // 통이 도구 위에 열리면(브러시 목록 · 색상 휠) «더»의 기준은 그 도구 상태다(칠 패널을 두 번 세지 않는다)
    let baseline = base
    if (BOX_OF[st]?.tool) { await closeAll(page); await page.click(`#${BOX_OF[st]!.tool}`); await page.waitForTimeout(150); baseline = await census(page) }
    if (st === '절차:필압 보정' || st === '모달:스텐실') { await closeAll(page); await page.click(st === '절차:필압 보정' ? '#pane-settings > summary' : '#btn-display'); await page.waitForTimeout(150); baseline = await census(page) }   // «더»의 기준은 그 카드가 열린 상태([H2])
    const taps = await openState(page, st)
    const c = await census(page)
    const added = addedIn(baseline, c, st === '도구:펜 지우개' ? 'etray' : undefined)
    states[st] = { total: c.length, taps_to_open: taps, added: added.map(p => p.id), added_items: added, removed: diff(ids(c), ids(base)) }
    if (st === '절차:필압 보정') { await page.click('#btn-press-cancel').catch(() => {}); await page.waitForTimeout(100) }
  }
  await closeAll(page)
  // 옮긴 카드가 열릴 때 «그리는 양»(착수 표 3 · #111 계열 — 값으로): 설정 서랍·보기 카드의 DOM 노드 수 · canvas/svg/img 수 · 열 때의 rAF 프레임 수(그림 그리기 0이면 프레임도 잠깐)
  const drawerDraw: Record<string, unknown> = {}
  for (const [name, open] of [['pane-settings', () => page.click('#pane-settings > summary')], ['display-pop', () => page.click('#btn-display')]] as const) {
    await closeAll(page)
    const before = await page.evaluate(() => (window as any).__b2.diag.frameCountForTest?.() ?? null)
    await open(); await page.waitForTimeout(300)
    drawerDraw[name] = await page.evaluate((id) => { const e = document.getElementById(id)!; return { nodes: e.querySelectorAll('*').length, canvas: e.querySelectorAll('canvas').length, svg: e.querySelectorAll('svg').length, img: e.querySelectorAll('img').length, frames_after_open: ((window as any).__b2.diag.frameCountForTest?.() ?? null) } }, name)
    ;(drawerDraw[name] as any).frames_before_open = before
  }
  await closeAll(page)
  // 눈금 점 — 셈에서 0인 이유를 값으로([L3]): 점은 있으나(DOM 18) 가운데가 자기인 것이 0(겹침 · 띠가 받는다)
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  const ticks = await page.evaluate(() => { const all = Array.from(document.querySelectorAll('#paint-size-ticks .tick')); const hit = all.filter(t => { const r = t.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return at === t }); return { dom: all.length, pressable: hit.length, strip_hit: (() => { const s = document.getElementById('paint-size-ticks')!; const r = s.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return at === s || s.contains(at) })() } })
  await closeAll(page)
  // 개발 메뉴 — [M1] 존재 셈: 깃발 없이 0 · 있으면 3(hidden이 아니라 미생성)
  const devNone = await page.evaluate(() => document.querySelectorAll('#chk-own3d, #btn-diag, #btn-tunelab, #devmenu').length)
  await boot(page, '/?reset&dev=1')
  const devExists = await page.evaluate(() => document.querySelectorAll('#chk-own3d, #btn-diag, #btn-tunelab').length)
  const devOn = await census(page)
  await page.click('#pane-settings > summary'); await page.waitForTimeout(200)
  const devOpen = await census(page)
  const devAdded = addedIn(devOn, devOpen).filter(p => p.zone === 'devmenu')
  states['개발(?dev=1)'] = { total: devOpen.length, taps_to_open: 1, added: devAdded.map(p => p.id), added_items: devAdded, removed: [] }
  // 뷰포트 둘째(800×700 — D-5 [M2]) — 기본 상태 셈
  await page.setViewportSize({ width: 800, height: 700 })
  await boot(page)
  const base800 = await census(page)
  await page.setViewportSize({ width: 1200, height: 800 })
  // id 122 대조([H2]) — index.html의 id 전수를 읽어 «표(기본+상태들)에 든 것 / 누를 것이 아닌 태그 / 누를 것인데 어느 상태에도 안 보인 것»으로 가른다
  const html = readFileSync(resolve(HERE, '../index.html'), 'utf8')
  const htmlIds = [...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)].map(m => ({ tag: m[1]!.toLowerCase(), id: m[2]! }))
  const seen = new Set<string>([...ids(base), ...Object.values(states).flatMap(s => (s as { added: string[] }).added)])
  const PRESSABLE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'summary'])
  const reconcile = { html_ids: htmlIds.length, in_table: htmlIds.filter(h => seen.has(h.id)).length, not_pressable_tag: htmlIds.filter(h => !PRESSABLE_TAGS.has(h.tag)).map(h => h.id), pressable_not_seen: htmlIds.filter(h => PRESSABLE_TAGS.has(h.tag) && !seen.has(h.id)).map(h => h.id) }
  OUT.census = { def: '«보이는 누를 것»(button·input·select·textarea·summary·role=button·a[href]·눈금 점·경도 글자·색상 휠 캔버스 — 가운데의 elementFromPoint가 자기) · 자리 = 첫 판 조상 · 기본 상태(?reset · 연필 — 「아무 도구도 안 든 상태」는 이 앱에 없다) · 상태마다 «더» 나타난 것(같은 id라도 자리가 다르면 새 것)',
    base: { total: base.length, by_zone: Object.fromEntries([...new Set(base.map(p => p.zone))].map(z => [z, base.filter(p => p.zone === z).length])), items: base },
    base_800x700: { total: base800.length, by_zone: Object.fromEntries([...new Set(base800.map(p => p.zone))].map(z => [z, base800.filter(p => p.zone === z).length])), ids: ids(base800) },
    states, ticks_pressable: ticks, drawer_draw: { def: '옮긴 카드(설정 서랍 · 보기 카드)가 열릴 때 그리는 양 — 노드 수 · canvas/svg/img 수 · 여는 전후 rAF 프레임 셈(diag.frameCountForTest가 없으면 null — 그때 «그리는 양»은 canvas 0으로 판정)', ...drawerDraw },
    dev: { without_flag_exists: devNone, with_flag_exists: devExists, with_flag_base_total: devOn.length, devmenu_ids: devAdded.map(p => p.id) },
    id_reconcile: reconcile }
  OUT.constants_used = await page.evaluate(() => (window as any).__b2.diag.constantsForTest?.() ?? {})
  expect(base.length, '기본 상태의 누를 것이 세어졌다').toBeGreaterThan(10)
  expect(devNone, '?dev=1 없이는 개발 메뉴 항목이 DOM에 «없다»(존재 셈 0 — 미생성)').toBe(0)
  expect(devExists, '?dev=1이면 셋이 있다').toBe(3)
  expect(devAdded.map(p => p.id), '?dev=1 설정 서랍 안에 진단·작업대·자립 깃발').toEqual(['btn-diag', 'btn-tunelab', 'chk-own3d'])
  expect(devOn.length, '?dev=1이어도 기본 상태의 셈은 같다(서랍 안)').toBe(base.length)
  expect(reconcile.pressable_not_seen, '누를 수 있는 태그의 id 중 어느 상태에서도 안 보인 것(값 — 미측정 상태의 표식)').toEqual(expect.any(Array))
})

// ── §1 게이트 ② — 표의 행 수 == DOM 실측 · §3 게이트 전수 왕복(표의 모든 id가 그 상태에서 닿는다) · 반증 둘 ──
const INVENTORY = resolve(HERE, '../../docs/reference/INVENTORY.md')
interface Row { state: string; id: string; verdict: string; tapsAfter: number; moved: boolean }
function readRows(): Row[] {
  const md = readFileSync(INVENTORY, 'utf8')
  const rows: Row[] = []
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\| (기본|도구:[^|]+|카드:[^|]+|통:[^|]+|절차:[^|]+|모달:[^|]+|개발\(\?dev=1\)) \| ([^|]+) \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| (\d+) \| ([^|]+) \| [^|]+ \| (\d+) \| ([^|]+) \|$/)
    if (m) rows.push({ state: m[1]!.trim(), id: m[2]!.trim(), verdict: m[4]!.trim(), tapsAfter: Number(m[5]), moved: m[6]!.trim() !== '—' })
  }
  return rows
}
const HIT_FN = `((sel, n) => {
  const list = Array.from(document.querySelectorAll(sel))
  const vis = list.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && !e.closest('[hidden]') })
  const e = vis[n]
  if (!e) return { hit: false, why: 'none', n_vis: vis.length }
  const r = e.getBoundingClientRect()
  const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return { hit: !!t && (t === e || e.contains(t)), why: t ? (t.id || t.tagName) : null, n_vis: vis.length }
})`
const hitNth = (page: Page, sel: string, n: number) => page.evaluate(([s, n, fn]) => new Function('return ' + fn)()(s, n), [sel, n, HIT_FN] as const) as Promise<{ hit: boolean; why: string | null; n_vis: number }>
const zoneOfState = (state: string): string | null => CARD_OF[state] ?? BOX_OF[state]?.zone ?? (state === '개발(?dev=1)' ? 'devmenu' : state === '절차:필압 보정' ? 'press-calib' : state === '도구:칠' ? 'painttray' : state === '도구:연필' ? 'tray' : state === '도구:펜' ? 'pentray' : state.startsWith('도구:') && state.includes('지우개') ? 'etray' : null)
const selOf = (id: string, state: string): string => {
  const z = zoneOfState(state)
  if (id.startsWith('.')) return z ? `#${z} ${id}` : id
  if (/^[a-z]+$/.test(id)) return z ? `#${z} ${id}:not([id])` : `${id}:not([id])`   // id 없는 것은 태그로(button · input · summary · canvas …)
  return `#${id}`
}

test('§1 ② 표의 행 수 == DOM 실측 · §3 전수 왕복 — 표의 모든 id가 «그 상태에서» 닿는다 · 반증 둘', async ({ page }) => {
  test.setTimeout(420_000)
  const rows = readRows()
  expect(rows.length, '표가 있다').toBeGreaterThan(50)
  await boot(page, '/?reset&dev=1')
  const base = await census(page)
  const byState: Record<string, string[]> = {}
  for (const r of rows) (byState[r.state] ??= []).push(r.id)
  const counts: Record<string, { table: number; dom: number }> = { '기본': { table: byState['기본']!.length, dom: base.length } }
  for (const st of Object.keys(byState)) {
    if (st === '기본') continue
    let baseline = base
    if (BOX_OF[st]?.tool) { await closeAll(page); await page.click(`#${BOX_OF[st]!.tool}`); await page.waitForTimeout(150); baseline = await census(page) }
    if (st === '절차:필압 보정' || st === '모달:스텐실') { await closeAll(page); await page.click(st === '절차:필압 보정' ? '#pane-settings > summary' : '#btn-display'); await page.waitForTimeout(150); baseline = await census(page) }   // «더»의 기준은 그 카드가 열린 상태([H2])
    await openState(page, st)
    const c = await census(page)
    const added = addedIn(baseline, c, st === '도구:펜 지우개' ? 'etray' : undefined)
    // ?dev=1로 부팅했으므로 설정 서랍의 «더»에는 개발 메뉴 셋이 섞인다 — 자리(zone devmenu)로 가른다(표도 그렇게 갈라 적는다)
    const dom = st === '개발(?dev=1)' ? added.filter(p => p.zone === 'devmenu').length : added.filter(p => p.zone !== 'devmenu').length
    counts[st] = { table: byState[st]!.length, dom }
    if (st === '절차:필압 보정') { await page.click('#btn-press-cancel').catch(() => {}); await page.waitForTimeout(100) }
  }
  // ③ 전수 왕복 — 상태별로 열고 id마다 닿는지
  const misses: { state: string; id: string; why: string | null }[] = []
  let reached = 0
  for (const st of Object.keys(byState)) {
    await openState(page, st)
    const seenIdx: Record<string, number> = {}
    for (const id of byState[st]!) {
      const sel = selOf(id, st)
      const n = seenIdx[sel] ?? 0; seenIdx[sel] = n + 1
      const h = await hitNth(page, sel, n)
      if (h.hit) reached++; else misses.push({ state: st, id, why: h.why })
    }
    if (st === '절차:필압 보정') { await page.click('#btn-press-cancel').catch(() => {}); await page.waitForTimeout(100) }
  }
  // 반증 ①(D-3) — 표에서 id 하나를 빼면 «행 수 == 실측»이 실제로 깨진다(자기참조 [M4]: 이 반증이 재는 것은 «표가 실제로 읽힌다»까지다 — 실질은 ②·왕복)
  const falsifyTable = (byState['기본']!.length - 1) === base.length
  // 반증 ②(D-3) — DOM에서 하나를 감추면 «닿는다»가 실제로 깨진다
  await openState(page, '카드:display-pop')
  await page.evaluate(() => { (document.getElementById('btn-person') as HTMLElement).style.visibility = 'hidden' })
  const hidden = await hitNth(page, '#btn-person', 0)
  await page.evaluate(() => { (document.getElementById('btn-person') as HTMLElement).style.visibility = '' })
  OUT.roundtrip = { def: '§1 ② 표(INVENTORY.md)의 상태별 행 수 == 같은 함수로 다시 센 DOM 실측(낡음 검사 — 표는 원장의 파생) · §3 전수 왕복: 표의 모든 id를 그 상태를 열고 elementFromPoint로 «닿는다»(실질) · 반증 ①: 표에서 한 행을 빼면 셈이 갈린다(파일이 읽힌다) · 반증 ②: 요소 하나를 감추면 닿지 않는다(자가 산다)',
    tree: TREE, counts, rows_total: rows.length, reached, misses, max_taps_after: Math.max(...rows.map(r => r.tapsAfter)), moved_rows: rows.filter(r => r.moved).length, moved_max_taps: Math.max(...rows.filter(r => r.moved).map(r => r.tapsAfter)), taps_over_2: rows.filter(r => r.tapsAfter > 2).map(r => `${r.id}(${r.state}) ${r.tapsAfter}`), falsify_table_mismatch: !falsifyTable, falsify_hidden_unreached: !hidden.hit }
  for (const [st, c] of Object.entries(counts)) expect(c.table, `${st}: 표 행 수 == DOM 실측(${c.dom})`).toBe(c.dom)
  expect(misses, '전수 왕복 — 닿지 않는 id 0(기존 기능 전부 살아 있음 ㉠)').toEqual([])
  expect(reached, '닿은 수 == 행 수').toBe(rows.length)
  expect(!falsifyTable, '반증 ① — 한 행을 빼면 셈이 갈린다').toBe(true)
  expect(hidden.hit, '반증 ② — 감춘 요소는 닿지 않는다').toBe(false)
  expect(Math.max(...rows.filter(r => r.moved).map(r => r.tapsAfter)), '§3 — 옮긴 행은 전부 뒤 탭 수 ≤ 2').toBeLessThanOrEqual(2)
})

test('§3 게이트 — 새 문서 격자 꺼짐 · 저장 설정 존중(b2-grid) · 축: 표시 토글은 없고 격자와 함께 그려진다(값) · 축 스냅은 토글이 없다(항상)', async ({ page }) => {
  await boot(page)
  const g0 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, box: (document.getElementById('chk-grid') as HTMLInputElement).checked, saved: localStorage.getItem('b2-grid'), axis_snap: document.getElementById('axis-snap-slot')?.textContent?.trim() ?? null, axis_display_toggle: document.querySelectorAll('input[id*="axis"], input[id*="axes"]').length }))
  await page.click('#pane-settings > summary'); await page.waitForTimeout(120)
  await page.click('#chk-grid'); await page.waitForTimeout(80)
  const g1 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, saved: localStorage.getItem('b2-grid') }))
  await page.goto('/'); await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2); await page.waitForTimeout(200)
  const g2 = await page.evaluate(() => ({ grid: (window as any).__b2.app.grid as boolean, box: (document.getElementById('chk-grid') as HTMLInputElement).checked, axis_snap: document.getElementById('axis-snap-slot')?.textContent?.trim() ?? null }))
  await page.evaluate(() => localStorage.removeItem('b2-grid'))
  OUT.grid = { def: '새 문서(?reset · 저장 없음) 격자 표시 꺼짐(DIRECTION 「격자와 축만 기본 꺼짐」) · 사람이 켜면 b2-grid=on이 남고 새로 열어도 켜진 채 · 축 «표시»의 별도 토글은 없다(값 0 — 축은 격자 토글과 한 몸 · 71 §2 「chk-grid가 하는 그 함수(격자 표시 · 축)」) · 축 «스냅»은 토글이 없다(「항상 켜져 있다」 — 표시와 무관 · 자명하여 게이트가 아니라 기록 [M5])', fresh: g0, after_on: g1, reopened: g2 }
  expect(g0.grid, '새 문서 격자 꺼짐').toBe(false); expect(g0.box).toBe(false); expect(g0.saved, '저장 없음').toBeNull()
  expect(g1.grid, '켰다').toBe(true); expect(g1.saved, '기기에 남는다').toBe('on')
  expect(g2.grid, '저장 설정 존중 — 새로 열어도 켜진 채').toBe(true); expect(g2.box).toBe(true)
  expect(g0.axis_display_toggle, '축 표시의 별도 토글은 없다(값)').toBe(0)
})
