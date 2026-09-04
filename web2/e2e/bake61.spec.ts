// web2-61 ⚑ 「재서 정할 것 — 굽는 길」: p5.brush 오프스크린 굽기가 되는가 · 대상 전환이
// 안전한가(brushlayer와 싱글턴을 나눠 쓴다) · 비용(면 20 × 획 40 · 전환 1회).
// 지시 문면: 「되면 그대로 가고, 안 되면 멈추고 보고하라(사슬 멈춤 조건 ③)」 — 이 원장이 그 판정이다.
//
// 원장: stage0/out/bake61_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99 병합-쓰기)

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-61 ⚑ 굽는 길 — 오프스크린 p5.brush(1024 캔버스 · claim 전환): 자국 실재 · 결정론 · 전환 ms · 면 20×획 40 ms · 획별 옮김 ms · 자가 보정표',
  note_pitfalls: '#101(web2 러너) · #99(병합-쓰기) · #12(비용은 두 꼴(면당 1회·획당 1회) 다 잰다 — 동작점 하나가 아니다) · 프레임류 시간은 부하 조건부(59 이월 — 이 원장의 ms는 워커 1의 값)',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/bake61_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { /* 첫 실행 */ }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: { workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/bake61.spec.ts (워커 1 — #99)' },
    ...OUT,
  }, null, 2))
})

test('⚑ 굽는 길 — 실재·결정론·전환·비용', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  const r = await page.evaluate(() => (window as any).__b2.diag.p5probeForTest())
  OUT.probe = r
  // 판정 셋 — 사슬 멈춤 조건 ③의 술어(비용은 원장으로 남기고 문은 안 건다 — 59 이월: 시간은 부하 조건부)
  expect(r.markPx as number, '오프스크린 굽기의 자국이 대상 2D 캔버스에 실재한다').toBeGreaterThan(500)
  expect(r.deterministic, '같은 시드 → 같은 픽셀(Math.random ⛔ · §5)').toBe(true)
  expect((r.box as string[]).length, '내장 브러시 목록이 있다(D-4)').toBeGreaterThan(5)
})
