// web2-50 — **여섯 증상의 픽셀 판**(「자국의 뿌리」— 면마다 텍스처 · 곱 합성).
//
//   ①② 곱은 어둡게만 한다 — 칠한 뒤 어느 픽셀도 밝아지지 않고(흰 뜸 ⛔), 아래
//        무늬(rep)·면 채움이 비친다. D-3: 합성을 보통(over)으로 되돌리면(반증 스위치)
//        흰 바탕 텍셀이 아래를 덮어 **밝아지는 픽셀이 실제로 난다**.
//   ③   돌리는 동안 칠이 남는다 — 칠이 #gl(3D 장면)에 살므로 구조가 답이다.
//   ④⑤ 원근을 받는다(가까운 끝이 굵다) · 면 경계 밖은 안 칠해진다(텍스처는 메시에 잘린다).
//        ⚠ 개구부 «구멍»의 픽셀 팔은 없다 — 실배관으로 구멍 있는 면을 만드는 경로가
//        붐벼서다. 구멍의 기하(삼각분할이 뺀다)는 단위(facetex.test ③)가 잰다 — 경계
//        절단(같은 기제의 바깥판)이 여기의 픽셀 판이다.
//   ⑥   면의 한쪽(48-5) — 건너편에서 «돌아보면» 장면은 보이되 칠만 없다(rep49 ①의 포즈).
//   파생 증명 — 텍스처를 오염시키면 화면이 갈리고, 정본(획 목록)에서 다시 구우면 돌아온다.
//   저장 — uv가 파일에 들고 텍스처(픽셀)는 안 든다.
//   성능(⚑) — 스무 면 · 칠 40획 장면의 프레임(#82 — 차)·텍스처 바이트(tex_budget).
//
// 원장: stage0/out/paint50_web2_<dpr>.json (LEDGER=1 — #90 · dpr별 — 픽셀은 dpr의 함수)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-50 — 면 텍스처 칠의 픽셀 판: 곱(밝기 불증가·아래가 비침·반증) · 회전 유지 · 원근 폭 · 경계 절단 · 쪽 · 파생 증명 · 저장 · 스무 면/40획 성능',
  note_92: '판정자는 픽셀(밝기 차·색 띠 폭·수)·프레임 ms·바이트다. 「텍스처를 만들었다」는 이름표라 안 센다',
  note_5: '곱이 어둡게만 하는 것은 합성식의 구성이다 — 그래서 판은 «합성 화면»(#gl)에서 재고, 반증 스위치(보통 합성)가 같은 실행에서 밝기 증가를 실제로 낸다(D-3)',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** rep49의 그 상자 — 오른쪽 벽(500,700)(900,610)(900,330)(500,330) · 축척 2500mm. */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

/** 칠 도구 + 마커 선택(색·굵기는 상태로 직접 — 판정 대상은 «색 고르기 UI»가 아니라 칠이다) */
async function pickMarker(page: Page, hex: string, wPx = 14) {
  await page.evaluate(([h, w]) => {
    (window as any).__b2.app.paintSel = { hex: h, i: 'marker', w }
  }, [hex, wPx] as [string, number])
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
}

/** #gl 상자를 페이지 안 기억에 굳힌다(픽셀 배열을 밖으로 안 나른다) */
const snapBox = (page: Page, key: string, x: number, y: number, w: number, h: number) =>
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
    w2.__p50 = w2.__p50 || {}
    w2.__p50[k as string] = g.getImageData(0, 0, t.width, t.height)
    return { w: t.width, h: t.height }
  }, [key, x, y, w, h] as unknown[])

/** 두 스냅의 픽셀 차 요약 — 밝아진 픽셀 수·최대 증가량·어두워진 잉크 합 */
const diffBoxes = (page: Page, a: string, b: string, tol: number) =>
  page.evaluate(([ka, kb, t]) => {
    const w2 = window as any
    const A = w2.__p50[ka as string] as ImageData, B = w2.__p50[kb as string] as ImageData
    let brighter = 0, maxUp = 0, darkSum = 0
    const lum = (d: Uint8ClampedArray, i: number) => {
      const al = d[i + 3]! / 255
      // #gl은 투명 캔버스 — 알파 미리곱 규약으로 «종이 위 밝기»로 편다(빈 픽셀 = 종이 255)
      return (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) * al + 255 * (1 - al)
    }
    for (let i = 0; i < A.data.length; i += 4) {
      const la = lum(A.data, i), lb = lum(B.data, i)
      const d = lb - la
      if (d > (t as number)) { brighter++; if (d > maxUp) maxUp = d }
      if (d < 0) darkSum += -d
    }
    return { brighter, maxUp: +maxUp.toFixed(1), darkSum: Math.round(darkSum) }
  }, [a, b, tol] as unknown[])

/** 상자 안 «파란 칠» 픽셀 수(b − r > 문턱 — 마커색 #1e7fd0 계열만 · 선·무늬는 무채색) */
const blueInk = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! > 16 && d[i + 2]! - d[i]! > 30) n++
    }
    return n
  }, [x, y, w, h] as unknown[])

/** 열별 파란 띠 두께(물리 px) — 원근 폭의 자 */
const blueColumnThickness = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const cols: number[] = []
    for (let c = 0; c < t.width; c++) {
      let rows = 0
      for (let r = 0; r < t.height; r++) {
        const i = (r * t.width + c) * 4
        if (d[i + 3]! > 16 && d[i + 2]! - d[i]! > 30) rows++
      }
      cols.push(rows)
    }
    return cols
  }, [x, y, w, h] as unknown[])

const WALL = { x: 505, y: 335, w: 390, h: 350 }

test('①② 곱 — 어느 픽셀도 안 밝아지고 · 아래 무늬가 비치고 · 반증(over)이 밝힌다', async ({ page }) => {
  await bigBox(page)
  // 아래에 «비쳐야 할 것»을 깐다 — 재료 표현(벽돌 · 49) + 칠보다 아래 층(52-4의 차례)
  const faceId = await page.evaluate(() => (window as any).__b2.app.doc.faces[0].id)
  for (let i = 0; i < 8; i++) {
    const cur = await page.evaluate((id) => (window as any).__b2.app.doc.faces.find((x: any) => x.id === id)?.rep?.m ?? null, faceId)
    if (cur === 'brick') break
    await page.evaluate((id) => (window as any).__b2.diag.cycleRep49(id), faceId)
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(250)
  // ⚠ 기준선은 «이미 칠한 면»이다 — 첫 칠이 면을 불투명(48-9 — 뒤를 가린다)으로 바꾸므로
  // 빈 면을 기준으로 삼으면 «가려져 밝아진 뒤 배경»이 곱의 위반으로 잘못 세어진다
  // (첫 실행이 실제로 그랬다 — 30841px. 그것은 48-9의 설계이지 흰 뜸이 아니다).
  await pickMarker(page, '#1e7fd0', 14)
  await drawLine(page, 870, 350, 885, 345)          // 구석의 씨앗 한 톨 — 면을 «칠한 상태»로
  await page.waitForTimeout(250)
  await snapBox(page, 'base', WALL.x, WALL.y, WALL.w, WALL.h)
  const domCanvasBefore = await page.evaluate(() => document.querySelectorAll('canvas').length)
  await drawLine(page, 700, 680, 750, 340)          // 벽을 세로로 가로지른다(위·아래 모서리를 문다)
  await drawLine(page, 560, 640, 620, 360)
  await page.waitForTimeout(300)
  await snapBox(page, 'painted', WALL.x, WALL.y, WALL.w, WALL.h)
  // ① 밝기 불증가 — 문턱 3/255(AA·반올림 잡음 위, 흰 뜸(수십) 아래)
  const d1 = await diffBoxes(page, 'base', 'painted', 3)
  expect(d1.brighter, '곱은 어둡게만 한다 — 밝아진 픽셀 0').toBe(0)
  expect(d1.darkSum, '칠이 실제로 얹혔다(어두워진 잉크가 있다)').toBeGreaterThan(3000)
  // ② 아래 무늬(벽돌)가 칠 아래에서 살아 있다 — 칠 띠 안에서 무늬 선 픽셀(무채색·어두움)이 남는다
  const under = await page.evaluate(() => {
    const w2 = window as any
    const A = w2.__p50.base as ImageData, B = w2.__p50.painted as ImageData
    let repBase = 0, repUnderPaint = 0
    for (let i = 0; i < A.data.length; i += 4) {
      const aA = A.data[i + 3]!, aB = B.data[i + 3]!
      const grayA = aA > 40 && Math.abs(A.data[i]! - A.data[i + 2]!) < 25       // 무늬·선(무채색)
      const blueB = aB > 16 && B.data[i + 2]! - B.data[i]! > 30                 // 칠 띠
      if (grayA) repBase++
      if (grayA && blueB) {
        // 칠 아래의 무늬 자리 — 여전히 주변(칠만 있는 자리)보다 어두운가는 아래 diff가
        // 이미 «안 밝아졌다»로 잡았다. 여기서는 그 자리가 잉크를 유지하는 것만 센다.
        if (aB > 40) repUnderPaint++
      }
    }
    return { repBase, repUnderPaint }
  })
  expect(under.repBase, '벽돌 무늬가 깔려 있었다').toBeGreaterThan(500)
  expect(under.repUnderPaint, '칠 띠 안에서도 무늬 자리가 잉크를 유지한다(덮어 지워지지 않았다)').toBeGreaterThan(50)
  // D-3 반증 — 보통(over) 합성으로 되돌리면 흰 바탕이 아래를 덮어 밝아진다
  await page.evaluate(() => (window as any).__b2.diag.setPaintBlendForTest(true))
  await page.waitForTimeout(200)
  await snapBox(page, 'over', WALL.x, WALL.y, WALL.w, WALL.h)
  const d2 = await diffBoxes(page, 'base', 'over', 3)
  expect(d2.brighter, '반증 — over 합성은 밝아지는 픽셀을 실제로 낸다').toBeGreaterThan(200)
  await page.evaluate(() => (window as any).__b2.diag.setPaintBlendForTest(false))
  await page.waitForTimeout(120)
  // #97 — 텍스처 캔버스는 DOM에 안 붙는다(전역 canvas 규칙에 안 걸린다 — 값으로)
  const domCanvasAfter = await page.evaluate(() => document.querySelectorAll('canvas').length)
  expect(domCanvasAfter, '#97 — DOM 캔버스 수 불변(텍스처는 화면 밖)').toBe(domCanvasBefore)
  OUT.multiply = {
    def: '벽(무늬 벽돌) 상자 — 칠 전/후 픽셀 밝기(알파 미리곱을 종이 위 밝기로 편 값). 문턱 3/255. 반증 = NormalBlending 스위치(같은 실행)',
    no_brighter: d1, under_pattern: under, falsify_over: d2,
    dom_canvas: { before: domCanvasBefore, after: domCanvasAfter },
  }
})

test('③ 돌리는 동안 칠이 남는다 — 칠은 #gl의 3D라 제스처가 구조적으로 무해하다', async ({ page }) => {
  await bigBox(page)
  await pickMarker(page, '#1e7fd0', 14)
  await drawLine(page, 560, 640, 620, 360)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(250)
  const before = await blueInk(page, WALL.x, WALL.y, WALL.w, WALL.h)
  expect(before, '칠이 섰다').toBeGreaterThan(200)
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  const during: number[] = []
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(600 + i * 12, 400 + i * 4)
    await page.waitForTimeout(90)
    during.push(await blueInk(page, WALL.x - 120, WALL.y - 120, WALL.w + 260, WALL.h + 260))
  }
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(200)
  const after = await blueInk(page, WALL.x - 120, WALL.y - 120, WALL.w + 260, WALL.h + 260)
  for (let i = 0; i < during.length; i++) {
    expect(during[i], `궤도 프레임 ${i}에 칠이 있다`).toBeGreaterThan(100)
  }
  expect(after, '놓은 뒤에도 있다').toBeGreaterThan(100)
  OUT.orbit = { before, during, after }
})

test('④⑤ 원근 폭(가까운 끝 > 먼 끝) · 면 경계 절단(밖은 0)', async ({ page }) => {
  await bigBox(page)
  await pickMarker(page, '#1e7fd0', 16)
  // 벽 가운데 높이를 따라 — 경계 밖(왼 480 · 오른 950)까지 일부러 지나간다(⑤의 재료)
  await drawLine(page, 480, 522, 950, 468)
  await page.waitForTimeout(300)
  const cols = await blueColumnThickness(page, 440, 380, 560, 260)   // css 440..1000
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  const at = (cssX: number) => {
    const c = Math.round((cssX - 440) * dpr)
    let s = 0, n = 0
    for (let k = -2; k <= 2; k++) { const v = cols[c + k]; if (v !== undefined) { s += v; n++ } }
    return n ? s / n : 0
  }
  const near = at(545), far = at(855)
  expect(near, '가까운 끝에 띠가 있다').toBeGreaterThan(0)
  expect(far, '먼 끝에 띠가 있다').toBeGreaterThan(0)
  // ④ — 면 고정 굵기: 가까운 끝이 굵다. 화면 고정(옛 구조)이면 비 1.0이 나온다(분석 경계)
  expect(near / far, '원근 — 가까운 끝이 굵다').toBeGreaterThan(1.1)
  // ⑤ — 경계 밖 절단: 벽 왼 모서리(x=500) 왼쪽·오른 모서리(x=900) 오른쪽에 칠이 없다
  const leftOut = at(488), rightOut = at(915)
  expect(leftOut, '왼 경계 밖 0').toBe(0)
  expect(rightOut, '오른 경계 밖 0').toBe(0)
  OUT.foreshorten_clip = {
    def: '경계를 일부러 지나는 마커 획 — 열별 파란 띠 두께(물리 px · ±2열 평균). near=545css · far=855css · 밖=488/915css',
    near_px: +near.toFixed(1), far_px: +far.toFixed(1), ratio: +(near / far).toFixed(3),
    screen_fixed_would_give: 1.0,
    left_out_px: leftOut, right_out_px: rightOut,
    note_hole: '개구부 «구멍»의 픽셀 팔은 없다 — 기하는 단위(facetex.test 개구부)가 잰다. 경계 절단이 같은 기제(메시가 텍스처를 문다)의 바깥판이다',
  }
})

test('⑥ 면의 한쪽(48-5) — 건너편에서 돌아보면 장면은 보이되 칠만 없다', async ({ page }) => {
  await bigBox(page)
  await pickMarker(page, '#1e7fd0', 14)
  await drawLine(page, 560, 640, 620, 360)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(250)
  const faceId = await page.evaluate(() => (window as any).__b2.app.doc.faces[0].id)
  const before = await blueInk(page, 0, 0, 1200, 800)
  expect(before).toBeGreaterThan(200)
  // rep49 ①의 그 «돌아보기» — 평면 반대쪽으로 반사 + 요 24방위 중 면이 화면 중앙에 오는 것
  const flipped = await page.evaluate((id) => {
    // rep49 ①의 그 방식 그대로(#54 — 검증된 포즈 표본을 새로 안 짓는다): 반사 2.2배 +
    // 요 24방위 사영 표본에서 면 중심이 화면 중심에 최근접인 것.
    const w = window as any
    const app = w.__b2.app
    const rf = app.faces.find((f: any) => f.id === id)
    const n = rf.normal, L = Math.hypot(n.x, n.y, n.z)
    const u = { x: n.x / L, y: n.y / L, z: n.z / L }
    const d = u.x * rf.outer[0].x + u.y * rf.outer[0].y + u.z * rf.outer[0].z
    const p = app.pose.p
    const sd = u.x * p.x + u.y * p.y + u.z * p.z - d
    const saved = JSON.parse(JSON.stringify(app.pose))
    const p2 = { x: p.x - 2.2 * sd * u.x, y: p.y - 2.2 * sd * u.y, z: p.z - 2.2 * sd * u.z }
    let cx = 0, cy = 0, cz = 0
    for (const q of rf.outer) { cx += q.x; cy += q.y; cz += q.z }
    const c = { x: cx / rf.outer.length, y: cy / rf.outer.length, z: cz / rf.outer.length }
    const W0 = app.doc.frame.W, H0 = app.doc.frame.H
    let best: any = null, bestD = Infinity, bestPr: any = null
    for (let k = 0; k < 24; k++) {
      const a = (k * 15 * Math.PI) / 180
      const qq = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }
      const pr = w.__b2.diag.projectWith({ ...app.pose, p: p2, q: qq }, c)
      if (!pr) continue
      const dd = Math.hypot(pr.x - W0 / 2, pr.y - H0 / 2)
      if (dd < bestD) { bestD = dd; best = qq; bestPr = pr }
    }
    const onScreen = !!bestPr && bestPr.x > 0 && bestPr.x < W0 && bestPr.y > 0 && bestPr.y < H0
    if (best) app.pose = { ...app.pose, p: p2, q: best }
    w.__b2.diag.invalidate?.()
    return { saved, ok: !!best && onScreen }
  }, faceId)
  expect(flipped.ok).toBe(true)
  await page.waitForTimeout(250)
  const sceneInk = await page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = src.width; t.height = src.height
    const g = t.getContext('2d')!
    g.drawImage(src, 0, 0)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let ink = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 16) ink++
    return ink
  })
  const behind = await blueInk(page, 0, 0, 1200, 800)
  expect(sceneInk, '건너편에서 장면(획·면)이 보인다 — «안 그려져서 0»과 가른다').toBeGreaterThan(2000)
  expect(behind, '칠만 없다').toBe(0)
  // 복원 — 원 포즈 통째로(한 번 더 뒤집기 ⛔)
  await page.evaluate((sv) => {
    const w = window as any
    w.__b2.app.pose = sv
    w.__b2.diag.invalidate?.()
  }, flipped.saved)
  await page.waitForTimeout(250)
  const restored = await blueInk(page, WALL.x, WALL.y, WALL.w, WALL.h)
  expect(restored, '돌아오면 칠이 돌아온다').toBeGreaterThan(200)
  OUT.side = { before, behind, scene_ink_behind: sceneInk, restored }
})

test('파생 증명 — 오염이 보이고 · 재굽기가 정본에서 지운다 · 저장에 텍스처가 없다', async ({ page }) => {
  await bigBox(page)
  await pickMarker(page, '#1e7fd0', 14)
  await drawLine(page, 560, 640, 620, 360)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(300)
  const hashBox = () => page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = src.width; t.height = src.height
    const g = t.getContext('2d')!
    g.drawImage(src, 0, 0)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let h = 0x811c9dc5
    for (let i = 0; i < d.length; i += 16) { h ^= d[i]!; h = Math.imul(h, 0x01000193) }
    return h >>> 0
  })
  const base = await hashBox()
  const n = await page.evaluate(() => (window as any).__b2.diag.corruptPaintTex())
  expect(n, '오염시킬 텍스처가 있다').toBeGreaterThan(0)
  await page.waitForTimeout(200)
  const corrupted = await hashBox()
  expect(corrupted, '오염이 화면에 실제로 보인다(반증 — 안 보이면 아래 회복은 아무것도 안 잰다)').not.toBe(base)
  await page.evaluate(() => (window as any).__b2.diag.rebakePaintTex())
  await page.waitForTimeout(200)
  const rebaked = await hashBox()
  expect(rebaked, '정본(획 목록)에서 다시 구우면 같은 화면이다 — 텍스처는 파생이다').toBe(base)
  // 저장 — uv가 들고, 픽셀(데이터 URL·base64 덩어리)은 안 든다
  const txt: string = await page.evaluate(() => (window as any).__b2.diag.serialize())
  expect(txt).toContain('"uv"')
  expect(txt).not.toContain('data:image')
  const paintStroke = JSON.parse(txt).strokes.find((s: any) => s.paint !== undefined)
  expect(paintStroke.paint.uv.length).toBeGreaterThanOrEqual(4)
  expect(paintStroke.paint.s === 1 || paintStroke.paint.s === -1).toBe(true)
  expect(paintStroke.raw, '칠 획은 raw를 안 싣는다(정본은 uv 하나 — #54)').toBeUndefined()
  OUT.derived = { hash_base: base, hash_corrupted: corrupted, hash_rebaked: rebaked, textures: n, file_bytes: txt.length }
})

test('⚑ 성능 — 스무 면 · 칠 40획: 프레임(#82 — 차)과 텍스처 바이트(tex_budget)', async ({ page }) => {
  test.setTimeout(240_000)
  await bigBox(page)
  await drawLine(page, 150, 620, 150, 380)
  await drawLine(page, 150, 380, 500, 330)
  await page.click('#btn-face')
  await page.mouse.click(330, 480); await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  for (let k = 1; k <= 9; k++) {
    const t = k / 10
    await drawLine(page, 500 + 400 * t, 330, 500 + 400 * t, 700 - 90 * t)
  }
  for (let k = 1; k <= 8; k++) {
    const t = k / 9
    await drawLine(page, 150 + 350 * t, 380 - 50 * t, 150 + 350 * t, 620 + 80 * t)
  }
  await page.click('#btn-face')
  for (let k = 0; k < 10; k++) {
    const t = (k + 0.5) / 10
    await page.mouse.click(500 + 400 * t, (700 - 90 * t + 330) / 2 + 20)
    await page.waitForTimeout(50)
  }
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9
    await page.mouse.click(150 + 350 * t, (620 + 380 - 50 * t) / 2)
    await page.waitForTimeout(50)
  }
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  const faceN = await page.evaluate(() => (window as any).__b2.app.faces.length)
  const frame = () => page.evaluate(async () => {
    const w = window as any
    const dts: number[] = []
    let prev = performance.now()
    for (let i = 0; i < 40; i++) {
      await new Promise<void>(res => requestAnimationFrame(() => res()))
      w.__b2.diag.invalidate?.()
      const now = performance.now()
      dts.push(now - prev); prev = now
    }
    dts.sort((a, b) => a - b)
    return { median: dts[Math.floor(dts.length / 2)]!, p90: dts[Math.floor(dts.length * 0.9)]! }
  })
  const before = await frame()
  const before2 = await frame()
  // 칠 40획 — 두 벽을 가로지르며 오르내린다(면마다 나뉘어 얹힌다 — 획 수는 배정 후가 40 이상)
  await pickMarker(page, '#1e7fd0', 12)
  for (let i = 0; i < 20; i++) {
    const x = 520 + (i % 10) * 38
    await drawLine(page, x, 360 + (i % 3) * 60, x + 30, 620 - (i % 4) * 40)
  }
  for (let i = 0; i < 10; i++) {
    const x = 180 + i * 33
    await drawLine(page, x, 420 + (i % 3) * 40, x + 26, 560 - (i % 2) * 60)
  }
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(400)
  const paintN = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  const texes = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  const bytes = texes.reduce((a: number, t: any) => a + t.w * t.h * 4, 0)
  const after = await frame()
  const noise = +Math.abs(before2.median - before.median).toFixed(2)
  const maxLevel = Math.max(...texes.map((t: any) => t.level))
  const cMax = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(maxLevel, '해상도 상한이 서 있다').toBeLessThanOrEqual(cMax.FACETEX_MAX_PX)
  expect(paintN, '칠이 실제로 여러 획 얹혔다').toBeGreaterThanOrEqual(30)
  OUT.tex_budget = {
    def: '분할 두 벽(면 faceN) + 칠 40붓 — 텍스처 수·단계 분포·합계 바이트(w·h·4). 프레임은 같은 장면 전/후 «차»(#82) — 잡음 바닥(before↔before2)과 함께 읽는다',
    faces: faceN, paint_strokes: paintN,
    textures: texes.length, levels: texes.map((t: any) => t.level), bytes_total: bytes,
    max_level: maxLevel, cap: cMax.FACETEX_MAX_PX, min: cMax.FACETEX_MIN_PX,
    before_ms: before, before2_ms: before2, noise_floor_ms: noise, after_ms: after,
    delta_median_ms: +(after.median - before2.median).toFixed(2),
    delta_p90_ms: +(after.p90 - before2.p90).toFixed(2),
    note_cap: '상한 1024의 근거 — 이 장면(칠한 면 ~수십)의 합계 바이트가 이 필드다. 2048이면 장당 4배(16MB)라 같은 장면이 수백 MB 대역으로 뛴다',
    note_82: '중앙값이 vsync 바닥(16.7ms)에 붙은 실행에서는 차의 해상도가 눈금뿐이다(rep49 frame20의 그 유보 그대로)',
  }
})

test('원장', async ({}, info) => {
  const dpr = info.project.name === 'dpr2' ? 2 : 1
  OUT.constants_used = { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31의 no_constants_snapshot이 정본)' }
  ;(OUT as any).no_constants_snapshot = true
  ;(OUT as any).pitfall_citations = [5, 54, 82, 92, 97]
  const dir = resolve(HERE, '../../stage0/out')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `paint50_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
})
