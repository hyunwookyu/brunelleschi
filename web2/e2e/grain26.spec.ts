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

import { test, expect, chromium, type Page, type Browser } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
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
    'bare_sd가 near-zero(1e-11 대역)': '**측정이다** — 획도 겹도 없는 종이 조각은 dpr2·3에서 실제로 한 색이다(dpr1만 0.162 — 그 차의 근거는 안티에일리어싱). 이 값은 임계가 아니라 «그 실행의 바닥»으로만 쓰이고, 빼는 산술이 sqrt(신호²−바닥²)라 0이어도 안전하다.',
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
  await drawLine(page, 500, 560, 800, 480)
  await page.click('#layer-add')
  await page.click('#layer-pop .lpick[data-paper="yellow"]')
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
    },
    hashes: h,
    note: '실기기 눈 확인(게이트 셋째)은 헤드리스가 못 잰다 — DEVICE-CHECK G3이 그 자리다.',
  })
})
