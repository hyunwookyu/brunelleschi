// web2-72 §0 — **부하 계측**: 「돌릴 때」와 「열 때」.
//
// ⚠⚠ **전/후를 같은 트리에서 낸다**(리뷰어 [H3]). 첫 판은 옛 트리(PRE72=1)와 새 트리의 실행을
//   나란히 놨는데 ① 궤도가 `각속도 × dt`라 느린 트리가 두 배 돌았고(354° vs 182°)
//   ② 「칠 전부 보이기」의 자를 그 사이에 고쳤다(#105) — 조건이 둘 갈렸다.
//   지금은 **반증 스위치 셋**(동결 끔 · 분할 끔 · 색인 끔)이 «수리 전의 거동»을 같은 실행 안에
//   세운다: 같은 픽스처·같은 프로브·같은 기계다. 옛 트리 원장(`perf72_pre_*`)은 «동결 기록»으로
//   남기고 표제 배수는 여기서 낸다.
//   그리고 **칠을 걷어낸 대조군**이 기계 몫의 눈금이다(A·B 둘 다 — B에만 있던 것을 A에도).
//
//   A 돌릴 때   고정 걸음 × 고정 각(60걸음 × 1.5° = 90°) — 프레임 p50·p95·최대 · fps ·
//               **메인 최장 차단** · bakeFaceTex 호출 · 굽힌 획 · 퇴출 · 열쇠 갈림(조각별)
//   B 열 때     새로고침 → 첫 상호작용 프레임(ms) · 칠 전부 보이기(ms) · 메인 최장 차단
//   C 메모리    바이트 · 예산 · 보이는 (면,쪽) · **자리마다 «요구 단계»와 «실제 단계»**
//
// 가설 넷(지시 §0)의 판정은 **`legacy` 팔**이 낸다(그것이 «수리 전»이다).
//
// 픽스처: 사람 문서(`e2e/fixtures/heavy-paint-01.brnl`)가 있으면 **그것이 정본**이고, 없으면 합성한다.
// ⚠ 계측 스펙이다(MEASURE_SPECS — stage0/out에 쓴다). 게이트는 `gates72.spec.ts`다.
//   LEDGER=1 node tools/e2e.mjs ledger e2e/perf72.spec.ts --project=dpr1
//   LEDGER=1 node tools/e2e.mjs ledger e2e/perf72.spec.ts --project=dpr2

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  buildHeavy, orbitProbe, openProbe, memProbe, zoomToLevel, setLegacy, stripPaint,
  settleBake, settleStat, snapshotCamera, restoreCamera, HUMAN_FIXTURE, type Heavy,
} from './heavy72'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-72 §0 — 부하 계측(A 돌릴 때 · B 열 때 · C 메모리)과 가설 넷. 전/후는 **같은 실행 안의 두 팔**이다(legacy = 반증 스위치 셋 켬 = 수리 전 거동 · post = 셋 다 끔). bare = 칠을 걷어낸 대조군(기계 몫).',
  note_pitfalls: '#12·#14(동작점 하나·ms로 주장하지 않는다 — 정본은 «호출 수·훑은 획 수» · 두 dpr) · #16(분모 — 궤도는 «같은 걸음·같은 각»이고 훑기는 «호출당»이다) · #47(수치는 원장이 정본) · #89(초록의 범위 — 굽기가 끝난 뒤에 잰다) · #99(워커 1) · #101(web2 안) · #103(장면 확인) · #105(«보이는 것»으로 자를 잡지 않는다) · #110 · #111',
  pitfall_citations: [12, 14, 16, 42, 47, 89, 99, 101, 103, 105, 110, 111],
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(lens31·paint50의 no_constants_snapshot이 정본)' },
  selfcheck_notes: {
    zero_counters: 'post 팔의 bakes 0 · levelDown 0 · evicts 0은 §1·§2·§3의 통과값이다 — **같은 실행의 legacy 팔**이 0이 아닌 값을 낸다(짝이 한 원장 안에 있다). h2의 evicts 0은 관측이고 그것이 가설 2의 반증이다(AS-C210)',
    single_category: 'levels가 한 값인 것은 픽스처의 구성이다(격자 칸이 화면에서 비슷한 크기) — 단계의 변별은 **목표 단계까지 확대한** zoom 팔이 든다(D-5). rows에 자리마다 «요구 단계»가 있어 단일 범주가 «못 잰 것»인지 «맞는 것»인지 갈린다',
  },
}
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/perf72_web2_dpr${p === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/perf72.spec.ts (워커 1 — #99)',
      viewport: 'playwright 기본(1200×800) · dpr는 project가 정한다 — 지시의 「ipad 꼴」은 dpr2가 그 자리다',
      machine: '헤드리스 크로뮴 · 소프트웨어 GL(swiftshader) — **절대 ms는 실기기와 다르다**. 정본은 호출 수·훑은 획 수이고 ms는 팔 사이의 배수로만 읽는다(#12·#14). bare 팔이 그 기계 몫의 눈금이다',
      human_fixture: existsSync(resolve(HERE, HUMAN_FIXTURE)) ? HUMAN_FIXTURE : null,
      // ⚠ 0이 아니면 그 실행의 어느 값은 «다 구워진 상태»가 아니다(#105 — 조용한 폴백 ⛔)
      settle_timeouts: settleStat.timeouts, settle_last_stage: settleStat.lastStage, settle_rows: settleStat.rows },
    ...OUT,
  }, null, 2))
})

test('§0 A·C — 돌릴 때와 메모리(legacy ↔ post ↔ bare · 같은 각·같은 걸음)', async ({ page }) => {
  test.setTimeout(1_800_000)
  const built: Heavy = await buildHeavy(page)
  expect(built.faces, '면이 섰다(#103)').toBeGreaterThanOrEqual(16)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(600)
  OUT.fixture = built

  // ── post(수리 후) — 목표 단계까지 확대하고, **그 카메라를 떠 둔다**(세 팔의 출발점) ────────
  const zPost = await zoomToLevel(page, 512)
  const cam = await snapshotCamera(page)
  const cPost = await memProbe(page)
  const aPost = await orbitProbe(page)
  // 멈춘 뒤 재평가(§2 · 67 §2 무회귀) — 카메라를 되돌려 «보이는 자리»에서 잰다: 대역 밖 0이어야 한다
  await restoreCamera(page, cam)
  const cPostAfterStop = await memProbe(page)
  // 줌 인 → 줌 아웃 왕복 뒤 바이트(리뷰어 [M5] — 그림 탑이 단조 증가하는가)
  await page.mouse.move(700, 480)
  for (let k = 0; k < zPost.steps + 4; k++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(60) }
  await settleBake(page, 400, 'A/zoom-out')
  const cPostZoomOut = await memProbe(page)
  await restoreCamera(page, cam)

  // ── legacy(반증 스위치 셋 = 수리 전 거동) — **같은 픽스처·같은 카메라·같은 몸짓** ────────
  //   ⚠⚠ 여기서 **다시 확대하지 않는다**(리뷰어 [H4]의 그 형태): 팔마다 zoomToLevel을 부르면
  //   legacy가 목표 단계에 못 닿아 ×10.9까지 확대해 면을 화면 밖으로 밀어낸다(보이는 칠 면 0).
  await setLegacy(page, true)
  const cLegacy = await memProbe(page)
  const aLegacy = await orbitProbe(page)
  await setLegacy(page, false)
  await settleBake(page, 400, 'A/legacy-off')
  await restoreCamera(page, cam)

  // ── bare(칠을 걷어낸 대조군) — **같은 카메라**에서. 남은 프레임 시간이 기계 몫인지 가른다 ──
  const stripped = await stripPaint(page)
  const aBare = await orbitProbe(page)

  OUT.A_orbit = { post: aPost, legacy: aLegacy, bare: aBare }
  OUT.A_zoom = { post: zPost, stripped_paint_strokes: stripped, note: '세 팔은 **같은 카메라**에서 출발한다(값으로 떠 두고 값으로 되돌린다) — 휠로 되돌리면 걸음이 안 맞아 다른 자리에 선다' }
  OUT.C_memory = { post: cPost, post_after_stop: cPostAfterStop, post_zoom_out: cPostZoomOut, legacy: cLegacy }
  OUT.A_ratios = {
    note: '**같은 몸짓**(가운데 단추 끌기 120걸음 × 6px = 720px)·**같은 카메라**를 도는 데 든 것의 비. ⚠ legacy 팔은 시간 상한에 닿아 걸음을 다 못 돈다 — 그 사실이 값이다(steps·pxDragged·totalDeg를 나란히 둔다). p50은 legacy가 **양극단**이라(대부분 프레임은 빠르고 몇 프레임이 분 단위) 뒤집혀 보일 수 있다 — 사람이 느끼는 자는 **p95·최악·fps**다. ms는 이 기계의 값이고 배수만 읽는다(#12·#14)',
    steps: `${aLegacy.steps} → ${aPost.steps}`,
    px_dragged: `${aLegacy.pxDragged} → ${aPost.pxDragged}`,
    total_deg: `${aLegacy.totalDeg} → ${aPost.totalDeg}`,
    frame_p95: r2(aLegacy.frames.p95 / Math.max(1e-9, aPost.frames.p95)),
    longest_block: r2(aLegacy.longestBlockMs / Math.max(1e-9, aPost.longestBlockMs)),
    frame_p50: r2(aLegacy.frames.p50 / Math.max(1e-9, aPost.frames.p50)),
    frame_max: r2(aLegacy.frames.max / Math.max(1e-9, aPost.frames.max)),
    duration: r2(aLegacy.durationMs / Math.max(1e-9, aPost.durationMs)),
    fps: r2(aPost.fps / Math.max(1e-9, aLegacy.fps)),
    bakes: `${aLegacy.bake.bakes} → ${aPost.bake.bakes}`,
    baked_strokes: `${aLegacy.bake.bakedStrokes} → ${aPost.bake.bakedStrokes}`,
    level_down: `${aLegacy.bake.levelDown} → ${aPost.bake.levelDown}`,
    bake_ms: `${Math.round(aLegacy.bake.ms)} → ${Math.round(aPost.bake.ms)}`,
    bare_frame_p50: aBare.frames.p50,
    bare_frame_p95: aBare.frames.p95,
    bare_longest_block_ms: aBare.longestBlockMs,
  }
  // ── 지시 §1·§2의 게이트 문면을 **값으로** 적는다(통과/미달까지 · 리뷰어 [H6]) ──────────
  OUT.A_gate_lines = {
    '§1 궤도 중 메인 최장 차단 ≤ 8ms': { post: aPost.longestBlockMs, bare: aBare.longestBlockMs, legacy: aLegacy.longestBlockMs, pass: aPost.longestBlockMs <= 8 },
    '§1 프레임 p95 ≤ 16.7ms(60Hz)': { post: aPost.frames.p95, bare: aBare.frames.p95, legacy: aLegacy.frames.p95, pass: aPost.frames.p95 <= 16.7 },
    '§1 빈 프레임 0': { post: aPost.emptyFrames, pass: aPost.emptyFrames === 0 },
    '§2 궤도 중 bakeFaceTex 호출 0': { post: aPost.bake.bakes, legacy: aLegacy.bake.bakes, pass: aPost.bake.bakes === 0 },
    '§2 멈춘 뒤에는 맞는 단계다(대역 밖 0)': { post: cPostAfterStop.outOfBand, pass: cPostAfterStop.outOfBand === 0 },
    note: '⚠ ms 두 줄은 **이 기계에서 도달 불가능**하다 — 칠을 거의 걷어낸 bare 팔도 상한 밖이다(그 값이 옆에 있다). 도달 가능한 자(호출 수·빈 프레임·대역)는 통과한다.',
  }
  expect(aPost.steps, '궤도 걸음이 다 돌았다').toBeGreaterThan(30)
  expect(aLegacy.steps, 'legacy 팔도 같은 걸음을 돌았다').toBeGreaterThan(30)
})

test('§0 B — 열 때(post ↔ bare · 편집 한 번의 훑기)', async ({ page }) => {
  test.setTimeout(1_800_000)
  const built: Heavy = await buildHeavy(page)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(600)
  const B = await openProbe(page)
  OUT.B_open = B
  OUT.B_attribution = {
    note: '「칠 전부 보이기」가 어디로 가는가 — 굽기 CPU의 몫과 나머지(프레임 예산의 선택)를 가른다(리뷰어 [M1])',
    bake_ms_on_open: B.bakeMsOnOpen,
    all_paint_ms: B.allPaintMs,
    bake_share: r2(B.bakeMsOnOpen / Math.max(1, B.allPaintMs)),
    rest_ms: B.allPaintMs - B.bakeMsOnOpen,
    rest_is: '굽기 CPU가 아니라 «쉬는 중 예산(PAINT72_BAKE_MS_IDLE)과 프레임 하나의 고정 비용»이다 — Worker·캐시 없이도 예산 하나로 줄어들 수 있는 몫',
  }
  OUT.B_gate_lines = {
    '§4 첫 상호작용 프레임 ≤ 1000ms': { post: B.firstInteractiveMs, bare: B.bareFirstInteractiveMs, pass: B.firstInteractiveMs <= 1000 },
    '§4 메인 최장 차단 ≤ 50ms': { post: B.longestBlockMs, bare: B.bareLongestBlockMs, pass: B.longestBlockMs <= 50 },
    '§4 칠 전부 ≤ 5000ms(캐시 없음)': { post: B.allPaintMs, bake_cpu: B.bakeMsOnOpen, pass: B.allPaintMs <= 5000 },
    note: '⚠ 세 줄 다 이 기계에서 미달이고, bare 팔(칠을 거의 걷어낸 문서)이 그 중 얼마가 기계 몫인지 말한다. 캐시는 이월(§4 둘째)이다.',
  }
  expect(B.firstInteractiveMs, '열기 측정이 값을 냈다').toBeGreaterThan(0)
})

const r2 = (v: number): number => Math.round(v * 100) / 100
