// 34-8 — **잰 값의 두 점을 정체성으로 저장한다**(DEFERRED에서 꺼낸다).
//
// 저장 형태는 **이미 정체였다**(`core/measure.ts`의 `MeasurePoint {s, t}` · `file.ts`의
// `isMeasurePoint`). 그러므로 이 항목이 고칠 코드는 없고 **없던 것은 팔**이다 —
// AS-C120이 「⏳ 논증이고 실측이 아니다」였던 이유가 그것이다:
// web2-32의 팔은 **축척 두 배**만 돌렸고 **거기서는 좌표를 담아도 값이 따라온다**
// (아래 ④가 그 사실을 값으로 든다 — fold 1.000). 실패는 **재리프팅**에서만 드러난다.
//
// D-2(재현 먼저): 고칠 버그가 없으므로 «수리 전에 실패하는 팔»의 자리를 **위약 판**이
//   맡는다 — 같은 실행 안에서 좌표 판은 빨갛고 정체 판은 초록이다(③).
// D-3(반증): 위약이 갈리는 것이 이 팔의 반증 조건이다. **두 축을 따로 잰다**:
//   ㉠ 값(mm의 fold) ㉡ 점(작도 시점 화면 px 드리프트 · 문 = `C.TAP_MAX_PX`).
//   ⚠⚠ **값 축만 재면 위약이 통과하는 칸이 있다** — 12칸 중 둘이 fold **정확히 1.000**이다
//   (축척 기준 획과 «같은 화면평행 세로»만 지나는 재기는 길이 비가 f에 안 반응한다).
//   그 두 칸에서도 점은 1005 px · 54 px 어긋나 있다. 팔이 한 축뿐이면 위약이 초록이다.
// D-5: 구도 넷(중앙·먼 VP·좁은 화각·주점 근접) × 재기 셋(t = 0 · 0.5 · 1을 섞는다).
//
// 수치의 정본은 원장이다: `stage0/out/measure34_web2.json`
//   (LEDGER=1 npx vitest run test/measure34_measure.test.ts)

import { describe, it, expect } from 'vitest'
import { runAll } from './measure34scene'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { session } from './session'
import { setDimension, measureTap } from '../src/app/state'
import { measureMm } from '../src/core/measure'
import { liftAll } from '../src/core/lift'
import { C } from '../src/core/constants'

const RUNS = runAll()
const ROWS = RUNS.flatMap(r => r.rows)

describe('34-8 재기의 정체 — 차수 승격을 살아남는가', () => {
  it('① 승격이 실제로 일어났다 — fSource·f·주점·소실점 수가 값으로 바뀐다', () => {
    expect(RUNS.length).toBe(4)
    for (const r of RUNS) {
      expect(r.fsource_before).toBe('default')      // P1 — f는 임의 게이지
      expect(r.fsource_after).toBe('two-vp')        // P2 — f² = |u₁||u₂|
      expect(r.vps_before).toBe(1)
      expect(r.vps_after).toBe(2)
      expect(Math.abs((r.f_after ?? 0) - (r.f_before ?? 0))).toBeGreaterThan(100)
      expect(r.principal_after_x).toBe(600)         // 2점 주점은 W/2로 돌아온다
      expect(r.principal_before_x).not.toBe(600)    // 1점 주점은 깊이 소실점이었다
      expect(r.rows.length).toBe(3)                 // 잴 것이 있다(#38 — 대상 0 방지)
    }
    // 실측을 박아 둔다 — 조용히 달라지면 이 팔이 먼저 깨진다(promote.test의 규약 그대로)
    expect(RUNS.map(r => Number((r.f_after ?? 0).toFixed(2))))
      .toEqual([387.30, 632.46, 927.68, 134.16])
  })

  it('② 정체가 유지된다 — 승격 뒤에도 «같은 두 점»(획 id·t)을 가리킨다', () => {
    expect(ROWS.length).toBe(12)
    for (const c of ROWS) {
      // 문서에 남은 정체가 글자 그대로 그대로다
      expect(c.id_after).toEqual(c.id_before)
      // 그리고 그 정체가 **새 기하에서 다시 풀린다** — 승격 후 3D 점을 되짚으면
      // 같은 획·같은 t다(잰 값이 같은 것은 이것의 결과이지 이것 자체가 아니다).
      expect(c.id_reidentified.a?.s).toBe(c.id_before.a.s)
      expect(c.id_reidentified.b?.s).toBe(c.id_before.b.s)
      expect(c.id_reidentified.a!.t).toBeCloseTo(c.id_before.a.t, 9)
      expect(c.id_reidentified.b!.t).toBeCloseTo(c.id_before.b.t, 9)
    }
    // t가 끝점에만 몰려 있지 않다(D-5) — 중점·안쪽 점이 섞여 있다
    const ts = ROWS.flatMap(c => [c.id_before.a.t, c.id_before.b.t])
    expect(ts.filter(t => t > 1e-9 && t < 1 - 1e-9).length).toBeGreaterThanOrEqual(6)
  })

  it('③ 위약이 갈린다 — 좌표를 담은 판은 승격 뒤 다른 점을 가리킨다 (반증 · D-3)', () => {
    // ㉠ **점 축** — 12칸 전부. 위약의 점은 «같은 점» 문(TAP_MAX_PX)을 훨씬 넘어 어긋난다.
    const drifts = ROWS.flatMap(c => [c.drift_px_a, c.drift_px_b])
    expect(drifts.length).toBe(24)
    for (const d of drifts) expect(d).toBeGreaterThan(C.TAP_MAX_PX)
    expect(Math.min(...drifts)).toBeCloseTo(34.84, 1)      // 가장 안 갈린 점도 34.8 px
    expect(Math.max(...drifts)).toBeCloseTo(1005.47, 1)

    // ㉡ **값 축** — 12칸 중 **열**이 갈린다. 나머지 둘은 fold 정확히 1.000이다.
    const folds = ROWS.map(c => c.split_fold_mm)
    const split = folds.filter(f => f > 1 + 1e-9)
    expect(split.length).toBe(10)
    expect(Math.max(...folds)).toBeCloseTo(4.9483, 3)      // 위약이 4.9배 틀린 칸
    expect(Math.min(...split)).toBeCloseTo(1.2516, 3)
    // 갈린 칸의 mm 차 — 「얼마나」를 값으로(#14: 문턱 대비가 아니라 크기 자체를 적는다)
    const deltas = ROWS.map(c => Math.abs(c.split_delta_mm)).filter(d => d > 1e-6)
    expect(deltas.length).toBe(10)
    expect(Math.max(...deltas)).toBeCloseTo(12127.07, 1)   // 3877 mm를 16004 mm로 읽는다
    expect(Math.min(...deltas)).toBeCloseTo(385.46, 1)

    // ㉢ **정체 판이 맞고 위약이 틀린 것이다**(둘이 «다르다»가 아니라) — 참값을 재기
    // 밖에서 세운다(#83 ㉠의 계열): t가 끝점인 칸에서 `lift.lifted`를 직접 집어 낸 mm이
    // 정체 판과 같고 위약과 갈린다.
    const withOracle = ROWS.filter(c => c.oracle_mm_after !== null)
    expect(withOracle.length).toBe(7)
    for (const c of withOracle) expect(c.oracle_mm_after!).toBeCloseTo(c.identity_mm_after, 9)
    expect(withOracle.filter(c => Math.abs(c.oracle_mm_after! - c.placebo_mm_after) > 1e-6).length).toBe(5)

    // ㉣ ⚠⚠ **값 축만 재는 팔은 위약을 통과시킨다** — 그 두 칸을 여기 이름으로 든다.
    // 축척 기준 획과 같은 화면평행 세로만 지나는 재기는 길이 «비»가 f에 안 반응한다.
    const blind = ROWS.filter(c => c.split_fold_mm <= 1 + 1e-9)
    expect(blind.map(c => c.comp)).toEqual(['C_좁은화각', 'D_주점근접'])
    for (const c of blind) {
      expect(c.identity_mm_after).toBeCloseTo(c.placebo_mm_after, 6)   // 값으로는 못 가른다
      expect(Math.max(c.drift_px_a, c.drift_px_b)).toBeGreaterThan(50) // 점으로는 갈린다
    }
  })

  it('④ 대조군 — **축척 두 배**에서는 위약도 따라온다(web2-32의 팔이 못 잰 자리)', () => {
    const ctrl = RUNS.flatMap(r => r.scale_control)
    expect(ctrl.length).toBe(12)
    for (const c of ctrl) {
      expect(c.identity_mm).toBeCloseTo(2, 9)     // 정체 판: 정확히 두 배
      expect(c.placebo_mm).toBeCloseTo(2, 9)      // 위약 판: **똑같이** 두 배
      expect(c.fold).toBeCloseTo(1, 9)            // 안 갈린다 — 그래서 그 팔은 아무것도 안 쟀다
    }
  })

  it('⑤ 직렬화 — 담긴 열쇠가 id·a{s,t}·b{s,t}뿐이고, 왕복해도 정체가 그대로다', () => {
    for (const r of RUNS) {
      expect(r.serialized.keys.sort()).toEqual(['a', 'b', 'id'])
      expect(r.serialized.point_keys.sort()).toEqual(['s', 't'])
      // 좌표(x·y·z)도 잰 값(mm·units·len)도 열쇠로 없다
      expect(r.serialized.measures_json).not.toMatch(/"(x|y|z|mm|units|len|length|value)"/)
    }

    // 왕복 — 저장했다 다시 열어도 같은 두 점을 가리키고 같은 값을 낸다.
    // 승격 «후» 상태에서 저장한다(재리프팅된 문서가 담기는 자리다).
    const s = session(1200, 800)
    s.draw(500, 500, 600, 475)
    const post = s.draw(500, 500, 500, 300)!
    s.draw(500, 300, 660, 340)
    s.draw(660, 340, 660, 440)
    setDimension(s.app, post.id, 2400)
    s.app.measureKeep = true
    measureTap(s.app, { x: 500, y: 300 })
    measureTap(s.app, { x: 660, y: 440 })
    s.draw(500, 500, 400, 475)                       // 승격
    expect(s.app.lift.an.fSource).toBe('two-vp')
    const m0 = s.app.doc.measures![0]!
    const mm0 = measureMm(s.app.lift, m0)!
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId })
    const back = parseBrnl(json)!
    expect(back.doc.measures).toEqual(s.app.doc.measures)
    expect(measureMm(liftAll(back.doc), back.doc.measures![0]!)!).toBeCloseTo(mm0, 9)

    // 반증(D-3) — 좌표·잰 값을 **일부러 심어도** 형식이 안 받는다(저장 경로가 정체만 안다)
    const tampered = JSON.parse(json)
    tampered.measures[0].mm = 99999
    tampered.measures[0].a.x = 1.5
    const reopened = parseBrnl(JSON.stringify(tampered))!
    expect(JSON.stringify(reopened.doc.measures)).not.toContain('99999')
    expect(JSON.stringify(reopened.doc.measures)).not.toContain('"x"')
    expect(measureMm(liftAll(reopened.doc), reopened.doc.measures![0]!)!).toBeCloseTo(mm0, 9)
  })
})
