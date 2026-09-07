// web2-74 §0·§1·§2 — **멎는 것이 무엇인지 잰다**(계측 스펙 · MEASURE_SPECS · stage0/out).
//
//   §0 계측 판    옛 자(73의 p95 · 평생 최장 차단)가 실기기에서 무엇을 못 봤는지 **같은 눈금 위에서**
//                 값으로 낸다. 반증 짝: 창 안 눈금이 하나뿐인 자리에서 옛 자 0 ↔ 새 자 > 0.
//   §1 표식       일곱을 두르고, 그 이름이 멈춤 목록에 실제로 붙는지(구동 판 7/7 · 표식 밖은 `?`).
//   §2 세 팔      같은 문서·같은 몸짓으로 그냥 / `?nothumb=1` / `?nosave=1` — 멈춤 «횟수·최장·합».
//
// ⚠ CLOSING 「자동 시험의 fps는 게이트가 아니다」 — 이 원장의 시간 값은 **기록**이고, 판정은
//   기계에 안 흔들리는 자(멈춤 «횟수» · 표식 «호출 수» · 저장 «바이트»)와 **같은 실행 안의 짝 비교**가 한다.
// ⚠⚠ CLOSING 「게이트의 조건」 — 수리 전 판(그냥 팔)에서 「멈춤 ≥ 2회」가 **실제로 나오는 것**을
//   먼저 값으로 남긴다. 안 나오면 자를 고친다(게이트를 통과시키고 넘어가지 않는다).
// ⚠⚠⚠ 프로브의 «움직였다» 증명은 **더해진 획 수**다(strokesAdded) — 0이면 그 팔의 숫자는 버린다.

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { settleStat } from './heavy72'
import { bootWith, buildFixtureText, applyFixture, runArm, GESTURE, type ArmOut74 } from './heavy74'
import { PERF74_STALL_MIN_PRE, PERF74_MARK_NAMES_N } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
// 지시문이 준 일곱 + 74 §2가 값을 따라가 더한 둘(list.read · list.render — 아래 S1_driven이 아홉을 다 몬다)
const MARKS = ['save.serialize', 'save.put', 'save.thumb', 'bake.commit', 'tex.upload', 'doc.parse', 'doc.build'] as const
const MARKS_ADDED = ['list.read', 'list.render'] as const
const MARKS_ALL = [...MARKS, ...MARKS_ADDED] as const
const OUT: Record<string, unknown> = {
  what: 'web2-74 §0·§1·§2 — 계측 판 고침(옛 자 ↔ 새 자 반증) · 구간 표식 일곱 · 세 팔 반증(그냥 / ?nothumb=1 / ?nosave=1)의 멈춤 횟수·최장·합. 임자를 지목하는 원장이고, 고치는 것은 §3이다.',
  note_pitfalls: '#12·#14(동작점 하나 ⛔ · 정본은 «횟수»와 팔 사이의 짝) · #16(분모 — 세 팔이 같은 문서·같은 몸짓) · #42 · #47(수치는 원장이 정본) · #89(초록의 범위 — 굽기가 끝난 뒤부터 잰다) · #99(워커 1) · #103(프로브가 움직였음을 먼저) · #105(빈 결과 폴백은 값이 아니라 표식) · #108(단언 판과 반증 판이 같은 값이면 자를 의심) · #113(시간 자에는 «어느 GPU에서»가 붙어야 값이다)',
  pitfall_citations: [12, 14, 16, 42, 47, 89, 99, 103, 105, 108, 113],
  thresholds: { PERF74_STALL_MIN_PRE, PERF74_MARK_NAMES_N },
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(lens31·paint50의 no_constants_snapshot이 정본). 멈춤 문턱은 앱 상수 C.PERF_STALL_MS이고 원장의 stall_thresholdMs가 그 값이다(D-C4)' },
  selfcheck_notes: {
    zero_counters: '셋이다. ① `?nosave=1` 팔의 save.* 표식이 0인 것은 **그 팔의 정의**다(자동 저장을 껐다) — 같은 실행의 그냥 팔이 0이 아닌 값을 낸다. `?nothumb=1` 팔의 save.thumb 0도 같다. 그 0이 곧 이 절의 판정력이다. ② **S2_arms.*.gap_n[·][4..6](문턱 400·800·1600ms)가 세 팔·세 실행 전부 0인 것이 이 절의 결론이다** — 시험 기계(SwiftShader 헤드리스)의 프레임 간격이 217~244ms를 한 번도 안 넘는다(집계는 돈다: 같은 사다리의 [0..3] = 30·50·100·200ms가 210~256·30~41·30·8~22를 낸다). **그래서 「멈춤 ≥ 200ms 몇 회」로 팔을 가를 수 없고**(separable false) 지목은 표식의 호출 수·ms가 했다. 임계를 걸지 않는다(CLOSING · #113). ③ S2_verdict.save_chain_ms_per_gesture_mean.nosave = 0도 같은 팔의 정의다',
    identical_pairs: '세 팔의 docStrokesBefore가 같은 것은 **구성상 같다**(같은 저장물 문자열 하나를 세 팔에 먹인다 — #16 분모). 다르면 그 실행은 「같은 문서」가 아니다',
    single_category: '둘이다. ① 표식 귀속 구동 판(S1_driven)의 결과가 전부 «맞음»인 것은 설계 보장이 아니다 — 반증 짝(outside)이 같은 실행에서 `?`를 낸다. ② `*_fixture.levels`가 한 값(256×23)인 것은 픽스처의 구성이다(72·73과 같은 격자 벽 — 칸이 화면에서 비슷한 크기). 이 원장의 자는 단계가 아니라 팔 사이의 «차»다',
  },
}
const HEADED = process.env.PW_HEADED === '1'
const TAG = process.env.PW_LEDGER_TAG ?? (HEADED ? '_headed' : '')
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/perf74_web2_dpr${p === 'dpr2' ? 2 : 1}${TAG}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, headed: HEADED, ledger_tag: TAG, chromium_exe: process.env.PW_CHROMIUM_EXE ?? null, workers: 1,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/perf74.spec.ts --project=' + info.project.name + ' (워커 1 — #99)',
      gesture: GESTURE,
      machine_note: '시간의 절대값은 이 기계(playwright chromium_headless_shell = SwiftShader)의 기록이다 — 판정은 «멈춤 횟수»와 팔 사이의 짝이 한다(CLOSING · #113)',
      settle_timeouts: settleStat.timeouts, settle_last_stage: settleStat.lastStage },
    ...OUT,
  }, null, 2))
})

/* eslint-disable @typescript-eslint/no-explicit-any */
const B2 = () => (window as any).__b2

test('§0 계측 판 — 옛 자(p95)와 새 자(최장 간격)를 같은 눈금 위에서', async ({ page }) => {
  test.setTimeout(300_000)
  await bootWith(page, 'perf=1')
  // ① 동기 루프를 **표식 밖에서** 넣는다 — 목록에 그 줄이 뜨고 이름은 `?`다(반증 짝의 한쪽).
  //   ⚠ **1,500ms다**(초판은 800이었다): 1초 창보다 짧으면 창 안에 막기 «전»의 눈금이 남아
  //   「fps 1」 자리가 안 만들어진다 — 그러면 옛 자의 결함(§0 ①)을 재현 못 한다. 실기기의
  //   그 구간도 초 단위였다(멈춤 ① fps 1 · 4연속 ≥ 2초).
  await page.evaluate(() => (window as any).__b2.diag.resetPerfMarksForTest())
  await page.evaluate(() => (window as any).__b2.diag.blockMainForTest(1500))
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => ({
    stalls: (window as any).__b2.diag.perfStalls(),
    text: (window as any).__b2.diag.perfHudForTest().text as string | null,
    ticks: (window as any).__b2.diag.perfTicksForTest() as number[],
  }))
  expect(after.stalls.n, '인위로 넣은 800ms 멈춤이 목록에 뜬다').toBeGreaterThanOrEqual(1)
  const injected = after.stalls.recent.find((s: any) => s.ms >= 1200)
  expect(injected, '1,500ms 급 줄이 있다').toBeTruthy()
  expect((injected as any).mark, '표식 밖이라 ?로 적힌다').toBe('?')
  const tAfter = (injected as any).t as number
  const rulers = await page.evaluate((t) => (window as any).__b2.diag.perfRulersForTest(t), tAfter)
  OUT.S0_rulers = {
    injected_block_ms: 1500,
    at: rulers.at, fps_in_window: rulers.fps, ticks_in_window: rulers.ticksInWindow,
    old_p95_ms: rulers.old_p95, new_maxGap_ms: rulers.new_maxGapMs,
    stall_line: injected, hud_text: after.text, ticks_total: after.ticks.length,
  }
  // ② **눈금 전체를 훑어** 「창 안 눈금 1개」인 자리를 전부 찾는다 — 한 점으로 주장하지 않는다(#12)
  const sweep = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const ticks = b2.diag.perfTicksForTest() as number[]
    const rows: any[] = []
    for (const t of ticks) {
      const r = b2.diag.perfRulersForTest(t)
      // 첫 눈금은 «앞의 눈금»이 없어 간격 자체가 없다 — 자의 결함이 아니라 자료의 끝이라 거른다
      if (r.ticksInWindow <= 1 && r.hasPrev) rows.push({ at: Math.round(r.at), fps: r.fps, old_p95: r.old_p95, new_maxGap: r.new_maxGapMs })
    }
    return { n_points: rows.length, rows: rows.slice(0, 12) }
  })
  OUT.S0_sweep_fps1 = { ...sweep, verdict: '옛 자는 이 자리에서 0을 낸다(§0 ①의 결함) · 새 자는 0이 아니다' }
  expect(sweep.n_points, '창 안 눈금이 하나뿐인 자리가 실제로 있다(fps 1 구간)').toBeGreaterThanOrEqual(1)
  for (const r of sweep.rows) {
    expect(r.old_p95, '옛 자는 거기서 0이다(반증)').toBe(0)
    expect(r.new_maxGap, '새 자는 0이 아니다').toBeGreaterThan(0)
  }
  // ③ 「최장 차단」이 평생 최댓값이라 뒤의 멈춤을 못 보여준 것(§0 ②) — 목록은 최근 다섯을 든다
  const second = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.blockMainForTest(2500)          // 더 큰 것 하나 — 평생 최댓값을 여기서 굳힌다
    await new Promise(r => setTimeout(r, 400))
    b2.diag.blockMainForTest(400)           // 그 뒤의 작은 것 둘
    await new Promise(r => setTimeout(r, 400))
    b2.diag.blockMainForTest(400)
    await new Promise(r => setTimeout(r, 600))
    return { stalls: b2.diag.perfStalls(), hud: b2.diag.perfHudForTest() }
  })
  OUT.S0_after_big = {
    lifetime_longest_block_ms: Math.round(second.hud.longestBlockMs),
    stalls_n: second.stalls.n,
    recent: second.stalls.recent.slice(-5),
    verdict_old: '옛 화면은 「최장 차단」 한 칸이라 큰 것 하나에 묶여 뒤의 둘이 안 보였다',
    verdict_longtask: 'longtask 관찰자가 인위 막음을 **덜 본다**(lifetime_longest_block_ms) — rAF 간격 자는 넷을 다 잡았다. 이것이 「최장 차단」을 화면에서 내린 둘째 이유다(값)',
    verdict_new: '목록이 최근 다섯을 들어 뒤의 둘이 각각 뜬다',
    hud_text: second.hud.text,
  }
  expect(second.stalls.recent.filter((s: any) => s.ms >= 300 && s.ms < 900).length, '큰 것 뒤의 작은 멈춤 둘이 목록에 남는다').toBeGreaterThanOrEqual(2)
})

test('§1 표식 — 일곱이 이름을 붙인다 · 표식 밖은 ?', async ({ page }) => {
  test.setTimeout(900_000)
  await bootWith(page, 'perf=1')
  // ── 구동 판: 표식마다 그 «안»에서 300ms 막는다 — 목록의 그 줄이 그 이름인가 ──────────
  const driven: Record<string, unknown> = {}
  for (const m of MARKS_ALL) {
    const r = await page.evaluate(async (name) => {
      const b2 = (window as any).__b2
      b2.diag.resetPerfMarksForTest()
      b2.diag.blockInMarkForTest(name, 300)
      await new Promise(res => setTimeout(res, 400))
      const st = b2.diag.perfStalls()
      return { n: st.n, last: st.recent[st.recent.length - 1] ?? null }
    }, m)
    driven[m] = { named: r.last?.mark ?? null, ok: r.last?.mark === m, ms: r.last?.ms ?? null }
    expect(r.last?.mark, m + ' 이 이름으로 붙는다').toBe(m)
  }
  // ── 반증 짝: **표식 밖**에서 같은 크기로 막으면 `?` ────────────────────────────────
  const outside = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.resetPerfMarksForTest()
    b2.diag.blockMainForTest(300)
    await new Promise(res => setTimeout(res, 400))
    const st = b2.diag.perfStalls()
    return st.recent[st.recent.length - 1] ?? null
  })
  expect((outside as any)?.mark, '표식 밖의 멈춤은 ?로 적힌다(반증)').toBe('?')
  OUT.S1_driven = { names_n: MARKS.length, added_n: MARKS_ADDED.length, all_n: MARKS_ALL.length, driven, outside }
  expect(Object.values(driven).filter((d: any) => d.ok).length, '아홉 전부(지시문의 일곱 + 74가 더한 둘)').toBe(MARKS_ALL.length)
  expect(MARKS.length, '지시문의 일곱은 그대로다').toBe(PERF74_MARK_NAMES_N)

  // ── 자연 판: 부하 픽스처를 세우고 몸짓을 하면 일곱 중 무엇이 실제로 도는가(값) ──────
  const { built, text } = await buildFixtureText(page)
  OUT.S1_fixture = built
  await bootWith(page, 'perf=1')
  await page.evaluate(() => (window as any).__b2.diag.resetPerfMarksForTest())
  await applyFixture(page, text)
  await page.click('#btn-paint')
  await page.waitForTimeout(120)
  await page.mouse.move(600, 400); await page.mouse.down()
  await page.mouse.move(640, 410, { steps: 3 }); await page.mouse.up()
  await page.waitForTimeout(3000)
  const natural = await page.evaluate(() => ({
    marks: (window as any).__b2.diag.perfMarks().counts,
    stalls: (window as any).__b2.diag.perfStalls(),
  }))
  // 열 때의 둘(doc.parse · doc.build)은 **부팅 경로**에서만 돈다 — 저장된 문서를 그대로 다시 연다
  await page.goto('/?perf=1')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForTimeout(6000)
  const onOpen = await page.evaluate(() => ({
    marks: (window as any).__b2.diag.perfMarks().counts,
    stalls: (window as any).__b2.diag.perfStalls(),
    strokes: (window as any).__b2.app.doc.strokes.length,
  }))
  const ran = new Set([...Object.keys(natural.marks), ...Object.keys(onOpen.marks)])
  OUT.S1_natural = {
    gesture_marks: natural.marks, gesture_stalls: natural.stalls,
    open_marks: onOpen.marks, open_stalls: onOpen.stalls, open_strokes: onOpen.strokes,
    ran_names: [...ran].sort(),
    ran_n: [...ran].filter(n => (MARKS as readonly string[]).includes(n)).length,
    ran_n_all: [...ran].filter(n => (MARKS_ALL as readonly string[]).includes(n)).length,
    named_in_list: [...new Set([...natural.stalls.recent, ...onOpen.stalls.recent].map((s: any) => s.mark))].sort(),
    note: '「목록에 이름으로 나타난 것」은 그 표식이 문턱을 넘은 판에서만 난다 — tex.upload는 bake.commit 안에 겹쳐 있어 자연 판에서 겹침이 더 큰 바깥 이름이 이긴다. 그래서 §1의 게이트는 «구동 판 7/7 + 표식 밖 ?»이고, 자연 판은 값이다(NOTES 자백)',
  }
  expect([...ran].filter(n => (MARKS as readonly string[]).includes(n)).length, '일곱 중 실제로 돈 표식 수(값)').toBeGreaterThanOrEqual(5)
})

test('§2 세 팔 — 그냥 / ?nothumb=1 / ?nosave=1 (세 번씩)', async ({ page }) => {
  test.setTimeout(3_600_000)
  const { built, text } = await buildFixtureText(page)
  OUT.S2_fixture = { ...built, saveBytes: text.length }
  // ⚠⚠ ①은 **수리 전 거동**으로 돈다(반증 스위치 `setLegacyThumbForTest` — 저장마다 동기로 썸네일).
  //   §2가 실제로 잰 것이 그 판이고(§3-3은 그 뒤에 왔다), 이렇게 두어야 **지금 트리에서 다시 돌려도
  //   같은 값**이 난다(#47의 STALE 방지). 수리 «후»의 짝은 §3-3 전/후 절(`@S3_before_after`)이 든다.
  //   실측으로 둘이 같은 값을 낸다: 수리 전 트리의 ① 691.8ms ↔ 스위치 판 690.7ms.
  const ARMS: [string, string, boolean][] = [
    ['①그냥(수리 전 거동)', '', true], ['②nothumb', 'nothumb=1', false], ['③nosave', 'nosave=1', false]]
  // ⚠ **세 번씩 돈다**(#12 동작점 하나 ⛔ · #14 시드 변동폭). 두 실행이 실제로 순위를 뒤집었다 —
  //   그 사실이 이 절의 결론을 바꿨으므로 반복이 값의 일부다.
  const REPS = 3
  const reps: ArmOut74[][] = []
  for (let r = 0; r < REPS; r++) {
    const row: ArmOut74[] = []
    for (const [name, q, legacy] of ARMS) row.push(await runArm(page, name, q, text, legacy))
    reps.push(row)
  }
  const table: Record<string, unknown> = {}
  for (let a = 0; a < ARMS.length; a++) {
    const name = ARMS[a]![0]
    const runs = reps.map(r => r[a]!)
    table[name] = {
      query: ARMS[a]![1] || '(없음)', legacyThumb: ARMS[a]![2], flags: runs[0]!.flags,
      moved: runs.every(x => x.strokesAdded > 0), probe_proof: 'strokesAdded',
      strokesAdded: runs.map(x => x.strokesAdded),
      docStrokesBefore: runs.map(x => x.docStrokesBefore),
      // ── 멈춤(문턱 C.PERF_STALL_MS) — 실행마다 ─────────────────────────────────
      stall_n: runs.map(x => x.stalls.n),
      stall_maxMs: runs.map(x => Math.round(x.stalls.maxMs)),
      stall_sumMs: runs.map(x => Math.round(x.stalls.sumMs)),
      stall_thresholdMs: runs[0]!.stalls.thresholdMs,
      stall_by_mark: runs.map(x => x.stalls.recent.reduce((m: Record<string, number>, s) => { m[s.mark] = (m[s.mark] ?? 0) + 1; return m }, {} as Record<string, number>)),
      // ── 문턱 사다리 — 같은 자료를 여러 동작점에서(#12) ────────────────────────
      gap_thresholds: runs[0]!.gaps.thresholds,
      gap_n: runs.map(x => x.gaps.n),
      gap_n_sum: runs[0]!.gaps.thresholds.map((_, i) => runs.reduce((t, x) => t + x.gaps.n[i]!, 0)),
      gap_frames: runs.map(x => x.gaps.frames),
      gap_maxMs: runs.map(x => x.gaps.maxMs),
      // ── 표식(기계에 안 흔들리는 자: 호출 «수»와 그 합) ──────────────────────────
      marks: runs.map(x => x.marks),
      marks_sum_ms: runs.map(x => Object.fromEntries(Object.entries(x.marks).map(([k, v]) => [k, Math.round(v.ms * 10) / 10]))),
      saveBytes: runs.map(x => x.saveBytes), storedInDb: runs.map(x => x.stored), gestureMs: runs.map(x => x.gestureMs),
      thumbCalls: runs.map(x => x.thumbCalls),
      clearedBefore: runs.map(x => x.clearedBefore),
      recent_last: runs[REPS - 1]!.stalls.recent.slice(-6),
    }
  }
  OUT.S2_arms = table
  for (const row of reps) for (const a of row) expect(a.strokesAdded, a.arm + ' 프로브가 움직였다(#103)').toBeGreaterThan(0)
  const col = (a: number) => reps.map(r => r[a]!)
  const plain = col(0), nothumb = col(1), nosave = col(2)
  // 손잡이가 실제로 먹혔나 — 값으로(세 실행 전부)
  for (const x of nothumb) expect(x.marks['save.thumb'], '?nothumb=1 팔은 썸네일을 안 굽는다').toBeUndefined()
  for (const x of nosave) expect(x.marks['save.serialize'], '?nosave=1 팔은 저장을 안 한다').toBeUndefined()
  for (const x of plain) expect(x.marks['save.serialize']?.n ?? 0, '그냥 팔은 저장이 돌았다').toBeGreaterThan(0)
  // ⛳ **수리 전 빨강** — 그냥 팔에서 「멈춤 ≥ 2회」가 실제로 나오는가(CLOSING 「게이트의 조건」)
  OUT.S2_pre_red = {
    threshold: PERF74_STALL_MIN_PRE, plain_stall_n: plain.map(x => x.stalls.n),
    red: plain.every(x => x.stalls.n >= PERF74_STALL_MIN_PRE),
    red_any: plain.some(x => x.stalls.n >= PERF74_STALL_MIN_PRE),
    note: '안 나오면 자를 고친다 — 게이트를 통과시키고 넘어가지 않는다(CLOSING)',
  }
  // ── 지목 ─────────────────────────────────────────────────────────────────────
  const sum = (xs: ArmOut74[], f: (x: ArmOut74) => number) => xs.reduce((t, x) => t + f(x), 0)
  const sN = (xs: ArmOut74[]) => sum(xs, x => x.stalls.n)
  const spread = (xs: ArmOut74[]) => Math.max(...xs.map(x => x.stalls.n)) - Math.min(...xs.map(x => x.stalls.n))
  const saveMs = (xs: ArmOut74[]) => Math.round(sum(xs, x => ['save.serialize', 'save.put', 'save.thumb', 'list.read', 'list.render']
    .reduce((t, k) => t + (x.marks[k]?.ms ?? 0), 0)) / xs.length * 10) / 10
  const thumbMs = (xs: ArmOut74[]) => Math.round(sum(xs, x => x.marks['save.thumb']?.ms ?? 0) / xs.length * 10) / 10
  const noiseFloor = Math.max(spread(plain), spread(nothumb), spread(nosave))
  const sep = Math.max(sN(plain), sN(nothumb), sN(nosave)) - Math.min(sN(plain), sN(nothumb), sN(nosave))
  const separable = sep > noiseFloor * REPS
  OUT.S2_verdict = {
    stall_n_by_arm: { plain: plain.map(x => x.stalls.n), nothumb: nothumb.map(x => x.stalls.n), nosave: nosave.map(x => x.stalls.n) },
    stall_n_sum: { plain: sN(plain), nothumb: sN(nothumb), nosave: sN(nosave) },
    within_arm_spread_max: noiseFloor, between_arm_spread: sep, separable,
    save_chain_ms_per_gesture_mean: { plain: saveMs(plain), nothumb: saveMs(nothumb), nosave: saveMs(nosave) },
    thumb_ms_per_gesture_mean: { plain: thumbMs(plain), nothumb: thumbMs(nothumb), nosave: thumbMs(nosave) },
    save_calls: { plain: plain[0]!.marks['save.serialize']?.n ?? 0, nothumb: nothumb[0]!.marks['save.serialize']?.n ?? 0, nosave: 0 },
    rule: '멈춤이 nosave에서 사라진다 → 저장이 임자 / 썸네일만 꺼도 대부분 사라진다 → toDataURL이 임자 / 셋 다 비슷하다 → 가설 반증',
    verdict: separable
      ? (sN(nosave) < sN(plain) ? (sN(nothumb) <= sN(nosave) + noiseFloor ? '썸네일(toDataURL)이 임자' : '저장이 임자') : '가설 반증')
      : '이 기계에서는 「멈춤 ≥ 문턱」이 팔을 못 가른다 — 팔 안의 실행 사이 변동이 팔 사이의 차보다 크다. 지목은 기계에 안 흔들리는 자(표식의 호출 수와 ms 합)가 한다(CLOSING)',
  }
})

test('§3-3 전/후 — 같은 실행·같은 몸짓으로 수리 전 거동 ↔ 지금', async ({ page }) => {
  test.setTimeout(2_400_000)
  const { built, text } = await buildFixtureText(page)
  OUT.S3_fixture = { ...built, saveBytes: text.length }
  // ⚠ **같은 실행 안의 짝**이다(CLOSING) — 기계가 두 팔에 똑같이 걸리므로 비는 산다.
  //   수리 «전» 팔은 반증 스위치(`setLegacyThumbForTest`)가 만든다: 저장마다 동기로 굽는 그 거동.
  const REPS = 2
  const pre: ArmOut74[] = [], post: ArmOut74[] = []
  for (let r = 0; r < REPS; r++) {
    pre.push(await runArm(page, '수리 전(저장마다 썸네일)', '', text, true))
    post.push(await runArm(page, '지금(쉴 때·닫을 때만)', '', text, false))
  }
  const chain = (x: ArmOut74) => ['save.serialize', 'save.put', 'save.thumb', 'list.read', 'list.render']
    .reduce((t, k) => t + (x.marks[k]?.ms ?? 0), 0)
  const row = (xs: ArmOut74[]) => ({
    thumbCalls: xs.map(x => x.thumbCalls),
    thumbGapMs: xs.map(x => x.thumbGapMs), gestureMs: xs.map(x => x.gestureMs),
    thumbCallsCap: xs.map(x => Math.floor(x.gestureMs / Math.max(1, x.thumbGapMs)) + 1),
    saves: xs.map(x => x.marks['save.serialize']?.n ?? 0),
    thumb_marks: xs.map(x => x.marks['save.thumb']?.n ?? 0),
    thumb_ms: xs.map(x => Math.round((x.marks['save.thumb']?.ms ?? 0) * 10) / 10),
    save_chain_ms: xs.map(x => Math.round(chain(x) * 10) / 10),
    stall_n: xs.map(x => x.stalls.n), stall_sumMs: xs.map(x => Math.round(x.stalls.sumMs)),
    gap_n: xs.map(x => x.gaps.n), gap_thresholds: xs[0]!.gaps.thresholds,
    strokesAdded: xs.map(x => x.strokesAdded), storedInDb: xs.map(x => x.stored),
    saveBytes: xs.map(x => x.saveBytes),
  })
  const mean = (xs: ArmOut74[], f: (x: ArmOut74) => number) => Math.round(xs.reduce((t, x) => t + f(x), 0) / xs.length * 10) / 10
  OUT.S3_before_after = {
    pre: row(pre), post: row(post),
    save_chain_ms_mean: { pre: mean(pre, chain), post: mean(post, chain) },
    thumb_calls_mean: { pre: mean(pre, x => x.thumbCalls), post: mean(post, x => x.thumbCalls) },
    ratio_chain: Math.round(mean(post, chain) / Math.max(1e-9, mean(pre, chain)) * 1000) / 1000,
    note: '저장 «횟수»는 두 팔이 같다(10) — 바뀐 것은 그 한 번에 무엇이 드는가다. 시간의 절대값은 이 기계(SwiftShader)의 기록이고 판정은 «호출 수»(toDataURL)와 같은 실행 안의 «비»가 한다(CLOSING · #113)',
  }
  // ⛳ 게이트 — 호출 «수»(기계에 안 흔들리는 자)
  // 굽는 횟수의 상한은 **앱의 간격이 정한다**(D-C4 — 팔이 임계를 다시 안 적는다):
  //   몸짓 길이 ÷ `C.THUMB_IDLE_GAP_MS` + 1. 저장 «횟수»(10)와 무관해진 것이 §3-3의 뜻이다.
  for (const x of post) {
    const cap = Math.floor(x.gestureMs / Math.max(1, x.thumbGapMs)) + 1
    expect(x.thumbCalls, `지금 판: toDataURL ≤ 몸짓 ${x.gestureMs}ms ÷ 간격 ${x.thumbGapMs}ms + 1 = ${cap}`).toBeLessThanOrEqual(cap)
    expect(x.thumbCalls, '저장 횟수(10)보다 훨씬 적다').toBeLessThan(x.marks['save.serialize']?.n ?? 0)
  }
  for (const x of pre) expect(x.thumbCalls, '수리 전 거동: 저장마다 굽는다(빨강 짝)').toBeGreaterThanOrEqual(1)
  for (const x of [...pre, ...post]) expect(x.strokesAdded, '프로브가 움직였다(#103)').toBeGreaterThan(0)
  for (const x of [...pre, ...post]) expect(x.marks['save.serialize']?.n ?? 0, '저장은 두 팔 다 돈다').toBe(10)
})

test('§4 열기 — 세 몫(파싱 · 세우기 · 굽기)을 값으로', async ({ page }) => {
  test.setTimeout(1_200_000)
  const { built, text } = await buildFixtureText(page)
  OUT.S4_fixture = built
  // 저장소에 넣고 **부팅 경로로** 다시 연다(사람이 앱을 여는 그 길 — 팔이 제 길을 만들지 않는다 #88)
  await bootWith(page, 'perf=1')
  await applyFixture(page, text)
  await page.evaluate(() => (window as never as { __b2: { diag: { storeFlush: () => Promise<void> } } }).__b2.diag.storeFlush())
  await page.waitForTimeout(1200)
  await page.goto('/?perf=1')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForTimeout(12_000)   // 칠이 다 채워지고도 남을 창(굽기는 프레임에 나뉜다)
  const open = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const marks = b2.diag.perfMarks().counts
    const bake = b2.diag.paintBake()
    return {
      strokes: b2.app.doc.strokes.length, faces: b2.app.faces.length,
      parseMs: marks['doc.parse']?.ms ?? null, buildMs: marks['doc.build']?.ms ?? null,
      bakeMs: bake.ms, bakes: bake.bakes, bakedStrokes: bake.bakedStrokes, entries: bake.entries,
      uploads: bake.uploads, uploadBytes: bake.uploadBytes,
      firstFrameMs: b2.diag.perfHudForTest().openMs,
      loop: b2.diag.frameLoop(), stalls: b2.diag.perfStalls(), gaps: b2.diag.perfGaps(),
      gl: b2.diag.glInfo(), hud: b2.diag.perfHudForTest().text,
    }
  })
  const three = { parse: open.parseMs ?? 0, build: open.buildMs ?? 0, bake: open.bakeMs }
  const sum = three.parse + three.build + three.bake
  OUT.S4_open = {
    ...open, three_parts_ms: three, three_sum_ms: Math.round(sum * 10) / 10,
    share: { parse: Math.round(three.parse / sum * 1000) / 10, build: Math.round(three.build / sum * 1000) / 10, bake: Math.round(three.bake / sum * 1000) / 10 },
    note: '실기기 열기(5,333ms · 최장 차단 15,028ms)의 재측정은 **사람이 다시 녹화해야** 한다 — 이 값은 시험 기계(SwiftShader)의 기록이고 몫만 옮겨 읽는다(#113). §3-2(획 단위 저장)를 안 했으므로 파싱 몫은 그대로다',
  }
  expect(open.strokes, '부팅이 그 문서를 열었다(프로브가 움직였다 #103)').toBeGreaterThan(600)
  expect(sum, '세 몫이 값을 가진다').toBeGreaterThan(0)
})
