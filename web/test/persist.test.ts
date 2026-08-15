// S-9 **저장·복원과 내보내기** — 산출: `stage0/out/persist.json`.
//
// ## 이 단계의 물음은 하나다 — **무엇이 재생성되지 않는가**
//
// 계획서 §5는 `pts2d`가 원본이고 `pts3d`는 파생이라 적었다(`reprojectAll`이 다시 만든다).
// 그 말이 맞다면 저장할 것은 `pts2d`와 카메라뿐이다. **그것을 그대로 믿지 않고 잰다** —
// 저장한 문서를 열고 (가) 담아 둔 `pts3d`를 쓰는 경우와 (나) `reprojectAll`로 다시 만드는
// 경우를 **같은 문서에서** 비교한다. (나)가 (가)와 갈리는 만큼이 "저장하지 않으면 잃는 것"이다.
//
// 대조군이 없으면 "사용자 지정 배치는 재생성되지 않는다"는 **주장으로만 남는다**
// (반복 유형 7: "이래서 필요하다"는 주장에는 대조군을 붙인다).
//
// 함께 잠그는 것:
//   - **왕복 항등** — `pts2d`가 한 비트도 안 변한다(§5 "원본을 반드시 보존한다").
//   - **id 이어받기** — 안 하면 새 획이 불러온 획과 id가 겹친다. 조용히 틀리는 종류다.
//   - **내보내기 좌표** — OBJ·glTF가 같은 규약(Y 위·−Z 앞)으로 나가고 되읽으면 원본이다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, reprojectAll, resetStrokeIds, setStrokeSeq, strokeSeq,
         placeByUser, anchorCandidates, PLACE_TOL, diagOf,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { FIRST_VIEW_OPTS } from "../src/s3d/appPlace.js";
import { ConstraintAccumulator } from "../src/s3d/constraints.js";
import { norm3, sub3, project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, drawEdges, stat, type Scene } from "./scene3d.js";
import { serializeDoc, restoreDoc, isDoc, DOC_FORMAT,
         type Doc, type DocSource } from "../src/ui/store.js";
import { toObj, toGltf, toBase64, toExportFrame, srgbToLinear } from "../src/ui/exportGeom.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const APP = FIRST_VIEW_OPTS;

/** 빈 곁가지 상태 — 문서를 만들 때 쓰는 기본값. */
function source(strokes: Stroke[], over: Partial<DocSource> = {}): DocSource {
  return {
    at: "2026-08-15T00:00:00.000Z",       // **시각을 코드가 만들지 않는다**(하네스 규약)
    imgSize: SC.imgSize,
    cam: new ConstraintAccumulator(SC.imgSize).dump(),
    locked: false, lensMm: 35, seq: strokeSeq(),
    strokes, raw: new Map(), viewOrigin: new Set(), viewCam: new Map(),
    provisional: new Set(), userPlaced: new Set(),
    ...over,
  };
}

/** 저장→복원 왕복. **JSON을 한 번 통과시킨다** — IndexedDB의 구조적 복제와 같은 자리다. */
const roundTrip = (d: Doc): Doc => JSON.parse(JSON.stringify(d)) as Doc;

/**
 * 상자 하나를 그려 놓는다. 앱과 같은 옵션(`FIRST_VIEW_OPTS`)으로 배치한다.
 * `edges`는 참 3D — 이 단계에서는 정확도를 재지 않지만 대각 길이를 분모로 쓴다.
 */
function box(seed: number, endJitter = 0.01) {
  const r = rng32(seed);
  const O = groundPoint(SC, [430, 470])!;
  const edges = boxEdges(SC, O, 1.2, 1.0, 0.9);
  const drawn = drawEdges(SC, edges, "medium", r, 0.12, endJitter)!;
  resetStrokeIds();
  const list: Stroke[] = drawn.map(d => {
    const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                             { principal: SC.principal, f: SC.f });
    return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  });
  settle(list, CTX, APP);
  return { list, edges, diag3: norm3(sub3(edges[11].b, edges[0].a)) };
}

/** 획 하나의 3D 이동량(획 길이 대비가 아니라 **상자 대각 대비** — 다른 원장과 같은 분모다). */
function drift(a: Vec3[], b: Vec3[], diag3: number): number | null {
  if (!a.length || !b.length) return null;
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, norm3(sub3(a[i], b[i])) / diag3);
  return m;
}

describe("S-9 저장·복원", () => {
  it("**왕복 항등** — `pts2d`가 한 비트도 안 변한다(§5)", () => {
    const { list } = box(4242);
    const doc = roundTrip(serializeDoc(source(list)));
    const r = restoreDoc(doc);
    expect(r.strokes.length).toBe(list.length);
    for (let i = 0; i < list.length; i++) {
      expect(r.strokes[i].id).toBe(list[i].id);
      expect(r.strokes[i].pts2d).toEqual(list[i].pts2d);
      expect(r.strokes[i].pts3d).toEqual(list[i].pts3d);
      expect(r.strokes[i].axis).toBe(list[i].axis);
      expect(r.strokes[i].anchorRef).toBe(list[i].anchorRef);
    }
  });

  it("**id를 이어 받는다** — 안 이어받으면 새 획이 불러온 획과 겹친다(반례)", () => {
    const { list } = box(4242);
    const doc = roundTrip(serializeDoc(source(list)));

    // 반례: 이어받지 않으면 `s1`이 다시 나가고 불러온 획과 **같은 id**가 된다
    resetStrokeIds();
    const collide = newStroke([[0, 0], [1, 1]], 0);
    expect(doc.strokes.some(s => s.id === collide.id)).toBe(true);

    // 이어받으면 겹치지 않는다
    resetStrokeIds();
    const r = restoreDoc(doc);
    setStrokeSeq(r.seq);
    const fresh = newStroke([[0, 0], [1, 1]], 0);
    expect(r.strokes.some(s => s.id === fresh.id)).toBe(false);
    expect(fresh.id).toBe(`s${r.seq + 1}`);
  });

  it("카메라는 **입력 그대로** 담긴다 — 풀면 같은 소실점·f가 나온다", () => {
    const acc = new ConstraintAccumulator(SC.imgSize);
    acc.add({ kind: "vp_point", axis: 0, at: SC.vps[0] });
    acc.add({ kind: "vp_point", axis: 1, at: SC.vps[1] });
    acc.add({ kind: "vp_line", axis: 2, a: SC.vps[2], b: [SC.vps[2][0] + 1, SC.vps[2][1] + 40] });
    acc.add({ kind: "vp_line", axis: 2, a: SC.vps[2], b: [SC.vps[2][0] + 40, SC.vps[2][1] + 1] });
    const before = acc.solve();

    const doc = roundTrip(serializeDoc(source([], { cam: acc.dump() })));
    const back = new ConstraintAccumulator(SC.imgSize).load(restoreDoc(doc).cam);
    const after = back.solve();

    expect(after.camera.case).toBe(before.camera.case);
    expect(after.camera.f!).toBeCloseTo(before.camera.f!, 6);
    for (const a of [0, 1, 2] as const) {
      expect(after.axes[a].status).toBe(before.axes[a].status);
    }
    // **선 두 개로 정한 축은 선 두 개로 복원된다** — 점으로 굳히면 잔차 표시가 달라진다
    expect((after.axes[2] as { nLines: number }).nLines).toBe(2);
  });

  it("반례: 형식이 다른 JSON은 열지 않는다", () => {
    expect(isDoc({ format: "s2s-session/1", strokes: [], cam: {} })).toBe(false);
    expect(isDoc(null)).toBe(false);
    expect(isDoc({ format: DOC_FORMAT, strokes: [] })).toBe(false);   // cam이 없다
  });

  it("`Stroke.layer`는 담지 않는다 — 담으면 미사용 필드 탐지(S-8c)가 눈을 잃는다", () => {
    const { list } = box(4242);
    list[0].layer = 7;
    const doc = roundTrip(serializeDoc(source(list)));
    expect(JSON.stringify(doc)).not.toContain("layer");
    expect(restoreDoc(doc).strokes[0].layer).toBe(0);
  });
});

describe("S-9 내보내기", () => {
  it("OBJ는 **폴리라인만** 내고 좌표를 되읽으면 원본이다", () => {
    const { list } = box(4242);
    const r = toObj(list);
    expect(r.data).not.toMatch(/^f /m);                 // 면은 없다(D-S20)
    const placed = list.filter(s => s.pts3d.length >= 2);
    expect(r.strokes).toBe(placed.length);
    expect(r.skippedUnplaced).toBe(list.length - placed.length);

    const verts = [...r.data.matchAll(/^v (\S+) (\S+) (\S+)$/gm)]
      .map(m => [Number(m[1]), Number(m[2]), Number(m[3])] as Vec3);
    const lines = [...r.data.matchAll(/^l (.+)$/gm)].map(m => m[1].split(" ").map(Number));
    expect(lines.length).toBe(placed.length);
    expect(verts.length).toBe(r.points);

    let worst = 0;
    placed.forEach((s, i) => {
      expect(lines[i].length).toBe(s.pts3d.length);
      s.pts3d.forEach((p, k) => {
        const v = verts[lines[i][k] - 1];               // OBJ 인덱스는 1부터다
        const q = toExportFrame(p);
        worst = Math.max(worst, Math.abs(v[0] - q[0]), Math.abs(v[1] - q[1]), Math.abs(v[2] - q[2]));
      });
    });
    expect(worst).toBeLessThan(1e-5);                   // 소수 6자리로 적는다
  });

  it("glTF는 LINE_STRIP이고 버퍼를 풀면 같은 좌표다", () => {
    const { list } = box(4242);
    const g = toGltf(list, { colorOf: () => "#c0392b" }).data as {
      meshes: { primitives: { mode: number; attributes: { POSITION: number } }[] }[];
      accessors: { bufferView: number; count: number; min: number[]; max: number[] }[];
      bufferViews: { byteOffset: number; byteLength: number }[];
      buffers: { uri: string; byteLength: number }[];
      materials: { pbrMetallicRoughness: { baseColorFactor: number[] } }[];
    };
    for (const m of g.meshes) expect(m.primitives[0].mode).toBe(3);
    expect(g.materials.length).toBe(1);                 // 같은 색은 재료 하나로 모인다

    const b64 = g.buffers[0].uri.split(",")[1];
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    expect(bytes.length).toBe(g.buffers[0].byteLength);
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);

    const placed = list.filter(s => s.pts3d.length >= 2);
    let worst = 0;
    placed.forEach((s, i) => {
      const acc = g.accessors[i], bv = g.bufferViews[acc.bufferView];
      expect(acc.count).toBe(s.pts3d.length);
      const base = bv.byteOffset / 4;
      s.pts3d.forEach((p, k) => {
        const q = toExportFrame(p);
        for (let c = 0; c < 3; c++) {
          worst = Math.max(worst, Math.abs(f32[base + k * 3 + c] - q[c]));
          expect(q[c]).toBeGreaterThanOrEqual(acc.min[c] - 1e-6);   // min/max는 필수 필드다
          expect(q[c]).toBeLessThanOrEqual(acc.max[c] + 1e-6);
        }
      });
    });
    expect(worst).toBeLessThan(1e-5);                   // float32의 자릿수
  });

  it("base64는 Node의 것과 같다(자체 구현이라 반례로 잠근다)", () => {
    for (const n of [0, 1, 2, 3, 5, 17, 64]) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (i * 37 + 11) & 255;
      expect(toBase64(b)).toBe(Buffer.from(b).toString("base64"));
    }
  });

  it("색은 **선형**으로 나간다(baseColorFactor는 sRGB가 아니다)", () => {
    expect(srgbToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(srgbToLinear("#000000")).toEqual([0, 0, 0]);
    const mid = srgbToLinear("#808080")[0];
    expect(mid).toBeGreaterThan(0.21);                  // 0.5^2.2 ≈ 0.216
    expect(mid).toBeLessThan(0.22);
  });

  it("내보내기 좌표 변환은 **손잡이를 안 바꾼다**(뷰포트의 x축 180°와 같다)", () => {
    const x = toExportFrame([1, 0, 0]), y = toExportFrame([0, 1, 0]), z = toExportFrame([0, 0, 1]);
    // x × y = z 가 유지되면 오른손 좌표계 그대로다(거울상이 아니다)
    const cx = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
    for (let i = 0; i < 3; i++) expect(cx[i]).toBeCloseTo(x[i], 12);   // ±0을 가르지 않는다
  });
});

// ---------------------------------------------------------------- 측정 (원장)

describe("S-9 측정 — 재생성 대조", () => {
  it("저장하지 않으면 무엇을 잃는가", () => {
    const SEEDS = [4242, 7, 991, 20250815, 31337];
    /**
     * **동작점을 하나 고르지 않는다**(D-S7, 반복 유형 12). 끝점 겨냥 오차 0.01은 이 방식이
     * 성립한다고 주장하는 구간이고, **손에 있는 실획 자릿수(0.028~0.051)는 그 밖이다**(AS-12).
     * 지우개 횟수도 스윕한다 — 갈림의 크기가 **주입한 이력의 함수**이기 때문이다(리뷰어 지적).
     */
    const JITTERS = [0.01, 0.02];
    const ERASES = [0, 1, 2];
    const radius = PLACE_TOL.join_ratio * diagOf(SC.imgSize) * PLACE_TOL.fix_candidate_radius_mult;

    interface Cell {
      strokes: number; userStrokes: number; userLost: number; userMoved: number[];
      autoLost: number; autoMoved: number[]; autoGained: number; erased: number;
      /** 재생성이 **다른 앵커**를 골랐는가 — 사용자의 선택이 안 남았다는 직접 증거. */
      userOtherAnchor: number;
      bySeed: Record<string, unknown>[];
    }
    const cell = (): Cell => ({ strokes: 0, userStrokes: 0, userLost: 0, userMoved: [],
                                autoLost: 0, autoMoved: [], autoGained: 0, erased: 0,
                                userOtherAnchor: 0, bySeed: [] });
    const res: Record<string, Cell> = {};
    /** 카메라가 바뀌면 기존 기하가 얼마나 움직이는가 — D-S23의 논증을 수치로 바꾼다. */
    const camShift: Record<string, number[]> = { "f_plus_10pct": [], "f_minus_10pct": [] };

    for (const jit of JITTERS) for (const nErase of ERASES) {
      const key = `jitter_${jit}_erase_${nErase}`;
      const C = res[key] = cell();
      for (const seed of SEEDS) {
        const { list, diag3 } = box(seed, jit);

        // (1) **지우개** — 지운 뒤 자동 배치를 다시 돌리지 않는다(S-7 3).
        //     고르는 규칙: **놓였고 앵커가 있는 획을 앞에서부터**(원장에 적는다).
        for (let k = 0; k < nErase; k++) {
          const i = list.findIndex(s => s.pts3d.length && s.anchorRef);
          if (i < 0) break;
          list.splice(i, 1);
          C.erased += 1;
        }
        // (2) **사용자 지정 배치** — 미배치 획을 사람이 붙인다(S-7, D-S18).
        const userIds = new Set<string>();
        const userAnchor = new Map<string, string>();
        for (const s of list) {
          if (s.pts3d.length) continue;
          const placedOthers = list.filter(t => t.id !== s.id && t.pts3d.length);
          const c0 = anchorCandidates(placedOthers, s.pts2d[0], radius);
          const c1 = anchorCandidates(placedOthers, s.pts2d[s.pts2d.length - 1], radius);
          if (!c0.length && !c1.length) continue;
          const r = placeByUser(s, CTX, { a: c0[0]?.pos, b: c1[0]?.pos });
          if (!r) continue;
          s.pts3d = r.pts3d;
          userIds.add(s.id);
          userAnchor.set(s.id, (c0[0] ?? c1[0]).id);
        }

        // ---- 저장 → 열기 ----
        const doc = roundTrip(serializeDoc(source(list, { userPlaced: userIds })));
        const kept = restoreDoc(doc);                       // (가) 담아 둔 `pts3d`를 쓴다
        const regen = restoreDoc(doc);                      // (나) 대조군 — 다시 만든다
        reprojectAll(regen.strokes, CTX, APP);

        let userLost = 0, autoLost = 0, autoGained = 0, otherAnchor = 0;
        const userMoved: number[] = [], autoMoved: number[] = [];
        for (let i = 0; i < kept.strokes.length; i++) {
          const a = kept.strokes[i], b = regen.strokes[i];
          const isUser = kept.userPlaced.has(a.id);
          if (isUser && b.anchorRef && b.anchorRef !== userAnchor.get(a.id)) otherAnchor += 1;
          if (a.pts3d.length && !b.pts3d.length) { isUser ? userLost++ : autoLost++; continue; }
          if (!a.pts3d.length && b.pts3d.length) { autoGained += 1; continue; }
          const d = drift(a.pts3d, b.pts3d, diag3);
          if (d == null) continue;
          (isUser ? userMoved : autoMoved).push(+d.toFixed(6));
        }
        C.strokes += kept.strokes.length;
        C.userStrokes += userIds.size;
        C.userLost += userLost; C.autoLost += autoLost; C.autoGained += autoGained;
        C.userOtherAnchor += otherAnchor;
        C.userMoved.push(...userMoved); C.autoMoved.push(...autoMoved);
        C.bySeed.push({ seed, n_strokes: kept.strokes.length, n_user_placed: userIds.size,
          user_lost_by_regen: userLost, user_other_anchor: otherAnchor,
          auto_lost_by_regen: autoLost, auto_gained_by_regen: autoGained,
          user_moved_over_0_05: userMoved.filter(v => v > 0.05).length });

        // 왕복 자체는 **한 비트도 안 변한다**
        for (let i = 0; i < list.length; i++) expect(kept.strokes[i].pts3d).toEqual(list[i].pts3d);

        // ---- 카메라를 흔들면 기존 기하가 얼마나 움직이는가(D-S23의 논증 → 수치) ----
        if (jit === 0.01 && nErase === 1) {
          const arms: [string, number][] = [["f_plus_10pct", 1.1], ["f_minus_10pct", 0.9]];
          for (const [k, mult] of arms) {
            const moved = restoreDoc(doc);
            reprojectAll(moved.strokes, { ...CTX, f: CTX.f * mult }, APP);
            for (let i = 0; i < kept.strokes.length; i++) {
              const d = drift(kept.strokes[i].pts3d, moved.strokes[i].pts3d, diag3);
              if (d != null) camShift[k].push(+d.toFixed(6));
            }
          }
        }
      }
    }

    /** 내보내기는 **미배치가 섞인 장면**으로 낸다 — 안 그러면 건너뛰기 분기가 안 돈다. */
    const exportScene = box(991, 0.02);
    const obj = toObj(exportScene.list);
    const gl = toGltf(exportScene.list);
    const base = res["jitter_0.01_erase_1"];

    const summarize = (C: Cell) => ({
      strokes: C.strokes,
      erased_total: C.erased,
      user_placed: C.userStrokes,
      user_lost_by_regen: C.userLost,
      user_lost: C.userLost + "/" + C.userStrokes,
      user_lost_rate: C.userStrokes ? +(C.userLost / C.userStrokes).toFixed(4) : null,
      user_drift_of_survivors: stat(C.userMoved, 4),
      user_other_anchor: C.userOtherAnchor,
      auto_population: C.strokes - C.userStrokes,
      auto_lost_by_regen: C.autoLost,
      auto_lost_rate: +(C.autoLost / Math.max(1, C.strokes - C.userStrokes)).toFixed(4),
      auto_gained_by_regen: C.autoGained,
      auto_drift: stat(C.autoMoved, 4),
      by_seed: C.bySeed,
    });

    const report = {
      spec: "S-9 저장·복원. **무엇이 재생성되지 않는가**를 대조군으로 잰다.",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: (
        "`HANDOFF.md`가 \"`pts3d`는 저장하지 않아도 된다 — `reprojectAll`이 다시 만든다\"고 "
        + "적었다(계획서 §5의 자료구조를 그렇게 읽은 것이다). 그 말을 그대로 믿지 않고 "
        + "**같은 문서에서** (가) 담아 둔 `pts3d`와 (나) `reprojectAll` 재생성을 비교한다."
      ),
      metrics: {
        user_lost_by_regen: "사용자가 놓은 획 중 **재생성하면 미배치가 되는** 수.",
        user_drift_of_survivors: "재생성에서도 놓인 사용자 획이 **원래 자리에서 옮겨간 거리**"
          + "(상자 대각 대비). 0이 아니면 사용자가 고른 자리가 아니다.",
        user_other_anchor: "재생성이 **다른 획을 앵커로 골랐다** — 사용자의 선택이 안 남았다는 직접 증거.",
        auto_lost_by_regen: "자동으로 놓였던 획 중 재생성하면 안 놓이는 수(지우개 이력의 귀결). "
          + "분모는 `auto_population`(전체 − 사용자 지정)이다.",
        auto_gained_by_regen: "반대로 재생성에서 새로 놓이는 수 — **화면에 없던 것이 생긴다**.",
        camera_change_drift: "**카메라가 바뀌면 기존 기하가 얼마나 움직이는가.** D-S23의 "
          + "\"재조정 때는 재생성이 맞다\"를 논증이 아니라 수치로 만든다 — 앵커가 이만큼 움직이므로 "
          + "사용자 지정 배치를 그 자리에 두면 붙어 있던 획에서 떨어진다.",
      },
      condition: {
        composition: "요 35°·피치 15° 3점, 직육면체 하나(구도가 하나뿐이다)",
        grade: "medium", skew: 0.12, seeds: SEEDS,
        end_jitter_sweep: JITTERS, erase_sweep: ERASES,
        app_opts: "FIRST_VIEW_OPTS(앱과 같은 배선, S-7 0)",
        erase_rule: "**놓였고 `anchorRef`가 있는 획을 앞에서부터** 지운다(자동 재배치는 안 돌린다).",
        user_fix_rule: "미배치 획의 양 끝에서 **가장 가까운 후보**를 고른다(`고치기`의 첫 후보).",
        single_composition_warning: "구도가 하나뿐이다 — 실획에서 다시 본다(AS-13).",
        end_jitter_warning: "0.01은 이 방식이 성립한다고 주장하는 구간이고 실획 자릿수"
          + "(0.028~0.051)는 그 밖이다(AS-12). 그래서 0.02를 함께 낸다.",
        not_measured: [
          "**돌린 시점에서 그린 획**은 이 하네스에 없다(첫 시점만 만든다). 그 획의 `pts2d`는 "
          + "뷰 좌표라 첫 카메라로 재생성하는 **경로 자체가 없다** — 측정이 아니라 정의다.",
          "카메라 재조정 팔은 f만 흔든다(주점·소실점은 그대로).",
        ],
      },
      by_condition: Object.fromEntries(Object.entries(res).map(([k, C]) => [k, summarize(C)])),
      headline: {
        cell: "jitter_0.01_erase_1",
        user_lost: base.userLost + "/" + base.userStrokes,
        note: "**비율로 읽지 않는다** — 시드 하나가 분자를 1 움직인다(`by_seed` 참조). "
          + "결론(저장한다)은 0이 아니라는 것만으로 선다.",
      },
      camera_change_drift: Object.fromEntries(Object.entries(camShift)
        .map(([k, v]) => [k, stat(v, 4)])),
      export: {
        scene: "seed 991 · end_jitter 0.02 — **미배치가 섞인 장면**을 고른다(건너뛰기 분기 확인)",
        obj: { strokes: obj.strokes, points: obj.points, skipped_unplaced: obj.skippedUnplaced,
               bytes: obj.data.length },
        gltf: { strokes: gl.strokes, points: gl.points, skipped_unplaced: gl.skippedUnplaced,
                bytes: JSON.stringify(gl.data).length },
        note: "폴리라인으로 내보낸다 — 면을 만들지 않는 도구이고(D-S20) 튜브는 화면 표현이다.",
      },
      decision: (
        "**담아 둔 `pts3d`를 쓴다**(재생성하지 않는다). 근거는 \"재생성이 불가능하다\"가 아니라 "
        + "**\"재생성은 사용자가 고른 자리를 복원하지 않는다\"**이다 — 일부는 아예 안 놓이고, "
        + "놓이는 것도 다른 앵커에 다른 자리로 간다(`user_other_anchor`). 자동 배치는 "
        + "**지우개 이력이 없으면 한 획도 안 갈린다**(`erase_0` 셀) — 갈림은 이력에서 온다. "
        + "**카메라를 다시 조정할 때는 재생성이 맞다**: `camera_change_drift`만큼 기존 기하가 "
        + "움직이므로 사용자 지정 배치를 그 자리에 두면 붙어 있던 획에서 떨어진다."
      ),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "persist.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(base.userStrokes).toBeGreaterThan(0);
    // **지우개가 없으면 자동 배치는 한 획도 안 갈려야 한다**(같은 입력 → 같은 출력).
    // 갈리면 `settle`이 순서 의존이라는 뜻이고, 그것은 S-9보다 큰 문제다.
    const noErase = res["jitter_0.01_erase_0"];
    expect(noErase.autoLost).toBe(0);
    expect(noErase.autoGained).toBe(0);
  }, 300_000);
});
