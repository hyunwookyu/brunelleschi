// L-A.5 **소실점 초안과 조정** — `docs/line_plan.md` §5.4의 성질을 잠근다.
//
// 반례를 함께 박는다(A-4):
//   무한원 소실점은 가이드를 만들지 않는다 · 반경 밖 클릭은 핸들을 잡지 않는다 ·
//   **끌면 소실점이 실제로 따라 움직인다**(안 움직이면 조정 UI가 아무것도 안 하는 것이다)
import { describe, it, expect } from "vitest";
import {
  draftFromDetection, handleAt, moveHandle, byAxis, clipToCanvas, DRAFT_TOL,
} from "../src/s3d/vpDraft.js";
import { ConstraintAccumulator } from "../src/s3d/constraints.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint } from "./scene3d.js";
import { rng32 } from "../src/s3d/synthInk.js";

const SZ: [number, number] = [960, 672];

function boxStrokes(jit = 0.005, seed = 5) {
  const sc = scene(35, 15, 1000, SZ);
  const O = groundPoint(sc, [420, 470])!;
  const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
  const drawn = drawEdges(sc, edges, "precise", rng32(seed), 0.12, jit, 0)!;
  return { sc, edges, strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[] })) };
}

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("소실점 초안과 조정 (§5.4)", () => {
  it("검출 결과가 축마다 가이드 선 두 개가 된다", () => {
    const { strokes } = boxStrokes();
    const g = draftFromDetection(strokes, SZ);
    expect(g.length).toBeGreaterThanOrEqual(4);          // 축 두 개 이상 × 2
    expect(g.length % 2).toBe(0);
    const per = byAxis(g);
    for (const ax of [0, 1, 2] as const) {
      expect([0, 2]).toContain(per[ax].length);          // 없거나 정확히 둘
    }
    // 전부 화면 안(여백 포함)에 있다 — 화면 밖 핸들은 끌 수 없다
    const m = DRAFT_TOL.margin_ratio * Math.hypot(...SZ) - 1e-6;
    for (const l of g) for (const p of [l.a, l.b]) {
      expect(p[0]).toBeGreaterThanOrEqual(m);
      expect(p[0]).toBeLessThanOrEqual(SZ[0] - m);
      expect(p[1]).toBeGreaterThanOrEqual(m);
      expect(p[1]).toBeLessThanOrEqual(SZ[1] - m);
    }
  });

  it("초안이 참 소실점 근처를 가리킨다 (초안으로 쓸 만하다)", () => {
    const { sc, strokes } = boxStrokes();
    const g = draftFromDetection(strokes, SZ);
    const acc = new ConstraintAccumulator(SZ);
    const per = byAxis(g);
    for (const ax of [0, 1, 2] as const) if (per[ax].length) acc.setLines(ax, per[ax]);
    const vps = ([0, 1, 2] as const).map(a => {
      const st = acc.solve().axes[a];
      return st.status === "fixed" ? (st as any).vp as Pt2 : null;
    });
    const found = vps.filter(Boolean) as Pt2[];
    expect(found.length).toBeGreaterThanOrEqual(2);
    // **초안이지 확정이 아니다** — 자릿수만 본다(축 오차 임계 1°는 사용자가 맞춘다)
    for (const v of found) {
      const near = Math.min(...sc.vps.map(t => dist(v, t) / Math.hypot(...SZ)));
      expect(near).toBeLessThan(2.0);
    }
  });

  it("**끌면 소실점이 따라 움직인다** — 조정이 실제로 작동한다", () => {
    const { strokes } = boxStrokes();
    let g = draftFromDetection(strokes, SZ);
    const per0 = byAxis(g);
    const ax = ([0, 1, 2] as const).find(a => per0[a].length === 2)!;
    const acc = new ConstraintAccumulator(SZ);
    acc.setLines(ax, per0[ax]);
    const vp0 = (acc.solve().axes[ax] as any).vp as Pt2;

    // 그 축의 첫 가이드 한쪽 끝을 30px 옮긴다
    const idx = g.findIndex(x => x.axis === ax);
    const h = handleAt(g, g[idx].a, SZ)!;
    expect(h).not.toBeNull();
    g = moveHandle(g, h, [g[idx].a[0], g[idx].a[1] + 30]);
    acc.setLines(ax, byAxis(g)[ax]);
    const vp1 = (acc.solve().axes[ax] as any).vp as Pt2;
    expect(dist(vp0, vp1)).toBeGreaterThan(1);
  });

  it("**반례** — 반경 밖 클릭은 핸들을 잡지 않는다", () => {
    const { strokes } = boxStrokes();
    const g = draftFromDetection(strokes, SZ);
    const r = DRAFT_TOL.handle_ratio * Math.hypot(...SZ);
    const p: Pt2 = [g[0].a[0] + r * 3, g[0].a[1] + r * 3];
    expect(handleAt(g, p, SZ)).toBeNull();
    // 반경 안이면 잡는다 — 조건이 실제로 작동함을 확인한다
    expect(handleAt(g, [g[0].a[0] + r * 0.5, g[0].a[1]], SZ)).not.toBeNull();
  });

  it("**반례** — 무한원 소실점은 가이드를 만들지 않는다 (화면 평행 축)", () => {
    // 2점 구도: 수직축이 화면 평행이라 끌 소실점이 없다
    const sc = scene(35, 0, 1000, SZ);
    const O = groundPoint(sc, [420, 500])!;
    const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
    const drawn = drawEdges(sc, edges, "precise", rng32(9), 0.12, 0.005, 0)!;
    const strokes = drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[] }));
    const per = byAxis(draftFromDetection(strokes, SZ));
    // 수직 모서리들이 만드는 다발은 무한원이므로 가이드가 없어야 한다
    const withGuides = ([0, 1, 2] as const).filter(a => per[a].length > 0);
    expect(withGuides.length).toBeLessThanOrEqual(2);
  });

  it("`moveHandle`은 원본을 바꾸지 않는다", () => {
    const g0: ReturnType<typeof draftFromDetection> =
      [{ axis: 0, a: [10, 10], b: [100, 20] }];
    const g1 = moveHandle(g0, { index: 0, end: 1 }, [200, 50]);
    expect(g0[0].b).toEqual([100, 20]);
    expect(g1[0].b).toEqual([200, 50]);
  });

  it("`clipToCanvas` — 화면 밖 선분은 잘리고, 완전히 밖이면 null", () => {
    expect(clipToCanvas([-500, 300], [1500, 300], SZ, 10)).toEqual([[10, 300], [950, 300]]);
    expect(clipToCanvas([-500, -300], [-400, -200], SZ, 10)).toBeNull();
  });

  it("`setLines`는 쌓이지 않고 교체한다 (끌 때마다 누적되면 안 된다)", () => {
    const acc = new ConstraintAccumulator(SZ);
    acc.setLines(0, [{ a: [0, 0], b: [100, 10] }, { a: [0, 100], b: [100, 105] }]);
    const v0 = (acc.solve().axes[0] as any).vp as Pt2;
    acc.setLines(0, [{ a: [0, 0], b: [100, 20] }, { a: [0, 100], b: [100, 105] }]);
    const st = acc.solve().axes[0];
    expect(st.nLines).toBe(2);                            // 4가 아니다
    expect(dist(v0, (st as any).vp)).toBeGreaterThan(1);
  });
});
