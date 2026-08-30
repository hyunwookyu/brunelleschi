// 원장 — web2-34 8번(잰 값의 두 점을 **정체**로 저장한다).
//
// 이 원장이 재는 것 넷:
//  ① **승격의 카메라 서명** — fSource·f·주점·소실점 수가 구도마다 어떻게 바뀌는가.
//  ② **정체가 유지되는가** — 승격 뒤 문서의 획 id·t가 그대로이고 **다시 풀리는가**.
//  ③ ⚠⚠ **위약이 갈리는 크기** — 승격 «전» 3D 좌표를 담아 둔 판이 승격 뒤에 내는 값과
//     정체 판의 값이 얼마나 갈리는가(mm의 fold·차, 그리고 그 점이 화면에서 몇 px 어긋났나).
//  ④ **대조군(축척 두 배)** — web2-32의 팔이 돌린 그 자리. 거기서는 **위약도 따라온다**.
//     그것이 `DEFERRED.md`의 「좌표를 저장한 위약을 «재리프팅»으로 못 쟀다」이고
//     이 원장이 그 행을 닫는다.
//
// 실행: LEDGER=1 npx vitest run test/measure34_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAll, COMPS } from './measure34scene'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (v: number) => Number(v.toFixed(6))
const med = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2
}

describe('원장 — web2-34 8번', () => {
  it('승격의 서명 · 정체의 유지 · 위약이 갈린 크기 · 대조군', () => {
    const runs = runAll()
    const rows = runs.flatMap(r => r.rows)
    expect(rows.length).toBe(12)

    const folds = rows.map(r => r.split_fold_mm)
    const drifts = rows.flatMap(r => [r.drift_px_a, r.drift_px_b])
    const deltas = rows.map(r => Math.abs(r.split_delta_mm))
    const splitFoldMax = r6(Math.max(...folds))

    const totals = {
      cells: rows.length,
      split_cells: folds.filter(f => f > 1 + 1e-9).length,
      blind_cells: folds.filter(f => f <= 1 + 1e-9).length,
      split_fold_median: r6(med(folds)),
      /** ⚠ **갈린 칸 안에서의** 최소다 — 안 갈린 두 칸은 아래 `fold_min_all`(정확히 1)이다 */
      split_fold_min: r6(Math.min(...folds.filter(f => f > 1 + 1e-9))),
      fold_min_all: r6(Math.min(...folds)),
      split_fold_max: splitFoldMax,
      split_delta_mm_max: r6(Math.max(...deltas)),
      split_delta_mm_min_nonzero: r6(Math.min(...deltas.filter(d => d > 1e-6))),
      drift_px_min: r6(Math.min(...drifts)),
      drift_px_median: r6(med(drifts)),
      drift_px_max: r6(Math.max(...drifts)),
      identity_kept: rows.filter(r => JSON.stringify(r.id_after) === JSON.stringify(r.id_before)).length,
      identity_reresolved: rows.filter(r =>
        r.id_reidentified.a?.s === r.id_before.a.s && r.id_reidentified.b?.s === r.id_before.b.s
        && Math.abs((r.id_reidentified.a?.t ?? -9) - r.id_before.a.t) < 1e-9
        && Math.abs((r.id_reidentified.b?.t ?? -9) - r.id_before.b.t) < 1e-9).length,
    }

    const payload = JSON.stringify({
      what: '차수 승격(재리프팅) 뒤에 «정체로 저장한 재기»와 «좌표를 담은 위약»이 어떻게 갈리는가 — mm의 fold·차와 작도 시점 화면 px 드리프트.',
      why: (
        'AS-C120(「잰 값은 저장하지 않는다 — 저장하는 것은 어느 두 점을 재는가다」)이 '
        + '**⏳ 논증**이었던 이유는 web2-32의 팔이 «축척 두 배»만 돌렸기 때문이다 — '
        + '거기서는 좌표를 담아도 값이 따라온다(아래 `scale_control`이 그것을 값으로 든다). '
        + '실패는 **재리프팅**에서만 드러나므로 이 원장은 승격을 실제로 일으키고 잰다.'
      ),
      storage_form: {
        verdict: '**이미 정체였다 — 고칠 코드가 없다**(D-4: 지시 문면 「좌표로 저장돼 있으면 고쳐라」의 전제를 확인한 결과).',
        where: 'core/measure.ts `MeasurePoint { s: 획 id, t: 0..1 }` · types.ts `Doc.measures` · file.ts `isMeasurePoint`(t ∈ [0,1] 검사)',
        evidence: '직렬화가 담는 열쇠는 id·a{s,t}·b{s,t}뿐이다 — 아래 `serialization`.',
      },
      promotion: (
        '⚠ 지시 문면은 «P2 → P3»인데 **web2에 실재하는 승격은 P1→P2 하나다** '
        + "(`camera.ts`의 `fSource: 'none' | 'default' | 'two-vp'` — 3점 경로가 없다). "
        + 'web2-13 2부(`promote_freeze_web2.json`)가 같은 갈림을 이미 적었고 여기서도 D-4대로 '
        + '**실재하는 승격**을 잰다: f가 임의 게이지(DEFAULT_F_RATIO)에서 f²=|u₁||u₂|로 확정되고 '
        + '주점이 깊이 소실점에서 W/2로 옮겨간다 — 그 순간 **전부 다시 올라간다**(CLAUDE.md §1).'
      ),
      conditions: {
        comps: COMPS.map(c => ({ name: c.name, W: c.W, H: c.H, strokes: c.setup.length, dim_mm: c.dim.mm, promote: c.promote })),
        measures_per_comp: 3,
        t_coverage: 't = 0 · 0.5(중점) · 안쪽 값 · 1 — 끝점에만 몰리지 않는다(D-5)',
        placebo: '승격 «전»의 3D 좌표 둘을 그대로 담아 두고 승격 «후»에 그 좌표로 길이를 낸다. mm 환산은 지금 축척으로 한다(축척은 좌표 저장 구현에서도 파생이다).',
        command: 'LEDGER=1 npx vitest run test/measure34_measure.test.ts',
        arm: 'npx vitest run test/measure34.test.ts',
      },
      constants_note: (
        '**새 임계를 안 지었다**(#54). 점 축의 문은 이미 있는 `TAP_MAX_PX`(「같은 점」 문)이고 '
        + '정체를 되짚는 허용은 `MERGE_RATIO`(재기가 쓰던 그 값)다. 값 축에는 문턱을 안 걸고 '
        + '**분포를 적는다** — 이 항목이 묻는 것은 「얼마를 넘는가」가 아니라 「위약이 갈리는가」다.'
      ),
      constants: { TAP_MAX_PX: C.TAP_MAX_PX, MERGE_RATIO: C.MERGE_RATIO },
      camera_signature: runs.map(r => ({
        comp: r.comp,
        fsource: `${r.fsource_before} → ${r.fsource_after}`,
        f_before: r6(r.f_before ?? 0), f_after: r6(r.f_after ?? 0),
        principal_x: `${r.principal_before_x} → ${r.principal_after_x}`,
        vps: `${r.vps_before} → ${r.vps_after}`,
        mm_per_unit_before: r.mm_per_unit_before === null ? null : r6(r.mm_per_unit_before),
        mm_per_unit_after: r.mm_per_unit_after === null ? null : r6(r.mm_per_unit_after),
      })),
      cells: rows.map(r => ({
        comp: r.comp, measure: r.measure,
        identity: { a: r.id_before.a, b: r.id_before.b },
        identity_after: { a: r.id_after.a, b: r.id_after.b },
        identity_reidentified: r.id_reidentified,
        identity_mm_before: r6(r.identity_mm_before),
        identity_mm_after: r6(r.identity_mm_after),
        oracle_mm_after: r.oracle_mm_after === null ? null : r6(r.oracle_mm_after),
        placebo_mm_after: r6(r.placebo_mm_after),
        split_fold_mm: r6(r.split_fold_mm),
        split_delta_mm: r6(r.split_delta_mm),
        drift_px_a: r6(r.drift_px_a), drift_px_b: r6(r.drift_px_b),
        drift3_rel_a: r6(r.drift3_rel_a), drift3_rel_b: r6(r.drift3_rel_b),
      })),
      totals,
      scale_control: {
        what: '**축척 두 배**(web2-32의 팔) — 정체 판도 위약 판도 값이 정확히 두 배가 된다.',
        rows: runs.map(r => ({ comp: r.comp, cells: r.scale_control.map(c => ({ identity_x: r6(c.identity_mm), placebo_x: r6(c.placebo_mm), fold: r6(c.fold) })) })),
        verdict: '12칸 전부 fold 1.000000 — **이 축으로는 위약과 정체가 안 갈린다**. DEFERRED가 적은 그대로다.',
      },
      serialization: runs.map(r => ({ comp: r.comp, keys: r.serialized.keys, point_keys: r.serialized.point_keys, json: r.serialized.measures_json })),
      gate: {
        '①승격': '네 구도 전부 fSource default → two-vp · 소실점 1 → 2 · 주점이 깊이 VP에서 600(W/2)으로 · f가 100 넘게 움직인다(`camera_signature`).',
        '②정체': `승격 뒤 문서의 획 id·t가 12/12 그대로이고(identity_kept ${totals.identity_kept}), 승격 후 3D 점을 되짚으면 같은 획·같은 t다(identity_reresolved ${totals.identity_reresolved}). 잰 값이 같은 것은 이것의 «결과»이지 이것 자체가 아니다.`,
        '③위약': (
          `**두 축을 따로 잰다.** 점 축: 24개 끝점 전부가 「같은 점」 문(${C.TAP_MAX_PX} px)을 넘어 어긋난다`
          + `(최소 ${totals.drift_px_min} · 중앙 ${totals.drift_px_median} · 최대 ${totals.drift_px_max} px). `
          + `값 축: 12칸 중 **${totals.split_cells}칸**이 갈린다(fold ${totals.split_fold_min}~${totals.split_fold_max} · `
          + `mm 차 ${totals.split_delta_mm_min_nonzero}~${totals.split_delta_mm_max}). `
          + `⚠⚠ 나머지 **${totals.blind_cells}칸은 fold 정확히 1.000000**이다 — 값 축만 재는 팔은 거기서 위약을 통과시킨다.`
        ),
        '④대조군': '축척 두 배에서는 12/12가 fold 1.000000 — 위약도 따라온다.',
        '⑤직렬화': '담긴 열쇠는 id·a{s,t}·b{s,t}뿐이고 좌표(x·y·z)도 잰 값(mm)도 없다. 심어도 형식이 안 받는다(팔 ⑤).',
        reachability: (
          '**무엇이 이 기준을 넘을 수 있는가**(#35). 넘는 것은 «정체가 좌표로 바뀌는 것»이다 — '
          + '재기가 좌표를 담으면 그 판의 값이 아래 `reachability_value`만큼 갈린 채 굳는다. '
          + '⚠ 그리고 **반대 방향도 이 원장 안에 있다**: 같은 위약이 `scale_control`에서는 '
          + 'fold 1.000000으로 통과한다(축척 두 배). 즉 이 원장은 «위약이 빨개지는 조건»과 '
          + '«같은 위약이 초록인 조건»을 **한 실행 안에서** 나란히 낸다(D-3). '
          + '⚠⚠ 셋째 방향도 있다 — 승격 축에서도 **값만 보면 통과하는 칸이 둘**이다'
          + '(`totals.blind_cells`): 축척 기준 획과 같은 화면평행 세로만 지나는 재기는 길이 «비»가 '
          + 'f에 안 반응한다. 그 칸에서 위약을 잡는 것은 점 축(드리프트 px)뿐이다.'
        ),
        reachability_value: splitFoldMax,
        /** ⚠⚠ **이 수의 크기는 픽스처 상수가 정한다**(#46 ⚙️ · 리뷰어 [6]). 4.95는
         *  f가 1044 → 134로 움직인 폭이 낸 값이고, 승격 폭이 작은 구도만 돌리면
         *  1에 가까워진다(그러면 그 픽스처가 아무것도 안 재는 것이다). 부호는 기제가
         *  정하고 **크기는 픽스처가 정한다** — 그래서 이 표시를 단다. */
        reachability_value_fixture_determined: true,
        // ⚠ 구분자는 `/`다(selfcheck의 `_resolve`)
        reachability_source: 'totals/split_fold_max',
        reachability_note: (
          `**위약이 가장 크게 틀린 칸**이다(D_주점근접 · 좁은 f로 확정되는 구도). 정체 판 `
          + `2136 mm를 위약은 10570 mm로 읽는다 — 배수 오독 문턱(DIM_SKEW_FOLD ${C.DIM_SKEW_FOLD})의 `
          + `2.5배다. 이 값이 1.000000으로 내려오면 그것은 «승격이 기하를 안 움직였다»는 뜻이고 `
          + `그때는 이 픽스처가 아무것도 안 재는 것이다(임계를 무르지 말고 픽스처를 바꾼다).`
        ),
      },
      selfcheck_notes: {
        'scale_control 12칸 전부 identity_x=2 · placebo_x=2 · fold=1 (분포 전체가 한 값)': (
          '**정상이고 그 불변이 곧 결론이다** — 이 블록은 «web2-32의 팔이 아무것도 못 쟀다»를 '
          + '값으로 드는 대조군이다. 갈리는 칸은 옆 블록(`cells`)에 있다.'
        ),
        'cells 두 칸의 split_fold_mm = 1.000000 · split_delta_mm = 0': (
          '**정상이며 이 원장의 관측 하나다**(C_좁은화각 m7 · D_주점근접 m7). 축척 기준 획과 '
          + '같은 화면평행 세로만 지나는 재기는 길이 «비»가 f에 안 반응하므로 mm가 승격에 불변이다. '
          + '⚠ 그 칸에서도 **점은 갈린다**(drift_px 54~1005) — 그래서 팔이 두 축을 따로 잰다. '
          + 'PITFALLS #86이 이 자리다.'
        ),
        'cells의 identity_after == identity(글자 그대로 같다)': (
          '**불변이 곧 게이트다** — 「승격 뒤에도 같은 두 점을 가리키는가」가 물음이다. '
          + '분해능의 짝은 `placebo_mm_after`다: 같은 승격에서 좌표 판은 갈린다.'
        ),
        'identity_reidentified의 t가 identity의 t와 잔차 없이 같다': (
          '**설계 보장에 가깝다** — 정체를 좌표로 폈다가(`measurePoint3`) 다시 접는 것은'
          + '(`identifyPoint`) 같은 선형보간의 역이다(자기참조 유형 3 · CLAUDE.md §5.1). '
          + '⚠ 그래도 **항등은 아니다**: 접을 때 «가장 가까운 선분»을 다시 고르므로 승격으로 '
          + '기하가 섞이면 **다른 획**이 답이 될 수 있다. 이 열이 재는 것은 그 재선택이 '
          + '안 일어났다는 것이고, 임계는 안 건다.'
        ),
        'oracle_mm_after == identity_mm_after (잔차 0)': (
          '**정상이다** — 오라클은 `lift.lifted`의 끝점을 직접 집어 `lenMm`으로 낸 값이라 '
          + '재기(`core/measure.ts`)를 안 지나지만, t가 0·1이면 같은 3D 점을 집는다. '
          + '이 열이 재는 것은 «정체 판이 맞고 위약이 틀렸다»의 방향이지 오차가 아니다 '
          + '(둘이 «다르다»만으로는 어느 쪽이 맞는지 안 선다 — #83 ㉠의 계열). '
          + '안쪽 t 칸에서는 null이다(보간이 필요해 이 오라클이 안 선다).'
        ),
        'constants/metric_defs 스냅샷 없음': (
          '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓰고 `constants` '
          + '블록을 손으로 적는다(`hold26.test`가 그 유보를 처음 적었다). 문서는 원장을 '
          + '**이름으로** 가리킨다(@해시 인용 ⛔).'
        ),
      },
      pitfalls: ['#86', '#83', '#69', '#54', '#42', '#40', '#35', '#14'],
      pitfalls_note: (
        '#83 ㉠(위약 팔이 없으면 그 수는 «구조의 이득»이지 «기제의 이득»이 아니다)이 이 항목의 '
        + '뼈대다 — 그래서 좌표 판을 나란히 돌린다. #69 ㉣·#83 ㉠의 형태로 «정체 판만 재는 팔»은 '
        + '아무것도 안 잰다. #86은 이 회차가 새로 등록한다(값 축만 재면 위약이 통과하는 칸이 있다). '
        + '#54 — 새 임계를 안 지었다(TAP_MAX_PX·MERGE_RATIO 재사용). '
        + '#14 — 갈림의 크기를 비와 차 둘로 적는다(fold와 mm).'
      ),
    }, null, 2)

    const out = resolve(HERE, '../../stage0/out/measure34_web2.json')
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, payload)
      console.log(`[원장] ${out}`)
    } else {
      console.log('[34-8] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
    console.log(`[34-8] 위약 갈림 fold ${totals.split_fold_min}~${totals.split_fold_max}(${totals.split_cells}/12칸) · 드리프트 ${totals.drift_px_min}~${totals.drift_px_max} px · 대조군(축척 두 배) fold 1.000000`)

    // 원장이 스스로 서는 값(팔은 measure34.test.ts가 진다)
    expect(totals.identity_kept).toBe(12)
    expect(totals.identity_reresolved).toBe(12)
    expect(totals.split_cells).toBe(10)
    expect(totals.drift_px_min).toBeGreaterThan(C.TAP_MAX_PX)
  })
})
