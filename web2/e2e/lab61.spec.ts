// web2-61 — 브러시 작업대 판갈이 게이트(quality60 ⑥의 후계 — 옛 판은 BrushDef 손잡이 23,
// 새 판은 «엔진 매개변수»다: 61 지시 「손잡이는 p5.brush의 매개변수에 붙는다 ·
// 값 꺼내기·가져온다·굳힌다는 그대로 산다」).
//
//   ① 열린다(설정 서랍 → btn-tunelab) · 도구 넷 · 브러시 후보 단추 · 손잡이(params 데이터).
//   ② 손잡이가 자국을 실제로 바꾼다 — 제품 자국(markSample — 이음매 #54)의 해시가 갈리고,
//      「기본값」이 원래 해시로 되돌린다(반증 — 되돌림이 안 되면 손잡이가 세션에 눌러앉는다).
//   ③ 브러시 선택이 자국을 바꾼다(마커: marker61 ↔ marker46).
//   ④ 값 꺼내기 → JSON · 가져온다 → 같은 값 · 굳힌다 → 기기(localStorage).
//
// 원장: stage0/out/lab61_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-61 — 작업대(엔진 매개변수 판): 열림 · 손잡이→자국 · 브러시 선택 · 꺼내기/가져오기/굳힌다',
  note_pitfalls: '#103(자국 해시는 markSample — 호출마다 새 캔버스) · #102(?reset 시험당 1회) · #99(병합-쓰기) · #101(web2 러너)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/lab61_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { /* 첫 실행 */ }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/lab61.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

async function openLab(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const d = document.getElementById('btn-tunelab')?.closest('details') as HTMLDetailsElement | null
    if (d) d.open = true
  })
  await page.waitForTimeout(100)
  await page.click('#btn-tunelab')
  await page.waitForTimeout(200)
  const open = await page.evaluate(() => !(document.getElementById('tunelab') as HTMLElement).hidden)
  expect(open, '작업대가 열렸다').toBe(true)
}

/** 제품 자국의 해시(이음매 markSample — 작업대가 바꾼 값이 제품 함수에 실리는가 #54).
 *  **두 번 긋고 둘째를 쓴다**(정상상태): marker46(markerTip 켬 — 라이브러리 팁 경로)은
 *  «브러시 변경 직후 첫 그리기»가 직전 이력에 민감하고 둘째부터 수렴한다(실측 —
 *  h1a 71732076·903431147(이력별) → h1b/h2b 2003855838 수렴). 제품 기본(marker61 ·
 *  팁 끔)은 첫 그리기부터 결정론이다(h0 == hr 실측) — 이 민감성은 실험실 후보 팔의
 *  것이라 자를 정상상태에 둔다. */
const markHash = async (page: Page, tool: string) => {
  await page.evaluate((t) => (window as any).__b2.diag.markSampleForTest(t, 'wave', 20), tool)
  return page.evaluate((t) => {
    const b2 = (window as any).__b2
    b2.diag.markSampleForTest(t, 'wave', 20)
    const m = (window as any).__m61 as { v: number[] }
    let h = 0
    for (let i = 0; i < m.v.length; i++) h = (Math.imul(h, 31) + Math.round(m.v[i]!)) | 0
    return h
  }, tool)
}

test('작업대 — 열림·손잡이·브러시 선택·값의 왕복', async ({ page }) => {
  test.setTimeout(120_000)
  await openLab(page)
  OUT.constants_snapshot = await page.evaluate(() => { const c = (window as any).__b2.diag.paint50Constants(); return { PAINT61_SIZE_TOL: c.PAINT61_SIZE_TOL } })
  // ① 구조 — 도구 넷 · 손잡이(엔진 params — 여섯) · 브러시 후보(연필 2B·HB·2H)
  const shape = await page.evaluate(() => ({
    picks: ['brush', 'marker', 'cp', 'pencil'].map(k => !!document.getElementById(`tunelab-pick-${k}`)),
    knobs: document.querySelectorAll('#tunelab-knobs input[type=range]').length,
    params: (window as any).__b2.diag.paintParamsForTest('pencil').map((p: any) => p.key),
  }))
  expect(shape.picks.every(Boolean), '도구 단추 넷').toBe(true)
  expect(shape.knobs, '손잡이 수 == 엔진 params 수').toBe(shape.params.length)
  await page.click('#tunelab-pick-pencil')
  await page.waitForTimeout(100)
  const brushBtns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#tunelab-brushes button')).map(b => (b as HTMLElement).title))
  // web2-62 판갈이: 후보는 p5 내장 셋이 아니라 mypaint 프리셋 196 전부다(단추는 짧은 이름 · 툴팁에 전체 이름)
  // web2-66 판갈이: 앱 프리셋이 둘이 됐다(64 colored_pencil + 66 brunelleschi/marker — 납작 촉)
  expect(brushBtns.length, '연필의 브러시 후보 — mypaint 196 전부 + 앱 프리셋 2(64 colored_pencil · 66 marker)').toBe(198)
  expect(brushBtns.some(t => t?.includes('classic/pencil')), '현행 기본(classic/pencil)이 후보 안').toBe(true)
  OUT.structure = { knobs: shape.knobs, params: shape.params, pencil_brush_candidates: brushBtns.length }

  // ② 손잡이 → 제품 자국(해시) · 「기본값」이 되돌린다(반증)
  const h0 = await markHash(page, 'pencil')
  await page.evaluate(() => {
    const r = document.getElementById('tunelab-k-opacityK') as HTMLInputElement
    r.value = '0.4'
    r.dispatchEvent(new Event('input', { bubbles: true }))
    r.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  const h1 = await markHash(page, 'pencil')
  await page.click('#tunelab-reset')
  await page.waitForTimeout(200)
  const h2 = await markHash(page, 'pencil')
  OUT.knob_effect = { h0, tuned: h1, reset: h2, changed: h0 !== h1, restored: h0 === h2 }
  expect(h0 !== h1, '불투명 배수 0.4 — 제품 자국이 갈린다').toBe(true)
  expect(h2, '기본값 — 원래 자국으로 되돌아온다(결정론)').toBe(h0)

  // ③ 브러시 선택(마커: marker61 기본 ↔ marker46) — 자국이 갈리고 도구 표찰이 산다
  await page.click('#tunelab-pick-marker')
  await page.waitForTimeout(100)
  const m0 = await markHash(page, 'marker')
  await page.click('#tunelab-b-classic\\/marker_small')       // 62: 끌 마커(elliptical 8)로 갈아 앉힌다
  await page.waitForTimeout(200)
  const m1 = await markHash(page, 'marker')
  OUT.brush_pick = { default_marker: m0, classic_marker_small: m1, changed: m0 !== m1, note: '기본 마커 = 엔진 DEFAULT_PRESET.marker(62: ramon/100%_Opaque)' }
  expect(m0 !== m1, 'classic/marker_small(끌) — 자국이 갈린다').toBe(true)

  // ④ 값 꺼내기 → JSON · 굳힌다 → 기기 · 가져온다 → 왕복
  await page.click('#tunelab-export')
  const json = await page.evaluate(() => (document.getElementById('tunelab-json') as HTMLTextAreaElement).value)
  const parsed = JSON.parse(json) as Record<string, { base?: string }>
  expect(parsed.marker?.base, '꺼낸 JSON에 마커 브러시 선택이 있다').toBe('classic/marker_small')
  await page.click('#tunelab-bake')
  const stored = await page.evaluate(() => localStorage.getItem('b2.paintTune61.v1'))
  expect(stored, '굳힌다 — 기기에 남는다').toBe(json)
  await page.click('#tunelab-reset')
  await page.waitForTimeout(100)
  await page.evaluate((j) => {
    const t = document.getElementById('tunelab-json') as HTMLTextAreaElement
    t.value = j
  }, json)
  await page.click('#tunelab-import')
  await page.waitForTimeout(200)
  const m2 = await markHash(page, 'marker')
  OUT.roundtrip = { json_len: json.length, stored_equal: stored === json, reimported: m2, matches_tuned: m2 === m1 }
  expect(m2, '가져온다 — 꺼낸 값이 같은 자국을 되만든다').toBe(m1)
})
