// web2-67 §0·§2 — 결함 여섯과 낡은 그림의 게이트.
//
//   ① 0-1 상한   2048로 올렸다 · 사람을 멈추던 «한 붓마다 토스트»가 죽고 패널 구석 표식이
//               걸린 동안만 켜진다 · 메모리(캔버스·바탕 합)와 예산을 값으로
//   ② 0-2 잠금   컬러피커 — 누른 영역을 떼기 전까지 잠근다: 코너→링 드래그에서 h 불변 ·
//               링→사각 드래그에서 s,v 불변 · 반증: 잠금 끔 → 옛 거동(h가 튄다)
//   ③ 0-3 연속   SV 판이 점군(2px 칸 900색)이 아니라 연속(그라디언트)이다 — 서로 다른 색 수 ·
//               반증: 옛 점군 판으로 다시 굽으면 그 수가 칸 수 대역으로 떨어진다 · 크기 값
//   ④ 0-4 자리   휠이 패널 «안 세로»로 열린다 — 열려도 가리는 폭이 패널 폭 그대로 · 툴팁 없음
//   ⑤ 0-5 되돌리기 — 칠 획에 «픽셀로» 먹는다(undo → 화면이 돌아온다 · redo → 다시) ·
//               칠 패널이 열린 채로 단추가 닿는다(elementFromPoint)
//   ⑥ 0-6 지우개 — 지운 자리 알파(잉크) 감소 · 다른 면 무변 · 순서가 실린다 · undo/redo ·
//               누적 == 전량(지우개 섞기 · 도구 전수) · 저장 er · 뒷꼭지 = 지우개
//   ⑦ §2 낡은 그림 — 재현(반증 스위치): 단계 안 줌 뒤 재료 무늬가 낡은 채 «남는다»(상관없는
//               편집도 못 고친다 — 65가 바꾼 지속) · 수리: texelPerPx 반옥타브 계단이 열쇠에
//               들어 스스로 다시 굽는다(매 프레임 아님 — 재굽기 수가 값) · 픽셀 == 전량 재굽기
//
// 원장: stage0/out/paint67_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-67 §0(상한 표식·컬러피커 잠금·연속·세로 휠·되돌리기·지우개) · §2(낡은 그림 — texel 계단)',
  note_pitfalls: '#111(지우개 = 굽기의 새 입력 — head·sig 등재를 ⑥-④가 픽셀로 잰다) · #110(§2 — 열쇠는 그 파생이 의존하는 것: texelPerPx의 «계단») · #108(0-2·0-3의 단언 판과 반증 판이 같은 값이면 자를 의심 — 반증이 실제로 다른 값을 낸다) · #107(⑤⑥의 되돌림 측정 — 캡처는 되돌리기 «전» 상태와 대조) · #103(장면 확인 — 잉크) · #102 · #99 · #101 · #42',
  pitfall_citations: [42, 99, 101, 102, 103, 107, 108, 110, 111],
  selfcheck_notes: {
    zero_counters: '⑦ 재현 판의 rebake 0은 «낡음이 남는다»의 통과값이고(카운터 죽음 아님 — 같은 자로 수리 판이 ≥1을 낸다), ①의 toast 0도 그 짝(표식 on/off 전이)이 양수 전이를 낸다',
    identical_pairs: '⑥-④·⑤의 해시 «같음»은 픽셀 항등 게이트의 뜻 그 자체다(65 ①의 규약) — 반증(order/append break 계열)이 다른 값을 내는 것을 같은 원장이 든다',
  },
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint67_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { /* 첫 쓰기 */ }
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { project: info.project.name, workers: 1, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/paint67.spec.ts (#99)' },
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
/** paint50·65의 그 상자 — 오른쪽 벽 + (이 팔은 바닥도 면으로 세운다: ⑥ 「다른 면 무변」의 대조군) */
async function bigBox(page: Page, withFloor = false) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560],
    [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await drawLine(page, l[0], l[1], l[2], l[3])
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id as number)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 2500), postId)
  await page.click('#btn-face')
  await page.mouse.click(700, 480); await page.waitForTimeout(100)
  // ⚠ 바닥 지점은 벽 폴리곤 «밖»이어야 한다 — (560,625)는 벽 사각(500..900 × 330..700) 안이라
  //   그 클릭이 벽 면을 «토글로 걷었다»(실측 faces 0 — D-2가 잡았다). x<500의 바닥 안쪽으로.
  if (withFloor) { await page.mouse.click(350, 630); await page.waitForTimeout(100) }
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  expect(n, '면이 섰다(#103)').toBeGreaterThanOrEqual(withFloor ? 2 : 1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}
async function pickPaint(page: Page, i = 'pencil', w = 18, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    const b2 = (window as any).__b2
    b2.diag.setPaintInstrForTest(i); Object.assign(b2.app.paintSel, { hex: h, w })
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}
async function paintStroke(page: Page, x0: number, y0: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 21, y0 + 5, { steps: 3 })
  await page.mouse.move(x0 + 42, y0 + 10, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(70)
}
const wallSpot = (i: number): [number, number] => [530 + (i % 6) * 58, 355 + Math.floor(i / 6) * 25]

type TexHash = { key: string; level: number; hash: number; ink: number; w: number; h: number }
const texHash = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintTexHash() as TexHash[])
type Bake = { bakes: number; bakedStrokes: number; appends: number; appendStrokes: number; handoverStrokes: number; uploads: number; uploadBytes: number; evicts: number; entries: number; bytes: number; budget: number }
const bakeStat = (page: Page) => page.evaluate(() => (window as any).__b2.diag.paintBake() as Bake)
const bakeReset = (page: Page) => page.evaluate(() => { (window as any).__b2.diag.paintBakeReset() })
const rebakeAndWait = async (page: Page) => {
  await page.evaluate(() => { (window as any).__b2.diag.rebakePaintTex() })
  await page.waitForTimeout(300)
}
const screenHash = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('gl') as HTMLCanvasElement
  const t = document.createElement('canvas')
  t.width = c.width; t.height = c.height
  t.getContext('2d')!.drawImage(c, 0, 0)
  const d = t.getContext('2d')!.getImageData(0, 0, t.width, t.height).data
  let h = 0, ink = 0
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]! + d[i + 1]! + d[i + 2]!
    if (d[i + 3]! > 0 && v < 690) ink++
    h = (Math.imul(h, 31) + v + d[i + 3]!) | 0
  }
  return { hash: h, ink }
})
/** 화면 사각 하나의 해시(#gl · css px) — 지운 자리/안 지운 자리의 국소 자 */
const regionHash = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr)); t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let hsh = 0, ink = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! + d[i + 1]! + d[i + 2]!
      if (d[i + 3]! > 0 && v < 690) ink++
      hsh = (Math.imul(hsh, 31) + v + d[i + 3]!) | 0
    }
    return { hash: hsh, ink }
  }, [x, y, w, h])
/** 합성 펜 — 뒷꼭지(buttons 32)까지 실을 수 있다(tiperase의 그 규약) */
async function pen(page: Page, pts: [number, number][], buttons = 1) {
  await page.evaluate(([list, btn]) => {
    const el = document.getElementById('ink') as any
    if (!el.__capPatched) { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.__capPatched = true }
    const mk = (type: string, x: number, y: number, b: number) => new PointerEvent(type, {
      pointerType: 'pen', pointerId: 7, isPrimary: true, buttons: b, pressure: b === 0 ? 0 : 0.55,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    })
    el.dispatchEvent(mk('pointerdown', list[0]![0], list[0]![1], btn))
    for (let i = 1; i < list.length; i++) el.dispatchEvent(mk('pointermove', list[i]![0], list[i]![1], btn))
    el.dispatchEvent(mk('pointerup', list[list.length - 1]![0], list[list.length - 1]![1], 0))
  }, [pts, buttons] as const)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
  await page.waitForTimeout(80)
}

test('① 0-1 상한 2048 — 토스트 0 · 표식은 걸린 동안만 · 메모리 값', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  await pickPaint(page)
  await paintStroke(page, 700, 470)                       // 텍스처가 선다
  const lv0 = (await texHash(page))[0]!.level
  // 벽으로 줌 인 — 상한(2048)에 걸릴 때까지(gate.clamped)
  await page.mouse.move(700, 470)
  let clamped = false, lvMax = lv0, zooms = 0
  for (; zooms < 40 && !clamped; zooms++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(80)
    const t = await page.evaluate(() => (window as any).__b2.diag.paintTex() as { level: number; clamped: boolean; visible: boolean }[])
    for (const e of t) { if (e.visible) { lvMax = Math.max(lvMax, e.level); clamped = clamped || e.clamped } }
  }
  expect(clamped, '상한에 실제로 걸렸다(#103 — 걸려야 표식을 잰다)').toBe(true)
  expect(lvMax, '상한이 2048로 올라갔다(1024가 아니다)').toBe(2048)
  const dotOn = await page.evaluate(() => !(document.getElementById('paint-clamp-dot') as HTMLElement).hidden)
  const dotTitle = await page.evaluate(() => (document.getElementById('paint-clamp-dot') as HTMLElement).title)
  // 걸린 채 획 20 — 토스트('상한' 문구)가 한 번도 안 뜬다(옛 판은 한 붓마다 떴다)
  const notices: string[] = []
  for (let k = 0; k < 20; k++) {
    const x = 300 + (k % 5) * 120, y = 250 + Math.floor(k / 5) * 90
    await paintStroke(page, x, y)
    notices.push((await page.evaluate(() => document.getElementById('notice')!.textContent)) ?? '')
  }
  const toastCount = notices.filter(t => t.includes('상한')).length
  const dotStill = await page.evaluate(() => !(document.getElementById('paint-clamp-dot') as HTMLElement).hidden)
  const mem = await bakeStat(page)
  // 줌 아웃 — 안 걸리면 표식이 꺼진다
  for (let k = 0; k < zooms + 4; k++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40) }
  await page.waitForTimeout(200)
  const tOut = await page.evaluate(() => (window as any).__b2.diag.paintTex() as { clamped: boolean; visible: boolean }[])
  const stillClamped = tOut.some(e => e.visible && e.clamped)
  const dotOff = await page.evaluate(() => (document.getElementById('paint-clamp-dot') as HTMLElement).hidden)
  OUT.g01_cap = {
    def: '상한 1024→2048(값 lvMax) · 걸린 채 획 20에 «상한» 토스트 0(옛 판: 한 붓 1회) · 표식 on(걸림)→off(안 걸림) 전이 · 메모리: entries·bytes·budget(256MB 재측정 — constants 주석이 유도)',
    level_max: lvMax, zooms, toast_count: toastCount, dot: { on_while_clamped: dotOn, still_on_after_20: dotStill, title: dotTitle, off_after_zoom_out: dotOff, clamped_after_zoom_out: stillClamped },
    memory: { entries: mem.entries, bytes: mem.bytes, budget: mem.budget, evicts: mem.evicts, bytes_mb: +(mem.bytes / 1048576).toFixed(1) },
  }
  expect(toastCount, '토스트 0회(«상한» 문구가 알림 줄에 한 번도 없다)').toBe(0)
  expect(dotOn, '표식 — 걸린 동안 켜진다').toBe(true)
  expect(dotStill, '획 20 뒤에도(아직 걸림) 켜져 있다').toBe(true)
  expect(dotTitle, '한 줄 설명이 호버에 있다').toContain('2048')
  if (!stillClamped) expect(dotOff, '표식 — 안 걸리면 꺼진다').toBe(true)
  expect(mem.bytes, '메모리 — 예산 안(또는 초과 시 축출이 돌았다)').toBeLessThanOrEqual(mem.budget + 64 * 1048576)
})

test('② 0-2 컬러피커 잠금 — 코너→링 드래그에서 h 불변 · 링→사각에서 s,v 불변 · 반증 = 잠금 끔', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint')
  await page.evaluate(() => { (window as any).__b2.diag.setPaintHexForTest('#4080c0') })   // h≈210° · s·v 중간
  await page.click('#paint-color-btn')
  await page.waitForTimeout(150)
  const geo = await page.evaluate(() => (window as any).__b2.diag.wheelGeom67())
  const box = (await page.locator('#paint-wheel-cv').boundingBox())!
  const hsvNow = () => page.evaluate(() => {
    const hex = (window as any).__b2.app.paintSel.hex as string
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
    let h = 0
    if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx, v: mx }
  }) as Promise<{ h: number; s: number; v: number }>
  const svTR = { x: box.x + geo.sv.x + geo.sv.w - 2, y: box.y + geo.sv.y + 2 }   // 사각 우상 코너(사람의 그 자리)
  const ringAt = (deg: number) => ({
    x: box.x + geo.cx + ((geo.rIn + geo.rOut) / 2) * Math.sin(deg * Math.PI / 180),
    y: box.y + geo.cy - ((geo.rIn + geo.rOut) / 2) * Math.cos(deg * Math.PI / 180),
  })
  const h0 = (await hsvNow()).h
  // 코너에서 눌러 링을 «가로질러» 끈다 — 잠금이면 h 불변(좌표는 사각 안으로 접힌다: 밖의 x는
  // 가장자리 s=1, 안의 y는 그 값 그대로). ⚠ 링 각은 95°(수평 대역) — v=0(검정)으로 끝나면
  // 정본(hex)에서 h가 정의를 잃어 이 자가 아무것도 못 잰다(D-3의 자기 확인 — 첫 판이 그랬다).
  await page.mouse.move(svTR.x, svTR.y); await page.mouse.down()
  const r180 = ringAt(95)
  await page.mouse.move((svTR.x + r180.x) / 2, (svTR.y + r180.y) / 2, { steps: 4 })
  await page.mouse.move(r180.x, r180.y, { steps: 4 })
  await page.mouse.up(); await page.waitForTimeout(80)
  const afterCorner = await hsvNow()
  const dH = Math.min(Math.abs(afterCorner.h - h0), 360 - Math.abs(afterCorner.h - h0))
  // 링에서 눌러 사각을 가로지른다 — s,v 불변(각도만 따라온다)
  const sv0 = await hsvNow()
  const rStart = ringAt(300)
  await page.mouse.move(rStart.x, rStart.y); await page.mouse.down()
  await page.mouse.move(box.x + geo.cx - 20, box.y + geo.cy + 10, { steps: 5 })   // 사각 안
  await page.mouse.up(); await page.waitForTimeout(80)
  const afterRing = await hsvNow()
  // 반증(D-3) — 잠금 끔: 같은 코너→링 드래그에서 h가 «튄다»(옛 거동)
  await page.evaluate(() => { (window as any).__b2.diag.setPaintHexForTest('#4080c0'); (window as any).__b2.diag.setWheelLockOffForTest(true) })
  await page.waitForTimeout(80)
  const hF0 = (await hsvNow()).h
  await page.mouse.move(svTR.x, svTR.y); await page.mouse.down()
  await page.mouse.move((svTR.x + r180.x) / 2, (svTR.y + r180.y) / 2, { steps: 4 })
  await page.mouse.move(r180.x, r180.y, { steps: 4 })
  await page.mouse.up(); await page.waitForTimeout(80)
  const hF1 = (await hsvNow()).h
  const dHOff = Math.min(Math.abs(hF1 - hF0), 360 - Math.abs(hF1 - hF0))
  await page.evaluate(() => { (window as any).__b2.diag.setWheelLockOffForTest(false) })
  OUT.g02_lock = {
    def: '누른 영역을 떼기 전까지 잠근다(0-2) — 코너→링: h 변화(도) · 링→사각: s,v 변화 · 반증(잠금 끔): 같은 드래그의 h 변화',
    corner_to_ring: { dh_deg: +dH.toFixed(2), s: +afterCorner.s.toFixed(3), v: +afterCorner.v.toFixed(3) },
    ring_to_sv: { ds: +Math.abs(afterRing.s - sv0.s).toFixed(4), dv: +Math.abs(afterRing.v - sv0.v).toFixed(4) },
    falsify_lock_off: { dh_deg: +dHOff.toFixed(2) },
  }
  expect(dH, '잠금 — 코너→링 드래그에서 색상(h) 불변(±3° — hex 왕복 양자화 여유)').toBeLessThan(3)
  expect(afterCorner.s, '밖으로 나간 x — 가장자리 값(s=1)으로 접혔다').toBeGreaterThan(0.97)
  expect(Math.abs(afterRing.s - sv0.s), '잠금 — 링→사각 드래그에서 채도 불변').toBeLessThan(0.02)
  expect(Math.abs(afterRing.v - sv0.v), '잠금 — 링→사각 드래그에서 명도 불변').toBeLessThan(0.02)
  expect(dHOff, '반증 — 잠금을 끄면 옛 거동(h가 링 각도로 튄다)').toBeGreaterThan(30)
})

test('③④ 0-3 연속 스펙트럼(반증 = 옛 점군 판) · 0-4 패널 안 세로(가리는 폭 불변 · 툴팁 없음)', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint')
  await page.waitForTimeout(100)
  const panelBefore = (await page.locator('#painttray').boundingBox())!
  await page.click('#paint-color-btn')
  await page.waitForTimeout(150)
  const panelAfter = (await page.locator('#painttray').boundingBox())!
  const wheelBox = (await page.locator('#paint-wheelbox').boundingBox())!
  const geo = await page.evaluate(() => (window as any).__b2.diag.wheelGeom67())
  /** SV 사각 안 서로 다른 색 수(캔버스 백킹 px) */
  const distinct = () => page.evaluate(() => {
    const cv = document.getElementById('paint-wheel-cv') as HTMLCanvasElement
    const geo = (window as any).__b2.diag.wheelGeom67()
    const dpr = cv.width / (geo.S as number)
    const x = Math.ceil((geo.sv.x + 1) * dpr), y = Math.ceil((geo.sv.y + 1) * dpr)
    const w = Math.floor((geo.sv.w - 2) * dpr), h = Math.floor((geo.sv.h - 2) * dpr)
    const d = cv.getContext('2d')!.getImageData(x, y, w, h).data
    const seen = new Set<number>()
    for (let i = 0; i < d.length; i += 4) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!)
    return { distinct: seen.size, pixels: w * h }
  })
  const cont = await distinct()
  // 반증(D-3) — 옛 «2px 점군» 판으로 다시 굽는다: 서로 다른 색 수가 칸 수 대역으로 떨어진다
  await page.evaluate(() => { (window as any).__b2.diag.setWheelStepForTest(2) })
  await page.waitForTimeout(80)
  const grid = await distinct()
  await page.evaluate(() => { (window as any).__b2.diag.setWheelStepForTest(0) })
  await page.waitForTimeout(80)
  // 0-4 — 툴팁 없음 · 휠이 패널 안(폭 불변 — 가리는 면적이 패널 폭을 안 넘는다) · 닿는다
  const tip = await page.evaluate(() => {
    const cv = document.getElementById('paint-wheel-cv')!
    return { title: cv.getAttribute('title'), role: cv.getAttribute('role') }
  })
  const hit = await page.evaluate(() => {
    const cv = document.getElementById('paint-wheel-cv')!
    const r = cv.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return el === cv
  })
  OUT.g03_continuous = {
    def: '0-3 — SV 판의 서로 다른 색 수(백킹 px 기준 · 사각 안) vs 옛 점군 판(step 2 · 반증). 크기 값: S(휠 전체)·ring(고리 두께)·sv(판 한 변) — «프로크리에이트급»의 실측 대치: 그 앱은 이 기기에서 계측 불능이라, 패널 폭(260)을 꽉 채우는 최대값을 실측으로 적는다(종전 136 → 244)',
    continuous: cont, grid_falsify: grid, ratio: +(cont.distinct / Math.max(1, grid.distinct)).toFixed(1),
    size: { S: geo.S, ring_px: geo.ringPx, sv_side_px: Math.round(geo.sv.w), prev_S: 136 },
  }
  OUT.g04_place = {
    def: '0-4 — 휠이 패널 «안»(rect 포함) · 패널 폭이 열기 전후 같다(가리는 폭 불변) · 툴팁 없음 · 캔버스가 실제로 닿는다',
    panel_w: { before: panelBefore.width, after: panelAfter.width },
    wheel_inside: wheelBox.x >= panelAfter.x - 1 && wheelBox.x + wheelBox.width <= panelAfter.x + panelAfter.width + 1,
    covered_w_px: panelAfter.width, tooltip: tip, element_hit: hit,
  }
  // 반증 판은 정수 정렬(main.ts — 소수점 AA가 칸 경계 중간색으로 색 수를 부풀리던 것을 걷었다:
  // 첫 판 실측 11,135 ≈ 연속판 — 자가 아무것도 안 쟀다 · #108의 형태). 상한 = 칸 수((변/2)² ≈ 3.9k).
  expect(grid.distinct, '반증 판 — 색 수가 칸 수 대역에 갇힌다(점군)').toBeLessThan(grid.pixels / 3)
  expect(cont.distinct, '연속 — 색 수가 점군 대역을 크게 넘는다(≥ 반증 판의 2.5배)').toBeGreaterThan(grid.distinct * 2.5)
  expect(cont.distinct, '연속 — 색 수가 픽셀 수의 3할 위(점군 900의 대역이 아니다)').toBeGreaterThan(cont.pixels * 0.3)
  expect(geo.S, '휠 전체 크기(값) — 136에서 커졌다').toBe(244)
  expect(panelAfter.width, '0-4 — 열려도 가리는 폭이 패널 폭 그대로').toBe(panelBefore.width)
  expect(OUT.g04_place && (OUT.g04_place as any).wheel_inside, '0-4 — 휠이 패널 안에 있다').toBe(true)
  expect(tip.title, '0-4 — 툴팁 없음(사람 판정)').toBeFalsy()
  expect(hit, '휠 캔버스가 닿는다').toBe(true)
})

test('⑤ 0-5 되돌리기·다시하기 — 칠에 픽셀로 먹는다 · 패널이 열린 채로 단추가 닿는다', async ({ page }) => {
  test.setTimeout(300_000)
  await bigBox(page)
  await pickPaint(page)
  const h0 = await screenHash(page)
  for (let k = 0; k < 3; k++) { const [x, y] = wallSpot(k); await paintStroke(page, x, y) }
  const h1 = await screenHash(page)
  // ⚠ 화면 «잉크 증가»를 자로 못 쓴다 — 첫 칠에 면이 불투명해져(48-5 «칠한 면 불투명» — 기존
  // 거동) 뒤의 작도선 잉크가 통째로 가려진다(실측: 134k → 6.4k). 자는 ① 화면 해시가 변했다
  // ② 굽힌 텍스처에 칠 잉크가 실렸다(#103 — 장면 확인) 둘이다.
  expect(h1.hash, '칠이 화면을 바꿨다(#103)').not.toBe(h0.hash)
  const texInk5 = (await texHash(page)).reduce((a, t) => a + t.ink, 0)
  expect(texInk5, '칠이 텍스처에 실렸다(#103)').toBeGreaterThan(0)
  // 패널이 열린 채로 단추가 «닿는가»(elementFromPoint — 지시 D-2 문면)
  const reach = await page.evaluate(() => {
    const out: Record<string, boolean> = {}
    for (const id of ['btn-undo', 'btn-redo']) {
      const el = document.getElementById(id)!
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      out[id] = el === hit || el.contains(hit)
    }
    return out
  })
  expect(reach['btn-undo'], '칠 패널이 열린 채로 되돌리기가 닿는다').toBe(true)
  expect(reach['btn-redo'], '다시하기도 닿는다').toBe(true)
  for (let k = 0; k < 3; k++) { await page.click('#btn-undo'); await page.waitForTimeout(150) }
  const h2 = await screenHash(page)
  const paints2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint).length)
  for (let k = 0; k < 3; k++) { await page.click('#btn-redo'); await page.waitForTimeout(150) }
  const h3 = await screenHash(page)
  await rebakeAndWait(page)
  const h4 = await screenHash(page)
  OUT.g05_undo = {
    def: '칠 셋 → undo×3 → 화면이 «픽셀로» 돌아온다(칠 전 해시와 동일) → redo×3 → 다시(칠 후 해시와 동일) · 그 상태가 전량 재굽기와도 동일(65 ① 무회귀) · 단추 닿음(elementFromPoint)',
    reach, ink: { before: h0.ink, painted: h1.ink, undone: h2.ink, redone: h3.ink },
    hash: { before: h0.hash, painted: h1.hash, undone: h2.hash, redone: h3.hash, redone_vs_rebake: h3.hash === h4.hash },
    paints_after_undo: paints2,
  }
  expect(paints2, 'undo — 칠 획이 문서에서 걷혔다').toBe(0)
  expect(h2.hash, 'undo — 화면이 칠 «전»과 픽셀로 같다').toBe(h0.hash)
  expect(h3.hash, 'redo — 화면이 칠 «후»와 픽셀로 같다').toBe(h1.hash)
  expect(h4.hash, 'redo 뒤 상태 == 전량 재굽기(65 ① 무회귀)').toBe(h3.hash)
})

test('⑥ 0-6 지우개 — 알파 감소·다른 면 무변 · 순서 · undo · 누적==전량(지우개 섞기) · 저장 er · 뒷꼭지', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page, true)                                   // 바닥 면 = «다른 면 무변»의 대조군
  await pickPaint(page, 'pencil', 20, '#33383f')
  // 바닥에도 표본 칠 하나(대조군) — ⚠ x<500에서만: 벽의 화면 폴리곤이 y~686까지 내려와
  // (480,640) 같은 자리의 꼬리가 벽에 붙는다(D-2 실측 — 첫 판의 대조군이 그래서 비었다)
  await page.mouse.move(300, 635); await page.mouse.down()
  await page.mouse.move(380, 630, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100)
  // 벽에 칠 셋
  for (let k = 0; k < 3; k++) { const [x, y] = wallSpot(k); await paintStroke(page, x, y) }
  const inkOf = async () => {
    const t = await texHash(page)
    return Object.fromEntries(t.map(e => [e.key, e.ink])) as Record<string, number>
  }
  const before = await inkOf()
  // 면의 정체는 획이 든 f가 정본이다(#54 — «잉크 최대 = 벽» 휴리스틱은 바닥 텍스처의 텍셀
  // 잉크(스치는 각 — 세계로 길다)가 더 커서 뒤집혔다: D-2가 잡았다). 첫 획 = 바닥 표본.
  const ids = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint)
    return { floor: `${ss[0].paint.f}:${ss[0].paint.s}`, wall: `${ss[1].paint.f}:${ss[1].paint.s}` }
  })
  const wallKey = ids.wall
  const floorKey = ids.floor
  expect(wallKey !== floorKey, '벽·바닥이 다른 (면,쪽)이다(#103)').toBe(true)
  expect(before[wallKey], '벽 텍스처가 섰다(#103)').toBeGreaterThan(0)
  expect(before[floorKey], '대조군(바닥 텍스처)이 실제로 섰다(#103 — 비면 「다른 면 무변」이 아무것도 안 잰다)').toBeGreaterThan(0)
  const r0 = await regionHash(page, 525, 350, 60, 22)        // spot0 대역
  const rCtl = await regionHash(page, 640, 350, 60, 22)      // spot2(안 지울 자리) — 대조
  // ── 지우개 켬(패널 고정 칸 — 실제 클릭) ─────────────────────────────────
  await page.click('#paint-erase')
  await page.waitForTimeout(80)
  const est = await page.evaluate(() => (window as any).__b2.diag.paintEraseForTest())
  expect(est.on, '지우개 칸이 켜졌다').toBe(true)
  expect(est.soft, '기본은 딱딱한(마른 매체)').toBe(false)
  // 34-0 몫(§1 게이트 ⑧ · CLOSING 상시 규칙 「손잡이를 더하면 그 라운드 안에서 표를 다시 돌린다」) —
  // 이 라운드가 더한 손잡이 둘의 툴팁(#96)·닿음(#97 elementFromPoint)
  const census = await page.evaluate(() => {
    const out: Record<string, { title: string | null; hit: boolean }> = {}
    for (const id of ['paint-erase', 'paint-erase-soft']) {
      const el = document.getElementById(id)!
      const r = el.getBoundingClientRect()
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      out[id] = { title: el.getAttribute('title'), hit: el === at || el.contains(at) }
    }
    return out
  })
  OUT.g06_census = { def: '34-0 몫 — 새 손잡이 둘(지우개 칸·경도)의 툴팁·elementFromPoint(#96·#97)', census }
  for (const [id, c] of Object.entries(census)) {
    expect(c.title && c.title.length > 4, `${id} — 툴팁(#96)`).toBe(true)
    expect(c.hit, `${id} — 닿는다(#97)`).toBe(true)
  }
  await page.evaluate(() => { (window as any).__b2.app.eraseSel.w = 26 })
  // ① 지운 자리의 덮임이 빠진다 — spot0 획을 가로질러 지운다
  await paintStroke(page, 528, 352)
  const afterErase = await inkOf()
  const r1 = await regionHash(page, 525, 350, 60, 22)
  const rCtl1 = await regionHash(page, 640, 350, 60, 22)
  const erasedStroke = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return { er: last?.paint?.er ?? null, br: last?.paint?.br ?? null, c: last?.paint?.c ?? null }
  })
  expect(erasedStroke.er, '지우개 획 — 표식 er=1').toBe(1)
  expect(erasedStroke.br, '지우개 획 — 딱딱한 지우개 브러시').toBe('ramon/Hard_Eraser')
  expect(erasedStroke.c, '지우개 획 — 색을 안 든다').toBe(null)
  expect(afterErase[wallKey]!, '① 지운 면의 잉크가 줄었다(값)').toBeLessThan(before[wallKey]!)
  expect(r1.ink, '① 지운 자리(화면)의 잉크 감소').toBeLessThan(r0.ink)
  expect(rCtl1.hash, '① 안 지운 자리는 픽셀 불변').toBe(rCtl.hash)
  if (floorKey) expect(afterErase[floorKey]!, '① 다른 면(바닥)은 무변').toBe(before[floorKey]!)
  // ③ 되돌리기가 지우개 획에 먹는다 — undo → 지운 것이 «돌아온다» · redo → 다시 지워진다
  await page.click('#btn-undo'); await page.waitForTimeout(200)
  const rUndo = await regionHash(page, 525, 350, 60, 22)
  await page.click('#btn-redo'); await page.waitForTimeout(200)
  const rRedo = await regionHash(page, 525, 350, 60, 22)
  expect(rUndo.hash, '③ undo — 지우기 «전» 픽셀로 돌아온다').toBe(r0.hash)
  expect(rRedo.hash, '③ redo — 다시 지워진다').toBe(r1.hash)
  // ② 순서가 실린다 — 같은 자리에서 칠→지우기→칠 vs 칠→칠→지우기.
  // ⚠ 시드 = 획 id(결정론 규약)라 «같은 순서 반증»은 id를 되감아야 잰다 — 안 되감으면
  //   두 판의 시드가 달라 순서와 무관하게 픽셀이 갈린다(첫 판이 그랬다 — 자의 결함).
  const seq = async (order: ('p' | 'e')[]) => {
    const id0 = await page.evaluate(() => (window as any).__b2.app.nextId as number)
    for (const k of order) {
      await page.evaluate((er) => { (window as any).__b2.app.paintErase = er; (window as any).__b2.diag.paintEraseForTest() }, k === 'e')
      await paintStroke(page, 700, 420)
    }
    const h = await regionHash(page, 695, 415, 70, 26)
    for (let i = 0; i < order.length; i++) { await page.click('#btn-undo'); await page.waitForTimeout(120) }
    await page.evaluate((n) => { (window as any).__b2.app.nextId = n; (window as any).__b2.app.redoStack = [] }, id0)
    return h
  }
  const hPEP = await seq(['p', 'e', 'p'])
  const hPPE = await seq(['p', 'p', 'e'])
  const hPPE2 = await seq(['p', 'p', 'e'])
  expect(hPEP.hash, '② 순서가 픽셀에 실린다(칠→지우기→칠 ≠ 칠→칠→지우기)').not.toBe(hPPE.hash)
  expect(hPPE2.hash, '② 반증 — 같은 순서는 같은 픽셀(다름의 원인이 순서임의 실증)').toBe(hPPE.hash)
  // ④ 누적 == 전량(지우개 섞기 · 도구 전수 — 65 ①의 자에 지우개를 끼운다)
  await page.evaluate(() => { (window as any).__b2.app.paintErase = false })
  const instrs = ['pencil', 'brush', 'marker', 'cp'] as const
  let spot = 6
  for (let k = 0; k < 4; k++) {
    await pickPaint(page, instrs[k], 16)
    const [x, y] = wallSpot(spot++); await paintStroke(page, x, y)
    await page.evaluate((soft) => { const a = (window as any).__b2.app; a.paintErase = true; a.eraseSel.soft = soft; a.eraseSel.w = 22 }, k % 2 === 1)
    const [ex, ey] = wallSpot(spot - 1); await paintStroke(page, ex + 4, ey + 2)
    await page.evaluate(() => { (window as any).__b2.app.paintErase = false })
  }
  const accTex = await texHash(page)
  const accScr = await screenHash(page)
  await rebakeAndWait(page)
  const refTex = await texHash(page)
  const refScr = await screenHash(page)
  expect(JSON.stringify(accTex), '④ 누적 == 전량(캔버스 · 지우개 섞기 · 도구 전수)').toBe(JSON.stringify(refTex))
  expect(accScr.hash, '④ 누적 == 전량(화면)').toBe(refScr.hash)
  // ⑤ 저장 — er가 실린다(KEY_ORDER — 43 게이트 ②의 빨강 실측은 단위 roundtrip43이 정본)
  const saved = await page.evaluate(() => (window as any).__b2.diag.serialize() as string)
  const erInFile = (saved.match(/"er":1/g) ?? []).length
  const erInDoc = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint?.er === 1).length)
  expect(erInFile, '⑤ 지우개 표식이 저장물에 있다(획 수와 일치)').toBe(erInDoc)
  // ⑥ 뒷꼭지(buttons 32) — 그 한 붓이 지우개다 · 다음 붓(버튼 없음)은 칠이다
  await page.evaluate(() => { (window as any).__b2.app.paintErase = false })
  await pickPaint(page, 'pencil', 18, '#5a3020')
  await pen(page, [[655, 380], [680, 386], [700, 390]], 32)
  const tail = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return { er: last?.paint?.er ?? null, tipErase: (window as any).__b2.app.tipErase }
  })
  await pen(page, [[655, 400], [680, 406], [700, 410]], 1)
  const normal = await page.evaluate(() => {
    const ss = (window as any).__b2.app.doc.strokes
    const last = ss[ss.length - 1]
    return { er: last?.paint?.er ?? null }
  })
  OUT.g06_eraser = {
    def: '지우개 여섯 게이트 — ① 알파 감소·국소·다른 면 무변 ② 순서(+같은 순서 반증) ③ undo/redo 픽셀 ④ 누적==전량(도구 전수 × 지우개(딱딱/부드러운) 섞기 — «측정» 게이트) ⑤ 저장 er 수 일치(빨강 실측은 roundtrip43 — «구성» 몫과 갈라 적는다) ⑥ 뒷꼭지 = 그 한 붓만 지우개',
    ink: { wall_before: before[wallKey], wall_after_erase: afterErase[wallKey], floor_before: floorKey ? before[floorKey] : null, floor_after: floorKey ? afterErase[floorKey] : null },
    region: { before: r0.ink, erased: r1.ink, control_same: rCtl1.hash === rCtl.hash, undo_back: rUndo.hash === r0.hash, redo_again: rRedo.hash === r1.hash },
    order: { pep: hPEP.hash, ppe: hPPE.hash, differs: hPEP.hash !== hPPE.hash, same_order_same: hPPE2.hash === hPPE.hash },
    identity_with_eraser: { tex_equal: JSON.stringify(accTex) === JSON.stringify(refTex), screen_equal: accScr.hash === refScr.hash, cases: '슬롯 넷 × (딱딱한·부드러운 지우개 번갈아)' },
    save: { er_in_file: erInFile, er_in_doc: erInDoc },
    tail_eraser: { er: tail.er, tip_erase_after: tail.tipErase, next_stroke_er: normal.er },
    stroke_sample: erasedStroke,
  }
  expect(tail.er, '⑥ 뒷꼭지 — 그 붓이 지우개 획이다').toBe(1)
  expect(tail.tipErase, '⑥ 뒷꼭지 — 뗌과 함께 풀린다').toBe(false)
  expect(normal.er, '⑥ 다음 붓(버튼 없음)은 칠이다').toBe(null)
})

test('⑦ §2 낡은 그림 — 재현(반증 스위치 = 옛 열쇠): 단계 안 줌 + 상관없는 편집에도 낡음이 남는다 · 수리: 계단이 다시 굽는다(매 프레임 아님)', async ({ page }) => {
  test.setTimeout(600_000)
  await bigBox(page)
  // 벽에 재료(무늬 있는 것 — cycleFaceRep의 첫 값)를 얹는다 — 텍스처가 선다
  const faceId = await page.evaluate(() => (window as any).__b2.app.faces[0].id as number)
  await page.evaluate((id) => { (window as any).__b2.diag.cycleRep49(id) }, faceId)
  await page.waitForTimeout(300)
  const rep = await page.evaluate(() => (window as any).__b2.diag.rep49().faces.filter((f: any) => f.rep))
  expect(rep.length, '재료가 붙었다(#103)').toBeGreaterThan(0)
  const ink0 = (await texHash(page))[0]!.ink
  expect(ink0, '무늬가 실제로 구워졌다(#103)').toBeGreaterThan(0)
  // ── 자리 잡기 — 단계가 «막 오른» 자리(대역의 바닥)로: 거기서 대역 안을 0.7옥타브쯤 걷는다
  //    (계단은 반옥타브마다라 그 폭이면 «반드시» 한 번은 넘는다 — D-5: 경계 위상에 안 기댄다).
  await page.mouse.move(700, 470)
  const lvStart = (await texHash(page))[0]!.level
  let lv0 = lvStart
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(80)
    const lvNow = (await texHash(page))[0]!.level
    if (lvNow !== lv0) { lv0 = lvNow; break }
  }
  // ── D-2 재현 — 옛 열쇠(반증 스위치 켬): 단계 «안» 줌 → 재굽기 0 → 무늬 선 굵기가 낡는다 ──
  await page.evaluate(() => { (window as any).__b2.diag.setRepTexelSigOffForTest(true) })
  await page.waitForTimeout(300)
  await bakeReset(page)
  const ZOOM_IN = 5                                           // ×1.105^5 ≈ 0.72옥타브(대역 1옥타브 안)
  for (let i = 0; i < ZOOM_IN; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80) }
  const lv1 = (await texHash(page))[0]!.level
  const stZoom = await bakeStat(page)
  // 상관없는 편집(하늘의 선) — 옛 열쇠의 «지속»: 이것도 못 고친다(65-post의 그 형태)
  await page.click('#btn-pencil'); await page.click('#btn-pencil'); await page.waitForTimeout(60)
  await drawLine(page, 150, 150, 380, 170)
  await page.waitForTimeout(250)
  const stEdit = await bakeStat(page)
  const staleTex = await texHash(page)
  await rebakeAndWait(page)                                   // 정본(지금 조건의 전량 굽기)
  const freshTex = await texHash(page)
  const staleDiffers = lv1 === lv0 && JSON.stringify(staleTex.map(t => t.hash)) !== JSON.stringify(freshTex.map(t => t.hash))
  // ── 수리 ①/② — 계단을 열쇠에 되넣는다: 그 자리에서 스스로 다시 굽고, 그림이 정본과 같다 ──
  // (계수기를 «먼저» 비운다 — 스위치의 invalidate가 프레임을 곧장 돌려 반대 순서면 그 굽기가
  //  reset에 지워진다: 실측 0 — 자의 경주였다)
  await bakeReset(page)
  await page.evaluate(() => { (window as any).__b2.diag.setRepTexelSigOffForTest(false) })
  await page.waitForTimeout(400)
  const stFix = await bakeStat(page)
  const fixedTex = await texHash(page)
  // 매 프레임 재굽기가 아니다 — 가만히 두면 더 안 굽는다(⚠ 계수기를 여기서 다시 비운다 —
  // 첫 판이 stFix의 1을 그대로 물려받아 «idle 1»로 읽었다: 자의 결함이지 폭주가 아니었다)
  await bakeReset(page)
  await page.waitForTimeout(400)
  await page.evaluate(() => { (window as any).__b2.diag.invalidate() })
  await page.waitForTimeout(300)
  const stIdle = await bakeStat(page)
  // ── 수리 ③ — 계단의 실측: 대역 «안»에서 되돌아 나가는 줌(0.72옥타브)이 계단을 1~2번 밟는다
  //    (반옥타브 계단 — 매 프레임도, 0도 아니다). 그 뒤 그림은 다시 정본과 같다.
  await bakeReset(page)
  for (let i = 0; i < ZOOM_IN; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(80) }
  const lv2 = (await texHash(page))[0]!.level
  const stStep = await bakeStat(page)
  const stepTex = await texHash(page)
  await rebakeAndWait(page)
  const stepRef = await texHash(page)
  // ⚠ 계단 판과 «지금 이 순간»의 전량 굽기는 최대 반의 반옥타브(±19% — 상수 주석의 그 대가)
  //   안에서 갈릴 수 있다 — 계단의 뜻 그 자체다. 그래서 «정본과 동일»은 수리 ①②(같은 tq에서
  //   구운 판)의 자이고, 여기는 «계단이 밟혔고 폭주가 아니다»가 자다. 두 해시는 값으로 남긴다.
  OUT.g07_rep_stale = {
    def: '§2 — D-2 재현: 옛 열쇠(스위치 켬)에서 단계 안 줌(0.72옥타브 · lv 불변) 뒤 재굽기 0 · 상관없는 편집도 0(지속 — 65-post) · 낡은 그림(정본 굽기와 해시 다름 — 무늬 선 굵기의 낡음). 수리: texel 반옥타브 계단(REP67_TEXEL_STEPS_PER_OCT=2)이 열쇠에 들어 ① 되켠 즉시 굽는다 ② 그림이 정본과 동일 · 가만히 두면 0(매 프레임 ⛔) ③ 대역 안 0.72옥타브 줌이 계단을 1~2번 밟고 그 뒤도 정본과 동일',
    level: { start: lvStart, band_bottom: lv0, after_zoom: lv1, after_zoom_out: lv2 },
    old_key: { bakes_after_zoom: stZoom.bakes, bakes_after_unrelated_edit: stEdit.bakes, stale_differs_from_fresh: staleDiffers, stale_hash: staleTex.map(t => t.hash), fresh_hash: freshTex.map(t => t.hash) },
    fixed: { bakes_on_reenable: stFix.bakes, hash_equals_fresh: JSON.stringify(fixedTex.map(t => t.hash)) === JSON.stringify(freshTex.map(t => t.hash)), idle_bakes: stIdle.bakes,
      step_zoom: { bakes: stStep.bakes, level_same: lv2 === lv1, hash_equals_rebake: JSON.stringify(stepTex.map(t => t.hash)) === JSON.stringify(stepRef.map(t => t.hash)) } },
  }
  expect(lv1, '줌이 단계 «안»이다(전제 — 아니면 이 팔은 아무것도 안 잰다)').toBe(lv0)
  expect(stZoom.bakes, '재현 — 옛 열쇠에서 단계 안 줌은 재굽기 0(낡음의 기제)').toBe(0)
  expect(stEdit.bakes, '재현 — 상관없는 편집도 못 고친다(65가 바꾼 «지속»)').toBe(0)
  expect(staleDiffers, '재현 — 낡은 그림이 정본 굽기와 실제로 다르다(값)').toBe(true)
  expect(stFix.bakes, '수리 ① — 계단이 열쇠에 들며 다시 굽는다').toBeGreaterThanOrEqual(1)
  expect(stFix.bakes, '수리 ① — 폭주가 아니다').toBeLessThanOrEqual(4)
  expect(JSON.stringify(fixedTex.map(t => t.hash)), '수리 ② — 그림이 정본(전량 굽기)과 같다(낡음 0)').toBe(JSON.stringify(freshTex.map(t => t.hash)))
  expect(stIdle.bakes, '수리 ② — 가만히 두면 더 안 굽는다(매 프레임 재굽기 ⛔)').toBe(0)
  expect(lv2, '수리 ③ — 이 줌도 단계 안이다').toBe(lv1)
  expect(stStep.bakes, '수리 ③ — 0.72옥타브가 계단(반옥타브)을 최소 한 번 밟는다').toBeGreaterThanOrEqual(1)
  expect(stStep.bakes, '수리 ③ — 그리고 폭주가 아니다(1~2 + 경계 여유)').toBeLessThanOrEqual(3)
})
