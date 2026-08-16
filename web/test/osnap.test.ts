// **오스냅 — 양 끝 스냅이 축 밖 선을 놓는다**(D-L46). 규칙과 반례를 잠근다.
//
// 사람 지시(2026-08-16): "**양 끝이 스냅으로 확정되면 축을 벗어난 선도 3D가 나온다.**
// 면 위 사선과 자유 세그먼트를 대체한다 — 추론이 아니라 사용자가 두 점을 지정하는 것이 된다."
//
// 여기서 잠그는 것 넷:
//   ① 정점은 **여러 획이 만나는 끝점**이고 위치는 끝점과 같다(표시만 다르다)
//   ② 승격에서 **양 끝이 다 살아나면 두 점으로 놓고**, 하나라도 못 살리면 **안 놓는다**(반례)
//   ③ 두 점 배치는 **축을 안 붙인다**(추정 금지) — `axis`가 미분류로 남는다
//   ④ 저장·복원이 `snapEnd`를 넘긴다(옛 저장본은 `null`)
import { describe, it, expect } from "vitest";
import { staticCandidates, snapCandidates, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { promoteOrder, type OrderStroke } from "../src/s3d/promoteOrder.js";
import { serializeDoc2, restoreDoc2 } from "../src/ui/docStore.js";
import { newSStroke, newView, type DocState } from "../src/ui/doc.js";
import { project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const P: Pt2 = [480, 336];
const F = 900;
const ctx = (): SnapCtx => ({ principal: P, f: F, imgSize: SZ, ground: null, from: null });
const px = (v: Vec3): Pt2 => project(v, P, F)!;

describe("오스냅 — 정점(여러 획이 만나는 끝점)", () => {
  it("셋이 만나면 정점 하나이고 위치는 끝점과 같다", () => {
    const segs: SnapSeg[] = [
      { id: "a", a: [0, 0, 6], b: [2, 0, 6] },
      { id: "b", a: [0, 0, 6], b: [0, 2, 6] },
      { id: "c", a: [0, 0, 6], b: [0, 0, 8] },
    ];
    const pre = staticCandidates(segs);
    const here = pre.filter(c => Math.hypot(c.at[0], c.at[1], c.at[2] - 6) < 1e-9);
    expect(here.length).toBe(1);
    expect(here[0].kind).toBe("vertex");
    expect(here[0].at).toEqual([0, 0, 6]);
  });

  it("**반례** — 혼자인 끝점은 정점이 아니다", () => {
    const segs: SnapSeg[] = [{ id: "a", a: [0, 0, 6], b: [2, 0, 6] }];
    expect(staticCandidates(segs).filter(c => c.kind === "vertex").length).toBe(0);
  });

  it("정점이 끝점보다 앞선다 — 같은 자리라 붙는 점은 안 바뀐다", () => {
    const segs: SnapSeg[] = [
      { id: "a", a: [0, 0, 6], b: [2, 0, 6] },
      { id: "b", a: [0, 0, 6], b: [0, 2, 6] },
    ];
    const cands = snapCandidates(px([0, 0, 6]), segs, ctx(), { radius_ratio: 0.05 });
    expect(cands[0].kind).toBe("vertex");
    expect(cands[0].at).toEqual([0, 0, 6]);
  });
});

// ---------------------------------------------------------------- 승격에서의 양 끝 스냅

/** 축 둘의 소실점 — 이 카메라에서 두 점 배치가 축과 무관함을 보이기 위한 최소 문맥. */
const liftCtx = () => ({ principal: P, f: F, vps: [null, null, null] as (Pt2 | null)[],
                         imgSize: SZ,
                         // 무한원 축 셋 — 대상 획이 1차에서 실제로 놓여야 이 시험이 공허하지 않다(#32)
                         axisDirs: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as ([number, number, number] | null)[] });

describe("오스냅 — 승격에서 양 끝이 다시 풀린다", () => {
  /** 대상 획 둘(이미 3D) + 그 둘의 끝점에 붙은 대각선 하나. */
  const setup = (): OrderStroke[] => {
    const A: Vec3[] = [[0, 0, 6], [2, 0, 6]];
    const B: Vec3[] = [[0, 2, 6], [2, 2, 6]];
    return [
      { id: "A", pts2d: [px(A[0]), px(A[1])], axis: 0, userAxis: true, snapStart: null },
      { id: "B", pts2d: [px(B[0]), px(B[1])], axis: 0, userAxis: true, snapStart: null },
      // 둘을 잇는 세로 획 — **연결 성분이 있어야 `liftAll`이 푼다**(고립 획은 안 놓인다)
      { id: "C", pts2d: [px(A[0]), px(B[0])], axis: 1, userAxis: true, snapStart: null },
      // **대각선** — 어느 축도 아니고 양 끝만 붙어 있다
      { id: "D", pts2d: [px(A[1]), px(B[0])], axis: "free", userAxis: false,
        snapStart: { kind: "endpoint", at: A[1], ofId: "A" },
        snapEnd: { kind: "endpoint", at: B[0], ofId: "B" } },
    ];
  };

  it("양 끝이 다 살아나면 **두 점으로 놓는다** — 축이 없어도 3D가 나온다", () => {
    const r = promoteOrder(setup(), liftCtx(), {}, undefined);
    const d = r.placed.get("D");
    expect(d).toBeTruthy();
    // 대상 둘이 1차에서 놓였으므로 그 위의 두 점이 곧 대각선이다
    expect(r.snap.had).toBe(1);
    expect(r.snap.reanchored).toBe(1);
    expect(r.snap.lost_ids).toEqual([]);
  });

  it("**반례** — 끝점 대상이 안 놓이면 그 획도 안 놓는다(반쪽은 조용히 틀린 자리다)", () => {
    const input = setup().filter(s => s.id !== "B");   // 끝점이 붙어 있던 대상을 없앤다
    const r = promoteOrder(input, liftCtx(), {}, undefined);
    expect(r.placed.get("D")).toBeUndefined();
    expect(r.snap.lost_ids).toEqual(["D"]);
    expect(r.snap.reanchored).toBe(0);
  });
});

// ---------------------------------------------------------------- 저장·복원

describe("오스냅 — 저장이 `snapEnd`를 넘긴다", () => {
  const docOf = (): DocState => {
    const v = newView("확정", null);
    const s = newSStroke([[10, 10], [40, 40]], v.id);
    s.snapStart = { kind: "vertex", at: [0, 0, 6], ofId: "A" };
    s.snapEnd = { kind: "midpoint", at: [1, 1, 6], ofId: "B" };
    s.seg3d = [[0, 0, 6], [1, 1, 6]];
    return { strokes: [s], views: [v], currentView: v.id };
  };

  it("왕복하면 `snapEnd`가 그대로다", () => {
    const d = serializeDoc2({ at: "t", imgSize: SZ, cam: null,
                              doc: docOf(), seq: { stroke: 1, view: 1 } });
    const back = restoreDoc2(d);
    expect(back.doc.strokes[0].snapEnd).toEqual({ kind: "midpoint", at: [1, 1, 6], ofId: "B" });
  });

  it("**옛 저장본**(필드가 없다)은 `null`로 복원된다", () => {
    const d = serializeDoc2({ at: "t", imgSize: SZ, cam: null,
                              doc: docOf(), seq: { stroke: 1, view: 1 } });
    delete (d.strokes[0] as { snapEnd?: unknown }).snapEnd;
    expect(restoreDoc2(d).doc.strokes[0].snapEnd).toBeNull();
  });
});
