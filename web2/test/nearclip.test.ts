// web2-25 1부 — **근평면 잘라내기**: 실내 시점에서 은선이 선다.
//
// web2-23이 남긴 결함: 「꼭짓점이 카메라 뒤로 넘어간 면은 굽기에서 **통째로 빠진다**」.
// 예외적 국면이 아니라 **기본 국면**이다 — 방 안에서 그리기 시작하면 좌우 벽과 바닥이
// 거의 언제나 꼭짓점 하나를 카메라 뒤에 둔다. 그러면 그 면들이 은선에서 빠지고
// 「어떤 벽은 가려지고 어떤 벽은 안 가려진다」가 난다(안 되는 것보다 헷갈린다).
//
//   ① 좌우 벽·바닥이 은선 계산에 든다(`dropped` 0 — **수리 전에는 2 이상**)
//   ② 그 벽 뒤의 선이 hidden 이다(+ 방 안의 선은 visible — 양성·음성 한 쌍)
//   ③ 벽 자신의 모서리는 visible 이다(같은 평면 조항 회귀 — web2-23 ②)
//   ④ **전부** 카메라 뒤인 면은 빠진다(`dropped` 가 그것을 센다)
//   ⑤ web2-23의 바깥 시점 팔이 그대로 통과한다 → `make2d.test.ts`가 그 자리다(회귀)
//   ⑥ 오목 다각형에서 가림 판정이 안 바뀐다(Sutherland–Hodgman 의 겹친 «다리»)
//   반증(D-3): `nearClip:false`(= web2-23의 동작)로 돌리면 ①이 실패하는가 — **실제로 뺀다**
//
// 픽스처는 **실내**이고 손 오차를 태운다(#68) — 방 꼭짓점을 `rng32`로 ±0.02 흔든다.
// 이상적 직각 방으로만 재면 「도달 불가」가 통과로 남는다.

import { describe, it, expect } from 'vitest'
import { constructedDoc } from './fixtures'
import { analyze, DRAW_POSE, project, projectPolyNear } from '../src/core/camera'
import type { LiftResult, LiftedSeg } from '../src/core/lift'
import { resolveFaces } from '../src/core/face'
import { bakeUnderlay } from '../src/core/make2d'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import type { Face, Stroke } from '../src/core/types'
import { v3, type V3 } from '../src/core/vec'

/** 실내용 합성 lift — 꼭짓점이 카메라 뒤일 수 있으므로 **화면 좌표는 되는 것만** 넣는다.
 *  굽기도 `resolveFaces`도 `lift.strokes`를 안 읽는다(3D 만으로 돈다) — 그래서 성립한다. */
function indoorLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    const a = project(an, DRAW_POSE, s.a3), b = project(an, DRAW_POSE, s.b3)
    if (a && b) strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null }
}

/** 고리 하나를 선분 넷으로 — 이웃한 두 변의 3D 직선 교점이 정점이 된다(face.ts ③) */
function ring(id0: number, pts: V3[]): { id: number; a3: V3; b3: V3 }[] {
  return pts.map((p, i) => ({ id: id0 + i, a3: p, b3: pts[(i + 1) % pts.length]! }))
}

/** 획 목록 + 고리 목록 → lift 와 풀린 면 */
function build(rings: V3[][], extra: { id: number; a3: V3; b3: V3 }[]) {
  const segs: { id: number; a3: V3; b3: V3 }[] = []
  const faces: Face[] = []
  let id = 1
  rings.forEach((pts, k) => {
    segs.push(...ring(id, pts))
    faces.push({
      id: 100 + k,
      loops: [{ edges: pts.map((_, i) => ({ kind: 'stroke' as const, s: id + i })) }],
    })
    id += pts.length
  })
  segs.push(...extra)
  const lift = indoorLift(segs)
  return { lift, resolved: resolveFaces(lift, faces), wallSegs: id - 1 }
}

/** 손 오차(#68) — 방의 꼭짓점을 결정론으로 ±JIT 흔든다. 이상적 직각이 아니다. */
const JIT = 0.02
function handRoom(seed: number) {
  const r = rng32(seed)
  const j = (p: V3) => v3(
    p.x + (r() - 0.5) * 2 * JIT, p.y + (r() - 0.5) * 2 * JIT, p.z + (r() - 0.5) * 2 * JIT)
  // 눈은 (0, 1.6, 0)에서 −z 를 본다. 방은 z = +2(**등 뒤**) ~ −8 · x = ±3 · y = 0~3.
  // 좌우 벽과 바닥은 z=+2 쪽 꼭짓점이 카메라 뒤다 — 실내 투시의 기본 국면.
  const A = j(v3(-3, 0, 2)), B = j(v3(3, 0, 2)), K = j(v3(3, 0, -8)), D = j(v3(-3, 0, -8))
  const E = j(v3(-3, 3, 2)), F = j(v3(3, 3, 2)), G = j(v3(3, 3, -8)), H = j(v3(-3, 3, -8))
  return {
    floor: [A, B, K, D],       // y = 0   — 꼭짓점 둘이 뒤
    left: [A, D, H, E],        // x = −3  — 꼭짓점 둘이 뒤
    right: [B, F, G, K],       // x = +3  — 꼭짓점 둘이 뒤
    back: [D, K, G, H],        // z = −8  — 전부 앞
  }
}

/** 왼쪽 벽 **너머**(x = −5)의 선 — 벽이 가려야 한다(②) */
const BEYOND = { id: 90, a3: v3(-5, 1.5, -8), b3: v3(-5, 1.5, -12) }
/** 방 **안**의 선 — 가릴 것이 없다(②의 음성 대조) */
const INSIDE = { id: 91, a3: v3(-1, 1.5, -4), b3: v3(1, 1.5, -4) }

const SEED = 20250825

describe('web2-25 1부 — 근평면 잘라내기(실내 시점)', () => {
  const R = handRoom(SEED)
  const { lift: RL, resolved: RR, wallSegs } = build(
    [R.floor, R.left, R.right, R.back], [BEYOND, INSIDE])
  /** 시험선의 화면 y — 좌표를 손으로 안 적는다(장면을 손대면 따라 움직인다) */
  const yOf = (s: { a3: V3; b3: V3 }) => project(RL.an, DRAW_POSE,
    v3((s.a3.x + s.b3.x) / 2, (s.a3.y + s.b3.y) / 2, (s.a3.z + s.b3.z) / 2))!.y
  const at = (r: ReturnType<typeof bakeUnderlay>, y: number) =>
    r.segs.filter(s => Math.abs(s.a.y - y) < 3 && Math.abs(s.b.y - y) < 3)

  it('장면이 실제로 섰다 — 면 넷 · 셋은 꼭짓점이 카메라 뒤다(분해능 단언)', () => {
    expect(RR.length).toBe(4)
    expect(wallSegs).toBe(16)
    // **이 장면이 실제로 「뒤로 넘어간 꼭짓점」을 갖는가**(#71 ㉢) — 아니면 ①은
    // 아무것도 안 재는 격자다(수리 전후가 같은 값을 낸다).
    const behind = RR.filter(f => f.outer.some(p => project(RL.an, DRAW_POSE, p) === null))
    expect(behind.length).toBe(3)                              // 바닥 · 왼벽 · 오른벽
    expect(RR.every(f => f.flat < C.PLANAR_RATIO)).toBe(true)   // 손 오차를 태우고도 면이 선다
    expect(RR.some(f => f.flat > 0)).toBe(true)                 // 오차가 실제로 실렸다
  })

  it('① 좌우 벽·바닥이 은선 계산에 든다 — dropped 0 · faces 4', () => {
    const r = bakeUnderlay(RL, RR, DRAW_POSE)
    expect(r.dropped).toBe(0)
    expect(r.faces).toBe(4)
  })

  it('반증(D-3) — 잘라내기를 빼면 ①이 실패한다: 세 면이 통째로 빠지고 증상이 돌아온다', () => {
    const r = bakeUnderlay(RL, RR, DRAW_POSE, { nearClip: false })
    expect(r.dropped).toBe(3)                    // 지시의 「수리 전에는 2 이상」
    expect(r.faces).toBe(1)                      // 안쪽 벽 하나만 남는다
    // 그리고 그것이 곧 증상이다 — 왼쪽 벽 너머의 선이 **안 가려진다**
    const beyond = at(r, yOf(BEYOND))
    expect(beyond.length).toBeGreaterThan(0)
    expect(beyond.every(s => !s.hidden)).toBe(true)
  })

  it('② 왼쪽 벽 너머의 선이 hidden 이다 — 방 안의 선은 visible(양성·음성 한 쌍)', () => {
    const r = bakeUnderlay(RL, RR, DRAW_POSE)
    const beyond = at(r, yOf(BEYOND))
    expect(beyond.length).toBeGreaterThan(0)
    expect(beyond.every(s => s.hidden)).toBe(true)
    const inside = at(r, yOf(INSIDE))
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.every(s => !s.hidden)).toBe(true)
  })

  it('③ 벽 자신의 모서리는 visible 이다 — 같은 평면 조항 회귀(web2-23 ②)', () => {
    // 방 경계 획만으로 다시 굽는다 — 하나라도 hidden 이면 자기 방에 가린 것이다.
    //
    // ⚠⚠ **이 팔의 반증은 여기 없다**(#74 ㉠ — 정직하게 적는다): 벽의 네 변은 면 다각형의
    //   «경계 위»라 포함 판정이 밖으로 읽고, 정확히 같은 평면이면 부등식이 어느 쪽으로도
    //   안 기운다. 그래서 **같은 평면 조항을 빼도 이 장면은 안 갈린다**(실측 — 조항 on/off
    //   둘 다 가린 조각 1개, BEYOND 하나뿐). 조항 자체의 반증은 web2-23 `make2d.test.ts`
    //   ㉮(비스듬한 «거의 평면» 장면)가 **정본**이고 이 회차가 그것을 안 건드렸다.
    //   이 팔이 실제로 지키는 것은 **이 회차의 변경**이다 — 잘라낸 다각형이 틀리면
    //   (감김 방향·부호·큰 좌표) 방의 모서리가 남의 면 안으로 읽혀 hidden 이 된다.
    //   그 «틀리면 깨진다»의 양성 대조는 ②다: 같은 왼쪽 벽이 **실제로** 너머의 선을 가린다.
    const wallOnly: LiftResult = {
      ...RL, lifted: new Map([...RL.lifted].filter(([id]) => id <= wallSegs)),
    }
    const rw = bakeUnderlay(wallOnly, RR, DRAW_POSE)
    // 열여섯 중 **셋은 통째로 카메라 뒤**다(등 뒤 z=+2 를 잇는 변 — 바닥·왼벽·오른벽에
    // 하나씩). `projectSeg`가 그 규약대로 버린다 — 잘라내기는 면에 하는 일이지 선분의
    // 규약을 바꾸지 않는다(#54).
    expect(rw.lines).toBe(13)
    expect(rw.segs.every(s => !s.hidden)).toBe(true)
  })

  it('④ 전부 카메라 뒤인 면은 빠진다 — dropped 가 그것을 센다', () => {
    // 등 뒤(z = +3)의 벽 하나를 더 세운다. 잘라내기를 해도 남는 꼭짓점이 없다.
    const behindWall = [v3(-3, 0, 3), v3(3, 0, 3), v3(3, 3, 3), v3(-3, 3, 3)]
    const { lift, resolved } = build([R.back, behindWall], [INSIDE])
    expect(resolved.length).toBe(2)
    const r = bakeUnderlay(lift, resolved, DRAW_POSE)
    expect(r.faces).toBe(1)
    expect(r.dropped).toBe(1)
  })

  // ── ⑥ 오목 다각형 — 겹친 «다리»가 실제로 생기고, 포함 판정은 그대로다 ──────────
  //
  // Sutherland–Hodgman 은 잘린 결과가 **여러 조각으로 갈릴 때** 그 조각들을 클립 경계를
  // 따라 오가는 «다리»로 잇는다 — 같은 자리를 **반대 방향으로 두 번** 지나는 변이다.
  // 짝홀(even–odd) 포함 판정은 그 변을 두 번 세므로 홀짝이 안 바뀌고 답이 그대로다.
  // 여기서는 ㉠ 다리가 실제로 생겼다는 값과 ㉡ 볼록 둘로 쪼갠 기준과의 일치로 낸다.
  describe('⑥ 오목 다각형(∩ 꼴 바닥)', () => {
    const P = (x: number, z: number) => v3(x, 0, z)
    // 방바닥이 ∩ 꼴이다 — 두 다리가 카메라 앞(z<0)으로 뻗고 잇는 몸통은 등 뒤(z>0)에 있다.
    // 잘라내면 **두 조각**으로 갈리므로 다리가 생긴다.
    const ARCH = [P(-3, -8), P(-1, -8), P(-1, 1), P(1, 1), P(1, -8), P(3, -8), P(3, 3), P(-3, 3)]
    const LEG_L = [P(-3, -8), P(-1, -8), P(-1, 3), P(-3, 3)]
    const LEG_R = [P(1, -8), P(3, -8), P(3, 3), P(1, 3)]
    // 바닥 **아래**(y = −0.5)의 선 둘 — 왼 다리 밑(가려야 한다)과 홈 밑(보여야 한다)
    // ⚠ **깊이를 고정한다**(z 상수) — 그래야 화면 y 가 선분 위에서 일정해 «그 선의 조각»을
    //   y 로 고를 수 있다. 둘의 z 를 다르게 둬서 서로 안 섞이게 한다.
    const UNDER_LEG = { id: 90, a3: v3(-2.5, -0.5, -4), b3: v3(-1.5, -0.5, -4) }
    const UNDER_GAP = { id: 91, a3: v3(-0.5, -0.5, -5), b3: v3(0.5, -0.5, -5) }
    const cc = build([ARCH], [UNDER_LEG, UNDER_GAP])
    const cv = build([LEG_L, LEG_R], [UNDER_LEG, UNDER_GAP])

    it('㉠ 다리가 실제로 생겼다 — 근평면에서 난 꼭짓점이 넷이고 구간이 겹친다', () => {
      expect(cc.resolved.length).toBe(1)
      const poly = projectPolyNear(cc.lift.an, DRAW_POSE, cc.resolved[0]!.outer)!
      // 근평면 꼭짓점은 전부 같은 화면 y 에 온다(카메라 좌표 z 가 같으므로) — 그 값을
      // 손으로 안 적고 **가장 흔한 y** 로 고른다.
      const ys = poly.map(p => Math.round(p.y))
      const nearY = ys.sort((a, b) =>
        ys.filter(v => v === b).length - ys.filter(v => v === a).length)[0]!
      const onNear = poly.filter(p => Math.round(p.y) === nearY)
      expect(onNear.length).toBe(4)              // 둘이면 조각이 하나라 다리가 없다
      const xs = onNear.map(p => p.x).sort((a, b) => a - b)
      // 바깥 구간 [xs0, xs3] 안에 안쪽 구간 [xs1, xs2]가 든다 = 같은 직선 위에서 겹친다
      expect(xs[0]!).toBeLessThan(xs[1]!)
      expect(xs[2]!).toBeLessThan(xs[3]!)
    })

    it('㉡ 가림 판정이 볼록 둘로 쪼갠 기준과 같다 — 오목함이 답을 가른다', () => {
      expect(cv.resolved.length).toBe(2)
      const rc = bakeUnderlay(cc.lift, cc.resolved, DRAW_POSE)
      const rv = bakeUnderlay(cv.lift, cv.resolved, DRAW_POSE)
      const yL = yOfIn(cc.lift, UNDER_LEG), yR = yOfIn(cc.lift, UNDER_GAP)
      const pick = (r: ReturnType<typeof bakeUnderlay>, y: number) =>
        r.segs.filter(s => Math.abs(s.a.y - y) < 3 && Math.abs(s.b.y - y) < 3).map(s => s.hidden)
      // 왼 다리 밑은 가리고 홈 밑은 안 가린다 — 오목함이 없으면 둘이 같아진다
      expect(pick(rc, yL).length).toBeGreaterThan(0)
      expect(pick(rc, yL).every(h => h)).toBe(true)
      expect(pick(rc, yR).length).toBeGreaterThan(0)
      expect(pick(rc, yR).every(h => !h)).toBe(true)
      // 그리고 **볼록 둘과 같은 답**이다(다리가 판정을 안 바꿨다는 것이 이 줄이다)
      expect(pick(rc, yL)).toEqual(pick(rv, yL))
      expect(pick(rc, yR)).toEqual(pick(rv, yR))
    })

    function yOfIn(lift: LiftResult, s: { a3: V3; b3: V3 }) {
      return project(lift.an, DRAW_POSE, v3(
        (s.a3.x + s.b3.x) / 2, (s.a3.y + s.b3.y) / 2, (s.a3.z + s.b3.z) / 2))!.y
    }
  })
})
