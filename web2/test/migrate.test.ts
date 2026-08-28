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

import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Doc } from '../src/core/types'
import { analyze, horizonDocY, project, DRAW_POSE } from '../src/core/camera'
import { liftAll } from '../src/core/lift'
import { resolveFaces } from '../src/core/face'
import { parseBrnl, serializeBrnl } from '../src/core/file'

const oracle = JSON.parse(readFileSync(join(__dirname, 'legacy_web2_16.json'), 'utf8'))

// 원장(stage0/out) — 이 파일의 측정을 JSON으로 남긴다(§5 — 원장 밖 측정은 안 걸린다.
// 2차 리뷰어 [10]). 값은 매 실행 다시 써진다 — 문서는 필드 이름만 인용한다(#47).
const ledger: Record<string, unknown> = {
  what: 'web2-17 1-e ①·2-c 팔의 측정 — 옛 코드(622e9ac) 오라클 대비 평행이동 동치·v1 변환 왕복의 절대 오차. migrate.test.ts가 매 실행 다시 쓴다.',
  oracle: 'test/legacy_web2_16.json@622e9ac (코드 변경 전 캡처)',
  flags_explained: {
    'equiv_*_worst_abs=0': '정수·이진유한 dy에서 사영 입력이 비트 동일 — 구성상 정확 동치(자기참조 아님 · 판별력은 counter_dy0_* 반증이 진다)',
    'own3_reproject_worst_px<1e-10': '평행이동 동치의 실측 fp 잔차 — 잉크 심판 문(0.01px) 대비 여유의 «측정»이고 0에 임계를 안 건다',
  },
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/horizon_equiv_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

/** 오라클 격자의 옛 문서 → 새 세계의 문서: 지평선 획(id 1)을 버리고 dy만큼 평행이동 */
function shifted(g: any, dy: number): Doc {
  return {
    frame: { W: oracle.W, H: oracle.H },
    sheets: [],   // 이 문서는 3D 비교 전용이다 — 종이 로직을 안 지난다(web2-19)
    layers: [],   // 겹도 마찬가지(web2-20)
    underlays: [],  // 밑그림도 마찬가지(web2-23)
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
    // ⚠ 정수 격자에서는 사영 입력이 비트 동일이라 이 값이 정확히 0이다(구성 — NOTES).
    // fp가 실제로 섞이는 판정은 아래 비정수 격자 팔이 한다.
    ledger['equiv_int_grids'] = { n: oracle.grids.length, worst3d_abs: worst3d, note: '정수 격자 — 입력 비트 동일이라 0이 구성적' }
    console.log(`[측정] 평행이동 동치 — 격자 6 · 3D 최악 절대 오차 ${worst3d.toExponential(3)}`)
  })

  it('비정수 격자(hz 333.25·486.6 · 비정수 좌표) — dy가 비정수라 fp가 실제로 섞인다([7])', () => {
    expect(oracle.gridsFrac.length).toBe(2)
    let worst = 0
    for (const g of oracle.gridsFrac) {
      const dy = horizonDocY(oracle.H) - g.hz
      const doc = shifted(g, dy)
      const an = analyze(doc)
      const lift = liftAll(doc)
      const tag = `hz=${g.hz}`
      expect(an.vps.length, tag).toBe(g.vps.length)
      for (let i = 0; i < g.vps.length; i++) {
        worst = Math.max(worst, Math.abs(an.vps[i]!.x - g.vps[i]!.x))
      }
      worst = Math.max(worst, Math.abs(an.f! - g.f))
      for (const o of g.lifted) {
        const n = lift.lifted.get(o.id)
        expect(n, `${tag} #${o.id}`).toBeTruthy()
        for (const k of ['x', 'y', 'z'] as const) {
          worst = Math.max(worst, Math.abs(n!.a3[k] - o.a3[k]), Math.abs(n!.b3[k] - o.b3[k]))
        }
      }
    }
    // fp 오차 대역 — 정확히 0이면 오히려 의심(입력이 안 섞였다는 뜻). 1e-9 아래가 판정.
    ledger['equiv_frac_grids'] = { n: 2, worst_abs: worst }
    console.log(`[측정] 평행이동 동치(비정수) — 최악 절대 오차 ${worst.toExponential(3)}`)
    expect(worst).toBeLessThan(1e-9)
  })

  it('표본 2([12]) — own3·dim·scaleRef·포즈 획이 변환을 지나 그대로 산다', () => {
    const s2 = oracle.sample2
    const back = parseBrnl(s2.brnl)!
    expect(back).not.toBeNull()
    const dy = horizonDocY(oracle.H) - 520
    // 안 건드린다(지시 2-b 6): own3(3D)·dim·scaleRef·view(포즈)
    for (const o of s2.own3) {
      if (o.id === 1) continue                       // 지평선 획 — 버려졌다
      const st = back.doc.strokes.find(s => s.id === o.id)!
      expect(st, `#${o.id}`).toBeTruthy()
      expect(st.own3).toEqual(o.own3)                // 3D는 문자 그대로 불변
    }
    expect(back.doc.strokes.find(s => s.id === 2)!.dim).toBe(2500)
    expect(back.doc.scaleRef).toBe(2)
    const posed = back.doc.strokes.find(s => s.id === 5)!
    expect(posed.view).toEqual({ p: s2.pose.p, q: s2.pose.q })
    // 3D — 옛 값 그대로(포즈 획 포함: 사영이 상대 좌표라 포즈 획도 dy 이동이 정답이다)
    const lift = liftAll(back.doc)
    let worst = 0
    for (const o of s2.lifted) {
      const n = lift.lifted.get(o.id)!
      expect(n, `#${o.id}`).toBeTruthy()
      for (const k of ['x', 'y', 'z'] as const) {
        worst = Math.max(worst, Math.abs(n.a3[k] - o.a3[k]), Math.abs(n.b3[k] - o.b3[k]))
      }
    }
    expect(Math.abs((lift.mmPerUnit ?? 0) - s2.mmPerUnit)).toBeLessThan(1e-9)
    // 잉크 심판의 자리([12]의 우려): own3를 새 카메라로 사영하면 **이동한 pts2d 그대로**여야
    // 한다 — 어긋나면 own3d 경로가 굳힘을 전부 거짓 경보로 버린다(OWN3_TOL_PX 0.01px).
    let worstInk = 0
    for (const o of s2.own3) {
      if (!o.own3 || o.id === 1) continue
      const st = back.doc.strokes.find(s => s.id === o.id)!
      const pose = st.view ?? DRAW_POSE
      const an = lift.an
      const pa = project(an, pose, o.own3.a)!
      const pb = project(an, pose, o.own3.b)!
      worstInk = Math.max(worstInk,
        Math.hypot(pa.x - st.a.x, pa.y - st.a.y), Math.hypot(pb.x - st.b.x, pb.y - st.b.y))
    }
    ledger['sample2'] = { lifted_worst_abs: worst, own3_reproject_worst_px: worstInk, dy }
    console.log(`[측정] 표본2 — 3D 최악 ${worst.toExponential(3)} · own3 재사영 최악 ${worstInk.toExponential(3)}px (심판 문 0.01px)`)
    expect(worst).toBeLessThan(1e-9)
    expect(worstInk).toBeLessThan(0.005)             // 잉크 심판 문(0.01px)의 절반 아래
  })

  it('가드([5]) — 첫 획이 지평선(정확 수평)이 아닌 v1은 거부한다: 조용히 어긋나게 열지 않는다', () => {
    const j = JSON.parse(oracle.sample.brnl)
    j.strokes[0].b.y = j.strokes[0].a.y + 3          // 수평이 아니다 — 옛 앱은 못 만든 상태
    expect(parseBrnl(JSON.stringify(j))).toBeNull()
    const k = JSON.parse(oracle.sample.brnl)
    k.strokes[0].view = { p: { x: 0, y: 1.6, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }
    expect(parseBrnl(JSON.stringify(k))).toBeNull()  // 포즈 획이 첫 획 — 역시 전제 밖
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
      ledger[`counter_dy0_hz${g.hz}_${g.name}`] = { min_diff_over: 0.5, diff: Number.isFinite(diff) ? diff : 'structural' }
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
    // 저장된 뷰(→ 종이 — web2-19 2부) — 화면 그림이 같다: 문서점의 화면 좌표가 이동 전과
    // 같다(oy 보정의 검증). 마이그레이션 뒤 배열 0은 작도 종이라 첫 명명 종이는 [1]이다.
    const v = back.doc.sheets[1]!.view!
    expect(v.s).toBe(1.25)
    // 옛: 문서점 y=620 → 화면 620·1.25 − 48 = 727 / 새: (620+dy)·1.25 + oy′ = 727이어야 한다
    expect((620 + dy) * v.s + v.oy).toBeCloseTo(620 * 1.25 + (-48), 9)
    ledger['sample_roundtrip'] = { lifted_worst_abs: worst, face_vertex_worst_abs: worstFace, view_oy_check: '(620+dy)·1.25+oy′ == 620·1.25−48' }
    console.log(`[측정] 2-c ① 왕복 — 3D 최악 ${worst.toExponential(3)} · 면 정점 최악 ${worstFace.toExponential(3)}`)
  })

  it('② 자기 왕복(v5 — web2-20부터) — 저장 → 파싱 → 저장이 같은 문자열', () => {
    const first = parseBrnl(oracle.sample.brnl)!            // v1 → 변환된 문서
    const v2 = serializeBrnl({ doc: first.doc, nextId: first.nextId, drawView: { s: 1.5, ox: 12, oy: -7 } })
    const again = parseBrnl(v2)!
    expect(again).not.toBeNull()
    expect(again.drawView).toEqual({ s: 1.5, ox: 12, oy: -7 })
    const v2b = serializeBrnl({ doc: again.doc, nextId: again.nextId, drawView: again.drawView })
    expect(v2b).toBe(v2)
    // drawView 없는 왕복도 같다(열쇠 자체가 없다)
    const noDv = serializeBrnl({ doc: first.doc, nextId: first.nextId })
    const back = parseBrnl(noDv)!
    expect(back.drawView).toBeNull()
    expect(serializeBrnl({ doc: back.doc, nextId: back.nextId })).toBe(noDv)
  })

  it('③ 거부 — version 7은 거부한다(전방 호환을 흉내내지 않는다 — 1~6만 받는다)', () => {
    // ⚠ 이 수는 **쓰는 판이 오를 때마다 함께 오른다**(web2-23이 6을 쓴다) — 그때
    // 6은 «받는 판»이 되고 문은 한 칸 위로 간다. 아래 ⑤가 그 짝(6은 실제로 받는다).
    const j = JSON.parse(oracle.sample.brnl)
    j.version = 7
    expect(parseBrnl(JSON.stringify(j))).toBeNull()
  })

  it('⑤ 받는다 — version 6(밑그림 판)은 열린다 · 밑그림 없는 v6도 그대로', () => {
    const j = JSON.parse(oracle.sample.brnl)
    j.version = 6
    const d = parseBrnl(JSON.stringify(j))
    expect(d).not.toBeNull()
    expect(d!.doc.underlays).toEqual([])
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
