// web2-12 2번 — 미리보기 게이트: **떼는 순간 아무 일도 안 일어나야 한다.**
// CLAUDE.md 「전환이 무변화이므로 그 순간을 인지하지 못한다」의 미리보기→확정 판이다.
//
// 재는 것 넷:
//   ① 뗌 직전/직후 — 합성 화면(스크린샷)의 가운데 상자 diff. **재료 전수**(GRADES 일곱 —
//      draft 경로가 재료로 갈리므로 #67 구멍②의 축이다. INK는 brush 밖 — 그 행이 그 갈림의
//      직접 표본이다) + classic HB(옛 경로 대비군 — 상대 문턱의 분모).
//   ② 잠정 id 연속 — 뗌 직전 draft.nid == 확정 획 id (상시 단언 + 원장 — 2차 [11]).
//   ③ 반짝임(시드 축) — **같은 기하에서 재그리기를 강제한** 두 프레임이 같다(2차 [3]:
//      정지 두 프레임 0은 캐시 스킵의 항등이라 시드를 못 잰다 — 강제 재그리기가 판별자다.
//      시드가 프레임에 실리면 이 diff가 상자를 뒤집는다).
//   ④ 연장 카나리아 — 획을 늘릴 때 앞부분 재배치의 상한(시드와 무관한 브러시 성질 —
//      실기기 판정 행은 DEFERRED).
//
// 허용 오차의 근거·실측은 stage0/out/draft_gate_web2*.json이 정본(#47) —
// 임계는 thresholds.ts(단일 출처 D-C4)에서 오고 원장 thresholds 블록으로 그대로 나간다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PIXEL_DIFF_CH, GATE } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/draft_gate_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-12 2번 — 미리보기→확정 게이트(${testInfo.project.name}): 뗌 직전/직후 합성 화면의 가운데 상자(20×50 CSS px) diff(채널 차 ${PIXEL_DIFF_CH} 초과 픽셀 수) · 잠정 id 연속 · 강제 재그리기 동일성. e2e draftgate.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: 'stroke_px = «뗌 직전»(펜 닿음·최종 위치) 프레임의 빈 화면 대비 변화 픽셀 — 분모가 그 경로의 미리보기가 그린 것에 걸리므로 경로가 다른 팔끼리 분모가 다르다(2차 [7]). release_diff = 뗌 직전 대비 뗀 직후. 상자는 획 가운데 — 끝점 표식·축 안내(양끝 너머)는 밖이다. diff 0은 «채널 차 문턱 이하»라는 뜻이지 비트 동일이 아니다.',
    thresholds: GATE,
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
    if (Math.abs(b[i]! - a[i]!) > PIXEL_DIFF_CH || Math.abs(b[i + 1]! - a[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(b[i + 2]! - a[i + 2]!) > PIXEL_DIFF_CH) n++
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

/** 앵커 위 (x,560)→(x,470) 세로 획 — 뗌 직전/직후 상자와 잠정 id 연속을 잰다 */
async function releaseDiff(page: Page, x: number) {
  const box = [x - 10, 490, 20, 50] as const
  const empty = await shot(page, ...box)
  await page.mouse.move(x, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, 560 - 9 * i)
  await settle(page)
  const nid = await page.evaluate(() => (window as any).__b2.diag.draft()?.nid ?? null)
  const before = await shot(page, ...box)
  await page.mouse.up(); await settle(page)
  const after = await shot(page, ...box)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { id: s.id, lifted: a.lift.lifted.has(s.id) }
  })
  return { strokePx: diffCount(empty, before), diff: diffCount(before, after),
    lifted: st.lifted, nid, id: st.id }
}

const GRADES = ['2H', 'H', 'F', 'HB', 'B', '2B', 'INK'] as const

/** 연필통이 접혀 있다(web2-19 3-b') — 경도 행은 연필을 눌러 열고 고른다(고르면 접힌다) */
async function pickGrade(page: Page, g: string) {
  if (await page.locator('#tray.open').count() === 0) await page.click('#btn-pencil')
  await page.click(`#tray-${g}`)
}


test('게이트 ① ② — 뗌 직전/직후(재료 전수) · 잠정 id 연속 · 옛 경로(classic)는 크게 변한다', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page)
  await fixture(page)

  const rows: Record<string, unknown> = {}
  const out: string[] = []
  const diffs: Record<string, { diff: number; strokePx: number }> = {}
  for (let i = 0; i < GRADES.length; i++) {
    const g = GRADES[i]!
    // 연필통(web2-12 6번 → 3-b' 접힘) — 행이 도구이자 경도다: 여는 것까지가 사람의 경로다
    if (g === 'INK') await page.click('#btn-pen')
    else await pickGrade(page, g)
    await settle(page)
    const r = await releaseDiff(page, 330 + i * 50)
    expect(r.lifted, `${g} 승격 — 픽스처 판별력`).toBe(true)
    expect(r.nid, `${g} 잠정 id == 확정 id(2차 [11] — 시드 연속의 상시 단언)`).toBe(r.id)
    rows[g] = { stroke_px: r.strokePx, release_diff: r.diff, nid_equals_id: r.nid === r.id }
    diffs[g] = { diff: r.diff, strokePx: r.strokePx }
    out.push(`${g} ${r.diff}/${r.strokePx}`)
  }
  await pickGrade(page, 'HB'); await settle(page)

  // classic(옛 경로 — 비교 기준): 벡터 미리보기 → 뗌에 질감(grain)·Line2가 나타난다
  await page.evaluate(() => (document.getElementById('btn-brush') as HTMLButtonElement).click()); await settle(page) // 3-c: 설정 안 — DOM click(배선 동일)
  const classic = await releaseDiff(page, 330 + 7 * 50)
  expect(classic.lifted).toBe(true)
  await page.evaluate(() => (document.getElementById('btn-brush') as HTMLButtonElement).click()); await settle(page) // 3-c: 설정 안 — DOM click(배선 동일)

  console.log(`[측정] 뗌 게이트 — ${out.join(' · ')} · classic HB ${classic.diff}/${classic.strokePx}`)
  ledger['release'] = {
    ...rows,
    classic_hb: { stroke_px: classic.strokePx, release_diff: classic.diff },
    note: '잔차 = 몸체·질감의 렌더러 교대 몫(draft: 몸체 겹 벡터 + 질감, 확정: Line2 + 질감 — 같은 색·알파·굵기·시드). INK의 낮은 값은 실측이다(2D 벡터 → Line2 — 다른 래스터라이저가 채널 문턱 이하로 일치). classic은 옛 경로라 뗌에 질감이 «나타난다» — 이 대비가 게이트의 판별력이다(되돌리면 절대·상대 문턱이 잡는다).',
  }
  for (const g of GRADES) {
    expect(diffs[g]!.diff, `${g} 절대 게이트`).toBeLessThan(diffs[g]!.strokePx * GATE.ABS)
    expect(diffs[g]!.diff, `${g} 상대 게이트(옛 경로 대비)`).toBeLessThan(classic.diff * GATE.REL)
  }
  expect(classic.diff).toBeGreaterThan(0) // 대비군이 실제로 변한다 — 분모의 판별력
})

test('필압 — 점별 필압이 미리보기에 실린다(펜 CDP force 변주 · 확정과 같은 값으로 이어진다)', async ({ page }) => {
  // 지시 38행의 목적 축(2차 [10] — 헤드리스 마우스는 pressure 상수 0.5라 이 축을 못 잰다).
  // CDP로 힘을 0.2→0.9로 올리며 긋고 ① draft.press가 실제로 변하는 값인가(배선이 아니라 값)
  // ② 픽셀로 갈리는가(약한 반절 vs 센 반절의 칠해진 양) ③ 확정 rawIn.press와 같은가(연속).
  await boot(page)
  await fixture(page)
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 520, y: 560, ...pen, force: 0.2 })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: 520, y: 560 - 9 * i, ...pen, force: 0.2 + 0.07 * i,
    })
  }
  await settle(page)
  const draft = await page.evaluate(() => {
    const d = (window as any).__b2.diag.draft()
    return d ? { press: [...(d.press ?? [])], nid: d.nid } : null
  })
  const low = await shot(page, 510, 535, 20, 20)   // 시작 쪽(힘 약함)
  const high = await shot(page, 510, 480, 20, 20)  // 끝 쪽(힘 셈)
  // 판별 지표는 «개수»가 아니라 **잉크량**(어두움 합) — 상자를 관통하는 선은 개수가
  // 포화된다(초판 실측: 약/센 둘 다 40 — 판별력 0. 굵기·진하기는 어두움 합이 잰다).
  const mass = (arr: number[]) => {
    let s = 0
    for (let i = 0; i < arr.length; i += 4) s += Math.max(0, 245 - Math.min(arr[i]!, arr[i + 1]!, arr[i + 2]!))
    return Math.round(s / 255)
  }
  const lowPx = mass(low)
  const highPx = mass(high)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 520, y: 470, ...pen, force: 0 })
  await settle(page)
  const committed = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { id: s.id, press: s.rawIn?.press ? [...s.rawIn.press] : null }
  })
  const uniq = new Set(draft?.press ?? []).size
  console.log(`[측정] 필압 — draft press n ${draft?.press.length} 서로다른값 ${uniq} · 약반절 잉크량 ${lowPx} 센반절 ${highPx} · 확정 rawIn ${committed.press ? '있음' : '없음'}`)
  ledger['pressure'] = {
    n: draft?.press.length ?? 0, distinct: uniq, low_half_mass: lowPx, high_half_mass: highPx,
    committed_equals_draft: !!committed.press && JSON.stringify(committed.press) === JSON.stringify(draft?.press),
    note: 'CDP force 0.2→0.9 램프. distinct>3 = 배선이 아니라 변하는 값이 실렸다. mass = 상자 어두움 합(개수는 관통선에서 포화된다 — 초판 반증) — 힘이 센 쪽이 굵고/진해 잉크량이 커야 픽셀 판별이 선 것. committed_equals_draft = 뗌에서 같은 배열로 이어진다(양자화가 한 곳 — quantIn과 같은 식).',
  }
  expect(draft?.press.length ?? 0).toBeGreaterThan(3)
  expect(uniq).toBeGreaterThan(3)                        // 상수가 아니다 — 값이 실렸다
  expect(highPx).toBeGreaterThan(lowPx * 1.15)           // 힘이 센 쪽의 잉크량이 뚜렷이 크다
  expect(committed.press, '확정 rawIn.press가 있다').not.toBeNull()
  expect(committed.press).toEqual(draft?.press)          // 미리보기 값이 그대로 확정된다
})

test('게이트 ③ ④ — 강제 재그리기 두 프레임이 같다(시드 축) · 정지 무변화 · 연장 카나리아', async ({ page }) => {
  await boot(page)
  await fixture(page)
  const box = [470, 500, 20, 40] as const   // 획 아랫부분(먼저 그어진 구간)
  await page.mouse.move(480, 560); await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(480, 560 - 9 * i)
  await settle(page)
  const a = await shot(page, ...box)
  // 정지 — 입력이 없는 두 프레임(캐시 키에 프레임이 안 실린다는 «스킵» 확인.
  // ⚠ 이것만으로는 시드를 못 잰다 — 재그리기가 0회면 동일은 항등이다. 2차 [3])
  await settle(page); await settle(page)
  const still = diffCount(a, await shot(page, ...box))
  // **강제 재그리기** — 1px 갔다가 제자리로(이동 둘 = 재그리기 둘 · 기하는 원위치).
  // 시드가 프레임(재그리기 횟수)에 실리면 질감이 재배치돼 이 diff가 상자를 뒤집는다 —
  // 반증 실행이 그것을 실제로 보인다(원장 falsification 참조).
  await page.mouse.move(481, 560 - 54); await page.mouse.move(480, 560 - 54)
  await settle(page)
  const redrawn = diffCount(a, await shot(page, ...box))
  // 연장 — 앞부분 상자는 기하가 안 변하지만 브러시가 전장을 파라미터로 삼아 재배치된다
  for (let i = 7; i <= 10; i++) await page.mouse.move(480, 560 - 9 * i)
  await settle(page)
  const grow = diffCount(a, await shot(page, ...box))
  await page.mouse.up(); await settle(page)
  console.log(`[측정] 시드·반짝임 — 정지 ${still} · 강제 재그리기 ${redrawn} · 연장 후 앞부분 ${grow}`)
  ledger['flicker'] = { still_frames_diff: still, forced_redraw_diff: redrawn, grown_front_diff: grow,
    box_px: 20 * 40,
    note: 'forced_redraw_diff가 시드 축의 판별자다(같은 기하·재그리기 강제 — 시드가 프레임에 실리면 상자가 뒤집힌다. 반증 실행 기록은 NOTES). still 0은 캐시 스킵의 확인이지 시드 측정이 아니다(2차 [3]). grown_front_diff는 시드와 무관한 브러시 성질(전장 파라미터화 — 실기기 판정 행은 DEFERRED). 두 상한의 분모는 찍힌 이미지의 실픽셀 수(box_px × dpr²)다.' }
  expect(still).toBe(0)
  // 강제 재그리기 후 동일(시드 고정) — 1px 왕복의 AA 잔차 허용치는 상자의 5%(실측 0 대역)
  expect(redrawn).toBeLessThan((a.length / 4) * 0.05)
  expect(grow).toBeLessThan((a.length / 4) * GATE.GROW_CANARY)
})
