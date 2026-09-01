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


// ⚠⚠ **#99의 근본 수리** — 원장을 «팔마다 병합-쓰기»한다. 누산기(OUT)는 워커 재시작
// (파일·프로젝트 경계 · 비결정)에서 초기화되므로, 마지막 「원장」 팔 하나가 쓰는 구조는
// 초록인데 빈 원장을 낸다(paint50 dpr2가 파일 단위 호출에서도 비었다 — 그 실측).
// 병합이라 이전 실행의 같은 이름 열쇠는 덮이고, **필드를 개명하면 파일을 지우고 재생성**
// 해야 유령 열쇠가 안 남는다(그 유보는 이 주석이 든다).
import { readFileSync } from 'node:fs'
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/brush51_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true /* 첫 실행 또는 읽기 실패 */ }
  // 방어 — 파일이 «있는데» 못 읽었으면 쓰지 않는다(빈 prev로 덮으면 누산이 통째로 지워진다)
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 진짜 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...prev, ...OUT }, null, 2))
})

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
  await page.mouse.click(550, 436); await page.waitForTimeout(80)
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
  const cs0 = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(dRatio, '농도 비가 굵기 비보다 크다(여유 C.PAINT51_GATE_MARGIN — 26-6 픽셀 판)')
    .toBeGreaterThan(wRatio + cs0.PAINT51_GATE_MARGIN)
  // D-3 — 평탄화 재굽기: 같은 두 획에서 두 비가 1 대역으로 죽는다(같은 지표 — 50 규칙)
  await page.evaluate(() => (window as any).__b2.diag.setPressFlatForTest(true))
  await page.waitForTimeout(300)
  const weakF = await bandStats(page, 530, 398, 40, 24)
  const strongF = await bandStats(page, 530, 438, 40, 24)
  const dRatioF = strongF.pigPerPx / Math.max(1, weakF.pigPerPx)
  const wRatioF = strongF.rows / Math.max(1, weakF.rows)
  // 반증은 **등재된 그 술어**를 뒤집어야 한다(1차 [3] — 초판 «1 대역» 판은 다른 명제였고
  // 등재 부등식은 평탄화에서도 참(0.955 > 0.9)이었다 — 여유가 그 반증을 세운다)
  expect(dRatioF > wRatioF + cs0.PAINT51_GATE_MARGIN, '반증 — 평탄화에서 등재 술어가 거짓이 된다').toBe(false)
  expect(Math.abs(dRatioF - 1), '평탄화에서 농도 비가 1 대역(보조 관측)').toBeLessThan(0.1)
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
    return {
      PAINT51_DPR_W_TOL: c.PAINT51_DPR_W_TOL, PAINT51_SWATCH_W_TOL: c.PAINT51_SWATCH_W_TOL,
      PAINT51_DENSITY_SLOPE: c.PAINT51_DENSITY_SLOPE, PAINT51_WIDTH_SLOPE: c.PAINT51_WIDTH_SLOPE,
      PAINT51_GATE_MARGIN: c.PAINT51_GATE_MARGIN, PAINT51_TIP_MIN_RATIO: c.PAINT51_TIP_MIN_RATIO,
      PAINT51_SPLIT_MIN_RATIO: c.PAINT51_SPLIT_MIN_RATIO, PAINT51_FLOW_CV_MIN: c.PAINT51_FLOW_CV_MIN,
      PAINT51_CP_COVER_MARGIN: c.PAINT51_CP_COVER_MARGIN,
      PAINT51_GRAIN_ZOOM_K: c.PAINT51_GRAIN_ZOOM_K, PAINT51_GRAIN_ZOOM_FLOOR: c.PAINT51_GRAIN_ZOOM_FLOOR,
    }
  })
  OUT.gate_pressure = {
    registered: '농도 비 > 굵기 비 + C.PAINT51_GATE_MARGIN(값은 constants_used) · 프로필 상수 C.PAINT51_*_SLOPE(값도 constants_used — 단위가 같은 함수로 잰다 #54)',
    value: 'pressure.density_ratio ↔ width_ratio',
    reachability: '평탄화 재굽기가 같은 실행에서 **등재 술어 그 자체**를 거짓으로 만든다(1차 [3] 대응 — 같은 지표 반전)',
    reachability_value: 'pressure.flat — density_ratio ↔ width_ratio(여유 아래)',
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
  const csT = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(tip.pigPerPx, '끝(팁)이 몸통보다 진하다(문 C.PAINT51_TIP_MIN_RATIO)').toBeGreaterThan(mid.pigPerPx * csT.PAINT51_TIP_MIN_RATIO)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(true))
  await page.waitForTimeout(250)
  const tipF = await bandStats(page, 578, 410, 14, 20)
  const midF = await bandStats(page, 540, 410, 14, 20)
  expect(tipF.pigPerPx, '반증 — 평면 덮어쓰기(팁 생략)에서 같은 술어가 죽는다').toBeLessThan(midF.pigPerPx * csT.PAINT51_TIP_MIN_RATIO)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(false))
  await page.waitForTimeout(200)
  OUT.marker_tip = {
    def: '마커 가로획 — 끝 상자(578..592) ↔ 몸통 상자(540..554)의 픽셀당 안료. 문 C.PAINT51_TIP_MIN_RATIO(값은 constants_used). 반증 = setMarkerFlatForTest(팁이 안 찍힌다 — 같은 술어가 죽는다)',
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
    def: '연필 획 가운데 행(70css px 창)의 결 상관 길이(물리 px · 40 회차의 그 자 #54) — 줌 전/후 + 궤도 회전 후. 결이 면 고정이면 비가 z 대역 · 화면 고정이면 1. 반증 = 결 끔에서 상관 길이 0(요동 소멸). 초판 두 자의 실패값(재설계의 사유): (1) «세로 어디든 채색» 이진 — 띠가 촘촘해 전 열 참, 전이 0(포화) (2) 전이 수 — 픽셀 잡음 지배로 줌 전후 비가 정확히 1.000',
    corr_len_z1: c1, corr_len_zoomed: c2, corr_len_grain_off: cOff, zoom: z, ratio: +ratio.toFixed(3),
  }
  const csG = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(ratio, '줌 인에서 상관 길이가 늘어난다(문 max(FLOOR, K x z) — 상수는 constants_used)')
    .toBeGreaterThan(Math.max(csG.PAINT51_GRAIN_ZOOM_FLOOR, (z as number) * csG.PAINT51_GRAIN_ZOOM_K))
  // 회전(리뷰어 [9]) — 시점을 실제로 돌리고(궤도 몸짓) 결이 살아 있는가를 값으로 남긴다.
  // 줌 판이 «면 고정 ↔ 화면 고정»의 스케일 판별을 들고, 회전 판은 그 시점에서의 존재다.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(640, 412, { steps: 6 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(300)
  const midNow = await page.evaluate(() => {
    const w = (window as any).__b2
    const s = w.app.doc.strokes.find((x: any) => x.paint !== undefined)
    const g3 = w.app.paintGeo.get(s.id)
    const m = g3[Math.floor(g3.length / 2)]
    const pr = w.diag.projectWith(w.app.pose, m)
    const vx = w.app.view ?? { s: 1, ox: 0, oy: 0 }
    return { x: pr.x * (vx.s ?? 1) + (vx.ox ?? 0), y: pr.y * (vx.s ?? 1) + (vx.oy ?? 0) }
  })
  const cRot = await corrLen(midNow.x, midNow.y)
  ;(OUT.grain_zoom as Record<string, unknown>).corr_len_rotated = cRot
  ;(OUT.grain_zoom as Record<string, unknown>).rotated_probe_at = midNow
  expect(cRot, '돌린 시점에서도 결이 있다(상관 길이 > 0)').toBeGreaterThan(0)
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
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  // 견본의 **렌더 실측**(리뷰어 [7] — 34-3의 그 규약: 구성값이 아니라 그려진 지름)
  await page.click('#btn-paint')
  if (await page.locator('#painttray.open').count() === 0) await page.click('#btn-paint')
  const cells: number[] = await page.evaluate(() =>
    [...document.querySelectorAll('#paint-sizes .sizebtn circle')].map(c => c.getBoundingClientRect().width))
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  // 자국 — 다섯 칸 전수(#12 · 34-3의 전수 규약). 벽 중심 대역에 y를 갈라 긋는다.
  const trays = [2.5, 5, 10, 20, 40]
  const centers = [388, 399, 413, 436, 468]          // 겹치지 않게 굵기에 맞춘 간격(벽 안)
  const rowsOf: number[] = []
  for (let k = 0; k < trays.length; k++) {
    await pickInstr(page, 'marker', '#1e7fd0', trays[k]!)
    const y = centers[k]!
    await drawLine(page, 515, y, 585, y)
    await page.waitForTimeout(150)
    const b = await bandStats(page, 545, y - trays[k]! / 2 - 3, 16, trays[k]! + 6)
    rowsOf.push(b.rows / dpr)
  }
  OUT.swatch = {
    def: '다섯 칸 전수(#12 · 34-3의 전수 규약) — 견본 원의 «렌더» 지름(getBoundingClientRect)과 그은 자국의 띠 두께(채색 행 / dpr). 문 = 상대 편차 < C.PAINT51_SWATCH_W_TOL(2.5 칸은 물리 행 눈금이 거칠어 기록만 — 판정은 5 이상 네 칸). 반증 = 틀린 짝(20 자국 <-> 40 견본)이 같은 자로 문 밖(cross_mismatch)',
    swatch_rendered_px: cells, tray_px: trays, stroke_px: rowsOf.map(v => +v.toFixed(2)),
    tol: cs.PAINT51_SWATCH_W_TOL,
    cross_mismatch: +(Math.abs(rowsOf[3]! - trays[4]!) / trays[4]!).toFixed(3),
  }
  for (let k = 1; k < trays.length; k++) {
    expect(Math.abs(rowsOf[k]! - trays[k]!) / trays[k]!, '칸 ' + trays[k] + ' — 견본 == 자국').toBeLessThan(cs.PAINT51_SWATCH_W_TOL)
    expect(Math.abs(cells[k]! - trays[k]!) / trays[k]!, '칸 ' + trays[k] + ' — 견본 렌더 지름 == 구성').toBeLessThan(0.2)
  }
  expect(Math.abs(rowsOf[3]! - trays[4]!) / trays[4]!, '반증 — 틀린 짝은 문 밖').toBeGreaterThan(cs.PAINT51_SWATCH_W_TOL)
  // 연필 줄 34-0의 «행위» 값(리뷰어 [12] — 쓸 수 있는 상태에서 뜨는가 · 그 점의 맨 위인가)
  // ⚠ 재누름은 토글이라(46 문법) «열려 있음»을 값으로 확인한다(paint48 pickPaint의 그 규약)
  await page.click('#btn-paint')
  if (await page.locator('#painttray.open').count() === 0) await page.click('#btn-paint')
  const pencilBtn = await page.evaluate(() => {
    const b = document.getElementById('btn-paint-pencil') as HTMLButtonElement
    const r = b.getBoundingClientRect()
    const onTop = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { title: b.title, disabled: b.disabled, clickable: onTop === b || b.contains(onTop as Node) }
  })
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  expect(pencilBtn.title.length, '연필 줄 — 쓸 수 있는 상태에서 문구가 있다').toBeGreaterThan(0)
  expect(pencilBtn.disabled, '연필 줄 — 쓸 수 있다').toBe(false)
  expect(pencilBtn.clickable, '연필 줄 — 그 점의 맨 위가 그 단추(#97 행위)').toBe(true)
  OUT.pencil_row_340 = pencilBtn
  // ⑥ — Injector: 20 칸의 그 획(y=436)을 «탭»하면 속성이 돌아온다(#94 — 행위)
  await pickInstr(page, 'cp', '#c07a5b', 2.5)
  await page.mouse.click(550, 436)
  await page.waitForTimeout(150)
  const sel = await page.evaluate(() => (window as any).__b2.app.paintSel)
  expect(sel.i, 'Injector — 도구').toBe('marker')
  expect(sel.hex, 'Injector — 색').toBe('#1e7fd0')
  expect(Math.abs(sel.w - 20) / 20, 'Injector — 굵기(환산 왕복)').toBeLessThan(0.05)
  const injExpected = { i: 'marker', hex: '#1e7fd0', w: 20 }   // 짚은 획의 원 값(대조군 — [16])
  // 부정 대조(D-3) — 허공 탭은 아무것도 안 바꾼다
  await pickInstr(page, 'cp', '#c07a5b', 2.5)
  await page.mouse.click(300, 200)
  await page.waitForTimeout(150)
  const sel2 = await page.evaluate(() => (window as any).__b2.app.paintSel)
  expect(sel2.i, '허공 탭 — 불변').toBe('cp')
  OUT.injector = {
    def: '실제 탭(행위 #94)이 짚은 마커 획의 (i, c, w)를 paintSel에 싣는다 · 허공 탭 불변. expected = 짚은 획을 그렸을 때의 값(대조군). 도구 넷 전수는 단위(brush51.test — 왕복 1% 안). ⚠ «모든 속성»의 현행 외연은 (i, c, w)다 — 불투명도는 도구 상수라 획별 값이 없다(생기는 날 Injector도 늘린다 — DEFERRED)',
    expected: injExpected, after_tap: sel, after_empty_tap: sel2.i,
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
  const csB = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(end.rows, '끝이 몸통보다 넓다(문 C.PAINT51_SPLIT_MIN_RATIO)').toBeGreaterThan(mid.rows * csB.PAINT51_SPLIT_MIN_RATIO)
  // 흐름 — 열별 안료의 변동 계수(길이 방향 요동 · 기록 — 눈 판정은 실기기 ⚑)
  const whole = await darkRows(515, 70)
  const cp2 = whole.colPig.filter(v => v > 0)
  const mean = cp2.reduce((a, b) => a + b, 0) / Math.max(1, cp2.length)
  const sd = Math.sqrt(cp2.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, cp2.length))
  OUT.brush_flow = {
    def: '붓 가로획 — 끝(578..594) ↔ 몸통(540..556)의 어두운 행 수(갈라짐 · 문 C.PAINT51_SPLIT_MIN_RATIO) · 열별 안료 변동 계수(흐름 · 문 C.PAINT51_FLOW_CV_MIN — 눈 판정은 실기기)',
    mid_rows: mid.rows, end_rows: end.rows, split_ratio: +(end.rows / Math.max(1, mid.rows)).toFixed(3),
    flow_cv: +(sd / Math.max(1, mean)).toFixed(3),
  }
  expect(sd / Math.max(1, mean), '흐름 — 요동이 실제로 있다(문 C.PAINT51_FLOW_CV_MIN)').toBeGreaterThan(csB.PAINT51_FLOW_CV_MIN)
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
  const csC = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(cp.frac, '색연필의 «덜 덮인» 비율이 마커보다 크다(여유 C.PAINT51_CP_COVER_MARGIN)').toBeGreaterThan(mk.frac + csC.PAINT51_CP_COVER_MARGIN)
  OUT.cp_coverage = {
    def: '같은 색·같은 굵기의 색연필(필압 0.7)·마커 — 띠 내부(가장자리 AA 깎음)의 «덜 덮인 픽셀»(중앙값 60% 아래 + 맨살) 비율. 판별 = cp > 마커 + C.PAINT51_CP_COVER_MARGIN. 초판 두 판의 실패값(재설계의 사유): (1) «채색 아님» 이진 — 건너뜀 도장(옅은 알파)도 채색으로 세어 cp 0.098 / mk 0.084(무변별) (2) 도장 건너뜀 구현 — 이웃 번짐이 칸을 메워 내부 맨살 0. 현행을 가른 값은 frac(0.23/0.39 대역 / 마커 0)이다',
    cp, marker: mk,
  }
})

test('⑨ 성능 — 브러시 넷이 든 뒤의 프레임(#82 — 차 · 잡음 바닥)과 재굽기 ms', async ({ page }) => {
  // 지시 «브러시가 는 뒤 면 20개 장면의 프레임». 스무 면 픽스처는 paint50 ⚑(같은 LEDGER
  // 실행의 tex_budget — 마커 40획)가 든다 — 여기서는 **네 도구가 전부 든** 방 장면의
  // 프레임 차(#82 · before↔before2 = 잡음 바닥)와 **재굽기 ms**(브러시 절차 생성의 비용
  // 그 자체 — rebakePaintTex 5회)를 잰다. 판정은 실기기 몫(rep49 frame20의 그 유보).
  await room(page)
  const frame = () => page.evaluate(async () => {
    const w = window as any
    const dts: number[] = []
    let prev = performance.now()
    for (let i = 0; i < 40; i++) {
      await new Promise<void>(res => requestAnimationFrame(() => res()))
      w.__b2.diag.invalidate?.()
      const now = performance.now()
      dts.push(now - prev); prev = now
    }
    dts.sort((a, b) => a - b)
    return { median: dts[Math.floor(dts.length / 2)]!, p90: dts[Math.floor(dts.length * 0.9)]! }
  })
  const before = await frame()
  const before2 = await frame()
  const instrs: [string, string, number][] = [
    ['pencil', '#3a6b35', 8], ['marker', '#1e7fd0', 12], ['cp', '#c07a5b', 8], ['brush', '#a8a29a', 10],
  ]
  let y = 396
  for (const [i, hex, w] of instrs) {
    await pickInstr(page, i, hex, w)
    for (let k = 0; k < 3; k++) { await drawPen(page, 512, y, 590, y, 0.4 + k * 0.2); y += 9 }
  }
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(300)
  const after = await frame()
  const bake = await page.evaluate(async () => {
    const w = window as any
    const ms: number[] = []
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now()
      w.__b2.diag.rebakePaintTex()
      await new Promise<void>(res => requestAnimationFrame(() => setTimeout(res, 30)))
      ms.push(performance.now() - t0)
    }
    ms.sort((a, b) => a - b)
    return { median: +ms[2]!.toFixed(1), max: +ms[4]!.toFixed(1) }
  })
  const paints = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  OUT.perf = {
    def: '네 도구 x 3획(합성 펜 필압 0.4/0.6/0.8)이 든 방 — 프레임 dt(중앙·p90 · #82: 차는 before2 기준, 잡음 바닥 = |before−before2| 중앙값 차) · 재굽기 ms(rebakePaintTex 5회 — rAF+30ms 대기 포함이라 상한 기록). 판정은 실기기 몫(rep49 frame20의 유보 그대로 — 헤드리스 소프트웨어 GL)',
    paint_strokes: paints,
    before_ms: before, before2_ms: before2, noise_floor_ms: +Math.abs(before2.median - before.median).toFixed(2),
    after_ms: after, delta_median_ms: +(after.median - before2.median).toFixed(2),
    delta_p90_ms: +(after.p90 - before2.p90).toFixed(2),
    bake_ms: bake,
    note_20faces: '스무 면 축은 paint50 tex_budget(마커 40획 · 면 17)이 든다 — 이 팔은 «도구 넷» 축이다(#12의 축 배분)',
  }
  expect(paints, '열두 붓이 실제로 섰다').toBeGreaterThanOrEqual(10)
})

test('원장', async ({}, info) => {
  const dpr = info.project.name === 'dpr2' ? 2 : 1
  ;(OUT as any).no_constants_snapshot = true
  ;(OUT as any).pitfall_citations = [5, 12, 26, 54, 82, 92, 94]   // #12 축 배분·#82 차·#92 자 — 본문 def들이 든다
  const dir = resolve(HERE, '../../stage0/out')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `brush51_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
})
