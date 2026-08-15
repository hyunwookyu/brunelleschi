// L-B.1 **단일 뷰포트** — 산출: `stage0/out/stage_cam.json`.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#5(자기참조 유형 3)** · #2·#3(자기확인·정의의 귀결) · #6(대조군) · #11(분모) ·
//   #12(동작점 하나) · #17(측정 경로와 앱 경로) · #21(dpr) · #25(원장) · #26(사전 등록)
//
// **#5가 이 항목의 전부다.** "3D가 잉크와 같은 픽셀에 그려진다"는 **측정이 아니라 설계 보장**이다.
//
// _초판은 `chord_dev`(옛 이름 `ink_gap`)를 "확정 순간 사용자가 실제로 보는 변화"라는 **실측**으로
// 적었다. 리뷰어가 뒤집었다 — 그것도 **정의의 귀결**이다. `liftAll`이 끝점을 자기 광선에
// 놓으므로 재투영된 세그먼트는 언제나 대표 직선이고, 그 편차를 정하는 것은 **잉크 모델
// (`INK_GRADES.lf_bow`)과 획 길이뿐**이다. 이 파일은 그 주장을 **대조군으로 증명한다** —
// 틀린 카메라를 넣어도 값이 안 움직이면 측정이 아니다(#5의 판별법)._
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { threeIntrinsics, applyIntrinsics, type CameraLike } from "../src/s3d/sceneCam.js";
import { liftAll, transitionGap, type LiftStroke } from "../src/s3d/lift.js";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { project, type Vec3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round, type Scene } from "./scene3d.js";
import { rng32, INK_GRADES, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

/**
 * **등록된 5구도 그대로**(`lift_gate`·`camera_gate`와 같은 집합). 초판은 3점 계열 다섯을
 * 임의로 골라 놓고 "5구도 전부"라고 적었는데, 하필 **`setViewOffset`과 무한원 소실점이 가장
 * 다르게 도는 2점·1점이 빠져 있었다**(리뷰어 [3]).
 */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const SZ: [number, number] = [960, 672];
const DIAG = Math.hypot(SZ[0], SZ[1]);
/** **등급을 하나만 쓰지 않는다**(#12). `chord_dev`는 `lf_bow`에 정비례하므로 3배 차가 난다. */
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
/** **등록 집합을 따른다**(`lift_gate`와 같은 시드·잡음). 시드 하나로 소수 넷째 자리를
 *  인용하던 것이 리뷰어 2회차 [3]·PITFALLS #14에 걸렸다. */
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; strokes: LiftStroke[] }

function fixture(ci: number, grade: InkGrade, seed: number, jit: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  return { sc, strokes: drawn.map((e, i) =>
    ({ id: `s${i}`, pts2d: e.pts2d as Pt2[], axis: "free" as Axis })) };
}

interface Ctx { principal: Pt2; f: number; vps: (Pt2 | null)[]; imgSize: [number, number] }

function classify(fx: Fx, ctx: Ctx): LiftStroke[] {
  return fx.strokes.map(s => ({
    ...s,
    axis: classifyStroke(s.pts2d, ctx.vps, SZ, {}, { principal: ctx.principal, f: ctx.f }).axis,
  }));
}

/**
 * **three가 실제로 만든 투영행렬**로 픽셀을 낸다. 초판은 `projectViaFrustum`(우리가 다시 쓴
 * 같은 산식)과 비교해 **정확히 0**이 나왔는데, 그것은 보장조차 아니고 **항등**이다(리뷰어 [10]).
 * 이제 `PerspectiveCamera` + `setViewOffset`이 만든 행렬을 통과하므로 부동소수 오차가 남는다.
 */
function pixelViaThree(cam: THREE.PerspectiveCamera, p: Vec3): Pt2 {
  // 씬은 `world` 그룹이 x축 180° 돌아 있다(`viewport.ts` 규약)
  const v = new THREE.Vector3(p[0], -p[1], -p[2]).project(cam);
  return [(SZ[0] * (v.x + 1)) / 2, (SZ[1] * (1 - v.y)) / 2];
}

describe("L-B.1 — 단일 뷰포트: 보장 둘과, 실측으로 오인했던 하나", () => {
  it("측정을 원장에 남긴다", () => {
    const byShot: Record<string, unknown> = {};
    let worstSeg = 0, worstThree = 0;
    const chordByGrade: Record<string, number[]> = { precise: [], medium: [], coarse: [] };
    /** #5의 판별법 — **틀린 카메라를 넣으면 그 지표가 움직이는가.** */
    const control: Record<string, unknown> = {};

    /** **참 카메라에서의 배치**. `chord_dev`의 분모이자 그 자체로 관측이다(리뷰어 2회차 [새]). */
    const placedByGrade: Record<string, { placed: number; total: number }> =
      { precise: { placed: 0, total: 0 }, medium: { placed: 0, total: 0 },
        coarse: { placed: 0, total: 0 } };

    for (const grade of GRADES) {
      for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
       const perShot = { placed: 0, total: 0, chord: [] as number[], seg: 0, three: 0 };
       for (const seed of SEEDS) for (const jit of JITTERS) {
        const C = COMPOSITIONS[ci];
        const fx = fixture(ci, grade, seed, jit);
        if (!fx) { byShot[`${C.name}/${grade}`] = { skipped: "투영 실패" }; continue; }
        const ctx: Ctx = { principal: fx.sc.principal, f: fx.sc.f, vps: trueVps(fx.sc), imgSize: SZ };
        const input = classify(fx, ctx);
        const res = liftAll(input, ctx);
        const gap = transitionGap(input, res.placed, ctx);

        const segMax = Math.max(0, ...gap.segGap);
        const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        applyIntrinsics(cam as unknown as CameraLike, threeIntrinsics(ctx.principal, ctx.f, SZ));
        cam.updateMatrixWorld(true);
        let threeMax = 0;
        for (const seg of res.placed.values()) {
          for (const p of [seg.a, seg.b] as Vec3[]) {
            const a = project(p, ctx.principal, ctx.f);
            if (!a) continue;
            const b = pixelViaThree(cam, p);
            threeMax = Math.max(threeMax, Math.hypot(a[0] - b[0], a[1] - b[1]));
          }
        }
        worstSeg = Math.max(worstSeg, segMax);
        worstThree = Math.max(worstThree, threeMax);
        chordByGrade[grade].push(...gap.inkGap);

        perShot.placed += res.placed.size;
        perShot.total += input.length;
        perShot.chord.push(...gap.inkGap);
        perShot.seg = Math.max(perShot.seg, segMax);
        perShot.three = Math.max(perShot.three, threeMax);
        placedByGrade[grade].placed += res.placed.size;
        placedByGrade[grade].total += input.length;

        // ---- 대조군: **틀린 카메라** — 값이 움직이면 측정, 안 움직이면 보장이다.
        // 대조군은 **한 동작점**(등급 medium · 시드 1 · 잡음 0.01)에서만 낸다. 그 사실을 적는다(#12).
        if (grade === "medium" && seed === 1 && jit === 0.01) {
          const row: Record<string, unknown> = {};
          // **양성 채널이 있어야 대조군이 대조군이다**(리뷰어 2회차 [1] / PITFALLS #6).
          // f 섭동이 계산에 닿았는지 보이는 양을 함께 낸다 — 3D 세그먼트 길이는 **깊이에 달렸고**
          // f를 바꾸면 깊이가 바뀐다. 이것이 안 움직이면 "지표가 독립"이 아니라
          // "섭동이 도달하지 않았다"이고 그때는 대조군이 아무것도 증명하지 않는다.
          const segLen = (m: Map<string, { a: Vec3; b: Vec3 }>): number[] =>
            [...m.values()].map(g => Math.hypot(g.a[0] - g.b[0], g.a[1] - g.b[1], g.a[2] - g.b[2]));
          for (const k of [0.8, 1.0, 1.2]) {
            const bad: Ctx = { ...ctx, f: ctx.f * k };
            const bi = classify(fx, bad);
            const br = liftAll(bi, bad);
            const bg = transitionGap(bi, br.placed, bad);
            row[`f_x${k}`] = { placed: br.placed.size,
                               chord_dev_median: stat(bg.inkGap).median,
                               seg_gap_max: round(Math.max(0, ...bg.segGap), 10),
                               positive_channel_seg3d_len_median: stat(segLen(br.placed)).median };
          }
          // **축 방향 섭동** — 지배항은 f가 아니라 축 방향이다(AS-L8). 소실점을 화면에서
          // 옮겨 축을 틀어 본다. f 섭동만 쓰면 이미 무효로 기록된 손잡이를 다시 잡는 것이다.
          for (const dpx of [12, 40]) {
            const moved = ctx.vps.map((v, i) => (v && i === 0 ? [v[0] + dpx, v[1]] as Pt2 : v));
            const bad: Ctx = { ...ctx, vps: moved };
            const bi = classify(fx, bad);
            const br = liftAll(bi, bad);
            const bg = transitionGap(bi, br.placed, bad);
            row[`vp0_shift_${dpx}px`] = { placed: br.placed.size,
                               chord_dev_median: stat(bg.inkGap).median,
                               positive_channel_seg3d_len_median: stat(segLen(br.placed)).median };
          }
          control[C.name] = row;
        }
       }
       const C = COMPOSITIONS[ci];
       byShot[`${C.name}/${grade}`] = {
         // **분모를 적는다**(#11) — `chord_dev`는 **놓인 획만** 들어간다
         placed_over_strokes: `${perShot.placed}/${perShot.total}`,
         placed_rate: round(perShot.placed / Math.max(1, perShot.total), 4),
         cells: `시드 ${SEEDS.length} × 잡음 ${JITTERS.length}`,
         guarantee_seg_gap_px_max: round(perShot.seg, 10),
         guarantee_three_vs_project_gap_px_raw: perShot.three,
         chord_dev_px: stat(perShot.chord),
       };
      }
    }

    const doc = {
      what: "L-B.1 — 2D 잉크와 3D 씬이 한 뷰포트에 겹칠 때 무엇이 보장이고 무엇이 측정인가",
      plan: "docs/line_plan.md §10.3 (단일 뷰포트) — 개정 2 번호",
      conditions: {
        compositions: COMPOSITIONS.map(c => c.name),
        composition_note: "`lift_gate`·`camera_gate`와 **같은 등록 집합**이다. 2점·1점을 포함한다 — "
          + "`setViewOffset`과 무한원 소실점이 가장 다르게 도는 자리이기 때문이다.",
        grades: GRADES, seeds: SEEDS, end_jitters: JITTERS, skew: 0.12,
        seed_note: "**등록 집합을 따른다**(`lift_gate`와 같은 시드·잡음). 초판은 시드 하나에서 "
          + "소수 넷째 자리를 인용했다(PITFALLS #14).",
        skew_note: "⚠ `skew: 0.12`는 `lift_gate`와 같지만 **잡음 축의 조합이 다르다** — "
          + "`placed_rate`를 `lift_gate`의 배치율과 나란히 읽지 않는다(#27).",
        canvas_px: SZ, canvas_diag_px: round(DIAG, 1),
        camera: "**참 카메라**(합성 장면의 값)를 그대로 준다 — 검출·사용자 조정은 여기서 재지 않는다",
        ink_bow_by_grade: Object.fromEntries(GRADES.map(g => [g, INK_GRADES[g].lf_bow])),
      },
      guarantees: {
        note: "**둘 다 측정이 아니다**(PITFALLS #5). 0(또는 부동소수 한계)이어야 하고, 그렇지 않으면 "
          + "부호·규약 오류다. 임계를 걸지 않는다 — 불변식 테스트(`test/scene_cam.test.ts`)가 잠근다.",
        seg_gap_px_max: round(worstSeg, 10),
        seg_gap_why: "`liftAll`이 각 3D 점을 자기 광선 위에 놓는다 — 되쏘면 그 화면 점이다.",
        three_vs_project_gap_px_raw: worstThree,
        three_vs_project_note: "**정확히 0이 아니다** — three의 행렬 파이프라인을 실제로 통과하므로 "
          + "부동소수 한계가 남는다. 0이면 행렬을 안 탄 것이고 그것은 보장이 아니라 항등이다.",
        three_why: "`THREE.PerspectiveCamera` + `setViewOffset`이 만든 **실제 투영행렬**을 통과시킨다. "
          + "초판은 우리가 다시 쓴 같은 산식과 비교해 **정확히 0**이었는데 그것은 보장이 아니라 항등이었다.",
      },
      placement_with_true_camera: {
        note: "**`chord_dev`의 분모이자 그 자체로 관측이다.** 참 카메라를 준 배치이므로 "
          + "카메라 정확도와 무관하고, **`coarse` 등급은 `lift_gate`·`camera_gate`가 한 번도 "
          + "안 잰 등급**이다. 등급이 나빠지면 배치가 무너진다.",
        by_grade: Object.fromEntries(GRADES.map(g => [g, {
          placed_over_strokes: `${placedByGrade[g].placed}/${placedByGrade[g].total}`,
          rate: round(placedByGrade[g].placed / Math.max(1, placedByGrade[g].total), 4),
        }])),
      },
      chord_dev: {
        note: "⚠ **이것도 측정이 아니다**(리뷰어가 뒤집었다). `seg_gap = 0`이므로 재투영된 세그먼트는 "
          + "언제나 대표 직선이고, 원본 획에서 그 현(弦)까지의 거리를 정하는 것은 **잉크 모델의 활**과 "
          + "**획의 화면 길이**뿐이다. `control_wrong_camera`가 그것을 보인다.",
        not_a_claim_about_users: "합성 잉크의 값이다. **실획 현실을 주장하지 않는다**(AS-C10). "
          + "\"사용자가 확정 순간에 보는 변화\"로 읽으면 안 된다.",
        name_note: "옛 이름은 `ink_gap`이었다. `lift_gate.json`에도 `ink_gap_px`가 있는데 "
          + "**그쪽은 장면당 대표값(n=장면 수)**이고 여기는 **점 단위(n=점 수)**다 — 집계 수준이 "
          + "다르므로 두 값을 비교하지 않는다. 이름을 갈랐다(리뷰어 [2]).",
        by_grade: Object.fromEntries(GRADES.map(g => [g, {
          px: stat(chordByGrade[g]),
          p90_over_canvas_diag: round((stat(chordByGrade[g]).p90 ?? 0) / DIAG, 5),
          lf_bow: INK_GRADES[g].lf_bow,
        }])),
      },
      control_wrong_camera: {
        method: "**f를 ±20% 틀리게 준다**(PITFALLS #5의 판별법). 값이 안 움직이면 측정이 아니다.",
        rows: control,
      },
      by_shot: byShot,
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "stage_cam.json"), JSON.stringify(doc, null, 2));

    // 보장은 불변식이므로 엄격하게 본다(임계가 아니라 규약 검사다)
    expect(worstSeg).toBeLessThan(1e-6);
    expect(worstThree).toBeLessThan(1e-6);
    // three를 실제로 통과하면 **정확히 0은 아니어야 한다** — 0이면 행렬을 안 탄 것이다
    expect(worstThree).toBeGreaterThan(0);
    // 등급이 3배 차이나면 `chord_dev`도 따라 움직여야 한다(잉크 모델의 성질이라는 근거)
    expect(stat(chordByGrade.coarse).median!).toBeGreaterThan(stat(chordByGrade.precise).median!);
  }, 120_000);
});
