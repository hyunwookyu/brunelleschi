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
/** **문의 경계**(2차 리뷰 [11]) — 조준선 «따라» 6~11px. 첫 판은 안 6까지·밖 12부터라
 *  문값 8이 표본에 아예 없었다(「밖 33칸 거부」는 문값의 1.5~2배에서만 나온 진술이었다).
 *  여기서 8을 가운데 두고 갈리는지 본다 — 안 갈리면 그 척도는 8이 아니다. */
const BOUNDARY: [number, number][] = [[0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11]]
const LENGTHS = [40, 70, 110, 140]

const setOf = (s: ReturnType<typeof session>) =>
  ({ ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s })

/** 구도를 세운다 — B(대기선) · 조준선(세로) · 겨냥점(조준선 ∩ B의 **확정 잉크**) ·
 *  조준선 위에서 겨냥점 L px 뒤에 있는 **3D 시작점**. 하나라도 못 서면 null(칸을 건너뛴다). */
/** 건너뛴 칸의 사유 — **분모를 원장에서 재구성할 수 있어야 한다**(#11 · 리뷰 [5]).
 *  25×4×3 = 300이 아니라 275인 이유가 여기 남는다. */
export interface SkipRec { comp: string; L: number; why: string }
function build(comp: typeof COMPS[number], L: number, skips?: SkipRec[]) {
  const skip = (why: string) => { skips?.push({ comp: comp.name, L, why }); return null }
  const s = session(1200, 800)
  for (const [a, b, c, d] of comp.setup) s.draw(a, b, c, d)
  const B = s.draw(comp.B[0], comp.B[1], comp.B[2], comp.B[3])
  if (!B || !s.app.lift.waiting.includes(B.id)) return skip('B가 대기 획이 안 됐다')
  const g = s.draw(comp.ground[0], comp.ground[1], comp.ground[2], comp.ground[3])
  if (!g || !s.app.lift.lifted.has(g.id)) return skip('지면 깊이선이 3D가 안 됐다')
  const aimX = g.b.x                                   // 조준선: x = aimX (세로)
  const bs = s.app.doc.strokes.find(x => x.id === B.id)!
  const t = (aimX - bs.a.x) / (bs.b.x - bs.a.x)        // 조준선 ∩ B의 확정 잉크
  if (!(t > 0.05 && t < 0.95)) return skip('조준선∩B가 B의 구간 끝 대역(t≤0.05·≥0.95)')             // 끝점·중점 오스냅이 대신 잡는 자리 배제
  const target: Pt = { x: aimX, y: bs.a.y + t * (bs.b.y - bs.a.y) }
  const midT = Math.abs(t - 0.5)
  if (midT < 0.08) return skip('조준선∩B가 B의 중점 대역(|t−0.5|<0.08)')                         // 중점 스냅이 이기는 자리 배제
  // ⚠ **퇴화 픽스처 배제**: B의 끝이 자기 소실점에 닿아 있으면 그 끝의 시선이 축 방향과
  // 평행해져 `closestOnLineToRay`가 null을 낸다(정의가 lift로 무산된다). 첫 판의 구도 B가
  // 끝을 vp0(900,400)에 정확히 두어 50칸이 통째로 죽었다 — 코드가 아니라 픽스처였다.
  for (const m of vpMarks(s.app.lift.an, s.app.pose)) {
    if (dist2(m.vp, bs.b) < 30 || dist2(m.vp, bs.a) < 30) return skip('B의 끝이 소실점 30px 안(퇴화 — 시선∥축)')
  }
  const startY = target.y + L
  if (startY > g.b.y - 5) return skip('획 길이 L을 조준선 위에 못 앉힌다(지면 끝보다 아래)')                  // 지면 끝보다 아래면 씨앗을 못 만든다
  const v = s.draw(aimX, g.b.y, aimX, startY)          // 씨앗 세로선 — 시작점을 3D로
  if (!v || !s.app.lift.lifted.has(v.id)) return skip('씨앗 세로선이 3D가 안 됐다')
  if (!s.app.lift.waiting.includes(B.id)) return skip('씨앗이 B를 먼저 정의했다')  // 씨앗이 B를 먼저 정의했으면 이 칸은 못 잰다
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
  const byPair: Record<string, Record<string, number>> = {}
  const skips: SkipRec[] = []
  const missed = { ok: 0, pose: 0, axis: 0, lift: 0, roundtrip: 0, no_axis_on_A: 0 }
  for (const comp of COMPS) for (const L of LENGTHS) for (const [dx, dy] of offs) {
    const built = build(comp, L, skips)
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
    const kn = r.kind ?? '(없음)'
    kinds[kn] = (kinds[kn] ?? 0) + 1
    // (구도,길이)별 분포 — 「종류가 오차 오프셋만의 함수인가」를 원장이 스스로 답한다(리뷰 [9])
    const key = `${comp.name}|L${L}`
    byPair[key] = byPair[key] ?? {}
    byPair[key]![kn] = (byPair[key]![kn] ?? 0) + 1
    for (const k of ['ok', 'pose', 'axis', 'lift', 'roundtrip'] as const) missed[k] += s.app.touchStats[k]
    if (!axis) missed.no_axis_on_A++
    cells.push({ comp: comp.name, L, dx, dy, kind: r.kind, axis, defined })
  }
  const ok = cells.filter(c => c.defined).length
  // 건너뛴 (구도,길이) 쌍 — 오프셋마다 같은 사유가 반복되므로 쌍 단위로 접는다
  const skipPairs = [...new Map(skips.map(k => [`${k.comp}|L${k.L}`, k])).values()]
  return {
    n: cells.length, defined: ok, rate_num: ok, rate_den: cells.length, kinds, by_pair: byPair,
    missed, cells,
    denominator: {
      grid_full: COMPS.length * LENGTHS.length * offs.length,
      pairs_full: COMPS.length * LENGTHS.length,
      pairs_used: Object.keys(byPair).length,
      skipped_pairs: skipPairs.map(k => ({ comp: k.comp, L: k.L, why: k.why })),
      note: '전 격자 = 구도 × 길이 × 오프셋. 쓴 칸 n = (쓴 쌍 수) × 오프셋 수 — 「25×4×3」 산술이 아니다',
    },
  }
}

/** ── 리뷰 [6] 답 — **끝점·중점 대역**은 위 격자가 «구성상» 비운 자리다 ──────────
 *  위 build()는 조준선∩B가 B의 끝·중점 오스냅 반경 안에 드는 (구도,길이) 쌍을 뺀다
 *  (그 자리에서는 점 오스냅이 이기므로 «몸통의 답»을 못 잰다). 그런데 사람은 그 자리도
 *  겨눈다 — 그리고 거기서는 **기전 ①이 그대로 살아 있다**(끝점·중점은 여전히 커서를
 *  선 위로 «수직으로» 끌어 축을 깰 수 있다. xint보다 우선순위가 앞이다).
 *  「275/275」를 한정 없이 인용하지 않으려고 **그 대역을 따로 잰다.**
 *
 *  구성: 지면 깊이선으로 조준선 x를 얻고, **그 다음에** B를 그려 조준선∩B가 B의 시작
 *  끝에서 off px 떨어지게 둔다(off ∈ 0·4·8 = 끝점 오스냅 반경 안).
 *  반증: off를 20px로 두면(반경 밖) 몸통이 되어 xint가 이기고 전 칸이 서야 한다. */
function edgeBandSweep() {
  // 2차 리뷰 [3][7][8] 대응 — 첫 판의 셋을 고쳤다:
  //  [3] **획 길이를 흔든다.** L≈140 하나에서는 end 오스냅의 밀어냄(≤off=4px)이
  //      4/140 = 2.9% 로 축 허용각(V축 SCREEN_PARALLEL_RATIO 0.05) **아래**라 축 손실이
  //      산술적으로 불가능했다 — 「axis_lost 0」이 실행 결과가 아니라 상수의 귀결이었다.
  //      L40에서는 4/40 = 10% 로 넘으므로 **넘길 수 있는 축을 흔든다**(반증 조건, D-3).
  //  [7] **세 대역을 다 본다.** 첫 판은 B의 «시작 끝»만 훑고 중점·반대쪽 끝을 안 봤는데
  //      인용은 「끝점·중점 대역을 잰다」로 읽혔다.
  //  [8] **격자를 원장에 적는다.** 결론을 정하는 조건(길이)이 산문에만 있으면 감사 불가다.
  const LS = [40, 70, 110]
  const BANDS = ['시작끝', '중점', '반대끝'] as const
  const OFFS = [0, 4, 8, 20]
  const HAND: [number, number][] = [[0, 0], [4, 0], [8, 0], [0, 4], [0, -4], [4, 4], [8, 4], [4, -4], [8, -4]]
  const rows: { band: string; off: number; L: number; dx: number; dy: number; kind: string | null; axis: string | null; defined: boolean }[] = []
  const skips: { band: string; off: number; L: number; why: string }[] = []
  for (const band of BANDS) for (const off of OFFS) for (const L of LS) for (const [dx, dy] of HAND) {
    const skip = (why: string) => { skips.push({ band, off, L, why }); }
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    const g = s.draw(500, 500, 720, 445)
    if (!g || !s.app.lift.lifted.has(g.id)) { skip('지면 깊이선이 3D가 안 됐다'); continue }
    const aimX = g.b.x
    // B는 vp0 방향(x +150 → y +75). 겨냥 자리(조준선 x=aimX)가 각 대역에서 off px 떨어지게 둔다.
    const bx = band === '시작끝' ? aimX - off : band === '중점' ? aimX + off - 75 : aimX - 150 + off
    const B = s.draw(bx, 240, bx + 150, 315)
    if (!B || !s.app.lift.waiting.includes(B.id)) { skip('B가 대기 획이 안 됐다'); continue }
    const bs = s.app.doc.strokes.find(x => x.id === B.id)!
    const t = (aimX - bs.a.x) / (bs.b.x - bs.a.x)
    if (!(t >= 0 && t <= 1)) { skip('조준선이 B의 그린 구간을 안 지난다'); continue }
    const target = { x: aimX, y: bs.a.y + t * (bs.b.y - bs.a.y) }
    const startY = target.y + L
    if (startY > g.b.y - 5) { skip('획 길이 L을 조준선 위에 못 앉힌다'); continue }
    const v = s.draw(aimX, g.b.y, aimX, startY)
    if (!v || !s.app.lift.lifted.has(v.id)) { skip('씨앗 세로선이 3D가 안 됐다'); continue }
    if (!s.app.lift.waiting.includes(B.id)) { skip('씨앗이 B를 먼저 정의했다'); continue }
    // ⚠ **미리보기를 먼저 잰다**(첫 판의 결함 — 커밋 뒤에 재면 그 획 자신의 끝점이 이긴다)
    const set = { ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s }
    const oh = resolveStart(s.app.lift, s.app.pose, v.b, set)
    const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an, oh ? oh.p : v.b,
      { p3: oh?.p3 ?? null }, { x: target.x + dx, y: target.y + dy }, set, { mmPerUnit: null, snapStep: null })
    const A = s.draw(v.b.x, v.b.y, target.x + dx, target.y + dy)
    if (!A) { skip('A가 안 그어졌다'); continue }
    rows.push({
      band, off, L, dx, dy, kind: r.endSnap?.kind ?? null,
      axis: axisOfStroke(s.app.lift.an, s.app.pose, A.a, A.b),
      defined: !!s.app.doc.strokes.find(x => x.id === B.id)!.own3,
    })
  }
  const fold = (keyOf: (r: typeof rows[number]) => string) => {
    const out: Record<string, { n: number; defined: number; axis_lost: number; kinds: Record<string, number> }> = {}
    for (const r of rows) {
      const k = keyOf(r)
      out[k] = out[k] ?? { n: 0, defined: 0, axis_lost: 0, kinds: {} }
      out[k]!.n++
      if (r.defined) out[k]!.defined++
      if (!r.axis) out[k]!.axis_lost++
      const kn = r.kind ?? '(없음)'
      out[k]!.kinds[kn] = (out[k]!.kinds[kn] ?? 0) + 1
    }
    return out
  }
  return {
    grid: { bands: BANDS, offs: OFFS, lengths: LS, hand_offsets: HAND, comps: ['A_가까운VP 하나(B를 대역마다 옮긴다)'] },
    denominator: {
      grid_full: BANDS.length * OFFS.length * LS.length * HAND.length,
      used: rows.length,
      skipped: [...new Map(skips.map(k => [`${k.band}|${k.off}|${k.L}|${k.why}`, k])).values()],
    },
    by_band: fold(r => r.band),
    by_off: fold(r => `off${r.off}`),
    by_length: fold(r => `L${r.L}`),
    by_band_off_len: fold(r => `${r.band}|off${r.off}|L${r.L}`),
    axis_lost_rows: rows.filter(r => !r.axis).map(r => ({ band: r.band, off: r.off, L: r.L, dx: r.dx, dy: r.dy, kind: r.kind, defined: r.defined })),
    dead_rows: rows.filter(r => !r.defined).map(r => ({ band: r.band, off: r.off, L: r.L, dx: r.dx, dy: r.dy, kind: r.kind, axis: r.axis })),
  }
}

/** ── 2차 리뷰 [2] 답 — **«안 겨눈 선»에 붙는가**(#59가 실제로 묻는 것) ────────────
 *  첫 판의 격자에는 대기선이 **하나뿐**이라 그 사건이 발생할 수 없었다(그래서 「대가 0」은
 *  측정이 아니었다). 여기서는 조준선이 대기선 **둘**을 지나게 두고, 손이 B1 근처에서
 *  멈췄을 때 B2가 이기는 일이 있는지 본다. gapPx = 두 교차점 사이의 조준선 방향 거리. */
function distractorSweep() {
  const rows: { gap: number; dy: number; picked: 'B1' | 'B2' | '없음' | '다른종류'; defB1: boolean; defB2: boolean }[] = []
  for (const gap of [10, 20, 40, 80]) for (const dy of [0, 3, 6, -3, -6]) {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
    const g = s.draw(500, 500, 720, 445)
    if (!g || !s.app.lift.lifted.has(g.id)) continue
    const aimX = g.b.x
    // 조준선과 **정확히 (aimX, yAt)에서** 만나는 vp0 방향 대기선.
    // ⚠ 첫 판은 기울기를 다른 픽스처에서 베껴 와(+150/+75) vp0 방향이 아니었다 —
    //   축 스냅이 잉크를 옮겨 교차가 yAt에 안 왔고 **20칸 전부 아무것도 안 쟀다**
    //   (picked 전부 «다른종류» · 정의 0). 소실점에서 기울기를 푼다.
    const vp0 = { x: 900, y: 400 }
    // ⚠ 길이를 **다르게** 준다(두 번째 판의 발견): 같은 길이로 두면 두 선의 먼 끝이
    //   한 점(870,375)에 모여 **시작 오스냅이 둘을 붙여 버린다** — 그러면 B2가 «닿아서»가
    //   아니라 **사슬로** 올라가 「둘 다 정의됐다」가 픽스처 인공물이 된다(실측: ts.ok=1).
    const mk = (yAt: number, ext: number) => {
      const k = (vp0.y - yAt) / (vp0.x - aimX)          // (aimX,yAt)를 지나는 vp0 선의 기울기
      const a = { x: aimX - 60, y: yAt - 60 * k }
      return s.draw(a.x, a.y, a.x + ext, a.y + ext * k)
    }
    const B1 = mk(250, 210), B2 = mk(250 + gap, 160)
    if (!B1 || !B2) continue
    if (!s.app.lift.waiting.includes(B1.id) || !s.app.lift.waiting.includes(B2.id)) continue
    const v = s.draw(aimX, g.b.y, aimX, 380)
    if (!v || !s.app.lift.lifted.has(v.id)) continue
    const set = { ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s }
    const oh = resolveStart(s.app.lift, s.app.pose, v.b, set)
    const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an, oh ? oh.p : v.b,
      { p3: oh?.p3 ?? null }, { x: aimX, y: 250 + dy }, set, { mmPerUnit: null, snapStep: null })
    s.draw(v.b.x, v.b.y, aimX, 250 + dy)
    const b1 = s.app.doc.strokes.find(x => x.id === B1.id)!
    const b2 = s.app.doc.strokes.find(x => x.id === B2.id)!
    // 두 선이 끝을 공유하면 이 칸은 못 잰다(사슬이 섞인다) — 건너뛴다
    const bs1 = s.app.doc.strokes.find(x => x.id === B1.id)!
    const bs2 = s.app.doc.strokes.find(x => x.id === B2.id)!
    if (Math.hypot(bs1.b.x - bs2.b.x, bs1.b.y - bs2.b.y) < 1 ||
        Math.hypot(bs1.a.x - bs2.a.x, bs1.a.y - bs2.a.y) < 1) continue
    const near = (p: { x: number; y: number } | undefined, y: number) => !!p && Math.abs(p.y - y) < 3
    const picked = r.endSnap?.kind !== 'xint' ? (r.endSnap ? '다른종류' : '없음')
      : near(r.endSnap?.p, 250) ? 'B1' : near(r.endSnap?.p, 250 + gap) ? 'B2' : '다른종류'
    rows.push({ gap, dy, picked, defB1: !!b1.own3, defB2: !!b2.own3 })
  }
  return {
    n: rows.length,
    picked_B2: rows.filter(r => r.picked === 'B2').length,
    defined_B2_only: rows.filter(r => r.defB2 && !r.defB1).length,
    defined_both: rows.filter(r => r.defB1 && r.defB2).length,
    by_gap: [...new Set(rows.map(r => r.gap))].map(gap => {
      const g2 = rows.filter(r => r.gap === gap)
      return { gap, n: g2.length, B1: g2.filter(r => r.picked === 'B1').length, B2: g2.filter(r => r.picked === 'B2').length,
        other: g2.filter(r => r.picked !== 'B1' && r.picked !== 'B2').length,
        defB1: g2.filter(r => r.defB1).length, defB2: g2.filter(r => r.defB2).length }
    }),
    rows,
  }
}

/** ── 리뷰 [8] 답 — 반경 **밖**에서 새로 서는 칸을 **오차 방향으로 가른다** ─────────
 *  구멍을 «축스냅된 끝»에서 재면 축에 **수직인** 성분이 문에서 빠진다 — 그것은 의도한
 *  교정이다(그 성분은 축 스냅이 이미 버렸다). 그러나 **조준선을 «따라»** 멀리서도 서면
 *  그것은 「안 겨눈 선에 붙는다」이고 여유의 대가다(#59). 둘을 갈라 낸다.
 *  조준선이 세로(x = aimX)이므로 dx = 축에 수직 · dy = 조준선 방향이다. */
const offsetKind = (dx: number, dy: number): 'perp' | 'along' | 'both' =>
  dx !== 0 && dy !== 0 ? 'both' : (dx !== 0 ? 'perp' : 'along')

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
        band: '**몸통 대역 한정**(리뷰 [6]) — 조준선∩B가 B의 끝점·중점 오스냅 반경 밖인 자리만이다. 끝점 대역은 아래 edge_band가 따로 잰다',
        before: { defined: inside.before.defined, n: inside.before.n, kinds: inside.before.kinds, missed: inside.before.missed, by_pair: inside.before.by_pair },
        after: {
          defined: inside.after.defined, n: inside.after.n, kinds: inside.after.kinds, missed: inside.after.missed,
          // ⚠ 수리 후 by_pair는 **쌍마다 같은 한 값**이라 11개를 그대로 실으면 selfcheck가
          //   「단일 범주」 플래그를 11개 낸다(정보량은 그대로다). 접어서 싣되 **접었다는
          //   사실과 서로 다른 분포의 수**를 남긴다 — 변별력은 위 before.by_pair가 진다.
          by_pair_folded: (() => {
            const seen = new Map<string, string[]>()
            for (const [k, v] of Object.entries(inside.after.by_pair)) {
              const sig = JSON.stringify(v)
              seen.set(sig, [...(seen.get(sig) ?? []), k])
            }
            return { distinct: seen.size, groups: [...seen.entries()].map(([sig, pairs]) => ({ dist: JSON.parse(sig), pairs })) }
          })(),
        },
        gained: inside.after.defined - inside.before.defined,
        denominator: inside.after.denominator,
        before_kinds_vs_defined: (() => {
          // ⚠ **2차 리뷰 [4] 정정**: 첫 판은 「defined 237 ≥ ext_win 220이므로 ext가 이긴 칸은
          //   전부 정의가 섰다」로 적었는데 **그 추론은 성립하지 않는다**(ext 220 중 20이 죽고
          //   나머지 55 중 37이 살아도 237이다). 부등식은 교차표를 대신 못 한다.
          //   같은 원장이 반례를 든다 — outside에서는 ext가 22칸 이겼는데 그 정의는 0이다.
          //   그래서 **2×2 교차표를 직접 낸다.**
          const c = { ext_defined: 0, ext_undefined: 0, other_defined: 0, other_undefined: 0 }
          for (const cell of inside.before.cells) {
            const isExt = cell.kind === 'ext'
            if (isExt && cell.defined) c.ext_defined++
            else if (isExt) c.ext_undefined++
            else if (cell.defined) c.other_defined++
            else c.other_undefined++
          }
          return {
            what: '리뷰 [7] — ②(ext가 near를 가린다)로 «정의»가 죽은 칸이 있는가. **2×2 교차표**(2차 [4])',
            cross: c,
            verdict: c.ext_undefined === 0
              ? '②는 가시성의 기전이다 — ext가 이긴 칸에서 죽은 정의가 0이다(교차표가 직접 말한다)'
              : `②로 죽은 정의가 ${c.ext_undefined}칸 있다`,
          }
        })(),
        dead_before_shape: (() => {
          // 2차 리뷰 [5] — 「220/275 = 80%」가 격자가 정한 상수인가. 죽은 칸이 특정 오프셋
          // 열에 몰려 있으면 그 비율은 «재현율»이 아니라 «격자 선택»이다.
          const dead = inside.before.cells.filter(c => !c.defined)
          const dxs = [...new Set(dead.map(c => c.dx))]
          const nonExt = inside.before.cells.filter(c => c.kind !== 'ext')
          const nonExtDxs = [...new Set(nonExt.map(c => c.dx))]
          return {
            what: '2차 리뷰 [5] — 죽은 칸·비-ext 칸이 오프셋 격자의 어느 열인가',
            dead_n: dead.length, dead_dx_values: dxs,
            non_ext_n: nonExt.length, non_ext_dx_values: nonExtDxs,
            note: 'dx 값이 하나로 몰리면 «비율»은 격자 선택(dx 후보 다섯 중 하나)이 정한 상수다 — 사람 증상의 재현율로 인용할 수 없다(#46)',
          }
        })(),
        before_by_pair_folded: (() => {
          // 2차 리뷰 [6] — 「쌍마다 다르다」는 절반만 맞았다. 접어서 **몇 가지인지**를 낸다.
          const seen = new Map<string, string[]>()
          for (const [k, v] of Object.entries(inside.before.by_pair)) {
            const sig = JSON.stringify(v)
            seen.set(sig, [...(seen.get(sig) ?? []), k])
          }
          return { distinct: seen.size, groups: [...seen.entries()].map(([sig, pairs]) => ({ dist: JSON.parse(sig), pairs })) }
        })(),
      },
      outside: {
        what: '반증(D-3) — 반경 밖. 여기서도 다 서면 이 하네스는 문을 안 재는 것이다',
        // 2차 리뷰 [14] — #69㉠이 세운 규칙(후보 분포와 성립률을 **나란히** 낸다)을 이 절이
        // 어기고 있었다(before가 성립률만 냈다). 자기 원장부터 지킨다.
        before: { defined: outside.before.defined, n: outside.before.n, kinds: outside.before.kinds },
        after: { defined: outside.after.defined, n: outside.after.n, kinds: outside.after.kinds },
      },
      boundary_along_aim: {
        what: '2차 리뷰 [11] — 조준선 «따라» 6~11px. 문값 8이 표본 가운데 있다. 갈리는 자리가 8이 아니면 그 척도는 8이 아니다',
        before: (() => { const r = sweep('before', BOUNDARY); return { n: r.n, defined: r.defined, kinds: r.kinds } })(),
        after: (() => { const r = sweep('after', BOUNDARY); return { n: r.n, defined: r.defined, kinds: r.kinds } })(),
        per_dy: BOUNDARY.map(([dx, dy]) => {
          const a = sweep('after', [[dx, dy]])
          return { dy, n: a.n, xint: a.kinds['xint'] ?? 0, defined: a.defined }
        }),
      },
      distractor: {
        what: '2차 리뷰 [2] — **«안 겨눈 선»에 붙는가**(#59가 실제로 묻는 것). 조준선이 대기선 둘을 지나고 손은 B1 근처에서 멈춘다. gap = 두 교차점의 조준선 방향 거리(px)',
        ...distractorSweep(),
      },
      edge_band: {
        what: '리뷰 [6] — 조준선∩B가 B의 **끝점 오스냅 반경 안**에 드는 대역. 위 inside 격자가 구성상 비운 자리이고, 거기서는 끝점 오스냅이 xint보다 앞서 이긴다. off = 교차점과 B 시작 끝의 화면 거리(px). off20은 반증(몸통이 되어 xint가 이겨야 한다)',
        ...edgeBandSweep(),
      },
      outside_by_direction: {
        what: '리뷰 [8] — 반경 밖에서 서는 칸을 오차 방향으로 가른다. perp = 축에 수직(축 스냅이 이미 버린 성분 — 문에서 빼는 것이 의도) · along = 조준선 방향(못 미침/지나침 — 여기서 서면 「안 겨눈 선에 붙는다」의 대가다)',
        before: OUTSIDE.map(([dx, dy]) => ({ dx, dy, dir: offsetKind(dx, dy) })),
        after_defined: (() => {
          const out: Record<string, { n: number; defined: number; xint: number }> = {}
          for (const [dx, dy] of OUTSIDE) {
            const one = sweep('after', [[dx, dy]])
            const k = `${offsetKind(dx, dy)}(${dx},${dy})`
            out[k] = { n: one.n, defined: one.defined, xint: one.kinds['xint'] ?? 0 }
          }
          return out
        })(),
        before_defined: (() => {
          const out: Record<string, { n: number; defined: number }> = {}
          for (const [dx, dy] of OUTSIDE) {
            const one = sweep('before', [[dx, dy]])
            out[`${offsetKind(dx, dy)}(${dx},${dy})`] = { n: one.n, defined: one.defined }
          }
          return out
        })(),
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
        'inside.after.by_pair_folded.groups[0].dist 단일 범주(xint 25)':
          '접은 결과가 「서로 다른 분포 1개」라는 것이 곧 결론이다 — 수리 후에는 (구도,길이) '
          + '11쌍이 전부 같은 답을 낸다. **분포가 쌍마다 다른지**는 inside.before.by_pair가 '
          + '진다(거기서는 A_가까운VP|L40과 B_얕은각|L40이 실제로 다르다 — 1차 리뷰 [9])',
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
