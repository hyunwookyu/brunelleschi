// **연장선 스냅**(2026-08-19 13차 항목 3) — Rhino의 Extension 오스냅, SketchUp의
// "선 위 연장(On Line Extension)" 추론과 같은 것이다. 선례를 따른다(A-3).
//
// 기존 선의 끝점 근처에서 시작해 **그 선의 방향 그대로 바깥으로** 그으면, 새 획은 원 선과
// **같은 3D 직선 위**에 놓인다(지시 3-c). 시작점이 3D 앵커(그 끝점)이고 방향도 그 선의
// 방향으로 확정이므로 좌표가 즉시 정해진다 — 첫 앵커·교차 앵커에 이은 **셋째 연결 수단**이고,
// 축이 아닌 방향(면 위 대각선·자유 세그먼트)을 이어 그리는 **유일한** 수단이다(3-b).
//
// 발동 조건(지시 3-a — 좁게. 좁아야 다른 스냅과 안 싸운다):
//   ① 시작점이 그 선의 **끝점에 스냅**됐다(조리개 안 — 끝점/정점 스냅이 먼저 잡는다.
//      우선순위 3-f: 끝점·중점·교차점 다음이 이 순서의 뜻이다)
//   ② 현의 진행 방향이 그 선의 상(2D 직선)의 **바깥 연장 방향**과 임계 안이다.
//      안쪽은 원 선과 겹치므로 후보가 아니다(3-e). 양 끝이 다 후보이고, 시작점 스냅이
//      가까운 끝을 이미 골랐다.
//
// 임계는 **새로 만들지 않는다**(#17) — `LIFT_TOL.parallel_deg`(5° — 나란함 판정)를 그대로
// 쓴다. `resolveLive`의 양끝 스냅 라벨 판정이 같은 값을 쓰는 그 자리다. 커서를 그보다
// 돌리면 발동하지 않고 축 스냅·자유로 넘어간다(3-a).
import { project, sub3, unit3, norm3, type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";
import { LIFT_TOL } from "./lift.js";
import { OSNAP_RADIUS_PX } from "./resolve2d.js";

/**
 * 연장선 발동 판정 — 발동하면 **바깥 방향의 3D 단위벡터**(끝점 기준), 아니면 null.
 *
 * @param endV   시작점이 스냅된 그 끝점(뷰 좌표)
 * @param otherV 같은 선분의 반대쪽 끝(뷰 좌표)
 * @param a2 b2  그리는 현의 화면 양 끝(원시 커서)
 */
export function extensionDir(
  endV: Vec3, otherV: Vec3, a2: Pt2, b2: Pt2,
  ctx: { principal: Pt2; f: number },
  angleDeg: number = LIFT_TOL.parallel_deg,
  minImagePx: number = OSNAP_RADIUS_PX,
): Vec3 | null {
  const pE = project(endV, ctx.principal, ctx.f);
  const pO = project(otherV, ctx.principal, ctx.f);
  if (!pE || !pO) return null;
  // 선의 상은 사영에서도 직선이므로, 끝점에서의 연장 방향 = 상의 방향 그대로다
  const dx = pE[0] - pO[0], dy = pE[1] - pO[1];
  const Ld = Math.hypot(dx, dy);
  const cx = b2[0] - a2[0], cy = b2[1] - a2[1];
  const Lc = Math.hypot(cx, cy);
  // **단축된 상은 방향을 못 정한다** — 원 선이 시선과 거의 나란하면(입면에서 깊이축 선)
  // 상이 몇 px라 그 방향은 잡음이다. 조리개보다 짧은 상에서는 발동하지 않는다
  // (#17 — 새 임계 없이 OSNAP_RADIUS_PX 재사용: "화면에서 구분되는 최소 크기"의 그 값).
  // ⚠ 그 상수는 **전역 해시 밖**이고(D-C4의 오스냅 조리개 예외) 사용자가 4~40px로 움직인다
  // — 동작점별 발동은 extension_snap.json의 guard_sweep이 든다(13차 항목 3 리뷰어 [4]).
  if (Ld < minImagePx || Lc < 1e-9) return null;
  const cos = (dx * cx + dy * cy) / (Ld * Lc);
  if (cos <= 0) return null;                    // 안쪽 — 원 선과 겹친다(지시 3-e)
  if (Math.acos(Math.min(1, cos)) * (180 / Math.PI) > angleDeg) return null;
  const d = sub3(endV, otherV);
  if (norm3(d) < 1e-12) return null;
  return unit3(d);
}
