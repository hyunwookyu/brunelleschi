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
// 겹침 실측 — 첫 팔이 재고 자리 실측 팔이 원장에 싣는다(한 파일은 한 워커에서 차례로 돈다)
let ovPencil = { overlaps: -1, n: 0, ids: [] as string[] }
let ovPen = { overlaps: -1, n: 0, ids: [] as string[] }
const ALL = ['sidebar-toggle', 'dim-toggle',   // btn-save-view: 종이 탭 「+」가, btn-draw-view: 눈(#eyebar)이 대신한다(web2-19)
  'btn-undo', 'btn-redo', 'btn-snap', 'btn-pencil',
  'tray-2H', 'tray-H', 'tray-F', 'tray-HB', 'tray-B', 'tray-2B', 'btn-pen',
  'btn-eraser-pencil', 'btn-eraser-ink', 'btn-face'] // btn-brush는 서랍 안(web2-19 3-a) — 세로바 목록에서 뺀다

test('세로바 한 규칙 — 크기 대역·오른쪽 정렬·누름 사각형·쌍별 겹침 0 (web2-12 3번)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  // 크기 — 전 요소가 같은 배수(--ui-scale) 대역이다. 임계는 옛 값(괄호)과 새 값 사이:
  // 되돌리면 깨진다. **시점·치수 묶음도 같은 대역**이다(관측 ① — 종전 20px가 30px 대역으로).
  expect((await box(page, '#sidebar-toggle svg')).height).toBeGreaterThanOrEqual(24) // (18→27)
  for (const id of ['btn-undo', 'btn-redo', 'btn-draw-view', 'dim-toggle']) { // btn-brush: 3-c로 설정 안(svg 아이콘도 아님)
    expect((await box(page, `#${id} svg`)).height, `#${id} 크기 대역`).toBeGreaterThanOrEqual(27) // (20→30)
  }
  // 연필통(web2-12 6번 → 3-b' 접힘) — 여섯 줄은 **연필을 눌러 연 동안만** 넓다.
  // 평소 손 띠는 39px 정사각 대역만 남는다(①' — 폭 불일치가 접힘으로 풀렸다).
  await page.click('#btn-pencil'); await page.waitForTimeout(120)   // 연다
  for (const id of ['tray-2H', 'tray-HB', 'tray-2B']) {
    const b = await box(page, `#${id} svg`)
    expect(b.height, `#${id} 행 높이`).toBeGreaterThanOrEqual(21)
    expect(b.width, `#${id} 행 폭(누웠다)`).toBeGreaterThan(b.height * 3)
  }
  await page.click('#tray-HB'); await page.waitForTimeout(120)      // 고르면 접힌다(3-b')
  expect(await page.locator('#tray.open').count(), '고르면 접힌다').toBe(0)
  // 접힌 연필·펜 — 세로 아이콘(옛 ico-t 대역)이고 경도 각인이 있다
  expect((await box(page, '#btn-pencil svg')).height).toBeGreaterThanOrEqual(80)
  expect((await box(page, '#btn-pen svg')).height).toBeGreaterThanOrEqual(80)
  expect(await page.locator('#btn-pencil text').textContent()).toBe('HB')
  expect((await box(page, '#btn-eraser-pencil svg')).height).toBeGreaterThanOrEqual(42) // (32→48)
  expect((await box(page, '#btn-eraser-ink svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#btn-face svg')).height).toBeGreaterThanOrEqual(42)
  expect((await box(page, '#pane-file summary svg')).height).toBeGreaterThanOrEqual(25)  // (19→28)
  // #pane-settings는 web2-19 3-a가 해체했다(오스냅→자 팝업·표시→눈·own3d→진단·질감→서랍)

  // 오른쪽 정렬 — 전 요소 svg의 **오른쪽 가장자리 x가 한 값**이다(관측 ①: align-items가
  // center면 폭이 다른 요소가 섞여 중앙 정렬이 된다 — flex-end로 세운 축을 잰다)
  const rights = await page.evaluate((list) => list.map(id => {
    const el = document.querySelector(`#${id} svg`) as SVGElement
    return { id, right: el.getBoundingClientRect().right }
  }), ALL.filter(id => !id.startsWith('tray-') && id !== 'btn-pen' && id !== 'btn-pencil'))  // 선택된 도구는 앞으로 나온다(-10px)
  const r0 = rights[0]!.right
  for (const r of rights) expect(Math.abs(r.right - r0), `#${r.id} 오른쪽 가장자리`).toBeLessThanOrEqual(1)

  // 누름 사각형 — 보이는 svg보다 사방 --hit-pad 만큼 넓다(관측 ② — 투명한 여유)
  const pads = await page.evaluate((list) => list.map(id => {
    const el = document.getElementById(id)!
    const b = el.getBoundingClientRect()
    const s = el.querySelector('svg')!.getBoundingClientRect()
    return { id, dw: b.width - s.width, dh: b.height - s.height }
  }), ['btn-undo', 'dim-toggle', 'btn-snap'])
  for (const p of pads) {
    expect(p.dw, `#${p.id} 누름 여유(가로)`).toBeGreaterThanOrEqual(5)  // 2×3px − 반올림 여유
    expect(p.dh, `#${p.id} 누름 여유(세로)`).toBeGreaterThanOrEqual(5)
  }

  // 쌍별 겹침 0 — **누름 사각형**(boundingBox) 기준. **두 도구 상태**(연필·펜 — 2차
  // 리뷰어 [3]: 굵기 막대는 흐름 밖이라 구성 보장이 안 걸린다. 막대가 뜬 펜 상태를
  // 포함해 막대까지 전수에 넣는다). 확대는 svg에만 걸린다 — 버튼 상자는 제자리.
  const overlapCount = async (ids: string[]) => {
    const rects = await page.evaluate((list) => list
      .filter(id => {
        const el = document.getElementById(id)
        return el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none'
      })
      .map(id => {
        const b = document.getElementById(id)!.getBoundingClientRect()
        return { id, x: b.x, y: b.y, w: b.width, h: b.height }
      }), ids)
    let overlaps = 0
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ox > 0 && oy > 0) { overlaps++; console.log(`[측정] 겹침 — ${a.id} × ${b.id} (${ox.toFixed(1)}×${oy.toFixed(1)})`) }
      }
    }
    return { overlaps, n: rects.length, ids: rects.map(r => r.id) }
  }
  await page.click('#btn-pencil')                    // 연필통을 **연** 채가 가장 넓은 상태다
  await page.waitForTimeout(200)
  ovPencil = await overlapCount(ALL)
  await page.click('#tray-HB')                       // 고르면 접힌다
  await page.click('#btn-pen')
  await page.waitForTimeout(200)
  ovPen = await overlapCount([...ALL, 'thick'])
  await page.click('#btn-pencil'); await page.click('#tray-HB')
  await page.waitForTimeout(200)
  console.log(`[측정] 쌍별 겹침 — 연필(통 열림) ${ovPencil.overlaps}(요소 ${ovPencil.n}) · 펜+막대 ${ovPen.overlaps}(요소 ${ovPen.n})`)
  expect(ovPencil.overlaps).toBe(0)
  expect(ovPen.overlaps).toBe(0)
  // 펜 상태 = 연필통 여섯 줄이 접히고 굵기 막대가 든다. ⚠ 수 관계식(n−5)이 아니라
  // **id 목록의 차**로 단언한다(#72 규칙 ② — 수만 보면 17 vs 11의 수수께끼가 남는다):
  const expectedPen = [...ovPencil.ids.filter(id => !id.startsWith('tray-')), 'thick']
  expect([...ovPen.ids].sort()).toEqual(expectedPen.sort())

  // 세로바 전체가 화면 높이 안이다(지시 문면 — #sidebar에는 max-height가 없다)
  const bar = await box(page, '#sidebar')
  const vh = await page.evaluate(() => window.innerHeight)
  console.log(`[측정] 세로바 높이 ${Math.round(bar.height)} / 뷰포트 ${vh}`)
  expect(bar.y).toBeGreaterThanOrEqual(0)
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh)

  // 겹침 회귀 — 세로바 요소가 서로를 덮지 않는다(한 흐름이 된 시점·치수 포함 — 각 버튼의
  // 가운데를 실제로 그 버튼이 받는다. web2-10의 «둘째 열» 사고의 재발 방지 그대로).
  for (const id of ['dim-toggle', 'btn-snap']) {
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
  // ⚠ **web2-28 3번이 설명을 툴팁으로 옮겼다**(화면의 말은 이름이거나 짧은 동사구다).
  //   이 팔이 지키는 요구는 「그 둘이 **이름에서** 갈린다」이고 그것은 그대로 선다 —
  //   갈린 것은 설명의 **자리**이므로, 화면에서는 이름을, `title`에서는 설명을 확인한다.
  const paneText = await page.locator('#pane-file > div').textContent()
  expect(paneText).toContain('원본')
  expect(paneText).toContain('내보내기')
  expect(paneText).not.toContain('나가기만 한다')          // 설명은 화면에서 빠졌다
  const heads = await page.locator('#pane-file .head').all()
  const titles = await Promise.all(heads.map(h => h.getAttribute('title')))
  expect(titles.join(' ')).toContain('다시 열 수 있는 원본')
  expect(titles.join(' ')).toContain('못 되돌아온다')       // 정보는 안 지웠다 — 자리만 옮겼다
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
  // 연필통은 접혀 있다(3-b') — 연필을 눌러 연다. 진하기 순(2H → 2B)으로 아래로.
  await page.click('#btn-pencil'); await page.waitForTimeout(120)
  const order = ['tray-2H', 'tray-H', 'tray-F', 'tray-HB', 'tray-B', 'tray-2B']
  const ys = await page.evaluate((ids) => ids.map(id => document.getElementById(id)!.getBoundingClientRect().y), order)
  for (let i = 1; i < ys.length; i++) expect(ys[i]!, `${order[i]}가 ${order[i - 1]} 아래다`).toBeGreaterThan(ys[i - 1]!)
  // 펜 줄은 연필통에 **없다**(3-b' — 펜은 접기 없는 세로 아이콘 하나다)
  expect(await page.locator('#tray #btn-pen').count()).toBe(0)

  // 행 선택 = 도구 + 경도 (한 몸짓) — 고르면 접힌다
  await page.click('#tray-2B')
  expect(await page.evaluate(() => {
    const a = (window as any).__b2.app
    return `${a.tool}:${a.grade}`
  })).toBe('pencil:2B')
  expect(await page.getAttribute('#tray-2B', 'class')).toContain('on')
  expect(await page.getAttribute('#tray-HB', 'class')).not.toContain('on')
  // 경도 각인이 각 행에 있다(자르기 규칙 — 지우개 쪽 몸통) · 접힌 아이콘의 각인·심 색이
  // 고른 경도를 따른다(3-b' ①' — 왕복은 zones.spec가 2H·2B로 잰다)
  expect(await page.locator('#tray-2B text').textContent()).toBe('2B')
  expect(await page.locator('#btn-pencil text').textContent()).toBe('2B')
  expect(await page.locator('#tray.open').count(), '고르면 접힌다').toBe(0)

  // 펜 — 니브는 접힌 펜의 관 폭(fold-nib)이 값이다(굵기 막대와 같은 출처 app.nib)
  await page.click('#btn-pen')
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pen')
  const nib = await page.evaluate(() => (window as any).__b2.app.nib)
  expect(await page.evaluate(() => Number(document.getElementById('fold-nib')!.getAttribute('width')))).toBeCloseTo(nib, 6)

  // 자리 실측(지시 문면: 차지하는 폭·높이 — 그림을 얼마나 가리는가) → 원장.
  // **상태별로 잰다**(2차 [4] — 어느 상태의 값인지 파일이 말해야 한다) · dpr별 파일(2차 [5]).
  const measure = async () => {
    const bar = (await page.locator('#sidebar').boundingBox())!
    return { w: Math.round(bar.width), h: Math.round(bar.height), bottom: Math.round(bar.y + bar.height) }
  }
  const vw = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const barPencil = await measure()          // 지금 연필(HB) 상태다
  await page.click('#btn-pen'); await page.waitForTimeout(150)
  const barPen = await measure()
  const thick = (await page.locator('#thick').boundingBox())!
  // **펜 상태에서도** 화면 안이다 — 굵기 막대가 흐름 안에 있던 초판은 펜을 고른 순간
  // 세로바가 화면(800) 밖으로 넘쳤다(이 실측이 잡았다 — 막대는 이제 왼쪽 옆 고정.
  // 그 초판 값은 일회 진단 기록으로 NOTES에만 있다 — 현행 상태별 값이 이 원장 필드다).
  expect(barPen.bottom, '펜 상태 세로바가 화면 안').toBeLessThanOrEqual(vw.h)
  expect(barPencil.bottom, '연필 상태 세로바가 화면 안').toBeLessThanOrEqual(vw.h)
  expect(thick.x + thick.width, '굵기 막대가 세로바 왼쪽').toBeLessThanOrEqual(vw.w - barPen.w - 2)
  await page.click('#btn-pencil'); await page.waitForTimeout(150)   // 연필통을 연 채로 잰다
  const tray = (await page.locator('#tray').boundingBox())!
  const rightEdge = await page.evaluate(() =>
    (document.querySelector('#btn-undo svg') as SVGElement).getBoundingClientRect().right)
  const hitPad = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--hit-pad').trim())
  await page.click('#tray-HB'); await page.waitForTimeout(100)      // 고르면 접힌다 — 상태 복원
  console.log(`[측정] 자리 — 세로바 연필 ${barPencil.w}×${barPencil.h} · 펜 ${barPen.w}×${barPen.h} · 연필통(연 상태) ${Math.round(tray.width)}×${Math.round(tray.height)} / 화면 ${vw.w}×${vw.h}`)
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율·#71 ㉠의 문 — web2-24 3부 전면화).
  // 팔은 그대로 돈다 — 원장만 안 덮는다. 정본 명령: LEDGER=1 npx playwright test sidebar --workers=1
  if (process.env.LEDGER === '1') writeFileSync(resolve(HERE, `../../stage0/out/sidebar_layout_web2${suffix}.json`), JSON.stringify({
    conditions: {
      workers: testInfo.config.workers, project: testInfo.project.name,
      canonical: 'LEDGER=1 npx playwright test sidebar --workers=1',
      time_validity: '값이 전부 결정론(CSS px 자리·겹침)이라 워커 수가 값을 못 바꾼다 — 조건은 기록용(#71 ㉠ 규약의 일관)',
    },
    what: `web2-12 3·6번 — 세로바·연필통 자리·겹침·정렬 실측(CSS px·뷰포트 1200×800 헤드리스·${testInfo.project.name}). e2e sidebar.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47). 실기기(가림·누르기)는 DEFERRED.`,
    viewport: vw,
    sidebar_pencil: barPencil,
    sidebar_pen: barPen,               // 굵기 막대는 흐름 밖 — 두 상태 높이가 같은 것이 그 증거다
    tray: { w: Math.round(tray.width), h: Math.round(tray.height) },
    thick_right_x: Math.round(thick.x + thick.width),
    overlap: { pencil: ovPencil, pen_with_thick: ovPen },
    right_edge_x: Math.round(rightEdge),
    hit_pad_css: hitPad,
    clip_boundary_css_h: 12 + Math.max(barPencil.h, barPen.h),   // 상단 고정 12px + 최대 높이 — 이 아래면 잘린다(AS-C30 갱신의 근거 필드)
    note: '판정(겹침 0·화면 안·오른쪽 축·크기 대역)은 팔의 단언이 정본이고 이 원장은 그 실측값의 기록이다.',
  }, null, 1))
})
