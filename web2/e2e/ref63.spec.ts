// web2-63 ⑤의 기준 — **62 엔진(팁 없음 · 61 값 잡음 결)의 자국 해시 원장**. 63이 팁 아틀라스를 끼워도
// 「팁 없는 브러시는 62와 픽셀이 같다」를 이 원장의 값과 대조한다(자기참조가 아니다 — 값은 63 이전 트리
// (main 1f912bf · 62 배포 트리와 엔진 동일)에서 떴고 63의 스펙은 그 파일을 읽기만 한다).
//
// ⚠ 이 스펙은 **REF63=1일 때만 원장을 쓴다**(그 밖에는 skip) — 밤·원장 실행이 기준을 덮어쓰면 ⑤가 항등이 된다.
//   기준을 다시 뜨는 것은 «엔진의 절차 경로를 일부러 바꿨을 때»뿐이고 그때는 커밋 메시지에 그 사유를 적는다.
//
// 해시 = 어둡기 지도(__m61.v · 0..255 정수)의 FNV-1a 32비트 · 자국 픽셀 수(> 8)도 함께(해시만 있으면 «무엇이 달랐나»를 못 읽는다).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 기준 원장(dpr1 하나 — 견본 판은 고정 px · dpr 무관(paint62 note_dpr)) */
export const REF63_LEDGER = resolve(HERE, '../../stage0/out/ref63_web2_dpr1.json')

/** 팁을 «안» 받는 프리셋(63의 기본 팁 표 밖 — 잉크·마커·에어브러시·둥근 붓) + 팁을 받는 슬롯 둘(연필·색연필 — 63이 팁 없음으로 되돌려 대조) */
export const REF63_ROWS: { key: string; tool: string; preset?: string; shape: 'line' | 'wave'; w: number }[] = [
  { key: 'liner_line', tool: 'brush', preset: 'deevad/liner', shape: 'line', w: 20 },
  { key: 'liner_wave', tool: 'brush', preset: 'deevad/liner', shape: 'wave', w: 20 },
  { key: 'opaque_marker_line', tool: 'marker', preset: 'ramon/100%_Opaque', shape: 'line', w: 20 },
  { key: 'pen_wave', tool: 'brush', preset: 'classic/pen', shape: 'wave', w: 20 },
  { key: 'airbrush_wave', tool: 'brush', preset: 'deevad/airbrush', shape: 'wave', w: 30 },
  { key: 'round1_wave', tool: 'brush', preset: 'Dieterle/Round#1', shape: 'wave', w: 24 },
  { key: 'pencil_slot_wave', tool: 'pencil', shape: 'wave', w: 20 },
  { key: 'cp_slot_wave', tool: 'cp', shape: 'wave', w: 20 },
]

export async function hashRows(page: Page, rows: typeof REF63_ROWS, ext: Record<string, unknown> = {}) {
  return page.evaluate(([rs, ex]) => {
    const b2 = (window as any).__b2
    const out: Record<string, { hash: number; ink: number }> = {}
    for (const r of rs as typeof REF63_ROWS) {
      b2.diag.markSampleForTest(r.tool, r.shape, r.w, 61, 480, 240, r.preset ? { preset: r.preset, ...(ex as object) } : { ...(ex as object) })
      const v = ((window as any).__m61 as { v: number[] }).v
      let h = 0x811c9dc5, ink = 0
      for (let i = 0; i < v.length; i++) { const q = Math.round(v[i]!); h = Math.imul(h ^ q, 0x01000193) >>> 0; if (q > 8) ink++ }
      out[r.key] = { hash: h, ink }
    }
    return out
  }, [rows, ext] as const)
}

test('62 기준 해시 — 팁 없는 자국의 어둡기 지도(REF63=1일 때만 원장을 쓴다)', async ({ page }, info) => {
  test.skip(process.env.REF63 !== '1', '기준 원장은 REF63=1로만 뜬다(밤·원장 실행이 기준을 덮지 않게)')
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  const id = await page.evaluate(() => (window as any).__b2.diag.paintRendererId())
  expect(id).toBe('mypaint')
  const a = await hashRows(page, REF63_ROWS)
  const b = await hashRows(page, REF63_ROWS)
  for (const r of REF63_ROWS) {
    expect(a[r.key]!.hash, `${r.key} 결정론(두 번 같은 해시)`).toBe(b[r.key]!.hash)
    expect(a[r.key]!.ink, `${r.key} 자국 실재`).toBeGreaterThan(200)
  }
  test.skip(info.project.name !== 'dpr1', '기준은 dpr1 하나')
  mkdirSync(dirname(REF63_LEDGER), { recursive: true })
  writeFileSync(REF63_LEDGER, JSON.stringify({
    conditions: { canonical: 'REF63=1 LEDGER=1 node tools/e2e.mjs ledger e2e/ref63.spec.ts --project=dpr1 (워커 1)' },
    what: '63 ⑤의 기준 — 62 엔진(절차 타원 도장 · 61 값 잡음 결 타일 · paperK 기본)의 자국 해시(FNV-1a 32) + 자국 픽셀 수(> 8). 63은 같은 행을 「팁 없음 + 61 결」로 다시 그려 해시가 같음을 단언하고, 「새 종이 결」에서는 다름을 기록한다',
    tree_note: '뜬 트리 = 63 갈래 첫 커밋(엔진은 main 1f912bf의 62 그대로 — src/mypaint 무변)',
    rows: a,
    row_defs: REF63_ROWS,
  }, null, 2))
})
