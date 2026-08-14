// S-3 측정 — §4.4 떨림 평면 선택 / §4.5 미리보기↔확정 / AS-8 앵커 체인 오차 전파.
//
// 산출물: `stage0/out/wobble_plane.json`, `stage0/out/preview_gap.json`.
//
// **무엇을 재는가.** 참 3D 상자를 알려진 카메라로 투영하고 그 위에 잉크 노이즈를 얹은 뒤,
// 판정 → 앵커 체인 → 역투영을 그대로 통과시켜 **참 3D와 대조**한다. 정답이 3D에 있으므로
// 깊이 오차를 잴 수 있다(S-2의 상자는 2D 정답뿐이었다).
//
// **자기확인 차단**: 활 마루 skew = 0.12(치우친 조건)를 대표값으로 읽는다. 0.5(대칭)에서는
// 최소제곱 주축이 참 방향과 정확히 나란해져 판정이 공짜로 맞는다(D-S4, S-2에서 걸렸다).
// 두 조건을 함께 내고 **대표값은 치우친 쪽**이다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  newStroke, settle, resetStrokeIds, reprojectionGap, previewStroke, strokeLen2d,
  chordAxisAngle, WOBBLE_PLANES, wobblePlane, tiltedPlane, placeOnPlane,
  type PlaceCtx, type Stroke, type WobblePlane,
} from "../src/s3d/stroke.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { project, sub3, norm3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import {
  scene, groundPoint, boxEdges, drawEdges, rotateAbout, chordDeviation, stat, round, median,
  type Scene, type DrawnEdge,
} from "./scene3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const ROT_DEG = 60;                       // "돌려서 본다" — 이 각도에서 판단한다(§4.4)

interface Case {
  mode: WobblePlane;
  grade?: InkGrade;
  skew?: number;
  /** 끝점 겨냥 오차(그림 대각 대비 σ). **0으로 두면 AS-8이 자기확인이 된다** — scene3d 참조. */
  endJitter?: number;
  /** 참 축을 주고 배치만 잰다. 판정 실패와 배치 품질을 **분리**하기 위한 조건이다. */
  oracle?: boolean;
  /** 끝점끼리만 잇는다(몸통 접합 이전 상태) — "몸통 접합이 필수"의 대조군. */
  endpointOnly?: boolean;
  /**
   * **카메라 f를 틀리게 준다**(비율). 지금까지의 측정은 참 카메라를 줬는데, 실사용에서
   * 1점 f는 설정값이고 2점 주점은 가정이다(AS-9·D-S5, 이론서 16.4 깊이 아핀 자유도).
   * 깊이 오차의 지배항이 그쪽일 수 있으므로 흔들어 본다.
   */
  fBias?: number;
  n?: number;
  seed?: number;
}

/**
 * 끝점 겨냥 오차 스윕. **대표값을 하나 고르지 않는다** — 숙련자 끝점 오차를 잰 표본이
 * 없기 때문이다(AS-1). 대신 연쇄 길이별 기울기를 내고, 실획 상한을 함께 적어 둔다:
 * Quick,Draw 낙서의 `closure_gap` 중앙값이 그림 대각의 0.055~0.072이고 그것은 폐곡선
 * **한 바퀴**의 어긋남이므로 모서리 하나당으로는 대략 그 1/√2 = **0.04 언저리**다.
 * 스윕 상단이 그 값을 덮는다.
 */
const JITTERS = [0, 0.005, 0.01, 0.02, 0.04];
const JITTER_REF = 0.02;                  // 모드 비교를 다시 확인하는 조건(끝점이 흔들릴 때)

interface Row {
  axis_angle: number[]; wobble_ratio: number[]; rot_wobble_ratio: number[];
  corner_err: number[]; depth_err: number[]; join_ratio: number[]; identity_px: number[];
  depth_by_chain: Map<number, number[]>;
  ray_axis_deg: number[];
  n_strokes: number; n_placed: number; n_unclassified: number; n_wrong_axis: number;
  n_no_anchor: number; n_missed_pts: number;
  preview_gap_rot: number[];
}

const emptyRow = (): Row => ({
  axis_angle: [], wobble_ratio: [], rot_wobble_ratio: [], corner_err: [], depth_err: [],
  join_ratio: [], identity_px: [], depth_by_chain: new Map(), ray_axis_deg: [],
  n_strokes: 0, n_placed: 0, n_unclassified: 0, n_wrong_axis: 0, n_no_anchor: 0, n_missed_pts: 0,
  preview_gap_rot: [],
});

/** 배치가 쓰는 카메라. `fBias`가 있으면 **참 카메라와 다르다**(실사용의 f 불확실성). */
const ctxOf = (c: Case): PlaceCtx =>
  c.fBias ? { ...CTX, f: CTX.f * (1 + c.fBias) } : CTX;

/** 상자 하나를 그려 파이프라인을 통과시킨다. */
function oneBox(c: Case, r: () => number, row: Row): void {
  const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
  if (!O) return;
  const edges = boxEdges(SC, O, 0.8 + r() * 0.7, 0.8 + r() * 0.7, 0.6 + r() * 0.6);
  const drawn = drawEdges(SC, edges, c.grade ?? "medium", r, c.skew ?? 0.12, c.endJitter ?? 0);
  if (!drawn) return;
  // 화면 밖으로 크게 벗어난 구도는 버린다(그리는 사람이 그렇게 두지 않는다)
  const all = drawn.flatMap(d => d.pts2d);
  if (all.some(p => p[0] < -200 || p[0] > SC.imgSize[0] + 200
                 || p[1] < -200 || p[1] > SC.imgSize[1] + 200)) return;

  resetStrokeIds();
  const list: Stroke[] = drawn.map(d => {
    row.n_strokes += 1;
    if (c.oracle) return newStroke(d.pts2d, d.axis);
    const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize);
    if (v.axis === "free") row.n_unclassified += 1;
    else if (v.axis !== d.axis) row.n_wrong_axis += 1;
    return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  });
  const pctx = ctxOf(c);
  settle(list, pctx, { mode: c.mode, endpointOnly: c.endpointOnly });

  const byId = new Map(list.map(s => [s.id, s]));
  const depthOf = (s: Stroke): number => {
    let d = 0, cur = s;
    while (cur.anchorRef && byId.has(cur.anchorRef) && d < 20) { cur = byId.get(cur.anchorRef)!; d += 1; }
    return d;
  };
  const center: Vec3 = [
    (edges[0].a[0] + edges[11].b[0]) / 2, (edges[0].a[1] + edges[11].b[1]) / 2,
    (edges[0].a[2] + edges[11].b[2]) / 2];
  const diag3 = norm3(sub3(edges[11].b, edges[0].a));

  list.forEach((s, i) => {
    if (!s.pts3d.length) {
      if (s.axis !== "free") row.n_no_anchor += 1;
      return;
    }
    row.n_placed += 1;
    row.n_missed_pts += s.pts2d.length - s.pts3d.length;
    const e = drawn[i] as DrawnEdge;
    const trueDir = SC.axes[e.axis];

    row.axis_angle.push(chordAxisAngle(s.pts3d, trueDir));
    const zMid = s.pts3d[s.pts3d.length >> 1][2];
    const dev2d = chordDeviation(s.pts2d as unknown as number[][]);
    const expected = (dev2d * zMid) / SC.f;                       // 그린 만큼의 세계 진폭
    if (expected > 1e-9) row.wobble_ratio.push(chordDeviation(s.pts3d as unknown as number[][]) / expected);

    // 시선과 축이 이루는 각 — AS-8이 "작을수록 깊이 오차가 커진다"고 말한 항
    const view = s.pts3d[0];
    const cs = Math.abs((view[0] * trueDir[0] + view[1] * trueDir[1] + view[2] * trueDir[2])
      / norm3(view));
    row.ray_axis_deg.push((Math.acos(Math.min(1, cs)) * 180) / Math.PI);

    // 끝점 오차 · 깊이 오차 (앵커 체인 전파 = AS-8)
    const ends: [Vec3, Vec3] = [s.pts3d[0], s.pts3d[s.pts3d.length - 1]];
    const trueEnds: [Vec3, Vec3] = [e.a, e.b];
    for (let k = 0; k < 2; k++) {
      row.corner_err.push(norm3(sub3(ends[k], trueEnds[k])) / diag3);
      const de = Math.abs(ends[k][2] - trueEnds[k][2]) / trueEnds[k][2];
      row.depth_err.push(de);
      const ch = depthOf(s);
      if (!row.depth_by_chain.has(ch)) row.depth_by_chain.set(ch, []);
      row.depth_by_chain.get(ch)!.push(de);
    }

    // §4.5 — 접합 이동량과 항등 검사
    const len = strokeLen2d(s.pts2d);
    if (len > 1e-6) row.join_ratio.push(s.joinShift / len);
    const gaps = reprojectionGap(s.pts3d, s.pts2d, pctx);
    // 접합한 끝점은 일부러 옮긴 것이므로 항등 검사에서 뺀다(위 join_ratio가 그것을 잰다)
    row.identity_px.push(Math.max(...gaps.slice(1, -1)));

    // 돌려서 본다 — 화면 떨림이 길이 대비 얼마나 커지는가
    const rotPts = s.pts3d.map(p => project(rotateAbout(p, center, SC.axes[2], ROT_DEG), SC.principal, SC.f));
    if (rotPts.every(Boolean)) {
      const rp = rotPts as Pt2[];
      const l0 = Math.hypot(s.pts2d[s.pts2d.length - 1][0] - s.pts2d[0][0],
                            s.pts2d[s.pts2d.length - 1][1] - s.pts2d[0][1]);
      const l1 = Math.hypot(rp[rp.length - 1][0] - rp[0][0], rp[rp.length - 1][1] - rp[0][1]);
      const d0 = chordDeviation(s.pts2d as unknown as number[][]) / (l0 || 1);
      const d1 = chordDeviation(rp as unknown as number[][]) / (l1 || 1);
      if (d0 > 1e-9) row.rot_wobble_ratio.push(d1 / d0);

      // 미리보기(§4.5)와 확정의 차이 — **돌린 뒤에만 보인다**
      const prev = previewStroke(s.pts2d, s.pts3d[0], CTX);
      const pr = prev.map(p => project(rotateAbout(p, center, SC.axes[2], ROT_DEG), SC.principal, SC.f));
      if (pr.every(Boolean) && pr.length === rp.length) {
        const g = rp.map((p, k) => Math.hypot(p[0] - pr[k]![0], p[1] - pr[k]![1]));
        if (len > 1e-6) row.preview_gap_rot.push(median(g)! / len);
      }
    }
  });
}

/**
 * **떨림 평면 족을 연속으로 훑는다.** 리뷰어 지적: "`facing`이 떨림비에서 유리한 것은
 * 평면 정의의 귀결(동어반복) 아닌가". 족 전체에서 떨림비가 `facing`(0°)에서 극값이면
 * 그 지표는 채택 근거가 될 수 없다 — 정의가 시키는 값이기 때문이다.
 *
 * 앵커와 축을 **참값으로 고정**한다. 여기서 묻는 것은 평면 선택 하나뿐이므로
 * 체인·판정을 섞으면 답이 흐려진다.
 */
function planeFamilySweep(degs: number[], seed = 7100, n = 25) {
  const cond = { grade: "medium", skew: 0.12, end_jitter: 0.01, axis: "oracle", anchor: "true_corner", seed, n };
  const r = rng32(seed);
  const acc = new Map<number, { wob: number[]; corner: number[]; ang: number[]; depth: number[]; miss: number }>();
  degs.forEach(d => acc.set(d, { wob: [], corner: [], ang: [], depth: [], miss: 0 }));
  let sightDeg: number[] = [];
  for (let i = 0; i < n; i++) {
    const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
    if (!O) continue;
    const edges = boxEdges(SC, O, 0.8 + r() * 0.7, 0.8 + r() * 0.7, 0.6 + r() * 0.6);
    const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01);
    if (!drawn) continue;
    const diag3 = norm3(sub3(edges[11].b, edges[0].a));
    for (const e of drawn) {
      const dir = SC.axes[e.axis];
      // `sight`가 이 족의 몇 도에 해당하는지 — 두 법선의 각도로 잰다
      const nf = wobblePlane(e.a, dir, "facing").n, ns = wobblePlane(e.a, dir, "sight").n;
      sightDeg.push((Math.acos(Math.min(1, Math.abs(nf[0] * ns[0] + nf[1] * ns[1] + nf[2] * ns[2])))
        * 180) / Math.PI);
      const dev2d = chordDeviation(e.pts2d as unknown as number[][]);
      for (const d of degs) {
        const pts = placeOnPlane(e.pts2d, tiltedPlane(e.a, dir, d), CTX);
        const a = acc.get(d)!;
        if (!pts) { a.miss += 1; continue; }
        const zMid = pts[pts.length >> 1][2];
        const expected = (dev2d * zMid) / SC.f;
        if (expected > 1e-9) a.wob.push(chordDeviation(pts as unknown as number[][]) / expected);
        a.corner.push(norm3(sub3(pts[pts.length - 1], e.b)) / diag3);
        a.ang.push(chordAxisAngle(pts, dir));
        a.depth.push(Math.abs(pts[pts.length - 1][2] - e.b[2]) / e.b[2]);
      }
    }
  }
  return {
    condition: cond,
    sight_at_deg: stat(sightDeg, 1),
    by_deg: Object.fromEntries(degs.map(d => {
      const a = acc.get(d)!;
      return [`deg_${d}`, {
        wobble_ratio: stat(a.wob, 3), corner_err_ratio: stat(a.corner, 4),
        axis_angle_deg: stat(a.ang, 2), depth_err_ratio: stat(a.depth, 4), unplaceable: a.miss,
      }];
    })),
  };
}

function runCase(c: Case): Row {
  const r = rng32(c.seed ?? 4100);
  const row = emptyRow();
  for (let i = 0; i < (c.n ?? 60); i++) oneBox(c, r, row);
  return row;
}

const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

function summarize(row: Row) {
  const chain: Record<string, unknown> = {};
  [...row.depth_by_chain.keys()].sort((a, b) => a - b).forEach(k => {
    chain[`chain_${k}`] = stat(row.depth_by_chain.get(k)!, 4);
  });
  return {
    n_strokes: row.n_strokes,
    placed_rate: rate(row.n_placed, row.n_strokes),
    unclassified_rate: rate(row.n_unclassified, row.n_strokes),
    wrong_axis_rate: rate(row.n_wrong_axis, row.n_strokes),
    /** **판정된 획만** 분모로 한 오배정률. 전체 분모는 미분류가 많은 등급을 유리하게 만든다. */
    wrong_axis_of_classified: rate(row.n_wrong_axis, row.n_strokes - row.n_unclassified),
    no_anchor_rate: rate(row.n_no_anchor, row.n_strokes),
    dropped_points: row.n_missed_pts,
    axis_angle_deg: stat(row.axis_angle, 2),
    wobble_ratio: stat(row.wobble_ratio, 3),
    rot_wobble_ratio: stat(row.rot_wobble_ratio, 3),
    corner_err_ratio: stat(row.corner_err, 4),
    depth_err_ratio: stat(row.depth_err, 4),
    ray_axis_deg: stat(row.ray_axis_deg, 1),
    depth_err_by_chain: chain,
  };
}

describe("S-3 측정", () => {
  it("§4.4 떨림 평면 세 방식 + AS-8 앵커 체인 오차 전파", () => {
    const modes = WOBBLE_PLANES;
    const judged = Object.fromEntries(modes.map(m => [m, summarize(runCase({ mode: m }))]));
    const oracle = Object.fromEntries(modes.map(m =>
      [m, summarize(runCase({ mode: m, oracle: true }))]));
    const judged_jit = Object.fromEntries(modes.map(m =>
      [m, summarize(runCase({ mode: m, endJitter: JITTER_REF, seed: 4700 }))]));
    const by_grade = Object.fromEntries((["precise", "medium", "coarse"] as InkGrade[]).map((g, i) =>
      [g, summarize(runCase({ mode: "facing", grade: g, endJitter: JITTER_REF, seed: 5100 + i }))]));
    const by_skew = Object.fromEntries([0.5, 0.12].map(sk =>
      [`skew_${sk}`, summarize(runCase({ mode: "facing", skew: sk, endJitter: JITTER_REF, seed: 5300 }))]));
    // AS-8 — 끝점 겨냥 오차를 키우며 **연쇄 길이별** 깊이 오차를 본다
    const as8 = Object.fromEntries(JITTERS.map((j, i) =>
      [`jitter_${j}`, summarize(runCase({ mode: "facing", endJitter: j, oracle: true, seed: 5500 + i }))]));
    const as8_sight = Object.fromEntries(JITTERS.map((j, i) =>
      [`jitter_${j}`, summarize(runCase({ mode: "sight", endJitter: j, oracle: true, seed: 5500 + i }))]));
    // 몸통 접합 대조군 — 끝점끼리만 이었을 때(계획서 §4.2의 2번만)
    const endpoint_only = Object.fromEntries(JITTERS.map((j, i) =>
      [`jitter_${j}`, summarize(runCase({ mode: "facing", endJitter: j, oracle: true,
                                          endpointOnly: true, seed: 5500 + i }))]));
    // 카메라도 참값이었다 — f를 틀리게 주면 깊이가 어떻게 되는가(AS-9·이론서 16.4)
    const fBiasOf = (m: WobblePlane) => Object.fromEntries([-0.2, -0.1, 0, 0.1, 0.2].map((b, i) =>
      [`f_bias_${b}`, summarize(runCase({ mode: m, endJitter: 0.01, oracle: true,
                                         fBias: b, seed: 5900 + i }))]));
    const f_bias = Object.fromEntries(WOBBLE_PLANES.map(m => [m, fBiasOf(m)]));
    const family = planeFamilySweep([-80, -60, -40, -20, -10, 0, 10, 20, 40, 60, 80]);

    const report = {
      spec: "S-3 떨림 평면 선택(§4.4)과 앵커 체인 오차 전파(AS-8). 참 3D 상자 → 투영 → 잉크 노이즈 → 판정 → 배치 → 참 3D와 대조.",
      method: [
        "참 3D 직육면체를 지면에 세우고 알려진 카메라(요 35° 피치 15°, 3점)로 투영한다.",
        "**노이즈는 2D에만 얹는다** — 배치가 쓰는 수학으로 정답을 만들지 않는다.",
        "판정(S-2) → 앵커 체인(§4.2) → 역투영을 그대로 통과시킨다.",
        `돌려서 보는 각도는 수직축 둘레 ${ROT_DEG}°다 — §4.4의 판단 기준이 "회전 후 자연스러움"이므로.`,
      ],
      metrics: {
        axis_angle_deg: "배치된 획의 현이 **참 축 방향**과 이루는 각. 0이면 축을 제대로 따라간다.",
        wobble_ratio: "3D 떨림 진폭 ÷ 그린 떨림을 그 깊이의 세계 단위로 환산한 값. **1이면 그린 만큼**, 크면 깊이로 늘어난 것이다.",
        rot_wobble_ratio: `돌려 본 화면에서의 (떨림÷길이) ÷ 그린 화면에서의 (떨림÷길이). 1이면 어느 각도에서 봐도 같은 품질의 선으로 보인다.`,
        corner_err_ratio: "배치된 끝점과 참 모서리점의 거리 ÷ 상자 대각.",
        depth_err_ratio: "깊이 오차 ÷ 참 깊이. **연쇄 길이별로 나눈 것이 AS-8**이다.",
        ray_axis_deg: "시선과 축이 이루는 각. AS-8이 지목한 증폭 항(작을수록 깊이가 안 정해진다).",
        wrong_axis_rate: (
          "**`axis_judgement.json`의 `silent_wrong_rate`와 같은 정의**다 — 전체 획 중 "
          + "조용히 틀린 축에 배정된 비율. 값이 다른 것은 지표가 달라서가 아니라 조건이 달라서다"
          + "(여기는 끝점 겨냥 오차가 들어가고 카메라 구도도 다르다). 이름을 통일하지 않은 것은 "
          + "두 산출물을 각각 재현할 수 있게 두기 위해서다."
        ),
        condition_labels: (
          "모든 블록은 (판정/oracle, end_jitter, skew, grade, 접합 방식)의 조합이다. "
          + "`judged`=판정 통과·end_jitter 0 / `judged_end_jitter`=판정 통과·end_jitter 0.02 / "
          + "`oracle_axis`=참 축·end_jitter 0. **참 축 + end_jitter 0은 가장 유리한 조건이므로 "
          + "결론의 대표값으로 쓰지 않는다**(리뷰어 지적)."
        ),
      },
      caveat: (
        "**합성이다.** 숙련자가 실제로 어떻게 긋는지는 이 표본에 없다(V-o·AS-1). "
        + "여기서 재는 것은 '같은 노이즈 수준에서 배치 방식이 얼마나 다른가'이며, "
        + "대표 조건은 활 마루 skew=0.12(치우침)다 — 0.5(대칭)는 판정이 공짜로 맞는 특수 조건이다(D-S4)."
      ),
      camera: { vps: SC.vps, f: SC.f, principal: SC.principal, yaw_deg: 35, pitch_deg: 15 },
      single_composition_warning: (
        "**구도도 도형도 하나뿐이다** — 요 35°·피치 15°의 3점 카메라와 지면에 세운 직육면체. "
        + "크기와 위치만 무작위로 흔든다. 그러므로 여기 수치를 '구도가 바뀌면 이렇게 된다'의 "
        + "근거로 쓸 수 없다(2점·정면 근접·넓은 화각은 미측정). S-2의 bend_max와 같은 종류의 한계다."
      ),
      conditions: {
        judged: { axis: "judged", end_jitter: 0, grade: "medium", skew: 0.12, join: "body", seed: 4100 },
        judged_end_jitter: { axis: "judged", end_jitter: JITTER_REF, grade: "medium", skew: 0.12, join: "body", seed: 4700 },
        oracle_axis: { axis: "oracle", end_jitter: 0, grade: "medium", skew: 0.12, join: "body", seed: 4100 },
        by_grade: { axis: "judged", end_jitter: JITTER_REF, skew: 0.12, join: "body", seed_base: 5100 },
        by_skew: { axis: "judged", end_jitter: JITTER_REF, grade: "medium", join: "body", seed_base: 5300 },
        as8_jitter_sweep: { axis: "oracle", grade: "medium", skew: 0.12, join: "body", seed_base: 5500 },
        endpoint_only_control: { axis: "oracle", grade: "medium", skew: 0.12, join: "endpoint_only", seed_base: 5500 },
      },
      planes: {
        sight: "L과 광축을 함께 담는 평면(계획서 가). **눈을 지나는 평면이 아니다** — 그것은 화면에 직선 하나로 맺혀 배치가 불가능하다(반례 테스트).",
        screen: "앵커를 지나는 화면 평행 평면(계획서 나). L을 담지 못한다. 미리보기가 쓰는 평면이 바로 이것이다.",
        facing: "L을 담되 시선에 가장 정면으로 서는 평면(계획서에 없던 셋째).",
      },
      judged,
      oracle_axis: oracle,
      oracle_note: "판정을 건너뛰고 참 축을 준 조건. 판정 실패와 배치 품질이 섞이지 않도록 분리한다(리뷰어가 반복 지적한 유형).",
      judged_end_jitter: judged_jit,
      by_grade,
      by_skew,
      skew_note: "0.5(대칭 활)와 0.12(치우친 활)의 차이가 크면 그 수치는 노이즈 모델의 성질을 재고 있는 것이다(D-S4).",
      selfcheck_notes: {
        "screen.wobble_ratio = 1.000": (
          "**항등이다 — selfcheck가 잡았다.** `screen` 평면은 모든 점을 앵커와 같은 깊이에 놓고, "
          + "이 지표의 분모가 바로 '그 깊이에서의 화면 떨림'이다. 그래서 정의상 1이 나온다. "
          + "즉 wobble_ratio는 `screen`을 가르지 못하며, 그것을 가르는 것은 `axis_angle_deg`(중앙 34°)다. "
          + "지표 하나로 판정하지 않는 이유가 이것이다."
        ),
        "oracle_axis.*.unclassified_rate / wrong_axis_rate = 0": "정의상 0이다 — 참 축을 주는 조건이라 판정 자체가 없다.",
        "jitter_0 에서 placed_rate = 1, no_anchor_rate = 0": (
          "실측이다. 끝점 겨냥 오차가 0이면 두 획의 끝이 같은 화면 점이라 접합이 반드시 성립한다. "
          + "그 자체가 이 조건의 비현실성을 보여 주며, 스윕 상단(0.04)에서는 0.33까지 떨어진다."
        ),
        "f_bias_0.facing.axis_angle_deg.median = 1": (
          "**비율이 아니라 각도(도)다.** 1.00°가 소수 둘째 자리에서 딱 떨어진 것뿐이고 "
          + "같은 조건의 p90은 2.1°다. 규칙이 단위를 모르고 잡은 것 — 정상."
        ),
        "plane_family_sweep.deg_20.wobble_ratio.median = 1.000": (
          "**우연이 아니라 교차점이다.** 떨림비는 0°에서 0.938로 최소이고 기울일수록 커지므로 "
          + "어딘가에서 정확히 1을 지난다. 이 표본에서 그 지점이 +20° 근처였을 뿐이다."
        ),
      },
      as8_anchor_chain: {
        why: (
          "**끝점 겨냥 오차가 0이면 이 측정은 자기확인이다.** `renderInk`의 활은 sin(πu)라 양 끝에서 "
          + "정확히 0이고 고주파는 0.3px 수준이라, 끝점이 참 모서리에 못으로 박힌다. 그 조건에서 "
          + "'연쇄가 누적되지 않는다'가 나오는 것은 체인의 성질이 아니라 노이즈 모델의 성질이다."
        ),
        scale_note: (
          "**환산 모델을 하나로 못 박지 않는다**(리뷰어 지적으로 정정). Quick,Draw 낙서의 "
          + "closure_gap 중앙값은 그림 대각의 0.055~0.072인데, 이를 모서리 하나당으로 옮기는 계수는 "
          + "모델에 따라 다르다 — 독립인 두 끝점의 차로 보면 ÷√2 → 0.039~0.051, 사각형 한 바퀴 "
          + "누적으로 보면 ÷2 → 0.028~0.036. **더 중요한 것은 두 양이 애초에 다르다는 점이다**: "
          + "closure_gap은 *자기가 방금 그은 시작점*으로 돌아오는 오차이고, 여기 end_jitter는 "
          + "*다른 획이 만든 모서리*를 겨냥하는 오차다. 전자가 후자의 상한이라는 근거는 없다 — "
          + "오히려 하한일 수 있다. 그래서 0.03~0.05를 **자릿수 감각**으로만 쓰고, "
          + "**획 끝점 ↔ 다른 획 끝점 거리를 직접 재는 것**을 S-10 항목으로 올린다(DEFERRED)."
        ),
        jitter_sweep_facing: as8,
        jitter_sweep_sight: as8_sight,
        endpoint_only_control: {
          why: "계획서 §4.2의 2번(끝점끼리)만 쓴 조건. 3번(몸통 접합)이 필수라는 결론의 대조군이다.",
          by_jitter: endpoint_only,
        },
        f_bias_control: {
          why: (
            "**여기까지의 모든 측정은 참 카메라를 주고 잰 것이다.** 실사용에서 1점 f는 설정값이고 "
            + "2점 주점은 가정이며(AS-9·D-S5), 이론서 16.4는 단일 시점에 깊이 방향 아핀 자유도가 "
            + "남는다고 말한다. f를 ±10·20% 틀리게 주면 깊이 오차가 어떻게 되는지 잰다."
          ),
          condition: { grade: "medium", skew: 0.12, end_jitter: 0.01, axis: "oracle", seed_base: 5900 },
          by_mode_and_bias: f_bias,
        },
      },
      plane_family_sweep: {
        why: (
          "**`facing`이 떨림비에서 유리한 것이 평면 정의의 귀결(동어반복)인지** 확인한다. "
          + "L을 담는 평면 족을 각도 하나로 매개해 훑는다(0°가 `facing`). 떨림비가 0°에서 극값이면 "
          + "그 지표는 채택 근거가 될 수 없다 — 정의가 시키는 값이기 때문이다. "
          + "앵커와 축은 참값으로 고정한다(여기서 묻는 것은 평면 선택 하나뿐이다)."
        ),
        ...family,
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "wobble_plane.json"), JSON.stringify(report, null, 2), "utf-8");

    // 배치가 실제로 일어났는가 — 표본이 비면 위 수치는 아무것도 말하지 않는다
    expect(judged.facing.n_strokes).toBeGreaterThan(300);
    expect(judged.facing.placed_rate!).toBeGreaterThan(0.5);
  }, 300_000);

  it("§4.5 미리보기 ↔ 확정 — AS-3(유일한 중단 조건, D-S6)", () => {
    // **한 조건은 한 번만 돌린다.** 앞선 판(版)은 같은 조건을 두 번 돌려 상위 블록과 스윕 블록의
    // 수치가 미세하게 어긋났고, 보고 표가 두 실행을 한 줄에 섞었다(리뷰어 지적).
    const rows = Object.fromEntries(WOBBLE_PLANES.map(m =>
      [m, runCase({ mode: m, endJitter: JITTER_REF, seed: 6100 })]));
    // 접합 이동량은 **끝점이 어긋나야** 생긴다 — jitter 0에서 재면 0이 나오고 임계가 무의미해진다
    const jitterRows = JITTERS.map((j, i) => ({
      j, row: j === JITTER_REF ? rows.facing : runCase({ mode: "facing", endJitter: j, seed: 6300 + i }),
    }));
    const line = (row: Row) => ({
      join_shift_ratio: stat(row.join_ratio, 4),
      placed_rate: rate(row.n_placed, row.n_strokes),
      no_anchor_rate: rate(row.n_no_anchor, row.n_strokes),
      unclassified_rate: rate(row.n_unclassified, row.n_strokes),
      /** 축이 정해졌는데도 못 놓인 비율 — 미분류(S-2 영역)를 뺀 **배치의 실패율**이다. */
      unanchored_of_classified: rate(row.n_no_anchor, row.n_strokes - row.n_unclassified),
      n_placed: row.n_placed, n_strokes: row.n_strokes,
    });
    const byJitter = Object.fromEntries(jitterRows.map(({ j, row }) => [`jitter_${j}`, line(row)]));

    const chosen = rows.facing;
    const identity_px = stat(chosen.identity_px, 9);
    const join = stat(chosen.join_ratio, 4);
    const unanchoredRef = rate(chosen.n_no_anchor, chosen.n_strokes - chosen.n_unclassified)!;
    const report = {
      spec: "S-3 §4.5 미리보기 ↔ 확정. AS-3(유일한 중단 조건)의 임계는 D-S6에 **측정 전에** 박혀 있다.",
      threshold: {
        median: 0.05, p90: 0.15,
        basis: "획 길이(호 길이) 대비 화면 좌표차. 화면 대각이 아니다 — 대각 대비로 하면 짧은 획에서 한없이 관대해진다.",
        source: "DECISIONS D-S6",
      },
      finding_first: (
        "**D-S6이 지정한 양은 이 구현에서 항등이다.** 그리는 중이든 확정 뒤든 각 점은 "
        + "**자기 광선 위에** 놓이므로, 그린 카메라에서 다시 투영하면 어느 평면을 골라도 원본 "
        + "`pts2d`로 돌아온다. 즉 '재투영 화면 좌표차'는 0이고 임계는 원리적으로 발동할 수 없다 — "
        + "리뷰어가 지적한 '반증 불가' 유형이 임계를 숫자로 박은 뒤에도 남아 있었던 셈이다."
      ),
      falsifiable_instead: (
        "그래서 임계를 **실제로 화면을 움직이는 두 가지**에 건다(DECISIONS D-S7): "
        + "① 끝점 접합 이동량(§1.2가 허용하는 유일한 위치 개입) ② 그린 획이 3D에 못 놓이는 비율. "
        + "임계값 자체는 D-S6 그대로 두고 **적용 대상만 정정**한다."
      ),
      identity_check_px: identity_px,
      identity_note: "접합한 끝점을 뺀 모든 점의 화면 오차(px). 부동소수 잔차만 남는다 — **근거가 아니라 항등 확인**이다.",
      condition: {
        end_jitter: JITTER_REF,
        note: (
          "접합 이동량은 **끝점이 어긋나야** 생긴다. 합성 잉크는 끝점을 참 모서리에 못으로 박으므로"
          + "(sin(πu)가 양 끝에서 0) 끝점 겨냥 오차를 명시적으로 넣지 않으면 이 값이 0이 되고 임계가"
          + " 또다시 발동 불가가 된다. **대표 조건을 하나 고르지 않는다** — 아래 스윕 전체가 판정이고,"
          + " `identity_check_px`·`join_shift_ratio`만 end_jitter 0.02 행에서 뽑은 것이다."
        ),
      },
      join_shift_by_end_jitter: byJitter,
      join_shift_bound: (
        "접합은 **접합 반경 안에서만** 일어나므로 이동량은 구조적으로 join_ratio×화면대각"
        + `(=${(0.015 * Math.hypot(...SC.imgSize)).toFixed(1)}px)을 넘지 못한다.`
        + " 즉 이동량 임계는 실질적으로 '획 길이가 접합 반경의 몇 배인가'를 요구하고, 크게 어긋난 획은"
        + " 큰 이동량으로 잡히는 대신 **미배치로 새어 나간다**. 그래서 이동량만으로는 발동하기 어렵고,"
        + " 아래 `unanchored_threshold`가 나머지 절반을 맡는다."
      ),
      unanchored_threshold: {
        value: 0.20,
        applies_to: "unanchored_of_classified — 축이 정해졌는데도 못 놓인 비율",
        post_hoc: true,
        honesty_note: (
          "**이 값은 측정 후에 정했다. D-S6이 금지한 방식이며 그렇게 표시한다.** "
          + "사전에 정할 수 없었던 이유는, 원래 지정한 양이 항등이라 이 양이 존재한다는 것 자체를 "
          + "측정 전에 몰랐기 때문이다. 값 자체(20%)에는 측정 근거가 없다 — "
          + "'다섯 획 중 하나가 안 놓이면 도구로 못 쓴다'는 판단이다. "
          + "**S-10에서 실획으로 재정할 때까지 잠정이며, 지금 판정의 근거로 쓰지 않는다.** "
          + "지금 이 임계가 하는 일은 하나다: 발동 가능한 관측 조합이 존재함을 보이는 것 — "
          + "끝점 겨냥 오차 2%에서 실제로 넘는다(아래 표)."
        ),
        fires_at: jitterRows.filter(({ row }) =>
          (rate(row.n_no_anchor, row.n_strokes - row.n_unclassified) ?? 0) > 0.20)
          .map(({ j }) => `jitter_${j}`),
      },
      verdict: {
        join_shift_median_pass: (join.median ?? 1) <= 0.05,
        join_shift_p90_pass: (join.p90 ?? 1) <= 0.15,
        unanchored_at_ref: unanchoredRef,
        reading: (
          "**판정을 한 조건에서 읽지 않는다**(리뷰어 지적: 동작점을 측정 후에 고른 것이 된다). "
          + "끝점 겨냥 오차별로 읽으면 이렇다 — 1% 이하: 접합 이동 p90 0.05 이하이고 거의 다 놓인다. "
          + "2%: 이동량은 통과하나 축이 정해진 획의 1/4~1/3이 안 놓인다. "
          + "4%: 획의 80% 이상이 안 놓이고, **이동량은 오히려 좋아 보인다**(실패가 표본에서 빠지므로). "
          + "즉 **중단 조건은 도구가 아니라 입력에 걸린다**: 이 방식은 끝점 겨냥 오차가 그림 대각의 "
          + "1% 근처일 때 성립한다. 그 값이 숙련자에게 얼마인지는 **미측정**이다(AS-1) — S-10에서 잰다."
        ),
      },
      rotated_difference: {
        definition: (
          "확정 배치와 미리보기 배치를 **같은 각도로 돌려** 각각 투영한 뒤, 대응 점 사이 화면 거리의 "
          + `중앙값 ÷ 획 길이. 회전은 수직축 둘레 ${ROT_DEG}°다.`
        ),
        by_mode: Object.fromEntries(WOBBLE_PLANES.map(m => [m, stat(rows[m].preview_gap_rot, 4)])),
        note: (
          "미리보기 평면(=`screen`)과 확정 평면의 차이는 **돌린 뒤에야 보인다**. 이 값은 결함이 "
          + "아니라 '획이 깊이로 들어갔다'는 뜻이므로 중단 임계를 걸지 않는다 — 걸면 이 도구가 "
          + "하려는 일 자체를 금지하게 된다. `screen`이 0인 것은 미리보기 평면과 같은 평면이라 항등이다."
        ),
      },
      camera: { vps: SC.vps, f: SC.f, principal: SC.principal, yaw_deg: 35, pitch_deg: 15 },
      ink: { grade: "medium", skew: 0.12, rot_deg: ROT_DEG, mode: "facing", axis: "judged" },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "preview_gap.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(identity_px.max!).toBeLessThan(1e-6);
    // **중단 조건**(CLAUDE.md A-2). 넘으면 이 방식 전체의 전제가 무너진다.
    expect(join.median!).toBeLessThanOrEqual(0.05);
    expect(join.p90!).toBeLessThanOrEqual(0.15);
  }, 300_000);
});
