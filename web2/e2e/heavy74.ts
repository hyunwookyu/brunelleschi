// web2-74 §2 — **세 팔의 자**. 같은 문서 · 같은 몸짓으로 세 번 돌린다: 그냥 / `?nothumb=1` / `?nosave=1`.
//
// 재는 것은 **멈춤**이다(횟수 · 최장 · 합). 73의 자(fps · p95 · 최장 차단)는 실기기에서 못 쓰는 자였다 —
// 프레임은 충분한데 «가끔 몇 초씩 통째로 멎는» 것이 사람이 본 것이고, CLOSING의 「자동 시험의 fps는
// 게이트가 아니다」도 그 자리를 비워 뒀다(기계에 안 흔들리는 자: 호출 수 · 바이트 · **멈춤 횟수**).
//
// ⚠ 픽스처는 heavy72의 것을 **한 번만** 세우고 그 저장물(문자열)을 세 팔에 그대로 먹인다 —
//   팔마다 다시 그리면 문서가 미묘하게 달라지고 그러면 「같은 문서」가 아니다(#16 분모).
// ⚠⚠ 팔마다 저장소를 **실제로** 비우고 시작한다. ⚠ `?reset`은 캐시·워커만 버리고 **그림은 안
//   건드린다**(main.ts 탈출구 주석이 정본) — 첫 판은 그것으로 비운 줄 알았고 그래서 ③nosave 팔이
//   앞 팔의 문서를 열고 있었다(`storedInDb: true`가 그 표식이었다). `diag.store.clearForTest()`가
//   그 자리다(앱의 deleteDoc — 팔이 제 경로를 만들지 않는다 #88).
// ⚠⚠⚠ 재기 시작하는 자리는 **굽기가 다 끝난 뒤**다(#89) — 픽스처를 앉히며 난 멈춤을 몸짓의
//   값으로 읽지 않는다. `resetPerfMarksForTest()`가 그 경계다.

import { expect, type Page } from '@playwright/test'
import { buildHeavy, settleBake, type Heavy } from './heavy72'

export interface StallStat { n: number; maxMs: number; sumMs: number; thresholdMs: number; recent: { t: number; ms: number; mark: string }[] }
export interface ArmOut74 {
  arm: string
  query: string
  /** 프로브가 «움직였다»는 증명(CLOSING ㉠) — 이 몸짓이 실제로 획을 더했나 */
  strokesAdded: number
  docStrokesBefore: number
  docStrokesAfter: number
  /** 저장이 실제로 돌았나 — 팔의 «끔»이 먹혔는지 값으로 본다 */
  marks: Record<string, { n: number; ms: number; maxMs: number }>
  /** 이 팔을 열기 «전»에 저장소에서 지운 문서 수(앞 팔의 잔재) */
  clearedBefore: number
  /** §3-3 — 이 팔에서 `toDataURL`이 몇 번 불렸나(게이트의 자) */
  thumbCalls: number
  legacyThumb: boolean
  /** 앱의 «쉴 때 굽기» 간격(D-C4 — 임계를 팔이 다시 안 적는다) */
  thumbGapMs: number
  saveBytes: number | null
  stored: boolean
  stalls: StallStat
  /** 프레임 간격의 문턱 사다리 — 「멈춤 몇 회」를 한 동작점으로 안 주장한다(#12) */
  gaps: { thresholds: number[]; n: number[]; sumMs: number[]; frames: number; sumAllMs: number; maxMs: number }
  /** 몸짓에 든 벽시계(ms) — 팔 사이의 짝 비교용 */
  gestureMs: number
  flags: { nosave: boolean; nothumb: boolean }
}

/** `?reset`으로 저장소를 비우고 나서 원하는 매개로 다시 연다.
 *  ⚠ `?reset`은 **비동기로 `location.replace`**를 부른다(72의 그 함정) — 매개가 떨어지기를 먼저 기다린다. */
/** 마지막 boot에서 지운 문서 수 — 팔이 「앞 팔의 것이 안 남았다」를 값으로 든다 */
export let clearedDocs = 0
export async function bootWith(page: Page, query: string): Promise<void> {
  await page.goto('/?reset')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  // 저장소를 실제로 비운다(값으로 — 몇 개를 지웠나)
  clearedDocs = await page.evaluate(() => (window as never as { __b2: { diag: { store: { clearForTest: () => Promise<number> } } } }).__b2.diag.store.clearForTest())
  await page.goto(query ? `/?${query}` : '/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as never as { __b2: { diag: { tipsReadyForTest: () => { ready: boolean } } } }).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
}

/** 픽스처를 한 번 세우고 **저장물 원문**을 낸다 — 세 팔이 이 문자열 하나를 먹는다. */
export async function buildFixtureText(page: Page, perFace = 40): Promise<{ built: Heavy; text: string }> {
  const built = await buildHeavy(page, perFace)
  const text = await page.evaluate(() => (window as never as { __b2: { diag: { serialize: () => string } } }).__b2.diag.serialize())
  expect(text.length, '픽스처 저장물이 섰다(#103)').toBeGreaterThan(10_000)
  return { built, text }
}

/** 픽스처를 지금 판에 앉힌다(열기 경로 그대로 — readBrnl → applyDoc) */
export async function applyFixture(page: Page, text: string): Promise<void> {
  const ok = await page.evaluate((t) => {
    const b2 = (window as never as { __b2: { diag: Record<string, (...a: never[]) => unknown> } }).__b2
    const r = (b2.diag.readBrnlForTest as (s: string) => { data: unknown })(t)
    if (!r.data) return false
    ;(b2.diag.applyDoc as (d: unknown) => void)(r.data)
    ;(b2.diag.invalidate as () => void)()
    return true
  }, text)
  expect(ok, '픽스처를 앉혔다').toBe(true)
  await settleBake(page, 1200, 'applyFixture74')
}

/** 칠 한 붓 — 면 위 짧은 획(pointer · 제품 경로 그대로 · heavy72의 그 몸짓과 같은 꼴) */
async function paintStroke(page: Page, x0: number, y0: number, len = 34): Promise<void> {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + len * 0.5, y0 + 5, { steps: 2 })
  await page.mouse.move(x0 + len, y0 + 9, { steps: 2 })
  await page.mouse.up()
}

/** 세 팔이 **똑같이** 하는 몸짓 — 칠 한 붓 → 손을 뗀다 → `pauseMs` 쉰다. 그것을 `n`번.
 *  자동 저장은 «손을 뗀 뒤 400ms»에 도는 사건이므로 쉬는 시간이 그 창을 넘어야 저장이 실제로 돈다
 *  (넘지 않으면 저장이 한 번으로 병합돼 「손을 뗀 뒤 멎는다」를 재현 못 한다 — D-2). */
export const GESTURE = { n: 10, pauseMs: 900, spots: [
  [560, 380], [640, 380], [720, 380], [800, 380], [560, 450],
  [640, 450], [720, 450], [800, 450], [560, 520], [640, 520],
] as [number, number][] }

export async function runArm(page: Page, arm: string, query: string, text: string, legacyThumb = false): Promise<ArmOut74> {
  await bootWith(page, query)
  const cleared = clearedDocs
  // §3-3의 «수리 전 거동» 팔 — 같은 실행·같은 몸짓의 짝(CLOSING: 기계가 두 팔에 똑같이 걸린다)
  if (legacyThumb) await page.evaluate(() => (window as never as { __b2: { diag: { setLegacyThumbForTest: (v: boolean) => void } } }).__b2.diag.setLegacyThumbForTest(true))
  await applyFixture(page, text)
  await page.click('#btn-paint')
  await page.waitForTimeout(120)
  await page.evaluate(() => {
    const b2 = (window as never as { __b2: { app: { paintSel: Record<string, unknown> } } }).__b2
    Object.assign(b2.app.paintSel, { hex: '#7a4a3a', w: 14, o: 1 })
  })
  await settleBake(page, 400, `arm/${arm}/before`)
  const before = await page.evaluate(() => (window as never as { __b2: { app: { doc: { strokes: unknown[] } } } }).__b2.app.doc.strokes.length)
  // `toDataURL` 계수기는 전역 누적이라 **몸짓 구간의 차**로 읽는다
  const thumbCalls0 = await page.evaluate(() => (window as never as { __b2: { diag: { thumbCallsForTest: () => number } } }).__b2.diag.thumbCallsForTest())
  // ── 여기서부터가 «몸짓»이다 — 앞의 것(앉히기·굽기)은 값에 안 든다(#89) ────────────
  await page.evaluate(() => (window as never as { __b2: { diag: { resetPerfMarksForTest: () => void } } }).__b2.diag.resetPerfMarksForTest())
  const t0 = Date.now()
  for (let i = 0; i < GESTURE.n; i++) {
    const [x, y] = GESTURE.spots[i % GESTURE.spots.length]!
    await paintStroke(page, x, y)
    await page.waitForTimeout(GESTURE.pauseMs)
  }
  await page.waitForTimeout(1200)   // 마지막 저장이 끝날 창
  const gestureMs = Date.now() - t0
  const out = await page.evaluate(() => {
    const b2 = (window as never as { __b2: { app: { doc: { strokes: unknown[] } }; diag: Record<string, (...a: never[]) => unknown> } }).__b2
    const lastSave = (b2.diag.autosaveLast as () => { bytes: number } | null)()
    return {
      after: b2.app.doc.strokes.length,
      marks: (b2.diag.perfMarks as () => { counts: Record<string, { n: number; ms: number; maxMs: number }> })().counts,
      stalls: (b2.diag.perfStalls as () => StallStat)(),
      gaps: (b2.diag.perfGaps as () => ArmOut74['gaps'])(),
      flags: (b2.diag.saveFlagsForTest as () => { nosave: boolean; nothumb: boolean })(),
      saveBytes: lastSave ? lastSave.bytes : null,
      thumbCalls: (b2.diag.thumbCallsForTest as () => number)(),
      thumbGapMs: ((b2.diag.thumbStateForTest as () => { gapMs: number } | null)()?.gapMs) ?? 0,
    }
  })
  const stored = await page.evaluate(async () => {
    const b2 = (window as never as { __b2: { diag: Record<string, (...a: never[]) => unknown> } }).__b2
    const d = await (b2.diag.storeDump as () => Promise<{ data: string | null } | null>)()
    return !!(d && d.data)
  }).catch(() => false)
  return {
    arm, query, docStrokesBefore: before, docStrokesAfter: out.after, strokesAdded: out.after - before,
    marks: out.marks, stalls: out.stalls, gaps: out.gaps, flags: out.flags, saveBytes: out.saveBytes, stored, gestureMs,
    clearedBefore: cleared, thumbCalls: out.thumbCalls - thumbCalls0, legacyThumb, thumbGapMs: out.thumbGapMs,
  }
}
