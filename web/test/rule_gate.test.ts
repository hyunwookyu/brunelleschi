// **중단 조건 게이트의 사정거리 확장** — 산출: `stage0/out/rule_gate.json`.
//
// 2026-08-17 8차 지시 a: "게이트를 확정 규칙까지 포함하도록 확장하거나, 별도 게이트를 만든다.
// **획을 입력으로 주고 확정 규칙을 거쳐 카메라가 나오는 경로 전체**를 재는 것이어야 한다."
//
// 왜 필요한가(지시 b의 사실): `camera_gate`는 **소실점을 직접 주고** `recoverCamera`만 부른다.
// 그래서 `stepRule`·`resolve2dCore`(확정 규칙)를 고쳐도 그 원장은 **한 자리도 안 움직인다** —
// 그리고 그 부동(不動)이 "안전하다"로 읽혔다. **원장이 안 움직인 것은 안전의 증거가 아니다.**
// 이것이 PITFALLS #40 계열(검사를 만들면서 그 검사를 무력화한 것)의 사정거리 판이고,
// 8차에 **#43**으로 등재했다.
//
// `camera_gate`와의 관계:
//   `camera_gate` — 소실점 → 카메라 → 배치. **카메라 수학**의 게이트. 그대로 둔다.
//   `rule_gate`   — 획 → 2D 판정 → 확정 규칙 → 카메라 → 배치. **확정 경로 전체**의 게이트.
// 둘은 같은 다섯 구도·같은 배치 지표를 쓰지만 **대역을 서로에게서 가져오지 않는다**(#27) —
// 이 원장의 대역은 이 하네스의 `truth_vps` 팔이다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   자기참조 — `truth_vps` 팔은 **참 소실점**이라 카메라 오차가 0이다. 그 팔은 **대역**이지
//        도달 가능성이 아니다(`reachability_value`에 그 팔의 값을 적으면 항등이다, #40 ①②)
//   #11  분모 — **카메라가 안 서는 실행도 센다.** 선 실행만 재면 규칙이 공짜로 이긴다
//   #12  동작점을 하나 고르지 않는다 — 잡음 5수준 × 등급 2 × 순서 3
//   #13  절단값을 하나 고르지 않는다 — 조용히 틀림 0.1·0.2·0.5를 다 낸다
//   #14  시드 여섯. 비율보다 분자/분모. 유효 자릿수 2
//   #26  통과 기준을 **측정 전에** 박는다(아래 `REGISTERED`)
//   #27  **대역을 다른 하네스에서 가져오지 않는다** — `truth_vps` 팔을 같은 픽스처에서 같이 돌린다
//   #35·#40  도달 가능성은 **수치 + 출처**로. 항등을 적지 않는다
//   #41  **이것은 CLAUDE.md §2 중단 조건의 확장분이다.** 실패하면 실제로 멈춘다
//   #43  이 파일이 만들어진 이유 자체(사정거리)
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { P1_F_RATIO } from "../src/ui/camState.js";
import { vpsOf, perspectiveOrder } from "../src/s3d/vpRules.js";
import { liftAll, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import type { Axis } from "../src/s3d/axis.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, stat, round, median,
         type Scene, type TrueEdge, type DrawnEdge } from "./scene3d.js";
import { perStrokeError, axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";
// **규칙 먹이기는 `ruleFeed.ts` 하나다** — `rule_camera`와 같은 출처(#17·#27)
import { runRules, type RuleFx, type Order } from "./ruleFeed.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** **`camera_gate`·`rule_camera`와 같은 다섯 구도**(#27 — 픽스처를 갈라 놓지 않는다). */
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
const ORDERS: Order[] = ["drawn", "grouped", "wide_pair"];

/** CLAUDE.md §2가 정한 통과 배수. **대역만 이 하네스에서 낸다**(#27) — 배수는 그대로 쓴다. */
const CUT_MULT = 1.1;      // 조용히 틀림(cut 0.2)
const SHAPE_MULT = 2.1;    // 형태 오차 중앙

/**
 * **사전 등록**(#26 — 측정 전에 박았다).
 *
 * 지표: `silent_wrong.cut_0_2`(조용히 틀린 배치 비율)와 `shape_err_median`.
 * 판정 팔: **`rule_drawn`** — 축을 번갈아 긋는 순서이고 **순서 오라클이 없는 유일한 팔**이다
 * (`grouped`·`wide_pair`는 참 축 라벨로 순서를 고른다 — 그 사실이 결론에 붙는다, #2).
 * 대역: **같은 하네스·같은 픽스처**의 `truth_vps` 팔(참 소실점 → 같은 `recoverCamera`·같은 `liftAll`).
 * 통과: `rule_drawn`의 조용히 틀림 ≤ 대역 × 1.1 **그리고** 형태 중앙 ≤ 대역 × 2.1.
 * 모집단: 5구도 × 5잡음 × 2등급 × 6시드 — **합산으로 판정하고 구도별 분해를 함께 낸다**
 * (`camera_gate` 등록문이 '5구도 전부'를 요구하면서 대역은 단일 구도 부분집합이던 문제를
 * 이 원장에서는 만들지 않는다 — `by_composition`이 원장에 있다).
 */
const REGISTERED =
  "**획 → 확정 전 2D 판정(`resolve2dCore`) → 확정 규칙(`stepRule`) → `recoverCamera` → `liftAll`** "
  + "경로 전체에서, `rule_drawn` 팔의 조용히 틀림(cut 0.2)이 **같은 하네스·같은 픽스처**의 "
  + "`truth_vps` 팔 대비 **1.1배 이내**이고 형태 오차 중앙이 **2.1배 이내**다. "
  + "배수는 CLAUDE.md §2 중단 조건과 같은 값이고 **대역만 이 하네스에서 낸다**(#27). "
  + "모집단은 5구도 × 잡음 {0,0.005,0.01,0.03,0.05} × 등급 2 × 시드 6이고 **합산으로 판정**한다 — "
  + "구도별 분해(`by_composition`)를 원장에 함께 실어 **구도 하나로 통과를 주장하지 않는다**. "
  + "판정 팔이 `rule_drawn`인 이유는 **순서 오라클이 없는 유일한 팔**이기 때문이다(#2). "
  + "⚠ 이것은 **CLAUDE.md §2 중단 조건의 사정거리 확장분**이다(#41) — `camera_gate`가 확정 규칙을 "
  + "안 지나므로 그 원장의 부동은 이 경로의 안전을 뜻하지 않는다(#43). **실패하면 실제로 멈춘다.**";

// ---------------------------------------------------------------- 픽스처

interface Fx extends RuleFx { edges: TrueEdge[]; diag: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  // **`rule_camera`와 같은 시드 식**(같은 획을 본다 — 두 원장을 나란히 읽을 수 있다)
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, drawn, edges, diag };
}

const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

// ---------------------------------------------------------------- 집계

const rate = (k: number, n: number): number | null => (n ? +(k / n).toFixed(4) : null);

/** `camera_gate`의 카운터와 **같은 모양**이다 — 두 원장을 나란히 읽으려면 같아야 한다. */
const bag = () => ({
  scenes: 0, comp: 0, placedOfComp: 0, placedOfAll: 0, total: 0, placed: 0,
  wrong10: 0, wrong20: 0, wrong50: 0,
  shapeMed: [] as number[], shapeP90: [] as number[],
  axErr: [] as number[], camOk: 0,
  /** 확정 규칙이 실제로 세운 차수(0이면 카메라가 안 섰다) — 규칙 팔만. */
  orders: [] as number[],
  asks: 0, rejected: 0, snapEngaged: 0, snapQueried: 0,
});
type Bag = ReturnType<typeof bag>;

const report = (b: Bag) => ({
  scenes: b.scenes,
  camera_ok: { k: b.camOk, n: b.scenes, rate: rate(b.camOk, b.scenes) },
  placement: { k: b.placedOfComp, n: b.comp, rate: rate(b.placedOfComp, b.comp),
               of_all: { k: b.placedOfAll, n: b.total, rate: rate(b.placedOfAll, b.total) } },
  // **절단값을 하나 고르지 않는다**(#13)
  silent_wrong: {
    cut_0_1: { k: b.wrong10, n: b.placed, rate: rate(b.wrong10, b.placed) },
    cut_0_2: { k: b.wrong20, n: b.placed, rate: rate(b.wrong20, b.placed) },
    cut_0_5: { k: b.wrong50, n: b.placed, rate: rate(b.wrong50, b.placed) },
  },
  shape_err_median: stat(b.shapeMed), shape_err_p90: stat(b.shapeP90),
  axis_dir_err_deg: stat(b.axErr),
  perspective_order_median: round(median(b.orders), 2),
  /** **차수 분포** — 중앙값 하나로는 "규칙이 어디서 멈추는가"가 안 보인다(#8 꼬리). */
  perspective_order_hist: {
    p0: b.orders.filter(o => o === 0).length, p1: b.orders.filter(o => o === 1).length,
    p2: b.orders.filter(o => o === 2).length, p3: b.orders.filter(o => o === 3).length,
    n: b.orders.length,
  },
  asks_per_scene: round(b.scenes ? b.asks / b.scenes : null, 3),
  rejected_per_scene: round(b.scenes ? b.rejected / b.scenes : null, 3),
  snap_engaged: b.snapEngaged, snap_queried: b.snapQueried,
});

/**
 * **주어진 소실점 집합으로 올리고 카운터에 넣는다.**
 *
 * 획은 **두 팔이 같은 것**을 쓴다(원시 `pts2d`, 참 축 라벨) — 그래야 두 팔의 차이가
 * **카메라 하나**로 좁혀진다. 재는 것은 "확정 규칙이 낸 카메라가 배치를 얼마나 틀리게 하는가"다.
 * ⚠ 그러므로 이 원장은 **스냅이 획 좌표를 옮긴 효과**는 안 잰다(`what_this_does_not_say`).
 */
function liftWith(fx: Fx, vps: (Pt2 | null)[], b: Bag) {
  const { sc, edges, diag } = fx;
  b.scenes += 1; b.total += edges.length;
  // **1점 투시의 f는 임의값이다**(D-L53) — 안 주면 1점 구도가 통째로 분모에서 사라진다(#11)
  const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
  const cam = recoverCamera(vps, SZ, nF === 1 ? { fSetting: P1_F_RATIO * SZ[0] } : {});
  if (!cam.ok || cam.f == null) return;                 // **안 선 실행도 scenes에는 셌다**(#11)
  b.camOk += 1;
  const f = cam.f, principal = cam.principalPoint ?? [SZ[0] / 2, SZ[1] / 2];
  for (const e of axisDirErrors(vps, principal, f, sc.axes)) b.axErr.push(e);
  const ctx: LiftCtx = { principal, f, vps, imgSize: SZ };
  const strokes: LiftStroke[] = fx.drawn.map((e: DrawnEdge, i: number) => ({
    id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: trueAxis(sc, edges[i].axis),
  }));
  const r = liftAll(strokes, ctx);
  b.comp += r.component.length;
  b.placedOfComp += r.placed.size;
  b.placedOfAll += r.placed.size;
  b.placed += r.placed.size;
  const errs = perStrokeError(r.placed, edges, diag);
  for (const v of errs) {
    if (v > 0.1) b.wrong10 += 1;
    if (v > 0.2) b.wrong20 += 1;
    if (v > 0.5) b.wrong50 += 1;
  }
  if (errs.length) {
    b.shapeMed.push(median(errs) ?? 0);
    const srt = errs.slice().sort((x, y) => x - y);
    b.shapeP90.push(srt[Math.min(srt.length - 1, Math.round(0.9 * (srt.length - 1)))]);
  }
}

// ---------------------------------------------------------------- 측정

describe("확정 규칙 경로의 중단 조건 게이트 (8차 지시 a — 사정거리)", () => {
  it("획 → 확정 규칙 → 카메라 → 배치의 형태 오차를 원장에 낸다", () => {
    const ARMS = ["rule_drawn", "rule_grouped", "rule_wide_pair",
                  // **반사실 팔** — 화면 직교 스냅이 P1을 선언하지 않는다(가드가 선다). 진단용.
                  "rule_drawn_no_ortho_force", "truth_vps"] as const;
    const newArms = (): Record<string, Bag> =>
      Object.fromEntries(ARMS.map(a => [a, bag()])) as Record<string, Bag>;
    const all = newArms();
    const byComp: Record<string, Record<string, Bag>> = {};
    const byJitter: Record<string, Record<string, Bag>> = {};
    let fixtures = 0, fixtureFailed = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const ck = COMPOSITIONS[ci].name;
      for (const jit of JITTERS) {
        const jk = `jit_${jit}`;
        for (const grade of GRADES) for (const seed of SEEDS) {
          const fx = fixture(ci, jit, grade, seed);
          if (!fx) { fixtureFailed += 1; continue; }
          fixtures += 1;
          byComp[ck] ??= newArms();
          byJitter[jk] ??= newArms();
          const into = (arm: string) => [all[arm], byComp[ck][arm], byJitter[jk][arm]];

          for (const ord of ORDERS) {
            // **앱과 같은 배선**: 확정 전 획은 2D 판정을 지난다(`snap` 모드 = 앱 동작점)
            const run = runRules(fx, ord, SZ, "snap");
            const vps = vpsOf(run.st);
            for (const t of into(`rule_${ord}`)) {
              liftWith(fx, vps, t);
              t.orders.push(perspectiveOrder(run.st));
              t.asks += run.asks; t.rejected += run.rejected;
              t.snapEngaged += run.snapEngaged; t.snapQueried += run.snapQueried;
            }
          }
          // **반사실**(#39 원인 지목) — 직교 스냅의 `forced="screen"`만 끈다. 나머지는 동일
          {
            const run = runRules(fx, "drawn", SZ, "snap", undefined, undefined,
                                 { noOrthoForce: true });
            for (const t of into("rule_drawn_no_ortho_force")) {
              liftWith(fx, vpsOf(run.st), t);
              t.orders.push(perspectiveOrder(run.st));
              t.asks += run.asks; t.rejected += run.rejected;
              t.snapEngaged += run.snapEngaged; t.snapQueried += run.snapQueried;
            }
          }
          // **대역 팔** — 참 소실점. 같은 획·같은 배치, 카메라만 다르다(#27)
          for (const t of into("truth_vps")) liftWith(fx, trueVps(fx.sc), t);
        }
      }
    }

    const head = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, report(v)]));
    const band = head.truth_vps;
    const judged = head.rule_drawn;
    const cutBand = band.silent_wrong.cut_0_2.rate;
    const cutVal = judged.silent_wrong.cut_0_2.rate;
    const shpBand = band.shape_err_median.median;
    const shpVal = judged.shape_err_median.median;
    const cutLine = cutBand != null ? +(cutBand * CUT_MULT).toFixed(4) : null;
    const shpLine = shpBand != null ? +(shpBand * SHAPE_MULT).toFixed(4) : null;
    const passed = cutVal != null && cutLine != null && shpVal != null && shpLine != null
      && cutVal <= cutLine && shpVal <= shpLine;

    /** 구도별 통과 — **합산 판정을 보조**한다(구도 하나로 통과를 주장하지 않는다는 것의 재료). */
    const byCompVerdict = Object.fromEntries(Object.entries(byComp).map(([k, v]) => {
      const b = report(v.truth_vps), j = report(v.rule_drawn);
      const cb = b.silent_wrong.cut_0_2.rate, cv = j.silent_wrong.cut_0_2.rate;
      const sb = b.shape_err_median.median, sv = j.shape_err_median.median;
      return [k, {
        cut_0_2: { band: cb, value: cv,
                   line: cb != null ? +(cb * CUT_MULT).toFixed(4) : null,
                   passed: cb != null && cv != null ? cv <= cb * CUT_MULT : null },
        shape_median: { band: sb, value: sv,
                        line: sb != null ? +(sb * SHAPE_MULT).toFixed(4) : null,
                        passed: sb != null && sv != null ? sv <= sb * SHAPE_MULT : null },
      }];
    }));

    const doc = {
      what: "**확정 규칙 경로 전체**의 형태 오차 — 획을 입력으로 주고 2D 판정·확정 규칙을 거쳐 "
        + "나온 카메라로 배치한다. `camera_gate`(소실점 직접 주입)의 **사정거리 밖**이던 구간이다.",
      plan: "docs/line_plan.md §5.4 · CLAUDE.md §2 중단 조건 — 2026-08-17 8차 지시 a",
      why_this_exists:
        "**원장이 안 움직인 것은 안전의 증거가 아니다**(8차 지시 b · PITFALLS #43). "
        + "`camera_gate`는 소실점을 직접 주고 `recoverCamera`만 부르므로 `stepRule`·`resolve2dCore` "
        + "변경이 그 원장을 **한 자리도 안 움직인다** — 그 부동이 '안전'으로 읽혔다. "
        + "이 원장이 그 구간을 덮는다. ⚠ 그래도 **전수는 아니다**: 아래 what_this_does_not_say 참조.",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, orders: ORDERS,
        lattice_k: 1,
        p1_f_ratio: P1_F_RATIO,
        path: "drawEdges → resolve2dCore(확정 전) → representative → stepRule(물음은 참 축 오라클) "
          + "→ vpsOf → recoverCamera → liftAll → perStrokeError",
        metric: "`metrics.perStrokeError` — `camera_gate`와 **같은 정의**(게이지 적합 뒤 대각 대비 오차)",
        arms: {
          rule_drawn: "축을 번갈아 긋는 순서. **순서 오라클 없음 — 판정 팔이다**",
          rule_grouped: "축별로 몰아 긋는 순서. ⚠ 참 축 라벨을 쓰는 **순서 오라클**",
          rule_wide_pair: "첫 축의 각차가 가장 큰 두 선을 먼저. ⚠ 순서 오라클이고 "
            + "**이 경로가 얼마나 잘할 수 있는가**의 팔이다(#35 도달 가능성)",
          rule_drawn_no_ortho_force:
            "**반사실 진단 팔**(#39) — `rule_drawn`과 모든 것이 같고 **화면 직교 스냅이 축을 "
            + "선언하지 않는 것**만 다르다. 앱은 선언한다(`mainL`의 `snapForced`)이고, 그 선언이 "
            + "`stepRule`의 P1 가드(`forced !== screen`일 때만 묻는다)를 **우회한다**. "
            + "이 팔과 `rule_drawn`의 차이가 **그 우회의 몫**이다. ⚠ 앱 동작점이 아니다.",
          truth_vps: "참 소실점 → 같은 `recoverCamera`·같은 `liftAll`. **대역**이다(#27). "
            + "카메라 오차가 0이므로 **도달 가능성 수치로 쓰지 않는다**(#5·#40 ①)",
        },
        ask_policy: "스냅이 방향을 선언한 획은 안 묻고, 남는 물음에는 **참 축으로 답했다**(오라클). "
          + "`asks_per_scene`이 사람이 개입해야 하는 횟수이고 그것이 이 경로의 비용이다.",
      },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**측정 결과: 어느 팔도 통과선 근처에 없다.** 도달 가능성 팔로 등록한 것은 "
          + "`rule_wide_pair`(첫 축의 각차가 가장 큰 두 선을 먼저 긋는 사용자 — 이 경로가 "
          + "*얼마나 잘할 수 있는가*)이고 `reachability_value`가 그 값이다. 그 값은 통과선의 "
          + "**네 배가 넘는다** — 순서를 최적으로 골라도 못 넘는다. 세 규칙 팔의 형태 중앙은 "
          + "`headline`에서 그 자리에 읽는다(셋 다 같은 등급이다). "
          + "**`truth_vps`를 여기 적지 않는다** — 그 팔은 대역의 출처 자체라 비가 정의상 1.0이고, "
          + "그것을 적으면 항등을 적고도 검사를 통과한다(#40 ①, `camera_gate` 초판이 그랬다). "
          + "⚠ **기준을 낮추지 않는다**(#26의 반대편 문) — 못 넘는다는 사실을 적기만 한다. "
          + "⚠ 사람이 `wide_pair` 순서로 긋는다는 것도 측정하지 않았다(#2 순서 오라클). "
          + "즉 이 게이트는 *신호의 성질*로 실패했고 *기준의 성질*로 실패한 것이 아니다 — "
          + "대역(`truth_vps`)이 **같은 픽스처·같은 배치**에서 통과선 안을 내므로 경로가 문제다.",
        reachability_value: +(report(all.rule_wide_pair).shape_err_median.median ?? 0).toFixed(4),
        reachability_source: "headline/rule_wide_pair/shape_err_median/median",
        result: {
          judged_arm: "rule_drawn",
          band_arm: "truth_vps",
          cut_0_2: { band: cutBand, value: cutVal, pass_line: cutLine, mult: CUT_MULT },
          shape_median: { band: shpBand, value: shpVal, pass_line: shpLine, mult: SHAPE_MULT },
          passed,
          by_composition: byCompVerdict,
        },
        status: "**살아 있다 — 그리고 첫 실행에서 실패했다.** CLAUDE.md §2 중단 조건의 "
          + "**사정거리 확장분**이고 같은 배수를 쓴다(대역만 이 하네스 것이므로 `camera_gate`의 "
          + "통과/실패와 같은 수가 아니다 — #41: 같은 말로 부르지 않는다). "
          + "**실패했으므로 멈추고 보고했다**(#41: 판정과 행동을 어긋나게 두지 않는다). "
          + "기전은 `mechanism`에 있다 — 차수가 P1에 갇힌다.",
        mechanism:
          "**차수가 P1에 갇힌다.** `rule_drawn` 300실행의 차수 분포는 P1 243 · P2 24 · P3 33이고, "
          + "3점 구도에서도 P1이 40~47/60이다(`by_composition`의 `perspective_order_hist`). "
          + "P1은 **불가역**이므로(D-L53, 2026-08-17 지시 1) 한 획이 그림 전체를 1점에 가둔다 — "
          + "그 뒤의 카메라는 3점 장면을 1점 렌즈로 푼 것이고 축 방향 오차 중앙이 그만큼 커진다. "
          + "그것이 조용히 틀림·형태 중앙의 출처다(값은 `result`를 그 자리에서 읽는다). "
          + "⚠ **반사실이 원인을 좁혔다**(`rule_drawn_no_ortho_force`): 화면 직교 스냅의 "
          + "`forced=screen`이 `stepRule`의 P1 가드(`forced !== screen`일 때만 묻는다)를 "
          + "우회하는데, **그 우회만 끄면 P1이 243 → 181로 줄고 축 오차 중앙이 내려간다.** "
          + "그러나 **배치는 안 낫는다**(조용히 틀림·형태가 통과선 밖 그대로 — 두 팔을 "
          + "`headline`에서 나란히 읽는다). 즉 그 우회는 **기여이지 지배항이 아니다.** "
          + "남는 몫은 규칙이 소실점을 깊이선 두 개의 교점으로 푸는 것 자체의 조건수다 — "
          + "`rule_camera`가 이미 축 오차 중앙 31.6°로 적고 있었는데 **그 원장에 배치 귀결이 "
          + "없어서** 이 크기가 안 보였다(그것이 이 하네스가 생긴 이유다, #43).",
        note: "⚠ 이 게이트가 **통과해도** `camera_gate`의 상태는 안 바뀐다(별개의 두 구간이다).",
      }),
      headline: {
        note: "**5구도 · 5잡음 · 2등급 · 6시드 합산.** 잡음 0 행도 넣었다 — 이 경로는 잡음 0에서도 "
          + "항등이 아니다(등급 잉크 잡음이 남고, 규칙이 고르는 짝이 순서에 달렸다).",
        ...head,
      },
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, report(b)]))])),
      by_jitter: Object.fromEntries(Object.entries(byJitter).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, report(b)]))])),
      // **selfcheck 의심 플래그의 원인**(CLAUDE §5: 의심≠오류 — 각 플래그의 원인을 확인한다)
      selfcheck_flag_origins: {
        "truth_vps.axis_dir_err_deg = 0 (분포 전체)":
          "**보장이다**(#5). 참 소실점을 넣었으므로 복원 축 방향이 참 축과 같다 — 측정이 아니다. "
          + "그래서 이 팔은 **대역**으로만 쓰고 `reachability_value`에는 안 적는다(#40 ①).",
        "truth_vps.camera_ok.rate = 1 / placement.rate = 1":
          "**보장에 가깝다** — 참 소실점은 항상 유효한 카메라를 내고(예각 조건 만족) 배치도 거의 "
          + "다 붙는다. 대역이 대역답다는 확인이지 성능 주장이 아니다.",
        "rule_* .silent_wrong.cut_*.rate = 1 (여러 구도)":
          "**측정이다 — 그리고 이 게이트가 실패한 이유 그 자체다.** 3점 구도에서 규칙이 P1에 "
          + "갇히면 배치가 **전부** 절단을 넘는다. 1.0이 자명해서가 아니라 **정말로 전부 틀려서**다 "
          + "(같은 픽스처의 `truth_vps`가 같은 자리에서 1.0이 아닌 것이 그 대조다).",
        "rule_drawn_no_ortho_force.perspective_order_hist.p0 = 0":
          "**정상이다.** p0(카메라 미확정)은 이 픽스처에서 안 난다 — 상자 열두 모서리면 규칙이 "
          + "적어도 1차수는 세운다. 0인 것은 집계 미작동이 아니라 그 사건이 없다는 뜻이고, "
          + "**같은 히스토그램의 p1/p2/p3가 0이 아닌 것**이 집계가 도는 증거다(#38).",
        "how.p1_f_ratio = 1":
          "**상수다**(`camState.P1_F_RATIO` = 1.0 → 화각 약 53°). 1점 투시의 f는 임의값이고"
          + "(D-L53) 이 값은 앱과 같은 기본 렌즈다 — 비율 지표가 아니다.",
      },
      what_this_does_not_say: [
        "**스냅이 획 좌표를 옮긴 효과는 안 잰다.** 두 팔이 같은 원시 `pts2d`를 올리므로 차이가 카메라 하나로 좁혀진다 — 그것이 이 게이트가 재려는 양이지만, 앱에서는 스냅된 좌표가 문서에 남는다(그 몫은 `rule_camera`의 위약 팔과 다음 실획 표본이 본다)",
        "**축 라벨은 참값이다** — 검출·판정의 오배정은 안 섞었다(카메라 경로만 보려는 것). 오배정은 `misassign`·`lift_gate`가 본다",
        "**물음에 참 축으로 답했다**(오라클). 사람이 틀리게 답하는 경우는 이 원장 밖이다 — `asks_per_scene`이 그 노출량이다",
        "**사람이 `wide_pair` 순서로 긋는다는 것은 측정하지 않았다**(#2 — 도달 가능성 팔은 순서 오라클이다). 실획 표본 0이 그대로다(AS-C1)",
        "**`camera_gate`의 통과/실패와 같은 수가 아니다** — 대역이 다른 팔이고 경로가 다르다. 두 게이트를 합산해 하나의 '통과'로 읽지 않는다(#41)",
        "**여전히 전수가 아니다**: 이 원장도 `liftAll` 뒤의 UI 경로(뷰 복원·궤도 렌즈·3D 오스냅)는 안 지난다. 그쪽 변경은 이 원장도 안 움직인다 — 부동을 안전으로 읽지 않는다(#43)",
      ],
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "rule_gate.json"), JSON.stringify(doc, null, 2));

    // **덮는 대상 0을 통과로 읽지 않는다**(#38) — 원장이 실제로 무언가를 쟀는가
    expect(fixtures).toBeGreaterThan(0);
    expect(head.rule_drawn.scenes).toBeGreaterThan(0);
    expect(head.truth_vps.placement.k).toBeGreaterThan(0);
  }, 900_000);
});
