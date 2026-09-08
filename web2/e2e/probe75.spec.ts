// web2-75 §1-0 — **고치기 전의 표식**(D-1)과 구간 크기 스윕의 초안. 원장에 안 쓴다(stdout).
import { test } from '@playwright/test'
import { bootWith, buildFixtureText, applyFixture } from './heavy74'
import { settleBake } from './heavy72'
import { bakeWithSlicePts, drawLongStrokes, pointStats, warm75, texHash, screenHash, resetStats, bake75 } from './heavy75'

/* eslint-disable @typescript-eslint/no-explicit-any */
test('probe — 점 구간 스윕(짧은 획 대역 · 긴 획 대역) · 픽셀 항등', async ({ page }) => {
  test.setTimeout(600_000)
  await bootWith(page, '')
  const { text } = await buildFixtureText(page)
  await bootWith(page, '')
  await resetStats(page)
  await applyFixture(page, text)
  await settleBake(page, 800, 'probe/open')
  console.log('COLD', JSON.stringify({ ...(await bake75(page)), warm: await warm75(page), pts: await pointStats(page) }))

  // 긴 획을 얹는다(실기기 대역)
  await page.click('#btn-paint')
  await page.waitForTimeout(100)
  await page.evaluate(() => Object.assign((window as any).__b2.app.paintSel, { hex: '#7a4a3a', w: 22, o: 1 }))
  await drawLongStrokes(page, 4, 40)
  console.log('PTS', JSON.stringify(await pointStats(page)))

  const rows: any[] = []
  let ref: { tex: string; scr: number } | null = null
  for (const v of ['inf', 8, 4, 2, 1] as const) {
    const r = await bakeWithSlicePts(page, v as any, `sweep/${v}`)
    const texSig = JSON.stringify(r.tex.map(t => [t.key, t.hash, t.ink]))
    if (!ref) ref = { tex: texSig, scr: r.scr.hash }
    rows.push({ v, chunkPtsMax: r.bake.chunkPtsMax, sliceChunks: r.bake.sliceChunks, strokeMsMax: r.bake.strokeMsMax,
      commitMsMax: r.bake.commitMsMax, ms: r.bake.ms, uploads: r.bake.uploads, sameTex: texSig === ref.tex, sameScr: r.scr.hash === ref.scr })
  }
  console.log('SWEEP', JSON.stringify(rows))
  // 반증 — 구간마다 세션을 끊으면 그림이 갈려야 한다
  await page.evaluate(() => (window as any).__b2.diag.setPaintSliceBreakForTest(true))
  const brk = await bakeWithSlicePts(page, 2, 'sweep/break')
  console.log('BREAK', JSON.stringify({ sameTex: JSON.stringify(brk.tex.map(t => [t.key, t.hash, t.ink])) === ref!.tex, sameScr: brk.scr.hash === ref!.scr, chunkPtsMax: brk.bake.chunkPtsMax }))
  await page.evaluate(() => (window as any).__b2.diag.setPaintSliceBreakForTest(false))
})
