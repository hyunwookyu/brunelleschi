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
import { snapCandidates, staticCandidates, SNAP_TOL, type SnapCand, type StaticCand,
         type SnapSeg, type SnapCtx, type SnapKind } from "../src/s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "../src/s3d/liveLine.js";
import { axisDirection, unit3, add3, mul3 } from "../src/s3d/geom3d.js";
import { isFiniteVp } from "../src/s3d/camera.js";
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
/**
 * **밀도 표도 등록 조건 그대로 돈다**(등급 3 · 시드 6). 초판은 등급 1 · 시드 2였는데
 * **앱 상수가 그 표에서 나왔다** — 리뷰어 [4]. 등록을 축소해 놓고 그 사실도 안 적었다(#12·#14).
 */
const DENSITY_JITTERS = [0.01, 0.03, 0.05];
/** 판정 허용오차 스윕 — **하나만 쓰면 세 칸이 전부 그 값에 걸린다**(리뷰어 [12a], #13). */
const VERDICT_TOLS = [1 / 200, 1 / 100, 1 / 50];
/** 규칙 C의 절단 감도(리뷰어 [3], #13). 1%만 쓰면 그 절단이 답을 정한다. */
const RULE_C_CUTS = [0.005, 0.01, 0.02];
/** 본문이 쓰는 판정 허용오차. **사전 등록에 없던 값이라 스윕과 함께 낸다**(리뷰어 [12a]). */
const VERDICT_REF = 1 / 100;

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

interface Fx {
  sc: Scene; segs: SnapSeg[];
  starts: { pt: Pt2; want: Vec3; aim: number }[];
  /** 획의 **마지막 잉크 점** — 실시간 경로에서 커서 자리다. */
  endPts: Pt2[];
}

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
  return { sc, segs, starts, endPts: drawn.map(d => d.pts2d[d.pts2d.length - 1] as Pt2) };
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
    /** 결론 집합(`end_jitter > 0`)만의 종류 분포 — 리뷰어 [10]. */
    const kindCountLive: Record<string, Record<string, number>> = {};
    /** 판정 허용오차 → 반경 → 집계(#13). */
    const verdictSweep: Record<string, Record<string, Tally>> = {};
    const aimByJit: Record<string, number[]> = {};
    const aimByGrade: Record<string, number[]> = {};
    /** 밀도별 겨냥 오차 — **k1의 값을 k3의 간격과 나란히 놓지 않는다**(리뷰어 [5], #27). */
    const aimByDensity: Record<string, number[]> = {};
    /** **의도하지 않은 붙음** — 반경을 키우는 유일한 측정 가능한 비용(리뷰어 [2]). */
    const unintended: Record<string, Record<string, { snapped: number; n: number }>> = {};
    /** **스냅된 시작점에서의 배치 정확도** — L-B 게이트 두 번째 항목(리뷰어 [1]). */
    const place: Record<string, {
      n: number; placed: number; noSnap: number; noAxis: number; noEnd: number;
      err: number[]; w10: number; w20: number; w50: number;
    }> = {};

    for (const rr of RADII) {
      const key = rr.toFixed(3);
      cube[key] = {}; byRadius[key] = zero(); kindCount[key] = {};
      wrongKind[key] = {}; byComp[key] = {}; kindCountLive[key] = {};
      for (const g of GRADES) cube[key][g] = {};
    }

    /**
     * 한 픽스처를 돌려 집계에 더한다. 밀도 스윕이 **같은 함수**를 쓴다.
     *
     * `sink`에 **판정이 아니라 거리**를 준다 — 판정 허용오차를 스윕해야 하기 때문이다
     * (리뷰어 [12a]). 기본 판정은 `hitRef`(가장 긴 모서리의 1/100) 기준이다.
     */
    function run(fx: Fx,
                 sink: (rkey: string, distToWant: number | null, kind: SnapKind | "none",
                        longest: number) => void,
                 onAim?: (aim: number) => void) {
      const ctxBase: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                                 ground: null, from: null };
      const longest = Math.max(...fx.segs.map(s => norm3(sub3(s.b, s.a))));
      // **질의 무관 후보는 한 번만 만든다** — 자기 획을 뺀 집합이 질의마다 다르므로
      // 전체로 만들고 그 획에 속한 후보만 걸러 낸다(결과는 같고 비용만 준다)
      const preAll = staticCandidates(fx.segs);
      for (let k = 0; k < fx.starts.length; k++) {
        const { pt, want, aim } = fx.starts[k];
        if (Number.isFinite(aim)) onAim?.(aim);
        // **자기 획은 대상에서 뺀다** — 앱에서 새 획을 그릴 때 그 획은 아직 기하가 아니다
        const self = `s${k}`;
        const targets = fx.segs.filter((_, i) => i !== k);
        const pre = preAll.filter((c: StaticCand) => c.ofId !== self && c.ofId2 !== self);
        const cands = snapCandidates(pt, targets, ctxBase, { radius_ratio: RMAX }, pre);
        for (const rr of RADII) {
          const got = pickAtRadius(cands, rr * DIAG);
          sink(rr.toFixed(3), got ? norm3(sub3(got.at, want)) : null,
               got ? got.kind : "none", longest);
        }
      }
    }
    const verdictOf = (d: number | null, longest: number, tol: number): keyof Tally =>
      (d == null ? "miss" : (d <= longest * tol ? "correct" : "wrong"));

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const cname = COMPOSITIONS[ci].name;
      for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) continue;
        const jk = String(jit);
        run(fx, (rkey, d, kind, longest) => {
          const v = verdictOf(d, longest, VERDICT_REF);
          ((cube[rkey][grade][jk] ??= zero()))[v] += 1;
          byRadius[rkey][v] += 1;
          ((byComp[rkey][cname] ??= zero()))[v] += 1;
          kindCount[rkey][kind] = (kindCount[rkey][kind] ?? 0) + 1;
          // **결론 집합**(`end_jitter > 0`)만 따로 센다 — 리뷰어 [10].
          // 못으로 박힌 0을 섞으면 같은 표가 다른 분모를 갖는다
          if (jit > 0) kindCountLive[rkey][kind] = (kindCountLive[rkey][kind] ?? 0) + 1;
          if (v === "wrong") wrongKind[rkey][kind] = (wrongKind[rkey][kind] ?? 0) + 1;
          // 판정 허용오차 감도(#13) — 세 칸이 전부 이 값에 걸려 있다
          for (const vt of VERDICT_TOLS) {
            (verdictSweep[vt.toFixed(4)] ??= {});
            ((verdictSweep[vt.toFixed(4)][rkey] ??= zero()))[verdictOf(d, longest, vt)] += 1;
          }
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
        for (const grade of GRADES) for (const seed of SEEDS) for (const jit of DENSITY_JITTERS) {
          const fx = fixture(ci, grade, seed, jit, k);
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
          run(fx, (rkey, d, kind, longest) => {
            const v = verdictOf(d, longest, VERDICT_REF);
            densTally[dk][rkey][v] += 1;
            if (v === "wrong") {
              densWrongKind[dk][rkey][kind] = (densWrongKind[dk][rkey][kind] ?? 0) + 1;
            }
          }, (aim) => { (aimByDensity[dk] ??= []).push(aim); });

          // ---- **의도하지 않은 붙음**(리뷰어 [2]). 반경을 키우는 **측정 가능한 비용**이다.
          // 사용자가 기존 기하와 무관한 자리에서 시작하려 할 때 스냅이 끼어드는 비율.
          // 이것이 없으면 "반경은 클수록 좋다"가 나오고, 실제로 그렇게 나왔다.
          {
            const ctxU: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                                    ground: null, from: null };
            const preU = staticCandidates(fx.segs);
            const r = rng32(seed * 104729 + k * 7 + ci);
            for (let t = 0; t < 24; t++) {
              const q: Pt2 = [r() * SZ[0], r() * SZ[1]];
              const cs = snapCandidates(q, fx.segs, ctxU, { radius_ratio: RMAX }, preU);
              for (const rr of RADII) {
                const rk = rr.toFixed(3);
                const cell = ((unintended[dk] ??= {})[rk] ??= { snapped: 0, n: 0 });
                cell.n += 1;
                if (pickAtRadius(cs, rr * DIAG)) cell.snapped += 1;
              }
            }
          }
        }
      }
      densInfo[dk] = { strokes, nearest_corner_px: stat(nearest, 1).median };
    }

    // ---- **스냅된 시작점에서의 배치 정확도**(계획서 §11 L-B 게이트 2 · 리뷰어 [1]).
    // 사전 등록의 "대조군: 스냅 끔"이 여기 온다 — **스냅이 없으면 시작점이 3D에 없으므로
    // 이 경로는 아무것도 놓지 않는다**(설계상 0/N이다. 측정이 아니라 사실이므로 그렇게 적는다).
    // 재는 것은 **스냅이 놓은 것 중 얼마가 조용히 틀리는가**이고 그것이 #16이 요구한 값이다.
    for (const rr of [0.025, 0.05, 0.10]) {
      const rk = rr.toFixed(3);
      place[rk] = { n: 0, placed: 0, noSnap: 0, noAxis: 0, noEnd: 0,
                    err: [], w10: 0, w20: 0, w50: 0 };
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
          const fx = fixture(ci, grade, seed, jit);
          if (!fx) continue;
          const sc = fx.sc;
          const ctxP: SnapCtx = { principal: sc.principal, f: sc.f, imgSize: SZ,
                                  ground: null, from: null };
          const dirs = [0, 1, 2].map(i => {
            const v = sc.vps[i as 0 | 1 | 2];
            return isFiniteVp(v, SZ) ? unit3(axisDirection(v, sc.principal, sc.f)) : null;
          });
          const structDiag = Math.max(...fx.segs.flatMap(a =>
            fx.segs.map(b => Math.max(norm3(sub3(a.a, b.a)), norm3(sub3(a.b, b.b))))));
          const preAll = staticCandidates(fx.segs);
          const cell = place[rk];
          for (let k = 0; k < fx.starts.length; k++) {
            cell.n += 1;
            const self = `s${k}`;
            const targets = fx.segs.filter((_, i) => i !== k);
            const pre = preAll.filter((c: StaticCand) => c.ofId !== self && c.ofId2 !== self);
            const start = fx.starts[k].pt;
            const cand = snapCandidates(start, targets, ctxP, { radius_ratio: rr }, pre)[0];
            if (!cand) { cell.noSnap += 1; continue; }
            // 앱과 **같은 경로**: 시작점을 대상의 상으로 옮기고 축을 판정한 뒤 끝점을 정한다
            const endPt = fx.endPts[k];
            const near = nearestAxisOnScreen(cand.at, dirs, cand.screen, endPt,
                                             { principal: sc.principal, f: sc.f });
            if (!near || near.deg > LIVE_TOL.axis_deg) { cell.noAxis += 1; continue; }
            const seg = segmentFromAnchor(cand.at, dirs[near.axis], endPt,
                                          { principal: sc.principal, f: sc.f });
            if (!seg) { cell.noEnd += 1; continue; }
            cell.placed += 1;
            const T = fx.segs[k];
            const e = Math.max(norm3(sub3(seg[0], T.a)), norm3(sub3(seg[1], T.b))) / structDiag;
            cell.err.push(e);
            if (e > 0.1) cell.w10 += 1;
            if (e > 0.2) cell.w20 += 1;
            if (e > 0.5) cell.w50 += 1;
          }
        }
      }
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
      // **절단을 하나 쓰지 않는다**(#13, 리뷰어 [3]) — 0.5% / 1% / 2%를 다 낸다
      const satAt = (cut: number): number | null => {
        for (let i = 0; i < RADII.length; i++) {
          const x = t[RADII[i].toFixed(3)];
          const n = x.correct + x.wrong + x.miss;
          if (x.miss > cut * n) continue;
          const nx = i + 1 < RADII.length ? t[RADII[i + 1].toFixed(3)] : null;
          if (!nx || nx.correct - x.correct <= cut * n) return RADII[i];
        }
        return null;
      };
      return { rule_a_max_net: bestNet, rule_b_wrong_le_10pct: ratioPick,
               rule_c_saturation: satAt(0.01),
               rule_c_by_cut: Object.fromEntries(RULE_C_CUTS.map(c2 => [c2.toString(), satAt(c2)])) };
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
        radius_px_in_app_canvas: "⚠ **앱 캔버스는 1280×675**(단일 뷰포트, `stage_browser.json`)라 "
          + `대각이 ${round(Math.hypot(1280, 675), 1)}px이고 같은 비율이 `
          + `${round(SNAP_TOL.radius_ratio * Math.hypot(1280, 675), 1)}px가 된다. `
          + "이 하네스의 960×672(대각 1171.8)에서는 "
          + `${round(SNAP_TOL.radius_ratio * DIAG, 1)}px다. 선례(10~15px)와 비교할 때 어느 쪽인지 밝힌다.`,
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
        grade_is_not_the_axis: "⚠ **이 잉크 모델에서는 등급이 이 양을 거의 안 바꾼다.** "
          + "활이 양끝에서 정확히 0이므로 `lf_bow`가 시작점에 안 닿고, 끝점에 닿는 유일한 성분인 "
          + `\`hf_sigma\`는 등급 간 ${round(INK_GRADES.precise.hf_sigma, 4)} / `
          + `${round(INK_GRADES.medium.hf_sigma, 4)} / ${round(INK_GRADES.coarse.hf_sigma, 4)}로 `
          + "**8%밖에 안 다르다**(리뷰어 [6]). 즉 관측된 불변은 스냅의 성질이 아니라 "
          + "**등급 축이 끝점을 거의 안 건드리게 만들어진 모델의 성질**이다(#2·#3). "
          + "**실획을 주장하지 않는다**(AS-C10은 이 모델이 양방향으로 틀렸다고 적었다). "
          + "이 모델 안에서만 '`coarse` 배치 붕괴를 시작점 겨냥에서 찾으면 안 된다'가 따라온다 "
          + "— 그 확인은 `lift_grade.json`이 따로 한다.",
        significant_digits: "**유효 자릿수 2**(AS-C9). 7.6 / 7.6 / 8.0px으로 읽는다 — "
          + "세 자리는 시드 변동폭 안이다.",
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
        rule_c_definition: "미스가 절단 이하이면서 다음 칸의 맞음 증가가 절단 이하인 **가장 작은 "
          + "반경**. '더 키워도 얻는 것이 없다'는 지점이다. **절단을 하나 쓰지 않는다** — "
          + `${RULE_C_CUTS.join(" / ")}을 다 낸다(#13).`,
        chosen: `**${SNAP_TOL.radius_ratio}** (이 하네스 960×672에서 `
          + `${round(SNAP_TOL.radius_ratio * DIAG, 1)}px · 앱 1280×675에서 `
          + `${round(SNAP_TOL.radius_ratio * Math.hypot(1280, 675), 1)}px).`,
        chosen_why: "⚠ **초판은 '성긴 쪽에서 고르면 촘촘해질 때 못 쓴다'를 근거로 적었는데 "
          + "표가 그 반대를 말했다**(리뷰어 [2]): `by_density`의 세 밀도 전부에서 0.10이 "
          + "맞음↑·틀림↓·미스↓다. **이 픽스처에서 반경을 키우는 비용이 없었기 때문**이고, "
          + "그래서 비용을 **측정에 넣었다** — `unintended_snap`(기존 기하와 무관한 자리에서 "
          + "시작하려 할 때 스냅이 끼어드는 비율). 그 표로 다시 읽으면 k3에서 "
          + "0.025 → 0.05는 맞음 2764 → 2963(+199)에 끼어듦 1440 → 1854(+414)이고, "
          + "0.05 → 0.10은 맞음 2963 → 2990(**+27**)에 끼어듦 1854 → 2772(**+918**)다. "
          + "**0.10은 얻는 것이 거의 없고 잃는 것이 크다.** 0.05는 규칙 C가 절단 0.5%·1%에서 "
          + "k3에 대해 고르는 값과도 같다(절단 2%면 0.035다 — 그 사실도 적는다).",
      },
      by_radius_all: Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(byRadius[r.toFixed(3)])])),
      net_excluding_nailed_endpoints:
        Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(noNail[r.toFixed(3)])])),
      by_density: {
        note: "**대상 밀도를 올린다**(`boxLattice`). `k1`은 상자 12모서리, `k2`는 54, `k3`은 144다. "
          + `등급 ${GRADES.length} · 시드 ${SEEDS.length} · 잡음 {${DENSITY_JITTERS.join(",")}} · 5구도 — `
          + "**등록 조건 그대로다**. 초판은 등급 1 · 시드 2였고 **앱 상수가 그 축소된 표에서 "
          + "나왔다**(#12·#14). **반경 선택이 밀도에 얼마나 딸려 움직이는지가 이 표의 전부다.**",
        fixtures: densInfo,
        aim_error_px_by_density: Object.fromEntries(
          Object.entries(aimByDensity).map(([kk, v]) => [kk, stat(v, 2)])),
        aim_error_by_density_note: "⚠ **k1의 겨냥 오차를 k3의 간격과 나란히 놓지 않는다**(#27, "
          + "리뷰어 [5]). 격자 내부선은 길이가 `1/k`이고 잡음이 길이에 비례하므로 겨냥 오차도 "
          + "함께 줄어든다 — 비를 말하려면 **같은 밀도의 두 값**을 써야 한다.",
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
          + "모서리 접합을 겨냥한 획이므로. **본문은 `rows_end_jitter_gt_0`를 쓴다** — "
          + "`rows_all`에는 못으로 박힌 `end_jitter = 0`의 1080셀이 섞여 있다(리뷰어 [10]).",
        rows_all: kindCount,
        rows_end_jitter_gt_0: kindCountLive,
      },
      verdict_tolerance_sweep: {
        note: "**판정 허용오차가 세 칸을 전부 정한다**(#13, 리뷰어 [12a]). 본문은 "
          + `1/${Math.round(1 / VERDICT_REF)}을 쓰는데 그 값은 **사전 등록에 없었다** — 그래서 스윕한다.`,
        reference: VERDICT_REF,
        rows: Object.fromEntries(Object.entries(verdictSweep).map(([vt, byR]) =>
          [vt, Object.fromEntries(RADII.map(r => [r.toFixed(3), frac(byR[r.toFixed(3)])]))])),
      },
      unintended_snap: {
        note: "**반경을 키우는 유일한 측정 가능한 비용**(리뷰어 [2]). 기존 기하와 무관한 자리에서 "
          + "시작하려 할 때 스냅이 끼어드는 비율이다. 질의는 캔버스 균등 난수 24점/픽스처"
          + "(`rng32`, 결정론적). 이것이 없으면 '반경은 클수록 좋다'가 나오고 실제로 그렇게 나왔다.",
        rows: Object.fromEntries(Object.entries(unintended).map(([dk, byR]) =>
          [dk, Object.fromEntries(RADII.map(r => {
            const c2 = byR[r.toFixed(3)];
            return [r.toFixed(3), `${c2.snapped}/${c2.n}`];
          }))])),
      },
      placement_from_snapped_start: {
        note: "**계획서 §11 L-B 게이트의 두 번째 항목**(스냅된 시작점에서의 배치 정확도). "
          + "앱과 같은 경로다 — 시작점을 대상의 상으로 옮기고 `nearestAxisOnScreen`으로 축을 "
          + "정한 뒤 `segmentFromAnchor`로 끝점을 낸다.",
        control_snap_off: "**스냅이 없으면 이 경로는 0을 놓는다** — 시작점이 3D에 없으므로 "
          + "앵커가 없다. 이것은 측정이 아니라 **설계상의 사실**이라 팔로 돌리지 않고 여기 적는다"
          + "(사전 등록의 '대조군: 스냅 끔'이 이것이다).",
        axis_tol_deg: LIVE_TOL.axis_deg,
        rows: Object.fromEntries(Object.entries(place).map(([rk, v]) => [rk, {
          placed_over_all: `${v.placed}/${v.n}`,
          no_snap: v.noSnap, no_axis: v.noAxis, no_end: v.noEnd,
          sum_check: v.placed + v.noSnap + v.noAxis + v.noEnd === v.n,
          shape_err: stat(v.err),
          // **분모는 놓인 것**이다(#11). 절단을 하나 고르지 않는다(#13)
          silent_wrong: { cut_0_1: `${v.w10}/${v.placed}`, cut_0_2: `${v.w20}/${v.placed}`,
                          cut_0_5: `${v.w50}/${v.placed}` },
        }])),
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
