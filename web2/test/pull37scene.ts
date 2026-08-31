// 37-6 픽스처와 재기 — **시작점 오스냅이 «허공에서 시작하려는 손»을 얼마나 물어 가는가.**
//
// 이번 라운드는 **값을 안 바꾼다**(지시 문면). 재기만 한다. 그래서 이 파일에는
// 제품 상수가 한 개도 안 적혀 있다 — 반경도 문턱도 **앱에서 읽는다**(#88).
//
// ── 왜 이 형태인가 ──────────────────────────────────────────────────────────
// ① **획 40개 이상**이어야 한다(지시가 못 박았다 · #71 · D-5). 깨끗한 장면(획 두셋)에서는
//    포인터 근처에 후보가 없으니 당김이 0에 가깝게 나오고, 그 0은 앱이 아니라 픽스처를
//    잰 것이다. 30-11(`ext30.test.ts`의 `busy()`)이 같은 이유로 픽스처를 다시 짰다.
// ② **앱과 같은 경로로 그린다** — 장면은 `session().draw`가 만들고(오스냅·축 스냅·리프팅을
//    전부 지난다), 시작점 판정은 `session().startHit`이 낸다. 그 손잡이는 `draw`가 부르는
//    **바로 그 호출**이다(`session.ts` — 팔이 반경 환산식을 다시 적지 않게 손잡이를 뒀다).
// ③ **확정을 안 하는 탐침**이라 같은 장면에서 여러 판(성한 판·위약 판·반경 훑기)을
//    나란히 돌릴 수 있다. 「탐침이 실제 확정과 같은가」는 별도로 확인한다
//    (`confirmCommit` — 새 세션에서 장면을 다시 짓고 실제로 그어 `a`를 대조한다).
//
// ── 「허공에서 시작하려 했다」의 정의(보고에 그대로 적는다) ─────────────────
// 시작점을 **기존 기하와 무관한 분포**에서 뽑는다: 작도 영역 안 균일 난수(`rng32(seed)`).
// 그 점은 어떤 끝점·중점·교점도 겨냥하지 않았다 — 손은 「여기서부터 쫙 긋는다」이지
// 「저 끝점에 맞춘다」가 아니다. 겨냥한 몸짓은 따로 잰다(`aimedControl` — 그 판에서는
// 당김이 아니라 **획득**이 옳은 답이다).
//
// 두 셈을 같이 낸다. 하나만 내면 어느 쪽이든 오해를 준다:
//   · **획득**(`acquired`)  오스냅이 후보를 냈다 = 시작점이 그 후보로 간다
//   · **당김**(`pulled`)    그 후보가 앱 자신의 «같은 점» 문(`TAP_MAX_PX`)보다 **더 멀다**
//     = 사람이 찍은 자리가 실제로 옮겨졌다. 보수적인 셈이고, 이것이 소장이 말한 그 느낌이다.
// 새 문턱을 안 지었다(#54) — 문은 앱이 이미 쓰는 `TAP_MAX_PX`다.

import { session, type Session } from './session'
import { C } from '../src/core/constants'
import { rng32 } from '../src/core/material'
import type { OsnapKind, OsnapSettings } from '../src/core/osnap'
import type { Pt } from '../src/core/vec'

export const W = 1200
export const H = 800

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** **획 40개 이상의 도면**(D-5 · #71). 30-11의 `busy()`와 같은 형태다 — 상자로 카메라를
 *  닫고 그 위에 격자·대각을 쌓아 끝점·중점·교점이 화면 곳곳에 널리게 한다. 그 파일의
 *  함수를 못 가져오는 자리(테스트 파일 안의 지역 함수)라 여기 다시 세운다.
 *
 *  ⚠ 이 장면의 **밀도가 아래 수치의 크기를 정한다**(#46 ⚙️의 형태). 당김 비율은
 *  「앱이 얼마나 세게 무는가」와 「그 자리에 후보가 얼마나 있는가」의 곱이고, 뒤쪽은
 *  픽스처다. 그래서 원장이 밀도(획 수 · 특징점 수 · 면적)를 같이 적는다. */
export function busy37(): Session {
  const s = session(W, H)
  // 카메라를 닫는 셋 — 가로(축) · 깊이(둘째 소실점) · 세로
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  s.draw(500, 560, 500, 660)
  // 격자와 대각 — 「선을 쫙쫙 긋는」 손
  for (let i = 0; i < 6; i++) s.draw(360, 380 + i * 34, 760, 380 + i * 34)
  for (let i = 0; i < 6; i++) s.draw(380 + i * 62, 360, 380 + i * 62, 580)
  for (let i = 0; i < 6; i++) s.draw(360 + i * 60, 380, 420 + i * 60, 560)
  for (let i = 0; i < 6; i++) s.draw(360, 380 + i * 30, 700, 420 + i * 30)
  for (let i = 0; i < 6; i++) s.draw(700 + i * 12, 380, 760, 500 + i * 12)
  for (let i = 0; i < 8; i++) s.draw(300 + i * 40, 620, 340 + i * 40, 700)
  return s
}

/** 도면이 실제로 덮은 자리 — 「허공 시작」을 뽑는 대역 하나가 이것이다.
 *  ⚠ 상수로 안 적는다(#88): 장면을 고치면 대역이 따라온다. */
export function inkBox(s: Session): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const st of s.app.doc.strokes) {
    for (const p of [st.a, st.b]) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
  }
  return { x0, y0, x1, y1 }
}

export const screenBox = (): Box => ({ x0: 0, y0: 0, x1: W, y1: H })

export const area = (b: Box): number => (b.x1 - b.x0) * (b.y1 - b.y0)

// ── 오스냅 설정을 잠깐 갈아 끼운다(팔 안에서만) ─────────────────────────────
/** ⚠ **제품 상수는 안 건드린다.** 갈아 끼우는 것은 `app.osnap`의 **런타임 값**이고,
 *  그것은 사람이 화면의 반경 슬라이더·종류 체크박스로 하는 일과 같은 자리다
 *  (`main.ts`의 `#osnap-radius` · `#osnap-kinds`). 끝나면 되돌린다. */
export function withOsnap<T>(s: Session, over: Partial<OsnapSettings>, fn: () => T): T {
  const old = s.app.osnap
  s.app.osnap = { ...old, ...over, kinds: { ...old.kinds, ...(over.kinds ?? {}) } }
  try { return fn() } finally { s.app.osnap = old }
}

/** 종류 전부 끔 — 위약 ②(오스냅을 끈 판) */
export const allKindsOff = (s: Session): Record<OsnapKind, boolean> => {
  const out = { ...s.app.osnap.kinds }
  for (const k of Object.keys(out) as OsnapKind[]) out[k] = false
  return out
}

// ── 재기 ────────────────────────────────────────────────────────────────────
export interface PullRow {
  /** 손이 의도한 자리(허공) */
  p: Pt
  /** 오스냅이 낸 후보의 종류 — 없으면 null(허공 그대로 선다) */
  kind: OsnapKind | null
  /** 시작점이 실제로 옮겨진 거리(화면 px — 이 팔의 배율은 1이다) */
  moved: number
}

export interface PullStat {
  band: string
  seed: number
  radius: number
  trials: number
  /** 오스냅이 후보를 낸 몸짓 수 */
  acquired: number
  /** 그중 «같은 점» 문보다 멀리 옮겨진 것 = **당김** */
  pulled: number
  moved_median: number
  moved_p90: number
  moved_max: number
  by_kind: Partial<Record<OsnapKind, number>>
  /** 당김 거리의 분포 — 문(TAP_MAX_PX)과 반경 사이 어디에 몰려 있는가 */
  bins: { le_tap: number; tap_to_half: number; half_to_r: number }
}

const med = (xs: number[]): number => {
  if (xs.length === 0) return NaN
  const a = [...xs].sort((x, y) => x - y)
  return a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2
}
const quant = (xs: number[], q: number): number => {
  if (xs.length === 0) return NaN
  const a = [...xs].sort((x, y) => x - y)
  return a[Math.min(a.length - 1, Math.floor(q * a.length))]!
}

/** 허공 시작 몸짓 n개를 뽑아 시작점 판정을 재는다. **확정하지 않는다.**
 *  ⚠ x와 y를 **다른 흐름**에서 뽑는다: `rng32`는 LCG라 «연속한 두 값»이 격자 위에 놓인다
 *  (한 흐름에서 (x,y)를 연달아 뽑으면 표본이 줄무늬가 된다). 시드를 하나 더 갈라 그
 *  짝지음을 끊는다 — 그래도 남는 시드 변동폭은 여러 시드를 돌려 원장에 그대로 적는다(#14). */
export function probe(s: Session, box: Box, seed: number, n: number): PullRow[] {
  const rx = rng32(seed)
  const ry = rng32((seed ^ 0x9e3779b9) >>> 0)
  const rows: PullRow[] = []
  for (let i = 0; i < n; i++) {
    const p: Pt = { x: box.x0 + rx() * (box.x1 - box.x0), y: box.y0 + ry() * (box.y1 - box.y0) }
    const h = s.startHit(p)
    rows.push({ p, kind: h ? h.kind : null, moved: h ? Math.hypot(h.p.x - p.x, h.p.y - p.y) : 0 })
  }
  return rows
}

export function stat(band: string, seed: number, radius: number, rows: PullRow[]): PullStat {
  const tap = C.TAP_MAX_PX
  const hit = rows.filter(r => r.kind !== null)
  const moved = hit.map(r => r.moved)
  const by: Partial<Record<OsnapKind, number>> = {}
  for (const r of hit) if (r.kind) by[r.kind] = (by[r.kind] ?? 0) + 1
  return {
    band, seed, radius,
    trials: rows.length,
    acquired: hit.length,
    pulled: rows.filter(r => r.moved > tap).length,
    moved_median: med(moved),
    moved_p90: quant(moved, 0.9),
    moved_max: moved.length ? Math.max(...moved) : 0,
    by_kind: by,
    bins: {
      le_tap: hit.filter(r => r.moved <= tap).length,
      tap_to_half: hit.filter(r => r.moved > tap && r.moved <= radius / 2).length,
      half_to_r: hit.filter(r => r.moved > radius / 2).length,
    },
  }
}

/** 한 판(반경·종류를 갈아 끼운 상태 포함)을 돌린다 — 반경은 **앱에서 읽는다** */
export function run(
  s: Session, band: string, box: Box, seed: number, n: number, over: Partial<OsnapSettings> = {},
): PullStat {
  return withOsnap(s, over, () => stat(band, seed, s.app.osnap.radius, probe(s, box, seed, n)))
}

// ── 겨냥한 몸짓(대조군) ─────────────────────────────────────────────────────
/** **일부러 물리려는 손** — 장면의 끝점 그 자리, 그리고 그 옆 `off` px.
 *  이 판에서 획득이 안 나면 그것은 「당김이 없다」가 아니라 **팔이 아무것도 못 잰다**는 뜻이다.
 *
 *  `offTarget`은 **겨냥한 그 점이 아닌 후보가 이긴 칸**이다: 겨냥한 끝점에 물리면 이동량이
 *  정확히 `off`인데, `OSNAP_ORDER`는 **거리가 아니라 종류가 앞선다** — 옆에 `vertex`나
 *  `vp`가 반경 안에 있으면 **0 px에 있는 `end`를 이긴다**. 실측으로 그 칸이 있다. */
export interface AimedStat {
  trials: number
  acquired: number
  moved: number[]
  /** |이동량 − off| > TAP_MAX_PX — 겨냥한 점이 아닌 후보가 이겼다 */
  offTarget: number
  moved_median: number
  moved_max: number
}

export function aimedControl(s: Session, off: number): AimedStat {
  const moved: number[] = []
  let acquired = 0, trials = 0
  for (const st of s.app.doc.strokes) {
    for (const e of [st.a, st.b]) {
      const p: Pt = { x: e.x + off, y: e.y }
      trials++
      const h = s.startHit(p)
      if (h) { acquired++; moved.push(Math.hypot(h.p.x - p.x, h.p.y - p.y)) }
    }
  }
  return {
    trials, acquired, moved,
    offTarget: moved.filter(m => Math.abs(m - off) > C.TAP_MAX_PX).length,
    moved_median: med(moved),
    moved_max: moved.length ? Math.max(...moved) : 0,
  }
}

// ── 탐침이 «실제 확정»과 같은가 ─────────────────────────────────────────────
/** 새 세션에서 장면을 **다시 짓고** 실제로 한 획을 그어, 확정된 획의 시작점이
 *  탐침이 예고한 자리와 같은지 본다. 다르면 이 팔 전체가 앱을 안 재고 있는 것이다. */
export function confirmCommit(rows: PullRow[], seed: number): { checked: number; same: number; worst: number } {
  const rnd = rng32(seed)
  let checked = 0, same = 0, worst = 0
  for (const r of rows) {
    const s2 = busy37()
    const h = s2.startHit(r.p)
    const want = h ? h.p : r.p
    // 끝점은 아무 방향으로나 충분히 길게 — 「쫙 긋는」 획이라 탭 문에 안 걸린다
    const th = rnd() * Math.PI * 2
    const L = 80 + rnd() * 120
    const st = s2.draw(r.p.x, r.p.y, r.p.x + Math.cos(th) * L, r.p.y + Math.sin(th) * L)
    if (!st) continue
    checked++
    const d = Math.hypot(st.a.x - want.x, st.a.y - want.y)
    if (d === 0) same++
    if (d > worst) worst = d
  }
  return { checked, same, worst }
}
