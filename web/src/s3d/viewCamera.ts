// S-5 회전 후 이어 그리기 — 계획서 §7 "이 단계가 이 도구의 핵심 기능이다".
//
// **돌린 뒤에는 카메라를 정확히 안다.** 첫 그림에서는 소실점을 찍어 카메라를 세워야 했지만
// (§3, 최초 1회 부트스트랩), 한 번 세우고 나면 3D 뷰포트의 자세가 곧 새 카메라다 —
// 소실점을 다시 찍을 필요가 없다. 축 방향도 이미 알고 있으므로 **그 방향을 새 카메라로
// 투영한 점이 새 소실점**이다.
//
// ```
// 첫 시점:  소실점 찍기 → 카메라 → 축 방향
// 돌린 뒤:  뷰포트 자세 → 카메라 → **축 방향은 그대로**, 소실점만 다시 계산
// ```
//
// 좌표계는 `geom3d`와 같다(y 아래, z 안쪽). 뷰포트가 three로 넘길 때만 뒤집는다.
import { isFiniteVp, type Pt2 } from "./camera.js";
import { add3, dot3, mul3, project, sub3, unit3, type Vec3 } from "./geom3d.js";
import type { PlaceCtx } from "./stroke.js";

/**
 * 새 시점의 자세. `R`의 세 행이 **세계 좌표로 표현한 뷰 축**(오른쪽·아래·앞)이고
 * `C`는 세계 좌표의 눈 위치다. 즉 `p_view = R · (p_world − C)`.
 */
export interface ViewPose { R: [Vec3, Vec3, Vec3]; C: Vec3; }

/** 세계 점 → 새 시점의 카메라 좌표. */
export function toView(pose: ViewPose, p: Vec3): Vec3 {
  const d = sub3(p, pose.C);
  return [dot3(pose.R[0], d), dot3(pose.R[1], d), dot3(pose.R[2], d)];
}

/** 세계 **방향** → 새 시점의 방향(평행이동 없음). */
export function dirToView(pose: ViewPose, d: Vec3): Vec3 {
  return [dot3(pose.R[0], d), dot3(pose.R[1], d), dot3(pose.R[2], d)];
}

/** 새 시점 좌표 → 세계 좌표(역변환). 화면 점을 세계 광선으로 되돌릴 때 쓴다. */
export function fromView(pose: ViewPose, p: Vec3): Vec3 {
  return add3(pose.C, add3(add3(mul3(pose.R[0], p[0]), mul3(pose.R[1], p[1])), mul3(pose.R[2], p[2])));
}

/**
 * **세계 축 방향 → 새 시점의 소실점.**
 *
 * 소실점은 그 방향으로 무한히 간 점의 상이므로, 방향을 새 카메라 좌표로 옮겨 투영하면 된다
 * (이론서 2.2). 방향이 화면과 나란하면(`z ≈ 0`) 소실점이 **무한원**이고 그 축은 화면평행이 된다 —
 * 그때는 `null`을 준다. **없는 소실점을 지어내지 않는다.**
 *
 * `z < 0`이면 그 방향은 카메라 뒤로 간다. 소실점 자체는 반대 방향(−d)의 상과 같은 점이므로
 * 부호를 뒤집어 계산한다 — 직선의 방향이지 반직선의 방향이 아니기 때문이다.
 */
export function vpOfDirection(
  pose: ViewPose, worldDir: Vec3, principal: Pt2, f: number, imgSize: [number, number],
): Pt2 | null {
  const d = dirToView(pose, unit3(worldDir));
  const e: Vec3 = d[2] < 0 ? [-d[0], -d[1], -d[2]] : d;
  if (Math.abs(e[2]) < 1e-9) return null;                      // 화면 평행 — 무한원(2.2 c=0)
  const vp: Pt2 = [principal[0] + (f * e[0]) / e[2], principal[1] + (f * e[1]) / e[2]];
  // 화면에서 너무 멀면 사실상 무한원이다. `isFiniteVp`가 그 판정을 갖고 있으니 같은 자를 쓴다.
  return isFiniteVp(vp, imgSize) ? vp : null;
}

/** three의 수직 화각(도)과 화면 높이 → 초점거리(px). 주점은 화면 중심이다. */
export const fFromFov = (fovDeg: number, heightPx: number): number =>
  heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);

/**
 * **돌린 시점의 배치 문맥.** `axes`는 첫 카메라에서 얻은 **세계 축 방향 셋**이다
 * (`axisDirection(vp_i)`). 그 방향은 시점이 바뀌어도 변하지 않는다 — 바뀌는 것은 소실점뿐이다.
 */
export function viewPlaceCtx(
  pose: ViewPose, axes: (Vec3 | null)[], imgSize: [number, number], fovDeg: number,
): PlaceCtx {
  const f = fFromFov(fovDeg, imgSize[1]);
  const principal: Pt2 = [imgSize[0] / 2, imgSize[1] / 2];
  return {
    principal, f, imgSize,
    vps: axes.map(a => (a ? vpOfDirection(pose, a, principal, f, imgSize) : null)),
  };
}

/**
 * **회전 판 불변식**(§4.5의 회전 버전). 이미 놓인 3D 획을 새 시점으로 투영한 것이,
 * 그 시점에서 그렸다면 나왔을 화면 좌표와 같은가.
 *
 * 이것은 **설계 보장**이다 — 두 계산이 같은 사영이므로 같아야 하고, 다르면 자세 변환이나
 * 초점거리 환산에 부호·규약 오류가 있는 것이다. 그래서 게이트가 아니라 **불변식 테스트**로 쓴다
 * (S-3에서 배운 것: 보장에는 임계를 걸지 않는다).
 */
export function projectInView(pose: ViewPose, p: Vec3, principal: Pt2, f: number): Pt2 | null {
  return project(toView(pose, p), principal, f);
}
