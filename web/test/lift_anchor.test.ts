// **확정 순간의 연결**(2026-08-19 15차 항목 1 · D-L98) — 결함 **둘**을 갈라 잠근다.
//
// ```
// (a) 선언된 연결이 제약이 아니었다   → 붙여 그은 획이 "구조에 안 이어졌다"로 2D에 남는다
//                                      (lift.ts `DeclaredJoint`)
// (b) 놓여도 끝점이 `rep`였다          → 붙여 그은 두 획의 그 끝이 3D에서 떨어진다
//                                      (liftAnchor.ts `anchorToTarget`)
// ```
//
// 둘 다 **프리핸드에서만** 난다: 획이 두 점으로 접힌 경우(방향·끝점 스냅이 걸려
// `resolve2dCore`가 `pts = [a, b]`를 낸 획)는 `representative`가 그 두 점을 정확히 지나
// 어긋남이 0이다. 그래서 마우스 합성 픽스처(삼각형 25구도)에서는 **간격이 전부 0**이었고
// 이 결함이 안 보였다 — **프리핸드가 판정자다**(#12: 동작점을 하나 고르지 않는다).
//
// ⚠ **버그를 되살려 실제로 잡는지 확인한다**(A-4): 각 성질마다 **수리 전 팔**이 먼저
// 결함을 실측으로 재현하고, 그다음 팔이 수리 뒤를 잠근다. 되살림 팔이 없으면 "0이다"만
// 남아 무엇을 고쳤는지 안 보인다(#30·#25).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   되맞춤 뒤의 "간격 0"은 **설계 보장**이다(두 끝을 같은 점으로 모았으므로) — 판정
//        대상은 그 보장이 아니라 **수리 전 팔의 값**(실측)이다. 둘을 갈라 적는다
//   #11  비율이 아니라 분자/분모 — 간격 px·놓인 수/전체를 그대로 낸다
//   #17  새 솔버를 안 만든다(`endFromCursor` 재사용) · 규약은 `placeLive` 그대로
//   #30  측정 스위치(`S2S.setLiftAnchor`)가 수리 전 거동을 되살린다
//   #40  도달 가능성: 수리 전 팔의 값이 **0이 아님**을 단언으로 박는다
//   #49  "떨어졌다"를 재는 단위는 **연결이 쓰는 단위**(두 획의 그 끝 사이 거리)다 —
//        `residual`(깊이 불일치)이 아니다
import { describe, it, expect } from "vitest";
import { liftAll, type LiftStroke, type LiftCtx, type DeclaredJoint } from "../src/s3d/lift.js";
import { anchorToTarget } from "../src/s3d/liftAnchor.js";
import { project, norm3, sub3, unit3, dot3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint } from "./scene3d.js";
import { rng32 } from "../src/s3d/synthInk.js";

const SZ: [number, number] = [1280, 675];

/**
 * **붙여 그린 사슬** — 상자 모서리 셋(O→A 축0 · A→AB 축1 · AB→ABu 축2)을 프리핸드로 긋고,
 * 앱의 2D 오스냅이 하는 것과 **같이** 뒤 획의 시작점을 앞 획의 **그린 끝점**으로 옮긴다
 * (`resolve2dCore`의 시작점 가지: `pts = [a, ...raw.slice(1)]` — 끝 스냅이 없으면 원시
 * 꼬리가 남는다. 그 형태가 결함의 조건이다).
 */
function chainFixture(grade: "precise" | "medium" | "coarse" = "medium", seed = 7) {
  const sc = scene(35, 15, 1000, SZ);
  const O = groundPoint(sc, [520, 430])!;
  const all = boxEdges(sc, O, 1.2, 1.0, 0.9);
  const drawn = drawEdges(sc, [all[0], all[3], all[7]], grade, rng32(seed), 0.12, 0, 0)!;
  const strokes = drawn.map((d, i) => ({ id: `c${i}`, pts2d: d.pts2d.map(p => [p[0], p[1]] as Pt2),
                                         axis: d.axis }));
  const links: { id: string; ofId: string; at: Pt2 }[] = [];
  for (let i = 1; i < strokes.length; i++) {
    const prev = strokes[i - 1].pts2d;
    const at: Pt2 = [prev[prev.length - 1][0], prev[prev.length - 1][1]];
    strokes[i].pts2d[0] = [at[0], at[1]];
    links.push({ id: strokes[i].id, ofId: strokes[i - 1].id, at });
  }
  const ctx: LiftCtx = { principal: sc.principal, f: sc.f,
                         vps: [sc.vps[0], sc.vps[1], sc.vps[2]], imgSize: SZ };
  const declared: DeclaredJoint[] = links.map(l => ({ i: l.id, j: l.ofId, q: l.at }));
  return { sc, ctx, strokes: strokes as LiftStroke[], links, declared };
}

/** 두 세그먼트에서 **서로 가장 가까운 끝점 쌍**의 3D 거리 — "연결"의 단위다(#49). */
const pairGap = (a: [Vec3, Vec3], b: [Vec3, Vec3]): number =>
  Math.min(...a.flatMap(p => b.map(q => norm3(sub3(p, q)))));

/** 기하 크기 — 상대 간격의 분모(#11). */
const sizeOf = (segs: [Vec3, Vec3][]): number => Math.max(...segs.flat().map(p => norm3(p)));

const segsOf = (r: ReturnType<typeof liftAll>) =>
  new Map([...r.placed].map(([k, v]) => [k, [v.a, v.b] as [Vec3, Vec3]]));

describe("(a) 선언된 연결이 제약이다 (D-L98)", () => {
  it("**되살림 팔** — 선언을 안 넘기면 붙여 그은 획이 구조에서 떨어진다", () => {
    const { ctx, strokes } = chainFixture();
    const r = liftAll(strokes, ctx);
    // 도달 가능성(#40): 셋 중 하나가 실제로 떨어져야 이 파일이 무언가를 잡는다
    expect(r.placed.size).toBe(2);
    expect(r.unplaced.map(u => u.reason)).toContain("구조에 이어지지 않았다");
  });

  it("선언을 넘기면 셋 다 놓인다", () => {
    const { ctx, strokes, declared } = chainFixture();
    const r = liftAll(strokes, ctx, {}, declared);
    expect(r.placed.size).toBe(3);
    expect(r.joints.filter(j => j.declared).length).toBe(declared.length);
  });

  it("**왜 떨어졌나** — 대표 직선 교점이 그린 모서리에서 접합 반경 밖이다", () => {
    const { ctx, strokes, links } = chainFixture();
    const r = liftAll(strokes, ctx, {}, []);
    // 검출된 접합이 선언된 짝 하나를 못 담았다 — 그것이 (a)의 기전이다
    const found = new Set(r.joints.map(j => [j.i, j.j].sort().join("|")));
    const missing = links.filter(l => !found.has([l.id, l.ofId].sort().join("|")));
    expect(missing.length).toBeGreaterThan(0);
  });

  it("**반례** — 같은 축 선언은 제약이 아니다(3D에서 나란한 두 직선은 점을 안 나눈다)", () => {
    const { ctx, strokes, links } = chainFixture();
    const same: DeclaredJoint[] = [{ i: strokes[0].id, j: strokes[0].id, q: links[0].at }];
    const r = liftAll(strokes, ctx, {}, same);
    expect(r.joints.filter(j => j.declared).length).toBe(0);
  });

  it("**반례** — 없는 획을 가리키는 선언은 무시된다", () => {
    const { ctx, strokes, links } = chainFixture();
    const r = liftAll(strokes, ctx, {}, [{ i: strokes[1].id, j: "없다", q: links[0].at }]);
    expect(r.joints.filter(j => j.declared).length).toBe(0);
  });
});

describe("(b) 확정 배치의 연결 되맞춤 (D-L98)", () => {
  it("**되살림 팔** — 되맞춤이 없으면 붙여 그린 두 획의 그 끝이 떨어져 있다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    const G = sizeOf([...segs.values()]);
    const gaps = links.map(l => pairGap(segs.get(l.id)!, segs.get(l.ofId)!) / G);
    expect(Math.max(...gaps)).toBeGreaterThan(1e-3);      // 도달 가능성(#40)
  });

  it("되맞추면 두 획의 그 끝이 **같은 점**이 된다 (보장 — #5)", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    for (const l of links) {                               // 문서 순서 = 사슬 순서
      const out = anchorToTarget(segs.get(l.id)!, segs.get(l.ofId)!, l.at, "endpoint", ctx)!;
      expect(out).toBeTruthy();
      segs.set(l.id, out.seg);
      segs.set(l.ofId, out.target);
      expect(out.targetSlot).not.toBeNull();
    }
    const G = sizeOf([...segs.values()]);
    for (const l of links) {
      expect(pairGap(segs.get(l.id)!, segs.get(l.ofId)!) / G).toBeLessThan(1e-12);
    }
  });

  it("**대상 직선은 안 바뀐다** — 대상은 자기 직선 위에서 미끄러질 뿐이다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    const l = links[0];
    const tgt = segs.get(l.ofId)!;
    const out = anchorToTarget(segs.get(l.id)!, tgt, l.at, "endpoint", ctx)!;
    const before = unit3(sub3(tgt[1], tgt[0]));
    const after = unit3(sub3(out.target[1], out.target[0]));
    expect(Math.abs(Math.abs(dot3(before, after)) - 1)).toBeLessThan(1e-12);
  });

  it("**이은 획의 3D 방향(축)이 안 돈다** — 앵커에 물리고 반대 끝을 광선에서 받는다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    for (const l of links) {
      const out = anchorToTarget(segs.get(l.id)!, segs.get(l.ofId)!, l.at, "endpoint", ctx)!;
      expect(out.keptDir).toBe(true);
      expect(out.turnDeg).toBeLessThan(1e-9);       // 보장(#5)
    }
  });

  it("**되살림 팔** — 방향을 안 물리면(`keepDir = false`) 축이 돈다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    const turns = links.map(l =>
      anchorToTarget(segs.get(l.id)!, segs.get(l.ofId)!, l.at, "endpoint", ctx, false)!.turnDeg);
    expect(Math.max(...turns)).toBeGreaterThan(0);  // 도달 가능성(#40)
  });

  it("**반례** — 몸통 연결(중점·교차점·수선 발·선 위)은 대상의 끝을 안 옮긴다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    const l = links[0];
    const tgt = segs.get(l.ofId)!;
    for (const kind of ["midpoint", "intersection", "perpendicular", "on_edge"] as const) {
      const out = anchorToTarget(segs.get(l.id)!, tgt, l.at, kind, ctx)!;
      expect(out.targetSlot).toBeNull();
      expect(out.target).toEqual(tgt);
    }
  });

  it("**반례** — 대상이 한 점이면 놓지 않는다", () => {
    const ctx: LiftCtx = { principal: [640, 337], f: 1000, vps: [null, null, null], imgSize: SZ };
    const a: Vec3 = [0, 0, 2], b: Vec3 = [1, 0, 2];
    expect(anchorToTarget([a, b], [a, a], project(a, ctx.principal, ctx.f)!, "endpoint", ctx))
      .toBeNull();
  });

  it("**반례** — 카메라 뒤 끝점은 되쏘기가 없으므로 놓지 않는다", () => {
    const ctx: LiftCtx = { principal: [640, 337], f: 1000, vps: [null, null, null], imgSize: SZ };
    const behind: [Vec3, Vec3] = [[0, 0, -2], [1, 0, 2]];
    const tgt: [Vec3, Vec3] = [[0, 0, 2], [0, 1, 2]];
    expect(anchorToTarget(behind, tgt, [640, 337], "endpoint", ctx)).toBeNull();
  });

  it("**끝 순서가 뒤집혀 있어도** 화면에서 가까운 끝이 움직인다", () => {
    const { ctx, strokes, links, declared } = chainFixture();
    const segs = segsOf(liftAll(strokes, ctx, {}, declared));
    const l = links[0];
    const seg = segs.get(l.id)!, tgt = segs.get(l.ofId)!;
    const fwd = anchorToTarget(seg, tgt, l.at, "endpoint", ctx)!;
    const rev = anchorToTarget([seg[1], seg[0]], tgt, l.at, "endpoint", ctx)!;
    expect(fwd.slot).not.toBe(rev.slot);
    expect(norm3(sub3(fwd.seg[fwd.slot], rev.seg[rev.slot]))).toBeLessThan(1e-12);
  });
});
