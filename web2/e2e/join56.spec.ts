// web2-56 — 접합의 **화면 몫**. 기하·승부·치유·결정론·1링은 단위 팔(test/joint56.test.ts).
// 여기서 재는 것(지시 게이트 그대로):
//   ① **같은 분류 두 장이 L로 만나면 계단 픽셀 0** ← 이 라운드의 중심 게이트.
//      평면 뷰(바닥 정면 — 평행 사영)에서 코너 표본 사각 안의 «안 덮인» 픽셀을 센다.
//      D-2/D-3 ①: 병합 걸음을 실제로 꺼서(joint56OffForTest) 계단이 돌아오는 것을 같은
//      실행에서 실측하고, 그 «전» 값을 join56_web2_pre_dpr*.json에 갈라 남긴다(#42(d)).
//   ② **다른 분류 L — 버트·이긴 쪽 관통** · 반증(D-3 ②): 우선순위 뒤집기 → 관통 쪽이 바뀐다
//   ③ 55의 칠이 살아 있다 — 접합 켬/끔에 칠의 uv(저장)가 불변이고 자국이 화면에 남는다
//   ④ 손통 「접합」 줄 — 34-0 몫(#96·#97: 툴팁 두 상태 · elementFromPoint · 재누름 토글) ·
//      끊기의 값(코너 획 nj → 접합이 빠진다 — 끝이 평평해지는 것의 상태판)
//   ⑤ 성능 — 접합 장면의 syncStrokes·접합 통계(원장 값 — 문턱 없음 #82)
//   ⚠ T 접합의 판정자는 단위 ④다(줄기-막대 배치의 값 대조는 픽셀보다 세계 단위가 정본).
//
// 장면: thick55 room3의 코너판 — 바닥 + 코너 획(500,500→500,380)을 나누는 벽 두 장.
// ⚠ 지정 차례: 바닥·벽A 먼저, 벽B 획은 «그 뒤에» — 벽B 다각형이 화면에서 바닥 영역을
// 덮어서, 획이 다 있으면 바닥 클릭이 벽B 루프를 잡는다(단위 픽스처의 D-1 실측 그대로).
// 원장: stage0/out/join56_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { C } from '../src/core/constants'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-56 — 접합: 계단 픽셀 0(중심) · 버트/관통 · 칠 생존 · 손통 「접합」 · 성능',
  note_92: '판정자는 픽셀(안 덮인 수)·세계 단위 이동량·uv 값이다 — 「접합했다」는 이름표라 안 센다',
  note_d3: 'D-3 셋의 자리: ① 병합 걸음 끄기(이 파일 ①) ② 우선순위 뒤집기(이 파일 ②) ③ 코어 지우기(단위 ④ — thick55 문법대로 화면 몫/상태 몫을 가른다)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/join56_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: {
      workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/join56.spec.ts (워커 1 · 스펙 하나씩 강제 — #99)',
    },
    ...OUT,
  }, null, 2))
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

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 포즈가 멈출 때까지 — 상한 3s(#95 · paint54의 그 헬퍼) */
async function waitPoseSettled(page: Page) {
  let prev = ''
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100)
    const cur = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose))
    if (cur === prev) return
    prev = cur
  }
}

/** 코너 장면 — 바닥 + L로 만나는 벽 두 장(코너 획 공유) + 축척 2500. */
async function cornerScene(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)      // 코너 기둥(공유 모서리)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  const cornerStroke = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), cornerStroke)
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)   // 바닥(벽B 획이 없는 지금만 잡힌다)
  await page.mouse.click(550, 430); await page.waitForTimeout(60)   // 벽 A(오른쪽)
  await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  await drawLine(page, 400, 475, 400, 385)
  await drawLine(page, 400, 385, 500, 380)
  await page.click('#btn-face')
  await page.mouse.click(450, 430); await page.waitForTimeout(60)   // 벽 B(왼쪽)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  const ids = await page.evaluate(() => {
    const app = (window as any).__b2.app
    const walls = app.faces.filter((f: any) => Math.abs(f.normal.y) < 0.5)
    const floor = app.faces.find((f: any) => Math.abs(f.normal.y) >= 0.5)?.id
    // A = 오른쪽 벽(외곽 무게중심 x가 큰 쪽 — 화면이 아니라 세계 x로도 같은 쪽이다)
    const cx = (f: any) => f.outer.reduce((m: number, p: any) => m + p.x, 0) / f.outer.length
    walls.sort((a: any, b: any) => cx(b) - cx(a))
    return { wallA: walls[0]?.id, wallB: walls[1]?.id, floor, wallN: walls.length }
  })
  expect(ids.wallN, '벽 두 판').toBe(2)
  expect(ids.floor, '바닥').toBeDefined()
  // 벽 둘을 칠한 면으로(48-9 — 안 칠한 면은 화면에 없다: 단색 채움이 가장 값싼 «칠했다»)
  await page.evaluate((f) => {
    const app = (window as any).__b2.app
    for (const id of [f.wallA, f.wallB]) {
      const face = app.doc.faces.find((x: any) => x.id === id)
      if (face) face.fill = 2
    }
  }, ids)
  return { ...ids, cornerStroke } as { wallA: number; wallB: number; floor: number; cornerStroke: number }
}

/** 벽 분류 일괄 t(mm) — 값 배선은 diag.setThickForTest(=setClsThickness) 하나 */
const thicken = (page: Page, fid: number, mm: number) =>
  page.evaluate(([f, m]) => (window as any).__b2.diag.setThickForTest(f, m), [fid, mm])

/** 바닥 정면(평행 평면 뷰)으로 — 54-3의 칠통 정면 단추(그 경로 그대로 #54) */
async function flyPlan(page: Page, floorId: number) {
  await page.evaluate((fid) => {
    const app = (window as any).__b2.app
    app.faceSel = app.faceSel.filter((x: number) => x !== fid)
    app.faceSel.push(fid)
  }, floorId)
  await page.click('#btn-paint')
  await page.click('#btn-paint')
  await page.click('#btn-paint-front')
  await waitPoseSettled(page)
  await page.click('#btn-pencil')
  await page.waitForTimeout(80)
}

/** 벽-벽 접합 기록과 계단 표본(화면 사각) — diag.joint56에서 그 쌍만 */
const wallJoin = (page: Page, a: number, b: number) =>
  page.evaluate(([wa, wb]) => {
    const j = (window as any).__b2.diag.joint56()
    const rec = j.joins.find((x: any) => (x.a === wa || x.a === wb) && (x.b === wa || x.b === wb))
    return rec ? { ...rec, stats: j.stats } : null
  }, [a, b])

/** 표본 사각(화면 좌표) 안의 «안 덮인» 픽셀 — #gl 알파가 낮은 자리(종이가 비치는 자리).
 *  사각을 C.JOIN56_PROBE_SHRINK만큼 무게중심 쪽으로 줄여 AA 가장자리를 뺀다. */
const stairPx = (page: Page, quad: { x: number; y: number }[]) =>
  page.evaluate(([q, shrink]) => {
    const pts = q as { x: number; y: number }[]
    const cx = pts.reduce((m, p) => m + p.x, 0) / 4, cy = pts.reduce((m, p) => m + p.y, 0) / 4
    const k = 1 - (shrink as number)
    const s = pts.map(p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }))
    const inQuad = (x: number, y: number) => {
      let inside = false
      for (let i = 0, j = 3; i < 4; j = i++) {
        const xi = s[i]!.x, yi = s[i]!.y, xj = s[j]!.x, yj = s[j]!.y
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const x0 = Math.floor(Math.min(...s.map(p => p.x))), x1 = Math.ceil(Math.max(...s.map(p => p.x)))
    const y0 = Math.floor(Math.min(...s.map(p => p.y))), y1 = Math.ceil(Math.max(...s.map(p => p.y)))
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((x1 - x0) * dpr))
    t.height = Math.max(1, Math.round((y1 - y0) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0 * dpr), Math.round(y0 * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let uncovered = 0, total = 0
    for (let py = 0; py < t.height; py++) {
      for (let px = 0; px < t.width; px++) {
        const sx = x0 + (px + 0.5) / dpr, sy = y0 + (py + 0.5) / dpr
        if (!inQuad(sx, sy)) continue
        total++
        if (d[(py * t.width + px) * 4 + 3]! < 128) uncovered++
      }
    }
    return { uncovered, total }
  }, [quad, C.JOIN56_PROBE_SHRINK] as [unknown, number])

test('① 중심 게이트 — 같은 분류 L의 계단 픽셀 0 (+D-2/D-3: 걸음을 끄면 계단이 돌아온다)', async ({ page }, info) => {
  const ids = await cornerScene(page)
  const r = await thicken(page, ids.wallA, 200)
  expect((r as { n: number } | null)?.n, '일괄 — 같은 분류 벽 둘').toBe(2)
  await settle(page); await settle(page)
  const j0 = await wallJoin(page, ids.wallA, ids.wallB)
  expect(j0, '벽-벽 접합이 섰다').not.toBeNull()
  expect(j0.kind).toBe('L')
  expect(j0.tie, '같은 분류 — 무승부(마이터는 그 결과다)').toBe(true)
  await flyPlan(page, ids.floor)
  await settle(page); await settle(page)
  // 제품 대역 동작점(t=200 · 무확대 — #12 · 2차 대응 [11]): 켬 = 0이 이 눈금에서도 선다.
  // (끔의 판별은 아래 증폭 대역이 한다 — 이 눈금의 끔은 8px로 자 아래였다: D-5 실측)
  const jP = await wallJoin(page, ids.wallA, ids.wallB)
  const qP = (jP.probeScr as ({ x: number; y: number } | null)[][])
    .filter(q => q.every(p => p !== null)) as { x: number; y: number }[][]
  expect(qP.length).toBeGreaterThan(0)
  const on200 = await stairPx(page, qP[0]!)
  // 같은 동작점의 «끔»(2차 [7] — #12의 다른 반쪽): 표본이 작아 자 눈금(THICK55_PRESENCE_PX)
  // 아래지만, 전부 계단(uncovered == total)이라는 값 자체는 선다.
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(true))
  await settle(page); await settle(page)
  const off200 = await stairPx(page, qP[0]!)
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(false))
  await settle(page); await settle(page)
  // 측정 대역: t=400(계단 200×200mm) + 코너 4배 확대 — 끔 계단이 수백 px가 되는 눈금
  await thicken(page, ids.wallA, 400)
  await settle(page); await settle(page)
  // 코너를 확대한다 — 표본 사각의 무게중심을 화면 가운데로, 4배(모든 화면 좌표는
  // docToScreen이 view를 타므로 probeScr도 같이 확대된다 — #54의 그 한 자리).
  const j00 = await wallJoin(page, ids.wallA, ids.wallB)
  const c0 = (j00.probeScr as ({ x: number; y: number } | null)[][])
    .flat().filter((p): p is { x: number; y: number } => p !== null)
  expect(c0.length).toBeGreaterThan(0)
  const cx = c0.reduce((m, p) => m + p.x, 0) / c0.length
  const cy = c0.reduce((m, p) => m + p.y, 0) / c0.length
  await page.evaluate(([px, py]) => {
    const w2 = (window as any).__b2
    const app = w2.app
    const Z = 4
    const v = app.view
    // 화면 px ↔ 문서: doc = (p − o)/s. 새 o는 그 문서점이 화면 가운데에 오게 한다.
    const dx = ((px as number) - v.ox) / v.s, dy = ((py as number) - v.oy) / v.s
    app.view = {
      s: v.s * Z,
      ox: window.innerWidth / 2 - dx * v.s * Z,
      oy: window.innerHeight / 2 - dy * v.s * Z,
    }
    w2.diag.invalidate?.()
  }, [cx, cy])
  await settle(page); await settle(page)
  // 평면 뷰의 표본 사각 — 세 높이(끝·중간·끝) 중 화면 면적 최대(전부 유효한 것)
  const j1 = await wallJoin(page, ids.wallA, ids.wallB)
  const quads = (j1.probeScr as ({ x: number; y: number } | null)[][])
    .filter(q => q.every(p => p !== null)) as { x: number; y: number }[][]
  expect(quads.length, '표본 사각이 화면에 있다').toBeGreaterThan(0)
  const area = (q: { x: number; y: number }[]) => {
    let a = 0
    for (let i = 0; i < 4; i++) a += q[i]!.x * q[(i + 1) % 4]!.y - q[(i + 1) % 4]!.x * q[i]!.y
    return Math.abs(a) / 2
  }
  quads.sort((a, b) => area(b) - area(a))
  const probe = quads[0]!
  const on = await stairPx(page, probe)
  // D-3 ① — 병합 걸음을 실제로 끈다: 55의 버트-중심선(세그먼트 판)이 돌아온다.
  // 이 «끔» 상태가 곧 수리 «전»의 기하다(렌더가 이동표 없이는 55와 같은 정점을 낸다) —
  // 그 값을 pre 원장에 갈라 남긴다(#42(d)).
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(true))
  await settle(page); await settle(page)
  const off = await stairPx(page, probe)
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(false))
  await settle(page); await settle(page)
  const on2 = await stairPx(page, probe)
  // 접합 끊기의 픽셀 값(2차 대응 [7] — «끝이 평평해지고 이음선이 보인다»의 자):
  // 코너 획에 nj를 걸면 같은 표본 사각이 끔 값으로 돌아온다(= 55의 버트 = 계단).
  await page.evaluate((sid) => (window as any).__b2.diag.setNjForTest(sid, true), ids.cornerStroke)
  await settle(page); await settle(page)
  const nj = await stairPx(page, probe)
  await page.evaluate((sid) => (window as any).__b2.diag.setNjForTest(sid, false), ids.cornerStroke)
  await settle(page); await settle(page)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/join56_web2_pre_dpr${info.project.name === 'dpr2' ? 2 : 1}.json`),
    JSON.stringify({
      what: 'web2-56 — 수리 «전» 기하의 계단 실측(D-2 · #42(d)): **같은(56) 트리에서 이동표를 끈 값**이다. «55 렌더와 같은 정점»은 코드 경로 근거의 주장이다(이동표가 비면 렌더 정점 식이 55와 같다 — 55 트리 재실행 실측이 아니다 · 리뷰어 1차 [8]). 같은 표본 사각을 같은 자로 잰 수리 후 값은 join56_web2_dpr*.json stair.px_join_on',
      conditions: { project: info.project.name, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/join56.spec.ts (① 안에서 joint56OffForTest(true) 상태의 측정)' },
      probe_scr: probe, shrink: C.JOIN56_PROBE_SHRINK,
      stair_px_no_join: off.uncovered, probe_total_px: off.total,
    }, null, 2))
  OUT.stair = {
    def: '중심 게이트: 평면 뷰 **벽-벽** 코너(⚠ 55 stair 구성값(buried 75·step 100mm)은 벽⊥바닥 코너의 «크기 눈금»이지 이 사각의 자리가 아니다 — 벽⊥바닥 접합은 둘만 두꺼울 때 서고 방 구석에선 복합 구석 기각 · 리뷰어 1차 [1] · DEFERRED) 표본 사각(15% 축소) 안의 «안 덮인» 픽셀(#gl 알파<128). ⚠ 픽셀 0의 뜻은 «코너가 덮였다»다 — 과잉 연장도 0을 낸다: 모양(정확한 마이터)의 정본은 단위(joint56.test) ①이다(자기 평면 잔차<1e-9 = 과잉이면 깨진다 · 캡 일치 · ext 크기 = 정확히 t/2 — 이 원장 ext_front/back ±0.1536이 그 값 · 리뷰어 1차 [5]). 동작점 둘(#12 · 2차 [7]): 제품 대역 t=200·무확대(켬 0 / 끔 = uncovered==total 전부 계단 — 표본이 자 눈금(THICK55_PRESENCE_PX) 아래라 판별은 증폭 대역이 한다 · D-5)와 측정 대역 t=400·4배 확대(켬 0 / 끔 실측). 끔 = D-3 ①(그 값이 pre 원장의 짝) · nj = 접합 끊기의 픽셀 값 — ⚠ 단일 접합 장면이라 nj와 전역 끔의 기하가 같은 것이 «정답»이고(2차 [16]) nj가 전역 스위치와 «다른 경로»(이동표가 아니라 모서리 자격)로 같은 결과에 닿는 것의 상태판은 e2e ④(wallJoin null)다',
    px_join_on_t200_nozoom: on200.uncovered, px_join_off_t200_nozoom: off200.uncovered,
    probe_total_t200: on200.total,
    px_join_on: on.uncovered, px_join_off: off.uncovered, px_join_on_again: on2.uncovered,
    px_nj_broken: nj.uncovered,
    probe_total_px: on.total, tie: j0.tie, ext_front: j1.extA.front, ext_back: j1.extA.back,
  }
  expect(on200.uncovered, '제품 대역(t=200·무확대) — 켬 0').toBeLessThanOrEqual(C.JOIN56_STAIR_PX_MAX)
  // ⚠ «전부(== total)» 단언은 안 건다 — dpr2에서 33/34(AA 경계 한 픽셀)가 실측됐다:
  // 표본이 작아 축소 여유(15%)가 AA를 다 못 벗어난다. 이 동작점의 값은 «켬 0 ↔ 끔 양성»이다.
  expect(off200.uncovered, '제품 대역 끔 — 계단이 실재한다(값은 uncovered/total로 원장에)').toBeGreaterThan(0)
  expect(off.uncovered, 'D-3/D-2 — 걸음을 끄면 계단이 실제로 돌아온다').toBeGreaterThan(C.THICK55_PRESENCE_PX)
  expect(on.uncovered, '중심 게이트 — 계단 픽셀 0').toBeLessThanOrEqual(C.JOIN56_STAIR_PX_MAX)
  expect(on2.uncovered, '다시 켬 — 0으로 복귀').toBeLessThanOrEqual(C.JOIN56_STAIR_PX_MAX)
  expect(nj.uncovered, '접합 끊기 — 계단(끔 값)으로 돌아온다: 끝이 평평해졌다').toBeGreaterThan(C.THICK55_PRESENCE_PX)
})

test('② 다른 분류 L — 버트·이긴 쪽 관통 (+반증: 우선순위 뒤집기)', async ({ page }) => {
  const ids = await cornerScene(page)
  await page.evaluate((f) => {
    const app = (window as any).__b2.app
    app.doc.faces.find((x: any) => x.id === f.wallB)!.cls = 'extw'
  }, ids)
  await page.evaluate(() => (window as any).__b2.diag.joint56SetDefForTest('wall', { t: 200 }))
  await page.evaluate(() => (window as any).__b2.diag.joint56SetDefForTest('extw', { t: 200 }))
  await settle(page)
  const j = await wallJoin(page, ids.wallA, ids.wallB)
  expect(j, '접합이 섰다').not.toBeNull()
  expect(j.tie, '다른 구성 — 저절로 버트(특수 분기 없음)').toBe(false)
  expect(j.winner, '외벽(pri 4)이 벽(pri 3)을 이겨 관통한다').toBe(ids.wallB)
  // 반증(D-3 ②) — 우선순위를 실제로 뒤집는다: 관통하는 쪽이 «값으로» 바뀐다
  // (승자 이름표만으로는 안 센다 #92 — 이동량의 부호·주인이 실제로 넘어간 것을 잰다)
  await page.evaluate(() => (window as any).__b2.diag.joint56SetDefForTest('wall', { pri: 9 }))
  await settle(page)
  const j2 = await wallJoin(page, ids.wallA, ids.wallB)
  expect(j2.winner, '뒤집힌 우선순위 — 벽이 관통한다').toBe(ids.wallA)
  // ⚠ 값은 «벽 기준»으로 적는다(2차 [2] — 역할(win/lose) 키는 주인이 바뀌어도 값이 구성상
  // 불변이라 이름표가 된다): 같은 벽(wall 분류 · wallA)의 이동량 부호가 −(버트 후퇴) →
  // +(관통 연장)로 실제로 넘어가는 것이 반증의 값이다.
  const extOf = (rec: { a: number; extA: { front: number; back: number }; extB: { front: number; back: number } | null }, fid: number) =>
    rec.a === fid ? rec.extA : rec.extB!
  const wallBefore = extOf(j, ids.wallA), extwBefore = extOf(j, ids.wallB)
  const wallAfter = extOf(j2, ids.wallA), extwAfter = extOf(j2, ids.wallB)
  expect(Math.max(wallBefore.front, wallBefore.back), '벽(전 · 진다) — 두 표면 후퇴(−)').toBeLessThan(0)
  expect(Math.min(extwBefore.front, extwBefore.back), '외벽(전 · 이긴다) — 두 표면 연장(+)').toBeGreaterThan(0)
  expect(Math.min(wallAfter.front, wallAfter.back), '벽(후 · 뒤집혀 이긴다) — 부호가 −에서 +로 넘어갔다').toBeGreaterThan(0)
  expect(Math.max(extwAfter.front, extwAfter.back), '외벽(후 · 진다) — +에서 −로').toBeLessThan(0)
  OUT.butt = {
    def: '다른 분류 L(벽3 ↔ 외벽4): tie=false · winner=외벽(관통 — 진 쪽 바깥 평면까지 · 관통은 두 표면 +, 버트는 두 표면 − · 세계 단위) · 반증 = pri 뒤집기(wall.pri 9). ⚠ 값은 벽 기준이다(2차 [2] — 역할 키는 주인이 바뀌어도 값이 구성상 같아 이름표가 된다 #92): ext_wall이 {−,−} → {+,+}로, ext_extw가 {+,+} → {−,−}로 **부호가 실제로 넘어간다**. T 접합·코어 반증(D-3 ③)의 판정자는 단위(joint56.test) ④·원장 gates 블록이다',
    winner_before: j.winner === ids.wallB ? 'extw' : 'wall',
    winner_after_flip: j2.winner === ids.wallA ? 'wall' : 'extw',
    ext_wall_before: wallBefore, ext_extw_before: extwBefore,
    ext_wall_after_flip: wallAfter, ext_extw_after_flip: extwAfter,
  }
})

test('③ 55의 칠이 살아 있다 — 접합 켬/끔에 uv 불변 · 자국이 화면에 남는다', async ({ page }) => {
  const ids = await cornerScene(page)
  await thicken(page, ids.wallA, 200)
  await settle(page)
  // 벽 A 앞면에 마커 한 획(접합 모서리에서 떨어진 자리)
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 10 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  await drawLine(page, 520, 435, 545, 420)
  await page.click('#btn-pencil')
  await settle(page); await settle(page)
  const blueN = () => page.evaluate(() => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = src.width; t.height = src.height
    const g = t.getContext('2d')!
    g.drawImage(src, 0, 0)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if ((d[i + 2]! - d[i]!) > 40 && d[i + 3]! > 30) n++
    return n
  })
  const wallPaintId = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    return ss.filter((x: any) => x.paint).pop()?.id ?? null
  })
  expect(wallPaintId).not.toBeNull()
  const uvOf = () => page.evaluate((id) => {
    const s = (window as any).__b2.app.doc.strokes.find((x: any) => x.id === id)
    return s?.paint ? JSON.stringify(s.paint.uv) : null
  }, wallPaintId)
  const uv0 = await uvOf()
  const n0 = await blueN()
  expect(uv0, '칠 획이 uv로 섰다').not.toBeNull()
  expect(n0, '칠이 화면에 실재한다').toBeGreaterThan(10)
  // 띠(테두리 — 지시 문면이 «테두리 길이를 바꿔도»다 · 1차 [9]) — thick55 ④의 자로 띠
  // 사각(화면 면적 최대 = 자유단 세로 모서리 — 접합 코너 밖)을 찾아 한 획 긋는다.
  const band = await page.evaluate((fid) => {
    const t = (window as any).__b2.diag.thick55(fid)
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
  }, ids.wallA)
  expect(band, '띠 사각이 화면에 있다').not.toBeNull()
  const mid = (i: number, j2: number) => ({ x: (band.scr[i].x + band.scr[j2].x) / 2, y: (band.scr[i].y + band.scr[j2].y) / 2 })
  const m0 = mid(0, 3), m1 = mid(1, 2)
  await page.click('#btn-paint')
  await page.waitForTimeout(80)
  await drawLine(page, m0.x + (m1.x - m0.x) * 0.3, m0.y + (m1.y - m0.y) * 0.3,
    m0.x + (m1.x - m0.x) * 0.7, m0.y + (m1.y - m0.y) * 0.7)
  await page.click('#btn-pencil')
  await settle(page); await settle(page)
  const bandStroke = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return last?.paint ? { e: last.paint.e ?? null, uv: JSON.stringify(last.paint.uv) } : null
  })
  expect(bandStroke?.e, '띠에 그은 획이 테두리 슬롯(e=1)로 섰다').toBe(1)
  const nBase = await blueN()
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(true))
  await settle(page); await settle(page)
  const uvOff = await uvOf(), nOff = await blueN()
  const bandOff = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return last?.paint ? JSON.stringify(last.paint.uv) : null
  })
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(false))
  await settle(page); await settle(page)
  const uvOn = await uvOf(), nOn = await blueN()
  OUT.paint_alive = {
    def: '칠 생존 게이트. ⚠ 가름(1차 [9] — 자기참조 유형 3): uv 불변은 **구성 보장**이다(칠의 정본은 중심면의 자라 접합 코드가 그 필드에 닿지 않는다) — 여기서 재는 것은 측정이 아니라 «배선»이고, **측정의 몫은 픽셀 실재**다. 값의 자리(2차 [6] — 두 자가 섞여 있었다): px_wall_on = 벽 앞면 칠«만»(띠 칠을 얹기 전 · 켬) · px_all_* = 벽+띠 칠(켬/끔/다시 켬). px_all_on == px_all_on2(바이트급 동일 — 같은 상태 같은 수: 되돌림의 값)이고 켬↔끔의 차(대역 20~40%)는 결함이 아니라 기하가 실제로 다른 것이다(마이터 캡 ↔ 버트 캡 — 띠 칠이 걸친 사각의 자리·텍스처 신축이 갈린다). 판별력은 «세 상태 전부 실재 + 같은 상태 복귀 동일»이 든다. ⚠ 캡 «끝단»(이동으로 늘어난 영역)의 칠 적중은 자 밖 — DEFERRED 그 행이 경계다',
    uv_face_unchanged: uv0 === uvOff && uv0 === uvOn,
    uv_band_unchanged: bandStroke!.uv === bandOff,
    px_wall_on: n0, px_all_on: nBase, px_all_off: nOff, px_all_on2: nOn,
    all_on_returns_equal: nBase === nOn,
  }
  expect(uv0 === uvOff && uv0 === uvOn, '앞면 uv 불변 — 배선 확인').toBe(true)
  expect(bandStroke!.uv === bandOff, '띠 (s,u) 불변 — 배선 확인').toBe(true)
  expect(nOff, '끔에서도 자국(앞면+띠)이 있다').toBeGreaterThan(10)
  expect(nOn, '켬에서도 자국이 있다').toBeGreaterThan(10)
  expect(nBase, '같은 상태(켬) 복귀 — 자국 수가 그대로다(렌더 결정론)').toBe(nOn)
})

test('④ 손통 「접합」 줄 — 34-0 몫(#96·#97) · 끊기의 값(접합이 실제로 빠진다)', async ({ page }) => {
  const ids = await cornerScene(page)
  await thicken(page, ids.wallA, 200)
  await settle(page)
  // 막힌 상태(잡기 전)의 툴팁
  await page.evaluate(() => {
    const tray = document.getElementById('griptray')!
    if (!tray.classList.contains('open')) (document.getElementById('btn-grip') as HTMLElement)?.click()
  })
  await page.waitForTimeout(80)
  const blockedTip = await page.evaluate(() => document.getElementById('btn-grip-njoin')?.title ?? null)
  await page.click('#btn-pencil')
  await holdAt(page, 600, 430)                                  // 벽 A 오른 모서리 획(자유단)
  const grabbed = await page.evaluate(() => (window as any).__b2.app.grip?.ids ?? [])
  expect((grabbed as number[]).length, '선이 잡혔다').toBeGreaterThan(0)
  await page.evaluate(() => {
    const tray = document.getElementById('griptray')!
    if (!tray.classList.contains('open')) (document.getElementById('btn-grip') as HTMLElement)?.click()
  })
  await page.waitForTimeout(120)
  const st = await page.evaluate(() => {
    const b = document.getElementById('btn-grip-njoin')
    if (!b) return null
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    const tray = document.getElementById('griptray')!
    return {
      title: b.title, disabled: b.classList.contains('disabled'),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      clickable: b === el || b.contains(el),
      overflow: { sh: tray.scrollHeight, ch: tray.clientHeight },
    }
  })
  expect(st, '접합 줄이 있다').not.toBeNull()
  expect(st!.title, '툴팁(#96 — 쓸 수 있는 상태)').toContain('접합')
  expect(st!.disabled, '선을 잡았으니 쓸 수 있다').toBe(false)
  expect(st!.clickable, '줄 중심이 실제로 눌린다(#97 — elementFromPoint)').toBe(true)
  expect(st!.overflow.sh, '손통 세로 넘침 0(#97 짝 — 줄이 하나 늘었다)').toBe(st!.overflow.ch)
  expect(st!.rect.y + st!.rect.h <= st!.viewport.h && st!.rect.x >= 0, '줄이 화면 안(34-6)').toBe(true)
  // 누르면 잡힌 획에 nj가 선다 · 재누름(토글)이 걷는다 — elementFromPoint 행위(#94)
  const press = () => page.evaluate(() => {
    const b = document.getElementById('btn-grip-njoin')!
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (el && (b === el || b.contains(el))) { (el as HTMLElement).closest('button')!.click(); return true }
    return false
  })
  expect(await press(), '실제로 눌린다').toBe(true)
  const njOn = await page.evaluate((g) => {
    const app = (window as any).__b2.app
    return (g as number[]).every(id => app.doc.strokes.find((x: any) => x.id === id)?.nj === 1)
  }, grabbed)
  expect(njOn, '잡힌 획 전부에 nj').toBe(true)
  await page.evaluate(() => {
    const tray = document.getElementById('griptray')!
    if (!tray.classList.contains('open')) (document.getElementById('btn-grip') as HTMLElement)?.click()
  })
  await page.waitForTimeout(80)
  expect(await press(), '재누름도 눌린다').toBe(true)
  const njOff = await page.evaluate((g) => {
    const app = (window as any).__b2.app
    return (g as number[]).every(id => app.doc.strokes.find((x: any) => x.id === id)?.nj === undefined)
  }, grabbed)
  expect(njOff, '재누름 — 이음(토글)').toBe(true)
  // 끊기의 값 — 코너 획에 nj(앱 경로 setStrokeNj)를 걸면 벽-벽 접합이 빠진다
  const before = await wallJoin(page, ids.wallA, ids.wallB)
  expect(before, '끊기 전 — 접합이 있다').not.toBeNull()
  await page.evaluate((sid) => (window as any).__b2.diag.setNjForTest(sid, true), ids.cornerStroke)
  await settle(page)
  const after = await wallJoin(page, ids.wallA, ids.wallB)
  expect(after, '끊김 — 그 모서리 접합이 없다(끝이 평평 = 55의 버트로)').toBeNull()
  await page.evaluate((sid) => (window as any).__b2.diag.setNjForTest(sid, false), ids.cornerStroke)
  await settle(page)
  expect(await wallJoin(page, ids.wallA, ids.wallB), '이음 — 돌아온다').not.toBeNull()
  OUT.ui34_njoin = {
    def: '#96/#97/34-6 — 손통 접합 줄: 툴팁 두 상태 · rect(화면 안) · elementFromPoint 눌림 · 손통 넘침 sh==ch(줄 +1 실측 — 착수 표 (b)) · 재누름 토글 값 · 끊기의 상태값(코너 획 nj → 접합 소멸/복귀)',
    blocked_tip: blockedTip, ok_tip: st!.title, rect: st!.rect, viewport: st!.viewport,
    overflow: st!.overflow, toggle_seq: ['nj=1(전부)', 'nj 걷힘(전부)'],
    break_effect: { before: 'L join', after_nj: 'no join', restored: 'L join' },
  }
})

test('⑤ 성능 — 접합 장면의 syncStrokes·접합 통계 (원장 값 · 문턱 없음 #82)', async ({ page }) => {
  const ids = await cornerScene(page)
  await thicken(page, ids.wallA, 200)
  await thicken(page, ids.floor, 150)
  await settle(page); await settle(page)
  const ms = await page.evaluate(() => {
    const d = (window as any).__b2.diag
    d.syncCostReset()
    const runs: number[] = []
    for (let i = 0; i < 10; i++) runs.push(d.syncStrokesMs())
    runs.sort((a, b) => a - b)
    return { median: +runs[5]!.toFixed(3), min: +runs[0]!.toFixed(3), max: +runs[9]!.toFixed(3) }
  })
  const j = await page.evaluate(() => (window as any).__b2.diag.joint56())
  // 프레임(지시 게이트의 축) — 접합 켬 ↔ 끔의 프레임·메시 수 대조: 접합은 메시 «수»를
  // 안 늘린다(정점 이동뿐)는 주장을 값으로 (perf20의 frame 문법 · #46: dpr1은 vsync 상한).
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
    return { median: +dts[Math.floor(dts.length / 2)]!.toFixed(2), p90: +dts[Math.floor(dts.length * 0.9)]!.toFixed(2) }
  })
  const meshes = () => page.evaluate(() => (window as any).__b2.diag.r3dInfo().faceMeshes as number)
  const onF = { frame: await frame(), meshes: await meshes() }
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(true))
  await settle(page); await settle(page)
  const offF = { frame: await frame(), meshes: await meshes() }
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(false))
  await settle(page)
  OUT.perf = {
    def: '접합 장면(벽 둘 t=200 + 바닥 t=150 — 두꺼운 면 3 · 살아남은 접합 1 · 복합 구석 기각 2)의 syncStrokes ms · 접합 켬/끔 프레임(median/p90 — #46: dpr1은 vsync 상한이라 판별은 dpr2)·faceMeshes 수 대조(9==9 — 접합은 메시 «수» 불변: 정점 이동뿐). ⚠ stats는 **직전 recompute의** 값이고(computed/cached는 그 회의 쌍 평가 — recomputedFaces는 «접합이 평가된» 면·기각 전 단계라 이 장면(3면)에선 전체와 같다) **1링 게이트의 정본은 단위 원장 gates.onering이다**(분모 포함: 두꺼운 면 3·쌍 3에서 벽 하나 이동 → 재계산 쌍 2·재계산 면 [이동 벽, 짝] — 리뷰어 1차 [3]). ⚠ «접합의 프레임 몫 없음»은 이 장면(접합 1)의 켬/끔 실측 + 메시 수 불변에서 온 **추론**이다 — 접합 48 «장면의 프레임» 실측은 없다(그 규모 장면의 구축 비용 · 리뷰어 1차 [4]): 그 규모의 값은 recompute 몫(computeJoints — 단위 원장 perf: 신선 3.3ms · 궤도 프레임에는 아예 안 돈다)이고, 두 하네스의 값은 비로 안 묶고 각각의 절대값으로 둔다(#27 · AS-C148). 절대 ms는 기계 몫(#47) — 문턱 없음(#82)',
    sync_ms: ms, joins: (j.joins as unknown[]).length, rejects: (j.rejects as unknown[]).length,
    thick_faces: 3,
    stats: j.stats,
    frame_join_on: onF.frame, frame_join_off: offF.frame,
    face_meshes_on: onF.meshes, face_meshes_off: offF.meshes,
  }
  expect((j.joins as unknown[]).length, '접합이 실재한다').toBeGreaterThan(0)
  expect(onF.meshes, '접합이 메시 수를 안 늘린다(정점 이동뿐)').toBe(offF.meshes)
})
