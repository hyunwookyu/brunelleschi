// web2-74 §0·§1 — **멈춤에 이름을 붙이는 자**.
//
// 73이 «프레임이 무겁다»를 재는 자를 세웠고(render3d 여덟 걸음 · GL 업로드 · 프레임 고리 장부),
// 실기기 값이 온 뒤에 보인 것은 다른 것이었다: 프레임은 충분한데(fps 78~104) **가끔 몇 초씩
// 통째로 멎는다.** 그 «멎음»에 이름을 붙이는 것이 여기 사는 일이다.
//
// 자료는 둘뿐이다.
//   ① **구간 표식(span)** — 메인 스레드를 오래 잡을 수 있는 자리를 두른다(일곱: save.serialize ·
//      save.put · save.thumb · bake.commit · tex.upload · doc.parse · doc.build).
//   ② **멈춤 목록(stall)** — rAF 사이가 문턱(`stallMs`)을 넘으면 한 줄을 남긴다:
//      «언제 · 몇 ms · 그 동안 무엇이 열려 있었나». 겹치면 가장 안쪽 것, 아무것도 없으면 `?`.
//
// ⚠ **자가 잡는 것은 «화면이 안 그려진 시간»이다**(rAF 간격). 사람이 본 것이 그것이고
//   (「몇 초씩 멎는다」), longtask가 없는 브라우저(Safari)에서도 같은 값이 나온다.
//   longtask는 73의 `longestBlockMs`가 계속 든다 — 화면에서는 내렸고 진단·원장에만 남는다.
// ⚠ 탭이 숨으면 rAF가 안 돈다 — 그 구간은 «멈춤»이 아니고 여기에도 안 잡힌다(값의 범위).
// ⚠ 표식은 **계측만**이다. 두르는 것이 하는 일을 한 자도 안 바꾼다.

export interface Span { name: string; t0: number; t1: number; depth: number; sync: boolean }
export interface Stall {
  /** 앱이 뜬 뒤 몇 ms에 났나(performance.now 기준 · 목록에는 초로 적는다) */ t: number
  /** 몇 ms 동안 화면이 안 그려졌나 */ ms: number
  /** 그 동안 열려 있던 표식(동기 구간 우선 · 겹치면 가장 안쪽 · 없으면 `?`) */ mark: string
  /** 이름이 **비동기 구간**에서만 나왔나 — 그 ms는 «메인이 막힌 시간»이 아니라 «기다린 시간»이다 */
  asyncOnly?: boolean
  /** 겹친 것이 없을 때(`?`) — **직전에 끝난 표식**과 그 뒤로 흐른 ms.
   *  지시문의 문면이 「직전에 무엇이 돌았나」다: 멈춤이 JS 밖(합성·GPU 되읽기·저장소 커밋)에
   *  있으면 어떤 표식도 «열려» 있지 않다. 그때 자가 `?`만 내면 아무 데도 못 가리킨다 —
   *  그래서 직전에 끝난 것을 같이 든다. ⚠ 이것은 **귀속이 아니라 이웃**이다(인과가 아니다). */
  prev?: string
  prevAgoMs?: number
}

/** 두르는 일곱 자리 — 이름의 정본. 팔이 「일곱이 다 나왔나」를 이 목록으로 센다. */
export const MARK_NAMES = [
  'save.serialize', 'save.put', 'save.thumb', 'bake.commit', 'tex.upload', 'doc.parse', 'doc.build',
  // ⬇ 74 §2가 **값을 따라가** 더한 둘(지시문의 일곱 밖). 세 팔의 멈춤이 전부 `?`로 나왔고,
  //   `?`는 「어느 표식도 열려 있지 않았다」는 뜻이다 — 그러면 자를 더 심어야 한다(D-1).
  //   저장이 끝난 «뒤»에 도는 것이 최근 목록 다시 그리기다: 저장소에서 문서 목록과 **썸네일
  //   전부**를 읽어(구조화 복제) `<img src="data:image/jpeg;…">`로 다시 붙인다.
  'list.read', 'list.render',
] as const
export type MarkName = (typeof MARK_NAMES)[number]

const SPAN_RING = 128
const STALL_RING = 32

const open: { name: string; t0: number; sync: boolean }[] = []
const done: Span[] = []
const stalls: Stall[] = []
const counts: Record<string, { n: number; ms: number; maxMs: number }> = {}
const agg = { n: 0, maxMs: 0, sumMs: 0 }

// ── 문턱 훑기(#12 — 동작점 하나로 주장하지 않는다) ────────────────────────────────
// 「멈춤 몇 회」는 문턱이 정한다. 하나만 세면 그 문턱이 기계의 잡음 바닥에 걸렸을 때
// 팔 사이의 차가 통째로 잡음이 된다(74 §2에서 실제로 났다 — 두 실행이 뒤집혔다).
// 그래서 **모든 프레임 간격**을 문턱 사다리에 얹어 센다. 값은 계수기 몇 개뿐이다.
export const GAP_BUCKETS = [30, 50, 100, 200, 400, 800, 1600] as const
const buckets: { n: number[]; sum: number[] } = { n: GAP_BUCKETS.map(() => 0), sum: GAP_BUCKETS.map(() => 0) }
/** 프레임 간격의 총계 — 잡음 바닥을 팔마다 같이 볼 수 있게 «전부»를 센다 */
const gapAll = { frames: 0, sumMs: 0, maxMs: 0 }
export const gapLadder = (): { thresholds: number[]; n: number[]; sumMs: number[]; frames: number; sumAllMs: number; maxMs: number } =>
  ({ thresholds: [...GAP_BUCKETS], n: buckets.n.slice(), sumMs: buckets.sum.map(v => Math.round(v)), frames: gapAll.frames, sumAllMs: Math.round(gapAll.sumMs), maxMs: Math.round(gapAll.maxMs * 10) / 10 })

let stallMs = 200   // 기본은 C.PERF_STALL_MS가 넣는다(installPerfMark) — 팔이 낮춰 쓴다

export function setStallMs(ms: number): void { stallMs = ms }
export function stallThresholdMs(): number { return stallMs }

/** `sync=false`면 **기다리는 시간이 섞인 구간**이다(await를 덮는다) — 귀속에서 뒤로 밀린다(아래) */
export function markStart(name: string, sync = true): void { open.push({ name, t0: performance.now(), sync }) }

export function markEnd(name: string): void {
  // 가장 안쪽의 **같은 이름**을 닫는다(짝이 안 맞아도 스택이 새지 않게 — 계측이 앱을 망치면 안 된다)
  for (let i = open.length - 1; i >= 0; i--) {
    if (open[i]!.name !== name) continue
    const s = open[i]!
    open.splice(i, 1)
    const t1 = performance.now()
    done.push({ name, t0: s.t0, t1, depth: i, sync: s.sync })
    if (done.length > SPAN_RING) done.shift()
    const c = counts[name] ?? (counts[name] = { n: 0, ms: 0, maxMs: 0 })
    const d = t1 - s.t0
    c.n++; c.ms += d; if (d > c.maxMs) c.maxMs = d
    return
  }
}

/** 동기 구간 — 두르는 것이 곧 그 일이다(값도 그대로 돌려준다) */
export function mark<T>(name: string, fn: () => T): T {
  markStart(name)
  try { return fn() } finally { markEnd(name) }
}

/** 비동기 구간(IndexedDB 쓰기 등) — «도는 동안»을 덮는다. 그 안에 논 시간이 섞이므로
 *  귀속에서는 겹침이 더 큰 동기 구간이 있으면 그쪽이 이긴다(아래 attribute). */
export async function markAwait<T>(name: string, fn: () => Promise<T>): Promise<T> {
  markStart(name, false)
  try { return await fn() } finally { markEnd(name) }
}

/** [t0, t1] 구간에 걸친 표식 중 이름을 고른다.
 *
 *  ⚠⚠ **동기 구간이 비동기 구간을 이긴다**(2026-09-07 리뷰어 [4]가 잡은 자리). 비동기 구간
 *  (`markAwait` — IndexedDB 왕복 등)은 **기다리는 동안 남이 일한 시간까지 덮는다.** 그래서
 *  겹침만으로 고르면 «0.5초 기다린 저장소 읽기»가 «그 동안 실제로 메인을 막은 굽기»의 이름을
 *  훔친다 — 74가 실제로 그렇게 한 번 틀린 이름을 냈다(열 때의 501ms를 `list.read`로 적었는데
 *  같은 자리를 `bake.commit`이 막고 있었다). 멈춤은 «메인이 막힌 것»이므로 **동기 구간이 정본**이다.
 *
 *  차례: ① 겹치는 **동기** 구간 중 겹침이 가장 큰 것 → 같으면 가장 안쪽 것
 *        ② 동기 구간이 하나도 안 겹치면 그때만 비동기 구간(그 사실을 `asyncOnly`가 든다)
 *        ③ 아무것도 없으면 `?` */
export function attribute(t0: number, t1: number): string {
  return attributeFull(t0, t1).name
}

export function attributeFull(t0: number, t1: number): { name: string; sync: boolean; asyncOnly: boolean } {
  const pick = (wantSync: boolean): { name: string; ov: number } | null => {
    let bestName = ''
    let bestOv = 0
    let bestDepth = -1
    const consider = (name: string, a: number, b: number, depth: number, sync: boolean): void => {
      if (sync !== wantSync) return
      const ov = Math.min(b, t1) - Math.max(a, t0)
      if (ov <= 0) return
      if (ov > bestOv + 1e-9 || (Math.abs(ov - bestOv) <= 1e-9 && depth > bestDepth)) {
        bestName = name; bestOv = ov; bestDepth = depth
      }
    }
    for (const s of done) consider(s.name, s.t0, s.t1, s.depth, s.sync)
    for (let i = 0; i < open.length; i++) consider(open[i]!.name, open[i]!.t0, t1, i, open[i]!.sync)
    return bestName ? { name: bestName, ov: bestOv } : null
  }
  const s = pick(true)
  if (s) return { name: s.name, sync: true, asyncOnly: false }
  const a = pick(false)
  if (a) return { name: a.name, sync: false, asyncOnly: true }
  return { name: '?', sync: false, asyncOnly: false }
}

/** 프레임 하나가 시작할 때 부른다 — 직전 프레임이 끝난 뒤 `gapMs`가 흘렀다.
 *  문턱을 넘으면 한 줄을 남기고 그 줄을 돌려준다(안 넘으면 null). */
/** 그 시각 «앞»에서 가장 늦게 끝난 표식 — 겹친 것이 없을 때의 이웃(귀속 아님) */
export function lastEndedBefore(t: number): { name: string; agoMs: number } | null {
  let best: Span | null = null
  for (const s of done) if (s.t1 <= t && (!best || s.t1 > best.t1)) best = s
  return best ? { name: best.name, agoMs: t - best.t1 } : null
}

export function noteGap(nowMs: number, gapMs: number): Stall | null {
  gapAll.frames++
  gapAll.sumMs += gapMs
  if (gapMs > gapAll.maxMs) gapAll.maxMs = gapMs
  for (let i = 0; i < GAP_BUCKETS.length; i++) if (gapMs >= GAP_BUCKETS[i]!) { buckets.n[i]!++; buckets.sum[i]! += gapMs }
  if (!(gapMs >= stallMs)) return null
  const t0 = nowMs - gapMs
  const a = attributeFull(t0, nowMs)
  const s: Stall = { t: nowMs, ms: gapMs, mark: a.name }
  if (a.asyncOnly) s.asyncOnly = true
  if (s.mark === '?') {
    const p = lastEndedBefore(t0)
    if (p) { s.prev = p.name; s.prevAgoMs = Math.round(p.agoMs * 10) / 10 }
  }
  stalls.push(s)
  if (stalls.length > STALL_RING) stalls.shift()
  agg.n++
  agg.sumMs += gapMs
  if (gapMs > agg.maxMs) agg.maxMs = gapMs
  return s
}

export const recentStalls = (n = 5): Stall[] => stalls.slice(-n)
/** §2의 세 팔 표가 읽는 것 — 멈춤 «횟수 · 최장 · 합» */
export const stallStats = (): { n: number; maxMs: number; sumMs: number; thresholdMs: number; recent: Stall[] } =>
  ({ n: agg.n, maxMs: agg.maxMs, sumMs: agg.sumMs, thresholdMs: stallMs, recent: stalls.slice() })
export const markCounts = (): Record<string, { n: number; ms: number; maxMs: number }> =>
  Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { ...v }]))
export const openMarks = (): string[] => open.map(o => o.name)

export function resetPerfMarks(): void {
  open.length = 0; done.length = 0; stalls.length = 0
  for (const k of Object.keys(counts)) delete counts[k]
  agg.n = 0; agg.maxMs = 0; agg.sumMs = 0
  for (let i = 0; i < GAP_BUCKETS.length; i++) { buckets.n[i] = 0; buckets.sum[i] = 0 }
  gapAll.frames = 0; gapAll.sumMs = 0; gapAll.maxMs = 0
}

/** 목록 한 줄의 문면 — 화면과 원장이 **같은 함수**를 쓴다(#54). `t=12.4s · 1,850ms · save.serialize` */
export const stallLine = (s: Stall): string =>
  `t=${(s.t / 1000).toFixed(1)}s · ${Math.round(s.ms).toLocaleString('en-US')}ms · `
  + (s.mark === '?' && s.prev ? `?→${s.prev}` : s.asyncOnly ? `~${s.mark}` : s.mark)
