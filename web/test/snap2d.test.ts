// **2D 오스냅 — 카메라 확정 전의 화면 스냅**(2026-08-17 4차 지시 1). 규칙과 반례를 잠근다.
//
// 지시: "가로세로를 그을 때 다른 선의 끝점·중점에 붙지 않는다. … 2D 획의 끝점·중점·교점을
// 스냅 후보에 넣는다. 3D 세그먼트와 같은 우선순위 규칙을 쓴다."
//
// 여기서 잠그는 것:
//   ① 끝점·중점·교차점이 후보로 나온다 — 화면 좌표 그대로
//   ② 우선순위는 3D 판과 같다(끝점 > 중점 > 교차점 · 같은 종류면 가까운 것)
//   ③ 여러 획이 만난 끝점은 **정점**으로 승격된다(위치 불변 — 표시만 바뀐다)
//   ④ 반례 — 반경 밖은 `null` · 종류를 끄면 그 종류가 안 나온다 · 나란한 선엔 교차점이 없다
import { describe, it, expect } from "vitest";
import { static2dCandidates, snap2dAt, type Snap2Seg } from "../src/s3d/snap2d.js";

const DIAG = Math.hypot(960, 672);
const R = 15;                       // 앱 조리개 기본값(D-L56)과 같은 자리 — 값은 여기 로컬이다

describe("2D 오스냅 — 후보 (지시 1-a)", () => {
  const segs: Snap2Seg[] = [
    { id: "a", a: [100, 100], b: [300, 100] },
    { id: "b", a: [200, 20], b: [200, 180] },
  ];
  const pre = static2dCandidates(segs, DIAG);

  it("끝점이 후보로 나온다", () => {
    const c = snap2dAt([303, 97], pre, R);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("endpoint");
    expect(c!.at).toEqual([300, 100]);
  });

  it("중점이 후보로 나온다 — 화면 중점이다", () => {
    const c = snap2dAt([198, 95], pre, R);
    expect(c).not.toBeNull();
    // (200,100)은 a의 중점이자 b와의 교차점 — 우선순위로 **중점**이 이긴다(3D 판과 같은 순서)
    expect(c!.kind).toBe("midpoint");
    expect(c!.at).toEqual([200, 100]);
  });

  it("교차점이 후보로 나온다", () => {
    const cross: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      // b의 중점(150,120)이 교차점(150,100)과 겹치지 않게 둔다 — 겹치면 우선순위로 중점이 이긴다
      { id: "b", a: [150, 20], b: [150, 220] },
    ];
    const c = snap2dAt([152, 103], static2dCandidates(cross, DIAG), R);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("intersection");
    expect(c!.at[0]).toBeCloseTo(150, 9);
    expect(c!.at[1]).toBeCloseTo(100, 9);
  });

  it("여러 획이 만난 끝점은 정점이고 위치는 끝점 그대로다", () => {
    const share: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      { id: "b", a: [100, 100], b: [100, 300] },
    ];
    const c = snap2dAt([103, 103], static2dCandidates(share, DIAG), R);
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("vertex");
    expect(c!.at).toEqual([100, 100]);
  });
});

describe("2D 오스냅 — 우선순위 (3D 판과 같은 규칙)", () => {
  it("끝점이 중점을 이긴다 — 더 멀어도", () => {
    // 끝점 (300,100)과 중점 (200,100)이 둘 다 반경 안: 커서를 중점 쪽에 가깝게 둔다
    const segs: Snap2Seg[] = [{ id: "a", a: [290, 100], b: [300, 100] }];
    const pre = static2dCandidates(segs, DIAG);
    // 중점 (295,100). 커서 (294,100): 중점까지 1px, 끝점 290까지 4px — 끝점이 이긴다
    const c = snap2dAt([294, 100], pre, R);
    expect(c!.kind).toBe("endpoint");
  });

  it("같은 종류면 가까운 것이 이긴다", () => {
    const segs: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [200, 100] },
      { id: "b", a: [110, 120], b: [200, 120] },
    ];
    const c = snap2dAt([104, 108], static2dCandidates(segs, DIAG), R);
    expect(c!.kind).toBe("endpoint");
    expect(c!.ofId).toBe("a");              // (100,100)까지 8.9px < (110,120)까지 13.4px
  });
});

describe("2D 오스냅 — 반례 (지시 검증 절)", () => {
  const segs: Snap2Seg[] = [{ id: "a", a: [100, 100], b: [300, 100] }];
  const pre = static2dCandidates(segs, DIAG);

  it("반경 밖은 null이다 — 조리개가 실제로 좁힌다", () => {
    expect(snap2dAt([300 + R + 1, 100], pre, R)).toBeNull();
    expect(snap2dAt([300 + R - 1, 100], pre, R)).not.toBeNull();
  });

  it("종류를 끄면 그 종류가 안 나온다", () => {
    const c = snap2dAt([300, 100], pre, R, { endpoint: false, vertex: false });
    // 끝점을 껐다 — 그 자리 반경 안의 다른 후보(중점 200은 멀다)가 없으므로 null
    expect(c).toBeNull();
  });

  it("나란한 두 선에는 교차점이 없다", () => {
    const par: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      { id: "b", a: [100, 140], b: [300, 140] },
    ];
    const kinds = static2dCandidates(par, DIAG).map(c => c.kind);
    expect(kinds).not.toContain("intersection");
  });

  /**
   * **연장 여유의 실효 크기**(리뷰어 [8], #24) — `extend_ratio`(0.02)는 **선분 길이 대비
   * 매개변수 여유**다(3D 판과 같은 프레임). 화면 대각 대비가 아니다: 200px 획이면 4px,
   * 300px 획이면 6px — 조리개(15px)보다 작은 자리다. 그 경계를 잠근다.
   */
  it("교차점의 연장 여유는 선분 길이 대비다 — 여유 밖 겉보기 교차는 후보가 아니다", () => {
    // 세로선이 가로선의 연장선과 만나되, 가로선 끝(300,100)에서 **길이의 3%**(6px) 밖
    const far: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },       // 길이 200 → 여유 4px
      { id: "b", a: [307, 20], b: [307, 180] },        // 교차는 (307,100) — 3.5% 연장 자리
    ];
    expect(static2dCandidates(far, DIAG).map(c => c.kind)).not.toContain("intersection");
    // 여유 **안**(1.5% = 3px — 병합 반경 ≈2.3px 밖, 끝점 후보와 안 합쳐진다)이면 나온다 —
    // 손 오차의 못 미침·지나침을 담는 그 여유다
    const nearMiss: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      { id: "b", a: [303, 20], b: [303, 180] },
    ];
    expect(static2dCandidates(nearMiss, DIAG).map(c => c.kind)).toContain("intersection");
  });

  it("끝점과 같은 자리의 교차점은 안 나온다 — 끝점이 이미 냈다 (T자 접촉)", () => {
    const tee: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      { id: "b", a: [200, 100], b: [200, 200] },
    ];
    const cands = static2dCandidates(tee, DIAG);
    const near = cands.filter(c => Math.hypot(c.at[0] - 200, c.at[1] - 100) < 3);
    expect(near.map(c => c.kind)).not.toContain("intersection");
  });
});

// ---------------------------------------------------------------- 관계 스냅 (4차 지시 5)

import { alignAxes } from "../src/s3d/snap2d.js";

describe("관계 스냅 — 같은 화면 x/y 정렬 (4차 지시 5)", () => {
  const segs: Snap2Seg[] = [
    { id: "a", a: [100, 100], b: [300, 100] },
    { id: "b", a: [500, 400], b: [700, 420] },
  ];
  const cands = static2dCandidates(segs, DIAG);

  it("끝점·중점의 x·y에 각각 가장 가까운 값으로 끌린다", () => {
    const h = alignAxes([305, 240], cands, 15);
    expect(h.x).not.toBeNull();
    expect(h.x!.v).toBe(300);                    // a의 끝점 x
    expect(h.y).toBeNull();                      // 100·400·410·420 전부 15px 밖
    const v = alignAxes([250, 108], cands, 15);
    expect(v.y!.v).toBe(100);
    expect(v.x).toBeNull();                      // 100(=150px)·200(=50px)·300(=50px) 전부 밖
  });

  it("같은 축에서는 더 가까운 근원이 이긴다", () => {
    const h = alignAxes([610, 411], cands, 15);
    expect(h.y).not.toBeNull();
    expect(h.y!.v).toBe(410);                    // b의 중점 y(410)가 400·420보다 가깝다
  });

  it("**반례** — 허용치 밖은 null이다 · 교차점은 정렬 후보가 아니다", () => {
    const far = alignAxes([500, 250], cands, 15);
    expect(far.y).toBeNull();
    const cross: Snap2Seg[] = [
      { id: "a", a: [100, 100], b: [300, 100] },
      { id: "b", a: [200, 20], b: [200, 220] },
    ];
    const cc = static2dCandidates(cross, DIAG).filter(c => c.kind === "intersection");
    expect(cc.length).toBe(1);
    // 교차점(200,100)의 x·y로는 안 끌린다 — 후보 종류가 끝점·정점·중점뿐이다(지시 5-b)
    const h = alignAxes([203, 260], cc, 15);
    expect(h.x).toBeNull();
  });
});
