// web2-41 픽스처 — **애매함이 실재하는 장면과 실재하지 않는 장면을 나란히 세운다.**
//
// ⚠⚠ **왜 붐비는 장면이 «둘»인가**(D-5 · #71 · 이 라운드의 가장 값진 실측):
// 지시문은 「37 회차의 그 픽스처」를 게이트로 지목했는데, 그 픽스처의 세로 여덟은
// **밑이 전부 같은 vp1 지면선 위**라 3D에서 한 평면에 있다. 그러면 그 평면과 획의
// 시선면이 만나는 선이 하나뿐이고, **후보를 아무거나 골라도 같은 3D 선이 나온다**
// (실측 벌어짐 0.0004~0.0088 · 배치 오차 ≤ 0.0062 — 전부 장면 bbox 대각 대비).
// 즉 37이 잰 「오획득 13/16」은 **이름표가 틀린 것이지 배치가 틀린 것이 아니었다** —
// 37의 `depth_spread_relative` 0.58은 교차 «점»들이 **한 선 위에서 얼마나 떨어져
// 있는가»였고 「후보 선들이 서로 얼마나 떨어지는가」가 아니다(D-4: 사람이 준 근거는
// 확인 대상이다). 그래서 **깊이가 실제로 갈리는 판을 따로 짓는다** — 거기가
// 「조용히 틀린 배치」가 실재하는 자리이고, 이 라운드의 반증을 그 판이 진다.
//
// 세 장면과 그 역할:
//   `sparse()`      성긴 발판 7획      — 무회귀 게이트(37이 얻은 것을 잃지 않는다)
//   `crowdedFlat()` 37의 그 픽스처     — 지시문이 지목한 장면. 애매함이 «없다»는 것이 실측
//   `crowdedDeep()` 깊이가 갈리는 판   — 애매함이 실재한다. 반증이 여기서 빨개진다

import { builder, type DocBuilder } from './fixtures'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import type { Stroke } from '../src/core/types'
import type { Pt } from '../src/core/vec'

export const VP0: Pt = { x: 900, y: 400 }
export const VP1: Pt = { x: 100, y: 400 }

/** P에서 소실점 쪽으로 `L`px — 「축이 걸린 방향」을 좌표로 안 적고 **유도**한다(#88) */
export function toward(P: Pt, vp: Pt, L: number): Pt {
  const d = { x: vp.x - P.x, y: vp.y - P.y }
  const n = Math.hypot(d.x, d.y)
  return { x: P.x + d.x / n * L, y: P.y + d.y / n * L }
}
export const away = (P: Pt, vp: Pt, L: number): Pt => toward(P, vp, -L)

const rot = (p: Pt, o: Pt, th: number): Pt => ({
  x: o.x + (p.x - o.x) * Math.cos(th) - (p.y - o.y) * Math.sin(th),
  y: o.y + (p.x - o.x) * Math.sin(th) + (p.y - o.y) * Math.cos(th),
})

/** raw 점열 — 그은 선을 `n`등분. 프리핸드 보존은 미뤄져 있으므로 직선이다(계획서 §1.1). */
export function rawOf(a: Pt, z: Pt, n = 17): Pt[] {
  return Array.from({ length: n }, (_, k) => {
    const t = k / (n - 1)
    return { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t }
  })
}

// ── ① 성긴 발판 ─────────────────────────────────────────────────────────────
/** `xint37.test.ts`의 발판 그대로 — 세로 넷 + 지평선 + 깊이선 둘 = 7획.
 *  ⚠ 좌표를 **베껴 적었다**: 그 파일의 지역 함수라 못 가져온다. 두 파일이 갈리면
 *  무회귀 게이트가 다른 장면을 재게 되므로, 아래 `SPARSE_VERT_X`가 그 사실을 든다. */
export const SPARSE_VERT_X = [500, 700, 860, 1050]
export function sparse(): DocBuilder {
  const b = builder()
  b.add(100, 400, 1100, 400)      // 지평선
  b.add(500, 500, 600, 475)       // 깊이1 → vp0
  b.add(500, 500, 400, 475)       // 깊이2 → vp1
  b.add(500, 500, 500, 200)
  b.add(700, 550, 700, 250)
  b.add(860, 590, 860, 200)
  b.add(1050, 637.5, 1050, 150)
  return b
}

export interface Trial { s: Stroke; target: Pt }

// ── ② 37이 쓴 붐비는 장면 ───────────────────────────────────────────────────
/** 세로 여덟(밑이 **한** vp1 지면선 위) + vp1 가로 여덟 + 시험 획 24 = 43획.
 *  시험 획은 의도한 교차 T를 **정확히 지나고** 축에서 손만큼(≤1.7°) 돌아 있다. */
/** ⚠ `angleMax`(rad)는 **손의 각오차 대역**이다. 기본 0.03은 37이 쓴 값
 *  (`VP_DIR_RATIO` 0.06 = 3.4°의 절반). 1차 리뷰어 [2]가 「이 대역을 키우면 이 픽스처도
 *  애매해지는가」를 물어 **인자로 뺐다** — 그 답이 「무해하다」의 조건을 정한다. */
export function crowdedFlat(angleMax = 0.03): { b: DocBuilder; trials: Trial[]; scaffoldN: number } {
  const b = builder()
  b.add(100, 400, 1100, 400)
  b.add(500, 500, 600, 475)
  b.add(500, 500, 400, 475)
  const xs = [500, 560, 620, 680, 740, 800, 920, 980]
  for (const x of xs) b.add(x, 500 + 0.25 * (x - 500), x, 180)
  for (const y of [230, 260, 290, 320, 350, 380, 410, 440]) {
    const P: Pt = { x: 500, y }
    const q = away(P, VP1, 430)
    b.add(P.x, P.y, q.x, q.y)
  }
  const scaffoldN = b.doc.strokes.length
  const rnd = rng32(20260831)
  const trials: Trial[] = []
  for (let i = 0; i < 24; i++) {
    const T: Pt = { x: xs[2 + (i % 5)]!, y: 250 + (i % 6) * 22 + Math.floor(i / 6) * 5 }
    const th = (rnd() - 0.5) * 2 * angleMax
    const a = rot(away(T, VP1, -150), T, th), z = rot(away(T, VP1, 210), T, th)
    const s = b.add(a.x, a.y, z.x, z.y)
    s.raw = rawOf(a, z)
    trials.push({ s, target: T })
  }
  return { b, trials, scaffoldN }
}

// ── ③ 깊이가 실제로 갈리는 붐비는 장면 ──────────────────────────────────────
/** 지면선 **셋**을 서로 다른 깊이에 깔고 세로 여섯을 그 셋에 나눠 세운다 —
 *  그래서 세로선들이 **한 평면에 안 있다**. 그 위를 vp1 방향 획이 지나면 후보 3D 선이
 *  실제로 갈린다(실측 벌어짐 0.28~0.58). ②와 다른 것은 **발판의 깊이 분포 하나**다. */
export const DEEP_GL = [520, 620, 740]     // (300, y0) 에서 vp0 쪽으로 가는 지면선 셋
export const DEEP_VERT_X = [500, 560, 620, 680, 740, 800]
/** 지면선 (300,y0)–vp0 위, 화면 x 에서의 y */
export const onGL = (y0: number, x: number): number =>
  y0 + (VP0.y - y0) * (x - 300) / (VP0.x - 300)

export function crowdedDeep(): { b: DocBuilder; trials: Trial[]; scaffoldN: number } {
  const b = builder()
  b.add(100, 400, 1100, 400)                                   // 지평선
  for (const y0 of DEEP_GL) b.add(300, y0, 860, onGL(y0, 860)) // 지면선 셋 = 깊이 셋
  b.add(300, 520, 300, 620)                                    // 세로 하나(높이의 씨앗)
  for (let i = 0; i < DEEP_VERT_X.length; i++) {
    const x = DEEP_VERT_X[i]!, y0 = DEEP_GL[i % DEEP_GL.length]!
    b.add(x, onGL(y0, x), x, 180)
  }
  const scaffoldN = b.doc.strokes.length
  const rnd = rng32(20260831)
  const trials: Trial[] = []
  for (let i = 0; i < 24; i++) {
    const T: Pt = { x: DEEP_VERT_X[1 + (i % 4)]!, y: 250 + (i % 6) * 18 + Math.floor(i / 6) * 4 }
    const th = (rnd() - 0.5) * 2 * 0.03
    const a = rot(away(T, VP1, -160), T, th), z = rot(away(T, VP1, 220), T, th)
    const s = b.add(a.x, a.y, z.x, z.y)
    s.raw = rawOf(a, z)
    trials.push({ s, target: T })
  }
  return { b, trials, scaffoldN }
}

// ── 필압 결 ─────────────────────────────────────────────────────────────────
// ⚠ **양자화 정수로 싣는다**(`types.ts` RawInput — press 0..PRESS_Q). 앱이 저장하는
//    그 형태로 재야 「저장된 것을 읽는다」가 참이다.
const q = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * C.PRESS_Q)

/** 결의 이름 = 사람이 한 일. 「눌렀나 안 눌렀나」가 이름에 들어 있다. */
export type PressShape = 'flat' | 'naturalArc' | 'lightEven' | 'pressAt'

/** 한 획의 필압 결. `at` 은 «누른» raw 색인(`pressAt`에서만 쓴다).
 *  떨림 ±20%는 결정론 난수(`rng32`)다 — `Math.random` ⛔(§5 재현성). */
export function pressProfile(shape: PressShape, n: number, seed: number, at = -1): number[] {
  const g = rng32(seed)
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    let v: number
    if (shape === 'flat') v = 0.5
    else if (shape === 'naturalArc') v = 0.55 * Math.sin(Math.PI * t) + 0.08
    else if (shape === 'lightEven') v = 0.26 + 0.06 * Math.sin(Math.PI * t)
    else v = 0.26 + 0.06 * Math.sin(Math.PI * t) + 0.62 * Math.exp(-((i - at) ** 2) / (2 * 1.2 ** 2))
    const jit = shape === 'flat' ? 1 : 1 + (g() - 0.5) * 0.4
    return q(v * jit)
  })
}

/** 두 화면점의 **중간**에 가장 가까운 raw 색인 — 「누름이 두 교차 사이에 있을 때」의 반증(1차 [14]) */
export function midRawIndex(s: Stroke, P: Pt, Q: Pt): number {
  return nearestRawIndex(s, { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 })
}

/** 획의 raw 중 화면점 `P`에 가장 가까운 색인 — 「거기서 눌렀다」의 자리를 **유도**한다(#88) */
export function nearestRawIndex(s: Stroke, P: Pt): number {
  const raw = s.raw!
  let at = 0, d = Infinity
  for (let i = 0; i < raw.length; i++) {
    const e = Math.hypot(raw[i]!.x - P.x, raw[i]!.y - P.y)
    if (e < d) { d = e; at = i }
  }
  return at
}
