// 종단 — **시점 스냅**(web2-08 지시 3): 정렬은 임계(≈8.25°) 안으로 가져왔을 때만 걸린다.
// 단위(`test/level.test.ts`·`test/posesnap.test.ts`)는 가짜 시계로 재고, 여기서는
// **진짜 시계와 진짜 입력**으로 잰다: 잡고 있는 동안 안 접히는가 · 임계 안에서 놓으면
// 접히는가 · **임계 밖은 머물고 거기서 그려지는가**.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const __HERE = dirname(fileURLToPath(import.meta.url))
// 지평선 잉크량 원장(web2-12 7번 — 3차 리뷰어 [4]: «약 2/3» 산문이 아니라 수를 원장에)
let horizonInk = -1
let horizonOff = -1
test.afterAll(async ({ }, testInfo) => {
  if (horizonInk < 0) return
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(__HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(__HERE, `../../stage0/out/horizon_web2${suffix}.json`), JSON.stringify({
    what: `web2-12 7번(${testInfo.project.name}) — 지평선 열당 잉크량(Σ알파÷dpr²÷열수)과 토글 끔의 painted. e2e level.spec 「지평선이 옅다」가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47). 판정 대역(상한 110·하한 30)의 근거는 그 팔 주석.`,
    per_col_ink: Number(horizonInk.toFixed(2)),
    off_band_painted: horizonOff,
    history_note: '직전(web2-08 2H급)의 실측은 그 회차 기록 128/128(dpr1/dpr2) — 이 원장은 현행(COL.horizon)만 든다.',
  }, null, 1))
})

const FOLD_DELAY_MS = 1200
const FOLD_ANIM_MS = 300

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  }
  await page.mouse.up()
  await settle(page)
}

const lev = (page: Page) => page.evaluate(() => (window as any).__b2.diag.level())
const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

/** 요 두 방향 사이 각(도) */
const yawGap = (a: any, b: any) =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI

/** 중버튼으로 위아래로 끈다 — 놓지 않는다. 임계는 문서의 f를 탄다 —
 *  이 스펙의 2점 픽스처는 f = 0.32W라 임계 3.08°(10.7px)다.
 *  dy=+8 → 피치 −2.3°(임계 **안** — 놓으면 접힌다).
 *  dy=+100 → 피치 −28.6°(임계 **밖** — 머무는 자세다). */
async function tiltDown(page: Page, dy = 8) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(640, 400 + dy, { steps: 8 })
  await settle(page)
}

async function waitFolded(page: Page) {
  await page.waitForFunction(
    () => (window as any).__b2.diag.level().level && !(window as any).__b2.diag.level().folding,
    null, { timeout: 10_000 })
  await settle(page)
}

test('임계 안은 접히고 임계 밖은 머문다 — 그리고 머무는 자세에서 그려진다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)

  // 작도 — 지평선 · 깊이선 둘 · 기둥 하나(3D 기하가 있어야 궤도가 돈다)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  expect((await page.evaluate(() => (window as any).__b2.diag.summary())).lifted).toBe(3)
  expect((await lev(page)).level).toBe(true)

  // ── 기울인다 ────────────────────────────────────────────────────────
  const eyeBefore = (await lev(page)).eye          // **궤도 전** 눈높이 — 접으면 여기로 돌아온다
  await tiltDown(page)
  let s = await lev(page)
  expect(s.level).toBe(false)
  expect(Math.abs(s.fwd.y)).toBeGreaterThan(0.02)      // 실제로 위아래로 돌았다
  // **기울어 있을 때 무엇이 다른지 보인다** — 한 줄이 그것을 말한다
  expect(await page.textContent('#notice')).toContain('기울어')

  // ── 잡고 있는 동안에는 안 접힌다 (지연의 두 배를 기다린다) ──────────
  const held = s
  await page.waitForTimeout(FOLD_DELAY_MS * 2)
  await settle(page)
  s = await lev(page)
  expect(s.level).toBe(false)
  expect(s.fwd.y).toBeCloseTo(held.fwd.y, 12)          // 한 톨도 안 움직였다

  // ── 놓으면 접힌다 ──────────────────────────────────────────────────
  const yaw0 = s.yaw
  expect(Math.abs(s.eye - eyeBefore)).toBeGreaterThan(0.1)   // 궤도가 눈높이를 바꿨다(작은 기울기라 폭도 작다)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)          // 놓자마자는 아직 그대로다
  await waitFolded(page)
  s = await lev(page)
  expect(s.level).toBe(true)
  expect(Math.abs(s.fwd.y)).toBeLessThan(1e-9)         // 피치 0
  expect(yawGap(s.yaw, yaw0)).toBeLessThan(1e-3)       // 좌우 각도는 **새 값**
  expect(s.eye).toBeCloseTo(eyeBefore, 6)              // 눈높이는 **궤도 전** 값(web2-05)
  expect(await page.textContent('#notice')).not.toContain('기울어')

  // ── 임계 안(접힐 자세)에서는 획이 안 생긴다 — 그 누름이 접기를 당긴다 ──
  const n0 = await strokeCount(page)
  await tiltDown(page)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await lev(page)).level).toBe(false)
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0)             // 하나도 안 늘었다
  // 그 누름이 죽은 클릭이 아니다 — 접기를 당긴다
  await waitFolded(page)

  // ── 접힌 뒤에는 그려진다 ───────────────────────────────────────────
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n0 + 1)
  expect(FOLD_ANIM_MS).toBeLessThan(FOLD_DELAY_MS)     // 상수 대조 — 값이 바뀌면 여기가 안다

  // ── **임계 밖 — 머무는 자세다**(재현: 수리 전에는 여기서도 접혔다) ────
  await tiltDown(page, 100)                            // 피치 ≈ −28.6°
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const tilted = await lev(page)
  expect(tilted.level).toBe(false)
  expect(Math.abs(tilted.fwd.y)).toBeGreaterThan(0.3)
  await page.waitForTimeout(FOLD_DELAY_MS * 2)         // 지연의 두 배를 기다려도
  await settle(page)
  const still = await lev(page)
  expect(still.level).toBe(false)                      // 안 접힌다 — 머문다
  expect(still.fwd.y).toBeCloseTo(tilted.fwd.y, 9)
  // 머무는 자세라 «기울어 있다» 안내도 없다 — 그리는 자리다
  expect(await page.textContent('#notice')).not.toContain('기울어')

  // ── 머무는 자세에서 그려진다 — 그 포즈의 2D(대기 획)로 남는다 ────────
  const n1 = await strokeCount(page)
  await drawLine(page, 300, 600, 420, 640)
  expect(await strokeCount(page)).toBe(n1 + 1)         // 수리 전에는 획이 안 생겼다
  const last = await page.evaluate(() => {
    const d = (window as any).__b2.app.doc.strokes
    return d[d.length - 1]
  })
  expect(last.view).toBeDefined()                      // 그 포즈가 실려 있다

  // ── 의도적으로 정렬 가까이 가져오면 그때 접힌다 ─────────────────────
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(600, 400 - 93, { steps: 8 })   // 피치 −28.6° → −2.0° (임계 안)
  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  expect((await lev(page)).level).toBe(true)
})

/** 영역의 실제 그려진 픽셀 수 — 2D 오버레이(ink) */
function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

test('소실점에 커서를 올리면 **붙었다는 표식이 뜬다** — 픽셀로 잰다', async ({ page }) => {
  // 재현: 스냅 판정은 돌았는데 `render2d`의 `mark()` switch에 `'vp'`가 없어
  // **빈 경로에 stroke**가 되어 아무것도 안 그려졌다. 상시 떠 있는 ✕만 남아
  // 「붙었다」와 「안 붙었다」가 화면에서 구별되지 않았다 —
  // 실측(수리 전): 소실점 둘레 픽셀 **80 → 80(차 0)**, 같은 조건에서 끝점 **10 → 72(+62)**.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  const vps = await page.evaluate(() => (window as any).__b2.diag.summary().vps)
  expect(vps[0]).toEqual({ x: 900, y: 400 })

  // 커서를 멀리 — ✕만 있는 상태
  await page.mouse.move(200, 700)
  await settle(page)
  const away = await inkPixels(page, 885, 385, 915, 415)
  expect(away).toBeGreaterThan(0)                 // ✕는 상시 표시다(대조군이 비면 안 잰다)

  // 커서를 소실점 위로 — **표식이 더해져야 한다**
  await page.mouse.move(900, 400)
  await settle(page)
  const on = await inkPixels(page, 885, 385, 915, 415)
  // 실측(dpr 1): 수리 전 **80 → 80(차 0)** · 수리 후 **80 → 182(차 +102)**.
  // 임계 20은 실측 102의 **5분의 1**이다 — dpr·안티에일리어싱 여유를 두되 «0과 가른다»는
  // 목적에 필요한 만큼만. 대조군(끝점)은 배경 10에 +62였다.
  expect(on).toBeGreaterThan(away + 20)           // 수리 전에는 차가 **0**이었다

  // 그리고 실제로 그 점에서 시작한다 — 붙은 좌표가 그대로 확정된다(원칙 d)
  await drawLine(page, 903, 402, 700, 550)        // 3 px 빗나가게 누른다
  const st = await page.evaluate(() => {
    const d = (window as any).__b2.app.doc.strokes
    return d[d.length - 1]
  })
  expect(st.a).toEqual({ x: 900, y: 400 })        // 소실점에 붙었다
})

test('작도가 안 끝난 채 접히면 그 길이 화면에 뜬다 — 한 번 누르면 작도 시점으로', async ({ page }) => {
  // 이 회차가 만든 함정의 화면 층(2차 리뷰어 [2]). 접힌 포즈는 정렬이라 그릴 수 있어
  // 보이는데 **소실점은 못 만든다.** 그 사실과 **가는 길**이 한 줄에 함께 있어야 한다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)        // 지평선
  await drawLine(page, 500, 500, 600, 475)         // 깊이선 1 — 소실점 하나뿐이다
  expect(await page.evaluate(() => (window as any).__b2.diag.summary().vps.length)).toBe(1)

  await tiltDown(page)
  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  expect((await lev(page)).level).toBe(true)
  const line = await page.textContent('#notice')
  expect(line).toContain('작도가 아직 안 끝났다')
  // **밑줄 단어가 실제로 있고 눌리면 작도 시점으로 간다**
  await page.click('#notice u[data-pick="draw-view"]')
  await settle(page)
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  expect(Math.abs(s.pose.q.y)).toBeLessThan(1e-12)   // 작도 시점 — 요가 0이다(그 길의 대가)
  // 그 자리에서는 소실점이 만들어진다
  await drawLine(page, 500, 500, 400, 475)
  expect(await page.evaluate(() => (window as any).__b2.diag.summary().vps.length)).toBe(2)
})

test('**접힌 뒤에도 지평선이 그려진다** — 픽셀로 잰다 (web2-06 지시 3)', async ({ page }) => {
  // 재현: `render2d`가 지평선을 **작도 포즈에서만** 그었다. 접힌 포즈는 피치 0이라
  // 지평선이 그대로 화면 수평선인데도 사라졌고, 그래서 web2-05의 증상(「지평선이 위로
  // 올라간다」)을 **고친 뒤에 화면에서 확인할 수가 없었다.**
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)
  // web2-17 5부: 소실점(900,400)이 화면 안이라 자동 숨김이 발동한다 — 이 팔이 재는 것은
  // «접힌 포즈의 지평선 렌더링»이므로 사람 경로(체크박스)로 표시를 굳히고 잰다.
  await page.click('#btn-display')                    // 표시는 눈 팝업(web2-19 3-a)
  await page.click('#chk-horizon')                    // 자동 꺼짐(체크 풀림) → 켬 = pref true
  await page.click('#btn-display')
  await settle(page)

  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  // 지평선 자리의 가로 띠 — CSS px로 환산한 픽셀 수(dpr 1·2에서 같은 눈금으로 읽는다)
  const band = async () => (await inkPixels(page, 0, 397, 1200, 403)) / (dpr * dpr)

  await page.mouse.move(200, 700)          // 커서를 띠 밖으로 (호버 표식이 안 섞이게)
  await settle(page)
  const atDraw = await band()
  expect(atDraw).toBeGreaterThan(600)      // 작도 포즈 — 화면 전폭의 선이 있다

  // 기울인다 — 그때는 **없는 것이 맞다**(화면 수평선이 아니다). 반증 조건이다.
  await tiltDown(page)
  await settle(page)
  const tilted = await band()
  expect(tilted).toBeLessThan(atDraw / 4)

  // 놓아 접는다 — **다시 있어야 한다**. 고치기 전에는 여기가 `tilted` 수준이었다.
  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  await page.mouse.move(200, 700)
  await settle(page)
  const folded = await band()
  expect((await lev(page)).level).toBe(true)
  expect(folded).toBeGreaterThan(600)
  expect(folded).toBeGreaterThan(tilted * 4)
})

test('**돌려보다 줌한 거리가 접어도 남는다** — 궤도 반경 (web2-06 지시 5)', async ({ page }) => {
  // 재현: 접기가 앵커로 통째로 돌아가면서 **줌까지 지웠다**(단위 실측 7.225 → 줌 3.613 →
  // 접은 뒤 7.225). 궤도는 pivot 둘레의 회전이라 반경을 구성상 보존하므로, 반경이
  // 달라졌다면 그것은 사람이 정한 값이다 — 그래서 접기가 지킨다.
  // 여기서는 **진짜 입력**으로 잰다(휠). 계산이 `input.ts`에 있던 동안은 시험이 못 부르던 길이다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)

  const r0 = (await lev(page)).radius
  expect(r0).toBeGreaterThan(0)

  await tiltDown(page)                                  // 중버튼을 잡은 채 기울인다
  expect((await lev(page)).radius).toBeCloseTo(r0, 6)   // 궤도는 반경을 안 바꾼다

  await page.mouse.wheel(0, -400)                       // 다가간다
  await settle(page)
  const rZoom = (await lev(page)).radius
  expect(rZoom).toBeLessThan(r0 * 0.9)

  await page.mouse.up({ button: 'middle' })
  await waitFolded(page)
  expect((await lev(page)).level).toBe(true)
  expect((await lev(page)).radius).toBeCloseTo(rZoom, 6)   // ← 고치기 전에는 r0로 돌아갔다
})

test('**지평선이 옅다 — h~2h 급** · 픽셀 잉크량으로 잰다 (web2-08 지시 1)', async ({ page }) => {
  // 재현: 작도선 색(#8a7f6a)을 **불투명**으로 그어 지평선이 사용자 획(HB 알파 0.75)보다
  // 진했다 — 화면에서 가장 진한 선이 사용자 그림이 아니라 작도선이었다.
  //
  // 지표는 «띠의 열당 잉크량» Σ알파 ÷ dpr² ÷ 열수 — 굵기×진하기가 함께 실리는 «무게»다.
  // 평균 알파로 재던 초판은 AA 커버리지 배분에 얹혀 여유가 6%뿐이었고, 지시 문면
  // 「h 내지 2h」의 **h(알파 0.60) 쪽을 임계가 거부**했다(1차 리뷰어 [1][2]).
  // 실측(변이 넷 × dpr 둘, 열당 잉크량 dpr1/dpr2):
  //     수리 전(불투명 · 1.3px)  382 / 319
  //     알파만 0.50(굵기 1.3)    192 / 160   ← 감소의 알파 몫
  //     H (0.60 · 1.2px)         154 / 191
  //     2H(0.50 · 1.1px)         128 / 128   ← 현재값
  // 상한 250: h~2h 문면 전체가 통과하고(H와 여유 31%) 수리 전이 걸린다(여유 28%).
  // 하한 60(반증 조건 D-3): 안 그려지면 0이라 걸린다 — 2H와 여유 2.1배.
  // ⚠ 픽스처는 지평선 y=400 한 점이다 — 커버리지 위상은 dpr 둘로만 훑었다(AS-C22).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선만 — 다른 잉크가 안 섞이게
  await page.mouse.move(600, 700)                    // 커서 표식이 띠에 안 걸리게
  await settle(page)

  const perCol = await page.evaluate(() => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(200 * dpr), Math.round(396 * dpr),
      Math.round(800 * dpr), Math.round(8 * dpr)).data
    let sum = 0
    for (let i = 3; i < d.length; i += 4) sum += d[i]!
    return sum / (dpr * dpr) / 800
  })
  console.log(`[측정] 지평선 열당 잉크량 ${perCol.toFixed(1)}`)
  horizonInk = perCol
  // web2-12 7번 — 작도 대역으로 더 내렸다(COL.horizon — 토글이 하한 논리를 풀었다).
  // 대역: 위 110(직전 값 2H급 128이 걸린다 — 되돌리면 실패) · 아래 30(안 그려지면 0).
  expect(perCol).toBeLessThan(110)
  expect(perCol).toBeGreaterThan(30)

  // 토글(web2-12 7번) — 끄면 지평선 픽셀이 **0**이다(반증 D-3: 남으면 여기서 걸린다)
  await page.click('#btn-display')                    // 표시는 눈 팝업(web2-19 3-a)
  await page.click('#chk-horizon')
  await page.mouse.move(600, 700)
  await settle(page)
  const offBand = await page.evaluate(() => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(200 * dpr), Math.round(396 * dpr),
      Math.round(800 * dpr), Math.round(8 * dpr)).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  })
  console.log(`[측정] 지평선 토글 끔 — 띠 painted ${offBand}`)
  horizonOff = offBand
  expect(offBand).toBe(0)
  await page.click('#chk-horizon')   // 되돌린다(기본 켜짐)
  await settle(page)
})
test('**오스냅 기호가 무채색이다** — 픽셀 채도로 잰다 (web2-08 지시 2)', async ({ page }) => {
  // 재현: 오스냅 표식이 초록(#1a9c50)이었다 — 채도가 있으니 모델링 툴의 표식으로 읽힌다.
  // 종류 구분은 이미 **형태**가 한다(□◆△✕⊥▫○ — Rhino 관행). 색은 정보가 아니었다.
  // 좌표·개수로는 안 보인다 — 채도는 픽셀에만 있다(#64 · 지시 「픽셀로 확인한다」).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 300)

  // 끝점 (500,300) 둘레 — 소실점 ✕(작도색 #8a7f6a·유채색)가 안 걸리는 자리다
  const box = async () => page.evaluate(() => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(488 * dpr), Math.round(288 * dpr),
      Math.round(24 * dpr), Math.round(24 * dpr)).data
    let painted = 0, chroma = 0, inkw = 0, dark = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! === 0) continue
      painted++
      inkw += d[i + 3]! / 255                       // 잉크 무게 — 알파 합
      const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!
      // 어두움 무게 — (255−밝기)·알파. **색과 알파 둘 다에 반응한다** — 알파 합만으로는
      // #555 → #9c9c9c(색이 옅어진 몫)가 안 잡힌다(2차 리뷰어 [1]).
      dark += (255 - (r + g + b) / 3) / 255 * (d[i + 3]! / 255)
      chroma = Math.max(chroma, Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
    }
    return { painted, chroma, inkw, dark }
  })

  await page.mouse.move(200, 700)
  await settle(page)
  const away = await box()
  await page.mouse.move(500, 300)                 // 끝점 오스냅이 잡힌다
  await settle(page)
  const on = await box()
  const markPx = on.painted - away.painted
  const markMeanA = (on.inkw - away.inkw) / markPx  // 표식 몫의 평균 알파(0~1)
  const markMeanD = (on.dark - away.dark) / markPx  // 표식 몫의 평균 어두움(0~1 — 색·알파 모두)
  console.log(`[측정] 오스냅 잉크 away ${away.painted} → on ${on.painted} (표식 몫 ${markPx}) · 표식 평균 알파 ${markMeanA.toFixed(3)} · 평균 어두움 ${markMeanD.toFixed(3)} · 채도 ${on.chroma}`)
  // ① 표식이 실제로 그려졌다 — 이것이 없으면 «채도 0»이 «아무것도 없음»과 안 갈린다(D-3)
  expect(on.painted).toBeGreaterThan(away.painted + 20)
  // ①′ **2H 급이다**(web2-10 지시 6) — 진하기는 픽셀 «수»가 아니라 **알파**에 실린다
  //    (수리 전후 painted는 62/253으로 같았다 — 면적은 안 변하고 무게가 변한다).
  //    상한 0.6 — 실측 사이다: 2H는 0.388/0.381(dpr1/2), 불투명은 0.775(반증 실행 —
  //    AA 가장자리가 1.0을 희석한다). 양쪽에서 0.19/0.17 여유. 하한 0.25는 «안 보임» 쪽 반증.
  expect(markMeanA).toBeLessThan(0.6)
  expect(markMeanA).toBeGreaterThan(0.25)
  // ①″ **어두움**은 색까지 잰다(2차 [1] — 알파 지표는 #555→#9c9c9c 색 몫에 판별력 0이다).
  //    실측: 옛 #555 불투명 0.518/0.507 · 2H 0.153/0.149(dpr1/2 — 옛 코드를 되살린 반증
  //    실행에서 dpr 둘 다 실패를 확인했다). 상한 0.3은 그 사이(여유 0.15 안팎) ·
  //    하한 0.05는 «안 보임» 쪽 반증.
  expect(markMeanD).toBeLessThan(0.3)
  expect(markMeanD).toBeGreaterThan(0.05)
  // ② 무채색이다 — 수리 전(초록 #1a9c50)은 채널 차가 **130** 급이라 여기서 걸린다.
  //    12는 AA 혼합 잡음 여유다(획·지평선은 전부 무채색 회색이라 배경 몫이 0이다).
  expect(on.chroma).toBeLessThanOrEqual(12)
  // 대조군: 커서가 멀 때도 채도가 없다(배경이 이미 무채색임을 함께 박는다)
  expect(away.chroma).toBeLessThanOrEqual(12)
})
