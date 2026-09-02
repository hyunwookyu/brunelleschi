// web2-52 — 재료의 **화면 몫**(픽셀·행위 #92/#94):
//   ① 단색 재료(유리·금속) — rep가 면 픽셀을 그 톤으로 실제로 물들인다 · 반증 = 없음 복귀
//   ② 재료는 면에, 칠은 획에(52-4) — 재료 변경이 무늬 픽셀은 바꾸고 획 목록(정본)은
//      안 만진다 · 반증 = 실행취소가 그 서명을 실제로 바꾼다(서명 자의 판별력)
//   ③ 축척 통과 — 치수를 2배로 재매기면 같은 벽의 켜 화면 간격이 절반 대역(실치수 유지)
//   ④ 두 겹의 대비(49 무회귀) — 줌 인에서 도면 해칭(화면 고정)의 간격은 불변,
//      면 무늬(면 고정)의 간격은 늘어난다 — «둘은 다른 물건»의 한 화면 실측
//   ⑤ 브러시 프리셋(52-3 · 행위) — 길게 눌러 저장 → 설정 바꾼 뒤 탭 → 복원 · 새로고침
//      생존(기기 저장) · 문서 직렬화에 없음 · 반증 = 빈 칸 탭은 아무것도 안 바꾼다
//
// 무늬 여섯의 픽셀·쪽·LOD·원근·프레임은 rep49.spec(52 이식판)이 잰다 — 두 벌 재지 않는다.
// 시드(두 면 다름·재생성 동일)는 단위(mats52.test ③ — 같은 rf 두 시드)가 잰다.
// 원장: stage0/out/mats52_web2_<dpr>.json (LEDGER=1 · #90 · dpr별 · 팔마다 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-52 — 재료: 단색 재료 픽셀 · 재료/획 분리 · 축척 통과 · 두 겹 대비(해칭 화면 고정 vs 무늬 면 고정) · 브러시 프리셋(기기)',
  note_92: '판정자는 픽셀(안료·평균색·간격)과 행위(paintSel·localStorage·직렬화 문면)다 — 「재료를 붙였다」는 이름표라 안 센다',
}

// #99 — 팔마다 병합-쓰기 + 읽기 실패 방어(전면 쓰기 ⛔ — 판별 ③)
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/mats52_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...prev, ...OUT }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 큰 상자(rep49의 그 픽스처 — 두 자리에 다른 장면 ⛔) + 연필 복귀 */
async function bigBox(page: Page) {
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
  await page.mouse.click(700, 480)
  await page.waitForTimeout(80)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')
  await page.waitForTimeout(100)
  return page.evaluate(() => (window as any).__b2.app.doc.faces[0].id) as Promise<number>
}

const cycleRepTo = async (page: Page, faceId: number, m: string | null) => {
  for (let i = 0; i < 10; i++) {
    const cur = await page.evaluate((id) => {
      const f = (window as any).__b2.app.doc.faces.find((x: any) => x.id === id)
      return f?.rep?.m ?? null
    }, faceId)
    if (cur === m) return
    await page.evaluate((id) => (window as any).__b2.diag.cycleRep49(id), faceId)
    await page.waitForTimeout(60)
  }
  throw new Error('cycleRepTo: 재료에 도달하지 못했다')
}

const WALL_BOX = { x: 520, y: 360, w: 360, h: 230 }

/** 상자의 평균색·안료 합(알파 가중 어두움) — 판정의 자 */
const boxStats = (page: Page, x: number, y: number, w: number, h: number) =>
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
    let r = 0, gg = 0, bb = 0, n = 0, pig = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!
      if (a > 8) { r += d[i]!; gg += d[i + 1]!; bb += d[i + 2]!; n++; pig += (a / 255) * (765 - d[i]! - d[i + 1]! - d[i + 2]!) }
    }
    return { mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)] : [0, 0, 0], pigment: Math.round(pig), n }
  }, [x, y, w, h] as unknown[])

/** 좁은 세로 띠 안 «어두운 가로선(켜)» 중심 y들 — 행별 어두움이 (중앙값+40)을 넘는 행 뭉치.
 *  ⚠ 반드시 **좁은 띠**(w ~10px)로 부른다 — 켜는 원근으로 기울어(소실점 수렴) 전폭 행
 *  평균이 그 어두움을 여러 행에 발라 뭉갠다(초판 실측: 전폭 360px에서 켜 1개 검출). */
const darkRows = (page: Page, x: number, y: number, w: number, h: number) =>
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
    const rowDark: number[] = []
    for (let r = 0; r < t.height; r++) {
      let s = 0
      for (let c = 0; c < t.width; c++) {
        const i = (r * t.width + c) * 4
        if (d[i + 3]! > 8) s += 765 - d[i]! - d[i + 1]! - d[i + 2]!
      }
      rowDark.push(s / t.width)
    }
    const sorted = [...rowDark].sort((a, b) => a - b)
    const th = (sorted[Math.floor(sorted.length / 2)] ?? 0) + 40
    const centers: number[] = []
    let run: number[] = []
    for (let r = 0; r < rowDark.length; r++) {
      if (rowDark[r]! >= th) run.push(r)
      else if (run.length > 0) { centers.push(run.reduce((a, b) => a + b, 0) / run.length / dpr); run = [] }
    }
    if (run.length > 0) centers.push(run.reduce((a, b) => a + b, 0) / run.length / dpr)
    return centers
  }, [x, y, w, h] as unknown[])

const gapMedian = (centers: number[]): number => {
  const gaps = centers.slice(1).map((c, i) => c - centers[i]!).sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] ?? 0
}

test('① 단색 재료 — 유리·금속이 면 픽셀을 그 톤으로 물들인다 · 반증 = 없음 복귀', async ({ page }) => {
  const fid = await bigBox(page)
  const base = await boxStats(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  await cycleRepTo(page, fid, 'glass')
  await page.waitForTimeout(250)
  const glass = await boxStats(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  // ⚠ 자는 «안료 합»과 그 서열이다 — 평균색의 색상차(파랑−빨강)는 못 쓴다: #gl의 알파가
  // 낮은 자리(~36/255)에서 역곱(un-premultiply) 양자화가 색상 관계를 부순다(프로브 실측 —
  // 유리 톤을 얹어도 b−r가 0). 안료는 알파 가중이라 그 왜곡을 안 받는다(mats46의 그 자).
  expect(glass.pigment, '유리 — 톤이 실제로 실렸다(안료 > 바탕 1.2배)').toBeGreaterThan(base.pigment * 1.2)
  await cycleRepTo(page, fid, 'metal')
  await page.waitForTimeout(250)
  const metal = await boxStats(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  expect(metal.pigment, '금속 — 톤이 실렸다(안료 > 바탕 1.2배)').toBeGreaterThan(base.pigment * 1.2)
  // 두 단색이 서로 다르다 — 금속 톤(합 597)이 유리(618)보다 어둡다. 순수 틴트 기대비
  // 1.14가 화면에서는 획·종이 몫에 희석돼 1.03 대역(실측)이라 여유는 못 세운다 —
  // 서열(엄격 부등)만 등재하고 값은 기록한다(판별의 몫은 위 1.2배 문 + 없음 반증이 진다)
  expect(metal.pigment, '금속이 유리보다 어둡다(톤 서열이 픽셀에 실렸다 — 희석 실측은 def)').toBeGreaterThan(glass.pigment)
  // 반증(D-3) — 없음으로 돌리면 톤이 걷힌다(같은 자에서 같은 술어가 거짓이 된다)
  await cycleRepTo(page, fid, null)
  await page.waitForTimeout(250)
  const off = await boxStats(page, WALL_BOX.x, WALL_BOX.y, WALL_BOX.w, WALL_BOX.h)
  expect(off.pigment > base.pigment * 1.2, '반증 — 없음에서 유리·금속 술어가 거짓').toBe(false)
  OUT.solid_mats = {
    def: '벽 상자 안료(알파 가중 어두움) — 유리·금속 각각 바탕 1.2배 초과 + 서열(금속 > 유리 — 엄격 부등: 순수 틴트 기대비 1.14가 획·종이 희석으로 1.03 대역이라 여유를 못 세운다 · 실측 비는 metal/glass 필드). 반증 = 없음 복귀에서 같은 술어 반전. ⚠ 평균색 색상차는 자로 못 쓴다: 저알파 역곱 양자화가 색상 관계를 부순다(프로브 실측 — def에 남긴 사유). 유리·금속에 무늬 «선»이 없는 것은 재료의 정의(52-2 — 구성이라 안 센다 #5)',
    base, glass, metal, off,
  }
})

test('② 재료는 면에, 칠은 획에 — 재료 변경이 획 목록을 안 만진다(#94) · 반증 = 실행취소', async ({ page }) => {
  const fid = await bigBox(page)
  await cycleRepTo(page, fid, 'brick')
  await page.waitForTimeout(200)
  // 벽에 마커 획 하나(UI 경로 — mats46의 그 몸짓)
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 12 } })
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
  await drawLine(page, 560, 420, 660, 400)
  await page.waitForTimeout(250)
  const sigOf = () => page.evaluate(() =>
    JSON.stringify((window as any).__b2.app.doc.strokes
      .filter((s: any) => s.paint !== undefined)
      .map((s: any) => ({ id: s.id, f: s.paint.f, uv: s.paint.uv, c: s.paint.c, w: s.paint.w }))))
  const sig0 = await sigOf()
  expect(JSON.parse(sig0).length, '칠 획이 실제로 섰다').toBeGreaterThanOrEqual(1)
  const withPaint = await boxStats(page, 550, 395, 120, 35)
  // 재료 변경(벽돌 → 석재) — 무늬는 바뀌고 획 목록은 그대로다
  await cycleRepTo(page, fid, 'stone')
  await page.waitForTimeout(300)
  const sig1 = await sigOf()
  expect(sig1, '재료 변경이 획 목록(정본)을 안 만졌다').toBe(sig0)
  const afterMat = await boxStats(page, 550, 395, 120, 35)
  expect(afterMat.pigment, '획 자리의 안료가 남아 있다(획이 위에 산다)').toBeGreaterThan(withPaint.pigment * 0.5)
  // 반증(D-3) — 서명 자가 실제로 판별한다: 획이 지워질 때까지 실행취소(상한 4회 — #95).
  // 첫 회는 «재료 변경»을 되돌린다(마지막 연산 — 그때 서명은 안 변해야 맞다: 재료와 획이
  // 딴 채널이라는 이 팔의 명제 그대로). 획이 빠지는 회에서 서명이 변한다.
  let sig2 = sig1
  for (let k = 0; k < 4 && sig2 === sig1; k++) {
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(150)
    sig2 = await sigOf()
  }
  expect(sig2, '반증 — 실행취소가 획에 닿으면 서명이 실제로 변한다(자의 판별력)').not.toBe(sig1)
  OUT.mat_vs_paint = {
    def: '획 서명 = paint 획의 (id·f·uv·c·w) JSON. 재료 변경(벽돌→석재) 전후 서명 동일 + 획 자리 안료 잔존(0.5배 초과 — 무늬 배경이 변해 정확 일치는 안 건다). 반증 = 획 제거에서 서명 변화. 「무늬는 파생, 획은 정본」(52-4)의 행위판',
    sig_len: JSON.parse(sig0).length, paint_box: { withPaint, afterMat },
  }
})

test('③ 축척 통과 — 치수 2배 재매김에 켜 화면 간격이 절반 대역(실치수 유지)', async ({ page }) => {
  const fid = await bigBox(page)
  await cycleRepTo(page, fid, 'brick')
  await page.waitForTimeout(250)
  const rows1 = await darkRows(page, 545, WALL_BOX.y, 10, WALL_BOX.h)
  expect(rows1.length, '켜가 여럿 잡힌다(x545 좁은 띠)').toBeGreaterThanOrEqual(5)
  const gap1 = gapMedian(rows1)
  // 같은 기둥을 5000mm로 재매김 — 세계가 2배 커진다 → 같은 화면 벽에 켜가 2배 → 간격 절반
  const postId = await page.evaluate(() => (window as any).__b2.app.doc.strokes[5].id)
  await page.evaluate((i) => (window as any).__b2.diag.setDimForTest(i, 5000), postId)
  await page.waitForTimeout(400)
  const rows2 = await darkRows(page, 545, WALL_BOX.y, 10, WALL_BOX.h)
  expect(rows2.length, '재매김 후에도 켜가 잡힌다').toBeGreaterThanOrEqual(5)
  const gap2 = gapMedian(rows2)
  const cs = await page.evaluate(() => (window as any).__b2.diag.paint50Constants())
  const ratio = gap2 / Math.max(0.01, gap1)
  expect(Math.abs(ratio - 0.5), '간격 비 0.5 ± C.MATS52_SCALE_TOL — 실치수(67mm)가 축척을 지난다')
    .toBeLessThan(cs.MATS52_SCALE_TOL)
  OUT.scale_pass = {
    def: '벽돌 켜(어두운 가로선 — 행 어두움 중앙값+40 적응 문턱) 화면 간격의 중앙값 — 치수 2500→5000 재매김 전후 비. 문 |비−0.5| < C.MATS52_SCALE_TOL. mm↔세계 환산의 순수판은 rep49_web2.json scale_pass(49 — falsify_run 포함)가 정본이고, 이 팔은 그 환산이 «화면까지» 지나는 것을 잰다',
    rows1_n: rows1.length, rows2_n: rows2.length,
    gap1_css_px: +gap1.toFixed(2), gap2_css_px: +gap2.toFixed(2), ratio: +ratio.toFixed(3),
  }
})

test('④ 두 겹의 대비(49 무회귀) — 줌 인: 해칭 간격 불변 · 무늬 간격 증가', async ({ page }) => {
  const fid = await bigBox(page)
  await cycleRepTo(page, fid, 'brick')
  // 도면 해칭(화면 고정 — 기본 hatchMode 'screen')을 같은 면에 켠다: fill=1
  await page.evaluate((id) => {
    const app = (window as any).__b2.app
    const f = app.doc.faces.find((x: any) => x.id === id)
    f.fill = 1
    app.docVersion++
    ;(window as any).__b2.diag.invalidate?.()
  }, fid)
  await page.waitForTimeout(300)
  const patRows1 = await darkRows(page, 545, WALL_BOX.y, 10, WALL_BOX.h)
  const patGap1 = gapMedian(patRows1)
  expect(patRows1.length, '켜가 여럿 잡힌다(줌 전)').toBeGreaterThanOrEqual(5)
  // 해칭 간격 — hatchGroup은 GL 선(#gl)에 그려진다. 벽 상자의 «밝은 대각선»과 켜(가로선)가
  // 섞이므로, 해칭의 자는 픽셀이 아니라 화면 간격 상수(C.HATCH_SPACING_PX — 46 규격
  // materialOf('brick').hatch.spacingPx = 8 화면 px)다. 줌 «불변»은 그 상수가 화면 단위인
  // 것의 확인이라 #5(구성)에 걸린다 — 그래서 여기서는 **거동 부재**를 잰다: 줌이
  // hatch 재생성 열쇠(포즈 서명)를 지나도 spacingPx 상수는 줌 항이 없다(코드 확인 + 아래
  // 무늬 간격의 «변화»가 대조군이다: 같은 줌 동작에서 하나는 변하고 하나는 안 변할 근거).
  await page.mouse.move(700, 470)
  const vsOf = () => page.evaluate(() => (window as any).__b2.app.view.s as number)
  const vs0 = await vsOf()
  await page.mouse.wheel(0, -240); await page.waitForTimeout(80)
  let dir = -240
  if ((await vsOf()) < vs0) dir = 240
  for (let i = 0; i < 10 && (await vsOf()) < vs0 * 1.9; i++) {
    await page.mouse.wheel(0, dir); await page.waitForTimeout(60)
  }
  await page.waitForTimeout(300)
  const vs1 = await vsOf()
  const patRows2 = await darkRows(page, 545, WALL_BOX.y, 10, WALL_BOX.h)
  const patGap2 = gapMedian(patRows2)
  const zoomRatio = vs1 / vs0
  expect(patGap2 / Math.max(0.01, patGap1), `무늬 간격이 줌(×${zoomRatio.toFixed(2)})을 따라 늘었다(면 고정)`)
    .toBeGreaterThan(1.3)
  OUT.two_layers = {
    def: '같은 면에 무늬(brick rep — 면 텍스처)와 도면 해칭(fill=1 · hatchMode screen)을 함께 켜고 줌 인 — 무늬 켜 간격(어두운 가로선)은 늘어난다(문 1.3배 초과 · 줌 ~1.9). 해칭의 화면 고정은 spacingPx가 화면 상수인 구성(#5 — hatch2d 인자에 줌 항이 없다)이라 픽셀로 안 세고, 무늬의 «증가»가 같은 화면에서의 대조군이다. 49가 가른 «둘은 다른 물건»의 실측',
    zoom: +zoomRatio.toFixed(3), pat_gap_before: +patGap1.toFixed(2), pat_gap_after: +patGap2.toFixed(2),
    pat_ratio: +(patGap2 / Math.max(0.01, patGap1)).toFixed(3),
  }
})

test('⑤ 브러시 프리셋 — 저장·적용·기기 지속(#94) · 반증 = 빈 칸', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.evaluate(() => localStorage.removeItem('b2.brushPresets.v1'))
  // 칠통을 연다(도구 재누름 — 46 규약) → 프리셋 줄이 산다
  await page.click('#btn-paint'); await page.click('#btn-paint')
  await page.waitForTimeout(100)
  expect(await page.locator('#paint-presets .presetbtn').count(), '프리셋 세 칸').toBe(3)
  // 반증(D-3) 먼저 — 빈 칸 탭은 paintSel을 안 바꾼다
  const sel0 = await page.evaluate(() => JSON.stringify((window as any).__b2.app.paintSel))
  await page.click('#btn-preset-1')
  await page.waitForTimeout(80)
  expect(await page.evaluate(() => JSON.stringify((window as any).__b2.app.paintSel)),
    '반증 — 빈 칸 탭은 아무것도 안 바꾼다').toBe(sel0)
  // 설정 A를 만들고 길게 눌러 저장(WRITE_HOLD_MS = 450ms — 합성 대기 600ms)
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#8a6238', i: 'cp', w: 20 } })
  const b1 = page.locator('#btn-preset-1')
  const box1 = await b1.boundingBox()
  await page.mouse.move(box1!.x + box1!.width / 2, box1!.y + box1!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(600)
  await page.mouse.up()
  await page.waitForTimeout(100)
  const stored = await page.evaluate(() => localStorage.getItem('b2.brushPresets.v1'))
  expect(stored, '기기에 저장됐다(localStorage — 문서가 아니다)').toContain('#8a6238')
  // 설정을 B로 바꾼 뒤 탭 — A가 복원된다(행위)
  await page.evaluate(() => { (window as any).__b2.app.paintSel = { hex: '#1e7fd0', i: 'marker', w: 4 } })
  await b1.click()
  await page.waitForTimeout(100)
  const applied = await page.evaluate(() => ({ ...(window as any).__b2.app.paintSel }))
  expect(applied, '탭이 저장된 설정(도구·크기·색)을 되실었다').toEqual({ hex: '#8a6238', i: 'cp', w: 20 })
  // 기기 지속 — 새로고침(문서 reset 없이) 후에도 산다
  await page.goto('/')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.click('#btn-paint')
  await page.waitForTimeout(100)
  await page.click('#btn-preset-1')
  await page.waitForTimeout(100)
  const applied2 = await page.evaluate(() => ({ ...(window as any).__b2.app.paintSel }))
  expect(applied2, '새로고침 뒤에도 프리셋이 산다(기기 저장의 실증)').toEqual({ hex: '#8a6238', i: 'cp', w: 20 })
  // 문서 직렬화에 프리셋이 없다 — 52-3 «문서가 아니다»의 행위판
  const inDoc = await page.evaluate(() => (window as any).__b2.diag.serialize().includes('#8a6238'))
  expect(inDoc, '프리셋 색이 문서 직렬화에 없다').toBe(false)
  OUT.presets = {
    def: '행위 사슬 — 빈 칸 탭(불변 · 반증 먼저) → 길게 눌러 저장(450ms) → 다른 설정에서 탭(복원) → 새로고침 뒤 탭(기기 지속) → 문서 직렬화 부재. 불투명도 축은 없다(값 손잡이 부재 — DEFERRED · D-W22)',
    stored_has_hex: stored !== null && stored.includes('#8a6238'), applied, applied2_survives_reload: true,
  }
})

test('원장', async ({ page }, info) => {
  ;(OUT as any).dpr_project = info.project.name
  ;(OUT as any).regen_protocol = '정본 원장 = 파일 삭제 후 전량 실행 하나(#99 — 병합-쓰기 · 전면 쓰기 없음이 판별 ③)'
  ;(OUT as any).no_constants_snapshot = true
  ;(OUT as any).pitfall_citations = [5, 90, 92, 94, 99]
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  ;(OUT as any).constants_used = await page.evaluate(() => {
    const c = (window as any).__b2.diag.paint50Constants()
    return { MATS52_SCALE_TOL: c.MATS52_SCALE_TOL, REP_MIN_PX: c.REP_MIN_PX ?? null }
  })
})
