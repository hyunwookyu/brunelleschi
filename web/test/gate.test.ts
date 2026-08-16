// **`gate()`가 빈 도달 가능성을 막는지** 확인한다(PITFALLS #35의 기록 쪽).
//
// 이것이 반례 테스트다 — 검사가 0건일 때 "깨끗함"인지 "안 돎"인지 가르는 자리(#32).
// `gate()`가 아무것도 안 하면 하네스가 빈 블록을 적고, 그러면 selfcheck의 `reachability`
// 검사는 **통과하는데 아무 내용도 없는** 상태가 된다.
import { describe, it, expect } from "vitest";
import { gate } from "./gate.js";

describe("gate() — 등록과 도달 가능성을 함께 강제한다", () => {
  it("도달 가능성이 비면 던진다(#35)", () => {
    expect(() => gate({ registered: "판별력 ≥ 0.5", reachability: "" }))
      .toThrow(/reachability/);
    expect(() => gate({ registered: "판별력 ≥ 0.5", reachability: "   " }))
      .toThrow(/reachability/);
  });

  it("등록 기준이 비면 던진다(#26 — 측정 전에 박는다)", () => {
    expect(() => gate({ registered: "", reachability: "오라클 0.97" }))
      .toThrow(/registered/);
  });

  it("둘 다 있으면 그대로 낸다", () => {
    const g = gate({ registered: "판별력 ≥ 0.5", reachability: "오라클 고정 게이지 0.9694" });
    expect(g.registered).toContain("0.5");
    expect(g.reachability).toContain("0.9694");
  });
});
