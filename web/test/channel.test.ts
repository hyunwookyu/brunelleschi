// **펜 채널**(2026-08-17 사람 지시 D) — 분류가 실제로 세 곳을 가르는지 잠근다.
//
// 잠그는 것 넷:
//   D-1  기본값이 **보조선**이다
//   D-3  주석은 **3D로 안 올라가고** 내보내기에서 빠진다 · 보조선은 3D에 있고 내보내기는 옵션이다
//   D-4  사후 변경이 된다(자동 판정은 없다)
//   저장  옛 저장본(채널 없음)이 **보조선으로 열린다**
//
// ⚠ **양성 채널을 함께 둔다**(#30) — "전부 나간다"도 "전부 빠진다"도 판정이 아니다.
import { describe, it, expect } from "vitest";
import { newDoc, newSStroke, liftable, DEFAULT_CHANNEL, type SStroke } from "../src/ui/doc.js";
import { linesFromDoc } from "../src/ui/exportGeom.js";
import { serializeDoc2, restoreDoc2 } from "../src/ui/docStore.js";
import type { Pt2 } from "../src/s3d/camera.js";
import type { Vec3 } from "../src/s3d/geom3d.js";

const PTS: Pt2[] = [[10, 10], [100, 100]];
const SEG: [Vec3, Vec3] = [[0, 0, 3], [1, 1, 3]];

/** 채널 셋을 각각 하나씩 — **전부 3D 좌표를 준다**(내보내기 필터만 재려는 것이다). */
function docOfThree() {
  const d = newDoc();
  for (const ch of ["guide", "result", "note"] as const) {
    const s = newSStroke(PTS, d.currentView, ch);
    s.seg3d = SEG;                     // ⚠ 주석에도 넣는다 — 필터가 **채널로** 거르는지 본다
    d.strokes.push(s);
  }
  return d;
}

describe("D-1 기본값은 보조선이다", () => {
  it("`newSStroke`가 채널을 안 받으면 보조선이다", () => {
    expect(DEFAULT_CHANNEL).toBe("guide");
    expect(newSStroke(PTS, "v1").channel).toBe("guide");
  });

  it("**반례** — 채널을 주면 그대로 들어간다(자동 판정이 없다, D-4)", () => {
    expect(newSStroke(PTS, "v1", "result").channel).toBe("result");
    expect(newSStroke(PTS, "v1", "note").channel).toBe("note");
  });
});

describe("D-3 주석은 3D로 안 올라간다", () => {
  it("`liftable`이 주석만 거른다", () => {
    expect(newSStroke(PTS, "v1", "guide")).toSatisfy(liftable);
    expect(newSStroke(PTS, "v1", "result")).toSatisfy(liftable);
    expect(liftable(newSStroke(PTS, "v1", "note"))).toBe(false);
  });
});

describe("D-3 내보내기 — 결과선만 나가고 보조선은 옵션이다", () => {
  it("기본은 **결과선 하나**다", () => {
    const lines = linesFromDoc(docOfThree());
    expect(lines.length).toBe(1);
  });

  it("옵션을 켜면 **보조선이 더해진다**. 주석은 그래도 안 나간다", () => {
    const d = docOfThree();
    const on = linesFromDoc(d, undefined, { withGuides: true });
    expect(on.length).toBe(2);
    // **주석은 3D 좌표가 있어도 안 나간다** — 필터가 좌표가 아니라 **채널**을 본다
    const ids = new Set(on.map(l => l.id));
    const noteId = d.strokes.find(s => s.channel === "note")!.id;
    expect(ids.has(noteId)).toBe(false);
  });

  it("**반례** — 3D가 없으면 채널과 무관하게 안 나간다", () => {
    const d = docOfThree();
    for (const s of d.strokes) s.seg3d = null;
    expect(linesFromDoc(d, undefined, { withGuides: true }).length).toBe(0);
  });
});

describe("저장 — 옛 저장본은 보조선으로 열린다", () => {
  it("왕복하면 채널이 그대로다", () => {
    const d = docOfThree();
    const back = restoreDoc2(serializeDoc2({
      at: "t", imgSize: [960, 672], cam: null as never, rules: null, lensMm: null,
      locked: false, order: 1, doc: d, seq: { stroke: 9, view: 3 },
    })).doc;
    expect(back.strokes.map(s => s.channel)).toEqual(["guide", "result", "note"]);
  });

  it("**채널이 없는 저장본**은 보조선이 된다 — 조용히 결과선이 되지 않는다", () => {
    const d = docOfThree();
    const wire = serializeDoc2({
      at: "t", imgSize: [960, 672], cam: null as never, rules: null, lensMm: null,
      locked: false, order: 1, doc: d, seq: { stroke: 9, view: 3 },
    });
    // 옛 저장본을 흉내 낸다 — 필드를 통째로 뺀다
    for (const t of wire.strokes as { channel?: string }[]) delete t.channel;
    expect(restoreDoc2(wire).doc.strokes.every(s => s.channel === "guide")).toBe(true);
  });
});

describe("D-4 사후 변경 — 주석으로 바꾸면 3D에서 내려온다", () => {
  /**
   * `mainL.setPickedChannel`의 계약을 **자료구조 수준에서** 잠근다(앱 함수는 DOM을 필요로 한다).
   * 요점은 하나다: **주석은 기하가 아니므로 `seg3d`를 들고 있으면 안 된다.**
   */
  it("주석이 된 획은 `seg3d`가 없어야 한다", () => {
    const s: SStroke = newSStroke(PTS, "v1", "guide");
    s.seg3d = SEG;
    s.channel = "note";
    if (!liftable(s)) s.seg3d = null;             // 앱이 하는 것과 같은 판정
    expect(s.seg3d).toBeNull();
  });
});
