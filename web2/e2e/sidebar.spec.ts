// 우측 세로바 1.5배 · 파일 묶음 발견성 (web2-10 지시 5)
//
// 헤드리스가 재는 것: 실측 크기(boundingBox)·서로 간 간격·화면 안 수용·선택 표시
// 이동량·파일 패널의 이름 가름·성공 알림. **「손에 맞는가」는 실기기 축**이다(DEFERRED).
// 임계는 전부 옛 값과 새 값 사이다 — 크기를 되돌리면 실패한다(반증: 실행으로 확인).
import { test, expect, type Page } from '@playwright/test'

const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).boundingBox()
  expect(b, sel).not.toBeNull()
  return b!
}

test('세로바 버튼이 1.5배 크기이고 서로 안 붙는다 — 실측', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 크기 — 임계는 옛 값(괄호)과 새 값 사이: 되돌리면 깨진다
  expect((await box(page, '#sidebar-toggle svg')).height).toBeGreaterThanOrEqual(24) // (18→27)
  expect((await box(page, '#btn-undo svg')).height).toBeGreaterThanOrEqual(27)      // (20→30)
  expect((await box(page, '#btn-redo svg')).height).toBeGreaterThanOrEqual(27)
  expect((await box(page, '#btn-pencil svg')).height).toBeGreaterThanOrEqual(80)    // (62→93)
  expect((await box(page, '#btn-pen svg')).height).toBeGreaterThanOrEqual(80)
  expect((await box(page, '#btn-eraser-pencil svg')).height).toBeGreaterThanOrEqual(42) // (32→48)
  expect((await box(page, '#btn-eraser-ink svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#btn-face svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#pane-file summary svg')).height).toBeGreaterThanOrEqual(25)  // (19→28)
  expect((await box(page, '#pane-settings summary svg')).height).toBeGreaterThanOrEqual(25)

  // 간격 — 이웃한 버튼의 **레이아웃** 세로 간격 ≥ 8px (옛 gap 6은 실패한다).
  // ⚠ boundingBox가 아니라 offset으로 잰다: 선택된 도구는 scale(1.14)로 이웃 간격을
  //   파고드는 것이 설계다(4-d — 앞으로 나온다). 초판이 boundingBox로 쟀다가 선택된
  //   연필 옆 간격 2.49px에 걸렸다 — transform은 레이아웃 간격이 아니다.
  const ids = ['sidebar-toggle', 'btn-undo', 'btn-redo', 'btn-pencil', 'btn-pen',
    'btn-eraser-pencil', 'btn-eraser-ink', 'btn-face']
  const offs = await page.evaluate((list) => list.map(id => {
    const el = document.getElementById(id) as HTMLElement
    return { id, top: el.offsetTop, h: el.offsetHeight }
  }), ids)
  for (let i = 1; i < offs.length; i++) {
    const gap = offs[i]!.top - (offs[i - 1]!.top + offs[i - 1]!.h)
    expect(gap, `${offs[i]!.id} 위 간격`).toBeGreaterThanOrEqual(8)
  }

  // 세로바 전체가 화면 높이 안이다(지시 문면 — #sidebar에는 max-height가 없다)
  const bar = await box(page, '#sidebar')
  const vh = await page.evaluate(() => window.innerHeight)
  console.log(`[측정] 세로바 높이 ${Math.round(bar.height)} / 뷰포트 ${vh}`)
  expect(bar.y).toBeGreaterThanOrEqual(0)
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh)

  // 겹침 회귀 — 커진 세로바가 시점바를 덮지 않는다. 초판 1.5배가 덮었다(#dim-toggle
  // 클릭을 sidebar svg가 가로채 dim.spec 4팔·flow가 죽었다) — 시점바를 둘째 열로 옮겼다.
  for (const id of ['dim-toggle', 'btn-draw-view', 'btn-save-view']) {
    const hit = await page.evaluate((i) => {
      const t = document.getElementById(i)!
      const r = t.getBoundingClientRect()
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return t === el || t.contains(el)
    }, id)
    expect(hit, `#${id}가 덮이지 않는다`).toBe(true)
  }

  // 선택 표시 — 이동량이 커진 크기에 맞게 1.5배(-7 → -10px). 전환(.12s)을 기다린다.
  await page.click('#btn-pen')
  await page.waitForTimeout(250)
  const m = await page.evaluate(() =>
    new DOMMatrix(getComputedStyle(document.getElementById('btn-pen')!).transform))
  expect(m.a).toBeCloseTo(1.14, 2)  // scale 그대로
  expect(m.e).toBeCloseTo(-10, 0)   // translateX(-10px) — translate가 scale보다 앞이라 tx는 그대로. 옛 -7이면 깨진다
})

test('파일 묶음 — 「원본」과 「내보내기」가 이름에서 갈리고, 저장이 알림을 낸다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#pane-file summary')
  // 이름 가름(지시 5) — .brnl은 되돌아오는 원본, OBJ/glTF는 나가기만 한다
  const paneText = await page.locator('#pane-file > div').textContent()
  expect(paneText).toContain('원본')
  expect(paneText).toContain('다시 연다')
  expect(paneText).toContain('나가기만 한다')
  await expect(page.locator('#btn-open')).toBeVisible()
  expect((await box(page, '#btn-open')).height).toBeGreaterThanOrEqual(20) // 펜 탭 높이(옛 12px 글+3px 패딩 ≈ 18은 실패)
  // 저장 성공 알림(HANDOFF 「남은 다듬기」의 그 행) — 다운로드는 화면에 흔적이 없다
  await Promise.all([page.waitForEvent('download'), page.click('#btn-save')])
  await expect(page.locator('#notice')).toContainText('저장했다')
})
