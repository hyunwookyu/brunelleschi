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
  /**
   * **절단 *안*에 든 획의 절대수**(`n − k`) — 리뷰 [3]·PITFALLS #14·#16.
   *
   * 비율만 내면 **분모가 다른 두 팔**을 견줄 수 없다(#11). 팔이 획을 더 놓으면서 틀린 것만
   * 늘리면 비율은 조금 오르는데 그것이 "거의 같다"로 읽힌다 — **#16이 정확히 그 함정이다**
   * (병목이 옮겨간 것을 없어진 것으로 읽는 것). **옳게 놓인 획의 절대수**는 그 혼동이 없다.
   *
   * ⚠ **파생값이다**(#10 — 리뷰어 [R10]): `placed − wrong`이지 직접 센 집합이 아니다.
   * 결론이 이 절대수 하나에 걸릴 때는 그 사실을 함께 읽는다.
   */
  inside_cut: { le_0_1: b.placed - b.wrong10, le_0_2: b.placed - b.wrong20,
                le_0_5: b.placed - b.wrong50, placed: b.placed },
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
    /** **시드별**(#14 — 시드 폭을 안 재면 팔 간 차이가 그 폭 안인지 모른다. 리뷰 [3]). */
    const bySeed: Record<string, Record<string, Bag>> = {};
    /** **1pt 구도를 뺀 층**(#5·#34 — 그 구도의 축 오차는 구성 항등이다. 리뷰 [8]). */
    const noIdentity = newArms();
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
          const sk = `seed_${seed}`;
          bySeed[sk] ??= newArms();
          const isIdentityComp = COMPOSITIONS[ci].name.startsWith("1pt");
          const into = (arm: string) => [all[arm], byComp[ck][arm], byJitter[jk][arm],
                                         bySeed[sk][arm],
                                         ...(isIdentityComp ? [] : [noIdentity[arm]])];

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
          rule_wide_pair: "첫 축의 각차가 가장 큰 두 선을 먼저. ⚠ 순서 오라클이다. "
            + "⚠ 초판이 이 팔을 '얼마나 잘할 수 있는가'라 불렀는데 **틀렸다** — 형태에서 "
            + "세 팔 중 가장 나쁘다(리뷰어 [11]). 도달 가능성 팔은 `rule_grouped`다",
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
          "**측정 결과: 어느 팔도 통과선 근처에 없다.** 도달 가능성 팔은 **`rule_grouped`**이고 "
          + "(세 규칙 팔 중 형태가 가장 좋다 — 초판이 `rule_wide_pair`를 그렇게 불렀는데 같은 표에 "
          + "더 좋은 팔이 있었다, 리뷰어 [11]) `reachability_value`가 그 값이다: 형태는 통과선의 "
          + "**3.4배**, 조용히 틀림은 **2.1배** 밖이다(#28 — 못 고르면 둘 다 적는다). "
          + "⚠ **'최선 팔'은 표와 지표에 따라 바뀐다**(리뷰어 [R5]): 1점 구도를 뺀 층에서는 형태 "
          + "순위가 뒤집혀 `rule_drawn`(1.9826) < `rule_grouped`(2.0399)다. 그런데 `population_caveat`·"
          + "`one_point_band_caveat`이 바로 그 1점 포함 표를 대표값으로 쓰지 말라고 한다 — "
          + "**즉 이 팔 선정은 유보가 경고한 표 위에 있다.** 어느 팔을 골라도 통과선 밖이라 판정은 "
          + "안 바뀌고, 바뀌는 것은 '얼마나 잘할 수 있는가'의 수다. "
          + "**`truth_vps`를 여기 적지 않는다** — 대역의 출처 자체라 비가 정의상 1.0이고 그것을 "
          + "적으면 항등을 적고도 검사를 통과한다(#40 ①, `camera_gate` 초판이 그랬다). "
          + "⚠ **기준을 낮추지 않는다**(#26의 반대편 문) — 못 넘는다는 사실을 적기만 한다. "
          + "⚠ 사람이 그 순서로 긋는다는 것도 측정하지 않았다(#2 순서 오라클). "
          + "⚠⚠ **그러므로 '신호의 성질인가 기준의 성질인가'는 갈리지 않는다**(#35 그대로). "
          + "초판은 '신호의 성질이고 기준의 성질이 아니다'라 단정했는데 **그 근거가 항등이었다** "
          + "— 대역 팔이 통과선 안이라는 것은 1.0 ≤ 1.1이고 대역은 그 팔 자신이다(리뷰어 [1]). "
          + "**비오라클 팔이 통과선 안으로 들어올 수 있다는 것은 안 보였다.** 그 상태를 적는 것이 "
          + "#35가 요구하는 전부이고 **기준은 그대로 둔다.** "
          + "⚠ 중단의 근거는 도달 가능성이 아니라 **등록문**이다(#26 — 측정 전에 박은 기준).",
        reachability_value: [
          +(report(all.rule_grouped).shape_err_median.median ?? 0).toFixed(4),
          report(all.rule_grouped).silent_wrong.cut_0_2.rate ?? 0,
        ],
        // ⚠ 두 지표를 적으므로 출처도 **그 둘을 담은 자리**를 가리켜야 값 대조가 선다(#33).
        // 한 지표의 경로를 가리키면 selfcheck가 "적은 값 ≠ 원장"으로 잡는다(실제로 잡혔다).
        reachability_source: "reachability_arm_values",
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
          + "⚠ **판정의 크기는 모집단 혼합에 민감하다** — `population_caveat`을 함께 읽는다.",
        population_caveat:
          "**두 팔의 모집단 가중이 다르다**(리뷰어 [4] · #40 누수 ③ · #11). 판정 팔의 조용히 틀림 "
          + "분모(= 놓인 획)는 구도별로 27 / 9 / 30 / 236 / 630이라 **1점 구도가 67.6%**이고 "
          + "1점+2점이 93%다. 대역 팔은 619 / 530 / 643 / 717 / 707로 고르다. 규칙 팔이 3점 구도에서 "
          + "**획을 거의 못 놓기 때문**(P1에 갇히면 연결 성분이 잘게 부서지고 그 분모가 최대 연결 "
          + "성분이다, #9·#10)이고, 그래서 표제 합산은 주로 1점·2점 구도의 수다. "
          + "⇒ **표제 배수(형태 9.4배 · 조용히 틀림 2.4배)를 경로 전체의 대표값으로 읽지 않는다.** "
          + "\n\n"
          + "⚠⚠ **그 유보를 적용하면 판정이 물러지는 것이 아니라 세진다**(리뷰어 [R6]이 초판의 "
          + "누락을 잡았다 — 표를 만들어 놓고 그 수를 안 냈다). `headline_no_identity`(1점 구도 "
          + "제외 = ⓐ의 쏠림과 ⓑ의 임의 f 대역을 **동시에** 뺀 층)에서 같은 비를 내면: "
          + "**조용히 틀림 1.0 대 대역 0.269 → 3.7배**(통과선 0.2959) · "
          + "**형태 중앙 1.9826 대 0.1018 → 19.5배**(통과선 0.2138). 표제의 2.4배·9.4배보다 크다. "
          + "그리고 작은 분모 걱정(27·9·30)도 이 층에서 **합산 302획**으로 해소된다 — "
          + "**3점·2점 네 구도를 통틀어 판정 팔이 절단 0.2 안에 놓은 획이 0개다.** "
          + "⇒ 판정은 안 바뀌고, 유보는 **크기를 다시 재게 할 뿐 결론을 무르게 하지 않는다.** "
          + "⚠ 배치율 자체(`placement.of_all` 0.2589 대 0.8933)는 **등록 지표가 아니다** — "
          + "등록 뒤에 지표를 늘리지 않는다(#28). 다음 판에서 등록할 자리다.",
        one_point_band_caveat:
          "**1점 구도의 대역이 참 소실점의 성능이 아니다**(리뷰어 [5] · #34 승계 누락). "
          + "그 구도 `truth_vps`의 형태 중앙은 **0.3515**로 다른 네 구도(0.0503·0.0539·0.1069·0.1421)의 "
          + "2.5~7배다. 소실점이 하나면 f가 자유도로 남아 **임의값**을 넣는데(D-L53 · P1_F_RATIO) "
          + "참 f는 1000px, 임의 f는 960px이라 **깊이 배율이 4% 어긋난다.** `rule_camera`는 자기 "
          + "지표(축 방향)가 f에 무관하다며 그 어긋남을 면책했는데(`how.why_lens`), **이 원장의 "
          + "지표(형태 오차)는 바로 그 깊이 배율에 반응하므로 면책이 승계되지 않는다.** "
          + "⇒ 그 칸의 통과선 0.7381은 참 카메라의 성능이 아니라 **임의 f의 값**이고, "
          + "원장에서 유일하게 `passed: true`인 그 칸을 **'선 안'의 증거로 세지 않는다.**",
        mechanism:
          "**차수가 P1에 갇힌다.** 판정 팔 300실행의 차수 분포는 P1 243 · P2 24 · P3 33이고 "
          + "3점 구도에서도 P1이 40~47/60이다. P1은 **불가역**이므로(D-L53) 한 획이 그림 전체를 "
          + "1점에 가둔다. **잡음의 산물이 아니다**: 가장 깨끗한 층(`by_jitter.jit_0`)에서 판정 팔의 "
          + "차수는 **P1 60/60**이고 조용히 틀림이 146/184다. "
          + "⚠ **P1 잠김 자체는 이번의 발견이 아니다**(리뷰어 [9]) — `rule_camera.json`이 전 팔에 "
          + "`order_median: 1`을 적고 있었고 AS-L24·AS-L25가 축 오차 열화를 반증으로 등재해 뒀다. "
          + "**새로 보인 것은 둘이다**: (가) 그 잠김의 **배치·형태 귀결**의 크기, (나) 화면 직교 "
          + "스냅이 P1 가드를 우회한다는 **지목**. "
          + "\n\n"
          + "**개입이 닿는 층에서 판정 팔은 바닥이다**(`headline_no_identity` = 1점 구도 제외 — "
          + "1점 구도에서는 애초에 모든 획이 P1이라 직교 스냅의 우회가 **발동할 여지가 없다**). "
          + "그 층에서 판정 팔은 **302획을 놓고 절단 0.2 안에 0개, 절단 0.1 안에 0개**다 — "
          + "조용히 틀림 비율이 **정확히 1.0**이다. 대역은 같은 층에서 0.269 · 형태 0.1018이다. "
          + "\n\n"
          + "**반사실(`rule_drawn_no_ortho_force`)이 실제로 보인 것 — 그리고 못 보인 것.** "
          + "화면 직교 스냅의 `forced=screen`이 `stepRule`의 P1 가드(`forced !== screen`일 때만 "
          + "묻는다)를 우회한다. 끄면 P1 243 → 181 · P3 33 → 75로 **차수는 풀린다.** "
          + "⚠⚠ **그러나 배치 개선 여부는 이 원장이 판정할 수 없다**(리뷰어 [R2]가 잡았다 — "
          + "**초판과 그 정정판이 둘 다 틀렸다**): 표제에서 절단 0.2 안이 85 → 85로 불변인 것은 "
          + "**그 85가 전부 1점 구도의 것**이고 그 구도에서 두 팔은 **같은 실행**이기 때문이다"
          + "(1pt 칸의 두 팔은 placed 630/639 · inside 44/85/419 · 차수 P1 60/60까지 전부 같고 "
          + "다른 것은 `asks_per_scene` 1.667 대 1.683뿐이다). 개입이 닿는 네 구도에서는 "
          + "**두 팔 다 0**이다(0/302 대 0/545) — **0에서는 개선이 관측될 수 없다**(#31·#32: "
          + "무결론이 현상인지 설계의 산물인지 먼저 본다 / 미실행을 반증으로 읽지 않는다). "
          + "그러므로 초판의 '기여이지 지배항이 아니다'도, 그 정정판의 '기여가 아니라 재분배다"
          + "(기여 0)'도 **근거가 없다.** 둘 다 철회한다. "
          + "\n\n"
          + "**절단을 바꾸면 신호가 있다**(#13 — 절단값이 결론을 정하면 그 결론은 없다): "
          + "같은 층에서 절단 **0.5** 안은 **1 → 3**, 형태 중앙은 **1.9826 → 1.6092**(19% 개선)로 "
          + "**개선 방향**이다. ⚠ 다만 그 비교의 장면 집합이 다르다(n 73 대 108) — 반사실이 "
          + "카메라를 더 세우므로 모집단이 함께 커진다(#11). **그래서 크기를 주장하지 않는다.** "
          + "⇒ 현재 말할 수 있는 것: **그 우회를 없애면 차수는 풀리고, 배치가 나아지는지는 "
          + "이 하네스로 안 갈린다.** 가르려면 짝지은 부분집합(두 팔 다 카메라가 선 픽스처)과 "
          + "위약 팔이 필요하다 — DEFERRED에 등재했다. "
          + "\n\n"
          + "축 오차는 **1pt를 뺀 층에서 읽는다**(리뷰어 [8]): 판정 팔 **35** → 반사실 **31.61**. "
          + "표제의 35 → 24.87은 1점 구도의 **구성 항등 0**이 섞인 값이라 감소폭이 부풀려져 "
          + "있었다. 분포도 연속이 아니라 구도 yaw에 뭉친 **범주**(35 / 37.70 / 40.66 / 31.61)이므로 "
          + "'중앙이 내려간다'는 크기의 감소가 아니라 **범주 비율의 이동**이다.",
        which_table:
          "**어느 수를 어느 표에서 읽는가**(리뷰어 [R11] — 규칙이 흩어져 있어 한 줄로 모은다). "
          + "**판정** = `headline`(5구도 합산 — 등록문 그대로. 등록 뒤에 모집단을 안 바꾼다, #28). "
          + "**축 오차** = `headline_no_identity`(1점 구도의 구성 항등 0을 빼야 한다, #5·#34). "
          + "**배수를 인용할 때** = **둘 다 병기**한다(표제 2.4×·9.4× / 1점 제외 3.7×·19.5× — "
          + "`population_caveat`). **개입(반사실) 효과** = `headline_no_identity`에서만 본다 "
          + "(1점 구도에서는 두 팔이 같은 실행이라 개입이 발동하지 않는다, `mechanism`). "
          + "**시드 폭** = `by_seed`.",
        note: "⚠ 이 게이트가 **통과해도** `camera_gate`의 상태는 안 바뀐다(별개의 두 구간이다).",
      }),
      headline: {
        note: "**5구도 · 5잡음 · 2등급 · 6시드 합산.** 잡음 0 행도 넣었다 — 이 경로는 잡음 0에서도 "
          + "항등이 아니다(등급 잉크 잡음이 남고, 규칙이 고르는 짝이 순서에 달렸다).",
        ...head,
      },
      // **1pt 구도를 뺀 층**(리뷰 [8] · #5·#34) — 그 구도의 유일한 유한 소실점이 주점 자리라
      // 축 방향이 f와 무관하게 광축이 되고 **어떤 오차를 넣어도 0**이다(rule_camera가 같은 이유로
      // 표제를 갈랐다: `headline_no_identity`). 그 항등이 표제 축 오차를 공짜로 낮춘다.
      // ⚠ **판정 지표(조용히 틀림·형태)는 표제 합산 그대로다**(#28 — 등록 뒤에 모집단을 안 바꾼다).
      // 이 표는 **축 오차를 읽을 때** 쓴다.
      headline_no_identity: {
        note: "`1pt_yaw0_pitch0`를 뺐다. **축 오차(`axis_dir_err_deg`)를 인용할 때는 이 표를 쓴다** "
          + "— 표제 표의 축 오차에는 그 구도의 구성 항등 0이 섞여 있다. 판정은 등록문대로 "
          + "표제(5구도 합산)가 한다.",
        ...Object.fromEntries(Object.entries(noIdentity).map(([k, v]) => [k, report(v)])),
      },
      by_seed: {
        note: "**시드 폭**(#14) — 팔 간 차이가 이 폭 안인지 밖인지 여기서 읽는다. "
          + "유효 자릿수는 2자리다(CLAUDE §5).",
        ...Object.fromEntries(Object.entries(bySeed).map(([k, v]) =>
          [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, report(b)]))])),
      },
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, report(b)]))])),
      by_jitter: Object.fromEntries(Object.entries(byJitter).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, report(b)]))])),
      // **대역이 대역인지 남의 하네스로 확인한다** — #27은 "대역을 남에게서 가져오지 말라"이지
      // "남과 대조하지 말라"가 아니다. 가져오면 픽스처가 다를 수 있고, **대조**는 그 반대다.
      cross_check_vs_camera_gate: {
        what: "이 원장의 `truth_vps` 팔은 `camera_gate.json`의 "
          + "`by_axis_err_all_compositions.deg_0`(축 오차 0 = 참 소실점, 5구도 합산)과 "
          + "**같은 것을 재는 팔**이다. "
          + "⚠ **'독립으로 세운 픽스처'가 아니다**(리뷰어 [16]이 잡았다 — 초판의 표현을 철회한다): "
          + "두 하네스는 같은 5구도·같은 5잡음·같은 2등급·같은 6시드 식에서 획을 만들고 같은 "
          + "`recoverCamera`·`liftAll`을 부른다. 그러므로 값이 겹치는 것은 **독립 확인이 아니라 "
          + "배선 확인**이다 — 이 하네스의 `liftWith`가 `camera_gate`의 오라클 행과 같은 양을 "
          + "재고 있다는 것까지가 이 대조가 말하는 전부다.",
        rule_gate_truth_vps: {
          silent_wrong_cut_0_2: band?.silent_wrong.cut_0_2 ?? null,
          shape_err_median: shpBand,
          camera_ok: band?.camera_ok ?? null,
        },
        camera_gate_deg_0_all_compositions: {
          note: "그 원장을 그 자리에서 읽는다(여기 옮겨 적으면 재실행마다 낡는다 — #1). "
            + "경로: `camera_gate.json` → `by_axis_err_all_compositions` → `deg_0`.",
        },
        reading:
          "**겹친다**(두 값은 각 원장을 그 자리에서 읽는다 — 여기 옮겨 적으면 재실행마다 낡는다, "
          + "#1. 초판이 바로 이 자리에 값을 옮겨 적었고 리뷰어 [16]이 잡았다). "
          + "남는 미세 차의 출처는 **f를 주는 방식** 하나다 — "
          + "`camera_gate`는 모든 실행에 참 f(`fSetting: sc.f`)를 주고, 이 하네스는 앱과 같이 "
          + "**소실점이 하나일 때만** 임의 f를 준다(D-L53). "
          + "⚠ **이 대조가 정리하는 것과 정리하지 못하는 것**을 가른다. "
          + "**정리하는 것**: 통과선이 0 위에 얹힌 것이 아니다 — `truth_vps`의 조용히 틀림은 0이 "
          + "아니라 0.379이고 형태 중앙도 0이 아니다(0인 것은 `axis_dir_err_deg` 하나뿐이고 그것은 "
          + "판정 지표가 아니다). **참 카메라로도 이만큼 틀린다**는 실측이다. "
          + "**정리하지 못하는 것**: 그렇다고 **비오라클 팔이 1.1×·2.1× 안에 들어올 수 있다**는 것이 "
          + "보이지는 않는다 — 그 자리를 메울 팔은 `reachability`가 다루고, 거기서 #35대로 "
          + "**갈리지 않는다**로 남겼다.",
      },
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
        "by_composition.1pt_yaw0_pitch0.rule_*.axis_dir_err_deg = 0 (분포 전체, 세 팔)":
          "**구성 항등이다**(#5 — 리뷰어 [7]이 초판의 누락을 잡았다). 1점 구도의 유일한 유한 "
          + "소실점은 **주점 자리**이고, 소실점이 하나면 `recoverCamera`가 주점을 그 소실점으로 "
          + "잡는다(이론서 5.3). 그러면 `axisDirection(vp, vp, f) = (0,0,1)`이라 **f와 무관하게 "
          + "광축**이고 그 구도의 참 깊이축이 정확히 (0,0,1)이다 — **어떤 오차를 넣어도 0**이다. "
          + "`rule_camera`가 같은 이유로 표제를 갈랐고(`headline_no_identity`), 이 원장도 "
          + "**같은 이름의 표를 낸다**(#34 승계). 축 오차는 그 표에서 읽는다.",
        "by_composition.*.rule_grouped|rule_wide_pair.placement.rate = 1":
          "**선택 효과다 — 성능이 아니다.** 그 비의 분모는 `liftAll`의 **최대 연결 성분**이고, "
          + "규칙이 P1에 갇히면 성분이 잘게 부서져 **분모가 함께 작아진다**(3점 구도에서 판정 팔의 "
          + "분모가 9~30까지 내려간다). 작은 성분은 다 붙으므로 1.0이 나온다 — "
          + "**같이 읽어야 하는 것은 `placement.of_all`**(전체 획 대비)이고 그 값은 1이 아니다. "
          + "`camera_gate`의 은퇴한 target이 같은 이유로 최대 성분 분모를 버렸다(#27 · #10).",
        "by_composition.2pt_yaw35_pitch0.rule_drawn_no_ortho_force.perspective_order_hist.p3 = 0":
          "**정상이다.** 2점 구도는 수직축이 화면 평행(무한원)이라 P3가 **원리상 안 난다** — "
          + "P3는 기울어진 세로 모서리를 수직축이라 답할 때만 열린다(D-L53의 남는 승격 하나). "
          + "같은 구도 같은 팔의 p1·p2가 0이 아닌 것이 집계가 도는 증거다(#38).",
        "rule_gate.json:*.inside_cut.le_0_* = 0 (17건)":
          "**집계 미작동이 아니라 이 게이트가 실패한 이유 그 자체다**(리뷰어 [R7] — [7]에서 고친 "
          + "것과 같은 자리에서 같은 형태로 재발했다). `inside_cut`은 **절단 안에 든 획의 수**이고, "
          + "3점·2점 구도에서 판정 팔이 놓은 획은 **전부 절단 밖**이라 0이 나온다(0/302). "
          + "**같은 셀의 `placed`가 0이 아닌 것**이 집계가 도는 증거다(#38). "
          + "⚠ 같은 0인데 팔에 따라 플래그가 나기도 안 나기도 한다(리뷰어 [R8]) — 그 비대칭의 "
          + "규칙은 확인 안 했다. **플래그 없음을 '그 값이 0이 아님'으로 읽지 않는다**(#32·#38).",
        "how.p1_f_ratio = 1":
          "**상수다**(`camState.P1_F_RATIO` = 1.0 → 화각 약 53°). 1점 투시의 f는 임의값이고"
          + "(D-L53) 이 값은 앱과 같은 기본 렌즈다 — 비율 지표가 아니다.",
      },
      // **위약 팔이 없는 사유**(#39의 나머지 절반 — 리뷰어 [10])
      why_no_placebo:
        "`rule_camera`에는 `*_placebo` 팔이 있는데 이 원장에는 없다. 사유: **#39의 위약은 "
        + "'좋아졌다'를 방어하는 대조**다(같은 크기의 무의미한 개입도 같은 개선을 내는가). "
        + "여기서 반사실이 낸 결론은 **좋아지지 않았다**는 null이고, null에는 위약이 필요 없다 — "
        + "오히려 강한 형태로 나왔다(`inside_cut`이 시드 여섯 전부에서 **정확히 불변**). "
        + "⚠ **그래도 안 재진 것이 하나 있다**: 반사실이 물음을 늘리고(2.4 → 2.807) 배치 집합을 "
        + "키우는데(1021 → 1342), 그 변화가 **그 우회 특유의 것인지 '선언을 하나 덜 하는 것 일반'의 "
        + "것인지**는 안 갈랐다. 그것을 가르려면 '같은 빈도로 아무 선언이나 하나 덜 하는' 위약 팔이 "
        + "필요하다 — DEFERRED에 등재했다. 지금 결론(배치 정확도 기여 0)은 그 팔 없이도 선다.",
      what_this_does_not_say: [
        "**스냅이 획 좌표를 옮긴 효과는 안 잰다.** 두 팔이 같은 원시 `pts2d`를 올리므로 차이가 카메라 하나로 좁혀진다 — 그것이 이 게이트가 재려는 양이지만, 앱에서는 스냅된 좌표가 문서에 남는다(그 몫은 `rule_camera`의 위약 팔과 다음 실획 표본이 본다)",
        "**축 라벨은 참값이다** — 검출·판정의 오배정은 안 섞었다(카메라 경로만 보려는 것). 오배정은 `misassign`·`lift_gate`가 본다",
        "**물음에 참 축으로 답했다**(오라클). 사람이 틀리게 답하는 경우는 이 원장 밖이다 — `asks_per_scene`이 그 노출량이다",
        "**사람이 `grouped` 순서(축별로 몰아 긋기)로 긋는다는 것은 측정하지 않았다**(#2 — 도달 가능성 팔이 순서 오라클이다). 실획 표본 0이 그대로다(AS-C1)",
        "**`camera_gate`의 통과/실패와 같은 수가 아니다** — 대역이 다른 팔이고 경로가 다르다. 두 게이트를 합산해 하나의 '통과'로 읽지 않는다(#41)",
        "**여전히 전수가 아니다**: 이 원장도 `liftAll` 뒤의 UI 경로(뷰 복원·궤도 렌즈·3D 오스냅)는 안 지난다. 그쪽 변경은 이 원장도 안 움직인다 — 부동을 안전으로 읽지 않는다(#43)",
        "**'신호의 성질이냐 기준의 성질이냐'가 안 갈렸다**(#35 — 리뷰어 [1]). 비오라클 팔이 통과선 안으로 들어올 수 있다는 것은 안 보였고, 그 상태를 적기만 했다. 기준은 안 낮췄다",
        "**표제 배수는 모집단 혼합의 산물이다**(gate.population_caveat) — 판정 팔의 조용히 틀림 분모는 1점 구도가 67.6%다. 배수를 경로 전체의 대표값으로 인용하지 않는다",
        "**등급(precise/medium) 분해가 없다**(#12의 남는 축) — 잡음·구도·순서·시드는 갈렸는데 등급은 안 갈랐다",
        "**배치율(`placement.of_all` 0.2589 대 0.8933)은 등록 지표가 아니다**(#28 — 등록 뒤에 지표를 늘리지 않는다). 다음 판에서 등록할 자리이고, 지금은 관측으로만 읽는다",
      ],
      /** `gate.reachability_value`의 출처 — **두 지표**를 그대로 담는다(#28·#33). */
      reachability_arm_values: [
        +(report(all.rule_grouped).shape_err_median.median ?? 0).toFixed(4),
        report(all.rule_grouped).silent_wrong.cut_0_2.rate ?? 0,
      ],
      reachability_arm_note:
        "위 배열은 [형태 오차 중앙, 조용히 틀림(cut 0.2)]이고 팔은 **`rule_grouped`** — "
        + "세 규칙 팔 중 **형태가 가장 좋은 팔**이다(초판은 `rule_wide_pair`를 '얼마나 잘할 수 "
        + "있는가'라 불렀는데 같은 표에 더 좋은 팔이 있었다, 리뷰어 [11]). "
        + "⚠ **상한이라 부르지 않는다**(#35) — 한 대리 순서(참 축 라벨로 축별 몰아 긋기)의 "
        + "성능이지 도달 가능성의 증명이 아니다. 통과선은 `gate.result`에서 읽는다. "
        + "⚠ **이 배열은 `headline`의 두 자리를 옮겨 적은 복사본이다**(리뷰어 [R4]): "
        + "`gate.reachability_source`가 이 자리를 가리키므로 자동 값 대조는 "
        + "**복사본과 복사본의 비교**가 되고 #40 ③이 검사하려던 관계(적은 값이 원장의 측정 자리에 "
        + "실제로 있는가)가 사라진다. 두 지표를 적으려면 출처가 그 둘을 담은 한 자리여야 하는데 "
        + "`_resolve`가 한 경로만 받기 때문이고, **사람이 대조할 자리를 여기 적어 둔다**: "
        + "`headline/rule_grouped/shape_err_median/median` · "
        + "`headline/rule_grouped/silent_wrong/cut_0_2/rate`. "
        + "⚠ **팔 순위는 표에 따라 뒤집힌다**(리뷰어 [R5]) — 1점 구도를 뺀 층에서는 형태가 "
        + "`rule_drawn`(1.9826) < `rule_grouped`(2.0399)이고, 절단 0.2 안 절대수로는 다시 "
        + "`rule_grouped`(30) > `rule_drawn`(0)이다. 지표와 표를 붙여 말한다.",
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
