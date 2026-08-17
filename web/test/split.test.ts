// **자동 분할**(지시 I) — 절단점·조각·구간 빼기·앵커 이관의 단위 시험(반례 포함, A-4).
import { describe, it, expect } from "vitest";
import { closestParams, cutParams, piecesFromCuts, subtractIntervals, reanchorId,
         SPLIT_TOL, type Seg3 } from "../src/s3d/split.js";

const seg = (id: string, a: [number, number, number], b: [number, number, number]): Seg3 =>
  ({ id, a, b });

describe("지시 I — 절단점", () => {
  it("교차(X): 안쪽끼리 만나면 양쪽 다 잘린다", () => {
    const A = seg("A", [0, 0, 0], [2, 0, 0]);
    const B = seg("B", [1, -1, 0], [1, 1, 0]);
    expect(cutParams(A, [B])).toEqual([0.5]);
    expect(cutParams(B, [A])).toEqual([0.5]);
  });

  it("접촉(T): 상대 끝점이 내 안쪽에 닿으면 나만 잘린다 — 상대는 끝점이라 안 잘린다", () => {
    const A = seg("A", [0, 0, 0], [2, 0, 0]);
    const B = seg("B", [1, 0, 0], [1, 2, 0]);           // B의 끝점이 A의 중간에
    expect(cutParams(A, [B])).toEqual([0.5]);
    expect(cutParams(B, [A])).toEqual([]);              // **반례** — 절단점이 끝 여유 안이다
  });

  it("**반례** — 떨어져 있으면 안 잘린다(허용 거리 밖)", () => {
    const A = seg("A", [0, 0, 0], [2, 0, 0]);
    const far = seg("F", [1, 0.5, 0], [1, 2, 0]);       // 0.5 떨어짐 ≫ contact_ratio
    expect(cutParams(A, [far])).toEqual([]);
  });

  it("**반례** — 공유 끝점(V자)은 절단점이 아니다(이미 조각 경계다)", () => {
    const A = seg("A", [0, 0, 0], [2, 0, 0]);
    const V = seg("V", [0, 0, 0], [0, 2, 0]);
    expect(cutParams(A, [V])).toEqual([]);
  });

  it("가까운 절단점은 하나로 합쳐진다", () => {
    const A = seg("A", [0, 0, 0], [2, 0, 0]);
    const B1 = seg("B1", [1.0, -1, 0], [1.0, 1, 0]);
    const B2 = seg("B2", [1.005, -1, 0], [1.005, 1, 0]);   // merge_t(0.01) 안
    expect(cutParams(A, [B1, B2]).length).toBe(1);
  });

  it("조각 만들기 — 절단점 n개면 조각 n+1개", () => {
    expect(piecesFromCuts([0.25, 0.5])).toEqual([[0, 0.25], [0.25, 0.5], [0.5, 1]]);
  });
});

describe("지시 I — 부분 지우개(구간 빼기)", () => {
  it("지나간 구간을 빼고 남는 조각을 낸다 — 겹친 구간은 합쳐진다", () => {
    expect(subtractIntervals([[0.2, 0.4], [0.35, 0.5]]))
      .toEqual([[0, 0.2], [0.5, 1]]);
  });
  it("**반례** — 아무것도 안 지우면 전체가 남는다 · 전부 지우면 빈다", () => {
    expect(subtractIntervals([])).toEqual([[0, 1]]);
    expect(subtractIntervals([[0, 1]])).toEqual([]);
  });
  it("먼지 조각은 안 남긴다(min_len)", () => {
    expect(subtractIntervals([[0.01, 1]])).toEqual([]);   // 앞 0.01은 min_len(0.02)보다 짧다
  });
});

describe("지시 I — 앵커 이관 (지운 조각이 다른 획의 앵커였으면)", () => {
  const p1 = seg("p1", [0, 0, 0], [1, 0, 0]);
  const p2 = seg("p2", [1, 0, 0], [2, 0, 0]);
  it("앵커 점을 담은 살아남은 조각으로 ofId가 넘어간다", () => {
    expect(reanchorId([0.5, 0, 0], [p1, p2])).toBe("p1");
    expect(reanchorId([1.7, 0, 0], [p1, p2])).toBe("p2");
    expect(reanchorId([1, 0, 0], [p1, p2])).not.toBeNull();   // 경계점은 어느 쪽이든 담는다
  });
  it("**반례** — 담은 조각이 지워졌으면 null(스냅 기록을 끊는다 — 기하는 안 움직인다)", () => {
    expect(reanchorId([0.5, 0, 0], [p2])).toBeNull();
    expect(reanchorId([0.5, 0.5, 0], [p1, p2])).toBeNull();   // 어느 조각에도 안 닿는 점
  });
});

describe("closestParams — 기본 성질", () => {
  it("평행선의 거리와 매개변수", () => {
    const r = closestParams(seg("a", [0, 0, 0], [1, 0, 0]), seg("b", [0, 1, 0], [1, 1, 0]));
    expect(r.dist).toBeCloseTo(1, 12);
  });
  it("허용치 상수가 노출된다(원장 기록용)", () => {
    expect(SPLIT_TOL.contact_ratio).toBeGreaterThan(0);
  });
});
