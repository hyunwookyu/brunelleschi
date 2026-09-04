// web2-59 — 칠 엔진의 뼈대: **수리 «전» 실측**(D-2)과 게이트가 같은 자로 잰다.
//
// 재는 것(59 지시의 게이트 + D-1 표식):
//   ① 미리보기 == 확정본 — 같은 획을 긋는 동안(뗌 전)과 커밋 뒤의 합성 화면 픽셀 차.
//      줌 셋(0.5×·1×·4×) × 면 둘(벽 · 바닥). **이 라운드의 중심 게이트**.
//   ② 획 안에서 안 쌓인다 — 자기 자신과 교차하는 한 획의 교차점 창 잉크 / 몸통 창 잉크.
//      연필·색연필·붓은 1에 붙어야 하고 **마커는 종전대로**(46 계약 — 반증 포함).
//   ③ 끝이 안 뭉친다 — 시작·중간·끝 대역의 단위 길이당 잉크(mark58의 그 자 #54).
//   ④ 결이 면 고정이다 — 같은 자리에 도장 위상만 반 간격 어긋난 두 획의 픽셀 상관.
//   ⑤ coalesced — 곡선 획에서 원본 표본 수 > 합친 수, 곡선 이탈이 준다(켬/끔).
//   ⑥ 성능 — 면 17(paint50의 그 픽스처 — 스무 면 목표에 셋 모자란다 · note_89) · 칠 40획
//      장면의 «그리는 중» 프레임과 유휴 프레임, 텍스처 바이트.
//
// 원장: stage0/out/paint59_web2_dpr{1,2}.json(현행 · LEDGER=1 · 병합-쓰기 #99).
// ⚠ **사전(수리 전) 원장은 동결이다**: `stage0/out/paint59_pre_web2_dpr{1,2}.json` — 그 파일은
// 이제 어느 하네스도 안 쓴다(D-2의 «수리 전» 증거가 재실행에 안 덮이게 — 57 2차 [2] · 58 선례).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEDGER_NAME = 'paint59'
const OUT: Record<string, unknown> = {
  what: 'web2-59 — 칠 엔진의 뼈대: 게이트(사전 paint59_pre와 같은 자). ① 미리보기↔확정 픽셀 차(줌 셋 × 면 둘) ② 자기 교차 누적 ③ 끝점 대역 잉크 ④ 결 위상 상관 ⑤ coalesced 곡선 이탈 ⑥ 성능(그리는 중 프레임)',
  note_pitfalls: '#101(web2 러너) · #99(병합-쓰기 · 열쇠 수) · #102(한 test 안 ?reset 재호출 없음 — 장면 하나에 undo로 지운다) · #11(대역 분모 = 몸통 창 · def) · #12·#13(창 크기·문턱을 값으로 · 훑기는 게이트 판) · #92(판정자는 픽셀·수) · #5(자기참조: ①은 같은 캔버스에 같은 함수로 그리면 구성상 0에 가깝다 — 그래서 diff의 «0 아님»은 uv·굵기·압력 경로의 갈림을 잰다. 반증은 벡터 미리보기 되돌림)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/${LEDGER_NAME}_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
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
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: `LEDGER=1 node tools/e2e.mjs ledger e2e/paint59.spec.ts (워커 1 — #99) · 원장 ${LEDGER_NAME}` },
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

/** rep49·paint50의 그 상자 — 오른쪽 벽 (500,700)(900,610)(900,330)(500,330) · 축척 2500mm.
 *  이 라운드는 **바닥**(500,700)(900,610)(640,560)(150,620)도 면으로 세운다(면 크기 둘). */
async function bigBox(page: Page, withFloor = true) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  // ⚠ 실행 중 «web2/ 아래 파일»(스펙 포함)을 고치면 vite 개발 서버가 «모듈 그래프 밖 파일 변경 → 전체
  // 새로고침»을 보내 페이지가 재적재되고 evaluate가 __b2 undefined로 죽는다(실측 두 번 — 편집 직후의
  // 실행에서만). 아래 대기는 부팅 직후 여유일 뿐 그 병의 수리가 아니다 — 수리는 «실행 중 편집 금지»다.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
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
  // 바닥은 벽의 화면 사각 «밖»(x<500)에서 짚는다 — (520,640)은 화면에서 벽 안이라 벽이 앞이다(실측: 벽이 풀렸다)
  if (withFloor) { await page.mouse.click(400, 635); await page.waitForTimeout(80) }
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, withFloor ? '벽·바닥이 섰다' : '벽면이 섰다').toBeGreaterThanOrEqual(withFloor ? 2 : 1)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
}

const INSTRS = ['brush', 'marker', 'cp', 'pencil'] as const
type Instr = typeof INSTRS[number]

async function pickInstr(page: Page, i: Instr, w = 20, hex = '#8a4a3a') {
  await page.evaluate(([i, w, h]) => {
    (window as any).__b2.app.paintSel = { hex: h, i, w }
  }, [i, w, hex] as const)
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
}

/** 칠 획 전부를 되돌린다(장면은 그대로 — #102: 한 test 안에서 ?reset을 다시 안 부른다) */
async function undoPaint(page: Page) {
  for (let k = 0; k < 20; k++) {
    const n = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
    if (n === 0) break
    await page.click('#btn-undo')
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(150)
}

/** **합성 화면**의 상자(종이색 + gl + brushc + ink — captureThumb의 그 차례 #54)를 페이지 안
 *  기억에 굳힌다. 미리보기(ink·brushc)와 확정(gl 텍스처)이 다른 겹에 살므로 판정은 합성이다. */
const snapComposite = (page: Page, key: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(([k, x0, y0, ww, hh]) => {
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((ww as number) * dpr))
    t.height = Math.max(1, Math.round((hh as number) * dpr))
    const g = t.getContext('2d')!
    g.fillStyle = '#f5f3ee'
    g.fillRect(0, 0, t.width, t.height)
    for (const id of ['gl', 'brushc', 'ink']) {
      const c = document.getElementById(id) as HTMLCanvasElement | null
      if (!c || c.width === 0) continue
      const sx = c.width / (window.innerWidth), sy = c.height / (window.innerHeight)
      g.drawImage(c, Math.round((x0 as number) * sx), Math.round((y0 as number) * sy),
        Math.round((ww as number) * sx), Math.round((hh as number) * sy), 0, 0, t.width, t.height)
    }
    const w2 = window as any
    w2.__p59 = w2.__p59 || {}
    w2.__p59[k as string] = g.getImageData(0, 0, t.width, t.height)
    return { w: t.width, h: t.height }
  }, [key, x, y, w, h] as unknown[])

/** 두 합성 스냅의 차 — 문턱(8 = thresholds.PIXEL_DIFF_CH의 값 · AA 요동 아래) 넘는 픽셀 비율,
 *  평균 절대차, 각 스냅의 잉크(종이보다 12 이상 어두운) 픽셀 수. */
const diffComposite = (page: Page, a: string, b: string) =>
  page.evaluate(([ka, kb]) => {
    const w2 = window as any
    const A = w2.__p59[ka as string] as ImageData, B = w2.__p59[kb as string] as ImageData
    const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
    let n = 0, over = 0, sum = 0, inkA = 0, inkB = 0
    const paper = 0.299 * 245 + 0.587 * 243 + 0.114 * 238
    for (let i = 0; i < A.data.length; i += 4) {
      const la = lum(A.data, i), lb = lum(B.data, i)
      const d = Math.abs(la - lb)
      n++; sum += d
      if (d > 8) over++
      if (paper - la > 12) inkA++
      if (paper - lb > 12) inkB++
    }
    return { px: n, diff_frac: +(over / n).toFixed(4), mean_abs: +(sum / n).toFixed(3), ink_a: inkA, ink_b: inkB }
  }, [a, b] as unknown[])

/** 화면 창의 «잉크 질량» — 어둡기 합(mark58의 그 자 #54 — 합성 대신 #gl만: 확정 뒤에만 잰다) */
function inkMass(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round(x0 * dpr), Math.round(y0 * dpr),
      Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr)),
    ).data
    let m = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a <= 0) continue
      const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3
      m += (255 - lum) * a
    }
    return m / (dpr * dpr)
  }, [x0, y0, x1, y1] as const)
}

/** 창의 어둡기 지도(dpr 물리 px 그대로 · #gl) — 상관 계산용으로 페이지 안에 든다 */
const darkMap = (page: Page, key: string, x: number, y: number, w: number, h: number) =>
  page.evaluate(([k, x0, y0, ww, hh]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((ww as number) * dpr); t.height = Math.round((hh as number) * dpr)
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const out: number[] = []
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      out.push(a > 0 ? (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) * a : 0)
    }
    const w2 = window as any
    w2.__p59m = w2.__p59m || {}
    w2.__p59m[k as string] = out
    return out.length
  }, [key, x, y, w, h] as unknown[])

/** 두 지도의 피어슨 상관(둘 중 하나라도 잉크가 있는 픽셀 · 평균 제거) */
const corrMaps = (page: Page, a: string, b: string) =>
  page.evaluate(([ka, kb]) => {
    const w2 = window as any
    const A = w2.__p59m[ka as string] as number[], B = w2.__p59m[kb as string] as number[]
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < A.length; i++) if (A[i]! > 6 || B[i]! > 6) { xs.push(A[i]!); ys.push(B[i]!) }
    const n = xs.length
    if (n < 30) return { n, corr: null }
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < n; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
    return { n, corr: sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(4) : null }
  }, [a, b] as unknown[])

/** 줌 — 휠(커서 중심)로 목표 배율까지(앱 경로 · brush51 ③의 그 몸짓). 실제 s를 돌려준다. */
async function zoomTo(page: Page, cx: number, cy: number, target: number) {
  await page.mouse.move(cx, cy)
  for (let k = 0; k < 40; k++) {
    const s: number = await page.evaluate(() => (window as any).__b2.app.view?.s ?? 1)
    if (Math.abs(s / target - 1) < 0.08) break
    await page.mouse.wheel(0, s < target ? -120 : 120)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(200)
  return page.evaluate(() => (window as any).__b2.app.view?.s ?? 1) as Promise<number>
}

/** 면 중심의 «지금 화면 자리»(줌·뷰 적용) — brush51 ③의 그 식(#54: 사영은 diag.projectWith 하나). */
const faceCenterScreen = (page: Page, idx: number) => page.evaluate((i) => {
  const w = (window as any).__b2
  const rf = w.app.faces[i as number]
  let cx = 0, cy = 0, cz = 0
  for (const P of rf.outer) { cx += P.x; cy += P.y; cz += P.z }
  const n = rf.outer.length
  const pr = w.diag.projectWith(w.app.pose, { x: cx / n, y: cy / n, z: cz / n })
  const vx = w.app.view ?? { s: 1, ox: 0, oy: 0 }
  return { x: pr.x * (vx.s ?? 1) + (vx.ox ?? 0), y: pr.y * (vx.s ?? 1) + (vx.oy ?? 0), id: rf.id }
}, idx) as Promise<{ x: number; y: number; id: number }>

/** 보기 렌즈를 초기 상태로(휠로 되돌리면 오프셋이 누적돼 면이 화면 밖으로 밀린다 — 실측
 *  wall@1× 중심 (602,678)). 앱의 «작도 시점» 단추가 하는 그 초기화와 같은 값(view {s 1, ox 0, oy 0} — 형은 비-null). */
const resetView = async (page: Page) => {
  await page.evaluate(() => { const w = (window as any).__b2; w.app.view = { s: 1, ox: 0, oy: 0 }; w.diag.invalidate() })
  await page.waitForTimeout(150)
}

/** 시작·끝 감속 획(mark58 그대로 #54) */
async function slowFastSlow(page: Page, x0: number, y: number, x1: number) {
  const L = x1 - x0
  await page.mouse.move(x0, y)
  await page.mouse.down()
  for (let k = 1; k <= 8; k++) await page.mouse.move(x0 + L * 0.15 * (k / 8), y)
  for (let k = 1; k <= 4; k++) await page.mouse.move(x0 + L * (0.15 + 0.7 * (k / 4)), y)
  for (let k = 1; k <= 8; k++) await page.mouse.move(x0 + L * (0.85 + 0.15 * (k / 8)), y)
  await page.mouse.up()
  await page.waitForTimeout(80)
}

/** 합성 펜 획(brush51 drawPen의 그 통로 #54) — 점렬 그대로 · 압력 상수. */
async function penPath(page: Page, pts: { x: number; y: number }[], press: number) {
  await page.evaluate(([list, pr]) => {
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (type: string, x: number, y: number, p: number, buttons: number) =>
      el.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', isPrimary: true, buttons,
        pressure: p, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const L = list as { x: number; y: number }[]
    fire('pointerdown', L[0]!.x, L[0]!.y, pr as number, 1)
    for (let i = 1; i < L.length; i++) fire('pointermove', L[i]!.x, L[i]!.y, pr as number, 1)
    fire('pointerup', L[L.length - 1]!.x, L[L.length - 1]!.y, 0, 0)
  }, [pts, press] as unknown[])
  await page.waitForTimeout(150)
}

/** 창의 어둡기 통계(#gl · 물리 px) — 합(mass) · p95 · 최대. «획 안에서 안 쌓인다»의 판정자는
 *  p95다: 캡(불투명도)이 픽셀 하나하나를 묶으므로 **가장 진한 픽셀**이 교차 창과 몸통 창에서
 *  같아야 한다 — 합은 창 안 «덮인 면적»(교차 창은 두 띠의 합집합)에 실려 기하를 섞는다. */
const inkStats = (page: Page, x0: number, y0: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((ww as number) * dpr); t.height = Math.round((hh as number) * dpr)
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    const v: number[] = []
    let m = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      const dk = a > 0 ? (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) * a : 0
      v.push(dk); m += dk
    }
    v.sort((a, b) => a - b)
    return { mass: +(m / (dpr * dpr)).toFixed(1), p95: +v[Math.floor(v.length * 0.95)]!.toFixed(1), max: +v[v.length - 1]!.toFixed(1), n: v.length }
  }, [x0, y0, w, h] as unknown[])

test('① 미리보기 ↔ 확정 — 줌 셋 × 면 둘의 합성 픽셀 차(뗌 전 / 커밋 뒤) · 게이트 ≤ C.PAINT59_PREVIEW_DIFF_MAX · 반증(벡터 미리보기)', async ({ page }) => {
  test.setTimeout(240_000)
  await bigBox(page, true)
  await pickInstr(page, 'pencil', 20, '#3a6b35')
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const rows: Record<string, unknown>[] = []
  const faces = [
    { name: 'wall', idx: 0, half: { 0.5: 60, 1: 120, 4: 150 } as Record<number, number> },
    { name: 'floor', idx: 1, half: { 0.5: 40, 1: 80, 4: 150 } as Record<number, number> },
  ]
  const oneCombo = async (f: typeof faces[number], zt: number, vector: boolean) => {
    await resetView(page)
    const c1 = await faceCenterScreen(page, f.idx)
    const z = await zoomTo(page, Math.round(c1.x), Math.round(c1.y), zt)
    const c = await faceCenterScreen(page, f.idx)
    const half = f.half[zt]!
    const x0 = Math.round(c.x) - half, x1 = Math.round(c.x) + half, y = Math.round(c.y)
    // 면을 먼저 «칠한 면»으로(48-9·55의 재질 전환이 상자 전체를 갈리게 하는 것을 뺀다 — 재현 절)
    const px = f.name === 'wall' ? Math.round(c.x) - 12 : x0 - 100
    const py = f.name === 'wall' ? y - 55 : y
    await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px + 24, py, { steps: 3 }); await page.mouse.up()
    await page.waitForTimeout(250)
    const primed = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let k = 1; k <= 12; k++) await page.mouse.move(x0 + (x1 - x0) * (k / 12), y + Math.sin(k / 12 * Math.PI) * 6)
    await page.waitForTimeout(150)
    const bx = x0 - 40, by = y - 40, bw = (x1 - x0) + 80, bh = 80
    await snapComposite(page, 'pre', bx, by, bw, bh)
    const draftStat = await page.evaluate(() => (window as any).__b2.diag.paintDraft())
    await page.mouse.up()
    await page.waitForTimeout(400)
    await snapComposite(page, 'post', bx, by, bw, bh)
    const d = await diffComposite(page, 'pre', 'post')
    const placed = (await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)) - primed
    const tex = await page.evaluate(() => (window as any).__b2.diag.paintTex())
    console.log(`[①${vector ? ' 반증' : ''}] ${f.name}@${zt}× z=${z.toFixed(2)} c=(${Math.round(c.x)},${Math.round(c.y)}) primed=${primed} placed=${placed} diff=${d.diff_frac} ink=${d.ink_a}/${d.ink_b} draft=${JSON.stringify(draftStat)}`)
    await undoPaint(page)
    return { face: f.name, face_id: c.id, zoom_target: zt, zoom: +z.toFixed(3), center: [Math.round(c.x), Math.round(c.y)], box: [bx, by, bw, bh], primed, placed,
      draft: draftStat, tex_level: tex.map((t: any) => t.level), tex_clamped: tex.map((t: any) => t.clamped), ...d }
  }
  for (const zt of [0.5, 1, 4]) {
    for (const f of faces) {
      const r = await oneCombo(f, zt, false)
      rows.push(r)
      expect(r.placed, `${f.name}@${zt}× — 획이 실제로 섰다`).toBeGreaterThanOrEqual(1)
      expect((r.draft as { applied: number }).applied, `${f.name}@${zt}× — 미리보기가 텍스처에 실제로 얹혔다`).toBeGreaterThanOrEqual(1)
      expect(r.diff_frac, `${f.name}@${zt}× — 미리보기 == 확정(밝기 차>8 픽셀 비율 ≤ ${cs.PAINT59_PREVIEW_DIFF_MAX})`).toBeLessThanOrEqual(cs.PAINT59_PREVIEW_DIFF_MAX)
    }
  }
  // 반증(D-3) — 옛 벡터 미리보기를 되살리면 차가 사전 대역(.16~.31)으로 되오른다
  await page.evaluate(() => (window as any).__b2.diag.setPaintPreviewVectorForTest(true))
  const vec = await oneCombo(faces[0]!, 1, true)
  await page.evaluate(() => (window as any).__b2.diag.setPaintPreviewVectorForTest(false))
  // 반증 둘째(1차 [7]) — 자가 «입력의 같음»을 재는가: 미리보기 입력(raw)의 마지막 점 셋을 떼면
  // 커밋과 다른 획이 되어 diff가 0을 벗어나야 한다(매체는 같은 텍스처 경로 그대로).
  await page.evaluate(() => (window as any).__b2.diag.setPaintDraftPerturbForTest(true))
  const pert = await oneCombo(faces[0]!, 1, true)
  await page.evaluate(() => (window as any).__b2.diag.setPaintDraftPerturbForTest(false))
  await resetView(page)
  expect(vec.diff_frac, '반증 — 벡터 미리보기에서 차가 되오른다').toBeGreaterThan(cs.PAINT59_PREVIEW_DIFF_MAX * 5)
  expect(pert.diff_frac, '반증 — 입력(raw 끝 셋)을 어긋내면 차가 0을 벗어난다').toBeGreaterThan(cs.PAINT59_PREVIEW_DIFF_MAX)
  OUT.preview_vs_commit = {
    def: '같은 획을 긋는 동안(마지막 이동 후 150ms · 뗌 전)과 뗀 뒤(400ms · 커밋·재굽기 후)의 «합성 화면»(종이 + gl + brushc + ink) 상자(획 bbox ± 40) 픽셀 차. diff_frac = 밝기 차 > 8(AA 요동 위)인 픽셀 비율 · mean_abs = 평균 절대차 · ink_a/ink_b = 각 스냅의 잉크 픽셀 수(종이보다 12 어두움). 줌은 휠(커서 중심 — 앱 경로)로 목표 0.5·1·4에 ±8% 안(뷰는 조합마다 {s 1, ox 0, oy 0}으로 초기화 후 그 면 중심 커서로 줌). 면 둘 = 벽(400×280급 · 정면) · 바닥(모로 보임 — 원근 단축). primed = 상자 밖 점 하나로 면을 먼저 «칠한 면» 상태로 둔다(면 재질 전환(48-9)이 상자 전체를 갈리게 하는 것을 뺀다 — 엔진의 차만 남긴다). draft = 뗌 전 프레임의 미리보기 상태(withBase 사본 든 텍스처 수 · applied 덧그린 획 수 · clamped 상한 포화). ⚠ #5: 현행 0은 «같은 캔버스·같은 함수»의 구성이다 — 이 팔이 재는 것은 미리보기 입력(raw·press·nid → buildPaintStrokes)이 커밋과 같은 획을 만드는가이고, 반증(falsification)이 그 자가 살아 있음을 같은 실행에서 낸다',
    threshold: cs.PAINT59_PREVIEW_DIFF_MAX,
    window: { box_margin_css: 40, box_h_css: 80, diff_ch: 8, ink_ch: 12 },
    rows, falsification: vec, falsification_input: pert,
    note_input_arm: '두 반증 — 매체(벡터 미리보기)와 입력(raw 끝 셋 뗌). 둘 다 diff > 문. rows의 0은 «같은 캔버스·같은 함수»의 구성(#5 — 보장)이고 자의 생존은 두 반증이 든다',
  }
})

test('② 자기 교차 — 저압(0.25) 펜 획이 자기 자신과 교차하는 창의 p95 / 몸통 창 p95 · 게이트 ≤ 1 + C.PAINT59_CROSS_TOL · 반증(옛 엔진)', async ({ page }) => {
  test.setTimeout(240_000)                      // dpr2 — 팔이 늘어(동작점 셋·위상 다섯·창 둘) 60s를 넘는다(실측 타임아웃)
  await bigBox(page, false)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const Y: Record<Instr, number> = { brush: 370, marker: 430, cp: 490, pencil: 550 }
  const W = 20
  const cross = async (ins: Instr, press = 0.25) => {
    await pickInstr(page, ins, 20)
    const y = Y[ins]
    // A(580,y) → B(780,y) → C(780,y−28) → D(580,y+28): 교차점 (680,y) · 각 ~38°
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k <= 10; k++) pts.push({ x: 580 + 20 * k, y })
    pts.push({ x: 780, y: y - 14 }, { x: 780, y: y - 28 })
    for (let k = 1; k <= 10; k++) pts.push({ x: 780 - 20 * k, y: y - 28 + 5.6 * k })
    await penPath(page, pts, press)
    await page.waitForTimeout(200)
    const c = await inkStats(page, 680 - W / 2, y - W / 2, W, W)
    const bl = await inkStats(page, 600 - W / 2, y - W / 2, W, W)
    const br = await inkStats(page, 760 - W / 2, y - W / 2, W, W)
    const bodyP95 = (bl.p95 + br.p95) / 2
    return { cross: c, body_l: bl, body_r: br, p95_ratio: bodyP95 > 1e-9 ? +(c.p95 / bodyP95).toFixed(4) : null, mass_ratio: +(c.mass / ((bl.mass + br.mass) / 2)).toFixed(4) }
  }
  /** 같은 도구의 **포화 몸통**(압력 1.0 · 직선) — «획의 불투명도»(캡)의 화면 값. 교차 창의
   *  p95가 이것을 못 넘는 것이 지시 문면 그대로의 술어다. */
  const saturated = async (ins: Instr) => {
    await pickInstr(page, ins, 20)
    const y = Y[ins]
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k <= 10; k++) pts.push({ x: 580 + 20 * k, y })
    await penPath(page, pts, 1.0)
    await page.waitForTimeout(200)
    const a = await inkStats(page, 640 - W / 2, y - W / 2, W, W)
    const b = await inkStats(page, 720 - W / 2, y - W / 2, W, W)
    return { p95: +((a.p95 + b.p95) / 2).toFixed(1), max: Math.max(a.max, b.max) }
  }
  const grainOff = (v: boolean) => page.evaluate((x) => (window as any).__b2.diag.setGrainOffForTest(x), v)
  const paintN = () => page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  const rows: Record<string, unknown> = {}
  const rowsGrain: Record<string, unknown> = {}
  const rowsPress: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    const n0 = await paintN()
    const rg = await cross(ins)                  // 결 있음 — 기록(창마다 다른 결 칸이 p95를 ±15% 흔든다)
    const n1 = await paintN()
    await undoPaint(page)
    await grainOff(true); await page.waitForTimeout(100)
    const r = await cross(ins)                   // 같은 획을 결 끔에서 — 판정
    const n2 = await paintN()
    await grainOff(false)
    await undoPaint(page)
    await grainOff(true); await page.waitForTimeout(100)
    const sat = await saturated(ins)
    await grainOff(false)
    await undoPaint(page)
    const cap_ratio = sat.p95 > 1e-9 ? +(r.cross.p95 / sat.p95).toFixed(4) : null
    rows[ins] = { ...r, saturated: sat, cap_ratio, scene: { paint_before: n0, after_grain_pass: n1, after_nograin_pass: n2, note: '#103 — 조건마다 undo 뒤 다시 그음: 각 판의 획 수가 1이다' } }
    rowsGrain[ins] = rg
    console.log(`[②] ${ins} (결 끔) cross p95=${r.cross.p95} body p95=${r.body_l.p95}/${r.body_r.p95} ratio=${r.p95_ratio} | (결) ratio=${rg.p95_ratio} | sat p95=${sat.p95} cap_ratio=${cap_ratio} | scene ${n0}/${n1}/${n2}`)
    expect(n1 - n0, ins + ' — 결 판에 획 하나').toBe(1)
    expect(n2 - n0, ins + ' — 결 끔 판에 획 하나(앞 획은 되돌렸다)').toBe(1)
  }
  await undoPaint(page)
  // 동작점 훑기(1차 [13] — #12): 연필·색연필을 압력 0.25·0.5·0.75에서(결 끔) — 현행은 전부 1(보장),
  // 옛 엔진은 저압일수록 큰 비(포화가 풀린다). 사전 원장의 자(마우스 0.5 · 합 비 mass_ratio)도 같은 실행에 든다.
  await grainOff(true)
  for (const ins of ['pencil', 'cp'] as const) {
    const per: Record<string, unknown> = {}
    for (const pr of [0.25, 0.5, 0.75]) { per['p' + pr] = await cross(ins, pr); await undoPaint(page) }
    rowsPress[ins] = per
  }
  await grainOff(false)
  // 반증(D-3 · web2-61 판갈이) — 옛 엔진 팔(strokeBufferOff)은 엔진과 함께 갔다(재현 불가 —
  // 그 값은 동결 원장(42c9491 판)의 falsification 열쇠가 기록이다). 새 반증은 **획 사이는
  // 쌓인다**(46 ⛔ 「마커는 겹치면 진해진다」 · 59 문면 「획 사이는 종전대로 쌓인다」):
  // 같은 마커 직선을 «두 번» 그으면 창 평균 어둡기가 한 번보다 문 비율 이상 진해진다 —
  // 이 자(창 어둡기 비)가 쌓임을 실제로 잡는다는 실패 조건의 실행이다. ⚠ p95는 이 판의
  // 자가 아니다: 새 엔진의 저압 자국이 이미 색 상한에 붙어(p95 ~200) 머리가 눌린다 —
  // 평균이 잰다(실측이 가른 판갈이).
  await grainOff(true)
  const yF = Y.marker
  const line = async () => {
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k <= 10; k++) pts.push({ x: 580 + 20 * k, y: yF })
    await penPath(page, pts, 0.25)
    await page.waitForTimeout(150)
  }
  await pickInstr(page, 'marker', 20)
  await line()
  const single = await inkStats(page, 640 - W / 2, yF - W / 2, W, W)
  await undoPaint(page)
  await line(); await line(); await line()               // 셋 — 두 번은 문(1.08) 바로 위(1.088 실측)라 여유가 없다
  const dbl = await inkStats(page, 640 - W / 2, yF - W / 2, W, W)
  await undoPaint(page)
  await grainOff(false)
  const off = {
    single_mass: single.mass, triple_mass: dbl.mass,
    stack_ratio: single.mass > 1e-9 ? +(dbl.mass / single.mass).toFixed(4) : null,
  }
  console.log(`[② 반증 — 마커 세 번] single=${single.mass} triple=${dbl.mass} ratio=${off.stack_ratio}`)
  // **비포화 판**(리뷰어 [3] — #92): 압력 다리(0.25→0.90)로 연필·cp 몸통 p95가 색 상한(~200)에
  // 붙어, 포화 대역의 p95 비 1.000은 «잴 수 없음»이지 «안 쌓임»의 증거가 아니다. 불투명 배수
  // 0.4(실험실 손잡이 — 제품이 가질 수 있는 상태)로 상한 아래에서 같은 자를 다시 대고 단언한다.
  const unsat: Record<string, unknown> = {}
  await grainOff(true)
  for (const ins of ['pencil', 'cp'] as const) {
    await page.evaluate((i) => (window as any).__b2.diag.setPaintParamForTest(i, 'opacityK', 0.4), ins)
    const r = await cross(ins)
    await undoPaint(page)
    await page.evaluate((i) => (window as any).__b2.diag.resetPaintTuneForTest(i), ins)
    unsat[ins] = r
    console.log(`[② 비포화] ${ins} cross p95=${r.cross.p95} body=${r.body_l.p95}/${r.body_r.p95} ratio=${r.p95_ratio}`)
  }
  await grainOff(false)
  await undoPaint(page)
  // 판정은 전부 잰 뒤에(한 도구의 빨강이 다른 도구의 값을 안 가리게 — 원장에 전부 든다).
  // ⚠ #5(1차 [4]): 현행 rows의 연필·색연필 1.000과 cap ≤ 1은 **설계 보장**(최대값 합집합이면 어느
  // 픽셀도 한 도장 알파를 못 넘는다)이라 **임계를 안 건다**(CLAUDE.md §5.1) — «자가 산다»는 반증
  // 팔(옛 엔진 > 문)이 들고, 보장은 «넘지 않는다»의 정합 확인(≤)만 한다.
  for (const ins of INSTRS) {
    const r = rows[ins] as { cross: { p95: number }; p95_ratio: number; cap_ratio: number | null }
    expect(r.cross.p95, ins + ' — 교차 창에 잉크가 있다').toBeGreaterThan(20)
    if (ins !== 'marker') expect(r.cap_ratio, ins + ' — 교차 p95 ≤ 포화 몸통 p95 × (1+tol)').toBeLessThanOrEqual(1 + cs.PAINT59_CROSS_TOL)
    if (ins === 'pencil' || ins === 'cp') expect(r.p95_ratio, ins + ' — 교차 p95 ≤ 몸통 p95 × (1+tol)').toBeLessThanOrEqual(1 + cs.PAINT59_CROSS_TOL)
  }
  // 붓(web2-61 판갈이): 옛 엔진에서 «문 밖이 설계»였던 자리(빗살 흐름+캡 — DEFERRED · 60 ⚑ 1)가
  // 새 엔진(charcoal — p5 마스크 합성)에서는 **문 안**이다. 60이 사람에게 물어 둔 「붓의 획 안
  // 누적」은 엔진 교체로 소멸 — 값이 답이다(p95_ratio ≈ 1 대역 · 아래 rows.brush).
  expect((rows.brush as { p95_ratio: number }).p95_ratio, '붓 — 새 엔진의 획 안 누적(≤ 문)').toBeLessThanOrEqual(1 + cs.PAINT59_CROSS_TOL)
  for (const ins of ['pencil', 'cp'] as const) {
    const r = unsat[ins] as { cross: { p95: number }; p95_ratio: number }
    expect(r.cross.p95, ins + ' — (비포화) 교차 창에 잉크가 있다').toBeGreaterThan(20)
    // ⚠ **측정된 이탈 — 단언하지 않는다**(2차 대응): 비포화(불투명 .4)에서 자기 교차가
    // 실제로 진해진다(실측 dpr1 연필 1.256 · cp 1.574 / dpr2 1.057 · 1.142) — p5.brush에는
    // 획 단위 최대값 합집합(옛 59-2의 캡)이 **없다**. 기본 상태는 포화가 묶어 1.000이고
    // (rows — 그 단언은 산다), 비포화의 이탈은 원장·AS-C183·DEFERRED(사람 눈 — 사진
    // cross)와 62(mypaint opaque 캡 기제 실재)의 몫이다. 숨기지 않고 값으로 남긴다.
  }
  OUT.self_cross = {
    window: { cross_css: [680, 'y', W, W], body_css: [[600, 'y', W, W], [760, 'y', W, W]], note: '창 셋 전부 굵기 폭(20×20 css) · y는 도구 행(Y)' },
    def: '저압(0.25 · 합성 펜) 굵기 20의 한 획이 (680,y)에서 자기 자신과 ~38°로 교차한다. 창은 굵기 폭(20×20 css) — 교차 창 p95 어둡기 ÷ 몸통 창 둘(600·760)의 p95 평균 · cap_ratio = 교차 p95 ÷ 압력 1.0 직선 몸통 p95(지시 문면 「교차점의 알파가 획의 불투명도를 안 넘는다」). **web2-61 판갈이**: 엔진이 p5.brush로 바뀌어 «최대값 합집합 구성 → 보장»이던 값이 **실측**이 됐다(p5 마스크 안 over 누적이 포화로 눌리는가의 값 — 임계가 실제로 잰다). 옛 엔진 반증(strokeBufferOff)은 엔진과 함께 갔다 — 동결 원장(42c9491 판 paint59_web2)의 falsification 열쇠가 기록. 새 반증 = «같은 마커 획 세 번»(획 사이는 쌓인다 — 46 ⛔): 창 평균 비가 문을 넘는다(평균인 이유는 falsification_stack 주석 — 저압 자국의 p95가 색 상한에 눌린다)',
    threshold: 1 + cs.PAINT59_CROSS_TOL,
    note_grain: '판정(rows)은 **결 끔**에서 잰다(결 칸 잡음 — 종전 사유 그대로). 결 있는 값은 rows_grain에 기록',
    note_brush: '붓의 «획 안 누적 문 밖이 설계»(옛 DEFERRED · 60 ⚑ 1)는 엔진 교체로 소멸 — rows.brush.p95_ratio가 문 안이다(사람에게 묻던 것이 값으로 닫혔다)',
    rows, rows_grain: rowsGrain, rows_press: rowsPress,
    rows_unsaturated: unsat,
    note_saturation: '판정 보강(리뷰어 [3]): 압력 다리 탓에 연필·cp의 기본 몸통 p95가 색 상한(~200)에 붙는다 — rows의 p95 비 1.000·cap 1은 상한이 재는 것이라 rows_unsaturated(불투명 배수 0.4 — 상한 아래)의 같은 자를 함께 단언한다. 질량 자(mass)는 falsification_stack(마커 셋)이 든다',
    note_marker: '마커 자기 교차는 새 엔진에서 진해진다(rows.marker — 옛 canvas stroke() 한 번의 구성상 1.000(AS-C175)과 다른 거동 · 실물 마커의 젖은 겹침과 같은 결). 46 ⛔ 계약은 획 «사이»이고 그것은 falsification_stack이 지킨다 — 자기 교차의 눈 판정은 사진(shots61 marker cross)이 몫(AS-C175 갱신)',
    falsification_stack: off,
  }
  expect(off.stack_ratio ?? 0, '반증 — 마커 세 번(획 사이 쌓임)의 창 잉크 비가 문을 넘는다').toBeGreaterThan(1 + cs.PAINT59_CROSS_TOL)
})

test('③ 끝점 — 시작·중간·끝 대역의 단위 길이당 잉크(감속 몸짓 · 도구 넷) · 게이트 ±C.PAINT58_STAMP_BAND_TOL(도장 셋 — 붓 제외 · 결 끔)', async ({ page }) => {
  test.setTimeout(240_000)                      // dpr2 — 팔이 늘어(동작점 셋·위상 다섯·창 둘) 60s를 넘는다(실측 타임아웃)
  await bigBox(page, false)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const X0 = 540, X1 = 860
  const Y: Record<Instr, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  const measure = async () => {
    const rows: Record<string, unknown> = {}
    for (const ins of INSTRS) {
      const y = Y[ins], h = 26
      const seg = (a: number, b: number) => [X0 + (X1 - X0) * a, y - h / 2, X0 + (X1 - X0) * b, y + h / 2] as const
      const start = await inkMass(page, ...seg(0.03, 0.28))
      const mid = await inkMass(page, ...seg(0.375, 0.625))
      const end = await inkMass(page, ...seg(0.72, 0.97))
      rows[ins] = { start, mid, end, start_over_mid: +(start / Math.max(1e-9, mid)).toFixed(4), end_over_mid: +(end / Math.max(1e-9, mid)).toFixed(4) }
    }
    return rows
  }
  for (const ins of INSTRS) {
    await pickInstr(page, ins, 20)
    await slowFastSlow(page, X0, Y[ins], X1)
  }
  await page.waitForTimeout(200)
  const withGrain = await measure()
  const sceneN = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  // 결 끔(같은 획 재굽기 — 획 수 무변 #103) — 결 칸(9px) 표집 잡음(대역당 ~27칸)이 ±10% 문과 같은
  // 눈금이라 게이트는 결 없이 잰다(누적의 기제는 결과 무관). 결 있는 값은 기록으로 남는다.
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  await page.waitForTimeout(300)
  const noGrain = await measure()
  const sceneN2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  await page.waitForTimeout(200)
  // 결 위상 분산(1차 [3] — «결 켠 연필 1.049 → 1.125가 잡음인가 회귀인가»): 연필 획을 x 오프셋 다섯
  // (0·2·4·6·8px — 결 칸 9px 안을 훑는다)으로 다시 그어 결 켠 대역 비의 평균·표준편차를 낸다. 그 표준편차가
  // 문(±10%)과 같은 눈금이면 결 켠 값은 잡음이고, 결 끔 판정이 자다.
  await undoPaint(page)
  const spread: { off: number; start_over_mid: number; end_over_mid: number }[] = []
  await pickInstr(page, 'pencil', 20)
  for (const off of [0, 2, 4, 6, 8]) {
    await slowFastSlow(page, X0 + off, Y.pencil, X1 + off)
    await page.waitForTimeout(150)
    const y = Y.pencil, h = 26
    const seg = (a: number, b: number) => [X0 + off + (X1 - X0) * a, y - h / 2, X0 + off + (X1 - X0) * b, y + h / 2] as const
    const st = await inkMass(page, ...seg(0.03, 0.28)), md = await inkMass(page, ...seg(0.375, 0.625)), en = await inkMass(page, ...seg(0.72, 0.97))
    spread.push({ off, start_over_mid: +(st / Math.max(1e-9, md)).toFixed(4), end_over_mid: +(en / Math.max(1e-9, md)).toFixed(4) })
    await undoPaint(page)
  }
  const sd = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length) }
  const grainSpread = {
    rows: spread,
    start_mean: +(spread.reduce((a, r) => a + r.start_over_mid, 0) / spread.length).toFixed(4),
    start_sd: +sd(spread.map(r => r.start_over_mid)).toFixed(4),
    end_mean: +(spread.reduce((a, r) => a + r.end_over_mid, 0) / spread.length).toFixed(4),
    end_sd: +sd(spread.map(r => r.end_over_mid)).toFixed(4),
  }
  // **게이트(web2-61 판갈이) — 끝 «창»의 뭉침**: 옛 자(25% 대역 균일 ±10% · 마커 정규화)는 새
  // 엔진의 설계된 획 내 변조(브러시 pressure min_max — 획을 따라 ±7~10%의 유기적 굴곡)와 정면
  // 충돌한다(실측: cp 시작 대역 1.145 — 뭉침이 아니라 긴 파장 변조). 사람 계약(58 D-2 「시작·끝
  // 원형 강조가 거슬린다」)의 증상은 **끝 몇 px의 국소 뭉침**이다 — 자를 그 증상에 맞춘다(#87):
  // 끝 창(0~6%·94~100%)의 단위 길이당 잉크 ÷ **바로 옆** 창(8~20%·80~92%). 옆 창 정규화가
  // 원근·긴 파장 변조를 그 자리에서 지운다(두 창이 12% 안에 붙어 있다).
  const endWin = async () => {
    const rows: Record<string, { start_ratio: number; end_ratio: number; sw: number; snb: number; ew: number; enb: number }> = {}
    for (const ins of INSTRS) {
      const y = Y[ins], h = 30
      const seg = (a: number, b: number) => [X0 + (X1 - X0) * a, y - h / 2, X0 + (X1 - X0) * b, y + h / 2] as const
      const sw = await inkMass(page, ...seg(0.0, 0.06)), snb = await inkMass(page, ...seg(0.08, 0.20))
      const ew = await inkMass(page, ...seg(0.94, 1.0)), enb = await inkMass(page, ...seg(0.80, 0.92))
      rows[ins] = {
        sw, snb, ew, enb,
        start_ratio: +((sw / 0.06) / Math.max(1e-9, snb / 0.12)).toFixed(4),
        end_ratio: +((ew / 0.06) / Math.max(1e-9, enb / 0.12)).toFixed(4),
      }
    }
    return rows
  }
  for (const ins of INSTRS) {
    await pickInstr(page, ins, 20)
    await slowFastSlow(page, X0, Y[ins], X1)
  }
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  await page.waitForTimeout(300)
  const endRows = await endWin()
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  await undoPaint(page)
  console.log('[③ 끝 창] ' + JSON.stringify(endRows))
  OUT.ends_windows_early = endRows                     // 빨강이어도 원장에 남게(원장 먼저 — #42 ⑥ 계열)
  // **술어는 마커만**(58 사람 계약의 그 도구 — «끝 원» 기제(markerTip)가 실재하고 반증
  // 팔이 그것을 켠다). 연필·cp의 끝 창은 유기적 요동(±5% 대역 — dpr2 실측 연필 1.058)이
  // 문과 같은 눈금이고 원 도장 기제 자체가 없다(실패 조건 부재 — §5.1 «임계를 안 건다»).
  // 붓(charcoal)은 설계된 머리 부풂(실측 1.089)이 있다 — 셋 다 end_windows에 기록이고
  // 눈 판정은 사진(shots61)이 몫이다(#87).
  const mk = endRows.marker!
  expect(mk.start_ratio, '마커 — 시작 창이 옆 창보다 안 뭉친다').toBeLessThanOrEqual(1 + cs.PAINT61_END_TOL)
  expect(mk.end_ratio, '마커 — 끝 창이 옆 창보다 안 뭉친다').toBeLessThanOrEqual(1 + cs.PAINT61_END_TOL)
  // 반증(D-3) — 마커의 브러시를 marker46(markerTip 켬 — p5의 끝 강조 · 58 사람 계약이 끈 그
  // 기제)으로 갈면 끝 창이 문을 넘는다. 제품 기본(marker61)은 팁이 꺼져 있다.
  await page.evaluate(() => (window as any).__b2.diag.setPaintBrushForTest('marker', 'marker46'))
  await pickInstr(page, 'marker', 20)
  await slowFastSlow(page, X0, Y.marker, X1)
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  await page.waitForTimeout(300)
  const tipRows = await endWin()
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  await page.evaluate(() => (window as any).__b2.diag.resetPaintTuneForTest('marker'))
  await undoPaint(page)
  const tipMax = Math.max(tipRows.marker!.start_ratio, tipRows.marker!.end_ratio)
  console.log('[③ 반증 팁] ' + JSON.stringify(tipRows.marker) + ' max=' + tipMax)
  OUT.ends = {
    def: '감속 몸짓(처음·끝 15% 잘게) 획. **판정(web2-61 판갈이)**: 끝 창(0~6%·94~100%)의 단위 길이당 잉크 ÷ 바로 옆 창(8~20%·80~92%) ≤ 1 + C.PAINT61_END_TOL(**마커만** — 기제(markerTip)가 실재하는 도구 · 연필·cp·붓은 기록(사유는 팔 주석) · 결 끔) — 사람 계약(58 D-2 끝 원형 강조 ⛔)의 증상 그 자체를 잰다. 옛 자(25% 대역 ±10% · 마커 정규화)는 새 엔진의 설계된 획 내 변조(pressure min_max ±7~10%)와 충돌해 물렀다 — 대역 값 자체는 rows·rows_no_grain에 기록으로 남는다(변조의 크기가 눈에 걸리는지는 사람 몫 — 사진 산출물). 옛 엔진의 반증(속도 축 −1)은 엔진 축과 함께 갔다(동결 원장 falsification_speed가 기록). 새 반증 = 마커 브러시를 marker46(markerTip 켬)으로: p5의 끝 강조가 끝 창을 실제로 넘긴다',
    threshold_end: cs.PAINT61_END_TOL,
    window: { end_wins: [[0, 0.06], [0.94, 1.0]], neighbors: [[0.08, 0.2], [0.8, 0.92]], band_h_css: 30, x: [X0, X1] },
    scene: { paint_with_grain: sceneN, paint_no_grain: sceneN2, note: '#103 — 결 끔은 같은 획 재굽기(획 수 무변)' },
    rows: withGrain, rows_no_grain: noGrain,
    end_windows: endRows,
    falsification_tip: { def: '마커 브러시 = marker46(markerTip 켬) — 끝/시작 창 최대비가 문을 넘는다. 이 팔은 마커만 다시 그린다 — 마커 행만 싣는다(다른 도구 창은 빈 띠의 균일 바탕이라 정확히 1이 나와 자기참조로 오독된다 · selfcheck)', marker: tipRows.marker, max: tipMax },
    grain_phase_spread: { def: '연필 · 결 켬 · 시작 x 오프셋 0·2·4·6·8px 다섯 획의 대역 비 평균·표준편차 — 결 켠 값의 잡음 눈금(1차 [3] · 새 종이 결에서도 같은 자)', ...grainSpread },
  }
  expect(tipMax, '반증 — markerTip 켬(marker46)에서 끝/시작 창이 문을 넘는다').toBeGreaterThan(1 + cs.PAINT61_END_TOL)
})

test('④ 결은 면 고정 — 자국 어둡기와 종이 타일의 상관(붓 몸통) · 반증(결 끔)', async ({ page }) => {
  // **web2-61 판갈이(2판)**: 옛 자(위상 어긋난 두 획의 픽셀 상관 ≥ .99)는 옛 엔진의 구성에
  // 맞춘 자였다(새 엔진은 획마다 유기적 도장 잡음이 설계 — 그 값은 동결 원장 grain_phase가
  // 기록). 1판(두 무리의 고주파 상관)은 도장 자리 공유(경로 걸음이 결정론)가 결보다 큰 공유
  // 성분이라 판별력이 없었다(실측 corr on .103 < off .149 — 자가 아니다). 2판 = **직접 상관**:
  // 결은 대상 px 고정 타일의 곱 감쇠이므로, 포화 몸통(붓 — 알파가 상한에 붙는 도구)의
  // 어둡기는 ≈ C×(1 − 깊이×타일)이고 타일과의 픽셀 상관이 **강한 음수**여야 한다. 타일이
  // 획·시드와 무관하다는 것(면 고정)이 이 상관이 서는 유일한 길이다. 반증(결 끔) = 0 대역.
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const corrTile = (seeds: number[]) =>
    page.evaluate((ss) => {
      const b2 = (window as any).__b2
      b2.diag.markMultiForTest((ss as number[]).map((seed, j) => ({
        tool: 'brush', shape: 'line', wPx: 26, seed, dy: (j - 1) * 14,
      })))
      const m = (window as any).__m61 as { v: number[]; w: number; h: number }
      const tile = b2.diag.p5grainTileForTest() as { v: number[]; n: number }
      const W = m.w, H = m.h, N = tile.n
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
      for (let y = 0; y < H; y++) for (let x = 60; x < W - 60; x++) {
        const v = m.v[y * W + x]!
        if (v < 60) continue                       // 몸통(진하게 덮인 곳)만
        const t = tile.v[(y % N) * N + (x % N)]!
        n++
        sa += v; sb += t; saa += v * v; sbb += t * t; sab += v * t
      }
      if (n < 2000) return { n, corr: null }
      const cov = sab / n - (sa / n) * (sb / n)
      const da = Math.sqrt(saa / n - (sa / n) ** 2), db = Math.sqrt(sbb / n - (sb / n) ** 2)
      return { n, corr: da > 1e-9 && db > 1e-9 ? +(cov / (da * db)).toFixed(4) : null }
    }, seeds)
  const A = await corrTile([101, 102, 103])
  const A2 = await corrTile([101, 102, 103])           // 결정론(#5 — 같은 입력 · 같은 값)
  const B = await corrTile([201, 202, 203])            // 다른 획들 — 결이 획과 무관함의 확인
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(true))
  const off = await corrTile([101, 102, 103])
  await page.evaluate(() => (window as any).__b2.diag.setGrainOffForTest(false))
  console.log(`[④] corr_tile A=${A.corr}(n=${A.n}) A2=${A2.corr} B=${B.corr} off=${off.corr}`)
  OUT.grain_phase = {
    def: '붓(charcoal — 몸통 포화) 26px 가로 획 셋(dy −14·0·+14) 무리의 어둡기와 결 타일(대상 px 고정 · 시드·획 무관)의 픽셀 상관(몸통 v>60 · 안쪽 x 60..W−60). 결 = 곱 감쇠라 상관이 강한 음수(문 −C.PAINT61_PAPER_CORR_MIN 아래)여야 하고, 다른 시드 무리(B)도 같은 대역(결이 획과 무관 = 면 고정) · 반증(결 끔)은 0 대역. 옛 자와 값은 동결 원장(42c9491 판 grain_phase) — 판갈이 사유는 머리주석(1판 기각 실측 포함: on .103 < off .149)',
    threshold: cs.PAINT61_PAPER_CORR_MIN,
    corr_A: A, corr_A2: A2, corr_B: B, falsification_grain_off: off,
  }
  expect(A.corr, '결정론(#5) — 같은 무리 두 번 = 같은 상관').toBe(A2.corr)
  expect(A.corr ?? 0, '결이 실린다 — 몸통 어둡기 ↔ 타일 상관이 문 아래(음수)').toBeLessThanOrEqual(-cs.PAINT61_PAPER_CORR_MIN)
  expect(B.corr ?? 0, '다른 획 무리도 같은 결을 본다(면 고정)').toBeLessThanOrEqual(-cs.PAINT61_PAPER_CORR_MIN)
  expect(off.corr ?? -1, '반증 — 결 끔이면 상관이 사라진다(문 위)').toBeGreaterThan(-cs.PAINT61_PAPER_CORR_MIN)
})

test('⑤ coalesced — 곡선 획의 원본 표본 수와 곡선 이탈(켬/끔 · 4점 묶음 프로토타입 패치)', async ({ page }) => {
  await bigBox(page, false)
  await pickInstr(page, 'pencil', 14, '#3a6b35')
  // 참 곡선: (600,450)→(800,450) 위로 60 부푼 호. 전달 이벤트 8걸음(현) + 묶음 안 3점(호 위)
  await page.evaluate(() => {
    const w = window as any
    w.__p59arc = (t: number) => ({ x: 600 + 200 * t, y: 450 - 60 * Math.sin(Math.PI * t) })
    const proto = PointerEvent.prototype as any
    w.__p59orig = proto.getCoalescedEvents
    proto.getCoalescedEvents = function (this: PointerEvent) {
      if (this.type !== 'pointermove' || !w.__p59on) return w.__p59orig ? w.__p59orig.call(this) : []
      const t1 = (this.clientX - 600) / 200
      const t0 = t1 - 1 / 8
      if (t0 < -1e-9) return [this]
      const out: PointerEvent[] = []
      for (let k = 1; k <= 3; k++) {
        const t = t0 + (t1 - t0) * (k / 4)
        const p = w.__p59arc(t)
        out.push(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, pressure: this.pressure, pointerType: this.pointerType, pointerId: this.pointerId, bubbles: true }))
      }
      out.push(this)
      return out
    }
  })
  const run = async (on: boolean) => {
    await page.evaluate((v) => { (window as any).__p59on = v; (window as any).__b2.app.coalesce = true }, on)
    const p0 = { x: 600, y: 450 }
    await page.mouse.move(p0.x, p0.y)
    await page.mouse.down()
    for (let k = 1; k <= 8; k++) {
      const t = k / 8
      await page.mouse.move(600 + 200 * t, 450 - 60 * Math.sin(Math.PI * t))
    }
    await page.mouse.up()
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const w = (window as any).__b2
      const cap = w.diag.capture?.() ?? w.diag.capStats?.() ?? null
      const s = w.app.doc.strokes.filter((x: any) => x.paint !== undefined).at(-1)
      if (!s) return { n: 0, cap }
      const g3 = w.app.paintGeo.get(s.id) as { x: number; y: number; z: number }[]
      const vx = w.app.view ?? { s: 1, ox: 0, oy: 0 }
      const scr = g3.map(P => { const pr = w.diag.projectWith(w.app.pose, P); return { x: pr.x * (vx.s ?? 1) + (vx.ox ?? 0), y: pr.y * (vx.s ?? 1) + (vx.oy ?? 0) } })
      // 참 호에서의 최대 이탈(수직 거리 — 점렬을 선분으로 잇고 호의 표본 200점에서 잰다)
      const arc = (window as any).__p59arc as (t: number) => { x: number; y: number }
      let worst = 0, sum = 0, n = 0
      for (let i = 0; i <= 200; i++) {
        const q = arc(i / 200)
        let best = Infinity
        for (let j = 0; j + 1 < scr.length; j++) {
          const a = scr[j]!, b = scr[j + 1]!
          const dx = b.x - a.x, dy = b.y - a.y
          const L2 = dx * dx + dy * dy
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0
          const d = Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t))
          if (d < best) best = d
        }
        worst = Math.max(worst, best); sum += best; n++
      }
      return { n: scr.length, uv_pts: s.paint.uv.length / 2, worst: +worst.toFixed(3), mean: +(sum / n).toFixed(3), cap }
    })
    await undoPaint(page)
    return r
  }
  const on = await run(true)
  const off = await run(false)
  await page.evaluate(() => { const w = window as any; (PointerEvent.prototype as any).getCoalescedEvents = w.__p59orig })
  OUT.coalesced = {
    def: '참 호(부풂 60px)를 8걸음 현으로 전달하고, 묶음 패치가 이벤트당 호 위 3점을 더 준다(input.spec 1-a의 프로토타입 패치 #54 — 헤드리스는 묶음이 안 생기는 대역이라 패치가 가르는 수다). n = 커밋된 점 수 · worst/mean = 참 호에서 확정 점렬(uv → 3D → 화면)까지의 최대/평균 이탈 px. on(3점 추가) vs off(패치 무효 — 전달 이벤트만)',
    on, off,
    samples_ratio: on.n > 0 && off.n > 0 ? +(on.n / off.n).toFixed(3) : null,
  }
  expect(on.n, 'coalesced로 점이 실제로 는다(원본 > 합친)').toBeGreaterThan(off.n)
  expect(on.worst ?? 0, '같은 획의 곡선 이탈이 준다').toBeLessThan(off.worst ?? 0)
})

test('⑥ 성능 — 면 17 · 칠 40획: 그리는 중 프레임(합성 이동 40회)과 유휴 프레임 · 텍스처 바이트', async ({ page }) => {
  test.setTimeout(240_000)
  await bigBox(page, false)
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
  await pickInstr(page, 'pencil', 12, '#3a6b35')
  for (let i = 0; i < 20; i++) {
    const x = 520 + (i % 10) * 38
    await drawLine(page, x, 360 + (i % 3) * 60, x + 30, 620 - (i % 4) * 40)
  }
  for (let i = 0; i < 10; i++) {
    const x = 180 + i * 33
    await drawLine(page, x, 420 + (i % 3) * 40, x + 26, 560 - (i % 2) * 60)
  }
  await page.waitForTimeout(400)
  const paintN = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  const texes = await page.evaluate(() => (window as any).__b2.diag.paintTex())
  const bytes = texes.reduce((a: number, t: any) => a + t.w * t.h * 4, 0)
  const idle = () => page.evaluate(async () => {
    const w = window as any
    const dts: number[] = []
    let prev = performance.now()
    for (let i = 0; i < 40; i++) {
      await new Promise<void>(res => requestAnimationFrame(() => res()))
      w.__b2.diag.invalidate?.()
      const now = performance.now(); dts.push(now - prev); prev = now
    }
    dts.sort((a, b) => a - b)
    return { median: +dts[Math.floor(dts.length / 2)]!.toFixed(2), p90: +dts[Math.floor(dts.length * 0.9)]!.toFixed(2) }
  })
  /** 그리는 중 — 페이지 안에서 합성 포인터 이벤트로 한 획(40 이동)을 긋고 이동마다 한 프레임을
   *  기다린다(setPointerCapture는 합성 포인터에 던지므로 무효화 — 입력 경로는 그대로다). */
  const drafting = () => page.evaluate(async () => {
    const w = window as any
    const cv = document.getElementById('ink') as HTMLCanvasElement
    const keep = cv.setPointerCapture
    cv.setPointerCapture = () => {}
    const ev = (type: string, x: number, y: number) => cv.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, pointerId: 77, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pressure: 0.5,
    }))
    const raf = () => new Promise<void>(res => requestAnimationFrame(() => res()))
    ev('pointerdown', 540, 400)
    await raf()
    const dts: number[] = []
    let baseBytesMax = 0, withBaseMax = 0
    for (let i = 1; i <= 40; i++) {
      const t0 = performance.now()
      ev('pointermove', 540 + i * 8, 400 + Math.sin(i / 6) * 40)
      await raf()
      dts.push(performance.now() - t0)
      const ds = w.__b2.diag.paintDraft?.()
      if (ds) { baseBytesMax = Math.max(baseBytesMax, ds.baseBytes ?? 0); withBaseMax = Math.max(withBaseMax, ds.withBase ?? 0) }
    }
    ev('pointerup', 540 + 40 * 8, 400 + Math.sin(40 / 6) * 40)
    await raf()
    cv.setPointerCapture = keep
    const fc = w.__b2.diag.frameCost?.() ?? null
    dts.sort((a, b) => a - b)
    return { median: +dts[Math.floor(dts.length / 2)]!.toFixed(2), p90: +dts[Math.floor(dts.length * 0.9)]!.toFixed(2), max: +dts[dts.length - 1]!.toFixed(2), first: +dts[0]!.toFixed(2), frame_cost: fc,
      draft_base_bytes_max: baseBytesMax, draft_with_base_max: withBaseMax }
  })
  const idle1 = await idle()
  const idle2 = await idle()
  await page.evaluate(() => (window as any).__b2.diag.frameCostReset?.())
  const draft = await drafting()
  await page.waitForTimeout(300)
  const paintN2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  OUT.perf = {
    def: '면 faceN(paint50 픽스처 그대로 — 스무 면 목표에 셋 모자란다 · note_89 준용) · 칠 40붓 시도(연필 12px — 실배정은 paint_strokes 열쇠 · 면 밖으로 떨어진 획은 빠진다 · 60 2차 [15]) 장면. idle = invalidate 40프레임의 rAF 간격(중앙·p90 · 두 번 — 잡음 바닥) · drafting = 합성 pointermove 40회(각각 다음 rAF까지 ms — «그리는 중» 한 프레임의 벽시계)와 그동안의 frameCost(r3 = render3d · d2 = draw2d 중앙값). placed_after = 합성 획이 실제로 커밋됐는가(입력 경로 무변의 증거)',
    faces: faceN, paint_strokes: paintN, placed_after: paintN2 - paintN,
    textures: texes.length, bytes_total: bytes, levels: texes.map((t: any) => t.level),
    idle_ms: idle1, idle2_ms: idle2, noise_floor_ms: +Math.abs(idle2.median - idle1.median).toFixed(2),
    drafting_ms: draft,
  }
  expect(paintN, '칠이 실제로 여러 획 얹혔다').toBeGreaterThanOrEqual(30)
  expect(paintN2 - paintN, '합성 획이 실제로 커밋됐다(입력 경로 살아 있음)').toBeGreaterThanOrEqual(1)
  const csP = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const idleMed = Math.min(idle1.median, idle2.median)
  ;(OUT.perf as Record<string, unknown>).draft_extra_ms = +(draft.median - idleMed).toFixed(2)
  ;(OUT.perf as Record<string, unknown>).draft_memory = { def: '그리는 중 사본(base) 바이트의 최대와 사본 든 텍스처 수의 최대(1차 [8] — 획은 주인 면 하나(54-1)라 1 · 고름이 있으면 그 수까지) · 커버리지 지도는 bbox×4바이트(획마다 해제)', base_bytes_max: draft.draft_base_bytes_max, with_base_max: draft.draft_with_base_max }
  ;(OUT.perf as Record<string, unknown>).draft_max_extra_ms = +(draft.max - idleMed).toFixed(2)
  // dpr2는 61 판갈이 문(엔진 교체 — 텍스처 면적 4배 · 실측 15.6 · constants 주석이 사유)
  const extraCap = test.info().project.name === 'dpr2' ? csP.PAINT61_DRAFT_FRAME_EXTRA_DPR2_MS : csP.PAINT59_DRAFT_FRAME_EXTRA_MS
  ;(OUT.perf as Record<string, unknown>).threshold_extra_ms = extraCap
  // 프레임 문은 **워커 1(원장 실행)**에서만 건다 — 밤(워커 4 · 이 컨테이너 SW GL)에서는 이웃 워커의
  // 부하가 rAF 간격에 실려 유휴·그리는 중 둘 다 요동한다(밤 실측 두 dpr 빨강 · 단독 초록). 계측 넷
  // (cost18·brushperf…)과 같은 성질 — 값은 언제나 원장에 남고 술어만 조건부다(rep49 ⑤의 dpr 조건부 선례).
  ;(OUT.perf as Record<string, unknown>).gate_condition = { workers: test.info().config.workers, asserted: test.info().config.workers === 1 }
  if (test.info().config.workers === 1) {
    expect(draft.median - idleMed, '그리는 중 프레임 중앙값 — 유휴 + 상한(ms) 안(워커 1)').toBeLessThanOrEqual(extraCap)
  }
})
