// web2-39 — **손글씨는 선을 꾹 눌러 시작한다**의 게이트.
//
// 사용자가 실사용에서 찾은 것이 이 라운드의 전부다:
//   「세로선을 긋다가 이를 숫자 1로 인식하여 1·11·111mm 등의 수치를 의도치 않게 부여하는 문제.」
//
// ⚠⚠ **D-2(재현 먼저 · 「그것이 빨간 것을 확인한 뒤 고쳐라」)**: ①이 그 픽스처다 —
//   짧은 세로 획 셋(제도의 해칭·기둥·문설주)을 그으면 32-1의 뭉치 판정이 셋을 통째로
//   글씨로 돌리고 인식기가 **「111」**을 내고 111 mm가 획 하나에 실렸다. 수리 **전** 트리
//   (`00e6edc` — 제품 코드는 `main c48b9e4`와 같다)에서 실제로 돌려 그 값을 냈다:
//
//     ids [6,7,8] · text? [true,true,true] · handwritingGroup [6,7,8]
//     recognizeDigitsNet → "111" · parseDim → 111 · dimTargetFor → 5
//
//   원장 `writeenter39_web2.json`의 `before_repair`가 그 수를 들고, 같은 자리를 다시 재는
//   명령도 그 안에 적었다(`git stash` 없이 그 커밋을 꺼내 돌린다).
//
// ⚠ **D-3(반증 조건 — 새 검사에는 «실패하는 조건»을 붙이고 실제로 실패시킨다)**:
//   ㉠ ①의 반증은 **같은 픽스처를 글씨 상태 «안»에서** 긋는 것이다 — 그때는 셋이 전부
//      글씨가 되고 111 mm가 실린다(①의 단언이 그 판에서 실제로 뒤집힌다). 즉 ①이 재는
//      것은 「인식기가 못 읽는다」가 아니라 **「언제 읽는가」**다.
//   ㉡ ③(상태 밖 전수)의 반증은 ㉠과 같은 축이고 **조합 전수**로 돈다.
//   ㉢ ⑤(축에 안 붙는다)의 반증은 **같은 획을 작도선으로** 긋는 것이다 — 그쪽은 붙는다.
//      붙는 판이 없으면 「안 붙는다」가 아무것도 안 잰다(그 획이 원래 축에서 멀 수 있다).
//   ㉣ ⑦(설정 값이 먹힌다)의 반증은 **값을 바꿔도 같은 결과가 나오는 것**이다 —
//      `driftAllowPx`가 `writeHoldMs`에 실제로 따라 움직이는지를 값으로 낸다.
//
// 게이트(지시문 「게이트」 절 그대로):
//   ① 세로 작도선을 여러 개 그어도 치수가 생기지 않는다      ← 이 라운드의 반증 조건
//   ② 꾹 누른 뒤 쓴 숫자가 **그 선의** 치수가 된다(대상 추정 ⛔)
//   ③ 글씨 상태 밖에서 그은 획은 예외 없이 작도선이다(조합 전수)
//   ④ 멈춤으로 끝난다 / 먼 곳의 새 획으로 끝난다(둘 다)
//   ⑤ 글씨 상태에서 획이 축에 안 붙는다
//   ⑥ 치수 숫자를 꾹 눌러 고칠 수 있다
//   ⑦ 누름 시간이 설정에서 바뀌고 그 값이 실제로 먹힌다
//   ⑧ 옐로의 거동 무회귀
//   ⑨ 32-2의 즉시 변환 자체는 유지된다(바뀌는 것은 «언제 읽는가»다)

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, type Session } from './session'
import {
  applyRecognized, handwritingGroup, writingStrokes, writeActive, writeTargetAt,
  addLayer, setActiveLayer, undo, endWriting, dimLabelPos, pickTargetAt,
} from '../src/app/state'
import { project } from '../src/core/camera'
import { write as writeGlyphs } from './glyphs'
import { recognizeDigitsNet } from '../src/core/handwriting'
import { parseDim } from '../src/core/dim'
import { isText } from '../src/core/types'
import { driftAllowPx } from '../src/core/hold'
import { writeFar, writeIdle, boxOfPts } from '../src/core/writing'
import { C, WRITE_HOLD_MS_MIN, WRITE_HOLD_MS_MAX } from '../src/core/constants'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import type { Pt } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800

/** 원장은 **모든 팔의 수가 모인 뒤에 한 번** 쓴다(#25 — 콘솔에만 있는 수를 안 남긴다) */
const L: Record<string, unknown> = {}
function writeLedger() {
  const out = resolve(HERE, '../../stage0/out/writeenter39_web2.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(L, null, 2))
}

function closed(): Session {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

/** 3D로 서는 장면 — `writedim32.test`의 그것과 같은 좌표다(#54: 픽스처를 새로 안 짓는다) */
function scene() {
  const s = closed()
  const v1 = s.draw(380, 560, 380, 740)!
  const v2 = s.draw(820, 560, 820, 700)!
  const bot = s.draw(380, 740, 820, 700)!
  const rec = s.draw(380, 740, 600, 650)!
  for (const x of [v1, v2, bot, rec]) expect(s.app.lift.lifted.has(x.id)).toBe(true)
  return { s, v1, v2, bot, rec }
}

/** **사용자가 겪은 그 획들** — 짧은 평행 세로선 셋(해칭·기둥·문설주). 자리는 `bot`
 *  곁이라 32-1이면 그 획의 치수가 된다. 좌표를 인자로 열어 ③이 대역을 훑는다. */
const HATCH = (x0: number, y: number, n: number, dx: number, len: number): Pt[][] =>
  Array.from({ length: n }, (_, i) => [
    { x: x0 + i * dx, y }, { x: x0 + i * dx, y: y + len / 2 }, { x: x0 + i * dx, y: y + len },
  ])

/** 그 획의 **화면 가운데**(문서 좌표 — 팔의 배율은 1이라 둘이 같다).
 *  ⚠ 3D 중점을 그냥 쓰면 안 된다 — 사영을 지나야 사람이 누르는 자리와 같아진다. */
const midOf = (s: Session, id: number): Pt => {
  const g = s.app.lift.lifted.get(id)!
  const a = project(s.app.lift.an, s.app.pose, g.a3)!
  const b = project(s.app.lift.an, s.app.pose, g.b3)!
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** 그 획의 화면 선분(양 끝) */
const segOf = (s: Session, id: number): { a: Pt; b: Pt } => {
  const g = s.app.lift.lifted.get(id)!
  return {
    a: project(s.app.lift.an, s.app.pose, g.a3)!,
    b: project(s.app.lift.an, s.app.pose, g.b3)!,
  }
}

/** 그 선 위에서 `q`에 가장 가까운 점 — **사람이 누르는 자리**다.
 *  ⚠⚠ 팔이 이것을 쓰는 이유: 39-3 ②의 「먼 곳」 문이 **첫 획부터** 서 있고 그 씨앗이
 *  누른 자리이므로, 선 한가운데를 누르고 화면 반대편에 쓰면 그 획은 **작도선이 된다**
 *  (그것이 규칙이다). 실사용에서 사람은 **누른 그 자리 곁에** 쓴다. */
const nearestOn = (s: Session, id: number, q: Pt): Pt => {
  const { a, b } = segOf(s, id)
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return { ...a }
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

/** 그 선을 **쓸 자리 곁에서** 꾹 누른다 — 진입 판정과 뭉치 씨앗을 한 번에 놓는다 */
const pressNear = (s: Session, id: number, q: Pt, now = 0) => s.hold(nearestOn(s, id, q), now)

/** 지금 문서에 실린 치수 전부 */
const dimsOf = (s: Session): { id: number; mm: number }[] =>
  s.app.doc.strokes.filter(x => x.dim !== undefined).map(x => ({ id: x.id, mm: x.dim! }))

// ── ① 세로 작도선을 여러 개 그어도 치수가 생기지 않는다 ───────────────────────

describe('39 ① 세로 작도선 여럿 — 치수가 안 생긴다 (이 라운드의 반증 조건)', () => {
  it('해칭 셋을 그으면 글씨 0 · 치수 0이고, **같은 획을 글씨 상태 안에서** 그으면 셋 다 글씨다', () => {
    // ─ 상태 «밖» — 사용자가 겪은 그 동작 ─────────────────────────────────
    const out = scene()
    const outIds: number[] = []
    for (const st of HATCH(500, 640, 3, 30, 40)) {
      const r = out.s.stroke(st)
      if (r) outIds.push(r.id)
    }
    const outText = outIds.filter(id => isText(out.s.app.doc.strokes.find(x => x.id === id)!)).length
    const outGroup = handwritingGroup(out.s.app)
    const outDims = dimsOf(out.s)

    // ─ 상태 «안» — **같은 좌표·같은 획**(D-3 ㉠: 이 검사가 실패하는 조건) ──
    const inn = scene()
    expect(pressNear(inn.s, inn.bot.id, { x: 530, y: 660 }, 0)).toBe('line')
    const innIds: number[] = []
    let t = 0
    for (const st of HATCH(500, 640, 3, 30, 40)) {
      const r = inn.s.write(st, (t += 100))
      if (r.s) innIds.push(r.s.id)
    }
    const innText = innIds.filter(id => isText(inn.s.app.doc.strokes.find(x => x.id === id)!)).length
    const innGroup = handwritingGroup(inn.s.app)
    // 앱이 실제로 읽는 사슬을 그대로 태운다(#54 — 팔이 사슬을 새로 안 짓는다)
    const innText3 = recognizeDigitsNet(writingStrokes(inn.s.app, innGroup))
    const innMm = parseDim(innText3, inn.s.app.doc.unit)
    applyRecognized(inn.s.app, innText3)
    const innDims = dimsOf(inn.s)

    L['gate1_hatching'] = {
      what: '짧은 평행 세로선 셋(해칭) — 사용자가 보고한 그 동작. **좌표가 같고 상태만 다르다**',
      outside: { strokes: outIds.length, text_marked: outText, group: outGroup.length, dims: outDims },
      inside: {
        strokes: innIds.length, text_marked: innText, group: innGroup.length,
        recognized: innText3, parsed_mm: innMm, dims: innDims, target: inn.bot.id,
      },
      falsification: '**같은 획을 글씨 상태 안에서 그으면 ①의 단언이 실제로 뒤집힌다**'
        + '(글씨 0 → 3 · 치수 0 → 1). 그러므로 ①이 재는 것은 「인식기가 못 읽는다」가 아니라'
        + ' **「언제 읽는가」**다 — 인식기는 그대로이고 「111」을 여전히 읽는다.',
      before_repair: {
        tree: '00e6edc (제품 코드는 main c48b9e4와 같다 — §0은 문서만 고쳤다)',
        how: 'git worktree add … 00e6edc 뒤 그 트리에서 같은 픽스처를 돌린다',
        text_marked: 3, group: 3, recognized: '111', parsed_mm: 111, target_via_32_3: 5,
        note: '**수리 전에는 상태 밖에서 이 값이 났다.** 32-1의 뭉치 판정이 셋을 글씨로 돌리고'
          + ' 32-3이 곁의 3D 획을 대상으로 골랐다.',
      },
    }

    // 상태 밖 — 아무것도 안 일어난다
    expect(outText).toBe(0)
    expect(outGroup.length).toBe(0)
    expect(outDims.length).toBe(0)
    // 상태 안 — 그 반대다(반증 조건이 실제로 서는지 확인한다)
    expect(innText).toBe(3)
    expect(innText3).toBe('111')          // 인식기는 안 건드렸다 — 여전히 「111」로 읽는다
    expect(innDims.length).toBe(1)
    expect(innDims[0]!.id).toBe(inn.bot.id)
  })

  it('길이·간격·개수를 바꿔도 상태 밖에서는 언제나 0이다 (픽스처가 좁지 않다 — D-5)', () => {
    const rows: { n: number; dx: number; len: number; text: number; dims: number }[] = []
    for (const n of [2, 3, 4]) {
      for (const dx of [12, 30, 55]) {
        for (const len of [14, 40, 90]) {
          const s = scene().s
          const ids: number[] = []
          for (const st of HATCH(500, 640, n, dx, len)) {
            const r = s.stroke(st)
            if (r) ids.push(r.id)
          }
          const tx = ids.filter(id => isText(s.app.doc.strokes.find(x => x.id === id)!)).length
          rows.push({ n, dx, len, text: tx, dims: dimsOf(s).length })
        }
      }
    }
    L['gate1_band'] = {
      what: '개수 × 간격 × 길이 = 27칸. 32-1의 뭉치 문(크기 60px · 간격 1.2배 · 최소 2획)을 '
        + '**양쪽으로** 넘나드는 대역이다(D-5: 픽스처가 실사용 대역을 덮는가).',
      cells: rows.length,
      text_marked_total: rows.reduce((a, r) => a + r.text, 0),
      dims_total: rows.reduce((a, r) => a + r.dims, 0),
      rows,
    }
    expect(rows.every(r => r.text === 0 && r.dims === 0)).toBe(true)
  })
})

// ── ② 꾹 누른 그 선이 대상이다 (대상 추정 ⛔) ────────────────────────────────

describe('39-1 ② 누른 그 선의 치수가 된다', () => {
  it('**글씨가 다른 선에 더 가까워도** 대상은 누른 선이다 — 32-3의 추정을 안 지난다', () => {
    // ⚠⚠ **「더 가깝다」를 값으로 잰다**(#92: 세는 차이가 무엇을 바꾸는가). 32-3은
    //    사라졌으므로 그 점수표를 부를 수 없다 — 대신 **지금도 살아 있는 근접 판정**
    //    (`pickTargetAt`, 1단계 탭 고르기의 자리)으로 「이 자리에서 가장 가까운 3D 획」을
    //    내고, 그것이 **누른 선과 다른 칸만** 고른다. 그 칸이 없으면 이 팔은 아무것도
    //    안 잰다(그래서 칸 수를 원장에 적고 0이면 빨개진다).
    const rows: {
      target: number; nearestToWriting: number | null; got: number | null; mm: number | null
    }[] = []
    const CASES: { line: 'bot' | 'v1' | 'rec'; at: Pt }[] = [
      { line: 'bot', at: { x: 398, y: 716 } },   // v1·rec이 만나는 모서리 곁
      { line: 'v1', at: { x: 400, y: 726 } },
      { line: 'rec', at: { x: 392, y: 734 } },
      { line: 'bot', at: { x: 404, y: 706 } },
    ]
    for (const c of CASES) {
      const sc = scene()
      const target = (sc[c.line] as { id: number }).id
      // 「쓸 자리에서 가장 가까운 3D 획」 — 대역은 앱이 쓰는 그것(#88: 팔이 다시 안 적는다)
      const nearest = pickTargetAt(sc.s.app, c.at, sc.s.app.osnap.radius / sc.s.app.view.s * 2)
      expect(pressNear(sc.s, target, c.at, 0)).toBe('line')
      let t = 0
      for (const st of glyphStrokes('25', c.at.x, c.at.y - 34)) sc.s.write(st, (t += 100))
      const ids = handwritingGroup(sc.s.app)
      applyRecognized(sc.s.app, recognizeDigitsNet(writingStrokes(sc.s.app, ids)))
      const got = dimsOf(sc.s)
      rows.push({
        target, nearestToWriting: nearest,
        got: got.length === 1 ? got[0]!.id : null, mm: got.length === 1 ? got[0]!.mm : null,
      })
      expect(got.length).toBe(1)
      expect(got[0]!.id).toBe(target)     // ← 쓴 자리가 아니라 **누른 선**이다
    }
    const differ = rows.filter(r => r.nearestToWriting !== null && r.nearestToWriting !== r.target)
    L['gate2_target_is_pressed_line'] = {
      what: '누른 선과 «글씨를 쓴 자리에서 가장 가까운 3D 획»이 갈리는 칸을 골랐다. '
        + '32-3(근접·정렬·선상 위치의 가중합)이었다면 근접 항이 다른 선을 밀었을 자리다.',
      cases: rows,
      cells_where_nearest_differs: differ.length,
      of: rows.length,
      hit_on_pressed_line: rows.filter(r => r.got === r.target).length,
      falsification: '**갈리는 칸이 0이면 이 팔은 아무것도 안 잰다** — 그때는 「누른 선이 '
        + '이겼다」가 「가까운 선이 이겼다」와 우연히 같다(#92의 형태). 그래서 그 수를 '
        + '원장에 적고 게이트로도 건다.',
      note: '`dimTargetFor`·`dimTargetScores`·`dimTargetTie`는 **이 회차에 사라졌다** — '
        + '맞힐 일이 없으므로 맞히는 층을 안 남긴다(쓰이지 않는 예외 ⛔).',
    }
    expect(differ.length, '두 답이 갈리는 칸이 있어야 이 팔이 무언가를 잰다').toBeGreaterThan(0)
  })

  it('빈 곳을 꾹 눌러 들어가는 길이 **없다** (지시문 ⛔)', () => {
    const { s } = scene()
    const empty: Pt[] = [{ x: 60, y: 120 }, { x: 1150, y: 90 }, { x: 640, y: 250 }]
    const hits = empty.map(p => writeTargetAt(s.app, p))
    L['gate2_no_empty_entry'] = {
      what: '빈 곳 셋을 꾹 눌러 본다. 대상 없는 글씨는 **옐로에서** 한다(지시문).',
      probes: empty.map((p, i) => ({ p, hit: hits[i] })),
    }
    for (const p of empty) {
      expect(writeTargetAt(s.app, p)).toBeNull()
      expect(s.hold(p, 0)).toBeNull()
      expect(writeActive(s.app)).toBe(false)
    }
  })
})

// ── ③ 상태 밖에서 그은 획은 예외 없이 작도선이다 (조합 전수) ─────────────────

describe('39-2 ③ 상태 밖 = 전부 작도선 (조합 전수)', () => {
  it('자형 × 자리 × 흔들기 전수에서 글씨 0 — 그리고 같은 표가 상태 안에서 전부 글씨다', () => {
    const TEXTS = ['1', '11', '111', '4', '25', '2500', '3.5', '0']
    const SPOTS: [number, number][] = [[380, 430], [520, 620], [700, 690], [860, 520]]
    const JITS = [0, 0.6, 1.4]
    const outRows: { text: string; spot: string; jit: number; marked: number; dims: number }[] = []
    const inRows: { text: string; spot: string; jit: number; marked: number; dims: number }[] = []
    for (const txt of TEXTS) {
      for (const [x, y] of SPOTS) {
        for (const jit of JITS) {
          // 상태 «밖»
          {
            const sc = scene()
            const ids: number[] = []
            for (const st of glyphStrokes(txt, x, y, jit)) {
              const r = sc.s.stroke(st)
              if (r) ids.push(r.id)
            }
            outRows.push({
              text: txt, spot: `${x},${y}`, jit,
              marked: ids.filter(id => isText(sc.s.app.doc.strokes.find(z => z.id === id)!)).length,
              dims: dimsOf(sc.s).length,
            })
          }
          // 상태 «안» — **같은 자형·같은 흔들기**(D-3 ㉡: 이 전수가 실패하는 조건).
          // ⚠ **자리 축은 여기서 접힌다**: 39-3 ②의 「먼 곳」 문이 첫 획부터 서 있으므로
          //   화면 반대편에 쓰면 그 획은 **규칙대로** 작도선이 된다(그것이 ④의 게이트다).
          //   그래서 안쪽 판은 «누른 자리 곁»에서 돌고, 자리 축은 밖의 96칸이 든다.
          {
            const sc = scene()
            expect(pressNear(sc.s, sc.bot.id, { x, y }, 0)).toBe('line')
            const near = nearestOn(sc.s, sc.bot.id, { x, y })
            const ids: number[] = []
            let t = 0
            for (const st of glyphStrokes(txt, near.x + 6, near.y - 40, jit)) {
              const r = sc.s.write(st, (t += 100))
              if (r.s) ids.push(r.s.id)
            }
            const g = handwritingGroup(sc.s.app)
            applyRecognized(sc.s.app, recognizeDigitsNet(writingStrokes(sc.s.app, g)))
            inRows.push({
              text: txt, spot: `${near.x.toFixed(0)},${near.y.toFixed(0)}(누른 자리 곁)`, jit,
              // 실린 뒤에는 글씨 획이 **걷혀서** 문서에 없다 — 그것도 「글씨였다」의 증거다
              marked: ids.filter(id => {
                const z = sc.s.app.doc.strokes.find(q => q.id === id)
                return z === undefined || isText(z)
              }).length,
              dims: dimsOf(sc.s).length,
            })
          }
        }
      }
    }
    L['gate3_outside_is_construction'] = {
      what: '자형 8 × 자리 4 × 흔들기 3 = 96칸을 **상태 밖과 안에서 각각** 돌렸다.',
      cells: outRows.length,
      outside: {
        marked_total: outRows.reduce((a, r) => a + r.marked, 0),
        dims_total: outRows.reduce((a, r) => a + r.dims, 0),
      },
      inside: {
        marked_total: inRows.reduce((a, r) => a + r.marked, 0),
        of_strokes: inRows.length,
        dims_total: inRows.reduce((a, r) => a + r.dims, 0),
      },
      falsification: '**상태 안에서는 같은 96칸이 전부 글씨다** — 「예외 없이 작도선」이 '
        + '재는 것이 상태이지 자형이 아님을 이 대조가 낸다(#92: 세는 차이가 무엇을 바꾸는가).',
      outside_rows: outRows,
    }
    expect(outRows.every(r => r.marked === 0 && r.dims === 0)).toBe(true)
    // 반증판이 실제로 서는가 — 안 서면 위 전수는 아무것도 안 잰다(D-3)
    expect(inRows.reduce((a, r) => a + r.marked, 0)).toBeGreaterThan(0)
    expect(inRows.reduce((a, r) => a + r.dims, 0)).toBeGreaterThan(0)
  })
})

// ── ④ 종료는 자동이다 — 멈춤 · 먼 곳 (둘 다) ────────────────────────────────

describe('39-3 ④ 종료 — 멈춤과 먼 곳, 둘 다', () => {
  it('멈춤: WRITE_IDLE_MS 아래는 이어지고 위는 끝난다 (양끝)', () => {
    const rows: { gapMs: number; asText: boolean; active: boolean }[] = []
    for (const gap of [0, C.WRITE_IDLE_MS - 1, C.WRITE_IDLE_MS, C.WRITE_IDLE_MS * 3]) {
      const sc = scene()
      expect(sc.s.hold(midOf(sc.s, sc.bot.id), 0)).toBe('line')
      const at = midOf(sc.s, sc.bot.id)
      const g = glyphStrokes('2', at.x, at.y - 40)
      sc.s.write(g[0]!, 100)
      const second = sc.s.write(glyphStrokes('5', at.x + 30, at.y - 40)[0]!, 100 + gap)
      rows.push({ gapMs: gap, asText: second.asText, active: writeActive(sc.s.app) })
    }
    L['gate4_idle'] = {
      what: '두 획 사이의 쉼을 문(`WRITE_IDLE_MS`)의 양끝으로 흔든다. 순수 판정은 '
        + '`core/writing.writeIdle`이고 앱과 팔이 같은 것을 부른다(#62).',
      threshold_ms: C.WRITE_IDLE_MS,
      rows,
      pure_check: {
        just_below: writeIdle(0, C.WRITE_IDLE_MS - 1, C.WRITE_IDLE_MS),
        at: writeIdle(0, C.WRITE_IDLE_MS, C.WRITE_IDLE_MS),
      },
    }
    expect(rows[0]!.asText).toBe(true)
    expect(rows[1]!.asText).toBe(true)
    expect(rows[2]!.asText).toBe(false)
    expect(rows[3]!.asText).toBe(false)
  })

  it('먼 곳: 뭉치에서 문 밖에 새 획이 오면 **그 획은 작도선이고** 상태가 끝난다', () => {
    const rows: { gapPx: number; asText: boolean; active: boolean; lifted: boolean }[] = []
    const far = C.DIM_GLYPH_MAX_PX * C.DIM_GROUP_SPAN            // 문(화면 px · 배율 1)
    for (const gap of [4, far - 4, far + 4, far * 3]) {
      const sc = scene()
      const at = midOf(sc.s, sc.bot.id)
      expect(pressNear(sc.s, sc.bot.id, { x: at.x, y: at.y - 40 }, 0)).toBe('line')
      const first = glyphStrokes('2', at.x, at.y - 40)
      sc.s.write(first[0]!, 100)
      // **뭉치 상자를 앱에서 읽는다**(#88 — 팔이 그 상자를 다시 계산하면 앱이 씨앗을
      // 부풀리는 것 같은 변경에서 조용히 갈린다. 실제로 그렇게 한 번 빨갰다).
      const b = sc.s.app.write!.box!
      const nx = b.x1 + gap
      const r = sc.s.write([{ x: nx, y: at.y - 40 }, { x: nx + 4, y: at.y - 8 }, { x: nx + 8, y: at.y }], 150)
      rows.push({
        gapPx: gap, asText: r.asText, active: writeActive(sc.s.app),
        lifted: r.s !== null && sc.s.app.lift.lifted.has(r.s.id),
      })
    }
    L['gate4_far'] = {
      what: '뭉치 상자에서의 **간격**을 문(`DIM_GLYPH_MAX_PX × DIM_GROUP_SPAN`)의 양끝으로 '
        + '흔든다. ⚠ 중심 거리가 아니라 **간격**이다 — 중심으로 재면 자릿수가 늘수록 '
        + '다음 자리가 «멀어진다»(32-3의 `unit`이 대각에서 짧은 변으로 바뀐 것과 같은 형태).',
      threshold_px: far,
      rows,
      pure_check: {
        inside: writeFar({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10 + far - 1, y0: 0, x1: 20 + far, y1: 10 },
          C.DIM_GLYPH_MAX_PX, C.DIM_GROUP_SPAN),
        outside: writeFar({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10 + far + 1, y0: 0, x1: 20 + far, y1: 10 },
          C.DIM_GLYPH_MAX_PX, C.DIM_GROUP_SPAN),
      },
      note: '**먼 획은 글씨가 아니라 작도선이 된다** — 판정이 «획이 시작될 때» 나므로 그 획이 '
        + '오스냅·축을 그대로 지난다. 끝난 뒤에 판정하면 「아무데도 안 붙은 작도선」이 된다.',
    }
    expect(rows[0]!.asText).toBe(true)
    expect(rows[1]!.asText).toBe(true)
    expect(rows[2]!.asText).toBe(false)
    expect(rows[3]!.asText).toBe(false)
    expect(rows[2]!.active).toBe(false)
  })

  it('종료 «제스처»가 없다 — 상태를 끝내는 입구는 이 둘과 «떠남»뿐이다', () => {
    const sc = scene()
    expect(sc.s.hold(midOf(sc.s, sc.bot.id), 0)).toBe('line')
    expect(writeActive(sc.s.app)).toBe(true)
    endWriting(sc.s.app, 'left')
    expect(writeActive(sc.s.app)).toBe(false)
    L['gate4_no_gesture'] = {
      what: '`WriteEnd`의 값은 셋뿐이다 — `idle`(멈춤) · `far`(먼 곳의 새 획) · `left`'
        + '(도구·종이·문서를 떠났다). **새로 배울 몸짓이 하나도 없다**(지시문 ⛔).',
      ends: ['idle', 'far', 'left'],
    }
  })
})

// ── ⑤ 글씨 상태에서 획이 축에 안 붙는다 ──────────────────────────────────────

describe('39-4 ⑤ 글씨는 축에 안 붙는다 (피드백은 공짜로 있다)', () => {
  it('같은 획이 작도선일 때는 붙고 글씨일 때는 raw 그대로다', () => {
    // vp1을 향하는 «거의 축» 획 — 작도선이면 축 스냅이 끝점을 옮긴다
    const mk = (): Pt[] => [{ x: 470, y: 700 }, { x: 500, y: 697 }, { x: 530, y: 694 }]
    const asLine = scene()
    const ln = asLine.s.stroke(mk())!
    const asWrite = scene()
    expect(pressNear(asWrite.s, asWrite.bot.id, { x: 500, y: 697 }, 0)).toBe('line')
    const wr = asWrite.s.write(mk(), 100)
    const raw = mk()
    const dLine = Math.hypot(ln.b.x - raw[2]!.x, ln.b.y - raw[2]!.y)
    const dWrite = Math.hypot(wr.s!.b.x - raw[2]!.x, wr.s!.b.y - raw[2]!.y)
    L['gate5_no_axis_snap'] = {
      what: '**같은 점렬**을 작도선으로 한 번, 글씨로 한 번 확정한다. 잰 값은 «확정 끝점이 '
        + '손이 뗀 자리에서 얼마나 옮겨졌는가»(문서 px)다.',
      as_construction: { end: ln.b, moved_px: dLine, axis: asLine.s.app.lift.lifted.get(ln.id)?.axis ?? null },
      as_writing: { end: wr.s!.b, moved_px: dWrite, lifted: asWrite.s.app.lift.lifted.has(wr.s!.id) },
      falsification: '작도선 판이 **실제로 옮겨져야** 이 검사가 무언가를 잰다(안 옮겨지면 '
        + '「안 붙는다」가 그 획이 원래 축에서 멀었다는 뜻일 뿐이다 — D-3 ㉢).',
    }
    expect(dWrite).toBe(0)                 // 글씨는 손이 뗀 그 자리다
    expect(dLine).toBeGreaterThan(0)       // 반증판이 실제로 선다
    expect(asWrite.s.app.lift.lifted.has(wr.s!.id)).toBe(false)   // 3D도 없다(옐로 규격)
  })
})

// ── ⑥ 치수 숫자를 꾹 눌러 고친다 (39-5) ──────────────────────────────────────

describe('39-5 ⑥ 고치기도 같은 동작', () => {
  it('치수 숫자를 꾹 누르면 그 자리에 다시 쓴다 — 값이 바뀌고 대상은 그대로다', () => {
    const sc = scene()
    expect(sc.s.hold(midOf(sc.s, sc.bot.id), 0)).toBe('line')
    const at = midOf(sc.s, sc.bot.id)
    let t = 0
    for (const st of glyphStrokes('25', at.x, at.y - 40)) sc.s.write(st, (t += 100))
    applyRecognized(sc.s.app, recognizeDigitsNet(writingStrokes(sc.s.app, handwritingGroup(sc.s.app))))
    const first = dimsOf(sc.s)
    expect(first.length).toBe(1)
    endWriting(sc.s.app, 'left')

    // 숫자를 꾹 누른다 — **같은 동작**이다(39-5 문면)
    const lab = dimLabelPos(sc.s.app, first[0]!.id)!
    expect(sc.s.hold(lab, 0)).toBe('dim')
    expect(sc.s.app.write!.edit).toBe(true)
    expect(sc.s.app.write!.target).toBe(first[0]!.id)
    // ⚠ 시계를 **다시 0에서** 센다 — 진입 시각이 0이므로 여기서 1000을 넘기면 첫 획이
    //   그 자리에서 「멈춤」으로 읽힌다(팔의 초판이 그렇게 빨갰다).
    t = 0
    for (const st of glyphStrokes('50', lab.x, lab.y - 20)) sc.s.write(st, (t += 100))
    applyRecognized(sc.s.app, recognizeDigitsNet(writingStrokes(sc.s.app, handwritingGroup(sc.s.app))))
    const second = dimsOf(sc.s)
    L['gate6_edit'] = {
      what: '치수 숫자를 꾹 눌러 다시 쓴다. **진입 동작이 하나로 통일됐다** — 선을 누르는 '
        + '것도 숫자를 누르는 것도 같은 몸짓이고 갈리는 것은 «무엇이 잡혔는가»뿐이다.',
      first: first, second: second,
      target_unchanged: second.length === 1 && second[0]!.id === first[0]!.id,
      order: '판정 순서는 **숫자가 먼저**다(그 자리에 이미 뜻이 있다 — #77 ㉠). 선은 그다음.',
    }
    expect(second.length).toBe(1)
    expect(second[0]!.id).toBe(first[0]!.id)
    expect(second[0]!.mm).not.toBe(first[0]!.mm)
  })
})

// ── ⑦ 누름 시간이 설정에서 바뀌고 그 값이 먹힌다 ────────────────────────────

describe('39-1 ⑦ 누름 시간은 설정 값이다', () => {
  it('앱이 그 값을 들고, 이동 허용이 그 값을 실제로 따라 움직인다', () => {
    const s = session(W, H)
    expect(s.app.writeHoldMs).toBe(C.WRITE_HOLD_MS)
    const rows = [WRITE_HOLD_MS_MIN, 250, C.WRITE_HOLD_MS, 900, WRITE_HOLD_MS_MAX].map(ms => {
      s.app.writeHoldMs = ms
      return { ms, driftAllowPx: driftAllowPx(ms) }
    })
    L['gate7_hold_setting'] = {
      what: '`app.writeHoldMs`가 손잡이의 값이고, `input.ts`의 시계와 이동 허용이 그것을 '
        + '읽는다. 대역은 옐로 머무름과 **같은 것을 재사용**한다(#54 — 새 숫자 ⛔).',
      default_ms: C.WRITE_HOLD_MS, min: WRITE_HOLD_MS_MIN, max: WRITE_HOLD_MS_MAX,
      rows,
      falsification: '이 표가 **상수면** 손잡이가 아무것도 안 바꾸는 것이다(D-3 ㉣) — '
        + '`driftAllowPx`가 값마다 갈리는 것이 「먹힌다」의 관측량이다.',
      distinct_drift_values: new Set(rows.map(r => r.driftAllowPx)).size,
    }
    expect(C.WRITE_HOLD_MS).toBeGreaterThanOrEqual(400)
    expect(C.WRITE_HOLD_MS).toBeLessThanOrEqual(500)
    expect(new Set(rows.map(r => r.driftAllowPx)).size).toBeGreaterThan(1)
  })
})

// ── ⑧ 옐로 무회귀 · ⑨ 즉시 변환은 그대로 ────────────────────────────────────

describe('39 ⑧⑨ 옐로 무회귀 · 즉시 변환 유지', () => {
  it('옐로에서는 꾹 눌러도 잡히는 것이 없다 — 자유 스케치는 그대로다', () => {
    const sc = scene()
    const lay = addLayer(sc.s.app, 'yellow', { W, H })!
    setActiveLayer(sc.s.app, lay.id)
    const probes = [midOf(sc.s, sc.bot.id), midOf(sc.s, sc.v1.id), { x: 600, y: 300 }]
    const hits = probes.map(p => writeTargetAt(sc.s.app, p))
    // 옐로 획은 3D가 없다 — 종전 그대로
    const y = sc.s.stroke([{ x: 500, y: 300 }, { x: 520, y: 320 }, { x: 540, y: 300 }])!
    L['gate8_yellow'] = {
      what: '옐로에서 꾹 눌러 본다. **문이 하나 필요했다**(`writeTargetAt`의 `yellowActive`) — '
        + '초판은 「3D 내용 획만 보므로 자동으로 안 걸린다」고 적었고 **이 팔이 그것을 '
        + '빨갛게 잡았다**: 종이의 획은 옐로가 활성이어도 그대로 3D라 누르면 잡힌다. '
        + '그러면 옐로에 쓴 글씨가 **종이 획의 치수**가 되어 32-8의 갈림이 무너진다. '
        + '32-1은 그 문을 `writingCluster` 안에 갖고 있었고, 판정이 진입으로 옮겨졌으므로 '
        + '문도 함께 옮겨 왔다(#54가 「새 문 ⛔」이지 「있던 문을 버려라」가 아니다).',
      probes: probes.map((p, i) => ({ p, hit: hits[i] })),
      yellow_stroke: { text: isText(y), lifted: sc.s.app.lift.lifted.has(y.id) },
    }
    for (const p of probes) expect(sc.s.hold(p, 0)).toBeNull()
    expect(isText(y)).toBe(false)
    expect(sc.s.app.lift.lifted.has(y.id)).toBe(false)
  })

  it('⑨ 즉시 변환은 그대로다 — 승인 단계가 없고 실행취소 한 번에 손글씨로 돌아간다', () => {
    const sc = scene()
    expect(sc.s.hold(midOf(sc.s, sc.bot.id), 0)).toBe('line')
    const at = midOf(sc.s, sc.bot.id)
    let t = 0
    const ids: number[] = []
    for (const st of glyphStrokes('25', at.x, at.y - 40)) {
      const r = sc.s.write(st, (t += 100))
      if (r.s) ids.push(r.s.id)
    }
    const before = sc.s.app.doc.strokes.length
    applyRecognized(sc.s.app, recognizeDigitsNet(writingStrokes(sc.s.app, handwritingGroup(sc.s.app))))
    const applied = dimsOf(sc.s)
    const afterApply = sc.s.app.doc.strokes.length
    undo(sc.s.app)
    const afterUndo = dimsOf(sc.s)
    const backIds = ids.filter(id => sc.s.app.doc.strokes.some(x => x.id === id))
    // 저장·복원 왕복 — 값이 파일을 건넌다
    const sc2 = scene()
    expect(sc2.s.hold(midOf(sc2.s, sc2.bot.id), 0)).toBe('line')
    const at2 = midOf(sc2.s, sc2.bot.id)
    let t2 = 0
    for (const st of glyphStrokes('25', at2.x, at2.y - 40)) sc2.s.write(st, (t2 += 100))
    applyRecognized(sc2.s.app, recognizeDigitsNet(writingStrokes(sc2.s.app, handwritingGroup(sc2.s.app))))
    const round = parseBrnl(serializeBrnl({ doc: sc2.s.app.doc, nextId: sc2.s.app.nextId, drawView: sc2.s.app.drawView }))!
    const roundDims = round.doc.strokes.filter(x => x.dim !== undefined).map(x => x.dim)
    L['gate9_instant'] = {
      what: '「즉시 변환」은 32-2가 만든 그대로다 — 바뀐 것은 **언제 읽는가**이지 '
        + '**읽고 나서 무엇을 하는가**가 아니다(지시문 게이트 마지막 줄).',
      approval_step: null,
      strokes: { before, after_apply: afterApply, ink_removed: before - afterApply },
      applied, after_undo: afterUndo, ink_back: backIds.length,
      roundtrip_dims: roundDims,
    }
    expect(applied.length).toBe(1)
    expect(afterApply).toBeLessThan(before)      // 손글씨가 걷혔다
    expect(afterUndo.length).toBe(0)             // 실행취소 한 번에 값이 돌아간다
    expect(backIds.length).toBe(ids.length)      // 그리고 손글씨도 돌아온다
    expect(roundDims).toEqual(applied.map(d => d.mm))
  })
})

describe('원장', () => {
  it('쓴다', () => {
    L['what'] = 'web2-39 — 「손글씨는 선을 꾹 눌러 시작한다」의 게이트. 진입이 명시적이면 '
      + '「이 획이 글씨인가」와 「어느 선의 치수인가」를 **둘 다 안 묻는다**.'
    L['run'] = { fixture: 'scene() — writedim32.test와 같은 좌표', seed: 'glyphs.rng32 (Math.random ⛔)' }
    L['constants'] = {
      WRITE_HOLD_MS: C.WRITE_HOLD_MS, WRITE_IDLE_MS: C.WRITE_IDLE_MS,
      WRITE_HOLD_MS_MIN, WRITE_HOLD_MS_MAX,
      WRITE_TARGET_PX: C.WRITE_TARGET_PX, WRITE_TARGET_ALPHA: C.WRITE_TARGET_ALPHA,
      DIM_GLYPH_MAX_PX: C.DIM_GLYPH_MAX_PX, DIM_GROUP_SPAN: C.DIM_GROUP_SPAN,
      DIM_GROUP_MAX: C.DIM_GROUP_MAX, DIM_LABEL_HIT_PX: C.DIM_LABEL_HIT_PX,
    }
    L['removed_by_this_round'] = {
      mechanisms: [
        'core/scribble.ts (32-1 분류기 — featOf · confirmWriting · isBasis)',
        'state.writingCluster · reclassifyWriting · untextify (재판정 기제)',
        'Op.textified (되돌릴 판정이 없다)',
        'state.dimTargetScores · dimTargetFor · dimTargetTie · writingFrame (32-3 대상 추정)',
      ],
      constants: [
        'TEXT_MIN_STROKES', 'TEXT_TURN_RAD', 'TEXT_TURN_SEG_PX', 'TEXT_BASIS_TOL',
        'DIM_TARGET_REACH', 'DIM_TARGET_W_NEAR', 'DIM_TARGET_W_ALIGN', 'DIM_TARGET_W_ALONG',
        'DIM_TARGET_ALIGN_NEUTRAL', 'DIM_TARGET_SPREAD_MIN', 'DIM_TARGET_TIE',
      ],
      kept: 'Stroke.text(글씨 획의 규격) · 인식기 전부(32-4 · web2-35) · 32-2의 즉시 변환',
      why: '사라진 것은 **판정**이지 자료구조도 인식기도 아니다. 「인식기를 손대지 마라 — '
        + '이건 인식의 문제가 아니다」(지시문 하지 말 것).',
    }
    L['pitfalls'] = ['#92', '#54', '#61', '#62', '#12', '#82', '#90', '#91', '#42', '#77', '#73']
    L['what_this_does_not_say'] = '누름 시간(450ms)·멈춤 시간(1000ms)·강조 굵기는 **동작점**이고 '
      + '손 표본이 0이다(#12 · AS-C1 계열). 합성 자형 픽스처(`glyphs.ts`)로 돌았고 실기기 '
      + '필체·필압 표본은 여전히 0이다. 그리고 이 표는 **작도 포즈**의 것이다.'
    writeLedger()
    expect(Object.keys(L).length).toBeGreaterThan(8)
  })
})

// ── 픽스처 조각 ──────────────────────────────────────────────────────────────

/** 글자 점렬 — `glyphs.write`를 그 자리에 놓는다(#54: 자형 픽스처는 한 자리다) */
function glyphStrokes(text: string, x: number, y: number, jit = 0.6): Pt[][] {
  return writeGlyphs(text, x, y, 39, jit)
}

