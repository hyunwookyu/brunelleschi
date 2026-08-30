// 34-8 픽스처 — **차수 승격(P1→P2)을 실제로 일으키는 구도 넷** + 그 위에 얹은 재기.
//
// ⚠ 지시 문면은 «P2 → P3»인데 **web2에 실재하는 승격은 P1→P2 하나다**
// (`camera.ts`의 `fSource: 'none' | 'default' | 'two-vp'` — 3점 경로가 없다).
// web2-13 2부(`promote_freeze.test.ts` 머리말)가 같은 갈림을 이미 적었고 여기서도
// D-4대로 **실재하는 승격을 잰다**. 기전(승격 = 카메라 재확정 → 전부 재리프팅)은 같다.
//
// 구도는 `promote_freeze.test.ts`의 넷에서 왔다(중앙·먼 VP·좁은 화각·주점 근접).
// 그 파일을 안 건드리고 여기 다시 적은 이유: 이 팔은 **치수 획**이 있어야 mm가 서고
// (재기의 값이 mm다) 재기 탭이 붙을 점이 더 필요해서 구도의 획 구성이 다르다.
//
// 각 칸이 내는 것:
//   ① 정체 판 — `Doc.measures`(획 id + t). 승격 뒤 **다시 푼다**.
//   ② 위약 판 — 승격 «전»의 3D 좌표를 그대로 담아 두고 그것으로 길이를 낸다.
//      (좌표를 저장하는 구현이 하는 일 그대로다. mm 환산은 지금 축척으로 한다 —
//       축척은 어차피 파생이라 좌표 저장 구현도 그 자리는 매번 계산한다.)

import { session } from './session'
import { setDimension, measureTap } from '../src/app/state'
import { measureMm, measureUnits, measurePoint3, identifyPoint, type MeasurePoint } from '../src/core/measure'
import { lenMm } from '../src/core/dim'
import { project, DRAW_POSE, type Analysis } from '../src/core/camera'
import { geomSize3 } from '../src/core/osnap'
import { C } from '../src/core/constants'
import { dist3, type V3, type Pt } from '../src/core/vec'

export type Line = [number, number, number, number]
/** 탭 하나 — 몇 번째 획(0-base)의 어디를 짚는가. 실제 좌표는 **그린 획이 낸 끝점**에서
 *  뽑는다(스냅이 끝점을 옮기므로 화면 좌표를 손으로 적으면 오스냅이 빗나간다). */
export type Tap = { i: number; at: 'a' | 'mid' | 'b' }

export interface Comp {
  name: string
  W: number
  H: number
  setup: Line[]
  /** 축척을 정하는 획(0-base 인덱스)과 그 mm */
  dim: { i: number; mm: number }
  /** 소실점 둘째를 세우는 획 — 이것을 그으면 fSource가 default → two-vp가 된다 */
  promote: Line
  /** 잴 두 점 — 여러 쌍(끝점 t=0·1과 중점 t=0.5를 섞는다: D-5) */
  pairs: [Tap, Tap][]
}

export const COMPS: Comp[] = [
  {
    name: 'A_중앙',
    W: 1200, H: 800,
    setup: [
      [500, 500, 600, 475],    // 깊이선 → vp0 = 900
      [500, 500, 500, 300],    // 기둥(앵커) — 축척 획
      [500, 300, 660, 340],    // 깊이 획
      [660, 340, 660, 440],    // 둘째 기둥
    ],
    dim: { i: 1, mm: 2400 },
    promote: [500, 500, 400, 475],
    pairs: [
      [{ i: 1, at: 'b' }, { i: 3, at: 'b' }],
      [{ i: 2, at: 'mid' }, { i: 3, at: 'mid' }],
      [{ i: 0, at: 'b' }, { i: 3, at: 'a' }],
    ],
  },
  {
    name: 'B_먼VP',
    W: 1200, H: 800,
    setup: [
      [300, 600, 420, 570],    // → vp0 = 1100
      [300, 600, 300, 400],    // 기둥(앵커) — 축척 획
      [300, 600, 480, 555],    // 아래 깊이 획(promote_freeze의 B_FIX와 같은 자리)
      [480, 555, 480, 480],    // 둘째 기둥
    ],
    dim: { i: 1, mm: 3000 },
    promote: [300, 600, 200, 560],
    pairs: [
      [{ i: 1, at: 'b' }, { i: 3, at: 'b' }],
      [{ i: 2, at: 'mid' }, { i: 3, at: 'mid' }],
      [{ i: 0, at: 'b' }, { i: 3, at: 'a' }],
    ],
  },
  {
    name: 'C_좁은화각',
    W: 1200, H: 800,
    setup: [
      [700, 600, 850, 570],      // → vp0 = 1700
      [700, 600, 700, 450],      // 기둥(앵커) — 축척 획
      [700, 450, 850, 442.5],    // 깊이 획
      [850, 442.5, 850, 520],    // 둘째 기둥
    ],
    dim: { i: 1, mm: 1800 },
    promote: [700, 600, 550, 566],
    pairs: [
      [{ i: 1, at: 'b' }, { i: 3, at: 'b' }],
      [{ i: 2, at: 'mid' }, { i: 3, at: 'mid' }],
      [{ i: 0, at: 'b' }, { i: 3, at: 'a' }],
    ],
  },
  {
    name: 'D_주점근접',
    W: 1200, H: 800,
    setup: [
      [500, 500, 560, 450],      // → vp0 = 620 (주점 이동 20px)
      [500, 500, 500, 320],      // 기둥(앵커) — 축척 획
      [500, 320, 560, 360],      // 깊이 획
      [560, 360, 560, 470],      // 둘째 기둥
    ],
    dim: { i: 1, mm: 2700 },
    promote: [500, 500, 400, 487.5],
    pairs: [
      [{ i: 1, at: 'b' }, { i: 3, at: 'b' }],
      [{ i: 2, at: 'mid' }, { i: 3, at: 'mid' }],
      [{ i: 0, at: 'b' }, { i: 3, at: 'a' }],
    ],
  },
]

export interface CellRow {
  comp: string
  measure: number
  /** 정체 — 승격 «전»에 적힌 것 */
  id_before: { a: MeasurePoint; b: MeasurePoint }
  /** 정체 — 승격 «후»에 문서에 남아 있는 것(같아야 한다) */
  id_after: { a: MeasurePoint; b: MeasurePoint }
  /** 승격 후 3D 점을 다시 정체로 되돌린 것(같은 획·같은 t여야 한다) */
  id_reidentified: { a: MeasurePoint | null; b: MeasurePoint | null }
  identity_mm_before: number
  identity_mm_after: number
  identity_units_before: number
  identity_units_after: number
  /** 위약 — 승격 전 좌표를 담아 둔 판이 승격 «후»에 내는 값 */
  placebo_mm_after: number
  placebo_units_after: number
  /** 갈림 — 위약 ÷ 정체(mm). 대칭 자(fold)로도 적는다 */
  split_ratio_mm: number
  split_fold_mm: number
  split_delta_mm: number
  /** 위약 점이 «같은 점»이 아니게 된 크기 — 작도 시점 화면 px(문 = TAP_MAX_PX) */
  drift_px_a: number
  drift_px_b: number
  /** 3D 어긋남 ÷ 기하 크기(무차원) */
  drift3_rel_a: number
  drift3_rel_b: number
  /** **참값은 재기 밖에서 세운다**(web2-32 2차 리뷰어 [2]의 규약) — t가 0·1인 칸에서만
   *  `lift.lifted`의 끝점을 직접 집어 `lenMm`으로 낸다(`core/measure.ts`를 안 지난다).
   *  안쪽 t는 보간이 필요해 이 오라클이 안 선다 — 그때는 null이다. */
  oracle_mm_after: number | null
}

export interface CompRun {
  comp: string
  f_before: number | null
  f_after: number | null
  fsource_before: string
  fsource_after: string
  principal_before_x: number | null
  principal_after_x: number | null
  mm_per_unit_before: number | null
  mm_per_unit_after: number | null
  vps_before: number
  vps_after: number
  rows: CellRow[]
  /** 대조군 — **축척 두 배**(web2-32의 팔이 돌린 그 자리). 위약도 따라오므로 안 갈린다. */
  scale_control: { identity_mm: number; placebo_mm: number; fold: number }[]
  /** 직렬화 — 저장 문자열이 수(잰 값·좌표)를 담지 않는다 */
  serialized: { measures_json: string; keys: string[]; point_keys: string[] }
}

const px = (an: Analysis, p: V3, q: V3): number => {
  const u = project(an, DRAW_POSE, p), v = project(an, DRAW_POSE, q)
  return u && v ? Math.hypot(u.x - v.x, u.y - v.y) : Number.POSITIVE_INFINITY
}

const tapPt = (st: { a: Pt; b: Pt }, at: Tap['at']): Pt =>
  at === 'a' ? { ...st.a } : at === 'b' ? { ...st.b } : { x: (st.a.x + st.b.x) / 2, y: (st.a.y + st.b.y) / 2 }

/** 한 구도를 끝까지 돌린다 — 그리기 → 치수 → 재기 → **승격** → 정체/위약 재기. */
export function run(comp: Comp): CompRun {
  const s = session(comp.W, comp.H)
  const drawn = comp.setup.map(([ax, ay, bx, by]) => s.draw(ax, ay, bx, by))
  const scaleStroke = drawn[comp.dim.i]
  if (!scaleStroke) throw new Error(`${comp.name}: 축척 획이 안 그어졌다`)
  setDimension(s.app, scaleStroke.id, comp.dim.mm)
  s.app.measureKeep = true                       // 도면에 남긴다 — 직렬화까지 본다

  // ── 재기 — 앱과 같은 경로(오스냅이 걸린다) ────────────────────────────────
  const madeIds: number[] = []
  for (const [ta, tb] of comp.pairs) {
    const sa = drawn[ta.i], sb = drawn[tb.i]
    if (!sa || !sb) continue
    if (measureTap(s.app, tapPt(sa, ta.at)) !== 'from') { s.app.measureFrom = null; continue }
    if (measureTap(s.app, tapPt(sb, tb.at)) !== 'pair') { s.app.measureFrom = null; continue }
    const last = s.app.doc.measures?.[s.app.doc.measures.length - 1]
    if (last) madeIds.push(last.id)
  }

  const anOld = s.app.lift.an
  const before = madeIds.map(id => {
    const m = s.app.doc.measures!.find(x => x.id === id)!
    return {
      id,
      a: { ...m.a }, b: { ...m.b },
      units: measureUnits(s.app.lift, m)!,
      mm: measureMm(s.app.lift, m)!,
      a3: { ...measurePoint3(s.app.lift, m.a)! },   // ← **위약이 담는 것**
      b3: { ...measurePoint3(s.app.lift, m.b)! },
    }
  })
  const mmuBefore = s.app.lift.mmPerUnit
  const vpsBefore = anOld.vps.length

  // ── 승격 ────────────────────────────────────────────────────────────────
  const [px1, py1, px2, py2] = comp.promote
  s.draw(px1, py1, px2, py2)
  const anNew = s.app.lift.an
  const size = Math.max(geomSize3(s.app.lift), 1e-9)
  const tol = C.MERGE_RATIO * size

  const rows: CellRow[] = before.map(b => {
    const m = s.app.doc.measures!.find(x => x.id === b.id)!
    const na3 = measurePoint3(s.app.lift, m.a)!
    const nb3 = measurePoint3(s.app.lift, m.b)!
    const idMm = measureMm(s.app.lift, m)!
    const plMm = lenMm(b.a3, b.b3, s.app.lift.mmPerUnit)!
    // 오라클 — 끝점 칸만. `lifted`에서 직접 집는다(재기를 안 지난다)
    const end = (mp: MeasurePoint): V3 | null => {
      const g = s.app.lift.lifted.get(mp.s)
      if (!g) return null
      return mp.t === 0 ? g.a3 : mp.t === 1 ? g.b3 : null
    }
    const oa = end(m.a), ob = end(m.b)
    return {
      comp: comp.name,
      measure: b.id,
      id_before: { a: b.a, b: b.b },
      id_after: { a: { ...m.a }, b: { ...m.b } },
      id_reidentified: { a: identifyPoint(s.app.lift, na3, tol), b: identifyPoint(s.app.lift, nb3, tol) },
      identity_mm_before: b.mm,
      identity_mm_after: idMm,
      identity_units_before: b.units,
      identity_units_after: measureUnits(s.app.lift, m)!,
      placebo_mm_after: plMm,
      placebo_units_after: dist3(b.a3, b.b3),
      split_ratio_mm: plMm / idMm,
      split_fold_mm: Math.max(plMm / idMm, idMm / plMm),
      split_delta_mm: plMm - idMm,
      drift_px_a: px(anNew, b.a3, na3),
      drift_px_b: px(anNew, b.b3, nb3),
      drift3_rel_a: dist3(b.a3, na3) / size,
      drift3_rel_b: dist3(b.b3, nb3) / size,
      oracle_mm_after: oa && ob ? lenMm(oa, ob, s.app.lift.mmPerUnit) : null,
    }
  })

  // ── 대조군 — **축척 두 배**(web2-32의 팔) ────────────────────────────────
  // 여기서는 위약도 따라온다: mm 환산이 파생이라 좌표를 담아도 축척 변화는 반영된다.
  // 그것이 DEFERRED의 「그 팔로는 못 쟀다」이고, 이 줄이 그 사실을 값으로 든다.
  const control: CompRun['scale_control'] = []
  {
    const idMmPre = rows.map(r => r.identity_mm_after)
    const plMmPre = before.map(b => lenMm(b.a3, b.b3, s.app.lift.mmPerUnit)!)
    setDimension(s.app, scaleStroke.id, comp.dim.mm * 2)
    before.forEach((b, i) => {
      const m = s.app.doc.measures!.find(x => x.id === b.id)!
      const idMm = measureMm(s.app.lift, m)! / idMmPre[i]!            // 두 배가 되는가
      const plMm = lenMm(b.a3, b.b3, s.app.lift.mmPerUnit)! / plMmPre[i]!
      control.push({ identity_mm: idMm, placebo_mm: plMm, fold: Math.max(idMm / plMm, plMm / idMm) })
    })
    setDimension(s.app, scaleStroke.id, comp.dim.mm)                  // 되돌린다
  }

  const raw = JSON.parse(JSON.stringify(s.app.doc.measures))
  return {
    comp: comp.name,
    f_before: anOld.f, f_after: anNew.f,
    fsource_before: anOld.fSource, fsource_after: anNew.fSource,
    principal_before_x: anOld.principal?.x ?? null,
    principal_after_x: anNew.principal?.x ?? null,
    mm_per_unit_before: mmuBefore, mm_per_unit_after: s.app.lift.mmPerUnit,
    vps_before: vpsBefore, vps_after: anNew.vps.length,
    rows,
    scale_control: control,
    serialized: {
      measures_json: JSON.stringify(raw),
      keys: [...new Set(raw.flatMap((m: object) => Object.keys(m)))] as string[],
      point_keys: [...new Set(raw.flatMap((m: { a: object; b: object }) => [...Object.keys(m.a), ...Object.keys(m.b)]))] as string[],
    },
  }
}

export const runAll = (): CompRun[] => COMPS.map(run)
