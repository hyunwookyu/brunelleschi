// V-2 실 렌더 어댑터 — MeshSpec → THREE.Object3D + SceneManager(§2.2 diff/dispose). 지시서 V-2.
import * as THREE from "three";
import type { MeshSpec } from "./sceneBuilder.js";
import { diffScene } from "./sceneDiff.js";

const PALETTE = [0x1a99aa, 0xe11d48, 0x1666cc, 0xe8800a, 0x990099, 0x00aaaa];

// footprint(스케치 x,y; y는 화면아래) → 압출. 스케치 y → 월드 -z, 높이는 +y(위).
function extrudeGeometry(fp: number[][], height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  fp.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, -y) : shape.lineTo(x, -y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);   // XY평면 도형을 XZ바닥으로, 압출축 Z→Y(위)
  return geo;
}

function volumeMaterial(spec: MeshSpec, color: number): THREE.Material {
  const m = spec.material;
  if (m.mode === "wire") return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: m.opacity });
  return new THREE.MeshStandardMaterial({
    color, transparent: m.opacity < 1, opacity: m.opacity,
    metalness: 0.0, roughness: 0.85, side: THREE.DoubleSide,
  });
}

export function objectFromSpec(spec: MeshSpec, index = 0): THREE.Object3D {
  const color = PALETTE[index % PALETTE.length];
  if (spec.kind === "hint") {
    // 표시전용 파선 상자(판정 D) — 바닥 사각형 파선 루프
    const pts = spec.footprint.map(([x, y]) => new THREE.Vector3(x, 0, -y));
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineSegments(toSegments(geo), new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.5 }));
    line.computeLineDistances();
    line.name = spec.id; line.userData.kind = "hint";
    return line;
  }
  const group = new THREE.Group();
  const geo = extrudeGeometry(spec.footprint, spec.height);
  const mesh = new THREE.Mesh(geo, volumeMaterial(spec, color));
  group.add(mesh);
  // 엣지(실선/파선은 §3.5 톤이나 여기선 실선 윤곽)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: spec.material.opacity }));
  group.add(edges);
  group.name = spec.id; group.userData = { kind: "volume", label: spec.label, dimensionless: spec.dimensionless };
  return group;
}

function toSegments(lineGeo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = lineGeo.getAttribute("position");
  const seg: number[] = [];
  for (let i = 0; i < pos.count - 1; i++) {
    seg.push(pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
}

function disposeObject(o: THREE.Object3D) {
  o.traverse(c => {
    const any = c as any;
    if (any.geometry) any.geometry.dispose();
    if (any.material) (Array.isArray(any.material) ? any.material : [any.material]).forEach((m: THREE.Material) => m.dispose());
  });
}

// §2.2 씬 매니저 — id→Object3D 유지, diff 적용(추가/변경/삭제 + dispose).
export class SceneManager {
  scene: THREE.Scene;
  private objs = new Map<string, THREE.Object3D>();
  private prev: MeshSpec[] = [];
  private order = new Map<string, number>();

  constructor(scene: THREE.Scene) { this.scene = scene; }

  apply(next: MeshSpec[]) {
    next.forEach((s, i) => { if (!this.order.has(s.id)) this.order.set(s.id, i); });
    const d = diffScene(this.prev, next);
    for (const id of d.removed) { const o = this.objs.get(id); if (o) { this.scene.remove(o); disposeObject(o); this.objs.delete(id); } }
    for (const s of d.updated) { const old = this.objs.get(s.id); if (old) { this.scene.remove(old); disposeObject(old); } const o = objectFromSpec(s, this.order.get(s.id) ?? 0); this.objs.set(s.id, o); this.scene.add(o); }
    for (const s of d.added) { const o = objectFromSpec(s, this.order.get(s.id) ?? 0); this.objs.set(s.id, o); this.scene.add(o); }
    this.prev = next;
    return d;
  }
  count() { return this.objs.size; }   // 씬 오브젝트 수 = 볼륨+hint 수 (누수 검사, §7.1)
}
