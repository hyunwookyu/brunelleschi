// V-4 3D 뷰어 — Three.js 렌더 루프 + 볼륨 픽(레이캐스트) + 카메라 조작(§3.3, 마우스 1급).
// 렌더 완료(rAF 콜백)까지의 end-to-end 지연 훅 포함(판정 A). main.ts(V-2 데모) 계승·확장.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshSpec } from "../scene/sceneBuilder.js";
import { SceneManager } from "../scene/threeAdapter.js";

export interface PendingMeasure { t0: number; resolve?: (ms: number) => void; }

export class Viewer {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly mgr: SceneManager;
  private home = new THREE.Vector3(220, 320, 520);
  private target = new THREE.Vector3(220, 40, -120);
  private pending: PendingMeasure | null = null;
  private raycaster = new THREE.Raycaster();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.setClearColor(0xf6f6f6);
    host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(120, 300, 200); this.scene.add(dir);
    this.scene.add(new THREE.GridHelper(1200, 24, 0xcccccc, 0xe8e8e8));

    this.camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 1, 5000);
    this.camera.position.copy(this.home);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.target); this.controls.update();

    this.mgr = new SceneManager(this.scene);
    this.loop();
  }

  apply(specs: MeshSpec[]) { return this.mgr.apply(specs); }
  objectCount() { return this.mgr.count(); }

  // §3.3 카메라 버튼
  goHome() { this.camera.position.copy(this.home); this.controls.target.copy(this.target); this.controls.update(); }
  goTop() { this.camera.position.set(this.target.x, 700, this.target.z); this.controls.target.set(this.target.x, 0, this.target.z); this.controls.update(); }

  // 다음 렌더 후 (t0 → 렌더완료) 지연 측정. 판정 A end-to-end(rAF 콜백 시점).
  measureNextRender(t0: number): Promise<number> {
    return new Promise(res => { this.pending = { t0, resolve: res }; });
  }

  // 동기 렌더+측정 — rAF 스케줄 대기를 제외한 (파서→씬→GPU 렌더 완료) 지연.
  // 벤치가 백그라운드(rAF 정지)에서도 GPU 포함 실측하도록. rAF 몫(≤1프레임)은 §8 별도 계상.
  renderAndMeasureSync(t0: number): number {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.renderer.getContext().finish();
    return performance.now() - t0;
  }

  // 벤치용 고정 렌더 크기(host가 0×0인 비표시 상태 대비).
  forceSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  // 화면 좌표(px, host 기준) → 최상위 볼륨 그룹 id(라벨 픽).
  pick(px: number, py: number): string | null {
    this.camera.updateMatrixWorld();   // 렌더 루프 무관하게 최신 행렬(비표시 탭 대비)
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px) / rect.width) * 2 - 1, -((py) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) { if (o.userData?.kind === "volume") return o.name; o = o.parent; }
    }
    return null;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.pending) {
      // GPU 플러시까지 포함해 정직하게 측정(rAF 콜백 시점).
      this.renderer.getContext().finish();
      const ms = performance.now() - this.pending.t0;
      this.pending.resolve?.(ms);
      this.pending = null;
    }
  };

  // 검증용 픽셀 리드백(비배경 픽셀 수) — 실제 렌더 확인.
  nonBackgroundPixels(): number {
    const gl = this.renderer.getContext();
    const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - 246) + Math.abs(px[i + 1] - 246) + Math.abs(px[i + 2] - 246) > 24) n++;
    }
    return n;
  }
}
