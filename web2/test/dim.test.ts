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
import { liftAll } from '../src/core/lift'
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
    expect(app.lift.mmPerUnit).toBeNull()
    expect(lenMm(before.a3, before.b3, app.lift.mmPerUnit)).toBeNull()   // 무스케일 = null

    expect(setDimension(app, post.id, 2500)).toBe('scale')              // 기둥 = 2.5 m
    expect(app.lift.mmPerUnit).not.toBeNull()
    const after = app.lift.lifted.get(post.id)!
    for (const k of ['x', 'y', 'z'] as const) {
      expect(after.a3[k]).toBeCloseTo(before.a3[k], 12)                 // 구성상 무변형
      expect(after.b3[k]).toBeCloseTo(before.b3[k], 12)
    }
    expect(lenMm(after.a3, after.b3, app.lift.mmPerUnit)).toBeCloseTo(2500, 9)
    // 그때까지 그린 것 전부가 같은 스케일로 읽힌다(4-1 「그때까지 그렸던 것」)
    for (const [id, L] of others) {
      const g = app.lift.lifted.get(id)!
      expect(lenMm(g.a3, g.b3, app.lift.mmPerUnit)).toBeCloseTo(L * app.lift.mmPerUnit!, 9)
    }
  })

  it('3D가 없으면 스케일을 못 정한다 — no3d (조용히 틀린 스케일을 안 만든다)', () => {
    const { s } = drawn()                       // 작도 완료(2점) — 이후 사선은 소실점을 안 만든다
    const st = s.draw(200, 650, 260, 700)!      // 아무 데도 안 닿는 획 — 대기
    expect(s.app.lift.lifted.has(st.id)).toBe(false)   // 픽스처가 실제로 대기인가(판별력)
    expect(s.app.lift.waiting).toContain(st.id)
    expect(setDimension(s.app, st.id, 1000)).toBe('no3d')
    expect(s.app.lift.mmPerUnit).toBeNull()
  })
})

describe('4-1b — 스케일 획에 다시 입력하면 스케일이 그 값으로 다시 선다', () => {
  it('«2» → «25» → «2500»으로 지나가는 필기가 첫 «2»에 굳지 않는다 (재현: 저장판의 결함)', () => {
    // 재현(D-2): mmPerUnit을 저장하던 초판은 획마다 자동 적용되는 필기의 첫 «2»가
    // 스케일을 굳혔다 — e2e에서 기둥 11mm를 쓰는데 1mm 스케일이 남았다(실측 1.2248mm
    // 잔차). 파생으로 바꾼 뒤에는 마지막 입력이 스케일이다.
    const { s, post } = drawn()
    const app = s.app
    expect(setDimension(app, post.id, 2)).toBe('scale')
    const k2 = app.lift.mmPerUnit!
    setDimension(app, post.id, 25)
    setDimension(app, post.id, 2500)
    expect(app.lift.mmPerUnit!).toBeCloseTo(k2 * 1250, 9)   // 2 → 2500: 스케일이 따라온다
    const g = app.lift.lifted.get(post.id)!
    expect(lenMm(g.a3, g.b3, app.lift.mmPerUnit)).toBeCloseTo(2500, 9)
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
    expect(lenMm(after.a3, after.b3, app.lift.mmPerUnit)).toBeCloseTo(1000, 9) // 길이 대체
  })

  it('다시 입력하면 대체된다 — 확정 전이든 후든 같은 몸짓(4-4의 «변경»)', () => {
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    const beam = s.draw(500, 380, 620, 350)!
    setDimension(app, beam.id, 1000)
    setDimension(app, beam.id, 700)
    const g = app.lift.lifted.get(beam.id)!
    expect(lenMm(g.a3, g.b3, app.lift.mmPerUnit)).toBeCloseTo(700, 9)
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
      { mmPerUnit: app.lift.mmPerUnit, snapStep: null })
    expect(r.lenMm).not.toBeNull()
    const st = s.draw(p.x, p.y, cursor.x, cursor.y)!
    const g = app.lift.lifted.get(st.id)!
    expect(lenMm(g.a3, g.b3, app.lift.mmPerUnit)).toBeCloseTo(r.lenMm!, 6)
  })

  it('무스케일이면 미리보기 길이도 null이다 — 숫자를 지어내지 않는다', () => {
    const { s } = drawn()
    const app = s.app
    const set = { ...app.osnap, radius: app.osnap.radius }
    const oh = resolveStart(app.lift, app.pose, { x: 500, y: 380 }, set)!
    const r = resolveEnd(app.lift, app.pose, app.lift.an, oh.p, { p3: oh.p3 }, { x: 620, y: 352 }, set,
      { mmPerUnit: app.lift.mmPerUnit, snapStep: null })
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
    const mm = lenMm(g.a3, g.b3, app.lift.mmPerUnit)!
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
    const mm = lenMm(g.a3, g.b3, app.lift.mmPerUnit)!
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
    const text = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const back = parseBrnl(text)!
    expect(back.doc.unit).toBe('m')
    expect(back.doc.strokes.find(x => x.id === post.id)!.dim).toBe(2500)
    // 스케일은 저장하지 않는다(파생 — 원칙 b) — 복원 후 리프팅이 같은 값을 다시 세운다
    const relift = liftAll(back.doc)
    expect(relift.mmPerUnit).toBeCloseTo(app.lift.mmPerUnit!, 12)
  })

  it('옛 파일(열쇠 없음)은 무스케일 mm로 읽힌다 · 틀린 모양은 거부한다', () => {
    const { s } = drawn()
    const raw = JSON.parse(serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId }))
    delete raw.unit
    const ok = parseBrnl(JSON.stringify(raw))!
    expect(ok.doc.unit).toBe('mm')
    expect(liftAll(ok.doc).mmPerUnit).toBeNull()   // 치수가 없으면 무스케일
    raw.unit = 'ft'
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()
    raw.unit = 'mm'
    raw.strokes = raw.strokes.map((x: any, i: number) => i === 0 ? { ...x, dim: -5 } : x)
    expect(parseBrnl(JSON.stringify(raw))).toBeNull()   // 틀린 치수 모양은 거부
  })
})

describe('스케일 기준은 «첫 입력»이다 — 문서 순서가 아니다 (리뷰어 [5])', () => {
  it('나중에 앞 획에 치수를 줘도 스케일이 조용히 안 옮겨 간다', () => {
    const { s, post } = drawn()
    const app = s.app
    const beam = s.draw(500, 380, 620, 350)!          // post(id 4)보다 뒤의 획
    expect(beam.id).toBeGreaterThan(post.id)
    expect(setDimension(app, beam.id, 1000)).toBe('scale')   // **뒤 획에 먼저** 입력
    const k0 = app.lift.mmPerUnit!
    expect(app.doc.scaleRef).toBe(beam.id)
    // 이제 문서 순서상 앞 획(post)에 치수를 준다 — 수리 전에는 scaleOf가 post를
    // 「첫 치수 획」으로 잡아 스케일이 조용히 재정의됐다
    expect(setDimension(app, post.id, 500)).toBe('applied')
    expect(app.doc.scaleRef).toBe(beam.id)                   // 기준이 안 움직였다
    expect(app.lift.mmPerUnit!).toBeCloseTo(k0, 12)
    // 두 획 다 자기 입력값을 보인다
    const gb = app.lift.lifted.get(beam.id)!
    const gp = app.lift.lifted.get(post.id)!
    expect(lenMm(gb.a3, gb.b3, app.lift.mmPerUnit)).toBeCloseTo(1000, 9)
    expect(lenMm(gp.a3, gp.b3, app.lift.mmPerUnit)).toBeCloseTo(500, 9)
  })

  it('기준 획이 지워지면 문서 순서상 첫 치수 획으로 물러난다 — 그 사실은 값이 보인다', () => {
    const { s, post } = drawn()
    const app = s.app
    const beam = s.draw(500, 380, 620, 350)!
    setDimension(app, beam.id, 1000)
    setDimension(app, post.id, 500)
    const i = app.doc.strokes.findIndex(x => x.id === beam.id)
    app.doc.strokes.splice(i, 1)                             // 기준 획을 지운다(하네스 직접)
    const relift = liftAll(app.doc)
    expect(relift.mmPerUnit).not.toBeNull()                  // post(dim 500)가 기준이 된다
    const gp = relift.lifted.get(post.id)!
    expect(lenMm(gp.a3, gp.b3, relift.mmPerUnit)).toBeCloseTo(500, 9)
  })
})

describe('치수가 공유 끝점을 옮길 때 — 붙어 있던 획은 어떻게 되는가 (리뷰어 [16])', () => {
  it('실측을 박는다: 뒤 획은 **그린 자리에 남는다**(빔 직선의 연장 매칭) — 따라가지 않는다', () => {
    // ⚠ 기준(스케일) 획을 다시 치수하면 기하가 아니라 스케일이 바뀐다(4-1b) — 그래서
    // 공유 끝점 이동은 **비기준 획**으로 잰다: 기둥(기준) → 빔(치수 대상) → 빔 끝의 드롭.
    const { s, post } = drawn()
    const app = s.app
    setDimension(app, post.id, 2500)
    const beam = s.draw(500, 380, 620, 352)!                 // 기둥 꼭대기 → vp0 축
    expect(app.lift.lifted.has(beam.id)).toBe(true)
    const bEnd = app.lift.lifted.get(beam.id)!.b3
    const bEnd2 = { x: beam.b.x, y: beam.b.y }
    const drop = s.draw(bEnd2.x, bEnd2.y, bEnd2.x + 2, bEnd2.y + 60)!   // 빔 끝에서 수직 드롭
    expect(app.lift.lifted.has(drop.id)).toBe(true)
    const dBefore = app.lift.lifted.get(drop.id)!

    setDimension(app, beam.id, 400)                          // 빔을 짧게 — 끝점이 당겨진다
    const gb = app.lift.lifted.get(beam.id)!
    expect(lenMm(gb.a3, gb.b3, app.lift.mmPerUnit)).toBeCloseTo(400, 9)
    const moved = Math.hypot(gb.b3.x - bEnd.x, gb.b3.y - bEnd.y, gb.b3.z - bEnd.z)
    expect(moved * app.lift.mmPerUnit!).toBeGreaterThan(100) // 끝점이 실제로 옮겨졌다

    // 실측: 드롭은 따라가지 않고 **그린 자리**에 남는다 — 시작 2D가 빔 «직선»(연장) 위라
    // 연장선 매칭이 옛 자리를 되찾는다(사영 일치는 유지 — 조용히 «틀린» 배치가 아니라
    // 공유가 끊긴 «상태»다). 끝점을 따라가는 치수 전파는 범위 밖 — DEFERRED.
    const dAfter = app.lift.lifted.get(drop.id)
    expect(dAfter).toBeDefined()
    for (const k of ['x', 'y', 'z'] as const) {
      expect(dAfter!.a3[k]).toBeCloseTo(dBefore.a3[k], 5)
    }
    const gap = Math.hypot(dAfter!.a3.x - gb.b3.x, dAfter!.a3.y - gb.b3.y, dAfter!.a3.z - gb.b3.z)
    expect(gap * app.lift.mmPerUnit!).toBeGreaterThan(100)   // 새 빔 끝과는 떨어져 있다
  })
})
