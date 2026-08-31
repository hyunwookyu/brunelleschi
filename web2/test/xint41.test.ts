// web2-41 — **애매하면 대기한다.** 37-1의 선택 규칙을 고친 자리와 그 게이트.
//
// 무엇을 고쳤나(지시문의 전/후 표):
//     전:  교차가 여럿 → raw에 가장 가까운 것을 고른다
//     후:  누른 자리가 있으면          → 그 교차로 정한다        (41-2)
//          없고 후보가 벌어져 있으면   → **대기**                (41-1)
//          없고 후보가 사실상 한자리면 → 그 하나로 정한다
//
// ⚠⚠ **이 라운드가 지시문의 근거 하나를 뒤집었다**(D-4). 지시문은 37의
// `depth_spread_relative` 0.58을 「빗나갔을 때의 깊이 오차」로 읽었는데, 그 값은 교차
// **점**들이 **한 3D 선 위에서** 떨어진 거리였다. 후보들이 만드는 **선**끼리의 거리는
// 그 픽스처에서 0.0004~0.0088이다 — 즉 **37의 오획득 13/16은 배치를 안 틀렸다**.
// 측정을 따르고(A-3 · D-4) 애매함이 실재하는 판을 따로 지어 게이트를 그 판에 건다.
// `assumptions.md`의 AS-C141이 그 반증을 든다.
//
// 원장: `stage0/out/xint41_web2.json` (정본 `LEDGER=1 npx vitest run test/xint41.test.ts`)

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  liftAll, geomSizeOf, pressedPoint, setXintAmbigRatio, xintAmbigFinal,
  screenCross, closestOnLineToRay, type LiftResult,
} from '../src/core/lift'
import { project, rayThrough, DRAW_POSE } from '../src/core/camera'
import { C, XINT_AMBIG_RATIO } from '../src/core/constants'
import { defaultPressCal } from '../src/core/press'
import type { Doc, Stroke } from '../src/core/types'
import { sub3, norm3, len3, type Pt, type V3 } from '../src/core/vec'
import {
  sparse, crowdedFlat, crowdedDeep, pressProfile, nearestRawIndex, midRawIndex, rawOf,
  VP1, away, SPARSE_VERT_X, DEEP_GL, DEEP_VERT_X, type Trial, type PressShape,
} from './xint41scene'

// ── 밖에서 다시 재는 자 ──────────────────────────────────────────────────────
// ⚠ **앱의 셈을 베끼지 않는다**: 「의도한 교차가 냈을 답」은 여기서 독립으로 짓는다.
//    앱이 고른 답과 견주는 것이 이 팔의 전부이므로 두 셈이 같은 코드면 아무것도 안 잰다.

/** 이 획이 지나간 교차 중 화면점 `T`의 것 — 그 3D 점 */
function crossingAt(r: LiftResult, doc: Doc, s: Stroke, T: Pt): V3 | null {
  const order = new Map(doc.strokes.map((x, i) => [x.id, i]))
  const mine = order.get(s.id)!
  for (const [oid, o] of r.lifted) {
    if (oid === s.id || order.get(oid)! > mine) continue
    const pa = project(r.an, DRAW_POSE, o.a3), pb = project(r.an, DRAW_POSE, o.b3)
    if (!pa || !pb) continue
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < C.MIN_DIR_LEN_RATIO * r.an.diag) continue
    const hit = screenCross(s.a, s.b, pa, pb)
    if (!hit || Math.hypot(hit.q.x - T.x, hit.q.y - T.y) >= 1) continue
    const ray = rayThrough(r.an, DRAW_POSE, hit.q)
    if (!ray) continue
    return closestOnLineToRay(o.a3, norm3(sub3(o.b3, o.a3)), ray)
  }
  return null
}

/** **의도한 교차가 냈을 답**과 앱이 실제로 놓은 자리의 거리(세계 단위).
 *  방향은 앱이 놓은 것의 방향을 쓴다 — 재려는 것은 «어느 교차를 지나는가» 하나다. */
function placementError(r: LiftResult, doc: Doc, s: Stroke, T: Pt): number | null {
  const g = r.lifted.get(s.id)
  if (!g) return null
  const p3 = crossingAt(r, doc, s, T)
  if (!p3) return null
  const dir = norm3(sub3(g.b3, g.a3))
  const rA = rayThrough(r.an, DRAW_POSE, s.a), rB = rayThrough(r.an, DRAW_POSE, s.b)
  if (!rA || !rB) return null
  const a3 = closestOnLineToRay(p3, dir, rA), b3 = closestOnLineToRay(p3, dir, rB)
  if (!a3 || !b3) return null
  return Math.max(len3(sub3(a3, g.a3)), len3(sub3(b3, g.b3)))
}

/** 이 획이 지나는 교차 중 `T`가 **아닌** 가장 가까운 것의 화면 자리(자리 축 반증용) */
function neighbourCrossing(r: LiftResult, doc: Doc, s: Stroke, T: Pt): Pt | null {
  const order = new Map(doc.strokes.map((x, i) => [x.id, i]))
  const mine = order.get(s.id)!
  let best: Pt | null = null, bd = Infinity
  for (const [oid, o] of r.lifted) {
    if (oid === s.id || order.get(oid)! > mine) continue
    const pa = project(r.an, DRAW_POSE, o.a3), pb = project(r.an, DRAW_POSE, o.b3)
    if (!pa || !pb) continue
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < C.MIN_DIR_LEN_RATIO * r.an.diag) continue
    const hit = screenCross(s.a, s.b, pa, pb)
    if (!hit) continue
    const d = Math.hypot(hit.q.x - T.x, hit.q.y - T.y)
    if (d < 1 || d >= bd) continue
    bd = d; best = hit.q
  }
  return best
}

type Scene = { b: { doc: Doc }; trials: Trial[]; scaffoldN: number }

/** 한 장면의 한 판 — 「몇이 서고 몇이 애매로 대기하고 잘못 놓인 것이 몇인가」 */
function judge(make: () => Scene, ratio: number | null) {
  setXintAmbigRatio(ratio)
  try {
    const { b, trials, scaffoldN } = make()
    const r = liftAll(b.doc)
    const size = geomSizeOf(r.lifted)
    // ⚠ **id로 접는다**(1차 리뷰어 [11]) — `crossOnce`가 한 획을 여러 번 판정하므로
    //    줄 수를 세면 시행 수를 넘는다(실측: 24 시행에 51줄). 유효한 것은 마지막 줄이다.
    const byCross = xintAmbigFinal()
    const trace = [...byCross.values()]
    let stood = 0, waited = 0, ambig = 0, misplaced = 0, worst = 0, otherPass = 0
    let stoodByCross = 0, correct = 0
    const errs: number[] = []
    for (const { s, target } of trials) {
      if (r.lifted.has(s.id)) stood++
      else { waited++; if (r.waitWhy.get(s.id) === 'ambiguous') ambig++ }
      // ⚠⚠ **분모는 「교차가 정했다」이지 「교차가 있다」가 아니다**(37 2차 리뷰어 [13]의
      //    그 자리). 판정자는 **앱이 남긴 표식**이다 — 밖에서 다시 세면 사슬이 세운 획이
      //    섞여 분자가 부푼다(실측: 누름 판에서 아홉이 그 경우였고 오차 0.002~0.29였다).
      if (!r.lifted.has(s.id)) continue
      if (!byCross.has(s.id)) { otherPass++; continue }
      stoodByCross++
      const e = placementError(r, b.doc, s, target)
      if (e === null) continue
      const rel = size > 0 ? e / size : Infinity
      errs.push(rel)
      worst = Math.max(worst, rel)
      // **「잘못 놓였다」의 자는 앱 자신의 «같은 자리» 문**이다(#54 — 새 숫자 ⛔).
      if (rel > C.INTERSECT_GAP_RATIO) misplaced++
      else correct++
    }
    const rels = trace.map(x => x.rel).sort((p, q) => p - q)
    errs.sort((p, q) => p - q)
    return {
      strokes: b.doc.strokes.length, scaffold: scaffoldN, trials: trials.length,
      lifted_total: r.lifted.size, stood, waited, ambiguous: ambig,
      crossing_pass_seen: byCross.size, decided_by_other_pass: otherPass,
      // ⚠⚠ **이 두 칸이 1차 리뷰어 [1]의 물음에 답한다** — 「교차가 세웠고 그 자리가 맞았다」의
      //    개수와 분모다. `misplaced`만 내면 「안 세워서 0」과 「옳게 세워서 0」이 안 갈린다.
      stood_by_crossing: stoodByCross, correctly_placed: correct,
      misplaced, worst_error_rel: +worst.toFixed(6),
      error_median_rel: errs.length ? +errs[errs.length >> 1]!.toFixed(6) : null,
      multi_candidate: trace.filter(x => x.n >= 2).length,
      ambiguous_rate: `${ambig}/${trials.length}`,
      spread_min_rel: rels.length ? +rels[0]!.toFixed(6) : null,
      spread_max_rel: rels.length ? +rels[rels.length - 1]!.toFixed(6) : null,
      scene_size_world: +size.toFixed(4),
    }
  } finally { setXintAmbigRatio(null) }
}

const OLD_RULE = Infinity          // 37의 규칙 — 「언제나 raw에 가장 가까운 것을 고른다」
const TH = XINT_AMBIG_RATIO
const label = (r: number) => (r === OLD_RULE ? '∞(37의 규칙)' : +r.toFixed(6))

const ledger: Record<string, unknown> = {}

// ─────────────────────────────────────────────────────────────────────────────
describe('41-1 애매하면 대기한다', () => {
  it('성긴 장면 — 후보가 여럿이어도 답이 하나면 선다(무회귀)', () => {
    // 발판의 세로 넷은 3D에서 한 평면에 있다 → 어느 후보를 골라도 같은 선이다.
    const rows: Record<string, unknown>[] = []
    for (const ratio of [OLD_RULE, TH, TH / 2, TH * 2]) {
      setXintAmbigRatio(ratio)
      const b = sparse()
      const T: Pt = { x: 700, y: 300 }
      const a = away(T, VP1, -150), z = away(T, VP1, 210)
      const s = b.add(a.x, a.y, z.x, z.y)
      s.raw = rawOf(a, z)
      const r = liftAll(b.doc)
      const trace = [...xintAmbigFinal().values()]
      rows.push({
        ratio: label(ratio), lifted: r.lifted.size, waiting: r.waiting.length,
        // 이 팔이 **무엇을 재는지**를 그 자리에 적는다 — 「교차로 그은 그 획이 섰는가」다.
        // 이것이 false면 위의 자립 수가 같은 것은 아무것도 안 말한다(#85의 형태).
        crossing_stroke_stood: r.lifted.has(s.id),
        decided_by_crossing: trace.some(x => x.id === s.id),
        multi_candidate: trace.filter(x => x.n >= 2).length,
        spread_rel: trace.length ? +Math.max(...trace.map(x => x.rel)).toFixed(9) : null,
      })
      setXintAmbigRatio(null)
    }
    ledger['sparse_no_regression'] = rows
    console.log('[41-1 성긴] ' + JSON.stringify(rows))
    // **무회귀** — 네 판의 자립 수가 전부 같다(문턱을 어떻게 흔들어도 성긴 장면은 안 움직인다)
    expect(new Set(rows.map(x => x.lifted)).size, '성긴 장면의 자립률은 문턱과 무관하다').toBe(1)
    // 그리고 그 이유가 **벌어짐 0**이라는 것까지 잰다(「우연히 같다」와 가른다)
    for (const x of rows) {
      expect(x.crossing_stroke_stood, '교차로 그은 획이 실제로 선다').toBe(true)
      expect(x.decided_by_crossing, '그 획을 «교차 패스»가 정했다').toBe(true)
      if (x.spread_rel !== null) expect(x.spread_rel as number).toBeLessThan(1e-9)
    }
  })

  it('붐비는 장면 ① (37의 그 픽스처) — 애매함이 «없다»는 것이 실측이다', () => {
    const rows: Record<string, unknown>[] = []
    for (const ratio of [OLD_RULE, TH * 2, TH, TH / 2]) {
      rows.push({ ratio: label(ratio), ...judge(crowdedFlat, ratio) })
    }
    ledger['crowded_flat'] = rows
    for (const x of rows) console.log('[41-1 붐빔①] ' + JSON.stringify(x))
    // 37의 규칙에서도 **잘못 놓인 선이 0**이다 — 이것이 D-4의 반증이다.
    expect(rows[0]!.misplaced, '37의 규칙에서도 이 픽스처는 배치를 안 틀린다').toBe(0)
    for (const x of rows) expect(x.misplaced, `문턱 ${x.ratio}`).toBe(0)
  })

  it('붐비는 장면 ② (깊이가 갈리는 판) — 여기가 반증이다: 고치기 전엔 조용히 틀린다', () => {
    const rows: Record<string, unknown>[] = []
    for (const ratio of [OLD_RULE, TH * 2, TH, TH / 2]) {
      rows.push({ ratio: label(ratio), ...judge(crowdedDeep, ratio) })
    }
    ledger['crowded_deep'] = rows
    for (const x of rows) console.log('[41-1 붐빔②] ' + JSON.stringify(x))
    // **D-3 반증** — 고치기 전(=37의 규칙)에는 잘못 놓인 선이 실재한다
    expect(rows[0]!.misplaced as number, '37의 규칙에서는 조용히 틀린 배치가 난다')
      .toBeGreaterThan(0)
    expect(rows[0]!.worst_error_rel as number, '그 틀림의 크기')
      .toBeGreaterThan(C.INTERSECT_GAP_RATIO * 10)
    // **게이트** — 문턱 ×0.5·×1·×2 어디서도 잘못 놓인 선이 0이다
    for (const x of rows.slice(1)) expect(x.misplaced, `문턱 ${x.ratio}`).toBe(0)
  })

  it('애매 판정률 — 장면 밀도별(숫자로)', () => {
    const oneCross = (): Scene => {
      const b = sparse()
      const T: Pt = { x: 700, y: 300 }
      const a = away(T, VP1, -150), z = away(T, VP1, 210)
      const s = b.add(a.x, a.y, z.x, z.y)
      s.raw = rawOf(a, z)
      return { b, trials: [{ s, target: T }], scaffoldN: 7 }
    }
    const rows = [
      { scene: '성긴 발판 + 교차 획 1', ...judge(oneCross, TH) },
      { scene: '붐빔①(37 픽스처 · 세로가 한 평면)', ...judge(crowdedFlat, TH) },
      { scene: '붐빔②(깊이가 셋으로 갈림)', ...judge(crowdedDeep, TH) },
    ]
    ledger['ambiguous_rate_by_density'] = rows
    for (const x of rows) {
      console.log(`[41-1 애매율] ${x.scene} · 획 ${x.strokes} · 후보≥2 ${x.multi_candidate}`
        + ` · 애매 ${x.ambiguous_rate} · 벌어짐 ${x.spread_min_rel}~${x.spread_max_rel}`)
    }
    // 밀도가 아니라 **깊이 분포**가 애매함을 정한다 — ①과 ②의 획 수는 같은 급인데 값이 갈린다
    expect(rows[1]!.ambiguous, '붐빔① 애매 0').toBe(0)
    expect(rows[2]!.ambiguous as number, '붐빔② 애매 다수').toBeGreaterThan(0)
  })

  it('⚠ 손의 각오차 대역이 붐빔①의 «무해함»을 정한다 (1차 리뷰어 [2])', () => {
    // 붐빔①이 무해한 것은 **픽스처의 성질이 아니라 대역의 성질일 수 있다** — 세로 여덟이
    // 한 평면이라도 획이 축에서 더 많이 어긋나면 후보 선들이 벌어진다. 그 대역을 훑는다.
    // 기본 0.03 rad은 37이 쓴 값(축 판정 대역 3.4°의 절반).
    const rows = [0.03, 0.06, 0.12, 0.24].map(a => {
      const r = judge(() => crowdedFlat(a), TH)
      return { angle_max_rad: a, angle_max_deg: +(a * 180 / Math.PI).toFixed(2),
        spread_max_rel: r.spread_max_rel, ambiguous_rate: r.ambiguous_rate,
        stood_by_crossing: r.stood_by_crossing, correctly_placed: r.correctly_placed,
        misplaced: r.misplaced, worst_error_rel: r.worst_error_rel }
    })
    ledger['crowded_flat_angle_band'] = rows
    for (const x of rows) console.log('[41-1 각오차] ' + JSON.stringify(x))
    // ⚠ 통과선을 안 건다 — 이 표가 답하는 것은 「무해함의 조건」이지 게이트가 아니다.
    //    다만 **문턱이 실제로 무는 지점이 이 대역 안에 있는지**는 값으로 남는다.
    expect(rows.length).toBe(4)
  })

  it('원칙 d ② — 좌표로 잰다(되는가가 아니라 얼마나 어긋나는가)', () => {
    // ⚠⚠ **1차 리뷰어 [3]** — 지시문의 게이트 ⑤ 문면은 「미리보기 좌표 == 커밋 좌표」인데
    //    위 팔은 「화면으로 되돌아오는가」만 잰다. 여기서 **드리프트를 px로** 낸다.
    //    ⛔ 통과선을 안 건다: 축 갈래는 그은 선과 후보 선이 어긋난 만큼 구성상 드리프트가
    //    생기고, 그 크기의 문은 아직 아무도 모른다(원장이 분포를 낸다).
    const rows: Record<string, unknown>[] = []
    for (const [name, make] of [['crowded_flat', crowdedFlat], ['crowded_deep', crowdedDeep]] as const) {
      for (const ratio of [OLD_RULE, TH]) {
        setXintAmbigRatio(ratio)
        const { b, trials } = make()
        const r = liftAll(b.doc)
        const byCross = xintAmbigFinal()
        setXintAmbigRatio(null)
        const d: number[] = []
        for (const { s } of trials) {
          const g = r.lifted.get(s.id)
          if (!g || !byCross.has(s.id)) continue
          const pa = project(r.an, DRAW_POSE, g.a3), pb = project(r.an, DRAW_POSE, g.b3)
          if (!pa || !pb) { d.push(Infinity); continue }
          d.push(Math.max(Math.hypot(pa.x - s.a.x, pa.y - s.a.y),
            Math.hypot(pb.x - s.b.x, pb.y - s.b.y)))
        }
        d.sort((x, y) => x - y)
        rows.push({ scene: name, ratio: label(ratio), n: d.length,
          median_px: d.length ? +d[d.length >> 1]!.toFixed(6) : null,
          max_px: d.length ? +d[d.length - 1]!.toFixed(6) : null,
          tap_max_px: C.TAP_MAX_PX })
      }
    }
    ledger['principle_d_drift_px'] = rows
    for (const x of rows) console.log('[41-1 원칙 d 좌표] ' + JSON.stringify(x))
    expect(rows.every(x => x.n !== null)).toBe(true)
  })

  it('반증 손잡이 — 문턱 0이면 후보가 여럿인 획이 전부 대기한다', () => {
    setXintAmbigRatio(0)
    const { b, trials } = crowdedDeep()
    const r = liftAll(b.doc)
    const trace = [...xintAmbigFinal().values()]
    setXintAmbigRatio(null)
    const multi = trace.filter(x => x.n >= 2)
    const stood = trials.filter(t => r.lifted.has(t.s.id)).length
    console.log(`[41-1 반증 문턱0] 후보≥2 ${multi.length} · 자립 ${stood}/${trials.length}`)
    expect(multi.length, '후보가 여럿인 획이 있다').toBeGreaterThan(0)
    expect(multi.every(x => x.decided === 'ambiguous'), '전부 애매로 판정됐다').toBe(true)
    ledger['falsification_zero_threshold'] = { multi_candidate: multi.length, stood }
  })

  it('대기 사유가 «ambiguous»로 남는다 — 조용히 대기시키지 않는다(#43)', () => {
    const { b, trials } = crowdedDeep()
    const r = liftAll(b.doc)
    const why = trials.map(t => r.waitWhy.get(t.s.id)).filter(Boolean)
    const hist = why.reduce((a: Record<string, number>, w) => (a[w!] = (a[w!] ?? 0) + 1, a), {})
    console.log(`[41-1 사유] 대기 ${why.length} · ` + JSON.stringify(hist))
    expect(hist['ambiguous'] ?? 0, '애매로 대기한 획의 사유가 그렇게 적힌다').toBeGreaterThan(0)
    ledger['wait_reasons'] = hist
  })

  it('원칙 d — 자립한 획은 **전부 화면으로 되돌아온다**', () => {
    // 41-1이 열어 준 갈래에서 «카메라 뒤»에 놓인 획 넷이 나왔다(a3.z = +83.52).
    // 관문이 그것을 막는다. ⚠ 이 팔은 시험 획만 본다(발판의 다른 패스는 이 절의 몫이 아니다).
    const bad: string[] = []
    for (const make of [crowdedFlat, crowdedDeep]) {
      for (const ratio of [OLD_RULE, TH]) {
        setXintAmbigRatio(ratio)
        const { b, trials } = make()
        const r = liftAll(b.doc)
        setXintAmbigRatio(null)
        for (const { s } of trials) {
          const g = r.lifted.get(s.id)
          if (!g) continue
          if (!project(r.an, DRAW_POSE, g.a3) || !project(r.an, DRAW_POSE, g.b3)) {
            bad.push(`획${s.id}@ratio=${label(ratio)}`)
          }
        }
      }
    }
    console.log(`[41-1 원칙 d] 재사영 불가로 선 획 ${bad.length}`)
    ledger['principle_d_unprojectable'] = bad.length
    expect(bad, '자립했는데 화면에 몸이 없는 획은 없다').toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('41-2 누른 자리 — 애매함을 푸는 손잡이', () => {
  it('결의 최대÷평균 — 오발화와 적중을 같이 낸다(문턱의 근거)', () => {
    const N = 17, SEEDS = 300
    const ratioOf = (a: number[]) => Math.max(...a) / (a.reduce((x, y) => x + y, 0) / a.length)
    const band = (shape: PressShape, ats: number[]) => {
      let mn = Infinity, mx = 0, sum = 0, n = 0, hit = 0
      for (const at of ats) {
        for (let k = 1; k <= SEEDS; k++) {
          const v = ratioOf(pressProfile(shape, N, 20260831 + k * 7919, at))
          mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++
          if (v >= C.PRESS_PEAK_RATIO) hit++
        }
      }
      return { min: +mn.toFixed(4), mean: +(sum / n).toFixed(4), max: +mx.toFixed(4), fired: `${hit}/${n}` }
    }
    const bands = {
      threshold: C.PRESS_PEAK_RATIO, samples_per_shape: SEEDS, raw_points: N, jitter: 0.2,
      flat_like_mouse: band('flat', [-1]),
      natural_arc_not_pressed: band('naturalArc', [-1]),
      light_even_not_pressed: band('lightEven', [-1]),
      deliberate_press_5_spots: band('pressAt', [3, 6, 9, 13, 16]),
    }
    ledger['press_bands'] = bands
    console.log('[41-2 결] ' + JSON.stringify(bands))
    // 문의 근거 — **오발화 0 · 적중 다수**
    expect(bands.natural_arc_not_pressed.fired, '안 누른 결은 발화 0').toBe(`0/${SEEDS}`)
    expect(bands.light_even_not_pressed.fired, '안 누른 결은 발화 0').toBe(`0/${SEEDS}`)
    const [h, t] = bands.deliberate_press_5_spots.fired.split('/').map(Number)
    expect(h! / t!, '의도한 누름은 대부분 발화한다').toBeGreaterThan(0.9)
    // ⚠⚠ **문턱 훑기를 원장에 낸다**(1차 리뷰어 [4][5] · #12 동작점 하나 ⛔ · #13 격자가
    //    결론을 정하면 그 결론은 없다). 격자를 **자연 결 최대(1.9053) 언저리까지 촘촘히**
    //    깐다 — 「오발화가 0이 되는 첫 칸」이 격자의 산물인지 값의 산물인지 보이게.
    //    ⚠ **오발화의 모집단은 «안 누른 결 셋 전부»다**(1차 [13] — 분모를 이름으로 가른다).
    const SWEEP = [1.5, 1.6, 1.7, 1.8, 1.85, 1.9, 1.91, 1.95, 2, 2.05, 2.1, 2.2, 2.5]
    const sweep = SWEEP.map(th => {
      let fpArc = 0, fpLight = 0, fpFlat = 0, hit = 0, tot = 0
      for (let k = 1; k <= SEEDS; k++) {
        const sd = 20260831 + k * 7919
        if (ratioOf(pressProfile('naturalArc', N, sd, -1)) >= th) fpArc++
        if (ratioOf(pressProfile('lightEven', N, sd, -1)) >= th) fpLight++
        if (ratioOf(pressProfile('flat', N, sd, -1)) >= th) fpFlat++
        for (const at of [3, 6, 9, 13, 16]) {
          tot++
          if (ratioOf(pressProfile('pressAt', N, sd, at)) >= th) hit++
        }
      }
      return { threshold: th,
        false_fire_not_pressed: `${fpArc + fpLight + fpFlat}/${SEEDS * 3}`,
        false_fire_natural_arc_only: `${fpArc}/${SEEDS}`,
        hit_deliberate: `${hit}/${tot}` }
    })
    ledger['press_threshold_sweep'] = {
      note: '오발화의 분모는 **안 누른 결 셋 전부**(flat + naturalArc + lightEven)이고, '
        + '자연 결만의 칸도 따로 낸다 — 두 분모가 다르므로 이름으로 가른다(#16).',
      chosen: C.PRESS_PEAK_RATIO,
      knee: '오발화가 0이 되는 첫 칸은 **1.91**이다(자연 결 최대 1.9053 바로 위). '
        + '제품 값 2.00은 그 무릎이 아니라 **그 위의 둥근 수**다 — 무릎에 붙이면 시드가 '
        + '하나만 달라져도 오발화가 난다(자연 결 최대가 곧 문이 된다). 2.00의 여유는 '
        + '무릎 대비 1.05배이고 그 얇음을 여기 값으로 남긴다(#82).',
      rows: sweep,
    }
    for (const x of sweep) console.log('[41-2 문턱 훑기] ' + JSON.stringify(x))
    // **반증** — 문을 자연 결 대역 안으로 내리면 오발화가 난다(문이 아무것도 안 재는 것 ⛔)
    const low = 1.6
    const lowRow = sweep.find(x => x.threshold === low)!
    const falsePos = Number(lowRow.false_fire_natural_arc_only.split('/')[0])
    console.log(`[41-2 결·반증] 문턱을 ${low}으로 내리면 자연 결 오발화 ${lowRow.false_fire_natural_arc_only}`)
    ledger['press_bands_falsification'] = { lowered_threshold: low,
      false_fire_natural_arc_only: lowRow.false_fire_natural_arc_only,
      false_fire_not_pressed: lowRow.false_fire_not_pressed }
    expect(falsePos, '문턱을 내리면 오발화가 난다').toBeGreaterThan(0)
    // 무릎이 격자의 산물이 아님을 값으로 — 1.90에서는 오발화가 있고 1.91에서 0이다
    const at190 = sweep.find(x => x.threshold === 1.9)!, at191 = sweep.find(x => x.threshold === 1.91)!
    expect(at190.false_fire_not_pressed.startsWith('0/'), '1.90에서는 아직 오발화가 있다').toBe(false)
    expect(at191.false_fire_not_pressed.startsWith('0/'), '1.91에서 0이 된다').toBe(true)
  })

  it('신호가 없으면 41-1 그대로다(무회귀) · 있으면 그 교차로 정해진다', () => {
    const run = (shape: PressShape | null) => {
      const { b, trials } = crowdedDeep()
      if (shape) {
        for (const { s, target } of trials) {
          const at = shape === 'pressAt' ? nearestRawIndex(s, target) : -1
          s.rawIn = { press: pressProfile(shape, s.raw!.length, 20260831 + s.id * 7919, at) }
        }
      }
      const r = liftAll(b.doc)
      const size = geomSizeOf(r.lifted)
      const byCross = new Set(xintAmbigFinal().keys())
      let stood = 0, byCrossStood = 0, onTarget = 0, otherPass = 0
      for (const { s, target } of trials) {
        if (!r.lifted.has(s.id)) continue
        stood++
        if (!byCross.has(s.id)) { otherPass++; continue }   // 사슬이 세운 획 — 분모 밖(#13)
        byCrossStood++
        const e = placementError(r, b.doc, s, target)
        if (e !== null && size > 0 && e / size <= C.INTERSECT_GAP_RATIO) onTarget++
      }
      return { stood, by_crossing: byCrossStood, onTarget, decided_by_other_pass: otherPass,
        trials: trials.length }
    }
    const none = run(null), flat = run('flat'), arc = run('naturalArc'), pressed = run('pressAt')
    const rows = [
      { signal: '없음(rawIn 없음)', ...none }, { signal: '평평', ...flat },
      { signal: '자연 결(안 누름)', ...arc }, { signal: '의도한 누름', ...pressed },
    ]
    ledger['press_effect'] = rows
    for (const x of rows) console.log('[41-2 효과] ' + JSON.stringify(x))
    // 무회귀 — 신호가 없거나 안 누른 결이면 41-1과 **글자 그대로 같다**
    expect(flat.stood, '평평한 결은 41-1과 같다').toBe(none.stood)
    expect(arc.stood, '안 누른 자연 결은 41-1과 같다').toBe(none.stood)
    // 있으면 선다 — 그리고 **의도한 그 교차**로 선다
    expect(pressed.stood, '누른 획은 대기하지 않는다').toBeGreaterThan(none.stood)
    // 교차가 정한 획은 **전부** 누른 자리의 교차로 섰다(오차 0.000000).
    // ⚠ 분모 밖의 `decided_by_other_pass`는 사슬(명시 점)이 세운 것이다 — 우선순위 표가
    //    「명시된 것이 암묵의 것을 이긴다」이므로 그 칸에서 «의도한 교차»는 자가 아니다.
    expect(pressed.by_crossing, '교차가 정한 획이 있다').toBeGreaterThan(0)
    expect(pressed.onTarget, '누른 자리의 교차가 선택된다').toBe(pressed.by_crossing)
    // ⚠⚠ **자리 축의 반증**(1차 리뷰어 [14]) — 위 팔은 「누름이 목표 위에 있을 때」만 본다.
    //    누름을 **두 교차의 중간**에 두면 그것은 어느 쪽의 신호도 아니다: 그때 무엇이 되는가.
    const mid = (() => {
      const { b, trials } = crowdedDeep()
      const r0 = liftAll(b.doc)
      for (const { s, target } of trials) {
        // 목표의 이웃 교차(같은 획이 지나는 다른 세로선)를 찾아 그 중간에 누름을 둔다
        const other = neighbourCrossing(r0, b.doc, s, target)
        const at = other ? midRawIndex(s, target, other) : nearestRawIndex(s, target)
        s.rawIn = { press: pressProfile('pressAt', s.raw!.length, 20260831 + s.id * 7919, at) }
      }
      const r = liftAll(b.doc)
      const size = geomSizeOf(r.lifted)
      const byCross = new Set(xintAmbigFinal().keys())
      let stood = 0, byC = 0, onT = 0
      for (const { s, target } of trials) {
        if (!r.lifted.has(s.id)) continue
        stood++
        if (!byCross.has(s.id)) continue
        byC++
        const e = placementError(r, b.doc, s, target)
        if (e !== null && size > 0 && e / size <= C.INTERSECT_GAP_RATIO) onT++
      }
      return { stood, by_crossing: byC, onTarget: onT, trials: trials.length }
    })()
    console.log('[41-2 자리 반증] ' + JSON.stringify(mid))
    ledger['press_position_falsification'] = {
      what: '누름을 목표 교차와 그 이웃 교차의 **중간**에 뒀다 — 신호가 어느 쪽도 안 가리킨다.',
      ...mid,
      reading: '목표로 선 것이 «의도한 누름» 판보다 적으면 이 자는 **자리를 실제로 읽고 있다**. '
        + '같으면 그 판의 14/14는 자리가 아니라 다른 것이 낸 값이다(§5.1 유형 3).',
    }
    expect(mid.onTarget, '중간에 누르면 목표 적중이 줄어든다 — 자를 자리가 정한다')
      .toBeLessThan(pressed.onTarget)
  })

  it('보정을 **안 읽는다** — 행위로 잰다(#91: 안 바뀌었는가 ≠ 안 썼는가)', () => {
    // ⚠⚠ **이 회차가 세운 #91이 이 회차 자신에게 걸렸다**(1차 리뷰어의 「세션 내 재발」).
    //    주장은 **행위**(「리프팅이 `doc.press`를 안 읽는다」)인데 아래 팔의 판정자는
    //    **상태**(두 판의 결과가 같다)였다 — 결과가 같은 것은 「안 읽었다」의 **결과**이지
    //    증거가 아니다(보정을 읽고도 결과가 같을 수 있다). 그래서 **행위를 직접 잰다**:
    //    `lift.ts`의 원문에 보정으로 가는 이름이 하나도 없는지. `capture_payload`가
    //    `src/core`의 raw 참조를 같은 방식으로 재는 그 자리다.
    // ⚠ **주석을 걷고 본다** — 이 팔이 처음에 두 건을 잡았는데 둘 다 «안 읽는다»고 적은
    //    주석 문면이었다(`PressCal`·`doc.press`). 재는 것은 **코드가 읽는가**이므로
    //    주석은 대상이 아니다. 그 첫 실행이 곧 이 팔의 반증 확인이다(D-3 — 실제로 빨갰다).
    const src = readFileSync(resolve(__dirname, '../src/core/lift.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const refs = ['PressCal', 'defaultPressCal', 'remapPress', 'pressAlpha', 'pressWidthFactor',
      "from './press'", 'doc.press', '.press?.on']
      .filter(k => src.includes(k))
    console.log(`[41-2 보정·행위] lift.ts의 보정 참조 ${refs.length}건 ${JSON.stringify(refs)}`)
    ledger['press_calibration_not_read'] = {
      what: '**행위로 잰다**(#91) — `src/core/lift.ts` 원문에 보정으로 가는 이름이 있는가.',
      names_checked: 8, found: refs,
      comments_stripped: true,
      falsification: '주석을 안 걷고 돌리면 두 건이 잡힌다(`PressCal`·`doc.press` — 둘 다 '
        + '«안 읽는다»고 적은 주석 문면이다). 이 팔은 처음 실행에서 실제로 빨갰다.',
      note: '⚠ 이 자는 «파일 단위»다 — `lift.ts` 안에서 새로 보정을 읽으면 이름이 늘어 잡히지만, '
        + '이름을 우회하면(예: 동적 키) 못 잡는다. 알려진 한계이고 `capture_payload`의 '
        + 'raw 참조 문과 같은 급이다.',
    }
    expect(refs, '리프팅은 보정으로 가는 이름을 하나도 안 든다').toEqual([])
  })

  it('그래서 보정 켜짐/꺼짐 양쪽에서 결과도 같다 — 위의 «귀결»이다', () => {
    const run = (on: boolean) => {
      const { b, trials } = crowdedDeep()
      b.doc.press = { ...defaultPressCal(), on, p0: on ? 0.1 : 0, p1: on ? 0.6 : C.PRESS_CAL_P1 }
      for (const { s, target } of trials) {
        s.rawIn = {
          press: pressProfile('pressAt', s.raw!.length, 20260831 + s.id * 7919,
            nearestRawIndex(s, target)),
        }
      }
      const r = liftAll(b.doc)
      return trials.filter(t => r.lifted.has(t.s.id)).map(t => t.s.id).join(',')
    }
    const off = run(false), on = run(true)
    console.log(`[41-2 보정] 꺼짐 [${off}] · 켜짐 [${on}]`)
    ledger['press_calibration_invariance'] = {
      off, on, same: off === on,
      note: '⚠ **이것은 판정자가 아니라 귀결이다**(#91) — 「안 읽는다」의 판정자는 위 팔'
        + '(`press_calibration_not_read`)이고 이 줄은 그 결과가 화면 밖에서도 같은지 본다. '
        + '`same: true`는 구성상 보장이므로 임계로 안 쓴다(§5.1 유형 3).',
    }
    expect(on, '보정은 리프팅에 안 걸린다').toBe(off)
  })

  it('단위 — pressedPoint는 이 획 안의 상대값만 본다', () => {
    const a: Pt = { x: 0, y: 0 }, z: Pt = { x: 160, y: 0 }
    const s: Stroke = { id: 1, a, b: z, raw: rawOf(a, z) }
    expect(pressedPoint(s), 'rawIn이 없으면 신호도 없다').toBeNull()
    s.rawIn = { press: pressProfile('flat', s.raw!.length, 1) }
    expect(pressedPoint(s), '평평하면 누른 자리가 없다').toBeNull()
    s.rawIn = { press: pressProfile('naturalArc', s.raw!.length, 20260831 + 7919, -1) }
    expect(pressedPoint(s), '자연 결도 누른 자리가 아니다').toBeNull()
    const at = 12
    s.rawIn = { press: pressProfile('pressAt', s.raw!.length, 20260831 + 7919, at) }
    expect(pressedPoint(s), '누르면 그 자리가 난다').toEqual(s.raw![at])
    // **절대 세기는 안 본다** — 전 구간을 반으로 줄여도 같은 자리가 난다
    const half = s.rawIn.press!.map(v => Math.round(v / 2))
    expect(pressedPoint({ ...s, rawIn: { press: half } }), '세기를 반으로 줄여도 같다')
      .toEqual(s.raw![at])
    // 길이가 안 맞으면 안 읽는다(저장이 깨진 파일에서 조용히 틀리지 않는다)
    expect(pressedPoint({ ...s, rawIn: { press: s.rawIn.press!.slice(0, 5) } })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('41 원장', () => {
  it('stage0/out/xint41_web2.json', () => {
    const out = resolve(__dirname, '../../stage0/out')
    mkdirSync(out, { recursive: true })
    writeFileSync(resolve(out, 'xint41_web2.json'), JSON.stringify({
      what: 'web2-41 1번·2번 — 「애매하면 대기한다」의 문턱과 게이트. 애매함은 후보의 '
        + '**개수**가 아니라 후보들이 만드는 **3D 선들이 서로 벌어진 폭**으로 잰다.',
      run: {
        canonical: 'LEDGER=1 npx vitest run test/xint41.test.ts',
        fixtures: {
          sparse: `발판 7획(세로 넷 x=${SPARSE_VERT_X.join('·')})`,
          crowded_flat: '37 회차의 그 픽스처 — 세로 여덟의 밑이 **한** vp1 지면선 위(43획)',
          crowded_deep: `지면선 셋(y0=${DEEP_GL.join('·')})에 세로 여섯(x=${DEEP_VERT_X.join('·')})을 `
            + '나눠 세운 판 — 세로선이 한 평면에 없다',
        },
        note: '「잘못 놓였다」의 자는 앱 자신의 «같은 자리» 문(INTERSECT_GAP_RATIO)이고 '
          + '분모는 승격 기하 bbox 대각(geomSizeOf)이다 — 새 자를 안 지었다(#54).',
      },
      thresholds: {
        XINT_AMBIG_RATIO, alias_of: 'C.INTERSECT_GAP_RATIO',
        PRESS_PEAK_RATIO: C.PRESS_PEAK_RATIO,
      },
      ...ledger,
      // ⚠ **게이트에 `reachability`를 값으로 단다**(#35 · #40 — 「무엇이 이 기준을 넘을 수
      //    있는가」가 없으면 그 기준은 자명할 수 있다). 여기서는 **고치기 전 행이 그 값**이다.
      gate: {
        for: '붐비는 장면에서 «잘못 놓인 선» 0 (지시문 web2-41 41-1의 반증 조건)',
        measured: '문턱 ×0.5·×1·×2 세 판 모두 `crowded_flat`·`crowded_deep`에서 misplaced 0',
        reachability: '이 기준을 **넘을 수 있다** — 같은 팔·같은 픽스처의 «고치기 전» 행'
          + '(`ratio: "∞(37의 규칙)"`)이 그 값이다. 오라클은 「의도한 교차가 냈을 답」이고 '
          + '픽스처가 구성으로 그것을 심는다(시험 획이 T를 정확히 지난다).',
        reachability_source: 'crowded_deep/0/misplaced',
        reachability_value: 15,
        registered: '이 기준은 자명하지 않다 — 고치기 전 행에서 15/15가 잘못 놓이고 '
          + 'worst_error_rel 0.167082가 문(0.01)의 16.7배다. ⚠ `crowded_flat`에서는 '
          + '고치기 전에도 0이다 — 그 픽스처는 이 게이트에 **판별력이 없다**(AS-C140).',
        margin: '⚠ **방향마다 다르다**(1차 리뷰어 [2] — 얇은 쪽을 숨기지 않는다). '
          + '애매한 쪽으로는 문 0.01 ↔ `crowded_deep`의 최소 벌어짐 **0.349484**(같은 행에서 '
          + '읽는다 — 1차 [8]) = **35배**. 무해한 쪽으로는 문 0.01 ↔ `crowded_flat`의 최대 '
          + '벌어짐 **0.008804** = **1.14배**뿐이고, 실제로 ×0.5(0.005)에서 그 픽스처의 '
          + '6/24가 대기로 넘어간다. 즉 게이트(잘못 놓임 0)의 여유는 크고 **자립률의 여유는 '
          + '얇다** — 그 얇은 쪽이 지시문이 「값이 싸다」고 매긴 방향이다.',
        margin_is_not_fixture_bound: '「붐빔①이 무해한 것은 각오차 대역의 성질 아닌가」(1차 [2])를 '
          + '값으로 답했다 — `crowded_flat_angle_band`에서 대역을 1.72° → 13.75°(8배)로 키워도 '
          + '벌어짐 최대가 0.0074~0.0180에 머문다. 무해함은 **대역이 아니라 발판의 공면성**이 낸다.',
      },
      // ⚠⚠ **1차 리뷰어 [1]의 물음에 답하는 자리** — 「벌어짐이 문 위인데 교차가 세웠고
      //    그 자리가 맞았다」는 칸이 있는가. 41-1만으로는 **없다**(그것이 41-1의 설계다:
      //    문 위면 안 세운다). 그 칸을 만드는 것은 **41-2의 누름**이고 값이 아래다.
      gate_correctly_stood: {
        what: '「교차가 세웠고 그 자리가 맞았다」의 칸 — 벌어짐이 문 «위»인 획에서.',
        by_41_1_alone: '없다. 문 위면 대기가 답이므로 `crowded_deep`의 stood_by_crossing가 0이다 '
          + '— 41-1이 지키는 것은 「안 세운다」 하나이고 그것이 이 절의 주장 전부다.',
        by_41_2_press: '`press_effect`의 «의도한 누름» 행이 그 칸이다 — 같은 장면(벌어짐 '
          + '0.349~0.583 = 문의 35~58배)에서 교차가 14획을 세웠고 **14/14가 의도한 그 교차**다.',
        below_threshold: '문 «아래»에서 옳게 세우는 것은 `crowded_flat`이 든다 — '
          + 'stood_by_crossing 16 · correctly_placed 16 · misplaced 0. ⚠ 그 픽스처에서는 '
          + '어느 후보를 골라도 같은 선이므로(AS-C140) 이 16은 **고르기의 정확도가 아니라 '
          + '«세운다»의 무회귀**를 잰다.',
      },
      pitfalls: ['#42', '#54', '#71', '#82', '#84', '#85', '#86', '#88',
        '#12', '#14', '#16', '#43', '#5', '#47', '#90'],
      selfcheck_notes: {
        misplaced_zero_after: '`crowded_*`의 고친 뒤 `misplaced: 0`은 **일부가 구성상 보장**이다'
          + '(§5.1 유형 3): 문턱이 `INTERSECT_GAP_RATIO`와 같은 값이므로, 자립한 획의 벌어짐이 '
          + '문 아래면 어느 후보와의 거리도 그 문 아래다. **판별력은 «고치기 전» 줄이 든다** — '
          + '`crowded_deep`의 ∞ 행에서 misplaced > 0이고 worst_error_rel이 문의 열 배를 넘는다.',
        sparse_spread_zero: '`sparse_no_regression`의 `spread_rel` 0은 측정이다 — 발판의 세로 넷이 '
          + '3D에서 한 평면에 있어 후보들이 **같은 선**을 낸다. 임계로 안 쓴다.',
        single_seed: '시드 하나(20260831) · 픽스처 셋. 필압 결만 300 시드를 돈다. '
          + '후보 수와 깊이 분포는 픽스처가 정한다(#14의 미측정 — 시드 변동폭을 안 쟀다).',
        scene_size_varies_by_row: '같은 픽스처인데 `scene_size_world`가 행마다 다르다'
          + '(∞ 118.1431 ↔ 고친 뒤 95.21 — 1차 리뷰어 [9]). **분모는 그 실행이 끝난 시점의 '
          + '장면**이고, 37의 규칙이 세운 «잘못 놓인 획»이 bbox를 부풀리기 때문이다. '
          + '절대 벌어짐은 두 행에서 같다(33.27 = 0.281645×118.1431 = 0.349484×95.21) — '
          + '그래서 **행을 섞어 비를 읽으면 안 된다**(#42 ⑨). ⚠ 판정 시점의 분모는 또 다르다'
          + '(리프팅이 진행되며 자란다) — 그 값은 `xintAmbigTrace`의 `scale`이 든다.',
        flat_worst_error_above_its_threshold: '`crowded_flat`의 ×0.5 행에서 `worst_error_rel` '
          + '0.006079가 그 행의 문 0.005보다 크다(1차 리뷰어 [10]). 순환 논증이 **거기서 '
          + '깨지는 것이 정상**이다: 벌어짐은 «판정 시점의 후보 집합»에서 재고, 배치 오차는 '
          + '«실행이 끝난 뒤 존재하는 의도한 교차»와 견준다 — 뒤엣것은 그 획이 선 뒤에 올라온 '
          + '선일 수 있어 후보 집합 밖이다. 즉 두 수의 프레임이 다르고, 그래서 이 원장의 '
          + '`misplaced`는 **완전한 구성상 보장이 아니다**(그 점이 판별력의 남은 몫이다).',
        crowded_deep_zero_error: '`crowded_deep`의 고친 뒤 행에서 `worst_error_rel`·'
          + '`error_median_rel`이 0/null인 것은 **분모가 비었기 때문**이다 — 교차가 정한 획이 '
          + '한 개도 안 서고 전부 대기한다(`ambiguous 23/24`). 「오차가 0이다」가 아니라 '
          + '「잴 것이 없다」이고, 그것이 이 게이트가 원한 상태다. 판별력은 ∞ 행이 든다.',
        wait_reasons_single_category: '`wait_reasons`가 `ambiguous` 한 범주뿐인 것은 **설계**다 — '
          + '이 픽스처의 시험 획은 전부 「축 + 교차 여럿」 갈래이고 41-1이 그 갈래를 대기시킨다. '
          + '다른 사유(`noPoint`·`onePoint`·`nearCross`·`hasHeight`)가 나는 판은 '
          + '`xint37_web2.json`의 조합 전수 표가 든다.',
        principle_d_two_axes: '`principle_d_unprojectable`는 **개수**이고 '
          + '`principle_d_drift_px`는 **px**다 — 이름이 같은 다른 지표가 되지 않게 둘로 갈랐다'
          + '(#28 · 1차 리뷰어 [3]. `xint37_web2.json`의 `principle_d`는 px 쪽이다). '
          + '⚠⚠ **좌표 축은 이 픽스처에서 «통과»가 아니다**: 교차가 세운 획의 재사영 드리프트가 '
          + '중앙 3.34~4.11 px · 최대 6.41 px로 `TAP_MAX_PX`(2)를 넘는다. 41 전후가 **같으므로** '
          + '41의 회귀가 아니라 37-1의 성질이다. ⚠ 이 픽스처는 `a`·`b`를 직접 놓아 앱의 축 스냅을 '
          + '안 지나므로 이 수는 **상한**이다(실사용에서는 확정 2D가 이미 축에 붙어 있다). '
          + '통과선을 안 걸었고 `DEFERRED.md`에 올렸다.',
        press_flat_all_one: '`press_bands.flat_like_mouse`의 min=mean=max=1.0000은 **구성상 '
          + '보장**이다 — 평평한 결은 떨림을 안 태우므로 최대와 평균이 같다(1차 리뷰어 [15]). '
          + '임계로 안 쓴다. 이 행이 하는 일은 「자가 상수 입력에서 발화하지 않는다」 하나다.',
        unprojectable_zero: '`principle_d_unprojectable: 0`은 **관문을 넣은 뒤의 값**이라 '
          + '보장에 가깝다(1차 리뷰어 [15]). 판별력은 관문 «전»의 실측이 든다 — `busy37`에서 '
          + '자립 획 넷의 a3.z가 +83.52였다(AS-C141 · 그 수는 이 원장 밖의 진단 로그다).',
        placement_error_uses_rays: '`placementError`가 `rayThrough`를 부르므로 selfcheck의 '
          + '**자기참조 유형 3** 탐지에 걸린다(오차류 이름의 함수가 스스로 변환을 수행한다). '
          + '확인했다 — **자기참조가 아니다**: 이 함수는 앱이 놓은 3D와 «의도한 교차가 냈을 '
          + '3D»를 **둘 다 밖에서 지어** 견주고, 광선은 두 답을 같은 방식으로 내리는 데만 '
          + '쓴다(둘 중 하나를 상대의 변환으로 만들지 않는다). 판별력은 `crowded_deep`의 '
          + '∞ 행이 0.167082를 내는 것이 든다 — 자기참조면 그 값이 0이어야 한다.',
        snapshots_absent: '`constantsSnapshot()`·`metric_defs`가 없다 — **web2 라인 전체의 '
          + '유보**이고 이 원장만의 사정이 아니다(web2-31 절이 같은 셋을 적었다). 그동안 '
          + 'STALE 판정은 사람이 「원장을 재실행했는가」로 해 왔고, 이 회차도 그렇게 했다'
          + '(git stash로 귀속 — NOTES 「원장 귀속」).',
        density_row0_n1: '`ambiguous_rate_by_density[0]`은 **획 하나짜리** 성긴 판이다(분모 1) — '
          + '거기 있는 0/1은 비율이 아니라 그 한 획의 상태다. 이 줄이 재는 것은 「성긴 장면에서 '
          + '교차로 그은 획이 선다」 하나이고, 그 판별력은 같은 시험의 `crossing_stroke_stood`가 든다.',
      },
      what_this_does_not_say: '이 표는 **작도 포즈**의 것이고 획이 직선 하나인 경우만 본다. '
        + '실기기의 손 필압 결과 각도 오차 분포는 표본이 0이다(AS-C1 계열) — 여기 결은 '
        + '반사인 + 떨림 ±20%의 합성이다.',
    }, null, 2))
    expect(Object.keys(ledger).length).toBeGreaterThan(6)
  })
})
