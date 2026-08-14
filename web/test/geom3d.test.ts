// S-0 3D 기하 — **화면 점 하나 → 3D 점 하나**가 성립하는지.
//
// 이 방식 전체가 여기 걸려 있다(계획서 §1). 폐기한 `wire/model.ts`에서 구제한
// 함수들이므로 테스트도 함께 다시 세운다 — 모듈을 지우면서 테스트도 지웠다.
import { describe, it, expect } from "vitest";
import {
  closestPoints, meetPoint, rayThrough, project, axisDirection, rayPlane,
  angleBetween, unit3, sub3, norm3, cross3, type Vec3,
} from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const PP: Pt2 = [480, 336];
const F = 1100;

/** 3D 방향 → 그 방향의 소실점. z>0이어야 화면에 찍힌다. */
const vpOf = (d: Vec3): Pt2 => [PP[0] + (d[0] * F) / d[2], PP[1] + (d[1] * F) / d[2]];

/**
 * 정확히 직교하는 축 셋 = 회전행렬의 열. 요와 피치를 **둘 다** 준다.
 * 카메라가 기울지 않으면 수직축의 소실점이 무한원이라(2.2 c=0) 3점 투시가 안 된다.
 */
function orthoAxes(yaw = 0.6, pitch = 0.35): [Vec3, Vec3, Vec3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const X: Vec3 = [cy, sp * sy, -cp * sy];
  const Y: Vec3 = [0, cp, sp];
  const Z: Vec3 = [sy, -sp * cy, cp * cy];
  const fix = (v: Vec3): Vec3 => (v[2] > 0 ? v : [-v[0], -v[1], -v[2]]);
  return [fix(X), fix(Y), fix(Z)];
}

describe("S-0 광선-직선 최근접점", () => {
  it("만나는 두 직선에서는 gap이 0이고 교점이 나온다", () => {
    const c = closestPoints([0, 0, 0], [1, 0, 1], [2, 0, 0], [0, 0, 1]);
    expect(c.gap).toBeLessThan(1e-9);
    expect(meetPoint(c)[0]).toBeCloseTo(2, 9);
  });

  it("어긋난 두 직선에서도 답이 하나 나온다 — 실패 모드가 온건하다", () => {
    const c = closestPoints([0, 0, 0], [0, 0, 1], [1, 0, 5], [0, 1, 0]);
    expect(c.parallel).toBe(false);
    expect(c.gap).toBeCloseTo(1, 9);
    expect(meetPoint(c)[2]).toBeCloseTo(5, 9);
  });

  it("평행하면 그렇다고 말한다 — 조용히 아무 값이나 주지 않는다", () => {
    expect(closestPoints([0, 0, 0], [0, 0, 1], [3, 0, 0], [0, 0, 1]).parallel).toBe(true);
  });
});

describe("S-0 커서 한 점 → 3D 한 점 (§1의 핵심 주장)", () => {
  it("정답을 아는 상자를 투영했다가 되찾으면 원래 자리로 돌아온다", () => {
    const ax = orthoAxes();
    expect(angleBetween(ax[0], ax[1])).toBeCloseTo(90, 6);
    expect(angleBetween(ax[1], ax[2])).toBeCloseTo(90, 6);
    const vps = ax.map(vpOf);

    const O: Vec3 = [-0.4, 0.55, 3.2];
    for (let i = 0; i < 3; i++) {
      for (const L of [0.6, 1.1]) {
        const truth: Vec3 = [O[0] + ax[i][0] * L, O[1] + ax[i][1] * L, O[2] + ax[i][2] * L];
        const target = project(truth, PP, F)!;
        // 화면 점 → 광선, 축 → 3D 직선, 최근접점이 원래 점이어야 한다
        const c = closestPoints([0, 0, 0], rayThrough(target, PP, F), O, axisDirection(vps[i], PP, F));
        expect(norm3(sub3(meetPoint(c), truth))).toBeLessThan(1e-6);
      }
    }
  });

  it("투영과 역투영이 왕복한다 — 화면 좌표가 그대로 돌아온다", () => {
    const p: Vec3 = [0.7, -0.3, 2.4];
    const s = project(p, PP, F)!;
    const r = rayThrough(s, PP, F);
    // 광선을 같은 깊이까지 늘리면 원래 점이다
    const k = p[2] / r[2];
    expect(norm3(sub3([r[0] * k, r[1] * k, r[2] * k], p))).toBeLessThan(1e-9);
  });

  it("반례: 카메라 뒤 점은 투영되지 않는다 — null로 말한다", () => {
    expect(project([1, 1, -2], PP, F)).toBeNull();
    expect(project([1, 1, 0], PP, F)).toBeNull();
  });

  it("소실점은 그 방향으로 무한히 간 점의 상이다 (2.2)", () => {
    const d = unit3([0.6, -0.2, 1]);
    const vp = vpOf(d);
    expect(angleBetween(axisDirection(vp, PP, F), d)).toBeLessThan(1e-6);
    const far = project([d[0] * 1e6, d[1] * 1e6, d[2] * 1e6], PP, F)!;
    expect(Math.hypot(far[0] - vp[0], far[1] - vp[1])).toBeLessThan(1e-6);
  });

  it("반례: 광선 방향은 화면 점마다 다르다 — 상수가 아니다", () => {
    expect(angleBetween(rayThrough([100, 200], PP, F), rayThrough([800, 500], PP, F)))
      .toBeGreaterThan(10);
  });
});

describe("S-0 광선-평면 (§4.3 면 위 사선)", () => {
  it("면이 있으면 축을 몰라도 화면 점 하나가 3D 점 하나를 정한다", () => {
    // 세 점으로 평면을 만든다
    const a: Vec3 = [0, 1, 3], b: Vec3 = [1, 1, 3.4], c: Vec3 = [0, 0.2, 3.2];
    const n = unit3(cross3(sub3(b, a), sub3(c, a)));
    const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    // 그 평면 위 임의의 점을 투영했다가 되찾는다
    const truth: Vec3 = [
      a[0] + 0.4 * (b[0] - a[0]) + 0.3 * (c[0] - a[0]),
      a[1] + 0.4 * (b[1] - a[1]) + 0.3 * (c[1] - a[1]),
      a[2] + 0.4 * (b[2] - a[2]) + 0.3 * (c[2] - a[2]),
    ];
    const s = project(truth, PP, F)!;
    const back = rayPlane([0, 0, 0], rayThrough(s, PP, F), n, d)!;
    expect(norm3(sub3(back, truth))).toBeLessThan(1e-9);
  });

  it("반례: 평면과 나란한 광선은 만나지 않는다 — null", () => {
    expect(rayPlane([0, 0, 0], [1, 0, 0], [0, 0, 1], 5)).toBeNull();
    // 카메라 뒤쪽 평면도 null (t ≤ 0)
    expect(rayPlane([0, 0, 0], [0, 0, 1], [0, 0, 1], -5)).toBeNull();
  });
});
