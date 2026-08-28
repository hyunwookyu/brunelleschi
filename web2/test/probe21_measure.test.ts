// **web2-21 1부 원장** — 재현 둘. ⚠⚠ 재기만 한다(지시 문면 — 수리는 갈래가 정한다).
//
// 1-a 개구부: 벽 사각(축 스냅) 안에 **어디에도 닿지 않는** 창 사각(축 스냅)을 긋는다.
//   창 네 획이 `lift.lifted`에 드는가. 안 들면 무산 사유를 **종류별로**(waitWhy +
//   web2-16 2-b의 touchStats 계수). 손 오차를 태운다(#68 — session.draw 경로에 지터).
//   D-5: 지터 시드 × 창 위치 두 축. #69 ㉣: **닿는 창(대조 칸)**이 lifted>0을 내는 것으로
//   「0」이 하네스 무능이 아님을 세운다.
//
// 1-b 스케일 기준 획: 겹의 획에 첫 치수를 주고 그 겹을 껐다 켜며 `mmPerUnit`을 값으로.
//   지시의 원인 서술(「다음 치수 획으로 물러난다」)은 후보다(D-4) — 실측이 정본.
//   ⚠ 전/후 비교 수리(#71 ㉠): 수리 전 실행 판은 `scale_layer_web2_before.json`으로
//   옮기고 재실행한다(#73 ㉡ 부기의 규율 그대로).
//
// 원장: stage0/out/opening21_web2.json · stage0/out/scale_layer_web2.json
//   npx vitest run test/probe21_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session, type Session } from './session'
import { addLayer, setLayerOn, setDimension } from '../src/app/state'
import { axisOfStroke, liftAll } from '../src/core/lift'
import { DRAW_POSE } from '../src/core/camera'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import { sub3, len3 } from '../src/core/vec'

const W = 1200, H = 800
const outDir = resolve(__dirname, '../../stage0/out')

/** 소실점 vp0=(900,400)을 지나는 직선 위의 y — 픽스처가 스스로 맞춘다(손 산술 금지) */
const vpY = (x: number, x0: number, y0: number): number =>
  400 + ((y0 - 400) / (x0 - 900)) * (x - 900)

/** 작도 완료 + 벽 사각(vp0·V 평면) — 전부 앱 경로(session)로, 지터를 태워 그린다.
 *  벽: 지면 모서리 (500,500)→(800,·) · 세로 둘 · 윗변(vp0 방향). 높이가 있는 모델이 된다. */
function wallScene(jit: () => number) {
  const s = session(W, H)
  const j = (v: number) => v + jit()
  // 작도 — 지평선 + 같은 모서리에서 뻗는 깊이선 둘(카메라 닫힘: vps 2)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)          // → vp0 (900,400)
  s.draw(500, 500, 400, 475)          // → vp1 (100,400)
  const wall: (ReturnType<Session['draw']>)[] = []
  wall.push(s.draw(j(500), j(500), j(800), j(vpY(800, 500, 500))))   // 지면 모서리 → vp0
  wall.push(s.draw(j(500), j(500), j(500), j(340)))                  // 왼 세로
  wall.push(s.draw(j(800), j(vpY(800, 500, 500)), j(800), j(vpY(800, 500, 340))))  // 오른 세로
  wall.push(s.draw(j(500), j(340), j(800), j(vpY(800, 500, 340))))   // 윗변 → vp0
  return { s, wall }
}

/** 창 사각 — 벽 안쪽, 모든 가장자리에서 오스냅 반경(8px)+지터보다 멀리.
 *  yBot·yTop은 x=xL에서의 y(둘 다 vp0 방향 변). touch=true면 왼쪽을 벽 왼 세로에 붙인다
 *  (대조 칸 — #69 ㉣: 닿으면 올라간다는 것을 같은 하네스가 증명한다).
 *  획마다 commit 직후의 touchLast를 찍는다(2차 [11] — aNot3d가 «어느 획의 커밋»에서
 *  났는지 수가 아니라 목록으로). */
function drawWindow(s: Session, jit: () => number, xL: number, xR: number, yBot: number, yTop: number) {
  const j = (v: number) => v + jit()
  const win: (ReturnType<Session['draw']>)[] = []
  const touches: ({ touched: number; aNot3d: number } | null)[] = []
  const push = (w: ReturnType<Session['draw']>) => {
    win.push(w)
    const t = s.app.touchLast
    touches.push(t ? { touched: t.touched, aNot3d: t.missed.aNot3d } : null)
  }
  push(s.draw(j(xL), j(yBot), j(xR), j(vpY(xR, xL, yBot))))      // 아랫변 → vp0
  push(s.draw(j(xL), j(yBot), j(xL), j(yTop)))                   // 왼 세로
  push(s.draw(j(xR), j(vpY(xR, xL, yBot)), j(xR), j(vpY(xR, xL, yTop)))) // 오른 세로
  push(s.draw(j(xL), j(yTop), j(xR), j(vpY(xR, xL, yTop))))      // 윗변 → vp0
  return { win, touches, nominalStart: { x: xL, y: yBot } }
}

describe('1-a — 개구부가 3D로 올라가는가 (재기만 한다)', () => {
  it('벽 사각 + 안 닿는 창 사각 — 지터×위치 스윕 + 닿는 대조 칸', () => {
    // 지터: 0(무오차) + 시드 여섯(±3px 균일 — 오스냅 반경 8 안, 벽·창 간격 12.6px 밖)
    const seeds = [0, 7, 12, 33, 51, 77, 104]
    // 창 위치 두 곳(D-5) — 벽 가운데·아래쪽. 간격 산술은 파일 머리(≥12.6px − 지터 3)
    // ⚠ 간격 산술(#69 ㉣의 반대 방향 — «안 닿는» 전제가 실제로 서는가): 기울어진 변까지의
    // 최소 간격이 오스냅 반경 8 + 지터 3 = 11px을 넘어야 한다. 첫 판의 low(yBot=468)는
    // 아랫변-벽 간격이 x=690에서 9.2px라 지터가 오스냅 안으로 들어가 «닿은 창»이 됐다
    // (seed 33·51에서 2·4획 승격 — 전제 위반이지 개구부 경로가 아니다. NOTES 기록).
    const positions = [
      { name: 'mid', xL: 580, xR: 700, yBot: 455, yTop: 385 },   // 최소 간격 15.6
      { name: 'low', xL: 570, xR: 680, yBot: 462, yTop: 412 },   // 최소 간격 13.7
    ]
    type Cell = {
      seed: number; jitter: 'none' | 'rng32'; pos: string
      /** 창 아랫변 확정 시작점 − 명목 (xL,yBot) — 지터가 잉크에 실제로 실렸는가(2차 [7]).
       *  시작점은 오스냅 대상이 없어 지터가 그대로 남는 자리다(축 스냅은 끝만 옮긴다). */
      carriedJitter: { dx: number; dy: number }
      /** 획별 커밋의 touchLast(touched·aNot3d) — 사건이 어느 획에서 났는지(2차 [11]) */
      touchByStroke: ({ touched: number; aNot3d: number } | null)[]
      wallLifted: number; winLifted: number
      /** 확정된 창 끝점 ↔ **승격된**(lifted) 다른 획의 확정 2D 선분 사이 최소 거리(px).
       *  «안 닿는다»의 전제를 명목 산술이 아니라 **칸마다 실측**으로 세운다(1차 리뷰 [1] —
       *  지터가 벽·창 양쪽에 실리므로 상대 변위는 최대 2·3√2 ≈ 8.49px라 명목 간격
       *  13.7로는 최악을 못 막는다. 판정은 이 실측이 진다). */
      minGapPx: number
      perStroke: { axis: string | null; lifted: boolean; why: string; whyProbe: string }[]
      touchStats: Record<string, number>
    }
    /** 점-선분 거리(2D) — 하네스 전용(판정은 앱 코드가 아니라 전제 검증이다) */
    const dSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax, dy = by - ay
      const L2 = dx * dx + dy * dy
      const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }
    const measureCell = (s: Session, dw: ReturnType<typeof drawWindow>, seed: number, posName: string,
      wall: (ReturnType<Session['draw']>)[]): Cell => {
      const win = dw.win
      const winIds = new Set(win.filter(Boolean).map(w => w!.id))
      // 창 끝점 ↔ 창 밖 승격 획(벽·깊이선)의 확정 2D — near 오스냅이 닿을 수 있던 거리
      let minGap = Infinity
      for (const w of win) {
        if (!w) continue
        for (const [id2] of s.app.lift.lifted) {
          if (winIds.has(id2)) continue
          const o = s.app.lift.strokes.get(id2)!
          for (const p of [w.a, w.b]) {
            minGap = Math.min(minGap, dSeg(p.x, p.y, o.a.x, o.a.y, o.b.x, o.b.y))
          }
        }
      }
      const perStroke = win.map(w => {
        if (!w) return { axis: null, lifted: false, why: 'null', whyProbe: 'null' }
        const lifted = s.app.lift.lifted.has(w.id)
        const why = s.app.lift.waitWhy.get(w.id) ?? (lifted ? 'lifted' : 'none')
        // 사유 미상(none — waitWhy 규약이 소실점 축만 다룬다)의 표식(1차 리뷰 [4] · #69 ㉡):
        // «후보도 못 된 채 죽었는가»를 하네스가 직접 잰다 — 이 획의 끝점에서 승격 기하까지의
        // 최소 거리가 연결 반경 밖이면 씨앗 없음(noSeed)이 그 사유다.
        let probe = lifted ? 'lifted' : why
        if (!lifted) {
          let d = Infinity
          for (const [id2] of s.app.lift.lifted) {
            if (winIds.has(id2)) continue
            const o = s.app.lift.strokes.get(id2)!
            for (const p of [w.a, w.b]) d = Math.min(d, dSeg(p.x, p.y, o.a.x, o.a.y, o.b.x, o.b.y))
          }
          probe = `${why === 'none' ? 'noSeed' : why}(d=${d.toFixed(1)})`
        }
        return {
          axis: axisOfStroke(s.app.lift.an, DRAW_POSE, w.a, w.b),
          lifted, why, whyProbe: probe,
        }
      })
      return {
        seed, jitter: seed === 0 ? 'none' : 'rng32', pos: posName,
        carriedJitter: {
          dx: Math.round((win[0]!.a.x - dw.nominalStart.x) * 100) / 100,
          dy: Math.round((win[0]!.a.y - dw.nominalStart.y) * 100) / 100,
        },
        touchByStroke: dw.touches,
        wallLifted: wall.filter(w => w && s.app.lift.lifted.has(w.id)).length,
        winLifted: perStroke.filter(p => p.lifted).length,
        minGapPx: Math.round(minGap * 10) / 10,
        perStroke,
        touchStats: { ...s.app.touchStats },
      }
    }
    const mkRng = (seed: number) =>
      seed === 0 ? () => 0 : (() => { const r = rng32(seed); return () => (r() * 2 - 1) * 3 })()
    const cells: Cell[] = []
    for (const pos of positions) {
      for (const seed of seeds) {
        const rng = mkRng(seed)
        const { s, wall } = wallScene(rng)
        expect(wall.every(w => w !== null), `벽 획 확정(seed ${seed})`).toBe(true)
        const dw = drawWindow(s, rng, pos.xL, pos.xR, pos.yBot, pos.yTop)
        expect(dw.win.every(w => w !== null), `창 획 확정(seed ${seed})`).toBe(true)
        cells.push(measureCell(s, dw, seed, pos.name, wall))
      }
    }
    // 대조 칸(#69 ㉣) — 같은 창인데 왼쪽 변을 벽 왼 세로(x=500)에 붙인다. 닿으면 연결
    // 리프팅이 열리므로 winLifted>0이어야 한다 — 이것이 실패하면 하네스가 무능한 것이다.
    // **두 위치 각각**에 둔다(1차 리뷰 [14] — low의 0/4가 하네스 무능이 아님도 low 대조가 진다).
    const control: Cell[] = []
    for (const pos of positions) {
      for (const seed of [0, 7]) {
        const rng = mkRng(seed)
        const { s, wall } = wallScene(rng)
        const dw = drawWindow(s, rng, 500, pos.xR, pos.yBot, pos.yTop)   // xL=500 — 벽 왼 세로 위
        control.push(measureCell(s, dw, seed, `touching-${pos.name}`, wall))
      }
    }

    const whyCounts: Record<string, number> = {}
    for (const c of cells) for (const p of c.perStroke) whyCounts[p.why] = (whyCounts[p.why] ?? 0) + 1
    const aNot3dDist: Record<string, number> = {}
    for (const c of cells) { const k = String(c.touchStats.aNot3d); aNot3dDist[k] = (aNot3dDist[k] ?? 0) + 1 }

    const ledger = {
      run: {
        note: 'web2-21 1-a — 개구부(안 닿는 창)가 lift.lifted에 드는가. 재기만 한다(수리는 갈래 판정). '
          + '정본 명령: npx vitest run test/probe21_measure.test.ts',
        date: '2026-08-28',
        fixture: '벽=지면 모서리+세로 둘+윗변(vp0·V 평면, 앱 경로·축 스냅) · 창=벽 안 사각 '
          + '· 지터 ±3px(시드 rng32 — 벽·창 양쪽 입력에 실린다) × 위치 2 · 대조=왼 변을 벽 세로에 '
          + '붙임(#69 ㉣ — 두 위치 각각)',
        determinism: '이 원장은 결정론이다(고정 시드·시간 필드 없음) — 전량 실행이 다시 써도 같은 '
          + '바이트다(#71 ㉠의 유보가 이 원장에는 안 걸린다. 확인: 두 실행 diff 0 — NOTES 1부)',
        constants: { OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX, MERGE_RATIO: C.MERGE_RATIO, LINE_MATCH_PX: C.LINE_MATCH_PX },
      },
      // web2-23(은선)의 게이트가 이 원장이다(지시 1-a ⚠⚠ — 이름 있는 게이트 블록 #35 ·
      // registered/reachability는 #40 — 2차 리뷰 [3]으로 채웠다)
      gate: {
        for: 'web2-23 은선 — 0부 게이트',
        verdict: '미통과 — 갈래 ③(원인이 크다 · 안 고쳤다)',
        measured: '안 닿는 창 14칸 전 칸 0/4 · 닿는 대조(두 위치 × 두 시드 = 4칸) 전부 4/4',
        registered: { pass_needs: 'winLifted > 0 (안 닿는 창이 올라간다)', osnap_radius_px: C.OSNAP_RADIUS_PX },
        reachability_value: 4,
        reachability_source: '/control/0/winLifted — 닿는 창은 같은 하네스에서 4/4가 나온다(#69 ㉣)',
        scope: '⚠ 국면 한정 — 벽에 «높이가 있는» 장면 하나다(hasHeight 문이 발화하는 국면). '
          + '지면 국면(높이 0)의 소실점 축 획은 web2-17 4부부터 올라간다(DEFERRED 그 행) — '
          + '이 게이트가 재는 것은 «높이 위의 안쪽 고리»다',
        note: '판정 근거의 측정/코드 구분(2차 [2]로 정밀화): 계수로 발화한 문은 hasHeight'
          + '(소실점 축 두 변)뿐이다. 수직 두 변의 whyProbe=noSeed는 «안 닿는 창» 전제'
          + '(minGapPx>8 단언)의 **구성상 귀결**이고 d 값이 그 실측이다 — cells 격자 안에서 '
          + '다른 값이 나올 수 없다(대역 8<d≤반경의 칸은 전제 위반이라 하네스가 거부한다). '
          + '확대 규칙(pendingAllVp)은 수직 대기가 섞여 아예 안 도는 코드 경로 사실이라 계수가 없다',
      },
      margin_arith: {
        nominal_min_gap: { mid: 15.6, low: 13.7 },
        nominal_is_vertical: '명목은 수직(y) 간격이고 실측 minGapPx는 **수선 거리**다 — 기울기 '
          + '0.25의 벽 아랫변에서 cos(atan 0.25)=0.970배(무오차 mid 실측 15.2 = 15.6×0.970 — '
          + '2차 [13]의 0.4px 차는 이것이다)',
        jitter_model: 'x·y 독립 ±3px(대각 4.24). ⚠ 벽 «선»은 축 스냅·오스냅이 명목 광선 위에 '
          + '고정하므로(시작 모서리 스냅 + vp0 방향 스냅) 벽 지터는 선의 위치에 안 실린다 — '
          + '실효 몫은 창 끝점의 ±3(대각 4.24)이다(carriedJitter가 그 실측). 그래도 «안 닿음» '
          + '판정은 명목 산술이 아니라 칸마다 실측 minGapPx > OSNAP_RADIUS_PX가 진다(하네스 단언)',
        measured_min_gap_over_cells: 0,   // 아래에서 채운다
      },
      cells,
      control,
      why_counts: whyCounts,
      aNot3d_distribution: aNot3dDist,
      flags_explained: {
        'winLifted 전부 같은 값이면': '분포가 한 값인 것이 곧 결론이다(안 닿는 창의 전 칸 동일 거동) — '
          + '변별력은 대조 칸(touching-*)이 진다: 같은 하네스가 닿는 창에서 다른 수를 낸다',
        'constants/metric_defs 스냅샷 없음': 'web2 라인의 원장은 상수 스냅샷 등록부 밖이다(공통 형태 — '
          + 'xint_web2와 같다). 대신 run.constants에 이 측정이 의존하는 값을 그대로 싣는다',
        'aNot3d가 1을 넘는 칸': '지터로 뗀 끝이 이미 그은 창의 대기선 «여럿» 위 반경 안에서 끝난 칸이다. '
          + 'defineByTouch의 후보 B는 lift.waiting(대기선)뿐이고 벽은 승격돼 있어 후보가 아니다 — '
          + '즉 이 계수는 구성상 창끼리의 접촉이고 [1]의 벽 접촉 전제와 무관하다(그 전제는 minGapPx가 판정)',
        'control[*].minGapPx 정확히 0': '설계 보장이다(자기참조 유형 3) — 닿는 대조 칸은 창 왼 변을 벽 세로 '
          + '위에 그어 오스냅이 그 위에 붙이므로 거리가 구성상 0이다. 임계를 안 건다(«안 닿음» 단언은 '
          + 'cells에만 걸린다) — 0이 아니면 오히려 대조가 안 붙은 것이다',
        'control의 axis=null인데 lifted=true': '연결 리프팅의 정상 거동이다(2차 [12]) — 양 끝이 '
          + 'matchPoint(끝점·선분 위)로 정해지면 축 없이 올라간다(«점이 방향을 이긴다» #63). '
          + '지터가 방향을 축 대역 밖으로 밀어도 연결이 좌표를 준다',
      },
    }
    let gapMin = Infinity
    for (const c of cells) gapMin = Math.min(gapMin, c.minGapPx)
    ledger.margin_arith.measured_min_gap_over_cells = gapMin
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'opening21_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] opening21 — 안 닿는 창 lifted 분포 ${[...new Set(cells.map(c => c.winLifted))].join(',')}/4 (칸 ${cells.length})`
      + ` · 대조(닿는 창) ${control.map(c => c.winLifted).join(',')}/4 · 사유 ${JSON.stringify(whyCounts)}`)

    // 판정선(측정 전에 등록 — #26): 대조 칸은 벽에 닿으므로 **적어도 하나** 올라가야 한다.
    // 이것이 「0」의 반증 가능성이다(#69 ㉣) — 본 스윕의 수는 데이터로만 남긴다(재기만 한다).
    for (const c of control) expect(c.winLifted, `대조 칸(seed ${c.seed}·${c.pos}) — 닿는 창은 올라간다`).toBeGreaterThan(0)
    // 벽 자체는 전 칸에서 서야 스윕이 유효하다(픽스처 위생)
    for (const c of cells) expect(c.wallLifted, `벽 4획(seed ${c.seed}·${c.pos})`).toBe(4)
    // «안 닿는다»의 전제 — 칸마다 실측(1차 리뷰 [1] — 명목 산술 아님·주석 아님·판정이다)
    for (const c of cells) expect(c.minGapPx, `안 닿음 전제(seed ${c.seed}·${c.pos})`).toBeGreaterThan(C.OSNAP_RADIUS_PX)
    // 지터가 잉크에 실제로 실렸는가(2차 [7] — #68: 오차를 심어도 경로를 안 태우면 안 걸린다):
    // 창 시작점은 오스냅 대상이 없어 지터가 그대로 남아야 한다 — 무오차 칸은 0, 지터 칸은
    // 0이 아니고 ±3 안. (벽 지터는 축 스냅이 선을 명목 광선에 고정해 선 위치에 안 실린다.)
    for (const c of cells) {
      if (c.jitter === 'none') {
        expect(Math.abs(c.carriedJitter.dx) + Math.abs(c.carriedJitter.dy), `무오차 칸(${c.pos})`).toBe(0)
      } else {
        expect(Math.abs(c.carriedJitter.dx), `지터 실림 dx(seed ${c.seed}·${c.pos})`).toBeLessThanOrEqual(3)
        expect(Math.abs(c.carriedJitter.dy), `지터 실림 dy(seed ${c.seed}·${c.pos})`).toBeLessThanOrEqual(3)
        expect(Math.abs(c.carriedJitter.dx) + Math.abs(c.carriedJitter.dy), `지터가 0이 아니다(seed ${c.seed}·${c.pos})`).toBeGreaterThan(0)
      }
    }
  })
})

describe('1-b — 스케일 기준 획이 겹에 있으면 실척이 흔들리는가', () => {
  /** 작도 완료 + 바탕 획 하나(무치수) + 겹 하나 + 겹 위에 승격되는 획 하나 */
  function layerScene() {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    const base = s.draw(500, 500, 800, vpY(800, 500, 500))!   // 바탕 획(치수 없음)
    const lay = addLayer(s.app, 'tracing', { W, H })!
    const onLayer = s.draw(500, 500, 300, 450)!                // 겹 획 — 모서리 연결로 승격
    expect(onLayer.layer).toBe(lay.id)
    expect(s.app.lift.lifted.has(onLayer.id)).toBe(true)
    return { s, base, lay, onLayer }
  }

  it('겹 획에 첫 치수 → 겹 끄고 켜며 mmPerUnit 값으로', () => {
    // ── 변이 A: 바탕에 치수가 하나도 없다 ──
    const A = layerScene()
    const rA = setDimension(A.s.app, A.onLayer.id, 1000)
    const A_on = A.s.app.lift.mmPerUnit
    setLayerOn(A.s.app, A.lay.id, false)
    const A_off = A.s.app.lift.mmPerUnit
    setLayerOn(A.s.app, A.lay.id, true)
    const A_back = A.s.app.lift.mmPerUnit

    // ── 변이 B: 바탕에도 나중 치수가 있다(지시의 «다음 치수 획으로 물러난다» 후보 검증 D-4) ──
    const B = layerScene()
    const rB1 = setDimension(B.s.app, B.onLayer.id, 1000)     // 첫 치수 = 겹 획
    const rB2 = setDimension(B.s.app, B.base.id, 2000)        // 바탕 획에도 치수
    const B_on = B.s.app.lift.mmPerUnit
    setLayerOn(B.s.app, B.lay.id, false)
    const B_off = B.s.app.lift.mmPerUnit
    setLayerOn(B.s.app, B.lay.id, true)
    const B_back = B.s.app.lift.mmPerUnit

    // ── 대조(수리 목표 상태이자 #69 ㉣의 «흔들릴 수 있는 격자» 증명): 첫 치수가 바탕 획 ──
    const Ctl = layerScene()
    setDimension(Ctl.s.app, Ctl.base.id, 2000)
    const C_on = Ctl.s.app.lift.mmPerUnit
    setLayerOn(Ctl.s.app, Ctl.lay.id, false)
    const C_off = Ctl.s.app.lift.mmPerUnit
    setLayerOn(Ctl.s.app, Ctl.lay.id, true)

    // ── 옛 파일 방어의 판정값(1차 리뷰 [9] — dim.test 팔이 읽는 진실값·틀린 값을 원장으로) ──
    // truth = scaleRef가 바탕 획인 같은 문서의 mmPerUnit · wrong = 겹 획 기준이 냈을 값
    // (dim ÷ 무치수 풀이 길이 — scaleOf의 정의 그대로 산술).
    const L2 = layerScene()
    setDimension(L2.s.app, L2.base.id, 2000)
    L2.onLayer.dim = 1000
    L2.s.app.doc.scaleRef = L2.onLayer.id            // 수리 전 코드가 만들 수 있던 상태
    const legacyLift = liftAll(L2.s.app.doc)
    const truth = liftAll({ ...L2.s.app.doc, scaleRef: L2.base.id }).mmPerUnit
    const dimless = liftAll({ ...L2.s.app.doc, strokes: L2.s.app.doc.strokes.map(x => ({ ...x, dim: undefined })), scaleRef: undefined })
    const gw = dimless.lifted.get(L2.onLayer.id)!
    const wrongVal = 1000 / len3(sub3(gw.b3, gw.a3))

    const ledger = {
      run: {
        note: 'web2-21 1-b — 겹 획이 스케일 기준(scaleRef)일 때 겹 켬/끔에 따른 mmPerUnit. '
          + '정본 명령: npx vitest run test/probe21_measure.test.ts',
        date: '2026-08-28',
        fixture: '작도(2vp) + 바탕 획 + 겹 1 + 겹 위 승격 획. 변이 A=바탕 무치수 · '
          + 'B=바탕에도 치수 · 대조=첫 치수가 바탕 획',
      },
      setDim_enum: "scale=이 입력이 스케일을 정했다(scaleRef 부여) · applied=기존 스케일로 길이 적용 · "
        + "baseScale=겹 획이라 기준이 못 된다(web2-21 수리 후 신설 — 치수는 남고 바탕 스케일로 읽힌다) · "
        + "no3d=3D 미승격이라 못 단다",
      A_no_base_dim: { setDim: rA, scaleRef: A.s.app.doc.scaleRef ?? null, on: A_on, off: A_off, back: A_back },
      B_base_dim_too: { setDim1: rB1, setDim2: rB2, scaleRef: B.s.app.doc.scaleRef ?? null, on: B_on, off: B_off, back: B_back },
      control_base_ref: { scaleRef: Ctl.s.app.doc.scaleRef ?? null, on: C_on, off: C_off },
      // dim.test 「옛 파일 방어」 팔의 판정값(#25 — 판정이 읽은 값은 원장으로)
      legacy_defense: {
        scaleRef_points_at_layer_stroke: legacyLift.mmPerUnit,
        truth_base_ref: truth,
        wrong_layer_ref_would_be: wrongVal,
        rel_diff: truth ? Math.abs(wrongVal - truth) / truth : null,
      },
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인의 원장은 상수 스냅샷 등록부 밖이다(공통 형태 — '
          + 'xint_web2와 같다)',
        'B·control에 같은 값 반복': '불변이 곧 결론이다 — 겹 켬/끔·기준 부여 순서와 무관하게 바탕 기준 '
          + '스케일이 한 값으로 서는 것이 수리의 내용. 흔들릴 수 있는 격자임은 before 판(A·B off=null)이 진다',
        'A 행 전부 null': '측정이 아니라 설계 결과다 — 바탕 무치수 문서는 무척도이고(지시 문면) 겹 치수는 '
          + '기준이 못 된다. ⚠ 귀결: 겹에만 치수가 있는 옛 문서는 열면 표시 치수가 사라진다(D-W8에 기재)',
      },
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'scale_layer_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] scale_layer — A(무바탕치수) on ${A_on} off ${A_off} back ${A_back}`
      + ` · B(바탕치수有) on ${B_on} off ${B_off} back ${B_back} · 대조(바탕 기준) on ${C_on} off ${C_off}`)

    // 판정선: 대조(바탕 기준)는 겹 켬/끔과 무관해야 한다 — 이것은 수리 전에도 참이다
    // (#69 ㉣ — 흔들릴 수 있는 격자임은 A·B의 실측이 보인다. 본 판정은 대조의 불변뿐).
    expect(C_off).toBe(C_on)
  })
})
