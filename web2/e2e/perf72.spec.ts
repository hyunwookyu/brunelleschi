// web2-72 §0 — **부하 계측**: 「돌릴 때」와 「열 때」. 수리 «전» 판은 `PRE72=1`로 동결한다.
//
//   A 돌릴 때   한 손가락 궤도 4초(등속) — 프레임 시간 p50·p95·최대 · bakeFaceTex 호출 수 ·
//               굽힌 획 수 · LRU 퇴출 수 · **열쇠가 갈린 원인별 수**(가설 1의 판별자)
//   B 열 때     새로고침 → 첫 상호작용 가능 프레임(ms) · 칠 전부 보이기(ms) · 메인 최장 차단(ms)
//   C 메모리    칠 텍스처 바이트 · 예산 · 보이는 (면,쪽) 수 · 예산 초과 여부
//
// 가설 넷(지시 §0)을 값으로 실증/반증한다:
//   1. bakeSig에 lv가 들어 있어 궤도 중 2^n 경계를 넘을 때마다 그 면을 전량 재굽기
//      → 자: `sigChange.lv` · `levelDown` · 궤도 중 `bakes`·`bakedStrokes`
//   2. LRU 예산이 좁아 보이는 면이 예산을 넘으면 매 프레임 퇴출→재굽기 순환
//      → 자: 궤도 중 `evicts` · `bytes/budget` · 보이는 (면,쪽) 수
//   3. 열 때 보이는 면 전부를 첫 프레임에 «동기»로 굽는다
//      → 자: 첫 프레임의 메인 최장 차단(ms) · 그 동안의 `bakes`
//   4. paintStrokesOf가 «문서의 획 전부»를 면마다 훑는다
//      → 자: `scans`(훑은 획 수) ÷ `scanCalls` == 문서 획 수이면 실증
//
// 픽스처: 사람 문서(`e2e/fixtures/heavy-paint-01.brnl`)가 있으면 **그것이 정본**이고,
// 없으면 합성한다(격자 벽 — 면 23 · 면마다 칠 획 40 · 큰 면은 2048 단계에 걸린다).
// 두 픽스처의 값을 다 남긴다(사람 문서가 오면 «바꿔 다시 잰다»의 자리가 이미 있다).
//
// ⚠ 계측 스펙이다(MEASURE_SPECS — stage0/out에 쓴다). 게이트는 `gates72.spec.ts`다.
//   수리 전: LEDGER=1 PRE72=1 node tools/e2e.mjs ledger e2e/perf72.spec.ts --project=dpr2
//   수리 후: LEDGER=1        node tools/e2e.mjs ledger e2e/perf72.spec.ts --project=dpr2

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildHeavy, orbitProbe, openProbe, memProbe, zoomIn, HUMAN_FIXTURE, type Heavy } from './heavy72'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRE = process.env.PRE72 === '1'
const OUT: Record<string, unknown> = {
  what: 'web2-72 §0 — 부하 계측(A 돌릴 때 · B 열 때 · C 메모리)과 가설 넷의 실증/반증',
  tree: PRE ? '수리 전(pre — 동결)' : '수리 후(post)',
  note_pitfalls: '#12·#14(동작점 하나·ms로 주장하지 않는다 — 정본은 «호출 수·훑은 획 수»이고 ms는 곁값) · #47(수치는 원장이 정본) · #99(워커 1) · #101(web2 안) · #103(장면 확인 — 면·칠 획 수) · #110(열쇠를 그 파생의 입력으로 좁힌다 — 가설 1이 그 형태의 잔여) · #111(미리보기의 자는 시간과 이동량 둘)',
  pitfall_citations: [12, 14, 42, 47, 99, 101, 103, 110, 111],
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(lens31·paint50의 no_constants_snapshot이 정본)' },
  selfcheck_notes: {
    zero_counters: '수리 «후»의 orbit.bakes 0 · evicts 0은 §1·§2·§3의 통과값이다 — 같은 자가 수리 «전»(perf72_pre)에서 큰 값을 낸다(짝이 원장 둘로 남는다)',
  },
}
const LEDGER_OF = (p: string) =>
  resolve(HERE, `../../stage0/out/perf72${PRE ? '_pre' : ''}_web2_dpr${p === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: `LEDGER=1 ${PRE ? 'PRE72=1 ' : ''}node tools/e2e.mjs ledger e2e/perf72.spec.ts (워커 1 — #99)`,
      viewport: 'playwright 기본(1200×800) · dpr는 project가 정한다 — 지시의 「ipad 꼴」은 dpr2가 그 자리다',
      human_fixture: existsSync(resolve(HERE, HUMAN_FIXTURE)) ? HUMAN_FIXTURE : null },
    ...OUT,
  }, null, 2))
})

test('§0 — A 돌릴 때 · B 열 때 · C 메모리 · 가설 넷', async ({ page }) => {
  test.setTimeout(600_000)
  const built: Heavy = await buildHeavy(page)
  expect(built.faces, '면이 섰다(#103)').toBeGreaterThanOrEqual(16)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(600)

  const C = await memProbe(page)
  const A = await orbitProbe(page)
  // ⚠ D-5 — **픽스처가 실사용 대역을 덮는가.** 첫 판(격자 벽 · 기본 배율)은 면이 전부 단계
  //   256이라 「돌릴 때 단계가 바뀐다」를 못 잰다. 사람이 본 것은 «면이 화면을 채운» 상태다 —
  //   배율을 올려 큰 면(1024·2048)을 만들고 **같은 궤도를 한 번 더** 돈다. 가설 1·2는 여기 산다.
  await zoomIn(page, 5)
  const Cz = await memProbe(page)
  const Az = await orbitProbe(page)
  const B = await openProbe(page)

  OUT.fixture = built
  OUT.A_orbit = A
  OUT.A_orbit_zoomed = Az
  OUT.B_open = B
  OUT.C_memory = C
  OUT.C_memory_zoomed = Cz
  // ── 가설 넷 — 값이 가르는 자리 ──────────────────────────────────────────────────
  // 훑기의 자는 «편집 한 번»이다(지시 §0 가설 4의 문면) — 궤도 중에는 열쇠가 안 갈리면 0이다
  const scanPerCall = B.editScanCalls > 0 ? B.editScans / B.editScanCalls : 0
  OUT.hypotheses = {
    h1_level_in_bake_key: {
      verdict: Az.bake.sigChange.lv > 0 || Az.bake.sigChange.texelQ > 0 || A.bake.sigChange.lv > 0 ? '실증' : '반증',
      sig_change_small: A.bake.sigChange, sig_change_zoomed: Az.bake.sigChange,
      level_up: Az.bake.levelUp, level_down: Az.bake.levelDown,
      bakes_during_orbit_small: A.bake.bakes, bakes_during_orbit_zoomed: Az.bake.bakes,
      baked_strokes_during_orbit_zoomed: Az.bake.bakedStrokes,
      note: '궤도 중 열쇠가 갈린 원인을 조각별로 센다 — lv(단계)·tq(무늬 굵기 반옥타브)가 0이 아니면 「화면 크기가 굽기 열쇠에 들어 있다」가 실증된다.',
    },
    h2_lru_thrash: {
      verdict: Az.bake.evicts > 0 || A.bake.evicts > 0 ? '실증' : '반증',
      evicts_during_orbit_small: A.bake.evicts, evicts_during_orbit_zoomed: Az.bake.evicts,
      bytes: C.bytes, bytes_zoomed: Cz.bytes, budget: C.budget,
      visible_paint_faces: C.visible, levels_zoomed: Cz.levels,
      over_budget: Cz.bytes > Cz.budget,
      note: '퇴출이 궤도 중에 돌면 「보이는 면이 예산을 넘어 매 프레임 퇴출→재굽기」다.',
    },
    h3_sync_bake_on_open: {
      verdict: B.longestBlockMs >= 50 ? '실증' : '반증',
      longest_block_ms: B.longestBlockMs, first_interactive_ms: B.firstInteractiveMs,
      all_paint_ms: B.allPaintMs, bakes_on_open: B.bakes,
      bare_first_interactive_ms: B.bareFirstInteractiveMs, bare_longest_block_ms: B.bareLongestBlockMs, bare_strokes: B.bareStrokes,
      note: '열 때 보이는 면을 첫 프레임에 «동기»로 구우면 메인 스레드가 그만큼 막힌다(50ms = 지시 §4의 상한). ⚠ bare_*는 **칠을 걷어낸 같은 문서**의 대조군이다 — 그만큼은 칠의 몫이 아니라 문서·3D 동기의 몫이고 이 라운드의 칠 수리로는 못 줄인다(D-3).',
    },
    h4_paint_strokes_scan: {
      verdict: scanPerCall >= built.docStrokes * 0.9 ? '실증' : '반증',
      scans_during_orbit: A.bake.scans, scan_calls_during_orbit: A.bake.scanCalls,
      scan_per_call: Math.round(scanPerCall),
      doc_strokes: built.docStrokes,
      edit_scans: B.editScans, edit_scan_calls: B.editScanCalls,
      note: '호출 한 번에 훑는 획 수가 «문서 전체»면 실증. 수리 후에는 «그 면의 획 수»로 떨어진다(§1-2 색인).',
    },
  }
  // 이 스펙은 **계측**이다 — 게이트(상한)는 gates72.spec.ts가 진다. 여기서는 자가 살아 있는지만 본다.
  expect(A.frames.n, '궤도 프레임 표본이 모였다').toBeGreaterThan(30)
  expect(B.firstInteractiveMs, '열기 측정이 값을 냈다').toBeGreaterThan(0)
})
