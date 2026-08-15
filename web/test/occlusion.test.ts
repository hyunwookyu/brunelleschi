// **가림 정합성이 신호가 되는가** — 산출: `stage0/out/occlusion.json`. (S-10 판정의 후속)
//
// D-S22가 확정한 것: 돌린 시점의 사선 오배정은 **투영의 애매성**이고 2D 증거로는 못 가른다.
// 남은 길은 **2D 밖의 정보**이며 그 후보가 가림 정합성이다:
//
//   > 사용자는 획 전체를 **보면서** 그었다. 그런데 어떤 배치 가설은 획의 일부를 기존 기하
//   > **뒤로** 보낸다 — 그랬다면 그 부분은 화면에서 **안 보였어야 한다**. 그 모순이 신호다.
//
// **여기서 하는 것은 구현이 아니라 타당성 측정이다.** 앱 동작을 바꾸지 않는다(옵션도 안 만든다).
// 재는 것 하나: **참으로 맞게 놓인 배치와 크게 틀리게 놓인 배치가 이 값으로 갈리는가.**
// 안 갈리면 다음 세션이 그 길로 가지 않아도 된다 — 그것을 먼저 아는 것이 이 측정의 값이다.
//
// **자기확인 차단**: 가림 여부는 **배치가 쓰는 수학(광선-평면)으로 만들지 않는다.** 놓인 3D
// 점열을 그 시점 화면에 투영하고, **다른 획의 투영된 폴리라인**과 화면에서 겹치는지 + 깊이가
// 앞인지로만 센다(렌더러가 하는 일과 같은 판정이다). 참·거짓 라벨은 **참값 3D**에서 온다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { FIRST_VIEW_OPTS, VIEW_OPTS, VIEW_AXIS_CFG } from "../src/s3d/appPlace.js";
import { norm3, sub3, mul3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32, gauss, renderInk } from "../src/s3d/synthInk.js";
import { viewPlaceCtx, toView, projectInView, type ViewPose } from "../src/s3d/viewCamera.js";
import { scene, groundPoint, boxEdges, faceDiagonals, stat,
         type Scene, type TrueEdge } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC: Scene = scene(35, 15);
const CTX0: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };
const AXES = SC.axes as unknown as Vec3[];
const VIEW_FOV = 45;
const END_JITTER = 0.01;

/**
 * **가림 판정의 화면 반경(px)**. 튜브의 화면 굵기에 해당한다 — 획이 그 안에 들어오면
 * 가려진 것으로 본다. **임계이므로 값에 결론이 달리면 그 결론은 없다**(반복 유형 13):
 * 그래서 셋을 다 낸다.
 */
const RADII_PX = [2, 4, 8];
/** "갈렸다"고 부를 중앙값 차이. 자의적이라 원본 분포를 함께 낸다(반복 유형 13). */
const SEP_MIN = 0.05;
/** 깊이가 이만큼(상대) 앞이어야 "가린다"고 본다 — 같은 모서리끼리 서로 가리는 것을 막는다. */
const DEPTH_MARGIN = 0.02;

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

/** 점과 선분의 거리(화면). */
function segDist(p: Pt2, a: Pt2, b: Pt2): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2));
  return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]);
}

/**
 * **가려진 점의 비율**. 놓인 획(뷰 좌표)의 각 점을 그 시점 화면에 투영하고,
 * 다른 획의 투영 폴리라인이 **화면에서 `radius` 안**에 있으면서 **깊이가 앞**이면 가려진 것이다.
 *
 * 렌더러가 픽셀에서 하는 판정과 같은 규칙이고, **배치 수학을 다시 쓰지 않는다**(자기확인 차단).
 */
function occludedFraction(
  pts3dView: Vec3[], others: { p2: Pt2[]; z: number[] }[], ctx: PlaceCtx, radius: number,
): number | null {
  let n = 0, hit = 0;
  for (const p of pts3dView) {
    const s = projectInView({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] },
                            p, ctx.principal, ctx.f);
    if (!s) continue;
    n += 1;
    let covered = false;
    for (const o of others) {
      for (let i = 1; i < o.p2.length && !covered; i++) {
        if (segDist(s, o.p2[i - 1], o.p2[i]) > radius) continue;
        // 그 선분에서 화면상 가장 가까운 점의 깊이(끝점 둘의 평균으로 근사한다)
        const z = (o.z[i - 1] + o.z[i]) / 2;
        if (z < p[2] * (1 - DEPTH_MARGIN)) covered = true;
      }
      if (covered) break;
    }
    if (covered) hit += 1;
  }
  return n ? hit / n : null;
}

const ANGLES = [45, 75, 110];
const SEEDS = [9500, 1301, 5501];

describe("가림 정합성이 신호가 되는가 (타당성 측정 — 구현이 아니다)", () => {
  it("맞게 놓인 배치와 크게 틀린 배치가 가림 비율로 갈리는지 재고 원장에 남긴다", () => {
    interface Cell { good: number[]; bad: number[]; nGood: number; nBad: number; }
    const cells: Record<string, Record<number, Cell>> = {};
    for (const r of RADII_PX) {
      cells[r] = {};
      for (const d of ANGLES) cells[r][d] = { good: [], bad: [], nGood: 0, nBad: 0 };
    }

    for (const deg of ANGLES) for (const seed of SEEDS) {
      const r = rng32(seed + deg);
      for (let it = 0; it < 30; it++) {
        const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
        if (!O) continue;
        const a = 0.8 + r() * 0.7, b = 0.8 + r() * 0.7, c = 0.6 + r() * 0.6;
        const edges = boxEdges(SC, O, a, b, c);
        const diag3 = norm3(sub3(edges[11].b, edges[0].a));
        const d1 = drawInView(null, CTX0, edges, r);
        if (!d1) continue;

        resetStrokeIds();
        const base: Stroke[] = d1.map(p => {
          const v = classifyStroke(p, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
          return newStroke(p, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
        });
        settle(base, CTX0, FIRST_VIEW_OPTS);
        if (base.filter(s => s.pts3d.length).length < 6) continue;

        const pts = base.filter(s => s.pts3d.length).flatMap(s => s.pts3d);
        const centre: Vec3 = [0, 1, 2].map(k => pts.reduce((s2, p) => s2 + p[k], 0) / pts.length) as Vec3;
        const pose = orbit(centre, deg, Math.max(2.5, norm3(centre) * 0.9), 18);
        const ctxV = viewPlaceCtx(pose, AXES, SC.imgSize, VIEW_FOV);
        const diags = faceDiagonals(SC, O, a, b, c) as unknown as TrueEdge[];
        const truthV = [...diags, edges[11]];
        const drawn = drawInView(pose, ctxV, truthV, r);
        if (!drawn) continue;

        // 앱과 같은 경로로 놓는다(출하 구성)
        const inView: Stroke[] = base.map(s => {
          if (!s.pts3d.length) return { ...s, pts3d: [] };
          const p3 = s.pts3d.map(p => toView(pose, p));
          const p2 = s.pts3d.map(p => projectInView(pose, p, ctxV.principal, ctxV.f));
          return p2.every(Boolean) ? { ...s, pts3d: p3, pts2d: p2 as Pt2[] } : { ...s, pts3d: [] };
        });
        const before = inView.length;
        for (const p of drawn) {
          const v = classifyStroke(p, ctxV.vps, ctxV.imgSize, VIEW_AXIS_CFG,
                                   { principal: ctxV.principal, f: ctxV.f });
          inView.push(newStroke(p, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined));
        }
        settle(inView, ctxV, VIEW_OPTS);

        // 가림을 만드는 것은 **먼저 있던 기하**다(새로 그은 획끼리는 세지 않는다)
        const others = inView.slice(0, before).filter(s => s.pts3d.length)
          .map(s => ({ p2: s.pts2d, z: s.pts3d.map(p => p[2]) }));
        if (others.length < 4) continue;

        for (let i = before; i < inView.length; i++) {
          const s = inView[i], t = truthV[i - before];
          if (!s.pts3d.length) continue;                    // 안 놓인 것은 판정 대상이 아니다
          const ta = toView(pose, t.a), tb = toView(pose, t.b);
          const worst = Math.max(norm3(sub3(s.pts3d[0], ta)),
                                 norm3(sub3(s.pts3d[s.pts3d.length - 1], tb))) / diag3;
          const bad = worst > 0.2;
          for (const rad of RADII_PX) {
            const f = occludedFraction(s.pts3d, others, ctxV, rad);
            if (f == null) continue;
            const C = cells[rad][deg];
            if (bad) { C.bad.push(+f.toFixed(4)); C.nBad += 1; }
            else { C.good.push(+f.toFixed(4)); C.nGood += 1; }
          }
        }
      }
    }

    /** 임계 하나로 갈랐을 때 잡히는 것과 잃는 것. **한 값에 결론을 걸지 않는다**(반복 유형 13). */
    const sweep = (C: Cell) => Object.fromEntries([0.05, 0.1, 0.2, 0.4].map(th => [
      `over_${th}`,
      { wrong_caught: C.bad.filter(v => v > th).length,
        wrong_caught_rate: C.nBad ? +(C.bad.filter(v => v > th).length / C.nBad).toFixed(4) : null,
        good_lost: C.good.filter(v => v > th).length,
        good_lost_rate: C.nGood ? +(C.good.filter(v => v > th).length / C.nGood).toFixed(4) : null },
    ]));

    const report = {
      spec: "가림 정합성의 **타당성 측정**. 구현이 아니다 — 앱 동작을 바꾸지 않는다.",
      constants: constantsSnapshot(),
      why: (
        "D-S22가 '2D 증거로는 못 가른다'를 확정했고 남은 길이 2D 밖의 정보다. 그 후보가 "
        + "가림 정합성이다: 사용자는 획 전체를 보면서 그었는데, 어떤 배치 가설은 획의 일부를 "
        + "기존 기하 뒤로 보낸다 — 그랬다면 안 보였어야 한다. **그 값이 참·거짓을 가르는지**를 "
        + "먼저 잰다. 안 갈리면 다음 세션이 그 길로 가지 않아도 된다."
      ),
      metric: (
        "`occluded_fraction` = 놓인 획의 점 중 **화면에서 다른 획에 덮이고 깊이가 뒤인** 비율. "
        + "판정은 **투영과 깊이 비교로만** 한다 — 배치가 쓰는 광선-평면 수학을 다시 쓰지 않는다"
        + "(자기확인 차단). 참·거짓 라벨은 참값 3D에서 온다(끝점 오차 0.2 초과 = 크게 틀림)."
      ),
      condition: {
        composition: "요 35°·피치 15° 3점, 직육면체 하나", grade: "medium", skew: 0.12,
        end_jitter: END_JITTER, elev_deg: 18, orbit_deg: ANGLES, seeds: SEEDS, boxes_per_cell: 30,
        opts: "VIEW_OPTS + VIEW_AXIS_CFG(출하 구성) — **지금 실제로 놓이는 것만** 대상이다",
        occluders: "먼저 있던 기하만(새로 그은 획끼리는 세지 않는다)",
        screen_radius_px_sweep: RADII_PX, depth_margin: DEPTH_MARGIN,
        single_composition_warning: "구도가 하나뿐이다(AS-13).",
      },
      by_radius_and_orbit: Object.fromEntries(RADII_PX.map(rad => [`r${rad}px`,
        Object.fromEntries(ANGLES.map(d => {
          const C = cells[rad][d];
          return [String(d), {
            n_good: C.nGood, n_bad: C.nBad,
            good_occluded: stat(C.good, 4),
            bad_occluded: stat(C.bad, 4),
            threshold_sweep: sweep(C),
          }];
        }))])),
      /**
       * **판정을 수치에서 뽑는다**(손으로 쓰지 않는다). 갈린다 = 틀린 쪽의 중앙값이 맞은 쪽보다
       * `SEP_MIN`만큼 크다. 그 값(0.05)은 자의적이므로 원본 분포를 위에 함께 낸다.
       */
      separation: Object.fromEntries(RADII_PX.map(rad => [`r${rad}px`,
        Object.fromEntries(ANGLES.map(d => {
          const C = cells[rad][d];
          const gm = stat(C.good, 4).median, bm = stat(C.bad, 4).median;
          return [String(d), { good_median: gm, bad_median: bm,
            separates: gm != null && bm != null ? bm - gm > SEP_MIN : null,
            inverted: gm != null && bm != null ? gm - bm > SEP_MIN : null }];
        }))])),
      how_to_read: (
        "**갈린다면** `bad_occluded`의 중앙값이 `good_occluded`보다 뚜렷이 크고, 임계 스윕에서 "
        + "`wrong_caught_rate`가 `good_lost_rate`보다 크게 앞선다. **안 갈린다면** 두 분포가 "
        + "겹치고, 그때는 이 신호로 D-S22를 되돌릴 수 없다."
      ),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "occlusion.json"), JSON.stringify(report, null, 2), "utf-8");

    // 측정이 실제로 돌았는가 — 양쪽 표본이 다 있어야 비교가 뜻이 있다
    expect(cells[4][45].nGood + cells[4][45].nBad).toBeGreaterThan(20);
  }, 600_000);
});
