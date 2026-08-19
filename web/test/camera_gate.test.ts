// **L-A.5d + L-A.6** — 산출: `stage0/out/camera_gate.json`.
// 계획서 §5.4(카메라 확정 — 사용자가 맞춘다) · §5.5(축 방향 오차 곡선).
//
// L-A.4가 원인을 좁혔다: **올리기는 맞고 카메라가 틀렸다.** 지배항은 f가 아니라
// **3D 축 방향 오차**(검출에서 중앙 4.18°)다. 여기서 두 가지를 잰다.
//
//   ① **축 방향 오차 → 형태 오차 곡선** (§5.5 b). 임계가 어디인가.
//      이것이 동시에 **사용자 조정의 대리 측정**이다(§5.4) — 사람이 소실점을 얼마나
//      정확히 맞추는지는 표본이 없으므로(AS-C1) **참 소실점에 각도 오차를 준 것**을 대리로 쓴다.
//      **대리라는 사실이 결론에 붙는다**(PITFALLS #2: 대리값의 성질을 재는 것은 아닌지).
//   ② **획 수 → 축 방향 오차 곡선** (§5.5 a). 자동 검출이 어디서부터 임계 아래로 가는가.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #2(대리값)  #8(꼬리)  #11(분모)  #12(동작점 하나 금지)  #13(절단값)
//   #14(분자/분모)  #25(원장)  #26(사전 등록)
import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectVps, linesFromStrokes, assignAxes, classifyByDetection } from "../src/s3d/vpDetect.js";
import { liftAll, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import type { Axis } from "../src/s3d/axis.js";
import {
  norm3, sub3, add3, mul3, dot3, cross3, unit3, axisDirection, type Vec3,
} from "../src/s3d/geom3d.js";
import { rng32, gauss, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, stat, round, median,
         type Scene, type TrueEdge } from "./scene3d.js";
import { perStrokeError, axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

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
/** 대리 측정의 축 방향 오차(도). 사용자 지시는 0.5·1·2이고 곡선을 위해 앞뒤를 넓혔다. */
const AXIS_ERRS = [0, 0.25, 0.5, 1, 2, 4, 8];
/** 등분 수 → 축당 획 수 `(k+1)²·k`: 4 / 18 / 48 / 100. */
const LATTICE_K = [1, 2, 3, 4];
/** k가 커지면 검출 비용이 `O(n³)`이라 시드·잡음·구도를 줄인다. **줄인 사실을 원장에 적는다.** */
const BIG_K_COMPS = [0, 1, 2];

const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; diag: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number, k = 1): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], k);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + k * 17 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return {
    sc, edges, diag,
    strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })),
  };
}

/**
 * **축 방향을 `deg`만큼 돌린 소실점** — 사용자 조정의 대리값(§5.4).
 *
 * 축마다 **독립으로** 돌린다. 전체를 같이 돌리면 그것은 게이지(전역 회전)라 형태 오차가
 * 0이 되어 아무것도 안 잰다 — 사람이 소실점 셋을 따로 끄는 상황과도 다르다.
 * 독립 회전은 **직교성을 깨고**, 그것이 실제로 일어나는 일이다(사용자가 세 점을 따로 찍는다).
 * 그 뒤 `recoverCamera`가 수심으로 f를 다시 낸다 — 앱이 할 일과 같다.
 *
 * ⚠ **대리값이다.** 사람이 실제로 몇 도까지 맞추는지는 표본이 없다(AS-C1·AS-L9).
 */
function perturbedVps(sc: Scene, deg: number, r: () => number): (Pt2 | null)[] {
  if (deg <= 0) return trueVps(sc);
  const th = (deg * Math.PI) / 180;
  return [0, 1, 2].map(i => {
    const v = sc.vps[i as 0 | 1 | 2];
    if (!isFiniteVp(v, SZ)) return null;               // 화면 평행 축은 끌 소실점이 없다
    const d = unit3(axisDirection(v, sc.principal, sc.f));
    // d에 수직인 임의 방향으로 th만큼 돌린다(결정론적 rng)
    let u = cross3(d, [0, 1, 0]);
    if (norm3(u) < 1e-6) u = cross3(d, [1, 0, 0]);
    u = unit3(u);
    const w = unit3(cross3(d, u));
    const phi = 2 * Math.PI * r();
    const axis = add3(mul3(u, Math.cos(phi)), mul3(w, Math.sin(phi)));
    const nd = unit3(add3(mul3(d, Math.cos(th)), mul3(axis, Math.sin(th))));
    if (Math.abs(nd[2]) < 1e-3) return null;           // 화면 평행으로 넘어갔다
    return [sc.principal[0] + (sc.f * nd[0]) / nd[2],
            sc.principal[1] + (sc.f * nd[1]) / nd[2]] as Pt2;
  });
}

/**
 * 검출 축 방향 ↔ 가장 가까운 참 축 방향의 각(도). **번호 규약과 무관하다.**
 * 정의는 `metrics.axisDirErrors` 하나다 — `draft_recover`에 **바이트 동일한 복사본**이 있었다.
 */
const axisErrs = (vps: (Pt2 | null)[], principal: Pt2, f: number, sc: Scene): number[] =>
  axisDirErrors(vps, principal, f, sc.axes);

const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/** 카운터. **절단값을 하나 고르지 않는다**(PITFALLS #13) — 0.1·0.2·0.5를 다 낸다. */
const bag = () => ({
  scenes: 0, comp: 0, placedOfComp: 0, placedOfAll: 0, total: 0, placed: 0,
  wrong10: 0, wrong20: 0, wrong50: 0,
  shapeMed: [] as number[], shapeP90: [] as number[],
  fErr: [] as number[], axErr: [] as number[], camOk: 0,
});
type Bag = ReturnType<typeof bag>;
const report = (b: Bag) => ({
  scenes: b.scenes,
  camera_ok: { k: b.camOk, n: b.scenes, rate: rate(b.camOk, b.scenes) },
  placement: { k: b.placedOfComp, n: b.comp, rate: rate(b.placedOfComp, b.comp),
               of_all: { k: b.placedOfAll, n: b.total, rate: rate(b.placedOfAll, b.total) } },
  silent_wrong: {
    cut_0_1: { k: b.wrong10, n: b.placed, rate: rate(b.wrong10, b.placed) },
    cut_0_2: { k: b.wrong20, n: b.placed, rate: rate(b.wrong20, b.placed) },
    cut_0_5: { k: b.wrong50, n: b.placed, rate: rate(b.wrong50, b.placed) },
  },
  shape_err_median: stat(b.shapeMed), shape_err_p90: stat(b.shapeP90),
  f_rel_err: stat(b.fErr), axis_dir_err_deg: stat(b.axErr),
});

/** 주어진 소실점 집합으로 올리고 카운터에 넣는다. 축 라벨은 **참값**을 준다(카메라만 본다). */
function liftWith(fx: Fx, vps: (Pt2 | null)[], b: Bag, useDetectedAxes = false,
                  detAxis?: Map<string, Axis>) {
  const { sc, edges, diag } = fx;
  b.scenes += 1; b.total += edges.length;
  const cam = recoverCamera(vps, SZ, { fSetting: sc.f });
  if (!cam.ok) return;
  b.camOk += 1;
  const f = cam.f!, principal = cam.principalPoint ?? [SZ[0] / 2, SZ[1] / 2];
  b.fErr.push(Math.abs(f - sc.f) / sc.f);
  for (const e of axisErrs(vps, principal, f, sc)) b.axErr.push(e);
  const ctx: LiftCtx = { principal, f, vps, imgSize: SZ };
  const strokes: LiftStroke[] = fx.strokes.map((s, i) => ({
    ...s, axis: useDetectedAxes ? (detAxis?.get(s.id) ?? "free") : trueAxis(sc, edges[i].axis),
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

describe("L-A.5d·L-A.6 카메라 정확도 (§5.4·§5.5)", () => {
  it("축 방향 오차 → 형태 오차 곡선을 원장에 낸다", () => {
    const byErr: Record<string, unknown> = {};
    const byErrBase: Record<string, unknown> = {};
    // **실행 수를 스스로 센다**(13차 5·6·7 리뷰어 6[1] — test_cost의 declared_scenarios가
    // 이 원장을 못 접던 원인: 자기보고 필드가 없었다. 손으로 안 센다 #17)
    let liftRuns = 0;
    for (const deg of AXIS_ERRS) {
      const all = bag(), base = bag();
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const jit of JITTERS) for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, jit, g, sd);
          if (!fx) continue;
          const vps = perturbedVps(fx.sc, deg, rng32(sd * 3571 + ci * 97 + 5));
          liftWith(fx, vps, all); liftRuns += 1;
          if (ci === 0 && jit <= 0.01) { liftWith(fx, vps, base); liftRuns += 1; }
        }
      }
      byErr[`deg_${deg}`] = report(all);
      byErrBase[`deg_${deg}`] = report(base);
    }

    const doc = {
      what: "L-A.5d — 소실점(축 방향)에 각도 오차를 준 조건의 형태 오차. **사용자 조정의 대리값**",
      plan: "docs/line_plan.md §5.2(사용자 확정) · 사전 등록: progress.md — **개정 2 번호**",
      proxy_caveat: "⚠ **대리값이다.** 사람이 소실점을 몇 도까지 맞추는지는 표본이 없다"
        + "(AS-C1·AS-L9). 여기서 재는 것은 '축 방향 오차가 θ일 때 형태가 얼마나 틀리는가'이고, "
        + "'사람이 θ에 도달한다'는 **측정하지 않았다.**",
      method: "축마다 **독립으로** 돌린다 — 전체를 같이 돌리면 게이지(전역 회전)라 오차가 0이 되고 "
        + "아무것도 안 잰다. 독립 회전은 직교성을 깨고 그것이 사용자가 세 점을 따로 끄는 상황이다. "
        + "그 뒤 `recoverCamera`가 수심으로 f를 다시 낸다(앱과 같은 경로). "
        + "**축 라벨은 참값을 준다** — 카메라만 보려는 것이므로 검출 오배정을 섞지 않는다.",
      // ⚠ **폐기된 대역을 지웠다**(리뷰어 지적 [6] / PITFALLS #27).
      // 옛 값 `placement_of_all: 0.9954` · `silent_wrong_cut_0_2: 0.0791`은 **`lift_gate`의
      // 오라클 값**이고 (a) 배치는 최대 연결 성분 분모이며 (b) 조용히 틀림에는 **검출 오배정이
      // 섞여 있다**. **대역은 같은 하네스에서 낸다** — 그것이 아래 `deg_0` 행이다.
      // **게이트를 `gate`라는 이름으로 적는다**(#35 자동 검사가 그 이름을 찾는다).
      // 이 블록이 없어서 검사가 원장 39개를 훑고도 **덮는 대상이 0**이었다.
      gate: gate({
        registered: "L-A.7 재등록(CLAUDE.md §2) — 사람이 가이드를 끌어 도달하는 **실측 축 방향 "
          + "오차 0.5° 이하**에서, 조용히 틀림 ≤ 0.0673×1.1 · 형태 오차 중앙 ≤ 0.0296×2.1. "
          + "**5구도 전부**를 낸다(기준 구도 하나로 통과를 주장하지 않는다).",
        reachability: "지표 축에서는 **도달 가능하다** — 같은 하네스의 `deg_0` 행이 정의상 "
          + "1.0배·1.0배이고 그것이 대역의 출처다(같은 조건·같은 분모, PITFALLS #27). "
          + "⚠ **그러나 게이트의 다른 절반은 도달 가능성이 미확인이다**: 사람이 0.5°까지 "
          + "맞추는지는 **표본 0**이고(AS-L9·AS-C1) 대리값(핸들 예산)도 **핸들 하나** 가정 "
          + "위에 있다(#29). 즉 넘을 수 있는 것이 확인된 것은 *지표*이지 *사람*이 아니다. "
          + "⚠ 낮추지 않는다 — 적기만 한다(#26의 반대편 문).",
        // ⚠⚠ **초판이 여기서 프레임을 혼동했다**(리뷰어): 원장 키 `deg_N`은 **준** 각도이고
        // 등록문은 **실측** 축 오차다. 실측 0.5°에 대응하는 행은 `deg_0.5`가 아니라
        // **`deg_0.25`**(실측 중앙 0.4838°)이고, 그 행은 **통과한다**.
        // "등록 지점이 못 넘는다 → 실효 요구가 두 배로 엄격하다"는 **철회한다** —
        // 그것은 준→실측 약 2배 증폭(L-A.7이 이미 적은 것)을 새 발견으로 다시 적은 것이다.
        // **산문만 두면 항등을 적고도 통과한다**(#40) — 초판이 실제로 그랬다:
        // "`deg_0` 행이 **정의상** 1.0배"라 적었는데 그 행이 **대역의 출처 자체**다.
        // 자명하지 않은 팔은 **`deg_0.25` 행**이고 그것이 통과선을 실제로 넘는다.
        reachability_value: 0.0613,
        reachability_source: "by_axis_err_baseline_3pt_jitter_le_0_01/deg_0.25/shape_err_median/median",
        status: "살아 있다. L-A 게이트(`lift_gate`)는 2026-08-15에 실패했고 이것이 그 재등록이다. "
          + "**등록 지점(실측 0.5°)은 `deg_0.25` 행이고**(실측 중앙 **0.4838°**) 그 행은 "
          + "**통과한다**: 형태 0.0613 ≤ 0.0296×2.1 = 0.0622 · 조용히 틀림 0.0696 ≤ 0.0673×1.1 = 0.0740. "
          + "⚠ **여유가 얇다**(#14): 형태는 1.4%, 조용히 틀림은 30/431 대 31.9/431로 **획 2개**다. "
          + "이 저장소가 정한 유효 자릿수는 2자리이고 **시드 폭을 안 쟀다** — 통과/실패가 그 안에 있다. "
          + "⚠⚠ **더 큰 문제는 모집단이다**: 등록문이 '**5구도 전부**'를 요구하는데 대역(0.0296/0.0673)은 "
          + "**`baseline_3pt_jitter_le_0_01` 단일 구도 부분집합**의 값이다. 5구도 합산으로 읽으면 "
          + "축 오차가 **0인 행(`deg_0`)조차** 못 넘는다(0.1237 > 0.0622 · 0.3758 > 0.0740). "
          + "**두 모집단이 같지 않고 원장에 구도별 분해가 없다**(#11·#27). 기준을 안 고친다(#26) — 적기만 한다.",
      }),
      target: { note: "**대역은 이 하네스의 `by_axis_err_*.deg_0` 행이다**(같은 조건·같은 분모). "
                      + "다른 하네스의 값을 대역으로 가져오지 않는다(PITFALLS #27).",
                registered_band: { silent_wrong_cut_0_2: 0.0673, shape_err_median: 0.0296 },
                pass_line: "실측 축 오차 0.5° 이하에서 각각 1.1배·2.1배 이내. **5구도 전부**를 낸다.",
                retired: { placement_of_all: 0.9954, silent_wrong_cut_0_2: 0.0791,
                           why: "`lift_gate` 출처. 분모가 최대 연결 성분이고 검출 오배정이 섞였다." } },
      by_axis_err_all_compositions: byErr,
      by_axis_err_baseline_3pt_jitter_le_0_01: byErrBase,
      /** 이 팔의 lift 실행 수(자기보고 — 6[1]). 격자 팔이 아래에서 더한다. */
      runs: liftRuns,
      what_this_does_not_say: [
        "**앱의 배치 경로를 지나지 않는다**(13차 5·6·7 리뷰어 6[6] · #17 — DEFERRED 8차 "
          + "2차 항목 1·2와 같은 유형): 배치는 `liftWith`(일괄 풀이 상당)로 하고, 앱의 "
          + "`placeBy` 아홉 경로(12차 cross_anchor · 13차 ground·extension 포함)는 이 원장에 "
          + "**안 잡힌다**. 그래서 그 경로들이 늘거나 바뀌어도 이 산출물은 바이트 동일할 수 "
          + "있다 — diff 0은 '카메라 수학이 안 변했다'까지이고 '배치가 안 변했다'가 아니다.",
      ],
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "camera_gate.json"), JSON.stringify(doc, null, 2));
    expect(Object.keys(byErr).length).toBe(AXIS_ERRS.length);
  }, 900_000);

  it("획 수 → 축 방향 오차 곡선을 원장에 낸다", () => {
    const byK: Record<string, unknown> = {};
    const latticeRuns: Record<number, number> = {};
    for (const k of LATTICE_K) {
      // 큰 격자는 검출이 O(n³)이라 시드를 줄인다. **줄인 사실을 적는다**(PITFALLS: 조용한 절단 금지)
      const seeds = k <= 2 ? SEEDS : k === 3 ? [1, 2, 3] : [1];
      const jits = k <= 2 ? JITTERS : [0.005, 0.01, 0.03];
      const comps = k <= 2 ? [0, 1, 2, 3, 4] : BIG_K_COMPS;
      const det = bag(), tru = bag();
      let perAxis = 0, nLines = 0, nStrokes = 0;
      latticeRuns[k] = 0;
      for (const ci of comps) {
        for (const jit of jits) for (const g of GRADES) for (const sd of seeds) {
          const fx = fixture(ci, jit, g, sd, k);
          if (!fx) continue;
          latticeRuns[k] += 2;                    // det + tru 두 lift(자기보고 — 6[1])
          perAxis = fx.edges.filter(e => e.axis === 0).length;
          nStrokes = fx.edges.length;
          const lines = linesFromStrokes(fx.strokes, SZ);
          nLines = lines.length;
          const cands = detectVps(lines, SZ);
          const vps = assignAxes(cands, lines);
          const detAxis = classifyByDetection(lines, cands, vps, SZ);
          liftWith(fx, vps, det, true, detAxis);         // 검출 카메라 + 검출 축
          liftWith(fx, trueVps(fx.sc), tru);             // 참 카메라 + 참 축 (대조)
        }
      }
      byK[`k_${k}`] = {
        strokes_per_axis: perAxis, strokes_total: nStrokes,
        lines_after_min_len: nLines,
        seeds_used: seeds.length, jitters_used: jits.length, compositions_used: comps.length,
        cost_note: k >= 3
          ? "검출이 O(n³)이라 시드·잡음·구도를 줄였고 `seed_pairs_max`가 쌍을 건너뛴다 "
            + "— 조용히 자르지 않는다"
          : null,
        detected_camera: report(det), true_camera_oracle: report(tru),
      };
    }

    const doc = JSON.parse(readFileSync(resolve(OUT, "camera_gate.json"), "utf-8"));
    doc.by_strokes_per_axis = byK;
    // **실행 수 자기보고를 합친다**(6[1]) — 첫 팔의 runs에 격자 팔의 lift 수를 더한다.
    // test_cost의 declared_scenarios가 이 값을 접는다(`led.runs`).
    doc.runs = (doc.runs ?? 0) + Object.values(latticeRuns).reduce((s, x) => s + x, 0);
    doc.runs_note = "두 팔의 lift 실행 수 합(축 오차 팔 + 격자 팔 det·tru). 행별 내역은 "
      + "by_strokes_per_axis[*].seeds_used·jitters_used·compositions_used";
    doc.lattice_note = "k등분 격자 상자. 축당 획 수 = (k+1)²·k → 4 / 18 / 48 / 100. "
      + "**선분으로 낸다** — 관통선으로 하면 서로 몸통에서 교차해 `findJoints`가 하나도 "
      + "안 잡는다(끝점 근처만 제약으로 쓰므로, L-A.3).";
    writeFileSync(resolve(OUT, "camera_gate.json"), JSON.stringify(doc, null, 2));
    expect(Object.keys(byK).length).toBe(LATTICE_K.length);
  }, 900_000);
});
