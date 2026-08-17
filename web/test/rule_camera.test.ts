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
// **스냅 팔**(5차 이월-2) — 앱이 확정 전에 쓰는 2D 판정 그 함수다(#17: mainL과 같은 출처)
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
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
  + "모집단은 **`headline_no_identity`**(7-R 리뷰어 [10] 정정 — 판정이 읽는 표를 등록문에 적는다): "
  + "**4구도**(`1pt_yaw0_pitch0`을 뺀다 — 그 구도의 축 방향은 f와 무관해 어떤 오차에도 0이 나온다, #5) "
  + "× 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05}이고 **잡음 0 행은 뺀다**"
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
  + "(이전 동작점)의 원장은 git show d724ac0:stage0/out/rule_camera.json이다. "
  + "**[7차 지시 1-a 배선 변경]** 그 '스냅 = 선언'을 **지웠다** — `forcedBySnap`이 `stepRule`의 "
  + "P1 가드를 우회해 차수를 P1에 가두고 있었다. 이 실행의 스냅 팔은 **스냅된 좌표만** 먹이고 "
  + "선언은 규칙이 한다. 옛 배선(우회 살림)의 원장은 git show b52bc7c:stage0/out/rule_camera.json이고, "
  + "**차수·배치 귀결의 대조는 `order_lock.json`의 `bypass`/`fixed` 두 팔이 낸다**(#30 양성 채널).";

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
  /** 스냅/위약 팔에서 **실제로 끝점이 움직인 획 수**(#38 분자). 원시 팔은 0. */
  snapEngaged: number;
  /** 2D 판정을 지난 획 수(#38 **분모** — 리뷰어 [22]. 확정 후 획은 앱에서도 안 지난다). */
  snapQueried: number;
  /** 첫 소실점(two_lines)을 만든 두 선 중 **끝점이 움직였던 것의 수**(0~2, 리뷰어 [22]).
   * two_lines가 안 났거나 원시 팔이면 null. */
  firstPairMoved: number | null;
  /** 최종 상태의 화면 축 슬롯 수 — 직교 스냅이 축을 무한원으로 편 것을 세는 재료(리뷰어 [23]②). */
  screenAxes: number;
}

type RunMode = "raw" | "snap" | "placebo";

/**
 * **획을 차례로 규칙에 넣는다** — 앱의 `feedStroke`와 같은 경로다(#17).
 *
 * `mode`(5차 이월-2 + 리뷰어 대응):
 *   `raw`     — 원시 선(4차까지의 하네스 조건).
 *   `snap`    — 확정(order≥1) 전 획을 앱의 2D 판정(`resolve2dCore`)에 통과시킨다.
 *   `placebo` — **같은 획에서 스냅이 옮겼을 크기만큼 임의 방향으로** 끝점을 옮긴다(#39,
 *               리뷰어 [20]) — 나빠짐이 "스냅의 방향" 때문인지 "그 크기의 이동 일반" 때문인지 가른다.
 */
function runRules(fx: Fx, order: Order, mode: RunMode = "raw",
                  radiusPx = OSNAP_RADIUS_PX, rr?: () => number): RuleRun {
  const list = orderStrokes(fx, order);
  let st = newRuleState();
  let asks = 0, rejected = 0, snapEngaged = 0, snapQueried = 0;
  let firstSep: number | null = null;
  let firstPairMoved: number | null = null;
  let prevWaiting: RLine | null = null;
  /**
   * **스냅 팔의 대기 획** — 앱의 `pend2Segs()` 자리. 여기 들어가는 것은 규칙에 먹인 최종
   * 선이다(앱이 스냅된 `pts2d`를 문서에 남기는 것과 같다).
   * ⚠ 근사 하나: 앱에서는 카메라가 서면 획이 3D로 올라가 3D 오스냅 대상이 되는데,
   * §4.5 보장(승격이 화면 자리를 안 옮긴다)으로 화면 좌표가 같으므로 2D 목록으로 근사한다.
   */
  const fedSegs: Snap2Seg[] = [];
  /** 먹인 선 좌표 → 끝점이 움직였는가(첫 짝 대조용 — 리뷰어 [22]). */
  const movedByKey = new Map<string, boolean>();
  const keyOf = (l: RLine) => `${l.a[0]},${l.a[1]},${l.b[0]},${l.b[1]}`;
  const diag = Math.hypot(SZ[0], SZ[1]);
  for (const e of list) {
    let pts = e.pts2d;
    let moved = false;
    // ⛔ **`forcedBySnap`을 지웠다**(2026-08-18 7차 지시 1-a) — 앱의 `snapForced`가 없어졌으므로
    //    하네스도 안 준다(#17: 측정 경로와 앱 경로가 갈라지지 않는다). 5차 지시 3의
    //    "스냅이 곧 선언이다"가 `stepRule`의 **P1 가드를 우회**하고 있었다.
    // **앱과 같은 조건**: 2D 판정(오스냅·직교·vp_dir·정렬)은 **카메라 확정 전**에만 돈다
    // (`mainL`: `frame() ? raw : resolve2d(raw)` — standing ⟺ order ≥ 1). 확정 후의 규칙
    // 입력은 앱에서도 원시 선이다(`feedStroke`가 3D 스냅보다 먼저 돈다).
    if (mode !== "raw" && perspectiveOrder(st) === 0) {
      snapQueried += 1;
      const cands = fedSegs.length ? static2dCandidates(fedSegs, diag) : [];
      const r2 = resolve2dCore(pts, { cands, vps: vpsOf(st), radiusPx, relSnap: true });
      const a0 = pts[0], b0 = pts[pts.length - 1];
      const a2 = r2.pts[0], b2 = r2.pts[r2.pts.length - 1];
      const dA = Math.hypot(a2[0] - a0[0], a2[1] - a0[1]);
      const dB = Math.hypot(b2[0] - b0[0], b2[1] - b0[1]);
      if (mode === "snap") {
        pts = r2.pts;
        moved = dA > 1e-9 || dB > 1e-9;
        // **스냅은 좌표만 옮긴다** — 선언은 규칙이 한다(7차 지시 1-a).
      } else {
        // **위약**: 같은 크기, 임의 방향(#39). 스냅이 안 움직였으면 위약도 안 움직인다
        if ((dA > 1e-9 || dB > 1e-9) && rr) {
          const th1 = 2 * Math.PI * rr(), th2 = 2 * Math.PI * rr();
          const ap: Pt2 = [a0[0] + dA * Math.cos(th1), a0[1] + dA * Math.sin(th1)];
          const bp: Pt2 = [b0[0] + dB * Math.cos(th2), b0[1] + dB * Math.sin(th2)];
          pts = [ap, bp];
          moved = true;
        }
      }
      if (moved) snapEngaged += 1;
    }
    const rep = representative(pts);
    if (!rep) continue;
    const line: RLine = { a: rep.a, b: rep.b };
    movedByKey.set(keyOf(line), moved);
    fedSegs.push({ id: `f${fedSegs.length}`, a: line.a, b: line.b });
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
    if (r.event.type === "vp_fixed" && r.event.source === "two_lines") {
      if (prevWaiting) firstSep = sepDeg(prevWaiting, line);
      if (mode !== "raw") {
        const partner = r.event.paired ? movedByKey.get(keyOf(r.event.paired)) : undefined;
        firstPairMoved = (moved ? 1 : 0) + (partner ? 1 : 0);
      }
    }
    prevWaiting = r.event.type === "waiting" ? line : prevWaiting;
    st = r.state;
  }
  const screenAxes = st.slots.filter(sl => sl && sl.kind === "screen").length;
  return { st, asks, rejected, firstSep, snapEngaged, snapQueried, firstPairMoved, screenAxes };
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
  /** 끝점이 움직인 획 수(#38 분자). 원시 팔은 0. */
  snapped: number;
  /** 2D 판정을 지난 획 수(#38 분모 — 리뷰어 [22]). */
  queried: number;
  /** 첫 짝(two_lines) 중 움직였던 선 수의 합과, two_lines가 난 실행 수(리뷰어 [22]). */
  firstPairMoved: number; firstPairRuns: number;
  /** 화면 축 슬롯 수 합(리뷰어 [23]② — 직교 스냅의 무한원 편평화 대조). */
  screenAxes: number;
}
const bag = (): Bag => ({ errs: [], runs: 0, ok: 0, order: [], asks: 0, rejected: 0, seps: [],
                          snapped: 0, queried: 0, firstPairMoved: 0, firstPairRuns: 0,
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
              const r = runRules(fx, ord);
              record(`rule_${ord}`, vpsOf(r.st), r);
              // **스냅 팔**(5차 이월-2) — 같은 획을 앱의 2D 판정(resolve2dCore)에 통과시켜 먹인다
              const rs = runRules(fx, ord, "snap");
              record(`rule_${ord}_snap`, vpsOf(rs.st), rs);
              // **위약 팔**(#39, 리뷰어 [20]) — 스냅이 옮겼을 크기만큼 임의 방향 이동
              const rp = runRules(fx, ord, "placebo", OSNAP_RADIUS_PX,
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
              const r4 = runRules(fx, "grouped", "snap", 4);
              record("rule_grouped_snap_r4", vpsOf(r4.st), r4);
              const r40 = runRules(fx, "grouped", "snap", 40);
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
          "⚠⚠ **7차 지시 1-a로 뒤집혔다**(7-R 리뷰어 [8] — 이 필드가 8-R′에 이어 **같은 자리에서 "
          + "두 번째로 낡았다**, #34). 현행 배선: **스냅 팔도 강제하지 않는다** — 스냅은 좌표만 "
          + "옮기고 선언은 규칙이 한다. 5차 지시 3의 '스냅 = 선언'은 `stepRule`의 P1 가드를 "
          + "우회했고 그것이 D-L70으로 지워졌다. 물음에는 **모든 팔에서** 참 축으로 답한다(오라클). "
          + "답한 횟수는 `asks_per_run` — 사람이 실제로 몇 번 개입해야 하는가이고 그것이 이 방식의 "
          + "비용이다. 판 셋의 원장: 물음 오라클 `git show d724ac0:` · 무물음 선언 "
          + "`git show b52bc7c:` · 현행(이 파일).",
      },
      headline: {
        note: "**잡음이 걸린 행만**(0.005·0.01·0.03·0.05). 잡음 0 행은 항등이라 뺐다(#5).",
        ...head,
      },
      what_this_does_not_say: [
        "합성 잉크는 짝을 의도하지 않는다(AS-L13의 자리) — 사람은 X 교차·연장 수렴으로 짝을 긋는다. 실획(K)이 최종 판정자다",
        "시드별 분해가 없다(#14) — 원시↔스냅 격차가 시드 폭 안인지 미확인이다(격차 값은 headline_no_identity를 그 자리에서 읽는다 — 수치를 여기 적으면 재실행마다 낡는다, #1). 짝지은 부분집합(paired_headline)이 표본 짝은 맞추지만 시드 폭은 못 대고, **축 분모는 여전히 다르다**(예: drawn 짝 층에서 raw_axes 대 snap_axes — 무한원 편평화의 선택 효과, 리뷰어 [3-6])",
        "⚠ **배선 판이 셋이다**(7차 지시 1-a로 하나 늘었다): ① 물음 오라클(지시 3 이전) `git show d724ac0:stage0/out/rule_camera.json` ② 무물음 선언(직교→screen·vp_dir→depth 강제) `git show b52bc7c:stage0/out/rule_camera.json` ③ **현행 — 강제 없음**(D-L70). 이 파일은 ③이다. 물음에는 참 축으로 답한다(오라클) — 어느 팔도 실사용 성능이 아니다",
        "카메라 확정 후 3D 오스냅·축 스냅의 효과는 2D 목록 근사 밖이다(§4.5 보장으로 화면 좌표는 같다)",
        "무한원 축 제외는 원시 팔에서는 항등 제거지만 **스냅 팔에서는 선택이 될 수 있다**(리뷰어 [23]② — 직교 스냅이 얕은 축을 화면 축으로 펴면 그 축이 분모에서 빠진다). screen_axes_total이 그 대조 재료다",
      ],
      headline_jit0_no_identity: {
        note: "**jit_0 층**(리뷰어 [21]) — endJitter 0이지만 등급 잉크 잡음은 남는 층. 4차 등록이 "
          + "'항등'이라며 표제에서 뺐는데 그 사유가 틀렸다(실측이 0이 아니다). 모집단 연속성으로 "
          + "표제는 유지하고 이 층을 따로 낸다 — 1pt 구도는 여기서도 뺐다(그쪽은 진짜 구성 항등).",
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
