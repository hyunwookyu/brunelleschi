// L-B.3(항목 b) **초안 변환이 확정률 0.88을 0.34로 떨어뜨리는 이유** — 산출: `stage0/out/draft_recover.json`.
//
// L-B.2가 남긴 사실: `vp_detect`는 같은 잡음에서 확정률 **0.883**인데, 검출을 **가이드 선
// 두 개로 줄이는 초안 변환**을 거치면 카메라가 서는 것이 **31/90**이다. 사유 카운터에서
// 지배항은 `recover_failed` **30**이었다 — 가이드는 넷 이상인데 카메라가 안 선다.
//
// 사람 지시: **실패 조건을 특정한다. 각도 파라미터화 전환과 관련 있는지 확인할 것.**
//
// ---------------------------------------------------------------- 가설과 그 시험
//
// `draftFromDetection`은 소실점마다 **지지선 중 가장 긴 둘**을 고른다. 그런데 소실점은
// **두 선의 교점**이므로 조건을 정하는 것은 길이만이 아니라 **두 선의 각차**다 —
// 나란한 두 선은 아무리 길어도 교점이 안 정해진다. 그리고 L-A.7이 넣은 **무한원 스냅**
// (각차 < `HOMOG_TOL.snap_deg` = 3°)이 그런 축을 **비운다**. 축이 비면 소실점 개수가 줄고
// 카메라가 안 설 수 있다.
//
// **그것이 "각도 파라미터화 전환과 관련 있는가"의 정확한 형태다.** 시험은 둘이다:
//
// ```
// ① snap_deg 0(끔) 대 3(켬)          → 무한원 스냅이 지배항인가
// ② 지지선 선택 longest / widest / len_x_sep  → 길이만 보는 것이 원인인가
// ```
//
// ⚠ **확정률만 보면 안 된다**(#16). 카메라가 서기만 하고 **틀리면 더 나쁘다** —
// 조용히 틀린 배치를 만든다. 그래서 **축 방향 오차를 함께 낸다**. 그것이 이 표의 양성 채널이다(#30).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { draftFromDetection, extendGuide, byAxis, neutralGuides, DRAFT_TOL,
         type Guide } from "../src/s3d/vpDraft.js";
import { vpFromGuides, separationDeg, HOMOG_TOL } from "../src/s3d/vpHomog.js";
import { solveGuides } from "../src/s3d/vpSensitivity.js";
import { detectVps, linesFromStrokes, assignAxes } from "../src/s3d/vpDetect.js";
import { ConstraintAccumulator, type AxisId } from "../src/s3d/constraints.js";
import { axisDirection, unit3, dot3, type Vec3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round, type Scene } from "./scene3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { axisDirErrors as axisDirErrorsM, metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** **`guide_budget`와 완전히 같은 조건** — 아니면 31/90을 설명하는 것이 아니다(#27). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const SZ: [number, number] = [1280, 675];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const PICKS = ["longest", "widest", "len_x_sep"] as const;
/** 무한원 스냅 각차. **0은 끈 것**이다 — L-A.7 이전 상태의 대조군. */
const SNAP_DEGS = [0, HOMOG_TOL.snap_deg, 6];

/** 검출 축 방향 ↔ 가장 가까운 참 축 방향의 각(도). **번호 규약과 무관하다.** */
/** 정의는 `metrics.axisDirErrors` 하나다 — 여기 있던 것은 `camera_gate`의 **바이트 동일한 복사본**이었다. */
const axisDirErrors = (vps: (Pt2 | null)[], principal: Pt2, f: number, sc: Scene): number[] =>
  axisDirErrorsM(vps, principal, f, sc.axes);

/** `solveGuides`와 같은 경로이되 **무한원 스냅 각차를 바꿔 가며** 돈다(대조군). */
function solveWithSnap(guides: Guide[], snapDeg: number) {
  const acc = new ConstraintAccumulator(SZ);
  const per = byAxis(guides);
  let snapped = 0;
  for (const ax of [0, 1, 2] as AxisId[]) {
    if (per[ax].length < 2) { acc.setLines(ax, per[ax]); continue; }
    const r = vpFromGuides(per[ax][0], per[ax][1], SZ, { snap_deg: snapDeg });
    if (r.infinite) snapped += 1;
    acc.setLines(ax, r.infinite ? [] : per[ax]);
  }
  const s = acc.solve();
  const c = s.camera;
  if (!c.ok || c.f == null || !c.principalPoint) return { ok: false as const, snapped };
  const vps = ([0, 1, 2] as AxisId[]).map(a =>
    (s.axes[a].status === "fixed" ? ((s.axes[a] as { vp: Pt2 }).vp) : null));
  return { ok: true as const, snapped, principal: c.principalPoint, f: c.f, vps, nVps: c.nVps };
}

interface Cell {
  n: number; ok: number;
  guidesLt4: number; axesLt2: number; recoverFailed: number;
  snappedAxes: number; sep: number[]; axErr: number[]; fRel: number[];
}
const cell = (): Cell => ({ n: 0, ok: 0, guidesLt4: 0, axesLt2: 0, recoverFailed: 0,
                            snappedAxes: 0, sep: [], axErr: [], fRel: [] });
const rep = (c: Cell) => ({
  camera_ok: `${c.ok}/${c.n}`,
  rate: round(c.ok / Math.max(1, c.n), 4),
  // **직접 센 집합으로만 비율을 낸다**(#10). 셋의 합 + ok = n이어야 한다
  guides_lt_4: c.guidesLt4, axes_lt_2: c.axesLt2, recover_failed: c.recoverFailed,
  sum_check: c.guidesLt4 + c.axesLt2 + c.recoverFailed + c.ok === c.n,
  axes_snapped_to_infinity: c.snappedAxes,
  guide_pair_separation_deg: stat(c.sep, 2),
  // **양성 채널**(#30·#16) — 카메라가 서기만 하고 틀리면 더 나쁘다
  axis_dir_err_deg: stat(c.axErr, 3),
  f_rel_err: stat(c.fRel, 4),
});

describe("L-B.3(b) — 초안 변환에서 카메라가 안 서는 조건", () => {
  it("측정을 원장에 남긴다", () => {
    /** `pick|snapDeg` → 집계. */
    const cube: Record<string, Cell> = {};
    /** 검출 자체의 확정률 — **초안 변환 이전**이다. 0.88과 0.34를 가르는 기준선이다. */
    const detect = { n: 0, vps2plus: 0, vps3: 0, camOk: 0 };
    /** 등급·구도별(기본 조건 `longest` + 켠 스냅). */
    const byGrade: Record<string, Cell> = {};
    const byComp: Record<string, Cell> = {};
    /** **가이드 쌍의 각차 분포** — 이것이 가설의 핵심 변수다. */
    const sepByPick: Record<string, number[]> = {};

    for (const grade of GRADES) for (const C of COMPOSITIONS) for (const seed of SEEDS) {
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      const O = groundPoint(sc, C.origin);
      if (!O) continue;
      const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
      // **`guide_budget`와 같은 시드 산식·잡음 0.01·skew 0.12**
      const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + 1), 0.12, 0.01, 0);
      if (!drawn) continue;
      const src = drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[] }));

      // ---- 기준선: **초안 변환 이전의 검출**. 여기서 이미 몇 개가 서는가
      const lines = linesFromStrokes(src, SZ);
      const cands = detectVps(lines, SZ);
      const detVps = assignAxes(cands, lines);
      const nFinite = detVps.filter(v => v && isFiniteVp(v, SZ)).length;
      detect.n += 1;
      if (nFinite >= 2) detect.vps2plus += 1;
      if (nFinite >= 3) detect.vps3 += 1;

      for (const pick of PICKS) {
        const draft0 = draftFromDetection(src, SZ, { support_pick: pick, fill_missing_axes: false });
        let ext = draft0;
        for (let i = 0; i < draft0.length; i++) ext = extendGuide(ext, i, SZ);
        const per = byAxis(ext);
        const seps: number[] = [];
        for (const ax of [0, 1, 2] as AxisId[]) {
          if (per[ax].length >= 2) seps.push(separationDeg(per[ax][0], per[ax][1]));
        }
        (sepByPick[pick] ??= []).push(...seps);

        for (const sd of SNAP_DEGS) {
          const key = `${pick}|snap${sd}`;
          const c = (cube[key] ??= cell());
          c.n += 1;
          c.sep.push(...seps);
          if (draft0.length < 4) { c.guidesLt4 += 1; continue; }
          const axesWithTwo = ([0, 1, 2] as const)
            .filter(a => ext.filter(g => g.axis === a).length >= 2).length;
          const r = solveWithSnap(ext, sd);
          c.snappedAxes += r.snapped;
          if (!r.ok) {
            if (axesWithTwo < 2) c.axesLt2 += 1; else c.recoverFailed += 1;
            continue;
          }
          c.ok += 1;
          for (const e of axisDirErrors(r.vps, r.principal, r.f, sc)) c.axErr.push(e);
          c.fRel.push(Math.abs(r.f - sc.f) / sc.f);
          // 기본 조건만 등급·구도로 나눈다
          if (pick === "longest" && sd === HOMOG_TOL.snap_deg) {
            const g = (byGrade[grade] ??= cell());
            const cc = (byComp[C.name] ??= cell());
            for (const t of [g, cc]) {
              t.n += 0; t.ok += 1;                        // n은 아래에서 따로 센다
              for (const e of axisDirErrors(r.vps, r.principal, r.f, sc)) t.axErr.push(e);
            }
          }
        }
        // 등급·구도 셀의 분모는 **시행 수**로 따로 센다(#11 — 분자와 분모의 출처를 섞지 않는다)
        if (pick === "longest") {
          (byGrade[grade] ??= cell()).n += 1;
          (byComp[C.name] ??= cell()).n += 1;
        }
      }
      // ---- **빈 축을 중립으로 채운 팔**(채택안). 초안이 있는 축은 그대로다.
      for (const pick of PICKS) {
        const filled0 = draftFromDetection(src, SZ, { support_pick: pick, fill_missing_axes: true });
        let fe = filled0;
        for (let i = 0; i < filled0.length; i++) fe = extendGuide(fe, i, SZ);
        const c = (cube[`${pick}_filled|snap${HOMOG_TOL.snap_deg}`] ??= cell());
        c.n += 1;
        const perF = byAxis(fe);
        for (const ax of [0, 1, 2] as AxisId[]) {
          if (perF[ax].length >= 2) c.sep.push(separationDeg(perF[ax][0], perF[ax][1]));
        }
        if (filled0.length < 4) { c.guidesLt4 += 1; continue; }
        const axesWithTwo = ([0, 1, 2] as const)
          .filter(a => fe.filter(g => g.axis === a).length >= 2).length;
        const r = solveWithSnap(fe, HOMOG_TOL.snap_deg);
        c.snappedAxes += r.snapped;
        if (!r.ok) { if (axesWithTwo < 2) c.axesLt2 += 1; else c.recoverFailed += 1; continue; }
        c.ok += 1;
        for (const e of axisDirErrors(r.vps, r.principal, r.f, sc)) c.axErr.push(e);
        c.fRel.push(Math.abs(r.f - sc.f) / sc.f);
      }

      // ---- **중립 시작 대조군**(사람 지시: "나쁜 초안보다 중립 시작이 나을 수 있다").
      // 그림을 **전혀 안 보고** 표준 2점 구도로 가이드를 세운다. 초안의 가치가 "카메라를
      // 세우는 것"이 아니라 "**끌기 시작 위치가 참값에 가까운 것**"이라면 여기서 갈린다.
      {
        const c = (cube[`neutral_ignores_drawing|snap${HOMOG_TOL.snap_deg}`] ??= cell());
        c.n += 1;
        const r = solveWithSnap(neutralGuides(SZ), HOMOG_TOL.snap_deg);
        c.snappedAxes += r.snapped;
        if (!r.ok) c.recoverFailed += 1;
        else {
          c.ok += 1;
          for (const e of axisDirErrors(r.vps, r.principal, r.f, sc)) c.axErr.push(e);
          c.fRel.push(Math.abs(r.f - sc.f) / sc.f);
        }
      }

      // 참 소실점을 넣으면 카메라가 서는가 — **상한**(검출·초안이 완벽할 때)
      const t = solveGuides(
        ([0, 1, 2] as const).flatMap(a => {
          const v = sc.vps[a];
          if (!isFiniteVp(v, SZ)) return [];
          return [
            { axis: a, a: [v[0], v[1]] as Pt2, b: [SZ[0] * 0.3, SZ[1] * 0.35] as Pt2 },
            { axis: a, a: [v[0], v[1]] as Pt2, b: [SZ[0] * 0.7, SZ[1] * 0.7] as Pt2 },
          ] as Guide[];
        }), SZ);
      if (t) detect.camOk += 1;
    }

    const doc = {
      what: "L-B.3(b) — 검출 확정률 0.88이 초안 변환에서 0.34가 되는 이유",
      why: "L-B.2가 `guide_budget.json`에 남긴 사실이다(카메라 성립 31/90, 지배항 "
        + "`recover_failed` 30). **어느 단계에서 무엇을 잃는지**가 없었다.",
      hypothesis: "`draftFromDetection`이 지지선 중 **가장 긴 둘**을 고르는데, 소실점은 두 선의 "
        + "**교점**이므로 조건을 정하는 것은 길이만이 아니라 **각차**다. 각차가 좁으면 "
        + "L-A.7의 **무한원 스냅**(`snap_deg` 3°)이 그 축을 비우고, 축이 줄면 카메라가 안 선다. "
        + "**이것이 '각도 파라미터화 전환과 관련 있는가'의 정확한 형태다.**",
      method: {
        arms: {
          "support_pick": "`longest`(현행) / `widest`(각차만) / `len_x_sep`(len·len·sin 각차)",
          "snap_deg": `0(끔 — L-A.7 이전 상태) / ${HOMOG_TOL.snap_deg}(현행) / 6`,
        },
        warning: "⚠ **확정률만 보면 안 된다**(#16). 카메라가 서기만 하고 틀리면 더 나쁘다 — "
          + "조용히 틀린 배치가 된다. `axis_dir_err_deg`를 함께 낸다(#30의 양성 채널).",
        same_as_guide_budget: "구도·캔버스·시드 산식·skew 0.12·잡음 0.01이 `guide_budget.json`과 "
          + "같다 — 아니면 31/90을 설명하는 것이 아니다(#27).",
      },
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name), grades: GRADES, seeds: SEEDS,
        canvas_px: SZ, end_jitter: 0.01, skew: 0.12,
        cells_per_arm: `등급 ${GRADES.length} × 구도 ${COMPOSITIONS.length} × 시드 ${SEEDS.length} = 90`,
        default_pick: DRAFT_TOL.support_pick, default_snap_deg: HOMOG_TOL.snap_deg,
      },
      baseline_before_draft: {
        note: "**초안 변환 이전**의 검출. `vp_detect.json`의 확정률과 같은 뜻은 아니다 — "
          + "여기서 세는 것은 '화면 안 유한 소실점이 둘 이상 잡혔는가'다(#27: 두 값을 겹쳐 읽지 않는다).",
        scenes: detect.n,
        detected_finite_vps_ge_2: `${detect.vps2plus}/${detect.n}`,
        detected_finite_vps_ge_3: `${detect.vps3}/${detect.n}`,
        upper_bound_true_vps: `${detect.camOk}/${detect.n}`,
        upper_bound_note: "**참 소실점**으로 가이드를 세우면 카메라가 서는 비율 — 초안이 완벽할 때의 상한.",
      },
      by_arm: Object.fromEntries(Object.entries(cube).map(([k, v]) => [k, rep(v)])),
      guide_pair_separation_deg_by_pick: Object.fromEntries(
        Object.entries(sepByPick).map(([k, v]) => [k, stat(v, 2)])),
      by_grade_default: Object.fromEntries(Object.entries(byGrade).map(([k, v]) =>
        [k, { camera_ok: `${v.ok}/${v.n}`, axis_dir_err_deg: stat(v.axErr, 3) }])),
      by_composition_default: Object.fromEntries(Object.entries(byComp).map(([k, v]) =>
        [k, { camera_ok: `${v.ok}/${v.n}`, axis_dir_err_deg: stat(v.axErr, 3) }])),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "draft_recover.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식: `guide_budget`의 관측을 재현하는가(기본 조건 = `longest` + 현행 스냅)
    const base = cube[`longest|snap${HOMOG_TOL.snap_deg}`];
    expect(base.n).toBe(90);
    // 사유 카운터의 합이 분모와 맞는가 — **뺄셈으로 만들지 않는다**(#10)
    expect(base.guidesLt4 + base.axesLt2 + base.recoverFailed + base.ok).toBe(90);
    // **양성 채널**(#30) — 스냅 각차를 바꾸면 실제로 값이 움직여야 한다.
    // 안 움직이면 "스냅이 원인이 아니다"가 아니라 "섭동이 도달하지 않았다"이다.
    expect(cube["longest|snap0"].snappedAxes).toBe(0);
    expect(cube[`longest|snap6`].snappedAxes)
      .toBeGreaterThanOrEqual(cube[`longest|snap${HOMOG_TOL.snap_deg}`].snappedAxes);
  }, 300_000);
});
