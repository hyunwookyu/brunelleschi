// web2-21 4-e — **면 일괄(전부 찾기)의 비용 원장**(#38 규율 — 새 비용은 원장에 든다).
//
// 재는 것: 획 수 N ∈ {50, 100, 200, 400}의 지면 격자에서 `findAllFaces`(allLoops +
// 후보별 resolveFace 검증) 한 번의 벽시계 ms — 중앙값(5회) · 최대.
// 조건(#71 — 값의 절반): node(vitest 단일 파일 실행 — 브라우저·렌더 없음: 이 비용은
// 알고리즘 몫이고 화면 몫이 아니다) · 합성 lift(승격·오스냅 비용 제외) · 격자 장면
// (도메인 최악에 가깝다 — 셀 수가 O(N²/4)로 는다).
// 판정선: 임계를 안 건다 — 버튼 한 번의 비용이라 «감당 대역»의 판단은 실기기 표
// (DEFERRED)가 진다. 원장은 그 판단의 근거 수치다.
//
// 원장: stage0/out/faces_bulk_web2.json
//   npx vitest run test/faces_bulk_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, findAllFaces, cancelCandidates } from '../src/app/state'
import { analyze, DRAW_POSE, project } from '../src/core/camera'
import type { LiftResult, LiftedSeg } from '../src/core/lift'
import { constructedDoc } from './fixtures'
import type { Stroke } from '../src/core/types'
import { v3, type V3 } from '../src/core/vec'

function synthLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    const a = project(an, DRAW_POSE, s.a3), b = project(an, DRAW_POSE, s.b3)
    if (!a || !b) continue
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null, scaleId: null, dimGeom: new Map() }
}

/** 지면 격자 — 세로 v개(x 등분)·가로 h개(z 등분) + 테두리 4 = v+h+4 획.
 *  ⚠ 첫 판은 v=h=N/2(셀 O(N²/4))였고 400획에서 셀 39601 — 300s를 넘겨 죽였다.
 *  «방 스물» 대역(지시 4-a)의 스무 배가 넘는 비현실 격자였고, 지배 비용은 buildGraph의
 *  nodeOf O(n²)였다. 호출부는 **셀이 획 수에 선형**(h=0 — 복도형 평면)으로 재고 그
 *  사실을 원장 조건에 적는다(#71 — 조건이 값의 절반). */
function gridScene(v: number, h: number) {
  const segs: { id: number; a3: V3; b3: V3 }[] = []
  let id = 100
  // X 폭 80 — N=400에서 이웃 간격 80/397 ≈ 0.20이 병합 허용(MERGE_RATIO×size3 ≈ 0.05×?)
  // 위에 있어야 마디가 안 뭉개진다(첫 판 폭 12는 간격 0.03 < 허용이라 후보 0이 났다)
  const X0 = -40, X1 = 40, Z0 = -10, Z1 = -22
  segs.push({ id: id++, a3: v3(X0, 0, Z0), b3: v3(X1, 0, Z0) })
  segs.push({ id: id++, a3: v3(X1, 0, Z0), b3: v3(X1, 0, Z1) })
  segs.push({ id: id++, a3: v3(X1, 0, Z1), b3: v3(X0, 0, Z1) })
  segs.push({ id: id++, a3: v3(X0, 0, Z1), b3: v3(X0, 0, Z0) })
  for (let i = 1; i <= v; i++) {
    const x = X0 + (X1 - X0) * i / (v + 1)
    segs.push({ id: id++, a3: v3(x, 0, Z0), b3: v3(x, 0, Z1) })
  }
  for (let j = 1; j <= h; j++) {
    const z = Z0 + (Z1 - Z0) * j / (h + 1)
    segs.push({ id: id++, a3: v3(X0, 0, z), b3: v3(X1, 0, z) })
  }
  return segs
}

describe('면 일괄 비용 — 획 수 대 일괄 ms (4-e)', () => {
  it('N = 50·100·200·400', () => {
    const measureGrid = (v: number, h: number) => {
      const segs = gridScene(v, h)
      const app = createApp(1200, 800)
      app.lift = synthLift(segs)
      const times: number[] = []
      let cands = 0
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now()
        cands = findAllFaces(app)
        times.push(performance.now() - t0)
        cancelCandidates(app)
      }
      times.sort((a, b) => a - b)
      return {
        strokes: segs.length,
        cells: (v + 1) * (h + 1),
        candidates: cands,
        med_ms: Math.round(times[2]! * 10) / 10,
        max_ms: Math.round(times[4]! * 10) / 10,
      }
    }
    // 획 수 축(복도형 — 셀 = N−3)
    const Ns = [50, 100, 200, 400]
    const rows = Ns.map(N => measureGrid(N - 4, 0))
    for (let i = 0; i < Ns.length; i++) {
      expect(rows[i]!.strokes).toBe(Ns[i]!)
      // 후보 수 = 셀 수(격자 장면의 구성 사실 — 전부 찾혔다)
      expect(rows[i]!.candidates).toBe(rows[i]!.cells)
    }
    // **비용의 동인은 획 수가 아니라 닫힌 칸 수다**(2차 리뷰 [3]) — 2축 격자 대조 칸:
    // 40획으로 361칸(19×19)을 만들면 400획/397칸과 같은 대역이 나와야 한다(칸이 정한다).
    const twoAxis = measureGrid(18, 18)
    expect(twoAxis.strokes).toBe(40)
    expect(twoAxis.candidates).toBe(361)
    // 분해능 단언(#71 ㉢ — 실제로 실패할 수 있는 형태): 한 자릿수 위 격자가 그 아래
    // 격자의 변동(max)을 넘어야 이 표의 축이 값을 가른다. 저역 두 행(50↔100)은 실행
    // 변동이 겹칠 수 있어 단언하지 않는다 — 겹침 여부를 원장에 값으로 남긴다(아래).
    expect(rows[3]!.med_ms).toBeGreaterThan(rows[1]!.max_ms)   // 400획 med > 100획 max
    expect(rows[3]!.med_ms).toBeGreaterThan(0.05)              // 시계 분해능 위
    const ledger = {
      run: {
        note: 'web2-21 4-e — findAllFaces(allLoops + resolveFace 검증) 벽시계. '
          + '⚠ 정본 명령: LEDGER=1 npx vitest run test/faces_bulk_measure.test.ts — **단독 실행**. '
          + '(LEDGER=1이 없으면 원장을 안 쓴다 — 전량 실행의 병렬 판이 못 덮는다.) '
          + '전량 vitest는 워커 병렬로 이 파일을 함께 돌려 벽시계를 부풀린다(#71 ㉠ — 2차 '
          + '리뷰 [1][2]가 잡았다: 전량 판 5.2/8.8/26/96.1 vs 단독 판. 전량이 덮어쓴 판은 '
          + '정본이 아니고 마감에서 이 명령으로 재생성한다 — web2-20 원장 규율)',
        date: '2026-08-28',
        conditions: 'node(vitest **단일 파일 단독 실행** — 동시 워커 없음·브라우저 없음: 알고리즘 '
          + '몫만) · 합성 lift(승격 비용 제외) · 지면 복도형 격자(세로줄만 — 셀 = N−3) · '
          + '5회 실행의 중앙값/최대',
        threshold: '임계 없음 — 버튼 한 번의 비용. «감당할 만한가»는 실기기 표(DEFERRED)가 판단',
      },
      rows,
      // 비용의 동인 — 획 수가 아니라 **닫힌 칸 수**다(2차 [3]): 40획·361칸이 400획·397칸과
      // 같은 대역인 것이 그 증거. «버튼 한 번 대역» 결론은 칸 수 조건부다(방 스물 = 칸 스물
      // 대역 — 첫 판의 39601칸(2축 N/2 격자)은 300s를 넘겼다).
      two_axis_control: twoAxis,
      resolution: {
        note: '#71 ㉢ — 축이 값을 가르는가: 400획 med > 100획 max를 하네스가 단언. '
          + '저역(50↔100)의 겹침 여부는 단언 없이 값으로 남긴다(겹치면 그 두 행은 분해 못 한 것)',
        low_rows_overlap: rows[0]!.max_ms > rows[1]!.med_ms,
      },
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인의 원장은 상수 스냅샷 등록부 밖(공통 형태 — xint_web2와 같다)',
        'candidates == cells 정확 일치': '격자 장면의 구성 사실이다(전부 찾기의 완전성 확인이지 측정 아님) — 임계 없음',
      },
    }
    // ⚠ **원장은 단독 실행에서만 쓴다**(LEDGER=1 — web2-22에서 세운 규율): 전량 vitest가
    // 병렬 워커로 이 파일을 돌려 부푼 판(예: 64.4→85.7ms)을 덮어썼고 그 판이 커밋까지
    // 갔다(#71 ㉠ 세 번째 재발 — 사람 손 규율(마감 재생성)로는 못 막았다. 유인을 이기려
    // 하지 말고 쓰기 자체를 갈랐다 A-3). 전량 실행은 팔(단언)만 돌고 원장을 안 건드린다.
    if (process.env.LEDGER === '1') {
      const outDir = resolve(__dirname, '../../stage0/out')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(resolve(outDir, 'faces_bulk_web2.json'), JSON.stringify(ledger, null, 2))
    }
    console.log('[측정] faces_bulk — ' + rows.map(r => `${r.strokes}획/${r.cells}칸 ${r.med_ms}ms`).join(' · '))
  })
})
