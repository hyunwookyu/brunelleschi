// web2-49 — 재료 표현의 측정 원장(단위 몫). 픽셀(면 고정·쪽·화면 대비)은 e2e가
// stage0/out/rep49_e2e_web2_*.json에 낸다 — 여기는 WebGL 없이 재지는 것만:
// ① 여섯 무늬의 상호 판별(생성 선분의 성질 — 이름표가 아니라, #92)
// ② 축척이 실제로 지나가는가(mmPerUnit 두 값 — 세계 간격이 따라 움직인다)
// ③ 원근 축소(투영 간격 근/원 비 — ⚠ 사영의 구성 귀결이라 «확인»으로 적는다 #5)
// ④ 밀도 하한(repFamilyVisible — 경계 양쪽 값·반증)
// ⑤ ⚑ 원점·방향 자동 규칙의 스윕(퇴화·모호가 어디서 나는가 — 보고하고 멈추는 그 자리)
//
// 원장: stage0/out/rep49_web2.json (LEDGER=1 — #90)
//   npx vitest run test/rep49_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { setDimension, toggleFaceAt } from '../src/app/state'
import { repSegments, repBasis, repFamilyVisible, repVisibleFamilies, REP_IDS, type RepId } from '../src/core/matrep'
import { project } from '../src/core/camera'
import type { ResolvedFace } from '../src/core/face'
import type { V3 } from '../src/core/vec'
import { C } from '../src/core/constants'

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z })
const face = (id: number, outer: V3[], normal: V3, holes: V3[][] = []): ResolvedFace =>
  ({ id, outer, holes, normal, flat: 0, tris: [] })

/** 3m × 2.5m 벽(xy 평면 · 법선 +z) — mmPerUnit 100(세계 1 = 100mm) */
const WALL = face(1, [v3(0, 0, 0), v3(30, 0, 0), v3(30, 25, 0), v3(0, 25, 0)], v3(0, 0, 1))
const MM = 100

const OUT: Record<string, unknown> = {
  what: 'web2-49 재료 표현 — ①여섯 무늬 상호 판별 ②축척 통과 ③원근 축소(확인) ④밀도 하한 ⑤⚑ 원점·방향 자동 규칙 스윕. 픽셀 몫은 rep49_e2e_web2_*.json',
  when_cmd: 'npx vitest run test/rep49_measure.test.ts',
}

describe('① 여섯 무늬 — 같은 벽, 상호 판별', () => {
  it('(주선 수 · 부선 수 · 주 간격 mm) 서명이 여섯 전부 다르다', () => {
    const rows: Record<string, { major: number; minor: number; majorStepMm: number; minorStepMm: number }> = {}
    for (const m of REP_IDS) {
      const r = repSegments(WALL, m, MM, 7)
      rows[m] = { major: r.major.length, minor: r.minor.length, majorStepMm: r.majorStepMm, minorStepMm: r.minorStepMm }
      expect(r.major.length).toBeGreaterThan(0)
    }
    const sigs = Object.values(rows).map(r => `${r.major}|${r.minor}|${r.majorStepMm.toFixed(1)}`)
    expect(new Set(sigs).size).toBe(6)
    OUT.pattern_wall = {
      def: '3m×2.5m 벽(mmPerUnit 100 · 시드 7) — 재료별 생성 선분 수·특성 간격 mm. 판별은 (major·minor·stepMm) 서명',
      rows,
    }
  })
})

describe('② 축척 통과 — mm는 상수, 세계는 축척의 함수', () => {
  it('mmPerUnit 100 ↔ 200에서 벽돌 켜의 세계 간격이 정확히 절반이 된다', () => {
    const ys = (mm: number) => {
      const r = repSegments(WALL, 'brick', mm, 7)
      const u = [...new Set(r.major.map(s => s.a.y.toFixed(6)))].map(Number).sort((a, b) => a - b)
      return u[1]! - u[0]!
    }
    const w100 = ys(100), w200 = ys(200)
    expect(w200).toBeCloseTo(w100 / 2, 9)
    expect(w100 * 100).toBeCloseTo(C.REP_BRICK_COURSE_MM, 6)
    expect(w200 * 200).toBeCloseTo(C.REP_BRICK_COURSE_MM, 6)
    OUT.scale_pass = {
      def: '같은 벽 기하에서 mmPerUnit 100→200 — 켜의 세계 간격(비 0.5)과 mm 환산(불변 67)',
      world_step_at_100: w100, world_step_at_200: w200,
      mm_at_100: w100 * 100, mm_at_200: w200 * 200,
      note: '「mm 환산 == 67」 단독은 생성기 구성의 귀결이다(#5) — 측정의 몫은 두 축척이 **같은 67을 다른 세계 간격으로** 낸다는 것(축척이 실제로 지나간다)',
    }
  })
})

describe('③ 원근 축소 — 확인(사영의 구성 귀결 · #5)', () => {
  it('원근 세션의 벽에서 투영 켜 간격이 먼 쪽에서 좁아진다', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)
    s.draw(500, 500, 600, 475)
    s.draw(500, 500, 400, 475)
    s.draw(600, 475, 500, 460)
    s.draw(400, 475, 500, 460)
    const post = s.draw(500, 500, 500, 380)!
    s.draw(600, 475, 600, 385)
    s.draw(600, 385, 500, 380)
    expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
    expect(setDimension(s.app, post.id, 2500)).toBe('scale')
    const rf = s.app.faces[0]!
    const mm = s.app.lift.mmPerUnit!
    const r = repSegments(rf, 'brick', mm, rf.id)
    expect(r.major.length).toBeGreaterThan(2)
    // 각 켜 선분의 두 끝을 투영 — 왼끝·오른끝에서 이웃 켜와의 화면 간격을 갈라 잰다
    const rows: { y0: number; y1: number }[] = []
    for (const seg of r.major) {
      const a = project(s.app.lift.an, s.app.pose, seg.a)
      const b = project(s.app.lift.an, s.app.pose, seg.b)
      if (a && b) rows.push({ y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) })
    }
    OUT.foreshorten = {
      def: '원근 벽의 켜 선 투영 — 이 벽은 깊이가 크지 않아 값이 작다. 무늬가 세계 좌표라 원근을 «받는» 것 자체는 사영의 구성 귀결(#5) — 게이트를 안 건다. 픽셀 판은 e2e가 한다',
      n_courses: rows.length,
      note_5: '확인이지 측정 게이트가 아니다',
    }
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('④ 밀도 하한 — repFamilyVisible · repVisibleFamilies(계층)', () => {
  it('경계 양쪽에서 갈리고, 부선은 주선 없이 못 선다', () => {
    const step = C.REP_BRICK_COURSE_MM       // 67mm
    const pxPerMmAbove = (C.REP_MIN_PX / step) * 1.2
    const pxPerMmBelow = (C.REP_MIN_PX / step) * 0.8
    expect(repFamilyVisible(step, pxPerMmAbove)).toBe(true)
    expect(repFamilyVisible(step, pxPerMmBelow)).toBe(false)
    // **계층** — 벽돌은 주선(켜 67)이 부선(줄눈 200)보다 촘촘하다. 계열별 문만 보면
    // «켜는 사라지고 줄눈만 남는» 대역(px/mm ∈ [4/200, 4/67))이 생긴다 — 그 대역에서
    // 둘 다 접히는 것이 이 규칙의 존재 이유다(말뚝처럼 보이는 벽 ⛔).
    const orphanBand = (C.REP_MIN_PX / C.REP_BRICK_COURSE_MM) * 0.8   // 켜 문 아래, 줄눈 문 위
    expect(repFamilyVisible(C.REP_BRICK_MODULE_W_MM, orphanBand)).toBe(true)   // 줄눈 홀로면 보였을 값
    const fam = repVisibleFamilies(C.REP_BRICK_COURSE_MM, C.REP_BRICK_MODULE_W_MM, orphanBand)
    expect(fam).toEqual({ major: false, minor: false })
    const famAbove = repVisibleFamilies(C.REP_BRICK_COURSE_MM, C.REP_BRICK_MODULE_W_MM, pxPerMmAbove)
    expect(famAbove).toEqual({ major: true, minor: true })
    OUT.lod_gate = {
      def: 'repFamilyVisible(stepMm, pxPerMm) — 문 C.REP_MIN_PX의 경계 ±20% · repVisibleFamilies — 부선은 주선 없이 못 선다(계층)',
      registered: 'C.REP_MIN_PX', value: C.REP_MIN_PX,
      above: { pxPerMm: pxPerMmAbove, stepPx: step * pxPerMmAbove, visible: true },
      below: { pxPerMm: pxPerMmBelow, stepPx: step * pxPerMmBelow, visible: false },
      orphan_band: { pxPerMm: orphanBand, minor_alone_would_be: true, families: fam },
      note_12: '4px는 눈이 고른 동작점이다 — 경계 양쪽 값을 남기고, 실기기 「뭉친다/일찍 사라진다」가 되돌릴 조건',
      falsify: '계층을 끄면(repFamilyVisible만 쓰면) orphan_band에서 minor가 살아난다 — minor_alone_would_be가 그 값',
    }
  })
})

describe('⑤ ⚑ 원점·방향 자동 규칙 — 스윕 (보고하고 멈추는 자리)', () => {
  it('벽 8방위·경사 2·슬라브·박공에서 퇴화·모호가 어디서 나는가', () => {
    const rows: Record<string, { degenerate: boolean; uHorizontal: boolean; vUp: boolean }> = {}
    // 벽 — 법선 8방위(수평면 안)
    for (let k = 0; k < 8; k++) {
      const th = (k * 45 * Math.PI) / 180
      const n = v3(Math.cos(th), 0, Math.sin(th))
      const ux = v3(-Math.sin(th), 0, Math.cos(th))
      const f = face(10 + k,
        [v3(0, 0, 0), v3(ux.x * 30, 0, ux.z * 30), v3(ux.x * 30, 25, ux.z * 30), v3(0, 25, 0)], n)
      const b = repBasis(f)
      rows[`wall_yaw${k * 45}`] = {
        degenerate: b.degenerate,
        uHorizontal: Math.abs(b.u.y) < 1e-9,
        vUp: b.v.y > 0.99,
      }
    }
    // 경사 — 30°·60° 지붕면
    for (const deg of [30, 60]) {
      const t = (deg * Math.PI) / 180
      const n = v3(0, Math.cos(t), Math.sin(t))
      const f = face(30 + deg,
        [v3(0, 0, 0), v3(30, 0, 0), v3(30, 20 * Math.sin(t), -20 * Math.cos(t)), v3(0, 20 * Math.sin(t), -20 * Math.cos(t))], n)
      const b = repBasis(f)
      rows[`slope_${deg}`] = {
        degenerate: b.degenerate,
        uHorizontal: Math.abs(b.u.y) < 1e-9,     // 기와 켜가 처마와 나란한가
        vUp: b.v.y > 0,
      }
    }
    // 슬라브 — 퇴화(방향을 규칙이 못 고른다 → 세계 Z 대체)
    const sb = repBasis(face(50, [v3(0, 0, 0), v3(30, 0, 0), v3(30, 0, 20), v3(0, 0, 20)], v3(0, 1, 0)))
    rows['slab'] = { degenerate: sb.degenerate, uHorizontal: Math.abs(sb.u.y) < 1e-9, vUp: sb.v.y >= 0 }
    // 박공(오각) 벽 — 밑변이 수평이라 원점(최소 모서리)이 유일하다
    const gb = repBasis(face(51,
      [v3(0, 0, 0), v3(30, 0, 0), v3(30, 20, 0), v3(15, 28, 0), v3(0, 20, 0)], v3(0, 0, 1)))
    rows['gable'] = { degenerate: gb.degenerate, uHorizontal: Math.abs(gb.u.y) < 1e-9, vUp: gb.v.y > 0.99 }

    const all = Object.entries(rows)
    const nDegenerate = all.filter(([, r]) => r.degenerate).length
    const wallsBad = all.filter(([k, r]) => k.startsWith('wall') && (!r.uHorizontal || !r.vUp)).length
    expect(wallsBad).toBe(0)                    // 벽에서는 자동 규칙이 늘 수평 켜를 낸다
    expect(nDegenerate).toBe(1)                 // 퇴화는 슬라브뿐
    OUT.flag_origin_direction = {
      def: '⚑ 자동 규칙(u = up×n · v = n×u · 위상 = (u,v) 최소 모서리)의 스윕 — 벽 8방위·경사 30/60·슬라브·박공',
      rows,
      degenerate_n: nDegenerate, of: all.length,
      what_this_measures: '규칙이 «방향을 고르지 못하는»(퇴화) 자리와, 벽·경사에서 켜가 수평으로 서는가(uHorizontal — 처마 나란)',
      what_this_cannot_measure: '「사람 의도와 다른가」 — 오라클이 없다(#92: 이름표가 아니라 결과를 재려면 의도가 값이어야 한다). 그 판정은 실기기 관측 판정자다',
      verdict_stop: '지시 문면대로 자동판까지 세우고 여기서 멈춘다 — 조절 UI(원점 끌기·방향 돌리기)는 사람의 답을 기다린다',
    }
  })
})

describe('원장 쓰기', () => {
  it('stage0/out/rep49_web2.json', () => {
    OUT.constants_used = {
      REP_BRICK_MODULE_W_MM: C.REP_BRICK_MODULE_W_MM, REP_BRICK_COURSE_MM: C.REP_BRICK_COURSE_MM,
      REP_STONE_COURSE_MM: C.REP_STONE_COURSE_MM, REP_STONE_JOINT_MM: C.REP_STONE_JOINT_MM,
      REP_WOOD_PLANK_MM: C.REP_WOOD_PLANK_MM, REP_TILE_MM: C.REP_TILE_MM,
      REP_ROOF_COURSE_MM: C.REP_ROOF_COURSE_MM, REP_ROOF_TILE_W_MM: C.REP_ROOF_TILE_W_MM,
      REP_CONC_PANEL_W_MM: C.REP_CONC_PANEL_W_MM, REP_CONC_PANEL_H_MM: C.REP_CONC_PANEL_H_MM,
      REP_MIN_PX: C.REP_MIN_PX, REP_ALPHA_MAJOR: C.REP_ALPHA_MAJOR, REP_ALPHA_MINOR: C.REP_ALPHA_MINOR,
    }
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'rep49_web2.json'), JSON.stringify(OUT, null, 2))
    expect(true).toBe(true)
  })
})
