// **겉보기 교차 원장**(web2-15 1번) — 「소실점 선을 다른 선으로 정의하기」가 손 오차
// 대역에서 서는가. 재현(D-2)·표식(D-1)·픽스처 폭(D-5)을 **한 스윕**으로 낸다.
//
// 재는 것: 겨냥점 둘레의 손 오차 격자 × 획 길이 × 구도에서
//   ㉠ 수리 전 판정(조준선 없는 osnap이 이기고 축 스냅이 그 뒤 — web2-14 문면)
//   ㉡ 수리 후 판정(조준선 → 겉보기 교차 — 지금 코드)
// 각각 **정의가 서는 칸 수**와 **무산 사유**를 센다. 두 수의 차가 이 회차의 값이다.
//
// ⚠ **D-5** — web2-14의 팔은 손 오차 한 값(3px)·획 길이 한 값(138px)·구도 하나였다.
// 그 픽스처가 실사용 대역을 안 덮은 것이 #68이고 이 원장이 그 폭을 잰다: 오차는
// 오스냅 반경(8px)까지, 길이는 40~200px(짧은 획일수록 같은 밀림이 큰 각이다), 구도는
// 겨냥 각도가 다른 셋.
//
// 반증(D-3 — 이 하네스가 무엇에 실패하는가): 오차를 **반경 밖**(12·16px)까지 늘린 행을
// 같이 낸다. 거기서도 전부 통과하면 이 하네스는 문을 안 재는 것이다 — 통과율이
// 떨어지는 것이 계기가 살아 있다는 증거다.
//
// 원장: stage0/out/xint_web2.json (§5 — 문서에 수를 옮겨 적지 않는다)
//   npx vitest run test/xint_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { commitStroke } from '../src/app/state'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { osnap } from '../src/core/osnap'
import { vpMarks } from '../src/core/camera'
import { snapDir } from '../src/core/snap'
import { axisOfStroke } from '../src/core/lift'
import { own3Deviation, OWN3_TOL_PX } from '../src/core/own3d'
import { C } from '../src/core/constants'
import type { Analysis } from '../src/core/camera'
import { dist2, type Pt } from '../src/core/vec'

/** 구도 셋 — 겨냥 각도(A와 B가 이루는 화면 각)와 소실점 거리가 다르다.
 *  ⚠ 겨냥점을 **손으로 계산해 적지 않는다** — 축 스냅이 잉크를 옮기므로 손 산술은
 *  어긋난다(첫 실행에서 구도 C가 통째로 죽었고 원인이 그것이었다). 아래 `build`가
 *  **확정된 잉크에서** 조준선∩B를 풀어 겨냥점을 만든다(D-5: 픽스처가 스스로 맞춘다). */
const COMPS = [
  {
    name: 'A_가까운VP',
    setup: [[100, 400, 1100, 400], [500, 500, 600, 475], [500, 500, 400, 475]] as const,
    B: [690, 290, 840, 365] as const,          // vp0 방향 대기선
    ground: [500, 500, 720, 445] as const,     // 지면 깊이선 — 그 끝이 조준선의 x
  },
  {
    name: 'B_얕은각',
    setup: [[100, 400, 1100, 400], [500, 500, 600, 475], [500, 500, 400, 475]] as const,
    // 지평선에서 **먼** 대기선 — 같은 vp0인데 화면 기울기가 가팔라(1.17) 세로 조준과
    // 39°로 만난다(구도 A는 63°). 얕을수록 같은 손 오차가 조준선을 따라 멀리 옮겨간다.
    B: [660, 120, 800, 283] as const,
    ground: [500, 500, 760, 435] as const,
  },
  {
    name: 'C_먼VP',
    setup: [[100, 400, 1100, 400], [500, 500, 700, 470], [500, 500, 300, 470]] as const,
    B: [700, 300, 900, 343] as const,
    ground: [500, 500, 760, 461] as const,
  },
]

const OFFSETS: [number, number][] = []
for (const dx of [0, 2, 4, 6, 8]) for (const dy of [0, 3, -3, 6, -6]) OFFSETS.push([dx, dy])
/** 반경 밖 — 계기가 살아 있는지(반증). 여기서도 다 통과하면 문을 안 재는 것이다. */
const OUTSIDE: [number, number][] = [[12, 0], [0, 12], [12, 12], [16, 0], [0, -16]]
const LENGTHS = [40, 70, 110, 140]

const setOf = (s: ReturnType<typeof session>) =>
  ({ ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s })

/** 구도를 세운다 — B(대기선) · 조준선(세로) · 겨냥점(조준선 ∩ B의 **확정 잉크**) ·
 *  조준선 위에서 겨냥점 L px 뒤에 있는 **3D 시작점**. 하나라도 못 서면 null(칸을 건너뛴다). */
function build(comp: typeof COMPS[number], L: number) {
  const s = session(1200, 800)
  for (const [a, b, c, d] of comp.setup) s.draw(a, b, c, d)
  const B = s.draw(comp.B[0], comp.B[1], comp.B[2], comp.B[3])
  if (!B || !s.app.lift.waiting.includes(B.id)) return null
  const g = s.draw(comp.ground[0], comp.ground[1], comp.ground[2], comp.ground[3])
  if (!g || !s.app.lift.lifted.has(g.id)) return null
  const aimX = g.b.x                                   // 조준선: x = aimX (세로)
  const bs = s.app.doc.strokes.find(x => x.id === B.id)!
  const t = (aimX - bs.a.x) / (bs.b.x - bs.a.x)        // 조준선 ∩ B의 확정 잉크
  if (!(t > 0.05 && t < 0.95)) return null             // 끝점·중점 오스냅이 대신 잡는 자리 배제
  const target: Pt = { x: aimX, y: bs.a.y + t * (bs.b.y - bs.a.y) }
  const midT = Math.abs(t - 0.5)
  if (midT < 0.08) return null                         // 중점 스냅이 이기는 자리 배제
  // ⚠ **퇴화 픽스처 배제**: B의 끝이 자기 소실점에 닿아 있으면 그 끝의 시선이 축 방향과
  // 평행해져 `closestOnLineToRay`가 null을 낸다(정의가 lift로 무산된다). 첫 판의 구도 B가
  // 끝을 vp0(900,400)에 정확히 두어 50칸이 통째로 죽었다 — 코드가 아니라 픽스처였다.
  for (const m of vpMarks(s.app.lift.an, s.app.pose)) {
    if (dist2(m.vp, bs.b) < 30 || dist2(m.vp, bs.a) < 30) return null
  }
  const startY = target.y + L
  if (startY > g.b.y - 5) return null                  // 지면 끝보다 아래면 씨앗을 못 만든다
  const v = s.draw(aimX, g.b.y, aimX, startY)          // 씨앗 세로선 — 시작점을 3D로
  if (!v || !s.app.lift.lifted.has(v.id)) return null
  if (!s.app.lift.waiting.includes(B.id)) return null  // 씨앗이 B를 먼저 정의했으면 이 칸은 못 잰다
  return { s, B, start: v.b, target }
}

/** ㉡ 수리 후 = 앱 경로 그대로 */
function afterFix(s: ReturnType<typeof session>, start: Pt, cur: Pt) {
  const set = setOf(s)
  const oh = resolveStart(s.app.lift, s.app.pose, start, set)
  const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
    oh ? oh.p : start, { p3: oh?.p3 ?? null }, cur, set, { mmPerUnit: null, snapStep: null })
  return { end: r.end, kind: r.endSnap?.kind ?? null }
}

/** ㉠ 수리 전 = 조준선 없는 osnap이 이기고 축 스냅이 그 뒤(web2-14 문면 복제).
 *  이 픽스처들의 A는 소실점에서 뻗지도 축을 만들지도 않으므로 ①·④만 복제하면 같다. */
function beforeFix(s: ReturnType<typeof session>, start: Pt, cur: Pt) {
  const oh = osnap(s.app.lift, s.app.pose, cur, setOf(s), { p3: null })
  return { end: oh ? oh.p : snapDir(s.app.lift.an, s.app.pose, start, cur).end, kind: oh?.kind ?? null }
}

interface Cell { comp: string; L: number; dx: number; dy: number; kind: string | null; axis: string | null; defined: boolean }

function sweep(mode: 'before' | 'after', offs: [number, number][]) {
  const cells: Cell[] = []
  const kinds: Record<string, number> = {}
  const missed = { ok: 0, pose: 0, axis: 0, lift: 0, roundtrip: 0, no_axis_on_A: 0 }
  for (const comp of COMPS) for (const L of LENGTHS) for (const [dx, dy] of offs) {
    const built = build(comp, L)
    if (!built) continue
    const { s, B, start, target } = built
    const cur = { x: target.x + dx, y: target.y + dy }
    const r = mode === 'after' ? afterFix(s, start, cur) : beforeFix(s, start, cur)
    const A = commitStroke(s.app, start, r.end, [start, cur])
    const axis = axisOfStroke(s.app.lift.an, s.app.pose, A.a, A.b)
    const b = s.app.doc.strokes.find(x => x.id === B.id)!
    const defined = !!b.own3
    if (defined) {
      // 정의된 3D는 반드시 잉크 심판을 통과한다 — 통과 못 하면 «조용히 틀린 배치»다
      expect(own3Deviation(s.app.lift.an as Analysis, b)!).toBeLessThanOrEqual(OWN3_TOL_PX)
    }
    kinds[r.kind ?? '(없음)'] = (kinds[r.kind ?? '(없음)'] ?? 0) + 1
    for (const k of ['ok', 'pose', 'axis', 'lift', 'roundtrip'] as const) missed[k] += s.app.touchStats[k]
    if (!axis) missed.no_axis_on_A++
    cells.push({ comp: comp.name, L, dx, dy, kind: r.kind, axis, defined })
  }
  const ok = cells.filter(c => c.defined).length
  return { n: cells.length, defined: ok, rate_num: ok, rate_den: cells.length, kinds, missed, cells }
}

describe('겉보기 교차 — 손 오차 대역의 정의 성립률', () => {
  it('스윕: 수리 전 대 수리 후 · 반경 안 대 밖', () => {
    const inside = { before: sweep('before', OFFSETS), after: sweep('after', OFFSETS) }
    const outside = { before: sweep('before', OUTSIDE), after: sweep('after', OUTSIDE) }

    const ledger = {
      what: '축스냅된 획 A를 대기선 B의 몸통에 대어 B를 정의한다 — 손 오차 격자 × 획 길이 × 구도',
      generated_by: 'web2/test/xint_measure.test.ts',
      constants: {
        OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX, LINE_MATCH_PX: C.LINE_MATCH_PX,
        TAP_MAX_PX: C.TAP_MAX_PX, SCREEN_PARALLEL_RATIO: C.SCREEN_PARALLEL_RATIO,
        VP_DIR_RATIO: C.VP_DIR_RATIO, OWN3_TOL_PX,
      },
      grid: { offsets_inside: OFFSETS.length, offsets_outside: OUTSIDE.length, lengths: LENGTHS, comps: COMPS.map(c => c.name) },
      inside: {
        what: '커서 오차가 오스냅 반경(8px) 안 — 사람이 «겨냥했다»고 볼 대역',
        before: { defined: inside.before.defined, n: inside.before.n, kinds: inside.before.kinds, missed: inside.before.missed },
        after: { defined: inside.after.defined, n: inside.after.n, kinds: inside.after.kinds, missed: inside.after.missed },
        gained: inside.after.defined - inside.before.defined,
      },
      outside: {
        what: '반증(D-3) — 반경 밖. 여기서도 다 서면 이 하네스는 문을 안 재는 것이다',
        before: { defined: outside.before.defined, n: outside.before.n },
        after: { defined: outside.after.defined, n: outside.after.n, kinds: outside.after.kinds },
      },
      // selfcheck가 이 원장에 다는 플래그 둘의 해명 — **원장 안에 적는다**(플래그를 보는
      // 자리가 여기다. 「의심≠오류」이므로 원인을 확인해 남긴다 — CLAUDE.md §5.1)
      flags_explained: {
        'inside.after.kinds 단일 범주(xint 275)':
          '그것이 결과다 — 수리 후에는 몸통의 답이 하나뿐이다. **변별력은 이 필드가 아니라 '
          + 'inside.before.kinds(ext/near/없음 셋으로 갈린다)와 outside(문이 거부한다)가 진다.** '
          + '이 필드만 보면 아무것도 안 갈리는 것이 맞다',
        'inside.after.missed.no_axis_on_A == 0':
          '0이 이 회차의 값이다 — 수리 전 같은 필드가 37이고 그것이 증상의 기전이었다. '
          + '집계 로직이 도는 증거는 before 행의 37이다(같은 코드가 센다)',
        'constants/metric_defs 스냅샷 없음':
          'web2 라인의 원장은 상수 스냅샷 등록부 밖이다(공통 형태 — web2-13/14 원장과 같다). '
          + '대신 위 constants 블록에 이 측정이 의존하는 값을 그대로 싣는다',
      },
      // 수리 전에 죽은 칸의 목록 — 「어떤 손이 실패했나」가 이 회차의 증상이다
      dead_before: inside.before.cells.filter(c => !c.defined)
        .map(c => ({ comp: c.comp, L: c.L, dx: c.dx, dy: c.dy, axis_on_A: c.axis })),
      dead_after: inside.after.cells.filter(c => !c.defined)
        .map(c => ({ comp: c.comp, L: c.L, dx: c.dx, dy: c.dy, axis_on_A: c.axis })),
      headless_vs_device: {
        headless: '후보 선정·확정 좌표·축 유지·정의 성립·잉크 심판 — 아래 수 전부',
        device: '기호가 손에 읽히는가 · 반경 8px이 실제 손에 맞는가 — DEFERRED 「web2-15 실기기 확인 표」',
      },
    }

    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'xint_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] xint — 반경 안 정의 ${inside.before.defined}/${inside.before.n} → ${inside.after.defined}/${inside.after.n}` +
      ` · 반경 밖 ${outside.after.defined}/${outside.after.n}`)

    // 판정선(측정 **전에** 등록 — #26):
    //  · 수리 후 반경 안은 **전 칸**이 서야 한다(하나라도 죽으면 손이 여는 문이 아니다)
    //  · 수리 전은 죽는 칸이 있어야 한다(없으면 이 하네스가 증상을 안 재는 것이다 — D-5)
    expect(inside.after.defined, '수리 후 — 반경 안 전 칸').toBe(inside.after.n)
    expect(inside.before.defined, '수리 전 — 죽는 칸이 있다(하네스가 증상을 잰다)').toBeLessThan(inside.before.n)
  })
})
