// web2-26 4번 — **옐로 직선화 대기시간이 조금 길다**의 게이트.
//
// 실기기(DEVICE-CHECK D6): 「조금 길다」. 지시: **시간만 보지 말고 속도를 같이 본다.**
//
// D-1(왜 시간만 내리면 안 되나 — 표식이 먼저 답했다): 종전 문은 「4px 상자 안에서
//   `HOLD_MS`」 하나였고 그 실효 속도 문턱이 `상자 ÷ 시간`이다. 600 → 350ms는 그 문턱을
//   6.7 → **11.4 px/s로 넓힌다** — 즉 시간만 내리면 「천천히 그린 곡선이 직선화된다」가
//   **더** 잘 난다. 아래 ③이 그 산술을 값으로 못 박는다.
// D-3(반증 조건): 속도 문을 끄면(문턱을 무한대로) ①이 실패한다 — 같은 실행에서 돌린다.
// D-5(픽스처가 실사용 대역을 덮는가): ②의 「멈춤」과 ①의 「느린 곡선」 사이에 **속도 스윕**을
//   두고 문이 어디서 넘어가는지 분포를 낸다. 두 점만 재면 그 사이를 모른다.
//
// ⚠ 시각은 주입한다(가짜 시계) — `tickHold`가 순수 상태 기계라 실행 시간에 안 흔들린다.

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newHoldGate, tickHold, yellowEnd } from '../src/core/hold'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const DT = 8            // 표본 간격 ms(120Hz 펜 — 실기기 대역)

/** 한 획을 끝까지 흘려보내고 «머무름이 성립한 순간»을 돌려준다(안 서면 null).
 *  `path(t)`가 시각 t(ms)에서의 커서 자리다. */
function runStroke(path: (t: number) => { x: number; y: number }, ms: number,
  opts?: { holdMs?: number; speed?: number; legacy?: boolean }) {
  const g = newHoldGate()
  const holdMs = opts?.holdMs ?? C.HOLD_MS
  // **legacy = web2-26 이전 게이트 그대로**(고정 4px 상자 · 속도 문 없음) — D-3 반증 손잡이.
  const speed = opts?.legacy ? Infinity : (opts?.speed ?? C.HOLD_SPEED_PX_S)
  const drift = opts?.legacy ? 4 : undefined
  for (let t = 0; t <= ms; t += DT) {
    if (tickHold(g, path(t), t, holdMs, speed, drift)) return { at: t, vel: g.vel }
  }
  return null
}

/** 곡선 — 속도 `v` px/s로 반지름 `r`의 원호를 그린다(방향이 계속 바뀐다 = 곡선이다) */
const curve = (v: number, r = 300) => (t: number) => {
  const arc = v * t / 1000                     // 지나온 호 길이
  const a = arc / r
  return { x: 400 + r * Math.sin(a), y: 400 + r * (1 - Math.cos(a)) }
}

/** 긋다가 멈춤 — `stopAt` 까지 빠르게 긋고 그 뒤로는 멈춘다(손 떨림 ±0.6px 포함) */
const drawThenStop = (stopAt: number, tremorPx = 0.6) => {
  // 떨림은 결정론이어야 한다(#14 · Math.random ⛔) — 표본 번호의 삼각함수로 만든다
  return (t: number) => {
    if (t <= stopAt) return { x: 200 + 0.4 * t, y: 400 }
    const i = (t - stopAt) / DT
    return { x: 200 + 0.4 * stopAt + tremorPx * Math.sin(i * 1.7), y: 400 + tremorPx * Math.cos(i * 2.3) }
  }
}

describe('26-4 ① 천천히 그린 곡선은 직선화되지 않는다', () => {
  it('8~200 px/s 곡선 전 대역에서 안 선다 (+반증: 「시간만 내린」 옛 게이트는 느린 쪽을 직선화한다)', () => {
    const speeds = [8, 10, 20, 40, 80, 200]
    const rows = speeds.map(v => ({
      v,
      now: runStroke(curve(v), 4000)?.at ?? null,
      // 반증(D-3) — **옛 게이트를 350ms에 그대로 태운 것**이 「시간만 내리기」다
      legacy350: runStroke(curve(v), 4000, { legacy: true })?.at ?? null,
      legacy600: runStroke(curve(v), 4000, { legacy: true, holdMs: 600 })?.at ?? null,
    }))
    for (const r of rows) {
      console.log(`[26-4 ①] ${String(r.v).padStart(3)} px/s — 지금: ${r.now ?? '안 섬'} · 옛 게이트@350: ${r.legacy350 ?? '안 섬'} · 옛 게이트@600: ${r.legacy600 ?? '안 섬'}`)
    }
    for (const r of rows) expect(r.now, `${r.v} px/s 곡선이 직선화되면 안 된다`).toBeNull()
    // 반증 — 「시간만 내리기」는 **실제로 느린 쪽을 직선화한다**. 이 줄이 없으면 위 여섯 줄은
    // 「곡선이라 상자를 벗어나서」 통과한 것인지 이 수리 때문인지를 못 가른다(#74 ㉠).
    const newlyStraightened = rows.filter(r => r.legacy350 !== null && r.legacy600 === null)
    console.log(`[26-4 ①-반증] 시간만 내렸다면 새로 직선화됐을 속도: ${newlyStraightened.map(r => r.v).join(', ') || '없음'}`)
    expect(newlyStraightened.length, '시간만 내리면 새로 직선화되는 대역이 실제로 있다').toBeGreaterThan(0)
  })
})

describe('26-4 ② 긋다가 멈추면 0.35s 근처에서 직선화된다', () => {
  it('멈춘 뒤 성립까지의 시간이 기본 임계 대역 안이다', () => {
    const stopAt = 400
    const hit = runStroke(drawThenStop(stopAt), 3000)
    expect(hit, '멈추면 성립한다').not.toBeNull()
    const delay = hit!.at - stopAt
    console.log(`[26-4 ②] 멈춘 뒤 ${delay}ms 에 직선화(임계 ${C.HOLD_MS}ms · 창 속도 ${hit!.vel?.toFixed(1)} px/s)`)
    // 속도 평활(τ=100ms)이 임계 위에 얹히므로 «임계 + 평활 꼬리» 대역이다.
    expect(delay).toBeGreaterThanOrEqual(C.HOLD_MS)
    expect(delay).toBeLessThan(C.HOLD_MS + 3 * C.HOLD_SPEED_WINDOW_MS)
    // 그리고 반듯해진다 — 이 획은 화면 수평이므로 H로 붙는다
    const y = yellowEnd({ x: 200, y: 400 }, { x: 500, y: 402 }, true)
    expect(y.snapped).toBe('H')
    expect(y.end.y).toBe(400)
  })

  it('종전 임계(600ms)보다 실제로 빨라졌다 — 「조금 길다」가 이 수다', () => {
    const stopAt = 400
    const now = runStroke(drawThenStop(stopAt), 3000)!.at - stopAt
    const before = runStroke(drawThenStop(stopAt), 3000, { holdMs: 600 })!.at - stopAt
    console.log(`[26-4 ②'] 종전 600ms: ${before}ms · 지금 ${C.HOLD_MS}ms: ${now}ms`)
    expect(now).toBeLessThan(before)
    expect(before - now).toBeGreaterThan(200)
  })
})

describe('26-4 ③ D-1의 산술 — 시간만 내리면 반대 방향이다', () => {
  it('고정 상자의 실효 표류 문턱은 시간을 내리면 넓어진다 · 비례 상자는 안 넓어진다', () => {
    const fixed600 = 4 / 0.6
    const fixed350 = 4 / (C.HOLD_MS / 1000)
    const prop = C.HOLD_JITTER_PX / (C.HOLD_DRIFT_REF_MS / 1000)
    console.log(`[26-4 ③] 고정 상자: 600ms → ${fixed600.toFixed(1)} px/s · ${C.HOLD_MS}ms → ${fixed350.toFixed(1)} px/s · 비례 상자: 어느 임계에서나 ${prop.toFixed(1)} px/s`)
    expect(fixed350).toBeGreaterThan(fixed600)          // 넓어진다 = 느슨해진다
    expect(prop).toBeCloseTo(fixed600, 6)               // 비례 상자는 600ms의 문턱을 그대로 옮긴다

    // 값으로도 난다 — 옛 게이트를 350ms에 태우면 10 px/s 곡선이 직선화되고, 600ms에서는 안 된다
    const v = 10
    const legacy350 = runStroke(curve(v), 5000, { legacy: true })?.at ?? null
    const legacy600 = runStroke(curve(v), 5000, { legacy: true, holdMs: 600 })?.at ?? null
    console.log(`[26-4 ③] ${v} px/s 곡선 · 옛 게이트 — 350ms: ${legacy350 ?? '안 섬'} · 600ms: ${legacy600 ?? '안 섬'}`)
    expect(legacy350).not.toBeNull()
    expect(legacy600).toBeNull()
    // 지금 게이트는 350ms에서도 안 선다 — 그것이 이 수리의 내용이다
    expect(runStroke(curve(v), 5000)).toBeNull()
  })
})

describe('26-4 ④ 사람이 고치는 대역', () => {
  it('0.10~1.50s 어디서든 그 값 대역에서 성립한다 (원장에 분포를 남긴다)', () => {
    const stopAt = 400
    const rows = [100, 200, 350, 600, 1000, 1500].map(holdMs => {
      const hit = runStroke(drawThenStop(stopAt), 5000, { holdMs })
      return { holdMs, delay: hit ? hit.at - stopAt : null }
    })
    for (const r of rows) console.log(`[26-4 ④] 임계 ${r.holdMs}ms → ${r.delay}ms 에 성립`)
    for (const r of rows) {
      expect(r.delay, `${r.holdMs}ms`).not.toBeNull()
      expect(r.delay!).toBeGreaterThanOrEqual(r.holdMs)
      expect(r.delay!).toBeLessThan(r.holdMs + 3 * C.HOLD_SPEED_WINDOW_MS)
    }
    expect(C.HOLD_MS_MIN).toBe(100)
    expect(C.HOLD_MS_MAX).toBe(1500)

    // 속도 스윕(D-5) — 문이 어디서 넘어가는가. 두 점만 재면 그 사이를 모른다.
    const sweep = [2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 100, 140, 200].map(v => ({
      v, held: runStroke(curve(v, 1e6), 3000)?.at ?? null,   // 반지름 1e6 = 거의 직선(속도만 본다)
    }))
    for (const r of sweep) console.log(`[26-4 스윕] ${String(r.v).padStart(3)} px/s(거의 직선) → ${r.held ?? '안 섬'}`)
    const boundary = sweep.find(r => r.held === null)
    expect(boundary, '어딘가에서 넘어간다 — 전부 서거나 전부 안 서면 이 스윕은 아무것도 안 잰다').toBeDefined()

    const out = resolve(HERE, '../../stage0/out/hold26_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-26 4번 — 옐로 머무름 직선화의 시간·속도 문. hold26.test.ts가 쓴다. 판정은 그 파일의 expect가 정본.',
      conditions: {
        sampling: `표본 간격 ${DT}ms(120Hz 펜 대역) · 가짜 시계 주입(tickHold는 순수 상태 기계)`,
        tremor: '멈춤 픽스처는 손 떨림 ±0.6px을 결정론(sin/cos)으로 태운다 — Math.random ⛔(#14)',
        command: 'npx vitest run test/hold26.test.ts',
      },
      constants: {
        HOLD_MS: C.HOLD_MS, HOLD_MS_MIN: C.HOLD_MS_MIN, HOLD_MS_MAX: C.HOLD_MS_MAX,
        HOLD_JITTER_PX: C.HOLD_JITTER_PX,
        HOLD_SPEED_PX_S: C.HOLD_SPEED_PX_S, HOLD_SPEED_WINDOW_MS: C.HOLD_SPEED_WINDOW_MS,
        HOLD_DRIFT_REF_MS: C.HOLD_DRIFT_REF_MS, HOLD_JITTER_MIN_PX: C.HOLD_JITTER_MIN_PX,
      },
      threshold_by_hold_ms: rows,
      speed_sweep_near_straight: sweep,
      drift_threshold_px_s: {
        fixed_box_at_600ms: 4 / 0.6,
        fixed_box_at_current: 4 / (C.HOLD_MS / 1000),
        proportional_box_any_time: C.HOLD_JITTER_PX / (C.HOLD_DRIFT_REF_MS / 1000),
        note: '고정 상자로 재던 시절의 실효 표류 문턱은 시간을 내리면 «넓어졌다»(6.7 → 11.4 px/s). 상자를 시간에 비례시켜 그 문턱을 임계 시간과 무관하게 고정했다.',
      },
    }, null, 2))
  })
})
