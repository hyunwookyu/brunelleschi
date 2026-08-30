// 37-6 팔 — **오스냅의 당김을 재기만 한다**(값은 안 바꾼다 · 지시 문면).
//
// 이 파일이 지는 것 여섯:
//   ① 픽스처가 실사용 대역인가 — 획 40개 이상(#71 · D-5)
//   ② 팔이 실제로 무언가를 재는가 — 지금 값에서 당김이 0이 아니다
//   ③ **반증**(D-3) — 반경 0인 위약 판·오스냅을 끈 위약 판에서 **0으로 떨어진다**
//   ④ 대조군 — 「일부러 물리려는 손」에서는 획득이 전량 난다(당김이 아니라 획득이 옳은 답이다)
//   ⑤ 불변식 — 시작점은 **반경 밖으로 안 간다**(시작점에는 선 후보의 넓은 띠가 안 걸린다)
//   ⑥ 탐침 = 확정 — `startHit`이 예고한 자리가 `draw`가 확정한 획의 `a`와 같다
//
// ⚠ 이 파일에는 반경 값이 안 적혀 있다(#88) — 전부 `s.app.osnap` / `C`에서 읽는다.
//    수치의 정본은 원장 `stage0/out/osnappull37_web2.json`이다(여기 수는 낡는다 #47).

import { describe, it, expect } from 'vitest'
import {
  busy37, inkBox, screenBox, run, probe, aimedControl, allKindsOff, confirmCommit,
} from './pull37scene'
import { defaultOsnap } from '../src/core/osnap'
import { C } from '../src/core/constants'

const N = 600
const SEED = 0x37a1

describe('37-6 ① 픽스처 — 획 40개 이상의 도면(깨끗한 장면으로 안 잰다)', () => {
  it('40획 이상이고 카메라가 닫혔다', () => {
    const s = busy37()
    expect(s.app.doc.strokes.length, '실사용 대역 — 획 40개 이상').toBeGreaterThanOrEqual(40)
    expect(s.app.lift.an.constructionDone).toBe(true)
    expect(s.app.lift.lifted.size, '3D로 올라간 획이 있어야 후보가 난다').toBeGreaterThan(20)
  })

  it('반경의 출처가 제품 하나다 — 기본값이 상수 그대로다', () => {
    const s = busy37()
    expect(defaultOsnap().radius).toBe(C.OSNAP_RADIUS_PX)
    expect(s.app.osnap.radius).toBe(defaultOsnap().radius)
    // 팔의 배율은 1이다 — 그래야 「문서 단위 = 화면 px」로 읽을 수 있다
    expect(s.app.view.s).toBe(1)
    expect(s.app.viewF).toBeNull()
    expect(s.osnapSet().radius).toBe(s.app.osnap.radius)
  })
})

describe('37-6 ② 기준선 — 허공에서 시작하려는 손을 오스냅이 물어 간다', () => {
  it('작도 영역에서 당김이 0이 아니다', () => {
    const s = busy37()
    const r = run(s, 'ink', inkBox(s), SEED, N)
    expect(r.trials).toBe(N)
    expect(r.acquired, '획득이 0이면 팔이 아무것도 안 잰다').toBeGreaterThan(0)
    expect(r.pulled, `당김(> ${C.TAP_MAX_PX}px)이 0이면 잴 것이 없다`).toBeGreaterThan(0)
    expect(r.pulled).toBeLessThanOrEqual(r.acquired)
  })

  it('화면 전체 대역에서도 잰다 — 다만 훨씬 낮다(대역이 값의 절반이다 · #71)', () => {
    const s = busy37()
    const ink = run(s, 'ink', inkBox(s), SEED, N)
    const scr = run(s, 'screen', screenBox(), SEED, N)
    expect(scr.acquired).toBeGreaterThan(0)
    // 도면 밖 여백이 섞이면 비율이 내려간다 — 「어디서 뽑았나」를 안 적은 수는 뜻이 없다
    expect(scr.acquired).toBeLessThan(ink.acquired)
  })
})

describe('37-6 ③ 반증(D-3) — 위약 판에서 0으로 떨어진다', () => {
  it('위약 ① 반경 0 — 획득 0 · 당김 0', () => {
    const s = busy37()
    const r = run(s, 'placebo-r0', inkBox(s), SEED, N, { radius: 0 })
    expect(r.radius).toBe(0)
    expect(r.acquired).toBe(0)
    expect(r.pulled).toBe(0)
    expect(r.moved_max).toBe(0)
  })

  it('위약 ② 오스냅 종류 전부 끔 — 획득 0 · 당김 0(반경은 그대로다)', () => {
    const s = busy37()
    const r = run(s, 'placebo-off', inkBox(s), SEED, N, { kinds: allKindsOff(s) })
    expect(r.radius).toBe(s.app.osnap.radius)   // 반경은 안 건드렸다 — 종류만 껐다
    expect(r.acquired).toBe(0)
    expect(r.pulled).toBe(0)
  })

  it('위약을 되돌리면 기준선으로 돌아온다 — 갈아 끼움이 새는지 본다', () => {
    const s = busy37()
    const a = run(s, 'ink', inkBox(s), SEED, N)
    run(s, 'placebo-r0', inkBox(s), SEED, N, { radius: 0 })
    const b = run(s, 'ink', inkBox(s), SEED, N)
    expect(b.acquired).toBe(a.acquired)
    expect(b.pulled).toBe(a.pulled)
    expect(s.app.osnap.radius).toBe(defaultOsnap().radius)
  })
})

describe('37-6 ④ 대조군 — 일부러 물리려는 손', () => {
  it('끝점 그 자리에서 시작하면 전량 획득되고 대개 제자리다', () => {
    const s = busy37()
    const c = aimedControl(s, 0)
    expect(c.trials).toBeGreaterThan(0)
    expect(c.acquired).toBe(c.trials)
    expect(c.moved_median).toBeLessThan(1e-6)   // 물렸지만 «당김»은 아니다
  })

  it('⚠ 그래도 제자리가 아닌 칸이 있다 — **종류가 거리를 이긴다**', () => {
    // `OSNAP_ORDER`는 정확한 종류를 앞세운다(osnap.ts 머리말). 그래서 0 px에 있는 `end`도
    // 반경 안의 `vertex`·`vp`에게 진다 — 겨냥해서 눌러도 시작점이 옮겨지는 자리가 실재한다.
    // 이 줄이 뒤집히면(전부 제자리) 오스냅이 «거리 우선»으로 바뀐 것이다.
    const s = busy37()
    const c = aimedControl(s, 0)
    expect(c.offTarget, '우선순위가 거리를 이기는 칸이 실재한다').toBeGreaterThan(0)
    expect(c.offTarget / c.trials, '그래도 소수다').toBeLessThan(0.5)
    expect(c.moved_max).toBeLessThanOrEqual(s.app.osnap.radius + 1e-9)
  })

  it('끝점 옆에서 시작하면 전량 획득되고 그만큼 끌려간다', () => {
    const s = busy37()
    const off = C.TAP_MAX_PX + 1                       // 앱의 «같은 점» 문 바로 밖
    const c = aimedControl(s, off)
    expect(c.acquired).toBe(c.trials)
    expect(c.moved_median).toBeCloseTo(off, 9)         // 겨냥한 그 끝점으로 간다
    expect(Math.min(...c.moved)).toBeGreaterThan(C.TAP_MAX_PX)
  })
})

describe('37-6 ⑤ 불변식 — 시작점은 반경 밖으로 안 간다', () => {
  it('시작점 판정에는 선 후보의 넓은 띠가 안 걸린다(ext는 목록에 없고 perp는 시작점이 없다)', () => {
    const s = busy37()
    const R = s.app.osnap.radius
    const rows = probe(s, inkBox(s), SEED, N)
    const worst = Math.max(...rows.map(r => r.moved))
    expect(worst).toBeLessThanOrEqual(R + 1e-9)
    // 대역이 실제로 반경까지 찬다 — 안 그러면 이 불변식은 아무것도 안 재는 것이다
    expect(worst).toBeGreaterThan(R * 0.9)
  })
})

describe('37-6 ⑥ 탐침 = 확정 — 팔이 앱을 재고 있는가', () => {
  it('startHit이 예고한 시작점이 draw가 확정한 획의 a와 같다', () => {
    const s = busy37()
    const rows = probe(s, inkBox(s), SEED + 1, 16)
    const c = confirmCommit(rows, SEED + 2)
    expect(c.checked).toBeGreaterThan(10)
    expect(c.same).toBe(c.checked)
    expect(c.worst).toBe(0)
  })
})
