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
//
// ══ web2-34 1번 — **이 팔의 물음을 고쳐 적었다**(임계를 무른 것이 아니다) ══════════
//
// 30-9가 세운 게이트는 「셋의 진폭이 서로 20% 이내」(`hi/lo ≤ 1.2`)였다. 그 게이트가
// 실제로 묻던 것은 **「셋 다 보이는가」**다 — 그때의 결함이 「종이만 결이 없다」였으므로
// 「나머지 둘과 같은 대역에 있는가」가 그 물음의 값이었다.
//
// 그런데 사람이 배포판에서 다시 말했다: 「종이 질감이 너무 과하다. 사실 없는 게 나을 수도.」
// **값이 틀린 것이 아니라 자리가 다르다**(화면 규칙 R8 — `DECISIONS.md`): 겹(트레이싱지·
// 옐로)은 사람이 «한 장 얹은» 것이라 **잠깐** 있고 그 결이 곧 «그 종이가 있다»는 표시다.
// 바탕 종이는 **화면 전체를 늘 덮는다** — 같은 진폭이면 그림보다 종이가 먼저 읽힌다.
// 그리고 30-9 뒤의 실측이 그 위반을 수치로 냈다: **두 dpr 모두에서 바탕 종이가 최댓값**
// (dpr1 3.973 > 3.920 > 3.914 · dpr2 4.837 > 4.416 > 4.179).
//
// 그래서 바탕만 내리면 `hi/lo ≤ 1.2`가 빨개진다 — **#76 ㉣의 내리는 판**이다(「지금 값을
// 바꾸면 그 값을 «다른 뜻으로 읽던» 팔이 깨진다」). 답은 임계를 무르는 것이 아니라
// **그 팔이 무엇을 묻고 있었는지 다시 적는 것**이다(#75 ㉣의 물음: 「그 팔이 지키던
// 사람의 요구가 지금도 유효한가」 — 유효하다. 갈린 것은 **자리에 따른 세기**뿐이다).
// 그래서 `hi/lo ≤ 1.2` 한 줄을 **두 조항**으로 갈라 적었다:
//   ① 셋 다 지각 대역 위(> 2.1계조) ......... 30-9의 요구 그대로 — 「낮추되 안 없앤다」
//   ② min(겹 진폭) ÷ 바탕 진폭 ≥ 1.2 ........ R8 — 「보이되 겹보다 약한가」
// ②의 1.2는 **새 숫자가 아니다**(#54): 30-9의 20%를 그대로 쓰되 부호를 뒤집은 것이고,
// 두 조건은 동시에 못 서므로 「팔이 실제로 갈렸다」가 그 상수 하나로 증명된다.
// 정본은 `C.PAPER_GRAIN_RATIO`이고 근거 주석이 그 자리에 있다.
//
// D-2(재현 먼저): 바탕 알파를 안 내린 상태에서 ②가 **실제로 빨갛다**(반증 ②가 그 값을
//   매 실행 다시 낸다 — `paperGrain309ForTest`가 30-9 알파를 되살린다).
// D-4(사람이 준 근거는 처방이지 진단이 아니다): 「사실 없는 게 나을 수도」를 «기본을 꺼라»로
//   읽지 않았다 — 30-9가 「종이만 결이 없는 것이 결함이다」로 판정한 관측은 여전히 유효하다.
//   그래서 **기본은 켜짐**이고, 끄고 싶은 사람을 위해 설정에 손잡이(`#chk-grain`)를 둔다.

import { test, expect, chromium, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { C } from '../src/core/constants'

/** 지각 문턱(web2-26 2번) — 이 자리 배경 휘도 ≈ 212이므로 웨버 1% ≈ 2.1계조.
 *  **34-1이 안 건드린 값이다**(30-9·26-2가 세운 하한 그대로 · grain26.spec과 같은 수). */
const GRAIN_FLOOR = 2.1

const HERE = dirname(fileURLToPath(import.meta.url))
function record(key: string, val: unknown) {
  // 원장은 **`LEDGER=1` 단독 실행에서만** 쓴다(web2-22 규율·#71 ㉠의 문). 팔은 그대로
  // 돌고 원장만 안 덮는다 — 여기 이 문이 **web2-34 1번에서 뒤늦게 붙었다**: 이 파일은
  // 30-9 이래 **무조건 쓰는 갈래**였고, 그래서 병렬·중간 실행이 조용히 값을 덮을 수
  // 있었다(다른 e2e 원장 여섯은 전부 이 문을 이미 갖고 있다 — icons·paperbar·brushperf·
  // cost18·strip·roundsave). 정본 명령:
  //   LEDGER=1 PW_PORT=5301 npx playwright test e2e/grain30.spec.ts --project=dpr1 --workers=1
  if (process.env.LEDGER !== '1') return
  const p = resolve(HERE, '../../stage0/out/paper_grain30_web2.json')
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-30 9번 → **web2-34 1번이 물음을 고쳐 적었다**: 셋 다 지각 대역 위(>2.1)이고 «늘 보이는» 바탕 종이가 «잠깐 얹히는» 겹보다 뚜렷하게 약한가(R8). 판정은 spec의 expect가 정본.'
  cur.flags_explained = {
    'bare가 near-zero(1e-11 대역)': '**측정이다** — 결을 끈 종이 조각은 dpr1에서도 한 색이다(web2-30 9번 전까지 바탕 종이가 그랬다). 이 값은 임계가 아니라 «그 실행의 바닥»으로만 쓰이고, 빼는 산술이 sqrt(신호²−바닥²)라 0이어도 안전하다(web2-26 2번의 같은 플래그와 같은 자리).',
    '상수·지표 정의 스냅샷 없음': 'web2 라인 전체의 유보다(e2e 하네스라 web/test의 공유 상수를 안 쓴다). 이 원장의 상수는 filmlayer.PAPER_STYLE·TILE_CSS이고 그 값은 spec이 화면에서 읽는다.',
  }
  cur.conditions = {
    viewport: '1200x800',
    dpr: '이 파일이 chromium.newContext로 1·2를 직접 만든다(프로젝트 dpr 무관)',
    command: 'LEDGER=1 PW_PORT=5301 npx playwright test e2e/grain30.spec.ts --project=dpr1 --workers=1',
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
async function measure(
  dpr: number, surface: 'paper' | 'tracing' | 'yellow',
  /** 'on' 지금 값 · 'off' 결 끔(반증) · 'legacy309' 30-9 알파로 되돌림(반증) ·
   *  'uiOff' **화면의 설정 체크상자로** 끔(web2-34 1번의 손잡이를 실제로 눌러 본다) */
  mode: 'on' | 'off' | 'legacy309' | 'uiOff' = 'on',
) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5301/')
  await page.waitForFunction(() => (window as any).__b2)
  // 바닥 — 결이 **아예 없는** 화면(같은 실행·같은 자리 · #74 ㉡)
  await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(false))
  await settle(page)
  const bare = await patch(page)
  if (mode === 'legacy309') await page.evaluate(() => (window as any).__b2.diag.paperGrain309ForTest(true))
  if (surface === 'paper') {
    if (mode !== 'off') {
      await page.evaluate(() => (window as any).__b2.diag.paperFiberForTest(true))
      await settle(page)
    }
    if (mode === 'uiOff') {
      // **화면의 손잡이로** 끈다 — diag가 아니라 사람이 누르는 자리다.
      await page.click('#pane-settings > summary')
      await page.click('#chk-grain')
      await settle(page)
      // 상태 토글이라 서랍이 안 접힌다(R3 · 28-1) — 그것도 여기서 값으로 든다
      const open = await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open)
      expect(open, '종이 결은 상태 토글이라 설정 서랍이 안 접힌다(R3)').toBe(true)
      await page.click('#pane-settings > summary')   // 서랍이 화면을 가리지 않게 접는다
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
    dpr, surface, mode, bare: bare.sd, mean: face.mean,
    grain: Math.sqrt(Math.max(0, face.sd * face.sd - bare.sd * bare.sd)),
  }
}

test('34-1 셋 다 보이되(>2.1) 바탕이 겹보다 뚜렷하게 약하다 (+반증 셋)', async () => {
  const rows: Awaited<ReturnType<typeof measure>>[] = []
  for (const d of [1, 2]) for (const s of ['paper', 'tracing', 'yellow'] as const) rows.push(await measure(d, s))
  const ratios: Record<string, number> = {}
  for (const d of [1, 2]) {
    const r = rows.filter(x => x.dpr === d)
    const paper = r.find(x => x.surface === 'paper')!.grain
    const overlay = Math.min(...r.filter(x => x.surface !== 'paper').map(x => x.grain))
    ratios[`dpr${d}`] = overlay / paper
    console.log(`[34-1] dpr${d} 결 — ${r.map(x => `${x.surface} ${x.grain.toFixed(3)}(밝기 ${x.mean.toFixed(1)})`).join(' · ')} · 겹최소/바탕 ${(overlay / paper).toFixed(3)}`)
    // ① **셋 다 지각 대역 위** — 30-9의 요구는 그대로 살아 있다(웨버 1% ≈ 2.1계조).
    //    이 조항이 「낮추되 없애지는 않았다」를 지킨다.
    for (const x of r) expect(x.grain, `dpr${d} ${x.surface} 진폭`).toBeGreaterThan(GRAIN_FLOOR)
    // ② **바탕이 겹보다 뚜렷하게 약하다**(R8). 임계의 근거는 `C.PAPER_GRAIN_RATIO`에 있다 —
    //    30-9의 20%를 그대로 쓰되 **부호를 뒤집었다**(새 숫자를 안 짓는다 · #54).
    expect(overlay / paper, `dpr${d} 겹최소/바탕 진폭 비`).toBeGreaterThanOrEqual(C.PAPER_GRAIN_RATIO)
  }
  // 반증 ①(D-3 · 30-9에서 이어짐) — 결을 끄면 종이의 진폭이 무너진다(web2-20 3부의 옛 상태)
  const off = await measure(1, 'paper', 'off')
  console.log(`[34-1 반증 ①] 종이 결 끔(diag) — ${off.grain.toFixed(6)}`)
  expect(off.grain, '반증 ①: 결을 끄면 진폭이 지각 아래로 떨어진다').toBeLessThan(GRAIN_FLOOR)
  // 반증 ②(D-3 · 34-1이 새로 세운 조항 ②의 반증) — **30-9의 알파로 되돌리면 ②가 실제로
  //   빨개진다.** 이것이 없으면 조항 ②는 무엇을 재는지 모르는 팔이다(#69 ㉣).
  const legacy: Record<string, number> = {}
  for (const d of [1, 2]) {
    const p9 = await measure(d, 'paper', 'legacy309')
    const overlay = Math.min(...rows.filter(x => x.dpr === d && x.surface !== 'paper').map(x => x.grain))
    legacy[`dpr${d}`] = overlay / p9.grain
    console.log(`[34-1 반증 ②] dpr${d} 30-9 알파 — 바탕 ${p9.grain.toFixed(3)}(밝기 ${p9.mean.toFixed(1)} · 바닥 ${p9.bare.toFixed(3)}) · 겹최소/바탕 ${(overlay / p9.grain).toFixed(3)}`)
    expect(overlay / p9.grain, `반증 ②: dpr${d}에서 30-9 값은 조항 ②를 못 넘는다`).toBeLessThan(C.PAPER_GRAIN_RATIO)
  }
  // 반증 ③ = **게이트 「끄면 완전히 사라진다」** — 화면의 설정 체크상자로 끈다(diag 아님).
  const uiOff = await measure(1, 'paper', 'uiOff')
  console.log(`[34-1 반증 ③] 종이 결 끔(화면 #chk-grain) — ${uiOff.grain.toFixed(6)}`)
  expect(uiOff.grain, '반증 ③: 화면 손잡이로 끄면 결이 사라진다').toBeLessThan(GRAIN_FLOOR)

  record('gate', {
    current: rows,
    overlay_min_over_paper: ratios,
    ratio_threshold: C.PAPER_GRAIN_RATIO,
    perceptual_floor_levels: GRAIN_FLOOR,
    falsify_paper_fiber_off: off,
    falsify_legacy_309_alpha: legacy,
    legacy_309_ratios: [legacy.dpr1, legacy.dpr2],
    falsify_ui_toggle_off: uiOff,
    // #35 — **무엇이 이 기준을 넘을 수 있는가.** 답은 반증 ②가 매 실행 낸다: 바탕 알파를
    // 30-9 값으로 되돌리면 조항 ②의 비가 임계(1.2) **아래로 내려간다**(dpr 둘 다).
    // ⚠ 반증 ①③(결 끄기)의 0은 **설계 보장**이라 도달 가능성으로 안 쓴다(#40·#5) —
    //   그 둘은 「끄면 사라진다」를 재는 것이지 조항 ②의 오라클이 아니다.
    reachability: {
      how: 'diag.paperGrain309ForTest(true) — 바탕 종이의 알파만 30-9 값(0.078~0.186)으로 되돌린다. 개수·길이·굵기는 지금 값 그대로라 갈린 축이 하나다',
      ratio_gate_is_ge_1_2: { current: ratios, legacy_309: legacy },
      note: '30-9 알파에서는 두 dpr 모두 임계 아래다 — 이 게이트는 통과할 수도 실패할 수도 있다(#69 ㉣ · D-3).',
    },
    // ⚠ 값 대조(#40·#33)는 **`gate` 바로 아래**에서 읽힌다(`selfcheck._gate_value_checks`) —
    //   `reachability` 안에만 두면 「산문뿐」으로 잡힌다. 경로 구분자는 **`/`다**(`_resolve`).
    reachability_value: [legacy.dpr1, legacy.dpr2],
    reachability_source: 'gate/legacy_309_ratios',
  })
})

test('34-1 종이 결 손잡이 — 기본 켜짐 · 껐다 켜기 왕복 · 다시 열어도 유지 (localStorage)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#pane-settings > summary')
  const box = page.locator('#chk-grain')
  expect(await box.isChecked(), '기본은 켜짐(30-9의 관측이 유효하다 — D-4)').toBe(true)
  await box.click()
  expect(await box.isChecked()).toBe(false)
  // **저장 자리가 localStorage다**(문서가 아니다) — 값으로 든다
  expect(await page.evaluate(() => localStorage.getItem('b2-grain')), '결은 «보는 방식»이라 기기에 남는다').toBe('off')
  // 다시 열어도 꺼진 채다
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#pane-settings > summary')
  expect(await page.locator('#chk-grain').isChecked(), '재방문에도 유지').toBe(false)
  // 왕복 — 켜면 다시 켜지고 저장도 따라온다
  await page.locator('#chk-grain').click()
  expect(await page.locator('#chk-grain').isChecked()).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('b2-grain'))).toBe('on')
})
