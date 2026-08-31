// web2-26 2번 — **종이 결이 보이지 않는다**의 게이트.
//
// D-1(고치기 전에 표식): 갈래 셋을 **먼저 갈랐다** — ㉠ 안 그려진다 / ㉡ 합성에서 죽는다 /
//   ㉢ 진폭·주기가 지각 문턱 아래. 타일 캔버스를 직접 읽고(㉠) 합성 스크린샷을 읽어(㉡)
//   dpr 1·2·3에서 나란히 냈다. 답은 **㉢**이었고, 덤으로 dpr 비 10.2가 나왔다
//   (수리 전 결 진폭: dpr1 0.134 · dpr2 0.765 · dpr3 1.361 — 255계조 중 한 계조 남짓).
//
// D-3(반증 조건): `diag.fiberLegacyForTest(true)`가 결을 **dpr에 도로 묶는다**.
//   그 상태에서 dpr 비 게이트와 진폭 게이트가 **같은 실행에서 실제로 실패하는 것**을 본다.
//   반증이 안 서면 이 팔은 아무것도 안 잰다(#69 ㉣).
//
// ⚠ 조건(#71 ㉠): 이 파일은 dpr을 **스스로 만든다**(chromium.newContext) — playwright
//   프로젝트의 dpr과 무관하게 1·2·3을 같은 실행에서 낸다.

// ⚠⚠ **작도 픽스처가 web2-40에서 (500,560) → (500,620)로 옮겨졌다**(값이 아니라 **자리**다).
//    증상: **dpr3에서만** 두 번째 획이 통째로 사라지고(`doc.strokes` 1개) `#layer-add`가
//    「소실점 작도가 끝나야 얹을 수 있다」로 남아 `page.click`이 멎었다. 표식을 심어 보니
//    화면 알림이 **「글씨 — 이 선의 치수를 쓴다」**였다(D-1: 후보부터 보지 않고 경로에
//    표식을 심었다). 원인은 **web2-39의 누름 진입**이다: 두 번째 획의 시작점이 첫 획
//    **위**(y=560)라 `writeTargetAt`이 그것을 잡는데, dpr3에서는 3600×2400 캔버스라
//    `mouse.down` 다음 첫 `mouse.move`가 오기까지 **337 ms**가 걸려 `writeHoldMs`(450)의
//    문턱에 붙는다. 느린 기기에서 «누르고 끄는» 것이 실제로 그렇게 보인다 —
//    **제품 결함이 아니라 픽스처가 그 진입을 밟고 있던 것**이고, 시작점을 선에서
//    60 px(잡히는 반경 `DIM_LABEL_HIT_PX`/`osnap.radius*2` ≈ 16 px의 네 배) 떼면 사라진다.
//    ⚠ 재는 조각은 (300,200) 60×60이고 두 획은 y ≥ 480이라 **측정값에는 안 닿는다** —
//    이 두 획의 일은 「카메라를 닫아 겹을 얹을 수 있게 한다」 하나다.

import { test, expect, chromium, type Page, type Browser } from '@playwright/test'
import { settleSlide } from './slidesettle'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
function record(key: string, val: unknown) {
  const p = resolve(HERE, '../../stage0/out/paper_grain26_web2.json')
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-26 2번 — 종이 결의 지각 진폭과 dpr 불변성. grain26.spec이 시험마다 그 자리에서 쓴다(#71 ㉡ — afterAll은 실패 시 통째로 빈다). 판정은 spec의 expect가 정본.'
  cur.conditions = {
    viewport: '1200x800',
    dpr: '이 파일이 chromium.newContext로 1·2·3을 직접 만든다(프로젝트 dpr 무관)',
    command: 'npx playwright test e2e/grain26.spec.ts --project=dpr1 --workers=1',
    patch: '(300,200) 60x60 CSS px — 획이 없는 빈 자리',
    metric: '휘도 L=0.299R+0.587G+0.114B의 픽셀 표준편차(기기 픽셀 격자). 결의 몫 = sqrt(막sd^2 − 바닥sd^2) — 독립 성분이라 분산이 더해진다(#74 ㉡: 절대 임계 대신 그 실행의 바닥값. 다만 빼는 방법은 제곱)',
  }
  cur.flags_explained = {
    'bare_sd가 near-zero(1e-11 대역)': '**측정이다** — 획도 겹도 없는 종이 조각은 세 dpr 모두에서 한 색이다. 이 값은 임계가 아니라 «그 실행의 바닥»으로만 쓰이고, 빼는 산술이 sqrt(신호²−바닥²)라 0이어도 안전하다. ⚠ **web2-26 당시에는 dpr1만 0.162였고 지금은 셋 다 1e-11 대역이다**(web2-40 1차 리뷰어 [9]가 이 문장이 자기 수치와 어긋난 것을 잡았다). 그 사이 무엇이 바닥을 내렸는지는 **안 쟀다** — 이 값이 판정에 안 쓰이므로(빼는 산술이 0에서 안전하다) 유보로 둔다.',
    '상수·지표 정의 스냅샷 없음': 'web2 라인 전체의 유보다(e2e 하네스라 web/test의 공유 상수를 안 쓴다) — 대신 constants 블록을 손으로 적는다. 이 원장의 상수는 filmlayer.PAPER_STYLE·TILE_CSS이고 그 값은 spec이 직접 굽는 타일에서 나온다.',
  }
  cur[key] = val
  writeFileSync(p, JSON.stringify(cur, null, 2))
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 합성 화면 조각의 휘도 통계 — 사람이 보는 자리 */
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
    return { mean: m, sd, neighbor: nd / nn, px: c.width }
  }, buf.toString('base64'))
}

/** 한 dpr에서: 타일 sd → 맨바닥 sd → 옐로 막 sd. legacy면 옛(dpr에 묶인) 규칙으로. */
async function measure(browser: Browser, dpr: number, legacy: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5301/')
  await page.waitForFunction(() => (window as any).__b2)
  // ⚠⚠ **web2-30 9번이 바탕 종이에도 결을 줬다** — 이 팔이 재는 것은 «겹의 결»이므로
  //    바탕 결을 **끄고** 잰다(평평한 종이 위). 안 끄면 바닥(`bare`)에도 결이 실려
  //    `sqrt(막²−바닥²)`이 겹의 몫이 아니라 «두 결의 곱의 나머지»가 되고, 26-2가 세운
  //    수치의 뜻이 갈린다(#76 ㉣ — 질감의 세기를 바꾸면 «신호 대 배경»을 쓰는 팔의
  //    기준이 전부 같이 바뀐다). 30-9의 팔이 바탕 결을 따로 잰다.
  await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(false))
  if (legacy) await page.evaluate(() => (window as any).__b2.diag.fiberLegacyForTest(true))
  const tile = await page.evaluate(() => {
    const t = (window as any).__b2.diag.fiberTile(101, 'yellow', true) as HTMLCanvasElement
    const im = t.getContext('2d')!.getImageData(0, 0, t.width, t.height).data
    const L: number[] = []
    for (let i = 0; i < im.length; i += 4) L.push(0.299 * im[i]! + 0.587 * im[i + 1]! + 0.114 * im[i + 2]!)
    const m = L.reduce((a, b) => a + b, 0) / L.length
    return { px: t.width, mean: m, sd: Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length) }
  })
  const bare = await patch(page)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 620, 800, 500)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]')
  await settleSlide(page)     // web2-40 2번 — 덜 온 종이를 재지 않는다(그 파일 머리주석)
  await settle(page)
  const film = await patch(page)
  await ctx.close()
  // **결의 몫 = 막 sd에서 바닥 sd를 «제곱으로» 뺀 것.** 절대 임계 대신 그 실행의 바닥값을
  // 쓰는 것은 #74 ㉡ 그대로인데, **빼는 방법**은 뺄셈이 아니라 제곱근이다: 결과 바닥은
  // 독립이므로 **분산이 더해진다**(sd가 아니라). 뺄셈으로 하면 바닥이 큰 조건(dpr1 —
  // 실측 0.162)만 부당하게 깎여 dpr 비가 그만큼 부풀었다(1.155 ↔ 1.108).
  const grain = Math.sqrt(Math.max(0, film.sd * film.sd - bare.sd * bare.sd))
  return { dpr, legacy, tile, bare, film, grain }
}

test('①②③ — 결이 지각 대역에 있고 dpr에 안 묶인다 (+반증: 옛 규칙이면 깨진다)', async () => {
  const browser = await chromium.launch()
  const cur: Awaited<ReturnType<typeof measure>>[] = []
  for (const d of [1, 2, 3]) cur.push(await measure(browser, d, false))
  const leg: Awaited<ReturnType<typeof measure>>[] = []
  for (const d of [1, 3]) leg.push(await measure(browser, d, true))
  const h = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })
    const p2 = await ctx.newPage()
    await p2.goto('http://localhost:5301/')
    await p2.waitForFunction(() => (window as any).__b2)
    const out = await p2.evaluate(() => {
      const d = (window as any).__b2.diag
      return {
        a: d.fiberTileHash(101, 'yellow'),
        b: d.fiberTileHash(102, 'yellow'),
        again: d.fiberTileHash(101, 'yellow'),
        tr: d.fiberTileHash(101, 'tracing'),
      }
    })
    await ctx.close()
    return out
  })()
  await browser.close()

  for (const r of cur) {
    console.log(`[결] dpr${r.dpr} 타일 ${r.tile.px}px sd ${r.tile.sd.toFixed(3)} · 막 sd ${r.film.sd.toFixed(3)} · 바닥 ${r.bare.sd.toFixed(3)} · 결 ${r.grain.toFixed(3)} · 이웃차 ${r.film.neighbor.toFixed(3)}`)
  }
  for (const r of leg) console.log(`[반증·옛규칙] dpr${r.dpr} 결 ${r.grain.toFixed(3)}`)

  const g1 = cur.find(r => r.dpr === 1)!
  const g3 = cur.find(r => r.dpr === 3)!
  const ratio = g3.grain / g1.grain
  const l1 = leg.find(r => r.dpr === 1)!
  const l3 = leg.find(r => r.dpr === 3)!
  const legacyRatio = l3.grain / l1.grain

  // ① **dpr 불변** — 지시 게이트: 둘의 비가 1.0 ± 0.15
  expect(ratio, `dpr3/dpr1 결 비 ${ratio.toFixed(3)}`).toBeGreaterThan(0.85)
  expect(ratio, `dpr3/dpr1 결 비 ${ratio.toFixed(3)}`).toBeLessThan(1.15)

  // ①-반증(D-3) — 옛 규칙에서는 **같은 게이트가 실제로 실패한다**. 이 단언이 없으면
  // ①은 무엇을 재는지 모르는 팔이다(#69 ㉣ — 격자가 실패 불가).
  expect(legacyRatio, `옛 규칙의 비 ${legacyRatio.toFixed(2)}는 게이트 밖이어야 한다`).toBeGreaterThan(1.15)

  // ② **지각 대역** — 문턱의 근거는 웨버 1%다: 이 자리 배경 휘도 ≈ 212이므로 1% ≈ 2.1계조.
  //   결은 면이 아니라 무늬라 sd가 그 대역이면 이웃 픽셀 차이로 읽힌다.
  //   옛 값은 0.13~1.36으로 **전부 그 아래**였다(그래서 「안 보인다」였다).
  for (const r of cur) {
    expect(r.grain, `dpr${r.dpr} 결 진폭`).toBeGreaterThan(2.1)
    expect(r.film.neighbor, `dpr${r.dpr} 이웃차`).toBeGreaterThan(0.5)   // 균일한 회색이 아니다
  }
  // ②-반증 — 옛 규칙은 그 문턱을 못 넘는다(같은 실행에서 확인)
  expect(l1.grain, '옛 규칙 dpr1 진폭').toBeLessThan(2.1)

  // ③ **층별 씨앗의 무작위성 유지**(web2-20 — 롤을 다시 꺼내면 무늬가 달라야 한다).
  //   ⚠ 분해능 단언(#71 ㉢)이 짝이다: 같은 id는 **같아야** 한다. 안 그러면
  //   「해시가 무엇이든 다르다」는 실패 불가능한 격자다.
  expect(h.a).not.toBe(h.b)
  expect(h.a).toBe(h.again)
  expect(h.a).not.toBe(h.tr)

  record('gate', {
    current: cur.map(r => ({
      dpr: r.dpr, tile_px: r.tile.px, tile_sd: r.tile.sd, bare_sd: r.bare.sd,
      film_sd: r.film.sd, film_mean: r.film.mean, grain_sd: r.grain, neighbor: r.film.neighbor,
    })),
    legacy: leg.map(r => ({ dpr: r.dpr, grain_sd: r.grain })),
    ratio_dpr3_over_dpr1: ratio,
    legacy_ratio_dpr3_over_dpr1: legacyRatio,
    weber_floor_levels: 2.1,
    // #35 — **무엇이 이 기준을 넘을 수 있는가**. 답은 반증 손잡이가 매 실행 낸다:
    // 옛 규칙(결을 dpr에 도로 묶기)이 dpr 비를 게이트 밖으로, 진폭을 문턱 아래로 보낸다.
    reachability: {
      how: 'diag.fiberLegacyForTest(true) — 타일 256 device px 고정 + 섬유 배율 dpr/2 + 패턴 배율 0.5·s·dpr',
      ratio_gate_is_1_0_pm_0_15: { current: ratio, legacy: legacyRatio },
      amplitude_gate_is_gt_2_1: { current_dpr1: g1.grain, legacy_dpr1: l1.grain },
      note: '둘 다 legacy에서 실제로 게이트 밖이다 — 이 게이트는 통과할 수도 실패할 수도 있다(#69 ㉣).',
      // 값 대조용(#40 · web2-40 1차 리뷰어 [13]) — 산문뿐이던 자리를 값으로 채운다.
      legacy_probe: [l1.grain, legacyRatio],
    },
    reachability_value: [l1.grain, legacyRatio],
    reachability_source: 'gate/reachability/legacy_probe',
    hashes: h,
    note: '실기기 눈 확인(게이트 셋째)은 헤드리스가 못 잰다 — DEVICE-CHECK G3이 그 자리다.',
  })
})


/** **K 훑기 — dpr 비가 어디서 문에 닿는가**(web2-40 · #12 · #14 · 1차 리뷰어 [3][4]).
 *
 *  web2-40 1번이 「K를 더 못 내린다 — dpr 비 여유가 1.2%뿐」이라고 적었는데, 그 주장이
 *  선 근거는 **동작점 둘**(제품 K=0.5의 1.136과 다른 실행의 1.107)이었고 **기준선이 원장
 *  밖**이었다. 여기서 셋을 고친다:
 *    ㉠ 기준선(K = 1.0 = web2-34까지의 길이)을 **같은 실행에서** 낸다
 *    ㉡ K를 여럿 갈아 끼워 **비가 K를 따라 오르는 것**을 값으로 본다
 *    ㉢ 같은 K를 **두 번** 재서 실행 간 폭을 낸다 — 「여유가 폭 밖인가」(#14)를 답할 수 있게
 *
 *  ⚠ 재는 것은 이 파일의 `measure`와 **같은 자·같은 자리**다(옐로 막 조각의 결 sd).
 */
test('①-훑기 — K에 따라 dpr3/dpr1 결 비가 어디서 문(1.15)에 닿는가 (+같은 K 두 번)', async () => {
  test.setTimeout(900_000)
  const browser = await chromium.launch()
  const at = async (dpr: number, k: number | null) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr })
    const page = await ctx.newPage()
    await page.goto('http://localhost:5301/')
    await page.waitForFunction(() => (window as any).__b2)
    await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(false))
    if (k !== null) await page.evaluate(kk => (window as any).__b2.diag.grainLenKForTest(kk), k)
    const bare = await patch(page)
    await drawLine(page, 280, 560, 700, 560)
    await drawLine(page, 500, 620, 800, 500)
    await page.click('#layer-add')
    await page.click('#layer-pop .lpick[data-paper="yellow"]')
    await settleSlide(page)
    await settle(page)
    const film = await patch(page)
    await ctx.close()
    return Math.sqrt(Math.max(0, film.sd * film.sd - bare.sd * bare.sd))
  }
  const KS = [1.0, 0.7, 0.5, 0.35]
  const rows: { k: number; d1: number; d3: number; ratio: number }[] = []
  for (const k of KS) {
    const d1 = await at(1, k)
    const d3 = await at(3, k)
    rows.push({ k, d1, d3, ratio: d3 / d1 })
  }
  // ㉢ 같은 K를 한 번 더 — 실행 간 폭(#14). 제품 값에서 잰다.
  const rep1 = await at(1, 0.5)
  const rep3 = await at(3, 0.5)
  await browser.close()
  const repRatio = rep3 / rep1
  const shipped = rows.find(r => r.k === 0.5)!
  const spread = Math.abs(repRatio - shipped.ratio)

  for (const r of rows) console.log(`[K 훑기·dpr 비] K=${r.k.toFixed(2)} — dpr1 ${r.d1.toFixed(3)} · dpr3 ${r.d3.toFixed(3)} · 비 ${r.ratio.toFixed(4)}`)
  console.log(`[K 훑기·dpr 비] 같은 K=0.5 두 번 — ${shipped.ratio.toFixed(4)} ↔ ${repRatio.toFixed(4)} · 폭 ${spread.toFixed(4)} / 문까지 여유 ${(1.15 - shipped.ratio).toFixed(4)}`)

  // ① 비가 K를 따라 **오른다** — 이 자가 K에 반응한다(짐작이 아니다)
  expect(rows[0]!.ratio, 'K=1.0(옛 길이)의 비가 제품 K보다 낮다').toBeLessThan(shipped.ratio)
  // ② 제품 값은 문 안이다
  expect(shipped.ratio, `K=0.5 비 ${shipped.ratio.toFixed(4)}`).toBeLessThan(1.15)
  // ③ 같은 K 두 번의 폭이 문까지의 여유보다 **작다** — 여유가 폭 밖이라는 진술의 근거(#14).
  //    ⚠ 폭이 여유보다 크면 이 단언이 빨개지고, 그때는 「여유 1.2%」를 쓸 수 없다.
  expect(spread, `같은 K 두 번의 폭 ${spread.toFixed(4)} < 문까지 여유 ${(1.15 - shipped.ratio).toFixed(4)}`)
    .toBeLessThan(1.15 - shipped.ratio)

  record('k_sweep', {
    what: 'K(섬유 길이 배수)에 따른 dpr3/dpr1 결 비 — 26-2의 게이트가 K에 어떻게 반응하는가. 재는 자와 자리는 이 파일의 measure와 같다(옐로 막 조각).',
    gate_band: [0.85, 1.15],
    rows,
    shipped_k: 0.5,
    repeat_at_shipped_k: { ratio: repRatio, dpr1: rep1, dpr3: rep3 },
    run_to_run_spread_at_shipped_k: spread,
    headroom_to_gate: 1.15 - shipped.ratio,
    conclusion: 'K를 내릴수록 비가 오른다 — 짧은 섬유일수록 dpr1에서 안티에일리어싱이 먹는 몫이 상대적으로 커진다. 그러므로 「더 곱게」의 실질 상한을 정하는 것은 grain40의 바닥(반감 지연)이 아니라 **이 문**이다.',
    reachability: {
      how: 'diag.grainLenKForTest(k) — 제품과 같은 유도식으로 길이·개수를 다시 낸다. K = 1.0이 web2-34까지의 값이므로 **기준선이 같은 실행 안에 있다**(원장 밖 인용 ⛔ · #25).',
      ratio_by_k: rows.map(r => r.ratio),
    },
    reachability_value: rows.map(r => r.ratio),
    reachability_source: 'k_sweep/reachability/ratio_by_k',
  })
})
