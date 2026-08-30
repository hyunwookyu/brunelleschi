// 원장 — web2-32 5·6·7번(축척 · 재기 · 어긋남). **측정은 stage0/out에 JSON으로 남긴다**
// (CLAUDE.md §5.1: 원장 밖 측정은 규칙이 있어도 안 걸린다).
//
// 이 원장이 재는 것 넷:
//  ① **축척의 왕복** — 미정 → 확정(비의 수치) → 첫 치수를 지우면 다시 미정 → 다음 치수가 정함.
//     32-5는 새 기제를 안 만들었으므로 «있던 규칙»이 실제로 왕복하는지가 유일한 관측이다.
//  ② **어긋남의 발화 표** — 「적은 값 ÷ 잰 값」이 무엇에서 1이고 무엇에서 갈리는가.
//     ⚠⚠ 여기 **함정의 자국**을 같이 남긴다: 치수를 «적용한 뒤» 길이로 재면 비가 정확히
//     1.000000이다(#77 ㉡ · AS-C107). 두 자를 같은 칸에서 나란히 낸다.
//  ③ **재기의 왕복** — 오스냅 네 갈래의 «정체»가 좌표를 다시 내는가(상대 오차).
//  ④ **파생을 안 담는 대가** — 남긴 재기 하나가 파일에서 몇 바이트인가.
//
// 실행: `npx vitest run test/scale32_measure.test.ts`

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session } from './session'
import { W, H } from './fixtures'
import { setDimension, addLayer, setLayerOn } from '../src/app/state'
import { lenMm, dimSkew, skewOff, formatScale, formatUnits } from '../src/core/dim'
import { measureMm, measureUnits, identifyPoint, measurePoint3, type MeasurePoint } from '../src/core/measure'
import { liftAll } from '../src/core/lift'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { geomSize3 } from '../src/core/osnap'
import { C } from '../src/core/constants'
import { dist3 } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (v: number) => Number(v.toFixed(6))

/** 서로 다른 길이의 기둥 둘 — 32-7 지시의 픽스처 그대로 */
function two() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  const post = s.draw(500, 500, 500, 380)!
  const post2 = s.draw(600, 475, 600, 400)!
  return { s, app: s.app, post, post2 }
}

describe('원장 — web2-32 5·6·7', () => {
  it('축척 왕복 · 어긋남 표 · 재기 왕복 · 저장 대가', () => {
    // ── ① 축척의 왕복 ───────────────────────────────────────────────────
    const A = two()
    const roundtrip: Record<string, unknown>[] = []
    const snap = (stage: string, app = A.app) => ({
      stage,
      mmPerUnit: app.lift.mmPerUnit === null ? null : r6(app.lift.mmPerUnit),
      scaleId: app.lift.scaleId,
      shown: formatScale(app.lift.mmPerUnit),
    })
    roundtrip.push(snap('치수 없음'))
    setDimension(A.app, A.post.id, 2400)
    roundtrip.push(snap('첫 치수 2400'))
    // 첫 치수를 지운다 — **별도 조작을 안 만들었다**(지시): 그 획의 dim을 없애는 것이 그것이다
    delete A.app.doc.strokes.find(x => x.id === A.post.id)!.dim
    delete A.app.doc.scaleRef
    let lf = liftAll(A.app.doc)
    roundtrip.push({ stage: '첫 치수 삭제', mmPerUnit: lf.mmPerUnit, scaleId: lf.scaleId, shown: formatScale(lf.mmPerUnit) })
    A.app.doc.strokes.find(x => x.id === A.post2.id)!.dim = 1800
    lf = liftAll(A.app.doc)
    roundtrip.push({ stage: '다음 치수 1800', mmPerUnit: r6(lf.mmPerUnit!), scaleId: lf.scaleId, shown: formatScale(lf.mmPerUnit) })
    // 지시는 「지우거나 **고친다**」 둘을 들었다 — 초판은 «지우기»만 냈다(1차 리뷰어 [16]).
    // 기준 획의 값을 반으로 고치면 축척도 반이 된다(그 획이 분모이므로).
    A.app.doc.strokes.find(x => x.id === A.post2.id)!.dim = 900
    lf = liftAll(A.app.doc)
    roundtrip.push({ stage: '그 치수를 900으로 고침', mmPerUnit: r6(lf.mmPerUnit!), scaleId: lf.scaleId, shown: formatScale(lf.mmPerUnit) })
    for (const r of roundtrip) console.log(`[32-5 왕복] ${JSON.stringify(r)}`)
    expect(roundtrip[0]!.mmPerUnit).toBeNull()
    expect(roundtrip[2]!.mmPerUnit).toBeNull()          // 되돌아왔다
    expect(roundtrip[3]!.scaleId).toBe(A.post2.id)      // 다음 치수가 정했다

    // ── ② 어긋남의 발화 표 ──────────────────────────────────────────────
    const B = two()
    setDimension(B.app, B.post.id, 2400)
    const g0 = B.app.lift.lifted.get(B.post2.id)!
    const trueMm = lenMm(g0.a3, g0.b3, B.app.lift.mmPerUnit)!
    // ⚠ **자와 문턱이 바뀌었다**(web2-34 7번 · #75 ㉣) — 옛 표는 「문턱의 절반 · 문턱의 두 배」를
    // 물었고 그 문턱은 **비 편차 0.02**였다. 지금 자는 `fold = max(비, 1/비)`이고 문턱은
    // **배수**(`DIM_SKEW_FOLD`)이므로 **묻는 것을 다시 적는다**: 자연 대역 ↔ 배수 오독 ↔ 경계.
    // 자연 대역의 근거는 `skew34_web2.json`(자연 fold 중앙 1.0344 · p95 1.6772).
    const factors = [1, 1.2, 1.5, C.DIM_SKEW_FOLD, 1 / C.DIM_SKEW_FOLD, 3, 1 / 3, 10, 0.1]
    const skewRows = factors.map(f => {
      setDimension(B.app, B.post2.id, trueMm * f)
      const k = dimSkew(B.app.lift, B.post2.id)!
      const g = B.app.lift.lifted.get(B.post2.id)!
      // ⚠⚠ 함정의 자국 — «적용한 뒤» 길이로 잰 비. 이것이 **구성상 1**이다.
      const afterMm = lenMm(g.a3, g.b3, B.app.lift.mmPerUnit)!
      return {
        factor: r6(f),
        written_mm: r6(k.written),
        measured_mm_before_dim: r6(k.measured),
        ratio_before_dim: r6(k.ratio),
        ratio_after_dim: r6(afterMm / k.written),   // 항등의 자리
        // 대칭 자와 문턱 대비 여유(#14 — 착수 표가 약속하고 초판이 안 적었다: 1차 리뷰어 [7])
        fold: r6(k.fold),
        over_threshold: r6(k.fold / C.DIM_SKEW_FOLD),
        fires: skewOff(k),
      }
    })
    // 첫 치수(축척을 정한 획)의 칸 — 표본이 하나였을 때의 그 0이다
    const firstRow = (() => {
      const k = dimSkew(B.app.lift, B.post.id)!
      return { which: '첫 치수(축척의 분모)', ratio_before_dim: r6(k.ratio), fires: skewOff(k) }
    })()
    for (const r of skewRows) console.log(`[32-7 발화] ${JSON.stringify(r)}`)
    console.log(`[32-7 발화] ${JSON.stringify(firstRow)}`)
    expect(firstRow.ratio_before_dim).toBe(1)
    expect(skewRows.every(r => r.ratio_after_dim === 1), '적용 뒤 비는 언제나 1 — 그 자가 아무것도 안 잰다').toBe(true)
    // 뜨는 것은 **배수 오독 넷**뿐이다(3배 위·아래 · 10배 위·아래). 자연 대역 셋(1 · 1.2 · 1.5)과
    // **경계에 정확히 걸린 둘**(2배 · 반)은 조용하다 — 자가 `>`이지 `≥`가 아니다.
    expect(skewRows.filter(r => r.fires).map(r => r.factor)).toEqual([3, r6(1 / 3), 10, 0.1])
    // 대칭의 자국 — 위·아래 짝의 fold가 같은 값이다(자가 방향에 무관하다)
    expect(skewRows.find(r => r.factor === 3)!.fold).toBe(skewRows.find(r => r.factor === r6(1 / 3))!.fold)

    // ── ③ 재기의 왕복 (오스냅 네 갈래) ──────────────────────────────────
    const C2 = two()
    setDimension(C2.app, C2.post.id, 2400)
    const g = C2.app.lift.lifted.get(C2.post.id)!
    const size = geomSize3(C2.app.lift)
    const tol = C.MERGE_RATIO * Math.max(size, 1e-9)
    const at = (t: number) => ({
      x: g.a3.x + (g.b3.x - g.a3.x) * t,
      y: g.a3.y + (g.b3.y - g.a3.y) * t,
      z: g.a3.z + (g.b3.z - g.a3.z) * t,
    })
    // ⚠ 초판은 near와 int를 한 행 이름에 묶었다(1차 리뷰어 [15]) — 갈래가 셋뿐이었다.
    // 갈라 적는다. `perp`(수선 발)는 **재기 모드에서 안 난다** — 그 후보는 «그리는 중의
    // 시작점»을 요구하는데(osnap의 `start.p3`) 재기는 탭 둘이라 시작점이 없다. 그 사실을
    // 이 표에 적는다(못 재는 것을 잰다고 안 적는다 — #26).
    const kinds: [string, number][] = [['end(a)', 0], ['mid', 0.5], ['near(t=0.25)', 0.25], ['int(3D 실교차 t=0.75)', 0.75], ['end(b)', 1]]
    const idRows = kinds.map(([name, t]) => {
      const p3 = at(t)
      const mp = identifyPoint(C2.app.lift, p3, tol)!
      const back = measurePoint3(C2.app.lift, mp)!
      return { kind: name, t_found: r6(mp.t), rel_err: r6(dist3(back, p3) / size) }
    })
    for (const r of idRows) console.log(`[32-6 정체] ${JSON.stringify(r)}`)
    expect(idRows.every(r => r.rel_err < 1e-9)).toBe(true)

    // 축척이 바뀌면 잰 값이 따라 바뀐다 — 저장된 숫자가 아니라는 관측
    const m: { a: MeasurePoint; b: MeasurePoint } =
      { a: { s: C2.post2.id, t: 0 }, b: { s: C2.post2.id, t: 1 } }
    const v1 = measureMm(C2.app.lift, m)!
    setDimension(C2.app, C2.post.id, 4800)
    const v2 = measureMm(C2.app.lift, m)!
    const derived = {
      scale_x2_value_ratio: r6(v2 / v1),
      note: (
        '⚠ 이 2는 **대수적 귀결**이다(값 = 길이 × mmPerUnit) — 혼자서는 «담았는가»를 못 가른다. '
        + '2차 리뷰어 [5]가 초판의 위약(v1/v1 = 1)을 «어떤 구현에서도 1인 산술 항등»으로 '
        + '반박했다. 가르는 것은 아래 `storage_cost.schema`와 `format_ignores_number`다.'
      ),
    }
    console.log(`[32-6 파생] ${JSON.stringify(derived)}`)
    expect(derived.scale_x2_value_ratio).toBe(2)

    // ── 게이트 ①(리뷰어 [3]) — **잰 값이 실제 거리와 일치한다** ─────────────────
    // ⚠⚠ **2차 리뷰어 [2]가 초판을 반박했다**: 초판은 「기준 획을 재면 2400이 나온다」를
    //   참값 대조로 썼는데, 그 획은 **축척의 분모**라 리프팅이 길이를 dim으로 다시 세운다 —
    //   **언제나 2400이다.** 그것은 `ratio_after_dim` 열과 **같은 항등**이고, 이 회차가
    //   32-7에서 잡은 바로 그 형태다(#77 ㉡). 같은 세션에서 두 번째였다.
    //
    // 그래서 참값을 **재기 밖에서** 세운 셋으로 바꾼다:
    //   ㉠ **산술** — 선분 위 t의 반 토막은 전체의 정확히 절반이다(선형보간의 성질이고
    //      dim·mmPerUnit과 **무관**하다). 기준 획이 2400 mm면 t 0→0.5는 **1200 mm**여야 한다.
    //   ㉡ **가법성** — (0→0.5) + (0.5→1) == (0→1). 어느 한 토막이 틀리면 깨진다.
    //   ㉢ **교차 획** — 서로 다른 두 획의 점 사이 거리. 참값은 이 팔이 `dist3`로 **직접**
    //      계산한다(`core/measure.ts`를 안 지난다 — 그래서 독립이다).
    const C3 = two()
    setDimension(C3.app, C3.post.id, 2400)
    const mmU = C3.app.lift.mmPerUnit!
    const M = (a: MeasurePoint, b: MeasurePoint) => r6(measureMm(C3.app.lift, { a, b })!)
    const P = (mp: MeasurePoint) => measurePoint3(C3.app.lift, mp)!
    const truth = {
      // ㉠ 산술 참값 — 2400의 절반
      half_expected_mm: 1200,
      half_measured_mm: M({ s: C3.post.id, t: 0 }, { s: C3.post.id, t: 0.5 }),
      quarter_expected_mm: 600,
      quarter_measured_mm: M({ s: C3.post.id, t: 0.25 }, { s: C3.post.id, t: 0.5 }),
      // ㉡ 가법성
      additive_sum_mm: r6(M({ s: C3.post.id, t: 0 }, { s: C3.post.id, t: 0.5 })
        + M({ s: C3.post.id, t: 0.5 }, { s: C3.post.id, t: 1 })),
      additive_whole_mm: M({ s: C3.post.id, t: 0 }, { s: C3.post.id, t: 1 }),
      // ㉢ 교차 획 — 참값은 이 팔이 직접 계산한다(measure.ts를 안 지난다)
      cross_independent_mm: r6(dist3(P({ s: C3.post.id, t: 1 }), P({ s: C3.post2.id, t: 0 })) * mmU),
      cross_measured_mm: M({ s: C3.post.id, t: 1 }, { s: C3.post2.id, t: 0 }),
      // ⚠ 참고(**증거가 아니다**): 기준 획을 통째로 재면 적은 값이 그대로 나온다 — 항등이다
      ref_identity_mm: M({ s: C3.post.id, t: 0 }, { s: C3.post.id, t: 1 }),
      ref_identity_note: '2400은 **구성상** 나온다(그 획이 축척의 분모다) — 참값 대조가 아니다',
    }
    console.log(`[32-6 참값] ${JSON.stringify(truth)}`)
    expect(truth.half_measured_mm).toBe(truth.half_expected_mm)
    expect(truth.quarter_measured_mm).toBe(truth.quarter_expected_mm)
    expect(truth.additive_sum_mm).toBe(truth.additive_whole_mm)
    expect(truth.cross_measured_mm).toBe(truth.cross_independent_mm)
    expect(truth.cross_measured_mm).not.toBe(truth.additive_whole_mm)   // 다른 양이다

    // 게이트 ③(리뷰어 [3]) — **표시만 한 경우 도면에 아무것도 안 남는다**. 획 수·치수 수·
    // 남긴 재기 수를 재기 전후로 센다(원장에 그 수가 없다는 지적).
    const countOf = (app: typeof C3.app) => ({
      strokes: app.doc.strokes.length,
      dims: app.doc.strokes.filter(x => x.dim !== undefined).length,
      measures: (app.doc.measures ?? []).length,
    })
    const displayOnly = { before: countOf(C3.app), after: null as unknown }
    C3.app.measurePair = { a: { s: C3.post.id, t: 0 }, b: { s: C3.post.id, t: 1 } }   // 표시만
    displayOnly.after = countOf(C3.app)
    console.log(`[32-6 표시만] ${JSON.stringify(displayOnly)}`)
    expect(displayOnly.after).toEqual(displayOnly.before)

    // 26-1 회귀(리뷰어 [3] ③) — **겹에서 잰 것이 아래 종이에 안 나타난다**. 「구성상 그렇다」는
    // 논증이 아니라 **끄기 전후의 값**으로 낸다(그것이 이 회차가 방금 배운 형태다).
    const F = two()
    setDimension(F.app, F.post.id, 2400)
    const lay = addLayer(F.app, 'tracing', { W, H })!
    const onLayer = F.s.draw(500, 500, 300, 450)!
    const lm = { a: { s: onLayer.id, t: 0 }, b: { s: onLayer.id, t: 1 } }
    const layerRow = { layer_on: null as number | null, layer_off: null as number | null, back_on: null as number | null }
    layerRow.layer_on = measureMm(F.app.lift, lm) === null ? null : r6(measureMm(F.app.lift, lm)!)
    setLayerOn(F.app, lay.id, false)
    layerRow.layer_off = measureMm(F.app.lift, lm) === null ? null : r6(measureMm(F.app.lift, lm)!)
    setLayerOn(F.app, lay.id, true)
    layerRow.back_on = measureMm(F.app.lift, lm) === null ? null : r6(measureMm(F.app.lift, lm)!)
    console.log(`[32-6 겹] ${JSON.stringify(layerRow)}`)
    expect(layerRow.layer_on).not.toBeNull()
    expect(layerRow.layer_off).toBeNull()
    expect(layerRow.back_on).toBe(layerRow.layer_on)

    // 축척 미정에서의 표기 — mm를 안 붙인다
    const D = two()
    const unscaled = {
      mm: measureMm(D.app.lift, { a: { s: D.post.id, t: 0 }, b: { s: D.post.id, t: 1 } }),
      shown: formatUnits(measureUnits(D.app.lift, { a: { s: D.post.id, t: 0 }, b: { s: D.post.id, t: 1 } })!),
    }
    console.log(`[32-6 미정] ${JSON.stringify(unscaled)}`)
    expect(unscaled.mm).toBeNull()

    // ── ④ 파생을 안 담는 대가 (저장 크기) ───────────────────────────────
    const E = two()
    setDimension(E.app, E.post.id, 2400)
    const bytes0 = new TextEncoder().encode(serializeBrnl({ doc: E.app.doc, nextId: E.app.nextId })).length
    E.app.doc.measures = [{ id: 9001, a: { s: E.post.id, t: 0 }, b: { s: E.post2.id, t: 1 } }]
    const json1 = serializeBrnl({ doc: E.app.doc, nextId: E.app.nextId })
    const bytes1 = new TextEncoder().encode(json1).length
    // ⚠ **크기는 「숫자를 안 담는다」를 못 가른다**(1차 리뷰어 [3]) — `"mm":2000` 하나가
    // 늘어도 열 바이트다. 근거는 **스키마**다: 담긴 열쇠가 무엇인지 통째로 적는다.
    const cost = {
      bytes_without: bytes0, bytes_with_one: bytes1, per_measure: bytes1 - bytes0,
      schema: JSON.stringify(JSON.parse(serializeBrnl({ doc: E.app.doc, nextId: E.app.nextId })).measures),
      schema_note: '열쇠는 id · a{s,t} · b{s,t} 다섯뿐이다 — **길이·mm 열쇠가 없다**. 크기(61)는 참고값이다.',
    }
    console.log(`[32-6 크기] ${JSON.stringify(cost)}`)
    // 잰 값이 그 문자열 어디에도 없다 — 눈으로 확인하는 자리(지시 문면)
    const mm = measureMm(E.app.lift, E.app.doc.measures[0]!)!
    const measuresBlock = JSON.stringify(JSON.parse(json1).measures)
    expect(measuresBlock).toBe('[{"id":9001,"a":{"s":' + E.post.id + ',"t":0},"b":{"s":' + E.post2.id + ',"t":1}}]')
    expect(measuresBlock).not.toContain(String(Math.round(mm)))
    // (`"mm"`은 파일 어딘가에 있다 — 그것은 **표시 단위**(doc.unit)이지 잰 값이 아니다)

    // **진짜 반증**(2차 리뷰어 [5]) — 「담으면 굳는다」의 반쪽을 **제품 경로로** 낸다:
    // 파일에 `mm` 열쇠를 손으로 넣고 열면 파서가 그 열쇠를 **버린다**(형식에 자리가 없다).
    // 그러므로 누가 숫자를 써 넣어도 그것을 읽는 길이 없다 — 굳을 수가 없다.
    const tampered = JSON.parse(json1)
    tampered.measures[0].mm = 99999
    const reopened = parseBrnl(JSON.stringify(tampered))!
    const ignores = {
      injected_key: 'measures[0].mm = 99999',
      after_parse: JSON.stringify(reopened.doc.measures),
      recomputed_mm: r6(measureMm(liftAll(reopened.doc), reopened.doc.measures![0]!)!),
    }
    console.log(`[32-6 형식] ${JSON.stringify(ignores)}`)
    expect(ignores.after_parse).not.toContain('99999')
    expect(ignores.recomputed_mm).toBeCloseTo(mm, 6)
    ;(cost as Record<string, unknown>).format_ignores_number = ignores

    const out = resolve(HERE, '../../stage0/out/scale32_web2.json')
    const payload = JSON.stringify({
      what: 'web2-32 5·6·7 — 축척의 왕복 · 어긋남의 발화 표 · 재기의 정체 왕복 · 파생을 안 담는 저장 대가.',
      why: '32-5는 «만드는 일이 아니라 드러내는 일»이므로(사람의 정정) 유일한 관측은 «있던 규칙이 실제로 왕복하는가»다. 32-7은 30-6이 뒤집은 AS-C107의 자리이고, 그 뒤집힘의 증거가 아래 두 열(적용 전 ↔ 적용 후)이다.',
      trap: '⚠⚠ **치수를 적용한 «뒤» 길이로 재면 비가 정확히 1이다**(ratio_after_dim 열) — 리프팅이 그 획의 길이를 dim으로 다시 세우기 때문이다(자기참조 유형 3 · PITFALLS #77 ㉡). 29-2가 그 자로 재고 「구성상 0」이라 기능을 걷었다(AS-C107). 「잰 값」은 **적용 전** 길이여야 한다(LiftResult.dimGeom).',
      conditions: {
        scene: '카메라가 닫힌 2점 장면 + **길이가 다른** 수직 기둥 둘(지시 32-7의 픽스처 「서로 다른 길이의 두 선」)',
        first_dim: '기둥 A에 2400 mm — 이것이 축척을 정한다',
        second_dim: '기둥 B에 «맞는 값 × factor» — factor가 1이면 안 갈리고 **배수 오독**(3·10배와 그 역)이면 갈린다',
        command: 'LEDGER=1 npx vitest run test/scale32_measure.test.ts',
      },
      constants_note: '`DIM_SKEW_FOLD`는 **배수**다(`max(적은 값 ÷ 잰 값, 그 역) > 이 값`). 옛 `DIM_SKEW_RATIO`(비 편차 0.02)는 web2-34 7번이 없앴다 — 근거는 `skew34_web2.json`. `MERGE_RATIO`는 재는 점의 «정체»를 찾을 때의 3D 허용(기하 크기 대비) — 새 숫자를 안 지었다(#54).',
      constants: { DIM_SKEW_FOLD: C.DIM_SKEW_FOLD, MERGE_RATIO: C.MERGE_RATIO },
      scale_roundtrip: roundtrip,
      skew_table: skewRows,
      skew_first_dim: firstRow,
      measure_identity: idRows,
      measure_identity_note: 'perp(수선 발)는 이 표에 없다 — 재기 모드에서 **안 난다**(그 후보는 «그리는 중의 시작점»을 요구하고 재기는 탭 둘이다). vp(소실점)도 없다 — 무한원이라 3D 점이 아니다.',
      measure_truth: truth,
      display_only: displayOnly,
      layer_visibility: layerRow,
      measure_derived: derived,
      measure_unscaled: unscaled,
      storage_cost: cost,
      gate: {
        '32-5': '치수 없음 → mmPerUnit null · 첫 치수 → 값과 scaleId · 삭제 → 다시 null · 다음 치수 → 그 획이 기준',
        '32-6': (
          '지시의 여섯을 그대로 적는다(1차 리뷰어 [3] — 초판은 넷만 적었다). '
          + '① 축척 정해짐 → 잰 값이 실제 거리와 일치. **참값은 재기 밖에서 세운다**(2차 리뷰어 [2]): '
          + '산술(반 토막 1200) · 가법성 · 교차 획(`dist3` 직접 계산). '
          + '기준 획을 통째로 재는 것은 **항등이라 증거가 아니다**(`measure_truth.ref_identity_mm`) · '
          + '② 축척 미정 → mm는 null이고 표기에 mm가 없다(`measure_unscaled`) · '
          + '③ 표시만 → 획 수·치수 수·남긴 재기 수 불변(`display_only`) · '
          + '④ 축척이 바뀌면 잰 값이 따라 바뀐다(`measure_derived` — **위약과 짝**) · '
          + '⑤ 잰 값이 파일에 숫자로 저장되지 않는다(`storage_cost.schema` — **크기가 아니라 스키마가 근거다**) · '
          + '⑥ 겹에서 잰 것이 아래 종이에 안 나타난다(`layer_visibility` — 끄기 전후의 값). '
          + '⚠⚠ **정체 왕복 오차에는 임계를 안 건다** — 구성상 0이라 설계 보장이다(아래 selfcheck_notes). '
          + '그 자리가 재는 것은 «어느 갈래에서 정체가 서는가»(`t_found`)이고 반증은 '
          + '「어느 선분에도 안 붙는 점은 null」이다(scale32.test).'
        ),
        '32-7': (
          '첫 치수 비 = 1(**구성상** — 그 획이 분모다) · 자연 대역(1.2·1.5배) 안 발화 · '
          + '경계(정확히 2배 · 정확히 반) 안 발화 · **배수 오독(3배·10배)은 양방향 다 발화** · '
          + 'ratio_after_dim은 모든 칸에서 1(그 자는 아무것도 안 잰다). '
          + '⚠ 문턱 대비 여유는 `over_threshold` 열에 있다(#14 — 착수 표가 약속한 것). '
          + '⚠⚠ **자와 문턱은 web2-34 7번이 바꿨다**: 자는 `fold = max(비, 1/비)`이고 문턱은 '
          + '**배수 2**다. 그러므로 이 표가 묻는 것도 「소음보다 큰가」가 아니라 '
          + '**「배수로 틀렸는가」**다 — 자연 대역(1.2·1.5)은 조용하고 3배·10배가 뜬다.'
        ),
        reachability: (
          '**무엇이 이 기준을 넘을 수 있는가**(#35). '
          + '32-5: 넘는 것은 «축척 후보 집합이 바뀌는 것»이다 — 겹 규칙(web2-21 1-b)이나 '
          + '물러남 규칙이 바뀌면 scaleId가 다른 획을 가리킨다. 팔이 그것을 잡는다. '
          + '32-6: 넘는 것은 «정체가 좌표로 바뀌는 것»이다 — 좌표를 저장하면 축척 두 배에서 '
          + '비가 2가 아니라 1이 되고 그 칸이 빨개진다(실제로 그렇게 실패시킬 수 있다). '
          + '32-7: 넘는 것은 «잰 값을 적용 뒤 길이로 재는 것»이다 — 그러면 ratio_before_dim '
          + '열이 통째로 1이 되어 «배수 오독 발화» 칸 넷이 동시에 죽는다. '
          + '⚠ 세 갈래 다 **같은 실행 안에서** 반대 값을 보인다(D-3) — 반증이 가능하다.'
        ),
        // **수치 + 출처**(#40) — 산문만 두면 항등을 적고도 통과한다. 여기 고른 값은
        // 32-7의 **가장 좁은 발화 칸**(배수 오독 3배)의 fold이고, 0도 1도 아니며
        // 이 원장의 다른 자리(`skew_table`의 factor 3 행)에서 그대로 읽힌다.
        reachability_value: r6(skewRows[factors.indexOf(3)]!.fold),
        // ⚠ 구분자는 **`/`**다(selfcheck의 `_resolve` — 점을 쓰면 키 이름의 점과 안 갈린다)
        reachability_source: `skew_table[${factors.indexOf(3)}]/fold`,
        reachability_note: (
          '**뜨는 가장 좁은 칸**이다(3배 오독) — 문턱 2 대비 여유 1.5배. 그 바로 아래 칸은 '
          + '`factor` 2와 0.5이고 fold가 **정확히 2**라 «닫힌 경계»에 앉아 있다(안 뜬다). '
          + '⚠ 이 값이 1로 내려오면 그 순간 「잰 값」이 치수 적용 «뒤» 길이로 바뀐 것이다(#77 ㉡). '
          + '⚠ 이 픽스처는 여전히 **잡음 폭 0**이다(같은 기하에 «적은 값»만 곱해 넣었다) — '
          + '그것이 web2-32의 결함이었고, **여유는 이 표가 아니라 `skew34_web2.json`이 잰다**: '
          + '끝점 지터·소실점 각 오차를 태운 1229칸의 자연 분포(fold 중앙 1.0344 · p95 1.6772 · '
          + '최대 4.4218)와 문턱의 두 경계(아래 = 오탐 · 위 = 3배를 놓침)가 거기 있다. '
          + '`DEFERRED.md`의 「어긋남 문턱 0.02의 «여유»를 못 쟀다」 행은 그 원장으로 닫혔다.'
        ),
      },
      selfcheck_notes: {
        'skew_table[*].ratio_after_dim = 1.000000': (
          '⚠ **정상이다 — 이것이 이 원장의 관측 대상이다.** 리프팅이 그 획의 길이를 dim으로 '
          + '다시 세우므로 «적용 뒤» 비는 **설계 보장**이지 측정이 아니다(자기참조 유형 3 · '
          + 'CLAUDE.md §5.1). 그래서 **이 열에는 임계를 안 건다** — 옆 열(ratio_before_dim)이 '
          + '재는 값이고 임계는 거기 걸린다. 두 열을 나란히 두는 것이 이 원장의 요점이다.'
        ),
        'skew_table[0].ratio_before_dim = 1 · skew_first_dim.ratio_before_dim = 1': (
          '정상이다. 앞엣것은 «맞는 값을 적었다»(factor 1)이고, 뒤엣것은 **축척을 정한 획**이라 '
          + '구성상 1이다(그 획이 분모였다 — 30-6이 본 그 0). 발화 조건은 **둘째 치수**가 세운다.'
        ),
        'skew_table[factor=2·0.5].fold = 2.000000 인데 fires = false': (
          '**닫힌 경계다** — 자가 `fold > 문턱`이지 `≥`가 아니다. 이 두 칸은 «임계가 실제로 '
          + '자를 하고 있는가»의 분해능 짝이고, 바로 옆 칸(3배)이 뜬다. ⚠ 이 픽스처의 잡음 폭은 '
          + '**0**이므로 이 표는 «여유»를 못 잰다 — 여유는 `skew34_web2.json`이 잰다.'
        ),
        'measure_identity[*].rel_err = 0': (
          '**설계 보장이다** — 정체(획 id + t)를 좌표로 되돌리는 것은 같은 선형보간의 역이므로 '
          + '부동소수 잔차가 없다. 임계를 걸 값이 아니다. 이 열이 재는 것은 «오차»가 아니라 '
          + '**어느 오스냅 갈래에서 정체가 서는가**다(t_found 열이 그것을 낸다: 0 · 0.5 · 0.25 · 1). '
          + '반증: 어느 선분에도 안 붙는 점은 identifyPoint가 null을 낸다(scale32.test).'
        ),
        'display_only.before == after (5·1·0 불변)': (
          '**불변이 곧 결론이다** — 「표시만 한 경우 도면에 아무것도 안 남는다」가 이 항목의 '
          + '게이트이므로 «안 변했다»가 재는 값이다. 분해능의 짝은 `storage_cost`다: 「남긴다」를 '
          + '켜면 같은 몸짓이 measures를 **0 → 1**로 만든다(그 칸이 이 0을 «죽은 계수»가 아니게 한다).'
        ),
        'layer_visibility.back_on == layer_on': (
          '**같아야 옳다** — 겹을 껐다 켜면 같은 두 점이 같은 값을 낸다(26-1 회귀의 왕복). '
          + '가르는 칸은 가운데의 `layer_off: null`이다: 셋이 «값 → null → 같은 값»이라야 '
          + '「끄면 사라지고 켜면 돌아온다」가 서고, 셋 중 하나만 봐서는 아무것도 안 갈린다.'
        ),
        'measure_truth.ref_identity_mm = 2400': (
          '⚠ **항등이다 — 증거가 아니다**(2차 리뷰어 [2]). 그 획은 축척의 분모라 리프팅이 길이를 '
          + 'dim으로 다시 세운다. 참값 대조는 옆의 셋이 진다: **산술**(반 토막 = 1200) · '
          + '**가법성**(0→0.5 + 0.5→1 == 0→1) · **교차 획**(참값을 이 팔이 `dist3`로 직접 계산 — '
          + '`core/measure.ts`를 안 지난다). 이 줄은 그 항등이 원장에 남아 «참값»으로 '
          + '다시 읽히지 않게 하려고 둔다.'
        ),
        'constants/metric_defs 스냅샷 없음': (
          '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓰고 `constants` '
          + '블록을 손으로 적는다(`hold26.test`가 그 유보를 처음 적었다). 그래서 문서는 원장을 '
          + '**이름으로** 가리킨다(@해시 인용 ⛔).'
        ),
      },
      pitfalls: ['#77', '#61', '#54', '#42', '#35', '#14', '#75'],
      pitfalls_note: '#77은 **㉡**(값이 스스로를 정의하면 그 검증은 항등이다)이 걸리는 자리다. #14는 문턱 대비 여유를 적는 조항 — 발화하는 칸의 fold는 문턱(2) 대비 **1.5배(3배 오독 둘) · 5배(10배 오독 둘)**이고, 안 발화하는 칸은 **1배(경계에 정확히 앉은 둘) · 0.6배 이하(자연 대역 셋)**다. #75 ㉣ — 자를 바꿨으므로 이 표가 묻는 것을 다시 적었다(web2-34 7번).',
    }, null, 2)
    // ⚠ **원장은 단독 실행에서만 쓴다**(LEDGER=1 — web2-22에서 세운 규율).
    //   정본 명령: LEDGER=1 npx vitest run test/scale32_measure.test.ts
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, payload)
      console.log(`[원장] ${out}`)
    } else {
      console.log('[32] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
  })
})
