// **3D 뷰 큐브 히트 판정**(6차 지시 1) — 순수 함수 층의 단위 확인.
//
// e2e(basic_flow의 뷰 큐브 팔)가 배선을 재고, 여기는 분류기 자체를 잰다:
// 면/모서리/꼭짓점 밴드(CAD 관행) · 위/아래 면 중앙 한정(지시 1-1 "손이 잘 안 감") ·
// 빗나감 = null(호출자가 가장 가까운 1점으로 — 지시 1-3) · 가장 가까운 수평 축.
//
// 좌표계: 전부 three 세계 축(#24 — viewCube.ts 머리말). 반례 테스트 포함(A-4):
// 옛 평면 위젯의 동작(위/아래 면 무조건 히트 · 빗나감을 면으로 처리)이 실패해야 한다.
import { describe, expect, it } from "vitest";
import { CUBE_TOL, cubeHit, nearestOnePointDir } from "../src/ui/viewCube.js";
import type { Vec3 } from "../src/s3d/geom3d.js";

/** 확정 카메라의 기저(three) — 항등: 오른쪽 +x · 위 +y · 시선 −z. */
const IDENT = { r: [1, 0, 0] as Vec3, u: [0, 1, 0] as Vec3, f: [0, 0, -1] as Vec3 };

/** 요·피치로 기저를 만든다(굴림 없음 — OrbitControls 규약). 음수 피치 = 내려다봄(fy < 0). */
function basisOf(yawRad: number, pitchRad: number) {
  const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
  const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
  const f: Vec3 = [sy * cp, sp, -cy * cp];
  const r: Vec3 = [cy, 0, sy];                      // f × (0,1,0) 정규화와 같다(수평)
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { r, u, f };
}

const C = 54, S = 24;                               // 캔버스 중심(108/2)·큐브 반변(px)

describe("cubeHit — 면/모서리/꼭짓점 분류(three 축)", () => {
  it("정면 중앙 클릭 = 정면 면(+z) — 시선은 그 반대(항등 그대로)", () => {
    const h = cubeHit(C, C, C, C, S, IDENT)!;
    expect(h.kind).toBe("face");
    expect(h.dir).toEqual([0, 0, 1]);
  });

  it("면 밴드 안 오프셋(0.5)은 여전히 면이다", () => {
    const h = cubeHit(C + 0.5 * S, C, C, C, S, IDENT)!;
    expect(h.kind).toBe("face");
    expect(h.dir).toEqual([0, 0, 1]);
  });

  it("우측 밴드(0.8) = 정면-우 모서리 → 2점 방향(요 45°·피치 0)", () => {
    const h = cubeHit(C + 0.8 * S, C, C, C, S, IDENT)!;
    expect(h.kind).toBe("edge");
    const iv = 1 / Math.SQRT2;
    expect(h.dir[0]).toBeCloseTo(iv, 12);
    expect(h.dir[1]).toBe(0);
    expect(h.dir[2]).toBeCloseTo(iv, 12);
  });

  it("우상 구석(0.8, 0.8) = 꼭짓점 → 3점 방향(성분 셋 다 1/√3)", () => {
    const h = cubeHit(C + 0.8 * S, C - 0.8 * S, C, C, S, IDENT)!;
    expect(h.kind).toBe("vertex");
    const iv = 1 / Math.sqrt(3);
    expect(h.dir[0]).toBeCloseTo(iv, 12);
    expect(h.dir[1]).toBeCloseTo(iv, 12);
    expect(h.dir[2]).toBeCloseTo(iv, 12);
  });

  it("실루엣 밖 = null — 면으로 처리하지 않는다(반례: 옛 평면 위젯은 전 영역이 히트였다)", () => {
    expect(cubeHit(C + 1.5 * S, C, C, C, S, IDENT)).toBeNull();
    expect(cubeHit(C, C + 1.5 * S, C, C, S, IDENT)).toBeNull();
  });
});

describe("cubeHit — 위/아래 면은 중앙 한정(지시 1-1 '손이 잘 안 감')", () => {
  it("피치 −75°(깊이 내려다봄)의 중앙 탭은 윗면 중앙을 지나 탑뷰다", () => {
    const b = basisOf(0, -75 * Math.PI / 180);
    const h = cubeHit(C, C, C, C, S, { r: b.r, u: b.u, f: b.f })!;
    expect(h.kind).toBe("face");
    expect(h.dir).toEqual([0, 1, 0]);
  });

  it("피치 −60°의 중앙 탭은 윗면 고리(중앙 밖)라 **수평 면으로 간다** — 가장 가까운 1점(반례: 밴드 없는 분류라면 [0,1,0]이 나온다)", () => {
    const b = basisOf(0, -60 * Math.PI / 180);
    const h = cubeHit(C, C, C, C, S, { r: b.r, u: b.u, f: b.f })!;
    expect(h.kind).toBe("face");
    expect(h.dir).toEqual([0, 0, 1]);                // 시선 −z와 마주 보는 수평 면
  });

  it("경계 자체의 확인 — top_center 임계가 갈림을 만든다", () => {
    // 피치를 스윕해 중앙 반경(0.5)을 지나는 지점 앞뒤에서 판정이 갈린다
    const at = (deg: number) => {
      const b = basisOf(0, (-deg * Math.PI) / 180);
      return cubeHit(C, C, C, C, S, { r: b.r, u: b.u, f: b.f })!.dir[1];
    };
    expect(at(74)).toBe(1);                          // 중앙 안 → 탑뷰
    expect(at(62)).toBe(0);                          // 고리 → 수평 면
    expect(CUBE_TOL.top_center).toBeCloseTo(0.5, 12);
  });
});

describe("nearestOnePointDir — 가장 가까운 1점(지시 1-3)", () => {
  it("수직축(±y)은 후보가 아니다 — 깊이 내려다봐도 수평 축이 나온다", () => {
    const d = nearestOnePointDir([0.1, -0.9, -0.3]);
    expect(d).toEqual([0, 0, -1]);
  });

  it("요가 45°를 넘으면 옆 축으로 넘어간다", () => {
    expect(nearestOnePointDir([0.4, 0, -0.9])).toEqual([0, 0, -1]);
    expect(nearestOnePointDir([0.9, 0, -0.4])).toEqual([1, 0, 0]);
    expect(nearestOnePointDir([-0.9, 0, 0.2])).toEqual([-1, 0, 0]);
    expect(nearestOnePointDir([0.1, 0, 0.9])).toEqual([0, 0, 1]);
  });

  it("결과는 항상 피치 0(y 성분 0) — 1점은 시선이 수평이어야 한다", () => {
    for (const f of [[0.5, -0.7, -0.5], [0, 0.99, -0.1], [-0.3, 0.4, 0.8]] as Vec3[]) {
      expect(nearestOnePointDir(f)[1]).toBe(0);
    }
  });
});
