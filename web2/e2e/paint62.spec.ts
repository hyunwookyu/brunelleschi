// web2-62 — mypaint 엔진 + 올바른 합성의 게이트 여덟(지시 62 「게이트」 표).
//
//   ① 흰 테 0      옅은 가장자리(층 알파 2..70/255)에서 합성 RGB가 배경보다 밝아지지 않는다 — 전수.
//                   판은 **회색 바탕 + 어두운 안료**(흰 바탕은 «밝아질 수 없다»라 자가 안 잰다 — D-3).
//                   반증: fringeBreak(옅은 가장자리 rgb를 흰색으로 — 흰 테 ①의 재현)가 실제로 걸린다.
//   ② rgb ≤ a       단언이 실행된다 — 정상 0 · 일부러 깨면(premulBreak) 던지고 수가 는다.
//   ③ 겹침 물성     파랑 위 노랑(paint_mode 1 · 반반) = 초록 색상각 · paint_mode 끄면 초록이 아니다.
//   ④ 획 안/사이    한 획 자기교차 p95 ≤ 몸통 p95 × (1+tol) · 반증(capOff)은 넘는다 · 두 획은 쌓인다.
//   ⑤ 젖은 붓       smudge 브러시가 캔버스(빨강)를 실제로 문다(값) · 제 자국 표집 0 · 반증 둘.
//   ⑥ 프리셋 충실도  196 · 설정 키 65 안 · 미지 설정 0 · 건너뛴 입력은 surfacemap_*뿐(단위 시험이 값을 대조).
//   ⑦ 넷을 넘어     196 견본의 통계 서명이 서로 갈린다(칠해진 것의 90% 이상이 고유) · 반증(전부 같은 브러시) 1.
//   ⑧ 결정론        같은 획·같은 시드 = 같은 픽셀 · 시드가 다르면 다르다(Math.random ⛔).
//   + 탐침          실재 · 비용(면 20×획 40 · 획별) · 보정표 · 층 예산(bake62의 자리 — 이 원장에 든다).
//
// 자의 자리: diag.markSampleForTest / markMultiForTest(bake) — 흰(또는 지정) 판에 제품과 같은
// 함수(이음매 drawMark / drawMarksSeam)로 긋는다(#54 · #103 호출마다 새 캔버스).
// 원장: stage0/out/paint62_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-62 — mypaint 엔진·합성 게이트 여덟: ①흰 테 0 ②rgb≤a ③겹침 물성 ④획 안/사이 ⑤젖은 붓 ⑥프리셋 충실도 ⑦넷을 넘어 ⑧결정론 + 탐침(비용·보정·층)',
  note_pitfalls: '#103(호출마다 새 캔버스 — scene 열쇠) · #102(?reset 시험당 1회) · #101(web2 러너) · #99(병합-쓰기) · #105(보정 실패는 ok:false 표식) · #12(⑦은 196 전수 · ①은 도구 넷+프리셋 여덟 · 동작점 하나가 아니다)',
  scene: '호출마다 markSample/markMulti가 새 캔버스를 만든다(문서·뷰 무관 · 잔류 없음)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint62_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { /* 첫 실행 */ }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint62.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  const id = await page.evaluate(() => (window as any).__b2.diag.paintRendererId())
  expect(id, '칠 렌더러는 mypaint다').toBe('mypaint')
}

type Instr = 'brush' | 'marker' | 'cp' | 'pencil'
const TOOLS: Instr[] = ['pencil', 'cp', 'marker', 'brush']
/** ①의 프리셋 표본 — 분류 일곱을 가로지른다(마른·젖은·안료·스머지·끌·에어브러시) */
const FRINGE_PRESETS = ['classic/pen', 'deevad/airbrush', 'Dieterle/Round#1', 'tanda/watercolor-02-paint',
  'ramon/Pastel_1', 'kaerhon_v1/paint_sm', 'experimental/soft', 'classic/knife']

/** 흰 테 자 — 배경 위 안료: 층 알파 창(C.PAINT62_EDGE_ALPHA_LO..HI /255) 안 픽셀의 합성 RGB가 «배경과 안료 사이»를 벗어나는 수.
 *  brighter = 배경보다 밝아진 쪽(관용 C.PAINT62_FRINGE_TOL — 흰 테의 정의) · brighter0 = 관용 0 · outside = 배경·안료 어느
 *  쪽으로든 창 밖(안료가 밝을 때는 «안료보다 밝은» 것이 흰 테다). 조합 둘: 어두운 안료/밝은 배경 · 밝은 안료/어두운 배경. */
const fringeOf = (page: Page, tool: Instr, preset: string | undefined, seed = 62, combo: 'dark' | 'light' = 'dark') =>
  page.evaluate(([t, p, sd, cb]) => {
    const b2 = (window as any).__b2
    const cs = b2.diag.paint50Constants()
    const BG = cb === 'dark' ? 140 : 48, PIG = cb === 'dark' ? '#2a2a30' : '#d8d0c0', BGHEX = cb === 'dark' ? '#8c8c8c' : '#303030'
    const pig = cb === 'dark' ? [0x2a, 0x2a, 0x30] : [0xd8, 0xd0, 0xc0]
    const W = 480, H = 240
    b2.diag.markSampleForTest(t, 'wave', 22, sd, W, H, { preset: p, color: PIG, bg: BGHEX })
    const cv = (window as any).__m61cv as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, W, H).data
    const L = b2.diag.lastLayerAlphaForTest() as { a: number[]; w: number; h: number } | null
    if (!L || L.w !== W) return { edge: 0, brighter: 0, brighter0: 0, outside: 0, maxOver: 0, painted: 0 }
    const TOL = cs.PAINT62_FRINGE_TOL as number, LO = cs.PAINT62_EDGE_ALPHA_LO as number, HI = cs.PAINT62_EDGE_ALPHA_HI as number
    let edge = 0, brighter = 0, brighter0 = 0, outside = 0, maxOver = 0, painted = 0
    for (let i = 0; i < W * H; i++) {
      const a = L.a[i]! * 255
      if (a > 0.5) painted++
      if (a < LO || a > HI) continue
      edge++
      let bright = false, bright0 = false, out = false
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c]!
        const hi = Math.max(BG, pig[c]!), lo = Math.min(BG, pig[c]!)
        if (v > hi + TOL) { out = true; maxOver = Math.max(maxOver, v - hi) }
        if (v < lo - TOL) out = true
        if (v > BG + TOL) bright = true
        if (v > BG) bright0 = true
      }
      if (bright) brighter++
      if (bright0) brighter0++
      if (out) outside++
    }
    return { edge, brighter, brighter0, outside, maxOver, painted }
  }, [tool, preset, seed, combo] as const)

test('① 흰 테 0 — 옅은 가장자리 전수(도구 넷 + 프리셋 여덟) · 반증(fringeBreak)', async ({ page }) => {
  test.setTimeout(180_000)
  await boot(page)
  const rows: Record<string, unknown> = {}
  let edgeTotal = 0, brighterTotal = 0
  for (const t of TOOLS) {
    const r = await fringeOf(page, t, undefined)
    rows[t] = r; edgeTotal += r.edge; brighterTotal += r.brighter
    expect(r.painted, `${t} 자국 실재`).toBeGreaterThan(300)
    expect(r.edge, `${t} 옅은 가장자리 픽셀이 있다(자의 분모)`).toBeGreaterThan(50)
  }
  for (const p of FRINGE_PRESETS) {
    const r = await fringeOf(page, 'brush', p)
    rows[p] = r; edgeTotal += r.edge; brighterTotal += r.brighter
  }
  let brighter0Total = 0, outsideTotal = 0
  for (const r of Object.values(rows) as { brighter0: number; outside: number }[]) { brighter0Total += r.brighter0; outsideTotal += r.outside }
  // 둘째 조합(리뷰어 [M3] — 배경·안료 한 조합은 동작점 하나 #12): 밝은 안료 / 어두운 배경 — 여기서 «흰 테»는 안료보다 밝은 픽셀이다
  const rowsLight: Record<string, unknown> = {}
  let edgeL = 0, outsideL = 0
  for (const t of TOOLS) { const r = await fringeOf(page, t, undefined, 62, 'light'); rowsLight[t] = r; edgeL += r.edge; outsideL += r.outside }
  for (const p of ['classic/pen', 'deevad/airbrush', 'Dieterle/Round#1', 'ramon/Pastel_1']) { const r = await fringeOf(page, 'brush', p, 62, 'light'); rowsLight[p] = r; edgeL += r.edge; outsideL += r.outside }
  // 반증 — 옅은 가장자리 rgb를 흰색으로(흰 테 ①의 형태) → 회색 바탕 위에서 «배경보다 밝은» 픽셀이 선다
  await page.evaluate(() => (window as any).__b2.diag.setFringeBreakForTest(true))
  const broken = await fringeOf(page, 'pencil', undefined)
  // 밝은 안료 조합의 흰 테는 «안료보다 밝은» 것 — 그 조합에서 새는 형태는 검정(premultiplied를 스트레이트로 읽는 병)이라 검정 주입으로 반증
  await page.evaluate(() => (window as any).__b2.diag.setFringeBreakForTest('dark'))
  const brokenLight = await fringeOf(page, 'pencil', undefined, 62, 'light')
  await page.evaluate(() => (window as any).__b2.diag.setFringeBreakForTest(false))
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  OUT.constants_snapshot = { PAINT62_EDGE_ALPHA_LO: cs.PAINT62_EDGE_ALPHA_LO, PAINT62_EDGE_ALPHA_HI: cs.PAINT62_EDGE_ALPHA_HI, PAINT62_FRINGE_TOL: cs.PAINT62_FRINGE_TOL, PAINT62_GREEN_HUE: cs.PAINT62_GREEN_HUE, PAINT62_GREEN_SAT: cs.PAINT62_GREEN_SAT, PAINT62_SMUDGE_RG_MIN: cs.PAINT62_SMUDGE_RG_MIN, PAINT62_PAINTED_ALPHA: cs.PAINT62_PAINTED_ALPHA, PAINT62_SIG_DIGITS: cs.PAINT62_SIG_DIGITS, PAINT62_DISTINCT_MIN: cs.PAINT62_DISTINCT_MIN, PAINT62_CAP_TOL: cs.PAINT62_CAP_TOL, note: '스냅샷-라이트(web2 원장의 constantsSnapshot 기계 부재는 종전 유보 · 값은 constants.ts가 정본)' }
  OUT.fringe = {
    def: '조합 ① 회색 바탕(140) 위 어두운 안료(#2a2a30) · 조합 ② 어두운 바탕(48) 위 밝은 안료(#d8d0c0) — 물결 22px. 층 알파 창(C.PAINT62_EDGE_ALPHA_LO..HI /255)의 픽셀(edge)에서 brighter = 배경+C.PAINT62_FRINGE_TOL보다 밝은 수(흰 테의 정의 · 조합 ①의 술어) · brighter0 = 관용 0으로 센 수(기록 — 8비트 반올림의 몫) · outside = 배경·안료 사이 창 밖(어느 쪽이든 · 조합 ②의 술어 — 안료보다 밝은 것이 흰 테) · maxOver = 창 위로 벗어난 최대. 도구 넷 + 프리셋 8(①) / 넷 + 4(②). 반증 fringeBreak = 그 픽셀의 rgb를 흰색(조합 ①)/검정(조합 ② — 어두운 쪽으로 새는 병)으로 — 두 조합 다 실제로 걸린다',
    rows, edge_total: edgeTotal, brighter_total: brighterTotal, brighter0_total: brighter0Total, outside_total: outsideTotal,
    rows_light: rowsLight, edge_total_light: edgeL, outside_total_light: outsideL,
    falsification_fringe_break: broken, falsification_fringe_break_light: brokenLight,
    threshold: { fringe_tol: cs.PAINT62_FRINGE_TOL, edge_alpha: [cs.PAINT62_EDGE_ALPHA_LO, cs.PAINT62_EDGE_ALPHA_HI] },
  }
  expect(brighterTotal, '흰 테 0 — 옅은 가장자리 어디서도 배경보다 밝지 않다(전수 · 관용 2)').toBe(0)
  expect(brighter0Total, '흰 테 0 — 관용 0으로 세어도 0').toBe(0)
  expect(outsideTotal, '옅은 가장자리가 배경·안료 사이를 안 벗어난다(전수)').toBe(0)
  expect(edgeL, '밝은 안료 조합에도 옅은 가장자리가 있다(분모)').toBeGreaterThan(200)
  expect(outsideL, '밝은 안료 / 어두운 배경 — 안료보다 밝은 픽셀 0(전수)').toBe(0)
  expect(broken.brighter, '반증 — fringeBreak가 밝은 픽셀을 실제로 만든다(자가 산다)').toBeGreaterThan(20)
  expect(brokenLight.outside, '반증(밝은 안료 조합) — 창 밖(배경보다 어두운) 픽셀이 선다').toBeGreaterThan(20)
})

test('② rgb ≤ a — 단언이 돈다: 정상 0 · 일부러 깨면 던지고 수가 는다', async ({ page }) => {
  await boot(page)
  const before = await page.evaluate(() => {
    const b2 = (window as any).__b2
    for (const t of ['pencil', 'cp', 'marker', 'brush']) b2.diag.markSampleForTest(t, 'cross', 20)
    return b2.diag.premulViolationsForTest() as number
  })
  const broken = await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPremulBreakForTest(true)
    let threw = false, msg = ''
    try { b2.diag.markSampleForTest('pencil', 'line', 20) } catch (e) { threw = true; msg = String((e as Error).message).slice(0, 80) }
    return { threw, msg, violations: b2.diag.premulViolationsForTest() as number }
  })
  const after = await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.markSampleForTest('cp', 'wave', 20)
    return b2.diag.premulViolationsForTest() as number
  })
  OUT.premul = { def: '층 rgb ≤ a 단언(획마다 상자 전수 · DEV에서 던진다). before = 도구 넷 뒤 누적 위반 · broken = premulBreak(한 픽셀 r = a + .5) 뒤 · after = 그다음 정상 획 뒤(수가 더 안 는다)', before, broken, after }
  expect(before, '정상 획 — 위반 0').toBe(0)
  expect(broken.threw, '일부러 깨면 던진다(디버그 빌드 — vite dev)').toBe(true)
  expect(broken.violations, '깬 픽셀이 세어진다').toBeGreaterThan(0)
  expect(after, '그다음 정상 획은 수를 안 늘린다').toBe(broken.violations)
})

/** 몸통(직선 ±w/4)의 평균 색 → 색상각·채도 */
const overlapHue = (page: Page, paintOff: boolean) =>
  page.evaluate((off) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintModeOffForTest(off)
    b2.diag.setGrainOffForTest(true)             // 안료 혼합의 자 — 종이 결(캡을 깎는다)은 여기서 끈다
    const W = 480, H = 240
    b2.diag.markMultiForTest([
      { tool: 'brush', shape: 'line', wPx: 28, seed: 11, preset: 'classic/pen', color: '#2040e0', over: { paint_mode: 1, opaque: 1, opaque_linearize: 0 }, press: 1 },
      { tool: 'brush', shape: 'line', wPx: 28, seed: 12, preset: 'classic/pen', color: '#f0d020', over: { paint_mode: 1, opaque: 0.65, opaque_linearize: 0 }, press: 1 },
    ], W, H, true)
    b2.diag.setGrainOffForTest(false)
    b2.diag.setPaintModeOffForTest(false)
    const cv = (window as any).__m61cv as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, W, H).data
    let r = 0, g = 0, b = 0, n = 0
    for (let y = H / 2 - 5; y <= H / 2 + 5; y++) for (let x = 100; x < W - 100; x++) {
      const i = (y * W + x) * 4; r += d[i]!; g += d[i + 1]!; b += d[i + 2]!; n++
    }
    r /= n; g /= n; b /= n
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    let h = 0
    if (mx > mn) {
      if (mx === r) h = ((g - b) / (mx - mn)) % 6
      else if (mx === g) h = (b - r) / (mx - mn) + 2
      else h = (r - g) / (mx - mn) + 4
      h = ((h * 60) + 360) % 360
    }
    return { rgb: [Math.round(r), Math.round(g), Math.round(b)], hue: +h.toFixed(1), sat: mx > 0 ? +((mx - mn) / mx).toFixed(3) : 0 }
  }, paintOff)

test('③ 겹침 물성 — 파랑 위 노랑 = 초록(색상각) · 반증: paint_mode 끔은 초록이 아니다', async ({ page }) => {
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const on = await overlapHue(page, false)
  const off = await overlapHue(page, true)
  const [H0, H1] = cs.PAINT62_GREEN_HUE as [number, number]
  const green = (h: number, s: number) => h > H0 && h < H1 && s > cs.PAINT62_GREEN_SAT
  // 동작점 스윕(리뷰어 [M4] · #12): 노랑 몫 .35/.5/.65/.8 × 결 끔·켬 — 초록 창이 어디까지인지 값으로
  const sweep: Record<string, unknown> = {}
  for (const grain of [false, true]) for (const y of [0.35, 0.5, 0.65, 0.8]) {
    const r = await page.evaluate(([yy, g]) => {
      const b2 = (window as any).__b2
      b2.diag.setGrainOffForTest(!g)
      const W = 480, H = 240
      b2.diag.markMultiForTest([
        { tool: 'brush', shape: 'line', wPx: 28, seed: 11, preset: 'classic/pen', color: '#2040e0', over: { paint_mode: 1, opaque: 1, opaque_linearize: 0 }, press: 1 },
        { tool: 'brush', shape: 'line', wPx: 28, seed: 12, preset: 'classic/pen', color: '#f0d020', over: { paint_mode: 1, opaque: yy, opaque_linearize: 0 }, press: 1 },
      ], W, H, true)
      b2.diag.setGrainOffForTest(false)
      const d = ((window as any).__m61cv as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, W, H).data
      let r = 0, g2 = 0, b = 0, n = 0
      for (let yy2 = H / 2 - 5; yy2 <= H / 2 + 5; yy2++) for (let x = 100; x < W - 100; x++) { const i = (yy2 * W + x) * 4; r += d[i]!; g2 += d[i + 1]!; b += d[i + 2]!; n++ }
      r /= n; g2 /= n; b /= n
      const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b)
      let h = 0
      if (mx > mn) { if (mx === r) h = ((g2 - b) / (mx - mn)) % 6; else if (mx === g2) h = (b - r) / (mx - mn) + 2; else h = (r - g2) / (mx - mn) + 4; h = ((h * 60) + 360) % 360 }
      return { hue: +h.toFixed(1), sat: mx > 0 ? +((mx - mn) / mx).toFixed(3) : 0 }
    }, [y, grain] as const)
    sweep[`yellow_${y}_grain_${grain ? 'on' : 'off'}`] = r
  }
  OUT.pigment = {
    sweep, threshold: { hue: cs.PAINT62_GREEN_HUE, sat: cs.PAINT62_GREEN_SAT },
    note_sweep: '노랑 몫 스윕 × 결(리뷰어 [M4]): 어느 동작점이 초록 창 안인지 값으로 — .5는 청록 경계(첫 실측 173°)라 술어의 동작점은 .65 · 결 끔이다. 결 켬은 캡을 깎아 노랑 몫이 준다(값이 그 정도를 든다)',
    def: '굽기 통로(drawMarksSeam) — 파랑(#2040e0 · paint_mode 1 · opaque 1 · 압력 1 — opaque_multiply 곡선이 1) 직선 위에 노랑(#f0d020 · paint_mode 1 · opaque .65 · 압력 1 → 덮임 캡 .65 = 노랑 몫 .65 — 결 끔). ⚠ 반반(.5)은 이 10채널 모형에서 청록(hue 155 — node 실측)이라 «초록 대역 끝»이었다: 실물처럼 노랑이 조금 더 든 판을 자로 삼는다(.65 → hue ~110 예상). 몸통(±5px · x 100..380) 평균 색의 색상각(0..360)·채도. 초록 = 색상각 70..170 ∧ 채도 > .25. 반증 = paint_mode 강제 0(가산 over) — 초록 대역 밖',
    on, off, on_is_green: green(on.hue, on.sat), off_is_green: green(off.hue, off.sat),
  }
  expect(green(on.hue, on.sat), `파랑 위 노랑이 초록이다(hue ${on.hue} sat ${on.sat})`).toBe(true)
  expect(green(off.hue, off.sat), `반증 — paint_mode 끔은 초록이 아니다(hue ${off.hue} sat ${off.sat})`).toBe(false)
})

/** 자기교차 — 층 알파 지도의 교차 창 p95 ÷ 몸통 창 둘 p95 평균(굵기 폭 창) */
const crossRatio = (page: Page, tool: Instr, capOff: boolean, opacityK?: number) =>
  page.evaluate(([t, off, ok]) => {
    const b2 = (window as any).__b2
    b2.diag.setGrainOffForTest(true)
    b2.diag.setCapOffForTest(off)
    if (ok !== undefined) b2.diag.setPaintParamForTest(t, 'opacityK', ok)
    const W = 480, H = 240, w = 20
    b2.diag.markSampleForTest(t, 'cross', w, 61, W, H)
    b2.diag.setCapOffForTest(false)
    b2.diag.setGrainOffForTest(false)
    if (ok !== undefined) b2.diag.resetPaintTuneForTest(t)
    const L = b2.diag.lastLayerAlphaForTest() as { a: number[]; w: number; h: number }
    // 교차점 — markShape 'cross'의 첫 변 (50,H−50)→(W−60,55)과 셋째 변 (W·.52,42)→(W·.42,H−40)
    const A = { x: 50, y: H - 50 }, B = { x: W - 60, y: 55 }, Cc = { x: W * 0.52, y: 42 }, D = { x: W * 0.42, y: H - 40 }
    const den = (B.x - A.x) * (D.y - Cc.y) - (B.y - A.y) * (D.x - Cc.x)
    const tt = ((Cc.x - A.x) * (D.y - Cc.y) - (Cc.y - A.y) * (D.x - Cc.x)) / den
    const X = { x: A.x + tt * (B.x - A.x), y: A.y + tt * (B.y - A.y) }
    const p95 = (cx: number, cy: number): number => {
      const v: number[] = []
      for (let y = Math.round(cy - w / 2); y <= Math.round(cy + w / 2); y++)
        for (let x = Math.round(cx - w / 2); x <= Math.round(cx + w / 2); x++) v.push(L.a[y * W + x]!)
      v.sort((p, q) => p - q)
      return v[Math.floor(v.length * 0.95)]!
    }
    const bl = p95(A.x + 0.25 * (B.x - A.x), A.y + 0.25 * (B.y - A.y))
    const br = p95(A.x + 0.75 * (B.x - A.x), A.y + 0.75 * (B.y - A.y))
    const c = p95(X.x, X.y)
    const cap = b2.diag.lastStrokeCapForTest() as number     // 이 획의 «획 불투명도»(도장 목표 × 도구 캡 — 결 끔)
    return { cross: +c.toFixed(4), body_l: +bl.toFixed(4), body_r: +br.toFixed(4), ratio: +(c / ((bl + br) / 2)).toFixed(4), cap: +cap.toFixed(4), cross_over_cap: +(c / Math.max(1e-9, cap)).toFixed(4), at: [Math.round(X.x), Math.round(X.y)] }
  }, [tool, capOff, opacityK] as const)

test('④ 획 안/사이 — 자기교차 ≤ 몸통(캡) · 반증(capOff) · 두 획은 쌓인다', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const rows: Record<string, unknown> = {}, rowsOff: Record<string, unknown> = {}
  for (const t of TOOLS) { rows[t] = await crossRatio(page, t, false); rowsOff[t] = await crossRatio(page, t, true) }
  // 비포화 판(61 AS-C183의 그 물음) — 불투명 배수 .4에서도 캡이 묶는가
  const unsat: Record<string, unknown> = {}
  for (const t of ['pencil', 'cp'] as Instr[]) unsat[t] = await crossRatio(page, t, false, 0.4)
  // 획 사이 — 같은 직선 두 번(굽기 통로 · 층 over) vs 한 번: 몸통 알파
  const stack = await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setGrainOffForTest(true)
    const body = (n: number): number => {
      const items = Array.from({ length: n }, (_, k) => ({ tool: 'marker', shape: 'line', wPx: 20, seed: 100 + k }))
      b2.diag.markMultiForTest(items, 480, 240, true)
      const L = b2.diag.lastLayerAlphaForTest() as { a: number[]; w: number; h: number }
      let s = 0, c = 0
      for (let y = 116; y <= 124; y++) for (let x = 100; x < 380; x++) { s += L.a[y * 480 + x]!; c++ }
      return +(s / c).toFixed(4)
    }
    const one = body(1), two = body(2), three = body(3)
    b2.diag.setGrainOffForTest(false)
    return { one, two, three, ratio_2_1: +(two / one).toFixed(4), ratio_3_2: +(three / two).toFixed(4) }
  })
  OUT.self_cross = {
    def: '층 알파 지도(결 끔) — cross 도형(압력 .6 상수) 교차 창(굵기 폭 20×20) p95 · 첫 변 25%·75% 몸통 창 p95 · cap = 이 획의 «획 불투명도»(도장 목표 불투명도(선형화 전 opaque × 압력 곡선) × 도구 캡 — 엔진이 값으로 낸다). **술어 = cross_over_cap ≤ 1 + C.PAINT62_CAP_TOL**(지시 문면 「한 획 자기교차는 획 불투명도를 안 넘는다」 그대로). ratio(교차 ÷ 몸통)는 기록 — 부드러운 브러시(classic/pencil hardness .1 · 도장 산포)는 몸통이 목표에 못 미쳐 교차가 목표까지 «진해진다»(실물 연필과 같다 · libmypaint 설계 · 59의 최대값 합집합 구성과 다른 자리 — DECISIONS). 반증 capOff = libmypaint 원문 누적(cross_over_cap이 1을 넘는다). rows_unsaturated = 불투명 배수 .4(61이 못 가른 비포화 판 — 캡은 «목표»라 여기서도 cap 안). stack = 마커 직선 1·2·3번(굽기 통로 · 층 over)의 몸통 평균 알파 — 획 «사이»는 쌓인다',
    threshold_cap: 1 + cs.PAINT62_CAP_TOL, threshold_ratio_record_only: 1 + cs.PAINT59_CROSS_TOL, rows, rows_capoff: rowsOff, rows_unsaturated: unsat, stack,
  }
  for (const t of TOOLS) {
    const r = rows[t] as { cross: number; cap: number; cross_over_cap: number }
    expect(r.cross, `${t} 교차 창에 잉크가 있다`).toBeGreaterThan(0.05)
    expect(r.cap, `${t} 캡이 값으로 섰다`).toBeGreaterThan(0.05)
    expect(r.cross_over_cap, `${t} — 교차 p95 ≤ 획 불투명도(캡) × (1+tol)`).toBeLessThanOrEqual(1 + cs.PAINT62_CAP_TOL)
  }
  for (const t of ['pencil', 'cp'] as Instr[]) expect((unsat[t] as { cross_over_cap: number }).cross_over_cap, `${t} 비포화(.4)에서도 캡 안`).toBeLessThanOrEqual(1 + cs.PAINT62_CAP_TOL)
  const offMax = Math.max(...TOOLS.map(t => (rowsOff[t] as { cross_over_cap: number }).cross_over_cap))
  // 반증의 귀속(리뷰어 [H2]): 캡이 «묶는» 도구에서만 capOff가 값을 바꾼다 — 몸통이 목표에 못 미치는 도구(연필 — 산포 · 잉크펜 — 이미 1)는
  // 캡이 안 걸려 capOff와 제품이 같다. 어느 도구에서 반증이 실제로 섰는지를 값으로 남긴다.
  const capBinds = Object.fromEntries(TOOLS.map(t => [t, (rowsOff[t] as { cross_over_cap: number }).cross_over_cap > 1 + cs.PAINT59_CROSS_TOL]))
  ;(OUT.self_cross as Record<string, unknown>).falsification_binds = { def: 'capOff에서 교차가 캡을 문(1.08) 넘게 넘는 도구 — 여기서만 반증이 실행됐다(연필·잉크펜은 캡이 안 걸린 상태라 capOff가 항등: 실패 조건 미실행 — 그 도구의 ④는 «캡 안»이 아니라 «캡에 안 닿음»이다)', ...capBinds, n: Object.values(capBinds).filter(Boolean).length }
  expect(Object.values(capBinds).filter(Boolean).length, '반증 — 캡이 묶는 도구 둘 이상(cp·마커)에서 capOff가 캡을 넘는다').toBeGreaterThanOrEqual(2)
  expect(offMax, '반증 — capOff(원문 누적)에서 어느 도구든 교차가 캡을 넘는다').toBeGreaterThan(1 + cs.PAINT59_CROSS_TOL)
  expect(stack.ratio_2_1, '두 획은 쌓인다(마커 .55 → .80 대역)').toBeGreaterThan(1.3)
  expect(stack.ratio_3_2, '세 획 > 두 획(단조)').toBeGreaterThan(1.02)
})

/** 젖은 붓 — 빨강 직선 뒤 스머지 직선(아래로 14px 어긋남 · 폭 30): 빨강 띠 아래 자리의 평균 색 */
const smudgeTrail = (page: Page, smudgeOff: boolean, selfSample: boolean) =>
  page.evaluate(([off, self]) => {
    const b2 = (window as any).__b2
    b2.diag.setSmudgeOffForTest(off)
    b2.diag.setSmudgeSelfSampleForTest(self)
    const W = 480, H = 240
    b2.diag.markMultiForTest([
      { tool: 'brush', shape: 'line', wPx: 24, seed: 21, preset: 'deevad/liner', color: '#d02020', press: 0.8 },
      { tool: 'brush', shape: 'line', wPx: 30, seed: 22, preset: 'classic/smudge', color: '#000000', dy: 14, press: 0.7 },
    ], W, H, true)
    const st = b2.diag.smudgeStatsForTest() as { fromSnapshot: number; liveTouched: number; liveClean: number }
    b2.diag.setSmudgeOffForTest(false)
    b2.diag.setSmudgeSelfSampleForTest(false)
    const cv = (window as any).__m61cv as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, W, H).data
    let r = 0, g = 0, b = 0, n = 0
    for (let y = H / 2 + 13; y <= H / 2 + 26; y++) for (let x = 120; x < W - 120; x++) {
      const i = (y * W + x) * 4; r += d[i]!; g += d[i + 1]!; b += d[i + 2]!; n++
    }
    return { rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], dark: +(255 - (r + g + b) / 3 / n).toFixed(1), red_excess: +((r - g) / n).toFixed(1), stats: st }
  }, [smudgeOff, selfSample] as const)

test('⑤ 젖은 붓 — smudge가 캔버스 색을 실제로 문다(값) · 제 자국 표집 0 · 반증 둘', async ({ page }) => {
  await boot(page)
  const on = await smudgeTrail(page, false, false)
  const off = await smudgeTrail(page, true, false)
  const self = await smudgeTrail(page, false, true)
  OUT.smudge = {
    def: '굽기 통로 — 빨강 라이너(24px · 압력 .8) 위에 classic/smudge(30px · 14px 아래 · 검정 «색»)를 긋는다. 빨강 띠 «아래» 자리(y H/2+13..+26 · x 120..360)의 평균 색: red_excess = R−G(빨강을 물어 왔는가) · dark = 어둡기. stats = 스머지 표집 출처(fromSnapshot = 획 «전» 스냅숏 · liveTouched = 이 획이 이미 닿은 타일을 층에서 읽음 = 제 자국 오염). 반증 ① smudgeOff(smudge 0 — 제 색 검정을 칠한다 → red_excess 0 대역) ② selfSample(스냅숏 대신 층 — liveTouched > 0)',
    on, falsification_smudge_off: off, falsification_self_sample: self,
  }
  const cs5 = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  ;(OUT.smudge as Record<string, unknown>).threshold = { red_excess_min: cs5.PAINT62_SMUDGE_RG_MIN, note_liveClean: 'liveClean = 이 획이 «안 닿은» 타일을 층에서 읽은 표집(획 전 내용 그대로 — 오염 아님) · 오염의 술어는 liveTouched(닿은 타일을 층에서 읽음)뿐' }
  expect(on.dark, '스머지 자국이 실재한다').toBeGreaterThan(8)
  expect(on.red_excess, '캔버스의 빨강을 물어 왔다(R − G ≥ C.PAINT62_SMUDGE_RG_MIN)').toBeGreaterThanOrEqual(cs5.PAINT62_SMUDGE_RG_MIN)
  expect(on.stats.fromSnapshot, '표집이 있었다').toBeGreaterThan(0)
  expect(on.stats.liveTouched, '제 자국을 문 표본 0(오염 0)').toBe(0)
  expect(off.red_excess, '반증 ① — smudge 0이면 빨강을 안 문다(제 색)').toBeLessThan(on.red_excess / 3)
  expect(self.stats.liveTouched, '반증 ② — 층 표집이면 제 자국을 문다').toBeGreaterThan(0)
})

test('⑥⑦⑧ 프리셋 충실도 · 196이 서로 갈린다 · 결정론 · 탐침(비용·보정·층)', async ({ page }) => {
  test.setTimeout(300_000)
  await boot(page)
  const mapping = await page.evaluate(() => (window as any).__b2.diag.presetMappingForTest())
  OUT.mapping = { def: '196 프리셋 전부를 실어 센다 — settings(설정 항목) · curves(입력 곡선) · unknownSettings(65 밖 — 0이어야) · unknownInputs(18 밖 — surfacemap_*뿐 · libmypaint 원문도 경고·건너뜀)', ...mapping }
  expect(mapping.presets).toBe(196)
  expect(mapping.unknownSettings, '65 밖 설정 0').toBe(0)
  expect(mapping.unknownInputs, '로더에 오는 미지 입력 0(생성기가 걷었다)').toEqual({})
  expect(Object.keys(mapping.skipped).sort(), '생성기가 걷은 입력은 surfacemap_*뿐').toEqual(['surfacemap_x', 'surfacemap_y'])
  // ⑦ — 196 견본(직선 12px · 같은 시드)의 통계 서명
  const differ = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const cat = b2.diag.presetCatalogForTest() as { group: string; names: string[] }[]
    const W = 360, H = 120
    const sigOf = (preset: string): { mean: number; p95: number; bare: number; edgeSd: number } | null => {
      b2.diag.markSampleForTest('brush', 'line', 12, 62, W, H, { preset, color: '#3a3a44' })
      const L = b2.diag.lastLayerAlphaForTest() as { a: number[] }
      const band: number[] = []
      for (let y = H / 2 - 14; y <= H / 2 + 14; y++) for (let x = 60; x < W - 60; x++) band.push(L.a[y * W + x]!)
      const mean = band.reduce((p, q) => p + q, 0) / band.length
      let mx = 0
      for (const v of band) if (v > mx) mx = v
      if (mx < (b2.diag.paint50Constants().PAINT62_PAINTED_ALPHA as number)) return null   // «자국 없음» = 최대 알파 문턱 미만(4H 연필 .013이 문 위)
      const s = [...band].sort((p, q) => p - q)
      const p95 = s[Math.floor(s.length * 0.95)]!
      let core = 0, bare = 0
      for (let y = H / 2 - 6; y <= H / 2 + 6; y++) for (let x = 60; x < W - 60; x++) { core++; if (L.a[y * W + x]! < 0.15 * p95) bare++ }
      const edges: number[] = []
      for (let x = 60; x < W - 60; x++) for (let y = H / 2 - 14; y <= H / 2 + 14; y++) if (L.a[y * W + x]! > 0.5 * p95) { edges.push(y); break }
      const em = edges.length ? edges.reduce((p, q) => p + q, 0) / edges.length : 0
      const esd = edges.length ? Math.sqrt(edges.reduce((p, q) => p + (q - em) ** 2, 0) / edges.length) : 0
      return { mean: +mean.toFixed(4), p95: +p95.toFixed(4), bare: +(bare / core).toFixed(4), edgeSd: +esd.toFixed(3) }
    }
    const sigs: Record<string, ReturnType<typeof sigOf>> = {}
    const t0 = performance.now()
    for (const c of cat) for (const n of c.names) sigs[n] = sigOf(n)
    const ms = performance.now() - t0
    const painted = Object.entries(sigs).filter(([, v]) => v !== null)
    const keys = new Set(painted.map(([, v]) => JSON.stringify(v)))
    // 유효 자릿수 2(§5 · 리뷰어 [M2]) — 서명을 두 자리로 반올림한 고유 수가 술어다(4자리는 기록)
    const r2 = (v: number): number => +v.toPrecision(2)
    const keys2 = new Set(painted.map(([, v]) => JSON.stringify({ m: r2(v!.mean), p: r2(v!.p95), b: r2(v!.bare), e: r2(v!.edgeSd) })))
    // 빈 것의 사유(값) — 지우개 · 스머지 ≥ .7(젖은 붓·물만 · 빈 층에서는 문 것이 없다) · 포스터라이즈 · 투명(opaque ≤ .05) ·
    // 알파 잠금(빈 층에 못 칠한다) · smudge_transparency(문 알파가 문턱 아래면 안 칠한다)
    const reasonOf = (name: string): string => {
      const b = b2.diag.presetBaseForTest(name) as Record<string, number>
      const g = (k: string): number => b[k] ?? 0
      const r: string[] = []
      if (g('eraser') > 0) r.push('eraser')
      if (g('smudge') >= 0.65) r.push('smudge≥.65')
      if (g('posterize') > 0) r.push('posterize')
      if (g('opaque') <= 0.05) r.push('opaque≤.05')
      if (g('lock_alpha') > 0) r.push('lock_alpha')
      if (g('smudge_transparency') !== 0) r.push('smudge_transparency')
      // 성긴 도장(splatter — 기본 반지름 20개마다 도장 하나 · 추적 잡음 12): 짧은 견본 직선에 도장이 안 앉는다
      if (g('dabs_per_actual_radius') + g('dabs_per_basic_radius') < 0.2 && g('dabs_per_second') === 0) r.push('dabs_sparse')
      return r.join('+') || '??'
    }
    const empty = Object.fromEntries(Object.entries(sigs).filter(([, v]) => v === null).map(([k]) => [k, reasonOf(k)]))
    const unexplained = Object.entries(empty).filter(([, r]) => r === '??').map(([k]) => k)
    // 반증 — 전부 같은 브러시면 서명이 하나
    const same = new Set<string>()
    for (let k = 0; k < 8; k++) same.add(JSON.stringify(sigOf('classic/pencil')))
    const reasonCount: Record<string, number> = {}
    for (const r of Object.values(empty)) for (const k of (r as string).split('+')) reasonCount[k] = (reasonCount[k] ?? 0) + 1
    return { total: Object.keys(sigs).length, painted: painted.length, distinct4: keys.size, distinct2: keys2.size, empty, empty_reasons: reasonCount, unexplained, ms: +ms.toFixed(0), falsification_same_brush_distinct: same.size, sample: Object.fromEntries(painted.slice(0, 6)) }
  })
  const cs7 = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  OUT.differ = { def: '196 견본(직선 12px · 시드 62 · 잉크펜 슬롯 · 층 알파) 통계 서명 {mean,p95,bare,edgeSd} — painted = 최대 알파 ≥ C.PAINT62_PAINTED_ALPHA인 것 · distinct2 = 두 자리(§5 유효 자릿수 — 술어) 고유 서명 수 · distinct4 = 네 자리(기록) · empty_reasons = 사유별 수(겹침 포함) · empty = 빈 층에 아무것도 안 남긴 것과 그 사유(값 — eraser · smudge≥.65(젖은 붓·물만·블렌더) · posterize · opaque≤.05 · lock_alpha · smudge_transparency · dabs_sparse(반지름당 도장 < .2 — splatter)) · unexplained = 사유 없는 빈 것(0이어야). 반증 = 같은 브러시 8번 → 서명 1', ...differ }
  ;(OUT.differ as Record<string, unknown>).threshold = { painted_alpha: cs7.PAINT62_PAINTED_ALPHA, sig_digits: cs7.PAINT62_SIG_DIGITS, distinct_min: cs7.PAINT62_DISTINCT_MIN }
  expect(differ.unexplained, '빈 자국에는 전부 사유가 있다(엔진이 조용히 못 그리는 것이 없다)').toEqual([])
  expect(differ.painted, '196 중 140 이상이 빈 층에 자국을 남긴다(나머지는 사유 있는 젖은/지우개/투명 붓)').toBeGreaterThanOrEqual(140)
  expect(differ.distinct2 / differ.painted, '칠해진 것의 80% 이상이 두 자리 서명에서도 고유(§5 유효 자릿수)').toBeGreaterThanOrEqual(cs7.PAINT62_DISTINCT_MIN)
  expect(differ.falsification_same_brush_distinct, '반증 — 같은 브러시는 서명 하나').toBe(1)
  // ⑧ 결정론 — 분류 일곱의 프리셋 하나씩 + 도구 넷
  const det = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const hashOf = (tool: string, preset: string | undefined, seed: number): number => {
      b2.diag.markSampleForTest(tool, 'wave', 18, seed, 480, 240, preset ? { preset } : undefined)
      const m = (window as any).__m61 as { v: number[] }
      let h = 0
      for (let i = 0; i < m.v.length; i++) h = (Math.imul(h, 31) + Math.round(m.v[i]!)) | 0
      return h
    }
    const names = ['Dieterle/Round#1', 'classic/charcoal', 'deevad/spray', 'ramon/Pastel_1', 'experimental/bubble', 'tanda/splatter-04', 'kaerhon_v1/Dirty_Transparent_sk']
    const rows: Record<string, { same: boolean; differs: boolean }> = {}
    for (const n of names) { const a = hashOf('brush', n, 5), b = hashOf('brush', n, 5), c = hashOf('brush', n, 6); rows[n] = { same: a === b, differs: a !== c } }
    for (const t of ['pencil', 'cp', 'marker', 'brush']) { const a = hashOf(t, undefined, 5), b = hashOf(t, undefined, 5), c = hashOf(t, undefined, 6); rows[t] = { same: a === b, differs: a !== c } }
    return rows
  })
  OUT.determinism = { def: '같은 획·같은 시드 두 번의 어둡기 지도 해시가 같고(same — 전부 단언) 시드가 다르면 다르다(differs — 난수를 «쓰는» 것만 단언: 분류 일곱의 난수 프리셋 + 연필·색연필·마커. 잉크펜(deevad/liner)은 난수 없음 → 시드 무관이 맞다 · 기록)', rows: det, differs_asserted: ['Dieterle/Round#1', 'classic/charcoal', 'deevad/spray', 'ramon/Pastel_1', 'experimental/bubble', 'tanda/splatter-04', 'pencil', 'cp'], note_marker: '마커 슬롯 기본 ramon/100%_Opaque는 난수 없음(딱딱한 불투명 블록) → 시드 무관이 맞다 · same만 단언', note_kaerhon: 'kaerhon_v1 스무 개는 난수를 하나도 안 쓴다(offset/radius_by_random·tracking_noise·random 입력 전부 0 — 원문 실측) → 시드 무관이 맞다 · same만 단언' }
  const DIFFERS = new Set(['Dieterle/Round#1', 'classic/charcoal', 'deevad/spray', 'ramon/Pastel_1', 'experimental/bubble', 'tanda/splatter-04', 'pencil', 'cp'])
  for (const [k, v] of Object.entries(det)) { expect(v.same, `${k} 결정론`).toBe(true); if (DIFFERS.has(k)) expect(v.differs, `${k} 시드가 실린다`).toBe(true) }
  // 탐침 — 비용·보정·층(bake62의 자리)
  const probe = await page.evaluate(() => (window as any).__b2.diag.mypaintProbeForTest())
  OUT.probe = { def: '실재(markPx) · 결정론 · 면 20×획 40 굽기 ms(스트레스 800획 · 지시 픽스처 40획 · 획별 80) · 보정표(프리셋별 {a,b,ok,w1,w2} — 반지름 6·24의 반최대 폭 선형 · ok:false = 실패 표식 #105) · 층 현황 · 사상 · 합성 속도. ⚠ ms는 워커 1 원장의 값 — 밤(워커 4)은 기록만', ...probe }
  expect(probe.markPx, '자국 실재').toBeGreaterThan(500)
  expect(probe.deterministic, '탐침 결정론').toBe(true)
  const calib = probe.calib as Record<string, { ok: boolean }>
  const defaults = await page.evaluate(() => (window as any).__b2.diag.defaultPresetsForTest()) as Record<string, string>
  for (const n of Object.values(defaults)) expect(calib[n]?.ok, `${n} 크기 보정이 섰다(ok)`).toBe(true)
})
