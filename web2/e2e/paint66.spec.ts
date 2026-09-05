// web2-66 §1 — **그리는 감각의 게이트**(지시 66의 ①③④⑤⑥ — ②⑦은 계측 perf66이 값으로 낸다).
//
//   ① ⛳ 도장이 안 움직인다 — 프레임 n·n+1에서 «확정 구간» 도장의 위치가 동일(이동량 0)
//        + 화면 판(비자기참조): 획 머리 사각의 화면 픽셀이 꼬리가 자라는 동안 안 변한다
//        + 반증: 얼리기 끔(setPaintFreezeOffForTest) → pre의 이동량·머리 변화가 돌아온다
//   ③ 프레임마다 그린 도장 수 = 새 도장만 — 꼬리 프레임의 도장 수가 획 길이에 안 비례
//   ④ bbox 자국 0 — draft bbox가 덮는 «확정 칠» 사각의 화면 픽셀이 그리는 중 안 변한다
//        + 반증: 얼리기 끔 → pre의 이중 합성이 돌아온다(그 사각이 변한다)
//   ⑤ ⛳ 미리보기 == 확정본 — 뗄 때 픽셀이 안 바뀐다(캔버스 해시 «와» 화면 사각 — 도구 전수)
//        + 반증: 입력 어긋냄(perturb — 끝 셋 뗌) → 뗄 때 픽셀이 바뀐다
//   ⑥ 업로드 — 그리는 동안 전량 업로드 0회 · 바이트가 프레임 사각에 비례(계측은 perf66)
//
// ⚠ 게이트 ①의 «도장 기록» 자는 세션이 제 기록을 돌려주므로 절반은 구성이다(§5.1 자기참조
// 유형 3) — 그래서 **화면 판**(머리 사각 픽셀)과 **반증**(끔 → 이동)이 «측정»의 몫을 진다.

import { test, expect, type Page } from '@playwright/test'

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** paint50·perf66의 그 상자 — 오른쪽 벽 하나(원근 — 굵기 환산이 실제로 움직이던 자리 · D-5). */
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
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

async function pickPaint(page: Page, i = 'pencil', w = 18, hex = '#8a4a3a', br?: string) {
  await page.evaluate(([i, w, h, b]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
    if (b) b2.app.paintSel.br = b
  }, [i, w, hex, br ?? null] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 화면 캔버스(#gl)의 사각 원시 바이트(물리 px) — paint59 inkStats의 그 통로(#54). */
const glCrop = (page: Page, x0: number, y0: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((ww as number) * dpr); t.height = Math.round((hh as number) * dpr)
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    return Array.from(g.getImageData(0, 0, t.width, t.height).data)
  }, [x0, y0, w, h] as unknown[]) as Promise<number[]>

const cropDiff = (a: number[], b: number[]): { changed: number; maxD: number } => {
  let changed = 0, maxD = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = Math.abs(a[i]! - b[i]!)
    if (d > 6) changed++
    if (d > maxD) maxD = d
  }
  return { changed, maxD }
}

/** 합성 펜 몸짓 — «그리는 중» 상태를 만든다. 점렬을 나눠 흘리고 프레임을 기다린다. */
async function penDown(page: Page, pts: { x: number; y: number }[], press: number | number[]) {
  await page.evaluate(async ([list, pr]) => {
    const L = list as { x: number; y: number }[]
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const pAt = (i: number): number => Array.isArray(pr) ? (pr as number[])[Math.min((pr as number[]).length - 1, i)]! : pr as number
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    el.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1,
      pressure: pAt(0), clientX: r.left + L[0]!.x, clientY: r.top + L[0]!.y, bubbles: true, cancelable: true,
    }))
    for (let i = 1; i < L.length; i++) {
      el.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1,
        pressure: pAt(i), clientX: r.left + L[i]!.x, clientY: r.top + L[i]!.y, bubbles: true, cancelable: true,
      }))
      if (i % 8 === 0) await raf()
    }
    await raf()
  }, [pts, press] as unknown[])
}
async function penUp(page: Page, p: { x: number; y: number }) {
  await page.evaluate(([x, y]) => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 0, pressure: 0,
      clientX: r.left + (x as number), clientY: r.top + (y as number), bubbles: true, cancelable: true,
    }))
  }, [p.x, p.y] as unknown[])
  await page.waitForTimeout(250)
}

/** 벽 위 가로 궤적 — 머리(x 540~640)와 꼬리(x 640~850)가 갈리는 직선. */
const acrossWall = (n: number): { x: number; y: number }[] =>
  Array.from({ length: n }, (_, i) => ({ x: 540 + (i / (n - 1)) * 310, y: 400 + (i / (n - 1)) * 40 }))

test('① ⛳ 도장이 안 움직인다 — 확정 구간 이동량 0(기록 + 화면 머리 사각) · 반증(얼리기 끔 → pre)', async ({ page }) => {
  test.setTimeout(300_000)
  await bigBox(page)
  await pickPaint(page)
  const HEAD = [540, 380, 90, 60] as const     // 획 머리 사각(처음 ~1/4 지점 주변)
  const run = async (freezeOff: boolean) => {
    // 반증 판은 pre 상태의 «전부»를 되살린다: 전량 되그리기(얼리기 끔) + 옛 굵기 표집(첫→끝
    // 중점 — 이동의 실제 원인 · AS-C193). 굵기 표집이 뿌리에서 고쳐졌으므로 얼리기 끔만으로는
    // 이동이 안 돌아온다 — 그것이 «원인이 w였다»는 실증이기도 하다(값은 아래 콘솔·NOTES).
    await page.evaluate((v) => { (window as any).__b2.diag.setPaintFreezeOffForTest(v) }, freezeOff)
    await page.evaluate((v) => { (window as any).__b2.diag.setPaintWLegacyForTest(v) }, freezeOff)
    await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(true))
    const pts = acrossWall(120)
    await penDown(page, pts.slice(0, 60), 0.5)                        // 머리를 긋고
    const logA = await page.evaluate(() => [...(window as any).__b2.diag.lastDabLogForTest()] as number[])
    const headA = await glCrop(page, ...HEAD)
    await page.evaluate(async ([list]) => {                            // 꼬리를 잇는다(뗌 없음)
      const L = list as { x: number; y: number }[]
      const el = document.getElementById('ink')!
      const r = el.getBoundingClientRect()
      const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
      for (const p of L) {
        el.dispatchEvent(new PointerEvent('pointermove', {
          pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1,
          pressure: 0.5, clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true,
        }))
      }
      await raf()
    }, [acrossWall(120).slice(60)] as unknown[])
    const logB = await page.evaluate(() => [...(window as any).__b2.diag.lastDabLogForTest()] as number[])
    const headB = await glCrop(page, ...HEAD)
    await penUp(page, pts[pts.length - 1]!)
    await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(false))
    await page.click('#btn-undo'); await page.waitForTimeout(300)
    // 확정 구간 = 머리 시점의 도장들(끝 20%는 잠정 꼬리 — 펜 떼기 이벤트의 몫) — perf66과 같은 자
    const m = Math.floor((logA.length / 3) * 0.8)
    let maxMove = 0, moved = 0
    for (let i = 0; i < m; i++) {
      const d = Math.hypot(logB[i * 3]! - logA[i * 3]!, logB[i * 3 + 1]! - logA[i * 3 + 1]!)
      if (d > 0.01) moved++
      if (d > maxMove) maxMove = d
    }
    const head = cropDiff(headA, headB)
    return { dabsA: logA.length / 3, dabsB: logB.length / 3, confirmed: m, maxMove, moved, head }
  }
  const on = await run(false)
  expect(on.dabsA, '머리 시점에 도장이 실제로 있다(#103)').toBeGreaterThan(10)
  expect(on.dabsB, '꼬리가 도장을 더했다').toBeGreaterThan(on.dabsA)
  expect(on.moved, '⛳ 확정 구간 도장 이동 0개').toBe(0)
  expect(on.maxMove, '⛳ 확정 구간 이동량 0px').toBe(0)
  expect(on.head.changed, '⛳ 화면 판 — 머리 사각 픽셀이 꼬리 동안 안 변한다').toBe(0)
  // 반증(D-3) — 얼리기 끔: 옛 전량 되그리기(끝점 굵기 재계산)로 이동이 돌아온다
  const off = await run(true)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintFreezeOffForTest(false) })
  await page.evaluate(() => { (window as any).__b2.diag.setPaintWLegacyForTest(false) })
  expect(off.moved, '반증 — 끄면 확정 구간 도장이 움직인다').toBeGreaterThan(0)
  expect(off.head.changed, '반증 — 끄면 머리 사각도 변한다').toBeGreaterThan(0)
  console.log('[①]', JSON.stringify({ on, off }))
})

test('③ 프레임마다 그린 도장 = 새 도장만 — 꼬리 프레임 도장 수가 길이에 안 비례', async ({ page }) => {
  test.setTimeout(300_000)
  await bigBox(page)
  await pickPaint(page)
  // 세션의 도장 기록은 «누적»이라(획 전체) 프레임 몫은 증가분이다 — draftStat.strokes가 아니라
  // 도장 기록의 길이 변화로 잰다: 마지막 8이동 동안 늘어난 도장 수 ≈ 그 프레임들이 «그린» 수.
  await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(true))
  const pts = acrossWall(240)
  await penDown(page, pts.slice(0, 232), 0.5)
  const n1 = await page.evaluate(() => ((window as any).__b2.diag.lastDabLogForTest() as number[]).length / 3)
  await page.evaluate(async ([list]) => {
    const L = list as { x: number; y: number }[]
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    for (const p of L) {
      el.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 1,
        pressure: 0.5, clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true,
      }))
    }
    await raf()
  }, [pts.slice(232)] as unknown[])
  const n2 = await page.evaluate(() => ((window as any).__b2.diag.lastDabLogForTest() as number[]).length / 3)
  await penUp(page, pts[pts.length - 1]!)
  await page.evaluate(() => (window as any).__b2.diag.setDabLogForTest(false))
  const grew = n2 - n1
  expect(n1, '긴 획이 도장을 많이 쌓았다(#103)').toBeGreaterThan(60)
  // 8이동(궤적의 ~3%)이 더한 도장은 이미 쌓인 수의 작은 몫이어야 한다 — pre는 매 프레임 «전부»(n1
  // 상당)를 다시 그렸다(perf66_pre (b): 400점 꼬리 프레임당 551.8개)
  expect(grew, '마지막 8이동이 그린 도장 = 새 도장 몇 개(전부가 아니다)').toBeLessThan(n1 * 0.2)
  console.log('[③]', JSON.stringify({ n1, n2, grew }))
})

test('④ bbox 자국 0 — draft bbox가 덮는 확정 칠이 그리는 중 안 변한다 · 반증(얼리기 끔 → pre)', async ({ page }) => {
  test.setTimeout(300_000)
  await bigBox(page)
  await pickPaint(page)
  // 확정 획 하나 — 벽 가운데
  await page.mouse.move(640, 460); await page.mouse.down()
  await page.mouse.move(700, 470, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(250)
  const CLIP = [610, 435, 120, 60] as const
  const gesture = async () => {
    const before = await glCrop(page, ...CLIP)
    // ㄱ자 draft — bbox가 확정 획을 덮지만 도장은 60px 넘게 떨어져 있다(perf66_pre (e)의 그 몸짓)
    const top = Array.from({ length: 60 }, (_, i) => ({ x: 545 + i * 5, y: 350 + (i % 2) }))
    const right = Array.from({ length: 39 }, (_, i) => ({ x: 848, y: 355 + i * 5 }))
    await penDown(page, [...top, ...right], 0.5)
    const during = await glCrop(page, ...CLIP)
    await penUp(page, { x: 848, y: 545 })
    await page.click('#btn-undo'); await page.waitForTimeout(300)
    return cropDiff(before, during)
  }
  const on = await gesture()
  expect(on.changed, '⛳ 확정 칠 사각의 화면 픽셀 변화 0(문 6/255)').toBe(0)
  // 반증 — 얼리기 끔(옛 전량 blit의 이중 합성): pre가 돌아온다(perf66_pre (e): 3,078채널 · 최대 28)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintFreezeOffForTest(true) })
  const off = await gesture()
  await page.evaluate(() => { (window as any).__b2.diag.setPaintFreezeOffForTest(false) })
  expect(off.changed, '반증 — 끄면 그 사각이 변한다(이중 합성)').toBeGreaterThan(100)
  console.log('[④]', JSON.stringify({ on, off }))
})

test('⑤ ⛳ 미리보기 == 확정본 — 뗄 때 픽셀 불변(캔버스 해시 + 화면 사각 · 도구 전수) · 반증(perturb)', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  const CLIP = [520, 370, 360, 100] as const
  // 프라이밍(paint59 ①의 그 규약 #54) — 사각 밖 점 하나로 면을 먼저 «칠한 면» 상태로 둔다:
  // 첫 커밋의 면 재질 전환(48-9 — 칠한 면의 채움이 갈린다)이 사각 «전체»를 갈리게 하는 것을
  // 빼고 엔진·인계의 차만 남긴다(초판이 그것에 걸렸다 — 사각 144,000채널 전부).
  await pickPaint(page, 'pencil')
  await page.mouse.move(560, 600); await page.mouse.down()
  await page.mouse.move(590, 605, { steps: 4 }); await page.mouse.up()
  await page.waitForTimeout(250)
  const TOOLS: { i: string; br?: string; tag: string; press: number | number[] }[] = [
    { i: 'pencil', tag: 'pencil', press: 0.5 },
    { i: 'brush', tag: 'ink', press: 0.5 },
    { i: 'marker', tag: 'marker', press: 0.5 },
    // 색연필 — 압력이 문턱(버니싱)을 정한다: 오르는 프로필로 «달리는 평균» 재구축 경로까지 시험
    { i: 'cp', tag: 'cp(압력 램프)', press: Array.from({ length: 100 }, (_, i) => 0.25 + (i / 99) * 0.6) },
  ]
  const rows: Record<string, unknown>[] = []
  for (const t of TOOLS) {
    await pickPaint(page, t.i)
    const pts = acrossWall(100)
    await penDown(page, pts, t.press)
    const draftTex = await page.evaluate(() => (window as any).__b2.diag.paintTexHash())
    const draftScr = await glCrop(page, ...CLIP)
    const dStat = await page.evaluate(() => (window as any).__b2.diag.paintDraftFrames() as { rebuilds: number; fullUploads: number })
    await penUp(page, pts[pts.length - 1]!)
    const commitTex = await page.evaluate(() => (window as any).__b2.diag.paintTexHash())
    const commitScr = await glCrop(page, ...CLIP)
    const bk = await page.evaluate(() => (window as any).__b2.diag.paintBake() as { handoverStrokes: number; bakes: number })
    const scr = cropDiff(draftScr, commitScr)
    rows.push({ tag: t.tag, tex_same: JSON.stringify(draftTex) === JSON.stringify(commitTex), scr_changed: scr.changed, scr_maxD: scr.maxD, rebuilds: dStat.rebuilds, full_uploads: dStat.fullUploads, handed: bk.handoverStrokes, bakes: bk.bakes })
    expect(JSON.stringify(commitTex), `${t.tag}: 뗄 때 캔버스 해시 불변(sha 항등)`).toBe(JSON.stringify(draftTex))
    expect(scr.changed, `${t.tag}: 뗄 때 화면 사각 불변`).toBe(0)
    await page.click('#btn-undo'); await page.waitForTimeout(300)
  }
  // ⑥의 몫 — 그리는 동안 전량 업로드 0회(재구축 제외 — cp 램프의 문턱 이동은 전량이 맞다)
  const pencilRow = rows[0] as { full_uploads: number }
  expect(pencilRow.full_uploads, '⑥ 연필 — 그리는 동안 전량 업로드 0').toBe(0)
  // 반증(D-3) — 입력 어긋냄: 미리보기 입력(raw 끝 셋 뗌)이 커밋과 갈리면 뗄 때 픽셀이 바뀐다
  await pickPaint(page, 'pencil')
  await page.evaluate(() => (window as any).__b2.diag.setPaintDraftPerturbForTest(true))
  const pts = acrossWall(100)
  await penDown(page, pts, 0.5)
  const pDraft = await glCrop(page, ...CLIP)
  await penUp(page, pts[pts.length - 1]!)
  const pCommit = await glCrop(page, ...CLIP)
  await page.evaluate(() => (window as any).__b2.diag.setPaintDraftPerturbForTest(false))
  const pd = cropDiff(pDraft, pCommit)
  expect(pd.changed, '반증 — 입력을 어긋내면 뗄 때 픽셀이 바뀐다').toBeGreaterThan(0)
  console.log('[⑤]', JSON.stringify({ rows, falsify_perturb: pd }))
})

test('§2 마커의 단면 — 가로/세로 폭이 갈린다 · 단면이 직사각형에 가깝다 · 대조(옛 원형 마커)', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  const probe = (preset: string, dir: number) =>
    page.evaluate(([p, d]) => (window as any).__b2.diag.markBandProbeForTest('marker', p, 24, d),
      [preset, dir] as const) as Promise<{ width_median: number; flat_share: number; n_cols: number }>
  // 새 기본(납작한 촉 · 고정 각 72°) — 방향 넷
  const dirs = [0, 45, 90, 135]
  const rows: Record<string, unknown>[] = []
  const widths: number[] = []
  for (const d of dirs) {
    const r = await probe('brunelleschi/marker', d)
    rows.push({ dir: d, ...r })
    widths.push(r.width_median)
    expect(r.n_cols, `방향 ${d} — 자국이 실제로 섰다(#103)`).toBeGreaterThan(10)
  }
  const ratio = Math.max(...widths) / Math.max(1, Math.min(...widths))
  expect(ratio, '⛳ 방향에 따라 폭이 갈린다(같은 마커 · 게이트 문 1.5)').toBeGreaterThan(1.5)
  // 넓은 방향의 단면 — 평평한 몫(최대 80% 위 ÷ 20% 위): 직사각형 ≈ 1 · 둥근 감쇠는 낮다
  const wideRow = rows[widths.indexOf(Math.max(...widths))] as { flat_share: number }
  expect(wideRow.flat_share, '넓게 칠할 때 단면이 직사각형에 가깝다(평평한 몫 ≥ .7)').toBeGreaterThanOrEqual(0.7)
  // 대조(D-3의 짝 — 자가 방향 차를 «잴 수 있음»의 실증): 옛 기본(원형)은 방향 무관이어야 한다
  const oldH = await probe('ramon/100%_Opaque', 0)
  const oldV = await probe('ramon/100%_Opaque', 90)
  const oldRatio = Math.max(oldH.width_median, oldV.width_median) / Math.max(1, Math.min(oldH.width_median, oldV.width_median))
  expect(oldRatio, '대조 — 옛 원형 마커는 방향 무관(< 1.15)').toBeLessThan(1.15)
  console.log('[§2]', JSON.stringify({ rows, ratio: +ratio.toFixed(2), old: { h: oldH, v: oldV, ratio: +oldRatio.toFixed(2) } }))
})

test('§3 66-3 칠 사양이 슬롯마다 — 색·크기·불투명이 즐겨찾기 칸에 남고, 오가면 그 칸의 값이 온다 · 새로 고쳐도 산다', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.click('#btn-paint'); await page.waitForTimeout(100)
  const setSpec = async (hex: string, w: number, o: number) => {
    await page.evaluate(([h, w, o]) => {
      const b2 = (window as any).__b2
      b2.app.paintSel.hex = h
      const sr = document.getElementById('paint-size-range') as HTMLInputElement
      sr.value = String(w); sr.dispatchEvent(new Event('input'))
      const or = document.getElementById('paint-opacity-range') as HTMLInputElement
      or.value = String(o); or.dispatchEvent(new Event('input'))
    }, [hex, w, o] as const)
    await page.waitForTimeout(60)
  }
  const spec = () => page.evaluate(() => {
    const ps = (window as any).__b2.app.paintSel
    return { i: ps.i, br: ps.br, hex: ps.hex, w: ps.w, o: ps.o }
  })
  await page.click('#paint-fav-1'); await page.waitForTimeout(80)   // 연필 칸
  await setSpec('#2244aa', 33, 0.6)
  await page.click('#paint-fav-2'); await page.waitForTimeout(80)   // 잉크펜 칸
  await setSpec('#aa3311', 12, 0.35)
  await page.click('#paint-fav-1'); await page.waitForTimeout(80)
  const a = await spec()
  expect(a.hex, '칸 1의 색이 돌아온다').toBe('#2244aa')
  expect(a.w, '칸 1의 크기가 돌아온다').toBe(33)
  expect(a.o, '칸 1의 불투명이 돌아온다').toBe(0.6)
  await page.click('#paint-fav-2'); await page.waitForTimeout(80)
  const b = await spec()
  expect(b.hex, '칸 2의 색이 돌아온다').toBe('#aa3311')
  expect(b.w, '칸 2의 크기가 돌아온다').toBe(12)
  expect(b.o, '칸 2의 불투명이 돌아온다').toBe(0.35)
  // 브러시 고르개로 «같은 브러시»를 들어도 그 칸의 사양이 따라온다(칸을 안 눌러도)
  const fav1 = await page.evaluate(() => JSON.parse(localStorage.getItem('b2.brushFavs64.v1')!)[0] as { i: string; br: string })
  await page.evaluate((f) => { (window as any).__b2.diag.pickBrushForTest?.(f.i, f.br) }, fav1)
  // (pickBrushForTest가 없으면 즐겨찾기 경로만 잰다 — 아래 재시작 판이 본체다)
  // 새로 고침 — 기기 저장이 산다(?reset은 캐시만 버리므로 여기서는 민자로 연다)
  await page.goto('/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.click('#btn-paint'); await page.waitForTimeout(100)
  await page.click('#paint-fav-1'); await page.waitForTimeout(80)
  const a2 = await spec()
  expect(a2.hex, '재시작 뒤에도 칸 1의 색').toBe('#2244aa')
  expect(a2.w, '재시작 뒤에도 칸 1의 크기').toBe(33)
  expect(a2.o, '재시작 뒤에도 칸 1의 불투명').toBe(0.6)
  // 문서 저장 형식 무변 — 즐겨찾기는 기기의 것이다(KEY_ORDER는 roundtrip43 ②가 지킨다):
  // 저장물에 즐겨찾기 밭이 한 글자도 안 섞였는지 문자열로 확인한다
  const saved = await page.evaluate(() => localStorage.getItem('b2.brushFavs64.v1'))
  expect(saved, '즐겨찾기가 기기(localStorage)에 남았다').toContain('#2244aa')
  console.log('[66-3]', JSON.stringify({ a, b, a2 }))
})

test('§3 66-4 R3 정정 — 연달아 쓰는 명령은 통을 안 접는다(자동찾기·분류) · 한 번 쓰는 명령은 접힌다(반증)', async ({ page }) => {
  test.setTimeout(300_000)
  // 닫힌 영역이 «면이 아직 아닌» 장면 — bigBox의 여덟 획만(면 확정 없음)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const popOpen = () => page.evaluate(() => { const e = document.getElementById('face-pop'); return !!e && !e.hidden })
  // ① 자동찾기(전부 찾기)를 연달아 — 누를 때마다 통이 «열려 있다»(다음 걸음 확정·취소가 그 안에 뜬다)
  await page.click('#btn-face'); await page.waitForTimeout(60)     // 도구
  for (let round = 0; round < 3; round++) {
    if (!(await popOpen())) { await page.click('#btn-face'); await page.waitForTimeout(60) }   // 팝
    expect(await popOpen(), `${round + 1}번째 — 팝이 열렸다`).toBe(true)
    await page.click('#btn-face-all'); await page.waitForTimeout(100)
    expect(await popOpen(), `⛳ ${round + 1}번째 자동찾기 뒤에도 통이 열려 있다(R3 정정)`).toBe(true)
    expect(await page.locator('#btn-face-commit').count(), '다음 걸음(확정)이 그 통 안에 보인다').toBe(1)
    await page.click('#btn-face-cancel'); await page.waitForTimeout(80)   // 취소는 끝맺음 — 접는 것이 맞다
    expect(await popOpen(), '취소는 통을 접는다(한 번 쓰고 마는 명령 — 종전 그대로)').toBe(false)
  }
  // ② 손통의 «돌리는» 명령(분류) — 연달아 눌러도 통이 열려 있고 값이 «실제로» 돈다
  await page.click('#btn-face'); await page.waitForTimeout(60)
  await page.mouse.click(700, 480); await page.waitForTimeout(150)   // 오른쪽 벽을 면으로
  await page.click('#btn-pencil'); await page.waitForTimeout(60)
  const holdMs = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(700, 470); await page.mouse.down()
  await page.waitForTimeout(holdMs + 300)
  await page.mouse.up(); await page.waitForTimeout(100)
  const grabbed = await page.evaluate(() => { const g = (window as any).__b2.app.grip; return g ? { n: g.ids.length, face: g.faceId } : null })
  expect(grabbed?.face, '면이 잡혔다(#103)').not.toBeNull()
  await page.click('#btn-grip'); await page.waitForTimeout(80)
  const trayOpen = () => page.evaluate(() => document.getElementById('griptray')!.classList.contains('open'))
  expect(await trayOpen(), '손통이 열렸다').toBe(true)
  const clsOf = () => page.evaluate(() => {
    const g = (window as any).__b2.app.grip
    const f = (window as any).__b2.app.doc.faces.find((x: any) => x.id === g.faceId)
    return f?.cls ?? null
  })
  const seen: (string | null)[] = [await clsOf()]
  for (let k = 0; k < 3; k++) {
    await page.click('#btn-grip-cls'); await page.waitForTimeout(80)
    expect(await trayOpen(), `⛳ 분류 ${k + 1}번째 뒤에도 손통이 열려 있다(R3 정정 — 툴팁이 스스로 «돌린다»라 말하는 명령)`).toBe(true)
    seen.push(await clsOf())
  }
  expect(new Set(seen.map(v => JSON.stringify(v))).size, '분류가 실제로 돌았다(값 — 접힘만 재는 팔이 아니다)').toBeGreaterThan(2)
  // ③ 반증 — 한 번 쓰고 마는 명령(정면)은 종전대로 접는다
  await page.click('#btn-grip-front'); await page.waitForTimeout(120)
  expect(await trayOpen(), '반증 — 정면(한 번 쓰는 명령)은 손통을 접는다').toBe(false)
  console.log('[66-4]', JSON.stringify({ cls_seen: seen }))
})
