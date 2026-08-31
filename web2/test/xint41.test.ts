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
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  liftAll, geomSizeOf, pressedPoint, setXintAmbigRatio, xintAmbigTrace,
  screenCross, closestOnLineToRay, type LiftResult,
} from '../src/core/lift'
import { project, rayThrough, DRAW_POSE } from '../src/core/camera'
import { C, XINT_AMBIG_RATIO } from '../src/core/constants'
import { defaultPressCal } from '../src/core/press'
import type { Doc, Stroke } from '../src/core/types'
import { sub3, norm3, len3, type Pt, type V3 } from '../src/core/vec'
import {
  sparse, crowdedFlat, crowdedDeep, pressProfile, nearestRawIndex, rawOf,
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

type Scene = { b: { doc: Doc }; trials: Trial[]; scaffoldN: number }

/** 한 장면의 한 판 — 「몇이 서고 몇이 애매로 대기하고 잘못 놓인 것이 몇인가」 */
function judge(make: () => Scene, ratio: number | null) {
  setXintAmbigRatio(ratio)
  try {
    const { b, trials, scaffoldN } = make()
    const r = liftAll(b.doc)
    const size = geomSizeOf(r.lifted)
    const trace = [...xintAmbigTrace()]
    const byCross = new Map(trace.map(x => [x.id, x]))
    let stood = 0, waited = 0, ambig = 0, misplaced = 0, worst = 0, otherPass = 0
    const errs: number[] = []
    for (const { s, target } of trials) {
      if (r.lifted.has(s.id)) stood++
      else { waited++; if (r.waitWhy.get(s.id) === 'ambiguous') ambig++ }
      // ⚠⚠ **분모는 「교차가 정했다」이지 「교차가 있다」가 아니다**(37 2차 리뷰어 [13]의
      //    그 자리). 판정자는 **앱이 남긴 표식**이다 — 밖에서 다시 세면 사슬이 세운 획이
      //    섞여 분자가 부푼다(실측: 누름 판에서 아홉이 그 경우였고 오차 0.002~0.29였다).
      if (!r.lifted.has(s.id)) continue
      if (!byCross.has(s.id)) { otherPass++; continue }
      const e = placementError(r, b.doc, s, target)
      if (e === null) continue
      const rel = size > 0 ? e / size : Infinity
      errs.push(rel)
      worst = Math.max(worst, rel)
      // **「잘못 놓였다」의 자는 앱 자신의 «같은 자리» 문**이다(#54 — 새 숫자 ⛔).
      if (rel > C.INTERSECT_GAP_RATIO) misplaced++
    }
    const rels = trace.map(x => x.rel).sort((p, q) => p - q)
    errs.sort((p, q) => p - q)
    return {
      strokes: b.doc.strokes.length, scaffold: scaffoldN, trials: trials.length,
      lifted_total: r.lifted.size, stood, waited, ambiguous: ambig,
      crossing_pass_seen: byCross.size, decided_by_other_pass: otherPass,
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
      const trace = [...xintAmbigTrace()]
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

  it('반증 손잡이 — 문턱 0이면 후보가 여럿인 획이 전부 대기한다', () => {
    setXintAmbigRatio(0)
    const { b, trials } = crowdedDeep()
    const r = liftAll(b.doc)
    const trace = [...xintAmbigTrace()]
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
    // **반증** — 문을 자연 결 대역 안으로 내리면 오발화가 난다(문이 아무것도 안 재는 것 ⛔)
    const low = 1.6
    let falsePos = 0
    for (let k = 1; k <= SEEDS; k++) {
      if (ratioOf(pressProfile('naturalArc', N, 20260831 + k * 7919, -1)) >= low) falsePos++
    }
    console.log(`[41-2 결·반증] 문턱을 ${low}으로 내리면 자연 결 오발화 ${falsePos}/${SEEDS}`)
    ledger['press_bands_falsification'] = { lowered_threshold: low, false_fire: `${falsePos}/${SEEDS}` }
    expect(falsePos, '문턱을 내리면 오발화가 난다').toBeGreaterThan(0)
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
      const byCross = new Set([...xintAmbigTrace()].map(x => x.id))
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
  })

  it('보정 켜짐/꺼짐 양쪽에서 같다 — 상대값이라 구성상 그렇다', () => {
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
    ledger['press_calibration_invariance'] = { off, on, same: off === on }
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
        margin: '무해한 쪽 위 끝 0.008804 ↔ 애매한 쪽 아래 끝 0.281645 = 32배 골. '
          + '문(0.01)은 그 안이다(#82).',
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
        crowded_deep_zero_error: '`crowded_deep`의 고친 뒤 행에서 `worst_error_rel`·'
          + '`error_median_rel`이 0/null인 것은 **분모가 비었기 때문**이다 — 교차가 정한 획이 '
          + '한 개도 안 서고 전부 대기한다(`ambiguous 23/24`). 「오차가 0이다」가 아니라 '
          + '「잴 것이 없다」이고, 그것이 이 게이트가 원한 상태다. 판별력은 ∞ 행이 든다.',
        wait_reasons_single_category: '`wait_reasons`가 `ambiguous` 한 범주뿐인 것은 **설계**다 — '
          + '이 픽스처의 시험 획은 전부 「축 + 교차 여럿」 갈래이고 41-1이 그 갈래를 대기시킨다. '
          + '다른 사유(`noPoint`·`onePoint`·`nearCross`·`hasHeight`)가 나는 판은 '
          + '`xint37_web2.json`의 조합 전수 표가 든다.',
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
