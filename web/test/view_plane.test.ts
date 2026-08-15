// S-7 (0) **돌린 시점의 평면 경로** — 산출: `stage0/out/view_plane.json`.
//
// 배선 점검에서 나온 물음이다. §4.3의 평면 경로(면 위 사선 · 자유 곡선 폴백)가 **첫 시점에만**
// 켜져 있었다 — 돌린 뒤에 그은 면 위 사선은 놓이지 않는다. **같은 획이 어느 시점에서
// 그었느냐로 놓이고 안 놓이고가 갈리는 것**은 사용자가 이해할 수 없는 동작이다.
//
// 그렇다고 측정 없이 켜지 않는다(DEFERRED S-6 3). 돌린 시점은 **가림**이 있고 자유단 비율이
// 높아 첫 시점과 조건이 다르다 — 면 경로가 거기서도 서는지는 별개의 물음이다.
//
// 재는 것: 상자를 첫 시점에서 세우고 **돌린 뒤 그 면의 대각선을 긋는다.**
//   `now`     지금 동작(정합성 + 깊이 타당성만) — 사선이 안 놓인다
//   `planes`  거기에 면 경로·폴백·굽음 제한을 더한다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, AXIS_TOL } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, PLACE_TOL,
         type PlaceCtx, type PlaceOpts, type Stroke } from "../src/s3d/stroke.js";
import { VIEW_OPTS } from "../src/s3d/appPlace.js";
import { norm3, sub3, add3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32, gauss, renderInk } from "../src/s3d/synthInk.js";
import { viewPlaceCtx, toView, projectInView, type ViewPose } from "../src/s3d/viewCamera.js";
import { scene, groundPoint, boxEdges, faceDiagonals, stat, type Scene, type TrueEdge } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX0: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const AXES = SC.axes as unknown as Vec3[];
const VIEW_FOV = 45;
const END_JITTER = 0.01;
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/** 중심을 도는 카메라. `view_measure`와 같은 궤도식이다. */
function orbit(centre: Vec3, deg: number, dist: number, elevDeg: number): ViewPose {
  const t = (deg * Math.PI) / 180, e = (elevDeg * Math.PI) / 180;
  const dir: Vec3 = [Math.sin(t) * Math.cos(e), -Math.sin(e), Math.cos(t) * Math.cos(e)];
  const C: Vec3 = sub3(centre, mul3(dir, dist));
  const f: Vec3 = dir;
  const upW: Vec3 = [0, 1, 0];
  const rx = norm3([f[1] * upW[2] - f[2] * upW[1], f[2] * upW[0] - f[0] * upW[2],
                    f[0] * upW[1] - f[1] * upW[0]]);
  const right: Vec3 = rx < 1e-9 ? [1, 0, 0]
    : [(f[1] * upW[2] - f[2] * upW[1]) / rx, (f[2] * upW[0] - f[0] * upW[2]) / rx,
       (f[0] * upW[1] - f[1] * upW[0]) / rx];
  const down: Vec3 = [f[1] * right[2] - f[2] * right[1], f[2] * right[0] - f[0] * right[2],
                      f[0] * right[1] - f[1] * right[0]];
  return { R: [right, down, f], C };
}

/** 참 모서리를 그 시점에 투영하고 잉크를 얹는다. 노이즈는 2D에만 있다. */
function drawInView(pose: ViewPose | null, ctx: PlaceCtx, edges: { a: Vec3; b: Vec3 }[],
                    r: () => number): Pt2[][] | null {
  const I: ViewPose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] };
  const proj: [Pt2, Pt2][] = [];
  for (const e of edges) {
    const a = projectInView(pose ?? I, e.a, ctx.principal, ctx.f);
    const b = projectInView(pose ?? I, e.b, ctx.principal, ctx.f);
    if (!a || !b) return null;
    proj.push([a, b]);
  }
  const xs = proj.flat().map(p => p[0]), ys = proj.flat().map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(diag > 1)) return null;
  return edges.map((_, i) => {
    const j = (p: Pt2): Pt2 => [p[0] + gauss(r) * END_JITTER * diag, p[1] + gauss(r) * END_JITTER * diag];
    return renderInk([j(proj[i][0]), j(proj[i][1])], "medium", r, diag, 0.12) as Pt2[];
  });
}

/** 지금 동작 — 평면 경로가 없다. */
const NOW: PlaceOpts = { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
                         depthEnvelope: PLACE_TOL.view_depth_envelope };
const ARMS: { key: string; opts: PlaceOpts; what: string }[] = [
  { key: "now", opts: NOW, what: "감사 이전 동작 — 정합성 + 깊이 타당성만. 면 경로 없음" },
  // **측정이 막은 후보**를 원장에 남긴다. 이 팔을 지우면 왜 안 켰는지가 원장에서 사라진다.
  { key: "planes", what: "첫 시점과 같은 평면 경로를 돌린 시점에도 켠 경우(**후보**)",
    opts: { ...NOW, facePlanes: PLACE_TOL.face_far_end, freeBendMax: AXIS_TOL.bend_max,
            freeSpan: PLACE_TOL.span_far_end } },
  // 출하 구성 — `now`와 같아야 한다(평면 경로를 안 켠다). 다르면 배선이 어긋난 것이다.
  { key: "app", opts: VIEW_OPTS, what: "**출하 구성** `VIEW_OPTS`" },
];

const ANGLES = [45, 75, 110];
const SEEDS = [9500, 1301, 5501];

describe("S-7 (0) 돌린 시점의 평면 경로", () => {
  it("돌린 시점에서 그은 면 대각선이 놓이는지 재고 원장에 남긴다", () => {
    interface Acc { nDiag: number; free: number; placedFree: number; err: number[]; worst: number[];
                    nEdge: number; placedEdge: number; edgeWorst: number[]; }
    const acc = (): Acc => ({ nDiag: 0, free: 0, placedFree: 0, err: [], worst: [],
                              nEdge: 0, placedEdge: 0, edgeWorst: [] });
    const res: Record<string, Record<number, Acc>> = {};
    for (const a of ARMS) { res[a.key] = {}; for (const d of ANGLES) res[a.key][d] = acc(); }

    for (const deg of ANGLES) for (const seed of SEEDS) {
      const r = rng32(seed + deg);
      for (let it = 0; it < 40; it++) {
        const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
        if (!O) continue;
        const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
        const edges = boxEdges(SC, O, a, b, c);
        const diag3 = norm3(sub3(edges[11].b, edges[0].a));
        const d1 = drawInView(null, CTX0, edges, r);
        if (!d1) continue;

        // --- 첫 시점에서 상자를 세운다(앱과 같은 옵션) ---
        resetStrokeIds();
        const base: Stroke[] = d1.map(p => {
          const v = classifyStroke(p, SC.vps, SC.imgSize, {},
                                   { principal: SC.principal, f: SC.f });
          return newStroke(p, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
        });
        settle(base, CTX0, { mode: "facing", farEndCheck: PLACE_TOL.far_end_check,
                             facePlanes: PLACE_TOL.face_far_end, freeBendMax: AXIS_TOL.bend_max,
                             freeSpan: PLACE_TOL.span_far_end });
        const placedFirst = base.filter(s => s.pts3d.length);
        if (placedFirst.length < 6) continue;

        // --- 돌린다 ---
        const pts = placedFirst.flatMap(s => s.pts3d);
        const centre: Vec3 = [0, 1, 2].map(k => pts.reduce((s2, p) => s2 + p[k], 0) / pts.length) as Vec3;
        const dist = Math.max(2.5, norm3(centre) * 0.9);
        const pose = orbit(centre, deg, dist, 18);
        const ctxV = viewPlaceCtx(pose, AXES, SC.imgSize, VIEW_FOV);

        // --- 그 시점에서 **면 대각선 둘 + 뒤쪽 모서리 하나**를 긋는다 ---
        const diags = faceDiagonals(SC, O, a, b, c) as unknown as TrueEdge[];
        const extra = [edges[11]];
        const drawn = drawInView(pose, ctxV, [...diags, ...extra], r);
        if (!drawn) continue;
        const truth = [...diags, ...extra];

        for (const arm of ARMS) {
          const R = res[arm.key][deg];
          // 기존 획을 그 시점 좌표로 옮긴 사본(앱의 `addStrokeFromView`와 같다)
          const inView: Stroke[] = base.map(s => {
            if (!s.pts3d.length) return { ...s, pts3d: [] };
            const p3 = s.pts3d.map(p => toView(pose, p));
            const p2 = s.pts3d.map(p => projectInView(pose, p, ctxV.principal, ctxV.f));
            return p2.every(Boolean) ? { ...s, pts3d: p3, pts2d: p2 as Pt2[] } : { ...s, pts3d: [] };
          });
          const before = inView.length;
          drawn.forEach(p => {
            const v = classifyStroke(p, ctxV.vps, ctxV.imgSize, {},
                                     { principal: ctxV.principal, f: ctxV.f });
            inView.push(newStroke(p, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined));
          });
          settle(inView, ctxV, arm.opts);

          for (let i = before; i < inView.length; i++) {
            const s = inView[i], t = truth[i - before], isDiag = i - before < diags.length;
            const ta = toView(pose, t.a), tb = toView(pose, t.b);
            if (isDiag) {
              R.nDiag += 1;
              if (s.axis !== "free") continue;              // 축으로 오인된 것은 §4.1의 몫이다
              R.free += 1;
              if (!s.pts3d.length) continue;
              R.placedFree += 1;
              const e = [norm3(sub3(s.pts3d[0], ta)) / diag3,
                         norm3(sub3(s.pts3d[s.pts3d.length - 1], tb)) / diag3];
              R.err.push(...e); R.worst.push(Math.max(...e));
            } else {
              R.nEdge += 1;
              if (!s.pts3d.length) continue;
              R.placedEdge += 1;
              R.edgeWorst.push(Math.max(norm3(sub3(s.pts3d[0], ta)) / diag3,
                                        norm3(sub3(s.pts3d[s.pts3d.length - 1], tb)) / diag3));
            }
          }
        }
      }
    }

    const report = {
      spec: "S-7 (0) 돌린 시점의 평면 경로. **같은 획이 시점에 따라 갈리면 안 된다.**",
      constants: constantsSnapshot(),
      why: (
        "§4.3의 평면 경로가 **첫 시점에만** 켜져 있었다(배선 점검에서 발견). 돌린 뒤에 그은 "
        + "면 위 사선은 놓이지 않는다 — 사용자가 이해할 수 없는 동작이다. 다만 돌린 시점은 "
        + "가림이 있고 자유단이 많아 조건이 다르므로 **측정하고 켠다**."
      ),
      metrics: {
        recovered_of_free: "미분류로 남은 사선 중 놓인 비율 — 첫 시점의 `recovered_of_unclassified`와 같은 양이다.",
        worst_end_ratio: "획당 나쁜 쪽 끝 ÷ 상자 대각.",
        edge_control: "**대조군** — 같은 시점에서 그은 뒤쪽 모서리. 평면 경로를 켜서 축 획이 나빠지면 안 된다.",
      },
      condition: { grade: "medium", skew: 0.12, end_jitter: END_JITTER, boxes_per_cell: 40,
                   orbit_deg: ANGLES, elev_deg: 18, seeds: SEEDS, view_fov_deg: VIEW_FOV,
                   single_composition_warning: "구도가 하나뿐이다(직육면체, 요 35°·피치 15° 3점)." },
      by_orbit_deg: Object.fromEntries(ANGLES.map(d => [String(d),
        Object.fromEntries(ARMS.map(arm => {
          const R = res[arm.key][d];
          return [arm.key, {
            what: arm.what,
            n_diagonals: R.nDiag,
            unclassified_rate: rate(R.free, R.nDiag),
            recovered_of_free: rate(R.placedFree, R.free),
            worst_end_ratio: stat(R.worst, 4),
            worst_end_over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
              [`over_${c}`, R.worst.filter(v => v > c).length])),
            edge_control: { n: R.nEdge, placed_rate: rate(R.placedEdge, R.nEdge),
                            worst_end_ratio: stat(R.edgeWorst, 4),
                            over_0_2: R.edgeWorst.filter(v => v > 0.2).length },
          }];
        })),
      ])),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "view_plane.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(res.now[45].nDiag).toBeGreaterThan(20);
  }, 600_000);
});
