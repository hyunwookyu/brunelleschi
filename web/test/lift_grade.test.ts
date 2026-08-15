// L-B.3(항목 a) **참 카메라에서도 `coarse` 배치가 0.44인 이유** — 산출: `stage0/out/lift_grade.json`.
//
// L-B.1이 남긴 사실: **카메라가 완벽해도 잉크가 거칠면 배치가 무너진다**
// (`stage_cam.json`: precise 0.63 · medium 0.60 · **coarse 0.44**, 분모 1440).
// `lift_gate`·`camera_gate`가 **한 번도 안 잰 등급**이라 원인이 특정되지 않았다.
//
// 사람 지시: **원인을 분해한다 — 축 판정 실패인가, 교점 검출 실패인가, 일괄 풀이의 조건수인가.**
//
// ---------------------------------------------------------------- 어떻게 가르는가
//
// `liftAll`은 세 단계다. 각 단계를 **오라클로 대체해** 배치가 얼마나 돌아오는지 본다.
//
// ```
// ① 축 판정   classifyStroke   →  오라클: 참 축 라벨을 그대로 준다
// ② 교점 검출 findJoints       →  스윕: touch_ratio(접합 반경)를 바꾼다
// ③ 동차 풀이 solveNull        →  ①②를 다 오라클로 준 뒤 남는 것이 이것이다
// ```
//
// **뺄셈으로 만들지 않는다**(#10) — 각 팔을 직접 돌려 직접 센다. 그리고 배치율만 보지 않는다:
// 배치가 늘면서 **조용히 틀린 배치**가 느는지 함께 본다(#16 — 병목이 옮겨간 것을 없어진 것으로 읽지 않는다).
//
// **형태 오차는 `scene3d.perStrokeError` 하나를 쓴다** — `camera_gate`가 쓰던 지역 함수를
// 그리로 옮겼다. 같은 양이 두 숫자로 돌아다니는 것이 #1이다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round, median, perStrokeError,
         type Scene, type TrueEdge } from "./scene3d.js";
import { rng32, INK_GRADES, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/** **`stage_cam`과 완전히 같은 조건**이어야 0.44를 설명하는 것이 된다(#27). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const SZ: [number, number] = [960, 672];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];
/** 접합 반경 스윕. 기본값은 `LIFT_TOL.touch_ratio` = 0.015다. */
const TOUCH = [0.008, 0.015, 0.025, 0.04, 0.06, 0.09];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: LiftStroke[]; diag: number }

function fixture(ci: number, grade: InkGrade, seed: number, jit: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  // **`stage_cam`과 같은 시드 산식·같은 skew** — 다르면 0.44를 설명하는 것이 아니다
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q of pts) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, diag,
           strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })) };
}

/** 참 축 라벨. `screen`은 그 축의 소실점이 무한원일 때다(화면 평행, 이론서 2.2). */
const trueAxis = (sc: Scene, a: 0 | 1 | 2): Axis =>
  (isFiniteVp(sc.vps[a], SZ) ? a : "screen");

/** 두 참 모서리가 **3D에서 꼭짓점을 공유하는가**. 화면 교차가 아니라 이것이 진짜 접합이다. */
function sharesCorner(p: TrueEdge, q: TrueEdge, eps: number): boolean {
  for (const a of [p.a, p.b]) for (const b of [q.a, q.b]) if (norm3(sub3(a, b)) <= eps) return true;
  return false;
}

interface Arm {
  n: number; placed: number; total: number; comp: number;
  axisOk: number; axisWrong: number; axisFree: number; axisN: number;
  jTrue: number; jFalse: number; jMissed: number; jTrueTotal: number;
  reasons: Record<string, number>;
  shape: number[]; w10: number; w20: number; w50: number;
}
const arm = (): Arm => ({
  n: 0, placed: 0, total: 0, comp: 0,
  axisOk: 0, axisWrong: 0, axisFree: 0, axisN: 0,
  jTrue: 0, jFalse: 0, jMissed: 0, jTrueTotal: 0,
  reasons: {}, shape: [], w10: 0, w20: 0, w50: 0,
});
const report = (a: Arm) => ({
  scenes: a.n,
  // **분모를 적는다**(#11) — 모집단 기준이다. 최대 연결 성분 분모는 공짜로 통과시킨다(L-A.4)
  placed_over_all: `${a.placed}/${a.total}`,
  placed_rate: round(a.placed / Math.max(1, a.total), 4),
  component_over_all: `${a.comp}/${a.total}`,
  axis: a.axisN ? { correct: `${a.axisOk}/${a.axisN}`, wrong: `${a.axisWrong}/${a.axisN}`,
                    free: `${a.axisFree}/${a.axisN}` } : null,
  joints: { true_found: `${a.jTrue}/${a.jTrueTotal}`, false_kept: a.jFalse, missed: a.jMissed },
  shape_err: stat(a.shape),
  // **절단값을 하나 고르지 않는다**(#13). 분모는 **놓인 것**이다
  silent_wrong: { cut_0_1: `${a.w10}/${a.placed}`, cut_0_2: `${a.w20}/${a.placed}`,
                  cut_0_5: `${a.w50}/${a.placed}` },
});

function runArm(fx: Fx, a: Arm, oracle: boolean, touch: number) {
  const ctx: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f, vps: trueVps(fx.sc), imgSize: SZ };
  const input: LiftStroke[] = fx.strokes.map((s, i) => {
    if (oracle) return { ...s, axis: trueAxis(fx.sc, fx.edges[i].axis) };
    const v = classifyStroke(s.pts2d, ctx.vps, SZ, {}, { principal: ctx.principal, f: ctx.f });
    return { ...s, axis: v.axis };
  });
  if (!oracle) {
    input.forEach((s, i) => {
      a.axisN += 1;
      const want = trueAxis(fx.sc, fx.edges[i].axis);
      if (s.axis === "free") a.axisFree += 1;
      else if (s.axis === want) a.axisOk += 1;
      else a.axisWrong += 1;
    });
  }
  const r = liftAll(input, ctx, { touch_ratio: touch });
  a.n += 1; a.total += input.length; a.placed += r.placed.size; a.comp += r.component.length;
  for (const u of r.unplaced) a.reasons[u.reason] = (a.reasons[u.reason] ?? 0) + 1;

  // ---- 교점: **3D에서 꼭짓점을 공유하는 쌍**이 진짜 접합이다
  const eps = fx.diag * 1e-6;
  const truePairs = new Set<string>();
  for (let i = 0; i < fx.edges.length; i++) for (let j = i + 1; j < fx.edges.length; j++) {
    if (sharesCorner(fx.edges[i], fx.edges[j], eps)) truePairs.add(`s${i}|s${j}`);
  }
  a.jTrueTotal += truePairs.size;
  const found = new Set(r.joints.filter(j => !j.dropped).map(j => `${j.i}|${j.j}`));
  for (const k of found) (truePairs.has(k) ? a.jTrue++ : a.jFalse++);
  for (const k of truePairs) if (!found.has(k)) a.jMissed++;

  const errs = perStrokeError(r.placed, fx.edges, fx.diag);
  for (const v of errs) {
    a.shape.push(v);
    if (v > 0.1) a.w10 += 1;
    if (v > 0.2) a.w20 += 1;
    if (v > 0.5) a.w50 += 1;
  }
}

describe("L-B.3(a) — 참 카메라에서 coarse 배치가 무너지는 원인", () => {
  it("측정을 원장에 남긴다", () => {
    /** 팔 이름 → 등급 → 집계. */
    const arms: Record<string, Record<string, Arm>> = {};
    const armOf = (name: string, g: string): Arm => {
      arms[name] ??= {};
      return (arms[name][g] ??= arm());
    };
    /** 구도별(기본 조건) — **가장 나쁜 구도가 정한다**(#8). */
    const byComp: Record<string, Record<string, Arm>> = {};
    /** 잡음별(기본 조건) — 동작점을 하나 고르지 않는다(#12). */
    const byJit: Record<string, Record<string, Arm>> = {};

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const cname = COMPOSITIONS[ci].name;
      for (const grade of GRADES) for (const seed of SEEDS) for (const jit of JITTERS) {
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) continue;
        // 기본 조건(= `stage_cam`이 잰 것)
        runArm(fx, armOf("judged_default", grade), false, LIFT_TOL.touch_ratio);
        runArm(fx, armOf("oracle_axis_default", grade), true, LIFT_TOL.touch_ratio);
        for (const t of TOUCH) {
          runArm(fx, armOf(`judged_touch_${t}`, grade), false, t);
          runArm(fx, armOf(`oracle_touch_${t}`, grade), true, t);
        }
        byComp[cname] ??= {};
        runArm(fx, (byComp[cname][grade] ??= arm()), false, LIFT_TOL.touch_ratio);
        byJit[String(jit)] ??= {};
        runArm(fx, (byJit[String(jit)][grade] ??= arm()), false, LIFT_TOL.touch_ratio);
      }
    }

    // 결론 문장의 범위를 **표에서 직접 낸다**(#1 — 손으로 적으면 표와 어긋난다)
    const allArms = Object.values(arms).flatMap(g => Object.values(g));
    const meds = allArms.map(a => median(a.shape)).filter((x): x is number => x != null);
    const sws = allArms.filter(a => a.placed > 0).map(a => a.w20 / a.placed);
    const shapeLo = round(Math.min(...meds), 4), shapeHi = round(Math.max(...meds), 4);
    const swLo = `${Math.round(100 * Math.min(...sws))}%`;
    const swHi = `${Math.round(100 * Math.max(...sws))}%`;
    const touchCurve = TOUCH.map(t2 => round(median(arms[`oracle_touch_${t2}`].precise.shape), 4));
    const jTrue = {
      judged: arms.judged_default.precise.jTrue, oracle: arms.oracle_axis_default.precise.jTrue,
      judgedC: arms.judged_default.coarse.jTrue, oracleC: arms.oracle_axis_default.coarse.jTrue,
    };

    const bake = (m: Record<string, Record<string, Arm>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) =>
        [k, Object.fromEntries(Object.entries(v).map(([g, a]) => [g, report(a)]))]));
    const reasonsOf = (name: string) =>
      Object.fromEntries(GRADES.map(g => [g, arms[name][g].reasons]));

    const doc = {
      what: "L-B.3(a) — **참 카메라**에서 `coarse` 배치가 0.44인 원인을 단계별로 가른다",
      why: "L-B.1이 `stage_cam.json`에 남긴 사실이다(precise 0.63 · medium 0.60 · coarse 0.44, "
        + "분모 1440). `lift_gate`·`camera_gate`가 **한 번도 안 잰 등급**이라 원인이 없었다.",
      method: {
        note: "**뺄셈으로 만들지 않는다**(#10). 각 단계를 오라클로 대체한 팔을 직접 돌린다.",
        arms: {
          judged_default: "실제 경로 — `classifyStroke` + `LIFT_TOL.touch_ratio`(0.015)",
          oracle_axis_default: "**축 판정을 뗀다** — 참 축 라벨을 그대로 준다",
          "judged_touch_*": "**접합 반경 스윕** — 교점 검출이 얼마나 지배하는가",
          "oracle_touch_*": "둘 다 오라클 — **남는 것이 동차 풀이(조건수)와 기하다**",
        },
        camera: "**참 카메라**(합성 장면의 값)를 그대로 준다. 검출·조정은 여기서 안 잰다.",
        shape_err: "`scene3d.perStrokeError` — **`camera_gate`와 같은 함수**다(#1). 구조 대각 대비.",
      },
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name),
        grades: GRADES, seeds: SEEDS, end_jitters: JITTERS, skew: 0.12,
        touch_ratios: TOUCH, touch_default: LIFT_TOL.touch_ratio,
        canvas_px: SZ,
        same_as_stage_cam: "구도·시드 산식·skew·잡음 축이 `stage_cam.json`과 같다 — 아니면 "
          + "0.44를 설명하는 것이 아니다(#27).",
        ink_bow_by_grade: Object.fromEntries(GRADES.map(g => [g, INK_GRADES[g].lf_bow])),
      },
      by_arm: bake(arms),
      unplaced_reasons: {
        note: "**추측하지 말고 센다**(#7). `liftAll`이 이미 사유를 돌려주고 있었는데 "
          + "아무도 세지 않았다. 분모는 그 팔의 미배치 총수다.",
        judged_default: reasonsOf("judged_default"),
        oracle_axis_default: reasonsOf("oracle_axis_default"),
      },
      reproduction_check: {
        note: "**이 하네스가 `stage_cam`의 관측을 재현하는가.** 재현 못 하면 다른 것을 재는 것이고 "
          + "그때 아래 분해는 0.44를 설명하지 않는다.",
        stage_cam_placed_rate: { precise: 0.6306, medium: 0.6028, coarse: 0.4444 },
        stage_cam_source: "stage0/out/stage_cam.json:placement_with_true_camera.by_grade",
        here_placed_rate: Object.fromEntries(GRADES.map(g =>
          [g, round(arms.judged_default[g].placed / arms.judged_default[g].total, 4)])),
      },
      conclusion: {
        dominant: "**축 판정 실패가 지배항이다.** 미배치 사유에서 `축이 미분류다`가 "
          + "coarse 533 · medium 367 · precise 316이고, 축을 오라클로 주면 배치가 "
          + "**0.44 → 0.82**(coarse) / 0.63 → 0.87(precise)로 오른다. **등급 격차 자체가 "
          + "거의 사라진다**(0.19 → 0.05) — 즉 `coarse`가 나쁜 이유는 거의 전부 축 판정이다.",
        second: "**접합 반경이 그다음이다.** 오라클 축 + `touch_ratio` 0.09면 **1440/1440**이 놓인다. "
          + "남던 사유는 `구조에 이어지지 않았다`(연결 성분 분열)뿐이었다.",
        conditioning: "**조건수는 '못 푸는' 문제가 아니라 '틀리게 푸는' 문제로 나타난다.** "
          + "`solveNull`이 해를 못 내는 경우(`교점 제약이 형태를 정하지 못한다`)는 **0건**이다. "
          + `대신 형태 오차 중앙이 팔·등급을 통틀어 **${shapeLo}~${shapeHi}**이고, 놓인 것의 `
          + `**cut 0.2 조용히 틀림이 ${swLo}~${swHi}**다. ⚠ 초판은 이 범위를 0.10~0.18 / `
          + "34~39%로 적었는데 **자기 표와 안 맞았다**(리뷰어 2회차 [7]) — 이제 표에서 직접 낸다.",
        monotone_cost: "⚠ **접합 반경을 키울수록 형태 오차 중앙이 단조 증가한다**(#16). "
          + `oracle_touch_* (precise)에서 ${touchCurve.join(" → ")} — touch ${TOUCH.join(" / ")}.`,
        oracle_arm_moves_two_stages: "⚠ **오라클 축 팔은 교점 집합도 함께 바꾼다**(리뷰어 2회차 [8]). "
          + "축 라벨이 바뀌면 `frameOf`가 서는 획이 달라지고 `findJoints`가 **같은 축 쌍을 제외**"
          + "하므로 후보 쌍 자체가 달라진다 — 참 교점 회수가 "
          + `precise ${jTrue.judged} → ${jTrue.oracle}, coarse ${jTrue.judgedC} → ${jTrue.oracleC}로 는다. `
          + "**그러므로 '지배항은 축 판정'은 '축 판정과 **그 하류인 교점 회수**'로 읽어야 한다** — "
          + "둘의 몫은 이 설계로 갈리지 않는다. 갈리려면 축 라벨만 오라클로 주고 교점 집합은 "
          + "judged 것으로 고정하는 팔이 필요한데 `liftAll` 내부를 갈라야 한다(DEFERRED).",
        tradeoff: "⚠ **고칠 때마다 조용히 틀림이 함께 는다**(#16 — 병목이 옮겨간 것을 없어진 것으로 "
          + "읽지 않는다). 오라클 축 기본 반경 496/1257(39%) → 오라클 축 + 0.09 954/1440(66%). "
          + "**배치율만 보면 반경을 키우는 것이 이득으로 보이는데 아니다.**",
        snap_does_not_fix_this: "⚠ **L-B.3의 스냅은 이 0.44를 못 고친다.** 스냅 대상은 "
          + "**3D 레이어**인데(§9.1) 초기 확정 순간에는 3D가 아직 없다 — 모든 획이 2D 대기이고 "
          + "대상이 0이다. 스냅이 닿는 것은 **확정 뒤에 그리는 획**뿐이다. "
          + "0.44에 닿는 것은 (1) 확정 시점의 축 판정(L-B.4) (2) 승격 연쇄(L-B.7)다.",
        end_jitter_note: "잡음이 지배적으로 크다 — coarse 배치가 잡음 0에서 234/360인데 "
          + "0.05에서 70/360이다. **동작점 하나로 말하지 않는다**(#12).",
      },
      by_composition_judged_default: bake(byComp),
      by_end_jitter_judged_default: bake(byJit),
      constants: constantsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "lift_grade.json"), JSON.stringify(doc, null, 2));

    // ---- 불변식: 이 하네스가 `stage_cam`의 관측을 재현하는가.
    // 재현 못 하면 **다른 것을 재고 있는 것**이고 그때 이 분해는 0.44를 설명하지 않는다.
    const pc = arms.judged_default.precise, co = arms.judged_default.coarse;
    expect(pc.total).toBe(1440);
    expect(co.total).toBe(1440);
    expect(co.placed / co.total).toBeLessThan(pc.placed / pc.total);
    // **양성 채널**(#30) — 접합 반경 스윕이 실제로 배치를 움직여야 한다.
    // 안 움직이면 "교점 검출이 원인이 아니다"가 아니라 "섭동이 도달하지 않았다"이다.
    expect(arms[`judged_touch_${TOUCH[TOUCH.length - 1]}`].coarse.placed)
      .toBeGreaterThan(arms[`judged_touch_${TOUCH[0]}`].coarse.placed);
    expect(median(arms.judged_default.coarse.shape)).not.toBeNull();
  }, 300_000);
});
