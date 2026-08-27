// 진단 패널 (web2-10 지시 4) — 값이 실제로 그 자리에 나오는가.
//
// 헤드리스가 재는 것: 열림/닫힘 배선 · 각 값이 브라우저의 현재값과 **일치**하는가
// (문구가 아니라 같은 API를 불러 대조한다) · 포인터 줄이 실입력으로 갱신되는가.
// dpr 줄은 dpr1/dpr2 프로젝트에서 **다른 값**을 요구하므로(D-C3) 표시가 고정 문자열이면
// 두 프로젝트 중 하나가 반드시 깨진다 — 판별력이 구성에 있다.
// 실기기 값(MovinkPad의 dpr·UA·필압 단계)은 이 패널로 사람이 읽는다 — DEFERRED의 자리.
import { test, expect, type Page } from '@playwright/test'

const rowText = (page: Page, key: string) => page.evaluate((k) => {
  const rows = Array.from(document.querySelectorAll('#diagpanel div'))
  const r = rows.find(d => (d.querySelector('.k')?.textContent ?? '') === k)
  return r ? (r.textContent ?? '').slice((r.querySelector('.k')?.textContent ?? '').length) : null
}, key)

test('빌드 식별자를 누르면 진단이 펴지고 값이 브라우저 현재값과 같다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await expect(page.locator('#diagpanel')).toBeHidden()   // 기본은 닫힘 — 그림을 안 가린다
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toBeVisible()

  const actual = await page.evaluate(() => ({
    hw: 'createHandwritingRecognizer' in navigator ? '있음' : '없음',
    dpr: String(window.devicePixelRatio),
    css: `${window.innerWidth}×${window.innerHeight}`,
    ua: navigator.userAgent,
  }))
  expect(await rowText(page, '필기 인식 API')).toBe(actual.hw)
  expect(await rowText(page, 'devicePixelRatio')).toBe(actual.dpr)  // dpr1↔dpr2에서 다른 값
  expect(await rowText(page, '표시 모드')).toBe('browser')          // 헤드리스 탭은 browser다
  expect(await rowText(page, '화면 CSS px')).toBe(actual.css)
  expect(await rowText(page, 'UA')).toBe(actual.ua)
  // ⚠ «—»가 아니다 — 패널을 **연 클릭 자체가** 포인터 입력이라 mouse가 이미 찍혀 있다.
  // (초판이 «—»를 기대해 실패했다 — 계측이 클릭까지 세고 있다는 증거라 판정을 바꿨다.)
  expect(await rowText(page, '마지막 포인터')).toContain('mouse')

  // 다시 누르면 닫힌다
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toBeHidden()
})

test('포인터 줄이 실입력으로 갱신된다 — pen 종류·필압이 나온다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#buildid')
  expect(await rowText(page, '마지막 포인터')).toContain('mouse')   // 연 클릭이 남긴 대조군
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const, force: 0.7 }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 400, ...pen })
  for (let i = 1; i <= 5; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200 + i * 20, y: 400, ...pen })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 400, ...pen })
  await cdp.detach()
  const row = await rowText(page, '마지막 포인터')
  console.log(`[측정] 진단 포인터 줄: ${row}`)
  expect(row).toContain('pen')
  const max = Number(/필압 최대 ([\d.]+)/.exec(row ?? '')?.[1])
  expect(max).toBeGreaterThan(0)                                    // 필압이 실린다
  // 단계 카운터가 **서로 다른 값을 실제로 센다** — «≥ 1»은 입력이 있으면 항등이라 안 잰다
  // (2차 리뷰어 [7] — 배포 ① [3]과 같은 형태). CDP 합성 펜은 압력을 못 바꾸므로 여기서는
  // 합성 PointerEvent로 서로 다른 압력 둘을 흘린다 — 카운터 로직의 판별이 목적이고,
  // 실입력 경로는 위 CDP 팔이 이미 덮는다. 실기기 단계 수는 이 줄로 사람이 읽는다(DEFERRED).
  const n0 = Number(/단계 (\d+)/.exec(row ?? '')?.[1])
  expect(n0).toBeGreaterThanOrEqual(1)
  await page.evaluate(() => {
    for (const p of [0.31, 0.62]) document.body.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'pen', pressure: p, bubbles: true }))
  })
  const n1 = Number(/단계 (\d+)/.exec(await rowText(page, '마지막 포인터') ?? '')?.[1])
  console.log(`[측정] 필압 단계 카운터 ${n0} → ${n1} (서로 다른 압력 둘 추가)`)
  expect(n1).toBe(n0 + 2)                                           // 반증: 카운터가 죽으면 n0 그대로다
})

// web2-16 1부 — 진단 패널은 판독 전용이라 입력을 못 삼킨다(pointer-events: none).
// web2-14 e224d82가 「교점(마지막 획)」 줄을 더해 패널 상단(y≈361)이 치수 필기 칸의
// 쓰기 시작점(y≈363)을 1.4px 차로 덮었고, 그때부터 「인식기 감지」 팔이 조용히
// 타임아웃했다(포인터가 패널에 삼켜져 획이 아예 안 실린다). 이 팔은 그 1.4px짜리
// 우연 대신 **필기 칸 전면**을 표본한다. (⚠ 초판은 워크트리에 잘못 세워져 유실됐다 —
// NOTES 「1부」의 cwd 혼선 기록. 이것이 메인의 정본이다.)
test('진단 패널이 열려도 치수 필기 칸의 포인터를 안 삼킨다 (web2-16 1부)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#dim-toggle')                      // 치수 리본을 편다
  await page.click('#buildid')                         // 진단 패널을 연다
  const r = await page.evaluate(() => {
    const ink = document.getElementById('dim-ink')!.getBoundingClientRect()
    const dg = document.getElementById('diagpanel')!.getBoundingClientRect()
    // 전제 확인 — 두 사각형이 실제로 겹쳐야 이 팔이 무엇을 잰다(겹침이 사라지면
    // 여기서 크게 실패시켜 표본 위치를 다시 잡게 한다 — 조용히 안 재는 팔 금지, D-3).
    const overlap = !(dg.right < ink.left || dg.left > ink.right || dg.bottom < ink.top || dg.top > ink.bottom)
    // 필기 칸 전면 3×3 격자 — elementFromPoint가 전부 dim-ink여야 한다
    const misses: string[] = []
    for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.08, 0.5, 0.92]) {
      const el = document.elementFromPoint(ink.left + ink.width * fx, ink.top + ink.height * fy)
      if (!el || el.id !== 'dim-ink') misses.push(`(${fx},${fy})→${el ? el.id || el.tagName : 'none'}`)
    }
    return { overlap, misses }
  })
  expect(r.overlap).toBe(true)   // 패널이 필기 칸과 겹치는 지금 배치에서 재고 있다
  expect(r.misses).toEqual([])   // 반증: #diagpanel의 pointer-events: none을 빼면 실패한다
})
