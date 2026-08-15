// L-B.2 **핸들 예산** — 산출: `stage0/out/guide_budget.json`.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#29(여유는 사용자가 만지는 양으로)** · **#17(측정 경로와 앱 경로)** · #3(정의의 귀결) ·
//   #6(대조군) · #11(분모) · #12(동작점 하나) · #25(원장) · #26(사전 등록)
//
// **사전 등록**(측정 전에 박는다):
//   판정 대상 — 초안 가이드를 **캔버스 끝까지 늘리면** 핸들 예산이 늘어나는가.
//   기준      — **가장 짧은 가이드의 예산**으로 읽는다. 가장 긴 것으로 읽으면 4배가 나오는데
//               **카메라 정확도는 가장 나쁜 축이 정한다**(리뷰어 2회차 [13-b]에서 걸린 자리).
//   통과      — 늘린 뒤 **최소 예산이 늘어나고**, **카메라(f·소실점)는 안 바뀐다**.
//   구도      — 등록 5구도 전부. 등급 3종.
//
// ⚠ **이것은 정확도의 측정이 아니다.** 카메라 해의 핸들 위치에 대한 수치 미분이고
// 결정론적이다(#3). "사람이 이 예산 안에 놓는가"는 여전히 표본 0이다(AS-L9).
//
// ⚠ **핸들 하나만 움직인다는 가정** 위의 값이다. 사람은 가이드 6개 = 핸들 12개를 만진다(DEFERRED).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { axisSensitivity, solveGuides, SENS_TOL } from "../src/s3d/vpSensitivity.js";
import { draftFromDetection, extendGuide, DRAFT_TOL, type Guide } from "../src/s3d/vpDraft.js";
import { scene, boxEdges, drawEdges, groundPoint, round } from "./scene3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";
import type { Pt2 } from "../src/s3d/camera.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** 등록 5구도(`lift_gate`·`camera_gate`·`stage_cam`과 같은 집합). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
/** **단일 뷰포트의 크기**(L-B.1 브라우저 확인과 같은 값). 옛 좌우 분할은 490×672였다. */
const SZ: [number, number] = [1280, 675];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];

const shortest = (g: Guide[]): number | null =>
  g.length ? Math.min(...g.map(x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]))) : null;

/** 축별 예산 중 **최솟값** — 정확도를 정하는 것이 그것이다. */
function minBudget(g: Guide[]): number | null {
  const xs = axisSensitivity(g, SZ).map(s => s.budgetPx).filter((x): x is number => x != null);
  return xs.length ? Math.min(...xs) : null;
}

describe("L-B.2 핸들 예산 — 초안을 늘리면 예산이 느는가", () => {
  it("측정을 원장에 남긴다", () => {
    const rows: Record<string, unknown> = {};
    let nCases = 0, nSolved = 0, nImproved = 0, nCameraMoved = 0;
    /** **왜 안 서는지 추측하지 않고 센다**(PITFALLS #7). 59가 무엇인지 안 적은 것이 지적이었다. */
    const why = { guides_lt_4: 0, axes_lt_2: 0, recover_failed: 0, ok: 0 };
    /** 늘리기의 **상한이 무엇인가** — 캔버스인가 그림인가(리뷰어 [1][4]). */
    const ceiling = { at_vertical_min: 0, other_below_required: 0, above_required: 0 };
    const canvasChordMax = Math.min(SZ[0], SZ[1]) - 2 * DRAFT_TOL.margin_ratio * Math.hypot(SZ[0], SZ[1]);
    /** 구도별 최소 예산 — **가장 나쁜 구도**를 본문에서 빼지 않기 위해서다(#8·#16). */
    const worstByComp: Record<string, number[]> = {};
    const gainRatios: number[] = [];
    const requiredPx = DRAFT_TOL.min_guide_ratio * Math.hypot(SZ[0], SZ[1]);
    let shortBefore = 0, shortAfter = 0;      // 요구 길이 미달 가이드 수(#11: 직접 센다)
    let totalGuides = 0;

    for (const grade of GRADES) {
      for (const C of COMPOSITIONS) {
        const before: number[] = [], after: number[] = [], lenB: number[] = [], lenA: number[] = [];
        for (const seed of SEEDS) {
          const sc = scene(C.yaw, C.pitch, 1000, SZ);
          const O = groundPoint(sc, C.origin);
          if (!O) continue;
          const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
          const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + 1), 0.12, 0.01, 0);
          if (!drawn) continue;
          nCases += 1;
          const draft = draftFromDetection(
            drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[] })), SZ);
          if (draft.length < 4) { why.guides_lt_4 += 1; continue; }
          let ext = draft;
          for (let i = 0; i < draft.length; i++) ext = extendGuide(ext, i, SZ);
          totalGuides += draft.length;
          shortBefore += draft.filter(g =>
            Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) < requiredPx).length;
          shortAfter += ext.filter(g =>
            Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) < requiredPx).length;

          const axesWithTwo = ([0, 1, 2] as const)
            .filter(a => draft.filter(g => g.axis === a).length >= 2).length;
          const sB = solveGuides(draft, SZ), sA = solveGuides(ext, SZ);
          if (!sB || !sA) {
            if (axesWithTwo < 2) why.axes_lt_2 += 1; else why.recover_failed += 1;
            continue;
          }
          why.ok += 1;
          nSolved += 1;
          // **늘리기의 상한**: 캔버스 안 현이 최대인가(= 캔버스가 정한다), 아니면 더 짧은가
          for (const g of ext) {
            const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
            // 늘린 뒤 길이는 **언제나 그 방향의 캔버스 안 현**이다 — 그림이 정하지 않는다.
            // 세는 것은 "가장 짧은 현(수직)에 몰려 있는가"이고, 그것이 요구치 미달의 정체다.
            if (Math.abs(L - canvasChordMax) < 1.0) ceiling.at_vertical_min += 1;
            else if (L < requiredPx) ceiling.other_below_required += 1;
            else ceiling.above_required += 1;
          }
          // **대조군**: 늘리기가 카메라를 바꾸면 사용자의 조정이 날아간다 — 안 바뀌어야 한다
          if (Math.abs(sA.f - sB.f) / sB.f > 1e-6) nCameraMoved += 1;
          const bB = minBudget(draft), bA = minBudget(ext);
          const lB = shortest(draft), lA = shortest(ext);
          if (bB != null && bA != null) {
            before.push(bB); after.push(bA);
            gainRatios.push(bA / bB);
            if (bA > bB) nImproved += 1;
            (worstByComp[C.name] ??= []).push(bA);
          }
          if (lB != null) lenB.push(lB);
          if (lA != null) lenA.push(lA);
        }
        const med = (xs: number[]) => {
          const v = [...xs].sort((a, b) => a - b);
          return v.length ? round(v[v.length >> 1], 3) : null;
        };
        rows[`${C.name}/${grade}`] = {
          n: before.length, of_seeds: SEEDS.length,
          min_budget_px: { before: med(before), after: med(after) },
          shortest_guide_px: { before: med(lenB), after: med(lenA) },
        };
      }
    }

    const gm = [...gainRatios].sort((a, b) => a - b);
    const doc = {
      what: "L-B.2 — 초안 가이드를 캔버스 끝까지 늘리면 **핸들 예산**이 늘어나는가",
      plan: "docs/line_plan.md §5.2 (개정 2 번호)",
      preregistered: {
        target: "가장 짧은 가이드의 예산. **가장 긴 것으로 읽지 않는다** — 카메라 정확도는 "
          + "가장 나쁜 축이 정한다(리뷰어 2회차 [13-b]에서 걸린 자리).",
        pass: "늘린 뒤 최소 예산이 늘어나고, 카메라(f)는 안 바뀐다.",
      },
      what_this_is_not: [
        "정확도의 측정이 아니다 — 카메라 해의 **수치 미분**이고 결정론적이다(#3)",
        "**핸들 하나만 움직인다는 가정** 위의 값이다. 사람은 핸들 12개를 만진다(DEFERRED)",
        "사람이 이 예산 안에 놓는가는 **표본 0**이다(AS-L9)",
        "초안은 **검출**에서 나온다 — 검출 축 오차(중앙 4.18°)는 여기서 안 잰다",
      ],
      conditions: {
        canvas_px: SZ, canvas_note: "**단일 뷰포트 크기**(L-B.1). 옛 좌우 분할은 490×672였다.",
        compositions: COMPOSITIONS.map(c => c.name), grades: GRADES, seeds: SEEDS,
        end_jitter: 0.01, skew: 0.12,
        required_guide_px: round(requiredPx, 1),
        budget_deg: SENS_TOL.budget_deg,
      },
      totals: {
        cases: nCases, camera_solvable: nSolved,
        improved: nImproved, camera_moved_by_extend: nCameraMoved,
        gain_ratio: { n: gm.length, min: round(gm[0] ?? null, 3),
                      median: round(gm[gm.length >> 1] ?? null, 3),
                      max: round(gm[gm.length - 1] ?? null, 3) },
        guides_below_required: { before: shortBefore, after: shortAfter, of: totalGuides,
          note: "**직접 센 수**다(#10: 뺄셈으로 만들지 않는다). `min_guide_ratio` "
            + `${DRAFT_TOL.min_guide_ratio} × 대각 = ${round(requiredPx, 1)}px 미만인 가이드.` },
      },
      why_camera_not_solvable: {
        note: "**추측하지 않고 센다**(PITFALLS #7). `31/90`의 나머지 59가 무엇인지 "
          + "안 적은 것이 리뷰어 지적이었다. 분모는 `cases`다(#11).",
        counters: why,
        vs_vp_detect: "⚠ `vp_detect.json`은 같은 잡음에서 확정률 **0.883**을 낸다. "
          + "여기가 낮은 것은 검출이 나빠서가 아니라 **소실점을 가이드 선 두 개로 줄이는 "
          + "초안 변환**을 지나기 때문이다 — 두 수치를 나란히 읽지 않는다(#27).",
      },
      extend_ceiling: {
        note: "**늘린 뒤 길이는 언제나 그 방향의 캔버스 안 현이다** — 그림이 정하지 않는다"
          + "(DEFERRED의 옛 원인 귀속이 뒤집혔다, 리뷰어 [1][4]). "
          + "캔버스 안 최대 현은 짧은 변에서 "
          + `${round(canvasChordMax, 1)}px다(높이 ${SZ[1]} − 여백 2×${round(DRAFT_TOL.margin_ratio * Math.hypot(SZ[0], SZ[1]), 1)}). `
          + "**수직에 가까운 가이드는 어떤 그림에서도 요구 651px에 닿을 수 없다** — "
          + "잔존 미달의 원인은 그림이 아니라 **캔버스 높이**다.",
        canvas_chord_max_px: round(canvasChordMax, 2),
        required_px: round(requiredPx, 1),
        counts: ceiling,
      },
      worst_composition: {
        note: "**가장 나쁜 구도를 본문에서 빼지 않는다**(#8·#16). 축에 적용한 '가장 나쁜 것이 "
          + "정한다'를 구도에도 적용한다.",
        min_budget_px_after_by_composition: Object.fromEntries(
          Object.entries(worstByComp).map(([k, v]) => [k, {
            n: v.length, min: round(Math.min(...v), 3), max: round(Math.max(...v), 3),
            unusable_lt_1px: v.filter(x => x < SENS_TOL.unusable_px).length,
          }])),
      },
      by_case: rows,
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "guide_budget.json"), JSON.stringify(doc, null, 2));

    // 사전 등록한 통과 조건
    expect(nSolved).toBeGreaterThan(0);
    expect(nCameraMoved).toBe(0);                 // 늘리기는 카메라를 안 바꾼다
    expect(nImproved / nSolved).toBeGreaterThan(0.5);
  }, 300_000);
});
