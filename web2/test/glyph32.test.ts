// web2-32 4번 — **인식기가 정규화를 안 한다**(30-8이 정정한 후보)의 게이트.
//
// ⚠⚠ **지시의 후보가 이미 정정됐다**(D-4): 지시문 32-4는 「궤적으로 바꾼다」였는데,
//   web2-30의 8번이 같은 표본에서 **가로세로비**를 가장 큰 축으로 냈다 —
//   비 0.65에서 6/20 ↔ 비 1.00에서 18/20(`glyph30_web2.json`). 세션 지시가 그 정정을
//   못 박았고 순서를 정했다: **① 정규화 먼저 재고 ② 그 다음에 궤적.**
//
// ⚠ **D-3(반증 조건)** — 이 파일이 지키는 것 다섯:
//   ㉠ **정규화만** 넣고 먼저 잰다(궤적과 같이 넣으면 어느 쪽이 올렸는지 못 가른다)
//   ㉡ 비를 **세 버킷 전부** 낸다(좁혀진 한 쌍만 고르지 않는다 — 1차 리뷰어 지적)
//   ㉢ 표를 **정규화 전 / 후**로 각각 내고 **오답 상대까지** 낸다(맞음만 보면 «전과 같다»가
//      거짓말이 된다 — 세리프 1이 그 자리였다: 맞음은 같은데 **거부가 오답으로 바뀌었다**)
//   ㉣ 비를 **통째로 버리면 무너진다**(alpha=1)를 **같은 두 겹 구조**에서 잰다(위약 팔 —
//      구조를 함께 바꾸면 「비 때문」과 「두 겹 때문」이 안 갈린다)
//   ㉤ 규칙·문턱을 **훑는다**(#12·#13) — 값 하나로 결론을 만들지 않는다
//
// ⚠⚠ **비용 비대칭이 이 회차의 판정자다**(#61): 32-2가 승인 층을 걷었으므로 오답은
//   **조용히 실린다**. 게다가 첫 치수는 **축척**을 정한다 — 「1」을 「7」로 읽으면 문서 전체가
//   7배로 선다. 그래서 여기서 고르는 것은 «맞음 최대»가 아니라 **«오답을 안 늘리는 규칙»**이다.
//
// ⚠ 헤드리스의 「손글씨」는 합성이다. **어느 축이 약한지**를 가리키는 데까지만 쓴다.

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyGlyph } from '../src/core/digitnet'
import { NET_REJECT, NET_RESCUE, classifyGlyphNorm } from '../src/core/handwriting'
import { C } from '../src/core/constants'
import { glyphAt, BOXES, JIT, FORMS } from './glyphforms'
import type { Pt } from '../src/core/vec'

/** 비숫자 8종 — `digitnet.test.ts`의 그 표본이다(불변식 「잡음 수용 0」의 자리). */
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

type Ans = { ch: string; p: number } | null
type Judge = (g: Pt[][]) => Ans

/** 정규화 **전** — web2-31까지의 런타임(비 보존 시야 하나) */
const before: Judge = g => { const r = classifyGlyph(g, 0); return r && r.p >= NET_REJECT ? r : null }

/** 규칙 하나를 만든다 — 훑기가 같은 함수를 돈다(#54).
 *  `agree`가 참이면 **편 시야는 «못 읽은 것»만 구제한다**(비 보존 시야가 다른 숫자를
 *  내놓았으면 뒤집지 않는다). 거짓이면 확신만 보고 구제한다. */
const rule = (alpha: number, th: number, agree: boolean): Judge => g => {
  const a = classifyGlyph(g, 0)
  if (a && a.p >= NET_REJECT) return a
  const b = classifyGlyph(g, alpha)
  if (!b || b.p < th) return null
  if (agree && a && a.ch !== b.ch) return null
  return b
}

/** 정규화 **후** — web2-32까지의 런타임.
 *  ⚠ **web2-35에서 이 문장이 낡았다**: 런타임은 이제 `readGlyph`(네 시야 — 래스터 둘 +
 *  궤적 + $P)이고 `classifyGlyphNorm`은 그중 **래스터 두 시야**다. 이 파일은 그대로 두어
 *  **32-4가 잰 것(가로세로비 정규화)의 회귀 팔**로 남는다 — 값도 그대로여야 한다.
 *  네 시야의 게이트는 `glyph35.test.ts`이고 원장은 `glyph35_web2.json`이다. */
const after: Judge = g => { const r = classifyGlyphNorm(g); return r && r.p >= NET_REJECT ? r : null }

function table(judge: Judge) {
  const rows: { ch: string; name: string; box: string; correct: number; total: number; got: Record<string, number> }[] = []
  let ok = 0, wrong = 0, rej = 0, n = 0
  for (const f of FORMS) for (const b of BOXES) {
    let correct = 0
    const got: Record<string, number> = {}
    for (const jit of JIT) for (let k = 0; k < 5; k++) {
      const g = glyphAt(f.strokes, 100, 100, b.w, b.h, 31 + k * 613, jit)
      const r = judge(g)
      n++
      got[r === null ? '?' : r.ch] = (got[r === null ? '?' : r.ch] ?? 0) + 1
      if (r === null) rej++
      else if (r.ch === f.ch) { ok++; correct++ }
      else wrong++
    }
    rows.push({ ch: f.ch, name: f.name, box: b.name, correct, total: JIT.length * 5, got })
  }
  return { rows, ok, wrong, rej, n }
}

/** 자형 하나의 **오답 상대** — 「맞음이 같다」가 「아무것도 안 변했다」가 아님을 드러낸다 */
const wrongOf = (rows: ReturnType<typeof table>['rows'], match: (r: { name: string }) => boolean, ch: string) =>
  rows.filter(match).reduce((n, r) => n + Object.entries(r.got)
    .filter(([k]) => k !== '?' && k !== ch).reduce((m, [, v]) => m + v, 0), 0)

/** 비별 합계 — **세 버킷 전부**. 22x34와 44x68은 둘 다 비 0.65라 한 칸에 든다 */
function byRatio(rows: ReturnType<typeof table>['rows']) {
  const m: Record<string, { hit: number; n: number }> = {}
  for (const r of rows) {
    const k = (r.box.match(/비 ([0-9.]+)/) ?? [])[1] ?? '?'
    const e = (m[k] ??= { hit: 0, n: 0 })
    e.hit += r.correct; e.n += r.total
  }
  return m
}
const rate = (e: { hit: number; n: number }) => e.hit / e.n
const maxGap = (m: Record<string, { hit: number; n: number }>) => {
  const v = Object.values(m).map(rate)
  return Math.max(...v) - Math.min(...v)
}

describe('32-4 정규화 — 전/후를 같은 표본에서 나란히 낸다', () => {
  it('맞음이 오르고 **오답이 안 늘고** 잡음 수용이 0으로 남는다 (+규칙·문턱 훑기)', () => {
    const B = table(before), A = table(after)
    const rB = byRatio(B.rows), rA = byRatio(A.rows)
    console.log(`[32-4 전] 맞음 ${B.ok}/${B.n} · 틀림 ${B.wrong} · 거부 ${B.rej} — 수용 중 틀림 ${B.wrong}/${B.ok + B.wrong}`)
    console.log(`[32-4 후] 맞음 ${A.ok}/${A.n} · 틀림 ${A.wrong} · 거부 ${A.rej} — 수용 중 틀림 ${A.wrong}/${A.ok + A.wrong}`)
    for (const k of Object.keys(rB).sort()) console.log(`[32-4 비 ${k}] 전 ${rB[k]!.hit}/${rB[k]!.n} → 후 ${rA[k]!.hit}/${rA[k]!.n}`)
    console.log(`[32-4 비 최대격차] 전 ${(maxGap(rB) * 100).toFixed(1)}%p → 후 ${(maxGap(rA) * 100).toFixed(1)}%p`)

    // ── ㉢ **오답 상대**까지 본다 — 「맞음이 같다」는 「안 변했다」가 아니다 ──────────
    const serif = (r: { name: string }) => r.name.includes('세리프')
    const serifB = { ok: B.rows.filter(serif).reduce((n, r) => n + r.correct, 0), wrong: wrongOf(B.rows, serif, '1') }
    const serifA = { ok: A.rows.filter(serif).reduce((n, r) => n + r.correct, 0), wrong: wrongOf(A.rows, serif, '1') }
    const fourB = B.rows.filter(r => r.ch === '4').reduce((n, r) => n + r.correct, 0)
    const fourA = A.rows.filter(r => r.ch === '4').reduce((n, r) => n + r.correct, 0)
    console.log(`[32-4 세리프1] 맞음 ${serifB.ok} → ${serifA.ok} · **오답 ${serifB.wrong} → ${serifA.wrong}**`)
    console.log(`[32-4 「4」] 맞음 ${fourB} → ${fourA} (분모 320)`)

    // 게이트 — 맞음은 오르고 **오답은 안 는다**(#61: 조용한 오답이 비싼 쪽이다)
    expect(A.ok, '맞음이 오른다').toBeGreaterThan(B.ok)
    expect(A.wrong, '오답이 늘지 않는다 — 승인 층이 없으므로 오답은 조용히 실린다').toBeLessThanOrEqual(B.wrong)
    expect(serifA.wrong, '세리프 1의 오답이 늘지 않는다').toBeLessThanOrEqual(serifB.wrong)
    expect(fourA, '「4」가 오른다 — 사용자가 겪은 자리다').toBeGreaterThan(fourB)
    expect(maxGap(rA), '비 버킷 사이의 **최대** 격차가 좁혀진다').toBeLessThan(maxGap(rB))

    // ── ㉣ **위약 팔** — 같은 두 겹 구조에서 구제 시야만 alpha=1로 둔다 ──────────
    // (구조까지 바꾼 「편 시야 하나」와 갈라 본다: 무너짐이 «비를 버려서»인지 «두 겹을
    //  버려서»인지 그러지 않으면 안 갈린다.)
    const P = table(rule(1, NET_RESCUE, true))
    const F = table(g => { const r = classifyGlyph(g, 1); return r && r.p >= NET_REJECT ? r : null })
    console.log(`[32-4 ㉣ 위약(두 겹 · 구제 alpha=1)] 맞음 ${P.ok}/${P.n} · 틀림 ${P.wrong}`)
    console.log(`[32-4 ㉣ 편 시야 하나(alpha=1)] 맞음 ${F.ok}/${F.n} · 틀림 ${F.wrong}`)
    expect(P.ok, '두 겹을 유지해도 비를 버리면 지금보다 못하다').toBeLessThan(A.ok)
    expect(F.ok, '구조까지 버리면 종전보다도 못하다').toBeLessThan(B.ok)

    // ── **구제의 분모**(#16 · 2차 리뷰어 지적) — 「오답을 안 늘렸다」는 몇 번 발화한 값인가 ──
    // 그리고 **어느 자형이 올랐는가** — 전체 수는 그 분해를 가린다(30-8의 교훈 그대로).
    const fired = { n: 0, ok: 0 }
    const delta: { name: string; box: string; before: number; after: number }[] = []
    for (const f of FORMS) for (const b of BOXES) {
      for (const jit of JIT) for (let k = 0; k < 5; k++) {
        const g = glyphAt(f.strokes, 100, 100, b.w, b.h, 31 + k * 613, jit)
        const a0 = classifyGlyph(g, 0)
        if (a0 && a0.p >= NET_REJECT) continue          // 비 보존 시야가 답했다 — 구제가 안 돈다
        const r = after(g)
        if (r) { fired.n++; if (r.ch === f.ch) fired.ok++ }
      }
    }
    for (let i = 0; i < A.rows.length; i++) {
      if (A.rows[i]!.correct !== B.rows[i]!.correct) {
        delta.push({ name: A.rows[i]!.name, box: A.rows[i]!.box, before: B.rows[i]!.correct, after: A.rows[i]!.correct })
      }
    }
    console.log(`[32-4 구제] 발화 ${fired.n} · 적중 ${fired.ok} · 오른 칸 ${delta.length}개(${[...new Set(delta.map(d => d.name))].length}자형)`)
    for (const d of delta) console.log(`[32-4 오른 칸] ${d.name} @ ${d.box} — ${d.before} → ${d.after}`)
    expect(fired.n, '구제가 실제로 돈다(0이면 «안 걸렸다»와 구별이 안 된다)').toBeGreaterThan(0)

    // ── ㉤ 규칙 × 문턱 훑기 — 값 하나로 결론을 만들지 않는다(#12·#13) ──────────
    const sweep: { agree: boolean; th: number; ok: number; wrong: number; four: number; serif_wrong: number; noise_accepted: number; fired: number; fired_ok: number; forms_gained: number; wrong_partners: Record<string, number> }[] = []
    for (const agree of [false, true]) for (const th of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9]) {
      const j = rule(C.DIGIT_NORM_ALPHA, th, agree)
      const t = table(j)
      // **오답 상대**까지 센다(2차 리뷰어 지적 — 「전부 1→7」이 사실이 아니었다)
      const partners: Record<string, number> = {}
      let fn = 0, fok = 0
      for (let i = 0; i < t.rows.length; i++) {
        const ch = t.rows[i]!.ch
        for (const [k, v] of Object.entries(t.rows[i]!.got)) {
          if (k !== '?' && k !== ch) partners[`${ch}→${k}`] = (partners[`${ch}→${k}`] ?? 0) + v
        }
      }
      for (const f of FORMS) for (const b of BOXES) for (const jit of JIT) for (let k = 0; k < 5; k++) {
        const g = glyphAt(f.strokes, 100, 100, b.w, b.h, 31 + k * 613, jit)
        const a0 = classifyGlyph(g, 0)
        if (a0 && a0.p >= NET_REJECT) continue
        const r = j(g)
        if (r && r.p >= NET_REJECT) { fn++; if (r.ch === f.ch) fok++ }
      }
      sweep.push({
        agree, th, ok: t.ok, wrong: t.wrong,
        four: t.rows.filter(r => r.ch === '4').reduce((n, r) => n + r.correct, 0),
        serif_wrong: wrongOf(t.rows, serif, '1'),
        noise_accepted: Object.values(NOISE).filter(st => j(st) !== null).length,
        fired: fn, fired_ok: fok,
        forms_gained: new Set(t.rows.filter((r, i) => r.correct > B.rows[i]!.correct).map(r => r.name)).size,
        wrong_partners: partners,
      })
    }
    for (const s of sweep) console.log(`[32-4 훑기] ${s.agree ? '동의+' : '확신만'} th=${s.th} — 맞음 ${s.ok} · 틀림 ${s.wrong}(${JSON.stringify(s.wrong_partners)}) · 4 ${s.four} · 발화 ${s.fired}/적중 ${s.fired_ok} · 오른 자형 ${s.forms_gained} · 잡음 수용 ${s.noise_accepted}`)
    // 훑기가 실제로 갈린다(항등이 아니다) — 규칙 축과 문턱 축 둘 다에서
    expect(new Set(sweep.map(s => s.ok)).size, '훑기가 값을 가른다').toBeGreaterThan(3)

    // ── 불변식 — **잡음 수용 0**(web2-10부터 · #61). 여덟 **전부**의 확신을 적는다 ──
    const noise = Object.entries(NOISE).map(([name, st]) => {
      const a0 = classifyGlyph(st, 0)
      const an = classifyGlyph(st, C.DIGIT_NORM_ALPHA)
      return {
        name,
        preserved: a0 ? { ch: a0.ch, p: a0.p } : '잡음 클래스가 이겼다',
        normalized: an ? { ch: an.ch, p: an.p } : '잡음 클래스가 이겼다',
        accepted_after: after(st) !== null,
      }
    })
    const accepted = noise.filter(x => x.accepted_after).length
    console.log(`[32-4 잡음] 수용 ${accepted}/8 — ${noise.map(x => `${x.name} ${typeof x.normalized === 'string' ? '클래스거부' : `${x.normalized.ch}:${x.normalized.p.toFixed(3)}`}`).join(' · ')}`)
    expect(accepted, '비숫자가 숫자로 확정되지 않는다').toBe(0)

    // 바닥(DIGIT_ASPECT_FLOOR)이 이 픽스처에서 **무는가** — 안 물면 그 상수는 미측이다(#32)
    const floorBinds = FORMS.flatMap(f => BOXES.map(b => {
      const g = glyphAt(f.strokes, 100, 100, b.w, b.h, 31, 0)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const st of g) for (const p of st) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
      const span = Math.max(x1 - x0, y1 - y0)
      return Math.min(x1 - x0, y1 - y0) < span * C.DIGIT_ASPECT_FLOOR
    })).filter(Boolean).length
    console.log(`[32-4 바닥] DIGIT_ASPECT_FLOOR가 무는 칸 ${floorBinds}/${FORMS.length * BOXES.length}`)

    // 자형별 무회귀 — 칸마다 전보다 낮아지지 않는다(내려간 몫의 합이 미미하다)
    const worse = A.rows.filter((r, i) => r.correct < B.rows[i]!.correct)
    for (const w of worse) console.log(`[32-4 내려간 칸] ${w.name} @ ${w.box} — ${B.rows[A.rows.indexOf(w)]!.correct} → ${w.correct}`)
    expect(worse.reduce((n, w) => n + (B.rows[A.rows.indexOf(w)]!.correct - w.correct), 0), '내려간 몫이 미미하다').toBeLessThanOrEqual(2)

    const out = resolve(__dirname, '../../stage0/out/glyph32_web2.json')
    mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 4번 — 인식기의 **가로세로비 정규화**. 30-8과 **같은 표본·같은 하네스**로 전/후를 낸다.',
      bias: '⚠⚠ **합성 표본이다**(30-8의 그 표본). 자형 하나를 흔들어 스무 번 낸 것이고 사람이 실제로 쓴 획이 아니다 — 어느 축이 약한지를 가리키는 데까지만 쓴다. 진짜 값은 실기기 DEVICE-CHECK H12·B8이다.',
      order: '지시가 못 박은 순서 — ① 정규화만 넣고 잰다(이 원장) ② 그 다음에 궤적. 이 회차는 ①까지다.',
      cost_asymmetry: '⚠⚠ **판정자는 «맞음»이 아니라 «오답»이다**(#61). web2-32의 2번이 승인 층을 걷었으므로 오답은 **조용히 실린다**. 그리고 첫 치수는 **축척**을 정한다 — 「1」을 「7」로 읽으면 문서 전체가 7배로 선다. 1차 리뷰어가 초판(문턱 0.7)의 오답 2 → 8을 잡았다. 그 여덟의 **상대**는 sweep의 `wrong_partners`가 낸다: 늘어난 여섯은 **1→7 다섯 · 1→2 하나**이고 전부 세리프 「1」이다(2차 리뷰어가 「전부 1→7」이라는 초판 문장을 정정했다). 그래서 **오답을 안 늘리는 가장 낮은 문턱** 0.8을 골랐다 — 그 값에서 구제는 **15번 발화해 15번 맞고**(fired/fired_ok) 오답을 하나도 안 만든다.',
      trajectory_not_added: '궤적(획순·방향·붓 뗀 자리)은 **이 모형에 못 들어간다**: digitnet은 MNIST로 학습된 오프라인 래스터 MLP이고 MNIST에는 궤적 표본이 자체가 없다(스캔 이미지다). 넣으려면 온라인 필기 표본으로 다시 학습해야 하는데 이 환경에 numpy도 MNIST도 없다(A-2 우회 — DEFERRED). ⚠⚠ **web2-35가 이 문장의 범위를 정정했다**: 못 넣는 것은 «**모형 안**»이고, **모형 밖의 시야로는 넣을 수 있다** — `traj.ts`/`traj_rec.ts`가 그것이고 원장은 `glyph35_web2.json`이다. 다만 그 회차의 결론은 이 문장의 우선순위 판단을 **뒤집지 않는다**: 궤적의 고유 이득은 880칸 중 12칸(+1.4%p)이고, 오른 것의 대부분은 «궤적»이 아니라 «거부된 글리프에 대조기를 하나 더 둔 것»이었다(PITFALLS #82). ⚠ 그리고 이 회차의 실측이 그 우선순위를 낮춘다: 「4」가 정규화만으로 올랐다(아래 four).',
      recognizer: {
        before: 'classifyGlyph(비 보존) + NET_REJECT',
        after: 'classifyGlyphNorm — 비 보존 시야가 거부하면 편 시야(alpha)로 한 번 더. **구제 조건은 하나다**: 확신 ≥ NET_RESCUE. ⚠ 「비 보존 시야가 다른 숫자를 냈으면 안 뒤집는다」는 조항은 **안 넣었다** — 채택 문턱 0.8에서 아무것도 안 바꾸기 때문이다(sweep의 agree=true 행이 그 근거이고, 0.55~0.65에서만 오답을 줄인다).',
      },
      constants: { DIGIT_NORM_ALPHA: C.DIGIT_NORM_ALPHA, DIGIT_ASPECT_FLOOR: C.DIGIT_ASPECT_FLOOR, NET_REJECT, NET_RESCUE },
      totals: {
        before: { ok: B.ok, wrong: B.wrong, reject: B.rej, n: B.n, wrong_of_accepted: [B.wrong, B.ok + B.wrong] },
        after: { ok: A.ok, wrong: A.wrong, reject: A.rej, n: A.n, wrong_of_accepted: [A.wrong, A.ok + A.wrong] },
        placebo_two_stage_alpha1: { ok: P.ok, wrong: P.wrong, n: P.n },
        single_view_alpha1: { ok: F.ok, wrong: F.wrong, n: F.n },
      },
      by_ratio: { before: rB, after: rA, max_gap_before: maxGap(rB), max_gap_after: maxGap(rA) },
      by_form: { serif_1: { before: serifB, after: serifA }, four_all_forms: { before: fourB, after: fourA, n: 320 } },
      rescue: { fired: fired.n, fired_correct: fired.ok, gained_cells: delta.length, gained_forms: [...new Set(delta.map(d => d.name))] },
      delta_cells: delta,
      sweep_rule_threshold: sweep,
      aspect_floor_binding_cells: [floorBinds, FORMS.length * BOXES.length],
      noise_8: { accepted: accepted, rows: noise },
      flags_explained: {
        '단일 범주 분포(got에 항목이 하나)': '**측정이다**(§5의 «의심≠오류» · 30-8의 같은 해설). 20/20이면 스무 번 다 같은 답이 나온 것이고 그 «갈리지 않음»이 표의 결론 절반이다. 갈리는 쪽(4·세리프 1)이 같은 표 안에 있으므로 분해능은 서 있다.',
        '⚠⚠ 이득이 «자형 하나»에서 나온다': '**2차 리뷰어가 잡은 자리이고 그대로 적는다.** 문턱 0.8에서 오른 칸은 셋뿐이고 **전부 «4·열린·1획(세로 먼저·사선 나중)»**이다(delta_cells). 그러므로 totals·by_ratio·by_form의 개선은 **서로 독립한 증거가 아니라 같은 15칸의 네 가지 표기**다. 「비가 약한 특징이다」는 이 표본에서 **그 자형에 대해** 선 것이고, 인식기 일반의 결론으로 넓히지 않는다. 문턱을 0.75/0.7로 내리면 이득이 「4」의 두·세 자형으로 넓어지지만 **세리프 1의 오답이 는다**(sweep) — 그 거래를 안 하기로 한 것이 이 회차의 선택이다.',
        '비가 단조가 아니다(0.65 > 0.82 < 1.00)': '**그대로 적는다**(1차 리뷰어 지적). 비 하나로 다 설명되지 않는다 — 0.82 버킷(28x34)은 전·후 모두 가운데가 아니라 가장 낮다. 그래서 이 원장은 «격차가 좁혀졌다»를 **최대 쌍 격차**로 판정하고, 한 쌍만 골라 인용하지 않는다.',
        '위약 팔의 맞음이 before와 정확히 같다(491)': '**구성상 그렇다**(#77 ㉥의 물음에 대한 답): 구제 시야를 alpha=1로 두면 그 시야가 **한 번도 안 맞는다** — 발화분이 전부 오답이거나 거부라 맞음이 안 는다. 그래서 491은 «안 변했다»가 아니라 «구제가 0건 적중했다»는 측정이다(틀림은 2 → 22로 는다).',
        '잡음 행의 «클래스 거부»': '`classifyGlyph`가 null을 낸 것 — **잡음 클래스(11번째)가 이겼다**는 뜻이고 확신 값이 없다(기록 누락이 아니다). p가 있는 둘(ㄷ자·삼각형)이 이 표에서 문턱에 가장 가까운 행이다.',
      },
      per_form_box: { before: B.rows, after: A.rows },
    }, null, 2))
  })
})
