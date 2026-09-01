// web2-45 — 칠하기·채움·깊이 정렬의 **화면 몫**. 기하·분할·경계는 단위 팔
// (`test/paint45.test.ts` · `test/faces45_measure.test.ts`)이 잰다. 여기서 재는 것:
//   ① 붓 도구 — 면 위에 그으면 실제 픽셀이 생긴다(#brushc — 흑연 질감 경로)
//   ② 시점을 돌려도 칠이 따라온다(3D 재투영 — 픽셀이 남는다)
//   ③ 채움 — 손통 「채움」이 해칭을 실제로 만들고, 표시 팝업 토글이 판을 바꾼다(⚑의 두 판)
//   ④ 깊이 정렬 «후» — 참 앞 면의 renderOrder가 더 높다(기준선 33/33 뒤집힘의 수리)
//   ⑤ 면 정면 뷰에서 칠 — 그 면에만 얹힌다(45-3 「그 면만 칠해진다」의 실측 절반)
//
// 원장: stage0/out/paint45_e2e_web2.json (LEDGER=1 — #90)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-45 — 화면 몫: 붓 픽셀 · 시점 추종 · 채움 두 판 · 깊이 정렬 후 · 정면 칠',
  note_92: '#92 — 칠·채움의 판정자는 픽셀·선분 수(결과의 자리)다. ink_after_orbit 같은 픽셀 계수는 분포가 아니라 «잉크가 있다»의 수다',
  note_47: '#47 — 깊이의 정본은 faces45_web2.json scene_depth다(전 = 차례 의존: 나쁜 차례 33/33 · 좋은 차례 0/33 · 후 = 0/33)',
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 방(바닥+벽) — 단위 픽스처와 같은 좌표 */
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
  await page.mouse.click(468, 478); await page.waitForTimeout(60)   // 바닥
  await page.mouse.click(550, 430); await page.waitForTimeout(60)   // 벽
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 둘이 섰다').toBe(2)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')  // 도구 연필·통 접기
}

const p45 = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paint45())

/** #gl의 사각 안 «어두운 잉크»(알파>16 · 밝기<200) — ⚠ web2-50: 칠이 #brushc에서
 *  면 텍스처(#gl)로 옮겨 갔다. 칠한 면은 불투명 종이색 채움(48-9)이 함께 서므로
 *  «알파>0»은 상자 전체가 걸린다 — 어두운 것(흑연 칠·획)만 세야 칠의 잉크다. */
const glDark = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a < 0.06) continue
      const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) * a + 255 * (1 - a)
      if (lum < 200) n++
    }
    return n
  }, [x, y, w, h])

/** #brushc의 사각 안 «잉크 픽셀 수»(알파>0) — waitink37의 판독 규약 그대로.
 *  ⚠ 이제 «선(흑연 질감)»의 자다 — 칠은 여기 없다(web2-50 · 위 glDark가 그 자리). */
const inkCount = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x, y, w, h])

test('①② 붓 — 면 위 픽셀이 생기고, 시점을 돌려도 따라온다', async ({ page }) => {
  await room(page)
  // ⚠ web2-50 — 칠의 자가 #brushc → #gl(면 텍스처)로 바뀌었다(구조 교체 — 거동은 같다)
  const before = await glDark(page, 505, 390, 90, 100)
  await page.click('#btn-paint')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('paint')
  // 벽 안에 칠 세 획
  for (const dy of [0, 14, 28]) await drawLine(page, 515, 410 + dy, 585, 430 + dy)
  await page.waitForTimeout(200)
  const g = await p45(page)
  expect((g.paints as unknown[]).length, '칠 획이 섰다').toBeGreaterThanOrEqual(3)
  expect((g.geoIds as number[]).length).toBe((g.paints as unknown[]).length)
  const after = await glDark(page, 505, 390, 90, 100)
  expect(after, '칠이 실제 픽셀이다').toBeGreaterThan(before + 200)
  OUT.brush = { ink_before: before, ink_after: after, paints: (g.paints as unknown[]).length }
  // ② 궤도를 조금 돌린다 — 칠이 3D를 따라 다시 사영된다(사라지지 않는다)
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(640, 415, { steps: 6 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(200)
  const g2 = await p45(page)
  expect((g2.geoIds as number[]).length, '궤도 뒤에도 3D가 선다').toBe((g.geoIds as number[]).length)
  const moved = await glDark(page, 460, 360, 200, 170)          // 넉넉한 상자
  expect(moved, '돌린 시점에도 칠이 보인다').toBeGreaterThan(150)
  OUT.orbit = { ink_after_orbit: moved }
})

test('③ 채움 — 손통 「채움」이 해칭을 만들고 · 표시 토글이 판을 바꾼다(⚑)', async ({ page }) => {
  await room(page)
  // 벽면을 잡는다(꾹) — 44의 잡기
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(550, 432)
  await page.mouse.down()
  await page.waitForTimeout(ms + 300)
  await page.mouse.up()
  await page.waitForTimeout(60)
  const grip = await page.evaluate(() => (window as any).__b2.diag.grip44())
  expect(grip.faceId, '면이 잡혔다').not.toBeNull()
  await page.click('#btn-grip')
  expect(await page.locator('#btn-grip-fill.disabled').count()).toBe(0)
  await page.click('#btn-grip-fill')
  await page.waitForTimeout(150)
  const a = await p45(page)
  expect(a.hatchMode).toBe('screen')
  const segsScreen = (a.hatch as { segs: number }[]).reduce((s, h) => s + h.segs, 0)
  expect(segsScreen, '해칭 선분이 실제로 만들어졌다').toBeGreaterThan(4)
  // 판을 바꾼다 — 표시 팝업의 토글(⚑의 두 판)
  // ⚠ web2-50: **면 고정 판은 이제 면 텍스처에 산다**(지시 「면 고정 판만 텍스처로」) —
  // LineSegments 수가 아니라 텍스처 등록 + 픽셀이 판정자다. 화면 고정 판은 종전 그대로.
  await page.click('#btn-display')
  await page.click('#chk-hatchface')
  await page.waitForTimeout(200)
  const b = await p45(page)
  expect(b.hatchMode).toBe('face')
  const texes = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  expect(texes.length, '면 고정 해칭의 텍스처가 섰다').toBeGreaterThanOrEqual(1)
  const faceInk = await glDark(page, 505, 390, 90, 100)
  expect(faceInk, '면 고정 해칭이 실제 픽셀이다').toBeGreaterThan(4)
  OUT.fill = { segs_screen: segsScreen, face_mode_textures: texes.length, face_mode_ink: faceInk, toggled: true }
  await page.click('#chk-hatchface')   // 되돌린다(기기 설정 — 다음 팔에 안 새게)
  await page.click('#btn-display')
  // ── 채운 면 «위에» 선이 정상으로 선다(지시 45-4 · 45 리뷰어 [8]㉠) ────────────
  // 선의 잉크는 #brushc(해칭이 사는 #gl보다 DOM에서 위)에 실린다 — 겹 순서는 캔버스
  // 더미의 구성이고, 여기서 재는 것은 «채움이 선 픽셀·승격을 안 건드린다»다.
  // ⚠ 잡기 세션(글씨 상태)을 먼저 놓는다 — 안 놓으면 다음 획이 글씨로 읽힌다(39·44 규약.
  //   초판이 그대로 밟았다: lifted false — 그 획은 text가 돼 있었다).
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  const inkBefore = await inkCount(page, 505, 390, 90, 100)
  const segsBefore = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  await drawLine(page, 520, 490, 520, 400)               // 채운 벽 위를 지나는 세로선
  const lineState = await page.evaluate(() => {
    const app = (window as any).__b2.app
    const last = app.doc.strokes[app.doc.strokes.length - 1]
    return { lifted: app.lift.lifted.has(last.id), fillStill: app.doc.faces.some((f: any) => f.fill === 1) }
  })
  const inkAfter = await inkCount(page, 505, 390, 90, 100)
  const segsAfter = await page.evaluate(() =>
    (window as any).__b2.diag.paint45().hatch.reduce((s: number, h: { segs: number }) => s + h.segs, 0))
  expect(lineState.lifted, '선이 정상으로 3D에 선다').toBe(true)
  expect(lineState.fillStill, '채움은 안 바뀐다').toBe(true)
  expect(segsAfter, '채움 선분 수가 안 바뀐다(2차 [R5] — «아무 일도 없어야 한다»의 본 판정)').toBe(segsBefore)
  expect(inkAfter, '선의 잉크가 실제로 얹혔다').toBeGreaterThan(inkBefore + 30)
  OUT.line_over_fill = {
    ink_before: inkBefore, ink_after: inkAfter, lifted: lineState.lifted,
    hatch_segs_before: segsBefore, hatch_segs_after: segsAfter,
    note_5: '#5(2차 [R6]) — «선이 톤 위»의 겹 차례는 renderOrder 음수 대역·캔버스 더미의 구성상 귀결이다. 이 팔이 재는 것은 승격·잉크·채움 불변 셋이다',
  }
})

test('④ 깊이 정렬 «후» — 참 앞 면의 renderOrder가 언제나 더 높다(기준선 33/33의 수리)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 380, 545, 526, 504)     // 참 앞 벽의 밑선(지면 국면)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 380, 545, 380, 340)
  await drawLine(page, 526, 504, 526, 357)
  await drawLine(page, 526, 357, 380, 340)
  await page.click('#btn-face')
  await page.mouse.click(430, 420); await page.waitForTimeout(60)   // 참 앞
  await page.mouse.click(560, 430); await page.waitForTimeout(60)   // 참 뒤(겹침)
  await page.waitForTimeout(150)
  const g = await p45(page)
  const faces = await page.evaluate(() => (window as any).__b2.app.faces.map((f: any) => {
    let z = 0
    for (const p of f.outer) z += p.z
    return { id: f.id, meanZ: z / f.outer.length }
  }))
  expect(faces.length).toBe(2)
  // 참 앞 = 눈(z≈0 뒤쪽 −z 시선)에서 가까운 것 = z가 큰(덜 음수) 면
  const front = (faces as { id: number; meanZ: number }[]).reduce((x, y) => (y.meanZ > x.meanZ ? y : x)).id
  const order = Object.fromEntries((g.faceOrder as { f: number; order: number }[]).map(o => [o.f, o.order]))
  const back = (faces as { id: number }[]).find(f => f.id !== front)!.id
  expect(order[front]!, '앞 면이 위에 그려진다(나중 = 높은 order)').toBeGreaterThan(order[back]!)
  OUT.depth_after = {
    front_order: order[front], back_order: order[back],
    note: '이 팔은 «렌더 인스턴스의 배선»(faceOrder가 실제 mesh renderOrder다)만 잰다 — 분모 있는 «후» 값(0/33 · 같은 장면·같은 하네스)은 faces45_web2.json scene_depth.after가 정본이다(45 리뷰어 [3] 대응)',
    note_pixel: '#92 ② — renderOrder(이름표)가 픽셀(자리)을 바꾸는 것은 **색이 갈릴 때**다: 지금은 면·해칭이 전부 같은 색(0x8d8880 회색 반투명)이라 순서가 픽셀에 안 실린다(같은 색 반투명 over 합성은 교환법칙이 성립한다 — 대수적 사실). 픽셀 판별 팔은 46(색·재료)이 첫 이색 겹을 만드는 순간 세운다 — DEFERRED 행',
  }
})

test('⑤ 면 정면 뷰에서 칠 — 그 면에만 얹힌다', async ({ page }) => {
  await room(page)
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(550, 432)
  await page.mouse.down(); await page.waitForTimeout(ms + 300); await page.mouse.up()
  await page.waitForTimeout(60)
  const grip = await page.evaluate(() => (window as any).__b2.diag.grip44())
  const wallId = grip.faceId as number
  expect(wallId).not.toBeNull()
  await page.click('#btn-grip')
  await page.click('#btn-grip-front')
  await page.waitForFunction(() => (window as any).__b2.diag.view42().parallel === true, null, { timeout: 3000 })
  await page.waitForTimeout(400)
  await page.click('#btn-paint')
  await drawLine(page, 520, 380, 660, 420)      // 정면 화면 가운데를 크게 가로지른다
  const g = await p45(page)
  const fs = new Set((g.paints as { f: number }[]).map(x => x.f))
  expect(fs.size, '한 면에만 얹혔다').toBe(1)
  expect(fs.has(wallId), '그 면이다').toBe(true)
  // 인접 면(바닥)이 실제로 모서리로 선다 — 화면 나비(법선 방향 두께) 실측
  // (44 DEFERRED가 «45의 칠하기가 실측으로 다시 잰다»로 넘긴 그 값 · 45 리뷰어 [8]㉡).
  const adj = await page.evaluate((wid) => {
    const b2 = (window as any).__b2
    const floor = b2.app.faces.find((f: any) => f.id !== wid)
    return floor ? b2.diag.faceScreenBox45(floor.id) : null
  }, wallId)
  expect(adj, '인접 면이 있다').not.toBeNull()
  // 정면 평행 뷰에서 바닥은 «선»으로 선다 — 짧은 변이 1px 아래
  const thin = Math.min(adj!.w, adj!.h)
  expect(thin, '인접 면의 화면 두께(px)').toBeLessThan(1)
  OUT.front_paint = {
    face: wallId, runs: (g.paints as unknown[]).length,
    adjacent_face_thin_px: thin, adjacent_face_box: adj,
  }
})

test.afterAll(async ({ }, testInfo) => {
  // dpr별 파일(45 리뷰어 [12] — 픽셀 수는 dpr의 함수다 · place34의 그 규약)
  const outDir = resolve(HERE, '../../stage0/out')
  mkdirSync(outDir, { recursive: true })
  OUT.dpr_project = testInfo.project.name
  writeFileSync(resolve(outDir, `paint45_e2e_web2_${testInfo.project.name}.json`), JSON.stringify(OUT, null, 2))
})
