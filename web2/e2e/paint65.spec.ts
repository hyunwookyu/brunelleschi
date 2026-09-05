// web2-65 — **칠 성능의 게이트**(값·해시만 · ms 없음 — 계측은 `perf65.spec.ts`다).
//
//   ① ⛳ 픽셀 항등     누적으로 그린 결과 == 전량 재굽기 결과. 굽힌 텍스처 해시 **와 화면 픽셀**
//                     둘 다 · 도구 전수(연필·잉크펜·마커·색연필). **이 라운드의 중심 게이트**.
//                     반증(D-3): 누적의 «바탕 되깔기»를 끄면 두 판이 갈라져야 한다.
//   ③ 재굽힌 획 수 = 1 새 획 하나만 그린다 — 커밋마다 얹기 1 · 전량 재굽기 0.
//   ④ 다른 변경 0회    치수 수정 · 상관없는 선 · 그 선 되돌리기에서 칠 재굽기 0.
//   ⑤ 무회귀 트리거     획 삭제 · 해상도 단계 · 브러시 재바인딩 · 재료 · 해칭 · 면 경계 —
//                     **전수로** 「다시 굽는다」를 값으로. 하나라도 빠지면 낡은 그림이 남는다.
//   ⑥ 반증            누적을 끄면 pre의 O(N)이 돌아온다(재굽힌 획 수 = 그 면의 획 전부).
//   ⑦ 메모리          상한이 지켜진다 · 상한에서 버린 뒤 다시 보면 같은 픽셀.
//
// 자의 자리: `diag.paintBake()`(굽기 계수기) · `diag.paintTexHash()`(굽힌 캔버스 해시 —
// #107 되돌림과 무관한 확정본) · `#gl` 픽셀(사람이 보는 것 — 부분 업로드는 캔버스 해시로는
// 안 잡힌다: GPU에 무엇이 올라갔는지는 화면만 안다).
// 원장: stage0/out/paint65_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-65 — 칠 성능 게이트: ①픽셀 항등(캔버스+화면 · 도구 전수) ③재굽힌 획 수 ④다른 변경 0 ⑤무회귀 트리거 전수 ⑥반증 ⑦메모리',
  note_pitfalls: '#110(파생의 캐시 열쇠는 «그 파생이 의존하는 것»으로 — docVersion은 무효화 신호다) · #107(해시는 확정본 캔버스 — 되돌림 무관) · #103(같은 장면을 두 번 읽는다 — ink가 장면 확인) · #12(도구 넷 · 트리거 여섯 — 동작점 하나로 주장하지 않는다) · #102(한 test 안에서 ?reset을 다시 안 부른다) · #99 · #101',
  note_meter: '캔버스 해시(paintTexHash)만으로는 ④ 부분 업로드의 결함이 «안 잡힌다» — 그 자는 CPU 캔버스를 읽는다. 그래서 ①은 화면(#gl) 픽셀도 같이 본다',
  scene: 'paint50의 bigBox(오른쪽 벽 · 축척 2500)',
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31·paint50의 no_constants_snapshot이 정본 · 그 기계는 web/test/constants.ts에만 있다)' },
  pitfall_citations: [12, 42, 99, 101, 102, 103, 105, 107, 108, 110],
  selfcheck_notes: { zero_counters: 'g3의 bakes·baked가 0인 것이 게이트 ③의 «통과»다(0 = 전량 재굽기 없음) — 카운터가 안 도는 것이 아니다. 자가 산다는 증거는 같은 원장의 g5(트리거마다 1)와 g6(누적 끔 → 14)이다' },
}
/** `PRE65=1`이면 **수리 «전» 트리**에서 돌린 판을 따로 쓴다(perf65의 그 규약) — ④-c의 «지속»을
 *  두 트리에서 같은 자로 재려면 파일이 갈려야 한다(post를 덮으면 대조가 사라진다). */
const PRE = process.env.PRE65 === '1'
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint65${PRE ? '_pre' : ''}_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint65.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

// ── selfcheck 몫(§5) — 이 원장이 스스로 밝히는 것 ──────────────────────────────
// ⚠ web2 라인에는 `constantsSnapshot()` 기계가 없다(라인 유보 — lens31·paint50의 그 자리와 같다).
// 그래서 STALE 자동 판정 대신 «인용 규약»(문서가 `원장.json@해시`로 적는다)이 그 몫을 진다.


async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** paint50의 그 상자 — 오른쪽 벽(500,700)(900,610)(900,330)(500,330) · 축척 2500mm. */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560],
    [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await drawLine(page, l[0], l[1], l[2], l[3])
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(100)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  return postId
}

const INSTRS = ['pencil', 'brush', 'marker', 'cp'] as const
type Instr = typeof INSTRS[number]
/** 게이트 ①이 도는 (슬롯, 브러시) — 리뷰어 [H7]: 슬롯 넷의 «기본»만으로는 좁다.
 *  획 간 독립이 깨지기 가장 쉬운 족(스머지가 «앞 획»을 무는 브러시 · 산포가 큰 마른 매체)을 더한다:
 *  `deevad/watercolor_expressive`(smudge > 0 — 즐겨찾기 여섯의 하나) · `classic/charcoal`(거친 산포).
 *  브러시는 획이 든다(64-1) — 슬롯에 앉히는 대신 `paintSel.br`을 놓는다(고르개가 하는 그 일). */
const G1_CASES: readonly { instr: Instr; br: string | null; tag: string }[] = [
  { instr: 'pencil', br: null, tag: 'pencil' },
  { instr: 'brush', br: null, tag: 'brush' },
  { instr: 'marker', br: null, tag: 'marker' },
  { instr: 'cp', br: null, tag: 'cp' },
  { instr: 'brush', br: 'deevad/watercolor_expressive', tag: 'watercolor(smudge)' },
  { instr: 'pencil', br: 'classic/charcoal', tag: 'charcoal(거친 산포)' },
]
async function pickPaint(page: Page, i: Instr = 'pencil', w = 18, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 칠 한 붓 — 고정 점렬(획마다 같은 부하) */
async function paintStroke(page: Page, x0: number, y0: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 21, y0 + 5, { steps: 3 })
  await page.mouse.move(x0 + 42, y0 + 10, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(70)
}
/** 벽 안의 격자 자리(6 × 10) */
const wallSpot = (i: number): [number, number] => [530 + (i % 6) * 58, 355 + Math.floor(i / 6) * 25]

type Bake = { bakes: number; bakedStrokes: number; appends: number; appendStrokes: number; handoverStrokes: number; uploads: number; uploadBytes: number; drops: number; rebuilds: number; evicts: number; texReallocs: number; entries: number; bytes: number; budget: number }
const bakeStat = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintBake() as Bake)
const bakeReset = (page: Page) => page.evaluate(() => { (window as any).__b2.diag.paintBakeReset() })
type TexHash = { key: string; level: number; hash: number; ink: number; w: number; h: number }
const texHash = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as TexHash[])
/** 굽기를 «실제로» 다시 돌린다(전량) — 누적과 대조할 정본 판 */
const rebakeAndWait = async (page: Page) => {
  await page.evaluate(() => { (window as any).__b2.diag.rebakePaintTex() })
  await page.waitForTimeout(300)
}
/** **화면 픽셀**의 해시 — #gl(3D 겹)을 통째로 읽는다. 부분 업로드의 결함은 여기서만 보인다. */
const screenHash = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('gl') as HTMLCanvasElement
  const t = document.createElement('canvas')
  t.width = c.width; t.height = c.height
  t.getContext('2d')!.drawImage(c, 0, 0)
  const d = t.getContext('2d')!.getImageData(0, 0, t.width, t.height).data
  let h = 0, ink = 0
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]! + d[i + 1]! + d[i + 2]!
    if (d[i + 3]! > 0 && v < 690) ink++
    h = (Math.imul(h, 31) + v + d[i + 3]!) | 0
  }
  return { hash: h, ink, w: t.width, h: t.height }
})

test('① ⛳ 픽셀 항등 — 누적 == 전량 재굽기(캔버스 해시 + 화면 픽셀 · 도구 전수) · D-3 반증', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  const rows: Record<string, unknown>[] = []
  let spot = 0
  for (const cs of G1_CASES) {
    const instr = cs.instr
    await pickPaint(page, instr)
    if (cs.br) await page.evaluate((b) => { (window as any).__b2.app.paintSel.br = b }, cs.br)
    await bakeReset(page)
    for (let k = 0; k < 6; k++) { const [x, y] = wallSpot(spot++); await paintStroke(page, x, y) }
    const st = await bakeStat(page)
    const accTex = await texHash(page)
    const accScr = await screenHash(page)
    await rebakeAndWait(page)
    const refTex = await texHash(page)
    const refScr = await screenHash(page)
    // #103 — 장면이 비어 있지 않다(잉크가 그 확인). 자를 두 번 대고 값이 같아야 한다.
    expect(accTex.length, `${cs.tag}: 텍스처가 섰다`).toBeGreaterThan(0)
    expect(accTex[0]!.ink, `${cs.tag}: 굽힌 캔버스에 잉크가 있다`).toBeGreaterThan(0)
    expect(accScr.ink, `${cs.tag}: 화면에 잉크가 있다`).toBeGreaterThan(0)
    expect(JSON.stringify(accTex), `${cs.tag}: 누적 == 전량 재굽기(캔버스 픽셀)`).toBe(JSON.stringify(refTex))
    expect(accScr.hash, `${cs.tag}: 누적 == 전량 재굽기(화면 픽셀)`).toBe(refScr.hash)
    rows.push({
      instr: cs.tag, brush: cs.br ?? '(슬롯 기본)', appended: st.appendStrokes, appends: st.appends, bakes: st.bakes, baked_strokes: st.bakedStrokes,
      tex_hash: accTex.map(t => t.hash), tex_ink: accTex.map(t => t.ink),
      screen_hash: accScr.hash, screen_ink: accScr.ink, identical: JSON.stringify(accTex) === JSON.stringify(refTex) && accScr.hash === refScr.hash,
    })
  }
  // ── D-3 반증: 누적의 «바탕 되깔기»를 끄면 두 판이 «갈라져야» 한다(안 갈라지면 자가 안 재는 것이다)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintAppendBreakForTest(true) })
  await page.waitForTimeout(300)
  await pickPaint(page, 'pencil')
  for (let k = 0; k < 3; k++) { const [x, y] = wallSpot(spot++); await paintStroke(page, x, y) }
  const brkTex = await texHash(page)
  const brkScr = await screenHash(page)
  await rebakeAndWait(page)
  const brkRefTex = await texHash(page)
  const brkRefScr = await screenHash(page)
  const texDiff = JSON.stringify(brkTex) !== JSON.stringify(brkRefTex)
  const scrDiff = brkScr.hash !== brkRefScr.hash
  await page.evaluate(() => { (window as any).__b2.diag.setPaintAppendBreakForTest(false) })
  await rebakeAndWait(page)
  expect(texDiff, '반증 — 바탕 되깔기를 끄면 캔버스 픽셀이 갈린다').toBe(true)
  expect(scrDiff, '반증 — 바탕 되깔기를 끄면 화면 픽셀이 갈린다').toBe(true)
  OUT.g1_identity = {
    note: '누적(얹기)으로 그린 텍스처·화면이 전량 재굽기와 «같은 픽셀»인가 — 도구 넷 전수',
    rows,
    falsify_append_break: { tex_differs: texDiff, screen_differs: scrDiff,
      broke_hash: brkTex.map(t => t.hash), ref_hash: brkRefTex.map(t => t.hash) },
  }
})

test('③ 재굽힌 획 수 = 1 — 커밋마다 새 획 하나만', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  const rows: { n: number; bakes: number; baked: number; appends: number; appended: number; handed: number; bytes: number }[] = []
  for (let i = 0; i < 30; i++) {
    await bakeReset(page)
    const [x, y] = wallSpot(i)
    await paintStroke(page, x, y)
    const st = await bakeStat(page)
    rows.push({ n: i + 1, bakes: st.bakes, baked: st.bakedStrokes, appends: st.appends, appended: st.appendStrokes, handed: st.handoverStrokes ?? 0, bytes: st.uploadBytes })
  }
  const painted = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
  expect(painted, '서른 획이 놓였다').toBe(30)
  // 첫 커밋은 «그 (면,쪽) 텍스처가 서는» 자리라 전량 굽기가 맞다(얹을 바탕이 아직 없다).
  // 둘째부터는 새 획 하나만 — 전량 재굽기 0 · 얹기(또는 초안 인계) 1.
  // ⚠ 자 판갈이(web2-66): 그리는 중 세션이 그 획을 이미 층에 담았으면 커밋은 «인계»만 한다
  // (handoverStrokes — 다시 안 그린다). 뜻은 종전과 같다: 커밋에 그려진 새 획은 하나뿐이다.
  for (const r of rows.slice(1)) {
    expect(r.bakes, `획 ${r.n}: 전량 재굽기 0`).toBe(0)
    expect(r.baked, `획 ${r.n}: 다시 그린 획 0`).toBe(0)
    expect(r.appended + r.handed, `획 ${r.n}: 얹었거나 인계된 획 1`).toBe(1)
  }
  const full = await page.evaluate(() => {
    const t = (window as any).__b2.diag.paintTex()[0]
    return t.w * t.h * 4
  })
  OUT.g3_baked_count = {
    note: '커밋마다 «다시 그린 획 수»(전량 재굽기 몫)와 «얹은 획 수». 정본은 이 수다',
    rows_at: [1, 2, 10, 20, 30].map(n => rows[n - 1]),
    baked_after_first_max: Math.max(...rows.slice(1).map(r => r.baked)),
    appended_all_one: rows.slice(1).every(r => r.appended === 1),
    upload_full_bytes: full,
    upload_bytes_median_after_first: rows.slice(1).map(r => r.bytes).sort((a, b) => a - b)[Math.floor((rows.length - 1) / 2)],
  }
})

test('④ 다른 변경이 칠을 안 건드린다 — 치수·상관없는 선·되돌리기', async ({ page }) => {
  test.setTimeout(600_000)
  const postId = await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 5; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  const before = await texHash(page)
  const rows: Record<string, unknown>[] = []
  const step = async (name: string, fn: () => Promise<void>) => {
    await bakeReset(page)
    const v0 = await page.evaluate(() => (window as any).__b2.app.docVersion as number)
    await fn()
    await page.waitForTimeout(300)
    const v1 = await page.evaluate(() => (window as any).__b2.app.docVersion as number)
    const st = await bakeStat(page)
    rows.push({ what: name, docVersion: `${v0}→${v1}`, bakes: st.bakes, baked_strokes: st.bakedStrokes, appends: st.appends, syncs: (st as any).syncs })
    // 문서가 «실제로» 바뀐 것이 이 게이트의 전제다(안 바뀌었으면 아무것도 안 재는 것이다 — D-3)
    expect(v1, `${name}: 문서 판이 올랐다`).toBeGreaterThan(v0)
    expect(st.bakes, `${name}: 칠 재굽기 0`).toBe(0)
    expect(st.appends, `${name}: 얹기도 0`).toBe(0)
  }
  await step('치수 수정(2500 → 3000)', async () => {
    await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 3000), postId)
  })
  await page.click('#btn-pencil')
  await step('상관없는 선 하나(하늘에)', async () => { await drawLine(page, 950, 150, 1100, 190) })
  await step('그 선 되돌리기', async () => { await page.click('#btn-undo') })
  const after = await texHash(page)
  expect(JSON.stringify(after), '그 사이 그림은 한 픽셀도 안 바뀌었다').toBe(JSON.stringify(before))
  // ⚠⚠ 리뷰어 [M5] — 위 셋은 «재료·해칭이 없는» 면이다. 재료가 붙으면 무늬의 실척이 축척에
  // 매이므로 **치수 수정은 그때 굽어야 한다**(안 구우면 그것이 낡은 그림이다). 굽기 서명에
  // `rep.mm`이 들어 있다는 것을 «값으로» 확인한다 — 같은 몸짓의 답이 면의 상태에 따라 갈린다.
  const fid4 = await page.evaluate(() => (window as any).__b2.app.faces[0].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.cycleRep49(i), fid4)
  await page.waitForTimeout(400)
  await bakeReset(page)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 3500), postId)
  await page.waitForTimeout(400)
  const withRep = await bakeStat(page)
  const repNow = await texHash(page)
  await rebakeAndWait(page)
  const repRef = await texHash(page)
  expect(withRep.bakes, '재료가 붙은 면은 치수 수정에서 **굽는다**(무늬 실척이 축척에 매인다)').toBeGreaterThanOrEqual(1)
  expect(JSON.stringify(repNow), '그리고 그 그림이 정본 굽기와 같다(낡은 그림 0)').toBe(JSON.stringify(repRef))
  OUT.g4_untouched = {
    note: '문서가 바뀌어도 칠은 안 굽는다 — 「그 파생이 의존하는 것」만 열쇠다(#110). ⚠ 「의존하는 것」이 늘면(재료 = 축척) 같은 몸짓이 굽는다 — 아래 with_material이 그 갈림이다',
    rows, tex_hash_same: JSON.stringify(after) === JSON.stringify(before), tex_ink: before.map(t => t.ink),
    with_material: { what: '재료를 붙이고 치수 3000 → 3500', bakes: withRep.bakes, baked_strokes: withRep.bakedStrokes, matches_full_bake: JSON.stringify(repNow) === JSON.stringify(repRef) },
  }
})

test('④-b 부분 업로드 — 끄고 켠 판이 «화면으로 같다»(D-3 · 바이트만 다르다)', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 6; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  // ⚠ 자 판갈이(web2-66): 몸짓의 업로드가 «그리는 중»(초안 세션 — draftStat)과 «커밋»(bakeStat)
  // 둘로 갈렸다. 부분/전량의 대조는 몸짓 «전체»(둘의 합)로 잰다 — 뜻은 종전 그대로다.
  const draftUp = () => page.evaluate(() => (window as any).__b2.diag.paintDraftFrames() as { uploadBytes: number; uploads: number; fullUploads: number })
  const draftReset = () => page.evaluate(() => { (window as any).__b2.diag.paintDraftFramesReset() })
  // 켬 — 더티 사각만
  await bakeReset(page); await draftReset()
  {
    const [x, y] = wallSpot(6); await paintStroke(page, x, y)
  }
  const on = await bakeStat(page)
  const onD = await draftUp()
  const onScr = await screenHash(page)
  const onTex = await texHash(page)
  // 끔 — 같은 몸짓, 전량 업로드
  await page.evaluate(() => { (window as any).__b2.diag.setPaintPartialOffForTest(true) })
  await page.waitForTimeout(200)
  await bakeReset(page); await draftReset()
  {
    const [x, y] = wallSpot(7); await paintStroke(page, x, y)
  }
  const off = await bakeStat(page)
  const offD = await draftUp()
  // 같은 상태에서 두 판을 견주려면 «같은 문서»여야 한다 — 마지막 획을 되돌려 켬 판의 문서로 돌아간다
  await page.click('#btn-undo'); await page.waitForTimeout(400)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintPartialOffForTest(false) })
  await rebakeAndWait(page)
  const backScr = await screenHash(page)
  const backTex = await texHash(page)
  const onTotal = on.uploadBytes + onD.uploadBytes
  const offTotal = off.uploadBytes + offD.uploadBytes
  expect(onTotal, '켬 — 더티 사각만 올린다(몸짓 전체)').toBeLessThan(offTotal)
  expect(JSON.stringify(backTex), '되돌린 뒤 캔버스가 켬 판과 같다').toBe(JSON.stringify(onTex))
  expect(backScr.hash, '되돌린 뒤 **화면**이 켬 판과 같다 — 부분 업로드가 픽셀을 안 바꾼다').toBe(onScr.hash)
  OUT.g4b_partial = {
    note: '부분 업로드 켬/끔의 대조(D-3) — 바이트는 갈리고 픽셀은 같다. ⚠ 이 자가 65의 첫 판을 잡았다(SKIP × FLIP_Y로 화면이 갈렸다). 66부터 몸짓 전체(초안 + 커밋)로 잰다',
    partial_on: { upload_bytes_total: onTotal, commit: on.uploadBytes, draft: onD.uploadBytes, uploads: on.uploads + onD.uploads, screen_hash: onScr.hash, screen_ink: onScr.ink },
    partial_off: { upload_bytes_total: offTotal, commit: off.uploadBytes, draft: offD.uploadBytes, uploads: off.uploads + offD.uploads },
    ratio_off_over_on: +(offTotal / Math.max(1, onTotal)).toFixed(1),
    screen_same_after_restore: backScr.hash === onScr.hash,
  }
})

test('④-c 재료 면의 «줌 뒤 갈림»과 그 지속 — 값으로(리뷰어 [H5])', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 6; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  const fid = await page.evaluate(() => (window as any).__b2.app.faces[0].id as number)
  const zoomIn = async () => {
    await page.mouse.move(700, 480)
    for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(50) }
    await page.waitForTimeout(300)
  }
  // ⚠ **차례가 값을 정한다**(실측): 재료는 **줌 «전»**에 붙어야 한다. 줌이 단계를 상한(1024)까지
  // 올린 «뒤»에 붙이면 그 다음 줌이 단계를 못 갈라 재굽기가 아예 없고, 그러면 이 팔은 아무것도
  // 안 잰다(초판이 그랬다 — now == ref == ref2로 «갈림 없음»이 나왔다).
  // 그래서 이 팔은 **재료를 먼저 붙이고** 줌한다. 대조군(재료 없음)은 아래 ④-d가 든다.
  await page.evaluate((i) => (window as any).__b2.diag.cycleRep49(i), fid)
  await page.waitForTimeout(400)
  await zoomIn()
  const repNow = await texHash(page)
  // ⚠⚠ **지속을 «재굽기 전»에 잰다**(자기참조 — §5.1 유형 3): 초판은 rebake 두 번 뒤에 편집하고
  // 읽어서 «나았다»가 나왔는데, 그것은 편집이 아니라 **그 rebake가** 만든 값이었다(자가 제 행위를
  // 되읽었다). 지속의 물음은 「트리거가 아닌 편집이 낡은 그림을 낫게 하는가」이므로 순서가 이렇다:
  //   줌(갈림) → **상관없는 편집** → 읽는다 → 그제서야 rebake로 정본을 낸다.
  await page.click('#btn-pencil')
  await drawLine(page, 950, 150, 1100, 190)
  await page.waitForTimeout(400)
  const afterEdit = await texHash(page)
  await page.click('#btn-paint'); await page.waitForTimeout(60)
  await rebakeAndWait(page)
  const repRef1 = await texHash(page)
  await rebakeAndWait(page)
  const repRef2 = await texHash(page)     // 재굽기 두 번이 서로 같은가(요동이 아님의 값)
  OUT.g4c_rep_zoom = {
    note: '재료 무늬의 선 굵기(rep.texelPerPx = 단계 ÷ 화면 크기)는 «줌의 연속값»이라 굽기 열쇠에 안 든다(넣으면 매 프레임 재굽기 — 49 규약). 그 대가가 이 표다',
    with_material: { now: repNow.map(t => t.hash), ref1: repRef1.map(t => t.hash), ref2: repRef2.map(t => t.hash),
      same: JSON.stringify(repNow) === JSON.stringify(repRef1), ref_stable: JSON.stringify(repRef1) === JSON.stringify(repRef2) },
    persistence: { note: '상관없는 편집(하늘의 선 하나 — 굽기 트리거가 아니다) 뒤에도 그대로인가. **65는 열쇠가 좁아 안 낫는다** — 옛 코드는 어떤 문서 변경도 전량 재굽기였으므로 그 편집에서 나았다: 갈림 «자체»는 종전에도 있었고 65가 바꾼 것은 **지속 시간**이다(리뷰어 [H5]의 그 물음)',
      hash_after_unrelated_edit: afterEdit.map(t => t.hash),
      healed_by_unrelated_edit: JSON.stringify(afterEdit) !== JSON.stringify(repNow) },
  }
  expect(repNow.length, '텍스처가 섰다').toBeGreaterThan(0)
  expect(JSON.stringify(repRef1), '재굽기 두 번이 서로 같다 — 요동이 아니다(요동이면 이 팔은 아무것도 안 잰다)').toBe(JSON.stringify(repRef2))
})

test('④-d 대조군 — 재료 «없는» 면은 줌 뒤에도 정본 굽기와 같다', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 6; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  await page.mouse.move(700, 480)
  for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(50) }
  await page.waitForTimeout(300)
  const now = await texHash(page)
  const nowScr = await screenHash(page)
  await rebakeAndWait(page)
  const ref = await texHash(page)
  const refScr = await screenHash(page)
  OUT.g4d_bare_zoom = {
    note: '④-c의 대조군 — 재료가 없으면 줌 뒤에도 갈림이 «없다». 즉 ④-c의 갈림은 무늬 굵기(texelPerPx)의 것이지 누적의 것이 아니다',
    now: now.map(t => t.hash), ref: ref.map(t => t.hash), same: JSON.stringify(now) === JSON.stringify(ref),
    screen_same: nowScr.hash === refScr.hash, ink: now.map(t => t.ink),
  }
  expect(now.length, '텍스처가 섰다').toBeGreaterThan(0)
  expect(JSON.stringify(now), '재료 «없는» 면은 줌 뒤에도 정본 굽기와 같다(캔버스)').toBe(JSON.stringify(ref))
  expect(nowScr.hash, '화면도 같다').toBe(refScr.hash)
})

test('⑤ 무회귀 트리거가 «산다» — 여섯 전수', async ({ page }) => {
  test.setTimeout(900_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 6; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  const rows: Record<string, unknown>[] = []
  /** 트리거 뒤 ① 다시 구웠는가(값) ② 그 그림이 «정본 굽기»와 같은가(낡은 그림 0) */
  const trigger = async (name: string, fn: () => Promise<void>, expectBake = true) => {
    await bakeReset(page)
    await fn()
    await page.waitForTimeout(400)
    const st = await bakeStat(page)
    const now = await texHash(page)
    // ⚠⚠ 리뷰어 [H4] — **화면도 본다**. 이 회차가 실제로 겪은 결함 둘(부분 업로드 · GPU 크기)이
    // 「굽힌 캔버스는 맞는데 화면이 다르다」였다. 캔버스만 대면 같은 유형이 그대로 샌다.
    const nowScr = await screenHash(page)
    await rebakeAndWait(page)
    const ref = await texHash(page)
    const refScr = await screenHash(page)
    const same = JSON.stringify(now) === JSON.stringify(ref)
    const sameScr = nowScr.hash === refScr.hash
    rows.push({ what: name, bakes: st.bakes, baked_strokes: st.bakedStrokes, drops: st.drops, entries: st.entries, tex_reallocs: st.texReallocs, matches_full_bake: same, screen_matches_full_bake: sameScr, screen_ink: nowScr.ink })
    if (expectBake) expect(st.bakes + st.drops, `${name}: 다시 굽거나 항목을 버린다`).toBeGreaterThanOrEqual(1)
    expect(same, `${name}: 그 뒤 그림이 정본 굽기와 같다(낡은 그림 0 — 캔버스)`).toBe(true)
    expect(sameScr, `${name}: 그 뒤 **화면**도 정본 굽기와 같다(낡은 그림 0 — 화면)`).toBe(true)
  }
  // ⚠⚠ **차례가 값을 정한다 — 실측 둘이 이 차례를 강제한다**:
  //  ① 줌은 화면 좌표를 바꾼다 → 좌표로 짚는 트리거(지우개)보다 «뒤»에 두면 엉뚱한 자리를 문다
  //     (실측: 줌을 앞에 뒀더니 지우개가 윗변을 못 물어 「면 경계 변경」이 0회였다).
  //  ② 줌은 **재료가 붙기 «전»**에 해야 「낡은 그림 0」을 잴 수 있다. 재료 무늬의 선 굵기
  //     (rep.texelPerPx = 단계 ÷ 화면 크기)는 **줌의 연속값**이라 굽기 열쇠에 안 든다(넣으면
  //     매 프레임 재굽기다 — 49의 「굵기는 단계에 붙는다」 규약). 그래서 재료 면에서는
  //     「지금 그림」이 단계가 갈린 «그 순간»의 굵기로 구워져 있고, 그 뒤 이어진 줌 끝에서
  //     전량 재굽기를 하면 굵기가 달라 픽셀이 갈린다. **65가 만든 것이 아니라 종전 그대로다**
  //     (옛 조건도 `lv !== e.level`에서만 굽고 그때의 texelPerPx를 썼다).
  //     실측(탐침): 재료 없음 → 해시 −1158253257 == 재굽기 −1158253257 · 재료 있음 →
  //     −273067694 vs −186577108(재굽기 두 번은 서로 같다 — 요동이 아니다).
  await trigger('획 삭제(되돌리기)', async () => { await page.click('#btn-undo') })
  await trigger('브러시 재바인딩(슬롯 조정)', async () => {
    await page.evaluate(() => { (window as any).__b2.diag.setPaintParamForTest('pencil', 'sizeK', 1.6) })
  })
  // 면 경계 변경 — **연필 지우개로 상자의 윗변을 지운다**(면이 안 닫히면 그 면은 사라진다).
  // 「다시 굽는다」의 값은 여기서 «항목을 버렸다»(drops)로 나온다 — 파생이 정본을 따라간다는 같은 사실이다.
  await trigger('면 경계 변경(윗변을 지운다)', async () => {
    await page.click('#btn-eraser-pencil')
    await page.mouse.move(640, 320)
    await page.mouse.down()
    await page.mouse.move(700, 332, { steps: 6 })
    await page.mouse.move(760, 336, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)
  })
  const goneFaces = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  // 되돌리면 면이 돌아오고 그 자리에서 다시 굽는다 — 「버린 것은 다시 필요해지면 다시 굽는다」
  await trigger('그 모서리 되돌리기(면이 돌아온다)', async () => { await page.click('#btn-undo') })
  const backFaces = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  OUT.g5_face_boundary = { faces_after_erase: goneFaces, faces_after_undo: backFaces }
  // ⚠ **줌은 «줄이는» 쪽이다**(dpr2 실측): dpr2에서는 이 벽이 이미 해상도 상한(FACETEX_MAX_PX
  // 1024)에 걸려 있어 «키우면» 단계가 안 갈리고 재굽기도 없다 — 그것이 옳은 거동이다(포화).
  // 그래서 단계가 «실제로 갈릴 때까지» 줄이고, 갈렸다는 것을 값으로 먼저 확인한다(안 갈렸으면
  // 이 팔은 아무것도 안 잰 것이다 — D-3).
  const levelNow = () => page.evaluate(() => ((window as any).__b2.diag.paintTex()[0]?.level ?? 0) as number)
  let lvBefore = 0, lvAfter = 0
  await trigger('해상도 단계(줌 — 단계가 갈릴 때까지 줄인다)', async () => {
    lvBefore = await levelNow()
    lvAfter = lvBefore
    await page.mouse.move(700, 480)
    for (let k = 0; k < 12 && lvAfter === lvBefore; k++) {
      await page.mouse.wheel(0, 300)
      await page.waitForTimeout(70)
      lvAfter = await levelNow()
    }
  })
  expect(lvAfter, `줌이 해상도 «단계»를 실제로 갈랐다(${lvBefore} → ${lvAfter})`).not.toBe(lvBefore)
  // ⚠⚠ **단계가 갈리면 GPU 텍스처를 «다시 할당»해야 한다.** three는 WebGL2에서 texStorage2D로
  // 한 번 할당하고 그 뒤는 texSubImage2D로만 올린다(불변 저장) — 항목을 살려 쓰는 65에서
  // 캔버스가 커져도 GPU가 옛 크기면 화면에 «옛 그림이 늘어난다». **굽힌 캔버스 해시로는
  // 안 잡힌다**(CPU 캔버스는 정확하다) — 무회귀 팔 thick55 ④가 잡았고, 여기가 그 자리 팔이다.
  const zoomRow = rows[rows.length - 1] as { tex_reallocs: number }
  expect(zoomRow.tex_reallocs, '단계가 갈렸으니 GPU 텍스처를 다시 할당했다').toBeGreaterThanOrEqual(1)
  OUT.g5_zoom_level = { before: lvBefore, after: lvAfter, tex_reallocs: zoomRow.tex_reallocs }
  await trigger('재료 변경', async () => {
    const fid = await page.evaluate(() => (window as any).__b2.app.faces[0].id as number)
    await page.evaluate((i) => (window as any).__b2.diag.cycleRep49(i), fid)
  })
  await trigger('해칭 변경(면 고정)', async () => {
    // 설정 통이 접혀 있어도 되게 값을 놓고 change를 보낸다(앱의 그 처리기가 그대로 돈다)
    await page.evaluate(() => {
      const b2 = (window as any).__b2
      b2.app.doc.faces[0].fill = 1
      const box = document.getElementById('chk-hatchface') as HTMLInputElement
      box.checked = true
      box.dispatchEvent(new Event('change'))
    })
  })
  OUT.g5_triggers = { note: '무회귀 트리거 전수 — 「다시 굽는다」와 「낡은 그림 0」을 값으로. **캔버스와 화면 둘 다** 본다(리뷰어 [H4])', rows,
    all_rebaked: rows.every(r => (r.bakes as number) + (r.drops as number) >= 1),
    all_match_full_bake: rows.every(r => r.matches_full_bake === true),
    all_screen_match_full_bake: rows.every(r => r.screen_matches_full_bake === true) }
})

test('⑥ 반증(D-3) — 누적을 끄면 pre의 O(N)이 돌아온다', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 12; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  await bakeReset(page)
  const [xa, ya] = wallSpot(12)
  await paintStroke(page, xa, ya)
  const on = await bakeStat(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintAccumOffForTest(true) })
  await page.waitForTimeout(400)
  await bakeReset(page)
  const [xb, yb] = wallSpot(13)
  await paintStroke(page, xb, yb)
  const off = await bakeStat(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintAccumOffForTest(false) })
  await page.waitForTimeout(400)
  expect(on.bakedStrokes, '누적 켬 — 다시 그린 획 0').toBe(0)
  // 자 판갈이(web2-66) — 세션 인계(handoverStrokes)도 «새 획 하나»다(paint65 ③의 그 주석)
  expect(on.appendStrokes + (on.handoverStrokes ?? 0), '누적 켬 — 얹었거나 인계된 획 1').toBe(1)
  expect(off.bakedStrokes, '누적 끔 — 그 면의 획 전부를 다시 그린다').toBe(14)
  expect(off.appendStrokes + (off.handoverStrokes ?? 0), '누적 끔 — 얹기·인계 0').toBe(0)
  OUT.g6_falsify_accum = {
    note: '같은 장면·같은 몸짓에서 누적만 껐다 — 재굽힌 획 수가 1(얹기·인계)에서 «전부»로 돌아간다',
    accum_on: { baked_strokes: on.bakedStrokes, appended: on.appendStrokes, handed: on.handoverStrokes ?? 0, upload_bytes: on.uploadBytes },
    accum_off: { baked_strokes: off.bakedStrokes, appended: off.appendStrokes, handed: off.handoverStrokes ?? 0, upload_bytes: off.uploadBytes },
  }
})

test('⑦ 메모리 — 상한이 지켜진다 · 버린 뒤 다시 보면 같은 픽셀', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  for (let i = 0; i < 8; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  const before = await bakeStat(page)
  // 벽의 «쪽»이 뒤집히게 돈다(탐침 실측: 중버튼 +200px이면 그 항목이 안 보이게 된다)
  const orbit = async (dx: number) => {
    await page.mouse.move(600, 400)
    await page.mouse.down({ button: 'middle' })
    for (let i = 1; i <= 25; i++) await page.mouse.move(600 + (i * dx) / 25, 400)
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(300)
  }
  await orbit(200)
  const hiddenNow = await page.evaluate(() => (window as any).__b2.diag.paintTex().filter((t: any) => t.gateSide === false).length as number)
  expect(hiddenNow, '벽 텍스처가 안 보이는 상태가 됐다').toBeGreaterThanOrEqual(1)
  // 상한을 «지금 쓰는 것보다 아래»로 내린다 → 다음 프레임에 안 보이는 것부터 버린다
  await bakeReset(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintTexBudgetForTest(1024) })
  await page.waitForTimeout(400)
  await page.mouse.move(601, 401)           // 프레임 하나 더(축출은 그리는 프레임의 일이다)
  await page.waitForTimeout(300)
  const evicted = await bakeStat(page)
  expect(evicted.evicts, '안 보이는 항목을 버렸다').toBeGreaterThanOrEqual(1)
  expect(evicted.bytes, '상한이 지켜진다').toBeLessThanOrEqual(1024)
  // 상한을 되돌리고 다시 보이게 → 그 자리에서 다시 굽는다. 그 그림이 정본 굽기와 같아야 한다.
  await page.evaluate(() => { (window as any).__b2.diag.setPaintTexBudgetForTest(134217728) })
  await orbit(700)
  const backTex = await texHash(page)
  const backScr = await screenHash(page)
  expect(backTex.length, '다시 보인다').toBeGreaterThan(0)
  expect(backTex[0]!.ink, '다시 구운 그림에 잉크가 있다').toBeGreaterThan(0)
  await rebakeAndWait(page)
  const refTex = await texHash(page)
  const refScr = await screenHash(page)
  expect(JSON.stringify(backTex), '버린 뒤 다시 보면 정본 굽기와 같은 픽셀').toBe(JSON.stringify(refTex))
  expect(backScr.hash, '화면도 같다').toBe(refScr.hash)
  OUT.g7_memory = {
    note: '상한(팔이 1024로 내림) · 안 보이는 것부터 축출 · 다시 보면 정본 굽기와 같은 픽셀',
    bytes_before: before.bytes, budget_default: before.budget,
    evicts: evicted.evicts, bytes_after: evicted.bytes,
    restored_same: JSON.stringify(backTex) === JSON.stringify(refTex) && backScr.hash === refScr.hash,
    tex_ink: backTex.map(t => t.ink),
  }
})
