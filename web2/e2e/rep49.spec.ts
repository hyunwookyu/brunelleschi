// web2-49 — **화면 몫**. 생성 기하·축척·시드·저장은 단위 팔(test/rep49*.test.ts)이 재고
// 여기서는 픽셀과 렌더 결정만 잰다(#92 — 재는 자리가 결과의 자리다):
//   ① 무늬가 실제로 화면에 선다 — rep 켬/끔의 픽셀 차(같은 장면 · #82의 «차»)
//   ② 48-5 무회귀 — 무늬도 면의 한쪽: 평면 건너편 포즈에서 화면 전체 0
//   ③ 면 고정 + 원근 — 수직 줄눈의 화면 간격이 소실점 쪽으로 갈수록 좁아진다(픽셀 판)
//      · 화면 고정(도면 해칭)이면 등간격이라 이 단조가 없다 — 그것이 판별력이다
//   ④ 밀도 하한이 실배관에서 산다 — 줌 아웃하면 접히고(diag의 계열 보임 + 픽셀 0)
//      줌 인하면 돌아온다
//   ⑤ 스무 면 — 벽 분할로 면 ~20에 전부 무늬를 얹고 프레임 시간을 잰다(#82 — 차로)
//
// 원장: stage0/out/rep49_e2e_web2_<dpr>.json (LEDGER=1 — #90 · dpr별 — 픽셀은 dpr의 함수)
// ⚠ #93 — 분할선은 벽 모서리에서 시작한다(끝점 스냅이 필요해서다). drawLine은 누른 즉시
//   움직이므로 450ms 누름 진입을 안 밟는다 — dpr3급 느린 기기에서 다시 보는 조건으로 남긴다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-49 — 화면 몫: 무늬 픽셀(켬/끔 차) · 면의 쪽 · 원근 단조(픽셀) · 밀도 하한(실배관) · 스무 면 프레임',
  note_92: '판정자는 픽셀 차·화면 간격·프레임 ms다. 「rep을 붙였다」는 이름표라 안 센다',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 큰 상자 — probe 시굴 그대로(오른쪽 벽이 400×370px — 무늬가 기본 줌에서 산다).
 *  기둥 2.5 m → px/mm ≈ 0.148 → 벽돌 켜 9.9px ≥ 문 4px. */
async function bigBox(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 60, 620, 1140, 620)
  await drawLine(page, 500, 700, 900, 610)
  await drawLine(page, 500, 700, 150, 620)
  await drawLine(page, 900, 610, 640, 560)
  await drawLine(page, 150, 620, 640, 560)
  await drawLine(page, 500, 700, 500, 330)      // 기둥(획 차례 5 — 0부터)
  await drawLine(page, 900, 610, 900, 330)
  await drawLine(page, 900, 330, 500, 330)
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  const mm = await page.evaluate(() => (window as any).__b2.app.lift.mmPerUnit)
  expect(mm, '축척이 섰다').not.toBeNull()
  // 오른쪽 벽면
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(80)
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '벽면이 섰다').toBeGreaterThanOrEqual(1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

/** #gl 상자의 «잉크 픽셀» 수(알파 > 8) — rep은 #gl(three)에 그려진다 */
const glInk = (page: Page, x: number, y: number, w: number, h: number) =>
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
    let ink = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 8) ink++
    return ink
  }, [x, y, w, h] as unknown[])

/** 상자 안 «세로 줄눈» 열 찾기 — 열별 잉크 행 «비»가 문턱을 넘는 x들(물리 px).
 *  ⚠ 문턱은 행 수가 아니라 **높이 비**다 — 초판이 행 수 30(css 기준)으로 적어 dpr2에서
 *  켜선(가로줄)의 AA 두께만으로 전 열이 걸렸다(#21·D-C3 그대로). 줄눈 열은 켜 띠의
 *  절반을 세로로 채우므로(막힌줄눈 — 한 열은 격 켜에만 줄눈이 선다) 비 ~0.5,
 *  켜선만 있는 열은 비 ~0.2 — 0.35가 그 사이다. */
const inkColumns = (page: Page, x: number, y: number, w: number, h: number, minFrac: number) =>
  page.evaluate(([x0, y0, ww, hh, mf]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const colRows: number[] = []
    for (let c = 0; c < t.width; c++) {
      let rows = 0
      for (let r = 0; r < t.height; r++) if (d[(r * t.width + c) * 4 + 3]! > 8) rows++
      colRows.push(rows)
    }
    // 연속 열 뭉치를 하나의 줄눈으로 — 중심 x를 낸다
    const centers: number[] = []
    let run: number[] = []
    const min = (mf as number) * t.height
    for (let c = 0; c < colRows.length; c++) {
      if (colRows[c]! >= min) run.push(c)
      else if (run.length > 0) { centers.push(run.reduce((a, b) => a + b, 0) / run.length); run = [] }
    }
    if (run.length > 0) centers.push(run.reduce((a, b) => a + b, 0) / run.length)
    return centers
  }, [x, y, w, h, minFrac] as unknown[])

const cycleRepTo = async (page: Page, faceId: number, m: string | null) => {
  // cycleFaceRep(앱과 같은 함수)를 원하는 재료까지 돌린다 — null이면 «없음»까지
  for (let i = 0; i < 8; i++) {
    const cur = await page.evaluate((id) => {
      const w = window as any
      const f = w.__b2.app.doc.faces.find((x: any) => x.id === id)
      return f?.rep?.m ?? null
    }, faceId)
    if (cur === m) return
    await page.evaluate((id) => (window as any).__b2.diag.cycleRep49(id), faceId)
    await page.waitForTimeout(60)
  }
  throw new Error('cycleRepTo: 재료에 도달하지 못했다')
}

const WALL_BOX = { x: 520, y: 360, w: 360, h: 230 }   // 오른쪽 벽 안쪽(모서리 획을 피한 상자)

test('①② 무늬가 선다(켬/끔 차) — 그리고 무늬도 면의 한쪽에만(48-5 무회귀)', async ({ page }) => {
  await bigBox(page)
  const faceId = await page.evaluate(() => (window as any).__b2.app.doc.faces[0].id)
  const before = await glInk(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  await cycleRepTo(page, faceId, 'brick')
  await page.waitForTimeout(250)
  const after = await glInk(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  expect(after - before, '무늬가 실제 픽셀로 얹혔다').toBeGreaterThan(200)
  const diagRows = await page.evaluate(() => (window as any).__b2.diag.rep49())
  // ② 평면 건너편 — 눈을 벽 평면 반대쪽으로 옮기면 무늬 픽셀이 0이 된다(paint48 ②의 그 길).
  // ⚠ 되돌림은 «한 번 더 뒤집기»가 아니다 — 2.2배 반사를 두 번 하면 0.44×sd 지점이라
  // 제자리가 아니다(초판이 그래서 0을 봤다). **원 포즈를 통째로 저장해 복원한다.**
  const flipped = await page.evaluate((id) => {
    const w = window as any
    const app = w.__b2.app
    const rf = app.faces.find((f: any) => f.id === id)
    const n = rf.normal, L = Math.hypot(n.x, n.y, n.z)
    const u = { x: n.x / L, y: n.y / L, z: n.z / L }
    const d = u.x * rf.outer[0].x + u.y * rf.outer[0].y + u.z * rf.outer[0].z
    const p = app.pose.p
    const sd = u.x * p.x + u.y * p.y + u.z * p.z - d
    w.__rep49PoseSave = JSON.parse(JSON.stringify(app.pose))
    app.pose = { ...app.pose, p: { x: p.x - 2.2 * sd * u.x, y: p.y - 2.2 * sd * u.y, z: p.z - 2.2 * sd * u.z } }
    w.__b2.diag.invalidate?.()
    return { sd: +sd.toFixed(6) }
  }, faceId)
  await page.waitForTimeout(300)
  const farVis = await page.evaluate(() =>
    (window as any).__b2.diag.rep49().children.map((c: any) => c.visible))
  expect(farVis.every((v: boolean) => v === false), '건너편에서 렌더가 무늬를 접었다').toBe(true)
  const wholeFar = await glInk(page, 0, 0, 1200, 800)
  OUT.on_off_side = {
    def: '벽 상자 #gl 잉크 — rep 끔/켬의 차 · 평면 건너편 포즈에서 화면 전체 잉크(획 몫 포함이라 0이 아니다 — 판정은 렌더 결정 farVis)',
    before, after, delta: after - before, diag_children: diagRows.children, flipped,
    far_children_visible: farVis, far_whole_ink_incl_strokes: wholeFar,
    note: '화면 전체 잉크에는 승격 획(Line2)이 들어 있어 0이 될 수 없다 — 쪽의 판정자는 children.visible 전 거짓 + 아래 되돌림의 픽셀 복원',
  }
  // 되돌림 — 저장한 원 포즈를 복원하면 픽셀이 돌아온다(관측을 렌더 결정에만 안 맡긴다)
  await page.evaluate(() => {
    const w = window as any
    w.__b2.app.pose = w.__rep49PoseSave
    w.__b2.diag.invalidate?.()
  })
  await page.waitForTimeout(300)
  const back = await glInk(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  expect(back, '제 쪽으로 돌아오면 무늬가 돌아온다').toBeGreaterThan(before)
  ;(OUT.on_off_side as Record<string, unknown>).back = back
})

test('③ 면 고정 + 원근 — 수직 줄눈의 화면 간격이 깊은 쪽으로 갈수록 좁아진다', async ({ page }) => {
  await bigBox(page)
  const faceId = await page.evaluate(() => (window as any).__b2.app.doc.faces[0].id)
  // 줄눈만 남기지 않도록 벽돌 그대로 — 다만 «세로 열» 검출은 켬/끔 차 이미지가 아니라
  // 켬 화면에서 한다(획 모서리를 피한 상자라 세로 잉크 열의 대부분이 줄눈이다)
  const base = await inkColumns(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h, 0.35)
  await cycleRepTo(page, faceId, 'brick')
  await page.waitForTimeout(250)
  const withRep = await inkColumns(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h, 0.35)
  // rep이 더한 열만 — 기존 열(획)과 3px 이내로 겹치는 것은 버린다
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  const fresh = withRep.filter(c => !base.some(b => Math.abs(b - c) < 3 * dpr))
  expect(fresh.length, '줄눈 열이 여럿 잡힌다').toBeGreaterThanOrEqual(4)
  const gaps: number[] = []
  for (let i = 1; i < fresh.length; i++) gaps.push(fresh[i]! - fresh[i - 1]!)
  // 이 벽은 오른쪽(x+)으로 갈수록 깊다(소실점 쪽) — 간격이 전체적으로 줄어야 한다.
  // course 어긋남(반절 줄눈)이 열 검출에 섞이므로 엄밀 단조 대신 **끝 대 끝**과 회귀 부호로 본다.
  const first = gaps[0]!, last = gaps[gaps.length - 1]!
  const n = gaps.length
  const meanX = (n - 1) / 2
  const meanY = gaps.reduce((a, b) => a + b, 0) / n
  let cov = 0, varX = 0
  gaps.forEach((g, i) => { cov += (i - meanX) * (g - meanY); varX += (i - meanX) ** 2 })
  const slope = cov / Math.max(varX, 1e-9)
  expect(last, '깊은 쪽 간격이 얕은 쪽보다 좁다').toBeLessThan(first)
  expect(slope, '간격의 추세가 음이다(소실점 쪽으로 좁아진다)').toBeLessThan(0)
  OUT.foreshorten_px = {
    def: '벽돌 수직 줄눈의 화면 x 간격(물리 px) — 깊은 쪽(오른쪽 = 소실점 쪽)으로 줄어드는가. 화면 고정 무늬라면 등간격이라 이 단조가 없다(그것이 판별력이다 — D-3)',
    columns: fresh.map(c => +c.toFixed(1)), gaps: gaps.map(g => +g.toFixed(1)),
    first_gap: +first.toFixed(1), last_gap: +last.toFixed(1), slope: +slope.toFixed(3),
  }
})

test('④ 밀도 하한 — 줌 아웃에서 접히고 줌 인에서 돌아온다(실배관)', async ({ page }) => {
  await bigBox(page)
  const faceId = await page.evaluate(() => (window as any).__b2.app.doc.faces[0].id)
  await cycleRepTo(page, faceId, 'brick')
  await page.waitForTimeout(250)
  const nearInk = await glInk(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  const nearVis = await page.evaluate(() => (window as any).__b2.diag.rep49().children.map((c: any) => ({ f: c.f, visible: c.visible, stepMm: c.stepMm })))
  expect(nearVis.some((c: { visible: boolean }) => c.visible), '기본 줌에서 무늬가 산다').toBe(true)
  // 줌 아웃 — 핀 상태 휠은 종이 축소(D-L94). 켜 9.9px → 문 4px 아래로 가려면 ×0.4 아래.
  // 휠 부호는 가정하지 않는다 — 한 번 굴려 view.s가 커지면 방향을 뒤집는다(D-4).
  await page.mouse.move(600, 500)
  const vsOf = () => page.evaluate(() => (window as any).__b2.app.view.s as number)
  const vs0 = await vsOf()
  await page.mouse.wheel(0, 400); await page.waitForTimeout(80)
  let dir = 400
  if ((await vsOf()) > vs0) dir = -400
  // 상한 있는 대기(#95): 최대 14굴림 — 넘으면 그 시점 상태를 원장에 남기고 실패한다
  let vs = await vsOf()
  for (let i = 0; i < 14 && vs > vs0 * 0.35; i++) {
    await page.mouse.wheel(0, dir); await page.waitForTimeout(60)
    vs = await vsOf()
  }
  const farVis = await page.evaluate(() => (window as any).__b2.diag.rep49().children.map((c: any) => c.visible))
  expect(farVis.every((v: boolean) => v === false), `줌 아웃(view.s ${vs})에서 전 계열이 접혔다`).toBe(true)
  // 줌 인 — 돌아온다(같은 상한)
  for (let i = 0; i < 20 && (await vsOf()) < vs0 * 0.95; i++) {
    await page.mouse.wheel(0, -dir); await page.waitForTimeout(60)
  }
  await page.waitForTimeout(200)
  const backVis = await page.evaluate(() => (window as any).__b2.diag.rep49().children.map((c: any) => c.visible))
  expect(backVis.some((v: boolean) => v === true), '줌 인에서 돌아온다').toBe(true)
  const backInk = await glInk(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  OUT.lod_live = {
    def: '실배관(휠 줌)에서 계열 보임이 접히고 돌아오는가 + 픽셀. 문·계층 규칙의 단위판은 rep49_web2.json lod_gate',
    near: { ink: nearInk, children: nearVis }, zoomed_out_view_s: vs,
    far_children_visible: farVis, back_children_visible: backVis, back_ink: backInk,
  }
})

test('⑤ 스무 면 — 분할 벽 전부에 무늬 · 프레임 시간(#82 — 같은 장면 켬/끔의 차)', async ({ page }) => {
  test.setTimeout(180_000)
  await bigBox(page)
  // 왼쪽 벽도 세운다(기둥 공유) — 150,620 위로 + 윗변
  await drawLine(page, 150, 620, 150, 380)
  await drawLine(page, 150, 380, 500, 330)
  await page.click('#btn-face')
  await page.mouse.click(330, 480); await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  // 오른쪽 벽 9분할 + 왼쪽 벽 8분할 — 분할선은 모서리에서 모서리로(#93 주석)
  for (let k = 1; k <= 9; k++) {
    const t = k / 10
    await drawLine(page, 500 + 400 * t, 330, 500 + 400 * t, 700 - 90 * t)
  }
  for (let k = 1; k <= 8; k++) {
    const t = k / 9
    await drawLine(page, 150 + 350 * t, 380 - 50 * t, 150 + 350 * t, 620 + 80 * t)
  }
  // 셀 면 잡기 — 실제로 선 것을 센다(조용한 상한 ⛔ — 수를 원장에 남긴다)
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
  // 프레임 시간 «전» — 같은 장면, 무늬 없음
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
  // 전 면에 무늬 — 재료를 돌려 가며(벽돌·석재·타일 섞임 — 시드·재료 다양성까지 같이 얹는다)
  const ids: number[] = await page.evaluate(() => (window as any).__b2.app.doc.faces.map((f: any) => f.id))
  const mats = ['brick', 'stone', 'tile', 'wood', 'roof', 'conc']
  for (let i = 0; i < ids.length; i++) {
    await cycleRepTo(page, ids[i]!, mats[i % mats.length]!)
  }
  await page.waitForTimeout(300)
  const repN = await page.evaluate(() => (window as any).__b2.diag.rep49().children.length)
  const after = await frame()
  const segTotal = await page.evaluate(() => (window as any).__b2.diag.rep49().children.reduce((a: number, c: any) => a + c.segs, 0))
  OUT.frame20 = {
    def: '분할 벽 장면 — 면 수·무늬 계열 수·선분 합과 프레임 dt(중앙·p90, ms). 판정은 «차»다(#82 — 고정 몫이 큰 환경에서 비는 1로 간다)',
    faces: faceN, rep_children: repN, segments: segTotal,
    before_ms: before, after_ms: after,
    delta_median_ms: +(after.median - before.median).toFixed(2),
    note: '목표 «스무 면»에 못 미치면 faces 값이 그 사실이다 — 상한을 조용히 줄이지 않는다(#89의 정신)',
  }
  expect(faceN, '면이 열다섯은 넘게 섰다(분할 픽스처가 실제로 섰는가)').toBeGreaterThanOrEqual(15)
  expect(repN, '무늬 계열이 실제로 얹혔다').toBeGreaterThan(faceN)
  // 프레임 예산 — 60fps 한 프레임(16.7ms)의 절반을 무늬가 다 먹으면 안 된다(중앙값 차)
  expect(after.median - before.median, '무늬의 프레임 비용(중앙값 차)').toBeLessThan(8)
})

test('원장 쓰기', async ({ page }, testInfo) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  OUT.constants_used = await page.evaluate(() => (window as any).__b2.diag.rep49().constants)
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, `rep49_e2e_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
  expect(testInfo.project.name).toContain('dpr')
})
