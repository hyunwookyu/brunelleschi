// L-B.1 — **단일 뷰포트**. 계획서 §10.3.
//
// 2D 잉크와 3D 씬이 **같은 상자 안에 겹친다**. 좌우 분할이 아니라 한 화면이므로
// 좌표계가 하나다 — 옛 UI에서 "이 `pts2d`는 어느 캔버스 좌표인가"를 세 곳에서 갈라야 했던
// 문제가 구조적으로 없어진다(§9.2가 남은 절반을 맡는다).
//
// ```
// host ─┬─ three 캔버스   (아래) : 3D 레이어
//       └─ 잉크 캔버스     (위)  : 2D 레이어 + 가이드 + 미리보기 + 상호작용
// ```
//
// **궤도는 잉크 캔버스를 통과시켜 넘긴다** — `pointer-events: none`을 걸면 밑의 three 캔버스가
// 받고 `OrbitControls`가 그대로 동작한다. 궤도 조작을 새로 짜지 않는다(A-3: 선례를 따른다).
import * as THREE from "three";
import { Viewport } from "../s3d/viewport.js";
import { threeIntrinsics, applyIntrinsics, applyFreeAspect,
         type CameraLike } from "../s3d/sceneCam.js";
import type { Pt2 } from "../s3d/camera.js";
import type { Vec3 } from "../s3d/geom3d.js";
import { AXIS_COLOR } from "../s3d/grid.js";
import type { Axis } from "../s3d/axis.js";
import type { ViewPose } from "../s3d/viewCamera.js";

/** 3D 레이어에 그릴 선분 하나. 프리핸드를 미뤘으므로 획 하나가 선분 하나다(§1.1). */
export interface StageSeg { id: string; a: Vec3; b: Vec3; axis: Axis }

/** 자유 시점(궤도)의 화각. 확정 카메라를 벗어난 뒤에만 쓴다. */
export const FREE_FOV_DEG = 45;

/**
 * 우리 규약 ↔ three 규약(y 아래·z 안쪽 ↔ y 위·z 앞). **자기 자신이 역이다.**
 * `viewport.ts`가 쓰는 그 변환과 같은 것이고, 여기 말고 다른 곳에서 다시 적지 않는다(#17).
 */
const conv = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

export class Stage {
  readonly viewport: Viewport;
  /** 지금 확정 카메라에 물려 있는가. 그렇지 않으면 자유 시점이다. */
  private pinned: { principal: Pt2; f: number } | null = null;
  private segs = new THREE.Group();
  private lineGeom: THREE.BufferGeometry | null = null;

  constructor(readonly host: HTMLElement) {
    this.viewport = new Viewport(host);
    this.viewport.grid.visible = false;         // 투시 그리드는 2D 층이 그린다
    this.viewport.controls.enabled = false;     // 확정 전에는 돌릴 3D가 없다
    this.viewport.world.add(this.segs);
    this.viewport.renderer.setClearColor(0xffffff, 1);
  }

  size(): [number, number] {
    return [Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight)];
  }

  /**
   * **확정 카메라에 물린다.** 이 상태에서 3D 레이어는 2D 잉크와 **같은 픽셀에 그려진다** —
   * 그것이 단일 뷰포트의 전제다(`sceneCam` 머리말).
   *
   * `projectionHook`으로 걸어 두므로 **창 크기가 바뀌어도 유지된다**. 옛 `resize()`는
   * `aspect = w/h`로 덮어써서 주점을 중심으로 되돌렸을 것이다.
   */
  pinTo(principal: Pt2, f: number): void {
    this.pinned = { principal, f };
    const cam = this.viewport.camera;
    cam.position.set(0, 0, 0);
    cam.quaternion.identity();
    cam.updateMatrixWorld(true);
    this.viewport.controls.enabled = false;
    this.viewport.projectionHook = (size) =>
      applyIntrinsics(cam as unknown as CameraLike, threeIntrinsics(principal, f, size));
    this.viewport.projectionHook(this.size());
    this.viewport.invalidate();
  }

  /** 확정 카메라를 벗어나 자유 시점으로. 지금 자세에서 이어 돌린다. */
  unpin(target: Vec3 | null): void {
    this.pinned = null;
    const cam = this.viewport.camera;
    this.viewport.projectionHook = (size) =>
      applyFreeAspect(cam as unknown as CameraLike, size, FREE_FOV_DEG);
    this.viewport.projectionHook(this.size());
    if (target) {
      // 우리 규약(y 아래·z 안쪽) → three(y 위·z 앞). 뒤집기는 `viewport.ts` 규약 그대로다.
      this.viewport.controls.target.set(target[0], -target[1], -target[2]);
    }
    this.viewport.controls.enabled = true;
    this.viewport.controls.update();
    this.viewport.invalidate();
  }

  get isPinned(): boolean { return this.pinned !== null; }

  /**
   * **지금 자세를 `ViewPose`로 낸다**(§9.2 — 뷰가 자세를 들고 있어야 되돌아갈 수 있다).
   * 확정 카메라에 물려 있으면 `null`이다 — **그것이 확정 뷰의 표시**이고(`SView.pose === null`)
   * 자세가 항등이라 저장할 것이 없다.
   *
   * 규약 변환은 **`viewport.ts`의 그것 하나뿐이다**(우리 y 아래·z 안쪽 ↔ three y 위·z 앞).
   * three 카메라의 기저는 열 X(오른쪽)·Y(위)·−Z(보는 방향)이므로
   * 우리 행 (오른쪽, 아래, 앞) = (X, −Y, −Z)를 그 변환으로 옮긴 것이다.
   */
  pose(): ViewPose | null {
    if (this.pinned) return null;
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const m = cam.matrixWorld.elements;
    const col = (i: number): Vec3 => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
    return {
      R: [conv(col(0)), conv(neg(col(1))), conv(neg(col(2)))],
      C: conv([cam.position.x, cam.position.y, cam.position.z]),
    };
  }

  /**
   * **저장된 자세로 되돌아간다**(§9.2 뷰 전환). `pose()`의 정확한 역이다 —
   * `conv`가 자기 역이므로 부호만 되돌리면 된다.
   *
   * 물려 있던 상태를 먼저 푼다. 궤도 중심은 호출자가 준다(3D 레이어의 무게중심).
   */
  setPose(p: ViewPose, target: Vec3 | null): void {
    this.unpin(target);
    const cam = this.viewport.camera;
    const X = conv(p.R[0]), Y = neg(conv(p.R[1])), Z = neg(conv(p.R[2]));
    const C = conv(p.C);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z));
    cam.quaternion.setFromRotationMatrix(m);
    cam.position.set(C[0], C[1], C[2]);
    cam.updateMatrixWorld(true);
    this.viewport.controls.update();
    this.viewport.invalidate();
  }

  /** 3D 레이어를 통째로 다시 만든다. 선분 수가 적으므로 차분 갱신을 하지 않는다(A-3). */
  setSegments(list: StageSeg[]): void {
    this.segs.clear();
    this.lineGeom?.dispose();
    this.lineGeom = null;
    if (!list.length) { this.viewport.invalidate(); return; }
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (const s of list) {
      c.set(typeof s.axis === "number" ? AXIS_COLOR[s.axis] : "#444");
      pos.push(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    this.lineGeom = g;
    this.segs.add(new THREE.LineSegments(g,
      new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 })));
    this.viewport.invalidate();
  }

  /** 3D 레이어의 무게중심 — 궤도 회전의 중심으로 쓴다. 비었으면 `null`. */
  centroid(list: StageSeg[]): Vec3 | null {
    if (!list.length) return null;
    let x = 0, y = 0, z = 0;
    for (const s of list) {
      x += s.a[0] + s.b[0]; y += s.a[1] + s.b[1]; z += s.a[2] + s.b[2];
    }
    const n = list.length * 2;
    return [x / n, y / n, z / n];
  }

  dispose(): void { this.viewport.dispose(); }
}
