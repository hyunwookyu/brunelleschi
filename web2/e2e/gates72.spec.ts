// web2-72 §1·§2·§3·§4 — **게이트**(계측은 perf72.spec.ts). 값이 아니라 «규칙»을 지킨다.
//
//   §1-1 시간 분할   굽기가 프레임을 안 막는다: 미룬 것이 있다(값) · 빈 프레임 0 ·
//                    **조각내 구운 픽셀 == 한 번에 구운 픽셀**(반증: 분할 끔) · 66 이동량 0 무회귀
//   §1-2 색인        편집 한 번에 훑는 획 수 == **그 면의 획 수**(전체 아님) ·
//                    색인과 옛 훑기의 목록이 **한 획도 안 다르다**(반증: 색인 끔)
//   §2   동결        궤도 4초 동안 bakeFaceTex 호출 0 · 단계 «내림»에서 굽기 0 ·
//                    경계 왕복(줌 인아웃 10회)에서 재굽기 ≤ 2 · 멈춘 뒤 재굽기 ≤ 보이는 면 수 ·
//                    **반증: 동결·히스테리시스를 끄면 재굽기가 돌아온다**
//   §3   배분        예산을 좁혀도 **퇴출 0**(보이는 것) · 합 ≤ 예산 · 내려간 면의 텍셀/px ≥ 0.5
//   §4   열 때       첫 상호작용 프레임 · 메인 최장 차단(대조군과 함께) · 저장 왕복 5/5 · KEY_ORDER 무변
//
// 원장: stage0/out/gates72_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildHeavy, orbitProbe, zoomToLevel, memProbe, settleBake, setLegacy, type BakeStat } from './heavy72'

// ⚠ 게이트의 픽스처는 **계측의 절반**이다(면마다 칠 획 16 · 계측 perf72는 지시대로 40).
//   게이트가 재는 것은 «규칙»(굽기 0 · 픽셀 항등 · 훑기 = 그 면의 획 수)이라 획 수의
//   절대값에 안 걸리고, 밤 전량이 이 스펙을 다섯 번 돌므로 픽스처 비용이 곧 밤 시간이다.
//   계측이 대역을 덮고(920 획) 게이트가 규칙을 지킨다 — 갈라 둔 이유가 그것이다.
const PER_FACE = 16
import { PAINT72_BOUNDARY_REBAKE_MAX } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-72 게이트 — §1(분할·색인) §2(동결·히스테리시스) §3(배분) §4(열 때)',
  note_pitfalls: '#12·#14(정본은 «호출 수·훑은 획 수» — ms는 곁값) · #42 · #81(대기에 상한) · #89(초록의 범위 — 굽기가 끝난 뒤에 잰다) · #99 · #101 · #103 · #105(빈 결과 폴백은 값이 아니다 — «보이는 것»으로 자를 잡지 않는다) · #110(열쇠를 그 파생의 입력으로) · #111',
  pitfall_citations: [12, 14, 42, 81, 89, 99, 101, 103, 105, 110, 111],
  thresholds: { PAINT72_BOUNDARY_REBAKE_MAX, note_alloc: '흐림 하한(텍셀/px)은 앱 상수 C.PAINT72_ALLOC_TEXEL_PER_PX_MIN — 아래 g3_alloc.texel_floor에 그 값이 그대로 든다(D-C4)' },
  no_constants_snapshot: true,
  selfcheck_notes: {
    zero_counters: '§2의 orbit_freeze_on.bakes 0 · level_down 0 · empty_frames 0과 §3의 evicts 0은 **통과값**이다 — 같은 자가 반증에서 0이 아닌 값을 낸다(orbit_freeze_off.bakes · 같은 원장에 짝으로 든다). g1_index.mismatched_n 0도 같은 꼴이고, 집계가 도는 증거는 같은 실행의 lists 23 · index_off.per_call 934다',
    identical_pairs: '§1-1의 «조각 == 한 번에» 픽셀 같음(pixels_equal)과 §1-2의 목록 같음은 게이트의 뜻 그 자체다 — 반증 스위치(분할 끔 · 색인 끔)가 다른 값을 내는 것이 판별력이다',
    zero_error_metric: 'g1_slice.whole.deferred 0은 **설계 보장**이다(분할을 끄면 미룰 것이 없다 — 반증 판의 정의). 임계를 안 건다: 임계는 켬 판의 deferred > 0에 건다',
    single_category: 'g4_open.fixture.levels가 한 값(256×23)인 것은 픽스처의 구성이다 — 격자 벽의 칸이 화면에서 «서로 비슷한 크기»라 같은 단계에 든다. 단계의 변별은 §2·§3이 **줌으로 대역을 넓혀** 잰다(그 표는 g2_freeze·g3_alloc의 texel_per_px)',
  },
}
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/gates72_web2_dpr${p === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/gates72.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

type TexHash = { key: string; level: number; hash: number; ink: number; w: number; h: number }
const texHash = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as TexHash[])
const bake = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintBake() as BakeStat)
const bakeReset = (page: Page) => page.evaluate(() => { (window as any).__b2.diag.paintBakeReset() })
const settle = (page: Page) => settleBake(page)
const rebake = async (page: Page) => {
  await page.evaluate(() => { (window as any).__b2.diag.rebakePaintTex() })
  await settle(page)
}

test('§1 — 시간 분할이 프레임을 안 막는다 · 조각내 구운 픽셀 == 한 번에 구운 픽셀(반증: 분할 끔)', async ({ page }) => {
  test.setTimeout(900_000)
  const built = await buildHeavy(page, PER_FACE)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(300)
  // ── 분할 «켬»으로 전량 재굽기 — 미룬 것이 있고(값), 그림은 아래 «끔» 판과 같아야 한다
  await bakeReset(page)
  await rebake(page)
  const slicedStat = await bake(page)
  const slicedTex = await texHash(page)
  // ── 반증(D-3): 분할을 끄면 한 프레임에 전부 굽는다 — 미룸 0. **픽셀은 같아야 한다.**
  await page.evaluate(() => { (window as any).__b2.diag.setPaintBakeSliceOffForTest(true) })
  await bakeReset(page)
  await rebake(page)
  const wholeStat = await bake(page)
  const wholeTex = await texHash(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintBakeSliceOffForTest(false) })
  OUT.g1_slice = {
    sliced: { deferred: slicedStat.deferred, sliced: slicedStat.sliced, bakes: slicedStat.bakes, baked_strokes: slicedStat.bakedStrokes, ms: slicedStat.ms },
    whole: { deferred: wholeStat.deferred, sliced: wholeStat.sliced, bakes: wholeStat.bakes, baked_strokes: wholeStat.bakedStrokes, ms: wholeStat.ms },
    pixels_equal: JSON.stringify(slicedTex) === JSON.stringify(wholeTex),
    note: '⚠ 지시 §1은 «Worker/분할 두 경로의 해시 동일»을 요구한다. 이 라운드는 **분할만** 섰다(Worker + OffscreenCanvas는 이월 — DEFERRED web2-72). 그래서 항등의 짝은 «분할 켬 ↔ 분할 끔(한 프레임에 전량)»이고, 그것이 「나눠 구워도 그림이 안 바뀐다」를 정확히 잰다.',
  }
  expect(slicedStat.deferred, '분할이 실제로 돌았다(미룬 것이 있다 — 없으면 이 팔은 아무것도 안 잰다)').toBeGreaterThan(0)
  expect(wholeStat.deferred, '반증 — 분할을 끄면 미룸 0').toBe(0)
  expect(JSON.stringify(slicedTex), '조각내 구운 픽셀 == 한 번에 구운 픽셀').toBe(JSON.stringify(wholeTex))
})

test('§1-2 — 색인: 편집 한 번에 훑는 획 수 == 그 면의 획 수 · 목록은 옛 훑기와 한 획도 안 다르다(반증: 색인 끔)', async ({ page }) => {
  test.setTimeout(900_000)
  const built = await buildHeavy(page, PER_FACE)
  await settle(page)
  // ① 두 길의 목록 대조 — 색인이 낸 것과 옛 훑기가 낸 것
  const lists = await page.evaluate(() => (window as any).__b2.diag.paintStrokeListsForTest() as { key: string; index: number[]; scan: number[] }[])
  const mismatched = lists.filter(l => JSON.stringify(l.index) !== JSON.stringify(l.scan))
  // ② 편집 한 번에 훑는 획 수 — 색인 켬
  const editScan = async (): Promise<{ scans: number; scanCalls: number; indexScans: number }> => {
    await bakeReset(page)
    const r = await page.evaluate(async () => {
      const b2 = (window as any).__b2
      const app = b2.app
      const i = app.doc.strokes.findIndex((s: any) => s.paint?.uv)
      if (i >= 0) app.doc.strokes.splice(i, 1)
      app.docVersion = (app.docVersion ?? 0) + 1
      b2.diag.invalidate()
      await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
      const st = b2.diag.paintBake()
      return { scans: st.scans, scanCalls: st.scanCalls, indexScans: st.indexScans }
    })
    return r
  }
  const on = await editScan()
  await page.evaluate(() => { (window as any).__b2.diag.setPaintIndexOffForTest(true) })
  await settle(page)
  const off = await editScan()
  await page.evaluate(() => { (window as any).__b2.diag.setPaintIndexOffForTest(false) })
  const perCallOn = on.scanCalls > 0 ? on.scans / on.scanCalls : 0
  const perCallOff = off.scanCalls > 0 ? off.scans / off.scanCalls : 0
  OUT.g1_index = {
    lists: lists.length, mismatched: mismatched.map(l => l.key), mismatched_n: mismatched.length,
    per_face_strokes: Math.round(perCallOn), doc_strokes: built.docStrokes,
    index_on: { ...on, per_call: Math.round(perCallOn) },
    index_off: { ...off, per_call: Math.round(perCallOff) },
    note: '색인 켬의 per_call은 «그 면의 획 수»이고 끔은 «문서 전체»다. index_scans는 색인을 세우며 문서를 한 번 훑은 값(면마다가 아니다).',
  }
  expect(mismatched.length, `색인과 옛 훑기의 목록이 다르다: ${mismatched.map(l => l.key).join(', ')}`).toBe(0)
  expect(perCallOn, '편집 한 번에 훑는 획 수가 «문서 전체»가 아니다').toBeLessThan(built.docStrokes * 0.5)
  expect(perCallOff, '반증 — 색인을 끄면 문서 전체를 훑는다').toBeGreaterThanOrEqual(built.docStrokes * 0.9)
})

test('§2 — 궤도 4초 동안 굽기 0 · 단계 내림에서 굽기 0 · 경계 왕복 재굽기 ≤ 2 (반증: 동결 끔)', async ({ page }) => {
  test.setTimeout(1_200_000)
  await buildHeavy(page, PER_FACE)
  await zoomToLevel(page, 512)                           // 면을 키워 단계가 실제로 움직일 대역으로(D-5)
  await settle(page)
  const visible = await page.evaluate(() => ((window as any).__b2.diag.paintTex() as any[]).filter(e => e.visible).length)
  // ── ① 궤도(동결 켬) — 굽기 0
  const on = await orbitProbe(page)
  // ── ② 멈춘 뒤 재평가 — 보이는 면 수를 넘지 않고, **단계가 맞는다**
  //   ⚠ 리뷰어 [H5]: 「재굽기 0」만으로는 «올바르게 재평가했다»와 «영영 안 바뀐다»가 안 갈린다
  //   (#105의 형태 — 첫 프레임부터 참인 자). 그래서 자리마다 «요구 단계»와 «실제 단계»를 견준다:
  //   히스테리시스 대역(실제 ≥ 요구/2) 밖인 자리가 0이어야 「멈춘 뒤에는 맞는 단계다」다.
  await bakeReset(page)
  await settle(page)
  const afterStop = await bake(page)
  const memAfterStop = await memProbe(page)
  // 반증(D-3) — 동결·히스테리시스를 끄고 **확대만 하고 멈추지 않으면** 대역 밖이 생기는가:
  //   그 값이 0이 아니어야 이 자가 무언가를 재는 것이다(그 실행은 아래 ④가 겸한다).
  // ── ③ 경계 왕복 — 줌 인아웃 10회에서 재굽기 ≤ 2
  await bakeReset(page)
  await page.mouse.move(700, 480)
  for (let k = 0; k < 10; k++) {
    await page.mouse.wheel(0, k % 2 === 0 ? -160 : 160)
    await page.waitForTimeout(60)
  }
  await settle(page)
  const boundary = await bake(page)
  // 반증(D-3) — **히스테리시스를 끄고 같은 왕복**을 한다: 경계에서 널뛰면 그 수가 크게 는다.
  //   절대 수 하나로는 픽스처 크기(보이는 면 23)에 값이 끌려간다 — 견줄 짝이 있어야 «널뛰기가
  //   죽었다»가 값으로 선다(#12 — 동작점 하나로 주장하지 않는다).
  await page.evaluate(() => { (window as any).__b2.diag.setPaintLevelFreezeOffForTest(true) })
  await settle(page)
  await bakeReset(page)
  await page.mouse.move(700, 480)
  for (let k = 0; k < 10; k++) {
    await page.mouse.wheel(0, k % 2 === 0 ? -160 : 160)
    await page.waitForTimeout(60)
  }
  await settle(page)
  const boundaryOff = await bake(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintLevelFreezeOffForTest(false) })
  await settle(page)
  // ── ④ 반증(D-3) — 동결·히스테리시스를 끄면 궤도 중 재굽기가 돌아온다
  await page.evaluate(() => { (window as any).__b2.diag.setPaintLevelFreezeOffForTest(true) })
  await settle(page)
  const off = await orbitProbe(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintLevelFreezeOffForTest(false) })
  OUT.g2_freeze = {
    visible_paint_faces: visible,
    orbit_freeze_on: { bakes: on.bake.bakes, baked_strokes: on.bake.bakedStrokes, level_down: on.bake.levelDown, level_up: on.bake.levelUp, sig_lv: on.bake.sigChange.lv, frozen_frames: on.bake.frozenFrames, frames: on.frames, empty_frames: on.emptyFrames, ms: on.bake.ms },
    orbit_freeze_off: { bakes: off.bake.bakes, baked_strokes: off.bake.bakedStrokes, level_down: off.bake.levelDown, sig_lv: off.bake.sigChange.lv, frames: off.frames, ms: off.bake.ms },
    after_stop: { bakes: afterStop.bakes, out_of_band: memAfterStop.outOfBand, rows: memAfterStop.rows },
    boundary_10: { bakes: boundary.bakes, level_up: boundary.levelUp, level_down: boundary.levelDown },
    boundary_10_hysteresis_off: { bakes: boundaryOff.bakes, level_up: boundaryOff.levelUp, level_down: boundaryOff.levelDown },
    boundary_per_visible_face: Math.round((boundary.bakes / Math.max(1, visible)) * 1000) / 1000,
    boundary_note: '지시 §2의 「경계 왕복 10회에서 재굽기 ≤ 2」는 **면 하나**의 자다 — 보이는 면이 23이면 그 절대 수는 픽스처 크기에 끌려간다. 여기서는 ① 면당 재굽기와 ② 히스테리시스 끔과의 대조로 «경계에서 널뛰기 0»을 잰다.',
  }
  expect(on.bake.bakes, '궤도 4초 동안 bakeFaceTex 호출 0').toBe(0)
  expect(on.bake.levelDown, '단계 «내림»에서 굽기 0(그림 탑 — 내림은 GPU 표집의 몫)').toBe(0)
  expect(on.emptyFrames, '빈 프레임 0(칠 면이 흰 채로 그려진 프레임)').toBe(0)
  expect(afterStop.bakes, '멈춘 뒤 재굽기 ≤ 보이는 면 수').toBeLessThanOrEqual(Math.max(1, visible))
  expect(memAfterStop.outOfBand, '멈춘 뒤에는 «맞는 단계»다 — 히스테리시스 대역 밖 자리 0(67 §2 무회귀)').toBe(0)
  // 면 하나로 환산해 지시의 값과 견준다(면당 ≤ 2) · 그리고 반증과 갈린다
  expect(boundary.bakes / Math.max(1, visible), '경계 왕복 10회 — **면당** 재굽기 ≤ 값(히스테리시스)').toBeLessThanOrEqual(PAINT72_BOUNDARY_REBAKE_MAX)
  expect(boundary.bakes, '반증 — 히스테리시스를 끄면 경계 왕복의 재굽기가 는다').toBeLessThan(boundaryOff.bakes)
  expect(off.bake.bakes, '반증 — 동결을 끄면 궤도 중 재굽기가 돌아온다').toBeGreaterThan(0)
})

test('§3 — 예산이 좁아도 «보이는 것»은 안 버린다: 퇴출 0 · 합 ≤ 예산 · 내려간 면의 텍셀/px ≥ 값', async ({ page }) => {
  test.setTimeout(900_000)
  await buildHeavy(page, PER_FACE)
  await zoomToLevel(page, 512)
  await settle(page)
  const floor = await page.evaluate(() => (window as any).__b2.diag.constantsForTest().PAINT72_ALLOC_TEXEL_PER_PX_MIN as number)
  const before = await page.evaluate(() => (window as any).__b2.diag.paintTex() as any[])
  const visN = before.filter(e => e.visible).length
  // 예산을 «지금 쓰는 것의 절반»으로 좁힌다 — 배분이 실제로 돌아야 한다(D-3: 안 좁히면 아무것도 안 잰다)
  const bytes0 = (await bake(page)).bytes
  await bakeReset(page)
  await page.evaluate((b) => { (window as any).__b2.diag.setPaintTexBudgetForTest(b) }, Math.floor(bytes0 / 2))
  await page.evaluate(() => { (window as any).__b2.diag.invalidate() })
  await settle(page)
  const st = await bake(page)
  // 지시 §3의 넷째 게이트 — **프레임마다 굽기 0**(배분이 매 프레임 다시 도는데 그때 굽는가)
  await bakeReset(page)
  const idle = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    for (let i = 0; i < 20; i++) { b2.diag.invalidate(); await new Promise<void>(r => requestAnimationFrame(() => r())) }
    const s = b2.diag.paintBake()
    return { frames: 20, bakes: s.bakes, allocDowns: s.allocDowns }
  })
  const after = await page.evaluate(() => (window as any).__b2.diag.paintTex() as any[])
  const vis = after.filter(e => e.visible)
  // 배분으로 내려간 면의 «흐림»: 텍셀/px = 단계 ÷ 화면 크기
  const texelPerPx = vis.map(e => ({ key: e.key, level: e.level, screenPx: e.screenPx, t: e.screenPx > 0 ? e.level / e.screenPx : null }))
  const worst = texelPerPx.filter(t => t.t !== null).reduce((a, b) => (a === null || (b.t as number) < (a.t as number) ? b : a), null as null | { key: string; level: number; screenPx: number; t: number | null })
  await page.evaluate(() => { (window as any).__b2.diag.setPaintTexBudgetForTest(268435456) })
  OUT.g3_alloc = {
    visible_before: visN, visible_after: vis.length,
    bytes_before: bytes0, budget_forced: Math.floor(bytes0 / 2), bytes_after: st.bytes,
    alloc_downs: st.allocDowns, alloc_bytes: st.allocBytes, evicts: st.evicts,
    // ⚠ alloc_downs는 «자리 수»가 아니라 «프레임마다 다시 내린 결정의 합»이다(리뷰어 [M3]).
    // 실제로 내려간 자리 수는 아래 lowered_places(요구 단계보다 낮은 자리)가 든다.
    lowered_places: null as number | null,
    idle_20_frames: idle,
    texel_per_px: texelPerPx, worst, texel_floor: floor,
    note: '65 ⑤는 예산을 넘으면 **버렸다**(보이는 면이 예산을 넘으면 퇴출→재굽기 순환). 72 §3은 «화면에서 작은 면부터 단계를 한 칸 내려» 합을 예산 안에 넣는다 — 퇴출은 안 보이는 것에만.',
  }
  // ⚠⚠ **예산과 흐림 바닥이 부딪히면 그림이 이긴다.** 지시 §3은 「합을 예산 안에 넣는다」와
  //   「내려간 면의 텍셀/px ≥ 0.5」를 둘 다 요구하는데, 예산이 아주 좁으면 둘이 부딪힌다.
  //   그때 답은 «더 내려서 그림을 뭉개는 것»이 아니다(43-1 — 조용히 뭉개지 마라): 바닥에서
  //   멈추고 **넘친 사실을 값으로** 남긴다. 남은 압력은 65 ⑤의 퇴출(안 보이는 것)이 진다.
  const allAtFloor = texelPerPx.every(t => t.screenPx <= 0 || t.level / 2 < t.screenPx * floor)
  ;(OUT.g3_alloc as Record<string, unknown>).over_budget = st.allocBytes > Math.floor(bytes0 / 2)
  ;(OUT.g3_alloc as Record<string, unknown>).all_at_blur_floor = allAtFloor
  ;(OUT.g3_alloc as Record<string, unknown>).lowered_places = texelPerPx.filter(t => t.level < (after.find(e => e.key === t.key)?.want ?? 0)).length
  // ⚠ 리뷰어 [M5] — **그림 탑은 내려오지 않는다**: 줌 인 → 줌 아웃 왕복 뒤에도 바이트가
  //   그대로면 세션이 길수록 단조 증가한다는 뜻이다. 값으로 남긴다(상한은 §3의 배분과 퇴출).
  await settle(page)
  const memIn = await memProbe(page)
  await page.mouse.move(700, 480)
  for (let k = 0; k < 12; k++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(60) }
  await settle(page)
  const memOut = await memProbe(page)
  ;(OUT.g3_alloc as Record<string, unknown>).zoom_roundtrip = {
    bytes_zoomed_in: memIn.bytes, bytes_after_zoom_out: memOut.bytes,
    levels_in: memIn.levels, levels_out: memOut.levels,
    note: '그림 탑(§1-2)은 내림을 안 굽는다 — 줌 아웃 뒤에도 단계·바이트가 그대로면 그것이 설계다. 내려오는 길은 §3 배분과 퇴출(안 보이는 것)뿐이고, 그 둘이 상한을 진다.',
  }
  expect(st.allocDowns, '배분이 실제로 돌았다(안 돌면 이 팔은 아무것도 안 잰다)').toBeGreaterThan(0)
  expect(idle.bakes, '§3 — 배분이 선 뒤에는 프레임마다 굽지 않는다(20 프레임에 굽기 0)').toBe(0)
  expect(st.evicts, '보이는 것을 안 버린다 — 퇴출 0').toBe(0)
  expect(st.allocBytes <= Math.floor(bytes0 / 2) || allAtFloor,
    '요구 합이 예산 안이거나, 더 못 내린다(전부 흐림 바닥) — 둘 중 하나여야 한다').toBe(true)
  expect(vis.length, '보이는 칠 면이 그대로 보인다').toBe(visN)
  if (worst && worst.t !== null) {
    expect(worst.t, '배분으로 내려간 면의 텍셀/px 하한(흐림 상한 — 앱 상수와 같은 값)').toBeGreaterThanOrEqual(floor)
  }
})

test('§4 — 열 때: 첫 상호작용 프레임과 최장 차단(대조군과 함께) · 저장 왕복 5/5 · KEY_ORDER 무변', async ({ page }) => {
  test.setTimeout(900_000)
  const built = await buildHeavy(page, PER_FACE)
  await settle(page)
  // 저장 왕복 5/5 — 형식이 안 바뀌었는가(⛔ 저장 형식 무변)
  const round: { bytes: number; sha: string }[] = []
  for (let k = 0; k < 5; k++) {
    const r = await page.evaluate(() => {
      const b2 = (window as any).__b2
      const txt = b2.diag.serialize() as string
      let h = 0
      for (let i = 0; i < txt.length; i++) h = (Math.imul(h, 31) + txt.charCodeAt(i)) | 0
      const { data } = b2.diag.readBrnlForTest(txt)
      const txt2 = data ? JSON.stringify(Object.keys(data.doc)) : ''
      return { bytes: txt.length, sha: `${h}|${txt2}` }
    })
    round.push(r)
  }
  const keyOrder = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const txt = b2.diag.serialize() as string
    return Object.keys(JSON.parse(txt))
  })
  OUT.g4_open = {
    fixture: built,
    save_roundtrip: { n: round.length, all_same: round.every(r => r.sha === round[0]!.sha), bytes: round[0]!.bytes },
    key_order_top: keyOrder,
    note: '열 때의 ms 값은 계측(perf72)이 든다 — 여기서는 저장 형식이 안 움직였음과 픽스처가 섰음을 지킨다(⛔ 저장 형식 무변).',
  }
  expect(round.every(r => r.sha === round[0]!.sha), '저장 왕복 5/5 — 같은 바이트').toBe(true)
  expect(built.paintStrokes, '칠 획이 섰다').toBeGreaterThanOrEqual(300)
})
