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
  // t=400 — 계단(200×200mm)이 평면 뷰 확대에서 수백 픽셀이 되는 값(초판 t=200·무확대는
  // 표본이 ~수십 px라 off 계단이 8px — 자가 신호 아래였다: D-5의 그 자리를 실측으로 고쳤다)
  const r = await thicken(page, ids.wallA, 400)
  expect((r as { n: number } | null)?.n, '일괄 — 같은 분류 벽 둘').toBe(2)
  await settle(page); await settle(page)
  const j0 = await wallJoin(page, ids.wallA, ids.wallB)
  expect(j0, '벽-벽 접합이 섰다').not.toBeNull()
  expect(j0.kind).toBe('L')
  expect(j0.tie, '같은 분류 — 무승부(마이터는 그 결과다)').toBe(true)
  await flyPlan(page, ids.floor)
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
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/join56_web2_pre_dpr${info.project.name === 'dpr2' ? 2 : 1}.json`),
    JSON.stringify({
      what: 'web2-56 — 수리 «전»(병합 걸음 없음 = 55의 세그먼트 판)의 계단 실측(D-2 · #42(d)). 같은 표본 사각을 같은 자로 잰 값 — 수리 후(join56_web2_dpr*.json stair.px_join_on)와 짝이다',
      probe_scr: probe, shrink: C.JOIN56_PROBE_SHRINK,
      stair_px_no_join: off.uncovered, probe_total_px: off.total,
    }, null, 2))
  OUT.stair = {
    def: '중심 게이트: 평면 뷰 코너 표본 사각(15% 축소) 안의 «안 덮인» 픽셀(#gl 알파<128). 접합 켬 = 0(계단 없음 · 문 C.JOIN56_STAIR_PX_MAX) · 끔 = 계단이 실제로 돌아온다(D-3 ① — 그 값이 pre 원장의 짝) · 다시 켬 = 0(복귀). 55 stair 구성값(buried 75 · step 100mm)의 그 코너가 이 사각이다',
    px_join_on: on.uncovered, px_join_off: off.uncovered, px_join_on_again: on2.uncovered,
    probe_total_px: on.total, tie: j0.tie, ext_front: j0.extA.front, ext_back: j0.extA.back,
  }
  expect(off.uncovered, 'D-3/D-2 — 걸음을 끄면 계단이 실제로 돌아온다').toBeGreaterThan(C.THICK55_PRESENCE_PX)
  expect(on.uncovered, '중심 게이트 — 계단 픽셀 0').toBeLessThanOrEqual(C.JOIN56_STAIR_PX_MAX)
  expect(on2.uncovered, '다시 켬 — 0으로 복귀').toBeLessThanOrEqual(C.JOIN56_STAIR_PX_MAX)
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
  // 반증(D-3 ②) — 우선순위를 실제로 뒤집는다: 관통하는 쪽이 바뀐다
  await page.evaluate(() => (window as any).__b2.diag.joint56SetDefForTest('wall', { pri: 9 }))
  await settle(page)
  const j2 = await wallJoin(page, ids.wallA, ids.wallB)
  expect(j2.winner, '뒤집힌 우선순위 — 벽이 관통한다').toBe(ids.wallA)
  OUT.butt = {
    def: '다른 분류 L(벽3 ↔ 외벽4): tie=false · winner=외벽(관통 — 진 쪽 바깥 평면까지, 이동량은 세계 단위 extA/extB) · 반증 = pri 뒤집기(wall.pri 9)로 winner가 실제로 바뀐다. T 접합·코어 반증(D-3 ③)의 판정자는 단위 팔 ④다',
    winner_before: j.winner === ids.wallB ? 'extw' : 'wall',
    winner_after_flip: j2.winner === ids.wallA ? 'wall' : 'extw',
    ext_win: j.winner === j.a ? j.extA : j.extB, ext_lose: j.winner === j.a ? j.extB : j.extA,
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
  const uvOf = () => page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss.filter((x: any) => x.paint).pop()
    return last ? JSON.stringify(last.paint.uv) : null
  })
  const uv0 = await uvOf()
  const n0 = await blueN()
  expect(uv0, '칠 획이 uv로 섰다').not.toBeNull()
  expect(n0, '칠이 화면에 실재한다').toBeGreaterThan(10)
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(true))
  await settle(page); await settle(page)
  const uvOff = await uvOf(), nOff = await blueN()
  await page.evaluate(() => (window as any).__b2.diag.joint56OffForTest(false))
  await settle(page); await settle(page)
  const uvOn = await uvOf(), nOn = await blueN()
  OUT.paint_alive = {
    def: '칠 생존 게이트: 접합 켬/끔/켬에 칠의 uv(저장 — 중심면의 자)가 바이트로 불변, 자국 픽셀이 세 상태 전부 실재. 접합은 렌더 정점만 옮기고 칠의 자리는 안 만진다(state의 그 주석이 코드 자리)',
    uv_unchanged: uv0 === uvOff && uv0 === uvOn, px_on: n0, px_off: nOff, px_on2: nOn,
  }
  expect(uv0 === uvOff && uv0 === uvOn, 'uv 불변 — 접합이 칠의 자리를 안 옮긴다').toBe(true)
  expect(nOff, '끔에서도 자국이 있다').toBeGreaterThan(10)
  expect(nOn, '켬에서도 자국이 있다').toBeGreaterThan(10)
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
    def: '접합 장면(벽 둘 t=200 + 바닥 t=150)의 syncStrokes ms · 접합 켬/끔 프레임(median/p90 — #46: dpr1은 vsync 상한이라 판별은 dpr2)·faceMeshes 수 대조(접합은 메시 수 불변 — 정점 이동뿐) · 접합 수·기각 수·1링 통계. 지시 대역(벽 30·접합 40)의 recompute 몫(computeJoints ms)은 단위 원장 join56_unit_web2.json이 든다(30벽 장면을 손으로 그리는 비용 대신 같은 계산을 그 규모로 — 프레임 몫은 이 대조가 «메시 수 불변»으로 값을 댄다). 절대 ms는 기계 몫(#47) — 문턱 없음(#82)',
    sync_ms: ms, joins: (j.joins as unknown[]).length, rejects: (j.rejects as unknown[]).length,
    stats: j.stats,
    frame_join_on: onF.frame, frame_join_off: offF.frame,
    face_meshes_on: onF.meshes, face_meshes_off: offF.meshes,
  }
  expect((j.joins as unknown[]).length, '접합이 실재한다').toBeGreaterThan(0)
  expect(onF.meshes, '접합이 메시 수를 안 늘린다(정점 이동뿐)').toBe(offF.meshes)
})
