// V-4 안내 배너 (지시 2.7) — §3.8 개정 반영. "평면을 그리거나"는 성립하지 않는다.
import { describe, it, expect } from "vitest";
import { guidanceFor, axisQuestion, UPPER_RATIO } from "../src/ui/guidance.js";

describe("V-4 안내(§3.8 개정)", () => {
  it("1점 f 미결정 → 깊이를 묻는다 (평면을 요구하지 않는다)", () => {
    const g = guidanceFor({ case: "1pt", ok: false, f: null, verdict: "unresolved_f" });
    const texts = g.map(x => x.text).join(" ");
    expect(g.some(x => x.kind === "depth_unresolved")).toBe(true);
    expect(texts).toContain("안쪽 깊이");
    expect(texts).not.toContain("평면을 그리");     // 구판 문구 재발 방지
  });

  it("게이트 하한 → 화각 경고", () => {
    const g = guidanceFor({ case: "1pt", ok: true, f: 300, verdict: "unreliable", ratio: 0.375 });
    expect(g.some(x => x.kind === "fov_too_wide")).toBe(true);
  });

  it("게이트 상한 → 원거리 경고", () => {
    const g = guidanceFor({ case: "1pt", ok: true, f: 4000, verdict: "trust", ratio: UPPER_RATIO + 1 });
    expect(g.some(x => x.kind === "viewpoint_too_far")).toBe(true);
  });

  it("게이트는 2점 경로에 적용되지 않는다 (f가 형태 가정과 무관)", () => {
    const g = guidanceFor({ case: "2pt", ok: true, f: 200, verdict: "unreliable", ratio: 0.25 });
    expect(g.some(x => x.kind === "fov_too_wide")).toBe(false);
    expect(g.some(x => x.kind === "viewpoint_too_far")).toBe(false);
  });

  it("2점 구간 넓음 → 추가 뷰/치수 요청", () => {
    const g = guidanceFor({ case: "2pt", ok: true, f: 800, verdict: "trust", ratio: 1.0 },
                          { relWidth: 0.9, unresolved: true });
    const t = g.find(x => x.kind === "aspect_unresolved")!;
    expect(t.text).toContain("다른 각도");
    expect(t.text).toContain("치수");
  });

  it("축 모호 → 어느 쪽인지 묻고, 값이 있으면 값을 넣는다", () => {
    const g = guidanceFor({ case: "2pt", ok: true, f: 800, ratio: 1.0 }, undefined, true);
    expect(g.some(x => x.kind === "axis_ambiguous")).toBe(true);
    expect(axisQuestion(12)).toBe("폭과 깊이 중 어느 쪽이 12미터입니까?");
    expect(axisQuestion()).toContain("어느 쪽");
  });

  it("3점 둔각 → 결정적 무효를 단정적으로 말한다", () => {
    const g = guidanceFor({ case: "3pt", ok: false, verdict: "invalid" });
    const t = g.find(x => x.kind === "camera_invalid")!;
    expect(t.severity).toBe("error");
    expect(t.text).toContain("재현되지 않습니다");
  });

  it("모두 정상이면 안내 없음", () => {
    const g = guidanceFor({ case: "2pt", ok: true, f: 800, verdict: "trust", ratio: 1.0 },
                          { relWidth: 0.1, unresolved: false }, false);
    expect(g).toEqual([]);
  });

  it("심각도 순 정렬(error → warn → info)", () => {
    const g = guidanceFor({ case: "1pt", ok: false, f: null, verdict: "invalid", ratio: 0.3 },
                          { unresolved: true }, true);
    const sev = g.map(x => x.severity);
    expect(sev[0]).toBe("error");
    expect(sev[sev.length - 1]).toBe("info");
  });
});
