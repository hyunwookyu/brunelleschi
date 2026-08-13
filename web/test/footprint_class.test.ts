// V-4 투시 신뢰 판정(§3.8 개정) — 직사각=투시단독 / L·비직교=평면·앵커 요구.
import { describe, it, expect } from "vitest";
import type { Pt } from "../src/parser/types.js";
import { classifyFootprint, needsPlanForPerspective } from "../src/ui/footprintClass.js";

const RECT: Pt[] = [[0, 0], [12, 0], [12, 8], [0, 8]];
const L: Pt[] = [[0, 0], [12, 0], [12, 4], [6, 4], [6, 8], [0, 8]];
const SKEW: Pt[] = [[0, 0], [12, 0], [14, 8], [2, 8]];   // 평행사변형(비직교)

describe("V-4 footprint 분류(§3.8)", () => {
  it("직사각 → rectangle, 투시 단독 신뢰(안내 없음)", () => {
    expect(classifyFootprint(RECT)).toBe("rectangle");
    expect(needsPlanForPerspective(RECT)).toBe(false);
  });

  it("L자 → L, 평면/앵커 요구(2H: L1만)", () => {
    expect(classifyFootprint(L)).toBe("L");
    expect(needsPlanForPerspective(L)).toBe(true);
  });

  it("비직교 사각 → complex, 요구(2F: 0.62 붕괴)", () => {
    expect(classifyFootprint(SKEW)).toBe("complex");
    expect(needsPlanForPerspective(SKEW)).toBe(true);
  });

  it("반례 — 노이즈 직사각(±10°)은 여전히 rectangle(오탐 억제)", () => {
    const noisy: Pt[] = [[0, 0.3], [12, -0.2], [11.7, 8], [0.2, 7.8]];
    expect(classifyFootprint(noisy)).toBe("rectangle");
  });

  // 실 파서(footprintFromLines)는 닫힌 링(첫=끝 중복)을 반환 — 이 형태로 검증.
  it("닫힌 링(중복 정점) 직사각도 rectangle(파서 실출력 형태)", () => {
    const closed: Pt[] = [[132, 120], [132, 129.6], [120, 129.6], [120, 120], [132, 120]];
    expect(classifyFootprint(closed)).toBe("rectangle");
    expect(needsPlanForPerspective(closed)).toBe(false);
  });

  it("닫힌 링 L자(7정점)도 L", () => {
    const closedL: Pt[] = [...L, L[0]];
    expect(classifyFootprint(closedL)).toBe("L");
  });
});
