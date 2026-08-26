// web2-12 2번 — 미리보기 게이트: **떼는 순간 아무 일도 안 일어나야 한다.**
// CLAUDE.md 「전환이 무변화이므로 그 순간을 인지하지 못한다」의 미리보기→확정 판이다.
//
// 재는 것 셋:
//   ① 뗌 직전/직후 — 합성 화면(스크린샷)의 가운데 상자 diff. 잠정 id(=확정될 nextId)가
//      시드이므로 brush 질감은 같은 입자로 이어져야 한다.
//   ② 판별력(D-3의 상시 팔) — classic(옛 경로: 벡터 미리보기 → 질감 확정)은 같은 상자가
//      크게 변한다. brush의 diff가 classic보다 작아야 이 게이트가 «옛 경로로 되돌리면
//      실패하는» 팔이다(실제 되돌림 실행은 NOTES에 기록 — draftEligible 차단·시드 프레임
//      변동 두 반증 다 돌렸다).
//   ③ 반짝임 없음 — 펜을 멈추고 있는 두 프레임이 완전히 같다(시드·캐시 키가 프레임에
//      안 실린다). 획을 늘려도 이미 그은 앞부분이 요동하지 않는다.
//
// 허용 오차의 근거는 상자 실측이다 — 값은 stage0/out/draft_gate_web2.json이 정본(#47).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/draft_gate_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-12 2번 — 미리보기→확정 게이트(${testInfo.project.name}): 뗌 직전/직후 합성 화면의 가운데 상자(20×50 CSS px) diff(채널 차 8 초과 픽셀 수)와 정지 프레임 동일성. e2e draftgate.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: 'release_diff = 뗌 직전(펜 닿음·최종 위치) 대비 뗀 직후의 변화 픽셀. 상자는 획 가운데 — 끝점 표식·축 안내(양끝 너머)는 밖이다. stroke_px = 그 상자의 획 픽셀 수(빈 화면 대비) — diff의 분모 격.',
    ...ledger,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return [...g.getImageData(0, 0, c.width, c.height).data]
  }, buf.toString('base64'))
}
function diffCount(a: number[], b: number[]): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(b[i]! - a[i]!) > 8 || Math.abs(b[i + 1]! - a[i + 1]!) > 8 ||
        Math.abs(b[i + 2]! - a[i + 2]!) > 8) n++
  }
  return n
}

/** 지평선 + 수평 앵커(승격) — materials.spec과 같은 픽스처 */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

/** 앵커 위 (x,560)→(x,470) 세로 획 — 뗌 직전/직후 상자(가운데)와 획 픽셀 수를 잰다 */
async function releaseDiff(page: Page, x: number) {
  const box = [x - 10, 490, 20, 50] as const
  const empty = await shot(page, ...box)
  await page.mouse.move(x, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, 560 - 9 * i)
  await settle(page)
  const before = await shot(page, ...box)
  await page.mouse.up(); await settle(page)
  const after = await shot(page, ...box)
  const lifted = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const id = a.doc.strokes[a.doc.strokes.length - 1].id
    return a.lift.lifted.has(id)
  })
  return { strokePx: diffCount(empty, before), diff: diffCount(before, after), lifted }
}

test('게이트 ① ② — 뗌 직전/직후: brush는 이어지고(작은 diff), classic(옛 경로)은 크게 변한다', async ({ page }) => {
  await boot(page)
  await fixture(page)

  // brush(새 경로) — HB
  const hb = await releaseDiff(page, 480)
  expect(hb.lifted).toBe(true)
  // INK — 미리보기가 균일 벡터(확정 몸체 Line2도 균일선)라 게이트가 다른 이유로 선다
  await page.click('#btn-pen'); await settle(page)
  const ink = await releaseDiff(page, 540)
  expect(ink.lifted).toBe(true)
  await page.click('#btn-pencil'); await settle(page)

  // classic(옛 경로 — 비교 기준): 벡터 미리보기 → 뗌에 질감(grain)·Line2가 나타난다
  await page.click('#btn-brush'); await settle(page)
  const classic = await releaseDiff(page, 600)
  expect(classic.lifted).toBe(true)
  await page.click('#btn-brush'); await settle(page)

  console.log(`[측정] 뗌 게이트 — brush HB ${hb.diff}/${hb.strokePx} · INK ${ink.diff}/${ink.strokePx} · classic HB ${classic.diff}/${classic.strokePx}`)
  ledger['release'] = {
    brush_hb: { stroke_px: hb.strokePx, release_diff: hb.diff },
    brush_ink: { stroke_px: ink.strokePx, release_diff: ink.diff },
    classic_hb: { stroke_px: classic.strokePx, release_diff: classic.diff },
    note: 'brush HB의 잔차 = 몸체 렌더러 교대(ink 벡터 → Line2)와 승격 재사영의 부픽셀 몫 — 질감(시드=잠정 id=확정 id)은 그대로다. classic은 옛 경로라 뗌에 질감이 «나타난다» — 이 대비가 게이트의 판별력이다(D-3 상시 팔).',
  }
  // 게이트(허용 오차와 근거): 잔차의 정체는 **몸체의 자리 이동**이다 — 그리는 중엔 질감만
  // 있고(겹 순서 역전을 막으려 몸체를 안 긋는다 — draftBrushed) 떼면 Line2 몸체가 질감
  // «아래»에 나타나 틈으로 비친다. 실측: dpr1 1/109(≈0) · dpr2 89/356(틈이 많은 AA 대역).
  // 시드·기하·재료가 이어지는 것은 별도 실측이 가른다(materials의 중=후 · 반증: 옛 경로
  // 93/100 · 시드 프레임 변동 109/113 — NOTES). 그래서 문턱은 dpr 공통 상한 0.35(옛 경로
  // 0.55~0.93 아래·잔차 0.25 위)와 **판별 상대 게이트**(옛 경로 대비 0.6배 미만) 둘이다.
  expect(hb.diff).toBeLessThan(hb.strokePx * 0.35)
  expect(ink.diff).toBeLessThan(ink.strokePx * 0.35)
  expect(hb.diff).toBeLessThan(classic.diff * 0.6)
  // 판별력: 옛 경로는 이 상자가 크게 변한다 — 되돌리면 위 두 단언이 잡는다(실측 93/100)
  expect(classic.diff).toBeGreaterThan(hb.diff)
})

test('게이트 ③ — 반짝임 없음: 멈춘 두 프레임이 같고, 획을 늘려도 앞부분이 요동하지 않는다', async ({ page }) => {
  await boot(page)
  await fixture(page)
  const box = [470, 500, 20, 40] as const   // 획 아랫부분(먼저 그어진 구간)
  await page.mouse.move(480, 560); await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(480, 560 - 9 * i)
  await settle(page)
  const a = await shot(page, ...box)
  await settle(page); await settle(page)     // 프레임이 더 돌았다 — 입력은 없다
  const b = await shot(page, ...box)
  const still = diffCount(a, b)
  // 획을 더 긋는다(위로) — 아랫부분 상자는 기하가 안 변한다
  for (let i = 7; i <= 10; i++) await page.mouse.move(480, 560 - 9 * i)
  await settle(page)
  const c = await shot(page, ...box)
  const grow = diffCount(a, c)
  await page.mouse.up(); await settle(page)
  console.log(`[측정] 반짝임 — 정지 두 프레임 diff ${still} · 획 연장 후 앞부분 diff ${grow}`)
  ledger['flicker'] = { still_frames_diff: still, grown_front_diff: grow,
    note: '정지 diff 0 = 멈춘 펜에서 재그리기가 안 돈다(캐시 키에 프레임이 안 실린다 — 키에 프레임 계수를 넣으면 이 단언이 잡는다). 연장 diff = 브러시가 획 전장을 파라미터로 삼아 앞부분 입자도 자라며 재배치되는 몫 — **시드와 무관**하다(반증 실측: 시드 프레임 변동에서도 86→92로 안 갈렸다. 시드 요동의 판별자는 release 게이트다 — 1/109 → 109/113). 실기기 「긋는 동안 앞부분이 거슬리게 움직이는가」는 DEFERRED 표.' }
  expect(still).toBe(0)                      // 멈추면 아무것도 안 움직인다
  // 연장 시 앞부분 요동의 회귀 카나리아 — 실측 대역(스트로크 픽셀의 대부분이 재배치)을
  // 문서화하는 상한이지 시드 판별이 아니다(위 note — 시드는 release 게이트가 가른다).
  // 상자 픽셀 수는 dpr을 탄다 — 찍힌 이미지의 실제 픽셀 수로 잰다.
  expect(grow).toBeLessThan((a.length / 4) * 0.5)
})
