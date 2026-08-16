// **축 스냅 × 지평선 제약** — 산출: `stage0/out/axis_snap.json`.
//
// 사람 지시 4: "축 스냅 켬/끔, 지평선 제약 켬/끔 **네 팔**로 잰다. 기존 픽스처와 조건
// (L-A.6 / `rule_camera`). 축 오차 — 번갈아 긋기 / 몰아 긋기 각각 · 배치율 ·
// 조용히 틀린 배치 · 모호 판정 발동 빈도와 정확도. 모호 판정 임계도 스윕한다."
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 이 항목에 걸리는 번호:
//   #5   ⚠⚠ **"축 오차가 준다"의 절반은 설계 보장이다.** 축 스냅이 켜지면 확정 후 선은
//        **정의상** 축을 정확히 따르므로 그 선들이 오차에 기여하지 않는다 — 그것은 측정이
//        아니다. 그래서 이 하네스가 재는 것은 **카메라 축 오차**(첫 선들이 정한다)와
//        **배치·조용히 틀림**(축 스냅이 실제로 바꾸는 것)이고, 그 사실을 원장에 적는다.
//   #11  분모 — **카메라가 안 서는 실행도 센다.** 팔마다 모집단이 같아야 비교가 성립한다
//   #12  동작점 하나 금지 — 잡음 5수준 × 등급 2 · 모호 임계 스윕
//   #14  시드 여섯. 분자/분모로 적는다
//   #26  게이트를 측정 전에 박는다
//   #38  **모호 판정이 한 번도 발동 안 하면 그 팔은 공허하다** — 발동 수를 함께 낸다
//   #39  제약(지평선)을 걸 때 **위약 팔**을 함께 돌린다 — "같은 크기의 무의미한 제약"과 가른다
//   #41  이것은 **항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건이 아니다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverCamera, isFiniteVp, lineIntersect, type Pt2 } from "../src/s3d/camera.js";
import { fPixelsFrom35mm } from "../src/s3d/constraints.js";
import { DEFAULT_LENS_MM } from "../src/ui/camState.js";
import { representative } from "../src/s3d/axis.js";
import {
  newRuleState, stepRule, vpsOf, axisDirsOf, axisOfStroke, defaultHorizon,
  type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { snapToAxis, SNAP_TOL_AXIS } from "../src/s3d/axisSnap.js";
import { liftAll, type LiftStroke } from "../src/s3d/lift.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge } from "./scene3d.js";
import { axisDirErrors, perStrokeError, metricsSnapshot, rate } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";
import { project, unit3, sub3, norm3, type Vec3 } from "../src/s3d/geom3d.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** **`rule_camera`와 같은 조건**(L-A.6). 팔 넷을 비교하려면 픽스처가 같아야 한다(#27). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0.005, 0.01, 0.03, 0.05];       // **잡음 0 행은 항등이라 안 돈다**(#5)
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const ORDERS = ["drawn", "grouped"] as const;     // 번갈아 긋기 / 몰아 긋기
const AMBIG_SWEEP = [0, 3, 6, 12, 24];            // 모호 임계 스윕(사람 지시 4)

const REGISTERED =
  "**축 스냅 켬**이 **끔**보다 ① 배치율이 안 줄고 ② 조용히 틀린 배치 비율이 안 늘고 "
  + "③ **번갈아 긋기와 몰아 긋기의 축 오차 격차**(순서 의존)가 준다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 {0.005,0.01,0.03,0.05}이고 팔마다 같다(#11). "
  + "⚠ **축 오차 자체가 주는 것은 기준이 아니다** — 축 스냅이 켜지면 확정 후 선이 "
  + "**정의상** 축을 따르므로 그 감소분의 일부는 측정이 아니라 설계 보장이다(#5). "
  + "⚠ 이것은 **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건이 아니다(#41).";

// ---------------------------------------------------------------- 픽스처

interface Fx { sc: Scene; drawn: DrawnEdge[]; edges: { a: Vec3; b: Vec3 }[]; diag: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q2 of pts) diag = Math.max(diag, norm3(sub3(p, q2)));
  return { sc, drawn, edges: edges.map(e => ({ a: e.a, b: e.b })), diag };
}

function orderStrokes(fx: Fx, order: (typeof ORDERS)[number]): DrawnEdge[] {
  if (order === "grouped") return [...fx.drawn].sort((a, b) => a.axis - b.axis);
  // **축을 번갈아 긋는다** — 픽스처가 축별로 몰아 내므로 그대로 쓰면 두 팔이 한 팔이 된다
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

// ---------------------------------------------------------------- 한 실행

interface Arm {
  /** 축 스냅 — 그리는 동안 축으로 강제하는가(사람 지시 1). */
  snap: boolean;
  /** 지평선 제약 — 모든 수평 소실점이 한 지평선 위인가(사람 지시 2). */
  horizon: boolean;
  /** **위약**(#39) — 지평선을 **틀린 높이**에 고정한다. "제약 자체"와 "그 크기의 이동"을 가른다. */
  placebo?: boolean;
  ambiguous_deg?: number;
}

interface RunOut {
  cameraOk: boolean;
  axisErrs: number[];
  order: number;
  placed: number; total: number;
  /** 형태 오차 — `perStrokeError`. 조용히 틀린 배치를 세는 재료다. */
  shape: number[];
  ambigFired: number; ambigRight: number; ambigTotal: number;
  /** **축 스냅이 실제로 덮어쓴 획 수**(#38) — 0이면 그 팔은 축 스냅을 안 돈 것이다. */
  snapped: number;
}

/**
 * **한 그림을 처음부터 끝까지 돌린다** — 앱 경로와 같은 함수들을 부른다(#17).
 *
 * ① 규칙에 선을 차례로 넣어 카메라를 세운다(`stepRule`)
 * ② 카메라가 서면 **그 뒤의 선을 축 스냅으로 다시 긋는다**(`snapToAxis`) — 그것이 사람 지시 1이다
 * ③ 전부 `liftAll`로 올려 배치·형태 오차를 낸다
 */
function runOne(fx: Fx, order: (typeof ORDERS)[number], arm: Arm): RunOut {
  const list = orderStrokes(fx, order);
  let st = newRuleState(SZ);
  if (!arm.horizon) {
    // **지평선 제약을 끈 팔**: 소실점을 지평선에 안 묶는다 — 옛 규칙처럼 **두 선의 교점**으로 낸다.
    // 그래서 이 팔은 `stepRule`을 안 쓰고 아래에서 따로 푼다.
  }
  if (arm.placebo) {
    // **위약**(#39): 지평선을 **틀린 높이**로 옮긴다. 제약의 형태는 그대로이고 값만 틀리다
    st = { ...st, horizon: defaultHorizon(SZ) + 0.18 * SZ[1] };
  }

  let ambigFired = 0, ambigRight = 0, ambigTotal = 0;
  const reps = list.map(e => ({ e, rep: representative(e.pts2d) })).filter(x => x.rep);

  /**
   * **카메라가 선 뒤에 그은 획의 id** — 축 스냅이 실제로 도는 집합이다.
   * ⚠ 앱에서 축 스냅은 **확정 뒤**에만 돈다(그 전에는 축이 없다). 처음에 전부 다시
   * 스냅했더니 **카메라를 세운 획까지 덮어써서** 형태 오차가 0.44 → 0.74로 나빠졌다 —
   * 그것은 기전의 성질이 아니라 **하네스가 앱 경로를 안 따른 것**이었다(#17).
   */
  const afterCamera = new Set<string>();
  if (arm.horizon) {
    for (const { e, rep } of reps) {
      const idx = fx.drawn.indexOf(e);
      if (vpsOf(st).some(v => v && isFiniteVp(v, SZ))) afterCamera.add(`s${idx}`);
      const line: RLine = { a: rep!.a, b: rep!.b };
      let r = stepRule(st, line, SZ);
      if (r.event.type === "ask") {
        const truth: "screen" | "depth" | "vertical" =
          e.axis === 2 && !isFiniteVp(fx.sc.vps[2], SZ) ? "screen"
          : e.axis === 2 ? "vertical"
          : isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
        r = stepRule(st, line, SZ, truth);
      }
      if (r.event.type !== "rejected") st = r.state;
    }
  } else {
    // **지평선 없는 팔** — 같은 축의 선 둘의 교점으로 소실점을 낸다(옛 규칙 b).
    // ⚠ 참 축 라벨을 쓰므로 **오라클이다**. 지평선 팔은 라벨을 안 쓰므로 이 팔이 **유리하다** —
    // 그래도 지평선 팔이 이기면 그 차이는 실재한다(불리한 대조군을 둔다).
    const byAxis: RLine[][] = [[], [], []];
    for (const { e, rep } of reps) byAxis[e.axis].push({ a: rep!.a, b: rep!.b });
    const slots: RuleState["slots"] = [null, null, null];
    for (const ax of [0, 1, 2] as const) {
      const ls = byAxis[ax];
      if (!isFiniteVp(fx.sc.vps[ax], SZ)) {
        // 무한원 축 — 화면 가로/세로 선언
        if (ls.length) {
          const d = Math.abs(ls[0].b[1] - ls[0].a[1]) < Math.abs(ls[0].b[0] - ls[0].a[0]) ? "h" : "v";
          const idx = d === "v" ? 2 : ([0, 1] as const).find(i => !slots[i]);
          if (idx != null) slots[idx] = { kind: "screen", dir: d, support: ls.length };
        }
        continue;
      }
      if (ls.length < 2) continue;
      const at = lineIntersect(ls[0].a, ls[0].b, ls[1].a, ls[1].b);
      if (at && isFiniteVp(at, SZ)) {
        const idx = ax === 2 ? 2 : ([0, 1] as const).find(i => !slots[i]);
        if (idx != null) slots[idx] = { kind: "vp", at, source: "two_lines", support: ls.length };
      }
    }
    st = { slots, horizon: defaultHorizon(SZ), verticalLines: [], distance: null };
    // 지평선 없는 팔에서는 **축마다 두 선이 필요**하므로, 각 축의 셋째 획부터가 "확정 뒤"다
    const seen: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (const { e } of reps) {
      const idx = fx.drawn.indexOf(e);
      if ((seen[e.axis] ?? 0) >= 2) afterCamera.add(`s${idx}`);
      seen[e.axis] = (seen[e.axis] ?? 0) + 1;
    }
  }

  const vps = vpsOf(st);
  const nF = vps.filter(v => v && isFiniteVp(v, SZ)).length;
  const cam = recoverCamera(vps, SZ,
    nF === 1 ? { fSetting: fPixelsFrom35mm(DEFAULT_LENS_MM, SZ[0]) } : {});
  const out: RunOut = {
    cameraOk: cam.ok, axisErrs: [], order: nF, placed: 0, total: fx.drawn.length,
    shape: [], ambigFired, ambigRight, ambigTotal, snapped: 0,
  };
  if (!cam.ok || cam.f == null || !cam.principalPoint) return out;
  const P = cam.principalPoint, f = cam.f;
  out.axisErrs = axisDirErrors(vps, P, f, fx.sc.axes);
  const dirs = axisDirsOf(st, P, f);

  // ---- 배치. **축 스냅 팔은 앵커에서 축으로 강제한다**(사람 지시 1-c)
  const input: LiftStroke[] = fx.drawn.map((e, i) => ({
    id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: axisOfStroke(e.pts2d as Pt2[], st).axis,
  }));
  const lifted = liftAll(input, { principal: P, f, vps, imgSize: SZ, axisDirs: dirs });
  const placedMap = new Map(lifted.placed);

  if (arm.snap) {
    // **놓인 획을 앵커로 삼아, 그 뒤 획을 축 스냅으로 다시 긋는다.**
    // ⚠ 이것이 "확정 후 선은 축을 정확히 따른다"의 구현이고 **그 부분은 설계 보장이다**(#5).
    // **슬롯 번호 ↔ 참 축 번호 대조표**(#41 프레임 혼동) — 규칙의 슬롯 순서는 장면의
    // 축 순서와 다르다. 방향이 가장 가까운 참 축으로 맞춰야 "정확한가"가 뜻을 갖는다
    const slotToTrue = dirs.map(d => {
      if (!d) return -1;
      let bi = -1, bv = -1;
      fx.sc.axes.forEach((t, k) => {
        const c = Math.abs(d[0] * t[0] + d[1] * t[1] + d[2] * t[2]) / (norm3(d as Vec3) * norm3(t));
        if (c > bv) { bv = c; bi = k; }
      });
      return bi;
    });
    for (let i = 0; i < input.length; i++) {
      const seg = placedMap.get(input[i].id);
      if (!seg) continue;
      if (!afterCamera.has(input[i].id)) continue;      // **확정 뒤 획만**(앱 경로)
      // ⚠ **앵커의 화면 좌표는 앵커를 되쏜 것이어야 한다.** 처음에 `pts2d[0]`을 넣었더니
      // 앵커(3D)와 기준점(2D)이 어긋나 각차가 엉망이 됐고 **모호 판정이 97% 발동**했다.
      // #38이 말하는 "발동 수를 함께 내라"가 그 자리에서 버그를 잡았다.
      const a2 = project(seg.a, P, f);
      if (!a2) continue;
      const b2 = fx.drawn[i].pts2d[fx.drawn[i].pts2d.length - 1] as Pt2;
      const ch = snapToAxis(seg.a, dirs as (Vec3 | null)[], a2, b2, { principal: P, f },
                            { ambiguous_deg: arm.ambiguous_deg ?? SNAP_TOL_AXIS.ambiguous_deg });
      if (!ch.pick) continue;
      out.ambigTotal += 1;
      out.snapped += 1;
      if (ch.ambiguous) {
        out.ambigFired += 1;
        // **정확한가** — 참 축과 같은 것을 골랐는가. 무한원 축은 라벨이 그대로다
        if (slotToTrue[ch.pick.axis] === fx.drawn[i].axis) out.ambigRight += 1;
      }
      placedMap.set(input[i].id, { a: ch.pick.seg[0], b: ch.pick.seg[1] });
    }
  }

  out.placed = placedMap.size;
  // ---- 형태 오차 — **정의는 `metrics.ts` 하나다**(#17·#23). 게이지는 그 집합에서 적합한다
  //   (자기 게이지 — 전역 배율이 자유도로 남아 있으므로 그것이 옳다, §5.4)
  out.shape = perStrokeError(placedMap, fx.edges, fx.diag);
  return out;
}

// ---------------------------------------------------------------- 집계

const q = (xs: number[], p: number): number | null => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
};

interface Bag {
  runs: number; ok: number; errs: number[]; shape: number[];
  placed: number; total: number;
  ambigFired: number; ambigRight: number; ambigTotal: number;
  /** **축 스냅이 실제로 덮어쓴 획 수**(#38) — 0이면 그 팔은 축 스냅을 안 돈 것이다. */
  snapped: number;
}
const bag = (): Bag => ({ runs: 0, ok: 0, errs: [], shape: [], placed: 0, total: 0,
                          ambigFired: 0, ambigRight: 0, ambigTotal: 0, snapped: 0 });

function add(b: Bag, r: RunOut) {
  b.runs += 1; if (r.cameraOk) b.ok += 1;
  b.errs.push(...r.axisErrs); b.shape.push(...r.shape);
  b.placed += r.placed; b.total += r.total;
  b.ambigFired += r.ambigFired; b.ambigRight += r.ambigRight; b.ambigTotal += r.ambigTotal;
  b.snapped += r.snapped;
}

/** **조용히 틀린 배치** — 놓였는데 형태 오차가 절단값을 넘는 것. 절단값을 하나 안 고른다(#13). */
const silent = (shape: number[], cut: number) => shape.filter(x => x > cut).length;

function summarize(b: Bag) {
  return {
    runs: b.runs, camera_ok: b.ok, camera_ok_rate: rate(b.ok, b.runs),
    axes_measured: b.errs.length,
    deg_median: round(median(b.errs), 4), deg_p90: round(q(b.errs, 0.9), 4),
    // **분자/분모로 적는다**(#14)
    placed: b.placed, strokes: b.total, placed_rate: rate(b.placed, b.total),
    shape_median: round(median(b.shape), 4), shape_p90: round(q(b.shape, 0.9), 4),
    silent_0_1: b.shape.length ? silent(b.shape, 0.1) : 0,
    silent_0_2: b.shape.length ? silent(b.shape, 0.2) : 0,
    silent_0_5: b.shape.length ? silent(b.shape, 0.5) : 0,
    silent_denom: b.shape.length,
    silent_0_2_rate: rate(silent(b.shape, 0.2), b.shape.length),
    // **모호 판정이 실제로 돌았는가**(#38) — 0이면 그 칸은 공허하다
    // **축 스냅이 실제로 덮어쓴 획 수**(#38) — 0이면 그 팔은 이 기전을 안 돈 것이다
    snapped_strokes: b.snapped,
    ambiguous_fired: b.ambigFired, ambiguous_checked: b.ambigTotal,
    ambiguous_fire_rate: rate(b.ambigFired, b.ambigTotal),
    ambiguous_right: b.ambigRight, ambiguous_accuracy: rate(b.ambigRight, b.ambigFired),
  };
}

// ---------------------------------------------------------------- 측정

describe("축 스냅 × 지평선 제약 — 네 팔 (사람 지시 4)", () => {
  it("측정을 원장에 남긴다", () => {
    const ARMS: { name: string; arm: Arm }[] = [
      { name: "snap_on__horizon_on", arm: { snap: true, horizon: true } },
      { name: "snap_off__horizon_on", arm: { snap: false, horizon: true } },
      { name: "snap_on__horizon_off", arm: { snap: true, horizon: false } },
      { name: "snap_off__horizon_off", arm: { snap: false, horizon: false } },
      // **위약**(#39) — 지평선을 **틀린 높이**에 고정한다. 제약의 형태는 같고 값만 틀리다
      { name: "placebo_wrong_horizon", arm: { snap: true, horizon: true, placebo: true } },
    ];
    const byArmOrder: Record<string, Bag> = {};
    const byAmbig: Record<string, Bag> = {};
    let fixtures = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS) {
        const fx = fixture(ci, jit, grade, seed);
        if (!fx) continue;
        fixtures += 1;
        for (const { name, arm } of ARMS) for (const ord of ORDERS) {
          const k = `${name}__${ord}`;   // ⚠ `|`를 안 쓴다 — 게이트의 점 경로가 못 푼다(#40)
          (byArmOrder[k] ??= bag());
          add(byArmOrder[k], runOne(fx, ord, arm));
        }
        // 모호 임계 스윕 — **켬·지평선 켬** 팔에서만 돈다(다른 팔은 그 장치를 안 쓴다)
        for (const ad of AMBIG_SWEEP) {
          const k = `deg_${ad}`;
          (byAmbig[k] ??= bag());
          add(byAmbig[k], runOne(fx, "drawn", { snap: true, horizon: true, ambiguous_deg: ad }));
        }
      }
    }

    const table = Object.fromEntries(Object.entries(byArmOrder).map(([k, v]) => [k, summarize(v)]));
    const sweep = Object.fromEntries(Object.entries(byAmbig).map(([k, v]) => [k, summarize(v)]));

    /** **순서 의존** — 번갈아 긋기와 몰아 긋기의 축 오차 격차. 작을수록 순서에 안 휘둘린다. */
    const orderGap = (name: string): number | null => {
      const a = table[`${name}__drawn`]?.deg_median, b = table[`${name}__grouped`]?.deg_median;
      return a != null && b != null ? +Math.abs(a - b).toFixed(4) : null;
    };
    const gapOn = orderGap("snap_on__horizon_on");
    const gapOff = orderGap("snap_off__horizon_off");
    const placedOn = table["snap_on__horizon_on__drawn"].placed_rate;
    const placedOff = table["snap_off__horizon_on__drawn"].placed_rate;
    const silentOn = table["snap_on__horizon_on__drawn"].silent_0_2_rate;
    const silentOff = table["snap_off__horizon_on__drawn"].silent_0_2_rate;

    const out = {
      what: "축 스냅(라이노 직교 모드)과 지평선 고정 제약을 네 팔로 가른다. 위약 팔을 함께 돌린다.",
      how: {
        fixtures, compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, orders: ORDERS,
        ambiguous_sweep: AMBIG_SWEEP,
        jitter_0_excluded: "무오차 입력은 항등이라 안 돈다(#5).",
        arms: {
          snap_on: "확정 후 획을 **앵커에서 축으로 강제**한다(`snapToAxis`). 커서를 안 따라간다",
          snap_off: "그은 대로 푼다(`liftAll`의 결과 그대로)",
          horizon_on: "모든 수평 소실점이 **한 지평선 위**다(`stepRule`). 라벨을 안 쓴다",
          horizon_off: "**같은 축 두 선의 교점**으로 소실점을 낸다(옛 규칙 b). "
            + "⚠ **참 축 라벨을 쓰는 오라클이라 이 팔이 유리하다** — 그래도 지평선 팔이 이기면 실재한다",
          placebo_wrong_horizon: "지평선을 **틀린 높이**(+0.18·H)에 고정한다(#39) — "
            + "'제약이 있다'와 '그 제약이 맞다'를 가른다",
        },
        what_this_does_not_measure:
          "⚠⚠ **축 스냅이 축 오차를 줄이는 것의 일부는 설계 보장이다**(#5) — 확정 후 선은 "
          + "정의상 축을 따른다. 그래서 `deg_*`만 보면 안 되고 **배치율·조용히 틀림·순서 격차**를 "
          + "함께 본다. 그 셋이 이 기전이 실제로 바꾸는 것이다.",
      },
      by_arm_order: table,
      by_ambiguous_deg: sweep,
      order_dependence: {
        note: "번갈아 긋기 ↔ 몰아 긋기의 축 오차 중앙값 격차(도). **작을수록 순서에 안 휘둘린다.**",
        snap_on__horizon_on: gapOn,
        snap_off__horizon_on: orderGap("snap_off__horizon_on"),
        snap_on__horizon_off: orderGap("snap_on__horizon_off"),
        snap_off__horizon_off: gapOff,
        placebo_wrong_horizon: orderGap("placebo_wrong_horizon"),
      },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**오라클은 `horizon_off` 팔이다** — 그 팔은 **참 축 라벨**로 같은 축의 선을 골라 "
          + "교점을 내므로 라벨을 안 쓰는 지평선 팔보다 **유리한 조건**이다. 그보다 나으면 "
          + "그 차이는 라벨 없이 얻은 것이다. ⚠ 오라클을 상한이라 부르지 않는다(#35).",
        reachability_value: table["snap_off__horizon_off__drawn"].deg_median ?? -1,
        reachability_source: "by_arm_order/snap_off__horizon_off__drawn/deg_median",
        result: {
          placed_rate_on: placedOn, placed_rate_off: placedOff,
          silent_0_2_rate_on: silentOn, silent_0_2_rate_off: silentOff,
          order_gap_on: gapOn, order_gap_off: gapOff,
          passed: placedOn != null && placedOff != null && silentOn != null && silentOff != null
                  && gapOn != null && gapOff != null
                  && placedOn >= placedOff && silentOn <= silentOff && gapOn <= gapOff,
        },
        note: "⚠ **이 항목이 등록한 게이트다**(#41). CLAUDE.md §2의 중단 조건(실측 축 오차 0.5°)이 아니다.",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "axis_snap.json"), JSON.stringify(out, null, 2));

    // **덮는 대상이 0이 아닌가**(#38) — 0이면 이 원장은 아무것도 안 잰 것이다
    expect(fixtures).toBeGreaterThan(0);
    expect(table["snap_on__horizon_on__drawn"].axes_measured).toBeGreaterThan(0);
    expect(table["snap_on__horizon_on__drawn"].silent_denom).toBeGreaterThan(0);
  }, 600_000);
});
