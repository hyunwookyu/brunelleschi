// 종이 결(면 고정) — web2-61의 p5paint 결 타일을 엔진 밖으로 옮긴 것(web2-62).
// 계약(D-W27 ⛔ · 59-3): 결은 브러시(시드=획)가 아니라 **종이(대상 px 격자 · 시드 고정)**의
// 것이다 — 두 획이 같은 자리를 지나면 같은 이빨. 값 잡음(스무드스텝 보간 — 모자이크 아님)이고
// 칸은 대상 px 기준 고정이라 굵기와 무관하다(grain61 ④). 63이 실제 높이맵으로 갈아 끼운다 —
// 그때 바뀌는 것은 이 파일(타일의 «값»)뿐이고 엔진의 «곱하는 자리»는 그대로다.
//
// 값은 0..1(이빨의 깊이 몫)이고 엔진이 깊이(GRAIN_DEPTH × paperK)를 곱해 도장 알파와 덮임
// 캡을 깎는다: 1 − 깊이 × 타일. 61의 destination-out(alpha × (1 − depth·tile))과 같은 셈이다.

import { rng32 } from '../core/material'

export const GRAIN_TILE = 256
export const GRAIN_CELL = 4              // 61 그대로(256을 나눠떨어지게 — 3은 격자 색인이 깨졌다)
export const GRAIN_DEPTH = 0.42          // 61의 기본 깊이(paperK 1) 그대로

let tile: Float32Array | null = null

/** 결 타일(0..1 · 256²) — 고정 시드 61: 실행·획·시드 무관한 «같은 종이». */
export function grainTile(): Float32Array {
  if (tile) return tile
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
  tile = t
  return t
}

/** 진단(paint59 ④의 자 — 61의 p5grainTileForTest와 같은 꼴): 타일 «알파 지도»(깊이 곱한 값). */
export function grainTileForTest(): { v: number[]; n: number } {
  const t = grainTile()
  const v: number[] = new Array(t.length)
  for (let i = 0; i < t.length; i++) v[i] = Math.round(t[i]! * GRAIN_DEPTH * 255) / 255
  return { v, n: GRAIN_TILE }
}
