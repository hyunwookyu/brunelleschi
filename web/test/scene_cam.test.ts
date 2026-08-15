// L-B.1 — three 카메라 = 확정 투시 카메라. **불변식이지 게이트가 아니다**(PITFALLS #5).
//
// 두 계산이 같은 사영이므로 같아야 한다. 다르면 부호·규약 오류다 —
// 임계를 걸지 않고 1e-9로 본다. `viewCamera.projectInView`의 회전 판 불변식과 같은 자리다.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { threeIntrinsics, frustumOf, projectViaFrustum, applyIntrinsics,
         type CameraLike } from "../src/s3d/sceneCam.js";
import { project } from "../src/s3d/geom3d.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

/** 실제로 나올 법한 배치들 — 주점이 중심인 것, 치우친 것, **캔버스 밖인 것**. */
const CASES: { name: string; principal: Pt2; f: number; size: [number, number] }[] = [
  { name: "중심 주점", principal: [320, 240], f: 700, size: [640, 480] },
  { name: "치우친 주점", principal: [410, 190], f: 520, size: [640, 480] },
  { name: "좁은 캔버스", principal: [245, 336], f: 900, size: [490, 672] },
  { name: "주점이 캔버스 밖", principal: [-80, 300], f: 800, size: [640, 480] },
  { name: "짧은 f(광각)", principal: [300, 250], f: 260, size: [600, 500] },
];

const PTS: Vec3[] = [
  [0, 0, 1], [0.3, -0.2, 2], [-0.7, 0.55, 1.4], [1.9, 1.1, 5], [-2.2, -1.7, 0.9],
];

describe("threeIntrinsics — 주점이 중심이면 평범한 카메라로 되돌아간다", () => {
  it("offset이 0이고 큰 프레임이 캔버스와 같다", () => {
    const intr = threeIntrinsics([320, 240], 700, [640, 480]);
    expect(intr.view.offsetX).toBe(0);
    expect(intr.view.offsetY).toBe(0);
    expect(intr.view.fullWidth).toBe(640);
    expect(intr.view.fullHeight).toBe(480);
    expect(intr.aspect).toBeCloseTo(640 / 480, 12);
  });
});

describe("불변식 — 절두체 투영 = project(principal, f)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const intr = threeIntrinsics(c.principal, c.f, c.size);
      const fr = frustumOf(intr, 0.01);
      for (const p of PTS) {
        const a = project(p, c.principal, c.f)!;
        const b = projectViaFrustum(p, fr, 0.01, c.size)!;
        expect(b).not.toBeNull();
        expect(b[0]).toBeCloseTo(a[0], 9);
        expect(b[1]).toBeCloseTo(a[1], 9);
      }
    });
  }
});

describe("불변식 — three의 투영행렬이 우리 산식과 같은 픽셀을 낸다", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
      applyIntrinsics(cam as unknown as CameraLike, threeIntrinsics(c.principal, c.f, c.size));
      cam.updateMatrixWorld(true);
      for (const p of PTS) {
        // 씬은 `world` 그룹이 x축 180° 돌아 있다 — 그 뒤집기를 여기서 재현한다
        const v = new THREE.Vector3(p[0], -p[1], -p[2]).project(cam);
        const got: Pt2 = [(c.size[0] * (v.x + 1)) / 2, (c.size[1] * (1 - v.y)) / 2];
        const want = project(p, c.principal, c.f)!;
        expect(got[0]).toBeCloseTo(want[0], 6);
        expect(got[1]).toBeCloseTo(want[1], 6);
      }
    });
  }
});

describe("반례 — 규약을 어기면 실제로 어긋난다", () => {
  // 이 테스트가 없으면 위 셋은 "무엇을 해도 통과하는" 검사일 수 있다(PITFALLS #2·#5).
  it("주점 뒤집기를 빼면 픽셀이 어긋난다", () => {
    const c = CASES[1];
    // 주점을 **중심으로 착각**한 잘못된 설정
    const bad = threeIntrinsics([c.size[0] / 2, c.size[1] / 2], c.f, c.size);
    const fr = frustumOf(bad, 0.01);
    const p: Vec3 = [0.3, -0.2, 2];
    const got = projectViaFrustum(p, fr, 0.01, c.size)!;
    const want = project(p, c.principal, c.f)!;
    expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeGreaterThan(50);
  });
  it("y 부호를 안 뒤집으면 세로가 어긋난다", () => {
    const c = CASES[0];
    const intr = threeIntrinsics(c.principal, c.f, c.size);
    const fr = frustumOf(intr, 0.01);
    const p: Vec3 = [0.3, 0.9, 2];                 // y ≠ 0이어야 드러난다
    const flipped = projectViaFrustum([p[0], -p[1], p[2]], fr, 0.01, c.size)!;
    const want = project(p, c.principal, c.f)!;
    expect(Math.abs(flipped[1] - want[1])).toBeGreaterThan(100);
  });
  it("카메라 뒤의 점은 null이다 — 지어내지 않는다", () => {
    const intr = threeIntrinsics([320, 240], 700, [640, 480]);
    const fr = frustumOf(intr, 0.01);
    expect(projectViaFrustum([0.2, 0.1, -1], fr, 0.01, [640, 480])).toBeNull();
    expect(projectViaFrustum([0.2, 0.1, 0], fr, 0.01, [640, 480])).toBeNull();
  });
});
