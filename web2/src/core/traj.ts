// web2-35 1번 — **궤적 특징**(online). 모양(래스터 MLP · digitnet)을 **버리지 않고 더한다**.
//
// 왜 따로 짜는가: `digitnet`은 MNIST로 학습된 **래스터** MLP이고 MNIST는 스캔 이미지라
// 궤적 표본이 아예 없다(web2-32의 원장 `trajectory_not_added`가 적은 그대로). 그러므로
// 궤적은 **모형 안에 못 넣는다** — 모형 **밖에서 세 번째 시야**로 더한다.
//
// ⚠⚠ **이 회차가 재는 것은 «궤적이 무엇을 살리는가»이지 «인식기가 좋아졌는가»가 아니다.**
// 32-4의 원장이 낸 실패 구조가 그 이유다(`glyph32_web2.json` per_form_box):
//   880칸 중 **틀림은 2**뿐이고 **거부가 372**다. 클래스끼리 헷갈리는 자리가 사실상 없다.
//   그래서 «후보 재순위»(궤적의 관용적 용법)는 여기서 할 일이 없다 — 할 일은
//   **거부를 되살리는 것**이고, 그것이 이 파일의 유일한 발화 조건이다.
//
// 특징 목록은 지시 35-1이 못 박은 여섯이다: 시작/끝 방향 · 방향 전환(개수·위치) ·
// 획 순서 · 획 수 · 붓 뗀 자리 · 공중 경로. 여기에 **방향 히스토그램**(펜 경로 전체의
// 길이가중 8방위)과 **되짚기**를 더한다 — 되짚기는 「4·닫힌·1획(되짚어 내려긋기)」처럼
// 래스터에서 **정보가 통째로 사라지는** 몸짓이다(같은 픽셀을 두 번 지난다).
//
// ⚠ **정규화는 긴 변 기준(비 보존)이다.** 방향은 손이 실제로 움직인 방향이고 축마다
// 다르게 늘이면 그 방향이 거짓이 된다. (비를 펴는 것은 래스터 시야의 몫이다 — web2-32.)

import type { Pt } from './vec'

const M = 24                   // 획당 재표집 점 수
const TURN_MIN = Math.PI / 4.5 // 방향 전환으로 세는 최소 꺾임 ≈ 40°
const RETRACE_EPS = 0.06       // 되짚기 판정 반경(정규 좌표)
const RETRACE_GAP = 4          // 이웃 점을 되짚기로 안 세게 두는 간격

export interface TrajFeat {
  n: number                                     // 획 수
  starts: Pt[]; ends: Pt[]                      // 각 획의 시작·끝 자리(획 순서 그대로)
  startDirs: Pt[]; endDirs: Pt[]                // 각 획의 시작 방향·끝 방향(단위벡터)
  turns: { x: number; y: number; a: number }[]  // 방향 전환 지점 — 자리와 부호 있는 각
  lifts: Pt[]                                   // 붓을 뗀 자리(마지막 획 끝은 뗀 자리가 아니다)
  air: { dx: number; dy: number; len: number }[] // 획과 획 사이의 이동(공중 경로)
  dirHist: number[]                             // 8방위 길이가중 히스토그램(합 1)
  undirHist: number[]                           // 위를 **방향 없이** 접은 4빈(위약 팔용)
  totalTurn: number                             // 누적 |Δθ| ÷ 2π
  retrace: number                               // 되짚은 길이 몫(0..1)
  closure: number                               // 전체 시작점↔끝점 거리(정규)
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const unit = (p: Pt): Pt => { const L = Math.hypot(p.x, p.y); return L > 0 ? { x: p.x / L, y: p.y / L } : { x: 0, y: 0 } }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** 획 하나를 길이 균등하게 M점으로 다시 놓는다. 길이가 0이면 같은 점 M개. */
function resample(st: Pt[]): Pt[] {
  if (st.length === 0) return []
  const seg: number[] = []
  let L = 0
  for (let i = 1; i < st.length; i++) { const d = dist(st[i]!, st[i - 1]!); seg.push(d); L += d }
  if (!(L > 0)) return new Array(M).fill(0).map(() => ({ x: st[0]!.x, y: st[0]!.y }))
  const out: Pt[] = [{ x: st[0]!.x, y: st[0]!.y }]
  const step = L / (M - 1)
  let acc = 0, i = 1, target = step
  while (out.length < M && i < st.length) {
    const s = seg[i - 1]!
    if (acc + s >= target) {
      const t = s > 0 ? (target - acc) / s : 0
      const a = st[i - 1]!, b = st[i]!
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      target += step
    } else { acc += s; i++ }
  }
  while (out.length < M) out.push({ x: st[st.length - 1]!.x, y: st[st.length - 1]!.y })
  return out
}

/** 획 묶음 → 궤적 특징. **긴 변으로 등비 축소**하고 상자 중심을 원점에 둔다. */
export function trajFeat(strokes: Pt[][]): TrajFeat | null {
  const live = strokes.filter(st => st.length > 0)
  if (live.length === 0) return null
  let lox = Infinity, loy = Infinity, hix = -Infinity, hiy = -Infinity
  for (const st of live) for (const p of st) {
    lox = Math.min(lox, p.x); loy = Math.min(loy, p.y)
    hix = Math.max(hix, p.x); hiy = Math.max(hiy, p.y)
  }
  const span = Math.max(hix - lox, hiy - loy)
  if (!(span > 0)) return null
  const cx = (lox + hix) / 2, cy = (loy + hiy) / 2
  const R = live.map(st => resample(st).map(p => ({ x: (p.x - cx) / span, y: (p.y - cy) / span })))

  const starts: Pt[] = [], ends: Pt[] = [], startDirs: Pt[] = [], endDirs: Pt[] = []
  const turns: { x: number; y: number; a: number }[] = []
  const dirHist = new Array(8).fill(0)
  let histTotal = 0, totalTurn = 0, retraceLen = 0, pathLen = 0

  const lead = Math.max(1, Math.round(M * 0.15))   // 시작·끝 방향을 재는 구간(길이의 15%)
  for (const r of R) {
    starts.push(r[0]!); ends.push(r[M - 1]!)
    startDirs.push(unit(sub(r[Math.min(lead, M - 1)]!, r[0]!)))
    endDirs.push(unit(sub(r[M - 1]!, r[Math.max(0, M - 1 - lead)]!)))
    for (let i = 1; i < M; i++) {
      const d = sub(r[i]!, r[i - 1]!)
      const L = Math.hypot(d.x, d.y)
      if (L <= 0) continue
      pathLen += L
      const ang = Math.atan2(d.y, d.x)                       // y는 아래로
      const b = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8
      dirHist[b] += L; histTotal += L
    }
    // 방향 전환 — 이웃 접선각의 차. |Δθ|가 문턱을 넘는 **국소 최대**만 한 점으로 센다.
    const th: number[] = []
    for (let i = 1; i < M; i++) th.push(Math.atan2(r[i]!.y - r[i - 1]!.y, r[i]!.x - r[i - 1]!.x))
    const d: number[] = []
    for (let i = 1; i < th.length; i++) {
      let a = th[i]! - th[i - 1]!
      while (a > Math.PI) a -= 2 * Math.PI
      while (a < -Math.PI) a += 2 * Math.PI
      d.push(a); totalTurn += Math.abs(a)
    }
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]!) < TURN_MIN) continue
      if (i > 0 && Math.abs(d[i - 1]!) > Math.abs(d[i]!)) continue
      if (i < d.length - 1 && Math.abs(d[i + 1]!) >= Math.abs(d[i]!)) continue
      turns.push({ x: r[i + 1]!.x, y: r[i + 1]!.y, a: d[i]! })
    }
    // 되짚기 — 같은 획 안에서 **간격을 둔 앞부분**을 다시 지나는 몫
    for (let i = RETRACE_GAP; i < M; i++) {
      let hit = false
      for (let j = 0; j <= i - RETRACE_GAP && !hit; j++) if (dist(r[i]!, r[j]!) < RETRACE_EPS) hit = true
      if (hit) retraceLen += dist(r[i]!, r[i - 1]!)
    }
  }
  const lifts = ends.slice(0, -1)
  const air = lifts.map((e, i) => {
    const s = starts[i + 1]!
    return { dx: s.x - e.x, dy: s.y - e.y, len: dist(s, e) }
  })
  const H = histTotal > 0 ? dirHist.map(v => v / histTotal) : dirHist
  const U = [0, 1, 2, 3].map(k => H[k]! + H[k + 4]!)      // 방향을 접는다(위약 팔)
  return {
    n: R.length, starts, ends, startDirs, endDirs, turns, lifts, air,
    dirHist: H, undirHist: U,
    totalTurn: totalTurn / (2 * Math.PI),
    retrace: pathLen > 0 ? retraceLen / pathLen : 0,
    closure: dist(R[0]![0]!, R[R.length - 1]![M - 1]!),
  }
}

/** 어느 항을 켜는가 — **위약 팔**이 궤적 성분만 끄고 같은 구조를 돌게 한다(D-3).
 *  `false`인 항은 거리 계산에서 **빠진다**(0을 더하는 것이 아니라 분모에서도 빠진다 — #16). */
export interface TrajWeights {
  dir: boolean      // 시작/끝 방향 · 방향 히스토그램(방향 있음)
  turn: boolean     // 방향 전환의 개수와 자리
  order: boolean    // 획 순서(i번째 획의 시작·끝 자리를 순서대로 견준다)
  count: boolean    // 획 수
  lift: boolean     // 붓 뗀 자리
  air: boolean      // 공중 경로
  shape: boolean    // 방향을 접은 히스토그램 — **궤적이 아닌** 항(위약의 남는 몫)
}
export const FULL: TrajWeights = { dir: true, turn: true, order: true, count: true, lift: true, air: true, shape: true }
/** 궤적 성분을 전부 끈 판 — 남는 것은 «방향 없는 모양»뿐이다(위약 팔) */
export const SHAPE_ONLY: TrajWeights = { dir: false, turn: false, order: false, count: false, lift: false, air: false, shape: true }

const angDist = (a: Pt, b: Pt) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) / Math.PI
const l1 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / 2

/** 점 집합 사이의 대칭 평균 최근접 거리(방향 전환 자리·붓 뗀 자리에 쓴다). */
function setDist(A: Pt[], B: Pt[]): number {
  if (A.length === 0 && B.length === 0) return 0
  if (A.length === 0 || B.length === 0) return 1
  const one = (P: Pt[], Q: Pt[]) => P.reduce((s, p) => s + Math.min(...Q.map(q => dist(p, q))), 0) / P.length
  return Math.min(1, (one(A, B) + one(B, A)) / 2)
}

/** 두 궤적 사이의 거리 — 켜진 항의 **평균**(각 항이 0..1). 항마다 뜻이 하나다. */
export function trajDist(a: TrajFeat, b: TrajFeat, w: TrajWeights = FULL): number {
  const terms: number[] = []
  if (w.dir) {
    const k = Math.min(a.n, b.n)
    let s = 0
    for (let i = 0; i < k; i++) s += (angDist(a.startDirs[i]!, b.startDirs[i]!) + angDist(a.endDirs[i]!, b.endDirs[i]!)) / 2
    terms.push(l1(a.dirHist, b.dirHist))
    terms.push(k > 0 ? s / k : 1)
  }
  if (w.turn) {
    terms.push(Math.min(1, Math.abs(a.turns.length - b.turns.length) / 4))
    terms.push(setDist(a.turns.map(t => ({ x: t.x, y: t.y })), b.turns.map(t => ({ x: t.x, y: t.y }))))
    terms.push(Math.min(1, Math.abs(a.totalTurn - b.totalTurn)))
  }
  if (w.order) {
    const k = Math.min(a.n, b.n)
    let s = 0
    for (let i = 0; i < k; i++) s += (dist(a.starts[i]!, b.starts[i]!) + dist(a.ends[i]!, b.ends[i]!)) / 2
    terms.push(k > 0 ? Math.min(1, s / k / 0.7) : 1)      // 0.7 ≈ 정규 상자의 대각 절반
  }
  if (w.count) terms.push(Math.min(1, Math.abs(a.n - b.n) / 2))
  if (w.lift) terms.push(setDist(a.lifts, b.lifts))
  if (w.air) {
    const k = Math.min(a.air.length, b.air.length)
    let s = 0
    for (let i = 0; i < k; i++) s += Math.min(1, Math.hypot(a.air[i]!.dx - b.air[i]!.dx, a.air[i]!.dy - b.air[i]!.dy) / 1.4)
    terms.push(a.air.length === 0 && b.air.length === 0 ? 0 : k > 0 ? s / k : 1)
  }
  if (w.shape) {
    terms.push(l1(a.undirHist, b.undirHist))
    terms.push(Math.min(1, Math.abs(a.retrace - b.retrace) * 2))
    terms.push(Math.min(1, Math.abs(a.closure - b.closure)))
  }
  return terms.length > 0 ? terms.reduce((x, y) => x + y, 0) / terms.length : 1
}
