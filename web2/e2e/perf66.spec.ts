// web2-66 — **그리는 중(draft)의 계측**(D-2 수리 전 판 + 수리 후 대조).
//
// 지시 66 §1 「⚠ 착수 전 — D-2로 값을 먼저 낸다」의 다섯을 그대로 잰다:
//   (a) 프레임 시간(ms)                 획 길이(점 20·100·400)에 비례하는가
//   (b) 프레임마다 «그린 도장 수»        새 도장만인가, 전부인가
//   (c) ⛳ 프레임 n → n+1에서 «이미 그려진» 도장의 위치 이동량(px)
//   (d) 업로드 바이트                   전체인가 부분인가
//   (e) 그리는 중 draft bbox 자국       확정 칠 픽셀이 그리는 중 변하는가(화면에서)
//
// 자의 자리: `diag.paintDraftFrames()`(render3d 초안 계수기 — 프레임 ms·덧그린 획·업로드
// 바이트)와 `diag.lastDabLogForTest()`(엔진 표면의 도장 (x,y,r) 기록 — 되돌리기 «전»에
// 뜬다 #107). **정본은 «도장 수·이동량»이다**(기기·부하 무관). ms는 곁값·배수만(#12 · #14).
//
// 원장: `stage0/out/perf66_web2_dpr{1,2}.json` — 수리 «전» 판은 `PRE66=1`로 돌려
// `perf66_pre_web2_dpr{1,2}.json`에 **동결**한다(perf65_pre의 선례).
//   수리 전:  LEDGER=1 PRE66=1 node tools/e2e.mjs ledger e2e/perf66.spec.ts --project=dpr1
//   수리 후:  LEDGER=1 node tools/e2e.mjs ledger e2e/perf66.spec.ts --project=dpr1
//
// ⚠ 계측 스펙이다(MEASURE_SPECS 자동 분류 — stage0/out에 쓴다). 게이트는 `paint66.spec.ts`다.
// ⚠ D-5 — 픽스처는 **원근 벽**이다(paint50의 bigBox 오른쪽 벽): 굵기 환산(worldPerPxPerp)이
//   그리는 중 실제로 움직이는 자리다. 정면 판만 재면 (c)가 0으로 나와 결함을 놓친다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRE = process.env.PRE66 === '1'
const OUT: Record<string, unknown> = {
  what: 'web2-66 — 그리는 중(draft) 계측(D-2): (a) 프레임 ms (b) 프레임당 도장 수 (c) 이미 그려진 도장의 이동량 (d) 업로드 바이트 (e) bbox 자국',
  tree: PRE ? '수리 전(pre — 동결)' : '수리 후(post)',
  note_pitfalls: '#12·#14(점 하나·ms로 주장하지 않는다 — 정본은 도장 수·이동량, ms는 구간 평균·배수만) · #99(워커 1) · #101(web2 안에서) · #103(같은 장면 두 번 확인 — 놓인 획 수) · #107(자는 되돌리기 전에 뜬다) · #110(전량 되그리기 = 입력 하나에 전부를 다시 만드는 그 형태)',
  note_meter: '자는 diag.paintDraftFrames()(render3d 초안 계수기)와 diag.lastDabLogForTest()(엔진 표면 도장 기록) — 앱이 실제로 도는 그 경로다(#54). 이동량 계산만 스펙(노드)에서 한다',
  scene: 'paint50의 bigBox(오른쪽 벽 · 축척 2500 · 원근) · 연필 슬롯 · 합성 펜 압력 0.5 상수',
  no_constants_snapshot: true,
  constants_used: { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31·paint50의 no_constants_snapshot이 정본)' },
  pitfall_citations: [12, 14, 47, 99, 101, 103, 107, 110],
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/perf66${PRE ? '_pre' : ''}_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1,
      canonical: `LEDGER=1 ${PRE ? 'PRE66=1 ' : ''}node tools/e2e.mjs ledger e2e/perf66.spec.ts (워커 1 — #99)` },
    ...OUT,
  }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** paint50·perf65의 그 상자 — 오른쪽 벽 하나(원근). */
async function bigBox(page: Page) {
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
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

async function pickPaint(page: Page, i = 'pencil', w = 18, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 벽 안 서펜타인 점렬 — n점. 벽 화면 사각 (500,700)(900,610)(900,330)(500,330)의 안쪽
 *  (x 540..860 · y 360..560 — 칠 패널(왼쪽)과 모서리를 피한다). 걸음 ~3px. */
function serpentine(n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  const X0 = 545, X1 = 855, ROW = 26
  let x = X0, y = 380, dir = 1
  for (let i = 0; i < n; i++) {
    pts.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
    x += dir * 3
    if (x > X1) { x = X1; y += ROW; dir = -1 }
    else if (x < X0) { x = X0; y += ROW; dir = 1 }
    if (y > 560) y = 560
  }
  return pts
}

interface Burst { move: number; dabs: number; pos: number[] }
interface DraftRun {
  perMove: { ms: number; dabs: number; uploadBytes: number }[]
  bursts: Burst[]
  stat: Record<string, number>
  strokes: number
}

/** 한 붓을 «그리는 중» 상태로 계측한다 — 전부 페이지 안에서(왕복 없음 · rAF 두 번씩 기다려
 *  프레임이 실제로 그려진 «뒤» 잰다). burstAt의 이동에서는 도장 (x,y) 전체를 뜬다(연속 두
 *  프레임 — 이동량의 짝). 끝에 뗀다(pointerup). */
async function draftProbe(page: Page, pts: { x: number; y: number }[], burstAt: number[]): Promise<DraftRun> {
  return await page.evaluate(async ([list, bursts]) => {
    const L = list as { x: number; y: number }[]
    const BA = new Set(bursts as number[])
    const b2 = (window as any).__b2
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    b2.diag.setDabLogForTest(true)
    b2.diag.paintDraftFramesReset()
    const perMove: { ms: number; dabs: number; uploadBytes: number }[] = []
    const out: { move: number; dabs: number; pos: number[] }[] = []
    fire('pointerdown', L[0]!.x, L[0]!.y, 0.5, 1)
    await raf()
    let prevBytes = 0
    for (let i = 1; i < L.length; i++) {
      fire('pointermove', L[i]!.x, L[i]!.y, 0.5, 1)
      await raf()
      const st = b2.diag.paintDraftFrames()
      const log = b2.diag.lastDabLogForTest() as number[]
      perMove.push({ ms: st.lastMs, dabs: log.length / 3, uploadBytes: st.uploadBytes - prevBytes })
      prevBytes = st.uploadBytes
      if (BA.has(i) || BA.has(i - 1)) out.push({ move: i, dabs: log.length / 3, pos: Array.from(log) })
    }
    const stat = b2.diag.paintDraftFrames()
    const strokes = b2.app.paintDraft?.length ?? 0
    fire('pointerup', L[L.length - 1]!.x, L[L.length - 1]!.y, 0, 0)
    b2.diag.setDabLogForTest(false)
    await raf()
    return { perMove, bursts: out, stat, strokes }
  }, [pts, burstAt] as unknown[]) as DraftRun
}

const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)
const r2 = (v: number): number => Math.round(v * 100) / 100

/** (c)의 자 — 연속 두 프레임의 도장 기록에서 «앞 프레임에 이미 있던» 도장의 이동량(px).
 *  앞 프레임 도장 수 m의 앞 80%를 «확정 구간»으로 본다(마지막 몫은 펜 떼기 이벤트의 꼬리 —
 *  게이트 ①의 확정 구간(점 n-2까지)과 같은 뜻의 근사). 전체(0..m)의 값도 함께 낸다. */
function movement(a: Burst, b: Burst): Record<string, unknown> | null {
  if (b.move !== a.move + 1) return null
  const m = Math.min(a.dabs, b.dabs)
  const upTo = (k: number) => {
    let mx = 0, sum = 0, moved = 0
    for (let i = 0; i < k; i++) {
      const dx = b.pos[i * 3]! - a.pos[i * 3]!, dy = b.pos[i * 3 + 1]! - a.pos[i * 3 + 1]!
      const d = Math.hypot(dx, dy)
      if (d > 0.01) moved++
      if (d > mx) mx = d
      sum += d
    }
    return { max: r2(mx), mean: r2(sum / Math.max(1, k)), moved, of: k }
  }
  return {
    frames: [a.move, b.move], dabs: [a.dabs, b.dabs],
    confirmed80: upTo(Math.floor(m * 0.8)),
    all_prev: upTo(m),
  }
}

test('(a)(b)(c)(d) 그리는 중 — 점 20·100·400', async ({ page }) => {
  test.setTimeout(900_000)
  await bigBox(page)
  await pickPaint(page)
  const rows: Record<string, unknown>[] = []
  for (const n of [20, 100, 400]) {
    const pts = serpentine(n)
    const bursts = [Math.floor(n * 0.4), Math.floor(n * 0.7), n - 2].filter(v => v >= 2 && v < n)
    const run = await draftProbe(page, pts, bursts)
    const ms = run.perMove.map(p => p.ms)
    const dabs = run.perMove.map(p => p.dabs)
    const bytes = run.perMove.map(p => p.uploadBytes)
    const pairs: Record<string, unknown>[] = []
    for (let i = 0; i + 1 < run.bursts.length; i++) {
      const mv = movement(run.bursts[i]!, run.bursts[i + 1]!)
      if (mv) pairs.push(mv)
    }
    rows.push({
      n, moves: run.perMove.length, draft_strokes: run.strokes,
      a_frame_ms: {
        head6: r2(mean(ms.slice(0, 6))), mid6: r2(mean(ms.slice(Math.floor(ms.length / 2) - 3, Math.floor(ms.length / 2) + 3))),
        tail6: r2(mean(ms.slice(-6))), max: r2(Math.max(...ms)),
      },
      b_dabs_per_frame: {
        note: '자 둘(같은 기록의 두 읽기): log_len = lastDabLog 길이 — pre(전량 되그리기)에서는 «그 프레임에 그린 수»(전부)이고 post(세션)에서는 «누적»이다 · delta = 연속 이동의 길이 증가 — post에서 «그 프레임에 그린 수»(새 도장만). pre의 그린 수는 log_len, post의 그린 수는 delta로 읽는다',
        log_len: { head6: r2(mean(dabs.slice(0, 6))), tail6: r2(mean(dabs.slice(-6))), last: dabs[dabs.length - 1] },
        delta: (() => {
          const dl = dabs.map((v, i) => i === 0 ? v : v - dabs[i - 1]!)
          return { head6: r2(mean(dl.slice(0, 6))), tail6: r2(mean(dl.slice(-6))), max: Math.max(...dl.slice(1)) }
        })(),
      },
      c_movement: pairs,
      d_upload_bytes_per_frame: { head6: Math.round(mean(bytes.slice(0, 6))), tail6: Math.round(mean(bytes.slice(-6))) },
      total: { ms_sum: r2(ms.reduce((x, y) => x + y, 0)), frames: run.stat.frames, upload_bytes: run.stat.uploadBytes, full_uploads: run.stat.fullUploads, rebuilds: run.stat.rebuilds ?? 0 },
    })
    // 뗀 획이 실제로 남았다(#103 — 장면 확인)
    const painted = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
    expect(painted).toBeGreaterThan(0)
  }
  OUT.abc = rows
})

// (e) draft bbox 자국의 픽셀 자는 **paint66.spec ④**가 들었다(게이트 — dpr2 목록에 드는 스펙은
// 계측(MEASURE_SPECS)과 겹칠 수 없다 · dpr2list54). 수리 «전» (e) 값은 이 스펙의 초판이
// 잰 것이 `perf66_pre_web2_dpr{1,2}.json`의 `e_bbox`에 **동결**돼 있다(pre 트리에서 실측 —
// dpr1: 변한 채널 3,078 · 최대 28).

test('(리뷰어 H2·H3·H5) 재구축이 도는 cp · 도장 8.5배의 새 마커 · 표집 대가 — #111 판별을 그 셋에 댄다', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  // ── [H3] 새 마커(brunelleschi/marker — 도장 밀도 8.5배)로 §1의 자를 다시 댄다 ──────────
  await pickPaint(page, 'marker', 18, '#4a6b8a')
  {
    const pts = serpentine(400)
    const run = await draftProbe(page, pts, [Math.floor(400 * 0.5), 398])
    const ms = run.perMove.map(p => p.ms)
    const pairs: Record<string, unknown>[] = []
    for (let i = 0; i + 1 < run.bursts.length; i++) {
      const mv = movement(run.bursts[i]!, run.bursts[i + 1]!)
      if (mv) pairs.push(mv)
    }
    await page.evaluate(() => { (window as any).__b2.diag.paintBakeReset() })
    // 커밋 쪽 — 같은 도구로 짧은 획 하나(perf65 paintStroke의 그 몸짓)
    await page.mouse.move(560, 600); await page.mouse.down()
    await page.mouse.move(600, 610, { steps: 6 }); await page.mouse.up()
    await page.waitForTimeout(250)
    const bk = await page.evaluate(() => (window as any).__b2.diag.paintBake() as { ms: number; appendStrokes: number; handoverStrokes: number; bakes: number })
    OUT.h3_marker = {
      note: '[H3] §2가 마커 도장을 119 → 1,006/획으로 올렸다 — §1의 자(프레임 ms·이동량)를 새 마커로. 커밋 ms는 같은 도구의 짧은 획(펜 떼기 완결 몫)',
      n: 400, frame_ms: { head6: r2(mean(ms.slice(0, 6))), tail6: r2(mean(ms.slice(-6))), max: r2(Math.max(...ms)) },
      movement: pairs, total: run.stat,
      commit_short_stroke: { ms: r2(bk.ms), handed: bk.handoverStrokes, appended: bk.appendStrokes, bakes: bk.bakes },
    }
  }
  await page.click('#btn-undo'); await page.waitForTimeout(150)
  await page.click('#btn-undo'); await page.waitForTimeout(150)
  // ── [H2] cp(압력 램프 — 문턱 눈금이 움직여 재구축이 실제로 돈다)의 «확정 구간 이동량» ────
  await pickPaint(page, 'cp', 18, '#5a4a3a')
  {
    const res = await page.evaluate(async () => {
      const b2 = (window as any).__b2
      const el = document.getElementById('ink')!
      const r = el.getBoundingClientRect()
      const raf = () => new Promise<void>(res2 => requestAnimationFrame(() => requestAnimationFrame(() => res2())))
      const N = 120
      const pt = (i: number) => ({ x: 545 + (i / (N - 1)) * 300, y: 420 + (i / (N - 1)) * 30 })
      const pr = (i: number) => 0.2 + (i / (N - 1)) * 0.7          // 오르는 압력 — 달리는 평균이 눈금을 넘는다
      const fire = (type: string, p: { x: number; y: number }, press: number, buttons: number) =>
        el.dispatchEvent(new PointerEvent(type, {
          pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
          pressure: press, clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true,
        }))
      b2.diag.setDabLogForTest(true)
      b2.diag.paintDraftFramesReset()
      fire('pointerdown', pt(0), pr(0), 1)
      let logMid: number[] = []
      for (let i = 1; i < N; i++) {
        fire('pointermove', pt(i), pr(i), 1)
        if (i % 6 === 0) await raf()
        if (i === Math.floor(N * 0.5)) { await raf(); logMid = [...(b2.diag.lastDabLogForTest() as number[])] }
      }
      await raf()
      const logEnd = [...(b2.diag.lastDabLogForTest() as number[])]
      const st = b2.diag.paintDraftFrames()
      fire('pointerup', pt(N - 1), 0, 0)
      b2.diag.setDabLogForTest(false)
      await raf()
      return { logMid, logEnd, rebuilds: st.rebuilds, fullUploads: st.fullUploads }
    })
    // 재구축이 «실제로» 돌았는가(#103) — 안 돌았으면 이 팔은 아무것도 안 잰다(D-3)
    expect(res.rebuilds, 'cp 램프에서 재구축이 실제로 돌았다').toBeGreaterThan(0)
    const m = Math.floor((res.logMid.length / 3) * 0.8)
    let mx = 0, moved = 0
    for (let i = 0; i < m; i++) {
      const d = Math.hypot(res.logEnd[i * 3]! - res.logMid[i * 3]!, res.logEnd[i * 3 + 1]! - res.logMid[i * 3 + 1]!)
      if (d > 0.01) moved++
      if (d > mx) mx = d
    }
    OUT.h2_cp_rebuild = {
      note: '[H2] 재구축(cp 문턱 눈금 이동 — 층 되세움 + 전량 재먹임)을 «지나는» 획의 확정 구간 이동량. 재먹임은 같은 점·같은 시드·같은 굵기라 위치가 같아야 한다(문턱은 결 판만 바꾼다 — DECISIONS의 그 단언을 값으로)',
      rebuilds: res.rebuilds, full_uploads: res.fullUploads,
      confirmed80: { of: m, moved, max_px: r2(mx) },
    }
    expect(mx, 'cp 재구축을 지나도 확정 구간 이동량 0').toBe(0)
    await page.click('#btn-undo'); await page.waitForTimeout(150)
  }
  // ── [H5] 표집 대가 — 이 픽스처 획의 «시작 걸음 환산 vs 끝 걸음 환산» 비(원근 벽) ──────────
  {
    const ratio = await page.evaluate(() => {
      const b2 = (window as any).__b2
      const rf = b2.app.faces[0]
      const wpp = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        // worldPerPxPerp와 같은 식을 진단으로 — 시작·끝 두 자리의 환산을 견준다
        return b2.diag.worldPerPxPerpForTest ? b2.diag.worldPerPxPerpForTest(rf.id, a, b) : null
      }
      return { start: wpp({ x: 545, y: 380 }, { x: 548, y: 380 }), end: wpp({ x: 852, y: 560 }, { x: 855, y: 560 }) }
    })
    OUT.h5_sampling_cost = {
      note: '[H5] 굵기 표집을 «첫 걸음»으로 옮긴 대가 — 획 전체가 시작점의 환산을 쓴다. 이 픽스처(서펜타인 · 원근 벽)의 시작↔끝 환산 비가 그 오차의 상한이다. 종전(첫→끝 중점)도 상수 하나였으므로 «획 안에서 굵기가 변하지 않는» 것은 같다 — 바뀐 것은 상수의 표집 자리다. 옛 문서는 저장된 세계 굵기(paint.w)를 그대로 쓰므로 여는 순간 자국이 안 바뀐다',
      wpp_start: ratio.start, wpp_end: ratio.end,
      end_over_start: ratio.start && ratio.end ? r2(ratio.end / ratio.start) : null,
    }
  }
})

test('(⑦) 도구별 도장 간격 — 값만 낸다(판정은 사람 · 지시 ⑦)', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  const rows: Record<string, unknown>[] = []
  for (const tool of ['pencil', 'brush', 'marker', 'cp'] as const) {
    for (const spacingK of [1, 0.5]) {
      await pickPaint(page, tool)
      await page.evaluate(([t, k]) => {
        const b2 = (window as any).__b2
        if ((k as number) !== 1) b2.diag.setPaintParamForTest(t, 'spacingK', k)
      }, [tool, spacingK] as const)
      await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(true))
      await page.mouse.move(545, 420); await page.mouse.down()
      await page.mouse.move(700, 435, { steps: 12 })
      await page.mouse.move(850, 450, { steps: 12 })
      await page.mouse.up(); await page.waitForTimeout(150)
      const log = await page.evaluate(() => [...(window as any).__b2.diag.lastDabLogForTest()] as number[])
      await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(false))
      await page.evaluate((t) => { (window as any).__b2.diag.resetPaintTuneForTest(t) }, tool)
      await page.click('#btn-undo'); await page.waitForTimeout(200)
      const gaps: number[] = []
      for (let i = 3; i < log.length; i += 3) {
        gaps.push(Math.hypot(log[i]! - log[i - 3]!, log[i + 1]! - log[i - 2]!))
      }
      gaps.sort((a, b) => a - b)
      const med = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0
      const rMed = (() => {
        const rs = []
        for (let i = 2; i < log.length; i += 3) rs.push(log[i]!)
        rs.sort((a, b) => a - b)
        return rs.length ? rs[Math.floor(rs.length / 2)]! : 0
      })()
      rows.push({ tool, spacingK, dabs: log.length / 3, gap_px_median: r2(med), dab_radius_median: r2(rMed),
        gap_over_radius: rMed > 0 ? r2(med / rMed) : null })
    }
  }
  OUT.g7_spacing = {
    note: '지시 ⑦ — 도구별 «실측 간격»(연속 도장 중심 거리의 중앙값 · 텍스처 px)과 반지름 대비 비. spacingK 0.5 = 촘촘한 판(사진 66-spacing.png과 짝). ⚠ 값은 사람이 판정한다 — 세션이 최종으로 정하지 않는다(실기기 항목)',
    rows,
  }
})
