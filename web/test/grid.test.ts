// S-1 투시 가이드 (§3.6). 그리는 것만큼 **안 그리는 것**이 중요하다.
import { describe, it, expect } from "vitest";
import { clipToRect, fanFromVp, guides, groundGrid, AXIS_COLOR } from "../src/s3d/grid.js";
import { recoverCamera, type Pt2 } from "../src/s3d/camera.js";
import { seedOnGround } from "../src/s3d/stroke.js";
import { project, dot3, groundFrame } from "../src/s3d/geom3d.js";

const SZ: [number, number] = [800, 600];
const inRect = (p: Pt2) => p[0] >= -1e-6 && p[0] <= 800 + 1e-6 && p[1] >= -1e-6 && p[1] <= 600 + 1e-6;

describe("S-1 투시 가이드", () => {
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

  it("지면 격자는 두 축과 f가 있어야 나온다 — 카메라가 없으면 안 그린다", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], [1400, 300], null];
    const ok = groundGrid(recoverCamera(vps, SZ), vps, SZ);
    expect(ok.length).toBeGreaterThan(10);
    expect(ok.every(l => l.kind === "ground")).toBe(true);

    // 축이 하나뿐이면 지면 평면을 못 세운다
    const one: (Pt2 | null)[] = [[-200, 300], null, null];
    expect(groundGrid(recoverCamera(one, SZ, { fSetting: 900 }), one, SZ).length).toBe(0);
    // 카메라 무효(둔각 6.5)면 아무것도 안 나온다
    const bad: (Pt2 | null)[] = [[0, 0], [100, 0], [3000, 40]];
    expect(groundGrid(recoverCamera(bad, SZ), bad, SZ).length).toBe(0);
  });

  it("반례: 격자에 **눈금·치수가 없다** — 실척이 아직 없기 때문이다", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], [1400, 300], null];
    const g = guides(recoverCamera(vps, SZ), vps, SZ);
    // 선분만 있고 라벨·눈금 같은 필드가 없다. 간격은 표시용 선택이지 측정이 아니다.
    expect(g.every(x => ["axis", "horizon", "ground"].includes(x.kind))).toBe(true);
    expect(g.every(x => !("label" in x) && !("tick" in x) && !("meters" in x))).toBe(true);
    expect(AXIS_COLOR.length).toBe(3);
  });

  it("**기운 카메라(3점)**에서도 격자가 지면 위에 있다 — 씨앗과 같은 게이지여야 한다", () => {
    // S-1은 지면을 `y = 1`로 두었다. 3점 투시에서는 카메라가 기울어 그것이 지면이 아니다.
    // 격자와 씨앗이 다른 평면을 쓰면 화면의 격자 위에 그은 획이 격자 밖에 놓인다.
    const vps: [Pt2, Pt2, Pt2] = [[1878, 236], [-245, 236], [400, 4030]];
    const cam = recoverCamera(vps, SZ);
    expect(cam.ok).toBe(true);
    const g = groundGrid(cam, vps, SZ);
    expect(g.length).toBeGreaterThan(10);
    // 격자선을 연장하면 자기 축의 소실점을 지나야 한다. 지면을 잘못 잡으면 방향이 틀어져
    // 이 조건이 깨진다 — 격자가 "투시처럼 보이지만 투시가 아닌" 상태가 된다.
    const toVp = (l: typeof g[number], vp: Pt2) => {
      const d: Pt2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
      const e: Pt2 = [vp[0] - l.a[0], vp[1] - l.a[1]];
      return Math.abs(d[0] * e[1] - d[1] * e[0]) / (Math.hypot(...d) * Math.hypot(...e));
    };
    for (const l of g) expect(toVp(l, vps[l.axis as 0 | 1])).toBeLessThan(2e-3);

    // 씨앗과 같은 평면인가 — 격자선 위의 점을 씨앗으로 읽으면 그 격자선 **깊이**로 돌아온다
    const ctx = { principal: cam.principalPoint!, f: cam.f!, vps, imgSize: SZ };
    const p = seedOnGround(g[0].a, ctx)!;
    expect(p).not.toBeNull();
    expect(dot3(groundFrame(vps[2], ctx.principal, ctx.f, 1).n, p)).toBeCloseTo(1, 9);

    // 수직 소실점을 무시하면(S-1의 `y = 1` 가정) 같은 검사가 **깨진다**
    const gFlat = groundGrid(cam, [vps[0], vps[1], null], SZ);
    expect(Math.max(...gFlat.map(l => toVp(l, vps[l.axis as 0 | 1])))).toBeGreaterThan(2e-3);
  });

  it("지면 격자는 카메라 앞(z>0)만 그린다 — 뒤로 넘어가면 투영이 뒤집힌다", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], [1400, 300], null];
    const g = groundGrid(recoverCamera(vps, SZ), vps, SZ);
    // 뒤집힌 조각이 있으면 화면을 가로지르는 비정상적으로 긴 선분이 생긴다
    const diag = Math.hypot(...SZ);
    expect(g.every(l => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) < diag * 3)).toBe(true);
  });
});
