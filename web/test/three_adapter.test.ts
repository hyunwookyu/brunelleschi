// V-2 렌더 어댑터 (node-safe 기하) — 압출·재질·씬매니저 diff/dispose. WebGL 불요.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { emptyIR } from "../src/parser/types.js";
import type { Volume } from "../src/parser/types.js";
import { buildScene } from "../src/scene/sceneBuilder.js";
import { objectFromSpec, SceneManager } from "../src/scene/threeAdapter.js";

function vol(id: string, conf: number): Volume {
  return { id, footprint: [[0, 0], [100, 0], [100, 60], [0, 60]], base: 0, height: 40, height_src: "unset", confidence: conf, label: "x" };
}

describe("V-2 Three 어댑터", () => {
  it("볼륨 스펙 → 압출 지오메트리(정점 있음) + 그룹", () => {
    const [spec] = buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] });
    const o = objectFromSpec(spec, 0) as THREE.Group;
    expect(o.name).toBe("v1");
    const mesh = o.children.find(c => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(mesh).toBeTruthy();
    expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(8);
  });

  it("confidence → 재질 모드(불투명/반투명/와이어)", () => {
    const opaque = objectFromSpec(buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] })[0]) as THREE.Group;
    const wire = objectFromSpec(buildScene({ ...emptyIR(), volumes: [vol("v2", 0.3)] })[0]) as THREE.Group;
    const om = (opaque.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const wm = (wire.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(om.opacity).toBe(1);
    expect((wm as any).wireframe).toBe(true);
  });

  it("SceneManager diff — 추가/삭제 시 오브젝트 수 = 스펙 수(누수 없음)", () => {
    const scene = new THREE.Scene();
    const mgr = new SceneManager(scene);
    mgr.apply(buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9), vol("v2", 0.9)] }));
    expect(mgr.count()).toBe(2);
    mgr.apply(buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] }));   // v2 삭제
    expect(mgr.count()).toBe(1);
    expect(scene.children.filter(c => c.name === "v2").length).toBe(0);   // dispose+remove
  });
});

// 지시 3.4 — kind=room은 안쪽 면(BackSide)으로 렌더해 매스와 구분한다.
describe("3.4 매스/실내 렌더 구분", () => {
  it("room은 BackSide, mass는 DoubleSide", () => {
    const room = { ...vol("r1", 0.9), kind: "room" as const };
    const mass = { ...vol("m1", 0.9), kind: "mass" as const };
    const ro = objectFromSpec(buildScene({ ...emptyIR(), volumes: [room] })[0]) as THREE.Group;
    const mo = objectFromSpec(buildScene({ ...emptyIR(), volumes: [mass] })[0]) as THREE.Group;
    const rm = (ro.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const mm = (mo.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(rm.side).toBe(THREE.BackSide);
    expect(mm.side).toBe(THREE.DoubleSide);
    expect(ro.userData.volumeKind).toBe("room");
  });

  it("kind 미지정은 mass로 취급(기존 동작 보존)", () => {
    const o = objectFromSpec(buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] })[0]) as THREE.Group;
    expect(o.userData.volumeKind).toBe("mass");
  });

  it("kind 변경이 씬 diff에 잡힌다(재질이 바뀌므로)", () => {
    const scene = new THREE.Scene();
    const mgr = new SceneManager(scene);
    mgr.apply(buildScene({ ...emptyIR(), volumes: [{ ...vol("v1", 0.9), kind: "mass" as const }] }));
    const d = mgr.apply(buildScene({ ...emptyIR(), volumes: [{ ...vol("v1", 0.9), kind: "room" as const }] }));
    expect(d.updated.length).toBe(1);
  });
});
