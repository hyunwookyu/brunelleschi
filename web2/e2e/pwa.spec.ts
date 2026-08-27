// PWA 표시 — 전체화면 선언과 브라우저 줌 잠금 (web2-09 지시 1·2·4)
//
// ⚠ **visualViewport.scale은 여기서 판정자가 아니다.** 표식 단계(D-1)에서 뷰포트 메타와
// touch-action을 **둘 다** 벗기고 CDP 합성 핀치(synthesizePinchGesture, touch 소스)를 걸어도
// scale이 1에서 안 움직였다 — 헤드리스 장치 흉내가 브라우저 줌 자체를 안 돌린다.
// 반증이 불가능한 계측은 아무것도 안 재므로(D-3) 버렸다.
//
// 그래서 이 파일의 판정은 브라우저가 줌을 결정할 때 읽는 **원인 값**이다:
//   ① 유효 touch-action 사슬(닿는 점 전부에서 핀치·이중 탭이 막혀 있는가)
//   ② 이벤트 보험(선언을 무시하는 환경에서 preventDefault가 실리는가)
//   ③ 앱 자신의 줌·펜 경로가 사는가(#62 — 시험이 앱과 같은 경로를 탄다)
// **실제 표시·실제 제스처는 실기기 축이다**(DEFERRED.md) — 여기 통과를 그것으로 읽지 않는다.
import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })

/** 화면 격자 전 지점의 브라우저 확대 누수 — 닿은 요소에서 뿌리까지 걸으며
 *  핀치 확대(none·pan-*가 막는다)와 이중 탭 확대(auto만 허용한다)를 판정한다.
 *  확대는 뷰포트의 것이므로 사슬 어느 한 곳이 막으면 막힌다. */
const zoomLeaks = (page: Page) => page.evaluate(() => {
  const leaks: string[] = []
  const xs = [5, 100, 206, 300, 407]
  const ys = [10, 100, 460, 800, 910]
  for (const x of xs) for (const y of ys) {
    let el: Element | null = document.elementFromPoint(x, y) ?? document.documentElement
    let pinchBlocked = false, dbltapBlocked = false
    for (; el; el = el.parentElement) {
      const ta = getComputedStyle(el).touchAction
      if (ta !== 'auto') dbltapBlocked = true
      if (ta !== 'auto' && ta !== 'manipulation' && !ta.includes('pinch-zoom')) pinchBlocked = true
    }
    if (!pinchBlocked) leaks.push(`pinch@(${x},${y})`)
    if (!dbltapBlocked) leaks.push(`dbltap@(${x},${y})`)
  }
  return leaks
})

test('선언 — 전체화면·표시줄 색·iOS 보험 메타가 문서에 있다 (지시 1의 헤드리스 축)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 뷰포트 — 브라우저 확대 금지 선언
  expect(await page.getAttribute('meta[name=viewport]', 'content'))
    .toContain('maximum-scale=1, user-scalable=no')
  // 설치 표시줄 색 — 매니페스트 theme_color와 같은 값이어야 한다(둘이 갈리면 설치 전후가 다르다)
  expect(await page.getAttribute('meta[name=theme-color]', 'content')).toBe('#f5f3ee')
  // iOS 보험 — iOS 16.4 미만은 매니페스트 display를 안 읽는다. ⚠ 실기기가 안드로이드라
  // iOS의 실제 표시는 **확인 못 했다** — 이 팔은 선언의 존재만 잰다.
  expect(await page.getAttribute('meta[name=apple-mobile-web-app-capable]', 'content')).toBe('yes')
  expect(await page.getAttribute('link[rel=manifest]', 'href')).toBe('./manifest.webmanifest')
  // 개발 서버가 주는 매니페스트도 파싱과 display를 본다(배포본은 static_deploy가 잰다)
  const res = await page.request.get('/manifest.webmanifest')
  expect(res.status()).toBe(200)
  const m = JSON.parse(await res.text())
  expect(m.display).toBe('standalone')
  // 홈 화면 라벨(web2-10 지시 1) — 옛 앱의 「Brunel」을 확인 없이 이어받았던 값.
  // 「12자 = 잘림선 안」은 값 선택의 근거(AS-C28 — 사람이 준 근거·미검증)이고,
  // 길이 단언은 등식 아래에서 항등이라 두지 않는다(1차 리뷰어 [3] — 반증 불능 검사).
  // ⚠ 이미 설치된 앱의 라벨은 안 바뀐다(설치 시점에 굳는다).
  expect(m.short_name).toBe('Brunelleschi')
})

test('핀치·이중 탭이 화면 전 지점에서 막혀 있다 — 유효 touch-action 사슬 (지시 2)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  expect(await zoomLeaks(page)).toEqual([])
  // 뿌리 겹이 스스로 선다 — #app의 규칙이 지워져도 html이 막는다(방어층 둘)
  expect(await page.evaluate(() =>
    getComputedStyle(document.documentElement).touchAction)).toBe('none')
  // 설정 패널을 열어도 안 샌다 — 패널은 pan-y 없이 사슬의 none 그대로다(AS-C26:
  // 「스크롤 못 한다」는 관측이 없어 안 열었다. 터치 스크롤이 막힌 것이 그 대가다)
  await page.click('#pane-file summary')   // 설정 자루는 해체됐다(web2-19 3-a) — 서랍으로
  expect(await page.evaluate(() =>
    (document.querySelector('#pane-file') as HTMLDetailsElement).open)).toBe(true)
  expect(await zoomLeaks(page)).toEqual([])
})

test('반증 — touch-action을 벗기면 위 검사가 실제로 샌다 (D-3, 계측기 생존 확인)', async ({ page }) => {
  // 이 팔이 없으면 「누수 0」이 측정인지 계측기 고장인지 안 갈린다. 방어 CSS를 벗긴
  // 문서에서 누수가 잡혀야 zoomLeaks가 살아 있는 것이다.
  await page.route('**/', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, body: (await res.text()).replace(/touch-action: none;/g, '') })
  })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  const leaks = await zoomLeaks(page)
  expect(leaks.length).toBeGreaterThan(0)
})

test('이벤트 보험 — 두 손가락 touchmove만 preventDefault된다 · Ctrl+휠도 막힌다 (지시 2)', async ({ page }) => {
  // 선언(메타·touch-action)을 **무시하는** 환경(iOS 사파리·접근성 강제 확대)에서 남는
  // 마지막 겹이다. 두 손가락만 막는 것이 요점 — 한 손가락을 막으면 click이 죽는다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  const r = await page.evaluate(() => {
    const mk = (n: number) => {
      const t = (id: number, x: number) => new Touch({
        identifier: id, target: document.body, clientX: x, clientY: 400 })
      const touches = Array.from({ length: n }, (_, i) => t(i, 100 + i * 80))
      return new TouchEvent('touchmove', { touches, cancelable: true, bubbles: true })
    }
    const two = mk(2); document.body.dispatchEvent(two)
    const one = mk(1); document.body.dispatchEvent(one)
    const wheelCtrl = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true, bubbles: true })
    document.querySelector('#sidebar')!.dispatchEvent(wheelCtrl)
    const wheelPlain = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true })
    document.querySelector('#sidebar')!.dispatchEvent(wheelPlain)
    return {
      two: two.defaultPrevented, one: one.defaultPrevented,
      wheelCtrl: wheelCtrl.defaultPrevented, wheelPlain: wheelPlain.defaultPrevented,
    }
  })
  expect(r.two).toBe(true)        // 브라우저 핀치 채널 차단
  expect(r.one).toBe(false)       // 반증 — 한 손가락은 안 건드린다(펜·탭·궤도가 산다)
  expect(r.wheelCtrl).toBe(true)  // 데스크톱 브라우저 줌(트랙패드 핀치 포함)
  expect(r.wheelPlain).toBe(false) // 반증 — 보통 휠은 안 건드린다
})

test('앱의 줌이 산다 — 두 손가락 벌림이 view.s를 키운다 (#62: 실제 입력 경로)', async ({ page }) => {
  // 브라우저 줌을 막은 수리가 앱의 두 손가락 줌(input.ts → dollyBy)을 죽이면 안 된다.
  // CDP 터치를 컴포지터 경로로 흘려 **앱이 실제로 받는 그 이벤트**로 잰다.
  // ⚠ 이 팔이 재는 것은 **입력 → dollyBy 배선**이고, 갈래는 작도 포즈(view.s)다.
  // 지시가 지키라 한 궤도 반경 갈래는 dollyBy 안의 다른 가지이며
  // orbitradius.test.ts·fold_measure.test.ts가 같은 함수를 직접 잰다(#62 — 한 함수).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // web2-17 3-a: 선언(첫 획) 전에는 줌이 막힌다 — 획 하나를 먼저 긋고 잰다(뷰포트 412 안)
  await page.mouse.move(100, 700); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 25 * i, 700)
  await page.mouse.up()
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(1)
  const before = await page.evaluate(() => (window as any).__b2.app.view.s)
  const cdp = await page.context().newCDPSession(page)
  const pts = (d: number) => [
    { x: 206 - d, y: 460, id: 1 }, { x: 206 + d, y: 460, id: 2 },
  ].map(p => ({ x: p.x, y: p.y, id: p.id, force: 1 }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) })
  for (let d = 50; d <= 140; d += 10)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  const after = await page.evaluate(() => (window as any).__b2.app.view.s)
  console.log(`[측정] 두 손가락 벌림 view.s ${before} → ${after}`)
  expect(before).toBe(1)
  // 통과선 1.5의 근거: 기하 기대값은 140/40 = 3.5이고(dollyBy는 비를 그대로 곱한다,
  // 상한 8 안), 판정하려는 것은 «커졌다»이지 «얼마나»가 아니다 — 기대의 절반 아래로 여유.
  expect(after).toBeGreaterThan(1.5)
})

test('펜 경로 무손상 — 펜 드래그가 획을 만든다 (지시 2의 펜/손가락 가름)', async ({ page }) => {
  // EMR 펜은 브라우저 줌 제스처를 안 낸다 — 수리가 펜 입력을 건드리지 않았음을
  // 실제 이벤트로 보인다(pointerType='pen'이 input.ts의 펜 갈래를 탄다).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const cdp = await page.context().newCDPSession(page)
  const opts = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 80, y: 500, ...opts })
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 80 + i * 30, y: 500, ...opts })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 320, y: 500, ...opts })
  await cdp.detach()
  const after = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(after).toBe(before + 1)
})
