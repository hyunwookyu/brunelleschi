// web2-46 — 재료의 **화면 몫**. 상태·저장·무늬 생성은 단위 팔(test/mats46*.test.ts)이
// 재고, 여기서는 픽셀만(재는 자리가 결과의 자리다 — #92):
//   ① 칠통 — 붓 재누름이 통을 열고, 견본 선택이 화면과 같은 상태에 실린다(#88)
//   ② 마커 겹침 — 겹 수(1·2·3)에 따라 칠 자국의 퇴적이 실제로 단조 증가한다(스윕 #12)
//      + 반증(D-3): 겹 0끼리(1획 두 구역)의 차는 그 계단보다 작다
//   ③ 마커 경계 — 획 끝(팁)의 퇴적이 몸통 가운데보다 진하다(«경계가 살짝 남는다»의 실측)
//   ④ 색연필 — 같은 길이 획의 잉크 띠 두께가 마커보다 실제로 가늘다
//   ⑤ 면 재료 — 손통 「재료」가 해칭의 무늬(선분 수)와 색을 실제로 바꾼다
//   ⑥ 깊이 순서 «픽셀» 판별(45 DEFERRED 몫) — 이색 해칭 겹침에서 위에 선 색이 앞 면의
//      것이다. D-3 반증: 화가 알고리즘을 끄면(diag.setFaceSort(false)) 그 판별값이 준다
//   ⑦ 성능 — 획 200 장면(재료 칠 포함)의 전량 재그리기 ms(원장 — 판정은 실기기 몫)
//
// 원장: stage0/out/mats46_e2e_web2_<dpr>.json (LEDGER=1 — #90 · dpr별 파일 — 픽셀은 dpr의 함수)
// ⚠ #93 — 모든 획의 시작점을 잡힘 반경(16px)·기존 획 위에서 떼어 둔다(450ms 누름 진입).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-46 — 화면 몫: 칠통 · 마커 겹침 누적/경계 · 색연필 굵기 · 면 재료 해칭 · 깊이 순서 픽셀 판별 · 200획 성능',
  note_92: '#92 — 판정자는 픽셀 퇴적(알파 합·채널 차)이다. 「마커를 골랐다」는 이름표라 안 센다',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 방(바닥+벽) — paint45와 같은 픽스처(두 자리에 다른 장면 ⛔) */
async function room(page: Page) {
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
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)
  await page.mouse.click(550, 430); await page.waitForTimeout(60)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 둘이 섰다').toBe(2)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
}

/** ⚠ web2-50 — 자가 #brushc → **#gl**(면 텍스처)로 옮겨 갔다. 칠한 면의 불투명 채움
 *  (48-9)이 상자 전체에 알파 255를 깔므로 **알파 합은 더 이상 아무것도 못 가른다** —
 *  퇴적의 자는 **안료 합**(알파 가중 어두움) 하나다. 채움의 어두움(765−726=39/px)은
 *  세 상자에 똑같이 깔리는 바닥이라 겹 «계단»(차)에는 안 실린다. dpr 정규화는 안 한다. */
const inkSums = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let alpha = 0, pigment = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!
      alpha += a
      if (a > 0) pigment += (a / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!)
    }
    return { alpha, pigment: Math.round(pigment) }
  }, [x, y, w, h])

/** 사각 안 «채색» 띠의 세로 두께(px·물리) — 채도(최대−최소 채널 > 15)가 있는 행의 수.
 *  ⚠ web2-50: 알파(>8)로 세면 불투명 채움이 전 행을 채운다 — 마커·색연필의 «색»이 자다
 *  (종이색 채움은 채널 차 7이라 안 걸린다 · 흑연·선은 무채색). */
const inkRowCount = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let rows = 0
    for (let r = 0; r < t.height; r++) {
      for (let c = 0; c < t.width; c++) {
        const i = (r * t.width + c) * 4
        if (d[i + 3]! > 8) {
          const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!), mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!)
          if (mx - mn > 15) { rows++; break }
        }
      }
    }
    return rows
  }, [x, y, w, h])

/** 마커·재료를 UI로 고른다 — 칠통 경로(견본 클릭이 결과에 실리는 그 배선을 지난다) */
async function pickMarker(page: Page, matId: string, tone: number) {
  await page.click('#btn-paint')                     // 도구
  await page.click('#btn-paint')                     // 재누름 — 칠통
  await page.click(`#swatch-${matId}-${tone}`)       // 견본 → 재료+톤, 도구 마커로
  await page.click('#btn-paint-marker')              // 명시(견본이 이미 마커로 돌린다 — 멱등)
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(150, 700)                   // 통 밖 — 접는다(빈 종이 구석)
  await page.waitForTimeout(60)
}

test('① 칠통 — 재누름이 열고 · 견본이 화면과 같은 상태에 실린다(#88)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('paint')
  expect(await page.locator('#painttray.open').count(), '한 번에는 안 열린다(도구 선택)').toBe(0)
  await page.click('#btn-paint')
  expect(await page.locator('#painttray.open').count(), '재누름이 연다').toBe(1)
  const rows = await page.locator('#painttray .rrow').count()
  // ⚠ web2-48이 10으로(자동 빠짐 · 크기·휠 들어옴), web2-51이 11로(연필 — 넷째 도구),
  // web2-52가 15로(재료 다섯 → 여덟 + 프리셋 줄), **web2-54가 16으로**: 「정면」 줄
  // (btn-paint-front — 54-3 · 고른 면을 정면으로 보고 다시 누르면 돌아온다).
  // 이 팔이 지키는 요구(「자리마다 무엇이 있는지가 값으로 못 박혀 있다」)는 그대로이고
  // **표가 늘어난 것**이다(#75 ㉣) — 이 팔이 실제로 그 추가를 잡았다(54 회차 실측).
  expect(rows, '도구 넷 + 정면 + 크기 + 프리셋 + 휠 + 재료 여덟(54 — 4+1+1+1+1+8)').toBe(16)
  await page.click('#swatch-wood-2')
  const sel = await page.evaluate(() => (window as any).__b2.diag.mats46().paintSel)
  // ⚠⚠ **web2-48 48-7이 상태의 모양을 바꿨다**: (재료, 톤) 쌀이 아니라 **색 hex 하나**다
  // (색의 출처가 둘이면 「고른 색」과 「나가는 색」이 갈린다 — #54). 견본은 **그 색을
  // 휠에 실는 여러 길 중 하나**가 됐고, 견본이 가리키던 값은 그대로다(무손실).
  expect(sel.hex, '견본 = 그 톤의 색(나무 · 그림자)').toBe('#8a6238')
  expect(sel.i, '재료를 고르면 재료 도구로(주력 마커)').toBe('marker')
  expect(sel.w, '굵기는 크기 트레이의 값이다(48-2)').toBeGreaterThan(0)
  expect((sel as Record<string, unknown>).m, '⛔ (재료, 톤) 쌀은 상태에 안 남는다').toBeUndefined()
  await page.click('#btn-paint-cp')
  const sel2 = await page.evaluate(() => (window as any).__b2.diag.mats46().paintSel)
  expect(sel2.i).toBe('cp')
  // ⛔ `#btn-paint-auto`(「톤 자동」)는 **48-8이 기능째 없앨다** — 단추가 없는 것을 재는 것이
  // 이제 이 줄의 일이다(남기면 다음 회차가 «있으니 쓴다»로 되살린다 — #65).
  expect(await page.locator('#btn-paint-auto').count(), '「톤 자동」은 없다(48-8)').toBe(0)
  // 그 자리에 들어온 것 둘이 실제로 서 있다
  expect(await page.locator('#paint-wheel-cv').count(), '색상 휠이 기본이다(48-7)').toBe(1)
  // 58-1 — 다섯 칸 트레이는 슬라이더로 대체됐다(D-W26 · R1 오적용 철회)
  expect(await page.locator('#paint-size-range').count(), '크기 슬라이더(58-1)').toBe(1)
  expect(await page.locator('#paint-sizes .sizebtn').count(), '이산 칸은 없다(철회의 값)').toBe(0)
  OUT.tray = { rows, sel_after_swatch: sel, sel_after_cp: sel2.i }
  OUT.constants_used = await page.evaluate(() => (window as any).__b2.diag.mats46().constants)
})

test('②③ 마커 — 겹침 퇴적 단조(1·2·3겹 스윕) · 끝(팁)이 몸통보다 진하다', async ({ page }) => {
  await room(page)
  await pickMarker(page, 'brick', 1)
  // 벽(x 505..595 · y 385..500) 안 세 구역 — 같은 길이의 가로획을 1·2·3번 겹긋는다.
  // ⚠ 시작점 (505,y)는 기존 획(모서리 x=500)에서 5px — 잡힘 반경 16px 안이다(#93) →
  //   x=520에서 시작해 화면상 같은 선 위를 왕복한다.
  const runs: { y: number; n: number }[] = [{ y: 400, n: 1 }, { y: 430, n: 2 }, { y: 460, n: 3 }]
  for (const r of runs) {
    for (let k = 0; k < r.n; k++) await drawLine(page, 520, r.y, 580, r.y)
  }
  await page.waitForTimeout(150)
  /** ⚠ web2-50 — 마커의 겹침 퇴적이 **텍스처의 canvas 'multiply'**로 옮겨 갔다(기제
   *  교체 · 계약 유지). spacing 반증(p5.brush의 그 손잡이)은 이 경로에 안 닿는다 —
   *  대신 **알파 포화 반증**: 마커 알파를 1.0으로 굽으면 첫 획이 포화해 겹 계단이
   *  죽는다(setMarkerAlphaForTest — 같은 획·같은 상자·재굽기 경로 그대로). */
  const measureRows = async () => {
    const rows: { alpha: number; pigment: number }[] = []
    for (const r of runs) rows.push(await inkSums(page, 520, r.y - 8, 60, 16))
    return rows
  }
  const sums = await measureRows()                  // 출하(multiply · C.PAINT_MARKER_ALPHA)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(true))
  await page.waitForTimeout(250)
  const sat = await measureRows()                   // 반증짝 — 평면 덮어쓰기(계단이 죽는 대역)
  await page.evaluate(() => (window as any).__b2.diag.setMarkerFlatForTest(false))
  await page.waitForTimeout(250)
  // 단조의 자는 **안료 합** 하나다 — 알파는 불투명 채움(48-9)이 포화시킨다(자 주석)
  expect(sums[1]!.pigment, '2겹 > 1겹(안료)').toBeGreaterThan(sums[0]!.pigment)
  expect(sums[2]!.pigment, '3겹 > 2겹(안료)').toBeGreaterThan(sums[1]!.pigment)
  // 반증(D-3) — 같은 1획끼리(왼 반·오른 반)의 차는 겹침 계단(2겹−1겹)보다 작다
  const halfA = await inkSums(page, 520, 392, 30, 16)
  const halfB = await inkSums(page, 550, 392, 30, 16)
  const step = sums[1]!.pigment - sums[0]!.pigment
  expect(Math.abs(halfA.pigment - halfB.pigment), '반증 — 겹 0의 차 < 겹침 계단').toBeLessThan(step)
  // 평면 덮어쓰기 반증 — 겹쳐도 같은 색(source-over·알파 1)이라 계단이 출하의 절반 아래로
  // 죽는다. ⚠ «알파 1.0의 multiply»는 반증이 못 됐다(상대 계단 0.44 실측 — 곱은 알파
  // 1에서도 계속 어두워진다). 그 실패가 이 짝을 골랐다(D-3 — 반증은 실제로 실패해야 한다).
  const rel = (rows: { pigment: number }[]) => (rows[1]!.pigment - rows[0]!.pigment) / Math.max(1, rows[0]!.pigment)
  expect(rel(sat), '평면 덮어쓰기의 겹 계단(상대) < 출하의 절반 — 누적은 multiply×알파의 것이다').toBeLessThan(rel(sums) / 2)
  OUT.marker_overlap = {
    def: '같은 길이(60px) 가로획을 같은 자리에 1·2·3번 — 상자(60×16)의 안료 합(알파 가중 (765−r−g−b) · #gl — 채움 바닥은 세 상자에 공통이라 계단에 안 실린다). 반증 짝 = ① 1획의 왼/오른 반쪽 차 ② 평면 덮어쓰기 재굽기(setMarkerFlatForTest — 겹침이 안 쌓이는 대역)',
    alpha_ship: 'C.PAINT_MARKER_ALPHA(원장 constants 블록)',
    rows_ship: sums, rows_flat: sat,
    rel_step_1to2_ship: +rel(sums).toFixed(4), rel_step_1to2_flat: +rel(sat).toFixed(4),
    half_diff_pigment: Math.abs(halfA.pigment - halfB.pigment), step_1to2_pigment: step,
    note_failed_falsify: '알파 1.0(multiply 유지) 판은 상대 계단 0.44로 절반 문을 못 넘었다 — multiply는 알파 1에서도 누적한다. 그 실측이 반증 짝을 source-over로 굳혔다',
    note_flat_residual: '평면 덮어쓰기의 잔여 계단(rows_flat의 수 % 대역 — 50 2차 [12])은 가장자리 AA 몫이다: 획마다 경계 반픽셀이 다시 칠해져 조금 진해진다. 문(출하의 절반 미만)은 그 잔여를 포함하고도 선다',
  }
  OUT.gate_marker_monotonic = {
    registered: '판정 셋: ① 출하에서 안료 합 1<2<3겹 단조 ② 출하 계단(1→2겹) > 겹0 잡음(half_diff) ③ 대조: rel_step_1to2_flat < rel_step_1to2_ship / 2',
    value: 'rows_ship 안료 열 · rel 두 필드',
    reachability: '평면 덮어쓰기 팔이 ③을 실제로 위협하는 값을 같은 실행에 낸다 — 겹침이 픽셀에 안 쌓이는 대역의 실재',
    reachability_value: 'rel_step_1to2_flat (dpr별 원장 값)',
    reachability_source: '이 파일의 marker_overlap/rel_step_1to2_flat ↔ rel_step_1to2_ship',
  }
  // ③ 경계 잔존 — 본 측정은 **솔기**다(1차 [12] — 지시 문면 「획 경계가 살짝 남는다」):
  // 나란한 두 획을 반폭 겹치면 겹친 띠(솔기)가 양쪽 몸통보다 진하게 남는다.
  await drawLine(page, 520, 486, 580, 486)
  await drawLine(page, 520, 492, 580, 492)          // 6px 아래 — 반폭 겹침(마커 폭 10px)
  await page.waitForTimeout(150)
  // ⚠ 고정 상자 두 판이 연속으로 «아래 몸통»을 10배 얕게 쟀다(2차 [1] · 재실측 — 상자를
  // 획 «안»으로 옮겨도 289 vs 3009). 마커 띠의 세로 프로파일이 경로 중심에 대칭이라는
  // 가정이 틀린 것이다(D-4). 가정을 버리고 **행별 프로파일을 직접 잰다**(D-1): 잉크 띠를
  // 스스로 찾고, 띠의 가운데 1/3(두 획이 겹치는 솔기 대역)이 바깥 1/3들보다 진한가를 본다.
  const profile = await page.evaluate(() => {
    // ⚠ web2-50 — #gl에서 잰다. 채움(48-9)의 안료 바닥이 전 행에 깔리므로 띠 탐지는
    // **바닥(min)을 뺀 값**으로 한다 — «획이 없는 행 = 0»이 그 보정으로 복원된다.
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const x0 = Math.round(535 * dpr), w = Math.round(30 * dpr)
    const y0 = Math.round(474 * dpr), h = Math.round(30 * dpr)
    const t = document.createElement('canvas')
    t.width = w; t.height = h
    const g = t.getContext('2d')!
    g.drawImage(src, x0, y0, w, h, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const rows: number[] = []
    for (let r = 0; r < h; r++) {
      let pig = 0
      for (let c = 0; c < w; c++) {
        const i = (r * w + c) * 4
        const a = d[i + 3]!
        if (a > 0) pig += (a / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!)
      }
      rows.push(Math.round(pig))
    }
    const base = Math.min(...rows)
    return rows.map(v => v - base)   // CSS 474..504 대역의 물리 행별 안료(바닥 보정)
  })
  const peak = Math.max(...profile)
  const band = profile.map((v, i) => ({ v, i })).filter(r => r.v > peak * 0.05)
  const bi = band.map(r => r.i)
  const lo = bi[0]!, hi = bi[bi.length - 1]!
  const third = Math.max(1, Math.floor((hi - lo + 1) / 3))
  const mean = (a: number, b: number) => {
    let s2 = 0, n = 0
    for (let i = a; i <= b; i++) { s2 += profile[i]!; n++ }
    return s2 / Math.max(1, n)
  }
  const outerTop = mean(lo, lo + third - 1)
  const middle = mean(lo + third, hi - third)
  const outerBot = mean(hi - third + 1, hi)
  expect(bi.length, '잉크 띠가 실제로 있다').toBeGreaterThan(6)
  expect(middle, '솔기 대역(띠 가운데 1/3)이 위 몸통보다 진하다').toBeGreaterThan(outerTop)
  expect(middle, '솔기 대역이 아래 몸통보다 진하다').toBeGreaterThan(outerBot)
  // ⚠ 팁(끝) 잔존 — **51의 몫으로 이관됐다**(web2-50은 구조만: 텍스처의 둥근 획은 끝
  // 덧찍음이 없다 — «획 경계가 살짝 남는다»의 질은 51 «자국의 질»이 절차 생성으로 세운다).
  OUT.marker_tip = {
    deferred_to_51: '⚠ 문면 갱신(51): 팁이 **51에서 섰다** — 값은 brush51_web2_*.json의 marker_tip(끝/몸통 1.05배 문 · 평면 덮어쓰기 반증)이 든다. (50 시점 문면: 50의 캔버스 획은 균일했다 — 그 이관 기록으로 남긴다)',
  }
  OUT.marker_seam = {
    def: '나란한 두 획(y486·y492 — 반폭 겹침)의 **행별 안료 프로파일**(x 535..565 · y 474..504 물리 행). 띠 = 안료 > 피크 5%인 행들 · 판정 = 띠 가운데 1/3(솔기 대역) 평균 > 바깥 1/3 평균 둘 다. 고정 상자 두 판이 «띠가 경로에 대칭»이라는 틀린 가정으로 아래 몸통을 10배 얕게 쟀다(2차 [1] — 그 관측이 이 재설계의 사유. 프로파일이 원장에 있으므로 비대칭 자체가 값으로 남는다). ⚠ half_diff_pigment(y392 반쪽 상자 차)와 계산이 다르다(2차 [13] — dpr1에서 값이 3338로 우연히 같았던 것)',
    profile_rows: profile, band: [lo, hi],
    middle_mean: +middle.toFixed(0), outer_top_mean: +outerTop.toFixed(0), outer_bot_mean: +outerBot.toFixed(0),
  }
  // **톤이 픽셀을 바꾼다**(2차 PITFALLS 대조 — #92: gate_suggest_not_default가 판정하는
  // 톤 인덱스는 이름표다. 그 이름표가 결과의 자리(픽셀)를 실제로 움직이는 것을 여기서 잇는다):
  // 같은 재료(벽돌)의 밝음(0)·그림자(2)를 같은 길이로 긋고 안료 합을 비교한다.
  await page.click('#btn-paint')
  await page.click('#swatch-brick-0')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 520, 415, 545, 415)
  await page.click('#btn-paint')
  await page.click('#swatch-brick-2')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 555, 415, 580, 415)
  await page.waitForTimeout(150)
  const tone0 = await inkSums(page, 522, 408, 20, 14)
  const tone2 = await inkSums(page, 557, 408, 20, 14)
  expect(tone2.pigment, '그림자 톤의 안료가 밝음 톤보다 크다 — 톤 인덱스가 픽셀에 실린다').toBeGreaterThan(tone0.pigment)
  OUT.tone_pixel = {
    def: '같은 재료(벽돌) 밝음(0)·그림자(2)의 같은 길이(25px) 획 — 20×14 상자 안료 합. gate_suggest_not_default의 톤 인덱스(이름표)가 픽셀(자리)을 바꾸는 것의 연결 고리(#92 ②)',
    tone0: tone0.pigment, tone2: tone2.pigment,
  }
})

test('④ 색연필 — 같은 길이 획의 잉크 띠가 마커보다 가늘다', async ({ page }) => {
  await room(page)
  // ⚠⚠ web2-50 — 계약 갱신: «가늘다»는 p5.brush cpencil 촉의 성질이었고 51(자국의 질)이
  // 절차 생성으로 되세운다(51 지시 «색연필: 결이 굵고 색이 완전히 덮이지 않는다»).
  // 50이 지키는 몫은 **«완전히 덮이지 않는다»**다(PAINT_CP_ALPHA < 1 · source-over):
  // 마커 띠 위에 색연필을 겹치면 아래 마커의 색이 남는다 — 겹친 자리는 색연필 단독
  // 자리와 다른 색이어야 한다.
  await pickMarker(page, 'wood', 1)
  await drawLine(page, 520, 410, 580, 410)          // 마커 획(가로)
  await page.click('#btn-paint')                    // 이미 붓 도구 — 재누름 한 번이 연다
  await page.click('#swatch-brick-2')               // 색을 확 바꾼다(그림자 벽돌 — 어두운 적)
  await page.click('#btn-paint-cp')
  await page.mouse.click(150, 700); await page.waitForTimeout(60)
  await drawLine(page, 545, 380, 545, 445)          // 색연필 획(세로 — 마커를 가로지른다)
  await page.waitForTimeout(200)
  const rgbAt = (x: number, y: number, w: number, h: number) =>
    page.evaluate(([x0, y0, ww, hh]) => {
      const src = document.getElementById('gl') as HTMLCanvasElement
      const dpr = window.devicePixelRatio || 1
      const t = document.createElement('canvas')
      t.width = Math.max(1, Math.round(ww! * dpr))
      t.height = Math.max(1, Math.round(hh! * dpr))
      const g = t.getContext('2d')!
      g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
      const d = g.getImageData(0, 0, t.width, t.height).data
      let r = 0, gg = 0, b = 0, n = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]!; gg += d[i + 1]!; b += d[i + 2]!; n++ }
      return { r: r / n, g: gg / n, b: b / n }
    }, [x, y, w, h])
  const cpOnly = await rgbAt(541, 425, 8, 10)       // 색연필 단독(마커 아래 · 교차 밖)
  const crossed = await rgbAt(541, 405, 8, 10)      // 교차(마커 위 색연필)
  const dist = Math.hypot(cpOnly.r - crossed.r, cpOnly.g - crossed.g, cpOnly.b - crossed.b)
  expect(dist, '겹친 자리가 색연필 단독과 다른 색 — 아래 마커가 비친다(«완전히 덮이지 않는다»)').toBeGreaterThan(8)
  // **잃은 거동의 실측**(50 리뷰어 [15] — 조용히 빼지 않는다): 같은 트레이 값의 마커·색연필
  // 띠 두께가 새 구조에서 **안 갈린다** — 46의 «가늘다»는 p5 촉의 성질이었고 여기서 잃었다.
  // 단언하지 않고 값으로 남긴다(단언하면 늘 빨갛다 — 51이 되세울 때 이 값이 «전»이다).
  const markerRows = await inkRowCount(page, 535, 396, 30, 28)
  const cpRows = await inkRowCount(page, 528, 380, 34, 70)   // 세로획 — 존재 확인(두께 자 아님)
  // 잃은 거동을 **대등한 자**로 기록한다(50 2차 [6]㉡ — 문면 숫자가 아니라 필드로):
  // 색연필 «가로» 획을 마커와 같은 창 모양(30×28)으로 재서 두 행 수를 나란히 남긴다.
  await drawLine(page, 520, 478, 580, 478)
  await page.waitForTimeout(200)
  const cpRowsH = await inkRowCount(page, 535, 464, 30, 28)
  OUT.cp_thin_lost = {
    def: '같은 트레이 값(기본)의 마커 가로띠 ↔ 색연필 가로띠 두께(행 수 · 같은 창 30×28 — 대등한 자). 46은 cp가 ~1/3였다(46 시점 원장 — 역사). ⚠ 문면 갱신(51): cp의 질(구멍 있는 피복)은 51이 되세웠다 — brush51 cp_coverage가 그 값이다. 도구별 «두께» 차 자체는 51도 안 가른다(굵기는 트레이 값 하나 — 원칙 e). (50 시점 문면: 잃은 거동의 값이 이 두 필드다 — 이관 기록으로 남긴다 · 단언하지 않는다)',
    marker_rows: markerRows, cp_rows_h: cpRowsH, cp_vertical_present_rows: cpRows,
    lost: '«가늘다»(같은 트레이에서 도구별 두께 차) — marker_rows ↔ cp_rows_h가 같은 대역인 것이 그 손실의 실측이다',
  }
  OUT.cp_vs_marker = {
    def: '마커(나무 톤) 가로띠를 색연필(벽돌 그림자 톤 — 다른 색)이 세로로 가로지른다 — 교차 상자 평균 RGB ↔ 색연필 단독 상자 평균 RGB의 거리. 0에 가까우면 «완전히 덮는다»(계약 위반)',
    cp_only: cpOnly, crossed, rgb_dist: +dist.toFixed(1),
    deferred_to_51: '«가늘다»(굵기 성질)는 p5.brush 촉의 것이었다 — 51 «자국의 질»이 절차 생성으로 되세운다(50은 구조만)',
  }
})

test('⑤ 면 재료 — 손통 「재료」가 해칭 무늬·색을 실제로 바꾼다', async ({ page }) => {
  await room(page)
  // 벽을 잡고 채움을 켠다(45 ③의 경로 그대로)
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(550, 432)
  await page.mouse.down(); await page.waitForTimeout(ms + 300); await page.mouse.up()
  await page.waitForTimeout(60)
  expect((await page.evaluate(() => (window as any).__b2.diag.grip44())).faceId).not.toBeNull()
  await page.click('#btn-grip'); await page.click('#btn-grip-fill')
  await page.waitForTimeout(150)
  const segs0 = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  expect(segs0, '기본 해칭이 섰다').toBeGreaterThan(4)
  // 재료 한 걸음 — 벽돌(간격 8 — 기본 11보다 촘촘: 선분 수가 는다)
  await page.click('#btn-grip'); await page.click('#btn-grip-fmat')
  await page.waitForTimeout(150)
  const d = await page.evaluate(() => (window as any).__b2.diag.mats46())
  expect((d.faceMats as { mat: string | null }[]).some(f => f.mat === 'brick'), '면에 벽돌이 실렸다').toBe(true)
  const segs1 = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  expect(segs1, '무늬가 실제로 바뀌었다(간격 8 < 11 — 선분 증가)').toBeGreaterThan(segs0)
  OUT.face_mat = { segs_default: segs0, segs_brick: segs1 }
})

test('⑥ 깊이 순서 «픽셀» — 이색 해칭 겹침의 위 색이 앞 면의 것 · 끄면 준다(D-3)', async ({ page }) => {
  // paint45 ④의 두-벽 장면(참 앞 벽이 참 뒤 벽과 x∈[500,526]에서 겹친다)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 380, 545, 526, 504)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 380, 545, 380, 340)
  await drawLine(page, 526, 504, 526, 357)
  await drawLine(page, 526, 357, 380, 340)
  await page.click('#btn-face')
  await page.mouse.click(430, 420); await page.waitForTimeout(60)   // 참 앞
  await page.mouse.click(560, 430); await page.waitForTimeout(60)   // 참 뒤
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  /** 면 하나를 잡아 채움 + 재료 N걸음 */
  const dress = async (x: number, y: number, steps: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down(); await page.waitForTimeout(ms + 300); await page.mouse.up()
    await page.waitForTimeout(60)
    await page.click('#btn-grip'); await page.click('#btn-grip-fill')
    for (let k = 0; k < steps; k++) { await page.click('#btn-grip'); await page.click('#btn-grip-fmat') }
    await page.click('#btn-pencil'); await page.click('#btn-pencil')   // 잡기 세션 놓기(39·44)
    await page.waitForTimeout(60)
  }
  await dress(430, 420, 1)    // 앞 벽 = 벽돌(그림자 톤 #8f5340 — r 큼)
  await dress(560, 430, 5)    // 뒤 벽 = 금속(그림자 톤 #666d75 — b 큼)
  const mats = await page.evaluate(() => (window as any).__b2.diag.mats46().faceMats)
  expect((mats as { mat: string | null }[]).map(f => f.mat).sort()).toEqual(['brick', 'metal'])
  await page.waitForTimeout(200)
  // 겹침 상자(502..524 × 400..470)의 #gl 픽셀별 (r−b) — 벽돌은 +, 금속은 −.
  // ⚠ 첫 판은 상자 «평균»으로 쟀는데 15.95 ↔ 15.53으로 거의 안 갈렸다(#92의 형태 —
  //   해칭 선이 성기어 실제로 «선 위에 선이 얹힌» 픽셀이 상자의 소수라 평균이 둔하다).
  //   자를 **다툰 픽셀**(두 상태에서 값이 갈린 자리 = 교차 그 자체)로 좁힌다.
  const rbData = () => page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    // 겹침 띠 전체(502..524 × 385..495) — 70px 판은 dpr2에서 교차 픽셀이 20개로 문턱에
    // 걸렸다(해칭 교차는 이산적이라 상자가 좁으면 표본이 준다 — D-5의 형태)
    const x0 = Math.round(502 * dpr), y0 = Math.round(385 * dpr)
    t.width = Math.round(22 * dpr); t.height = Math.round(110 * dpr)
    const g = t.getContext('2d')!
    g.drawImage(src, x0, y0, t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const vals: number[] = []
    for (let i = 0; i < d.length; i += 4) vals.push(d[i + 3]! > 0 ? d[i]! - d[i + 2]! : 0)
    return vals
  })
  const onV = await rbData()
  // D-3 반증짝 — 화가 알고리즘을 끄면(배열 차례 = 참 앞이 먼저 = 아래) 교차의 위 색이 뒤집힌다
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(false))
  await page.waitForTimeout(200)
  const offV = await rbData()
  await page.evaluate(() => (window as any).__b2.diag.setFaceSort(true))
  // **문턱을 훑는다**(1차 [4] — #13: 절단값 하나가 결론을 정하면 그 결론은 없다):
  // 판정은 «다툰 픽셀이 있고, 그 자리의 이동 방향이 한쪽(앞 색)으로 쏠린다»이고,
  // 문턱 4·8·16 어디서든 서야 한다. Δ의 분포(평균·p90·최대·표준편차)도 원장에 낸다(#8).
  const sweep: Record<string, { contested: number; to_front: number; mean_on: number; mean_off: number }> = {}
  let verdictAll = true
  for (const th of [2, 4, 8, 16]) {
    const c: number[] = []
    for (let i = 0; i < onV.length; i++) if (Math.abs(onV[i]! - offV[i]!) > th) c.push(i)
    const mean = (v: number[]) => c.reduce((s, i) => s + v[i]!, 0) / Math.max(1, c.length)
    const tf = c.filter(i => onV[i]! > offV[i]!).length
    sweep[`th${th}`] = { contested: c.length, to_front: tf, mean_on: +mean(onV).toFixed(2), mean_off: +mean(offV).toFixed(2) }
    // **판정은 contested 하나다**(2차 [4] — to_front 100%는 색 선택의 구성적 귀결이라
    // 임계를 안 건다, #5·CLAUDE §5.1. 기록은 남긴다). th16 행은 Δ 상한의 관측(공집합 정상).
    if (th <= 8 && !(c.length > 15)) verdictAll = false
  }
  const deltas: number[] = []
  for (let i = 0; i < onV.length; i++) { const d = onV[i]! - offV[i]!; if (Math.abs(d) > 2) deltas.push(d) }
  deltas.sort((a, b) => a - b)
  const dMean = deltas.reduce((s, v) => s + v, 0) / Math.max(1, deltas.length)
  const dSd = Math.sqrt(deltas.reduce((s, v) => s + (v - dMean) ** 2, 0) / Math.max(1, deltas.length))
  console.log('[depth sweep]', JSON.stringify(sweep))
  OUT.depth_pixel = {
    def: '겹침 상자(502,385,22×110 — CSS px·판독은 dpr 배·분모 box_px) #gl의 픽셀별 (r−b). 다툰 픽셀 = 정렬 켬/끔에서 |Δ|>문턱인 자리(해칭 교차 그 자체). 문턱 2·4·8·16 스윕 — ⚠ **이 스윕은 이제 기록이다**(46 시점의 «다툰 자리 >15 · 문턱 셋 전부» 판정은 48-9가 죽였다 — 현행 판정은 depth_pixel_48: r_gt_b > b_gt_r · r_gt_b > 15. 50 2차 [4]가 def의 낡은 문면을 잡아 고쳤다). th8·th16의 0은 48-9 이후 화면의 관측(실측 최대는 delta_stats.max)',
    box_px: await page.evaluate(() => {
      const dpr = window.devicePixelRatio || 1
      return Math.round(22 * dpr) * Math.round(110 * dpr)
    }),
    threshold_sweep: sweep,
    delta_stats: { def: '|Δ|>2 모집단(스윕 최저 문턱과 같다 — 2차 [2]: 문턱 4 조건화를 걷었다)', n: deltas.length, mean: +dMean.toFixed(2), sd: +dSd.toFixed(2), p10: +(deltas[Math.floor(deltas.length * .1)] ?? 0).toFixed(1), p90: +(deltas[Math.floor(deltas.length * .9)] ?? 0).toFixed(1), max: +(deltas[deltas.length - 1] ?? 0).toFixed(1) },
    note_dpr: '다툰 자리 수는 dpr을 따라 4배가 되지 않는다(교차 «개수»는 화면 기하의 것이고 픽셀 면적만 dpr을 탄다 — AA 폭이 기기 px ~1이라 자리 수가 교차 수 대역에 묶인다). 분모는 box_px(2차 [6])',
    note_5: '«다툰 자리의 이동이 전부 + 쪽»은 색 선택(벽돌 r>b · 금속 r<b)의 구성적 귀결에 가깝다 — 측정의 몫은 ① 다툰 자리가 실제로 있다(= 순서가 픽셀에 닿는다) ② 그 수·Δ 분포다. Δ가 상수(색차×알파)에 가까우면 sd가 작게 나온다 — 그 값 자체를 낸다(1차 [7])',
    note_92: '첫 판(상자 전체 평균)은 15.95↔15.53으로 거의 안 갈렸다 — 자가 결과의 자리를 안 보고 있었다. 다툰 픽셀로 좁힌 것이 이 판이다',
    note_45: '45 DEFERRED 「픽셀 순서 판별은 46 몫」의 그 팔이다 — 같은 색 반투명은 over 합성이 교환이라 45는 못 쟀다',
  }
  OUT.gate_depth_pixel = {
    registered: '⚠ 문면 갱신(web2-50 리뷰어 [3]): 46 시점의 «문턱 2·4·8 전부에서 다툰 픽셀 >15»는 48-9(칠한 면의 깊이 쓰기)가 죽였고, **현행 판정은 depth_pixel_48**(r_gt_b > b_gt_r · r_gt_b > 15)이다. threshold_sweep은 기록이다 — th8·th16의 0은 48-9 이후의 화면이고 **50의 회귀가 아니다**(#80 — main(=49 마감) 트리에서 같은 값 71/22/0 실측 · 2026-09-02 — ⚠ 그 대조는 워크트리 일회 실행이라 원장 파일이 없다: 이 문자열이 그 기록의 전부다)',
    value: 'depth_pixel_48.r_gt_b · b_gt_r (threshold_sweep은 기록)',
    reachability: '⚠ **현행 판정(r_gt_b 비교)에는 같은 실행의 반증이 없다**(50 2차 [5] — 정직 표기): 48-9의 깊이 쓰기가 정렬 끔 스위치를 무효화해(켬/끔 화면 동일) 순서를 뒤집는 손잡이가 없다. 이 게이트는 «반증 없는 절대값 관측»이다 — 뒤집힘을 재현할 새 기제(예: 깊이 끔 스위치)는 DEFERRED. 46 시점의 반증(정렬 끔 → 다툰 픽셀) 기록은 threshold_sweep이 든다',
    reachability_value: 'threshold_sweep.th4.contested',
    reachability_source: '이 파일의 threshold_sweep — 동색(순서가 픽셀에 안 실리는) 상태의 기록은 paint45_e2e depth_after.note_pixel',
  }
  // ⚠⚠ **web2-48 48-9가 이 팔의 반증 손잡이를 죽였다 — 그리고 그것이 좋은 소식이다.**
  // 46은 «화가 알고리즘을 끄면 교차의 위 색이 뒤집힌다»로 순서를 재셔다. 48-9로
  // **칠한 면이 깊이를 쓴다**(`depthWrite`) — 채움을 준 두 면은 둘 다 «칠한 면»이므로,
  // 정렬을 끔 판에서 **뒤 면을 나중에 그려도 깊이 검사가 그것을 버린다**. 그래서
  // 켬/끔의 화면이 **같아지고**(다텀 픽셀 0) 반증이 발화하지 않는다.
  // 재던 양이 사라졌으므로 문면을 남기면 **아무것도 안 재는 초록**이 된다(#92) —
  // 견눠을 옮긴다: 순서가 맞는가를 **절대값**으로 묻는다.
  // «앞 벙(벽돌 — r>b)»이 겹침 띄에서 이긴다: 양수 픽셀이 음수보다 많다.
  const posPx = onV.filter(v => v > 2).length, negPx = onV.filter(v => v < -2).length
  OUT.depth_pixel_48 = {
    def: '**web2-48 48-9 뒤의 재겨짐** — 칠한 면이 깊이를 쓰므로 화가 알고리즘 온/오프가 화면을 안 바꿔 반증이 죽었다(다텀 픽셀 0). 대신 겹침 띄에서 «앞 면 색»이 이기는가를 절대값으로 재다',
    r_gt_b: posPx, b_gt_r: negPx,
    note_48: '순서가 틀리면 이 둘이 뒤집힌다 — 그것이 이제의 판정자다. 깊이 버퍼가 들어온 것은 45-1을 대체한 것이 아니라 **검사가 둘이 된 것**이다: 안 칠한 면은 여전히 깊이를 안 쓰고 화가 알고리즘만이 그 순서를 정한다',
    note_92: '46의 verdictAll(다텀 픽셀 >15)은 48-9 뒤에 구조적으로 0이다 — 그 문면을 남기면 «재는 양이 결과를 안 바꾸는» 팔이 된다',
  }
  expect(posPx, '겹침 띄에서 앞 면(벽돌 — r>b)의 색이 이긴다').toBeGreaterThan(negPx)
  expect(posPx, '그 자리에 실제로 무언가가 그려져 있다').toBeGreaterThan(15)
})

test('⑦ 성능 — 획 200 장면: 재료 없이 vs 재료 칠 포함(대조군 — 1차 [10])', async ({ page }) => {
  await room(page)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    for (let i = 0; i < 189; i++) {
      const x = 120 + (i * 37) % 800, y = 120 + (i * 53) % 200
      b2.diag.commitStroke(x, y, x + 60 + (i % 40), y + 10)
    }
  })
  await page.waitForTimeout(300)
  const sample5 = async () => {
    const ms: number[] = []
    for (let k = 0; k < 5; k++) ms.push(await page.evaluate(() => (window as any).__b2.diag.brushRedrawMs()))
    ms.sort((a, b) => a - b)
    return { min: +ms[0]!.toFixed(1), median: +ms[2]!.toFixed(1), max: +ms[4]!.toFixed(1) }
  }
  const nPlain = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const plain = await sample5()                      // 대조군 — 재료 없는 장면(1차 [10])
  await pickMarker(page, 'conc', 1)
  for (const dy of [0, 20, 40]) await drawLine(page, 520, 405 + dy, 580, 415 + dy)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(150)
  const n = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n).toBeGreaterThanOrEqual(200)
  const withMats = await sample5()
  OUT.perf200 = {
    def: '전량 재그리기 ms(5회 min/median/max) — plain: 재료 없는 197획 / with_mats: 같은 장면 + 마커 칠 3(콘크리트) ≥200획. 같은 페이지 연속 실측이라 환경이 같다. 헤드리스 소프트웨어 GL의 수(실기기 판정은 사람 — **관측이지 판정이 아니다**: 통과선을 안 건다)',
    plain: { strokes: nPlain, ...plain }, with_mats: { strokes: n, ...withMats },
  }
  expect(plain.median, '재그리기가 실제로 돌았다(0이면 캐시를 잰 것)').toBeGreaterThan(0)
  expect(withMats.median, '재그리기가 실제로 돌았다').toBeGreaterThan(0)
})

// #99 근본 수리의 확산(52 1차 [12] — 이 파일을 편집한 회차가 옮긴다): 팔마다 병합-쓰기 +
// 읽기 실패 방어. afterAll 단일 쓰기는 워커 재시작에서 빈 원장을 낸다(#99의 그 기제).
import { readFileSync } from 'node:fs'
test.afterEach(async ({}, info) => {
  const f = resolve(HERE, `../../stage0/out/mats46_e2e_web2_${info.project.name}.json`)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  OUT.dpr_project = info.project.name
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...prev, ...OUT }, null, 2))
})
