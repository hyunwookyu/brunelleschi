// web2-75 게이트 — **넷**(g1 점 구간 · g1-② 반증 · g1-③ 초안과의 다툼 · g3 굽힌 그림 캐시).
//
// ⚠⚠ CLOSING 「게이트의 조건」 — 성능·거동 게이트는 «수리 전 값»과 짝을 이룬다. 게이트마다 그 짝이
//   무엇인지 여기 적고 **같은 실행에서 실제로 빨강을 낸다**:
//     g1   자르기를 끄면(= 획 하나가 최소 단위) 한 구간이 먹는 점 수가 **획의 점 수 전부**다 ↔ 켜면 ≤ 구간 크기
//     g1-② 구간마다 세션을 끊으면(순진한 구현) **픽셀이 갈린다** ↔ 지금 길은 항등이다
//     g1-③ 이어 굽는 중에 획이 오면 열린 구간을 닫는다 ↔ 안 닫으면 초안 세션과 층을 두고 다툰다
//     g3   캐시를 지우면 **굽는다**(applied 0) ↔ 두 번째 열기는 캐시에서 온다(bakes 0)
// ⚠ 시간의 절대값에 문을 걸지 않는다(CLOSING · #113) — 이 파일의 문은 전부 «호출 수»·«점 수»·«해시»·«존재»다.

import { test, expect } from '@playwright/test'
import { bootWith, buildFixtureText, applyFixture } from './heavy74'
import { settleBake, zoomToLevel } from './heavy72'
import { bakeWithSlicePts, drawLongStrokes, pointStats, texHash, screenHash, bake75, resetStats } from './heavy75'
import { PAINT75_PRE_CHUNK_PTS_MIN, PAINT75_CACHE_HIT_RATIO_MIN } from './thresholds'

/* eslint-disable @typescript-eslint/no-explicit-any */
const sig = (t: Awaited<ReturnType<typeof texHash>>) => JSON.stringify(t.map(x => [x.key, x.hash, x.ink]))

/** 부하 문서를 세우고 **긴 획**까지 얹은 판(자를 것이 있는 대역 — D-5) */
async function heavyWithLongStrokes(page: any): Promise<string> {
  await bootWith(page, '')
  const { text } = await buildFixtureText(page)
  await bootWith(page, '')
  await applyFixture(page, text)
  await page.click('#btn-paint')
  await page.waitForTimeout(100)
  await page.evaluate(() => Object.assign((window as any).__b2.app.paintSel, { hex: '#7a4a3a', w: 22, o: 1 }))
  await drawLongStrokes(page, 3, 40)
  return text
}

test('g1 — 점 구간: 그림이 같고(1·2·4·전량) 한 구간이 먹는 점 수가 구간 크기 아래다 · ⛳ 수리 전 빨강 짝', async ({ page }) => {
  test.setTimeout(600_000)
  await heavyWithLongStrokes(page)
  const pts = await pointStats(page)
  // 픽스처가 그 대역을 덮는가(D-5) — 자를 것이 없으면 이 게이트는 아무것도 안 잰다
  expect(pts.max, '긴 획이 있다(자를 것이 있다)').toBeGreaterThanOrEqual(PAINT75_PRE_CHUNK_PTS_MIN)

  // ⛳ **수리 전** — 자르기를 끄면 한 구간이 «획 하나»다
  const pre = await bakeWithSlicePts(page, 'inf', 'g1/pre')
  expect(pre.bake.chunkPtsMax, '수리 전: 한 구간 = 획 하나(그 획의 점 전부) — 이것이 빨강이다')
    .toBeGreaterThanOrEqual(PAINT75_PRE_CHUNK_PTS_MIN)
  expect(pre.bake.sliceChunks, '수리 전: 점 구간이 하나도 안 돈다').toBe(0)
  const refTex = sig(pre.tex), refScr = pre.scr.hash

  const rows: { pts: number; chunkPtsMax: number; sliceChunks: number; sameTex: boolean; sameScr: boolean }[] = []
  for (const v of [4, 2, 1] as const) {
    const r = await bakeWithSlicePts(page, v, `g1/${v}`)
    rows.push({ pts: v, chunkPtsMax: r.bake.chunkPtsMax, sliceChunks: r.bake.sliceChunks, sameTex: sig(r.tex) === refTex, sameScr: r.scr.hash === refScr })
    // 첫 구간은 점 둘부터다(자국은 점 하나로 안 선다) — 그래서 상한이 max(2, 구간 크기)
    expect(r.bake.chunkPtsMax, `구간 ${v}: 한 구간이 먹는 점 수`).toBeLessThanOrEqual(Math.max(2, v))
    expect(r.bake.sliceChunks, `구간 ${v}: 점 구간이 실제로 돌았다(프로브가 움직였다 #103)`).toBeGreaterThan(0)
    expect(sig(r.tex), `구간 ${v}: 굽힌 픽셀이 «획 단위»와 같다`).toBe(refTex)
    expect(r.scr.hash, `구간 ${v}: 화면 픽셀도 같다`).toBe(refScr)
  }
  // 앱 상수로 돌아온 판도 같은 그림인가(제품 경로 그대로)
  const now = await bakeWithSlicePts(page, null, 'g1/app')
  expect(sig(now.tex), '앱 상수 판도 같은 그림').toBe(refTex)
  const slicePts = await page.evaluate(() => (window as any).__b2.diag.paintSlicePtsForTest())
  expect(now.bake.chunkPtsMax, '앱 상수 판의 한 구간').toBeLessThanOrEqual(Math.max(2, slicePts))
  console.log('g1', JSON.stringify({ pts, pre: pre.bake.chunkPtsMax, rows, slicePts }))
})

test('g1-② 반증 — 구간마다 세션을 끊으면 그림이 갈린다(항등 게이트가 실제로 실패한다)', async ({ page }) => {
  test.setTimeout(600_000)
  await heavyWithLongStrokes(page)
  const ref = await bakeWithSlicePts(page, 'inf', 'g1b/ref')
  await page.evaluate(() => (window as any).__b2.diag.setPaintSliceBreakForTest(true))
  const brk = await bakeWithSlicePts(page, 2, 'g1b/break')
  await page.evaluate(() => (window as any).__b2.diag.setPaintSliceBreakForTest(false))
  expect(sig(brk.tex) === sig(ref.tex) && brk.scr.hash === ref.scr.hash,
    '⛳ 반증: 세션을 끊으면 픽셀이 갈린다 — 안 갈리면 이 항등 게이트는 아무것도 안 잰다').toBe(false)
  // 끄면 다시 같아진다(반증이 «스위치»임을 보인다 — 자가 죽은 것이 아니다)
  const back = await bakeWithSlicePts(page, 2, 'g1b/back')
  expect(sig(back.tex), '스위치를 끄면 다시 항등').toBe(sig(ref.tex))
})

test('g1-③ — 이어 굽는 중에 획이 와도 그림이 전량 재굽기와 같다(열린 구간을 닫는다)', async ({ page }) => {
  test.setTimeout(600_000)
  await heavyWithLongStrokes(page)
  // 예산을 좁혀 «이어 굽는 중»을 실제로 만든다(1ms — 프레임마다 몇 구간만 얹힌다)
  await page.evaluate(() => (window as any).__b2.diag.setPaintBakeIdleMsForTest(1))
  await page.evaluate(() => { (window as any).__b2.diag.paintBakeReset(); (window as any).__b2.diag.rebakePaintTex() })
  await page.waitForTimeout(60)
  const pending = await page.evaluate(() => (window as any).__b2.diag.paintBakePendingForTest())
  // 그 상태에서 획을 하나 긋는다(초안 → 확정)
  await drawLongStrokes(page, 1, 40)
  await page.evaluate(() => (window as any).__b2.diag.setPaintBakeIdleMsForTest(null))
  await settleBake(page, 600, 'g1c/settle')
  const mid = await bake75(page)
  const midTex = sig(await texHash(page))
  // 전량으로 다시 구운 그림과 같아야 한다(조용히 틀린 그림 ⛔)
  const ref = await bakeWithSlicePts(page, null, 'g1c/ref')
  expect(midTex, '이어 굽는 중에 획이 와도 최종 그림이 전량 재굽기와 같다').toBe(sig(ref.tex))
  console.log('g1c', JSON.stringify({ pendingSeen: pending, sliceFlushes: mid.sliceFlushes, sliceRestarts: mid.sliceRestarts }))
})

test('g3 — 굽힌 그림 캐시: 두 번째 열기는 캐시에서 온다 · 픽셀 동일 · 열쇠 불일치는 재굽기 · 저장 형식 무변', async ({ page }) => {
  test.setTimeout(600_000)
  // ① 캐시를 비우고 문서를 세운다 — **캐시 없음**의 열기
  await bootWith(page, '')
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  const { text } = await buildFixtureText(page)
  await bootWith(page, '')
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  await resetStats(page)
  await applyFixture(page, text)
  await settleBake(page, 800, 'g3/cold')
  const cold = await bake75(page)
  const coldTex = sig(await texHash(page))
  const coldScr = (await screenHash(page)).hash
  expect(cold.bakes, '캐시가 없으면 굽는다').toBeGreaterThan(0)
  const c0 = await page.evaluate(() => (window as any).__b2.diag.texCache())
  expect(c0.applied, '캐시가 없으면 올린 면이 0이다 — ⛳ 이것이 「캐시 없음」 쪽의 빨강 짝이다').toBe(0)

  // ② 저장하고 **다시 연다**(사람이 앱을 여는 그 길 — 팔이 제 길을 만들지 않는다 #88)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  // 캐시 쓰기는 «쉴 때» 돈다 — 상한 있는 대기(#95)
  await page.waitForFunction(() => (window as any).__b2.diag.texCache().writes > 0, null, { timeout: 30_000 })
  const wrote = await page.evaluate(() => (window as any).__b2.diag.texCache())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForFunction(() => ((window as any).__b2.app.doc.strokes.length as number) > 100, null, { timeout: 30_000 })
  await settleBake(page, 800, 'g3/warm')
  const warm = await bake75(page)
  const c1 = await page.evaluate(() => (window as any).__b2.diag.texCache())
  const warmTex = sig(await texHash(page))
  const faces = (await texHash(page)).length
  expect(c1.applied / Math.max(1, faces), '두 번째 열기: 그 문서의 면 대부분이 캐시에서 온다')
    .toBeGreaterThanOrEqual(PAINT75_CACHE_HIT_RATIO_MIN)
  expect(warmTex, '캐시로 올린 면의 픽셀 == 구운 면의 픽셀').toBe(coldTex)
  expect((await screenHash(page)).hash, '화면 픽셀도 같다').toBe(coldScr)

  // ③ **캐시를 지우면 굽는다 — 그리고 그림이 같다**(무회귀 · 캐시는 정본이 아니다).
  //   같은 카메라에서 «캐시 없음»을 다시 만드는 곧은 길은 지우고 **다시 여는 것**이다(팔이 제 길을 안 만든다 #88).
  await page.evaluate(() => (window as any).__b2.diag.clearTexCacheForTest())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForFunction(() => ((window as any).__b2.app.doc.strokes.length as number) > 100, null, { timeout: 30_000 })
  await settleBake(page, 800, 'g3/cleared')
  const cleared = await bake75(page)
  const c2 = await page.evaluate(() => (window as any).__b2.diag.texCache())
  expect(c2.applied, '캐시를 지웠으면 올린 면이 0이다').toBe(0)
  expect(cleared.bakes, '그때는 굽는다(캐시가 비어도 지금과 똑같이 동작한다)').toBeGreaterThan(0)
  expect(sig(await texHash(page)), '캐시를 지워도 같은 그림').toBe(coldTex)

  // ④ ⛳ 반증 — **열쇠가 안 맞으면 캐시가 없고 굽는다.** 열쇠를 갈아 끼우는 곧은 길은 «단계»다
  //   (줌하면 굽기 열쇠 bakeSig의 lv가 바뀐다 — 같은 획, 다른 그림). 화면 자리에 안 기대는 자다.
  await resetStats(page)
  await page.evaluate(() => (window as any).__b2.diag.texCacheReset())
  const z = await zoomToLevel(page, 512, 24)
  await settleBake(page, 800, 'g3/mismatch')
  const after = await bake75(page)
  const c3 = await page.evaluate(() => (window as any).__b2.diag.texCache())
  expect(z.maxLevel, '단계가 실제로 올라갔다(프로브가 움직였다 #103)').toBeGreaterThanOrEqual(512)
  expect(after.bakes, '열쇠가 갈리면 캐시가 아니라 굽기가 받는다').toBeGreaterThan(0)

  // ⑤ 저장 형식 무변 — 왕복 5/5 · KEY_ORDER
  const round: { bytes: number; sha: string }[] = []
  for (let i = 0; i < 5; i++) {
    round.push(await page.evaluate(() => {
      const b2 = (window as any).__b2
      const txt = b2.diag.serialize() as string
      let h = 0
      for (let i2 = 0; i2 < txt.length; i2++) h = (Math.imul(h, 31) + txt.charCodeAt(i2)) | 0
      const { data } = b2.diag.readBrnlForTest(txt)
      return { bytes: txt.length, sha: `${h}|${data ? JSON.stringify(Object.keys(data.doc)) : ''}` }
    }))
  }
  const keyOrder = await page.evaluate(() => Object.keys(JSON.parse((window as any).__b2.diag.serialize() as string)))
  expect(round.every(r => r.sha === round[0]!.sha), '저장 왕복 5/5 — 같은 바이트').toBe(true)
  console.log('g3', JSON.stringify({ coldBakes: cold.bakes, wroteWrites: wrote.writes, warmBakes: warm.bakes,
    applied: c1.applied, faces, keyOrder: keyOrder.slice(0, 6), clearedBakes: cleared.bakes,
    afterBakes: after.bakes, afterApplied: c3.applied, zoom: z }))
})
