// brush 매핑의 순수 함수들(web2-11 2-c) — p5.brush를 import하지 않는다:
// 단위 테스트(node)가 WebGL 없이 이 표와 계산을 재기 위해서다(2차 리뷰어 [17]).
// 렌더 호출은 brushlayer.ts가 한다.

import { MAT, gradeOf, widthOf } from '../core/material'
import type { Grade, Stroke } from '../core/types'
import { C } from '../core/constants'

// ── 매핑(2-c) — GRADES → 내장 브러시 ─────────────────────────────────────
// 2H·HB·2B·rotring(INK)은 이름 그대로다. **H·F·B는 내장에 없다** — brush.add로 새 질감을
// 짓는 대신 **이웃 경도의 질감**을 쓴다: 내장 파라미터가 라이브러리 내부값이라 보간은
// 근거 없는 수를 짓게 된다(A-3: 단순한 쪽·D-3: 반증 못 하는 수를 안 만든다).
// 경도의 **단조성은 MAT가 진다** — 질감 급은 셋(경질 2H·중질 HB·연질 2B)이고
// 진하기(alphaColor의 광도 — 아래)·굵기(widthOf)가 사이를 잇는다. 인접 급이 실제로
// 갈리는지는 팔이 잰다(단위: 광도 단조 · e2e: 렌더 어두움 단조 — AS-C34).
export const BRUSH_OF: Record<Grade, string> = {
  '2H': '2H', 'H': '2H', 'F': 'HB', 'HB': 'HB', 'B': '2B', '2B': '2B', 'INK': 'rotring',
}

// MAT.alpha는 캔버스 globalAlpha였다 — brush에는 그 자리가 없어 **종이색으로 섞는다**
// (흰 종이 위 알파 a의 회색 == (1-a)만큼 종이 쪽으로 간 회색 — 결정적 근사).
// ⚠ 한계 둘(AS-C35): 획끼리 겹쳐도 진짜 알파처럼 안 진해진다 · 뒤(3D 층)가 비치는 몫은
// 브러시 자신의 불투명도가 진다(e2e가 «2H 획 픽셀의 알파 < 255»를 잰다).
const PAPER = { r: 0xf5, g: 0xf3, b: 0xee }
export function alphaColor(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number, p: number) => Math.round(c * a + p * (1 - a))
  const r = mix((n >> 16) & 255, PAPER.r), g = mix((n >> 8) & 255, PAPER.g), b = mix(n & 255, PAPER.b)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 화면색의 광도(0..255) — 경도 단조 팔이 잰다(작을수록 진하다) */
export function lumaOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}

/** 브러시에 넘기는 굵기 — 출처는 widthOf(→widthOfMat) 하나(#54). brush의 weight는 그
 *  브러시 기본 굵기의 배수라 px가 아니다 — 배수 == px로 두고 두께 실측은 e2e가 한다.
 *  여기서 상수를 곱하지 않는다(굵기 손잡이가 둘이 된다). */
export const weightOf = (s: Stroke): number => widthOf(s)

/** 이 획을 그릴 색 — MAT 색 + MAT 알파의 종이 혼합. 색 규칙 정본(render2d COL 머리주석)이
 *  이 함수를 «brush 모드의 획 색 자리»로 가리킨다(#65 — 정본에서 안 갈라지게 한 줄로). */
export const strokeColor = (g: Grade): string => alphaColor(MAT[g].color, MAT[g].alpha)

/** 필압 → brush pressure 계수 — grain()의 (0.5 + p)와 같은 대역(0.5..1.5).
 *  rawIn(점별)이 있으면 점별로, 없으면 mat.press(획 평균 — 옛 파일·마우스)로 균일하게.
 *  INK(제도펜)는 구성상 균일선이라 필압을 안 싣는다(로트링의 성질 그대로). */
export const PRESS_N = 12 // 한 획에 싣는 최대 표본 수 — 직선 세그먼트 위 분포라 그 이상은 안 갈린다(#12 동작점)
export function pressureProfile(s: Stroke): number[] | null {
  if (gradeOf(s) === 'INK') return null
  const pr = s.rawIn?.press
  if (!pr || pr.length < 2) {
    const p = s.mat?.press
    return p === undefined ? null : [0.5 + p, 0.5 + p]
  }
  const n = Math.min(PRESS_N, pr.length)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = (i * (pr.length - 1)) / (n - 1)
    const j = Math.floor(t), f = t - j
    const v = pr[j]! * (1 - f) + (pr[Math.min(j + 1, pr.length - 1)]! * f)
    out.push(0.5 + v / C.PRESS_Q)
  }
  return out
}
