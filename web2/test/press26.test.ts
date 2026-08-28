// web2-26 6번 — **필압 보정**(옵션 · 기본 꺼짐)의 게이트.
//
// 사람의 증상(그대로): 「가장 자연스러운 필압으로 그리면 실제 연필이라면 매우 약하게 그은
//   것에 해당한다 … 진하기의 하한선이 너무 높다 … 진한 연필일수록 크게 느껴진다.」
// 사람의 판단: 「기본값은 현행 유지. 옵션으로 넣어라.」
//
// ⚠⚠ D-4 — **지시 3의 원인 후보가 틀렸다.** 「농도와 굵기가 한 계수를 공유하고 있을
//   가능성이 크니 확인하라」 → ⑤가 그 확인이다: **공유가 아니라 부재**였다. 필압은
//   `pressureProfile`을 타고 **굵기에만** 실리고 농도는 `strokeColor(grade)`의 등급 상수다.
//   즉 「약하게 그으면 옅게」가 **아예 없었다** — 그것이 「하한선이 너무 높다」의 정체다.
// D-3(반증): 게이트마다 옵션을 껐다 켜서 **판정이 실제로 갈리는 것**을 같은 실행에서 본다.

import { describe, it, expect } from 'vitest'
import {
  defaultPressCal, validPressCal, remapPress, pressAlpha, pressWidthFactor,
  calFromMedians, median, PRESS_SLOPE, type PressCal,
} from '../src/core/press'
import { strokeColor, strokeColorAt, weightOf, weightAt, rawPressProfile, lumaOf, pressureProfile } from '../src/app/brushmap'
import { MAT, PENCIL_GRADES } from '../src/core/material'
import { C } from '../src/core/constants'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { createApp, commitStroke, beginPressCalib, feedPressCalib, setPressOff, pressOn, loadDoc } from '../src/app/state'
import type { Stroke, Grade } from '../src/core/types'

const q = (p: number) => Math.round(p * C.PRESS_Q)
/** 압력 p(0..1)를 균일하게 실은 획 하나 */
const strokeAt = (id: number, g: Grade, p: number): Stroke => ({
  id, a: { x: 0, y: 0 }, b: { x: 100, y: 0 },
  raw: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }],
  rawIn: { press: [q(p), q(p), q(p)] },
  mat: { grade: g },
})

const CAL: PressCal = { on: true, p0: 0.05, p1: 0.35, gamma: 1 }

describe('26-6 ① 꺼진 문서는 지금과 **똑같다**', () => {
  it('보정이 없으면 색·굵기·필압 프로필이 종전 함수 그대로다 (전 등급 × 압력 스윕)', () => {
    // 꺼짐의 정의: `doc.press`가 **없다**. 그러면 렌더가 보정 갈래에 한 번도 안 들어간다
    // (`brushlayer.drawStrokeCalibrated`가 첫 줄에서 false). 여기서는 그 갈래가 부르는
    // 함수들이 **꺼짐에서 안 불린다**는 것을 값으로 확인한다: 종전 값이 압력에 안 흔들린다.
    for (const g of PENCIL_GRADES) {
      const base = strokeColor(g)
      for (const p of [0, 0.1, 0.2, 0.5, 1]) {
        const s = strokeAt(1, g, p)
        expect(strokeColor(g), `${g} 색이 압력에 안 흔들린다`).toBe(base)
        expect(weightOf(s), `${g} 굵기가 압력에 안 흔들린다`).toBe(MAT[g].width)
      }
    }
    // 그리고 **파일도 같아진다** — 꺼짐은 «없음»이지 «on: false»가 아니다
    const app = createApp(1200, 800)
    const before = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    setPressOff(app)
    expect(serializeBrnl({ doc: app.doc, nextId: app.nextId })).toBe(before)
    expect(before.includes('press')).toBe(false)
  })
})

describe('26-6 ② 켜면 약한 획이 실제로 옅다', () => {
  it('p=0.2가 꺼진 상태보다 옅다 — 전 등급 (+반증: 끄면 같아진다)', () => {
    const rows = PENCIL_GRADES.map(g => {
      const off = lumaOf(strokeColor(g))
      const on = lumaOf(strokeColorAt(g, remapPress(0.2, CAL)))
      return { g, off, on }
    })
    for (const r of rows) console.log(`[26-6 ②] ${r.g.padStart(2)} — 꺼짐 광도 ${r.off.toFixed(1)} · 켬(p=0.2) ${r.on.toFixed(1)}`)
    // 광도가 클수록 옅다(종이색에 가깝다)
    for (const r of rows) expect(r.on, `${r.g}`).toBeGreaterThan(r.off)
    // 반증(D-3) — 최대 압력에서는 천장이라 **같아진다**. 이 줄이 없으면 ②는 「늘 옅다」를
    // 재는 격자이고, 「천장이 등급 그대로」(지시 4)를 안 지킨 것도 못 잡는다.
    for (const g of PENCIL_GRADES) {
      expect(lumaOf(strokeColorAt(g, 1)), `${g} 최대 압력 = 등급 천장`).toBeCloseTo(lumaOf(strokeColor(g)), 6)
    }
  })

  it('「진한 연필일수록 어긋남이 크다」 — 버려지던 여유가 등급에 따라 다르다', () => {
    // 사람 진술의 정체(지시 4): 2B는 위로 남은 여유가 커서 바닥이 높으면 그만큼 더 버린다.
    // 켜기 전 이 앱의 «바닥»은 곧 천장이었다(농도가 압력에 안 반응 — ⑤). 그 버려지던
    // 폭이 등급마다 얼마인지를 값으로 낸다: 천장 − 바닥.
    const span = (g: Grade) => MAT[g].alpha - Math.min(C.PRESS_FLOOR_ALPHA, MAT[g].alpha)
    const rows = PENCIL_GRADES.map(g => ({ g, span: span(g) }))
    for (const r of rows) console.log(`[26-6 ②'] ${r.g.padStart(2)} — 열린 폭 ${r.span.toFixed(3)}`)
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.span).toBeGreaterThan(rows[i - 1]!.span)
  })
})

describe('26-6 ③ 2H는 어떤 압력에서도 최대 농도에 못 간다', () => {
  it('등급이 천장을 정하고 바닥은 안 정한다 — 천장 단조 · 바닥 공통', () => {
    const top = (g: Grade) => Math.max(...[0, 0.25, 0.5, 0.75, 1].map(p => pressAlpha(g, p)))
    const bot = (g: Grade) => Math.min(...[0, 0.01, 0.05].map(p => pressAlpha(g, p)))
    for (const g of PENCIL_GRADES) console.log(`[26-6 ③] ${g.padStart(2)} — 천장 ${top(g).toFixed(3)} · 바닥 ${bot(g).toFixed(3)} · 기울기 ${PRESS_SLOPE[g]}`)
    // 2H의 천장이 «최대 농도»에 한참 못 미친다. 최대 농도의 기준은 이 앱의 가장 진한 흑연이다.
    expect(top('2H')).toBeLessThan(top('2B') * 0.9)
    expect(top('2H')).toBeLessThan(1)
    // 천장은 등급이 정한다(단조) · **바닥은 전 등급 공통**이다(지시 4)
    for (let i = 1; i < PENCIL_GRADES.length; i++) {
      expect(top(PENCIL_GRADES[i]!)).toBeGreaterThan(top(PENCIL_GRADES[i - 1]!))
    }
    const floors = PENCIL_GRADES.map(bot)
    for (const f of floors) expect(f).toBeCloseTo(C.PRESS_FLOOR_ALPHA, 6)
    // 무를수록 **낮은 압력에서 천장에 닿는다**(기울기 — 지시 4)
    for (let i = 1; i < PENCIL_GRADES.length; i++) {
      expect(PRESS_SLOPE[PENCIL_GRADES[i]!]).toBeLessThan(PRESS_SLOPE[PENCIL_GRADES[i - 1]!])
      expect(pressAlpha(PENCIL_GRADES[i]!, 0.3) / MAT[PENCIL_GRADES[i]!].alpha)
        .toBeGreaterThan(pressAlpha(PENCIL_GRADES[i - 1]!, 0.3) / MAT[PENCIL_GRADES[i - 1]!].alpha)
    }
  })
})

describe('26-6 ④ 농도가 굵기보다 가파르다', () => {
  it('같은 압력 구간에서 농도의 배율이 굵기의 배율보다 훨씬 크다', () => {
    const s = strokeAt(1, 'HB', 1)
    const wLo = weightAt(s, 0), wHi = weightAt(s, 1)
    const aLo = pressAlpha('HB', 0), aHi = pressAlpha('HB', 1)
    console.log(`[26-6 ④] HB — 굵기 ${wLo.toFixed(3)} → ${wHi.toFixed(3)} (×${(wHi / wLo).toFixed(2)}) · 농도 ${aLo.toFixed(3)} → ${aHi.toFixed(3)} (×${(aHi / aLo).toFixed(1)})`)
    // 실제 연필: 굵기는 1.5~2배 느는 동안 농도는 거의 검정까지 간다(지시 3)
    expect(wHi / wLo).toBeGreaterThan(1.4)
    expect(wHi / wLo).toBeLessThan(2.2)
    expect(aHi / aLo).toBeGreaterThan((wHi / wLo) * 3)
    expect(pressWidthFactor(1)).toBe(1)          // 최대 압력의 굵기가 곧 등급 기본 굵기다
  })
})

describe('26-6 ⑤ D-4 — 「농도와 굵기가 한 계수를 공유한다」는 틀렸다', () => {
  it('종전 경로에서 압력은 굵기에만 실리고 농도는 등급 상수다 (그래서 하한선이 높았다)', () => {
    for (const p of [0.05, 0.2, 0.5, 1]) {
      const s = strokeAt(1, '2B', p)
      // 필압은 brush 계수로 살아 있다 — 즉 «압력이 안 실린다»가 아니라 **굵기에만** 실린다
      const prof = pressureProfile(s)!
      expect(prof[0]).toBeCloseTo(0.5 + p, 3)
      // 그런데 색은 한 값이다
      expect(strokeColor('2B')).toBe(strokeColor('2B'))
    }
    // 그 결과 종전에는 «약하게 그은 2B»와 «세게 그은 2B»의 색이 **정확히 같았다**
    expect(lumaOf(strokeColor('2B'))).toBe(lumaOf(strokeColor('2B')))
    // 보정을 켜면 갈린다 — 이것이 이 항목이 더한 것이다
    expect(lumaOf(strokeColorAt('2B', remapPress(0.05, CAL))))
      .toBeGreaterThan(lumaOf(strokeColorAt('2B', remapPress(0.5, CAL))) + 20)
  })
})

describe('26-6 ⑥ 보정 절차 — 두 획의 중앙값', () => {
  it('평소 → 가장 세게 두 획으로 p0·p1이 선다 · 너무 가까우면 다시 받는다', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
    const ok = calFromMedians(0.12, 0.48)!
    expect(ok.p0).toBeCloseTo(0.12, 9)
    expect(ok.p1).toBeCloseTo(0.48, 9)
    expect(ok.on).toBe(true)
    // 순서를 거꾸로 줘도 같다(사람이 반대로 그을 수 있다)
    expect(calFromMedians(0.48, 0.12)).toEqual(ok)
    // 너무 가까우면 null — 나눗셈이 폭발하는 자리를 만들지 않는다
    expect(calFromMedians(0.30, 0.32)).toBeNull()
    expect(validPressCal(defaultPressCal())).toBe(true)
  })

  it('앱 경로 — 켬 → 두 획 → 문서에 선다 (마우스 획은 「펜이 필요하다」)', () => {
    const app = createApp(1200, 800)
    beginPressCalib(app)
    expect(pressOn(app)).toBe(false)
    // 마우스 획(rawIn 없음) — 절차가 안 넘어간다
    const noPen = commitStroke(app, { x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])
    expect(feedPressCalib(app, noPen)).toBe('nopen')
    // 펜 획 둘
    const pen = (p: number) => commitStroke(app, { x: 0, y: 0 }, { x: 100, y: 0 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], p, { press: [q(p), q(p), q(p)] })
    expect(feedPressCalib(app, pen(0.12))).toBe('first')
    expect(feedPressCalib(app, pen(0.46))).toBe('done')
    expect(pressOn(app)).toBe(true)
    expect(app.doc.press!.p0).toBeCloseTo(0.12, 3)
    expect(app.doc.press!.p1).toBeCloseTo(0.46, 3)
    // 끄면 «없음»으로 돌아간다(on:false가 아니다)
    setPressOff(app)
    expect(app.doc.press).toBeUndefined()
    expect(pressOn(app)).toBe(false)
  })
})

describe('26-6 ⑦ 문서 왕복 — 모드와 p0/p1/γ가 돌아온다', () => {
  it('저장 → 복원에서 값이 그대로 · 깨진 값은 조용히 버린다(그림은 열린다)', () => {
    const app = createApp(1200, 800)
    app.doc.press = { on: true, p0: 0.08, p1: 0.42, gamma: 1.3 }
    const json = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const back = parseBrnl(json)!
    expect(back.doc.press).toEqual({ on: true, p0: 0.08, p1: 0.42, gamma: 1.3 })
    // 앱 경로로도 돈다(문서를 열면 화면 상태가 그 문서의 것이다)
    const app2 = createApp(1200, 800)
    loadDoc(app2, back)
    expect(pressOn(app2)).toBe(true)
    expect(app2.doc.press).toEqual({ on: true, p0: 0.08, p1: 0.42, gamma: 1.3 })

    // 깨진 값 — 간격이 하한 아래. 문서는 열리고 옵션만 꺼진다(scaleRef·면의 선례)
    const broken = JSON.parse(json)
    broken.press = { on: true, p0: 0.30, p1: 0.31, gamma: 1 }
    const b2 = parseBrnl(JSON.stringify(broken))
    expect(b2).not.toBeNull()
    expect(b2!.doc.press).toBeUndefined()
    // 옛 문서(press 없음)도 그대로 열린다
    const legacy = JSON.parse(json)
    delete legacy.press
    expect(parseBrnl(JSON.stringify(legacy))!.doc.press).toBeUndefined()
  })
})

describe('26-6 ⑧ 재매핑 자체', () => {
  it('p0 아래는 0 · p1 위는 1 · 사이는 단조 · γ가 굽힌다', () => {
    expect(remapPress(0.0, CAL)).toBe(0)
    expect(remapPress(0.05, CAL)).toBe(0)
    expect(remapPress(0.35, CAL)).toBe(1)
    expect(remapPress(0.9, CAL)).toBe(1)
    expect(remapPress(0.2, CAL)).toBeCloseTo(0.5, 6)
    for (let p = 0.05; p < 0.35; p += 0.02) {
      expect(remapPress(p + 0.01, CAL)).toBeGreaterThanOrEqual(remapPress(p, CAL))
    }
    // γ — 1보다 크면 아래를 더 눌러 준다(같은 입력에서 더 옅다)
    const bent = { ...CAL, gamma: 2 }
    expect(remapPress(0.2, bent)).toBeLessThan(remapPress(0.2, CAL))
    // 센서 압력 표본은 **원값**이다(재료표 앞단 — 0.5 오프셋이 없다)
    expect(rawPressProfile(strokeAt(1, 'HB', 0.3))![0]).toBeCloseTo(0.3, 3)
    expect(rawPressProfile(strokeAt(1, 'INK', 0.3))).toBeNull()   // 제도펜은 균일선이다
  })
})
