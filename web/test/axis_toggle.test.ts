// B-1 b/c — 축 뒤바뀜 두 해 유지·토글. 기하가 구분하지 못하므로 보여주고 고르게 한다.
import { describe, it, expect } from "vitest";
import { emptyIR } from "../src/parser/types.js";
import type { IR, Volume } from "../src/parser/types.js";
import { swapAxes, applyAxisChoice, hasAmbiguousAxis, isAxisAmbiguous,
         previewBothSolutions, AXIS_AMBIGUITY_BY_VIEW } from "../src/ui/axisToggle.js";

const AX = { ambiguous: true, aspect: 3.0, aspect_alt: 1 / 3, perm: [0, 1, 2, 3] };
function vol(id: string, w: number, h: number, axis: any = null): Volume {
  return { id, footprint: [[0, 0], [w, 0], [w, h], [0, h]], base: 0, height: null,
           height_src: "unset", confidence: 0.9, label: "", axis };
}
const irOf = (...vs: Volume[]): IR => ({ ...emptyIR(), volumes: vs });

describe("B-1 축 토글", () => {
  it("swapAxes는 대합(두 번 적용하면 원래)", () => {
    const fp = vol("v", 12, 4).footprint;
    expect(swapAxes(swapAxes(fp))).toEqual(fp);
  });

  it("모호 볼륨만 바뀌고 비모호는 그대로", () => {
    const ir = irOf(vol("amb", 12, 4, { ...AX }), vol("fixed", 10, 5, null));
    const alt = applyAxisChoice(ir, true);
    expect(alt.volumes[0].footprint).toEqual(swapAxes(ir.volumes[0].footprint));
    expect(alt.volumes[1].footprint).toEqual(ir.volumes[1].footprint);   // 건드리지 않음
  });

  it("토글 시 aspect와 aspect_alt가 자리를 바꾼다", () => {
    const ir = irOf(vol("v1", 12, 4, { ...AX }));
    const alt = applyAxisChoice(ir, true);
    expect(alt.volumes[0].axis!.aspect).toBeCloseTo(AX.aspect_alt, 9);
    expect(alt.volumes[0].axis!.aspect_alt).toBeCloseTo(AX.aspect, 9);
  });

  it("useAlternate=false면 원본을 그대로 돌려준다", () => {
    const ir = irOf(vol("v1", 12, 4, { ...AX }));
    expect(applyAxisChoice(ir, false)).toBe(ir);
  });

  it("모호 볼륨이 있으면 감지된다", () => {
    expect(hasAmbiguousAxis(irOf(vol("v1", 12, 4, { ...AX })))).toBe(true);
    expect(hasAmbiguousAxis(irOf(vol("v1", 12, 4, null)))).toBe(false);
    expect(isAxisAmbiguous(vol("v1", 1, 1, { ambiguous: false, aspect: 1, aspect_alt: 1 }))).toBe(false);
  });

  it("두 해의 폭/깊이를 나란히 보여준다(B-1 c)", () => {
    const p = previewBothSolutions(vol("v1", 12, 4, { ...AX }));
    expect(p).toHaveLength(2);
    expect(p[0].widthDepth).toEqual([12, 4]);
    expect(p[1].widthDepth).toEqual([4, 12]);      // 뒤바뀐 해
    expect(p[0].label).toContain("폭");
  });

  it("투시 종류가 모호도를 줄이지 않는다(실측 기록)", () => {
    // 1점이라고 안전하지 않다 — 8way가 화면평행 정보를 버리기 때문(측정 0.295 vs 0.335).
    const rates = Object.values(AXIS_AMBIGUITY_BY_VIEW).map(v => v.flipRate);
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(0.1);
    expect(Math.min(...rates)).toBeGreaterThan(0.25);
  });
});
