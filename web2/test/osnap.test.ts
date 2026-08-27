import { describe, it, expect } from 'vitest'
import { osnap, defaultOsnap, intersections3, type OsnapSettings } from '../src/core/osnap'
import { newExtDwell, updateExtDwell, clearExtAcq, endUnderCursor } from '../src/core/extacq'
import { C } from '../src/core/constants'
import { liftAll } from '../src/core/lift'
import { project, DRAW_POSE } from '../src/core/camera'
import { constructedDoc } from './fixtures'
import { pt, mul3, add3 } from '../src/core/vec'

// 기하: 수직 앵커 A (500,500)-(500,300) · 깊이획 B (500,300)-(700,350)
//   A: 3D (−100,−100,−387.3)→(−100,100,−387.3)
//   B: 3D (−100,100,−387.3)→(200,100,−774.6)   (검산은 lift.test.ts의 재사영이 한다)
function scene() {
  const b = constructedDoc()
  const A = b.add(500, 500, 500, 300)
  const B = b.add(500, 300, 700, 350)
  return { b, A, B, lift: liftAll(b.doc) }
}

const allOn = defaultOsnap

function only(kind: keyof OsnapSettings['kinds']): OsnapSettings {
  const s = defaultOsnap()
  for (const k of Object.keys(s.kinds) as (keyof OsnapSettings['kinds'])[]) s.kinds[k] = k === kind
  return s
}

describe('오스냅 — 종류·우선순위·반경', () => {
  it('공유 끝점은 정점, 홀로 끝점은 끝점', () => {
    const { lift } = scene()
    const vtx = osnap(lift, DRAW_POSE, pt(503, 302), allOn())!
    expect(vtx.kind).toBe('vertex') // (500,300)은 A·B가 공유
    expect(vtx.p.x).toBeCloseTo(500, 6)
    expect(vtx.p.y).toBeCloseTo(300, 6)
    // ⚠ (500,500)은 이제 **작도 모서리**다 — 깊이선 둘과 수직 A가 공유하므로 정점이다.
    // 「홀로 끝점」을 재려면 실제로 한 획만 닿는 자리를 골라야 한다: B의 먼 끝(700,350).
    const end = osnap(lift, DRAW_POSE, pt(703, 352), allOn())!
    expect(end.kind).toBe('end')
    const corner = osnap(lift, DRAW_POSE, pt(503, 498), allOn())!
    expect(corner.kind).toBe('vertex') // 깊이선 둘 + A가 만나는 모서리
  })

  it('중점은 3D 중점의 사영 — 화면 중점이 아니다', () => {
    const { lift, B } = scene()
    const seg = lift.lifted.get(B.id)!
    const m3 = mul3(add3(seg.a3, seg.b3), 0.5)
    const mProj = project(lift.an, DRAW_POSE, m3)!
    // 깊이 획의 3D 중점 사영은 화면 중점 (600,325)에서 한참 떨어져 있다 (투시)
    expect(Math.hypot(mProj.x - 600, mProj.y - 325)).toBeGreaterThan(20)
    const hit = osnap(lift, DRAW_POSE, pt(mProj.x + 3, mProj.y + 3), only('mid'))!
    expect(hit.kind).toBe('mid')
    expect(hit.p.x).toBeCloseTo(mProj.x, 6)
    expect(hit.p.y).toBeCloseTo(mProj.y, 6)
    // 반례: 화면 중점 자리에는 중점 후보가 없다
    expect(osnap(lift, DRAW_POSE, pt(600, 325), only('mid'))).toBeNull()
  })

  it('화면 중점 자리는 근처점이다 — 사영선 위의 3D 점', () => {
    const { lift } = scene()
    const hit = osnap(lift, DRAW_POSE, pt(600, 325), only('near'))!
    expect(hit.kind).toBe('near')
    // 3D 점의 재사영이 커서 자리의 선분 사영 위에 있다
    expect(hit.p.x).toBeCloseTo(600, 3)
    expect(hit.p.y).toBeCloseTo(325, 3)
    expect(hit.p3).not.toBeNull()
  })

  it('교차점은 3D에서 실제로 만나는 것만 — 화면 교차는 안 잡는다 (반례)', () => {
    const { b } = scene()
    // E: A의 중간(500,325)에서 시작하는 **vp1 축** 획. B는 vp0 축이므로 3D에서 직교하고
    // 높이도 달라 만나지 않는데, 화면에서는 서로 가로지른다 — 그 가림을 안 잡는 것이 요점이다.
    // ⚠ 원래 수평 획이었다. 2점 프레임에 H가 없어졌다(web2-03 지시 1) — 앱에서도
    //    도달 못 하는 상태였다(축 스냅이 늘 셋 중 하나로 보낸다. 실측함).
    b.add(500, 325, 700, 287.5)
    const lift = liftAll(b.doc)
    expect(lift.lifted.size).toBe(5) // +2: 깊이선 둘도 3D 선이다(지시 1)
    const ints = intersections3(lift)
    // 실제 3D 교차: E가 A 위에서 시작(T자) · B가 A 끝에서 시작(모서리) — 화면 교차(600,325)는 없다
    for (const x of ints) {
      const p = project(lift.an, DRAW_POSE, x.p3)!
      expect(Math.hypot(p.x - 600, p.y - 325)).toBeGreaterThan(30)
    }
    expect(osnap(lift, DRAW_POSE, pt(600, 325), only('int'))).toBeNull()
    // T자 자리는 잡는다
    const tHit = osnap(lift, DRAW_POSE, pt(500, 325), only('int'))!
    expect(tHit.kind).toBe('int')
    expect(tHit.p.x).toBeCloseTo(500, 4)
    expect(tHit.p.y).toBeCloseTo(325, 4)
  })

  it('수선 발 — 시작점에서 선분에 내린 발 (그리는 중에만)', () => {
    const { b } = scene()
    const E = b.add(500, 450, 700, 475) // A 위 (500,450)에서 **vp1 축**으로 (위 주석)
    const lift = liftAll(b.doc)
    const e3 = lift.lifted.get(E.id)!
    // E의 끝(3D (100,−50,−387.3))에서 A(x=−100,z=−387.3 수직선)에 내린 발 = (−100,−50,−387.3) → 화면 (500,450)
    const hit = osnap(lift, DRAW_POSE, pt(502, 449), only('perp'), { p3: e3.b3 })!
    expect(hit.kind).toBe('perp')
    expect(hit.p.x).toBeCloseTo(500, 4)
    expect(hit.p.y).toBeCloseTo(450, 4)
    // 반례: 시작점이 없으면(호버) 수선 발 후보가 없다
    expect(osnap(lift, DRAW_POSE, pt(502, 449), only('perp'))).toBeNull()
  })

  it('연장선 — **획득해야** 난다(web2-18 2부) · 획득하면 선분 밖 직선 위 점', () => {
    const { lift, B } = scene()
    // ② 획득 없이는 한 번도 안 난다 — 종전에는 상시였다(사람 관측의 원인)
    expect(osnap(lift, DRAW_POSE, pt(738, 361), only('ext')),
      '획득 전에는 ext가 없다').toBeNull()

    // ③ B의 먼 끝(700,350)에 EXT_ACQUIRE_MS 머물면 획득된다 — 앱과 같은 함수를 부른다
    const st = newExtDwell()
    updateExtDwell(st, lift, DRAW_POSE, pt(700, 350), C.OSNAP_RADIUS_PX, 0)
    expect(st.acquired.length, '머무름이 아직 안 찼다').toBe(0)
    updateExtDwell(st, lift, DRAW_POSE, pt(700, 350), C.OSNAP_RADIUS_PX, C.EXT_ACQUIRE_MS)
    expect(st.acquired, '그 선분의 b쪽 끝이 획득됐다').toEqual([{ id: B.id, end: 1 }])

    const hit = osnap(lift, DRAW_POSE, pt(738, 361), only('ext'), undefined, undefined, st.acquired)!
    expect(hit.kind).toBe('ext')
    // 붙은 점은 B의 사영 직선 위이고 선분 밖(끝점 (700,350) 너머)이다
    const cross = (hit.p.x - 500) * 50 - (hit.p.y - 300) * 200
    expect(Math.abs(cross) / Math.hypot(200, 50)).toBeLessThan(0.01)
    expect(hit.p.x).toBeGreaterThan(700 + 5)
  })

  it('연장선 ④ — **상한 밖은 아무것도 아니다**(획득한 끝에서 EXT_MAX_RATIO 선분 길이)', () => {
    const { lift, B } = scene()
    const st = newExtDwell()
    updateExtDwell(st, lift, DRAW_POSE, pt(700, 350), C.OSNAP_RADIUS_PX, 0)
    updateExtDwell(st, lift, DRAW_POSE, pt(700, 350), C.OSNAP_RADIUS_PX, C.EXT_ACQUIRE_MS)
    // B는 3D에서 (−100,100,−387.3)→(200,100,−774.6). 상한은 그 길이의 2배 더 간 t=3.
    // 화면에서 t를 재려면 사영을 쓴다 — **앱과 같은 project**로 상한 안/밖 한 점씩.
    const seg = lift.lifted.get(B.id)!
    const dir = { x: seg.b3.x - seg.a3.x, y: seg.b3.y - seg.a3.y, z: seg.b3.z - seg.a3.z }
    const at = (t: number) => project(lift.an, DRAW_POSE,
      add3(seg.a3, mul3(dir, t)))!
    const inside = at(1 + C.EXT_MAX_RATIO * 0.6)     // 상한 안
    const outside = at(1 + C.EXT_MAX_RATIO * 1.4)    // 상한 밖
    expect(osnap(lift, DRAW_POSE, inside, only('ext'), undefined, undefined, st.acquired)?.kind,
      `상한 안(t=${1 + C.EXT_MAX_RATIO * 0.6})은 후보다`).toBe('ext')
    expect(osnap(lift, DRAW_POSE, outside, only('ext'), undefined, undefined, st.acquired),
      `상한 밖(t=${1 + C.EXT_MAX_RATIO * 1.4})은 아무것도 아니다`).toBeNull()
  })

  it('연장선 ⑤ — 획득은 최대 둘·LRU이고, `clearExtAcq`(확정)가 비운다', () => {
    const { lift } = scene()
    const st = newExtDwell()
    const ends = [pt(500, 500), pt(500, 300), pt(700, 350)]
    let t = 0
    const dwell = (p: ReturnType<typeof pt>) => {
      updateExtDwell(st, lift, DRAW_POSE, p, C.OSNAP_RADIUS_PX, t)
      updateExtDwell(st, lift, DRAW_POSE, p, C.OSNAP_RADIUS_PX, t + C.EXT_ACQUIRE_MS)
      t += C.EXT_ACQUIRE_MS * 2
    }
    for (const e of ends) dwell(e)
    expect(st.acquired.length, `상한 ${C.EXT_MAX_ACQUIRED}개를 안 넘는다`).toBe(C.EXT_MAX_ACQUIRED)
    // LRU — 앞이 최신이므로 마지막에 머문 (700,350)이 맨 앞이다
    const last = endUnderCursor(lift, DRAW_POSE, pt(700, 350), C.OSNAP_RADIUS_PX)!
    expect(st.acquired[0]).toEqual(last)
    clearExtAcq(st)
    expect(st.acquired, '획을 확정하면 비운다').toEqual([])
  })

  it('우선순위 — 정확한 것이 앞선다: X자 교차 자리에서 근처점보다 교차점', () => {
    const { b } = scene()
    // 같은 z 평면에 십자: E1 y=450, E2 y=350 (둘 다 A에서 시작), V가 E1에서 E2를 관통
    b.add(500, 450, 700, 450)
    b.add(500, 350, 700, 350)
    b.add(620, 450, 620, 300)
    const lift = liftAll(b.doc)
    expect(lift.lifted.size).toBe(7) // +2: 깊이선 둘도 3D 선이다(지시 1)
    const hit = osnap(lift, DRAW_POSE, pt(622, 351), allOn())!
    expect(hit.kind).toBe('int') // near도 잡히지만 int가 앞선다 (끝점·중점은 20px 이상 밖)
    expect(hit.p.x).toBeCloseTo(620, 3)
    expect(hit.p.y).toBeCloseTo(350, 3)
  })

  it('반경 — 밖이면 null, 줄이면 놓친다', () => {
    const { lift } = scene()
    expect(osnap(lift, DRAW_POSE, pt(300, 200), allOn())).toBeNull()
    const tight = allOn()
    tight.radius = 2
    expect(osnap(lift, DRAW_POSE, pt(505, 305), tight)).toBeNull() // 끝점에서 ~7px
  })

  it('전부 끄면 아무것도 안 붙는다', () => {
    const { lift } = scene()
    const off = defaultOsnap()
    for (const k of Object.keys(off.kinds) as (keyof OsnapSettings['kinds'])[]) off.kinds[k] = false
    expect(osnap(lift, DRAW_POSE, pt(500, 300), off)).toBeNull()
  })

  it('대기 획의 끝점도 후보다 (2D) — 연쇄의 출발점', () => {
    const { b } = scene()
    const w = b.add(900, 600, 1000, 645) // 미연결 자유 획 → 대기
    const lift = liftAll(b.doc)
    // ⚠ 개수를 박지 않는다 — 깊이선도 이제 3D 대상이라(지시 1) 안 닿으면 함께 대기한다.
    // 이 팔이 재는 것은 «대기 획의 끝점이 후보인가»이지 대기가 몇 개인가가 아니다.
    expect(lift.waiting).toContain(w.id)
    const hit = osnap(lift, DRAW_POSE, pt(902, 602), only('end'))!
    expect(hit.kind).toBe('end')
    expect(hit.p).toEqual(pt(900, 600))
    expect(hit.p3).toBeNull()
  })
})

describe('선분 위 시작 — 확정된 선과 만나면 좌표가 정해진다', () => {
  it('선분 사영 위의 시작점이 3D 선분 위 점으로 올라간다', () => {
    const { b, A } = scene()
    const E = b.add(500, 450, 700, 450) // (500,450)은 A의 사영 위
    const lift = liftAll(b.doc)
    const seg = lift.lifted.get(E.id)
    expect(seg).toBeDefined()
    // 시작 3D가 A 선분 위 — A는 모서리(지면)에서 세운 수직이므로 x·z는 모서리의 것이고
    // y만 화면 높이가 정한다. 좌표는 이제 미터다(눈높이 1.6이 스케일을 정한다, 지시 3).
    const a = lift.lifted.get(A.id)!
    expect(seg!.a3.x).toBeCloseTo(a.a3.x, 6)
    expect(seg!.a3.z).toBeCloseTo(a.a3.z, 6)
    expect(seg!.a3.y).toBeGreaterThan(a.a3.y)  // 지면보다 위
    expect(seg!.a3.y).toBeLessThan(a.b3.y)     // A의 위 끝보다 아래
  })

  it('반례: 선분 사영에서 벗어난 시작은 대기', () => {
    const { b } = scene()
    const E = b.add(510, 450, 710, 450) // A 사영(x=500)에서 10px 옆
    const lift = liftAll(b.doc)
    expect(lift.lifted.has(E.id)).toBe(false)
    expect(lift.waiting).toContain(E.id)
  })
})
