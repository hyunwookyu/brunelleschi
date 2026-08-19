// **교차 앵커 회귀 팔**(12차 항목 3-a). 실획 파일 1(사람 보고 — 파일은 저장소에 없다)의
// 실측: 13획 전부 스냅 기록 0 → D-L83이 전부 막아 3D 0/13. 끝점 겨냥 없이도 생기는
// 연결(교차)이 좌표를 정해야 도구가 멈추지 않는다 — `crossAnchorOf`가 그 판이다.
// 앱 배선(promoteChain ④)과 **같은 함수**를 같은 인자로 부른다(#17).
import { describe, it, expect } from "vitest";
import { crossAnchorOf, type CrossSeg } from "../src/s3d/crossAnchor.js";
import { endFromCursor } from "../src/s3d/liveLine.js";
import { project, axisDirection, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { vpDirErrDeg } from "./vpDirErr.js";

const W = 1180, H = 668;
const P: Pt2 = [W / 2, H / 2];
const F = 0.431 * W;                                    // 파일1 보고 대역의 카메라(재구성)
const VP0: Pt2 = [P[0] - F, P[1]];
const CTX = { principal: P, f: F };

/** 화면점 p를 깊이 z에 둔 3D 점 — project(q) = p가 되는 유일한 점이다. */
const at = (p: Pt2, z: number): Vec3 => [((p[0] - P[0]) / F) * z, ((p[1] - P[1]) / F) * z, z];

// 대상 3D 선분 — 화면에서 (500, 250) → (700, 450)으로 보이는 사선
const TARGET: CrossSeg = { id: "t", a: at([500, 250], 2), b: at([700, 450], 3) };

describe("교차 앵커(crossAnchorOf) — 끝점 겨냥 없는 연결", () => {
  it("가로지르는 현은 앵커를 얻고, 앵커의 재투영이 화면 교차점으로 돌아온다", () => {
    // (500, 400) → (700, 300): TARGET의 상(기울기 +1)과 기울기 −0.5로 교차한다
    const hit = crossAnchorOf([500, 400], [700, 300], [TARGET], CTX, 8);
    expect(hit).not.toBeNull();
    const back = project(hit!.atV, P, F)!;
    expect(Math.hypot(back[0] - hit!.at2[0], back[1] - hit!.at2[1])).toBeLessThan(1e-6);
    expect(hit!.ofId).toBe("t");
  });

  it("교차 앵커 + 축 방향 → 놓인 선의 재투영이 교차점을 지나고 소실점을 향한다", () => {
    // VP0을 겨냥하는 현이 TARGET을 가로지른다 — 파일 1의 그 상황(겨냥은 축·연결은 교차)
    const a2: Pt2 = [700, 355], b2: Pt2 = [520, 388];    // VP0(81.4, 334) 방향으로 −10.4° 기울기
    const hit = crossAnchorOf(a2, b2, [TARGET], CTX, 8);
    expect(hit).not.toBeNull();
    const d0 = axisDirection(VP0, P, F);
    const e1 = endFromCursor(hit!.atV, d0, a2, CTX)!;
    const e2 = endFromCursor(hit!.atV, d0, b2, CTX)!;
    expect(e1).not.toBeNull(); expect(e2).not.toBeNull();
    const q1 = project(e1, P, F)!, q2 = project(e2, P, F)!;
    // 놓인 선은 축 직선이므로 재투영 현이 소실점을 정확히 지난다(항목 2의 사슬과 같은 성질)
    expect(vpDirErrDeg([q1[0], q1[1]], [q2[0], q2[1]], VP0)!).toBeLessThan(0.01);
    // 그리고 그 직선은 교차점을 지난다 — 교차점에서 현까지의 수직 거리 ≈ 0
    const u: Pt2 = [q2[0] - q1[0], q2[1] - q1[1]];
    const L = Math.hypot(u[0], u[1]);
    const perp = Math.abs((hit!.at2[0] - q1[0]) * u[1] - (hit!.at2[1] - q1[1]) * u[0]) / L;
    expect(perp).toBeLessThan(1e-6);
  });

  it("안 가로지르면 null — 평행 이동한 현(반례, #30)", () => {
    const hit = crossAnchorOf([500, 150], [700, 50], [TARGET], CTX, 8);
    expect(hit).toBeNull();
  });

  it("선분 밖 교차는 null — 연장선에서만 만나는 현", () => {
    // TARGET의 상은 x ∈ [500, 700]. 그 왼쪽 아래 연장에서만 만나는 현
    const hit = crossAnchorOf([300, 260], [450, 140], [TARGET], CTX, 8);
    expect(hit).toBeNull();
  });

  it("얕은 교차(나란한 현)는 null — 조건수 거름(HORIZON_TOL.min_slope_deg, #17)", () => {
    // TARGET의 상과 거의 나란한(기울기 +1에서 1° 미만 차) 현이 살짝 가로지른다
    const hit = crossAnchorOf([500, 251.5], [700, 449.5], [TARGET], CTX, 8);
    expect(hit).toBeNull();
  });
});
