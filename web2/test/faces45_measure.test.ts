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
  what: 'web2-45 45-1 — 면 찾기 기준선(놓침·과잉·구멍·깊이 정렬) · 수리 «전» 값',
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
  it('겹친 화면 자리에서 «앞 면이 위에 그려지는가» — 지금은 배열 순서다', () => {
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
    // 겹침 표본 — 두 면의 화면 폴리곤이 겹치는 픽셀들에서 «참 앞»과 «그려지는 위»를 대조
    const polys = s.app.faces.map(f => faceScreen(s.app.lift, s.app.pose, f.outer)!)
    let overlap = 0, inversions = 0
    const samples: { x: number; y: number; front: number; drawnTop: number }[] = []
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
        const drawnTop = Math.max(...inIdx)          // 지금 렌더 = 배열 순서(나중 = 위)
        if (front !== drawnTop) inversions++
        if (samples.length < 4) samples.push({ x, y, front, drawnTop })
      }
    }
    OUT.scene_depth = {
      overlap_samples: overlap, inversions,
      inversion_ratio: `${inversions}/${overlap}`,
      order_now: '배열 순서(faces[] — 지정 순서)가 그리는 순서다 · renderOrder −1 고정 · depthTest 없음',
      samples,
      note: '기준선 — 뒤집힘이 0이 아니면 «칠하면 바로 드러난다»(지시 45-1)의 그 자리다',
      note_graze: '⚠ 픽스처 구축이 하나 더 찾았다: 획이 기존 모서리를 «수 px로 스치면» 3D 마디 병합(MERGE_RATIO)이 두 벽을 이어 붙여 한 평면 12변 그래프가 되고 순환이 벽을 가로질러 짜깁힌다(초판 실측 — 6획 루프 · loopAt(550,430) 실패). 사용자 위험: 스침이 만드는 조용한 면 오귀속 — DEFERRED에 행이 있다',
    }
    expect(overlap).toBeGreaterThan(10)   // 표본이 실제로 겹친다(분해능)
  })
})

describe('장면 5 — 붐빔(D-5): 후보 수·비용', () => {
  it('획 40+ 지면 격자에서 후보가 몇이고 얼마나 걸리나', () => {
    const s = twoVp()
    const toward = (x: number, y: number, vp: { x: number; y: number }, t: number) =>
      s.draw(x, y, x + (vp.x - x) * t, y + (vp.y - y) * t)
    let drawn = 0
    for (let i = 0; i < 12; i++) if (toward(180 + i * 62, 470 + (i % 4) * 24, VP0, 0.16)) drawn++
    for (let i = 0; i < 14; i++) if (toward(1000 - i * 58, 480 + (i % 3) * 26, VP1, 0.15)) drawn++
    for (let i = 0; i < 10; i++) {
      const x = 180 + i * 62, y = 470 + (i % 4) * 24
      if (s.draw(x, y, x, y - 130 - (i % 3) * 22)) drawn++
    }
    const t0 = performance.now()
    const cands = allLoops(s.app.lift, s.app.pose)
    const ms = performance.now() - t0
    OUT.scene_busy = {
      strokes_drawn: drawn + 3, lifted: s.app.lift.lifted.size,
      candidates: cands.length, allLoops_ms: +ms.toFixed(1),
      note_46: '#46 — 후보 수는 이 격자(지면 교차 다수)의 값이다. 격자 셀은 실제 닫힌 영역이라 «과잉»이 아니다 — 과잉의 정의는 장면 1·2의 extra가 든다',
    }
    expect(s.app.lift.lifted.size).toBeGreaterThanOrEqual(30)
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
    OUT.class_sweep = { gate_deg: tol, rows, note: '경계 양옆(±0.1°)이 실제로 갈린다 — paint45.test ①이 게이트' }
    OUT.paint_roundtrip = {
      points: pts.length, placed: r.placed, max_err_px: maxErr,
      note_5: '#5 — 광선→평면→재사영은 같은 카메라에서 구성상 항등이다. 재는 것은 배선(면 배정·평면식·포즈 규약)이고, 자의 판별력은 paint45.test ②의 D-3 팔(1px 틀면 값)이 확인한다',
    }
    OUT.hatch_hole = { ...hatch, note: '두 판 다 구멍만큼 잉크가 준다 — 개구부 추종이 값으로' }
    expect(maxErr).toBeLessThan(1e-6)
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
