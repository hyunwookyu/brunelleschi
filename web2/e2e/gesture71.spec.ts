// web2-71 — 몸짓 게이트(리뷰어 한 왕복 뒤 판 · 17건 대응):
//   §1 두드림(2 = 되돌리기 · 3 = 다시하기 · 누르고 있기 반복) — 되돌리기 스택·면 수·칠 해시를 «단추와 같은 값»으로([H5]·[M1]) · 반증 = 문턱 0([H2]) · 대역 표([M9])
//   §2 세 손가락 두 번(상쇄 — 기준선·중간·끝의 스택 값 [M2][M3]) · §3 정사 스냅(각 판마다 «원근에서 새로» 시작 [H1] · 카메라 값 · 마우스 더블클릭 [M6] · 밖의 상태줄 [M4])
//   §4 재누름 표 · §5 칠 멈춤(픽셀 항등 = 같은 획을 멈춤 없이/덮개로 [H6] · 잉크 밀도 · 결정론 = 두 실행의 해시 [H7] · #111 값 [M5])
// 손가락은 CDP Input.dispatchTouchEvent(진짜 touch). 원장: stage0/out/gesture71_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99).
import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { readFileSync as rfs, readdirSync } from 'node:fs'
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
  writeFileSync(f, JSON.stringify({ conditions: { project: info.project.name, workers: 1, tree: TREE, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/gesture71.spec.ts (#99)' }, run_id: prev.run_id ?? RUN_ID, what: 'web2-71 몸짓 게이트(리뷰어 뒤 판) — §1 두드림·누르고 있기(스택·면·칠 해시 = 단추와 같은 값 · 반증 문턱 0 · 대역 표) · §2 상쇄(기준선·중간·끝) · §3 정사 스냅(원근에서 새로 · 카메라 값 · 마우스 · 밖 상태줄) · §4 재누름 표 · §5 칠 멈춤(항등 · 밀도 · 결정론 · #111 값)', tree: TREE, pitfall_citations: [111, 109, 108, 107, 42, 54, 93, 12], constants_used: { GESTURE71_TOUCH_SYNC_MS: C.GESTURE71_TOUCH_SYNC_MS, GESTURE71_TAP_MOVE_PX: C.GESTURE71_TAP_MOVE_PX, GESTURE71_TAP_MS: C.GESTURE71_TAP_MS, GESTURE71_DOUBLE_MS: C.GESTURE71_DOUBLE_MS, GESTURE71_HOLD_MS: C.GESTURE71_HOLD_MS, GESTURE71_HOLD_REPEAT_MS: C.GESTURE71_HOLD_REPEAT_MS, GESTURE71_ORTHO_SNAP_DEG: C.GESTURE71_ORTHO_SNAP_DEG, GESTURE71_PAINT_HOLD_MS: C.GESTURE71_PAINT_HOLD_MS, GESTURE71_PAINT_HOLD_PX: C.GESTURE71_PAINT_HOLD_PX }, ...prevVals, ...OUTV }, null, 2))
})

async function boot(page: Page, q = '/?reset') {
  await page.goto(q)
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(200)
}
/** 두 프레임 + **이어 굽기가 끝날 때까지**(web2-75): 굽기가 «점 구간»으로 잘리면서 되돌리기·다시하기 뒤의
 *  전량 재굽기가 여러 프레임에 걸린다 — 고정 대기로 해시를 읽으면 «덜 채워진 그림»을 «다른 그림»으로 읽는다.
 *  재는 것은 그대로이고 «언제 재는가»만 정한다(72의 settleBake 규약 · 상한 있는 대기 #81). */
const settle = async (page: Page) => {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
  await page.waitForFunction(() => !(window as never as { __b2: { diag: { paintBakePendingForTest: () => boolean } } }).__b2.diag.paintBakePendingForTest(), null, { timeout: 60_000 })
}
const diag = (page: Page) => page.evaluate(() => (window as any).__b2.diag.gesture71ForTest())
const resetG = (page: Page) => page.evaluate(() => (window as any).__b2.diag.gesture71ResetForTest())
/** paint67 bigBox — 카메라를 세우고 면 하나(벽)를 세운다 */
async function drawBox(page: Page) {
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const) {
    await page.mouse.move(l[0], l[1]); await page.mouse.down(); await page.mouse.move((l[0] + l[2]) / 2, (l[1] + l[3]) / 2, { steps: 4 }); await page.mouse.move(l[2], l[3], { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(60)
  }
  await page.waitForTimeout(200)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face'); await page.mouse.click(700, 480); await page.waitForTimeout(100)
  await page.click('#btn-pencil'); await page.click('#btn-pencil'); await page.waitForTimeout(100)
}
/** 관측 셋 — 되돌리기·다시하기 스택 · 획 수 · 면 수 · 칠 해시(paintTexHash — 면 텍스처 전부의 해시·잉크 합) */
const obs = (page: Page) => page.evaluate(() => { const a = (window as any).__b2.app; const h = (window as any).__b2.diag.paintTexHash() as { key: string; hash: number; ink: number }[]; return { undo: a.undoStack.length as number, redo: a.redoStack.length as number, strokes: a.doc.strokes.length as number, faces: a.faces.length as number, hash: h.map(x => x.hash).join(','), ink: h.reduce((s, x) => s + x.ink, 0) } })
const pen = { pointerType: 'pen' as const }
/** 칠 획 하나(벽 면 안 · 사인 곡선) — CDP 펜 */
async function paintCurve(cdp: CDPSession, page: Page, y: number, holdMs = 0) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y, button: 'left', ...pen, force: 0.5 })
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: y + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 })
  if (holdMs > 0) await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y, button: 'left', ...pen, force: 0 }); await settle(page); await page.waitForTimeout(80)
}
/** 손가락 n개 두드림 — 동시에 닿고(한 사건) · movePx만큼 움직이고 · durMs 뒤 뗀다. settle은 호출자가(두 번의 간격은 호출자가 정한다) */
async function fingerTap(cdp: CDPSession, page: Page, n: number, x: number, y: number, durMs = 60, movePx = 0, moveSteps = 1) {
  const pts = Array.from({ length: n }, (_, i) => ({ x: x + i * 40, y, id: i + 1 }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
  for (let s = 1; s <= moveSteps && movePx > 0; s++) { await page.waitForTimeout(10); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts.map(p => ({ ...p, x: p.x + movePx * s / moveSteps })) }) }
  await page.waitForTimeout(durMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const gap = (ms: number) => ms

test('§1 두 손가락 = 되돌리기(스택·면·칠 해시가 단추와 같은 값) · 세 손가락 = 다시하기 · 누르고 있기 반복 · 끌기는 이동 · 반증(문턱 0이면 끌기가 되돌리기로 오작동) · 대역 표 · 펜/마우스 없음', async ({ page }) => {
  await boot(page); await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  // 칠 획 하나 — 「칠 획에도 먹는다」(67-0-5)와 «칠 해시 == 단추»를 같은 값으로 잰다([H5])
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(150)
  await paintCurve(cdp, page, 450)
  const o0 = await obs(page)
  expect(o0.ink, '칠 획이 실렸다(해시 자가 빈 판이 아니다 · #107)').toBeGreaterThan(0)
  // 기준: 단추로 되돌린 값 · 다시 되살린 값
  await page.evaluate(() => document.getElementById('btn-undo')!.click()); await settle(page); await page.waitForTimeout(80)
  const oBtnUndo = await obs(page)
  await page.evaluate(() => document.getElementById('btn-redo')!.click()); await settle(page); await page.waitForTimeout(80)
  const oBtnRedo = await obs(page)
  expect(oBtnRedo.hash, '단추 되돌리기 → 다시하기 왕복 = 처음 해시').toBe(o0.hash)
  await resetG(page)
  // D-2 — 두 손가락 «끌기»(30px · 6걸음) = 이동 · 스택 무변 · 판정 none(why = 처음 8을 넘긴 순간의 누적 변위 · maxMovePx = 끝값 — 같은 자의 두 시점 [H3])
  await fingerTap(cdp, page, 2, 400, 400, 60, 30, 6); await settle(page)
  const drag = (await diag(page)).last
  expect((await obs(page)).undo, '두 손가락 끌기는 이동 — 스택 무변').toBe(o0.undo)
  expect(drag?.verdict).toBe('none'); expect(drag?.why ?? '').toContain('move')
  // 두 손가락 두드림 → 되돌리기 1 = 단추와 같은 값(스택 −1 · 획 −1 · 해시 == 단추 되돌리기의 해시)
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await fingerTap(cdp, page, 2, 400, 400); await settle(page); await page.waitForTimeout(80)
  const oTap2 = await obs(page); const t2 = (await diag(page)).last
  expect(oTap2.undo, '스택 −1').toBe(o0.undo - 1); expect(oTap2.strokes, '칠 획 −1').toBe(o0.strokes - 1)
  expect(oTap2.hash, '칠 해시 == 되돌리기 단추의 해시(같은 함수)').toBe(oBtnUndo.hash)
  const undoOpacity = await page.evaluate(() => Number(getComputedStyle(document.getElementById('btn-undo')!).opacity))
  // 세 손가락 → 다시하기 = 단추 다시하기와 같은 해시
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await fingerTap(cdp, page, 3, 400, 400); await settle(page); await page.waitForTimeout(80)
  const oTap3 = await obs(page)
  expect(oTap3.undo).toBe(o0.undo); expect(oTap3.hash, '세 손가락 다시하기 = 단추 다시하기의 해시').toBe(oBtnRedo.hash)
  // 누르고 있기 — 400ms 뒤부터 250ms마다: 지속 셋 {450, 700, 950}ms → 반복 {1, 2, 3}(값 · [M9] 동작점 셋)
  const holdRows: unknown[] = []
  for (const ms of [C.GESTURE71_HOLD_MS + 50, C.GESTURE71_HOLD_MS + C.GESTURE71_HOLD_REPEAT_MS + 50, C.GESTURE71_HOLD_MS + C.GESTURE71_HOLD_REPEAT_MS * 2 + 50]) {
    // 되돌릴 것을 채운다: 단추로 되살릴 수 있는 만큼(면·칠) — 각 판은 처음 상태(o0)에서 시작
    while ((await obs(page)).undo < o0.undo) { await page.evaluate(() => document.getElementById('btn-redo')!.click()); await settle(page) }
    await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
    const before = await obs(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 400, id: 1 }, { x: 440, y: 400, id: 2 }] })
    await page.waitForTimeout(ms)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(page); await page.waitForTimeout(300)
    const after = await obs(page); const v = (await diag(page)).last
    holdRows.push({ hold_ms: ms, repeats: before.undo - after.undo, verdict: v?.verdict, duration: v?.durationMs, stopped_after_release: (await obs(page)).undo === after.undo })
  }
  // 반증(D-3 · [H2]) — 문턱 8px → 0이면 «끌기»(30px)가 두드림으로 오인되어 되돌리기가 «일어난다»
  while ((await obs(page)).undo < o0.undo) { await page.evaluate(() => document.getElementById('btn-redo')!.click()); await settle(page) }
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50)
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ tapMovePx: 0, tapMs: 2000 }))   // 이동 문턱만 끈다(지속 문턱은 넉넉히 — 반증은 «이동»의 뜻을 잰다)
  const thr0 = await page.evaluate(() => (window as any).__b2.diag.gestureThresholdsForTest())
  const bF = await obs(page)
  await fingerTap(cdp, page, 2, 400, 400, 40, 30, 3); await settle(page); await page.waitForTimeout(80)
  const aF = await obs(page); const vF = (await diag(page)).last
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ tapMovePx: null, tapMs: null }))
  const thr1 = await page.evaluate(() => (window as any).__b2.diag.gestureThresholdsForTest())
  // 경계 표([M9]) — 이동 {0, 7, 8, 9, 20}px · 지속 {80, 200, 250, 300}ms — 판정만(되돌리기 스택은 판마다 되살린다)
  const table: unknown[] = []
  for (const mv of [0, 7, 8, 9, 20]) { await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50); await fingerTap(cdp, page, 2, 400, 400, 60, mv, 1); await settle(page); const v = (await diag(page)).last; table.push({ move_px: mv, verdict: v?.verdict, maxMovePx: v?.maxMovePx, why: v?.why }) }
  for (const d of [80, 200, 250, 300]) { await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 50); await fingerTap(cdp, page, 2, 400, 400, d, 0); await settle(page); const v = (await diag(page)).last; table.push({ dur_ms: d, verdict: v?.verdict, durationMs: v?.durationMs, why: v?.why }) }
  // 펜·마우스에는 없다 — 마우스 클릭 둘·펜 탭 둘: 스택 무변
  const bM = await obs(page)
  await page.mouse.click(700, 200); await page.mouse.click(700, 200); await settle(page)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 200, button: 'left', ...pen, force: 0.5 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 200, button: 'left', ...pen, force: 0 }); await settle(page)
  const aM = await obs(page)
  OUTV.s1 = { def: '관측 = 되돌리기·다시하기 스택 · 획 수 · 면 수 · 칠 해시(paintTexHash 전 면 · 잉크 합) — 단추 되돌리기/다시하기의 값과 대조 · 이동량은 첫 접촉으로부터의 누적 변위(why = 처음 문턱을 넘긴 순간 spoiledAtPx · maxMovePx = 뗄 때 끝값)', o0, btn_undo: oBtnUndo, btn_redo: oBtnRedo, drag: { obs: await obs(page), verdict: drag }, two_tap: { obs: oTap2, verdict: t2, undo_opacity_after: undoOpacity }, three_tap: oTap3, hold_rows: holdRows, falsify_threshold0: { thresholds: thr0, before: bF, after: aF, verdict: vF, undo_happened: aF.undo === bF.undo - 1, restored: thr1 }, boundary_table: table, mouse_pen: { before: bM, after: aM } }
  expect(holdRows.map((r: any) => r.repeats), '누르고 있기 반복 {1, 2, 3}(400 + 250k)').toEqual([1, 2, 3])
  expect(aF.undo, '반증 — 문턱 0이면 30px 끌기가 되돌리기로 오작동한다(그래서 8)').toBe(bF.undo - 1)
  expect(vF?.verdict).toBe('tap')
  expect(thr1.override.tapMovePx, '덮개를 되돌렸다').toBeNull()
  expect(table.filter((r: any) => 'move_px' in r).map((r: any) => r.verdict), '이동 {0,7,8} 두드림 · {9,20} 아님').toEqual(['tap', 'tap', 'tap', 'none', 'none'])
  expect(table.filter((r: any) => 'dur_ms' in r).map((r: any) => r.verdict)[3], '지속 300ms는 두드림 아님').toBe('none')
  expect(aM.undo, '마우스·펜 두 번은 되돌리기 아님').toBe(bM.undo)
  await cdp.detach()
})

test('§2 세 손가락 두 번 = 격자·축 토글 · 상쇄(기준선 → 첫 두드림 → 두 번째 — 스택 값 셋) · 칠 해시 무변 · 350ms 밖 두 번 = 다시하기 둘(값) · 두 번 간격은 페이지 시계', async ({ page }) => {
  await boot(page); await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(150)
  await paintCurve(cdp, page, 450)
  // 되돌릴 것 둘 → 다시하기 스택 2
  await page.evaluate(() => { document.getElementById('btn-undo')!.click(); document.getElementById('btn-undo')!.click() }); await settle(page); await page.waitForTimeout(80)
  const base = await obs(page); const g0 = (await diag(page)).grid
  await resetG(page)
  await fingerTap(cdp, page, 3, 400, 400); await settle(page)
  const mid = await obs(page); const midV = (await diag(page))
  await fingerTap(cdp, page, 3, 400, 400); await settle(page); await page.waitForTimeout(80)
  const end = await obs(page); const d = await diag(page)
  OUTV.s2 = { def: '기준선(base) → 첫 두드림(mid: 다시하기 1 = undo +1 · redo −1) → 두 번째(end: 되돌리기로 되물리고 격자 토글 = base와 같은 스택·해시) · 간격은 판정의 페이지 시계(doubleGapMs)', base, mid, mid_log: midV.log, end, end_log: d.log, grid: [g0, d.grid], double_gap_ms_page: d.last?.doubleGapMs, hash_same: base.hash === end.hash }
  expect(mid.undo, '첫 두드림 = 다시하기 1(중간 상태 실측 · #107)').toBe(base.undo + 1); expect(mid.redo).toBe(base.redo - 1)
  expect(end.undo, '상쇄 — 스택 기준선으로').toBe(base.undo); expect(end.redo).toBe(base.redo)
  expect(end.hash, '칠 해시 무변').toBe(base.hash); expect(end.strokes).toBe(base.strokes)
  expect(d.grid, '격자 토글').toBe(!g0)
  expect(d.last?.doubleGapMs ?? 9999, '두 번 간격(페이지 시계) ≤ 350').toBeLessThanOrEqual(C.GESTURE71_DOUBLE_MS)
  // 350ms 밖 두 번 → 다시하기 둘
  await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 100)
  const b2 = await obs(page); const gB = (await diag(page)).grid
  await fingerTap(cdp, page, 3, 400, 400); await page.waitForTimeout(C.GESTURE71_DOUBLE_MS + 100); await fingerTap(cdp, page, 3, 400, 400); await settle(page); await page.waitForTimeout(80)
  const e2 = await obs(page); const dd = await diag(page)
  ;(OUTV.s2 as Record<string, unknown>).outside_350 = { before: b2, after: e2, grid: [gB, dd.grid], gap_ms_page: dd.last?.doubleGapMs, log: dd.log }
  expect(dd.grid, '350ms 밖 두 번은 토글 아님').toBe(gB)
  expect(e2.undo, '다시하기 둘(스택 +2)').toBe(b2.undo + 2); expect(e2.redo).toBe(b2.redo - 2)
  await cdp.detach()
})

test('§3 정사 스냅 — 판마다 «원근에서 새로»: ±14° → 정사(각 0 · proj · 「—×—」 · 첫 탭의 면 고르기 유지) · ±16° → 무변(각 그대로 · 원근 · 상태줄 한 줄) · 마우스 더블클릭 = 같은 뜻 · 반증(밖의 로그가 none)', async ({ page }) => {
  await boot(page); await drawBox(page)
  const cdp = await page.context().newCDPSession(page)
  const cam = (page: Page) => page.evaluate(() => { const a = (window as any).__b2.app; const d = (window as any).__b2.diag.gesture71ForTest(); return { off: d.orthoOff as number, ortho: d.ortho as boolean, proj: a.pose.proj ?? null, q: [a.pose.q.x, a.pose.q.y, a.pose.q.z, a.pose.q.w].map((v: number) => +v.toFixed(4)), mark: !document.getElementById('ortho-mark')!.hidden, notice: (window as any).__b2.diag.noticeTextForTest(), faceSel: (a.faceSel?.length ?? a.grip?.ids?.length ?? 0) } })
  /** 원근 · 정사 축에서 deg만큼 돈 자세로 «새로» 세운다: 정사로 맞춘 뒤 원근으로 되돌리고(큐브 가운데의 그 함수) deg 돌린다 */
  const setOff = async (deg: number) => {
    // 원근으로 · 축으로 되돌린다(앞 판이 ±16°에 남겨도 — 스냅은 15° 밖에서 «아무 일도 없다»라 되돌림은 궤도로 한다: 각을 읽고 반대로 돈다 · 부호가 틀리면 되돌린다)
    await page.evaluate(() => (window as any).__b2.diag.perspectiveForTest()); await page.waitForTimeout(900)
    for (let i = 0; i < 3; i++) {
      const off = (await diag(page)).orthoOff as number
      if (off < 0.5) break
      await page.evaluate((a) => (window as any).__b2.diag.orbitByForTest(a, 0), -off); await page.waitForTimeout(200)
      if (((await diag(page)).orthoOff as number) > off) { await page.evaluate((a) => (window as any).__b2.diag.orbitByForTest(a, 0), 2 * off); await page.waitForTimeout(200) }
    }
    await page.evaluate((deg) => (window as any).__b2.diag.orbitByForTest(deg, 0), deg); await page.waitForTimeout(400)
  }
  const rows: Record<string, unknown> = {}
  for (const deg of [C.GESTURE71_ORTHO_SNAP_DEG - 1, C.GESTURE71_ORTHO_SNAP_DEG + 1]) {
    await setOff(deg); await resetG(page)
    const before = await cam(page)
    await fingerTap(cdp, page, 1, 640, 450); await page.waitForTimeout(40); await fingerTap(cdp, page, 1, 640, 450)
    await page.waitForTimeout(900); await settle(page)
    const after = await cam(page); const log = (await diag(page)).log
    rows[`deg_${deg}`] = { before, after, log }
    expect(before.ortho, '판은 원근에서 시작한다(물려받지 않는다 · [H1])').toBe(false)
    expect(Math.abs(before.off - deg), `출발 각 ≈ ${deg}°`).toBeLessThan(1)
    if (deg < C.GESTURE71_ORTHO_SNAP_DEG) { expect(after.ortho, `±${deg}° → 정사`).toBe(true); expect(after.off, '정사에 붙었다').toBeLessThan(0.5); expect(after.proj, '평행 투영이 섰다').not.toBeNull(); expect(after.mark, '「—×—」').toBe(true); expect(log.at(-1), '로그: 스냅').toBe('double1:ortho:snapped') }
    else { expect(after.ortho, `±${deg}° → 무변(원근 그대로)`).toBe(false); expect(Math.abs(after.off - before.off), '각 무변').toBeLessThan(0.5); expect(after.q, '자세(쿼터니언) 무변').toEqual(before.q); expect(after.mark, '「—×—」 없음').toBe(false); expect(log.at(-1), '로그: 아무 일도 없다').toBe('double1:ortho:none'); expect(after.notice, '상태줄 한 줄').toContain('넘게') }
  }
  // 마우스 더블클릭 = 같은 뜻(±14°에서)
  await setOff(C.GESTURE71_ORTHO_SNAP_DEG - 1); await resetG(page)
  const mb = await cam(page); await page.mouse.dblclick(640, 450); await page.waitForTimeout(900); await settle(page); const ma = await cam(page)
  // 첫 탭의 면 고르기 유지 — 칠 도구를 들고 벽 위에서 한 손가락 두 번(첫 탭 = 면 고르기 67 · 둘째 = 정사) → 고른 면 수 유지
  await setOff(C.GESTURE71_ORTHO_SNAP_DEG - 1); await resetG(page)
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(150)
  await fingerTap(cdp, page, 1, 700, 480); await settle(page); await page.waitForTimeout(80)
  const selAfterFirst = await page.evaluate(() => (window as any).__b2.app.faceSel.length as number)
  await fingerTap(cdp, page, 1, 700, 480); await page.waitForTimeout(900); await settle(page)
  const selAfterSecond = await page.evaluate(() => (window as any).__b2.app.faceSel.length as number)
  const faceKeep = await cam(page)
  OUTV.s3 = { def: '정사 스냅 = 큐브 틀에서 가장 가까운 정사 축과의 각 ≤ 15° → poseForOrient + parallelPose + glide(「정면」·큐브 면과 같은 전환) → 보간 뒤 zoomFit · 판마다 원근에서 새로(orthoSnap → perspective → orbit deg) · 카메라 값 = off·q·proj', ...rows, mouse_dblclick: { before: mb, after: ma }, face_select_kept: { after_first_tap: selAfterFirst, after_second_tap: selAfterSecond, cam: faceKeep } }
  expect(ma.ortho, '마우스 더블클릭 = 정사').toBe(true)
  expect(faceKeep.ortho, '칠 도구에서 두 번: 둘째가 정사').toBe(true)
  expect(selAfterSecond, '첫 탭의 면 고르기는 그대로').toBe(selAfterFirst)
  await cdp.detach()
})

test('§4 도구 재누름 = 그 도구의 통 — 여섯 표(든 뒤 · 재누름 뒤집힘 · 다시 되돌아옴 · 다른 손잡이 → 닫힘) · 옛 경로 grep 0(#109)', async ({ page }) => {
  await boot(page)
  const rows: Record<string, unknown>[] = []
  const TOOLS: [string, string][] = [['btn-pencil', 'tray'], ['btn-pen', 'pentray'], ['btn-eraser-pencil', 'etray'], ['btn-eraser-ink', 'etray'], ['btn-paint', 'brushpick'], ['btn-face', 'face-pop']]
  const openState = (id: string) => page.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; return e.classList.contains('open') || (!e.hidden && getComputedStyle(e).display !== 'none') }, id)
  for (const [btn, box] of TOOLS) {
    await page.evaluate((b) => document.getElementById(b)!.click(), btn === 'btn-pencil' ? 'btn-pen' : 'btn-pencil'); await page.waitForTimeout(150)
    await page.evaluate(() => { for (const id of ['tray', 'pentray', 'etray']) document.getElementById(id)?.classList.remove('open'); const b = document.getElementById('brushpick'); if (b) (b as HTMLElement).style.display = 'none' })
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const first = await openState(box)
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const second = await openState(box)
    await page.evaluate((b) => document.getElementById(b)!.click(), btn); await page.waitForTimeout(150)
    const third = await openState(box)
    await page.evaluate(() => document.getElementById('btn-grip')!.click()); await page.waitForTimeout(150)
    const other = await openState(box)
    rows.push({ btn, box, after_select: first, after_repress: second, after_repress_again: third, after_other: other })
  }
  // #109 — 옛 경로(「붓을 다시 누르면 여닫을 것이 없다」)의 잔존 grep
  const src = readdirSync(resolve(ROOT, 'src/app')).map(f => rfs(resolve(ROOT, 'src/app', f), 'utf-8')).join('\n')
  const oldPath = (src.match(/여닫을 것이 없다/g) || []).length
  OUTV.s4 = { def: '재누름 = 그 통의 상태를 뒤집는다(연필·펜은 들기가 통을 함께 연다 — 옛 규약 · 지우개·칠·면은 들기만) · 다른 손잡이 → 닫힘(R7)', rows, old_path_grep: oldPath }
  for (const r of rows) { expect(r.after_repress, `${r.btn} 재누름 → ${r.box} 뒤집힘`).toBe(!r.after_select); expect(r.after_repress_again, `${r.btn} 다시 → 되돌아온다`).toBe(r.after_select); expect(r.after_other, `${r.btn}: 다른 손잡이 → 닫힘(R7)`).toBe(false) }
  expect(oldPath, '옛 경로 문구 grep 0(#109)').toBe(0)
})

test('§5 칠 획 끝 멈춤 — 픽셀 항등(같은 획을 덮개로 끄고 · 해시 같다) · 멈춤 → 같은 간격의 직선(밀도 = 잉크 비 · 끝점 따라옴 · 시작점 이동량 0 · 프레임 시간) · 떼면 확정 · 결정론(두 실행 해시) · 반증(400 → 0)', async ({ page }) => {
  await boot(page); await drawBox(page)
  await page.evaluate(() => document.getElementById('btn-paint')!.click()); await page.waitForTimeout(200)
  const cdp = await page.context().newCDPSession(page)
  const H = () => obs(page)
  const undo = async () => { await page.evaluate(() => document.getElementById('btn-undo')!.click()); await settle(page); await page.waitForTimeout(80) }
  // ① 항등 — 멈춤 없는 같은 획: 기능 켬 vs 덮개로 끔(paintHoldMs 1e9) → 같은 해시
  const h0 = await H()
  await paintCurve(cdp, page, 420); const hOn = await H(); await undo()
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: 1e9 }))
  await paintCurve(cdp, page, 420); const hOff = await H(); await undo()
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: null }))
  // ② 멈춤 → 직선 — 초안 두 점 이상(같은 간격) · 시작점 이동량 0 · 끝점 따라옴 · 프레임 시간
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y: 520, button: 'left', ...pen, force: 0.5 })
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: 520 + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 })
  const draftBefore = await page.evaluate(() => { const d = (window as any).__b2.diag.draftForTest(); return { n: d.raw.length, start: d.raw[0] } })
  await page.waitForTimeout(C.GESTURE71_PAINT_HOLD_MS + 80)
  const straightDuring = (await diag(page)).paintStraight
  const step = await page.evaluate(() => (window as any).__b2.diag.paintStepForTest())
  const frames: number[] = []
  const starts: unknown[] = []
  for (let i = 1; i <= 6; i++) {
    const t0 = Date.now()
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 820 + i * 8, y: 520 + i * 10, button: 'left', ...pen, force: 0.5 }); await settle(page)
    frames.push(Date.now() - t0)
    starts.push(await page.evaluate(() => { const d = (window as any).__b2.diag.draftForTest(); return { n: d.raw.length, start: d.raw[0], end: d.raw[d.raw.length - 1] } }))
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 868, y: 580, button: 'left', ...pen, force: 0 }); await settle(page); await page.waitForTimeout(80)
  const hHold = await H()
  const startMoved = (starts as any[]).some(s => s.start.x !== draftBefore.start.x || s.start.y !== draftBefore.start.y)
  // ③ 결정론 — 같은 멈춤 획을 되돌리고 한 번 더 → 같은 해시
  await undo()
  const hUndo = await H()
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 540, y: 520, button: 'left', ...pen, force: 0.5 })
  for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + i * 14, y: 520 + Math.sin(i / 3) * 30, button: 'left', ...pen, force: 0.5 })
  await page.waitForTimeout(C.GESTURE71_PAINT_HOLD_MS + 80)
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 820 + i * 8, y: 520 + i * 10, button: 'left', ...pen, force: 0.5 }); await settle(page) }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 868, y: 580, button: 'left', ...pen, force: 0 }); await settle(page); await page.waitForTimeout(80)
  const hHold2 = await H()
  // 밀도 — 같은 길이의 곡선 vs 직선의 잉크 비(값): 곡선(①의 hOn − h0) vs 직선(hHold − hUndo) — 직선이 짧으므로 길이로 나눈 값도 적는다
  const inkCurve = hOn.ink - h0.ink, inkLine = hHold.ink - hUndo.ink
  const lenCurve = await page.evaluate(() => { let d = 0; for (let i = 1; i <= 20; i++) d += Math.hypot(14, Math.sin(i / 3) * 30 - Math.sin((i - 1) / 3) * 30); return d })
  const lenLine = Math.hypot(868 - 540, 580 - 520)
  await undo()
  // ④ 반증 — 문턱 0이면 멈춤 없는 획도 직선(점 간격 같은 직선 · 곡선 해시와 다르다)
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: 0 }))
  await paintCurve(cdp, page, 620); const straightF = (await diag(page)).paintStraightLast
  const hF = await H()
  await page.evaluate(() => (window as any).__b2.diag.setGesture71ForTest({ paintHoldMs: null }))
  const lastRaw = await page.evaluate(() => { const s = (window as any).__b2.app.doc.strokes; const st = s[s.length - 1]; return { n: st.raw?.length ?? null, uv: st.paint?.uv?.length ?? null } })
  OUTV.s5 = { def: '항등 = 같은 곡선을 기능 켬/덮개 끔으로 그려 해시 같음(65 ①의 자 = paintTexHash) · 멈춤 뒤 초안은 곡선의 평균 간격으로 표본한 직선(끝점 포함) · 시작점 이동량 0 · 프레임 시간(끝점 이동 6걸음의 ms) · 결정론 = 같은 멈춤 획 두 실행의 해시 · 밀도 = 잉크/길이 비', identity: { on: hOn.hash, off: hOff.hash, same: hOn.hash === hOff.hash }, draft_before_hold: draftBefore, straight_during_hold: straightDuring, sample_step_doc: step, end_follow_frames_ms: frames, end_follow_samples: starts, start_moved: startMoved, determinism: { first: hHold.hash, second: hHold2.hash, same: hHold.hash === hHold2.hash }, density: { ink_curve: inkCurve, len_curve_px: +lenCurve.toFixed(1), ink_line: inkLine, len_line_px: +lenLine.toFixed(1), per_px_curve: +(inkCurve / lenCurve).toFixed(3), per_px_line: +(inkLine / lenLine).toFixed(3), ratio_line_over_curve: +((inkLine / lenLine) / (inkCurve / lenCurve)).toFixed(3) }, falsify: { hold_ms: 0, straight: straightF, hash_differs_from_curve: hF.hash !== hOn.hash, last_stroke: lastRaw } }
  expect(hOn.hash, '항등 — 멈춤 없는 획은 기능 유무와 같다').toBe(hOff.hash)
  expect(straightDuring, '멈춤 400ms 뒤 직선').toBe(true)
  expect(startMoved, '이미 지난 자리(시작점)의 이동량 0 (#111)').toBe(false)
  expect((starts as any[]).every(s => s.n >= 2), '초안은 두 점 이상(같은 간격의 직선)').toBe(true)
  expect(hHold.hash, '결정론 — 같은 멈춤 획 두 실행의 해시').toBe(hHold2.hash)
  expect(Math.abs((inkLine / lenLine) / (inkCurve / lenCurve) - 1), '밀도 — 직선 띠의 px당 잉크가 곡선과 같다(±25% · 같은 브러시·크기·불투명)').toBeLessThan(0.25)
  expect(straightF, '반증 — 문턱 0이면 멈춤 없는 획도 직선').toBe(true)
  expect(hF.hash !== hOn.hash, '반증 — 그 획은 곡선과 다른 해시').toBe(true)
  await cdp.detach()
})
