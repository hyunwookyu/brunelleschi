// S-7 **사용자 지정 배치** — D-S15 (b)~(d)의 구현을 잠근다.
//
// A-3의 "애매하면 놓지 않는다"는 **버린다**는 뜻이 아니었다. 자동 경로가 놓지 못한 획
// (배치율 0.53~0.82)과 **일관되게 틀리게 놓인 획**(S-6 1의 잔여 한계)이 이 경로로 온다.
//
// **검사하지 않는다 — 사용자가 판단했다.** 그러므로 여기서 잠글 것은 정확도가 아니라
// **무엇이 정해지고 무엇이 미확정인가**이다:
//   축이 있고 한쪽 → 확정 · 축이 없고 양쪽 → 확정 · 축이 없고 한쪽 → **미확정**.
import { describe, it, expect } from "vitest";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, placeByUser, placeAtDepth, depthRange,
         anchorCandidates, PLACE_TOL, diagOf,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { norm3, sub3, add3, mul3, unit3, project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { FIRST_VIEW_OPTS } from "../src/s3d/appPlace.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { toView, fromView, projectInView, type ViewPose } from "../src/s3d/viewCamera.js";
import { scene, groundPoint, boxEdges, drawEdges, type Scene } from "./scene3d.js";

const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
/** **앱과 같은 배치 옵션**(S-7 0) — 하네스가 따로 적지 않는다. */
const APP = FIRST_VIEW_OPTS;

/** 상자 하나를 세우고 참 3D를 함께 낸다. */
function box(seed: number) {
  const r = rng32(seed);
  const O = groundPoint(SC, [430, 470])!;
  const edges = boxEdges(SC, O, 1.2, 1.0, 0.9);
  const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01)!;
  resetStrokeIds();
  const list: Stroke[] = drawn.map(d => {
    const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                             { principal: SC.principal, f: SC.f });
    return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  });
  settle(list, CTX, APP);
  return { list, edges, r, diag3: norm3(sub3(edges[11].b, edges[0].a)) };
}

/** 참 3D 점열을 화면에 그린다(노이즈 없이 — 여기서 재는 것은 정확도가 아니라 **결정성**이다). */
const toScreen = (pts: Vec3[]): Pt2[] =>
  pts.map(p => project(p, SC.principal, SC.f)!).filter(Boolean) as Pt2[];

describe("S-7 사용자 지정 배치", () => {
  it("축이 있고 한쪽을 고르면 **확정**된다 — 축 + 앵커가 획 전체를 정한다", () => {
    const { list, edges } = box(4242);
    const anchor = list[0].pts3d[0];
    const s = newStroke(toScreen([edges[0].a, edges[0].b]), 0);
    const r = placeByUser(s, CTX, { a: anchor });
    expect(r).not.toBeNull();
    expect(r!.provisional).toBe(false);
    expect(norm3(sub3(r!.pts3d[0], anchor))).toBeLessThan(1e-9);   // 끝점 접합
  });

  it("축이 없고 **양쪽**을 고르면 확정된다 — 두 앵커가 평면을 정한다", () => {
    const { list, edges } = box(4242);
    const A = list[0].pts3d[0], B = list[3].pts3d[list[3].pts3d.length - 1];
    // 대각선 하나를 미분류로 두고 양 끝을 지정한다
    const s = newStroke(toScreen([edges[0].a, edges[3].b]), "free");
    const r = placeByUser(s, CTX, { a: A, b: B });
    expect(r).not.toBeNull();
    expect(r!.provisional).toBe(false);
    expect(norm3(sub3(r!.pts3d[0], A))).toBeLessThan(1e-9);
    expect(norm3(sub3(r!.pts3d[r!.pts3d.length - 1], B))).toBeLessThan(1e-9);
  });

  it("축이 없고 **한쪽만** 고르면 **미확정**이다 — 깊이 근거가 앵커 하나뿐이다", () => {
    const { list, edges } = box(4242);
    const A = list[0].pts3d[0];
    const s = newStroke(toScreen([edges[0].a, edges[3].b]), "free");
    const r = placeByUser(s, CTX, { a: A });
    expect(r).not.toBeNull();
    expect(r!.provisional).toBe(true);
    // 화면 평행 평면이므로 **모든 점의 깊이가 같다** — 그것이 "미확정"의 내용이다
    for (const p of r!.pts3d) expect(Math.abs(p[2] - A[2])).toBeLessThan(1e-9);
  });

  it("반례: 아무것도 안 고르면 놓지 않는다", () => {
    const { edges } = box(4242);
    const s = newStroke(toScreen([edges[0].a, edges[0].b]), 0);
    expect(placeByUser(s, CTX, {})).toBeNull();
  });

  it("깊이를 직접 주면 그 깊이에 놓인다. 0 이하는 거절한다(카메라 뒤)", () => {
    const { edges } = box(4242);
    const pts = toScreen([edges[0].a, edges[0].b]);
    const got = placeAtDepth(pts, 7.5, CTX)!;
    expect(got).not.toBeNull();
    for (const p of got) expect(Math.abs(p[2] - 7.5)).toBeLessThan(1e-9);
    expect(placeAtDepth(pts, 0, CTX)).toBeNull();
    expect(placeAtDepth(pts, -3, CTX)).toBeNull();
  });

  it("**화면 이미지는 보존된다** — 사용자 지정 경로에서도 각 점이 자기 광선 위에 있다", () => {
    const { list, edges } = box(4242);
    const A = list[0].pts3d[0];
    const pts = toScreen([edges[0].a, edges[3].b]);
    const s = newStroke(pts, "free");
    const r = placeByUser(s, CTX, { a: A })!;
    // 접합한 첫 점만 빼고 재투영이 원본과 같다(§4의 설계 보장 — 임계를 걸지 않는다)
    for (let i = 1; i < r.pts3d.length; i++) {
      const q = project(r.pts3d[i], SC.principal, SC.f)!;
      expect(Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])).toBeLessThan(1e-6);
    }
  });

  it("**일관되게 틀린 배치를 되돌릴 수 있다**(D-S15 d) — 놓인 획도 다시 지정된다", () => {
    const { list, edges, diag3 } = box(4242);
    const s = list[4];
    expect(s.pts3d.length).toBeGreaterThan(0);
    // 일부러 엉뚱한 곳에 놓는다(가림으로 잘못 붙은 상태를 흉내)
    const bad = placeAtDepth(s.pts2d, s.pts3d[0][2] * 1.6, CTX)!;
    s.pts3d = bad;
    const errBad = norm3(sub3(s.pts3d[0], edges[4].a)) / diag3;
    expect(errBad).toBeGreaterThan(0.2);
    // 사용자가 옳은 앵커를 고른다
    const radius = PLACE_TOL.join_ratio * diagOf(CTX.imgSize) * 3;
    const others = list.filter(t => t.id !== s.id && t.pts3d.length);
    const cands = anchorCandidates(others, s.pts2d[0], radius);
    expect(cands.length).toBeGreaterThan(0);
    const r = placeByUser(s, CTX, { a: cands[0].pos })!;
    expect(norm3(sub3(r.pts3d[0], edges[4].a)) / diag3).toBeLessThan(errBad);
  });

  it("**돌린 시점에서 지정해도 세계 좌표가 맞는다**(S-7 4) — 좌표계만 오간다", () => {
    const { list, edges } = box(4242);
    // 임의의 시점 하나. 앱은 `viewport.pose()`가 주고 여기서는 손으로 만든다.
    const pose: ViewPose = {
      R: [[0.8, 0, 0.6], [0, 1, 0], [-0.6, 0, 0.8]],
      C: [0.4, -0.2, 0.3],
    };
    const ctxV: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
    // 기존 획의 앵커를 뷰 좌표로 옮긴다(앱의 `refreshCandidates3d`가 하는 것)
    const anchorW = list[0].pts3d[0];
    const anchorV = toView(pose, anchorW);
    // 그 시점의 화면에 그린 획
    const ptsV = [edges[0].a, edges[3].b]
      .map(p => projectInView(pose, p, ctxV.principal, ctxV.f)!) as Pt2[];
    const s = newStroke(ptsV, "free");
    const r = placeByUser(s, ctxV, { a: anchorV })!;
    expect(r).not.toBeNull();
    // **세계 좌표로 되돌리면 고른 앵커 그 점이어야 한다** — 좌표계 왕복이 손실 없이 닫힌다
    const back = r.pts3d.map(p => fromView(pose, p));
    expect(norm3(sub3(back[0], anchorW))).toBeLessThan(1e-9);
  });

  it("깊이 범위는 놓인 획에서 나온다. 놓인 획이 없으면 `null`", () => {
    const { list } = box(4242);
    const zr = depthRange(list)!;
    expect(zr).not.toBeNull();
    expect(zr[0]).toBeLessThan(zr[1]);
    expect(depthRange([])).toBeNull();
    expect(depthRange([newStroke([[0, 0], [1, 1]], "free")])).toBeNull();
  });
});
