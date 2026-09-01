// 재료 팔레트(web2-46) — **색 목록이 아니라 재료 목록이다**(지시 「지킬 것」).
// 재료 하나 = 톤 두셋(밝음·중간·그림자) + 해칭 무늬. 건축가는 색이 아니라 재료를 고르고
// 그 안에서 면의 방향에 따라 톤을 고른다 — 그 순서를 자료구조가 그대로 든다.
//
// ⚠ 이 표의 값(색·각도·간격)은 **표시 문법**이다 — 어느 하네스도 임계로 안 읽으므로
// test/constants.ts 대상이 아니다(D-C4의 예외 — CHANNEL_UI의 선례). 다만 **무늬의 상호
// 판별**(다섯 재료의 (각도·간격·교차)가 전부 다르다)은 값의 성질이라 단위 팔이 잰다.
// 색이 «쓸 만한가»는 눈으로만 갈린다 — 실기기 확인 항목(46의 ⚑ — 멈추지 않는다).
//
// 무늬의 근거: 제도 단면 표시 규약을 평행선 근사로 옮겼다(곡선·점 무늬는 해칭 생성기가
// 평행선 + 직교 교차뿐이라 못 낸다 — 그 한계 안에서 다섯이 갈리게 골랐다):
// 벽돌 45° 빗금(관례 그대로) · 콘크리트 45° 교차(점 무늬의 평행선 근사 — 밀도로 갈린다) ·
// 유리 75° 성긴 사선(수직에 가까운 긴 사선 관례) · 나무 0° 결(나뭇결의 직선 근사) ·
// 금속 135° 좁은 간격(강재의 좁은 빗금 관례 · 벽돌과 방향으로 갈린다).

import type { Face, Stroke } from './types'
import { C } from './constants'

export type MatId = 'brick' | 'conc' | 'glass' | 'wood' | 'metal'
export type Instr = 'brush' | 'marker' | 'cp'

export interface HatchSpec {
  angleDeg: number
  spacingPx: number
  /** 직교 교차 한 벌 더(각도+90°) — 콘크리트의 점 무늬 근사 */
  cross?: boolean
}

export interface Material {
  id: MatId
  name: string
  /** 톤 — 앞이 밝음, 뒤가 그림자. 둘 또는 셋(유리는 둘 — 재질이 톤을 정한다). */
  tones: string[]
  hatch: HatchSpec
}

/** 재료 목록 — 차례가 UI 차례다(griptray 재료 순환도 이 차례). */
export const MATERIALS: Material[] = [
  { id: 'brick', name: '벽돌', tones: ['#d9a08a', '#c07a5b', '#8f5340'], hatch: { angleDeg: 45, spacingPx: 8 } },
  { id: 'conc', name: '콘크리트', tones: ['#cfcac2', '#a8a29a', '#7d776f'], hatch: { angleDeg: 45, spacingPx: 14, cross: true } },
  { id: 'glass', name: '유리', tones: ['#bcd6d8', '#8fb8bd'], hatch: { angleDeg: 75, spacingPx: 18 } },
  { id: 'wood', name: '나무', tones: ['#d8b98c', '#b98f5e', '#8a6238'], hatch: { angleDeg: 0, spacingPx: 7 } },
  { id: 'metal', name: '금속', tones: ['#c2c7cc', '#959ca4', '#666d75'], hatch: { angleDeg: 135, spacingPx: 5 } },
]

export const MAT_IDS: MatId[] = MATERIALS.map(m => m.id)
export const isMatId = (v: unknown): v is MatId => typeof v === 'string' && (MAT_IDS as string[]).includes(v)
export const materialOf = (id: MatId): Material => MATERIALS.find(m => m.id === id)!

/** 톤 이름 — 차례 고정(밝음·중간·그림자). 두 톤 재료는 앞 둘만 쓴다. */
export const TONE_NAMES = ['밝음', '중간', '그림자'] as const

/** 톤 인덱스를 그 재료의 대역으로 자른다 — 두 톤 재료에 «그림자»를 물으면 마지막 톤. */
export const clampTone = (m: Material, t: number): number =>
  Math.max(0, Math.min(m.tones.length - 1, Math.round(t)))

export const toneHex = (id: MatId, t: number): string => {
  const m = materialOf(id)
  return m.tones[clampTone(m, t)]!
}

/** **분류 → 톤 제안**(지시: 45의 분류가 기본 톤을 제안하는 근거 — **제안이지 기본값이
 *  아니다**). 근거는 위에서 오는 빛의 코사인 차례다(구성적 근거 — 측정이 아니다. #5):
 *  수평(슬라브)이 가장 받고, 경사가 다음, 수직(벽)이 가장 적다 → 밝음·중간·그림자.
 *  적용 시점은 **사람이 칠하는 순간, 톤 선택이 «자동»일 때뿐**이다 — 면에 자동으로
 *  칠해지는 일이 없고, 사람이 톤을 손으로 고르면 그 선택이 그대로 남는다(46 측정 항목). */
export const suggestTone = (cls: 'slab' | 'wall' | 'slope'): number =>
  cls === 'slab' ? 0 : cls === 'slope' ? 1 : 2

/** 이 면의 해칭 규격 — 재료가 있으면 재료의 무늬, 없으면 45의 기본(무회귀). */
export const hatchSpecOf = (face: Pick<Face, 'mat'>): HatchSpec =>
  isMatId(face.mat) ? materialOf(face.mat).hatch : { angleDeg: C.HATCH_ANGLE_DEG, spacingPx: C.HATCH_SPACING_PX }

/** 이 면의 해칭 «선 색» — 재료가 있으면 그림자 톤(마지막 — 선은 종이보다 어두워야 읽힌다),
 *  없으면 45의 회갈색 그대로(무회귀 — render3d의 종전 값이 이리로 옮겨 온 것뿐이다 #54). */
export const HATCH_DEFAULT_HEX = '#8d8880'
export const hatchHexOf = (face: Pick<Face, 'mat'>): string => {
  if (!isMatId(face.mat)) return HATCH_DEFAULT_HEX
  const m = materialOf(face.mat)
  return m.tones[m.tones.length - 1]!
}

/** 칠 획의 색 — 재료 칠(마커·색연필)이면 그 톤, 아니면 null(45의 흑연 경로가 그린다). */
export const paintHexOf = (s: Pick<Stroke, 'paint'>): string | null => {
  const p = s.paint
  if (!p || p.m === undefined || p.t === undefined || p.i === undefined) return null
  if (!isMatId(p.m)) return null
  return toneHex(p.m, p.t)
}

/** 재료 순환(griptray 「재료」 행) — 없음→벽돌→…→금속→없음. cls 순환과 같은 문법. */
export const cycleMat = (cur: MatId | undefined): MatId | undefined => {
  if (cur === undefined) return MAT_IDS[0]
  const i = MAT_IDS.indexOf(cur)
  return i + 1 < MAT_IDS.length ? MAT_IDS[i + 1] : undefined
}
