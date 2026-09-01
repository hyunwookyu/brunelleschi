// web2-44 — 손(잡기·옮기기·손통·정면·띠)의 **화면 몫**. 기하·의존 갈래는 단위 팔
// (`test/grip44*.test.ts`)이 잰다. 여기서 재는 것:
//   ① 꾹 누름이 실제 시계(450ms)로 잡는다 — 39의 진입과 같은 몸짓에 얹힌 두 번째 뜻
//   ② 원칙 d — 끄는 동안 보인 좌표가 곧 놓인 좌표다(마지막 move 시점 == 뗀 뒤)
//   ③ 축 제한 — 이동 벡터가 앱의 축과 평행하다(3D에서 잰다)
//   ④ 손통 — 잡기 전 비활성 · 복제·잠금이 실제로 돈다 · 잠긴 선 꾹 누름 → 「해제」
//   ⑤ 정면 — 면을 잡고 「정면」 → 평행 사영 + 그 면이 화면과 평행(각도)
//   ⑥ 띠 재편 — 세로바가 화면을 안 넘친다 · 남은 여유를 원장으로
//
// ⚠ #93(몸짓은 시간으로 읽힌다): 이 팔의 꾹 누름은 writeHoldMs(기본 450ms)에 여유 300ms를
// 더해 기다린다. 끌기 팔은 머무름 문이 없다(끌기가 시계를 끈다 — input.moveHoldPress).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const OUT: Record<string, unknown> = {
  what: 'web2-44 — 화면 몫: 꾹 잡기 · 원칙 d · 축 제한 · 손통 · 정면 · 띠',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 꾹 누름 — writeHoldMs(앱에서 읽는다 · #88) + 300ms 여유 뒤 뗀다 */
async function holdAt(page: Page, x: number, y: number) {
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms + 300)
  await page.mouse.up()
  await page.waitForTimeout(60)
}

const grip44 = (page: Page) => page.evaluate(() => (window as any).__b2.diag.grip44())

async function scene(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)     // 지평선
  await drawLine(page, 500, 500, 600, 475)      // vp0
  await drawLine(page, 500, 500, 400, 475)      // vp1
  await drawLine(page, 500, 500, 500, 300)      // 기둥 — 내용 획(3D)
}

test('① 꾹 누름이 잡는다 — 잡음 + 글씨 상태(39 보존) · 빈 곳은 무해', async ({ page }) => {
  await scene(page)
  const before = await grip44(page)
  expect(before.ids).toBeNull()
  await holdAt(page, 500, 420)                  // 기둥 몸통
  const g = await grip44(page)
  expect(g.ids, '기둥이 잡혔다').not.toBeNull()
  expect((g.ids as number[]).length).toBe(1)
  expect(g.writeOn, '글씨 상태가 함께 산다(39)').toBe(true)
  // 빈 곳(뭉치에서 먼 곳)을 꾹 — **세션이 끝난다**(39-3의 «먼 곳» 규약 그대로:
  // 잡기 세션 = 글씨 세션이므로 far가 둘 다 놓는다). 시계는 안 켜지고(빈 곳 경로 ⛔)
  // 그 탭은 잡음으로 버려진다 — 획이 안 는다.
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await holdAt(page, 900, 650)
  const g2 = await grip44(page)
  expect(g2.ids, '먼 곳 누름이 세션을 놓는다(39 far)').toBeNull()
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n1, '그 탭이 획을 안 만든다').toBe(n0)
  OUT.hold = {
    // #93 — 이 팔의 시간 여유를 값으로: 시계는 writeHoldMs이고 우리는 +300ms를 기다린다.
    // 끌기 팔에는 머무름 문이 없다(움직임이 시계를 끈다 — 판별 ①이 «아니오»인 몸짓).
    writeHoldMs: await page.evaluate(() => (window as any).__b2.app.writeHoldMs),
    wait_margin_ms: 300,
    far_press: { strokes_before: n0, strokes_after: n1, session_released: g2.ids === null },
  }
})

test('②③ 옮기기 — 원칙 d(보인 것 == 놓인 것) · 축 제한(3D 평행)', async ({ page }) => {
  await scene(page)
  await holdAt(page, 500, 420)
  const g = await grip44(page)
  const id = (g.ids as number[])[0]!
  const seg0 = await page.evaluate((sid) => {
    const app = (window as any).__b2.app
    const s = app.lift.lifted.get(sid)
    return { a3: { ...s.a3 }, b3: { ...s.b3 } }
  }, id)
  // 잡힌 몸통에서 끈다 — vp0 쪽으로 60px쯤
  await page.mouse.move(500, 420)
  await page.mouse.down()
  await page.mouse.move(520, 428, { steps: 5 })
  await page.mouse.move(560, 442, { steps: 8 })
  await page.waitForTimeout(50)
  // «끄는 동안 보이는 것» — 뗌 직전의 문서 좌표(작도 포즈라 문서 == 화면)
  const seen = await page.evaluate((sid) => {
    const app = (window as any).__b2.app
    const st = app.doc.strokes.find((x: any) => x.id === sid)
    return { a: { ...st.a }, b: { ...st.b }, live: (window as any).__b2.diag.grip44().live }
  }, id)
  expect(seen.live, '끄는 동안 값 표찰이 산다').not.toBeNull()
  await page.mouse.up()
  await page.waitForTimeout(60)
  const landed = await page.evaluate((sid) => {
    const app = (window as any).__b2.app
    const st = app.doc.strokes.find((x: any) => x.id === sid)
    const seg = app.lift.lifted.get(sid)
    return { a: { ...st.a }, b: { ...st.b }, a3: { ...seg.a3 }, b3: { ...seg.b3 } }
  }, id)
  // 원칙 d — 좌표 동일(px 오차 0)
  const dPrinciple = Math.max(
    Math.hypot(landed.a.x - seen.a.x, landed.a.y - seen.a.y),
    Math.hypot(landed.b.x - seen.b.x, landed.b.y - seen.b.y))
  expect(dPrinciple, '보인 자리가 곧 놓인 자리다').toBeLessThan(1e-9)
  // ⚠ #5 — 이 0은 절반이 구성상이다(지금 구현에서 뗌은 기하를 안 바꾼다). 이 팔의 뜻은
  //   «뗌이 기하를 다시 푸는 회귀»(web2-14 0번이 지운 그 경로)를 막는 회귀 게이트다.
  //   자가 실제로 재는지(D-3)는 자를 1px 틀어 실제로 실패값이 나는 것으로 확인한다:
  const rulerCheck = Math.hypot(landed.a.x - (seen.a.x + 1), landed.a.y - seen.a.y)
  expect(rulerCheck, 'D-3 — 자를 틀면 자가 실제로 값을 낸다').toBeGreaterThan(0.9)
  // 축 제한 — 이동 벡터가 앱의 어느 축과 평행하다
  const axes = await page.evaluate(() => (window as any).__b2.app.lift.an.axes.map((a: any) => a.dir))
  const d3 = { x: landed.a3.x - seg0.a3.x, y: landed.a3.y - seg0.a3.y, z: landed.a3.z - seg0.a3.z }
  const len = Math.hypot(d3.x, d3.y, d3.z)
  expect(len, '실제로 움직였다').toBeGreaterThan(1e-6)
  let minSin = Infinity
  for (const ax of axes as { x: number; y: number; z: number }[]) {
    const al = Math.hypot(ax.x, ax.y, ax.z)
    if (al < 1e-9) continue
    const cx = d3.y * ax.z - d3.z * ax.y
    const cy = d3.z * ax.x - d3.x * ax.z
    const cz = d3.x * ax.y - d3.y * ax.x
    minSin = Math.min(minSin, Math.hypot(cx, cy, cz) / (len * al))
  }
  expect(minSin, '이동이 축과 평행하다(sin ≈ 0)').toBeLessThan(1e-9)
  // 두 끝이 같은 벡터로 — 평행 이동이다
  const db = Math.hypot(
    (landed.b3.x - seg0.b3.x) - d3.x, (landed.b3.y - seg0.b3.y) - d3.y, (landed.b3.z - seg0.b3.z) - d3.z)
  expect(db).toBeLessThan(1e-9)
  OUT.move = {
    moved_units: len, min_sin_to_axis: minSin, principle_d_px: dPrinciple,
    note_5: '#5 — min_sin_to_axis와 principle_d_px 0은 측정이 아니라 설계 보장(applyMove가 dir·t로 옮기고 뗌이 기하를 안 바꾼다). 팔의 뜻은 배선·회귀 게이트이고, 자의 판별력은 D-3 팔(자를 1px 틀면 값이 난다)이 확인했다',
  }
})

test('④ 손통 — 잡기 전 비활성 · 복제·잠금 · 잠긴 선 꾹 → 「해제」', async ({ page }) => {
  await scene(page)
  // 잡기 전 — 통은 열리되 줄이 비활성이다
  await page.click('#btn-grip')
  await expect(page.locator('#griptray')).toHaveClass(/open/)
  expect(await page.locator('#btn-grip-dup.disabled').count()).toBe(1)
  expect(await page.locator('#btn-grip-lock.disabled').count()).toBe(1)
  await page.click('#btn-grip')                 // 접는다
  // 잡는다
  await holdAt(page, 500, 420)
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 복제
  await page.click('#btn-grip')
  expect(await page.locator('#btn-grip-dup.disabled').count()).toBe(0)
  await page.click('#btn-grip-dup')
  await page.waitForTimeout(50)
  const n1 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n1, '사본이 하나 늘었다').toBe(n0 + 1)
  const gDup = await grip44(page)
  expect((gDup.ids as number[]).length, '잡음이 사본으로 옮겨 갔다').toBe(1)
  // 사본을 옆으로 끌어낸다 — 제자리에 두면 원본과 겹쳐 다음 판정이 원본을 먼저 문다
  await page.mouse.move(500, 420)
  await page.mouse.down()
  await page.mouse.move(540, 434, { steps: 4 })
  await page.mouse.move(580, 448, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(60)
  const copyPos = await page.evaluate((cid) => {
    const st = (window as any).__b2.app.doc.strokes.find((x: any) => x.id === cid)
    return { x: (st.a.x + st.b.x) / 2, y: (st.a.y + st.b.y) / 2 }
  }, (gDup.ids as number[])[0]!)
  // 잠금 — 사본을 잠근다
  await page.click('#btn-grip')
  await page.click('#btn-grip-lock')
  await page.waitForTimeout(50)
  const gLock = await grip44(page)
  expect((gLock.locked as number[]).length).toBe(1)
  // 잠긴 선을 꾹 — 「해제」가 뜬다(조용히 안 잡히면 고장으로 읽힌다)
  await holdAt(page, copyPos.x, copyPos.y)
  await expect(page.locator('#notice u[data-pick="unlock"]')).toHaveCount(1)
  await page.click('#notice u[data-pick="unlock"]')
  await page.waitForTimeout(50)
  const gUnlock = await grip44(page)
  expect((gUnlock.locked as number[]).length, '해제됐다').toBe(0)
  OUT.tub = { dup: n1 - n0, locked_then_unlocked: true }
})

test('⑤ 정면 — 면을 잡고 「정면」: 평행 사영 + 법선이 시선과 나란', async ({ page }) => {
  // ⚠ 이 팔은 **기둥 없는 장면**을 새로 짓는다 — scene()의 기둥(500,500→500,300)이
  //   colA와 같은 세로선이라 겹치면 모서리(cornerOf)가 안 선다(단위 팔이 잡은 그 함정).
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)     // 지평선
  await drawLine(page, 500, 500, 600, 475)      // vp0
  await drawLine(page, 500, 500, 400, 475)      // vp1
  // 벽면을 닫는다(단위 픽스처와 같은 좌표 — 밑변은 깊이선 그 자체)
  await drawLine(page, 500, 500, 500, 380)      // colA
  await drawLine(page, 600, 475, 600, 385)      // colB
  await drawLine(page, 600, 385, 500, 380)      // top
  await page.click('#btn-face')
  await page.mouse.click(550, 430)
  await page.waitForTimeout(80)
  const faces = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(faces, '면이 섰다').toBe(1)
  // 도구를 연필로 되돌리고 면 안을 꾹 누른다
  await page.click('#btn-pencil')
  await page.click('#btn-pencil')               // 연필통 도로 접기(도구는 연필)
  await holdAt(page, 550, 432)
  const g = await grip44(page)
  expect(g.faceId, '면이 잡혔다').not.toBeNull()
  await page.click('#btn-grip')
  expect(await page.locator('#btn-grip-front.disabled').count()).toBe(0)
  await page.click('#btn-grip-front')
  // 보간이 끝날 때까지 — 평행 사영으로 정착한다(상한 3s — #95)
  await page.waitForFunction(() => (window as any).__b2.diag.view42().parallel === true, null, { timeout: 3000 })
  await page.waitForTimeout(400)
  const v = await page.evaluate(() => (window as any).__b2.diag.view42())
  expect(v.parallel).toBe(true)
  // 면 법선과 시선이 나란한가 — 면의 화면 사영에서 «세로 변 둘이 평행»(정면의 값)
  const ang = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const f = b2.app.faces[0]
    const n = f.normal
    const q = b2.app.pose.q
    // back = quatRotate(q, (0,0,1)) — 손으로 편 회전(진단 전용)
    const { x, y, z, w } = q
    const bx = 2 * (x * z + w * y)
    const by = 2 * (y * z - w * x)
    const bz = 1 - 2 * (x * x + y * y)
    const dot = Math.abs(n.x * bx + n.y * by + n.z * bz)
    const nl = Math.hypot(n.x, n.y, n.z)
    return Math.acos(Math.min(1, dot / nl)) * 180 / Math.PI
  })
  expect(ang, '법선 ↔ 시선 각도(도)').toBeLessThan(0.01)
  OUT.front = {
    normal_to_view_deg: ang, parallel: v.parallel, read: v.read,
    note_5: '#5 — 각도 0은 구성상 보장(faceFrontPose가 법선으로 자세를 짓는다). 이 팔이 재는 것은 «보간이 실제로 그 목표에 정착했는가»(glide 완주·투영 전환)다',
  }
})

test('⑥ 띠 재편 — 세로바가 화면 안이고 여유가 남는다(원장 · 창 높이 두 점)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const readBar = async () => {
    const g = await grip44(page)
    return g.bar as { top: number; bottom: number; left: number; right: number; winH: number; winW: number }
  }
  const bar = await readBar()
  expect(bar.bottom, '세로바가 화면을 안 넘친다').toBeLessThanOrEqual(bar.winH)
  const spare = bar.winH - bar.bottom
  // 짝 줄이 만든 왼쪽 돌출 — 실행취소가 축에서 몇 px 왼쪽인가(#12 — 값으로 남긴다)
  const undoOffset = await page.evaluate(() => {
    const u = document.getElementById('btn-undo')!.getBoundingClientRect()
    const r = document.getElementById('btn-redo')!.getBoundingClientRect()
    return r.right - u.right
  })
  // ⚠ 여유는 **창 높이의 함수**다(#46 · #12) — 두 점에서 잰다: 800(기본)과 700(낮은 창)
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.waitForTimeout(150)
  const bar700 = await readBar()
  OUT.bar = {
    at_800: { top: bar.top, bottom: bar.bottom, width: bar.right - bar.left, winH: bar.winH, spare_px: spare },
    at_700: { bottom: bar700.bottom, winH: bar700.winH, spare_px: bar700.winH - bar700.bottom },
    undo_row_left_offset_px: undoOffset,
    note_46: '#46·#12 — 여유는 창 높이가 정한 값이다. 두 점(800·700)을 남긴다',
  }
  expect(spare, '여유가 0보다 크다(창 800)').toBeGreaterThan(0)
  // ⚠ 창 700에서는 **넘친다**(실측 −32px) — 이 회차의 회귀가 아니라 **선재 상태**다:
  //   재편이 세로 37px을 벌었으므로 재편 «전»은 −69px였다(같은 셈). 700 대역 기기가
  //   실재하면 접기(sidebar-toggle)나 --ui-scale이 답이고 그것은 별도 회차다(DEFERRED).
  //   여기서는 값을 원장에 남기고 게이트는 지원 뷰포트(800 — playwright.config)에만 건다.
  ;(OUT.bar as Record<string, unknown>).at_700_overflow_note =
    '선재 — 재편 전 −69px(= −32 − 37 절약분), 이 회차가 37px 줄였다. 게이트는 800에만'
})

test.afterAll(() => {
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'grip44_e2e_web2.json'), JSON.stringify(OUT, null, 2))
})
