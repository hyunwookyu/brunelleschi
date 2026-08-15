// L-C.2 — `promoteDiff`·`appSnap`의 **반례 테스트**(CLAUDE.md §5.3).
//
// 새 지표에는 반례를 건다: **그 지표가 의도한 것을 재는지** 확인한다.
// 여기서 재려는 것은 "승격이 무엇을 잃었나"이고, 반례는 **인위로 하나를 떨어뜨렸을 때
// 정확히 그 하나가 잡히는가**다. 통과 테스트만 있으면 항상 빈 배열을 내는 함수도 통과한다.
import { describe, it, expect } from "vitest";
import { diffPlacement, diffSummary } from "../src/s3d/promoteDiff.js";
import { takeSnap, applySnap, snapDiff, type AppSnap } from "../src/ui/appSnap.js";
import { newDoc, newSStroke, snapshotDoc } from "../src/ui/doc.js";
import { CamState } from "../src/ui/camState.js";
import type { Pt2 } from "../src/s3d/camera.js";

const P = (n: number): Pt2[] => [[n, n], [n + 40, n + 10]];

describe("diffPlacement — 승격이 무엇을 잃었나", () => {
  it("전부 그대로면 아무것도 안 잃는다", () => {
    const m = new Map([["a", true], ["b", true], ["c", false]]);
    const d = diffPlacement(m, new Map(m));
    expect(d.dropped).toEqual([]);
    expect(d.gained).toEqual([]);
    expect(d.kept.sort()).toEqual(["a", "b"]);
    expect(d.pending).toEqual(["c"]);
  });

  // **반례** — 하나를 떨어뜨리면 정확히 그 하나가 잡혀야 한다. 개수도 id도.
  it("하나를 떨어뜨리면 그 id가 정확히 하나 잡힌다", () => {
    const before = new Map([["a", true], ["b", true], ["c", true]]);
    const after = new Map([["a", true], ["b", false], ["c", true]]);
    const d = diffPlacement(before, after);
    expect(d.dropped).toEqual(["b"]);
    expect(d.gained).toEqual([]);
    expect(d.kept.sort()).toEqual(["a", "c"]);
  });

  it("올라간 것과 내려간 것을 섞어도 갈린다", () => {
    const before = new Map([["a", true], ["b", false], ["c", true], ["d", false]]);
    const after = new Map([["a", false], ["b", true], ["c", true], ["d", false]]);
    const d = diffPlacement(before, after);
    expect(d.dropped).toEqual(["a"]);
    expect(d.gained).toEqual(["b"]);
    expect(d.kept).toEqual(["c"]);
    expect(d.pending).toEqual(["d"]);
  });

  // **한쪽에만 있는 id를 조용히 버리지 않는다**(#11 — 분모가 달라진 것을 아무도 못 보면 안 된다)
  it("한쪽에만 있는 id도 어딘가에 들어간다", () => {
    const d = diffPlacement(new Map([["a", true]]), new Map([["b", true]]));
    expect(d.dropped).toEqual(["a"]);
    expect(d.gained).toEqual(["b"]);
    expect(d.dropped.length + d.gained.length + d.kept.length + d.pending.length).toBe(2);
  });

  it("요약 문장이 잃은 것을 빠뜨리지 않는다", () => {
    const d = diffPlacement(new Map([["a", true], ["b", true]]),
                            new Map([["a", true], ["b", false]]));
    const s = diffSummary(d, 3);
    expect(s).toContain("내려감 −1");
    expect(s).toContain("스냅 끊김 3");
    // 잃은 것이 없으면 그 말은 안 나온다 — **없는 경고를 지어내지 않는다**
    expect(diffSummary(diffPlacement(new Map([["a", true]]), new Map([["a", true]])), 0))
      .not.toContain("내려감");
  });
});

describe("appSnap — 되돌리기가 문서와 카메라를 함께 담는가", () => {
  const build = () => {
    const cam = new CamState([960, 672]);
    cam.guides = [{ axis: 0, a: [10, 20], b: [300, 40] }, { axis: 0, a: [10, 300], b: [300, 250] }];
    cam.apply();
    cam.locked = true;
    const doc = newDoc();
    doc.strokes.push(newSStroke(P(100), doc.currentView));
    doc.strokes.push(newSStroke(P(200), doc.currentView));
    doc.strokes[0].seg3d = [[0, 0, 0], [1, 0, 0]];
    return { cam, doc };
  };

  it("왕복은 항등이다 (**설계 보장** — 측정이 아니다)", () => {
    const { cam, doc } = build();
    const s0 = takeSnap(doc, cam, 2);
    // 상태를 어긴다: 가이드를 끌고, 획을 3D에서 내리고, 시작점을 옮긴다
    cam.guides[0].a = [77, 88];
    cam.apply(); cam.locked = false;
    doc.strokes[0].seg3d = null;
    doc.strokes[1].pts2d = [[999, 999], ...doc.strokes[1].pts2d.slice(1)];
    const back = applySnap(cam, s0);
    expect(snapDiff(takeSnap(back, cam, s0.lockedOrder), s0)).toEqual([]);
    expect(cam.locked).toBe(true);
    expect(cam.guides[0].a).toEqual([10, 20]);
  });

  // **양성 채널**(#30) — 대조가 눈뜬 것인지 본다. 안 짚으면 위의 통과는 아무 뜻이 없다
  it("다른 상태를 넣으면 그 자리를 이름으로 짚는다", () => {
    const { cam, doc } = build();
    const a = takeSnap(doc, cam, 2);
    const mut = (f: (d: typeof doc, c: CamState) => void): AppSnap => {
      const d2 = snapshotDoc(doc);
      const c2 = new CamState([960, 672]);
      c2.guides = cam.guides.map(g => ({ ...g, a: [...g.a] as Pt2, b: [...g.b] as Pt2 }));
      c2.locked = cam.locked;
      f(d2, c2);
      c2.apply();
      return takeSnap(d2, c2, 2);
    };
    expect(snapDiff(a, mut((_, c) => { c.locked = false; }))).toContain("locked");
    expect(snapDiff(a, mut((_, c) => { c.guides[0].a = [1, 2]; }))).toContain("guides[0].pts");
    expect(snapDiff(a, mut(d => { d.strokes[0].seg3d = null; })))
      .toContain("strokes[0].seg3d.presence");
    expect(snapDiff(a, mut(d => { d.strokes[0].seg3d = [[9, 9, 9], [1, 0, 0]]; })))
      .toContain("strokes[0].seg3d");
    // ⚠ **`pts2d`를 본다**(#34) — 승격이 스냅된 시작점을 옮기므로 이것이 안 잡히면
    // "되돌렸다"가 시작점만 새 카메라 자리에 남은 상태를 통과시킨다
    expect(snapDiff(a, mut(d => { d.strokes[1].pts2d = [[5, 5], ...d.strokes[1].pts2d.slice(1)]; })))
      .toContain("strokes[1].pts2d[0]");
    expect(snapDiff(a, mut(d => { d.strokes[0].snapStart = { kind: "endpoint", at: [0, 0, 0], ofId: "z" }; })))
      .toContain("strokes[0].snapStart.presence");
    expect(snapDiff(a, takeSnap(doc, cam, 3))).toContain("lockedOrder");
  });

  it("스냅샷은 나중의 끌기에 안 딸려 움직인다", () => {
    const { cam, doc } = build();
    const s = takeSnap(doc, cam, 2);
    cam.guides[0].a[0] = 12345;
    doc.strokes[0].seg3d = null;
    expect(s.guides[0].a[0]).toBe(10);
    expect(s.doc.strokes[0].seg3d).not.toBeNull();
  });
});
