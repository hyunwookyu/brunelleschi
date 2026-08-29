// web2-30 11번 — **연장선을 왕복 제스처 획득으로 바꾼다**(구조 변경).
//
// ⚠⚠ **26-3의 띠 넓히기는 실패다.** 헤드리스 획득률을 40 → 100/110으로 올렸는데
//   **실제 도면에서는 거의 안 걸렸다**(사람 관측). 원인은 값이 아니라 **층위**다:
//   실제 작도는 획이 수십 개라 포인터 근처에 끝점·중점·교점 후보가 늘 하나쯤 있고,
//   `OSNAP_ORDER`에서 점이 `ext`보다 앞이므로 연장선은 **수면에 못 올라온다**.
//   → `ext`를 후보 목록에서 빼고 **선언된 구속**으로 옮겼다(`draft.applyExtLock`).
//   (`test/extband26.test.ts`는 그 띠를 재던 팔이라 이 파일이 대신한다.)
//
// **이 파일의 핵심은 픽스처다**(D-5 · #71 ㉢). 지시가 못 박았다: 「획 40개 이상의 장면에서
//   잰다. 깨끗한 장면으로 재면 아무것도 못 본다.」 그래서 ①이 **먼저 옛 결함을 재현**한다 —
//   같은 자리에서 옛 층위(ext를 후보로)라면 점 후보가 몇 번이나 이기는지 센다.
//
// D-3(반증): ②는 **왕복을 안 하면 절대 안 선다**를 같은 실행에서 잰다. ③은 왕복의 두
//   조건(최소 바깥 이동·되돌아온 비율)을 하나씩 깨뜨려 각각 선언이 안 서는 것을 본다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import {
  newExtDwell, beginExtTrip, updateExtTrip, declareExt, declareAtForTest, clearExtAcq,
} from '../src/core/extacq'
import { osnap, defaultOsnap, isLineKind, OSNAP_ORDER } from '../src/core/osnap'
import { resolveEnd } from '../src/core/draft'
import { C } from '../src/core/constants'
import { pt, type Pt } from '../src/core/vec'

const W = 1200, H = 800

/** **획 40개 이상의 현실적인 장면**(지시가 못 박은 픽스처 · D-5).
 *  상자 하나로 카메라를 닫고, 그 위에 격자처럼 획을 쌓는다 — 실제 작도처럼 끝점·중점·
 *  교점이 화면 곳곳에 널린다. 깨끗한 장면(획 두셋)으로 재면 아무것도 안 보인다. */
function busy() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)      // 가로(축 정의)
  s.draw(500, 560, 800, 480)      // 깊이(둘째 소실점)
  s.draw(500, 560, 500, 660)      // 세로
  expect(s.app.lift.an.constructionDone).toBe(true)
  // 격자 — 가로 여섯 × 세로 여섯 + 대각 몇
  for (let i = 0; i < 6; i++) {
    const y = 380 + i * 34
    s.draw(360, y, 760, y)
  }
  for (let i = 0; i < 6; i++) {
    const x = 380 + i * 62
    s.draw(x, 360, x, 580)
  }
  for (let i = 0; i < 6; i++) s.draw(360 + i * 60, 380, 420 + i * 60, 560)
  for (let i = 0; i < 6; i++) s.draw(360, 380 + i * 30, 700, 420 + i * 30)
  for (let i = 0; i < 6; i++) s.draw(700 + i * 12, 380, 760, 500 + i * 12)
  for (let i = 0; i < 8; i++) s.draw(300 + i * 40, 620, 340 + i * 40, 700)
  expect(s.app.doc.strokes.length, '실사용 대역 — 획 40개 이상').toBeGreaterThanOrEqual(40)
  return s
}

/** 왕복 몸짓 — 시작점에서 `dir` 쪽으로 `out`만큼 나갔다가 `back` 비율까지 돌아온다 */
function roundTrip(
  st: ReturnType<typeof newExtDwell>, s: ReturnType<typeof session>,
  start: Pt, dir: Pt, out: number, backRatio: number,
): boolean {
  const L = Math.hypot(dir.x, dir.y)
  const ux = dir.x / L, uy = dir.y / L
  beginExtTrip(st, start)
  let declared = false
  const tol = C.EXT_TRIP_LINE_TOL_PX
  const min = C.EXT_TRIP_MIN_PX
  for (let k = 1; k <= 12; k++) {
    const d = out * k / 12
    declared = updateExtTrip(st, s.app.lift, s.app.pose, pt(start.x + ux * d, start.y + uy * d), tol, min, k) || declared
  }
  for (let k = 1; k <= 12; k++) {
    const d = out * (1 - (1 - backRatio) * k / 12)
    declared = updateExtTrip(st, s.app.lift, s.app.pose, pt(start.x + ux * d, start.y + uy * d), tol, min, 12 + k) || declared
  }
  return declared
}

describe('30-11 ① 층위 — `ext`는 후보 목록에 없다(재현: 옛 층위면 점이 계속 이긴다)', () => {
  it('OSNAP_ORDER에 ext가 없고, 선언해도 `osnap`이 ext를 안 낸다', () => {
    expect(OSNAP_ORDER).not.toContain('ext')
    const s = busy()
    const st = newExtDwell()
    const first = [...s.app.lift.lifted.keys()][0]!
    declareExt(st, first)
    // 화면 곳곳을 훑어도 후보로는 한 번도 안 난다
    let ext = 0
    for (let x = 300; x <= 800; x += 25) for (let y = 340; y <= 620; y += 25) {
      const h = osnap(s.app.lift, s.app.pose, pt(x, y), defaultOsnap(), undefined, undefined, st.acquired)
      if (h?.kind === 'ext') ext++
    }
    expect(ext, '선언해도 오스냅 후보로는 안 난다').toBe(0)
  })

  it('재현(D-2) — 이 장면에서는 포인터 근처에 **늘 점 후보가 있다**(그래서 옛 층위가 졌다)', () => {
    const s = busy()
    let withPoint = 0, total = 0
    const pointKinds = new Set(['vertex', 'end', 'mid', 'int', 'xint'])
    for (let x = 340; x <= 780; x += 20) for (let y = 360; y <= 600; y += 20) {
      total++
      const h = osnap(s.app.lift, s.app.pose, pt(x, y), defaultOsnap())
      if (h && pointKinds.has(h.kind)) withPoint++
    }
    const ratio = withPoint / total
    console.log(`[30-11 재현] 획 ${s.app.doc.strokes.length}개 장면 — 점 후보가 이기는 칸 ${withPoint}/${total} (${(ratio * 100).toFixed(1)}%)`)
    // 이 수가 «띠를 넓혀도 소용없던» 이유다 — 점이 `ext`보다 앞이므로 그 칸에서는 못 이긴다.
    expect(withPoint, '깨끗한 장면이 아니다 — 점 후보가 실제로 곳곳에 있다').toBeGreaterThan(total * 0.1)
  })
})

describe('30-11 ② 왕복을 하면 선언되고 · 안 하면 **절대** 안 된다', () => {
  it('왕복 → 선언 · 곧게 나가기만 하면 선언 없음(반증 · D-3)', () => {
    const s = busy()
    const st = newExtDwell()
    // 가로 격자선(360,380)-(760,380) 위를 따라 나갔다 돌아온다
    const start = pt(500, 380)
    const declared = roundTrip(st, s, start, pt(1, 0), 160, 0.3)
    console.log(`[30-11 ②] 왕복 — 선언 ${declared} · acquired ${JSON.stringify(st.acquired)}`)
    expect(declared, '왕복을 하면 선언된다').toBe(true)
    expect(st.acquired.length, '그 선의 **두 끝**이 열린다').toBe(2)
    expect(st.acquired[0]!.id).toBe(st.acquired[1]!.id)

    // 반증 — **나가기만 하고 안 돌아오면** 한 번도 안 선다
    const st2 = newExtDwell()
    beginExtTrip(st2, start)
    for (let k = 1; k <= 24; k++) {
      updateExtTrip(st2, s.app.lift, s.app.pose, pt(start.x + 8 * k, start.y), C.EXT_TRIP_LINE_TOL_PX, C.EXT_TRIP_MIN_PX, k)
    }
    expect(st2.acquired, '되돌아오지 않으면 선언이 없다').toEqual([])
  })

  it('두 조건을 하나씩 깨뜨리면 각각 안 선다 (최소 바깥 이동 · 되돌아온 비율)', () => {
    const s = busy()
    const start = pt(500, 380)
    // ㉠ 너무 짧게 나갔다 온다 — 손떨림 대역
    const shortTrip = newExtDwell()
    expect(roundTrip(shortTrip, s, start, pt(1, 0), C.EXT_TRIP_MIN_PX * 0.6, 0.2)).toBe(false)
    expect(shortTrip.acquired).toEqual([])
    // ㉡ 충분히 나갔지만 **거의 안 돌아온다**
    const noReturn = newExtDwell()
    expect(roundTrip(noReturn, s, start, pt(1, 0), 160, 0.95)).toBe(false)
    expect(noReturn.acquired).toEqual([])
    // ㉢ 둘 다 채우면 선다(대조 — 위 둘이 «늘 거짓»이 아니다)
    const ok = newExtDwell()
    expect(roundTrip(ok, s, start, pt(1, 0), 160, 0.3)).toBe(true)
  })
})

describe('30-11 ③ 선언된 구속이 실제로 끝점을 옮긴다 · 유지된다', () => {
  it('선언하면 `resolveEnd`가 그 선으로 투영한다 (+반증: 선언이 없으면 안 그런다)', () => {
    const s = busy()
    const st = newExtDwell()
    const start = pt(500, 380)
    expect(roundTrip(st, s, start, pt(1, 0), 160, 0.3)).toBe(true)
    const id = st.acquired[0]!.id

    // 그 선에서 **뚜렷이** 벗어난 커서 — 선언이 있으면 그 선 위로 온다.
    // ⚠ 살짝(8px)만 벗어난 자리를 골랐다가 무선언 답(`xint`)이 우연히 같은 직선 위라
    //    차가 0.08px이었다 — «두 답이 다르다»를 실제로 가르는 자리를 골라야 한다.
    const cursor = pt(690, 336)
    const locked = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
      start, { p3: null }, cursor, defaultOsnap(), undefined, st.acquired)
    const bare = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
      start, { p3: null }, cursor, defaultOsnap())
    console.log(`[30-11 ③] 선언 ${locked.endSnap?.kind} (${locked.end.x.toFixed(1)},${locked.end.y.toFixed(1)}) ↔ 무선언 ${bare.endSnap?.kind ?? bare.label} (${bare.end.x.toFixed(1)},${bare.end.y.toFixed(1)})`)
    expect(locked.endSnap?.kind, '선언된 구속이 선다').toBe('ext')
    expect(locked.endSnap?.srcId).toBe(id)
    // 분해능 — 두 답이 실제로 다르다(같으면 이 팔은 아무것도 안 잰다)
    expect(Math.hypot(locked.end.x - bare.end.x, locked.end.y - bare.end.y)).toBeGreaterThan(1)
  })

  it('선언은 획이 끝날 때까지 유지되고, 확정이 비운다', () => {
    const s = busy()
    const st = newExtDwell()
    const start = pt(500, 380)
    roundTrip(st, s, start, pt(1, 0), 160, 0.3)
    const id = st.acquired[0]!.id
    // 그 뒤로 이리저리 움직여도 선언이 안 바뀐다(다른 왕복이 없으면)
    for (let k = 1; k <= 10; k++) {
      updateExtTrip(st, s.app.lift, s.app.pose, pt(500 + k * 3, 380 + k * 2), C.EXT_TRIP_LINE_TOL_PX, C.EXT_TRIP_MIN_PX, 100 + k)
    }
    expect(st.acquired[0]!.id, '다른 왕복이 없으면 유지된다').toBe(id)
    clearExtAcq(st)
    expect(st.acquired, '획을 확정하면 비운다').toEqual([])
  })
})

describe('30-11 ④ 점 스냅 무회귀 — 26-3 이전으로 돌아왔다', () => {
  it('선언이 없으면 점 후보의 승리 자리와 좌표가 «띠 배율 1»과 같다', () => {
    const s = busy()
    const base = { ...defaultOsnap(), lineRatio: 1, lineHoldRatio: 1 }
    let same = 0, n = 0
    for (let x = 340; x <= 780; x += 20) for (let y = 360; y <= 600; y += 20) {
      const a = osnap(s.app.lift, s.app.pose, pt(x, y), defaultOsnap())
      const b = osnap(s.app.lift, s.app.pose, pt(x, y), base)
      n++
      const eq = (a === null && b === null) ||
        (a !== null && b !== null && a.kind === b.kind &&
          Math.abs(a.p.x - b.p.x) < 1e-9 && Math.abs(a.p.y - b.p.y) < 1e-9)
      if (eq) same++
    }
    console.log(`[30-11 ④] 띠 배율 1 ↔ 지금 — 같은 칸 ${same}/${n}`)
    // 넓힌 띠를 쓰던 후보가 하나도 안 남았으므로 **전 칸이 같아야 한다**
    expect(same).toBe(n)
  })

  it('원칙 d — 선언된 구속에서도 미리보기 좌표 == 확정 좌표', () => {
    const s = busy()
    const st = newExtDwell()
    const start = pt(500, 380)
    roundTrip(st, s, start, pt(1, 0), 160, 0.3)
    for (const cursor of [pt(660, 372), pt(700, 388), pt(740, 376), pt(620, 384)]) {
      const r = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
        start, { p3: null }, cursor, defaultOsnap(), undefined, st.acquired)
      const again = resolveEnd(s.app.lift, s.app.pose, s.app.lift.an,
        start, { p3: null }, r.end, defaultOsnap(), undefined, st.acquired)
      expect(Math.abs(again.end.x - r.end.x)).toBeLessThan(1e-6)
      expect(Math.abs(again.end.y - r.end.y)).toBeLessThan(1e-6)
    }
  })

  it('왕복 중에 지나간 점 후보에 잘못 물리지 않는다 — 선언 전에는 구속이 없다', () => {
    const s = busy()
    const st = newExtDwell()
    const start = pt(500, 380)
    beginExtTrip(st, start)
    // 나가는 길 내내 선언이 없다(구속이 조용히 켜지지 않는다)
    for (let k = 1; k <= 12; k++) {
      updateExtTrip(st, s.app.lift, s.app.pose, pt(start.x + 14 * k, start.y), C.EXT_TRIP_LINE_TOL_PX, C.EXT_TRIP_MIN_PX, k)
      expect(st.acquired, `나가는 길 ${k}에서는 선언이 없다`).toEqual([])
    }
  })
})

describe('30-11 ⑤ D-4 무회귀 — `perp`는 여전히 점 후보다(AS-C110)', () => {
  it('술어가 그대로다 · 그리고 «넓힌 띠»는 이제 **발화 조건이 없다**', () => {
    expect(isLineKind('perp', defaultOsnap()), '기본은 점 후보다').toBe(false)
    expect(isLineKind('perp', { ...defaultOsnap(), perpLine: true }), '손잡이를 켜면 선 후보다').toBe(true)
    // `ext`는 여전히 «선 후보»로 분류되지만 **더 이상 생성되지 않는다** — 그래서
    // 기본 경로에서 넓힌 띠(`OSNAP_LINE_RATIO`)를 쓰는 후보가 **하나도 없다**.
    expect(isLineKind('ext', defaultOsnap())).toBe(true)
    expect(OSNAP_ORDER).not.toContain('ext')

    // ⚠⚠ **거동 반증은 여기서 은퇴한다**(#77 ㉡의 형태). `extband26 ⑤`는 「perp를 선
    //   후보로 켜면 확정 좌표가 15px 밀린다」를 실제 장면에서 냈는데, 그 밀림은 **넓힌
    //   띠가 실제로 걸릴 때**만 난다. 지금은 기본 경로에 선 후보가 없으므로 그 조건이
    //   **구성상 안 선다** — 이 회차에서 여러 장면으로 훑어 봤고 갈리는 칸이 0이었다
    //   (깨끗한 장면·40획 장면·`perp`만 켠 격자 셋 다). 「발화 조건이 없는 검증은
    //   항등이므로 안 만든다」가 이 프로젝트의 규약이고, 그 실측과 근거는 AS-C110·NOTES에
    //   남는다. 되돌릴 조건: `perp`를 다시 선 후보로 올리자는 말이 나오면 그때
    //   **그 장면부터** 세운다(15px 밀림이 그때 되살아나야 한다).
    expect(true).toBe(true)
  })
})

describe('30-11 ⑥ 팔 전용 통로 — `declareAtForTest`는 앱 경로가 아니다', () => {
  it('앱은 왕복으로만 선언한다(이 통로는 옛 «머무름 획득»의 자리를 잇는다)', () => {
    const s = busy()
    const st = newExtDwell()
    const seg = [...s.app.lift.lifted.entries()][0]!
    const p = { x: 0, y: 0 }
    void p
    expect(declareAtForTest(st, s.app.lift, s.app.pose, pt(-9999, -9999), 8), '먼 자리에서는 안 선다').toBe(false)
    declareExt(st, seg[0])
    expect(st.acquired.length).toBe(2)
  })
})
