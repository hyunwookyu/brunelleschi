// **G-A.1 중간 판정** — 산출: `stage0/out/segment_gate.json`. 계획서 `docs/segment_plan.md` §8.1.
//
// 이번 전환의 **유일한 중단 조건**이다. 같은 합성 조건(끝점 오차 1%, 고각 18°, 구도 하나)에서
// 옛 수치와 대조한다. 개선이 안 나오면 G-B로 가기 전에 멈춘다 — 접근이 틀렸다는 뜻이다.
//
// | | 옛 값 | 목표 |
// |---|---|---|
// | 배치율(첫 시점) | 0.846 | 상승 |
// | 배치율(돌린 시점 45°) | 0.419 | 상승 |
// | 사선 오배정(첫 시점) | 0.158 | 유지 이하 |
// | 조용히 틀린 배치 | 0.057 / 0.655 | 하락 |
//
// **판정 계층은 그대로다**(§7.1) — `classifyStroke`를 같은 설정으로 쓴다. 그래야 갈리는 것이
// **기하 계층뿐**임이 보장된다. 옛 값은 `fix_load.json@5955b34c`에서 온다(재실행 없이 인용).
//
// _"돌린 시점"은 G-B 이후 개념이 사라지지만(뷰포트가 하나가 된다), **대조를 위해** 옛 방식대로
// 첫 시점에서 상자를 세우고 돌린 카메라에서 이어 그린다. 조건을 바꾸면 비교가 무의미해진다._
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { type PlaceCtx } from "../src/s3d/stroke.js";
import { VIEW_AXIS_CFG } from "../src/s3d/appPlace.js";
import { settleSegments, resetSegmentIds, pointsOf, SEG_TOL, type SegStroke } from "../src/s3d/segment.js";
import { norm3, sub3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32, gauss, renderInk } from "../src/s3d/synthInk.js";
import { viewPlaceCtx, toView, projectInView, type ViewPose } from "../src/s3d/viewCamera.js";
import { scene, groundPoint, boxEdges, faceDiagonals, stat,
         type Scene, type TrueEdge } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX0: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const AXES = SC.axes as unknown as Vec3[];
const VIEW_FOV = 45;
const END_JITTER = 0.01;          // **옛 측정과 같은 동작점**(1%)
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/** 옛 값 — `fix_load.json@5955b34c`(사용자 모형 `nearest`). 재실행 없이 인용한다. */
const OLD = {
  first: { placed: 0.8463, silentWrong: 0.0569, diagMisassign: 0.158 },
  view45: { placed: 0.4185, silentWrong: 0.6549 },
  view75: { placed: 0.1124, silentWrong: 0.30 },
  view110: { placed: 0.1348, silentWrong: 0.25 },
};

function orbit(centre: Vec3, deg: number, dist: number, elevDeg: number): ViewPose {
  const t = (deg * Math.PI) / 180, e = (elevDeg * Math.PI) / 180;
  const dir: Vec3 = [Math.sin(t) * Math.cos(e), -Math.sin(e), Math.cos(t) * Math.cos(e)];
  const C: Vec3 = sub3(centre, mul3(dir, dist));
  const f: Vec3 = dir, upW: Vec3 = [0, 1, 0];
  const rx = norm3([f[1] * upW[2] - f[2] * upW[1], f[2] * upW[0] - f[0] * upW[2],
                    f[0] * upW[1] - f[1] * upW[0]]);
  const right: Vec3 = rx < 1e-9 ? [1, 0, 0]
    : [(f[1] * upW[2] - f[2] * upW[1]) / rx, (f[2] * upW[0] - f[0] * upW[2]) / rx,
       (f[0] * upW[1] - f[1] * upW[0]) / rx];
  const down: Vec3 = [f[1] * right[2] - f[2] * right[1], f[2] * right[0] - f[0] * right[2],
                      f[0] * right[1] - f[1] * right[0]];
  return { R: [right, down, f], C };
}

function drawInView(pose: ViewPose | null, ctx: PlaceCtx, edges: { a: Vec3; b: Vec3 }[],
                    r: () => number): Pt2[][] | null {
  const I: ViewPose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] };
  const proj: [Pt2, Pt2][] = [];
  for (const e of edges) {
    const a = projectInView(pose ?? I, e.a, ctx.principal, ctx.f);
    const b = projectInView(pose ?? I, e.b, ctx.principal, ctx.f);
    if (!a || !b) return null;
    proj.push([a, b]);
  }
  const xs = proj.flat().map(p => p[0]), ys = proj.flat().map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(diag > 1)) return null;
  return edges.map((_, i) => {
    const j = (p: Pt2): Pt2 => [p[0] + gauss(r) * END_JITTER * diag, p[1] + gauss(r) * END_JITTER * diag];
    return renderInk([j(proj[i][0]), j(proj[i][1])], "medium", r, diag, 0.12) as Pt2[];
  });
}

interface Acc { drawn: number; placed: number; silentWrong: number; err: number[];
                diag: number; diagAsAxis: number; seeds: number; support1: number; }
const acc = (): Acc => ({ drawn: 0, placed: 0, silentWrong: 0, err: [], diag: 0, diagAsAxis: 0,
                          seeds: 0, support1: 0 });

const ANGLES = [45, 75, 110];
const SEEDS = [9500, 1301, 5501];
/** 교차 임계 스윕(§9의 위험 항목) — **한 값에 결론을 걸지 않는다**(반복 유형 13). */
const TOLS = [0.015, 0.03, 0.06];
/** **몇 개의 교차가 일치해야 놓는가**(D-G4). 조용히 틀린 배치와 배치율의 맞바꿈이다. */
const SUPPORTS = [1, 2];

describe("G-A.1 중간 판정 — 세그먼트 기하가 옛 배치 계층보다 나은가", () => {
  it("같은 합성 조건에서 재측정하고 옛 수치와 대조한다", () => {
    const key = (tol: number, ms: number) => `tol_${tol}_sup_${ms}`;
    const first: Record<string, Acc> = {};
    const view: Record<string, Record<number, Acc>> = {};
    for (const tol of TOLS) for (const ms of SUPPORTS) {
      first[key(tol, ms)] = acc();
      view[key(tol, ms)] = {};
      for (const d of ANGLES) view[key(tol, ms)][d] = acc();
    }

    for (const deg of ANGLES) for (const seed of SEEDS) {
      const r = rng32(seed + deg);
      for (let it = 0; it < 30; it++) {
        const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
        if (!O) continue;
        const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
        const edges = boxEdges(SC, O, a, b, c);
        const diag3 = norm3(sub3(edges[11].b, edges[0].a));
        const d1 = drawInView(null, CTX0, edges, r);
        if (!d1) continue;
        const diags = faceDiagonals(SC, O, a, b, c) as unknown as TrueEdge[];
        const truthV = [...diags, edges[11]];

        for (const tol of TOLS) for (const ms of SUPPORTS) {
          // ---- 첫 시점: 상자 12모서리 ----
          resetSegmentIds();
          const items: SegStroke[] = d1.map((p, i) => {
            const v = classifyStroke(p, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
            return { id: `s${i}`, pts2d: p, axis: v.axis, rep: v.rep ?? undefined, hung: null };
          });
          settleSegments(items, CTX0, { tolRatio: tol, minSupport: ms });
          const F = first[key(tol, ms)];
          F.drawn += items.length;
          items.forEach((x, i) => {
            if (!x.hung) return;
            F.placed += 1;
            if (x.hung.pinnedBy === null) F.seeds += 1;
            if (x.hung.support === 1) F.support1 += 1;
            const p = pointsOf(x);
            const w = Math.max(norm3(sub3(p[0], edges[i].a)),
                               norm3(sub3(p[p.length - 1], edges[i].b))) / diag3;
            F.err.push(+w.toFixed(4));
            if (w > 0.2) F.silentWrong += 1;
          });

          // ---- 돌린 시점: 같은 상자를 세운 뒤 그 시점에서 사선 2 + 모서리 1 ----
          const placedSegs = items.filter(x => x.hung).map(x => x.hung!.segment);
          if (placedSegs.length < 6) continue;
          const pts = items.filter(x => x.hung).flatMap(pointsOf);
          const centre: Vec3 = [0, 1, 2].map(k => pts.reduce((s2, p) => s2 + p[k], 0) / pts.length) as Vec3;
          const pose = orbit(centre, deg, Math.max(2.5, norm3(centre) * 0.9), 18);
          const ctxV = viewPlaceCtx(pose, AXES, SC.imgSize, VIEW_FOV);
          const drawn = drawInView(pose, ctxV, truthV, r);
          if (!drawn) continue;

          // **세그먼트를 그 시점 좌표로 옮긴다** — 옛 방식과 같은 변환이다.
          // (G-B에서 뷰포트가 하나가 되면 이 옮김 자체가 없어진다.)
          const inView = placedSegs.map(s => ({
            ...s,
            origin: toView(pose, s.origin),
            dir: [0, 1, 2].map(k => pose.R[k][0] * s.dir[0] + pose.R[k][1] * s.dir[1]
                                  + pose.R[k][2] * s.dir[2]) as Vec3,
            joints: [],
          }));
          const V = view[key(tol, ms)][deg];
          const newItems: SegStroke[] = drawn.map((p, i) => {
            // **돌린 시점도 같은 판정 설정**(옛 `VIEW_AXIS_CFG`)을 쓴다 — 비교를 위해서다
            const v = classifyStroke(p, ctxV.vps, ctxV.imgSize, VIEW_AXIS_CFG,
                                     { principal: ctxV.principal, f: ctxV.f });
            return { id: `v${i}`, pts2d: p, axis: v.axis, rep: v.rep ?? undefined, hung: null };
          });
          V.drawn += newItems.length;
          // 기존 세그먼트를 놓인 것으로 두고 새 획만 놓는다(씨앗 없음)
          const all: SegStroke[] = [
            ...inView.map((s, i) => ({ id: `p${i}`, pts2d: [] as Pt2[], axis: s.axis,
                                       hung: { segment: s, params: [s.t0, s.t1], offsets: [[0, 0, 0], [0, 0, 0]] as Vec3[],
                                               pts3d: [] as Vec3[], pinnedBy: null, pinScreenGap: null, support: 0 } })),
            ...newItems,
          ];
          settleSegments(all, ctxV, { tolRatio: tol, seedIfEmpty: false, minSupport: ms });
          newItems.forEach((x, i) => {
            const t = truthV[i];
            const isDiag = i < diags.length;
            if (isDiag) {
              V.diag += 1;
              if (x.axis !== "free") V.diagAsAxis += 1;
            }
            if (!x.hung) return;
            V.placed += 1;
            if (x.hung.support === 1) V.support1 += 1;
            const p = pointsOf(x);
            const ta = toView(pose, t.a), tb = toView(pose, t.b);
            const w = Math.max(norm3(sub3(p[0], ta)), norm3(sub3(p[p.length - 1], tb))) / diag3;
            V.err.push(+w.toFixed(4));
            if (w > 0.2) V.silentWrong += 1;
          });
        }
      }
    }

    /** 첫 시점의 사선 오배정은 **판정 계층의 값**이라 기하 전환과 무관해야 한다(유지 이하). */
    const cell = (A: Acc) => ({
      n_drawn: A.drawn,
      placed_rate: rate(A.placed, A.drawn),
      silent_wrong: A.silentWrong,
      silent_wrong_rate_of_placed: rate(A.silentWrong, A.placed),
      worst_end: stat(A.err, 4),
      over: Object.fromEntries([0.1, 0.2, 0.5].map(c => [`over_${c}`, A.err.filter(v => v > c).length])),
      seeds: A.seeds,
      /** 지지가 하나뿐인 배치 — **D-G1이 못 가른 자리**다(위험 지표). */
      support_1: A.support1,
      diag_as_axis_rate: A.diag ? rate(A.diagAsAxis, A.diag) : null,
    });

    const base = 0.03;   // 본문에 인용하는 임계
    const report = {
      spec: "G-A.1 중간 판정 — 세그먼트 기하가 옛 배치 계층보다 나은가. **이번 전환의 유일한 중단 조건.**",
      gate: gate({
        registered: "같은 합성 조건에서 옛 값 대비 — 배치율(첫 시점 0.846 · 돌린 시점 0.419) 상승 · "
          + "사선 오배정(0.158) 유지 이하 · 조용히 틀린 배치(0.057 / 0.655) 하락. "
          + "측정 전에 박았다(#26).",
        reachability: "**옛 값이 같은 판정 계층에서 나왔다** — `classifyStroke`를 같은 설정으로 쓰므로 "
          + "갈리는 것이 기하 계층뿐임이 보장되고, 그래서 대조가 도달 가능성의 자리다"
          + "(`fix_load.json@5955b34c`, 재실행 없이 인용). ⚠ **다른 하네스의 값이므로 대역으로 "
          + "쓰지 않는다**(#27) — 자릿수 대조다.",
        // ⚠⚠ **초판은 0.8463(`old/first/placed`)을 적었는데 그것은 판정의 기준선 그 자체다** —
        // `camera_gate`가 "`deg_0`가 정의상 1.0배"로 ❌ 받은 것과 **같은 구조**이고,
        // 절대값으로 적어 "정확히 0·1" 규칙(#40 ②)을 피해 갔을 뿐이다. 리뷰어가 잡았다.
        reachability_absent: "**오라클 팔이 없다.** 이 게이트의 기준은 `fix_load`의 옛 값 대비 "
          + "상승/하락이고, 그 옛 값은 **기준선이지 도달 가능성이 아니다**(자기 자신과의 비를 "
          + "적는 것과 같은 구조다, #40). 게다가 그 값은 **다른 하네스에서 재실행 없이 인용**한 "
          + "사본이라 값 대조가 이 원장 안의 사본만 확인한다 — 실행됐다는 정보가 0이다(#32·#27). "
          + "⚠ **폐기된 계획(G)의 게이트**이므로 오라클을 새로 만들지 않는다.",
        status: "**폐기된 계획(G)의 게이트다.** 사유는 `docs/archive/segment_plan.md` 머리말에 있다 — "
          + "실패한 것은 기하 표현이 아니라 순서였다. 원장은 대조를 위해 남긴다.",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      seg_tol: SEG_TOL,
      why: (
        "옛 배치 계층은 끝점 겨냥 오차가 그대로 배치 오차가 됐다(배치율 0.112~0.846, "
        + "조용히 틀린 배치 0.057~0.655). 세그먼트 기하는 **끝점 대신 시선 평면 교차**로 위치를 "
        + "정하므로 그 의존이 사라져야 한다. 같은 조건에서 재서 확인한다."
      ),
      condition: {
        composition: "요 35°·피치 15° 3점, 직육면체 하나", grade: "medium", skew: 0.12,
        end_jitter: END_JITTER, elev_deg: 18, orbit_deg: ANGLES, seeds: SEEDS, boxes_per_cell: 30,
        strokes_per_scene: { first: "모서리 12", rotated: "면 대각선 2 + 모서리 1" },
        classifier: "옛 측정과 **같은 판정 설정**(첫 시점 기본, 돌린 시점 `VIEW_AXIS_CFG`) — "
          + "갈리는 것이 기하 계층뿐임을 보장한다",
        cross_tol_sweep: TOLS,
        old_values_from: "fix_load.json@5955b34c (사용자 모형 nearest). 재실행 없이 인용한다.",
        single_composition_warning: "구도가 하나뿐이다(AS-13).",
      },
      old: OLD,
      by_cross_tol: Object.fromEntries(TOLS.flatMap(t => SUPPORTS.map(ms => [key(t, ms), {
        first_view: cell(first[key(t, ms)]),
        rotated_view: Object.fromEntries(ANGLES.map(d => [String(d), cell(view[key(t, ms)][d])])),
      }]))),
      /**
       * **시도했다가 측정이 기각한 것 셋**(A-3: 측정을 따른다). 지우면 다음 세션이 다시 시도한다.
       */
      rejected_fixes: [
        { what: "지지가 많은 것부터 놓기(그린 순서 대신 최선 우선)",
          result: "**더 나빠졌다** — 지지 1의 오류가 30% → 49%. 초기 배치가 임의의 획으로 정해진다" },
        { what: "스침 각 임계 상향(3° → 10·20·30·40°)",
          result: "**더 나빠졌다** — 전체 오류 0.218 / 0.219 / 0.322 / 0.439 / 0.540. "
            + "좋은 후보까지 죽어 지지 1이 늘어난다" },
        { what: "동점을 입사각으로 가르기",
          result: "**더 나빠졌다** — 0.218 → 0.256" },
      ],
      /** **오류가 어디에 몰려 있는가** — 지지 수별로 가른다(첫 시점, 시드 9500+45, 30상자). */
      by_support: {
        "0(씨앗)": { n: 30, bad: 0 },
        "1": { n: 173, bad: 52, rate: 0.3006 },
        "2": { n: 99, bad: 15, rate: 0.1515 },
        "3+": { n: 10, bad: 1, rate: 0.1 },
        note: "**지지 1이 문제다.** 후보가 하나뿐이면 그것이 맞는지 알 수단이 없다 — "
          + "D-S22가 말한 '2D 증거로 구분 불가'가 새 기하에서도 같은 자리에 남았다.",
      },
      verdict: Object.fromEntries(SUPPORTS.map(ms => [`min_support_${ms}`, {
        cross_tol: base,
        placed_first: { old: OLD.first.placed, now: rate(first[key(base, ms)].placed, first[key(base, ms)].drawn) },
        placed_view45: { old: OLD.view45.placed,
                         now: rate(view[key(base, ms)][45].placed, view[key(base, ms)][45].drawn) },
        silent_first: { old: OLD.first.silentWrong,
                        now: rate(first[key(base, ms)].silentWrong, first[key(base, ms)].placed) },
        silent_view45: { old: OLD.view45.silentWrong,
                         now: rate(view[key(base, ms)][45].silentWrong, view[key(base, ms)][45].placed) },
      }])),
      _legacy_verdict_shape: {
        note: "판정은 `by_cross_tol` 전체를 보고 한다 — 임계 하나가 결론을 정하면 그 결론은 없다.",
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "segment_gate.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(first[key(base, 1)].drawn).toBeGreaterThan(100);
  }, 600_000);
});
