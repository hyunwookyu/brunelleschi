// web2-46 — 재료의 **화면 몫**. 상태·저장·무늬 생성은 단위 팔(test/mats46*.test.ts)이
// 재고, 여기서는 픽셀만(재는 자리가 결과의 자리다 — #92):
//   ① 칠통 — 붓 재누름이 통을 열고, 견본 선택이 화면과 같은 상태에 실린다(#88)
//   ② 마커 겹침 — 겹 수(1·2·3)에 따라 칠 자국의 퇴적이 실제로 단조 증가한다(스윕 #12)
//      + 반증(D-3): 겹 0끼리(1획 두 구역)의 차는 그 계단보다 작다
//   ③ 마커 경계 — 획 끝(팁)의 퇴적이 몸통 가운데보다 진하다(«경계가 살짝 남는다»의 실측)
//   ④ 색연필 — 같은 길이 획의 잉크 띠 두께가 마커보다 실제로 가늘다
//   ⑤ 면 재료 — 손통 「재료」가 해칭의 무늬(선분 수)와 색을 실제로 바꾼다
//   ⑥ 깊이 순서 «픽셀» 판별(45 DEFERRED 몫) — 이색 해칭 겹침에서 위에 선 색이 앞 면의
//      것이다. D-3 반증: 화가 알고리즘을 끄면(diag.setFaceSort(false)) 그 판별값이 준다
//   ⑦ 성능 — 획 200 장면(재료 칠 포함)의 전량 재그리기 ms(원장 — 판정은 실기기 몫)
//
// 원장: stage0/out/mats46_e2e_web2_<dpr>.json (LEDGER=1 — #90 · dpr별 파일 — 픽셀은 dpr의 함수)
// ⚠ #93 — 모든 획의 시작점을 잡힘 반경(16px)·기존 획 위에서 떼어 둔다(450ms 누름 진입).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-46 — 화면 몫: 칠통 · 마커 겹침 누적/경계 · 색연필 굵기 · 면 재료 해칭 · 깊이 순서 픽셀 판별 · 200획 성능',
  note_92: '#92 — 판정자는 픽셀 퇴적(알파 합·채널 차)이다. 「마커를 골랐다」는 이름표라 안 센다',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 방(바닥+벽) — paint45와 같은 픽스처(두 자리에 다른 장면 ⛔) */
async function room(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(550, 430); await page.waitForTimeout(60)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 둘이 섰다').toBe(2)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
}

/** #brushc 사각 안 잉크의 **알파 합**과 **안료 합**(알파 가중 어두움). 알파 합은 겹침
 *  두어 번에 255로 포화한다(실측 — dpr1에서 2→3겹 계단이 +255뿐) — 색 채널의 어두움은
 *  퇴적을 계속 실으므로 안료 합을 짝으로 둔다. dpr 정규화는 안 한다 — 파일이 dpr별이다. */
const inkSums = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let alpha = 0, pigment = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!
      alpha += a
      if (a > 0) pigment += (a / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!)
    }
    return { alpha, pigment: Math.round(pigment) }
  }, [x, y, w, h])
const inkAlphaSum = async (page: Page, x: number, y: number, w: number, h: number) =>
  (await inkSums(page, x, y, w, h)).alpha

/** 사각 안 잉크 띠의 세로 두께(px·물리) — 잉크가 있는 행의 수(④의 자) */
const inkRowCount = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let rows = 0
    for (let r = 0; r < t.height; r++) {
      for (let c = 0; c < t.width; c++) {
        if (d[(r * t.width + c) * 4 + 3]! > 8) { rows++; break }
      }
    }
    return rows
  }, [x, y, w, h])

/** 마커·재료를 UI로 고른다 — 칠통 경로(견본 클릭이 결과에 실리는 그 배선을 지난다) */
async function pickMarker(page: Page, matId: string, tone: number) {
  await page.click('#btn-paint')                     // 도구
  await page.click('#btn-paint')                     // 재누름 — 칠통
  await page.click(`#swatch-${matId}-${tone}`)       // 견본 → 재료+톤, 도구 마커로
  await page.click('#btn-paint-marker')              // 명시(견본이 이미 마커로 돌린다 — 멱등)
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(150, 700)                   // 통 밖 — 접는다(빈 종이 구석)
  await page.waitForTimeout(60)
}

test('① 칠통 — 재누름이 열고 · 견본이 화면과 같은 상태에 실린다(#88)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('paint')
  expect(await page.locator('#painttray.open').count(), '한 번에는 안 열린다(도구 선택)').toBe(0)
  await page.click('#btn-paint')
  expect(await page.locator('#painttray.open').count(), '재누름이 연다').toBe(1)
  const rows = await page.locator('#painttray .rrow').count()
  expect(rows, '도구 셋 + 자동 + 재료 다섯').toBe(9)
  await page.click('#swatch-wood-2')
  const sel = await page.evaluate(() => (window as any).__b2.diag.mats46().paintSel)
  expect(sel).toEqual({ m: 'wood', t: 2, i: 'marker' })   // 견본 = 재료+톤, 도구는 마커로
  await page.click('#btn-paint-cp')
  const sel2 = await page.evaluate(() => (window as any).__b2.diag.mats46().paintSel)
  expect(sel2.i).toBe('cp')
  await page.click('#btn-paint-auto')
  expect((await page.evaluate(() => (window as any).__b2.diag.mats46().paintSel)).t).toBe('auto')
  OUT.tray = { rows, sel_after_swatch: sel, sel_after_cp: sel2.i }
  OUT.constants_used = await page.evaluate(() => (window as any).__b2.diag.mats46().constants)
})

test('②③ 마커 — 겹침 퇴적 단조(1·2·3겹 스윕) · 끝(팁)이 몸통보다 진하다', async ({ page }) => {
  await room(page)
  await pickMarker(page, 'brick', 1)
  // 벽(x 505..595 · y 385..500) 안 세 구역 — 같은 길이의 가로획을 1·2·3번 겹긋는다.
  // ⚠ 시작점 (505,y)는 기존 획(모서리 x=500)에서 5px — 잡힘 반경 16px 안이다(#93) →
  //   x=520에서 시작해 화면상 같은 선 위를 왕복한다.
  const runs: { y: number; n: number }[] = [{ y: 400, n: 1 }, { y: 430, n: 2 }, { y: 460, n: 3 }]
  for (const r of runs) {
    for (let k = 0; k < r.n; k++) await drawLine(page, 520, r.y, 580, r.y)
  }
  await page.waitForTimeout(150)
  /** 같은 획들을 spacing만 바꿔 다시 그려 잰다(1차 리뷰어 [2][3] — 결정의 근거를
   *  **출하 경로 그대로**의 원장으로: 같은 획 id·같은 상자·같은 redraw, spacing만 다르다) */
  const measureAt = async (spacing: number) => {
    await page.evaluate(sp => (window as any).__b2.diag.setMarkerSpacing(sp), spacing)
    await page.waitForTimeout(200)
    const rows: { alpha: number; pigment: number }[] = []
    for (const r of runs) rows.push(await inkSums(page, 520, r.y - 8, 60, 16))
    return rows
  }
  const shipVal = await page.evaluate(() => (window as any).__b2.diag.mats46().markerSpacing as number)
  const ship = await measureAt(shipVal)             // C.MARKER_SPACING(출하값 — 하드코딩 ⛔)
  const stock = await measureAt(0.03)               // 내장 marker의 값(반증짝)
  await page.evaluate(sp => (window as any).__b2.diag.setMarkerSpacing(sp), shipVal)   // 되돌림(⚠ 필수)
  await page.waitForTimeout(120)
  const sums = ship
  // 알파 합은 포화하므로(rows의 alpha 열이 그 관측을 스스로 든다) 단조의 본 자는 **안료 합**
  expect(sums[1]!.pigment, '2겹 > 1겹(안료)').toBeGreaterThan(sums[0]!.pigment)
  expect(sums[2]!.pigment, '3겹 > 2겹(안료)').toBeGreaterThan(sums[1]!.pigment)
  expect(sums[1]!.alpha, '2겹 > 1겹(알파도)').toBeGreaterThan(sums[0]!.alpha)
  // 반증(D-3) — 같은 1획끼리(왼 반·오른 반)의 차는 겹침 계단(2겹−1겹)보다 작다
  const halfA = await inkSums(page, 520, 392, 30, 16)
  const halfB = await inkSums(page, 550, 392, 30, 16)
  const step = sums[1]!.pigment - sums[0]!.pigment
  expect(Math.abs(halfA.pigment - halfB.pigment), '반증 — 겹 0의 차 < 겹침 계단').toBeLessThan(step)
  // 결정의 근거(D-W16): 내장 spacing 0.03은 같은 획·같은 상자에서 겹 계단이 죽어 있다 —
  // 0.03의 계단이 0.2의 계단보다 «상대비»로 작아야 한다(포화 관측의 원장 판)
  const rel = (rows: { pigment: number }[]) => (rows[1]!.pigment - rows[0]!.pigment) / Math.max(1, rows[0]!.pigment)
  expect(rel(stock), '내장 0.03의 겹 계단(상대) < 출하 0.2의 절반 — 포화의 원장 증거').toBeLessThan(rel(ship) / 2)
  OUT.marker_overlap = {
    def: '같은 길이(60px) 가로획을 같은 자리에 1·2·3번 — 상자(60×16)의 알파 합·안료 합(알파 가중 (765−r−g−b)). spacing 0.2(출하)와 0.03(내장)을 **같은 획·같은 상자**에서 잰다(setMarkerSpacing — 출하 경로의 redraw). 반증 = 1획의 왼/오른 반쪽 차(안료)',
    spacing_ship: shipVal,
    rows_spacing_02: ship, rows_spacing_003: stock,
    rel_step_1to2_02: +rel(ship).toFixed(4), rel_step_1to2_003: +rel(stock).toFixed(4),
    half_diff_pigment: Math.abs(halfA.pigment - halfB.pigment), step_1to2_pigment: step,
    note_saturation: '알파 합의 포화는 rows_spacing_003의 세 alpha 값이 스스로 보인다(산문 수치 ⛔ — 1차 [11])',
  }
  OUT.gate_marker_monotonic = {
    registered: '판정 셋(스펙 단언과 같은 문면 — 2차 [3]): ① 출하 spacing에서 안료 합 1<2<3겹 단조 ② 출하 계단(1→2겹) > 겹0 잡음(half_diff — 출하 팔의 값) ③ 대조: rel_step_1to2_003 < rel_step_1to2_02 / 2',
    value: 'rows_spacing_02 안료 열 · rel 두 필드',
    reachability: '내장 0.03 팔이 ③을 실제로 위협하는 값을 같은 실행에 낸다 — 상대 계단이 출하의 1/10 대역으로 준다(dpr1은 비단조(음수)까지 · dpr2는 +3% 대역 — «죽는다»가 아니라 «크게 준다»가 정확한 서술이다, 2차 [3]). ①②의 실패 가능성은 그 줄어든 계단이 half_diff 대역과 겹치는 dpr1 값이 보인다',
    reachability_value: 'rel_step_1to2_003 (dpr별 원장 값)',
    reachability_source: '이 파일의 marker_overlap/rel_step_1to2_003 ↔ rel_step_1to2_02',
  }
  // ③ 경계 잔존 — 본 측정은 **솔기**다(1차 [12] — 지시 문면 「획 경계가 살짝 남는다」):
  // 나란한 두 획을 반폭 겹치면 겹친 띠(솔기)가 양쪽 몸통보다 진하게 남는다.
  await drawLine(page, 520, 486, 580, 486)
  await drawLine(page, 520, 492, 580, 492)          // 6px 아래 — 반폭 겹침(마커 폭 10px)
  await page.waitForTimeout(150)
  // ⚠ 고정 상자 두 판이 연속으로 «아래 몸통»을 10배 얕게 쟀다(2차 [1] · 재실측 — 상자를
  // 획 «안»으로 옮겨도 289 vs 3009). 마커 띠의 세로 프로파일이 경로 중심에 대칭이라는
  // 가정이 틀린 것이다(D-4). 가정을 버리고 **행별 프로파일을 직접 잰다**(D-1): 잉크 띠를
  // 스스로 찾고, 띠의 가운데 1/3(두 획이 겹치는 솔기 대역)이 바깥 1/3들보다 진한가를 본다.
  const profile = await page.evaluate(() => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const x0 = Math.round(535 * dpr), w = Math.round(30 * dpr)
    const y0 = Math.round(474 * dpr), h = Math.round(30 * dpr)
    const t = document.createElement('canvas')
    t.width = w; t.height = h
    const g = t.getContext('2d')!
    g.drawImage(src, x0, y0, w, h, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const rows: number[] = []
    for (let r = 0; r < h; r++) {
      let pig = 0
      for (let c = 0; c < w; c++) {
        const i = (r * w + c) * 4
        const a = d[i + 3]!
        if (a > 0) pig += (a / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!)
      }
      rows.push(Math.round(pig))
    }
    return rows          // CSS 474..504 대역의 물리 행별 안료
  })
  const peak = Math.max(...profile)
  const band = profile.map((v, i) => ({ v, i })).filter(r => r.v > peak * 0.05)
  const bi = band.map(r => r.i)
  const lo = bi[0]!, hi = bi[bi.length - 1]!
  const third = Math.max(1, Math.floor((hi - lo + 1) / 3))
  const mean = (a: number, b: number) => {
    let s2 = 0, n = 0
    for (let i = a; i <= b; i++) { s2 += profile[i]!; n++ }
    return s2 / Math.max(1, n)
  }
  const outerTop = mean(lo, lo + third - 1)
  const middle = mean(lo + third, hi - third)
  const outerBot = mean(hi - third + 1, hi)
  expect(bi.length, '잉크 띠가 실제로 있다').toBeGreaterThan(6)
  expect(middle, '솔기 대역(띠 가운데 1/3)이 위 몸통보다 진하다').toBeGreaterThan(outerTop)
  expect(middle, '솔기 대역이 아래 몸통보다 진하다').toBeGreaterThan(outerBot)
  // 팁(끝) 잔존 — markerTip의 끝 덧찍음(보조 관측)
  const tip = await inkAlphaSum(page, 574, 392, 12, 16)
  const mid = await inkAlphaSum(page, 544, 392, 12, 16)
  // 반증(D-3 착수 표 «내부끼리 차이 0») — 몸통 두 상자의 차가 팁 초과분보다 작다
  const mid2 = await inkAlphaSum(page, 530, 392, 12, 16)
  expect(Math.abs(mid - mid2), '반증 — 몸통끼리의 차 < 팁 초과분').toBeLessThan(tip - mid)
  OUT.marker_tip = {
    def: '1겹 획 끝(574..586)·몸통(544..556 · 530..542) 12×16 상자 알파 합 — 반증은 몸통 두 상자의 차. ratio의 분모는 mid(544..556) 고정(2차 [16])',
    tip, mid, mid2, ratio: +(tip / Math.max(1, mid)).toFixed(3),
  }
  OUT.marker_seam = {
    def: '나란한 두 획(y486·y492 — 반폭 겹침)의 **행별 안료 프로파일**(x 535..565 · y 474..504 물리 행). 띠 = 안료 > 피크 5%인 행들 · 판정 = 띠 가운데 1/3(솔기 대역) 평균 > 바깥 1/3 평균 둘 다. 고정 상자 두 판이 «띠가 경로에 대칭»이라는 틀린 가정으로 아래 몸통을 10배 얕게 쟀다(2차 [1] — 그 관측이 이 재설계의 사유. 프로파일이 원장에 있으므로 비대칭 자체가 값으로 남는다). ⚠ half_diff_pigment(y392 반쪽 상자 차)와 계산이 다르다(2차 [13] — dpr1에서 값이 3338로 우연히 같았던 것)',
    profile_rows: profile, band: [lo, hi],
    middle_mean: +middle.toFixed(0), outer_top_mean: +outerTop.toFixed(0), outer_bot_mean: +outerBot.toFixed(0),
  }
  expect(tip, '끝의 퇴적이 몸통보다 진하다(markerTip)').toBeGreaterThan(mid)
  // **톤이 픽셀을 바꾼다**(2차 PITFALLS 대조 — #92: gate_suggest_not_default가 판정하는
  // 톤 인덱스는 이름표다. 그 이름표가 결과의 자리(픽셀)를 실제로 움직이는 것을 여기서 잇는다):
  // 같은 재료(벽돌)의 밝음(0)·그림자(2)를 같은 길이로 긋고 안료 합을 비교한다.
  await page.click('#btn-paint')
  await page.click('#swatch-brick-0')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 520, 415, 545, 415)
  await page.click('#btn-paint')
  await page.click('#swatch-brick-2')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 555, 415, 580, 415)
  await page.waitForTimeout(150)
  const tone0 = await inkSums(page, 522, 408, 20, 14)
  const tone2 = await inkSums(page, 557, 408, 20, 14)
  expect(tone2.pigment, '그림자 톤의 안료가 밝음 톤보다 크다 — 톤 인덱스가 픽셀에 실린다').toBeGreaterThan(tone0.pigment)
  OUT.tone_pixel = {
    def: '같은 재료(벽돌) 밝음(0)·그림자(2)의 같은 길이(25px) 획 — 20×14 상자 안료 합. gate_suggest_not_default의 톤 인덱스(이름표)가 픽셀(자리)을 바꾸는 것의 연결 고리(#92 ②)',
    tone0: tone0.pigment, tone2: tone2.pigment,
  }
})

test('④ 색연필 — 같은 길이 획의 잉크 띠가 마커보다 가늘다', async ({ page }) => {
  await room(page)
  await pickMarker(page, 'wood', 1)
  await drawLine(page, 520, 410, 580, 410)          // 마커 획
  await page.click('#btn-paint')                    // 이미 붓 도구 — 재누름 한 번이 연다
  await page.click('#btn-paint-cp')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 520, 450, 580, 450)          // 색연필 획(같은 벽·같은 길이)
  await page.waitForTimeout(150)
  const markerRows = await inkRowCount(page, 535, 396, 30, 28)
  const cpRows = await inkRowCount(page, 535, 436, 30, 28)
  expect(markerRows, '마커 띠가 실제로 있다').toBeGreaterThan(0)
  expect(cpRows, '색연필 띠가 실제로 있다').toBeGreaterThan(0)
  expect(cpRows, '색연필이 마커보다 가늘다').toBeLessThan(markerRows)
  OUT.cp_vs_marker = { def: '같은 벽·같은 길이(60px) 가로획 — 30px 창의 잉크 행 수(물리 px)', marker_rows: markerRows, cp_rows: cpRows }
})

test('⑤ 면 재료 — 손통 「재료」가 해칭 무늬·색을 실제로 바꾼다', async ({ page }) => {
  await room(page)
  // 벽을 잡고 채움을 켠다(45 ③의 경로 그대로)
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(550, 432)
  await page.mouse.down(); await page.waitForTimeout(ms + 300); await page.mouse.up()
  await page.waitForTimeout(60)
  expect((await page.evaluate(() => (window as any).__b2.diag.grip44())).faceId).not.toBeNull()
  await page.click('#btn-grip'); await page.click('#btn-grip-fill')
  await page.waitForTimeout(150)
  const segs0 = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  expect(segs0, '기본 해칭이 섰다').toBeGreaterThan(4)
  // 재료 한 걸음 — 벽돌(간격 8 — 기본 11보다 촘촘: 선분 수가 는다)
  await page.click('#btn-grip'); await page.click('#btn-grip-fmat')
  await page.waitForTimeout(150)
  const d = await page.evaluate(() => (window as any).__b2.diag.mats46())
  expect((d.faceMats as { mat: string | null }[]).some(f => f.mat === 'brick'), '면에 벽돌이 실렸다').toBe(true)
  const segs1 = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  expect(segs1, '무늬가 실제로 바뀌었다(간격 8 < 11 — 선분 증가)').toBeGreaterThan(segs0)
  OUT.face_mat = { segs_default: segs0, segs_brick: segs1 }
})

test('⑥ 깊이 순서 «픽셀» — 이색 해칭 겹침의 위 색이 앞 면의 것 · 끄면 준다(D-3)', async ({ page }) => {
  // paint45 ④의 두-벽 장면(참 앞 벽이 참 뒤 벽과 x∈[500,526]에서 겹친다)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 380, 545, 526, 504)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 380, 545, 380, 340)
  await drawLine(page, 526, 504, 526, 357)
  await drawLine(page, 526, 357, 380, 340)
  await page.click('#btn-face')
  await page.mouse.click(430, 420); await page.waitForTimeout(60)   // 참 앞
  await page.mouse.click(560, 430); await page.waitForTimeout(60)   // 참 뒤
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  /** 면 하나를 잡아 채움 + 재료 N걸음 */
  const dress = async (x: number, y: number, steps: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down(); await page.waitForTimeout(ms + 300); await page.mouse.up()
    await page.waitForTimeout(60)
    await page.click('#btn-grip'); await page.click('#btn-grip-fill')
    for (let k = 0; k < steps; k++) { await page.click('#btn-grip'); await page.click('#btn-grip-fmat') }
    await page.click('#btn-pencil'); await page.click('#btn-pencil')   // 잡기 세션 놓기(39·44)
    await page.waitForTimeout(60)
  }
  await dress(430, 420, 1)    // 앞 벽 = 벽돌(그림자 톤 #8f5340 — r 큼)
  await dress(560, 430, 5)    // 뒤 벽 = 금속(그림자 톤 #666d75 — b 큼)
  const mats = await page.evaluate(() => (window as any).__b2.diag.mats46().faceMats)
  expect((mats as { mat: string | null }[]).map(f => f.mat).sort()).toEqual(['brick', 'metal'])
  await page.waitForTimeout(200)
  // 겹침 상자(502..524 × 400..470)의 #gl 픽셀별 (r−b) — 벽돌은 +, 금속은 −.
  // ⚠ 첫 판은 상자 «평균»으로 쟀는데 15.95 ↔ 15.53으로 거의 안 갈렸다(#92의 형태 —
  //   해칭 선이 성기어 실제로 «선 위에 선이 얹힌» 픽셀이 상자의 소수라 평균이 둔하다).
  //   자를 **다툰 픽셀**(두 상태에서 값이 갈린 자리 = 교차 그 자체)로 좁힌다.
  const rbData = () => page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    // 겹침 띠 전체(502..524 × 385..495) — 70px 판은 dpr2에서 교차 픽셀이 20개로 문턱에
    // 걸렸다(해칭 교차는 이산적이라 상자가 좁으면 표본이 준다 — D-5의 형태)
    const x0 = Math.round(502 * dpr), y0 = Math.round(385 * dpr)
    t.width = Math.round(22 * dpr); t.height = Math.round(110 * dpr)
    const g = t.getContext('2d')!
    g.drawImage(src, x0, y0, t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const vals: number[] = []
    for (let i = 0; i < d.length; i += 4) vals.push(d[i + 3]! > 0 ? d[i]! - d[i + 2]! : 0)
    return vals
  })
  const onV = await rbData()
  // D-3 반증짝 — 화가 알고리즘을 끄면(배열 차례 = 참 앞이 먼저 = 아래) 교차의 위 색이 뒤집힌다
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(false))
  await page.waitForTimeout(200)
  const offV = await rbData()
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(true))
  // **문턱을 훑는다**(1차 [4] — #13: 절단값 하나가 결론을 정하면 그 결론은 없다):
  // 판정은 «다툰 픽셀이 있고, 그 자리의 이동 방향이 한쪽(앞 색)으로 쏠린다»이고,
  // 문턱 4·8·16 어디서든 서야 한다. Δ의 분포(평균·p90·최대·표준편차)도 원장에 낸다(#8).
  const sweep: Record<string, { contested: number; to_front: number; mean_on: number; mean_off: number }> = {}
  let verdictAll = true
  for (const th of [2, 4, 8, 16]) {
    const c: number[] = []
    for (let i = 0; i < onV.length; i++) if (Math.abs(onV[i]! - offV[i]!) > th) c.push(i)
    const mean = (v: number[]) => c.reduce((s, i) => s + v[i]!, 0) / Math.max(1, c.length)
    const tf = c.filter(i => onV[i]! > offV[i]!).length
    sweep[`th${th}`] = { contested: c.length, to_front: tf, mean_on: +mean(onV).toFixed(2), mean_off: +mean(offV).toFixed(2) }
    // **판정은 contested 하나다**(2차 [4] — to_front 100%는 색 선택의 구성적 귀결이라
    // 임계를 안 건다, #5·CLAUDE §5.1. 기록은 남긴다). th16 행은 Δ 상한의 관측(공집합 정상).
    if (th <= 8 && !(c.length > 15)) verdictAll = false
  }
  const deltas: number[] = []
  for (let i = 0; i < onV.length; i++) { const d = onV[i]! - offV[i]!; if (Math.abs(d) > 2) deltas.push(d) }
  deltas.sort((a, b) => a - b)
  const dMean = deltas.reduce((s, v) => s + v, 0) / Math.max(1, deltas.length)
  const dSd = Math.sqrt(deltas.reduce((s, v) => s + (v - dMean) ** 2, 0) / Math.max(1, deltas.length))
  console.log('[depth sweep]', JSON.stringify(sweep))
  OUT.depth_pixel = {
    def: '겹침 상자(502,385,22×110 — CSS px·판독은 dpr 배·분모 box_px) #gl의 픽셀별 (r−b). 다툰 픽셀 = 정렬 켬/끔에서 |Δ|>문턱인 자리(해칭 교차 그 자체). 문턱 2·4·8·16 스윕 — **판정은 «다툰 자리 >15»를 문턱 2·4·8 전부에서**(to_front는 기록만 — 구성적 귀결. th16 공집합 = Δ ≤ 16의 관측, 실측 최대는 delta_stats.max). ⚠ 문턱 15는 첫 관측(최소 33) 뒤 그 절반 아래로 박은 보수값이다 — 사전 등록이 아니다(#26의 유보를 정직하게 남긴다, 2차 [5])',
    box_px: await page.evaluate(() => {
      const dpr = window.devicePixelRatio || 1
      return Math.round(22 * dpr) * Math.round(110 * dpr)
    }),
    threshold_sweep: sweep,
    delta_stats: { def: '|Δ|>2 모집단(스윕 최저 문턱과 같다 — 2차 [2]: 문턱 4 조건화를 걷었다)', n: deltas.length, mean: +dMean.toFixed(2), sd: +dSd.toFixed(2), p10: +(deltas[Math.floor(deltas.length * .1)] ?? 0).toFixed(1), p90: +(deltas[Math.floor(deltas.length * .9)] ?? 0).toFixed(1), max: +(deltas[deltas.length - 1] ?? 0).toFixed(1) },
    note_dpr: '다툰 자리 수는 dpr을 따라 4배가 되지 않는다(교차 «개수»는 화면 기하의 것이고 픽셀 면적만 dpr을 탄다 — AA 폭이 기기 px ~1이라 자리 수가 교차 수 대역에 묶인다). 분모는 box_px(2차 [6])',
    note_5: '«다툰 자리의 이동이 전부 + 쪽»은 색 선택(벽돌 r>b · 금속 r<b)의 구성적 귀결에 가깝다 — 측정의 몫은 ① 다툰 자리가 실제로 있다(= 순서가 픽셀에 닿는다) ② 그 수·Δ 분포다. Δ가 상수(색차×알파)에 가까우면 sd가 작게 나온다 — 그 값 자체를 낸다(1차 [7])',
    note_92: '첫 판(상자 전체 평균)은 15.95↔15.53으로 거의 안 갈렸다 — 자가 결과의 자리를 안 보고 있었다. 다툰 픽셀로 좁힌 것이 이 판이다',
    note_45: '45 DEFERRED 「픽셀 순서 판별은 46 몫」의 그 팔이다 — 같은 색 반투명은 over 합성이 교환이라 45는 못 쟀다',
  }
  OUT.gate_depth_pixel = {
    registered: '문턱 2·4·8 전부에서 다툰 픽셀 >15 (to_front는 기록 — 구성적 귀결이라 임계 없음 · th16은 Δ 상한 관측)',
    value: 'threshold_sweep',
    reachability: 'D-3 짝(정렬 끔)이 다툰 픽셀 그 자체를 만든다 — 순서가 픽셀에 안 실리면(45의 동색 상태) 다툰 픽셀이 0이 되어 이 게이트가 실패한다. 45 원장 depth_after.note_pixel이 그 «못 재는 상태»의 기록이다',
    reachability_value: 'threshold_sweep.th4.contested',
    reachability_source: '이 파일의 threshold_sweep — 동색(순서가 픽셀에 안 실리는) 상태의 기록은 paint45_e2e depth_after.note_pixel',
  }
  expect(verdictAll, '문턱 2·4·8 어디서든: 다툰 픽셀 >15').toBe(true)
  expect(sweep['th16']!.contested, 'Δ 상한 관측 — 16을 넘는 Δ가 없다(실측 최대는 delta_stats.max)').toBe(0)
})

test('⑦ 성능 — 획 200 장면: 재료 없이 vs 재료 칠 포함(대조군 — 1차 [10])', async ({ page }) => {
  await room(page)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    for (let i = 0; i < 189; i++) {
      const x = 120 + (i * 37) % 800, y = 120 + (i * 53) % 200
      b2.diag.commitStroke(x, y, x + 60 + (i % 40), y + 10)
    }
  })
  await page.waitForTimeout(300)
  const sample5 = async () => {
    const ms: number[] = []
    for (let k = 0; k < 5; k++) ms.push(await page.evaluate(() => (window as any).__b2.diag.brushRedrawMs()))
    ms.sort((a, b) => a - b)
    return { min: +ms[0]!.toFixed(1), median: +ms[2]!.toFixed(1), max: +ms[4]!.toFixed(1) }
  }
  const nPlain = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const plain = await sample5()                      // 대조군 — 재료 없는 장면(1차 [10])
  await pickMarker(page, 'conc', 1)
  for (const dy of [0, 20, 40]) await drawLine(page, 520, 405 + dy, 580, 415 + dy)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(150)
  const n = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n).toBeGreaterThanOrEqual(200)
  const withMats = await sample5()
  OUT.perf200 = {
    def: '전량 재그리기 ms(5회 min/median/max) — plain: 재료 없는 197획 / with_mats: 같은 장면 + 마커 칠 3(콘크리트) ≥200획. 같은 페이지 연속 실측이라 환경이 같다. 헤드리스 소프트웨어 GL의 수(실기기 판정은 사람 — **관측이지 판정이 아니다**: 통과선을 안 건다)',
    plain: { strokes: nPlain, ...plain }, with_mats: { strokes: n, ...withMats },
  }
  expect(plain.median, '재그리기가 실제로 돌았다(0이면 캐시를 잰 것)').toBeGreaterThan(0)
  expect(withMats.median, '재그리기가 실제로 돌았다').toBeGreaterThan(0)
})

test.afterAll(async ({ }, testInfo) => {
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  OUT.dpr_project = testInfo.project.name
  // constants_used(2차 [9]) — ① 팔이 diag에서 미리 담아 둔다(아래 constants가 그 사본)
  writeFileSync(resolve(outDir, `mats46_e2e_web2_${testInfo.project.name}.json`), JSON.stringify(OUT, null, 2))
})
