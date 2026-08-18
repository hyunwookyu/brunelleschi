// **2D 단계의 수선 발**(2026-08-18 9차 항목 2-f). 3D 판(`snap.snapCandidates`의 `ctx.from`)과
// 같은 규약이다(#17·A-3). 화면에는 종류 토글로 "수선 발"이 있었는데 **2D에서는 한 번도
// 안 걸렸다** — `static2dCandidates`가 질의와 무관한 후보만 만들기 때문이다.
import { describe, it, expect } from "vitest";
import { perp2dCandidates } from "../src/s3d/snap2d.js";
import { resolve2dCore } from "../src/s3d/resolve2d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SEG = [{ id: "s0", a: [100, 300] as Pt2, b: [500, 300] as Pt2 }];

describe("2D 수선 발", () => {
  it("기준점에서 선분에 내린 발을 낸다", () => {
    const c = perp2dCandidates([300, 100], SEG);
    expect(c.length).toBe(1);
    expect(c[0].kind).toBe("perpendicular");
    expect(c[0].at[0]).toBeCloseTo(300, 6);
    expect(c[0].at[1]).toBeCloseTo(300, 6);
  });

  it("매개변수가 연장 여유 밖이면 안 낸다", () => {
    expect(perp2dCandidates([-400, 100], SEG).length).toBe(0);
  });

  it("⛔ **`segs`를 안 주면 안 돈다** — 옛 부르는 쪽이 안 깨진다(회귀 팔)", () => {
    // 끝점이 수선 발(300,300) 바로 옆인데 `segs`가 없으면 안 걸린다
    const raw: Pt2[] = [[300, 100], [303, 297]];
    const r = resolve2dCore(raw, { cands: [], vps: [], radiusPx: 15, relSnap: false });
    expect(r.end2).toBeNull();
  });

  it("✅ `segs`를 주면 끝점이 수선 발에 붙는다", () => {
    const raw: Pt2[] = [[300, 100], [303, 297]];
    const r = resolve2dCore(raw, { cands: [], vps: [], radiusPx: 15, relSnap: false, segs: SEG });
    expect(r.end2).not.toBeNull();
    expect(r.end2!.kind).toBe("perpendicular");
    expect(r.b[0]).toBeCloseTo(300, 6);
    expect(r.b[1]).toBeCloseTo(300, 6);
  });

  it("반례 — **종류를 끄면 안 걸린다**(토글이 실효다)", () => {
    const raw: Pt2[] = [[300, 100], [303, 297]];
    const r = resolve2dCore(raw, { cands: [], vps: [], radiusPx: 15, relSnap: false, segs: SEG,
                                   kinds: { perpendicular: false } });
    expect(r.end2).toBeNull();
  });
});
