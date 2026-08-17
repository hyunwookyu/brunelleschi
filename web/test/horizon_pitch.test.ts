// **지평선을 사용자가 끈다 = 피치를 준다** — 산출: `stage0/out/horizon_pitch.json`.
//
// 사람 지시(2026-08-16, QUESTIONS g): "건축 투시에서 3점(앙각·부감)은 흔한 구도이므로
// **초기부터 가능해야 한다.** 기본 피치를 바꾸든 지평선을 끌게 하든 **단순한 것**을 고르고
// 근거를 DECISIONS에 남긴다." → **D-L45**(지평선 드래그).
//
// 이 원장이 재는 것은 그 선택의 **전제**다: 지평선이 맞으면 초기 스케치에서 **차수가 3이
// 되는가**, 그것이 **"옮겨서"가 아니라 "맞아서"인가**(#39 위약), 그리고
// **몇 px까지 맞으면 이득인가**(허용 오차 곡선 — 리뷰어 [4]).
//
// ---------------------------------------------------------------- 리뷰어 1회차 대응
//
// 초판의 결함 넷을 여기서 고쳤다:
//   [1] 도달 가능성 자리에 **판정 대상 팔의 값**을 적었다 → `reachability_absent`로 바꿨다(#40)
//   [2] 위약의 서술이 틀렸다 — 위약은 **참에서 2d**이고 **중앙에서 d**다.
//       판정 짝을 **참 ↔ 위약**(중앙에서 같은 크기, 반대 방향)으로 바로잡았다
//   [3] 순서 축이 등록 모집단에서 빠져 있었다 → **두 순서를 다 등록하고 다 판정한다**(#28)
//   [4] 지평선 오차 축이 {0, d, 2d} 셋뿐이었다 → **±10·±30·±60·±120px 스윕**을 넣었다(#12)
//   [5] 팔마다 축 집합이 달랐다(참 팔에는 유도된 세 번째 축이 섞인다) →
//       **수평 축 둘만 자른 값**(`deg_median_h2`)을 함께 낸다(#11)
//   [6] 구도별로는 위약 조건이 3 중 2에서만 성립했다 → **구도별 판정을 게이트에 적는다**
//   [7] `order3`은 카메라가 섰다는 뜻이 아니다 → `camera_ok`를 표제에 함께 낸다(#9)
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호: #5(항등) · #9 · #11 · #12 · #14 · #26 ·
// #28 · #35 · #38 · #39 · #40 · #41.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { fPixelsFrom35mm } from "../src/s3d/constraints.js";
import { P1_F_RATIO } from "../src/ui/camState.js";
import { representative } from "../src/s3d/axis.js";
import {
  newRuleState, stepRule, vpsOf, defaultHorizon, type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge } from "./scene3d.js";
import { axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** **`rule_camera.test.ts`와 같은 다섯 구도.** 하네스마다 자기 목록을 두는 것이 이 저장소의 관례다. */
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
/** 잡음이 걸린 행만 표제에 쓴다(#5 — 0 행은 항등이다). */
const LIVE_JITTERS = JITTERS.filter(j => j > 0);
/** **허용 오차 축**(px) — 참 지평선에서 이만큼 벗어난 팔을 함께 돌린다(리뷰어 [4] · #12). */
const ERR_PX = [10, 30, 60, 120];

/** **사전 등록**(#26). 이 항목이 등록한 게이트이고 **중단 조건이 아니다**(#41).
 * ⚠⚠ **2026-08-17 4차 D-L59로 이 하네스의 조작 변수가 죽었다** — 지평선이 소실점 확정에
 * 안 쓰이므로(첫 소실점 = 그린 두 선의 교점) 참·중앙·위약 세 팔이 **동일한 값**을 낸다.
 * 아래 등록문 ①의 대상("중앙 팔은 0")은 **사라졌고**(DEFERRED 301의 처방 적용 — 4차 재검 [10]),
 * ②·③도 팔이 같아 가를 것이 없다. 등록문은 역사 기록으로 남긴다 — 하네스의 은퇴/재목적은
 * DEFERRED("horizon_pitch 하네스의 조작 변수가 죽었다") 참조. */
const REGISTERED =
  "**두 순서(grouped·drawn) 각각에서** 참 지평선 팔이 셋을 만족한다: "
  + "① 차수 3인 실행이 실제로 난다(`order3 > 0`) — 같은 층에서 **중앙 지평선 팔은 0**이다. "
  + "⚠ 이 조건은 '옮겼다'와 '맞다'를 **못 가른다**(위약도 3점이 선다 — 지평선이 중앙만 아니면 "
  + "수심 유도가 살아나기 때문이다, 이론서 2.2). 그래서 ②·③이 필요하다. "
  + "② **축 방향 오차 중앙**(수평 축 둘만 자른 값 `deg_median_h2` 포함)이 중앙 지평선 팔보다 작다. "
  + "③ **참 ↔ 위약**(중앙에서 **같은 크기, 반대 방향**으로 옮긴 두 팔)에서 참이 낫다 — "
  + "이것이 '옮겼다'가 아니라 '맞다'를 가르는 짝이다(#39). "
  + "⚠ 위약은 **참에서 2d**이므로 '위약 대 중앙' 비교는 거리 단조성으로도 설명된다 — 근거로 쓰지 않는다. "
  + "**구도별로도 판정해 함께 적는다**(합산이 실패 구도를 덮지 않게, CLAUDE.md §2의 5구도 규범). "
  + "모집단: 3pt 구도 3 × 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05} × **순서 2**"
  + "(잡음 0 행은 항등이라 뺀다, #5). "
  + "⚠ **이 항목이 등록한 게이트이고 CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 아니다**(#41).";

// ---------------------------------------------------------------- 픽스처

interface Fx { sc: Scene; drawn: DrawnEdge[] }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  return drawn ? { sc, drawn } : null;
}

/** **참 지평선**(화면 y) — 수평 축 소실점의 y다(이론서 3.1 + 롤 0). */
function trueHorizon(sc: Scene): number {
  for (const i of [0, 1] as const) if (isFiniteVp(sc.vps[i], SZ)) return sc.vps[i][1];
  return defaultHorizon(SZ);
}

// ---------------------------------------------------------------- 규칙 팔

type Order = "drawn" | "grouped";
const ORDERS: Order[] = ["grouped", "drawn"];

/** `rule_camera.test.ts`의 순서 정의와 같다. `grouped`는 **참 축 라벨을 쓰는 순서 오라클**이다. */
function orderStrokes(fx: Fx, order: Order): DrawnEdge[] {
  if (order === "grouped") return [...fx.drawn].sort((a, b) => a.axis - b.axis);
  const byAxis: DrawnEdge[][] = [[], [], []];
  for (const e of fx.drawn) byAxis[e.axis].push(e);
  const out: DrawnEdge[] = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const ax of [0, 1, 2] as const) if (byAxis[ax][i]) { out.push(byAxis[ax][i]); any = true; }
    if (!any) break;
  }
  return out;
}

interface RuleRun { st: RuleState; asks: number; rejected: number }

/**
 * **획을 차례로 규칙에 넣는다** — 앱의 `feedStroke`와 같은 경로다(#17).
 * `horizon0`이 이 팔의 지평선이고 **그것만이 팔 사이의 차이다.**
 * 물음에는 **참 축으로 답한다**(오라클) — 세 팔 전부 같은 정책이다.
 */
function runRules(fx: Fx, order: Order, horizon0: number): RuleRun {
  let st: RuleState = { ...newRuleState(SZ), horizon: horizon0 };
  let asks = 0, rejected = 0;
  for (const e of orderStrokes(fx, order)) {
    const rep = representative(e.pts2d);
    if (!rep) continue;
    const line: RLine = { a: rep.a, b: rep.b };
    let r = stepRule(st, line, SZ);
    if (r.event.type === "ask") {
      asks += 1;
      const truth: "screen" | "depth" | "vertical" =
        e.axis === 2 && !isFiniteVp(fx.sc.vps[2], SZ) ? "screen"
        : e.axis === 2 ? "vertical"
        : isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
      r = stepRule(st, line, SZ, truth);
    }
    if (r.event.type === "rejected") { rejected += 1; continue; }
    st = r.state;
  }
  return { st, asks, rejected };
}

// ---------------------------------------------------------------- 집계

const q = (xs: number[], p: number): number | null => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
};
/** ⚠ **분모가 0이면 `null`**(#36) — 없는 관측을 만들지 않는다. */
const rate = (k: number, n: number): number | null => (n ? +(k / n).toFixed(4) : null);

interface Bag {
  errs: number[];
  /** **수평 축 둘만** — 팔마다 축 집합이 다른 것을 갈라 낸다(리뷰어 [5] · #11). */
  errsH: number[];
  runs: number; ok: number; order: number[];
  order3: number; asks: number; rejected: number;
  /** 지평선이 **중앙**에서 떨어진 거리(px). */
  offsets: number[];
  /** 지평선이 **참값**에서 떨어진 거리(px) — 허용 오차 곡선의 x축이다. */
  errPx: number[];
}
const bag = (): Bag => ({ errs: [], errsH: [], runs: 0, ok: 0, order: [], order3: 0,
                          asks: 0, rejected: 0, offsets: [], errPx: [] });

function summarize(b: Bag) {
  return {
    runs: b.runs,
    camera_ok: b.ok,
    camera_ok_rate: rate(b.ok, b.runs),
    axes_measured: b.errs.length,
    deg_median: round(median(b.errs), 4),
    deg_p90: round(q(b.errs, 0.9), 4),
    deg_max: round(q(b.errs, 1), 4),
    /** **수평 축 둘만.** 팔 사이에서 같은 축 집합을 비교하는 값이다 */
    axes_h2: b.errsH.length,
    deg_median_h2: round(median(b.errsH), 4),
    deg_p90_h2: round(q(b.errsH, 0.9), 4),
    order_median: round(median(b.order), 2),
    order3: b.order3,
    order3_rate: rate(b.order3, b.runs),
    asks_per_run: round(b.runs ? b.asks / b.runs : null, 3),
    rejected_per_run: round(b.runs ? b.rejected / b.runs : null, 3),
    horizon_offset_px_median: round(median(b.offsets), 2),
    /** **참 지평선에서의 거리**(px) 중앙값. 0이 참 팔, d가 중앙 팔, 2d가 위약이다 */
    horizon_err_px_median: round(median(b.errPx), 2),
  };
}

/** 팔 이름 — 세 기준 팔 + 허용 오차 스윕. */
const BASE_ARMS = ["center", "true", "placebo"] as const;
const ERR_ARMS = ERR_PX.flatMap(e => [`err_up_${e}`, `err_down_${e}`]);
const ARM_NAMES = [...BASE_ARMS, ...ERR_ARMS];

// ---------------------------------------------------------------- 측정

describe("지평선 = 피치 — 사용자가 끌면 3점이 초기부터 서는가 (D-L45)", () => {
  it("중앙·참·위약 + 허용 오차 스윕을 같은 픽스처에서 함께 낸다", () => {
    const key = (arm: string, ord: Order) => `${arm}|${ord}`;
    const newArms = (): Record<string, Bag> => Object.fromEntries(
      ARM_NAMES.flatMap(a => ORDERS.map(o => [key(a, o), bag()]))) as Record<string, Bag>;

    const arms = newArms();
    const byComp: Record<string, Record<string, Bag>> = {};
    const byJitterComp: Record<string, Record<string, Bag>> = {};
    let fixtures = 0, fixtureFailed = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) { fixtureFailed += 1; continue; }
            fixtures += 1;
            const ck = COMPOSITIONS[ci].name;
            const jk = `jit_${jit}`;
            byComp[ck] ??= newArms();
            byJitterComp[`${jk}|${ck}`] ??= newArms();

            const center = defaultHorizon(SZ);
            const truth = trueHorizon(fx.sc);
            const horizons: Record<string, number> = {
              center,
              true: truth,
              // **위약 = 중앙에서 참과 같은 크기, 반대 방향**(참에서는 2d다 — 그 사실을 적는다)
              placebo: 2 * center - truth,
            };
            for (const e of ERR_PX) {
              horizons[`err_up_${e}`] = truth - e;      // 화면 위(y가 작다)
              horizons[`err_down_${e}`] = truth + e;
            }

            for (const arm of ARM_NAMES) {
              for (const ord of ORDERS) {
                const h0 = horizons[arm];
                const r = runRules(fx, ord, h0);
                const vps = vpsOf(r.st);
                const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
                const cam = recoverCamera(vps, SZ,
                  nF === 1 ? { fSetting: P1_F_RATIO * SZ[0] } : {});   // P1 임의 f(지시 1)
                const okCam = cam.ok && cam.principalPoint && cam.f != null;
                const errs = okCam ? axisDirErrors(vps, cam.principalPoint!, cam.f!, fx.sc.axes) : [];
                // **수평 축 둘만** — 같은 카메라로, 유도된 세 번째를 빼고 잰다(#11)
                const errsH = okCam
                  ? axisDirErrors([vps[0], vps[1], null], cam.principalPoint!, cam.f!, fx.sc.axes) : [];
                for (const t of [arms[key(arm, ord)], byComp[ck][key(arm, ord)],
                                 byJitterComp[`${jk}|${ck}`][key(arm, ord)]]) {
                  t.runs += 1;
                  if (cam.ok) t.ok += 1;
                  t.errs.push(...errs);
                  t.errsH.push(...errsH);
                  t.order.push(nF);
                  if (nF >= 3) t.order3 += 1;
                  t.asks += r.asks;
                  t.rejected += r.rejected;
                  t.offsets.push(Math.abs(h0 - center));
                  t.errPx.push(Math.abs(h0 - truth));
                }
              }
            }
          }
        }
      }
    }

    // ---- 표제: **잡음이 걸린 행 · 피치≠0 세 구도**
    const pitched = COMPOSITIONS.filter(c => c.pitch !== 0).map(c => c.name);
    const head = newArms();
    for (const j of LIVE_JITTERS) for (const c of pitched) {
      const src = byJitterComp[`jit_${j}|${c}`];
      if (!src) continue;
      for (const k of Object.keys(head)) {
        const b = src[k], t = head[k];
        t.errs.push(...b.errs); t.errsH.push(...b.errsH);
        t.runs += b.runs; t.ok += b.ok; t.order.push(...b.order);
        t.order3 += b.order3; t.asks += b.asks; t.rejected += b.rejected;
        t.offsets.push(...b.offsets); t.errPx.push(...b.errPx);
      }
    }
    const headline = Object.fromEntries(Object.entries(head).map(([k, v]) => [k, summarize(v)]));

    // ---- 판정 — **두 순서 각각**, 그리고 **구도별로도**
    const judgeOne = (h: Record<string, ReturnType<typeof summarize>>, suffix: string) => {
      const T = h[`true|${suffix}`], C = h[`center|${suffix}`], P = h[`placebo|${suffix}`];
      const lt = (a: number | null, b: number | null) => a != null && b != null && a < b;
      return {
        order3_true: T.order3, order3_center: C.order3, order3_placebo: P.order3,
        camera_ok_true: T.camera_ok, camera_ok_center: C.camera_ok, camera_ok_placebo: P.camera_ok,
        deg_true: T.deg_median, deg_center: C.deg_median, deg_placebo: P.deg_median,
        deg_h2_true: T.deg_median_h2, deg_h2_center: C.deg_median_h2, deg_h2_placebo: P.deg_median_h2,
        cond1_three_point_appears: T.order3 > 0 && C.order3 === 0,
        cond2_true_better_than_center: lt(T.deg_median, C.deg_median),
        cond2_h2_true_better_than_center: lt(T.deg_median_h2, C.deg_median_h2),
        cond3_true_better_than_placebo: lt(T.deg_median, P.deg_median),
        cond3_h2_true_better_than_placebo: lt(T.deg_median_h2, P.deg_median_h2),
      };
    };
    const verdictByOrder = Object.fromEntries(
      ORDERS.map(o => [o, judgeOne(headline as never, o)]));
    const verdictByComposition = Object.fromEntries(pitched.map(c => {
      const h = Object.fromEntries(
        Object.entries(byComp[c]).map(([k, v]) => [k, summarize(v)])) as never;
      return [c, Object.fromEntries(ORDERS.map(o => [o, judgeOne(h, o)]))];
    }));
    const allConds = (v: ReturnType<typeof judgeOne>) =>
      v.cond1_three_point_appears && v.cond2_true_better_than_center
      && v.cond2_h2_true_better_than_center && v.cond3_true_better_than_placebo
      && v.cond3_h2_true_better_than_placebo;
    const passedOrders = ORDERS.filter(o => allConds(verdictByOrder[o]));
    const passedComps = pitched.filter(c =>
      ORDERS.every(o => allConds((verdictByComposition[c] as never)[o])));
    const passed = passedOrders.length === ORDERS.length;

    // ---- **허용 오차 곡선** — 참에서 얼마나 벗어나도 중앙 팔보다 나은가
    const tolerance = Object.fromEntries(ORDERS.map(o => {
      const C = headline[`center|${o}`];
      const rows = [
        { err_px: 0, arm: "true", ...pick(headline[`true|${o}`]) },
        ...ERR_PX.flatMap(e => ([
          { err_px: -e, arm: `err_up_${e}`, ...pick(headline[`err_up_${e}|${o}`]) },
          { err_px: e, arm: `err_down_${e}`, ...pick(headline[`err_down_${e}|${o}`]) },
        ])),
      ].sort((a, b) => a.err_px - b.err_px);
      const betterThanCenter = rows.filter(r =>
        r.deg_median != null && C.deg_median != null && r.deg_median < C.deg_median);
      return [o, {
        center_deg_median: C.deg_median,
        center_deg_median_h2: C.deg_median_h2,
        rows,
        /** 중앙 팔보다 나은 오차 구간의 **최대 |오차|**(px). 곡선이 뒤집히는 자리다 */
        best_tolerance_px: betterThanCenter.length
          ? Math.max(...betterThanCenter.map(r => Math.abs(r.err_px))) : null,
      }];
    }));

    const out = {
      what: "지평선을 **사용자가 끄는 것**(= 피치를 주는 것)의 전제를 잰다 — 지평선이 맞으면 "
        + "초기 스케치에서 차수가 3이 되는가, 그 이득이 '옮겨서'가 아니라 '맞아서'인가, "
        + "그리고 **몇 px까지 맞으면 이득인가**.",
      why: "D-L43의 곁가지로 **초기 스케치가 1점·2점뿐**이었다(기본 지평선 = 화면 중앙 = 피치 0 → "
        + "수심 유도가 `null`, 이론서 2.2). 사람 지시: 건축 투시의 3점은 흔한 구도이므로 "
        + "**초기부터 가능해야 한다**(QUESTIONS g → D-L45).",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, lattice_k: 1,
        orders: ORDERS,
        error_sweep_px: ERR_PX,
        metric: "유한 소실점의 축 방향 오차(도) — `metrics.axisDirErrors`. 무한원 축은 안 센다. "
          + "`*_h2`는 **수평 축 둘만** 자른 값이다(팔마다 유한 축 수가 다르다, #11).",
        arms: {
          center: "지평선 = 화면 중앙(피치 0). **지금까지의 동작이다**",
          true: "지평선 = **참 수평 소실점의 y**. ⚠ **오라클이다** — 사람이 그 자리에 놓는지는 "
            + "표본이 0이다(AS-L9). 상한이라 부르지 않는다(#35)",
          placebo: "지평선 = **중앙에서 참과 같은 크기, 반대 방향**(2·중앙 − 참). "
            + "⚠ **참에서는 2d 떨어져 있다** — 그래서 '위약 대 중앙'은 거리 단조성으로도 설명되고 "
            + "근거로 쓰지 않는다. 가르는 짝은 **참 ↔ 위약**(중앙에서 같은 크기, 반대 방향)이다(#39)",
          "err_up_N · err_down_N": "지평선 = 참 ± N px. **허용 오차 곡선**이고, "
            + "'사람이 끈다'가 성립하려면 이 곡선이 사람 손의 자릿수 안에서 이득이어야 한다",
        },
        why_pitched_only:
          "표제는 **피치 ≠ 0인 세 구도**만 쓴다. 피치 0 구도에서는 참 지평선이 화면 중앙과 같아 "
          + "**세 기준 팔의 지평선이 한 값이 된다** — 팔 간 비교의 대상이 없다(#38). "
          + "그 층도 `by_composition`에 그대로 남긴다.",
        ask_policy: "물음에는 **참 축으로 답했다**(오라클) — **모든 팔이 같은 정책**이다. "
          + "횟수를 `asks_per_run`으로 남긴다. ⚠ 그러므로 어느 팔도 '실사용 성능'이 아니다.",
      },
      headline: {
        note: "**잡음 {0.005,0.01,0.03,0.05} · 피치≠0 세 구도.** 잡음 0 행은 항등이라 뺐다(#5).",
        ...headline,
      },
      verdict_by_order: verdictByOrder,
      verdict_by_composition: verdictByComposition,
      tolerance_curve: tolerance,
      what_the_zeros_mean: {
        "center|*.horizon_offset_px_median = 0":
          "**구성상 0이다** — 중앙 팔의 지평선이 곧 화면 중앙이다. 측정이 아니라 덮는 대상 표시다(#38).",
        "true|*.horizon_err_px_median = 0":
          "**구성상 0이다** — 참 팔은 참 지평선을 그대로 받는다. 그 팔이 **오라클**인 이유이고, "
          + "그래서 게이트의 도달 가능성은 **`reachability_absent`**다(#40).",
        "center|*.order3_rate = 0":
          "⛔ **대상이 사라졌다**(4차 D-L59 — DEFERRED 301의 처방, 재검 [10]): 지평선이 소실점 "
          + "확정에 안 쓰이므로 세 팔이 동일한 값을 낸다. 옛 관측('피치 0에서는 수심 유도가 "
          + "null이라 차수 3 불가')은 A-4·D-L59 이전 기전의 기록이다.",
        "2pt_*·1pt_* 층의 offset = 0 (세 기준 팔 전부)":
          "그 구도는 피치가 0이라 참 지평선이 화면 중앙과 같다 — **팔 간 비교의 대상이 없다**(#38).",
      },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**오라클 팔이 곧 판정 대상이다** — `true` 팔은 참 지평선을 그대로 받으므로 "
          + "'무엇이 이 기준을 넘을 수 있는가'의 답이 **판정받는 그 팔 자신**이 된다. "
          + "그 값을 도달 가능성으로 적으면 **자명한 값**이고 #40이 `segment_gate`에서 고친 것과 "
          + "같은 구조다(리뷰어 1회차 [1]). 그래서 여기서는 **수치를 적지 않는다**. "
          + "대신 이 항목이 실제로 물어야 하는 도달 가능성 — **사람이 지평선을 몇 px 안에 놓는가** — 은 "
          + "**표본이 0이다**(AS-L9와 같은 자리). 그 대리로 `tolerance_curve`를 낸다: "
          + "**참에서 ±N px 벗어난 팔이 중앙 팔보다 나은 최대 N**이 `best_tolerance_px`이고, "
          + "그것이 사람 손이 들어가야 하는 창이다. ⚠ **그 창에 사람이 드는지는 여전히 미측정**이고 "
          + "기준을 낮추는 근거가 아니다(#26의 반대편 문).",
        reachability_absent:
          "**사람이 지평선을 놓는 정확도의 표본이 0이다**(AS-L9). 참 지평선 팔은 오라클이 아니라 "
          + "**판정 대상 자체**라 도달 가능성의 수치로 쓸 수 없다(#40 · 리뷰어 1회차 [1]). "
          + "허용 오차 곡선(`tolerance_curve`)은 **창의 크기**를 주지만 **사람이 그 창에 드는가**는 "
          + "실사용 관측이어야 한다.",
        result: {
          by_order: verdictByOrder,
          passed_orders: passedOrders,
          passed_compositions: passedComps,
          failed_compositions: pitched.filter(c => !passedComps.includes(c)),
          tolerance_px: Object.fromEntries(
            ORDERS.map(o => [o, (tolerance as never as Record<string, { best_tolerance_px: number | null }>)[o].best_tolerance_px])),
          passed,
        },
        note: "⚠ **이 항목이 등록한 게이트다.** CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)과 "
          + "다른 게이트이고 같은 말로 부르지 않는다(#41). "
          + "⚠ **구도별 판정을 함께 낸다** — 합산 하나로 통과를 주장하지 않는다.",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "horizon_pitch.json"), JSON.stringify(out, null, 2));

    // **덮는 대상 0을 통과로 읽지 않는다**(#38)
    expect(fixtures).toBeGreaterThan(0);
    expect(headline["true|grouped"].runs).toBeGreaterThan(0);
    expect(headline["true|grouped"].horizon_offset_px_median).toBeGreaterThan(0);
    expect(headline["err_up_30|grouped"].horizon_err_px_median).toBe(30);
  }, 240_000);
});

/** 허용 오차 표에 넣을 것만 고른다 — 표가 원장 절반을 차지하지 않게. */
function pick(s: ReturnType<typeof summarize>) {
  return { deg_median: s.deg_median, deg_median_h2: s.deg_median_h2,
           order3: s.order3, camera_ok: s.camera_ok, runs: s.runs };
}
