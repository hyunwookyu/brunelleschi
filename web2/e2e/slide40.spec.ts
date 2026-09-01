// web2-40 2번 — **겹을 깔고 치우는 동작**의 화면 게이트.
//
// 사람: 「이거 깔거나 치울 때, 종이를 까는 모션이 있으면 좋겠다.」
// 가져온 것은 **동작이 아니라 앞 가장자리의 표현**이다(지시 문면 — 롤은 밀려 들어온다).
// 순수 수학·상태 규약은 `test/slide40.test.ts`가 재고, 여기 있는 것은 **화면과 시간**이다:
//
//   ① 동작 중에 그은 획이 정상으로 들어간다(동작이 입력을 막지 않는다)
//   ② 동작이 끝난 뒤의 화면이 **동작 없이 얹었을 때와 픽셀로 동일**
//   ③ 성능 — 동작 중 프레임이 눈에 띄게 안 떨어진다(획 200개 장면)
//   ④ 결 씨앗은 동작과 무관하게 매번 새로 뽑힌다(web2-20 무회귀)
//
// ── 어떻게 «동작 중»을 잡는가(#71 ㉠ — 조건을 적는다) ──────────────────────────
// 창이 300 ms라 playwright의 왕복(스크린샷 한 장이 그 대역이다)으로는 그 순간을 못 짚는다.
// 그래서 **페이지 안에서 프레임마다 재고** 표를 한 번에 가져온다 — 시각도 표본도 브라우저
// 안에서 나므로 왕복 지연이 값에 안 실린다. 재는 것은 `#film` 캔버스의 **알파**다:
// 그 판은 «겹이 덮은 자리»에만 칠해지므로 알파가 곧 **종이가 지금 어디까지 왔는가**다
// («이름표»가 아니라 그리는 판 자체 — #92).
//
// ── D-2/D-3 — **이 팔은 실제로 빨갰다** ───────────────────────────────────────
// ②는 만들자마자 **빨갛게 났고**(같은 실행에서 PNG 322824 B ↔ 307280 B) 그것이 진짜
// 결함이었다: 프레임 고리가 「창이 도는 동안만 다시 그린다」였는데, **창이 열린 마지막
// 프레임은 아직 `away > 0`인 프레임**이라 다음 프레임에서 그냥 넘기면 **덜 온 종이가
// 화면에 그대로 굳었다**. 고친 자리는 `main.ts`의 프레임 고리 한 줄(닫히는 순간 한 번 더
// 그린다)이고, 그것이 이 팔의 **반증 이력**이다 — 「통과할 수도 실패할 수도 있다」가
// 가정이 아니라 **일어난 일**이다(#69 ㉣).
// 그 위에 매 실행 도는 짝 셋을 둔다:
//   · ②의 분해능(#71 ㉢) — 겹을 얹기 **전** 화면과는 다르다(비교자가 «늘 같다»가 아니다)
//   · ①의 짝 — «부르기 전에는 창이 열려 있었다»
//   · ③의 짝 — 같은 장면·같은 국면의 **정지 프레임**(갈린 축은 「창이 도는가」 하나)

import { test, expect, chromium, type Page } from '@playwright/test'
import { clearStore } from './store43'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { SLIDE_FRAME_MAX } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const N = 200

function record(key: string, val: unknown) {
  const p = resolve(HERE, '../../stage0/out/lay_slide40_web2.json')
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-40 2번 — 겹을 깔고 치우는 동작. slide40.spec이 시험마다 그 자리에서 쓴다(#71 ㉡). 판정은 spec의 expect가 정본.'
  cur.conditions = {
    viewport: '1200x800',
    command: 'LEDGER=1 npx playwright test e2e/slide40.spec.ts --workers=1',
    sampling: '페이지 안에서 requestAnimationFrame마다 #film 캔버스의 알파를 읽는다 — 왕복 지연이 값에 안 실린다. 창을 다시 열고 **한 프레임**을 기다려 읽는다(두 프레임이면 dpr2에서 그 사이가 창보다 길다 — PITFALLS #93).',
    dpr: '팔은 playwright 프로젝트 둘(dpr1·dpr2)에서 각각 돈다. 아래 값은 이 원장을 마지막으로 쓴 프로젝트의 것이다(gate_2만 자기 컨텍스트를 dpr1로 직접 만든다).',
    perf_note: '절대 ms는 결론이 아니다(cost18·cost20과 같은 규율 — 이 컨테이너의 시간은 흔들린다). 판별값은 **같은 실행 안의 배수**다.',
  }
  cur.flags_explained = {
    '상수·지표 정의 스냅샷 없음': 'web2 라인 전체의 유보다(e2e 하네스라 web/test의 공유 상수를 안 쓴다 — grain26·grain30·grain40이 같은 자리에 같은 유보를 적었다). 이 팔의 상수는 e2e/thresholds.ts의 SLIDE_FRAME_MAX와 core/constants.ts의 LAY_SLIDE_MS이고, 뒤엣것은 gate.gate_3와 gate.gate_1_4가 diag.slide().ms로 그 실행에서 그대로 읽는다.',
    'gate_2의 두 판이 다른 컨텍스트다': '측정이다 — 「동작 없이 얹은 화면」을 같은 페이지에서 만들 수 없다(한 번 얹으면 되돌릴 수 없고, 다시 얹으면 겹 id가 달라 결의 씨앗이 갈린다). 문서가 결정론이라 같은 픽스처는 같은 nextId를 내고, 팔이 그 id가 같은 것을 먼저 단언한다.',
  }
  // **한 `gate` 블록 아래로 모은다** — `selfcheck.py`의 `scan_gate_reachability`가 보는
  // 키 이름이 `gate`다. 팔마다 `gate_1` 같은 이름을 쓰면 그 검사를 **말없이 지나간다**
  // (#42 ⑪의 형태: 검사가 안 걸린 것과 지킨 것은 다르다).
  const gate = (cur.gate ?? {}) as Record<string, unknown>
  Object.assign(gate, { [key]: val })
  cur.gate = gate
  writeFileSync(p, JSON.stringify(cur, null, 2))
}

/** 게이트 블록에 **도달 가능성**을 박는다(#35·#40) — 값과 그 값을 가리키는 출처까지. */
function recordReach(reach: Record<string, unknown>, value: unknown, source: string) {
  const p = resolve(HERE, '../../stage0/out/lay_slide40_web2.json')
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  const gate = (cur.gate ?? {}) as Record<string, unknown>
  gate.reachability = reach
  gate.reachability_value = value
  gate.reachability_source = source
  cur.gate = gate
  writeFileSync(p, JSON.stringify(cur, null, 2))
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 카메라를 닫는 픽스처 — cost20과 같은 규격(지평선 + 깊이선 + 수평 앵커) */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(300, 650); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(300 + 25 * i, 650 - 18 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

/** 격자 채우기 — cost20 fillTo와 **같은 씨앗 규율**(재현되는 장면) */
async function fillTo(page: Page, target: number) {
  return page.evaluate((target) => {
    const b = (window as any).__b2
    let s = ((target * 131) >>> 0) || 1
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    while (b.app.doc.strokes.length < target) {
      const ax = 60 + rnd() * 1000, ay = 120 + rnd() * 600
      const ang = rnd() * Math.PI * 2, len = 60 + rnd() * 180
      b.diag.commitStroke(ax, ay, ax + Math.cos(ang) * len, ay + Math.sin(ang) * len)
    }
    return b.app.doc.strokes.length as number
  }, target)
}

/** `frames` 프레임을 돌며 프레임마다 `#film`의 알파를 읽는다 — **페이지 안에서** 돈다
 *  (왕복 지연이 값에 안 실린다). `mode`가 `slide`면 프레임마다 창을 **다시 연다**:
 *  창이 300 ms인데 200획 장면의 한 프레임이 그 대역이라, 한 창으로는 «동작 중 프레임»이
 *  한둘밖에 안 잡힌다(첫 판이 실제로 0을 냈다 — 그래서 이 갈래가 있다). 여는 함수는
 *  앱과 같은 `startSlide`이고 갈린 축은 「창이 도는가」 하나다.
 *  `still`이면 창을 안 열고 `redrawForTest`로만 같은 수의 프레임을 돌린다. */
const SAMPLE_IN_PAGE = `async (mode, layId, probeX, probeY, frames) => {
  const b = window.__b2
  const f = document.getElementById('film')
  const dpr = f.width / parseFloat(f.style.width)
  const g = f.getContext('2d', { willReadFrequently: true })
  const px = Math.round(probeX * dpr), py = Math.round(probeY * dpr)
  const out = []
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    const tRestart = performance.now()
    if (mode === 'slide') b.diag.slideRestartForTest(layId)
    else b.diag.redrawForTest()
    // ⚠ **한 프레임만 기다린다**(web2-40 후속 · PITFALLS #93): 두 프레임을 기다리면
    //   dpr2·200획 장면에서 그 사이가 창(300 ms)보다 길어져 «동작 중»이 아닌 자리에서
    //   읽는다 — 실제로 그렇게 빨갰다. 재는 것이 「창이 도는 프레임」이므로 기다림도
    //   한 프레임이다. 그 프레임 간격을 함께 낸다(이 팔이 기기 속도에 묶인 자리다).
    await new Promise(res => requestAnimationFrame(() => res(null)))
    const shown = f.style.display !== 'none'
    const d = shown ? g.getImageData(px, py, 1, 1).data : [0, 0, 0, 0]
    out.push({
      t: performance.now() - t0, dt: performance.now() - tRestart,
      a: d[3], active: b.diag.slide().active, away: b.diag.slide().awayOf[layId],
    })
  }
  return out
}`

/** 화면 조각의 픽셀 — 두 실행을 **바이트로** 견주는 자리 */
async function shot(page: Page) {
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 800 } })
  return buf.toString('base64')
}

test('①④ — 동작 중에 그은 획이 들어가고, 결 씨앗은 매번 새로 뽑힌다', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await fixture(page)

  // ① **창이 열린 채로** 획을 긋는다 — 그 획이 그 겹으로 들어가야 한다.
  //   ⚠ **동작점 하나로 안 잰다**(#12 · 1차 리뷰어 [8]): 지시 문면은 「동작 중에 그은 획」이지
  //   「동작 **시작**에 그은 획」이 아니다. 창이 막 열린 자리(away ≈ 1) · 종이가 반쯤 들어온
  //   자리 · 거의 다 온 자리 셋에서 재고, **치우는 창**에서도 잰다(그때는 그 겹이 이미
  //   문서에 없으므로 획이 «종이로» 가는 것이 옳다 — 그것도 「막지 않는다」의 한 얼굴이다).
  const r = await page.evaluate(async () => {
    const b = (window as any).__b2
    const frame = () => new Promise(res => requestAnimationFrame(() => res(null)))
    const id = b.diag.layerAdd('tracing') as number
    const rows: { at: string; away: number; active: boolean; landedOn: number | null; grew: boolean }[] = []
    const shot = async (at: string, waitFrames: number, x: number) => {
      b.diag.slideRestartForTest(id)
      for (let i = 0; i < waitFrames; i++) await frame()
      const away = b.diag.slide().awayOf[id]
      const active = b.diag.slide().active
      const before = b.app.doc.strokes.length
      b.diag.commitStroke(x, 300, x + 120, 330)              // 앱과 같은 확정 경로
      const last = b.app.doc.strokes[b.app.doc.strokes.length - 1]
      rows.push({ at, away, active, landedOn: last.layer ?? null, grew: b.app.doc.strokes.length === before + 1 })
    }
    const openBefore = b.diag.slide().active                 // 반증 짝: 부르기 전엔 열려 있다
    const away0 = b.diag.slide().awayOf[id]
    await shot('창이 막 열림', 0, 300)
    await shot('한 프레임 뒤', 1, 440)
    await shot('두 프레임 뒤', 2, 580)
    // 치우는 창 — 겹은 이미 문서에 없다. 획은 «종이»로 가야 하고 그래도 들어가야 한다.
    b.diag.layerRemove(id)
    const outAway = b.diag.slide().awayOf[id]
    const outActive = b.diag.slide().active
    const beforeOut = b.app.doc.strokes.length
    b.diag.commitStroke(300, 420, 420, 450)
    const lastOut = b.app.doc.strokes[b.app.doc.strokes.length - 1]
    return {
      id, openBefore, away0, rows,
      out: { away: outAway, active: outActive, grew: b.app.doc.strokes.length === beforeOut + 1, landedOn: lastOut.layer ?? null },
    }
  })
  expect(r.openBefore, '창이 실제로 열려 있었다(반증 짝 — 아니면 ①이 아무것도 안 잰다)').toBe(true)
  expect(r.away0, '겹이 아직 덜 왔다').toBeGreaterThan(0)
  for (const row of r.rows) {
    expect(row.grew, `${row.at}(away ${row.away.toFixed(3)})에 그은 획이 들어갔다`).toBe(true)
    expect(row.landedOn, `${row.at}에 그은 획이 **그 겹**으로 갔다`).toBe(r.id)
  }
  // 동작점이 실제로 갈렸다 — 하나로 재지 않았다는 값(#12)
  const aways = r.rows.map(x => x.away)
  expect(Math.max(...aways) - Math.min(...aways), `잰 동작점의 폭 ${(Math.max(...aways) - Math.min(...aways)).toFixed(3)}`).toBeGreaterThan(0.1)
  // 치우는 창 — 겹이 이미 문서에 없으므로 획은 종이로 간다. 그래도 **들어간다**.
  expect(r.out.grew, '치우는 창에서도 획이 들어갔다').toBe(true)
  expect(r.out.landedOn, '그 획은 종이로 간다(걷힌 겹으로 가면 조용히 사라진 획이 된다)').toBeNull()
  console.log(`[① 동작 중 획] ${r.rows.map(x => `${x.at} away ${x.away.toFixed(3)}→겹 ${x.landedOn}`).join(' · ')} · 치우는 창 away ${r.out.away.toFixed(3)}→종이`)

  // ④ **결 씨앗은 동작과 무관하다**(web2-20 무회귀) — 걷었다가 다시 꺼내면 무늬가 다르다.
  const seeds = await page.evaluate(() => {
    const b = (window as any).__b2
    const d = b.diag
    const ids: number[] = []
    const hashes: number[] = []
    for (let i = 0; i < 3; i++) {
      const id = d.layerAdd('yellow') as number
      ids.push(id)
      hashes.push(d.fiberTileHash(id, 'yellow'))
      d.layerRemove(id)
    }
    return { ids, hashes }
  })
  expect(new Set(seeds.ids).size, '겹마다 id가 다르다').toBe(3)
  expect(new Set(seeds.hashes).size, '겹마다 결 무늬가 다르다 — 롤을 다시 꺼내면 달라야 한다').toBe(3)

  const ms = await page.evaluate(() => (window as any).__b2.diag.slide().ms as number)
  record('gate_1_4', {
    slide_ms: ms, stroke_during_slide: r, seeds,
    reachability: {
      how: '동작점을 하나로 두지 않는다(#12) — 창이 막 열린 자리·한 프레임 뒤·두 프레임 뒤, 그리고 **치우는 창**까지 넷에서 잰다. `away`가 그 자리를 값으로 말한다.',
      away_points: r.rows.map(x => x.away),
      away_span: Math.max(...r.rows.map(x => x.away)) - Math.min(...r.rows.map(x => x.away)),
      note: '이 팔이 실패할 수 있는 자리는 「창이 열린 동안 입력을 막는」 구현이다 — 그런 구현에서는 `grew`가 false가 된다. ⚠ **판정을 둘로 갈라 읽는다**: 깔기 창의 세 자리는 `grew && landedOn === 그 겹`이고, **치우는 창의 넷째는 `grew && landedOn === null`**이다(그 겹은 이미 문서에 없으므로 획이 종이로 가는 것이 옳다 — 걷힌 겹으로 가면 조용히 사라진 획이 된다). 즉 넷째는 «그 겹에 들어간다»를 재는 자리가 아니라 «걷는 중에도 획이 들어간다»를 재는 자리다. ⚠ **동작점의 촘촘함은 기기 속도에 묶인다**(#93): dpr1에서는 away 1.000 / 0.225 / 0.055로 창 안을 세 자리 훑지만, dpr2에서는 한 프레임이 창(300ms)보다 길어 away 1.000 / 0.000 / 0.000이 된다 — 그때도 «획이 그 겹으로 들어간다»는 단언은 그대로 서고, 창 «안»의 표본만 하나로 준다.',
    },
    reachability_value: r.rows.map(x => x.away),
    reachability_source: 'gate/gate_1_4/reachability/away_points',
  })
})

test('② — 동작이 끝난 화면이 «동작 없이 얹은» 화면과 픽셀로 같다 (+분해능: 얹기 전과는 다르다)', async () => {
  const browser = await chromium.launch()
  /** 같은 장면·같은 겹 id(문서가 결정론이라 `nextId`가 같다)로 두 판을 만든다 */
  const run = async (mode: 'natural' | 'forced') => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    await page.goto('http://localhost:5301/')
    await page.waitForFunction(() => (window as any).__b2)
    await fixture(page)
    const bare = await shot(page)                  // 얹기 **전** — 비교자의 분해능(#71 ㉢)
    const id = await page.evaluate(() => (window as any).__b2.diag.layerAdd('yellow') as number)
    if (mode === 'forced') {
      // 동작 **없이** 얹은 화면 — 앱이 「획이 들어오면」 부르는 것과 같은 함수다
      await page.evaluate(() => (window as any).__b2.diag.slideSettleForTest())
    } else {
      await page.waitForTimeout(600)               // 창(300ms)이 지나고도 남게
    }
    await settle(page)
    const end = await shot(page)
    await ctx.close()
    return { id, bare, end }
  }
  const forced = await run('forced')
  const natural = await run('natural')
  await browser.close()

  expect(natural.id, '두 판의 겹 id가 같다(같은 씨앗·같은 rect — 아니면 비교가 성립 안 한다)').toBe(forced.id)
  // ②-분해능(#71 ㉢) — 비교자가 **다름을 낼 수 있다**: 겹을 얹기 전과는 다르다.
  //   («늘 같다»를 내는 비교자면 아래 단언이 아무것도 안 잰다.)
  expect(natural.end === natural.bare, '겹을 얹은 화면은 얹기 전과 다르다').toBe(false)
  // ② 본문 — 자연히 끝난 화면 == 동작 없이 얹은 화면(바이트로)
  expect(natural.end.length, '픽셀로 동일(PNG 바이트 수)').toBe(forced.end.length)
  expect(natural.end === forced.end, '픽셀로 동일 — 동작이 아무 자국도 안 남긴다').toBe(true)

  record('gate_2', {
    layer_id: forced.id,
    identical: natural.end === forced.end,
    resolution_bare_differs: natural.end !== natural.bare,
    bytes: { natural_end: natural.end.length, forced_end: forced.end.length, bare: natural.bare.length },
    note: '비교는 화면 전체(1200x800 dpr1) PNG의 **내용**이다 — base64 문자열의 `===`이므로 길이가 아니라 바이트 전부가 같아야 한다(`bytes`는 그 길이를 함께 남긴 것뿐이다). 두 판은 다른 컨텍스트에서 같은 픽스처를 돌려 같은 겹 id를 얻는다.',
    history: '이 단언은 만들자마자 실제로 빨갰다(322824 B ↔ 307280 B) — 창이 닫히는 프레임을 안 그려 «덜 온 종이»가 굳었다. main.ts 프레임 고리를 고쳐 초록이 됐다.',
  })
  // #35·#40 — **무엇이 이 기준을 넘을 수 있는가.** 이 팔의 기준은 「두 화면이 바이트로
  // 같다」이므로 그 반대편은 **다른 화면**이다: 겹을 얹기 전과 얹은 뒤가 같은 실행에서
  // 다른 바이트 수를 낸다. 그 두 수가 값이고, 아래 경로가 그것을 가리킨다.
  recordReach(
    {
      how: '겹을 얹기 **전** 화면(bare)과 얹힌 뒤 화면(natural_end)을 같은 실행·같은 컨텍스트에서 재서 바이트로 견준다 — 비교자가 «늘 같다»를 내지 않는다는 값.',
      byte_span: [natural.bare.length, natural.end.length],
      history: '②는 실제로 실패한 적이 있다 — 창이 닫히는 프레임을 안 그려 «덜 온 종이»가 굳었을 때. 그때 두 판의 바이트 수가 322824 ↔ 307280이었다.',
    },
    [natural.bare.length, natural.end.length],
    'gate/reachability/byte_span',
  )
})

test('③ — 동작 중 프레임이 눈에 띄게 안 떨어진다 (획 200개 장면)', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await clearStore(page)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await fixture(page)
  const n = await fillTo(page, N)
  await settle(page)
  expect(n, '장면이 실제로 200획이다').toBeGreaterThanOrEqual(N)

  // 겹 한 장을 얹고 **창을 닫아** 정지 상태의 프레임을 잰다(기준 칸).
  const layId = await page.evaluate(() => {
    const b = (window as any).__b2
    const id = b.diag.layerAdd('tracing')
    b.diag.slideSettleForTest()
    return id as number | null
  })
  expect(layId, '겹이 실제로 얹혔다').not.toBeNull()
  await settle(page)
  const filmOn = await page.evaluate(() => {
    const f = document.getElementById('film') as HTMLCanvasElement
    return f && f.style.display !== 'none'
  })
  expect(filmOn, '막이 실제로 그려지는 국면이다(#69 ㉣)').toBe(true)

  const FRAMES = 30
  const sample = (mode: 'still' | 'slide') => page.evaluate(([fn, m, id, fr]) => {
    (window as any).__b2.diag.frameCostReset()
    return (new Function('return ' + fn)())(m, id, 600, 400, fr) as
      Promise<{ t: number; dt: number; a: number; active: boolean; away: number }[]>
  }, [SAMPLE_IN_PAGE, mode, layId!, FRAMES] as [string, string, number, number])
  const cost = () => page.evaluate(() => (window as any).__b2.diag.frameCost()) as
    Promise<{ n: number; total: number; totalMax: number } | null>

  // 기준 칸 — **창을 안 열고** 같은 수의 프레임을 돌린다(정지 상태의 같은 국면)
  const stillS = await sample('still')
  const still = await cost()
  // 비교 칸 — **프레임마다 창을 다시 열어** 모든 프레임이 «동작 중»이 되게 한다
  const movingS = await sample('slide')
  const moving = await cost()

  expect(still, '기준 칸의 표본이 있다').not.toBeNull()
  expect(moving, '동작 칸의 표본이 있다').not.toBeNull()

  // 갈린 축이 실제로 갈렸다(반증 짝) — 기준 칸은 창이 한 프레임도 안 돌고, 동작 칸은 전부 돈다
  const stillActive = stillS.filter(s => s.active).length
  const movingActive = movingS.filter(s => s.active).length
  expect(stillActive, '기준 칸에서는 창이 안 돌았다').toBe(0)
  expect(movingActive, '동작 칸에서는 창이 돌았다 — 아니면 ③이 아무것도 안 잰다').toBeGreaterThan(FRAMES / 2)
  // 종이가 실제로 «덜 온 자리»에 있다 — 밀려 들어온 것의 **화면** 증거(#92: 이름표가 아니다)
  const uncovered = movingS.filter(s => s.a < 255).length
  expect(uncovered, '동작 중에는 그 자리가 아직 안 덮인 프레임이 있다').toBeGreaterThan(0)
  expect(stillS.every(s => s.a === 255), '정지 칸에서는 그 자리가 늘 덮여 있다').toBe(true)

  const ratio = moving!.total / Math.max(still!.total, 1e-6)
  // ⚠ **꼬리도 낸다**(#8) — 중앙값만 적으면 「가끔 한 프레임이 길다」가 안 보인다.
  const ratioMax = moving!.totalMax / Math.max(still!.totalMax, 1e-6)
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!
  const dtStill = med(stillS.map(x => x.dt))
  const dtMoving = med(movingS.map(x => x.dt))

  // 도달 가능성 대신 **분해능**을 낸다(#40 — 오라클이 없으면 그 사실을 적는다).
  // 「이 자가 1.5를 넘게 만드는 것」은 이 팔 안에 없다: 동작이 프레임에 더하는 일은
  // 더하기 하나와 그라디언트 띠 한 장뿐이라 원리적으로 몇 %다. ⚠ 궤도를 오라클로
  // 쓰려다 **반대 방향이 나왔다**(실측 배수 0.031) — 궤도에서는 막이 포즈 게이트로
  // 꺼져 프레임이 오히려 싸다. 그래서 오라클이 아니라 **같은 칸을 한 번 더 재서
  // «이 자가 얼마나 작은 차를 가르는가»**를 적는다: 정지↔정지 배수가 그 바닥이다.
  const stillS2 = await sample('still')
  const still2 = await cost()
  const noiseRatio = (still2?.total ?? 0) / Math.max(still!.total, 1e-6)
  void stillS2

  console.log(`[동작 프레임] 정지 중앙 ${still!.total.toFixed(3)}ms(n=${still!.n}) · 동작 중앙 ${moving!.total.toFixed(3)}ms(n=${moving!.n}) · 배수 ${ratio.toFixed(3)}(꼬리 ${ratioMax.toFixed(3)}) · 프레임 간격 중앙 정지 ${dtStill.toFixed(1)}ms / 동작 ${dtMoving.toFixed(1)}ms · 창이 돈 프레임 ${movingActive}/${FRAMES} · 안 덮인 프레임 ${uncovered}/${FRAMES} · 정지↔정지 바닥 ${noiseRatio.toFixed(3)}`)
  expect(ratio, `동작 중 프레임 배수 ${ratio.toFixed(3)}`).toBeLessThan(SLIDE_FRAME_MAX)
  // ⚠⚠ **꼬리에는 문을 안 건다**(#14 — 이 팔이 스스로 그것을 냈다): `totalMax ÷ totalMax`는
  //   **한 표본끼리의 비**라 실행마다 크게 흔들린다. 관측 **0.587 · 0.605 · 0.778 · 0.864 ·
  //   0.929 · 1.156 · 2.484** — 폭이 문(1.5)보다 넓다. 문을 걸면 그 문이 재는 것은 «동작의
  //   비용»이 아니라 «그 실행에서 어느 칸이 운 나빴는가»다. 그래서 **값으로만 남기고**
  //   판정은 중앙값 배수와 그 분해능(`resolution.still_over_still`)이 진다.
  //   ⚠ #8(꼬리를 본다)은 「적어라」이지 「문을 걸어라」가 아니다 — 아래 원장이 두 칸의
  //   `totalMax`를 그대로 싣는다.

  const ms = await page.evaluate(() => (window as any).__b2.diag.slide().ms as number)
  record('gate_3', {
    slide_ms: ms,
    strokes: n,
    frames: FRAMES,
    still, moving,
    ratio, threshold: SLIDE_FRAME_MAX,
    tail: {
      ratio_tail: ratioMax,
      still_max_ms: still!.totalMax, moving_max_ms: moving!.totalMax,
      gated: false,
      why_not_gated: '`totalMax ÷ totalMax`는 한 표본끼리의 비라 실행마다 크게 흔들린다 — 이 회차의 관측이 0.587 · 0.605 · 0.778 · 0.864 · 0.929 · 1.156 · 2.484로 폭이 문(1.5)보다 넓다(#14). 문을 걸면 재는 것이 «동작의 비용»이 아니라 «어느 칸이 운 나빴는가»가 된다. #8(꼬리를 본다)은 「적어라」이지 「문을 걸어라」가 아니므로 값으로만 남긴다.',
    },
    frame_interval_ms_median: { still: dtStill, moving: dtMoving },
    active_frames: { still: stillActive, moving: movingActive },
    film_alpha_uncovered_frames: { still: stillS.filter(s => s.a < 255).length, moving: uncovered },
    reachability_absent: '「이 배수를 1.5 넘게 만드는 것」의 오라클이 이 팔 안에 없다 — 동작이 프레임에 더하는 일은 더하기 하나(dx)와 그라디언트 띠 한 장뿐이라 원리적으로 몇 %다. ⚠ 궤도를 오라클로 쓰려다 **반대 방향이 나왔다**(실측 배수 0.031): 궤도에서는 막이 포즈 게이트로 꺼져 프레임이 오히려 싸다. 대신 **분해능**을 적는다 — 같은 정지 칸을 한 번 더 재서 낸 정지↔정지 배수가 이 자의 바닥이고, 그보다 큰 차만 이 팔이 «동작 탓»이라고 말할 수 있다.',
    resolution: { still_over_still: noiseRatio, still2 },
    reachability_pair: [noiseRatio, ratio],
    note: '두 칸 모두 «겹 한 장이 얹힌 채로 막이 그려지는» 국면이고 표본 프레임 수도 30으로 같다(둘 다 restart/redraw 뒤 **한 프레임**을 기다려 읽는다). ⚠ **동작 칸은 프레임마다 창을 다시 연다** — 30 프레임의 벽시계가 창(300 ms)의 몇 배이므로 이 칸이 재는 것은 «한 번의 깔기»가 아니라 **«창이 계속 도는 상태»**다(그래야 모든 표본 프레임이 동작 중이다). ⚠⚠ **갈린 축이 «창이 도는가» 하나라고 단정하지 않는다**: 두 칸의 프레임 간격 중앙이 다르고(`frame_interval_ms_median`) 동작 칸이 오히려 짧다 — 구동이 rAF 한 번으로 같아도 실제 프레임 간격까지 같지는 않다. 그래서 이 팔의 결론은 「동작이 프레임을 **눈에 띄게 안 떨어뜨린다**」까지이고, 그 «눈에 띄게»의 바닥이 `resolution.still_over_still`이다. ⚠ 두 프레임을 기다리던 첫 판은 dpr2·200획에서 그 사이(프레임 간격 113ms × 2)가 창(300ms)보다 길어 «동작 중»이 아닌 자리를 읽었고 전량 e2e에서 빨갰다 — PITFALLS #93이 이름 붙인 그 함정에 이 팔 자신이 걸렸다.',
  })
})
