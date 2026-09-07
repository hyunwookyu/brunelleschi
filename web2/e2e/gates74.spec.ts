// web2-74 게이트 — **네 개**(g0 계측 판 · g1 표식 · g2 손잡이 둘 · g3 썸네일).
//
// ⚠⚠ CLOSING 「게이트의 조건」 — 성능·거동 게이트는 «수리 전 값»과 짝을 이룬다. 게이트마다
//   그 짝이 무엇인지 이 파일 안에 적고, **같은 실행에서 실제로 빨강을 낸다**:
//     g0  옛 자(73의 p95)가 같은 눈금 위에서 **0**을 낸다 ↔ 새 자는 0이 아니다
//     g1  표식 **밖**의 같은 막음은 `?`로 적힌다 ↔ 표식 «안»은 그 이름을 얻는다(아홉 전부)
//     g2  깃발이 없으면 손잡이가 «안 걸린다»(저장이 돈다 · 썸네일이 구워진다) ↔ 있으면 0
//     g3  반증 스위치(수리 전 거동)를 켜면 저장 한 번에 `toDataURL` **1** ↔ 끄면 **0**
//   ⚠ 73이 [H5]로 배운 자리다: «항등»이나 «존재 대조»를 빨강 짝으로 세지 않는다. 넷 다
//   같은 실행 안에서 반대 값을 실제로 내는 짝을 가진다.
// ⚠ 시간의 절대값에 문을 걸지 않는다(CLOSING · #113) — 이 파일의 문은 전부 «호출 수»·«이름»·«존재»다.

import { test, expect } from '@playwright/test'
import { PERF74_MARK_NAMES_N } from './thresholds'

/* eslint-disable @typescript-eslint/no-explicit-any */
const MARKS_ALL = ['save.serialize', 'save.put', 'save.thumb', 'bake.commit', 'tex.upload',
  'doc.parse', 'doc.build', 'list.read', 'list.render'] as const

async function boot(page: any, q = ''): Promise<void> {
  await page.goto(q ? `/?${q}` : '/')
  await page.waitForFunction(() => !!(window as any).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.evaluate(() => (window as any).__b2.diag.store.clearForTest())
}

/** 상자 하나를 그린다 — 저장이 도는 최소 문서(빈 문서는 저장소에 안 남는다) */
async function drawBox(page: any): Promise<void> {
  for (const l of [[300, 500, 700, 500], [700, 500, 700, 300], [700, 300, 300, 300], [300, 300, 300, 500]]) {
    await page.mouse.move(l[0]!, l[1]!)
    await page.mouse.down()
    await page.mouse.move(l[2]!, l[3]!, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(40)
  }
}

test('g0 — 계측 판: 「최장 간격」이 fps 1 구간에서 0이 아니다(옛 자 p95는 0) · 멈춤 목록이 뜬다', async ({ page }) => {
  await boot(page, 'perf=1')
  const r = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.resetPerfMarksForTest()
    b2.diag.blockMainForTest(1500)          // 1초 창보다 길게 — 그래야 「fps 1」 자리가 생긴다
    await new Promise(res => setTimeout(res, 900))
    const st = b2.diag.perfStalls()
    const big = st.recent.find((s: any) => s.ms >= 1200)
    const rulers = big ? b2.diag.perfRulersForTest(big.t) : null
    return { n: st.n, big, rulers, text: b2.diag.perfHudForTest().text as string, on: b2.diag.perfHudForTest().on }
  })
  expect(r.on, '?perf=1이면 화면이 뜬다').toBe(true)
  expect(r.n, '멈춤이 목록에 뜬다').toBeGreaterThanOrEqual(1)
  expect(r.big, '1,500ms 급 줄이 있다').toBeTruthy()
  expect(r.big.mark, '표식 밖이라 ?').toBe('?')
  expect(r.rulers.ticksInWindow, '그 순간 1초 창의 눈금은 하나다(= fps 1)').toBe(1)
  // ⛳ 빨강 짝 — **같은 눈금 위에서** 옛 자는 0이고 새 자는 0이 아니다
  expect(r.rulers.old_p95, '옛 자(73의 p95)는 여기서 0이다 — 이것이 수리 전 빨강이다').toBe(0)
  expect(r.rulers.new_maxGapMs, '새 자(최장 간격)는 0이 아니다').toBeGreaterThan(1000)
  // 화면 문면 — 「최장 간격」과 멈춤 목록이 있고 옛 이름은 없다
  expect(r.text).toContain('최장 간격')
  expect(r.text).toContain('멈춤')
  expect(r.text).not.toContain('p95')
  expect(r.text).not.toContain('최장 차단')
})

test('g0-② — 큰 멈춤 뒤의 작은 멈춤이 목록에 남는다(옛 「최장 차단」은 한 칸이었다)', async ({ page }) => {
  await boot(page, 'perf=1')
  const r = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.resetPerfMarksForTest()
    b2.diag.blockMainForTest(2000)
    await new Promise(res => setTimeout(res, 400))
    b2.diag.blockMainForTest(400)
    await new Promise(res => setTimeout(res, 400))
    b2.diag.blockMainForTest(400)
    await new Promise(res => setTimeout(res, 600))
    const st = b2.diag.perfStalls()
    return { n: st.n, recent: st.recent, text: b2.diag.perfHudForTest().text as string }
  })
  expect(r.n, '셋이 다 잡힌다').toBeGreaterThanOrEqual(3)
  const small = r.recent.filter((s: any) => s.ms >= 300 && s.ms < 900)
  expect(small.length, '큰 것 뒤의 작은 둘이 남는다(평생 최댓값 한 칸이면 0이었다)').toBeGreaterThanOrEqual(2)
  expect((r.text.match(/t=/g) ?? []).length, '화면에 최근 다섯까지 줄로 뜬다').toBeGreaterThanOrEqual(3)
})

test('g1 — 표식 아홉이 이름을 붙인다 · 표식 밖은 ?(반증)', async ({ page }) => {
  await boot(page, 'perf=1')
  for (const m of MARKS_ALL) {
    const last = await page.evaluate(async (name) => {
      const b2 = (window as any).__b2
      b2.diag.resetPerfMarksForTest()
      b2.diag.blockInMarkForTest(name, 300)
      await new Promise(res => setTimeout(res, 400))
      const st = b2.diag.perfStalls()
      return st.recent[st.recent.length - 1] ?? null
    }, m)
    expect(last?.mark, m + ' 이 이름으로 붙는다').toBe(m)
  }
  expect(MARKS_ALL.length, '지시문의 일곱 + 74가 값을 따라 더한 둘').toBe(PERF74_MARK_NAMES_N + 2)
  // ⛳ 빨강 짝 — 같은 크기의 막음이 표식 «밖»이면 이름이 없다
  const outside = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.resetPerfMarksForTest()
    b2.diag.blockMainForTest(300)
    await new Promise(res => setTimeout(res, 400))
    const st = b2.diag.perfStalls()
    return st.recent[st.recent.length - 1] ?? null
  })
  expect(outside?.mark, '표식 밖은 ?').toBe('?')
})

test('g2 — 손잡이 둘이 실제로 끈다(깃발 없으면 안 걸린다 · 반증)', async ({ page }) => {
  // ㉠ 깃발 없음 — 저장이 돌고 표식이 남는다(**수리 전 짝**: 손잡이가 안 걸린 판)
  await boot(page)
  await page.evaluate(() => (window as any).__b2.diag.resetPerfMarksForTest())
  await drawBox(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(400)
  const plain = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    return { marks: b2.diag.perfMarks().counts, flags: b2.diag.saveFlagsForTest(),
      stored: !!(await b2.diag.storeDump())?.data, nosaveEl: !!document.getElementById('nosave-flag') }
  })
  expect(plain.flags).toEqual({ nosave: false, nothumb: false })
  expect(plain.marks['save.serialize']?.n ?? 0, '깃발 없으면 저장이 돈다').toBeGreaterThan(0)
  expect(plain.stored, '저장소에 실제로 들었다').toBe(true)
  expect(plain.nosaveEl, '깃발 없으면 「저장 꺼짐」은 DOM에 없다').toBe(false)

  // ㉡ ?nothumb=1 — 저장은 돌고 썸네일만 안 굽는다
  await boot(page, 'nothumb=1')
  await page.evaluate(() => (window as any).__b2.diag.resetPerfMarksForTest())
  await drawBox(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(400)
  const nothumb = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    const d = await b2.diag.storeDump()
    return { marks: b2.diag.perfMarks().counts, flags: b2.diag.saveFlagsForTest(), stored: !!d?.data, thumb: d?.thumb ?? null }
  })
  expect(nothumb.flags).toEqual({ nosave: false, nothumb: true })
  expect(nothumb.marks['save.serialize']?.n ?? 0, '저장은 돈다').toBeGreaterThan(0)
  expect(nothumb.marks['save.thumb'], '썸네일 갈래는 한 번도 안 돈다').toBeUndefined()
  expect(nothumb.stored, '문서는 저장됐다').toBe(true)
  expect(nothumb.thumb, '그림은 없다').toBeNull()

  // ㉢ ?nosave=1 — 저장 자체가 안 돈다 · 「저장 꺼짐」이 화면에 있다
  await boot(page, 'nosave=1')
  await page.evaluate(() => (window as any).__b2.diag.resetPerfMarksForTest())
  await drawBox(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(600)
  const nosave = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    const el = document.getElementById('nosave-flag')
    return { marks: b2.diag.perfMarks().counts, flags: b2.diag.saveFlagsForTest(),
      stored: !!(await b2.diag.storeDump())?.data, strokes: b2.app.doc.strokes.length,
      flagText: el?.textContent ?? null,
      flagClickable: el ? getComputedStyle(el).pointerEvents : null }
  })
  expect(nosave.flags).toEqual({ nosave: true, nothumb: false })
  expect(nosave.marks['save.serialize'], '저장이 아예 안 돈다').toBeUndefined()
  expect(nosave.stored, '저장소에 안 남는다').toBe(false)
  expect(nosave.strokes, '그림은 메모리에 그대로 있다').toBeGreaterThan(0)
  expect(nosave.flagText, '「저장 꺼짐」이 떠 있다').toBe('저장 꺼짐')
  expect(nosave.flagClickable, '표시다 — 눌리지 않는다(69 전수 표에 +0)').toBe('none')
})

test('g3 — §3-3: 저장 한 번에 toDataURL 0(반증: 수리 전 거동은 1) · 목록 그림은 여전히 뜬다', async ({ page }) => {
  await boot(page)
  await drawBox(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(300)
  // ── 지금 판: 획 하나 → 저장 한 번 → toDataURL 호출 0 ──────────────────────────
  const now = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    const before = b2.diag.thumbCallsForTest()
    return { before, state: b2.diag.thumbStateForTest() }
  })
  await page.mouse.move(360, 360); await page.mouse.down(); await page.mouse.move(520, 420, { steps: 3 }); await page.mouse.up()
  await page.waitForTimeout(1200)   // 지연 병합(400ms)보다 넉넉히 — 저장이 실제로 돌았다
  const after = await page.evaluate(() => {
    const b2 = (window as any).__b2
    return { calls: b2.diag.thumbCallsForTest(), marks: b2.diag.perfMarks().counts, state: b2.diag.thumbStateForTest() }
  })
  expect(after.marks['save.serialize']?.n ?? 0, '저장이 돌았다(프로브가 움직였다 #103)').toBeGreaterThan(0)
  expect(after.calls - now.before, '저장 한 번에 toDataURL 호출 0').toBe(0)
  expect(after.state.dirty, '굽어야 한다는 표시는 섰다(잃지 않는다)').toBe(true)

  // ── ⛳ 빨강 짝: **수리 전 거동**을 켜면 같은 몸짓에 호출이 난다 ─────────────────
  await page.evaluate(() => (window as any).__b2.diag.setLegacyThumbForTest(true))
  const b2 = await page.evaluate(() => (window as any).__b2.diag.thumbCallsForTest())
  await page.mouse.move(380, 380); await page.mouse.down(); await page.mouse.move(540, 440, { steps: 3 }); await page.mouse.up()
  await page.waitForTimeout(1200)
  const legacy = await page.evaluate(() => (window as any).__b2.diag.thumbCallsForTest())
  expect(legacy - b2, '수리 전 거동에서는 저장마다 굽는다(빨강)').toBeGreaterThanOrEqual(1)
  await page.evaluate(() => (window as any).__b2.diag.setLegacyThumbForTest(false))

  // ── 목록 그림이 여전히 뜬다(왕복) — 「다른 문서를 열기 전」이 그 자리다 ──────────
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(400)
  const dump = await page.evaluate(() => (window as any).__b2.diag.storeDump())
  expect(dump.thumb, 'flush 뒤에는 그림이 있다').toBeTruthy()
  expect(String(dump.thumb).startsWith('data:image/'), '그림이 아닌 것("data:,")은 안 들어간다(43의 그 자리)').toBe(true)
  const shown = await page.evaluate(() => (document.querySelector('#recent .rthumb') as HTMLImageElement | null)?.src ?? null)
  expect(shown && shown.startsWith('data:image/'), '최근 목록에 그 그림이 붙는다').toBe(true)
})

test('g3-② — 그림 없는 새 문서 무회귀(43의 그 자리): 빈 문서는 저장소에도 그림에도 안 남는다', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(300)
  const empty = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    const d = await b2.diag.storeDump()
    return { strokes: b2.app.doc.strokes.length, data: d?.data ?? null, thumb: d?.thumb ?? null, calls: b2.diag.thumbCallsForTest() }
  })
  expect(empty.strokes, '빈 문서다').toBe(0)
  expect(empty.data, '빈 문서는 저장소에 안 남는다').toBeNull()
  expect(empty.thumb, '그림도 없다').toBeNull()
  expect(empty.calls, '빈 문서에서는 toDataURL을 아예 안 부른다').toBe(0)
})
