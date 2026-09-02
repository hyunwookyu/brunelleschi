// web2-40 1번 — **겹의 결이 너무 굵다**의 게이트.
//
// 사람: 「롤 텍스쳐가 너무 크다.」 34-1이 내린 것은 **바탕 종이의 진폭**이고 이번 지적은
// **겹의 주기**다 — 무늬가 굵게 읽힌다. 그러므로 이 팔이 재는 것은 진폭이 아니라
// **공간 주기**이고, 진폭 쪽은 종전 팔 둘(grain26 · grain30)이 그대로 지킨다.
//
// ── 무엇을 «주기»로 재는가(#87 «재는 대상» · #92 «재는 양이 결과와 연결돼 있는가») ──
// 섬유 결은 주기 함수가 아니라 **불규칙 무늬**라 «파장»이 없다. 있는 것은 **상관 길이**다:
// 한 점의 밝기가 옆으로 얼마를 가야 «남남»이 되는가. 타일은 감싸 그리기로 실제 주기
// 경계를 갖는 판이라(filmlayer 3-c) **순환 자기상관**이 정확하고, 가로·세로 둘 다 재서
// 평균한다(섬유 우세각이 씨앗마다 달라 한 축만 재면 씨앗 뽑기로 흔들린다).
//
// ⚠⚠ **첫 판은 «r가 0.5로 떨어지는 지연»으로 쟀고 그것이 틀렸다**(D-4 · #87 — 이 회차가
//    자기 자에 걸렸다). 실측이 그것을 그 자리에서 냈다: 길이를 40% 줄였는데 그 값이
//    1.98 → 1.90 px(비 0.957)로 **거의 안 움직였다**. 까닭은 r의 **어깨**가 섬유 «굵기»가
//    정하는 양이기 때문이다 — 굵기는 web2-26 2번의 **바닥**이라 이 회차가 일부러 안
//    건드렸고, 그러니 그 자는 「안 건드린 축」을 재고 있었다. 무늬의 «크기»는 r의
//    **꼬리**에 있다(같은 실측: 지연 8에서 0.057 → 0.030 — 절반).
//
//    그래서 자를 둘로 갈라 **둘 다** 낸다:
//      ㉠ **상관 길이 = Σ_{k≥1} max(r(k), 0)** (기기 px) ÷ dpr → CSS px
//         ..... 꼬리를 다 더하므로 «무늬가 얼마나 길게 이어지는가»다. **이것이 주기다.**
//      ㉡ **반감 지연**(r = 0.5, 선형 보간) ..... 굵기가 정하는 **미세 구조**. 이 회차의
//         **바닥**이 여기 걸린다(아래).
//    ㉠은 줄어야 하고 ㉡은 **안 줄어야** 한다 — 그 둘이 「진폭·가시성은 그대로 두고
//    주기만 줄였다」의 값이다.
//
// ⚠ **결과 축이 맞는지 먼저 물었다**(#92): 이름표(「길이 상수를 바꿨다」)가 아니라
//    **화면에서 갈리는 자리**를 잰다 — ①타일의 상관 길이(결의 정체) ②합성 화면 조각의
//    **이웃차 ÷ sd**(같은 진폭에서 무늬가 고울수록 커진다). 둘이 **같은 방향**으로
//    움직여야 「주기가 줄었다」가 화면의 사실이다. ①만이면 「상수를 바꿨다」의 되풀이다.
//
// ── D-3 반증 조건 ──────────────────────────────────────────────────────────────
// `diag.grainPre40ForTest(true)`가 겹의 **길이·개수만** web2-34 값으로 되돌린다(굵기·
// 알파·색조는 지금 값 그대로 — 갈린 축이 하나다). 그 상태에서 이 팔의 게이트가
// **같은 실행에서 실제로 실패해야 한다**. 안 실패하면 이 팔은 아무것도 안 잰다(#69 ㉣).
//
// ── 바닥(지시문 ⚠) — **값이 있는 바닥이다** ───────────────────────────────────
// 26-2에서 결이 **안 보였던** 원인이 「주기가 기기 픽셀에 묶여 지각 문턱 아래」였다.
// 너무 곱게 만들면 그리로 되돌아간다. 그 «되돌아간 상태»를 **짐작하지 않고 같은 실행에서
// 잰다**: `diag.fiberLegacyForTest(true)`가 26-2 이전 규칙을 그대로 되살리고, 그 판의
// 반감 지연이 dpr1에서 **옐로 0.81 · 트레이싱 0.62 기기 px**다(원장 `legacy_floor`).
// 지금 판은 1.80 · 1.39다. `PERIOD_FLOOR_DEVICE_PX`는 그 **둘 사이**에 있다 —
// 「안 보이던 자리」보다 위이고 지금 자리보다 아래인 문이라, 굵기를 건드려 그리로
// 내려가는 순간 이 팔이 빨개진다.
//   ㉠ 반감 지연이 dpr1에서 `PERIOD_FLOOR_DEVICE_PX` 기기 픽셀 위 (여기)
//   ㉡ 진폭·dpr 불변 (grain26 — 이 회차가 그대로 다시 돌린다)
//
// ⚠ 조건(#71 ㉠): 이 파일은 dpr을 **스스로 만든다**(chromium.newContext).

import { test, expect, chromium, type Page, type Browser } from '@playwright/test'
import { settleSlide } from './slidesettle'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PERIOD_DROP_MAX, PERIOD_FLOOR_DEVICE_PX, NEIGHBOR_GAIN_MIN } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
function record(key: string, val: unknown) {
  const p = resolve(HERE, '../../stage0/out/paper_grain40_web2.json')
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-40 1번 — 겹(트레이싱지·옐로) 결의 공간 주기. grain40.spec이 시험마다 그 자리에서 쓴다(#71 ㉡). 판정은 spec의 expect가 정본.'
  cur.conditions = {
    viewport: '1200x800',
    dpr: '이 파일이 chromium.newContext로 1·2·3을 직접 만든다(프로젝트 dpr 무관)',
    command: 'LEDGER=1 npx playwright test e2e/grain40.spec.ts --project=dpr1 --workers=1',
    metric_period: '**상관 길이** = 섬유 타일 휘도의 순환 자기상관 r(k)의 Σ_{k≥1} max(r(k), 0) (기기 px) ÷ dpr → CSS px. 가로·세로 평균 곡선에서 재고 씨앗 여섯(101..106)의 중앙값을 쓴다. **이것이 이 팔의 «주기»다.**',
    metric_half_lag: '**반감 지연** = 같은 곡선이 r = 0.5를 처음 지나는 지연(선형 보간 · 기기 px). 섬유 «굵기»가 정하는 미세 구조이고 이 회차의 **바닥**이 여기 걸린다 — 줄면 안 된다.',
    metric_rejected: '⚠ **첫 판은 반감 지연을 «주기»로 썼고 그것이 틀렸다**(#92 · #87): 길이를 줄여도 굵기가 그대로면 r의 어깨가 안 움직여 그 값이 거의 안 변한다. 실측이 아래 `rejected_metric`에 있다 — 기각한 자와 채택한 자를 **같은 실행에서** 나란히 낸다.',
    metric_neighbor: '합성 화면 조각 (300,200) 60x60의 이웃 픽셀 절대차 평균 ÷ 그 조각의 sd — 같은 진폭에서 무늬가 고울수록 커진다(무차원).',
    falsify: 'diag.grainPre40ForTest(true) — 겹의 길이·개수만 web2-34 값으로. 굵기·알파·색조는 그대로라 갈린 축이 하나다.',
  }
  cur.flags_explained = {
    '상수·지표 정의 스냅샷 없음': 'web2 라인 전체의 유보다(e2e 하네스라 web/test의 공유 상수를 안 쓴다 — grain26·grain30이 같은 자리에 같은 유보를 적었다) — 대신 thresholds 블록을 산출물에 싣는다. 결 매개변수의 정본은 filmlayer.PAPER_STYLE·OVERLAY_FIBER_PRE40이고 그 값은 spec이 부르는 diag.fiberTile이 그대로 굽는다.',
  }
  cur[key] = val
  writeFileSync(p, JSON.stringify(cur, null, 2))
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 작도 두 획 — 겹을 얹을 수 있게 카메라를 닫는 일만 한다.
 *  ⚠ 시작점이 첫 획 **위**면 dpr3에서 web2-39의 누름 진입에 걸린다(grain26 머리 주석). */
async function closeCamera(page: Page) {
  const line = async (ax: number, ay: number, bx: number, by: number) => {
    await page.mouse.move(ax, ay)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
    await page.mouse.up()
    await settle(page)
  }
  await line(280, 560, 700, 560)
  await line(500, 620, 800, 500)
}

/** 타일 하나의 상관 길이(기기 px) — 페이지 안에서 돈다(타일이 거기 있다). */
const TILE_CSS_IN_PAGE = 128     // filmlayer.TILE_CSS — 페이지 안 함수가 dpr을 그것으로 되돌린다
const CORR_IN_PAGE = `(id, surface) => {
  const TILE_CSS_IN_PAGE = 128
  const t = window.__b2.diag.fiberTile(id, surface, true)
  const N = t.width
  const im = t.getContext('2d').getImageData(0, 0, N, N).data
  const L = new Float64Array(N * N)
  let m = 0
  for (let i = 0, j = 0; i < im.length; i += 4, j++) {
    L[j] = 0.299 * im[i] + 0.587 * im[i + 1] + 0.114 * im[i + 2]
    m += L[j]
  }
  m /= L.length
  let v = 0
  for (let j = 0; j < L.length; j++) { L[j] -= m; v += L[j] * L[j] }
  v /= L.length
  // 순환 자기상관 — 가로·세로. 지연은 절반까지면 충분하다(그 너머는 대칭).
  const half = Math.floor(N / 2)
  const rx = new Float64Array(half + 1)
  const ry = new Float64Array(half + 1)
  for (let k = 0; k <= half; k++) {
    let sx = 0, sy = 0
    for (let y = 0; y < N; y++) {
      const row = y * N
      for (let x = 0; x < N; x++) {
        sx += L[row + x] * L[row + ((x + k) % N)]
        sy += L[row + x] * L[(((y + k) % N) * N) + x]
      }
    }
    rx[k] = sx / (N * N * v)
    ry[k] = sy / (N * N * v)
  }
  // 가로·세로의 평균 곡선 하나에서 두 값을 낸다
  const r = []
  for (let k = 0; k <= half; k++) r.push((rx[k] + ry[k]) / 2)
  // ㉠ 상관 길이 — 꼬리를 다 더한다(음수는 0으로 자른다: 반상관은 «이어짐»이 아니다)
  let corr = 0
  for (let k = 1; k <= half; k++) corr += Math.max(0, r[k])
  // ㉡ 반감 지연 — r가 0.5를 처음 지나는 자리(선형 보간)
  let halfLag = half
  for (let k = 1; k <= half; k++) {
    if (r[k] <= 0.5) { halfLag = k - 1 + (r[k - 1] - 0.5) / (r[k - 1] - r[k]); break }
  }
  // ㉢ 꼬리의 한 점 — CSS 8 px에 해당하는 지연에서의 r. 「무늬가 얼마나 이어지는가」를
  //    한 수로 보여 준다(기각한 자와 채택한 자가 어디서 갈리는지가 여기서 보인다).
  const k8 = Math.max(1, Math.min(half, Math.round(8 * (N / TILE_CSS_IN_PAGE))))
  return { px: N, corr, halfLag, r8: r[k8], k8 }
}`

/** 합성 화면 조각 — 이웃차와 sd. 사람이 보는 자리(grain26의 patch와 같은 식·같은 자리). */
async function patch(page: Page, x = 300, y = 200, w = 60, h = 60) {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const L: number[] = []
    for (let i = 0; i < d.length; i += 4) L.push(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!)
    const m = L.reduce((a, b) => a + b, 0) / L.length
    const sd = Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length)
    let nd = 0, nn = 0
    for (let yy = 0; yy < c.height; yy++) {
      for (let xx = 1; xx < c.width; xx++) {
        nd += Math.abs(L[yy * c.width + xx]! - L[yy * c.width + xx - 1]!)
        nn++
      }
    }
    return { sd, neighbor: nd / nn }
  }, buf.toString('base64'))
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}

const SEEDS = [101, 102, 103, 104, 105, 106]

/** 재는 판 셋 — 지금 / pre-40(반증) / 26-2 이전 규칙(바닥의 값) */
type Variant = 'now' | 'pre40' | 'legacy' | number

/** 한 조건(dpr × 판)에서 겹 둘의 상관 길이·반감 지연.
 *  씨앗 여섯의 **중앙값**을 쓴다 — 평균은 한 씨앗의 극단에 끌린다(유효 자릿수 2자리
 *  규약과 같은 근거: CLAUDE.md §5 재현성). */
async function periods(browser: Browser, dpr: number, variant: Variant) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${process.env.PW_PORT ?? 5301}/`)
  await page.waitForFunction(() => (window as any).__b2)
  if (variant === 'pre40') await page.evaluate(() => (window as any).__b2.diag.grainPre40ForTest(true))
  if (variant === 'legacy') await page.evaluate(() => (window as any).__b2.diag.fiberLegacyForTest(true))
  if (typeof variant === 'number') await page.evaluate(k => (window as any).__b2.diag.grainLenKForTest(k), variant)
  type P = { cssPx: number; devicePx: number; halfLagDevicePx: number; r8: number; per: number[] }
  const out = {} as { yellow: P; tracing: P }
  for (const surface of ['yellow', 'tracing'] as const) {
    const corrs: number[] = []
    const halves: number[] = []
    const r8s: number[] = []
    for (const id of SEEDS) {
      const r = await page.evaluate(
        ([fn, i, s]) => (new Function('return ' + fn)())(i, s) as { px: number; corr: number; halfLag: number; r8: number },
        [CORR_IN_PAGE, id, surface] as [string, number, string],
      )
      corrs.push(r.corr)
      halves.push(r.halfLag)
      r8s.push(r.r8)
    }
    const devicePx = median(corrs)
    out[surface] = { cssPx: devicePx / dpr, devicePx, halfLagDevicePx: median(halves), r8: median(r8s), per: corrs }
  }
  await ctx.close()
  return out
}

/** dpr1 합성 화면 — 옐로 겹을 한 장 얹고 그 조각의 이웃차/sd */
async function screenGain(browser: Browser, pre40: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${process.env.PW_PORT ?? 5301}/`)
  await page.waitForFunction(() => (window as any).__b2)
  // 겹의 결만 본다 — 바탕 결은 끈다(grain26과 같은 근거·같은 손잡이)
  await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(false))
  if (pre40) await page.evaluate(() => (window as any).__b2.diag.grainPre40ForTest(true))
  await closeCamera(page)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]')
  await settleSlide(page)     // web2-40 2번 — 덜 온 종이를 재지 않는다(그 파일 머리주석)
  await settle(page)
  const p = await patch(page)
  await ctx.close()
  return { ...p, gain: p.neighbor / p.sd }
}

test('①② — 겹의 결 주기가 줄었고 바닥 위에 있다 (+반증: pre-40이면 깨진다)', async () => {
  const browser = await chromium.launch()
  const now: Record<number, Awaited<ReturnType<typeof periods>>> = {}
  const old: Record<number, Awaited<ReturnType<typeof periods>>> = {}
  for (const d of [1, 2, 3]) now[d] = await periods(browser, d, 'now')
  for (const d of [1, 2, 3]) old[d] = await periods(browser, d, 'pre40')
  const floor = await periods(browser, 1, 'legacy')   // 「안 보이던 자리」의 값(dpr1만)
  const gNow = await screenGain(browser, false)
  const gOld = await screenGain(browser, true)
  await browser.close()

  for (const d of [1, 2, 3]) {
    for (const s of ['yellow', 'tracing'] as const) {
      console.log(`[주기] dpr${d} ${s} — 지금 ${now[d]![s].cssPx.toFixed(3)} CSS px · pre-40 ${old[d]![s].cssPx.toFixed(3)} · 비 ${(now[d]![s].cssPx / old[d]![s].cssPx).toFixed(3)} / 반감 지연(기기px) 지금 ${now[d]![s].halfLagDevicePx.toFixed(3)}`)
    }
  }
  for (const s of ['yellow', 'tracing'] as const) {
    console.log(`[바닥·26-2 이전] ${s} — 상관 길이 ${floor[s].devicePx.toFixed(3)} · 반감 지연 ${floor[s].halfLagDevicePx.toFixed(3)} 기기px (dpr1)`)
  }
  console.log(`[화면] 이웃차/sd — 지금 ${gNow.gain.toFixed(4)} (이웃차 ${gNow.neighbor.toFixed(3)} · sd ${gNow.sd.toFixed(3)}) · pre-40 ${gOld.gain.toFixed(4)} (이웃차 ${gOld.neighbor.toFixed(3)} · sd ${gOld.sd.toFixed(3)})`)

  // ① **주기가 실제로 줄었다** — 세 dpr · 겹 둘 전부에서.
  for (const d of [1, 2, 3]) {
    for (const s of ['yellow', 'tracing'] as const) {
      const r = now[d]![s].cssPx / old[d]![s].cssPx
      expect(r, `dpr${d} ${s} 주기 비 ${r.toFixed(3)}`).toBeLessThan(PERIOD_DROP_MAX)
    }
  }

  // ①′ **화면에서도 갈린다**(#92 — 이름표가 아니라 결과의 자리): 같은 sd 대역에서
  //     이웃차가 커져야 「고와졌다」가 사람이 보는 판의 사실이다.
  expect(gNow.gain / gOld.gain, `이웃차/sd 증가율 ${(gNow.gain / gOld.gain).toFixed(3)}`)
    .toBeGreaterThan(NEIGHBOR_GAIN_MIN)

  // ② **바닥**(지시문 ⚠ · 26-2로 되돌아가지 않는다) — dpr1에서 **반감 지연**(미세 구조)이
  //    기기 픽셀 대역 위에 있다. 여기가 무너지면 결이 안티에일리어싱에 먹힌다.
  for (const s of ['yellow', 'tracing'] as const) {
    expect(now[1]![s].halfLagDevicePx, `dpr1 ${s} 반감 지연(기기 px)`).toBeGreaterThan(PERIOD_FLOOR_DEVICE_PX)
  }
  // ②-반증(D-3) — 그 문이 **실제로 걸리는 자리가 있다**: 26-2 이전 규칙은 문 아래다.
  //    이 단언이 없으면 ②는 실패 불가능한 격자다(#69 ㉣).
  for (const s of ['yellow', 'tracing'] as const) {
    expect(floor[s].halfLagDevicePx, `26-2 이전 ${s} 반감 지연은 문 아래여야 한다`).toBeLessThan(PERIOD_FLOOR_DEVICE_PX)
  }

  // ②′ **주기는 CSS px 기준이다**(26-2가 세운 규칙) — dpr을 바꿔도 물리 크기가 같다.
  //     기기 px가 아니라 CSS px가 dpr 사이에서 붙어 있어야 한다.
  for (const s of ['yellow', 'tracing'] as const) {
    const r = now[3]![s].cssPx / now[1]![s].cssPx
    expect(r, `dpr3/dpr1 ${s} 주기 비(CSS px) ${r.toFixed(3)}`).toBeGreaterThan(0.85)
    expect(r, `dpr3/dpr1 ${s} 주기 비(CSS px) ${r.toFixed(3)}`).toBeLessThan(1.15)
  }

  record('gate', {
    thresholds: {
      PERIOD_DROP_MAX, PERIOD_FLOOR_DEVICE_PX, NEIGHBOR_GAIN_MIN,
      // 표에만 있고 원장에 없던 문(#47 · 1차 리뷰어 [15]) — 이제 팔이 스스로 쓴다
      CSS_INVARIANCE_BAND: [0.85, 1.15],
    },
    css_invariance_dpr3_over_dpr1: {
      yellow: now[3]!.yellow.cssPx / now[1]!.yellow.cssPx,
      tracing: now[3]!.tracing.cssPx / now[1]!.tracing.cssPx,
    },
    // ⚠ **기각한 자를 같은 실행에서 나란히 낸다**(#25 — 원장 밖 측정 ⛔ · 1차 리뷰어 [2]).
    //   「길이를 줄였는데 이 값이 거의 안 움직인다」가 이 회차가 자를 갈아 끼운 근거다.
    rejected_metric: {
      what: '반감 지연(r = 0.5) — 첫 판이 «주기»로 쓴 자. 굵기가 정하므로 이 회차가 안 건드린 축이다.',
      dpr1: {
        yellow: { now: now[1]!.yellow.halfLagDevicePx, pre40: old[1]!.yellow.halfLagDevicePx, ratio: now[1]!.yellow.halfLagDevicePx / old[1]!.yellow.halfLagDevicePx },
        tracing: { now: now[1]!.tracing.halfLagDevicePx, pre40: old[1]!.tracing.halfLagDevicePx, ratio: now[1]!.tracing.halfLagDevicePx / old[1]!.tracing.halfLagDevicePx },
      },
      tail_r_at_css_lag_8: {
        yellow: { now: now[1]!.yellow.r8, pre40: old[1]!.yellow.r8 },
        tracing: { now: now[1]!.tracing.r8, pre40: old[1]!.tracing.r8 },
      },
      note: '반감 지연의 비는 1에 가깝고(안 건드린 축) 꼬리(r at CSS lag 8)는 절반 대역으로 준다 — 그 둘의 차이가 «무늬의 크기는 꼬리에 있다»의 값이다.',
    },
    period_css: Object.fromEntries([1, 2, 3].map(d => [`dpr${d}`, {
      yellow: { now: now[d]!.yellow.cssPx, pre40: old[d]!.yellow.cssPx, ratio: now[d]!.yellow.cssPx / old[d]!.yellow.cssPx },
      tracing: { now: now[d]!.tracing.cssPx, pre40: old[d]!.tracing.cssPx, ratio: now[d]!.tracing.cssPx / old[d]!.tracing.cssPx },
    }])),
    half_lag_device_px_dpr1: { yellow: now[1]!.yellow.halfLagDevicePx, tracing: now[1]!.tracing.halfLagDevicePx },
    legacy_floor: {
      what: '26-2 이전 규칙(diag.fiberLegacyForTest) — 사람이 「결이 안 보인다」고 한 그 상태. 바닥 문(PERIOD_FLOOR_DEVICE_PX)이 이 값과 지금 값 사이에 있다.',
      dpr1: {
        yellow: { corr_device_px: floor.yellow.devicePx, half_lag_device_px: floor.yellow.halfLagDevicePx },
        tracing: { corr_device_px: floor.tracing.devicePx, half_lag_device_px: floor.tracing.halfLagDevicePx },
      },
    },
    per_seed_corr_dpr1: { yellow: now[1]!.yellow.per, tracing: now[1]!.tracing.per },
    screen_dpr1: { now: gNow, pre40: gOld, gain_ratio: gNow.gain / gOld.gain },
    // #35 — **무엇이 이 기준을 넘을 수 있는가**. 답은 반증 손잡이가 매 실행 낸다:
    // pre-40 주기를 되살리면 ①과 ①′이 둘 다 게이트 밖이다.
    reachability: {
      how: 'diag.grainPre40ForTest(true) — 겹의 섬유 길이·개수만 web2-34 값(옐로 420·8~22 / 트레이싱 560·3.5~10)으로',
      period_ratio_gate_is_lt: PERIOD_DROP_MAX,
      neighbor_gain_gate_is_gt: NEIGHBOR_GAIN_MIN,
      note: 'pre-40을 양쪽에 켜면 두 비가 항등(1)이 되어 게이트가 다 실패한다 — 통과할 수도 실패할 수도 있는 팔이다(#69 ㉣). ⚠ 그 «1»은 측정이 아니라 항등이므로 값으로 안 적는다(#40) — 값 자리에는 반증 판이 실제로 낸 주기를 적는다(아래 period_pre40_dpr1).',
      // 값 대조용(#40) — **반증 판이 실제로 낸 주기**(dpr1 · CSS px). 「1.0」 같은 항등이
      // 아니라 같은 실행에서 나온 수다: 이 두 수가 문 밖이고 지금 판이 문 안이다.
      period_pre40_dpr1: [old[1]!.yellow.cssPx, old[1]!.tracing.cssPx],
    },
    reachability_value: [old[1]!.yellow.cssPx, old[1]!.tracing.cssPx],
    reachability_source: 'gate/reachability/period_pre40_dpr1',
    note: '실기기 눈 확인(「곱다/굵다」는 사람 눈이 판정한다 — 지시 게이트 넷째)은 헤드리스가 못 잰다. DEVICE-CHECK G4가 그 자리다.',
  })
})


/** **K 훑기**(#12 — 동작점 하나로 안 정한다 · 1차 리뷰어 [4][5]).
 *
 *  「K = 0.5가 더 못 내리는 자리인가」를 **값으로** 답한다. 두 자를 K마다 낸다:
 *    · 상관 길이(주기) ..... K를 내리면 줄어야 한다(내리는 쪽의 이득)
 *    · 반감 지연(바닥) ..... K로는 거의 안 움직인다는 것을 **보이는 것**이 목적이다
 *      → 그러면 「이 문이 지키는 축은 굵기뿐이고 K는 안 지킨다」가 짐작이 아니라 실측이다.
 *  ⚠ 진폭·dpr 비 쪽 훑기는 `grain26.spec`이 진다(그 게이트의 주인이 거기다).
 */
test('①-훑기 — K를 갈아 끼우며 주기와 바닥이 어떻게 움직이는가 (동작점 하나로 안 정한다)', async () => {
  const browser = await chromium.launch()
  const KS = [1.0, 0.7, 0.5, 0.35, 0.2]
  const rows: { k: number; yellow: { corr: number; half: number }; tracing: { corr: number; half: number } }[] = []
  for (const k of KS) {
    const p = await periods(browser, 1, k)
    rows.push({
      k,
      yellow: { corr: p.yellow.cssPx, half: p.yellow.halfLagDevicePx },
      tracing: { corr: p.tracing.cssPx, half: p.tracing.halfLagDevicePx },
    })
  }
  await browser.close()
  for (const r of rows) {
    console.log(`[K 훑기] K=${r.k.toFixed(2)} — 옐로 주기 ${r.yellow.corr.toFixed(3)} / 반감 ${r.yellow.half.toFixed(3)} · 트레이싱 주기 ${r.tracing.corr.toFixed(3)} / 반감 ${r.tracing.half.toFixed(3)}`)
  }
  const first = rows[0]!, last = rows[rows.length - 1]!
  // ① 주기는 K를 따라 **단조로 준다** — 이 자가 K에 반응한다는 값
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i]!.yellow.corr, `K=${rows[i]!.k} 옐로 주기가 K=${rows[i - 1]!.k}보다 작다`).toBeLessThan(rows[i - 1]!.yellow.corr)
  }
  // ② **반감 지연은 K로 거의 안 움직인다** — 「바닥 문이 지키는 축은 굵기뿐」의 값이다.
  //    K를 5배 내려도(1.0 → 0.2) 반감 지연의 변화가 주기의 변화보다 훨씬 작다.
  const dCorr = (first.yellow.corr - last.yellow.corr) / first.yellow.corr
  const dHalf = (first.yellow.half - last.yellow.half) / first.yellow.half
  console.log(`[K 훑기] K 1.0 → 0.2에서 옐로 — 주기 −${(dCorr * 100).toFixed(1)}% · 반감 지연 −${(dHalf * 100).toFixed(1)}%`)
  expect(dCorr, 'K는 주기를 크게 움직인다').toBeGreaterThan(0.3)
  expect(dHalf, 'K는 바닥(반감 지연)을 거의 안 움직인다 — 그 문이 지키는 축은 굵기다').toBeLessThan(dCorr / 2)

  record('k_sweep', {
    what: 'K(섬유 길이 배수)를 갈아 끼우며 dpr1에서 두 자를 낸다 — 주기(상관 길이 · CSS px)와 바닥(반감 지연 · 기기 px).',
    rows,
    shipped_k: 0.5,
    yellow_change_1_0_to_0_2: { period: -dCorr, half_lag: -dHalf },
    floor_touch: {
      what: '반감 지연이 문(PERIOD_FLOOR_DEVICE_PX = 1.2)에 닿는 K — 훑은 칸 안에서.',
      tracing_half_lag_by_k: rows.map(r => ({ k: r.k, half: r.tracing.half })),
      yellow_half_lag_by_k: rows.map(r => ({ k: r.k, half: r.yellow.half })),
    },
    conclusion: `주기는 K를 따라 단조로 줄고(${KS[0]} → ${KS[KS.length - 1]}에서 **${(-dCorr * 100).toFixed(1)}%**) 반감 지연은 훨씬 덜 움직인다(**${(-dHalf * 100).toFixed(1)}%**). `
      + `⚠ 그래도 **끝에서는 문을 밑돈다** — K = ${last.k}에서 트레이싱의 반감 지연이 ${last.tracing.half.toFixed(5)}로 문(1.2)의 **아래**다(게이트는 «> 1.2»). `
      + `즉 이 바닥이 정하는 K의 하한은 ${last.k}와 ${rows[rows.length - 2]!.k} **사이**이고, ${last.k}은 이미 깨진 칸이다. `
      + `⚠⚠ **grain26의 dpr 비 쪽은 훑은 대역(0.35까지)에서 문에 안 닿는다** — 그쪽 k_sweep이 정본이다. `
      + `그러므로 「K = 0.5가 게이트에 막힌 값」이라는 읽기는 **틀렸고**, 0.5는 **눈이 고른 값**이다(지시 게이트 넷째).`,    reachability: {
      how: 'diag.grainLenKForTest(k) — 제품과 **같은 유도식**(fineFiberK)으로 길이·개수를 다시 낸다. 갈린 축은 여전히 길이 하나다.',
      k_span: [KS[0], KS[KS.length - 1]],
    },
    reachability_value: rows.map(r => r.yellow.corr),
    reachability_source: 'k_sweep/yellow_corr_by_k',
    yellow_corr_by_k: rows.map(r => r.yellow.corr),
  })
})
