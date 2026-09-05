// 자국 견본 도형 셋(web2-61) — **직선 · 물결 · 자기교차**. 게이트(grain61)와 사진
// (shots — 61 지시 「브러시 넷 × 획 셋 PNG」)이 같은 도형을 쓴다(#54 — 자와 사진이
// 같은 입력을 본다). 결정론: 난수 없음 — 매 호출 같은 점렬·같은 압력.
//
// 압력은 저장 눈금(0..PRESS_Q — stampsOf가 PRESS_Q로 나눈다)이다. 직선은 상수 0.5
// (주기 측정의 자 — 압력 변화가 농도 주기에 섞이면 안 된다), 물결은 실험실 견본
// (tunelab sampleStroke)의 그 프로필(0.2→1→0.4), 자기교차는 상수 0.6.

import { C } from './constants'
import type { Pt } from './vec'

export type MarkShape = 'line' | 'wave' | 'cross' | 'hill'

export interface MarkSample { pts: Pt[]; press: number[] }

/** 조밀한 꼭짓점 열을 호 길이 등간격 n+1점으로 재표집(도형이 굵기와 무관하게 같은 밀도) */
function resample(raw: Pt[], n: number): Pt[] {
  const segLen: number[] = []
  let L = 0
  for (let i = 0; i + 1 < raw.length; i++) {
    const d = Math.hypot(raw[i + 1]!.x - raw[i]!.x, raw[i + 1]!.y - raw[i]!.y)
    segLen.push(d); L += d
  }
  const out: Pt[] = []
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * L
    let acc = 0, i = 0
    while (i < segLen.length && acc + segLen[i]! < target) { acc += segLen[i]!; i++ }
    const ii = Math.min(i, segLen.length - 1)
    const t = segLen[ii]! > 1e-9 ? (target - acc) / segLen[ii]! : 0
    const a = raw[ii]!, b = raw[Math.min(ii + 1, raw.length - 1)]!
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/** 도형 하나 — 판 크기(w × h) 안에 여백 40px을 두고 앉는다. */
export function markShape(shape: MarkShape, w: number, h: number): MarkSample {
  const n = 80
  if (shape === 'line') {
    const pts: Pt[] = []
    for (let k = 0; k <= n; k++) pts.push({ x: 40 + (w - 80) * (k / n), y: h / 2 })
    return { pts, press: pts.map(() => 0.5 * C.PRESS_Q) }
  }
  // web2-68 §2 — 경도 축의 자: 직선 위 압력 0.3 → 0.7 → 0.3(지시 문면 · 삼각 프로필 — 난수 없음)
  if (shape === 'hill') {
    const pts: Pt[] = []
    const press: number[] = []
    for (let k = 0; k <= n; k++) {
      const t = k / n
      pts.push({ x: 40 + (w - 80) * t, y: h / 2 })
      press.push((0.3 + 0.4 * (1 - Math.abs(2 * t - 1))) * C.PRESS_Q)
    }
    return { pts, press }
  }
  if (shape === 'wave') {
    const pts: Pt[] = []
    const press: number[] = []
    const amp = Math.min(40, h * 0.22)
    for (let k = 0; k <= n; k++) {
      const t = k / n
      pts.push({ x: 40 + (w - 80) * t, y: h / 2 + Math.sin(t * Math.PI * 1.6) * amp })
      const p = t < 0.5 ? 0.2 + 1.6 * t : 1 - 1.2 * (t - 0.5)
      press.push(Math.max(0.1, Math.min(1, p)) * C.PRESS_Q)
    }
    return { pts, press }
  }
  // 자기교차 — 넉 점 폴리라인: 첫 변을 셋째 변이 가로지른다(교차점 하나 · 결정론)
  const raw: Pt[] = [
    { x: 50, y: h - 50 }, { x: w - 60, y: 55 },
    { x: w * 0.52, y: 42 }, { x: w * 0.42, y: h - 40 },
  ]
  const pts = resample(raw, n)
  return { pts, press: pts.map(() => 0.6 * C.PRESS_Q) }
}
