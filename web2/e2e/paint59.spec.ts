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
// 원장: stage0/out/paint59_pre_web2_dpr{1,2}.json — **수리 전 동결**(57 2차 [2] · 58 선례).
// 수리 뒤의 같은 자는 paint59_web2_dpr*.json(이 파일의 LEDGER_NAME이 그때 바뀐다).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEDGER_NAME = 'paint59_pre'
const OUT: Record<string, unknown> = {
  what: 'web2-59 — 칠 엔진의 뼈대: 수리 «전» 실측(D-2). ① 미리보기↔확정 픽셀 차(줌 셋 × 면 둘) ② 자기 교차 누적 ③ 끝점 대역 잉크 ④ 결 위상 상관 ⑤ coalesced 곡선 이탈 ⑥ 성능(그리는 중 프레임)',
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

test('① 미리보기 ↔ 확정 — 줌 셋 × 면 둘의 합성 픽셀 차(뗌 전 / 커밋 뒤)', async ({ page }) => {
  test.setTimeout(180_000)
  await bigBox(page, true)
  await pickInstr(page, 'pencil', 20, '#3a6b35')
  const rows: Record<string, unknown>[] = []
  // 면 둘 = faces[0] 벽 · faces[1] 바닥. 줌은 벽 중심 커서로 걸고, 획 자리는 **면 중심의
  // 지금 화면 자리**(사영)에서 잰다 — 커서 중심 줌은 «그 커서»에 대해서만 제자리라
  // 다른 면은 줌마다 옮겨 앉는다(초판이 (400,630) 고정으로 그어 바닥을 놓쳤다 — 실측).
  const faces = [
    { name: 'wall', idx: 0, half: { 0.5: 60, 1: 120, 4: 150 } as Record<number, number> },
    { name: 'floor', idx: 1, half: { 0.5: 40, 1: 80, 4: 150 } as Record<number, number> },
  ]
  for (const zt of [0.5, 1, 4]) {
    for (const f of faces) {
      // 1×로 되돌린 뒤 **그 면의 중심**을 커서로 줌한다(4×에서 벽 커서 줌은 바닥을 화면 밖으로
      // 보낸다 — 실측 floor@4× 미배치). 줌 뒤 중심을 다시 읽는다(커서 중심이라 ±몇 px).
      await resetView(page)
      const c1 = await faceCenterScreen(page, f.idx)
      const z = await zoomTo(page, Math.round(c1.x), Math.round(c1.y), zt)
      const c = await faceCenterScreen(page, f.idx)
      const half = f.half[zt]!
      const x0 = Math.round(c.x) - half, x1 = Math.round(c.x) + half, y = Math.round(c.y)
      // **면을 먼저 «칠한 면»으로 만든다** — 첫 칠에서 면 재질이 «드러난 톤»에서 «칠한 면»으로
      // 갈아타(48-9·55의 규약) 상자 전체가 갈린다(실측: 뗌 전 잉크 픽셀 25600/25600 = 상자
      // 전부). 그것은 면의 일이지 엔진의 일이 아니므로, 상자 밖에 점 하나를 먼저 찍어 두
      // 스냅이 같은 면 상태에서 갈리게 한다(그 점은 상자 밖 — 차에 안 든다).
      const px = f.name === 'wall' ? Math.round(c.x) - 12 : x0 - 100
      const py = f.name === 'wall' ? y - 55 : y
      await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px + 24, py, { steps: 3 }); await page.mouse.up()   // 탭 대역(TAP_MAX_PX) 밖이어야 획이다(4px는 Injector 탭이었다 — 실측 primed 0)
      await page.waitForTimeout(250)
      const primed = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
      await page.mouse.move(x0, y)
      await page.mouse.down()
      for (let k = 1; k <= 12; k++) await page.mouse.move(x0 + (x1 - x0) * (k / 12), y + Math.sin(k / 12 * Math.PI) * 6)
      await page.waitForTimeout(150)
      const bx = x0 - 40, by = y - 40, bw = (x1 - x0) + 80, bh = 80
      await snapComposite(page, 'pre', bx, by, bw, bh)
      await page.mouse.up()
      await page.waitForTimeout(400)
      await snapComposite(page, 'post', bx, by, bw, bh)
      const d = await diffComposite(page, 'pre', 'post')
      const placed = (await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)) - primed
      const tex = await page.evaluate(() => (window as any).__b2.diag.paintTex())
      console.log(`[①] ${f.name}@${zt}× z=${z.toFixed(2)} c1=(${Math.round(c1.x)},${Math.round(c1.y)}) c=(${Math.round(c.x)},${Math.round(c.y)}) primed=${primed} placed=${placed} diff=${d.diff_frac} ink=${d.ink_a}/${d.ink_b}`)
      rows.push({ face: f.name, face_id: c.id, zoom_target: zt, zoom: +z.toFixed(3), center: [Math.round(c.x), Math.round(c.y)], box: [bx, by, bw, bh], primed, placed,
        tex_level: tex.map((t: any) => t.level), tex_clamped: tex.map((t: any) => t.clamped), ...d })
      expect(placed, `${f.name}@${zt}× — 획이 실제로 섰다`).toBeGreaterThanOrEqual(1)
      await undoPaint(page)
    }
  }
  await resetView(page)
  OUT.preview_vs_commit = {
    def: '같은 획을 긋는 동안(마지막 이동 후 150ms · 뗌 전)과 뗀 뒤(400ms · 커밋·재굽기 후)의 «합성 화면»(종이 + gl + brushc + ink) 상자(획 bbox ± 40) 픽셀 차. diff_frac = 밝기 차 > 8(AA 요동 위)인 픽셀 비율 · mean_abs = 평균 절대차 · ink_a/ink_b = 각 스냅의 잉크 픽셀 수(종이보다 12 어두움). 줌은 휠(커서 중심 — 앱 경로)로 목표 0.5·1·4에 ±8% 안(뷰는 조합마다 {s 1, ox 0, oy 0}으로 초기화 후 그 면 중심 커서로 줌). 면 둘 = 벽(400×280급 · 정면) · 바닥(모로 보임 — 원근 단축). primed = 상자 밖 점 하나로 면을 먼저 «칠한 면» 상태로 둔다(면 재질 전환(48-9)이 상자 전체를 갈리게 하는 것을 뺀다 — 엔진의 차만 남긴다)',
    rows,
  }
})

test('② 자기 교차 — 한 획이 자기 자신과 교차하는 창의 잉크 / 몸통 창(도구 넷)', async ({ page }) => {
  await bigBox(page, false)
  const Y: Record<Instr, number> = { brush: 370, marker: 430, cp: 490, pencil: 550 }
  const rows: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    await pickInstr(page, ins, 20)
    const y = Y[ins]
    // A(580,y) → B(780,y) → C(780,y−28) → D(580,y+28): 교차점 (680,y) · 각 ~38°
    await page.mouse.move(580, y)
    await page.mouse.down()
    await page.mouse.move(680, y, { steps: 5 })
    await page.mouse.move(780, y, { steps: 5 })
    await page.mouse.move(780, y - 28, { steps: 2 })
    await page.mouse.move(680, y, { steps: 5 })
    await page.mouse.move(580, y + 28, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const W = 20
    const cross = await inkMass(page, 680 - W / 2, y - W / 2, 680 + W / 2, y + W / 2)
    const bodyL = await inkMass(page, 600 - W / 2, y - W / 2, 600 + W / 2, y + W / 2)
    const bodyR = await inkMass(page, 760 - W / 2, y - W / 2, 760 + W / 2, y + W / 2)
    const body = (bodyL + bodyR) / 2
    rows[ins] = { cross, body_l: bodyL, body_r: bodyR, cross_over_body: body > 1e-9 ? +(cross / body).toFixed(4) : null }
    expect(body, ins + ' — 몸통에 잉크가 있다').toBeGreaterThan(100)
  }
  OUT.self_cross = {
    def: '굵기 20의 한 획이 (680,y)에서 자기 자신과 ~38°로 교차한다. 창은 굵기 폭(20×20 css) — 교차 창 잉크 ÷ 몸통 창 둘(600·760 · 사선에서 12px 넘게 떨어짐)의 평균. 획 «안» 누적이 있으면 > 1(도장 알파의 1−(1−a)^n). 마커는 canvas stroke() 한 번이라 구성상 1 대역이 예상(D-4: 46 「겹치면 진해진다」는 획 «사이»의 계약 — 값이 가른다)',
    rows,
  }
})

test('③ 끝점 — 시작·중간·끝 대역의 단위 길이당 잉크(감속 몸짓 · 도구 넷)', async ({ page }) => {
  await bigBox(page, false)
  const X0 = 540, X1 = 860
  const Y: Record<Instr, number> = { brush: 380, marker: 440, cp: 500, pencil: 560 }
  const rows: Record<string, unknown> = {}
  for (const ins of INSTRS) {
    await pickInstr(page, ins, 20)
    await slowFastSlow(page, X0, Y[ins], X1)
  }
  await page.waitForTimeout(200)
  for (const ins of INSTRS) {
    const y = Y[ins], h = 26
    const seg = (a: number, b: number) => [X0 + (X1 - X0) * a, y - h / 2, X0 + (X1 - X0) * b, y + h / 2] as const
    // 안쪽 대역(mark58 게이트 ①의 그 대역 — 포함 끝점 양자화를 밖에 둔다)
    const start = await inkMass(page, ...seg(0.03, 0.28))
    const mid = await inkMass(page, ...seg(0.375, 0.625))
    const end = await inkMass(page, ...seg(0.72, 0.97))
    rows[ins] = { start, mid, end, start_over_mid: +(start / Math.max(1e-9, mid)).toFixed(4), end_over_mid: +(end / Math.max(1e-9, mid)).toFixed(4) }
    expect(mid, ins + ' — 몸통에 잉크가 있다').toBeGreaterThan(100)
  }
  OUT.ends = {
    def: '감속 몸짓(처음·끝 15% 잘게) 획의 안쪽 대역(3~28% · 37.5~62.5% · 72~97% — 같은 폭 25%)의 어둡기 합. 분모 mid(#11). mark58 게이트 ①의 자 그대로(#54) — 이 라운드는 그 위에 «획 안 누적 제거»가 대역 값을 어떻게 움직이는지 본다',
    rows,
  }
})

test('④ 결의 위상 — 도장 위상만 반 간격 어긋난 두 획의 픽셀 상관(연필 · 자기 반복 대조)', async ({ page }) => {
  await bigBox(page, false)
  await pickInstr(page, 'pencil', 20, '#3a6b35')
  const y = 500
  const strokeAt = async (x0: number) => {
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let k = 1; k <= 14; k++) await page.mouse.move(x0 + 280 * (k / 14), y)
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  // 창은 가운데 200px(양 끝 40px 밖 — 시작점 어긋남의 끝 효과를 뺀다)
  await strokeAt(560)
  await darkMap(page, 'A', 600, y - 14, 200, 28)
  await undoPaint(page)
  await strokeAt(560)
  await darkMap(page, 'A2', 600, y - 14, 200, 28)
  await undoPaint(page)
  // 도장 간격 = 굵기 20 × spacingK 0.25 = 5px → 반 간격 2.5px 어긋남
  await strokeAt(562.5)
  await darkMap(page, 'B', 600, y - 14, 200, 28)
  await undoPaint(page)
  const same = await corrMaps(page, 'A', 'A2')
  const phase = await corrMaps(page, 'A', 'B')
  OUT.grain_phase = {
    def: '연필(굵기 20 · 간격 0.25w = 5px) 수평 획 두 개 — 같은 자리(A·A2 — 결정론 대조: 1이어야 한다 #5)와 시작 x가 2.5px(반 간격) 어긋난 B. 가운데 200×28 css 창의 어둡기 지도 피어슨 상관. 결이 도장마다면 위상 이동이 도장의 결 칸을 바꿔 상관이 떨어지고, 결이 면 고정 마스크면 도장 위상은 결에 안 실려 상관이 높다. 판별 값은 corr_phase — 수리 전/후 비교',
    corr_same: same, corr_phase: phase,
  }
  expect(same.corr, '같은 획 두 번 = 같은 픽셀(결정론)').toBeGreaterThan(0.99)
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
  expect(on.n, 'coalesced로 점이 실제로 는다').toBeGreaterThan(off.n)
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
    for (let i = 1; i <= 40; i++) {
      const t0 = performance.now()
      ev('pointermove', 540 + i * 8, 400 + Math.sin(i / 6) * 40)
      await raf()
      dts.push(performance.now() - t0)
    }
    ev('pointerup', 540 + 40 * 8, 400 + Math.sin(40 / 6) * 40)
    await raf()
    cv.setPointerCapture = keep
    const fc = w.__b2.diag.frameCost?.() ?? null
    dts.sort((a, b) => a - b)
    return { median: +dts[Math.floor(dts.length / 2)]!.toFixed(2), p90: +dts[Math.floor(dts.length * 0.9)]!.toFixed(2), max: +dts[dts.length - 1]!.toFixed(2), frame_cost: fc }
  })
  const idle1 = await idle()
  const idle2 = await idle()
  await page.evaluate(() => (window as any).__b2.diag.frameCostReset?.())
  const draft = await drafting()
  await page.waitForTimeout(300)
  const paintN2 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.filter((s: any) => s.paint !== undefined).length)
  OUT.perf = {
    def: '면 faceN(paint50 픽스처 그대로 — 스무 면 목표에 셋 모자란다 · note_89 준용) · 칠 40붓(연필 12px) 장면. idle = invalidate 40프레임의 rAF 간격(중앙·p90 · 두 번 — 잡음 바닥) · drafting = 합성 pointermove 40회(각각 다음 rAF까지 ms — «그리는 중» 한 프레임의 벽시계)와 그동안의 frameCost(r3 = render3d · d2 = draw2d 중앙값). placed_after = 합성 획이 실제로 커밋됐는가(입력 경로 무변의 증거)',
    faces: faceN, paint_strokes: paintN, placed_after: paintN2 - paintN,
    textures: texes.length, bytes_total: bytes, levels: texes.map((t: any) => t.level),
    idle_ms: idle1, idle2_ms: idle2, noise_floor_ms: +Math.abs(idle2.median - idle1.median).toFixed(2),
    drafting_ms: draft,
  }
  expect(paintN, '칠이 실제로 여러 획 얹혔다').toBeGreaterThanOrEqual(30)
  expect(paintN2 - paintN, '합성 획이 실제로 커밋됐다(입력 경로 살아 있음)').toBeGreaterThanOrEqual(1)
})
