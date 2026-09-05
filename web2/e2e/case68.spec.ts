// web2-68 §1·§3 — 필통 여덟 · 브러시 목록 두 칸 · 크기 눈금 표식의 게이트.
//
//   ① 칸 8(도구 7 + 지우개 1 맨 끝 고정) · 옛 FAV_KEY 여섯이 새 판 앞 여섯으로 읽힌다(이주 시험 — 옛 저장물을 심는다 D-2) ·
//      새 판 저장 왕복 5/5
//   ② 칸 탭 → paintSel {i, br, hex, w, o}가 칸과 같다 · 긴 누름 → 칸이 지금 것과 같다 · 따라 기억(adopt) 무회귀(66-3의 자)
//   ③ 칸 그림의 촉 fill == 칸 hex(DOM) · 반증: 다른 hex 둘의 fill이 다르다 · 경도 글자 == 칸의 경도 · 숫자 == 칸의 w·o
//   ④ §2 화면 — 경도 끌기(몸짓) → 칸의 br 변경 → 다음 획의 br이 그 프리셋(획 실측) · 제도 연필 등급 app.grade 불변(회귀)
//   ⑤ §3-1 목록 — 패널 오른쪽 가장자리에 붙는다(값) · 세트 8 + 최근 · 견본 해시 == 같은 입력의 drawBrushSample(제품 함수) ·
//      「최근」 8 왕복(9 고름 → 8 · 재시작 생존)
//   ⑥ §3-2 눈금 — 점 탭 → w == 눈금 값 · 끌기(input) → 임의 값 유지(연속 · 58 R1 철회 무회귀) · 점 값이 √2 등비
//   ⑦ 34-0 몫 — 새 손잡이의 툴팁(#96 · 기존 규약)·elementFromPoint 닿음(#97)
//
// 원장: stage0/out/case68_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PENCIL_PRESET_OF_GRADE, CHARCOAL_PRESET_OF_GRADE } from '../src/core/grades68'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-68 §1 필통 · §2 화면(경도 끌기) · §3 목록 두 칸·눈금 표식',
  note_pitfalls: '#109(옛 판 → 새 판 이주 한 번 · 옛 열쇠는 이주 원본으로만) · #96·#97(34-0 몫) · #54(칸 탭·끌기·목록 전부 pickBrush 하나) · #42',
  pitfall_citations: [42, 54, 96, 97, 109],
  selfcheck_notes: {
    identical_pairs: '⑤ 견본 해시 «같음»은 «견본 = 그리는 그 함수»의 뜻 그 자체(62 규약) — 다른 입력(다른 hex)의 해시가 다르다(반증 열)',
    exact_ratio: '① 왕복 5/5 · ④ 획 br 일치는 구성 게이트(43 ② 선례) — 이주 시험이 «옛 저장물 → 새 판»을 값으로 든다',
    exact_one: 'g01_case.migrated_count = 1은 «이주는 한 번»의 뜻 그 자체(#109 — 옛 판을 바꿔도 새 판이 정본인 것을 같은 시험이 든다) — 비율이 아니라 횟수',
  },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/case68_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/case68.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

async function boot(page: Page, paint = true) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  if (paint) { await page.click('#btn-paint'); await page.waitForTimeout(120) }
}
const sel = (page: Page) => page.evaluate(() => { const ps = (window as any).__b2.app.paintSel; return { i: ps.i, br: ps.br, hex: ps.hex, w: ps.w, o: ps.o } })
const cellsOf = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#paint-favs > *')).map(el => {
    const b = (el.matches('button') ? el : el.querySelector('button')) as HTMLElement
    const tip = el.querySelector('svg .tip') as SVGElement | null
    return { id: b.id, kind: b.dataset.kind ?? (b.id === 'paint-erase' ? 'eraser' : ''), br: b.dataset.br ?? '', hex: b.dataset.hex ?? '', tip_fill: tip?.getAttribute('fill') ?? null,
      grade: (el.querySelector('.pcgrade') as HTMLElement | null)?.textContent ?? '', grade_hidden: (el.querySelector('.pcgrade') as HTMLElement | null)?.hidden ?? true,
      nums: (el.querySelector('.pcnums') as HTMLElement | null)?.textContent ?? '', on: b.classList.contains('on') }
  }))
const HIT_FN = `((id) => {
  const el = document.getElementById(id)
  if (!el) return { id, exists: false, hit: false, title: null }
  const r = el.getBoundingClientRect()
  const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return { id, exists: true, hit: !!t && (t === el || el.contains(t)), title: el.getAttribute('title'), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
})`
const hit = (page: Page, id: string) => page.evaluate(([i, fn]) => new Function('return ' + fn)()(i), [id, HIT_FN] as const) as Promise<{ id: string; exists: boolean; hit: boolean; title: string | null; rect?: number[] }>

test('① 칸 8 · 지우개 맨 끝 고정 · 옛 여섯 → 새 판 앞 여섯(이주) · 저장 왕복 5/5', async ({ page }) => {
  test.setTimeout(240_000)
  // D-2 — 옛 저장물(64 판 · 여섯 · 사양 포함)을 «심고» 연다
  const OLD = [
    { i: 'marker', br: 'tanda/marker-01', hex: '#112233', w: 21, o: 0.5 }, { i: 'brush', br: 'deevad/liner', hex: '#445566', w: 7 },
    { i: 'pencil', br: 'classic/charcoal' }, { i: 'cp', br: 'brunelleschi/colored_pencil', hex: '#778899' },
    { i: 'pencil', br: 'deevad/2B_pencil', o: 0.3 }, { i: 'brush', br: 'deevad/watercolor_expressive', hex: '#aabbcc', w: 40, o: 0.9 },
  ]
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.evaluate((old) => { localStorage.removeItem('b2.pencilcase68.v1'); localStorage.setItem('b2.brushFavs64.v1', JSON.stringify(old)) }, OLD)
  await page.goto('/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  const favs = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest() as { i: string; br: string; hex?: string; w?: number; o?: number }[])
  const migrated = await page.evaluate(() => (window as any).__b2.diag.paintCaseMigratedForTest() as number)
  const newKey = await page.evaluate(() => localStorage.getItem('b2.pencilcase68.v1'))
  const cells = await cellsOf(page)
  OUT.g01_case = { def: '필통 칸 수 8(도구 7 + 지우개 1 — 마지막 칸 id paint-erase · 끌어 바꿀 손잡이 없음) · 옛 판 여섯 → 새 판 앞 여섯(사양 포함) · 일곱째 기본(잉크펜) · 이주 «한 번»(새 판이 쓰인 뒤 옛 판은 다시 안 읽는다)',
    cells: cells.map(c => ({ id: c.id, kind: c.kind, br: c.br })), migrated_count: migrated, new_key_written: newKey !== null, favs_after: favs, old: OLD }
  expect(cells.length, '칸 8').toBe(8)
  expect(cells[7]!.id, '지우개가 맨 끝').toBe('paint-erase')
  expect(cells[7]!.kind).toBe('eraser')
  for (let k = 0; k < 6; k++) {
    expect(favs[k]!.br, `이주 — 옛 ${k + 1}번 브러시`).toBe(OLD[k]!.br)
    expect(favs[k]!.i, `이주 — 옛 ${k + 1}번 슬롯`).toBe(OLD[k]!.i)
    if (OLD[k]!.hex) expect(favs[k]!.hex, `이주 — 옛 ${k + 1}번 색`).toBe(OLD[k]!.hex)
    if (OLD[k]!.w) expect(favs[k]!.w, `이주 — 옛 ${k + 1}번 크기`).toBe(OLD[k]!.w)
    if (OLD[k]!.o) expect(favs[k]!.o, `이주 — 옛 ${k + 1}번 불투명`).toBe(OLD[k]!.o)
  }
  expect(favs[6]!.br, '일곱째는 기본(잉크펜)').toBe('deevad/liner')
  expect(migrated, '이주 한 번').toBe(1)
  expect(newKey, '새 판이 쓰였다').not.toBeNull()
  // 이주는 «한 번» — 옛 판을 바꿔도 새 판이 이긴다(#109 — 둘이 같이 살지 않는다)
  await page.evaluate(() => localStorage.setItem('b2.brushFavs64.v1', JSON.stringify([{ i: 'brush', br: 'classic/brush' }])))
  const favs2 = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest() as { br: string }[])
  expect(favs2[0]!.br, '옛 판을 바꿔도 새 판이 정본(이주는 한 번)').toBe(OLD[0]!.br)
  // 저장 왕복 5/5 — 긴 누름으로 칸에 놓고 새로 고침해 읽는다
  const roundtrip: { k: number; put: unknown; got: unknown; ok: boolean }[] = []
  for (let n = 0; n < 5; n++) {
    const k = n % 7
    const hex = `#${(0x203040 + n * 0x1a2b3c).toString(16).padStart(6, '0').slice(0, 6)}`
    await page.evaluate(([h, w, o]) => { const b2 = (window as any).__b2; b2.diag.setPaintInstrForTest('brush'); Object.assign(b2.app.paintSel, { hex: h, w, o, br: 'classic/brush' }) }, [hex, 10 + n * 3, +(0.4 + n * 0.1).toFixed(2)] as const)
    const box = (await page.locator(`#paint-fav-${k + 1}`).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up()
    await page.waitForTimeout(80)
    await page.goto('/')
    await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
    await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
    await page.click('#btn-paint'); await page.waitForTimeout(120)
    const got = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[k] as { i: string; br: string; hex?: string; w?: number; o?: number }
    const put = { i: 'brush', br: 'classic/brush', hex, w: 10 + n * 3, o: +(0.4 + n * 0.1).toFixed(2) }
    roundtrip.push({ k, put, got, ok: got.i === put.i && got.br === put.br && got.hex === put.hex && got.w === put.w && got.o === put.o })
  }
  OUT.g01_roundtrip = { def: '긴 누름(WRITE_HOLD_MS) → 새 판 저장 → 새로 고침 → 같은 칸 {i, br, hex, w, o}', rows: roundtrip, pass: roundtrip.filter(r => r.ok).length, n: roundtrip.length }
  expect(roundtrip.filter(r => r.ok).length, '저장 왕복 5/5').toBe(5)
})

test('② 칸 탭 → paintSel == 칸 · 긴 누름 → 칸 == 지금 것 · 따라 기억(adopt) 무회귀', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  const favs = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest() as { i: string; br: string; hex?: string; w?: number; o?: number }[])
  const taps: unknown[] = []
  for (let k = 0; k < 7; k++) {
    await page.click(`#paint-fav-${k + 1}`); await page.waitForTimeout(80)
    const s = await sel(page)
    const f = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[k] as { i: string; br: string; hex?: string; w?: number; o?: number }
    const ok = s.i === f.i && s.br === f.br && (f.hex === undefined || s.hex === f.hex) && (f.w === undefined || s.w === f.w) && (f.o === undefined || s.o === f.o)
    taps.push({ k, sel: s, cell: f, ok })
    expect(ok, `칸 ${k + 1} 탭 → paintSel == 칸`).toBe(true)
  }
  // 긴 누름 — 지금 것 전부를 칸 4에
  await page.evaluate(() => { const b2 = (window as any).__b2; b2.diag.setPaintInstrForTest('marker'); Object.assign(b2.app.paintSel, { hex: '#6a3c9e', w: 23, o: 0.55 }) })
  await page.evaluate(() => (window as any).__b2.diag.paintPanelSyncForTest?.())
  const box = (await page.locator('#paint-fav-4').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up(); await page.waitForTimeout(80)
  const held = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[3] as { i: string; br: string; hex?: string; w?: number; o?: number }
  const now = await sel(page)
  // adopt — 칸 4가 지금 브러시면 크기를 고칠 때 칸이 따라 기억한다(66-3)
  await page.evaluate(() => { const sr = document.getElementById('paint-size-range') as HTMLInputElement; sr.value = '31'; sr.dispatchEvent(new Event('input')) })
  await page.waitForTimeout(60)
  const adopted = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[3] as { w?: number }
  OUT.g02_tap_hold = { def: '탭 전수(칸 1~7 → paintSel == 칸) · 긴 누름(칸 4 ← 지금 {marker, br, #6a3c9e, 23, .55}) · adopt(크기 31 → 칸 4의 w)', taps, held, now, adopted_w: adopted.w, initial: favs }
  expect(held.i).toBe(now.i); expect(held.br).toBe(now.br); expect(held.hex).toBe('#6a3c9e'); expect(held.w).toBe(23); expect(held.o).toBe(0.55)
  expect(adopted.w, 'adopt — 같은 브러시의 칸이 크기를 따라 기억한다(66-3 무회귀)').toBe(31)
})

test('③ 촉 fill == 칸 hex(DOM) · 반증(다른 hex → 다른 fill) · 경도 글자 · 숫자', async ({ page }) => {
  await boot(page)
  const cells0 = await cellsOf(page)
  // 칸 1(연필 HB)의 색을 두 번 바꾼다 — 탭해서 지금 브러시로 만든 뒤 색을 고르면 adopt가 칸에 남긴다
  await page.click('#paint-fav-1'); await page.waitForTimeout(60)
  await page.evaluate(() => (window as any).__b2.diag.setPaintHexForTest('#c0392b')); await page.waitForTimeout(60)
  const cA = (await cellsOf(page))[0]!
  await page.evaluate(() => (window as any).__b2.diag.setPaintHexForTest('#1f6fd0')); await page.waitForTimeout(60)
  const cB = (await cellsOf(page))[0]!
  // 아주 밝은 색 — 촉 테두리가 남는다(stroke-width 온 굵기)
  await page.evaluate(() => (window as any).__b2.diag.setPaintHexForTest('#fafafa')); await page.waitForTimeout(60)
  const bright = await page.evaluate(() => { const t = document.querySelector('#paint-fav-1 svg .tip') as SVGElement; return { fill: t.getAttribute('fill'), sw: t.getAttribute('stroke-width') } })
  const favs = await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest() as { br: string; w?: number; o?: number }[])
  const s = await sel(page)
  const cells = await cellsOf(page)
  OUT.g03_tip = { def: '칸마다 svg .tip의 fill == 칸 hex(칸에 색이 없으면 지금 색) · 반증: #c0392b → #1f6fd0에서 fill이 따라 바뀐다 · 밝은 색(#fafafa · v > .92)은 촉 테두리 온 굵기 · 경도 글자 == 칸 br의 경도 · 숫자 == 칸의 w·o',
    initial: cells0, after_red: { hex: cA.hex, fill: cA.tip_fill }, after_blue: { hex: cB.hex, fill: cB.tip_fill }, bright, cells }
  for (const c of cells.slice(0, 7)) expect(c.tip_fill, `${c.id} 촉 fill == 칸 hex`).toBe(c.hex)
  expect(cA.tip_fill).toBe('#c0392b'); expect(cB.tip_fill).toBe('#1f6fd0')
  expect(cA.tip_fill !== cB.tip_fill, '반증 — 다른 hex 둘의 fill이 다르다').toBe(true)
  expect(bright.fill).toBe('#fafafa'); expect(bright.sw, '밝은 색은 촉 테두리 온 굵기').toBe('1.75')
  // 경도 글자 — 연필 HB · 연필 4B · 목탄 중 · 나머지는 없음(hidden)
  expect(cells[0]!.grade).toBe('HB'); expect(cells[1]!.grade).toBe('4B'); expect(cells[2]!.grade).toBe('중')
  for (const c of cells.slice(3, 7)) expect(c.grade_hidden, `${c.id}: 경도 축 밖 — 경도 글자 없음`).toBe(true)
  // 숫자 == 칸의 w·o(칸에 없으면 지금 값)
  for (let k = 0; k < 7; k++) {
    const w = favs[k]!.w ?? s.w, o = favs[k]!.o ?? s.o
    expect(cells[k]!.nums, `${cells[k]!.id} 숫자`).toBe(`${Math.round(w * 10) / 10}px · ${Math.round(o * 100)}%`)
  }
})

test('④ §2 화면 — 경도 끌기 → 칸의 br → 다음 획의 br(실측) · 제도 연필 등급 불변 · 목탄 축', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page, false)
  // 면 하나(paint67 bigBox의 벽)
  const line = async (x0: number, y0: number, x1: number, y1: number) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(40) }
  await line(60, 620, 1140, 620); await line(500, 700, 900, 610); await line(500, 700, 150, 620); await line(900, 610, 640, 560)
  await line(150, 620, 640, 560); await line(500, 700, 500, 330); await line(900, 610, 900, 330); await line(900, 330, 500, 330)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const grade0 = await page.evaluate(() => (window as any).__b2.app.grade as string)
  await page.click('#btn-paint'); await page.waitForTimeout(120)
  await page.click('#paint-fav-1'); await page.waitForTimeout(60)
  const br0 = (await sel(page)).br
  // 경도 글자를 아래로 끈다(두 칸 = HB → 2B) — 실제 포인터 몸짓(제도 연필 pencilDrag와 같은 감각 · PAINT68_GRADE_STEP_PX 10)
  const gb = (await page.locator('#paint-fav-1 .pcgrade').boundingBox())!
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
  await page.mouse.down(); await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 21, { steps: 4 }); await page.mouse.up()
  await page.waitForTimeout(80)
  const brDrag = (await sel(page)).br
  const cell1 = (await page.evaluate(() => (window as any).__b2.diag.paintFavsForTest()))[0] as { br: string }
  const gradeText = await page.locator('#paint-fav-1 .pcgrade').textContent()
  // 다음 획 — 펜 한 붓을 벽에 긋고 획의 br을 읽는다
  await page.evaluate(() => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, { pointerType: 'pen', pointerId: 7, isPrimary: true, buttons: b, pressure: b ? 0.55 : 0, clientX: x, clientY: y, bubbles: true, cancelable: true })
    el.dispatchEvent(mk('pointerdown', 560, 420, 1)); el.dispatchEvent(mk('pointermove', 640, 424, 1)); el.dispatchEvent(mk('pointermove', 760, 430, 1)); el.dispatchEvent(mk('pointerup', 760, 430, 0))
  })
  await page.waitForTimeout(200)
  const strokeBr = await page.evaluate(() => { const ss = (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint); return ss.length ? ss[ss.length - 1].paint.br : null })
  // 위로 되끌기(한 칸) → B — 그리고 끝(HB)에서 더 위로는 멈춘다
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
  await page.mouse.down(); await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 - 50, { steps: 4 }); await page.mouse.up()
  await page.waitForTimeout(80)
  const brUp = (await sel(page)).br
  // 목탄 칸(3) — 중 → 연
  const gc = (await page.locator('#paint-fav-3 .pcgrade').boundingBox())!
  await page.mouse.move(gc.x + gc.width / 2, gc.y + gc.height / 2)
  await page.mouse.down(); await page.mouse.move(gc.x + gc.width / 2, gc.y + gc.height / 2 + 12, { steps: 3 }); await page.mouse.up()
  await page.waitForTimeout(80)
  const brChar = (await sel(page)).br
  const grade1 = await page.evaluate(() => (window as any).__b2.app.grade as string)
  // 반증 — 경도 축 밖 칸(마커 · 칸 5)의 글자 자리는 없다(끌 것이 없다): 끌어도 br 불변
  await page.click('#paint-fav-5'); await page.waitForTimeout(60)
  const brM0 = (await sel(page)).br
  const mb = (await page.locator('#paint-fav-5').boundingBox())!
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 8); await page.mouse.down(); await page.mouse.move(mb.x + mb.width / 2, mb.y + 40, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(80)
  const brM1 = (await sel(page)).br
  OUT.g04_grade_drag = { def: '칸 1(HB)의 경도 글자를 21px 아래로 끌면 두 칸 무른 쪽(2B) → paintSel.br · 칸 br · 다음 펜 획의 paint.br 셋이 같다 · 50px 위로 끌면 끝(HB)에서 멈춘다 · 목탄 칸 3(중 → 연) · 제도 연필 app.grade 불변 · 반증: 축 밖 칸(마커)은 끌어도 br 불변',
    br0, after_drag: brDrag, cell_br: cell1.br, grade_text: gradeText, stroke_br: strokeBr, after_up: brUp, charcoal: brChar, app_grade: [grade0, grade1], marker_falsify: [brM0, brM1] }
  expect(br0).toBe(PENCIL_PRESET_OF_GRADE.HB)
  expect(brDrag, '끌기 → 2B').toBe(PENCIL_PRESET_OF_GRADE['2B'])
  expect(cell1.br, '칸의 br').toBe(PENCIL_PRESET_OF_GRADE['2B'])
  expect(gradeText).toBe('2B')
  expect(strokeBr, '다음 획이 그 프리셋으로 그어진다(획 br 실측)').toBe(PENCIL_PRESET_OF_GRADE['2B'])
  expect(brUp, '끝에서 멈춘다(HB)').toBe(PENCIL_PRESET_OF_GRADE.HB)
  expect(brChar, '목탄 중 → 연').toBe(CHARCOAL_PRESET_OF_GRADE['연'])
  expect(grade1, '제도 연필 등급 불변(다른 도구)').toBe(grade0)
  expect(brM1, '반증 — 축 밖 칸은 끌어도 br 불변').toBe(brM0)
})

test('⑤ §3-1 목록 두 칸 — 패널 오른쪽에 붙는다 · 세트 8 + 최근 · 견본 == 제품 함수 · 최근 8 왕복', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  await page.click('#paint-brush-btn'); await page.waitForTimeout(250)
  const place = await page.evaluate(() => {
    const p = document.getElementById('painttray')!.getBoundingClientRect(), b = document.getElementById('brushpick')!.getBoundingClientRect()
    return { panel_right: Math.round(p.right), pick_left: Math.round(b.left), pick_right: Math.round(b.right), gap: Math.round(b.left - p.right), vw: window.innerWidth, pick_top: Math.round(b.top), panel_top: Math.round(p.top) }
  })
  const sets = await page.evaluate(() => Array.from(document.querySelectorAll('#brushpick-sets button')).map(b => ({ id: b.id, group: (b as HTMLElement).dataset.group, text: b.textContent })))
  // 세트 하나(Tanda)를 왼쪽 열에서 고른다 → 오른쪽에 그 브러시만 선다
  await page.click('#brushpick-set-Tanda'); await page.waitForTimeout(300)
  const visible = await page.evaluate(() => Array.from(document.querySelectorAll('#brushpick-list details')).filter(d => !(d as HTMLElement).hidden).map(d => (d as HTMLElement).dataset.group))
  const rowH = await page.evaluate(() => { const r = document.querySelector('#brushpick-list details[data-group="Tanda"] button[data-name]') as HTMLElement; return Math.round(r.getBoundingClientRect().height) })
  // 견본 해시 == 같은 입력의 drawBrushSample(제품 함수 · 다른 hex는 다른 해시 — 반증)
  const sample = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const row = document.querySelector('#brushpick-list details[data-group="Tanda"] button[data-name="tanda/pencil-2b"]') as HTMLElement
    const cv = row.querySelector('canvas') as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
    let hh = 0; for (let i = 0; i < d.length; i += 4) hh = (Math.imul(hh, 31) + d[i]! + d[i + 1]! + d[i + 2]!) | 0
    const tool = b2.diag.paintInstrForTest(), hex = b2.app.paintSel.hex
    return { row_hash: hh, fresh_hash: b2.diag.brushSampleHashForTest(tool, 'tanda/pencil-2b', hex), other_hex_hash: b2.diag.brushSampleHashForTest(tool, 'tanda/pencil-2b', hex === '#123456' ? '#654321' : '#123456'), tool, hex, cw: cv.width, ch: cv.height }
  })
  // 최근 — 아홉을 고르면 여덟만 남고 «고른 순»(맨 앞이 마지막)
  const names = ['tanda/pencil-2b', 'tanda/pencil-8b', 'tanda/charcoal-01', 'tanda/charcoal-03', 'tanda/charcoal-04', 'tanda/marker-01', 'tanda/marker-05', 'tanda/oil-mop', 'tanda/water-01']   // Tanda 35 중 아홉(presets.gen 실재 이름)
  const picked: string[] = []
  for (const n of names) {
    const id = `#brushpick-${n.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    if (await page.locator(id).count() === 0) continue
    await page.click(id); await page.waitForTimeout(60); picked.push(n)
  }
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('b2.brushRecent68.v1') ?? '[]') as string[])
  await page.click('#brushpick-set-recent'); await page.waitForTimeout(200)
  const recentRows = await page.evaluate(() => Array.from(document.querySelectorAll('#brushpick-list details[data-group="최근"] button[data-name]')).map(b => (b as HTMLElement).dataset.name))
  await page.click('#brushpick-close')
  // 재시작 생존
  await page.goto('/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.click('#btn-paint'); await page.waitForTimeout(120)
  await page.click('#paint-brush-btn'); await page.waitForTimeout(250)
  const recent2 = await page.evaluate(() => JSON.parse(localStorage.getItem('b2.brushRecent68.v1') ?? '[]') as string[])
  const curSet = await page.evaluate(() => (document.querySelector('#brushpick-sets button.on') as HTMLElement | null)?.dataset.group ?? null)
  OUT.g05_list = { def: '목록이 패널 오른쪽 가장자리에 붙는다(gap == FLYOUT_GAP_PX 8 · 화면 안) · 왼쪽 세트 열 = 최근 + 8 · 세트를 고르면 오른쪽에 그 세트만(hidden 아닌 details 1) · 행 높이 ≈ 48 · 견본 해시 == 같은 입력의 제품 함수(다른 hex는 다른 해시) · 최근: 9 고름 → 8 · 고른 순 · 재시작 생존',
    place, sets, visible_after_tanda: visible, row_height: rowH, sample, picked, recent, recent_rows: recentRows, recent_after_reload: recent2, set_on_reopen: curSet }
  expect(place.gap, '패널 오른쪽에 붙는다(FLYOUT_GAP_PX)').toBe(8)
  expect(place.pick_right, '화면 안').toBeLessThanOrEqual(place.vw)
  expect(sets.length, '세트 8 + 최근').toBe(9)
  expect(sets[0]!.group).toBe('최근')
  expect(visible, '고른 세트만 선다').toEqual(['Tanda'])
  expect(rowH, '행 높이 ≈ 48').toBeGreaterThanOrEqual(44); expect(rowH).toBeLessThanOrEqual(56)
  expect(sample.row_hash, '견본 해시 == 제품 함수(같은 입력)').toBe(sample.fresh_hash)
  expect(sample.row_hash !== sample.other_hex_hash, '반증 — 다른 hex는 다른 해시').toBe(true)
  expect(picked.length, '아홉을 골랐다(픽스처)').toBe(9)
  expect(recent.length, '최근 8').toBe(8)
  expect(recent, '고른 순(마지막이 맨 앞)').toEqual(picked.slice().reverse().slice(0, 8))
  expect(recentRows).toEqual(recent)
  expect(recent2, '재시작 생존').toEqual(recent)
})

test('⑥ §3-2 눈금 표식 — 점 탭 → w == 눈금 값 · 끌기 → 임의 값(연속) · √2 등비 · ⑦ 34-0 몫(툴팁·닿음)', async ({ page }) => {
  await boot(page)
  const C = await page.evaluate(() => (window as any).__b2.diag.constantsForTest())
  const ticks = await page.evaluate(() => Array.from(document.querySelectorAll('#paint-size-ticks .tick')).map(t => Number((t as HTMLElement).dataset.v)))
  const ratios = ticks.slice(1).map((v, i) => +(v / ticks[i]!).toFixed(3))
  // 점 탭 — 중간 눈금 하나(잉크펜 족 · 최대 500)
  const pick = ticks[Math.floor(ticks.length / 2)]!
  const tb = (await page.locator(`#paint-size-ticks .tick[data-v="${pick}"]`).boundingBox())!
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(60)   // 탭 = 띠 위 그 자리(가장 가까운 눈금 — 점이 겹치는 작은 끝에서도 «누른 자리»가 값이다)
  const wTap = (await sel(page)).w
  // 끌기(input) — 눈금 사이의 임의 값이 그대로 남는다(연속 · R1 철회 무회귀)
  await page.evaluate(() => { const sr = document.getElementById('paint-size-range') as HTMLInputElement; sr.value = '17.5'; sr.dispatchEvent(new Event('input')) }); await page.waitForTimeout(60)
  const wDrag = (await sel(page)).w
  const step = await page.evaluate(() => (document.getElementById('paint-size-range') as HTMLInputElement).step)
  // 슬롯을 바꾸면 눈금이 그 도구의 최대까지(연필 50)
  await page.click('#paint-fav-1'); await page.waitForTimeout(80)
  const ticksPencil = await page.evaluate(() => Array.from(document.querySelectorAll('#paint-size-ticks .tick')).map(t => Number((t as HTMLElement).dataset.v)))
  // ⑦ 34-0 몫 — 새 손잡이의 툴팁·닿음
  const ids = ['paint-fav-1', 'paint-fav-7', 'paint-erase', 'paint-erase-soft', 'paint-size-range']
  const census = await Promise.all(ids.map(id => hit(page, id)))
  const tickHit = await page.evaluate(() => { const strip = document.getElementById('paint-size-ticks') as HTMLElement; const t = strip.querySelector('.tick') as HTMLElement; const r = t.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hit: at === strip || strip.contains(at), top: (at as HTMLElement | null)?.id || at?.className || null } })
  const gradeHit = await page.evaluate(() => { const t = document.querySelector('#paint-fav-1 .pcgrade') as HTMLElement; const r = t.getBoundingClientRect(); const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hit: at === t } })
  OUT.g06_ticks = { def: '눈금 값 = PAINT68_TICK_BASE × √2^k(≥ 최소 · ≤ 그 도구의 최대) · 점 탭 → w == 값 · input 17.5 → 17.5 그대로(연속 · step .5) · 슬롯 바꿈 → 눈금이 그 도구의 최대까지', ticks_brush: ticks, ratios, pick, w_after_tap: wTap, w_after_drag: wDrag, step, ticks_pencil: ticksPencil, constants: { base: C.PAINT68_TICK_BASE, ratio: C.PAINT68_TICK_RATIO, max: C.PAINT58_MAX_W } }
  OUT.g07_census = { def: '34-0 몫 — 새 손잡이(필통 칸·지우개 칸·경도·눈금)의 툴팁(#96 · 기존 규약 — 눈금·경도 글자는 새 툴팁 없음(지시 ⛔))과 elementFromPoint 닿음(#97)', census, tick: tickHit, grade: gradeHit }
  expect(ticks.length, '눈금이 있다').toBeGreaterThan(5)
  for (const r of ratios) expect(Math.abs(r - Math.SQRT2), '√2 등비').toBeLessThan(0.02)
  expect(ticks[ticks.length - 1]!, '그 도구의 최대까지').toBeLessThanOrEqual(C.PAINT58_MAX_W.brush)
  expect(wTap, '점 탭 → w == 눈금 값').toBe(pick)
  expect(wDrag, '끌기 → 임의 값 그대로(연속)').toBe(17.5)
  expect(ticksPencil[ticksPencil.length - 1]!, '연필의 최대까지').toBeLessThanOrEqual(C.PAINT58_MAX_W.pencil)
  expect(ticksPencil.length, '연필은 눈금이 더 적다(최대 50)').toBeLessThan(ticks.length)
  for (const c of census) { expect(c.exists && c.hit, `${c.id} 닿는다`).toBe(true); expect((c.title ?? '').length > 4, `${c.id} 툴팁`).toBe(true) }
  expect(tickHit.hit, '눈금 점이 눌린다').toBe(true)
  expect(gradeHit.hit, '경도 글자가 눌린다').toBe(true)
})
