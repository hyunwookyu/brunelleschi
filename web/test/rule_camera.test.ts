// **규칙 기반 카메라의 축 오차** — 산출: `stage0/out/rule_camera.json`.
//
// 사람 지시 4: "이 방식의 축 오차를 잰다. **L-A.6과 같은 조건**. 추정이 아니라 교점이므로
// 오차의 출처가 그은 선의 정확도뿐이다. **검출 기반(4~10°)과 대조한다.**"
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   **무잡음 행은 항등이다** — 참 투영을 넣으면 두 깊이선의 교점이 **정의상 참 소실점**이고
//        오차가 0이다. 그것은 측정이 아니라 설계 보장이므로 **표제 수치에서 뺀다.**
//   #8   꼬리를 함께 낸다(중앙만 보면 못 쓰는 구도를 못 본다)
//   #11  분모가 전부인가 — **카메라가 안 서는 실행도 센다.** 선 실행만 재면 규칙이 공짜로 이긴다
//   #12  동작점을 하나 고르지 않는다 — 잡음 5수준 × 등급 2
//   #14  시드 여섯. 비율보다 분자/분모
//   #26  게이트 수치를 측정 전에 박는다(아래 `GATE`)
//   #27  **대역을 다른 하네스에서 가져오지 않는다** — 검출 팔을 **같은 픽스처에서 같이 돌린다.**
//        `camera_gate.json`의 4~10°를 인용만 하면 픽스처가 다를 수 있다
//   #35  기준을 넘을 수 있는 것이 무엇인가 — **여기서는 오라클이 항등이라 없다**(위 #5)
//   #40  도달 가능성 필드를 항등으로 채우지 않는다 → `reachability_absent`에 그 사실을 적는다
//   #41  **이 게이트는 항목이 스스로 등록한 것이고 CLAUDE.md §2의 중단 조건이 아니다.**
//        중단 조건은 `camera_gate`의 실측 축 오차 0.5°다 — 같은 말로 부르지 않는다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectVps, linesFromStrokes, assignAxes } from "../src/s3d/vpDetect.js";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { P1_F_RATIO } from "../src/ui/camState.js";
import { vpsOf } from "../src/s3d/vpRules.js";
// **스냅 팔**(5차 이월-2) — 앱이 확정 전에 쓰는 2D 판정 그 함수다(#17: mainL과 같은 출처)
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge } from "./scene3d.js";
// **규칙 먹이기는 `ruleFeed.ts` 하나다** — `rule_gate`와 같은 출처(#17·#27)
import { runRules, type RuleFx, type RuleRun, type Order } from "./ruleFeed.js";
import { axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** **L-A.6과 같은 조건** — `camera_gate.test.ts`의 표와 같은 다섯 구도다. */
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
/** 잡음이 실제로 걸린 행만 표제 수치에 쓴다(#5 — 0 행은 항등이다). */
const LIVE_JITTERS = JITTERS.filter(j => j > 0);

/**
 * **사전 등록**(#26). 이 항목이 스스로 등록한 게이트이고 **중단 조건이 아니다**(#41).
 *
 * 지표: **유한 소실점의 축 방향 오차(도) 중앙값**. 모집단: 5구도 × 6시드 × 등급 2 ×
 * 잡음 {0.005, 0.01, 0.03, 0.05} — **잡음 0 행은 뺀다**(항등이다).
 * 통과: 규칙 팔의 중앙값이 **같은 픽스처의 검출 팔보다 작다.**
 */
const REGISTERED =
  "규칙 팔의 축 방향 오차 중앙값(도)이 **같은 하네스·같은 픽스처**의 검출 팔보다 작다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05}이고 **잡음 0 행은 뺀다**"
  + "(무오차 입력에서 교점은 정의상 참 소실점이라 오차 0 — 측정이 아니라 항등이다, #5). "
  + "⚠ 이것은 **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 아니다(#41). "
  + "**[5차 이월-2 추가 등록]** 스냅 팔(`rule_*_snap`)은 같은 획을 앱의 확정 전 2D 판정"
  + "(`resolve2dCore` — 오스냅·직교·vp_dir·정렬, mainL과 같은 함수 #17)에 통과시켜 먹인다 — "
  + "이것이 **앱 동작점**이다(원시 팔은 하네스가 낡아 있던 조건의 연속 기록). 추가 판정: "
  + "`passed_snapped` = rule_grouped_snap 중앙 < detect 중앙. 원 판정(passed)은 그대로 둔다(#28 — "
  + "지표를 사유 없이 바꾸지 않는다; 바꾼 사유와 갈림은 D-L59·DEFERRED 스냅 반영 하네스 절). "
  + "**[5차 정정 — 리뷰어 [21]]** 4차 등록의 '잡음 0 행은 항등' 사유는 **틀렸다**: 잡음(endJitter) 0이어도 "
  + "등급 잉크 잡음(INK_GRADES)이 남아 jit_0의 축 오차는 0이 아니다(by_jitter.jit_0 실측 참조). "
  + "표제 모집단은 연속성으로 유지하고(#28) jit_0 층을 headline_jit0_no_identity로 따로 낸다. "
  + "**[지시 3 배선]** 이 실행의 스냅 팔은 무물음 선언(스냅 = 선언)이다 — 물음 오라클 판"
  + "(이전 동작점)의 원장은 git show d724ac0:stage0/out/rule_camera.json이다.";

// ---------------------------------------------------------------- 픽스처

type Fx = RuleFx;                                 // `ruleFeed.RuleFx`와 같은 것

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  return drawn ? { sc, drawn } : null;
}

// ---------------------------------------------------------------- 규칙 팔
//
// **`ruleFeed.ts`로 옮겼다**(8차 지시 — 중단 조건 게이트의 사정거리). 같은 먹이기를
// `rule_gate`도 쓴다: 복사본이 갈라지면 두 원장이 다른 것을 재게 된다(#17·#27).
// 옮기기는 **동작 불변**이고, 이 원장의 재실행이 그 확인이다.

// ---------------------------------------------------------------- 집계

const q = (xs: number[], p: number): number | null => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
};

/** ⚠ **분모가 0이면 `null`**(PITFALLS #36) — 없는 관측을 만들지 않는다. */
const rate = (k: number, n: number): number | null => (n ? +(k / n).toFixed(4) : null);

interface Bag {
  /** 축 방향 오차(도) — **유한 소실점만**. 무한원 축은 화면 방향이라 정의상 정확하다(#5). */
  errs: number[];
  /** 실행 수(카메라가 안 서도 센다 — #11). */
  runs: number;
  /** 카메라가 선 실행 수. */
  ok: number;
  order: number[];
  asks: number;
  rejected: number;
  seps: number[];
  /** 끝점이 움직인 획 수(#38 분자). 원시 팔은 0. */
  snapped: number;
  osnapVpdirForced: number;
  /** 2D 판정을 지난 획 수(#38 분모 — 리뷰어 [22]). */
  queried: number;
  /** 첫 짝(two_lines) 중 움직였던 선 수의 합과, two_lines가 난 실행 수(리뷰어 [22]). */
  firstPairMoved: number; firstPairRuns: number;
  /** 화면 축 슬롯 수 합(리뷰어 [23]② — 직교 스냅의 무한원 편평화 대조). */
  screenAxes: number;
}
const bag = (): Bag => ({ errs: [], runs: 0, ok: 0, order: [], asks: 0, rejected: 0, seps: [],
                          snapped: 0, queried: 0, osnapVpdirForced: 0, firstPairMoved: 0, firstPairRuns: 0,
                          screenAxes: 0 });

function summarize(b: Bag) {
  return {
    runs: b.runs,
    camera_ok: b.ok,
    // **분자/분모로 적는다**(#14) — 비율만 적으면 시드 변동폭이 안 보인다
    camera_ok_rate: rate(b.ok, b.runs),
    axes_measured: b.errs.length,
    deg_median: round(median(b.errs), 4),
    deg_p90: round(q(b.errs, 0.9), 4),
    deg_max: round(q(b.errs, 1), 4),
    order_median: round(median(b.order), 2),
    asks_per_run: round(b.runs ? b.asks / b.runs : null, 3),
    rejected_per_run: round(b.runs ? b.rejected / b.runs : null, 3),
    first_pair_sep_deg_median: round(median(b.seps), 2),
    snap_engaged: b.snapped,
    snap_queried: b.queried,
    /** 끝점 오스냅 현의 vpdir 강제 발동 수(D-L69 ② — 0이면 그 팔의 '불변'은 미발동이다 #32). */
    osnap_vpdir_forced: b.osnapVpdirForced,
    /** 첫 소실점을 만든 두 선 중 끝점이 움직였던 것(분자/분모 — 리뷰어 [22]). */
    first_pair_moved: b.firstPairMoved,
    first_pair_runs: b.firstPairRuns,
    screen_axes_total: b.screenAxes,
  };
}

// ---------------------------------------------------------------- 측정

describe("규칙 기반 카메라 — 축 방향 오차 (사람 지시 4)", () => {
  it("규칙 팔과 검출 팔을 같은 픽스처에서 함께 낸다", () => {
    const ARMS = ["rule_drawn", "rule_grouped", "rule_wide_pair",
                  "rule_drawn_snap", "rule_grouped_snap", "rule_wide_pair_snap",
                  "rule_drawn_placebo", "rule_grouped_placebo", "rule_wide_pair_placebo",
                  "rule_grouped_snap_r4", "rule_grouped_snap_r40",
                  "detect"] as const;
    const newArms = (): Record<string, Bag> =>
      Object.fromEntries(ARMS.map(a => [a, bag()])) as Record<string, Bag>;
    const arms = newArms();
    /** **짝지은 부분집합**(리뷰어 [23]①) — 표제 모집단에서 원시·스냅 둘 다 카메라가 선 픽스처. */
    const paired: Record<string, { n: number; raw: number[]; snap: number[] }> = {
      drawn: { n: 0, raw: [], snap: [] },
      grouped: { n: 0, raw: [], snap: [] },
      wide_pair: { n: 0, raw: [], snap: [] },
    };
    const camErrsOf = (vps: (Pt2 | null)[], fx: Fx): number[] | null => {
      const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
      const cam = recoverCamera(vps, SZ, nF === 1 ? { fSetting: P1_F_RATIO * SZ[0] } : {});
      if (!(cam.ok && cam.principalPoint && cam.f != null)) return null;
      return axisDirErrors(vps, cam.principalPoint, cam.f, fx.sc.axes);
    };
    const byJitter: Record<string, Record<string, Bag>> = {};
    const byComp: Record<string, Record<string, Bag>> = {};
    /** 잡음 × 구도 교차 — **항등 구도를 빼기 위해** 필요하다(아래 `headNoIdentity`). */
    const byJitterComp: Record<string, Record<string, Bag>> = {};
    let fixtures = 0, fixtureFailed = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) { fixtureFailed += 1; continue; }
            fixtures += 1;
            const jk = `jit_${jit}`;
            const ck = COMPOSITIONS[ci].name;
            byJitter[jk] ??= newArms();
            byComp[ck] ??= newArms();
            byJitterComp[`${jk}|${ck}`] ??= newArms();

            const record = (arm: string, vps: (Pt2 | null)[], extra: Partial<RuleRun> = {}) => {
              // **1점 투시의 f는 설정값이다**(이론서 5.3) — 앱과 같은 기본 렌즈를 준다.
              // 안 주면 1점 구도의 실행이 통째로 "카메라 없음"이 되어 **분모에서 사라진다**(#11).
              const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
              const cam = recoverCamera(vps, SZ,
                nF === 1 ? { fSetting: P1_F_RATIO * SZ[0] } : {});   // P1 임의 f(지시 1)
              const errs = cam.ok && cam.principalPoint && cam.f != null
                ? axisDirErrors(vps, cam.principalPoint, cam.f, fx.sc.axes) : [];
              for (const t of [arms[arm], byJitter[jk][arm], byComp[ck][arm],
                               byJitterComp[`${jk}|${ck}`][arm]]) {
                t.runs += 1;
                if (cam.ok) t.ok += 1;
                t.errs.push(...errs);
                t.order.push(vps.filter(v => v && isFiniteVp(v, SZ)).length);
                t.asks += extra.asks ?? 0;
                t.rejected += extra.rejected ?? 0;
                t.snapped += extra.snapEngaged ?? 0;
                t.osnapVpdirForced += extra.osnapVpdirForced ?? 0;
                t.queried += extra.snapQueried ?? 0;
                if (extra.firstPairMoved != null) {
                  t.firstPairMoved += extra.firstPairMoved; t.firstPairRuns += 1;
                }
                t.screenAxes += extra.screenAxes ?? 0;
                if (extra.firstSep != null) t.seps.push(extra.firstSep);
              }
            };

            const isHeadRow = jit > 0 && !COMPOSITIONS[ci].name.startsWith("1pt");
            (["drawn", "grouped", "wide_pair"] as const).forEach((ord, oi) => {
              const r = runRules(fx, ord, SZ);
              record(`rule_${ord}`, vpsOf(r.st), r);
              // **스냅 팔**(5차 이월-2) — 같은 획을 앱의 2D 판정(resolve2dCore)에 통과시켜 먹인다
              const rs = runRules(fx, ord, SZ, "snap");
              record(`rule_${ord}_snap`, vpsOf(rs.st), rs);
              // **위약 팔**(#39, 리뷰어 [20]) — 스냅이 옮겼을 크기만큼 임의 방향 이동
              const rp = runRules(fx, ord, SZ, "placebo", OSNAP_RADIUS_PX,
                                  rng32(seed * 104729 + ci * 613 + oi * 7 + 3));
              record(`rule_${ord}_placebo`, vpsOf(rp.st), rp);
              // **짝지은 부분집합**(리뷰어 [23]①) — 두 팔 다 카메라가 선 픽스처만
              if (isHeadRow) {
                const cr = camErrsOf(vpsOf(r.st), fx);
                const cs = camErrsOf(vpsOf(rs.st), fx);
                if (cr && cs) {
                  paired[ord].n += 1;
                  paired[ord].raw.push(...cr); paired[ord].snap.push(...cs);
                }
              }
            });
            // **조리개 스윕**(#12, 리뷰어 [25]) — 몰아 팔만, 4·40px
            {
              const r4 = runRules(fx, "grouped", SZ, "snap", 4);
              record("rule_grouped_snap_r4", vpsOf(r4.st), r4);
              const r40 = runRules(fx, "grouped", SZ, "snap", 40);
              record("rule_grouped_snap_r40", vpsOf(r40.st), r40);
            }
            // **검출 팔 — 같은 획, 같은 실행**(#27). 대역을 다른 하네스에서 안 가져온다
            const lines = linesFromStrokes(
              fx.drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d, axis: "free" as const })), SZ);
            const cands = detectVps(lines, SZ);
            record("detect", assignAxes(cands, lines));
          }
        }
      }
    }

    // ---- 표제 수치: **잡음이 걸린 행만**(#5 — 0 행은 항등이다)
    const live = newArms();
    for (const j of LIVE_JITTERS) {
      for (const arm of Object.keys(live)) {
        const b = byJitter[`jit_${j}`][arm];
        live[arm].errs.push(...b.errs); live[arm].runs += b.runs; live[arm].ok += b.ok;
        live[arm].order.push(...b.order); live[arm].asks += b.asks;
        live[arm].rejected += b.rejected; live[arm].seps.push(...b.seps);
        live[arm].snapped += b.snapped; live[arm].queried += b.queried;
        live[arm].osnapVpdirForced += b.osnapVpdirForced;
        live[arm].firstPairMoved += b.firstPairMoved; live[arm].firstPairRuns += b.firstPairRuns;
        live[arm].screenAxes += b.screenAxes;
      }
    }
    const head = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, summarize(v)]));

    // ---- **1점 구도의 축 오차 0은 항등이다**(#5). 실측에서 드러났다:
    // `1pt_yaw0_pitch0`의 유일한 유한 소실점은 **주점 자리**이고, 소실점 하나면
    // `recoverCamera`가 주점을 그 소실점으로 잡는다(이론서 5.3). 그러면
    // `axisDirection(vp, vp, f) = (0,0,1)`이라 **f와 무관하게 광축**이고, 그 구도의 참 깊이축이
    // 정확히 (0,0,1)이다 — 즉 **어떤 오차를 넣어도 0이 나온다.** 측정이 아니므로 갈라 낸다.
    const noIdentity: Record<string, Bag> = newArms();
    for (const j of LIVE_JITTERS) {
      for (const c of COMPOSITIONS) {
        if (c.name.startsWith("1pt")) continue;
        for (const arm of ARMS) {
          const b = byJitterComp[`jit_${j}|${c.name}`]?.[arm];
          if (!b) continue;
          const t = noIdentity[arm];
          t.errs.push(...b.errs); t.runs += b.runs; t.ok += b.ok;
          t.order.push(...b.order); t.asks += b.asks; t.rejected += b.rejected;
          t.seps.push(...b.seps); t.snapped += b.snapped; t.queried += b.queried;
          t.osnapVpdirForced += b.osnapVpdirForced;
          t.firstPairMoved += b.firstPairMoved; t.firstPairRuns += b.firstPairRuns;
          t.screenAxes += b.screenAxes;
        }
      }
    }
    const headNoIdentity = Object.fromEntries(
      Object.entries(noIdentity).map(([k, v]) => [k, summarize(v)]));

    // ---- **jit_0 층을 따로 낸다**(리뷰어 [21] — jit_0은 '무오차'가 아니다: endJitter만 0이고
    // 등급 잉크 잡음(INK_GRADES)은 남는다. 4차 등록의 '항등' 사유는 그래서 **틀렸고**, 모집단은
    // 연속성으로 유지하되(#28) 그 층의 실측을 표제 옆에 그대로 낸다).
    const jit0NoIdentity: Record<string, Bag> = newArms();
    for (const c of COMPOSITIONS) {
      if (c.name.startsWith("1pt")) continue;
      for (const arm of ARMS) {
        const b = byJitterComp[`jit_0|${c.name}`]?.[arm];
        if (!b) continue;
        const t = jit0NoIdentity[arm];
        t.errs.push(...b.errs); t.runs += b.runs; t.ok += b.ok;
        t.order.push(...b.order); t.asks += b.asks; t.rejected += b.rejected;
        t.seps.push(...b.seps); t.snapped += b.snapped; t.queried += b.queried;
          t.osnapVpdirForced += b.osnapVpdirForced;
        t.firstPairMoved += b.firstPairMoved; t.firstPairRuns += b.firstPairRuns;
        t.screenAxes += b.screenAxes;
      }
    }
    const jit0Head = Object.fromEntries(
      Object.entries(jit0NoIdentity).map(([k, v]) => [k, summarize(v)]));

    const pairedSummary = Object.fromEntries(Object.entries(paired).map(([k, v]) => [k, {
      fixtures_both_ok: v.n,
      raw_deg_median: round(median(v.raw), 4),
      snap_deg_median: round(median(v.snap), 4),
      raw_axes: v.raw.length, snap_axes: v.snap.length,
    }]));
    const ruleMed = headNoIdentity.rule_grouped.deg_median;
    const detMed = headNoIdentity.detect.deg_median;
    const passed = ruleMed != null && detMed != null && ruleMed < detMed;

    const out = {
      what: "규칙 기반 소실점 확정(그은 선이 곧 제약)의 축 방향 오차. 검출 기반과 같은 픽스처에서 대조.",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS,
        lattice_k: 1,
        metric: "유한 소실점의 축 방향 오차(도) — `metrics.axisDirErrors`. **무한원 축은 안 센다**",
        p1_f_ratio: P1_F_RATIO,
        why_lens: "소실점이 하나면 자유도 1(f)이 남고 **임의값으로 채운다**(D-L53 — P1 깊이 무차원). "
          + "안 채우면 1점 구도의 실행이 통째로 '카메라 없음'이 되어 분모에서 사라진다(#11). "
          + "⚠ 참 f는 1000px이고 임의 f는 " + Math.round(P1_F_RATIO * SZ[0])
          + "px이다. **이 원장의 지표(축 방향 오차)에는 그 어긋남이 안 섞인다** — 1pt 구도의 "
          + "축 방향은 f와 무관하고(headline_no_identity.note 그대로) 그래서 표제에서도 뺐다. "
          + "f 어긋남이 닿는 것은 이 원장이 안 재는 깊이 배율뿐이다(리뷰어 [9] 정정).",
        why_infinite_excluded:
          "화면 평행 축의 방향은 규칙이 `(1,0,0)`·`(0,1,0)`으로 **정의**한다. 그 오차는 측정이 "
          + "아니라 항등이므로(참 장면도 롤 0이다) 표제 수치에 섞으면 값을 공짜로 낮춘다(#5).",
        arms: {
          rule_drawn: "축을 번갈아 긋는 순서(모서리를 따라가는 사람). **순서 오라클 없음**",
          rule_grouped: "축별로 몰아 긋는 순서. ⚠ **참 축 라벨을 쓰는 순서 오라클**",
          rule_wide_pair: "첫 축의 **각차가 가장 큰 두 선**을 먼저 긋는다. ⚠ 순서 오라클이고 "
            + "**이 방식이 얼마나 잘할 수 있는가**의 팔이다(#35 도달 가능성)",
          detect: "`detectVps` + `assignAxes` — **같은 획·같은 실행**(#27). 4선 최소제곱이다",
          rule_drawn_snap: "rule_drawn과 같은 순서, **앱의 확정 전 2D 판정을 통과한 선**(5차 이월-2). "
            + "확정(order≥1) 후는 앱과 같이 원시 선이다. snap_engaged가 실제 발동 수다(#38)",
          rule_grouped_snap: "rule_grouped의 스냅 판. ⚠ 순서 오라클은 그대로다",
          rule_wide_pair_snap: "rule_wide_pair의 스냅 판",
        },
        snap_cfg: {
          radius_px: 15,
          note: "오스냅 조리개 15px(D-L56) = resolve2d.OSNAP_RADIUS_PX — 앱 초기값과 같은 출처(#17). "
            + "⚠ 전역 상수 해시 밖이다(DEFERRED '의존 집합별 해시'와 같은 자리 — 값이 바뀌어도 "
            + "STALE이 안 뜬다. 사람이 본다). 종류 토글 전부 켬·관계 스냅 켬(앱 기본값)",
        },
        ask_policy:
          "**스냅 팔은 방향 스냅이 걸린 선을 묻지 않고 그 축으로 강제한다**(지시 3 — 앱과 같은 "
          + "배선). 남는 물음(자유 선·원시 팔 전부)에는 참 축으로 답했다(오라클). 답한 횟수는 "
          + "`asks_per_run` — 사람이 실제로 몇 번 개입해야 하는가이고 그것이 이 방식의 비용이다.",
      },
      headline: {
        note: "**잡음이 걸린 행만**(0.005·0.01·0.03·0.05). 잡음 0 행은 항등이라 뺐다(#5).",
        ...head,
      },
      what_this_does_not_say: [
        "합성 잉크는 짝을 의도하지 않는다(AS-L13의 자리) — 사람은 X 교차·연장 수렴으로 짝을 긋는다. 실획(K)이 최종 판정자다",
        "시드별 분해가 없다(#14) — 원시↔스냅 격차가 시드 폭 안인지 미확인이다(격차 값은 headline_no_identity를 그 자리에서 읽는다 — 수치를 여기 적으면 재실행마다 낡는다, #1). 짝지은 부분집합(paired_headline)이 표본 짝은 맞추지만 시드 폭은 못 대고, **축 분모는 여전히 다르다**(예: drawn 짝 층에서 raw_axes 대 snap_axes — 무한원 편평화의 선택 효과, 리뷰어 [3-6])",
        "스냅 팔은 **무물음 선언 배선**(지시 3 — 직교→screen·vp_dir→depth 강제)이다. 남는 물음(자유 선)에는 참 축으로 답한다(오라클) — 어느 팔도 실사용 성능이 아니다. 물음 오라클 판(지시 3 이전)의 값은 git show d724ac0:stage0/out/rule_camera.json에 있다",
        "판(revision) 참조(3·4-R [4]): 7차 이전(6차 마감) 판은 git show 513c33d:stage0/out/rule_camera.json, 7차 초판(끝점 오스냅 현의 ortho+vpdir 강제 — P1 가드 우회로 기각된 판, D-L69 ②)은 git show b4f2d9b:stage0/out/rule_camera.json이다. 현행은 vpdir만 강제한다 — 발동 수는 osnap_vpdir_forced가 팔별로 센다(0이면 그 팔의 무변화는 미발동이다, #32)",
        "카메라 확정 후 3D 오스냅·축 스냅의 효과는 2D 목록 근사 밖이다(§4.5 보장으로 화면 좌표는 같다)",
        "무한원 축 제외는 원시 팔에서는 항등 제거지만 **스냅 팔에서는 선택이 될 수 있다**(리뷰어 [23]② — 직교 스냅이 얕은 축을 화면 축으로 펴면 그 축이 분모에서 빠진다). screen_axes_total이 그 대조 재료다",
      ],
      headline_jit0_no_identity: {
        note: "**jit_0 층**(리뷰어 [21]) — endJitter 0이지만 등급 잉크 잡음은 남는 층. 4차 등록이 "
          + "'항등'이라며 표제에서 뺐는데 그 사유가 틀렸다(실측이 0이 아니다). 모집단 연속성으로 "
          + "표제는 유지하고 이 층을 따로 낸다 — 1pt 구도는 여기서도 뺐다(그쪽은 진짜 구성 항등).",
        aperture_note: "**이 층에서 조리개 세 팔(4/15/40px)의 값·발동 수가 동일한 것은 스윕 "
          + "미실행이 아니다**(8-R′ 재검 [M6] — 스윕은 지터 루프 안에서 무조건 돈다, 이 파일의 "
          + "조리개 스윕 블록). 발동 수까지 같다는 것은 **4px를 넘는 거리의 스냅 후보가 이 층에 "
          + "없다**는 뜻이다(있었다면 r40에서 늘었을 것 — 표제 층에서는 같은 스윕이 발동 수를 "
          + "움직인다). 즉 반경이 결정에 안 묶이는 **포화**이고, '정보량 0'은 그 관측의 이름이지 "
          + "기전 판정이 아니다 — 거리 분포 자체는 안 쟀다(#32 대응 관측 병기).",
        ...jit0Head,
      },
      paired_headline: {
        note: "**짝지은 부분집합**(리뷰어 [23]①) — 표제 모집단에서 원시·스냅 둘 다 카메라가 선 "
          + "픽스처만. 팔별 camera_ok 차이(예: drawn 109 대 138)가 중앙값을 흔드는 것을 가른다.",
        ...pairedSummary,
      },
      headline_no_identity: {
        note: "위에서 **`1pt_yaw0_pitch0` 구도를 더 뺐다.** 그 구도의 유일한 유한 소실점은 "
          + "주점 자리이고, 소실점 하나면 주점이 그 소실점이 되므로 축 방향이 **f와 무관하게 "
          + "광축 (0,0,1)**이 된다 — 그 구도의 참 깊이축과 같아서 **어떤 오차를 넣어도 0이 나온다**. "
          + "실측에서 `deg_median = 0`으로 드러났다(#5 자기참조 유형 3). **이 표가 표제다.**",
        ...headNoIdentity,
      },
      by_jitter: Object.fromEntries(Object.entries(byJitter).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, summarize(b)]))])),
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, summarize(b)]))])),
      all_jitters: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, summarize(v)])),
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**오라클이 없다.** 이 방식의 '완벽한 입력'은 참 투영이고, 그때 두 깊이선의 교점은 "
          + "**정의상 참 소실점**이라 오차가 0이다 — 그것은 도달 가능성이 아니라 항등이다"
          + "(PITFALLS #5 자기참조 유형 3 · #40 ②: 그 자리의 0은 측정이 아니라 보장이다). "
          + "그러므로 '기준을 못 넘으면 신호의 성질인가 기준의 성질인가'가 **갈리지 않는 상태**이고, "
          + "그 사실을 여기 남긴다(#35). ⚠ 기준을 낮추는 근거가 아니다.",
        reachability_absent:
          "**오라클 팔이 없다**(위 reachability). ⚠ [5차 정정 — 리뷰어 [21]] 초판이 여기 적은 "
          + "'무오차 입력 = jit_0 = 정의상 0'은 틀렸다 — jit_0은 endJitter만 0이고 등급 잉크 "
          + "잡음이 남아 실측이 0이 아니다(headline_jit0_no_identity). 참 항등은 등급 잡음까지 "
          + "끈 입력인데 그 팔은 안 돌렸다(돌리면 정의상 0이라 정보가 없다, #5).",
        result: {
        rule_grouped_median: ruleMed, detect_median: detMed, passed,
        // **앱 동작점**(5차 이월-2) — 스냅 팔
        rule_drawn_snap_median: headNoIdentity.rule_drawn_snap.deg_median,
        rule_grouped_snap_median: headNoIdentity.rule_grouped_snap.deg_median,
        rule_wide_pair_snap_median: headNoIdentity.rule_wide_pair_snap.deg_median,
        // **위약**(#39, 리뷰어 [20]) — 같은 크기 임의 방향 이동
        rule_drawn_placebo_median: headNoIdentity.rule_drawn_placebo.deg_median,
        rule_grouped_placebo_median: headNoIdentity.rule_grouped_placebo.deg_median,
        rule_wide_pair_placebo_median: headNoIdentity.rule_wide_pair_placebo.deg_median,
        // **조리개 스윕**(#12, 리뷰어 [25])
        rule_grouped_snap_r4_median: headNoIdentity.rule_grouped_snap_r4.deg_median,
        rule_grouped_snap_r40_median: headNoIdentity.rule_grouped_snap_r40.deg_median,
        // **짝지은 부분집합**(리뷰어 [23]①)
        paired: pairedSummary,
        passed_snapped: headNoIdentity.rule_grouped_snap.deg_median != null && detMed != null
          && headNoIdentity.rule_grouped_snap.deg_median < detMed,
        passed_snapped_note: "몰아(grouped) 팔을 강제하는 이유는 **원 판정(passed)과 같은 팔**이라는 "
          + "연속성 하나다(리뷰어 [36]) — AS-L13 방향 뒤집힘으로 대표성 근거는 없다. 세 팔 중앙을 "
          + "전부 적는다(#28 '못 고르면 둘 다').",
      },
        note: "⚠ **이 항목이 등록한 게이트다.** CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)과 "
          + "다른 게이트이고 같은 말로 부르지 않는다(PITFALLS #41).",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "rule_camera.json"), JSON.stringify(out, null, 2));

    // 원장이 실제로 무언가를 쟀는가 — **덮는 대상 0을 통과로 읽지 않는다**(#38)
    expect(fixtures).toBeGreaterThan(0);
    expect(head.rule_grouped.axes_measured).toBeGreaterThan(0);
    expect(head.detect.axes_measured).toBeGreaterThan(0);
  }, 240_000);
});
