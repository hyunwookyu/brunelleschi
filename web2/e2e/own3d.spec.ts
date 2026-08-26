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
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toContainText('3D 경로')
  await expect(page.locator('#diagpanel')).toContainText('자립(정본')
  await page.click('#buildid')

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

  // 사람이 설정에서 끈다(A-4 — 옛 사슬 경로 생존) — 진단이 즉시 «대체»를 말한다
  await page.click('#pane-settings summary')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await page.click('#buildid')
  await expect(page.locator('#diagpanel')).toContainText('사슬(대체')
  // 꺼짐에서도 기하는 산다 — 사슬이 같은 획을 그대로 올린다(옛 경로 생존의 실측)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)).toBe(st.lifted)

  // 재방문 — 사람이 끈 값은 남는다(localStorage 'off')
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  await expect(page.locator('#chk-own3d')).not.toBeChecked()

  // 켜서 되돌리기 + 다음 팔들을 위한 청소
  await page.click('#pane-settings summary')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  await page.evaluate(() => { localStorage.removeItem('b2-own3d'); localStorage.removeItem('b2-autosave') })
})

test('이행 — own3 없는 옛 저장 파일을 기본 켜짐으로 열면 사슬로 올리고 그 자리에서 굳는다', async ({ page }) => {
  await boot(page)
  // «옛 파일»을 실제 옛 경로로 만든다: 깃발을 끄고 그린 문서는 own3가 없다(4부 불변식)
  await page.click('#pane-settings summary')
  await page.click('#chk-own3d')
  await fixture(page)
  const old = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { lifted: a.lift.lifted.size, own3: a.doc.strokes.filter((s: any) => s.own3).length,
      strokes: a.doc.strokes.length }
  })
  expect(old.own3, '옛 파일 판별력 — own3가 없어야 이행을 잰다').toBe(0)
  expect(old.lifted).toBeGreaterThan(0)
  // 자동 저장을 기다린다(400ms 디바운스) — **획 수가 최종본과 같아질 때까지**
  // (존재만 기다리면 중간 저장본을 잡아 리로드가 옛 상태를 연다 — 첫 실행이 그랬다)
  await page.waitForFunction((n) => {
    const s = localStorage.getItem('b2-autosave')
    if (!s) return false
    try { return JSON.parse(s).strokes.length === n } catch { return false }   // .brnl은 최상위 strokes다(file.ts)
  }, old.strokes)
  const saved = await page.evaluate(() => localStorage.getItem('b2-autosave')!)
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
  await page.evaluate(() => { localStorage.removeItem('b2-autosave'); localStorage.removeItem('b2-own3d') })
})
