// web2-12 1번 — 재료 전수 팔: GRADES 일곱(2H·H·F·HB·B·2B·INK) 각각이
// 미리보기(긋는 중)·확정(뗀 직후) 둘 다에서 **합성 화면**(사람이 보는 것)에 남는가.
// brush·classic 두 렌더러 모두 돈다. dpr 둘은 프로젝트가 돈다.
//
// 왜 «합성 화면»인가(D-5 — e2e 116팔이 이 버그를 못 잡은 구멍 두 개를 막는다):
//   ① 종전 팔은 전부 «캔버스별 판독»(drawImage → getImageData)이었다 — 캔버스에는
//      그려졌는데 **합성에서 가려지는** 결함(#brushc의 규약 위반 알파가 만든 흰 장막)은
//      캔버스 판독으로는 영영 안 걸린다. 스크린샷만이 사람이 보는 것을 잰다.
//   ② 종전 팔은 기본 재료(HB)로만 그었다 — «재료 하나만 안 그려진다»는 재료축 전수만 잡는다.
//
// 확정 획은 **승격(lifted)** 조건으로 긋는다(앵커 획 위에서 세로로) — 대기(waiting) 획은
// ink 겹의 파선이 따로 그려서 버그가 있어도 보인다. 승격을 단언해 픽스처의 판별력을 지킨다.

import { test, expect, type Page } from '@playwright/test'
import { PIXEL_DIFF_CH, VISIBLE_FLOOR } from './thresholds'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

// 측정 원장(§5: 원장 밖 측정은 규칙이 있어도 안 걸린다) — **dpr 프로젝트마다 제 파일**을
// 쓴다(1차 리뷰어 [1]: 한 파일에 겹쳐 쓰면 뒤 실행이 앞을 덮어 4팔 중 절반의 값이 없다).
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/materials_visible_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-12 1번 — 재료 전수 가시성(합성 화면·${testInfo.project.name}): GRADES 일곱 × 렌더러 둘, 긋는 중/뗀 직후의 «기준 대비 달라진 픽셀 수». e2e materials.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: `20×60 CSS px 상자 스크린샷을 긋기 전 기준과 비교, 채널 차 ${PIXEL_DIFF_CH} 초과 픽셀 수(임계 출처는 e2e/thresholds.ts — D-C4). 문턱·하한의 동작점 성격은 AS-C37(스윕 없음 명기). ⚠ classic의 during 일곱 칸은 설계상 재료를 안 탄다(옛 미리보기 = 재료색 벡터선 — 변화 «수» 지표는 색·진하기에 둔감하다. 2차 [15]) — 그 다리의 판별력은 brush 절반에만 있다. classic 행의 ink_grain_*는 알파 몫 계기의 양성 대조군이다(2차 [9] — grain은 반투명이라 몫이 1보다 작아야 계기가 산 것).`,
    ...ledger,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 합성 화면의 상자를 픽셀 배열로 — 스크린샷(사람이 보는 것)을 그대로 읽는다 */
async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return [...g.getImageData(0, 0, c.width, c.height).data]
  }, buf.toString('base64'))
}

/** 기준(긋기 전) 대비 달라진 픽셀 수 — 채널 차 8 초과.
 *  «종이색과의 차»가 아니라 «변화»인 이유: 판정 대상이 「이 획이 화면에 나타났는가」이고,
 *  장막 결함(획이 겹 아래 덮임)은 변화 0으로 그대로 잡히면서, 옅은 재료(2H 알파 0.5)의
 *  AA 경계도 정직하게 세진다. 격자·지평선·이전 획은 기준에 이미 있어 상쇄된다.
 *  문턱 8: AA 가장자리(차 10~45)는 걸리고 압축·반올림 요동(±2)은 안 걸린다. */
function diffCount(base: number[], now: number[]): number {
  let n = 0
  for (let i = 0; i < base.length; i += 4) {
    if (Math.abs(now[i]! - base[i]!) > PIXEL_DIFF_CH || Math.abs(now[i + 1]! - base[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(now[i + 2]! - base[i + 2]!) > PIXEL_DIFF_CH) n++
  }
  return n
}

/** 픽스처 — 지평선(카메라) + 수평 앵커 획(승격된다). 각 재료 획은 앵커 위 점에서 세로로. */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

const GRADES = ['2H', 'H', 'F', 'HB', 'B', '2B', 'INK'] as const

/** 각 획의 «긋기 전 기준» 보관 — 시험 끝에 전 상자를 재확인한다(늦게 덮는 장막 탐지) */
let bases: { x: number; base: number[] }[] = []

/** 재료 g의 세로 획 하나 — 긋는 중·뗀 직후의 합성 픽셀 수와 승격 여부를 낸다 */
async function drawGrade(page: Page, g: string, x: number) {
  // 연필통(web2-12 6번) — 행이 도구이자 경도다
  await page.click(g === 'INK' ? '#btn-pen' : `#tray-${g}`)
  await settle(page)
  const base = await shot(page, x - 10, 480, 20, 60)
  await page.mouse.move(x, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, 560 - 9 * i)
  await settle(page)
  const during = diffCount(base, await shot(page, x - 10, 480, 20, 60))
  await page.mouse.up(); await settle(page)
  const after = diffCount(base, await shot(page, x - 10, 480, 20, 60))
  bases.push({ x, base })
  const lifted = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const id = a.doc.strokes[a.doc.strokes.length - 1].id
    return a.lift.lifted.has(id)
  })
  // 알파 몫(AS-C35의 표본 폭 — 1차 리뷰어 [14]): 획 상자의 painted 중 완전 불투명 몫.
  // brush 렌더러는 #brushc(질감), classic은 #ink(grain — **양성 대조군**: 반투명이라
  // 몫이 1보다 작아야 이 계기가 1이 아닌 값을 낼 수 있음이 선다. 2차 [9] · #30).
  const share = (id: string) => page.evaluate(([idv, bx, by]) => {
    const src = document.getElementById(idv as string) as HTMLCanvasElement
    if (!src) return null
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round(20 * dpr); t.height = Math.round(60 * dpr)
    const c = t.getContext('2d')!
    c.drawImage(src, Math.round((bx as number - 10) * dpr), Math.round((by as number) * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = c.getImageData(0, 0, t.width, t.height).data
    let painted = 0, opaque = 0
    for (let i = 3; i < d.length; i += 4) { if (d[i]! > 0) painted++; if (d[i]! === 255) opaque++ }
    return { painted, opaque }
  }, [id, x, 480])
  const alpha = await share('brushc')
  const inkAlpha = await share('ink')
  return { during, after, lifted, alpha, inkAlpha }
}

// 확정 획의 하한 20: 세로 60px 상자에서 가장 옅은 2H도 실측 40대(dpr1)다.
// 0이 아니라 20인 이유 — «몇 픽셀 얼룩»이 아니라 «선이 보인다»를 잰다.
const FLOOR = VISIBLE_FLOOR

for (const renderer of ['brush', 'classic'] as const) {
  test(`재료 전수(${renderer}) — 일곱 재료 전부: 긋는 중에도, 떼서 승격된 뒤에도 화면에 보인다`, async ({ page }) => {
    await boot(page)
    bases = []
    // 3-c: btn-brush는 설정 안 — DOM click(배선 동일)
    if (renderer === 'classic') { await page.evaluate(() => (document.getElementById('btn-brush') as HTMLButtonElement).click()); await settle(page) }
    await fixture(page)
    const out: string[] = []
    const rows: Record<string, Record<string, number>> = {}
    for (let i = 0; i < GRADES.length; i++) {
      const g = GRADES[i]!
      const x = 320 + i * 50
      const r = await drawGrade(page, g, x)
      out.push(`${g} 중${r.during} 후${r.after}${r.lifted ? '' : ' ⚠미승격'}`)
      rows[g] = { during: r.during, after: r.after,
        ...(renderer === 'brush' && r.alpha ? { brushc_painted: r.alpha.painted, brushc_opaque: r.alpha.opaque } : {}),
        ...(renderer === 'classic' && r.inkAlpha ? { ink_grain_painted: r.inkAlpha.painted, ink_grain_opaque: r.inkAlpha.opaque } : {}) }
      expect(r.lifted, `${g} 획이 승격돼야 픽스처가 판별력을 가진다`).toBe(true)
      expect(r.during, `${g} 긋는 중 보임`).toBeGreaterThan(FLOOR)
      expect(r.after, `${g} 뗀 직후 보임 — 여기서 0이면 «떼면 사라진다»의 재현이다`).toBeGreaterThan(FLOOR)
    }
    ledger[renderer] = rows
    console.log(`[측정] 재료 전수(${renderer}) — ${out.join(' · ')}`)
    // 겹이 «늦게» 화면을 덮으면(장막의 재발 형태 — 뒤 조작이 앞 획을 지운다) 여기서 잡힌다:
    // 시험 끝에 일곱 상자 전부를 제 «긋기 전 기준»과 다시 비교한다(획이 여전히 보인다).
    for (const { x, base } of bases) {
      expect(diffCount(base, await shot(page, x - 10, 480, 20, 60)),
        `x=${x} 획이 시험 끝에도 보인다`).toBeGreaterThan(FLOOR)
    }
  })
}

test('겹의 알파 규약 — #brushc는 straight(false), #gl은 premultiplied(true)다', async ({ page }) => {
  // 수리(withStraightAlpha)가 **그 캔버스에만** 걸렸는지의 직접 단언(1차 리뷰어 [8] — D-3:
  // 초기화 순서가 바뀌어 패치가 #gl로 새거나 #brushc에 안 걸리면 여기가 잡는다).
  await boot(page)
  const attrs = await page.evaluate(() => {
    const at = (id: string) => {
      const c = document.getElementById(id) as HTMLCanvasElement
      const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
      return g ? g.getContextAttributes()!.premultipliedAlpha : null
    }
    return { brushc: at('brushc'), gl: at('gl') }
  })
  console.log(`[측정] premultipliedAlpha — brushc ${attrs.brushc} · gl ${attrs.gl}`)
  expect(attrs.brushc).toBe(false)
  expect(attrs.gl).toBe(true)
})
