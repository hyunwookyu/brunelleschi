// web2-15 1번 — **겉보기 교차**(apparent intersection). 「소실점 선을 다른 선으로
// 정의하기가 여전히 실패한다」의 재현·수리 팔.
//
// ── D-2 재현: 무엇이 실패했나 ──────────────────────────────────────────
// web2-14가 「대기 획의 그린 구간을 near 오스냅 대상으로」 넣었고 팔 넷이 통과했는데
// 실기기에서 **여전히 안 됐다**. 표식(D-1)을 경로 두 곳에 심어 갈린 자리를 냈다
// (스윕 원장: `stage0/out/xint_web2.json`). 기전이 **둘**이었다:
//
//   ① **near가 획을 축선에서 밀어낸다.** near는 커서를 대기선에 «수직으로» 붙이므로
//      축 스냅으로 정한 A의 확정 끝이 축선에서 최대 오스냅 반경(8px)만큼 옮겨간다.
//      그 밀림/획 길이가 축 허용각을 넘으면 `axisOfStroke`가 축을 못 주고 **A 자신이
//      안 올라간다** → `defineByTouch`가 «A가 3D가 아니다»에서 먼저 나가 정의가
//      **조용히** 무산된다(무산 계수조차 안 오른다 — 표식이 없으면 안 보이는 형태).
//      수리 전 실측: 겨냥점에서 (dx,dy)=(6,6)·(8,3)·(8,6) 세 칸이 그렇게 죽었다.
//   ② **`ext`·`perp`가 near를 가린다.** OSNAP_ORDER에서 둘이 앞서고, 다른 3D 선에서
//      **이어 그으면** 그 선의 연장(ext)이 조준 경로 내내 잡힌다 → near는 한 번도
//      못 이긴다. 사람이 본 「스냅이 안 잡힌다」의 이 절반이다. 수리 전 실측:
//      대기선 잉크에서 2.7px 떨어진 커서에서 잡힌 것은 `ext`였다.
//
// ── 수리(지시 1-a): 「붙인다」가 아니라 「만나는 데까지 늘린다」 ──────────
// 축스냅된 A는 시작점과 방향이 이미 정해졌다 → B와 만나는 자리는 **하나**다. 손이 어디서
// 멈추든 답이 같다. 선례 그대로 간다(A-3): AutoCAD의 apparent intersection · Rhino의 같은
// 오스냅. 종류 `xint`, `int` 바로 뒤 우선순위(발·연장·근처보다 앞 — ②가 풀린다), 구멍은
// **축스냅된 끝**에서 잰다(축에 수직인 손 오차는 이미 버린 값이다 — #68의 형태).
//
// ── 헤드리스가 재는 것 / 실기기가 재는 것 ─────────────────────────────
// 헤드리스: 후보 선정·확정 좌표·축 유지·정의 성립·자립(아래 전부). 실기기: 기호가 손에
// 읽히는가 · 대역(8px)이 실제 손에 맞는가 — DEFERRED 「web2-15 실기기 확인 표」.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { osnap } from '../src/core/osnap'
import { axisOfStroke } from '../src/core/lift'
import { own3Deviation, OWN3_TOL_PX } from '../src/core/own3d'
import { loadDoc, commitStroke } from '../src/app/state'
import { snapDir } from '../src/core/snap'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import type { Analysis } from '../src/core/camera'

/** 닫힌 2점 카메라 + 대기 소실점 선 B(vp0 방향, 허공) + 지면 깊이선 D1.
 *  ⚠ 겨냥 자리(720,305)는 B의 끝점(690,290)에서 33.9px·중점(≈764,329)에서 49.8px —
 *  **어느 점 오스냅도 안 닿는 몸통**이다(점 스냅이 우연히 대신 잡아 주는 것을 배제). */
function fx() {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)              // 지평선
  s.draw(500, 500, 600, 475)               // → vp0 = (900,400)
  s.draw(500, 500, 400, 475)               // → vp1 = (100,400) — 닫힘
  const B = s.draw(690, 290, 840, 365)!    // 대기 소실점 선
  expect(s.app.lift.waiting).toContain(B.id)
  const D1 = s.draw(500, 500, 720, 445)!   // 지면 깊이선 — 끝 (720,445)가 3D다
  expect(s.app.lift.lifted.has(D1.id)).toBe(true)
  return { s, B, D1 }
}

/** 앱 경로 그대로 미리보기를 푼다(input.ts의 beginDraft+updateDraft와 같은 호출) */
function preview(s: ReturnType<typeof session>, start: { x: number; y: number }, cur: { x: number; y: number }) {
  const set = { ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s }
  const oh = resolveStart(s.app.lift, s.app.pose, start, set)
  return resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
    oh ? oh.p : start, { p3: oh?.p3 ?? null }, cur, set, { mmPerUnit: null, snapStep: null })
}

/** 점-선분 거리(2D) */
const distSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function eraseByReload(s: ReturnType<typeof session>, ids: number[]) {
  const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: s.app.savedViews })
  const data = parseBrnl(json)
  expect(data).not.toBeNull()
  data!.doc.strokes = data!.doc.strokes.filter(st => !ids.includes(st.id))
  loadDoc(s.app, data!)
}

// ── 단계 ①: 스냅이 잡히는가 (정의와 **다른 단계**다 — 지시 1-c 마지막 ⚠) ──
describe('단계 ① 스냅 — 손 오차를 태워도 대기선 몸통에 겉보기 교차가 잡힌다', () => {
  it('오차 25칸 전부: 종류 xint · 답이 **하나로 같다**(손이 어디서 멈추든)', () => {
    const answers = new Set<string>()
    for (const dx of [0, 2, 4, 6, 8]) for (const dy of [0, 3, -3, 6, -6]) {
      const { s, B } = fx()
      const r = preview(s, { x: 720, y: 445 }, { x: 720 + dx, y: 305 + dy })
      expect(r.endSnap, `(${dx},${dy}) 오스냅이 잡혔다 — 가시성 채널`).not.toBeNull()
      expect(r.endSnap!.kind, `(${dx},${dy})`).toBe('xint')
      // 붙은 점은 B의 **그린 구간** 위다(무한 연장 아님 — web2-13 1-d)
      const bs = s.app.doc.strokes.find(x => x.id === B.id)!
      expect(distSeg(r.end, bs.a, bs.b)).toBeLessThan(1e-9)
      // 그리고 **축선 위**다 — near가 깨뜨리던 것이 이것이다
      expect(r.axis, '축이 살아 있다').toBe('V')
      expect(r.end.x).toBeCloseTo(720, 6)
      answers.add(`${r.end.x.toFixed(6)},${r.end.y.toFixed(6)}`)
    }
    // ⚠ **이 단언은 «측정»이 아니라 설계 보장이다**(CLAUDE.md §5.1 자기참조 유형 3 ·
    //   리뷰 [10]). xint가 돌려주는 점은 정의상 «조준선 ∩ B»이므로 커서가 어디든 같은
    //   값이다 — 25칸이 같은 것은 구성상 참이고, 실제로 재는 것은 **25칸이 전부 문을
    //   통과했는가**(위 kind 단언) 하나뿐이다. 임계를 안 걸고 원장에도 안 싣는다.
    //   그래도 남기는 이유: 「조준선 ∩ B」가 아닌 답으로 바뀌면 여기서 깨진다(회귀 감시).
    expect(answers.size, '구성상 하나 — 「손이 어디서 멈추든 답이 정해져 있다」의 형태 확인').toBe(1)
  })

  it('②의 가림이 풀렸다 — 다른 3D 선에서 «이어» 그어도 ext가 못 가린다', () => {
    const { s } = fx()
    // D1 끝에서 수직으로 올린 3D 선 V — 그 연장(ext)이 조준 경로를 덮는다
    const V = s.draw(720, 445, 720, 345)!
    expect(s.app.lift.lifted.has(V.id)).toBe(true)
    // 표식: 조준선 **없이** 부르면(=수리 전 osnap 호출) 잡히는 것은 ext다
    const set = { ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s }
    const bare = osnap(s.app.lift, s.app.pose, { x: 720, y: 308 }, set, { p3: null })
    expect(bare!.kind, '수리 전 표식 — 대기선 몸통이 아니라 ext가 잡혔다').toBe('ext')
    // 조준선을 주면(=앱 경로) 겉보기 교차가 이긴다
    const r = preview(s, { x: 720, y: 345 }, { x: 720, y: 308 })
    expect(r.endSnap!.kind).toBe('xint')
  })
})

// ── 단계 ②: 정의가 서는가 ────────────────────────────────────────────
describe('단계 ② 정의 — 잡힌 뒤 대기선이 3D로 올라가고, 근거를 지워도 유지된다', () => {
  it('오차 25칸 전부에서 B가 정의된다 · A는 축을 잃지 않는다 · 잉크 심판 통과', () => {
    for (const dx of [0, 2, 4, 6, 8]) for (const dy of [0, 3, -3, 6, -6]) {
      const { s, B } = fx()
      const A = s.draw(720, 445, 720 + dx, 305 + dy)!
      expect(axisOfStroke(s.app.lift.an, s.app.pose, A.a, A.b), `(${dx},${dy}) A의 축`).toBe('V')
      expect(s.app.lift.lifted.has(A.id), `(${dx},${dy}) A가 3D다`).toBe(true)
      const b = s.app.doc.strokes.find(x => x.id === B.id)!
      expect(b.own3, `(${dx},${dy}) B가 정의됐다`).toBeDefined()
      expect(b.own3!.axis).toBe('vp0')
      expect(s.app.touchStats.ok).toBe(1)
      expect(own3Deviation(s.app.lift.an as Analysis, b)!).toBeLessThanOrEqual(OWN3_TOL_PX)
    }
  })

  it('자립 — 정의된 뒤 A와 그 사슬(D1)을 지워도 B는 3D로 남는다', () => {
    const { s, B, D1 } = fx()
    const A = s.draw(720, 445, 726, 311)!          // 손 오차 (6,6) — 수리 전 죽던 칸
    const b0 = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(b0.own3).toBeDefined()
    const own0 = JSON.stringify(b0.own3)
    eraseByReload(s, [A.id, D1.id])
    expect(s.app.lift.lifted.has(B.id), 'B가 3D로 남는다').toBe(true)
    const b1 = s.app.doc.strokes.find(x => x.id === B.id)!
    expect(JSON.stringify(b1.own3), '값도 그대로다 — 관계가 아니라 사건').toBe(own0)
  })
})

// ── 반증(D-3) — 실제로 실패시켜 본다 ──────────────────────────────────
describe('반증 — 이 검사가 무엇에 실패하는가', () => {
  it('수리 전 판정으로 같은 손을 재면 (6,6)·(8,3)·(8,6)이 죽는다 — 이 팔의 판별력(D-2)', () => {
    // ⚠ **수리 전 판정을 여기서 복제한다**(navhold.test와 같은 어법 — 「동결 없이」).
    //   `kinds.xint = false`는 재현이 아니다: 지금 코드에서 그것을 끄면 몸통 후보가
    //   아예 없어져 끝이 축선에 그대로 남고, 그러면 오히려 정의가 선다(실측 — 죽는 칸 0).
    //   수리 전에 죽인 것은 «후보가 없어서»가 아니라 **near가 끝을 축선에서 밀어내서**다.
    //   그래서 그 순서(조준선 없는 osnap이 이기고, 지면 축 스냅은 그 뒤)를 그대로 짠다.
    //   (이 픽스처의 획은 소실점에서 뻗지도, 축을 만들지도 않는다 — resolveEnd의 ②·③이
    //    안 걸리므로 ①·④만 복제하면 수리 전 문면과 같다.)
    const set0 = (s: ReturnType<typeof session>) =>
      ({ ...s.app.osnap, radius: s.app.osnap.radius / s.app.view.s })
    const dead: string[] = []
    for (const [dx, dy] of [[6, 6], [8, 3], [8, 6], [0, 0], [2, 3]] as const) {
      const { s, B } = fx()
      const start = { x: 720, y: 445 }, cur = { x: 720 + dx, y: 305 + dy }
      const oh = osnap(s.app.lift, s.app.pose, cur, set0(s), { p3: null })   // 조준선 없이 = 수리 전
      const end = oh ? oh.p : snapDir(s.app.lift.an, s.app.pose, start, cur).end
      const A = commitStroke(s.app, start, end, [start, cur])
      const ax = axisOfStroke(s.app.lift.an, s.app.pose, A.a, A.b)
      const b = s.app.doc.strokes.find(x => x.id === B.id)!
      if (!b.own3) {
        dead.push(`${dx},${dy}`)
        expect(ax, `(${dx},${dy}) 죽은 이유 — 축을 잃었다`).toBeNull()
        expect(s.app.lift.lifted.has(A.id), 'A 자신이 안 올라간다').toBe(false)
        expect(s.app.touchStats, '무산 계수조차 안 오른다 — 조용한 실패')
          .toEqual({ ok: 0, pose: 0, axis: 0, lift: 0, roundtrip: 0 })
      }
    }
    expect(dead, '수리 전 죽던 칸 — 그 밖은 살아 있었다(그래서 web2-14 팔 넷이 통과했다)')
      .toEqual(['6,6', '8,3', '8,6'])
  })

  it('반증 ② 축 스냅을 풀면 안 된다 — 자유 획(소실점에서 뻗는 획)에는 조준선이 없다', () => {
    const { s } = fx()
    // vp0(900,400)에서 뻗는 획은 자유다(web2-06 지시 1 — 축 스냅이 안 붙는다).
    // 방향이 안 정해졌으므로 「만나는 자리」가 하나가 아니다 → 겉보기 교차가 성립 안 한다.
    const r = preview(s, { x: 900, y: 400 }, { x: 745, y: 322 })
    expect(r.endSnap?.kind ?? null, '조준선 없음 — xint 아님').not.toBe('xint')
  })

  it('반증 ③ 대역 밖 — 조준선을 따라 멀리서 멈추면 안 잡힌다(구멍이 살아 있다)', () => {
    const { s } = fx()
    const near = preview(s, { x: 720, y: 445 }, { x: 720, y: 313 })   // 교차에서 7.3px
    expect(near.endSnap?.kind).toBe('xint')
    const far = preview(s, { x: 720, y: 445 }, { x: 720, y: 320 })    // 14.3px — 밖
    expect(far.endSnap?.kind ?? null, '못 미쳤으면 안 붙는다').not.toBe('xint')
    expect(far.end.y).toBeCloseTo(320, 6)                             // 축 스냅 그대로
  })

  it('반증 ④ 그린 구간 밖 — B의 **연장**과 만나는 조준은 안 잡는다', () => {
    const { s } = fx()
    // B는 (690,290)→(838.5,367.8). x=870 세로 조준은 B의 **연장**과 만난다(구간 밖).
    const D = s.draw(500, 500, 870, 407.5)!
    expect(s.app.lift.lifted.has(D.id)).toBe(true)
    const r = preview(s, { x: 870, y: 407.5 }, { x: 870, y: 384 })
    expect(r.endSnap?.kind ?? null, '무한 연장은 후보가 아니다 — 조용히 틀린 배치 금지').not.toBe('xint')
  })

  it('반증 ⑤ 뒤쪽 — 조준선의 **뒤**에 있는 만남은 안 잡는다', () => {
    const { s } = fx()
    // (720,250)에서 **위로** 긋는다 — B와의 만남(720,305)은 조준의 반대쪽이다
    const D = s.draw(500, 500, 720, 445)!
    expect(s.app.lift.lifted.has(D.id)).toBe(true)
    const up = preview(s, { x: 720, y: 250 }, { x: 720, y: 200 })
    expect(up.endSnap?.kind ?? null).not.toBe('xint')
  })
})
