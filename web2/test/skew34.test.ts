// 34-7 어긋남 문턱 — **자연 분포 위에 놓인 자**의 팔.
//
// D-2(재현 먼저): 옛 문턱(비 편차 0.02)이 **흔들림을 태운 픽스처**에서 실제로 거의 다 뜬다는
//   것을 먼저 낸다(그것이 사용자가 말한 병이다). 이 팔은 **수리 전에 실패했다** —
//   `skewOff`가 0.02를 읽던 때는 아래 「자연 대역은 조용하다」가 통째로 빨갰다.
// D-3(반증): ㉠ 문턱을 3.0으로 올리면 3배 오독이 샌다 ㉡ 자를 비 하나로 되돌리면 «작게 적은»
//   오독이 통째로 샌다 ㉢ 잡음 0인 대조 픽스처에서는 옛 문턱조차 안 뜬다(그것이 DEFERRED가
//   적은 결함이다 — 「문턱 절반에서 안 뜬다」가 **잡음 0에서만** 보였다).
//
// 분포의 수치는 원장이 정본이다: `stage0/out/skew34_web2.json`(LEDGER=1로 낸다).

import { describe, it, expect } from 'vitest'
import { COMPS, cells } from './skew34scene'

const SEEDS = [1, 2, 3, 4, 5]
const rows = (mult: number, jit: number, deg: number) => {
  const v = []
  for (const c of COMPS) for (const sd of SEEDS) v.push(...cells(c, jit, deg, sd, mult))
  return v
}
const fold = (mult: number, jit: number, deg: number): number[] => rows(mult, jit, deg).map(k => k.fold)
/** **제품의 판정**으로 센다(`skewOff`) — 팔이 자를 다시 짜면 자를 바꿔도 팔이 안 빨개진다 */
const fires = (v: { off: boolean }[]) => v.filter(k => k.off).length
const q = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]!
}
const over = (v: number[], t: number) => v.filter(x => x > t).length

describe('34-7 어긋남 문턱 — 자연 분포와 배수 오독', () => {
  it('D-2 재현: 흔들림을 태우면 **옛 문턱 0.02가 거의 다 뜬다**', () => {
    // 잰 값의 비 그대로다(fold = max(비, 1/비)이므로 「비 편차 0.02」는 fold 1.02 언저리)
    const nat = fold(1, 0.005, 0.25)
    const oldFires = nat.filter(x => x > 1.02).length
    expect(nat.length).toBeGreaterThan(100)
    expect(oldFires / nat.length).toBeGreaterThan(0.6)      // 손으로 옳게 적어도 60% 넘게 뜬다
    // 반증의 짝(D-3 ㉢) — **잡음 0**인 대조 픽스처에서는 그 0.02가 한 칸도 안 뜬다.
    // 이 칸 하나가 web2-32의 픽스처 전부였고, 그래서 여유를 못 쟀다(DEFERRED의 그 행).
    const quiet = fold(1, 0, 0)
    expect(quiet.length).toBeGreaterThan(100)
    expect(quiet.filter(x => x > 1.02).length).toBe(0)
    expect(q(quiet, 1)).toBeCloseTo(1, 9)                   // 구성상 정확히 1이다
  })

  it('새 문턱은 그 자연 분포 위에 있다 — 중앙은 1.0x이고 오탐이 낮다', () => {
    const nat = [...rows(1, 0, 0.25), ...rows(1, 0.005, 0), ...rows(1, 0.005, 0.25)]
    expect(q(nat.map(k => k.fold), 0.5)).toBeLessThan(1.2)  // 「보통」은 10% 안쪽
    expect(fires(nat) / nat.length).toBeLessThan(0.05)      // 오탐 — **제품의 판정으로 센다**
  })

  it('배수 오독은 **양방향** 다 잡는다 — 3배·10배', () => {
    for (const [mult, name] of [[3, '3배 크게'], [1 / 3, '3배 작게'], [10, '10배 크게'], [1 / 10, '자릿수 누락']] as const) {
      const v = rows(mult, 0.005, 0.25)
      expect(fires(v) / v.length, name).toBeGreaterThan(0.9)
    }
  })

  it('반증(D-3) ㉠: 문턱을 3.0으로 올리면 **3배 오독이 샌다** — 위 경계가 실재한다', () => {
    const up3 = rows(3, 0.005, 0.25)
    expect(fires(up3) / up3.length).toBeGreaterThan(0.95)                   // 지금 문턱에서는 잡힌다
    expect(over(up3.map(k => k.fold), 3.0) / up3.length).toBeLessThan(0.6)  // 3.0에서는 절반 넘게 샌다
  })

  it('반증(D-3) ㉡: 자를 **비 하나**로 되돌리면 작게 적은 오독이 통째로 샌다', () => {
    // 같은 「100%」인데 자의 모양이 답을 가른다. 이것이 대칭 자를 고른 유일한 근거다.
    for (const mult of [1 / 3, 1 / 10]) {
      const v = rows(mult, 0.005, 0.25)
      expect(v.length).toBeGreaterThan(100)
      expect(v.filter(k => Math.abs(k.ratio - 1) > 1).length).toBe(0)       // 옛 자 — 0칸
      expect(fires(v) / v.length).toBeGreaterThan(0.9)                      // 새 자(제품) — 거의 다
    }
  })
}, 60_000)
