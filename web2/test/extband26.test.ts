// web2-26 3번 — **연장선 물림이 잘 안 걸린다**의 게이트.
//
// 사람 관측(실기기 · DEVICE-CHECK C6): 「방향은 정확하다. 발동 조건이 까다로워 잡기 어렵다.」
// 지시의 원인 후보: 점 물림과 선 물림이 **같은 허용 반경**을 쓴다.
//
// D-2(재현): 아래 ①이 그 재현이다 — 연장선에서 수직으로 떨어진 격자에서 `ext`가 잡히는
//   비율을 **띠 배율 1.0(종전)과 지금**을 같은 실행에서 나란히 낸다.
// D-3(반증): 배율을 1.0으로 주면 ①이 실패한다 — 손잡이가 `OsnapSettings.lineRatio`다.
//   이력(③)도 유지 띠를 획득 띠와 같게 주면 실패하는 것을 같은 실행에서 본다.
// D-4(사람이 준 근거는 후보다): 지시는 `perp`도 선 후보로 넣으라고 했는데 **측정이 반대로
//   가리켰다** — ⑤가 그 반증이고, 이 파일이 그 사실의 정본이다(assumptions AS-C96).
// D-5(픽스처 커버리지): ④의 원칙 d를 **넓힌 띠 대역 전체**에서 잰다. 좁은 대역만 훑으면
//   「허용치를 넓혀도 원칙 d가 산다」가 «다른 이유로» 통과한다(#74 ㉠).

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, toward } from './session'
import { createApp, commitStroke } from '../src/app/state'
import { resolveStart, resolveEnd, resolveCommit } from '../src/core/draft'
import { osnap, defaultOsnap, type OsnapHit, type OsnapSettings } from '../src/core/osnap'
import { newExtDwell, updateExtDwell } from '../src/core/extacq'
import { project } from '../src/core/camera'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800, HY = 400

/** 승격 선분이 여럿인 장면 — `extacq_measure`의 `scene5`와 같은 구도(손 오차 포함 · #68) */
function scene() {
  const s = session(W, H)
  const V0 = { x: 900, y: HY }
  s.draw(100, HY, 1100, HY)
  s.draw(500, 520, 600, 496)
  s.draw(500, 520, 400, 496)
  s.draw(500, 520, 500, 320)
  const p1 = toward({ x: 500, y: 520 }, V0, 0.30)
  s.draw(500, 520, p1.x + 2, p1.y - 1)
  const p2 = toward({ x: 500, y: 320 }, V0, 0.30)
  s.draw(500, 320, p2.x - 1, p2.y + 2)
  return s
}

const setOf = (over: Partial<OsnapSettings> = {}): OsnapSettings =>
  ({ ...defaultOsnap(), radius: C.OSNAP_RADIUS_PX, ...over })

/** 화면에서 한 승격 선분을 골라 그 **연장 쪽** 축과 수직 방향을 낸다.
 *  반환: 획득용 끝점(화면) · 연장선 위 표본점 배열 · 그 선의 화면 단위 수직벡터. */
function extGeometry(s: ReturnType<typeof session>) {
  // 기둥(세로) — 연장이 화면 위쪽으로 뻗는다. id는 lifted 중 «가장 세로에 가까운» 것.
  let best: { id: number; a: { x: number; y: number }; b: { x: number; y: number } } | null = null
  for (const [id, seg] of s.app.lift.lifted) {
    const a = project(s.app.lift.an, s.app.pose, seg.a3)
    const b = project(s.app.lift.an, s.app.pose, seg.b3)
    if (!a || !b) continue
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
    if (dy < 40) continue
    if (!best || dy / (dx + 1e-9) > Math.abs(best.b.y - best.a.y) / (Math.abs(best.b.x - best.a.x) + 1e-9)) {
      best = { id, a, b }
    }
  }
  expect(best, '세로에 가까운 승격 선분').not.toBeNull()
  const { a, b } = best!
  // 연장 쪽 = b에서 a→b 방향으로 더 간다
  const ux = b.x - a.x, uy = b.y - a.y
  const L = Math.hypot(ux, uy)
  const dir = { x: ux / L, y: uy / L }
  const nrm = { x: -dir.y, y: dir.x }
  // 표본은 **그린 구간 밖**(연장 대역)에서 뽑는다 — 0.15L ~ 0.6L 만큼 더 간 자리
  const along = [0.15, 0.25, 0.35, 0.45, 0.55].map(t => ({ x: b.x + dir.x * L * t, y: b.y + dir.y * L * t }))
  return { id: best!.id, endPt: b, along, nrm }
}

/** 그 끝점에 머물러 연장선을 획득한다(앱과 같은 함수) */
function acquire(s: ReturnType<typeof session>, endPt: { x: number; y: number }) {
  const st = newExtDwell()
  updateExtDwell(st, s.app.lift, s.app.pose, endPt, C.OSNAP_RADIUS_PX / s.app.view.s, 0)
  updateExtDwell(st, s.app.lift, s.app.pose, endPt, C.OSNAP_RADIUS_PX / s.app.view.s, C.EXT_ACQUIRE_MS + 1)
  expect(st.acquired.length, '연장선이 획득됐다').toBeGreaterThan(0)
  return st.acquired
}

/** 수직으로 d px 떨어진 격자에서 `ext`가 이기는 비율 */
function acqRate(s: ReturnType<typeof session>, set: OsnapSettings, offsets: number[]) {
  const g = extGeometry(s)
  const acq = acquire(s, g.endPt)
  let hit = 0, total = 0
  const perOffset: { d: number; hit: number; n: number }[] = []
  for (const d of offsets) {
    let h = 0, n = 0
    for (const base of g.along) {
      for (const sgn of [1, -1]) {
        const cur = { x: base.x + g.nrm.x * d * sgn, y: base.y + g.nrm.y * d * sgn }
        const oh = osnap(s.app.lift, s.app.pose, cur, set, undefined, undefined, acq)
        n++; total++
        if (oh?.kind === 'ext') { h++; hit++ }
      }
    }
    perOffset.push({ d, hit: h, n })
  }
  return { rate: hit / total, hit, total, perOffset, geom: g, acq }
}

const OFFSETS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

describe('26-3 ① 획득률 — 선의 자를 넓히면 연장선이 실제로 더 잡힌다', () => {
  it('띠 1.0(종전) ↔ 지금(2.5) — 같은 실행에서 나란히', () => {
    const s = scene()
    const before = acqRate(s, setOf({ lineRatio: 1, lineHoldRatio: 1 }), OFFSETS)
    const after = acqRate(s, setOf(), OFFSETS)
    console.log(`[26-3 ①] 획득률 ${before.hit}/${before.total} → ${after.hit}/${after.total}`)
    for (let i = 0; i < OFFSETS.length; i++) {
      console.log(`   ${String(OFFSETS[i]).padStart(2)}px: ${before.perOffset[i]!.hit}/${before.perOffset[i]!.n} → ${after.perOffset[i]!.hit}/${after.perOffset[i]!.n}`)
    }
    // **상승**이 게이트다(비율 그대로 — 절대값은 픽스처의 성질이다)
    expect(after.hit).toBeGreaterThan(before.hit)
    // 분해능(#71 ㉢) — 종전이 0도 1도 아니어야 「올랐다」가 뜻이 있다
    expect(before.hit).toBeGreaterThan(0)
    expect(before.hit).toBeLessThan(before.total)

    // ⚠ 반증(D-3)이 곧 위의 `before` 줄이다 — 배율을 1로 주면 같은 격자에서 획득이
    //   실제로 줄어든다. 손잡이가 없으면 이 팔은 「올랐다」를 못 재고 아무것도 안 잰다.
    const ledger = resolve(HERE, '../../stage0/out/extband26_web2.json')
    mkdirSync(dirname(ledger), { recursive: true })
    writeFileSync(ledger, JSON.stringify({
      what: 'web2-26 3번 — 선 후보(ext)의 띠를 점 후보와 가른 뒤의 획득률·오획득·이력·원칙 d. 판정은 extband26.test.ts의 expect가 정본.',
      conditions: {
        scene: '승격 선분 다섯(손 오차 2px 포함 — #68) · 1200x800 · 지평선 y=400',
        metric: '연장 대역(그린 구간 밖 0.15~0.55L)의 표본 다섯 × 좌우 × 수직 오프셋 0~20px에서 ext가 이기는 비율',
        command: 'npx vitest run test/extband26.test.ts',
      },
      constants: {
        OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX,
        OSNAP_LINE_RATIO: C.OSNAP_LINE_RATIO,
        OSNAP_LINE_HOLD_RATIO: C.OSNAP_LINE_HOLD_RATIO,
        EXT_ACQUIRE_MS: C.EXT_ACQUIRE_MS,
        EXT_MAX_RATIO: C.EXT_MAX_RATIO,
      },
      acquisition: {
        before_ratio_1: { hit: before.hit, total: before.total, rate: before.rate, per_offset: before.perOffset },
        after: { hit: after.hit, total: after.total, rate: after.rate, per_offset: after.perOffset },
      },
    }, null, 2))
  })
})

describe('26-3 ② 오획득 — 점 물림은 안 흔들린다', () => {
  it('점 후보(vertex/end/mid/int/xint)가 이기는 자리와 자리 수가 배율에 안 변한다', () => {
    const s = scene()
    const acq = acquire(s, extGeometry(s).endPt)
    const POINT = new Set(['vertex', 'end', 'mid', 'int', 'xint', 'vp'])
    const grid: { x: number; y: number }[] = []
    for (let x = 300; x <= 900; x += 11) for (let y = 260; y <= 620; y += 11) grid.push({ x, y })
    const kindsOf = (set: OsnapSettings) => grid.map(p =>
      osnap(s.app.lift, s.app.pose, p, set, undefined, undefined, acq)?.kind ?? null)
    const a = kindsOf(setOf({ lineRatio: 1, lineHoldRatio: 1 }))
    const b = kindsOf(setOf())
    const pa = a.filter(k => k && POINT.has(k)).length
    const pb = b.filter(k => k && POINT.has(k)).length
    // 점 후보가 이기던 칸이 **하나도** 안 뺏겼다 — 수가 같은 것으로는 모자란다(자리별로 본다)
    const stolen = a.map((k, i) => (k && POINT.has(k) && a[i] !== b[i]) ? i : -1).filter(i => i >= 0)
    console.log(`[26-3 ②] 점 물림 칸 ${pa} → ${pb} · 뺏긴 칸 ${stolen.length} / 격자 ${grid.length}`)
    expect(stolen.length).toBe(0)
    expect(pb).toBe(pa)
    // 분해능(#69 ㉣ — 격자가 실패 불가면 아무것도 안 잰다): 점 물림이 실제로 나는 격자다
    expect(pa).toBeGreaterThan(20)
    // 그리고 **무엇이 갈렸는가**는 선 후보뿐이다
    const changed = a.map((k, i) => a[i] !== b[i] ? b[i] : null).filter(Boolean)
    expect(changed.length).toBeGreaterThan(0)
    for (const k of changed) expect(k).toBe('ext')
  })
})

describe('26-3 ③ 이력 — 획득 띠보다 넓은 유지 띠', () => {
  it('한 번 물면 유지 띠를 벗어날 때까지 유지된다 (+반증: 유지 띠를 획득 띠와 같게 두면 깜빡인다)', () => {
    const s = scene()
    const g = extGeometry(s)
    const acq = acquire(s, g.endPt)
    const base = g.along[2]!
    const at = (d: number) => ({ x: base.x + g.nrm.x * d, y: base.y + g.nrm.y * d })
    const acqR = C.OSNAP_RADIUS_PX * C.OSNAP_LINE_RATIO
    const holdR = C.OSNAP_RADIUS_PX * C.OSNAP_LINE_HOLD_RATIO
    expect(holdR, '유지 띠는 획득 띠보다 넓다').toBeGreaterThan(acqR)

    // 물고 나서 획득 띠 **밖**·유지 띠 **안**으로 나간다 — 유지된다
    const mid = (acqR + holdR) / 2
    const first = osnap(s.app.lift, s.app.pose, at(1), setOf(), undefined, undefined, acq)
    expect(first?.kind).toBe('ext')
    const held = osnap(s.app.lift, s.app.pose, at(mid), setOf(), undefined, undefined, acq, first)
    expect(held?.kind, `유지 띠 안(${mid.toFixed(1)}px)에서 유지`).toBe('ext')
    // 이력이 없으면 같은 자리에서 놓친다 — 그것이 「깜빡임」이다
    const nohist = osnap(s.app.lift, s.app.pose, at(mid), setOf(), undefined, undefined, acq)
    expect(nohist?.kind, '이력 없이는 같은 자리에서 놓친다').not.toBe('ext')
    // 유지 띠 **밖**에서는 놓는다 — 무한히 붙들지 않는다
    const gone = osnap(s.app.lift, s.app.pose, at(holdR + 6), setOf(), undefined, undefined, acq, held)
    expect(gone?.kind).not.toBe('ext')
    // ⚠ **다른 선의 이력은 안 통한다** — `srcId`가 판정자다
    const wrongSrc: OsnapHit = { ...first!, srcId: (first!.srcId ?? 0) + 1000 }
    expect(osnap(s.app.lift, s.app.pose, at(mid), setOf(), undefined, undefined, acq, wrongSrc)?.kind).not.toBe('ext')
    console.log(`[26-3 ③] 획득 띠 ${acqR}px · 유지 띠 ${holdR}px · 중간 ${mid.toFixed(1)}px에서 유지 O / 이력없음 X`)
  })
})

describe('26-3 ④ 원칙 d — 미리보기 좌표 == 커밋 좌표 (넓힌 띠 대역 전수)', () => {
  it('연장 대역의 모든 오프셋에서 미리보기 end가 그대로 확정된다', () => {
    // 앱 경로 그대로: resolveStart → resolveEnd(미리보기) → resolveCommit → commitStroke.
    // **넓힌 띠 안팎을 다 훑는다**(D-5) — 좁은 대역만 보면 «다른 이유로» 통과한다.
    const s = scene()
    const g = extGeometry(s)
    const acq = acquire(s, g.endPt)
    const set = () => ({ ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s })
    let n = 0, extEnds = 0
    for (const d of [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]) {
      for (const sgn of [1, -1]) {
        for (const base of g.along) {
          const cur = { x: base.x + g.nrm.x * d * sgn, y: base.y + g.nrm.y * d * sgn }
          // 매 표본을 **새 문서**에서 — 앞 표본이 만든 획이 다음 판정을 바꾸면 안 된다
          const s2 = scene()
          const acq2 = acquire(s2, extGeometry(s2).endPt)
          const start = { x: g.endPt.x, y: g.endPt.y }
          const oh = resolveStart(s2.app.lift, s2.app.pose, start, set(), acq2)
          const a = oh ? oh.p : start
          const r = resolveEnd(s2.app.lift, s2.app.pose, s2.app.lift.an, a, { p3: oh?.p3 ?? null },
            cur, set(), { mmPerUnit: s2.app.lift.mmPerUnit, snapStep: null }, acq2)
          const c = resolveCommit(s2.app.lift.an, a, r.end, set().radius)
          if (!c) continue
          const st = commitStroke(s2.app, c.a, c.b, [start, cur])
          expect(st, '확정됐다').not.toBeNull()
          // **미리보기 end가 그대로 커밋 좌표다** — resolveCommit이 손대는 자리는
          // 지평선 탭뿐이고 그것은 위에서 걸러진다(c === null).
          expect(st!.b.x, `d=${d * sgn} b.x`).toBeCloseTo(r.end.x, 9)
          expect(st!.b.y, `d=${d * sgn} b.y`).toBeCloseTo(r.end.y, 9)
          n++
          if (r.endSnap?.kind === 'ext') extEnds++
        }
      }
    }
    console.log(`[26-3 ④] 원칙 d 표본 ${n} · 그중 ext가 정한 끝 ${extEnds}`)
    expect(n).toBeGreaterThan(50)
    // 분해능(#74 ㉠ — 「다른 이유로 통과」를 막는다): **넓힌 띠가 실제로 발화한 표본**이
    // 있어야 이 팔이 원칙 d를 «넓힌 대역에서» 잰 것이다. 0이면 옛 대역만 훑은 것이다.
    expect(extEnds, '넓힌 띠가 실제로 확정 좌표를 정한 표본이 있다').toBeGreaterThan(0)
  })
})

describe('26-3 ⑤ D-4 — `perp`는 선 후보가 아니다(지시와 갈린 자리)', () => {
  it('perp까지 띠를 넓히면 축이 걸린 세로획의 끝이 조용히 밀린다 — 그래서 안 넓혔다', () => {
    // 지시: 「선 후보(`ext` `perp`)는 수직거리 기준의 넓은 띠」.
    // 측정: `perp`의 후보점은 **선분 안으로 클램프된 발**이라 점 후보처럼 2차원으로
    //   국소화돼 있다 — 띠를 넓히면 축 스냅을 이겨 확정 좌표를 민다.
    const run = (perpLine: boolean) => {
      const app = createApp(W, H)
      const set = () => ({ ...app.osnap, radius: app.osnap.radius / app.view.s, perpLine })
      const draw = (ax: number, ay: number, bx: number, by: number) => {
        const p = { x: ax, y: ay }
        const oh = resolveStart(app.lift, app.pose, p, set())
        const a = oh ? oh.p : p
        const r = resolveEnd(app.lift, app.pose, app.lift.an, a, { p3: oh?.p3 ?? null }, { x: bx, y: by }, set(),
          { mmPerUnit: app.lift.mmPerUnit, snapStep: null })
        const c = resolveCommit(app.lift.an, a, r.end, set().radius)
        if (!c) return null
        commitStroke(app, c.a, c.b, [p, { x: bx, y: by }])
        return { end: r.end, axis: r.axis, kind: r.endSnap?.kind ?? null }
      }
      draw(100, 400, 1100, 400)
      draw(500, 500, 600, 475)
      draw(500, 500, 400, 475)
      draw(500, 500, 660, 460)
      draw(580, 480, 580, 380)
      draw(580, 420, 640, 416.25)
      return draw(640, 416.25, 640, 450)!      // 깨끗한 세로획 — 사람은 V축을 뜻한다
    }
    const narrow = run(false)
    const wide = run(true)
    console.log(`[26-3 ⑤] perp 좁게: axis=${narrow.axis} end=(${narrow.end.x.toFixed(2)},${narrow.end.y.toFixed(2)}) · 넓게: kind=${wide.kind} end=(${wide.end.x.toFixed(2)},${wide.end.y.toFixed(2)})`)
    // 좁게(지금) — 사람이 그은 대로 축이 산다
    expect(narrow.axis).toBe('V')
    expect(narrow.end.y).toBeCloseTo(450, 6)
    // 넓게(지시대로) — 축을 잃고 끝이 밀린다. **그 밀림이 이 결정의 근거다.**
    expect(wide.kind).toBe('perp')
    expect(wide.axis).toBeNull()
    expect(Math.abs(wide.end.y - narrow.end.y), 'perp를 넓히면 확정 좌표가 밀린다').toBeGreaterThan(10)
  })
})
