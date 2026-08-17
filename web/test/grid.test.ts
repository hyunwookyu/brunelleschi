// S-1 투시 가이드 (§3.6). 그리는 것만큼 **안 그리는 것**이 중요하다.
import { describe, it, expect } from "vitest";
import { clipToRect, guides, groundGrid, AXIS_COLOR } from "../src/s3d/grid.js";
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

  // ⛔ **부챗살 시험을 지웠다**(2026-08-17 지시 5-5) — `fanFromVp`는 화면 각도 균등분할이라
  // 공간에서 불규칙했다. 가이드는 지평선 + 지면 정사각 격자 투영뿐이다.

  it("축이 모자라면 격자를 안 그린다 — 지평선만 남는다(모르는 것을 보여 주지 않는다)", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], null, null];
    const cam = recoverCamera(vps, SZ, { fSetting: 900 });
    const g = guides(cam, vps, SZ);
    expect(g.filter(x => x.kind === "ground").length).toBe(0);
    expect(g.some(x => x.kind === "horizon")).toBe(true);
  });

  it("**1점(무한원 가로축)에서도 격자가 선다** — 축 방향을 넘기면 된다(지시 5-5·D-L40)", () => {
    const vps: (Pt2 | null)[] = [[400, 300], null, null];
    const cam = recoverCamera(vps, SZ, { fSetting: 900 });
    const g = guides(cam, vps, SZ, 300, [[0, 0, 1], [1, 0, 0], [0, 1, 0]]);
    expect(g.filter(x => x.kind === "ground").length).toBeGreaterThan(10);
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

  /**
   * **이론서 9.5 — 등간격 지면선의 화면 교점은 등차가 아니라 1/(V′−uₙ)이 등차다**(리뷰어 [1]).
   * 9.3이 "등차인 줄 아는 것이 실무의 흔한 오해"라 적은 그 자리다 — 부챗살(화면 균등분할)이
   * 정확히 그 오해였고, 지면 격자 투영은 이 성질을 자동으로 만족해야 한다.
   * 판정: 축0 격자선들이 세로 횡단선(x = c)을 지나는 y들에 대해
   * ① y 간격 자체는 **등차가 아니고**(부챗살 반증) ② 1/(h − yₙ)은 **등차다**(h = 지평선).
   */
  it("**9.5 잠금** — 격자 교점의 역수가 등차다 (화면 등간격이 아니다)", () => {
    const vps: (Pt2 | null)[] = [[-200, 300], [1400, 300], null];
    const cam = recoverCamera(vps, SZ);
    const g = groundGrid(cam, vps, SZ);
    const c = 400;                                       // 세로 횡단선 x = 400
    const ys: number[] = [];
    for (const l of g.filter(x => x.axis === 0)) {
      const [x1, x2] = [l.a[0], l.b[0]];
      if ((x1 - c) * (x2 - c) > 0 || Math.abs(x2 - x1) < 1e-9) continue;
      const t = (c - x1) / (x2 - x1);
      ys.push(l.a[1] + t * (l.b[1] - l.a[1]));
    }
    // 같은 격자선의 조각들이 겹치므로 y를 뭉친다
    ys.sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const y of ys) if (!uniq.length || y - uniq[uniq.length - 1] > 1.5) uniq.push(y);
    // 지평선(300) 아래의 지면 교점만 본다
    const below = uniq.filter(y => y > 305);
    expect(below.length).toBeGreaterThanOrEqual(4);
    const h = 300;
    const inv = below.map(y => 1 / (h - y));
    const d1 = [] as number[], d2 = [] as number[];
    for (let i = 1; i < below.length; i++) d1.push(below[i] - below[i - 1]);
    for (let i = 1; i < inv.length; i++) d2.push(inv[i] - inv[i - 1]);
    const spread = (a: number[]) =>
      (Math.max(...a) - Math.min(...a)) / Math.max(1e-12, Math.abs(a.reduce((x, y) => x + y) / a.length));
    // ① 화면 간격은 등차가 아니다 — 퍼짐이 크다(부챗살이었다면 여기 걸렸을 것이다)
    expect(spread(d1)).toBeGreaterThan(0.2);
    // ② 역수 간격은 등차다(9.5) — 퍼짐이 수치 오차 수준이다
    expect(spread(d2)).toBeLessThan(0.02);
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

// ---------------------------------------------------------------- 4차 지시 3-c — 격자·소실점 정합

/**
 * **격자가 그 소실점에서 나오는가**(4차 지시 3-c). 그린 두 대각선의 교점으로 세운 소실점에
 * 대해, 그 축 가족의 지면 격자 조각이 전부 정확히 그 소실점을 향해야 한다 — 격자가 그린 선을
 * 따르는 것의 확인이다. **앱과 같은 경로**(`CamState.feed` → `acc.solve` → `groundGrid`)를 쓴다(#17).
 */
import { CamState } from "../src/ui/camState.js";

describe("격자는 그린 선의 교점(소실점)에서 나온다 (4차 지시 3-c)", () => {
  it("축 가족의 격자 조각이 전부 소실점을 정확히 향한다", () => {
    const SZ2: [number, number] = [960, 672];
    const cam = new CamState(SZ2);
    // V1(-100, 258)을 지나는 짝 + V2(1250, 258)를 향한 선 (axis_snap_table의 픽스처 그대로)
    for (const [a, b] of [[[300, 600], [140, 463.2]], [[500, 560], [260, 439.2]],
                          [[700, 620], [920, 475.2]]] as [Pt2, Pt2][]) {
      cam.feed({ a, b });
    }
    const vps = cam.vps();
    expect(vps[0]).not.toBeNull();
    expect(vps[1]).not.toBeNull();
    // 소실점이 **그린 짝의 교점 그대로**다(지시 3-a — 지평선 보정이 안 끼었다)
    expect(vps[0]![0]).toBeCloseTo(-100, 6);
    expect(vps[0]![1]).toBeCloseTo(258, 6);
    const r = cam.acc.solve();
    const g = groundGrid(r.camera, vps, SZ2, undefined, undefined, cam.ctx()!.axisDirs);
    let checked = 0;
    for (const seg of g) {
      if (seg.axis == null || seg.kind !== "ground") continue;
      const vp = vps[seg.axis]!;
      const dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1];
      const L = Math.hypot(dx, dy);
      if (L < 5) continue;                       // 먼지 조각은 방향이 무의미하다
      const vx = vp[0] - seg.a[0], vy = vp[1] - seg.a[1];
      const D = Math.hypot(vx, vy);
      if (D < 1e-6) continue;
      // 조각 방향과 (조각 → 소실점) 방향의 사인 — 정확히 그 점으로 모이면 0이다
      const sin = Math.abs(dx * vy - dy * vx) / (L * D);
      expect(sin).toBeLessThan(1e-6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);         // **덮는 대상 수**(#38) — 공허하지 않다
  });
});
