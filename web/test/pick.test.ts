// L-D.1 — `ui/pick.ts`의 **반례 테스트**(CLAUDE.md §5.3).
//
// 고르기가 **의도한 것을 고르는지** 확인한다. 통과 테스트만 있으면 "언제나 첫 번째를 고르는"
// 함수도 통과한다 — 그래서 **가까운 것이 바뀌면 답도 바뀌는지**를 본다.
import { describe, it, expect } from "vitest";
import { distToSeg, nearestSeg, PICK_TOL, type PickSeg } from "../src/ui/pick.js";
import type { Pt2 } from "../src/s3d/camera.js";

const P = (x: number, y: number): Pt2 => [x, y];

describe("distToSeg — 점과 선분", () => {
  it("선분 위의 점은 0", () => {
    expect(distToSeg(P(5, 0), P(0, 0), P(10, 0))).toBeCloseTo(0, 12);
  });
  it("수선의 발이 선분 안이면 수직 거리", () => {
    expect(distToSeg(P(5, 3), P(0, 0), P(10, 0))).toBeCloseTo(3, 12);
  });
  // **끝점 밖은 끝점까지의 거리다** — 무한 직선으로 재면 먼 획이 가까워 보인다
  it("수선의 발이 선분 밖이면 끝점까지의 거리", () => {
    expect(distToSeg(P(-4, 3), P(0, 0), P(10, 0))).toBeCloseTo(5, 12);
    expect(distToSeg(P(14, 3), P(0, 0), P(10, 0))).toBeCloseTo(5, 12);
  });
  it("길이 0인 선분은 점까지의 거리", () => {
    expect(distToSeg(P(3, 4), P(0, 0), P(0, 0))).toBeCloseTo(5, 12);
  });
});

describe("nearestSeg — 반경 안에서 가장 가까운 하나", () => {
  const segs: PickSeg[] = [
    { id: "a", a: P(0, 0), b: P(100, 0) },
    { id: "b", a: P(0, 20), b: P(100, 20) },
    { id: "c", a: P(0, 200), b: P(100, 200) },
  ];

  it("가까운 것을 고른다", () => {
    expect(nearestSeg(P(50, 2), segs, 15)).toBe("a");
  });

  // **반례** — 점을 옮기면 답이 바뀌어야 한다. 안 바뀌면 "언제나 첫 번째"와 구분이 안 된다
  it("점을 옮기면 답이 바뀐다", () => {
    expect(nearestSeg(P(50, 18), segs, 15)).toBe("b");
    expect(nearestSeg(P(50, 10.1), segs, 15)).toBe("b");
    expect(nearestSeg(P(50, 9.9), segs, 15)).toBe("a");
  });

  it("반경 밖이면 아무것도 안 고른다 — 빈 곳을 누르면 선택이 풀린다", () => {
    expect(nearestSeg(P(50, 100), segs, 15)).toBeNull();
    expect(nearestSeg(P(50, 2), [], 15)).toBeNull();
  });

  // **반경이 결과를 정한다**(#13 — 임계 하나로 결론을 만들지 않는다)
  it("반경을 키우면 멀리 있는 것도 잡힌다 — 그래도 가장 가까운 것이다", () => {
    expect(nearestSeg(P(50, 100), segs, 15)).toBeNull();
    // (50,100)에서 b는 80 · c는 100 — 반경을 키워도 **b가 먼저**다
    expect(nearestSeg(P(50, 100), segs, 120)).toBe("b");
    // (50,150)에서 b는 130 · c는 50 — 여기서는 c다
    expect(nearestSeg(P(50, 150), segs, 140)).toBe("c");
  });

  it("끝점 밖은 끝점 거리로 잰다 — 무한 직선이면 틀린 것을 고른다", () => {
    const two: PickSeg[] = [
      { id: "far_but_infinite_close", a: P(0, 0), b: P(10, 0) },   // 직선으로는 y=0
      { id: "near", a: P(200, 5), b: P(300, 5) },
    ];
    // (250, 8)은 직선 y=0에서 8px이지만 **선분**에서는 240px가 넘는다
    expect(nearestSeg(P(250, 8), two, 20)).toBe("near");
  });

  it("반경 상수가 스냅 반경보다 작다 — 둘은 다른 문제다", () => {
    // 스냅은 손 획의 겨냥 오차(0.05)를 흡수하고, 고르기는 커서로 짚는다
    expect(PICK_TOL.radius_ratio).toBeLessThan(0.05);
    expect(PICK_TOL.radius_ratio).toBeGreaterThan(0);
  });
});
