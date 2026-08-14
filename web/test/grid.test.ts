// W-1 투시 가이드 (§3.8). 그리는 것보다 **안 그리는 것**이 중요하다.
import { describe, it, expect } from "vitest";
import { clipToRect, fanFromVp, guides, AXIS_COLOR } from "../src/wire/grid.js";
import { recoverCamera, type Pt2 } from "../src/wire/camera.js";

const SZ: [number, number] = [800, 600];
const inRect = (p: Pt2) => p[0] >= -1e-6 && p[0] <= 800 + 1e-6 && p[1] >= -1e-6 && p[1] <= 600 + 1e-6;

describe("W-1 투시 가이드", () => {
  it("화면 밖 소실점에서도 화면 안 구간이 나온다", () => {
    const seg = clipToRect([-2000, 300], [1, 0], 800, 600)!;
    expect(seg[0][0]).toBeCloseTo(0, 6);
    expect(seg[1][0]).toBeCloseTo(800, 6);
  });

  it("화면을 스치지 않는 방향은 null", () => {
    expect(clipToRect([-100, -100], [0, -1], 800, 600)).toBeNull();
  });

  it("부챗살이 전부 화면 안에 있고 모두 소실점을 향한다", () => {
    const vp: Pt2 = [-600, 250];
    const lines = fanFromVp(vp, SZ);
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) {
      expect(inRect(l.a) && inRect(l.b)).toBe(true);
      // 선을 연장하면 소실점을 지난다 — 외적이 0
      const d: Pt2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
      const e: Pt2 = [vp[0] - l.a[0], vp[1] - l.a[1]];
      const cross = Math.abs(d[0] * e[1] - d[1] * e[0]) / (Math.hypot(...d) * Math.hypot(...e));
      expect(cross).toBeLessThan(1e-6);
    }
  });

  it("확정되지 않은 축은 그리지 않는다 — 모르는 것을 보여 주지 않는다", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], null, null];
    const cam = recoverCamera(vps, SZ, { fSetting: 900 });
    const g = guides(cam, vps, SZ);
    expect(new Set(g.filter(x => x.kind === "axis").map(x => x.axis))).toEqual(new Set([0]));
    expect(g.some(x => x.kind === "horizon")).toBe(true);
  });

  it("반례: 눈금 있는 지면 격자는 아직 그리지 않는다(실척이 없다)", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], [1400, 300], null];
    const g = guides(recoverCamera(vps, SZ), vps, SZ);
    expect(g.every(x => x.kind === "axis" || x.kind === "horizon")).toBe(true);
    expect(AXIS_COLOR.length).toBe(3);
  });
});
