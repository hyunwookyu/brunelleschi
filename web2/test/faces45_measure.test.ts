// web2-45 45-1 — **면 찾기 품질의 기준선**(고치기 «전» — D-2·D-1).
//
// 재는 것(지시문): 놓침 · 과잉 · 구멍 · 깊이 정렬. 장면은 **앱 경로**(session.draw —
// 스냅·리프팅을 실제로 지난다)로 짓는다. 대응은 **경계 획 id 집합**으로 센다(#92 —
// 「몇 개」는 이름표이고, 무엇으로 둘러싸였는가가 결과의 자리다).
//
// ⚠ 놓침의 사유를 가른다(#43): «리프팅이 못 세워서»(대기 — 면 찾기의 몫이 아니다)와
// «떠 있는데 후보에 없어서»(면 찾기의 놓침)는 다른 원인이다.
//
// 원장: stage0/out/faces45_web2.json (LEDGER=1 — #90)
//   npx vitest run test/faces45_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session, type Session } from './session'
import { allLoops, loopAt, planeDepth, faceScreen, inPoly, newellNormal } from '../src/core/face'
import { toggleFaceAt } from '../src/app/state'
import { rayThrough, DRAW_POSE, project } from '../src/core/camera'
import { dot3, sub3, v3, norm3, type V3 } from '../src/core/vec'
import type { FaceLoop } from '../src/core/types'

const W = 1200, H = 800
const VP0 = { x: 900, y: 400 }, VP1 = { x: 100, y: 400 }

function twoVp(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)      // 깊이선 1(= 바닥·벽의 공유 모서리)
  s.draw(500, 500, 400, 475)      // 깊이선 2
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 루프의 경계 획 id 집합(정렬 문자열) — 대응의 자(#92) */
const sigOf = (loop: FaceLoop): string =>
  loop.edges.map(e => e.s).sort((a, b) => a - b).join(',')

const OUT: Record<string, unknown> = {
  what: 'web2-45 — ①기준선(scene_*: 놓침·과잉·구멍·깊이 «전») ②새 기능의 사후 측정(class_sweep·paint_roundtrip·hatch_hole — 수리 전 값이 아니다) ③깊이 «후»(depth_after — 같은 하네스·같은 장면)',
  when_cmd: 'npx vitest run test/faces45_measure.test.ts',
}

describe('장면 1 — 방(바닥 + 벽): 놓침·과잉의 기본', () => {
  it('닫힌 영역 둘(바닥·벽)이 후보에 있는가 · 과잉은 몇인가', () => {
    const s = twoVp()
    // 바닥 사각 — 먼 변 둘이 (500,460)에서 만난다(오스냅이 닫는다)
    const g3 = s.draw(600, 475, 500, 460)!    // 깊이선1 끝 → vp1 방향
    const g4 = s.draw(400, 475, 500, 460)!    // 깊이선2 끝 → vp0 방향
    // 벽(vp0 면) — 밑변은 깊이선 1 그 자체(44의 픽스처 규약)
    const colA = s.draw(500, 500, 500, 380)!
    const colB = s.draw(600, 475, 600, 385)!
    const top = s.draw(600, 385, 500, 380)!
    for (const st of [g3, g4, colA, colB, top]) expect(s.app.lift.lifted.has(st.id)).toBe(true)
    const d1 = s.app.doc.strokes[1]!.id, d2 = s.app.doc.strokes[2]!.id
    const expected = [
      { name: 'floor', sig: [d1, d2, g3.id, g4.id].sort((a, b) => a - b).join(',') },
      { name: 'wall', sig: [d1, colA.id, colB.id, top.id].sort((a, b) => a - b).join(',') },
    ]
    const cands = allLoops(s.app.lift, s.app.pose)
    const candSigs = cands.map(c => sigOf(c.loops[0]!))
    const missing = expected.filter(e => !candSigs.includes(e.sig)).map(e => e.name)
    const extra = candSigs.filter(sig => !expected.some(e => e.sig === sig))
    OUT.scene_room = {
      strokes: s.app.doc.strokes.length, lifted: s.app.lift.lifted.size,
      expected: expected.map(e => e.name), candidates: cands.length,
      missing, extra_sigs: extra,
      found_ratio: `${expected.length - missing.length}/${expected.length}`,
      extra_ratio: `${extra.length}/${cands.length}`,
    }
    expect(missing).toEqual([])            // 기준선에서 이미 서는 것 — 회귀 게이트를 겸한다
  })
})

describe('장면 2 — 문 있는 벽: 같은 성분의 분할(구멍이 아니다)', () => {
  it('문·나머지 벽·바닥이 후보에 서고, 원래 벽 외곽은 최소 순환이 아니다', () => {
    const s = twoVp()
    const g3 = s.draw(600, 475, 500, 460)!
    const g4 = s.draw(400, 475, 500, 460)!
    const colA = s.draw(500, 500, 500, 380)!
    const colB = s.draw(600, 475, 600, 385)!
    const top = s.draw(600, 385, 500, 380)!
    // 문 — 밑변(깊이선1) 위에서 세워 같은 성분으로 잇는다
    const jambA = s.draw(530, 492, 530, 420)!
    const dtop = s.draw(530, 420, 565, 419)!     // vp0 방향(오스냅이 눕힌다)
    const jambB = s.draw(565, 419, 565, 484)!    // 밑변 위로 내려 닿는다
    for (const st of [jambA, dtop, jambB]) expect(s.app.lift.lifted.has(st.id)).toBe(true)
    const cands = allLoops(s.app.lift, s.app.pose)
    const candSigs = cands.map(c => sigOf(c.loops[0]!))
    const d1 = s.app.doc.strokes[1]!.id
    const wallOutline = [d1, colA.id, colB.id, top.id].sort((a, b) => a - b).join(',')
    const doorSig = [d1, jambA.id, dtop.id, jambB.id].sort((a, b) => a - b).join(',')
    OUT.scene_door = {
      candidates: cands.length,
      door_found: candSigs.includes(doorSig),
      wall_outline_still_candidate: candSigs.includes(wallOutline),
      note: '문이 밑변에 닿으면 벽은 «문 + 오목 나머지»로 갈린다 — 외곽 전체는 최소 순환이 아니어야 한다(loopAt의 규칙)',
    }
    expect(candSigs.includes(doorSig)).toBe(true)
  })
})

describe('장면 3 — 뜬 창(개구부): 앱 경로의 사실', () => {
  it('떠 있는 사각은 «대기»다 — 면 찾기의 놓침이 아니라 리프팅의 국면(#43)', () => {
    const s = twoVp()
    const colA = s.draw(500, 500, 500, 380)!
    const colB = s.draw(600, 475, 600, 385)!
    const top = s.draw(600, 385, 500, 380)!
    expect(s.app.lift.lifted.has(top.id)).toBe(true)
    // 벽 안의 뜬 사각 — 아무 데도 안 닿는다
    const w1 = s.draw(530, 460, 530, 430)
    const w2 = s.draw(530, 430, 560, 428)
    const w3 = s.draw(560, 428, 560, 458)
    const w4 = s.draw(560, 458, 530, 460)
    const ids = [w1, w2, w3, w4].filter((x): x is NonNullable<typeof x> => !!x).map(x => x.id)
    const waiting = ids.filter(id => s.app.lift.waiting.includes(id))
    const lifted = ids.filter(id => s.app.lift.lifted.has(id))
    OUT.scene_window = {
      drawn: ids.length, waiting: waiting.length, lifted: lifted.length,
      why: ids.map(id => s.app.lift.waitWhy.get(id) ?? null),
      note_43: '#43 — 이 놓침의 사유는 «리프팅»(대기)이다. 면 찾기(allLoops)는 lifted만 보므로 여기 몫이 없다. 합성 lift의 구멍 경로는 face.test.ts 「개구부」가 이미 잠근다(loops[1] 구멍·resolveFace holes 1)',
    }
    // 기준선의 사실: 뜬 창은 이 앱 경로에서 3D로 안 선다(전부 대기 또는 일부만)
    expect(lifted.length).toBeLessThan(ids.length)
  })
})

describe('장면 4 — 겹친 두 벽: 깊이 정렬의 기준선', () => {
  it('겹친 화면 자리에서 «앞 면이 위에 그려지는가» — 전(차례 의존)·후(같은 하네스)', async () => {
    const s = twoVp()
    // 뒷벽의 밑선을 **높이가 서기 전에** 긋는다(지면 규칙 국면).
    // ⚠⚠ 초판은 (430,520)→vp0으로 그었는데 그 선이 앞벽 모서리 (500,500)을 **2.2px로
    //   스쳤고**, 3D 마디 병합(MERGE_RATIO)이 두 벽을 이어 붙여 **한 평면으로 합쳐진
    //   12변 그래프**가 됐다 — 순환이 두 벽을 가로질러 짜깁혔다(실측: 6획 프랑켄 루프).
    //   기준선의 발견으로 원장 note에 남긴다(스침 획의 위험) — 본 팔은 10px 이상 떨어뜨린다.
    const base2 = s.draw(380, 545, 526, 504)!    // vp0 방향 · 왼뒤쪽(모서리에서 10px+)
    expect(s.app.lift.lifted.has(base2.id)).toBe(true)
    // 앞벽(깊이선1 밑변)
    const colA = s.draw(500, 500, 500, 380)!
    const colB = s.draw(600, 475, 600, 385)!
    const top = s.draw(600, 385, 500, 380)!
    // 뒷벽
    const colC = s.draw(380, 545, 380, 340)!
    const colD = s.draw(526, 504, 526, 357)!
    const top2 = s.draw(526, 357, 380, 340)!
    for (const st of [colA, colB, top, colC, colD, top2]) {
      expect(s.app.lift.lifted.has(st.id)).toBe(true)
    }
    // 나쁜 순서를 일부러 만든다: **참 앞**(밑선 y545 — 화면 아래 = 눈에 가깝다)을 먼저
    // 지정 — 배열 순서 렌더에서 «나중 지정한 뒷면이 위에 그려지는» 뒤집힘이 나는가.
    expect(toggleFaceAt(s.app, { x: 430, y: 420 })).toBe('added')   // 참 앞(밑선 380,545)
    expect(toggleFaceAt(s.app, { x: 560, y: 430 })).toBe('added')   // 참 뒤(깊이선1 벽 — 겹친다)
    expect(s.app.faces.length).toBe(2)
    // 겹침 표본 — 두 면의 화면 폴리곤이 겹치는 픽셀들에서 «참 앞»과 «그려지는 위»를 대조.
    // «그려지는 위»를 **두 규칙**으로 다 낸다(45 리뷰어 [3] — 같은 장면·같은 하네스·같은 분모):
    //   전(수리 전 = 배열 순서 — 지정 차례)   · 후(orderByDepth — 렌더가 실제로 쓰는 그 함수 #54)
    // 그리고 배열 순서는 지정 차례에 달렸으므로 **양쪽 차례**(참 앞 먼저 / 참 뒤 먼저)를 다 센다 —
    // 33/33은 나쁜 차례의 값이고(#46 — 픽스처가 정한 수) 좋은 차례는 0이다: 수리가 없앤 것은
    // «차례 의존» 그 자체다.
    const { orderByDepth } = await import('../src/app/render3d')
    const polys = s.app.faces.map(f => faceScreen(s.app.lift, s.app.pose, f.outer)!)
    const centroids = s.app.faces.map(f => {
      let cx = 0, cy = 0, cz = 0
      for (const p of f.outer) { cx += p.x; cy += p.y; cz += p.z }
      return { id: f.id, centroid: { x: cx / f.outer.length, y: cy / f.outer.length, z: cz / f.outer.length } }
    })
    const rankAfter = orderByDepth(centroids, s.app.pose)
    let overlap = 0
    let invBadOrder = 0, invGoodOrder = 0, invAfter = 0
    const samples: { x: number; y: number; front: number; badTop: number; afterTop: number }[] = []
    const SAMPLES_CAP = 4   // 표본 배열은 앞 4개만 싣는다(원장 크기) — 수의 정본은 분자/분모다
    for (let x = 400; x <= 620; x += 10) {
      for (let y = 340; y <= 500; y += 10) {
        const p = { x, y }
        const inIdx = polys.map((poly, i) => inPoly(p, poly) ? i : -1).filter(i => i >= 0)
        if (inIdx.length < 2) continue
        overlap++
        const ray = rayThrough(s.app.lift.an, s.app.pose, p)!
        const depth = inIdx.map(i => {
          const f = s.app.faces[i]!
          const n = norm3(f.normal)
          return { i, d: planeDepth({ n, d: dot3(n, f.outer[0]!) }, ray) }
        })
        const front = depth.reduce((a, b) => (b.d < a.d ? b : a)).i
        // 전 — 배열 순서(나중 지정 = 위): 이 픽스처는 «참 앞을 먼저» 지정했으므로
        // 현행 배열이 곧 나쁜 차례다(참 뒤가 위). 좋은 차례는 그 역이다.
        const badTop = Math.max(...inIdx)
        const goodTop = Math.min(...inIdx)
        // 후 — 렌더의 그 함수(orderByDepth): 순위 큰 것이 나중(위)
        const afterTop = inIdx.reduce((a, b) =>
          (rankAfter.get(s.app.faces[b]!.id)! > rankAfter.get(s.app.faces[a]!.id)! ? b : a))
        if (front !== badTop) invBadOrder++
        if (front !== goodTop) invGoodOrder++
        if (front !== afterTop) invAfter++
        if (samples.length < SAMPLES_CAP) samples.push({ x, y, front, badTop, afterTop })
      }
    }
    OUT.scene_depth = {
      overlap_samples: overlap,
      before_order_dependent: {
        bad_order: `${invBadOrder}/${overlap}`, good_order: `${invGoodOrder}/${overlap}`,
        note_46: '#46·#5 — 나쁜 차례의 만점 뒤집힘은 픽스처 구성의 귀결이다(배열이 깊이 역순이면 전 표본이 뒤집히는 것은 정의). 수리 «전» 실사용 값은 지정 차례에 달렸다(0~100% — 그 «차례 의존» 자체가 결함이다)',
      },
      after: { inversions: `${invAfter}/${overlap}`, by: 'orderByDepth — 렌더가 실제로 쓰는 그 함수(#54 · 같은 장면·같은 하네스·같은 분모)' },
      samples_cap: SAMPLES_CAP, samples,
      note_graze: '⚠ 픽스처 구축이 하나 더 찾았다: 획이 기존 모서리를 «수 px로 스치면» 3D 마디 병합(MERGE_RATIO)이 두 벽을 이어 붙여 한 평면 12변 그래프가 되고 순환이 벽을 가로질러 짜깁힌다(초판 실측 — 6획 루프 · loopAt(550,430) 실패). 사용자 위험: 스침이 만드는 조용한 면 오귀속 — DEFERRED에 행이 있다',
    }
    expect(overlap).toBeGreaterThan(10)   // 표본이 실제로 겹친다(분해능)
    expect(invAfter).toBe(0)              // 게이트: 수리 후 뒤집힘 0/overlap — 아래 gates 블록
    expect(invBadOrder).toBe(overlap)     // D-3 반증 짝: 나쁜 차례는 실제로 전부 뒤집힌다
  })
})

describe('장면 5 — 붐빔(D-5): 격자의 놓침·과잉·비용(정답 수를 센다)', () => {
  it('교차 격자(4×4)에서 셀 9가 «찾아야 할 것»이다 — 놓침/과잉의 분모(#11)', () => {
    // ⚠ 45 리뷰어 [2]: 초판의 흩어진 짧은 선 38개는 «찾아야 할 닫힌 영역»의 수를 셀 수
    //   없어 놓침·과잉이 그 장면에서 정보량 0이었다. 진짜 교차 격자로 바꾼다:
    //   vp0 방향 4줄 × vp1 방향 4줄이 실제로 엇갈리면 셀 (4−1)² = 9가 정답이다.
    const s = twoVp()
    // ⚠ 완전 교차를 **세계 좌표로 보장한다**: 화면 좌표 손대중(초판·재판)은 교차 16 중
    //   7~19개만 성립해 정답 수가 안 섰다. 지면(Y=0)의 축방향 격자를 놓고 **사영해** 긋는다 —
    //   오스냅·축 스냅이 그 선을 제 축으로 되잡는다(앱 경로 유지).
    const an0 = s.app.lift.an
    const d0 = an0.axes.find(a => a.id === 'vp0')!.dir
    const d1 = an0.axes.find(a => a.id === 'vp1')!.dir
    const corner = s.app.lift.lifted.get(s.app.doc.strokes[1]!.id)!.a3   // (−1.6, 0, −6.196…)
    const at = (u: number, v: number) => ({
      x: corner.x + d0.x * u + d1.x * v, y: 0, z: corner.z + d0.z * u + d1.z * v,
    })
    const drawWorld = (A: V3, B: V3) => {
      const pa = project(an0, DRAW_POSE, A)!, pb = project(an0, DRAW_POSE, B)!
      return s.draw(pa.x, pa.y, pb.x, pb.y)
    }
    // ⚠ 격자를 **반 칸 비켜** 놓는다 — 0행·0열을 깊이선 위에 두면(공선 겹침) 그 줄들의
    //   조각 그래프가 다중변으로 퇴화해 셀이 죽는다(실측: 3/9 — 스침 병합의 형제 형태.
    //   그 현상 자체는 note_collinear로 남긴다).
    const STEP = 0.8, OFF = 0.5, N = 4
    let drawn = 0
    for (let i = 0; i < N; i++) {
      const v = OFF + i * STEP
      if (drawWorld(at(OFF - 0.4, v), at(OFF + (N - 1) * STEP + 0.4, v))) drawn++   // d0 방향
      if (drawWorld(at(v, OFF - 0.4), at(v, OFF + (N - 1) * STEP + 0.4))) drawn++   // d1 방향
    }
    const lifted = s.app.lift.lifted.size - 2      // 깊이선 둘 제외한 격자 몫
    const t0 = performance.now()
    const cands = allLoops(s.app.lift, s.app.pose)
    const ms = performance.now() - t0
    // «찾아야 할 것» = 지면 평면의 셀 9(교차가 다 성립했을 때). 교차 성립 수로 상한을 보정:
    // 씨/날 짝마다 화면 교차가 있어야 셀이 선다 — 성립한 교차 수를 세어 함께 적는다.
    const expectedCells = 9
    // 셀(정답)의 판정 — 격자 획 4+4로만 이루어진 4변 루프가 셀이다(#92: 서명으로 센다)
    const gridIds = new Set(s.app.doc.strokes.slice(3).map(x => x.id))
    const cellLike = cands.filter(c =>
      c.loops[0]!.edges.length === 4 && c.loops[0]!.edges.every(e => gridIds.has(e.s)))
    OUT.scene_busy = {
      grid: '씨줄 4(vp0) × 날줄 4(vp1) — 세계 좌표 완전 교차 격자(깊이선에서 반 칸 비킴)', strokes_drawn: drawn + 3, lifted_grid: lifted,
      expected_cells: expectedCells,
      candidates: cands.length,
      cells_found: `${cellLike.length}/${expectedCells}`,
      extra: cands.length - cellLike.length,
      extra_sigs: cands.filter(c => !cellLike.includes(c)).map(c => sigOf(c.loops[0]!)).slice(0, 8),
      extra_sigs_cap: 8,
      allLoops_ms: +ms.toFixed(1),
      note_46: '#46 — 이 수는 «지면 한 평면·완전 교차 격자»의 값이다. 과잉 후보의 구성은 extra_sigs가 든다(깊이선·격자 자투리가 만드는 추가 순환 — 원칙상 그것들도 닫힌 영역이라 «찾지 말아야 할 것»인지는 판단 유보: 사용자가 지정으로 거른다는 것이 이 앱의 규약이다)',
      note_collinear: '⚠ 격자 0행·0열을 깊이선 «위»에 두면(공선 겹침) 조각 그래프가 다중변으로 퇴화해 셀이 3/9로 죽는다(실측 — 스침 병합의 형제). 사용자 위험 행이 DEFERRED에 있다',
    }
    expect(lifted).toBeGreaterThanOrEqual(8)
    expect(cellLike.length).toBe(expectedCells)   // 게이트: 비킨 격자에서 셀 9/9
  })
})

describe('분류·칠·채움의 수(45-2·45-3·45-4 「재야 할 것」)', () => {
  it('분류 경계 스윕 · 칠 왕복 오차 · 해칭 구멍 추종을 원장으로', async () => {
    const { faceClassOf } = await import('../src/core/paint')
    const { commitPaint, toggleFaceAt: tf } = await import('../src/app/state')
    const { hatchSegments } = await import('../src/core/hatch')
    const { C } = await import('../src/core/constants')
    const { v3, sub3, len3 } = await import('../src/core/vec')
    // ① 분류 — 임계 양옆 스윕(#12)
    const tol = C.FACE_CLASS_DEG
    const rows = [0, tol - 0.1, tol + 0.1, 45, 90 - tol - 0.1, 90 - tol + 0.1, 90].map(deg => {
      const r = deg * Math.PI / 180
      return { tilt_deg: deg, cls: faceClassOf({ x: Math.sin(r), y: Math.cos(r), z: 0 }, tol) }
    })
    // ② 칠 왕복 — 방의 벽에 12점 붓 하나(같은 시점 재사영 오차 — #5: 배선 확인임을 적는다)
    const s = twoVp()
    s.draw(600, 475, 500, 460); s.draw(400, 475, 500, 460)
    s.draw(500, 500, 500, 380); s.draw(600, 475, 600, 385); s.draw(600, 385, 500, 380)
    expect(tf(s.app, { x: 550, y: 430 })).toBe('added')
    const pts = Array.from({ length: 13 }, (_, t) => ({ x: 515 + t * 6, y: 470 - t * 5 }))
    const r = commitPaint(s.app, pts)
    const pStroke = s.app.doc.strokes.find(x => x.paint !== undefined)!
    const g3 = s.app.paintGeo.get(pStroke.id)!
    let maxErr = 0
    for (let i = 0; i < g3.length; i++) {
      const q = project(s.app.lift.an, DRAW_POSE, g3[i]!)!
      maxErr = Math.max(maxErr, Math.hypot(q.x - pStroke.raw![i]!.x, q.y - pStroke.raw![i]!.y))
    }
    // ③ 해칭 — 구멍 추종(잉크 길이 차 — D-3의 그 반증 짝을 수로)
    const wall = { id: 999, outer: [v3(-2, 0, -8), v3(2, 0, -8), v3(2, 2.4, -8), v3(-2, 2.4, -8)],
      holes: [[v3(-0.5, 0.8, -8), v3(0.5, 0.8, -8), v3(0.5, 1.6, -8), v3(-0.5, 1.6, -8)]],
      normal: v3(0, 0, 1), flat: 0, tris: [] }
    const total = (xs: { a: V3; b: V3 }[]) => xs.reduce((sum, sg) => sum + len3(sub3(sg.b, sg.a)), 0)
    const hatch = Object.fromEntries((['screen', 'face'] as const).map(mode => {
      const withHole = total(hatchSegments(s.app.lift.an, DRAW_POSE, wall, mode, C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG))
      const noHole = total(hatchSegments(s.app.lift.an, DRAW_POSE, { ...wall, holes: [] }, mode, C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG))
      return [mode, { with_hole: +withHole.toFixed(4), no_hole: +noHole.toFixed(4), cut: +(noHole - withHole).toFixed(4) }]
    }))
    OUT.class_sweep = {
      gate_deg: tol,
      gate_derived_note: '80° 문은 별도 상수가 아니라 90 − FACE_CLASS_DEG의 파생이다(faceClassOf의 두 부등식 — 45 리뷰어 [17])',
      rows,
      accuracy: { scene: '방(바닥+벽)', correct: 2, n: 2, note: '실측 정확도의 분모는 2뿐이다 — 실장면 정확도는 실기기 ⑬이 판정자(#46)' },
    }
    // ── 칠 왕복 — **두 시점**(45 리뷰어 [11] — 동작점 하나 ⛔): 작도 포즈 + 돌린 포즈 ──
    const { setPose } = await import('../src/app/state')
    const { quatAxisAngle } = await import('../src/core/vec')
    setPose(s.app, { p: { x: 1.1, y: 1.5, z: 1.2 }, q: quatAxisAngle({ x: 0, y: 1, z: 0 }, 0.18) })
    const pts2 = Array.from({ length: 9 }, (_, t) => ({ x: 560 + t * 5, y: 430 - t * 3 }))
    const r2 = commitPaint(s.app, pts2)
    let maxErr2 = 0
    if (r2.placed > 0) {
      const p2s = s.app.doc.strokes.filter(x => x.paint !== undefined).slice(-r2.placed)
      for (const ps of p2s) {
        const g2 = s.app.paintGeo.get(ps.id)
        if (!g2) continue
        for (let i = 0; i < g2.length; i++) {
          const q = project(s.app.lift.an, s.app.pose, g2[i]!)!
          maxErr2 = Math.max(maxErr2, Math.hypot(q.x - ps.raw![i]!.x, q.y - ps.raw![i]!.y))
        }
      }
    }
    OUT.paint_roundtrip = {
      draw_pose: { points: pts.length, placed: r.placed, max_err_px: maxErr },
      orbited_pose: { points: pts2.length, placed: r2.placed, max_err_px: maxErr2 },
      split_arm: { runs_wall_floor: 'paint45.test ①이 앱 경로로 잠근다 — 여기의 수는 아래 split 필드', },
      note_5: '#5 — 0은 구성상 항등(광선→평면→재사영 · 같은 카메라)이다. 재는 것은 배선(면 배정·평면식·포즈 규약 — 돌린 포즈 행이 s.view 규약을 문다)이고, 자의 판별력 확인값은 ruler_check_px다',
      ruler_check_px: (() => {   // D-3 — 자를 1px 틀면 실제로 값이 난다(원장 안으로 — [6]⑤)
        const q0 = project(s.app.lift.an, DRAW_POSE, g3[0]!)!
        return Math.hypot(q0.x - (pStroke.raw![0]!.x + 1), q0.y - pStroke.raw![0]!.y)
      })(),
    }
    // ── 분할·허공 수(45 리뷰어 [6]① — 원장 안으로) ─────────────────────────────
    const s2 = twoVp()
    s2.draw(600, 475, 500, 460); s2.draw(400, 475, 500, 460)
    s2.draw(500, 500, 500, 380); s2.draw(600, 475, 600, 385); s2.draw(600, 385, 500, 380)
    expect(tf(s2.app, { x: 468, y: 478 })).toBe('added')
    expect(tf(s2.app, { x: 550, y: 430 })).toBe('added')
    const brushPts = [
      ...Array.from({ length: 21 }, (_, t) => ({ x: 550 - t * 5, y: 430 + t * 2.4 })),
      ...Array.from({ length: 5 }, (_, t) => ({ x: 405 - t * 45, y: 510 + t * 32 })),
    ]
    const rs = commitPaint(s2.app, brushPts)
    OUT.split = {
      brush_points: brushPts.length, runs_placed: rs.placed, off_face_points: rs.offFace,
      faces_hit: [...new Set(s2.app.doc.strokes.filter(x => x.paint !== undefined).map(x => x.paint!.f))].length,
    }
    // ── ⚑ 판별을 원장으로(45 리뷰어 [6]②·[7]) ──────────────────────────────────
    const rfWall = s2.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
    const poseB = { p: v3(1.2, 1.4, 1.5), q: quatAxisAngle({ x: 0, y: 1, z: 0 }, 0.2) }
    const sig = (xs: { a: V3; b: V3 }[]) => xs.map(x => `${x.a.x.toFixed(6)},${x.a.y.toFixed(6)},${x.b.x.toFixed(6)}`).join('|')
    const faceA = hatchSegments(s2.app.lift.an, DRAW_POSE, rfWall, 'face', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    const faceB = hatchSegments(s2.app.lift.an, poseB, rfWall, 'face', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    const scrA = hatchSegments(s2.app.lift.an, DRAW_POSE, rfWall, 'screen', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    const scrB = hatchSegments(s2.app.lift.an, poseB, rfWall, 'screen', C.HATCH_SPACING_PX, C.HATCH_ANGLE_DEG)
    OUT.hatch_flag_check = {
      face_pose_invariant: sig(faceA) === sig(faceB),
      screen_pose_varies: sig(scrA) !== sig(scrB),
      modes_differ_same_pose: sig(faceA) !== sig(scrA),
      note_5: '#5 — 앞의 둘은 두 판의 «정의»의 귀결(구성상)이라 배선 확인이다: 두 모드가 실제로 딴 코드 경로를 지나는가(우연히 같은 판을 내면 셋째 행이 거짓이 된다). ⚑의 본 판정(어느 판이 눈에 맞는가)은 사람 몫이고 이 수가 대신하지 않는다',
      segs: { face_A: faceA.length, screen_A: scrA.length },
    }
    // ── 개구부 절단 수(단위·기대값·두 판 동일 cut의 사유 — [9]) ─────────────────
    OUT.hatch_hole = {
      unit: '세계 유닛(3D 선분 길이 합 — 두 판 다 같은 좌표계라 비교 가능)',
      ...hatch,
      hole: { w: 1.0, h: 0.8, note: '기대 절단은 구멍을 지나는 해칭선 수 × 구멍 안 통과 길이의 합 — 각도 45°·간격에 따라 이산적이라 닫힌 식 대신 midpoint-in-hole 0 판정(paint45.test ②)이 «안 지나감»을 잠근다' },
      cut_equal_note: '두 판의 cut이 소수 넷째까지 같은 것은 우연이 아니라 근사 일치다 — 면 판의 간격이 작도 포즈 환산이라 이 평면(z=-8)에서 화면 판과 거의 같은 밀도가 되고, 절단 위상이 같은 격자(위상 0 기준)에 앉는다. 다른 깊이의 면에서는 갈린다',
      op_note: '«뚫는 조작 전/후»의 두 상태다 — 해칭은 매 렌더 파생 생성이라(원칙 b — 픽셀 굽기 없음) 조작 전후 = 두 상태 평가이고 그 자체가 검사다. 앱 경로의 구멍 생성은 리프팅 국면에 막혀 있다(scene_window — DEFERRED)',
    }
    // ── 게이트 등록(45 리뷰어 [10] — #35·#40) ──────────────────────────────────
    OUT.gates = {
      class_boundary: { registered: 'C.FACE_CLASS_DEG', value: tol, reachability: 'rows의 ±0.1° 짝이 실제로 갈린다(위 class_sweep)', source: 'paint45.test 분류 ①' },
      depth_after_zero: { registered: 'orderByDepth(렌더의 그 함수)', value: '0/overlap — scene_depth.after', reachability: 'D-3 짝: 나쁜 차례는 overlap/overlap 전부 뒤집힌다(같은 실행)', source: '이 파일 장면 4' },
      hole_cut_positive: { registered: 'hatch2d 짝수-홀수 절단', value: 'hatch_hole.cut > 0', reachability: '구멍을 지우면 잉크가 실제로 는다(paint45.test ② D-3 짝)', source: 'paint45.test 채움 ②' },
    }
    expect(maxErr).toBeLessThan(1e-6)
    expect(maxErr2).toBeLessThan(1e-6)
  })
})

describe('원장 쓰기', () => {
  it('stage0/out/faces45_web2.json', () => {
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'faces45_web2.json'), JSON.stringify(OUT, null, 2))
    expect(true).toBe(true)
  })
})
