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
    // ⚠ **#40 이후로는 수치+출처(또는 '오라클 없음' 명시)도 있어야 통과한다.**
    const g = gate({ registered: "판별력 ≥ 0.5", reachability: "오라클 고정 게이지 0.9694",
                     reachability_value: 0.9694, reachability_source: "oracle/best" });
    expect(g.registered).toContain("0.5");
    expect(g.reachability).toContain("0.9694");
  });
});

describe("gate() — 도달 가능성이 산문뿐이면 막는다(#40)", () => {
  // **자동 검사를 만들면서 그 검사를 무력화한 유형**이 새로 생겼다(2026-08-16 사람 지시).
  // #35를 고쳐 놓고 같은 세션이 그 필드를 **정보량 0인 항등**으로 채웠다.
  it("수치도 '오라클 없음' 명시도 없으면 던진다", () => {
    expect(() => gate({ registered: "판별력 ≥ 0.5", reachability: "구성상 도달 가능하다" }))
      .toThrow(/산문뿐/);
  });

  it("수치만 있고 출처가 없으면 던진다 — 값 대조를 못 한다(#33)", () => {
    expect(() => gate({ registered: "r", reachability: "오라클 팔", reachability_value: 0.97 }))
      .toThrow(/reachability_source/);
  });

  it("수치 + 출처면 통과한다", () => {
    const g = gate({ registered: "r", reachability: "오라클 팔",
                     reachability_value: 0.9694, reachability_source: "oracle/best" });
    expect(g.reachability_source).toBe("oracle/best");
  });

  it("오라클이 없다고 **명시**하면 통과한다 — '없다'도 결론이다", () => {
    const g = gate({ registered: "r", reachability: "…",
                     reachability_absent: "이 게이트에는 참값 팔이 없다" });
    expect(g.reachability_absent).toContain("없다");
  });
});
