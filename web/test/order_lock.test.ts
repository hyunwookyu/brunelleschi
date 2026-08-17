// **차수가 P1에 갇히는가 — 그리고 그것이 배치에 무엇을 하는가**(2026-08-18 7차 지시 1).
// 산출: `stage0/out/order_lock.json`.
//
// ## 왜 새 하네스인가 — 구멍이 정확히 이 크기였다
//
// `rule_camera`는 **축 방향 오차**를 적었지만 **배치 귀결이 없었다**(그 하네스는 획을 3D로
// 안 올린다). `camera_gate`는 배치를 재지만 **소실점을 직접 받아** 규칙 경로를 안 지난다
// (HANDOFF의 "사정거리 밖"). 그래서 "차수가 P1에 갇힌다 → 조용히 틀린 배치"라는 연결이
// 두 원장 **사이로 샜다.** 여기가 그 자리다: **규칙이 세운 카메라로 그 획들을 올린다.**
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   **무잡음 행은 항등에 가깝다** — 두 깊이선의 교점이 정의상 참 소실점이다.
//        그래도 여기서는 **뺄 수 없다**: 지시 1이 "끝점 지터 0인 가장 깨끗한 층에서 P1 60/60"을
//        문제로 지목했다. 그 층이 곧 관측 대상이므로 **층을 따로 낸다**(`by_jitter`)
//   #11  분모가 전부인가 — **카메라가 안 서는 실행도 센다**. 배치 분모는 **그은 획 전부**다
//   #12  동작점을 하나 고르지 않는다 — 잡음 5수준 × 등급 2 × 순서 2
//   #13  절단을 하나 고르지 않는다 — 0.1·0.2·0.5를 다 낸다(`silentWrong`)
//   #14  시드 여섯. 비율보다 **분자/분모**
//   #17  앱과 같은 함수 — `CamState.feed`·`CamState.axisOf`·`liftAll`. 규칙을 다시 안 짠다
//   #26  게이트 수치를 측정 전에 박는다(아래 `REGISTERED`)
//   #30  **양성 채널** — 우회를 되살린 팔(`bypass`)이 함께 돈다. 안 갈리면 이 하네스가 둔한 것이다
//   #32  미실행을 반증으로 처리하지 않는다 — `lift_calls`·`camera_ok`를 함께 남긴다
//   #35·#40 도달 가능성: **참 소실점 + 참 축 라벨** 오라클 팔(`oracle`)이 같은 픽스처를 돈다
//   #41  이것은 **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건이 아니다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CamState } from "../src/ui/camState.js";
import { liftAll, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { representative, type Axis } from "../src/s3d/axis.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { perspectiveOrder, vpsOf, classifyLine, type RLine } from "../src/s3d/vpRules.js";
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge, type TrueEdge } from "./scene3d.js";
import { perStrokeError, silentWrong, rate, fraction, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `rule_camera`·`camera_gate`와 **같은 다섯 구도**다(#27 — 대역을 다른 픽스처에서 안 가져온다). */
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

/**
 * **사전 등록**(#26). ⚠ 이 게이트는 **이 항목이 등록한 것**이고 CLAUDE.md §2의 중단 조건
 * (L-A.7 실측 축 오차 0.5°)이 **아니다**(#41 — 같은 말로 부르지 않는다).
 *
 * 지시 1-b가 정한 통과선 그대로다: *"바닥을 벗어나는 조건을 만든다. 차수가 풀린 뒤 다시 재면
 * 0이 아닌 값이 나와야 한다. 안 나오면 다른 원인이 남은 것이다."*
 *
 * 1. **차수가 풀린다** — `fixed` 팔의 P1 실행 수가 `bypass` 팔보다 **적다**.
 * 2. **바닥을 벗어난다** — `fixed` 팔의 **절단 0.2 안에 든 배치가 0이 아니다**
 *    (= `silent_wrong.cut_0_2`의 분자 < 분모). 지시 1-b가 지목한 바닥이 그 1.0이다.
 */
const REGISTERED =
  "① 차수가 풀린다: `fixed`(우회 제거) 팔의 P1 실행 수 < `bypass`(우회 살림, 양성 채널 #30) 팔의 P1 실행 수. "
  + "② 바닥을 벗어난다: `fixed` 팔의 **절단 0.2 안에 든 배치가 0이 아니다** "
  + "(`arms.fixed.headline.silent_wrong.cut_0_2`의 분자 < 분모). 지시 1-b의 '바닥'이 그 1.0이다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 {0,0.005,0.01,0.03,0.05} × 순서 2 = 600실행이고 "
  + "**카메라가 안 서는 실행도 분모에 든다**(#11). 배치 분모는 **그은 획 전부**다(놓인 것만 세면 "
  + "안 놓인 것이 공짜로 사라진다 — #10·#11). "
  + "⚠ 이것은 이 항목이 등록한 게이트이고 CLAUDE.md §2의 중단 조건이 아니다(#41).";

// ---------------------------------------------------------------- 픽스처

interface Fx { sc: Scene; edges: TrueEdge[]; drawn: DrawnEdge[]; diag: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, drawn, diag };
}

/** 그리는 순서 둘(#12 — 동작점을 하나 고르지 않는다). `rule_camera`와 같은 정의다. */
type Order = "alternating" | "grouped";
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

// ---------------------------------------------------------------- 팔

/**
 * **팔은 요인 둘의 곱이다**(7-R 리뷰어 [6] — 옛 `oracle`은 소실점·축 라벨·규칙 사용을 한꺼번에
 * 바꿔서 배치 격차를 어디에도 귀속시킬 수 없었다). 이제 단일 요인 팔이 사이에 있다:
 *
 * | 팔 | 소실점 | 축 라벨 | 우회 |
 * |---|---|---|---|
 * | `bypass` | 규칙 | 규칙 | **살림**(양성 채널 #30 — 7차 지시 1-a가 지운 그것) |
 * | `fixed` | 규칙 | 규칙 | 없음(현행) |
 * | `rule_vp_true_axis` | 규칙 | **참** | 없음 — **오배정만** 뺀다 |
 * | `true_vp_rule_axis` | **참** | 규칙 | 없음 — **카메라 오차만** 뺀다 |
 * | `oracle` | **참** | **참** | — (도달 가능성 #35·#40) |
 */
type Arm = "bypass" | "fixed" | "rule_vp_true_axis" | "true_vp_rule_axis" | "oracle";
const ARM_SPEC: Record<Arm, { bypass: boolean; vp: "rule" | "true"; axis: "rule" | "true" }> = {
  bypass:            { bypass: true,  vp: "rule", axis: "rule" },
  fixed:             { bypass: false, vp: "rule", axis: "rule" },
  rule_vp_true_axis: { bypass: false, vp: "rule", axis: "true" },
  true_vp_rule_axis: { bypass: false, vp: "true", axis: "rule" },
  oracle:            { bypass: false, vp: "true", axis: "true" },
};

const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface RunOut {
  order: number;
  cameraOk: boolean;
  /** 그은 획 수(배치 분모 — #11). */
  drawnN: number;
  placedN: number;
  errs: number[];
  asks: number;
  /** 규칙에 실제로 먹인 획 수(#32 — 입력이 0이면 그 실행은 기전에 대한 정보가 0이다). */
  fed: number;
  /**
   * **무엇이 먼저 선언됐는가**(#7 — "왜 안 되는지 추측하지 말고 카운터를 넣는다").
   * `screen_h`가 먼저면 그 순간 P1이 굳고 되돌릴 길이 없다(지시 1: P1은 불가역).
   */
  firstDecl: "screen_h" | "screen_v" | "vp" | "none";
  /** **물음 종류별 내역**(7-R [4-F] · #7) — "남는 물음이 전부 screen_or_depth"를 세서 확인한다. */
  askKinds: Record<string, number>;
}

function runOne(fx: Fx, order: Order, arm: Arm): RunOut {
  const spec = ARM_SPEC[arm];
  const list = orderStrokes(fx, order);
  const diag = Math.hypot(SZ[0], SZ[1]);
  const cam = new CamState(SZ);
  let asks = 0, fed = 0;
  let firstDecl: RunOut["firstDecl"] = "none";
  const askKinds: Record<string, number> = {};
  /** 앱의 `pend2Segs()` 자리 — 확정 전 2D 오스냅 대상. `rule_camera`와 같은 근사다. */
  const fedSegs: Snap2Seg[] = [];
  /** 규칙에 먹인 최종 점열(= 앱의 `pts2d`). 배치도 이것으로 한다 — 앱이 그렇게 한다(#17). */
  const finalPts: Pt2[][] = [];

  // **참 소실점 팔도 규칙을 돌린다** — 축 라벨이 규칙에서 와야 하고(`true_vp_rule_axis`),
  // 차수 카운터도 같은 조건에서 나와야 비교가 된다. `oracle`만 규칙을 안 쓴다.
  if (arm === "oracle") {
    for (const e of list) finalPts.push(e.pts2d as Pt2[]);
  } else {
    for (const e of list) {
      let pts = e.pts2d as Pt2[];
      let forced: "screen" | "depth" | undefined;
      // **앱과 같은 조건**: 확정 전(order 0)에만 2D 판정이 돈다(`mainL.onStrokeEnd`)
      if (perspectiveOrder(cam.rules) === 0) {
        const cands = fedSegs.length ? static2dCandidates(fedSegs, diag) : [];
        const r2 = resolve2dCore(pts, { cands, vps: vpsOf(cam.rules),
                                        radiusPx: OSNAP_RADIUS_PX, relSnap: true });
        pts = r2.pts;
        // ⚠ **여기가 갈리는 유일한 지점이다** — 우회를 살릴 것인가.
        if (spec.bypass) forced = r2.ortho ? "screen" : r2.vpdir ? "depth" : undefined;
      }
      const rep = representative(pts);
      if (!rep) continue;
      const line: RLine = { a: rep.a, b: rep.b };
      fedSegs.push({ id: `f${fedSegs.length}`, a: line.a, b: line.b });
      finalPts.push(pts);
      let r = cam.feed(line, forced);
      if (r.event.type === "ask") {
        asks += 1;
        askKinds[r.event.question] = (askKinds[r.event.question] ?? 0) + 1;
        // **참 축으로 답한다**(오라클) — `rule_camera`와 같은 규약이다
        const truth: "screen" | "depth" =
          // ⛔ **"vertical" 답을 지웠다**(7차 지시 3-b) — 기울어진 선은 항상 깊이선이다.
          // 유한 소실점을 가진 축이면 깊이, 화면 평행이면 화면 축이다
          isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
        r = cam.feed(line, truth);
      }
      if (r.applied) fed += 1;
      if (firstDecl === "none") {
        if (r.event.type === "screen_axis") firstDecl = r.event.dir === "h" ? "screen_h" : "screen_v";
        else if (r.event.type === "vp_fixed") firstDecl = "vp";
      }
    }
  }

  const ord = arm === "oracle" ? 0 : cam.order();
  // ---- 배치. **여기가 이 하네스의 존재 이유다**(rule_camera에 없던 귀결)
  let ctx: LiftCtx | null = null;
  if (spec.vp === "true") {
    ctx = { principal: fx.sc.principal, f: fx.sc.f, vps: trueVps(fx.sc), imgSize: SZ };
  } else {
    const c = cam.ctx();
    ctx = c ? { principal: c.principal, f: c.f, vps: c.vps, imgSize: SZ, axisDirs: c.axisDirs } : null;
  }
  const axes: Axis[] = spec.axis === "true"
    ? list.map(e => trueAxis(fx.sc, e.axis))
    : finalPts.map(p => cam.axisOf(p).axis);
  if (!ctx) return { order: ord, cameraOk: false, drawnN: list.length, placedN: 0, errs: [],
                     asks, fed, firstDecl, askKinds };
  const strokes: LiftStroke[] = finalPts.map((pts, i) => ({
    // ⚠ **키 규약**: `metrics.edgeIndexOf`가 `s<인덱스>`를 참 모서리 인덱스로 읽는다.
    // `list`는 순서를 바꾼 것이므로 **원래 인덱스**를 붙여야 참값과 짝이 맞는다
    id: `s${fx.drawn.indexOf(list[i])}`, pts2d: pts, axis: axes[i],
  }));
  const r = liftAll(strokes, ctx);
  const errs = perStrokeError(r.placed, fx.edges, fx.diag);
  return { order: ord, cameraOk: true, drawnN: list.length, placedN: r.placed.size, errs,
           asks, fed, firstDecl, askKinds };
}

// ---------------------------------------------------------------- 집계

interface Bag {
  runs: number; cameraOk: number;
  orders: Record<string, number>;
  drawnN: number; placedN: number; errs: number[];
  asks: number; fed: number;
  firstDecl: Record<string, number>;
  askKinds: Record<string, number>;
}
const bag = (): Bag => ({ runs: 0, cameraOk: 0, orders: { p0: 0, p1: 0, p2: 0, p3: 0 },
                          drawnN: 0, placedN: 0, errs: [], asks: 0, fed: 0,
                          firstDecl: { screen_h: 0, screen_v: 0, vp: 0, none: 0 },
                          askKinds: {} });

function add(b: Bag, r: RunOut) {
  b.runs += 1;
  if (r.cameraOk) b.cameraOk += 1;
  b.orders[`p${r.order}`] += 1;
  b.drawnN += r.drawnN; b.placedN += r.placedN;
  for (const e of r.errs) b.errs.push(e);
  b.asks += r.asks; b.fed += r.fed;
  b.firstDecl[r.firstDecl] += 1;
  for (const [k, n] of Object.entries(r.askKinds)) b.askKinds[k] = (b.askKinds[k] ?? 0) + n;
}

function summarize(b: Bag) {
  return {
    runs: b.runs,
    camera_ok: fraction(b.cameraOk, b.runs),
    camera_ok_rate: rate(b.cameraOk, b.runs),
    order_counts: b.orders,
    /** **놓인 것 / 그은 것**(#11 — 분모는 전부다). */
    placement: fraction(b.placedN, b.drawnN),
    placement_rate: rate(b.placedN, b.drawnN),
    /** **조용히 틀린 배치** — 분모는 놓인 것(정의상). 절단 셋(#13). */
    silent_wrong: silentWrong(b.errs),
    /** 같은 값의 비율 판(#40 값 대조가 점 경로로 읽는 자리 — 분자/분모는 위에 그대로 있다). */
    silent_wrong_rate: Object.fromEntries(Object.entries(silentWrong(b.errs)).map(
      ([k, v]) => [k, rate(Number(v.split("/")[0]), Number(v.split("/")[1]))])),
    shape_err_median: round(median(b.errs), 4),
    /** **규칙에 실제로 먹인 획 수**(#32) — 0이면 그 팔의 결과는 기전에 대한 정보가 0이다. */
    fed_strokes: b.fed,
    asks_total: b.asks,
    /** **물음 종류별**(7-R [4-F]) — 3점 물음이 지워졌으므로 `screen_or_depth`만 남아야 한다. */
    ask_kinds: b.askKinds,
    /** **획당 물음**(7-R [4-E] · #11·#24) — 지시 3-f가 보고한 자릿수는 6/5획 = **1.2회/획**이다.
     *  이 하네스의 값과 자릿수가 다르면 "0에 가까워졌는가"를 이 하네스로 판정할 수 없다. */
    asks_per_stroke: rate(b.asks, b.drawnN),
    /** **무엇이 먼저 선언됐는가**(#7). `screen_h`가 먼저면 그 실행은 그 순간 P1로 굳는다. */
    first_declaration: b.firstDecl,
  };
}

// ---------------------------------------------------------------- 측정

describe("차수가 P1에 갇히는가 — 그리고 배치가 따라오는가 (7차 지시 1)", () => {
  it("우회 살림/제거/오라클 세 팔을 같은 픽스처에서 함께 낸다", () => {
    const ARMS = Object.keys(ARM_SPEC) as Arm[];
    const newBags = (): Record<Arm, Bag> =>
      Object.fromEntries(ARMS.map(a => [a, bag()])) as Record<Arm, Bag>;
    const head: Record<Arm, Bag> = newBags();
    const byJit: Record<string, Record<Arm, Bag>> = {};
    const byOrder: Record<string, Record<Arm, Bag>> = {};
    const byComp: Record<string, Record<Arm, Bag>> = {};
    /** **시드 층**(7-R 리뷰어 [3] · #14) — P1 −20이 시드 폭 안인지 밖인지 가른다. */
    const bySeed: Record<string, Record<Arm, Bag>> = {};
    /** **동작점**(7-R 리뷰어 [7] · #12·#13) — 화면 수평에서 몇 도 안에 든 획이 구도마다 몇 개인가. */
    const nearH: Record<string, { strokes: number; runs_with_any: number }> =
      { deg_2: { strokes: 0, runs_with_any: 0 }, deg_4: { strokes: 0, runs_with_any: 0 },
        deg_8: { strokes: 0, runs_with_any: 0 } };
    let nearHRuns = 0, nearHTotal = 0;

    const slot = (m: Record<string, Record<Arm, Bag>>, k: string) => (m[k] ??= newBags());

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) continue;
            for (const ord of ["alternating", "grouped"] as Order[]) {
              // **4° 안 획이 몇 개인가**(#7 카운터 — "반드시 하나는 있다"의 근거)
              nearHRuns += 1; nearHTotal += fx.drawn.length;
              for (const t of [2, 4, 8]) {
                let k = 0;
                for (const e of fx.drawn) {
                  const r = representative(e.pts2d as Pt2[]);
                  if (r && classifyLine(r.a, r.b).toH <= t) k += 1;
                }
                nearH[`deg_${t}`].strokes += k;
                if (k > 0) nearH[`deg_${t}`].runs_with_any += 1;
              }
              for (const arm of ARMS) {
                const r = runOne(fx, ord, arm);
                add(head[arm], r);
                add(slot(byJit, `jit_${jit}`)[arm], r);
                add(slot(byOrder, ord)[arm], r);
                add(slot(byComp, COMPOSITIONS[ci].name)[arm], r);
                add(slot(bySeed, `seed_${seed}`)[arm], r);
              }
            }
          }
        }
      }
    }

    const armsOut = Object.fromEntries(ARMS.map(a => [a, { headline: summarize(head[a]) }]));
    const layer = (m: Record<string, Record<Arm, Bag>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) =>
        [k, Object.fromEntries(ARMS.map(a => [a, summarize(v[a])]))]));

    // ---- 게이트 판정 (#26 — 등록문 그대로 읽는다)
    const p1Bypass = head.bypass.orders.p1, p1Fixed = head.fixed.orders.p1;
    const cut02 = silentWrong(head.fixed.errs).cut_0_2;                // "분자/분모"
    const [wrong, placed] = cut02.split("/").map(Number);
    const passOrder = p1Fixed < p1Bypass;
    const passFloor = placed > 0 && wrong < placed;

    const out = {
      what: "규칙이 세운 카메라로 그 획들을 실제로 올린다 — `rule_camera`(축 오차만)와 "
          + "`camera_gate`(소실점을 직접 받음) 사이로 새던 연결이다(7차 지시 1-a·1-b).",
      arms: armsOut,
      by_jitter: layer(byJit),
      by_order: layer(byOrder),
      by_composition: layer(byComp),
      by_seed: layer(bySeed),
      /**
       * **`screen_h` 동작점**(7-R 리뷰어 [7]) — `RULE_TOL.screen_axis_deg = 4`가 결론을 지탱하므로
       * 그 임계를 흔들어 본다. 규칙을 다시 돌리는 스윕이 아니라 **입력 쪽 카운터**다:
       * 화면 수평에서 t° 안에 든 획이 구도마다 몇 개인가. `runs_with_any`가 실행 수와 같으면
       * "3점 구도에도 그런 모서리가 반드시 하나는 있다"가 관측이 된다(추측이 아니라 카운터, #7).
       */
      screen_h_operating_point: { runs: nearHRuns, strokes_total: nearHTotal, by_deg: nearH },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "`oracle` 팔 — **참 소실점 + 참 축 라벨**로 같은 획을 올린다. 규칙을 안 쓰므로 "
          + "'규칙이 정한 차수'가 배치에 무엇을 하는지의 대조선이고, **자명한 값이 아니다**"
          + "(참값을 줘도 합성 잉크 잡음이 남아 조용히 틀림이 0이 아니다 — #40 ②). "
          + "⚠ 오라클을 상한이라 부르지 않는다 — 한 대리 참값의 성능이다.",
        reachability_value: summarize(head.oracle).silent_wrong_rate.cut_0_2 as number,
        reachability_source: "arms/oracle/headline/silent_wrong_rate/cut_0_2",
        result: {
          pass_order: passOrder, p1_bypass: p1Bypass, p1_fixed: p1Fixed,
          p3_bypass: head.bypass.orders.p3, p3_fixed: head.fixed.orders.p3,
          /** ⚠ **P1이 줄어든 몫이 전부 차수 상승은 아니다**(7-R [4]) — 아래 셋을 함께 읽는다. */
          p0_bypass: head.bypass.orders.p0, p0_fixed: head.fixed.orders.p0,
          camera_ok_bypass: fraction(head.bypass.cameraOk, head.bypass.runs),
          camera_ok_fixed: fraction(head.fixed.cameraOk, head.fixed.runs),
          pass_floor: passFloor, fixed_cut_0_2: cut02,
          /** ⚠⚠ **게이트 ②는 개입에 대한 정보가 0이다**(7-R [2]) — 대조 팔이 같은 수를 낸다. */
          bypass_cut_0_2: silentWrong(head.bypass.errs).cut_0_2,
          within_cut_0_2_fixed: placed - wrong,
          within_cut_0_2_bypass: Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
                                - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0]),
          floor_gate_discriminates: (placed - wrong)
            !== (Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
               - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0])),
          oracle_cut_0_2: silentWrong(head.oracle.errs).cut_0_2,
        },
        note: "⚠ 이 게이트는 이 항목이 등록한 것이고 CLAUDE.md §2의 중단 조건이 아니다(#41).",
      }),
      /**
       * **요인 분해**(7-R [6]) — 옛 판은 `oracle`이 소실점·축 라벨·규칙 사용을 한꺼번에 바꿔서
       * 배치 격차를 어디에도 못 돌렸다. 단일 요인 팔 둘이 그것을 가른다.
       */
      factor_split: {
        note: "축 라벨만 참으로 바꾸면(rule_vp_true_axis) 형태 오차가 안 움직이고, "
            + "소실점만 참으로 바꾸면(true_vp_rule_axis) 크게 움직인다 — **틀린 것은 카메라다.** "
            + "⚠ 배치 수(분모가 아니라 분자)는 반대로 움직인다: 참 소실점 팔은 규칙 축 라벨이 "
            + "그 카메라와 안 맞아 놓이는 획이 준다(#9 — 무엇이 섞였는지 먼저 가른다).",
        shape_err_median: Object.fromEntries(ARMS.map(a =>
          [a, round(median(head[a].errs), 4)])),
        placement: Object.fromEntries(ARMS.map(a =>
          [a, fraction(head[a].placedN, head[a].drawnN)])),
        silent_wrong_cut_0_2: Object.fromEntries(ARMS.map(a =>
          [a, silentWrong(head[a].errs).cut_0_2])),
      },
      what_this_does_not_say: [
        "**합성이다.** 실획은 `sessions/`에 표본이 오면 `real_ink`가 잰다(항목 9) — "
          + "AS-L24·L25가 '합성이 이 설계에 구조적으로 불리하다'를 열어 두었다",
        "**축 라벨은 규칙이 붙인다**(`CamState.axisOf`) — 오배정이 배치 오차에 섞여 들어온다. "
          + "그것이 의도다(#27: 축 오차만 재면 오배정이 안 보인다). 갈라 보려면 `oracle` 팔과 견준다",
        "**물음에는 참 축으로 답한다**(오라클) — 사람이 틀리게 답하는 몫은 안 잰다",
        "⚠⚠ **이 팔은 지시 1-c·1-d에 대한 정보가 0이다**(7-R 리뷰어 [5], #32·#17). "
          + "시작점 스냅(3D 오스냅)이 없고 `liftAll` 일괄 풀이만 쓰므로 앱의 `placeStroke` 경로를 "
          + "**안 탄다**. 게다가 `liftAll`은 방향을 축과 앵커에서 **다시 세우므로** 1-c의 `pts2d` "
          + "되쓰기는 이 팔에서 **구조적으로 항등**이다. 즉 여기서 '배치가 안 좋아졌다'가 말하는 것은 "
          + "**1-a(우회 제거)에 대한 것뿐**이다. 1-c·1-d의 판정자는 `confirm_dir.json`이다",
        "⚠ **게이트 ②(바닥 탈출)는 개입에 대한 정보가 0이다**(7-R [2]) — 절단 0.2 안에 든 배치가 "
          + `\`fixed\` ${placed - wrong} · \`bypass\` ${Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
              - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0])}로 같다. 그 게이트가 말하는 것은 `
          + "'이 하네스가 바닥에 붙어 있지 않다'는 **하네스의 성질**이지 1-a의 성질이 아니다. "
          + "`gate.result.floor_gate_discriminates`가 그 사실을 낸다(#40의 자매 유형: 값이 0·1이 "
          + "아니어도 대조 팔에서 같으면 자명하다)",
        "⚠ **P1이 줄어든 몫에 손실이 섞여 있다**(7-R [4]·#15·#16) — 이 실행의 내역: "
          + `P1 ${p1Bypass} → ${p1Fixed} · P2 ${head.bypass.orders.p2} → ${head.fixed.orders.p2} · `
          + `P3 ${head.bypass.orders.p3} → ${head.fixed.orders.p3} · **P0 ${head.bypass.orders.p0} → ${head.fixed.orders.p0}** · `
          + `카메라가 선 실행 ${head.bypass.cameraOk} → ${head.fixed.cameraOk}. `
          + "P0은 차수가 풀린 것이 아니라 카메라가 아예 안 선 것이다 — "
          + "'차수가 풀린다'를 P1 개수만으로 읽으면 그 손실이 안 보인다",
        "**조용히 틀림의 분모가 팔마다 다르다**(#11) — "
          + ARMS.map(a => `\`${a}\` ${head[a].placedN}`).join(" · ")
          + ". 행 간 비율 비교는 **같은 양의 비교가 아니다**. 그래서 분자/분모를 그대로 낸다",
        "⚠⚠ **3점 세 구도에서 조용히 틀림이 정확히 1.000이다**(7-R [4-A] · #40 ②) — "
          + "`by_composition`을 그 자리에서 읽는다. 집계 형태 오차가 좋아지는 것은 **층 구성**이 "
          + "바뀐 것일 수 있다(카메라가 선 실행이 늘면 저오차 층인 1pt 구도의 비중이 는다, #9). "
          + "층 내 개선과 층 구성 변화를 이 원장은 **안 가른다**",
        "**위약 팔이 없다**(#39) — `bypass`는 양성 채널(옛 배선)이지 위약이 아니다. "
          + "다만 이번 개입은 '해를 얼마나 옮기는가'가 아니라 **배선 제거**라 위약의 대상이 애매하다",
        "**#12·#13**: 절단 셋·잡음 다섯·등급 둘·순서 둘·시드 여섯(`by_seed`)을 다 냈지만 "
          + "**조리개(15px)와 `RULE_TOL.screen_axis_deg`(4°)는 동작점 하나다**. 4°가 결론을 지탱하므로 "
          + "`screen_h_operating_point`가 **입력 쪽 카운터**를 2°·4°·8°로 낸다 — 규칙을 다시 돌리는 "
          + "스윕은 아니다(7-R [7])",
      ],
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "order_lock.json"), JSON.stringify(out, null, 2));

    // 실행이 실제로 돌았는가(#32) — 입력 0이면 결과는 기전에 대한 정보가 0이다
    expect(head.fixed.runs).toBeGreaterThan(0);
    expect(head.fixed.fed).toBeGreaterThan(0);
  });
});
