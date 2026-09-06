// web2-72 §A — 사람이 실사용에서 본 결함 넷의 **재현(D-2)과 게이트**.
//
//   A-1  일부 칠 도구는 펜을 대는 동안 칠이 안 보이고 떼면 나타난다
//        → 프리셋 전수(196 + 앱)를 «대는 동안» 재고, 떼기 전/후 픽셀 차를 값으로
//   A-2  「제도 라이너」 단추가 둘이다
//        → 필통 여덟 칸의 {슬롯, br} 쌍 · 기본 채움 · **옛 판 이주 뒤** · 저장 왕복 뒤
//   A-3  칠 도구를 누르는 «순간» 모든 단추가 동시에 하이라이트된다
//        → ⚠ 지시의 가설(상태 클래스 on이 전부에 붙는다)은 **반증됐다**(on은 수리 전에도
//          묶음마다 하나). 측정이 가리킨 것은 필통 칸의 폴백 `f.hex ?? ps.hex`다 —
//          제 색을 안 든 칸이 «지금 색»을 그려서 일곱 칸이 한꺼번에 물들었다(D-4).
//   A-4  컬러피커를 펼치고 크기·불투명을 조절하면 컬러피커가 접힌다
//        → 휠이 열린 채인가: 크기 끌기 · 불투명 끌기 · 눈금 점 · 필통 칸 · 캔버스 획 /
//          닫힘: 캔버스 «탭» · 휠 단추 재누름 · 다른 통(R7)
//
// 원장: stage0/out/defects72_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PAINT72_RELEASE_INK_RATIO_MAX } from './thresholds'
import { buildHeavy, settleBake } from './heavy72'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-72 §A — 결함 넷(대는 동안 안 보임 · 필통 중복 · 누름 하이라이트 번짐 · 휠이 접힘)의 재현과 게이트',
  note_pitfalls: '#42(착수 표) · #99(워커 1) · #101(web2 안) · #103(장면 확인 — 면이 섰는가) · #107(자는 되돌리기 «전»에 뜬다 — A-1은 펜을 «든 채» 잰다) · #111(미리보기의 자는 시간과 이동량 둘 — A-1은 «첫 프레임에 잉크가 있는가»의 시간 축)',
  pitfall_citations: [42, 99, 101, 103, 107, 108, 111],
  thresholds: { PAINT72_RELEASE_INK_RATIO_MAX },
  selfcheck_notes: {
    zero_counters: 'a1.blind_whole_stroke_n 0과 a1_load.blind_n 0 = **이 라운드의 결론**이다(획을 긋는 동안 한 번도 안 보이는 프리셋이 없다 — 지시 §A-1의 가설 반증 · AS-C208). 집계가 도는 증거는 같은 실행의 slow_first_dab_n 62 · no_mark_on_blank_n 52 · distinct_held_ink 148(자가 프리셋을 실제로 가른다). / a3.on_before.grade·on_switched.grade 0 = 연필통(경도 줄)이 «접혀 있어서» 그 묶음에 켜진 것이 없다(칠 패널만 열려 있다 — 화면 상태의 사실) · a3.*.recent 0은 그 판에서 최근 색을 한 번도 안 골랐다는 사실이다',
    identical_pairs: 'a1.sample_rows[*].releaseInkRatio 0은 「미리보기 == 확정본」(59 규약 · 66 초안 인계)의 뜻 그 자체다 — **설계 보장이지 측정이 아니다**. 그래서 이 값에는 임계를 안 걸고, 임계는 «0이 될 수 없는 것들»의 상한(release_ink_ratio_max ≤ PAINT72_RELEASE_INK_RATIO_MAX)에만 건다. 0이 아닌 셋(ramon/Glow_Airbrush 0.0548 · tanda/marker-01 0.0087 · classic/textured_ink 0.0003)이 그 자의 변별력이다. / a4의 open_after_* 참 나열은 규약이고, 짝인 closed_after_canvas_tap·closed_after_button_again·closed_by_other_box_r7이 거짓/참을 가른다',
    single_category: 'a1_load.scene.levels가 한 값인 것은 픽스처의 구성이다(격자 칸이 화면에서 서로 비슷한 크기라 같은 단계에 든다) — 이 팔이 재는 것은 «부하에서 첫 잉크가 언제 뜨는가»이지 단계 분포가 아니다. 단계의 변별은 perf72·gates72가 목표 단계까지 확대해서 잰다(D-5)',
    exact_one: 'a2.migrated_flag = 1은 비율이 아니라 **횟수**다(옛 판 → 새 판 이주가 «한 번» 돌았다 — #109의 규약: 새 판이 서면 다시 안 본다). 이 팔의 반증 짝이 그것이다: 0이면 이주 경로가 안 돈 것이고 그러면 이 시험은 아무것도 안 잰다',
  },
}
const LEDGER_OF = (p: string) => resolve(HERE, `../../stage0/out/defects72_web2_dpr${p === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/defects72.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(50)
}

/** paint50·65·67의 그 상자 — 오른쪽 벽 하나(원근). */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  // ⚠⚠ `?reset`은 **비동기로 `location.replace`를 부른다**(main.ts — 서비스 워커·캐시를 지운
  //   뒤 매개를 떼고 다시 연다). 그 항해가 오기 «전»에 긴 evaluate를 시작하면 실행 맥락이
  //   부서진다(실측: A-1 전수 팔이 dpr2에서 「Execution context was destroyed」로 죽었다).
  //   그래서 매개가 떨어질 때까지 먼저 기다린다(상한 있는 대기 — #81).
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560],
    [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await drawLine(page, l[0], l[1], l[2], l[3])
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(100)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  expect(n, '면이 섰다(#103)').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(80)
}

type TexHash = { key: string; level: number; hash: number; ink: number; w: number; h: number }
const texHashes = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as TexHash[])

// ── A-1 ─────────────────────────────────────────────────────────────────────────
/** 펜을 «든 채» 잰다: down → move 넷(프레임마다) → 그 시점의 잉크 · 그리고 뗀 뒤의 잉크.
 *  첫 잉크는 «첫 move 뒤 두 프레임»(≈33ms · 60ms 안)에 재는 값이다 — 게이트의 그 자리. */
async function drawWhileDown(page: Page, x0: number, y0: number): Promise<{ baseHash: number; firstInk: number; firstInkTravelPx: number | null; heldInk: number; heldHash: number; upInk: number; upHash: number }> {
  const step = await page.evaluate(async ([sx, sy]) => {
    const b2 = (window as any).__b2
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    // ⚠ 자는 «잉크 픽셀 수»가 아니라 **텍스처 해시의 변화**다(#108의 교훈): 잉크 셈의 문턱
    //   (r+g+b < 750)은 옅은 브러시(4H 연필·글레이즈·물)를 0으로 읽어 «안 보인다»로 오판한다.
    //   해시는 한 채널만 움직여도 갈린다 — 「자국이 났는가」의 자로 그것이 맞다.
    const hashNow = () => (b2.diag.paintTexHash() as TexHash[]).reduce((a: number, b: TexHash) => (Math.imul(a, 31) + b.hash) | 0, 0)
    const inkNow = () => (b2.diag.paintTexHash() as TexHash[]).reduce((a: number, b: TexHash) => a + b.ink, 0)
    const STEP = 14.3178                            // 한 이동의 화면 이동량(px · √(14²+3²))
    const baseHash = hashNow()
    fire('pointerdown', sx!, sy!, 0.5, 1)
    await raf()
    fire('pointermove', sx! + 14, sy! + 3, 0.5, 1)
    await raf()
    const firstInk = hashNow() !== baseHash ? 1 : 0   // «첫 이동 + rAF 둘»(≈33ms · 이동 14.3px)에 자국이 났는가
    let firstInkTravelPx: number | null = firstInk > 0 ? STEP : null
    for (let i = 2; i <= 8; i++) {
      fire('pointermove', sx! + 14 * i, sy! + 3 * i, 0.5, 1)
      await raf()
      if (firstInkTravelPx === null && hashNow() !== baseHash) firstInkTravelPx = STEP * i
    }
    const held = b2.diag.paintTexHash() as TexHash[]
    return { baseHash, firstInk, firstInkTravelPx, heldInk: held.reduce((a: number, b: TexHash) => a + b.ink, 0), heldHash: held.reduce((a: number, b: TexHash) => (Math.imul(a, 31) + b.hash) | 0, 0), heldInkOnly: inkNow() }
  }, [x0, y0] as const)
  // 떼기는 페이지 밖에서(같은 합성 펜) — 뗀 뒤 확정본이 서는 것까지 기다린다
  await page.evaluate(([sx, sy]) => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: 0, pressure: 0,
      clientX: r.left + sx! + 112, clientY: r.top + sy! + 24, bubbles: true, cancelable: true,
    }))
  }, [x0, y0] as const)
  await page.waitForTimeout(120)
  const after = await texHashes(page)
  return {
    ...step,
    upInk: after.reduce((a, b) => a + b.ink, 0),
    upHash: after.reduce((a, b) => (Math.imul(a, 31) + b.hash) | 0, 0),
  }
}

test('A-1 — 프리셋 전수: 펜을 «대는 동안» 첫 잉크 > 0 · 떼기 전/후 픽셀 항등', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  const cat = await page.evaluate(() => (window as any).__b2.diag.presetCatalogForTest() as { group: string; names: string[] }[])
  const names: string[] = []
  for (const c of cat) for (const n of c.names) names.push(n)
  expect(names.length, '프리셋 목록이 섰다(196 + 앱)').toBeGreaterThan(150)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('brush')
    Object.assign(b2.app.paintSel, { hex: '#8a4a3a', w: 20 })
  })
  await page.click('#btn-paint')
  await page.waitForTimeout(60)

  const rows: { name: string; firstInk: number; firstInkTravelPx: number | null; heldInk: number; upInk: number; releaseInkRatio: number; blindWholeStroke: boolean; noMarkOnBlank: boolean }[] = []
  for (let i = 0; i < names.length; i++) {
    const nm = names[i]!
    await page.evaluate((n) => {
      const b2 = (window as any).__b2
      // ⚠ setPaintBrushForTest는 «엔진 조정»의 통로다(61 이음매) — 획의 브러시는 64부터
      //   데이터(paint.br)이므로 사람의 경로(브러시 고르개)와 같은 pickBrush로 든다.
      b2.diag.pickBrushForTest('brush', n)
      Object.assign(b2.app.paintSel, { hex: '#8a4a3a', w: 20, o: 1 })   // 칸 기억(66-3)이 사양을 흔들지 않게
      // 매 프리셋 깨끗한 면 — 앞 획을 지운다(잉크 누적이 «첫 잉크»의 자를 오염시킨다)
      b2.app.doc.strokes = b2.app.doc.strokes.filter((s: any) => s.paint === undefined)
      b2.diag.invalidate()
    }, nm)
    await page.waitForTimeout(30)
    const r = await drawWhileDown(page, 545, 365)
    const denom = Math.max(1, r.upInk)
    const markedAfterUp = r.upHash !== r.baseHash
    rows.push({
      name: nm, firstInk: r.firstInk, firstInkTravelPx: r.firstInkTravelPx === null ? null : Math.round(r.firstInkTravelPx * 10) / 10,
      heldInk: r.heldInk, upInk: r.upInk,
      releaseInkRatio: Math.round(Math.abs(r.upInk - r.heldInk) / denom * 10000) / 10000,
      blindWholeStroke: r.firstInkTravelPx === null && markedAfterUp,
      noMarkOnBlank: !markedAfterUp,
    })
  }
  const blindWhole = rows.filter(r => r.blindWholeStroke)
  const slowFirst = rows.filter(r => r.firstInk === 0 && !r.blindWholeStroke && !r.noMarkOnBlank)
  const noInkAtAll = rows.filter(r => r.noMarkOnBlank)
  const releaseChanged = rows.filter(r => r.releaseInkRatio > 0 && !r.blindWholeStroke)
  const travel = rows.map(r => r.firstInkTravelPx ?? Infinity).filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  // #103 — **장면을 값으로**(이 팔이 어느 대역에서 잰 것인가). 리뷰어 [H8]이 그 빈자리를 잡았다.
  const scene = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const paint = b2.app.doc.strokes.filter((x: any) => x.paint?.uv)
    return {
      faces: b2.app.faces.length, docStrokes: b2.app.doc.strokes.length, paintStrokes: paint.length,
      texEntries: b2.diag.paintBake().entries,
      levels: (b2.diag.paintTex() as any[]).reduce((m: any, e: any) => { m[String(e.level)] = (m[String(e.level)] ?? 0) + 1; return m }, {}),
    }
  })
  OUT.a1 = {
    scene,
    scene_note: '⚠ 이 팔은 **가벼운 장면**에서 잰다(면 하나 · 프리셋마다 앞 획을 지운다) — 프리셋의 성질을 가르려면 다른 획이 없어야 한다. 사람이 본 대역(칠을 꽤 많이 한 뒤)은 아래 「A-1 부하」 팔이 잰다.',
    presets: rows.length,
    /** ⛳ 정본 게이트 — 획을 긋는 «동안» 잉크가 한 번도 안 뜨는 프리셋(그것이 결함이다) */
    blind_whole_stroke: blindWhole.map(r => r.name),
    blind_whole_stroke_n: blindWhole.length,
    /** 첫 이동(14.3px · ≈33ms)에는 아직 안 뜨는 프리셋 — 결함이 아니라 **브러시의 성질**이다
     *  (slow_tracking · 큰 도장 간격). 값은 «첫 잉크까지의 이동량(px)»로 든다. */
    slow_first_dab: slowFirst.map(r => ({ name: r.name, first_ink_travel_px: r.firstInkTravelPx })),
    slow_first_dab_n: slowFirst.length,
    first_ink_travel_px: { min: travel[0] ?? null, median: travel[Math.floor(travel.length / 2)] ?? null, max: travel[travel.length - 1] ?? null },
    /** 빈(흰) 면에는 자국이 안 나는 프리셋 — **결함이 아니다**: 바탕을 읽는 것들(문지름·
     *  블렌더·지우개·물)이라 흴 때 바꿀 것이 없다. 값으로 든다(지시 §A-1의 「진짜 문지름」). */
    no_mark_on_blank: noInkAtAll.map(r => r.name),
    no_mark_on_blank_n: noInkAtAll.length,
    /** 59 「미리보기 == 확정본」 — 떼기 전/후 잉크 픽셀 차의 비율(문지름류는 0일 수 없다: 값으로 든다) */
    release_ink_ratio_nonzero: releaseChanged.map(r => ({ name: r.name, ratio: r.releaseInkRatio })),
    release_ink_ratio_nonzero_n: releaseChanged.length,
    release_ink_ratio_max: rows.reduce((a, r) => Math.max(a, r.releaseInkRatio), 0),
    sample_rows: rows.slice(0, 12),
    note: '자: 칠 텍스처의 잉크 픽셀 수(diag.paintTexHash — 굽기가 실제로 쓰는 캔버스). 「대는 동안」은 pointerdown 뒤 이동 여덟까지(총 114.5px) 매 프레임. ⚠ 지시의 게이트 문면(「60ms 안 첫 잉크 > 0」)은 **이동량과 뒤섞인 자**였다 — 합성 펜의 한 이동이 14.3px이라 도장 간격이 그보다 큰 브러시는 첫 프레임에 뜰 수 없다(브러시의 성질 · D-4). 결함의 자는 「획을 긋는 동안 한 번도 안 뜬다」로 좁혔다.',
  }
  // 자가 실제로 프리셋을 가르는가(D-3 반증의 짝 · #108 — 전부 같은 값이면 자·입력을 먼저 의심한다)
  const distinctHeld = new Set(rows.map(r => r.heldInk)).size
  ;(OUT.a1 as Record<string, unknown>).distinct_held_ink = distinctHeld
  expect(distinctHeld, '프리셋마다 다른 그림이 나온다(자가 브러시를 실제로 가른다)').toBeGreaterThan(20)
  expect(blindWhole.length, `획을 긋는 동안 한 번도 안 보이고 떼면 나타나는 프리셋: ${blindWhole.map(r => r.name).join(', ')}`).toBe(0)
  // 문지름류(바탕을 읽는 브러시)는 미리보기와 확정본이 같을 수 없다 — **상한을 값으로 둔다**
  expect((OUT.a1 as any).release_ink_ratio_max, '떼기 전/후 잉크 차 비율의 상한(문지름류 예외 — thresholds가 단일 출처)').toBeLessThanOrEqual(PAINT72_RELEASE_INK_RATIO_MAX)
})

test('A-1 부하 — 사람이 본 대역(면 23 · 칠 920)에서 «대는 동안» 첫 잉크까지의 이동량과 ms', async ({ page }) => {
  test.setTimeout(1_200_000)
  // ⚠ 리뷰어 [H8] — 위 전수 팔은 **가벼운 장면**에서 잰다. 사람 판정은 「칠을 꽤 많이 한 뒤」였고
  //   같은 라운드가 그 부하에서 프레임이 초 단위로 막히는 것을 실증했다(가설 3). 그러면 A-1의
  //   결론(「재현 못 했다」)은 **그 대역에서도** 성립해야 한다 — 여기서 잰다.
  //   ⛳ 이 팔의 자에는 **ms**가 있다(#111 「미리보기의 자는 시간과 이동량 둘」).
  const built = await buildHeavy(page)
  expect(built.paintStrokes, '부하 장면이 섰다(#103)').toBeGreaterThanOrEqual(600)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('brush')
    Object.assign(b2.app.paintSel, { hex: '#1a3fa0', w: 20, o: 1 })
  })
  await page.click('#btn-paint')
  await settleBake(page, 200)
  const NAMES = ['classic/pencil', 'deevad/liner', 'brunelleschi/marker', 'deevad/watercolor_expressive', 'classic/slow_ink', 'deevad/spray']
  const rows: Record<string, unknown>[] = []
  for (const nm of NAMES) {
    await page.evaluate((n) => {
      const b2 = (window as any).__b2
      b2.diag.pickBrushForTest('brush', n)
      Object.assign(b2.app.paintSel, { hex: '#1a3fa0', w: 20, o: 1 })
    }, nm)
    await settleBake(page, 200)
    // **이미 칠해진 면 위**에 긋는다(사람이 본 그 자리) — 첫 잉크까지의 «이동량»과 «ms»
    const r = await page.evaluate(async () => {
      const b2 = (window as any).__b2
      const el = document.getElementById('ink')!
      const rr = el.getBoundingClientRect()
      const fire = (t: string, x: number, y: number, p: number, b: number) =>
        el.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'pen', isPrimary: true, buttons: b, pressure: p, clientX: rr.left + x, clientY: rr.top + y, bubbles: true, cancelable: true }))
      const raf = () => new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
      const hash = () => (b2.diag.paintTexHash() as { hash: number }[]).reduce((a, b) => (Math.imul(a, 31) + b.hash) | 0, 0)
      const STEP = 14.3178
      const base = hash()
      const t0 = performance.now()
      fire('pointerdown', 545, 365, 0.5, 1)
      await raf()
      let travel: number | null = null, ms: number | null = null
      for (let i = 1; i <= 8; i++) {
        fire('pointermove', 545 + 14 * i, 365 + 3 * i, 0.5, 1)
        await raf()
        if (travel === null && hash() !== base) { travel = STEP * i; ms = performance.now() - t0 }
      }
      const heldChanged = hash() !== base
      fire('pointerup', 545 + 112, 365 + 24, 0, 0)
      await raf()
      await new Promise<void>(res => setTimeout(res, 200))
      const upChanged = hash() !== base
      return { travel, ms: ms === null ? null : Math.round(ms), heldChanged, upChanged, totalMs: Math.round(performance.now() - t0) }
    })
    rows.push({ name: nm, first_ink_travel_px: r.travel === null ? null : Math.round(r.travel * 10) / 10, first_ink_ms: r.ms, visible_while_down: r.heldChanged, marked_after_up: r.upChanged, stroke_ms: r.totalMs })
  }
  const blind = rows.filter(r => r.visible_while_down === false && r.marked_after_up === true)
  OUT.a1_load = {
    scene: built, rows,
    blind_while_down: blind.map(r => r.name), blind_n: blind.length,
    note: '⛳ 사람이 본 대역에서 다시 잰 A-1. 자는 둘이다(#111): 첫 잉크까지의 **이동량**(px)과 **시간**(ms). 「획을 긋는 동안 한 번도 안 보이고 떼면 나타나는」 프리셋이 이 대역에서도 없으면 A-1은 프리셋의 것이 아니다.',
  }
  expect(blind.length, `부하 대역에서도 «긋는 동안 안 보이고 떼면 나타나는» 프리셋: ${blind.map(r => r.name).join(', ')}`).toBe(0)
})

// ── A-2 ─────────────────────────────────────────────────────────────────────────
const OLD_KEY = 'b2.brushFavs64.v1'
const NEW_KEY = 'b2.pencilcase68.v1'
/** web2-64의 옛 여섯 기본값 그대로(이주 원본 — 그 판의 2번 칸이 deevad/liner였다) */
const OLD_SIX = [
  { i: 'pencil', br: 'classic/pencil' }, { i: 'brush', br: 'deevad/liner' }, { i: 'marker', br: 'brunelleschi/marker' },
  { i: 'cp', br: 'brunelleschi/colored_pencil' }, { i: 'pencil', br: 'classic/charcoal' }, { i: 'brush', br: 'deevad/watercolor_expressive' },
]
const favPairs = (page: Page) => page.evaluate(() =>
  ((window as any).__b2.diag.paintFavsForTest() as { i: string; br: string }[]).map(f => `${f.i}|${f.br}`))
/** 화면에서 읽히는 칸의 정체 — 도구 그림(kind) + 경도 글자. 사람에게는 이것이 «같은 단추»의 자다. */
const favLooks = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('#paint-favs .favbtn')]
    .filter(b => b.id !== 'paint-erase')
    .map(b => `${b.dataset.kind}|${(b.querySelector('.pcgrade')?.textContent ?? '').trim()}`))

test('A-2 — 필통 여덟 칸: {슬롯, br}이 전부 다르다(기본 · 이주 뒤 · 저장 왕복 뒤) · 머리와 칸은 생김새가 다르다', async ({ page }) => {
  test.setTimeout(120_000)
  // ① 기본 채움
  await page.goto('/?reset')
  // ⚠⚠ `?reset`은 **비동기로 `location.replace`를 부른다**(main.ts — 서비스 워커·캐시를 지운
  //   뒤 매개를 떼고 다시 연다). 그 항해가 오기 «전»에 긴 evaluate를 시작하면 실행 맥락이
  //   부서진다(실측: A-1 전수 팔이 dpr2에서 「Execution context was destroyed」로 죽었다).
  //   그래서 매개가 떨어질 때까지 먼저 기다린다(상한 있는 대기 — #81).
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(80)
  const base = await favPairs(page)
  // ② 이주 뒤 — 옛 판만 두고 새 판을 지운 채 다시 연다(사람의 실제 경로)
  await page.evaluate(([ok, nk, six]) => {
    localStorage.removeItem(nk as string)
    localStorage.setItem(ok as string, JSON.stringify(six))
  }, [OLD_KEY, NEW_KEY, OLD_SIX] as unknown[])
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(120)
  const migrated = await favPairs(page)
  const migratedLooks = await favLooks(page)
  const migratedFlag = await page.evaluate(() => (window as any).__b2.diag.paintCaseMigratedForTest() as number)
  // ③ 저장 왕복 뒤 — 이주가 새 판에 쓴 것을 다시 읽는다
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(120)
  const round = await favPairs(page)
  const roundLooks = await favLooks(page)
  // ④ 머리(견본 획 + 이름)와 칸(도구 그림)은 생김새가 다르다
  const look = await page.evaluate(() => {
    const head = document.getElementById('paint-brush-btn')!
    const cell = document.getElementById('paint-fav-7')!
    return {
      head_has_sample_canvas: !!head.querySelector('canvas'),
      head_has_svg: !!head.querySelector('svg'),
      head_text: (head.textContent ?? '').trim().slice(0, 24),
      cell_has_svg: !!cell.querySelector('svg'),
      cell_has_sample_canvas: !!cell.querySelector('canvas'),
    }
  })
  const dup = (a: string[]) => a.filter((v, i) => a.indexOf(v) !== i)
  OUT.a2 = {
    base, base_dup: dup(base), migrated, migrated_dup: dup(migrated), migrated_flag: migratedFlag,
    migrated_looks: migratedLooks, migrated_looks_dup: dup(migratedLooks),
    roundtrip: round, roundtrip_dup: dup(round), roundtrip_looks: roundLooks, roundtrip_looks_dup: dup(roundLooks), look,
    note: '옛 판(64)의 2번 칸이 {brush, deevad/liner}였고 새 기본의 7번 칸도 같다 — 이주가 앞 여섯을 그대로 옮기면 두 칸이 「제도 라이너」가 된다(사람이 본 그것).',
  }
  expect(dup(base), '기본 채움 — 중복 없음').toEqual([])
  expect(migratedFlag, '이주가 실제로 돌았다(반증: 0이면 이 팔은 아무것도 안 잰다)').toBeGreaterThan(0)
  expect(dup(migrated), '이주 뒤 — 중복 없음').toEqual([])
  expect(dup(round), '저장 왕복 뒤 — 중복 없음').toEqual([])
  expect(dup(migratedLooks), '이주 뒤 — 화면에서 읽히는 정체(그림+경도)도 중복 없음').toEqual([])
  expect(dup(roundLooks), '저장 왕복 뒤 — 화면에서 읽히는 정체도 중복 없음').toEqual([])
  expect(look.head_has_sample_canvas && !look.head_has_svg, '머리 = 견본 획 + 이름').toBe(true)
  expect(look.cell_has_svg && !look.cell_has_sample_canvas, '칸 = 도구 그림').toBe(true)
})

// ── A-3 ─────────────────────────────────────────────────────────────────────────
/** 필통 여덟 칸의 «생김새»(도구 그림의 촉 색 · 숫자 둘) — 지금 선택을 바꿀 때 몇 칸이 따라 바뀌나 */
const caseLooks = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('#paint-favs .favbtn')].map(b => ({
    id: b.id,
    tip: b.querySelector('.tip')?.getAttribute('fill') ?? null,
    nums: (b.querySelector('.pcnums')?.textContent ?? '').trim(),
  })))
/** 묶음마다 on인 것의 수(지시 §A-3의 게이트 문면) */
const onCounts = (page: Page) => page.evaluate(() => ({
  case: document.querySelectorAll('#paint-favs .favbtn.on').length,
  toolbar: document.querySelectorAll('#sidebar .tool.on').length,
  grade: document.querySelectorAll('#tray .pcgrade.on').length,
  recent: document.querySelectorAll('#paint-recent .swatch.on').length,
}))

test('A-3 — 지금 선택을 바꿔도 «제 사양을 안 든 칸»의 생김새는 안 바뀐다 · 묶음마다 on은 하나', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?reset')
  // ⚠⚠ `?reset`은 **비동기로 `location.replace`를 부른다**(main.ts — 서비스 워커·캐시를 지운
  //   뒤 매개를 떼고 다시 연다). 그 항해가 오기 «전»에 긴 evaluate를 시작하면 실행 맥락이
  //   부서진다(실측: A-1 전수 팔이 dpr2에서 「Execution context was destroyed」로 죽었다).
  //   그래서 매개가 떨어질 때까지 먼저 기다린다(상한 있는 대기 — #81).
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(150)
  const onBefore = await onCounts(page)
  const look0 = await caseLooks(page)
  // ① 지금 색을 강조색에 가까운 파랑으로 — 수리 «전»에는 일곱 칸의 촉이 한꺼번에 그 색이 됐다
  await page.evaluate(() => { (window as any).__b2.diag.setPaintHexForTest('#2040ff') })
  await page.waitForTimeout(150)
  const look1 = await caseLooks(page)
  // ② 크기까지 바꾼다(숫자 축)
  await page.evaluate(() => { const b2 = (window as any).__b2; b2.app.paintSel.w = 44; b2.diag.setPaintHexForTest('#ff2020') })
  await page.waitForTimeout(150)
  const look2 = await caseLooks(page)
  const changed = (a: typeof look0, b: typeof look0) =>
    a.filter((x, i) => x.tip !== b[i]!.tip || x.nums !== b[i]!.nums).map(x => x.id)
  const ch1 = changed(look0, look1), ch2 = changed(look1, look2)
  const onDuring = await onCounts(page)
  // ③ 도구를 바꿔도 묶음마다 on은 하나
  await page.click('#paint-fav-5'); await page.waitForTimeout(150)
  const onSwitched = await onCounts(page)
  const look3 = await caseLooks(page)
  OUT.a3 = {
    look_before: look0, look_after_color: look1, look_after_color_and_size: look2, look_after_tool_switch: look3,
    changed_by_color: ch1, changed_by_color_n: ch1.length,
    changed_by_color_and_size: ch2, changed_by_color_and_size_n: ch2.length,
    on_before: onBefore, on_during: onDuring, on_switched: onSwitched,
    note: '⚠ 지시 §A-3의 가설(상태 클래스 on이 묶음 요소에 붙거나 선택 갱신이 전부에 on을 켠다)은 **반증됐다** — 수리 전에도 묶음마다 on은 정확히 하나였다(D-4: 사람이 준 근거는 확인 대상이다). 측정이 가리킨 것은 필통 칸의 «폴백»이다: 제 색·크기를 안 든 칸이 `f.hex ?? ps.hex`로 **지금 선택**을 그렸다 — 색 하나 바꾸면 일곱 칸의 촉이 동시에 물든다(수리 전 실측: 7/7). 수리는 폴백을 «처음 값»(CASE_FALLBACK)으로 바꾼 것이고, 따라 바뀌는 칸은 adopt가 사양을 실제로 기억한 그 칸 하나뿐이다.',
  }
  expect(ch1.length, `색을 바꿀 때 따라 바뀌는 칸(adopt한 그 칸 하나까지 허용): ${ch1.join(', ')}`).toBeLessThanOrEqual(1)
  expect(ch2.length, `색·크기를 바꿀 때 따라 바뀌는 칸: ${ch2.join(', ')}`).toBeLessThanOrEqual(1)
  for (const [k, v] of Object.entries(onDuring)) expect(v, `묶음 ${k}의 on ≤ 1`).toBeLessThanOrEqual(1)
  for (const [k, v] of Object.entries(onSwitched)) expect(v, `도구 바꾼 뒤 묶음 ${k}의 on ≤ 1`).toBeLessThanOrEqual(1)
  expect(onSwitched.case, '필통은 정확히 하나').toBe(1)
})

// ── A-4 ─────────────────────────────────────────────────────────────────────────
const wheelOpen = (page: Page) => page.evaluate(() =>
  (((window as any).__b2.diag.openBoxes() as string[]).includes('#paint-wheelbox')))

async function dragRange(page: Page, id: string, dx: number) {
  const b = (await page.locator(id).boundingBox())!
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.4 + dx, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(80)
}

test('A-4 — 휠은 «캔버스 탭»과 «휠 단추 재누름»으로만 닫힌다(패널 안 조작은 안 닫는다)', async ({ page }) => {
  test.setTimeout(180_000)
  await bigBox(page)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('pencil'); Object.assign(b2.app.paintSel, { hex: '#8a4a3a', w: 18 })
  })
  await page.click('#btn-paint'); await page.waitForTimeout(80)
  const rec: Record<string, boolean> = {}
  const open = async (k: string) => { rec[k] = await wheelOpen(page) }

  await page.click('#paint-color-btn'); await page.waitForTimeout(100)
  await open('open_after_button')
  await dragRange(page, '#paint-size-range', 30)
  await open('open_after_size_drag')
  await dragRange(page, '#paint-opacity-range', -20)
  await open('open_after_opacity_drag')
  // 눈금 점 탭(크기 줄의 √2 눈금 — 68)
  const tick = page.locator('#paint-size-ticks button').first()
  if (await tick.count() > 0) { await tick.click(); await page.waitForTimeout(80) }
  await open('open_after_tick_tap')
  await page.click('#paint-fav-4'); await page.waitForTimeout(100)
  await open('open_after_case_tap')
  const hexAfterCase = await page.evaluate(() => (window as any).__b2.app.paintSel.hex as string)
  // 펜으로 캔버스에 획 — 안 닫힌다
  await page.evaluate(() => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const f = (t: string, x: number, y: number, p: number, b: number) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 3, pointerType: 'pen', isPrimary: true, buttons: b, pressure: p,
      clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
    }))
    f('pointerdown', 560, 380, 0.5, 1)
    for (let i = 1; i <= 6; i++) f('pointermove', 560 + i * 20, 380 + i * 6, 0.5, 1)
    f('pointerup', 680, 416, 0, 0)
  })
  await page.waitForTimeout(150)
  await open('open_after_canvas_stroke')
  // 손가락 캔버스 «탭» — 닫힌다
  await page.evaluate(() => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const f = (t: string, x: number, y: number, b: number) => el.dispatchEvent(new PointerEvent(t, {
      pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: b, pressure: b ? 0.5 : 0,
      clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
    }))
    f('pointerdown', 600, 640, 1)
    f('pointerup', 600, 640, 0)
  })
  await page.waitForTimeout(200)
  rec.closed_after_canvas_tap = !(await wheelOpen(page))
  // 재누름으로 여닫이(34-0 R7 무회귀 — 다른 통을 열면 휠이 닫힌다)
  await page.click('#paint-color-btn'); await page.waitForTimeout(100)
  await open('open_after_reopen')
  await page.click('#paint-color-btn'); await page.waitForTimeout(100)
  rec.closed_after_button_again = !(await wheelOpen(page))
  await page.click('#paint-color-btn'); await page.waitForTimeout(100)
  await page.click('#paint-brush-btn'); await page.waitForTimeout(150)     // 브러시 목록 = 다른 통
  rec.closed_by_other_box_r7 = !(await wheelOpen(page))

  OUT.a4 = { ...rec, hex_after_case_tap: hexAfterCase }
  expect(rec.open_after_button, '휠이 열렸다').toBe(true)
  expect(rec.open_after_size_drag, '크기 끌기 → 열린 채').toBe(true)
  expect(rec.open_after_opacity_drag, '불투명 끌기 → 열린 채').toBe(true)
  expect(rec.open_after_tick_tap, '눈금 점 탭 → 열린 채').toBe(true)
  expect(rec.open_after_case_tap, '필통 칸 탭 → 열린 채').toBe(true)
  expect(rec.open_after_canvas_stroke, '펜 획 → 열린 채').toBe(true)
  expect(rec.closed_after_canvas_tap, '손가락 캔버스 탭 → 닫힘').toBe(true)
  expect(rec.closed_after_button_again, '휠 단추 재누름 → 닫힘').toBe(true)
  expect(rec.closed_by_other_box_r7, '다른 통이 열리면 닫힌다(34-0 R7 무회귀)').toBe(true)
})
