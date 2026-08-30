// 34-7 — **자연 분포**의 픽스처. 「사람이 옳은 값을 적었는데도 잰 값과 벌어지는 폭」을 만든다.
//
// 벌어지는 출처는 «적은 값이 틀려서»가 아니라 **기하가 흔들려서**다(지시 문면):
//   ㉠ **끝점 지터** — 손으로 그은 선의 끝이 정확히 그 자리가 아니다
//      (선례: `web/test/scene3d.ts`의 `endJitter` — 그림 대각 대비 σ. 스윕도 그 대역을 쓴다)
//   ㉡ **카메라 섭동** — 소실점을 사람이 맞추므로 축 방향에 각도 오차가 있다
//      (선례: `stage0/out/camera_gate.json@f351839a`의 `deg_0.25` 행 = 실측 축 오차 중앙 0.4838°)
//   ㉢ 축척을 정한 **첫 치수 자체**의 오차 — 그 획이 분모이므로 뒤 치수 전부에 실린다
//      (이 파일의 비는 «이상 상자의 길이비 ÷ 흔들린 상자의 길이비»라 분모의 흔들림이 자동으로 실린다)
//
// ⚠ **손으로 좌표를 doc에 밀어넣지 않는다** — `session.draw`(앱과 같은 경로)로 그린다.
// 스냅·축 판정이 지터의 일부를 도로 잡아 주는 것도 **앱이 실제로 내는 값**이므로 같이 잰다.

import { session } from './session'
import { W, H } from './fixtures'
import { rng32 } from '../src/core/material'
import { setDimension } from '../src/app/state'
import { dimSkew, skewOff } from '../src/core/dim'
import { len3, sub3, type Pt } from '../src/core/vec'

export const HY = 400            // 지평선 y — `fixtures.ts`와 같다

/** 상자 하나의 구도. 소실점 둘은 지평선 위에 있고(2점) 앞모서리는 지평선 아래에 있다. */
export interface Comp {
  name: string
  vp0x: number; vp1x: number     // 소실점 둘의 x (y = HY)
  cx: number; cy: number         // 앞아래 모서리
  t0: number; t1: number         // 그 모서리에서 각 소실점 쪽으로 간 비율
  h: number                      // 앞모서리 높이(px)
}

/** 실사용 대역을 덮는 넷(D-5) — 소실점 거리 · 상자 크기 · 앞모서리 높이를 갈랐다.
 *  ⚠ 「먼 소실점」은 `fixtures.wideDoc`의 근거 그대로다(건축 투시도는 화면 폭의 2~3배 밖). */
export const COMPS: Comp[] = [
  { name: '가까운 VP(±0.3~0.4W) · 큰 상자', vp0x: 900, vp1x: 100, cx: 520, cy: 620, t0: 0.42, t1: 0.36, h: 260 },
  { name: '먼 VP(±2.5~3W) · 큰 상자', vp0x: 3600, vp1x: -3000, cx: 560, cy: 640, t0: 0.11, t1: 0.09, h: 280 },
  { name: '중간 VP · 작은 상자(짧은 획)', vp0x: 1700, vp1x: -600, cx: 600, cy: 500, t0: 0.10, t1: 0.10, h: 90 },
  { name: '비대칭 VP · 납작한 상자', vp0x: 1300, vp1x: -1900, cx: 470, cy: 560, t0: 0.20, t1: 0.13, h: 130 },
]

// ── 화면 기하 ────────────────────────────────────────────────────────────
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** 두 직선 (p→q) × (r→s)의 교점. 평행이면 null. */
function isect(p: Pt, q: Pt, r: Pt, s: Pt): Pt | null {
  const d1 = { x: q.x - p.x, y: q.y - p.y }, d2 = { x: s.x - r.x, y: s.y - r.y }
  const den = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(den) < 1e-12) return null
  const t = ((r.x - p.x) * d2.y - (r.y - p.y) * d2.x) / den
  return { x: p.x + d1.x * t, y: p.y + d1.y * t }
}

/** 직선 (p→vp)와 세로선 x=X의 교점 */
function isectVert(p: Pt, vp: Pt, X: number): Pt | null {
  const dx = vp.x - p.x
  if (Math.abs(dx) < 1e-12) return null
  return { x: X, y: p.y + (vp.y - p.y) * (X - p.x) / dx }
}

/** **소실점을 δ도 어긋나게 잡는다** — 앞모서리에서 본 방향각을 δ 돌린 뒤 지평선과 다시 만난다.
 *  (소실점을 지평선 밖으로 옮기면 그것은 2점이 아니라 지평선이 기운 것이라 다른 실험이 된다.) */
export function vpOff(c: Comp, vpx: number, deg: number): Pt {
  const base = { x: vpx, y: HY }
  if (deg === 0) return base
  const v = { x: base.x - c.cx, y: base.y - c.cy }
  const th = deg * Math.PI / 180, co = Math.cos(th), si = Math.sin(th)
  const r = { x: v.x * co - v.y * si, y: v.x * si + v.y * co }
  if (Math.abs(r.y) < 1e-9) return base
  const k = (HY - c.cy) / r.y
  return { x: c.cx + r.x * k, y: HY }
}

export interface BoxEdge { name: string; a: Pt; b: Pt }

/** 상자 하나의 열두 모서리 — **그리는 순서**대로다(작도 둘이 먼저, 그다음 세로·가로). */
export function boxEdges(c: Comp, vp0: Pt, vp1: Pt): BoxEdge[] | null {
  const B0 = { x: c.cx, y: c.cy }
  const B1 = lerp(B0, vp0, c.t0)
  const B2 = lerp(B0, vp1, c.t1)
  const B3 = isect(B1, vp1, B2, vp0)
  const T0 = { x: c.cx, y: c.cy - c.h }
  if (!B3) return null
  const T1 = isectVert(T0, vp0, B1.x), T2 = isectVert(T0, vp1, B2.x)
  if (!T1 || !T2) return null
  const T3 = isectVert(T1, vp1, B3.x)
  if (!T3) return null
  return [
    { name: 'depth0(B0→B1)', a: B0, b: B1 },     // 작도 1 — vp0을 정한다
    { name: 'depth1(B0→B2)', a: B0, b: B2 },     // 작도 2 — vp1을 정한다
    { name: 'vert0(B0→T0)', a: B0, b: T0 },      // ← **축척 획**(첫 치수가 여기 붙는다)
    { name: 'vert1(B1→T1)', a: B1, b: T1 },
    { name: 'vert2(B2→T2)', a: B2, b: T2 },
    { name: 'top0(T0→T1)', a: T0, b: T1 },
    { name: 'top1(T0→T2)', a: T0, b: T2 },
    { name: 'bot0(B1→B3)', a: B1, b: B3 },
    { name: 'bot1(B2→B3)', a: B2, b: B3 },
    { name: 'vert3(B3→T3)', a: B3, b: T3 },
    { name: 'top2(T1→T3)', a: T1, b: T3 },
    { name: 'top3(T2→T3)', a: T2, b: T3 },
  ]
}

/** 정규분포 한 개(Box–Muller) — 시드는 `rng32`뿐이다(`Math.random` ⛔ · CLAUDE.md §5) */
export function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12), v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface Drawn {
  ids: (number | null)[]                 // 모서리 순서 그대로 (안 그려졌으면 null)
  lens: (number | null)[]                // 3D 길이(세계 단위) — 안 올라갔으면 null
  app: ReturnType<typeof session>['app']
}

/** 상자 하나를 **앱 경로로** 그린다. `jit`은 그림 대각 대비 끝점 σ, `deg`는 소실점 각 오차. */
export function drawBox(c: Comp, jit: number, deg0: number, deg1: number, seed: number): Drawn | null {
  const vp0 = vpOff(c, c.vp0x, deg0), vp1 = vpOff(c, c.vp1x, deg1)
  const edges = boxEdges(c, vp0, vp1)
  if (!edges) return null
  // 지터의 자는 **그림 대각**이다(선례: `web/test/scene3d.ts` — 화면 폭이 아니라 그림 크기)
  const xs = edges.flatMap(e => [e.a.x, e.b.x]), ys = edges.flatMap(e => [e.a.y, e.b.y])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const r = rng32(seed * 7919 + 1)
  const j = (p: Pt): Pt => jit <= 0 ? p
    : { x: p.x + gauss(r) * jit * diag, y: p.y + gauss(r) * jit * diag }

  const s = session(W, H)
  s.draw(100, HY, 1100, HY)                       // 지평선 — `fixtures.two()`와 같은 첫 획
  const ids: (number | null)[] = []
  for (const e of edges) {
    // 획마다 **따로** 빗나간다 — 같은 모서리를 두 획이 겨냥해도 끝점이 어긋난다
    const a = j(e.a), b = j(e.b)
    const st = s.draw(a.x, a.y, b.x, b.y)
    ids.push(st ? st.id : null)
  }
  const lens = ids.map(id => {
    if (id === null) return null
    const g = s.app.lift.lifted.get(id)
    return g ? len3(sub3(g.b3, g.a3)) : null
  })
  return { ids, lens, app: s.app }
}

export const SCALE_EDGE = 2          // vert0 — 축척을 정하는 획의 자리
export const SCALE_MM = 2400         // 그 획에 적는 값

export interface Cell {
  comp: string; seed: number; jit: number; deg: number
  edge: string
  written: number; measured: number
  ratio: number                      // 적은 값 ÷ 잰 값
  fold: number                       // **대칭 자** — `dimSkew`가 낸 값 그대로다(#54: 자는 하나다)
  off: boolean                       // **제품의 판정 그대로** — `skewOff`가 낸다(팔이 자를 다시 안 짠다)
}

/** 한 구도·한 씨의 칸들. `mult`는 **오독 배수**(1이면 옳게 적은 것 = 자연 분포).
 *  `round`면 적는 값을 치수 스냅 눈금(50 mm)으로 반올림한다 — 사람은 둥근 수를 적는다. */
export function cells(c: Comp, jit: number, deg: number, seed: number, mult = 1, round = false): Cell[] {
  // ㉠ **의도**는 흔들리지 않은 상자다 — 사람이 «그리려던 것»이고 «적는 값»의 출처다
  const ideal = drawBox(c, 0, 0, 0, seed)
  if (!ideal) return []
  // ㉡ 실제로 그린 것 — 끝점 지터 + 소실점 각 오차(축마다 따로 · 부호는 씨가 정한다)
  const rs = rng32(seed * 104729 + 7)
  const sg = () => (rs() < 0.5 ? -1 : 1)
  const drawn = drawBox(c, jit, deg * sg(), deg * sg(), seed)
  if (!drawn) return []

  const iA = ideal.lens[SCALE_EDGE] ?? null, dA = drawn.lens[SCALE_EDGE] ?? null
  const idA = drawn.ids[SCALE_EDGE] ?? null
  if (iA === null || dA === null || idA === null || !(iA > 0) || !(dA > 0)) return []
  if (setDimension(drawn.app, idA, SCALE_MM) !== 'scale') return []

  const out: Cell[] = []
  const edges = boxEdges(c, { x: c.vp0x, y: HY }, { x: c.vp1x, y: HY })!
  for (let i = 0; i < edges.length; i++) {
    if (i === SCALE_EDGE) continue                 // 축척 획은 **구성상 1**이다(분모다)
    const id = drawn.ids[i] ?? null, iL = ideal.lens[i] ?? null, dL = drawn.lens[i] ?? null
    if (id === null || iL === null || dL === null || !(iL > 0) || !(dL > 0)) continue
    // 사람은 «의도한 길이»를 적는다 — 그 값은 흔들리지 않은 상자의 비에서 나온다
    const exact = SCALE_MM * (iL / iA) * mult
    const written = round ? Math.max(50, Math.round(exact / 50) * 50) : exact
    if (setDimension(drawn.app, id, written) !== 'applied') continue
    const k = dimSkew(drawn.app.lift, id)
    // 다음 칸에 안 실리게 되돌린다 — 한 번에 «둘째 치수 하나»만 본다(AS-C119의 구도)
    delete drawn.app.doc.strokes.find(x => x.id === id)!.dim
    if (!k) continue
    out.push({
      comp: c.name, seed, jit, deg, edge: edges[i]!.name,
      written: k.written, measured: k.measured, ratio: k.ratio, fold: k.fold, off: skewOff(k),
    })
  }
  return out
}
