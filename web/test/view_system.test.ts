// L-B.6 **뷰 시스템** — 계획서 §9.2~§9.4. 자료구조는 `doc.ts`에 있었고 **아무도 안 읽었다**.
// 이 파일이 그 규약을 못 박는다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-B.6 절에 적었다.
// 특히 **#5**(자기참조) — "저장한 자세로 돌아가면 같은 화면이다"는 `pose()`와 `setPose()`가
// 서로의 역이므로 **설계 보장이지 측정이 아니다.** 그래서 임계를 안 걸고,
// **틀린 자세를 넣으면 값이 움직이는지**를 반례로 건다(양성 채널, #30).
import { describe, it, expect, beforeEach } from "vitest";
import {
  newDoc, newView, newSStroke, deleteView, lifted, pending, pendingElsewhere, viewOf,
  snapshotDoc, resetDocSeq, type DocState,
} from "../src/ui/doc.js";
import type { ViewPose } from "../src/s3d/viewCamera.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const POSE = (cz: number): ViewPose =>
  ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, cz] });

const P = (x: number, y: number): Pt2[] => [[x, y], [x + 10, y + 10]];

describe("§9.2 — 뷰가 2D 획을 소유한다", () => {
  let d: DocState;
  beforeEach(() => { resetDocSeq(); d = newDoc(); });

  it("새 문서에는 **확정 뷰 하나**가 있고 그것이 `pose === null`이다", () => {
    expect(d.views.length).toBe(1);
    expect(d.views[0].pose).toBeNull();
    expect(d.currentView).toBe(d.views[0].id);
  });

  it("2D 획은 그린 뷰에서만 보이고 **다른 뷰에서는 숨는다** — 정리가 아니라 좌표계 때문이다", () => {
    const v2 = newView("뷰 2", POSE(5));
    d.views.push(v2);
    d.strokes.push(newSStroke(P(0, 0), d.views[0].id));
    d.strokes.push(newSStroke(P(20, 20), v2.id));
    expect(pending(d, d.views[0].id).length).toBe(1);
    expect(pending(d, v2.id).length).toBe(1);
    expect(pendingElsewhere(d, d.views[0].id)).toBe(1);
  });

  it("**승격되면 뷰 소속이 없어진다** — 어느 뷰에서든 보인다", () => {
    const v2 = newView("뷰 2", POSE(5));
    d.views.push(v2);
    const s = newSStroke(P(0, 0), v2.id);
    d.strokes.push(s);
    expect(lifted(d).length).toBe(0);
    s.seg3d = [[0, 0, 0], [1, 0, 0]];
    expect(lifted(d).length).toBe(1);
    // 3D 레이어는 뷰와 무관하다 — `pending`에서 빠진다
    expect(pending(d, v2.id).length).toBe(0);
    expect(pendingElsewhere(d, d.views[0].id)).toBe(0);
  });
});

describe("§9.2 — 뷰 삭제", () => {
  let d: DocState;
  beforeEach(() => { resetDocSeq(); d = newDoc(); });

  it("**그 안의 대기 획도 함께 사라지고 승격된 획은 남는다**", () => {
    const v2 = newView("뷰 2", POSE(5));
    d.views.push(v2);
    d.strokes.push(newSStroke(P(0, 0), v2.id));           // 대기 — 사라진다
    const up = newSStroke(P(30, 30), v2.id);
    up.seg3d = [[0, 0, 0], [1, 0, 0]];                    // 승격됨 — 남는다
    d.strokes.push(up);
    d.strokes.push(newSStroke(P(50, 50), d.views[0].id)); // 다른 뷰 — 남는다
    const r = deleteView(d, v2.id);
    expect(r).toEqual({ removed: 1 });
    expect(d.views.length).toBe(1);
    expect(d.strokes.map(s => s.id).sort()).toEqual([up.id, "s3"].sort());
  });

  it("**확정 뷰는 못 지운다** — 첫 카메라 자체다", () => {
    expect(deleteView(d, d.views[0].id)).toBeNull();
    expect(d.views.length).toBe(1);
  });

  it("없는 뷰를 지우면 `null`이고 문서는 안 바뀐다", () => {
    expect(deleteView(d, "없음")).toBeNull();
  });

  it("지금 보고 있는 뷰를 지우면 **남은 첫 뷰로 옮겨간다** — 유령 `currentView`가 안 생긴다", () => {
    const v2 = newView("뷰 2", POSE(5));
    d.views.push(v2);
    d.currentView = v2.id;
    deleteView(d, v2.id);
    expect(d.currentView).toBe(d.views[0].id);
    expect(viewOf(d, d.currentView)).toBeDefined();
  });
});

describe("§9.3 — 뷰 생성 규약", () => {
  beforeEach(() => resetDocSeq());

  it("`seq`가 생성 순서이고 **시각에 의존하지 않는다**(재현성 규칙)", () => {
    const a = newView("a", POSE(1)), b = newView("b", POSE(2));
    expect(b.seq).toBe(a.seq + 1);
    expect(a.id).not.toBe(b.id);
  });

  it("스냅샷이 뷰까지 복사한다 — 되돌리기가 뷰 삭제도 되돌린다", () => {
    const d = newDoc();
    d.views.push(newView("뷰 2", POSE(5)));
    d.strokes.push(newSStroke(P(0, 0), d.views[1].id));
    const snap = snapshotDoc(d);
    deleteView(d, d.views[1].id);
    expect(d.views.length).toBe(1);
    expect(snap.views.length).toBe(2);
    expect(pending(snap, snap.views[1].id).length).toBe(1);
    // 얕은 공유가 아니어야 한다 — 스냅샷을 고쳐도 원본이 안 바뀐다
    snap.views[0].name = "바뀜";
    expect(d.views[0].name).not.toBe("바뀜");
  });
});

// ---------------------------------------------------------------------------
// 자세 왕복 — **보장이지 측정이 아니다**(#5). 임계를 안 건다.
// 여기서 검사하는 것은 `stage.ts`가 쓰는 규약 변환의 **대수적 성질**이다.
// three를 띄우지 않고 같은 식을 그대로 적용한다 — 브라우저 없이 도는 자리다.
// ---------------------------------------------------------------------------

const conv = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** `stage.pose()`가 three 기저에서 우리 `ViewPose`를 만드는 식. */
const poseFromBasis = (X: Vec3, Y: Vec3, Z: Vec3, C: Vec3): ViewPose =>
  ({ R: [conv(X), conv(neg(Y)), conv(neg(Z))], C: conv(C) });
/** `stage.setPose()`가 되돌리는 식. */
const basisFromPose = (p: ViewPose) =>
  ({ X: conv(p.R[0]), Y: neg(conv(p.R[1])), Z: neg(conv(p.R[2])), C: conv(p.C) });

describe("자세 규약 변환 — 왕복은 **보장**이다", () => {
  const X: Vec3 = [0.6, 0, -0.8], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0.8, 0, 0.6];
  const C: Vec3 = [3, 4, 5];

  it("왕복이 항등이다 — `conv`가 자기 역이기 때문이다", () => {
    const b = basisFromPose(poseFromBasis(X, Y, Z, C));
    for (const [got, want] of [[b.X, X], [b.Y, Y], [b.Z, Z], [b.C, C]] as [Vec3, Vec3][]) {
      for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i], 12);
    }
  });

  it("**반례**: 다른 자세를 넣으면 결과가 달라진다 — 안 움직이면 항등을 재는 것이다(#5)", () => {
    const a = poseFromBasis(X, Y, Z, C);
    const b = poseFromBasis(X, Y, Z, [3, 4, 6]);
    expect(a.C[2]).not.toBeCloseTo(b.C[2], 6);
  });

  it("**직교성과 방향이 보존된다** — 뒤집기가 반사가 아니라 회전이어야 한다", () => {
    const p = poseFromBasis(X, Y, Z, C);
    const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    for (let i = 0; i < 3; i++) expect(dot(p.R[i], p.R[i])).toBeCloseTo(1, 12);
    expect(dot(p.R[0], p.R[1])).toBeCloseTo(0, 12);
    expect(dot(p.R[1], p.R[2])).toBeCloseTo(0, 12);
    // det(R) = +1 (회전). −1이면 좌우가 뒤집혀 화면이 거울이 된다
    const [r0, r1, r2] = p.R;
    const det = r0[0] * (r1[1] * r2[2] - r1[2] * r2[1])
              - r0[1] * (r1[0] * r2[2] - r1[2] * r2[0])
              + r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
    expect(det).toBeCloseTo(1, 12);
  });
});
