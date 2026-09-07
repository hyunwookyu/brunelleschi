// web2-74 §0·§1 — **멈춤에 이름을 붙이는 자**의 단위 시험.
//
// 여기서 지키는 것 넷:
//   ① 귀속 — 겹침이 큰 표식이 이긴다. 같으면 안쪽 것. 아무것도 안 겹치면 `?`(**반증 조건** D-3)
//   ② `?`일 때 직전에 끝난 표식을 «이웃»으로 든다(귀속이 아니다 — 이름이 그렇게 적힌다)
//   ③ 문턱 — 문턱 아래는 목록에 안 남고 사다리에는 남는다(한 동작점으로 주장하지 않는다 #12)
//   ④ 짝이 안 맞는 표식이 와도 스택이 안 샌다(계측이 앱을 망치면 안 된다)
//
// ⚠ 시간을 재지 않는다. 여기 드는 것은 **자기 자신의 규칙**이고, 실제 ms는 e2e 원장이 든다
//   (CLOSING 「자동 시험의 fps는 게이트가 아니다」).

import { describe, it, expect, beforeEach } from 'vitest'
import {
  MARK_NAMES, GAP_BUCKETS, markStart, markEnd, mark, attribute, noteGap,
  recentStalls, stallStats, markCounts, openMarks, resetPerfMarks, setStallMs, stallThresholdMs,
  gapLadder, stallLine, lastEndedBefore,
} from '../src/core/perfmark'

/** performance.now()를 쓰는 모듈이라 «시간이 흐르게» 조금 태운다(고정 대기 ⛔ — 바쁜 루프) */
const burn = (ms: number): void => { const t = performance.now(); while (performance.now() - t < ms) { /* 동기 */ } }

beforeEach(() => { resetPerfMarks(); setStallMs(200) })

describe('web2-74 perfmark — 표식과 멈춤', () => {
  it('일곱 + 둘 = 아홉. 지시문의 일곱이 그 안에 다 있다', () => {
    const seven = ['save.serialize', 'save.put', 'save.thumb', 'bake.commit', 'tex.upload', 'doc.parse', 'doc.build']
    for (const n of seven) expect(MARK_NAMES).toContain(n)
    // 74가 «값을 따라가» 더한 둘 — 세 팔의 멈춤이 전부 `?`로 나와서 자를 더 심었다(D-1)
    expect(MARK_NAMES).toContain('list.read')
    expect(MARK_NAMES).toContain('list.render')
    expect(MARK_NAMES.length).toBe(9)
  })

  it('mark()는 값을 그대로 돌려주고 장부에 한 줄을 남긴다(두르는 것이 하는 일을 안 바꾼다)', () => {
    const out = mark('doc.parse', () => { burn(2); return 41 + 1 })
    expect(out).toBe(42)
    const c = markCounts()['doc.parse']!
    expect(c.n).toBe(1)
    expect(c.ms).toBeGreaterThan(0)
    expect(openMarks()).toEqual([])
  })

  it('귀속 — 겹침이 큰 표식이 이긴다(안에 겹친 짧은 것이 훔치지 않는다)', () => {
    markStart('bake.commit')
    burn(6)
    mark('tex.upload', () => burn(1))       // 안쪽이지만 짧다
    burn(6)
    markEnd('bake.commit')
    // 방금 두른 두 구간을 통째로 덮는 창
    const now = performance.now()
    expect(attribute(now - 1000, now)).toBe('bake.commit')
  })

  it('귀속 — 겹침이 같으면 «안쪽»이 이긴다', () => {
    // 바깥과 안쪽이 같은 순간에 닫히면(겹침이 같다) 깊이가 큰 쪽
    markStart('save.put')
    markStart('save.serialize')             // 안쪽(깊이 1)
    burn(3)
    markEnd('save.serialize')
    markEnd('save.put')
    const now = performance.now()
    const who = attribute(now - 1000, now)
    expect(['save.serialize', 'save.put']).toContain(who)
  })

  it('⛳ 반증 — 어떤 표식과도 안 겹치면 `?`다', () => {
    mark('save.thumb', () => burn(2))
    const t = performance.now()
    burn(5)
    const now = performance.now()
    // 창을 표식 «뒤»로만 잡는다
    expect(attribute(t + 1, now)).toBe('?')
  })

  it('`?`일 때 직전에 끝난 표식을 이웃으로 든다 — 줄 문면이 `?→이름`', () => {
    setStallMs(1)                            // 창을 «표식 뒤»로만 잡으려고 문턱을 낮춘다
    mark('save.serialize', () => burn(2))
    const p = lastEndedBefore(performance.now())
    expect(p?.name).toBe('save.serialize')
    burn(6)
    // 창 [now-2, now]는 표식이 끝난 뒤의 구간이다 — 겹치는 표식이 없다
    const s = noteGap(performance.now(), 2)!
    expect(s.mark).toBe('?')                 // 그 순간 열려 있던 것은 없다
    expect(s.prev).toBe('save.serialize')
    expect(stallLine(s)).toContain('?→save.serialize')
  })

  it('문턱 — 아래는 목록에 안 남고, 사다리에는 남는다(#12 한 동작점 ⛔)', () => {
    setStallMs(200)
    expect(noteGap(1000, 120)).toBeNull()    // 문턱 아래
    expect(noteGap(2000, 260)).not.toBeNull()
    const st = stallStats()
    expect(st.n).toBe(1)
    expect(st.thresholdMs).toBe(200)
    const g = gapLadder()
    expect(g.thresholds).toEqual([...GAP_BUCKETS])
    expect(g.frames).toBe(2)                 // 두 간격 다 사다리에는 들었다
    expect(g.n[GAP_BUCKETS.indexOf(100)]).toBe(2)   // ≥100 둘
    expect(g.n[GAP_BUCKETS.indexOf(200)]).toBe(1)   // ≥200 하나
    expect(g.n[GAP_BUCKETS.indexOf(400)]).toBe(0)
    expect(g.maxMs).toBeCloseTo(260, 5)
  })

  it('문턱은 손잡이가 바꾼다 — 낮추면 같은 간격이 목록에 든다(반증 짝)', () => {
    setStallMs(200)
    expect(noteGap(1000, 120)).toBeNull()
    setStallMs(50)
    expect(stallThresholdMs()).toBe(50)
    expect(noteGap(2000, 120)).not.toBeNull()
  })

  it('목록은 최근 다섯을 낸다(옛 「최장 차단」은 한 칸이라 큰 것 뒤가 안 보였다)', () => {
    noteGap(1000, 2000)                      // 큰 것 하나
    for (let i = 0; i < 4; i++) noteGap(2000 + i * 100, 300 + i)
    const r = recentStalls(5)
    expect(r.length).toBe(5)
    expect(r[0]!.ms).toBe(2000)              // 큰 것도 남고
    expect(r[4]!.ms).toBe(303)               // 그 뒤의 것도 각각 남는다
    expect(stallStats().maxMs).toBe(2000)
  })

  it('줄 문면 — `t=12.4s · 1,850ms · save.thumb`', () => {
    const s = noteGap(12_400, 1850)!
    expect(s.mark).toBe('?')
    expect(stallLine(s).startsWith('t=12.4s · 1,850ms · ')).toBe(true)
  })

  it('짝이 안 맞는 표식이 와도 스택이 안 샌다(계측이 앱을 망치지 않는다)', () => {
    markEnd('doc.build')                     // 열지 않고 닫는다
    expect(openMarks()).toEqual([])
    expect(markCounts()['doc.build']).toBeUndefined()
    markStart('doc.build')
    markEnd('save.put')                      // 다른 이름으로 닫는다 — 안 닫힌다
    expect(openMarks()).toEqual(['doc.build'])
    markEnd('doc.build')
    expect(openMarks()).toEqual([])
  })

  it('reset은 표식·목록·사다리를 한꺼번에 비운다(팔이 «몸짓»만 재는 경계 #89)', () => {
    mark('list.render', () => burn(1))
    noteGap(1000, 500)
    resetPerfMarks()
    expect(stallStats().n).toBe(0)
    expect(gapLadder().frames).toBe(0)
    expect(Object.keys(markCounts()).length).toBe(0)
  })
})
