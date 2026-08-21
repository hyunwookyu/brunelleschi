// 재료 — 펜 하나에 경도 슬라이더: 2H·H·F·HB·B·2B·잉크.
// 보조선·결과선 같은 분류가 없다. 재료만 있다.
// 흑연은 종이 결에 입자가 걸리고 필압에 반응한다. 잉크는 균일하고 선명하다.

import type { Grade, Stroke } from './types'

export const GRADES: Grade[] = ['2H', 'H', 'F', 'HB', 'B', '2B', 'INK']

export interface MatParams {
  color: string
  colorNum: number
  /** 기본 굵기 px (화면 고정) */
  width: number
  /** 불투명도 — 흑연은 경도가 무를수록 진하다 */
  alpha: number
  /** 입자 밀도 (0 = 잉크처럼 균일) */
  grain: number
  /** 내보내기 레이어 색 (r,g,b 0..1) */
  rgb: [number, number, number]
}

/** 경도표 — 어두움·굵기·입자가 2H→2B로 단조 증가, 잉크는 균일·선명 */
export const MAT: Record<Grade, MatParams> = {
  '2H': { color: '#9c9c9c', colorNum: 0x9c9c9c, width: 1.1, alpha: 0.50, grain: 0.35, rgb: [0.61, 0.61, 0.61] },
  'H':  { color: '#868686', colorNum: 0x868686, width: 1.2, alpha: 0.60, grain: 0.40, rgb: [0.53, 0.53, 0.53] },
  'F':  { color: '#707070', colorNum: 0x707070, width: 1.3, alpha: 0.68, grain: 0.45, rgb: [0.44, 0.44, 0.44] },
  'HB': { color: '#5a5a5a', colorNum: 0x5a5a5a, width: 1.4, alpha: 0.75, grain: 0.50, rgb: [0.35, 0.35, 0.35] },
  'B':  { color: '#454545', colorNum: 0x454545, width: 1.6, alpha: 0.85, grain: 0.60, rgb: [0.27, 0.27, 0.27] },
  '2B': { color: '#303030', colorNum: 0x303030, width: 1.8, alpha: 0.92, grain: 0.70, rgb: [0.19, 0.19, 0.19] },
  'INK': { color: '#101014', colorNum: 0x101014, width: 1.5, alpha: 1.0, grain: 0, rgb: [0.06, 0.06, 0.08] },
}

/** 연필 심 — 펜(잉크)을 뺀 경도만. 홀더펜 창에 도는 것이 이 목록이다(4-e). */
export const PENCIL_GRADES: Grade[] = ['2H', 'H', 'F', 'HB', 'B', '2B']

export const gradeOf = (s: Stroke): Grade => s.mat?.grade ?? 'HB'

/** 그 획의 굵기 px — 제도펜은 니브가 정하고, 연필은 경도가 정한다.
 *  **출처는 여기 하나다** — 2D 오버레이와 three.js가 같은 값을 써야 한다. */
export const widthOf = (s: Stroke): number => s.mat?.w ?? MAT[gradeOf(s)].width
export const isInk = (s: Stroke): boolean => gradeOf(s) === 'INK'

/** 재현 가능한 입자용 — 시드 고정 LCG (Math.random 금지 규약) */
export function rng32(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
