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
  handwritingGroup, applyWrittenDim, dimTargetFor, dimTargetTie, dimTargetScores,
  pickTargetAt, dimLabelPos, pickDimLabel, moveDim, setDimension, undo, redo,
  addLayer, setActiveLayer,
} from '../src/app/state'
import { recognizeDigitsNet } from '../src/core/handwriting'
import { parseDim } from '../src/core/dim'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { project } from '../src/core/camera'
import { C } from '../src/core/constants'
import { write } from './glyphs'
import type { Pt } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
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
    const r = s.stroke(put)
    if (r) ids.push(r.id)
  }
  return ids
}

/** main.ts가 하는 것과 **같은 순서**(#54): 글씨 뭉치 → 인식 → 파싱 → 즉시 적용. */
function writeDim(s: Session): { text: string; mm: number | null; result: string; ids: number[] } {
  const ids = handwritingGroup(s.app)
  if (ids.length === 0) return { text: '', mm: null, result: 'none', ids }
  const strokes = ids.map(id => {
    const st = s.app.doc.strokes.find(x => x.id === id)!
    return st.raw && st.raw.length > 1 ? st.raw : [st.a, st.b]
  })
  const text = recognizeDigitsNet(strokes)
  const mm = parseDim(text, s.app.doc.unit)
  if (mm === null) return { text, mm, result: 'unread', ids }
  return { text, mm, result: applyWrittenDim(s.app, ids, mm), ids }
}

describe('32-2 즉시 치수선 — 승인 단계가 없다', () => {
  it('① 숫자를 쓰면 그 자리에서 치수가 선다 · ③ 실행취소 한 번에 손글씨로 돌아간다', () => {
    const { s, bot: line } = scene()
    const before = s.app.doc.strokes.length
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

describe('32-3 대상은 숫자의 위치가 정한다', () => {
  it('① 선 하나 옆에 쓰면 대상이 1개다 · ② 정말로 겹칠 때만 선택이 생긴다', () => {
    const { s, bot: line } = scene()
    const ids = writeAlong(s, '2500', line.id, { off: 26 })
    expect(dimTargetFor(s.app, ids), '대상이 그 선 하나로 정해진다').toBe(line.id)
    expect(dimTargetTie(s.app, ids), '겹치지 않는다 — 고르라고 하지 않는다').toBe(false)
    const sc = dimTargetScores(s.app, ids)
    console.log(`[32-3 ①] 점수 ${sc.map(x => `${x.id}:${x.score.toFixed(3)}`).join(' ')}`)

    // ② **정말로 겹치는 자리** — 나란한 두 선의 딱 가운데에 쓴다
    const s2 = closed()
    const up = s2.draw(380, 560, 380, 740)!
    const dn = s2.draw(440, 560, 440, 740)!                  // 나란한 세로 둘(60px)
    expect(s2.app.lift.lifted.has(dn.id)).toBe(true)
    // **정확히 가운데** — 어느 쪽도 근접·정렬·선상 위치에서 이기지 못하는 자리
    const mid = writeAlong(s2, '2500', up.id, { off: 30, side: -1 })
    const sc2 = dimTargetScores(s2.app, mid)
    console.log(`[32-3 ②] 겹친 자리 점수 ${sc2.map(x => `${x.id}:${x.score.toFixed(3)}`).join(' ')}`)
    expect(sc2.length, '둘 다 후보다').toBeGreaterThanOrEqual(2)
    expect(dimTargetTie(s2.app, mid), '이때는 겹친다고 말한다').toBe(true)
    expect([up.id, dn.id]).toContain(dimTargetFor(s2.app, mid))   // 그때도 1등이 기본이다
  })

  it('③ 의도한 대상과 일치하는 비율 — 옛 규칙(근접만)과 나란히 잰다', () => {
    // 장면: 나란한 가로 둘 + 비스듬한 하나 + 세로 하나. 실제 작도에 가깝게 **여럿**이다
    // (#78 ㉡ — 후보 경쟁은 실사용 밀도에서 재야 뜻이 있다).
    const build = () => {
      const s = closed()
      const lines = {
        v1: s.draw(380, 560, 380, 740)!,               // 세로(왼쪽 모서리)
        v2: s.draw(820, 560, 820, 700)!,               // 세로(오른쪽 모서리)
        bot: s.draw(380, 740, 820, 700)!,              // 아래 가로
        rec: s.draw(380, 740, 600, 650)!,              // 안으로 물러나는 선
      }
      return { s, lines }
    }
    const rows: { line: string; t: number; off: number; side: number; want: number; three: number | null; near: number | null; ok3: boolean; okNear: boolean }[] = []
    for (const key of ['v1', 'v2', 'bot', 'rec'] as const) {
      for (const t of [0.35, 0.5, 0.65]) {
        for (const off of [20, 30]) {
          for (const side of [1, -1]) {
            const { s, lines } = build()
            const want = lines[key].id
            if (!s.app.lift.lifted.has(want)) continue
            const ids = writeAlong(s, '2500', want, { t, off, side })
            const group = handwritingGroup(s.app)
            const use = group.length > 0 ? group : ids
            if (use.length === 0) continue
            const three = dimTargetFor(s.app, use)
            // **옛 규칙** — 뭉치 중심에서 가장 가까운 3D 획(29-2의 nearestDimTarget 그대로).
            let cx = 0, cy = 0, n = 0
            for (const id of use) {
              const st = s.app.doc.strokes.find(x => x.id === id)!
              cx += (st.a.x + st.b.x) / 2; cy += (st.a.y + st.b.y) / 2; n++
            }
            const near = n > 0 ? pickTargetAt(s.app, { x: cx / n, y: cy / n }, Infinity) : null
            rows.push({ line: key, t, off, side, want, three, near, ok3: three === want, okNear: near === want })
          }
        }
      }
    }
    const ok3 = rows.filter(r => r.ok3).length
    const okN = rows.filter(r => r.okNear).length
    const diff = rows.filter(r => r.ok3 !== r.okNear)
    console.log(`[32-3 ③] 세 항 ${ok3}/${rows.length} · 옛 규칙(근접만) ${okN}/${rows.length} · 갈린 칸 ${diff.length}`)
    for (const d of diff) console.log(`[32-3 ③ 갈림] ${d.line} t=${d.t} off=${d.off} side=${d.side} — 세 항 ${d.ok3 ? '○' : '×'} · 근접만 ${d.okNear ? '○' : '×'}`)
    expect(rows.length, '픽스처가 실제로 돈다').toBeGreaterThan(20)
    expect(ok3, '세 항이 옛 규칙보다 낫거나 같다').toBeGreaterThanOrEqual(okN)
    expect(ok3 / rows.length, '기본 대상이 대체로 의도와 맞는다').toBeGreaterThan(0.8)

    const out = resolve(HERE, '../../stage0/out/dimtarget32_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 3번 — 치수의 «대상»이 의도와 맞는 비율. 세 항(근접·정렬·선상 위치) ↔ 옛 규칙(근접만)을 같은 픽스처에서 나란히 잰다.',
      bias: '⚠ 합성 배치다 — 「도면 관행대로 선과 나란히·가운데쯤·조금 떨어져 쓴다」를 좌표로 흉내낸 것이고 사람이 실제로 쓴 자리가 아니다. 표는 «어떤 배치에서 갈리는가»를 가리키는 데까지 쓴다.',
      conditions: {
        scene: '카메라가 닫힌 2점 장면 + **3D로 선** 내용 선 넷(세로 둘 · 아래 가로 · 물러나는 선)',
        placement: '선을 따라 t=0.35/0.5/0.65 · 수직 거리 20/30px · 양쪽 — 글씨는 그 선 방향으로 눕혀 쓴다',
        old_rule: 'state.pickTargetAt(중심, Infinity) — 29-2의 nearestDimTarget이 쓰던 그 함수(흉내가 아니라 실제 코드)',
        command: 'npx vitest run test/writedim32.test.ts',
      },
      constants: {
        DIM_TARGET_REACH: C.DIM_TARGET_REACH, DIM_TARGET_W_NEAR: C.DIM_TARGET_W_NEAR,
        DIM_TARGET_W_ALIGN: C.DIM_TARGET_W_ALIGN, DIM_TARGET_W_ALONG: C.DIM_TARGET_W_ALONG,
        DIM_TARGET_ALIGN_NEUTRAL: C.DIM_TARGET_ALIGN_NEUTRAL,
        DIM_TARGET_SPREAD_MIN: C.DIM_TARGET_SPREAD_MIN, DIM_TARGET_TIE: C.DIM_TARGET_TIE,
        DIM_LABEL_HIT_PX: C.DIM_LABEL_HIT_PX,
      },
      three_term: { hit: ok3, n: rows.length },
      nearest_only: { hit: okN, n: rows.length },
      differed: diff.length,
      rows,
    }, null, 2))
  })
})
