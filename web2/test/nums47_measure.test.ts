// web2-47 — 숫자와 표시의 측정 원장(단위 몫). 픽셀은 e2e(nums47_e2e_web2_*.json).
// 원장: stage0/out/nums47_web2.json (LEDGER=1 — #90)
//   npx vitest run test/nums47_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { setDimension, toggleFaceAt, placePersonAt } from '../src/app/state'
import { scaleBarAt } from '../src/core/scalebar'
import { faceAreaU2, u2ToM2, floorArea, volume } from '../src/core/area'
import { findRooms, setRoomRotForTest } from '../src/core/room'
import { faceFrontPose } from '../src/core/grip'
import { parallelPose } from '../src/core/viewcube'
import { rayThrough } from '../src/core/camera'
import { add3, mul3, sub3, len3, dot3 } from '../src/core/vec'
import { project, horizonScreenY, pointOnGround, eyeAbove } from '../src/core/camera'
import { lenMm } from '../src/core/dim'
import { C } from '../src/core/constants'
import { v3 } from '../src/core/vec'
import type { ResolvedFace } from '../src/core/face'
import type { Face } from '../src/core/types'

const W = 1200, H = 800

function scaled() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  const d1 = s.draw(500, 500, 600, 475)!
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  expect(setDimension(s.app, d1.id, 2000)).toBe('scale')
  return s
}

const OUT: Record<string, unknown> = {
  what: 'web2-47 — ①스케일바(깊이 스윕·평행 균일·끝점 검산) ②사람(눈-지평선·거부) ③면적·부피(검산·놓침·반증) ④실(합성+앱 경로 — ⚑ 판정 자료). 픽셀 몫은 nums47_e2e_web2_*.json',
  note_f: '⚠ 이 회차의 절대 수치(mm·m²·m³·eye_height_mm) 전부가 mmPerUnit과 f 위에 있다(2차 [H1] — AS-C4: f 오차는 연쇄를 안 타는 전역 배율 편향). fixtures 블록이 그 출처를 든다. 1점 문서(f 임의)의 f 감도 스윕은 DEFERRED',
  when_cmd: 'npx vitest run test/nums47_measure.test.ts',
  note_61: '#61이 이 회차의 중심 — 축척 미정 null·부피 전제 미성립 null이 각 팔의 반증 짝이다',
}

describe('47-1 스케일바 — 원장', () => {
  it('깊이 스윕 · 평행 균일 · 끝점 검산', () => {
    const s = scaled()
    const an = s.app.lift.an, pose = s.app.pose, mmPer = s.app.lift.mmPerUnit
    OUT.fixtures = { W, H, f: +an.f!.toFixed(6), fSource: an.fSource, mmPerUnit: +mmPer!.toFixed(6) }
    const rows: { anchor_y: number; mm: number; px: number; err_rel: number }[] = []
    for (const y of [760, 700, 640, 580]) {
      const bar = scaleBarAt(an, pose, mmPer, { x: 200, y }, C.SCALEBAR_TARGET_PX, 'mm')
      if (!bar) continue
      const ga = pointOnGround(an, pose, bar.a)!, gb = pointOnGround(an, pose, bar.b)!
      const mm = lenMm(ga, gb, mmPer)!
      rows.push({
        anchor_y: y, mm: bar.mm,
        px: +Math.hypot(bar.b.x - bar.a.x, bar.b.y - bar.a.y).toFixed(2),
        err_rel: +(Math.abs(mm - bar.mm) / bar.mm).toExponential(2) as unknown as number,
      })
    }
    expect(rows.length).toBeGreaterThanOrEqual(3)
    // 무축척 null을 «값»으로(2차 [M9]) — 같은 실행의 같은 픽스처 모양(치수 없는 판)
    OUT.scalebar_noscale = { def: '치수 없는 같은 장면의 scaleBarAt 반환(2차 [M9] — 게이트 ① 반증의 값)', result: String(scaleBarAt(an, pose, null, { x: 200, y: 700 }, C.SCALEBAR_TARGET_PX, 'mm')) }
    OUT.scalebar_depth = {
      def: '닻 y 스윕(아래=가깝다) — 고른 값(mm)·화면 폭(px)·끝점 검산(화면 끝을 지면으로 되쏘아 잰 길이의 상대 오차). 목표 폭 100px',
      rows,
      note_5: '검산(err_rel)은 같은 카메라의 사영↔역사영 왕복이라 구성에 가깝다 — 재는 것은 «막대가 그 왕복 위에 배선돼 있는가»다(paint_roundtrip의 그 규약). 측정의 몫은 mm·px가 깊이에서 어떻게 움직이는가',
    }
    // 평행 균일(2차… 아니 1차 [H5] — 지시 「재야 할 것」의 그 항목을 원장으로)
    const floorF = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
    const c2 = floorF.outer.reduce((a, p) => v3(a.x + p.x / floorF.outer.length, a.y + p.y / floorF.outer.length, a.z + p.z / floorF.outer.length), v3(0, 0, 0))
    const top = parallelPose(faceFrontPose(c2, floorF.normal, s.app.pose, 10), c2)
    const pRows: { anchor: [number, number]; mm: number; px: number }[] = []
    for (const a of [[300, 500], [700, 300], [500, 650]] as [number, number][]) {
      const b = scaleBarAt(an, top, mmPer, { x: a[0], y: a[1] }, C.SCALEBAR_TARGET_PX, 'mm')!
      pRows.push({ anchor: a, mm: b.mm, px: +Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y).toFixed(2) })
    }
    expect(new Set(pRows.map(r => r.mm)).size).toBe(1)
    // 수리 전 위약(1차 [H5] — D-2를 값으로): pointOnGround의 옛 원점(pose.p)을 그대로
    // 재현한 두 줄 — 평행 포즈에서 접지가 닻과 무관해진다(퍼짐 0).
    const buggyGround = (sp: { x: number; y: number }) => {
      const r = rayThrough(an, top, sp)!
      const u = -top.p.y / r.d.y
      return add3(top.p, mul3(r.d, u))
    }
    const gB = [buggyGround({ x: 300, y: 500 }), buggyGround({ x: 700, y: 300 }), buggyGround({ x: 500, y: 650 })]
    const gF = [pointOnGround(an, top, { x: 300, y: 500 })!, pointOnGround(an, top, { x: 700, y: 300 })!, pointOnGround(an, top, { x: 500, y: 650 })!]
    const spread = (g: { x: number; z: number }[]) => {
      let m = 0
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m = Math.max(m, Math.hypot(g[i]!.x - g[j]!.x, g[i]!.z - g[j]!.z))
      return m
    }
    OUT.scalebar_parallel = {
      def: '평행(바닥 정면 — faceFrontPose∘parallelPose) 세 닻 — 값·폭 균일. buggy_spread = 수리 전 원점(pose.p) 재현판의 접지 퍼짐(0 = 모든 닻이 같은 점 — 붕괴) ↔ fixed_spread(수리 후)',
      rows: pRows,
      buggy_spread_u: +spread(gB).toFixed(6), fixed_spread_u: +spread(gF).toFixed(4),
      note_d2: 'D-2를 값으로 — 수리 전 실패(퍼짐 0)와 수리 후(닻마다 다른 접지)가 같은 실행에 나란히 있다. 파급 점검: view42_web2.json 재실행이 바이트 동일(17/17 — 그 픽스처의 값은 이 경로에 안 실렸다 · #42⑨)',
    }
    expect(spread(gB)).toBeLessThan(1e-9)
    expect(spread(gF)).toBeGreaterThan(1)
    // 폭 상한의 반증 산술(1차 [M8] — «내림» 대신 «올림»이면 목표를 넘는다: 실측 px에서 유도)
    const r0 = rows[0]!
    const nextUp = r0.mm * (r0.mm.toString()[0] === '2' ? 2.5 : 2)
    OUT.scalebar_ceil_probe = {
      def: '내림(1·2·5 floor) 대신 한 단 올림이면 폭이 목표를 넘는다 — rows[0](anchor_y 760) 행의 실측 px × (윗단/고른 값 — 2차 [L19]). registered ≤100px가 실제로 실패 가능함의 산술 짝(같은 실행 값에서 유도)',
      px_if_ceil: +(r0.px * nextUp / r0.mm).toFixed(2), target: C.SCALEBAR_TARGET_PX,
    }
    expect(r0.px * nextUp / r0.mm).toBeGreaterThan(C.SCALEBAR_TARGET_PX)
    OUT.gate_scalebar_band = {
      registered: '고른 값이 1·2·5×10ⁿ · 화면 폭 ≤ 목표(constants_used.SCALEBAR_TARGET_PX — 상수 결합은 그 필드가 스냅샷 대용) · 깊이가 깊어질수록 mm 비감소(원근) · 평행은 값·폭 균일. ⚠ 목표폭·1·2·5는 사전 상수·설계값이고, 평행 균일 팔은 1차 리뷰 «후» 신설이다(사후 명기 #26 · 2차 [H2])',
      value: 'scalebar_depth.rows · scalebar_parallel.rows',
      reachability: '셋이 같은 실행에 있다 — ① 무축척 null(뜨기 실패 가능) ② 올림 위약(폭 상한 실패 가능 — scalebar_ceil_probe) ③ 수리 전 원점 위약(평행 균일 실패 가능 — buggy_spread 0)',
      reachability_value: 'scalebar_noscale.result = null · scalebar_ceil_probe.px_if_ceil > target · scalebar_parallel.buggy_spread_u = 0',
      reachability_source: 'nums47_web2.json/scalebar_noscale · /scalebar_ceil_probe · /scalebar_parallel/buggy_spread_u',
    }
  })
})

describe('47-2 사람 — 원장', () => {
  it('눈-지평선(여러 거리) · 지평선 위 거부', () => {
    const s = scaled()
    const an = s.app.lift.an, pose = s.app.pose
    const hz = horizonScreenY(an, pose)!
    const rows: { tap_y: number; eye_dy: number; dist_u: number }[] = []
    for (const y of [760, 680, 600, 540]) {
      const q = placePersonAt(s.app, { x: 400, y })
      if (!q) continue
      const eye = project(an, pose, eyeAbove(q.g))!
      rows.push({ tap_y: y, eye_dy: +(eye.y - hz).toExponential(2) as unknown as number, dist_u: +Math.hypot(q.g.x - pose.p.x, q.g.z - pose.p.z).toFixed(2) })
    }
    const rejected = placePersonAt(s.app, { x: 400, y: 100 }) === null
    // 꼬리(1차 [L18] — 지평선 바로 아래 대역): 거리가 발산하는 자리의 값
    const hzTail = placePersonAt(s.app, { x: 400, y: Math.ceil(hz) + 2 })
    if (hzTail) rows.push({ tap_y: Math.ceil(hz) + 2, eye_dy: +(project(an, pose, eyeAbove(hzTail.g))!.y - hz).toExponential(2) as unknown as number, dist_u: +Math.hypot(hzTail.g.x - pose.p.x, hzTail.g.z - pose.p.z).toFixed(2) })
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rejected).toBe(true)
    // 절대 키(1차 [M13] — AS-C155가 주장하는 그 양): 눈높이 mm = EYE_HEIGHT × mmPerUnit.
    const eyeMm = C.EYE_HEIGHT * s.app.lift.mmPerUnit!
    OUT.person_eye = {
      def: '접지 탭 y 스윕(+지평선 2px 아래 꼬리) — 눈점 사영과 지평선의 차(px)·눈까지의 지면 거리(단위). 지평선 위 탭은 거부(rejected). eye_height_mm = 이 문서 축척에서의 관찰자·사람 눈높이(절대)',
      rows, rejected_above_horizon: rejected,
      eye_height_mm: +eyeMm.toFixed(1),
      note_height: '사람 키(mm)는 축척의 함수다 — 이 픽스처(깊이선 2 m)의 눈높이는 eye_height_mm. 사람 대역(1.4~1.8 m) 밖이면 그 투시가 사람 눈높이가 아닌 데서 그려졌다는 뜻이고, 세운 사람이 그것을 «드러낸다»(#61의 방향 — 조용히 틀리게 두지 않는다). 실기기 확인 항목의 자료',
      note_5: 'eye_dy ≈ 0은 구성이다(카메라 높이 평면의 사영 = 지평선 — 원근의 성질). 재는 것은 «배선이 그 구성 위에 있는가»(placePersonAt→eyeAbove→project의 사슬)와 거부 갈래다',
    }
    OUT.gate_person_grounded = {
      registered: '지평선 위 탭 거부(좌표를 임의로 짓지 않는다) · 접지·눈-지평선은 구성(#5 — 임계를 안 건다, 1차 [L17]) · 문턱 사전(설계값 — #26)',
      value: 'person_eye.rejected_above_horizon · rows(배선 확인)',
      reachability: '거부 행이 실제로 있다 — 지평선 위(y=100) 탭이 null. 접지가 죽으면(광선이 지면을 못 맞으면) rows가 비어 이 팔이 실패한다',
      reachability_value: true,
      reachability_source: 'nums47_web2.json/person_eye/rejected_above_horizon',
    }
  })
})

describe('47-3 면적·부피 — 원장', () => {
  it('검산·놓침·부피 반증', () => {
    const s = scaled()
    const mmPer = s.app.lift.mmPerUnit!
    const floorF = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
    let s2 = 0
    const P = floorF.outer
    for (let i = 0; i < P.length; i++) {
      const a = P[i]!, b = P[(i + 1) % P.length]!
      s2 += a.x * b.z - b.x * a.z
    }
    const shoelace = Math.abs(s2 / 2)
    const tri = faceAreaU2(floorF)
    const fa = floorArea(s.app.faces, s.app.doc.faces, mmPer)!
    const vo = volume(s.app.faces, s.app.doc.faces, mmPer)
    // 놓침 — 슬라브를 후보에서 빼면 합이 0이 되고 «숫자를 안 낸다»
    const missing = floorArea(s.app.faces.filter(f => f.id !== floorF.id), s.app.doc.faces, mmPer)
    // 부피 반증 — 비균일 벽 합성
    const wall0 = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
    const tall: ResolvedFace = { ...wall0, id: 9901, outer: wall0.outer.map(p => ({ ...p, y: p.y * 3 })) }
    const vo2 = volume([...s.app.faces, tall], s.app.doc.faces, mmPer)
    OUT.area = {
      def: '방 픽스처(깊이선 2 m 치수) — 바닥 슬라브의 삼각합·신발끈 검산·m²·근거 id. 놓침 = 그 슬라브가 후보에서 빠진 판(숫자를 안 낸다 — null). 부피 = 바닥×균일 벽고 · 반증 = 3배 벽 합성 시 uneven으로 거부',
      floor_m2: +fa.m2.toFixed(4), evidence_ids: fa.ids,
      tri_vs_shoelace_rel: +(Math.abs(tri - shoelace) / shoelace).toExponential(2) as unknown as number,
      volume_m3: vo.report ? +vo.report.m3.toFixed(4) : null, wall_h_m: vo.report ? +vo.report.hM.toFixed(4) : null,
      missing_slab_result: missing === null ? 'null(숫자 없음)' : missing.m2,
      uneven_refusal: vo2.why,
      note_45: '신뢰 구간의 근거는 45 기준선이다 — faces45_web2.json의 장면별 놓침(scene_*): 면 찾기가 놓친 슬라브는 이 합에 못 들고, 그때 이 값은 그 몫만큼 모자란다(놓침이 0인 픽스처라 여기 수치는 만점 — 실사용의 신뢰는 그 기준선이 말한다)',
    }
    // 참값 대조(1차 [H2] — «알려진 크기»): 바닥 네 변의 실측 길이(lenMm — 치수 기제의 그
    // 자)와 꼭짓점 직각도로 기대값을 세운다. 직사각이면 기대 = 두 변 곱.
    const edges: number[] = []
    let maxCos = 0
    for (let i = 0; i < P.length; i++) {
      const a = P[i]!, b = P[(i + 1) % P.length]!, c = P[(i + 2) % P.length]!
      edges.push(lenMm(a, b, mmPer)!)
      const u = sub3(b, a), w = sub3(c, b)
      maxCos = Math.max(maxCos, Math.abs(dot3(u, w) / (len3(u) * len3(w))))
    }
    const expM2 = (edges[0]! / 1000) * (edges[1]! / 1000)
    OUT.area_expected = {
      def: '바닥 네 변 실측(mm — lenMm) · 꼭짓점 코사인 최대(직각도) · 직사각 기대값(두 변 곱) 대 floor_m2의 상대차. 자가 다른 기제다(변 길이 자 ↔ 삼각분할 합)',
      edges_mm: edges.map(e => +e.toFixed(1)), max_corner_cos: +maxCos.toExponential(2),
      expected_m2_if_rect: +expM2.toFixed(4), got_m2: +fa.m2.toFixed(4),
      rel_diff: +((fa.m2 - expM2) / expM2).toExponential(2),
    }
    expect(maxCos).toBeLessThan(0.02)            // 직각(스냅 작도의 귀결) — 기대식이 선다
    expect(Math.abs(fa.m2 - expM2) / expM2).toBeLessThan(0.01)
    // 스윕(1차 [M7] — 착수 표의 약속: 크기·기울기·면 수)
    // 크기: 순수 자에서 1×1 ↔ 3×3 슬라브(합성 — 기대 1·9) · 기울기: 30° 경사판(기대 = 1/cos30°?
    //   아니다 — 판 자체 넓이는 기울어도 그대로 1×1=1. 기울기가 안 실리는 것이 이 자의 성질이다)
    const flat1: ResolvedFace = { id: 1, outer: [v3(0,0,0), v3(1,0,0), v3(1,0,1), v3(0,0,1)], holes: [], normal: v3(0,1,0), flat: 0,
      tris: [v3(0,0,0), v3(1,0,0), v3(1,0,1), v3(0,0,0), v3(1,0,1), v3(0,0,1)] }
    const big3: ResolvedFace = { ...flat1, id: 2, outer: flat1.outer.map(p => mul3(p, 3)), tris: flat1.tris.map(p => mul3(p, 3)) }
    const t30 = Math.PI / 6
    const tilt = (p: { x: number; y: number; z: number }) => v3(p.x, p.z * Math.sin(t30), p.z * Math.cos(t30))
    const tilted: ResolvedFace = { ...flat1, id: 3, outer: flat1.outer.map(tilt), tris: flat1.tris.map(tilt), normal: v3(0, Math.cos(t30), -Math.sin(t30)) }
    OUT.area_sweep = {
      def: '순수 자 스윕(#12 — 크기·기울기·면 수): 1×1(기대 1) · 3×3(기대 9) · 30° 기운 1×1(기대 1 — 기울기가 넓이를 안 바꾼다) · 두 판 합(기대 10)',
      unit_1x1: +faceAreaU2(flat1).toFixed(9), big_3x3: +faceAreaU2(big3).toFixed(9),
      tilted_30deg: +faceAreaU2(tilted).toFixed(9),
      sum_two: +(faceAreaU2(flat1) + faceAreaU2(big3)).toFixed(9),
    }
    expect(Math.abs(faceAreaU2(flat1) - 1)).toBeLessThan(1e-12)
    expect(Math.abs(faceAreaU2(big3) - 9)).toBeLessThan(1e-12)
    expect(Math.abs(faceAreaU2(tilted) - 1)).toBeLessThan(1e-12)
    // 신뢰 구간의 근거(1차 [H3] — 45 기준선을 분자/분모·양방향으로): 놓침(모자람)과
    // 과잉(넘침 후보) 둘 다. 과잉이 합에 드는 길은 이중 관문 뒤다 — 면은 사람이 지정하고
    // (자동 ⛔ — types.ts 「면」 절) 슬라브 분류를 지나야 한다.
    OUT.area_confidence = {
      def: '45 기준선 인용(faces45_web2.json@070d8895) — 이 기준선은 «면 후보»의 놓침·과잉이지 바닥 슬라브 면적의 오차 분포가 아니다(2차 [H3] — 기준선에 «바닥 슬라브가 후보에서 빠진» 장면은 0이다: 참 분자/분모 장면은 DEFERRED). 여기 적는 것은 «오차가 실리는 경로»다',
      baseline: {
        scene_room: '바닥·벽 2/2(후보에 있음)', scene_busy: '격자 9/9 · 과잉 후보 extra 5/14',
        scene_window: '벽 리프팅 0/4(noPoint·hasHeight — 그 원장 note_43: 이 놓침은 리프팅 몫이지 면 찾기 몫이 아니다. 벽이 대기면 그 벽의 실·부피가 못 선다 — 바닥면적 직접 몫은 아니다)',
      },
      direction: '놓침 → 못 든 면의 몫만큼 모자람(합에 못 듦) · 과잉 → 사람이 지정+슬라브 분류일 때만 과대(이중 관문). «구간»이라 부를 분포는 아직 없다 — 경로와 기준선 값뿐',
    }
    OUT.gate_area_evidence = {
      registered: '값은 근거 id 목록과 같이 나간다 · 축척 미정/후보 없음이면 null(#61) · 직사각 기대값과 일치(area_expected) · 설계 참값 스윕 일치(area_sweep: 1·9·1·10 — 2차 [M10]). ⚠ expected·sweep 팔은 1차 리뷰 «후» 신설(사후 명기 #26 · 2차 [H2]) · rel_diff 0 대역은 정확 산술의 귀결(구성 — 임계 아님, 2차 [M6])',
      value: 'area.evidence_ids · area.missing_slab_result · area.uneven_refusal',
      reachability: '반증 둘이 같은 실행에 있다 — 놓침 판이 null을, 비균일 벽 합성이 uneven 거부를 실제로 낸다',
      reachability_value: 'null(숫자 없음) · uneven',
      reachability_source: 'nums47_web2.json/area/missing_slab_result · /area/uneven_refusal',
    }
  })
})

describe('47-4 실 — 원장(⚑ 판정 자료)', () => {
  const mkWall = (id: number, x0: number, z0: number, x1: number, z1: number, hole = false): ResolvedFace => ({
    id,
    outer: [v3(x0, 0, z0), v3(x1, 0, z1), v3(x1, 2, z1), v3(x0, 2, z0)],
    holes: hole ? [[v3((x0 + x1) / 2 - 0.2, 0, (z0 + z1) / 2), v3((x0 + x1) / 2 + 0.2, 1.5, (z0 + z1) / 2)]] : [],
    normal: v3(-(z1 - z0), 0, x1 - x0), flat: 0, tris: [],
  })
  const docF = (ids: number[]): Face[] => ids.map(id => ({ id, loops: [], cls: 'wall' as const }))

  it('앱 경로 양성 — 바닥+벽 넷(그리는 차례대로 지정)에서 실이 실제로 선다(1차 [H4])', () => {
    const s = session(W, H)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(600, 475, 520, 458)
    s.draw(400, 475, 520, 458)
    expect(toggleFaceAt(s.app, { x: 465, y: 477 })).toBe('added')       // 바닥
    s.draw(600, 475, 600, 385)
    s.draw(520, 458, 520, 368)
    s.draw(600, 385, 520, 368)
    expect(toggleFaceAt(s.app, { x: 558, y: 412 })).toBe('added')       // 먼-오른 벽
    s.draw(500, 500, 500, 380)
    s.draw(600, 385, 500, 380)
    expect(toggleFaceAt(s.app, { x: 508, y: 430 })).toBe('added')       // 앞-오른 벽
    s.draw(400, 475, 400, 390)
    s.draw(500, 380, 400, 390)
    expect(toggleFaceAt(s.app, { x: 430, y: 455 })).toBe('added')       // 앞-왼 벽
    s.draw(400, 390, 520, 368)
    expect(toggleFaceAt(s.app, { x: 508, y: 375 })).toBe('added')       // 먼-왼 벽
    const g = findRooms(s.app.faces, s.app.doc.faces)
    expect(g.rooms).toHaveLength(1)
    // 교차 검증 — 실 넓이(벽 자취 신발끈) ↔ 바닥 슬라브 넓이(삼각합): **다른 재료의 두 자**
    const floorF = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
    const slabU2 = faceAreaU2(floorF)
    const rel = Math.abs(g.rooms[0]!.areaU2 - slabU2) / slabU2
    expect(rel).toBeLessThan(0.02)
    OUT.rooms_app_positive = {
      def: '앱 경로(획 13 → 리프팅 → 면 5 지정 — 그리는 차례대로, 겹침 사영 탓에 탭은 미지정 틈으로) — 실 1이 실제로 선다. 교차 대조 = 실 넓이(벽 자취 신발끈) ↔ 바닥 슬라브 넓이(삼각합) — ⚠ 두 자는 같은 그래프 꼭짓점을 공유하므로 rel_diff ≈ 0은 구성이다(#5 · 2차 [M6]): 재는 것은 배선(자취 추출·순환·부호)이지 크기가 아니다',
      expected: 1, found: g.rooms.length, phantom: g.rooms.length - 1,
      area_u2: +g.rooms[0]!.areaU2.toFixed(4),
      slab_u2: +slabU2.toFixed(4), rel_diff: +rel.toExponential(2),
      note_fixture: '먼 모서리를 (520,458)로 비껴 세웠다 — 첫 픽스처는 먼 기둥이 앞 기둥과 화면 공선(x=500)이라 순환이 죽었다(faces45의 공선 실패 모드 실측 재확인 · 그 한계는 그 원장의 note_collinear가 정본). ⚠ 위약(회전 idx−1)은 이 장면에선 안 갈린다 — 전 정점이 2가라 회전 방향이 무의미(그 사실도 값이다). 위약이 실제로 무는 판은 3가 정점이 있는 두-실 판(rooms.two_rooms_bad_rot)',
    }
  })

  it('시나리오 셋 — 찾음/기대·헛것·연결', () => {
    const one = findRooms([mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 4, 3), mkWall(3, 4, 3, 0, 3), mkWall(4, 0, 3, 0, 0)], docF([1, 2, 3, 4]))
    const two = findRooms([
      mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 8, 0), mkWall(3, 8, 0, 8, 3),
      mkWall(4, 8, 3, 4, 3), mkWall(5, 4, 3, 0, 3), mkWall(6, 0, 3, 0, 0), mkWall(7, 4, 0, 4, 3, true),
    ], docF([1, 2, 3, 4, 5, 6, 7]))
    // 위약(1차 [M9] — 이 실행의 값): 회전 규칙 첫 판(idx−1)은 3가 정점(공유 벽 끝)에서
    // 공유 벽을 건너뛰어 두 실을 한 덩어리로 감는다
    setRoomRotForTest(-1)
    const twoBad = findRooms([
      mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 8, 0), mkWall(3, 8, 0, 8, 3),
      mkWall(4, 8, 3, 4, 3), mkWall(5, 4, 3, 0, 3), mkWall(6, 0, 3, 0, 0), mkWall(7, 4, 0, 4, 3, true),
    ], docF([1, 2, 3, 4, 5, 6, 7]))
    setRoomRotForTest(1)
    expect(twoBad.rooms.length).not.toBe(2)
    const open3 = findRooms([mkWall(1, 0, 0, 4, 0), mkWall(2, 4, 0, 4, 3), mkWall(3, 4, 3, 0, 3)], docF([1, 2, 3]))
    const appPath = (() => { const s = scaled(); return findRooms(s.app.faces, s.app.doc.faces) })()
    expect(one.rooms).toHaveLength(1)
    expect(two.rooms).toHaveLength(2)
    expect(two.links).toHaveLength(1)
    expect(open3.rooms).toHaveLength(0)
    expect(appPath.rooms).toHaveLength(0)
    OUT.rooms = {
      def: '⚑ 판정 자료(지시 「재야 할 것」): 찾아야 할 실 / 찾음 / 헛것. 합성 벽 시나리오 셋 + 앱 경로(방 픽스처 — 벽 하나라 닫힌 영역 없음 = 참)',
      closed_square: { expected: 1, found: one.rooms.length, phantom: one.rooms.length - 1, area_u2: +one.rooms[0]!.areaU2.toFixed(6), area_expected_u2: 12 },
      two_rooms: { expected: 2, found: two.rooms.length, phantom: 0, links_expected: 1, links: two.links.length },
      open_three_walls: { expected: 0, found: open3.rooms.length },
      app_room_fixture: { expected: 0, found: appPath.rooms.length },
      two_rooms_bad_rot: { def: '위약(회전 idx−1) — 이 실행의 값(1차 [M9])', found: twoBad.rooms.length, areas: twoBad.rooms.map(r => +r.areaU2.toFixed(4)) },
      verdict: '⚑ — 실 인식이 섰다: 합성 전수 일치 · 헛것 0 · 앱 경로 **2 시도 중 1 성공**(실패 모드 = 화면 공선 — faces45 note_collinear의 그 한계 · 2차 [M11]). 접속 조건(면적의 신뢰)은 area_expected(직사각 기대와 1e-15 일치)와 «오차 경로» 기록(area_confidence — 분포는 아직 없다)이 근거다 — 연결·다이어그램을 얹었다(멈춤 조건 비발동). 앱 경로 표본이 1이고 연결·개구부의 앱 판이 없는 것은 한계로 남긴다(DEFERRED)',
      note_first_fail: 'D-2 — 첫 판(회전 규칙 idx−1)은 두-실 판을 한 덩어리(24)로 감았고 그 실측이 규칙을 idx+1로 고쳤다(수리 전 실패·수리 후 통과)',
    }
    OUT.gate_rooms = {
      registered: '기대 실 수와 일치 · 헛것 0 · 열린 판은 0(헛것을 안 만든다) · 앱 경로 양성 1(⚠ 이 팔·«교차 2%»는 1차 리뷰 «후» 신설 — 사후 명기 #26 · 2차 [H2]. 교차 rel_diff 자체는 꼭짓점 공유의 구성 — 임계가 아니라 배선 확인이다, 2차 [M6])',
      value: 'rooms.* · rooms_app_positive',
      reachability: '이 실행의 위약이 있다(1차 [M9]) — 회전 규칙을 첫 판(idx−1)으로 되돌리면 **합성 두-실 판**이 실제로 죽는다(rooms.two_rooms_bad_rot — 3가 정점이 있어야 무는 위약이다). ⚠ 앱 경로 양성 팔 자체의 반증은 미실시(그 장면은 전 정점 2가라 이 위약이 안 문다 — note_fixture · 2차 [H4]): 그 팔이 확인하는 것은 «앱 경로가 도달한다»이고 실패 가능성은 공선 픽스처의 죽음(note_fixture 첫 판)이 이웃 증거다',
      reachability_value: 'rooms.two_rooms_bad_rot.found ≠ 2',
      reachability_source: 'nums47_web2.json/rooms/two_rooms_bad_rot',
    }
  })
})

describe('원장 쓰기', () => {
  it('stage0/out/nums47_web2.json', () => {
    OUT.constants_used = {
      SCALEBAR_X_PX: C.SCALEBAR_X_PX, SCALEBAR_Y_PX: C.SCALEBAR_Y_PX,
      SCALEBAR_TARGET_PX: C.SCALEBAR_TARGET_PX, EYE_HEIGHT: C.EYE_HEIGHT, FACE_CLASS_DEG: C.FACE_CLASS_DEG,
    }
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'nums47_web2.json'), JSON.stringify(OUT, null, 2))
    expect(true).toBe(true)
  })
})
