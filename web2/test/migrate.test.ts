// web2-17 — 1-e ①(평행이동 동치) · 2-c(옛 파일 변환) 팔.
//
// 오라클: test/legacy_web2_16.json — **옛 코드(622e9ac HEAD)가 실제로 낸 값**이다
// (「옛 코드로 한 번 재서 값을 박아 둔다」— 2-c ①). 새 코드는 지평선 획을 버리고
// 문서를 H/2로 평행이동하는데, 1-a의 논증(사영은 상대 좌표라 평행이동이 소거된다)이
// 맞다면 카메라(f)와 3D가 옛 값과 **일치**해야 한다.
//
// 반증(D-3): dy를 0으로 두면(평행이동 생략) ①이 실패한다 — 아래 「반증」 팔이
// 실제로 그 형태를 만들어 값이 벌어지는 것을 잰다(#69 ㉣ — 0이 아닌 값이 나올 수
// 있는 격자임을 함께 증명한다: hz≠400인 격자에서 이동 없이 열면 3D가 다르다).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Doc } from '../src/core/types'
import { analyze, horizonDocY } from '../src/core/camera'
import { liftAll } from '../src/core/lift'
import { resolveFaces } from '../src/core/face'
import { parseBrnl, serializeBrnl } from '../src/core/file'

const oracle = JSON.parse(readFileSync(join(__dirname, 'legacy_web2_16.json'), 'utf8'))

/** 오라클 격자의 옛 문서 → 새 세계의 문서: 지평선 획(id 1)을 버리고 dy만큼 평행이동 */
function shifted(g: any, dy: number): Doc {
  return {
    frame: { W: oracle.W, H: oracle.H },
    strokes: g.strokes.filter((s: any) => s.id !== 1).map((s: any) => ({
      id: s.id,
      a: { x: s.a.x, y: s.a.y + dy },
      b: { x: s.b.x, y: s.b.y + dy },
    })),
    faces: [], unit: 'mm' as const,
  }
}

describe('1-e ① — 평행이동 동치 (옛 카메라·3D == 이동한 새 문서의 카메라·3D)', () => {
  it('격자 전부(hz 300·520·640 × 배치 둘) — f·vps.x·principal.x·3D 절대 오차', () => {
    expect(oracle.grids.length).toBe(6)
    let worst3d = 0
    for (const g of oracle.grids) {
      const dy = horizonDocY(oracle.H) - g.hz
      const doc = shifted(g, dy)
      const an = analyze(doc)
      const tag = `hz=${g.hz}/${g.name}`
      // 카메라 — x는 그대로, y는 H/2로 온다. f는 평행이동에 안 걸린다.
      expect(an.vps.length, tag).toBe(g.vps.length)
      for (let i = 0; i < g.vps.length; i++) {
        expect(Math.abs(an.vps[i]!.x - g.vps[i]!.x), tag).toBeLessThan(1e-9)
        expect(an.vps[i]!.y, tag).toBe(400)
      }
      expect(Math.abs(an.f! - g.f), tag).toBeLessThan(1e-9)
      expect(Math.abs(an.principal!.x - g.principal.x), tag).toBeLessThan(1e-9)
      // 3D — 옛 값과 일치(1-a의 논증이 실측으로 선다)
      const lift = liftAll(doc)
      expect(lift.lifted.size, tag).toBe(g.lifted.length)
      for (const o of g.lifted) {
        const n = lift.lifted.get(o.id)
        expect(n, `${tag} #${o.id}`).toBeTruthy()
        for (const k of ['x', 'y', 'z'] as const) {
          worst3d = Math.max(worst3d,
            Math.abs(n!.a3[k] - o.a3[k]), Math.abs(n!.b3[k] - o.b3[k]))
        }
        expect(n!.axis, `${tag} #${o.id}`).toBe(o.axis)
      }
      // 대기도 같은 획이다(지평선 획은 양쪽 다 3D가 아니다 — 옛: role, 새: 폐기)
      expect(lift.waiting.sort(), tag).toEqual(g.waiting.filter((id: number) => id !== 1).sort())
    }
    expect(worst3d).toBeLessThan(1e-9)
    console.log(`[측정] 평행이동 동치 — 격자 6 · 3D 최악 절대 오차 ${worst3d.toExponential(3)}`)
  })

  it('반증(D-3·㉣) — 이동 없이 열면(dy=0) 값이 벌어진다: 격자가 0이 아닌 값을 낼 수 있다', () => {
    let seen = 0
    for (const g of oracle.grids) {
      if (g.hz === 400) continue                    // hz=H/2면 dy=0이 정답이다 — 제외
      seen++
      const doc = shifted(g, 0)                     // 평행이동 생략 — 틀린 변환
      const an = analyze(doc)
      const lift = liftAll(doc)
      // 소실점 y가 H/2로 가므로 x·f·3D가 전부 다르게 풀린다 — 하나 이상이 크게 벌어진다
      let diff = 0
      if (an.vps.length !== g.vps.length) diff = Infinity
      else {
        for (let i = 0; i < g.vps.length; i++) diff = Math.max(diff, Math.abs(an.vps[i]!.x - g.vps[i]!.x))
        for (const o of g.lifted) {
          const n = lift.lifted.get(o.id)
          if (!n) { diff = Infinity; break }
          for (const k of ['x', 'y', 'z'] as const) {
            diff = Math.max(diff, Math.abs(n.a3[k] - o.a3[k]), Math.abs(n.b3[k] - o.b3[k]))
          }
        }
      }
      expect(diff, `hz=${g.hz}/${g.name}`).toBeGreaterThan(0.5)
    }
    expect(seen).toBeGreaterThanOrEqual(4)          // hz 300·640 × 배치 둘 — 반증이 실제로 돌았다
  })
})

describe('2-c — 옛 .brnl(version 1) 변환', () => {
  it('① 왕복 — 옛 표본(지평선 520 + 방 + 후퇴선 + 뷰 + 면)이 옛 3D 그대로 열린다', () => {
    const back = parseBrnl(oracle.sample.brnl)!
    expect(back).not.toBeNull()
    const dy = horizonDocY(oracle.H) - 520
    // 지평선 획(id 1)이 버려졌고 나머지가 dy만큼 옮겨졌다
    expect(back.doc.strokes.map(s => s.id)).toEqual([2, 3, 4, 5, 6])
    expect(back.doc.strokes[0]!.a).toEqual({ x: 500, y: 620 + dy })
    // 카메라 — 옛 소실점 x 그대로, y는 H/2
    const an = analyze(back.doc)
    expect(an.vps.length).toBe(1)
    expect(Math.abs(an.vps[0]!.x - oracle.sample.vps[0].x)).toBeLessThan(1e-9)
    expect(an.vps[0]!.y).toBe(400)
    expect(an.p1Locked).toBe(oracle.sample.p1Locked)
    expect(an.screenHDeclared).toBe(oracle.sample.screenHDeclared)
    expect(Math.abs(an.f! - oracle.sample.f)).toBeLessThan(1e-9)
    // 3D — 옛 앱의 값과 일치
    const lift = liftAll(back.doc)
    let worst = 0
    for (const o of oracle.sample.lifted) {
      const n = lift.lifted.get(o.id)!
      expect(n, `#${o.id}`).toBeTruthy()
      for (const k of ['x', 'y', 'z'] as const) {
        worst = Math.max(worst, Math.abs(n.a3[k] - o.a3[k]), Math.abs(n.b3[k] - o.b3[k]))
      }
    }
    expect(worst).toBeLessThan(1e-9)
    // 면이 그대로 선다
    const faces = resolveFaces(lift, back.doc.faces)
    expect(faces.length).toBe(oracle.sample.faces.length)
    expect(faces[0]!.tris.length / 3).toBe(oracle.sample.faces[0].tris)
    let worstFace = 0
    for (let i = 0; i < faces[0]!.outer.length; i++) {
      for (const k of ['x', 'y', 'z'] as const) {
        worstFace = Math.max(worstFace, Math.abs(faces[0]!.outer[i]![k] - oracle.sample.faces[0].outer[i][k]))
      }
    }
    expect(worstFace).toBeLessThan(1e-9)
    // 저장된 뷰 — 화면 그림이 같다: 문서점의 화면 좌표가 이동 전과 같다(oy 보정의 검증)
    const v = back.savedViews[0]!.view
    expect(v.s).toBe(1.25)
    // 옛: 문서점 y=620 → 화면 620·1.25 − 48 = 727 / 새: (620+dy)·1.25 + oy′ = 727이어야 한다
    expect((620 + dy) * v.s + v.oy).toBeCloseTo(620 * 1.25 + (-48), 9)
    console.log(`[측정] 2-c ① 왕복 — 3D 최악 ${worst.toExponential(3)} · 면 정점 최악 ${worstFace.toExponential(3)}`)
  })

  it('② version 2 자기 왕복 — 저장 → 파싱 → 저장이 같은 문자열', () => {
    const first = parseBrnl(oracle.sample.brnl)!            // v1 → 변환된 문서
    const v2 = serializeBrnl({ doc: first.doc, nextId: first.nextId, savedViews: first.savedViews, drawView: { s: 1.5, ox: 12, oy: -7 } })
    const again = parseBrnl(v2)!
    expect(again).not.toBeNull()
    expect(again.drawView).toEqual({ s: 1.5, ox: 12, oy: -7 })
    const v2b = serializeBrnl({ doc: again.doc, nextId: again.nextId, savedViews: again.savedViews, drawView: again.drawView })
    expect(v2b).toBe(v2)
    // drawView 없는 왕복도 같다(열쇠 자체가 없다)
    const noDv = serializeBrnl({ doc: first.doc, nextId: first.nextId, savedViews: first.savedViews })
    const back = parseBrnl(noDv)!
    expect(back.drawView).toBeNull()
    expect(serializeBrnl({ doc: back.doc, nextId: back.nextId, savedViews: back.savedViews })).toBe(noDv)
  })

  it('③ 거부 — version 3은 거부한다(전방 호환을 흉내내지 않는다)', () => {
    const j = JSON.parse(oracle.sample.brnl)
    j.version = 3
    expect(parseBrnl(JSON.stringify(j))).toBeNull()
  })

  it('④ 자동 저장 — localStorage의 옛 값(v1 문자열)이 같은 길을 지난다', () => {
    // 자동 저장 복원(main.ts)은 파일 열기와 **같은 parseBrnl**이다 — 여기서는 그 함수가
    // v1 문자열을 변환까지 마쳐 돌려주는 것을 다시 확인한다(배선은 e2e entry17.spec ④).
    const back = parseBrnl(oracle.sample.brnl)!
    expect(back).not.toBeNull()
    expect(back.doc.strokes.some(s => (s.a.y + s.b.y) / 2 === 520 && Math.abs(s.b.x - s.a.x) > 500)).toBe(false)
    expect(back.drawView).toBeNull()                        // 옛 파일 — 작도 시점 없음(3-d ⑤)
  })

  it('scaleRef가 버린 획(지평선)을 가리키면 그 열쇠만 버린다', () => {
    const j = JSON.parse(oracle.sample.brnl)
    j.scaleRef = 1                                          // 지평선 획 — 실제로는 못 가리키지만 방어
    j.strokes[1].dim = 2500
    const back = parseBrnl(JSON.stringify(j))!
    expect(back).not.toBeNull()
    expect(back.doc.scaleRef).toBeUndefined()
    expect(back.doc.strokes.find(s => s.id === 2)!.dim).toBe(2500)
  })
})
