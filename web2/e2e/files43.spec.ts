// web2-43 2·3·4·5번 — **자동저장 · 복구 · 이름 · 최근 드로잉 · 이전**의 게이트.
//
// ⚠⚠ **왜 e2e인가**(PITFALLS #94): 「저장된다」·「탭을 닫아도 남는다」·「이전이 실패하면
// 옛것이 산다」는 전부 **행위**이고, 그 행위가 일어나는 런타임은 브라우저다. 순수 함수
// 왕복(vitest `roundtrip43`)은 직렬화 층만 잰다 — 두 층을 안 섞는다.
//
// 게이트(지시문 문면 그대로):
//   ㉠ 복구      획 → 강제 종료 → 다시 열기 → 그대로(마지막 커밋까지)
//   ㉡ 썸네일    저장 후 목록에 뜨고, 그 시점 도면과 일치하며, **UI가 안 찍혀 있다**
//   ㉢ 열기 전 자동저장  다른 문서를 열어도 현재 문서가 안 사라진다
//   ㉣ 이름      바꿔도 **다른 데이터를 안 건드린다**
//   ㉤ 이전      localStorage의 옛 자동 저장이 옮겨 온다 · **실패시키면 옛것이 산다**
//   ㉥ 깨진 파일 잘린 저장물이 「읽은 데까지 + 알림」으로 열린다
//   ㉦ 상한 거동 큰 문서 여럿일 때 무엇이 일어나는가(재고 원장에 남긴다)

import { test, expect, type Page } from '@playwright/test'
import { clearStore, bootDone } from './store43'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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

/** 저장소를 **비우고** 연다 — 팔끼리 문서를 물려주지 않는다(#70의 형태).
 *  비우는 것과 기다리는 것의 출처는 `e2e/store43.ts` 하나다(#54). */
async function fresh(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await clearStore(page)
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__b2)
  await bootDone(page)
}

/** 예약된 저장을 앞당기고 저장소를 읽는다 */
async function dump(page: Page) {
  return page.evaluate(async () => {
    const d = (window as any).__b2.diag
    await d.storeFlush()
    return d.storeDump() as Promise<{ current: string; docs: any[]; data: string | null; thumb: string | null }>
  })
}

/** 상자 하나 — 작도가 닫히고 내용 획이 붙는다 */
async function box(page: Page) {
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  await drawLine(page, 500, 560, 500, 380)
}

const openFilePane = async (page: Page) => {
  if (!(await page.evaluate(() => (document.getElementById('pane-file') as HTMLDetailsElement).open))) {
    await page.click('#pane-file > summary')
  }
}

test('㉠ 복구 — 획 → 강제 종료 → 다시 열기 → 그대로(마지막 커밋까지)', async ({ page }) => {
  await fresh(page)
  await box(page)
  const before = await dump(page)
  expect(before.data, '커밋마다 저장한다 — 사건이지 주기가 아니다').toBeTruthy()
  const strokes = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(strokes).toBe(4)

  // **강제 종료** — 페이지를 그대로 죽여 다시 연다(정상 종료 훅이 없다는 것이 핵심이다).
  // playwright의 reload는 «닫고 다시 여는 것»과 같은 자리다: 앱의 정리 코드가 못 돈다.
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__b2)
  await bootDone(page)
  await page.waitForFunction(() => (window as any).__b2.app.doc.strokes.length > 0, undefined, { timeout: 10_000 })
  const after = await page.evaluate(() => ({
    n: (window as any).__b2.app.doc.strokes.length,
    id: (window as any).__b2.diag.docNow().id,
  }))
  expect(after.n, '마지막 커밋까지 그대로다').toBe(4)
  expect(after.id, '같은 문서로 돌아온다 — 열쇠가 살아 있다').toBe(before.current)
  // 그리고 **저장물이 바이트로 같다**(왕복이 실제 저장소에서도 닫힌다 — 43-1의 e2e 판)
  const back = await dump(page)
  expect(back.data).toBe(before.data)
})

/** 썸네일 한 장의 «잉크» — 판정자는 픽셀이다(#92).
 *  ⚠⚠ **화면 전체를 세면 안 된다**: 상자를 그리면 카메라가 닫히고 **지평선이 자동으로
 *  숨는다**(web2-17 5부). 그래서 dpr2에서 「빈 종이 160 → 그린 뒤 31」이 나왔다 —
 *  잉크가 는 것이 아니라 **지평선이 빠진 것**을 센 것이다(#87: 재는 대상이 틀렸다).
 *  그래서 **지평선 아래의 상자 자리**만 센다(y 420~560 · x 240~760 — 지평선은 y 400이다).
 *  `uiInk`는 오른쪽 세로바 자리(~54 CSS px)를 화면 높이 전체에서 센다. */
async function inkOf(page: Page, url: string) {
  return page.evaluate(async (u: string) => {
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u })
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const dat = g.getImageData(0, 0, c.width, c.height).data
    const W = window.innerWidth, H = window.innerHeight
    const bx0 = Math.floor(c.width * 240 / W), bx1 = Math.ceil(c.width * 760 / W)
    const by0 = Math.floor(c.height * 420 / H), by1 = Math.ceil(c.height * 560 / H)
    const uiX = Math.floor(c.width * (1 - 54 / W))
    let ink = 0
    let uiInk = 0
    // 종이색은 #f5f3ee(≈243) — 그보다 **뚜렷하게 어두운** 화소가 잉크다.
    // ⚠ 문턱을 170으로 잡았던 초판은 9개만 셌다(연필은 옅고, 160px로 줄이면 선이 흐려진다).
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        const lum = (dat[i]! + dat[i + 1]! + dat[i + 2]!) / 3
        if (lum >= 225) continue
        if (x >= uiX) uiInk++
        if (x >= bx0 && x < bx1 && y >= by0 && y < by1) ink++
      }
    }
    return { w: c.width, h: c.height, ink, uiInk }
  }, url)
}

test('㉡ 썸네일 — 목록에 뜨고 · 도면과 일치하고 · UI가 안 찍혀 있다', async ({ page }) => {
  await fresh(page)
  // **대조군**(D-3) — 빈 종이의 썸네일. 아래 「도면이 찍혔다」가 무조건 참이 아님을 이것이 낸다.
  await settle(page); await settle(page)
  const blank = await inkOf(page, await page.evaluate(() => (window as any).__b2.diag.captureThumb() as string))
  await box(page)
  const d = await dump(page)
  expect(d.thumb, '저장 시점의 화면이 구워진다').toBeTruthy()
  expect(d.thumb!.startsWith('data:image/'), '그림이다(`data:,`가 아니다)').toBe(true)
  // **문서 JSON 안에 없다**(지시 4번 ⛔) — 그것이 27-3의 절감을 지키는 조건이다
  expect(d.data!.includes('data:image/'), '썸네일이 문서 안에 들어가면 안 된다').toBe(false)

  // 목록에 뜬다 — 파일 서랍 안이다(새 패널이 아니다)
  await openFilePane(page)
  await expect(page.locator('#recent .rrow')).toHaveCount(1)
  await expect(page.locator('#recent .rthumb')).toHaveAttribute('src', /^data:image\//)

  // **그 시점 도면과 일치한다** — 판정자는 픽셀이고, 대조군은 **같은 화면의 빈 종이**다.
  // 그리고 **UI 자리**(오른쪽 세로바)에는 잉크가 없어야 한다: `captureThumb`은 도면
  // 캔버스 셋(gl·brushc·ink)만 합성하고 리본·패널은 그 밖이다.
  const px = await inkOf(page, d.thumb!)
  expect(px.w).toBeGreaterThan(80)
  expect(px.ink, `상자 자리에 도면이 찍혔다 — 빈 종이 ${blank.ink} → 그린 뒤 ${px.ink}`)
    .toBeGreaterThan(blank.ink + 20)
  // UI 자리는 **대조군과 견준다**(절대 0이 아니라 «안 늘었다»): 종이 결이 켜져 있고
  // JPEG 압축이 내용에 따라 흔들려 그 띠에도 한두 화소가 오르내린다. 리본·패널이 찍혔다면
  // 그 띠는 «몇 화소»가 아니라 통째로 달라진다 — 판별력은 그 폭에서 나온다.
  expect(px.uiInk - blank.uiInk, `세로바 자리가 안 바뀌었다 — UI가 안 찍힌다(빈 ${blank.uiInk} → ${px.uiInk})`)
    .toBeLessThanOrEqual(2)

  // **반증(D-3)** — 「그 시점 도면과 일치한다」가 무조건 참이 아니다:
  // **다른 그림의 썸네일**(여기서는 빈 종이의 것)을 같은 자에 넣으면 그 문이 무너진다.
  expect(blank.ink, '다른 그림(빈 종이)의 썸네일은 이 문을 못 넘는다')
    .not.toBeGreaterThan(blank.ink + 20)
  expect(blank.ink < px.ink - 20, '두 썸네일이 이 자로 실제로 갈린다').toBe(true)
})

test('㉢ 열기 전 자동저장 — 다른 문서를 열어도 현재 문서가 안 사라진다', async ({ page }) => {
  await fresh(page)
  await box(page)
  const first = await dump(page)
  expect(first.docs.length).toBe(1)

  // 새 문서로 간다(비우기) — 그리고 다른 그림을 그린다
  await openFilePane(page)
  await page.click('#btn-clear')
  await page.click('.confirm-pop u')
  await page.waitForFunction(() => (window as any).__b2.app.doc.strokes.length === 0)
  await box(page)
  await drawLine(page, 760, 495, 760, 315)
  const second = await dump(page)
  expect(second.current, '새 열쇠다 — 덮어쓰지 않았다').not.toBe(first.current)
  expect(second.docs.length, '문서가 둘이다').toBe(2)

  // 목록에서 첫 문서를 연다 — **지금 그림이 먼저 저장된다**
  await openFilePane(page)
  const rows = page.locator('#recent .rrow')
  await expect(rows).toHaveCount(2)
  await page.locator(`#recent .rrow[data-id="${first.current}"] .rpick`).click()
  await page.waitForFunction((id) => (window as any).__b2.diag.docNow().id === id, first.current, { timeout: 10_000 })
  const back = await dump(page)
  expect(back.current).toBe(first.current)
  expect(back.data, '첫 문서가 바이트로 그대로 돌아왔다').toBe(first.data)
  // 그리고 **둘째 문서가 안 사라졌다**
  expect(back.docs.map(x => x.id).sort()).toEqual([first.current, second.current].sort())
  const secondRec = await page.evaluate(async (id: string) =>
    ((await (window as any).__b2.diag.store.get(id)) as { data: string } | null)?.data ?? null, second.current)
  expect(secondRec).toBe(second.data)
})

test('㉣ 이름 — 기본은 날짜·시각이고, 바꿔도 다른 데이터를 안 건드린다', async ({ page }) => {
  await fresh(page)
  await box(page)
  const before = await dump(page)
  await openFilePane(page)
  const name = page.locator('#doc-name')
  // 기본값 — 「제목 없음 1」이 아니라 만든 날짜·시각이다
  await expect(name).toHaveValue(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  await name.fill('부엌 투시')
  await name.press('Enter')
  await page.waitForFunction(() => (window as any).__b2.diag.docNow().name === '부엌 투시', undefined, { timeout: 5000 })
  const after = await dump(page)
  expect(after.docs[0].name).toBe('부엌 투시')
  expect(after.current, '이름은 식별자가 아니다 — 열쇠가 그대로다').toBe(before.current)
  expect(after.data, '그림은 한 바이트도 안 움직인다').toBe(before.data)
  expect(after.thumb, '썸네일도 그대로다').toBe(before.thumb)
  await expect(page.locator('#recent .rname')).toHaveText('부엌 투시')
})

test('㉤ 이전 — 옛 localStorage 자동 저장이 옮겨 온다', async ({ page }) => {
  await fresh(page)
  await box(page)
  const src = await dump(page)
  // 저장소를 비우고 **옛 자리**(localStorage)에 그 저장물을 둔다 — 43 이전의 상태다
  await clearStore(page)
  await page.evaluate((data: string) => localStorage.setItem('b2-autosave2', data), src.data!)
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__b2)
  await bootDone(page)
  await page.waitForFunction(() => (window as any).__b2.app.doc.strokes.length > 0, undefined, { timeout: 10_000 })
  const moved = await dump(page)
  expect(moved.docs.length, '옮겨 온 문서 하나').toBe(1)
  expect(moved.data, '바이트로 같다').toBe(src.data)
  // **삭제는 검증 뒤다** — 옮겨졌으므로 옛 자리는 비었다
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave2'))).toBeNull()
})

test('㉤-반증(D-3) 이전이 실패하면 **옛 데이터가 살아 있다**', async ({ page }) => {
  await fresh(page)
  await box(page)
  const src = await dump(page)
  const before = src.docs.length
  // 옛 자리에 저장물을 둔다 — **다시 열지 않는다**(열면 부팅이 먼저 옮겨 버려서 이 팔이
  // 잴 것이 없어진다. 초판이 그 자리에서 「옮길 것이 없다」를 「실패 아님」으로 읽었다).
  await page.evaluate((data: string) => localStorage.setItem('b2-autosave2', data), src.data!)
  // **실패를 실제로 일으킨다** — 검증 단계에서 죽는다(복사는 됐는데 읽어 보니 아니다)
  await page.evaluate(() => (window as any).__b2.diag.storeFailForTest('verify'))
  const res = await page.evaluate(async () =>
    (window as any).__b2.diag.store.migrate(Date.now()) as Promise<{ moved: number; failed: string[] }>)
  expect(res.moved, '한 건도 못 옮겼다').toBe(0)
  expect(res.failed.length, '실패로 셌다').toBeGreaterThan(0)
  // **옛것이 그대로 있다** — 이전은 복사 → 검증 → 삭제 순서다
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave2'))).toBe(src.data)
  // 그리고 반쯤 쓰인 새것이 목록에 유령으로 안 남았다
  const ghosts = await page.evaluate(async () => {
    const d = (window as any).__b2.diag
    d.storeFailForTest(null)
    return ((await d.store.list()) as unknown[]).length
  })
  expect(ghosts, '유령이 안 생겼다').toBe(before)
  // 짝(양성 대조) — 관문을 풀면 **같은 호출이 성공한다**(실패가 관문 때문이었다)
  const ok = await page.evaluate(async () =>
    (window as any).__b2.diag.store.migrate(Date.now()) as Promise<{ moved: number; failed: string[] }>)
  expect(ok.moved, '관문을 풀면 옮겨진다').toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave2'))).toBeNull()
})

test('㉥ 깨진 파일 — 잘린 저장물이 「읽은 데까지 + 알림」으로 열린다', async ({ page }) => {
  await fresh(page)
  await box(page)
  await drawLine(page, 300, 300, 700, 320)
  const src = await dump(page)
  const whole = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  // 저장물을 **실제로 자른다**(용량 초과로 쓰다 만 자리의 모양이다)
  await page.evaluate(async ({ id, data }: { id: string; data: string }) => {
    const d = (window as any).__b2.diag
    const rec = await d.store.get(id)
    await d.store.put({ ...rec, data: data.slice(0, Math.floor(data.length * 0.5)) })
  }, { id: src.current, data: src.data! })
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__b2)
  await bootDone(page)
  await page.waitForFunction(() => (window as any).__b2.app.doc.strokes.length > 0, undefined, { timeout: 10_000 })
  const n = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  expect(n, '읽은 데까지 열렸다 — 빈 문서가 아니다').toBeGreaterThan(0)
  expect(n, '조용히 «다 읽었다»고 하지 않는다').toBeLessThan(whole)
  // **알린다** — 무엇을 못 읽었는지가 화면에 있다
  await expect(page.locator('#notice')).toContainText('잘렸다')
})

test('㉦ 상한 거동 — 큰 문서 여럿을 실제로 넣어 본다(원장)', async ({ page }, info) => {
  await fresh(page)
  // 한 문서를 **실사용 대역**으로 키운다(D-5) — 마우스 획은 점이 여덟뿐이라 8.8KB밖에
  // 안 됐고(초판 실측) 그 크기로는 localStorage도 592개를 담는다. 즉 그 팔은 상한을
  // 안 밟는다. 실제 손 획은 점이 241개다(`filesize27_web2.json`의 픽스처) — 그 대역으로
  // 100획을 넣는다. 주입은 **앱의 확정 경로**(`commitStroke`)를 그대로 지난다.
  await box(page)
  await page.evaluate(() => {
    const d = (window as any).__b2.diag
    const press = Array.from({ length: 241 }, (_, i) => 0.4 + 0.3 * Math.sin(Math.PI * i / 240))
    for (let k = 0; k < 100; k++) {
      const ax = 200 + (k % 20) * 12, ay = 180 + Math.floor(k / 20) * 40
      d.commitStroke(ax, ay, ax + 320, ay + 60, { press })
    }
  })
  const one = await dump(page)
  const bytes = one.data!.length
  const oneBytes = await page.evaluate((t: string) => new TextEncoder().encode(t).length, one.data!)

  // 그 문서를 **여러 벌** 저장소에 넣는다 — 이름만 다르고 내용은 같다(크기 대역이 목적)
  const N = 12
  const res = await page.evaluate(async ({ n, data }: { n: number; data: string }) => {
    const d = (window as any).__b2.diag
    const out = { put: 0, error: '' }
    try {
      for (let i = 0; i < n; i++) {
        const id = d.store.newId(Date.now() + i)
        await d.store.put({ id, name: `대문서 ${i}`, created: Date.now(), updated: Date.now() + i, bytes: data.length, data })
        out.put++
      }
    } catch (e) { out.error = String((e as Error).message ?? e) }
    d.recentSync()
    return out
  }, { n: N, data: one.data! })
  expect(res.put, `${N}개가 다 들어간다 — localStorage였으면 상한이 먼저 왔다`).toBe(N)

  const after = await dump(page)
  expect(after.docs.length).toBe(N + 1)
  // 목록은 **보이는 수**만 자른다(저장소에는 다 있다)
  await openFilePane(page)
  // 보이는 수는 **상수**다(`C.RECENT_LIMIT`) — 앱에서 읽는다(팔이 수를 다시 적지 않는다 · #88)
  const shown = await page.evaluate(() => (window as any).__b2.diag.recentLimit() as number)
  await expect(page.locator('#recent .rrow')).toHaveCount(Math.min(N + 1, shown))

  const est = await page.evaluate(async () => {
    if (!navigator.storage?.estimate) return null
    const e = await navigator.storage.estimate()
    return { quota: e.quota ?? null, usage: e.usage ?? null }
  })
  if (process.env.LEDGER === '1' && info.project.name === 'dpr1') {
    const out = resolve(HERE, '../../stage0/out/files43_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-43 ㉦ — 큰 문서 여럿을 실제 저장소(IndexedDB)에 넣었을 때의 거동. files43.spec가 매 실행 다시 쓴다.',
      run: { note: '정본 명령: LEDGER=1 npx playwright test files43 --workers=1', project: info.project.name },
      conditions: {
        fixture: '작도 셋(마우스) + **종이에 직접** 그린 손 획 100(획당 241점 · press 실림 · rawIn press만) · 1200x800 · dpr1',
        why_paper: '종이·트레이싱지 획은 **안 솎인다**(27-3 ⑤) — 옐로만 RDP로 준다. 실사용의 큰 쪽이 이 갈래다.',
        rawIn: 'press만 싣는다(마우스·손가락은 안 싣는다 — types.ts). tiltX/tiltY/twist 없음.',
        harness: 'playwright(files43.spec) — ⚠ filesize27_web2.json은 **vitest**의 다른 픽스처다(#27: 두 하네스의 값을 한 비로 나누지 않는다)',
        unit: 'units = UTF-16 코드 유닛(문자열 length). 이 문서는 거의 ASCII라 바이트와 거의 같다 — 그래도 **둘 다 적는다**(#28).',
      },
      one_doc_units: bytes,
      one_doc_bytes_utf8: oneBytes,
      docs_written: res.put,
      total_docs: after.docs.length,
      sum_of_doc_units: bytes * (res.put + 1),
      sum_note: '이것은 **곱셈**이다(같은 저장물을 여러 벌 넣었다). 실제로 디스크에 든 양은 storage_estimate.usage이고 둘은 다르다 — IndexedDB는 압축·오버헤드가 있다.',
      localstorage_limit_units: 5241856,
      would_fit_in_localstorage: Math.floor(5241856 / bytes),
      fit_note: '분자·분모가 **둘 다 코드 유닛**이다(one_doc_units ÷ localstorage_limit_units).',
      storage_estimate: est,
      estimate_note: 'quota는 실행마다 흔들린다(디스크 여유에 딸린 값) — 대역으로만 읽는다. usage는 **이 쓰기 뒤**에 읽었다.',
      put_error: res.error,
      shown_in_list: shown,
      shown_note: '목록에 보이는 수는 상수 C.RECENT_LIMIT이다 — **저장소에는 다 있다**(total_docs).',
    }, null, 2))
    console.log(`[43 ㉦] 한 문서 ${bytes} units(${oneBytes} B) · ${res.put + 1}개 곱 ${bytes * (res.put + 1)} · 실제 usage ${est?.usage} · localStorage였으면 ${Math.floor(5241856 / bytes)}개 · 목록 ${shown}칸`)
  }
})
