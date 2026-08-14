// W-3 기하 구축 — 광선-직선 최근접점 + 앵커 체인. 계획서 §4.2/§5.1.
//
// **가장 중요한 검증**: 카메라가 확정되면 커서 픽셀 하나가 3D 점 하나를 유일하게 결정한다는
// 주장(§1.1)이 실제로 성립하는가. 정답을 아는 3D 상자를 투영해 화면 점을 만들고,
// 그 화면 점으로 3D를 되찾아 원래와 비교한다.
import { describe, it, expect } from "vitest";
import {
  closestPoints, meetPoint, rayThrough, project, axisDirection, addVertex, addEdge,
  emptyModel, resetIds, unit3, sub3, norm3, type Vec3,
} from "../src/wire/model.js";
import { placeAlongAxis, seedOnGround, buildChain, angleBetween, type PlaceCtx } from "../src/wire/place.js";
import type { Pt2 } from "../src/wire/camera.js";

const SZ: [number, number] = [960, 672];
const PP: Pt2 = [480, 336];
const F = 1100;
const ctxFor = (vps: (Pt2 | null)[]): PlaceCtx => ({ principal: PP, f: F, vps, imgSize: SZ });

/** 3D 방향 → 그 방향의 소실점(무한원 점의 상). z>0이어야 화면에 찍힌다. */
const vpOf = (d: Vec3): Pt2 => [PP[0] + (d[0] * F) / d[2], PP[1] + (d[1] * F) / d[2]];

/**
 * 정확히 직교하는 축 셋 = 회전행렬의 열. 요(yaw)와 피치를 **둘 다** 준다.
 *
 * 처음엔 그람-슈미트로 만들었는데 세 번째 축의 z가 정확히 0이 나왔다 —
 * 카메라가 기울지 않으면 수직축의 소실점이 **무한원**이기 때문이다(2.2 c=0).
 * 물리적으로 맞는 결과이고, 3점 투시를 시험하려면 카메라를 기울여야 한다는 뜻이다.
 */
function orthoAxes(yaw = 0.6, pitch = 0.35): [Vec3, Vec3, Vec3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // R = Rx(pitch)·Ry(yaw) 의 열 = 세계 축의 카메라계 방향
  const X: Vec3 = [cy, sp * sy, -cp * sy];
  const Y: Vec3 = [0, cp, sp];
  const Z: Vec3 = [sy, -sp * cy, cp * cy];
  const fix = (v: Vec3): Vec3 => (v[2] > 0 ? v : [-v[0], -v[1], -v[2]]);
  return [fix(X), fix(Y), fix(Z)];
}

describe("W-3 광선-직선 최근접점", () => {
  it("만나는 두 직선에서는 gap이 0이고 교점이 나온다", () => {
    const c = closestPoints([0, 0, 0], [1, 0, 1], [2, 0, 0], [0, 0, 1]);
    expect(c.gap).toBeLessThan(1e-9);
    expect(meetPoint(c)[0]).toBeCloseTo(2, 9);
  });

  it("어긋난 두 직선에서도 답이 하나 나온다 — 실패 모드가 온건하다", () => {
    const c = closestPoints([0, 0, 0], [0, 0, 1], [1, 0, 5], [0, 1, 0]);
    expect(c.parallel).toBe(false);
    expect(c.gap).toBeCloseTo(1, 9);          // x로 1 떨어져 있다
    expect(meetPoint(c)[2]).toBeCloseTo(5, 9);
  });

  it("평행하면 그렇다고 말한다 — 조용히 아무 값이나 주지 않는다", () => {
    expect(closestPoints([0, 0, 0], [0, 0, 1], [3, 0, 0], [0, 0, 1]).parallel).toBe(true);
  });
});

describe("W-3 커서 한 점 → 3D 한 점 (§1.1의 핵심 주장)", () => {
  it("정답을 아는 상자를 투영했다가 되찾으면 원래 자리로 돌아온다", () => {
    // 세계 축 셋(직교) — 카메라 좌표계에서 본 방향
    // 세 축은 **정확히 직교**해야 한다 — 대충 고른 값(92.5°)으로 재면 되찾기 오차가
    // 축의 비직교에서 오는지 계산에서 오는지 구분되지 않는다.
    const ax = orthoAxes();
    expect(angleBetween(ax[0], ax[1])).toBeCloseTo(90, 6);
    expect(angleBetween(ax[1], ax[2])).toBeCloseTo(90, 6);
    const vps = ax.map(vpOf);
    const ctx = ctxFor(vps);

    const O: Vec3 = [-0.4, 0.55, 3.2];                 // 상자 한 모서리
    const scr = project(O, PP, F)!;
    for (let i = 0; i < 3; i++) {
      for (const L of [0.6, 1.1]) {
        const truth: Vec3 = [O[0] + ax[i][0] * L, O[1] + ax[i][1] * L, O[2] + ax[i][2] * L];
        const target = project(truth, PP, F)!;
        const r = placeAlongAxis(O, i as 0 | 1 | 2, target, ctx);
        expect(r.ok).toBe(true);
        expect(norm3(sub3(r.position!, truth))).toBeLessThan(1e-6);
      }
    }
    expect(scr[0]).toBeGreaterThan(0);
  });

  it("반례: 축을 크게 벗어나 그으면 배치하지 않는다 — 억지로 붙이지 않는다", () => {
    const ax = orthoAxes();
    const ctx = ctxFor(ax.map(vpOf));
    const O: Vec3 = [-0.4, 0.55, 3.2];
    // 축1 위 점을 찍되, 화면에서 크게 어긋난 곳을 준다
    const on: Vec3 = [O[0] + ax[0][0], O[1] + ax[0][1], O[2] + ax[0][2]];
    const s = project(on, PP, F)!;
    const off: Pt2 = [s[0], s[1] + 260];
    const r = placeAlongAxis(O, 0, off, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("벗어났다");
  });

  it("반례: 커서가 소실점과 겹치면 깊이가 무한이라 배치하지 않는다", () => {
    // 소실점이 주점에 있으면 그 축은 시선 방향(0,0,1)이다. 이때도 일반 커서 위치에서는
    // 광선이 그 축과 평행하지 않아 배치가 **된다** — 첫 반례는 내 전제가 틀렸다.
    // 실제로 못 정하는 경우는 커서가 소실점 자체에 있을 때다(무한히 먼 점).
    const ctx = ctxFor([PP, null, null]);
    expect(placeAlongAxis([0, 0, 3], 0, [PP[0] + 40, PP[1]], ctx).ok).toBe(true);
    const at = placeAlongAxis([0, 0, 3], 0, PP, ctx);
    expect(at.ok).toBe(false);        // 평행 → 최근접점이 유일하지 않다
  });
});

describe("W-3 앵커 체인 (§4.2)", () => {
  it("연결된 것만 배치된다 — 떠 있는 획은 미뤄진다", () => {
    resetIds();
    const ax = orthoAxes();
    const ctx = ctxFor(ax.map(vpOf));
    const O: Vec3 = [-0.4, 0.6, 3.2];
    const p = (v: Vec3) => project(v, PP, F)!;
    const step = (base: Vec3, i: number, L: number): Vec3 =>
      [base[0] + ax[i][0] * L, base[1] + ax[i][1] * L, base[2] + ax[i][2] * L];
    const A = step(O, 0, 0.9), B = step(O, 1, 0.8), C = step(O, 2, -0.7);
    const segs = [
      { screen: [p(O), p(A)] as [Pt2, Pt2], direction: 0 as const },
      { screen: [p(O), p(B)] as [Pt2, Pt2], direction: 1 as const },
      { screen: [p(O), p(C)] as [Pt2, Pt2], direction: 2 as const },
      // 아무 데도 안 닿는 획
      { screen: [[60, 60], [140, 70]] as [Pt2, Pt2], direction: 0 as const },
    ];
    const r = buildChain(segs, ctx);
    expect(r.placed).toBe(3);
    expect(r.deferred).toBe(1);
    expect(Object.keys(r.model.vertices).length).toBe(4);
  });

  it("코너를 공유하면 정점이 하나로 접힌다 — W-2가 못 준 위치 오차가 여기서 준다", () => {
    resetIds();
    const m = emptyModel();
    const a = addVertex(m, [0, 0, 3], [500, 300], "measured", 12);
    const b = addVertex(m, [0.01, 0, 3], [504, 302], "measured", 12);   // 4.5px 떨어짐
    expect(b).toBe(a);                       // 같은 정점으로 접힌다
    const c = addVertex(m, [1, 0, 3], [700, 300], "measured", 12);
    expect(c).not.toBe(a);
    expect(addEdge(m, a, c, 0, "measured")).toBeTruthy();
    expect(addEdge(m, c, a, 0, "measured")).toBe(Object.values(m.edges)[0].id);  // 중복 안 만든다
    expect(addEdge(m, a, a, 0, "measured")).toBeNull();                          // 자기 자신 금지
  });

  it("씨앗은 지면 위에 있고, 지평선 위를 찍으면 지면과 만나지 않는다", () => {
    const ctx = ctxFor([null, null, null]);
    const below = seedOnGround([500, 500], ctx)!;
    expect(below[1]).toBeCloseTo(1, 9);       // 지면 게이지 y=1
    expect(seedOnGround([500, PP[1]], ctx)).toBeNull();     // 지평선
    expect(seedOnGround([500, 100], ctx)).toBeNull();       // 지평선 위 = 카메라 뒤
  });

  it("루트 필드는 3개 — §13 제한 안에 있다", async () => {
    const { ROOT_FIELDS, MAX_ROOT_FIELDS } = await import("../src/wire/model.js");
    expect(ROOT_FIELDS.length).toBe(3);
    expect(ROOT_FIELDS.length).toBeLessThanOrEqual(MAX_ROOT_FIELDS);
  });
});

describe("W-3 소실점 ↔ 3D 방향", () => {
  it("소실점은 그 방향으로 무한히 간 점의 상이다 (2.2)", () => {
    const d = unit3([0.6, -0.2, 1]);
    const vp = vpOf(d);
    const back = axisDirection(vp, PP, F);
    expect(angleBetween(back, d)).toBeLessThan(1e-6);
    // 아주 먼 점의 상이 소실점에 수렴한다
    const far = project([d[0] * 1e6, d[1] * 1e6, d[2] * 1e6], PP, F)!;
    expect(Math.hypot(far[0] - vp[0], far[1] - vp[1])).toBeLessThan(1e-6);
  });

  it("반례: 광선 방향은 화면 점마다 다르다 — 상수가 아니다", () => {
    const r1 = rayThrough([100, 200], PP, F), r2 = rayThrough([800, 500], PP, F);
    expect(angleBetween(r1, r2)).toBeGreaterThan(10);
  });
});
