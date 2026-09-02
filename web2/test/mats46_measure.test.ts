// web2-46 — 재료의 측정 원장(단위 몫). 픽셀 측정(마커 누적·경계·깊이 순서)은 e2e가
// stage0/out/mats46_e2e_web2_*.json에 낸다 — 여기는 WebGL 없이 재지는 것만:
// ① 무늬가 실제로 갈리는가 — **같은 면**에 재료별 해칭을 부르면 방향·개수가 갈린다
//   (이름표가 아니라 생성된 선분의 성질로 — #92).
// ② 제안이 제안에 그치는가 — 시퀀스를 값으로.
//
// 원장: stage0/out/mats46_web2.json (LEDGER=1 — #90)
//   npx vitest run test/mats46_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { commitPaint, toggleFaceAt } from '../src/app/state'
import { MATERIALS, hatchSpecOf, materialOf } from '../src/core/palette'
import { hatchSegments } from '../src/core/hatch'
import { project } from '../src/core/camera'
import { C } from '../src/core/constants'
import type { Pt } from '../src/core/vec'

const W = 1200, H = 800

function roomSession() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
  const wall = s.app.faces.find(f => Math.abs(f.normal.y) < 0.5)!
  const floor = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  return { s, floor, wall }
}

const OUT: Record<string, unknown> = {
  what: 'web2-46 — ①재료 해칭이 같은 면에서 실제로 갈리는가(생성 선분의 방향·개수) ②톤 제안이 제안에 그치는가(시퀀스 값) — 픽셀 몫(마커 누적·경계·순서)은 mats46_e2e_web2_*.json',
  when_cmd: 'npx vitest run test/mats46_measure.test.ts',
}

describe('무늬 판별 — 같은 면, 여덟 재료(52가 셋을 더했다)', () => {
  it('생성된 해칭의 «주 방향 개수»와 선분 수가 재료마다 갈린다', () => {
    const { s, wall } = roomSession()
    // render3d.syncHatch와 같은 호출 형태(화면 판) — 두 자리에 다른 식을 안 둔다.
    const rows: Record<string, { segs: number; dirs: number; angleDeg: number; spacingPx: number; cross: boolean }> = {}
    for (const m of MATERIALS) {
      const spec = hatchSpecOf({ mat: m.id })
      const segs = hatchSegments(s.app.lift.an, s.app.pose, wall, 'screen', spec.spacingPx, spec.angleDeg)
      if (spec.cross) segs.push(...hatchSegments(s.app.lift.an, s.app.pose, wall, 'screen', spec.spacingPx, spec.angleDeg + 90))
      // **화면** 방향의 무리 수 — 화면 판의 정의가 화면의 것이므로 자도 화면이다
      // (첫 판이 3D 방향으로 재서 19가 나왔다 — 원근 사영에서 화면 평행선의 3D 방향은
      //  선마다 다르다. 그 관측은 틀린 자였지 결함이 아니다 — 자를 정의 좌표계로 옮긴다).
      const dirKeys = new Set<string>()
      for (const g of segs) {
        const a2 = project(s.app.lift.an, s.app.pose, g.a)
        const b2 = project(s.app.lift.an, s.app.pose, g.b)
        if (!a2 || !b2) continue
        const dx = b2.x - a2.x, dy = b2.y - a2.y
        const L = Math.hypot(dx, dy) || 1
        let u = [dx / L, dy / L]
        if (u[0]! < 0 || (u[0] === 0 && u[1]! < 0)) u = [-u[0]!, -u[1]!]
        dirKeys.add(u.map(v => v.toFixed(2)).join(','))
      }
      rows[m.id] = {
        segs: segs.length, dirs: dirKeys.size,
        angleDeg: spec.angleDeg, spacingPx: spec.spacingPx, cross: !!spec.cross,
      }
      expect(segs.length).toBeGreaterThan(0)
      expect(dirKeys.size).toBe(spec.cross ? 2 : 1)
    }
    // 어느 두 재료도 (방향 무리 수 · 선분 수 · 각도)가 전부 같지는 않다
    const sigs = Object.values(rows).map(r => `${r.dirs}|${r.segs}|${r.angleDeg}`)
    expect(new Set(sigs).size).toBe(8)   // web2-52 — 재료 여덟(석재·타일·기와 추가 · D-W22): 서로 전부 다르다
    // **퇴화 팔**(1차 [5] — 도달 가능성을 항등이 아니라 값으로): 각도·간격을 벽돌 것으로
    // 통일하면(교차 깃발만 남긴다) 같은 면·같은 자에서 판별이 실제로 무너진다 —
    // 그 «몇으로 무너지는가»가 이 게이트의 도달 가능성 값이다(복제 목록의 «1»은 정의다).
    const degraded: string[] = []
    for (const m of MATERIALS) {
      const spec = { angleDeg: materialOf('brick').hatch.angleDeg, spacingPx: materialOf('brick').hatch.spacingPx, cross: m.hatch.cross }
      const segs = hatchSegments(s.app.lift.an, s.app.pose, wall, 'screen', spec.spacingPx, spec.angleDeg)
      if (spec.cross) segs.push(...hatchSegments(s.app.lift.an, s.app.pose, wall, 'screen', spec.spacingPx, spec.angleDeg + 90))
      degraded.push(`${spec.cross ? 2 : 1}|${segs.length}|${spec.angleDeg}`)
    }
    const degradedDistinct = new Set(degraded).size
    expect(degradedDistinct).toBeLessThan(5)   // 퇴화가 실제로 무너뜨린다
    OUT.pattern_wall = {
      def: '방 벽면(paint45 픽스처) 화면 판 해칭 — 재료별 생성 선분 수·주 방향 무리 수(화면 사영 방향 — 화면 판의 정의 좌표계). 판별은 (dirs·segs·angle) 셋의 짝',
      rows,
      degraded_probe: {
        def: '각도·간격을 벽돌 것으로 통일한 판(교차 깃발만 유지) — 같은 자에서 판별이 몇으로 주는가',
        distinct: degradedDistinct,
      },
      note_5: '「dirs == cross ? 2 : 1」은 생성기의 구성적 귀결이다(평행선 한 벌 + 직교 한 벌). 측정의 몫은 segs(면 기하·간격이 정하는 값)와 다섯 짝의 상호 판별이다',
    }
  })
})
// ⚠⚠ **web2-48이 이 절을 갈아 끼웠다.** 46이 여기서 잰 것은 「톤 «자동»이 분류를 따르고
// 수동은 안 덮인다」였는데, **48-8이 「톤 자동」을 없앴다**(46의 그 기능은 지시문이 넣은
// 것이고 사용자가 원하지 않았다 — 48-7·48-8의 정정). 재던 양이 사라졌으므로 팔을 남겨
// 두면 **아무것도 안 재는 초록**이 된다(#92의 형태). 대신 48이 실제로 요구하는 것을
// 같은 픽스처·같은 자로 잰다: **고른 색이 면의 분류와 무관하게 그대로 나가는가** —
// 그것이 「제안이 없다」의 값 판이다.
describe('색 충실도 — 고른 색이 그대로 나간다 (48-7·48-8의 값 판)', () => {
  it('분류가 갈리는 두 면에 같은 색이 실린다 · 재료 표 밖의 색도', () => {
    const floorPts = (): Pt[] => Array.from({ length: 11 }, (_, t) => ({ x: 420 + t * 5, y: 472 + t }))
    const wallPts = (): Pt[] => Array.from({ length: 11 }, (_, t) => ({ x: 515 + t * 7, y: 465 - t * 4 }))
    const seq: { sel: string; face: string; got: string | null }[] = []
    // ㉠ 재료 프리셋의 색(46이 담을 수 있던 값) · ㉡ 표 밖의 색(46이 못 담던 값)
    for (const [sel, hex] of [['preset', '#c07a5b'], ['arbitrary', '#1e7fd0']] as [string, string][]) {
      const { s, floor, wall } = roomSession()
      s.app.paintSel = { hex, i: 'marker', w: 10 }
      commitPaint(s.app, floorPts())
      commitPaint(s.app, wallPts())
      const ps = s.app.doc.strokes.filter(x => x.paint !== undefined)
      seq.push({ sel, face: 'slab', got: ps.find(x => x.paint!.f === floor.id)!.paint!.c ?? null })
      seq.push({ sel, face: 'wall', got: ps.find(x => x.paint!.f === wall.id)!.paint!.c ?? null })
    }
    expect(seq.map(r => r.got)).toEqual(['#c07a5b', '#c07a5b', '#1e7fd0', '#1e7fd0'])
    OUT.color_seq = {
      def: '같은 두 면(슬라브·벽)에 같은 색으로 칠한 결과 paint.c — 분류가 색을 안 바꾼다',
      rows: seq,
      note_48: '46의 `suggest_seq`(톤 자동 ↔ 수동)를 대신한다. 그 기능은 48-8이 없앴다 — 재던 양이 없어졌으므로 팔도 겨눔을 옮겼다(남겨 두면 아무것도 안 재는 초록이 된다 · #92)',
    }
    OUT.gate_color_verbatim = {
      registered: 'commitPaint의 색 해석(state.ts) — paintSel.hex를 그대로 싣는다', value: '네 행 전부 고른 색과 같다',
      reachability: '「재료 표 밖의 색」 행이 그 자리를 실제로 지난다 — 46의 (재료, 톤) 쌍으로는 담을 수 없는 값이라, 옛 경로가 살아 있으면 그 두 행이 표 안의 색으로 굳는다',
      reachability_value: ['#1e7fd0', '#1e7fd0'],
      reachability_source: 'mats46_web2.json/color_seq/rows[2..3]',
    }
    OUT.gate_pattern_distinct = {
      registered: 'MATERIALS의 무늬 다섯 — (dirs·segs·angle) 짝', value: '5종 전부 상이(pattern_wall.rows)',
      reachability: '퇴화 팔(각도·간격을 벽돌로 통일 — 교차 깃발만 유지)이 같은 면·같은 자에서 판별을 실제로 무너뜨린다 — 그 값이 원장 안에 있다(1차 [5] 대응: 복제 목록의 «1»은 정의라 버렸다)',
      reachability_value: 'pattern_wall.degraded_probe.distinct < 5',
      reachability_source: 'mats46_web2.json/pattern_wall/degraded_probe/distinct',
      note_5: '2차 [8] — 퇴화 값 «2»도 구성상 정해진다(각도·간격을 통일하면 남는 축이 2값짜리 cross뿐). 이 게이트가 재는 것은 값의 크기가 아니라 «표 편집 회귀(두 재료가 같은 무늬를 받는 것)를 판별식이 실제로 잡는가»다 — 보장이면 보장이라 적는 #5의 규약대로 여기 적고, 크기에 임계를 걸지 않는다',
    }
  })
})

describe('원장 쓰기', () => {
  it('stage0/out/mats46_web2.json', () => {
    // 이 회차가 만들거나 인용한 상수 전부(1차 [16] — MARKER_SPACING이 이 회차의 유일한
    // «고른 값»이다 · HATCH_SPACING_PX는 「기본 간격」 서술의 출처)
    OUT.constants_used = {
      MARKER_SPACING: C.MARKER_SPACING, MARKER_W_PX: C.MARKER_W_PX, CP_W_PX: C.CP_W_PX,
      HATCH_ALPHA: C.HATCH_ALPHA, HATCH_SPACING_PX: C.HATCH_SPACING_PX, HATCH_ANGLE_DEG: C.HATCH_ANGLE_DEG,
    }
    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'mats46_web2.json'), JSON.stringify(OUT, null, 2))
    expect(true).toBe(true)
  })
})
