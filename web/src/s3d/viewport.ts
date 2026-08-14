// S-0 3D 뷰포트 — three.js 씬 셸.
//
// **온디맨드 렌더링**(dirty flag). 스케치 도구는 대부분의 시간을 가만히 있으므로
// 매 프레임 도는 루프는 배터리만 쓴다. 무언가 바뀐 프레임만 그린다.
//
// 좌표계: 카메라 좌표계를 그대로 쓴다. z가 화면 안쪽(+), y가 아래(+) —
// `s3d/geom3d.ts`의 `rayThrough`와 같은 규약이다. three.js는 y가 위(+)이므로
// 씬 루트를 x축 180° 돌려 맞춘다. **한 군데서만 뒤집는다** — 두 규약이 코드 곳곳에
// 섞이면 부호를 언제 뒤집었는지 아무도 모르게 된다.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vec3 } from "./geom3d.js";
import { fFromFov, type ViewPose } from "./viewCamera.js";

export class Viewport {
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();          // 카메라 좌표계 → three 좌표계 변환을 담는 곳
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private dirty = true;
  private disposed = false;
  private ro?: ResizeObserver;
  /** 사용자가 직접 궤도를 돌렸는가. 돌렸으면 자동 맞춤이 시점을 빼앗지 않는다. */
  userMoved = false;

  constructor(readonly host: HTMLElement) {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0xf2f4f6, 1);
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
    this.camera.position.set(3.2, 2.4, 3.6);

    // 카메라 좌표계(y 아래, z 안쪽) → three(y 위, z 앞) : x축 180° 회전
    this.world.rotation.x = Math.PI;
    this.scene.add(this.world);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 3);
    this.scene.add(key);

    const grid = new THREE.GridHelper(10, 20, 0xc4ccd2, 0xe0e6ea);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.scene.add(grid);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener("change", () => this.invalidate());
    // 사용자가 한 번이라도 직접 돌렸으면 그 시점을 빼앗지 않는다(자동 맞춤을 멈춘다).
    this.controls.addEventListener("start", () => { this.userMoved = true; });

    // 생성 시점에는 레이아웃이 아직 안 잡혀 있을 수 있다(실제로 캔버스가 1×24로 잡혔다).
    // 창 resize만 듣고 있으면 그 상태로 굳는다 — 호스트 자체를 관찰한다.
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    requestAnimationFrame(() => this.resize());

    this.loop();
  }

  /** 무언가 바뀌었다 — 다음 프레임에 한 번 그린다. */
  invalidate() { this.dirty = true; }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** 카메라 좌표계 점을 three 오브젝트 좌표로. `world` 그룹 안에 넣을 때 쓴다. */
  static toThree(p: Vec3): THREE.Vector3 { return new THREE.Vector3(p[0], p[1], p[2]); }

  /**
   * **현재 시점의 자세를 우리 규약으로 낸다**(S-5). `p_view = R·(p_world − C)`.
   *
   * `world` 그룹이 x축 180°로 돌아 있으므로(y 아래·z 안쪽 → three의 y 위·z 앞) 그 뒤집기를
   * 양쪽에서 되돌린다. `M = diag(1,−1,−1)`이라 하면 `R = M·Rc^T·M`, `C = M·Cthree`다.
   * **뒤집기는 여기 한 군데서만 한다** — S-0이 정한 규칙이고, 두 규약이 섞이면 부호를
   * 언제 뒤집었는지 아무도 모르게 된다.
   */
  pose(): ViewPose {
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const e = m.elements;                       // 열 우선. Rc의 열이 카메라 축(세계 좌표)
    // Rc^T의 행 = Rc의 열 = (e0,e1,e2), (e4,e5,e6), (e8,e9,e10)
    const flip = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];
    const rows: [Vec3, Vec3, Vec3] = [
      flip([e[0], e[1], e[2]]),                 // 오른쪽
      flip([e[4], e[5], e[6]]),                 // 위 → 뒤집어 아래
      flip([e[8], e[9], e[10]]),                // 뒤 → 뒤집어 앞
    ];
    // M·Rc^T·M : 행을 뒤집고(위), 각 행의 성분도 뒤집는다(아래)
    const R: [Vec3, Vec3, Vec3] = [rows[0], [-rows[1][0], -rows[1][1], -rows[1][2]],
                                   [-rows[2][0], -rows[2][1], -rows[2][2]]];
    const c = this.camera.position;
    return { R, C: [c.x, -c.y, -c.z] };
  }

  /** 현재 시점의 초점거리(px)와 화면 크기 — `viewPlaceCtx`가 쓴다. */
  viewSize(): [number, number] {
    const el = this.renderer.domElement;
    return [Math.max(1, el.clientWidth), Math.max(1, el.clientHeight)];
  }
  viewF(): number { return fFromFov(this.camera.fov, this.viewSize()[1]); }

  /** 그린 것 전부가 화면에 들어오도록 시점을 맞춘다. */
  frameAll(padding = 1.6) {
    const box = new THREE.Box3().setFromObject(this.world);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(1e-3, box.getSize(new THREE.Vector3()).length() * 0.5);
    const dist = (r * padding) / Math.tan((this.camera.fov * Math.PI) / 360);
    const dir = new THREE.Vector3(0.6, 0.5, 0.65).normalize();
    this.camera.position.copy(c.clone().addScaledVector(dir, dist));
    this.controls.target.copy(c);
    this.controls.update();
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    this.ro?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    if (this.controls.enableDamping) {
      // 감쇠가 도는 동안에는 계속 그려야 한다. update()는 바뀌었으면 true를 준다.
      if (this.controls.update()) this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };
}
