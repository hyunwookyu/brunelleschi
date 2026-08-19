// **확정 배치의 연결 되맞춤**(2026-08-19 15차 항목 1 · D-L98).
//
// ---------------------------------------------------------------- 무엇이 어긋나 있었나
//
// 2D 오스냅이 후보로 내는 끝점은 **그린 끝점**이다 — `mainL.pend2Segs`가
// `pts2d[0]`·`pts2d[마지막]`을 그대로 `Snap2Seg`로 넘기고 `static2dCandidates`가 그 두 점을
// `endpoint` 후보로 낸다. 사용자가 보고 받아들인 연결점이 그것이다.
//
// 그런데 확정 순간의 일괄 풀이(`liftAll`)는 3D 끝점을 **대표 직선의 극단**(`rep.a`·`rep.b`)의
// 광선 위에 놓는다(`lift.ts`의 `raw.set` — `lamOf(id, F.rep.a)`). `representative`는 PCA
// 주축에 점열을 사영한 극단값이라, 프리핸드 획에서 그것은 그린 끝점이 **아니다**.
//
// 실측(`confirm_link.json@f351839a`의 `real_ink_rep_offset` — 실획 표본 셋 22획):
// 그린 끝점과 `rep` 끝 사이가 **중앙 6.5px(시작 끝만 7.0px) · 최대 79.4px**이고 조리개
// (`OSNAP_RADIUS_PX` = 8)를 넘는 시작 끝이 **8/22**다(`over_aperture_start`). 즉 확정 순간, 붙여 그린 두 획이 **붙지 않은 채로** 3D에 올라간다.
// ⚠ 획이 두 점으로 접힌 경우(방향·끝점 스냅이 걸려 `resolve2dCore`가 `pts = [a, b]`를 낸
// 획)는 `rep`가 그 두 점을 정확히 지나 어긋남이 0이다 — **그래서 마우스 합성 픽스처에서는
// 이 결함이 안 보였다**(합성 삼각형 25구도 전부 간격 0). **프리핸드가 판정자다.**
//
// ---------------------------------------------------------------- 규약은 실시간 경로 그대로다
//
// `placeLive`가 그리는 중에 하는 것과 **같다**(#17 — 새 규약을 안 만든다):
// **좌표는 연결이 정한다**(D-L83) — 대상 3D 직선 위에서 기록된 화면점의 광선에 가장 가까운
// 점이 연결점이고(`endFromCursor` 그대로), 두 획의 그 끝이 **같은 점**이 된다.
//
// ```
// 대상 획   그 직선 위에서 미끄러진다        — 직선이 안 바뀐다(정확)
// 이은 획   연결점을 앵커로 다시 놓는다      — **3D 방향(축)은 그대로**, 반대 끝은 그 끝의
//                                             화면점 광선에서 받는다(`segmentFromAnchor` 규약)
// ```
//
// ⚠⚠ **방향을 보존하는 것이 초판보다 낫다 — 측정이 그렇게 말했다.** 초판은 끝점만 옮기고
// 반대 끝을 그대로 뒀는데, 그러면 3D 방향이 **접합 잔차 ÷ 획 길이**만큼 돌았다.
// 그 회전은 `confirm_link.json`의 `summary.no_keepdir_turn_deg_max`가 든다(#47 — 수치는
// 그 자리에서 원장을 읽는다). 그 분포가 축 나란함(`summary.parallel_deg`) **밖까지 간다**는
// 것이 방향을 물린 이유이고, 축 평행은 이 도구의 전제다.
// 방향을 앵커에 물리고 반대 끝을 광선에서 받으면 그 회전이 **0**이 된다 — 그리고 그것이
// 그리는 중의 규약과 **같다**(#17 — `placeLive` → `segmentFromAnchor`).
//
// ⚠ **양 끝이 다 선언된 획은 방향을 보존할 수 없다** — 두 연결이 방향을 정해 버린다.
// 그때는 **연결이 이긴다**(D-L83: 좌표는 연결이 정한다) — 부르는 쪽이 `keepDir = false`로
// 부르고 두 끝을 각각 그 연결점에 둔다.
//
// ⚠ **각도 가드를 두지 않는다**(지시 1-b): 스냅된 끝점은 사용자가 보고 받아들인 것이므로
// 확정이 그것을 바꾸지 않는다.
//
// ⚠ **대상 획의 끝점을 옮기는 것은 `endpoint`·`vertex` 기록뿐이다.** 중점·교차점·수선 발은
// 대상의 **몸통**에 붙은 연결이라 대상의 끝이 아니다 — 옮기면 대상을 늘이거나 줄인다.
import { endFromCursor } from "./liveLine.js";
import { project, sub3, norm3, type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";
import type { SnapKind } from "./snap.js";

/** 대상의 **끝점**에 붙은 연결인가 — 그때만 대상 쪽 끝도 함께 옮긴다. */
export const ANCHOR_AT_TARGET_END = new Set<SnapKind>(["endpoint", "vertex"]);

export interface AnchorCtx { principal: Pt2; f: number }

export interface AnchorOut {
  /** 이은 획의 새 세그먼트. */
  seg: [Vec3, Vec3];
  /** 대상 획의 새 세그먼트 — 안 움직였으면 입력과 같은 값을 낸다. */
  target: [Vec3, Vec3];
  /** 연결점(두 획이 공유하는 3D 점). */
  at3: Vec3;
  /** 이은 획의 어느 끝이 움직였나. */
  slot: 0 | 1;
  /** 대상 획의 어느 끝이 움직였나 — 안 움직였으면 `null`. */
  targetSlot: 0 | 1 | null;
  /** 이은 획의 끝이 화면에서 옮겨간 거리(px) — 결함의 크기다(원장이 읽는다). */
  movedPx: number;
  /** 되맞춤이 이은 획의 **3D 방향**을 돌린 각(도). `keptDir`면 0이다(보장 — #5). */
  turnDeg: number;
  /** 방향을 실제로 물렸는가 — 반대 끝 되받기가 실패하면 `false`로 내려앉는다. */
  keptDir: boolean;
}

/** 화면에서 `at`에 더 가까운 끝의 index. 되쏘기가 안 되면 `null`. */
function nearerSlot(seg: [Vec3, Vec3], at: Pt2, ctx: AnchorCtx): 0 | 1 | null {
  const p0 = project(seg[0], ctx.principal, ctx.f);
  const p1 = project(seg[1], ctx.principal, ctx.f);
  if (!p0 || !p1) return null;
  const d0 = Math.hypot(p0[0] - at[0], p0[1] - at[1]);
  const d1 = Math.hypot(p1[0] - at[0], p1[1] - at[1]);
  return d0 <= d1 ? 0 : 1;
}

const angDeg = (u: Vec3, v: Vec3): number => {
  const lu = norm3(u), lv = norm3(v);
  if (lu < 1e-12 || lv < 1e-12) return 0;
  const c = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)));
  const d = (Math.acos(c) * 180) / Math.PI;
  return Math.min(d, 180 - d);
};

/**
 * **기록된 연결 하나를 되맞춘다.** 대상 직선 위의 연결점으로 두 획의 그 끝을 모은다.
 *
 * ⚠ **`rep`의 끝 순서는 `pts2d` 순서와 뒤집힐 수 있다**(PCA `tmin`/`tmax` — `lift.test.ts`의
 * `shapeError`가 같은 자리에서 걸렸다). 그래서 어느 끝인지는 `end` 플래그가 아니라
 * **화면 거리**로 정한다.
 *
 * `null`이면 아무것도 안 바꾼다 — 놓인 세그먼트가 그대로 남는다(A-3: 애매하면 안 건드린다).
 */
export function anchorToTarget(
  seg: [Vec3, Vec3], target: [Vec3, Vec3], at: Pt2, kind: SnapKind, ctx: AnchorCtx,
  keepDir = true,
): AnchorOut | null {
  const tdir = sub3(target[1], target[0]);
  if (norm3(tdir) < 1e-12) return null;
  // **연결점 = 대상 직선 위, 기록된 화면점의 광선에 가장 가까운 점**(실시간 경로 그대로)
  const at3 = endFromCursor(target[0], tdir, at, ctx);
  if (!at3) return null;

  const slot = nearerSlot(seg, at, ctx);
  if (slot == null) return null;
  const farSlot = slot === 0 ? 1 : 0;
  const p = project(seg[slot], ctx.principal, ctx.f);
  const farScreen = project(seg[farSlot], ctx.principal, ctx.f);
  if (!p || !farScreen) return null;
  const movedPx = Math.hypot(p[0] - at[0], p[1] - at[1]);
  const before = sub3(seg[1], seg[0]);
  // **방향을 물리고 반대 끝을 그 끝의 화면점에서 받는다**(`segmentFromAnchor` 규약, #17)
  const far = keepDir ? endFromCursor(at3, before, farScreen, ctx) : null;
  const keptDir = !!far;
  const other = far ?? seg[farSlot];
  if (norm3(sub3(at3, other)) < 1e-9) return null;              // 길이 0 — 놓지 않는다
  const out: [Vec3, Vec3] = slot === 0 ? [at3, other] : [other, at3];
  const turnDeg = angDeg(before, sub3(out[1], out[0]));

  // **대상의 끝점 연결이면 대상도 그 점으로 미끄러뜨린다** — `at3`가 대상 직선 위이므로
  // 대상의 직선은 안 바뀐다(정확한 미끄러짐).
  let tOut: [Vec3, Vec3] = target;
  let targetSlot: 0 | 1 | null = null;
  if (ANCHOR_AT_TARGET_END.has(kind)) {
    const ts = nearerSlot(target, at, ctx);
    if (ts != null && norm3(sub3(at3, target[ts === 0 ? 1 : 0])) > 1e-9) {
      tOut = ts === 0 ? [at3, target[1]] : [target[0], at3];
      targetSlot = ts;
    }
  }
  return { seg: out, target: tOut, at3, slot, targetSlot, movedPx, turnDeg, keptDir };
}
