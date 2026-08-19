// **연장선 스냅 회귀**(2026-08-19 13차 항목 3-h) — `extension.ts`의 발동 판정과
// 그 결과로 놓이는 기하가 지시의 요구를 재는지: ① 원 선과 **같은 3D 직선 위**에 놓이는가
// ② 좌표가 즉시 정해지는가 ③ 임계 밖으로 돌리면 발동하지 않는가(다른 스냅으로 넘어간다)
// ④ 안쪽(원 선 쪽)은 후보가 아닌가(지시 3-e). 앱 배선의 종단은 `extension_snap.spec.ts`(e2e).
import { describe, it, expect } from "vitest";
import { extensionDir } from "../src/s3d/extension.js";
import { endFromCursor } from "../src/s3d/liveLine.js";
import { LIFT_TOL } from "../src/s3d/lift.js";
import { project, sub3, unit3, norm3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const CTX = { principal: [590, 334] as Pt2, f: 500 };

/** 화면점 p를 깊이 z에 둔 3D 점 — project(q) = p (cross_anchor.test.ts와 같은 보조). */
const at = (p: Pt2, z: number): Vec3 =>
  [((p[0] - CTX.principal[0]) / CTX.f) * z, ((p[1] - CTX.principal[1]) / CTX.f) * z, z];

// 원 선: 화면 (400, 300) → (700, 420), 깊이 2 → 3 — 축이 아닌 임의 방향(면 위 사선의 자리)
const A3 = at([400, 300], 2);
const B3 = at([700, 420], 3);
const pB = project(B3, CTX.principal, CTX.f)!;
const pA = project(A3, CTX.principal, CTX.f)!;
/** B 끝의 바깥 연장 화면 방향. */
const OUT: Pt2 = (() => {
  const d: Pt2 = [pB[0] - pA[0], pB[1] - pA[1]];
  const L = Math.hypot(d[0], d[1]);
  return [d[0] / L, d[1] / L];
})();
const chordTo = (deg: number, len = 150): Pt2 => {
  const th = Math.atan2(OUT[1], OUT[0]) + (deg * Math.PI) / 180;
  return [pB[0] + len * Math.cos(th), pB[1] + len * Math.sin(th)];
};

describe("연장선 스냅(extensionDir) — 발동·기하·반례 (13차 항목 3)", () => {
  it("바깥으로 나란히 그으면 발동하고, 방향은 원 선의 3D 방향이다", () => {
    const d = extensionDir(B3, A3, [pB[0], pB[1]], chordTo(0), CTX)!;
    expect(d).not.toBeNull();
    const lineDir = unit3(sub3(B3, A3));
    expect(Math.abs(d[0] * lineDir[0] + d[1] * lineDir[1] + d[2] * lineDir[2]))
      .toBeGreaterThan(1 - 1e-9);
  });

  it("놓인 끝점이 원 선의 **무한 3D 직선 위**에 있다 — 좌표가 즉시 정해진다(지시 3-c)", () => {
    const d = extensionDir(B3, A3, [pB[0], pB[1]], chordTo(2), CTX)!;
    const e = endFromCursor(B3, d, chordTo(2), CTX)!;
    expect(e).not.toBeNull();
    // 공선성: (e − A3) × lineDir = 0
    const v = sub3(e, A3), u = unit3(sub3(B3, A3));
    const cross: Vec3 = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2],
                         v[0] * u[1] - v[1] * u[0]];
    expect(norm3(cross)).toBeLessThan(1e-9 * Math.max(1, norm3(v)));
    // 바깥이다 — B 너머(A 반대쪽)
    expect(v[0] * u[0] + v[1] * u[1] + v[2] * u[2]).toBeGreaterThan(norm3(sub3(B3, A3)));
  });

  it("임계(LIFT_TOL.parallel_deg) 밖으로 돌리면 발동하지 않는다 — 다른 스냅으로 넘어간다", () => {
    expect(extensionDir(B3, A3, [pB[0], pB[1]], chordTo(LIFT_TOL.parallel_deg + 3), CTX)).toBeNull();
    // 임계 안쪽 각은 발동한다 — 경계가 실제로 그 상수에 있다(#17 재사용의 확인)
    expect(extensionDir(B3, A3, [pB[0], pB[1]], chordTo(LIFT_TOL.parallel_deg - 1), CTX)).not.toBeNull();
  });

  it("안쪽(원 선과 겹치는 방향)은 후보가 아니다(지시 3-e) — 반대쪽 끝은 그쪽대로 발동한다", () => {
    // B 끝에서 A 쪽으로(안쪽) — null
    expect(extensionDir(B3, A3, [pB[0], pB[1]], [pA[0], pA[1]], CTX)).toBeNull();
    // A 끝에서 바깥(B 반대쪽) — 발동 · 방향은 A−B 쪽
    const inn: Pt2 = [pA[0] - OUT[0] * 150, pA[1] - OUT[1] * 150];
    const d = extensionDir(A3, B3, [pA[0], pA[1]], inn, CTX)!;
    expect(d).not.toBeNull();
    const back = unit3(sub3(A3, B3));
    expect(d[0] * back[0] + d[1] * back[1] + d[2] * back[2]).toBeGreaterThan(1 - 1e-9);
  });

  it("퇴화는 null — 길이 0의 현·길이 0의 선분", () => {
    expect(extensionDir(B3, A3, [pB[0], pB[1]], [pB[0], pB[1]], CTX)).toBeNull();
    expect(extensionDir(B3, B3, [pB[0], pB[1]], chordTo(0), CTX)).toBeNull();
  });
});
