// web2-43 §0 — **지금 저장이 어디에 어떻게 되는가**를 값으로 낸다(고치기 전에 · D-2).
//
// 이 스펙은 수리가 아니라 **측정**이다. 43-5의 갈래(localStorage 유지 vs IndexedDB 이전)가
// 여기 나오는 두 수에서 갈린다:
//   ㉠ 이 브라우저의 **localStorage 실제 상한**(가정 5MB — AS-C80이 그동안 «알아낼 표준이
//      없다»로 두고 있던 값이다. 재면 된다)
//   ㉡ **썸네일 한 장의 바이트**(43-4가 문서마다 하나씩 굽는다) · 문서 하나의 바이트
//
// ⚠ 판정은 이 파일이 안 한다 — 수를 원장에 남기고 갈래는 NOTES에 적는다(#92: 재는 것과
//   그것이 무엇을 바꾸는가는 다른 물음이다).

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

test('§0 저장소 현황 — localStorage 실측 상한 · 썸네일 바이트 · 문서 바이트', async ({ page }, info) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })

  // ── ㉠ localStorage 실제 상한 ────────────────────────────────────────────
  // 64K 코드 유닛씩 채우다 QuotaExceededError가 날 때까지. 그 다음 이진 탐색으로
  // 마지막 칸을 좁힌다(1K 눈금). **다 채운 뒤 반드시 비운다** — 다음 팔이 못 쓰게 된다.
  const quota = await page.evaluate(() => {
    const CH = 64 * 1024                       // 코드 유닛(UTF-16)
    const blob = 'x'.repeat(CH)
    let n = 0
    let err = ''
    try {
      for (; n < 4096; n++) localStorage.setItem('q43-' + n, blob)   // 상한 256MB
    } catch (e) { err = (e as Error).name }
    let tail = 0
    if (err) {
      // 마지막 한 칸을 1K 눈금으로 좁힌다
      let lo = 0, hi = CH
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2 / 1024) * 1024
        if (mid === hi) break
        try { localStorage.setItem('q43-tail', 'x'.repeat(mid)); lo = mid } catch { hi = mid - 1024 }
      }
      tail = lo
    }
    const units = n * CH + tail
    // 열쇠 이름도 자리를 먹는다 — 그 몫을 함께 적는다(어림이 아니라 값으로)
    let keyUnits = 0
    for (let i = 0; i < localStorage.length; i++) keyUnits += (localStorage.key(i) ?? '').length
    const out = { chunks: n, tail_units: tail, value_units: units, key_units: keyUnits, error: err }
    try { localStorage.clear() } catch { /* 없음 */ }
    return out
  })
  expect(quota.error, '상한에 실제로 부딪혔다 — 안 부딪히면 이 수는 상한이 아니다').toBe('QuotaExceededError')

  // ── ㉡ 문서 하나 · 썸네일 한 장의 바이트 ──────────────────────────────────
  // 작도 셋 + 손 획 여남은의 «작은 문서». 자동 저장이 실제로 쓰는 그 문자열을 잰다.
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up()
  await page.mouse.move(300, 650); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(300 + 25 * i, 650 - 18 * i)
  await page.mouse.up()
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + 35 * i, 560)
  await page.mouse.up()
  for (let k = 0; k < 12; k++) {
    await page.mouse.move(300 + k * 20, 200); await page.mouse.down()
    for (let i = 1; i <= 20; i++) await page.mouse.move(300 + k * 20 + i * 4, 200 + i * 6)
    await page.mouse.up()
  }
  await page.waitForTimeout(600)   // 자동 저장 debounce(400ms)를 넘긴다

  const sizes = await page.evaluate(() => {
    const b = (window as any).__b2
    const auto = localStorage.getItem('b2-autosave2') ?? ''
    const thumb = b.diag.captureThumb ? b.diag.captureThumb() : null
    return {
      strokes: b.app.doc.strokes.length,
      autosave_units: auto.length,
      autosave_bytes_utf8: new TextEncoder().encode(auto).length,
      thumb_units: thumb ? thumb.length : null,
      thumb_bytes_utf8: thumb ? new TextEncoder().encode(thumb).length : null,
    }
  })

  // ── ㉢ IndexedDB 쪽 예산(참고) — navigator.storage.estimate() ─────────────
  const est = await page.evaluate(async () => {
    if (!navigator.storage?.estimate) return null
    const e = await navigator.storage.estimate()
    return { quota: e.quota ?? null, usage: e.usage ?? null }
  })

  const suffix = info.project.name === 'dpr2' ? '_dpr2' : ''
  const out = resolve(HERE, `../../stage0/out/store43_web2${suffix}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: 'web2-43 §0 — 저장소 현황 실측. localStorage 상한(실제로 부딪혀서) · 문서·썸네일 바이트 · storage.estimate.',
    run: { note: '정본 명령: LEDGER=1 npx playwright test store43 --workers=1', project: info.project.name },
    conditions: {
      browser: 'playwright chromium (playwright.config의 그것)',
      unit: 'units = UTF-16 코드 유닛(문자열 length) · bytes_utf8 = TextEncoder 바이트',
      note_quota: 'localStorage는 열쇠+값이 함께 예산을 먹는다 — key_units가 그 몫이다',
    },
    localstorage_limit: quota,
    doc: sizes,
    storage_estimate: est,
    assumed_limit_bytes: 5 * 1024 * 1024,
    flags_explained: {
      'value_units가 라운드 수': 'setItem을 64K 눈금으로 채우고 마지막 칸만 1K로 좁혔다 — 분해능이 1K다(상한 자체의 성질이 아니다)',
    },
  }, null, 2))
  console.log(`[43 §0] localStorage 상한 ${quota.value_units} units · 문서 ${sizes.autosave_units} units · 썸네일 ${sizes.thumb_units} units · estimate.quota ${est?.quota}`)
})
