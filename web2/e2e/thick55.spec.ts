// web2-55 — 두께와 분류의 **화면 몫**. 상태·기하는 단위 팔(test/thick55.test.ts)이 잰다.
// 여기서 재는 것(지시 게이트 그대로):
//   ① **t=0이면 지금과 픽셀이 같다**(중심 게이트) — 켰다 끄면 «바이트 동일» 픽셀 복귀.
//      판별력(D-3): t=200은 같은 상자에서 실제로 픽셀을 바꾼다(0이 나오게 태어난 자가 아니다)
//   ② 일괄 — 같은 분류(벽) 두 판이 함께 바뀐다 · 예외 준 면만 안 바뀐다 ·
//      반증: 예외를 걷으면 분류 t가 그 면을 다시 다스린다(픽셀로)
//   ③ 왕복 — t=0에서 칠하고 0→200→0이면 픽셀이 **바이트로** 복귀한다
//   ④ 테두리 칠 — 띠에 그은 획이 e=1로 서고, t 200→300에서 **uv(저장)가 불변**이며
//      자국의 화면 폭이 안 는다 · 반증: uv를 1.5배로 실제로 늘리면 화면 자국이 는다
//   ⑤ 성능 — 벽 두 판+바닥에 두께를 준 장면의 syncStrokes ms(원장)
//   ⑥ 손통 「두께」 줄 — 34-0 몫(#96 · 툴팁 두 상태 · elementFromPoint) · 모드 전환
//      (일괄 ↔ 예외)이 상태로 선다 — 값 «넣는 길»(손글씨 인식)은 단위 ⑦이 판정자다
//
// 장면: 54의 room3(바닥+벽 두 판 — 같은 분류의 인접면) + 축척 2500mm(기둥).
// 원장: stage0/out/thick55_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-55 — 두께: t=0 픽셀 항등(중심) · 일괄/예외 · 왕복 · 테두리 미터 · 성능',
  note_92: '판정자는 픽셀(바이트 동일·상자 차)·uv 값·ms다 — 「두께를 달았다」는 이름표라 안 센다',
  note_d3: 'D-3 셋: ① t=200이 같은 상자를 실제로 바꾼다(항등 팔의 판별력) ② 예외 걷기가 픽셀을 실제로 바꾼다 ③ uv 1.5배가 화면 자국을 실제로 늘린다(미터 자의 반증)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/thick55_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...prev, ...OUT }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 꾹 누름 — grip44의 holdAt 그대로(#88) */
async function holdAt(page: Page, x: number, y: number) {
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms + 300)
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 54의 room3 + 축척 — 바닥 + 벽 두 판(샛기둥) · 기둥 2500mm. */
async function room3s(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 550, 487, 550, 383)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(525, 430); await page.waitForTimeout(60)
  await page.mouse.click(575, 430); await page.waitForTimeout(60)
  const ids = await page.evaluate(() => {
    const app = (window as any).__b2.app
    const walls = app.faces.filter((f: any) => Math.abs(f.normal.y) < 0.5).map((f: any) => f.id)
    const floor = app.faces.find((f: any) => Math.abs(f.normal.y) >= 0.5)?.id
    return { walls, floor }
  })
  expect(ids.walls.length, '벽 두 판').toBe(2)
  expect(ids.floor, '바닥').toBeDefined()
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  return ids as { walls: [number, number]; floor: number }
}

/** 면을 «칠한 면»으로 만든다(마커 한 획) — 48-9: 안 칠한 면은 화면에 없으므로 두께의
 *  픽셀 판별은 칠한(불투명) 면 위에서만 선다. 초판이 그 규약을 잊고 판별력 0을 실측했다
 *  (D-1 — 표식: t=200에서 changed_px 0 → 면 메시 자체가 안 그려지고 있었다). */
async function paintOn(page: Page, x: number, y: number) {
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 10 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
  await drawLine(page, x, y, x + 18, y - 8)
  await page.click('#btn-pencil')
  await page.waitForTimeout(60)
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** #gl 상자의 원시 바이트를 페이지 안에 굳힌다 — «바이트 동일»의 판정자. */
const snap = (page: Page, key: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(([k, x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const w2 = window as any
    w2.__t55 = w2.__t55 ?? {}
    w2.__t55[k as string] = g.getImageData(0, 0, t.width, t.height)
    return t.width * t.height
  }, [key, x, y, w, h])

/** 두 스냅의 «다른 바이트 수»와 «달라진 픽셀 수» — 0/0이면 바이트 동일. */
const diffSnap = (page: Page, a: string, b: string) =>
  page.evaluate(([ka, kb]) => {
    const w2 = window as any
    const A = w2.__t55[ka as string] as ImageData, B = w2.__t55[kb as string] as ImageData
    let bytes = 0, px = 0
    for (let i = 0; i < A.data.length; i += 4) {
      let d = 0
      for (let j = 0; j < 4; j++) if (A.data[i + j] !== B.data[i + j]) d++
      if (d > 0) { px++; bytes += d }
    }
    return { bytes, px, total: A.data.length / 4 }
  }, [a, b])

// 장면 전체를 덮는 상자 — 두께의 어떤 흔적(띠·오프셋)도 이 안이다
const BOXALL = [380, 350, 320, 180] as const

test('① 중심 게이트 — t를 켰다 끄면 픽셀이 바이트로 돌아온다 (+D-3: t=200은 실제로 바꾼다)', async ({ page }) => {
  const ids = await room3s(page)
  await paintOn(page, 520, 432)                               // 벽A를 칠한 면으로(불투명 — 두께가 보인다)
  await settle(page); await settle(page)
  await snap(page, 'base', ...BOXALL)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 200), ids.walls[0])
  await settle(page); await settle(page)
  await snap(page, 't200', ...BOXALL)
  const d1 = await diffSnap(page, 'base', 't200')
  OUT.identity = {
    def: 't=0 픽셀 항등(중심 게이트): base ↔ (t=200 켰다 다시 0) 다른 바이트 0. 판별력 = base ↔ t200의 달라진 픽셀(>0이어야 항등 팔이 살아 있다 — D-3 ①)',
    changed_px_at_t200: d1.px, box_px: d1.total,
  }
  expect(d1.px, 'D-3 — t=200이 같은 상자를 실제로 바꾼다').toBeGreaterThan(50)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 0), ids.walls[0])
  await settle(page); await settle(page)
  await snap(page, 'back0', ...BOXALL)
  const d0 = await diffSnap(page, 'base', 'back0')
  ;(OUT.identity as Record<string, unknown>).roundtrip_bytes = d0.bytes
  expect(d0.bytes, 't=0 복귀 — 바이트 동일').toBe(0)
})

test('② 일괄 — 벽 두 판이 함께 바뀌고 예외 면만 남는다 (+반증: 예외 걷기)', async ({ page }) => {
  const ids = await room3s(page)
  await paintOn(page, 520, 432)
  await paintOn(page, 578, 428)
  await settle(page); await settle(page)
  // 벽B에 예외 350 — 그 다음 분류 일괄 200이 벽B를 안 건드린다
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 350, true), ids.walls[1])
  await settle(page)
  await snap(page, 'exB', 560, 355, 105, 150)                 // 벽B 대역
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 200), ids.walls[0])
  await settle(page); await settle(page)
  const st = await page.evaluate((f) => ({
    a: (window as any).__b2.diag.thick55(f.walls[0]).info,
    b: (window as any).__b2.diag.thick55(f.walls[1]).info,
    floor: (window as any).__b2.diag.thick55(f.floor).info,
  }), ids)
  OUT.batch = {
    def: '분류 일괄(벽 t=200): 같은 분류 두 판 중 예외(350) 없는 판만 바뀐다 · 바닥(슬라브)은 무변 · 반증 = 예외 걷기 뒤 벽B가 200으로(픽셀 변화 >0)',
    wallA: st.a, wallB: st.b, floor: st.floor,
  }
  expect(st.a).toEqual({ cls: 'wall', t: 200, ex: false })
  expect(st.b).toEqual({ cls: 'wall', t: 350, ex: true })      // 예외가 이긴다
  expect(st.floor).toEqual({ cls: 'slab', t: 0, ex: false })   // 딴 분류 무변
  await snap(page, 'exB2', 560, 355, 105, 150)
  const dEx = await diffSnap(page, 'exB', 'exB2')
  expect(dEx.px, '예외 면은 일괄에 안 움직였다(픽셀)').toBe(0)
  // 반증 — 예외를 걷으면 분류 200이 이 면을 다스린다(350 → 200: 픽셀이 실제로 변한다)
  await page.evaluate((fid) => (window as any).__b2.diag.clearThickExForTest(fid), ids.walls[1])
  await settle(page); await settle(page)
  const st2 = await page.evaluate((fid) => (window as any).__b2.diag.thick55(fid).info, ids.walls[1])
  expect(st2).toEqual({ cls: 'wall', t: 200, ex: false })
  await snap(page, 'exB3', 560, 355, 105, 150)
  const dEx2 = await diffSnap(page, 'exB', 'exB3')
  ;(OUT.batch as Record<string, unknown>).falsify_clear_ex_px = dEx2.px
  expect(dEx2.px, '반증 — 예외 걷기가 픽셀을 실제로 바꿨다').toBeGreaterThan(20)
})

test('③ 왕복 — t=0에서 칠하고 0→200→0이면 픽셀이 바이트로 복귀한다', async ({ page }) => {
  const ids = await room3s(page)
  // t=0에서 벽A에 마커 칠
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 14 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  await drawLine(page, 512, 440, 540, 420)
  await settle(page); await settle(page)
  await snap(page, 'p0', ...BOXALL)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 200), ids.walls[0])
  await settle(page); await settle(page)
  await snap(page, 'p200', ...BOXALL)
  const dMid = await diffSnap(page, 'p0', 'p200')
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 0), ids.walls[0])
  await settle(page); await settle(page)
  await snap(page, 'p1', ...BOXALL)
  const d = await diffSnap(page, 'p0', 'p1')
  OUT.paint_roundtrip = {
    def: '칠(마커) 후 t 0→200→0: 복귀 바이트 차 0(칠이 같은 자리 — uv 불변의 픽셀판) · 중간(t=200)은 실제로 달랐다(이동의 실재)',
    mid_changed_px: dMid.px, roundtrip_bytes: d.bytes,
  }
  expect(dMid.px, 't=200에서 칠이 실제로 옮겨 갔다(앞 표면)').toBeGreaterThan(20)
  expect(d.bytes, '복귀 — 바이트 동일').toBe(0)
})

test('④ 테두리 칠 — e=1로 서고 · t 200→300에서 uv 불변·자국 안 는다 · 반증 = uv 1.5배', async ({ page }) => {
  const ids = await room3s(page)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 200), ids.walls[0])
  await settle(page); await settle(page)
  // 띠의 화면 자리 — 위 변(벽A 꼭대기)의 첫 사각을 diag가 낸다(#88 — 좌표를 손으로 안 적는다)
  const band = await page.evaluate((fid) => {
    const t = (window as any).__b2.diag.thick55(fid)
    // **화면 면적이 가장 큰** 사각을 고른다 — 이 포즈에서 띠는 대부분 모로 보이고(위 변은
    // 0.3px 두께 — 초판이 그걸 골라 적중 점이 서너 개뿐이었다: D-1 표식 실측), 세로
    // 모서리 띠(tW 사영 ~6px × 높이 ~120px)가 그릴 수 있는 유일한 자리다.
    let best: any = null, bestA = 0
    for (const q of t.band) {
      const pts = q.scr
      if (pts.some((p: any) => !p)) continue
      let a = 0
      for (let i = 0; i < 4; i++) {
        const P = pts[i], Q = pts[(i + 1) % 4]
        a += P.x * Q.y - Q.x * P.y
      }
      a = Math.abs(a) / 2
      if (a > bestA) { bestA = a; best = q }
    }
    return best
  }, ids.walls[0])
  expect(band, '띠 사각이 화면에 있다').not.toBeNull()
  const mid = (i: number, j: number) => ({
    x: (band.scr[i].x + band.scr[j].x) / 2, y: (band.scr[i].y + band.scr[j].y) / 2,
  })
  const m0 = mid(0, 3), m1 = mid(1, 2)                       // 사각의 양 끝 중점 — 띠 안 길이 방향
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 6 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  const lerp = (a: typeof m0, b: typeof m0, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const p0 = lerp(m0, m1, 0.25), p1 = lerp(m0, m1, 0.75)
  await drawLine(page, p0.x, p0.y, p1.x, p1.y)
  await settle(page); await settle(page)
  const stroke = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return last?.paint ? { e: last.paint.e ?? null, uv: last.paint.uv, id: last.id } : null
  })
  expect(stroke?.e, '띠에 그은 획이 테두리 슬롯(e=1)로 섰다').toBe(1)
  // 칠 자국의 화면 폭(파란 픽셀 bbox 대각) — t를 300으로 키워도 안 는다
  const blueBox = () => page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0, X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i + 2]! - d[i]!) > 40 && d[i + 3]! > 30) {
        const px = (i / 4) % t.width, py = Math.floor(i / 4 / t.width)
        n++
        if (px < X0) X0 = px; if (py < Y0) Y0 = py
        if (px > X1) X1 = px; if (py > Y1) Y1 = py
      }
    }
    return { n, diag: n > 0 ? Math.hypot(X1 - X0, Y1 - Y0) : 0 }
  }, BOXALL as unknown as number[])
  const b200 = await blueBox()
  expect(b200.n, '띠 칠이 화면에 실재한다').toBeGreaterThan(10)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 300), ids.walls[0])
  await settle(page); await settle(page)
  const stroke300 = await page.evaluate((id) => {
    const s = (window as any).__b2.app.doc.strokes.find((x: any) => x.id === id)
    return s.paint.uv as number[]
  }, stroke!.id)
  expect(stroke300, 'uv(저장)가 t 변경에 불변 — 미터 자').toEqual(stroke!.uv)
  const b300 = await blueBox()
  OUT.border_meter = {
    def: '띠 칠: e=1 · t 200→300에서 uv 불변 · 자국 대각(px) 비 ≤ 1.15(안 는다 — 사영 이동분 허용) · 반증 = uv를 1.5배로 실제로 늘리면 대각이 1.2배 넘게 는다',
    diag_t200: +b200.diag.toFixed(1), diag_t300: +b300.diag.toFixed(1),
    ratio: +(b300.diag / Math.max(1, b200.diag)).toFixed(3), px_t200: b200.n, px_t300: b300.n,
  }
  expect(b300.diag / Math.max(1, b200.diag), '자국이 t와 함께 늘지 않는다').toBeLessThan(1.15)
  // 반증(D-3) — 저장이 «비례»였다면 t 200→300에서 자국이 1.5배가 됐을 것이다. 그 1.5배를
  // **실제로 만들어**(uv의 s축을 평균 중심으로 1.5배) 이 픽셀 자(diag)가 그것을 잡는지
  // 본다 — 위 «안 는다» 판정의 판별력. ⚠ 두께 방향(u) 정규화의 세계-단위 반증은 단위
  // ⑤가 잰다(1e-6 문 — 이 픽셀 자는 u 이동(~2px)에 둔해 s축이 반증 축이다).
  await page.evaluate((id) => {
    const app = (window as any).__b2.app
    const s = app.doc.strokes.find((x: any) => x.id === id)
    const uv: number[] = s.paint.uv
    let mean = 0
    for (let i = 0; i < uv.length; i += 2) mean += uv[i]!
    mean /= uv.length / 2
    s.paint.uv = uv.map((v: number, i: number) => i % 2 === 0 ? mean + (v - mean) * 1.5 : v)
  }, stroke!.id)
  await page.evaluate((fid) => (window as any).__b2.diag.setThickForTest(fid, 300), ids.walls[0])
  await settle(page); await settle(page)
  const bF = await blueBox()
  ;(OUT.border_meter as Record<string, unknown>).falsify_s15_ratio = +(bF.diag / Math.max(1, b300.diag)).toFixed(3)
  expect(bF.diag / Math.max(1, b300.diag), '반증 — 1.5배 uv를 픽셀 자가 실제로 잡는다').toBeGreaterThan(1.25)
})

test('⑤ 성능 — 두께 장면의 syncStrokes ms(원장 값)', async ({ page }) => {
  const ids = await room3s(page)
  await page.evaluate((f) => {
    const d = (window as any).__b2.diag
    d.setThickForTest(f.walls[0], 200)
    d.setThickForTest(f.floor, 150)
  }, ids)
  await settle(page); await settle(page)
  const ms = await page.evaluate(() => {
    const d = (window as any).__b2.diag
    d.syncCostReset()
    const runs: number[] = []
    for (let i = 0; i < 10; i++) runs.push(d.syncStrokesMs())
    runs.sort((a, b) => a - b)
    return { median: +runs[5]!.toFixed(3), min: +runs[0]!.toFixed(3), max: +runs[9]!.toFixed(3) }
  })
  OUT.perf = {
    def: '두께 장면(면 셋 · 벽 200mm/바닥 150mm — 메시 3배)의 syncStrokes lastMs. 정본은 이 원장 필드 — 절대 ms는 기계 몫이라 회귀 비교는 같은 원장의 전값과 한다(#47)',
    sync_ms: ms,
  }
  expect(true).toBe(true)   // 값 원장 팔 — 문턱은 안 건다(#82: 추세 측정)
})

test('⑥ 손통 「두께」 줄 — 34-0 몫(#96) · 모드 전환(일괄↔예외)', async ({ page }) => {
  const ids = await room3s(page)
  void ids
  await page.click('#btn-pencil')
  await holdAt(page, 578, 436)                                // 벽B를 잡는다(벽A 쪽은 기둥 치수 표찰 대역)
  // 손통을 연다(핀셋 단추 — 44의 규약)
  await page.evaluate(() => {
    const tray = document.getElementById('griptray')!
    if (!tray.classList.contains('open')) (document.getElementById('btn-grip') as HTMLElement)?.click()
  })
  await page.waitForTimeout(120)
  const gripBtnState = await page.evaluate(() => {
    const b = document.getElementById('btn-grip-thick')
    return b ? { title: b.title, disabled: b.classList.contains('disabled') } : null
  })
  expect(gripBtnState, '두께 줄이 있다').not.toBeNull()
  expect(gripBtnState!.title, '툴팁이 뜬다(#96 — 쓸 수 있는 상태)').toContain('두께')
  expect(gripBtnState!.disabled, '면을 잡았으니 쓸 수 있다').toBe(false)
  // 줄을 눌러 모드가 서고, 재누름이 예외로 간다 — elementFromPoint 행위(#94)
  const press = () => page.evaluate(() => {
    const b = document.getElementById('btn-grip-thick')!
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (el && (b === el || b.contains(el))) { (el as HTMLElement).closest('button')!.click(); return true }
    return false
  })
  expect(await press(), '두께 줄의 중심이 실제로 눌린다(#97)').toBe(true)
  let w = await page.evaluate(() => {
    const x = (window as any).__b2.app.write
    return x ? { thick: x.thick ?? null, ex: x.thickEx ?? null } : null
  })
  expect(w, '글씨 상태가 살아 있다').not.toBeNull()
  expect(w!.thick, '두께 모드(일괄)').toBe(1)
  expect(w!.ex).toBeNull()
  // cmd 줄은 실행 뒤 통이 닫힌다 — 재누름은 통을 다시 열고 누른다(제품 흐름 그대로)
  await page.evaluate(() => {
    const tray = document.getElementById('griptray')!
    if (!tray.classList.contains('open')) (document.getElementById('btn-grip') as HTMLElement)?.click()
  })
  await page.waitForTimeout(80)
  expect(await press(), '재누름도 실제로 눌린다').toBe(true)
  w = await page.evaluate(() => {
    const x = (window as any).__b2.app.write
    return x ? { thick: x.thick ?? null, ex: x.thickEx ?? null } : null
  })
  expect(w!.ex, '재누름 — 예외(이 면만) 모드').toBe(1)
  OUT.ui34_thick = {
    def: '#96/#97 — 손통 두께 줄: 쓸 수 있는 상태의 툴팁 · elementFromPoint 눌림 · 재누름 모드 전환(값 넣는 길은 단위 ⑦이 판정)',
    tip: gripBtnState!.title,
  }
})
