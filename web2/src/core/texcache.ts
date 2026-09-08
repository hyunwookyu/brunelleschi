// web2-75 §3 — **굽힌 그림의 캐시**(72 §4 ㉡ · 73 ㉡ · 74가 값으로 지목한 그 자리).
//
// 74 §4 실측: 열기 4,768.8ms 중 **굽기 4,759.8ms(99.8%)**다. 파싱 2.7 · 세우기 6.3 — 손댈 자리가 아니다.
// 그래서 굽힌 면을 **그대로 저장해 두고 다음에 열 때 올린다.**
//
// ⚠⚠ **캐시다, 정본이 아니다.** 저장 형식(`.brnl` · KEY_ORDER)을 한 자도 안 건드린다. 지워도 앱은 종전대로
//    동작한다(굽는다). 캐시가 «틀린 그림»을 보이는 길은 없다 — 열쇠가 **그 그림이 의존하는 것 전부의 해시**다(#110):
//      빌드 식별자 | 굽기 열쇠(bakeSig — 단계·계열·해칭·재료·uv 상자) | 그 (면,쪽) 획 서명 전부 | 캔버스 크기
//    하나라도 다르면 열쇠가 다르고, 열쇠가 다르면 캐시는 없다(= 굽는다).
//    **빌드 식별자가 든 이유**: 엔진이 바뀌면 같은 획도 다른 픽셀이 된다 — 그때 옛 비트맵을 올리면
//    그것이 곧 «조용히 틀린 그림»이다(⛔ 43-1).
//
// ⚠ 담는 것은 **날 RGBA 바이트**다(getImageData 그대로). PNG로 줄이지 않는다 — `toDataURL`의 동기 인코딩이
//   74 §3-3에서 저장 갈래의 70.4%였다. 캐시를 만들려고 그 비용을 다시 들이면 앞뒤가 안 맞는다.
//
// ⚠ 캐시가 되살리는 것은 **비트맵뿐이다.** 엔진의 «층»(mypaint surface)은 못 살린다 — 그래서 캐시로 올린 면에
//   새 획이 오면 그 면은 전량 재굽기가 된다(퇴출 뒤와 같은 형태 · 72가 미리 적어 둔 대가). 값으로 센다.

import { C } from './constants'
import { openStore, StoreError } from './store'

export const TEXCACHE = 'texcache'
export const TEXMETA = 'texmeta'

export interface TexCacheEntry { key: string; w: number; h: number; lv: number; bytes: ArrayBuffer }
interface TexMeta { key: string; t: number; n: number }

/** 인메모리 상태 — `'pending'`(왕복 중) · `'miss'`(없다) · 항목(있다) */
type Slot = 'pending' | 'miss' | TexCacheEntry
const mem = new Map<string, Slot>()

const stats = {
  /** 열쇠를 물어본 횟수(면·쪽마다 한 번) */ asks: 0,
  hits: 0, misses: 0,
  /** **캐시에서 올린 (면,쪽)의 수** — 같은 자리를 두 번 올려도 하나로 센다(단계가 자리를 잡으며 두 번 오는 판이 있다).
   *  ⚠ «횟수»로 세면 면 23짜리 문서가 46을 내고 화면의 「캐시 N면」이 거짓이 된다(75가 실제로 그렇게 냈다). */ applied: 0,
  writes: 0, writeBytes: 0, writeSkips: 0,
  evicted: 0,
  /** 왕복을 기다리느라 미룬 프레임 수 */ waitedFrames: 0,
  /** 저장소가 안 되는 판(사생활 모드 등) — 값으로 남긴다(#105: 조용한 폴백 ⛔) */ errors: 0,
}
export const texCacheStats = (): typeof stats & { mem: number } => ({ ...stats, mem: mem.size })
export const resetTexCacheStats = (): void => {
  stats.asks = 0; stats.hits = 0; stats.misses = 0; stats.applied = 0; stats.writes = 0
  stats.writeBytes = 0; stats.writeSkips = 0; stats.evicted = 0; stats.waitedFrames = 0; stats.errors = 0
  appliedKeys.clear()
}

// ── 반증·팔 손잡이(D-3) — 캐시를 끄면 «지금과 똑같이» 굽는다(그 사실이 무회귀의 자다) ────────
let off = false
export function setTexCacheOff(v: boolean): void { off = v; if (v) mem.clear() }
export const texCacheOff = (): boolean => off

declare const __BUILD_ID__: string
const buildId = (): string => { try { return __BUILD_ID__ } catch { return 'dev' } }

/** 32비트 FNV — 굽기가 쓰는 그 꼴 그대로(값을 새로 짓지 않는다) */
function fnv(str: string): number {
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(h ^ str.charCodeAt(i), 0x01000193)) | 0
  return h
}

/** **열쇠** — 그 그림이 의존하는 것 전부(#110). 하나라도 다르면 캐시가 없다. */
export function texCacheKey(bakeSig: string, sigs: readonly string[], w: number, h: number): string {
  return `${buildId()}|${w}x${h}|${(fnv(bakeSig) >>> 0).toString(36)}|${(fnv(sigs.join('')) >>> 0).toString(36)}|${sigs.length}`
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

/** 지금 아는 것(왕복을 시작하지 않는다) — `undefined`면 아직 물어본 적이 없다 */
export const peekTexCache = (key: string): Slot | undefined => (off ? 'miss' : mem.get(key))

/** 왕복을 시작한다 — 끝나면 `mem`이 항목이거나 `'miss'`다. 같은 열쇠로 두 번 안 부른다. */
export function requestTexCache(key: string): void {
  if (off || mem.has(key)) return
  stats.asks++
  mem.set(key, 'pending')
  run<TexCacheEntry | undefined>(TEXCACHE, 'readonly', s => s.get(key)).then(rec => {
    if (rec && rec.bytes && rec.w > 0) { mem.set(key, rec); stats.hits++ } else { mem.set(key, 'miss'); stats.misses++ }
  }).catch(() => { mem.set(key, 'miss'); stats.misses++; stats.errors++ })
}

const appliedKeys = new Set<string>()
export const noteTexCacheApplied = (entryKey: string): void => { appliedKeys.add(entryKey); stats.applied = appliedKeys.size }
export const noteTexCacheWaited = (): void => { stats.waitedFrames++ }
export const noteTexCacheWriteSkip = (): void => { stats.writeSkips++ }

/** 굽힌 면을 담는다(쉴 때 부른다 — 프레임 안에서 부르지 않는다). 상한을 넘으면 오래된 것부터 버린다. */
export async function putTexCache(key: string, w: number, h: number, lv: number, bytes: ArrayBuffer): Promise<void> {
  if (off) return
  try {
    await run<IDBValidKey>(TEXCACHE, 'readwrite', s => s.put({ key, w, h, lv, bytes } satisfies TexCacheEntry))
    await run<IDBValidKey>(TEXMETA, 'readwrite', s => s.put({ key, t: Date.now(), n: bytes.byteLength } satisfies TexMeta))
    mem.set(key, { key, w, h, lv, bytes })
    stats.writes++
    stats.writeBytes += bytes.byteLength
    await trim()
  } catch { stats.errors++ }
}

/** 상한(수·바이트)을 넘으면 **오래된 것부터** 버린다. 메타만 읽으므로 바이트를 안 끌어온다. */
async function trim(): Promise<void> {
  const metas = await run<TexMeta[]>(TEXMETA, 'readonly', s => s.getAll())
  let bytes = 0
  for (const m of metas) bytes += m.n
  if (metas.length <= C.TEXCACHE_MAX_ENTRIES && bytes <= C.TEXCACHE_MAX_BYTES) return
  metas.sort((a, b) => a.t - b.t)                       // 오래된 것이 앞
  let i = 0
  while (i < metas.length && (metas.length - i > C.TEXCACHE_MAX_ENTRIES || bytes > C.TEXCACHE_MAX_BYTES)) {
    const m = metas[i++]!
    bytes -= m.n
    mem.delete(m.key)
    try {
      await run<undefined>(TEXCACHE, 'readwrite', s => s.delete(m.key))
      await run<undefined>(TEXMETA, 'readwrite', s => s.delete(m.key))
      stats.evicted++
    } catch { stats.errors++ }
  }
}

/** 캐시를 비운다(팔·사람이 「캐시가 없을 때」를 볼 때) — 그림은 안 건드린다 */
export async function clearTexCache(): Promise<number> {
  mem.clear()
  try {
    const keys = await run<IDBValidKey[]>(TEXCACHE, 'readonly', s => s.getAllKeys())
    await run<undefined>(TEXCACHE, 'readwrite', s => s.clear())
    await run<undefined>(TEXMETA, 'readwrite', s => s.clear())
    return keys.length
  } catch { stats.errors++; return 0 }
}

/** 인메모리 판만 비운다(저장소는 그대로) — 「같은 판에서 두 번째 열기」를 팔이 만들 때 */
export const dropTexCacheMem = (): void => { mem.clear() }
