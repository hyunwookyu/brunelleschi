// V-2 뷰어 데모 — IR → 씬 렌더(confidence 톤 §3.5, hint 판정 D). 지시서 V-2.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { emptyIR } from "./parser/types.js";
import type { Volume } from "./parser/types.js";
import type { Hint } from "./parser/tentative.js";
import { buildScene } from "./scene/sceneBuilder.js";
import { SceneManager } from "./scene/threeAdapter.js";

function vol(id: string, x: number, conf: number, label: string): Volume {
  return { id, footprint: [[x, 0], [x + 120, 0], [x + 120, 90], [x, 90]], base: 0, height: null, height_src: "unset", confidence: conf, label };
}

// 데모 IR: confidence 3단(불투명/반투명/와이어) + tentative hint(파선상자)
const ir = emptyIR();
ir.volumes.push(vol("v1", 0, 0.9, "hall"), vol("v2", 160, 0.65, "lobby"), vol("v3", 320, 0.42, "stair"));
const hints: Hint[] = [{ id: "hint_1", bbox: [[0, 130], [120, 130], [120, 220], [0, 220]], n_strokes: 1, n_pts: 40, confidence: 0.3, parseable: false }];

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.setClearColor(0xf6f6f6);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(120, 300, 200); scene.add(dir);
const grid = new THREE.GridHelper(1200, 24, 0xcccccc, 0xe8e8e8); grid.position.y = 0; scene.add(grid);

const camera = new THREE.PerspectiveCamera(50, app.clientWidth / app.clientHeight, 1, 5000);
const HOME = new THREE.Vector3(220, 320, 520);
camera.position.copy(HOME);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(220, 40, -120); controls.update();

const mgr = new SceneManager(scene);
mgr.apply(buildScene(ir, hints));
document.getElementById("stat")!.textContent =
  `volumes ${ir.volumes.length} (conf 0.9/0.65/0.42 → 불투명/반투명/와이어) · hint 1(파선) · 오브젝트 ${mgr.count()}`;

// §3.3 버튼
(document.getElementById("home") as HTMLButtonElement).onclick = () => { camera.position.copy(HOME); controls.target.set(220, 40, -120); controls.update(); };
(document.getElementById("top") as HTMLButtonElement).onclick = () => { camera.position.set(220, 700, -120); controls.target.set(220, 0, -120); controls.update(); };

addEventListener("resize", () => {
  renderer.setSize(app.clientWidth, app.clientHeight);
  camera.aspect = app.clientWidth / app.clientHeight; camera.updateProjectionMatrix();
});
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

// 검증용 노출 — 픽셀 리드백으로 실제 렌더 확인(디스플레이 불요)
(window as any).__viewer = { renderer, scene, camera, mgr,
  renderAt(w: number, h: number) {
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const gl = renderer.getContext(); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBg = 0; for (let i = 0; i < px.length; i += 4) { if (Math.abs(px[i] - 246) + Math.abs(px[i + 1] - 246) + Math.abs(px[i + 2] - 246) > 24) nonBg++; }
    return { nonBackgroundPixels: nonBg, total: w * h };
  } };
