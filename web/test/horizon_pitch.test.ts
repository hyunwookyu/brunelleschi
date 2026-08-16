// **지평선을 사용자가 끈다 = 피치를 준다** — 산출: `stage0/out/horizon_pitch.json`.
//
// 사람 지시(2026-08-16, QUESTIONS g): "건축 투시에서 3점(앙각·부감)은 흔한 구도이므로
// **초기부터 가능해야 한다.** 기본 피치를 바꾸든 지평선을 끌게 하든 **단순한 것**을 고르고
// 근거를 DECISIONS에 남긴다." → **D-L45**(지평선 드래그).
//
// 이 원장이 재는 것은 그 선택의 **전제**다: 지평선이 맞으면 초기 스케치에서 **차수가 3이
// 되는가**, 그리고 그것이 **"옮겨서"가 아니라 "맞아서"인가**(#39 위약).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   **참 지평선 팔은 오라클이다.** 잡음 0 행에서는 교점이 정의상 참 소실점이라 항등이다 →
//        표제에서 뺀다(`LIVE_JITTERS`). ⚠ 잡음이 걸린 행에서도 지평선 자체는 참값이므로
//        **이 팔은 "사람이 그만큼 정확할 때"의 값**이지 도달 가능성의 증명이 아니다(#35)
//   #11  분모가 전부인가 — **카메라가 안 서는 실행도 센다**
//   #14  시드 여섯. 비율보다 분자/분모
//   #26  게이트를 측정 전에 박는다(`REGISTERED`)
//   #38  **덮는 대상 수를 함께 낸다** — 팔마다 실행 수·3점이 된 실행 수를 낸다.
//        위약이 한 번도 달라지지 않으면(피치 0 구도) 그 층에서는 공허하다는 것을 적는다
//   #39  **위약 팔**(참에서 **반대 방향으로 같은 크기**) — "지평선이 있다"가 아니라
//        "**맞다**"가 이득의 출처인지 가른다. `axis_snap.json`이 같은 형식으로 갈랐다
//   #41  **이 게이트는 이 항목이 등록한 것이고 CLAUDE.md §2의 중단 조건이 아니다**
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { fPixelsFrom35mm } from "../src/s3d/constraints.js";
import { DEFAULT_LENS_MM } from "../src/ui/camState.js";
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

/**
 * **사전 등록**(#26). 이 항목이 등록한 게이트이고 **중단 조건이 아니다**(#41).
 */
const REGISTERED =
  "**참 지평선 팔**이 세 가지를 동시에 만족한다: "
  + "① 피치가 0이 아닌 세 구도(3pt_*)에서 **차수 3인 실행이 실제로 난다**(`order3 > 0`) — "
  + "같은 층에서 **중앙 지평선 팔은 0**이다(그것이 '초기 스케치가 1점·2점뿐'의 정체다). "
  + "② 그 층의 **축 방향 오차 중앙**이 중앙 지평선 팔보다 **작다**. "
  + "③ **위약 팔**(참에서 반대 방향으로 같은 크기)이 중앙 팔보다 **나쁘다** — "
  + "이득의 출처가 '옮겼다'가 아니라 '맞다'임을 가른다(#39). "
  + "모집단: 3pt 구도 3 × 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05}(잡음 0 행은 항등이라 뺀다, #5). "
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

/**
 * **참 지평선**(화면 y) — 수평 축 소실점의 y다(이론서 3.1 + 롤 0).
 *
 * 유한한 수평 소실점이 하나도 없으면(두 수평축이 모두 화면 평행) 지평선은 **주점의 y**이고
 * 그것이 기본값과 같다 — 그 구도에서는 세 팔이 한 팔이 된다. 그 사실을 원장에 적는다(#38).
 */
function trueHorizon(sc: Scene): number {
  for (const i of [0, 1] as const) {
    if (isFiniteVp(sc.vps[i], SZ)) return sc.vps[i][1];
  }
  return defaultHorizon(SZ);
}

// ---------------------------------------------------------------- 규칙 팔

type Order = "drawn" | "grouped";

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
 * `horizon0`이 이 팔의 지평선이고, **그것만이 팔 사이의 차이다.**
 *
 * 물음에는 **참 축으로 답한다**(오라클). 답한 횟수를 센다.
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
  errs: number[]; runs: number; ok: number; order: number[];
  order3: number; asks: number; rejected: number;
  /** 이 팔의 지평선이 중앙에서 얼마나 떨어져 있었나(px). **0이면 중앙 팔과 같은 팔이다**(#38). */
  offsets: number[];
}
const bag = (): Bag => ({ errs: [], runs: 0, ok: 0, order: [], order3: 0,
                          asks: 0, rejected: 0, offsets: [] });

function summarize(b: Bag) {
  return {
    runs: b.runs,
    camera_ok: b.ok,
    camera_ok_rate: rate(b.ok, b.runs),
    axes_measured: b.errs.length,
    deg_median: round(median(b.errs), 4),
    deg_p90: round(q(b.errs, 0.9), 4),
    deg_max: round(q(b.errs, 1), 4),
    order_median: round(median(b.order), 2),
    /** **3점이 실제로 선 실행 수**. 이 항목의 물음이 바로 이것이다 */
    order3: b.order3,
    order3_rate: rate(b.order3, b.runs),
    asks_per_run: round(b.runs ? b.asks / b.runs : null, 3),
    rejected_per_run: round(b.runs ? b.rejected / b.runs : null, 3),
    /** 지평선이 중앙에서 떨어진 거리(px) 중앙값 — **0이면 그 층에서 이 팔은 중앙 팔이다** */
    horizon_offset_px_median: round(median(b.offsets), 2),
  };
}

const ARMS = ["center", "true", "placebo"] as const;
type Arm = typeof ARMS[number];

// ---------------------------------------------------------------- 측정

describe("지평선 = 피치 — 사용자가 끌면 3점이 초기부터 서는가 (D-L45)", () => {
  it("중앙 · 참 · 위약 세 팔을 같은 픽스처에서 함께 낸다", () => {
    const ORDERS: Order[] = ["grouped", "drawn"];
    const key = (arm: Arm, ord: Order) => `${arm}|${ord}`;
    const newArms = (): Record<string, Bag> => Object.fromEntries(
      ARMS.flatMap(a => ORDERS.map(o => [key(a, o), bag()]))) as Record<string, Bag>;

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
            // **위약 = 참에서 반대 방향으로 같은 크기**(#39). 중앙 팔의 오차와 크기가 같고
            // 부호만 반대다 — "옮겼다"가 아니라 "맞다"가 이득인지 가른다
            const horizons: Record<Arm, number> = {
              center, true: truth, placebo: 2 * center - truth,
            };

            for (const arm of ARMS) {
              for (const ord of ORDERS) {
                const h0 = horizons[arm];
                const r = runRules(fx, ord, h0);
                const vps = vpsOf(r.st);
                const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
                // **1점 투시의 f는 설정값이다**(이론서 5.3) — 앱과 같은 기본 렌즈를 준다.
                // 안 주면 1점 실행이 통째로 분모에서 사라진다(#11)
                const cam = recoverCamera(vps, SZ,
                  nF === 1 ? { fSetting: fPixelsFrom35mm(DEFAULT_LENS_MM, SZ[0]) } : {});
                const errs = cam.ok && cam.principalPoint && cam.f != null
                  ? axisDirErrors(vps, cam.principalPoint, cam.f, fx.sc.axes) : [];
                for (const t of [arms[key(arm, ord)], byComp[ck][key(arm, ord)],
                                 byJitterComp[`${jk}|${ck}`][key(arm, ord)]]) {
                  t.runs += 1;
                  if (cam.ok) t.ok += 1;
                  t.errs.push(...errs);
                  t.order.push(nF);
                  if (nF >= 3) t.order3 += 1;
                  t.asks += r.asks;
                  t.rejected += r.rejected;
                  t.offsets.push(Math.abs(h0 - center));
                }
              }
            }
          }
        }
      }
    }

    // ---- 표제: **잡음이 걸린 행 · 피치가 0이 아닌 세 구도**(#5 — 잡음 0은 항등,
    // 피치 0 구도에서는 세 팔의 지평선이 같은 값이라 팔이 하나가 된다)
    const pitched = COMPOSITIONS.filter(c => c.pitch !== 0).map(c => c.name);
    const head = newArms();
    for (const j of LIVE_JITTERS) for (const c of pitched) {
      const src = byJitterComp[`jit_${j}|${c}`];
      if (!src) continue;
      for (const k of Object.keys(head)) {
        const b = src[k], t = head[k];
        t.errs.push(...b.errs); t.runs += b.runs; t.ok += b.ok; t.order.push(...b.order);
        t.order3 += b.order3; t.asks += b.asks; t.rejected += b.rejected;
        t.offsets.push(...b.offsets);
      }
    }
    const headline = Object.fromEntries(
      Object.entries(head).map(([k, v]) => [k, summarize(v)]));

    // ---- 게이트 판정 — **순서 팔은 `grouped`**(rule_camera의 표제와 같은 자리)
    const T = headline["true|grouped"], C = headline["center|grouped"], P = headline["placebo|grouped"];
    const cond1 = T.order3 > 0 && C.order3 === 0;
    const cond2 = T.deg_median != null && C.deg_median != null && T.deg_median < C.deg_median;
    const cond3 = P.deg_median != null && C.deg_median != null && P.deg_median > C.deg_median;
    const passed = cond1 && cond2 && cond3;

    const out = {
      what: "지평선을 **사용자가 끄는 것**(= 피치를 주는 것)의 전제를 잰다 — 지평선이 맞으면 "
        + "초기 스케치에서 차수가 3이 되는가, 그리고 그 이득이 '옮겨서'가 아니라 '맞아서'인가.",
      why: "D-L43의 곁가지로 **초기 스케치가 1점·2점뿐**이었다(기본 지평선 = 화면 중앙 = 피치 0 → "
        + "수심 유도가 `null`, 이론서 2.2). 사람 지시: 건축 투시의 3점은 흔한 구도이므로 "
        + "**초기부터 가능해야 한다**(QUESTIONS g → D-L45).",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, lattice_k: 1,
        orders: ORDERS,
        metric: "유한 소실점의 축 방향 오차(도) — `metrics.axisDirErrors`. 무한원 축은 안 센다",
        arms: {
          center: "지평선 = 화면 중앙(피치 0). **지금까지의 동작이다**",
          true: "지평선 = **참 수평 소실점의 y**. ⚠ **오라클이다** — 사람이 그 자리에 놓는지는 "
            + "표본이 0이다(AS-L9와 같은 자리). 상한이라 부르지 않는다(#35)",
          placebo: "지평선 = 참에서 **반대 방향으로 같은 크기**(2·중앙 − 참). 중앙 팔과 **오차 크기가 "
            + "같고 부호만 반대**다 — '옮겼다'가 아니라 '맞다'가 이득인지 가른다(#39)",
        },
        why_pitched_only:
          "표제는 **피치 ≠ 0인 세 구도**만 쓴다. 피치 0 구도(2pt_yaw35_pitch0 · 1pt_yaw0_pitch0)에서는 "
          + "참 지평선이 화면 중앙과 같아 **세 팔의 지평선이 한 값이 된다** — 그 층의 팔 간 차이는 "
          + "구성상 0이고 덮는 대상이 없다(#38). 그 층도 `by_composition`에 그대로 남긴다.",
        ask_policy: "물음에는 **참 축으로 답했다**(오라클). 횟수를 `asks_per_run`으로 남긴다.",
      },
      headline: {
        note: "**잡음 {0.005,0.01,0.03,0.05} · 피치≠0 세 구도.** 잡음 0 행은 항등이라 뺐다(#5).",
        ...headline,
      },
      // **0과 1이 뜨는 자리를 미리 갈라 적는다**(selfcheck의 의심 플래그 · #5 "보장이면 그렇게 적는다")
      what_the_zeros_mean: {
        "center|*.horizon_offset_px_median = 0":
          "**구성상 0이다** — 중앙 팔의 지평선이 곧 화면 중앙이므로 '중앙에서 떨어진 거리'가 정의상 0이다. "
          + "측정이 아니라 **덮는 대상 표시**이고(#38) 임계를 걸지 않는다.",
        "center|*.order3_rate = 0":
          "**이것이 이 항목의 관측이다** — 피치 0에서는 수심 유도가 `null`이라(이론서 2.2) "
          + "차수가 3이 될 수 **없다**. '초기 스케치가 1점·2점뿐'의 정체가 이 0이고, 0/144는 그 사실의 실측이다.",
        "true|*.order3_rate = 1 (구도별)":
          "그 구도에서 48/48이 3점이 됐다는 뜻이다. **항등이 아니다** — 같은 획을 중앙 지평선으로 돌리면 0/48이고, "
          + "위약으로 돌리면 3점은 서지만 축 오차가 더 나쁘다. 다만 **참 지평선을 넣은 오라클**이므로 "
          + "'사람이 그만큼 맞춘다'는 주장이 아니다(#35).",
        "2pt_*·1pt_* 층의 offset = 0 (세 팔 전부)":
          "그 구도는 **피치가 0이라 참 지평선이 화면 중앙과 같다** — 세 팔의 지평선이 한 값이 되어 "
          + "**팔 간 비교의 대상이 없다**(#38 덮는 대상 0). 그래서 표제에서 뺐고 그 사실을 여기 적는다.",
      },
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, summarize(b)]))])),
      all: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, summarize(v)])),
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**오라클은 `true` 팔이다** — 사용자가 지평선을 **참값에 정확히** 놓았을 때의 성능이고, "
          + "그 값이 `headline['true|grouped'].deg_median`이다. ⚠ **사람이 그 자리에 놓는지는 "
          + "표본이 0이다**(AS-L9: 사람이 임계에 드는지 미측정). 그러므로 이 값은 도달 가능성의 "
          + "증명이 아니라 **한 대리 참값의 성능**이고, 상한이라 부르지 않는다(#35). "
          + "⚠⚠ 잡음 0 행에서는 이 팔이 항등이므로(교점이 정의상 참 소실점) 표제에서 뺐다(#5).",
        reachability_value: T.deg_median ?? undefined,
        // ⚠ **구분자는 `/`다**(`selfcheck._resolve`) — 점을 쓰면 키 안의 점을 못 가른다
        reachability_source: "headline/true|grouped/deg_median",
        result: {
          order3_true: T.order3, order3_center: C.order3, order3_placebo: P.order3,
          deg_true: T.deg_median, deg_center: C.deg_median, deg_placebo: P.deg_median,
          cond1_three_point_appears: cond1,
          cond2_true_better_than_center: cond2,
          cond3_placebo_worse_than_center: cond3,
          passed,
        },
        note: "⚠ **이 항목이 등록한 게이트다.** CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)과 "
          + "다른 게이트이고 같은 말로 부르지 않는다(#41).",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "horizon_pitch.json"), JSON.stringify(out, null, 2));

    // **덮는 대상 0을 통과로 읽지 않는다**(#38)
    expect(fixtures).toBeGreaterThan(0);
    expect(T.runs).toBeGreaterThan(0);
    expect(T.horizon_offset_px_median).toBeGreaterThan(0);   // 참 팔이 실제로 중앙과 달랐다
  }, 240_000);
});
