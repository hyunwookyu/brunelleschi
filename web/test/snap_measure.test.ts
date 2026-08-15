// L-B.3 **스냅 반경과 성공률** — 산출: `stage0/out/snap.json`. 계획서 §3.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-B.3 절에 적었다.
// **#2·#4가 이 항목의 전부다** — 합성 잉크의 끝점은 `endJitter = 0`이면 참 모서리에
// **못으로 박혀 있다**(`scene3d.ts` 머리말). 그 조건만 재면 성공률 1.0이 나오는데
// 그것은 스냅의 성질이 아니라 **픽스처의 성질**이다. 그래서 `endJitter`를 스윕한다.
//
// **그리고 픽스처의 성질이 하나 더 있다 — 대상 밀도다.** 상자 하나(모서리 12개)는
// 꼭짓점이 서로 멀어서 반경을 아무리 키워도 엉뚱한 꼭짓점을 안 문다. 그 표만 보면
// "반경은 클수록 좋다"가 나오는데 그것은 **상자 하나를 잰 것**이다.
// `boxLattice`로 밀도를 올려 같은 스윕을 다시 돈다(`by_density`).
//
// ---------------------------------------------------------------- 무엇을 재는가
//
// ```
// 질의  : 획의 **첫 잉크 점**(화면 px)
// 대상  : **그 획을 뺀** 나머지 참 3D 모서리   ← 앱에서 새 획을 그릴 때와 같은 상황이다
// 정답  : 그 획이 겨냥한 참 모서리의 시작 끝점
// 판정  : 맞음 / **틀림**(다른 참 대상에 붙음) / 미스(아무 데도 안 붙음)
// ```
//
// **대상을 참 3D로 준다** — 스냅 기전만 떼어 재기 위해서다. 실제로는 이미 올라간 기하가
// 대상이고 그것은 자기 오차를 갖는다. 이 산출물은 **스냅의 상한**이다. 배치와 함께 도는
// 판은 `lift_grade.json`에 있고 **두 값을 나란히 읽지 않는다**(#27).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { snapCandidates, SNAP_TOL, type SnapCand, type SnapSeg, type SnapCtx,
         type SnapKind } from "../src/s3d/snap.js";
import { norm3, sub3, project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, boxLattice, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { rng32, INK_GRADES, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** **등록된 5구도 그대로**(`lift_gate`·`camera_gate`·`stage_cam`과 같은 집합). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const SZ: [number, number] = [960, 672];
const DIAG = Math.hypot(SZ[0], SZ[1]);
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
/** **동작점을 하나 고르지 않는다**(#12). 0은 **픽스처가 못을 박은 조건**이라 대조로만 쓴다. */
const JITTERS = [0, 0.01, 0.03, 0.05];
/**
 * 반경 스윕(#13 — 절단값이 결론을 정하면 그 결론은 없다).
 *
 * ⚠ **사전 등록한 스윕은 0.05에서 끝났는데 등록한 두 규칙이 둘 다 그 경계값을 골랐다** —
 * 최적이 스윕 밖에 있었다는 뜻이고, 그 표로는 "0.05가 좋다"가 아니라 **"더 키워도 좋아진다"**
 * 까지만 말할 수 있었다. **규칙은 그대로 두고 스윕만 넓혔다.**
 */
const REGISTERED_RADII = [0.008, 0.012, 0.018, 0.025, 0.035, 0.05];
const RADII = [...REGISTERED_RADII, 0.07, 0.10, 0.14, 0.20, 0.28];
const RMAX = RADII[RADII.length - 1];
/** 대상 밀도 — `boxLattice`의 등분 수. 획 수는 12 / 54 / 144다. */
const DENSITY_K = [1, 2, 3];

interface Tally { correct: number; wrong: number; miss: number }
const zero = (): Tally => ({ correct: 0, wrong: 0, miss: 0 });
const frac = (t: Tally) => {
  const n = t.correct + t.wrong + t.miss;
  return {
    // **분자/분모로 적는다**(#14) — 시드 변동폭 때문에 비율의 자릿수를 믿지 않는다
    correct_over_total: `${t.correct}/${n}`,
    wrong_over_total: `${t.wrong}/${n}`,
    miss_over_total: `${t.miss}/${n}`,
    correct: round(t.correct / Math.max(1, n), 4),
    wrong: round(t.wrong / Math.max(1, n), 4),
  };
};

interface Fx { sc: Scene; segs: SnapSeg[]; starts: { pt: Pt2; want: Vec3; aim: number }[] }

function fixture(ci: number, grade: InkGrade, seed: number, jit: number, k = 1): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges: TrueEdge[] = k === 1
    ? boxEdges(sc, O, C.box[0], C.box[1], C.box[2])
    : boxLattice(sc, O, C.box[0], C.box[1], C.box[2], k);
  // **같은 시드 산식**(`stage_cam`과 같다) — 하네스마다 다른 잉크를 쓰면 비교가 안 된다
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const segs: SnapSeg[] = edges.map((e, i) => ({ id: `s${i}`, a: e.a, b: e.b }));
  const starts = drawn.map((d, i) => {
    const pt = d.pts2d[0] as Pt2;
    const u = project(edges[i].a, sc.principal, sc.f);
    return { pt, want: edges[i].a, aim: u ? Math.hypot(u[0] - pt[0], u[1] - pt[1]) : NaN };
  });
  return { sc, segs, starts };
}

/**
 * **후보를 한 번만 모으고 반경별로 고른다.** `snapCandidates`는 (순위, 거리) 순으로 정렬돼
 * 있으므로 거리 필터 뒤의 첫 원소가 `snapAt(반경 r)`과 **같다** — 반경마다 다시 돌 이유가 없다.
 * (밀도 스윕에서 교점 후보가 O(n²)이라 이 절약이 없으면 안 돈다.)
 */
function pickAtRadius(cands: SnapCand[], rpx: number): SnapCand | null {
  for (const c of cands) if (c.dist <= rpx) return c;
  return null;
}

describe("L-B.3 — 스냅 반경과 성공률", () => {
  it("측정을 원장에 남긴다", () => {
    /** 반경 → 등급 → 잡음 → 집계. */
    const cube: Record<string, Record<string, Record<string, Tally>>> = {};
    const byRadius: Record<string, Tally> = {};
    /** 반경별 종류 분포 — **무엇에 붙었는가**(#7: 추측하지 말고 센다). */
    const kindCount: Record<string, Record<string, number>> = {};
    /** **틀린 것이 어느 종류였나** — 반경을 키울 때 무엇이 무너지는지 이것만 말해 준다. */
    const wrongKind: Record<string, Record<string, number>> = {};
    const byComp: Record<string, Record<string, Tally>> = {};
    const aimByJit: Record<string, number[]> = {};
    const aimByGrade: Record<string, number[]> = {};

    for (const rr of RADII) {
      const key = rr.toFixed(3);
      cube[key] = {}; byRadius[key] = zero(); kindCount[key] = {};
      wrongKind[key] = {}; byComp[key] = {};
      for (const g of GRADES) cube[key][g] = {};
    }

    /** 한 픽스처를 돌려 집계에 더한다. 밀도 스윕이 **같은 함수**를 쓴다. */
    function run(fx: Fx, sink: (rkey: string, v: keyof Tally, kind: SnapKind | "none") => void,
                 onAim?: (aim: number) => void) {
      const ctxBase: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                                 ground: null, from: null };
      // 판정 임계: 가장 긴 참 모서리의 1/100 안이면 "그 대상"으로 본다
      const hit = Math.max(...fx.segs.map(s => norm3(sub3(s.b, s.a)))) * 0.01;
      for (let k = 0; k < fx.starts.length; k++) {
        const { pt, want, aim } = fx.starts[k];
        if (Number.isFinite(aim)) onAim?.(aim);
        // **자기 획은 대상에서 뺀다** — 앱에서 새 획을 그릴 때 그 획은 아직 기하가 아니다
        const targets = fx.segs.filter((_, i) => i !== k);
        const cands = snapCandidates(pt, targets, ctxBase, { radius_ratio: RMAX });
        for (const rr of RADII) {
          const got = pickAtRadius(cands, rr * DIAG);
          const verdict: keyof Tally = !got ? "miss"
            : (norm3(sub3(got.at, want)) <= hit ? "correct" : "wrong");
          sink(rr.toFixed(3), verdict, got ? got.kind : "none");
        }
      }
    }

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const cname = COMPOSITIONS[ci].name;
      for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) continue;
        const jk = String(jit);
        run(fx, (rkey, v, kind) => {
          ((cube[rkey][grade][jk] ??= zero()))[v] += 1;
          byRadius[rkey][v] += 1;
          ((byComp[rkey][cname] ??= zero()))[v] += 1;
          kindCount[rkey][kind] = (kindCount[rkey][kind] ?? 0) + 1;
          if (v === "wrong") wrongKind[rkey][kind] = (wrongKind[rkey][kind] ?? 0) + 1;
        }, (aim) => { (aimByJit[jk] ??= []).push(aim); (aimByGrade[grade] ??= []).push(aim); });
      }
    }

    // ---- **대상 밀도 스윕** — 상자 하나는 꼭짓점이 멀어 반경을 키워도 안 틀린다.
    // 격자로 대상을 늘리면 "반경은 클수록 좋다"가 유지되는지 본다(#2·#4의 두 번째 형태).
    const densTally: Record<string, Record<string, Tally>> = {};
    const densWrongKind: Record<string, Record<string, Record<string, number>>> = {};
    const densInfo: Record<string, { strokes: number; nearest_corner_px: number | null }> = {};
    for (const k of DENSITY_K) {
      const dk = `k${k}`;
      densTally[dk] = {}; densWrongKind[dk] = {};
      for (const rr of RADII) {
        densTally[dk][rr.toFixed(3)] = zero();
        densWrongKind[dk][rr.toFixed(3)] = {};
      }
      let strokes = 0;
      const nearest: number[] = [];
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const seed of [1, 2]) for (const jit of [0.01, 0.03, 0.05]) {
          const fx = fixture(ci, "medium", seed, jit, k);
          if (!fx) continue;
          strokes = fx.starts.length;
          // **대상 밀도의 직접 측정** — 참 꼭짓점 사이 화면 최단거리(그래야 반경과 비교된다)
          if (seed === 1 && jit === 0.01) {
            const pts = fx.segs.flatMap(s => [s.a, s.b])
              .map(p => project(p, fx.sc.principal, fx.sc.f)).filter((p): p is Pt2 => !!p);
            for (let i = 0; i < pts.length; i++) {
              let best = Infinity;
              for (let j = 0; j < pts.length; j++) {
                if (i === j) continue;
                const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
                if (d > 1e-6 && d < best) best = d;
              }
              if (Number.isFinite(best)) nearest.push(best);
            }
          }
          run(fx, (rkey, v, kind) => {
            densTally[dk][rkey][v] += 1;
            if (v === "wrong") {
              densWrongKind[dk][rkey][kind] = (densWrongKind[dk][rkey][kind] ?? 0) + 1;
            }
          });
        }
      }
      densInfo[dk] = { strokes, nearest_corner_px: stat(nearest, 1).median };
    }

    // ---- 사전 등록한 두 규칙(#28 — 둘이 다르면 둘 다 적는다)
    const pickRules = (t: Record<string, Tally>) => {
      let bestNet = RADII[0], bestVal = -Infinity, ratioPick: number | null = null;
      for (const rr of RADII) {
        const x = t[rr.toFixed(3)];
        if (x.correct - x.wrong > bestVal) { bestVal = x.correct - x.wrong; bestNet = rr; }
        if (x.wrong <= 0.1 * x.correct) ratioPick = rr;      // 만족하는 **가장 큰** 반경
      }
      // ---- 규칙 C(**사후 추가다 — 사유를 적는다**, #28): **포화점**.
      // 등록한 둘이 실패했다: A는 반경을 키우는 비용이 이 픽스처에 없어서 계속 커지고
      // (0.14 = 캔버스 대각의 1/7), B는 밀도를 올리면 **어떤 반경도 만족하지 못한다**.
      // 포화점 = 미스가 1% 이하이면서 **다음 칸의 맞음 증가가 1% 이하**인 가장 작은 반경.
      let sat: number | null = null;
      for (let i = 0; i < RADII.length; i++) {
        const x = t[RADII[i].toFixed(3)];
        const n = x.correct + x.wrong + x.miss;
        if (x.miss > 0.01 * n) continue;
        const nx = i + 1 < RADII.length ? t[RADII[i + 1].toFixed(3)] : null;
        if (!nx || nx.correct - x.correct <= 0.01 * n) { sat = RADII[i]; break; }
      }
      return { rule_a_max_net: bestNet, rule_b_wrong_le_10pct: ratioPick, rule_c_saturation: sat };
    };

    // ---- ⚠ `endJitter = 0`을 뺀 판 — **픽스처가 못을 박은 조건이라 결론에 못 쓴다**(#2)
    const noNail: Record<string, Tally> = {};
    for (const rr of RADII) {
      const k = rr.toFixed(3);
      noNail[k] = zero();
      for (const g of GRADES) for (const j of JITTERS) {
        if (j === 0) continue;
        const t = cube[k][g][String(j)];
        if (t) {
          noNail[k].correct += t.correct; noNail[k].wrong += t.wrong; noNail[k].miss += t.miss;
        }
      }
    }

    const doc = {
      what: "L-B.3 — 시작점 스냅이 손 획에서 붙는가, 반경은 얼마여야 하는가",
      plan: "docs/line_plan.md §3(개정 1 유지) / 개정 2 §11 L-B.3",
      precedent: "Rhino Osnap · SketchUp inference를 그대로 따랐다(A-3). 목록·우선순위·"
        + "'여러 후보면 순위가 높은 것'이 전부 선례이고 새로 설계한 것이 없다.",
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name),
        grades: GRADES, seeds: SEEDS, end_jitters: JITTERS, radii_ratio: RADII, skew: 0.12,
        radii_registered: REGISTERED_RADII,
        radii_note: "⚠ **사전 등록한 스윕은 0.05에서 끝났고 등록한 두 규칙이 둘 다 그 경계값을 "
          + "골랐다** — 최적이 스윕 밖이었다는 뜻이고, 그 표로는 '0.05가 좋다'가 아니라 "
          + "'더 키워도 좋아진다'까지만 말할 수 있었다(#13). **규칙은 그대로 두고 스윕만 넓혔다.**",
        canvas_px: SZ, canvas_diag_px: round(DIAG, 1),
        radius_px_equivalent: Object.fromEntries(RADII.map(r => [r.toFixed(3), round(r * DIAG, 1)])),
        targets: "**질의한 획을 뺀** 나머지 **참 3D 모서리**. 앱에서 새 획을 그릴 때와 같다.",
        ground: "**끈다.** `on_face`는 화면 거리가 정의상 0이라 넣으면 성공률이 공짜로 1이 된다(#3).",
        upper_bound_note: "대상을 참 3D로 준다 — **스냅의 상한**이다. 실제로는 이미 올라간 기하가 "
          + "대상이고 그것은 자기 오차를 갖는다. `lift_grade.json`과 나란히 읽지 않는다(#27).",
        verdict_tol: "붙은 3D 점이 참 대상에서 **가장 긴 모서리의 1/100** 안이면 그 대상으로 본다.",
      },
      self_confirmation_guard: {
        why: "**합성 잉크의 끝점은 `endJitter = 0`이면 참 모서리에 못으로 박혀 있다**"
          + "(`scene3d.ts` 머리말 / PITFALLS #2·#4). 그 조건만 재면 성공률 1.0이 나오는데 "
          + "그것은 스냅의 성질이 아니라 픽스처의 성질이다.",
        aim_error_px_by_end_jitter: Object.fromEntries(
          Object.entries(aimByJit).map(([k, v]) => [k, stat(v, 2)])),
        aim_error_px_by_grade: Object.fromEntries(
          Object.entries(aimByGrade).map(([k, v]) => [k, stat(v, 2)])),
        aim_error_note: "**이것이 반경을 직접 말하는 양이다** — 시작 잉크 점이 참 모서리의 상에서 "
          + "몇 px 어긋나는가. `endJitter = 0`에서도 0이 아닌 이유는 `renderInk`의 고주파가 "
          + "끝점에도 얹히기 때문이다(활은 양끝에서 정확히 0이다).",
        grade_is_not_the_axis: "⚠ **등급은 이 양을 거의 안 바꾼다.** 활이 양끝에서 0이므로 "
          + "`lf_bow`가 시작점에 안 닿는다 — **시작점 겨냥 오차를 정하는 것은 `endJitter`이고 "
          + "등급이 아니다.** `coarse` 배치가 무너지는 원인을 시작점 겨냥에서 찾으면 안 된다는 "
          + "뜻이고, 그 답은 `lift_grade.json`이 낸다.",
        conclusion_uses: "**`end_jitter > 0`만 쓴다**(`net_excluding_nailed_endpoints`).",
      },
      registered_rules: {
        note: "**측정 전에 박았다**(#26, `progress.md`의 사전 등록 절). 둘이 다르면 둘 다 적는다(#28).",
        all_cells: pickRules(byRadius),
        excluding_nailed: pickRules(noNail),
        warning: "⚠ **등록한 두 규칙이 둘 다 실패했다.** A는 반경을 키우는 비용이 이 픽스처에 "
          + "없어서 계속 커진다(캔버스 대각의 1/5~1/3). B는 대상 밀도를 올리면 **어떤 반경도 "
          + "만족하지 못한다**(k2·k3에서 `null`) — 겨냥 오차가 대상 간격의 절반을 넘으면 "
          + "**반경이 아니라 그 비가 한계를 정하기** 때문이다. 그래서 규칙 C(포화점)를 "
          + "**사후에 추가하고 사유를 여기 적는다**(#28: 사유 없이 바꾸지 않는다).",
        rule_c_definition: "미스가 1% 이하이면서 다음 칸의 맞음 증가가 1% 이하인 **가장 작은 반경**. "
          + "'더 키워도 얻는 것이 없다'는 지점이고, 픽스처에 없는 비용(화면이 어수선해지는 것)을 "
          + "대신한다.",
        chosen: "**`SNAP_TOL.radius_ratio`는 밀도가 가장 높은 `k3`의 포화점을 쓴다** — 실제 그림은 "
          + "상자 하나보다 대상이 촘촘하고, 성긴 쪽에서 고르면 촘촘해질 때 못 쓴다.",
      },
      by_radius_all: Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(byRadius[r.toFixed(3)])])),
      net_excluding_nailed_endpoints:
        Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(noNail[r.toFixed(3)])])),
      by_density: {
        note: "**대상 밀도를 올린다**(`boxLattice`). `k1`은 상자 12모서리, `k2`는 54, `k3`은 144다. "
          + "등급 medium · 시드 2 · 잡음 {0.01,0.03,0.05} · 5구도. **반경 선택이 밀도에 "
          + "얼마나 딸려 움직이는지가 이 표의 전부다.**",
        fixtures: densInfo,
        nearest_corner_note: "참 꼭짓점 사이 화면 최단거리의 중앙값. **반경이 이 값의 절반을 "
          + "넘으면 원리적으로 이웃 꼭짓점을 문다.**",
        rules: Object.fromEntries(DENSITY_K.map(k => [`k${k}`, pickRules(densTally[`k${k}`])])),
        rows: Object.fromEntries(DENSITY_K.map(k => [`k${k}`,
          Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(densTally[`k${k}`][r.toFixed(3)])]))])),
        wrong_by_kind: densWrongKind,
      },
      by_radius_grade_jitter: Object.fromEntries(RADII.map(r => [r.toFixed(3),
        Object.fromEntries(GRADES.map(g => [g,
          Object.fromEntries(JITTERS.map(j =>
            [String(j), frac(cube[r.toFixed(3)][g][String(j)] ?? zero())]))]))])),
      by_composition: Object.fromEntries(RADII.map(r => [r.toFixed(3),
        Object.fromEntries(Object.entries(byComp[r.toFixed(3)]).map(([k, v]) => [k, frac(v)]))])),
      snapped_kind_counts: {
        note: "**무엇에 붙었는가**(#7). `none`은 미스다. 끝점이 지배해야 정상이다 — "
          + "모서리 접합을 겨냥한 획이므로.",
        rows: kindCount,
      },
      wrong_by_kind: {
        note: "**틀린 것이 어느 종류였나.** 반경을 키울 때 무엇이 무너지는지 이것만 말해 준다 — "
          + "`on_edge`가 지배하면 '모서리를 못 찾아 옆 선 몸통에 붙었다'이고, `endpoint`가 "
          + "늘기 시작하면 '**다른 꼭짓점**을 물었다'로 성질이 바뀐다(#16: 병목이 옮겨간 것).",
        rows: wrongKind,
      },
      constants: constantsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "snap.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식(임계가 아니라 규약 검사다)
    // 반경을 키우면 미스는 단조 감소한다 — 아니면 후보 수집이 반경을 안 읽는 것이다
    for (let i = 1; i < RADII.length; i++) {
      expect(byRadius[RADII[i].toFixed(3)].miss)
        .toBeLessThanOrEqual(byRadius[RADII[i - 1].toFixed(3)].miss);
    }
    // **양성 채널**(#30·#6) — 겨냥 오차가 커지면 실제로 값이 움직여야 한다.
    // 안 움직이면 "스냅이 튼튼하다"가 아니라 "섭동이 도달하지 않았다"이고 그때 이 표는 무의미하다.
    expect(stat(aimByJit["0.05"]).median!).toBeGreaterThan(stat(aimByJit["0"]).median! * 3);
    // 밀도를 올리면 대상이 실제로 촘촘해져야 한다 — 아니면 밀도 축이 안 걸린 것이다
    expect(densInfo.k3.nearest_corner_px!).toBeLessThan(densInfo.k1.nearest_corner_px!);
    expect(SNAP_TOL.radius_ratio).toBeGreaterThan(0);
    expect(INK_GRADES.coarse.lf_bow).toBeGreaterThan(INK_GRADES.precise.lf_bow);
  }, 300_000);
});
