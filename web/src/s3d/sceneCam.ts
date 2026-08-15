// L-B.1 — **단일 뷰포트의 전제**: three 카메라를 확정된 투시 카메라와 **같게** 만든다.
//
// 계획서 §10.3이 요구하는 것은 2D 잉크와 3D 씬이 **한 화면에 겹치는 것**이고, 그러려면
// 3D를 그리는 카메라가 `project(p, principal, f)`와 **같은 픽셀**을 내야 한다.
// 옛 UI는 좌우로 나눠 놨기 때문에 이 문제가 없었다 — 3D 뷰는 아무 화각이나 써도 됐다.
//
// 어려운 부분은 **주점이 화면 중심이 아니라는 것** 하나다. three의 `PerspectiveCamera`는
// 화각과 종횡비만 받으므로 주점이 늘 중심이다. `setViewOffset`이 그 제약을 푼다 —
// **더 큰 프레임의 부분창을 그리는 기능**이라, 큰 프레임의 중심을 주점에 두면 된다.
//
// ```
// 큰 프레임 W×H : 중심이 주점        →  W = 2·max(px, w−px),  H = 2·max(py, h−py)
// 부분창 w×h    : 실제 캔버스        →  offset = (W/2 − px, H/2 − py)
// 화각          : H와 f로 정한다      →  fov = 2·atan(H / 2f)
// ```
//
// 주점이 중심이면 `W=w, H=h, offset=0`이 되어 **평범한 카메라로 되돌아간다** — 특수 경로가 아니다.
//
// ⚠ **이 일치는 측정이 아니라 설계 보장이다**(PITFALLS #5). 두 계산이 같은 사영이므로
// 같아야 하고, 다르면 부호·규약 오류다. 그래서 임계를 걸지 않고 **불변식 테스트**로 쓴다
// (`viewCamera.projectInView`가 이미 같은 자리에 있다).
import type { Pt2 } from "./camera.js";
import type { Vec3 } from "./geom3d.js";

/** three `PerspectiveCamera`에 그대로 넣을 수 있는 형태. */
export interface ThreeIntrinsics {
  fovDeg: number;
  aspect: number;
  /** `camera.setViewOffset(...)`의 인자 순서 그대로. */
  view: { fullWidth: number; fullHeight: number; offsetX: number; offsetY: number;
          width: number; height: number };
}

/** three의 `makePerspective` 인자 — 불변식 테스트가 손으로 확인하는 대상이다. */
export interface Frustum { left: number; right: number; top: number; bottom: number }

/**
 * 투시 카메라 내부파라미터 → three 카메라 설정.
 *
 * `f`는 **픽셀 단위 초점거리**이고 `principal`·`imgSize`는 **CSS 픽셀**이다 —
 * 캔버스 백버퍼(dpr배)가 아니다. dpr은 `renderer.setPixelRatio`가 따로 먹는다(PITFALLS #21).
 */
export function threeIntrinsics(principal: Pt2, f: number, imgSize: [number, number]): ThreeIntrinsics {
  const [w, h] = imgSize;
  const [px, py] = principal;
  // 부분창이 큰 프레임 안에 들어가야 한다 — 주점이 캔버스 밖이어도 성립한다.
  const W = 2 * Math.max(px, w - px);
  const H = 2 * Math.max(py, h - py);
  return {
    fovDeg: (Math.atan(H / (2 * f)) * 360) / Math.PI,
    aspect: W / H,
    view: { fullWidth: W, fullHeight: H, offsetX: W / 2 - px, offsetY: H / 2 - py,
            width: w, height: h },
  };
}

/**
 * three가 이 설정으로 만들 절두체(근평면에서의 좌우상하). **three의 산식을 그대로 옮긴 것**이라
 * 실제 `updateProjectionMatrix()`와 대조할 수 있다 — three 판본이 바뀌면 그 테스트가 깨진다.
 */
export function frustumOf(intr: ThreeIntrinsics, near: number): Frustum {
  let top = near * Math.tan((Math.PI / 180) * 0.5 * intr.fovDeg);
  let height = 2 * top;
  let width = intr.aspect * height;
  let left = -0.5 * width;
  const v = intr.view;
  left += (v.offsetX * width) / v.fullWidth;
  top -= (v.offsetY * height) / v.fullHeight;
  width *= v.width / v.fullWidth;
  height *= v.height / v.fullHeight;
  return { left, right: left + width, top, bottom: top - height };
}

/**
 * 우리 규약의 카메라 좌표 점(y 아래·z 안쪽)을 그 절두체로 투영한 **CSS 픽셀**.
 *
 * three 씬은 `world` 그룹을 x축 180° 돌려 담으므로 카메라 좌표에서 `y·z`의 부호가 뒤집힌다
 * (`viewport.ts`의 규약 — **뒤집기는 한 군데서만 한다**). 그 뒤집기를 여기서 되돌린다.
 * `null`은 카메라 뒤(또는 근평면 앞)라 화면에 없는 것이다.
 */
export function projectViaFrustum(p: Vec3, fr: Frustum, near: number,
                                  imgSize: [number, number]): Pt2 | null {
  const [x, y, z] = p;
  if (!(z > 1e-9)) return null;
  const X = x, Y = -y, Z = -z;                // three 카메라 좌표
  const nx = ((2 * near) / (fr.right - fr.left)) * (X / -Z)
           - (fr.right + fr.left) / (fr.right - fr.left);
  const ny = ((2 * near) / (fr.top - fr.bottom)) * (Y / -Z)
           - (fr.top + fr.bottom) / (fr.top - fr.bottom);
  return [(imgSize[0] * (nx + 1)) / 2, (imgSize[1] * (1 - ny)) / 2];
}

/** three 카메라 비슷한 것에 설정을 먹인다. three를 import하지 않으려고 구조적 타입을 받는다. */
export interface CameraLike {
  fov: number;
  aspect: number;
  near: number;
  far: number;
  setViewOffset(fw: number, fh: number, x: number, y: number, w: number, h: number): void;
  clearViewOffset(): void;
  updateProjectionMatrix(): void;
}

/** 확정 카메라를 three 카메라에 건다. **여기가 유일한 출처다**(PITFALLS #17). */
export function applyIntrinsics(cam: CameraLike, intr: ThreeIntrinsics): void {
  cam.fov = intr.fovDeg;
  cam.aspect = intr.aspect;
  const v = intr.view;
  cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
  cam.updateProjectionMatrix();
}

/** 확정 카메라를 벗어난 자유 시점(궤도)으로 되돌린다 — 주점이 다시 화면 중심이다. */
export function applyFreeAspect(cam: CameraLike, imgSize: [number, number], fovDeg: number): void {
  cam.fov = fovDeg;
  cam.aspect = imgSize[0] / Math.max(1, imgSize[1]);
  cam.clearViewOffset();
  cam.updateProjectionMatrix();
}
