// L-A **게이트 측정** — 산출: `stage0/out/vp_detect.json` · `stage0/out/lift_gate.json`.
//
// 사전 등록한 조건·분모·통과 기준은 `progress.md`의 "L-A 게이트 — 사전 등록" 절이다.
// **측정 전에 박았다**(PITFALLS #26).
//
// 조건에서 고친 것 둘 (S·G가 걸렸던 자리, PITFALLS #11·#12):
//   구도를 **다섯**으로 늘렸다 — 3점 셋 · 2점 · 1점. 구 측정 전체가 구도 하나 위에 있었다.
//   끝점 오차에 **0.03·0.05**를 넣었다 — 그것이 유일한 실획 자릿수(AS-C2)이고
//   S·G는 그 구간을 한 번도 재지 않았다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectVps, linesFromStrokes, assignAxes, classifyByDetection, vpAngle, VP_TOL,
} from "../src/s3d/vpDetect.js";
import { liftAll, findJoints, frameOf, transitionGap, LIFT_TOL, type LiftStroke, type LiftCtx }
  from "../src/s3d/lift.js";
import { recoverCamera, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { fitCamera, type FitLine } from "../src/s3d/cameraFit.js";
import type { Axis } from "../src/s3d/axis.js";
import { norm3, sub3, mul3, dot3, unit3, axisDirection, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round, median, type Scene, type TrueEdge }
  from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";
import { perStrokeErrorMap, metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  // 1점 구도는 **깊이 모서리가 보여야** 한다 — 정면 근접이면 축소가 심해 획이 짧아
  // `min_len_ratio`에서 떨어진다(첫 판에서 깊이 4획 중 4획이 빠졌다). 옆으로 비켜 세운다
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
/** 뒤의 둘이 **유일한 실획 자릿수**다(AS-C2: 0.028~0.051). */
const JITTERS = [0, 0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];

/** 무한원 축은 `screen`이다(c=0). **개수는 이론이 정한다**(5.3) — 사후 판정이 아니다. */
const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; diag: number }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return {
    sc, edges, diag,
    strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })),
  };
}

/** 참 3D에서 두 모서리가 점을 공유하는가 — **가짜 교점**을 세는 기준. */
const shares = (A: TrueEdge, B: TrueEdge): boolean => {
  for (const p of [A.a, A.b]) for (const q of [B.a, B.b]) {
    if (norm3(sub3(p, q)) < 1e-9) return true;
  }
  return false;
};

/** 전역 최적 배율로 맞춘 뒤 **획별** 위치 오차(상자 대각 대비). 끝점 뒤집힘을 가려낸다. */
/**
 * 정의는 `metrics.perStrokeErrorMap` 하나다 — 여기 있던 것은 `scene3d`(당시)의 복사본이었다.
 * 세 벌이 돌아다녔고 값은 같았지만, 네 번째로 만들어진 `promote.segErr`는 **값이 달랐다**.
 */
const perStrokeError = perStrokeErrorMap;

/** 카운터 묶음 — **분자/분모로 적는다**(PITFALLS #14). */
const bag = () => ({
  scenes: 0, confirmed: 0, vps1: 0, vps2: 0, vps3: 0,
  assigned: 0, misassigned: 0, unassigned: 0,
  joints: 0, fakeJoints: 0,
  comp: 0, placedOfComp: 0, placedOf12: 0, total12: 0,
  silentWrong: 0, placed: 0,
  fErr: [] as number[], shapeMax: [] as number[], shapeMed: [] as number[],
  residual: [] as number[], segGap: [] as number[], inkGap: [] as number[],
  tilt: [] as number[], fitErr: [] as number[], axisDirErr: [] as number[],
});
type Bag = ReturnType<typeof bag>;

const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);
const report = (b: Bag) => ({
  scenes: b.scenes,
  confirm: { k: b.confirmed, n: b.scenes, rate: rate(b.confirmed, b.scenes) },
  vps_found: { one: b.vps1, two: b.vps2, three: b.vps3 },
  misassign: { k: b.misassigned, n: b.assigned, rate: rate(b.misassigned, b.assigned),
               unassigned: b.unassigned, population: b.total12 },
  fake_joints: { k: b.fakeJoints, n: b.joints, rate: rate(b.fakeJoints, b.joints) },
  placement: { k: b.placedOfComp, n: b.comp, rate: rate(b.placedOfComp, b.comp),
               of_all: { k: b.placedOf12, n: b.total12, rate: rate(b.placedOf12, b.total12) } },
  silent_wrong: { k: b.silentWrong, n: b.placed, rate: rate(b.silentWrong, b.placed),
                  threshold: 0.2 },
  f_rel_err: stat(b.fErr), shape_err_max: stat(b.shapeMax), shape_err_median: stat(b.shapeMed),
  joint_residual: stat(b.residual), seg_gap_px: stat(b.segGap), ink_gap_px: stat(b.inkGap),
  axis_tilt_deg: stat(b.tilt), fitted_f_rel_err: stat(b.fitErr),
  /** 검출 축 방향 ↔ 가장 가까운 참 축 방향의 각(도). **번호 규약과 무관하다.** */
  axis_dir_err_deg: stat(b.axisDirErr),
});

/** 한 장면을 재고 카운터에 넣는다. `camera`가 `"true"`면 참 카메라·참 축 라벨(오라클)이다. */
function measure(fx: Fx, camera: "true" | "detected" | "fitted", b: Bag,
                 cfg: { fScale?: number } = {}) {
  const { sc, edges, diag } = fx;
  b.scenes += 1;
  b.total12 += edges.length;

  const lines = linesFromStrokes(fx.strokes, SZ);
  const cands = detectVps(lines, SZ);
  const detVps = assignAxes(cands, lines);
  const cam = recoverCamera(detVps, SZ, { fSetting: sc.f });
  if (cands.length === 1) b.vps1 += 1; else if (cands.length === 2) b.vps2 += 1;
  else if (cands.length >= 3) b.vps3 += 1;
  if (cam.ok) b.confirmed += 1;
  if (cam.ok && cam.f) b.fErr.push(Math.abs(cam.f - sc.f) / sc.f);

  // 오배정 — 지지 집합의 다수결 축과 다른 획. **분모는 배정된 획**이고 배정 안 된 것도 센다
  const detAxis = classifyByDetection(lines, cands, detVps, SZ);
  let assigned = 0;
  for (const cd of cands) {
    const cnt = new Map<Axis, number>();
    for (const id of cd.support) {
      const a = trueAxis(sc, edges[+id.slice(1)].axis);
      cnt.set(a, (cnt.get(a) ?? 0) + 1);
    }
    const maj = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
    for (const id of cd.support) {
      assigned += 1;
      if (trueAxis(sc, edges[+id.slice(1)].axis) !== maj) b.misassigned += 1;
    }
  }
  b.assigned += assigned;
  b.unassigned += edges.length - assigned;

  // **축 방향 오차** — 번호 규약을 타지 않도록 "가장 가까운 참 축"으로 짝짓는다.
  // f 오차만으로는 형태 붕괴가 설명되지 않아(의도적 f 10%는 shpMed 0.098→0.115뿐)
  // 실제 지배항이 무엇인지 보려고 넣었다.
  if (cam.ok && cam.f) {
    const trueDirs = [0, 1, 2].map(i => sc.axes[i]);
    for (const v of detVps) {
      if (!v) continue;
      const d = axisDirection(v, cam.principalPoint ?? [SZ[0] / 2, SZ[1] / 2], cam.f);
      let best = 90;
      for (const t of trueDirs) {
        const a = (Math.acos(Math.min(1, Math.abs(dot3(unit3(d), unit3(t))))) * 180) / Math.PI;
        best = Math.min(best, a);
      }
      b.axisDirErr.push(best);
    }
  }

  // 올리기 — 오라클과 검출을 갈라 잰다
  const trueCam = camera === "true";
  const trueAx = camera === "true";
  const useTrue = trueCam;
  // **카메라 일괄 적합**(§5.1) — 배정된 축 획 전부로 회전 3 + f 1을 한 번에 맞춘다
  let fitVps = detVps, fitF = cam.f ?? sc.f;
  if (camera === "fitted" && cam.ok) {
    const fl: FitLine[] = [];
    for (const L of lines) {
      const a = detAxis.get(L.id);
      if (typeof a === "number") fl.push({ id: L.id, rep: L.rep, axis: a });
    }
    const fit = fitCamera(fl, detVps, cam.f ?? sc.f, SZ);
    if (fit.ok) { fitVps = fit.vps; fitF = fit.f; b.fitErr.push(Math.abs(fit.f - sc.f) / sc.f); }
  }
  const ctx: LiftCtx = useTrue
    ? { principal: sc.principal, f: sc.f * (cfg.fScale ?? 1), vps: trueVps(sc), imgSize: SZ }
    : { principal: cam.principalPoint ?? [SZ[0] / 2, SZ[1] / 2],
        f: (camera === "fitted" ? fitF : (cam.f ?? sc.f)) * (cfg.fScale ?? 1),
        vps: camera === "fitted" ? fitVps : detVps, imgSize: SZ };
  const strokes: LiftStroke[] = fx.strokes.map((s, i) => ({
    ...s, axis: trueAx ? trueAxis(sc, edges[i].axis) : (detAxis.get(s.id) ?? "free"),
  }));
  if (!trueCam && !cam.ok) return;                     // 카메라가 없으면 올릴 수 없다

  const r = liftAll(strokes, ctx);
  for (const F of strokes.map(s => frameOf(s, ctx))) if (!("reason" in F)) b.tilt.push(F.tiltDeg);
  b.joints += r.joints.length;
  for (const j of r.joints) {
    if (!shares(edges[+j.i.slice(1)], edges[+j.j.slice(1)])) b.fakeJoints += 1;
  }
  b.comp += r.component.length;
  b.placedOfComp += r.placed.size;
  b.placedOf12 += r.placed.size;
  b.placed += r.placed.size;
  if (r.residual.median != null) b.residual.push(r.residual.median);

  const errs = perStrokeError(r.placed, edges, diag);
  const vals = [...errs.values()];
  for (const v of vals) if (v > 0.2) b.silentWrong += 1;
  if (vals.length) {
    b.shapeMax.push(Math.max(...vals));
    b.shapeMed.push(median(vals) ?? 0);
  }
  const gaps = transitionGap(strokes, r.placed, ctx);
  if (gaps.segGap.length) b.segGap.push(Math.max(...gaps.segGap));
  if (gaps.inkGap.length) b.inkGap.push(Math.max(...gaps.inkGap));
}

describe("L-A 게이트 (§5.1~§5.3)", () => {
  it("소실점 검출 스윕을 원장에 낸다", () => {
    // ---- support_deg 스윕. **분모를 함께 낸다**(배정된 획 / 모집단)
    const degs = [1.5, 2.0, 2.5, 3.0, 4.0, 6.0];
    const bySupportDeg: Record<string, unknown> = {};
    for (const deg of degs) {
      const byJit: Record<string, unknown> = {};
      const all = bag();
      for (const jit of JITTERS) {
        const b = bag();
        for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
          for (const g of GRADES) for (const sd of SEEDS) {
            const fx = fixture(ci, jit, g, sd);
            if (!fx) continue;
            const lines = linesFromStrokes(fx.strokes, SZ);
            const cands = detectVps(lines, SZ, { support_deg: deg });
            const vps = assignAxes(cands, lines);
            const cam = recoverCamera(vps, SZ, { fSetting: fx.sc.f });
            for (const bb of [b, all]) {
              bb.scenes += 1; bb.total12 += fx.edges.length;
              if (cands.length === 1) bb.vps1 += 1;
              else if (cands.length === 2) bb.vps2 += 1;
              else if (cands.length >= 3) bb.vps3 += 1;
              if (cam.ok) bb.confirmed += 1;
              if (cam.ok && cam.f) bb.fErr.push(Math.abs(cam.f - fx.sc.f) / fx.sc.f);
              let asg = 0;
              for (const cd of cands) {
                const cnt = new Map<Axis, number>();
                for (const id of cd.support) {
                  const a = trueAxis(fx.sc, fx.edges[+id.slice(1)].axis);
                  cnt.set(a, (cnt.get(a) ?? 0) + 1);
                }
                const maj = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
                for (const id of cd.support) {
                  asg += 1;
                  if (trueAxis(fx.sc, fx.edges[+id.slice(1)].axis) !== maj) bb.misassigned += 1;
                }
              }
              bb.assigned += asg;
              bb.unassigned += fx.edges.length - asg;
            }
          }
        }
        byJit[`jitter_${jit}`] = report(b);
      }
      bySupportDeg[`deg_${deg}`] = { all: report(all), by_jitter: byJit };
    }

    // ---- min_reach 스윕. **양방향으로 본다** — 꼭짓점을 막는가(거짓 양성),
    //      그리고 소실점이 가까운 구도에서 참 소실점을 죽이는가(거짓 음성)
    const byMinReach: Record<string, unknown> = {};
    for (const mr of [0, 0.5, 1.0, 2.0, 4.0]) {
      const b = bag();
      const near = bag();                              // 1점 구도 = 소실점이 그림 안에 있다
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const jit of [0.005, 0.03]) for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, jit, g, sd);
          if (!fx) continue;
          const lines = linesFromStrokes(fx.strokes, SZ);
          const cands = detectVps(lines, SZ, { min_reach: mr });
          const tgt = COMPOSITIONS[ci].name.startsWith("1pt") ? near : b;
          for (const bb of [tgt]) {
            bb.scenes += 1; bb.total12 += fx.edges.length;
            if (cands.length >= 3) bb.vps3 += 1;
            else if (cands.length === 2) bb.vps2 += 1;
            else if (cands.length === 1) bb.vps1 += 1;
            let asg = 0;
            for (const cd of cands) {
              const cnt = new Map<Axis, number>();
              for (const id of cd.support) {
                const a = trueAxis(fx.sc, fx.edges[+id.slice(1)].axis);
                cnt.set(a, (cnt.get(a) ?? 0) + 1);
              }
              const maj = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
              for (const id of cd.support) {
                asg += 1;
                if (trueAxis(fx.sc, fx.edges[+id.slice(1)].axis) !== maj) bb.misassigned += 1;
              }
            }
            bb.assigned += asg;
            bb.unassigned += fx.edges.length - asg;
          }
        }
      }
      byMinReach[`reach_${mr}`] = { far_vps: report(b), near_vps_1pt: report(near) };
    }

    // ---- min_spread_mult 스윕 (localizability). **참 소실점이 유한/무한인 다발을 갈라 본다** —
    //      한쪽만 보면 거짓 양성이나 거짓 음성 한 방향만 잠근다(리뷰어 지적).
    const bySpread: Record<string, unknown> = {};
    for (const ms of [0, 1.0, 1.5, 2.0, 3.0]) {
      let finTrue = 0, finKept = 0, infTrue = 0, infKept = 0;
      const spreadsTrueFinite: number[] = [], spreadsTrueInf: number[] = [];
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const jit of [0.005, 0.03]) for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, jit, g, sd);
          if (!fx) continue;
          const lines = linesFromStrokes(fx.strokes, SZ);
          for (const cd of detectVps(lines, SZ, { min_spread_mult: ms })) {
            // 다수결 참 축이 유한 소실점을 갖는가
            const cnt = new Map<Axis, number>();
            for (const id of cd.support) {
              const a = trueAxis(fx.sc, fx.edges[+id.slice(1)].axis);
              cnt.set(a, (cnt.get(a) ?? 0) + 1);
            }
            const maj = [...cnt.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
            const isFin = typeof maj === "number";
            if (isFin) { finTrue += 1; if (!cd.infinite) finKept += 1; spreadsTrueFinite.push(cd.spreadDeg); }
            else { infTrue += 1; if (!cd.infinite) infKept += 1; spreadsTrueInf.push(cd.spreadDeg); }
          }
        }
      }
      bySpread[`mult_${ms}`] = {
        true_finite_kept: { k: finKept, n: finTrue, rate: rate(finKept, finTrue) },
        true_infinite_wrongly_kept: { k: infKept, n: infTrue, rate: rate(infKept, infTrue) },
        spread_deg_true_finite: stat(spreadsTrueFinite),
        spread_deg_true_infinite: stat(spreadsTrueInf),
      };
    }

    // ---- D-L5 대조: 최소제곱 가중. **획 길이가 비슷하면 가중이 항등에 가까워진다** —
    //      그것을 함께 재지 않으면 "차이가 없다"를 "알고리즘의 몫이 아니다"로 잘못 읽는다
    const lsWeight: Record<string, unknown> = {};
    const lenRatio: number[] = [];
    for (const w of ["uniform", "len", "len2"] as const) {
      const errs: number[] = [];
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const jit of [0, 0.005, 0.01, 0.03]) for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, jit, g, sd);
          if (!fx) continue;
          const lines = linesFromStrokes(fx.strokes, SZ);
          if (w === "uniform" && jit === 0 && g === "precise" && sd === 1) {
            const ls = lines.map(L => L.rep.len);
            lenRatio.push(Math.max(...ls) / Math.min(...ls));
          }
          // 참 축 라벨로 군집을 준다(오라클) — 검출 오차를 섞지 않는다
          const groups: Record<string, typeof lines> = {};
          lines.forEach(L => {
            const a = trueAxis(fx.sc, fx.edges[+L.id.slice(1)].axis);
            if (typeof a !== "number") return;
            (groups[a] ??= []).push(L);
          });
          const vps: (Pt2 | null)[] = [null, null, null];
          for (const k of Object.keys(groups)) {
            let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0;
            for (const { rep } of groups[k]) {
              const dx = rep.b[0] - rep.a[0], dy = rep.b[1] - rep.a[1];
              const L = Math.hypot(dx, dy);
              if (L < 1e-9) continue;
              const n: Pt2 = [-dy / L, dx / L];
              const c = n[0] * rep.a[0] + n[1] * rep.a[1];
              const wt = w === "len" ? L : w === "len2" ? L * L : 1;
              a00 += wt * n[0] * n[0]; a01 += wt * n[0] * n[1]; a11 += wt * n[1] * n[1];
              b0 += wt * n[0] * c; b1 += wt * n[1] * c;
            }
            const det = a00 * a11 - a01 * a01;
            if (Math.abs(det) < 1e-9) continue;
            vps[+k] = [(a11 * b0 - a01 * b1) / det, (a00 * b1 - a01 * b0) / det];
          }
          const cam = recoverCamera(vps, SZ, { fSetting: fx.sc.f });
          if (cam.ok && cam.f) errs.push(Math.abs(cam.f - fx.sc.f) / fx.sc.f);
        }
      }
      lsWeight[w] = stat(errs);
    }

    // ---- 단위 재매개화가 임계를 바꾸지 않는다는 확인 (D-L2 정정)
    //      φ = asin(2·misfit) 이므로 misfit 0.06 ⟺ φ 6.892°. 같은 값이어야 한다.
    const equiv = { misfit_0_06_as_deg: round((Math.asin(2 * 0.06) * 180) / Math.PI, 4),
                    deg_2_5_as_misfit: round(Math.sin((2.5 * Math.PI) / 180) / 2, 5) };

    const doc = {
      what: "L-A.2 소실점 후보 검출 — support_deg·min_reach 스윕, 최소제곱 가중 대조",
      plan: "docs/line_plan.md §5.1",
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS,
        jitter_note: "0.03·0.05가 유일한 실획 자릿수(AS-C2 0.028~0.051). S·G는 그 구간 미측정",
        grades: GRADES, seeds: SEEDS,
        denominators: {
          confirm: "분모 = 장면 수. 분자 = recoverCamera.ok",
          confirm_note: "1점 구도는 소실점이 하나뿐이므로 f가 설정값이다(AS-C4). "
            + "사전 등록의 '소실점 ≥2'는 1점 구도에 적용되지 않아 cam.ok로 판정한다",
          misassign: "분모 = 소실점에 **배정된 획**. unassigned·population을 함께 낸다",
        },
      },
      by_support_deg: bySupportDeg,
      by_min_reach: byMinReach,
      by_min_spread_mult: bySpread,
      spread_note: "참 소실점이 **유한**인 다발을 살리는가(첫 열)와 **무한원**인 다발을 "
        + "잘못 받는가(둘째 열)를 함께 낸다. 한쪽만 보면 한 방향만 잠근다",
      ls_weight_oracle: lsWeight,
      screen_len_ratio_per_composition: lenRatio.map(v => round(v, 3)),
      screen_len_ratio_note: "12모서리의 화면 길이 최대/최소 비. **1.5 미만이면 길이 가중이 "
        + "균등 가중과 거의 같아지므로 `ls_weight_oracle`의 무변화는 정보가 없다**(리뷰어 지적)",
      unit_equivalence: equiv,
      unit_note: "`vpMisfit = sin φ / 2`이므로 각도 임계는 부적합도 임계의 **단조 재매개화**다. "
        + "단위를 바꾸는 것은 아무것도 고치지 않는다(PITFALLS #24). "
        + "misfit 0.06은 6.892°이므로 채택한 2.5°는 그보다 **엄격하다**",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "vp_detect.json"), JSON.stringify(doc, null, 2));
    expect(Object.keys(bySupportDeg).length).toBe(degs.length);
  }, 600_000);

  it("초기 올리기 게이트를 원장에 낸다", () => {
    const byJit: Record<string, unknown> = {};
    const byComp: Record<string, unknown> = {};
    for (const jit of JITTERS) {
      const det = bag(), tru = bag(), fit = bag();
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, jit, g, sd);
          if (!fx) continue;
          measure(fx, "detected", det);
          measure(fx, "fitted", fit);
          measure(fx, "true", tru);
        }
      }
      byJit[`jitter_${jit}`] = {
        detected_camera: report(det), fitted_camera: report(fit),
        true_camera_oracle: report(tru),
      };
    }
    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const det = bag(), tru = bag(), base = bag(), baseT = bag(), fitB = bag();
      for (const jit of JITTERS) for (const g of GRADES) for (const sd of SEEDS) {
        const fx = fixture(ci, jit, g, sd);
        if (!fx) continue;
        measure(fx, "detected", det);
        measure(fx, "true", tru);
        // **게이트의 문장은 "상자 하나"다** — 기준 동작점(실획 자릿수 아래, jitter ≤ 0.01)을
        // 따로 낸다. 넓힌 스윕은 한계를 재는 것이고 게이트가 요구한 것보다 엄격하다
        if (jit <= 0.01) {
          measure(fx, "detected", base); measure(fx, "true", baseT);
          measure(fx, "fitted", fitB);
        }
      }
      byComp[COMPOSITIONS[ci].name] = {
        detected_camera: report(det), true_camera_oracle: report(tru),
        baseline_jitter_le_0_01: { detected_camera: report(base), fitted_camera: report(fitB),
                                   true_camera_oracle: report(baseT) },
      };
    }

    // ---- **§5.3의 지표가 측정인가 보장인가.** f를 틀리게 주고 두 지표가 움직이는지 본다.
    //      전환 픽셀 차이가 안 움직이면 그것은 측정이 아니다(PITFALLS #5).
    const fBias: Record<string, unknown> = {};
    for (const fs of [0.8, 0.9, 1.0, 1.1, 1.2]) {
      const b = bag();
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
        for (const g of GRADES) for (const sd of SEEDS) {
          const fx = fixture(ci, 0.005, g, sd);
          if (fx) measure(fx, "true", b, { fScale: fs });
        }
      }
      fBias[`f_scale_${fs}`] = {
        seg_gap_px: stat(b.segGap), joint_residual: stat(b.residual),
        shape_err_median: stat(b.shapeMed), placement: report(b).placement,
      };
    }

    const doc = {
      what: "L-A 게이트 — 초기 3D 올리기(§5.2)와 전환(§5.3)",
      plan: "docs/line_plan.md §5.4(3D 올리기) · 사전 등록: progress.md 'L-A 게이트 — 사전 등록' — **개정 2 번호**",
      gate: gate({
        registered: "L-A 게이트(CLAUDE.md §2 초판) — 상자 하나를 그리면 확정되고, 전환 시 "
          + "화면이 안 튀고, 연결된 획이 전부 놓이는가. 측정 전에 박았다(#26).",
        reachability: "**같은 하네스의 `true_camera_oracle` 팔이 그 자리다** — 참 소실점·참 축을 "
          + "주면 무엇이 나오는지 `by_jitter.*.true_camera_oracle`에 있다. ⚠ 이 원장의 "
          + "오라클 조용히 틀림 0.0791은 **대역으로 쓰면 안 된다** — 분모가 최대 연결 성분이고 "
          + "**검출 오배정이 섞여 있다**(PITFALLS #27). 대역은 `camera_gate`의 `deg_0` 행이다.",
        status: "**은퇴했다.** 2026-08-15에 실패했고(조용히 틀린 배치 0.641) 대응이 계획서 §5.4다. "
          + "재등록된 게이트는 `camera_gate.json`의 `gate` 블록(L-A.7)이다.",
      }),
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name), jitters: JITTERS,
        grades: GRADES, seeds: SEEDS,
        denominators: {
          placement: "분모 = 가장 큰 연결 성분의 획 수. of_all은 모집단 12",
          silent_wrong: "분모 = 놓인 획. 임계 = 형태 오차 0.2 상자 대각",
          fake_joints: "분모 = 채택된 교점 전부. 분자 = 참 3D에서 점을 공유하지 않는 교점",
        },
      },
      by_jitter: byJit,
      by_composition_all_jitters: byComp,
      f_bias: fBias,
      f_bias_note: "**`seg_gap_px`가 f에 무관하면 §5.3의 전환 픽셀 차이는 측정이 아니라 "
        + "설계 보장이다**(각 점이 자기 광선 위에 있으므로 같은 카메라 재투영은 항등). "
        + "그때 카메라 오류를 잡는 것은 `joint_residual`이어야 한다 — 그것이 f로 움직이는지 본다",
      compare_prior: {
        note: "구 접근과의 대조. 조건이 다르므로(구도·경로) 자릿수만 읽는다",
        S_first_view: { placement: 0.846, silent_wrong: 0.057 },
        G_first_view: { placement: 0.887, silent_wrong: 0.278 },
        source: "docs/archive/segment_plan.md 머리말 · segment_gate.json@1671e540",
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "lift_gate.json"), JSON.stringify(doc, null, 2));
    expect(Object.keys(byJit).length).toBe(JITTERS.length);
  }, 600_000);
});
