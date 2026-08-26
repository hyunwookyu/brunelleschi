// 치수(web2-08 지시 4) — 스케일·파싱·표기·실시간 길이·치수 스냅.
//
// 재현(D-2 · 무스케일): 치수 이전의 문서는 세계 단위가 눈높이 게이지뿐이라 실척이 없다 —
// `lenMm`이 null을 내는 것이 그 상태의 표현이다(숫자로 위장하지 않는다). 첫 치수 입력이
// `mmPerUnit`을 정하면 그때까지 그린 모든 획이 실척으로 읽힌다(4-1).
//
// «한 곳에서 계산해 셋이 읽는다»(4-5)의 판정: 그리는 중의 lenMm(resolveEnd) ==
// 확정 3D 길이(lift) 를 여기서 잰다. 셋째(리본 패널)는 그 값을 그대로 표시하므로
// e2e가 문면으로 잰다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { W, H } from './fixtures'
import { setDimension, type App } from '../src/app/state'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { parseDim, parseKoreanNumber, formatMm, snapMm, lenMm } from '../src/core/dim'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { sub3, len3, norm3, dot3 } from '../src/core/vec'

/** 작도 + 수직 기둥 하나 — 기둥이 스케일의 기준이 된다 */
function drawn() {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)                  // 지평선
  s.draw(500, 500, 600, 475)                   // 깊이선 1 → vp0
  s.draw(500, 500, 400, 475)                   // 깊이선 2 → vp1
  const post = s.draw(500, 500, 500, 380)!     // 기둥(수직) — 3D에 선다
  expect(s.app.lift.lifted.has(post.id)).toBe(true)
  return { s, post }
}

describe('파싱 — 숫자·한국어 수사·단위 (4-3·4-4·4-6)', () => {
  it('한국어 수사', () => {
    expect(parseKoreanNumber('삼천오백')).toBe(3500)
    expect(parseKoreanNumber('천이백')).toBe(1200)
    expect(parseKoreanNumber('이백오십')).toBe(250)
    expect(parseKoreanNumber('만')).toBe(10000)
    expect(parseKoreanNumber('삼만오천')).toBe(35000)
    expect(parseKoreanNumber('십만')).toBe(100000)
    expect(parseKoreanNumber('3천5백')).toBe(3500)
    expect(parseKoreanNumber('삼점오')).toBeCloseTo(3.5, 12)
    expect(parseKoreanNumber('삼점일사')).toBeCloseTo(3.14, 12)
  })

  it('반증(D-3): 수사가 아닌 것은 null이다 — 오염 혼용도 거부한다', () => {
    for (const bad of ['', 'abc', '삼구삼', '3삼', '점', '피트']) {
      expect(parseKoreanNumber(bad), bad).toBeNull()
    }
  })

  it('치수 문자열 → mm — 지시 4-4의 예 셋 그대로', () => {
    expect(parseDim('삼천오백', 'mm')).toBe(3500)
    expect(parseDim('3.5미터', 'mm')).toBe(3500)
    expect(parseDim('이백오십 밀리', 'm')).toBe(250)   // 단위가 이기고 fallback은 안 쓰인다
    expect(parseDim('3500', 'mm')).toBe(3500)
    expect(parseDim('25cm', 'mm')).toBe(250)
    expect(parseDim('3,5m', 'mm')).toBe(3500)
    expect(parseDim('10', 'cm')).toBe(100)             // 단위가 없으면 지금 단위로 읽는다
  })

  it('반증(D-3): 0·음수·잡음은 null — 치수 0 획을 만들지 않는다', () => {
    for (const bad of ['0', '-5', 'abc', '5피트', '']) {
      expect(parseDim(bad, 'mm'), bad).toBeNull()
    }
  })

  it('표기 — 기본은 읽는 자리 반올림, exact는 그대로 (4-6·4-8)', () => {
    expect(formatMm(3500, 'mm')).toBe('3500 mm')
    expect(formatMm(3500, 'm')).toBe('3.5 m')
    expect(formatMm(3500, 'cm')).toBe('350 cm')
    expect(formatMm(1234.5678, 'mm')).toBe('1235 mm')
    expect(formatMm(1234.5678, 'mm', true)).toBe('1234.5678 mm')
    expect(formatMm(1234.5678, 'm')).toBe('1.235 m')
  })

  it('치수 스냅 산술 — 0으로는 안 내려간다 (4-7)', () => {
    expect(snapMm(163, 50)).toBe(150)
    expect(snapMm(174.9, 50)).toBe(150)
    expect(snapMm(12, 50)).toBe(50)     // 반내림돼도 최소 한 칸
    expect(snapMm(163, 0)).toBe(163)    // step 없음 = 그대로
  })
})

describe('4-1 — 첫 치수가 스케일을 정한다', () => {
  it('mmPerUnit이 서고 기하는 한 톨도 안 움직인다 · 기존 획 전부가 실척이 된다', () => {
    const { s, post } = drawn()
    const app = s.app
    const before = app.lift.lifted.get(post.id)!
    const others = [...app.lift.lifted.entries()].map(([id, g]) => [id, len3(sub3(g.b3, g.a3))] as const)
    expect(app.doc.mmPerUnit).toBeNull()
    expect(lenMm(before.a3, before.b3, app.doc.mmPerUnit)).toBeNull()   // 무스케일 = null

    expect(setDimension(app, post.id, 2500)).toBe('scale')              // 기둥 = 2.5 m
    expect(app.doc.mmPerUnit).not.toBeNull()
    const after = app.lift.lifted.get(post.id)!
    for (const k of ['x', 'y', 'z'] as const) {
      expect(after.a3[k]).toBeCloseTo(before.a3[k], 12)                 // 구성상 무변형
      expect(after.b3[k]).toBeCloseTo(before.b3[k], 12)
    }
    expect(lenMm(after.a3, after.b3, app.doc.mmPerUnit)).toBeCloseTo(2500, 9)
    // 그때까지 그린 것 전부가 같은 스케일로 읽힌다(4-1 「그때까지 그렸던 것」)
    for (const [id, L] of others) {
      const g = app.lift.lifted.get(id)!
      expect(lenMm(g.a3, g.b3, app.doc.mmPerUnit)).toBeCloseTo(L * app.doc.mmPerUnit!, 9)
    }
  })

  it('3D가 없으면 스케일을 못 정한다 — no3d (조용히 틀린 스케일을 안 만든다)', () => {
    const { s } = drawn()                       // 작도 완료(2점) — 이후 사선은 소실점을 안 만든다
    const st = s.draw(200, 650, 260, 700)!      // 아무 데도 안 닿는 획 — 대기
    expect(s.app.lift.lifted.has(st.id)).toBe(false)   // 픽스처가 실제로 대기인가(판별력)
    expect(s.app.lift.waiting).toContain(st.id)
    expect(setDimension(s.app, st.id, 1000)).toBe('no3d')
    expect(s.app.doc.mmPerUnit).toBeNull()
  })
})

describe('4-2 — 그 뒤는 시작점·방향만 취하고 길이를 바꾼다', () => {
  it('치수 입력이 끝점을 옮긴다 — 시작점·방향 불변, 길이 = 입력값', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    // 기둥 위 끝에서 vp0 쪽으로 하나 더 — 연결된 획
    const top = { x: 500, y: 380 }
    const beam = s.draw(top.x, top.y, 620, 350)!
    expect(app.lift.lifted.has(beam.id)).toBe(true)
    const before = app.lift.lifted.get(beam.id)!
    const dir0 = norm3(sub3(before.b3, before.a3))

    expect(setDimension(app, beam.id, 1000)).toBe('applied')
    const after = app.lift.lifted.get(beam.id)!
    for (const k of ['x', 'y', 'z'] as const) expect(after.a3[k]).toBeCloseTo(before.a3[k], 9)
    expect(dot3(norm3(sub3(after.b3, after.a3)), dir0)).toBeCloseTo(1, 9)     // 방향 유지
    expect(lenMm(after.a3, after.b3, app.doc.mmPerUnit)).toBeCloseTo(1000, 9) // 길이 대체
  })

  it('다시 입력하면 대체된다 — 확정 전이든 후든 같은 몸짓(4-4의 «변경»)', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    const beam = s.draw(500, 380, 620, 350)!
    setDimension(app, beam.id, 1000)
    setDimension(app, beam.id, 700)
    const g = app.lift.lifted.get(beam.id)!
    expect(lenMm(g.a3, g.b3, app.doc.mmPerUnit)).toBeCloseTo(700, 9)
  })
})

describe('4-5 — 한 곳에서 계산해 셋이 읽는다: 미리보기 == 확정 3D', () => {
  it('그리는 중의 lenMm과 확정 리프팅 길이가 같다', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    // 앱과 같은 경로로 미리보기를 만든다(기둥 위 끝 → vp0 축)
    const set = { ...app.osnap, radius: app.osnap.radius }
    const p = { x: 500, y: 380 }
    const oh = resolveStart(app.lift, app.pose, p, set)!
    expect(oh.p3).not.toBeNull()
    const cursor = { x: 620, y: 352 }
    const r = resolveEnd(app.lift, app.pose, app.lift.an, oh.p, { p3: oh.p3 }, cursor, set,
      { mmPerUnit: app.doc.mmPerUnit, snapStep: null })
    expect(r.lenMm).not.toBeNull()
    const st = s.draw(p.x, p.y, cursor.x, cursor.y)!
    const g = app.lift.lifted.get(st.id)!
    expect(lenMm(g.a3, g.b3, app.doc.mmPerUnit)).toBeCloseTo(r.lenMm!, 6)
  })

  it('무스케일이면 미리보기 길이도 null이다 — 숫자를 지어내지 않는다', () => {
    const { s } = drawn()
    const app = s.app
    const set = { ...app.osnap, radius: app.osnap.radius }
    const oh = resolveStart(app.lift, app.pose, { x: 500, y: 380 }, set)!
    const r = resolveEnd(app.lift, app.pose, app.lift.an, oh.p, { p3: oh.p3 }, { x: 620, y: 352 }, set,
      { mmPerUnit: app.doc.mmPerUnit, snapStep: null })
    expect(r.lenMm).toBeNull()
  })
})

describe('4-7 — 치수 스냅: 실제 길이가 그 단위로 맞춰진다 (표시만이 아니다)', () => {
  it('켜면 확정 3D 길이가 step의 배수다 · 미리보기 lenMm이 그 값 그대로다', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    app.dimSnap = true
    app.dimSnapStep = 100
    const st = s.draw(500, 380, 620, 352)!            // 기둥 끝 → vp0 축
    const g = app.lift.lifted.get(st.id)!
    const mm = lenMm(g.a3, g.b3, app.doc.mmPerUnit)!
    expect(Math.abs(mm - Math.round(mm / 100) * 100)).toBeLessThan(1e-6)
    expect(mm).toBeGreaterThan(0)
  })

  it('꺼져 있으면(기본) 안 맞춰진다 — 반증 조건(D-3)', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    expect(app.dimSnap).toBe(false)                   // 기본 꺼짐(4-7 「옵션」)
    const st = s.draw(500, 380, 620, 352)!
    const g = app.lift.lifted.get(st.id)!
    const mm = lenMm(g.a3, g.b3, app.doc.mmPerUnit)!
    // 이 커서 자리는 100의 배수에서 멀다 — 스냅이 몰래 켜지면 여기서 걸린다
    expect(Math.abs(mm - Math.round(mm / 100) * 100)).toBeGreaterThan(1)
  })

  it('점이 치수 스냅을 이긴다 — 끝점 오스냅에 붙으면 스냅을 안 건다(원칙 d)', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    app.dimSnap = true
    app.dimSnapStep = 100
    // 기둥 아래(500,500) 근처에서 뗀다 — 끝점 오스냅이 잡는 자리
    const st = s.draw(500, 380, 502, 498)!
    expect(st.b).toEqual({ x: 500, y: 500 })          // 붙은 좌표가 그대로 확정
  })
})

describe('저장·복원 — 스케일·단위·치수가 왕복한다', () => {
  it('roundtrip', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    app.doc.unit = 'm'
    const text = serializeBrnl({ doc: app.doc, nextId: app.nextId, savedViews: [] })
    const back = parseBrnl(text)!
    expect(back.doc.mmPerUnit).toBeCloseTo(app.doc.mmPerUnit!, 12)
    expect(back.doc.unit).toBe('m')
    expect(back.doc.strokes.find(x => x.id === post.id)!.dim).toBe(2500)
  })

  it('옛 파일(열쇠 없음)은 무스케일 mm로 읽힌다 · 틀린 모양은 거부한다', () => {
    const { s } = drawn()
    const raw = JSON.parse(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId, savedViews: [] }))
    delete raw.mmPerUnit; delete raw.unit
    const ok = parseBrnl(JSON.stringify(raw))!
    expect(ok.doc.mmPerUnit).toBeNull()
    expect(ok.doc.unit).toBe('mm')
    raw.mmPerUnit = -1
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()
    delete raw.mmPerUnit
    raw.unit = 'ft'
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()
  })
})
