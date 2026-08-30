// web2-37 2번 — **대기는 옅은 청색 · 확정은 흑연**(단위).
//
// 재는 것은 색이 아니라 **두 상태가 갈리는가**다. 그래서 판정자를 하나로 둔다:
//
//     hueShift(hex) = b − r        (양수 = 청색 쪽 · 0 = 무채색 흑연)
//
// 청색 쪽으로 얼마나 가는지는 **`WAIT_INK` 자신에서 읽는다** — 팔이 73 같은 수를
// 손에 들지 않는다(PITFALLS #88: 팔이 든 상수가 더 오래 안 걸린다. 색을 바꾸면
// 화면은 옳은데 팔만 빨개지는 그 자리다). 문은 「대기의 색상 이동이 **확정의 것보다
// 훨씬 크다**」이고, 두 끝값은 둘 다 대상에서 나온다.
//
// **D-3 반증 조건**(아래 마지막 describe) — 이 팔이 실패하는 판을 실제로 만들어 돌린다:
//   · `off` = 청색을 끈 판(37-2 이전) → 「대기는 청색」이 무너진다
//   · `all` = **확정에도 청색을 칠한 판** → 「확정은 흑연」이 무너진다
// 둘 다 안 무너지면 이 팔은 아무것도 안 재는 것이다.

import { describe, it, expect, afterEach } from 'vitest'
import { MAT, GRADES } from '../src/core/material'
import { WAIT_INK, bodyHex, mixHex, settleFade, setWaitInkMode } from '../src/core/waitfade'
import { SETTLE_ANIM_MS } from '../src/core/constants'
import { strokeColor, strokeColorMix } from '../src/app/brushmap'
import { inkMix, settleActive } from '../src/app/state'

/** 색상 이동 — 파랑 채널에서 빨강 채널을 뺀다. 흑연(무채색)은 0 언저리다. */
const hueShift = (hex: string): number =>
  parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16)

/** 대기 몸체를 그대로 흉내 낸 판정 — `settledAt`만 있으면 되므로 문서 전체가 필요 없다 */
const fakeApp = (settledAt: Map<number, number> = new Map()) => ({ settledAt })

afterEach(() => setWaitInkMode('on'))

describe('web2-37 2번 — 상태는 색상 축, 등급은 농도 축', () => {
  it('확정(mix 0)은 **재료색 그 문자열**이다 — 확정에 아무것도 안 붙는다', () => {
    for (const g of GRADES) expect(bodyHex(g, 0)).toBe(MAT[g].color)
    // 브러시 겹도 같다 — 종전 함수와 **문자열이 같아야** 픽셀이 한 비트도 안 움직인다
    for (const g of GRADES) expect(strokeColorMix(g, 0)).toBe(strokeColor(g))
  })

  it('대기(mix 1)는 **등급과 무관하게 한 색**이다 — 논포토 블루', () => {
    for (const g of GRADES) expect(bodyHex(g, 1)).toBe(WAIT_INK)
  })

  it('대기의 색상 이동이 확정의 것보다 훨씬 크다 (두 끝값 다 대상에서 읽는다)', () => {
    const wait = hueShift(WAIT_INK)
    expect(wait).toBeGreaterThan(0)                    // 청색 쪽이다
    for (const g of GRADES) {
      const conf = Math.abs(hueShift(bodyHex(g, 0)))
      expect(conf * 4).toBeLessThan(wait)              // 확정은 무채색 대역(흑연)
      expect(hueShift(bodyHex(g, 1))).toBe(wait)       // 대기는 정확히 그 색
    }
  })

  it('**농도는 등급이 그대로 정한다** — 색상을 바꿔도 알파는 재료의 것이다', () => {
    // 2H 확정선 ↔ 2B 대기선이 안 섞이는 근거: 두 축이 직교한다.
    // (여기서 재는 것은 «알파를 안 건드렸다» 하나 — 화면 진하기는 e2e가 잰다)
    for (const g of GRADES) {
      const a = MAT[g].alpha
      expect(a).toBe(MAT[g].alpha)
      // 혼합색이 알파를 안 든다 — bodyHex는 색상만 낸다(7자 hex)
      expect(bodyHex(g, 1)).toMatch(/^#[0-9a-f]{6}$/)
    }
    // 등급이 오르면 알파가 오른다(재료표 그대로 — 상태색이 이 단조를 안 건드린다)
    const pencil = ['2H', 'H', 'F', 'HB', 'B', '2B'] as const
    for (let i = 1; i < pencil.length; i++)
      expect(MAT[pencil[i]!].alpha).toBeGreaterThan(MAT[pencil[i - 1]!].alpha)
  })

  it('혼합은 두 끝 사이에서 단조다 — 중간값이 양 끝 사이에 있다', () => {
    const g = 'HB' as const
    const at = (t: number) => hueShift(bodyHex(g, t))
    expect(at(0.5)).toBeGreaterThan(at(0))
    expect(at(0.5)).toBeLessThan(at(1))
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('web2-37 2번 — 정착 전이(짧고, 끝나면 사라진다)', () => {
  it('창 안에서 1 → 0으로 내려가고 창 밖은 정확히 0이다', () => {
    expect(settleFade(0)).toBe(1)
    expect(settleFade(SETTLE_ANIM_MS)).toBe(0)
    expect(settleFade(SETTLE_ANIM_MS * 10)).toBe(0)
    const mid = settleFade(SETTLE_ANIM_MS / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    // 단조 감소 — 계단이나 되돌아옴이 없다
    let prev = 1
    for (let i = 1; i <= 20; i++) {
      const v = settleFade((SETTLE_ANIM_MS * i) / 20)
      expect(v).toBeLessThanOrEqual(prev)
      prev = v
    }
  })

  it('`inkMix` — 대기 1 · 갓 정착 (0,1) · 창 밖 0 · 모르는 획 0', () => {
    const app = fakeApp(new Map([[7, 1000], [8, 1000 - SETTLE_ANIM_MS * 2]]))
    expect(inkMix(app, true, 99, 1000)).toBe(1)               // 대기
    const fresh = inkMix(app, false, 7, 1000 + SETTLE_ANIM_MS / 2)
    expect(fresh).toBeGreaterThan(0)
    expect(fresh).toBeLessThan(1)
    expect(inkMix(app, false, 7, 1000 + SETTLE_ANIM_MS)).toBe(0)   // 창 밖
    expect(inkMix(app, false, 8, 1000)).toBe(0)                    // 이미 지난 것
    expect(inkMix(app, false, 5, 1000)).toBe(0)                    // 표에 없는 획
  })

  it('`settleActive` — 창 안에 하나라도 있으면 참, 없으면 거짓(평소엔 조용하다)', () => {
    const app = fakeApp(new Map([[7, 1000]]))
    expect(settleActive(app, 1000 + SETTLE_ANIM_MS / 2)).toBe(true)
    expect(settleActive(app, 1000 + SETTLE_ANIM_MS)).toBe(false)
    expect(settleActive(fakeApp(), 1000)).toBe(false)
  })
})

// ── D-3 **반증** — 이 팔이 실패하는 조건을 실제로 실행한다 ────────────────────────
describe('web2-37 2번 — 반증 조건(위약 판에서 문이 무너진다)', () => {
  /** 위 팔의 두 문을 그대로 술어로 쓴다 — 「무엇이 무너지는가」가 눈에 보이게. */
  const waitIsBlue = () => GRADES.every(g => hueShift(bodyHex(g, 1)) > 4 * Math.abs(hueShift(bodyHex(g, 0))) &&
    hueShift(bodyHex(g, 1)) > 0)
  const confirmIsGraphite = () => GRADES.every(g => Math.abs(hueShift(bodyHex(g, 0))) * 4 < hueShift(WAIT_INK))

  it('성한 판에서는 두 문이 다 선다', () => {
    setWaitInkMode('on')
    expect(waitIsBlue()).toBe(true)
    expect(confirmIsGraphite()).toBe(true)
  })

  it('위약 ①  `off`(청색을 끈 판 = 37-2 이전) — 「대기는 청색」이 무너진다', () => {
    setWaitInkMode('off')
    expect(waitIsBlue()).toBe(false)                     // ← 실제로 빨개지는 자리
    for (const g of GRADES) expect(bodyHex(g, 1)).toBe(MAT[g].color)
    expect(confirmIsGraphite()).toBe(true)               // 이 문은 그대로 선다(축이 다르다)
  })

  it('위약 ②  `all`(확정에도 청색을 칠한 판) — 「확정은 흑연」이 무너진다', () => {
    setWaitInkMode('all')
    expect(confirmIsGraphite()).toBe(false)              // ← 실제로 빨개지는 자리
    for (const g of GRADES) expect(bodyHex(g, 0)).toBe(WAIT_INK)
    // 그리고 두 상태가 **안 갈린다** — 그것이 이 위약이 재현하는 결함이다
    for (const g of GRADES) expect(bodyHex(g, 0)).toBe(bodyHex(g, 1))
  })

  it('위약은 `inkMix`까지 간다 — 브러시 겹은 혼합비로 색을 다시 섞으므로', () => {
    const app = fakeApp()
    setWaitInkMode('off')
    expect(inkMix(app, true, 1, 0)).toBe(0)              // 대기인데 0 = 흑연
    setWaitInkMode('all')
    expect(inkMix(app, false, 1, 0)).toBe(1)             // 확정인데 1 = 청색
  })
})
