// **승격 동결 측정 — 굳힌 3D는 승격을 살아남는가** (web2-13 2부 · 개정 3 초안 §9.1의 원장)
//
// 물음(초안 §9 — 1-i): 획이 3D를 소유(동결)한 뒤 카메라가 바뀌면(승격), 그 3D를
// **새 카메라로 사영한 화면 위치**가 그 획의 `pts2d`와 여전히 맞는가.
//
// ⚠ 이것은 promote.test.ts의 «작도 시점 0»과 **다른 양**이다 — 저쪽은 **재리프팅한**
// 3D의 재사영(구성상 보장 · 자기참조 유형 3)이고, 여기는 **옛 카메라로 굳힌** 3D를
// 새 카메라에 넣는 것이라 구성상 0일 이유가 없다. 그래서 잰다.
//
// ⚠ 지시 문면은 «P2→P3»인데 **web2에 실재하는 승격은 P1→P2 하나다**(fSource
// default→two-vp — f 임의 게이지가 f²=|u₁||u₂|로 확정되고 주점이 깊이 소실점에서
// W/2로 옮겨간다). 3점은 도달 불가다(web2-03 — 수직 소실점 경로가 없다). D-4대로
// 실재하는 승격을 재고 이 갈림을 원장·NOTES에 남긴다. 기전(승격 = 카메라 재확정)은
// 같은 형태이므로 물음의 답은 이 측정이 준다.
//
// 판정선(측정 **전에** 등록 — #26 · 초안 §9.1과 같은 문장):
//   맞는다   = 작도 시점 동결 어긋남의 전 구도 **최악** ≤ C.TAP_MAX_PX(2px — 「같은 점」 문)
//   안 맞는다 = 그 위. 경계는 안 맞는 쪽.
// 오라클(#35 — 도달 가능성):
//   · 승격 전 동결 3D를 옛 카메라로 사영 → pts2d (구성상 0 — 동결 스냅샷의 건전성)
//   · 승격 후 재리프팅 3D를 새 카메라로 사영 → pts2d (구성상 0 — 하네스가 통과 불가능하지 않다)
// 반증(D-3 — 계기가 살아 있다):
//   · 카메라를 일부러 어긋내면(f×1.2 · 주점 +30px) 어긋남이 커져야 한다
//   · 3D를 일부러 어긋내면(+0.1 세계단위) 어긋남이 커져야 한다
//
// 원장: stage0/out/promote_freeze_web2.json (§5 — 문서에 수를 옮겨 적지 않는다)
//   npx vitest run test/promote_freeze.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { project, DRAW_POSE, type Analysis } from '../src/core/camera'
import { C } from '../src/core/constants'
import { quatAxisAngle, type Quat, type V3 } from '../src/core/vec'

// promote.test.ts와 같은 궤도 시점 — 원장의 «궤도 시점이 크게 움직인다»와 같은 조건
const ORBIT = { p: { x: 3, y: 1.6, z: 3 } as V3, q: quatAxisAngle({ x: 0, y: 1, z: 0 }, 0.4) as Quat }

interface Frozen { a3: V3; b3: V3; a2: { x: number; y: number }; b2: { x: number; y: number } }

/** 구도 — 깊이선(vp0)·기둥·깊이 획·기둥 둘째 + 승격 획(지평선은 상시 H/2 — web2-17).
 *  ⚠ 화면 가로(H) 획은 넣을 수 없다 — 선언되는 순간 1점으로 잠겨 승격이 막힌다(web2-02).
 *  그래서 픽스처는 기둥(V)·깊이 획으로 짠다. */
const COMPS = [
  {
    name: 'A_중앙',
    W: 1200, H: 800,
    setup: [
      [500, 500, 600, 475],    // 깊이선 → vp0 = 900
      [500, 500, 500, 300],    // 기둥(앵커 — 화면 평행 V)
      [500, 300, 660, 340],    // 깊이 획(기둥 꼭대기 → vp0 방향)
      [660, 340, 660, 440],    // 둘째 기둥(깊이 획 끝에서)
    ],
    promote: [500, 500, 400, 475],   // → vp1 = 100 (u1=300 · u2=−500 → f²>0)
  },
  {
    name: 'B_먼VP',
    W: 1200, H: 800,
    // web2-17: 옛 장면(지평선 350)을 +50 평행이동 — 지평선은 상시 H/2=400이고 획이 아니다
    setup: [
      [300, 600, 420, 570],    // → vp0 = 1100
      [300, 600, 300, 400],    // 기둥(앵커)
      [300, 400, 480, 355],    // 깊이 획 — 지평선 위 시작이라 처짐 0… (아래 B_FIX가 대체)
      [480, 555, 480, 480],    // 둘째 기둥(아래 깊이 획 끝에서)
    ],
    promote: [300, 600, 200, 560],   // → vp1 = −200
  },
  {
    name: 'C_좁은화각',
    W: 1200, H: 800,
    setup: [
      [700, 600, 850, 570],      // → vp0 = 1700
      [700, 600, 700, 450],      // 기둥(앵커)
      [700, 450, 850, 442.5],    // 깊이 획(기둥 꼭대기 → vp0)
      [850, 442.5, 850, 520],    // 둘째 기둥
    ],
    promote: [700, 600, 550, 566],   // → vp1 ≈ −182 (f ≈ 927 — 좁은 화각)
  },
  {
    // 2차 리뷰어 [15](D-5·#31): 주점 이동 0 근방 — 가장 흔한 «정면 1점»(깊이 소실점이
    // 화면 중앙 근처)을 격자에 넣는다. 주점 이동 20px — 여기서도 어긋나면 어긋남의
    // 원인이 주점만이 아니라 f 재확정에도 있다는 뜻이고, «맞는다» 방향의 격자점이
    // 하나는 실재하게 된다(#31 — 스윕이 한쪽 방향만 만들 수 있으면 부재는 관측이 아니다).
    name: 'D_주점근접',
    W: 1200, H: 800,
    setup: [
      [500, 500, 560, 450],      // → vp0 = 620 (주점 이동 |620−600| = 20px)
      [500, 500, 500, 320],      // 기둥(앵커)
      [500, 320, 560, 360],      // 깊이 획(기둥 꼭대기 → vp0)
      [560, 360, 560, 470],      // 둘째 기둥
    ],
    promote: [500, 500, 400, 487.5], // → vp1 = −300 (u1=20 · u2=−900 → f ≈ 134)
  },
] as const

// ⚠ B의 셋째 획은 시작점이 지평선 위(y=400)라 깊이 획이 아니라 수평 대역에 걸릴 수
// 있다 — 그런 획은 아래 build가 «리프팅 안 된 획»으로 자연히 거르고, 원장의
// strokes_frozen 수가 그 사실을 든다(조용히 안 거른다 — 수가 말한다).
// B는 대신 (300,600)→(480,555) 아래 깊이 획을 쓴다.
const B_FIX: [number, number, number, number] = [300, 600, 480, 555]

function build(comp: (typeof COMPS)[number]) {
  const s = session(comp.W, comp.H)
  const drawn: { id: number; a2: { x: number; y: number }; b2: { x: number; y: number } }[] = []
  const rows = comp.name === 'B_먼VP'
    ? comp.setup.map((r, i) => (i === 2 ? B_FIX : (r as unknown as [number, number, number, number])))
    : (comp.setup as unknown as [number, number, number, number][])
  for (const [ax, ay, bx, by] of rows) {
    const st = s.draw(ax, ay, bx, by)
    if (st) drawn.push({ id: st.id, a2: { ...st.a }, b2: { ...st.b } })
  }
  return { s, drawn }
}

const dev = (p: { x: number; y: number } | null, q: { x: number; y: number }) =>
  p ? Math.hypot(p.x - q.x, p.y - q.y) : Number.POSITIVE_INFINITY

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length === 0 ? null : a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2
}

describe('승격 동결 측정 — 원장 promote_freeze_web2.json', () => {
  it('구도 셋 × 획 여럿 — 동결 3D의 새 카메라 사영 어긋남(작도/궤도) + 오라클 + 반증', () => {
    const ledger: any = {
      what: '굳힌 3D를 새 카메라(승격 후)로 사영한 화면 위치와 pts2d의 어긋남(px)',
      promotion: 'P1→P2 (fSource default→two-vp) — web2에 실재하는 유일한 승격. 지시 문면 «P2→P3»과의 갈림은 NOTES web2-13 2부 절',
      threshold: { rule: '맞는다 = draw.max_px ≤ TAP_MAX_PX (전 구도 최악 · 경계는 안 맞는 쪽 — 측정 전 등록, 초안 §9.1)', TAP_MAX_PX: C.TAP_MAX_PX },
      orbit_pose: ORBIT,
      comps: [] as any[],
    }
    const allDraw: number[] = []
    const allOrbit: number[] = []

    for (const comp of COMPS) {
      const { s, drawn } = build(comp)
      const anOld = s.app.lift.an as Analysis
      expect(anOld.fSource).toBe('default')                       // P1이다

      // ── 동결 — 승격 전 3D 스냅샷 ────────────────────────────────────────
      const frozen = new Map<number, Frozen>()
      for (const d of drawn) {
        const g = s.app.lift.lifted.get(d.id)
        if (g) frozen.set(d.id, { a3: { ...g.a3 }, b3: { ...g.b3 }, a2: d.a2, b2: d.b2 })
      }
      expect(frozen.size).toBeGreaterThanOrEqual(3)               // 잴 것이 있다(#38 — 대상 0 방지)

      // 오라클 ①: 동결 3D를 **옛** 카메라로 사영 → pts2d (구성상 0 — 스냅샷 건전성)
      let preOracle = 0
      for (const f of frozen.values()) {
        preOracle = Math.max(preOracle,
          dev(project(anOld, DRAW_POSE, f.a3), f.a2), dev(project(anOld, DRAW_POSE, f.b3), f.b2))
      }
      expect(preOracle).toBeLessThan(1e-6)

      // ── 승격 ────────────────────────────────────────────────────────────
      const [px1, py1, px2, py2] = comp.promote
      const pr = s.draw(px1, py1, px2, py2)
      expect(pr).not.toBeNull()
      const anNew = s.app.lift.an as Analysis
      expect(anNew.fSource).toBe('two-vp')                        // 승격이 실제로 일어났다
      const fMoved = Math.abs((anNew.f ?? 0) - (anOld.f ?? 0))
      expect(fMoved).toBeGreaterThan(1)                           // 카메라가 실제로 바뀌었다

      // ── 측정 — 작도 시점: 동결 3D × 새 카메라 대 pts2d ──────────────────
      const drawDevs: number[] = []
      for (const f of frozen.values()) {
        drawDevs.push(dev(project(anNew, DRAW_POSE, f.a3), f.a2))
        drawDevs.push(dev(project(anNew, DRAW_POSE, f.b3), f.b2))
      }
      // ── 측정 — 궤도 시점: 동결 3D 대 재리프팅 3D (둘 다 새 카메라·같은 궤도) ──
      const orbitDevs: number[] = []
      let relifted = 0
      let reliftOracle = 0
      for (const [id, f] of frozen) {
        const g = s.app.lift.lifted.get(id)
        if (!g) continue
        relifted++
        orbitDevs.push(dev(project(anNew, ORBIT, f.a3), project(anNew, ORBIT, g.a3) ?? { x: NaN, y: NaN }))
        orbitDevs.push(dev(project(anNew, ORBIT, f.b3), project(anNew, ORBIT, g.b3) ?? { x: NaN, y: NaN }))
        // 오라클 ②: 재리프팅 3D × 새 카메라 × 작도 시점 = pts2d (구성상 0)
        reliftOracle = Math.max(reliftOracle,
          dev(project(anNew, DRAW_POSE, g.a3), f.a2), dev(project(anNew, DRAW_POSE, g.b3), f.b2))
      }
      expect(relifted).toBeGreaterThanOrEqual(3)                  // 승격 후에도 잴 것이 있다
      expect(reliftOracle).toBeLessThan(1e-6)

      // ── 반증(D-3) — 계기가 카메라·3D 오차에 반응하는가 ──────────────────
      // ⚠ 기준선이 0인 곳(승격 **전** · 옛 카메라 — 오라클 ①이 0을 보증한 그 행)에서
      // 섭동한다. 승격 후 동결 어긋남 위에 섭동을 얹으면 우연히 **가까워질** 수 있어
      // (실측: 주점 +30이 153.7 → 124.9로 줄었다) 「커진다」가 계기의 성질을 안 잰다.
      const drawMax = Math.max(...drawDevs)
      const anF12: Analysis = { ...anOld, f: (anOld.f ?? 1) * 1.2 }
      const anPp: Analysis = { ...anOld, principal: anOld.principal ? { x: anOld.principal.x + 30, y: anOld.principal.y } : null }
      let f12Max = 0, ppMax = 0
      for (const f of frozen.values()) {
        f12Max = Math.max(f12Max, dev(project(anF12, DRAW_POSE, f.a3), f.a2), dev(project(anF12, DRAW_POSE, f.b3), f.b2))
        ppMax = Math.max(ppMax, dev(project(anPp, DRAW_POSE, f.a3), f.a2), dev(project(anPp, DRAW_POSE, f.b3), f.b2))
      }
      expect(preOracle).toBeLessThan(1e-6)                        // 기준선 0 (재확인)
      expect(f12Max).toBeGreaterThan(1)                           // 카메라 반증 ① f×1.2 → 0에서 크게 뜬다
      // ⚠ 주점 섭동은 **항등이다**(2차 리뷰어 [14] — 주점은 사영식의 덧셈 항이라 어떤
      // 3D에도 정확히 +30이 나온다. 실측: 세 구도 전부 30.000…). 계기 검증이 아니라
      // «덧셈이 된다»의 확인일 뿐이므로 원장에 identity로 표시하고, 살아 있는 카메라
      // 반증은 f×1.2 하나로 친다(f는 구도마다 다른 값을 낸다 — 실제 판별력).
      expect(ppMax).toBeGreaterThan(1)
      // 3D 반증 — +0.1 세계단위의 사영 이동이 0이 아니다(계기가 3D에 반응)
      let p3Alone = 0
      for (const f of frozen.values()) {
        const sh = { x: f.a3.x + 0.1, y: f.a3.y, z: f.a3.z }
        p3Alone = Math.max(p3Alone, dev(project(anOld, DRAW_POSE, sh), project(anOld, DRAW_POSE, f.a3) ?? { x: NaN, y: NaN }))
      }
      expect(p3Alone).toBeGreaterThan(0.5)

      ledger.comps.push({
        name: comp.name,
        f_before: anOld.f, f_after: anNew.f, f_moved: fMoved,
        principal_before_x: anOld.principal?.x, principal_after_x: anNew.principal?.x,
        strokes_drawn: drawn.length, strokes_frozen: frozen.size, strokes_relifted: relifted,
        draw: { what: '동결 3D × 새 카메라 × 작도 시점 대 pts2d', median_px: median(drawDevs), max_px: drawMax, n: drawDevs.length },
        orbit: {
          what: '동결 3D 대 재리프팅 3D — 둘 다 새 카메라 × 궤도 시점. ⚠ pts2d 대조가 아니다(궤도에는 pts2d가 없다 — 2차 리뷰어 [16])',
          median_px: median(orbitDevs), max_px: orbitDevs.length ? Math.max(...orbitDevs) : null, n: orbitDevs.length,
        },
        oracle: {
          pre_max_px: preOracle, relift_max_px: reliftOracle,
          note: '둘 다 구성상 0(항등) — 하네스 배선의 건전성 검증이지 «맞는다» 도달 가능성의 증인이 아니다(2차 리뷰어 [15]·#40). 도달 가능성 방향의 격자점은 D_주점근접 구도가 진다',
        },
        refute: {
          baseline: 'pre-promotion(옛 카메라·오라클 ① 0) 위 섭동',
          f_x1_2_max_px: f12Max,
          principal_p30_max_px: ppMax,
          principal_identity: '⚠ 항등 — 주점은 사영식의 덧셈 항이라 어떤 3D에도 정확히 +30. 계기 검증은 f 행이 진다(2차 리뷰어 [14])',
          p3_shift0_1_alone_px: p3Alone,
        },
        margin_over_threshold: drawMax / C.TAP_MAX_PX,   // 판정 여유 배수 — TAP_MAX_PX가 미측정 상수라(DEFERRED) 원장이 스스로 여유를 말한다([22])
      })
      allDraw.push(...drawDevs)
      allOrbit.push(...orbitDevs)
    }

    const worstDraw = Math.max(...allDraw)
    ledger.totals = {
      draw_median_px: median(allDraw), draw_max_px: worstDraw,
      orbit_median_px: median(allOrbit), orbit_max_px: Math.max(...allOrbit),
      n_draw: allDraw.length, n_orbit: allOrbit.length,
    }
    // 판정 — 등록해 둔 판정선 그대로. 경계는 안 맞는 쪽.
    ledger.verdict = worstDraw <= C.TAP_MAX_PX ? '맞는다 — 굳혀도 잉크와 맞는다' : '안 맞는다 — 자립은 «카메라 확정 후»로 미룬다'

    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'promote_freeze_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] promote_freeze — draw max ${worstDraw.toFixed(3)}px (문 ${C.TAP_MAX_PX}px) · orbit max ${Math.max(...allOrbit).toFixed(3)}px → ${ledger.verdict}`)
  })
})
