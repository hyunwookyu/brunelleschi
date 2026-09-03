// web2-60 — 자국의 질: 값의 자리 게이트(59의 구조 위). 값의 «최종»은 사람이 정한다 — 이 스펙은
// «기본값 상태»와 «출발점 상태»가 무엇을 내는지, 그리고 손잡이·구조가 실제로 그 값을 만드는지를
// 잰다(D-3: 반증 팔 = 기본값 · 손잡이 0).
//
//   ① 둥근 도장이 안 보인다 — 가장자리 행 어둡기의 «도장 간격 주기» 진폭(DFT 한 칸 ÷ 평균).
//      기본값(경도 1 · 산포 0 · 간격 0.25w)이 문 위(반증) · mypaint 출발점이 문 아래. 결 끔.
//   ② 색연필에 구멍이 있다 · 압력이 «몫»을 움직인다 — 빈 픽셀 몫(0.2 vs 0.8) · D-3: cpBurnish 0.
//   ③ 층이 쌓인다 — 같은 자리 두 번째·세 번째 획: 어둡기 지도가 «같은 봉우리»(상관 ≥ 문)이되 1이
//      아니고, 어둡기가 회마다 는다(획 사이는 쌓인다 — 59의 계약 그대로).
//   ④ 잉크 경로 — 마커 자기 교차는 안 진해지고(59 ② 그대로 · AS-C175), 마커 두 획의 교차는
//      진해진다(46 계약). 구조가 이미 서 있음을 값으로.
//   ⑤ 넷이 갈린다 — 같은 압력·같은 속도의 넷: 통계(농도 p95 · 빈 픽셀 몫 · 가장자리 거칠기)의
//      짝별 최대 상대 차 > 0.1.
//   ⑥ 실험실 — 낙서판이 손잡이 «옆»에 붙어 있다(스크롤 뒤에도 보인다) · 새 손잡이 다섯이 자국을
//      바꾼다(전제 축 포함) · 출발점 단추가 도구별 표를 얹는다 · 값 꺼내기/가져오기 왕복.
//
// 원장: stage0/out/quality60_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-60 — 자국의 질: ① 도장 주기 진폭(기본 vs mypaint 출발점) ② 색연필 빈 픽셀 몫 vs 압력(반증 cpBurnish 0) ③ 층 상관·누적 ④ 마커 자기/상호 교차 ⑤ 넷의 통계 갈림 ⑥ 실험실(낙서판 옆 · 손잡이 다섯 · 출발점 · 값 왕복)',
  note_pitfalls: '#103(두 조건 사이 장면 값 — placed·rebake) · #102(?reset 재호출 0) · #101(web2 러너) · #99(병합-쓰기·열쇠 수) · #12·#13(문턱 훑기: ① 진폭 문 3점 · ② 압력 4점) · #5(③의 자기 대조 1은 결정론 — 판정은 «다른 획»의 상관) · #92(판정자는 픽셀·수)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/quality60_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/quality60.spec.ts (워커 1 — #99)' },
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

/** rep49·paint50·paint59의 그 상자 — 오른쪽 벽 (500,700)(900,610)(900,330)(500,330) · 축척 2500mm */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
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
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

const INSTRS = ['brush', 'marker', 'cp', 'pencil'] as const
type Instr = typeof INSTRS[number]

async function pickInstr(page: Page, i: Instr, w = 20, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    (window as any).__b2.app.paintSel = { hex: h, i, w }
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

async function undoPaint(page: Page) {
  for (let k = 0; k < 20; k++) {
    const n = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
    if (n === 0) break
    await page.click('#btn-undo')
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(150)
}

/** 합성 펜 획(brush51 drawPen의 그 통로 #54) — 점렬 그대로 · 압력 상수 */
async function penPath(page: Page, pts: { x: number; y: number }[], press: number) {
  await page.evaluate(([list, pr]) => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const L = list as { x: number; y: number }[]
    fire('pointerdown', L[0]!.x, L[0]!.y, pr as number, 1)
    for (let i = 1; i < L.length; i++) fire('pointermove', L[i]!.x, L[i]!.y, pr as number, 1)
    fire('pointerup', L[L.length - 1]!.x, L[L.length - 1]!.y, 0, 0)
  }, [pts, press] as unknown[])
  await page.waitForTimeout(150)
}
const hline = (x0: number, y: number, x1: number, n = 12) => {
  const out: { x: number; y: number }[] = []
  for (let k = 0; k <= n; k++) out.push({ x: x0 + (x1 - x0) * (k / n), y })
  return out
}

/** #gl 창의 어둡기 지도(물리 px) — 페이지 안 기억 */
const darkMap = (page: Page, key: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(([k, x0, y0, ww, hh]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((ww as number) * dpr); t.height = Math.round((hh as number) * dpr)
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const out: number[] = []
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      out.push(a > 0 ? (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) * a : 0)
    }
    const w2 = window as any
    w2.__q60 = w2.__q60 || {}
    w2.__q60[k as string] = { v: out, w: t.width, h: t.height }
    return { w: t.width, h: t.height, mean: +(out.reduce((a, b) => a + b, 0) / out.length).toFixed(2) }
  }, [key, x, y, w, h] as unknown[])

/** 지도 통계 — 평균 · p95 · 빈 픽셀 몫(어둡기 < 문 · 문이 0..1이면 «p95의 비율» — 압력이 알파를 바꿔도
 *  구멍(잔량 cpSkipAlpha/alpha ≈ .26)만 세게) · 가장자리 행 거칠기(상단 잉크 경계의 행 표준편차) */
const mapStats = (page: Page, key: string, bareTh: number) =>
  page.evaluate(([k, th0]) => {
    const m = (window as any).__q60[k as string] as { v: number[]; w: number; h: number }
    const v = m.v
    const sorted = [...v].sort((a, b) => a - b)
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!
    const th = (th0 as number) <= 1 ? (th0 as number) * p95 : (th0 as number)
    let bare = 0
    for (const x of v) if (x < th) bare++
    // 상단 경계: 열마다 위에서 처음 어둡기 > 문인 행 — 그 행 번호의 표준편차(도장 물결·구멍이 만든다)
    const edge: number[] = []
    for (let c = 0; c < m.w; c++) {
      let r = -1
      for (let rr = 0; rr < m.h; rr++) { if (v[rr * m.w + c]! > (th as number)) { r = rr; break } }
      if (r >= 0) edge.push(r)
    }
    const em = edge.reduce((a, b) => a + b, 0) / Math.max(1, edge.length)
    const esd = Math.sqrt(edge.reduce((a, b) => a + (b - em) * (b - em), 0) / Math.max(1, edge.length))
    return { mean: +mean.toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)]!.toFixed(1), bare_share: +(bare / v.length).toFixed(4), edge_sd: +esd.toFixed(3), n: v.length }
  }, [key, bareTh] as unknown[])

/** 두 지도의 피어슨 상관(잉크 있는 픽셀 · 평균 제거) */
const corrMaps = (page: Page, a: string, b: string) =>
  page.evaluate(([ka, kb]) => {
    const w2 = (window as any).__q60
    const A = w2[ka as string].v as number[], B = w2[kb as string].v as number[]
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < A.length; i++) if (A[i]! > 6 || B[i]! > 6) { xs.push(A[i]!); ys.push(B[i]!) }
    const n = xs.length
    if (n < 30) return { n, corr: null }
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
    return { n, corr: sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(4) : null }
  }, [a, b] as unknown[])

/** 가장자리 행(획 중심에서 rowOff px)의 어둡기를 x를 따라 읽고 «주기 P(px)»의 DFT 진폭 ÷ 평균 */
const rippleAt = (page: Page, x0: number, y: number, len: number, periodCss: number) =>
  page.evaluate(([x0, y, len, P]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const w = Math.round((len as number) * dpr)
    const t = document.createElement('canvas')
    t.width = w; t.height = 1
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round((x0 as number) * dpr), Math.round((y as number) * dpr), w, 1, 0, 0, w, 1)
    const d = g.getImageData(0, 0, w, 1).data
    const v: number[] = []
    for (let i = 0; i < w; i++) { const a = d[i * 4 + 3]! / 255; v.push(a > 0 ? (255 - (d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]!) / 3) * a : 0) }
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    const per = (P as number) * dpr
    const amp = (p: number) => {
      let re = 0, im = 0
      for (let i = 0; i < v.length; i++) { const ph = 2 * Math.PI * i / p; re += (v[i]! - mean) * Math.cos(ph); im += (v[i]! - mean) * Math.sin(ph) }
      return 2 * Math.hypot(re, im) / v.length
    }
    return { mean: +mean.toFixed(2), amp: +amp(per).toFixed(3), rel: mean > 1e-9 ? +(amp(per) / mean).toFixed(4) : null,
      rel_half: mean > 1e-9 ? +(amp(per / 2) / mean).toFixed(4) : null, rel_double: mean > 1e-9 ? +(amp(per * 2) / mean).toFixed(4) : null }
  }, [x0, y, len, periodCss] as unknown[])

/** 실험실 시험 판(#tunelab-cv · 2× 캔버스 · 굵기 28)에 합성 펜 획을 긋는다 — 제품과 같은 paintMark
 *  (#54). 캔버스 픽셀을 직접 읽으므로 텍스처 → 화면 축소 표집(#gl)의 평활이 안 끼어든다. */
async function labStroke(page: Page, x0: number, y: number, x1: number, press: number, n = 14) {
  await page.evaluate(([x0, y, x1, pr, n]) => {
    const cv = document.getElementById('tunelab-cv') as HTMLCanvasElement
    const keep = cv.setPointerCapture
    cv.setPointerCapture = () => {}
    const r = cv.getBoundingClientRect()
    const fire = (type: string, x: number, p: number) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 5, pointerType: 'pen', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, pressure: p,
      clientX: r.left + x, clientY: r.top + (y as number), bubbles: true, cancelable: true,
    }))
    fire('pointerdown', x0 as number, pr as number)
    for (let k = 1; k <= (n as number); k++) fire('pointermove', (x0 as number) + ((x1 as number) - (x0 as number)) * k / (n as number), pr as number)
    fire('pointerup', x1 as number, 0)
    cv.setPointerCapture = keep
  }, [x0, y, x1, press, n] as unknown[])
  await page.waitForTimeout(100)
}
/** 시험 판의 한 행(캔버스 px · y는 css px × 2)을 x를 따라 읽어 «주기 P(캔버스 px)»의 DFT 진폭 ÷ 평균 */
const labRipple = (page: Page, x0: number, yCv: number, len: number, period: number) =>
  page.evaluate(([x0, y, len, P]) => {
    const cv = document.getElementById('tunelab-cv') as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(x0 as number, y as number, len as number, 1).data
    const v: number[] = []
    for (let i = 0; i < (len as number); i++) { const a = d[i * 4 + 3]! / 255; v.push(a > 0 ? (255 - (d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]!) / 3) * a : 0) }
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    const amp = (p: number) => {
      let re = 0, im = 0
      for (let i = 0; i < v.length; i++) { const ph = 2 * Math.PI * i / p; re += (v[i]! - mean) * Math.cos(ph); im += (v[i]! - mean) * Math.sin(ph) }
      return 2 * Math.hypot(re, im) / v.length
    }
    const per = P as number
    return { mean: +mean.toFixed(2), amp: +amp(per).toFixed(3), rel: mean > 1e-9 ? +(amp(per) / mean).toFixed(4) : null,
      rel_half: mean > 1e-9 ? +(amp(per / 2) / mean).toFixed(4) : null, rel_double: mean > 1e-9 ? +(amp(per * 2) / mean).toFixed(4) : null }
  }, [x0, yCv, len, period] as unknown[])

test('① 둥근 도장이 안 보인다 — 시험 판 가장자리 행의 도장 주기 진폭: 기본값(반증) vs mypaint 출발점(≤ C.PAINT60_RIPPLE_MAX) · 결 끔', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-tunelab')
  await page.waitForTimeout(200)
  await page.click('#tunelab-pick-pencil')
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  // 시험 판 굵기 28(캔버스 px · 고정) · 압력 0.5 → 반지름 28/2 × 0.925 = 12.95 — 가장자리 행은 중심 y(css 120
  // → 캔버스 240)에서 10·11·12px 위(#12 3점 · 도장 물결이 가장 깊은 대역)
  const yCss = 120, yCv = yCss * 2
  await labStroke(page, 40, yCss, 400, 0.5)
  const measure = async (period: number) => {
    const rows: Record<string, unknown> = {}
    for (const off of [10, 11, 12]) rows['row_' + off] = await labRipple(page, 160, yCv - off, 480, period)
    return rows
  }
  const def = await page.evaluate(() => (window as any).__b2.diag.brushDefForTest('pencil'))
  const periodDefault = 28 * def.spacingK                    // 도장 간격(캔버스 px) = 굵기 28 × spacingK
  const base = await measure(periodDefault)
  // mypaint 출발점(실험실 「출발점」 단추 — 도구별 표) · 판은 같은 획을 새 값으로 다시 긋는다(redrawScratch · #103)
  await page.click('#tunelab-mypaint')
  await page.waitForTimeout(200)
  const sp = await page.evaluate(() => (window as any).__b2.diag.brushStartPoints().pencil)
  const periodStart = 28 * sp.spacingK
  const start = await measure(periodStart)
  const startAtDefaultPeriod = await measure(periodDefault)
  await page.click('#tunelab-reset')
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  const worst = (r: Record<string, unknown>) => Math.max(...Object.values(r).map(x => (x as { rel: number | null }).rel ?? 0))
  OUT.ripple = {
    def: '실험실 시험 판(굵기 28 · 압력 0.5 펜 · 결 끔 · 제품과 같은 paintMark #54 — 텍스처 축소 표집의 평활이 없는 자)의 수평 획 가장자리 행(중심에서 10·11·12px — 세 행 전부 #12)에서 x 480px 어둡기의 «도장 간격 주기» DFT 진폭(2|X|/N) ÷ 행 평균. 기본값(간격 0.25w=7px · 경도 1 · 산포 0)은 그 주기 파형이 서고, mypaint 출발점(간격 w/8=3.5px · 경도 0.1 · 산포 0.5)은 그 주기에서도 기본 주기에서도 문 아래. rel_half·rel_double은 이웃 주기(주기 오판 대비). 반증 = 기본값 행(worst_default > 문). ⚠ 첫 판은 #gl(면 텍스처 → 화면 축소)에서 쟀고 기본값이 .031로 문 아래였다 — 자가 평활을 재고 있었다(재설계의 사유)',
    threshold: cs.PAINT60_RIPPLE_MAX,
    period_default_px: periodDefault, period_start_px: periodStart,
    default: base, start: start, start_at_default_period: startAtDefaultPeriod,
    worst_default: +worst(base).toFixed(4), worst_start: +Math.max(worst(start), worst(startAtDefaultPeriod)).toFixed(4),
  }
  expect(worst(base), '반증 — 기본값(딱딱한 원 도장)에서 도장 주기 파형이 잡힌다').toBeGreaterThan(cs.PAINT60_RIPPLE_MAX)
  expect(Math.max(worst(start), worst(startAtDefaultPeriod)), 'mypaint 출발점 — 도장 주기 파형이 안 잡힌다').toBeLessThanOrEqual(cs.PAINT60_RIPPLE_MAX)
})

test('② 색연필 — 구멍이 있고 압력이 «몫»을 움직인다(0.2 > 0.8 + C.PAINT60_HOLE_SHARE_GAP) · 반증(cpBurnish 0 → 몫 불변)', async ({ page }) => {
  await bigBox(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  await pickInstr(page, 'cp', 20, '#c07a5b')
  const y = 480
  const shareAt = async (press: number, tag: string) => {
    await penPath(page, hline(560, y, 840, 14), press)
    await page.waitForTimeout(200)
    await darkMap(page, tag, 600, y - 6, 200, 12)              // 안쪽 행(가장자리 물결 제외)
    const st = await mapStats(page, tag, 25)
    await undoPaint(page)
    return st
  }
  const rows: Record<string, unknown> = {}
  for (const p of [0.2, 0.5, 0.8, 1.0]) rows['p' + p] = await shareAt(p, 'p' + p)
  await page.evaluate(() => (window as any).__b2.diag.setBrushTuneForTest('cp', { cpBurnish: 0 }))
  const flat: Record<string, unknown> = {}
  for (const p of [0.2, 0.8]) flat['p' + p] = await shareAt(p, 'f' + p)
  await page.evaluate(() => (window as any).__b2.diag.setBrushTuneForTest('cp', null))
  const s = (k: string, r: Record<string, unknown>) => (r[k] as { bare_share: number }).bare_share
  OUT.cp_holes = {
    def: '색연필(굵기 20 · 기본값 — cpBurnish = C.PAINT60_CP_BURNISH) 수평 획의 안쪽 12px 창에서 «빈 픽셀 몫»(어둡기 < 창 p95의 35% — **상대 문**: 구멍 잔량(cpSkipAlpha/alpha ≈ .26)은 아래, 결 골(grainFloor .7)은 위. ⚠ 첫 판의 절대 문(25)은 압력이 낮춘 알파까지 «빈 것»으로 세어 반증(문턱 고정)에서도 .26이 갈렸다 — 자가 알파를 재고 있었다) · 압력 0.2·0.5·0.8·1.0(#12 4점). 판정 = share(0.2) > share(0.8) + 문(«알파가 아니라 몫이 움직인다»의 그 술어). 반증 = cpBurnish 0(문턱 고정)에서 두 몫의 차가 문 아래. mean·p95는 «세게 누르면 진해지기도 한다»(51 농도 곡선이 그대로다)의 기록',
    threshold: cs.PAINT60_HOLE_SHARE_GAP, burnish: cs.PAINT60_CP_BURNISH,
    rows, falsification_burnish0: flat,
  }
  expect(s('p0.5', rows), '색연필에 구멍이 있다(빈 픽셀 몫 > 0)').toBeGreaterThan(0.02)
  expect(s('p0.2', rows) - s('p0.8', rows), '약한 압력의 빈 몫이 강한 압력보다 크다').toBeGreaterThan(cs.PAINT60_HOLE_SHARE_GAP)
  expect(s('p0.2', rows), '단조 — 0.2 > 0.5').toBeGreaterThan(s('p0.5', rows))
  expect(s('p0.5', rows), '단조 — 0.5 > 0.8').toBeGreaterThan(s('p0.8', rows))
  expect(Math.abs(s('p0.2', flat) - s('p0.8', flat)), '반증 — 문턱 고정이면 몫이 안 움직인다').toBeLessThan(cs.PAINT60_HOLE_SHARE_GAP)
})

test('③ 층이 쌓인다 — 같은 자리 세 번: 둘째·셋째가 첫째와 «같은 봉우리»(상관 ≥ C.PAINT60_LAYER_CORR_MIN)이되 1이 아니고 어둡기가 는다', async ({ page }) => {
  await bigBox(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  await pickInstr(page, 'cp', 20, '#c07a5b')
  const y = 480
  const pass = async (k: number) => {
    await penPath(page, hline(560 + (k % 2) * 1.5, y, 840 + (k % 2) * 1.5, 14), 0.35)   // 홀수 회는 1.5px 어긋남(손의 반복)
    await page.waitForTimeout(200)
    await darkMap(page, 'L' + k, 600, y - 6, 200, 12)
    return mapStats(page, 'L' + k, 25)
  }
  const s1 = await pass(1)
  const s2 = await pass(2)
  const s3 = await pass(3)
  // 증분 지도 — 둘째 획이 «어디에» 더했는가(L2 − L1)
  await page.evaluate(() => {
    const q = (window as any).__q60
    const a = q.L1.v as number[], b = q.L2.v as number[], c = q.L3.v as number[]
    q.D2 = { v: b.map((x: number, i: number) => Math.max(0, x - a[i]!)), w: q.L1.w, h: q.L1.h }
    q.D3 = { v: c.map((x: number, i: number) => Math.max(0, x - b[i]!)), w: q.L1.w, h: q.L1.h }
  })
  const c12 = await corrMaps(page, 'L1', 'L2')
  const c13 = await corrMaps(page, 'L1', 'L3')
  const cInc = await corrMaps(page, 'L1', 'D2')
  // 자기 대조(#5) — 같은 획을 재굽기하면 1(결정론 · 판정자가 아니다)
  await page.evaluate(() => (window as any).__b2.diag.rebakePaintTex())
  await page.waitForTimeout(200)
  await darkMap(page, 'L3b', 600, y - 6, 200, 12)
  const cSelf = await corrMaps(page, 'L3', 'L3b')
  await undoPaint(page)
  OUT.layers = {
    def: '색연필(압력 0.35 · 굵기 20) 같은 자리 세 획(둘째는 1.5px 어긋남 — 손의 반복). 안쪽 12px 창의 어둡기 지도: corr(L1,L2)·corr(L1,L3) — «같은 봉우리»(결이 면 고정이라 높다 · 실측 .9985)이되 1 아님(1.5px 어긋남의 도장 위상 — 최대값 합집합이라 안쪽은 거의 같고 가장자리·구멍 경계가 다르다 · 자기 대조 1과 갈린다). corr(L1, L2−L1) = 둘째 획의 증분이 첫째의 봉우리 «위»에 얹히는가(양수). mean이 회마다 는다(획 사이 누적 — 59 계약). corr_self = 같은 획 재굽기의 자기 대조(1 · 결정론 · 판정 아님 #5)',
    threshold: cs.PAINT60_LAYER_CORR_MIN,
    pass1: s1, pass2: s2, pass3: s3, corr_12: c12, corr_13: c13, corr_1_inc2: cInc, corr_self: cSelf,
  }
  expect(s2.mean, '둘째 획이 더한다').toBeGreaterThan(s1.mean * 1.05)
  expect(s3.mean, '셋째 획이 더한다').toBeGreaterThan(s2.mean * 1.02)
  expect(c12.corr ?? 0, '같은 봉우리(상관 ≥ 문)').toBeGreaterThanOrEqual(cs.PAINT60_LAYER_CORR_MIN)
  expect(c12.corr ?? 1, '같지는 않다(< 0.999 — 자기 대조 1과 갈린다)').toBeLessThan(0.999)
  expect(cInc.corr ?? 0, '증분이 첫째의 봉우리 위에 얹힌다(양의 상관)').toBeGreaterThan(0)
  expect(cSelf.corr ?? 0, '자기 대조 — 같은 획 재굽기는 1').toBeGreaterThan(0.999)
})

test('④ 잉크 경로 — 마커 자기 교차는 안 진해지고(≤ 1.05) 두 획의 교차는 진해진다(46 계약 · ≥ 1.1)', async ({ page }) => {
  await bigBox(page)
  await pickInstr(page, 'marker', 20, '#1e7fd0')
  const y = 480, W = 20
  const stats = (cx: number, cy: number) => darkMap(page, 'm' + cx + '_' + cy, cx - W / 2, cy - W / 2, W, W).then(() => mapStats(page, 'm' + cx + '_' + cy, 25))
  // 자기 교차(59 ②의 그 경로)
  const pts: { x: number; y: number }[] = []
  for (let k = 0; k <= 10; k++) pts.push({ x: 580 + 20 * k, y })
  pts.push({ x: 780, y: y - 14 }, { x: 780, y: y - 28 })
  for (let k = 1; k <= 10; k++) pts.push({ x: 780 - 20 * k, y: y - 28 + 5.6 * k })
  await penPath(page, pts, 0.5)
  await page.waitForTimeout(200)
  const selfCross = await stats(680, y)
  const selfBody = await stats(600, y)
  await undoPaint(page)
  // 두 획의 교차 — 수평 + 사선(같은 자리)
  await penPath(page, hline(580, y, 780, 10), 0.5)
  await penPath(page, [{ x: 780, y: y - 28 }, { x: 680, y }, { x: 580, y: y + 28 }], 0.5)
  await page.waitForTimeout(200)
  const twoCross = await stats(680, y)
  const twoBody = await stats(600, y)
  await undoPaint(page)
  OUT.ink_path = {
    def: '마커(굵기 20 · 압력 0.5) — 자기 교차(한 획 · 59 ② 경로)의 교차 창 p95 ÷ 몸통 p95(구성상 1 — canvas stroke() 한 번의 닫힌 경로 · AS-C175) vs 두 획의 교차(46 «겹치면 진해진다» — multiply). 60-3의 구조(«닫힌 폴리곤 하나 → 겹침 없음»)는 마커에 이미 서 있다 — perfect-freehand 불요(«펜» 칠 도구는 없다)',
    self: { cross: selfCross, body: selfBody, p95_ratio: +(selfCross.p95 / Math.max(1, selfBody.p95)).toFixed(4) },
    two: { cross: twoCross, body: twoBody, p95_ratio: +(twoCross.p95 / Math.max(1, twoBody.p95)).toFixed(4) },
  }
  expect(selfCross.p95 / Math.max(1, selfBody.p95), '자기 교차 — 안 진해진다').toBeLessThanOrEqual(1.05)
  expect(twoCross.p95 / Math.max(1, twoBody.p95), '두 획의 교차 — 진해진다(46)').toBeGreaterThanOrEqual(1.1)
})

test('⑤ 넷이 갈린다 — 같은 압력·같은 속도의 넷: 통계 짝별 최대 상대 차 > 0.1', async ({ page }) => {
  await bigBox(page)
  const Y: Record<Instr, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  const rows: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    await pickInstr(page, ins, 20)
    await penPath(page, hline(560, Y[ins], 840, 14), 0.5)
  }
  await page.waitForTimeout(250)
  for (const ins of INSTRS) {
    await darkMap(page, 's' + ins, 600, Y[ins] - 12, 200, 24)
    rows[ins] = await mapStats(page, 's' + ins, 25)
  }
  const names = [...INSTRS]
  const pairs: Record<string, number> = {}
  const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(1e-9, Math.max(Math.abs(x), Math.abs(y)))
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const A = rows[names[i]!] as { mean: number; p95: number; bare_share: number; edge_sd: number }
    const B = rows[names[j]!] as typeof A
    pairs[names[i]! + '_vs_' + names[j]!] = +Math.max(rel(A.mean, B.mean), rel(A.p95, B.p95), rel(A.bare_share, B.bare_share), rel(A.edge_sd, B.edge_sd)).toFixed(4)
  }
  OUT.four_differ = {
    def: '같은 압력(0.5 펜)·같은 속도(14걸음 등간격)·굵기 20의 넷 — 24px 창의 mean(농도) · p95 · bare_share(빈 픽셀 몫 · 어둡기<25) · edge_sd(상단 경계 행의 표준편차 — 가장자리 거칠기). 짝 여섯의 최대 상대 차 > 0.1(mark58 ② pairs와 같은 술어 · 자 넷은 60 지시의 셋 + p95)',
    rows, pairs,
  }
  for (const [k, v] of Object.entries(pairs)) expect(v, '짝 ' + k + ' — 갈린다').toBeGreaterThan(0.1)
})

test('⑥ 실험실 — 낙서판이 손잡이 옆에 붙어 있다 · 새 손잡이 다섯이 자국을 바꾼다 · 출발점 표 · 값 꺼내기/가져오기 왕복', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-tunelab')
  await page.waitForTimeout(200)
  const hashOf = () => page.evaluate(() => {
    const cv = document.getElementById('tunelab-cv') as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
    let h = 2166136261
    for (let i = 3; i < d.length; i += 16) { h ^= d[i]!; h = Math.imul(h, 16777619) }
    return h >>> 0
  })
  // ── 낙서판이 «옆»에: 패널을 끝까지 내려도 판이 보이고(sticky) 손잡이가 그 아래 있다 ──
  const before = await page.evaluate(() => {
    const root = document.getElementById('tunelab')!
    const cv = document.getElementById('tunelab-cv')!
    return { top: cv.getBoundingClientRect().top, rootTop: root.getBoundingClientRect().top, scrollH: root.scrollHeight, clientH: root.clientHeight }
  })
  await page.evaluate(() => { const r = document.getElementById('tunelab')!; r.scrollTop = r.scrollHeight })
  await page.waitForTimeout(100)
  const after = await page.evaluate(() => {
    const root = document.getElementById('tunelab')!
    const cv = document.getElementById('tunelab-cv')!
    const cr = cv.getBoundingClientRect(), rr = root.getBoundingClientRect()
    const mid = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)
    const lastKnob = document.getElementById('tunelab-k-dirAngle')!.getBoundingClientRect()
    return { top: cr.top, rootTop: rr.top, scrollTop: root.scrollTop, hit: mid?.id ?? null, knobTop: lastKnob.top, knobVisible: lastKnob.top < rr.bottom && lastKnob.bottom > rr.top }
  })
  OUT.lab_sticky = {
    def: '작업대를 끝까지 스크롤한 뒤 시험 판의 화면 y(패널 위에 붙어 있으면 rootTop 근처) · elementFromPoint(판 중앙) == 판 · 마지막 손잡이(촉 각도)가 같은 화면에 보인다 — 값 옆에 낙서판(REFERENCE §3)',
    before, after,
  }
  expect(after.scrollTop, '패널이 실제로 스크롤됐다(넘치는 손잡이가 있다)').toBeGreaterThan(50)
  expect(after.top - after.rootTop, '판이 패널 위에 붙어 있다(sticky)').toBeLessThan(30)
  expect(after.hit, '판 중앙을 짚으면 판이다(가려지지 않았다)').toBe('tunelab-cv')
  expect(after.knobVisible, '마지막 손잡이가 판과 같은 화면에 있다').toBe(true)
  // ── 새 손잡이 다섯 — 색연필에서 전부 활성이고(전제 켬) 각각 자국을 바꾼다 ──
  await page.click('#tunelab-pick-cp')
  await page.waitForTimeout(100)
  const setKnob = (key: string, v: number) => page.evaluate(([k, val]) => {
    const el = document.getElementById('tunelab-k-' + k) as HTMLInputElement
    el.value = String(val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return el.disabled
  }, [key, v] as const)
  const h0 = await hashOf()
  const react: Record<string, unknown> = {}
  // 속도 축 — 견본 획이 등간격이라 속도 0.3 대역 상수 → 손잡이가 농도·굵기를 균일하게 바꾼다(픽셀 변화)
  for (const [k, v] of [['cpBurnish', 1], ['speedAlphaK', -0.8], ['speedWidthK', 0.8], ['dirK', 0.8]] as const) {
    const disabled = await setKnob(k, v)
    const h = await hashOf()
    react[k] = { disabled, changed: h !== h0 }
    await setKnob(k, k === 'cpBurnish' ? 0.5 : 0)
  }
  // 촉 각도는 전제(납작한 촉 > 0)가 켜져야 자국에 실린다(구성 — 58 2차 [6]의 tipLenK 규약: 전제를
  // 켜고 잰다. 비활성 «표시»는 모드 기준(RELEVANT)만이다 — 전제 비활성은 mark58 ④의 «반응+비활성
  // == 전체» 항등과 충돌해 안 넣었다: 초판 실측 ✗)
  const hOff0 = await hashOf()
  await setKnob('dirAngle', 60)
  const hOff1 = await hashOf()
  await setKnob('dirAngle', 0)
  await setKnob('dirK', 0.8)
  const hA = await hashOf()
  const disabledOn = await setKnob('dirAngle', 60)
  const hB = await hashOf()
  react.dirAngle = { changed_when_dirK0: hOff1 !== hOff0, disabled_when_dirK_on: disabledOn, changed: hB !== hA }
  await page.click('#tunelab-reset')
  await page.waitForTimeout(100)
  OUT.lab_knobs = { def: '색연필에서 새 손잡이 다섯을 UI input으로 밀어 시험 판 해시가 바뀌는가(손잡이가 실제로 자국을 만든다) · 촉 각도는 전제 축(납작한 촉)이 0이면 자국 무변(구성) · 켜면 반응', react }
  for (const k of ['cpBurnish', 'speedAlphaK', 'speedWidthK', 'dirK']) {
    expect((react[k] as { disabled: boolean }).disabled, k + ' — 색연필에서 활성').toBe(false)
    expect((react[k] as { changed: boolean }).changed, k + ' — 자국을 바꾼다').toBe(true)
  }
  expect((react.dirAngle as { changed_when_dirK0: boolean }).changed_when_dirK0, '촉 각도 — 납작한 촉 0이면 자국 무변(구성)').toBe(false)
  expect((react.dirAngle as { changed: boolean }).changed, '촉 각도 — 납작한 촉을 켜면 반응').toBe(true)
  // ── 출발점 단추 — 도구별 표(START_POINTS)를 얹는다 ──
  await page.click('#tunelab-mypaint')
  await page.waitForTimeout(100)
  const cpDef = await page.evaluate(() => (window as any).__b2.diag.brushDefForTest('cp'))
  const sp = await page.evaluate(() => (window as any).__b2.diag.brushStartPoints())
  expect(cpDef.cpBurnish).toBe(sp.cp.cpBurnish)
  expect(cpDef.alpha).toBe(sp.cp.alpha)
  expect(cpDef.dirK).toBe(sp.cp.dirK)
  // ── 값 꺼내기 / 가져오기 — JSON 왕복(기기가 아니라 «밖»으로) ──
  await page.click('#tunelab-export')
  await page.waitForTimeout(100)
  const json = await page.evaluate(() => (document.getElementById('tunelab-json') as HTMLTextAreaElement).value)
  expect(json.length, '꺼낸 JSON이 비어 있지 않다').toBeGreaterThan(20)
  expect(JSON.parse(json).cp.alpha).toBe(sp.cp.alpha)
  await page.click('#tunelab-reset')
  await page.waitForTimeout(100)
  expect((await page.evaluate(() => (window as any).__b2.diag.brushDefForTest('cp'))).alpha, '기본값으로 돌아갔다').not.toBe(sp.cp.alpha)
  await page.evaluate((j) => { (document.getElementById('tunelab-json') as HTMLTextAreaElement).value = j }, json)
  await page.click('#tunelab-import')
  await page.waitForTimeout(150)
  const back = await page.evaluate(() => (window as any).__b2.diag.brushDefForTest('cp'))
  expect(back.alpha, '가져오기 — 같은 값이 돌아온다').toBe(sp.cp.alpha)
  expect(back.cpBurnish).toBe(sp.cp.cpBurnish)
  OUT.lab_io = { def: '「출발점」 → 「값 꺼내기」(textarea JSON) → 「기본값」 → 「가져온다」 — 색연필 alpha·cpBurnish가 돌아온다(값을 밖으로 꺼내는 길 — 굳힌 값이 기기에만 있으면 다음 세션이 못 읽는다)', json_len: json.length, roundtrip: { alpha: back.alpha, cpBurnish: back.cpBurnish } }
  await page.evaluate(() => (window as any).__b2.diag.setBrushTuneForTest('cp', null))
})
