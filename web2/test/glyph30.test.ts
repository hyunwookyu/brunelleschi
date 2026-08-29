// web2-30 8번 — **손글씨 「4」를 자형별로 나눠 센다**(고치기 전에 먼저 가른다 — D-1).
//
// 증상: 29-1의 인식률이 전체 81.4%인데 「4」가 헤드리스 6/20으로 유독 낮다(H12).
// 원인 후보(사람): 「사람이 쓰는 4는 흔한 자형이 둘이다 — 위가 닫힌 4와 열린 4. 획 수도
//   1획·2획이 모두 흔하다. 인식기가 한쪽만 가정하고 있을 가능성이 크다.」
//
// ⚠⚠ **D-5가 먼저다.** 지금 픽스처(`digitnet.test.ts`의 SHAPES)는 **$P 템플릿을 그대로**
//   쓴다 — 숫자마다 **자형이 하나뿐**이고, 「4」의 그 하나는 «위가 열린 2획»이다.
//   그러므로 6/20은 **자형별 값이 아니라 한 자형의 값**이고, 사람이 말한 다른 자형은
//   **한 번도 시험된 적이 없다**. 이 파일이 그 대역을 연다.
//
// ⚠ **헤드리스 숫자를 결론으로 쓰지 마라**(지시 문면). 여기서 쓰는 「손글씨」는 합성이고
//   진짜 값은 실기기 H12다. 이 표는 **어느 자형이 안 잡히는지**를 가리키는 데까지만 쓴다.
//
// 표는 `stage0/out/glyph30_web2.json`에 남는다(§5 — 원장 밖 측정은 안 걸린다).

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyGlyph } from '../src/core/digitnet'
import { NET_REJECT } from '../src/core/handwriting'
import { rng32 } from '../src/core/material'
import type { Pt } from '../src/core/vec'
import { glyphAt, BOXES, JIT, FORMS } from './glyphforms'

// 자형표·상자·흔들기는 `test/glyphforms.ts`로 옮겼다(web2-32 4번이 같은 것을 읽는다 — #54).

/** 한 자형 × 한 상자 — 런타임과 **같은 판정**이다(잡음 클래스 + 확신 임계). */
function runForm(strokes: Pt[][], ch: string, box: { w: number; h: number }) {
  let correct = 0
  const got: Record<string, number> = {}
  for (const jit of JIT) {
    for (let k = 0; k < 5; k++) {
      const g = glyphAt(strokes, 100, 100, box.w, box.h, 31 + k * 613, jit)
      const r = classifyGlyph(g)
      const answer = r === null ? '?(잡음)' : r.p < NET_REJECT ? '?(낮은 확신)' : r.ch
      if (r !== null && r.p >= NET_REJECT && r.ch === ch) correct++
      got[answer] = (got[answer] ?? 0) + 1
    }
  }
  return { correct, total: JIT.length * 5, got }
}

describe('web2-30 8번 — 자형별 × 크기별 분해표 (재기만 한다 · 고치는 것은 32-4)', () => {
  it('4·7·1·9의 자형별 인식률과 오독 상대를 낸다 — 그리고 «자형이냐 크기냐»를 가른다', () => {
    const rows: { ch: string; name: string; box: string; correct: number; total: number; got: Record<string, number> }[] = []
    for (const f of FORMS) {
      for (const b of BOXES) {
        const r = runForm(f.strokes, f.ch, b)
        rows.push({ ch: f.ch, name: f.name, box: b.name, ...r })
      }
    }
    for (const f of FORMS) {
      const line = BOXES.map(b => {
        const r = rows.find(x => x.name === f.name && x.box === b.name)!
        return `${b.name.split(' ')[0]} ${r.correct}/${r.total}`
      }).join('  ')
      console.log(`[30-8] ${f.name.padEnd(30)} ${line}`)
    }
    for (const r of rows) {
      if (r.correct < r.total) console.log(`[30-8 오독] ${r.name} @ ${r.box} — ${JSON.stringify(r.got)}`)
    }
    const four = rows.filter(r => r.ch === '4' && r.box === BOXES[0]!.name)
    console.log(`[30-8] 「4」 @22x34 자형 넷 — ${four.map(f => `${f.correct}/${f.total}`).join(' · ')}`)

    const out = resolve(__dirname, '../../stage0/out/glyph30_web2.json')
    mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-30 8번 — 손글씨 숫자의 **자형별 × 크기별** 인식률(4의 닫힘/열림·획수 · 7의 가로줄 · 1의 세리프 · 9의 꼬리). 32-4의 전/후 비교의 «전»이다.',
      bias: '⚠⚠ **합성 표본이다.** 자형 하나를 흔들어 20번 낸 것이고 사람이 실제로 쓴 획이 아니다. 진짜 값은 실기기 DEVICE-CHECK H12·B8이다. 이 표는 «어느 자형이 약한가»를 가리키는 데까지만 쓰고 인식률 자체를 결론으로 쓰지 않는다(지시 문면).',
      fixture_note: '놓기·흔들기·JIT은 dimwrite29.test.ts와 **같다**(「4가 6/20」이 나온 그 하네스). 다른 것은 ① 자형이 하나가 아니다 ② **크기 축을 함께 훑는다** 둘이다. ②가 필요한 이유: 6/20이 나온 글자 상자는 22x34 px이고 digitnet은 획을 래스터로 굽는다 — 크기를 안 훑으면 「자형 때문」과 「작아서」가 한 수 안에서 구별되지 않는다(D-1·D-4).',
      recognizer: 'digitnet(번들 MLP) + 런타임과 같은 두 겹 거부(잡음 클래스 · NET_REJECT)',
      flags_explained: {
        '단일 범주 분포(got에 항목이 하나)': '**측정이다**(§5의 «의심≠오류»). 20/20이면 스무 번 다 같은 답이 나온 것이고, 그 «갈리지 않음»이 이 표의 결론 절반이다 — 7·9·수직선 1은 어느 자형·어느 비에서도 흔들리지 않는다. 갈리는 쪽(4·세리프 1)이 같은 표 안에 있으므로 분해능은 서 있다(팔이 «값이 갈린다»를 따로 단언한다).',
      },
      net_reject: NET_REJECT,
      boxes: BOXES,
      jit: JIT,
      per_form_box: rows,
    }, null, 2))

    // 분해능(#71 ㉢) — 표가 **갈려야** 뜻이 있다. 전부 같은 값이면 아무것도 안 잰 것이다.
    expect(new Set(rows.map(r => r.correct)).size, '자형·크기별로 값이 갈린다').toBeGreaterThan(1)
    // 하네스 위생 — 「7·가로줄 없음」은 어느 상자에서도 잘 잡힌다(다 무너지면 하네스가 틀렸다)
    const seven = rows.filter(r => r.name.includes('7·가로줄 없음'))
    expect(Math.min(...seven.map(r => r.correct)), '현행 7 자형은 어느 크기에서도 잡힌다').toBeGreaterThan(10)
  })
})
