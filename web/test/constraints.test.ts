// W-1 제약 누산기 — 계획서 §3.1~§3.5.
//
// 핵심 주장은 "**입력 방식이 달라도 같은 누산기로 수렴한다**"이다. 그래서 테스트도
// 같은 카메라를 서로 **다른 제스처 조합**으로 만들어 보고 결과가 같은지 본다.
// 값이 맞는지만 보면 그 주장은 검증되지 않는다.
import { describe, it, expect } from "vitest";
import {
  ConstraintAccumulator, PRESETS, fPixelsFrom35mm, type Gesture,
} from "../src/s3d/constraints.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [800, 600];
const VP_L: Pt2 = [-200, 300], VP_R: Pt2 = [1400, 300];

/** VP를 지나는 선분 하나 만들기 — 화면 안 점에서 VP 쪽으로. */
function rayTo(vp: Pt2, from: Pt2, len = 0.35): { a: Pt2; b: Pt2 } {
  return { a: from, b: [from[0] + (vp[0] - from[0]) * len, from[1] + (vp[1] - from[1]) * len] };
}
const acc = () => new ConstraintAccumulator(SZ);
const feed = (gs: Gesture[]) => { const a = acc(); gs.forEach(g => a.add(g)); return a.solve(); };

describe("W-1 제약 누산기", () => {
  it("점 찍기와 선 두 개가 같은 소실점을 준다 — 찾아내기와 정의하기의 구분이 없다(§3.1)", () => {
    const byPoint = feed([
      { kind: "vp_point", axis: 0, at: VP_L },
      { kind: "vp_point", axis: 1, at: VP_R },
    ]);
    const byLines = feed([
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 150]) },
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 450]) },
      { kind: "vp_line", axis: 1, ...rayTo(VP_R, [200, 150]) },
      { kind: "vp_line", axis: 1, ...rayTo(VP_R, [200, 450]) },
    ]);
    expect(byLines.camera.case).toBe(byPoint.camera.case);
    expect(byLines.camera.f!).toBeCloseTo(byPoint.camera.f!, 6);
    expect(byLines.axes[0].status).toBe("fixed");
  });

  it("선 하나 + 지평선도 같은 곳에 닿는다 — 자유도 1을 다른 제스처가 채운다", () => {
    const mixed = feed([
      { kind: "horizon", a: [0, 300], b: [800, 300] },
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 150]) },
      { kind: "vp_line", axis: 1, ...rayTo(VP_R, [200, 150]) },
    ]);
    expect(mixed.axes[0].status).toBe("fixed");
    expect((mixed.axes[0] as any).source).toBe("horizon×line");
    const ref = feed([
      { kind: "vp_point", axis: 0, at: VP_L }, { kind: "vp_point", axis: 1, at: VP_R },
    ]);
    expect(mixed.camera.f!).toBeCloseTo(ref.camera.f!, 4);
  });

  it("선이 하나뿐이면 자유도 1이 남고, 무엇을 하면 되는지 알려준다(§3.2)", () => {
    const r = feed([{ kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 150]) }]);
    expect(r.axes[0].status).toBe("on_line");
    const hint = r.remaining.find(x => x.hint.includes("축 1"))!;
    expect(hint.dof).toBe(1);
    expect(hint.hint).toContain("지평선");
  });

  it("과잉 결정: 어긋난 선이 있으면 잔차로 드러난다 — 오류가 아니라 정보다(§3.3)", () => {
    const clean = feed([
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 150]) },
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 300]) },
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 450]) },
    ]);
    expect(clean.residual).toBeLessThan(1e-9);
    const bent = feed([
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 150]) },
      { kind: "vp_line", axis: 0, ...rayTo(VP_L, [600, 300]) },
      { kind: "vp_line", axis: 0, a: [600, 450], b: [340, 520] },   // 엉뚱한 방향
    ]);
    expect(bent.residual!).toBeGreaterThan(0.01);
    expect(bent.warnings.some(w => w.text.includes("어긋납니다"))).toBe(true);
  });

  it("3점 예각 조건 위반을 즉시 알린다 (6.5, §3.4)", () => {
    const bad = feed([
      { kind: "vp_point", axis: 0, at: [0, 0] },
      { kind: "vp_point", axis: 1, at: [100, 0] },
      { kind: "vp_point", axis: 2, at: [3000, 40] },
    ]);
    expect(bad.camera.ok).toBe(false);
    expect(bad.warnings[0].level).toBe("error");
    expect(bad.warnings[0].text).toContain("둔각");
    // 반례: 예각이면 경고가 없어야 한다(항상 켜지는 경고가 아님을 확인)
    const good = feed([
      { kind: "vp_point", axis: 0, at: [-600, 200] },
      { kind: "vp_point", axis: 1, at: [1400, 200] },
      { kind: "vp_point", axis: 2, at: [400, 2200] },
    ]);
    expect(good.camera.ok).toBe(true);
    expect(good.warnings.some(w => w.level === "error")).toBe(false);
  });

  it("화각 경고는 넓을 때만 나온다 — 좁은 쪽 상한은 없다 (18.4)", () => {
    const wide = feed([
      { kind: "vp_point", axis: 0, at: [200, 300] }, { kind: "vp_point", axis: 1, at: [600, 300] },
    ]);
    expect(wide.warnings.some(w => w.text.includes("화각"))).toBe(true);
    const narrow = feed([
      { kind: "vp_point", axis: 0, at: [-4000, 300] }, { kind: "vp_point", axis: 1, at: [5000, 300] },
    ]);
    expect(narrow.warnings.some(w => w.text.includes("화각"))).toBe(false);
  });

  it("1점 + 렌즈 = 확정. 렌즈가 없으면 깊이만 미결정으로 남는다(§3.2)", () => {
    const noLens = feed([{ kind: "vp_point", axis: 0, at: [400, 300] }]);
    expect(noLens.camera.ok).toBe(false);
    expect(noLens.camera.directScaleAxes).toEqual(["width", "height"]);
    expect(noLens.remaining.some(r => r.hint.includes("렌즈"))).toBe(true);

    const withLens = feed([
      { kind: "vp_point", axis: 0, at: [400, 300] },
      { kind: "lens", f: fPixelsFrom35mm(24, SZ[0]) },
    ]);
    expect(withLens.camera.ok).toBe(true);
    expect(withLens.camera.fSource).toBe("setting(렌즈)");
  });

  it("엣지 투표가 쌓이면 소실점이 스스로 잡힌다(§3.1 마지막 행)", () => {
    const a = acc();
    a.add({ kind: "edge_vote", axis: 0, ...rayTo(VP_L, [600, 150]) });
    expect(a.solve().axes[0].status).toBe("on_line");
    a.add({ kind: "edge_vote", axis: 0, ...rayTo(VP_L, [600, 420]) });
    const s = a.solve();
    expect(s.axes[0].status).toBe("fixed");
    expect((s.axes[0] as any).vp[0]).toBeCloseTo(VP_L[0], 3);
  });

  it("반례: 아무것도 안 넣으면 축측(평행) 상태이고 깊이가 없다", () => {
    const r = feed([]);
    expect(r.camera.case).toBe("axonometric");
    expect(r.camera.directScaleAxes).toEqual(["width", "height", "depth"]);
    expect(r.remaining[0].dof).toBe(2);
  });

  it("프리셋 4종이 §3.7과 맞고 mm→px 환산이 화면 폭에 비례한다", () => {
    expect(PRESETS.map(p => p.mm)).toEqual([24, 35, 50, 35]);
    expect(PRESETS.map(p => p.vps)).toEqual([1, 2, 2, 3]);
    expect(fPixelsFrom35mm(36, 800)).toBeCloseTo(800, 9);      // 36mm = 화면 폭
    expect(fPixelsFrom35mm(50, 1600) / fPixelsFrom35mm(50, 800)).toBeCloseTo(2, 9);
  });
});
