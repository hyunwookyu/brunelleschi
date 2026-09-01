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
  // ② 평면 건너편 — 눈을 벽 평면 반대쪽으로 옮기고 **요 180°로 돌아본다**.
  // ⚠⚠ 초판은 자리만 반사했다 — 카메라가 벽을 등지고 서서 화면 전체 잉크가 0이 됐고,
  // 그러면 «쪽 때문에 접혔다»와 «아무것도 안 그려졌다»를 못 가른다(리뷰어 [1]).
  // 돌아보면 장면이 화면에 있고(획 잉크 > 0) 무늬만 없는 것이 쪽의 판정이 된다.
  // ⚠ 되돌림은 «한 번 더 뒤집기»가 아니다 — **원 포즈를 통째로 저장해 복원한다.**
  const flipped = await page.evaluate((id) => {
    const w = window as any
    const app = w.__b2.app
    const rf = app.faces.find((f: any) => f.id === id)
    const n = rf.normal, L = Math.hypot(n.x, n.y, n.z)
    const u = { x: n.x / L, y: n.y / L, z: n.z / L }
    const d = u.x * rf.outer[0].x + u.y * rf.outer[0].y + u.z * rf.outer[0].z
    const p = app.pose.p
    // sd = 카메라의 평면 부호 거리(세계 단위 · 뒤집기 전) — 진단값이다. dpr와 무관하고
    // 0이면 이 팔 자체가 서지 않는다(카메라가 평면 위 — 반사가 자리를 안 바꾼다).
    const sd = u.x * p.x + u.y * p.y + u.z * p.z - d
    w.__rep49PoseSave = JSON.parse(JSON.stringify(app.pose))
    // ⚠ 확정 카메라의 q는 **항등**이고(시선은 해석(f·주점)에 구워져 있다 — 프로브 실측)
    // 사영의 화면 매핑은 주점·소실점 기하가 정하므로 «forward = -z_cam» 같은 규약 추정이
    // 안 선다(look-at 두 규약이 모두 화면 밖을 냈다 — 이 팔의 수리 이력). 그래서 방향은
    // 짐작하지 않고 **요 24방위를 전부 사영해**(diag.projectWith #54) 면 중심이 화면
    // 중심에 가장 가까운 것을 고른다 — 어느 쿼터니언 규약이든 요 표본 집합 안에 있다.
    const p2 = { x: p.x - 2.2 * sd * u.x, y: p.y - 2.2 * sd * u.y, z: p.z - 2.2 * sd * u.z }
    let cx = 0, cy = 0, cz = 0
    for (const P of rf.outer) { cx += P.x; cy += P.y; cz += P.z }
    const cen = { x: cx / rf.outer.length, y: cy / rf.outer.length, z: cz / rf.outer.length }
    const W0 = app.doc.frame.W, H0 = app.doc.frame.H
    let picked: { x: number; y: number; z: number; w: number } | null = null
    let best = Infinity
    let bestPr: { x: number; y: number } | null = null
    for (let k = 0; k < 24; k++) {
      const a = (k * 15 * Math.PI) / 180
      const qq = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }
      const pr0 = w.__b2.diag.projectWith({ ...app.pose, p: p2, q: qq }, cen)
      if (!pr0) continue
      const dd = Math.hypot(pr0.x - W0 / 2, pr0.y - H0 / 2)
      if (dd < best) { best = dd; picked = qq; bestPr = pr0 }
    }
    const onScreen = !!bestPr && bestPr.x > 0 && bestPr.x < W0 && bestPr.y > 0 && bestPr.y < H0
    if (picked) app.pose = { ...app.pose, p: p2, q: picked }
    w.__b2.diag.invalidate?.()
    return { sd: +sd.toFixed(6), lookat_center_px: bestPr ? { x: +bestPr.x.toFixed(1), y: +bestPr.y.toFixed(1) } : null, onScreen }
  }, faceId)
  expect(flipped.onScreen, '돌아본 포즈에서 면 중심이 화면 안에 든다(사영 확인)').toBe(true)
  await page.waitForTimeout(300)
  // 귀속(2차 [4]) — «왜 안 보이는가»를 gateRep의 판정 내역으로 읽는다: 쪽(side) 때문이어야
  // 하고 밀도(lod) 때문이면 이 팔은 쪽을 재지 않은 것이다. 부호 대조도 값으로: 건너편
  // 포즈의 평면 부호 거리(sd2)는 원 포즈(sd)와 부호가 반대여야 한다(반사 2.2배 → −1.2·sd).
  const farRows = await page.evaluate(() => {
    const w = window as any
    const d = w.__b2.diag.rep49()
    const app = w.__b2.app
    const rf = app.faces[0]
    const n = rf.normal, L = Math.hypot(n.x, n.y, n.z)
    const u2 = { x: n.x / L, y: n.y / L, z: n.z / L }
    const dd = u2.x * rf.outer[0].x + u2.y * rf.outer[0].y + u2.z * rf.outer[0].z
    const sd2 = u2.x * app.pose.p.x + u2.y * app.pose.p.y + u2.z * app.pose.p.z - dd
    return { children: d.children, sd2: +sd2.toFixed(6), rep_s: d.faces.find((f: any) => f.rep)?.rep?.s ?? null }
  })
  const farVis = farRows.children.map((c: any) => c.visible)
  expect(farVis.every((v: boolean) => v === false), '건너편에서 렌더가 무늬를 접었다').toBe(true)
  expect(farRows.children.every((c: any) => c.gate?.side === false), '접힌 이유가 «쪽»이다(밀도가 아니라 — gate.side false)').toBe(true)
  expect(Math.sign(farRows.sd2), '건너편 포즈의 평면 부호 거리가 원 포즈와 반대다').toBe(-Math.sign(Number(flipped.sd)))
  const wholeFar = await glInk(page, 0, 0, 1200, 800)
  expect(wholeFar, '장면 자체는 화면에 있다(획 잉크 > 0) — «안 그려져서 0»과 가른다').toBeGreaterThan(0)
  OUT.on_off_side = {
    def: '벽 상자 #gl 잉크 — rep 끔/켬의 차 · 평면 건너편에서 돌아본 포즈: 장면은 보이고(획 잉크 > 0) 무늬 계열만 접힌다(children.visible 전 거짓). sd = 카메라의 평면 부호 거리(세계 단위 · 진단값 — 0이면 팔이 안 선다)',
    before, after, delta: after - before, diag_children: diagRows.children, flipped,
    far_children: farRows.children, far_sd2: farRows.sd2, rep_s: farRows.rep_s,
    far_whole_ink_strokes_visible: wholeFar,
    note_ruler: 'before/after는 벽 «상자»의 잉크이고 far_whole_ink는 «화면 전체»의 잉크다 — 같은 자(알파>8 물리 px 수), 다른 창(2차 [4]의 24배는 창 크기 차다). lookat_center_px는 문서 CSS px(project의 좌표 — dpr 무관)이고 frame(1200×800)이 그 자다',
    note_zero: '⚠ 문면 정정(web2-50): 49 시점의 이 자리는 «면이 하나라 sortFaces가 이르게 반환(정렬은 둘부터) — 미작동이 아니라 설계다»였는데, **50이 그 이르기 반환을 결함으로 수리했다**(면 하나여도 층(면0·무늬+1·칠+2)이 서야 한다 — 곱 합성이 무늬 아래에 깔리는 실측이 잡았다). 그러므로 order는 이제 0이 아니라 음수 대역의 배정값이다 — 49가 selfcheck 0 플래그를 «설계»로 닫은 판단은 뒤집혔다(그 기록은 NOTES 50 대응 절)',
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
  ;(OUT.on_off_side as Record<string, unknown>).note_back_identity =
    'back == after(정확 일치)는 설계 보장이다 — 같은 포즈의 결정론 렌더 복원(§5.1 자기참조 유형 3). 이 팔의 측정 몫은 «건너편에서 gate.side가 접고 부호가 반대»이고, 복원은 그 대조의 닫음일 뿐 임계를 안 건다'
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
  // 줌에서 실치수 유지(지시 ①의 «줌» 쪽 — 리뷰어 [5]): 종이를 z배 확대하면 무늬의 화면
  // 간격도 z배가 된다(mm가 종이에 붙어 있다는 뜻이다 — 화면에 붙어 있으면 간격이 불변).
  const vsOf = () => page.evaluate(() => (window as any).__b2.app.view.s as number)
  const vs0 = await vsOf()
  await page.mouse.move(600, 500)
  await page.mouse.wheel(0, -400); await page.waitForTimeout(80)
  let dirIn = -400
  if ((await vsOf()) < vs0) dirIn = 400
  for (let i = 0; i < 10 && (await vsOf()) < vs0 * 1.45; i++) { await page.mouse.wheel(0, dirIn); await page.waitForTimeout(60) }
  const vs1 = await vsOf()
  await page.waitForTimeout(200)
  const zoomedCols = await inkColumns(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h, 0.3)
  // 확대된 화면에서 이웃 간격의 «최대값»끼리 견준다(같은 줄눈 짝을 특정하기 어렵다 —
  // 최대 간격은 가장 얕은 쪽 짝의 것이라 자가 같다)
  const zGaps: number[] = []
  for (let i = 1; i < zoomedCols.length; i++) zGaps.push(zoomedCols[i]! - zoomedCols[i - 1]!)
  const zMax = Math.max(...zGaps), baseMax = Math.max(...gaps)
  const ratio = zMax / baseMax
  const vsRatio = vs1 / vs0
  const tol = await page.evaluate(() => (window as any).__b2.diag.rep49().constants.REP_ZOOM_RETENTION_TOL)
  expect(Math.abs(ratio / vsRatio - 1), `줌 ${vsRatio.toFixed(2)}배에서 무늬 간격도 그만큼 커진다(실치수가 종이에 붙어 있다)`).toBeLessThan(tol)
  OUT.foreshorten_px = {
    def: '벽돌 수직 줄눈의 화면 x 간격(물리 px) — 깊은 쪽(오른쪽 = 소실점 쪽)으로 줄어드는가. 화면 고정 무늬라면 등간격이라 이 단조가 없다(그것이 판별력이다 — D-3)',
    columns: fresh.map(c => +c.toFixed(1)), gaps: gaps.map(g => +g.toFixed(1)),
    first_gap: +first.toFixed(1), last_gap: +last.toFixed(1), slope: +slope.toFixed(3),
    zoom_mm_retention: {
      def: '지시 ①의 «줌» 쪽 — 종이 확대 z배에서 최대 줄눈 간격의 비 ÷ z (1이면 실치수가 종이에 붙음 · 화면 고정이면 1/z로 갈린다). 표본이 «최대 간격»(순서통계량)인 이유: 확대 전후에 같은 줄눈 짝을 특정하기 어렵고 최대는 가장 얕은 짝의 것이라 자가 같다 — 부픽셀 열 중심 양자화가 잔차 2~4%를 낸다(dpr별 열 뭉침이 달라 dpr2가 더 벌 수 있다 — 2차 [11])',
      gate: { registered: 'C.REP_ZOOM_RETENTION_TOL', value: tol },
      view_s_ratio: +vsRatio.toFixed(3), gap_ratio: +ratio.toFixed(3),
      normalized: +(ratio / vsRatio).toFixed(3),
      screen_fixed_would_give: +(1 / vsRatio).toFixed(3),
      falsify: '화면 고정이면 gap_ratio가 1이라 normalized = 1/z(screen_fixed_would_give — 문 밖)가 된다 — 판별 대상이 문을 실제로 넘는 값(분석 경계)',
    },
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
  const before2 = await frame()          // 잡음 바닥(2차 [3]) — 같은 상태 두 번의 차가 잡음이다
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
  const budget = await page.evaluate(() => (window as any).__b2.diag.rep49().constants.REP_FRAME_BUDGET_MS)
  const noise = +Math.abs(before2.median - before.median).toFixed(2)
  OUT.frame20 = {
    def: '분할 벽 장면 — 면 수·무늬 계열 수·선분 합과 프레임 dt(중앙·p90, ms). 판정은 «차»다(#82). ⚠ 이 장면의 차는 잡음 바닥(noise_floor — 같은 상태 두 번의 중앙값 차) 대역 안이라 **이 측정은 문(REP_FRAME_BUDGET_MS)을 시험하지 않는다** — 말할 수 있는 것은 «무늬의 프레임 비용이 이 장면에서 잡음보다 작다»까지다(2차 [2][3]). 음의 차는 그 잡음의 얼굴이다',
    faces: faceN, rep_children: repN, segments: segTotal,
    before_ms: before, before2_ms: before2, noise_floor_ms: noise, after_ms: after,
    delta_median_ms: +(after.median - before2.median).toFixed(2),
    delta_p90_ms: +(after.p90 - before2.p90).toFixed(2),
    gate: {
      registered: 'C.REP_FRAME_BUDGET_MS', value: budget,
      reachability: '재는 양(중앙값 차)이 0에 못 박혀 있지 않다 — 계산 병목 실행(dpr2)에서 실제로 양수가 나온다. 부하 축(무늬 면적 ÷ 축척)을 늘리면 커지는 증거는 rep49_web2.json gen_cost(면적 25배 → ms 자릿수 증가)',
      reachability_value: 'frame20.delta_median_ms (dpr2 실행)',
      reachability_source: 'rep49_e2e_web2_dpr2.json/frame20/delta_median_ms · rep49_web2.json/gen_cost',
    },
    note_28: 'p90 차를 같이 적는다(#28 — 부호가 갈리면 둘 다). 중앙값이 vsync 바닥(16.7ms)에 붙은 실행(dpr1)에서는 차의 해상도가 눈금뿐이라 뜻이 있는 판은 계산 병목 실행(dpr2)이다',
    note_load: '⚠ 부하의 축은 «면 수»가 아니라 **무늬가 덮는 면적 ÷ 축척**이다(리뷰어 [3]) — 분할 셀들은 같은 두 벽을 나눈 것이라 선분 합(segments)이 벽 두 장 몫이다. 면적 축의 생성 비용은 rep49_web2.json gen_cost(면적 25배 → 선분 24배·ms 값)가 들고, 화면의 «보이는» 선분 밀도는 밀도 하한이 구성적으로 묶는다. 무늬 면적이 큰 실장면의 프레임은 실기기 관측 판정자다',
    note_89: '목표 «스무 면»에 못 미치면 faces 값이 그 사실이다 — 상한을 조용히 줄이지 않는다',
  }
  expect(faceN, '면이 열다섯은 넘게 섰다(분할 픽스처가 실제로 섰는가)').toBeGreaterThanOrEqual(15)
  expect(repN, '무늬 계열이 실제로 얹혔다').toBeGreaterThan(faceN)
  // 프레임 예산(C.REP_FRAME_BUDGET_MS) — 이 장면에서는 차가 잡음 대역 안이라 문의 «시험»이
  // 아니라 «위반 없음의 확인»이다(위 def — 문을 실제로 시험하는 부하는 실기기 실장면 몫)
  expect(after.median - before2.median, '무늬의 프레임 비용(중앙값 차)').toBeLessThan(budget)
})

test('⑥ 실 UI 경로 — 꾹 잡기 → 손통 「표현」 클릭이 실제로 눌리고 실제로 붙인다 (#97·#96)', async ({ page }) => {
  // #97의 병은 «보이는데 안 눌린다»라 문면 확인으로는 안 잡힌다(리뷰어 PITFALLS 대조) —
  // 실제 클릭 경로로 한 번 지나간다. 툴팁은 «쓸 수 있는 상태에서 문구가 있는가»를 값으로(#96).
  await bigBox(page)
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(700, 480)
  await page.mouse.down()
  await page.waitForTimeout(ms + 300)
  await page.mouse.up()
  await page.waitForTimeout(100)
  const grip = await page.evaluate(() => {
    const g = (window as any).__b2.app.grip
    return g ? { ids: g.ids.length, faceId: g.faceId } : null
  })
  expect(grip?.faceId, '꾹 누름이 면을 잡았다').not.toBeNull()
  await page.click('#btn-grip')
  await page.waitForTimeout(150)
  const repBtn = await page.evaluate(() => {
    const b = document.getElementById('btn-grip-rep') as HTMLButtonElement | null
    if (!b) return null
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return {
      title: b.title, disabled: b.classList.contains('disabled'),
      clickable: b === top || b.contains(top),          // #97 — 그 점의 맨 위가 이 단추인가
    }
  })
  expect(repBtn, '「표현」 줄이 있다').not.toBeNull()
  expect(repBtn!.disabled, '면을 잡았으니 쓸 수 있다').toBe(false)
  expect(repBtn!.title.length, '쓸 수 있는 상태에서 툴팁 문구가 있다(#96 — 뒤집힌 거동 0)').toBeGreaterThan(0)
  expect(repBtn!.clickable, '그 점의 맨 위가 이 단추다(#97 — 가로챔 없음)').toBe(true)
  // 반증(D-3·#94) — 가로챔을 **실제로 일으켜** 이 탐침이 거짓을 낼 수 있음을 확인한다:
  // 투명 덮개를 씌우면 elementFromPoint가 덮개를 내고, 걷으면 되돌아온다.
  const falsified = await page.evaluate(() => {
    const b = document.getElementById('btn-grip-rep')!
    const r = b.getBoundingClientRect()
    const cover = document.createElement('div')
    cover.style.cssText = 'position:fixed;inset:0;z-index:99999'
    document.body.append(cover)
    const covered = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    const whileCovered = b === covered || b.contains(covered)
    cover.remove()
    const again = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { whileCovered, restored: b === again || b.contains(again) }
  })
  expect(falsified.whileCovered, '덮개 아래에서 탐침이 실제로 거짓이 된다(반증)').toBe(false)
  expect(falsified.restored, '덮개를 걷으면 되돌아온다').toBe(true)
  await page.click('#btn-grip-rep')
  await page.waitForTimeout(200)
  const rep = await page.evaluate(() => {
    const f = (window as any).__b2.app.doc.faces.find((x: any) => x.rep !== undefined)
    return f ? { ...f.rep } : null
  })
  expect(rep?.m, '클릭이 실제로 붙였다(벽돌)').toBe('brick')
  expect(rep?.s === 1 || rep?.s === -1, '쪽이 실렸다').toBe(true)
  OUT.ui_path = {
    def: '실 UI 경로 — 꾹 잡기(writeHoldMs) → #btn-grip 열기 → #btn-grip-rep 클릭. #97(elementFromPoint 가로챔)·#96(쓸 수 있는 상태의 툴팁 문구) 값',
    grip, rep_button: repBtn, rep_set: rep,
    tooltip_counts: { no_text: repBtn!.title.length > 0 ? 0 : 1, inverted: 0, out_of_selector: 0, of_new_handles: 1 },
    falsify_overlay: falsified,
    note_zero: 'tooltip_counts의 0들은 «새 손잡이 1개 중 결함 0»(분자/분모 — of_new_handles가 분모)이다 — selfcheck 카운터 0 의심의 정체',
  }
})

test('원장 쓰기', async ({ page }, testInfo) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  OUT.constants_used = await page.evaluate(() => (window as any).__b2.diag.rep49().constants)
  OUT.no_constants_snapshot = '**web2 라인 전체의 유보다** — 이 라인은 constantsSnapshot()을 안 쓰고 constants_used 블록을 스스로 든다(정본: lens31·close31 원장의 같은 필드)'
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, `rep49_e2e_web2_dpr${dpr}.json`), JSON.stringify(OUT, null, 2))
  expect(testInfo.project.name).toContain('dpr')
})
