// S-6 (2) §4.3 면 위 사선 — 산출: `stage0/out/face_diagonal.json`.
//
// **면 + 시선 광선 = 3D 점이 유일하게 결정된다.** 추가 가정이 없는 것이 이 경로의 값어치다.
// 면은 **축 두 개가 편다**(D-S14) — 면 생성(§6, S-8)을 기다릴 필요가 없다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, axisPlane, placeOnFace, PLACE_TOL,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { norm3, sub3, dot3, unit3, cross3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, faceDiagonals, drawEdges, stat, type Scene } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

describe("S-6 (2) 면 위 사선", () => {
  it("축 두 개가 펴는 평면 — 법선이 두 축에 수직이고 앵커를 지난다", () => {
    const pl = axisPlane([0.5, 0.8, 3], SC.axes[0], SC.axes[1])!;
    expect(Math.abs(dot3(pl.n, unit3(SC.axes[0])))).toBeLessThan(1e-9);
    expect(Math.abs(dot3(pl.n, unit3(SC.axes[1])))).toBeLessThan(1e-9);
    expect(dot3(pl.n, [0.5, 0.8, 3])).toBeCloseTo(pl.d, 9);
    // 나란한 두 축은 평면을 못 편다 — 지어내지 않는다
    expect(axisPlane([0, 0, 3], SC.axes[0], SC.axes[0])).toBeNull();
  });

  it("반례: 양 끝에 기존 기하가 없으면 **놓지 않는다** — 검증할 수단이 없다", () => {
    const pts = [[300, 300], [420, 380]] as [number, number][];
    expect(placeOnFace([], pts, CTX, 20)).toBeNull();
  });

  it("회수율을 원장에 남긴다", () => {
    const r = rng32(9700);
    let nDiag = 0, nFree = 0, nRecovered = 0, nAxisAssigned = 0, nAxisPlaced = 0;
    const err: number[] = [], errAxis: number[] = [];
    const wasFree: boolean[] = [];
    const byReason: Record<string, number> = {};

    for (let it = 0; it < 60; it++) {
      const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
      if (!O) continue;
      const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
      const edges = boxEdges(SC, O, a, b, c);
      const diags = faceDiagonals(SC, O, a, b, c);
      const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01);
      const dDiag = drawEdges(SC, diags as never, "medium", r, 0.12, 0.01);
      if (!drawn || !dDiag) continue;

      resetStrokeIds();
      const list: Stroke[] = drawn.map(d => {
        const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                                 { principal: SC.principal, f: SC.f });
        return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
      });
      settle(list, CTX, { mode: "facing" });
      const before = list.length;
      for (const d of dDiag) {
        nDiag += 1;
        const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                                 { principal: SC.principal, f: SC.f });
        byReason[v.reason] = (byReason[v.reason] ?? 0) + 1;
        // **사선이 축으로 배정되면 그것이 조용히 틀린 것이다** — 회수 이전의 문제다
        if (v.axis !== "free") nAxisAssigned += 1; else nFree += 1;
        wasFree.push(v.axis === "free");
        list.push(newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined));
      }
      settle(list, CTX, { mode: "facing", facePlanes: PLACE_TOL.face_far_end });

      const diag3 = norm3(sub3(edges[11].b, edges[0].a));
      // **갈라 센다.** 축으로 배정된 사선이 놓인 것은 회수가 아니라 **조용히 틀린 배치**다.
      for (let i = before; i < list.length; i++) {
        const s = list[i];
        if (!s.pts3d.length) continue;
        const t = diags[i - before];
        const e = [norm3(sub3(s.pts3d[0], t.a)) / diag3,
                   norm3(sub3(s.pts3d[s.pts3d.length - 1], t.b)) / diag3];
        if (wasFree[wasFree.length - dDiag.length + (i - before)]) { nRecovered += 1; err.push(...e); }
        else { nAxisPlaced += 1; errAxis.push(...e); }
      }
    }

    const report = {
      spec: "S-6 (2) §4.3 면 위 사선. 상자의 두 면에 대각선을 긋고 회수율을 잰다.",
      constants: constantsSnapshot(),
      approach: (
        "**면은 축 두 개가 편다**(D-S14). 계획서의 '이미 정의된 면'을 면 생성(§6, S-8)까지 "
        + "기다리지 않는다 — 상자의 면은 축 두 개가 펴는 평면이고 앵커가 위치를 정한다. "
        + "닫힌 획 루프 검출도 필요 없다(A-3). 어느 면인지는 **S-6 (1)의 정합성 검사**로 고른다."
      ),
      metrics: {
        unclassified_rate: "사선이 **미분류로 남는 비율**. 축으로 배정되면 그것이 조용히 틀린 것이다.",
        recovered_of_unclassified: "**미분류로 남은** 사선 중 면 위에 놓인 비율 — 이것이 §4.3의 회수율이다.",
        corner_err_ratio: "회수된 사선의 끝점과 참값의 거리 ÷ 상자 대각.",
      },
      comparison_note: (
        "**AS-5의 비교 기준은 0.29~0.36**(오탐 보정 후 비직교 직선 획)이고 **52.6%가 아니다**. "
        + "다만 이 측정은 **합성 상자의 면 대각선**만 다루므로 그 분모와 직접 비교되지 않는다 — "
        + "여기서 재는 것은 '면 위 사선이라는 것을 알 때 놓을 수 있는가'이고, "
        + "'실획의 비직교 획 중 몇 %가 면 위 사선인가'는 **실획이 들어와야 안다**(AS-13)."
      ),
      condition: { grade: "medium", skew: 0.12, end_jitter: 0.01, boxes: 60, seed: 9700 },
      n_diagonals: nDiag,
      unclassified_rate: rate(nFree, nDiag),
      axis_assigned_rate: rate(nAxisAssigned, nDiag),
      /** **미분류로 남은 사선 중** 면 위에 놓인 비율 — 이것이 §4.3의 회수율이다. */
      recovered_of_unclassified: rate(nRecovered, nFree),
      recovered_of_all: rate(nRecovered, nDiag),
      corner_err_ratio: stat(err, 4),
      axis_misplaced: {
        n: nAxisPlaced,
        corner_err_ratio: stat(errAxis, 4),
        note: (
          "**축으로 배정된 사선이 놓인 것은 회수가 아니라 조용히 틀린 배치다.** "
          + "갈라 세지 않으면 회수율이 부풀려진다 — 처음에 그렇게 셌다가 고쳤다."
        ),
      },
      by_reason: byReason,
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "face_diagonal.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(nDiag).toBeGreaterThan(50);
  }, 300_000);
});
