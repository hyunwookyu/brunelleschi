// L-D.1 — **화면에서 획 고르기**(계획서 §9.5). 지우기와 축 지정이 이것 위에 선다.
//
// UI에서 떼어낸 이유는 **측정 경로와 앱 경로가 갈라지는 것**을 막기 위해서다(#17).
// 반경 상수도 여기 있고 `test/constants.ts`가 그것을 물어 STALE이 잡히게 한다(D-C4).
//
// **선례를 따른다**(A-3): SketchUp/Rhino가 선을 고르는 방식 — **가장 가까운 것 하나**이고
// 반경 밖이면 아무것도 안 고른다(빈 곳을 누르면 선택이 풀린다).
import type { Pt2 } from "../s3d/camera.js";

export const PICK_TOL = {
  /**
   * 고르기 반경 — 캔버스 대각선 비. 앱 1280×675에서 **약 21px**이다.
   *
   * ⚠ **스냅 반경(`SNAP_TOL.radius_ratio` 0.05 = 72px)보다 훨씬 작다.** 둘은 다른 문제다:
   * 스냅은 **손 획의 겨냥 오차**를 흡수해야 하고(중앙 4.7~23.8px, D-L14),
   * 고르기는 **커서로 정확히 짚는 것**이라 선례의 값(10~15px)에 가깝다.
   * 크게 잡으면 촘촘한 기하에서 **엉뚱한 획을 지운다** — 그 비용이 비대칭이다(D-L25의 λ와 같은 형태).
   */
  radius_ratio: 0.0145,
} as const;

/** 점-선분 거리(화면 픽셀). */
export function distToSeg(p: Pt2, a: Pt2, b: Pt2): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  if (L2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
}

export interface PickSeg { id: string; a: Pt2; b: Pt2 }

/**
 * 반경 안에서 **가장 가까운 것 하나**. 없으면 `null`.
 *
 * 동점이면 **먼저 온 것**이다 — 호출자가 그리는 순서를 정하므로 그쪽이 규약을 갖는다.
 * ⚠ 반경을 **호출자가 준다**: 캔버스 크기가 화면마다 달라 비를 픽셀로 바꾸는 자리가 하나여야 한다.
 */
export function nearestSeg(p: Pt2, segs: readonly PickSeg[], radiusPx: number): string | null {
  let bestId: string | null = null, bestD = radiusPx;
  for (const s of segs) {
    const d = distToSeg(p, s.a, s.b);
    if (d < bestD) { bestD = d; bestId = s.id; }
  }
  return bestId;
}
