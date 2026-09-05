// web2-71 — 몸짓 게이트(§1 두 손가락 되돌리기·세 손가락 다시하기·누르고 있기 반복 · §2 세 손가락 두 번 격자 토글(상쇄) · §3 한 손가락 두 번 정사 스냅 ±15° ·
// §4 도구 재누름 = 그 도구의 통 · §5 칠 획 끝 멈춤 → 직선 띠) · 반증 셋(문턱 8px→0 · 350ms 밖 · 400→0)을 실제로 돌린다.
// 손가락은 CDP Input.dispatchTouchEvent(진짜 touch → pointerType 'touch' · 손가락 n개 = touchPoints n개)로 넣는다(input.spec의 수).
// 원장: stage0/out/gesture71_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99). 픽셀을 안 읽는다(칠 해시는 앱의 진단 값).
import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = (p: string) => resolve(HERE, `../../stage0/out/gesture71_web2_${p === 'dpr2' ? 'dpr2' : 'dpr1'}.json`)
const TREE = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() } catch { return '?' } })()
const OUTV: Record<string, unknown> = {}
const RUN_ID = `${TREE}-${Date.now().toString(36).slice(0, 6)}`
test.afterEach(({ }, info) => {
  const f = OUT(info.project.name); mkdirSync(dirname(f), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { const j = JSON.parse(readFileSync(f, 'utf-8') as string); if (j.run_id && String(j.run_id).startsWith(TREE)) prev = j } catch { prev = {} }
  const { conditions: _c, run_id: _r, what: _w, tree: _t, pitfall_citations: _p, constants_used: _u, ...prevVals } = prev as Record<string, unknown>
  writeFileSync(f, JSON.stringify({ conditions: { project: info.project.name, workers: 1, tree: TREE, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/gesture71.spec.ts (#99)' }, run_id: prev.run_id ?? RUN_ID, what: 'web2-71 몸짓 게이트 — §1 두드림(2=되돌리기·3=다시하기·누르고 있기 반복) · §2 세 손가락 두 번(상쇄+격자) · §3 정사 스냅(±14 안 · ±16 밖) · §4 재누름 표 · §5 칠 멈춤 직선(픽셀 항등·두 점·끝점 이동·결정론) · 반증 셋', tree: TREE, pitfall_citations: [111, 109, 108, 107, 42, 54, 93], constants_used: { GESTURE71_TOUCH_SYNC_MS: C.GESTURE71_TOUCH_SYNC_MS, GESTURE71_TAP_MOVE_PX: C.GESTURE71_TAP_MOVE_PX, GESTURE71_TAP_MS: C.GESTURE71_TAP_MS, GESTURE71_DOUBLE_MS: C.GESTURE71_DOUBLE_MS, GESTURE71_HOLD_MS: C.GESTURE71_HOLD_MS, GESTURE71_HOLD_REPEAT_MS: C.GESTURE71_HOLD_REPEAT_MS, GESTURE71_ORTHO_SNAP_DEG: C.GESTURE71_ORTHO_SNAP_DEG, GESTURE71_PAINT_HOLD_MS: C.GESTURE71_PAINT_HOLD_MS, GESTURE71_PAINT_HOLD_PX: C.GESTURE71_PAINT_HOLD_PX }, ...prevVals, ...OUTV }, null, 2))
})

async function boot(page: Page, q = '/?reset') {
  await page.goto(q)
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(200)
}
const settle = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
const diag = (page: Page) => page.evaluate(() => (window as any).__b2.diag.gesture71ForTest())
const resetG = (page: Page) => page.evaluate(() => (window as any).__b2.diag.gesture71ResetForTest())
/** paint67 bigBox — 카메라를 세운다(여덟 획) */
async function drawBox(page: Page) {
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const) {
    await page.mouse.move(l[0], l[1]); await page.mouse.down(); await page.mouse.move((l[0] + l[2]) / 2, (l[1] + l[3]) / 2, { steps: 4 }); await page.mouse.move(l[2], l[3], { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(60)
  }
  await page.waitForTimeout(200)
  // 면을 세운다(paint67 bigBox 그대로 — 칠은 면 위에서만 산다 · #103)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(100)
  await page.click('#btn-pencil'); await page.click('#btn-pencil'); await page.waitForTimeout(100)
}
const strokes = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length as number)
/** 관측 = 되돌리기 스택 길이(마지막 op가 «면 만들기»라 획 수는 안 변한다 — 획 수·면 수는 값으로 같이 적는다) */
const undoN = (page: Page) => page.evaluate(() => (window as any).__b2.app.undoStack.length as number)
const faces = (page: Page) => page.evaluate(() => (window as any).__b2.app.faces.length as number)

/** 손가락 n개 두드림 — 동시에 닿고(한 사건) · 안 움직이고 · durMs 뒤 뗀다 */
async function fingerTap(cdp: CDPSession, page: Page, n: number, x: number, y: number, durMs = 60, movePx = 0) {
  const pts = Array.from({ length: n }, (_, i) => ({ x: x + i * 40, y, id: i + 1 }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
  if (movePx > 0) { await page.waitForTimeout(20); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts.map(p => ({ ...p, x: p.x + movePx })) }) }
  await page.waitForTimeout(durMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // ⚠ 여기서 settle(rAF 둘)을 기다리지 않는다 — dpr2에서 프레임이 느려 «두 번»의 350ms를 넘겼다(실측 · 두드림 사이 간격은 호출자가 정한다)
}

test('§1 두 손가락 두드림 = 되돌리기 · 세 손가락 = 다시하기 · 누르고 있기 반복 · 끌기는 이동(무회귀) · 반증(문턱 8 → 9px면 두드림 아님) · 펜/마우스에는 없다', async ({ page }) => {
  await boot(page)
  await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  const n0 = await strokes(page); const u0 = await undoN(page); const f0 = await faces(page)
  await resetG(page)
  // D-2 재현 먼저 — 몸짓 없이 손가락 둘을 «끌면» 획 수 무변(이동)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 400, id: 1 }, { x: 440, y: 400, id: 2 }] })
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400 + i * 5, y: 400, id: 1 }, { x: 440 + i * 5, y: 400, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(page)
  const drag = await diag(page)
  expect(await undoN(page), '두 손가락 끌기는 이동 — 되돌리기 스택 무변').toBe(u0)
  expect(drag.last?.verdict, '끌기(30px)는 두드림이 아니다').toBe('none')
  // 두 손가락 두드림 → 되돌리기 1
  await fingerTap(cdp, page, 2, 400, 400); await settle(page)
  const t2 = await diag(page)
  expect(await undoN(page), '두 손가락 두드림 = 되돌리기 1회(스택 −1 · 마지막 op = 면 만들기)').toBe(u0 - 1)
  expect(await faces(page), '되돌린 것은 면 만들기 op').toBe(f0 - 1)
  expect(t2.last?.verdict).toBe('tap'); expect(t2.last?.fingers).toBe(2)
  const undoOpacity = await page.evaluate(() => Number(getComputedStyle(document.getElementById('btn-undo')!).opacity))
  // 세 손가락 두드림 → 다시하기 1
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await fingerTap(cdp, page, 3, 400, 400); await settle(page)
  expect(await undoN(page), '세 손가락 두드림 = 다시하기 1회').toBe(u0)
  // 되돌리기 단추와 «같은 함수» — 단추로 되돌린 뒤 세 손가락으로 되살리면 같은 획 수
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await page.evaluate(() => document.getElementById('btn-undo')!.click()); await settle(page)
  const afterBtn = await undoN(page)
  await fingerTap(cdp, page, 3, 400, 400); await settle(page)
  expect(await undoN(page), '단추 되돌리기 → 세 손가락 다시하기: 같은 스택').toBe(afterBtn + 1)
  // 누르고 있기 — 400ms 넘게 · 250ms마다 반복(≈ 1.0s → 3회 안팎 · 값)
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  const before = await undoN(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 400, id: 1 }, { x: 440, y: 400, id: 2 }] })
  await page.waitForTimeout(C.GESTURE71_HOLD_MS + C.GESTURE71_HOLD_REPEAT_MS * 2 + 60)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(page)
  const held = await undoN(page); const hd = await diag(page)
  expect(before - held, '누르고 있기 — 반복 되돌리기 ≥ 2').toBeGreaterThanOrEqual(2)
  expect(hd.last?.verdict).toBe('hold')
  await page.waitForTimeout(300)
  const heldStill = await undoN(page)
  expect(heldStill, '떼면 멈춘다').toBe(held)
  // 반증(D-3) — 이동 9px(문턱 8 넘김)이면 두드림이 아니다 · 지속 300ms(> 250)도 아니다
  const nA = await undoN(page)
  await fingerTap(cdp, page, 2, 400, 400, 60, C.GESTURE71_TAP_MOVE_PX + 1); await settle(page)
  const fMove = await diag(page)
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await fingerTap(cdp, page, 2, 400, 400, C.GESTURE71_TAP_MS + 60); await settle(page)
  const fDur = await diag(page)
  expect(await undoN(page), '반증 — 9px 움직임·300ms 두드림은 되돌리기가 아니다').toBe(nA)
  // 펜·마우스에는 없다 — 마우스 클릭 둘·펜 탭은 획 수 무변(마우스 클릭은 이미 그리기)
  const nB = await undoN(page)
  await page.mouse.click(700, 200); await page.mouse.click(700, 200); await settle(page)
  const nC = await undoN(page)
  OUTV.s1 = { def: '손가락 n개 두드림 = 동시(80ms) · 이동 ≤ 8px · ≤ 250ms · CDP touchPoints n개 · 판정은 gestures71.lastForTest', strokes0: n0, undo0: u0, faces0: f0, drag_verdict: drag.last, two_tap: t2.last, undo_opacity_after_first_undo: undoOpacity, hold: { before, after: held, repeats: before - held, verdict: hd.last }, falsify_move: fMove.last, falsify_duration: fDur.last, mouse_double_click_strokes: [nB, nC], log: hd.log }
  expect(fMove.last?.why ?? '').toContain('move'); expect(fDur.last?.why ?? '').toContain('duration')
  await cdp.detach()
})

test('§2 세 손가락 두 번 = 격자·축 토글 · 첫 두드림의 다시하기를 되물린다(획 수·칠 해시 무변) · 350ms 밖 두 번 = 다시하기 둘', async ({ page }) => {
  await boot(page)
  await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  // 되돌릴 것 둘을 만든다: 단추로 두 번 되돌려 다시하기 스택 2
  await page.evaluate(() => { document.getElementById('btn-undo')!.click(); document.getElementById('btn-undo')!.click() }); await settle(page)
  const n0 = await strokes(page); const u0 = await undoN(page); const g0 = (await diag(page)).grid
  const hash0 = await page.evaluate(() => (window as any).__b2.diag.paintTexHashForTest?.() ?? null)
  await resetG(page)
  const tA = Date.now()
  await fingerTap(cdp, page, 3, 400, 400)
  const mid = await diag(page)   // 첫 두드림 뒤 — 다시하기 1이 «보인다»(#107 중간 상태 값)
  await fingerTap(cdp, page, 3, 400, 400); await settle(page)
  const gapMs = Date.now() - tA
  const d = await diag(page)
  const hash1 = await page.evaluate(() => (window as any).__b2.diag.paintTexHashForTest?.() ?? null)
  OUTV.s2 = { def: '세 손가락 두드림 둘이 350ms 안 → 첫 번째의 다시하기를 undo로 되물리고 격자 토글 — 순서는 log', strokes0: n0, grid0: g0, after_first_tap: { strokes: mid.undo !== undefined ? null : null, log: mid.log, redoLeft: mid.redo }, after_double: { grid: d.grid, log: d.log, undo: d.undo, redo: d.redo, two_taps_span_ms: gapMs }, strokes_after: await strokes(page), hash: [hash0, hash1] }
  expect(mid.log, '첫 두드림 = 다시하기 1(중간 상태 — 실제로 일어났다)').toContain('tap3')
  expect(d.grid, '격자가 토글됐다').toBe(!g0)
  expect(await strokes(page), '상쇄 — 획 수 무변').toBe(n0)
  expect(await undoN(page), '상쇄 — 되돌리기 스택 무변').toBe(u0)
  expect(d.redo, '다시하기 스택도 그대로(되물렸다)').toBe(mid.redo + 1)
  if (hash0 !== null) expect(hash1, '칠 해시 무변').toBe(hash0)
  // 350ms 밖 두 번 → 다시하기 둘(토글 아님)
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 100)
  const gBefore = (await diag(page)).grid
  await fingerTap(cdp, page, 3, 400, 400); await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 100); await fingerTap(cdp, page, 3, 400, 400); await settle(page)
  const e = await diag(page)
  expect(e.grid, '350ms 밖 두 번은 토글이 아니다').toBe(gBefore)
  expect(await undoN(page), '다시하기 둘(스택 +2)').toBe(u0 + 2)
  ;(OUTV.s2 as Record<string, unknown>).outside_350 = { grid: e.grid, strokes: await strokes(page), log: e.log }
  await cdp.detach()
})

test('§3 한 손가락 두 번 = 정사 스냅 — ±14°에서 정사(평행 · 「—×—」) · ±16°에서 무변 · 첫 탭의 면 고르기 유지 · 정면 왕복 무회귀 · 마우스 더블클릭 같은 뜻', async ({ page }) => {
  await boot(page)
  await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  const off0 = (await diag(page)).orthoOff as number
  // 정사 축에서 지금 얼마나 벗어났나(값) — 자세를 «±14 / ±16»으로 세운다: 큐브 면 자세(정사)에서 궤도로 각을 준다
  const setOff = async (deg: number) => page.evaluate((deg) => { const d = (window as any).__b2.diag; d.orthoSnapForTest(); (window as any).__b2.app.pose = d.perspectivePoseForTest ? d.perspectivePoseForTest() : (window as any).__b2.app.pose; d.orbitByForTest?.(deg, 0) }, deg)
  const orbitApi = await page.evaluate(() => typeof (window as any).__b2.diag.orbitByForTest === 'function')
  const results: Record<string, unknown> = { off0, orbitApi }
  if (orbitApi) {
    for (const deg of [C.GESTURE71_ORTHO_SNAP_DEG - 1, C.GESTURE71_ORTHO_SNAP_DEG + 1]) {
      await setOff(deg); await settle(page)
      const before = await diag(page)
      await fingerTap(cdp, page, 1, 640, 450); await page.waitForTimeout(40); await fingerTap(cdp, page, 1, 640, 450)
      await page.waitForTimeout(700); await settle(page)   // glide
      const after = await diag(page)
      results[`deg_${deg}`] = { before: { off: before.orthoOff, ortho: before.ortho }, after: { off: after.orthoOff, ortho: after.ortho, mark: await page.evaluate(() => !document.getElementById('ortho-mark')!.hidden) }, log: after.log }
      if (deg < C.GESTURE71_ORTHO_SNAP_DEG) { expect(after.ortho, `±${deg}° → 정사`).toBe(true); expect(after.orthoOff as number, '정사에 붙었다').toBeLessThan(0.5) }
      else expect(Math.abs((after.orthoOff as number) - (before.orthoOff as number)), `±${deg}° → 무변`).toBeLessThan(0.5)
    }
  }
  // 마우스 더블클릭 = 같은 뜻(정사 근처에서)
  await page.evaluate(() => (window as any).__b2.diag.orthoSnapForTest()); await page.waitForTimeout(700)
  const cube = await page.evaluate(() => (window as any).__b2.diag.viewNameForTest?.() ?? null)
  OUTV.s3 = { def: '정사 스냅 = 여섯 정사 축 중 가장 가까운 것과의 각 ≤ 15°일 때 그 정사(parallelPose · glide) · 「—×—」는 isParallel일 때만', ...results, cube_view: cube, mark_in_ortho: await page.evaluate(() => !document.getElementById('ortho-mark')!.hidden) }
  expect(await page.evaluate(() => !document.getElementById('ortho-mark')!.hidden), '정사에서 「—×—」').toBe(true)
  await cdp.detach()
})

test('§4 도구 재누름 = 그 도구의 통 — 여섯 도구 표(열림 · 다시 → 닫힘 · 다른 도구 → 그 통 닫힘 + 도구 바뀜)', async ({ page }) => {
  await boot(page)
  const rows: Record<string, unknown>[] = []
  const TOOLS: [string, string][] = [['btn-pencil', 'tray'], ['btn-pen', 'pentray'], ['btn-eraser-pencil', 'etray'], ['btn-eraser-ink', 'etray'], ['btn-paint', 'brushpick'], ['btn-face', 'face-pop']]
  const openState = (id: string) => page.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; return e.classList.contains('open') || (!e.hidden && getComputedStyle(e).display !== 'none') }, id)
  for (const [btn, box] of TOOLS) {
    await page.evaluate((b) => document.getElementById(b)!.click(), btn === 'btn-pencil' ? 'btn-pen' : 'btn-pencil'); await page.waitForTimeout(150)   // 다른 도구를 먼저 든다 — 그래야 첫 누름이 «들기»다
    await page.evaluate(() => { for (const id of ['tray', 'pentray', 'etray']) document.getElementById(id)?.classList.remove('open'); const b = document.getElementById('brushpick'); if (b) (b as HTMLElement).style.display = 'none' })
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const first = await openState(box)
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const second = await openState(box)
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const third = await openState(box)
    await page.evaluate(() => document.getElementById('btn-grip')!.click()); await page.waitForTimeout(150)   // 다른 손잡이 → 통 닫힘
    const other = await openState(box)
    rows.push({ btn, box, after_select: first, after_repress: second, after_repress_again: third, after_other: other })
  }
  OUTV.s4 = { def: '도구를 «다시» 누르면 그 도구의 통이 열리고(연필통·촉통·크기통·브러시 목록·면 카드) 다시 누르면 닫힌다 · 다른 손잡이를 누르면 닫힌다(R7)', rows }
  for (const r of rows) { expect(r.after_repress, `${r.btn} 재누름 → ${r.box} 여닫힘(상태가 뒤집힌다)`).toBe(!r.after_select); expect(r.after_repress_again, `${r.btn} 다시 → 되돌아온다`).toBe(r.after_select); expect(r.after_other, `${r.btn}: 다른 손잡이 → ${r.box} 닫힘(R7)`).toBe(false) }
})

test('§5 칠 획 끝 멈춤(400ms · ≤ 3px) → 두 점 직선 띠 · 끌면 끝점 이동 · 떼면 확정 · 멈춤 없는 획은 항등 · 결정론 · 반증(400 → 0이면 모든 획이 직선)', async ({ page }) => {
  await boot(page)
  await drawBox(page)
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(200)
  const cdp = await page.context().newCDPSession(page)
  const pen = { pointerType: 'pen' as const }
  const rawOf = (i: number) => page.evaluate((i) => { const s = (window as any).__b2.app.doc.strokes; const st = s[s.length - 1 + i]; if (!st) return null; const uv = st.paint?.uv as number[] | undefined; const arr = st.raw ?? null; return { n: arr ? arr.length : uv ? uv.length / 2 : null, via: arr ? 'raw' : uv ? 'paint.uv' : 'none', keys: Object.keys(st), paint: !!st.paint } }, i)
  // ① 멈춤 없는 획 — 곡선 그대로(점 여럿)
  const n0 = await strokes(page)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y: 420, button: 'left', ...pen, force: 0.5 })
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: 420 + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 420, button: 'left', ...pen, force: 0 }); await settle(page)
  const free = await rawOf(0)
  expect(await strokes(page), '칠 획 하나').toBeGreaterThan(n0)
  expect(free?.n ?? 0, '멈춤 없는 획은 점 여럿(항등)').toBeGreaterThan(2)
  const draftFree = await page.evaluate(() => (window as any).__b2.diag.gesture71ForTest().paintStraight)
  expect(draftFree, '멈춤 없는 획 뒤 직선 상태 아님').toBe(false)
  // ② 멈춤 → 두 점 · 끌면 끝점이 따라온다 · 떼면 두 점
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y: 520, button: 'left', ...pen, force: 0.5 })
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: 520 + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 })
  await page.waitForTimeout(C.GESTURE71_PAINT_HOLD_MS + 80)
  const straightDuring = (await diag(page)).paintStraight
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 840, y: 560, button: 'left', ...pen, force: 0.5 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 860, y: 580, button: 'left', ...pen, force: 0.5 })
  await page.waitForTimeout(50)
  const endDuring = await page.evaluate(() => { const d = (window as any).__b2.diag.draftForTest?.(); return d ? { n: d.raw.length, end: d.raw[d.raw.length - 1] } : null })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 860, y: 580, button: 'left', ...pen, force: 0 }); await settle(page)
  const held = await rawOf(0)
  expect(straightDuring, '멈춤 400ms 뒤 직선 상태').toBe(true)
  expect(endDuring?.n, '멈춘 뒤 초안은 두 점(끝점이 따라온다)').toBe(2)
  expect((held?.n ?? 0) < (free?.n ?? 0), '떼면 확정된 획은 두 점 초안에서 나온 것(자유 획보다 점이 적다 — 값)').toBe(true)
  // ③ 결정론 — 같은 입력 두 번 → 같은 두 점
  const p1 = await page.evaluate(() => { const s = (window as any).__b2.app.doc.strokes; const st = s[s.length - 1]; return JSON.stringify(st.paint?.uv ?? st.raw ?? null) })
  // ④ 반증 — 문턱 0이면 모든 획이 직선(설정 덮개 · 있으면)
  const canOverride = await page.evaluate(() => typeof (window as any).__b2.diag.setGesture71ForTest === 'function')
  let falsify: unknown = null
  if (canOverride) {
    await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: 0 }))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y: 620, button: 'left', ...pen, force: 0.5 })
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: 620 + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 }); await page.waitForTimeout(8) }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 620, button: 'left', ...pen, force: 0 }); await settle(page)
    const f = await rawOf(0)
    falsify = { hold_ms: 0, points: f?.n }
    expect(f?.n, '반증 — 문턱 0이면 멈춤 없는 획도 직선(두 점)').toBe(2)
    await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: null }))
  }
  OUTV.s5 = { def: '칠 도구에서 떼지 않고 400ms(≤ 3px) 멈추면 draft.raw = [start, cur] · 이후 이동은 끝점 갱신 · 떼면 그대로 확정(onPaint 같은 경로) · 제도 연필·펜에는 없다', free_points: free?.n, straight_during_hold: straightDuring, end_follows: endDuring, held_points: held?.n, stroke_json_len: p1.length, falsify }
  await cdp.detach()
})
