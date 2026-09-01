// web2-13 4부 → **web2-14 1번: 기본 켜짐** — 자립 깃발의 화면 층.
//
// 정본이 뒤집혔다: 이제 「깃발 켜짐」이 정본이고 꺼짐은 대체 경로다(사람이 실기기에서
// 판정 — 「옵션이 아니라 기본값으로」). 팔 구성도 그대로 뒤집는다:
//   · 기본(무설정) = 켜짐 — 나머지 e2e 전체가 이 상태로 돈다(정본 경로가 전량 검사를 받는다)
//   · 꺼짐은 이 파일이 명시적으로 꺼서 잰다(A-4 — 옛 경로 생존 확인)
//   · 이행(옛 저장 파일): own3 없는 문서를 기본 켜짐으로 열면 사슬로 올리고 그 자리에서
//     굳는다(web2-13 1-h의 「이행」 — 아래 팔이 본다)
// 기전의 팔은 test/own3d.test.ts(단위 — 4-a~4-d·4-g·반증). 여기는 사람이 만지는 표면.

import { test, expect, type Page } from '@playwright/test'
import { savedText, waitSaved, clearStore } from './store43'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 지평선 + 깊이선(소실점) + 수평 앵커 — **카메라가 닫히는** 픽스처.
 *  ⚠ draftgate의 둘(지평선+수평선)로는 안 닫힌다: p1Locked = 화면수평 선언 **AND**
 *  vps ≥ 1 이다(camera.ts). 깊이선이 소실점을 만들고 수평선이 잠근다. */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(300, 650); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(300 + 25 * i, 650 - 18 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

test('기본은 켜짐(자립이 정본) — 진단이 말한다 · 끄면 사슬(대체)로 · 끈 값은 재방문에 남는다', async ({ page }) => {
  await boot(page)
  // 기본 켜짐(무설정) — web2-14 1번의 사람 판정이 기본값이 됐다
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  await expect(page.locator('#chk-own3d')).toBeChecked()
  await openDiag(page)
  await expect(page.locator('#diagpanel')).toContainText('3D 경로')
  await expect(page.locator('#diagpanel')).toContainText('자립(정본')
  await openDiag(page)

  // 그린 것이 실제로 굳는다(정본 경로가 산다) — 카메라 닫힘 후 lifted 전부 own3
  await fixture(page)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { lifted: a.lift.lifted.size, frozen: a.doc.strokes.filter((s: any) => s.own3).length,
      done: a.lift.an.constructionDone }
  })
  expect(st.done, '픽스처가 카메라를 닫는다(판별력)').toBe(true)
  expect(st.lifted).toBeGreaterThan(0)
  expect(st.frozen, '켜짐 정본 — 승격 획이 굳는다').toBe(st.lifted)

  // 사람이 **진단 곁**에서 끈다(web2-19 3-a — 설정 자루에서 나왔다. A-4 경로 생존)
  await openDiag(page)                 // 패널이 펴지면 #diagctl이 보인다
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await openDiag(page); await openDiag(page)   // 접었다 펴서 진단 줄을 다시 읽는다
  await expect(page.locator('#diagpanel')).toContainText('사슬(대체')
  // 꺼짐에서도 기하는 산다 — 사슬이 같은 획을 그대로 올린다(옛 경로 생존의 실측)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)).toBe(st.lifted)

  // 재방문 — 사람이 끈 값은 남는다(localStorage 'off')
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await expect(page.locator('#chk-own3d')).not.toBeChecked()

  // 켜서 되돌리기 + 다음 팔들을 위한 청소 — 새로 고침으로 패널이 접혔으니 다시 편다
  await openDiag(page)
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  await page.evaluate(() => localStorage.removeItem('b2-own3d'))
  await clearStore(page)
})

test('이행 — own3 없는 옛 저장 파일을 기본 켜짐으로 열면 사슬로 올리고 그 자리에서 굳는다', async ({ page }) => {
  await boot(page)
  // 켜짐 보증(2차 [13]) — 팔 간 저장소 격리를 전제하지 않고 직접 단언한다: 이 팔이
  // 꺼짐에서 시작하면 아래 «옛 파일 만들기»부터 전제가 무너진다.
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  // «옛 파일»을 실제 옛 경로로 만든다: 깃발을 끄고 그린 문서는 own3가 없다(4부 불변식)
  await openDiag(page)                 // 진단 곁(web2-19 3-a)
  await page.click('#chk-own3d')
  await fixture(page)
  const old = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { lifted: a.lift.lifted.size, own3: a.doc.strokes.filter((s: any) => s.own3).length,
      strokes: a.doc.strokes.length }
  })
  expect(old.own3, '옛 파일 판별력 — own3가 없어야 이행을 잰다').toBe(0)
  expect(old.lifted).toBeGreaterThan(0)
  // 자동 저장을 기다린다(지연 병합) — **획 수가 최종본과 같아질 때까지**
  // (존재만 기다리면 중간 저장본을 잡아 리로드가 옛 상태를 연다 — 첫 실행이 그랬다)
  // ⚠ web2-43: 저장 자리가 IndexedDB다 — 읽는 자리는 `e2e/store43.ts` 하나다.
  await waitSaved(page, old.strokes)
  const saved = await savedText(page)
  expect(saved.includes('own3'), '저장 파일에 own3 필드가 없다').toBe(false)
  await page.evaluate(() => localStorage.removeItem('b2-own3d'))

  // 다시 연다 — 기본 켜짐. 복원 경로(loadDoc → recompute)가 사슬로 올리고 굳힌다
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  const mig = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { own3d: a.own3d, lifted: a.lift.lifted.size, strokes: a.doc.strokes.length,
      frozen: a.doc.strokes.filter((s: any) => s.own3).length }
  })
  expect(mig.own3d).toBe(true)
  expect(mig.strokes, '획이 그대로 열렸다').toBe(old.strokes)
  expect(mig.lifted, '사슬 리프팅이 정상으로 돈다').toBe(old.lifted)
  expect(mig.frozen, '열면서 굳는다(이행)').toBe(old.lifted)
  await page.evaluate(() => localStorage.removeItem('b2-own3d'))
  await clearStore(page)
})

test('4-g 가시성(2차 [17]) — 대기선 몸통 위 호버에 오스냅 기호가 화면(픽셀)에 뜬다', async ({ page }) => {
  await boot(page)
  await fixture(page)
  // 대기 소실점 선 — 허공(왼쪽 위)에 긋는다. 몸통 위를 호버하면 near 기호(○)가 떠야 한다.
  await page.mouse.move(200, 250); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(200 + 20 * i, 250 + 5 * i)
  await page.mouse.up(); await settle(page)
  const wait = await page.evaluate(() => (window as any).__b2.app.lift.waiting.length)
  expect(wait).toBeGreaterThan(0)
  const box = [215, 243, 50, 40] as const            // 몸통 위(끝점 42px·중점 40px 밖)
  const px = (b: readonly [number, number, number, number]) => page.evaluate(([x, y, w, h]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(Math.round(x! * dpr), Math.round(y! * dpr),
      Math.round(w! * dpr), Math.round(h! * dpr)).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, b)
  const before = await px(box)                       // 파선 몸체만
  await page.mouse.move(241, 265); await settle(page)  // 몸통 근처 호버(잉크에서 ≈4.6px — 반경 안·#68대로 오차를 심은 값. 버튼 없음)
  const after = await px(box)
  console.log(`[측정] 대기선 몸통 호버 기호 — 상자 픽셀 ${before} → ${after}`)
  expect(after, '기호가 실제로 그려졌다(«붙었다»가 화면에서 읽힌다)').toBeGreaterThan(before + 8)
  // 반증 — 멀리 옮기면 기호가 사라진다(호버 갱신 경로)
  await page.mouse.move(600, 700); await settle(page)
  expect(await px(box)).toBeLessThanOrEqual(before + 2)
})
