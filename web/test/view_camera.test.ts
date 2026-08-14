// S-5 회전 후 이어 그리기 — 동작을 잠그는 테스트. 수치는 `view_measure.test.ts`가 원장에 낸다.
import { describe, it, expect } from "vitest";
import {
  viewPlaceCtx, vpOfDirection, toView, fromView, dirToView, projectInView, fFromFov,
  type ViewPose,
} from "../src/s3d/viewCamera.js";
import { axisDirection, project, norm3, sub3, unit3, cross3, dot3, mul3, type Vec3 }
  from "../src/s3d/geom3d.js";
import { scene, groundPoint, boxEdges } from "./scene3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SC = scene(35, 15);
const AXES = SC.axes as unknown as Vec3[];

/** 원래 시점 그대로인 자세 — 항등. */
const IDENTITY: ViewPose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] };

/** 세계의 `axis` 둘레로 `deg` 돌아 `centre`를 바라보는 자세. */
function orbit(centre: Vec3, axis: Vec3, deg: number, dist: number): ViewPose {
  const k = unit3(axis), th = (deg * Math.PI) / 180;
  // 시작 위치: centre에서 -z 쪽으로 dist(원래 카메라 쪽)
  const v0: Vec3 = [0, 0, -dist];
  const c = Math.cos(th), s = Math.sin(th);
  const v = ((): Vec3 => {
    const kv = cross3(k, v0);
    return [
      v0[0] * c + kv[0] * s + k[0] * dot3(k, v0) * (1 - c),
      v0[1] * c + kv[1] * s + k[1] * dot3(k, v0) * (1 - c),
      v0[2] * c + kv[2] * s + k[2] * dot3(k, v0) * (1 - c),
    ];
  })();
  const C = [centre[0] + v[0], centre[1] + v[1], centre[2] + v[2]] as Vec3;
  const fwd = unit3(sub3(centre, C));
  let right = cross3([0, 1, 0], fwd);              // y 아래가 "위"의 반대이므로 (0,1,0)이 아래
  if (norm3(right) < 1e-6) right = cross3([1, 0, 0], fwd);
  right = unit3(right);
  const down = unit3(cross3(fwd, right));
  return { R: [right, down, fwd], C };
}

describe("S-5 돌린 시점의 카메라", () => {
  it("자세가 항등이면 소실점이 원래 것과 같다 — **회귀 자물쇠**", () => {
    const f = fFromFov(45, SC.imgSize[1]);
    const principal: Pt2 = [SC.imgSize[0] / 2, SC.imgSize[1] / 2];
    for (let i = 0; i < 3; i++) {
      const d = axisDirection(SC.vps[i], SC.principal, SC.f);
      const vp = vpOfDirection(IDENTITY, d, principal, f, SC.imgSize)!;
      // 같은 방향을 같은 규약으로 투영한 것이므로 주점·f만 다르다 — 비례해서 맞아야 한다
      const expected: Pt2 = [principal[0] + (f * d[0]) / d[2], principal[1] + (f * d[1]) / d[2]];
      expect(Math.hypot(vp[0] - expected[0], vp[1] - expected[1])).toBeLessThan(1e-6);
    }
  });

  it("자세 변환이 왕복한다 — `toView`와 `fromView`가 서로의 역", () => {
    const pose = orbit([0.3, 0.8, 3], SC.axes[2], 62, 4);
    for (const p of [[0, 0, 1], [1.2, -0.4, 3.5], [-2, 1, 6]] as Vec3[]) {
      expect(norm3(sub3(fromView(pose, toView(pose, p)), p))).toBeLessThan(1e-9);
    }
  });

  it("**돌려도 축 방향은 그대로다** — 바뀌는 것은 소실점뿐이다", () => {
    const pose = orbit([0.3, 0.8, 3], SC.axes[2], 70, 4);
    const ctx0 = viewPlaceCtx(IDENTITY, AXES, SC.imgSize, 45);
    const ctx1 = viewPlaceCtx(pose, AXES, SC.imgSize, 45);
    // 소실점은 달라지고
    let moved = 0;
    for (let i = 0; i < 3; i++) {
      if (ctx0.vps[i] && ctx1.vps[i]
          && Math.hypot(ctx0.vps[i]![0] - ctx1.vps[i]![0], ctx0.vps[i]![1] - ctx1.vps[i]![1]) > 5) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    // 그 소실점에서 되읽은 방향은 **원래 축 방향과 같다**(부호 무시). 이것이 §5의 핵심이다.
    for (let i = 0; i < 3; i++) {
      const vp = ctx1.vps[i];
      if (!vp) continue;
      const back = axisDirection(vp, ctx1.principal, ctx1.f);       // 새 시점 좌표의 방향
      const truth = dirToView(pose, AXES[i]);
      const cos = Math.abs(dot3(unit3(back), unit3(truth)));
      expect(cos).toBeGreaterThan(0.9999);
    }
  });

  it("화면과 나란한 축은 **소실점이 없다**(무한원) — 지어내지 않는다", () => {
    // 축 0을 화면 평행으로 만드는 자세: 시선을 축 0에 수직으로 둔다
    const a0 = unit3(AXES[0]);
    const fwd = unit3(cross3(a0, [0, 1, 0]));
    const right = unit3(cross3([0, 1, 0], fwd));
    const down = unit3(cross3(fwd, right));
    const pose: ViewPose = { R: [right, down, fwd], C: [0, 0, 0] };
    expect(Math.abs(dirToView(pose, a0)[2])).toBeLessThan(1e-9);
    const f = fFromFov(45, SC.imgSize[1]);
    expect(vpOfDirection(pose, a0, [480, 336], f, SC.imgSize)).toBeNull();
  });

  it("소실점이 화면 밖 아주 멀면 무한원으로 본다 — `isFiniteVp`와 같은 자", () => {
    // 거의 화면 평행: z 성분을 아주 작게
    const almost: Vec3 = unit3([1, 0, 1e-4]);
    const f = fFromFov(45, SC.imgSize[1]);
    expect(vpOfDirection(IDENTITY, almost, [480, 336], f, SC.imgSize)).toBeNull();
    // 충분히 기울면 유한하다
    expect(vpOfDirection(IDENTITY, unit3([1, 0, 1]), [480, 336], f, SC.imgSize)).not.toBeNull();
  });

  it("**불변식(회전 판)**: 놓인 획을 새 시점으로 투영한 것 = 그 시점에서 본 화면 좌표", () => {
    // 두 경로가 같은 사영이므로 같아야 한다. 다르면 자세 변환이나 f 환산에 부호 오류가 있다.
    const pose = orbit([0.3, 0.8, 3], SC.axes[2], 48, 5);
    const ctx = viewPlaceCtx(pose, AXES, SC.imgSize, 45);
    const O = groundPoint(SC, [430, 470])!;
    for (const e of boxEdges(SC, O, 1.1, 0.9, 0.8)) {
      for (const p of [e.a, e.b]) {
        const a = projectInView(pose, p, ctx.principal, ctx.f);
        const b = project(toView(pose, p), ctx.principal, ctx.f);
        if (!a || !b) continue;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);
      }
    }
  });

  it("반례: 카메라 뒤로 간 점은 투영하지 않는다", () => {
    const pose: ViewPose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 10] };
    expect(projectInView(pose, [0, 0, 2], [480, 336], 800)).toBeNull();   // z_view = −8
  });

  it("뒤로 가는 축 방향도 같은 소실점을 준다 — 직선의 방향이지 반직선이 아니다", () => {
    const f = fFromFov(45, SC.imgSize[1]);
    const d: Vec3 = unit3([0.5, 0.2, 1]);
    const a = vpOfDirection(IDENTITY, d, [480, 336], f, SC.imgSize)!;
    const b = vpOfDirection(IDENTITY, mul3(d, -1), [480, 336], f, SC.imgSize)!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);
  });
});
