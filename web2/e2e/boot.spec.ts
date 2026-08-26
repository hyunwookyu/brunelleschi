// 로딩화면 (web2-10 지시 2·3)
//
// 헤드리스가 재는 것: 인라인 여부(번들 밖) · 배경색이 매니페스트와 같은 값 ·
// 앱이 서면 사라짐 · 입력을 안 막는 선언 · reduced-motion 갈래.
// **「흐린가/선명한가」는 실기기 축이다** — 여기 통과를 그것으로 읽지 않는다(DEFERRED).
import { test, expect } from '@playwright/test'

test('로딩화면이 인라인이고 크레딧·배경이 정본과 맞는다 (지시 2·3)', async ({ page }) => {
  // ① 원문 HTML — JS 없이도 #boot가 있어야 한다(번들을 기다리면 빈 화면이 먼저 번쩍인다).
  //    로고는 인라인 <svg>여야 하고(밀도 무관 선명 — 흐림의 답), 파일 참조가 아니어야 한다.
  const html = await (await page.request.get('/')).text()
  const bootAt = html.indexOf('id="boot"')
  // ⚠ 「첫 type="module"」이 아니라 **앱 번들**을 찾는다 — vite dev가 <head>에
  // /@vite/client 모듈을 주입해 첫 모듈은 늘 #boot보다 앞이다(dev에서만 실패했다).
  const moduleAt = html.indexOf('src/app/main.ts')
  expect(bootAt).toBeGreaterThan(-1)
  expect(moduleAt).toBeGreaterThan(-1)
  expect(bootAt).toBeLessThan(moduleAt)               // 번들 이전에 이미 문서에 있다
  const bootHtml = html.slice(bootAt, html.indexOf('id="app"'))
  expect(bootHtml).toContain('<svg')                   // 인라인 SVG
  expect(bootHtml).not.toContain('<img')               // 파일을 부르지 않는다
  expect(bootHtml).toContain('© 2026 유현욱 · 한국예술종합학교')  // 크레딧(지시 3)
  expect(bootHtml).toContain('Brunelleschi')
  // ② 배경 = 매니페스트 background_color — 크롬 스플래시에서 넘어올 때 안 튀는 조건
  const m = JSON.parse(await (await page.request.get('/manifest.webmanifest')).text())
  expect(html).toContain(`background: ${m.background_color}; pointer-events: none;`)
  // ③ 앱이 서면 사라진다
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.waitForSelector('#boot', { state: 'detached' })
})

test('반증 — 앱 모듈이 안 서면 로딩화면이 남는다 (D-3: 제거를 재는 계측의 생존 확인)', async ({ page }) => {
  // 위 「사라진다」가 측정이려면 **안 사라지는 조건**이 있어야 한다. 모듈을 죽이면
  // 남아야 하고, 그때 입력을 막지 않는 선언(pointer-events:none)도 함께 잰다.
  await page.route('**/src/app/main.ts', (route) => route.abort())
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)                       // 제거 타이머(600ms)보다 길게
  const st = await page.evaluate(() => {
    const b = document.getElementById('boot')
    if (!b) return null
    const cs = getComputedStyle(b)
    return { opacity: cs.opacity, pointerEvents: cs.pointerEvents }
  })
  expect(st).not.toBeNull()                            // 남아 있다 — 제거는 앱이 한다
  expect(st!.opacity).toBe('1')
  expect(st!.pointerEvents).toBe('none')               // 떠 있는 동안에도 펜 입력을 안 막는다
})

test('prefers-reduced-motion이면 전환이 없다 (지시 2)', async ({ page }) => {
  await page.route('**/src/app/main.ts', (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  expect(await page.evaluate(() =>
    getComputedStyle(document.getElementById('boot')!).transitionProperty)).toBe('none')
  // 반증 짝 — 보통 환경에서는 opacity 전환이 있다(이 검사가 갈래를 실제로 가른다)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(await page.evaluate(() =>
    getComputedStyle(document.getElementById('boot')!).transitionProperty)).toContain('opacity')
})
