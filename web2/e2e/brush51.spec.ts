// web2-51 — **자국의 질의 픽셀 판**. 프로필·해시의 순수 몫은 단위(test/brush51.test.ts)가
// 재고, 여기서는 자국이 화면에 내는 값만(#92):
//   ① 압력 — 약/강 두 획(합성 펜 필압): 진하기·굵기가 갈리고 **농도 비 > 굵기 비**.
//      D-3: 평탄화 스위치로 재굽기하면 두 비가 1 대역으로 죽는다(같은 지표 — 50의 규칙).
//   ② 마커 팁 — 끝 상자의 안료 > 몸통 상자(«획 경계가 살짝 남는다» — 50이 미룬 성질의
//      부활). D-3: 평면 덮어쓰기 스위치(팁 생략)에서 그 차가 죽는다.
//   ③ 결이 면에 붙는다 — 줌 z배에서 결의 상관 길이도 z배(화면 고정이면 불변 — 40의 그
//      자). D-3: 결 끔 스위치에서 상관 길이 0(요동 소멸).
//   ④ dpr 1↔3 — 같은 획의 굵기(물리 px ÷ dpr) 비가 1 ± C.PAINT51_DPR_W_TOL(#26-2 계열).
//   ⑤ 트레이 견본 == 자국 — 견본(원 지름 = w px — 구성)과 그은 자국의 띠 두께(픽셀).
//   ⑥ Injector(행위 — #94) — 실제 탭이 짚은 획의 도구·색·굵기를 paintSel에 싣는다.
//   ⑦ 붓 — 끝 갈라짐(끝 굵기 > 몸통) · 흐름(길이 방향 농도 요동 — 기록).
//   ⑧ 색연필 — 색이 완전히 덮이지 않는다(띠 안 빈 알갱이 비율 > 마커).
//
// 원장: stage0/out/brush51_web2_<dpr>.json (LEDGER=1 · #90 · dpr별)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-51 — 자국의 질: 압력(농도>굵기) · 마커 팁 · 결의 줌 스케일 · dpr 굵기 비 · 트레이 1:1 · Injector · 붓 갈라짐 · 색연필 피복',
  note_92: '판정자는 픽셀(안료·두께·전이 수)이다. 프로필 함수의 기울기는 단위가 같은 함수로 잰다(#54)',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 합성 **펜** 획 — 필압을 싣는다(마우스는 0.5 상수라 압력 팔의 재료가 못 된다).
 *  input.ts가 pointerType 'pen'일 때만 점별 필압을 모은다 — 그 경로 그대로 지난다. */
async function drawPen(page: Page, x0: number, y0: number, x1: number, y1: number, press: number) {
  await page.evaluate(([a, b, c, d, pr]) => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    fire('pointerdown', a as number, b as number, pr as number, 1)
    const n = 14
    for (let i = 1; i <= n; i++) {
      fire('pointermove', (a as number) + ((c as number) - (a as number)) * i / n,
        (b as number) + ((d as number) - (b as number)) * i / n, pr as number, 1)
    }
    fire('pointerup', c as number, d as number, 0, 0)
  }, [x0, y0, x1, y1, press] as unknown[])
  await page.waitForTimeout(120)
}

/** 방(바닥+벽) — paint45/mats46과 같은 픽스처 */
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
  await page.mouse.click(550, 430); await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(80)
}

const pickInstr = async (page: Page, i: string, hex: string, w: number) => {
  await page.evaluate(([ii, h, ww]) => {
    (window as any).__b2.app.paintSel = { hex: h, i: ii, w: ww }
  }, [i, hex, w] as unknown[])
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 상자의 «채색 픽셀» 통계 — 수·평균 안료(픽셀당)·행 두께(채색 행 수 · 물리 px) */
const bandStats = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0, pig = 0, rows = 0
    for (let r = 0; r < t.height; r++) {
      let has = false
      for (let c = 0; c < t.width; c++) {
        const i = (r * t.width + c) * 4
        if (d[i + 3]! > 8) {
          const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!), mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!)
          if (mx - mn > 15) {
            n++; has = true
            pig += (d[i + 3]! / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!)
          }
        }
      }
      if (has) rows++
    }
    return { px: n, pigPerPx: n ? +(pig / n).toFixed(1) : 0, rows }
  }, [x, y, w, h] as unknown[])

test('① 압력 — 진하기·굵기가 갈리고 농도 비 > 굵기 비 · D-3(평탄화)', async ({ page }) => {
  await room(page)
  await pickInstr(page, 'pencil', '#3a6b35', 10)
  await drawPen(page, 515, 410, 585, 410, 0.2)      // 약
  await drawPen(page, 515, 450, 585, 450, 0.9)      // 강
  await page.waitForTimeout(250)
  const weak = await bandStats(page, 530, 398, 40, 24)
  const strong = await bandStats(page, 530, 438, 40, 24)
  expect(weak.px, '약한 획이 있다').toBeGreaterThan(30)
  expect(strong.px, '강한 획이 있다').toBeGreaterThan(30)
  const wRatio = strong.rows / Math.max(1, weak.rows)
  const dRatio = strong.pigPerPx / Math.max(1, weak.pigPerPx)
  expect(strong.rows, '강하게 → 굵게').toBeGreaterThan(weak.rows)
  expect(strong.pigPerPx, '강하게 → 진하게').toBeGreaterThan(weak.pigPerPx)
  expect(dRatio, '농도 비가 굵기 비보다 크다(26-6 — 픽셀 판)').toBeGreaterThan(wRatio)
  // D-3 — 평탄화 재굽기: 같은 두 획에서 두 비가 1 대역으로 죽는다(같은 지표 — 50 규칙)
  await page.evaluate(() => (window as any).__b2.diag.setPressFlatForTest(true))
  await page.waitForTimeout(300)
  const weakF = await bandStats(page, 530, 398, 40, 24)
  const strongF = await bandStats(page, 530, 438, 40, 24)
  const dRatioF = strongF.pigPerPx / Math.max(1, weakF.pigPerPx)
  const wRatioF = strongF.rows / Math.max(1, weakF.rows)
  expect(Math.abs(dRatioF - 1), '반증 — 평탄화에서 농도 비가 1 대역').toBeLessThan(0.1)
  expect(Math.abs(wRatioF - 1), '반증 — 평탄화에서 굵기 비가 1 대역').toBeLessThan(0.15)
  await page.evaluate(() => (window as any).__b2.diag.setPressFlatForTest(false))
  await page.waitForTimeout(200)
  OUT.pressure = {
    def: '연필 가로획 둘(합성 펜 필압 0.2/0.9 · 40×24 상자) — 채색 행 수(굵기)·픽셀당 안료(농도). 반증 = setPressFlatForTest 재굽기에서 같은 두 비',
    weak, strong, width_ratio: +wRatio.toFixed(3), density_ratio: +dRatio.toFixed(3),
    flat: { weak: weakF, strong: strongF, width_ratio: +wRatioF.toFixed(3), density_ratio: +dRatioF.toFixed(3) },
  }
  // 상수의 «값»을 원장이 스스로 든다(50 2차 [3]의 규칙 — 라인 스냅샷 유보 아래)
  OUT.constants_used = await page.evaluate(() => {
    const c = (window as any).__b2.diag.paint50Constants()
    return { PAINT51_DPR_W_TOL: c.PAINT51_DPR_W_TOL, PAINT51_SWATCH_W_TOL: c.PAINT51_SWATCH_W_TOL }
  })
  OUT.gate_pressure = {
    registered: '농도 비 > 굵기 비(부등식 — 문턱 없는 순서 판정 · 프로필 상수는 C.PAINT51_*_SLOPE, 단위가 같은 함수로 잰다 #54)',
    value: 'pressure.density_ratio ↔ width_ratio',
    reachability: '평탄화 재굽기가 같은 실행에서 두 비를 1 대역으로 낸다',
    reachability_value: 'pressure.flat.density_ratio',
    reachability_source: '이 파일의 pressure.flat ↔ pressure',
  }
})

test('② 마커 팁 — 끝이 몸통보다 진하다 · D-3(평면 덮어쓰기 — 팁 생략)', async ({ page }) => {
  await room(page)
  await pickInstr(page, 'marker', '#1e7fd0', 12)
  await drawLine(page, 515, 420, 585, 420)
  await page.waitForTimeout(250)
  const tip = await bandStats(page, 578, 410, 14, 20)
  const mid = await bandStats(page, 540, 410, 14, 20)
  expect(tip.px).toBeGreaterThan(10)
  expect(mid.px).toBeGreaterThan(10)
  expect(tip.pigPerPx, '끝(팁)이 몸통보다 진하다 — «경계가 살짝 남는다»').toBeGreaterThan(mid.pigPerPx * 1.05)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(true))
  await page.waitForTimeout(250)
  const tipF = await bandStats(page, 578, 410, 14, 20)
  const midF = await bandStats(page, 540, 410, 14, 20)
  expect(tipF.pigPerPx, '반증 — 평면 덮어쓰기(팁 생략)에서 그 차가 죽는다').toBeLessThan(midF.pigPerPx * 1.05)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(false))
  await page.waitForTimeout(200)
  OUT.marker_tip = {
    def: '마커 가로획 — 끝 상자(578..592) ↔ 몸통 상자(540..554)의 픽셀당 안료. 문 1.05배. 반증 = setMarkerFlatForTest(팁이 안 찍힌다)',
    tip, mid, ratio: +(tip.pigPerPx / Math.max(1, mid.pigPerPx)).toFixed(3),
    flat: { tip: tipF, mid: midF, ratio: +(tipF.pigPerPx / Math.max(1, midF.pigPerPx)).toFixed(3) },
  }
})

test('③ 결이 면에 붙는다 — 줌 z배에서 상관 길이가 z배 · D-3(결 끔)', async ({ page }) => {
  await room(page)
  await pickInstr(page, 'pencil', '#3a6b35', 10)
  await drawPen(page, 510, 430, 594, 430, 0.6)
  await page.waitForTimeout(250)
  const committed = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  expect(committed, '연필 획이 실제로 섰다(측정 전 확인)').toBe(1)
  /** 띠 가운데 행의 «채색↔빈» 전이 수 — 고정 화면 창(60css px) 안에서 센다.
   *  결이 면 고정이면 줌 인(z배)에서 같은 창이 담는 면 길이가 1/z — 전이도 ~1/z.
   *  화면 고정 결이면 전이 수 불변(그것이 판별력이다 — 49 zoom_mm_retention의 형). */
  /** 띠 «가운데 행»의 결 프로파일 **상관 길이**(물리 px) — 40 회차 종이 결의 그 자
   *  (`paper_grain40`의 상관 길이 — 검증된 자를 재사용한다 #54). 결이 면 고정이면 줌
   *  z배에서 상관 길이도 ~z배(화면 고정이면 불변 — 그것이 판별력이다). 전이 수(초판
   *  둘)는 픽셀 잡음이 지배해 줌 전후가 같게 나왔다 — 그 실측이 이 자를 골랐다.
   *  요동 자체가 없으면(결 끔 — max−min < 8) 0을 낸다. */
  const corrLen = (cx: number, cy: number) => page.evaluate(([x0, y0]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(70 * dpr)
    const t = document.createElement('canvas')
    t.width = w; t.height = 2
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(((x0 as number) - 35) * dpr), Math.round((y0 as number) * dpr), w, 2, 0, 0, w, 2)
    const d = g.getImageData(0, 0, w, 2).data
    const raw: number[] = []
    for (let c = 0; c < w; c++) {
      const i = c * 4
      raw.push(d[i + 3]! > 8 ? (765 - d[i]! - d[i + 1]! - d[i + 2]!) * (d[i + 3]! / 255) : 0)
    }
    // 3px 평활(잡음) 후 평균 제거
    const sm: number[] = []
    for (let c = 0; c < raw.length; c++) {
      let s2 = 0, n2 = 0
      for (let k = -1; k <= 1; k++) { const v = raw[c + k]; if (v !== undefined) { s2 += v; n2++ } }
      sm.push(s2 / n2)
    }
    const mx = Math.max(...sm), mn = Math.min(...sm)
    if (mx - mn < 8) return 0                          // 요동 없음(결 끔 대역)
    const mean = sm.reduce((a, b) => a + b, 0) / sm.length
    const x = sm.map(v => v - mean)
    const denom = x.reduce((a, b) => a + b * b, 0)
    if (denom < 1e-9) return 0
    for (let lag = 1; lag < Math.min(40 * dpr, x.length - 2); lag++) {
      let s2 = 0
      for (let c = 0; c + lag < x.length; c++) s2 += x[c]! * x[c + lag]!
      if (s2 / denom < 0.3) return lag
    }
    return Math.min(40 * dpr, x.length - 2)
  }, [cx, cy] as unknown[])
  const c1 = await corrLen(552, 430)
  expect(c1, '결의 요동이 실제로 있다(상관 길이 > 0)').toBeGreaterThan(0)
  // D-3 — 결 끔 재굽기(같은 시점): 요동 자체가 죽는다(자가 0을 낸다)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  await page.waitForTimeout(300)
  const cOff = await corrLen(552, 430)
  expect(cOff, '반증 — 결 끔에서 요동이 죽는다(상관 길이 0)').toBe(0)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  await page.waitForTimeout(300)
  // 줌 인(휠 — 종이 확대) — 커서 중심이라 획 중심이 제자리에 남는다
  await page.mouse.move(552, 430)
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60) }
  await page.waitForTimeout(300)
  const z = await page.evaluate(() => (window as any).__b2.app.view?.s ?? 1)
  const c2 = await corrLen(552, 430)
  const ratio = c2 / Math.max(1, c1)
  OUT.grain_zoom = {
    def: '연필 획 가운데 행(70css px 창)의 결 상관 길이(물리 px · 40 회차의 그 자) — 줌 전/후. 결이 면 고정이면 비 ≈ z(view.s) · 화면 고정이면 1. 반증 = 결 끔에서 상관 길이 0(요동 소멸)',
    corr_len_z1: c1, corr_len_zoomed: c2, corr_len_grain_off: cOff, zoom: z, ratio: +ratio.toFixed(3),
  }
  expect(ratio, '줌 인에서 상관 길이가 늘어난다(결이 면을 따라 커진다)').toBeGreaterThan(Math.max(1.4, (z as number) * 0.45))
})

test('④ dpr 1↔3 — 굵기(물리 px ÷ dpr) 비가 1 ± C.PAINT51_DPR_W_TOL', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'dpr1', 'dpr1 프로젝트에서 한 번 — 안에서 dpr3 문맥을 스스로 연다')
  await room(page)
  await pickInstr(page, 'pencil', '#3a6b35', 10)
  await drawPen(page, 515, 430, 585, 430, 0.6)
  await page.waitForTimeout(250)
  const s1 = await bandStats(page, 530, 418, 40, 24)
  // dpr3 문맥 — 같은 장면을 다시 세운다
  const ctx3 = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1200, height: 800 }, baseURL: 'http://localhost:5301' })
  const p3 = await ctx3.newPage()
  await room(p3)
  await pickInstr(p3, 'pencil', '#3a6b35', 10)
  await drawPen(p3, 515, 430, 585, 430, 0.6)
  await p3.waitForTimeout(250)
  const s3 = await bandStats(p3, 530, 418, 40, 24)
  await ctx3.close()
  const w1 = s1.rows / 1, w3 = s3.rows / 3
  const tol = (await page.evaluate(() => (window as any).__b2.diag.paint50Constants())).PAINT51_DPR_W_TOL ?? 0.15
  OUT.dpr_width = {
    def: '같은 획(연필 · 필압 0.6)의 채색 행 수 ÷ dpr — dpr 1 ↔ 3(#26-2 계열). 문 = 1 ± C.PAINT51_DPR_W_TOL',
    w_css_dpr1: w1, w_css_dpr3: +w3.toFixed(2), ratio: +(w3 / Math.max(1, w1)).toFixed(3), tol,
  }
  expect(Math.abs(w3 / Math.max(1, w1) - 1), 'dpr 1↔3 굵기 비').toBeLessThan(tol)
})

test('⑤ 트레이 견본(원 지름 = w) == 자국 굵기(픽셀) · ⑥ Injector(행위)', async ({ page }) => {
  await room(page)
  // ⑤ — 마커 20px 칸: 견본은 지름 20의 원(구성 — 48-2의 그 문법), 자국의 띠 두께를 잰다
  await pickInstr(page, 'marker', '#1e7fd0', 20)
  await drawLine(page, 515, 435, 585, 435)          // 벽 «중심» 대역 — 환산(pxPerUnit)의 원점
  await page.waitForTimeout(250)
  const band = await bandStats(page, 535, 419, 30, 32)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  const wCss = band.rows / dpr
  OUT.swatch = {
    def: '마커 w=20 자국의 띠 두께(채색 행 ÷ dpr) ↔ 견본 20(트레이 원 지름 — 구성 · 48-2 문법). 문 = 상대 편차 < C.PAINT51_SWATCH_W_TOL',
    tray_px: 20, stroke_px: +wCss.toFixed(2), tol: cs.PAINT51_SWATCH_W_TOL,
    note_5: '견본 쪽이 «지름 = w»인 것은 SVG의 구성이다(#5) — 재는 쪽은 자국이다. 잰 자리는 벽 가운데(그은 그 자리 — 원근 환산의 원점)',
  }
  expect(Math.abs(wCss - 20) / 20, '견본 == 자국(±tol)').toBeLessThan(cs.PAINT51_SWATCH_W_TOL)
  // ⑥ — Injector: 다른 도구·색·굵기로 바꾼 뒤 그 획을 «탭»하면 속성이 돌아온다(#94 — 행위)
  await pickInstr(page, 'cp', '#c07a5b', 2.5)
  await page.mouse.click(550, 435)
  await page.waitForTimeout(150)
  const sel = await page.evaluate(() => (window as any).__b2.app.paintSel)
  expect(sel.i, 'Injector — 도구').toBe('marker')
  expect(sel.hex, 'Injector — 색').toBe('#1e7fd0')
  expect(Math.abs(sel.w - 20) / 20, 'Injector — 굵기(환산 왕복)').toBeLessThan(0.05)
  // 부정 대조(D-3) — 허공 탭은 아무것도 안 바꾼다
  await pickInstr(page, 'cp', '#c07a5b', 2.5)
  await page.mouse.click(300, 200)
  await page.waitForTimeout(150)
  const sel2 = await page.evaluate(() => (window as any).__b2.app.paintSel)
  expect(sel2.i, '허공 탭 — 불변').toBe('cp')
  OUT.injector = {
    def: '실제 탭(마우스 클릭 — 행위 #94)이 짚은 마커 획의 (i, c, w)를 paintSel에 싣는다 · 허공 탭은 불변. 도구 넷 전수는 단위(brush51.test)가 잰다',
    after_tap: sel, after_empty_tap: sel2.i,
  }
})

test('⑦ 붓 — 끝 갈라짐(끝이 몸통보다 넓다) · 흐름(길이 방향 요동 — 기록)', async ({ page }) => {
  await room(page)
  await pickInstr(page, 'brush', '#a8a29a', 10)
  await drawPen(page, 510, 440, 592, 440, 0.6)
  await page.waitForTimeout(250)
  /** 붓은 무채색(흑연) — 채도 자 대신 «어두움» 행 수로 잰다 */
  const darkRows = (x: number, w: number) => page.evaluate(([x0, ww]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((ww as number) * dpr); t.height = Math.round(36 * dpr)
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round(422 * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let rows = 0
    const colPig: number[] = []
    for (let c = 0; c < t.width; c++) colPig.push(0)
    for (let r = 0; r < t.height; r++) {
      let has = false
      for (let c = 0; c < t.width; c++) {
        const i = (r * t.width + c) * 4
        const a = d[i + 3]! / 255
        if (a > 0.03) {
          const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) * a + 255 * (1 - a)
          if (lum < 235) { has = true; colPig[c]! += 255 - lum }
        }
      }
      if (has) rows++
    }
    return { rows, colPig }
  }, [x, w] as unknown[])
  const mid = await darkRows(540, 16)
  const end = await darkRows(578, 16)
  expect(mid.rows, '몸통이 있다').toBeGreaterThan(3)
  expect(end.rows, '끝이 몸통보다 넓다(갈라짐)').toBeGreaterThan(mid.rows * 1.1)
  // 흐름 — 열별 안료의 변동 계수(길이 방향 요동 · 기록 — 눈 판정은 실기기 ⚑)
  const whole = await darkRows(515, 70)
  const cp2 = whole.colPig.filter(v => v > 0)
  const mean = cp2.reduce((a, b) => a + b, 0) / Math.max(1, cp2.length)
  const sd = Math.sqrt(cp2.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, cp2.length))
  OUT.brush_flow = {
    def: '붓 가로획 — 끝(578..594) ↔ 몸통(540..556)의 어두운 행 수(갈라짐 · 문 1.1배) · 열별 안료 변동 계수(흐름 — 기록·눈 판정은 실기기)',
    mid_rows: mid.rows, end_rows: end.rows, split_ratio: +(end.rows / Math.max(1, mid.rows)).toFixed(3),
    flow_cv: +(sd / Math.max(1, mean)).toFixed(3),
  }
  expect(sd / Math.max(1, mean), '흐름 — 요동이 실제로 있다(0이 아니다)').toBeGreaterThan(0.05)
})

test('⑧ 색연필 — 색이 완전히 덮이지 않는다(빈 알갱이 > 마커)', async ({ page }) => {
  await room(page)
  await pickInstr(page, 'cp', '#c07a5b', 12)
  await drawPen(page, 515, 415, 585, 415, 0.7)
  await pickInstr(page, 'marker', '#c07a5b', 12)
  await drawLine(page, 515, 455, 585, 455)
  await page.waitForTimeout(250)
  /** «덜 덮인» 비율 — 띠(팁을 피한 몸통 창 40css px) 안 픽셀의 안료 분포에서
   *  중앙값의 60% 아래인 픽셀의 비율. cp는 빈 알갱이(피복 건너뜀)가 그 몫을 만들고
   *  마커는 평평한 띠라 0 대역이다. ⚠ 초판(«채색 아님» 이진)은 건너뜀 도장(옅은 알파)도
   *  채색으로 세어 아무것도 못 갈랐다(0.098 ↔ 0.084 — 그 실측이 이 재정의의 사유). */
  const gapFrac = (y0: number) => page.evaluate(([yy]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(40 * dpr), h = Math.round(26 * dpr)
    const t = document.createElement('canvas')
    t.width = w; t.height = h
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(530 * dpr), Math.round(((yy as number) - 13) * dpr), w, h, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const pig: number[] = []
    const rows: number[] = []
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = (r * w + c) * 4
        const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!), mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!)
        if (d[i + 3]! > 8 && mx - mn > 15) {
          pig.push((765 - d[i]! - d[i + 1]! - d[i + 2]!) * (d[i + 3]! / 255))
          if (!rows.includes(r)) rows.push(r)
        }
      }
    }
    if (pig.length < 20) return { frac: 0, band: 0 }
    const sorted = [...pig].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]!
    // 분모는 띠 «대역 전체»다 — 맨살 구멍(채색 아님)도 «덜 덮임»이다(초판이 그것을
    // 분모에서 빼서 cp의 구멍이 아예 안 세어졌다 — 그 실측이 이 정정의 사유).
    // 가장자리 AA 행을 깎는다(dpr 비례) — 마커의 위·아래 경계 반픽셀이 «덜 덮임»으로
    // 세어지면 분모가 오염된다(dpr2 실측 0.11 — 그 몫이 판별을 지웠다). 내부만 잰다.
    const trim = Math.ceil(2 * dpr)
    const rLo = Math.min(...rows) + trim, rHi = Math.max(...rows) - trim
    if (rHi - rLo < 4) return { frac: 0, band: rows.length }
    let total = 0, light = 0
    for (let r = rLo; r <= rHi; r++) {
      for (let c = 0; c < w; c++) {
        const i = (r * w + c) * 4
        total++
        const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!), mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!)
        const colored = d[i + 3]! > 8 && mx - mn > 15
        if (!colored) { light++; continue }
        const v = (765 - d[i]! - d[i + 1]! - d[i + 2]!) * (d[i + 3]! / 255)
        if (v < med * 0.6) light++
      }
    }
    let bare = 0
    for (let r = rLo; r <= rHi; r++) for (let c = 0; c < w; c++) { const i=(r*w+c)*4; const mx=Math.max(d[i]!,d[i+1]!,d[i+2]!),mn=Math.min(d[i]!,d[i+1]!,d[i+2]!); if(!(d[i+3]!>8&&mx-mn>15)) bare++ }
    return { frac: +(light / total).toFixed(4), band: rows.length, med: +med.toFixed(1), bare, total }
  }, [y0] as unknown[])
  const cp = await gapFrac(415)
  const mk = await gapFrac(455)
  expect(cp.band, '색연필 띠가 있다').toBeGreaterThan(4)
  expect(mk.band, '마커 띠가 있다').toBeGreaterThan(4)
  expect(cp.frac, '색연필의 빈 알갱이 비율이 마커보다 크다(«완전히 덮이지 않는다»)').toBeGreaterThan(mk.frac + 0.03)
  OUT.cp_coverage = {
    def: '같은 색·같은 굵기의 색연필(필압 0.7)·마커 — 띠 bbox 안 «빈 픽셀» 비율. 판별 = cp > 마커 + 0.03',
    cp, marker: mk,
  }
})

test('원장', async ({}, info) => {
  const dpr = info.project.name === 'dpr2' ? 2 : 1
  ;(OUT as any).no_constants_snapshot = true
  ;(OUT as any).pitfall_citations = [5, 12, 26, 54, 82, 92, 94]
  const dir = resolve(HERE, '../../stage0/out')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `brush51_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
})
