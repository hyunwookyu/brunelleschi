// web2-32 2번·3번 — **즉시 치수선** 과 **대상은 숫자의 위치가 정한다**의 게이트.
//
// 사용자의 말이 이 라운드의 전부다:
//   「나는 선 긋고 선 위나 주변에 숫자 쓰면 되는 거였는데, 후보만 잔뜩 생성된다.」
//
// 2번 게이트: ① 숫자를 쓰면 치수선이 생긴다(승인 단계 없음) ② 숫자를 눌러 고치고 그 값이
//   저장·복원을 왕복한다 ③ 실행취소 한 번에 손글씨로 돌아간다 ④ 옐로에서는 변환이 없다
//   ⑤ 29-2의 제안 관련 코드·시험이 남아 있지 않다
// 3번 게이트: ① 선 하나 옆에 쓰면 대상이 **1개**로 정해진다 ② 정말로 겹칠 때만 선택이
//   생긴다 ③ 기본 대상이 의도와 일치하는 비율을 픽스처로 재고 **수치로 보고**한다
//
// ⚠ **D-2(재현 먼저)**: ③은 **옛 규칙(근접만 — `pickTargetAt`)을 같은 픽스처에서 나란히
//   돌린다.** 그 함수는 지금도 앱에 있다(1단계 탭 고르기의 자리) — 그래서 「전」이 흉내가
//   아니라 실제 코드다. 옛 규칙이 지는 칸이 있어야 이 표가 무언가를 잰다(D-3의 반증 조건).

import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, type Session } from './session'
import {
  handwritingGroup, writingStrokes, applyRecognized,
  pickTargetAt, dimLabelPos, pickDimLabel, moveDim, setDimension, undo, redo,
  addLayer, setActiveLayer, writeTargetAt,
} from '../src/app/state'
import { recognizeDigitsNet } from '../src/core/handwriting'
import { parseDim } from '../src/core/dim'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { project } from '../src/core/camera'
import { C } from '../src/core/constants'
import { write } from './glyphs'
import type { Pt } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 줄 나누기 — 파일을 훑는 팔 셋이 같은 것을 쓴다 */
const SPLIT_NL = /\r?\n/
const W = 1200, H = 800

function closed(): Session {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 3D로 서는 장면 — 지평선에서 내려 그은 세로 둘과 그 사이의 가로·물러나는 선.
 *  ⚠ 아무 선이나 3D가 되지 않는다(지면 앵커에서 사슬이 선다) — 픽스처의 좌표가 그 규칙을
 *  따른다. `bot`은 **거의 가로**라 그 곁의 글씨가 눕지 않는다(인식이 도는 자리다). */
function scene() {
  const s = closed()
  const v1 = s.draw(380, 560, 380, 740)!
  const v2 = s.draw(820, 560, 820, 700)!
  const bot = s.draw(380, 740, 820, 700)!
  const rec = s.draw(380, 740, 600, 650)!
  for (const x of [v1, v2, bot, rec]) expect(s.app.lift.lifted.has(x.id)).toBe(true)
  return { s, v1, v2, bot, rec }
}

/** 그 획의 **화면 선분**(지금 포즈에서) */
function segOf(s: Session, id: number): { a: Pt; b: Pt } | null {
  const g = s.app.lift.lifted.get(id)
  if (!g) return null
  const a = project(s.app.lift.an, s.app.pose, g.a3)
  const b = project(s.app.lift.an, s.app.pose, g.b3)
  return a && b ? { a, b } : null
}

/** 도면 관행대로 **그 선과 나란히·가운데쯤·조금 떨어져** 쓴다.
 *  `t`가 선을 따라간 자리(0.5 = 가운데), `off`가 수직 거리(px), `side`가 어느 쪽. */
function writeAlong(
  s: Session, text: string, id: number,
  { t = 0.5, off = 24, side = 1, jit = 0.6, seed = 31, rot = true } = {},
): number[] {
  const seg = segOf(s, id)
  if (!seg) return []
  const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y
  const L = Math.hypot(dx, dy)
  const ux = dx / L, uy = dy / L
  const cx = seg.a.x + dx * t + (-uy) * off * side
  const cy = seg.a.y + dy * t + (ux) * off * side
  const strokes = write(text, 0, 0, seed, jit)          // 원점 근처의 수평 글씨
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const st of strokes) for (const p of st) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  const ids: number[] = []
  for (const st of strokes) {
    // `rot`이면 선 방향으로 눕혀 쓰고(도면 관행), 아니면 **똑바로** 쓴다(사람이 실제로
    // 세로 선 곁에서 하는 것 — 글자를 눕히지 않는다). 대상 판정은 둘 다 돌아야 한다.
    const put = st.map(p => {
      const px = p.x - mx, py = p.y - my
      return rot
        ? { x: cx + px * ux - py * uy, y: cy + px * uy + py * ux }
        : { x: cx + px, y: cy + py }
    })
    // ⚠⚠ **web2-39**: 글씨는 «상태 안에서만» 쓰인다. 종전에는 `s.stroke`로 그냥 그으면
    //    32-1의 뭉치 판정이 그것을 글씨로 돌렸다 — 그 층이 사라졌으므로 팔도 **앱이 실제로
    //    지나는 길**(꾹 누름 → 글씨 획)로 바꿨다. 시각은 획마다 100ms씩 흘린다.
    const r = s.write(put, (clock += 100)).s
    if (r) ids.push(r.id)
  }
  return ids
}

/** 팔의 가짜 시계(ms) — `write`가 「손이 멈췄는가」를 이 값으로 본다(#73 ㉡ · 주입) */
let clock = 0

/** **선을 꾹 눌러 글씨 상태로 들어간다**(web2-39 1번) — `writeAlong` 앞에 온다. */
function enter(s: Session, id: number): 'dim' | 'line' | null {
  clock = 0
  const seg = segOf(s, id)!
  return s.hold({ x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }, clock)
}

/** main.ts가 하는 것과 **같은 순서**(#54): 글씨 뭉치 → 인식 → 파싱 → 즉시 적용.
 *  ⚠ web2-39부터 그 사슬의 정본은 `state.applyRecognized` 하나다 — 팔이 사슬을 새로
 *  안 짓는다(#62). 여기 남는 것은 «읽은 문자열을 함께 보여주는 것»뿐이다. */
function writeDim(s: Session): { text: string; mm: number | null; result: string; ids: number[] } {
  const ids = handwritingGroup(s.app)
  if (ids.length === 0) return { text: '', mm: null, result: 'none', ids }
  const text = recognizeDigitsNet(writingStrokes(s.app, ids))
  const mm = parseDim(text, s.app.doc.unit)
  return { text, mm, result: applyRecognized(s.app, text), ids }
}

describe('32-2 즉시 치수선 — 승인 단계가 없다', () => {
  it('① 숫자를 쓰면 그 자리에서 치수가 선다 · ③ 실행취소 한 번에 손글씨로 돌아간다', () => {
    const { s, bot: line } = scene()
    const before = s.app.doc.strokes.length
    expect(enter(s, line.id), '선을 꾹 눌러 글씨 상태로 들어간다(web2-39)').toBe('line')
    writeAlong(s, '2500', line.id, { off: 26, rot: false, seed: 7, jit: 0.5 })
    const wrote = s.app.doc.strokes.length
    const r = writeDim(s)
    console.log(`[32-2 ①] 읽음 "${r.text}" → ${r.mm}mm · 결과 ${r.result} · 획 ${before}→${wrote}→${s.app.doc.strokes.length}`)
    expect(r.mm, '「2500」이 읽힌다').toBe(2500)
    expect(r.result === 'scale' || r.result === 'applied', '승인 없이 적용된다').toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === line.id)!.dim).toBe(2500)
    expect(s.app.doc.strokes.length, '손글씨는 걷힌다').toBe(before)

    undo(s.app)
    console.log(`[32-2 ③] 실행취소 뒤 — 획 ${s.app.doc.strokes.length} · dim ${s.app.doc.strokes.find(x => x.id === line.id)!.dim}`)
    expect(s.app.doc.strokes.length, '손글씨가 돌아온다').toBe(wrote)
    expect(s.app.doc.strokes.find(x => x.id === line.id)!.dim, '값도 그 전으로').toBeUndefined()
    redo(s.app)
    expect(s.app.doc.strokes.find(x => x.id === line.id)!.dim, '다시 실행도 선다').toBe(2500)
    expect(s.app.doc.strokes.length).toBe(before)
  })

  it('② 치수 숫자를 눌러 고친다 — 고친 값이 저장·복원을 왕복하고, 대상도 옮겨진다', () => {
    const { s, bot: line, rec: other } = scene()
    expect(enter(s, line.id)).toBe('line')
    writeAlong(s, '2500', line.id, { off: 26, rot: false, seed: 7, jit: 0.5 })
    expect(writeDim(s).mm).toBe(2500)

    const pos = dimLabelPos(s.app, line.id)!
    expect(pos, '치수 숫자에 자리가 있다').toBeTruthy()
    expect(pickDimLabel(s.app, pos), '그 자리를 누르면 그 치수가 잡힌다').toBe(line.id)
    // 빗나가면 안 잡힌다(반증) — 대역 밖 한 뼘
    expect(pickDimLabel(s.app, { x: pos.x + C.DIM_LABEL_HIT_PX * 3, y: pos.y + C.DIM_LABEL_HIT_PX * 3 })).toBeNull()

    // 값 고치기 — 만든 자리와 **같은 함수**(setDimension)를 다시 부른다
    pickDimLabel(s.app, pos)
    expect(setDimension(s.app, line.id, 3200)).toBe('applied')
    const back = parseBrnl(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, drawView: s.app.drawView }))!
    console.log(`[32-2 ②] 고친 값 ${back.doc.strokes.find(x => x.id === line.id)!.dim}`)
    expect(back.doc.strokes.find(x => x.id === line.id)!.dim).toBe(3200)

    // 대상 옮기기(32-3의 사후 수정) — 값이 통째로 옮겨 간다
    const r = moveDim(s.app, line.id, other.id)
    console.log(`[32-2 ②'] 대상 옮김 — ${r} · 옛 ${s.app.doc.strokes.find(x => x.id === line.id)!.dim} · 새 ${s.app.doc.strokes.find(x => x.id === other.id)!.dim}`)
    expect(r === 'applied' || r === 'scale').toBe(true)
    expect(s.app.doc.strokes.find(x => x.id === line.id)!.dim).toBeUndefined()
    expect(s.app.doc.strokes.find(x => x.id === other.id)!.dim).toBe(3200)
  })

  it('④ 옐로에서는 아무 일도 안 난다(32-8 — 거기서 쓰는 숫자는 메모다)', () => {
    const { s, bot: line } = scene()
    const lay = addLayer(s.app, 'yellow', { W, H })!
    setActiveLayer(s.app, lay.id)
    // ⚠⚠ **web2-39**: 옐로의 문이 «뭉치 판정 안»에서 «진입 판정»으로 옮겨 왔다
    //    (`writeTargetAt`의 `yellowActive`). 그래서 이 팔이 묻는 것도 옮긴다 —
    //    「뭉치가 안 선다」가 아니라 **「꾹 눌러도 잡히는 것이 없다」**다. 결과는 같고
    //    (치수가 안 붙는다) 재는 자리가 그 앞으로 갔다.
    const seg = segOf(s, line.id)!
    expect(writeTargetAt(s.app, { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }),
      '옐로에서는 꾹 눌러도 대상이 안 잡힌다').toBeNull()
    expect(enter(s, line.id)).toBeNull()
    writeAlong(s, '2500', line.id, { off: 26, rot: false, seed: 7, jit: 0.5 })
    const r = writeDim(s)
    console.log(`[32-2 ④] 옐로 — 뭉치 ${r.ids.length} · 결과 ${r.result}`)
    expect(r.ids.length, '글씨 뭉치가 안 선다').toBe(0)
    expect(s.app.doc.strokes.find(x => x.id === line.id)!.dim, '치수도 안 붙는다').toBeUndefined()
  })

  it('⑤ 29-2의 제안 층이 남아 있지 않다 (코드·시험·화면)', () => {
    const dead = /app\.dimSuggest|dimSuggest[:.]|proposeDim\(|acceptSuggest\(|dismissSuggest\(|retargetSuggest\(|dimIgnored|id="dimsuggest"|#dimsuggest\s*\{/
    const files = ['../src/app/state.ts', '../src/app/main.ts', '../src/app/input.ts', '../index.html']
    const hits: string[] = []
    for (const f of files) {
      const body = readFileSync(resolve(HERE, f), 'utf8')
      // **주석은 코드가 아니다** — 걷어냈다는 기록은 남는다(그것이 다음 회차가 읽을 자리다).
      for (const line of body.split('\n')) {
        if (!dead.test(line)) continue
        const t = line.trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
        hits.push(`${f}: ${t.slice(0, 80)}`)
      }
    }
    console.log(`[32-2 ⑤] 남은 자리 ${hits.length}${hits.length ? ' — ' + hits.join(' / ') : ''}`)
    expect(hits).toEqual([])
    expect(existsSync(resolve(HERE, 'dimsuggest29.test.ts')), '단위 시험도 갔다').toBe(false)
    expect(existsSync(resolve(HERE, '../e2e/dimsuggest29.spec.ts')), 'e2e도 갔다').toBe(false)
  })
})

describe('32-3 대상 판정 — **web2-39가 걷었다**', () => {
  // ⛔⛔ **이 절의 팔 셋이 이 회차에 사라졌다**(2026-08-31 · web2-39 1번).
  //
  // 32-3이 풀던 물음은 「글씨 뭉치의 위치가 **어느 선**의 치수를 가리키는가」였고, 답은
  // 근접·방향 정렬·선상 위치의 가중합이었다(`dimTargetScores` · `dimTargetFor` ·
  // `dimTargetTie` · `writingFrame` + 상수 일곱). **39-1이 그 물음 자체를 없앴다** —
  // 치수를 매길 선을 **꾹 눌러** 고르고 그 선이 대상이므로 맞힐 일이 없다.
  //
  // ⚠ **팔을 지운 근거는 「통과하기 어려워서」가 아니라 「잴 대상이 없어서」다**(#19의
  //   반대 방향임을 문면에 적는다): 그 함수들이 제품에 없으므로 그 표는 **무엇도 안 잰다**.
  //   그 자리를 대신하는 팔이 `writeenter39.test.ts`의 ②(누른 그 선이 대상이다)이고,
  //   거기 픽스처는 **32-3이면 다른 답이 나왔을 배치**를 일부러 만든다.
  // ⚠ 옛 근거 표는 원장 `dimtarget32_web2.json`에 **그대로 있다**(원장은 기록이라 안 지운다).
  //   그 값을 인용하는 문서는 「그때 그랬다」로 읽는다 — 지금 제품의 거동이 아니다.

  it('대상 추정 층이 제품에 남아 있지 않다', () => {
    const dead = /dimTargetScores|dimTargetFor|dimTargetTie|writingFrame|DIM_TARGET_(REACH|W_|ALIGN_NEUTRAL|SPREAD_MIN|TIE)/
    const files = ['../src/app/state.ts', '../src/app/main.ts', '../src/app/input.ts', '../src/core/constants.ts']
    const hits: string[] = []
    for (const f of files) {
      for (const line of readFileSync(resolve(HERE, f), 'utf8').split(SPLIT_NL)) {
        if (!dead.test(line)) continue
        const t = line.trim()
        // **주석은 코드가 아니다** — 걷어냈다는 기록은 남는다(32-2 ⑤와 같은 규약)
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
        hits.push(`${f}: ${t.slice(0, 80)}`)
      }
    }
    console.log(`[32-3 걷힘] 남은 자리 ${hits.length}${hits.length ? ' — ' + hits.join(' / ') : ''}`)
    expect(hits).toEqual([])
  })

  it('32-1의 재판정 기제도 남아 있지 않다 (지시문: 쓰이지 않는 예외를 남기지 마라)', () => {
    const dead = /reclassifyWriting|untextify|writingCluster|confirmWriting|isBasis|op\.textified|TEXT_(MIN_STROKES|TURN_RAD|TURN_SEG_PX|BASIS_TOL)/
    const files = ['../src/app/state.ts', '../src/app/main.ts', '../src/app/input.ts', '../src/core/constants.ts']
    const hits: string[] = []
    for (const f of files) {
      for (const line of readFileSync(resolve(HERE, f), 'utf8').split(SPLIT_NL)) {
        if (!dead.test(line)) continue
        const t = line.trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
        hits.push(`${f}: ${t.slice(0, 80)}`)
      }
    }
    console.log(`[32-1 걷힘] 남은 자리 ${hits.length}${hits.length ? ' — ' + hits.join(' / ') : ''}`)
    expect(hits).toEqual([])
    expect(existsSync(resolve(HERE, '../src/core/scribble.ts')), '분류기 파일도 갔다').toBe(false)
    expect(existsSync(resolve(HERE, 'scribble32.test.ts')), '그 팔도 갔다').toBe(false)
  })
})
