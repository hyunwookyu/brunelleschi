// 종이 결(면 고정) — web2-61의 p5paint 결 타일을 엔진 밖으로 옮긴 것(web2-62) · **web2-63: 값을 CC0 높이맵으로**.
// 계약(D-W27 ⛔ · 59-3): 결은 브러시(시드=획)가 아니라 **종이(대상 px 격자 · 시드 고정)**의
// 것이다 — 두 획이 같은 자리를 지나면 같은 이빨. 칸은 대상 px 기준 고정이라 굵기와 무관하다(grain61 ④).
// 엔진의 «곱하는 자리»(surface.drawDab — 1 − 깊이 × 타일)는 62 그대로이고 이 파일은 타일의 «값»만 낸다.
//
// 값은 0..1(이빨의 깊이 몫)이고 엔진이 깊이(GRAIN_DEPTH × paperK)를 곱해 도장 알파와 덮임
// 캡을 깎는다: 1 − 깊이 × 타일. 61의 destination-out(alpha × (1 − depth·tile))과 같은 셈이다.
//
// 63의 두 타일:
//   · **높이맵**(ambientCG Paper001 변위 1024² · tips-gen이 1·99 백분위로 펴고 뒤집었다 — 골 = 1) — 제품.
//     부팅에서 tips.ts가 풀어 setPaperHeightTile로 꽂는다(그 전에는 아래 61 타일 — 상태는 값으로 보인다).
//   · **61 값 잡음**(4px 칸 스무드스텝 · 시드 61 · 256²) — 63 ⑤(62와 픽셀 같음)의 대조 판 · 로드 전 폴백.

import { rng32 } from '../core/material'

export const GRAIN_TILE = 256            // 61 타일 변(값 잡음)
export const GRAIN_CELL = 4              // 61 그대로(256을 나눠떨어지게 — 3은 격자 색인이 깨졌다)
export const GRAIN_DEPTH = 0.42          // 61의 기본 깊이(paperK 1) 그대로

let tile61: Float32Array | null = null
let height: { data: Float32Array; n: number } | null = null
let paper61Override = false

/** 61 결 타일(0..1 · 256²) — 고정 시드 61: 실행·획·시드 무관한 «같은 종이». */
export function grainTile61(): Float32Array {
  if (tile61) return tile61
  const n = GRAIN_TILE / GRAIN_CELL
  const rng = rng32(61)
  const cell = new Float32Array(n * n)
  for (let i = 0; i < cell.length; i++) cell[i] = rng()
  const at = (i: number, j: number): number => cell[((j % n + n) % n) * n + ((i % n + n) % n)]!
  const smooth = (x: number): number => x * x * (3 - 2 * x)
  const t = new Float32Array(GRAIN_TILE * GRAIN_TILE)
  for (let y = 0; y < GRAIN_TILE; y++) {
    for (let x = 0; x < GRAIN_TILE; x++) {
      const fx = x / GRAIN_CELL, fy = y / GRAIN_CELL
      const i = Math.floor(fx), j = Math.floor(fy)
      const tx = smooth(fx - i), ty = smooth(fy - j)
      t[y * GRAIN_TILE + x] = at(i, j) * (1 - tx) * (1 - ty) + at(i + 1, j) * tx * (1 - ty) +
        at(i, j + 1) * (1 - tx) * ty + at(i + 1, j + 1) * tx * ty
    }
  }
  tile61 = t
  return t
}

/** 63 — 높이맵 타일을 꽂는다(부팅 로드 뒤 한 번 · 정사각 n²). */
export function setPaperHeightTile(data: Float32Array, n: number): void {
  if (data.length !== n * n) throw new Error(`종이 타일 크기 불일치 ${data.length} ≠ ${n}²`)
  height = { data, n }
}
export const paperHeightLoaded = (): boolean => height !== null
/** 반증·대조(63 ⑤ — 62의 자국과 픽셀 대조): 높이맵 대신 61 타일을 쓴다 */
export function setPaper61ForTest(v: boolean): void { paper61Override = v }
export const paper61ForTest = (): boolean => paper61Override

/** 지금 쓰는 결 타일(0..1) — 높이맵(로드됐고 대조 스위치가 꺼졌을 때) · 아니면 61 타일. */
export function grainTile(): Float32Array {
  if (height && !paper61Override) return height.data
  return grainTile61()
}
/** 지금 타일의 변(px) — 엔진이 대상 px를 이것으로 접는다(yp % n) */
export function grainTileN(): number {
  if (height && !paper61Override) return height.n
  return GRAIN_TILE
}
/** 지금 결의 출처(값 — 원장·진단) */
export const grainSource = (): 'height' | 'value61' => (height && !paper61Override ? 'height' : 'value61')

/** 진단(paint59 ④의 자 — 61의 p5grainTileForTest와 같은 꼴): 타일 «알파 지도»(깊이 곱한 값) · n = 지금 타일의 변. */
export function grainTileForTest(): { v: number[]; n: number; source: string } {
  const t = grainTile(), n = grainTileN()
  const v: number[] = new Array(t.length)
  for (let i = 0; i < t.length; i++) v[i] = Math.round(t[i]! * GRAIN_DEPTH * 255) / 255
  return { v, n, source: grainSource() }
}
