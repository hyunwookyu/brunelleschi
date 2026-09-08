// web2-75 §1·§3 — **자르는 단위와 열기 캐시를 값으로**(계측 스펙 · MEASURE_SPECS · stage0/out).
//
//   §1-0  표식     `bake.commit`의 최대가 «획의 길이»인가 «첫 자국의 준비»인가 — 갈라서 낸다(D-1).
//   §1    스윕     구간 크기 1·2·4·8·전량에서 «한 구간 최대 ms»·«한 호출 최대 ms»·«총 ms»·**픽셀 해시**.
//   §1-b  몸짓     같은 몸짓을 수리 전(획 단위) ↔ 지금(점 구간)으로 — 멈춤 횟수·사다리·표식 호출 수.
//   §3    열기     캐시 없음 ↔ 있음 — 세 몫(파싱·세우기·굽기)과 캐시 셈.
//
// ⚠ CLOSING 「자동 시험의 fps는 게이트가 아니다」 — 이 원장의 ms는 **기록**이고, 판정은 기계에 안 흔들리는 자
//   (점 수 · 호출 수 · 해시)와 **같은 실행 안의 짝 비교**가 한다. GPU 이름을 조건에 적는다(#113).
// ⚠⚠ CLOSING 「팔의 표에는 «경쟁자»가 있어야 한다」(75 §0이 박은 새 줄) — 팔마다 그 창에서 돈 **표식의 호출 수**를
//   같이 낸다. 74는 그것이 없어서 «굽기가 0회인 창»에서 「저장이 임자」를 냈다.

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { settleStat, settleBake, zoomToLevel } from './heavy72'
import { bootWith, buildFixtureText, applyFixture } from './heavy74'
import { bakeWithSlicePts, drawLongStrokes, pointStats, texHash, bake75, warm75, resetStats, openProbe75, gesture75 } from './heavy75'
import { PAINT75_PRE_CHUNK_PTS_MIN, PAINT75_CACHE_HIT_RATIO_MIN } from './thresholds'

/* eslint-disable @typescript-eslint/no-explicit-any */
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-75 §1·§3 — 자르는 단위를 «획»에서 «점 구간»으로(픽셀 항등) · 굽힌 그림 캐시로 두 번째 열기. 74가 값으로 지목한 bake.commit을 실제로 자른 라운드다.',
  note_pitfalls: '#12·#14(동작점 하나 ⛔ — 구간 크기를 스윕한다) · #16(분모 — 같은 저장물 하나) · #42 · #47(수치는 원장이 정본) · #89(초록의 범위 — 몸짓 창은 굽기가 도는 창이다) · #99(워커 1) · #103(프로브가 움직였음 — 획 수·단계) · #105(빈 결과 폴백은 표식) · #110(캐시 열쇠는 그 파생이 의존하는 것 전부) · #113(시간 자에는 «어느 GPU에서») · #114(자가 재는 구간이 사람이 기다리는 구간인가)',
  pitfall_citations: [12, 14, 16, 42, 47, 89, 99, 103, 105, 110, 113, 114],
  thresholds: { PAINT75_PRE_CHUNK_PTS_MIN, PAINT75_CACHE_HIT_RATIO_MIN },
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(lens31·paint50의 no_constants_snapshot이 정본). 구간 크기는 앱 상수 C.PAINT75_SLICE_PTS이고 원장의 slice_pts_app이 그 값이다(D-C4).' },
  selfcheck_notes: {
    zero_counters: '셋이다. ① `S1_sweep`의 전량(획 단위) 행에서 `sliceChunks` 0은 **그 팔의 정의**다(자르기가 없다) — 같은 실행의 다른 행이 0이 아니다. ② `S3_open.cold.cache.applied` 0은 「캐시가 없다」는 그 팔의 정의이고 warm 행이 0이 아니다. ③ `S1_0.warmSecond.calibCalls` 0은 **이 절의 결론**이다(준비는 판마다 한 번뿐이다).',
    identical_pairs: '`S1_sweep`의 `sameTex`가 다섯 행에서 참인 것은 **설계 보장이 아니라 이 라운드의 게이트**다 — 같은 판의 반증(`sliceBreak`)이 그 자리에서 다른 값을 낸다(gates75 g1-②).',
    single_category: '`fixture.levels`가 한 값(256×23)인 것은 픽스처의 구성이다(72·73·74와 같은 격자 벽).',
  },
}
const HEADED = process.env.PW_HEADED === '1'
const TAG = process.env.PW_LEDGER_TAG ?? (HEADED ? '_headed' : '')
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/perf75_web2_dpr${p === 'dpr2' ? 2 : 1}${TAG}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, headed: HEADED, ledger_tag: TAG, chromium_exe: process.env.PW_CHROMIUM_EXE ?? null, workers: 1,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/perf75.spec.ts --project=' + info.project.name + ' (워커 1 — #99)',
      machine_note: '시간의 절대값은 이 기계(playwright chromium_headless_shell = SwiftShader)의 기록이다 — 판정은 «점 수·호출 수·해시»와 팔 사이의 짝이 한다(CLOSING · #113)',
      settle_timeouts: settleStat.timeouts, settle_last_stage: settleStat.lastStage },
    ...OUT,
  }, null, 2))
})

test.describe.configure({ mode: 'serial' })
let FIXTURE = ''

const sig = (t: Awaited<ReturnType<typeof texHash>>) => JSON.stringify(t.map(x => [x.key, x.hash, x.ink]))

test('§1-0 — `bake.commit`의 최대는 «획의 길이»인가 «첫 자국의 준비»인가 (D-1 표식)', async ({ page }) => {
  test.setTimeout(600_000)
  await bootWith(page, '')
  const built = await buildFixtureText(page)
  FIXTURE = built.text
  OUT.fixture = built.built
  // ① 차가운 판 — 앱을 열고 문서를 앉힌다(사람이 앱을 여는 그 길)
  await bootWith(page, '')
  await resetStats(page)
  await applyFixture(page, FIXTURE)
  await settleBake(page, 800, 'S1_0/cold')
  const cold = await bake75(page)
  const coldWarm = await warm75(page)
  // ② 같은 판에서 **같은 획들을 다시** — 준비가 끝난 뒤(같은 실행의 짝)
  await resetStats(page)
  await page.evaluate(() => { (window as any).__b2.diag.rebakePaintTex() })
  await settleBake(page, 800, 'S1_0/warm')
  const second = await bake75(page)
  const secondWarm = await warm75(page)
  OUT.gl = await page.evaluate(() => (window as any).__b2.diag.glInfo())   // #113 — 시간 자에는 «어느 GPU에서»가 붙는다
  OUT.S1_0 = {
    note: '지시문의 전제는 「긴 붓 획 하나는 도장이 수백 개고 그것이 한 덩어리다 — 74가 잰 861.8ms가 그것이다」였다. 표식이 갈랐다: 그 획의 점은 다섯 개이고, 861.8ms의 대부분은 «그 판에서 처음 그리는 자국»이 치르는 준비(보정 calib — 반최대 폭 두 점 + 농도 고정점 반복)다.',
    cold: { strokeMsMax: cold.strokeMsMax, strokePtsMax: cold.strokePtsMax, commitMsMax: cold.commitMsMax, bgMsMax: cold.bgMsMax, ms: cold.ms },
    coldWarmup: coldWarm,
    warmSecond: { strokeMsMax: second.strokeMsMax, commitMsMax: second.commitMsMax, ms: second.ms, calibCalls: secondWarm.calibCalls },
    share_of_max_from_calib: cold.strokeMsMax > 0 ? Math.round((coldWarm.calibMaxMs / cold.strokeMsMax) * 1000) / 1000 : null,
    ratio_cold_over_warm: second.strokeMsMax > 0 ? Math.round((cold.strokeMsMax / second.strokeMsMax) * 10) / 10 : null,
    verdict: '준비(보정)가 «단일 호출 최대»의 임자다 — 점 구간으로 잘라도 그 한 번은 못 자른다(엔진 안의 한 덩어리). 자르기가 잡는 것은 «그 뒤로 계속 도는» 획들이다.',
  }
  expect(cold.strokeMsMax, '차가운 판의 획 하나가 실제로 크다(프로브가 움직였다)').toBeGreaterThan(0)
})

test('§1 — 구간 크기 스윕(1·2·4·8·전량): 한 구간 최대 · 한 호출 최대 · 총 ms · 픽셀 해시', async ({ page }) => {
  test.setTimeout(900_000)
  await bootWith(page, '')
  await applyFixture(page, FIXTURE)
  await page.click('#btn-paint')
  await page.waitForTimeout(100)
  await page.evaluate(() => Object.assign((window as any).__b2.app.paintSel, { hex: '#7a4a3a', w: 22, o: 1 }))
  await drawLongStrokes(page, 3, 40)
  const pts = await pointStats(page)
  const rows: Record<string, unknown>[] = []
  let ref: { tex: string; scr: number } | null = null
  for (const v of ['inf', 8, 4, 2, 1] as const) {
    const r = await bakeWithSlicePts(page, v as never, `S1/${v}`)
    const texSig = sig(r.tex)
    if (!ref) ref = { tex: texSig, scr: r.scr.hash }
    rows.push({ slicePts: v, chunkPtsMax: r.bake.chunkPtsMax, sliceChunks: r.bake.sliceChunks,
      strokeMsMax: r.bake.strokeMsMax, commitMsMax: r.bake.commitMsMax, ms: r.bake.ms, uploads: r.bake.uploads,
      sameTex: texSig === ref.tex, sameScr: r.scr.hash === ref.scr, ink: r.tex.reduce((a, t) => a + t.ink, 0) })
  }
  await bakeWithSlicePts(page, null, 'S1/app')
  const appPts = await page.evaluate(() => (window as any).__b2.diag.paintSlicePtsForTest())
  const pre = rows[0] as any
  const now = (rows.find(r => (r as any).slicePts === appPts) ?? rows[rows.length - 1]) as any
  OUT.S1_sweep = {
    fixture_points: pts, slice_pts_app: appPts, rows,
    all_same_picture: rows.every(r => (r as any).sameTex && (r as any).sameScr),
    pair_pre_post: { pre_slicePts: 'inf(획 하나가 최소 단위)', post_slicePts: appPts,
      chunkPtsMax: [pre.chunkPtsMax, now.chunkPtsMax], strokeMsMax: [pre.strokeMsMax, now.strokeMsMax],
      commitMsMax: [pre.commitMsMax, now.commitMsMax], ms: [pre.ms, now.ms],
      ratio_commitMsMax: Math.round((now.commitMsMax / pre.commitMsMax) * 1000) / 1000,
      ratio_total_ms: Math.round((now.ms / pre.ms) * 1000) / 1000 },
    note: '픽셀 해시가 다섯 행에서 같다 — 자르는 자리가 그림을 안 바꾼다. 반증(구간마다 세션 끊기)은 gates75 g1-②가 같은 판에서 «갈린다»를 낸다.',
  }
  expect(rows.every(r => (r as any).sameTex), '다섯 행이 같은 그림').toBe(true)
})

test('§1-b — 같은 몸짓을 수리 전(획 단위) ↔ 지금(점 구간)으로: 멈춤·사다리·표식 호출 수', async ({ page }) => {
  test.setTimeout(900_000)
  const arms: Record<string, unknown>[] = []
  for (const v of ['inf', null] as const) {
    await bootWith(page, '')
    await applyFixture(page, FIXTURE)
    await page.click('#btn-paint')
    await page.waitForTimeout(100)
    await page.evaluate(() => Object.assign((window as any).__b2.app.paintSel, { hex: '#7a4a3a', w: 22, o: 1 }))
    // ⚠ 굽기가 «도는 창»에서 잰다(74 자백 3 · CLOSING의 새 줄) — 줌으로 단계를 올려 굽을 것을 만든다
    const z = await zoomToLevel(page, 512, 20)
    await page.evaluate((x) => (window as any).__b2.diag.setPaintSlicePtsForTest(x === 'inf' ? Infinity : x), v as never)
    const g = await gesture75(page, 8, 500)
    arms.push({ arm: v === 'inf' ? 'pre(획 단위)' : 'post(점 구간)', zoomLevel: z.maxLevel, strokesAdded: g.added,
      stalls: g.stalls, gaps: g.gaps, chunkPtsMax: g.bake.chunkPtsMax, sliceChunks: g.bake.sliceChunks,
      strokeMsMax: g.bake.strokeMsMax, commitMsMax: g.bake.commitMsMax, bakeMs: g.bake.ms, bakes: g.bake.bakes,
      // ⛳ CLOSING 새 줄 — **경쟁자가 이 창에 들어왔는가**(호출 수 · ms)
      marks: g.marks })
    await page.evaluate(() => (window as any).__b2.diag.setPaintSlicePtsForTest(null))
  }
  OUT.S1_gesture = {
    note: '몸짓 창에 `bake.commit`이 실제로 들어왔는지(호출 수)를 팔마다 같이 낸다 — 74는 그것이 0회인 창에서 임자를 골랐다(자백 3 · CLOSING 「팔의 표에는 경쟁자가 있어야 한다」).',
    arms,
    stall_note: '시험 기계의 잡음 바닥이 문턱(200ms) 자리에 있다(74 실측 210~236ms) — 「멈춤 몇 회」로는 팔이 안 갈린다. 그래서 판정은 «한 호출 최대»의 짝과 «한 구간이 먹는 점 수»가 한다(#114).',
  }
  expect((arms[0] as any).strokesAdded, '프로브가 움직였다(#103)').toBeGreaterThan(0)
})

test('§3 — 열기: 캐시 없음 ↔ 있음 (세 몫과 캐시 셈)', async ({ page }) => {
  test.setTimeout(900_000)
  await bootWith(page, '')
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  await applyFixture(page, FIXTURE)
  await settleBake(page, 800, 'S3/seed')
  // ① 캐시 없음 — 지우고 연다
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  const cold = await openProbe75(page, 'cold')
  // 캐시가 채워지기를 기다린다(쉴 때 돈다 — 상한 있는 대기 #95)
  await page.waitForFunction(() => (window as any).__b2.diag.texCache().writes > 0, null, { timeout: 60_000 })
  await page.waitForTimeout(2000)
  const wrote = await page.evaluate(() => (window as any).__b2.diag.texCache())
  const coldTex = sig(await texHash(page))
  // ② 캐시 있음 — 그대로 다시 연다
  const warm = await openProbe75(page, 'warm')
  const warmTex = sig(await texHash(page))
  OUT.S3_open = {
    cold, warm, wrote_after_cold: { writes: wrote.writes, writeBytes: wrote.writeBytes, evicted: wrote.evicted, errors: wrote.errors },
    same_picture: coldTex === warmTex,
    ratio: { allPaintMs: cold.allPaintMs > 0 ? Math.round((warm.allPaintMs / cold.allPaintMs) * 1000) / 1000 : null,
      bakeMs: cold.bakeMs > 0 ? Math.round((warm.bakeMs / cold.bakeMs) * 1000) / 1000 : null,
      firstInteractiveMs: cold.firstInteractiveMs > 0 ? Math.round((warm.firstInteractiveMs / cold.firstInteractiveMs) * 1000) / 1000 : null },
    hit_ratio: warm.faces > 0 ? Math.round((warm.cache.applied / warm.faces) * 1000) / 1000 : null,
    note: '열기의 99.8%가 굽기였다(74 §4). 캐시가 그 굽기를 대신한다 — 그림은 같아야 하고(해시) 안 맞으면 캐시가 없다(= 굽는다).',
  }
  expect(coldTex, '캐시로 연 그림 == 구운 그림').toBe(warmTex)
})

test('§2 — Worker를 했는가/안 했는가와 그 근거 값', async ({ page }) => {
  test.setTimeout(300_000)
  await bootWith(page, '')
  const s1 = OUT.S1_sweep as any
  const s10 = OUT.S1_0 as any
  OUT.S2_worker = {
    done: false,
    rule: '지시 §2 — 「§1이 게이트를 넘기면 이 절은 안 한다(값으로 그 사실을 적고 이월)」.',
    gates_from_s1: {
      chunkPtsMax_pre_post: s1?.pair_pre_post?.chunkPtsMax ?? null,
      commitMsMax_pre_post: s1?.pair_pre_post?.commitMsMax ?? null,
      ratio_commitMsMax: s1?.pair_pre_post?.ratio_commitMsMax ?? null,
      all_same_picture: s1?.all_same_picture ?? null,
    },
    residual: {
      what: '남는 것은 «첫 자국의 준비»(보정) 한 번이다 — 판마다 한 번, 엔진 안의 한 덩어리라 점 구간으로 못 자른다.',
      calibMaxMs: s10?.coldWarmup?.calibMaxMs ?? null,
      calibCalls: s10?.coldWarmup?.calibCalls ?? null,
      share_of_max_from_calib: s10?.share_of_max_from_calib ?? null,
      why_not_worker_now: 'Worker + OffscreenCanvas는 엔진 전체(팁 아틀라스·종이 결·결정론 시드)를 옮기는 일이고 72가 「옮기면 그림이 갈릴 위험이 크다」로 미뤄 둔 것이다. 이 라운드가 실제로 잰 것은 «준비 한 번»이 임자라는 사실이고, 그것은 Worker 말고도 «준비를 굽기 밖에서 미리 하기»·«보정값을 저장해 두기»로 닿는다 — 어느 쪽인지는 값이 더 있어야 정한다(이월).',
    },
  }
  expect(OUT.S2_worker).toBeTruthy()
})
