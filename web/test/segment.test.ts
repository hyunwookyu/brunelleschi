// G-A **세그먼트 기하** — `docs/segment_plan.md` §1~§3의 성질을 잠근다.
//
// 이번 전환이 주장하는 것은 하나다: **끝점이 정확할 필요가 없다.**
// 그래서 여기서 잠그는 것도 그 주장이다 — 획이 **지나치거나 못 미쳐도** 같은 자리에 놓이는가.
// 옛 방식(끝점이 반경 안이어야 앵커)이 실패하던 입력을 그대로 넣어 본다(반례).
import { describe, it, expect } from "vitest";
import { scene, groundPoint, boxEdges, type Scene } from "./scene3d.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { type PlaceCtx } from "../src/s3d/stroke.js";
import {
  segmentize, settleSegments, resegmentAll, hang, rebuild, sightPlane, pierce, closestOnLines,
  joinByCrossing, sceneScale, segAt, segA, segB, resetSegmentIds, pinCandidates, pointsOf,
  SEG_TOL, type SegStroke, type Segment,
} from "../src/s3d/segment.js";
import { project, sub3, norm3, unit3, dot3, add3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };

/** 참 3D 선분을 화면에 곧게 그린다(노이즈 없이 — 여기서 재는 것은 기하의 성질이다). */
function draw(a: Vec3, b: Vec3, n = 12, jitter = 0): Pt2[] {
  const A = project(a, SC.principal, SC.f)!, B = project(b, SC.principal, SC.f)!;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    // 떨림을 얹어도 **직선(세그먼트)은 그대로여야 한다** — 그것이 오프셋 분리의 요점이다
    const w = jitter * Math.sin(i * 1.9);
    return [A[0] + (B[0] - A[0]) * t + w, A[1] + (B[1] - A[1]) * t - w] as Pt2;
  });
}

/** 선분을 양 끝에서 `k`배 늘리거나 줄인다(지나침·못 미침 재현). */
function stretch(a: Vec3, b: Vec3, k: number): [Vec3, Vec3] {
  const m = mul3(add3(a, b), 0.5), h = mul3(sub3(b, a), 0.5 * k);
  return [sub3(m, h), add3(m, h)];
}

function box() {
  const O = groundPoint(SC, [430, 470])!;
  return boxEdges(SC, O, 1.2, 1.0, 0.9);
}

describe("G-A §1~§2 — 세그먼트가 기하이고 오프셋이 표현이다", () => {
  it("`L(t) + offset`이 원래 3D 점열을 **정확히** 복원한다", () => {
    const e = box()[0];
    const pts = draw(e.a, e.b, 14, 2.5);
    resetSegmentIds();
    const h = segmentize([], pts, e.axis, CTX, { seed: true })!;
    expect(h).not.toBeNull();
    const back = rebuild(h.segment, h.params, h.offsets);
    for (let i = 0; i < back.length; i++) {
      expect(norm3(sub3(back[i], h.pts3d[i]))).toBeLessThan(1e-9);
    }
  });

  it("**손떨림은 오프셋에만 남는다** — 직선 방향은 축 그대로다", () => {
    const e = box()[1];
    resetSegmentIds();
    const clean = segmentize([], draw(e.a, e.b, 14, 0), e.axis, CTX, { seed: true })!;
    const shaky = segmentize([], draw(e.a, e.b, 14, 3.0), e.axis, CTX, { seed: true })!;
    // 방향은 축이 정하므로 떨림과 무관하게 같다
    expect(norm3(sub3(clean.segment.dir, shaky.segment.dir))).toBeLessThan(1e-9);
    // 떨린 획은 오프셋이 커진다(0이 아니다) — 그것이 화면에 보이는 것이다
    const maxOff = Math.max(...shaky.offsets.map(norm3));
    expect(maxOff).toBeGreaterThan(Math.max(...clean.offsets.map(norm3)));
  });

  it("**획이 구간을 정한다**(§2) — 길게 그으면 세그먼트도 길어진다", () => {
    const e = box()[0];
    resetSegmentIds();
    const short = segmentize([], draw(...stretch(e.a, e.b, 0.6), 12), e.axis, CTX, { seed: true })!;
    const long = segmentize([], draw(...stretch(e.a, e.b, 1.4), 12), e.axis, CTX, { seed: true })!;
    const len = (h: typeof short) => Math.abs(h.segment.t1 - h.segment.t0);
    expect(len(long)).toBeGreaterThan(len(short) * 1.8);
  });

  it("그린 시점의 화면 투영이 **원본과 정확히 같다**(§2.1 — 옛 보장 유지)", () => {
    const e = box()[2];
    const pts = draw(e.a, e.b, 16, 2.0);
    resetSegmentIds();
    const h = segmentize([], pts, e.axis, CTX, { seed: true })!;
    for (let i = 0; i < pts.length; i++) {
      const p = project(h.pts3d[i], SC.principal, SC.f)!;
      expect(Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])).toBeLessThan(1e-6);
    }
  });
});

describe("G-A §3 — 시선 평면 교차가 위치를 정한다", () => {
  it("**끝점이 지나쳐도 못 미쳐도 같은 자리에 놓인다**(이번 전환의 핵심 주장)", () => {
    const edges = box();
    resetSegmentIds();
    // 씨앗: 첫 모서리
    const seedH = segmentize([], draw(edges[0].a, edges[0].b), edges[0].axis, CTX, { seed: true })!;
    const placed = [seedH.segment];
    // 그 끝점에서 갈라지는 모서리를 **정확히 / 20% 못 미치게 / 20% 지나치게** 긋는다
    const e = edges.find(x => x.axis !== edges[0].axis
      && norm3(sub3(x.a, edges[0].a)) < 1e-6)!;
    const cases = [1.0, 0.8, 1.25].map(k => {
      const [a, b] = k === 1 ? [e.a, e.b] : (() => {
        const d = sub3(e.b, e.a);
        return [add3(e.a, mul3(d, (1 - k) * 0.5)), add3(e.a, mul3(d, 1 - (1 - k) * 0.5))] as [Vec3, Vec3];
      })();
      const h = segmentize(placed, draw(a, b), e.axis, CTX, {});
      return h;
    });
    for (const h of cases) expect(h).not.toBeNull();
    // 세 경우의 **직선이 같다**(원점이 직선 위에서 다를 수는 있으므로 직선끼리 비교한다)
    const [ok, sh, lo] = cases.map(h => h!.segment);
    for (const other of [sh, lo]) {
      expect(norm3(sub3(other.dir, ok.dir))).toBeLessThan(1e-9);
      const w = sub3(other.origin, ok.origin);
      const perp = norm3(sub3(w, mul3(ok.dir, dot3(w, ok.dir))));
      expect(perp).toBeLessThan(1e-6);          // 같은 직선이다
    }
  });

  it("반례: **화면에서 가로지르지 않으면** 안 놓는다(무관한 것이 안 붙는다)", () => {
    const edges = box();
    resetSegmentIds();
    const seedH = segmentize([], draw(edges[0].a, edges[0].b), edges[0].axis, CTX, { seed: true })!;
    // 상자에서 멀리 떨어진 자리에 같은 축으로 긋는다 — 붙을 이유가 없다
    const far = edges[3];
    const off = mul3(unit3([1, -1, 0.5]), 4.0);
    const h = segmentize([seedH.segment], draw(add3(far.a, off), add3(far.b, off)), far.axis, CTX, {});
    expect(h).toBeNull();
  });

  it("시선 평면은 눈을 지나고 그린 두 점의 광선을 담는다", () => {
    const n = sightPlane([300, 300], [500, 380], CTX)!;
    for (const p of [[300, 300], [500, 380]] as Pt2[]) {
      const r = unit3([p[0] - CTX.principal[0], p[1] - CTX.principal[1], CTX.f]);
      expect(Math.abs(dot3(n, r))).toBeLessThan(1e-9);
    }
  });

  it("나란한 세그먼트는 시선 평면을 안 뚫는다(0으로 나누지 않는다)", () => {
    const e = box()[0];
    resetSegmentIds();
    const h = segmentize([], draw(e.a, e.b), e.axis, CTX, { seed: true })!;
    // 그 세그먼트 자신의 시선 평면 — 자기 자신은 그 평면 **안에** 있으므로 못 뚫는다
    const rep = { a: project(e.a, SC.principal, SC.f)!, b: project(e.b, SC.principal, SC.f)! };
    const n = sightPlane(rep.a, rep.b, CTX)!;
    expect(pierce(h.segment, n)).toBeNull();
  });
});

describe("G-A §3.1 — 씨앗 하나로 전파된다", () => {
  it("상자 12모서리가 **씨앗 하나**로 전부 놓인다", () => {
    const edges = box();
    resetSegmentIds();
    const items: SegStroke[] = edges.map((e, i) => {
      const pts = draw(e.a, e.b, 12, 1.2);
      const v = classifyStroke(pts, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
      return { id: `s${i}`, pts2d: pts, axis: v.axis, rep: v.rep ?? undefined, hung: null };
    });
    const n = settleSegments(items, CTX);
    expect(n).toBe(12);
    expect(items.every(x => x.hung)).toBe(true);
    // 씨앗은 하나뿐이다 — 나머지는 전부 교차가 위치를 줬다
    expect(items.filter(x => x.hung!.pinnedBy === null).length).toBe(1);
  });

  it("놓인 상자가 **참값과 맞다**(씨앗 깊이가 전체 배율을 정한다)", () => {
    const edges = box();
    resetSegmentIds();
    const items: SegStroke[] = edges.map((e, i) => {
      const pts = draw(e.a, e.b, 12, 0);
      const v = classifyStroke(pts, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
      return { id: `s${i}`, pts2d: pts, axis: v.axis, rep: v.rep ?? undefined, hung: null };
    });
    settleSegments(items, CTX);
    const diag3 = norm3(sub3(edges[11].b, edges[0].a));
    let worst = 0;
    items.forEach((x, i) => {
      const p = pointsOf(x);
      worst = Math.max(worst, norm3(sub3(p[0], edges[i].a)) / diag3,
                       norm3(sub3(p[p.length - 1], edges[i].b)) / diag3);
    });
    expect(worst).toBeLessThan(0.02);       // 노이즈 없는 입력에서는 거의 정확해야 한다
  });

  it("**지지 수로 고른다** — 화면에서만 가로지르는 먼 모서리에 안 붙는다(D-G1)", () => {
    // 이 검사가 없으면 상자 12모서리 중 **둘이 0.6~0.87 틀리게** 놓였다(측정으로 확인했다).
    // 먼 모서리가 가까운 것을 화면에서 가로지르면 그 교차점이 엉뚱한 깊이를 주기 때문이다.
    const edges = box();
    resetSegmentIds();
    const items: SegStroke[] = edges.map((e, i) => {
      const pts = draw(e.a, e.b, 12, 0);
      const v = classifyStroke(pts, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
      return { id: `s${i}`, pts2d: pts, axis: v.axis, rep: v.rep ?? undefined, hung: null };
    });
    settleSegments(items, CTX);
    // **후보가 여럿인 획은 지지가 2 이상**이어야 한다(양 끝에서 만나는 것을 함께 설명한다)
    const many = items.filter(x => x.hung && x.hung.support >= 2);
    expect(many.length).toBeGreaterThanOrEqual(4);
    // 그리고 전부 참값에 맞는다
    const diag3 = norm3(sub3(edges[11].b, edges[0].a));
    items.forEach((x, i) => {
      const p = pointsOf(x);
      expect(norm3(sub3(p[0], edges[i].a)) / diag3).toBeLessThan(0.02);
    });
  });

  it("`resegmentAll`이 `pts2d`만으로 같은 결과를 낸다(카메라 재계산 경로)", () => {
    const edges = box();
    resetSegmentIds();
    const items: SegStroke[] = edges.map((e, i) => {
      const pts = draw(e.a, e.b, 12, 1.0);
      const v = classifyStroke(pts, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
      return { id: `s${i}`, pts2d: pts, axis: v.axis, rep: v.rep ?? undefined, hung: null };
    });
    settleSegments(items, CTX);
    const before = items.map(pointsOf);
    resegmentAll(items, CTX);
    items.forEach((x, i) => {
      const now = pointsOf(x);
      expect(now.length).toBe(before[i].length);
      for (let k = 0; k < now.length; k++) {
        expect(norm3(sub3(now[k], before[i][k]))).toBeLessThan(1e-9);
      }
    });
  });
});

describe("G-A §3 — 3D 교차 접합", () => {
  it("스치는 두 세그먼트가 교차점까지 **연장된다**", () => {
    const edges = box();
    resetSegmentIds();
    const a = segmentize([], draw(edges[0].a, edges[0].b), edges[0].axis, CTX, { seed: true })!;
    const e = edges.find(x => x.axis !== edges[0].axis && norm3(sub3(x.a, edges[0].a)) < 1e-6)!;
    // **모서리에 못 미치게** 긋는다 — 교차 접합이 그 간격을 메워야 한다
    const d = sub3(e.b, e.a);
    const b = segmentize([a.segment], draw(add3(e.a, mul3(d, 0.15)), e.b), e.axis, CTX, {})!;
    const beforeLen = Math.abs(b.segment.t1 - b.segment.t0);
    const n = joinByCrossing(b.segment, [a.segment], sceneScale([a.segment, b.segment]));
    expect(n).toBe(1);
    expect(Math.abs(b.segment.t1 - b.segment.t0)).toBeGreaterThan(beforeLen);
    expect(b.segment.joints.length).toBe(1);
    // 연장된 끝이 참 모서리 끝에 가깝다
    const diag3 = norm3(sub3(edges[11].b, edges[0].a));
    const ends = [segA(b.segment), segB(b.segment)];
    const best = Math.min(...ends.map(p => norm3(sub3(p, e.a)) / diag3));
    expect(best).toBeLessThan(0.03);
  });

  it("반례: **멀리 스치는 것**은 접합하지 않는다", () => {
    const edges = box();
    resetSegmentIds();
    const a = segmentize([], draw(edges[0].a, edges[0].b), edges[0].axis, CTX, { seed: true })!;
    const far: Segment = { id: "far", axis: 2, origin: add3(edges[0].a, [0, 0, 6]),
                           dir: unit3([0, 1, 0.2]), t0: 0, t1: 1, joints: [] };
    const n = joinByCrossing(a.segment, [far], sceneScale([a.segment]));
    expect(n).toBe(0);
    expect(a.segment.joints.length).toBe(0);
  });

  it("나란한 두 직선은 최근접점이 없다(`null`)", () => {
    resetSegmentIds();
    const a: Segment = { id: "a", axis: 0, origin: [0, 0, 5], dir: [1, 0, 0], t0: 0, t1: 1, joints: [] };
    const b: Segment = { id: "b", axis: 0, origin: [0, 1, 5], dir: [1, 0, 0], t0: 0, t1: 1, joints: [] };
    expect(closestOnLines(a, b)).toBeNull();
  });
});
