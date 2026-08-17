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
// **화면 고정 굵기 선**(2026-08-17 지시 4). 튜브 메쉬는 3D 형상이라 거리에 따라 가늘어지고,
// `LineBasicMaterial`의 `linewidth`는 WebGL에서 무시된다(항상 1px — 굵기 위계를 못 만든다).
// three 예제의 `Line2` 계열이 화면 픽셀 단위 굵기를 낸다 — 카메라가 서는 순간 굵기가 변하면
// 그것이 전환 신호가 되므로, 선의 화면 굵기는 거리와 무관해야 한다.
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Viewport } from "../s3d/viewport.js";
import { threeIntrinsics, applyIntrinsics, applyFreeAspect,
         type CameraLike } from "../s3d/sceneCam.js";
import type { Pt2 } from "../s3d/camera.js";
import type { Vec3 } from "../s3d/geom3d.js";
import type { Axis } from "../s3d/axis.js";
import type { ViewPose } from "../s3d/viewCamera.js";

/** 3D 레이어에 그릴 선분 하나. 프리핸드를 미뤘으므로 획 하나가 선분 하나다(§1.1). */
export interface StageSeg {
  id: string; a: Vec3; b: Vec3; axis: Axis;
  /** **펜 채널**(2026-08-17 D). 없으면 보조선으로 본다(옛 저장본·옛 하네스). */
  channel?: "guide" | "result" | "note";
}

/**
 * **채널별 3D 표시**(D-3 · E). 네 단계 중 위 둘이 여기 있다 — 결과선이 **결과물**이므로
 * 가장 진하고, 보조선은 그 아래다. **돌리면 보조선이 자동으로 흐려진다**(E) —
 * 확정 시점에서는 잉크와 겹쳐 보이므로 구분이 덜 필요하지만, 돌린 뒤에는 결과물만
 * 보이는 것이 맞다.
 *
 * ⚠⚠ **축 색을 3D 층에서 뺐다**(2026-08-17 지시 5-7): "축 색은 그리는 중 미리보기에만 쓴다."
 * 옛 판은 결과선까지 축 색이라 결과물이 빨강·초록으로 보였다 — 색의 위계가 뒤집혀 있었다.
 * 지금은 **채널이 색을 정한다**: 결과선 검정 · 보조선 진한 무채 실선.
 */
/**
 * **채널별 화면 굵기(px)**(지시 4 — "얇게 한다" · **4차 지시 8이 더 줄였다**).
 * 거리·확대와 무관한 화면 픽셀이다. 지시 8: "화면 픽셀 기준 1~1.5px 정도. 결과선과 보조선의
 * 굵기 차이는 최소로 — 색과 톤으로 갈리면 된다"(위계는 `CHANNEL_3D`의 색·불투명도가 든다).
 * 옛 값 2.2/1.4 → **1.5/1.3**.
 * ⚠ 표시 상수라 `test/constants.ts`에 안 넣는다(D-L49의 예외와 같은 자리 — 어느 하네스도 안 읽는다).
 */
export const LINE_PX = { result: 1.5, guide: 1.3 } as const;

export const CHANNEL_3D = {
  result: { opacity: 1, color: "#111111" },
  /**
   * 돌리면 `orbit`으로 바뀐다(E: "기본 켬, 돌리면 자동으로 흐려진다").
   *
   * ⚠⚠ **처음 고른 값(0.55/0.45 · 0.2/0.75)은 너무 옅었다** — 기본 채널이 보조선이므로
   * 갓 그린 그림은 **전부 보조선**이고, 돌리면 화면이 **통째로 비었다**(종단 확인이
   * `gl_painted_px = 0`으로 잡았다). 흐림은 **약하게 하는 것**이지 **없애는 것**이 아니다.
   */
  guide: { opacity: 0.75, color: "#4a4a4a" },
  guide_orbit: { opacity: 0.5, color: "#4a4a4a" },
} as const;

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
  /**
   * **자유 시점이 이어받은 내적 파라미터**(7차 항목 1 — "궤도가 확정 카메라에서 출발한다").
   *
   * ⚠ 옛 판은 `unpin`이 투영을 `FREE_FOV_DEG`(45°·중심 주점)로 갈아 끼웠다 — 확정 카메라의
   * 주점은 지평선 높이(`[W/2, horizon y]`)이고 f도 소실점이 정한 값이라, 궤도를 시작하는
   * 순간 **화면이 다른 렌즈로 점프**했다("손으로 돌리면 다른 카메라로 전환"의 실체).
   * 자세는 이어받으면서 렌즈만 바꿀 이유가 없다 — SketchUp도 궤도 진입에서 렌즈를 유지한다.
   * 확정 카메라 없이 자유 시점이 된 적이 없으면 `null`이고 그때만 `FREE_FOV_DEG`가 쓰인다.
   * `frame()`(mainL)이 `freeIntrinsics()`로 **같은 값**을 읽는다(#17 — 렌더와 배치가 한 출처).
   */
  private freeIntr: { principal: Pt2; f: number } | null = null;
  private segs = new THREE.Group();
  /** 만들어 둔 재질·기하 — 굵기 셰이더가 화면 크기를 알아야 하므로 크기 변화 때 갱신한다. */
  private lineMats: LineMaterial[] = [];
  private lineGeoms: LineSegmentsGeometry[] = [];

  constructor(readonly host: HTMLElement) {
    this.viewport = new Viewport(host);
    this.viewport.grid.visible = false;         // 투시 그리드는 2D 층이 그린다
    this.viewport.controls.enabled = false;     // 확정 전에는 돌릴 3D가 없다
    this.viewport.world.add(this.segs);
    this.viewport.renderer.setClearColor(0xffffff, 1);
    // **화면 굵기의 기준 크기**(#21·#22): `LineMaterial.resolution`이 낡으면 굵기가 어긋난다.
    // 창 크기 갱신은 `projectionHook`이 아니라 여기서 받는다 — 훅은 핀 상태마다 갈아 끼워진다.
    this.viewport.onResize = (size) => {
      for (const m of this.lineMats) m.resolution.set(size[0], size[1]);
    };
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
    this.freeIntr = null;               // 핀이 내적 파라미터를 들고 있다 — 낡은 값을 안 남긴다
    const cam = this.viewport.camera;
    cam.position.set(0, 0, 0);
    cam.quaternion.identity();
    cam.updateMatrixWorld(true);
    this.viewport.controls.enabled = false;
    this.viewport.projectionHook = (size) =>
      applyIntrinsics(cam as unknown as CameraLike, threeIntrinsics(principal, f, size));
    this.viewport.projectionHook(this.size());
    this.redrawChannels();               // **보조선의 흐림이 핀 상태로 갈린다**(E)
    this.viewport.invalidate();
  }

  /**
   * **궤도 중심을 현재 시선 위로 놓는다**(5차 지시 2-a). 원하는 중심(경계 상자 중심)을
   * 지금 카메라의 시선에 **수직 투영**한 점을 target으로 한다 — target을 그 점 그대로 놓으면
   * `OrbitControls.update()`가 카메라를 그 점으로 다시 겨눠 **첫 프레임이 튄다.**
   * `setPose`가 §9.2 왕복에서 쓰는 같은 규약이다(target이 시선 위면 update가 항등이다).
   * 중심이 시선 뒤(투영 ≤ 0)면 지금 거리를 유지한다 — 어느 경우에도 시선은 안 바뀐다.
   */
  retarget(center: Vec3 | null): void {
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const tgt = this.viewport.controls.target;
    let d = tgt.distanceTo(cam.position);
    if (center) {
      // 우리 규약(y 아래·z 안쪽) → three(y 위·z 앞). 뒤집기는 `viewport.ts` 규약 그대로다.
      const c3 = new THREE.Vector3(center[0], -center[1], -center[2]);
      const proj = c3.sub(cam.position).dot(fwd);
      if (proj > 1e-3) d = proj;
    }
    tgt.copy(cam.position).addScaledVector(fwd, Math.max(1e-3, d));
  }

  /** 진행 중인 시점 비행의 취소 토큰(5차 지시 7-1b). */
  private flySeq = 0;

  /**
   * **시점으로 날아간다**(5차 지시 7-1b — 라이노 명명된 뷰의 복귀 애니메이션).
   * 위치는 lerp·방향은 slerp로 280ms. 목표가 확정 시점(pose null)이면 항등 자세로 날고
   * 끝에서 호출자가 pinTo로 마무리한다(투영 전환은 비행 양 끝에서 한 번씩 — 중간 프레임은
   * 자유 화각으로 난다. 라이노도 렌즈는 끝에서 맞춘다).
   */
  flyTo(pose: ViewPose | null, ms: number, onDone: () => void): void {
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
    let p1 = new THREE.Vector3(0, 0, 0), q1 = new THREE.Quaternion();
    if (pose) {
      const X = conv(pose.R[0]), Y = neg(conv(pose.R[1])), Z = neg(conv(pose.R[2]));
      const C = conv(pose.C);
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z));
      q1.setFromRotationMatrix(m);
      p1 = new THREE.Vector3(C[0], C[1], C[2]);
    }
    // 물려 있으면 비행 전에 자유 투영으로 — 핀 투영은 자세 항등을 전제한다.
    // **렌즈는 이어받는다**(7차 항목 1) — 갈아 끼우면 비행 첫 프레임에 화면이 점프한다
    if (this.pinned) {
      this.freeIntr = this.pinned;
      this.pinned = null;
      this.applyFreeProjection();
      this.viewport.controls.enabled = true;
    }
    const seq = ++this.flySeq;
    const t0 = performance.now();
    const ease = (t: number) => t * t * (3 - 2 * t);           // smoothstep
    const step = () => {
      if (seq !== this.flySeq) return;                          // 새 비행이 시작됐다
      const t = Math.min(1, (performance.now() - t0) / ms);
      const k = ease(t);
      cam.position.lerpVectors(p0, p1, k);
      cam.quaternion.slerpQuaternions(q0, q1, k);
      cam.updateMatrixWorld(true);
      this.viewport.invalidate();
      if (t < 1) requestAnimationFrame(step);
      else onDone();
    };
    requestAnimationFrame(step);
  }

  /**
   * **수직축 고정 회전**(5차 지시 8-b — 뷰 큐브). 카메라를 수직축(three Y — 우리 수직축)
   * 둘레로 `deltaRad`만큼 돌린다. 피치는 정의상 유지된다(축이 수직이므로 극각 불변) —
   * 1점에서 90° 돌리면 여전히 1점이고 소실점만 옮겨 간다. 회전 중심은 항목 2와 같다
   * (경계 상자 중심 — unpin/retarget이 시선 투영으로 놓는다). `ms > 0`이면 애니메이션.
   */
  spinYaw(deltaRad: number, center: Vec3 | null, ms = 0, onDone?: () => void): void {
    const cam = this.viewport.camera;
    if (this.pinned) this.unpin(center);
    else this.retarget(center);
    cam.updateMatrixWorld(true);
    const c3 = this.viewport.controls.target.clone();   // retarget이 시선 위에 놓은 중심
    const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
    const t0 = this.viewport.controls.target.clone();
    const Y = new THREE.Vector3(0, 1, 0);
    const rot = (th: number) => {
      const R = new THREE.Quaternion().setFromAxisAngle(Y, th);
      cam.position.copy(p0.clone().sub(c3).applyQuaternion(R).add(c3));
      cam.quaternion.copy(R.clone().multiply(q0));
      this.viewport.controls.target.copy(t0.clone().sub(c3).applyQuaternion(R).add(c3));
      cam.updateMatrixWorld(true);
      this.viewport.invalidate();
    };
    if (ms <= 0) { rot(deltaRad); onDone?.(); return; }
    const seq = ++this.flySeq;
    const t0ms = performance.now();
    const ease = (t: number) => t * t * (3 - 2 * t);
    const step = () => {
      if (seq !== this.flySeq) return;
      const t = Math.min(1, (performance.now() - t0ms) / ms);
      rot(deltaRad * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else onDone?.();
    };
    requestAnimationFrame(step);
  }

  /** 지금 카메라의 요(수직축 둘레 방위, rad — three Y 기준)와 시선. 뷰 큐브가 읽는다. */
  yawOf(): number {
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    return Math.atan2(f.x, -f.z);
  }

  /**
   * **카메라의 세계 기저**(three 좌표 — 오른쪽·위·시선). 뷰 큐브가 큐브 자세를 그리고
   * 히트 광선을 만들 때 읽는다. 규약 변환 없이 three 그대로 낸다 — 큐브의 면 법선도
   * three 세계 축으로 적으므로 같은 좌표계 안에서 닫힌다(#24 — 프레임을 섞지 않는다).
   */
  basisOf(): { r: Vec3; u: Vec3; f: Vec3 } {
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const m = cam.matrixWorld.elements;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    return { r: [m[0], m[1], m[2]], u: [m[4], m[5], m[6]], f: [fwd.x, fwd.y, fwd.z] };
  }

  /**
   * **절대 시점으로 스냅**(6차 지시 1 — 뷰 큐브의 면·모서리·꼭짓점). 주어진 시선 방향
   * (three 좌표)으로 **궤도 중심을 향해** 날아간다 — 방향만 돌리면 그린 것이 화면 어디에
   * 오는지 예측이 안 되므로(지시 1-3) 중심을 겨누고 **거리는 유지한다**.
   *
   * 비행·마무리는 `flyTo`·`setPose` 재사용이다(#17 — 시점 복귀 280ms와 같은 경로).
   * 시선이 수직에 너무 가까우면(윗면·아랫면) 피치를 89.5°로 눌러 `OrbitControls`의
   * up=+Y 특이를 피한다 — CAD 뷰 큐브의 탑뷰도 실제로는 같은 처리를 한다.
   */
  snapToDir(fwdThree: Vec3, center: Vec3 | null, ms: number, onDone?: () => void): void {
    const cam = this.viewport.camera;
    cam.updateMatrixWorld(true);
    const c3 = center
      ? new THREE.Vector3(center[0], -center[1], -center[2])
      : this.viewport.controls.target.clone();
    const f = new THREE.Vector3(...fwdThree).normalize();
    const horiz = Math.hypot(f.x, f.z);
    const MAX_PITCH = (89.5 * Math.PI) / 180;
    if (horiz < Math.cos(MAX_PITCH)) {
      // 수직 특이 회피 — 지금 요를 유지한 채 피치만 한계로 누른다
      const yaw = this.yawOf();
      const s = f.y >= 0 ? 1 : -1;
      f.set(Math.sin(yaw) * Math.cos(MAX_PITCH), s * Math.sin(MAX_PITCH),
            -Math.cos(yaw) * Math.cos(MAX_PITCH)).normalize();
    }
    const d = Math.max(1e-3, c3.distanceTo(cam.position));
    const eye = c3.clone().addScaledVector(f, -d);
    // three 기저: right = f × y↑ (요만 있는 up 규약 — OrbitControls와 같다)
    const right = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = right.clone().cross(f).normalize();
    // three → 우리 규약(ViewPose 행 = 오른쪽·아래·앞) — pose()의 역과 같은 변환이다
    const pose: ViewPose = {
      R: [conv([right.x, right.y, right.z]),
          conv(neg([up.x, up.y, up.z])),
          conv([f.x, f.y, f.z])],
      C: conv([eye.x, eye.y, eye.z]),
    };
    const finish = () => { this.setPose(pose, center); onDone?.(); };
    if (ms <= 0) { this.flySeq++; finish(); return; }
    this.flyTo(pose, ms, finish);
  }

  /**
   * **자유 시점의 투영을 건다** — 확정 카메라에서 이어받은 내적 파라미터가 있으면 그것,
   * 없으면(확정 전 자유 시점 — 실사용에는 없다) `FREE_FOV_DEG`다. `unpin`·`flyTo`가 함께 쓴다.
   */
  private applyFreeProjection(): void {
    const cam = this.viewport.camera;
    const fi = this.freeIntr;
    this.viewport.projectionHook = fi
      ? (size) => applyIntrinsics(cam as unknown as CameraLike, threeIntrinsics(fi.principal, fi.f, size))
      : (size) => applyFreeAspect(cam as unknown as CameraLike, size, FREE_FOV_DEG);
    this.viewport.projectionHook(this.size());
  }

  /**
   * **지금 시점의 내적 파라미터**(주점·f) — 핀이든 자유든 렌더러가 실제로 쓰는 그 값이다.
   * `frame()`이 배치 문맥을 만들 때 읽는다(#17). `null`이면 `FREE_FOV_DEG`로 세운 상태다.
   */
  freeIntrinsics(): { principal: Pt2; f: number } | null {
    return this.pinned ?? this.freeIntr;
  }

  /** 확정 카메라를 벗어나 자유 시점으로. 지금 자세에서 이어 돌린다. **렌즈도 이어받는다**(7차 항목 1). */
  unpin(target: Vec3 | null): void {
    if (this.pinned) this.freeIntr = this.pinned;
    this.pinned = null;
    this.applyFreeProjection();
    // **시선 유지**(5차 지시 2-a) — 중심점만 바뀌고 카메라 위치·방향은 그대로여야
    // 첫 회전이 그리던 뷰에서 이어진다. 옛 판은 target을 중심점 그대로 놓아
    // update()가 카메라를 재조준했다 — 그것이 "회전 시 뷰가 튄다"였다.
    this.retarget(target);
    this.viewport.controls.enabled = true;
    this.viewport.controls.update();
    this.viewport.invalidate();
    this.redrawChannels();               // **돌리면 보조선이 흐려진다**(E)
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
    // ⚠ **`OrbitControls.update()`가 카메라를 자기 `target`으로 다시 겨눈다** —
    // 자세만 넣고 `target`을 안 옮기면 방향이 덮여 **왕복이 안 맞는다.** 실제로 걸렸다:
    // 뷰로 돌아가 그릴 때마다 `samePose`가 어긋나 **뷰가 하나씩 늘어났다**(L-B.8 종단 확인).
    // 그래서 `target`을 **이 자세의 시선 위**에 둔다 — 그러면 `update()`가 항등이 된다.
    // 굴림(roll)은 `OrbitControls`가 위를 +Y로 고정하므로 원래 표현할 수 없다(자세도 거기서 왔다).
    const fwd = conv(p.R[2]);                        // three 세계에서 카메라가 보는 방향
    const tgt = this.viewport.controls.target;
    const d = target ? Math.max(1e-3, Math.hypot(...(conv(target).map((v, i) => v - C[i])) as [number, number, number]))
                     : Math.max(1e-3, tgt.distanceTo(cam.position));
    tgt.set(C[0] + fwd[0] * d, C[1] + fwd[1] * d, C[2] + fwd[2] * d);
    cam.updateMatrixWorld(true);
    this.viewport.controls.update();
    cam.updateMatrixWorld(true);
    this.viewport.invalidate();
  }

  /** 3D 레이어를 통째로 다시 만든다. 선분 수가 적으므로 차분 갱신을 하지 않는다(A-3). */
  /** 마지막으로 넣은 목록 — **돌리면 보조선을 흐리게 다시 그려야 한다**(E). */
  private lastSegs: StageSeg[] = [];

  setSegments(list: StageSeg[]): void {
    this.lastSegs = list;
    this.segs.clear();
    for (const g of this.lineGeoms) g.dispose();
    for (const m of this.lineMats) m.dispose();
    this.lineGeoms = []; this.lineMats = [];
    if (!list.length) { this.viewport.invalidate(); return; }
    // **채널마다 재질이 다르다**(불투명도·굵기) — 한 개체로는 못 낸다.
    // 주석은 여기 안 온다(3D로 안 올라간다, D-3).
    const groups: { key: "result" | "guide"; opacity: number; color: string }[] = [
      { key: "result", ...CHANNEL_3D.result },
      { key: "guide", ...(this.isPinned ? CHANNEL_3D.guide : CHANNEL_3D.guide_orbit) },
    ];
    const c = new THREE.Color();
    const [vw, vh] = this.viewport.viewSize();
    for (const g0 of groups) {
      // **채널이 색을 정한다**(지시 5-7) — 축 색은 그리는 중 미리보기에만 쓴다
      c.set(g0.color);
      const pos: number[] = [], col: number[] = [];
      for (const s of list) {
        if ((s.channel ?? "guide") !== g0.key) continue;
        pos.push(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      if (!pos.length) continue;
      // **화면 픽셀 굵기**(지시 4) — `worldUnits: false`가 그 뜻이다. 거리에 따라 안 가늘어지므로
      // 카메라가 서는 순간 굵기가 변하지 않는다(전환 신호를 안 만든다).
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      g.setColors(col);
      const m = new LineMaterial({
        vertexColors: true, worldUnits: false, linewidth: LINE_PX[g0.key],
        transparent: g0.opacity < 1, opacity: g0.opacity,
      });
      m.resolution.set(vw, vh);
      this.lineGeoms.push(g); this.lineMats.push(m);
      const obj = new LineSegments2(g, m);
      // ⚠⚠ **결과선을 보조선 위에 그린다**(리뷰어 [2]가 잡았다). 겹쳐 그은 두 선은 깊이가
      // 같아 그리기 순서가 승부를 정하는데, 옛 순서(결과선 먼저)는 **보조선이 결과선을
      // 덮었다** — 종단 원장의 최암 60(결과선 #111=17이 아니라 보조선 #4a4a4a=74 쪽)이
      // 그 실측이다. 결과물이 위다(지시 5-7).
      obj.renderOrder = g0.key === "result" ? 2 : 1;
      this.segs.add(obj);
    }
    this.viewport.invalidate();
  }

  /** **핀 상태가 바뀌면 보조선의 흐림이 바뀐다**(E) — 같은 목록으로 다시 그린다. */
  private redrawChannels(): void {
    if (this.lastSegs.length) this.setSegments(this.lastSegs);
  }

  /**
   * **3D 레이어 경계 상자의 중심** — 궤도 회전의 중심으로 쓴다(4차 지시 7-a). 비었으면 `null`.
   *
   * ⚠ 옛 판은 **끝점 평균(무게중심)**이었다 — 짧은 선이 몰린 쪽으로 평균이 끌려, 긴 모서리
   * 하나가 있는 그림에서 회전 중심이 오브젝트 밖처럼 느껴졌다. 지시가 경계 상자 중심을
   * 명시했고 선례 확인(7-d)도 그쪽이 단순하다(SketchUp 커서 아래 기하 · 라이노 선택/뷰 중심).
   */
  centroid(list: StageSeg[]): Vec3 | null {
    if (!list.length) return null;
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const s of list) for (const p of [s.a, s.b]) for (const k of [0, 1, 2] as const) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
    return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  }

  dispose(): void { this.viewport.dispose(); }
}
