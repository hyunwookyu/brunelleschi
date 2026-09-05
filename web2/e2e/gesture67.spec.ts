// web2-67 §1 — **몸짓을 가른다**: 펜 한 붓은 언제나 칠 · 손가락 탭이 면을 고른다 · 마우스만
// 문턱(12px)이 남는다. 한 몸짓(펜 한 붓)을 거리 문턱으로 두 뜻에 나눠 쓰던 것(64의 6px)을
// **장치로 갈랐다**(사람 판정 「그리려고 하는 건데 면이 선택되어버리는 문제」).
//
//   ① 펜 점 하나가 칠이다     펜 «찍기»만 해도 자국(잉크 픽셀)이 남고 면은 안 골라진다 — 슬롯 전수
//   ② 손가락 탭이 면을 고른다  한 번 → 하나 · 또(다른 면) → 더해짐 · 빈 곳 → 풀림
//   ②′ 손가락 긴 누름         Injector(51 — 옛 자리는 6px 탭이었다): 짚은 획의 속성이 실린다
//   ③ 궤도가 안 깨진다        문턱 아래 놓기 = 탭 · 문턱 위 끌기 = 궤도(포즈·뷰가 변한다) — 경계 양쪽
//   ④ 이어그리기             면 둘을 골라 한 붓으로 가로지르면 «둘 다»에 남고 셋째는 0 (54-2 그대로)
//   ⑤ 작도 중 무변            연필 도구에서 손가락 탭은 아무 일도 안 한다
//   ⑥ 마우스 경로             문턱 12로 종전 거동 — 경계 양쪽의 실측은 paint64 ⑥(판갈이)이 정본
//   ⑦ 반증(D-3)              판별을 끄면(gestureSplitOff) 옛 충돌이 돌아온다 — 짧은 펜 획이 고르기가 된다
//
// 장치의 합성: 펜·손가락은 합성 PointerEvent다(tiperase·gesture의 그 규약 — 헤드리스가 잴 수
// 있는 것은 «신호를 받으면 무엇을 하는가»다). 마우스는 playwright mouse(실제 이벤트).
// 원장: stage0/out/gesture67_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-67 §1 — 몸짓 가르기: 펜=칠 · 손가락 탭=고르기 · 손가락 긴 누름=Injector · 마우스=문턱 12',
  note_pitfalls: '#93(탭 판정은 «움직인 거리»다 — 시간이 아니다: 문턱 경계 양쪽을 잰다) · #99 · #101 · #102(한 test 안 ?reset 재부름 ⛔) · #103(장면 확인 — 잉크·면 수) · #111 판별 ①(입력 하나에 전부를 다시 만드는가 — 이 라운드는 입력 «배정»만 바꿨고 미리보기 기제 무변)',
  note_d3: '⑦ gestureSplitOff가 반증이다 — 켜면 옛 판(펜도 6px 탭 판정 · 손가락 탭 무위)이 같은 장면에서 실제로 돌아온다',
  pitfall_citations: [42, 93, 99, 101, 102, 103, 111],
  selfcheck_notes: { zero_counters: '①의 sel_after(0)·⑤의 delta(전부 0)는 «아무 일도 안 한다» 게이트의 통과값이다 — 카운터 죽음이 아니라 그 짝(②의 sel 1·2, ⑦의 옛 충돌 sel 1)이 같은 자로 양수를 낸다' },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/gesture67_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/gesture67.spec.ts (#99)' },
    ...OUT,
  }, null, 2))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** paint54의 room3 — 바닥 + 벽 두 판(이음매 인접면). 이어그리기(④)의 그 장면이다. */
async function room3(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 550, 487, 550, 383)                          // 샛기둥 — 벽을 판 둘로
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)   // 바닥
  await page.mouse.click(525, 430); await page.waitForTimeout(60)   // 벽 왼판
  await page.mouse.click(575, 430); await page.waitForTimeout(60)   // 벽 오른판
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 셋이 섰다(#103 — 장면 확인)').toBe(3)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
}

/** 합성 펜 — 한 붓(점 목록). 탭이면 목록이 [한 점]이다. */
async function pen(page: Page, pts: [number, number][]) {
  await page.evaluate((list) => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, {
      pointerType: 'pen', pointerId: 7, isPrimary: true, buttons: b, pressure: b === 0 ? 0 : 0.55,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', list[0]![0], list[0]![1], 1))
    for (let i = 1; i < list.length; i++) el.dispatchEvent(mk('pointermove', list[i]![0], list[i]![1], 1))
    el.dispatchEvent(mk('pointerup', list[list.length - 1]![0], list[list.length - 1]![1], 0))
    // 팜 리젝션 뒷정리 — 합성 pointerup 뒤 penDown이 풀린다(다음 손가락이 산다)
  }, pts)
  await settle(page)
  await page.waitForTimeout(80)
}

/** 합성 손가락 — 누르고(선택) 움직이고 뗀다. holdMs > 0이면 누른 채 그 시간을 기다린다. */
async function finger(page: Page, pts: [number, number][], holdMs = 0) {
  await page.evaluate((list) => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, {
      pointerType: 'touch', pointerId: 91, isPrimary: true, buttons: b, pressure: b ? 0.5 : 0,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', list[0]![0], list[0]![1], 1))
    for (let i = 1; i < list.length; i++) el.dispatchEvent(mk('pointermove', list[i]![0], list[i]![1], 1))
    ;(el as any).__fingerLast = list[list.length - 1]
  }, pts)
  if (holdMs > 0) await page.waitForTimeout(holdMs)
  await page.evaluate(() => {
    const el = document.getElementById('ink') as any
    const p = el.__fingerLast as [number, number]
    el.dispatchEvent(new PointerEvent('pointerup', {
      pointerType: 'touch', pointerId: 91, isPrimary: true, buttons: 0, pressure: 0,
      clientX: p[0], clientY: p[1], bubbles: true, cancelable: true,
    }))
  })
  await settle(page)
  await page.waitForTimeout(80)
}

const faceSelN = (page: Page) => page.evaluate(() => (window as any).__b2.app.faceSel.length as number)
const strokeN = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length as number)
const paintN = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length as number)
const viewOf = (page: Page) => page.evaluate(() => ({ ox: (window as any).__b2.app.view.ox as number, oy: (window as any).__b2.app.view.oy as number, s: (window as any).__b2.app.view.s as number }))
const poseQ = (page: Page) => page.evaluate(() => ({ ...(window as any).__b2.app.pose.q })) as Promise<{ x: number; y: number; z: number; w: number }>
/** 굽힌 칠 텍스처의 잉크 합(자국이 «실제로 남았다»의 값 — #92: 이름표가 아니라 픽셀) */
const texInk = (page: Page) => page.evaluate(() =>
  ((window as any).__b2.diag.paintTexHash() as { ink: number }[]).reduce((a, t) => a + t.ink, 0))
const FTAP = 12   // C.PAINT67_FINGER_TAP_MAX_PX — 값 대조는 아래에서 상수로 읽는다

test('① 펜 점 하나가 칠이다 — 슬롯 전수: 찍기만 해도 잉크가 남고 면은 안 골라진다', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  const FT = await page.evaluate(() => (window as any).__b2.diag.paint50Constants().PAINT67_FINGER_TAP_MAX_PX as number)
  expect(FT, '문턱 상수가 등재돼 있다').toBe(FTAP)
  const rows: Record<string, unknown>[] = []
  const spots: [number, number][] = [[515, 420], [530, 445], [560, 420], [585, 440]]
  const instrs = ['pencil', 'brush', 'marker', 'cp'] as const
  for (let k = 0; k < 4; k++) {
    await page.evaluate((i) => { (window as any).__b2.diag.setPaintInstrForTest(i); (window as any).__b2.app.paintSel.w = 16 }, instrs[k]!)
    const ink0 = await texInk(page)
    const p0 = await paintN(page)
    await pen(page, [spots[k]!])                       // «찍기» — 점 하나
    const ink1 = await texInk(page)
    const p1 = await paintN(page)
    const sel = await faceSelN(page)
    rows.push({ instr: instrs[k], stroke_delta: p1 - p0, ink_delta: ink1 - ink0, sel_after: sel })
    expect(p1 - p0, `${instrs[k]}: 점 하나가 «획»이 됐다`).toBe(1)
    expect(ink1 - ink0, `${instrs[k]}: 자국(잉크 픽셀)이 실제로 남았다`).toBeGreaterThan(0)
    expect(sel, `${instrs[k]}: 면은 안 골라졌다`).toBe(0)
  }
  OUT.g1_pen_dot = { note: '펜 점 하나 → 획 1 · 잉크 증가 · faceSel 0 (슬롯 전수)', rows }
})

test('② 손가락 탭 — 하나 → 더해짐(다른 면) → 빈 곳 풀림 · ②′ 긴 누름 = Injector', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  // 표본 획 하나(Injector의 대상) — 벽 왼판에 파란 마커
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('marker'); Object.assign(b2.app.paintSel, { hex: '#1e66c0', w: 14 })
  })
  await pen(page, [[510, 445], [528, 450], [544, 452]])
  // 도구·색을 딴 것으로 — Injector가 «되찾는» 것이 값이 되게
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('pencil'); Object.assign(b2.app.paintSel, { hex: '#333333', w: 6 })
  })
  const s0 = await strokeN(page)
  await finger(page, [[525, 430]])                                   // 탭 — 벽 왼판
  const sel1 = await faceSelN(page)
  await finger(page, [[575, 430]])                                   // 탭 — 벽 오른판(더해짐)
  const sel2 = await faceSelN(page)
  await finger(page, [[575, 430]])                                   // 같은 면 재탭 — 수 그대로(맨 뒤로)
  const sel2b = await faceSelN(page)
  // ②′ 긴 누름 — 표본 획 위에서 writeHoldMs를 넘겨 누른다 → 속성이 실린다(면 고름은 안 는다)
  const holdMs = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await finger(page, [[528, 450]], holdMs + 300)
  const selHold = await faceSelN(page)
  const pick = await page.evaluate(() => ({ ...(window as any).__b2.app.paintSel }))
  await finger(page, [[200, 200]])                                   // 빈 곳 탭 — 풀림
  const sel0 = await faceSelN(page)
  const s1 = await strokeN(page)
  OUT.g2_finger_tap = {
    note: '탭 → 1 · 다른 면 탭 → 2 · 같은 면 재탭 → 2 · 긴 누름 = Injector(고름 불변) · 빈 곳 → 0 · 획 증가 0',
    sel: [sel1, sel2, sel2b, selHold, sel0], stroke_delta: s1 - s0,
    injected: { i: pick.i, hex: pick.hex, w_px: +pick.w.toFixed(1) },
  }
  expect(sel1, '탭 하나 → 면 하나').toBe(1)
  expect(sel2, '다른 면 탭 → 더해짐').toBe(2)
  expect(sel2b, '같은 면 재탭 → 수 그대로').toBe(2)
  expect(selHold, '긴 누름은 고름을 안 바꾼다').toBe(2)
  expect(pick.i, 'Injector — 슬롯이 실렸다(marker)').toBe('marker')
  expect(pick.hex, 'Injector — 색이 실렸다').toBe('#1e66c0')
  expect(sel0, '빈 곳 탭 → 풀림').toBe(0)
  expect(s1 - s0, '손가락은 획을 안 만든다').toBe(0)
})

test('③ 탭 ↔ 궤도의 문턱 — 경계 양쪽(#93 · 아래 = 탭·화면 불변 · 위 = 궤도·화면 변함·탭 아님)', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  const FT = await page.evaluate(() => (window as any).__b2.diag.paint50Constants().PAINT67_FINGER_TAP_MAX_PX as number)
  // 경계 아래(FT−2) — 흔들린 탭: 고르기가 되고 화면(뷰·포즈)은 그대로다
  const v0 = await viewOf(page); const q0 = await poseQ(page)
  const u = Math.floor((FT - 2) / Math.SQRT2)
  await finger(page, [[525, 430], [525 + u, 430 + u]])
  const selU = await faceSelN(page)
  const v1 = await viewOf(page); const q1 = await poseQ(page)
  // 경계 위(FT+6) — 궤도/이동: 화면이 변하고 고름은 안 변한다
  const o = Math.ceil((FT + 6) / Math.SQRT2)
  await finger(page, [[525, 430], [525 + Math.floor(o / 2), 430 + Math.floor(o / 2)], [525 + o, 430 + o], [525 + o + 40, 430 + o + 20]])
  const selO = await faceSelN(page)
  const v2 = await viewOf(page); const q2 = await poseQ(page)
  const dq = (a: any, b: any) => Math.min(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w), Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w))
  const moved = Math.abs(v2.ox - v1.ox) + Math.abs(v2.oy - v1.oy) + Math.abs(v2.s - v1.s) * 100 + dq(q1, q2) * 100
  OUT.g3_threshold = {
    note: '경계 양쪽(#93) — 아래(FT−2): 탭·화면 불변 · 위(FT+6): 궤도(화면 변화 값)·고름 불변',
    under: { diag_px: +(u * Math.SQRT2).toFixed(1), sel: selU, view_moved: +(Math.abs(v1.ox - v0.ox) + Math.abs(v1.oy - v0.oy)).toFixed(3), pose_moved: +dq(q0, q1).toFixed(6) },
    over: { diag_px: +(o * Math.SQRT2).toFixed(1), sel_delta: selO - selU, moved: +moved.toFixed(4) },
  }
  expect(selU, '문턱 아래 — 탭(고르기)').toBe(1)
  expect(+dq(q0, q1).toFixed(9), '문턱 아래 — 자세 불변').toBe(0)
  expect(Math.abs(v1.ox - v0.ox) + Math.abs(v1.oy - v0.oy), '문턱 아래 — 뷰 불변').toBe(0)
  expect(selO - selU, '문턱 위 — 고름 불변(탭 아님)').toBe(0)
  expect(moved, '문턱 위 — 화면이 실제로 움직였다(궤도/이동)').toBeGreaterThan(0.5)
})

test('④ 이어그리기 — 면 둘을 손가락으로 고르고 펜 한 붓으로 가로지르면 둘 다에 남고 바닥은 0', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest('pencil'); Object.assign(b2.app.paintSel, { hex: '#7a3030', w: 12 })
  })
  // 면 id 표본(paint54의 probe — 문턱 위 획으로)
  const probe = async (x: number, y: number) => {
    await pen(page, [[x, y], [x + 18, y + 4]])
    return page.evaluate(() => { const ss = (window as any).__b2.app.doc.strokes; return ss[ss.length - 1]?.paint?.f as number })
  }
  const floor = await probe(455, 480)
  const wallA = await probe(516, 412)
  const wallB = await probe(578, 412)
  expect(new Set([floor, wallA, wallB]).size, '세 영역이 세 면(#103)').toBe(3)
  // 손가락 탭 둘 — 벽 두 판
  await finger(page, [[525, 430]])
  await finger(page, [[575, 430]])
  expect(await faceSelN(page), '면 둘 고름').toBe(2)
  const n0 = await strokeN(page)
  // 펜 한 붓 — 바닥에서 출발해 두 벽판을 가로지른다(고른 집합 밖(바닥)은 잘린다)
  await pen(page, [[455, 470], [500, 452], [520, 447], [548, 440], [566, 434], [585, 430]])
  const byFace = await page.evaluate((s0) => {
    const ss = (window as any).__b2.app.doc.strokes
    const out: Record<number, number> = {}
    for (const s of ss.slice(s0)) if (s.paint) out[s.paint.f] = (out[s.paint.f] ?? 0) + 1
    return out
  }, n0)
  OUT.g4_across = {
    note: '고른 두 벽판에만 조각이 남는다 — 바닥(집합 밖)은 0 · 54-2의 그 기제(paint54 ④와 같은 자)',
    ids: { floor, wallA, wallB }, by_face: byFace,
  }
  expect(byFace[wallA] ?? 0, '벽 왼판에 남았다').toBeGreaterThan(0)
  expect(byFace[wallB] ?? 0, '벽 오른판에 남았다').toBeGreaterThan(0)
  expect(byFace[floor] ?? 0, '바닥(고른 집합 밖)은 0').toBe(0)
})

test('⑤ 작도 중 무변 — 연필 도구에서 손가락 탭은 아무 일도 안 한다', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')   // 연필 · 통 접기
  await page.waitForTimeout(60)
  const s0 = await strokeN(page); const v0 = await viewOf(page)
  await finger(page, [[525, 430]])
  const sel = await faceSelN(page); const s1 = await strokeN(page); const v1 = await viewOf(page)
  OUT.g5_drafting = { sel_after_tap: sel, stroke_delta: s1 - s0, view_delta: [v1.ox - v0.ox, v1.oy - v0.oy] }
  expect(sel, '작도 중 손가락 탭 — 면 고름 0').toBe(0)
  expect(s1 - s0, '획 증가 0').toBe(0)
  expect(Math.abs(v1.ox - v0.ox) + Math.abs(v1.oy - v0.oy), '탭 한 번으로 화면 이동 0').toBe(0)
})

test('⑥⑦ 마우스 문턱 12(값) · 반증 — 판별을 끄면 옛 충돌(짧은 펜 획 = 고르기)이 돌아온다', async ({ page }) => {
  test.setTimeout(300_000)
  await room3(page)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintInstrForTest('pencil') })
  // ⑥ 마우스 — 탭(0 이동): 고르기 · 짧은 획(문턱 위): 칠. 경계 양쪽 전수는 paint64 ⑥(판갈이)이 정본.
  const MT = await page.evaluate(() => (window as any).__b2.diag.paint50Constants().PAINT67_MOUSE_TAP_MAX_PX as number)
  await page.mouse.click(525, 430); await page.waitForTimeout(80)
  const selMouse = await faceSelN(page)
  const p0 = await paintN(page)
  await drawLine(page, 516, 418, 516 + MT + 6, 418 + 4)
  const p1 = await paintN(page)
  await page.mouse.click(950, 200); await page.waitForTimeout(80)    // 빈 곳 — 풀림(왼쪽은 칠 패널이 덮는다)
  // ⑦ 반증(D-3) — 판별 끔: 짧은 펜 획이 «고르기»가 된다(옛 충돌 재현) · 손가락 탭은 무위.
  //    획의 모양은 «되돌아온 한 붓»(끝점 거리 0 · bbox 4.2px)이다 — 옛 판에서 stray 문
  //    (끝점 > 2 && bbox < 6)에 안 걸리고 탭 판정(≤6)에 드는 대역: 옛 충돌의 그 형태다.
  const shortPen: [number, number][] = [[560, 420], [563, 423], [560, 420]]
  const selBefore = await faceSelN(page)
  const penP0 = await paintN(page)
  await pen(page, shortPen)                                          // 새 판 — 칠이 된다
  const penP1 = await paintN(page)
  const selNew = await faceSelN(page)
  await page.evaluate(() => { (window as any).__b2.diag.setGestureSplitOffForTest(true) })
  await pen(page, shortPen)                                          // 옛 판 — 고르기가 된다
  const penP2 = await paintN(page)
  const selOld = await faceSelN(page)
  await finger(page, [[575, 430]])                                   // 옛 판 — 손가락 탭 무위
  const selOldFinger = await faceSelN(page)
  await page.evaluate(() => { (window as any).__b2.diag.setGestureSplitOffForTest(false) })
  OUT.g67_mouse_falsify = {
    note: '⑥ 마우스: 탭=고르기 · 문턱+6 획=칠(경계 양쪽 전수는 paint64 ⑥) · ⑦ 반증: 끄면 짧은 펜 획이 고르기(옛 충돌) · 손가락 탭 무위',
    mouse: { threshold: MT, sel_after_click: selMouse, paint_delta_over: p1 - p0 },
    falsify: { sel_before: selBefore, new_world: { paint_delta: penP1 - penP0, sel: selNew }, old_world: { paint_delta: penP2 - penP1, sel: selOld, finger_sel: selOldFinger } },
  }
  expect(selMouse, '⑥ 마우스 탭 — 고르기').toBe(1)
  expect(p1 - p0, '⑥ 마우스 문턱 위 획 — 칠').toBe(1)
  expect(penP1 - penP0, '새 판 — 짧은 펜 획도 칠이다').toBe(1)
  expect(selNew, '새 판 — 면은 안 골라진다').toBe(0)
  expect(penP2 - penP1, '반증 — 옛 판에서 같은 획은 칠이 아니다').toBe(0)
  expect(selOld, '반증 — 옛 판에서 짧은 펜 획이 «고르기»가 된다(옛 충돌)').toBe(1)
  expect(selOldFinger, '반증 — 옛 판에서 손가락 탭은 무위(고름 그대로)').toBe(1)
})
