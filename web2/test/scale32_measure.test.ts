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
import { setDimension } from '../src/app/state'
import { lenMm, dimSkew, skewOff, formatScale, formatRatio } from '../src/core/dim'
import { measureMm, measureUnits, identifyPoint, measurePoint3, type MeasurePoint } from '../src/core/measure'
import { liftAll } from '../src/core/lift'
import { serializeBrnl } from '../src/core/file'
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
    for (const r of roundtrip) console.log(`[32-5 왕복] ${JSON.stringify(r)}`)
    expect(roundtrip[0]!.mmPerUnit).toBeNull()
    expect(roundtrip[2]!.mmPerUnit).toBeNull()          // 되돌아왔다
    expect(roundtrip[3]!.scaleId).toBe(A.post2.id)      // 다음 치수가 정했다

    // ── ② 어긋남의 발화 표 ──────────────────────────────────────────────
    const B = two()
    setDimension(B.app, B.post.id, 2400)
    const g0 = B.app.lift.lifted.get(B.post2.id)!
    const trueMm = lenMm(g0.a3, g0.b3, B.app.lift.mmPerUnit)!
    const factors = [1, 1 + C.DIM_SKEW_RATIO / 2, 1 + C.DIM_SKEW_RATIO * 2, 1.5, 0.5]
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
    expect(skewRows.filter(r => r.fires).length).toBe(3)   // 문턱 두 배 · 1.5배 · 0.5배

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
    const kinds: [string, number][] = [['end(a)', 0], ['mid', 0.5], ['near/int(t=0.25)', 0.25], ['end(b)', 1]]
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
    const derived = { scale_x2_value_ratio: r6(v2 / v1) }
    console.log(`[32-6 파생] ${JSON.stringify(derived)}`)
    expect(derived.scale_x2_value_ratio).toBe(2)

    // 축척 미정에서의 표기 — 숫자가 아니라 비다
    const D = two()
    const unscaled = {
      mm: measureMm(D.app.lift, { a: { s: D.post.id, t: 0 }, b: { s: D.post.id, t: 1 } }),
      shown: formatRatio(measureUnits(D.app.lift, { a: { s: D.post.id, t: 0 }, b: { s: D.post.id, t: 1 } })!),
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
    const cost = { bytes_without: bytes0, bytes_with_one: bytes1, per_measure: bytes1 - bytes0 }
    console.log(`[32-6 크기] ${JSON.stringify(cost)}`)
    // 잰 값이 그 문자열 어디에도 없다 — 눈으로 확인하는 자리(지시 문면)
    const mm = measureMm(E.app.lift, E.app.doc.measures[0]!)!
    const measuresBlock = JSON.stringify(JSON.parse(json1).measures)
    expect(measuresBlock).toBe('[{"id":9001,"a":{"s":' + E.post.id + ',"t":0},"b":{"s":' + E.post2.id + ',"t":1}}]')
    expect(measuresBlock).not.toContain(String(Math.round(mm)))
    // (`"mm"`은 파일 어딘가에 있다 — 그것은 **표시 단위**(doc.unit)이지 잰 값이 아니다)

    const out = resolve(HERE, '../../stage0/out/scale32_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 5·6·7 — 축척의 왕복 · 어긋남의 발화 표 · 재기의 정체 왕복 · 파생을 안 담는 저장 대가.',
      why: '32-5는 «만드는 일이 아니라 드러내는 일»이므로(사람의 정정) 유일한 관측은 «있던 규칙이 실제로 왕복하는가»다. 32-7은 30-6이 뒤집은 AS-C107의 자리이고, 그 뒤집힘의 증거가 아래 두 열(적용 전 ↔ 적용 후)이다.',
      trap: '⚠⚠ **치수를 적용한 «뒤» 길이로 재면 비가 정확히 1이다**(ratio_after_dim 열) — 리프팅이 그 획의 길이를 dim으로 다시 세우기 때문이다(자기참조 유형 3 · PITFALLS #77 ㉡). 29-2가 그 자로 재고 「구성상 0」이라 기능을 걷었다(AS-C107). 「잰 값」은 **적용 전** 길이여야 한다(LiftResult.dimGeom).',
      conditions: {
        scene: '카메라가 닫힌 2점 장면 + **길이가 다른** 수직 기둥 둘(지시 32-7의 픽스처 「서로 다른 길이의 두 선」)',
        first_dim: '기둥 A에 2400 mm — 이것이 축척을 정한다',
        second_dim: '기둥 B에 «맞는 값 × factor» — factor가 1이면 안 갈리고 문턱 밖이면 갈린다',
        command: 'npx vitest run test/scale32_measure.test.ts',
      },
      constants_note: '`DIM_SKEW_RATIO`는 **비**다(|적은 값 ÷ 잰 값 − 1|). `MERGE_RATIO`는 재는 점의 «정체»를 찾을 때의 3D 허용(기하 크기 대비) — 새 숫자를 안 지었다(#54).',
      constants: { DIM_SKEW_RATIO: C.DIM_SKEW_RATIO, MERGE_RATIO: C.MERGE_RATIO },
      scale_roundtrip: roundtrip,
      skew_table: skewRows,
      skew_first_dim: firstRow,
      measure_identity: idRows,
      measure_derived: derived,
      measure_unscaled: unscaled,
      storage_cost: cost,
      gate: {
        '32-5': '치수 없음 → mmPerUnit null · 첫 치수 → 값과 scaleId · 삭제 → 다시 null · 다음 치수 → 그 획이 기준',
        '32-6': '정체 왕복 상대오차 < 1e-9 · 축척 두 배 → 잰 값 두 배 · 미정이면 mm null(비만) · 저장에 숫자 없음',
        '32-7': '첫 치수 비 = 1(구성상) · 문턱 절반 안 발화 · 문턱 두 배 발화 · ratio_after_dim은 모든 칸에서 1(그 자는 아무것도 안 잰다)',
        reachability: (
          '**무엇이 이 기준을 넘을 수 있는가**(#35). '
          + '32-5: 넘는 것은 «축척 후보 집합이 바뀌는 것»이다 — 겹 규칙(web2-21 1-b)이나 '
          + '물러남 규칙이 바뀌면 scaleId가 다른 획을 가리킨다. 팔이 그것을 잡는다. '
          + '32-6: 넘는 것은 «정체가 좌표로 바뀌는 것»이다 — 좌표를 저장하면 축척 두 배에서 '
          + '비가 2가 아니라 1이 되고 그 칸이 빨개진다(실제로 그렇게 실패시킬 수 있다). '
          + '32-7: 넘는 것은 «잰 값을 적용 뒤 길이로 재는 것»이다 — 그러면 ratio_before_dim '
          + '열이 통째로 1이 되어 «문턱 두 배 발화» 칸 셋이 동시에 죽는다. '
          + '⚠ 세 갈래 다 **같은 실행 안에서** 반대 값을 보인다(D-3) — 반증이 가능하다.'
        ),
        // **수치 + 출처**(#40) — 산문만 두면 항등을 적고도 통과한다. 여기 고른 값은
        // 32-7의 **가장 좁은 발화 칸**(문턱 0.02의 두 배 = factor 1.04)의 비다.
        // 0도 1도 아니고, 이 원장의 다른 자리(`skew_table[2]`)에서 그대로 읽힌다.
        // ⚠ 이 값이 1로 내려오면 그 순간 「잰 값」이 적용 뒤 길이로 바뀐 것이다(#77 ㉡).
        reachability_value: r6(skewRows[2]!.ratio_before_dim),
        reachability_source: 'skew_table[2].ratio_before_dim',
        reachability_note: (
          '발화하는 가장 좁은 칸이다 — 문턱 0.02 대비 여유 **2배**(어긋남 0.04). '
          + '나머지 발화 칸 둘은 25배(0.5)라 경계에서 멀고, 안 발화하는 칸은 0.5배(0.01)와 '
          + '0(구성상)이다. 경계에 걸친 칸이 없다(#14 — 변동폭이 결론의 여유보다 크면 결론이 없다). '
          + '⚠ 이 픽스처는 **결정론**이다(시드 없음 · Math.random ⛔) — 변동폭이 0이다.'
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
        'measure_identity[*].rel_err = 0': (
          '**설계 보장이다** — 정체(획 id + t)를 좌표로 되돌리는 것은 같은 선형보간의 역이므로 '
          + '부동소수 잔차가 없다. 임계를 걸 값이 아니다. 이 열이 재는 것은 «오차»가 아니라 '
          + '**어느 오스냅 갈래에서 정체가 서는가**다(t_found 열이 그것을 낸다: 0 · 0.5 · 0.25 · 1). '
          + '반증: 어느 선분에도 안 붙는 점은 identifyPoint가 null을 낸다(scale32.test).'
        ),
        'constants/metric_defs 스냅샷 없음': (
          '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓰고 `constants` '
          + '블록을 손으로 적는다(`hold26.test`가 그 유보를 처음 적었다). 그래서 문서는 원장을 '
          + '**이름으로** 가리킨다(@해시 인용 ⛔).'
        ),
      },
      pitfalls: ['#77', '#61', '#54', '#42', '#35', '#14'],
      pitfalls_note: '#77은 **㉡**(값이 스스로를 정의하면 그 검증은 항등이다)이 걸리는 자리다. #14는 문턱 대비 여유를 적는 조항 — 발화하는 칸의 어긋남은 문턱의 **2배(0.04) · 25배(0.5) · 25배(0.5)**이고 안 발화하는 칸은 **0.5배(0.01) · 0배**다. 경계에 걸친 칸이 없다.',
    }, null, 2))
    console.log(`[원장] ${out}`)
  })
})
