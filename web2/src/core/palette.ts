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

// web2-52: 다섯(46) → **여덟** — 무늬 여섯(matrep.RepId)과 단색 둘의 합집합.
// 「palette 다섯 ↔ 재료 여섯의 집합 차」(D-W19 [2])를 52-2가 이렇게 정했다:
// 재료는 **한 집합**이고 이 표가 톤·해칭 스펙의 정본이다(도면 해칭·칠 견본·면 무늬가 공유).
export type MatId = 'brick' | 'stone' | 'conc' | 'glass' | 'wood' | 'metal' | 'tile' | 'roof'
/** web2-51: 연필(pencil)이 넷째 도구로 늘었다 — 종이 결에 걸린 불연속(색은 hex — cp처럼). */
export type Instr = 'brush' | 'marker' | 'cp' | 'pencil'

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
  // web2-52 — 셋을 더해 여덟: 석재(따뜻한 회갈)·타일(차가운 자기)·기와(점토).
  // 톤 셋(밝음·중간·그림자)은 기존 다섯의 명도 사다리와 같은 간격 문법이다.
  { id: 'stone', name: '석재', tones: ['#cdc8bb', '#a49f92', '#767165'], hatch: { angleDeg: 30, spacingPx: 11 } },
  { id: 'tile', name: '타일', tones: ['#d8dee0', '#aeb9bd', '#7f8a8f'], hatch: { angleDeg: 90, spacingPx: 9, cross: true } },
  { id: 'roof', name: '기와', tones: ['#c69086', '#9c6a60', '#6e463f'], hatch: { angleDeg: 15, spacingPx: 8 } },
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

// ⛔⛔ **`suggestTone`(「톤 자동」)은 web2-48 48-8이 없앴다.** 46의 「분류가 기본 톤을
// 제안한다」는 **지시문이 넣은 것이고 사용자가 원하지 않았다**(48-8 문면: 「제안을
// 없애라. 맞을 것을 요구하는 기능이 하나 준다」). 자동 명암·톤 제안은 이 앱의 «하지 말
// 것»에 들어갔다. 되살리려면 그 판단부터 다시 물어야 하므로 함수를 남기지 않는다 —
// 남겨 두면 다음 회차가 «있으니 쓴다»로 되살린다(#65의 형태).

/** 이 면의 해칭 규격 — 재료가 있으면 재료의 무늬, 없으면 45의 기본(무회귀). */
export const hatchSpecOf = (face: Pick<Face, 'mat'>): HatchSpec =>
  isMatId(face.mat) ? materialOf(face.mat).hatch : { angleDeg: C.HATCH_ANGLE_DEG, spacingPx: C.HATCH_SPACING_PX }

/** **단색 채움의 색**(web2-48 48-3) — 재료가 있으면 그 **중간 톤**(해칭이 마지막 톤 =
 *  그림자를 쓰는 것과 짝이다: 선은 어두워야 읽히고 면은 몸통 색이어야 한다), 없으면
 *  종이보다 한 단계 어두운 무채색이다. 무채색을 쓰는 이유는 45의 기본 해칭이 무채색인
 *  것과 같다 — **채움에는 기본 재료가 없다**(면은 사람이 지정하는 것이므로).
 *  ⚠ 갈래로 남긴 것: 「면마다 임의의 색」은 여기 없다 — 48-7이 연 임의 색은 **칠**의
 *  것이고 면의 색은 `Face.mat` 하나가 정한다. 면에 색을 직접 주는 것은 49(재료 표현)의
 *  물음이라 여기서 새 저장 축을 안 만든다(범위를 안 넓힌다). */
export const SOLID_DEFAULT_HEX = '#ded9d1'
export const solidHexOf = (face: Pick<Face, 'mat'>): string => {
  if (!isMatId(face.mat)) return SOLID_DEFAULT_HEX
  const m = materialOf(face.mat)
  return m.tones[Math.min(1, m.tones.length - 1)]!
}

/** 이 면의 해칭 «선 색» — 재료가 있으면 그림자 톤(마지막 — 선은 종이보다 어두워야 읽힌다),
 *  없으면 45의 회갈색 그대로(무회귀 — render3d의 종전 값이 이리로 옮겨 온 것뿐이다 #54). */
export const HATCH_DEFAULT_HEX = '#8d8880'
export const hatchHexOf = (face: Pick<Face, 'mat'>): string => {
  if (!isMatId(face.mat)) return HATCH_DEFAULT_HEX
  const m = materialOf(face.mat)
  return m.tones[m.tones.length - 1]!
}

/** 칠 획의 색 — 재료 칠(마커·색연필)이면 그 hex, 아니면 null(45의 흑연 경로가 그린다).
 *  ⚠ web2-48 48-7: **출처가 `paint.c` 하나다**(#54). 46은 재료 프리셋의 (m,t) 쌍을
 *  실었는데 그러면 「임의의 색」을 담을 자리가 없다 — 옛 파일의 (m,t)는 파서가 열 때
 *  hex로 옮겨 받고(`core/file.ts`), 여기서는 hex만 읽는다. */
export const paintHexOf = (s: Pick<Stroke, 'paint'>): string | null => {
  const p = s.paint
  if (!p || p.i === undefined) return null
  return isHex6(p.c) ? p.c! : null
}

/** `#rrggbb` 여섯 자리 — 저장·파서·팔이 같은 술어를 쓴다(#54). 세 자리 축약은 안 받는다:
 *  쓰는 쪽이 늘 여섯 자리를 내므로 받아들일 형태를 늘리면 왕복 동일성만 흔들린다. */
export const isHex6 = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v)

/** 재료 순환(griptray 「재료」 행) — 없음→벽돌→…→금속→없음. cls 순환과 같은 문법. */
export const cycleMat = (cur: MatId | undefined): MatId | undefined => {
  if (cur === undefined) return MAT_IDS[0]
  const i = MAT_IDS.indexOf(cur)
  return i + 1 < MAT_IDS.length ? MAT_IDS[i + 1] : undefined
}
