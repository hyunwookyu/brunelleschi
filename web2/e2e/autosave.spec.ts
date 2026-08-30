// web2-22 3부 — **자동 저장이 조용히 차지 않게**. 쓰기 전에 바이트를 재고(상한 5MB
// «가정» — AS-C80), 임계(70%)를 넘으면 **실패 전에** 알린다. 실패 «후» 알림(종전
// autosaveWarned)은 그대로다(팔 ③ 회귀).
//
//   ① 큰 문서에서 %가 오른다(값으로)      ② 임계를 넘으면 미리 알림(작은 상한 주입)
//   ③ 실제 실패 시 종전 알림 그대로(회귀)  ④ 작은 문서에서는 아무것도 안 뜬다

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
}

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 자동 저장 디바운스(400ms)가 돌고 실측이 남을 때까지 */
const savedBytes = async (page: Page) => {
  await page.waitForFunction(() => (window as any).__b2.diag.autosaveLast() !== null, undefined, { timeout: 5000 })
  return page.evaluate(() => (window as any).__b2.diag.autosaveLast() as { bytes: number; pct: number })
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
}

test('①④ — %가 오른다(값) · 작은 문서는 조용하다', async ({ page }, testInfo) => {
  await boot(page)
  const s1 = await savedBytes(page)
  expect(s1.bytes).toBeGreaterThan(0)
  expect(s1.pct).toBeLessThan(0.01)                    // ④ 작은 문서 — 임계에서 멀다
  await expect(page.locator('#notice')).not.toContainText('상한 가정')
  // 획을 여럿 더하면 바이트·%가 실제로 오른다(①) — raw 점렬이 실리는 손 획
  for (let k = 0; k < 6; k++) await drawLine(page, 200 + k * 30, 200, 500 + k * 30, 300 + k * 10)
  await page.waitForFunction((b0) => {
    const l = (window as any).__b2.diag.autosaveLast()
    return l && l.bytes > b0
  }, s1.bytes, { timeout: 5000 })
  const s2 = await savedBytes(page)
  expect(s2.bytes).toBeGreaterThan(s1.bytes)
  expect(s2.pct).toBeGreaterThan(s1.pct)
  // 진단 패널의 자리(상시 %) — 패널을 열어 실제로 읽힌다
  await openDiag(page)
  await expect(page.locator('#diagpanel')).toContainText('자동 저장')
  await expect(page.locator('#diagpanel')).toContainText('%')
  // 원장(#25 — 재검 [10]): «획 몇에서 70%에 닿는가»를 계산할 절대 바이트를 남긴다.
  // LEDGER=1 단독 실행에서만 쓴다(시간 원장 규율과 같은 문 — 바이트는 결정론에 가깝지만
  // 획 좌표가 실행 경로에 실려 미세하게 다를 수 있다).
  if (process.env.LEDGER === '1' && testInfo.project.name === 'dpr1') {
    const perStroke = (s2.bytes - s1.bytes) / 6
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    writeFileSync(resolve(HERE, '../../stage0/out/autosave_web2.json'), JSON.stringify({
      what: 'web2-22 3부 — 자동 저장 직렬화 바이트(작은 문서·획 6 증분·획당 근사)와 70% 도달 추정.',
      run: { note: '정본 명령: LEDGER=1 npx playwright test autosave --workers=1(dpr1 판만 쓴다 — 바이트는 dpr 무관)', date: '2026-08-28' },
      small_doc_bytes: s1.bytes,
      after_6_strokes_bytes: s2.bytes,
      approx_bytes_per_stroke: Math.round(perStroke),
      strokes_to_warn_at_70pct: Math.round((5 * 1024 * 1024 * 0.7 - s1.bytes) / perStroke),
      note: '획당 바이트는 raw 점렬 길이에 비례(이 팔의 획은 8이동 손 획 — 실사용 손 획은 점이 더 많아 더 크다). 상한 5MB는 가정(AS-C80).',
      flags_explained: { 'constants/metric_defs 스냅샷 없음': 'web2 라인 공통 형태' },
    }, null, 1))
  }
})

test('② — 임계(70%)를 넘으면 실패 전에 알린다 (작은 상한 주입 — 같은 판정 경로)', async ({ page }) => {
  await boot(page)
  await savedBytes(page)
  // 상한을 지금 문서보다 살짝 큰 값으로 주입 — 다음 저장이 70%를 넘는다.
  // ⚠ 저장 트리거는 **알림 없는** 리스너 발화로 — 획을 그으면 커밋 알림(거부 사유 등)이
  // 같은 한 줄을 덮어 경고가 안 보인다(첫 판이 그렇게 깨졌다 — #notice는 채널이 하나다).
  await page.evaluate(() => {
    const b = (window as any).__b2
    const l = b.diag.autosaveLast()
    b.diag.autosaveLimitForTest(Math.round(l.bytes / 0.8))   // 다음 판 ≈80%+
    // ⚠⚠ **판을 하나 올린다**(web2-32 5·6·7에서 더했다 — 없으면 이 팔이 부하에서 죽는다).
    //   web2-32의 판본 게이트(#80)가 「안 바뀐 판은 안 쓴다」이므로, 앞선 디바운스 저장이
    //   **이미 나간 뒤**면 이 재점화는 게이트에 막혀 `autosaveLast()`가 안 움직이고 아래
    //   대기가 5초를 채우고 죽는다. 그것이 전량 실행에서만 나던 그 실패다(단독 실행에서는
    //   앞선 저장이 아직 안 나가서 우연히 통과했다 — 즉 이 팔은 **재는 것을 늘 재지 않았다**).
    //   재현: 판을 안 올리면 pct 0.0001 그대로 · 올리면 0.8(브라우저에서 그대로 확인).
    //   ⛔ 획을 그어서 판을 올리면 안 된다 — 커밋 알림이 #notice의 같은 한 줄을 덮는다
    //   (위 주석이 첫 판의 그 실패를 적어 뒀다). 그래서 판만 움직인다.
    b.app.docVersion++
    b.app.listeners.forEach((f: () => void) => f())          // 자동 저장 디바운스 재점화
  })
  await page.waitForFunction(() => {
    const l = (window as any).__b2.diag.autosaveLast()
    return l && l.pct >= 0.7
  }, undefined, { timeout: 5000 })
  await expect(page.locator('#notice')).toContainText('상한 가정')
  await expect(page.locator('#notice')).toContainText('파일로 저장')
})

test('③ — 실제 실패(quota) 시 종전 알림이 그대로 뜬다 (회귀)', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'b2-autosave2') throw new DOMException('quota', 'QuotaExceededError')
      return orig.call(this, k, v)
    }
  })
  // 알림은 **한 번만** 뜨고(autosaveWarned) 2.5초 뒤 사라진다 — 부트를 길게 하면 그
  // 창을 놓친다(첫 두 판의 flake). 첫 획 직후(저장 디바운스 400ms + 알림 창 2.5s)에 본다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await expect(page.locator('#notice')).toContainText('자동 저장이 안 된다', { timeout: 5000 })
})
