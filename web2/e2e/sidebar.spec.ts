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

// web2-12 3번 — 크기·정렬·누름 범위가 **한 규칙**이다(:root --ui-scale·--hit-pad·--bar-gap).
// 시점·치수 묶음(#viewbar)이 세로바 안으로 들어와 오른쪽 세로축이 하나로 선다.
const ALL = ['sidebar-toggle', 'btn-draw-view', 'btn-save-view', 'dim-toggle',
  'btn-undo', 'btn-redo',
  'tray-2H', 'tray-H', 'tray-F', 'tray-HB', 'tray-B', 'tray-2B', 'btn-pen',
  'btn-eraser-pencil', 'btn-eraser-ink', 'btn-brush', 'btn-face']

test('세로바 한 규칙 — 크기 대역·오른쪽 정렬·누름 사각형·쌍별 겹침 0 (web2-12 3번)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 크기 — 전 요소가 같은 배수(--ui-scale) 대역이다. 임계는 옛 값(괄호)과 새 값 사이:
  // 되돌리면 깨진다. **시점·치수 묶음도 같은 대역**이다(관측 ① — 종전 20px가 30px 대역으로).
  expect((await box(page, '#sidebar-toggle svg')).height).toBeGreaterThanOrEqual(24) // (18→27)
  for (const id of ['btn-undo', 'btn-redo', 'btn-draw-view', 'btn-save-view', 'dim-toggle', 'btn-brush']) {
    expect((await box(page, `#${id} svg`)).height, `#${id} 크기 대역`).toBeGreaterThanOrEqual(27) // (20→30)
  }
  // 연필통(web2-12 6번) — 가로 행 일곱(연필 여섯 + 펜). 높이 같은 대역(16→24).
  for (const id of ['tray-2H', 'tray-HB', 'tray-2B', 'btn-pen']) {
    const b = await box(page, `#${id} svg`)
    expect(b.height, `#${id} 행 높이`).toBeGreaterThanOrEqual(21)
    expect(b.width, `#${id} 행 폭(누웠다)`).toBeGreaterThan(b.height * 3)
  }
  expect((await box(page, '#btn-eraser-pencil svg')).height).toBeGreaterThanOrEqual(42) // (32→48)
  expect((await box(page, '#btn-eraser-ink svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#btn-face svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#pane-file summary svg')).height).toBeGreaterThanOrEqual(25)  // (19→28)
  expect((await box(page, '#pane-settings summary svg')).height).toBeGreaterThanOrEqual(25)

  // 오른쪽 정렬 — 전 요소 svg의 **오른쪽 가장자리 x가 한 값**이다(관측 ①: align-items가
  // center면 폭이 다른 요소가 섞여 중앙 정렬이 된다 — flex-end로 세운 축을 잰다)
  const rights = await page.evaluate((list) => list.map(id => {
    const el = document.querySelector(`#${id} svg`) as SVGElement
    return { id, right: el.getBoundingClientRect().right }
  }), ALL.filter(id => !id.startsWith('tray-') && id !== 'btn-pen'))  // 선택된 도구 행은 앞으로 나온다(-10px)
  const r0 = rights[0]!.right
  for (const r of rights) expect(Math.abs(r.right - r0), `#${r.id} 오른쪽 가장자리`).toBeLessThanOrEqual(1)

  // 누름 사각형 — 보이는 svg보다 사방 --hit-pad 만큼 넓다(관측 ② — 투명한 여유)
  const pads = await page.evaluate((list) => list.map(id => {
    const el = document.getElementById(id)!
    const b = el.getBoundingClientRect()
    const s = el.querySelector('svg')!.getBoundingClientRect()
    return { id, dw: b.width - s.width, dh: b.height - s.height }
  }), ['btn-undo', 'dim-toggle', 'btn-draw-view'])
  for (const p of pads) {
    expect(p.dw, `#${p.id} 누름 여유(가로)`).toBeGreaterThanOrEqual(5)  // 2×3px − 반올림 여유
    expect(p.dh, `#${p.id} 누름 여유(세로)`).toBeGreaterThanOrEqual(5)
  }

  // 쌍별 겹침 0 — **누름 사각형**(boundingBox) 기준. 도구를 선택해 확대가 걸린 상태에서도
  // 겹치지 않는다(확대는 svg에만 걸린다 — 버튼 상자는 제자리).
  await page.click('#tray-HB')
  await page.waitForTimeout(200)
  const rects = await page.evaluate((list) => list.map(id => {
    const b = document.getElementById(id)!.getBoundingClientRect()
    return { id, x: b.x, y: b.y, w: b.width, h: b.height }
  }), ALL)
  let overlaps = 0
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) { overlaps++; console.log(`[측정] 겹침 — ${a.id} × ${b.id} (${ox.toFixed(1)}×${oy.toFixed(1)})`) }
    }
  }
  console.log(`[측정] 누름 사각형 쌍별 겹침 ${overlaps} (쌍 ${rects.length * (rects.length - 1) / 2})`)
  expect(overlaps).toBe(0)

  // 세로바 전체가 화면 높이 안이다(지시 문면 — #sidebar에는 max-height가 없다)
  const bar = await box(page, '#sidebar')
  const vh = await page.evaluate(() => window.innerHeight)
  console.log(`[측정] 세로바 높이 ${Math.round(bar.height)} / 뷰포트 ${vh}`)
  expect(bar.y).toBeGreaterThanOrEqual(0)
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh)

  // 겹침 회귀 — 세로바 요소가 서로를 덮지 않는다(한 흐름이 된 시점·치수 포함 — 각 버튼의
  // 가운데를 실제로 그 버튼이 받는다. web2-10의 «둘째 열» 사고의 재발 방지 그대로).
  for (const id of ['dim-toggle', 'btn-draw-view', 'btn-save-view']) {
    const hit = await page.evaluate((i) => {
      const t = document.getElementById(i)!
      const r = t.getBoundingClientRect()
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return t === el || t.contains(el)
    }, id)
    expect(hit, `#${id}가 덮이지 않는다`).toBe(true)
  }

  // 선택 표시 — svg에 걸린다(누름 상자는 제자리 — 위 겹침 판이 그 증거다)
  await page.click('#btn-pen')
  await page.waitForTimeout(250)
  const m = await page.evaluate(() =>
    new DOMMatrix(getComputedStyle(document.querySelector('#btn-pen svg')!).transform))
  expect(m.a).toBeCloseTo(1.14, 2)  // scale 그대로
  expect(m.e).toBeCloseTo(-10, 0)   // translateX(-10px)
  const btnM = await page.evaluate(() =>
    getComputedStyle(document.getElementById('btn-pen')!).transform)
  expect(btnM).toBe('none')         // 버튼 상자에는 변형이 없다 — 겹침 0의 전제
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

// web2-12 6번 — 연필통: 행이 도구이자 경도다. 선택 표시·니브 표기·차지하는 자리 실측.
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))

test('연필통 — 진하기 순 세로 배열·행 선택이 도구+경도·펜 니브 표기·자리 실측', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 진하기 순(2H → 2B, 아래 펜) — 위에서 아래로 y가 는다
  const order = ['tray-2H', 'tray-H', 'tray-F', 'tray-HB', 'tray-B', 'tray-2B', 'btn-pen']
  const ys = await page.evaluate((ids) => ids.map(id => document.getElementById(id)!.getBoundingClientRect().y), order)
  for (let i = 1; i < ys.length; i++) expect(ys[i]!, `${order[i]}가 ${order[i - 1]} 아래다`).toBeGreaterThan(ys[i - 1]!)

  // 행 선택 = 도구 + 경도 (한 몸짓)
  await page.click('#tray-2B')
  expect(await page.evaluate(() => {
    const a = (window as any).__b2.app
    return `${a.tool}:${a.grade}`
  })).toBe('pencil:2B')
  expect(await page.getAttribute('#tray-2B', 'class')).toContain('on')
  expect(await page.getAttribute('#tray-HB', 'class')).not.toContain('on')
  // 경도 각인이 각 행에 있다(자르기 규칙 — 지우개 쪽 몸통)
  expect(await page.locator('#tray-2B text').textContent()).toBe('2B')

  // 펜 — 니브 표기가 끝 표시다. 값이 굵기 막대와 같은 출처(app.nib)를 따른다
  await page.click('#btn-pen')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pen')
  const nib = await page.evaluate(() => (window as any).__b2.app.nib)
  expect(await page.locator('#nib-mm').textContent()).toBe(nib.toFixed(1))

  // 자리 실측(지시 문면: 차지하는 폭·높이 — 그림을 얼마나 가리는가) → 원장
  const bar = (await page.locator('#sidebar').boundingBox())!
  const tray = (await page.locator('#tray').boundingBox())!
  const vw = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  // **펜 상태에서도** 화면 안이다 — 굵기 막대가 흐름 안에 있던 초판은 펜을 고른 순간
  // 세로바가 923px(>800)로 넘쳤다(이 실측이 잡았다 — 막대는 이제 왼쪽 옆 고정).
  expect(bar.y).toBeGreaterThanOrEqual(0)
  expect(bar.y + bar.height, '펜 상태 세로바가 화면 안').toBeLessThanOrEqual(vw.h)
  const thick = (await page.locator('#thick').boundingBox())!
  expect(thick.x + thick.width, '굵기 막대가 세로바 왼쪽').toBeLessThanOrEqual(vw.w - bar.width - 2)
  console.log(`[측정] 자리 — 세로바 ${Math.round(bar.width)}×${Math.round(bar.height)} · 연필통 ${Math.round(tray.width)}×${Math.round(tray.height)} / 화면 ${vw.w}×${vw.h}`)
  if (testInfo.project.name === 'dpr1') {
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    writeFileSync(resolve(HERE, '../../stage0/out/sidebar_layout_web2.json'), JSON.stringify({
      what: 'web2-12 3·6번 — 세로바·연필통이 차지하는 자리 실측(CSS px·뷰포트 1200×800 헤드리스). e2e sidebar.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47). 실기기(가림이 거슬리는가)는 DEFERRED.',
      viewport: vw,
      sidebar: { w: Math.round(bar.width), h: Math.round(bar.height) },
      tray: { w: Math.round(tray.width), h: Math.round(tray.height) },
      note: '세로바 높이가 뷰포트에 닿는 정도는 위 팔(화면 안 수용)이 단언한다 — 800에서 여유가 작다. 실기기 CSS 높이는 dpr이 정한다(AS-C30의 그 자리).',
    }, null, 1))
  }
})
