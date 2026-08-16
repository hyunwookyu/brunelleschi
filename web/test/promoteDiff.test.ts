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
import { setRules, vpSlot, screenSlot } from "./ruleFixture.js";

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
    // **규칙 상태로 세운다** — 가이드가 없어졌다(2026-08-16). 축 0·1이 수평 소실점, 2가 화면 세로
    setRules(cam, [vpSlot([-1400, 330]), vpSlot([2100, 330]), screenSlot("v")]);
    const doc = newDoc();
    doc.strokes.push(newSStroke(P(100), doc.currentView));
    doc.strokes.push(newSStroke(P(200), doc.currentView));
    doc.strokes[0].seg3d = [[0, 0, 0], [1, 0, 0]];
    return { cam, doc };
  };

  it("왕복은 항등이다 (**설계 보장** — 측정이 아니다)", () => {
    const { cam, doc } = build();
    const s0 = takeSnap(doc, cam);
    // 상태를 어긴다: 소실점을 옮기고, 획을 3D에서 내리고, 시작점을 옮긴다
    setRules(cam, [vpSlot([-900, 300]), vpSlot([2100, 330]), screenSlot("v")]);
    doc.strokes[0].seg3d = null;
    doc.strokes[1].pts2d = [[999, 999], ...doc.strokes[1].pts2d.slice(1)];
    const back = applySnap(cam, s0);
    expect(snapDiff(takeSnap(back, cam), s0)).toEqual([]);
    expect(cam.standing()).toBe(true);          // **계산으로 확정이다**(지시 1 — 규칙이 되돌아왔으므로)
    expect(cam.rules.slots[0]).toMatchObject({ kind: "vp", at: [-1400, 330] });
  });

  // **양성 채널**(#30) — 대조가 눈뜬 것인지 본다. 안 짚으면 위의 통과는 아무 뜻이 없다
  it("다른 상태를 넣으면 그 자리를 이름으로 짚는다", () => {
    const { cam, doc } = build();
    const a = takeSnap(doc, cam);
    const mut = (f: (d: typeof doc, c: CamState) => void): AppSnap => {
      const d2 = snapshotDoc(doc);
      const c2 = new CamState([960, 672]);
      c2.loadRules(cam.rules);
      f(d2, c2);
      c2.apply();
      return takeSnap(d2, c2);
    };
    expect(snapDiff(a, mut((_, c) => {
      setRules(c, [vpSlot([-999, 330]), vpSlot([2100, 330]), screenSlot("v")]);
    }))).toContain("rules.slots[0].vp");
    // **무한원 축을 유한 소실점으로 바꾼 것도 잡힌다** — 차수가 바뀌는 자리다
    expect(snapDiff(a, mut((_, c) => {
      setRules(c, [vpSlot([-1400, 330]), vpSlot([2100, 330]), vpSlot([480, -3000])]);
    }))).toContain("rules.slots[2].kind");
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
    // ⚠ `lockedOrder` 항목을 뺐다(지시 1) — 차수는 스냅샷이 아니라 규칙에서 계산된다.
    // 차수가 바뀌는 변경은 위의 `rules.slots[2].kind`(무한원 → 유한 소실점)가 잡는다
  });

  it("스냅샷은 나중의 획에 안 딸려 움직인다", () => {
    const { cam, doc } = build();
    const s = takeSnap(doc, cam);
    (cam.rules.slots[0] as { at: Pt2 }).at[0] = 12345;
    doc.strokes[0].seg3d = null;
    expect((s.rules.slots[0] as { at: Pt2 }).at[0]).toBe(-1400);
    expect(s.doc.strokes[0].seg3d).not.toBeNull();
  });
});
