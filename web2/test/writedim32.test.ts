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

  it('③ 의도와 일치하는 비율 · **후보 수** · 대역 밖 — 옛 규칙(근접만)과 나란히, 시드를 훑어서', () => {
    // 장면: 3D로 서는 선 넷(세로 둘 · 아래 가로 · 물러나는 선) — 실사용 밀도의 최소판.
    // ⚠ **후보 수를 함께 센다**(1차 리뷰어 지적): 사용자의 말은 「후보만 잔뜩 생성된다」이고
    //   그것은 **적중**이 아니라 **개수**의 양이다. 적중만 재면 그 통증을 안 잰 것이다.
    const build = () => {
      const s = closed()
      const lines = {
        v1: s.draw(380, 560, 380, 740)!,
        v2: s.draw(820, 560, 820, 700)!,
        bot: s.draw(380, 740, 820, 700)!,
        rec: s.draw(380, 740, 600, 650)!,
      }
      return { s, lines }
    }
    type Row = { seed: number; line: string; t: number; off: number; side: number; want: number; three: number | null; near: number | null; ok3: boolean; okNear: boolean; cands: number; tie: boolean }
    const rows: Row[] = []
    // **시드를 훑는다**(#14 — 여유가 몇 칸인데 변동폭이 없으면 결론이 표본을 넘는다).
    // 흔들기(jit)는 글자마다 걸려 있고, 시드가 그 흔들림의 갈래다.
    for (const seed of [31, 977, 20260829]) {
      for (const key of ['v1', 'v2', 'bot', 'rec'] as const) {
        for (const t of [0.35, 0.5, 0.65]) {
          for (const off of [20, 30]) {
            for (const side of [1, -1]) {
              const { s, lines } = build()
              const want = lines[key].id
              const ids = writeAlong(s, '2500', want, { t, off, side, seed })
              const group = handwritingGroup(s.app)
              const use = group.length > 0 ? group : ids
              if (use.length === 0) continue
              const sc = dimTargetScores(s.app, use)
              const three = dimTargetFor(s.app, use)
              let cx = 0, cy = 0, n = 0
              for (const id of use) {
                const st = s.app.doc.strokes.find(x => x.id === id)!
                cx += (st.a.x + st.b.x) / 2; cy += (st.a.y + st.b.y) / 2; n++
              }
              // **옛 규칙** — 뭉치 중심에서 가장 가까운 3D 획(29-2의 nearestDimTarget 그대로 ·
              // 대역이 Infinity였다: 그것이 「후보만 잔뜩」의 한쪽 뿌리다)
              const near = n > 0 ? pickTargetAt(s.app, { x: cx / n, y: cy / n }, Infinity) : null
              rows.push({ seed, line: key, t, off, side, want, three, near, ok3: three === want, okNear: near === want, cands: sc.length, tie: dimTargetTie(s.app, use) })
            }
          }
        }
      }
    }
    const bySeed = [...new Set(rows.map(r => r.seed))].map(seed => {
      const rs = rows.filter(r => r.seed === seed)
      return { seed, n: rs.length, ok3: rs.filter(r => r.ok3).length, okNear: rs.filter(r => r.okNear).length }
    })
    const ok3 = rows.filter(r => r.ok3).length, okN = rows.filter(r => r.okNear).length
    const diff = rows.filter(r => r.ok3 !== r.okNear)
    for (const b of bySeed) console.log(`[32-3 ③ 시드 ${b.seed}] 세 항 ${b.ok3}/${b.n} · 근접만 ${b.okNear}/${b.n}`)
    console.log(`[32-3 ③ 합] 세 항 ${ok3}/${rows.length} · 근접만 ${okN}/${rows.length} · 갈린 칸 ${diff.length}(세 항 승 ${diff.filter(d => d.ok3).length} · 패 ${diff.filter(d => !d.ok3).length})`)
    // **후보 수** — 사용자의 통증을 그대로 센다
    const candHist: Record<number, number> = {}
    for (const r of rows) candHist[r.cands] = (candHist[r.cands] ?? 0) + 1
    const oneOnly = rows.filter(r => r.cands === 1).length
    const tied = rows.filter(r => r.tie).length
    console.log(`[32-3 ③ 후보 수] 분포 ${JSON.stringify(candHist)} · 후보 하나 ${oneOnly}/${rows.length} · «겹친다»로 판정 ${tied}/${rows.length}`)

    expect(rows.length, '픽스처가 실제로 돈다').toBeGreaterThan(60)
    expect(ok3, '세 항이 옛 규칙보다 낫거나 같다 — **시드 전부에서**').toBeGreaterThanOrEqual(okN)
    for (const b of bySeed) expect(b.ok3, `시드 ${b.seed}에서도 안 진다`).toBeGreaterThanOrEqual(b.okNear)
    expect(ok3 / rows.length, '기본 대상이 대체로 의도와 맞는다').toBeGreaterThan(0.8)
    // 「후보만 잔뜩」의 반대편 — **대부분 고르라고 하지 않는다**
    expect(tied / rows.length, '겹쳤다고 말하는 칸이 드물다').toBeLessThan(0.25)

    // ── **대역 밖**(`DIM_TARGET_REACH`)이 실제로 무는가 — 옛 규칙과 갈리는 그 자리다 ──
    // 옛 규칙은 대역이 Infinity라 **아무리 멀어도 하나를 고른다**. 새 규칙은 안 고른다.
    const far = (() => {
      const { s, lines } = build()
      const ids = writeAlong(s, '2500', lines.v1.id, { off: 420, rot: false })   // 한참 떨어진 자리
      const use = handwritingGroup(s.app).length > 0 ? handwritingGroup(s.app) : ids
      let cx = 0, cy = 0, n = 0
      for (const id of use) { const st = s.app.doc.strokes.find(x => x.id === id)!; cx += (st.a.x + st.b.x) / 2; cy += (st.a.y + st.b.y) / 2; n++ }
      return {
        cands: dimTargetScores(s.app, use).length,
        three: dimTargetFor(s.app, use),
        near: n > 0 ? pickTargetAt(s.app, { x: cx / n, y: cy / n }, Infinity) : null,
        strokes: use.length,
      }
    })()
    console.log(`[32-3 ③ 대역 밖] 획 ${far.strokes} · 후보 ${far.cands} · 세 항 ${far.three} · 옛 규칙 ${far.near}`)
    expect(far.strokes, '글씨는 그대로 써졌다(분해능 — 「아무 일도 안 났다」와 가른다)').toBeGreaterThan(0)
    expect(far.cands, '대역 밖이면 후보가 없다').toBe(0)
    expect(far.three, '그래서 치수가 안 붙는다 — 없는 대상을 지어내지 않는다').toBeNull()
    expect(far.near, '옛 규칙은 그래도 하나를 고른다(대역이 Infinity였다)').not.toBeNull()

    // ── 동점 판정이 **항등이 아니다** — 가운데에서 벗어나면 거짓이 된다 ──────────
    // (#77 ㉥: 두 수가 정확히 같으면 같은 것을 재는지 의심한다. 대칭 배치의 0.895 ↔ 0.895는
    //  구성상 같으므로 그것만으로는 «판정이 산다»가 아니다.)
    const tieProbe = [0, 4, 10, 20].map(shift => {
      const s2 = closed()
      const up = s2.draw(380, 560, 380, 740)!
      s2.draw(440, 560, 440, 740)!
      const mid = writeAlong(s2, '2500', up.id, { off: 30 + shift, side: -1 })
      const sc = dimTargetScores(s2.app, mid)
      return { shift, tie: dimTargetTie(s2.app, mid), top: sc.slice(0, 2).map(x => Number(x.score.toFixed(4))) }
    })
    for (const p of tieProbe) console.log(`[32-3 ② 동점] 가운데에서 ${p.shift}px — 겹침 ${p.tie} · 점수 ${JSON.stringify(p.top)}`)
    expect(tieProbe[0]!.tie, '정확히 가운데면 겹친다').toBe(true)
    expect(tieProbe[tieProbe.length - 1]!.tie, '벗어나면 안 겹친다 — 판정이 항등이 아니다').toBe(false)

    const out = resolve(HERE, '../../stage0/out/dimtarget32_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-32 3번 — 치수의 «대상»이 의도와 맞는 비율 **과 후보 수**. 세 항(근접·정렬·선상 위치) ↔ 옛 규칙(근접만)을 같은 픽스처에서 나란히 잰다.',
      bias: '⚠ 합성 배치다 — 「도면 관행대로 선과 나란히·가운데쯤·조금 떨어져 쓴다」를 좌표로 흉내낸 것이고 사람이 실제로 쓴 자리가 아니다. 표는 «어떤 배치에서 갈리는가»를 가리키는 데까지 쓴다.',
      user_pain: '사용자의 말은 「후보만 잔뜩 생성된다」였다 — **개수**의 양이다. 그래서 적중(hit)만이 아니라 **후보 수 분포**와 «겹친다»로 판정한 칸 수를 함께 낸다(1차 리뷰어 지적).',
      conditions: {
        scene: '카메라가 닫힌 2점 장면 + **3D로 서는** 내용 선 넷(세로 둘 · 아래 가로 · 물러나는 선)',
        placement: '선을 따라 t=0.35/0.5/0.65 · 수직 거리 20/30px · 양쪽 · 글씨는 그 선 방향으로 눕혀 쓴다. **흔들기 jit=0.6px**가 글자마다 걸린다(rng32 — Math.random ⛔ #14)',
        seeds: '시드 31 · 977 · 20260829 — 같은 48칸을 세 번 돈다(변동폭 · #14)',
        old_rule: 'state.pickTargetAt(중심, Infinity) — 29-2의 nearestDimTarget이 쓰던 그 함수(흉내가 아니라 실제 코드). **대역이 Infinity**였다',
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
      by_seed: bySeed,
      differed: { n: diff.length, three_won: diff.filter(d => d.ok3).length, three_lost: diff.filter(d => !d.ok3).length, rows: diff },
      candidates: { histogram: candHist, single: [oneOnly, rows.length], tie: [tied, rows.length] },
      out_of_reach: far,
      tie_probe: tieProbe,
      flags_explained: {
        '세 항이 진 칸이 있다': '**그대로 적는다** — 진 칸은 «물러나는 선(rec)»에 몰린다(원근이 걸린 자리). 3승 1패류의 여유는 얇으므로 시드 셋을 훑어 그 여유가 시드마다 유지되는지를 함께 본다(#14).',
        '후보 수가 1인 칸이 대부분이다': '그것이 이 항목의 목적이다 — 「하나로 정해지면 후보를 내지 마라」(지시 문면). 대역(`DIM_TARGET_REACH`)이 그 일을 하고, 대역 밖 배치(out_of_reach)가 그 문이 실제로 문다는 증거다.',
      },
      rows,
    }, null, 2))
  })
})
