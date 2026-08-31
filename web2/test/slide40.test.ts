// web2-40 2번 — **겹을 깔고 치우는 동작**의 단위 팔.
//
// 이 회차의 게이트 넷 가운데 **값으로 재는 것 셋**이 여기 있다(넷째 「프레임이 안 떨어진다」와
// 「픽셀로 같다」는 화면 팔 몫이다 — `e2e/slide40.spec.ts`):
//   ① 동작이 **끝나면 «없던 것»이다** — `slideAway`가 창 끝에서 **정확히 0**.
//   ② 동작이 **입력을 안 막는다** — 창이 열린 동안에도 획이 그 겹으로 들어가고,
//      획이 들어오면 창이 **그 자리에서** 닫힌다.
//   ③ 결 씨앗은 동작과 무관하다(web2-20 무회귀) — 롤을 다시 꺼내면 id가 다르다.
//
// **D-3 반증 조건**(새 검사에는 반증이 붙는다 — CLAUDE.md §2):
//   ①의 「창 끝에서 0」은 **창 안에서 0이 아님**을 같은 시험이 함께 재지 않으면 실패
//   불가능한 격자다(창이 늘 0이어도 통과한다). 그래서 «끝나기 1 ms 전»이 0보다 크다를
//   짝으로 박는다. ②도 같다 — 「닫힌다」의 짝은 «부르기 전에는 열려 있었다»이다.

import { describe, it, expect } from 'vitest'
import { slideT, slideEase, slideAway, slideRunning, slideCurl, SLIDE_FROM, type Slide } from '../src/core/slide'
import { LAY_SLIDE_MS } from '../src/core/constants'
import { session } from './session'
import { addLayer, removeLayer, startSlide, slideAwayOf, slidesActive, settleSlides, pruneSlides, undo } from '../src/app/state'

const W = 1200, H = 800
const MS = LAY_SLIDE_MS

function closedSession() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 620, 800, 500)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

describe('길이 — 지시가 준 대역 안이다', () => {
  it('0.25~0.35초', () => {
    expect(MS).toBeGreaterThanOrEqual(250)
    expect(MS).toBeLessThanOrEqual(350)
  })
})

describe('① 창 — 끝나면 «없던 것»이다', () => {
  const IN: Slide = { t0: 1000, dir: 'in' }
  const OUT: Slide = { t0: 1000, dir: 'out' }

  it('깔기: 시작에 1 · 끝에 **정확히 0**', () => {
    expect(slideAway(IN, 1000, MS)).toBe(1)
    expect(slideAway(IN, 1000 + MS, MS)).toBe(0)
    expect(slideAway(IN, 1000 + MS + 5000, MS)).toBe(0)   // 지나도 0
  })
  it('반증(D-3): 끝나기 1 ms 전에는 **0이 아니다** — 「늘 0」이면 위 단언이 아무것도 안 잰다', () => {
    expect(slideAway(IN, 1000 + MS - 1, MS)).toBeGreaterThan(0)
  })
  it('치우기: 시작에 0 · 끝에 1(같은 쪽으로 물러난다)', () => {
    expect(slideAway(OUT, 1000, MS)).toBe(0)
    expect(slideAway(OUT, 1000 + MS, MS)).toBe(1)
  })
  it('말린 앞 가장자리는 제자리에서 **정확히 0**이다(픽셀 동일의 산술 뿌리)', () => {
    expect(slideCurl(slideAway(IN, 1000 + MS, MS))).toBe(0)
    expect(slideCurl(slideAway(IN, 1000 + MS - 1, MS))).toBeGreaterThan(0)   // 반증 짝
  })
  it('그늘은 **종이가 보이는 대역에서 짙다** — 첫 판(`curl = away`)이 여기서 빨갛다', () => {
    // 화면으로 잡은 그 프레임의 값(away = 0.295)에서 그늘이 **최대 짙기**여야 한다.
    // `curl = away`였다면 0.295였고 알파가 0.18×0.295 = 0.053까지 내려가 안 읽혔다.
    expect(slideCurl(0.295)).toBe(1)
    expect(slideCurl(0.1)).toBeCloseTo(0.5, 6)     // 그 아래에서 잦아든다
    expect(slideCurl(0)).toBe(0)
  })
  it('창이 닫히면 «돈다»가 거짓이다 — 프레임 고리가 조용해진다', () => {
    expect(slideRunning(IN, 1000 + MS - 1, MS)).toBe(true)
    expect(slideRunning(IN, 1000 + MS, MS)).toBe(false)
  })
  it('진행도·감속 — 경계와 단조', () => {
    expect(slideT(1000, 999, MS)).toBe(0)
    expect(slideT(1000, 1000 + MS, MS)).toBe(1)
    expect(slideT(1000, 1000, 0)).toBe(1)          // 길이 0이면 이미 끝이다
    expect(slideEase(0)).toBe(0)
    expect(slideEase(1)).toBe(1)
    expect(slideEase(0.5)).toBeGreaterThan(0.5)    // ease-out — 앞이 빠르다
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const e = slideEase(i / 20)
      expect(e).toBeGreaterThan(prev)
      prev = e
    }
  })
  it('들어오는 쪽은 하나다 — 겹마다 안 갈린다(지시: 장마다 방향이 다르면 어지럽다)', () => {
    expect(SLIDE_FROM).toBe('left')
  })
})

describe('② 동작이 입력을 안 막는다', () => {
  it('창이 열린 채로 그은 획이 **그 겹에** 정상으로 들어간다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    expect(slidesActive(s.app, performance.now())).toBe(true)   // 창이 열려 있다
    const before = s.app.doc.strokes.length
    s.draw(300, 300, 500, 320)
    expect(s.app.doc.strokes.length).toBe(before + 1)
    expect(s.app.doc.strokes[s.app.doc.strokes.length - 1]!.layer).toBe(lay.id)
  })

  it('`settleSlides`가 창을 **그 자리에서** 닫는다 (+반증: 부르기 전에는 열려 있었다)', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    expect(slideAwayOf(s.app, lay.id, performance.now())).toBeGreaterThan(0)   // 반증 짝
    settleSlides(s.app)
    expect(slideAwayOf(s.app, lay.id, performance.now())).toBe(0)
    expect(slidesActive(s.app, performance.now())).toBe(false)
  })

  it('치우기: 문서는 **그 자리에서** 옳고 유령만 화면에 남는다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'yellow', { W, H })!
    settleSlides(s.app)
    removeLayer(s.app, lay.id)
    expect(s.app.doc.layers.find(l => l.id === lay.id)).toBeUndefined()   // 문서에서 즉시 빠졌다
    expect(s.app.slideGhosts.map(g => g.layer.id)).toEqual([lay.id])      // 화면에만 남는다
    expect(slideAwayOf(s.app, lay.id, performance.now())).toBeLessThan(1) // 아직 물러나는 중
    settleSlides(s.app)
    expect(s.app.slideGhosts.length).toBe(0)
  })

  it('창이 지나면 표가 스스로 빈다 — 문서 크기로 안 자란다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'tracing', { W, H })!
    const t0 = performance.now()
    expect(s.app.slides.size).toBe(1)
    pruneSlides(s.app, t0)                     // 아직 창 안 — 안 버린다(반증 짝)
    expect(s.app.slides.size).toBe(1)
    pruneSlides(s.app, t0 + MS + 1)
    expect(s.app.slides.size).toBe(0)
    expect(slideAwayOf(s.app, lay.id, performance.now())).toBe(0)
  })

  it('되살아난 겹의 유령은 버린다 — 실행취소로 돌아오면 한 겹이 두 번 안 그려진다', () => {
    const s = closedSession()
    const lay = addLayer(s.app, 'yellow', { W, H })!
    settleSlides(s.app)
    removeLayer(s.app, lay.id)
    expect(s.app.slideGhosts.length).toBe(1)
    undo(s.app)                                     // 겹 삭제는 실행취소 대상이다(web2-20 2-c)
    expect(s.app.doc.layers.map(l => l.id)).toContain(lay.id)
    pruneSlides(s.app, performance.now())
    expect(s.app.slideGhosts.length).toBe(0)
  })
})

describe('③ 결 씨앗은 동작과 무관하다(web2-20 무회귀)', () => {
  it('겹을 걷었다가 다시 얹으면 **id가 다르다** — 롤을 다시 꺼내면 무늬가 달라야 한다', () => {
    const s = closedSession()
    const a = addLayer(s.app, 'tracing', { W, H })!
    removeLayer(s.app, a.id)
    const b = addLayer(s.app, 'tracing', { W, H })!
    expect(b.id).not.toBe(a.id)   // 결의 씨앗은 rng32(layer.id) — 동작이 그 흐름에 안 낀다
    // 동작을 여닫아도 id가 안 바뀐다(창은 표현만 든다)
    const before = b.id
    startSlide(s.app, b.id, 'out', performance.now())
    settleSlides(s.app)
    expect(b.id).toBe(before)
  })
})
