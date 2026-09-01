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
    // 석재의 stepMm은 **공칭**(상수 구간 중점 — LOD 판정용)이다. 시드가 실제로 낸 켜
    // 높이는 따로 잰다(리뷰어 [14] — 공칭을 실측처럼 읽으면 시드 몫이 빈다).
    const st = repSegments(WALL, 'stone', MM, 7)
    const stYs = [...new Set(st.major.map(s => s.a.y.toFixed(4)))].map(Number).sort((a, b) => a - b)
    const stHeights = stYs.slice(1).map((y, i) => +((y - stYs[i]!) * MM).toFixed(1))
    const [h0, h1] = C.REP_STONE_COURSE_MM as readonly number[] as [number, number]
    for (const h of stHeights) { expect(h).toBeGreaterThanOrEqual(h0 - 1e-6); expect(h).toBeLessThanOrEqual(h1 + 1e-6) }
    expect(new Set(stHeights).size, '켜 높이가 실제로 불규칙하다').toBeGreaterThan(1)
    OUT.pattern_wall = {
      def: '3m×2.5m 벽(mmPerUnit 100 · 시드 7) — 재료별 생성 선분 수·특성 간격 mm. 판별은 (major·minor·stepMm) 서명. ⚠ stepMm은 공칭(석재는 상수 구간 중점 — LOD 판정용)이고 석재의 실측 켜 높이는 stone_measured가 든다(리뷰어 [14])',
      rows,
      note_zero: 'tile·conc의 minor 0은 설계다(부선 계열이 없는 재료 — 격자가 전부 주선) — selfcheck 카운터 0 의심의 정체. degenerate_n의 «정확히 1»은 비율이 아니라 개수(슬라브 하나)다',
      stone_measured: { course_heights_mm: stHeights, band: [h0, h1], distinct: new Set(stHeights).size },
    }
  })
})

describe('①-b 시드 — 값으로 남긴다 (리뷰어 [4])', () => {
  it('같은 면 재그림 동일 · 다른 시드 상이 — 서명과 켜 수열을 원장에', () => {
    const sig = (r: ReturnType<typeof repSegments>) => {
      let h = 0x811c9dc5
      for (const s of [...r.major, ...r.minor]) {
        for (const v of [s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z]) {
          const q = Math.round(v * 1e6) | 0
          h = ((h ^ q) * 0x01000193) | 0
        }
      }
      return (h >>> 0).toString(16)
    }
    const courseSeq = (seed: number) => {
      const r = repSegments(WALL, 'stone', MM, seed)
      const ys = [...new Set(r.major.map(s => s.a.y.toFixed(4)))].map(Number).sort((a, b) => a - b)
      return ys.slice(1).map((y, i) => +((y - ys[i]!) * MM).toFixed(1))
    }
    const a1 = sig(repSegments(WALL, 'stone', MM, 7))
    const a2 = sig(repSegments(WALL, 'stone', MM, 7))
    const b = sig(repSegments(WALL, 'stone', MM, 8))
    const wa = sig(repSegments(WALL, 'wood', MM, 7))
    const wb = sig(repSegments(WALL, 'wood', MM, 8))
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(wa).not.toBe(wb)
    OUT.seed = {
      def: '선분 좌표 FNV 서명(1e-6 반올림) — 같은 (면·재료·시드)는 같고 시드가 갈리면 다르다. 켜 수열은 눈으로 대조할 값',
      stone_seed7_sig: a1, stone_seed7_again: a2, stone_seed8_sig: b,
      wood_seed7_sig: wa, wood_seed8_sig: wb,
      stone_courses_seed7: courseSeq(7), stone_courses_seed8: courseSeq(8),
      falsify_run: '이 세션에서 시드를 상수로 바꿔(`rng32(seed)` → `rng32(1)`) 단위 팔 1이 실제로 빨개진 것을 확인하고 되돌렸다(test/rep49.test.ts 「시드」 팔 — D-3)',
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
      falsify_run: '이 세션에서 환산을 실제로 부쉈다(D-3 · 리뷰어 [7]): u축(`p.x / mmPerUnit` → `p.x`)은 막힌줄눈 팔 1이, v축(`p.y / mmPerUnit` → `p.y`)은 실치수·축척 팔 3이 빨개졌다 — 되돌리고 전량 초록 확인',
    }
  })
})

describe('②-b 생성 비용 — 부하의 축은 «무늬 면적 ÷ 축척»이다 (리뷰어 [3])', () => {
  it('벽 면적 25배에서 선분 수·생성 시간이 그 축을 따라 는다', () => {
    const BIG = face(9, [v3(0, 0, 0), v3(150, 0, 0), v3(150, 125, 0), v3(0, 125, 0)], v3(0, 0, 1))
    const t0 = performance.now()
    const small = repSegments(WALL, 'brick', MM, 7)
    const t1 = performance.now()
    const big = repSegments(BIG, 'brick', MM, 7)
    const t2 = performance.now()
    const nS = small.major.length + small.minor.length
    const nB = big.major.length + big.minor.length
    expect(nB).toBeGreaterThan(nS * 10)
    OUT.gen_cost = {
      def: '벽돌 생성 — 3×2.5m(작은 벽) vs 15×12.5m(면적 25배). 프레임(e2e frame20)의 부하 축은 «면 수»가 아니라 **무늬가 덮는 면적 ÷ 축척**이고, 생성은 docVersion 캐시라 프레임이 아니라 편집 순간의 비용이다. 화면에 «보이는» 선분 밀도는 밀도 하한(REP_MIN_PX)이 구성적으로 묶는다',
      small: { segments: nS, ms: +(t1 - t0).toFixed(1) },
      big: { segments: nB, ms: +(t2 - t1).toFixed(1) },
      note_82: '시간은 비가 아니라 값으로 적는다 — 러너 고정 몫이 섞인다(#82). 뜻은 자릿수다',
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
    // 값을 남긴다(리뷰어 [15]) — 켜 선의 화면 y를 왼끝·오른끝에서 각각 정렬해 이웃 간격
    const left = rows.map(r => r.y0).sort((a, b) => a - b)
    const right = rows.map(r => r.y1).sort((a, b) => a - b)
    const gapsOf = (ys: number[]) => ys.slice(1).map((y, i) => +(y - ys[i]!).toFixed(2))
    OUT.foreshorten = {
      def: '원근 벽의 켜 선 투영 — 무늬가 세계 좌표라 원근을 «받는» 것 자체는 사영의 구성 귀결(#5) — 게이트를 안 건다. 픽셀 판은 e2e ③(rep49_e2e의 foreshorten_px)이 한다',
      n_courses: rows.length,
      gaps_left_px: gapsOf(left), gaps_right_px: gapsOf(right),
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
  // ⚠⚠ 리뷰어 [2]·[10]이 초판을 뒤집었다: uHorizontal(u = up×n은 정의상 수평)·vUp(뒤집기
  // 규칙의 귀결)은 **공식의 항등**이라 무엇을 넣어도 참이다 — «어긋남 0»은 측정이 아니다
  // (#5 — 같은 원장 안에서 scale_pass에는 달고 여기엔 안 달았던 그 표기다). 다시 짠 것:
  //   · 항등 두 지표는 지운다(적을 값이 없다).
  //   · **비항등 지표 하나** — `phaseOnBottomEdge`: 위상 원점(최소 모서리)이 «수평 밑변
  //     위»에 있는가. 이것은 픽스처의 «모양»에 걸린 술어라 형태에 따라 실제로 갈린다
  //     (마름모 벽이 false를 낸다 — 밑이 점이라 위상이 꼭짓점 하나에 걸린다).
  //   · **모호 픽스처 둘을 더한다** — 슬라브(방향을 규칙이 못 고름 = 퇴화)와
  //     마름모 벽(위상의 기대가 사람마다 갈릴 형태). «틀리는 빈도»의 잴 수 있는 반쪽은
  //     «규칙이 유일·자연한 답을 못 내는 형태의 존재»이고, 실사용 빈도는 실기기 몫이다.
  it('13픽스처 — 방향 퇴화 1(슬라브) · 위상 모호 1(마름모) · 나머지 11은 규칙이 유일 답', () => {
    const fixtures: Record<string, ReturnType<typeof face>> = {}
    for (let k = 0; k < 8; k++) {
      const th = (k * 45 * Math.PI) / 180
      const n = v3(Math.cos(th), 0, Math.sin(th))
      const ux = v3(-Math.sin(th), 0, Math.cos(th))
      fixtures[`wall_yaw${k * 45}`] = face(10 + k,
        [v3(0, 0, 0), v3(ux.x * 30, 0, ux.z * 30), v3(ux.x * 30, 25, ux.z * 30), v3(0, 25, 0)], n)
    }
    for (const deg of [30, 60]) {
      const t = (deg * Math.PI) / 180
      fixtures[`slope_${deg}`] = face(30 + deg,
        [v3(0, 0, 0), v3(30, 0, 0), v3(30, 20 * Math.sin(t), -20 * Math.cos(t)), v3(0, 20 * Math.sin(t), -20 * Math.cos(t))],
        v3(0, Math.cos(t), Math.sin(t)))
    }
    fixtures['slab'] = face(50, [v3(0, 0, 0), v3(30, 0, 0), v3(30, 0, 20), v3(0, 0, 20)], v3(0, 1, 0))
    fixtures['gable'] = face(51,
      [v3(0, 0, 0), v3(30, 0, 0), v3(30, 20, 0), v3(15, 28, 0), v3(0, 20, 0)], v3(0, 0, 1))
    // 마름모 벽 — 밑이 «점»이다: 최소 모서리 위상이 꼭짓점에 걸리고 «수평 밑변»이 없다
    fixtures['diamond'] = face(52,
      [v3(15, 0, 0), v3(30, 12, 0), v3(15, 24, 0), v3(0, 12, 0)], v3(0, 0, 1))

    const rows: Record<string, { degenerate: boolean; phaseOnBottomEdge: boolean }> = {}
    for (const [k, f] of Object.entries(fixtures)) {
      const b = repBasis(f)
      // 위상 원점이 «수평 밑변 위»인가 — (u,v)에서 v 최소인 정점이 **둘 이상**이고
      // 그 두 정점이 변으로 이어져 있는가(픽스처가 사각·오각이라 이 판정으로 충분하다)
      const uv = f.outer.map(P => ({
        u: (P.x - b.origin.x) * b.u.x + (P.y - b.origin.y) * b.u.y + (P.z - b.origin.z) * b.u.z,
        v: (P.x - b.origin.x) * b.v.x + (P.y - b.origin.y) * b.v.y + (P.z - b.origin.z) * b.v.z,
      }))
      const vMin = Math.min(...uv.map(p => p.v))
      const bottomIdx = uv.map((p, i) => (Math.abs(p.v - vMin) < 1e-6 ? i : -1)).filter(i => i >= 0)
      const adjacent = bottomIdx.length >= 2 && bottomIdx.some(i => bottomIdx.includes((i + 1) % uv.length))
      rows[k] = { degenerate: b.degenerate, phaseOnBottomEdge: adjacent }
    }
    const all = Object.entries(rows)
    const nDegenerate = all.filter(([, r]) => r.degenerate).length
    const nPhaseAmb = all.filter(([, r]) => !r.degenerate && !r.phaseOnBottomEdge).length
    expect(nDegenerate).toBe(1)                       // 방향 퇴화 = 슬라브뿐
    expect(rows['diamond']!.phaseOnBottomEdge).toBe(false)   // 마름모가 실제로 갈린다(지표의 판별력)
    expect(rows['gable']!.phaseOnBottomEdge).toBe(true)
    expect(nPhaseAmb).toBe(1)
    OUT.flag_origin_direction = {
      def: '⚑ 자동 규칙(u = up×n · v = n×u · 위상 = (u,v) 최소 모서리)의 스윕 — 벽 8방위·경사 30/60·슬라브·박공·마름모(13픽스처)',
      rows,
      degenerate_n: nDegenerate, phase_ambiguous_n: nPhaseAmb, of: all.length,
      note_5: '초판의 uHorizontal·vUp는 공식의 항등이라 지웠다(리뷰어 [2] — 무엇을 넣어도 참인 지표는 측정이 아니다). 남긴 phaseOnBottomEdge는 픽스처 «모양»의 술어라 마름모에서 실제로 거짓이 된다',
      what_this_measures: '규칙이 «방향을 고르지 못하는» 형태(퇴화 — 슬라브)와 «위상의 기대가 자연스럽지 않은» 형태(밑변 없는 벽)의 존재. 벽·경사의 수평 켜는 규칙의 구성이라 세지 않는다(#5)',
      what_this_cannot_measure: '「사람 의도와 다른 실사용 빈도」 — 오라클이 없다(#92). 슬라브 타일의 격자 방향·박공의 위상 정렬 같은 의도는 실기기 ⑳이 판정자다',
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
