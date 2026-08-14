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

export class Viewport {
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();          // 카메라 좌표계 → three 좌표계 변환을 담는 곳
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private dirty = true;
  private disposed = false;
  private ro?: ResizeObserver;

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
