// L-B.2 — 가이드 민감도와 선 조작. 계획서 §5.2.
//
// **반례가 요점이다**(A-4). "핸들 1px이 축을 몇 도 움직이는가"는 수치 미분이라
// **무엇을 넣어도 어떤 숫자가 나온다** — 그 숫자가 의도한 것을 재는지 확인해야 한다.
// 확인하는 성질 셋:
//   ① 가이드를 길게 하면 예산이 **늘어난다**(길이에 반비례하는 민감도)
//   ② 두 가이드의 각차를 좁히면 예산이 **줄어든다**(L-A.7이 잰 발산)
//   ③ 선을 평행이동해도 **방향과 소실점은 안 바뀐다**(늘리기·옮기기의 전제)
import { describe, expect, it } from "vitest";
import { axisSensitivity, solveGuides, SENS_TOL } from "../src/s3d/vpSensitivity.js";
import { extendGuide, moveGuideBy, guideLineAt, clipToCanvas, DRAFT_TOL,
         type Guide } from "../src/s3d/vpDraft.js";
import { lineIntersect, type Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [1280, 675];

/** 소실점 셋을 지나는 가이드 여섯. 길이는 `frac`으로 줄인다(중점 기준). */
function guidesFor(vps: [Pt2, Pt2, Pt2], frac = 1): Guide[] {
  const margin = 0.02 * Math.hypot(SZ[0], SZ[1]);
  const targets: [number, number][][] = [
    [[0.30, 0.30], [0.30, 0.72]], [[0.70, 0.30], [0.70, 0.72]], [[0.32, 0.35], [0.70, 0.35]],
  ];
  const out: Guide[] = [];
  vps.forEach((vp, ax) => {
    for (const t of targets[ax]) {
      const q: Pt2 = [t[0] * SZ[0], t[1] * SZ[1]];
      const far: Pt2 = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
      const cl = clipToCanvas(vp, far, SZ, margin);
      if (!cl) continue;
      const [a, b] = cl;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const k = frac / 2;
      out.push({ axis: ax as 0 | 1 | 2,
                 a: [mx + (a[0] - b[0]) * k, my + (a[1] - b[1]) * k],
                 b: [mx + (b[0] - a[0]) * k, my + (b[1] - a[1]) * k] });
    }
  });
  return out;
}

/** 3점 투시의 참 소실점 하나. `scene(35, 15, 1000, [1280,675])`이 내는 값이다.
 *  **소수 둘째 자리까지만 옮겨 적었으므로** 복원 f도 그만큼만 맞는다(1000.002). */
const VPS: [Pt2, Pt2, Pt2] = [[2118.53, 69.55], [-84.91, 69.55], [640, 4069.55]];

describe("solveGuides — 앱과 하네스가 같이 쓰는 단일 경로", () => {
  it("참 소실점 가이드에서 참 카메라가 나온다", () => {
    const s = solveGuides(guidesFor(VPS), SZ)!;
    expect(s).not.toBeNull();
    expect(s.f).toBeCloseTo(1000, 2);
    expect(s.principal[0]).toBeCloseTo(640, 2);
    expect(s.principal[1]).toBeCloseTo(337.5, 2);
    expect(s.dirs.every(Boolean)).toBe(true);
  });
  it("가이드가 부족하면 null — 없는 카메라를 지어내지 않는다", () => {
    expect(solveGuides([], SZ)).toBeNull();
    expect(solveGuides(guidesFor(VPS).slice(0, 2), SZ)).toBeNull();
  });
});

describe("axisSensitivity — 무엇을 재는지 반례로 확인한다", () => {
  it("① 가이드를 길게 하면 핸들 예산이 늘어난다", () => {
    const shortS = axisSensitivity(guidesFor(VPS, 0.25), SZ);
    const longS = axisSensitivity(guidesFor(VPS, 1.0), SZ);
    for (const ax of [0, 1, 2] as const) {
      const a = shortS[ax].budgetPx, b = longS[ax].budgetPx;
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      // 짧게 하면 예산이 **줄어야** 한다. 안 줄면 이 지표는 길이를 안 보고 있는 것이다.
      expect(b!).toBeGreaterThan(a!);
    }
  });

  it("② 두 가이드의 각차가 좁아지면 예산이 줄어든다 — L-A.7이 잰 발산", () => {
    // 축 0의 소실점을 **아주 멀리** 보내면 두 가이드가 나란해진다
    const near = axisSensitivity(guidesFor([[3000, 69.55], VPS[1], VPS[2]]), SZ);
    const far = axisSensitivity(guidesFor([[40000, 69.55], VPS[1], VPS[2]]), SZ);
    const a = near[0].budgetPx, b = far[0].budgetPx;
    if (a != null && b != null) expect(b).toBeLessThan(a);
    else expect(b).toBeNull();          // 무한원으로 스냅되면 축이 비어 `null`이다
  });

  it("③ 예산 × 민감도 = 예산 각도 — 정의가 지켜진다", () => {
    for (const s of axisSensitivity(guidesFor(VPS), SZ)) {
      if (s.degPerPx == null || s.budgetPx == null) continue;
      expect(s.degPerPx * s.budgetPx).toBeCloseTo(SENS_TOL.budget_deg, 9);
    }
  });

  it("반례 — 카메라가 안 서면 숫자를 지어내지 않는다", () => {
    const r = axisSensitivity([], SZ);
    expect(r).toHaveLength(3);
    expect(r.every(x => x.degPerPx === null && x.budgetPx === null)).toBe(true);
  });

  it("`shortestGuidePx`는 **짧은 쪽**이다 — 정확도를 정하는 것이 그것이다", () => {
    const g = guidesFor(VPS);
    // 축 0의 가이드 하나만 짧게 만든다
    const mx = (g[0].a[0] + g[0].b[0]) / 2, my = (g[0].a[1] + g[0].b[1]) / 2;
    g[0] = { ...g[0], a: [mx - (g[0].b[0] - g[0].a[0]) * 0.05, my - (g[0].b[1] - g[0].a[1]) * 0.05],
             b: [mx + (g[0].b[0] - g[0].a[0]) * 0.05, my + (g[0].b[1] - g[0].a[1]) * 0.05] };
    const s = axisSensitivity(g, SZ);
    const lens = [g[0], g[1]].map(x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]));
    expect(s[0].shortestGuidePx).toBeCloseTo(Math.min(...lens), 6);
  });
});

describe("선 조작 — 방향과 소실점은 안 바뀐다", () => {
  it("`extendGuide`가 길이만 늘린다", () => {
    const g = guidesFor(VPS, 0.3);
    const before = solveGuides(g, SZ)!;
    let ext = g;
    for (let i = 0; i < g.length; i++) ext = extendGuide(ext, i, SZ);
    const after = solveGuides(ext, SZ)!;
    // 소실점·f가 그대로여야 한다 — 늘리기가 카메라를 바꾸면 사용자의 조정이 날아간다
    expect(after.f).toBeCloseTo(before.f, 6);
    for (const ax of [0, 1, 2] as const) {
      expect(after.vps[ax]![0]).toBeCloseTo(before.vps[ax]![0], 6);
      expect(after.vps[ax]![1]).toBeCloseTo(before.vps[ax]![1], 6);
    }
    // 그리고 실제로 길어져야 한다
    const lo = Math.min(...g.map(x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1])));
    const hi = Math.min(...ext.map(x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1])));
    expect(hi).toBeGreaterThan(lo);
  });

  it("`moveGuideBy`는 소실점을 **옮긴다** — 늘리기와 다른 동작이다", () => {
    const g = guidesFor(VPS);
    const before = lineIntersect(g[0].a, g[0].b, g[1].a, g[1].b)!;
    const moved = moveGuideBy(g, 0, 40, -25);
    const after = lineIntersect(moved[0].a, moved[0].b, moved[1].a, moved[1].b)!;
    // 방향은 같고(평행이동) 교점은 선을 따라 미끄러진다
    const d0 = [g[0].b[0] - g[0].a[0], g[0].b[1] - g[0].a[1]];
    const d1 = [moved[0].b[0] - moved[0].a[0], moved[0].b[1] - moved[0].a[1]];
    expect(d1[0]).toBeCloseTo(d0[0], 9);
    expect(d1[1]).toBeCloseTo(d0[1], 9);
    expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(1);
  });

  it("`guideLineAt` — 선 위는 잡히고 먼 곳은 안 잡힌다", () => {
    const g = guidesFor(VPS);
    const mid: Pt2 = [(g[2].a[0] + g[2].b[0]) / 2, (g[2].a[1] + g[2].b[1]) / 2];
    expect(guideLineAt(g, mid, SZ)).toBe(2);
    const r = DRAFT_TOL.handle_ratio * Math.hypot(SZ[0], SZ[1]);
    // 선에 수직으로 반경의 3배만큼 떨어뜨리면 안 잡혀야 한다
    const dx = g[2].b[0] - g[2].a[0], dy = g[2].b[1] - g[2].a[1], L = Math.hypot(dx, dy);
    const off: Pt2 = [mid[0] - (dy / L) * r * 3, mid[1] + (dx / L) * r * 3];
    expect(guideLineAt(g, off, SZ)).toBeNull();
  });
});
