// L-D.2 **저장·복원 v2** — `docs/line_plan.md` §9.2(뷰가 2D 획의 소유자)의 성질을 잠근다.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 것:
//   **#34**(같은 결함이 다른 호출부에 남았는가 — v1 `store.ts`가 같은 DB를 쓴다: 키를 갈랐다)
//   **#32**(플래그 0이 "안 돎"일 수 있다 — 반례를 넣어 실제로 걸리는지 본다)
//
// v1에서 실제로 겪은 것 둘을 여기서 미리 막는다:
//   ① **id를 안 이어받아 새 획이 불러온 획과 겹쳤다** → `setDocSeq`
//   ② 뷰를 안 담으면 **2D 레이어가 통째로 사라진다**(`viewRef`가 가리킬 곳이 없다)
import { describe, it, expect } from "vitest";
import { newDoc, newSStroke, newView, resetDocSeq, setDocSeq, docSeq,
         type DocState } from "../src/ui/doc.js";
import { serializeDoc2, restoreDoc2, isDoc2, DOC2_FORMAT,
         type Doc2 } from "../src/ui/docStore.js";
import { ConstraintAccumulator } from "../src/s3d/constraints.js";
import { linesFromDoc, toObj, toGltf } from "../src/ui/exportGeom.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const IMG: [number, number] = [960, 672];

/** 뷰 둘 · 3D 획 하나 · 2D 획 둘(각 뷰 소유)인 문서. 저장이 지켜야 하는 최소 구조다. */
function fixture(): DocState {
  resetDocSeq();
  const d = newDoc();                                  // 확정 뷰(v1, pose = null)
  const v2 = newView("궤도 45°", { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] });
  d.views.push(v2);
  const a = newSStroke([[10, 20], [100, 120]] as Pt2[], d.views[0].id);
  a.seg3d = [[0, 0, 3] as Vec3, [1, 0.5, 3.2] as Vec3];
  a.axis = 0;
  a.snapStart = { kind: "endpoint", at: [0, 0, 3] as Vec3, ofId: "s9" };
  const b = newSStroke([[30, 40], [60, 90]] as Pt2[], d.views[0].id);   // 2D 레이어(확정 뷰)
  const c = newSStroke([[5, 5], [50, 55]] as Pt2[], v2.id);             // 2D 레이어(궤도 뷰)
  d.strokes.push(a, b, c);
  d.currentView = v2.id;
  return d;
}

const src = (d: DocState) => ({
  at: "2026-08-16T00:00:00.000Z", imgSize: IMG,
  cam: new ConstraintAccumulator(IMG).dump(), locked: true, order: 2, doc: d, seq: docSeq(),
});

/** JSON을 한 번 통과시킨다 — IndexedDB의 구조적 복제와 같은 자리다. */
const round = (d: Doc2): Doc2 => JSON.parse(JSON.stringify(d)) as Doc2;

describe("L-D.2 저장·복원 v2", () => {
  it("**뷰와 뷰별 2D 획이 그대로 돌아온다**(§9.2)", () => {
    const d = fixture();
    const back = restoreDoc2(round(serializeDoc2(src(d))));
    expect(back.doc.views.map(v => v.id)).toEqual(d.views.map(v => v.id));
    expect(back.doc.views[1].pose).not.toBeNull();
    expect(back.doc.currentView).toBe(d.currentView);
    // 2D 레이어가 **소유자별로** 남는다
    const pend = back.doc.strokes.filter(s => !s.seg3d);
    expect(pend.length).toBe(2);
    expect(new Set(pend.map(s => s.viewRef))).toEqual(new Set([d.views[0].id, d.views[1].id]));
  });

  it("`pts2d`·`seg3d`·스냅 출처가 **한 비트도 안 변한다**", () => {
    const d = fixture();
    const back = restoreDoc2(round(serializeDoc2(src(d))));
    for (let i = 0; i < d.strokes.length; i++) {
      expect(back.doc.strokes[i].pts2d).toEqual(d.strokes[i].pts2d);
      expect(back.doc.strokes[i].seg3d).toEqual(d.strokes[i].seg3d);
      expect(back.doc.strokes[i].snapStart).toEqual(d.strokes[i].snapStart);
      expect(back.doc.strokes[i].axis).toBe(d.strokes[i].axis);
    }
    expect(back.locked).toBe(true);
    expect(back.order).toBe(2);
  });

  it("**id를 이어 받는다** — 안 이어받으면 새 획이 불러온 획과 겹친다(반례)", () => {
    const doc0 = fixture();
    const saved = round(serializeDoc2(src(doc0)));

    // 반례: 이어받지 않으면 `s1`이 다시 나가고 **같은 id**가 된다
    resetDocSeq();
    const collide = newSStroke([[0, 0], [1, 1]] as Pt2[], "v1");
    expect(saved.strokes.some(s => s.id === collide.id)).toBe(true);

    // 이어받으면 안 겹친다 — 뷰 번호도 함께
    resetDocSeq();
    const back = restoreDoc2(saved);
    setDocSeq(back.seq);
    const fresh = newSStroke([[0, 0], [1, 1]] as Pt2[], back.doc.currentView);
    const freshView = newView("새 뷰", null);
    expect(back.doc.strokes.some(s => s.id === fresh.id)).toBe(false);
    expect(back.doc.views.some(v => v.id === freshView.id)).toBe(false);
  });

  it("**없는 뷰를 가리키는 획**은 확정 뷰로 데려온다(조용히 사라지지 않는다)", () => {
    const d = fixture();
    const saved = round(serializeDoc2(src(d)));
    saved.strokes[2].viewRef = "v999";                  // 손으로 고친 문서·낡은 판본
    saved.currentView = "v999";
    const back = restoreDoc2(saved);
    const home = back.doc.views.find(v => v.pose === null)!;
    expect(back.doc.strokes[2].viewRef).toBe(home.id);
    expect(back.doc.currentView).toBe(home.id);
    expect(back.doc.strokes.length).toBe(3);            // 하나도 안 잃는다
  });

  it("반례: v1 문서나 남의 JSON은 열지 않는다", () => {
    expect(isDoc2({ format: "s2s-doc/1", strokes: [], views: [] })).toBe(false);
    expect(isDoc2({ format: DOC2_FORMAT, strokes: [] })).toBe(false);      // views 없음
    expect(isDoc2({ format: DOC2_FORMAT, strokes: [], views: [] })).toBe(false);  // 빈 뷰
    expect(isDoc2(null)).toBe(false);
  });

  it("내보내기는 **3D만** 내고 뷰 이름을 남긴다(2D 레이어는 좌표가 없다)", () => {
    const d = fixture();
    const lines = linesFromDoc(d, id => d.views.find(v => v.id === id)?.name ?? id);
    expect(lines.length).toBe(1);                       // 3D는 하나뿐이다
    expect(lines[0].view).toBe("확정 뷰");
    const obj = toObj(lines);
    expect(obj.strokes).toBe(1);
    expect(obj.data).toContain("view=확정 뷰");
    expect(obj.data).not.toMatch(/^f /m);               // 면은 없다
    const gl = toGltf(lines).data as { nodes: { name: string }[];
                                       meshes: { primitives: { mode: number }[] }[] };
    expect(gl.nodes[0].name).toContain("@확정 뷰");
    expect(gl.meshes[0].primitives[0].mode).toBe(3);    // LINE_STRIP
  });

  it("카메라 제약이 **입력 그대로** 담긴다 — 열어서 이어 조정할 수 있다", () => {
    const acc = new ConstraintAccumulator(IMG);
    acc.add({ kind: "vp_line", axis: 0, a: [0, 0], b: [100, 10] });
    acc.add({ kind: "vp_line", axis: 0, a: [0, 200], b: [100, 190] });
    const d = fixture();
    const saved = round(serializeDoc2({ ...src(d), cam: acc.dump() }));
    const back = restoreDoc2(saved);
    const again = new ConstraintAccumulator(IMG).load(back.cam!);
    expect(again.solve().axes[0].status).toBe("fixed");
    expect((again.solve().axes[0] as { nLines: number }).nLines).toBe(2);
  });
});
