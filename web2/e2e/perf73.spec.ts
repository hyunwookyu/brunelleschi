// web2-73 §1·§2 — **벽이 무엇인지 잰다**(계측 스펙 · MEASURE_SPECS · stage0/out에 쓴다).
//
//   §1-1 네 팔   같은 실행·같은 카메라·같은 몸짓(72의 720px 끌기)으로 ① 빈 · ② 선만 · ③ 면까지 · ④ 칠까지.
//               팔마다 fps · p95 · 최장 차단 · 삼각형·그리기 호출 · **프레임 걸음마다의 ms**(여덟 걸음).
//   §1-2 기계    같은 스펙을 세 곳에서(가 헤드리스 dpr2 · 나 헤드리스 dpr1 · 다 머리 있는 크로뮴) —
//               GPU 이름(UNMASKED_RENDERER_WEBGL)이 원장에 든다. 원장 이름이 그 셋을 가른다:
//                 LEDGER=1 node tools/e2e.mjs ledger e2e/perf73.spec.ts --project=dpr2   → perf73_web2_dpr2.json
//                 LEDGER=1 node tools/e2e.mjs ledger e2e/perf73.spec.ts --project=dpr1   → perf73_web2_dpr1.json
//                 PW_HEADED=1 LEDGER=1 … --project=dpr2                                  → perf73_web2_dpr2_headed.json
//   §2   열기 분해  「칠 전부 채워지기」(72 dpr2 18.8초)를 네 몫으로: 굽기 CPU · 업로드 · 분할 대기 · 그 밖.
//               쉬는 중 예산을 값으로 훑는다(4 · 12(지금) · 24 · 50 · 100 · 1000ms) — 조정은 §3의 일이고
//               여기서는 «어느 값이 무엇을 주는가»만 값으로 낸다.
//
// ⚠⚠ CLOSING 「게이트의 조건」 — 프로브가 움직였음을 먼저 증명한다(totalDeg · 프레임 수). 0이면 그
//   팔의 다른 숫자는 원장에 «버림»으로 표시된다(discarded: true) — 보고에 안 싣는다.

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildHeavy, settleStat } from './heavy72'
import { fourArms, armMetricsOff, installOpenProbe73, openProbe73, type ArmName, type Open73 } from './heavy73'
import { PAINT73_PROBE_MIN_DEG, PAINT73_SUM_TOL, PAINT73_FIRST_INTERACTIVE_MAX_MS } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const HEADED = process.env.PW_HEADED === '1'
const NOVSYNC = process.env.PW_NOVSYNC === '1'
const VSYNC_MS = 1000 / 60
const OUT: Record<string, unknown> = {
  what: 'web2-73 §1·§2 — 벽 가르기(네 팔 × 여덟 걸음 · GPU 이름)와 「칠 전부 채워지기」의 네 몫 분해 + 쉬는 중 예산 훑기. 재는 라운드다 — 이 원장은 임자를 지목하고, 고치는 것은 §3이다.',
  note_pitfalls: '#12·#14(동작점 하나·ms로 주장하지 않는다 — 정본은 호출 수·삼각형 수·걸음별 «몫» · 두 dpr + 머리 있는 판) · #16(분모 — 궤도는 같은 걸음·같은 각) · #47(수치는 원장이 정본) · #89(초록의 범위 — 굽기가 끝난 뒤에 잰다) · #99(워커 1) · #101 · #103 · #105(«보이는 것»으로 자를 잡지 않는다) · #108(단언 판과 반증 판이 같은 값이면 자를 의심 — 프로브 움직임을 먼저 증명) · #112',
  pitfall_citations: [12, 14, 16, 42, 47, 89, 99, 101, 103, 105, 108, 112],
  thresholds: { PAINT73_PROBE_MIN_DEG, PAINT73_SUM_TOL, PAINT73_FIRST_INTERACTIVE_MAX_MS },
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(lens31·paint50의 no_constants_snapshot이 정본)' },
  selfcheck_notes: {
    zero_counters: '① 빈 팔의 삼각형 0·선 0·굽기 0은 픽스처의 정의(획 0)다 — 같은 실행의 ②③④가 0이 아닌 값을 낸다. 궤도 중 bake 0은 72 §2의 통과값이고 반증 짝은 gates72 orbit_freeze_off에 있다',
    identical_pairs: 'parts.sum_ms == parts.wall_ms는 **구성상 항등**이다(other가 뺄셈이다 — §5.1 유형 3). 판정력은 check.accounted_over_wall(장부 vs 벽시계 · 독립된 시계 둘)과 check.steps_over_work · raf_over_wall에 있고 그것이 ±5% 문이다',
    single_category: 'fixture.levels가 한 값(dpr2 256×23 · dpr1 128×23)인 것은 픽스처의 구성이다(72와 같은 격자 벽 — 칸이 화면에서 비슷한 크기) — 단계의 변별은 §1의 zoom(512까지 확대 · zoom.maxLevel)이 든다. 이 원장의 자는 단계가 아니라 팔 사이의 «차»다',
  },
}
// 원장 꼬리표 — 머리 있는 판은 `_headed`, 그 밖의 대조군(예: Edge 헤드리스 — 이진과 GPU를 가르는 «라» 팔)은 PW_LEDGER_TAG로 준다
const TAG = process.env.PW_LEDGER_TAG ?? (HEADED ? '_headed' : '')   // 캡 없는 팔(PW_NOVSYNC=1)은 PW_LEDGER_TAG로 가른다
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/perf73_web2_dpr${p === 'dpr2' ? 2 : 1}${TAG}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, headed: HEADED, novsync: NOVSYNC, ledger_tag: TAG, chromium_exe: process.env.PW_CHROMIUM_EXE ?? null, workers: 1,
      canonical: `${HEADED ? 'PW_HEADED=1 ' : ''}LEDGER=1 node tools/e2e.mjs ledger e2e/perf73.spec.ts --project=${info.project.name} (워커 1 — #99)`,
      viewport: 'playwright 기본(1200×800) · dpr는 project가 정한다(지시의 1194×834는 아이패드 꼴 — 이 판은 72와 같은 1200×800이라 72의 값과 나란히 선다)',
      machine_note: 'GPU 이름은 gl.renderer(UNMASKED_RENDERER_WEBGL)이 정본이고 software 플래그는 그 이름의 정규식(swiftshader|llvmpipe|software…)이다 — 절대 ms는 그 기계의 값이고 팔 사이의 «몫»만 옮겨 읽는다(#12·#14)',
      settle_timeouts: settleStat.timeouts, settle_last_stage: settleStat.lastStage, settle_rows: settleStat.rows },
    ...OUT,
  }, null, 2))
})

const r2 = (v: number): number => Math.round(v * 100) / 100
const ARMS: ArmName[] = ['①빈', '②선만', '③면까지', '④칠까지']

test('§1 네 팔 — 같은 카메라·같은 몸짓으로 ①빈 ②선만 ③면까지 ④칠까지 · 여덟 걸음 · GPU 이름', async ({ page }) => {
  test.setTimeout(1_800_000)
  const F = await fourArms(page)
  expect(F.built.faces, '면이 섰다(#103)').toBeGreaterThanOrEqual(16)
  expect(F.built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(600)
  OUT.fixture = F.built
  OUT.gl = F.gl
  OUT.zoom = F.zoom
  // ── 팔마다: 움직였는가(먼저) → 표 ────────────────────────────────────────────────
  const table: Record<string, unknown> = {}
  for (const a of ARMS) {
    const A = F.arms[a]
    const o = A.orbit
    const walk = o.walk as { frames: number; sample: number; steps: Record<string, { p50: number; p95: number; max: number; sum: number }>; gl: { calls: number; triangles: number; lines: number } }
    // 움직임의 증명 — 네 팔 전부 «각»이다(① 빈 팔은 카메라를 남기고 획만 없앴다 — heavy73.emptyDoc · 리뷰어 [M2]).
    // 첫 실행의 ① 팔은 카메라가 없어 0°였고(render3d 프레임 0 · fps 59.8 = vsync 공회전) 그 판의 숫자는 버렸다.
    const proof = 'deg'
    const moved = o.totalDeg >= PAINT73_PROBE_MIN_DEG && o.frames.n > 30 && walk.frames > 0
    table[a] = {
      moved, discarded: !moved, probe_proof: proof, driven: 'middle-drag 720px',
      totalDeg: o.totalDeg, pxDragged: o.pxDragged, steps: o.steps, frames: o.frames.n, render3d_frames: walk.frames,
      docStrokes: A.docStrokes, paintStrokes: A.paintStrokes, faces: A.faces, texEntries: A.texEntries, r3d: A.r3d,
      fps: o.fps, p50: o.frames.p50, p95: o.frames.p95, max: o.frames.max, longestBlockMs: o.longestBlockMs, durationMs: o.durationMs,
      triangles: walk.gl.triangles, drawCalls: walk.gl.calls, lineDraws: walk.gl.lines,
      steps_ms: walk.steps,
      upload: o.upload,
      bake: { bakes: o.bake.bakes, bakedStrokes: o.bake.bakedStrokes, frozenFrames: o.bake.frozenFrames },
      frameCost: o.cost,
      tiles: o.tiles,
    }
  }
  OUT.A_arms = table
  // ── [L2] 관찰자의 몫 — ④ 팔을 «계측 끔»으로 한 번 더(자는 프로브 자신의 rAF 간격이라 내 계측과 무관하다) ──
  const armOff = await armMetricsOff(page, F)
  OUT.A_metrics_overhead = armOff
  // ── 걸음 «몫»(④ 팔 · p50의 비) — 임자 지목의 자 ─────────────────────────────────────
  const share = (a: ArmName) => {
    const w = (F.arms[a].orbit.walk as any).steps as Record<string, { p50: number; p95: number; sum: number }>
    const tot = Math.max(1e-9, w.total!.sum)
    const out: Record<string, number> = {}
    for (const k of Object.keys(w)) if (k !== 'total') out[k] = Math.round((w[k]!.sum / tot) * 1000) / 10
    return out
  }
  OUT.A_step_share_pct = { '④칠까지': share('④칠까지'), '③면까지': share('③면까지'), '②선만': share('②선만'), '①빈': share('①빈') }
  // ── 임자 가르기(㉮ 기계 · ㉯ 바탕 렌더러 · ㉰ 장면 규모) — 팔 사이의 «차»와 «60Hz 상한»으로 ─────────────
  //   ⚠ 리뷰어 [H1][H2]: 네 팔이 전부 vsync(16.7ms)에 붙은 실행에서는 팔 사이의 몫이 정의되지 않는다(칠 몫이 음수로
  //   나온 것이 그 표식이다). 그래서 «상한에 붙었는가»를 먼저 값으로 내고, 몫은 ④의 p95 중 **상한을 넘는 몫**(기계가
  //   더한 것)과 **JS 걸음의 몫**(바탕 렌더러)으로 가른다. 장면의 몫은 «캡 없는 팔»(PW_NOVSYNC=1)에서만 뜻이 있다.
  const p95 = (a: ArmName) => F.arms[a].orbit.frames.p95
  const gl = F.gl as { renderer: string; software: boolean }
  const js = (a: ArmName) => ((F.arms[a].orbit.walk as any).steps.total as { p95: number }).p95
  const capped = ARMS.every(a => p95(a) <= VSYNC_MS * 1.05)
  const paint = p95('④칠까지')
  OUT.A_owner = {
    note: '팔 사이의 차가 그 층의 몫이다 — 단 **네 팔이 vsync에 붙어 있으면(capped) 차는 정의되지 않는다**(둘 다 16.7ms 안에 들었다는 뜻일 뿐). 기계의 몫 = ④ p95에서 60Hz 한 프레임(16.7)을 넘는 부분 · 바탕 렌더러(JS 걸음)의 몫 = render3d 여덟 걸음 합의 p95 · 장면의 몫은 캡 없는 팔(novsync)에서 ①→④의 차로 읽는다',
    gpu: gl.renderer, software_gpu: gl.software, novsync: NOVSYNC, vsync_ms: r2(VSYNC_MS),
    vsync_capped_all_arms: capped,
    p95: { empty: p95('①빈'), lines: p95('②선만'), faces: p95('③면까지'), paint },
    deltas_ms: { lines: r2(p95('②선만') - p95('①빈')), faces: r2(p95('③면까지') - p95('②선만')), paint: r2(paint - p95('③면까지')) },
    js_steps_p95_ms: { empty: js('①빈'), lines: js('②선만'), faces: js('③면까지'), paint: js('④칠까지') },
    share_pct_of_paint_p95: {
      over_vsync_machine: r2(100 * Math.max(0, paint - VSYNC_MS) / Math.max(1e-9, paint)),
      js_steps_renderer: r2(100 * js('④칠까지') / Math.max(1e-9, paint)),
      vsync_floor: r2(100 * Math.min(paint, VSYNC_MS) / Math.max(1e-9, paint)),
      note: capped ? '네 팔이 전부 상한에 붙었다 — 팔 사이의 차는 «몫»이 아니다(장면의 몫은 novsync 팔에서)' : '상한 밖 — ①→④의 차(deltas_ms)가 이 GPU에서의 층별 몫이다',
    },
  }
  for (const a of ARMS) expect((table[a] as any).moved, `${a} 팔의 프로브가 움직였다(궤도: totalDeg ≥ ${PAINT73_PROBE_MIN_DEG} · 프레임 > 30 · render3d 프레임 > 0 / ①빈: render3d 프레임 > 30)`).toBe(true)
})

test('§2 열기 분해 — 「칠 전부 채워지기」의 네 몫 · 쉬는 중 예산 훑기(4 · 12 · 24 · 50 · 100 · 1000ms)', async ({ page }) => {
  test.setTimeout(1_800_000)
  const built = await buildHeavy(page)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(600)
  await installOpenProbe73(page)
  // 지금 값(C 그대로 — 12ms)은 **셋**을 재고 중앙을 쓴다(#14 — 첫 실행에서 첫 상호작용이 1,151~1,428로 흔들렸다).
  // 후보 24도 셋. 나머지는 하나씩(대역의 모양을 보는 값).
  const PLAN: { key: string; ms: number | null }[] = [
    { key: 'now_1', ms: null }, { key: 'now_2', ms: null }, { key: 'now_3', ms: null },
    { key: '4', ms: 4 }, { key: '24_1', ms: 24 }, { key: '24_2', ms: 24 }, { key: '24_3', ms: 24 },
    { key: '32', ms: 32 }, { key: '50', ms: 50 }, { key: '100', ms: 100 }, { key: '1000', ms: 1000 },
  ]
  const sweep: Record<string, Open73> = {}
  for (const p of PLAN) sweep[p.key] = await openProbe73(page, p.ms, `idle=${p.key}`)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintBakeIdleMsForTest(null) })
  const median = (xs: number[]) => { const v = xs.slice().sort((a, b) => a - b); return v[Math.floor(v.length / 2)]! }
  const pick = (keys: string[]) => keys.map(k => sweep[k]!).sort((a, b) => a.allPaintMs - b.allPaintMs)[Math.floor(keys.length / 2)]!
  const now = pick(['now_1', 'now_2', 'now_3'])
  const c24 = pick(['24_1', '24_2', '24_3'])
  OUT.B_repeats = {
    note: '같은 조건 셋의 흔들림(#14) — 유효 자릿수는 두 자리다. 표제는 «칠 전부»의 중앙값 실행이다',
    now: ['now_1', 'now_2', 'now_3'].map(k => ({ allPaintMs: sweep[k]!.allPaintMs, firstInteractiveMs: sweep[k]!.firstInteractiveMs, longestBlockMs: sweep[k]!.longestBlockMs })),
    idle24: ['24_1', '24_2', '24_3'].map(k => ({ allPaintMs: sweep[k]!.allPaintMs, firstInteractiveMs: sweep[k]!.firstInteractiveMs, longestBlockMs: sweep[k]!.longestBlockMs })),
    now_median: { allPaintMs: median(['now_1', 'now_2', 'now_3'].map(k => sweep[k]!.allPaintMs)), firstInteractiveMs: median(['now_1', 'now_2', 'now_3'].map(k => sweep[k]!.firstInteractiveMs)), longestBlockMs: median(['now_1', 'now_2', 'now_3'].map(k => sweep[k]!.longestBlockMs)) },
    idle24_median: { allPaintMs: median(['24_1', '24_2', '24_3'].map(k => sweep[k]!.allPaintMs)), firstInteractiveMs: median(['24_1', '24_2', '24_3'].map(k => sweep[k]!.firstInteractiveMs)), longestBlockMs: median(['24_1', '24_2', '24_3'].map(k => sweep[k]!.longestBlockMs)) },
  }
  OUT.B_open = now
  OUT.B_candidate_24 = c24
  OUT.B_parts = {
    note: '네 몫(ms · %) — bake = bakeFaceTex/appendMarkOnTex 안의 CPU · upload = GL texImage2D/texSubImage2D 호출 시간(CPU 쪽 · GPU 완료는 render 걸음에 섞인다) · wait = 프레임 사이에 논 시간(rAF 간격의 빈 몫) · other = 나머지(부팅 + 프레임 안의 그리기 등). ⚠ other는 뺄셈이라 sum == wall은 구성상 항등 — 판정은 check(장부 vs 벽시계)가 한다',
    ...now.parts, check: now.check, frames: now.loop, bake_frame_avg_ms: now.bake_frame_avg_ms,
  }
  OUT.B_idle_sweep = Object.fromEntries(Object.entries(sweep).map(([k, v]) => [k, {
    idleMs: v.idleMs, allPaintMs: v.allPaintMs, firstInteractiveMs: v.firstInteractiveMs, longestBlockMs: v.longestBlockMs,
    frames: v.loop.frames, bakeFrames: v.loop.bakeFrames, bake_ms: v.parts.bake_ms, upload_ms: v.parts.upload_ms, wait_ms: v.parts.wait_ms, other_ms: v.parts.other_ms,
    accounted_over_wall: v.check.accounted_over_wall,
  }]))
  OUT.B_gate_lines = {
    '§2 네 몫의 합 == 칠 전부(±5%)': { accounted_over_wall: now.check.accounted_over_wall, raf_over_wall: now.check.raf_over_wall, pass: Math.abs(now.check.accounted_over_wall - 1) <= PAINT73_SUM_TOL,
      note: '⚠ **항등이다**(리뷰어 [H4]) — wait = 마지막 프레임 끝 − 첫 프레임 시작 − 일한 시간(뺄셈)이라 장부의 합은 정의상 벽시계다. 이 줄은 지시 문면의 «기록»이고 문이 아니다. 문은 아래 두 줄(독립된 시계 둘)이다' },
    '§2 독립 자 ① render3d 걸음 합 ÷ 고리 일한 시간 ∈ [0.9, 1.0]': { steps_over_work: now.check.steps_over_work, pass: now.check.steps_over_work >= 0.9 && now.check.steps_over_work <= 1.0, note: '두 시계(render3d 안의 아홉 시각 · main.frame의 둘)가 서로 다른 자리에서 찍힌다 — 프레임 안에 render3d 밖의 일(흑연 겹·2D)이 커지면 0.9 아래로 떨어진다' },
    '§2 독립 자 ② 굽기 + 업로드 ≤ 일한 시간': { bake_plus_upload_over_work: now.check.bake_plus_upload_over_work, pass: now.check.bake_plus_upload_over_work <= 1.0, note: '굽기(bakeStat.ms)·업로드(GL 프로브)·일한 시간(고리)은 셋 다 다른 시계다 — 겹치면 1을 넘는다' },
    '§2 첫 상호작용 ≤ 1,155ms(72의 측정값 · 기록)': { now_all: (OUT.B_repeats as any).now.map((x: any) => x.firstInteractiveMs), now_median: (OUT.B_repeats as any).now_median.firstInteractiveMs, ref_72: PAINT73_FIRST_INTERACTIVE_MAX_MS, pass: (OUT.B_repeats as any).now_median.firstInteractiveMs <= PAINT73_FIRST_INTERACTIVE_MAX_MS, note: '⚠ 1,155는 72의 **한 표본 측정값**이고(72의 게이트 문면은 ≤ 1,000이었고 그때도 미달) 문턱이 아니다 — 같은 코드의 세 실행 값이 now_all에 그대로 있다(리뷰어 [H3]). 무회귀의 판정은 아래 짝 비교가 한다' },
    '§4(72) 첫 상호작용 ≤ 1,000ms(72의 게이트 문면 · 기록)': { now_median: (OUT.B_repeats as any).now_median.firstInteractiveMs, pass: (OUT.B_repeats as any).now_median.firstInteractiveMs <= 1000 },
    '§2 첫 상호작용 무회귀 — 후보(24ms) vs 지금(중앙값 셋 · ≤ 1.15배)': { now_median: (OUT.B_repeats as any).now_median.firstInteractiveMs, idle24_median: (OUT.B_repeats as any).idle24_median.firstInteractiveMs, ratio: r2((OUT.B_repeats as any).idle24_median.firstInteractiveMs / Math.max(1, (OUT.B_repeats as any).now_median.firstInteractiveMs)), pass: (OUT.B_repeats as any).idle24_median.firstInteractiveMs <= (OUT.B_repeats as any).now_median.firstInteractiveMs * 1.15 },
    '§4(72) 칠 전부 ≤ 5000ms(캐시 없음)': { now: now.allPaintMs, pass: now.allPaintMs <= 5000, sweep_min: Math.min(...Object.values(sweep).map(v => v.allPaintMs)) },
  }
  expect(now.loop.frames, '열기 프로브가 프레임을 냈다(움직였다)').toBeGreaterThan(0)
  expect(now.allPaintMs, '칠 전부 채워지기가 값을 냈다').toBeGreaterThan(0)
})
