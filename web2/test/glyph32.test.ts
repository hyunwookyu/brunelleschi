// web2-32 4번 — **인식기가 정규화를 안 한다**(30-8이 정정한 후보)의 게이트.
//
// ⚠⚠ **지시의 후보가 이미 정정됐다**(D-4): 지시문 32-4는 「궤적으로 바꾼다」였는데,
//   web2-30의 8번이 같은 표본에서 **가로세로비**를 가장 큰 축으로 냈다 —
//   비 0.65에서 6/20 ↔ 비 1.00에서 18/20(`glyph30_web2.json`). 세션 지시가 그 정정을
//   못 박았고 순서를 정했다: **① 정규화 먼저 재고 ② 그 다음에 궤적.**
//
// ⚠ **D-3(반증 조건)** — 이 파일이 지키는 것 넷:
//   ㉠ **정규화만** 넣고 먼저 잰다(궤적과 같이 넣으면 어느 쪽이 올렸는지 못 가른다)
//   ㉡ 비 0.65와 1.00의 인식률 **차이가 좁혀진다**
//   ㉢ 표를 **정규화 전 / 정규화 후**로 각각 낸다(궤적 자리는 아래 «못 넣는다»의 근거와 함께)
//   ㉣ 비를 **통째로 버리면 무너진다**(alpha=1) — 「완전히 버리지는 마라」가 실측으로 선다
//
// ⚠ 헤드리스의 「손글씨」는 합성이다. **어느 축이 약한지**를 가리키는 데까지만 쓰고
//   인식률 자체를 결론으로 쓰지 않는다(지시 문면 · 30-8의 bias 그대로).

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

type Judge = (g: Pt[][]) => { ch: string; p: number } | null
/** 정규화 **전** — web2-31까지의 런타임(비 보존 시야 하나) */
const before: Judge = g => { const r = classifyGlyph(g, 0); return r && r.p >= NET_REJECT ? r : null }
/** 정규화 **후** — 지금의 런타임(비 보존 → 거부하면 편 시야로 한 번 더, 더 높은 문턱) */
const after: Judge = g => { const r = classifyGlyphNorm(g); return r && r.p >= NET_REJECT ? r : null }
/** 비를 **통째로 버린** 시야 — ㉣의 반증용(고정 alpha=1) */
const flat: Judge = g => { const r = classifyGlyph(g, 1); return r && r.p >= NET_REJECT ? r : null }

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
      const answer = r === null ? '?' : r.ch
      got[answer] = (got[answer] ?? 0) + 1
      if (r === null) rej++
      else if (r.ch === f.ch) { ok++; correct++ }
      else wrong++
    }
    rows.push({ ch: f.ch, name: f.name, box: b.name, correct, total: JIT.length * 5, got })
  }
  return { rows, ok, wrong, rej, n }
}

/** 비별 합계 — 상자 이름에 든 비(0.65/0.82/1.00)로 묶는다 */
function byRatio(rows: ReturnType<typeof table>['rows']) {
  const m: Record<string, { hit: number; n: number }> = {}
  for (const r of rows) {
    const k = (r.box.match(/비 ([0-9.]+)/) ?? [])[1] ?? '?'
    const e = (m[k] ??= { hit: 0, n: 0 })
    e.hit += r.correct; e.n += r.total
  }
  return m
}

describe('32-4 ① 정규화 — 전/후를 같은 표본에서 나란히 낸다', () => {
  it('전체가 오르고 비 0.65↔1.00의 격차가 좁혀진다 · 잡음 수용은 0으로 남는다', () => {
    const B = table(before), A = table(after), F = table(flat)
    const rB = byRatio(B.rows), rA = byRatio(A.rows)
    console.log(`[32-4 전] 맞음 ${B.ok}/${B.n} · 틀림 ${B.wrong} · 거부 ${B.rej}`)
    console.log(`[32-4 후] 맞음 ${A.ok}/${A.n} · 틀림 ${A.wrong} · 거부 ${A.rej}`)
    console.log(`[32-4 ㉣ 비를 버리면] 맞음 ${F.ok}/${F.n} · 틀림 ${F.wrong}`)
    for (const k of Object.keys(rB)) console.log(`[32-4 비 ${k}] 전 ${rB[k]!.hit}/${rB[k]!.n} → 후 ${rA[k]!.hit}/${rA[k]!.n}`)

    // ㉠ 정규화**만** 넣은 값이다 — 궤적은 이 회차에 안 들어갔다(아래 원장의 사유)
    expect(A.ok, '전체가 오른다').toBeGreaterThan(B.ok)
    // ㉡ 격차가 좁혀진다 — 30-8의 기준선은 6/20 ↔ 18/20이었다
    const gapB = Math.abs(rB['1.00']!.hit / rB['1.00']!.n - rB['0.65']!.hit / rB['0.65']!.n)
    const gapA = Math.abs(rA['1.00']!.hit / rA['1.00']!.n - rA['0.65']!.hit / rA['0.65']!.n)
    console.log(`[32-4 ㉡] 비 격차 ${(gapB * 100).toFixed(1)}%p → ${(gapA * 100).toFixed(1)}%p`)
    expect(gapA, '비 0.65와 1.00의 차이가 좁혀진다').toBeLessThan(gapB)
    // ㉣ 비를 통째로 버리면 무너진다 — 「완전히 버리지는 마라」의 실측
    expect(F.ok, '비를 버리면 오히려 준다').toBeLessThan(B.ok)

    // 불변식 — **잡음 수용 0**(web2-10부터 · #61). 정규화가 이것을 깨면 안 된다.
    const noise: { name: string; before: string; after: string; p: number | null }[] = []
    let accepted = 0
    for (const [name, st] of Object.entries(NOISE)) {
      const b = before(st), a = after(st)
      if (a !== null) accepted++
      noise.push({ name, before: b ? `${b.ch}:${b.p.toFixed(3)}` : '?', after: a ? `${a.ch}:${a.p.toFixed(3)}` : '?', p: classifyGlyph(st, C.DIGIT_NORM_ALPHA)?.p ?? null })
    }
    console.log(`[32-4 잡음] 수용 ${accepted}/8 — ${noise.map(x => `${x.name} ${x.before}→${x.after}`).join(' · ')}`)
    expect(accepted, '비숫자가 숫자로 확정되지 않는다').toBe(0)

    // **자형별 무회귀** — 칸마다 전보다 낮아지지 않는다(딱 한 칸의 −1까지만 허용).
    // 이 단언이 「전체는 올랐는데 어떤 자형은 죽었다」를 막는다(평균이 가리는 자리 — 30-8의 교훈).
    const worse = A.rows.filter((r, i) => r.correct < B.rows[i]!.correct)
    for (const w of worse) console.log(`[32-4 내려간 칸] ${w.name} @ ${w.box} — ${B.rows[A.rows.indexOf(w)]!.correct} → ${w.correct}`)
    expect(worse.reduce((n, w) => n + (B.rows[A.rows.indexOf(w)]!.correct - w.correct), 0), '내려간 몫이 미미하다').toBeLessThanOrEqual(2)

    const out = resolve(__dirname, '../../stage0/out/glyph32_web2.json')
    mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 4번 — 인식기의 **가로세로비 정규화**. 30-8과 **같은 표본·같은 하네스**로 전/후를 낸다.',
      bias: '⚠⚠ **합성 표본이다**(30-8의 그 표본). 자형 하나를 흔들어 스무 번 낸 것이고 사람이 실제로 쓴 획이 아니다 — 어느 축이 약한지를 가리키는 데까지만 쓴다. 진짜 값은 실기기 DEVICE-CHECK H12·B8이다.',
      order: '지시가 못 박은 순서 — ① 정규화만 넣고 잰다(이 원장) ② 그 다음에 궤적. 이 회차는 ①까지다.',
      trajectory_not_added: '궤적(획순·방향·붓 뗀 자리)은 **이 모형에 못 들어간다**: digitnet은 MNIST로 학습된 오프라인 래스터 MLP이고 MNIST에는 궤적 표본이 자체가 없다(스캔 이미지다). 넣으려면 온라인 필기 표본으로 다시 학습해야 하는데 이 환경에 numpy도 MNIST도 없다(A-2 우회 — DEFERRED에 올렸다). ⚠ 그리고 이 회차의 실측이 그 우선순위를 낮춘다: 「4」 네 자형의 합이 62/320 → 105/320으로 **정규화만으로** 올랐다.',
      recognizer: { before: 'classifyGlyph(비 보존) + NET_REJECT', after: 'classifyGlyphNorm — 비 보존 시야가 거부하면 편 시야(alpha)로 한 번 더, 구제 문턱 NET_RESCUE' },
      constants: { DIGIT_NORM_ALPHA: C.DIGIT_NORM_ALPHA, DIGIT_ASPECT_FLOOR: C.DIGIT_ASPECT_FLOOR, NET_REJECT, NET_RESCUE },
      totals: { before: { ok: B.ok, wrong: B.wrong, reject: B.rej, n: B.n }, after: { ok: A.ok, wrong: A.wrong, reject: A.rej, n: A.n }, aspect_discarded_alpha1: { ok: F.ok, wrong: F.wrong, n: F.n } },
      by_ratio: { before: rB, after: rA },
      noise_8: { accepted: 0, rows: noise },
      flags_explained: {
        '틀림이 2 → 8로 는다': '**숨기지 않는다**(#61의 비용 비대칭). 편 시야가 거부를 답으로 바꾸므로 맞음과 틀림이 함께 는다 — 구제 문턱 0.7이 그 거래를 정한 자리이고, 0.6이면 맞음 584·틀림 20, 0.75면 515·4다(훑기는 NOTES).',
        '단일 범주 분포(got에 항목이 하나)': '**측정이다**(§5의 «의심≠오류» · 30-8의 같은 해설). 20/20이면 스무 번 다 같은 답이 나온 것이고, 그 «갈리지 않음»이 표의 결론 절반이다 — 7·9·수직선 1은 어느 시야에서도 안 흔들린다. 갈리는 쪽(4·세리프 1)이 같은 표 안에 있으므로 분해능은 서 있다.',
        '세리프 1이 안 오른다': '**측정이 지시의 가설을 반증했다**(D-4). 세션 지시는 「세리프 1도 같은 뿌리(폭이 크게 변한다)」로 봤는데, 정규화는 세리프 1을 **안 고친다**(전과 같다: 5/0/0/2 · 9/1/0/12). 편 시야에서는 오히려 0/0/0/0이라 구제가 안 걸린다 — 뿌리가 다르다. assumptions.md AS-C114.',
      },
      per_form_box: { before: B.rows, after: A.rows },
    }, null, 2))
  })
})
