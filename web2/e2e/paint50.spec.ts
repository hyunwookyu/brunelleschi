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


// ⚠⚠ **#99의 근본 수리** — 원장을 «팔마다 병합-쓰기»한다. 누산기(OUT)는 워커 재시작
// (파일·프로젝트 경계 · 비결정)에서 초기화되므로, 마지막 「원장」 팔 하나가 쓰는 구조는
// 초록인데 빈 원장을 낸다(paint50 dpr2가 파일 단위 호출에서도 비었다 — 그 실측).
// 병합이라 이전 실행의 같은 이름 열쇠는 덮이고, **필드를 개명하면 파일을 지우고 재생성**
// 해야 유령 열쇠가 안 남는다(그 유보는 이 주석이 든다).
import { readFileSync } from 'node:fs'
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint50_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true /* 첫 실행 또는 읽기 실패 */ }
  // 방어 — 파일이 «있는데» 못 읽었으면 쓰지 않는다(빈 prev로 덮으면 누산이 통째로 지워진다)
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 진짜 첫 실행 */ }
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
  // ① 밝기 불증가 — 문턱 C.PAINT50_LUM_TOL(등재 — AA·반올림 잡음 위, 흰 뜸(수십) 아래)
  const lumTol = (await page.evaluate(() => (window as any).__b2.diag.paint50Constants())).PAINT50_LUM_TOL
  const d1 = await diffBoxes(page, 'base', 'painted', lumTol)
  expect(d1.brighter, '곱은 어둡게만 한다 — 밝아진 픽셀 0').toBe(0)
  expect(d1.darkSum, '칠이 실제로 얹혔다(어두워진 잉크가 있다)').toBeGreaterThan(3000)
  // ①-램프(지시 문면 그대로): 획 가장자리를 **가로질러** 알파·RGB를 뽑는다 — 알파가
  // 어떻게 변하든 RGB(종이 위 밝기)가 흰색 쪽으로 가지 않는 것을 «수치»로 남긴다.
  // 세로획(x≈725 대역)을 y=500에서 수평으로 가로지른다 — 띠 밖 → 가장자리 → 안 → 가장자리 → 밖.
  const ramp = await page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const y = Math.round(500 * dpr)
    const x0 = Math.round(695 * dpr), n = Math.round(46 * dpr)
    const t = document.createElement('canvas')
    t.width = n; t.height = 1
    const g = t.getContext('2d')!
    g.drawImage(src, x0, y, n, 1, 0, 0, n, 1)
    const d = g.getImageData(0, 0, n, 1).data
    const rows: { a: number; r: number; g: number; b: number; lum: number }[] = []
    for (let i = 0; i < n; i++) {
      const a = d[i * 4 + 3]! / 255
      const lum = (0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!) * a + 255 * (1 - a)
      rows.push({ a: +a.toFixed(3), r: d[i * 4]!, g: d[i * 4 + 1]!, b: d[i * 4 + 2]!, lum: +lum.toFixed(1) })
    }
    return rows
  })
  const paperLum = 0.299 * 245 + 0.587 * 243 + 0.114 * 238   // PAPER_HEX의 종이 위 밝기
  const rampMax = Math.max(...ramp.map(r => r.lum))
  expect(rampMax, '램프 어느 자리도 종이보다 밝지 않다 — 흰쪽으로 안 간다').toBeLessThanOrEqual(paperLum + lumTol)
  expect(Math.min(...ramp.map(r => r.lum)), '램프가 실제로 획 안을 지난다(어두운 자리가 있다)').toBeLessThan(paperLum - 20)
  // ② 아래 무늬(벽돌)·선이 칠 아래에서 살아 있다 — 판정 지표는 **띠 안 대비**다(2차 [2]):
  // 칠 띠(파란 픽셀)의 75분위 밝기보다 12 이상 어두운 픽셀 수. 곱이면 무늬 선이 띠 몸통보다
  // 어둡게 남고, over(반증)면 띠가 균일해져 0 대역으로 죽는다 — 그것이 판별력이다.
  // (초판의 «유지 비»는 실측이 정확히 1.000이라 아무것도 안 갈랐다 — 그 실패가 이 지표를 골랐다.)
  const bandContrast = (key: string) => page.evaluate((k) => {
    const w2 = window as any
    const B = w2.__p50[k as string] as ImageData
    const lums: number[] = []
    const idx: number[] = []
    for (let i = 0; i < B.data.length; i += 4) {
      const a = B.data[i + 3]!
      if (a > 16 && B.data[i + 2]! - B.data[i]! > 30) {
        const al = a / 255
        lums.push((0.299 * B.data[i]! + 0.587 * B.data[i + 1]! + 0.114 * B.data[i + 2]!) * al + 255 * (1 - al))
        idx.push(i)
      }
    }
    if (lums.length === 0) return { bandPx: 0, contrastPx: 0 }
    const sorted = [...lums].sort((a, b) => a - b)
    const p75 = sorted[Math.floor(sorted.length * 0.75)]!
    let contrastPx = 0
    for (const L of lums) if (L < p75 - 12) contrastPx++
    return { bandPx: lums.length, contrastPx }
  }, key)
  const under = await bandContrast('painted')
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  expect(under.bandPx, '칠 띠가 실제로 있다(분모)').toBeGreaterThan(1000)
  expect(under.contrastPx, '띠 안에 아래 무늬의 대비가 남는다(비친다)').toBeGreaterThan(cs.PAINT50_PATTERN_MIN_PX)
  // ②-선: 지시 문면의 «아래 선» — 벽 위 모서리(3D 획 y=330 대역)를 칠 띠가 가로지른다.
  // 선의 어두운 픽셀이 칠 뒤에도 남는 것을 전/후 «수»로 잰다(선은 renderOrder 0 — 칠 위).
  // 화면에서 «선»으로 읽히는 잉크는 흑연 질감(#brushc — #gl 위 겹)이다. 칠은 #gl 안이라
  // 구성상 그 위를 못 덮지만(#5 — 겹 차례), 값으로 남긴다: 칠 뒤에도 그 상자의 선 잉크 > 0.
  // ⚠ #gl의 Line2 몸체는 칠한 면의 깊이 쓰기(48-9)와 같은 평면이라 z-싸움으로 얇아진다 —
  //   그것은 48-9 시점부터의 거동이고(선의 화면 잉크는 질감 겹이 든다) 50의 몫이 아니다.
  const lineBox = { x: 703, y: 326, w: 44, h: 9 }
  const lineAfter = await page.evaluate((bx) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const b = bx as { x: number; y: number; w: number; h: number }
    const t = document.createElement('canvas')
    t.width = Math.round(b.w * dpr); t.height = Math.round(b.h * dpr)
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(b.x * dpr), Math.round(b.y * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let ink = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) ink++
    return ink
  }, lineBox as unknown)
  expect(lineAfter, '칠 띠가 지나가는 위 모서리의 «선» 잉크(#brushc — 칠 위 겹)가 살아 있다').toBeGreaterThan(cs.PAINT50_LINE_INK_MIN_PX)
  // D-3 반증 — 보통(over) 합성으로 되돌리면 흰 바탕이 아래를 덮어 밝아진다
  await page.evaluate(() => (window as any).__b2.diag.setPaintBlendForTest(true))
  await page.waitForTimeout(200)
  await snapBox(page, 'over', WALL.x, WALL.y, WALL.w, WALL.h)
  const d2 = await diffBoxes(page, 'base', 'over', 3)
  expect(d2.brighter, '반증 — over 합성은 밝아지는 픽셀을 실제로 낸다').toBeGreaterThan(200)
  // 반증 조건에서 ②의 지표도 같이 잰다(2차 [2] — 지표가 실제로 갈리는가): over면 띠가
  // 균일해져 대비 픽셀이 출하의 소수 대역으로 죽는다.
  const underOver = await bandContrast('over')
  expect(underOver.contrastPx, '반증 — over에서는 띠 안 대비가 죽는다(지표의 판별력)').toBeLessThan(under.contrastPx * 0.5)
  await page.evaluate(() => (window as any).__b2.diag.setPaintBlendForTest(false))
  await page.waitForTimeout(120)
  // #97 — 텍스처 캔버스는 DOM에 안 붙는다(전역 canvas 규칙에 안 걸린다 — 값으로)
  const domCanvasAfter = await page.evaluate(() => document.querySelectorAll('canvas').length)
  expect(domCanvasAfter, '#97 — DOM 캔버스 수 불변(텍스처는 화면 밖)').toBe(domCanvasBefore)
  OUT.multiply = {
    def: '벽(무늬 벽돌) 상자 — 칠 전/후 픽셀 밝기(알파 미리곱을 종이 위 밝기로 편 값 · 문턱 C.PAINT50_LUM_TOL). 램프 = 세로획을 y=500에서 수평으로 가로지른 픽셀별 {a,r,g,b,lum}(지시 ①의 형식 그대로). under = 분자/분모(#16). 선 = 위 모서리 상자의 어두운 픽셀 수(칠 뒤). 반증 = NormalBlending 스위치(같은 실행)',
    no_brighter: d1, edge_ramp: ramp, ramp_max_lum: rampMax, paper_lum: +paperLum.toFixed(1),
    under_pattern: under, under_pattern_over: underOver, line_under_band_dark: lineAfter,
    falsify_over: d2,
    dom_canvas: { before: domCanvasBefore, after: domCanvasAfter },
    constants_used: {
      PAINT50_LUM_TOL: cs.PAINT50_LUM_TOL, PAINT50_PATTERN_MIN_PX: cs.PAINT50_PATTERN_MIN_PX,
      PAINT50_LINE_INK_MIN_PX: cs.PAINT50_LINE_INK_MIN_PX, PAINT50_FORESHORTEN_TOL: cs.PAINT50_FORESHORTEN_TOL,
    },
    note_alpha: '이 구조의 칠은 알파가 안 떨어진다(불투명 텍스처 + 곱) — «알파가 떨어질 때 RGB가 흰색으로»의 그 병리는 대역 자체가 소멸했고, 램프가 남기는 것은 «가장자리 어디에서도 종이보다 밝지 않다»다',
  }
  OUT.gate_multiply = {
    registered: '① brighter == 0(문턱 C.PAINT50_LUM_TOL) ② ramp_max_lum ≤ paper_lum + 그 문턱 ③ 띠 안 대비 픽셀 > C.PAINT50_PATTERN_MIN_PX ④ 선 잉크 > C.PAINT50_LINE_INK_MIN_PX — 값은 constants_used가 든다(2차 [3])',
    value: 'no_brighter.brighter · ramp_max_lum · under_pattern.contrastPx · line_under_band_dark',
    reachability: '반증 스위치(setPaintBlendForTest — over)가 같은 실행에서 ①을 brighter 십만 대역으로, ③을 대비 소수 대역(under_pattern_over)으로 뒤집는다(2차 [2] — 지표별 판별력)',
    reachability_value: 'falsify_over.brighter · under_pattern_over.contrastPx',
    reachability_source: '이 파일의 falsify_over ↔ no_brighter · under_pattern_over ↔ under_pattern',
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
  OUT.orbit = {
    before, during, after,
    note_d3: 'D-3 반증 스위치 없음 — «궤도 중 소실»을 되살릴 옛 경로(48-6의 타일 제외)가 삭제됐다. 이 팔이 재는 것은 궤도 «행위» 중의 픽셀이고(문면 아님 — #94), 부정 대조는 paint48 ⑥의 tileStats.paintFrames == 0(옛 절이 안 도는 것)이다',
  }
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
  // ④ — 기대 비를 **픽스처에서 유도한다**(#88 · 1차 [4]): 면 고정 굵기의 화면 두께는
  // 그 자리의 «px/세계단위»(세로축)에 비례하고, 그것은 벽의 투영 높이에 비례한다.
  // 기대 비 = 벽 화면 높이(near x) ÷ 벽 화면 높이(far x) — 벽 외곽의 실제 투영에서 계산.
  const expected = await page.evaluate(([nearX, farX]) => {
    const w = window as any
    const rf = w.__b2.app.faces[0]
    const pr = (P: any) => w.__b2.diag.projectWith(w.__b2.app.pose, P)
    const pts = rf.outer.map(pr)
    // 벽 외곽 4점 — 위 모서리 둘·아래 모서리 둘을 x로 정렬해 높이를 선형 보간
    const xs = pts.map((p: any) => p.x)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const top = (x: number) => {
      const t = (x - x0) / (x1 - x0)
      const tops = pts.filter((p: any) => p.y < 500).sort((a: any, b: any) => a.x - b.x)
      return tops[0].y + (tops[tops.length - 1].y - tops[0].y) * t
    }
    const bot = (x: number) => {
      const t = (x - x0) / (x1 - x0)
      const bots = pts.filter((p: any) => p.y >= 500).sort((a: any, b: any) => a.x - b.x)
      return bots[0].y + (bots[bots.length - 1].y - bots[0].y) * t
    }
    const h = (x: number) => bot(x) - top(x)
    return h(nearX as number) / h(farX as number)
  }, [545, 855] as unknown[])
  const tol = (await page.evaluate(() => (window as any).__b2.diag.paint50Constants())).PAINT50_FORESHORTEN_TOL
  const ratio = near / far
  expect(Math.abs(ratio / expected - 1), `원근 — 실측 비(${ratio.toFixed(3)})가 유도 기대 비(${expected.toFixed(3)})의 허용 안`).toBeLessThan(tol)
  expect(ratio, '판별 — 화면 고정(비 1.0)이 아니다(기대와 1의 중간보다 크다)').toBeGreaterThan((1 + expected) / 2)
  // ⑤ — 경계 밖 절단: 벽 왼 모서리(x=500) 왼쪽·오른 모서리(x=900) 오른쪽에 칠이 없다
  const leftOut = at(488), rightOut = at(915)
  expect(leftOut, '왼 경계 밖 0').toBe(0)
  expect(rightOut, '오른 경계 밖 0').toBe(0)
  OUT.foreshorten_clip = {
    def: '경계를 일부러 지나는 마커 획 — 열별 파란 띠 두께(물리 px · ±2열 평균). near=545css · far=855css · 밖=488/915css. 기대 비 = 벽 투영 높이 비(픽스처에서 유도 — #88)',
    near_px: +near.toFixed(1), far_px: +far.toFixed(1), ratio: +ratio.toFixed(3),
    expected_ratio: +expected.toFixed(3), tol_registered: 'C.PAINT50_FORESHORTEN_TOL', tol_value: tol,
    note_dpr_bias: '실측/기대 잔차가 두 dpr 다 양의 방향(2차 [9]) — 띠 두께 계수(채널 차 문턱·±2열 평균·AA)의 dpr 의존 편의로 본다. 유보로 남긴다 — 문 안이고 방향이 판정(화면 고정 1.0과의 판별)을 돕는 쪽이다',
    screen_fixed_would_give: 1.0,
    left_out_px: leftOut, right_out_px: rightOut,
    note_hole: '개구부 «구멍»의 픽셀 팔은 없다 — 기하는 단위(facetex.test 개구부)가 잰다. 경계 절단이 같은 기제(메시가 텍스처를 문다)의 바깥판이다. ⚠ #5의 지위: 메시 밖 래스터화는 구성상 없다 — 이 0/0이 재는 것은 «splitByFace·메시·uv 배선이 경계를 같은 자리에 긋는가»다',
    note_rebake: '⚠ «면 경계가 바뀌면 다시 굽는다»(지시 문면)의 픽셀 실측은 없다 — 재굽기 캐시 키가 docVersion이라 경계 변경이 재굽기를 지나는 것은 구성이고(#5), 그 실측 픽스처(경계 획 이동)는 DEFERRED다',
  }
  OUT.gate_foreshorten_clip = {
    registered: 'C.PAINT50_FORESHORTEN_TOL — |실측/기대 − 1| < 그 값 · 실측 > (1+기대)/2(화면 고정 배제) · 경계 밖 두 자리 0',
    value: 'ratio · expected_ratio · left_out_px · right_out_px',
    reachability: '화면 고정(옛 구조)이면 비 1.0 — 기대에서 −19% 대역이라 두 문 다 밖이다(분석 경계 — 스위치 없음: 옛 경로가 삭제됐다)',
    reachability_value: 'screen_fixed_would_give',
    reachability_source: '이 파일의 ratio ↔ expected_ratio',
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
  // 귀속 — 건너편 0의 이유가 «쪽»이다: 텍스처는 서 있고(level > 0) visible만 거짓
  const behindTex = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  expect(sceneInk, '건너편에서 장면(획·면)이 보인다 — «안 그려져서 0»과 가른다').toBeGreaterThan(2000)
  expect(behind, '칠만 없다').toBe(0)
  expect(behindTex.length, '텍스처는 살아 있다(버리지 않고 접혔다)').toBeGreaterThan(0)
  expect(behindTex.every((t: any) => t.visible === false), '접힌 이유가 쪽이다(visible 거짓)').toBe(true)
  // 복원 — 원 포즈 통째로(한 번 더 뒤집기 ⛔)
  await page.evaluate((sv) => {
    const w = window as any
    w.__b2.app.pose = sv
    w.__b2.diag.invalidate?.()
  }, flipped.saved)
  await page.waitForTimeout(250)
  const restored = await blueInk(page, WALL.x, WALL.y, WALL.w, WALL.h)
  expect(restored, '돌아오면 칠이 돌아온다').toBeGreaterThan(200)
  // 귀속(rep49 2차 [4]의 그 규약) — «왜 안 보였나»가 쪽이었음을 판정 내역으로.
  // 건너편 프레임에서 이미 원 포즈로 돌아왔으므로 지금 것은 «보임» 확인이고,
  // 건너편의 귀속은 behindGate가 든다(위에서 읽어 뒀어야 한다 — 다음 편집에서 읽는다).
  const texNow = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  OUT.side = {
    before, behind, scene_ink_behind: sceneInk, restored,
    tex_behind: behindTex, tex_after_restore: texNow,
    note_identity: 'restored == before(정확 일치가 나올 수 있다)는 **설계 보장**이다(§5.1 유형 3 — 같은 포즈·같은 문서의 재렌더). 이 팔의 측정은 behind == 0(쪽이 접는다)이고 복원은 그 대조의 닫음일 뿐 임계를 안 건다(rep49 [12]의 그 표기)',
    note_d3: 'D-3 — 반증 스위치 없음: 쪽 게이트를 끄는 손잡이를 안 만들었다(paintVisible 계열의 단위 반증은 test/mats46 ④가 든다). 건너편 0의 귀속(쪽 때문 — 밀도·미배치 아님)은 장면 잉크 > 0과 tex의 visible=false가 가른다',
  }
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
  OUT.derived = {
    hash_base: base, hash_corrupted: corrupted, hash_rebaked: rebaked, textures: n, file_bytes: txt.length,
    note_identity: 'rebaked == base(정확 일치)는 **설계 보장**이다(§5.1 유형 3 — 결정론 굽기의 항등 · 임계 아님). 이 팔의 측정은 가운데 단계다: corrupted ≠ base(오염이 화면에 실제로 보였다 — 이것이 없으면 회복 항등은 아무것도 안 잰다 · D-3)',
  }
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
  // 하향 양자화의 실측(1차 [8] — levels가 전부 같은 값이면 «작으면 낮게»를 이 장면이
  // 안 시험한 것이다): 종이 줌 아웃(휠)으로 화면 투영을 줄이고 단계가 실제로 내려가는가.
  await page.mouse.move(600, 450)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(60) }
  await page.waitForTimeout(300)
  const texesOut = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  const maxOut = Math.max(...texesOut.map((t: any) => t.level))
  expect(maxOut, '줌 아웃에서 단계가 실제로 내려간다(하향 양자화 실측)').toBeLessThan(maxLevel)
  OUT.tex_budget = {
    def: '분할 두 벽(면 faceN — ⚠ 지시 목표 «20 이상»에 셋 모자란다: rep49 frame20의 그 픽스처 그대로다. note_89 참조) + 칠 40붓 — 텍스처 수·단계 분포·합계 바이트(w·h·4). 프레임은 같은 장면 전/후 «차»(#82) — 잡음 바닥(before↔before2)과 함께 읽는다',
    faces: faceN, paint_strokes: paintN,
    textures: texes.length, levels: texes.map((t: any) => t.level), bytes_total: bytes,
    screen_px_prequant: texes.map((t: any) => t.screenPx),      // 양자화 «전» 값(2차 [8])
    clamped: texes.map((t: any) => t.clamped),                  // 상한 포화 여부 — 단일 levels의 정체를 가른다
    levels_zoomed_out: texesOut.map((t: any) => t.level), max_level_zoomed_out: maxOut,
    max_level: maxLevel, cap: cMax.FACETEX_MAX_PX, min: cMax.FACETEX_MIN_PX,
    before_ms: before, before2_ms: before2, noise_floor_ms: noise, after_ms: after,
    delta_median_ms: +(after.median - before2.median).toFixed(2),
    delta_p90_ms: +(after.p90 - before2.p90).toFixed(2),
    note_cap: '상한 1024의 근거 — 장당 최악 1024²×4=4.19MB(2048이면 16.7MB — 4배)이고 이 장면의 실제 합은 bytes_total이다(긴 변만 단계라 장당 그보다 작다). «상한을 올리면 커진다»는 **clamped가 참인 장에만** 걸리는 산술이다(2차 [8]) — 이 장면은 clamped 합이 그 판정이다(0이면 상한 증설에 불변 · dpr2의 단일 1024도 포화가 아니라 올림 양자화일 수 있다 — screen_px_prequant가 가른다). 상한을 실제로 누르는 것은 큰 면·줌 인 장면이고 실기기 관측 판정자다(DEFERRED)',
    note_89: '목표 «스무 면»에 못 미치면 faces 값이 그 사실이다 — 상한을 조용히 줄이지 않는다(rep49 note_89 그대로 · 같은 픽스처가 세운 면이 17이다)',
    note_levels: '기본 줌의 levels가 전부 같은 값인 것은 이 장면의 셀들이 비슷한 화면 크기라서다 — «작으면 낮게»의 실측은 levels_zoomed_out(줌 아웃에서 단계 하강)이 든다',
    note_82: '중앙값이 vsync 바닥(16.7ms)에 붙은 실행에서는 차의 해상도가 눈금뿐이다(rep49 frame20의 그 유보 그대로). ⚠ dpr2의 delta_median_ms가 잡음 바닥 밖인 것은 헤드리스 소프트웨어 GL의 채움 비용 의심 — DEFERRED web2-50 행 · 실기기 관측 판정자',
  }
})

test('옛 칠 알림 — 45~48 형식의 문서를 «열면» 화면에 한 줄이 실제로 뜬다(#94 — 행위)', async ({ page }) => {
  // 파서 단위(mats46 ②)는 셈까지고, 지시 문면은 「문서를 **열 때** 알려라」다 — 여는
  // 행위(자동 저장 복원)를 실제로 일으켜 #notice의 문구를 읽는다.
  await bigBox(page)
  await pickMarker(page, '#1e7fd0', 14)
  await drawLine(page, 560, 640, 620, 360)
  await page.waitForTimeout(300)
  const txt: string = await page.evaluate(() => (window as any).__b2.diag.serialize())
  const j = JSON.parse(txt)
  const jp = j.strokes.find((s: any) => s.paint !== undefined)
  jp.paint = { f: jp.paint.f, s: jp.paint.s, c: '#c07a5b', i: 1, w: 10 }   // 48 형식(uv 없음)
  const { putSaved, bootDone } = await import('./store43')
  await putSaved(page, JSON.stringify(j))
  await page.goto('/')                       // ⚠ reload면 ?reset이 다시 붙어 저장소가 비워진다
  // 알림은 2.5s 창이라(#notice — notify의 그 수명) 이동 «직후부터» 문구를 기다린다 —
  // 부팅 뒤 고정 대기(초판)는 dpr2의 느린 부팅에서 창을 놓쳤다(실측 — 빈 문자열).
  const noticeText = await page.waitForFunction(() => {
    const s = document.getElementById('notice')?.textContent ?? ''
    return s.includes('옛 칠') ? s : null
  }, null, { timeout: 8000 }).then(h => h.jsonValue() as Promise<string>).catch(() => '')
  await bootDone(page)
  expect(noticeText, '여는 순간 화면의 한 줄이 «옛 칠»을 말한다').toContain('옛 칠')
  const kept = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(kept, '나머지(선·면)는 그대로 열렸다').toBe(j.strokes.length - 1)
  // 부정 대조(D-3 · 2차 [11] — «뜬다»만 세면 있는 쪽으로 세어진다 #96): 현행 형식(성한
  // 저장물)에서는 그 문구가 **안** 뜬다.
  await putSaved(page, txt)
  await page.goto('/')
  await bootDone(page)
  await page.waitForTimeout(400)
  const noticeClean = await page.evaluate(() => document.getElementById('notice')?.textContent ?? '')
  expect(noticeClean, '부정 대조 — 성한 파일에서는 그 줄이 없다').not.toContain('옛 칠')
  OUT.old_paint_notice = {
    def: '48 형식(uv 없음) 칠 1획이 든 저장물을 자동 저장 자리에 넣고 새로 고침 — #notice의 문구(행위 판 · #94)와 살아남은 획 수. 부정 대조 = 현행 형식 저장물의 같은 절차(문구 없음)',
    notice: noticeText, notice_clean: noticeClean, strokes_saved: j.strokes.length, strokes_kept: kept,
  }
})

test('원장', async () => {
  // ⚠ 전면 writeFileSync ⛔ — #99가 잡은 누산기 위험(brush51에서 부분 실행 5열쇠가 16열쇠
  // 파일을 덮은 실측 — 2차 대응 중). 쓰기는 afterEach 병합 하나뿐이다.
  OUT.constants_used = { note: 'web2 라인은 constantsSnapshot 기계가 없다(라인 유보 — lens31의 no_constants_snapshot이 정본)' }
  ;(OUT as any).no_constants_snapshot = true
  ;(OUT as any).pitfall_citations = [5, 12, 16, 54, 80, 82, 88, 92, 94, 97]
  ;(OUT as any).fixture_axes = {
    note_12: 'D-5의 축 배분(#12): dpr 1·2 = 이 파일 둘 다 · 도구 = 마커(이 파일)·붓(paint45 ①)·색연필(mats46 ④) · 면 분류(벽·슬라브·경사)와 축척 유/무 = 단위(facetex.test — uv 왕복이 세 분류를 돈다 · uv는 축척 무관이 설계) · 개구부 = 단위(삼각분할) + 경계 절단(e2e ⑤)',
  }
})
