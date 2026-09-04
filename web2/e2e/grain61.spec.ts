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
  what: 'web2-61 — 자국 게이트 자: ①격자 주기 ②도장 주기 ③구멍 규칙성 ④굵기 무관 ⑤넷 갈림 ⑥크기 정직성 (흰 판 · 이음매 drawMark 직접 · 원근 무관)',
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
const measureLine = (page: Page, instr: Instr, wPx: number, maxP = 60) =>
  page.evaluate(([i, w, PMAX]) => {
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
    for (let P = 3; P <= (PMAX as number); P += 0.5) {
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
  }, [instr, wPx, maxP] as const)

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
  // 2차 [19]: w40의 지배 주기가 스윕 상한(60)에 붙었다 — ④는 상한 120으로 잰다(①②의 자는 그대로 60)
  const a = await measureLine(page, 'pencil', 20, 120)
  const b = await measureLine(page, 'pencil', 40, 120)
  expect(a.mean, '20px 자국 실재').toBeGreaterThan(2)
  expect(b.mean, '40px 자국 실재').toBeGreaterThan(2)
  // web2-62: 같은 자를 결 «끔»에서 — 지배 주기가 결의 것이면 끔에서 사라지고, 도장 산포의 것이면 그대로다(리뷰어 [H5]의 값)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  const a0 = await measureLine(page, 'pencil', 20, 120)
  const b0 = await measureLine(page, 'pencil', 40, 120)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  OUT.width_follow = {
    sweep_max_P: 120,
    w20: { P: a.dominantP, amp: a.ampRatio },
    w40: { P: b.dominantP, amp: b.ampRatio },
    p_ratio: a.dominantP > 0 ? +(b.dominantP / a.dominantP).toFixed(3) : 0,
    grain_off: { w20: { P: a0.dominantP, amp: a0.ampRatio }, w40: { P: b0.dominantP, amp: b0.ampRatio }, p_ratio: a0.dominantP > 0 ? +(b0.dominantP / a0.dominantP).toFixed(3) : 0 },
    def: '굵기 2배에서 지배 주기의 비 — 61 자의 뜻: 결이 굵기에 실리면 ≈2(옛 엔진), 종이 성질이면 ≈1. ⚠ web2-62: mypaint 연필(classic/pencil — 도장 산포 offset_by_random × base_radius)에서 이 자의 «지배 주기»는 결이 아니라 도장 산포 주기다(반지름에 비례 — 원문 설계) → 비 ≈2가 «결이 굵기에 실림»을 뜻하지 않는다. grain_off(결 끔)가 같은 비를 내는 것이 그 증거(값). 결의 면 고정·굵기 무관은 paint59 ④(대상 px 타일 상관)가 잰다',
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
  // web2-62 판갈이(2판): 도구마다 **시드 셋**(61·4242·777)을 재어 축마다 평균·퍼짐을 낸다. 짝 갈림 = 축별
  // |평균 차| ÷ max(바닥, 두 도구 퍼짐의 제곱평균) 의 최대 — «신호 ÷ 잡음»(z). 61 자(시드 하나 · 상대 차)는 mypaint
  // 연필(도장 산포 · 옅음)에서 «같은 도구·다른 시드»의 상대 차가 .88~.97로 짝 갈림과 같아져 영점을 못 세웠다 —
  // 그것은 자의 잡음이 아니라 «도구 자체의 시드 퍼짐»이고, 그렇다면 갈림은 그 퍼짐에 대해 재야 한다.
  // 바닥(p95 8/255 · 빈 몫 .02 · 가장자리 sd .5)은 0 근처 축의 나눗셈 폭발을 막는다.
  const SEEDS = [61, 4242, 777]
  const axes = ['p95', 'bareShare', 'edgeSd'] as const
  type Ax = typeof axes[number]
  const FLOOR: Record<Ax, number> = { p95: 8, bareShare: 0.02, edgeSd: 0.5 }
  const bySeed: Record<string, Record<Ax, number>[]> = {}
  const stats: Record<string, Record<Ax, number> & { bandMean: number; sd: Record<Ax, number> }> = {}
  for (const i of ['pencil', 'cp', 'brush', 'marker'] as Instr[]) {
    bySeed[i] = []
    let bandMean = 0
    for (const sd of SEEDS) {
      const r = await page.evaluate(([tool, seed]) => {
        const b2 = (window as any).__b2
        b2.diag.markSampleForTest(tool, 'line', 20, seed)
        const m = (window as any).__m61 as { v: number[]; w: number; h: number }
        const W = m.w, H = m.h
        const y0 = Math.round(H / 2 - 25), y1 = Math.round(H / 2 + 25)
        const band: number[] = []
        for (let y = y0; y <= y1; y++) for (let x = 50; x <= W - 50; x++) band.push(m.v[y * W + x]!)
        const sorted = [...band].sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)]!
        let core = 0, bare = 0
        const cy0 = Math.round(H / 2 - 10), cy1 = Math.round(H / 2 + 10)
        for (let y = cy0; y <= cy1; y++) for (let x = 50; x <= W - 50; x++) { core++; if (m.v[y * W + x]! < 0.15 * p95) bare++ }
        const edges: number[] = []
        for (let x = 50; x <= W - 50; x++) for (let y = y0; y <= y1; y++) if (m.v[y * W + x]! > 0.5 * p95) { edges.push(y); break }
        const em = edges.reduce((a, b) => a + b, 0) / Math.max(1, edges.length)
        const esd = Math.sqrt(edges.reduce((a, b) => a + (b - em) * (b - em), 0) / Math.max(1, edges.length))
        const bm = band.reduce((a, b) => a + b, 0) / band.length
        return { p95: +p95.toFixed(1), bareShare: +(bare / core).toFixed(4), edgeSd: +esd.toFixed(3), bandMean: +bm.toFixed(2) }
      }, [i, sd] as const)
      bySeed[i]!.push({ p95: r.p95, bareShare: r.bareShare, edgeSd: r.edgeSd })
      bandMean += r.bandMean / SEEDS.length
    }
    const mean = {} as Record<Ax, number>, sdv = {} as Record<Ax, number>
    for (const ax of axes) {
      const vs = bySeed[i]!.map(v => v[ax])
      const mu = vs.reduce((a, b) => a + b, 0) / vs.length
      mean[ax] = +mu.toFixed(4)
      sdv[ax] = +Math.sqrt(vs.reduce((a, b) => a + (b - mu) ** 2, 0) / vs.length).toFixed(4)
    }
    stats[i] = { ...mean, bandMean: +bandMean.toFixed(2), sd: sdv }
  }
  const keys = Object.keys(stats)
  const zOf = (ax: Ax, a: string, b: string): number =>
    Math.abs(stats[a]![ax] - stats[b]![ax]) / Math.max(FLOOR[ax], Math.sqrt((stats[a]!.sd[ax] ** 2 + stats[b]!.sd[ax] ** 2) / 2))
  const perPair: Record<string, number> = {}
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    let best = 0
    for (const ax of axes) { const z = zOf(ax, keys[a]!, keys[b]!); if (z > best) best = z }
    perPair[`${keys[a]}~${keys[b]}`] = +best.toFixed(3)
  }
  const minPair = Math.min(...Object.values(perPair))
  // **반증(D-3) — 자의 영점**: 같은 도구(연필)를 시드만 바꿔 두 번 재면 이 자가 0 대역을
  // 내야 한다(도구가 같은데 «갈린다»고 읽으면 자가 잡음을 재는 것). 제품 최소 짝과의 간격이
  // 이 자의 판별력이다.
  // ⚠ measureLine은 시드 고정(61)이라 그대로 두 번 재면 결정론 항등(0)일 뿐이다(2차 [30]) —
  // 영점은 **시드를 실제로 바꿔**(도장 배치 잡음만 다른 같은 도구) 잰다: 작지만 0이 아니어야
  // 자에 판별력이 있다.
  // 영점 = 같은 도구(연필) 안에서 시드 둘의 z(제 퍼짐에 대한 |차|) — 구성상 ~1 대역(0이 아니다 · 결정론 항등이 아님)
  const nullDiff = (() => {
    const a = bySeed.pencil![0]!, b = bySeed.pencil![1]!
    let best = 0
    for (const ax of axes) {
      const z = Math.abs(a[ax] - b[ax]) / Math.max(FLOOR[ax], stats.pencil!.sd[ax])
      if (z > best) best = z
    }
    return +best.toFixed(3)
  })()
  OUT.four_differ = { stats, perPair, minPair: +minPair.toFixed(3), null_same_tool: nullDiff, seeds: SEEDS, floors: FLOOR, by_seed: bySeed,
    def: '(62 판갈이 2판) 도구마다 시드 셋(61·4242·777)의 평균·퍼짐 — 짝별로 세 축(p95·빈 몫·가장자리 sd) 중 «|평균 차| ÷ max(바닥, 퍼짐 제곱평균)»(z)의 최대 — 그 최소가 «가장 닮은 짝»의 갈림(신호 ÷ 잡음). 영점 = 연필 시드 둘의 z(제 퍼짐 기준 ~1 대역). ⚠ 잉크펜(deevad/liner)·마커(ramon/100%_Opaque)는 난수를 안 써 시드 셋이 같은 값(sd 0) — 그 둘의 z 분모는 바닥이 준다(2차 [20]). 61 자(시드 하나 · 상대 차)의 문면은 아래에 남긴다: 짝별로 세 축(p95·빈 몫·가장자리 sd) 중 최대 상대 차 — 그 최소가 «가장 닮은 짝»의 갈림. ⚠ 마른 알갱이 매체 둘(cp↔붓)이 가장 닮은 짝이다 — 수치 갈림의 눈금은 이 표가, 성격의 갈림은 사진(shots61 — 눈)이 판정. ⚠ pre(옛 엔진)와 이 자는 같은 눈금이 아니다: pre의 cp·마커는 edgeSd·amp가 정확히 0(구성상 평탄)이라 상대 차가 1에 포화했다(0 나눗셈 형태 — 리뷰어 [11]). 반증 null_same_tool = 같은 도구(연필 · 시드 4242 — 도장 배치 잡음만 다름)의 같은 자 — 작지만 0이 아닌 값이어야 하고(0이면 결정론 항등을 잰 것) 제품 최소 짝과의 간격이 판별력이다',
  }
  expect(minPair, '어떤 짝도 완전히 같지 않다(신호 실재)').toBeGreaterThan(0)
  expect(minPair, '가장 닮은 짝의 갈림이 잡음의 3배를 넘는다(z ≥ 3)').toBeGreaterThanOrEqual(3)
  expect(nullDiff, '반증 — 같은 도구(시드만 다름)는 이 자에서 최소 짝보다 훨씬 아래다(자의 영점)').toBeLessThan(minPair / 2)
  expect(nullDiff, '영점이 결정론 항등이 아니다(시드가 실제로 갈렸다)').toBeGreaterThan(0)
})

test('① 반증 — 간격 배수 4(성긴 도장)에서 주기 진폭이 되살아난다(자의 이빨)', async ({ page }) => {
  await boot(page)
  const base = await measureLine(page, 'pencil', 20)
  // web2-62 판갈이: p5의 «0.1px 걸음 × 120»은 mypaint에 없다 — spacingK는 dabs_per_*의 나눗수(도장 걸음 ×6 ≈ 반지름 4개/걸음 → 1.5 반지름마다 하나 · 도장 지름 대역): 점열이 실제로 보인다
  await page.evaluate(() => (window as any).__b2.diag.setPaintParamForTest('pencil', 'spacingK', 6))
  const sparse = await measureLine(page, 'pencil', 20)
  await page.evaluate(() => (window as any).__b2.diag.resetPaintTuneForTest('pencil'))
  OUT.falsification_period = {
    def: '연필 간격 배수 6(62: 도장 걸음 ×6 — 도장 지름 대역 · 61의 p5 판은 120) — 도장이 성겨지면 점열 주기가 자에 실려야 한다(D-3: ①②의 실패 조건 실행). 제품(base) 대비 진폭 비',
    base: { P: base.dominantP, amp: base.ampRatio, edgeAmpN: base.edgeAmpN },
    sparse: { P: sparse.dominantP, amp: sparse.ampRatio, edgeAmpN: sparse.edgeAmpN },
    amp_rise: base.ampRatio > 1e-9 ? +(sparse.ampRatio / base.ampRatio).toFixed(3) : null,
  }
  expect(sparse.ampRatio, '반증 — 성긴 도장의 주기 진폭이 제품의 2배를 넘는다').toBeGreaterThan(base.ampRatio * 2)
})
test('⑥ 크기 정직성(58 ⛔ 계약) — 반최대 폭 ≈ 요청 굵기 · 2배는 2배', async ({ page }) => {
  await boot(page)
  const widthOf = (i: Instr, wPx: number, preset?: string) =>
    page.evaluate(([tool, w, preset]) => {
      const b2 = (window as any).__b2
      // 큰 붓(58 ⛔ 도구별 최대 대역)은 판을 키운다 — 획 산포가 판을 넘으면 폭이 잘려 거짓 통과
      const bh = Math.max(240, Math.ceil((w as number) * 2.6)), bw2 = bh > 240 ? 900 : 480
      b2.diag.markSampleForTest(tool, 'line', w, 61, bw2, bh, preset ? { preset } : undefined)
      const m = (window as any).__m61 as { v: number[]; w: number; h: number }
      const W = m.w, H = m.h
      // web2-63: 팁이 든 슬롯(연필·색연필 기본)은 «범위 폭»(열 최대의 25% 위 — 보정이 쓰는 그 자 · 희소 판에서 반최대는 판의
      // 몇 픽셀만 센다)으로, 팁 없는 슬롯은 61의 반최대 그대로. 어느 자였는지와 다른 자의 값도 함께 남긴다(ruler · alt).
      const tipOn = preset ? b2.diag.tipDefaultOfForTest(preset) != null : (b2.diag.tipStatsForTest?.().defaults ?? {})[tool as string] != null
      const measure = (frac: number): number => {
        const widths: number[] = []
        for (let x = 60; x < W - 60; x += 2) {
          let mx = 0
          for (let y = 0; y < H; y++) mx = Math.max(mx, m.v[y * W + x]!)
          if (mx < 20) continue
          const th = mx * frac
          let n = 0
          for (let y = 0; y < H; y++) if (m.v[y * W + x]! > th) n++
          widths.push(n)
        }
        widths.sort((a, b) => a - b)
        return widths.length ? widths[Math.floor(widths.length / 2)]! : 0
      }
      const half = measure(0.5), ext = measure(0.25)
      ;(window as any).__w61 = { ruler: tipOn ? 'extent25' : 'halfmax', halfmax: half, extent25: ext }
      return tipOn ? ext : half
    }, [i, wPx, preset] as const)
  const lastRuler = () => page.evaluate(() => (window as any).__w61 as { ruler: string; halfmax: number; extent25: number })
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const rows: Record<string, unknown> = {}
  OUT.constants_snapshot = { PAINT61_SIZE_TOL: cs.PAINT61_SIZE_TOL, PAINT61_END_TOL: cs.PAINT61_END_TOL, PAINT61_PAPER_CORR_MIN: cs.PAINT61_PAPER_CORR_MIN, note: '스냅샷-라이트(#42 ⑥의 최소 고리 — web2 원장의 constantsSnapshot 기계 부재는 종전 유보)' }
  for (const i of ['pencil', 'cp', 'brush', 'marker'] as Instr[]) {
    const w24 = await widthOf(i, 24)
    const r = +(w24 / 24).toFixed(3)
    rows[i] = { w24, ratio: r, ...(await lastRuler()) }
    expect(Math.abs(r - 1), `${i} — 반최대 폭 ÷ 요청 24px이 허용 안`).toBeLessThanOrEqual(cs.PAINT61_SIZE_TOL)
  }
  const p48 = await widthOf('pencil', 48)
  const doubling = +(p48 / (rows.pencil as { w24: number }).w24).toFixed(3)
  // 58 ⛔의 «도구별 최대» 대역(붓 500·마커 100·색연필/연필 50) — 상한 쪽도 잰다(리뷰어 [6]):
  // 마커 100·붓 250은 문 안을 단언하고, 붓 500은 견본 판(1024 캔버스)의 물리 한계 안에서
  // 실측 기록(레벨 상한과 같은 자리 — 대형은 실기기 눈 판정 몫 · DEFERRED).
  const m100 = await widthOf('marker', 100)
  const c50 = await widthOf('cp', 50)
  const b250 = await widthOf('brush', 250)
  const b500 = await widthOf('brush', 500)
  const rm = +(m100 / 100).toFixed(3), rb = +(b250 / 250).toFixed(3), rc = +(c50 / 50).toFixed(3)
  OUT.size_honesty = {
    rows, pencil_w48: p48, doubling,
    marker_w100: { w: m100, ratio: rm }, cp_w50: { w: c50, ratio: rc }, brush_w250: { w: b250, ratio: rb },
    brush_w500: { w: b500, ratio: +(b500 / 500).toFixed(3), note: '기록 — 견본 판·굽기 캔버스(1024)의 상한 대역. 대형 자국의 눈 판정은 실기기 몫' },
    def: '직선 견본(압력 0.5 상수)의 열별 폭 중앙값 ÷ 요청 굵기(px) — 자는 슬롯의 팁 유무로 갈린다(web2-63: 팁 든 연필·색연필 = 범위 폭(열 최대의 25% 위 · 보정과 같은 자) · 잉크펜·마커 = 반최대(61 그대로) · 행의 ruler·halfmax·extent25가 그 값). 58 ⛔ 「크기 슬라이더·도구별 최대」의 정직성 — 사다리(√2 파생)와 칸별 실측 보정이 실제로 px를 낸다. doubling = 연필 48 ÷ 24의 폭 비(기대 ~2) · 상한 대역은 marker_w100·cp_w50·brush_w250(단언)·brush_w500(기록) — 연필 최대(50)는 w48이 대리',
    threshold: cs.PAINT61_SIZE_TOL,
  }
  // 반증(리뷰어 [H4] · D-3): 자가 보정이 게이트의 자(반최대 폭)와 «같은 양을 푼다»는 물음 — 보정을 끄면(반지름 = 폭/2 · 기하 그대로)
  // 프리셋의 마스크·산포가 반최대 폭을 요청에서 벗어나게 해야 한다. 벗어난 만큼이 보정이 «한 일»이다(값).
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(true))
  const naive: Record<string, number> = {}
  for (const i of ['pencil', 'cp', 'brush', 'marker'] as Instr[]) naive[i] = +((await widthOf(i, 24)) / 24).toFixed(3)
  // web2-64: 슬롯 넷의 기본이 전부 «반지름 ≈ 폭/2» 대역에 들어(cp 슬롯이 앱 색연필로 바뀌며 .75 — 문 .35 안) 반증이 넷만으로는 안 선다 →
  // 팁 든 산포 프리셋(파스텔 rock-pitted — 보정표 w1 20·w2 67)을 다섯째 행으로: 보정 끔이면 폭이 요청에서 크게 벗어나야 한다(보정이 «한 일»의 값)
  naive.pastel_preset = +((await widthOf('pencil', 24, 'ramon/Pastel_1')) / 24).toFixed(3)
  await page.evaluate(() => (window as any).__b2.diag.setCalibOffForTest(false))
  const naiveDev = Math.max(...Object.values(naive).map(v => Math.abs(v - 1)))
  const naiveBinds = Object.fromEntries(Object.entries(naive).map(([k, v]) => [k, Math.abs(v - 1) > cs.PAINT61_SIZE_TOL]))
  ;(OUT.size_honesty as Record<string, unknown>).falsification_calib_off_binds = { def: '보정 끔이 게이트 값을 문 밖으로 밀어낸 도구(여기서만 반증이 섰다 — 2차 [7]). 마커(ramon/100%_Opaque)는 보정표가 w = 2r(a 2 · b 0)이라 «반지름 = 폭/2»와 같은 사상 = 항등이 맞다 · 잉크펜은 .917(문 안)', ...naiveBinds, n: Object.values(naiveBinds).filter(Boolean).length }
  ;(OUT.size_honesty as Record<string, unknown>).falsification_calib_off = { def: '보정 끔(반지름 = 요청 폭/2)의 w24 폭 비(자는 게이트와 같다 — 팁 든 슬롯은 범위 25% · 아니면 반최대 · web2-63) — 보정이 무엇인가를 «한다»의 실증(넷 중 최대 편차가 문 밖이어야 자가 산다). 보정과 게이트가 같은 자(반최대 폭)를 쓰는 것은 «자가 보정의 정의»이지 자기참조가 아니다 — 보정은 반지름 6·24 두 점의 직선 견본에서 폭을 재고, 게이트는 그 표로 «다른 요청 폭(24·48·100·250·500)»의 자국을 다시 잰다(보간·비례가 실제로 서는가)', rows: naive, max_dev: +naiveDev.toFixed(3) }
  expect(naiveDev, '반증 — 보정을 끄면 어느 도구의 반최대 폭이 허용을 벗어난다(보정이 실제로 일한다)').toBeGreaterThan(cs.PAINT61_SIZE_TOL)
  expect(doubling, '연필 — 굵기 2배는 폭도 2배 대역').toBeGreaterThan(1.6)
  expect(doubling, '연필 — 굵기 2배는 폭도 2배 대역').toBeLessThan(2.4)
  expect(Math.abs(rm - 1), '마커 100(도구 최대) — 반최대 폭이 허용 안').toBeLessThanOrEqual(cs.PAINT61_SIZE_TOL)
  expect(Math.abs(rc - 1), '색연필 50(도구 최대) — 반최대 폭이 허용 안').toBeLessThanOrEqual(cs.PAINT61_SIZE_TOL)
  expect(Math.abs(rb - 1), '붓 250 — 반최대 폭이 허용 안').toBeLessThanOrEqual(cs.PAINT61_SIZE_TOL)
})
