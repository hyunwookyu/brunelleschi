// S-6 (3) **자유 곡선 폴백** — 산출: `stage0/out/free_curve.json`.
//
// §4.3의 셋째 경우: 어느 VP도 향하지 않고 축 평면 위도 아닌 획. 계획서는 "임시 평면(시선
// 수직)에 놓고 사용자가 나중에 조정"이라 적었다. **그 평면은 쓰지 않는다** —
// 시선 수직 평면은 앵커의 깊이를 그대로 복사하므로 획이 깊이로 전혀 안 들어가고(그것이
// §4.5 미리보기이자 **D-S8이 기각한 `screen`**이다), 무엇보다 **깊이가 임의**가 된다.
// 임의의 깊이를 놓는 것은 D-S16이 되돌리기를 기각한 이유보다도 나쁘다.
//
// **대신 양 끝 앵커가 평면을 정한다.** 두 앵커를 잇는 선을 담되 시선에 가장 정면으로 서는
// 평면 — `facing`(D-S8)을 축 대신 **앵커-앵커 방향**에 적용한 것이다. 새 가정이 아니다:
// 두 끝점의 3D 위치는 기존 기하가 이미 정했고 그 사이를 어느 평면으로 잇느냐만 남았으며,
// D-S8이 그 물음에 이미 답했다. 양 끝에 후보가 있을 때만 시도한다(A-3).
//
// **재는 것은 둘이다.**
//   (1) 축 평면 위의 곡선 — 면 경로가 이미 잡는다. 폴백이 그것을 **가로채면 안 된다**.
//   (2) 어느 축 평면에도 없는 공간 곡선 — 폴백만이 잡을 수 있다. **얼마나 맞는가.**
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, AXIS_TOL } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, placeOnSpan, placeOnPlane, tiltedPlane, PLACE_TOL,
         type PlaceCtx, type PlaceOpts, type Stroke } from "../src/s3d/stroke.js";
import { norm3, sub3, add3, mul3, unit3, cross3, project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32, gauss, INK_GRADES } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, drawEdges, stat, type Scene } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/**
 * **3D 곡선을 그려 넣는다.** 참 곡선을 3D에서 만들고 투영한 뒤 **2D에서만** 노이즈를 얹는다
 * (자기확인 차단 — 배치가 쓰는 수학으로 정답을 만들지 않는다).
 * 끝점 겨냥 오차는 `drawEdges`와 같은 뜻이다(그림 대각 대비 σ).
 */
function inkCurve(pts3: Vec3[], r: () => number, diag: number, endJitter: number): Pt2[] | null {
  const g = INK_GRADES.medium;
  const out: Pt2[] = [];
  for (const p of pts3) {
    const u = project(p, SC.principal, SC.f);
    if (!u) return null;
    out.push([u[0], u[1]]);
  }
  const j0: Pt2 = [gauss(r) * endJitter * diag, gauss(r) * endJitter * diag];
  const j1: Pt2 = [gauss(r) * endJitter * diag, gauss(r) * endJitter * diag];
  const n = out.length;
  return out.map((p, i) => {
    const u = i / (n - 1);
    // 끝점 겨냥 오차는 양 끝에서 각각 최대이고 가운데로 갈수록 섞인다
    const jx = j0[0] * (1 - u) + j1[0] * u, jy = j0[1] * (1 - u) + j1[1] * u;
    const hf = g.hf_sigma * 12;                        // 고주파(손떨림) — 획 길이와 무관한 px 규모
    return [p[0] + jx + gauss(r) * hf, p[1] + jy + gauss(r) * hf] as Pt2;
  });
}

/** 참 3D 곡선: A→B를 잇고 `dir` 쪽으로 `amp`만큼 부푼다(`sin(πu)`). */
function bowed(A: Vec3, B: Vec3, dir: Vec3, amp: number, n = 26): Vec3[] {
  const d = unit3(dir);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const base = add3(A, mul3(sub3(B, A), u));
    out.push(add3(base, mul3(d, amp * Math.sin(Math.PI * u))));
  }
  return out;
}

const ARMS: { key: string; opts: PlaceOpts; what: string }[] = [
  { key: "face_only", what: "면 경로만 — 지금 동작(폴백 없음)",
    opts: { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
            facePlanes: PLACE_TOL.face_far_end } },
  { key: "span", what: "면 경로 + 자유 곡선 폴백",
    opts: { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
            facePlanes: PLACE_TOL.face_far_end, freeSpan: 1 } },   // 채택 전 값으로 잰다
  // **검증의 적용 범위로 제한한다** — 면 경로의 검사는 끝점 둘을 보므로 곧은 획에서만
  // 획 전체를 덮는다. 굽은 획은 가운데가 검증되지 않는다.
  { key: "straight_only", what: "면 경로를 곧은 획으로 제한 — 굽은 획은 놓지 않는다",
    opts: { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
            facePlanes: PLACE_TOL.face_far_end, freeBendMax: AXIS_TOL.bend_max } },
  // **실제 후보 구성.** 면 경로는 곧은 획만, 굽은 획은 폴백이 받는다.
  // _리뷰어 2차 지적: 폴백의 성적을 면 경로가 켜진 상태에서만 재면 폴백이 보는 집단이
  // "면 경로가 거절한 것"으로 바뀐다. 제한을 켠 상태에서 다시 재야 한다._
  { key: "straight_plus_span", what: "면 경로는 곧은 획만 + 굽은 획은 폴백이 받는다",
    opts: { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
            facePlanes: PLACE_TOL.face_far_end, freeBendMax: AXIS_TOL.bend_max, freeSpan: 1 } },
];

/**
 * **평면 하나로 낼 수 있는 최선.** 참 양 끝점을 지나는 평면 다발을 각도로 훑어 최대 이탈을
 * 최소화한다. 이것이 **어떤 평면 선택 방법도 넘을 수 없는 바닥**이다 —
 * 폴백의 0.317이 이 바닥에 붙어 있으면 그 수치는 방법의 성적이 아니라 **픽스처의 성질**이다
 * (리뷰어 지적: 지표가 픽스처 정의를 되읽는지).
 */
function bestPlaneFloor(pts2d: Pt2[], A: Vec3, B: Vec3, truth: Vec3[], diag3: number): number | null {
  let best: number | null = null;
  for (let deg = 0; deg < 180; deg += 3) {
    const pl = tiltedPlane(A, sub3(B, A), deg);
    const got = placeOnPlane(pts2d, pl, CTX);
    if (!got) continue;
    const m = Math.min(got.length, truth.length);
    let mx = 0;
    for (let i = 0; i < m; i++) mx = Math.max(mx, norm3(sub3(got[i], truth[i])) / diag3);
    if (best == null || mx < best) best = mx;
  }
  return best;
}

interface Acc { n: number; placed: number; worst: number[]; maxDev: number[]; }
const acc = (): Acc => ({ n: 0, placed: 0, worst: [], maxDev: [] });
/**
 * **판정 단계에서 이미 축으로 간 획은 폴백의 대상이 아니다.** 첫 판에서 공간 곡선의 63%가
 * `축2`로 판정돼 축 경로로 갔고, 그 결과(오차 0.86)를 폴백의 성적으로 셀 뻔했다.
 * 그것은 §4.1의 문제이고 D-S16이 이미 기록한 병목이다 — **갈라 센다**(HANDOFF 경고 10).
 */
const summary = (a: Acc) => ({
  n: a.n, placed_rate: rate(a.placed, a.n),
  /** 양 끝 중 나쁜 쪽 — 상자 대각 대비. */
  worst_end_ratio: stat(a.worst, 4),
  /** **곡선 전체의 최대 3D 이탈** — 끝점만 맞고 가운데가 틀어지는 것을 잡는다. */
  max_dev_ratio: stat(a.maxDev, 4),
  over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
    [`over_${c}`, a.maxDev.filter(v => v > c).length])),
});

describe("S-6 (3) 자유 곡선 폴백", () => {
  it("반례: 한쪽 끝이 자유단이면 **놓지 않는다** — 평면이 안 정해지고 깊이가 임의가 된다", () => {
    const pts: Pt2[] = [[300, 300], [340, 330], [420, 380]];
    expect(placeOnSpan([], pts, CTX, 20)).toBeNull();
  });

  it("면 위 곡선과 공간 곡선을 갈라 재고 원장에 남긴다", () => {
    const r = rng32(5150);
    const res: Record<string, { onFace: Acc; inSpace: Acc; onFaceAxis: Acc; inSpaceAxis: Acc;
                                straight: Acc; straightAxis: Acc }> = {};
    /** 평면 하나로 낼 수 있는 최선(픽스처의 바닥). 픽스처별로 모은다. */
    const floors: Record<string, number[]> = { straight_diagonal: [], on_face: [], in_space: [] };
    /**
     * **팔 사이 per-stroke 대조** — "폴백이 놓은 획"을 뺄셈이 아니라 **직접** 가른다.
     * S-6 (2b)에서 총계의 차를 집합으로 쓴 것이 틀렸던 그 자리다.
     */
    const spanOnly: Record<string, number[]> = { straight_diagonal: [], on_face: [], in_space: [] };
    const bothArms: Record<string, number[]> = { straight_diagonal: [], on_face: [], in_space: [] };
    let nonNested = 0;
    for (const a of ARMS) res[a.key] = { onFace: acc(), inSpace: acc(), onFaceAxis: acc(),
                                         inSpaceAxis: acc(), straight: acc(), straightAxis: acc() };
    const verdicts: Record<string, number> = {};

    for (let it = 0; it < 100; it++) {
      const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
      if (!O) continue;
      const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
      const edges = boxEdges(SC, O, a, b, c);
      const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01);
      if (!drawn) continue;
      const [e0, e1, e2] = SC.axes;
      const A0 = add3(O, mul3(e0, a)), B0 = add3(O, mul3(e1, b));
      const AB = add3(A0, mul3(e1, b)), ABu = sub3(AB, mul3(e2, c));
      const diag3 = norm3(sub3(edges[11].b, edges[0].a));
      const imgDiag = Math.hypot(...SC.imgSize);

      // (1) **바닥면 위의 곡선** — 축0×축1 평면 안에서 부푼다. 면 경로가 잡아야 한다.
      const nOnFace = unit3(cross3(e0, e1));
      const inPlaneDir = unit3(sub3(add3(mul3(e0, 1), mul3(e1, -1)),
                                    mul3(nOnFace, 0)));   // 면 안의 방향
      const curveFace = bowed(O, AB, inPlaneDir, 0.22 * a);
      // (2) **기운 평면 위의 곡선** — 현은 바닥면 대각선(그래서 대개 미분류로 남는다)이고
      // 부푸는 방향은 **면 안과 면 밖의 중간**이다. 즉 참 평면이 **어느 축 평면도 아니다**.
      // _첫 판은 공간 대각선(O→ABu)을 썼는데 63%가 `축2`로 판정돼 폴백에 닿지도 않았다._
      const inFace = unit3(sub3(mul3(e0, 1), mul3(e1, 1)));
      const off = unit3(add3(inFace, mul3(unit3(nOnFace), -1)));   // 면 안 45° + 면 밖 45°
      const curveSpace = bowed(O, AB, off, 0.25 * a);
      // (3) **곧은 면 대각선** — S-6 (2)가 잰 것과 같은 획. **제한이 이것을 건드리면 안 된다.**
      const curveStraight = bowed(O, AB, e0, 0);

      const inkFace = inkCurve(curveFace, r, imgDiag, 0.01);
      const inkSpace = inkCurve(curveSpace, r, imgDiag, 0.01);
      const inkStraight = inkCurve(curveStraight, r, imgDiag, 0.01);
      if (!inkFace || !inkSpace || !inkStraight) continue;

      const perArm: Record<string, { placed: boolean; dev: number }[]> = {};
      for (const arm of ARMS) {
        const R = res[arm.key];
        const oc: { placed: boolean; dev: number }[] = [];
        perArm[arm.key] = oc;
        resetStrokeIds();
        const list: Stroke[] = drawn.map(d => {
          const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                                   { principal: SC.principal, f: SC.f });
          return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
        });
        settle(list, CTX, arm.opts);
        const before = list.length;
        const freeFlag: boolean[] = [];
        [inkFace, inkSpace, inkStraight].forEach((ink, k) => {
          const v = classifyStroke(ink, SC.vps, SC.imgSize, {},
                                   { principal: SC.principal, f: SC.f });
          freeFlag.push(v.axis === "free");
          if (arm.key === ARMS[0].key) {
            const key = `${["on_face", "in_space", "straight"][k]}:${v.axis === "free" ? v.reason : `axis${v.axis}`}`;
            verdicts[key] = (verdicts[key] ?? 0) + 1;
          }
          list.push(newStroke(ink, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined));
        });
        settle(list, CTX, arm.opts);

        [curveFace, curveSpace, curveStraight].forEach((truth, k) => {
          const s = list[before + k];
          // **판정으로 먼저 가른다** — 축으로 배정된 획은 폴백 경로에 오지 않는다.
          const wasFree = freeFlag[k];
          const B = k === 0 ? (wasFree ? R.onFace : R.onFaceAxis)
                  : k === 1 ? (wasFree ? R.inSpace : R.inSpaceAxis)
                            : (wasFree ? R.straight : R.straightAxis);
          B.n += 1;
          if (!s.pts3d.length) { oc.push({ placed: false, dev: NaN }); return; }
          B.placed += 1;
          const m = Math.min(s.pts3d.length, truth.length);
          let mx = 0;
          for (let i = 0; i < m; i++) mx = Math.max(mx, norm3(sub3(s.pts3d[i], truth[i])) / diag3);
          B.maxDev.push(mx);
          B.worst.push(Math.max(norm3(sub3(s.pts3d[0], truth[0])) / diag3,
                                norm3(sub3(s.pts3d[m - 1], truth[m - 1])) / diag3));
          oc.push({ placed: true, dev: mx });
        });
        if (arm.key === ARMS[0].key) {
          const names = ["on_face", "in_space", "straight_diagonal"];
          [curveFace, curveSpace, curveStraight].forEach((truth, k) => {
            const fl = bestPlaneFloor([inkFace, inkSpace, inkStraight][k],
                                      truth[0], truth[truth.length - 1], truth, diag3);
            if (fl != null) floors[names[k]].push(fl);
          });
        }
      }
      // **폴백이 놓은 획을 직접 가른다** — 면 경로가 놓은 것과 섞으면 둘 다 안 보인다.
      const names = ["on_face", "in_space", "straight_diagonal"];
      const fo = perArm.face_only, sp = perArm.span;
      for (let k = 0; k < names.length; k++) {
        if (!fo?.[k] || !sp?.[k]) continue;
        if (fo[k].placed && !sp[k].placed) nonNested += 1;     // 포함관계가 아니면 여기 잡힌다
        if (!fo[k].placed && sp[k].placed) spanOnly[names[k]].push(sp[k].dev);
        else if (fo[k].placed && sp[k].placed) bothArms[names[k]].push(fo[k].dev);
      }
    }

    const report = {
      spec: "S-6 (3) 자유 곡선 폴백. **양 끝 앵커가 평면을 정한다** — 임의 깊이를 놓지 않는다.",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      approach: (
        "계획서의 '임시 평면(시선 수직)'은 **쓰지 않는다** — 앵커의 깊이를 복사하므로 획이 "
        + "깊이로 안 들어가고(D-S8이 기각한 `screen`) 깊이가 임의가 된다. 대신 **두 앵커를 잇는 "
        + "선을 담되 시선에 가장 정면인 평면**(`facing`을 앵커-앵커 방향에 적용)을 쓴다. "
        + "새 가정이 아니다 — 두 끝점의 3D 위치는 기존 기하가 정했고 그 사이를 어느 평면으로 "
        + "잇느냐만 남았으며 D-S8이 그 물음에 이미 답했다. **양 끝에 후보가 있을 때만**(A-3)."
      ),
      fixtures: {
        on_face: "바닥면(축0×축1) 안에서 부푼 곡선. **면 경로가 이미 잡는다** — 폴백이 가로채면 안 된다.",
        straight_diagonal: ("부풀지 않은 곧은 면 대각선 — S-6 (2)가 잰 것과 같은 획. "
                            + "**제한이 이것을 건드리면 안 된다**는 대조군이다."),
        in_space: ("현은 바닥면 대각선이고 부푸는 방향이 **면 안 45° + 면 밖 45°**다 — "
                   + "참 평면이 어느 축 평면도 아니다. _첫 판은 공간 대각선을 썼는데 63%가 "
                   + "`축2`로 판정돼 폴백에 닿지도 않았다. 그것은 §4.1의 문제(D-S16)이지 "
                   + "폴백의 성적이 아니다 — 갈라 센다._"),
      },
      split_note: (
        "**판정이 축으로 부른 획은 폴백의 대상이 아니다.** `*_axis_assigned` 블록이 그 몫이고, "
        + "그 오차는 §4.1의 병목(D-S16)이지 이 경로의 성적이 아니다."
      ),
      verdicts: verdicts,
      bend_note: (
        "**면 경로의 검사는 끝점 둘을 본다.** 곧은 획이면 끝점 둘 + 평면이 획을 유일하게 "
        + "결정하므로 검사가 획 전체를 덮지만, **굽은 획은 가운데가 검증되지 않는다** — "
        + "가운데가 어디로 가든 끝점은 같다. `straight_only` 팔이 그 적용 범위로 제한한 것이고, "
        + "S-6 (2)가 잰 **곧은** 사선은 이 제한에 거의 걸리지 않는다 — 이 원장의 `straight_diagonal`이 그 대조군이고, 제한을 켜도 배치율이 0.586 → 0.529다"
        + "(잉크의 활 때문에 몇 획이 임계를 넘는다). `face_diagonal.json`의 0.842와 직접 비교하지 않는다 — 잉크 모델과 획 구성이 다르다."
      ),
      metrics: {
        max_dev_ratio: "**곡선 전체의 최대 3D 이탈** ÷ 상자 대각. 끝점만 맞고 가운데가 틀어지는 것을 잡는다.",
        worst_end_ratio: "양 끝 중 나쁜 쪽 ÷ 상자 대각.",
      },
      condition: { grade: "medium", skew: 0.12, end_jitter: 0.01, boxes: 60, seed: 5150,
                   camera: { yaw_deg: 35, pitch_deg: 15, f: SC.f, img_size: SC.imgSize },
                   single_composition_warning: "구도가 하나뿐이다(직육면체, 요 35°·피치 15° 3점)." },
      /**
       * **평면 하나로 낼 수 있는 최선**(픽스처의 바닥). 참 끝점을 지나는 평면 다발을 3°씩
       * 훑어 최대 이탈을 최소화한 값이다. 측정값이 이 바닥에 붙어 있으면 그것은 방법의
       * 성적이 아니라 **픽스처가 정한 하한**이다.
       */
      best_plane_floor: Object.fromEntries(Object.entries(floors).map(([k, v]) => [k, stat(v, 4)])),
      /**
       * **폴백이 놓은 획만** 따로 센 것(뺄셈이 아니라 per-stroke 대조).
       * `non_nested`가 0이 아니면 두 팔의 배치 집합이 포함관계가 아니라는 뜻이다.
       */
      span_added: {
        non_nested: nonNested,
        only_span: Object.fromEntries(Object.entries(spanOnly).map(([k, v]) =>
          [k, { n: v.length, max_dev_ratio: stat(v, 4),
                over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
                  [`over_${c}`, v.filter(x => x > c).length])) }])),
        both_arms: Object.fromEntries(Object.entries(bothArms).map(([k, v]) =>
          [k, { n: v.length, max_dev_ratio: stat(v, 4),
                over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
                  [`over_${c}`, v.filter(x => x > c).length])) }])),
      },
      arms: Object.fromEntries(ARMS.map(a => [a.key, {
        what: a.what,
        // **팔을 가르는 설정을 전부 적는다** — 원장만 보고 어느 판인지 가릴 수 있어야 한다
        // (DEFERRED S-5의 같은 항목이 재발했다는 리뷰어 지적).
        opts: { facePlanes: a.opts.facePlanes ?? 0, freeSpan: a.opts.freeSpan ?? 0,
                freeBendMax: a.opts.freeBendMax ?? 0, farEndCheck: a.opts.farEndCheck ?? 0 },
        on_face: summary(res[a.key].onFace),
        in_space: summary(res[a.key].inSpace),
        /** **곧은 면 대각선 대조군.** 제한(`straight_only`)이 이것을 건드리면 안 된다. */
        straight_diagonal: summary(res[a.key].straight),
        on_face_axis_assigned: summary(res[a.key].onFaceAxis),
        in_space_axis_assigned: summary(res[a.key].inSpaceAxis),
        straight_axis_assigned: summary(res[a.key].straightAxis),
      }])),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "free_curve.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(res.span.inSpace.n).toBeGreaterThan(30);
  }, 300_000);
});
