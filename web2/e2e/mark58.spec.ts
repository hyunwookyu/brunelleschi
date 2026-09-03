// web2-58 — 자국: 끝점·통계·엔진·실험실 **게이트**(+ 첫 팔은 D-2와 같은 자의 «현행» 실측).
//
// ⚠ **사전(수리 전) 원장은 동결이다**: `stage0/out/mark58_pre_web2_dpr{1,2}.json` —
// 그 파일은 이제 어느 하네스도 안 쓴다(D-2의 «수리 전» 증거가 재실행에 덮이지 않게 —
// 57 2차 [2]의 교훈). 이 스펙은 `mark58_web2_dpr{1,2}.json`(현행)에 쓴다.
//
// 재는 것(58-4 지시 + D-1 표식): 도구 넷을 같은 몸짓(시작·끝 감속 — 실사용의 끝점 조건)
// 으로 긋고
//   ① **단위 길이당 도장 수**(제품 도장 기록 setStampLogForTest — 텍스처 px 자)
//      — 시작·중간·끝 대역. 지시의 가설 「간격이 시간 기반」이면 시작·끝이 중간보다 많다.
//   ② **단위 길이당 잉크 질량**(#gl 픽셀 어둡기 합 — 화면 자) — 도장 수가 균일해도
//      강조는 팁(마커 51)·갈라짐(붓 51)에서 날 수 있다(D-4: 사람 근거는 확인 대상).
//
// 원장: stage0/out/mark58_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-58 — 자국 게이트: 끝점(도장 균일·끝 창 강조 없음) · 브러시 통계 갈림 · 엔진 하나·데이터 격리 · 실험실. 첫 블록(stamps·ink)은 mark58_pre와 같은 자의 «현행» 값',
  note_pitfalls: '#96(손잡이 라운드 34-0 값 — gate_lab.rules) · #97(전역 canvas 규칙 — 이 라운드가 사촌(패널 display가 hidden을 이김)을 밟았다: gate_lab.overlay가 반증 값) · #100(굳힘 무효화 한 걸음) · #101(web2 러너 확인) · #11(대역 분모 = mid — def) · #12·#13(임계 훑기: gate_stats thresholds 3점 · 대역 20%) · #92(판정자는 픽셀·수) · #99(병합-쓰기·열쇠 수)',
  note_d4: 'D-4 — 지시 가설(「간격이 시간 기반」)의 판정 자료. stampsOf는 코드상 등호장 재표집(거리 기반)이라 도장 수는 균일이 예상이고, 강조의 실제 후보는 마커 팁(PAINT51_MARKER_TIP_*)·붓 갈라짐(PAINT51_BRUSH_SPLIT_*)이다 — 값이 가른다',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/mark58_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
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
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/mark58.spec.ts (워커 1 — #99)'.concat(' · 사전 동결: mark58_pre_web2_dpr*.json') },
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

/** rep49·paint50의 그 상자 — 오른쪽 벽 (500,700)(900,610)(900,330)(500,330) · 축척 2500mm */
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
  if (n < 1) {
    console.log('[bigBox 표식]', await page.evaluate(() => {
      const b = (window as any).__b2
      return { strokes: b.app.doc.strokes.length, lifted: b.app.lift.lifted.size,
        waiting: b.app.lift.waiting, tool: b.app.tool, docFaces: b.app.doc.faces.length }
    }))
  }
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

/** **시작·끝 감속** 획 — 처음·끝 15%는 잘게(8걸음), 가운데는 성기게(4걸음). 실사용의
 *  끝점 조건(지시 58-4: 손이 느려지는 시작·끝)을 포인터 표집 밀도로 만든다. */
async function slowFastSlow(page: Page, x0: number, y: number, x1: number) {
  const L = x1 - x0
  await page.mouse.move(x0, y)
  await page.mouse.down()
  for (let k = 1; k <= 8; k++) await page.mouse.move(x0 + L * 0.15 * (k / 8), y)
  for (let k = 1; k <= 4; k++) await page.mouse.move(x0 + L * (0.15 + 0.7 * (k / 4)), y)
  for (let k = 1; k <= 8; k++) await page.mouse.move(x0 + L * (0.85 + 0.15 * (k / 8)), y)
  await page.mouse.up()
  await page.waitForTimeout(80)
}

/** 화면 창의 «잉크 질량» — 어둡기 합(흰 255 기준 · 알파 가중). #gl 하나만 본다. */
function inkMass(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round(x0 * dpr), Math.round(y0 * dpr),
      Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr)),
    ).data
    let m = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a <= 0) continue
      const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3
      m += (255 - lum) * a
    }
    return m / (dpr * dpr)          // dpr 무관 눈금(면적 정규화)
  }, [x0, y0, x1, y1] as const)
}

const INSTRS = ['brush', 'marker', 'cp', 'pencil'] as const
const ITAG: Record<string, number> = { brush: 0, marker: 1, cp: 2, pencil: 3 }

test('현행 실측 — 도구 넷 × 시작/중간/끝: 도장 수(제품 기록)와 잉크 질량(픽셀) — 사전(mark58_pre)과 같은 자', async ({ page }) => {
  await bigBox(page)
  const X0 = 540, X1 = 860
  const Y: Record<string, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  for (const ins of INSTRS) {
    await page.evaluate(([i]) => {
      (window as any).__b2.app.paintSel = { hex: '#8a4a3a', i, w: 20 }
    }, [ins] as const)
    await page.click('#btn-paint')
    await page.waitForTimeout(60)
    await slowFastSlow(page, X0, Y[ins]!, X1)
  }
  // 도장 기록 — 켠 채로 전량 재굽기 한 번(제품 경로 그대로)
  await page.evaluate(() => {
    const b = (window as any).__b2
    b.diag.setStampLogForTest(true)
    b.diag.rebakePaintTex()
  })
  await page.waitForTimeout(200)
  const log: { x: number; y: number; i: number }[] =
    await page.evaluate(() => (window as any).__b2.diag.stampLogForTest())
  await page.evaluate(() => (window as any).__b2.diag.setStampLogForTest(false))
  expect(log.length, '도장 기록이 실제로 쌓였다').toBeGreaterThan(100)

  const bandsOf = (xs: number[]) => {
    const lo = Math.min(...xs), hi = Math.max(...xs)
    const L = Math.max(1e-9, hi - lo)
    const inb = (a: number, b: number) => xs.filter(x => (x - lo) / L >= a && (x - lo) / L <= b).length
    // 대역 폭이 같아야 «단위 길이당»이 된다(0.15씩) — 그대로 세면 곧 밀도 비교다
    return { start: inb(0, 0.15), mid: inb(0.425, 0.575), end: inb(0.85, 1), n: xs.length, len_px: L }
  }
  const stamps: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    const xs = log.filter(q => q.i === ITAG[ins]!).map(q => q.x)
    stamps[ins] = xs.length > 0 ? bandsOf(xs) : { n: 0, note: '이 도구는 도장 경로가 아니다(마커 = 띠+팁)' }
  }
  OUT.stamps = {
    def: '텍스처 px에서 획 진행축(x) 대역별 도장 수 — 대역 폭 15%씩이라 수 자체가 밀도 비교다. 지시 가설(시간 기반)이면 start·end ≫ mid',
    rows: stamps,
  }

  const ink: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    const y = Y[ins]!
    const h = 26
    const seg = (a: number, b: number) => [X0 + (X1 - X0) * a, y - h / 2, X0 + (X1 - X0) * b, y + h / 2] as const
    const [s0, s1, s2] = [seg(0, 0.15), seg(0.425, 0.575), seg(0.85, 1)]
    const start = await inkMass(page, ...s0)
    const mid = await inkMass(page, ...s1)
    const end = await inkMass(page, ...s2)
    // **좁은 창**(굵기 20px 폭) — «원형 강조»(팁 원)는 굵기 크기의 국소 강조라 15% 대역
    // (60px)에 희석된다: 팁을 정조준하는 자. 비교 몸통 창도 같은 20px 폭(같은 양 — #11).
    const W = 20
    const tipStart = await inkMass(page, X0 - W / 2, y - h / 2, X0 + W / 2, y + h / 2)
    const tipEnd = await inkMass(page, X1 - W / 2, y - h / 2, X1 + W / 2, y + h / 2)
    const bodyW = await inkMass(page, (X0 + X1) / 2 - W / 2, y - h / 2, (X0 + X1) / 2 + W / 2, y + h / 2)
    ink[ins] = {
      start, mid, end,
      start_over_mid: mid > 1e-9 ? start / mid : null,
      end_over_mid: mid > 1e-9 ? end / mid : null,
      tip: {
        start: tipStart, end: tipEnd, body: bodyW,
        start_over_body: bodyW > 1e-9 ? tipStart / bodyW : null,
        end_over_body: bodyW > 1e-9 ? tipEnd / bodyW : null,
      },
    }
    expect(mid, `${ins} — 몸통에 잉크가 실제로 있다`).toBeGreaterThan(100)
  }
  OUT.ink = {
    def: '화면 창(대역 15% × 높이 26px)의 어둡기 합 — 대역 폭 동일이라 비가 곧 «단위 길이당 잉크». tip.*는 굵기 폭(20px) 좁은 창 — 끝점 «원형 강조»의 정조준 자(몸통 창도 같은 폭 · 둥근 끝은 창의 절반이 획 밖이라 1.0 아래가 기저다)',
    rows: ink,
  }
})

test('게이트 ① 끝점 — 도장 균일(안쪽 대역 ±C.PAINT58_STAMP_BAND_TOL) · 끝 창 강조 없음(±10%) + 반증(팁 되켬)', async ({ page }) => {
  await bigBox(page)
  const X0 = 540, X1 = 860
  const Y: Record<string, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  for (const ins of INSTRS) {
    await page.evaluate(([i]) => {
      (window as any).__b2.app.paintSel = { hex: '#8a4a3a', i, w: 20 }
    }, [ins] as const)
    await page.click('#btn-paint')
    await page.waitForTimeout(60)
    await slowFastSlow(page, X0, Y[ins]!, X1)
  }
  await page.evaluate(() => {
    const b = (window as any).__b2
    b.diag.setStampLogForTest(true)
    b.diag.rebakePaintTex()
  })
  await page.waitForTimeout(200)
  const log: { x: number; y: number; i: number }[] =
    await page.evaluate(() => (window as any).__b2.diag.stampLogForTest())
  await page.evaluate(() => (window as any).__b2.diag.setStampLogForTest(false))
  const tol = await page.evaluate(() => (window as any).__b2.diag.paint50Constants().PAINT58_STAMP_BAND_TOL ?? 0.10)
  // **안쪽 대역**(5%..20% / 42.5%..57.5% / 80%..95%) — 포함 끝점(k=0·k=n)의 대역 경계
  // 양자화를 밖에 둔다: 지시의 «뭉침»은 간격의 병이지 끝점 포함의 양자화가 아니다
  // (mark58_pre의 brush 32/28/32가 그 양자화였다 — 사전 원장 def).
  // 분모는 **mid**다(2차 [5] — def에 명시). 대역 폭 20%(같은 폭 — 밀도 비교): 한 자리
  // 정수 계수의 눈금(±1/12 ≈ 8%)이 임계(10%) 아래로 들어와 등호 위 판정이 안 생긴다.
  const inner: Record<string, unknown> = {}
  const endStamps: Record<string, number> = {}
  for (const ins of ['brush', 'cp', 'pencil'] as const) {
    const xs = log.filter(q => q.i === ITAG[ins]!).map(q => q.x)
    const lo = Math.min(...xs), hi = Math.max(...xs), L = Math.max(1e-9, hi - lo)
    const inb = (a: number, b: number) => xs.filter(x => (x - lo) / L >= a && (x - lo) / L <= b).length
    const s = inb(0.05, 0.25), m = inb(0.40, 0.60), e = inb(0.75, 0.95)
    // 끝 도장 수(2차 [4] — 사전 원장 32/28/32의 «끝당 +» 해명의 값): 양 끝 1.5px 안 도장
    endStamps[ins] = xs.filter(x => x - lo < 1.5).length + xs.filter(x => hi - x < 1.5).length
    inner[ins] = { start: s, mid: m, end: e, n: xs.length }
    expect(Math.abs(s / Math.max(1, m) - 1), ins + ' — 시작 대역 밀도(분모 mid)').toBeLessThanOrEqual(tol)
    expect(Math.abs(e / Math.max(1, m) - 1), ins + ' — 끝 대역 밀도(분모 mid)').toBeLessThanOrEqual(tol)
  }
  // 감속 실재(2차 [2] — 이 값이 없으면 «시간 기반» 가설을 아무것도 못 가른다): 커밋된
  // 획의 uv 표본 간격을 대역별로 잰다 — 같은 헬퍼(slowFastSlow)가 사전 실측에도 쓰였다.
  const decel = await page.evaluate(() => {
    const s = (window as any).__b2.app.doc.strokes.find((x: any) => x.paint?.i === 3)
    const uv: number[] = s.paint.uv
    const gaps: number[] = []
    for (let i = 2; i + 1 < uv.length; i += 2) {
      gaps.push(Math.hypot(uv[i]! - uv[i - 2]!, uv[i + 1]! - uv[i - 1]!))
    }
    const L = gaps.reduce((a, b) => a + b, 0)
    let acc = 0
    const bands: number[][] = [[], [], []]
    for (const g of gaps) {
      const f = acc / L
      bands[f < 0.15 ? 0 : f > 0.85 ? 2 : 1]!.push(g)
      acc += g
    }
    const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
    return { start_gap: mean(bands[0]!), mid_gap: mean(bands[1]!), end_gap: mean(bands[2]!), n: gaps.length }
  })
  expect(decel.start_gap, '감속 실재 — 시작 표본 간격 < 중간의 절반').toBeLessThan(decel.mid_gap * 0.5)
  expect(decel.end_gap, '감속 실재 — 끝 표본 간격 < 중간의 절반').toBeLessThan(decel.mid_gap * 0.5)
  // 끝 창(굵기 폭) 강조 없음 — 도구 넷 전수: 끝 창이 몸통 창을 10% 넘게 넘지 않는다
  // (사전 실측: 마커 1.374가 이 술어에 걸렸다 — 그 팁이 기본 0이 된 것이 수리다)
  const W = 20, h = 26
  const tips: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    const y = Y[ins]!
    const tipStart = await inkMass(page, X0 - W / 2, y - h / 2, X0 + W / 2, y + h / 2)
    const tipEnd = await inkMass(page, X1 - W / 2, y - h / 2, X1 + W / 2, y + h / 2)
    const body = await inkMass(page, (X0 + X1) / 2 - W / 2, y - h / 2, (X0 + X1) / 2 + W / 2, y + h / 2)
    const so = tipStart / Math.max(1, body), eo = tipEnd / Math.max(1, body)
    tips[ins] = { start_over_body: so, end_over_body: eo }
    expect(so, ins + ' — 시작 원형 강조 없음(사전: 마커 1.374)').toBeLessThanOrEqual(1.1)
    expect(eo, ins + ' — 끝 원형 강조 없음').toBeLessThanOrEqual(1.1)
  }
  // **사전 대비 개선**(2차 [3] — «끝»의 술어: 절대 1.1은 마커 «시작»에서만 구속력이
  // 있었다(끝 칸은 수리 전에도 전부 1.1 아래 — 사전 원장). 동결된 사전 원장을 그 자리에서
  // 읽어 마커의 시작·끝 둘 다 «수리 전보다 좋아졌다»를 값으로 건다.
  {
    const preRaw = JSON.parse(readFileSync(
      resolve(HERE, '../../stage0/out/mark58_pre_web2_dpr' + ((test.info().project.name === 'dpr2') ? 2 : 1) + '.json'), 'utf8'))
    const preTip = preRaw.ink.rows.marker.tip
    const curTip = (tips.marker as { start_over_body: number; end_over_body: number })
    expect(curTip.start_over_body, '마커 시작 — 사전(1.374) 대비 개선').toBeLessThan(preTip.start_over_body * 0.85)
    expect(curTip.end_over_body, '마커 끝 — 사전 대비 악화 없음(개선 실측은 값)').toBeLessThanOrEqual(preTip.end_over_body)
    ;(OUT.gate_endpoint_pre_vs = {
      def: '동결 사전 원장(mark58_pre — 같은 dpr)을 읽어 마커 팁 창 비의 전/후를 같은 자로 — «끝점 뭉침» 게이트의 끝 절반(2차 [3])',
      pre: preTip, cur: curTip,
    })
  }
  // 반증(D-3) — 팁을 51 값으로 되켜면 같은 술어가 마커에서 죽는다(자가 강조를 본다)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  await page.evaluate(([a, k]) => (window as any).__b2.diag.setBrushTuneForTest('marker', { tipAlpha: a, tipLenK: k }),
    [cs.PAINT51_MARKER_TIP_ALPHA, cs.PAINT51_MARKER_TIP_LEN_K] as const)
  await page.waitForTimeout(250)
  const y = Y.marker!
  const tipOn = await inkMass(page, X0 - W / 2, y - h / 2, X0 + W / 2, y + h / 2)
  const bodyOn = await inkMass(page, (X0 + X1) / 2 - W / 2, y - h / 2, (X0 + X1) / 2 + W / 2, y + h / 2)
  const soOn = tipOn / Math.max(1, bodyOn)
  expect(soOn, '반증 — 팁 되켬에서 강조가 돌아온다(> 1.1)').toBeGreaterThan(1.1)
  await page.evaluate(() => (window as any).__b2.diag.setBrushTuneForTest('marker', null))
  await page.waitForTimeout(150)
  OUT.gate_endpoint = {
    def: '안쪽 대역(폭 20% — 포함 끝점 양자화 밖 · **분모 = mid** · 한 자리 계수 눈금(±8%)이 임계(10%) 안) 도장 밀도 ±C.PAINT58_STAMP_BAND_TOL · 끝 창(굵기 폭)/몸통 창 ≤ 1.1(도구 넷 전수 — 시작의 술어) + 사전 대비 개선(gate_endpoint_pre_vs — 끝의 술어). end_stamps = 양 끝 1.5px 안 도장 수(사전 32/28/32의 «끝당 +» 해명: 붓은 빗살 배수). decel = 표본 간격 대역별(감속 실재 — 이 값이 없으면 시간 기반 가설을 못 가른다). 반증 = 팁 되켬에서 같은 술어가 죽는다',
    tol, inner, end_stamps: endStamps, decel, tips, tip_on_start_over_body: soOn,
  }
})

test('게이트 ② 브러시가 실제로 다르다 — 같은 압력·같은 몸짓의 몸통 통계가 갈린다', async ({ page }) => {
  await bigBox(page)
  const X0 = 540, X1 = 860
  const Y: Record<string, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  for (const ins of INSTRS) {
    await page.evaluate(([i]) => {
      (window as any).__b2.app.paintSel = { hex: '#8a4a3a', i, w: 20 }
    }, [ins] as const)
    await page.click('#btn-paint')
    await page.waitForTimeout(60)
    await slowFastSlow(page, X0, Y[ins]!, X1)
  }
  /** 몸통 창 통계 — 덮임률(잉크 픽셀 비율) · 평균 어둡기(잉크 픽셀 안) · 중앙 행 전이 수 */
  const statsOf = (x0: number, y0: number, x1: number, y1: number) =>
    page.evaluate(([x0, y0, x1, y1]) => {
      const c = document.getElementById('gl') as HTMLCanvasElement
      const t = document.createElement('canvas')
      t.width = c.width; t.height = c.height
      t.getContext('2d')!.drawImage(c, 0, 0)
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round((x1 - x0) * dpr)), hh = Math.max(1, Math.round((y1 - y0) * dpr))
      const d = t.getContext('2d')!.getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), w, hh).data
      // ⚠ 자 둘(초판 dk>12 하나는 **포화**했다 — 실측: 네 도구 전부 coverage 1 · 전이 0.
      // 색연필 구멍의 잔량(cpSkipAlpha)조차 12를 넘는다): «잉크 있음»(dk>12)과 **«깊음»**
      // (dk>60 — 구멍·결 골이 밑으로 빠지는 눈금)을 가른다. 갈림의 판정자는 깊은 자다.
      let inked = 0, deep40 = 0, deep = 0, deep80 = 0, dark = 0
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]! / 255
        const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3
        const dk = (255 - lum) * a
        if (dk > 12) { inked++; dark += dk }
        if (dk > 40) deep40++
        if (dk > 60) deep++
        if (dk > 80) deep80++
      }
      // 중앙 행 전이 수(깊음↔아님) — 결·구멍·빗살의 불연속 자
      const rowY = Math.floor(hh / 2)
      let trans = 0
      let prev = false
      for (let cx = 0; cx < w; cx++) {
        const i = (rowY * w + cx) * 4
        const a = d[i + 3]! / 255
        const dk = (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) * a
        const on = dk > 60
        if (cx > 0 && on !== prev) trans++
        prev = on
      }
      const total = w * hh
      return { coverage: inked / total, deep40_coverage: deep40 / total, deep_coverage: deep / total, deep80_coverage: deep80 / total, mean_dark: inked > 0 ? dark / inked : 0, transitions: trans / (w / dpr) * 100 }
    }, [x0, y0, x1, y1] as const)
  const rows: Record<string, { coverage: number; deep40_coverage: number; deep_coverage: number; deep80_coverage: number; mean_dark: number; transitions: number }> = {}
  for (const ins of INSTRS) {
    const y = Y[ins]!
    rows[ins] = await statsOf(X0 + 60, y - 12, X1 - 60, y + 12)
  }
  // 짝별 갈림 — 여섯 짝 전부, 네 지표 중 상대 차가 가장 큰 값(«통계가 갈린다»의 전수 자)
  const pairKey = (a: string, b: string) => a + '_vs_' + b
  const pairs: Record<string, number> = {}
  const names = [...INSTRS]
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = rows[names[i]!]!, B = rows[names[j]!]!
      const rel = (x: number, y2: number) => Math.abs(x - y2) / Math.max(1e-9, Math.max(Math.abs(x), Math.abs(y2)))
      pairs[pairKey(names[i]!, names[j]!)] = Math.max(
        rel(A.coverage, B.coverage), rel(A.deep_coverage, B.deep_coverage),
        rel(A.mean_dark, B.mean_dark), rel(A.transitions, B.transitions))
    }
  }
  OUT.gate_stats = {
    def: '몸통 창(양끝 60px 제외 · 높이 24px) — coverage(dk>12) · deep_coverage(dk>60 — 구멍·결 골이 빠지는 눈금: dk>12 하나는 포화했다, 실측 전부 1) · mean_dark · transitions(중앙 행 깊음↔아님 / 100css px). 술어 넷(마커>색연필 깊은 덮임 — **dk 40·60·80 세 점 전부** #12·#13 · 색연필>마커 전이 · 연필>마커 농도 · 붓<마커 농도) + 짝별 갈림(pairs — 여섯 짝 전부 최대 상대 차 > 0.1. ⚠ 연필 중앙 행 전이는 이 굵기에서 0 — 겹침이 골을 메운다: 결 판정자는 brush51 ③. ⚠ 전이 자는 dpr 눈금 의존이다(붓 0(dpr1)↔2(dpr2) — 문턱 근처 무늬의 표집): 술어는 같은 dpr 안 비교만 — 2차 [7])',
    rows, pairs,
  }
  // 임계 훑기(2차 [8] — #12·#13: dk 60 하나가 절단값이 안 되게 40·60·80 세 점 전부에서 건다)
  for (const key of ['deep40_coverage', 'deep_coverage', 'deep80_coverage'] as const) {
    expect(rows.marker![key], '마커 > 색연필 — 깊은 덮임(' + key + ')').toBeGreaterThan(rows.cp![key] * 1.05)
  }
  // ⚠ 연필의 «중앙 행 전이»는 이 굵기(20px · 간격 0.25w)에서 0이다 — 짙은 겹침이 결 골을
  // 메운다(실측). 결 자체의 판정자는 brush51 ③(상관 길이 — 줌 배 추적)이 따로 진다.
  // 여기의 연필 술어는 농도(결이 있어도 겹으로 제일 짙다)로 갈린다.
  expect(rows.cp!.transitions, '색연필 > 마커 — 불연속(구멍)').toBeGreaterThan(rows.marker!.transitions)
  expect(rows.pencil!.mean_dark, '연필 > 마커 — 겹침 농도').toBeGreaterThan(rows.marker!.mean_dark * 1.05)
  expect(rows.brush!.mean_dark, '붓 < 마커 — 흑연톤이 옅다').toBeLessThan(rows.marker!.mean_dark * 0.8)
  for (const [k, v] of Object.entries(pairs)) {
    expect(v, '짝 ' + k + ' — 통계가 갈린다(최대 상대 차 > 0.1)').toBeGreaterThan(0.1)
  }
})

test('게이트 ③ 엔진 하나 · 데이터 격리(D-3) — 같은 열쇠 하나가 도장 브러시 셋을 다 움직이고, 브러시별 조정은 그 브러시만', async ({ page }) => {
  await bigBox(page)
  const X0 = 540, X1 = 860
  const Y: Record<string, number> = { brush: 380, cp: 500, pencil: 560 }
  for (const ins of ['brush', 'cp', 'pencil'] as const) {
    await page.evaluate(([i]) => {
      (window as any).__b2.app.paintSel = { hex: '#8a4a3a', i, w: 20 }
    }, [ins] as const)
    await page.click('#btn-paint')
    await page.waitForTimeout(60)
    await slowFastSlow(page, X0, Y[ins]!, X1)
  }
  const countStamps = async (): Promise<Record<string, number>> => {
    await page.evaluate(() => {
      const b = (window as any).__b2
      b.diag.setStampLogForTest(true)
      b.diag.rebakePaintTex()
    })
    await page.waitForTimeout(200)
    const log: { i: number }[] = await page.evaluate(() => (window as any).__b2.diag.stampLogForTest())
    await page.evaluate(() => (window as any).__b2.diag.setStampLogForTest(false))
    const out: Record<string, number> = { brush: 0, cp: 0, pencil: 0 }
    for (const q of log) {
      if (q.i === 0) out.brush!++
      else if (q.i === 2) out.cp!++
      else if (q.i === 3) out.pencil!++
    }
    return out
  }
  const base = await countStamps()
  // **엔진 하나** — 같은 열쇠(spacingK)를 셋에 넣으면 셋 다 도장 수가 준다(한 코드 경로)
  await page.evaluate(() => {
    const b = (window as any).__b2
    for (const k of ['brush', 'cp', 'pencil']) b.diag.setBrushTuneForTest(k, { spacingK: 1.2 })
  })
  await page.waitForTimeout(250)
  const wide = await countStamps()
  for (const k of ['brush', 'cp', 'pencil'] as const) {
    expect(wide[k]!, k + ' — spacingK 하나로 도장 수가 준다(엔진 하나)').toBeLessThan(base[k]! * 0.6)
  }
  // **데이터 격리(반증)** — 연필만 spacingK를 되돌리면 연필만 돌아온다
  await page.evaluate(() => (window as any).__b2.diag.setBrushTuneForTest('pencil', null))
  await page.waitForTimeout(250)
  const mixed = await countStamps()
  expect(Math.abs(mixed.pencil! - base.pencil!) / base.pencil!, '연필 — 되돌림').toBeLessThan(0.02)
  expect(Math.abs(mixed.cp! - wide.cp!) / wide.cp!, '색연필 — 그대로(격리)').toBeLessThan(0.02)
  await page.evaluate(() => {
    const b = (window as any).__b2
    for (const k of ['brush', 'cp']) b.diag.setBrushTuneForTest(k, null)
  })
  OUT.gate_engine = {
    def: '엔진 하나 = 같은 열쇠(spacingK 0.3→1.2)가 도장 브러시 셋의 도장 수를 전부 줄인다(<0.6배 — 한 코드 경로가 한 필드를 소비). 격리(D-3) = 연필만 되돌리면 연필만 복귀(±2%) · 색연필은 그대로',
    base, wide, mixed,
  }
})

test('게이트 ④ 실험실 — 손잡이 전수가 자국을 바꾼다(도구별 유효 축) · 「굳힌다」가 기기에 남는다', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  // 설정 → 작업대(R8 — 설정에 숨는다)
  await page.evaluate(() => {
    (document.querySelector('#pane-settings') as HTMLDetailsElement).open = true
  })
  // #97 반증 값(2차 [10] — 이 라운드가 밟은 사촌(패널 display가 hidden을 이겨 포인터를
  // 삼킴 · 8획 중 3획 미커밋)의 자리): **닫힌 상태**에서 그 대역(900,610)의 맨 위는
  // 작업대가 아니어야 한다. 패널이 다시 덮이면 이 값이 빨개진다.
  const overlayClosed = await page.evaluate(() => {
    const el = document.elementFromPoint(900, 610)
    return { top: el?.id || el?.tagName || null, isLab: !!el?.closest?.('#tunelab') }
  })
  expect(overlayClosed.isLab, '#97 — 닫힌 작업대가 화면을 안 덮는다(900,610)').toBe(false)
  await page.click('#btn-tunelab')
  expect(await page.evaluate(() => !(document.getElementById('tunelab') as HTMLElement).hidden), '작업대가 열렸다').toBe(true)
  const overlayOpen = await page.evaluate(() => {
    const el = document.elementFromPoint(900, 200)
    return { isLab: !!el?.closest?.('#tunelab') }
  })
  expect(overlayOpen.isLab, '#97 — 연 작업대는 실제로 맨 위다(행위 값)').toBe(true)
  const cvHash = () => page.evaluate(() => {
    const c = document.getElementById('tunelab-cv') as HTMLCanvasElement
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let h = 0x811c9dc5
    for (let i = 0; i < d.length; i += 16) h = Math.imul(h ^ d[i + 3]!, 0x01000193) >>> 0
    return h >>> 0
  })
  const knobIds: string[] = await page.evaluate(() =>
    [...document.querySelectorAll('#tunelab-knobs input, #tunelab-curves input')].map(e => e.id))
  expect(knobIds.length, '손잡이 전수(값 13 + 곡선 2×5)').toBe(23)
  // 도구별로: 각 손잡이를 끝값으로 밀었을 때 시험 판이 바뀌는가 — «죽은 손잡이 없음»의
  // 술어는 「모든 손잡이가 **적어도 한 도구**에서 자국을 바꾼다」다(모드마다 유효 축이
  // 다른 것은 데이터 모델의 사실 — 매트릭스를 원장으로 낸다).
  const changedBy: Record<string, string[]> = {}
  for (const ins of ['pencil', 'marker', 'cp', 'brush']) {
    await page.click('#tunelab-pick-' + ins)
    await page.waitForTimeout(50)
    for (const id of knobIds) {
      // 전제 축 — 끝 «크기»(tipLenK)는 끝 «강조»(tipAlpha)가 0이면 보일 수 없다(구성).
      // 죽은 배선인지 재려면 전제를 켜고 잰다(잰 뒤 걷는다).
      const needsTip = id === 'tunelab-k-tipLenK'
      if (needsTip) {
        await page.evaluate(() => {
          const el = document.getElementById('tunelab-k-tipAlpha') as HTMLInputElement
          el.value = '0.5'
          el.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
      const before = await cvHash()
      const prev = await page.evaluate((kid) => {
        const el = document.getElementById(kid) as HTMLInputElement
        const p = el.value
        el.value = el.max
        if (Number(p) === Number(el.max)) el.value = el.min   // 이미 최대면 최소로
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return p
      }, id)
      const after = await cvHash()
      if (after !== before) (changedBy[id] ??= []).push(ins)
      await page.evaluate(([kid, p]) => {
        const el = document.getElementById(kid) as HTMLInputElement
        el.value = p
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, [id, prev] as const)
      if (needsTip) {
        await page.evaluate(() => {
          const el = document.getElementById('tunelab-k-tipAlpha') as HTMLInputElement
          el.value = '0'
          el.dispatchEvent(new Event('input', { bubbles: true }))
        })
      }
    }
    // 이 도구의 조정을 걷는다(다음 도구 측정의 기준을 깨끗하게)
    await page.click('#tunelab-reset')
    await page.waitForTimeout(30)
  }
  const dead = knobIds.filter(id => !changedBy[id] || changedBy[id]!.length === 0)
  // 도구별 비활성 수(2차 [6] — «적어도 한 도구»는 합집합의 자다: 사람이 겪는 것은 «지금
  // 이 도구»다. 무효 축은 비활성으로 보이고, 그 수를 값으로 낸다)
  const disabledOf: Record<string, number> = {}
  for (const ins of ['pencil', 'marker', 'cp', 'brush']) {
    await page.click('#tunelab-pick-' + ins)
    await page.waitForTimeout(40)
    disabledOf[ins] = await page.evaluate(() =>
      [...document.querySelectorAll('#tunelab-knobs input, #tunelab-curves input')]
        .filter(e => (e as HTMLInputElement).disabled).length)
  }
  // 34-0의 수(2차 [9] — #96: «있다/없다»가 아니라 쓸 수 있는 상태의 값): 이 라운드가 더한
  // 손잡이 24(칠통 슬라이더 1 + 작업대 23)의 툴팁·상태표식·값 표찰
  const rules = await page.evaluate(() => {
    const labInputs = [...document.querySelectorAll('#tunelab-knobs input, #tunelab-curves input')] as HTMLInputElement[]
    const slider = document.getElementById('paint-size-range') as HTMLInputElement
    const all = [...labInputs, slider]
    const tipOk = all.filter(e => {
      const host = e.closest('label, button') as HTMLElement | null
      return !!((e.title || host?.title || '').trim())
    }).length
    const knobVals = [...document.querySelectorAll('#tunelab-knobs')].length > 0
      ? [...document.querySelectorAll('#tunelab-knobs label')].filter(l => {
          const sp = l.querySelectorAll('span')
          return sp.length >= 2 && (sp[sp.length - 1]!.textContent || '').trim().length > 0
        }).length
      : 0
    const sliderVal = ((document.getElementById('paint-size-val')?.textContent) || '').trim().length > 0
    return { handles: all.length, tooltip_ok: tipOk, knob_value_labels: knobVals, slider_value_label: sliderVal }
  })
  expect(rules.tooltip_ok, '툴팁 — 손잡이 전수(값)').toBe(rules.handles)
  expect(rules.knob_value_labels, '값 표찰 — 작업대 값 손잡이 13').toBe(13)
  expect(rules.slider_value_label, '값 표찰 — 크기 슬라이더').toBe(true)
  OUT.gate_lab = {
    def: '손잡이 23(값 13 + 곡선 10) × 도구 4 — 각 손잡이를 끝값으로 밀어 시험 판 해시가 바뀌는 도구 목록. 술어 = 죽은 배선 0(모든 손잡이가 적어도 한 도구에서 자국을 바꾼다). ⚠ tipLenK 행은 전제(tipAlpha 0.5 켬 — 끝 크기는 끝 강조 0에서 보일 수 없다: 구성) 아래의 값이다(2차 [6] — 행마다 조건 명시 #11). 사람이 겪는 축은 disabled_per_instr가 값(무효 축 비활성 — 마커 20/23). overlay = #97 반증(닫힘: 안 덮음 · 열림: 맨 위). rules = 34-0의 수(#96 — 툴팁·값 표찰)',
    matrix: changedBy, dead, disabled_per_instr: disabledOf,
    overlay: { closed: overlayClosed, open: overlayOpen }, rules,
  }
  expect(dead, '죽은 배선 없음: ' + dead.join(',')).toEqual([])
  // 시험 긋기 — 판에 직접 그으면 자국이 남는다(제품과 같은 함수 — 값은 해시 변화)
  const hBefore = await cvHash()
  const cv = await page.evaluate(() => {
    const r = (document.getElementById('tunelab-cv') as HTMLElement).getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.mouse.move(cv.x + 30, cv.y + cv.h - 40)
  await page.mouse.down()
  await page.mouse.move(cv.x + cv.w - 30, cv.y + 30, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  expect(await cvHash(), '직접 그은 자국이 남는다').not.toBe(hBefore)
  // 「굳힌다」 — 기기(localStorage)에 남고, 새로 열어도 산다
  await page.click('#tunelab-pick-marker')
  await page.evaluate(() => {
    const el = document.getElementById('tunelab-k-tipAlpha') as HTMLInputElement
    el.value = '0.27'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.click('#tunelab-bake')
  const stored = await page.evaluate(() => localStorage.getItem('b2.brushTune.v1'))
  expect(stored, '굳힌다 — 기기에 남는다').toContain('tipAlpha')
  await page.goto('/')          // ⚠ reset이 아니라 재부팅 — 굳힌 값은 문서가 아니라 기기의 것
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const revived = await page.evaluate(() => (window as any).__b2.diag.brushDefForTest('marker').tipAlpha)
  expect(revived, '다시 열어도 산다(52 프리셋의 자리)').toBeCloseTo(0.27, 6)
  // **부활한 값이 제품 자국까지 간다**(2차 [14] — «같은 paintMark»는 코드 사실이고 여기는
  // 값): 재부팅 상태에서 면을 세우고 마커로 그어, 팁 창 비가 굳힌 값(0.27)을 따라 1.1을
  // 넘는 것을 잰다(기본 0이면 이 술어는 죽는다 — 게이트 ①이 그 반대편 값).
  await drawLine(page, 500, 500, 700, 450)
  await drawLine(page, 500, 500, 300, 450)
  await drawLine(page, 700, 450, 300, 450)
  await page.click('#btn-face')
  await page.mouse.click(500, 470); await page.mouse.up().catch(() => {})
  await page.waitForTimeout(120)
  expect(await page.evaluate(() => (window as any).__b2.app.faces.length), '면이 섰다').toBeGreaterThanOrEqual(1)
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 14 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
  await drawLine(page, 430, 470, 560, 470)
  await page.waitForTimeout(200)
  const W2 = 14, h2 = 20
  const tipS = await inkMass(page, 430 - W2 / 2, 470 - h2 / 2, 430 + W2 / 2, 470 + h2 / 2)
  const bodyS = await inkMass(page, 495 - W2 / 2, 470 - h2 / 2, 495 + W2 / 2, 470 + h2 / 2)
  const prodRatio = tipS / Math.max(1, bodyS)
  expect(prodRatio, '굳힌 팁(0.27)이 제품 자국에 실제로 찍힌다(> 1.1)').toBeGreaterThan(1.1)
  // 뒷정리 — 굳힌 시험 값을 걷는다(다음 팔·실사용 오염 ⛔)
  await page.evaluate(() => {
    localStorage.removeItem('b2.brushTune.v1')
    ;(window as any).__b2.diag.setBrushTuneForTest('marker', null)
  })
  OUT.gate_bake = { stored_key: 'b2.brushTune.v1', revived_tipAlpha: revived, product_tip_over_body: prodRatio }
})

test('게이트 ⑤ 크기 — 새 대역(사람 값)에서 슬라이더 == 자국 · 붓은 비례(2배 → 2배)', async ({ page }) => {
  // 2차 [1] — brush51 ⑤는 2.5~40(옛 트레이 대역)이다. 사람이 연 대역(마커 100 · 붓 500 ·
  // 색연필/연필 50)의 위쪽을 여기서 잰다. 굵기는 **UI 슬라이더**로 넣는다(제품 핸들러).
  // ⚠ 붓 500은 화면의 어느 면보다 굵다(벽 높이 ~280px) — 절대 1:1 대신 **비례**(125→250 =
  // 2.00배)와 **값 왕복**(슬라이더 500 → paintSel 500)으로 그 대역을 건다(측정 대역의
  // 정직한 사유 — 원장 def).
  await bigBox(page)
  const setViaSlider = async (ins: string, w: number) => {
    await page.evaluate(([i]) => { (window as any).__b2.app.paintSel.i = i }, [ins] as const)
    await page.click('#btn-paint')
    if (await page.locator('#painttray.open').count() === 0) await page.click('#btn-paint')
    await page.evaluate((v) => {
      const el = document.getElementById('paint-size-range') as HTMLInputElement
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, w)
    await page.mouse.click(150, 700)
    await page.waitForTimeout(60)
    return page.evaluate(() => (window as any).__b2.app.paintSel.w)
  }
  /** 세로 열에서 자국의 띠 두께(css px) — 열 x에서 어두운 행 수.
   *  ⚠ 임계는 인자다: 칠한 면의 바탕이 dk ≈ 13으로 뜬다(실측 — 48-9 불투명 면의 표시 틴트).
   *  마커·색연필(자국 dk ~83)은 40, 붓(옅은 흑연 ~30~60)은 25 — 바탕(13) 위·자국 아래. */
  const thickness = (x: number, y0: number, y1: number, th = 40) => page.evaluate(([x, y0, y1, th]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    const hh = Math.round((y1 - y0) * dpr)
    t.width = 2; t.height = hh
    t.getContext('2d')!.drawImage(c, Math.round(x * dpr), Math.round(y0 * dpr), 2, hh, 0, 0, 2, hh)
    const d = t.getContext('2d')!.getImageData(0, 0, 2, hh).data
    let rows = 0
    for (let ry = 0; ry < hh; ry++) {
      const i = (ry * 2) * 4
      const a = d[i + 3]! / 255
      const dk = (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) * a
      if (dk > th) rows++
    }
    return rows / dpr
  }, [x, y0, y1, th] as const)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const tolW = cs.PAINT51_SWATCH_W_TOL as number
  /** 열 다섯의 최대 — 색연필 구멍(격자 셀이 굵기급)이 지나는 열은 가장자리가 깎인다(실측
   *  편차 0.26): 명목 굵기는 «구멍 없는 열»의 폭이다. */
  const thickMax = async (y0: number, y1: number, th = 40, cols: number[] = [620, 660, 700, 740, 780]) => {
    let m = 0
    for (const x of cols) m = Math.max(m, await thickness(x, y0, y1, th))
    return m
  }
  // ① 마커 100(사람 값 그대로) — 절대 1:1
  expect(await setViaSlider('marker', 100), '슬라이더 100 → paintSel').toBe(100)
  await page.evaluate(() => { (window as any).__b2.app.paintSel.hex = '#1e7fd0' })
  await drawLine(page, 540, 480, 860, 480)
  await page.waitForTimeout(200)
  const wMarker = await thickMax(480 - 80, 480 + 80)
  expect(Math.abs(wMarker - 100) / 100, '마커 100 — 슬라이더 == 자국').toBeLessThan(tolW)
  // ② 색연필 50(그 도구의 최대) — 도장 도구의 명목 굵기는 **압력 곡선 몫**이다(51 규약 —
  // 도장 반지름 = w/2 × widthFactor(press) · 마우스 press 0.5). 기대값은 제품 곡선에서
  // 읽는다(#88 — diag.paintProfile: 0.925). 부드러운 테두리의 잔여는 문 안(실측 -20%).
  expect(await setViaSlider('cp', 50)).toBe(50)
  await drawLine(page, 540, 600, 860, 600)
  await page.waitForTimeout(200)
  const wCp = await thickMax(600 - 45, 600 + 45, 25)   // 색연필 — 부드러운 테두리(도장 림)가 40 아래로 흩어진다(dpr2 실측 0.254): 바탕(13) 위 25가 그 자
  const wf = (await page.evaluate(() => (window as any).__b2.diag.paintProfile(0.5))).w as number
  const cpExpect = 50 * wf
  expect(Math.abs(wCp - cpExpect) / cpExpect, '색연필 50 — 슬라이더×곡선(0.925) == 자국').toBeLessThan(tolW)
  // ③ 붓 — 비례(125 → 250 = 2.00배 ± 20%) + 값 왕복 500. ⚠ **같은 장면의 좌·우 반쪽**에
  // 나란히 긋는다 — 시험 «안» 재탐색(?reset)은 문서를 못 비운다: ?reset은 캐시 탈출구이고
  // 그림(자동 저장)은 안 건드린다(main.ts 문면). 스펙의 «리셋»이 먹히는 것은 시험마다
  // 브라우저 문맥이 새것이기 때문이다(실측: 재탐색 뒤 획 18 = 옛 장면 복원 · 표식이 잡음).
  // 비례 짝 60→120 — 붓의 유효 폭은 명목의 ~1.6배(빗살 중심 산포 ±0.5w + 반지름)라
  // 250은 벽 높이(이 열에서 ~300px)를 넘쳐 잘린다(실측: 비례 1.31 — 위 모서리 클립).
  // 120이 화면 실측의 상한이고(60→120이 비례의 술어 · 여전히 옛 대역 40 밖),
  // 그 위(250·500)는 값 왕복이 술어다.
  expect(await setViaSlider('brush', 60)).toBe(60)
  await drawLine(page, 540, 430, 660, 430)
  await page.waitForTimeout(200)
  const wB1 = await thickMax(430 - 60, 430 + 60, 25, [560, 590, 620])
  expect(await setViaSlider('brush', 120)).toBe(120)
  await drawLine(page, 740, 430, 860, 430)
  await page.waitForTimeout(200)
  const wB2 = await thickMax(430 - 110, 430 + 110, 25, [780, 810, 840])
  const ratio = wB2 / Math.max(1, wB1)
  expect(Math.abs(ratio - 2), '붓 — 슬라이더 2배 = 자국 ~2배(비례)').toBeLessThan(0.4)
  const w250 = await setViaSlider('brush', 250)
  expect(w250, '값 왕복 — 붓 250').toBe(250)
  const w500 = await setViaSlider('brush', 500)
  expect(w500, '값 왕복 — 붓 최대 500').toBe(500)
  OUT.gate_size = {
    def: '새 대역의 크기 게이트(2차 [1] — brush51 ⑤(2.5~40 · UI 왕복·클램프)의 위쪽 짝): 마커 100·색연필 50은 절대(문 C.PAINT51_SWATCH_W_TOL — 값은 brush51 원장 constants_used) · 붓은 비례 60→120(**같은 장면 좌/우 반쪽** — 시험 안 ?reset은 문서를 못 비운다(캐시 탈출구 · 자동 저장 복원 — 실측 획 18) · 2±0.4 · 유효 폭 ≈ 명목×1.6(빗살 산포)이라 120이 벽(이 열 ~300px) 안 실측 상한 — 250은 위 모서리에 잘렸다(실측 1.31): 그 위(250·500)는 값 왕복이 술어. 빗살 산포로 절대 두께는 명목보다 넓다 — 절대 술어는 band·stamps 몫)',
    thresholds: { band: 40, cp: 25, brush: 25, base_tint: '~13(실측 — 칠한 면 바탕)' },
    marker100: wMarker, cp50: wCp, cp_expected: cpExpect, brush60: wB1, brush120: wB2, brush_ratio: ratio, slider_roundtrip: { w250, w500 },
  }
})
