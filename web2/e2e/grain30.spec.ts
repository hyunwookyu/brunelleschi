// web2-30 9번 — **종이만 결이 안 보인다**의 게이트.
//
// D-1(표식 먼저 · 후보부터 보지 않는다): 사람이 준 후보는 「종이를 #film에 안 태웠다」였다.
//   그 후보를 **고치기 전에** 셋(종이·트레이싱지·옐로)의 결 진폭을 나란히 재서 «어디서
//   갈리는지»를 냈다. 수리 전 실측은 종이 **0.000**(결이 아예 없다)이었고, 그것이
//   web2-20 3부의 결정(「바탕 종이에는 결이 없다 — 겹 둘에만」)과 정확히 일치했다:
//   결함이 아니라 **차등 자체가 사람의 눈에 결함으로 읽힌 것**이다.
// D-4(사람이 준 근거는 확인 대상이다): 후보의 **진단은 맞고 처방은 틀리다** — #film의 일은
//   «아래에 있는 것에 곱하기»라 아래 겹을 사본으로 재조립해야 하는데(#73 ㉠) 바탕 종이
//   아래에는 아무것도 없고, #film은 `atSheetPose`·«겹이 있는가»에 걸려 있는데 바탕 종이는
//   언제나 있다. 그래서 **같은 함수가 구운 타일**을 맨 아래 판(#paperfilm)에 깐다.
// D-3(반증): 결을 끄면(`diag.paperFiberForTest(false)`) 종이의 진폭이 **0으로 떨어지고**
//   같은 게이트가 그 실행에서 실패한다.

import { test, expect, chromium, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
function record(key: string, val: unknown) {
  const p = resolve(HERE, '../../stage0/out/paper_grain30_web2.json')
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-30 9번 — 종이·트레이싱지·옐로 셋의 결 진폭. 판정은 spec의 expect가 정본.'
  cur.flags_explained = {
    'bare가 near-zero(1e-11 대역)': '**측정이다** — 결을 끈 종이 조각은 dpr1에서도 한 색이다(web2-30 9번 전까지 바탕 종이가 그랬다). 이 값은 임계가 아니라 «그 실행의 바닥»으로만 쓰이고, 빼는 산술이 sqrt(신호²−바닥²)라 0이어도 안전하다(web2-26 2번의 같은 플래그와 같은 자리).',
    '상수·지표 정의 스냅샷 없음': 'web2 라인 전체의 유보다(e2e 하네스라 web/test의 공유 상수를 안 쓴다). 이 원장의 상수는 filmlayer.PAPER_STYLE·TILE_CSS이고 그 값은 spec이 화면에서 읽는다.',
  }
  cur.conditions = {
    viewport: '1200x800',
    dpr: '이 파일이 chromium.newContext로 1·2를 직접 만든다(프로젝트 dpr 무관)',
    command: 'npx playwright test e2e/grain30.spec.ts --project=dpr1 --workers=1',
    patch: '(300,200) 60x60 CSS px — 획이 없는 빈 자리',
    metric: '휘도 sd. 결의 몫 = sqrt(면sd^2 − 무결바닥sd^2) — 독립 성분이라 분산이 더해진다(web2-26 2번의 산술 그대로)',
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
    return { mean: m, sd }
  }, buf.toString('base64'))
}

/** 한 면의 결 진폭 — **면마다 새 문맥이고, 셋 다 «평평한 바닥» 위에서 잰다.**
 *
 *  ⚠⚠ 재는 자리를 고르는 데 두 번 걸렸다(둘 다 표식이 냈다).
 *  ㉠ **한 판에서 겹을 차례로 얹으면** 뒤엣것이 앞엣것 위에 쌓여 «하나 ↔ 둘 ↔ 셋»을 견주게
 *     된다 — 그래서 면마다 새 문맥이다.
 *  ㉡ **겹은 언제나 종이 위에 얹히므로** 화면의 트레이싱지 조각은 «종이 결 + 트레이싱지
 *     결»이다. 종이에 결을 준 순간 **옐로가 자기 값을 안 건드렸는데 4.380 → 5.062로
 *     올랐고**, 그것이 이 혼동의 표식이었다. 제곱으로 빼는 것도 답이 아니었다 — 막의 곱이
 *     아래 결을 **감쇠**시켜 두 성분이 독립이 아니고, dpr2에서 비가 1.648로 벌어졌다
 *     (D-C3이 잡았다: dpr 하나만 보면 1.017로 통과한다).
 *  → 답은 **셋 다 평평한 바닥 위에서 재는 것**이다: 겹을 잴 때는 `paperFiberForTest(false)`로
 *    바탕 결을 끈다. 그러면 세 수가 전부 «그 면의 섬유가 만드는 진폭»이고, **web2-26 2번이
 *    잰 것과 정확히 같은 양**이 된다(그때는 바탕에 결이 없었으므로). */
async function measure(dpr: number, surface: 'paper' | 'tracing' | 'yellow', fibers = true) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5301/')
  await page.waitForFunction(() => (window as any).__b2)
  // 바닥 — 결이 **아예 없는** 화면(같은 실행·같은 자리 · #74 ㉡)
  await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(false))
  await settle(page)
  const bare = await patch(page)
  if (surface === 'paper') {
    if (fibers) {
      await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(true))
      await settle(page)
    }
  } else {
    // 겹은 **평평한 종이 위에서** 잰다 — 바탕 결은 끈 채로 둔다(위 ㉡)
    await drawLine(page, 280, 560, 700, 560)
    await drawLine(page, 500, 560, 800, 480)
    await page.click('#layer-add')
    await page.click(`#layer-pop .lpick[data-paper="${surface}"]`)
    await settle(page)
  }
  const face = await patch(page)
  await ctx.close()
  await browser.close()
  return {
    dpr, surface, fibers, bare: bare.sd, mean: face.mean,
    grain: Math.sqrt(Math.max(0, face.sd * face.sd - bare.sd * bare.sd)),
  }
}

test('30-9 셋의 결이 같은 경로로 그려지고 진폭이 서로 20% 이내 (+반증: 종이 결을 끄면 0)', async () => {
  const rows: Awaited<ReturnType<typeof measure>>[] = []
  for (const d of [1, 2]) for (const s of ['paper', 'tracing', 'yellow'] as const) rows.push(await measure(d, s))
  for (const d of [1, 2]) {
    const r = rows.filter(x => x.dpr === d)
    const v = r.map(x => x.grain)
    const lo = Math.min(...v), hi = Math.max(...v)
    console.log(`[30-9] dpr${d} 결 — ${r.map(x => `${x.surface} ${x.grain.toFixed(3)}(밝기 ${x.mean.toFixed(1)})`).join(' · ')} · 최대/최소 ${(hi / lo).toFixed(3)}`)
    // 셋 다 지각 대역 위(web2-26 2번의 웨버 1% ≈ 2.1계조)
    for (const x of r) expect(x.grain, `dpr${d} ${x.surface} 진폭`).toBeGreaterThan(2.1)
    // **서로 20% 이내** — 지시 게이트
    expect(hi / lo, `dpr${d} 셋의 진폭 비`).toBeLessThanOrEqual(1.2)
  }
  // 반증(D-3) — 종이 결을 끄면 종이의 진폭이 무너진다(web2-20 3부의 옛 상태)
  const off = await measure(1, 'paper', false)
  console.log(`[30-9 반증] 종이 결 끔 — ${off.grain.toFixed(6)}`)
  expect(off.grain, '반증: 결을 끄면 진폭이 지각 아래로 떨어진다').toBeLessThan(2.1)

  record('gate', { current: rows, falsify_paper_fiber_off: off })
})
