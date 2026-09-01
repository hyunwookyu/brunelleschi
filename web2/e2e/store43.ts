// 팔이 **저장소를 읽고 쓰는 한 자리**(web2-43 5번) — `localStorage.getItem('b2-autosave2')`를
// 스펙마다 적던 것을 여기 모은다.
//
// ⚠ 왜 필요해졌는가: 문서가 IndexedDB로 옮겨 갔다(§0의 실측 — localStorage 상한
// 5241856 units에 실사용 문서 966530이면 다섯 개다). 옛 스펙들은 그 열쇠를 직접 읽고
// 있었고, 그대로 두면 **저장소가 바뀐 날 조용히 「없다」를 재게 된다**(#87의 형태).
//
// ⚠⚠ 팔이 제 경로를 만들지 않는다(#88) — 전부 앱의 `diag.store*`를 지난다.

import type { Page } from '@playwright/test'

/** 예약된 저장을 앞당기고 **지금 문서의 저장물**을 낸다(없으면 빈 문자열) */
export async function savedText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const d = (window as any).__b2.diag
    await d.storeFlush()
    const dump = await d.storeDump()
    return (dump?.data ?? '') as string
  })
}

/** 지금 문서의 저장물을 **그 바이트로 바꾼다** — 「같은 바이트를 다시 넣고 연다」의 자리 */
export async function putSaved(page: Page, text: string): Promise<void> {
  await page.evaluate(async (t: string) => {
    const d = (window as any).__b2.diag
    const cur = d.docNow()
    await d.store.put({ id: cur.id, name: cur.name, created: cur.created, updated: Date.now(), bytes: t.length, data: t })
  }, text)
}

/** 저장소를 통째로 비운다(옛 localStorage 열쇠·«보던 문서» 표까지) — 팔끼리 문서를 물려주지 않는다 */
export async function clearStore(page: Page): Promise<void> {
  await page.evaluate(async () => {
    try { localStorage.clear() } catch { /* 없음 */ }
    await new Promise<void>(res => {
      const r = indexedDB.deleteDatabase('brunelleschi')
      r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res()
    })
  })
}

/** 저장물에 획이 `n`개 이상 실릴 때까지 — **상한 있는 대기**다(#95) */
export async function waitSaved(page: Page, n: number, timeout = 8000): Promise<void> {
  await page.waitForFunction(async (want: number) => {
    const d = (window as any).__b2.diag
    await d.storeFlush()
    const dump = await d.storeDump()
    if (!dump?.data) return false
    try { return (JSON.parse(dump.data).strokes ?? []).length >= want } catch { return false }
  }, n, { timeout })
}

/** 부팅 복원이 끝났는가(문서의 정체가 섰는가) — 상한 있는 대기 */
export async function bootDone(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(() => !!(window as any).__b2?.diag?.docNow(), undefined, { timeout })
}
