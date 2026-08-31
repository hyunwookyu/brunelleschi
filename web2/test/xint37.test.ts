// web2-37 1번 — **점과 방향, 그리고 우선순위**. 이 파일의 결과물은 «조합 전수 표»다.
//
//     명시된 점   오스냅으로 물린 점. 사용자가 일부러 그 자리로 가서 물렸다
//     암묵의 점   획이 지나가다 생긴 가상 교차. 의도가 아니라 결과다
//     방향        축 스냅. 추론된 것이다
//
//     명시 점 2 (시작 + 끝 오스냅)   → 그 둘이 정한다. 축은 물러난다
//     명시 점 1 + 축                 → 점과 축이 정한다
//     명시 점 1, 축 없음             → 교차 하나를 더해 둘로 만든다
//     명시 점 0 + 축                 → 교차 하나 + 축
//     명시 점 0, 축 없음             → 첫 교차 + 끝 교차
//     그 외                          → 대기
//
// ⚠⚠ **칸의 전제를 «만들었다고 치지» 않는다**(#88 · #86 ㉡): 각 칸의 명시 점 수·축 유무·
// 교차 수를 **결과에서 다시 재서** 단언한다. 좌표를 손으로 적고 「이 칸은 명시 점 1이다」라고
// 주석만 다는 판은 픽스처가 어긋나도 초록으로 남는다.
// 「무엇이 이겼는가」도 **기하에서** 읽는다(스스로 붙인 이름표가 아니라):
//   점이 이겼다 = 그 끝의 재사영이 확정 2D와 fp 수준으로 같다
//   축이 이겼다 = 3D 방향이 그 축 방향과 같다
//   교차가 이겼다 = 3D 직선이 그 교차의 3D 점을 지난다
//
// 원장: `stage0/out/xint37_web2.json` (정본 명령 `LEDGER=1 npx vitest run test/xint37.test.ts`)

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { liftAll, screenCross, closestOnLineToRay, type LiftResult } from '../src/core/lift'
import { project, rayThrough, DRAW_POSE, type AxisId } from '../src/core/camera'
import { C } from '../src/core/constants'
import { builder } from './fixtures'
import { rng32 } from '../src/core/material'
import type { Doc, Stroke } from '../src/core/types'
import { sub3, norm3, len3, dot3, mul3, type Pt, type V3 } from '../src/core/vec'

// ── 발판 ────────────────────────────────────────────────────────────────────
// 2점 구도(vp0=(900,400) · vp1=(100,400))에 **세로 넷**을 세운다. x = 500 · 700 · 860 · 1050.
// ⚠ **x=900은 못 쓴다**(실측이 잡았다): vp0이 (900,400)이라 그 자리의 세로선은 **소실점을 지나고**,
//    그러면 축 배정이 V가 아니라 vp0으로 간다 — 그 선의 다른 끝은 사영이 안 되는 자리로 간다
//    (재사영이 `undefined`로 나왔다). 픽스처가 재려던 「세로선 넷」이 셋이 되어 있었다.
// 500 말고 셋은 밑이 vp1 깊이선의 **직선 위**다(y = 500 + 0.25·(x−500)) — 그래서 넷 다 선다.
// 시험 획은 이 넷을 0·1·2개 가로지르며 지나간다. 「몇 개를 지났는가」는 아래에서 **잰다**.
const VP0: Pt = { x: 900, y: 400 }
const VP1: Pt = { x: 100, y: 400 }
const VERT_X = [500, 700, 860, 1050]

function scaffold() {
  const b = builder()
  b.add(100, 400, 1100, 400)      // 지평선
  b.add(500, 500, 600, 475)       // 깊이1 → vp0 (첫 선 · 지면)
  b.add(500, 500, 400, 475)       // 깊이2 → vp1
  b.add(500, 500, 500, 200)       // A 세로 x=500 (모서리)
  b.add(700, 550, 700, 250)       // B 세로 x=700
  b.add(860, 590, 860, 200)       // C 세로 x=860 (밑 y = 500 + 0.25·360)
  b.add(1050, 637.5, 1050, 150)   // D 세로 x=1050
  return b
}
const SCAFFOLD_N = 7

/** 소실점을 향해(또는 등지고) P에서 `L`px 나간 점 — 「축이 걸린 방향」을 좌표로 안 적고 **유도**한다(#88). */
function toward(P: Pt, vp: Pt, L: number): Pt {
  const d = { x: vp.x - P.x, y: vp.y - P.y }
  const n = Math.hypot(d.x, d.y)
  return { x: P.x + d.x / n * L, y: P.y + d.y / n * L }
}
const away = (P: Pt, vp: Pt, L: number): Pt => toward(P, vp, -L)

// ── 결과에서 다시 재는 자들 ──────────────────────────────────────────────────

/** 이 획이 **지나간** 가상 교차 — 자기보다 **앞선** 획의 승격 선분과의 화면 교차.
 *  `lift.ts`의 셈을 베끼지 않고 밖에서 독립으로 다시 센다. */
function crossingsMeasured(r: LiftResult, doc: Doc, s: Stroke): { q: Pt; p3: V3 }[] {
  const order = new Map(doc.strokes.map((x, i) => [x.id, i]))
  const mine = order.get(s.id)!
  const out: { q: Pt; p3: V3 }[] = []
  for (const [oid, o] of r.lifted) {
    if (oid === s.id || order.get(oid)! > mine) continue
    const pa = project(r.an, DRAW_POSE, o.a3), pb = project(r.an, DRAW_POSE, o.b3)
    if (!pa || !pb) continue
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < C.MIN_DIR_LEN_RATIO * r.an.diag) continue
    const hit = screenCross(s.a, s.b, pa, pb)
    if (!hit) continue
    const ray = rayThrough(r.an, DRAW_POSE, hit.q)
    if (!ray) continue
    const p3 = closestOnLineToRay(o.a3, norm3(sub3(o.b3, o.a3)), ray)
    if (p3) out.push({ q: hit.q, p3 })
  }
  return out
}

/** **쓸 수 있는** 교차 — 획의 양 끝에서 「방향을 믿는 최소 길이」만큼 떨어진 것.
 *  끝에 딱 붙은 교차는 방향을 못 정한다(그 자리는 명시 점의 몫이다) — `lift.ts`의 문과 같은 자다. */
const usableCrossings = (r: LiftResult, doc: Doc, s: Stroke) =>
  crossingsMeasured(r, doc, s).filter(x =>
    Math.hypot(x.q.x - s.a.x, x.q.y - s.a.y) >= C.MIN_DIR_LEN_RATIO * r.an.diag &&
    Math.hypot(x.q.x - s.b.x, x.q.y - s.b.y) >= C.MIN_DIR_LEN_RATIO * r.an.diag)

/** 이 끝이 **명시된 점**인가 — 앞선 승격 선분의 몸통(또는 그 직선) 위에 있는가.
 *  오스냅이 확정 2D에 이미 반영돼 있으므로(원칙 d) 좌표만 보면 답이 나온다. */
function namedEnds(r: LiftResult, doc: Doc, s: Stroke): number {
  const order = new Map(doc.strokes.map((x, i) => [x.id, i]))
  const mine = order.get(s.id)!
  let n = 0
  for (const p of [s.a, s.b]) {
    for (const [oid, o] of r.lifted) {
      if (oid === s.id || order.get(oid)! > mine) continue
      const pa = project(r.an, DRAW_POSE, o.a3), pb = project(r.an, DRAW_POSE, o.b3)
      if (!pa || !pb) continue
      const dx = pb.x - pa.x, dy = pb.y - pa.y
      const L = Math.hypot(dx, dy)
      if (L < 1e-9) continue
      const t = ((p.x - pa.x) * dx + (p.y - pa.y) * dy) / (L * L)
      const perp = Math.abs((p.x - pa.x) * dy - (p.y - pa.y) * dx) / L
      // 몸통 안(0≤t≤1)은 병합 반경, 밖은 좁게 — `lift.matchPoint`가 가르는 그 두 대역이다
      const tol = t >= 0 && t <= 1 ? C.MERGE_RATIO * r.an.diag : C.LINE_MATCH_PX
      if (perp <= tol) { n++; break }
    }
  }
  return n
}

const axisDirOf = (r: LiftResult, id: AxisId | null): V3 | null =>
  id === null ? null : (r.an.axes.find(a => a.id === id)?.dir ?? null)

/** 그 끝의 재사영이 확정 2D와 같은가 — 「점이 이겼다」의 판정자. px로 낸다(0이면 완전 일치). */
function endDrift(r: LiftResult, s: Stroke, seg?: { a3: V3; b3: V3 }): { a: number; b: number } {
  const g = seg ?? r.lifted.get(s.id)
  if (!g) return { a: Infinity, b: Infinity }
  const pa = project(r.an, DRAW_POSE, g.a3), pb = project(r.an, DRAW_POSE, g.b3)
  return {
    a: pa ? Math.hypot(pa.x - s.a.x, pa.y - s.a.y) : Infinity,
    b: pb ? Math.hypot(pb.x - s.b.x, pb.y - s.b.y) : Infinity,
  }
}

/** 3D 방향이 그 축과 같은가 — 「축이 이겼다」의 판정자(향은 무시) */
function dirIsAxis(r: LiftResult, s: Stroke): boolean {
  const g = r.lifted.get(s.id)
  if (!g || !g.axis) return false
  const ax = axisDirOf(r, g.axis)
  if (!ax) return false
  const d = norm3(sub3(g.b3, g.a3))
  return Math.abs(Math.abs(dot3(d, norm3(ax))) - 1) < 1e-9 || Math.abs(Math.abs(dot3(d, norm3(ax))) - 1) < 1e-6
}

/** 3D 직선이 그 점을 지나는가 — 「교차가 이겼다」의 판정자 */
function passesThrough(r: LiftResult, s: Stroke, X: V3): boolean {
  const g = r.lifted.get(s.id)
  if (!g) return false
  const d = norm3(sub3(g.b3, g.a3))
  const w = sub3(X, g.a3)
  return len3(sub3(w, mul3(d, dot3(w, d)))) < 1e-6
}

// ── 전수 표의 칸들 ───────────────────────────────────────────────────────────
// 이름은 «명시 점 수 · 축 유무 · 교차 수»이고, **그 셋은 아래에서 다시 잰다**(주석이 아니라).
const P500 = (y: number): Pt => ({ x: 500, y })     // A 세로 위의 점 = 명시 점
const on = (x: number, y: number): Pt => ({ x, y }) // 다른 세로 위의 점 = 명시 점

interface Cell { name: string; a: Pt; b: Pt }
const CELLS: Cell[] = [
  // 명시 점 0 — 양 끝이 허공
  { name: '0점·축없음·교차0', a: { x: 560, y: 330 }, b: { x: 660, y: 300 } },
  { name: '0점·축없음·교차1', a: { x: 620, y: 330 }, b: { x: 780, y: 230 } },
  { name: '0점·축없음·교차2', a: { x: 620, y: 330 }, b: { x: 1000, y: 480 } },
  // ⚠ 축 획은 **vp1을 등지고**(오른쪽으로) 긋는다. vp0 쪽으로 길게 그으면 소실점을
  //    **지나쳐** 버리고, 그러면 그 끝의 광선이 축과 평행해져 기하가 못 선다(실측: 재사영이
  //    `undefined`였다). 등지는 향은 소실점에서 멀어지므로 그 함정이 없다.
  { name: '0점·축있음·교차0', a: { x: 560, y: 330 }, b: away({ x: 560, y: 330 }, VP1, 100) },
  { name: '0점·축있음·교차1', a: { x: 620, y: 330 }, b: away({ x: 620, y: 330 }, VP1, 200) },
  { name: '0점·축있음·교차2', a: { x: 620, y: 330 }, b: away({ x: 620, y: 330 }, VP1, 420) },
  // 명시 점 1 — 시작만 A 위
  { name: '1점·축없음·교차0', a: P500(330), b: { x: 600, y: 270 } },
  { name: '1점·축없음·교차1', a: P500(330), b: { x: 780, y: 230 } },
  { name: '1점·축없음·교차2', a: P500(330), b: { x: 1000, y: 480 } },
  { name: '1점·축있음·교차0', a: P500(330), b: away(P500(330), VP1, 120) },
  { name: '1점·축있음·교차1', a: P500(330), b: away(P500(330), VP1, 300) },
  { name: '1점·축있음·교차2', a: P500(330), b: away(P500(330), VP1, 480) },
  // 명시 점 1 — **끝만** 물린 획(37-0 ㉠의 자리 — 시작점 앵커 편향이 아니라는 증거)
  { name: '1점(끝)·축있음·교차0', a: toward(on(700, 295), VP1, 150), b: on(700, 295) },
  { name: '1점(끝)·축없음·교차0', a: { x: 620, y: 250 }, b: on(700, 300) },
  // 명시 점 2 — 양 끝이 세로 위
  { name: '2점·축없음·교차0', a: P500(330), b: on(700, 260) },
  { name: '2점·축없음·교차1', a: P500(330), b: on(860, 470) },
  { name: '2점·축없음·교차2', a: P500(330), b: on(1050, 500) },
  { name: '2점·축있음·교차0', a: P500(330), b: on(700, 365) },
  { name: '2점·축있음·교차1', a: P500(330), b: on(860, 267) },
  { name: '2점·축있음·교차2', a: P500(330), b: on(1050, 233.75) },
]

// ── 표 ──────────────────────────────────────────────────────────────────────
interface Row {
  cell: string; named: number; axis: AxisId | null; crossings: number; usable: number
  standing: boolean; waitWhy: string | null
  ends_kept_px: { a: number; b: number }; dir_is_axis: boolean; through_cross: boolean
  won: string
}

function runCell(c: Cell): Row {
  const b = scaffold()
  const s = b.add(c.a.x, c.a.y, c.b.x, c.b.y)
  const r = liftAll(b.doc)
  // 발판이 통째로 섰는지부터 — 안 서면 그 칸은 아무것도 안 잰다(#32: 0이 «깨끗함»인지 «안 돎»인지)
  const scaffoldUp = [4, 5, 6, 7].every(i => r.lifted.has(b.doc.strokes[i - 1]!.id))
  expect(scaffoldUp, `${c.name}: 발판 세로 넷이 서야 한다`).toBe(true)
  const named = namedEnds(r, b.doc, s)
  const use = usableCrossings(r, b.doc, s)
  const g = r.lifted.get(s.id)
  const drift = endDrift(r, s)
  const isAxis = dirIsAxis(r, s)
  const through = use.some(x => passesThrough(r, s, x.p3))
  const won = !g ? '—'
    : named === 2 ? '두 점'
      : named === 1 ? (isAxis ? '점 + 축' : '점 + 교차')
        : (isAxis ? '교차 + 축' : '교차 둘')
  return {
    cell: c.name, named, axis: g?.axis ?? null, crossings: crossingsMeasured(r, b.doc, s).length,
    usable: use.length, standing: !!g, waitWhy: r.waitWhy.get(s.id) ?? null,
    ends_kept_px: drift, dir_is_axis: isAxis, through_cross: through, won,
  }
}

let misacq: unknown = null
const falsif: Record<string, unknown> = {}
let coordProof: unknown = null
let principleD: unknown = null
let threeChoice: unknown = null

/** 후보 X를 지나는 «획 방향» 3D 선을 지어 구간을 낸다 — 후보별 편차를 재려고 밖에서 다시 짓는다. */
function spanOnAxisFree(r: LiftResult, s: Stroke, X: V3): { a3: V3; b3: V3 } | null {
  const rA = rayThrough(r.an, DRAW_POSE, s.a), rB = rayThrough(r.an, DRAW_POSE, s.b)
  if (!rA || !rB) return null
  const g = r.lifted.get(s.id)
  if (!g) return null
  const dir = norm3(sub3(g.b3, g.a3))
  const a3 = closestOnLineToRay(X, dir, rA), b3 = closestOnLineToRay(X, dir, rB)
  return a3 && b3 ? { a3, b3 } : null
}

/** 그 3D 선이 raw 점열과 얼마나 어긋나는가 — px²(제곱 편차 합) */
function rawDevOf(r: LiftResult, s: Stroke, g: { a3: V3; b3: V3 }): number {
  const pa = project(r.an, DRAW_POSE, g.a3), pb = project(r.an, DRAW_POSE, g.b3)
  if (!pa || !pb) return Infinity
  const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy)
  if (L < 1e-9) return Infinity
  const pts = s.raw && s.raw.length >= 2 ? s.raw : [s.a, s.b]
  let sum = 0
  for (const q of pts) { const d = ((q.x - pa.x) * dy - (q.y - pa.y) * dx) / L; sum += d * d }
  return sum
}

describe('37-1 — 조합 전수 표(명시 점 × 축 × 교차)', () => {
  const rows = CELLS.map(runCell)
  const find = (n: string) => rows.find(r => r.cell === n)!

  it('표가 우선순위와 일치한다 — 전수', () => {
    for (const r of rows) {
      console.log(`[37-1 표] ${JSON.stringify(r)}`)
      // 표의 답을 **한 식**으로 적는다(칸마다 다른 기대값을 손으로 적지 않는다 — 특수 분기 ⛔)
      const expected = r.named === 2 ? true
        : r.named === 1 ? (r.axis !== null || r.usable >= 1)
          : (r.axis !== null ? r.usable >= 1 : r.usable >= 2)
      expect(r.standing, `${r.cell} 자립 여부`).toBe(expected)
      if (!r.standing) expect(r.waitWhy, `${r.cell} 대기 사유`).not.toBeNull()   // 조용히 안 버린다
    }
  })

  it('명시 점은 **언제나** 그 자리에 남는다 (원칙 d) — 명시 점이 있는 칸 전부', () => {
    for (const r of rows) {
      if (!r.standing || r.named === 0) continue
      // 시작이 명시면 a가, 끝이 명시면 b가 fp 수준으로 붙어 있어야 한다.
      const kept = Math.min(r.ends_kept_px.a, r.ends_kept_px.b)
      expect(kept, `${r.cell} 명시 점 이탈 px`).toBeLessThan(1e-6)
    }
  })

  it('교차가 축을 **밀어내지 않는다** — 명시 점 1 + 축 + 교차 있음', () => {
    for (const n of ['1점·축있음·교차1', '1점·축있음·교차2']) {
      const r = find(n)
      expect(r.usable, `${n}: 교차가 실제로 있어야 시험이 성립한다`).toBeGreaterThanOrEqual(1)
      expect(r.standing).toBe(true)
      expect(r.dir_is_axis, `${n}: 축이 이긴다`).toBe(true)
      expect(r.won).toBe('점 + 축')
    }
  })

  it('축이 있으면 교차를 **둘 쓰지 않는다** — 방향은 축이 낸다', () => {
    const r = find('0점·축있음·교차2')
    expect(r.usable).toBeGreaterThanOrEqual(2)
    expect(r.standing).toBe(true)
    expect(r.dir_is_axis, '방향은 축이다(두 교차를 이은 방향이 아니다)').toBe(true)
  })

  it('끝점만 물린 획 + 축 → 자립 (37-0 ㉠ — 시작점 앵커 편향이 아니다)', () => {
    const r = find('1점(끝)·축있음·교차0')
    expect(r.named).toBe(1)
    expect(r.standing).toBe(true)
    expect(r.ends_kept_px.b, '물린 그 끝이 안 떨어진다').toBeLessThan(1e-6)
  })

  it('허공 시작 + 교차 하나 + 축 → 자립 · 그 교차를 지난다 (좌표로 확인)', () => {
    const r = find('0점·축있음·교차1')
    expect(r.named).toBe(0)
    expect(r.usable).toBe(1)
    expect(r.standing).toBe(true)
    expect(r.through_cross, '그 교차의 3D 점을 지난다').toBe(true)
    expect(r.dir_is_axis).toBe(true)
    // **좌표를 실제로 낸다**(지시문 게이트 문면 — 1차 리뷰어 [9]): 「자립했다」만으로는
    // 그 획이 «어디에» 섰는지 아무도 모른다.
    const c = CELLS.find(x => x.name === '0점·축있음·교차1')!
    const b = scaffold(); const st = b.add(c.a.x, c.a.y, c.b.x, c.b.y)
    const lr = liftAll(b.doc)
    const g = lr.lifted.get(st.id)!
    const x = usableCrossings(lr, b.doc, st)[0]!
    coordProof = {
      cell: c.name,
      drawn_2d: { a: c.a, b: c.b },
      crossing_screen: x.q,
      crossing_3d: { x: +x.p3.x.toFixed(6), y: +x.p3.y.toFixed(6), z: +x.p3.z.toFixed(6) },
      lifted_3d: {
        a3: { x: +g.a3.x.toFixed(6), y: +g.a3.y.toFixed(6), z: +g.a3.z.toFixed(6) },
        b3: { x: +g.b3.x.toFixed(6), y: +g.b3.y.toFixed(6), z: +g.b3.z.toFixed(6) },
      },
      axis: g.axis,
      reprojection_drift_px: endDrift(lr, st),
    }
    console.log(`[37-1 좌표] ${JSON.stringify(coordProof)}`)
    // 그 3D 선이 교차의 3D 점을 지난다 — 거리로 확인한다(참/거짓이 아니라 값)
    const d = norm3(sub3(g.b3, g.a3))
    const w = sub3(x.p3, g.a3)
    const off = len3(sub3(w, mul3(d, dot3(w, d))))
    expect(off, '교차점까지의 수직거리(세계 단위)').toBeLessThan(1e-9)
  })

  it('원칙 d — 승격 좌표의 재사영이 **확정 2D와 같다**, 자립한 칸 전부', () => {
    // ⚠ 이것은 **구성상 보장**이다(CLAUDE.md §5.1 유형 3 — 1차 리뷰어 [8]): 명시 점은 그대로
    //    쓰고 나머지 끝은 그 화면점의 광선 위에서 풀므로 재사영이 원래 점으로 돌아온다.
    //    **임계가 아니라 «같은가/다른가»를 센다** — 값을 원장에 남기되 문으로 안 쓴다.
    //    판별력은 위약 판(축이 이기는 판 4.9337 px)이 든다.
    let worst = 0
    for (const c of CELLS) {
      const b = scaffold(); const st = b.add(c.a.x, c.a.y, c.b.x, c.b.y)
      const lr = liftAll(b.doc)
      if (!lr.lifted.has(st.id)) continue
      const dd = endDrift(lr, st)
      worst = Math.max(worst, dd.a, dd.b)
    }
    principleD = { worst_px: worst, kind: '구성상 보장의 확인(측정 아님)' }
    console.log(`[37-1 원칙 d] 자립한 칸 전부의 최대 재사영 이탈 ${worst.toExponential(3)} px `
      + `— **보장의 확인이다**(임계 ⛔)`)
    expect(worst).toBeLessThan(1e-6)
  })

  it('명시 점 0 · 축 없음 — 교차 둘이면 자립, 하나면 대기', () => {
    const two = find('0점·축없음·교차2'), one = find('0점·축없음·교차1')
    expect(two.usable).toBeGreaterThanOrEqual(2)
    expect(two.standing).toBe(true)
    expect(one.usable).toBe(1)
    expect(one.standing, '교차 하나로는 방향이 안 선다').toBe(false)
    expect(one.waitWhy).toBe('onePoint')
  })

  it('점이 아무것도 없으면 대기 — 사유가 남는다', () => {
    const r = find('0점·축없음·교차0')
    expect(r.named).toBe(0); expect(r.usable).toBe(0)
    expect(r.standing).toBe(false)
    expect(r.waitWhy).toBe('noPoint')
  })

  // ── 반증 조건(D-3) — 이 항목의 «위약 판» ────────────────────────────────────
  it('⚠ 반증: 시작·끝을 둘 다 물리고 방향이 축과 살짝 어긋날 때 — 두 점이 이기고 끝점이 안 떨어진다', () => {
    // 픽스처: A(x=500)의 (500,330) → B(x=700)의 (700,360).
    // 정확한 vp0 방향이면 끝이 (700,365.0)이므로 **5px 어긋난 판**이다. 축 판정은 여전히 vp0다
    // (VP_DIR_RATIO 안) — 그래서 「축이 이기면 끝점이 떨어진다」가 실제로 일어날 수 있는 자리다.
    const b = scaffold()
    const s = b.add(500, 330, 700, 360)
    const r = liftAll(b.doc)
    const g = r.lifted.get(s.id)!
    expect(namedEnds(r, b.doc, s), '두 끝이 다 명시다').toBe(2)
    const ax = axisDirOf(r, g.axis)
    expect(g.axis, '축 판정은 걸려 있다 — 그래서 이 시험이 성립한다').toBe('vp0')

    // ① 실제 판: 두 점이 이긴다 → 양 끝 드리프트 0
    const real = endDrift(r, s)
    expect(real.a).toBeLessThan(1e-6)
    expect(real.b).toBeLessThan(1e-6)

    // ② **위약 판**: 「축이 이긴다」로 짠 기하를 같은 자로 잰다 — 여기서 빨개져야 한다.
    //    (제품을 고쳐서 돌리는 대신 그 규칙의 답을 그 자리에서 지어 같은 단언을 건다.)
    const rayB = rayThrough(r.an, DRAW_POSE, s.b)!
    const placeboB = closestOnLineToRay(g.a3, norm3(ax!), rayB)!
    const placebo = endDrift(r, s, { a3: g.a3, b3: placeboB })
    console.log(`[37-1 반증] 실제 끝 드리프트 a=${real.a.toExponential(3)} b=${real.b.toExponential(3)} `
      + `· 위약(축이 이김) b=${placebo.b.toFixed(4)} px`)
    falsif.two_named_vs_axis = { real_a_px: real.a, real_b_px: real.b,
      placebo_b_px: +placebo.b.toFixed(4),
      note: '위약은 「축이 이긴다」로 짠 기하다 — 같은 단언을 걸면 실패한다(판별력의 출처).' }
    expect(placebo.b, '위약 판은 끝점이 떨어진다 — 그래서 이 단언은 판별력이 있다')
      .toBeGreaterThan(1)
    // 같은 단언을 위약에 걸면 실패한다(그것이 반증이다)
    expect(() => expect(placebo.b).toBeLessThan(1e-6)).toThrow()
  })

  it('⚠ 반증: 「옛 선만 후보」 조건이 없으면 나중 획이 먼저 있던 대기선을 되짚어 굳힌다', () => {
    // 이 조건이 무엇을 지키는지 수치로 남긴다(코드에서 뺐을 때 무엇이 깨지는지 — 실측 기록):
    // 뺀 판에서 `own3d` 4-g(「지나가기만 한 교차는 사건이 아니다」)와 `layerrule` ①
    // (「겹은 아래를 안 바꾼다」)이 함께 빨개졌다. 여기서는 그 조건을 **직접** 잰다.
    const b = scaffold()
    const older = b.add(620, 330, 780, 230)     // 먼저 그은 자유 획 — 이 시점엔 교차가 하나뿐
    const newer = b.add(620, 250, 1000, 400)    // 나중에 그은 획
    const r = liftAll(b.doc)
    expect(r.lifted.has(older.id), '먼저 그은 획은 나중 획으로 안 굳는다').toBe(false)
    // 그런데 «나중 획» 쪽에서 보면 older는 후보가 아니다 — 대기선이라 3D가 없다.
    // 두 방향 다 막혀 있는 것이 이 조건의 내용이다.
    const cross = crossingsMeasured(r, b.doc, newer)
    expect(cross.every(x => Number.isFinite(x.p3.x))).toBe(true)
  })

  it('교차가 셋일 때 raw에 가장 가까운 것이 선택된다 (편차를 수치로)', () => {
    // 세로 넷 중 셋을 가로지르되 **축이 없는** 획을 raw 점열로 긋는다.
    // raw는 «둘째 교차(x=900)를 지나는 3D 선»에 붙도록 만든다 — 고르기가 그 자를 쓰는지 본다.
    // ⚠⚠ **재는 갈래를 바로잡았다**(2차 리뷰어 [9]): 초판은 «명시 점 0 · 축 없음» 획을 썼는데
    //    그 줄은 **첫 교차 + 끝 교차**를 쓰므로 raw 자를 아예 안 부른다 — 세 후보의 편차가
    //    전부 ~1e-26(동점)으로 나온 것이 그 증거였다. 자가 실제로 도는 줄은 **«명시 점 0 + 축»**이다.
    //    그리고 **정확히 축이면 그 줄도 동점이다**(AS-C137 ㉠) — 손처럼 조금 틀어 긋는다.
    const b = scaffold()
    const P0: Pt = { x: 620, y: 330 }
    const q0 = away(P0, VP1, 500)
    const th = 0.012                       // 손의 각도 오차(축 판정 대역 안)
    const rot = (p: Pt): Pt => ({
      x: P0.x + (p.x - P0.x) * Math.cos(th) - (p.y - P0.y) * Math.sin(th),
      y: P0.y + (p.x - P0.x) * Math.sin(th) + (p.y - P0.y) * Math.cos(th),
    })
    const a: Pt = P0, z: Pt = rot(q0)
    const s = b.add(a.x, a.y, z.x, z.y)
    s.raw = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20
      return { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t }
    })
    const r = liftAll(b.doc)
    const use = usableCrossings(r, b.doc, s)
    expect(use.length, '교차가 셋 이상이어야 이 시험이 성립한다').toBeGreaterThanOrEqual(3)
    expect(r.lifted.has(s.id)).toBe(true)
    // 고른 것과 **안 고른 것**의 편차를 나란히 낸다 — 하나만 적으면 «고른 이유»가 안 보인다.
    // ⚠ 단위는 **px²**(화면 제곱 편차의 합)다. 각 후보로 3D 선을 지어 다시 사영해 잰다.
    const devs = use.map(x => {
      const cand = spanOnAxisFree(r, s, x.p3)
      return { q: x.q, dev_px2: cand ? rawDevOf(r, s, cand) : Infinity, through: passesThrough(r, s, x.p3) }
    })
    const chosen = devs.filter(d => d.through)
    const minDev = Math.min(...devs.map(d => d.dev_px2))
    console.log(`[37-1 셋] 교차 ${use.length}개 · 편차(px²) `
      + JSON.stringify(devs.map(d => ({ q: `${d.q.x.toFixed(0)},${d.q.y.toFixed(0)}`,
        dev: d.dev_px2.toExponential(3), through: d.through }))))
    const maxDev = Math.max(...devs.map(d => d.dev_px2))
    // ⚠⚠ **동점인지 먼저 판정한다.** 이 픽스처에서 세 후보의 편차는 전부 ~1e-26 px²
    //    (수치적으로 0)이라 「최소가 뽑혔다」를 절대오차로 단언하면 **아무것도 안 재는 줄**이
    //    된다(초판이 `toBeCloseTo(minDev, 6)`으로 그랬다 — 1e-26끼리는 무조건 통과다).
    //    그래서 **갈리는가**를 먼저 보고, 갈리면 「최소가 뽑혔다」를, 안 갈리면
    //    「동점 규칙(첫 교차)이 뽑았다」를 단언한다. 어느 쪽이든 판별력이 있다(#5·D-3).
    const tie = maxDev - minDev <= Math.max(maxDev, 1e-12) * 1e-6
    threeChoice = { candidates: devs.length, min_dev_px2: minDev, max_dev_px2: maxDev,
      chosen_dev_px2: chosen[0]?.dev_px2 ?? null, tie, unit: 'px²(화면 제곱 편차 합)',
      note: tie ? '이 픽스처에서는 후보가 **전부 동점**이다(≈0) — 자가 못 가르므로 '
        + '동점 규칙(t 오름차순의 첫 교차)이 뽑는다. 자가 실제로 가르는 판은 축 갈래다'
        + '(같은 획에서 1.09e5 / 4.13e4 / 6.48e4 — AS-C137 ㉠).'
        : '후보가 갈린다 — 최소 편차가 뽑혔다.' }
    console.log(`[37-1 셋] 동점 ${tie} · 최소 ${minDev.toExponential(3)} · 최대 ${maxDev.toExponential(3)} px²`)
    expect(chosen.length, '지나는 교차가 있다').toBeGreaterThanOrEqual(1)
    if (tie) {
      // 동점 — **첫 교차**(획을 따라간 순서의 처음)가 뽑혀야 한다
      const first = use[0]!
      expect(passesThrough(r, s, first.p3), '동점이면 첫 교차가 뽑힌다').toBe(true)
    } else {
      const best = devs.reduce((a, b) => (b.dev_px2 < a.dev_px2 ? b : a))
      expect(best.through, '갈리면 최소 편차가 뽑힌다').toBe(true)
    }
  })

  it('⚠ 반증: 명시 점 1 + 교차 1 + 축 — **다른 평면**의 교차라도 축이 이긴다', () => {
    // ⚠ 위 전수 표의 발판은 세로 넷이 **전부 vp1 평면**에 있어서, 거기서는 「축이 낸 답」과
    //    「교차가 낸 답」이 **우연히 같다**(그래서 그 칸의 `through_cross`가 참이다).
    //    그 판으로는 「축이 이겼다」에 판별력이 없다 — 판을 따로 짓는다(#86의 규율).
    // 판: **vp1 평면**의 획 S와, B 위에서 뻗은 **vp0 평면**의 선 E가 화면에서만 만난다.
    // ⚠ A 한 점에서 뻗은 두 선은 거기서만 만나므로 판이 안 된다 — E를 **B에서** 뽑는다.
    const b = builder()
    b.add(100, 400, 1100, 400)
    b.add(500, 500, 600, 475)      // 깊이1 → vp0
    b.add(500, 500, 400, 475)      // 깊이2 → vp1
    b.add(500, 500, 500, 200)      // A 모서리 세로
    b.add(700, 550, 700, 250)      // B 세로(밑이 vp1 선 위) — vp1 평면
    const E = b.add(700, 300, 880, 390)          // B 위에서 vp0 방향 — **다른 평면**
    const Sa: Pt = { x: 500, y: 380 }
    const Sz = away(Sa, VP1, 480)
    const S = b.add(Sa.x, Sa.y, Sz.x, Sz.y)      // A 위에서 vp1 등지고 — 시작만 명시
    const r = liftAll(b.doc)
    expect(r.lifted.has(E.id), 'E가 서야 시험이 성립한다').toBe(true)
    expect(namedEnds(r, b.doc, S)).toBe(1)
    const g = r.lifted.get(S.id)!
    expect(g.axis).toBe('vp1')
    expect(dirIsAxis(r, S), '축이 이긴다').toBe(true)
    expect(endDrift(r, S).a, '명시 점은 안 움직인다').toBeLessThan(1e-6)

    // E와의 교차를 집는다 — **다른 평면**이라 그 답은 축의 답과 갈린다
    const use = usableCrossings(r, b.doc, S)
    const pe0 = project(r.an, DRAW_POSE, r.lifted.get(E.id)!.a3)!
    const pe1 = project(r.an, DRAW_POSE, r.lifted.get(E.id)!.b3)!
    const hitE = screenCross(S.a, S.b, pe0, pe1)
    expect(hitE, 'S와 E가 화면에서 만난다').not.toBeNull()
    const xE = use.find(x => Math.hypot(x.q.x - hitE!.q.x, x.q.y - hitE!.q.y) < 1e-6)
    expect(xE, 'E와의 교차가 «쓸 수 있는» 후보다').toBeDefined()

    // **위약 판**: 「교차가 축을 밀어낸다」로 짠 기하 — 명시 점과 그 교차점을 이은 선.
    const dir = norm3(sub3(xE!.p3, g.a3))
    const rayB = rayThrough(r.an, DRAW_POSE, S.b)!
    const placeboB = closestOnLineToRay(g.a3, dir, rayB)!
    const axDir = norm3(axisDirOf(r, 'vp1')!)
    const cosPlacebo = Math.abs(dot3(dir, axDir))
    const moved = len3(sub3(placeboB, g.b3))
    console.log(`[37-1 축우선] 후보 ${use.length}개 · 축 방향과 «교차가 이긴» 방향의 |cos| = `
      + `${cosPlacebo.toFixed(6)} · 먼 끝이 움직인 거리(세계 단위) = ${moved.toFixed(6)}`)
    falsif.axis_beats_offplane_crossing = { candidates: use.length,
      placebo_dir_abs_cos_vs_axis: +cosPlacebo.toFixed(6), far_end_moved_world: +moved.toFixed(6),
      note: '발판의 세로 넷은 전부 vp1 평면이라 거기서는 두 답이 우연히 같다 — 판을 따로 지어 얻은 판별력이다.' }
    expect(cosPlacebo, '교차가 낸 방향은 축이 아니다').toBeLessThan(1 - 1e-6)
    expect(moved, '두 답이 갈리는 폭').toBeGreaterThan(1e-3)
  })

  it('오획득률 — 획 40개 이상의 붐비는 장면에서 «엉뚱한 교차»를 고르는 비율', () => {
    // ⚠ **깨끗한 장면으로 재면 아무것도 못 본다**(#71 · 30-11이 같은 이유로 픽스처를 다시 짰다):
    //    교차가 하나뿐이면 고르기가 틀릴 방법이 없다. 발판을 세로 여덟 · 가로 여덟으로 깔아
    //    한 획이 여러 교차를 지나게 한다.
    //
    // ⚠⚠ **획을 «정확히 축»으로 그으면 이 팔은 아무것도 안 잰다**(D-3 · 실측으로 잡았다):
    //    후보 X를 지나는 축 방향 선은 X가 무엇이든 **그은 선 그 자체**가 되어 raw 편차가
    //    전부 0이다 — 자가 못 가른다. 손으로 그은 선은 축에서 조금 **어긋나** 있고 그때만
    //    후보가 갈린다(실측: 같은 획에서 1.09e5 / 4.13e4 / 6.48e4). 그래서 여기서는
    //    **의도한 교차를 축으로 조금 돌린다**(각도 오차 = 손) — 실사용 대역이 그쪽이다(D-5).
    //    돌리는 축이 T이므로 **그은 선은 T를 정확히 지난다** — 의도가 구성으로 심긴다.
    const b = builder()
    b.add(100, 400, 1100, 400)
    b.add(500, 500, 600, 475)
    b.add(500, 500, 400, 475)
    const xs = [500, 560, 620, 680, 740, 800, 920, 980]
    for (const x of xs) b.add(x, 500 + 0.25 * (x - 500), x, 180)     // 세로 여덟
    const ys = [230, 260, 290, 320, 350, 380, 410, 440]
    for (const y of ys) {                                            // vp1을 등진 가로 여덟
      const P: Pt = { x: 500, y }
      const q = away(P, VP1, 430)
      b.add(P.x, P.y, q.x, q.y)
    }
    const before = liftAll(b.doc)
    const nScaffold = b.doc.strokes.length

    const rnd = rng32(20260831)          // 결정론(§5 재현성 — `Math.random` ⛔)
    const rot = (p: Pt, o: Pt, th: number): Pt => ({
      x: o.x + (p.x - o.x) * Math.cos(th) - (p.y - o.y) * Math.sin(th),
      y: o.y + (p.x - o.x) * Math.sin(th) + (p.y - o.y) * Math.cos(th),
    })
    const trials: { s: Stroke; target: Pt }[] = []
    for (let i = 0; i < 24; i++) {
      const tx = xs[2 + (i % 5)]!
      const T: Pt = { x: tx, y: 250 + (i % 6) * 22 + Math.floor(i / 6) * 5 }
      // 각도 오차 — 축 판정이 살아 있는 대역 안(≈ ±1.7°, VP_DIR_RATIO 0.06 = 3.4°의 절반)
      const th = (rnd() - 0.5) * 2 * 0.03
      const a = rot(away(T, VP1, -150), T, th), z = rot(away(T, VP1, 210), T, th)
      const s = b.add(a.x, a.y, z.x, z.y)
      s.raw = Array.from({ length: 17 }, (_, k) => {
        const t = k / 16
        return { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t }
      })
      trials.push({ s, target: T })
    }
    const r = liftAll(b.doc)
    expect(nScaffold + trials.length, '획 40개 이상이어야 이 시험이 성립한다')
      .toBeGreaterThanOrEqual(40)

    // ⚠⚠ **분모를 «교차가 있다»가 아니라 «교차가 정했다»로 잡는다**(2차 리뷰어 [13]).
    //    초판은 `usable > 0`을 분모로 썼는데 그 안에는 **다른 패스가 세운 획**이 섞인다
    //    (끝점이 우연히 옛 선 위에 떨어지면 사슬이 먼저 세운다). 실측으로 24 중 **일곱**이
    //    그 경우였고 「고른 교차가 없다」인데 오획득으로 세어졌다 — **분자가 부풀어 있었다**.
    //    이제 「명시 점이 없고 그 3D 선이 자기 교차 중 하나를 지나는가」로 «교차가 정했다»를 가른다.
    let stood = 0, byCross = 0, wrong = 0, waited = 0, spread = 0, otherPass = 0
    const hist: Record<number, number> = {}
    const detail: { id: number; named: number; crossings: number; target: string;
      picked: string; decided_by: string; ok: boolean | null }[] = []
    for (const { s, target } of trials) {
      const g = r.lifted.get(s.id)
      if (!g) { waited++; continue }
      stood++
      const use = usableCrossings(r, b.doc, s)
      const named = namedEnds(r, b.doc, s)
      const hit = use.filter(x => passesThrough(r, s, x.p3))
      if (!(named === 0 && use.length > 0 && hit.length > 0)) {
        otherPass++
        detail.push({ id: s.id, named, crossings: use.length,
          target: `${target.x.toFixed(0)},${target.y.toFixed(0)}`, picked: '—',
          decided_by: named > 0 ? '사슬(명시 점)' : '교차 아님(지면·확대 패스)', ok: null })
        continue
      }
      byCross++
      hist[use.length] = (hist[use.length] ?? 0) + 1
      const ok = hit.some(x => Math.hypot(x.q.x - target.x, x.q.y - target.y) < 1)
      if (!ok) wrong++
      for (const x of use) spread = Math.max(spread, len3(sub3(x.p3, hit[0]!.p3)))
      detail.push({
        id: s.id, named, crossings: use.length,
        target: `${target.x.toFixed(0)},${target.y.toFixed(0)}`,
        picked: hit.map(x => `${x.q.x.toFixed(0)},${x.q.y.toFixed(0)}`).join(' | '),
        decided_by: '교차', ok,
      })
    }
    const rate = byCross > 0 ? wrong / byCross : null
    // 균일 무작위 선택의 기대 오획득 — 후보 k개면 맞힐 확률 1/k
    let expHit = 0, nHist = 0
    for (const [k, n] of Object.entries(hist)) { expHit += (n as number) / Number(k); nHist += n as number }
    const randomBaseline = nHist > 0 ? 1 - expHit / nHist : null
    // 장면의 3D 크기 — 3.141의 분모(#16: 비를 쓸 때 분모를 적는다)
    let sceneSize = 0
    for (const [, o] of r.lifted) sceneSize = Math.max(sceneSize, len3(sub3(o.b3, o.a3)))
    misacq = {
      scaffold_strokes: nScaffold, scaffold_lifted: before.lifted.size,
      trials: trials.length, stood, by_crossing: byCross, wrong, waited,
      decided_by_other_pass: otherPass,   // 분모에서 뺐다 — 교차가 아닌 패스가 세운 획(2차 [13])
      candidates_histogram: hist, rate, depth_spread_world: spread, detail,
      angle_error_rad_max: 0.03,
      // ⚠ **표본의 한계와 자의 분모**(1차 리뷰어 [7]) — 이 수를 인용하는 사람이 크기를 읽게.
      fixtures: 1, seeds: 1, seed: 20260831,
      reachability_value_fixture_determined: true,
      scene_longest_segment_world: +sceneSize.toFixed(6),
      depth_spread_relative: sceneSize > 0 ? +(spread / sceneSize).toFixed(6) : null,
      random_baseline_rate: randomBaseline === null ? null : +randomBaseline.toFixed(4),
      what_the_rate_does_not_say: '이 비는 «자가 잘 고른다»를 못 말한다 — n=24에서 균일 무작위 '
        + '기준선과 구별되지 않는다. 이 팔이 하는 주장은 「고르기가 의도를 못 맞힌다」 하나이고 '
        + '그 방향은 두 수 어느 쪽으로도 같다.',
      what_this_does_not_say: '이 비는 «자가 의도한 교차를 고르는가»만 잰다. 실기기의 손 '
        + '각도 오차 분포는 아직 표본이 없다(AS-C1) — 여기 각도는 축 판정 대역의 절반을 '
        + '균등으로 깐 것이다. 또 **정확히 축으로 그은 획은 후보가 전부 동점**이라 이 자가 '
        + '아무것도 안 가른다 — 그때는 첫 교차가 결정론으로 뽑힌다(`lift.ts`의 동점 규칙).',
    }
    console.log(`[37-1 오획득] 발판 ${nScaffold}획(자립 ${before.lifted.size}) · 시험 ${trials.length}획 `
      + `· 자립 ${stood} · 교차로 선 것 ${byCross} · 오획득 ${wrong} · 대기 ${waited} `
      + `· 다른 패스 ${otherPass}(분모에서 뺐다) `
      + `· 오획득률 ${rate === null ? 'null(분모 0)' : rate.toFixed(4)} `
      + `· 후보 수 분포 ${JSON.stringify(hist)} · 깊이 노출 폭 ${spread.toFixed(4)} `
      + `(장면 최장 선분 ${sceneSize.toFixed(4)} → 상대 ${(spread / sceneSize).toFixed(4)}) `
      + `· 무작위 기준선 ${randomBaseline === null ? 'null' : randomBaseline.toFixed(4)}`)
    for (const d of detail.slice(0, 8)) console.log(`[37-1 오획득·상세] ${JSON.stringify(d)}`)
    // 분모가 0이면 이 팔은 아무것도 안 잰다 — 그것부터 막는다(#32 · #36)
    expect(byCross, '교차로 선 획이 있어야 오획득률에 뜻이 있다').toBeGreaterThan(0)
    expect(Object.keys(hist).some(k => Number(k) >= 2), '후보가 여럿인 칸이 있어야 «고르기»를 잰다')
      .toBe(true)
    // ⛔ **여기 통과선을 안 건다.** 지시는 「재라」이고, 이 수가 얼마여야 하는지는 아직
    //    아무도 모른다(실기기 표본 0). 손으로 고른 문을 걸면 그 문이 곧 «측정»으로 읽힌다(#26).
    //    원장에 남기고 HANDOFF가 사람에게 묻는다.
  })

  it('원장 — stage0/out/xint37_web2.json', () => {
    const out = resolve(__dirname, '../../stage0/out')
    mkdirSync(out, { recursive: true })
    writeFileSync(resolve(out, 'xint37_web2.json'), JSON.stringify({
      what: 'web2-37 1번 — 명시 점(오스냅) × 축 × 가상 교차의 조합 전수 표. 「자립/대기」와 '
        + '「무엇이 이겼는가」가 우선순위 표와 일치하는지.',
      run: {
        canonical: 'LEDGER=1 npx vitest run test/xint37.test.ts',
        scaffold: `세로 넷(x=${VERT_X.join('·')}) + 지평선 + 깊이선 둘 = ${SCAFFOLD_N}획`,
        note: '칸의 전제(명시 점 수·축·교차 수)는 **결과에서 다시 잰 값**이다 — 주석이 아니다.',
      },
      rows,
      principle_d: principleD,
      coordinate_proof: coordProof,
      three_crossing_choice: threeChoice,
      misacquisition: misacq,
      falsification: falsif,
      pitfalls: ['#42', '#54', '#71', '#84', '#85', '#86', '#88', '#16', '#26', '#5'],
      selfcheck_notes: {
        exact_zero_ends_kept: '`rows[].ends_kept_px`의 0과 `principle_d.worst_px` 2.5e-13은 '
          + '**측정이 아니라 구성상 보장의 확인**이다(§5.1 유형 3) — 명시 점을 그대로 쓰고 나머지 '
          + '끝만 그 화면점의 광선 위에서 풀기 때문이다. **임계로 안 쓴다**. 판별력은 '
          + '`falsification.two_named_vs_axis.placebo_b_px`(4.9337 px)가 든다.',
        tie_at_1e_26: '`three_crossing_choice`가 «명시 점 0 + 축» 갈래를 재므로 tie는 거짓이고 '
          + '편차가 실제로 갈린다(117.3 / 32.57 / 51.25 px²). 「명시 점 0 · 축 없음」 갈래는 '
          + '자를 안 부르므로 그 줄로 재면 ~1e-26 동점이 나온다(AS-C137 ㉢).',
        misacquisition_denominator: '분모는 「교차가 **정했다**」이지 「교차가 **있다**」가 아니다 — '
          + '다른 패스가 세운 획을 `decided_by_other_pass`로 뺀다(2차 리뷰어 [13]).',
        single_seed: '`seeds: 1` · `fixtures: 1`이고 `reachability_value_fixture_determined: true`다 — '
          + '후보 수 분포는 픽스처가 정한다. 시드 변동폭을 안 쟀다(#14의 미측정).',
      },
      what_this_does_not_say: '이 표는 **작도 포즈**의 것이고 획이 직선 하나인 경우만 본다. '
        + '오획득률(붐비는 장면에서 엉뚱한 교차를 고르는 비율)은 `xint37_measure`가 따로 잰다.',
    }, null, 2))
    expect(rows.length).toBe(CELLS.length)
  })
})
