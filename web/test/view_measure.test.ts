// S-5 측정 — 회전 후 이어 그리기. 산출: `stage0/out/continue_after_rotate.json`.
//
// 재는 것 셋(지시):
//   1. 회전 후 그린 획이 **기존 기하와 접합되는 비율**
//   2. 회전 전후 카메라 전환에서 **기존 획의 화면 투영이 보존되는가**(§4.5 불변식의 회전 판)
//   3. **새 시점에서 축 판정이 여전히 성립하는가**(소실점이 화면 밖으로 나가는 경우 포함)
//
// 측정 설계: 첫 시점에서 상자의 앞쪽을 그려 3D로 올린 뒤, **시점을 돌려** 뒤쪽 모서리를
// 그 시점에서 그린다. 뒤쪽 모서리의 참 3D를 알고 있으므로 배치 결과와 대조할 수 있다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, reprojectionGap, strokeLen2d,
         RESOLVE_STATS, resetResolveStats, type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { viewPlaceCtx, toView, projectInView, fFromFov, type ViewPose } from "../src/s3d/viewCamera.js";
import { norm3, sub3, unit3, cross3, dot3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32, renderInk, gauss } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, stat, round, type Scene, type TrueEdge } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";
import type { Pt2 } from "../src/s3d/camera.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const AXES = SC.axes as unknown as Vec3[];
const CTX0: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const VIEW_FOV = 45;
const END_JITTER = 0.01;                       // S-3이 "성립 구간"으로 잰 값

/**
 * 세계의 **수직축 둘레로 `deg` 돌고 고각 `elevDeg`에서** `centre`를 보는 자세.
 *
 * 고각이 중요하다. **고각 0이면 시선이 지면과 나란해져 수직축이 화면평행이 된다** —
 * 그 축의 소실점이 **무한원**으로 나간다(2점 투시). 지시가 "소실점이 화면 밖으로 나가는
 * 경우 포함"을 명시했고, 고각을 안 넣으면 그 경우가 한 번도 안 나온다(실제로 안 나왔다).
 */
function orbit(centre: Vec3, deg: number, dist: number, elevDeg: number): ViewPose {
  const up = unit3(mul3(AXES[2], -1));            // 수직축은 아래를 향하므로 뒤집으면 위
  // 지면 안에서 `deg` 방향의 수평 벡터를 만든다
  let h0 = cross3(up, [0, 0, 1]);
  if (norm3(h0) < 1e-6) h0 = cross3(up, [1, 0, 0]);
  h0 = unit3(h0);
  const h1 = unit3(cross3(up, h0));
  const th = (deg * Math.PI) / 180;
  const horiz = unit3([h0[0] * Math.cos(th) + h1[0] * Math.sin(th),
                       h0[1] * Math.cos(th) + h1[1] * Math.sin(th),
                       h0[2] * Math.cos(th) + h1[2] * Math.sin(th)]);
  const el = (elevDeg * Math.PI) / 180;
  // 눈 위치: 중심에서 수평으로 물러나고 고각만큼 올라간다
  const off = unit3([horiz[0] * Math.cos(el) + up[0] * Math.sin(el),
                     horiz[1] * Math.cos(el) + up[1] * Math.sin(el),
                     horiz[2] * Math.cos(el) + up[2] * Math.sin(el)]);
  const C: Vec3 = [centre[0] + off[0] * dist, centre[1] + off[1] * dist, centre[2] + off[2] * dist];
  const fwd = unit3(sub3(centre, C));
  let right = cross3(up, fwd);
  if (norm3(right) < 1e-6) right = cross3([1, 0, 0], fwd);
  right = unit3(right);
  return { R: [right, unit3(cross3(fwd, right)), fwd], C };
}

/** 참 모서리를 **주어진 시점에서** 그린다(잉크 노이즈 + 끝점 겨냥 오차). */
function drawInView(
  pose: ViewPose | null, ctx: PlaceCtx, edges: TrueEdge[], r: () => number,
): { pts2d: Pt2[]; axis: 0 | 1 | 2 }[] | null {
  const proj: [Pt2, Pt2][] = [];
  for (const e of edges) {
    const a = pose ? projectInView(pose, e.a, ctx.principal, ctx.f)
                   : projectInView({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] }, e.a, ctx.principal, ctx.f);
    const b = pose ? projectInView(pose, e.b, ctx.principal, ctx.f)
                   : projectInView({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] }, e.b, ctx.principal, ctx.f);
    if (!a || !b) return null;
    proj.push([a, b]);
  }
  const xs = proj.flat().map(p => p[0]), ys = proj.flat().map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(diag > 1)) return null;
  return edges.map((e, i) => {
    const j = (p: Pt2): Pt2 => [p[0] + gauss(r) * END_JITTER * diag, p[1] + gauss(r) * END_JITTER * diag];
    return { pts2d: renderInk([j(proj[i][0]), j(proj[i][1])], "medium", r, diag, 0.12) as Pt2[],
             axis: e.axis };
  });
}

interface Acc {
  n_first: number; placed_first: number; free_first: number; wrong_first: number;
  n_second: number; placed_second: number; joined_second: number; free_second: number;
  wrong_second: number;
  corner_err: number[]; invariant_px: number[]; vp_offscreen: number[]; n_boxes: number;
  by_reason: Record<string, number>;
}
const empty = (): Acc => ({
  n_first: 0, placed_first: 0, free_first: 0, wrong_first: 0, n_second: 0, placed_second: 0, joined_second: 0,
  free_second: 0, wrong_second: 0, corner_err: [], invariant_px: [], vp_offscreen: [],
  n_boxes: 0, by_reason: {},
});

/** 첫 시점에서 앞쪽 8모서리, 돌린 뒤 뒤쪽 4모서리. */
function oneRound(deg: number, elev: number, seed: number, n: number, acc: Acc,
                  depthGuard = 0, farEndCheck = 0, depthEnvelope = 0) {
  const r = rng32(seed);
  for (let it = 0; it < n; it++) {
    const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
    if (!O) continue;
    const edges = boxEdges(SC, O, 0.8 + r() * 0.7, 0.8 + r() * 0.7, 0.6 + r() * 0.6);
    const first = edges.slice(0, 8), second = edges.slice(8);

    // --- 1단계: 첫 시점에서 그린다 ---
    const d1 = drawInView(null, CTX0, first, r);
    if (!d1) continue;
    const all = d1.flatMap(d => d.pts2d);
    if (all.some(p => p[0] < -200 || p[0] > SC.imgSize[0] + 200
                   || p[1] < -200 || p[1] > SC.imgSize[1] + 200)) continue;
    resetStrokeIds();
    const list: Stroke[] = d1.map(d => {
      const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
      if (v.axis === "free") acc.free_first += 1;
      else if (v.axis !== d.axis) acc.wrong_first += 1;
      return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
    });
    settle(list, CTX0, { mode: "facing" });
    const placedFirst = list.filter(s => s.pts3d.length);
    acc.n_first += list.length; acc.placed_first += placedFirst.length;
    if (placedFirst.length < 4) continue;               // 이어 그릴 기하가 없으면 의미가 없다
    acc.n_boxes += 1;

    // --- 2단계: 돌린다 ---
    const pts = placedFirst.flatMap(s => s.pts3d);
    const centre: Vec3 = [0, 1, 2].map(k => pts.reduce((a, p) => a + p[k], 0) / pts.length) as Vec3;
    const dist = Math.max(2.5, norm3(sub3(centre, [0, 0, 0])) * 0.9);
    const pose = orbit(centre, deg, dist, elev);
    const ctxV = viewPlaceCtx(pose, AXES, SC.imgSize, VIEW_FOV);
    acc.vp_offscreen.push(ctxV.vps.filter(v => v == null).length);

    // (2) **불변식(회전 판)** — 이미 놓인 획을 새 시점으로 투영한 것이,
    //     그 3D 점을 새 시점 좌표로 옮겨 투영한 것과 같은가.
    for (const s of placedFirst) {
      const inView = s.pts3d.map(p => toView(pose, p));
      const a = s.pts3d.map(p => projectInView(pose, p, ctxV.principal, ctxV.f));
      const gaps = reprojectionGap(inView, a.filter(Boolean) as Pt2[], ctxV);
      if (gaps.length) acc.invariant_px.push(Math.max(...gaps));
    }

    // --- 3단계: 새 시점에서 뒤쪽 모서리를 그린다 ---
    const d2 = drawInView(pose, ctxV, second, r);
    if (!d2) continue;
    const before = list.length;
    for (const d of d2) {
      const v = classifyStroke(d.pts2d, ctxV.vps, ctxV.imgSize, {},
                               { principal: ctxV.principal, f: ctxV.f });
      acc.n_second += 1;
      acc.by_reason[v.reason] = (acc.by_reason[v.reason] ?? 0) + 1;
      if (v.axis === "free") acc.free_second += 1;
      else if (v.axis !== d.axis) acc.wrong_second += 1;
      list.push(newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined));
    }

    // **새 시점의 좌표계로 배치한다.** 기존 획도 그 좌표계로 옮겨 놓아야 앵커가 맞는다.
    const moved = list.map((s, i) => {
      if (i >= before || !s.pts3d.length) return s;
      return { ...s, pts3d: s.pts3d.map(p => toView(pose, p)) };
    });
    // 기존 획의 화면 좌표도 새 시점 것으로 바꾼다(접합은 화면에서 판정한다)
    const movedCtx: Stroke[] = moved.map((s, i) => {
      if (i >= before) return s;
      const pj = s.pts3d.map(p => projectInView({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] },
                                                p, ctxV.principal, ctxV.f));
      return pj.every(Boolean) ? { ...s, pts2d: pj as Pt2[] } : { ...s, pts3d: [] };
    });
    settle(movedCtx, ctxV, { mode: "facing", depthGuard, farEndCheck, depthEnvelope });

    for (let i = before; i < movedCtx.length; i++) {
      const s = movedCtx[i];
      if (!s.pts3d.length) continue;
      acc.placed_second += 1;
      if (s.anchorRef) acc.joined_second += 1;
      // 참 모서리와 대조 — 새 시점 좌표로 옮긴 참값과 비교한다
      const e = second[i - before];
      const ta = toView(pose, e.a), tb = toView(pose, e.b);
      const diag3 = norm3(sub3(toView(pose, edges[11].b), toView(pose, edges[0].a)));
      acc.corner_err.push(norm3(sub3(s.pts3d[0], ta)) / diag3,
                          norm3(sub3(s.pts3d[s.pts3d.length - 1], tb)) / diag3);
    }
  }
}

const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

describe("S-5 측정", () => {
  it("회전 후 이어 그리기 — 접합·불변식·판정을 원장에 남긴다", () => {
    const byAngle: Record<string, unknown> = {};
    for (const [deg, elev] of [[20, 35], [45, 35], [75, 35], [110, 35],
                               [45, 0], [90, 0], [45, 70]] as [number, number][]) {
      const acc = empty();
      oneRound(deg, elev, 9500 + deg + elev * 7, 40, acc, 0);
      byAngle[`orbit_${deg}deg_elev_${elev}`] = {
        n_boxes: acc.n_boxes,
        first_view: {
          n: acc.n_first, placed_rate: rate(acc.placed_first, acc.n_first),
          unclassified_rate: rate(acc.free_first, acc.n_first),
          /** **비교 기준** — 새 시점의 판정이 첫 시점보다 나쁜지 보려면 같은 자로 재야 한다. */
          silent_wrong_rate: rate(acc.wrong_first, acc.n_first),
        },
        second_view: {
          n: acc.n_second,
          placed_rate: rate(acc.placed_second, acc.n_second),
          /** **기존 기하와 접합된 비율** — 지시 1. 앵커를 찾았다는 뜻이다. */
          joined_rate: rate(acc.joined_second, acc.n_second),
          unclassified_rate: rate(acc.free_second, acc.n_second),
          silent_wrong_rate: rate(acc.wrong_second, acc.n_second),
          by_reason: acc.by_reason,
        },
        corner_err_ratio: stat(acc.corner_err, 4),
        invariant_px: stat(acc.invariant_px, 9),
        vps_at_infinity: stat(acc.vp_offscreen, 2),
      };
    }

    // **깊이 가림 방어 스윕** — 화면에서 접합을 판정하므로 돌린 시점에서는 앞뒤 획이 겹친다.
    // 중앙값은 좋은데 p90이 상자 대각의 0.4~0.9까지 가는 꼬리가 있었다(중앙값만 보면 놓친다).
    const guardSweep: Record<string, unknown> = {};
    for (const g of [0, 0.05, 0.15, 0.3]) {
      const acc = empty();
      oneRound(75, 35, 9575, 40, acc, g, 0);
      guardSweep[`guard_${g}`] = {
        placed_rate: rate(acc.placed_second, acc.n_second),
        joined_rate: rate(acc.joined_second, acc.n_second),
        corner_err_ratio: stat(acc.corner_err, 4),
      };
    }

    // **S-6 근본 해법** — 획 자신의 축 제약으로 반대쪽 끝점을 검사한다.
    // 가드는 후보가 둘 이상일 때만 발동했다(완전 겹침에서 무력). 이것은 후보가 하나뿐이어도
    // **그 하나가 틀렸다는 것**을 안다 — 애매성이 아니라 정합성을 보기 때문이다.
    const farEndSweep: Record<string, unknown> = {};
    for (const [g, fe, de] of [[0, 0, 0], [0.05, 0, 0], [0, 1, 0], [0, 1.5, 0],
                               [0, 1, 0.5], [0, 1, 1.0]] as [number, number, number][]) {
      const perAngle: Record<string, unknown> = {};
      for (const [deg, elev] of [[45, 35], [75, 35], [110, 35]] as [number, number][]) {
        const acc = empty();
        resetResolveStats();
        oneRound(deg, elev, 9500 + deg + elev * 7, 40, acc, g, fe, de);
        perAngle[`orbit_${deg}deg_elev_${elev}`] = {
          placed_rate: rate(acc.placed_second, acc.n_second),
          joined_rate: rate(acc.joined_second, acc.n_second),
          corner_err_ratio: stat(acc.corner_err, 4),
          /** **왜 정합성 검사를 못 썼는가** — 추측하지 않으려고 센다. */
          resolve: { ...RESOLVE_STATS },
        };
      }
      farEndSweep[`guard_${g}_farEnd_${fe}_env_${de}`] = perAngle;
    }

    const report = {
      spec: "S-5 회전 후 이어 그리기. 첫 시점에서 앞쪽 8모서리를 그려 3D로 올린 뒤, 돌린 시점에서 뒤쪽 4모서리를 그린다.",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: (
        "계획서가 **이 도구의 핵심 기능**이라 적은 단계다. 돌린 뒤에는 카메라를 정확히 알므로 "
        + "소실점을 다시 찍을 필요가 없다 — **축 방향은 그대로이고 소실점만 다시 계산**된다."
      ),
      metrics: {
        joined_rate: "새 시점에서 그린 획이 **기존 기하에 접합된 비율**(앵커를 찾았다). 지시 1.",
        invariant_px: (
          "**회전 판 불변식**(§4.5의 회전 버전). 놓인 3D 점을 새 시점 좌표로 옮겨 투영한 것과 "
          + "자세 변환으로 직접 투영한 것의 화면 거리. **설계 보장이므로 0이어야 하고 임계를 걸지 않는다** — "
          + "0이 아니면 자세 변환이나 f 환산에 부호·규약 오류가 있다는 뜻이다(S-3에서 배운 것)."
        ),
        silent_wrong_rate: "새 시점에서 **조용히 틀린 축**에 배정된 비율. A-3이 금지하는 것.",
        vps_at_infinity: (
          "새 시점에서 **무한원이 된 소실점의 개수**(0~3). 돌리면 축이 화면과 나란해지는 각도가 "
          + "반드시 생긴다 — 그때 그 축은 `screen`이고 소실점을 지어내지 않는다."
        ),
      },
      condition: { grade: "medium", skew: 0.12, end_jitter: END_JITTER, mode: "facing",
                   view_fov_deg: VIEW_FOV, boxes_per_angle: 40, seed_base: 9500,
                   first_view_edges: 8, second_view_edges: 4 },
      camera: { first: { vps: SC.vps, f: SC.f, principal: SC.principal, yaw_deg: 35, pitch_deg: 15 } },
      caveat: (
        "**합성이다**(V-o·AS-1). 그리고 **구도가 하나뿐**이다 — S-3·S-2b와 같은 한계다. "
        + "여기서 재는 것은 '돌린 시점에서 파이프라인이 서는가'이지 '사람이 그렇게 그리는가'가 아니다."
      ),
      by_orbit_angle: byAngle,
      far_end_check: {
        why: (
          "**S-6 근본 해법** — 가드가 못 잡던 완전 겹침을 푼다. **축과 앵커가 정해지면 획 전체가 "
          + "정해지므로 반대쪽 끝점이 어디로 갈지 예측된다.** 앵커가 맞으면 그 예측이 반대쪽 끝의 "
          + "기존 기하와 만나고, 틀리면 엉뚱한 곳을 가리킨다. **후보가 하나뿐이어도 그 하나가 "
          + "틀렸다는 것을 알 수 있다** — 애매성이 아니라 **정합성**을 보기 때문이다. "
          + "양 끝에 후보가 있을 때만 쓴다(자유단이면 검사할 것이 없다). "
          + "값은 허용치 배수이며 1이 '그 깊이에서의 접합 반경'이다."
        ),
        by_setting: farEndSweep,
      },
      depth_guard_sweep: {
        why: (
          "**접합을 화면에서 판정하는 것의 대가**(S-5가 발견). 돌린 시점에서는 앞뒤 획이 화면에서 "
          + "겹치므로(가림) 화면 거리만으로는 어느 것에 붙일지 못 가른다 — 중앙값은 0.02~0.04로 "
          + "좋은데 **p90이 상자 대각의 0.4~0.9까지 간다**. 중앙값만 보면 놓친다. "
          + "방어는 '화면에서 비슷하게 가까운데 깊이가 크게 다른 후보가 또 있으면 **놓지 않는다**'이고, "
          + "**조용히 틀린 깊이보다 미배치가 낫다**는 A-3 그대로다. 값은 깊이 비율."
        ),
        condition: { orbit_deg: 75, elev_deg: 35, boxes: 40, seed: 9575 },
        by_guard: guardSweep,
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "continue_after_rotate.json"), JSON.stringify(report, null, 2), "utf-8");

    const a45 = byAngle["orbit_45deg_elev_35"] as { n_boxes: number; invariant_px: { max: number } };
    expect(a45.n_boxes).toBeGreaterThan(10);
    // **불변식은 보장이다** — 0이어야 한다(임계가 아니라 자물쇠)
    expect(a45.invariant_px.max).toBeLessThan(1e-6);
  }, 300_000);
});
