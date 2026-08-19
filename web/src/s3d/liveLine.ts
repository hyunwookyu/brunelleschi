// L-B.3/B.4 **실시간 선** — 계획서 §3 마지막 문단과 §7.
//
// ```
// 획 시작 → 첫 점이 스냅 → **3D 확정**
// 그리는 중 → 축 판정 → 커서 위치에서 **끝점 3D 결정**
// ```
//
// **시작점이 3D에 못박히면 추론할 것이 없다.** 앵커를 지나고 축 방향을 가진 3D 직선은
// 하나뿐이고, 커서 픽셀 하나가 그 직선 위의 점 하나를 정한다 —
// 눈에서 커서로 나가는 광선과 그 직선의 **최근접점**이다(`geom3d.ts` 머리말).
// 두 직선이 실제로 만나지 않아도(손떨림) 답이 하나 나오므로 실패 모드가 온건하다.
//
// **이것이 L-A의 일괄 풀이(`lift.ts`)와 다른 경로다.** 일괄 풀이는 카메라 확정 순간에
// 한 번 돌고 앵커가 없다. 여기는 확정 뒤이고 앵커가 있다 — 그래서 획 하나씩 즉시 놓인다.
import { closestPoints, rayThrough, add3, sub3, mul3, dot3, norm3, unit3,
         type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";

export interface LiveCtx { principal: Pt2; f: number }

export const LIVE_TOL = {
  /**
   * **축으로 인정하는 최대 화면 각차**(도). 이보다 벌어지면 축이 아니고, 그 획은
   * 2D 레이어에 남는다 — **애매하면 놓지 않는다**(A-3).
   *
   * ⚠ **값은 아직 잠정이다.** L-B.4가 잰다(실시간 색이 오배정을 줄이는지는 사용자 행동에
   * 달려 있어 간접 측정만 가능하다 — 계획서 §13). 지금은 `AXIS_TOL`의 사후 판정 임계와
   * 같은 자릿수로 두었고, **실시간이라 사용자가 즉시 각도를 튼다**는 점이 사후 판정과 다르다.
   */
  axis_deg: 12,
};

/**
 * 앵커에서 축 방향으로 뻗은 직선 위, **커서 광선에 가장 가까운 점**.
 *
 * `dir`가 없으면(축 미정) `null` — **애매하면 놓지 않는다**(A-3).
 * 앵커보다 뒤(카메라 쪽)로 넘어가도 그대로 돌려준다: 사용자가 반대 방향으로 긋는 것은
 * 정상이다. 카메라 뒤로 가는 것만 막는다.
 */
export function endFromCursor(
  anchor: Vec3, dir: Vec3 | null, cursor: Pt2, ctx: LiveCtx,
): Vec3 | null {
  if (!dir || norm3(dir) < 1e-12) return null;
  const r = rayThrough(cursor, ctx.principal, ctx.f);
  const cl = closestPoints([0, 0, 0], r, anchor, dir);
  if (cl.parallel) return null;                       // 시선과 축이 나란하다 — 점이 안 정해진다
  const q = cl.q;
  return q[2] > 1e-9 ? q : null;                      // 카메라 뒤면 놓지 않는다
}

/**
 * 스냅된 시작점 + 축 → 3D 세그먼트. 획의 **끝 잉크 점**이 커서다(프리핸드는 미뤘다, §1.1).
 *
 * 반환이 `null`이면 2D 레이어에 남는다 — **실패가 아니라 대기다**(§9.1).
 */
export function segmentFromAnchor(
  anchor: Vec3, dir: Vec3 | null, endCursor: Pt2, ctx: LiveCtx,
): [Vec3, Vec3] | null {
  const b = endFromCursor(anchor, dir, endCursor, ctx);
  if (!b) return null;
  if (norm3(sub3(b, anchor)) < 1e-9) return null;     // 길이 0
  return [anchor, b];
}

/**
 * **커서 방향에 가장 가까운 축**(§4). 카메라가 확정된 뒤에는 볼 것이 없다 —
 * 앵커를 지나는 각 축 직선을 화면에 투영해 **그 화면 방향**과 획의 화면 방향을 비교한다.
 *
 * ⚠ **3D 방향끼리 비교하지 않는다.** 축의 화면 방향은 앵커 위치에 따라 다르고
 * (소실점으로 모이므로) 사용자가 보는 것도 그쪽이다.
 *
 * `dirs`는 축 0·1·2의 3D 방향이며 `null`은 그 축의 소실점이 없는 경우다.
 * 반환은 축 번호와 각도 차(도). 후보가 없으면 `null`.
 */
export function nearestAxisOnScreen(
  anchor: Vec3, dirs: (Vec3 | null)[], a2: Pt2, b2: Pt2, ctx: LiveCtx,
): { axis: 0 | 1 | 2; deg: number } | null {
  const r = nearestDirOnScreen(anchor, dirs.slice(0, 3), a2, b2, ctx);
  return r ? { axis: r.index as 0 | 1 | 2, deg: r.deg } : null;
}

/**
 * **커서 방향에 가장 가까운 방향**(15차 항목 7 · D-L106에서 일반화). 축 셋만이 아니라
 * **임의 방향 목록**을 받는다 — 보조 소실점의 방향이 같은 판정을 지나야 하기 때문이다(#17).
 *
 * `nearestAxisOnScreen`은 이제 이 함수의 얇은 포장이다(축 셋으로 잘라 부른다) — 판정이
 * 두 곳에 있으면 축과 보조가 **다른 자로 재게 된다.**
 */
export function nearestDirOnScreen(
  anchor: Vec3, dirs: (Vec3 | null)[], a2: Pt2, b2: Pt2, ctx: LiveCtx,
): { index: number; deg: number } | null {
  const sx = b2[0] - a2[0], sy = b2[1] - a2[1];
  const L = Math.hypot(sx, sy);
  if (L < 1e-9) return null;
  const ux = sx / L, uy = sy / L;
  let best: { index: number; deg: number } | null = null;
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    if (!d) continue;
    // 앵커에서 축 방향으로 조금 간 점의 상 — 그 차가 축의 **화면 방향**이다
    const step = mul3(unit3(d), Math.max(1e-3, norm3(anchor) * 1e-3));
    const p1 = anchor, p2 = add3(anchor, step);
    if (p1[2] <= 1e-9 || p2[2] <= 1e-9) continue;
    const q1: Pt2 = [ctx.principal[0] + (p1[0] * ctx.f) / p1[2],
                     ctx.principal[1] + (p1[1] * ctx.f) / p1[2]];
    const q2: Pt2 = [ctx.principal[0] + (p2[0] * ctx.f) / p2[2],
                     ctx.principal[1] + (p2[1] * ctx.f) / p2[2]];
    const vx = q2[0] - q1[0], vy = q2[1] - q1[1];
    const M = Math.hypot(vx, vy);
    if (M < 1e-12) continue;
    // **부호를 무시한다** — 축을 어느 쪽으로 긋든 같은 축이다
    const c = Math.min(1, Math.abs((ux * vx + uy * vy) / M));
    const deg = (Math.acos(c) * 180) / Math.PI;
    if (!best || deg < best.deg) best = { index: i, deg };
  }
  return best;
}

export { dot3, norm3, unit3 };
