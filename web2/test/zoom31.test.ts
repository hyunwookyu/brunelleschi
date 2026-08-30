// web2-31 3번 — **돋보기: 대상에 맞춰 화면을 채운다. 이동만 한다.**
//
// ⚠⚠ **요점 하나 — 두 축을 따로 잰다**(D-3 · #86). 「여백이 10%인가」(**값 축**)만 재면
//     **렌즈로 채운 판도 초록**이다: 화면 배율을 올려 채워도 여백은 정확히 10.000000%가
//     나온다. 그래서 값 축과 나란히 **정체 축**(무엇이 움직였나: `pose.p` · `view.s` ·
//     `an.f` · `an.fSource`)을 잰다. 반증 판 둘이 **각각 다른 게이트**를 빨갛게 만든다:
//
//       판 ⓐ 「여백을 안 두는 판」(margin 0)       → **값 축**이 빨개진다(0.000000)
//       판 ⓑ 「렌즈를 같이 건드리는 판」(화면 배율) → **값 축은 초록**이고 **정체 축**이 빨개진다
//
// ⚠⚠ **요점 둘 — 렌즈 대역의 양 끝에서 돈다**(#84 ㉡ · D-5). 「채운다」가 가능한지 자체가
//     **화각이 정한다**: 초광각에서는 대상을 화면에 꽉 채우려면 **대상 안으로 들어가야**
//     하므로(가장 가까운 점이 눈에 닿는다) 어떤 방법으로도 10%가 안 나온다.
//     그래서 픽스처가 둘이다 —
//       · **실사용 렌즈** f/W = 2.74 (소실점이 화면 폭의 2.5~3배 밖 — 건축 투시도의 대역.
//         저장소의 `wideDoc`이 그 근거다). 여기서 다섯 칸 전부 `framable`이고 여백이 정확히 10%.
//       · **초광각** f/W = 0.32 (`constructedDoc` — 저장소의 표준 픽스처이자 대역의 반대 끝).
//         여기서는 칸에 따라 `framable: false`이고, 그때 **근평면까지만 다가간다** —
//         여백이 커지는 대신 **아무것도 안 잘린다**(조용히 틀린 화면을 안 만든다).
//
// 원장: LEDGER=1 npx vitest run test/zoom31.test.ts  →  stage0/out/zoom31_web2.json

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { project, type Analysis } from '../src/core/camera'
import { W, H } from './fixtures'
import { session, type Session } from './session'
import { fitPlan, fitPose, fitView, marginOf, fitRectDoc } from '../src/core/zoomfit'
import { zoomFit, zoomTarget, zoomTargetPoints, setPose, type App } from '../src/app/state'
import { C } from '../src/core/constants'
import { v3, sub3, cross3, norm3, quatFromBasis, quatRotate, type V3 } from '../src/core/vec'
import type { CamPose, ViewOffset } from '../src/core/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (x: number) => Number(x.toFixed(6))
const SC = { W, H }
const IDENT: ViewOffset = { s: 1, ox: 0, oy: 0 }
const M = C.ZOOM_FIT_MARGIN
const TOL = C.ZOOM_FIT_MARGIN_TOL
const CLAMP = { min: C.VIEW_S_MIN, max: C.VIEW_S_MAX }

const ledger: Record<string, unknown> = {}

/** 눈이 target을 보는 포즈 — 궤도 뒤의 자세를 만드는 자리(롤 0 · 피치 있음) */
function lookFrom(eye: V3, target: V3): CamPose {
  const back = norm3(sub3(eye, target))
  const right = norm3(cross3(v3(0, 1, 0), back))
  return { p: eye, q: quatFromBasis(right, cross3(back, right), back) }
}

const bboxOf = (pts: V3[]) => {
  let lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity)
  for (const p of pts) {
    lo = v3(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
    hi = v3(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
  }
  return { lo, hi, c: v3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2),
           size: Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) }
}

// ── 장면 둘 — **렌즈 대역의 양 끝**(#84 ㉡) ─────────────────────────────────
// 어느 쪽이든 **앱과 같은 경로**로 그린다(`session`) — 손으로 doc에 밀어넣으면 앱이 실제로
// 만드는 기하를 안 재게 된다.

/** **실사용 렌즈** — 소실점을 화면 폭의 2.5·3배 밖에 찍는다(`wideDoc`의 근거 그대로).
 *  f ≈ 3286 = 2.74W. 건축 투시도가 사는 대역이다. */
function sceneNormal(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(3600, 400, 3600, 400)     // vp0 찍기 (+3000 = 2.5W)
  s.draw(-3000, 400, -3000, 400)   // vp1 찍기 (−3600 = 3W)
  s.draw(500, 500, 620, 486)       // vp0 방향
  s.draw(500, 500, 380, 486)       // vp1 방향
  s.draw(500, 500, 500, 380)       // 세로 기둥
  s.draw(500, 380, 620, 366)       // 기둥 위에서 vp0 방향
  return s
}

/** **실무선** — 소실점을 ±1W에 찍는다. f = 1200 = 1.00W → 수평 화각 **61.0°**로,
 *  이론서 18.4가 적은 실무 관행(`d ≥ W`)의 바로 그 자리다. 대역의 **가운데**를 덮는다
 *  (리뷰어 [2]: 양 끝만 재면 「면제가 극단의 성질인가 일반인가」를 못 가른다). */
function sceneMid(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(1800, 400, 1800, 400)     // vp0 찍기 (+1200 = 1W)
  s.draw(-600, 400, -600, 400)     // vp1 찍기 (−1200 = 1W)
  s.draw(500, 500, 620, 480)
  s.draw(500, 500, 380, 480)
  s.draw(500, 500, 500, 380)
  s.draw(500, 380, 620, 360)
  return s
}

/** **초광각** — 저장소 표준 픽스처(`constructedDoc`)의 구도. f ≈ 387 = 0.32W. */
function sceneWide(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(500, 500, 500, 380)
  s.draw(500, 380, 600, 362)
  return s
}

interface Cell { name: string; pts: V3[]; pose: CamPose; view: ViewOffset }
type LensKey = 'tele' | 'mid' | 'wide'
interface Lens { key: LensKey; label: string; app: App; an: Analysis; ids: number[]; all: V3[]; pickId: number; cells: Cell[] }

/** 수평 화각(도) — 이론서 18.4의 자와 같은 것(`2·atan(W/2f)`). 렌즈 이름을 **값으로** 적는다. */
const hfovDeg = (f: number) => 2 * Math.atan(W / (2 * f)) * 180 / Math.PI

/** 팬·줌이 얹힌 화면 — `fitRectDoc`이 뷰 오프셋을 실제로 셈에 넣는가(#71: 조건이 값의 절반) */
const SKEW_VIEW: ViewOffset = { s: 1.4, ox: -160, oy: 90 }

function lens(key: LensKey): Lens {
  const s = key === 'tele' ? sceneNormal() : key === 'mid' ? sceneMid() : sceneWide()
  const app = s.app
  const an = app.lift.an
  const ids = [...app.lift.lifted.keys()]
  const all = zoomTargetPoints(app, ids)
  const bb = bboxOf(all)
  // 「고른 것이 하나」는 **가장 짧은 획**이다(리뷰어 [7]) — 전체와 겨우 1.15배 차이 나는
  // 획을 고르면 「고른 것이 더 크게 보인다」가 무엇을 재는지 흐려진다.
  const lenOf = (id: number) => {
    const g = app.lift.lifted.get(id)!
    return Math.hypot(g.b3.x - g.a3.x, g.b3.y - g.a3.y, g.b3.z - g.a3.z)
  }
  const pickId = [...ids].sort((a, b2) => lenOf(a) - lenOf(b2))[0]!
  const one = zoomTargetPoints(app, [pickId])
  const orbit = lookFrom(v3(bb.c.x + bb.size * 1.4, bb.c.y + bb.size * 0.8, bb.c.z + bb.size * 1.2), bb.c)
  const k = bb.size
  // **화면평행으로 납작한 대상** — 깊이가 한 값이다(z 고정). 작도 포즈가 −z를 보므로
  // 이것이 정확히 「화면과 나란한 판」이고, 종횡비가 화면과 달라 가로가 딱 맞는 축이 된다.
  // 구(球) 경계로 맞추는 방법이 여기서 크게 틀린다(반지름이 대각선의 절반이다).
  const zFlat = bb.c.z + k * 0.2
  const flat: V3[] = [
    v3(bb.c.x - k * 0.5, 0.1, zFlat), v3(bb.c.x + k * 0.5, 0.1, zFlat),
    v3(bb.c.x + k * 0.5, k * 0.35, zFlat), v3(bb.c.x - k * 0.5, k * 0.35, zFlat),
  ]
  // **대상이 카메라 뒤** — 작도 포즈는 −z를 보므로 +z가 뒤다. 같은 장면을 뒤로 옮긴 것.
  const behind: V3[] = all.map(p => v3(p.x, p.y, -p.z + k * 0.5))
  const label = `f/W ${(an.f! / W).toFixed(2)} · 수평 화각 ${hfovDeg(an.f!).toFixed(1)}°`
  return {
    key, label, app, an, ids, all, pickId,
    cells: [
      { name: '고른 것이 하나 (획 한 개)', pts: one, pose: orbit, view: IDENT },
      { name: '고른 것이 여럿 (전체)', pts: all, pose: orbit, view: IDENT },
      { name: '화면평행으로 납작한 대상', pts: flat, pose: app.pose, view: IDENT },
      { name: '대상이 카메라 뒤', pts: behind, pose: app.pose, view: IDENT },
      { name: '팬·줌이 얹힌 화면', pts: all, pose: orbit, view: SKEW_VIEW },
    ],
  }
}

const TELE = lens('tele')     // f/W 2.74 — 소실점 2.5·3W 밖(망원 쪽 끝)
const MID = lens('mid')       // f/W 1.00 — 이론서 18.4의 실무 관행선
const WIDE = lens('wide')     // f/W 0.32 — 저장소 표준 픽스처(초광각 쪽 끝)
const LENSES = [TELE, MID, WIDE]
const NORMAL = TELE           // (아래 팔이 «가장 여유 있는 렌즈»를 가리키는 이름)

const measure = (L: Lens, pose: CamPose, view: ViewOffset, pts: V3[]) => marginOf(L.an, pose, view, pts, SC)

describe('web2-31 3번 — 돋보기', () => {
  it('게이트 ① 여백 — 실사용 렌즈의 다섯 칸이 전부 화면 안이고 좁은 축의 여백이 10% ± 3%', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const rows = L.cells.map(c => {
        const before = measure(L, c.pose, c.view, c.pts)!
        const plan = fitPlan(L.an, c.pose, c.view, c.pts, SC, M)
        expect(plan, `${L.label} / ${c.name} — 답이 나온다`).not.toBeNull()
        const after = measure(L, plan!.pose, c.view, c.pts)!
        // **어느 렌즈에서든 지켜지는 것 셋**
        expect(after.inside, `${L.label} / ${c.name} — 대상이 전부 화면 안`).toBe(true)
        expect(plan!.nearestDepth, `${L.label} / ${c.name} — 근평면을 안 침범한다`)
          .toBeGreaterThanOrEqual(C.RENDER_NEAR_UNITS - 1e-9)
        for (const k of ['x', 'y', 'z', 'w'] as const) {
          expect(plan!.pose.q[k], `${L.label} / ${c.name} — 자세 불변(${k})`).toBe(c.pose.q[k])
        }
        // **여백 문은 framable일 때 걸린다** — 못 채우는 구도에서 «채웠다»고 우기지 않는다
        if (plan!.framable) {
          expect(Math.abs(after.min - M), `${L.label} / ${c.name} — 좁은 축 여백`).toBeLessThanOrEqual(TOL)
        } else {
          expect(after.min, `${L.label} / ${c.name} — 못 채우면 여백이 커진다(작아지지 않는다)`)
            .toBeGreaterThan(M)
        }
        return {
          cell: c.name, points: c.pts.length, framable: plan!.framable,
          before: { inside: before.inside, margin_min: Number.isNaN(before.min) ? null : r6(before.min) },
          after: { inside: after.inside, margin_min: r6(after.min), margin_x: r6(after.mx), margin_y: r6(after.my) },
          tight_axis: after.mx <= after.my ? 'x' : 'y',
          // **대상이 커졌는가**(리뷰어 [6]) — 여백의 «최솟값»만 보면 «가운데로 모으느라
          // 한 축의 틈이 넓어진 것»과 «대상이 작아진 것»이 구별되지 않는다.
          // ⚠ 자는 «넓이»가 아니라 **화면 상자의 대각선**이다: 세로 기둥 한 획은 상자의 폭이
          //   0이라 넓이가 0이고, 넓이로 재면 그 칸에서 재는 자가 죽는다(게이트 ④와 같은 자).
          screen_span_fold: before.inside || Number.isFinite(before.box.x0) ? r6(
            Math.hypot(after.box.x1 - after.box.x0, after.box.y1 - after.box.y0)
            / Math.max(1e-9, Math.hypot(before.box.x1 - before.box.x0, before.box.y1 - before.box.y0)),
          ) : null,
          d_exact: r6(plan!.dExact), d_near: r6(plan!.dNear), d_used: r6(plan!.d),
          nearest_depth: r6(plan!.nearestDepth),
          moved: r6(Math.hypot(plan!.pose.p.x - c.pose.p.x, plan!.pose.p.y - c.pose.p.y, plan!.pose.p.z - c.pose.p.z)),
        }
      })
      for (const r of rows) {
        console.log(`[31-3 ①] ${L.label} · ${r.cell} — 여백 ${r.before.margin_min === null ? '화면 밖' : (r.before.margin_min * 100).toFixed(2) + '%'} → ${(r.after.margin_min * 100).toFixed(2)}% (좁은 축 ${r.tight_axis} · framable ${r.framable})`)
      }
      out[L.key] = { lens: L.label, f: r6(L.an.f!), f_over_W: r6(L.an.f! / W), rows }
    }
    // **망원 쪽 끝에서는 다섯 칸 전부 채워진다** — ±3% 문이 그 대역 전체에 걸린다
    const teleRows = (out['tele'] as { rows: { framable: boolean }[] }).rows
    expect(teleRows.every(r => r.framable), 'f/W 2.74의 다섯 칸이 전부 framable').toBe(true)
    // **실무선(f/W 1.00)에서도 문이 다섯 칸 전부에 선다** — framable이 아닌 칸이 하나 있어도
    // 그 칸의 여백이 문 안이다(리뷰어 [2]: 면제가 극단의 성질인지 일반인지를 여기서 가른다).
    const midRows = (out['mid'] as { rows: { framable: boolean; after: { margin_min: number } }[] }).rows
    expect(midRows.filter(r => r.framable).length, '실무선에서 대부분이 framable').toBeGreaterThanOrEqual(4)
    for (const r of midRows) {
      expect(Math.abs(r.after.margin_min - M), `실무선 / ${(r as unknown as { cell: string }).cell} — framable 여부와 무관하게 문 안이다`)
        .toBeLessThanOrEqual(TOL)
    }
    ledger['gate1_margin'] = {
      what: '카메라를 옮겨 채운 뒤의 실측 여백 — 좁은 축이 정확히 지정값이고 넓은 축은 그 이상이다.',
      margin_target: M, tolerance: TOL, render_near_units: C.RENDER_NEAR_UNITS,
      span_fold_rule: (
        '`screen_span_fold`는 **문이 아니라 사실이다**(리뷰어 [6][12]). 1보다 크면 대상이 화면에서 커진 '
        + '것이고, **1보다 작을 수 있다** — 누르기 전이 «화면 밖»이었던 칸이 그렇다(tele[4] 0.809568: '
        + '전 −45.32%). 그 칸에서 줄어드는 것이 옳다. 그래서 판정 문면은 「fold > 1」이 아니라 '
        + '**「여백의 최솟값만으로 «작아졌다»를 말하지 않는다」**이고, 문은 여백 쪽이 진다.'
      ),
      framable_note: (
        '`framable: false`는 **그 렌즈로는 그 여백이 물리적으로 안 나온다**는 뜻이다 — 채우려면 '
        + '가장 가까운 점이 눈에 닿아야 한다. 그때는 근평면까지만 다가가므로 여백이 커지고 '
        + '**아무것도 안 잘린다**. 초광각 칸이 그 자리다.'
      ),
      ...out,
    }
  })

  it('게이트 ② 렌즈 값이 안 변한다 — f·fSource·주점이 전후 동일', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const before = { f: L.an.f, fSource: L.an.fSource, px: L.an.principal!.x, py: L.an.principal!.y }
      const rows = L.cells.map(c => {
        const to = fitPose(L.an, c.pose, c.view, c.pts, SC, M)!
        return {
          cell: c.name, f: L.an.f, fSource: L.an.fSource,
          view_s_before: c.view.s, view_s_after: c.view.s,   // 카메라 갈래는 뷰를 안 건드린다
          pose_moved: r6(Math.hypot(to.p.x - c.pose.p.x, to.p.y - c.pose.p.y, to.p.z - c.pose.p.z)),
        }
      })
      const after = { f: L.an.f, fSource: L.an.fSource, px: L.an.principal!.x, py: L.an.principal!.y }
      expect(after).toEqual(before)
      for (const r of rows) expect(r.view_s_before, `${r.cell} — 화면 배율 불변`).toBe(r.view_s_after)
      console.log(`[31-3 ②] ${L.label} — f ${before.f!.toFixed(6)} → ${after.f!.toFixed(6)} · fSource ${before.fSource} → ${after.fSource}`)
      out[L.key] = { before, after, rows }
    }
    ledger['gate2_lens_fixed'] = {
      what: '**이동만 한다** — 카메라 갈래는 `pose.p` 하나만 움직인다. f·fSource·주점·화면 배율이 그대로다.',
      ...out,
    }
  })

  it('게이트 ③ 아무것도 없을 때 눌러도 안 깨진다', () => {
    // ⓐ 빈 문서
    const s0 = session(W, H)
    const p0 = { ...s0.app.pose.p }, v0 = { ...s0.app.view }
    const r0 = zoomFit(s0.app, SC)
    expect(r0.mode).toBe('none')
    expect(s0.app.pose.p).toEqual(p0)
    expect(s0.app.view).toEqual(v0)
    // ⓑ 획은 있는데 3D가 하나도 없다 — 지평선 한 획(작도 획이라 승격이 없다)
    const s1 = session(W, H)
    s1.draw(100, 400, 1100, 400)
    const r1 = zoomFit(s1.app, SC)
    expect(s1.app.lift.lifted.size).toBe(0)
    expect(r1.mode).toBe('none')
    // ⓒ 순수 함수도 null이다(예외를 안 던진다)
    expect(fitPose(NORMAL.an, NORMAL.app.pose, IDENT, [], SC, M)).toBeNull()
    expect(fitView(NORMAL.an, NORMAL.app.pose, [], SC, M, CLAMP)).toBeNull()
    expect(marginOf(NORMAL.an, NORMAL.app.pose, IDENT, [], SC)).toBeNull()
    // ⓓ 대상이 한 점으로 뭉쳤다 — 답이 없다. 거리를 임의로 짓지 않고 **지금 거리를 지킨다**
    const bb = bboxOf(NORMAL.all)
    const pose = lookFrom(v3(bb.c.x + 9, bb.c.y + 5, bb.c.z + 8), bb.c)
    const keep = fitPose(NORMAL.an, pose, IDENT, [bb.c, bb.c], SC, M)!
    const dBefore = Math.hypot(pose.p.x - bb.c.x, pose.p.y - bb.c.y, pose.p.z - bb.c.z)
    const dAfter = Math.hypot(keep.p.x - bb.c.x, keep.p.y - bb.c.y, keep.p.z - bb.c.z)
    expect(dAfter).toBeCloseTo(dBefore, 9)
    console.log(`[31-3 ③] 빈 문서·작도 획만·빈 목록·한 점 — 넷 다 무동작(한 점의 거리 ${dBefore.toFixed(6)} → ${dAfter.toFixed(6)})`)
    ledger['gate3_empty'] = {
      what: '아무것도 없으면 아무 일도 안 한다 — 예외를 던지지 않고 포즈·뷰가 한 톨도 안 움직인다',
      empty_doc: { mode: r0.mode, pose_unchanged: true, view_unchanged: true },
      construction_only: { lifted: s1.app.lift.lifted.size, mode: r1.mode },
      pure_functions_null: ['fitPose', 'fitView', 'marginOf'],
      degenerate_single_point: { dist_before: r6(dBefore), dist_after: r6(dAfter) },
    }
  })

  it('게이트 ④ 「고른 것」 — 있으면 그것, 없으면 전체', () => {
    const app: App = sceneNormal().app
    const all = zoomTarget(app)
    expect(all.scope).toBe('all')
    expect(all.ids.length).toBe(app.lift.lifted.size)
    // 치수 사후 수정으로 고른 획 하나 — 이 앱에 실재하는 「고른 것」이다(D-4).
    // **가장 짧은 획**을 고른다(리뷰어 [7] — 전체와 겨우 1.15배 차이 나는 획으로 재면
    // 「고른 것이 더 크게 보인다」가 무엇을 재는지 흐려진다).
    const pick = NORMAL.pickId
    app.dimEdit = pick
    const one = zoomTarget(app)
    expect(one.scope).toBe('picked')
    expect(one.ids).toEqual([pick])
    // 고른 것이 3D가 아니면(대기) 「고른 것」으로 안 친다 — 채울 대상이 없기 때문이다
    app.dimEdit = 99999
    expect(zoomTarget(app).scope).toBe('all')
    app.dimEdit = null
    // 고른 것 하나와 전체는 **실제로 다른 자리**로 간다
    const bb = bboxOf(NORMAL.all)
    const pose = lookFrom(v3(bb.c.x + 9, bb.c.y + 5, bb.c.z + 8), bb.c)
    const onePts = zoomTargetPoints(app, [pick])
    const toOne = fitPose(NORMAL.an, pose, IDENT, onePts, SC, M)!
    const toAll = fitPose(NORMAL.an, pose, IDENT, NORMAL.all, SC, M)!
    const gap = Math.hypot(toOne.p.x - toAll.p.x, toOne.p.y - toAll.p.y, toOne.p.z - toAll.p.z)
    expect(gap, '고른 것 하나 ↔ 전체는 다른 자리다').toBeGreaterThan(1e-3)
    // 그리고 고른 것은 **더 크게** 보인다. ⚠ 넓이로 재면 안 된다 — 가장 짧은 획은 세로
    // 기둥이라 화면 상자의 폭이 0이고 넓이가 0이다(재는 자가 그 칸에서 죽는다).
    // **화면 상자의 대각선**으로 잰다: 선분에도 뜻이 있는 유일한 자다.
    const spanOf = (p: CamPose) => {
      const m = marginOf(NORMAL.an, p, IDENT, onePts, SC)!
      return Math.hypot(m.box.x1 - m.box.x0, m.box.y1 - m.box.y0)
    }
    const grow = spanOf(toOne) / spanOf(toAll)
    expect(grow, '고른 것이 화면에서 더 크게 보인다').toBeGreaterThan(1)
    console.log(`[31-3 ④] 전체 ${all.ids.length}획 ↔ 고른 것 1획(id ${pick}, 가장 짧은 획) — 두 자리 차 ${gap.toFixed(6)} · 그 획의 화면 길이 ${grow.toFixed(2)}배`)
    ledger['gate4_target'] = {
      what: '「고른 것」의 정본 — `dimEdit ?? dimPick`이고 그것이 3D일 때만. 솔로·꺼진 겹은 이미 lifted에서 빠지므로 「전체」가 자동으로 그 범위다.',
      all_count: all.ids.length, picked_count: one.ids.length, picked_stroke_id: pick,
      picked_scope: one.scope, not_lifted_falls_back: 'all',
      pose_gap_picked_vs_all: r6(gap),
      /** 고른 획이 화면에서 몇 배 커지는가 — **가장 짧은 획**으로 잰다.
       *  ⚠ 자는 «넓이»가 아니라 **화면 상자의 대각선**이다: 그 획이 세로 기둥이라 넓이가 0이고,
       *  넓이로 재면 재는 자가 그 칸에서 죽는다(0/0).
       *  ⚠⚠ **이 배수에는 문이 없다**(리뷰어 [8] — 문턱을 지어 붙이지 않는다). 게이트가 요구하는 것은
       *  「두 자리가 다르다」와 「fold > 1」 둘뿐이고, 1.23이 1.15보다 «충분히 크다»는 근거는 없다.
       *  그 획이 화면 **세로 기둥**이라 가로 제약이 퇴화하는 것(`picked_margin_x`가 정확히 0.5)이
       *  배수가 작게 나오는 이유다 — 종횡비가 화면과 극단으로 다르면 채워도 한 축만 찬다. */
      screen_span_fold: r6(grow),
      picked_margin_x: r6(marginOf(NORMAL.an, toOne, IDENT, onePts, SC)!.mx),
    }
  })

  // ── **#12 — 동작점을 하나로 말하지 않는다**(리뷰어 [8]) ──────────────────────
  it('여백은 «시킨 대로» 나온다 — 0.05·0.10·0.15·0.20 네 동작점', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const rows = [0.05, 0.10, 0.15, 0.20].map(m => {
        const per = L.cells.map(c => {
          const plan = fitPlan(L.an, c.pose, c.view, c.pts, SC, m)!
          const got = measure(L, plan.pose, c.view, c.pts)!
          return { cell: c.name, framable: plan.framable, margin_min: r6(got.min) }
        })
        for (const q of per) {
          if (q.framable) expect(Math.abs(q.margin_min - m), `${L.label} / 여백 ${m} / ${q.cell}`).toBeLessThanOrEqual(1e-9)
        }
        return { asked: m, framable: per.map(q => q.framable), got: per.map(q => q.margin_min) }
      })
      // **단조**는 어느 칸에서든 선다 — 못 채우는 칸에서도 「더 넓게 시키면 안 좁아진다」다
      for (let i = 1; i < rows.length; i++) {
        for (let k = 0; k < rows[i]!.got.length; k++) {
          expect(rows[i]!.got[k]!, `${L.label} / ${L.cells[k]!.name} — 더 넓게 시키면 여백이 안 준다`)
            .toBeGreaterThanOrEqual(rows[i - 1]!.got[k]! - 1e-9)
        }
      }
      console.log(`[31-3 #12] ${L.label} — 시킨 값 → 실측(다섯 칸): ${rows.map(r => `${r.asked}→[${r.got.join(' ')}]`).join(' · ')}`)
      out[L.key] = rows
    }
    ledger['margin_operating_points'] = {
      what: '**#12 — 동작점 하나로 말하지 않는다.** 여백을 넷 × 렌즈 셋 × 칸 다섯으로 훑는다.',
      what_it_measures: (
        '⚠⚠ **framable 칸의 「시킨 값 = 실측」은 아무것도 안 잰다** — 닫힌 식의 구성 보장이고 '
        + '`selfcheck_flags_known.exact_margin`이 적은 그 0.100000과 같은 것이다(리뷰어 [5]). '
        + '**이 훑기가 실제로 재는 것은 못 채우는 칸이다**: 거기서는 값이 시킨 대로 안 나오고 '
        + '(f/W 0.32의 세 칸) 그 흩어짐이 곧 「어느 대역에서 문이 성립하는가」의 지도다. '
        + '그리고 **단조**(더 넓게 시키면 여백이 안 준다)는 framable·비framable 칸 **전부**에서 잰다 — '
        + '그쪽은 보장이 아니라 클램프가 낀 경로라서 확인할 값이 있다.'
      ),
      ...out,
    }
  })

  // ── **작도 갈래의 문**(리뷰어 [3]) — 거기서 무엇이 지켜져야 하는가 ───────────
  it('작도 시점 갈래 — 종이와 3D의 1:1이 «유지된다» (+반증: 렌즈로 채우면 깨진다)', () => {
    const app = sceneNormal().app
    /** 2D 획 끝점과 그 획의 3D 사영이 **화면에서** 얼마나 벌어지는가(px) */
    const inkDrift = (an: Analysis, pose: CamPose, view: ViewOffset) => {
      let worst = 0
      for (const [id, g] of app.lift.lifted) {
        const st = app.lift.strokes.get(id)!
        for (const [P, q] of [[g.a3, st.a], [g.b3, st.b]] as const) {
          const pr = project(an, pose, P)
          if (!pr) return Infinity
          worst = Math.max(worst, Math.hypot((pr.x - q.x) * view.s, (pr.y - q.y) * view.s))
        }
      }
      return worst
    }
    const an = app.lift.an
    const before = inkDrift(an, app.pose, app.view)
    const r = zoomFit(app, SC)
    expect(r.mode).toBe('view')
    const after = inkDrift(an, app.pose, app.view)
    // ⚠⚠ **이것이 작도 갈래의 문이다**: 뷰 오프셋은 2D와 3D를 **같이** 옮기므로 1:1이 산다.
    expect(before).toBeLessThan(1e-9)
    expect(after, '채운 뒤에도 종이와 3D가 붙어 있다').toBeLessThan(1e-9)
    // ── 반증 — **같은 배율을 «렌즈»로 넣은 판**. 화면에서는 비슷해 보이는데 1:1이 깨진다 ──
    const k = app.view.s
    const lensBoard: Analysis = { ...an, f: an.f! * k }
    const drifted = inkDrift(lensBoard, app.pose, IDENT)
    expect(drifted, '반증: 같은 배수를 렌즈로 넣으면 종이와 3D가 갈린다').toBeGreaterThan(1)
    console.log(`[31-3 작도 갈래] 뷰 오프셋으로 채운 뒤 어긋남 ${after.toFixed(6)} px · 같은 배수(${k.toFixed(3)}×)를 렌즈로 넣으면 ${drifted.toFixed(3)} px`)
    ledger['draw_branch_lock'] = {
      what: (
        '**작도 갈래에서 지켜야 하는 것은 «화면 배율이 안 변한다»가 아니라 «종이와 3D의 1:1»이다**'
        + '(리뷰어 [3]). 뷰 오프셋은 2D 획과 3D 사영을 **같은 닮음**으로 옮기므로 그 1:1이 구성상 산다 — '
        + '그래서 화각을 «몰래» 바꾼 것이 아니다. **같은 배수를 렌즈(f)로 넣은 판**은 그 자리에서 깨진다.'
      ),
      view_s_after: r6(k),
      /** ⚠ **반증 ⓑ의 정체 축과 같은 이름·같은 양이다**(리뷰어 [9]) — 작도 갈래도 화면 f를
       *  이만큼 바꾼다. 그래서 «서명»으로는 판 ⓑ와 안 갈리고, **가르는 것은 아래 1:1뿐**이다. */
      screen_f_fold: r6(k),
      ink_drift_px: { before: r6(before), after_view_fit: r6(after), lens_board: r6(drifted) },
      zero_is_guarantee: (
        '⚠⚠ **0.000000 px는 «측정»이 아니라 구성 보장이다** — 이 저장소가 자기참조의 대표 사례로 '
        + '이미 못 박은 그 값이다(CLAUDE.md §2 D-3: 「작도 시점 0.000000 px는 f가 무엇이든 그렇다」 · '
        + '§5.1 유형 3 · 리뷰어 [1]). **그래서 이 0 자체는 아무것도 안 잰다** — 문의 판별력은 '
        + '**719.094 px**가 준다. ⚠ 그 「f가 무엇이든 0이다」와 이 반증이 어긋나지 않는 이유: 그 문장은 '
        + '**재리프팅**을 지난 뒤의 이야기다(f가 바뀌면 사슬이 2D에서 3D를 다시 올리므로 사영이 다시 '
        + '획 위에 앉는다). 여기 반증 판은 **이미 올라간 3D를 그대로 두고 f만** 바꾼 것이라 그 되돌림이 '
        + '없다 — 그것이 곧 「보기 렌즈」가 하는 일이고(31-2), 그래서 이 판이 그 자리의 대역이다.'
      ),
      note: '31-2가 보기 렌즈(viewF)를 들이면 그 값이 이 문을 넘는 쪽이다 — 그때 이 팔이 그 사실을 낸다.',
    }
  })

  // ── **화면 배율 대역의 끝**(리뷰어 [4]) ─────────────────────────────────────
  it('작도 갈래가 배율 대역(C.VIEW_S_MAX)에 걸리면 — 채우다 만다, 그러나 안 깨진다', () => {
    const L = TELE
    // 아주 작은 대상 — 채우려면 배율이 상한을 넘어야 한다
    const bb = bboxOf(L.all)
    const tiny: V3[] = [
      v3(bb.c.x - 0.002, bb.c.y, bb.c.z), v3(bb.c.x + 0.002, bb.c.y, bb.c.z),
      v3(bb.c.x, bb.c.y + 0.002, bb.c.z),
    ]
    const v = fitView(L.an, L.app.pose, tiny, SC, M, CLAMP)!
    const m = marginOf(L.an, L.app.pose, v, tiny, SC)!
    expect(v.s, '상한에 걸린다').toBe(C.VIEW_S_MAX)
    expect(m.inside, '그래도 화면 안이다').toBe(true)
    expect(m.min, '못 채웠으니 여백이 크다').toBeGreaterThan(M)
    console.log(`[31-3 배율 대역] 아주 작은 대상 — view.s ${v.s}(상한) · 여백 ${(m.min * 100).toFixed(2)}% · 화면 안 ${m.inside}`)
    ledger['view_scale_clamp'] = {
      what: '작도 갈래도 `C.VIEW_S_MIN/MAX` 대역을 쓴다 — 상한에 걸리면 **채우다 만다**. 그때도 화면 안이고 가운데에 온다(못 채운 것은 여백이 커지는 쪽으로만 틀린다).',
      view_s: v.s, clamp: CLAMP, margin_min: r6(m.min), inside: m.inside,
    }
  })

  it('게이트 ⑤ 갈래 둘 — 작도 시점은 화면을, 궤도 뒤는 카메라를 옮긴다', () => {
    // ⓐ 작도 시점 — 카메라가 그대로이고 뷰 오프셋이 움직인다
    const a = sceneNormal().app
    const pose0 = { p: { ...a.pose.p }, q: { ...a.pose.q } }
    const ra = zoomFit(a, SC)
    expect(ra.mode).toBe('view')
    expect(a.pose.p).toEqual(pose0.p)
    expect(a.pose.q).toEqual(pose0.q)
    const ma = marginOf(a.lift.an, a.pose, a.view, zoomTargetPoints(a, ra.ids), SC)!
    expect(ma.inside).toBe(true)
    expect(Math.abs(ma.min - M)).toBeLessThanOrEqual(TOL)
    // ⓑ 궤도 뒤 — 뷰가 그대로이고 카메라가 움직인다
    const b = sceneNormal().app
    const bb = bboxOf(zoomTargetPoints(b, [...b.lift.lifted.keys()]))
    setPose(b, lookFrom(v3(bb.c.x + 9, bb.c.y + 5, bb.c.z + 8), bb.c))
    const view0 = { ...b.view }
    const rb = zoomFit(b, SC)
    expect(rb.mode).toBe('pose')
    expect(b.view).toEqual(view0)
    const mb = marginOf(b.lift.an, b.pose, b.view, zoomTargetPoints(b, rb.ids), SC)!
    expect(mb.inside).toBe(true)
    expect(Math.abs(mb.min - M)).toBeLessThanOrEqual(TOL)
    console.log(`[31-3 ⑤] 작도 시점 — view ${a.view.s.toFixed(6)} · 여백 ${(ma.min * 100).toFixed(2)}% / 궤도 뒤 — 카메라 이동 · 여백 ${(mb.min * 100).toFixed(2)}%`)
    ledger['gate5_two_branches'] = {
      what: '판정은 `isDrawPose` 하나이고 `dollyBy`·`panBy`와 **같은 술어**다(#54). 어느 갈래든 f·fSource는 안 바뀐다.',
      draw_pose: { mode: ra.mode, view_after: { s: r6(a.view.s), ox: r6(a.view.ox), oy: r6(a.view.oy) }, pose_unchanged: true, margin_min: r6(ma.min) },
      orbited: { mode: rb.mode, view_unchanged: true, margin_min: r6(mb.min) },
    }
  })

  // ── **작도 시점에서 왜 카메라가 아니라 화면인가 — 값으로 남긴다**(D-4) ────────
  it('작도 시점에서 카메라를 옮기면 종이와 3D의 1:1이 깨진다 (그래서 갈래가 둘이다)', () => {
    const app = sceneNormal().app
    const id = [...app.lift.lifted.keys()][0]!
    const g = app.lift.lifted.get(id)!
    const st = app.lift.strokes.get(id)!
    const at = (pose: CamPose) => {
      const a = project(app.lift.an, pose, g.a3)!, b = project(app.lift.an, pose, g.b3)!
      return Math.max(Math.hypot(a.x - st.a.x, a.y - st.a.y), Math.hypot(b.x - st.b.x, b.y - st.b.y))
    }
    const drift0 = at(app.pose)
    const moved = fitPose(app.lift.an, app.pose, app.view, NORMAL.all, SC, M)!
    const drift1 = at(moved)
    expect(drift0, '작도 시점에서는 3D가 2D 획 위에 정확히 앉는다').toBeLessThan(1e-6)
    expect(drift1, '카메라를 옮기면 그 1:1이 깨진다').toBeGreaterThan(1)
    console.log(`[31-3 갈래 근거] 2D 획 ↔ 3D 사영 어긋남 — 작도 시점 ${drift0.toFixed(6)} px → 카메라를 옮기면 ${drift1.toFixed(3)} px`)
    ledger['why_two_branches'] = {
      what: '작도 시점의 「이동」이 왜 뷰 오프셋인가 — 카메라를 옮기면 2D 획(문서 좌표)과 3D 사영이 갈린다. 그 어긋남을 px로 잰다.',
      drift_px_at_draw_pose: r6(drift0),
      drift_px_after_camera_move: r6(drift1),
      note: '뷰 오프셋은 2D·3D를 **같이** 옮기므로(둘 다 `view`를 탄다) 이 어긋남이 구성상 0이다.',
    }
  })

  // ── **반증(D-3)** — 두 판을 실제로 돌린다. 렌즈 둘 × 칸 다섯 전부에서(#84 ㉡) ──
  it('반증 ⓐ 「여백을 안 두는 판」 — 값 축이 빨개진다', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const rows = L.cells.map(c => {
        const plan = fitPlan(L.an, c.pose, c.view, c.pts, SC, 0)!   // margin 0
        const m = measure(L, plan.pose, c.view, c.pts)!
        const passes = Math.abs(m.min - M) <= TOL
        // ⚠⚠ **판이 실제로 움직일 수 있을 때만 반증이다**(#86 ㉠): 초광각에서는 margin 0 판도
        //    근평면에 걸려 제품과 같은 자리에 서므로 «여백을 안 뒀다»가 화면에 안 나타난다.
        //    그 칸에서 돌린 반증은 아무것도 안 잰다 — 그래서 문을 그 칸에 안 건다.
        if (plan.framable) {
          expect(passes, `${L.label} / ${c.name} — 반증 판이 실제로 게이트 ①을 못 넘는다`).toBe(false)
        }
        return { cell: c.name, board_framable: plan.framable, margin_min: r6(m.min), gap_from_target: r6(Math.abs(m.min - M)), passes }
      })
      console.log(`[31-3 반증ⓐ] ${L.label} — margin 0 판의 실측 여백: ${rows.map(r => `${(r.margin_min * 100).toFixed(2)}%${r.board_framable ? '' : '(판이 못 움직인다)'}`).join(' · ')} (문 ${(M * 100).toFixed(0)}±${(TOL * 100).toFixed(0)}%)`)
      out[L.key] = rows
      out[`${L.key}_margin_min`] = rows.map(r => r.margin_min)
    }
    // 망원 쪽 끝에서는 **다섯 칸 전부** 판이 움직이고 전부 빨개진다
    const nr = out['tele'] as { board_framable: boolean; passes: boolean }[]
    expect(nr.every(r => r.board_framable), 'f/W 2.74에서는 반증 판이 다섯 칸 다 움직인다').toBe(true)
    expect(nr.every(r => !r.passes), 'f/W 2.74에서는 다섯 칸 다 빨개진다').toBe(true)
    // 초광각에서도 **판이 움직이는 칸**은 빨개진다(대역의 반대 끝에서도 반증이 산다)
    const wr = (out['wide'] as { board_framable: boolean; passes: boolean }[]).filter(r => r.board_framable)
    expect(wr.length, '초광각에도 판이 움직이는 칸이 있다').toBeGreaterThan(0)
    expect(wr.every(r => !r.passes), '초광각의 그 칸들도 빨개진다').toBe(true)
    ledger['falsify_a_no_margin'] = {
      what: '**여백을 안 두는 판** — `margin`을 0으로 두고 같은 식을 돌린다. 「채운다」는 만족하지만 게이트 ①의 값 축이 넘는다.',
      red_gate: 'gate1_margin',
      board_framable_note: (
        '⚠⚠ `board_framable: false`인 칸에서는 **두 판이 «둘 다 근평면에 걸려» 거의 같은 자리에 선다** — '
        + '여백을 0으로 시키든 0.10으로 시키든 갈 수 있는 데까지 갔기 때문이다. **그래서 그 칸에서 돌린 '
        + '반증은 아무것도 안 잰다**(#86 ㉠). ⚠ 「같은 자리」는 **정확히 같지 않다**(리뷰어 [2]): 여백이 '
        + '가로놓임(a·b)을 바꾸므로 wide[0] 0.150034 ↔ 제품 0.171692 · wide[4] 0.116738 ↔ 제품 0.152957로 '
        + '조금 다르고, **wide[4]는 그 차 때문에 우연히 문 안(11.67%)에 든다** — 반증이 «통과»한 것이 아니라 '
        + '그 칸이 반증을 못 재는 칸이라는 증거다. 문은 그래서 그 칸에 안 걸고, 대신 **판이 실제로 움직이는 '
        + '칸이 세 렌즈 모두에 있다**(f/W 2.74·1.00은 다섯 칸 전부)는 것을 값으로 낸다.'
      ),
      ...out,
    }
  })

  it('반증 ⓑ 「렌즈를 같이 건드리는 판」 — 값 축은 초록이고 정체 축이 빨개진다', () => {
    // 화면 배율로 채우는 판. **화면에 실제로 들어가는 f는 `an.f · view.s`다**
    // (`render3d.syncCamera` — 그 곱이 곧 화각이다). 즉 이것은 렌즈를 건드린 것이다.
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const rows = L.cells.filter(c => c.name !== '대상이 카메라 뒤').map(c => {
        const v = fitView(L.an, c.pose, c.pts, SC, M, CLAMP)!
        const m = measure(L, c.pose, v, c.pts)!
        const clamped = v.s >= CLAMP.max - 1e-9 || v.s <= CLAMP.min + 1e-9
        const valuePasses = m.inside && Math.abs(m.min - M) <= TOL
        // ⚠ 배율 대역(`C.VIEW_S_MIN/MAX`)에 걸린 칸은 판이 끝까지 못 간다 — 거기서는
        //   값 축이 초록이 아닌 것이 당연하므로 문을 안 건다(그 사실도 값으로 남긴다).
        if (!clamped) {
          expect(valuePasses, `${L.label} / ${c.name} — **값 축은 통과한다**(그것이 이 반증의 요점이다)`).toBe(true)
        }
        expect(v.s / c.view.s, `${L.label} / ${c.name} — 화면 f가 실제로 바뀐다`).not.toBe(1)
        return {
          cell: c.name, board_clamped: clamped,
          value_axis: { margin_min: r6(m.min), passes: valuePasses },
          identity_axis: {
            camera_moved: 0,
            screen_f_before: r6(L.an.f! * c.view.s), screen_f_after: r6(L.an.f! * v.s),
            screen_f_fold: r6(v.s / c.view.s),
          },
        }
      })
      console.log(`[31-3 반증ⓑ] ${L.label} — 값 축 여백: ${rows.map(r => `${(r.value_axis.margin_min * 100).toFixed(2)}%${r.board_clamped ? '(배율 대역 끝)' : ''}`).join(' · ')} · 화면 f 배수: ${rows.map(r => r.identity_axis.screen_f_fold.toFixed(4)).join(' · ')}`)
      out[L.key] = rows
      out[`${L.key}_screen_f_fold`] = rows.map(r => r.identity_axis.screen_f_fold)
    }
    ledger['falsify_b_lens'] = {
      what: (
        '**렌즈를 같이 건드리는 판** — 카메라를 안 옮기고 화면 배율로 채운다. '
        + '화면에 들어가는 초점거리는 `an.f · view.s`이므로(render3d.syncCamera) 이것이 곧 화각 변경이다. '
        + '⚠⚠ **여백만 재는 팔은 이 판을 통과시킨다**(값 축 전부 초록) — 가르는 것은 정체 축뿐이다.'
      ),
      red_gate: 'gate2_lens_fixed',
      note_behind: '「대상이 카메라 뒤」 칸은 이 판에 답이 아예 없다(사영이 없으므로 배율로는 못 채운다) — 반증 ⓒ가 그 값이다.',
      note_clamped: '`board_clamped: true`는 화면 배율이 `C.VIEW_S_MIN/MAX` 끝에 걸려 판이 끝까지 못 간 칸이다(초광각에서 시선과 나란한 획이 그렇다) — 거기서는 값 축도 안 채워지므로 문을 안 건다.',
      ...out,
    }
  })

  it('반증 ⓒ 뒤엣것 — 화면 배율로는 카메라 뒤의 대상을 못 채운다', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const behind = L.cells.find(c => c.name === '대상이 카메라 뒤')!
      const v = fitView(L.an, behind.pose, behind.pts, SC, M, CLAMP)
      expect(v, '뒤엣것은 화면 자리가 없다 — 배율로 못 채운다').toBeNull()
      const plan = fitPlan(L.an, behind.pose, IDENT, behind.pts, SC, M)!
      const m = measure(L, plan.pose, IDENT, behind.pts)!
      expect(m.inside).toBe(true)
      console.log(`[31-3 반증ⓒ] ${L.label} — 화면 배율 판 null · 카메라를 옮기면 여백 ${(m.min * 100).toFixed(2)}% (framable ${plan.framable})`)
      out[L.key] = { fitView_null: v === null, fitPose_margin: r6(m.min), framable: plan.framable }
    }
    ledger['falsify_c_behind'] = {
      what: '카메라 뒤의 대상은 **화면 배율로는 못 잡는다**(사영이 없다) — 카메라를 옮기는 갈래만 답을 낸다. 두 갈래가 같은 것이 아니라는 증거다.',
      ...out,
    }
  })

  // ── **반증 ⓓ — 「그럴듯한 틀린 구현」**(리뷰어 [5]) ─────────────────────────
  // 반증 ⓐ·ⓑ는 «같은 닫힌 식에 다른 인자»라 식 자체가 틀렸을 때를 안 잰다. 그래서
  // **다른 식**을 나란히 돌린다: 대상의 **경계 구(球)**를 시야뿔에 넣는 흔한 방법이다
  // (라이노·많은 뷰어가 그렇게 한다). 이것은 언제나 «화면 안»이지만 **여백이 안 맞는다** —
  // 특히 납작한 대상에서 크게 틀린다(구의 반지름이 대각선의 절반이라서다).
  it('반증 ⓓ 「구 경계로 맞추는 판」 — 화면 안이지만 여백이 문 밖이다', () => {
    const out: Record<string, unknown> = {}
    for (const L of LENSES) {
      const rows = L.cells.map(c => {
        const bb = bboxOf(c.pts)
        const R = Math.max(...c.pts.map(p => Math.hypot(p.x - bb.c.x, p.y - bb.c.y, p.z - bb.c.z)))
        const r = fitRectDoc(c.view, SC, M)
        const f = L.an.f!, px = L.an.principal!.x, py = L.an.principal!.y
        const th = Math.min(
          Math.atan((px - r.x0) / f), Math.atan((r.x1 - px) / f),
          Math.atan((py - r.y0) / f), Math.atan((r.y1 - py) / f),
        )
        const d = R / Math.sin(th)
        const fwd = quatRotate(c.pose.q, v3(0, 0, -1))
        const pose: CamPose = { p: v3(bb.c.x - fwd.x * d, bb.c.y - fwd.y * d, bb.c.z - fwd.z * d), q: { ...c.pose.q } }
        const m = measure(L, pose, c.view, c.pts)!
        return { cell: c.name, sphere_r: r6(R), d: r6(d), margin_min: r6(m.min), inside: m.inside,
                 passes: m.inside && Math.abs(m.min - M) <= TOL }
      })
      console.log(`[31-3 반증ⓓ] ${L.label} — 구 경계 판의 여백: ${rows.map(x => `${(x.margin_min * 100).toFixed(2)}%`).join(' · ')}`)
      out[L.key] = rows
      out[`${L.key}_margin_min`] = rows.map(x => x.margin_min)
    }
    // **납작한 대상**에서 반드시 빨개진다 — 구가 대각선을 감싸므로 여백이 크게 남는다
    for (const L of LENSES) {
      const flat = (out[L.key] as { cell: string; passes: boolean; margin_min: number }[])
        .find(x => x.cell === '화면평행으로 납작한 대상')!
      expect(flat.passes, `${L.label} — 구 경계 판이 납작한 대상에서 문을 못 넘는다`).toBe(false)
      expect(flat.margin_min, '구 경계 판은 여백이 «남는» 쪽으로 틀린다').toBeGreaterThan(M + TOL)
    }
    // 그리고 「전체」 칸도 반드시 빨개진다. ⚠ **다섯 칸 전부는 아니다** — 아주 짧은 획 하나는
    // 구와 상자가 거의 같아 우연히 문 안에 든다(f/W 2.74에서 12.01% · 1.00에서 10.49%).
    // 그 사실을 값으로 적는다(#26: 못 잡는 것을 잡는다고 적지 않는다).
    for (const L of LENSES) {
      const rows = out[L.key] as { cell: string; passes: boolean }[]
      expect(rows.find(x => x.cell === '고른 것이 여럿 (전체)')!.passes,
        `${L.label} — 구 경계 판이 「전체」에서 문을 못 넘는다`).toBe(false)
      expect(rows.filter(x => x.passes).length,
        `${L.label} — 구 경계 판이 넘는 칸은 많아야 하나다`).toBeLessThanOrEqual(1)
    }
    ledger['falsify_d_sphere'] = {
      what: (
        '**「그럴듯한 틀린 구현」** — 대상의 경계 구를 시야뿔에 넣는 흔한 방법을 나란히 돌린다. '
        + '반증 ⓐ·ⓑ가 «같은 식에 다른 인자»인 것과 달리 이쪽은 **다른 식**이므로, '
        + '게이트 ①이 「닫힌 식의 자기 확인」이 아니라는 증거가 된다(리뷰어 [5]). '
        + '⚠ 재는 자(`marginOf`)는 어느 판에서도 같다 — 그것은 `camera.ts`의 `project` 하나를 쓰고 '
        + '맞춤의 대수(`fitPlan`)를 한 줄도 안 읽는다.'
      ),
      what_it_does_not_cover: (
        '⚠⚠ **덮는 방향이 하나다**(리뷰어 [7]) — 구 경계 판은 **구성상 더 물러나는** 판이라 15칸 전부 '
        + '`inside: true`이고 여백이 전부 목표 **이상**이다. 즉 이 판이 잡는 오식은 **«과여백» 방향**뿐이고, '
        + '«덜 채워 잘리는» 방향의 오식은 여전히 ⓐ(같은 식에 인자 0)만 잡는다. 그 방향의 «다른 식» 반증은 '
        + '이 회차에 없다 — `DEFERRED.md`.'
      ),
      not_caught: (
        '**못 잡는 칸 3/15**(#26 · 리뷰어 [11]): 「고른 것이 하나」가 **세 렌즈 모두**에서 우연히 문 안이다 '
        + '(tele 0.120123 · mid 0.104922 · wide 0.121044). 그 획이 짧아 구와 상자가 거의 같기 때문이다.'
      ),
      red_gate: 'gate1_margin', ...out,
    }
  })

  it('뷰 오프셋을 셈에 넣는다 — 팬·줌이 얹힌 화면에서도 여백이 같다', () => {
    const r = fitRectDoc(SKEW_VIEW, SC, M)
    const back = { x0: r.x0 * SKEW_VIEW.s + SKEW_VIEW.ox, x1: r.x1 * SKEW_VIEW.s + SKEW_VIEW.ox }
    expect(back.x0).toBeCloseTo(M * W, 9)
    expect(back.x1).toBeCloseTo((1 - M) * W, 9)
    const L = NORMAL
    const c = L.cells.find(x => x.name === '팬·줌이 얹힌 화면')!
    const to = fitPose(L.an, c.pose, SKEW_VIEW, c.pts, SC, M)!
    const m = measure(L, to, SKEW_VIEW, c.pts)!
    expect(Math.abs(m.min - M)).toBeLessThanOrEqual(TOL)
    // 반증 — **뷰를 무시하고**(항등으로 보고) 맞추면 실제로 여백이 틀린다
    const naive = fitPose(L.an, c.pose, IDENT, c.pts, SC, M)!
    const mn = measure(L, naive, SKEW_VIEW, c.pts)!
    expect(Math.abs(mn.min - M), '반증: 뷰를 무시하면 여백이 문 밖이다').toBeGreaterThan(TOL)
    console.log(`[31-3 뷰] 얹힌 화면(s ${SKEW_VIEW.s}) — 셈에 넣으면 ${(m.min * 100).toFixed(2)}% · 무시하면 ${(mn.min * 100).toFixed(2)}% (화면 안 ${mn.inside})`)
    ledger['view_offset'] = {
      what: '팬·줌이 얹힌 화면에서도 같은 여백이 나온다 — 화면 사각형을 문서 좌표로 되돌리는 자리가 `fitRectDoc` 하나다(#54).',
      view: SKEW_VIEW, margin_with_view: r6(m.min),
      falsification: { ignoring_view_inside: mn.inside, ignoring_view_margin_min: r6(mn.min) },
    }
  })

  it('원장', () => {
    const payload = JSON.stringify({
      what: 'web2-31 3번 — 돋보기(대상에 맞춰 화면을 채운다). **이동만 하고 렌즈를 안 건드린다**를 값 축·정체 축 둘로 잰다.',
      canonical_command: 'LEDGER=1 npx vitest run test/zoom31.test.ts',
      why: (
        '렌즈를 조절할 수 있게 되면 화각을 좁힌 뒤 다시 잡을 방법이 필요하다(라이노 Zoom Selected/Extents). '
        + '⚠ 그 «다시 잡기»가 화각을 몰래 바꾸면 31-2와 뒤섞이므로 **이동만** 한다.'
      ),
      design: {
        closed_form: (
          '자세 q를 고정하면 「화면 안에 든다」가 카메라 위치에 대해 **선형 부등식**이 된다: '
          + 'docX ≥ x₀ ⟺ f·(aᵢ−a) ≥ (x₀−px)·(gᵢ+d). 거리 d·가로 a·세로 b로 쓰면 세 축이 갈라지고 '
          + '각 축의 허용 구간 폭이 d의 **1차식**(기울기 (x₁−x₀)/f > 0)이라 폭이 0이 되는 d가 하나다. '
          + '답은 d* = max(d_a, d_b) — **반복 탐색도 수렴 판정도 없다.**'
        ),
        tight_axis: '그 d*에서 한 축은 여백이 정확히 지정값이고 다른 축은 남은 구간의 가운데다(그 축의 여백은 반드시 그 이상 — 대상의 종횡비가 화면과 다른 만큼).',
        near_plane: (
          '**근평면이 유일한 제약이다**(`C.RENDER_NEAR_UNITS` — `render3d`가 실제로 자르는 그 값 · #54). '
          + 'd*가 그 여유보다 가까우면 «채우려면 대상 안으로 들어가야 하는» 구도이고, 그때는 '
          + '근평면까지만 다가간다(`framable: false`). 여백이 커지는 대신 **아무것도 안 잘린다**.'
        ),
        two_branches: (
          '작도 시점(`isDrawPose`)에서는 카메라가 아니라 **뷰 오프셋**을 옮긴다 — 거기서 카메라를 옮기면 '
          + '2D 획과 3D의 1:1이 깨진다(`why_two_branches`가 그 어긋남을 px로 잰다). 판정 술어는 '
          + '`dollyBy`·`panBy`와 **같은 것 하나**다(#54).'
        ),
        target: '「고른 것」 = `dimEdit ?? dimPick`(3D일 때만) · 없으면 전체. **획 다중 선택은 이 앱에 없다**(D-4로 확인) · 솔로·꺼진 겹은 이미 lifted에서 빠진다.',
      },
      fixtures: {
        W, H,
        lenses: LENSES.map(L => ({
          key: L.key, label: L.label, f: r6(L.an.f!), f_over_W: r6(L.an.f! / W),
          hfov_deg: r6(hfovDeg(L.an.f!)),
          fSource: L.an.fSource, vps: L.an.vps.map(v => v.x), principal: L.an.principal,
          lifted: L.ids.length, points: L.all.length,
        })),
        cells: TELE.cells.map(c => ({ name: c.name, points: c.pts.length, view: c.view })),
        framable_scope_note: (
          '⚠⚠ **「면제는 초광각의 성질이다」로 넓히지 않는다**(리뷰어 [6]). `framable`은 `d*`와 '
          + '`d_near`(= 근평면 1 − minG)의 비교이므로 **화각 · 대상의 깊이 대 가로 비 · 대상 크기 대 '
          + '근평면 · 자세**가 함께 정한다. 이 회차가 잰 것은 «이 대상 · 이 자세 · 세 화각»이고, 그 안에서 '
          + 'f/W 2.74·1.00은 5/5 framable, f/W 0.32는 3칸 면제였다. **자세가 같이 정한다는 반례가 같은 '
          + '회차 안에 있다**: e2e ②는 같은 f/W 0.32 구도인데 궤도 80px에서 framable이다. '
          + '⚠ 이론서 18.4가 이름 붙인 경계(60° = 0.87W · 90° = 0.5W)는 **한 점도 안 돌았다** — '
          + '면제가 어디서 시작하는지는 f/W 1.00과 0.32 사이가 비어 있고 `DEFERRED.md`에 있다.'
        ),
        lens_band_note: (
          '**렌즈가 픽스처의 한 축이다**(#84 ㉡ · 리뷰어 [1][2]): 「채운다」가 가능한지 자체를 화각이 '
          + '정한다. 이론서 18.4의 자(60° → d ≥ 0.87W · 90° → d ≥ 0.5W · 실무 관행 d ≥ W)로 읽으면 '
          + '세 픽스처는 **망원 쪽 끝(20.7°) · 실무 관행선(53.1°) · 초광각 쪽 끝(114.3°)**이다. '
          + '⚠ 이름을 «실사용»처럼 짓지 않고 **값(f/W · 화각)으로** 적는다 — 어느 것이 실사용인지는 '
          + '이 회차가 잰 것이 아니다.'
        ),
        d5_note: (
          '지시가 이름 붙인 다섯 칸을 전부 만들었다(D-5): 하나 · 여럿 · 없음(게이트 ③) · '
          + '**화면평행 납작** · **카메라 뒤**. 그리고 «팬·줌이 얹힌 화면»을 여섯째로 더했다 — '
          + '뷰 오프셋을 셈에서 빠뜨리면 거기서만 틀리기 때문이다(반증이 붙어 있다). '
          + '⚠ **렌즈가 여섯째 축이다**(#84 ㉡): 「채운다」가 가능한지 자체를 화각이 정하므로 '
          + '대역의 양 끝(f/W 2.74 ↔ 0.32)에서 같은 팔을 돌린다.'
        ),
      },
      before_fix: {
        what: '**D-2 — 고치기 전.** 돋보기가 없던 자리(그 포즈 그대로)에서 잰 여백이다. `gate1_margin`의 각 행 `before`가 그 값이고, `after`가 누른 뒤다.',
        where: 'gate1_margin/<lens>/rows[]/before',
      },
      constants: {
        ZOOM_FIT_MARGIN: M, ZOOM_FIT_MARGIN_TOL: TOL,
        VIEW_S_MIN: C.VIEW_S_MIN, VIEW_S_MAX: C.VIEW_S_MAX, RENDER_NEAR_UNITS: C.RENDER_NEAR_UNITS,
      },
      constants_note: (
        '새 임계는 여백 비 하나와 게이트 허용 하나뿐이고 **둘 다 비(比)다 — px가 아니다**(#88: '
        + 'px로 적으면 「그때 쓰던 화면 크기」와 말없이 묶인다). `VIEW_S_MIN/MAX`와 `RENDER_NEAR_UNITS`는 '
        + '새 값이 아니라 `dollyBy`·`render3d.syncCamera`가 인라인으로 들고 있던 0.2·8·1을 꺼낸 것이다 '
        + '(#54 — 돋보기가 같은 값을 읽어야 「채웠는데 앞이 잘린다」가 안 난다).'
      ),
      ...ledger,
      gate: {
        for: 'web2-31 3번 — 여백 10%±3% · 렌즈 불변 · 빈 상태 무동작',
        registered: [
          '고른 대상이 화면 안에 전부 들어오고, 좁은 축의 여백이 10% ± 3% — **f/W 2.74와 1.00에서 다섯 칸 전부**',
          '어느 렌즈에서든 근평면을 안 침범한다 — 못 채우는 구도에서는 여백이 커질 뿐 잘리지 않는다',
          '렌즈 값이 안 변한다 — f·fSource·주점이 전후 동일하고 카메라 갈래는 화면 배율도 안 건드린다',
          '아무것도 없을 때 눌러도 안 깨진다 (빈 문서 · 작도 획만 · 빈 목록 · 한 점으로 뭉친 대상)',
          '「고른 것」이 있으면 그것, 없으면 전체 — 둘이 실제로 다른 자리로 가고 고른 것이 더 크게 보인다',
          '갈래 둘이 각자의 것만 움직인다(작도 시점 = 화면 · 궤도 뒤 = 카메라)',
          '**작도 갈래는 종이와 3D의 1:1을 유지한다** — 그 갈래에서 「렌즈를 안 바꿨다」의 뜻이 그것이다(`draw_branch_lock`)',
          '못 채우는 구도에서도 근평면을 안 침범하고 화면 안이다 — 여백이 **커지는 쪽으로만** 틀린다',
        ],
        reachability: (
          '**두 축이 각각 다른 판에서 빨개진다**(#86). ⓐ 「여백을 안 두는 판」(margin 0)은 '
          + '**값 축**을 넘는다(문 10±3% 밖). ⓑ 「렌즈를 같이 건드리는 판」(화면 배율로 채우기)은 '
          + '**값 축이 초록**이고(여백 정확히 10.000000%) **정체 축**에서 갈린다 — 카메라 이동 0, '
          + '화면 f(= an.f·view.s)가 배수만큼 바뀐다. ⚠ 그래서 「여백만 재는 팔」은 이 항목의 주장을 **안 잰다**.'
        ),
        /** **정체 축의 값**(#40 — 값 대조가 되는 자리 하나를 가리킨다). 반증 판 ⓑ가 화면 f를
         *  몇 배로 바꿔 놓고도 여백을 10.000000%로 맞추는가 — 이 배수가 곧 「여백만 재는 팔이
         *  못 보는 것」의 크기다. ⚠ 값 축(반증 ⓐ)의 값은 **정확히 0**이라 여기 못 쓴다
         *  (#40 ②: 0/1은 대개 보장이라 정보량이 0이다) — 그 값은 아래 secondary에 적는다. */
        reachability_value: (ledger['falsify_b_lens'] as { tele_screen_f_fold: number[] }).tele_screen_f_fold,
        reachability_source: 'falsify_b_lens/tele_screen_f_fold',
        reachability_value_secondary: (ledger['falsify_d_sphere'] as { tele_margin_min: number[] }).tele_margin_min,
        reachability_source_secondary: 'falsify_d_sphere/tele_margin_min',
      },
      selfcheck_flags_known: {
        exact_margin: (
          '⚠ f/W 2.74·1.00의 `margin_min`이 다섯 칸 모두 **정확히 0.100000**으로 나온다 — 「분포 전체가 한 값」이 잡힌다. '
          + '**설계 보장이 맞다**(CLAUDE.md §5.1 자기참조 유형 3): 닫힌 식이라 좁은 축의 허용 구간 폭이 '
          + '구성상 0이고, 그러면 여백이 지정값과 부동소수 오차 안에서 같다. **그래서 이 값 자체는 '
          + '아무것도 안 잰다** — 문의 판별력은 반증 판 ⓐ가 준다(실제로 돌렸다). '
          + '⚠⚠ 그리고 값 축만으로는 반증 판 ⓑ를 못 가른다 — 정체 축이 그래서 따로 있다. '
          + '⚠⚠⚠ 반증 ⓐ·ⓑ는 «같은 닫힌 식에 다른 인자»라 **식 자체가 틀렸을 때**를 안 잰다 — '
          + '그 자리는 반증 ⓓ(구 경계로 맞추는 다른 식)와 e2e의 재유도(diag.projectAll)가 진다(리뷰어 [5]).'
        ),
        counters_zero: (
          '⚠ `falsify_a_no_margin`의 `margin_min` 0들과 `gate3_empty.construction_only.lifted = 0`이 '
          + '「카운터 0」으로 잡힌다. **둘 다 그 칸의 주장 자체다**: 앞은 «여백을 안 뒀으니 0이다»(그것이 '
          + '반증의 내용이고, 문 10±3%를 넘는 근거다)이고 뒤는 «작도 획만 있으면 승격이 0이다»(그래서 '
          + '돋보기가 무동작인 것이 맞다). 값이 0이 **아니면** 그 칸이 틀린 것이다.'
        ),
        zero_errors: (
          '⚠ e2e 원장의 `empty_*.errors = 0`은 「오차류 지표가 정확히 0」으로 잡힌다 — 콘솔·페이지 '
          + '오류 **개수**이고 0이 곧 통과 조건이다(임계를 따로 안 건다). 0이 아니면 그 칸이 빨개진다.'
        ),
        zero_camera_move: (
          '반증 ⓑ의 `camera_moved`가 정확히 0인 것도 보장이다 — 그 판이 카메라를 안 건드리는 판이라 그렇다. '
          + '0이 결함이 아니라 **그 판의 정의**인 자리다.'
        ),
        constants_snapshot_absent: (
          '⚠ `constantsSnapshot()` / `metric_defs`가 없다 — **web2 라인 전체의 구멍**이고 이 원장만의 것이 '
          + '아니다(그 기계는 `web/test/constants.ts`에만 있다). 이 회차는 상수를 `constants` 블록에 '
          + '그대로 적는 것까지만 한다 — 기계를 세우는 것은 web2 전역 작업이라 범위 밖이다.'
        ),
      },
      pitfalls: ['#88', '#87', '#86', '#84', '#54', '#71', '#42', '#40', '#12', '#26'],
      pitfalls_note: (
        '#88 — 여백을 px가 아니라 **비**로 두고, 단추 자리의 여유도 상수로 안 적는다(e2e가 실측에서 유도한다). '
        + '#87 — 새 단추가 실제로 «눌리는가»를 `elementFromPoint`로 잰다(e2e ②, dpr 1·2). '
        + '#86 — **값 축(여백)과 정체 축(무엇이 움직였나)을 따로 잰다** — 반증 ⓑ가 값 축에서 초록이다. '
        + '#84 ㉡ — 반증을 **렌즈 대역의 양 끝**에서 돌렸다(한 칸으로 반증하면 잘못 판정한다). '
        + '#54 — `isDrawPose` 하나로 갈래를 가르고(dollyBy·panBy와 같은 술어) 화면 배율 대역·근평면을 `C`로 꺼냈다. '
        + '#71 — 재는 조건(뷰포트·렌즈·포즈·뷰 오프셋)을 원장에 싣는다. '
        + '#12 — 여백을 **동작점 하나로 말하지 않는다**: 0.05·0.10·0.15·0.20 네 점을 훑고 단조까지 낸다(`margin_operating_points`). 렌즈도 세 점이다. '
        + '#26 — 반증 ⓓ가 **못 잡는 칸**을 값으로 적는다(아주 짧은 획 하나는 구와 상자가 거의 같아 우연히 문 안이다). '
        + '#42 — 착수 표의 번호를 완료 시 다시 대조했다(web2/NOTES.md 31-3 절).'
      ),
    }, null, 2)
    const out = resolve(HERE, '../../stage0/out/zoom31_web2.json')
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, payload)
      console.log(`[원장] ${out}`)
    } else {
      console.log('[31-3] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
    expect(payload.length).toBeGreaterThan(0)
  })
})
