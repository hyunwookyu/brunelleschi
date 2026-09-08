// web2-75 — 이 라운드의 공용 픽스처·자(게이트 gates75와 계측 perf75가 **같은 것**을 쓴다 · #54).
//
// D-5 — **픽스처가 실사용 대역을 덮는가**: 74·72의 픽스처는 획 하나가 점 **5개**다(마우스 걸음 2).
// 실기기(120Hz · Wacom)의 한 획은 점 수백 개다. 그래서 이 라운드는 **긴 획**을 따로 세운다
// (마우스 걸음 40×2 = 점 수십). 짧은 획 대역(74 픽스처)과 긴 획 대역을 **둘 다** 잰다.

import { expect, type Page } from '@playwright/test'
import { settleBake, settleStat } from './heavy72'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 굽힌 텍스처의 픽셀 해시(앱과 같은 함수 — #88) */
export const texHash = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as
  { key: string; level: number; hash: number; ink: number; w: number; h: number }[])

/** 화면(#gl) 픽셀의 해시 — 부분 업로드의 결함은 여기서만 보인다(65 ①의 자 그대로) */
export const screenHash = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('gl') as HTMLCanvasElement
  const t = document.createElement('canvas')
  t.width = c.width; t.height = c.height
  t.getContext('2d')!.drawImage(c, 0, 0)
  const d = t.getContext('2d')!.getImageData(0, 0, t.width, t.height).data
  let h = 0, ink = 0
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]! + d[i + 1]! + d[i + 2]!
    if (d[i + 3]! > 0 && v < 690) ink++
    h = (Math.imul(h, 31) + v + d[i + 3]!) | 0
  }
  return { hash: h, ink }
})

export interface Bake75 {
  bakes: number; bakedStrokes: number; sliced: number; sliceChunks: number; chunkPtsMax: number
  sliceRestarts: number; sliceFlushes: number; sliceFlushMs: number
  strokeMsMax: number; strokePtsMax: number; commitMsMax: number; commitPtsMax: number
  bgMs: number; bgMsMax: number; ms: number; uploads: number; uploadBytes: number
}
export const bake75 = (page: Page) => page.evaluate(() => {
  const b = (window as any).__b2.diag.paintBake()
  const r = (n: number) => Math.round(n * 10) / 10
  return { bakes: b.bakes, bakedStrokes: b.bakedStrokes, sliced: b.sliced, sliceChunks: b.sliceChunks, chunkPtsMax: b.chunkPtsMax,
    sliceRestarts: b.sliceRestarts, sliceFlushes: b.sliceFlushes, sliceFlushMs: r(b.sliceFlushMs),
    strokeMsMax: r(b.strokeMsMax), strokePtsMax: b.strokePtsMax, commitMsMax: r(b.commitMsMax), commitPtsMax: b.commitPtsMax,
    bgMs: r(b.bgMs), bgMsMax: r(b.bgMsMax), ms: r(b.ms), uploads: b.uploads, uploadBytes: b.uploadBytes } as Bake75
}) as Promise<Bake75>

/** 준비(보정·팁 눈금 판) 비용 — §1-0이 가른 그 자리 */
export const warm75 = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintWarm() as
  { calibMs: number; calibCalls: number; calibMaxMs: number; tipScaleMs: number; tipScaleBuilds: number; calibKeys: number })

export const resetStats = (page: Page) => page.evaluate(() => {
  (window as any).__b2.diag.paintBakeReset(); (window as any).__b2.diag.paintWarmReset(); (window as any).__b2.diag.resetPerfMarksForTest()
})

/** 굽기를 **전량으로** 다시 돌린다 — 자르기 설정이 바뀐 뒤의 «같은 그림»을 다시 만든다.
 *  ⚠⚠ **다 구워지기를 기다리는 상한이 이 자의 일부다**(75 · 실제로 한 번 걸렸다): 단계를 올리고 구간을 1점으로
 *  잘게 썰면 한 판이 20초를 넘고, 기본 상한(90초)에 닿으면 «덜 구워진 그림»을 해시하게 된다 — 그러면 항등
 *  게이트가 «그림이 갈렸다»는 **틀린 빨강**을 낸다(원장의 `settle_timeouts`가 그 사실을 말했다 · #105).
 *  그래서 상한을 부르는 쪽이 정하고, **닿았으면 그 사실을 값으로** 돌려준다. */
export async function rebake(page: Page, stage = '', capMs = 90_000): Promise<boolean> {
  await page.evaluate(() => { (window as any).__b2.diag.rebakePaintTex() })
  await page.waitForTimeout(120)
  await page.waitForTimeout(400)
  try {
    await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: capMs })
    return true
  } catch {
    settleStat.timeouts++
    settleStat.lastStage = stage || 'rebake75'
    return false
  }
}

/** 구간 크기를 놓고 다시 굽는다(전량 = Infinity → «획 하나가 최소 단위» = 수리 전 거동) */
export async function bakeWithSlicePts(page: Page, pts: number | 'inf' | null, stage = '', capMs = 90_000): Promise<{ bake: Bake75; tex: Awaited<ReturnType<typeof texHash>>; scr: Awaited<ReturnType<typeof screenHash>>; settled: boolean }> {
  // 'inf' = «획 하나가 최소 단위»(수리 전 거동) — Infinity는 evaluate 인자로 못 넘어간다(JSON)
  await page.evaluate((v) => (window as any).__b2.diag.setPaintSlicePtsForTest(v === 'inf' ? Infinity : v), pts as number | 'inf' | null)
  await resetStats(page)
  const settled = await rebake(page, stage, capMs)
  return { bake: await bake75(page), tex: await texHash(page), scr: await screenHash(page), settled }
}

/** **긴 획**을 몇 개 긋는다(실기기 대역 — 점 수십). 칠 도구가 이미 골라져 있어야 한다. */
export async function drawLongStrokes(page: Page, n = 4, steps = 40): Promise<number> {
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  for (let i = 0; i < n; i++) {
    const y = 370 + i * 55
    await page.mouse.move(520, y)
    await page.mouse.down()
    await page.mouse.move(700, y + 25, { steps })
    await page.mouse.move(880, y + 8, { steps })
    await page.mouse.up()
    await page.waitForTimeout(320)
  }
  await settleBake(page, 500, 'drawLong75')
  const after = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 프로브가 «움직였다»는 증명(CLOSING 「게이트의 조건」) — 0이면 그 실행의 숫자는 버린다
  expect(after - before, '긴 획이 실제로 더해졌다(#103)').toBeGreaterThanOrEqual(n)
  return after - before
}

/** 그 문서 획들의 점 수 — 픽스처가 어느 대역인지 값으로 (D-5) */
export const pointStats = (page: Page) => page.evaluate(() => {
  const ns = (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint?.uv).map((s: any) => s.paint.uv.length / 2)
  ns.sort((a: number, b: number) => a - b)
  return { n: ns.length, min: ns[0] ?? 0, med: ns[ns.length >> 1] ?? 0, max: ns[ns.length - 1] ?? 0 }
})

// ── §3 — **열기**를 잰다(캐시 없음 ↔ 있음). 72의 openProbe와 같은 자리를 재되 «칠 몫 대조군»은 안 만든다
//    (그것은 72·73이 이미 냈다) — 여기서 새로 필요한 것은 **캐시가 열기를 얼마나 줄이는가** 하나다.
export interface Open75 {
  /** 첫 프레임이 나올 때까지(ms) — 사람이 «화면이 떴다»고 느끼는 자리 */ firstInteractiveMs: number
  /** 보이는 (면,쪽)이 전부 서고 이어 굽기가 끝날 때까지(ms) — «칠이 다 채워졌다» */ allPaintMs: number
  /** 그 동안 longtask가 잰 최장 차단(ms · 없는 브라우저면 0) */ longestBlockMs: number
  parseMs: number; applyMs: number; bakeMs: number
  bakes: number; bakedStrokes: number; uploads: number
  cache: { asks: number; hits: number; misses: number; applied: number; writes: number; waitedFrames: number; errors: number }
  stalls: { n: number; maxMs: number; sumMs: number }
  strokes: number
  faces: number
}

/** 지금 저장된 문서를 **다시 연다**(사람이 앱을 여는 그 길) — 그 열기의 몫을 값으로. */
export async function openProbe75(page: Page, tag: string): Promise<Open75> {
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(300)
  await page.addInitScript(() => {
    const w = window as any
    w.__p75 = { t0: performance.now(), long: 0, interactive: 0, allPaint: 0 }
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__p75.long = Math.max(w.__p75.long, e.duration) })
        .observe({ entryTypes: ['longtask'] })
    } catch { /* longtask 미지원 — 값이 0이면 그 뜻이다(#105) */ }
  })
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2, null, { timeout: 30_000 })
  await page.evaluate(async () => {
    const w = window as any
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    w.__p75.interactive = performance.now() - w.__p75.t0
  })
  // ⚠ «보이는 것이 다 구워졌나»로 재면 안 된다(#105) — 아직 안 구운 자리는 visible이 거짓이라
  //   첫 프레임부터 참이 된다. 72의 그 자 그대로: **서야 할 자리가 전부 서고** 이어 굽기가 없을 때.
  await page.waitForFunction(() => {
    const w = window as any
    const b2 = w.__b2
    const es = b2.diag.paintTex() as { gateSide: boolean | null; level: number; w: number }[]
    if (es.length === 0) return false
    const want = es.filter(e => e.gateSide !== false)
    if (want.length === 0) return false
    const ok = want.every(e => e.level > 0 && e.w > 0) && !b2.diag.paintBakePendingForTest()
    if (ok && w.__p75.allPaint === 0) w.__p75.allPaint = performance.now() - w.__p75.t0
    return ok
  }, null, { timeout: 240_000 })
  return await page.evaluate((tg) => {
    const w = window as any
    const b2 = w.__b2
    const bk = b2.diag.paintBake()
    const bc = b2.diag.bootCost()
    const st = b2.diag.perfStalls()
    const c = b2.diag.texCache()
    void tg
    return {
      firstInteractiveMs: Math.round(w.__p75.interactive),
      allPaintMs: Math.round(w.__p75.allPaint),
      longestBlockMs: Math.round(w.__p75.long),
      parseMs: bc.parseMs, applyMs: bc.applyMs, bakeMs: Math.round(bk.ms),
      bakes: bk.bakes, bakedStrokes: bk.bakedStrokes, uploads: bk.uploads,
      cache: { asks: c.asks, hits: c.hits, misses: c.misses, applied: c.applied, writes: c.writes, waitedFrames: c.waitedFrames, errors: c.errors },
      stalls: { n: st.n, maxMs: Math.round(st.maxMs), sumMs: Math.round(st.sumMs) },
      strokes: b2.app.doc.strokes.length,
      faces: (b2.diag.paintTex() as unknown[]).length,
    } as Open75
  }, tag)
}

/** 몸짓 — 칠 열 붓, 붓마다 쉰다(74의 그 몸짓과 같은 꼴 · #16 분모). 멈춤·굽기를 몸짓 창에서만 센다. */
export async function gesture75(page: Page, n = 8, pauseMs = 500): Promise<{ added: number; stalls: { n: number; maxMs: number }; gaps: { thresholds: number[]; n: number[] }; bake: Bake75; marks: Record<string, { n: number; ms: number; maxMs: number }> }> {
  const spots: [number, number][] = [[560, 380], [640, 380], [720, 380], [800, 380], [560, 450], [640, 450], [720, 450], [800, 450]]
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await resetStats(page)
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[i % spots.length]!
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 18, y + 6, { steps: 12 })
    await page.mouse.move(x + 36, y + 12, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(pauseMs)
  }
  const after = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const out = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const st = b2.diag.perfStalls()
    const g = b2.diag.perfGaps()
    return { stalls: { n: st.n, maxMs: Math.round(st.maxMs) }, gaps: { thresholds: g.thresholds, n: g.n }, marks: b2.diag.perfMarks().counts }
  })
  return { added: after - before, ...out, bake: await bake75(page) }
}
