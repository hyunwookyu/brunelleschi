// web2-73 — **게이트**(계측은 perf73.spec.ts). CLOSING 「게이트의 조건」대로 **모든 게이트가 «수리 전 빨강»과
// 짝**이다 — 같은 실행 안에서 빨강 팔을 실제로 돌려 값을 남긴다.
//
//   g0 프로브 움직임   사람의 끌기(720px)는 ≥ PAINT73_PROBE_MIN_DEG · **빨강**: 72의 «아무것도 안 잰» 프로브
//                    (orbitByForTest 3°×120 — 자동 수평이 되접는다)는 그 문 아래다
//   g1 걸음별 자      여덟 걸음의 합 == render3d 전체(±1ms/프레임) · 걸음 계측이 프레임마다 돈다 ·
//                    **빨강**: 표식을 리셋한 직후에는 프레임 0(자가 «돌았다»를 스스로 말한다)
//   g2 ?perf=1        깃발 없이는 DOM에 없다(0) · 있으면 하나 · 눌리지 않는다(elementFromPoint ≠ 자기) ·
//                    숫자 셋이 값을 낸다(fps > 0 · 열기 > 0) — **빨강**: 깃발 없는 판의 0
//   g3 열기 분해      장부(부팅 전 + 일한 + 논) == 벽시계(±5%) · 굽기+업로드 ≤ 일한 시간 ·
//                    첫 상호작용: **빨강 = 수리 전 거동(legacy72)** > 지금(먼저 그림이 늦어지면 안 된다)
//
// 원장: stage0/out/gates73_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildHeavy, bootReset, orbitProbe, settleBake, setLegacy } from './heavy72'
import { installOpenProbe73, openProbe73 } from './heavy73'
import { PAINT73_PROBE_MIN_DEG, PAINT73_SUM_TOL } from './thresholds'

const PER_FACE = 8   // 게이트는 규칙을 재므로 획 수의 절대값에 안 걸린다(72 gates의 그 근거 — 밤 시간)

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-73 게이트 — g0 프로브 움직임 · g1 걸음별 자 · g2 ?perf=1 실기기 모드 · g3 열기 분해의 장부. 전부 같은 실행 안에 «빨강» 짝이 있다(CLOSING 「게이트의 조건」)',
  note_pitfalls: '#12·#14 · #42 · #81(대기에 상한) · #89 · #99 · #101 · #103 · #105 · #108(단언 판과 반증 판이 같은 값이면 자를 의심 — 빨강 짝이 그 검사다) · #112',
  pitfall_citations: [12, 14, 42, 81, 89, 99, 101, 103, 105, 108, 112],
  thresholds: { PAINT73_PROBE_MIN_DEG, PAINT73_SUM_TOL },
  no_constants_snapshot: true,
  selfcheck_notes: {
    zero_counters: 'g2의 hud_without_flag 0은 «미생성»의 뜻이고 짝(hud_with_flag 1)이 같은 원장에 있다 · g1의 red_frames_after_reset 0은 빨강 팔의 정의(리셋 직후)다',
    identical_pairs: 'g1의 걸음 합 == 전체는 게이트의 뜻 그 자체(같은 시계로 찍은 여덟 구간의 합) — 판정력은 «프레임마다 돈다»(frames > 0)와 빨강 짝에 있다',
    zero_error_metric: 'g1_walk.per_frame_gap_ms 0은 **설계 보장**이다(§5.1 유형 3 — 아홉 시각을 같은 시계로 찍고 여덟 구간의 합과 t8−t0을 견주므로 부동소수 반올림 밖에서는 정확히 0이다). 임계를 안 건다 — 이 자리의 게이트는 «프레임마다 돈다»(frames > 30)와 빨강(리셋 직후 0)이다',
  },
}
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/gates73_web2_dpr${p === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/gates73.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

test('g0·g1 — 프로브가 움직였다(빨강: orbitByForTest 3°×120) · 여덟 걸음의 합 == 전체(빨강: 리셋 직후 프레임 0)', async ({ page }) => {
  test.setTimeout(900_000)
  const built = await buildHeavy(page, PER_FACE)
  expect(built.faces, '면이 섰다(#103)').toBeGreaterThanOrEqual(16)
  // ── g0 초록 팔: 사람의 끌기 ─────────────────────────────────────────────────────
  const human = await orbitProbe(page)
  // ── g0 빨강 팔: 72가 «아무것도 안 잰» 그 프로브(진단 통로로 3°씩 120번 — 자동 수평이 되접는다) ──
  const red = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    const qOf = () => { const q = b2.app.pose.q; return { x: q.x, y: q.y, z: q.z, w: q.w } }
    const ang = (a: any, c: any) => 2 * Math.acos(Math.min(1, Math.abs(a.x * c.x + a.y * c.y + a.z * c.z + a.w * c.w))) * 180 / Math.PI
    const q0 = qOf()
    for (let i = 0; i < 120; i++) {
      b2.diag.orbitByForTest(3, 0)
      await new Promise<void>(res => requestAnimationFrame(() => res()))
    }
    return { totalDeg: Math.round(ang(q0, qOf()) * 10) / 10, calls: 120, degRequested: 360 }
  })
  await settleBake(page, 300, 'g0/red')
  // ── g1: 걸음 합 == 전체 · 빨강 = 리셋 직후 프레임 0 ────────────────────────────────
  const walk = human.walk as { frames: number; sample: number; steps: Record<string, { p50: number; p95: number; max: number; sum: number }> }
  const stepSum = Object.entries(walk.steps).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + v.sum, 0)
  const redFrames = await page.evaluate(() => { const b2 = (window as any).__b2; b2.diag.frameStepsReset(); return b2.diag.frameSteps().frames as number })
  OUT.g0_probe = {
    human: { totalDeg: human.totalDeg, pxDragged: human.pxDragged, frames: human.frames.n, fps: human.fps, p95: human.frames.p95 },
    red_orbitByForTest: red,
    min_deg: PAINT73_PROBE_MIN_DEG,
    note: '빨강 팔은 요청한 각(360°)과 실제 돈 각의 차가 곧 «되접힘»이다 — 그 값이 문(PAINT73_PROBE_MIN_DEG) 아래면 이 게이트가 그 프로브를 실제로 잡는다',
  }
  OUT.g1_walk = { frames: walk.frames, sample: walk.sample, step_sum_ms: Math.round(stepSum * 1000) / 1000, total_sum_ms: walk.steps.total!.sum, per_frame_gap_ms: Math.round(Math.abs(stepSum - walk.steps.total!.sum) / Math.max(1, walk.frames) * 1e6) / 1e6, red_frames_after_reset: redFrames }
  expect(human.totalDeg, `사람의 끌기가 움직였다(≥ ${PAINT73_PROBE_MIN_DEG}°)`).toBeGreaterThanOrEqual(PAINT73_PROBE_MIN_DEG)
  expect(human.frames.n, '프레임이 있다').toBeGreaterThan(30)
  expect(red.totalDeg, '빨강 — 72의 그 프로브는 문 아래다(자동 수평이 되접는다)').toBeLessThan(PAINT73_PROBE_MIN_DEG)
  expect(walk.frames, '걸음 계측이 프레임마다 돌았다').toBeGreaterThan(30)
  expect(Math.abs(stepSum - walk.steps.total!.sum) / Math.max(1, walk.frames), '여덟 걸음의 합 == 전체(프레임당 1ms 안)').toBeLessThan(1)
  expect(redFrames, '빨강 — 리셋 직후에는 프레임 0(자가 «돌았다»를 스스로 말한다)').toBe(0)
})

test('g2 — ?perf=1 실기기 모드: 깃발 없이는 없다(0) · 있으면 하나 · 눌리지 않는다 · fps·최장 차단·열기가 값을 낸다', async ({ page }) => {
  test.setTimeout(300_000)
  await bootReset(page)
  const without = await page.evaluate(() => document.querySelectorAll('#perfhud').length)
  await page.goto('/?reset&perf=1')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(() => location.search), '?reset이 perf 매개를 살렸다(69의 dev와 같은 길)').toContain('perf=1')
  const withFlag = await page.evaluate(() => document.querySelectorAll('#perfhud').length)
  // 상자 하나를 그려 카메라를 세우고 잠깐 돌린다 — fps가 «움직이는 동안»의 값을 낸다
  const line = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
  }
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560], [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await line(l[0], l[1], l[2], l[3])
  const orbit = await orbitProbe(page, 60, 6)
  await page.waitForTimeout(1200)   // HUD는 500ms마다 갱신
  const hud = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const el = document.getElementById('perfhud')!
    const r = el.getBoundingClientRect()
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { ...b2.diag.perfHudForTest(), pressable: !!t && (t === el || el.contains(t)), under: t ? (t.id || t.tagName) : null, rect: { w: Math.round(r.width), h: Math.round(r.height) }, fontPx: parseFloat(getComputedStyle(el).fontSize) }
  })
  OUT.g2_hud = { hud_without_flag: without, hud_with_flag: withFlag, hud, orbit_deg: orbit.totalDeg, note: '눌리지 않는다(pointer-events:none)라 69의 전수 표에는 +0 — docs/reference/INVENTORY.md 「개발(?perf=1)」 행' }
  expect(without, '빨강 짝 — 깃발 없이는 DOM에 없다(미생성)').toBe(0)
  expect(withFlag, '깃발이 있으면 하나').toBe(1)
  expect(hud.pressable, '눌리지 않는다 — 손을 안 막는다').toBe(false)
  expect(hud.on).toBe(true)
  expect(hud.openMs, '열기 ms > 0').toBeGreaterThan(0)
  expect(hud.fps, '움직이는 동안 fps > 0').toBeGreaterThan(0)
  expect(hud.fontPx, '큰 글씨(≥ 24px)').toBeGreaterThanOrEqual(24)
  expect(String(hud.text), 'HUD 문면에 셋이 다 있다').toMatch(/fps .*\n최장 차단 .*\n열기 /)
})

test('g3 — 열기 분해의 장부 == 벽시계(±5%) · 굽기+업로드 ≤ 일한 시간 · 첫 상호작용: 빨강(수리 전 거동) > 지금', async ({ page }) => {
  test.setTimeout(900_000)
  const built = await buildHeavy(page, PER_FACE)
  expect(built.paintStrokes, '칠 획이 섰다(#103)').toBeGreaterThanOrEqual(100)
  await installOpenProbe73(page)
  const now = await openProbe73(page, null, 'g3/now')
  // 빨강 — 수리 전 거동(동결·분할·색인 끔 = 72 legacy · 새로고침을 넘는다): 첫 프레임이 전부 굽는다
  await setLegacy(page, true)
  const red = await openProbe73(page, null, 'g3/legacy')
  await setLegacy(page, false)
  OUT.g3_open = {
    now: { firstInteractiveMs: now.firstInteractiveMs, allPaintMs: now.allPaintMs, longestBlockMs: now.longestBlockMs, parts: now.parts, check: now.check, loop: now.loop },
    red_legacy72: { firstInteractiveMs: red.firstInteractiveMs, allPaintMs: red.allPaintMs, longestBlockMs: red.longestBlockMs, parts: red.parts, check: red.check, loop: red.loop },
    tol: PAINT73_SUM_TOL,
  }
  expect(now.loop.frames, '프레임이 있다(움직였다)').toBeGreaterThan(0)
  expect(Math.abs(now.check.accounted_over_wall - 1), '장부(부팅 전 + 일한 + 논) == 벽시계(±5%)').toBeLessThanOrEqual(PAINT73_SUM_TOL)
  expect(now.check.bake_plus_upload_over_work, '굽기 + 업로드 ≤ 일한 시간(자가 겹치지 않는다)').toBeLessThanOrEqual(1.0)
  expect(Math.abs(red.check.accounted_over_wall - 1), '빨강 팔에서도 장부는 선다').toBeLessThanOrEqual(PAINT73_SUM_TOL)
  expect(red.firstInteractiveMs, '빨강 — 수리 전 거동은 첫 상호작용이 늦다').toBeGreaterThan(now.firstInteractiveMs)
})
