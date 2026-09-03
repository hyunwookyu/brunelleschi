// web2-56 — 접합의 상태·기하 팔. 픽셀 몫은 e2e(join56.spec)가 잰다.
//
// 재는 것(지시 게이트 그대로):
//   ① L 무승부(같은 구성) — 마이터가 «결과»로 나온다: 이동된 표면이 상대 오프셋 평면
//      «위»이고(잔차 < C.JOIN56_PLANE_EPS) 두 캡이 겹친다(계단 0의 기하판)
//   ② 비직각(60°)·한쪽 기준(off 's')에서도 같은 식이 선다(D-5 — 직각 하나로 주장 ⛔)
//   ③ L 승부(다른 구성) — 이긴 쪽이 관통(진 쪽 바깥 평면까지), 진 쪽이 버트(이긴 쪽
//      안쪽 평면에서 끝) · **반증(D-3 ②): 우선순위를 뒤집으면 관통하는 쪽이 바뀐다**
//   ④ T — 줄기가 막대 «가까운» 표면에서 멈춘다 · **반증(D-3 ③): 막대의 코어 표시를
//      지우면 줄기가 «먼» 표면까지 뚫는다(2단 정렬 키의 윗자리가 실제로 일한다)**
//   ⑤ 치유 경계(#71) — cleanupW 안이면 붙고 밖이면 안 붙는다(경계값 양쪽)
//   ⑥ 연장 상한 — 필요한 이동이 maxExtW를 넘으면 안 붙는다
//   ⑦ 결정론 — 입력 차례를 섞어도, id를 갈아 끼워도(지우고 같은 자리에 다시) 같은 이동
//   ⑧ 접합 끊기 — 끊긴 모서리는 후보에서 빠진다
//   ⑨ 1링 — 벽 하나를 옮기면 그 벽의 쌍만 다시 걷는다(캐시 통계가 값)
//   ⑩ 세션 통합 — 앱 경로(획→면→두께)에서 접합이 서고, nj가 실행취소·저장 왕복한다
//   ⑪ 성능 — 벽 30장·접합 48개(지시 대역)의 computeJoints ms(원장 — LEDGER에서만 쓴다)

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  toggleFaceAt, setClsThickness, setFaceThicknessEx, setDimension, setStrokeNj, undo, redo,
} from '../src/app/state'
import { computeJoints, stableFaceKey, vkey, type JointFaceIn, type JointCache } from '../src/core/joint'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { add3, sub3, mul3, dot3, norm3, len3, v3, type V3 } from '../src/core/vec'
import { C } from '../src/core/constants'

const W = 1200, H = 800

// ── 순수 픽스처 — 평면(xz) 선분 위에 선 수직 벽 ──────────────────────────────
// outer = [아래0, 아래1, 위1, 위0] → 모서리 0=아래 · 1=끝(점1) · 2=위 · 3=끝(점0).
function mkWall(id: number, x0: number, z0: number, x1: number, z1: number, opt?: {
  h?: number; t?: number; front?: number; back?: number; core?: 0 | 1; pri?: number
  broken?: number[]
}): JointFaceIn {
  const h = opt?.h ?? 2.5
  const t = opt?.t ?? 0.2
  const front = opt?.front ?? t / 2
  const back = opt?.back ?? -t / 2
  const n = norm3(v3(-(z1 - z0), 0, x1 - x0))
  return {
    id,
    outer: [v3(x0, 0, z0), v3(x1, 0, z1), v3(x1, h, z1), v3(x0, h, z0)],
    holes: [], normal: n, frontW: front, backW: back,
    core: opt?.core ?? 1, pri: opt?.pri ?? 3,
    edgeStrokes: [100 + id * 10, 101 + id * 10, 102 + id * 10, 103 + id * 10],
    brokenEdges: new Set(opt?.broken ?? []),
  }
}
const OPT = { cleanupW: 0.05, maxExtW: 0.6, parDot: 0.9994 }

/** 점이 평면(단위 법선 n · 기준점 base · 오프셋 off) 위인가 — 잔차(세계 단위) */
const planeResid = (p: V3, n: V3, base: V3, off: number): number =>
  Math.abs(dot3(n, p) - (dot3(n, base) + off))

/** 한 면의 접합 모서리 이동 결과 — 원래 정점 + 이동을 앞/뒤 표면에 얹은 3D */
function shifted(res: ReturnType<typeof computeJoints>, f: JointFaceIn) {
  const m = res.shifts.get(f.id)
  if (!m) return null
  const out: { v: V3; front: V3; back: V3 }[] = []
  for (const v of f.outer) {
    const sh = m.get(vkey(v))
    if (!sh) continue
    const n = norm3(f.normal)
    out.push({
      v,
      front: add3(add3(v, mul3(n, f.frontW)), sh.f),
      back: add3(add3(v, mul3(n, f.backW)), sh.b),
    })
  }
  return out
}

describe('56 ① L 무승부 — 마이터가 결과로 나온다 (계단 0의 기하판)', () => {
  it('직각: 안쪽↔안쪽·바깥↔바깥 평면 위로 이동하고 두 캡이 겹친다', () => {
    const A = mkWall(1, 0, 0, 4, 0)       // 평면 z=0 · 몸 +x
    const B = mkWall(2, 0, 0, 0, 4)       // 평면 x=0 · 몸 +z
    const res = computeJoints([A, B], OPT)
    expect(res.joins.length).toBe(1)
    const j = res.joins[0]!
    expect(j.kind).toBe('L')
    expect(j.tie).toBe(true)
    expect(j.winner).toBeNull()
    const sA = shifted(res, A)!, sB = shifted(res, B)!
    expect(sA.length).toBe(2)             // 접합 모서리의 두 끝
    expect(sB.length).toBe(2)
    // A의 안쪽 표면(front — 몸 z>0 쪽 벽의 B 몸 쪽)은 B의 안쪽 평면 위, 바깥은 바깥 위
    for (const s of sA) {
      // 이동 뒤에도 자기 오프셋 평면 «안»이다(면내 이동 — 법선 성분 0)
      expect(planeResid(s.front, norm3(A.normal), A.outer[0]!, A.frontW)).toBeLessThan(C.JOIN56_PLANE_EPS)
      expect(planeResid(s.back, norm3(A.normal), A.outer[0]!, A.backW)).toBeLessThan(C.JOIN56_PLANE_EPS)
      // 상대 평면 위 — 어느 쪽이 짝인지는 부호가 정하므로 «둘 중 하나»가 0이면 된다
      const rF = Math.min(
        planeResid(s.front, norm3(B.normal), B.outer[0]!, B.frontW),
        planeResid(s.front, norm3(B.normal), B.outer[0]!, B.backW))
      const rB = Math.min(
        planeResid(s.back, norm3(B.normal), B.outer[0]!, B.frontW),
        planeResid(s.back, norm3(B.normal), B.outer[0]!, B.backW))
      expect(rF).toBeLessThan(C.JOIN56_PLANE_EPS)
      expect(rB).toBeLessThan(C.JOIN56_PLANE_EPS)
    }
    // 두 캡이 겹친다 — 같은 높이의 이동 정점이 같은 자리(계단 0 · 이음선 없음)
    const at = (arr: NonNullable<ReturnType<typeof shifted>>, y: number) =>
      arr.find(s => Math.abs(s.v.y - y) < 1e-9)!
    for (const y of [0, 2.5]) {
      const a = at(sA, y), b = at(sB, y)
      // A의 안쪽(front) 모서리 ↔ B의 안쪽 — 부호 배치가 반대일 수 있어 두 짝 중 하나
      const d1 = Math.min(len3(sub3(a.front, b.front)), len3(sub3(a.front, b.back)))
      const d2 = Math.min(len3(sub3(a.back, b.back)), len3(sub3(a.back, b.front)))
      expect(d1).toBeLessThan(C.JOIN56_PLANE_EPS)
      expect(d2).toBeLessThan(C.JOIN56_PLANE_EPS)
    }
    // 마이터의 부호 — 한 표면은 늘고(양) 한 표면은 준다(음): 45° 절단의 그 모양
    expect(j.extA.front * j.extA.back).toBeLessThan(0)
    expect(Math.abs(j.extA.front)).toBeCloseTo(0.1, 9)
    expect(Math.abs(j.extA.back)).toBeCloseTo(0.1, 9)
  })

  it('비직각(60°)·한쪽 기준(off s)·두께 다름 — 같은 식이 선다 (D-5)', () => {
    // 60° 코너 + A는 off 's'(front 0) + 두께 다름(0.2/0.35) — 그래도 무승부면 마이터
    const A = mkWall(1, 0, 0, 4, 0, { front: 0, back: -0.2 })
    const B = mkWall(2, 0, 0, Math.cos(Math.PI / 3) * 4, Math.sin(Math.PI / 3) * 4, { t: 0.35 })
    const res = computeJoints([A, B], OPT)
    expect(res.joins.length).toBe(1)
    expect(res.joins[0]!.tie).toBe(true)
    const sA = shifted(res, A)!
    for (const s of sA) {
      expect(planeResid(s.front, norm3(A.normal), A.outer[0]!, A.frontW)).toBeLessThan(C.JOIN56_PLANE_EPS)
      const rF = Math.min(
        planeResid(s.front, norm3(B.normal), B.outer[0]!, B.frontW),
        planeResid(s.front, norm3(B.normal), B.outer[0]!, B.backW))
      expect(rF).toBeLessThan(C.JOIN56_PLANE_EPS)
    }
  })
})

describe('56 ③ L 승부 — 관통과 버트 (+반증: 우선순위 뒤집기)', () => {
  it('이긴 쪽은 진 쪽 바깥 평면까지, 진 쪽은 이긴 쪽 안쪽 평면에서 끝난다', () => {
    const A = mkWall(1, 0, 0, 4, 0, { pri: 3 })
    const B = mkWall(2, 0, 0, 0, 4, { pri: 4 })          // 외벽 급 — 이긴다
    const res = computeJoints([A, B], OPT)
    const j = res.joins[0]!
    expect(j.tie).toBe(false)
    expect(j.winner).toBe(2)
    // 이긴 B의 두 표면이 «한» 평면(진 A의 바깥) 위 — 캡이 평평(버트의 관통 끝)
    const sB = shifted(res, B)!
    const outerA = [A.frontW, A.backW].filter(o =>
      sB.every(s => planeResid(s.front, norm3(A.normal), A.outer[0]!, o) < C.JOIN56_PLANE_EPS
        && planeResid(s.back, norm3(A.normal), A.outer[0]!, o) < C.JOIN56_PLANE_EPS))
    expect(outerA.length).toBe(1)
    // 진 A의 두 표면이 «한» 평면(이긴 B의 안쪽) 위
    const sA = shifted(res, A)!
    const innerB = [B.frontW, B.backW].filter(o =>
      sA.every(s => planeResid(s.front, norm3(B.normal), B.outer[0]!, o) < C.JOIN56_PLANE_EPS
        && planeResid(s.back, norm3(B.normal), B.outer[0]!, o) < C.JOIN56_PLANE_EPS))
    expect(innerB.length).toBe(1)
    expect(outerA[0]).not.toBe(innerB[0] === B.frontW ? A.frontW : undefined)  // 자리만 다르면 된다
    // 반증(D-3 ②) — 우선순위를 뒤집으면 관통하는 쪽이 바뀐다
    const res2 = computeJoints([mkWall(1, 0, 0, 4, 0, { pri: 9 }), mkWall(2, 0, 0, 0, 4, { pri: 4 })], OPT)
    expect(res2.joins[0]!.winner).toBe(1)
    // 이동량도 실제로 다르다 — 같은 벽(1)의 front 이동이 승부 갈림에 따라 바뀐다
    expect(res2.joins[0]!.extA.front).not.toBeCloseTo(j.extA.front, 9)
  })
})

describe('56 ④ T — 줄기는 가까운 표면에서 멈춘다 (+반증: 코어 표시 지우기)', () => {
  it('가까운 표면 버트 · 코어를 지우면 먼 표면까지 뚫는다(2단 키의 윗자리)', () => {
    const bar = () => mkWall(2, -2, 0, 2, 0, { pri: 4 })        // 막대 — 평면 z=0
    const stem = () => mkWall(1, 0, 0, 0, 3, { pri: 3 })        // 줄기 — 끝이 막대 경로 안
    const res = computeJoints([stem(), bar()], OPT)
    expect(res.joins.length).toBe(1)
    const j = res.joins[0]!
    expect(j.kind).toBe('T')
    expect(j.a).toBe(1)                                          // a = 줄기
    expect(j.extB).toBeNull()                                    // 막대는 안 움직인다
    // 줄기 두 표면이 막대의 «가까운» 평면(z=+0.1 — 줄기 몸 쪽) 위
    const sS = shifted(res, stem())!
    for (const s of sS) {
      expect(Math.abs(s.front.z - 0.1)).toBeLessThan(C.JOIN56_PLANE_EPS)
      expect(Math.abs(s.back.z - 0.1)).toBeLessThan(C.JOIN56_PLANE_EPS)
    }
    // 반증(D-3 ③) — 막대의 코어 표시를 지우면 (core 1 > 0) 줄기가 이겨 «먼» 평면까지
    const res2 = computeJoints([stem(), mkWall(2, -2, 0, 2, 0, { pri: 4, core: 0 })], OPT)
    expect(res2.joins[0]!.winner).toBe(1)
    const sS2 = shifted(res2, stem())!
    for (const s of sS2) {
      expect(Math.abs(s.front.z - -0.1)).toBeLessThan(C.JOIN56_PLANE_EPS)
    }
  })
})

describe('56 ⑤ 치유 경계(#71) · ⑥ 연장 상한 · ⑦ 평행 — 문마다 양쪽', () => {
  it('cleanupW 안이면 붙고(0.98배) 밖이면 안 붙는다(1.02배)', () => {
    const inside = computeJoints([
      mkWall(1, OPT.cleanupW * 0.98, 0, 4, 0), mkWall(2, 0, 0, 0, 4)], OPT)
    expect(inside.joins.length, '경계 안 — 붙는다').toBe(1)
    // 치유 = 이동이 목표 평면까지의 «전체» 간격을 메운다(모자란 만큼 더 연장된다)
    expect(inside.joins[0]!.probe).not.toBeNull()
    const outside = computeJoints([
      mkWall(1, OPT.cleanupW * 1.02, 0, 4, 0), mkWall(2, 0, 0, 0, 4)], OPT)
    expect(outside.joins.length, '경계 밖 — 안 붙는다').toBe(0)
  })
  it('필요한 이동이 maxExtW를 넘으면 안 붙는다 — 상한 안이면 붙는다', () => {
    const opt2 = { ...OPT, maxExtW: 0.08 }                       // 필요한 이동 0.1 > 0.08
    const res = computeJoints([mkWall(1, 0, 0, 4, 0), mkWall(2, 0, 0, 0, 4)], opt2)
    expect(res.joins.length).toBe(0)
    expect(res.rejects.some(r => r.reason === 'max-extension')).toBe(true)
    const opt3 = { ...OPT, maxExtW: 0.12 }
    expect(computeJoints([mkWall(1, 0, 0, 4, 0), mkWall(2, 0, 0, 0, 4)], opt3).joins.length).toBe(1)
  })
  it('평행(2° 안)이면 후보가 아니다', () => {
    const res = computeJoints([mkWall(1, 0, 0, 4, 0), mkWall(2, 4.001, 0.001, 8, 0.02)], OPT)
    expect(res.joins.length).toBe(0)
  })
})

describe('56 ⑧ 접합 끊기 — 끊긴 모서리는 후보에서 빠진다', () => {
  it('한쪽 모서리(edge 3)를 끊으면 그 코너 접합이 없다', () => {
    const res = computeJoints([mkWall(1, 0, 0, 4, 0, { broken: [3] }), mkWall(2, 0, 0, 0, 4)], OPT)
    expect(res.joins.length).toBe(0)
  })
})

describe('56 ⑦′ 결정론 — 차례·id 무관 (생성 순서 ⛔의 반증)', () => {
  const allShifts = (res: ReturnType<typeof computeJoints>): string[] => {
    const out: string[] = []
    for (const m of res.shifts.values()) {
      for (const [k, s] of m) out.push(`${k}|${vkey(s.f)}|${vkey(s.b)}`)
    }
    return out.sort()
  }
  it('입력 배열을 뒤집어도, id를 갈아 끼워도 같은 이동이 나온다', () => {
    const mk = (ids: [number, number, number]) => [
      mkWall(ids[0], 0, 0, 4, 0), mkWall(ids[1], 0, 0, 0, 4, { pri: 4 }), mkWall(ids[2], 4, 0, 4, 4)]
    const a = computeJoints(mk([1, 2, 3]), OPT)
    const b = computeJoints(mk([1, 2, 3]).reverse(), OPT)
    expect(allShifts(b)).toEqual(allShifts(a))
    // 지우고 같은 자리에 다시 그림 — id·차례가 다 바뀌어도 기하가 같으면 결과가 같다
    const c = computeJoints(mk([7, 9, 8]).reverse(), OPT)
    expect(allShifts(c)).toEqual(allShifts(a))
    expect(a.joins.length).toBe(2)
    // 안정 열쇠 자체도 id와 무관하다
    expect(stableFaceKey(mkWall(1, 0, 0, 4, 0).outer, mkWall(1, 0, 0, 4, 0).normal))
      .toBe(stableFaceKey(mkWall(9, 0, 0, 4, 0).outer, mkWall(9, 0, 0, 4, 0).normal))
  })
})

describe('56 ⑨ 1링 — 벽 하나를 옮기면 그 벽의 쌍만 다시 걷는다', () => {
  it('캐시 통계: 첫 계산 전부 → 무변 재계산 0 → C 이동 시 C의 쌍만', () => {
    const cache: JointCache = new Map()
    const mk = (cx: number) => [
      mkWall(1, 0, 0, 4, 0), mkWall(2, 0, 0, 0, 4), mkWall(3, cx, 0, cx, 4)]
    const r1 = computeJoints(mk(4), OPT, cache)
    expect(r1.joins.length).toBe(2)                              // 1-2 코너 · 1-3 코너
    expect(r1.stats.computed).toBe(3)
    expect(r1.stats.cached).toBe(0)
    const r2 = computeJoints(mk(4), OPT, cache)
    expect(r2.stats.computed, '무변 — 전부 캐시').toBe(0)
    expect(r2.stats.cached).toBe(3)
    expect(r2.joins.length).toBe(2)
    const r3 = computeJoints(mk(4.02), OPT, cache)               // 벽 3만 이동
    expect(r3.stats.cached, '1-2 쌍은 캐시').toBe(1)
    expect(r3.stats.computed, '3이 든 쌍 둘만 재계산').toBe(2)
    expect(r3.stats.recomputedFaces, '재생성된 벽 = 옮긴 벽 + 직접 연결(1링)').toEqual([1, 3])
  })
})

// ── 세션 통합 — 앱 경로(획 → 면 → 두께 → 접합) ──────────────────────────────
// thick55의 room3 + 반대편 벽: 코너 획(500,500→500,380)을 두 벽이 나눈다.
// ⚠ 지정 차례: 바닥·벽A를 먼저 지정하고 «그 뒤에» 벽B 획을 긋는다 — 벽B 다각형이
// 화면에서 바닥 영역을 통째로 덮어, 획이 다 있으면 바닥 클릭이 벽B 루프를 잡는다
// (D-1 표식 실측: (468,478) 클릭이 [3,6,10,9] = 벽B를 «added»했다).
function cornerSession() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)
  s.draw(500, 500, 400, 475)
  s.draw(600, 475, 500, 460)
  s.draw(400, 475, 500, 460)
  s.draw(500, 500, 500, 380)          // 코너 기둥(공유 모서리)
  s.draw(600, 475, 600, 385)
  s.draw(600, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 468, y: 478 })).toBe('added')   // 바닥
  expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')   // 벽 A(오른쪽)
  s.draw(400, 475, 400, 385)
  s.draw(400, 385, 500, 380)
  expect(toggleFaceAt(s.app, { x: 450, y: 430 })).toBe('added')   // 벽 B(왼쪽)
  const walls = s.app.faces.filter(f => Math.abs(f.normal.y) < 0.5)
  const floor = s.app.faces.find(f => Math.abs(f.normal.y) >= 0.5)!
  expect(walls.length).toBe(2)
  const post = s.app.doc.strokes[5]!
  expect(setDimension(s.app, post.id, 2500)).toBe('scale')
  return { s, wallA: walls[0]!.id, wallB: walls[1]!.id, floorId: floor.id, cornerStroke: post.id }
}

describe('56 ⑩ 세션 통합 — 앱 경로의 접합·끊기·저장', () => {
  it('같은 분류 두 벽에 일괄 t=200 — L 무승부 접합이 서고 이동이 목표 평면 위다', () => {
    const { s, wallA, wallB } = cornerSession()
    const r = setClsThickness(s.app, wallA, 200)!
    expect(r.n).toBe(2)
    const j = s.app.joints!
    expect(j).not.toBeNull()
    const wj = j.joins.filter(x => (x.a === wallA || x.a === wallB) && (x.b === wallA || x.b === wallB))
    expect(wj.length, '벽-벽 접합 하나').toBe(1)
    expect(wj[0]!.kind).toBe('L')
    expect(wj[0]!.tie, '같은 분류 — 무승부(마이터)').toBe(true)
    expect(wj[0]!.probe, '계단 표본 사각이 있다').not.toBeNull()
    expect(j.shifts.get(wallA)!.size).toBe(2)
    expect(j.shifts.get(wallB)!.size).toBe(2)
    // 이동 뒤 자기 오프셋 평면 안 + 상대 평면 위(마이터의 기하)
    const rfA = s.app.faces.find(f => f.id === wallA)!
    const rfB = s.app.faces.find(f => f.id === wallB)!
    const nA = norm3(rfA.normal), nB = norm3(rfB.normal)
    const slots = (fid: number) => {
      const t = 200 / s.app.lift.mmPerUnit!
      void fid
      return { front: t / 2, back: -t / 2 }
    }
    const shA = j.shifts.get(wallA)!
    for (const v of rfA.outer) {
      const sh = shA.get(vkey(v))
      if (!sh) continue
      const front = add3(add3(v, mul3(nA, slots(wallA).front)), sh.f)
      const rF = Math.min(
        planeResid(front, nB, rfB.outer[0]!, slots(wallB).front),
        planeResid(front, nB, rfB.outer[0]!, slots(wallB).back))
      expect(rF).toBeLessThan(1e-6)     // cornerOf 최근접 중점의 눈금 위 — 순수판(1e-9)보다 느슨
    }
  })
  it('분류가 다르면 승부 — 예외 t=0으로 한쪽을 빼면 접합도 빠진다', () => {
    const { s, wallA, wallB } = cornerSession()
    setClsThickness(s.app, wallA, 200)
    // 벽 B만 외벽으로 — 손통 분류 정정의 저장 필드 그대로
    s.app.doc.faces.find(f => f.id === wallB)!.cls = 'extw'
    setClsThickness(s.app, wallB, 200)                        // extw 분류에도 t를 준다
    const j = s.app.joints!
    const wj = j.joins.find(x => (x.a === wallA || x.a === wallB) && (x.b === wallA || x.b === wallB))!
    expect(wj.tie).toBe(false)
    expect(wj.winner, '외벽(pri 4)이 벽(pri 3)을 이긴다').toBe(wallB)
    // 예외 t=0 — 두께가 빠지면 접합 후보에서도 빠진다(값이 아니라 몸이 없다)
    setFaceThicknessEx(s.app, wallB, 0)
    const j2 = s.app.joints
    expect(j2 === null || !j2.joins.some(x => x.a === wallB || x.b === wallB)).toBe(true)
  })
  it('nj(접합 끊기) — 코너 획에 걸면 접합이 빠지고, 실행취소·재실행·저장이 왕복한다', () => {
    const { s, wallA, wallB, cornerStroke } = cornerSession()
    setClsThickness(s.app, wallA, 200)
    const has = () => !!s.app.joints?.joins.some(x =>
      (x.a === wallA || x.a === wallB) && (x.b === wallA || x.b === wallB))
    expect(has()).toBe(true)
    expect(setStrokeNj(s.app, cornerStroke, true)).toBe(true)
    expect(has(), '끊김 — 그 모서리 접합이 없다(끝이 평평 = 55의 버트로)').toBe(false)
    undo(s.app)
    expect(has(), '실행취소 — 접합이 돌아온다').toBe(true)
    redo(s.app)
    expect(has()).toBe(false)
    // 저장 왕복 — nj가 바이트로 돌고, 없으면 열쇠가 안 생긴다
    const bytes = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: null })
    expect(bytes.includes('"nj"')).toBe(true)
    const back = parseBrnl(bytes)!
    expect(back.doc.strokes.find(x => x.id === cornerStroke)?.nj).toBe(1)
    expect(serializeBrnl({ doc: back.doc, nextId: back.nextId, drawView: null })).toBe(bytes)
    undo(s.app)
    const bytes2 = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: null })
    expect(bytes2.includes('"nj"'), '이은 문서에 nj 열쇠 없음').toBe(false)
  })
  it('벽⊥바닥 — 55의 계단(buried 75 · step 100)이 승부 접합이 된다(벽이 이긴다)', () => {
    const { s, wallA, wallB, floorId } = cornerSession()
    setClsThickness(s.app, wallA, 200)                        // 벽 둘 다 200
    setFaceThicknessEx(s.app, wallB, 0)                       // 코너 정점 다툼을 빼고 본다(⑩′)
    setClsThickness(s.app, floorId, 150)                      // 슬라브 150 — 55 stair의 그 대역
    const j = s.app.joints!
    const wf = j.joins.find(x => (x.a === wallA && x.b === floorId) || (x.a === floorId && x.b === wallA))!
    expect(wf, '벽-바닥 접합이 선다').toBeTruthy()
    expect(wf.winner, '벽(pri 3)이 슬라브(pri 2)를 이긴다 — 관통').toBe(wallA)
  })
})

/** 단위 원장(join56_unit_web2.json)의 병합-쓰기(#99의 그 꼴 — 팔 둘이 같은 파일에 쓴다) */
async function writeUnitLedger(patch: Record<string, unknown>) {
  const { writeFileSync, mkdirSync } = await import('../tools/ledgerfs')
  const { readFileSync } = await import('node:fs')
  const { resolve, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = dirname(fileURLToPath(import.meta.url))
  const f = resolve(here, '../../stage0/out/join56_unit_web2.json')
  let prev: Record<string, unknown> = {}
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { /* 첫 실행 */ }
  mkdirSync(resolve(here, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    what: 'web2-56 — 접합의 단위 원장: 게이트 값(T·코어 반증·치유 경계·결정론·1링 — 리뷰어 1차 [2][3][12]: 원장 밖 측정은 안 걸린다 §5.1)과 지시 대역 성능(벽 30 · 접합 48)',
    conditions: { canonical: 'LEDGER=1 npx vitest run test/joint56.test.ts' },
    ...prev, ...patch,
  }, null, 2))
}

describe('56 ⑫ 원장 — 게이트 다섯의 값 (리뷰어 1차 [2][3][12] — 원장 밖 측정은 안 걸린다)', () => {
  it('T·코어 반증·치유 경계·결정론·1링을 값으로 join56_unit_web2.json gates 블록에', async () => {
    // T — 줄기 표면의 정지 평면과 잔차(세계 단위)
    const bar = () => mkWall(2, -2, 0, 2, 0, { pri: 4 })
    const stem = () => mkWall(1, 0, 0, 0, 3, { pri: 3 })
    const rT = computeJoints([stem(), bar()], OPT)
    const sT = shifted(rT, stem())!
    const residNear = Math.max(...sT.flatMap(s => [Math.abs(s.front.z - 0.1), Math.abs(s.back.z - 0.1)]))
    const rC = computeJoints([stem(), mkWall(2, -2, 0, 2, 0, { pri: 4, core: 0 })], OPT)
    const sC = shifted(rC, stem())!
    const residFar = Math.max(...sC.flatMap(s => [Math.abs(s.front.z - -0.1), Math.abs(s.back.z - -0.1)]))
    // 치유 경계(#71) — 간격 실측치와 접합 수(경계 양쪽)
    const heal = (k: number) => computeJoints([mkWall(1, OPT.cleanupW * k, 0, 4, 0), mkWall(2, 0, 0, 0, 4)], OPT).joins.length
    // 결정론 — 이동 전체의 소화값(digest)이 차례·id에 불변
    const digest = (res: ReturnType<typeof computeJoints>): string => {
      const rows: string[] = []
      for (const m of res.shifts.values()) for (const [k, s] of m) rows.push(`${k}|${vkey(s.f)}|${vkey(s.b)}`)
      rows.sort()
      let h = 5381
      for (const r of rows) for (let i = 0; i < r.length; i++) h = ((h * 33) ^ r.charCodeAt(i)) >>> 0
      return `${rows.length}:${h.toString(16)}`
    }
    const mk3 = (ids: [number, number, number]) => [
      mkWall(ids[0], 0, 0, 4, 0), mkWall(ids[1], 0, 0, 0, 4, { pri: 4 }), mkWall(ids[2], 4, 0, 4, 4)]
    const dA = digest(computeJoints(mk3([1, 2, 3]), OPT))
    const dB = digest(computeJoints(mk3([1, 2, 3]).reverse(), OPT))
    const dC = digest(computeJoints(mk3([7, 9, 8]).reverse(), OPT))
    // 1링 — 분모 포함(#16 · 리뷰어 [3]): 두꺼운 면 3 · 쌍 3에서 벽 하나 이동
    const cache: JointCache = new Map()
    const mv = (cx: number) => [mkWall(1, 0, 0, 4, 0), mkWall(2, 0, 0, 0, 4), mkWall(3, cx, 0, cx, 4)]
    const s1 = computeJoints(mv(4), OPT, cache).stats
    const s2 = computeJoints(mv(4), OPT, cache).stats
    const s3 = computeJoints(mv(4.02), OPT, cache).stats
    await writeUnitLedger({
      gates: {
        def: '게이트 다섯의 값(전부 세계 단위 · OPT = cleanup 0.05 / maxExt 0.6 / dot 0.9994). T: 줄기 두 표면의 정지 평면 잔차(가까운 면 z=+0.1) · 코어 반증: 막대 core=0에서 줄기가 이겨 먼 면(z=−0.1)까지 — 잔차와 승자. 치유: 간격 = cleanup×0.98/×1.02의 접합 수(붙음 1/안 붙음 0 — #71 경계 양쪽). 결정론: 이동 전체 소화값(정렬 행 수:해시)이 차례 역순·id 교체에 동일. 1링: 두꺼운 면 3·쌍 3에서 벽 하나 이동 — computed/cached와 재계산 면(분모 포함 · recomputedFaces는 «접합이 평가된» 면이다 — 기각 전 단계)',
        t_near: { target_z: 0.1, resid_max: residNear },
        t_core_flip: { target_z: -0.1, resid_max: residFar, winner_is_stem: rC.joins[0]!.winner === 1 },
        heal: { in_dist: +(OPT.cleanupW * 0.98).toFixed(4), joins_in: heal(0.98), out_dist: +(OPT.cleanupW * 1.02).toFixed(4), joins_out: heal(1.02), cleanup_w: OPT.cleanupW },
        determinism: { digest_base: dA, digest_reversed: dB, digest_new_ids: dC, all_equal: dA === dB && dB === dC },
        onering: {
          thick_faces: 3, pairs: 3, joins: 2,
          first: { computed: s1.computed, cached: s1.cached },
          unchanged: { computed: s2.computed, cached: s2.cached },
          moved_one: { computed: s3.computed, cached: s3.cached, recomputedFaces: s3.recomputedFaces },
        },
      },
    })
    expect(residNear).toBeLessThan(C.JOIN56_PLANE_EPS)
    expect(residFar).toBeLessThan(C.JOIN56_PLANE_EPS)
    expect(dA === dB && dB === dC).toBe(true)
    expect(s3.recomputedFaces.length, '1링 — 전체(3)가 아니다').toBeLessThan(3)
  })
})

describe('56 ⑪ 성능 — 지시 대역(벽 30장 · 접합 40개)의 computeJoints (원장)', () => {
  it('30벽·48접합 격자 — ms 중앙(신선/캐시)을 원장에 (LEDGER에서만 쓴다)', async () => {
    // 블록 하나 = 막대 3(z 0·3·6) + 줄기 12(x 6칸 × 줄 2) = 15벽 · T 24. 블록 둘 = 30벽 · 48접합.
    const mk = (): JointFaceIn[] => {
      const out: JointFaceIn[] = []
      let id = 1
      for (const bx of [0, 20]) {
        for (const z of [0, 3, 6]) out.push(mkWall(id++, bx, z, bx + 13, z, { pri: 4 }))
        for (const r of [0, 3]) {
          for (let k = 0; k < 6; k++) {
            const x = bx + 1 + k * 2
            out.push(mkWall(id++, x, r + 0.001, x, r + 3 - 0.001, { pri: 3 }))
          }
        }
      }
      return out
    }
    const faces = mk()
    expect(faces.length).toBe(30)
    const first = computeJoints(faces, OPT)
    expect(first.joins.length, 'T 접합 48(줄기 12×2줄×2블록 × 양끝)').toBe(48)
    const runs: number[] = []
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now()
      computeJoints(mk(), OPT)
      runs.push(performance.now() - t0)
    }
    runs.sort((a, b) => a - b)
    const cache: JointCache = new Map()
    computeJoints(faces, OPT, cache)
    const warm = computeJoints(faces, OPT, cache).stats     // 적중 분모(#16 · 리뷰어 [12])
    const cruns: number[] = []
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now()
      computeJoints(faces, OPT, cache)
      cruns.push(performance.now() - t0)
    }
    cruns.sort((a, b) => a - b)
    await writeUnitLedger({
      perf: {
        def: '접합 계산(computeJoints)의 지시 대역 성능(벽 30 · 접합 48 — 세어 지킨 값). 이것은 recompute 몫이다(문서가 바뀔 때만 돈다 — 궤도 프레임에는 없다). ⚠ 캐시 이득(fresh→cached)은 걸음 몫뿐이다 — 비용의 주인은 쌍 탐색(전 쌍 검출)이라, 1링 캐시의 뜻은 속도가 아니라 «어느 접합이 다시 걸어졌는가»의 판정(무효화 단위 — 지시 6)이다. ⚠ 벽 30 «장면의 프레임» 실측은 없다(그 규모 장면을 그리는 비용 — e2e ⑤의 켬/끔 프레임·메시 수 대조와 이 값이 각각의 절대값으로 선다 · 두 하네스를 비로 안 묶는다 #27). 절대 ms는 기계 몫(#47) — 회귀 비교는 같은 원장의 전값과',
        walls: 30, joins: 48, pairs: 435,
        fresh_ms_median: +runs[3]!.toFixed(3), fresh_ms_max: +runs[6]!.toFixed(3),
        cached_ms_median: +cruns[3]!.toFixed(3),
        cached_run_stats: { computed: warm.computed, cached: warm.cached },
        note_82: '문턱 없음 — 추세 측정',
      },
    })
    expect(warm.computed, '무변 재실행 — 전부 캐시(재계산 0)').toBe(0)
  })
})
