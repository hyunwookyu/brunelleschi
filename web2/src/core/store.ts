// 문서 저장소(web2-43 5번) — **여러 문서 + 썸네일**을 담는다. IndexedDB.
//
// ⚠⚠ **왜 옮겼는가**(§0의 실측 — `stage0/out/store43_web2.json`):
//
//     localStorage 실측 상한   5241856 units   ← 실제로 QuotaExceededError에 부딪혀 쟀다
//     한 문서의 실사용 바이트   238456 B       ← filesize27_web2.json(옐로 100획)
//     IndexedDB 예산           6442450944 B    ← storage.estimate().quota
//
// 그런 문서 **21.9개면 localStorage가 꽉 찬다**. 「최근 드로잉 목록」은 여러 문서를
// 전제하므로 그 상한 안에서는 성립하지 않는다. 지시문의 조건부(「상한이 충분하면 이전하지
// 마라 — 필요 없는 이주는 위험만 산다」)에 대해 **수가 이전 쪽을 가리켰다.**
//
// ⚠ **저장 형식은 안 바뀐다**(지시문 「하지 말 것」). 여기 담기는 `data`는
// `serializeBrnl`이 낸 **그 문자열 그대로**다 — 저장소가 바뀌었을 뿐이다.
//
// ⚠⚠ **썸네일은 문서 JSON 안에 안 들어간다**(지시 4번 문면) — 창고를 가른다(`thumbs`).
// 문서 크기가 이미지 크기로 오염되면 27-3의 절감이 무의미해진다.
//
// ⚠⚠⚠ **이름은 식별자가 아니다**(지시 3번) — 열쇠는 `id`(불변)이고 `name`은 사람의 것이다.
// 이름을 바꾸는 것은 `docs`의 한 필드를 고치는 일이고 `data`·썸네일을 안 건드린다.

const DB_NAME = 'brunelleschi'
const DB_VERSION = 1
const DOCS = 'docs'
const THUMBS = 'thumbs'

/** 목록에 뜨는 것 — **`data`가 없다**(목록을 그리려고 문서 전부를 읽지 않는다) */
export interface DocMeta {
  /** 불변 열쇠 — 이름과 **다른 축**이다(이름을 바꿔도 이것은 그대로다) */
  id: string
  name: string
  /** 만든 때 · 마지막으로 바뀐 때(ms) */
  created: number
  updated: number
  /** 저장물 바이트(UTF-16 코드 유닛) — 진단과 상한 거동에 쓴다 */
  bytes: number
}

export interface DocRecord extends DocMeta {
  /** `serializeBrnl`이 낸 문자열 그대로 */
  data: string
}

/** 저장소가 통째로 안 될 때(사생활 모드·용량 초과·열기 실패) — 부르는 쪽이 **알린다**.
 *  조용히 삼키지 않는다: 「조용히 잃는 것이 최악이다」(지시 2번). */
export class StoreError extends Error {
  constructor(public readonly where: string, cause?: unknown) {
    super(`저장소 ${where} 실패`)
    this.cause = cause
  }
}

// ── 반증 손잡이(D-3) — **이전을 실제로 실패시켜 본다** ───────────────────────────
// 지시문 게이트: 「(이전했다면) 이전 실패 시 옛 데이터가 살아 있다 — **실패를 실제로
// 일으켜 확인하라**」. 그래서 실패를 만들 수 있는 자리를 남긴다(앱에는 UI가 없다).
export type FailMode = null | 'open' | 'put' | 'verify'
let failMode: FailMode = null
export const setStoreFailForTest = (m: FailMode): void => { failMode = m }
export const storeFailMode = (): FailMode => failMode

let dbp: Promise<IDBDatabase> | null = null

/** 열려 있는 연결을 버린다(팔 전용) — 다음 호출이 다시 연다 */
export const resetStoreForTest = (): void => { dbp?.then(db => db.close()).catch(() => {}); dbp = null }

export function openStore(): Promise<IDBDatabase> {
  if (failMode === 'open') return Promise.reject(new StoreError('열기'))
  if (dbp) return dbp
  dbp = new Promise<IDBDatabase>((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new StoreError('열기')); return }
    let req: IDBOpenDBRequest
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch (e) { rej(new StoreError('열기', e)); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' })
      // **따로 산다** — 목록이 썸네일을 읽어도 문서 본문을 안 끌어온다(지시 4번)
      if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS, { keyPath: 'id' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(new StoreError('열기', req.error))
    req.onblocked = () => rej(new StoreError('열기'))
  })
  dbp.catch(() => { dbp = null })   // 실패는 안 굳힌다 — 다음에 다시 시도한다
  return dbp
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openStore().then(db => new Promise<T>((res, rej) => {
    let req: IDBRequest
    try {
      const t = db.transaction(store, mode)
      req = fn(t.objectStore(store))
      t.onabort = () => rej(new StoreError(store, t.error))
    } catch (e) { rej(new StoreError(store, e)); return }
    req.onsuccess = () => res(req.result as T)
    req.onerror = () => rej(new StoreError(store, req.error))
  }))
}

/** 목록 — **최신순**(지시 4번). `data`는 떼어 낸다. */
export async function listDocs(): Promise<DocMeta[]> {
  const all = await run<DocRecord[]>(DOCS, 'readonly', s => s.getAll())
  return all
    .map(({ id, name, created, updated, bytes }) => ({ id, name, created, updated, bytes }))
    .sort((a, b) => b.updated - a.updated)
}

export async function getDoc(id: string): Promise<DocRecord | null> {
  const r = await run<DocRecord | undefined>(DOCS, 'readonly', s => s.get(id))
  return r ?? null
}

export async function putDoc(rec: DocRecord): Promise<void> {
  if (failMode === 'put') throw new StoreError(DOCS)
  await run<IDBValidKey>(DOCS, 'readwrite', s => s.put(rec))
}

/** 이름만 바꾼다 — **다른 데이터를 안 건드린다**(지시 3번). 없는 문서면 아무 일도 안 한다. */
export async function renameDoc(id: string, name: string): Promise<boolean> {
  const rec = await getDoc(id)
  if (!rec) return false
  await putDoc({ ...rec, name })
  return true
}

/** 문서와 그 썸네일을 함께 지운다 — 짝이 남으면 목록에 유령이 생긴다 */
export async function deleteDoc(id: string): Promise<void> {
  await run<undefined>(DOCS, 'readwrite', s => s.delete(id))
  await run<undefined>(THUMBS, 'readwrite', s => s.delete(id))
}

export async function putThumb(id: string, thumb: string): Promise<void> {
  await run<IDBValidKey>(THUMBS, 'readwrite', s => s.put({ id, thumb }))
}

export async function getThumb(id: string): Promise<string | null> {
  const r = await run<{ id: string; thumb: string } | undefined>(THUMBS, 'readonly', s => s.get(id))
  return r?.thumb ?? null
}

/** 목록 한 번에 쓸 썸네일 — 없는 것은 그냥 빠진다(그림이 없는 문서도 목록에 뜬다) */
export async function allThumbs(): Promise<Map<string, string>> {
  const all = await run<{ id: string; thumb: string }[]>(THUMBS, 'readonly', s => s.getAll())
  return new Map(all.map(x => [x.id, x.thumb]))
}

// ── 이름과 열쇠 ────────────────────────────────────────────────────────────────

/** 기본 이름 — **만든 날짜·시각**이다(지시 3번: 「제목 없음 1」보다 낫다).
 *  ⚠ 사람이 읽는 것이므로 지역 시각이다. 형식은 `2026-09-01 08:44`. */
export function defaultDocName(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

let seq = 0

/** 불변 열쇠 — 시각 + 세션 안 일련 + 난수 넷.
 *  ⚠ `Math.random` ⛔(§5 · selfcheck가 정적으로 잡는다) — `crypto`를 쓴다. 없으면
 *  시각·일련만으로도 한 기기 안에서는 안 부딪힌다(두 탭이 같은 ms에 같은 일련을 낼 때만
 *  겹치는데, 그 경우도 아래 난수가 있으면 안 겹친다). */
export function newDocId(now: number): string {
  const n = ++seq
  let salt = ''
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.getRandomValues) {
    const b = new Uint8Array(4)
    c.getRandomValues(b)
    salt = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  }
  return `d${now.toString(36)}-${n.toString(36)}${salt ? '-' + salt : ''}`
}

// ── 이전(localStorage → IndexedDB) ───────────────────────────────────────────
// **복사 → 검증 → 삭제**다(지시 5번 문면 그대로). 옮기다 실패하면 옛것이 **그대로 남는다**.
// ⚠ 옛 열쇠 둘을 **각각** 옮긴다: 앱은 새 열쇠가 있으면 옛 열쇠를 안 읽지만, 그렇다고
//   지워도 되는 것은 아니다(다른 그림일 수 있다). 이전은 «잃지 않는 일»이므로 둘 다 산다.

export const LS_KEYS = ['b2-autosave2', 'b2-autosave'] as const

export interface MigrateResult {
  /** 옮긴 문서 수 */
  moved: number
  /** 옮긴 문서의 열쇠들(최신이 앞) */
  ids: string[]
  /** 실패한 옛 열쇠들 — **그 열쇠는 안 지웠다**(옛것이 살아 있다) */
  failed: string[]
  /** 옮길 것이 없었다 */
  empty: boolean
}

/** localStorage의 자동 저장을 문서 저장소로 옮긴다.
 *  @param now 지금(ms) — 이름과 시각의 출처. 팔이 주입한다(#73: 시계를 안 읽는다).
 *  @returns 무엇을 옮겼고 무엇이 남았는가. **던지지 않는다** — 실패도 값이다. */
export async function migrateFromLocal(now: number): Promise<MigrateResult> {
  const out: MigrateResult = { moved: 0, ids: [], failed: [], empty: true }
  let ls: Storage
  try { ls = localStorage } catch { return out }
  const seen = new Set<string>()
  for (const key of LS_KEYS) {
    let text: string | null = null
    try { text = ls.getItem(key) } catch { text = null }
    if (!text || seen.has(text)) { if (text) { try { ls.removeItem(key) } catch { /* 없다 */ } } continue }
    out.empty = false
    seen.add(text)
    const id = newDocId(now)
    const rec: DocRecord = { id, name: defaultDocName(now), created: now, updated: now, bytes: text.length, data: text }
    try {
      // ① 복사
      await putDoc(rec)
      // ② 검증 — **읽어서 바이트로 견준다**(썼다는 것과 읽힌다는 것은 다른 물음이다 #91)
      const back = await getDoc(id)
      if (failMode === 'verify' || !back || back.data !== text) throw new StoreError('검증')
      // ③ 그때서야 삭제
      ls.removeItem(key)
      out.moved++
      out.ids.push(id)
    } catch {
      // 옛것은 **안 지운다**. 반쯤 쓰인 새것은 치운다(목록에 유령을 안 남긴다).
      try { await deleteDoc(id) } catch { /* 저장소가 통째로 죽었으면 그것도 못 한다 */ }
      out.failed.push(key)
    }
  }
  return out
}
