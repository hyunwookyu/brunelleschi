// L-D.2 **저장·복원 v2** — `docs/line_plan.md` §9.2(뷰가 2D 획의 소유자)의 성질을 잠근다.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 것:
//   **#34**(같은 결함이 다른 호출부에 남았는가 — v1 `store.ts`가 같은 DB를 쓴다: 키를 갈랐다)
//   **#32**(플래그 0이 "안 돎"일 수 있다 — 반례를 넣어 실제로 걸리는지 본다)
//
// v1에서 실제로 겪은 것 둘을 여기서 미리 막는다:
//   ① **id를 안 이어받아 새 획이 불러온 획과 겹쳤다** → `setDocSeq`
//   ② 뷰를 안 담으면 **2D 레이어가 통째로 사라진다**(`viewRef`가 가리킬 곳이 없다)
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";
import { newDoc, newSStroke, newView, resetDocSeq, setDocSeq, docSeq,
         type DocState } from "../src/ui/doc.js";
import { serializeDoc2, restoreDoc2, isDoc2, DOC2_FORMAT,
         type Doc2 } from "../src/ui/docStore.js";
import { ConstraintAccumulator } from "../src/s3d/constraints.js";
import { linesFromDoc, toObj, toGltf } from "../src/ui/exportGeom.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");
/** **원장에 남긴다**(PITFALLS #25) — 문장으로만 있는 확인은 selfcheck를 한 번도 안 지난다. */
const led: Record<string, unknown> = {};

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
  cam: new ConstraintAccumulator(IMG).dump(), doc: d, seq: docSeq(),
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
    led.views_and_pending = { views: back.doc.views.length, pending_2d: pend.length,
                              owners: [...new Set(pend.map(s => s.viewRef))].length,
                              pose_survives: back.doc.views[1].pose !== null };
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
    // ⚠ `locked`·`order`는 더 이상 저장하지 않는다(지시 1 — 파생 상태는 계산한다)
    led.bit_identical = { strokes: d.strokes.length,
                          fields: ["pts2d", "seg3d", "snapStart", "axis"],
                          note: "**설계 보장이다**(#5) — 담기로 한 필드이므로 같을 수밖에 없다. "
                            + "임계를 걸지 않는다. 깨지면 저장 포맷 결함이다" };
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
    led.id_continues = { collides_without_setDocSeq: true, collides_with_setDocSeq: false,
                         seq: back.seq,
                         note: "**반례가 실제로 걸린다**(#32) — 이어받지 않으면 같은 id가 난다" };
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
    led.dangling_viewref = { rehomed_to: "확정 뷰(pose === null)", strokes_lost: 0,
                             note: "손으로 고친 문서·낡은 판본에서 온다. **조용히 안 사라진다**" };
  });

  it("반례: v1 문서나 남의 JSON은 열지 않는다", () => {
    expect(isDoc2({ format: "s2s-doc/1", strokes: [], views: [] })).toBe(false);
    expect(isDoc2({ format: DOC2_FORMAT, strokes: [] })).toBe(false);      // views 없음
    expect(isDoc2({ format: DOC2_FORMAT, strokes: [], views: [] })).toBe(false);  // 빈 뷰
    expect(isDoc2(null)).toBe(false);
    led.rejects = { "s2s-doc/1(v1)": false, "views 없음": false, "빈 뷰": false, "null": false,
                    note: "**거절이 설계다** — 위 `v1_rejected` 참조" };
  });

  it("내보내기는 **3D만** 내고 뷰 이름을 남긴다(2D 레이어는 좌표가 없다)", () => {
    const d = fixture();
    // ⚠ **2026-08-17 D-3이 채널 필터를 더했다**: 기본은 **결과선만** 나가고 보조선은 옵션이다.
    // 이 픽스처의 획은 기본 채널(보조선)이라 옵션을 켜야 종전과 같은 것을 잰다 —
    // 채널 자체는 `channel.test.ts`가 잠근다(#17: 한 시험이 두 가지를 재지 않는다).
    const lines = linesFromDoc(d, id => d.views.find(v => v.id === id)?.name ?? id,
                               { withGuides: true });
    expect(lines.length).toBe(1);                       // 3D는 하나뿐이다
    // **반례** — 옵션을 끄면 보조선이라 안 나간다(필터가 실제로 돈다)
    expect(linesFromDoc(d).length).toBe(0);
    expect(lines[0].view).toBe("확정 뷰");
    const obj = toObj(lines);
    expect(obj.strokes).toBe(1);
    expect(obj.data).toContain("view=확정 뷰");
    expect(obj.data).not.toMatch(/^f /m);               // 면은 없다
    const gl = toGltf(lines).data as { nodes: { name: string }[];
                                       meshes: { primitives: { mode: number }[] }[] };
    expect(gl.nodes[0].name).toContain("@확정 뷰");
    expect(gl.meshes[0].primitives[0].mode).toBe(3);    // LINE_STRIP
    led.export_3d_only = { doc_strokes: d.strokes.length, exported: lines.length,
                           obj_has_face: /^f /m.test(obj.data), obj_has_view: true,
                           gltf_mode: 3,
                           note: "2D 레이어는 좌표가 없으므로 안 나간다 — **미배치는 대기지 "
                             + "내보낼 것이 아니다**(§9.1)" };
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
    led.camera_constraints = { axis0_status: again.solve().axes[0].status, n_lines: 2,
                               note: "**입력(선)을 담는다** — 푼 결과가 아니다. 그래야 열어서 "
                                 + "이어 조정할 수 있고 차수 승격이 전부 다시 푼다(§6.1)" };
  });
});

afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "doc_store.json"), JSON.stringify({
    spec: "L-D.2 저장·복원 v2 — 뷰가 2D 획의 소유자라는 성질을 저장이 지키는가(§9.2)",
    plan: "docs/line_plan.md L-D.2 · §9.2",
    what_this_does_not_say: [
      "**IndexedDB를 안 탄다** — 여기는 직렬화 함수의 왕복이다(구조적 복제는 JSON으로 흉내낸다). "
        + "실제 저장소 왕복은 `stage_browser.json`의 `l_d3_save_roundtrip`이다",
      "성능 — 문서 크기·저장 지연을 안 잰다",
      "v1 문서의 이전(migration) — **거절**이 설계다(아래 `v1_rejected`)",
    ],
    v1_rejected: "v1 문서는 열지 않는다. **옛 UI(`index.html`)로 그린 저장은 새 UI에서 안 뜬다.** "
      + "이전 경로를 안 짜는 이유: v1에는 뷰가 없어 `viewRef`를 만들어 내야 하고, "
      + "그러면 **없는 소유 관계를 지어내는 것**이다(A-3: 애매하면 놓지 않는다). "
      + "키도 갈랐다(`current` 대 `current2`) — 같은 DB에서 서로 덮지 않는다(#34).",
    format: DOC2_FORMAT,
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 2), "utf-8");
});

describe("6차 지시 3 — pathStats 저장(실획 측정 재료)", () => {
  it("pathStats가 저장 문서에 그대로 실린다 · 없으면(옛 저장본) undefined 그대로다(반례)", () => {
    const d = fixture();
    const withStats = round(serializeDoc2({
      ...src(d), pathStats: { direct: 3, lift: 1, twoPoint: 2 },
    }));
    expect(withStats.pathStats).toEqual({ direct: 3, lift: 1, twoPoint: 2 });
    // 반례 — 옛 저장본(필드 없음)이 무언가로 채워지면 실획 측정이 0을 지어낸 것이 된다
    const without = round(serializeDoc2(src(d)));
    expect(without.pathStats).toBeUndefined();
  });
});

describe("7차 항목 1-c — 저장 무결성(뷰 자세)", () => {
  // `pose === null`은 **확정 뷰의 표식**이다(doc.ts — 자세 항등). 실획 첫 표본(2026-08-17)에서
  // 이 표식이 "자세 저장 누락"으로 오독됐다 — 표식 자체는 설계이고, 실패로 기록해야 하는 것은
  // **표식의 전제가 깨진 문서**다(확정 뷰 0개/2개·비유한 자세). 정상 경로로는 안 만들어지므로
  // 걸리면 조용히 깨진 파일 대신 저장 실패를 남긴다.
  it("확정 뷰가 없으면 던진다(반례)", () => {
    const d = fixture();
    d.views[0].pose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] };  // 표식 파괴
    expect(() => serializeDoc2(src(d))).toThrowError(/저장 무결성.*0개/);
  });
  it("확정 뷰가 둘이면 던진다(반례)", () => {
    const d = fixture();
    d.views[1].pose = null;                                    // 두 번째 확정 뷰
    expect(() => serializeDoc2(src(d))).toThrowError(/저장 무결성.*2개/);
  });
  it("자세에 NaN이 섞이면 던진다(반례)", () => {
    const d = fixture();
    d.views[1].pose!.C = [NaN, 0, 0];
    expect(() => serializeDoc2(src(d))).toThrowError(/저장 무결성.*유한/);
  });
  it("정상 문서(확정 뷰 하나 + 유한 자세)는 그대로 저장된다", () => {
    const d = fixture();
    expect(() => serializeDoc2(src(d))).not.toThrow();
    // **원장에 남긴다**(#25 — 1-R′ [11] 대응): 반례 셋이 실제로 던지고 정상이 지나간다
    const thrown = (mut: (x: DocState) => void): boolean => {
      const f = fixture();
      mut(f);
      try { serializeDoc2(src(f)); return false; } catch { return true; }
    };
    led.pose_integrity = {
      spec: "7차 항목 1-c — serializeDoc2가 확정 뷰 표식(pose null 정확히 1)·자세 유한성을 강제한다",
      throws_no_confirm: thrown(x => { x.views[0].pose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] }; }),
      throws_two_confirm: thrown(x => { x.views[1].pose = null; }),
      throws_nan_pose: thrown(x => { x.views[1].pose!.C = [NaN, 0, 0]; }),
      ok_normal: true,
      note: "정상 경로로는 안 만들어지는 상태다 — 걸리면 조용히 깨진 파일 대신 저장 실패를 기록한다(A-3)",
    };
  });
});
