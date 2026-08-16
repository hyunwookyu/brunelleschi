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
import { applyRollZero, vpOnHorizon, vpVerticalFromOrthocenter, fitHorizonPair, HORIZON_TOL }
  from "../src/s3d/horizon.js";
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
  shift: [] as number[],
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
});

/**
 * 한 장면을 재고 카운터에 넣는다.
 *
 * `arm`:
 *   `"base"`   — 검출 그대로(L-A.6의 경로)
 *   `"roll0"`  — 검출 소실점을 롤 0으로 사영한다
 *   `"oracle"` — **축 라벨을 참값으로 주고** 롤 0을 건다. 제약이 틀린 것인지
 *                `assignAxes`가 어느 것이 수직인지 잘못 고른 것인지 가른다(#35의 오라클 자리)
 *   `"refit"`  — 제약을 **적합 안에** 넣는다(`fitHorizonPair`). 사영은 소실점을 자기
 *                지지선에서 떼어 놓으므로, 그 팔의 배치 붕괴가 **제약의 성질인지 사영의
 *                성질인지** 이 팔이 가른다(#32: 미실행을 반증으로 처리하지 않는다)
 */
function measure(fx: Fx, b: Bag, arm: "base" | "roll0" | "oracle" | "refit") {
  const { sc, edges, diag } = fx;
  const roll0 = arm === "roll0" || arm === "oracle";
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
    const r = applyRollZero(vps, P0, SZ, w);
    vps = r.vps;
    b.applied.horizon_merged += r.applied.horizon_merged;
    b.applied.vertical_x_moved += r.applied.vertical_x_moved ? 1 : 0;
    b.applied.vertical_synthesized += r.applied.vertical_synthesized ? 1 : 0;
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
      const base = bag(), roll = bag(), orac = bag(), refi = bag();
      let perAxis = 0;
      for (const ci of comps) for (const jit of jits) for (const g of GRADES) for (const sd of seeds) {
        const fx = fixture(ci, jit, g, sd, k);
        if (!fx) continue;
        perAxis = fx.edges.filter(e => e.axis === 0).length;
        measure(fx, base, "base");
        measure(fx, roll, "roll0");
        measure(fx, orac, "oracle");
        measure(fx, refi, "refit");
      }
      byK[`k_${k}`] = {
        strokes_per_axis: perAxis,
        seeds_used: seeds.length, jitters_used: jits.length, compositions_used: comps.length,
        cost_note: k >= 3 ? "검출이 O(n³)이라 시드·잡음·구도를 줄였다 — 조용히 자르지 않는다" : null,
        detected_baseline: report(base), detected_roll_zero: report(roll),
        oracle_axis_labels_roll_zero: report(orac),
        constrained_refit: report(refi),
      };
    }
    doc.by_strokes_per_axis = byK;
    expect(Object.keys(byK).length).toBe(LATTICE_K.length);
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
        + "⚠ 안 내려가면 **초안 품질이 얼마나 올랐는지만 기록한다** — 사용자 확정을 유지한다.",
      reachability: "**같은 하네스의 `orthocenter_identity`가 그 자리다** — 참 카메라를 넣으면 "
        + "수심 관계가 오차 0으로 성립한다(항등이므로 정보량은 0이다, #5). 즉 **제약 자체는 "
        + "정확하고 남는 문제는 입력(검출 소실점)의 오차**다. ⚠ 그러므로 이 게이트가 넘어가려면 "
        + "**검출이 지평선 높이를 1° 상당으로 맞춰야** 하고 그것이 도달 가능한지는 "
        + "이 측정이 답한다. ⚠ 넘든 못 넘든 **기준을 낮추지 않는다**(#26의 반대편 문).",
      status: "이번 실행의 결과는 `by_strokes_per_axis`에 있다.",
    }),
    what_this_does_not_say: [
      "**사람이 롤 없이 그리는가** — 표본 0이다(AS-C1). 픽스처는 롤 0으로 만든 것이고, "
        + "기울여 그리는 대가는 `roll_control`이 잰다",
      "실획 — 합성 잉크다(AS-C10이 그 모델을 양방향으로 틀렸다고 적었다)",
      "**사람이 축 오차 0.5°에 도달하는가**(AS-L9) — 이 항목은 자동 검출만 본다",
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
