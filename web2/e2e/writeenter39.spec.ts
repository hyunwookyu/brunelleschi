// web2-39 — **화면 게이트**. 단위 팔(`test/writeenter39.test.ts`)이 모형과 상태를 재고,
// 여기서 재는 것은 **손이 실제로 그 길을 걸을 수 있는가**다.
//
// ⚠⚠ 이 파일이 잡는 자리 셋 — 단위 팔이 못 잡는 것들이다:
//   ㉠ **꾹 누름이 실제로 시간으로 갈리는가** — 짧게 누르면 안 들어가고 길게 누르면
//      들어간다. 단위 팔은 `beginWriting`을 직접 부르므로 **시계를 안 지난다**.
//   ㉡ **그 몸짓이 획을 안 만드는가** — 누름은 그리기의 입구이기도 하다. 진입으로
//      소진된 몸짓이 뗌에서 획·소실점 표식으로 흘러가면 조용히 그림이 는다.
//   ㉢ **설정 손잡이가 화면에 있고 값이 앱에 닿는가**(사용자 요청) — 슬라이더를 움직이면
//      `app.writeHoldMs`가 따라오고, 그 값이 실제 누름 판정에 먹힌다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawPath(page: Page, pts: { x: number; y: number }[]) {
  await page.mouse.move(pts[0]!.x, pts[0]!.y)
  await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()
  await settle(page)
}

const line = (page: Page, ax: number, ay: number, bx: number, by: number) =>
  drawPath(page, Array.from({ length: 9 }, (_, i) => ({ x: ax + (bx - ax) * i / 8, y: ay + (by - ay) * i / 8 })))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await line(page, 280, 560, 700, 560)       // 지평선 선언
  await line(page, 500, 560, 800, 480)       // 소실점 획 — 카메라가 닫힌다
  await line(page, 500, 560, 500, 660)       // 치수를 매길 세로선(3D)
}

const state = (page: Page) => page.evaluate(() => {
  const a = (window as any).__b2.app
  return {
    n: a.doc.strokes.length,
    text: a.doc.strokes.filter((s: any) => s.text === 1).map((s: any) => s.id),
    dims: a.doc.strokes.filter((s: any) => s.dim !== undefined).map((s: any) => ({ id: s.id, dim: s.dim })),
    write: a.write === null ? null : { target: a.write.target, ids: [...a.write.ids], edit: a.write.edit },
    holdMs: a.writeHoldMs as number,
  }
})

/** 누른 채로 ms만큼 있다가 뗀다 — **움직이지 않는다**(이동은 그리기다) */
async function pressFor(page: Page, x: number, y: number, ms: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
  await settle(page)
}

test('㉠ 꾹 누름은 시간으로 갈린다 — 짧으면 안 들어가고 길면 들어간다', async ({ page }) => {
  await boot(page)
  const base = await state(page)
  // 짧게 — 문의 절반. 탭·짧은 누름은 종전 경로 그대로다.
  await pressFor(page, 500, 610, Math.round(base.holdMs / 2))
  const short = await state(page)
  console.log(`[39 화면 ㉠ 짧게 ${Math.round(base.holdMs / 2)}ms] write=${JSON.stringify(short.write)} · 획 ${short.n}`)
  expect(short.write, '문 아래에서는 안 들어간다').toBeNull()
  // 길게 — 문 + 여유
  await pressFor(page, 500, 610, base.holdMs + 150)
  const long = await state(page)
  console.log(`[39 화면 ㉠ 길게 ${base.holdMs + 150}ms] write=${JSON.stringify(long.write)} · 획 ${long.n}`)
  expect(long.write, '문 위에서는 들어간다').not.toBeNull()
  expect(long.write!.target, '누른 그 선이 대상이다').toBe(base.n)   // 마지막 획 id = 획 수
})

test('㉡ 진입한 몸짓은 획을 안 만든다 — 그리고 상태 밖 세로선 셋은 치수를 안 만든다', async ({ page }) => {
  await boot(page)
  const before = await state(page)

  // ── 사용자가 겪은 그 동작: 짧은 세로 작도선 셋 ─────────────────────────
  for (const x of [600, 630, 660]) await line(page, x, 620, x, 660)
  const hatched = await state(page)
  console.log(`[39 화면 ㉡ 해칭] 획 ${before.n} → ${hatched.n} · 글씨 ${JSON.stringify(hatched.text)} · 치수 ${JSON.stringify(hatched.dims)}`)
  expect(hatched.n, '획 셋이 그대로 남는다').toBe(before.n + 3)
  expect(hatched.text, '**글씨가 하나도 없다**').toEqual([])
  expect(hatched.dims, '**치수가 하나도 안 생긴다**').toEqual([])

  // ── 진입 몸짓이 획을 안 만든다 ─────────────────────────────────────────
  await pressFor(page, 500, 610, hatched.holdMs + 150)
  const held = await state(page)
  console.log(`[39 화면 ㉡ 진입] 획 ${hatched.n} → ${held.n} · write=${JSON.stringify(held.write)}`)
  expect(held.write, '들어갔다').not.toBeNull()
  expect(held.n, '누름은 획을 안 만든다').toBe(hatched.n)
})

test('㉢ 설정 손잡이가 화면에 있고 그 값이 실제로 먹힌다 (사용자 요청)', async ({ page }, testInfo) => {
  await boot(page)
  const rng = page.locator('#rng-whold')
  await expect(rng, '설정에 손잡이가 있다').toHaveCount(1)
  const base = await state(page)

  // ⚠⚠ **같은 누름 시간을 두 설정에서 잰다**(2차 리뷰어 [2]). 초판은 450에서 225·600을,
  //    1200에서 650·1400을 재고 「**같은 650 ms**가 설정에 따라 뒤집힌다」고 적었는데
  //    **450에서 650을 누른 칸이 없었다** — 두 칸을 잇는 것은 「문턱이 시간에 단조」라는
  //    가정이었다. 여기서 **650을 두 설정 모두에서** 눌러 그 문장을 잰 것으로 만든다.
  const PROBE = 650
  const set = async (ms: number) => {
    await rng.evaluate((el: HTMLInputElement, v: string) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, String(ms))
    return (await state(page)).holdMs
  }
  const at450 = { setting: base.holdMs, read: await page.textContent('#whold-read') }
  await pressFor(page, 500, 610, PROBE)
  const probe450 = (await state(page)).write
  await page.reload()                       // 상태를 놓고 다시 연다(설정은 localStorage에 산다)
  await page.waitForFunction(() => (window as any).__b2)
  await line(page, 280, 560, 700, 560); await line(page, 500, 560, 800, 480); await line(page, 500, 560, 500, 660)

  const set1200 = await set(1200)
  const read1200 = await page.textContent('#whold-read')
  await pressFor(page, 500, 610, PROBE)
  const probe1200 = (await state(page)).write
  await pressFor(page, 500, 610, 1200 + 200)
  const long1200 = (await state(page)).write

  console.log(`[39 화면 ㉢] holdMs ${at450.setting} → ${set1200} · 읽기 «${read1200}»`)
  console.log(`[39 화면 ㉢] 같은 ${PROBE}ms — 450에서 ${JSON.stringify(probe450)} · 1200에서 ${JSON.stringify(probe1200)}`)

  expect(set1200, '앱이 그 값을 든다').toBe(1200)
  expect(read1200).toBe('1.20s')
  expect(probe450, `${PROBE}ms는 문 450 위라 들어간다`).not.toBeNull()
  expect(probe1200, `**같은 ${PROBE}ms**가 문 1200 아래라 안 들어간다`).toBeNull()
  expect(long1200, '새 문 위에서는 들어간다').not.toBeNull()

  if (process.env.LEDGER === '1') {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, `writeenter39_screen_web2_${testInfo.project.name}.json`), JSON.stringify({
      what: 'web2-39 1번 — **누름 시간 손잡이가 실제로 먹히는가**를 화면에서 잰다. '
        + '단위 팔은 여기 못 닿는다(시계가 `input.ts`의 DOM에 있다).',
      why_its_own_ledger: '⚠⚠ **초판은 이 값을 손으로 옮겨 적어 단위 팔의 원장에 넣었다**'
        + '(2차 리뷰어 [6] — #88 「팔이 상수를 손으로 들지 마라」·#40 ④의 형태). '
        + '이제 **이 실행이 스스로 쓴다** — e2e가 바뀌면 값이 따라온다. 원장 관문(#90 ㉢)은 '
        + 'playwright 배선(`playwright.config.ts` 최상단 `import ./tools/ledgerguard`)이 진다.',
      dpr: testInfo.project.name,
      default_ms: at450.setting,
      probe_ms: PROBE,
      same_press_two_settings: [
        { setting_ms: at450.setting, press_ms: PROBE, entered: probe450 !== null, write: probe450 },
        { setting_ms: 1200, press_ms: PROBE, entered: probe1200 !== null, write: probe1200 },
      ],
      above_new_threshold: { setting_ms: 1200, press_ms: 1400, entered: long1200 !== null },
      reading: { at_default: at450.read, at_1200: read1200 },
      falsification: '**설정을 올려도 같은 650 ms에 여전히 들어가면** 손잡이가 안 먹는 것이다. '
        + '두 줄이 `entered: true` / `entered: false`로 갈리는 것이 「먹힌다」의 관측량이고, '
        + '`driftAllowPx`(= `holdMs`의 산술 귀결)는 **근거로 안 쓴다**.',
      what_this_does_not_say: '⚠ 문턱 자체를 훑지 않았다 — 잰 것은 **한 쌍의 뒤집힘**이고 '
        + '「450과 1200 사이 어디서 뒤집히는가」는 재지 않았다. 그리고 마우스 누름이다'
        + '(펜 표본 0 · AS-C1 계열).',
      selfcheck_notes: {
        constants_snapshot_absent: '⚠ `constantsSnapshot()` / `metric_defs`가 없다 — '
          + '**web2 라인 전체의 구멍**이고 이 원장만의 것이 아니다(`lens31`·`turn31`·`glyph35`가 '
          + '같은 플래그를 낸다). 그 기계는 `web/test/constants.ts`에만 있다. DEFERRED.',
        dpr_note: '두 판(dpr1·dpr2)을 따로 낸다 — 값이 갈리는지 **원장이 스스로 보이게** 한다'
          + '(#89 계열: 「둘 다 돌았다」를 한 벌로 적으면 갈렸는지 안 보인다).',
      },
    }, null, 2))
  }
})
