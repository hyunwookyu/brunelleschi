// web2-65 — **칠 성능의 계측**(D-2 수리 전 판 + 수리 후 대조).
//
// 지시 65 §1 「⚠ 착수 전 — D-2로 값을 먼저 낸다」의 다섯을 그대로 잰다:
//   (a) 커밋 한 번의 시간(ms)      획 수에 비례하는가
//   (b) 그때 재굽힌 «획 수»        새 획 하나인가, 전부인가
//   (c) 텍스처 업로드 바이트       전체인가 부분인가
//   (d) 궤도 중 프레임 시간        칠이 많을 때
//   (e) 면 셋에 각각 20획일 때     면 수만큼 곱해지는가
//
// 자의 자리: `diag.paintBake()`(render3d의 굽기 계수기 — 재굽기 수·재굽힌 획 수·업로드
// 바이트·ms)와 `diag.frameCost()`(18-0부의 프레임 3몫 — 같은 함수 #54).
// **정본은 «획 수»다**(기기·부하 무관). ms는 곁값이고 배수만 읽는다(#12 · #14).
//
// 원장: `stage0/out/perf65_web2_dpr{1,2}.json` — 수리 «전» 판은 `PRE65=1`로 돌려
// `perf65_pre_web2_dpr{1,2}.json`에 **동결**한다(paint59_pre의 선례: 재실행이 D-2의
// 증거를 덮지 못하게 파일을 가른다).
//   수리 전:  LEDGER=1 PRE65=1 node tools/e2e.mjs ledger e2e/perf65.spec.ts --project=dpr1
//   수리 후:  LEDGER=1 node tools/e2e.mjs ledger e2e/perf65.spec.ts --project=dpr1
//
// ⚠ 계측 스펙이다(§1㉠ · MEASURE_SPECS) — 워커 수가 값을 바꾼다. 초록 실행에서 빠지고
// 밤·원장에만 돈다. 게이트(픽셀 항등·재굽힌 획 수·무회귀 트리거)는 `paint65.spec.ts`다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRE = process.env.PRE65 === '1'
const OUT: Record<string, unknown> = {
  what: 'web2-65 — 칠 성능 계측(D-2): (a) 커밋 ms (b) 재굽힌 획 수 (c) 업로드 바이트 (d) 궤도 프레임 (e) 면 셋',
  tree: PRE ? '수리 전(pre — 동결)' : '수리 후(post)',
  note_pitfalls: '#12(동작점 하나로 주장하지 않는다 — 획 1·10·30·60 네 점 · 면 하나/셋 두 판) · #14(ms는 요동한다 — 정본은 «획 수», ms는 배수만) · #99(워커 1) · #101(web2 안에서) · #103(같은 장면을 두 번 읽는다 — 획 수가 장면 확인) · #47(수치는 원장이 정본)',
  note_meter: '자는 diag.paintBake()(render3d 굽기 계수기)와 diag.frameCost()(18-0부) — 앱이 실제로 도는 그 함수다(#54). ms는 페이지 «안»에서 잰 굽기 시간이라 플레이라이트 왕복이 안 섞인다',
  scene: 'paint50의 bigBox(오른쪽 벽 · 축척 2500) · 면 셋 판은 왼쪽 벽을 더한다',
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31·paint50의 no_constants_snapshot이 정본 · 그 기계는 web/test/constants.ts에만 있다)' },
  pitfall_citations: [12, 14, 47, 99, 101, 103, 110],
  selfcheck_notes: { zero_counters: '(a)의 post 행에서 baked_strokes가 0인 것은 «집계 미작동»이 아니라 이 라운드가 잰 그것이다 — 얹기(appends 1 · appendStrokes 1)가 그 자리를 대신한다. 반증은 게이트 ⑥(누적 끔 → 0이 아니라 그 면의 획 전부)' },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/perf65${PRE ? '_pre' : ''}_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: `LEDGER=1 ${PRE ? 'PRE65=1 ' : ''}node tools/e2e.mjs ledger e2e/perf65.spec.ts (워커 1 — #99)` },
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

/** paint50·paint59의 그 상자. faces = 1(오른쪽 벽) · 2(＋바닥).
 *  ⚠ **왼쪽 벽은 여기서 안 세운다** — 아래 `addLeftWall`이 «바닥을 칠한 뒤» 세운다(사유는 그 함수). */
async function bigBox(page: Page, faces: 1 | 2) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)      // 오른쪽 벽
  if (faces >= 2) { await page.mouse.click(400, 635); await page.waitForTimeout(80) }   // 바닥
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  return await page.evaluate(() => (window as any).__b2.app.faces.length as number)
}

/** **셋째 면 — 왼쪽 벽**. 두 가지를 실측이 강제한다(탐침):
 *  ① 두 모서리를 «여덟 줄과 함께» 그으면 벽·바닥 탭이 면을 못 세운다(면 하나) — 벽·바닥을
 *     세운 «뒤»에 그어야 셋이 선다.
 *  ② 왼쪽 벽이 서면 **바닥이 화면에서 가려진다**(상자를 밖에서 본다 — 벽 둘이 바닥 앞이다).
 *     그래서 바닥 칠은 이 함수를 부르기 «전»에 한다. 자리는 그대로 산다(칠은 면의 것이다). */
async function addLeftWall(page: Page) {
  await page.click('#btn-pencil')
  await drawLine(page, 150, 620, 150, 250)     // 왼쪽 벽의 세로 모서리
  await drawLine(page, 150, 250, 500, 330)     // 그 윗변(모서리 3과 같은 소실점)
  await page.click('#btn-face')
  await page.mouse.click(300, 470); await page.waitForTimeout(100)
  await page.click('#btn-paint'); await page.waitForTimeout(60)
  return await page.evaluate(() => (window as any).__b2.app.faces.length as number)
}

async function pickPaint(page: Page, i = 'pencil', w = 18, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 칠 한 붓 — 짧은 획(면 안). 점렬은 고정이라 획마다 같은 부하다. */
async function paintStroke(page: Page, x0: number, y0: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 21, y0 + 5, { steps: 3 })
  await page.mouse.move(x0 + 42, y0 + 10, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(70)
}

/** 값 무리의 «평평함» — 평균 대비 최대 벗어남의 몫(게이트 ②의 ±20%가 이 자다) */
const spread = (v: number[]): number | null => {
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  return mean > 0 ? +(Math.max(...v.map(x => Math.abs(x - mean))) / mean).toFixed(3) : null
}
type Bake = { bakes: number; bakedStrokes: number; appends: number; appendStrokes: number; uploads: number; uploadBytes: number; ms: number; drops: number; entries: number }
const bakeStat = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintBake() as Bake)
const bakeReset = (page: Page) => page.evaluate(() => { (window as any).__b2.diag.paintBakeReset() })

/** 오른쪽 벽 안의 격자 자리(6 × 10 = 60) — 화면 좌표. 벽 사각 (500,700)(900,610)(900,330)(500,330) 안. */
const wallSpot = (i: number): [number, number] => [530 + (i % 6) * 58, 355 + Math.floor(i / 6) * 25]
/** 바닥 안 — (500,700)(900,610)(640,560)(150,620)의 안쪽 왼쪽 몫(벽이 안 가리는 자리). 스무 자리.
 *  ⚠ 왼쪽 벽이 선 «뒤»에는 이 자리가 벽에 가린다 — 바닥 칠은 addLeftWall 전에 한다. */
const floorSpot = (i: number): [number, number] => [280 + (i % 5) * 35, 615 + Math.floor(i / 5) * 9]
/** 왼쪽 벽 안 — (500,700)(150,620)(150,250)(500,330)의 안쪽. 스무 자리.
 *  ⚠ **칠 패널의 오른쪽**이어야 한다(web2-65 §2 ①로 패널이 화면 왼쪽 x 6..278로 옮겼다) —
 *  옛 자리(x 230~)는 앞자락이 패널에 먹혀 놓인 획이 60 → 52가 됐다(실측). 벽은 화면 x 150~500이라
 *  300부터가 그 벽의 «패널 안 가리는» 몫이다. */
const leftSpot = (i: number): [number, number] => [300 + (i % 5) * 34, 400 + Math.floor(i / 5) * 30]

test('(a)(b)(c) 커밋 한 번의 값 — 면 하나에 획 60까지', async ({ page }) => {
  test.setTimeout(900_000)
  const nf = await bigBox(page, 1)
  await pickPaint(page)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < 60; i++) {
    await bakeReset(page)
    const [x, y] = wallSpot(i)
    await paintStroke(page, x, y)
    const st = await bakeStat(page)
    rows.push({ n: i + 1, ...st })
  }
  const painted = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
  const at = (n: number) => rows[n - 1] as unknown as Bake
  OUT.a_commit_series = { faces: nf, painted, rows }
  OUT.a_commit = {
    note: '(a)(b)(c) — 획 1·10·30·60에서 커밋 한 번의 굽기 ms · 그때 다시 그린 획 수 · 업로드 바이트',
    points: [1, 10, 30, 60].map(n => ({ n, ms: at(n).ms, baked_strokes: at(n).bakedStrokes, bakes: at(n).bakes, appends: at(n).appends, upload_bytes: at(n).uploadBytes, drops: at(n).drops })),
    ms_ratio_60_over_1: at(1).ms > 0 ? +(at(60).ms / at(1).ms).toFixed(2) : null,
    baked_ratio_60_over_1: at(1).bakedStrokes > 0 ? +(at(60).bakedStrokes / at(1).bakedStrokes).toFixed(2) : null,
    // 게이트 ②의 자 둘. **넷 전부**와 **첫 커밋을 뺀 셋**을 갈라 적는다:
    // 획 1의 커밋은 «그 (면,쪽) 텍스처가 서는» 자리라 전량 굽기가 맞고(얹을 바탕이 아직 없다)
    // 그 몫은 누적의 평평함과 다른 일이다. 지시의 ±20%가 묻는 것은 «누적 커밋»의 평평함이다.
    ms_spread_frac: spread([1, 10, 30, 60].map(n => at(n).ms)),
    ms_spread_frac_incremental: spread([10, 30, 60].map(n => at(n).ms)),
  }
})

test('(d) 궤도 중 프레임 — 획 60 · 면 셋', async ({ page }) => {
  test.setTimeout(900_000)
  await bigBox(page, 2)
  await pickPaint(page)
  for (let i = 0; i < 20; i++) { const [x, y] = floorSpot(i); await paintStroke(page, x, y) }
  const nf = await addLeftWall(page)
  for (let i = 0; i < 20; i++) { const [x, y] = wallSpot(i); await paintStroke(page, x, y) }
  for (let i = 0; i < 20; i++) { const [x, y] = leftSpot(i); await paintStroke(page, x, y) }
  const painted = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
  expect(painted, '예순 획이 다 놓였다 — 장면이 pre와 같다(#103)').toBe(60)
  await page.evaluate(() => { (window as any).__b2.diag.frameCostReset() })
  await bakeReset(page)
  // 궤도 — **중버튼 끌기**(cost20 orbitFrames·rollpose와 같은 몸짓 #54). 서른 걸음이 프레임 표본이다.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let k = 1; k <= 30; k++) await page.mouse.move(600 + k * 4, 400 + (k % 5))
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(300)
  const fc = await page.evaluate(() => (window as any).__b2.diag.frameCost())
  const st = await bakeStat(page)
  OUT.d_orbit = { faces: nf, painted, frame: fc, bake_during_orbit: st }
})

test('(e) 면 셋에 각각 20획 — 면 수만큼 곱해지는가', async ({ page }) => {
  test.setTimeout(900_000)
  await bigBox(page, 2)
  await pickPaint(page)
  const rows: Record<string, unknown>[] = []
  const run = async (name: string, spot: (i: number) => [number, number]) => {
    for (let i = 0; i < 20; i++) {
      await bakeReset(page)
      const [x, y] = spot(i)
      await paintStroke(page, x, y)
      const st = await bakeStat(page)
      rows.push({ face: name, n: i + 1, total: rows.length + 1, ...st })
    }
  }
  await run('floor', floorSpot)          // 바닥이 먼저다(왼쪽 벽이 서면 가린다 — addLeftWall 주석)
  const nf = await addLeftWall(page)
  await run('wall', wallSpot)
  await run('left', leftSpot)
  const painted = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
  expect(painted, '예순 획이 다 놓였다 — 장면이 pre와 같다(#103)').toBe(60)
  const last = rows[rows.length - 1] as unknown as Bake
  OUT.e_three_faces = {
    faces: nf, painted, rows,
    last_commit: { ms: last.ms, baked_strokes: last.bakedStrokes, bakes: last.bakes, appends: last.appends, upload_bytes: last.uploadBytes, entries: last.entries },
  }
})
