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
import { representative } from "../src/s3d/axis.js";
import {
  newRuleState, stepRule, vpsOf, perspectiveOrder, sepDeg,
  type RuleState, type RLine,
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
  + "⚠ 이것은 **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 아니다(#41).";

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

// ---------------------------------------------------------------- 규칙 팔

interface RuleRun {
  st: RuleState;
  /** 물음이 몇 번 났는가 — **참 축으로 답했다**(오라클). 사용자가 몇 번 개입해야 하는지의 척도다. */
  asks: number;
  /** 규칙이 안 받은 획 수. */
  rejected: number;
  /** 첫 소실점을 만든 두 선의 각차(도). **교점의 조건수**이고 오차의 지렛대다. */
  firstSep: number | null;
}

/**
 * **획을 차례로 규칙에 넣는다** — 앱의 `feedStroke`와 같은 경로다(#17).
 *
 * ⚠ **순서가 결과를 정한다.** 규칙 b는 "깊이선 **두 개**의 교점"이므로 처음 두 깊이선이
 * 서로 다른 축이면 엉뚱한 점이 나온다. 그래서 두 팔을 다 낸다:
 *   `grouped` — **축별로 몰아 긋는다**(사람이 면 단위로 그리는 방식. AS-6과 같은 가정).
 *               ⚠ 참 축 라벨을 쓰므로 **순서 오라클**이다. 그 사실이 결론에 붙는다
 *   `lattice` — 픽스처가 낸 순서 그대로(오라클 없음)
 *
 * 물음에는 **참 축으로 답한다**(오라클). 답한 횟수를 세어 남긴다 — 사람이 실제로 몇 번
 * 개입해야 하는가이고, 그것이 이 방식의 비용이다(#7: 추측하지 말고 센다).
 */
function runRules(fx: Fx, order: Order): RuleRun {
  const list = orderStrokes(fx, order);
  let st = newRuleState();
  let asks = 0, rejected = 0;
  let firstSep: number | null = null;
  let prevWaiting: RLine | null = null;
  for (const e of list) {
    const rep = representative(e.pts2d);
    if (!rep) continue;
    const line: RLine = { a: rep.a, b: rep.b };
    let r = stepRule(st, line, SZ);
    if (r.event.type === "ask") {
      asks += 1;
      // **참 축으로 답한다**(오라클). 답한 횟수를 남긴다 — 사람이 개입해야 하는 횟수다
      const truth: "screen" | "depth" | "vertical" =
        e.axis === 2 && !isFiniteVp(fx.sc.vps[2], SZ) ? "screen"
        : e.axis === 2 ? "vertical"
        : isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
      r = stepRule(st, line, SZ, truth);
    }
    if (r.event.type === "rejected") { rejected += 1; continue; }
    if (r.event.type === "vp_fixed" && r.event.source === "two_lines" && prevWaiting) {
      firstSep = sepDeg(prevWaiting, line);
    }
    prevWaiting = r.event.type === "waiting" ? line : prevWaiting;
    st = r.state;
  }
  return { st, asks, rejected, firstSep };
}

type Order = "drawn" | "grouped" | "wide_pair";

/** 대표 직선의 각차 — 순서를 고를 때 쓴다(측정용이고 규칙에는 안 들어간다). */
function repLine(e: DrawnEdge): RLine | null {
  const r = representative(e.pts2d);
  return r ? { a: r.a, b: r.b } : null;
}

/**
 * **그리는 순서**. 규칙 b가 "깊이선 **두 개**의 교점"이므로 어느 둘이 먼저 오는지가
 * 결과를 정한다 — 그래서 세 순서를 다 낸다.
 *
 * ⚠ `grouped`·`wide_pair`는 **참 축 라벨을 쓰는 순서 오라클**이다. 그 사실이 결론에 붙는다(#2).
 */
function orderStrokes(fx: Fx, order: Order): DrawnEdge[] {
  if (order === "drawn") {
    // **축을 번갈아 긋는다** — 픽스처의 `boxLattice`가 이미 축별로 몰아 내므로
    // 그대로 쓰면 `grouped`와 **같은 순서가 되어 두 팔이 한 팔이 된다**(초판이 그랬다).
    // 모서리를 따라가며 그리는 사람에 가까운 순서다
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
  const grouped = [...fx.drawn].sort((a, b) => a.axis - b.axis);
  if (order === "grouped") return grouped;
  // wide_pair — **각차가 가장 큰 두 선을 먼저 긋는다.** 사용자가 벌어진 두 선을 고르는 경우이고,
  // 이 방식이 **얼마나 잘할 수 있는가**의 팔이다(#35 도달 가능성). 추정이 아니라 **순서 선택**이다
  const first = grouped.find(e => isFiniteVp(fx.sc.vps[e.axis], SZ) && e.axis !== 2);
  if (!first) return grouped;
  const same = grouped.filter(e => e.axis === first.axis);
  let best: [DrawnEdge, DrawnEdge] | null = null, bestSep = -1;
  for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) {
    const a = repLine(same[i]), b = repLine(same[j]);
    if (!a || !b) continue;
    const sp = sepDeg(a, b);
    if (sp > bestSep) { bestSep = sp; best = [same[i], same[j]]; }
  }
  if (!best) return grouped;
  const rest = grouped.filter(e => e !== best![0] && e !== best![1]);
  return [best[0], best[1], ...rest];
}

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
}
const bag = (): Bag => ({ errs: [], runs: 0, ok: 0, order: [], asks: 0, rejected: 0, seps: [] });

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
  };
}

// ---------------------------------------------------------------- 측정

describe("규칙 기반 카메라 — 축 방향 오차 (사람 지시 4)", () => {
  it("규칙 팔과 검출 팔을 같은 픽스처에서 함께 낸다", () => {
    const ARMS = ["rule_drawn", "rule_grouped", "rule_wide_pair", "detect"] as const;
    const newArms = (): Record<string, Bag> =>
      Object.fromEntries(ARMS.map(a => [a, bag()])) as Record<string, Bag>;
    const arms = newArms();
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
                if (extra.firstSep != null) t.seps.push(extra.firstSep);
              }
            };

            for (const ord of ["drawn", "grouped", "wide_pair"] as const) {
              const r = runRules(fx, ord);
              record(`rule_${ord}`, vpsOf(r.st), r);
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
          t.seps.push(...b.seps);
        }
      }
    }
    const headNoIdentity = Object.fromEntries(
      Object.entries(noIdentity).map(([k, v]) => [k, summarize(v)]));
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
        },
        ask_policy:
          "물음에는 **참 축으로 답했다**(오라클). 답한 횟수를 `asks_per_run`으로 남긴다 — "
          + "사람이 실제로 몇 번 개입해야 하는가이고 그것이 이 방식의 비용이다.",
      },
      headline: {
        note: "**잡음이 걸린 행만**(0.005·0.01·0.03·0.05). 잡음 0 행은 항등이라 뺐다(#5).",
        ...head,
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
          "무오차 입력에서 규칙의 축 오차는 정의상 0(`by_jitter.jit_0`이 그것이고 표제에서 뺐다). "
          + "항등이므로 오라클로 쓸 수 없다.",
        result: { rule_grouped_median: ruleMed, detect_median: detMed, passed },
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
