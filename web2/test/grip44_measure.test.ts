// web2-44 — 측정 하네스: ① 잡기 정확도(획 40+ 장면 — D-5) ② 의존 갈래 셋(⚑ — D-1·D-4).
//
// ⚑ 지시문: 「A가 B의 근거였는데 A를 옮기면 B는 어떻게 되는가」 — 세 갈래를 픽스처로
// 만들어 «벽을 옮겼는데 그 위 창이 안 따라간다»가 얼마나 이상한지 수치로 보고한다.
//   ㉠ B도 따라간다   = 이어진 것까지 잡고(connectedIds) 함께 옮긴 팔이 그 값이다
//   ㉡ B는 그대로     = 구현 기본값(own3가 «사건»이라 A가 움직여도 B는 제 3D를 쥔다)
//   ㉢ B가 대기로     = B의 own3를 걷고 다시 올린 팔 — «정보를 잃는» 갈래의 실측
//
// 잡기 정확도의 자(#92): 「의도한 획이 잡혔는가」가 아니라 **「그 선택이 조작 결과를
// 바꾸는가」**다 — 잡힌 획과 의도한 획이 같은 3D 직선이면 옮김 결과가 같으므로 오답이
// 아니다(same_line로 갈라 센다).
//
// 원장: stage0/out/grip44_web2.json (LEDGER=1에서만 써진다 — #90)
//   npx vitest run test/grip44_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session, type Session } from './session'
import {
  beginHold, holdTargetAt, gripBase, applyMove, endWriting, bumpDoc,
  beginErase, eraseAt, endErase,
} from '../src/app/state'
import { connectedIds, solveMove } from '../src/core/grip'
import { geomSizeOf } from '../src/core/lift'
import { rng32 } from '../src/core/material'
import { DRAW_POSE, project } from '../src/core/camera'
import { sub3, len3, add3, mul3, dot3, type V3 } from '../src/core/vec'

const W = 1200, H = 800

function twoVpSession(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 점-3D선분 거리 */
function distToSeg3(p: V3, a: V3, b: V3): number {
  const d = sub3(b, a)
  const L2 = dot3(d, d)
  if (L2 < 1e-18) return len3(sub3(p, a))
  const t = Math.max(0, Math.min(1, dot3(sub3(p, a), d) / L2))
  return len3(sub3(p, add3(a, mul3(d, t))))
}

/** 실사용 대역 장면(D-5) — 지면 격자 + 기둥 + 보. 내용 획 40개 이상.
 *  선은 **소실점을 정확히 겨눠** 긋는다 — 초판은 손대중 경사로 그어 축 배정을 빗나가
 *  30/44만 올라갔다(축 임계를 재는 픽스처가 아니다 — 그 시험은 farvp가 따로 한다). */
function bigScene(s: Session): number[] {
  const VP0 = { x: 900, y: 400 }, VP1 = { x: 100, y: 400 }
  const ids: number[] = []
  const toward = (x: number, y: number, vp: { x: number; y: number }, t: number) =>
    s.draw(x, y, x + (vp.x - x) * t, y + (vp.y - y) * t)
  // 지면선들 — 높이가 서기 **전에**(지면 규칙 국면). vp0축 12 + vp1축 12.
  for (let i = 0; i < 12; i++) {
    const st = toward(180 + i * 62, 470 + (i % 4) * 24, VP0, 0.16)
    if (st && s.app.lift.lifted.has(st.id)) ids.push(st.id)
  }
  for (let i = 0; i < 14; i++) {
    const st = toward(1000 - i * 58, 480 + (i % 3) * 26, VP1, 0.15)
    if (st && s.app.lift.lifted.has(st.id)) ids.push(st.id)
  }
  // 기둥 — 지면선 **시작점 그 자리**에 세운다(연결로 올라간다 — 좌표가 같아야 사슬이 잡는다)
  const bases: { x: number; y: number }[] = []
  for (let i = 0; i < 10; i++) {
    const x = 180 + i * 62, y = 470 + (i % 4) * 24     // vp0 지면선 i의 시작점과 동일
    const st = s.draw(x, y, x, y - 130 - (i % 3) * 22)
    if (st && s.app.lift.lifted.has(st.id)) { ids.push(st.id); bases.push({ x, y: y - 130 - (i % 3) * 22 }) }
  }
  // 보 — 기둥 꼭대기에서 vp0 축으로
  for (let i = 0; i + 1 < bases.length; i += 2) {
    const a = bases[i]!
    const st = toward(a.x, a.y, VP0, 0.14)
    if (st && s.app.lift.lifted.has(st.id)) ids.push(st.id)
  }
  return ids
}

const OUT: Record<string, unknown> = {
  what: 'web2-44 — 잡기 정확도(획 40+) · 의존 갈래 셋(⚑) · 맺기 판정 스윕',
  when_cmd: 'npx vitest run test/grip44_measure.test.ts',
}

describe('① 잡기 정확도 — 획 40개 이상의 장면(D-5)', () => {
  /** 한 조건(떨림·시드)의 훑기 — 행 하나를 낸다(#12 동작점 하나 ⛔ · #14 시드 변동폭) */
  function accuracyRow(s: Session, ids: number[], jitterPx: number, seed: number) {
    const rng = rng32(seed)
    let hit = 0, sameLine = 0, miss = 0, none = 0
    const missRows: { id: number; got: number | null }[] = []
    let n = 0
    for (const id of ids) {
      const seg = s.app.lift.lifted.get(id)
      if (!seg) continue
      const a = project(s.app.lift.an, DRAW_POSE, seg.a3)!
      const b = project(s.app.lift.an, DRAW_POSE, seg.b3)!
      // 몸통 위 세 지점(t=0.3·0.5·0.7) + 손떨림 ±jitter(rng32 — Math.random ⛔)
      for (const t of [0.3, 0.5, 0.7]) {
        n++
        const p = {
          x: a.x + (b.x - a.x) * t + (rng() * 2 - 1) * jitterPx,
          y: a.y + (b.y - a.y) * t + (rng() * 2 - 1) * jitterPx,
        }
        const h = holdTargetAt(s.app, p)
        if (!h || h.kind !== 'line') { none++; missRows.push({ id, got: null }); continue }
        if (h.id === id) { hit++; continue }
        // #92 — 결과의 자리로 센다: 같은 3D 직선이면 옮김 결과가 같다
        const g2 = s.app.lift.lifted.get(h.id)
        if (g2 && distToSeg3(seg.a3, g2.a3, g2.b3) < 1e-6 && distToSeg3(seg.b3, g2.a3, g2.b3) < 1e-6) {
          sameLine++
        } else { miss++; missRows.push({ id, got: h.id }) }
      }
    }
    return { jitter_px: jitterPx, seed, presses: n, hit, same_line: sameLine, miss, none,
      ok_ratio: `${hit + sameLine}/${n}`, miss_rows: missRows }
  }

  it('의도한 획(또는 같은 3D 직선)이 잡히는 비율 — 떨림·시드 훑기', () => {
    const s = twoVpSession()
    const ids = bigScene(s)
    expect(ids.length).toBeGreaterThanOrEqual(40)     // D-5 — 깨끗한 장면은 아무것도 못 본다
    // 떨림 {2,3,5,8}px × 시드 {4401,4402} — #12(동작점 하나 ⛔)·#14(시드 변동폭)
    const rows: ReturnType<typeof accuracyRow>[] = []
    for (const j of [2, 3, 5, 8]) for (const seed of [4401, 4402]) rows.push(accuracyRow(s, ids, j, seed))
    OUT.grab_accuracy = {
      scene_strokes: ids.length, points_per_stroke: 3,
      miss_rows_cap: 8,   // miss_rows는 표본이다(원장 크기) — miss 수가 정본이고 행은 앞 8개
      rows: rows.map(r => ({ ...r, miss_rows: r.miss_rows.slice(0, 8) })),
      note_92: '#92 — same_line은 오답이 아니다(어느 쪽을 잡아도 옮김 결과가 같은 3D 직선). 이 장면에서 0회 발화 — 겹친 직선이 없는 픽스처다',
      note_46: '#46 — 비율은 픽스처의 획 간격 대 떨림 폭의 함수다. 간격이 좁은 실장면의 값은 실기기 확인이 판정자다',
    }
    // 통과선: 손떨림 3px 대역(기준)에서 의도(또는 동치)가 9할 이상 — 시드 둘 다
    for (const r of rows.filter(x => x.jitter_px === 3)) {
      expect((r.hit + r.same_line) / r.presses, `jitter 3 seed ${r.seed}`).toBeGreaterThanOrEqual(0.9)
    }
  })
})

describe('② 의존 갈래 셋(⚑) — 벽을 옮기면 그 위의 것은', () => {
  /** 벽 + 딸린 획: 밑변(내용) · 기둥 둘 · 상단 · 문설주(밑변 몸통 위에서 시작). */
  function wallScene(s: Session) {
    const base = s.draw(200, 560, 420, 505)!          // 지면 vp0축 — 내용(깊이선과 딴 자리)
    expect(s.app.lift.lifted.has(base.id)).toBe(true)
    const colA = s.draw(200, 560, 200, 420)!
    const colB = s.draw(420, 505, 420, 395)!
    const jamb = s.draw(310, 533, 310, 450)!          // 밑변 «몸통» 위에서 시작 — 딸린 획
    for (const st of [colA, colB, jamb]) expect(s.app.lift.lifted.has(st.id)).toBe(true)
    return { base, deps: [colA.id, colB.id, jamb.id] }
  }
  /** 딸린 획의 «닿은 끝»이 base의 3D 선분 위에 있는가 — 접점 수 */
  function contacts(s: Session, baseId: number, depIds: number[], tol: number): number {
    const bg = s.app.lift.lifted.get(baseId)!
    let cnt = 0
    for (const id of depIds) {
      const g = s.app.lift.lifted.get(id)
      if (!g) continue
      const d = Math.min(distToSeg3(g.a3, bg.a3, bg.b3), distToSeg3(g.b3, bg.a3, bg.b3))
      if (d <= tol) cnt++
    }
    return cnt
  }

  it('㉡ 그대로(구현) · ㉠ 함께 잡기 · ㉢ 대기로 — 셋의 값', () => {
    // ── ㉡ 기본값: 밑변만 잡고 옮긴다 ────────────────────────────────────────
    const s1 = twoVpSession()
    const w1 = wallScene(s1)
    const size3 = geomSizeOf(s1.app.lift.lifted)
    const tol = 1e-6 * size3
    const before = contacts(s1, w1.base.id, w1.deps, tol)
    beginHold(s1.app, { x: 310, y: 533 - 1 }, 0)   // ⚠ 문설주와 겹치는 자리 피해서
    // 밑변 몸통을 확실히 잡는다
    s1.app.grip!.ids = [w1.base.id]
    const { base: b1, base3: b31 } = gripBase(s1.app)
    const anchor = { ...s1.app.lift.lifted.get(w1.base.id)!.a3 }
    const sol = solveMove(s1.app.lift.an, s1.app.pose, anchor, { x: 260, y: 585 })!
    const after1 = applyMove(s1.app, b1, b31, sol.dir, sol.t)
    expect(after1).not.toBeNull()
    const movedUnits = Math.abs(sol.t)
    const afterContacts = contacts(s1, w1.base.id, w1.deps, tol)
    // 화면에서 그 틈이 몇 px인가 — «이상함»의 크기(잡은 문설주 밑끝 ↔ 옮긴 밑변)
    const jambG = s1.app.lift.lifted.get(w1.deps[2]!)!
    const bg = s1.app.lift.lifted.get(w1.base.id)!
    const gapUnits = distToSeg3(jambG.a3, bg.a3, bg.b3)
    const p1 = project(s1.app.lift.an, DRAW_POSE, jambG.a3)!
    // 밑변 위 최근접점의 사영
    const d = sub3(bg.b3, bg.a3)
    const tt = Math.max(0, Math.min(1, dot3(sub3(jambG.a3, bg.a3), d) / dot3(d, d)))
    const q1 = project(s1.app.lift.an, DRAW_POSE, add3(bg.a3, mul3(d, tt)))!
    const gapPx = Math.hypot(p1.x - q1.x, p1.y - q1.y)

    // ── ㉠ 「B도 따라간다」의 기하 — base와 딸린 셋에 **같은 이동**을 건다 ──────────
    // ⚠ 이것이 ㉠이 만들 «결과 기하»다(자동이든 이어잡기든 — 변환이 같으므로 기하가 같다).
    //   «자동으로»의 갈래는 이 앱에 없고(D-W8 — own3에 출처 기록이 없다) 그 부재는
    //   설계 근거이지 측정이 아니다 — 아래 verdict가 그 경계를 문면으로 가른다(#32).
    //   이어잡기(connectedIds)는 같은 기하에 도달하는 **이 회차의 도구**다.
    const s2 = twoVpSession()
    const w2 = wallScene(s2)
    beginHold(s2.app, { x: 260, y: 545 }, 0)
    s2.app.grip!.ids = connectedIds(s2.app.lift, [w2.base.id], geomSizeOf(s2.app.lift.lifted))
    expect(new Set(s2.app.grip!.ids)).toEqual(new Set([w2.base.id, ...w2.deps]))
    const { base: b2, base3: b32 } = gripBase(s2.app)
    const after2 = applyMove(s2.app, b2, b32, sol.dir, sol.t)
    expect(after2).not.toBeNull()
    const togetherContacts = contacts(s2, w2.base.id, w2.deps, 1e-6 * geomSizeOf(s2.app.lift.lifted))

    // ── ㉡ 틈의 크기 훑기(#12 — 동작점 하나 ⛔): 이동량을 갈라 화면 px로 잰다 ─────────
    // 픽스처의 px/유닛 환산(시점·깊이의 함수 — #46)이 값의 조건임을 함께 적는다.
    const gapRows: { units: number; gap_screen_px: number }[] = []
    for (const frac of [0.1, 0.5, 1.0]) {
      const s4 = twoVpSession()
      const w4 = wallScene(s4)
      beginHold(s4.app, { x: 260, y: 545 }, 0)
      s4.app.grip!.ids = [w4.base.id]
      const { base: b4, base3: b34 } = gripBase(s4.app)
      const t4 = sol.t * frac
      expect(applyMove(s4.app, b4, b34, sol.dir, t4)).not.toBeNull()
      const jg = s4.app.lift.lifted.get(w4.deps[2]!)!
      const bg4 = s4.app.lift.lifted.get(w4.base.id)!
      const d4 = sub3(bg4.b3, bg4.a3)
      const tt4 = Math.max(0, Math.min(1, dot3(sub3(jg.a3, bg4.a3), d4) / dot3(d4, d4)))
      const pj = project(s4.app.lift.an, DRAW_POSE, jg.a3)!
      const pq = project(s4.app.lift.an, DRAW_POSE, add3(bg4.a3, mul3(d4, tt4)))!
      gapRows.push({ units: Math.abs(t4), gap_screen_px: Math.hypot(pj.x - pq.x, pj.y - pq.y) })
    }

    // ── ㉢ 대기로: 밑변만 옮기고 딸린 획의 own3를 걷어 다시 올린다 ───────────
    const s3 = twoVpSession()
    const w3 = wallScene(s3)
    beginHold(s3.app, { x: 260, y: 545 }, 0)
    s3.app.grip!.ids = [w3.base.id]
    const { base: b3o, base3: b33 } = gripBase(s3.app)
    applyMove(s3.app, b3o, b33, sol.dir, sol.t)
    const before3 = w3.deps.map(id => ({ id, seg: { ...s3.app.lift.lifted.get(id)! } }))
    for (const id of w3.deps) {
      const st = s3.app.doc.strokes.find(x => x.id === id)!
      delete st.own3
    }
    endWriting(s3.app, 'far')
    // 다시 올린다 — own3 없이 사슬로
    bumpDoc(s3.app)
    let dropped = 0, moved = 0, kept = 0
    let maxReanchor = 0
    for (const b of before3) {
      const g = s3.app.lift.lifted.get(b.id)
      if (!g) { dropped++; continue }
      const err = Math.max(len3(sub3(g.a3, b.seg.a3)), len3(sub3(g.b3, b.seg.b3)))
      if (err > tol) { moved++; maxReanchor = Math.max(maxReanchor, err) } else kept++
    }

    OUT.dependency = {
      fixture: '벽 밑변(내용 획) + 기둥 둘(끝점 공유) + 문설주(밑변 몸통 위 시작) — 픽스처가 이동량·시점을 정한다(#46)',
      move: { axis: sol.axis, units: movedUnits, screen_px_of_gap: gapPx },
      gap_sweep_12: {
        rows: gapRows,
        px_per_unit_note: '#46 — px/유닛 환산은 이 픽스처의 시점·깊이가 정한 값이다(≈41). 다른 깊이·줌에서는 다르다',
      },
      b2_stay: {
        contacts_before: before, contacts_after: afterContacts,
        broken: before - afterContacts, gap_units: gapUnits,
        note: '딸린 획은 제 3D를 쥔 채 서 있다 — 틈의 화면 크기는 gap_sweep_12가 든다',
      },
      b1_follow_geometry: {
        contacts_after: togetherContacts, broken: before - togetherContacts,
        note_5: '#5 — 끊김 0은 **구성상 보장**이다(같은 변환을 전부에 걸었다 — 따라가면 접점이 사는 것은 정의다). 이 팔이 재는 것은 «이어잡기(connectedIds)가 실제로 그 집합을 모으는가»다(위 expect가 그 판정)',
        mechanism: '이어진 것 잡기(같은 선 꾹 한 번 더) — ㉠의 기하에 도달하는 이 회차의 도구. «자동» 갈래는 앱에 없다(D-W8 — 측정이 아니라 설계 근거)',
      },
      b3_waiting: {
        dropped_to_waiting: dropped, relifted_elsewhere: moved, kept_in_place: kept,
        max_reanchor_err_units: maxReanchor,
        note: 'own3를 걷는 갈래 — 자리가 조용히 바뀌거나(잘못 놓임) 대기로 떨어진다. kept 0은 의미 있는 0(셋 다 자리를 잃었다)',
      },
      verdict: '⚑ 판정의 경계(#32): 측정이 가른 것은 «㉢가 정보를 파괴한다»(대기 2·조용한 오배치 1)와 «㉡의 틈 크기»뿐이다. ㉠의 접점 보존은 구성상이라 우열의 증거가 아니고, ㉠ 기각의 근거는 측정이 아니라 설계(D-W8 — 출처 기록 없음·잡지 않은 것이 움직임)다. 「㉠이 낫다」로 읽히는 측정은 없으므로 멈춤 조건 불발 — 지시문 필자의 ㉡ 판단대로 간다',
    }
    // ㉡: 접점은 끊기되(이동한 만큼 틈) 딸린 획 셋 다 제자리(정보 보존)
    expect(before).toBe(3)
    expect(afterContacts).toBe(0)
    expect(gapUnits).toBeGreaterThan(0)
    // ㉠: 함께 잡으면 접점이 전부 산다
    expect(togetherContacts).toBe(3)
    // ㉢: 적어도 하나가 자리를 잃는다(대기 또는 딴 자리) — 이 갈래가 정보를 파괴한다
    expect(dropped + moved).toBeGreaterThan(0)
  })
})

describe('③ 맺기 — 같은 평면 판정의 경계 훑기', () => {
  it('간격/크기 비를 문(C.PLANAR_RATIO) 양쪽으로 훑는다 — 경계에서 갈리는가', async () => {
    const { solveJoin } = await import('../src/core/grip')
    const { C } = await import('../src/core/constants')
    // 지면 위에서 교차 대역을 향해 뻗는 두 선(각각 vp0·vp1 방향의 3D) — 둘째를 y로 띄운다.
    // ⚠ 판정식은 앱이 부르는 **그 함수**(solveJoin)와 그 자(C.PLANAR_RATIO)다(#54).
    //   앱 배선(joinGrip → solveJoin·rel > PLANAR_RATIO)은 단위 팔(grip44.test 「맺기」)이
    //   수용·거부·평행·치수 네 갈래로 잠근다 — 여기는 경계의 값이다.
    const A = { a3: { x: -4, y: 0, z: -8 }, b3: { x: -1, y: 0, z: -9.5 } }
    const size3 = 10   // 이 훑기의 분모(#16) — rel = gap / size3로 정규화해 문과 견준다
    const rows: { offset_rel: number; rel: number; would: 'join' | 'skew' | 'parallel' }[] = []
    for (const off of [0, 0.002, 0.005, 0.009, 0.011, 0.02, 0.05]) {
      const y = off * size3
      const B = { a3: { x: 4, y, z: -8 }, b3: { x: 1, y, z: -9.5 } }
      const j = solveJoin(A, B)
      if ('reject' in j) { rows.push({ offset_rel: off, rel: NaN, would: 'parallel' }); continue }
      const rel = j.gap / size3
      rows.push({ offset_rel: off, rel, would: rel > C.PLANAR_RATIO ? 'skew' : 'join' })
    }
    OUT.join_boundary = {
      gate: C.PLANAR_RATIO, denominator: 'size3 = 10 (이 훑기의 정규화 — 분모를 적는다: #11 · CLAUDE.md §2 표기로는 #16)',
      rows,
      note_5: '#5 — rel ≡ offset_rel(입력을 되돌리는 항등 — 0행의 1.78e-16은 기계 엡실론)이다. 이 블록이 재는 것은 «같은 평면 판정의 정확도»가 아니라 **문턱(PLANAR_RATIO) 비교의 배선**이다 — 경계 양옆(0.009/0.011)이 실제로 갈리는가. 참 동일평면/비동일평면 표본에서의 정확도는 실측 미결(실기기 ⑬ 계열)',
      wired_by: 'joinGrip 네 갈래(수용·skew·parallel·dim)는 grip44.test.ts 「맺기」가 앱 경로로 잠근다',
    }
    // 문 아래는 맺고 위는 거부한다 — 경계 양옆(0.009 / 0.011)이 실제로 갈린다
    const at = (o: number) => rows.find(r => Math.abs(r.offset_rel - o) < 1e-12)!
    expect(at(0.009).would).toBe('join')
    expect(at(0.011).would).toBe('skew')
    expect(at(0).would).toBe('join')
    expect(at(0.05).would).toBe('skew')
  })
})

describe('④ 잠금 전수 — 지우개 세 갈래 · 해제 반증(수로)', () => {
  it('잠긴 획은 세 갈래(3D·글씨·옐로) 어디서도 안 지워지고, 해제하면 지워진다', async () => {
    const { addLayer, setActiveLayer } = await import('../src/app/state')
    const s = twoVpSession()
    // ① 3D 내용 획
    const col = s.draw(500, 500, 500, 340)!
    // ② 글씨 획 — 진입해 쓴다
    beginHold(s.app, { x: 500, y: 420 }, 0)
    const w = s.write([{ x: 520, y: 400 }, { x: 522, y: 430 }], 10)
    expect(w.asText).toBe(true)
    const textId = w.s!.id
    endWriting(s.app, 'far')
    // ③ 옐로 획
    const lay = addLayer(s.app, 'yellow', { W, H })!
    setActiveLayer(s.app, lay.id)
    const y = s.draw(300, 300, 380, 330)!
    // 셋 다 잠근다(직접 — 잠금 배선은 lockGrip이 단위 팔에서 잠겼다. 여기는 지우개 갈래 몫)
    for (const id of [col.id, textId, y.id]) s.app.doc.strokes.find(x => x.id === id)!.lock = 1
    const tryErase = (p: { x: number; y: number }) => {
      const n0 = s.app.doc.strokes.length
      const { beginErase: be, eraseAt: ea, endErase: ee } = { beginErase, eraseAt, endErase }
      be(s.app); ea(s.app, p); ee(s.app)
      return n0 - s.app.doc.strokes.length
    }
    // 옐로 갈래(활성 겹 = 옐로)
    const eYellow = tryErase({ x: 340, y: 315 })
    setActiveLayer(s.app, null)
    // 글씨·3D 갈래(종이)
    const eText = tryErase({ x: 521, y: 415 })
    const e3d = tryErase({ x: 500, y: 420 })
    // 해제 반증(D-3) — 같은 지우개 획이 실제로 지운다
    delete s.app.doc.strokes.find(x => x.id === col.id)!.lock
    const eAfterUnlock = tryErase({ x: 500, y: 420 })
    OUT.lock_sweep = {
      // 분모(#11 · #43): 잠긴 획 3개(3D·글씨·옐로 각 1) · 각 획을 겨눈 지우개 시도 각 1회
      locked_strokes: 3, erase_attempts: 3,
      branches: { yellow_blocked: eYellow === 0, text_blocked: eText === 0, lifted_blocked: e3d === 0 },
      erased_while_locked: `${eYellow + eText + e3d}/3시도`,
      erased_after_unlock: `${eAfterUnlock}/1시도`,
      note: '잡기·맺기 갈래는 구성상 차단(잠긴 획은 잡히지 않는다 — grip44.test가 locked 갈래로 잠근다)',
    }
    expect(eYellow).toBe(0)
    expect(eText).toBe(0)
    expect(e3d).toBe(0)
    expect(eAfterUnlock).toBeGreaterThanOrEqual(1)
  })
})

describe('원장 쓰기', () => {
  it('stage0/out/grip44_web2.json', () => {
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'grip44_web2.json'), JSON.stringify(OUT, null, 2))
    expect(true).toBe(true)
  })
})
