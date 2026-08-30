// web2-35 1·2·3번 — **궤적을 더한 뒤의 게이트**. 32-4와 **같은 표본·같은 하네스**다
// (`glyphforms.ts` — 11자형 × 4상자 × 4흔들기 × 5씨 = 880칸. 한 자리다 #54).
//
// ⚠⚠ **이 회차의 반증 조건**(지시 35-2 · D-3). 32-4에서 배운 것을 그대로 옮긴다:
//   ㉠ **궤적 단독 이득을 따로 잰다** — 「두 번째 대조기를 붙였더니 올랐다」와
//      「**궤적**이 올렸다」를 가르는 팔이 둘이다:
//        · `arm_p_dollar` — **같은 원형 표(GLYPHS)**를 쓰는 $P(점군·순서 무시)를
//          같은 자리에 붙인다. 다른 것은 **궤적을 보는가**뿐이다.
//        · `arm_shape_only` — 내 대조기에서 **궤적 항만 끈다**(방향·전환·순서·획수·
//          붓 뗀 자리·공중 경로). 구조는 그대로다.
//   ㉡ **자형별 · 비별 분해표**를 낸다. 평균 하나로 뭉치지 않는다.
//   ㉢ **이득이 어느 칸에 몰렸는지** 반드시 낸다(32-4에서 2차 리뷰어가 잡은 자리).
//   ㉣ ⚠⚠ **표본 안 / 표본 밖을 가른다** — 궤적 원형의 출처가 `digits.GLYPHS`이므로
//      「현행 템플릿」 자형 넷(320칸)은 **원형과 같은 획**이다. 그 칸의 이득은
//      «픽스처를 외운» 몫이고 **궤적의 이득이 아니다**. 나머지 7자형(560칸)이
//      표본 밖이고 **그쪽 이득만 인용한다**.
//   ㉤ **오답률이 오르지 않는다**(#61 비용 비대칭 — 승인 층이 없고 첫 치수가 축척을 정한다).
//   ㉥ 잡음 8종 수용 **0** 불변.
//
// ⚠ 헤드리스의 「손글씨」는 **합성**이다. 어느 축이 약한지를 가리키는 데까지만 쓴다 —
//   인식률 자체는 결론이 아니다. 진짜 값은 실기기이고 사람이 자기 글씨로 센다.
//
// 정본 명령: LEDGER=1 npx vitest run test/glyph35.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyGlyph } from '../src/core/digitnet'
import { GLYPHS, recognizeGlyphRaw } from '../src/core/digits'
import { NET_REJECT, NET_RESCUE, TRAJ_ACCEPT, classifyGlyphNorm, readGlyph, recognizeDigitsNet } from '../src/core/handwriting'
import { trajMatch, PROTOS } from '../src/core/traj_rec'
import { trajFeat, trajDist, FULL, SHAPE_ONLY } from '../src/core/traj'
import { C } from '../src/core/constants'
import { glyphAt, BOXES, JIT, FORMS } from './glyphforms'
import type { Pt } from '../src/core/vec'

/** 비숫자 8종 — `digitnet.test.ts`·`glyph32.test.ts`의 그 표본이다(한 자리 #54). */
const NOISE: Record<string, Pt[][]> = {
  가로선: [[{ x: 0, y: 35 }, { x: 60, y: 35 }]],
  W: [[{ x: 0, y: 0 }, { x: 15, y: 70 }, { x: 30, y: 20 }, { x: 45, y: 70 }, { x: 60, y: 0 }]],
  N: [[{ x: 0, y: 70 }, { x: 0, y: 0 }, { x: 50, y: 70 }, { x: 50, y: 0 }]],
  X: [[{ x: 0, y: 0 }, { x: 50, y: 70 }], [{ x: 50, y: 0 }, { x: 0, y: 70 }]],
  ㄷ자: [[{ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 70 }, { x: 50, y: 70 }]],
  체크: [[{ x: 0, y: 40 }, { x: 20, y: 70 }, { x: 60, y: 0 }]],
  대각선: [[{ x: 0, y: 0 }, { x: 60, y: 70 }]],
  삼각형: [[{ x: 30, y: 0 }, { x: 0, y: 70 }, { x: 60, y: 70 }, { x: 30, y: 0 }]],
}

/** $P를 **임의 문턱에서** 부른다 — `recognizeGlyph`는 REJECT가 박혀 있어 훑기가 안 된다.
 *  거리 계산은 그 함수를 그대로 쓰고(같은 함수 #62) 문턱만 밖에서 건다. */
const recognizeGlyphAt = (st: Pt[][], th: number) => {
  const r = recognizeGlyphRaw(st)
  return r && r.d <= th ? r : null
}

/** 자형이 **원형 표와 같은 획인가** — 이름이 아니라 좌표로 판정한다(문면과 실제가 갈리는
 *  자리 · web2-02 2차 리뷰어의 지적과 같은 형태). 같으면 «표본 안»이다. */
const sameAsProto = (ch: string, st: Pt[][]) => JSON.stringify(st) === JSON.stringify(GLYPHS[ch])

type Ans = { ch: string; p: number } | null
/** 래스터 두 시야 = **기준선**(web2-32까지의 런타임). 궤적은 이것이 거부한 칸만 본다. */
const shapeView = (g: Pt[][]): Ans => { const r = classifyGlyphNorm(g); return r && r.p >= NET_REJECT ? r : null }

interface Cell {
  ch: string; name: string; box: string; ratio: string; inSample: boolean
  base: Ans                                   // 래스터 두 시야
  traj: { ch: string; d: number }             // 궤적(전 항)
  trajShape: { ch: string; d: number }        // 궤적 — **궤적 항을 끈 판**(위약)
  trajNoMerge: { ch: string; d: number }      // 획 병합 없이(35-3 진단)
  pdollar: { ch: string; d: number } | null   // $P(순서 무시 점군) — 같은 원형 표
  runtime: { ch: string } | null              // **앱이 실제로 부르는 함수**(네 시야 · #62)
  k: number                                   // 씨 번호 0~4 — 씨 변동폭을 재는 축(#14)
}

/** 880칸을 **한 번만** 굽는다 — 모든 팔과 훑기가 이 표에서 파생한다(같은 표본 보장 #54). */
function buildCells(): Cell[] {
  const cells: Cell[] = []
  for (const f of FORMS) for (const b of BOXES) {
    const ratio = (b.name.match(/비 ([0-9.]+)/) ?? [])[1] ?? '?'
    const inSample = sameAsProto(f.ch, f.strokes)
    for (const jit of JIT) for (let k = 0; k < 5; k++) {
      const g = glyphAt(f.strokes, 100, 100, b.w, b.h, 31 + k * 613, jit)
      cells.push({
        ch: f.ch, name: f.name, box: b.name, ratio, inSample,
        base: shapeView(g),
        traj: trajMatch(g)!,
        trajShape: trajMatch(g, { mergeTolerant: true, w: SHAPE_ONLY })!,
        trajNoMerge: trajMatch(g, { mergeTolerant: false, w: FULL })!,
        pdollar: recognizeGlyphRaw(g),
        runtime: readGlyph(g),
        k,
      })
    }
  }
  return cells
}

type Pick = (c: Cell) => { ch: string } | null
function score(cells: Cell[], pick: Pick) {
  let ok = 0, wrong = 0, rej = 0
  const partners: Record<string, number> = {}
  const perCell: string[] = []
  for (const c of cells) {
    const r = pick(c)
    perCell.push(r ? r.ch : '?')
    if (!r) rej++
    else if (r.ch === c.ch) ok++
    else { wrong++; partners[`${c.ch}→${r.ch}`] = (partners[`${c.ch}→${r.ch}`] ?? 0) + 1 }
  }
  return { ok, wrong, rej, n: cells.length, partners, perCell }
}

/** 자형 × 상자 표 — 32-4 원장과 같은 모양으로 낸다(나란히 읽히게) */
function byCell(cells: Cell[], pick: Pick) {
  const m = new Map<string, { ch: string; name: string; box: string; correct: number; total: number; got: Record<string, number> }>()
  for (const c of cells) {
    const key = c.name + '|' + c.box
    const e = m.get(key) ?? { ch: c.ch, name: c.name, box: c.box, correct: 0, total: 0, got: {} }
    const r = pick(c)
    const g = r ? r.ch : '?'
    e.got[g] = (e.got[g] ?? 0) + 1
    e.total++
    if (r && r.ch === c.ch) e.correct++
    m.set(key, e)
  }
  return [...m.values()]
}
const byRatio = (cells: Cell[], pick: Pick) => {
  const m: Record<string, { hit: number; n: number }> = {}
  for (const c of cells) {
    const e = (m[c.ratio] ??= { hit: 0, n: 0 })
    e.n++
    const r = pick(c)
    if (r && r.ch === c.ch) e.hit++
  }
  return m
}
const byForm = (cells: Cell[], pick: Pick) => {
  const m: Record<string, { hit: number; n: number; in_sample: boolean }> = {}
  for (const c of cells) {
    const e = (m[c.name] ??= { hit: 0, n: 0, in_sample: c.inSample })
    e.n++
    const r = pick(c)
    if (r && r.ch === c.ch) e.hit++
  }
  return m
}
const maxGap = (m: Record<string, { hit: number; n: number }>) => {
  const v = Object.values(m).map(e => e.hit / e.n)
  return Math.max(...v) - Math.min(...v)
}
const split = (cells: Cell[], pick: Pick, want: boolean) => {
  const s = score(cells.filter(c => c.inSample === want), pick)
  return { ok: s.ok, wrong: s.wrong, n: s.n }
}

// ── 팔들 ────────────────────────────────────────────────────────────────────
const armBase: Pick = c => c.base
/** **앱이 실제로 도는 판**(네 시야) — 게이트의 «후»는 언제나 이것이다(#62) */
const armRuntime: Pick = c => c.runtime
const withTraj = (th: number, key: 'traj' | 'trajShape' | 'trajNoMerge' = 'traj'): Pick =>
  c => c.base ?? (c[key].d <= th ? c[key] : null)
/** $P를 같은 자리에 붙인다 — 같은 원형 표(GLYPHS)를 쓰지만 **순서·방향을 안 본다** */
const withPdollar = (th: number): Pick => c => c.base ?? (c.pdollar && c.pdollar.d <= th ? c.pdollar : null)
/** 반사실 — 궤적이 래스터를 **뒤집게** 두면(발화 조건을 없애면) 어떻게 되는가 */
const trajFirst = (th: number): Pick => c => (c.traj.d <= th ? c.traj : c.base)
/** ④ $P의 문턱 — **web2-08이 다른 표본으로 놓은 실린 값**(`digits.REJECT`). 안 건드렸다. */
const PD_SHIPPED = 0.10
/** 런타임과 **같은 동작점**의 이어 붙임(③ → ④). 분해표는 전부 이 자로 재야 한다. */
const seqAt = (thT: number, thP: number): Pick => c =>
  c.base ?? (c.traj.d <= thT ? c.traj : (c.pdollar && c.pdollar.d <= thP ? c.pdollar : null))

describe('35 궤적 — 래스터가 거부한 칸만 본다', () => {
  it('궤적 단독 이득을 위약 둘과 갈라 재고, 오답·잡음이 안 는다', () => {
    const cells = buildCells()
    const B = score(cells, armBase)
    const A = score(cells, armRuntime)                 // 런타임(네 시야)
    const A3 = score(cells, withTraj(TRAJ_ACCEPT))     // 궤적까지만(세 시야) — 분해용
    expect(B.ok, '기준선이 32-4 원장의 값 그대로다(같은 표본·같은 함수)').toBe(506)
    expect(B.n).toBe(880)

    console.log(`[35 기준선(래스터 두 시야)] 맞음 ${B.ok}/${B.n} · 틀림 ${B.wrong} · 거부 ${B.rej}`)
    console.log(`[35 궤적까지(세 시야)]       맞음 ${A3.ok}/${A3.n} · 틀림 ${A3.wrong} · 거부 ${A3.rej}`)
    console.log(`[35 런타임(네 시야)]         맞음 ${A.ok}/${A.n} · 틀림 ${A.wrong} · 거부 ${A.rej} — 수용 중 틀림 ${A.wrong}/${A.ok + A.wrong}`)

    // ── ㉣ 표본 안 / 표본 밖 ────────────────────────────────────────────────
    const inB = split(cells, armBase, true), inA = split(cells, armRuntime, true)
    const outB = split(cells, armBase, false), outA = split(cells, armRuntime, false)
    const inForms = [...new Set(cells.filter(c => c.inSample).map(c => c.name))]
    console.log(`[35 표본 안 (원형과 같은 획 · ${inForms.length}자형)] ${inB.ok}/${inB.n} → ${inA.ok}/${inA.n}`)
    console.log(`[35 표본 밖 (원형에 없는 필체)]      ${outB.ok}/${outB.n} → ${outA.ok}/${outA.n}   ← **원형 표를 외운 몫이 아닌 이득**`)
    // 「4」 — 32-4가 인용한 그 분모(320). 지시 35-2의 기준선이 77/320이다.
    const fourB = cells.filter(c => c.ch === '4' && c.base?.ch === '4').length
    const fourA = cells.filter(c => c.ch === '4' && c.runtime?.ch === '4').length
    console.log(`[35 「4」] ${fourB}/320 → ${fourA}/320   (32-4 기준선 77/320)`)
    expect(inForms.length, '「현행 템플릿」 넷이 좌표로도 원형과 같다').toBe(4)

    // ── ㉠ 위약 — **각 팔을 제 문턱에서** 견준다 ────────────────────────────
    // ⚠⚠ 거리의 **자가 팔마다 다르다**(#76 ㉣: 같은 자로 재던 둘을 가른다). 한 값 0.11로
    //   나란히 세우면 「궤적이 낫다」가 자의 눈금 차이일 뿐이다. 그래서 팔마다 문턱을
    //   훑고 **불변식(오답 ≤ 기준선 · 잡음 0)을 지키는 최대 맞음**을 그 팔의 값으로 쓴다.
    const GRID: number[] = []
    for (let t = 0.02; t <= 0.301; t += 0.005) GRID.push(Math.round(t * 1000) / 1000)
    const armsDef: { key: string; note: string; pick: (th: number) => Pick; noise: (th: number) => number }[] = [
      { key: 'traj_full', note: '궤적 — 전 항(방향·전환·순서·획수·붓 뗀 자리·공중 경로 + 히스토그램·되짚기)',
        pick: th => withTraj(th, 'traj'), noise: th => Object.values(NOISE).filter(st => trajMatch(st)!.d <= th).length },
      { key: 'traj_no_merge', note: '궤적 — 획 병합 없이(획 수가 다르면 이어 붙여 견주지 않는다)',
        pick: th => withTraj(th, 'trajNoMerge'), noise: th => Object.values(NOISE).filter(st => trajMatch(st, { mergeTolerant: false, w: FULL })!.d <= th).length },
      { key: 'traj_shape_only', note: '위약① — 같은 구조에서 **궤적 항만 끈** 판',
        pick: th => withTraj(th, 'trajShape'), noise: th => Object.values(NOISE).filter(st => trajMatch(st, { mergeTolerant: true, w: SHAPE_ONLY })!.d <= th).length },
      { key: 'p_dollar', note: '위약② — **같은 원형 표(GLYPHS)**를 쓰는 $P 점군. 순서·방향을 안 본다. 저장소에 web2-08부터 있던 것이다',
        pick: th => withPdollar(th), noise: th => Object.values(NOISE).filter(st => { const r = recognizeGlyphAt(st, th); return r !== null }).length },
      { key: 'p_dollar_traj_veto', note: '$P가 답하고 **궤적이 거부권**을 갖는다(둘의 답이 같을 때만 받는다)',
        pick: th => c => c.base ?? (c.pdollar && c.pdollar.d <= th && c.traj.ch === c.pdollar.ch ? c.pdollar : null),
        noise: th => Object.values(NOISE).filter(st => { const r = recognizeGlyphAt(st, th); return r !== null && trajMatch(st)!.ch === r.ch }).length },
    ]
    const arms = armsDef.map(a => {
      const curve = GRID.map(th => {
        const t = score(cells, a.pick(th))
        return { th, ok: t.ok, wrong: t.wrong, noise: a.noise(th), held_out: split(cells, a.pick(th), false).ok }
      })
      const legal = curve.filter(r => r.wrong <= B.wrong && r.noise === 0)
      const best = legal.reduce((x, y) => (y.ok > x.ok ? y : x), legal[0] ?? { th: 0, ok: B.ok, wrong: B.wrong, noise: 0, held_out: outB.ok })
      return { key: a.key, note: a.note, best, curve }
    })
    for (const a of arms) console.log(`[35 팔] ${a.key.padEnd(20)} 최선 th=${a.best.th} — 맞음 ${a.best.ok} · 틀림 ${a.best.wrong} · 표본밖 ${a.best.held_out}/560`)
    const armOf = (k: string) => arms.find(a => a.key === k)!.best
    const P = armOf('p_dollar'), S = armOf('traj_shape_only'), T = armOf('traj_full')
    console.log(`[35 궤적 단독 이득] 기준선 대비 ${T.ok - B.ok} · **$P 대비 ${T.ok - P.ok}** · 항 끈 판 대비 ${T.ok - S.ok}`)

    // ── 반사실 — 궤적이 래스터를 뒤집게 두면 ────────────────────────────────
    const F = score(cells, trajFirst(TRAJ_ACCEPT))
    const F2 = score(cells, trajFirst(1))           // 궤적이 언제나 이긴다
    console.log(`[35 반사실 궤적 우선(th=${TRAJ_ACCEPT})] 맞음 ${F.ok} · 틀림 ${F.wrong}`)
    console.log(`[35 반사실 궤적만(문턱 없음)]        맞음 ${F2.ok} · 틀림 ${F2.wrong}`)

    // ── ㉡ 비별 · 자형별 ────────────────────────────────────────────────────
    const rB = byRatio(cells, armBase), rA = byRatio(cells, armRuntime)
    for (const k of Object.keys(rB).sort()) console.log(`[35 비 ${k}] ${rB[k]!.hit}/${rB[k]!.n} → ${rA[k]!.hit}/${rA[k]!.n}`)
    console.log(`[35 비 최대격차] ${(maxGap(rB) * 100).toFixed(1)}%p → ${(maxGap(rA) * 100).toFixed(1)}%p`)
    const fB = byForm(cells, armBase), fA = byForm(cells, armRuntime)
    for (const k of Object.keys(fB)) console.log(`[35 자형${fB[k]!.in_sample ? '(표본 안)' : ''}] ${k} — ${fB[k]!.hit}/${fB[k]!.n} → ${fA[k]!.hit}/${fA[k]!.n}`)

    // ── ㉢ 이득이 어느 칸에 몰렸는가 ────────────────────────────────────────
    const cB = byCell(cells, armBase), cA = byCell(cells, armRuntime)
    const delta = cA.map((r, i) => ({ name: r.name, box: r.box, in_sample: cells.find(c => c.name === r.name)!.inSample, before: cB[i]!.correct, after: r.correct }))
      .filter(d => d.before !== d.after)
    for (const d of delta) console.log(`[35 오른 칸${d.in_sample ? '(표본 안)' : ''}] ${d.name} @ ${d.box} — ${d.before} → ${d.after}`)
    const gainedForms = [...new Set(delta.map(d => d.name))]
    console.log(`[35 이득의 출처] 오른 칸 ${delta.length}개 · ${gainedForms.length}자형 — ${gainedForms.join(' / ')}`)

    // ── 궤적이 «맞게 수용된» 칸에서도 같은 답을 내는가(발화 조건의 근거) ────────
    const onAccepted: Record<string, { agree: number; n: number }> = {}
    for (const c of cells) {
      if (!c.base || c.base.ch !== c.ch) continue
      const e = (onAccepted[c.name] ??= { agree: 0, n: 0 })
      e.n++
      if (c.traj.ch === c.ch) e.agree++
    }
    for (const [k, v] of Object.entries(onAccepted)) console.log(`[35 수용된 칸의 궤적 일치] ${k} — ${v.agree}/${v.n}`)

    // ── ㉥ 잡음 — **앱과 같은 함수**로 통째로 본다(#62) ──────────────────────
    const noise = Object.entries(NOISE).map(([name, st]) => {
      const t = trajMatch(st)!
      return { name, traj: t.ch, d: t.d, second: t.second, accepted_by_app: recognizeDigitsNet(st) !== '?' }
    })
    const acceptedNoise = noise.filter(x => x.accepted_by_app).length
    console.log(`[35 잡음] 앱 수용 ${acceptedNoise}/8 — ${noise.map(x => `${x.name}→${x.traj}:${x.d.toFixed(3)}`).join(' · ')}`)

    // ── ㉤ 훑기 — 값 하나로 결론을 만들지 않는다(#12·#13) ───────────────────
    const TH = [0.06, 0.08, 0.09, 0.10, 0.105, 0.11, 0.115, 0.12, 0.125, 0.13, 0.15, 0.20, 0.25]
    const sweep = TH.map(th => {
      const t = score(cells, withTraj(th))
      const fired = cells.filter(c => !c.base && c.traj.d <= th)
      return {
        th, ok: t.ok, wrong: t.wrong, reject: t.rej, wrong_partners: t.partners,
        four: cells.filter(c => c.ch === '4').filter((c, i) => t.perCell[cells.indexOf(c)] === '4').length,
        fired: fired.length, fired_correct: fired.filter(c => c.traj.ch === c.ch).length,
        held_out_ok: split(cells, withTraj(th), false).ok,
        noise_accepted: Object.values(NOISE).filter(st => { const m = trajMatch(st)!; return m.d <= th }).length,
        gained_forms: [...new Set(byCell(cells, withTraj(th)).map((r, i) => r.correct > cB[i]!.correct ? r.name : '').filter(Boolean))].length,
      }
    })
    for (const s of sweep) console.log(`[35 훑기] th=${s.th} — 맞음 ${s.ok} · 틀림 ${s.wrong}(${JSON.stringify(s.wrong_partners)}) · 표본밖 ${s.held_out_ok}/560 · 발화 ${s.fired}/적중 ${s.fired_correct} · 오른 자형 ${s.gained_forms} · 잡음 ${s.noise_accepted}`)

    // 거리 띠 — 문턱이 어디에 서 있는지 수로 낸다.
    // ⚠ **«구제되는 칸»으로 한정해서 잰다.** 거부된 칸 전량의 «정답 최악»을 쓰면 문턱보다
    //   훨씬 먼 칸(세리프 1이 우연히 「1」을 낸 0.24)이 섞여 띠가 거짓이 된다 — 초판이
    //   그렇게 적어 «0.243 < 0.11»이라는 앞뒤 안 맞는 줄이 나왔다(그 자리를 여기 남긴다).
    const badD = cells.filter(c => !c.base && c.traj.ch !== c.ch).map(c => c.traj.d)
    const wrongBest = Math.min(...badD)
    const okBelow = cells.filter(c => !c.base && c.traj.ch === c.ch && c.traj.d < wrongBest).map(c => c.traj.d)
    const noiseD = Object.values(NOISE).map(st => trajMatch(st)!.d)
    const band = {
      note: '고원 = [맞는 구제의 최악, 첫 오답 거리) — 이 사이 어디를 잘라도 결과가 같다',
      correct_worst_below_first_wrong: Math.max(...okBelow), rescued_below: okBelow.length,
      wrong_best: wrongBest, noise_best: Math.min(...noiseD), threshold: TRAJ_ACCEPT,
    }
    console.log(`[35 거리 띠] 맞는 구제 ${band.rescued_below}칸의 최악 ${band.correct_worst_below_first_wrong.toFixed(3)} < 문턱 ${TRAJ_ACCEPT} < 첫 오답 ${wrongBest.toFixed(3)} (잡음 최선 ${band.noise_best.toFixed(3)})`)

    // ── **+12는 어디서 오는가** — 궤적과 $P가 서로 못 하는 칸을 자형별로 낸다 ──────
    const pBest = armOf('p_dollar'), tBest = armOf('traj_full')
    // ⚠⚠ **동작점을 맞춘다**(2차 리뷰어 [1][2][3] · 이 회차가 세운 #82 ㉡의 재발).
    //   초판은 $P를 **제 최선 문턱 0.095**로 둔 차이표를 만들고, 그것을 **런타임(=$P 0.10)**의
    //   총계 770 옆에 세워 「770의 근거」로 썼다. 두 표의 자가 달랐다 — 0.095 표가
    //   「둘 다 못 살린다」로 적은 25칸을 런타임은 실제로 살린다(세리프1 20 · 세리프1+밑줄 5).
    //   그래서 차이표를 **두 동작점 모두** 내고, **인용은 런타임 쪽으로 한다**.
    const diffAt = (thP: number) => {
      const pickP = withPdollar(thP), pickT = withTraj(TRAJ_ACCEPT, 'traj')
      const m: Record<string, { traj_only: number; pdollar_only: number; both: number; neither: number }> = {}
      for (const c of cells) {
        if (c.base) continue                                // 래스터가 이미 답한 칸은 둘 다 안 본다
        const e = (m[c.name] ??= { traj_only: 0, pdollar_only: 0, both: 0, neither: 0 })
        const t = pickT(c), pp = pickP(c)
        const tOk = !!t && t.ch === c.ch, pOk = !!pp && pp.ch === c.ch
        if (tOk && pOk) e.both++
        else if (tOk) e.traj_only++
        else if (pOk) e.pdollar_only++
        else e.neither++
      }
      const sum = Object.values(m).reduce((a, e) => ({
        traj_only: a.traj_only + e.traj_only, pdollar_only: a.pdollar_only + e.pdollar_only,
        both: a.both + e.both, neither: a.neither + e.neither,
      }), { traj_only: 0, pdollar_only: 0, both: 0, neither: 0 })
      return { rows: m, sum }
    }
    const diffRuntime = diffAt(PD_SHIPPED)          // ← 런타임과 같은 자. **인용은 이쪽**
    const diffPBest = diffAt(pBest.th)              // ← 초판이 쓰던 자(0.095). 대조용으로 남긴다
    const diff = diffRuntime.rows
    console.log(`[35 차이표 동작점] 런타임($P ${PD_SHIPPED}) 궤적만 ${diffRuntime.sum.traj_only} · $P만 ${diffRuntime.sum.pdollar_only} · 둘 다 ${diffRuntime.sum.both} · 둘 다 못함 ${diffRuntime.sum.neither}`)
    console.log(`[35 차이표 동작점] 초판($P ${pBest.th})     궤적만 ${diffPBest.sum.traj_only} · $P만 ${diffPBest.sum.pdollar_only} · 둘 다 ${diffPBest.sum.both} · 둘 다 못함 ${diffPBest.sum.neither}`)
    for (const [k, v] of Object.entries(diff)) if (v.traj_only || v.pdollar_only)
      console.log(`[35 궤적↔$P 차이] ${k} — 궤적만 ${v.traj_only} · $P만 ${v.pdollar_only} · 둘 다 ${v.both} · 둘 다 못함 ${v.neither}`)

    // ── [#14] **씨 변동폭** — 「12칸」과 「$P는 불법」이 씨 하나에 걸려 있지 않은가 ──────
    // ⚠⚠ 2차 리뷰어 [4]: 불변식이 「오답 ≤ 2」라서 $P가 695(@0.095)로 잡히고 궤적이 12칸
    //   이긴다. 오답이 하나만 흔들려도 $P가 725(@0.10)로 합법이 되어 **부호가 뒤집힌다**.
    //   #14가 그 형태다 — 「씨 변동폭이 결론의 여유보다 크면 그 결론은 없다」. 그래서 잰다.
    const bySeed = [0, 1, 2, 3, 4].map(k => {
      const sub = cells.filter(c => c.k === k)
      const t = score(sub, withTraj(TRAJ_ACCEPT, 'traj'))
      const p95 = score(sub, withPdollar(pBest.th))
      const p10 = score(sub, withPdollar(PD_SHIPPED))
      const rt = score(sub, armRuntime)
      const b = score(sub, armBase)
      return {
        k, n: sub.length, base: b.ok,
        traj: t.ok, traj_wrong: t.wrong,
        pdollar_095: p95.ok, pdollar_095_wrong: p95.wrong,
        pdollar_010: p10.ok, pdollar_010_wrong: p10.wrong,
        runtime: rt.ok, runtime_wrong: rt.wrong,
        traj_minus_pdollar095: t.ok - p95.ok,
        // **한계 이득** — 사슬 안에서 각자가 «더 얹는» 몫. 머리끼리 견주는 위 값과 다른 물음이다.
        traj_marginal_given_pdollar: rt.ok - p10.ok,     // ④가 이미 있을 때 ③이 더 얹는 몫
        pdollar_marginal_given_traj: rt.ok - t.ok,       // ③이 이미 있을 때 ④가 더 얹는 몫
      }
    })
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    const seedStats = {
      note: '씨 5개를 각각 176칸으로 따로 낸다. 「12칸」은 전량(880) 기준이므로 씨당으로는 12/5 ≈ 2.4칸이다.',
      per_seed: bySeed,
      spread_traj_minus_pdollar095: spread(bySeed.map(r => r.traj_minus_pdollar095)),
      pdollar_010_wrong_per_seed: bySeed.map(r => r.pdollar_010_wrong),
      pdollar_010_wrong_seeds_over_2: bySeed.filter(r => r.pdollar_010_wrong > 2).length,
      traj_wrong_per_seed: bySeed.map(r => r.traj_wrong),
      runtime_wrong_per_seed: bySeed.map(r => r.runtime_wrong),
      // ⚠⚠ **두 물음을 가른다**(2차 리뷰어 [4]에 대한 답):
      //  ㉠ 「궤적이 $P보다 나은가」(머리끼리) — 씨마다 부호가 **바뀐다**. 결론이 안 선다.
      //  ㉡ 「사슬 안에서 궤적이 더 얹는 몫이 있는가」(한계) — 씨마다 거의 같다. 결론이 선다.
      head_to_head: {
        per_seed: bySeed.map(r => r.traj_minus_pdollar095),
        spread: spread(bySeed.map(r => r.traj_minus_pdollar095)),
        sign_flips: bySeed.filter(r => r.traj_minus_pdollar095 <= 0).length,
        verdict: '⚠⚠ **결론이 안 선다**(#14). 전량 12칸인데 씨별 폭이 8이고 **씨 하나에서는 부호가 뒤집힌다**. 「궤적이 $P보다 낫다」를 이 표본으로 주장하지 않는다.',
      },
      marginal_traj_given_pdollar: {
        per_seed: bySeed.map(r => r.traj_marginal_given_pdollar),
        spread: spread(bySeed.map(r => r.traj_marginal_given_pdollar)),
        total: bySeed.reduce((a, r) => a + r.traj_marginal_given_pdollar, 0),
        verdict: '**선다.** 씨마다 거의 같고 부호가 안 바뀐다 — 「사슬에 ③이 있으면 없을 때보다 낫다」는 이 표본에서 유효하다.',
      },
      marginal_pdollar_given_traj: {
        per_seed: bySeed.map(r => r.pdollar_marginal_given_traj),
        spread: spread(bySeed.map(r => r.pdollar_marginal_given_traj)),
        total: bySeed.reduce((a, r) => a + r.pdollar_marginal_given_traj, 0),
      },
    }
    for (const r of bySeed) console.log(`[35 씨 ${r.k}] 기준선 ${r.base} · 궤적 ${r.traj}(오답 ${r.traj_wrong}) · $P@.095 ${r.pdollar_095}(${r.pdollar_095_wrong}) · $P@.10 ${r.pdollar_010}(${r.pdollar_010_wrong}) · 런타임 ${r.runtime}(${r.runtime_wrong}) · 궤적−$P ${r.traj_minus_pdollar095}`)
    console.log(`[35 씨 변동폭] 궤적−$P@.095 씨별 ${JSON.stringify(bySeed.map(r => r.traj_minus_pdollar095))} → 폭 ${seedStats.spread_traj_minus_pdollar095}`)
    console.log(`[35 씨 변동폭] $P@0.10 오답 씨별 ${JSON.stringify(seedStats.pdollar_010_wrong_per_seed)} — 2를 넘는 씨 ${seedStats.pdollar_010_wrong_seeds_over_2}/5`)
    console.log(`[35 씨 · 한계 ③|④] ${JSON.stringify(seedStats.marginal_traj_given_pdollar.per_seed)} 합 ${seedStats.marginal_traj_given_pdollar.total} 폭 ${seedStats.marginal_traj_given_pdollar.spread}`)
    console.log(`[35 씨 · 한계 ④|③] ${JSON.stringify(seedStats.marginal_pdollar_given_traj.per_seed)} 합 ${seedStats.marginal_pdollar_given_traj.total} 폭 ${seedStats.marginal_pdollar_given_traj.spread}`)

    // ── [#11] **남은 여유로 정규화** — 원수 비교는 분모가 다르면 같은 양이 아니다 ────────
    // ⚠⚠ 2차 리뷰어 [5]: 표본 안은 남은 여유가 44뿐이었고 그것을 다 먹었다(44/44 = 100%).
    //   표본 밖은 여유 330 중 220(66.7%)이다. 원수로 「220 > 44」를 견주면 **분모 차 때문에
    //   통과가 예정돼 있다.** 두 자를 다 낸다 — 그리고 결론을 그 자에 맞춰 다시 적는다.
    const headroom = {
      note: '⚠ 원수 이득(220 vs 44)은 **분모가 다르다**(#11). 남은 여유 대비 몫을 함께 낸다 — 그 자로 보면 표본 «안»이 더 높다(100% vs 66.7%).',
      in_sample: { before: inB.ok, after: inA.ok, n: inB.n, headroom: inB.n - inB.ok, gain: inA.ok - inB.ok, filled: (inA.ok - inB.ok) / (inB.n - inB.ok) },
      held_out: { before: outB.ok, after: outA.ok, n: outB.n, headroom: outB.n - outB.ok, gain: outA.ok - outB.ok, filled: (outA.ok - outB.ok) / (outB.n - outB.ok) },
    }
    console.log(`[35 여유 대비] 표본 안 ${headroom.in_sample.gain}/${headroom.in_sample.headroom} = ${(headroom.in_sample.filled * 100).toFixed(1)}% · 표본 밖 ${headroom.held_out.gain}/${headroom.held_out.headroom} = ${(headroom.held_out.filled * 100).toFixed(1)}%`)

    // ── [6] `traj_no_merge`가 잃는 80칸이 어느 자형인가 ─────────────────────────
    const mergeDiff: Record<string, number> = {}
    for (const c of cells) {
      if (c.base) continue
      const a = c.traj.d <= TRAJ_ACCEPT && c.traj.ch === c.ch
      const b = c.trajNoMerge.d <= TRAJ_ACCEPT && c.trajNoMerge.ch === c.ch
      if (a !== b) mergeDiff[c.name] = (mergeDiff[c.name] ?? 0) + (a ? 1 : -1)
    }
    console.log(`[35 획 병합이 살리는 칸] ${JSON.stringify(mergeDiff)}`)

    // ── **둘은 서로를 못 덮는다** → 이어 붙이면 어떻게 되는가(2차원 훑기) ──────────
    // ⚠ 이 팔은 지시 35-1의 범위 밖에서 «더 좋은 것»을 찾으러 간 것이 아니라, 위 차이표가
    //   가리킨 자리다(A-3: 측정이 가리키는 방향을 따른다). 35-3의 세리프 「1」을 실제로
    //   살리는 것이 $P 쪽이므로, 그 둘을 **가르는 대신 잇는** 판을 재야 결론이 선다.
    const G2: number[] = []
    for (let t = 0.02; t <= 0.301; t += 0.01) G2.push(Math.round(t * 1000) / 1000)
    const seq = seqAt
    const seqNoise = (thT: number, thP: number) => Object.values(NOISE).filter(st => {
      const t = trajMatch(st)!
      if (t.d <= thT) return true
      const r = recognizeGlyphRaw(st)
      return !!r && r.d <= thP
    }).length
    let seqBest = { thT: 0, thP: 0, ok: B.ok, wrong: B.wrong, held_out: outB.ok }
    const seqLegal: { thT: number; thP: number; ok: number; wrong: number }[] = []
    for (const thT of G2) for (const thP of G2) {
      const t = score(cells, seq(thT, thP))
      if (t.wrong > B.wrong || seqNoise(thT, thP) > 0) continue
      seqLegal.push({ thT, thP, ok: t.ok, wrong: t.wrong })
      if (t.ok > seqBest.ok) seqBest = { thT, thP, ok: t.ok, wrong: t.wrong, held_out: split(cells, seq(thT, thP), false).ok }
    }
    console.log(`[35 이어 붙임] 궤적 th=${seqBest.thT} → $P th=${seqBest.thP} — 맞음 ${seqBest.ok} · 틀림 ${seqBest.wrong} · 표본밖 ${seqBest.held_out}/560 (합법 조합 ${seqLegal.length}개)`)
    const seqDiff = { vs_traj: seqBest.ok - tBest.ok, vs_pdollar: seqBest.ok - pBest.ok }
    console.log(`[35 이어 붙임 이득] 궤적만 대비 +${seqDiff.vs_traj} · $P만 대비 +${seqDiff.vs_pdollar}`)
    const seqSerif = score(cells.filter(c => c.name.includes('세리프')), seq(seqBest.thT, seqBest.thP))
    console.log(`[35-3 이어 붙임의 세리프1] ${seqSerif.ok}/${seqSerif.n} · 틀림 ${seqSerif.wrong}`)

    // ── **$P의 문턱을 «실린 값»으로 못 박고** 궤적 문턱만 훑는다 ────────────────
    // ⚠ 2차원 argmax는 이 표본에 대한 **맞춤**이다(합법 조합이 91개나 된다). $P의 문턱은
    //   web2-08이 **다른 표본으로** 이미 놓은 값 0.10(digits.REJECT)이 있으므로 그것을
    //   그대로 쓴다 — 그러면 이 회차가 새로 놓는 자유도는 **궤적 문턱 하나**뿐이다.
    const seq1d = GRID.map(thT => {
      const t = score(cells, seq(thT, PD_SHIPPED))
      return { thT, ok: t.ok, wrong: t.wrong, noise: seqNoise(thT, PD_SHIPPED), held_out: split(cells, seq(thT, PD_SHIPPED), false).ok }
    })
    const legal1d = seq1d.filter(r => r.wrong <= B.wrong && r.noise === 0)
    const best1d = legal1d.reduce((x, y) => (y.ok > x.ok ? y : x), legal1d[0]!)
    const plateau = legal1d.filter(r => r.ok === best1d.ok).map(r => r.thT)
    // 게이트의 도달 가능성 — **런타임 그대로의 축**(＄P는 실린 0.10 고정, 궤적 문턱만 움직인다)
    const REACH_TH = [0.11, 0.125, 0.13, 0.15, 0.20, 0.25]
    const reachRows = REACH_TH.map(t => {
      const r = score(cells, seqAt(t, PD_SHIPPED))
      return { th: t, ok: r.ok, wrong: r.wrong, noise: seqNoise(t, PD_SHIPPED) }
    })
    const reachWrong = reachRows.map(r => r.wrong)
    console.log(`[35 게이트 도달 · 런타임 축(④ 켠 채)] ${reachRows.map(r => `th=${r.th} ok ${r.ok} 오답 ${r.wrong} 잡음 ${r.noise}`).join(' | ')}`)
    console.log(`[35 실린 $P 문턱 고정(0.10) · 궤적만 훑기] 최선 thT=${best1d.thT} 맞음 ${best1d.ok} · 고원 ${plateau[0]}~${plateau[plateau.length - 1]} (${plateau.length}칸) · TRAJ_ACCEPT=${TRAJ_ACCEPT} 포함 ${plateau.includes(TRAJ_ACCEPT)}`)

    // ── 궤적이 **$P의 오답을 앞에서 걷어내는가** — 위 조합이 합법인 기제를 확인한다 ──
    // ($P 단독은 문턱 0.10에서 오답 3이라 불법이다. 이어 붙이면 2로 내려간다 — 왜인가.)
    const pAlone = score(cells, withPdollar(PD_SHIPPED))
    const prefiltered = cells.filter(c => {
      if (c.base) return false
      const pw = c.pdollar && c.pdollar.d <= PD_SHIPPED && c.pdollar.ch !== c.ch      // $P 단독이면 오답
      return pw && c.traj.d <= TRAJ_ACCEPT && c.traj.ch === c.ch                       // 궤적이 먼저 맞게 답한다
    })
    console.log(`[35 궤적의 선걸름] $P 단독(th=0.10) 틀림 ${pAlone.wrong} → 이어 붙이면 ${score(cells, seq(TRAJ_ACCEPT, PD_SHIPPED)).wrong} · 궤적이 앞에서 바로잡은 칸 ${prefiltered.length} ${JSON.stringify([...new Set(prefiltered.map(c => c.name + ' @ ' + c.box))])}`)

    // ══ 게이트 ═══════════════════════════════════════════════════════════════
    expect(A.ok, '맞음이 오른다').toBeGreaterThan(B.ok)
    expect(A.wrong, '⚠ 오답이 늘지 않는다 — 승인 층이 없고 첫 치수가 축척을 정한다(#61)').toBeLessThanOrEqual(B.wrong)
    expect(acceptedNoise, '비숫자가 숫자로 확정되지 않는다(불변식)').toBe(0)
    // ㉣ **표본 밖에서 오른다** — 이것이 없으면 「픽스처를 외웠다」와 구별이 안 된다
    expect(outA.ok, '표본 밖(원형에 없는 필체)에서 오른다 — 이 팔이 이 회차의 반증 조건이다')
      .toBeGreaterThan(outB.ok)
    // ⚠⚠ **원수 비교(220 > 44)를 걷었다** — 2차 리뷰어 [5]가 잡았다: 표본 안은 남은 여유가
    //    44뿐이라 그것을 다 먹어도 44이고, 표본 밖은 여유가 330이다. **분모가 다르면 같은
    //    양의 비교가 아니다**(#11) — 그 게이트는 통과가 예정돼 있었다.
    //    ⚠ 여유 대비로 다시 재면 **표본 «안»이 더 높다**(100% vs 66.7%). 그러므로
    //    「표본 밖이 더 올랐다」는 **주장하지 않는다.** 서는 주장은 이것뿐이다:
    //    **원형 표에 없는 필체에서도 큰 폭으로 오른다**(41.1% → 80.4%).
    expect(headroom.held_out.filled, '표본 밖(원형에 없는 필체)의 남은 여유를 절반 넘게 메운다')
      .toBeGreaterThan(0.5)
    expect(outA.ok / outB.n, '표본 밖 정답률이 8할을 넘는다').toBeGreaterThan(0.8)
    // ㉠ ⚠⚠ **머리끼리 견주는 주장은 «안 선다»** — 2차 리뷰어 [4]가 잡았고 씨 변동폭이 확인했다.
    //    전량으로는 궤적 707 > $P 695(12칸)이지만 **씨별로는 [-1, 0, 7, 4, 2]**로 폭이 8이고
    //    **씨 하나에서 부호가 뒤집힌다**(#14: 「씨 변동폭이 결론의 여유보다 크면 그 결론은 없다」).
    //    그래서 **그 12칸을 게이트로 걸지 않는다.** 대신 **씨마다 서는 것**만 건다:
    for (const r of bySeed) {
      expect(r.traj_marginal_given_pdollar,
        `씨 ${r.k}: $P(실린 문턱)가 이미 있어도 궤적이 더 얹는 몫이 있다 — 사슬 안의 한계 이득`)
        .toBeGreaterThan(0)
    }
    expect(seedStats.marginal_traj_given_pdollar.spread,
      '그 한계 이득은 씨 사이에서 거의 안 흔들린다(머리끼리 견주는 값과 다른 점)')
      .toBeLessThan(seedStats.head_to_head.spread)
    expect(A3.ok, '궤적 항을 끈 같은 구조보다 낫다(185칸 — 이쪽은 여유가 크다)').toBeGreaterThan(S.ok)
    // 궤적과 $P는 **서로를 못 덮는다** — 이어 붙이면 둘 다보다 낫다
    expect(A.ok, '네 시야가 세 시야보다 낫다($P가 세리프 1을 살린다)').toBeGreaterThan(A3.ok)
    expect(A.ok, '네 시야가 $P만 붙인 판보다 낫다').toBeGreaterThan(score(cells, withPdollar(PD_SHIPPED)).ok)
    // ⚠ **앞 거름의 효과**(PITFALLS #20) — $P 단독은 실린 문턱 0.10에서 오답 3이다.
    //    ⚠⚠ 이것을 「궤적의 값」으로 읽지 않는다: #20이 이름 붙인 「거름을 선택 전에 걸면
    //    경쟁자가 죽어 상대 순위가 거저 통과한다」가 바로 이 모양이다. 게다가 **씨별로는
    //    $P의 오답이 2를 넘는 씨가 하나도 없다**([0,0,1,0,2]) — 「불법」은 다섯 씨를 합쳤을
    //    때만 나오는 판정이다. 그래서 이 줄은 **사실의 기록**이지 채택 근거가 아니다.
    expect(pAlone.wrong, '$P만 실린 문턱으로 붙이면 전량 기준 오답이 는다(기록 — 씨별로는 안 넘는다)')
      .toBeGreaterThan(B.wrong)
    expect(prefiltered.length, '궤적이 앞에서 바로잡은 칸이 실제로 있다').toBeGreaterThan(0)
    // 반사실 — 궤적을 **판정자**로 두면 오답이 터진다(발화 조건이 임의가 아니다).
    // ⚠ 초판은 이것을 «맞음»으로 적었는데 **맞음은 오히려 는다**(585 > 506) — 주장이
    //   틀린 자리를 재고 있었다. 판정자는 오답이다(#61): 2 → 295.
    expect(F2.wrong, '궤적만으로 판정하면 오답이 폭발한다 — 그래서 판정자가 아니라 구제자다')
      .toBeGreaterThan(B.wrong * 10)
    // 문턱이 띠 안에 있다(고원의 가운데)
    expect(band.correct_worst_below_first_wrong).toBeLessThan(TRAJ_ACCEPT)
    expect(band.wrong_best).toBeGreaterThan(TRAJ_ACCEPT)
    expect(plateau.includes(TRAJ_ACCEPT), '채택 문턱이 고원 안이다($P 문턱은 실린 값 고정)').toBe(true)
    expect(new Set(sweep.map(s => s.ok)).size, '훑기가 값을 가른다(항등이 아니다)').toBeGreaterThan(3)

    // ══ 35-3 세리프 「1」의 뿌리 ═══════════════════════════════════════════════
    const serifCells = cells.filter(c => c.name.includes('세리프'))
    const serifB = score(serifCells, armBase), serifA = score(serifCells, armRuntime)
    const serifNoMerge = score(serifCells, withTraj(TRAJ_ACCEPT, 'trajNoMerge'))
    console.log(`[35-3 세리프1] 기준선 ${serifB.ok}/${serifB.n}(틀림 ${serifB.wrong}) → 궤적 ${serifA.ok}/${serifA.n}(틀림 ${serifA.wrong}) · 병합 없이 ${serifNoMerge.ok}`)
    // ① 획 수는 제대로 잡히는가 — 특징 추출이 도는지부터 본다(D-1: 표식 먼저)
    const nOf = (name: string) => {
      const f = FORMS.find(x => x.name === name)!
      const g = glyphAt(f.strokes, 100, 100, 22, 34, 31, 0)
      return trajFeat(g)!.n
    }
    const counts = {
      '1·수직선만 (현행 템플릿)': nOf('1·수직선만 (현행 템플릿)'),
      '1·위 세리프 (1획 꺾임)': nOf('1·위 세리프 (1획 꺾임)'),
      '1·위 세리프 + 밑줄 (2획)': nOf('1·위 세리프 + 밑줄 (2획)'),
      '7·가로줄 없음 (현행 템플릿)': nOf('7·가로줄 없음 (현행 템플릿)'),
    }
    console.log(`[35-3 획 수] ${JSON.stringify(counts)}`)
    expect(counts['1·위 세리프 + 밑줄 (2획)'], '밑줄 있는 1은 2획으로 잡힌다').toBe(2)
    expect(counts['1·위 세리프 (1획 꺾임)'], '깃발만 있는 1은 1획이다').toBe(1)
    // ② 방향 전환은 잡히는가 — 깃발이 «꺾임 하나»로 나와야 한다
    const turnsOf = (name: string) => {
      const f = FORMS.find(x => x.name === name)!
      return trajFeat(glyphAt(f.strokes, 100, 100, 22, 34, 31, 0))!.turns.length
    }
    const turns = {
      '1·수직선만': turnsOf('1·수직선만 (현행 템플릿)'),
      '1·위 세리프': turnsOf('1·위 세리프 (1획 꺾임)'),
    }
    console.log(`[35-3 방향 전환 개수] ${JSON.stringify(turns)}`)
    expect(turns['1·위 세리프'], '깃발이 방향 전환으로 잡힌다 — 추출이 도는 증거').toBeGreaterThan(turns['1·수직선만'])
    // ③ **추출인가 원형 표인가** — 시험 안에서만 세리프 원형을 세워 거리를 잰다.
    //    (런타임은 안 바꾼다. 바꾸면 평가 픽스처를 외우는 것이다 — ㉣의 그 이유.)
    const serifProtoStrokes: Pt[][] = [[{ x: .2, y: .22 }, { x: .5, y: 0 }, { x: .5, y: 1 }]]
    const serifProto = trajFeat(serifProtoStrokes)!
    const f1 = FORMS.find(x => x.name === '1·위 세리프 (1획 꺾임)')!
    const probe = glyphAt(f1.strokes, 100, 100, 34, 34, 31, 1.0)
    const dToSerifProto = trajDist(trajFeat(probe)!, serifProto, FULL)
    const dToShipped = trajMatch(probe)!
    console.log(`[35-3 뿌리] 세리프 원형을 세우면 d=${dToSerifProto.toFixed(3)} (문턱 ${TRAJ_ACCEPT}) · 실린 표로는 ${dToShipped.ch} d=${dToShipped.d.toFixed(3)}`)
    expect(dToSerifProto, '⚠⚠ 세리프 원형이 있으면 문턱 안이다 — 못 살린 것은 **추출**이 아니라 **원형 표의 덮개**다')
      .toBeLessThan(TRAJ_ACCEPT)
    expect(dToShipped.d, '실린 원형 표로는 문턱 밖이다(같은 글리프)').toBeGreaterThan(TRAJ_ACCEPT)

    // ── 원장 ────────────────────────────────────────────────────────────────
    if (process.env.LEDGER === '1') {
      const out = resolve(__dirname, '../../stage0/out/glyph35_web2.json')
      mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
      writeFileSync(out, JSON.stringify({
        what: 'web2-35 — 손글씨 인식에 **궤적**을 더한다. 32-4와 같은 표본(glyphforms 11자형 × 4상자 × 4흔들기 × 5씨 = 880칸)·같은 하네스.',
        headline: '⚠⚠ **506 → 770을 «궤적의 승리»로 읽지 마라.** 이 회차의 실제 결론은 셋이다: ① 32-4 원장이 낸 실패 구조가 «틀림 2 · 거부 372»였으므로 할 일은 재순위가 아니라 **거부 되살리기**였고, ② 그 자리에 **어떤 대조기든** 하나 붙이면 506 → 695($P) / 707(궤적)로 오른다 — 즉 **오른 것의 대부분(+189)은 «궤적»이 아니라 «시야를 하나 더 둔 것»**이고 궤적과 $P의 차는 **12칸(1.4%p)**뿐이다. 이는 32-4의 정규화 이득 +1.7%p와 같은 크기다. ③ 다만 둘은 **서로 다른 자형을 살린다**(궤적=「4」의 닫힌 자형 50칸 · $P=세리프 「1」 38칸)이므로 이어 붙이면 770이 되고, 그 조합이 채택된 판이다. decomposition이 정본이다.',
        bias: '⚠⚠ **합성 표본이다.** 자형 하나를 흔들어 스무 번 낸 것이고 사람이 실제로 쓴 획이 아니다. 이 수치는 **어느 축이 약한지**를 가리키는 데까지만 쓴다 — 인식률 자체를 결론으로 쓰지 않는다. 진짜 값은 실기기이고 사용자가 자기 글씨로 열 개를 센다(DEVICE-CHECK).',
        canonical_command: 'LEDGER=1 npx vitest run test/glyph35.test.ts',
        design: {
          where: '궤적은 모형 **밖**의 세 번째 시야다. digitnet은 MNIST(스캔 이미지) 래스터 MLP이고 MNIST에는 궤적 표본이 없다 — 모형 안에 못 넣는다(web2-32 원장 trajectory_not_added).',
          fires_when: '래스터 두 시야가 **둘 다 거부**한 글리프에서만. 그러므로 궤적이 맞던 답을 뒤집는 길이 없고, 이 계층이 만들 수 있는 해악은 «거부 → 오답» 하나뿐이다.',
          why_not_judge: '실측이 그렇게 못 박았다 — 래스터가 **맞게 수용한** 칸에서 궤적은 자주 다른 답을 낸다(traj_on_accepted). 원형 표가 자리마다 필체 하나뿐이라 그렇다. 반사실 팔(arm_traj_first / arm_traj_only)이 그 대가를 낸다.',
          features: '지시 35-1의 여섯 — 시작/끝 방향 · 방향 전환(개수·자리) · 획 순서 · 획 수 · 붓 뗀 자리 · 공중 경로. 더한 둘: 방향 히스토그램(8방위 길이가중) · 되짚기(같은 자리를 다시 지나는 몫 — 래스터에서 정보가 통째로 사라지는 몸짓).',
          proto_source: '⚠⚠ **원형은 `digits.ts`의 GLYPHS다 — web2-08이 적은 $P 템플릿 표이고 이 회차가 만든 것이 아니다.** 평가 픽스처를 보고 원형을 지으면 「궤적이 올렸다」가 아니라 「픽스처를 외웠다」가 된다. 그래서 표를 in_sample/held_out으로 가른다.',
        },
        gate: {
          for: 'web2-35 — 궤적을 더한 뒤에도 **오답이 안 늘고 잡음 수용이 0**이며, 이득이 **원형 표를 외운 몫이 아닌** 자형에서 나온다',
          registered: ['틀림 ≤ 2(기준선과 같다)', '잡음 8종 수용 0', '표본 밖 이득 > 표본 안 이득', '채택 문턱이 고원 안'],
          reachability: '**궤적 문턱을 올리면 넘는다.** $P를 실린 0.10에 고정하고 궤적 문턱만 0.11 → 0.125 → 0.13 → 0.15 → 0.20 → 0.25로 올리면 오답이 2 → 3 → 5 → 24 → 72 → 148로 오른다(0.20부터 잡음 수용도 시작된다). 그리고 **궤적 시야를 빼면** $P가 실린 문턱에서 오답 3을 내어 그것만으로 기준을 넘는다(traj_prefilters_p_dollar).',
          reachability_source: 'gate/reachability_wrong_by_traj_threshold',
          reachability_value: reachWrong,
          reachability_wrong_by_traj_threshold: reachWrong,
          reachability_thresholds: REACH_TH,
          reachability_rows: reachRows,
          reachability_note: '⚠ **이 게이트는 실제로 실패시킬 수 있다**(D-3). **런타임 축**에서 잰다(④ $P를 실린 0.10으로 켠 채 궤적 문턱만 올린다 — `reachability_rows`가 `ok`까지 낸다): 채택값 0.11에서 오답 2이고 0.125부터 오른다. ⚠⚠ **2차 리뷰어 [12] 정정**: 초판은 이 좁은 띠(0.026)를 「「오답 ≤ 2」의 폭」이라고 적었는데 **틀렸다** — 「오답 ≤ 2」 자체는 0.02~0.12의 넓은 구간에서 성립한다(폭 ≈ 0.10). 0.026은 **「맞는 구제의 최악 거리 0.098」과 「첫 오답 0.124」 사이**, 곧 «맞음이 최대이면서 오답이 안 느는» 띠다. 두 문장은 다른 말이다.',
        },
        constants: { TRAJ_ACCEPT, NET_REJECT, NET_RESCUE, DIGIT_NORM_ALPHA: C.DIGIT_NORM_ALPHA, DIGIT_ASPECT_FLOOR: C.DIGIT_ASPECT_FLOOR, protos: PROTOS.length },
        totals: {
          baseline_raster_two_views: { ok: B.ok, wrong: B.wrong, reject: B.rej, n: B.n },
          with_trajectory_three_views: { ok: A3.ok, wrong: A3.wrong, reject: A3.rej, n: A3.n },
          runtime_four_views: { ok: A.ok, wrong: A.wrong, reject: A.rej, n: A.n, wrong_of_accepted: [A.wrong, A.ok + A.wrong] },
        },
        decomposition: {
          note: '⚠⚠ **이 표가 결론이다. 770을 «궤적의 승리»로 읽지 마라.**',
          '0_baseline_raster_x2': B.ok,
          '1_plus_p_dollar_only': P.ok,
          '2_plus_traj_only': A3.ok,
          '3_plus_both (런타임)': A.ok,
          '1b_plus_p_dollar_at_shipped_0.10': score(cells, withPdollar(PD_SHIPPED)).ok,
          '1b_wrong': score(cells, withPdollar(PD_SHIPPED)).wrong,
          'third_view_at_all (0→1)': P.ok - B.ok,
          'traj_over_p_dollar (머리끼리 · 1→2 대신)': A3.ok - P.ok,
          'traj_marginal_given_p_dollar_at_0.095 (1→3)': A.ok - P.ok,
          'traj_marginal_given_p_dollar_at_shipped_0.10 (1b→3)': A.ok - score(cells, withPdollar(PD_SHIPPED)).ok,
          'p_dollar_marginal_given_traj (2→3)': A.ok - A3.ok,
          note2: '⚠⚠ 2차 리뷰어 [3]: `traj_marginal_given_p_dollar` 75는 **$P 문턱을 0.095 → 0.10으로 옮긴 몫까지 포함**한 값이다. $P를 실린 0.10에 고정하고 ③만 더한 한계 이득은 **45**다 — 그쪽이 「궤적이 더 얹는 몫」의 정직한 수이고, 씨 변동폭도 그쪽에서만 선다(seed_variance).',
        },
        four_all_forms: { before: fourB, after: fourA, n: 320, note: '지시 35-2가 못 박은 기준선 77/320과 같은 분모다(32-4 원장 by_form.four_all_forms).' },
        held_out_split: {
          note: '표본 안 = 자형의 획이 원형 표(GLYPHS)와 **좌표로 같은** 것. 이름이 아니라 JSON 비교로 판정한다.',
          in_sample_forms: inForms,
          in_sample: { before: inB, after: inA },
          held_out: { before: outB, after: outA },
          gain_in_sample: inA.ok - inB.ok,
          gain_held_out: outA.ok - outB.ok,
        },
        arms: {
          note: '⚠⚠ **거리의 자가 팔마다 다르므로 한 문턱으로 나란히 세우지 않는다**(#76 ㉣). 팔마다 문턱을 0.02~0.30으로 훑고 **불변식(오답 ≤ 기준선 2 · 잡음 수용 0)을 지키는 최대 맞음**을 그 팔의 값으로 쓴다. curve가 그 훑기 전량이다.',
          rows: arms,
        },
        trajectory_alone: {
          note: '⚠⚠ **이 회차의 결론이 나오는 자리다.** vs_p_dollar가 0 이하면 「올린 것은 궤적이 아니라 «세 번째 대조기를 붙인 것»」이다 — 32-4의 오진과 같은 형태이고, 그 형태를 잡으려고 이 팔을 세웠다.',
          vs_baseline: T.ok - B.ok, vs_p_dollar: T.ok - P.ok, vs_shape_only: T.ok - S.ok,
        },
        arm_traj_first: { note: '반사실 — 궤적이 래스터를 뒤집게 두면', ok: F.ok, wrong: F.wrong },
        arm_traj_only: { note: '반사실 — 궤적만으로 판정하면', ok: F2.ok, wrong: F2.wrong },
        by_ratio: { before: rB, after: rA, max_gap_before: maxGap(rB), max_gap_after: maxGap(rA) },
        by_form: { before: fB, after: fA },
        gain_concentration: {
          note: '⚠ 32-4에서 2차 리뷰어가 잡은 자리다 — **먼저 확인해서 적는다**. 아래 오른 칸 목록이 정본이고, totals·by_ratio·by_form의 개선은 서로 독립한 증거가 아니라 **같은 칸들의 다른 표기**다.',
          gained_cells: delta.length, gained_forms: gainedForms, cells: delta,
        },
        arm_sequential_traj_then_p_dollar: {
          note: '⚠ **차이표가 가리켜서 잰 팔이다**(A-3). 궤적과 $P는 서로를 못 덮는다 — 궤적은 「4」의 닫힌 자형을, $P는 세리프 「1」을 살린다. 이어 붙이고 두 문턱을 2차원으로 훑어 **불변식을 지키는 최대**를 낸다.',
          best: seqBest, gain_over_traj_only: seqDiff.vs_traj, gain_over_p_dollar_only: seqDiff.vs_pdollar,
          serif_1: { ok: seqSerif.ok, wrong: seqSerif.wrong, n: seqSerif.n },
          legal_combinations: seqLegal.length,
          shipped_p_threshold_arm: {
            note: '⚠⚠ **채택은 이쪽이다.** 2차원 argmax는 합법 조합이 91개나 되는 맞춤이므로, $P의 문턱은 web2-08이 **다른 표본으로** 놓은 실린 값 0.10(digits.REJECT)에 못 박고 **궤적 문턱 하나만** 훑었다. 이 회차가 새로 놓는 자유도는 그 하나뿐이다.',
            p_threshold: PD_SHIPPED, best: best1d, plateau_traj_threshold: [plateau[0], plateau[plateau.length - 1]], plateau_cells: plateau.length,
            adopted_traj_threshold: TRAJ_ACCEPT, adopted_is_in_plateau: plateau.includes(TRAJ_ACCEPT),
          },
          traj_prefilters_p_dollar: {
            note: '$P 단독은 문턱 0.10에서 오답 3이라 **불법**이다. 이어 붙이면 2로 내려간다 — 궤적이 그 칸을 **앞에서 맞게 답해** $P가 그것을 보지 못하기 때문이다. 이것이 궤적의 값이 «맞음 +12»만이 아닌 자리다.',
            p_alone_wrong: pAlone.wrong, sequential_wrong: score(cells, seq(TRAJ_ACCEPT, PD_SHIPPED)).wrong,
            corrected_cells: prefiltered.length, where: [...new Set(prefiltered.map(c => c.name + ' @ ' + c.box))],
          },
        },
        traj_vs_p_dollar_by_form: {
          note: '⚠⚠ **동작점을 맞춰 다시 냈다**(2차 리뷰어 [1][2][3] — 이 회차가 세운 #82 ㉡의 재발). 초판은 $P를 **제 최선 문턱 0.095**로 둔 표를 만들고 그것을 **런타임($P 0.10)**의 총계 770 옆에 세워 「770의 근거」로 썼다. 두 표의 자가 달랐다: 0.095 표가 「둘 다 못 살린다」로 적은 25칸을 런타임은 실제로 살린다. **인용은 `at_runtime`으로 한다.**',
          at_runtime: { p_threshold: PD_SHIPPED, sum: diffRuntime.sum, rows: diffRuntime.rows },
          at_p_dollar_best: { p_threshold: pBest.th, sum: diffPBest.sum, rows: diffPBest.rows, note: '초판이 쓰던 자. 대조용으로 남긴다 — 지우면 정정이 안 보인다.' },
          reconciles: '런타임 구제 수 = 45 + 63 + 156 = 264 = 770 − 506 ✔ · 합 = 372 = 기준선 거부 수 ✔ (초판 표는 239만 설명해 25칸이 떠 있었다).',
        },
        seed_variance: seedStats,
        headroom_normalized: headroom,
        stroke_merge_by_form: { note: '`mergeTolerant`(획 병합)를 끄면 잃는 칸이 어느 자형인가 — 2차 리뷰어 [6]이 물은 자리다.', rows: mergeDiff },
        traj_on_accepted: onAccepted,
        distance_band: band,
        sweep_threshold: sweep,
        noise_8: { accepted_by_app: acceptedNoise, rows: noise },
        serif_1_root: {
          question: '35-3 — 세리프 1이 안 오르면 왜인가. 「획 수가 다르므로 궤적으로 갈려야 정상이다. 안 갈리면 추출을 의심하라」',
          baseline: { ok: serifB.ok, wrong: serifB.wrong, n: serifB.n },
          with_traj: { ok: serifA.ok, wrong: serifA.wrong, n: serifA.n },
          with_traj_no_merge: serifNoMerge.ok,
          stroke_counts: counts,
          turns: turns,
          verdict: '**추출은 돈다.** 획 수가 1/2로 정확히 갈리고 깃발이 방향 전환으로 잡힌다. 그리고 시험 안에서 세리프 원형을 세우면 거리가 문턱 **안**으로 들어온다(d_to_serif_proto). 못 살린 원인은 **원형 표의 덮개**다 — 실린 표는 자리마다 필체가 하나이고 「1」의 그 하나가 «맨 세로선»이다. 세리프 1은 그것과 궤적이 다른 글자이고, 그것이 정상이다.',
          d_to_serif_proto: dToSerifProto,
          d_to_shipped_table: { ch: dToShipped.ch, d: dToShipped.d },
          why_not_fixed_here: '⚠⚠ 세리프 원형을 **런타임에 넣지 않았다**. 넣으면 이 원장의 평가 픽스처를 외우는 것이 되어 held_out 팔이 무의미해진다(같은 회차에서 원형을 짓고 그 원형으로 채점할 수 없다). 원형 표를 넓히는 것은 **표본이 다른 회차**의 일이다 — DEFERRED.',
        },
        selfcheck_flags_known: {
          constants_snapshot_absent: '⚠ `constantsSnapshot()` / `metric_defs` 스냅샷이 없다 — **web2 라인 전체의 구멍**이고 이 원장만의 것이 아니다(같은 표본의 `glyph32_web2.json`도 같은 플래그를 낸다). 그 기계는 `web/test/constants.ts`에만 있고 web2에는 대응물이 없다. 이 회차는 상수를 `constants` 블록에 그대로 적는 것까지만 한다 — 기계를 세우는 것은 web2 전역 작업이라 **DEFERRED**이고, 병렬 세션이 같은 파일을 만지는 동안 혼자 세우지 않는다.',
          dead_pitfall_reference_76: '⚠ selfcheck가 「#76은 PITFALLS에 없는 번호」로 잡는다. **번호가 틀린 것이 아니라 제목 줄의 형식이 등록부를 벗어난 것**이다 — #76·#77은 `## #76 — …`인데 등록부가 읽는 형식은 `### #76.` 또는 `76. **…`이다(selfcheck의 그 자리 주석이 「고칠 곳은 검사가 아니라 기록하는 쪽」이라고 못 박아 두었다). `glyph32_web2.json`이 #77로 같은 플래그를 이미 내고 있다. **고치는 자리는 PITFALLS.md의 그 두 줄**이고, 병렬 세션이 그 파일을 동시에 만지므로 **이 갈래에서 기존 줄을 다시 쓰지 않았다** — 사람이 병합할 때 두 줄을 `### #76.` / `### #77.`로 바꾸면 둘 다 사라진다.',
        },
        flags_explained: {
          '「4」 세 자형이 0/80·0/80 같은 한 값이었다': '**측정이다**(§5 «의심≠오류»). 32-4 원장의 per_form_box가 그 자리이고, 880칸 중 **틀림이 2**뿐이고 **거부가 372**였다 — 클래스끼리 헷갈리는 자리가 사실상 없고 실패가 전부 «거부»였다. 이 회차의 설계(궤적을 판정자가 아니라 구제자로 둔다)가 그 구조에서 나왔다.',
          '이득이 「4」에 몰린다': '**그대로 적는다** — gain_concentration이 정본이다. 세리프 「1」은 안 올랐고 그 이유는 serif_1_root에 있다. 「궤적을 넣으면 전반이 오른다」가 아니라 「궤적은 **획 수·되짚기가 원형과 통하는 필체**를 살린다」가 이 표의 결론이다.',
          '표본 안 자형의 이득': '원형 표와 **같은 획**이므로 그 칸의 이득은 «외운 몫»이다. 그래서 held_out_split을 따로 낸다 — 인용은 gain_held_out으로 한다.',
          'after 표에 20/20이 많아졌다(단일 범주 분포 플래그)': '**측정이다.** before에서 0/20·?20이던 칸이 20/20이 된 것이고, 그 «갈리지 않음»이 결론의 절반이다. 분해능이 서 있다는 증거는 같은 표 안에 **안 오른 칸이 그대로 남아 있는 것**이다 — 4·열린·1획 38/80 · 세리프1 @28x34 1/20 · 세리프1 전체 92/160.',
          'held_out_split.in_sample.*.wrong = 0(카운터 0)': '**측정이다.** 표본 안 넷(현행 템플릿 자형)은 전·후 모두 오답이 하나도 없다 — 880칸의 오답 2는 **둘 다 세리프 「1」**이고 그 자형은 표본 밖이다(sweep의 wrong_partners가 1→7 하나 · 1→2 하나로 낸다).',
          'gain_concentration.cells[*].before = 0': '**측정이다.** 「4·닫힌·1획(되짚어 내려긋기)」은 네 상자 전부에서 **0/20**이었다(32-4 원장 per_form_box.after의 그 행). 래스터가 그 자형을 한 번도 못 읽었다는 뜻이고, 궤적이 그것을 80/80으로 올린 것이 이 회차에서 가장 큰 한 칸이다.',
          'traj_on_accepted의 agree = 0(세 자형)': '⚠⚠ **측정이고, 설계의 근거다.** 래스터가 **맞게 수용한** 칸에서 궤적이 **한 번도 같은 답을 안 낸다**(7·가로줄 있음 0/80 · 4·열린·1획 0/38 · 세리프1+밑줄 0/22). 원형 표가 자리마다 필체 하나뿐이라 그렇다. 그래서 궤적을 **판정자로 두지 않았고**, 두면 어떻게 되는지는 arm_traj_only가 낸다(오답 2 → 295).',
        },
        per_form_box: { before: cB, after: cA },
      }, null, 2))
      console.log(`[35] 원장 → ${out}`)
    } else {
      console.log('[35] 원장은 LEDGER=1에서만 쓴다 — 팔은 그대로 돌았다')
    }
  })
})
