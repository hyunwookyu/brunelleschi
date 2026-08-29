// web2-32 1번 — **종이에서 글씨와 작도선을 가른다**의 게이트.
//
// 증상(사용자 확인): 종이에 숫자를 쓰면 **획마다 다르게 처리된다**. 1은 축에 붙어
// 작도선이 되고, 곡선인 숫자는 안 되고, 숫자 하나가 공간에 흩어진다.
//
// ⚠⚠ **D-2(재현 먼저)**: ①의 첫 단언이 수리 «전»의 상태를 실제로 낸다 — `text` 표식을
//   빼면(= web2-29까지의 동작) 「1」 획이 3D로 올라가 있고 나머지 글자 획이 대기에 남는다.
//   이 파일의 ①은 그 자리를 **판정이 뒤집힌 뒤**로 재고, ①'가 뒤집기 전 상태를 같은
//   장면에서 낸다(글씨 판정을 안 거친 획 하나 — 「곧은 짧은 획 하나는 아직 글씨가 아니다」).
// ⚠ **D-3(반증 조건)**: 이 검사가 실패하는 조건을 함께 적고 실제로 실패시킨다 —
//   ㉠ 자를 대듯 그은 **긴 획**은 글씨가 되면 안 된다(②: 오분류 0) ㉡ **다른 획의 근거**가
//   된 획은 판정이 안 뒤집힌다(④) ㉢ 옐로에서는 아무 일도 안 난다(⑤).
//
// 게이트(지시 32-1):
//   ① 숫자 한 자리를 쓰면 그 획들이 **전부** 글씨가 된다(일부만 작도선으로 남지 않는다)
//   ② 자를 대듯 그은 긴 획은 여전히 작도선이다(오분류 0)
//   ③ 글씨 획이 3D를 갖지 않는다(좌표로 확인)
//   ④ 다른 획의 근거가 된 획은 재판정되지 않는다
//   ⑤ 옐로의 거동 무회귀

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, type Session } from './session'
import { addLayer, setActiveLayer, writingCluster, handwritingGroup, undo } from '../src/app/state'
import { featOf, confirmWriting, isBasis } from '../src/core/scribble'
import { isText } from '../src/core/types'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { C } from '../src/core/constants'
import { glyph, write } from './glyphs'
import type { Pt } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800

/** 카메라가 닫힌 장면 — 지평선 + 소실점 둘(획으로). dimwrite29의 `closed()`와 같은 구도. */
function closed(): Session {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 글자 하나를 그 자리에 **쓴다** — 획마다 앱과 같은 경로를 지난다(스냅을 포함해서). */
function writeAt(s: Session, text: string, x: number, y: number, jit = 0.6, seed = 31): number[] {
  const ids: number[] = []
  for (const st of write(text, x, y, seed, jit)) {
    const r = s.stroke(st)
    if (r) ids.push(r.id)
  }
  return ids
}

describe('32-1 ① 숫자를 쓰면 그 획들이 전부 글씨가 된다', () => {
  it('한 자리·여러 자리 모두 — 뭉치의 획이 하나도 남지 않고 글씨가 된다', () => {
    const rows: { text: string; strokes: number; text_marked: number; lifted: number; waiting: number }[] = []
    for (const t of ['4', '25', '2500', '3.5', '1']) {
      const s = closed()
      s.draw(300, 400, 900, 400)                    // 곁에 잴 선 하나(3D로 올라간다)
      const ids = writeAt(s, t, 380, 430)
      const marked = ids.filter(id => isText(s.app.doc.strokes.find(x => x.id === id)!)).length
      const lifted = ids.filter(id => s.app.lift.lifted.has(id)).length
      const waiting = ids.filter(id => s.app.lift.waiting.includes(id)).length
      rows.push({ text: t, strokes: ids.length, text_marked: marked, lifted, waiting })
      console.log(`[32-1 ①] "${t}" — 획 ${ids.length} · 글씨 ${marked} · 3D ${lifted} · 대기 ${waiting}`)
    }
    // 「1」은 **곧은 획 하나**라 뭉치가 안 선다 — 그것이 규칙이다(애매하면 놓지 않는다).
    // 나머지는 **전부** 글씨가 된다: 일부만 작도선으로 남지 않는다(게이트 문면).
    for (const r of rows) {
      if (r.text === '1') continue
      expect(r.text_marked, `"${r.text}" 획이 전부 글씨`).toBe(r.strokes)
      expect(r.lifted, `"${r.text}" 글씨는 3D가 없다`).toBe(0)     // ③ — 좌표로 확인
      expect(r.waiting, `"${r.text}" 글씨는 대기도 아니다`).toBe(0)
    }
    // ①' **D-2 재현** — 뒤집기 전 상태가 같은 장면에 남아 있다: 「1」 한 획은 아직
    // 글씨가 아니고(뭉치 미확정) 그래서 **3D 또는 대기**에 들어간다. 그것이 사용자가
    // 본 「1은 축에 붙어 작도선이 된다」이고, ①은 그 옆에 한 자를 더 쓰면 뒤집힌다.
    const one = rows.find(r => r.text === '1')!
    expect(one.text_marked, '곧은 획 하나는 아직 글씨가 아니다').toBe(0)
    expect(one.lifted + one.waiting, '그래서 작도 관을 그대로 지난다').toBe(one.strokes)

    // 그 「1」 옆에 한 자를 더 쓰면 **둘 다** 글씨가 된다(「옆에 짧은 획이 하나 더 붙는 순간」)
    const s = closed()
    s.draw(300, 400, 900, 400)
    const a = writeAt(s, '1', 380, 430)
    expect(a.every(id => !isText(s.app.doc.strokes.find(x => x.id === id)!))).toBe(true)
    const b = writeAt(s, '2', 410, 430, 0.6, 977)
    const all = [...a, ...b]
    const marked = all.filter(id => isText(s.app.doc.strokes.find(x => x.id === id)!))
    console.log(`[32-1 ①'] 「1」 뒤에 「2」 — 획 ${all.length} 중 글씨 ${marked.length}`)
    expect(marked.length, '뭉치가 확정되면 앞 획도 함께 뒤집힌다').toBe(all.length)
    expect(all.some(id => s.app.lift.lifted.has(id)), '3D가 남지 않는다').toBe(false)

    const out = resolve(HERE, '../../stage0/out/scribble32_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 1번 — 종이의 글씨/작도선 가르기. 판정은 이 파일의 expect가 정본이고 표는 «어디서 갈리는가»를 남긴다.',
      conditions: {
        fixture: '글자 픽스처는 test/glyphs.ts(29-1의 것 그대로) · 흔들기 0.6px · 카메라가 닫힌 2점 장면 · 곁에 3D 선 하나',
        command: 'npx vitest run test/scribble32.test.ts',
      },
      constants: {
        TEXT_MIN_STROKES: C.TEXT_MIN_STROKES, TEXT_TURN_RAD: C.TEXT_TURN_RAD,
        TEXT_TURN_SEG_PX: C.TEXT_TURN_SEG_PX, TEXT_BASIS_TOL: C.TEXT_BASIS_TOL,
        DIM_GLYPH_MAX_PX: C.DIM_GLYPH_MAX_PX, DIM_GROUP_SPAN: C.DIM_GROUP_SPAN, DIM_GROUP_MAX: C.DIM_GROUP_MAX,
      },
      flags_explained: {
        '「1」이 0/1': '**규칙이다**(결함이 아니다) — 곧은 짧은 획 하나는 «1»일 수도 짧은 작도선일 수도 있어 놓지 않는다. 옆에 한 자가 붙는 순간 앞 획까지 뒤집힌다(①\'가 그것을 잰다).',
      },
      per_text: rows,
    }, null, 2))
  })
})

describe('32-1 ② 자를 대듯 그은 긴 획은 여전히 작도선이다 — 오분류 0', () => {
  it('길이·각도를 훑어도 글씨로 안 넘어간다 (D-3 반증: 짧게 하면 넘어간다)', () => {
    const rows: { len: number; deg: number; text: boolean }[] = []
    let wrong = 0
    for (const len of [80, 140, 220, 320]) {
      for (const deg of [0, 15, 40, 90, 130]) {
        const s = closed()
        const th = deg * Math.PI / 180
        const x0 = 400, y0 = 380
        const a = s.draw(x0, y0, x0 + Math.cos(th) * len, y0 + Math.sin(th) * len)
        // 두 번째 획도 같은 대역으로 나란히 — 「획 하나」가 아니라 **여럿**이어도 안 넘어간다
        const b = s.draw(x0 + 24, y0 + 24, x0 + 24 + Math.cos(th) * len, y0 + 24 + Math.sin(th) * len)
        const t = [a, b].some(x => x !== null && isText(s.app.doc.strokes.find(z => z.id === x!.id)!))
        if (t) wrong++
        rows.push({ len, deg, text: t })
      }
    }
    console.log(`[32-1 ②] 긴 획 ${rows.length}칸 중 글씨로 잘못 넘어간 칸 ${wrong}`)
    expect(wrong, '오분류 0').toBe(0)

    // **D-3 반증** — 같은 하네스에서 «짧게» 하면 실제로 넘어간다(이 검사가 무언가를 잰다)
    const s2 = closed()
    s2.draw(300, 400, 900, 400)
    const two = [s2.draw(400, 300, 410, 316), s2.draw(416, 300, 424, 318)]
    const flipped = two.filter(x => x !== null && isText(s2.app.doc.strokes.find(z => z.id === x!.id)!)).length
    console.log(`[32-1 ② 반증] 같은 자리에 «짧은» 획 둘 — 글씨 ${flipped}/2`)
    expect(flipped, '짧고 뭉치면 넘어간다 — 그러므로 위의 0은 항등이 아니다').toBe(2)
  })
})

describe('32-1 ④ 다른 획의 근거가 된 획은 재판정되지 않는다', () => {
  it('이어진 두 획은 뭉치에 안 들고 3D를 지킨다 — 안 이어진 짧은 획 둘은 같은 장면에서 뒤집힌다', () => {
    const s = closed()
    const a = s.draw(500, 560, 540, 545)!        // 짧은 획 A — 3D
    const b = s.draw(540, 545, 580, 530)!        // A의 끝점에서 시작 — **서로 근거다**
    expect(s.app.lift.lifted.has(a.id) && s.app.lift.lifted.has(b.id)).toBe(true)
    // ⚠ 이 물음은 **방향을 모른다**(리프팅이 «누가 먼저 섰는지»를 기록하지 않는다) —
    //   이어진 두 획은 서로 근거로 읽힌다. 보수적인 쪽이고, 그것이 곧 「작도선은 서로
    //   이어진다」의 판별자다.
    expect(isBasis(s.app.lift.lifted, a.id, C.TEXT_BASIS_TOL), 'A는 근거다').toBe(true)
    expect(isBasis(s.app.lift.lifted, b.id, C.TEXT_BASIS_TOL), 'B도 근거다(이어져 있다)').toBe(true)
    // 곁에 **안 이어진** 짧은 획 둘 — 뭉치가 선다(스냅이 사슬을 안 만드는 자리에 둔다)
    const d = s.draw(600, 480, 610, 498)!
    const e = s.draw(620, 484, 628, 502)!
    const cl = writingCluster(s.app)
    console.log(`[32-1 ④] 뭉치 ${JSON.stringify(cl.ids)} — A=${a.id} B=${b.id} D=${d.id} E=${e.id}`)
    expect(cl.ids.includes(a.id) || cl.ids.includes(b.id), '이어진 획은 뭉치에 안 든다').toBe(false)
    for (const [name, st] of [['A', a], ['B', b]] as const) {
      expect(isText(s.app.doc.strokes.find(x => x.id === st.id)!), `${name}는 작도선으로 남는다`).toBe(false)
      expect(s.app.lift.lifted.has(st.id), `${name}의 3D도 그대로다`).toBe(true)
    }
    // **선택적이라는 증거**(D-3) — 안 이어진 짧은 획 둘은 실제로 뒤집힌다. 이 단언이
    // 없으면 위의 «안 뒤집힘»은 「아무것도 안 뒤집힌다」와 구별되지 않는다.
    for (const [name, st] of [['D', d], ['E', e]] as const) {
      expect(isText(s.app.doc.strokes.find(x => x.id === st.id)!), `${name}는 뒤집힌다`).toBe(true)
      expect(s.app.lift.lifted.has(st.id), `${name}의 3D는 사라진다`).toBe(false)
    }
  })
})

describe('32-1 ⑤ 옐로 무회귀 · ⑥ 저장·복원 · ⑦ 실행취소', () => {
  it('옐로에서는 글씨 판정이 아예 안 돈다(거기서 쓰는 숫자는 메모다 — 32-8)', () => {
    const s = closed()
    const lay = addLayer(s.app, 'yellow', { W, H })!
    setActiveLayer(s.app, lay.id)
    const ids = writeAt(s, '25', 380, 430)
    const marked = ids.filter(id => isText(s.app.doc.strokes.find(x => x.id === id)!)).length
    console.log(`[32-1 ⑤] 옐로에 「25」 — 획 ${ids.length} · 글씨 표식 ${marked}`)
    expect(ids.length).toBeGreaterThan(0)
    expect(marked, '옐로에서는 판정이 안 돈다').toBe(0)
    expect(writingCluster(s.app).ids, '뭉치도 안 선다').toEqual([])
  })

  it('글씨 표식이 저장·복원을 왕복한다', () => {
    const s = closed()
    s.draw(300, 400, 900, 400)
    const ids = writeAt(s, '25', 480, 430, 0.6, 51)
    const marked = ids.filter(id => isText(s.app.doc.strokes.find(x => x.id === id)!))
    expect(marked.length).toBeGreaterThan(0)
    const back = parseBrnl(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView }))!
    const after = marked.filter(id => isText(back.doc.strokes.find(x => x.id === id)!)).length
    console.log(`[32-1 ⑥] 글씨 ${marked.length} → 복원 뒤 ${after}`)
    expect(after).toBe(marked.length)
  })

  it('실행취소하면 글씨 판정도 함께 풀린다(판정만 남지 않는다)', () => {
    const s = closed()
    s.draw(300, 400, 900, 400)
    const a = writeAt(s, '1', 380, 430)
    writeAt(s, '2', 410, 430, 0.6, 977)          // 여기서 a가 글씨로 뒤집힌다
    expect(isText(s.app.doc.strokes.find(x => x.id === a[0])!)).toBe(true)
    undo(s.app)                                  // 「2」의 마지막 획을 되돌린다
    const still = isText(s.app.doc.strokes.find(x => x.id === a[0])!)
    console.log(`[32-1 ⑦] 실행취소 뒤 앞 획의 글씨 표식 — ${still}`)
    expect(still, '뒤집기가 함께 풀린다').toBe(false)
  })
})

describe('32-1 특징·확정 규칙 — 순수 함수 단위(core/scribble)', () => {
  it('감긴 획 하나는 확정되고 곧은 획 하나는 안 된다 (반증 조건이 붙은 검사)', () => {
    const circle: Pt[] = []
    for (let i = 0; i <= 24; i++) {
      const th = i / 24 * Math.PI * 2
      circle.push({ x: 400 + Math.cos(th) * 14, y: 400 + Math.sin(th) * 14 })
    }
    const line: Pt[] = [{ x: 400, y: 400 }, { x: 470, y: 430 }]
    const fc = featOf(circle, C.TEXT_TURN_SEG_PX)
    const fl = featOf(line, C.TEXT_TURN_SEG_PX)
    console.log(`[32-1 특징] 원 turn=${fc.turn.toFixed(2)}rad turns=${fc.turns} · 직선 turn=${fl.turn.toFixed(2)}rad`)
    expect(confirmWriting([fc], C.TEXT_MIN_STROKES, C.TEXT_TURN_RAD), '감긴 획 하나 = 글씨').toBe(true)
    expect(confirmWriting([fl], C.TEXT_MIN_STROKES, C.TEXT_TURN_RAD), '곧은 획 하나 = 아직 아니다').toBe(false)
    expect(confirmWriting([fl, fl], C.TEXT_MIN_STROKES, C.TEXT_TURN_RAD), '둘이면 확정').toBe(true)
    // 손떨림이 회전각에 안 실린다 — 잔떨림을 태운 «직선»도 여전히 곧다(TEXT_TURN_SEG_PX의 몫)
    const shaky: Pt[] = []
    for (let i = 0; i <= 40; i++) shaky.push({ x: 400 + i * 2, y: 400 + (i % 2 ? 0.6 : -0.6) })
    const fs = featOf(shaky, C.TEXT_TURN_SEG_PX)
    console.log(`[32-1 특징] 떨리는 직선 turn=${fs.turn.toFixed(2)}rad`)
    expect(fs.turn, '손떨림은 회전각이 아니다').toBeLessThan(C.TEXT_TURN_RAD)
  })

  it('글씨 뭉치는 인식기가 읽을 목록이 된다(handwritingGroup)', () => {
    const s = closed()
    s.draw(300, 400, 900, 400)
    const ids = writeAt(s, '77', 380, 430)
    const g = handwritingGroup(s.app)
    console.log(`[32-1] 글씨 획 ${ids.length} · 인식 대상 ${g.length}`)
    expect(g.length).toBe(ids.length)
    expect(g).toEqual([...g].sort((a, b) => a - b))   // 문서 순서
  })
})

/** 글자 하나의 획 — 다른 파일이 쓰지 않는 지역 도우미(픽스처의 출처는 glyphs.ts 하나다) */
export const glyphStrokes = glyph
