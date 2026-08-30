// web2-31 1번 — **뷰 큐브 90° 화살표: 기준 틀은 화면이 아니라 축이다.**
//
// ⚠⚠ **이 파일의 요점은 시험 방법이다(D-3).** 「축 기준」은 **초기 화면이 축에서 돌아가
//     있는 2점 구도로만 반증된다.** 정면 구도(1점)로 90° 회전을 시험하면 축 기준이든
//     화면 기준이든 **결과가 같아서 거저 통과한다** — 사용자가 극초기에 잡은 문제가 정확히
//     그렇게 숨어 있었다. 그래서 이 파일은 두 판을 **나란히** 돌린다:
//
//       · 축 판(제품)   `cubeBasis(an)`        = vp0 방향 · 세로축 · 그 외적
//       · 화면 판(반증) `screenBoard(DRAW_POSE)` = 초기 카메라의 right · up · back
//
//     그리고 **같은 픽스처에서 화면 판이 빨개지는 것**과 **정면 구도에서 두 판이 같은 답을
//     내는 것**을 둘 다 수치로 낸다. 뒤쪽이 없으면 「함정이 있다」는 말이 증거가 없다.
//
// 반증 조건(이 검사가 실패하는 조건): 제품이 `screenBoard`처럼 «지금 카메라»를 정면으로
// 삼으면 `two_point.axis_board.align_min_deg`가 0에서 **37.76°**로 뛰고 게이트 ②가 빨개진다.
// 아래 `falsify` 블록이 그 판을 **실제로 돌려** 그 수를 낸다(못 실패시키는 검사는 안 잰다).
//
// 원장: LEDGER=1 npx vitest run test/turn31.test.ts  →  stage0/out/turn31_web2.json

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, DRAW_POSE } from '../src/core/camera'
import { builder, constructedDoc, W, H } from './fixtures'
import { session } from './session'
import {
  cubeBasis, orientIn, turnOrient, poseForOrient, cubeArrows, arrowHit, cubeLayoutFor,
  type CubeBasis, type CubeTurn, type FaceOrient,
} from '../src/core/viewcube'
import { createAutoLevel } from '../src/app/autolevel'
import { orbitPivot, setPose, type App } from '../src/app/state'
import { C, CUBE_ALIGN_MAX_DEG, TURN_ANIM_MS } from '../src/core/constants'
import { v3, dot3, norm3, quatRotate, type V3 } from '../src/core/vec'
import type { CamPose } from '../src/core/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEG = 180 / Math.PI
const r6 = (x: number) => Number(x.toFixed(6))
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x))

const PIVOT = v3(0, 0, -400)
const DIST = 500

const fwdOf = (p: CamPose): V3 => quatRotate(p.q, v3(0, 0, -1))
const upOf = (p: CamPose): V3 => quatRotate(p.q, v3(0, 1, 0))

/** 두 방향 사이 각(도) */
const angDeg = (a: V3, b: V3) => Math.acos(clamp1(dot3(norm3(a), norm3(b)))) * DEG
/** 시선이 그 **축**과 정렬한 정도 — 축은 ± 양방향이 같은 축이다 */
const alignDeg = (p: CamPose, ax: V3) => Math.acos(clamp1(Math.abs(dot3(fwdOf(p), norm3(ax))))) * DEG
/** 두 포즈의 자세 차 — 회전행렬 비교(눈으로 말고). 세 축의 최대 어긋남 각. */
const poseGapDeg = (a: CamPose, b: CamPose) => Math.max(
  angDeg(quatRotate(a.q, v3(1, 0, 0)), quatRotate(b.q, v3(1, 0, 0))),
  angDeg(quatRotate(a.q, v3(0, 1, 0)), quatRotate(b.q, v3(0, 1, 0))),
  angDeg(quatRotate(a.q, v3(0, 0, 1)), quatRotate(b.q, v3(0, 0, 1))),
)

// ── 픽스처 둘 ─────────────────────────────────────────────────────────────
// ① 2점 — **초기 화면이 축에 대해 돌아가 있다**(vp0과 37.76° · vp1과 52.24°).
const an2 = analyze(constructedDoc().doc)
// ② 1점 — 초기 화면이 **마침** 정면과 일치한다. 그것은 결과지 정의가 아니다(지시 문면).
//    ⚠ 소실점을 화면 가운데가 **아닌** 곳에 둔다: 1점에서 주점 = 깊이 소실점이므로
//    vp0 방향은 소실점 위치와 무관하게 (0,0,−1)이다. 그 «무관함»이 지시의 문면이다.
function onePointDoc() {
  const b = builder()
  b.add(100, 400, 1100, 400)   // 지평선 — 퇴화(아무것도 선언하지 않는다)
  b.add(800, 400, 800, 400)    // 깊이 소실점 찍기(주점이 여기로 온다)
  b.add(300, 600, 700, 600)    // 화면 수평 획 → H 선언 → 1점 잠금
  return b.doc
}
const an1 = analyze(onePointDoc())

/** **화면 기준 판(반증용)** — 초기 카메라 자신의 right·up·back을 축으로 삼는다.
 *  즉 「초기 화면을 큐브의 정면으로 잡는」 판이다. 틀을 **한 번** 잡고 계속 쓴다
 *  (매번 다시 잡으면 90°가 아니라 항등이 된다 — 그것은 또 다른 판이다). */
function screenBoard(pose: CamPose): CubeBasis {
  return {
    X: quatRotate(pose.q, v3(1, 0, 0)),
    Y: quatRotate(pose.q, v3(0, 1, 0)),
    Z: quatRotate(pose.q, v3(0, 0, 1)),
  }
}

/** 화살표를 n번 눌렀을 때의 포즈들 — 판(board)만 갈아 끼우면 두 판이 같은 경로를 돈다 */
function press(board: CubeBasis, start: CamPose, turns: CubeTurn[]): CamPose[] {
  let o = orientIn(board, start)
  return turns.map(t => { o = turnOrient(o, t); return poseForOrient(board, o, PIVOT, DIST) })
}
const times = (t: CubeTurn, n: number): CubeTurn[] => Array.from({ length: n }, () => t)

const axisDir = (an: ReturnType<typeof analyze>, id: string): V3 =>
  an.axes.find(a => a.id === id)!.dir

// ══════════════════════════════════════════════════════════════════════════
const ledger: Record<string, unknown> = {}

describe('web2-31 1번 — 90° 화살표의 틀은 축이다', () => {
  it('게이트 ① 좌/우 90°를 네 번 돌면 시작 자세로 정확히 돌아온다 (회전행렬 비교)', () => {
    const basis = cubeBasis(an2)!
    // 면 자세는 **정수 축 벡터**라 네 번 돌면 성분이 정확히 같다(부동소수 비교가 아니다)
    const o0 = orientIn(basis, DRAW_POSE)
    let o: FaceOrient = o0
    for (let i = 0; i < 4; i++) o = turnOrient(o, 'right')
    expect(o).toEqual(o0)

    // 포즈로도 잰다 — 1..8번째 누름의 포즈를 만들어 k와 k+4를 견준다
    const seq = press(basis, DRAW_POSE, times('right', 8))
    const gaps = [0, 1, 2, 3].map(k => poseGapDeg(seq[k]!, seq[k + 4]!))
    const posGaps = [0, 1, 2, 3].map(k => Math.hypot(
      seq[k]!.p.x - seq[k + 4]!.p.x, seq[k]!.p.y - seq[k + 4]!.p.y, seq[k]!.p.z - seq[k + 4]!.p.z))
    for (const g of gaps) expect(g).toBeLessThan(CUBE_ALIGN_MAX_DEG)
    for (const d of posGaps) expect(d).toBeLessThan(1e-9)

    // **초기 화면과는 다르다** — 그것이 이 항목의 내용이다. 네 자세 중 어느 것도
    // 초기 화면 자세가 아니고, 가장 가까운 것이 37.76° 떨어져 있다.
    const toStart = seq.slice(0, 4).map(p => poseGapDeg(p, DRAW_POSE))
    expect(Math.min(...toStart)).toBeGreaterThan(1)

    // **정확히 0인 축**(#86 — 값 축의 1e-06은 acos의 정밀도이지 어긋남이 아니다):
    // 쿼터니언 성분을 그대로 견준다. 같은 정수 자세에서 같은 코드로 나오므로 비트가 같다.
    const qd = [0, 1, 2, 3].map(k => Math.max(
      Math.abs(seq[k]!.q.x - seq[k + 4]!.q.x), Math.abs(seq[k]!.q.y - seq[k + 4]!.q.y),
      Math.abs(seq[k]!.q.z - seq[k + 4]!.q.z), Math.abs(seq[k]!.q.w - seq[k + 4]!.q.w)))
    for (const d of qd) expect(d).toBe(0)
    // 한 걸음이 **정확히 90°**인가 — 이웃한 두 누름 사이
    const steps = [0, 1, 2].map(k => angDeg(fwdOf(seq[k]!), fwdOf(seq[k + 1]!)))
    for (const st of steps) expect(Math.abs(st - 90)).toBeLessThan(CUBE_ALIGN_MAX_DEG)
    // **첫 누름만 다르다** — 초기 화면이 면 위가 아니므로 «양자화 + 90°»다(그것이 이 항목의 내용)
    const firstStep = angDeg(fwdOf(DRAW_POSE), fwdOf(seq[0]!))

    ledger['gate1_cycle'] = {
      what: '좌/우 90° × 4 = 항등인가 — 회전행렬(세 축)의 최대 어긋남 각(도) · 쿼터니언 성분 차 · 위치 차',
      orient_exact: true,
      cycle_quat_max_abs_delta: qd,
      cycle_gap_deg: gaps.map(r6),
      cycle_pos_delta: posGaps.map(r6),
      step_deg: steps.map(r6),
      first_step_from_initial_screen_deg: r6(firstStep),
      first_step_note: (
        '**첫 누름은 초기 화면에서 90°가 아니다 — 52.24°다.** 초기 화면이 틀의 면 위가 아니므로 '
        + '「가장 가까운 면으로 읽고 거기서 90°」이기 때문이다. 화면 기준이면 이 값이 정확히 90°가 '
        + '되는데, 그러면 **영원히 진짜 입면에 못 닿는다**(gate3). 이 52.24°가 틀이 축이라는 표식이다.'
      ),
      gap_to_initial_screen_deg: toStart.map(r6),
      note: '네 자세 중 가장 가까운 것도 초기 화면과 37.76° 떨어져 있다 — **틀이 화면이 아니다**.',
    }
  })

  it('게이트 ② 그 네 자세가 VP1·VP2 축과 정렬한다 (오차 < 0.01°)', () => {
    const basis = cubeBasis(an2)!
    const vp0 = axisDir(an2, 'vp0'), vp1 = axisDir(an2, 'vp1')
    const seq = press(basis, DRAW_POSE, times('right', 4))
    const toVp0 = seq.map(p => alignDeg(p, vp0))
    const toVp1 = seq.map(p => alignDeg(p, vp1))
    const best = seq.map((_, i) => Math.min(toVp0[i]!, toVp1[i]!))
    // 넷 다 어느 한 축 위에 있고, vp0·vp1 각각에 정렬한 자세가 **둘 이상** 있다
    for (const b of best) expect(b).toBeLessThan(CUBE_ALIGN_MAX_DEG)
    expect(toVp0.filter(a => a < CUBE_ALIGN_MAX_DEG).length).toBeGreaterThanOrEqual(2)
    expect(toVp1.filter(a => a < CUBE_ALIGN_MAX_DEG).length).toBeGreaterThanOrEqual(2)
    // 롤 0 — 가로 면에서는 화면 위가 세로축이다
    for (const p of seq) expect(Math.abs(quatRotate(p.q, v3(1, 0, 0)).y)).toBeLessThan(1e-12)

    ledger['gate2_axis_align'] = {
      what: '네 자세의 시선이 vp0·vp1 축과 이루는 각(도) — 축은 ± 양방향이 같은 축이다',
      align_vp0_deg: toVp0.map(r6),
      align_vp1_deg: toVp1.map(r6),
      align_best_deg: best.map(r6),
      threshold_deg: CUBE_ALIGN_MAX_DEG,
    }
  })

  it('게이트 ③ **반증** — 「화면 기준」 판은 이 픽스처에서 빨개지고 정면 구도에서는 같은 답을 낸다', () => {
    const vp0 = axisDir(an2, 'vp0'), vp1 = axisDir(an2, 'vp1')
    const axis2 = cubeBasis(an2)!
    const screen2 = screenBoard(DRAW_POSE)
    const axisSeq = press(axis2, DRAW_POSE, times('right', 4))
    const scrSeq = press(screen2, DRAW_POSE, times('right', 4))

    const axisBest = axisSeq.map(p => Math.min(alignDeg(p, vp0), alignDeg(p, vp1)))
    const scrBest = scrSeq.map(p => Math.min(alignDeg(p, vp0), alignDeg(p, vp1)))
    const boardGap2 = axisSeq.map((p, i) => poseGapDeg(p, scrSeq[i]!))

    // 축 판은 통과, 화면 판은 **같은 게이트에서 실패**한다(그것이 이 검사의 반증 조건이다)
    expect(Math.max(...axisBest)).toBeLessThan(CUBE_ALIGN_MAX_DEG)
    expect(Math.min(...scrBest)).toBeGreaterThan(CUBE_ALIGN_MAX_DEG)

    // ── 정면 구도(1점) — **두 판이 같은 답을 낸다**. 그래서 여기서 시험하면 안 잰다.
    const axis1 = cubeBasis(an1)!
    const screen1 = screenBoard(DRAW_POSE)
    const a1 = press(axis1, DRAW_POSE, times('right', 4))
    const s1 = press(screen1, DRAW_POSE, times('right', 4))
    const boardGap1 = a1.map((p, i) => poseGapDeg(p, s1[i]!))
    for (const g of boardGap1) expect(g).toBeLessThan(CUBE_ALIGN_MAX_DEG)
    const vp0_1 = axisDir(an1, 'vp0')
    const a1Best = a1.map(p => alignDeg(p, vp0_1))
    const s1Best = s1.map(p => alignDeg(p, vp0_1))

    ledger['gate3_falsification'] = {
      what: (
        '**「화면 기준」 판을 실제로 돌린다.** 같은 90° 기제에 틀만 갈아 끼운다 — '
        + '축 판 = cubeBasis(vp0·세로·외적) · 화면 판 = 초기 카메라의 right·up·back.'
      ),
      initial_screen_offset_deg: {
        two_point_vs_vp0: r6(angDeg(fwdOf(DRAW_POSE), vp0)),
        two_point_vs_vp1: r6(angDeg(fwdOf(DRAW_POSE), vp1)),
        one_point_vs_vp0: r6(angDeg(fwdOf(DRAW_POSE), vp0_1)),
        note: '2점의 초기 화면은 축에서 **돌아가 있다**. 1점은 0이다 — 그것이 함정의 구조다.',
      },
      two_point_rotated_fixture: {
        axis_board_align_deg: axisBest.map(r6),
        screen_board_align_deg: scrBest.map(r6),
        board_gap_deg: boardGap2.map(r6),
        verdict: '축 판 통과 · 화면 판 **실패**(문 0.01°)',
      },
      one_point_frontal_fixture: {
        axis_board_align_deg: a1Best.map(r6),
        screen_board_align_deg: s1Best.map(r6),
        board_gap_deg: boardGap1.map(r6),
        verdict: '두 판이 **같다** — 정면 구도로 시험하면 아무것도 못 잰다(D-3의 함정)',
      },
    }
  })

  it('게이트 ④ 상/하 90°가 정확한 평면·저면에 닿는다', () => {
    const rows: Record<string, unknown>[] = []
    for (const [name, an] of [['2점', an2], ['1점', an1]] as const) {
      const basis = cubeBasis(an)!
      const up1 = press(basis, DRAW_POSE, ['up'])[0]!
      const down1 = press(basis, DRAW_POSE, ['down'])[0]!
      const upDown = press(basis, DRAW_POSE, ['up', 'down'])[1]!
      // 평면 = 정확히 내려다본다(시선 = 세계 −Y) · 저면 = 정확히 올려다본다
      const planDeg = angDeg(fwdOf(up1), v3(0, -1, 0))
      const bottomDeg = angDeg(fwdOf(down1), v3(0, 1, 0))
      expect(planDeg).toBeLessThan(CUBE_ALIGN_MAX_DEG)
      expect(bottomDeg).toBeLessThan(CUBE_ALIGN_MAX_DEG)
      // 평면에서 다시 내리면 **입면**이다(수평 시선) — 지평선이 돌아온다
      const backLevelDeg = Math.abs(Math.asin(clamp1(fwdOf(upDown).y))) * DEG
      expect(backLevelDeg).toBeLessThan(CUBE_ALIGN_MAX_DEG)
      rows.push({
        fixture: name,
        plan_deg: r6(planDeg), bottom_deg: r6(bottomDeg),
        plan_then_down_pitch_deg: r6(backLevelDeg),
        // 평면에서의 화면 위 — 틀의 가로축 위에 정확히 앉는가(롤이 축에 물려 있다)
        plan_screen_up_to_nearest_h_axis_deg: r6(Math.min(
          ...an.axes.filter(a => Math.abs(a.dir.y) < 1e-9)
            .map(a => Math.acos(clamp1(Math.abs(dot3(upOf(up1), a.dir)))) * DEG))),
      })
    }
    ledger['gate4_plan_bottom'] = {
      what: '상/하 화살표가 정확한 평면(시선 −Y)·저면(시선 +Y)에 닿는가 — 각 오차(도)',
      rows,
    }
  })

  it('게이트 ⑤ 여섯 면이 모두 도달 가능하다 (1점 구도 포함)', () => {
    const TURNS: CubeTurn[] = ['left', 'right', 'up', 'down']
    const rows: Record<string, unknown>[] = []
    for (const [name, an] of [['2점', an2], ['1점', an1]] as const) {
      const basis = cubeBasis(an)!
      const key = (o: FaceOrient) => `${o.back.x},${o.back.y},${o.back.z}`
      // 너비 우선 — 면(back)까지의 최단 화살표 수
      const start = orientIn(basis, DRAW_POSE)
      const seen = new Map<string, number>([[key(start), 0]])
      let front: FaceOrient[] = [start]
      for (let d = 1; d <= 4 && seen.size < 6; d++) {
        const next: FaceOrient[] = []
        for (const o of front) for (const t of TURNS) {
          const n = turnOrient(o, t)
          if (!seen.has(key(n))) { seen.set(key(n), d); next.push(n) }
          else next.push(n)
        }
        front = next.slice(0, 64)
      }
      expect(seen.size).toBe(6)
      rows.push({ fixture: name, faces: seen.size, depth_by_face: Object.fromEntries(seen) })
    }
    ledger['gate5_reachability'] = {
      what: '초기 화면에서 화살표만으로 여섯 면(+VP1·−VP1·+VP2·−VP2·위·아래)에 닿는가 — 면별 최단 누름 수',
      rows,
      corners_and_edges: '**넣지 않았다**(지시: 범위를 안 넓힌다). 화살표 경로는 면만 쓴다.',
    }
  })

  it('화살표 그림쇠 — 그리기와 판정이 같은 출처 · 큐브 반경 안', () => {
    const layout = { cx: 1090, cy: 60, size: 80 }
    const arrows = cubeArrows(layout)
    expect(arrows.length).toBe(4)
    const hits: Record<string, string | null> = {}
    for (const a of arrows) {
      // 삼각형 무게중심이 그 화살표로 잡힌다
      const g = a.poly.reduce((s, p) => ({ x: s.x + p.x / 3, y: s.y + p.y / 3 }), { x: 0, y: 0 })
      hits[a.turn] = arrowHit(layout, g)
      expect(arrowHit(layout, g)).toBe(a.turn)
      // 바깥 끝이 `input.ts`가 이미 쓰는 «반경 size» 문 안이다 — 문을 새로 안 만든다
      expect(Math.hypot(a.tip.x - layout.cx, a.tip.y - layout.cy)).toBeLessThan(layout.size)
    }
    // 큐브 한가운데(면 판정 자리)는 화살표가 아니다 — 대역이 안 겹친다
    expect(arrowHit(layout, { x: layout.cx, y: layout.cy })).toBeNull()
    expect(arrowHit(layout, { x: layout.cx + layout.size * 0.3, y: layout.cy })).toBeNull()
    ledger['arrows'] = {
      what: '화살표 넷의 대역 — 반경 배수는 `cubeLayout.size`에서 유도한다(#88: px 상수로 안 적는다)',
      ratios: { r0: C.CUBE_ARROW_R0, r1: C.CUBE_ARROW_R1, half: C.CUBE_ARROW_HALF },
      at_size_80_px: { r0: C.CUBE_ARROW_R0 * 80, r1: C.CUBE_ARROW_R1 * 80, half: C.CUBE_ARROW_HALF * 80 },
      hits,
      center_is_not_arrow: true,
    }
  })

  it('그림쇠 자리 — 화살표 뻗침에서 유도한다(#88) · 종전 바깥 경계를 그대로 지킨다', () => {
    const L = cubeLayoutFor(W)
    const reach = L.size * C.CUBE_ARROW_R1
    // 바깥 경계 = 종전 큐브가 실제로 비워 두던 자리(오른쪽 W−56 · 위 6)
    expect(L.cx + reach).toBeCloseTo(W - C.CUBE_MARGIN_RIGHT_PX, 9)
    expect(L.cy - reach).toBeCloseTo(C.CUBE_MARGIN_TOP_PX, 9)
    // 화살표 안쪽 끝이 큐브 실루엣(반경 0.675·size) **밖**이다 — 대역이 안 겹친다
    const bodyR = L.size * 0.675
    expect(L.size * C.CUBE_ARROW_R0).toBeGreaterThan(bodyR)
    // 종전 클릭 자리(cx W−110 · cy 60 — flow.spec이 누르는 점)는 **여전히 면**이다
    expect(arrowHit(L, { x: W - 110, y: 60 })).toBeNull()
    expect(Math.hypot(W - 110 - L.cx, 60 - L.cy)).toBeLessThan(bodyR)

    ledger['layout'] = {
      what: '그림쇠 자리 — `cubeLayoutFor(W)` 한 자리에서만 계산한다(state.ts·main.ts가 각자 적던 것 · #54)',
      at_W: W, cx: L.cx, cy: L.cy, size: L.size, arrow_reach_px: reach,
      body_radius_px: bodyR,
      outer_right_px: L.cx + reach, outer_top_px: L.cy - reach,
      previous: { cx: W - 110, cy: 60, outer_right_px: W - 110 + bodyR, outer_top_px: 60 - bodyR },
      why_moved: (
        '⚠⚠ **초판은 여기서 걸렸다(D-1: 표식이 잡았다).** 화살표를 종전 자리(cx W−110 · cy 60)에 '
        + '반경 0.70~0.92로 두자 `elementFromPoint`가 오른쪽에서 `sidebar-body`·`btn-draw-view`를, '
        + '위에서 `null`(창 밖)을 냈다 — **그려지는데 안 눌리는** 상태다(PITFALLS #87: 겹친다 ≠ 가린다). '
        + '고친 방향은 z도 자리 나눔도 아니라 **자리를 뻗침에서 유도**하는 것이다: 바깥에 닿는 것이 '
        + '큐브 꼭짓점에서 화살표 끝으로 바뀌었으니 큐브가 그만큼 물러난다(자리를 안 늘렸다 · #88).'
      ),
      e2e_check: 'e2e/turn31.spec.ts ① — 네 화살표 끝에서 `elementFromPoint`가 전부 `ink`(dpr 1·2).',
    }
  })

  it('전환은 보간한다 — 즉시 튀지 않고 0.3초 뒤 **정확히** 목표에 앉는다', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380)
    const app: App = s.app
    let t = 1000
    const al = createAutoLevel(app, () => t)
    const basis = cubeBasis(app.lift.an)!
    const pivot = orbitPivot(app)
    const dist = Math.max(1, Math.hypot(
      app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z))
    const to = poseForOrient(basis, turnOrient(orientIn(basis, app.pose), 'right'), pivot, dist)
    const from: CamPose = { p: { ...app.pose.p }, q: { ...app.pose.q } }

    al.glide(to)
    const mid: number[] = []
    expect(poseGapDeg(app.pose, from)).toBeLessThan(1e-9)   // 첫 프레임은 아직 출발점
    for (let i = 0; i < 40 && al.folding(); i++) {
      t += 30
      al.tick()
      mid.push(r6(poseGapDeg(app.pose, from)))
    }
    // 중간 프레임이 실제로 있었다(즉시 점프가 아니다)
    expect(mid.length).toBeGreaterThan(3)
    expect(mid.some(g => g > 1 && g < 89)).toBe(true)
    // 끝에서 **정확히** 목표(보간 끝값이 아니라 목표 그 자체)
    expect(poseGapDeg(app.pose, to)).toBeLessThan(1e-9)
    expect(al.folding()).toBe(false)

    ledger['interpolation'] = {
      what: '90° 전환의 프레임별 진행(출발점에서의 각, 도) — 30 ms 간격',
      anim_ms: TURN_ANIM_MS,
      fold_anim_ms: C.FOLD_ANIM_MS,
      frames_deg: mid,
      lands_exactly_deg: r6(poseGapDeg(app.pose, to)),
      note: '접기와 **같은 `anim` 슬롯**이라 둘이 못 겹친다(#54). 끌기(`grab`)가 취소한다.',
    }
  })

  it('평면에서도 그리기를 막지 않는다 — 새 기제가 없다', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(500, 500, 500, 380)
    const app: App = s.app
    const before = app.doc.strokes.length
    const basis = cubeBasis(app.lift.an)!
    const pivot = orbitPivot(app)
    const plan = poseForOrient(basis, turnOrient(orientIn(basis, app.pose), 'up'), pivot, 500)
    setPose(app, plan)
    expect(Math.abs(fwdOf(app.pose).y + 1)).toBeLessThan(1e-9)   // 정확히 평면
    const st = s.draw(400, 300, 700, 320)                        // 평면에서 한 획
    expect(st).not.toBeNull()
    expect(app.doc.strokes.length).toBe(before + 1)
    ledger['plan_drawing'] = {
      what: '정확히 평면(지평선 없음)에서도 획이 들어간다 — 축이 안 풀리면 미배치로 남을 뿐이다',
      forward_y: r6(fwdOf(app.pose).y),
      stroke_accepted: true,
      lifted: app.lift.lifted.has(st!.id),
      unplaced_is_waiting: '미배치 = 실패가 아니라 대기(A-3 · 개정 2 §9.1). 새 기제를 안 만들었다.',
    }
  })

  it('원장', () => {
    const payload = JSON.stringify({
      what: 'web2-31 1번 — 뷰 큐브 90° 화살표의 **기준 틀이 화면이 아니라 축**임을 두 판을 나란히 돌려 잰다.',
      canonical_command: 'LEDGER=1 npx vitest run test/turn31.test.ts',
      why: (
        '2점 투시의 초기 화면은 **이미 축에 대해 돌아가 있다**(이 픽스처에서 vp0과 37.76°). '
        + '그 화면을 큐브의 정면으로 잡으면 90°씩 돌려도 영원히 진짜 입면에 못 닿는다 — '
        + '사용자가 극초기부터 보고한 문제다. 틀을 정하는 것은 축(vp0·vp1·세로)이고 '
        + '초기 카메라는 그 틀 «안의 한 위치»일 뿐이다.'
      ),
      design: {
        frame: 'cubeBasis(an) = norm(vp0 축) · (0,1,0) · 그 외적. **이미 있던 함수다** — 31-1은 그 틀 위에 90° 화살표만 얹는다.',
        quantize: '지금 자세의 back·up을 틀의 **정수 축 벡터**로 읽는다(orientIn). 90° 회전은 그 정수 벡터의 외적이라 오차가 안 쌓인다.',
        turns: '좌/우 = 틀의 세로축 둘레 · 상/하 = 화면 오른쪽(up × back) 둘레. 면만 쓴다 — **모서리·꼭짓점은 안 넣었다**(지시: 범위를 안 넓힌다).',
        interpolation: `autolevel의 anim 슬롯으로 ${TURN_ANIM_MS} ms 보간. 접기와 한 슬롯이라 둘이 못 겹친다.`,
      },
      fixtures: {
        two_point: { doc: 'test/fixtures.ts constructedDoc()', W, H, vps: an2.vps.map(v => v.x), f: r6(an2.f!), fSource: an2.fSource },
        one_point: { doc: '지평선 + 소실점 찍기(800,400) + 화면 수평 획', W, H, vps: an1.vps.map(v => v.x), p1Locked: an1.p1Locked, f: r6(an1.f!), fSource: an1.fSource },
        why_two: 'D-3 — 「축 기준」은 **돌아가 있는 구도로만** 반증된다. 정면 구도는 두 판이 같은 답을 내므로 거저 통과한다(gate3가 그 수를 낸다).',
      },
      constants: {
        CUBE_ARROW_R0: C.CUBE_ARROW_R0,
        CUBE_ARROW_R1: C.CUBE_ARROW_R1,
        CUBE_ARROW_HALF: C.CUBE_ARROW_HALF,
        CUBE_ALIGN_MAX_DEG,
        TURN_ANIM_MS,
        FOLD_ANIM_MS: C.FOLD_ANIM_MS,
      },
      constants_note: (
        '새 임계는 `CUBE_ALIGN_MAX_DEG`(지시 문면 0.01°) 하나이고 나머지는 «크기의 배수»다 — '
        + 'px로 안 적는다(#88: 큐브를 키우는 사람이 여기를 볼 이유가 없다). '
        + `TURN_ANIM_MS는 **숫자를 새로 안 짓고** FOLD_ANIM_MS(${C.FOLD_ANIM_MS})를 가리킨다(#54).`
      ),
      ...ledger,
      gate: {
        for: 'web2-31 1번 — 좌/우 4회 항등 · 축 정렬 · **반증(화면 판)** · 평면/저면 · 여섯 면 도달',
        registered: [
          '좌/우 90° × 4 = 항등 (회전행렬 최대 어긋남 0.000000°, 위치 차 0)',
          '네 자세가 vp0·vp1 축과 정렬 (전부 0.000000° < 0.01°) · vp0에 둘 · vp1에 둘',
          '**반증**: 같은 기제에 「화면 기준」 틀을 끼우면 같은 게이트가 37.760186°로 빨개진다',
          '**함정의 증거**: 정면(1점) 구도에서는 두 판의 포즈 차가 0.000000° — 거기서 시험하면 안 잰다',
          '상/하 90°가 정확한 평면(0.000000°)·저면(0.000000°)에 닿고, 평면에서 내리면 피치 0으로 돌아온다',
          '1점·2점 모두 여섯 면이 도달 가능하다',
          '평면에서도 획이 들어간다(새 기제 없음)',
        ],
        reachability: (
          '**틀을 화면으로 바꾸면 빨개진다.** `screenBoard(DRAW_POSE)`를 제품의 `cubeBasis` 자리에 '
          + '끼우면 게이트 ②의 정렬 각이 0 → **37.760186°**(vp0 기준 최소)로 뛴다. '
          + 'gate3 블록이 그 판을 **실제로 돌린 값**이다(못 실패시키는 검사는 안 잰 것이다 — D-3). '
          + '⚠ 그 반증은 **2점(돌아간) 픽스처에서만** 성립한다 — 1점에서는 두 판의 차가 0.000000°다.'
        ),
        falsification_executed: {
          what: (
            '**말이 아니라 실행이다**(D-3). 제품의 `cubeBasis`를 「초기 화면을 정면으로 잡는 판」'
            + '(X,Y,Z = 세계 축 = DRAW_POSE의 right·up·back)으로 **실제로 갈아 끼우고** 이 파일을 돌렸다.'
          ),
          patch: "src/core/viewcube.ts cubeBasis → return { X:(1,0,0), Y:(0,1,0), Z:(0,0,1) }",
          result: '9칸 중 **4칸 실패**(게이트 ①·②·③ + 원장). ②는 `expected 37.76124390703503 to be less than 0.01`.',
          red_gates: ['gate1_cycle', 'gate2_axis_align', 'gate3_falsification'],
          green_gates_note: (
            '⚠ **게이트 ④(평면·저면)와 ⑤(여섯 면 도달)는 그 판에서도 초록이었다** — 두 판이 '
            + '같은 정수 기제를 쓰므로 «닫히는가·닿는가»는 틀과 무관하다. **그 둘은 이 항목의 주장을 '
            + '안 잰다**(#86의 형태: 축이 갈리지 않는 곳에서 돌린 팔은 아무것도 안 잰다). '
            + '판을 가르는 것은 ①②③뿐이고, 그래서 반증 조건도 거기에 붙였다.'
          ),
          reverted: true,
        },
        reachability_source: 'gate3_falsification/two_point_rotated_fixture/screen_board_align_deg',
        reachability_value: (ledger['gate3_falsification'] as { two_point_rotated_fixture: { screen_board_align_deg: number[] } })
          .two_point_rotated_fixture.screen_board_align_deg,
      },
      selfcheck_flags_known: {
        exact_zero_angles: (
          '⚠ 「오차류 지표가 **정확히 0**」·「카운터 0」이 여러 줄 잡힌다(gate1~gate4). '
          + '**설계 보장이 맞다**(CLAUDE.md §5.1 자기참조 유형 3): 90° 회전이 «틀 안의 정수 축 벡터»의 '
          + '외적 하나라 정렬 오차가 구성상 0이고, f나 구도가 무엇이든 0이다. **그래서 이 0 자체는 '
          + '아무것도 재지 않는다** — 그 사실을 여기 적는다. '
          + '⚠⚠ 다만 `CUBE_ALIGN_MAX_DEG` 문을 **거는 것은 맞다**: 이 문이 가르는 상대는 「같은 기제에 '
          + '틀만 갈아 끼운 판」이고 그 판은 37.760186°로 **실제로 넘었다**(gate.falsification_executed — '
          + '제품을 고쳐 4칸을 빨갛게 만들어 봤다). 문의 판별력은 0이 아니라 그 37.76°가 준다.'
        ),
        one_point_zeros: (
          '1점 픽스처의 `board_gap_deg` 0 넷도 보장이다 — **그것이 이 항목의 논지**다(정면 구도에서는 '
          + '두 판이 같은 답을 내므로 거기서 시험하면 아무것도 못 잰다). 0이 결함이 아니라 **주장**인 자리다.'
        ),
        constants_snapshot_absent: (
          '⚠ `constantsSnapshot()` / `metric_defs`가 없다 — **web2 라인 전체의 구멍**이고 이 원장만의 것이 '
          + '아니다(90건 중 85건이 web2다). 그 기계는 `web/test/constants.ts`에만 있다. 이 회차는 상수를 '
          + '`constants` 블록에 그대로 적는 것까지만 한다 — 기계를 세우는 것은 web2 전역 작업이라 범위 밖이다.'
        ),
      },
      pitfalls: ['#88', '#87', '#86', '#54', '#42', '#40'],
      pitfalls_note: (
        '#88 — 화살표 크기를 px 상수로 안 적고 `cubeLayout.size`의 배수로 유도한다(큐브를 키우는 쪽과 결합이 코드에 보인다). '
        + '#87 — 새 DOM을 안 만들었다(캔버스 그림쇠라 쌓임 맥락이 없다). 겹침은 «큐브 면 대역 vs 화살표 대역»으로 재고 그 값이 `arrows` 블록이다. '
        + '#86 — 값 축(정렬 각)만이 아니라 **판 축**(어느 틀에서 돌았나)을 따로 잰다. 두 판의 포즈 차가 그 축이다. '
        + '#54 — 새 숫자를 안 짓는다(TURN_ANIM_MS = FOLD_ANIM_MS) · 포즈를 움직이는 슬롯이 하나다. '
        + '#42 — 착수 표의 번호를 완료 시 다시 대조했다(web2/NOTES.md 31-1 절).'
      ),
    }, null, 2)
    const out = resolve(HERE, '../../stage0/out/turn31_web2.json')
    if (process.env.LEDGER === '1') {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, payload)
      console.log(`[원장] ${out}`)
    } else {
      console.log('[31-1] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
    expect(payload.length).toBeGreaterThan(0)
  })
})
