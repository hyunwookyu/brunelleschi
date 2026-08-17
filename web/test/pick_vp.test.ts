// **점 찍기 확정(pickVpAt)의 축 오차** — 산출: `stage0/out/pick_vp.json`.
//
// 2026-08-17 5차 이월-3: `horizon_pitch.json`의 조작 변수(지평선 높이)가 D-L59로 죽었고
// (지평선이 소실점 확정에 안 쓰인다 — 결과다), **찍기 경로(4차 지시 4-b, `pickVpAt`)의
// 정확도를 재는 팔이 원장에 없었다**(HANDOFF ⚠⚠ 2). 이 하네스가 그 재목적이다 —
// horizon_pitch는 역사 기록으로 남고(그 원장의 은퇴 표시 참조), 여기가 잇는다.
//
// **재는 것**: 사용자가 작도 보조선(소실점 쪽으로 길게 그은 대각선) 위의 한 점을 톡 찍어
// 첫 소실점을 확정할 때, **찍은 자리의 오차가 축 오차로 얼마나 번지는가.** 종이 위 투시
// 작도의 첫 동작(소실점을 정하고 시작하는 것)이 이 경로다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   #5   찍은 자리 = 소실점은 **보장**이다. 재는 것은 그 보장이 아니라 **찍기 오차 → 축 오차**의
//        전달 함수다(오차 0 팔은 오라클이고 그렇게 적는다)
//   #8   p90·max를 함께 낸다
//   #9   pick 실패(호스트 선이 15px 밖) 실행이 섞인다 — **picked 층을 갈라 센다**
//   #11  분모: pick 실패 실행도 runs에 센다(실패해도 이어 그리면 교점 경로가 살 수 있다)
//   #12  동작점 하나를 고르지 않는다 — 찍기 오차 {0, ±10, ±30, ±60, ±120}px 스윕
//   #14  시드 여섯 · 분자/분모
//   #26  게이트를 측정 전에 등록한다(아래 REGISTERED)
//   #27  비교 팔(two_lines)을 **같은 픽스처에서 같이** 돌린다
//   #35  오차 0 팔은 **오라클**이다 — 사람이 그만큼 정확히 찍는지는 표본 0(AS-L9 자리)
//   #38  pick 성공/실패 수를 낸다 — 0이면 그 팔은 공허하다
//   #39  "맞은 자리" 대 "틀린 자리"는 ± 스윕이 가른다(같은 크기 반대 방향이 위약의 자리다)
//   #40  도달 가능성: 사람 찍기 정확도 표본 0 → reachability_absent에 명시
//   #41  이 게이트는 이 항목이 등록한 것이고 CLAUDE.md §2의 중단 조건이 아니다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { P1_F_RATIO } from "../src/ui/camState.js";
import { representative } from "../src/s3d/axis.js";
import {
  newRuleState, stepRule, pickVpAt, vpsOf, type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { rng32, gauss, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge } from "./scene3d.js";
import { axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `rule_camera.test.ts`와 같은 다섯 구도(하네스마다 자기 목록을 두는 관례). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0, 0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const LIVE_JITTERS = JITTERS.filter(j => j > 0);
/** **찍기 오차 축**(px, 참 소실점 자리에서 참 방향을 따라 ±). #12 — 동작점 하나를 안 고른다. */
const ERR_PX = [10, 30, 60, 120];

/**
 * **사전 등록**(#26). 이 항목이 등록한 게이트이고 **중단 조건이 아니다**(#41).
 */
const REGISTERED =
  "① 찍기 오차 0 팔(오라클, #35 — 상한이라 부르지 않는다)의 축 방향 오차 중앙이 **같은 픽스처의 "
  + "two_lines 팔(교점 경로, D-L59)보다 작거나 같다** — 찍기 경로가 교점 경로보다 못하지 않다. "
  + "② 찍기 성공(pick_ok)이 표제 층에서 0이 아니다(#38 — 0이면 팔이 공허하다). "
  + "③ 오차 스윕 {±10,±30,±60,±120}px를 전부 낸다(#12) — 허용 창은 tolerance_curve가 준다. "
  + "모집단: 5구도 × 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05}, 표제는 잡음 0 행을 뺀다"
  + "(#5 — 무오차 입력에서 찍기 0 팔은 정의상 참 소실점이라 항등이다). "
  + "⚠ **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 아니다(#41).";

// ---------------------------------------------------------------- 픽스처

interface Fx {
  sc: Scene; drawn: DrawnEdge[];
  /** 작도 보조선 — 소실점을 지나도록 길게 그은 대각선(잉크 오차 포함). */
  guide: RLine;
  /** 찍기 대상 축과 참 소실점. */
  pickAxis: 0 | 1; vpTrue: Pt2;
}

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  const r = rng32(seed * 7919 + ci * 131 + 7);
  const drawn = drawEdges(sc, edges, grade, r, 0.12, jit, 0);
  if (!drawn) return null;
  // 찍기 대상 축 — 유한 수평 소실점이 있는 첫 축
  const pickAxis = ([0, 1] as const).find(i => isFiniteVp(sc.vps[i], SZ));
  if (pickAxis === undefined) return null;
  const vpTrue = sc.vps[pickAxis];
  // **작도 보조선**: 그 축의 첫 모서리 시작점에서 소실점을 지나 10% 더 — 종이 위에서
  // 소실점 쪽으로 길게 긋는 가이드다. 끝점 잉크 오차는 drawEdges와 같은 규약(gauss × jit × 대각).
  const host = drawn.find(e => e.axis === pickAxis);
  if (!host) return null;
  const s0 = host.a2d;
  const b0: Pt2 = [vpTrue[0] + 0.1 * (vpTrue[0] - s0[0]), vpTrue[1] + 0.1 * (vpTrue[1] - s0[1])];
  const xs = drawn.flatMap(e => [e.a2d[0], e.b2d[0]]);
  const ys = drawn.flatMap(e => [e.a2d[1], e.b2d[1]]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const j = (p: Pt2): Pt2 =>
    jit <= 0 ? p : [p[0] + gauss(r) * jit * diag, p[1] + gauss(r) * jit * diag];
  return { sc, drawn, guide: { a: j(s0), b: j(b0) }, pickAxis, vpTrue };
}

// ---------------------------------------------------------------- 실행

interface Run { st: RuleState; asks: number; rejected: number; pickOk: boolean | null }

/** 물음-참답 정책은 `rule_camera.test.ts`와 같다(오라클 — 그 사실이 결론에 붙는다). */
function feedStrokes(st0: RuleState, fx: Fx, list: DrawnEdge[]): { st: RuleState; asks: number; rejected: number } {
  let st = st0, asks = 0, rejected = 0;
  for (const e of list) {
    const rep = representative(e.pts2d);
    if (!rep) continue;
    const line: RLine = { a: rep.a, b: rep.b };
    let r = stepRule(st, line, SZ);
    if (r.event.type === "ask") {
      asks += 1;
      const truth: "screen" | "depth" =
        // ⛔ **"vertical" 답을 지웠다**(7차 지시 3-b) — 기울어진 선은 항상 깊이선이다.
        // 유한 소실점을 가진 축이면 깊이, 화면 평행이면 화면 축이다
        isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
      r = stepRule(st, line, SZ, truth);
    }
    if (r.event.type === "rejected") { rejected += 1; continue; }
    st = r.state;
  }
  return { st, asks, rejected };
}

/**
 * 찍기 팔: 보조선을 먼저 긋고(대기), **참 소실점 자리에서 참 방향을 따라 `off`px 벗어난 점**을
 * 찍는다(`pickVpAt` — 조리개는 앱과 같은 `OSNAP_RADIUS_PX`, #17). 그 뒤 상자 모서리를 잇는다.
 * 찍기가 실패해도(호스트 선이 15px 밖) 이어 긋는다 — 앱에서도 그렇다(#11).
 */
function runPick(fx: Fx, off: number): Run {
  let st = newRuleState(SZ);
  let asks = 0, rejected = 0;
  // 보조선 — 깊이 물음이 나면 "깊이"로 답한다(작도 대각선의 의도)
  {
    let r = stepRule(st, fx.guide, SZ);
    if (r.event.type === "ask") { asks += 1; r = stepRule(st, fx.guide, SZ, "depth"); }
    if (r.event.type !== "rejected") st = r.state;
    else rejected += 1;
  }
  const dir: Pt2 = [fx.guide.b[0] - fx.guide.a[0], fx.guide.b[1] - fx.guide.a[1]];
  const L = Math.hypot(dir[0], dir[1]) || 1;
  const p: Pt2 = [fx.vpTrue[0] + (off * dir[0]) / L, fx.vpTrue[1] + (off * dir[1]) / L];
  const picked = pickVpAt(st, p, SZ, OSNAP_RADIUS_PX);
  if (picked) st = picked.state;
  const rest = feedStrokes(st, fx, [...fx.drawn].sort((a, b) => a.axis - b.axis));
  return { st: rest.st, asks: asks + rest.asks, rejected: rejected + rest.rejected,
           pickOk: !!picked };
}

/** 비교 팔 — 보조선·찍기 없이 교점 경로(D-L59) 그대로. `rule_camera`의 grouped와 같은 조건. */
function runPair(fx: Fx): Run {
  const r = feedStrokes(newRuleState(SZ), fx, [...fx.drawn].sort((a, b) => a.axis - b.axis));
  return { ...r, pickOk: null };
}

// ---------------------------------------------------------------- 집계

const q = (xs: number[], p: number): number | null => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
};
const rate = (k: number, n: number): number | null => (n ? +(k / n).toFixed(4) : null);

interface Bag {
  errs: number[];
  /** pick이 실제로 성립한 실행의 오차만(#9 — 섞인 것을 가른다). */
  errsPicked: number[];
  runs: number; ok: number; pickOkN: number; pickFail: number;
  asks: number; rejected: number;
}
const bag = (): Bag => ({ errs: [], errsPicked: [], runs: 0, ok: 0, pickOkN: 0, pickFail: 0,
                          asks: 0, rejected: 0 });

function summarize(b: Bag) {
  return {
    runs: b.runs, camera_ok: b.ok, camera_ok_rate: rate(b.ok, b.runs),
    pick_ok: b.pickOkN, pick_failed: b.pickFail,
    axes_measured: b.errs.length,
    deg_median: round(median(b.errs), 4),
    deg_p90: round(q(b.errs, 0.9), 4),
    deg_max: round(q(b.errs, 1), 4),
    axes_picked: b.errsPicked.length,
    deg_median_picked: round(median(b.errsPicked), 4),
    asks_per_run: round(b.runs ? b.asks / b.runs : null, 3),
    rejected_per_run: round(b.runs ? b.rejected / b.runs : null, 3),
  };
}

const ARM_NAMES = ["two_lines", "pick_0",
  ...ERR_PX.flatMap(e => [`pick_fwd_${e}`, `pick_back_${e}`])];

// ---------------------------------------------------------------- 측정

describe("점 찍기 확정 — 찍기 오차가 축 오차로 얼마나 번지는가 (4차 지시 4-b · 5차 이월-3)", () => {
  it("찍기 오차 스윕과 교점 경로를 같은 픽스처에서 함께 낸다", () => {
    const newArms = (): Record<string, Bag> =>
      Object.fromEntries(ARM_NAMES.map(a => [a, bag()])) as Record<string, Bag>;
    const arms = newArms();
    const byJitter: Record<string, Record<string, Bag>> = {};
    const byComp: Record<string, Record<string, Bag>> = {};
    let fixtures = 0, fixtureFailed = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) { fixtureFailed += 1; continue; }
            fixtures += 1;
            const jk = `jit_${jit}`, ck = COMPOSITIONS[ci].name;
            byJitter[jk] ??= newArms();
            byComp[ck] ??= newArms();

            const record = (arm: string, run: Run) => {
              const vps = vpsOf(run.st);
              const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
              const cam = recoverCamera(vps, SZ,
                nF === 1 ? { fSetting: P1_F_RATIO * SZ[0] } : {});
              const errs = cam.ok && cam.principalPoint && cam.f != null
                ? axisDirErrors(vps, cam.principalPoint, cam.f, fx.sc.axes) : [];
              for (const t of [arms[arm], byJitter[jk][arm], byComp[ck][arm]]) {
                t.runs += 1;
                if (cam.ok) t.ok += 1;
                t.errs.push(...errs);
                if (run.pickOk) { t.pickOkN += 1; t.errsPicked.push(...errs); }
                if (run.pickOk === false) t.pickFail += 1;
                t.asks += run.asks; t.rejected += run.rejected;
              }
            };

            record("two_lines", runPair(fx));
            record("pick_0", runPick(fx, 0));
            for (const e of ERR_PX) {
              record(`pick_fwd_${e}`, runPick(fx, e));    // 소실점 너머 쪽
              record(`pick_back_${e}`, runPick(fx, -e));  // 그림 쪽
            }
          }
        }
      }
    }

    // ---- 표제: 잡음이 걸린 행만(#5)
    const head = newArms();
    for (const j of LIVE_JITTERS) {
      for (const arm of ARM_NAMES) {
        const b = byJitter[`jit_${j}`][arm], t = head[arm];
        t.errs.push(...b.errs); t.errsPicked.push(...b.errsPicked);
        t.runs += b.runs; t.ok += b.ok; t.pickOkN += b.pickOkN; t.pickFail += b.pickFail;
        t.asks += b.asks; t.rejected += b.rejected;
      }
    }
    const headline = Object.fromEntries(Object.entries(head).map(([k, v]) => [k, summarize(v)]));

    // ---- 허용 오차 곡선 — two_lines(교점 경로)보다 나은 최대 |오차|
    const pairMed = headline.two_lines.deg_median;
    const rows = [
      { err_px: 0, arm: "pick_0", ...pickRow(headline.pick_0) },
      ...ERR_PX.flatMap(e => [
        { err_px: e, arm: `pick_fwd_${e}`, ...pickRow(headline[`pick_fwd_${e}`]) },
        { err_px: -e, arm: `pick_back_${e}`, ...pickRow(headline[`pick_back_${e}`]) },
      ]),
    ].sort((a, b) => a.err_px - b.err_px);
    const better = rows.filter(r => r.deg_median != null && pairMed != null && r.deg_median < pairMed);
    const tolerance = {
      two_lines_deg_median: pairMed,
      rows,
      best_tolerance_px: better.length ? Math.max(...better.map(r => Math.abs(r.err_px))) : null,
    };

    const pick0 = headline.pick_0.deg_median;
    const passed = pick0 != null && pairMed != null && pick0 <= pairMed
      && headline.pick_0.pick_ok > 0;

    const out = {
      what: "점 찍기 확정(pickVpAt, 4차 지시 4-b)의 축 오차 — 작도 보조선 위에서 찍은 자리의 "
        + "오차(참 소실점 기준 ±px)가 축 방향 오차로 얼마나 번지는가. 교점 경로(D-L59 two_lines)와 "
        + "같은 픽스처에서 대조. horizon_pitch.json의 재목적(5차 이월-3 — 그 원장은 역사 기록).",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, lattice_k: 1,
        error_sweep_px: ERR_PX,
        pick_tol_px: OSNAP_RADIUS_PX,
        pick_tol_note: "앱이 pickVp에 넘기는 조리개 그대로(`mainL` → OSNAP.radiusPx = "
          + "resolve2d.OSNAP_RADIUS_PX, #17). ⚠ 전역 상수 해시 밖(D-L63과 같은 자리 — 사람이 본다)",
        guide: "찍기 대상 축의 첫 모서리 시작점에서 참 소실점을 지나 10% 더 간 2D 보조선. "
          + "끝점 잉크 오차는 drawEdges와 같은 규약(gauss × jit × 그림 대각). 종이 작도에서 "
          + "소실점 쪽으로 길게 긋는 가이드가 이 자리다 — 상자 모서리(짧다) 위에는 참 소실점의 "
          + "수직 투영이 선분 밖이라 찍기가 원리적으로 안 선다(pickVpAt의 pad 0.02)",
        pick_point: "참 소실점 위치 + 보조선 방향을 따라 ±off px. 찍기의 확정점은 그 점의 "
          + "**호스트 선 위 수직 투영**이므로(pickVpAt 근처점 규약) 보조선 자체의 잉크 오차도 "
          + "결과에 섞인다 — 그것이 이 경로의 실제 오차 전달이다. 수직 성분이 15px를 넘으면 "
          + "찍기가 실패하고(pick_failed) 실행은 이어진다(#11)",
        arms: {
          two_lines: "보조선·찍기 없음 — 교점 경로(D-L59) 그대로, rule_camera의 grouped와 같은 "
            + "조건(순서 오라클 포함). **비교 기준**(#27 — 같은 픽스처)",
          pick_0: "찍기 오차 0 — **오라클**(#35). 사람이 그 자리를 그 정확도로 찍는지는 표본 0(AS-L9)",
          "pick_fwd_N / pick_back_N": "참에서 보조선 방향 ±N px — 허용 오차 곡선(#12). "
            + "같은 크기 반대 방향 짝이 위약의 자리다(#39)",
        },
        ask_policy: "물음에는 참 축으로 답했다(오라클) — 모든 팔이 같은 정책. 어느 팔도 "
          + "실사용 성능이 아니다.",
      },
      headline: {
        note: "잡음 {0.005,0.01,0.03,0.05}만(#5 — 잡음 0에서 pick_0은 정의상 참 소실점이라 항등). "
          + "5구도 혼합이다 — 구도별은 by_composition을 읽는다(§2의 5구도 규범).",
        ...headline,
      },
      by_jitter: Object.fromEntries(Object.entries(byJitter).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, summarize(b)]))])),
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, summarize(b)]))])),
      tolerance_curve: tolerance,
      what_the_zeros_mean: {
        "pick_0의 err_px 0": "구성상 0이다 — 그 팔의 정의다(#38 덮는 대상 표시).",
        "jit_0 층의 pick_0 오차 0": "항등이다(#5) — 무오차 보조선 위에서 참 자리를 찍으면 "
          + "정의상 참 소실점이다. 표제에서 뺐다.",
      },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**사람이 소실점 자리를 몇 px 안에 찍는가의 표본이 0이다**(AS-L9와 같은 자리). "
          + "pick_0 팔은 오라클이고 도달 가능성의 수치로 쓰지 않는다(#35·#40). 대리로 "
          + "tolerance_curve를 낸다 — 교점 경로보다 나은 찍기 오차의 최대 폭(best_tolerance_px)이 "
          + "사람 손이 들어가야 하는 창이다. 그 창에 사람이 드는지는 실사용 관측이어야 한다.",
        reachability_absent:
          "사람 찍기 정확도 표본 0(AS-L9). 창의 크기(tolerance_curve)만 낸다.",
        result: {
          pick_0_median: pick0,
          two_lines_median: pairMed,
          pick_ok_headline: headline.pick_0.pick_ok,
          pick_failed_headline: headline.pick_0.pick_failed,
          tolerance_px: tolerance.best_tolerance_px,
          passed,
        },
        note: "⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 "
          + "아니다(#41).",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "pick_vp.json"), JSON.stringify(out, null, 2));

    // 덮는 대상 0을 통과로 읽지 않는다(#38)
    expect(fixtures).toBeGreaterThan(0);
    expect(headline.pick_0.pick_ok).toBeGreaterThan(0);
    expect(headline.two_lines.axes_measured).toBeGreaterThan(0);
  }, 240_000);
});

/** 허용 오차 표에 넣을 것만. */
function pickRow(s: { deg_median: number | null; deg_median_picked: number | null;
                      pick_ok: number; pick_failed: number; camera_ok: number; runs: number }) {
  return { deg_median: s.deg_median, deg_median_picked: s.deg_median_picked,
           pick_ok: s.pick_ok, pick_failed: s.pick_failed,
           camera_ok: s.camera_ok, runs: s.runs };
}
