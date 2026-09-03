// web2-61 — 「눈으로 갈리는 것을 값으로」: 칠 자국 게이트 다섯의 자.
//
//   ① 격자 주기   직선 획의 띠 안 어둡기 열 프로파일에서 «지배 주기»의 진폭(DFT 한 칸 ÷ 평균).
//                 지금 연필의 모자이크가 그 주기다(수리 전 값이 pre 원장 — grain61_pre_*).
//   ② 도장 주기   같은 자 — 지금 붓의 점열(도장 간격 주기).
//   ③ 구멍 규칙성 색연필 빈 픽셀의 «위치»가 격자에 실리는가 — 구멍 지시자의 열·행 프로파일
//                 지배 주기 진폭(격자에 실리면 두 축 다 봉우리가 선다).
//   ④ 굵기 무관   굵기 2배에서 ①의 지배 주기가 따라 커지는가(결은 종이의 성질 — 굵기와 무관).
//   ⑤ 넷 갈림     같은 압력·같은 도형의 넷: 알파 분포(평균·p95) · 덮임률(빈 몫) · 가장자리
//                 거칠기의 짝별 최대 상대 차.
//
// 자의 자리: diag.markSampleForTest — 흰 판(면 텍스처 규약)에 제품과 같은 함수(paintMark —
// 이음매)로 긋는다. 화면·문서·원근·dpr과 무관한 순수 px 판(#16 — 원근 정규화 불요).
// 호출마다 새 캔버스라 두 측정 사이 장면 문제(#103)가 구성으로 없다(scene 열쇠가 그 자백).
//
// 수리 «전» 실행은 grain61_pre_web2_dpr{1,2}.json으로 동결한다(paint59_pre 선례) — 옛 엔진이
// 지워진 뒤에는 그 원장이 반증의 기록이다(D-3 · 60 마감 [10]의 «재현 불가» 규약).
// 이 스펙 자체는 측정과 «신호 실재» 단언만 든다 — 통과선(임계)은 post 값이 나온 뒤 constants에
// 등재한다(60 이월 「원장 def의 문장은 값이 나온 뒤에 쓴다」의 게이트판).
//
// 원장: stage0/out/grain61_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-61 — 자국 게이트 자: ①격자 주기 ②도장 주기 ③구멍 규칙성 ④굵기 무관 ⑤넷 갈림 (흰 판 · paintMark 직접 · 원근 무관)',
  note_pitfalls: '#103(호출마다 새 캔버스 — 구성 · scene 열쇠) · #102(?reset 시험당 1회) · #101(web2 러너) · #99(병합-쓰기) · #16(순수 px 판 — 원근 정규화 불요) · #12(주기 탐색은 3..60 스윕 — 동작점 하나가 아니다)',
  scene: '호출마다 markSampleForTest가 새 480×240 캔버스를 만든다(문서·뷰 무관 · 잔류 없음)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/grain61_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { /* 첫 실행 */ }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/grain61.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

async function boot(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
}

type Instr = 'brush' | 'marker' | 'cp' | 'pencil'

/** 견본을 긋고(w px · 직선) 띠 프로파일·주기·통계를 계산한다 — 계산 전부가 페이지 안이다. */
const measureLine = (page: Page, instr: Instr, wPx: number) =>
  page.evaluate(([i, w]) => {
    const b2 = (window as any).__b2
    b2.diag.markSampleForTest(i, 'line', w)
    const m = (window as any).__m61 as { v: number[]; w: number; h: number }
    const W = m.w, H = m.h
    const y0 = Math.max(0, Math.round(H / 2 - (w as number) / 2 - 15))
    const y1 = Math.min(H - 1, Math.round(H / 2 + (w as number) / 2 + 15))
    const x0 = 50, x1 = W - 50
    // 열 프로파일(띠 안 평균 어둡기)
    const prof: number[] = []
    for (let x = x0; x <= x1; x++) {
      let s = 0
      for (let y = y0; y <= y1; y++) s += m.v[y * W + x]!
      prof.push(s / (y1 - y0 + 1))
    }
    const N = prof.length
    const mean = prof.reduce((a, b) => a + b, 0) / N
    // 지배 주기 — P 3..60(0.5 걸음) DFT 진폭 ÷ 평균 (#12: 스윕이지 동작점이 아니다)
    let bestP = 0, bestRatio = 0
    const ratioAt = (P: number): number => {
      let re = 0, im = 0
      for (let k = 0; k < N; k++) {
        const ph = (2 * Math.PI * k) / P
        const d = prof[k]! - mean
        re += d * Math.cos(ph); im -= d * Math.sin(ph)
      }
      return mean > 1e-6 ? (2 * Math.hypot(re, im)) / N / mean : 0
    }
    for (let P = 3; P <= 60; P += 0.5) {
      const r = ratioAt(P)
      if (r > bestRatio) { bestRatio = r; bestP = P }
    }
    // 띠 픽셀 통계 — 알파 분포·덮임률·가장자리 거칠기(⑤의 자)
    const band: number[] = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) band.push(m.v[y * W + x]!)
    const sorted = [...band].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!
    const bmean = band.reduce((a, b) => a + b, 0) / band.length
    // 덮임률의 분모는 «몸통»(굵기 안 — 프로파일이 산 열의 ±w/2)이다 — 띠 여백을 세면 전부가 «빈» 것이 된다
    let core = 0, coreBare = 0
    const cy0 = Math.round(H / 2 - (w as number) / 2), cy1 = Math.round(H / 2 + (w as number) / 2)
    for (let y = cy0; y <= cy1; y++) for (let x = x0; x <= x1; x++) {
      core++
      if (m.v[y * W + x]! < 0.15 * p95) coreBare++
    }
    // 가장자리 거칠기 — 열마다 위에서 내려오며 처음 0.5·p95를 넘는 y(잉크 경계)의 표준편차
    const edges: number[] = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (m.v[y * W + x]! > 0.5 * p95) { edges.push(y); break }
      }
    }
    const eMean = edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : 0
    const eSd = edges.length
      ? Math.sqrt(edges.reduce((a, b) => a + (b - eMean) * (b - eMean), 0) / edges.length) : 0
    // 가장자리 물결(② 도장 주기의 눈 증상 — 붓 점열의 조가비 경계): 경계 y 열의 지배 주기와
    // 그 진폭(px — 굵기 절반으로 정규화). 띠 평균은 겹침이 뭉개서 이 축이 따로 필요하다.
    let edgeP = 0, edgeAmp = 0
    if (edges.length > 60) {
      const N2 = edges.length
      for (let P = 3; P <= 60; P += 0.5) {
        let re = 0, im = 0
        for (let k = 0; k < N2; k++) {
          const ph = (2 * Math.PI * k) / P
          const d = edges[k]! - eMean
          re += d * Math.cos(ph); im -= d * Math.sin(ph)
        }
        const a2 = (2 * Math.hypot(re, im)) / N2
        if (a2 > edgeAmp) { edgeAmp = a2; edgeP = P }
      }
    }
    return {
      edgeP, edgeAmpN: +(edgeAmp / ((w as number) / 2)).toFixed(4),
      mean: +mean.toFixed(3), dominantP: bestP, ampRatio: +bestRatio.toFixed(4),
      p95: +p95.toFixed(1), bandMean: +bmean.toFixed(2),
      bareShare: core > 0 ? +(coreBare / core).toFixed(4) : 0, coreN: core,
      edgeSd: +eSd.toFixed(3), edgeN: edges.length,
    }
  }, [instr, wPx] as const)

test('①② 격자·도장 주기 — 넷의 직선(굵기 20)', async ({ page }, info) => {
  await boot(page)
  const out: Record<string, unknown> = {}
  for (const i of ['pencil', 'cp', 'brush', 'marker'] as Instr[]) {
    const r = await measureLine(page, i, 20)
    out[i] = r
    expect(r.mean, `${i} 자국이 실재한다(빈 판이 아니다)`).toBeGreaterThan(2)
    expect(r.edgeN, `${i} 잉크 경계가 열 전부에 있다`).toBeGreaterThan(300)
  }
  OUT.period_line_w20 = {
    ...out,
    def: '띠(굵기+30px) 열 프로파일의 지배 주기 P(3..60 스윕)와 진폭비(DFT 2/N ÷ 평균). ①연필·색연필 격자 ②붓 도장 열 — pre 값이 반증의 기록(D-3)',
  }
})

test('④ 굵기 무관 — 연필 20 vs 40', async ({ page }) => {
  await boot(page)
  const a = await measureLine(page, 'pencil', 20)
  const b = await measureLine(page, 'pencil', 40)
  expect(a.mean, '20px 자국 실재').toBeGreaterThan(2)
  expect(b.mean, '40px 자국 실재').toBeGreaterThan(2)
  OUT.width_follow = {
    w20: { P: a.dominantP, amp: a.ampRatio },
    w40: { P: b.dominantP, amp: b.ampRatio },
    p_ratio: a.dominantP > 0 ? +(b.dominantP / a.dominantP).toFixed(3) : 0,
    def: '굵기 2배에서 지배 주기의 비 — 결이 굵기에 실리면 ≈2(옛 엔진 · grainWpx×grainK), 종이 성질이면 ≈1',
  }
})

test('③ 구멍 규칙성 — 색연필 빈 픽셀의 자리', async ({ page }) => {
  await boot(page)
  const r = await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.markSampleForTest('cp', 'line', 20)
    const m = (window as any).__m61 as { v: number[]; w: number; h: number }
    const W = m.w, H = m.h
    const y0 = Math.round(H / 2 - 10), y1 = Math.round(H / 2 + 10)   // 몸통만(굵기 20의 안쪽)
    const x0 = 50, x1 = W - 50
    const body: number[] = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) body.push(m.v[y * W + x]!)
    const sorted = [...body].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!
    const th = 0.35 * p95
    // 구멍 지시자의 열·행 프로파일 — 격자에 실리면 두 축 다 주기가 선다
    const colProf: number[] = [], rowProf: number[] = []
    for (let x = x0; x <= x1; x++) {
      let c = 0
      for (let y = y0; y <= y1; y++) if (m.v[y * W + x]! < th) c++
      colProf.push(c)
    }
    for (let y = y0; y <= y1; y++) {
      let c = 0
      for (let x = x0; x <= x1; x++) if (m.v[y * W + x]! < th) c++
      rowProf.push(c)
    }
    const domOf = (prof: number[]): { P: number; ratio: number } => {
      const N = prof.length
      const mean = prof.reduce((a, b) => a + b, 0) / N
      let bestP = 0, best = 0
      for (let P = 3; P <= Math.min(60, N / 2); P += 0.5) {
        let re = 0, im = 0
        for (let k = 0; k < N; k++) {
          const ph = (2 * Math.PI * k) / P
          const d = prof[k]! - mean
          re += d * Math.cos(ph); im -= d * Math.sin(ph)
        }
        const r2 = mean > 1e-6 ? (2 * Math.hypot(re, im)) / N / mean : 0
        if (r2 > best) { best = r2; bestP = P }
      }
      return { P: bestP, ratio: +best.toFixed(4) }
    }
    const holeShare = body.filter(v => v < th).length / body.length
    return { col: domOf(colProf), row: domOf(rowProf), holeShare: +holeShare.toFixed(4), p95: +p95.toFixed(1) }
  })
  expect(r.holeShare, '구멍이 실재한다(색연필 — 완전히 덮이지 않는다)').toBeGreaterThan(0.005)
  OUT.holes_cp = { ...r, def: '몸통(±10px) 구멍(<0.35·p95) 지시자의 열·행 프로파일 지배 주기 — 격자에 실리면 두 축 다 봉우리(pre), 안 실리면 진폭이 낮다(post)' }
})

test('⑤ 넷이 갈린다 — 같은 압력·같은 도형의 통계', async ({ page }) => {
  await boot(page)
  const stats: Record<string, { p95: number; bareShare: number; edgeSd: number; bandMean: number }> = {}
  for (const i of ['pencil', 'cp', 'brush', 'marker'] as Instr[]) {
    const r = await measureLine(page, i, 20)
    stats[i] = { p95: r.p95, bareShare: r.bareShare, edgeSd: r.edgeSd, bandMean: r.bandMean }
  }
  const keys = Object.keys(stats)
  const axes = ['p95', 'bareShare', 'edgeSd'] as const
  const perPair: Record<string, number> = {}
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    let best = 0
    for (const ax of axes) {
      const va = stats[keys[a]!]![ax], vb = stats[keys[b]!]![ax]
      const rel = Math.abs(va - vb) / Math.max(1e-6, Math.max(Math.abs(va), Math.abs(vb)))
      if (rel > best) best = rel
    }
    perPair[`${keys[a]}~${keys[b]}`] = +best.toFixed(4)
  }
  const minPair = Math.min(...Object.values(perPair))
  OUT.four_differ = { stats, perPair, minPair: +minPair.toFixed(4),
    def: '짝별로 세 축(p95·빈 몫·가장자리 sd) 중 최대 상대 차 — 그 최소가 «가장 닮은 짝»의 갈림' }
  expect(minPair, '어떤 짝도 완전히 같지 않다(신호 실재)').toBeGreaterThan(0)
})
