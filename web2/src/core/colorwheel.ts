// 색상 휠(web2-48 48-7) — **팔레트의 기본은 색상 휠이다.**
//
// ⚠⚠ **정정 기록**(지시 48-7 「원장·DECISIONS에 정정을 남겨라 — 무엇을 누가 왜 좁혔는지까지」):
// web2-46 **지시문**이 「팔레트를 색 목록으로 만들지 마라, 재료 목록이어야 한다」고 못
// 박았고 46 세션이 그대로 지어 `core/palette.ts`가 **재료 다섯 × 톤 두셋 = 견본 14개**만
// 냈다. 그 좁힘은 **사용자와 상의 없이 지시문이 한 것**이고 판단도 틀렸다 —
// 전문 드로잉 툴이면 임의의 색을 뽑을 수 있어야 한다(48-7 문면). 그래서:
//
//     기본    색상 휠 — 프로크리에이트 · 모폴리오 방식   ← 이 파일
//     곁에    재료 프리셋 — 빠른 길. 유일한 길이 아니다  ← palette.ts MATERIALS 그대로
//
// **재료 프리셋은 안 지운다** — 좁힌 것이 틀렸다는 것이지 그 열넷이 쓸모없다는 게 아니다.
// 프리셋을 누르면 그 색이 **휠의 현재 색이 된다**(출처 하나 — #54: 칠은 늘 «지금 색»으로
// 나가고, 프리셋은 그 색을 정하는 여러 길 중 하나다).
//
// 색 공간 변환은 **직접 안 짠다**(지시 문면) — `culori`(4.0.2)를 쓴다. chroma.js가 아닌
// 이유는 ESM 우선이라 Vite 번들에서 쓰는 함수만 실린다는 것뿐이다(둘 다 지시가 허용).
//
// 이 모듈은 **DOM을 모른다** — 기하(점↔색)와 색 변환만 든다. 단위 팔이 WebGL·DOM 없이
// 잰다(`test/wheel48.test.ts` — brushmap.ts가 세운 그 규율 그대로).

import { converter, formatHex, parse } from 'culori'

const toHsv = converter('hsv')
const toRgb = converter('rgb')

export interface Hsv { h: number; s: number; v: number }

/** hex → HSV. 못 읽으면 null(파서가 거르지만 화면 입력은 무엇이든 올 수 있다). */
export function hsvOf(hex: string): Hsv | null {
  const c = parse(hex)
  if (!c) return null
  const h = toHsv(c)
  // culori는 무채색의 h를 NaN으로 낸다 — 휠의 각도가 필요하므로 0으로 접는다.
  return { h: Number.isFinite(h.h) ? (h.h as number) : 0, s: h.s, v: h.v }
}

/** HSV → `#rrggbb`. 항상 여섯 자리다(`palette.isHex6`의 형태 — 저장이 그것을 받는다). */
export function hexOfHsv(c: Hsv): string {
  const h = ((c.h % 360) + 360) % 360
  const out = formatHex(toRgb({ mode: 'hsv', h, s: clamp01(c.s), v: clamp01(c.v) }))
  return (out ?? '#000000').toLowerCase()
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

// ── 휠의 기하 — **고리(색상) + 안쪽 사각(채도·명도)** ─────────────────────────
// 프로크리에이트 「클래식」의 형태다(A-3: 선례를 따른다 — 새 조작을 발명하지 않는다).
// **슬라이더가 하나도 없다**(R1 · 48의 「하지 말 것」): 고리는 각도이고 사각은 2차원
// 자리다 — 둘 다 «실물에 없는 연속 손잡이»가 아니라 색 공간 그 자체의 그림이다.
//
//     r ∈ [rIn, rOut]  고리   각도 θ = 색상(위가 0°, 시계 방향)
//     안쪽 정사각형     가로 = 채도(0…1) · 세로 = 명도(1…0)
//
// 사각형은 고리 «안»에 내접한다 — 한 변이 `rIn · √2`다.

export interface WheelGeom {
  cx: number
  cy: number
  /** 고리 바깥 반지름 */
  rOut: number
  /** 고리 안쪽 반지름 */
  rIn: number
}

/** 안쪽 사각형(채도·명도 판) — 고리에 내접한다. */
export function svRect(g: WheelGeom): { x: number; y: number; w: number; h: number } {
  const side = g.rIn * Math.SQRT2
  return { x: g.cx - side / 2, y: g.cy - side / 2, w: side, h: side }
}

/** 화면 각도 → 색상(도). 위가 0°이고 시계 방향으로 는다(색상환의 관례). */
export const hueAt = (g: WheelGeom, x: number, y: number): number => {
  const a = Math.atan2(x - g.cx, g.cy - y) * 180 / Math.PI
  return (a % 360 + 360) % 360
}

/** 색상 → 고리 위 자리(고리 한가운데 반지름). 지금 색의 표식을 그 자리에 찍는다. */
export function huePoint(g: WheelGeom, hue: number): { x: number; y: number } {
  const r = (g.rIn + g.rOut) / 2
  const t = hue * Math.PI / 180
  return { x: g.cx + r * Math.sin(t), y: g.cy - r * Math.cos(t) }
}

/** 채도·명도 → 판 위 자리 */
export function svPoint(g: WheelGeom, c: Hsv): { x: number; y: number } {
  const r = svRect(g)
  return { x: r.x + clamp01(c.s) * r.w, y: r.y + (1 - clamp01(c.v)) * r.h }
}

/** 판 위 자리 → 채도·명도(판 밖은 가장자리로 자른다 — 끌다가 나가도 색이 안 튄다) */
export function svAt(g: WheelGeom, x: number, y: number): { s: number; v: number } {
  const r = svRect(g)
  return { s: clamp01((x - r.x) / r.w), v: clamp01(1 - (y - r.y) / r.h) }
}

/** 이 점이 휠의 **어느 부분**인가 — 잡기 판정의 단일 출처(#54: 그리기와 판정이 같은 자). */
export type WheelPart = 'ring' | 'sv' | null
export function partAt(g: WheelGeom, x: number, y: number): WheelPart {
  const dx = x - g.cx, dy = y - g.cy
  const d = Math.hypot(dx, dy)
  if (d >= g.rIn && d <= g.rOut) return 'ring'
  const r = svRect(g)
  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'sv'
  return null
}

/** 표식(지금 색)의 대비색 — 밝은 색 위에는 검정 테, 어두운 색 위에는 흰 테.
 *  광도는 `brushmap.lumaOf`와 **같은 계수**여야 한다(#54)지만 그 파일은 앱 층이라
 *  여기서 못 들여온다(순환) — 계수를 같은 값으로 적고 팔이 둘의 일치를 잰다. */
export const markerInk = (hex: string): '#000000' | '#ffffff' => {
  const c = toRgb(parse(hex) ?? '#000000') ?? { r: 0, g: 0, b: 0 }
  const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return L > 0.55 ? '#000000' : '#ffffff'
}
