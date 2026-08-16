// **L-D.0 — 롤 0 제약(지평선 수평 고정)**. 산출: `stage0/out/horizon.json`.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 이 항목에 걸리는 번호:
//   **#37**(이론서를 먼저 봤다 — 3.1 지평선 · 5.3 자유도 · 6.3 수심 · 2.2 무한원)
//   **#26**(통과 기준을 측정 전에 박는다) · **#35**(무엇이 그 기준을 넘을 수 있는가 = 오라클 팔)
//   **#30**(양성 채널 — 롤이 있는 장면에서 이 제약이 실제로 해를 끼치는지)
//   **#12·#13·#14**(동작점 하나 금지 · 절단 · 시드 폭) · **#11**(분모) · **#8**(꼬리)
//   **#32**(제약이 실제로 발동했는지 카운터로 남긴다 — 0이면 결과가 정보 0이다)
//
// **L-A.6과 같은 조건**에서 잰다(`camera_gate.test.ts`) — 같은 구도·같은 격자·같은 잉크.
// 조건이 다르면 `by_strokes_per_axis`와 비교가 성립하지 않는다(#27: 대역은 같은 하네스에서).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectVps, linesFromStrokes, assignAxes, classifyByDetection } from "../src/s3d/vpDetect.js";
import { liftAll, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { vpOnHorizon, vpVerticalFromOrthocenter, HORIZON_TOL } from "../src/s3d/horizon.js";
// ⛔ **폐기 경로의 근거 재현**(D-L32). 앱은 이것을 배선하지 않는다 — 바른 순서는
// `horizon.ts`에 있고 `vpRules.ts`가 그것을 쓴다(2026-08-16 순서 정정).
import { applyRollZero, fitHorizonPair } from "../src/s3d/horizonRollZero.js";
import { representative, type Axis, type Rep } from "../src/s3d/axis.js";
import { norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, stat, round, median,
         type Scene, type TrueEdge } from "./scene3d.js";
import { perStrokeError, axisDirErrors, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];
const P0: Pt2 = [SZ[0] / 2, SZ[1] / 2];               // 주점 = 이미지 중심(16.2 · AS-C5)

// **`camera_gate.test.ts`와 같은 구도·격자·잉크다.** 바꾸면 비교가 깨진다.
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
const LATTICE_K = [1, 2, 3, 4];                       // 축당 4 / 18 / 48 / 100획
const BIG_K_COMPS = [0, 1, 2];
/** **양성 채널**(#30) — 종이를 기울여 그린 상황. 롤 0 가정이 깨지는 각도들. */
const ROLLS_DEG = [0, 2, 5, 10];

const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

/** **카메라 롤은 이미지 평면의 회전이다** — 주점을 중심으로 화면 점을 돌린다. */
const rollPt = (p: Pt2, deg: number): Pt2 => {
  if (!deg) return p;
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const x = p[0] - P0[0], y = p[1] - P0[1];
  return [P0[0] + c * x - s * y, P0[1] + s * x + c * y];
};

/**
 * **롤은 참 축의 기준계도 돌린다.** 화면을 주점 중심으로 θ 돌리는 것은 카메라를 광축 둘레로
 * 돌리는 것과 같고, 그러면 방향 `d = (x, y, z)`의 카메라 좌표가 `(R_z(θ)(x,y), z)`가 된다.
 *
 * ⚠ **초판은 이것을 안 돌렸고 그래서 롤 대조군이 통째로 무효였다** — `roll_zero` 팔이
 * 지평선을 수평으로 되돌리면서 사실상 **롤을 되감았고**, 그것이 "기울여도 좋아진다"로 읽혔다.
 * 재는 것이 품질이 아니라 **기준계 불일치**였다. PITFALLS #35의 ⚠⚠(게이지부터 의심한다)와
 * #37(같은 세션의 `tiltDeg`도 기준계 문제였다)이 정확히 이 형태다.
 */
const rollAxes = (axes: Vec3[], deg: number): Vec3[] => {
  if (!deg) return axes;
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return axes.map(d => [c * d[0] - s * d[1], s * d[0] + c * d[1], d[2]] as Vec3);
};

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; diag: number;
               refAxes: Vec3[]; rollDeg: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number, k = 1,
                 rollDeg = 0): Fx | null {
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
    sc, edges, diag, rollDeg,
    refAxes: rollAxes(sc.axes as unknown as Vec3[], rollDeg),
    strokes: drawn.map((e, i) => ({
      id: `s${i}`, pts2d: (e.pts2d as Pt2[]).map(p => rollPt(p, rollDeg)), axis: "free" as Axis,
    })),
  };
}

const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

const bag = () => ({
  scenes: 0, camOk: 0, comp: 0, placedOfComp: 0, total: 0, placed: 0,
  wrong10: 0, wrong20: 0, wrong50: 0,
  shapeMed: [] as number[], axErr: [] as number[], fErr: [] as number[],
  applied: { horizon_merged: 0, vertical_x_moved: 0, vertical_synthesized: 0 },
  shift: [] as number[], shiftDy: [] as number[],
});
type Bag = ReturnType<typeof bag>;
const report = (b: Bag) => ({
  scenes: b.scenes,
  camera_ok: { k: b.camOk, n: b.scenes, rate: rate(b.camOk, b.scenes) },
  placement: { k: b.placedOfComp, n: b.comp, rate: rate(b.placedOfComp, b.comp),
               of_all: { k: b.placedOfComp, n: b.total, rate: rate(b.placedOfComp, b.total) } },
  silent_wrong: {
    cut_0_1: { k: b.wrong10, n: b.placed, rate: rate(b.wrong10, b.placed) },
    cut_0_2: { k: b.wrong20, n: b.placed, rate: rate(b.wrong20, b.placed) },
    cut_0_5: { k: b.wrong50, n: b.placed, rate: rate(b.wrong50, b.placed) },
  },
  axis_dir_err_deg: stat(b.axErr), shape_err_median: stat(b.shapeMed), f_rel_err: stat(b.fErr),
  // **제약이 실제로 발동했는가**(#32) — 0이면 이 팔의 결과는 제약에 대해 정보가 0이다
  constraint_applied: b.applied,
  vp_shift_px: stat(b.shift),
  // **Δy 단독**(리뷰어 [5]) — 사영은 y만 옮기고 적합은 (x, y) 둘을 옮긴다.
  // "두 수평 소실점의 y가 그만큼 어긋나 있다"는 주장의 근거는 **이 열**이지 위가 아니다.
  vp_shift_dy_px: stat(b.shiftDy),
});
type Arm = "base" | "roll0" | "oracle" | "no_synth" | "placebo" | "refit";

/**
 * 한 장면을 재고 카운터에 넣는다.
 *
 * `arm`:
 *   `"base"`   — 검출 그대로(L-A.6의 경로)
 *   `"roll0"`  — 검출 소실점을 롤 0으로 사영한다
 *   `"oracle"` — **축 라벨을 참값으로 주고** 롤 0을 건다. 제약이 틀린 것인지
 *                `assignAxes`가 어느 것이 수직인지 잘못 고른 것인지 가른다(#35의 오라클 자리)
 *   `"no_synth"` — 롤 0을 걸되 **무한원 축에 V₃를 합성하지 않는다**. 2pt·1pt 구도에서
 *                  잡음이 `P_y − h`를 0이 아니게 만들면 식이 **거대한 유한 V₃**를 내는데
 *                  이론서 2.2는 그 자리에 소실점이 **없다**고 적는다(리뷰어 [2])
 *   `"placebo"` — 소실점을 **같은 크기로 임의 방향** 옮긴다. 배치 붕괴가 *제약*의 성질인지
 *                 *소실점을 80px 옮기는 것 일반*의 성질인지 가른다(#30, 리뷰어 [4][5])
 *   `"refit"`  — 제약을 **적합 안에** 넣는다(`fitHorizonPair`). 사영은 소실점을 자기
 *                지지선에서 떼어 놓으므로, 그 팔의 배치 붕괴가 **제약의 성질인지 사영의
 *                성질인지** 이 팔이 가른다(#32: 미실행을 반증으로 처리하지 않는다)
 */
function measure(fx: Fx, b: Bag, arm: Arm, cfg: { min_slope_deg?: number;
                 min_vp_sep_ratio?: number } = {}) {
  const { sc, edges, diag } = fx;
  const roll0 = arm === "roll0" || arm === "oracle" || arm === "no_synth";
  b.scenes += 1; b.total += edges.length;
  const lines = linesFromStrokes(fx.strokes, SZ);
  const cands = detectVps(lines, SZ);
  let vps = assignAxes(cands, lines);
  if (arm === "oracle") {
    // 참 축 방향에 가장 가까운 검출 소실점을 그 축 자리에 놓는다 — **라벨만 참값이다**
    const want = [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ)
      ? rollPt(sc.vps[i as 0 | 1 | 2], fx.rollDeg) : null));
    const pool = cands.filter(c => !c.infinite).map(c => c.vp);
    vps = want.map(w => {
      if (!w || !pool.length) return null;
      let bi = 0, bd = Infinity;
      pool.forEach((p, j) => { const d = Math.hypot(p[0] - w[0], p[1] - w[1]);
                               if (d < bd) { bd = d; bi = j; } });
      return pool[bi];
    });
  }
  if (arm === "refit") {
    // 두 수평 축의 지지선을 모아 `(x₁, x₂, h)`를 **한 번에** 푼다
    const byId = new Map(lines.map(L => [L.id, L.rep]));
    const supOf = (v: Pt2 | null) => {
      const cd = v ? cands.find(c => c.vp === v) : null;
      return cd ? cd.support.map(id => byId.get(id)!).filter(Boolean) : [];
    };
    const fit = (vps[0] && vps[1]) ? fitHorizonPair(supOf(vps[0]), supOf(vps[1])) : null;
    if (fit) {
      const before = [vps[0]!, vps[1]!];
      vps = [fit.v1, fit.v2, vps[2]];
      b.applied.horizon_merged += 2;
      b.shift.push(+Math.hypot(fit.v1[0] - before[0][0], fit.v1[1] - before[0][1]).toFixed(3));
      b.shift.push(+Math.hypot(fit.v2[0] - before[1][0], fit.v2[1] - before[1][1]).toFixed(3));
      b.shiftDy.push(+Math.abs(fit.v1[1] - before[0][1]).toFixed(3));
      b.shiftDy.push(+Math.abs(fit.v2[1] - before[1][1]).toFixed(3));
      if (vps[2]) { vps[2] = [P0[0], vps[2]![1]]; b.applied.vertical_x_moved += 1; }
      else {
        const v = vpVerticalFromOrthocenter(fit.v1, fit.v2, P0, Math.hypot(...SZ));
        if (v) { vps[2] = v; b.applied.vertical_synthesized += 1; }
      }
    }
  }
  if (roll0) {
    // 지지 수를 가중치로 준다 — 획이 많은 축의 지평선 높이를 더 믿는다
    const w: (number | null)[] =
      vps.map(v => (v ? cands.find(c => c.vp === v)?.support.length ?? 1 : null));
    const r = applyRollZero(vps, P0, SZ, w, cfg, arm === "no_synth");
    vps = r.vps;
    b.applied.horizon_merged += r.applied.horizon_merged;
    b.applied.vertical_x_moved += r.applied.vertical_x_moved ? 1 : 0;
    b.applied.vertical_synthesized += r.applied.vertical_synthesized ? 1 : 0;
    for (const s of r.shiftPx) if (s > 0) b.shift.push(+s.toFixed(3));
    for (const s of r.shiftDy) if (s > 0) b.shiftDy.push(+s.toFixed(3));
  }
  if (arm === "placebo") {
    // **위약 대조군**(#30) — 제약과 **같은 크기**로 옮기되 방향은 결정론적 임의다.
    // 붕괴가 "롤 0"의 성질인지 "소실점이 80px 움직이는 것"의 성질인지 갈린다.
    const w2: (number | null)[] =
      vps.map(v => (v ? cands.find(c => c.vp === v)?.support.length ?? 1 : null));
    const r = applyRollZero(vps, P0, SZ, w2);
    const rr = rng32(fx.edges.length * 131 + Math.round(fx.rollDeg) + 7);
    vps = vps.map((v, i) => {
      const d = r.shiftPx[i];
      if (!v || !(d > 0)) return v;
      const th = 2 * Math.PI * rr();
      return [v[0] + d * Math.cos(th), v[1] + d * Math.sin(th)] as Pt2;
    });
    b.applied.horizon_merged += r.applied.horizon_merged;
    for (const s of r.shiftPx) if (s > 0) b.shift.push(+s.toFixed(3));
  }
  const cam = recoverCamera(vps, SZ, { fSetting: sc.f });
  if (!cam.ok) return;
  b.camOk += 1;
  const f = cam.f!, principal = cam.principalPoint ?? P0;
  b.fErr.push(Math.abs(f - sc.f) / sc.f);
  for (const e of axisDirErrors(vps, principal, f, fx.refAxes as never)) b.axErr.push(e);
  const detAxis = classifyByDetection(lines, cands, vps, SZ);
  const ctx: LiftCtx = { principal, f, vps, imgSize: SZ };
  const strokes: LiftStroke[] = fx.strokes.map(s => ({ ...s, axis: detAxis.get(s.id) ?? "free" }));
  const r = liftAll(strokes, ctx);
  b.comp += r.component.length; b.placedOfComp += r.placed.size; b.placed += r.placed.size;
  const errs = perStrokeError(r.placed, edges, diag);
  for (const v of errs) {
    if (v > 0.1) b.wrong10 += 1;
    if (v > 0.2) b.wrong20 += 1;
    if (v > 0.5) b.wrong50 += 1;
  }
  if (errs.length) b.shapeMed.push(median(errs) ?? 0);
}

const doc: Record<string, unknown> = {};

describe("L-D.0 롤 0 제약 — 지평선 수평 고정", () => {
  it("반례: 세 함수가 성립 조건 밖에서 `null`을 낸다", () => {
    const rep = (a: Pt2, b: Pt2): Rep => representative([a, b])!;
    // ① 획이 너무 수평이면 지평선 교점이 발산한다 — 안 낸다
    expect(vpOnHorizon(rep([0, 300], [100, 300]), 200)).toBeNull();
    expect(vpOnHorizon(rep([0, 300], [100, 301]), 200)).toBeNull();      // 0.57° < 3.75°
    // ② 기울면 낸다. 값은 직선 연장의 교점이다
    const v = vpOnHorizon(rep([0, 300], [100, 200]), 200);
    expect(v).not.toBeNull();
    expect(v![0]).toBeCloseTo(100, 6);
    expect(v![1]).toBe(200);
    // ③ 피치 0(주점이 지평선 위)이면 수직 소실점이 무한원이다 — `null`
    expect(vpVerticalFromOrthocenter([-500, 336], [1400, 336], [480, 336], 1000)).toBeNull();
    // ④ 두 소실점이 너무 가까우면 안 낸다(조건수)
    expect(vpVerticalFromOrthocenter([470, 300], [490, 300], P0, 1000)).toBeNull();
    // ⑤ 정상: 주점이 지평선 **아래**(P_y > h)이고 두 소실점 사이 → 수직 소실점은 아래로
    const v3 = vpVerticalFromOrthocenter([-500, 200], [1400, 200], P0, 1000);
    expect(v3).not.toBeNull();
    expect(v3![0]).toBe(P0[0]);
    expect(v3![1]).toBeGreaterThan(200);
  });

  it("수심 관계가 **참 카메라에서 항등이다** — 식이 이론서 6.3과 맞는지 본다", () => {
    // 참 소실점 셋을 넣으면 `V₃`가 참값과 같아야 한다(롤 0 장면이므로).
    const rows: Record<string, unknown>[] = [];
    for (const C of COMPOSITIONS) {
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      const v = trueVps(sc);
      if (!v[0] || !v[1] || !v[2]) { rows.push({ comp: C.name, skipped: "무한원 축이 있다" }); continue; }
      // 참 소실점의 지평선은 수평인가(롤 0의 직접 확인)
      const dy = Math.abs(v[0]![1] - v[1]![1]);
      const got = vpVerticalFromOrthocenter(v[0]!, v[1]!, P0, Math.hypot(...SZ));
      rows.push({
        comp: C.name, horizon_dy_px: round(dy, 6),
        true_v3: [round(v[2]![0], 2), round(v[2]![1], 2)],
        derived_v3: got ? [round(got[0], 2), round(got[1], 2)] : null,
        err_px: got ? round(Math.hypot(got[0] - v[2]![0], got[1] - v[2]![1]), 4) : null,
      });
      expect(dy).toBeLessThan(1e-6);                 // **롤 0이면 지평선이 수평이다**
      expect(got).not.toBeNull();
      expect(Math.hypot(got![0] - v[2]![0], got![1] - v[2]![1])).toBeLessThan(1e-6);
    }
    doc.orthocenter_identity = {
      rows,
      reading: "**측정이 아니라 항등 확인이다**(PITFALLS #5) — 참 카메라에서 6.3이 성립하는지 "
        + "본 것이고 오차가 0인 것이 정상이다. **임계를 걸지 않는다.** 이것이 하는 일은 "
        + "식의 부호와 유도가 맞는지 잠그는 것뿐이다.",
    };
  });

  it("**축당 획 수 → 축 방향 오차** — L-A.6과 같은 조건에서 롤 0 제약의 효과", () => {
    const byK: Record<string, unknown> = {};
    for (const k of LATTICE_K) {
      const seeds = k <= 2 ? SEEDS : k === 3 ? [1, 2, 3] : [1];
      const jits = k <= 2 ? JITTERS : [0.005, 0.01, 0.03];
      const comps = k <= 2 ? [0, 1, 2, 3, 4] : BIG_K_COMPS;
      const base = bag(), roll = bag(), orac = bag(), refi = bag(), nsyn = bag(), plac = bag();
      let perAxis = 0;
      for (const ci of comps) for (const jit of jits) for (const g of GRADES) for (const sd of seeds) {
        const fx = fixture(ci, jit, g, sd, k);
        if (!fx) continue;
        perAxis = fx.edges.filter(e => e.axis === 0).length;
        measure(fx, base, "base");
        measure(fx, roll, "roll0");
        measure(fx, orac, "oracle");
        measure(fx, refi, "refit");
        measure(fx, nsyn, "no_synth");
        measure(fx, plac, "placebo");
      }
      byK[`k_${k}`] = {
        strokes_per_axis: perAxis,
        seeds_used: seeds.length, jitters_used: jits.length, compositions_used: comps.length,
        cost_note: k >= 3 ? "검출이 O(n³)이라 시드·잡음·구도를 줄였다 — 조용히 자르지 않는다" : null,
        detected_baseline: report(base), detected_roll_zero: report(roll),
        oracle_axis_labels_roll_zero: report(orac),
        constrained_refit: report(refi),
        roll_zero_no_synthesis: report(nsyn),
        placebo_same_shift_random_dir: report(plac),
      };
    }
    doc.by_strokes_per_axis = byK;
    expect(Object.keys(byK).length).toBe(LATTICE_K.length);
  }, 900_000);

  it("**구도별 층화** — 무한원 축 구도(2pt·1pt)가 붕괴를 만드는가", () => {
    // 리뷰어 [2]: `by_strokes_per_axis`는 5구도 합산만 낸다. 그런데 그중 둘은
    // **수직축이 무한원**이라 V₃가 없는 것이 옳고(이론서 2.2), `vertical_synthesized`가
    // k_1에서 108(≈2pt+1pt 120장면의 90%)이다. **갈라 봐야 결론의 범위가 정해진다.**
    const rows: Record<string, unknown> = {};
    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const arms: [Arm, ReturnType<typeof bag>][] =
        (["base", "roll0", "no_synth", "placebo", "refit"] as Arm[]).map(a => [a, bag()]);
      for (const jit of JITTERS) for (const g of GRADES) for (const sd of SEEDS) {
        const fx = fixture(ci, jit, g, sd, 1);
        if (!fx) continue;
        for (const [a, b] of arms) measure(fx, b, a);
      }
      rows[COMPOSITIONS[ci].name] = Object.fromEntries(arms.map(([a, b]) => [a, report(b)]));
    }
    doc.by_composition_k1 = {
      rows,
      why: "**결론의 범위를 정한다**(#11·#15). 5구도 합산은 수직축이 무한원인 둘(2pt·1pt)을 "
        + "섞는데, 그 구도에서 롤 0은 **없어야 할 소실점을 만들어 넣는다**. "
        + "`no_synth` 팔이 그것을 끄고, 차이가 그 몫이다.",
    };
    expect(Object.keys(rows).length).toBe(COMPOSITIONS.length);
  }, 900_000);

  it("**HORIZON_TOL 스윕** — 발동 임계가 결론을 정하는가", () => {
    // 리뷰어 [1]: `min_slope_deg`·`min_vp_sep_ratio`가 제약 발동을 정하는데 동작점 하나였다(#12).
    // **한 값에 결론을 걸지 않는다**(#13).
    const rows: Record<string, unknown> = {};
    for (const slope of [2, 3.75, 7]) for (const sep of [0.10, 0.15, 0.30]) {
      const roll = bag(), refi = bag();
      for (const ci of [0, 1, 2, 3, 4]) for (const jit of JITTERS) for (const sd of [1, 2, 3]) {
        const fx = fixture(ci, jit, "medium", sd, 1);
        if (!fx) continue;
        measure(fx, roll, "roll0", { min_slope_deg: slope, min_vp_sep_ratio: sep });
        measure(fx, refi, "refit", { min_slope_deg: slope, min_vp_sep_ratio: sep });
      }
      rows[`slope_${slope}_sep_${sep}`] = { roll_zero: report(roll), constrained_refit: report(refi) };
    }
    doc.horizon_tol_sweep = {
      rows,
      registered_point: { min_slope_deg: HORIZON_TOL.min_slope_deg,
                          min_vp_sep_ratio: HORIZON_TOL.min_vp_sep_ratio },
      vacuous_warning: "⚠⚠ **이 스윕은 공허하다**(#31) — 아홉 격자점이 **완전히 같은 수**를 낸다. "
        + "이유는 `applyRollZero`가 두 임계를 **거의 안 부르기 때문**이다: `min_slope_deg`는 "
        + "`vpOnHorizon`(획 하나 + 지평선 교점) 전용이고 사영 경로가 그 함수를 안 쓰며, "
        + "`min_vp_sep_ratio`는 **수직축 합성 분기**에서만 걸린다. "
        + "**그러므로 '발동 임계가 결론을 정하는가'에 대한 답은 '이 두 임계는 결론에 안 닿는다'이고**, "
        + "무결론이 아니라 **설계의 귀결**이다(#31이 요구한 그 확인). 리뷰어 [1]에 대한 답이 이것이다.",
      why: "**두 임계의 근거가 선례 유추뿐이었다**(`min_spread_mult` × `support_deg`와 같은 자리, "
        + "6.5의 예각 조건과 같은 방향) — 측정이 아니다. 조이면 제약을 **확실히 수평인 쌍에만** "
        + "걸게 되므로 붕괴가 줄 수 있고, 그러면 '붕괴는 제약의 성질'이 "
        + "'붕괴는 이 발동 임계의 성질'로 바뀐다(리뷰어 [1]).",
    };
    expect(Object.keys(rows).length).toBe(9);
  }, 900_000);

  it("**양성 채널** — 종이를 기울이면(롤 ≠ 0) 이 제약이 해를 끼치는가", () => {
    const rows: Record<string, unknown> = {};
    for (const deg of ROLLS_DEG) {
      const base = bag(), roll = bag();
      for (const ci of [0, 1, 2, 3, 4]) for (const jit of [0.005, 0.01]) for (const sd of [1, 2, 3]) {
        const fx = fixture(ci, jit, "medium", sd, 1, deg);
        if (!fx) continue;
        measure(fx, base, "base");
        measure(fx, roll, "roll0");
      }
      rows[`roll_${deg}deg`] = { baseline: report(base), roll_zero: report(roll) };
    }
    doc.roll_control = {
      rows,
      why: "**롤 0은 가정이지 관측이 아니다**(#30). 종이를 기울여 그리면 지평선이 화면 수평이 "
        + "아니고, 그때 이 제약은 **틀린 곳으로 소실점을 끈다**. 그 대가가 얼마인지 여기서 잰다 "
        + "— 안 재면 '롤 0에서 좋아졌다'가 무엇을 대가로 했는지 안 보인다.",
      note: "롤은 **이미지 평면의 회전**이므로 주점을 중심으로 화면 점을 돌려 만든다 "
        + "(카메라 롤과 정확히 같다). **참 축도 같은 각으로 돌려 기준계를 맞춘다** — "
        + "방향 `d`의 카메라 좌표가 `(R_z(θ)(x,y), z)`가 되기 때문이다. "
        + "⚠⚠ **초판은 참 축을 안 돌렸고 그래서 이 대조군이 통째로 무효였다**: `roll_zero` 팔이 "
        + "지평선을 수평으로 되돌리며 사실상 롤을 되감았고, 그것이 \"기울여도 좋아진다\"로 읽혔다. "
        + "재던 것이 품질이 아니라 **기준계 불일치**였다(#35의 ⚠⚠ · #37).",
    };
    expect(Object.keys(rows).length).toBe(ROLLS_DEG.length);
  }, 900_000);
});

import { afterAll } from "vitest";
afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "horizon.json"), JSON.stringify({
    what: "L-D.0 — 롤 0을 카메라 모델에 박고 지평선을 수평으로 고정하면 검출이 좋아지는가",
    plan: "docs/line_plan.md L-D.0(사람 지시, 2026-08-16) · 이론서 3.1 · 5.3 · 6.3 · 2.2",
    gate: gate({
      registered: "**L-A.6과 같은 조건**(같은 구도·격자·잉크)에서 축 방향 오차 중앙이 "
        + "**약 1° 아래**로 내려가면 자동 확정 경로를 되살린다. 기준선은 같은 하네스의 "
        + "`detected_baseline` 행이고, L-A.6의 값은 7.40 / 10.04 / 10.09 / 4.53°다"
        + "(축당 4 / 18 / 48 / 100획). **측정 전에 박았다**(#26). "
        + "⚠ **박은 값이 정정 전 임계다**(리뷰어 [8]) — AS-L9와 CLAUDE.md §2의 현행 임계는 "
        + "**0.5°**이고 ≈1°는 그 전 값이다. **사후에 안 고친다**(#26·#28) — 등록문은 그대로 두고 "
        + "여기 적는다. 방향은 한쪽이라 결론이 안 바뀐다: 0.5°로 읽으면 실패가 **더 크다**. "
        + "⚠ 안 내려가면 **초안 품질이 얼마나 올랐는지만 기록한다** — 사용자 확정을 유지한다.",
      reachability: "**`oracle_axis_labels_roll_zero` 팔이 그 자리다**(축 라벨을 참값으로 주고 "
        + "검출 소실점을 쓴다) — 축당 4/18/48/100획에서 **4.4599 / 4.9690 / 9.2513 / 8.4495°**다. "
        + "⚠⚠ **즉 이 하네스에서 검출 기반 팔이 1°에 닿은 적은 한 번도 없다.** 0을 내는 것은 "
        + "`camera_gate`의 `true_camera_oracle`뿐이고 그것은 참 소실점을 그대로 넣은 **항등**이다. "
        + "**그러므로 #35대로 적는다: 기준을 못 넘은 것이 신호의 성질인지 기준의 성질인지 "
        + "이 하네스만으로는 갈리지 않는다.** ⚠ 그래도 **기준을 낮추지 않는다**(#26의 반대편 문). "
        + "⚠ `orthocenter_identity`는 reachability가 아니다 — **항등이라 정보량 0**이고(#5) "
        + "식의 유도를 잠그는 것 말고는 아무 말도 안 한다(초판이 그것을 이 자리에 적었고 고쳤다).",
      reachability_value: 4.4599,
      reachability_source: "by_strokes_per_axis/k_1/oracle_axis_labels_roll_zero/axis_dir_err_deg/median",
      status: "이번 실행의 결과는 `by_strokes_per_axis`에 있다. **오라클 팔이 4.4599°로 "
        + "임계(현행 0.5°)의 8.9배**이고 그것이 이 하네스의 최선이다.",
    }),
    what_this_does_not_say: [
      "**사람이 롤 없이 그리는가** — 표본 0이다(AS-C1). 픽스처는 롤 0으로 만든 것이고, "
        + "기울여 그리는 대가는 `roll_control`이 잰다",
      "실획 — 합성 잉크다(AS-C10이 그 모델을 양방향으로 틀렸다고 적었다)",
      "**사람이 축 오차 0.5°에 도달하는가**(AS-L9) — 이 항목은 자동 검출만 본다",
      "**주점이 이미지 중심이 아닐 때** — 픽스처는 주점이 정확히 중심이라(`true_v3`의 x = 480 = Pₓ) "
        + "AS-C5 가정이 **참인 최선 조건**이다. 어긋나면 더 나빠질 수만 있다(방향만 안다)",
      "**배치 붕괴의 자리** — 미배치 사유별 카운터가 이 하네스에 없다(`lift_grade`가 그 분해를 한다)",
    ],
    condition: {
      compositions: COMPOSITIONS.map(c => c.name), jitters: JITTERS, grades: GRADES,
      seeds: SEEDS, lattice_k: LATTICE_K, rolls_deg: ROLLS_DEG,
      principal: "이미지 중심 가정(이론서 16.2 · AS-C5). **이 가정이 제약에 들어간다**",
      same_as: "`camera_gate.test.ts`와 같은 구도·격자·잉크 — 바꾸면 `by_strokes_per_axis` 비교가 깨진다",
    },
    horizon_tol: HORIZON_TOL,
    ...doc,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 2), "utf-8");
});
