// S-10 (a) **고치기 부하** — 산출: `stage0/out/fix_load.json`.
//
// D-S22가 돌린 시점의 배치율을 **0.25~0.46으로 떨어뜨렸다**. 안 놓인 획은 사라지지 않고
// `고치기`로 가지만(D-S15·D-S18), **그 부담이 얼마인지는 재지 않았다.** 이것이 §1의
// "왕복 횟수" 지표에 해당하고, **이 값이 크면 도구가 성립하지 않는다** — 손으로 3D를
// 모델링하는 것과 다를 바 없어지기 때문이다.
//
// ## 조작 수의 정의 (앱의 실제 경로 그대로)
//   1  획 고르기            — 목록의 획 버튼 또는 캔버스 클릭
//   1  후보 점 하나 누르기   — 끝마다 하나씩(양 끝을 고르면 2)
//   1  깊이 슬라이더        — 닿는 획이 없을 때. **언제나 미확정으로 남는다**
//   1  "그 시점으로"        — 돌린 시점 획인데 지금 그 시점이 아닐 때
//
// ## 무엇을 함께 재는가 — **부담이 싸도 결과가 틀리면 뜻이 없다**
// 사용자가 고른 앵커에는 검사를 걸지 않는다(D-S18). 그러므로 **고친 결과가 맞는지**를
// 참값과 대조해야 한다. 사용자 모형 둘을 나란히 낸다:
//   `nearest` 화면에서 가장 가까운 후보를 고른다(UI가 먼저 보여 주는 것)
//   `oracle`  참 끝점에 가장 가까운 후보를 고른다(**상한** — 답을 아는 사람)
// 둘이 갈리면 그 차이가 "사용자가 잘 골라야 하는 정도"다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, PLACE_TOL, diagOf, anchorCandidates,
         placeByUser, placeAtDepth, depthRange,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
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
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

/** `view_plane`과 같은 궤도식 — 두 원장의 조건을 맞춰 둔다. */
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

/** 고치기 한 번의 결과. `ops`가 조작 수, `worst`가 참값 대비 나쁜 쪽 끝 오차다. */
interface Fixed { ops: number; provisional: boolean; worst: number | null; noCandidate: boolean;
  /** **고른 앵커가 어느 획 위였나** — 그 획 자체가 틀려 있으면 고치기는 실패할 수밖에 없다. */
  anchorIds: string[]; }

/**
 * **`고치기` 한 획**을 그대로 흉내 낸다. 앱의 `refreshCandidates` → `editClick` → `applyPicks`와
 * 같은 순서이고, 후보 반경도 같다(`fix_candidate_radius_mult`).
 *
 * `pick`이 사용자 모형이다 — 후보 목록에서 어느 것을 누르는가.
 */
function fixOne(
  s: Stroke, placed: Stroke[], ctx: PlaceCtx, truth: [Vec3, Vec3], diag3: number,
  pick: (cands: { pos: Vec3; d: number }[], trueEnd: Vec3) => Vec3 | undefined,
  radiusMult = PLACE_TOL.fix_candidate_radius_mult,
): Fixed {
  const radius = PLACE_TOL.join_ratio * diagOf(ctx.imgSize) * radiusMult;
  const ends: [Pt2, Pt2] = [s.pts2d[0], s.pts2d[s.pts2d.length - 1]];
  const c0 = anchorCandidates(placed, ends[0], radius);
  const c1 = anchorCandidates(placed, ends[1], radius);
  let ops = 1;                                    // 획 고르기
  const a = c0.length ? pick(c0, truth[0]) : undefined;
  const b = c1.length ? pick(c1, truth[1]) : undefined;
  const anchorIds = [
    a ? c0.find(x => x.pos === a)?.id : undefined,
    b ? c1.find(x => x.pos === b)?.id : undefined,
  ].filter(Boolean) as string[];
  nCandSeen.push(c0.length + c1.length);      // **사용자가 봐야 하는 점의 수** — 반경의 대가다
  if (a) ops += 1;
  if (b) ops += 1;

  if (!a && !b) {
    // 닿는 획이 없다 — 깊이 슬라이더. **언제나 미확정**이고, 여기서는 사용자가 참 깊이를
    // 맞춘다고 **가정하지 않는다**: 기존 기하의 깊이 범위 한가운데를 준다(UI 초기값).
    const zr = depthRange(placed);
    ops += 1;
    const got = zr ? placeAtDepth(s.pts2d, (zr[0] + zr[1]) / 2, ctx) : null;
    if (!got) return { ops, provisional: true, worst: null, noCandidate: true, anchorIds };
    const w = Math.max(norm3(sub3(got[0], truth[0])), norm3(sub3(got[got.length - 1], truth[1]))) / diag3;
    return { ops, provisional: true, worst: +w.toFixed(4), noCandidate: true, anchorIds };
  }
  const r = placeByUser(s, ctx, { a, b });
  if (!r) return { ops, provisional: true, worst: null, noCandidate: false, anchorIds };
  const w = Math.max(norm3(sub3(r.pts3d[0], truth[0])),
                     norm3(sub3(r.pts3d[r.pts3d.length - 1], truth[1]))) / diag3;
  return { ops, provisional: r.provisional, worst: +w.toFixed(4), noCandidate: false, anchorIds };
}

/** 후보 반경을 넓히면 사용자가 봐야 하는 점이 는다 — **이득과 대가를 함께 센다**. */
const nCandSeen: number[] = [];
const RADIUS_MULTS = [PLACE_TOL.fix_candidate_radius_mult, 5, 8];

/** `fixOne`과 같은 선택을 하되 **놓인 점열을 돌려준다**(연쇄 팔이 그것을 리스트에 넣는다). */
function fixApply(
  s: Stroke, placed: Stroke[], ctx: PlaceCtx,
  pick: (c: { pos: Vec3; d: number }[], t: Vec3) => Vec3 | undefined,
  truth: [Vec3, Vec3],
): Vec3[] | null {
  const radius = PLACE_TOL.join_ratio * diagOf(ctx.imgSize) * PLACE_TOL.fix_candidate_radius_mult;
  const c0 = anchorCandidates(placed, s.pts2d[0], radius);
  const c1 = anchorCandidates(placed, s.pts2d[s.pts2d.length - 1], radius);
  const a = c0.length ? pick(c0, truth[0]) : undefined;
  const b = c1.length ? pick(c1, truth[1]) : undefined;
  if (!a && !b) {
    const zr = depthRange(placed);
    return zr ? placeAtDepth(s.pts2d, (zr[0] + zr[1]) / 2, ctx) : null;
  }
  return placeByUser(s, ctx, { a, b })?.pts3d ?? null;
}

const nearestPick = (c: { pos: Vec3; d: number }[]) => c[0]?.pos;
const oraclePick = (c: { pos: Vec3; d: number }[], t: Vec3) =>
  c.slice().sort((x, y) => norm3(sub3(x.pos, t)) - norm3(sub3(y.pos, t)))[0]?.pos;

const ANGLES = [45, 75, 110];
const SEEDS = [9500, 1301, 5501];
const USERS = [
  { key: "nearest", pick: nearestPick, what: "화면에서 가장 가까운 후보(UI가 먼저 보여 주는 것)" },
  { key: "oracle", pick: oraclePick, what: "참 끝점에 가장 가까운 후보 — **상한**(답을 아는 사람)" },
];

interface Acc {
  drawn: number; unplaced: number; ops: number; opsList: number[];
  provisional: number; noCand: number; worst: number[]; over02: number;
  /** **조용히 틀린 자동 배치**(S-8b 잔여) — 고치기 대상이 아니라서 부담에 안 잡힌다. */
  silentWrong: number; autoPlaced: number;
}
const acc = (): Acc => ({ drawn: 0, unplaced: 0, ops: 0, opsList: [], provisional: 0,
                          noCand: 0, worst: [], over02: 0, silentWrong: 0, autoPlaced: 0 });

describe("S-10 (a) 고치기 부하", () => {
  it("미배치 획을 손으로 붙이는 데 드는 조작 수를 재고 원장에 남긴다", () => {
    /** 후보 반경 스윕의 적재소 — `seen`이 사용자가 봐야 하는 점의 수(대가)다. */
    const radiusArm: Record<number, { n: number; worst: number[]; over02: number;
                                      noCand: number; seen: number[]; anchorBad: number;
                                      anchorBadAndWrong: number; anchorGoodButWrong: number }> = {};
    for (const m of RADIUS_MULTS) {
      radiusArm[m] = { n: 0, worst: [], over02: 0, noCand: 0, seen: [],
                       anchorBad: 0, anchorBadAndWrong: 0, anchorGoodButWrong: 0 };
    }
    /** **연쇄 팔** — 손으로 하나 붙일 때마다 자동 배치를 다시 돌리면 몇 개가 공짜로 놓이는가. */
    const cascade = { ops: 0, fixed: 0, freeAdds: 0, scenes: 0, strokes: 0,
                      freeErr: [] as number[], freeWrong: 0 };
    const first: Record<string, Acc> = {};
    const view: Record<string, Record<number, Acc>> = {};
    /** **획 종류별**(리뷰어 4): 첫 시점 셀은 모서리 12획뿐이고 돌린 시점은 사선 2 + 모서리 1이다.
     *  종류를 안 가르면 "시점 차이"로 읽히는 것이 사실은 **획 종류 차이**일 수 있다. */
    const viewByKind: Record<string, Record<number, { diag: Acc; edge: Acc }>> = {};
    for (const u of USERS) {
      first[u.key] = acc();
      view[u.key] = {};
      viewByKind[u.key] = {};
      for (const d of ANGLES) {
        view[u.key][d] = acc();
        viewByKind[u.key][d] = { diag: acc(), edge: acc() };
      }
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

        // ---- 첫 시점: 상자를 세운다(앱 옵션) ----
        resetStrokeIds();
        const base: Stroke[] = d1.map(p => {
          const v = classifyStroke(p, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
          return newStroke(p, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
        });
        settle(base, CTX0, FIRST_VIEW_OPTS);
        if (base.filter(s => s.pts3d.length).length < 6) continue;

        // ---- 첫 시점의 고치기 부하 (**각도와 무관하므로 45°에서만 센다**) ----
        if (deg === 45) {
          for (const u of USERS) {
            const A = first[u.key];
            A.drawn += base.length;
            const placedNow = base.filter(s => s.pts3d.length);
            A.autoPlaced += placedNow.length;
            for (let i = 0; i < base.length; i++) {
              const s = base[i];
              if (s.pts3d.length) {
                const w = Math.max(norm3(sub3(s.pts3d[0], edges[i].a)),
                                   norm3(sub3(s.pts3d[s.pts3d.length - 1], edges[i].b))) / diag3;
                if (w > 0.2) A.silentWrong += 1;      // 자동으로 놓였는데 크게 틀렸다
                continue;
              }
              A.unplaced += 1;
              const f = fixOne(s, placedNow, CTX0, [edges[i].a, edges[i].b], diag3, u.pick);
              A.ops += f.ops; A.opsList.push(f.ops);
              if (f.provisional) A.provisional += 1;
              if (f.noCandidate) A.noCand += 1;
              if (f.worst != null) { A.worst.push(f.worst); if (f.worst > 0.2) A.over02 += 1; }
            }
          }
        }

        // ---- **연쇄 팔**: 손으로 하나 붙인 뒤 **자동 배치를 다시 돌리면** 다른 획이
        //      공짜로 놓이는가. **앱은 지금 그것을 안 한다**(`applyPicks`가 `settle`을 안 부른다).
        if (deg === 45) {
          const list: Stroke[] = base.map(t => ({ ...t, pts3d: t.pts3d.slice() }));
          cascade.scenes += 1;
          cascade.strokes += list.length;
          for (let guard = 0; guard < 40; guard++) {
            const idx = list.findIndex(t => !t.pts3d.length);
            if (idx < 0) break;
            const placedNow = list.filter(t => t.pts3d.length);
            const f = fixOne(list[idx], placedNow, CTX0,
                             [edges[idx].a, edges[idx].b], diag3, nearestPick);
            cascade.ops += f.ops;
            cascade.fixed += 1;
            const got = fixApply(list[idx], placedNow, CTX0, nearestPick,
                                 [edges[idx].a, edges[idx].b]);
            // 못 붙이면 그 획은 이 팔에서 제외한다(무한 반복 방지) — 개수에서도 뺀다
            if (!got) { list.splice(idx, 1); cascade.strokes -= 1; continue; }
            list[idx].pts3d = got;
            // **공짜로 놓이는 것** — 그리고 **그것이 맞는지 함께 센다.** 부담이 줄어도
            // 조용히 틀린 배치가 늘면 안 된다(A-3). 개수만 세면 그 위험이 안 보인다.
            const wasPlaced = list.map(t => t.pts3d.length > 0);
            const added = settle(list, CTX0, FIRST_VIEW_OPTS);
            cascade.freeAdds += added;
            list.forEach((t, k) => {
              if (wasPlaced[k] || !t.pts3d.length) return;
              const j = base.findIndex(x => x.id === t.id);
              if (j < 0) return;
              const w = Math.max(norm3(sub3(t.pts3d[0], edges[j].a)),
                                 norm3(sub3(t.pts3d[t.pts3d.length - 1], edges[j].b))) / diag3;
              cascade.freeErr.push(+w.toFixed(4));
              if (w > 0.2) cascade.freeWrong += 1;
            });
          }
        }

        // ---- **후보 반경 스윕**(PROTOTYPE 1.2의 물음: 옳은 앵커가 목록에 있기는 한가) ----
        // `oracle`로 고른다 — **후보 안에 답이 있는지**를 재는 것이므로 사용자 모형은 상한을 쓴다.
        if (deg === 45) {
          for (const mult of RADIUS_MULTS) {
            const R = radiusArm[mult];
            const placedNow = base.filter(t => t.pts3d.length);
            for (let i = 0; i < base.length; i++) {
              const t = base[i];
              if (t.pts3d.length) continue;
              const seen0 = nCandSeen.length;
              const f = fixOne(t, placedNow, CTX0, [edges[i].a, edges[i].b], diag3,
                               oraclePick, mult);
              R.seen.push(...nCandSeen.slice(seen0));
              R.n += 1;
              if (f.noCandidate) R.noCand += 1;
              if (f.worst != null) { R.worst.push(f.worst); if (f.worst > 0.2) R.over02 += 1; }
              // **앵커로 쓴 획 자체가 맞게 놓였는가.** 틀린 획에 붙이면 고치기가 이길 수 없다.
              if (mult === PLACE_TOL.fix_candidate_radius_mult && f.worst != null) {
                const bad = f.anchorIds.some(id => {
                  const k = base.findIndex(x => x.id === id);
                  if (k < 0 || !base[k].pts3d.length) return false;
                  const w = Math.max(norm3(sub3(base[k].pts3d[0], edges[k].a)),
                                     norm3(sub3(base[k].pts3d[base[k].pts3d.length - 1], edges[k].b))) / diag3;
                  return w > 0.2;
                });
                if (bad) { R.anchorBad += 1; if (f.worst > 0.2) R.anchorBadAndWrong += 1; }
                else if (f.worst > 0.2) R.anchorGoodButWrong += 1;
              }
            }
          }
        }

        // ---- 돌린다 → 그 시점에서 면 대각선 둘 + 뒤 모서리 하나를 긋는다 ----
        const pts = base.filter(s => s.pts3d.length).flatMap(s => s.pts3d);
        const centre: Vec3 = [0, 1, 2].map(k => pts.reduce((s2, p) => s2 + p[k], 0) / pts.length) as Vec3;
        const pose = orbit(centre, deg, Math.max(2.5, norm3(centre) * 0.9), 18);
        const ctxV = viewPlaceCtx(pose, AXES, SC.imgSize, VIEW_FOV);
        const diags = faceDiagonals(SC, O, a, b, c) as unknown as TrueEdge[];
        const truthV = [...diags, edges[11]];
        const drawn = drawInView(pose, ctxV, truthV, r);
        if (!drawn) continue;

        for (const u of USERS) {
          const A = view[u.key][deg];
          // 기존 획을 그 시점 좌표로(앱의 `addStrokeFromView`)
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
          settle(inView, ctxV, VIEW_OPTS);          // **출하 구성**(D-S22)

          A.drawn += drawn.length;
          for (let i = before; i < inView.length; i++) {
            const s = inView[i], t = truthV[i - before];
            const K = viewByKind[u.key][deg][i - before < diags.length ? "diag" : "edge"];
            K.drawn += 1;
            const ta = toView(pose, t.a), tb = toView(pose, t.b);
            if (s.pts3d.length) {
              A.autoPlaced += 1; K.autoPlaced += 1;
              const w = Math.max(norm3(sub3(s.pts3d[0], ta)),
                                 norm3(sub3(s.pts3d[s.pts3d.length - 1], tb))) / diag3;
              if (w > 0.2) { A.silentWrong += 1; K.silentWrong += 1; }   // 조용히 틀린 배치
              continue;
            }
            A.unplaced += 1; K.unplaced += 1;
            const placedNow = inView.filter(x => x.pts3d.length);
            const f = fixOne(s, placedNow, ctxV, [ta, tb], diag3, u.pick);
            A.ops += f.ops; A.opsList.push(f.ops);
            K.ops += f.ops; K.opsList.push(f.ops);
            if (f.provisional) A.provisional += 1;
            if (f.noCandidate) A.noCand += 1;
            if (f.worst != null) {
              A.worst.push(f.worst); if (f.worst > 0.2) A.over02 += 1;
              K.worst.push(f.worst); if (f.worst > 0.2) K.over02 += 1;
            }
          }
        }
      }
    }

    const view1 = (A: Acc) => ({
      n_drawn: A.drawn,
      auto_placed_rate: rate(A.autoPlaced, A.drawn),
      unplaced_rate: rate(A.unplaced, A.drawn),
      /** **이 셋이 부담의 전부다.** 획당 조작 수 = 총 조작 ÷ 그린 획. */
      ops_total: A.ops,
      ops_per_unplaced: rate(A.ops, A.unplaced),
      ops_per_drawn_stroke: rate(A.ops, A.drawn),
      ops_dist: stat(A.opsList, 2),
      /** **이 값은 배치율의 대수적 변환이다** — `(1 − 배치율) × ops_per_unplaced`와 정확히 같다.
       *  독립된 두 번째 증거가 아니다(리뷰어 1). 실제 자유도는 배치율과 "양 끝을 눌러야 한 비율"뿐이다. */
      ops_identity: "(1 - auto_placed_rate) x ops_per_unplaced",
      /**
       * **빠진 조작 둘을 넣은 민감도**(리뷰어 2·3). 기본 모형은 아래 둘을 0으로 둔다:
       *   ① `그 시점으로` — 돌린 시점 획은 그 시점으로 돌아가야 후보가 생긴다(미배치마다 1)
       *   ② **조용히 틀린 배치를 고치는 조작** — 사용자가 알아채면 미배치와 같은 3조작이 든다
       * 그러므로 기본값은 **하한**이다.
       */
      ops_per_drawn_with_go_to_view: A.drawn ? +((A.ops + A.unplaced) / A.drawn).toFixed(4) : null,
      ops_per_drawn_with_silent_fix: A.drawn
        ? +((A.ops + A.unplaced + A.silentWrong * 3) / A.drawn).toFixed(4) : null,
      /**
       * **재시도를 넣으면**(붙인 것이 틀렸음을 사용자가 알아채고 다시 한다면). 지금 모형은
       * 재시도를 0으로 잡는다 — 그것이 **하한**이라는 뜻이다. 한 번 더 하면 이만큼이다:
       * `ops + (틀린 비율 × 3)`(고르기 1 + 후보 클릭 2). **알아채는지는 안 쟀다** —
       * 화면에 "이 후보가 틀렸을 수 있다"는 표시가 없다.
       */
      ops_per_drawn_with_one_retry: A.drawn
        ? +(((A.ops + (A.worst.length ? (A.over02 / A.worst.length) * A.unplaced * 3 : 0))
             / A.drawn)).toFixed(4)
        : null,
      provisional_rate: rate(A.provisional, A.unplaced),
      no_candidate_rate: rate(A.noCand, A.unplaced),
      /** 고친 결과가 참값에서 얼마나 떨어졌는가(상자 대각 대비). */
      fixed_worst_end: stat(A.worst, 4),
      /** **절단값 하나에 결론을 걸지 않는다**(반복 유형 13) — 셋을 다 낸다. */
      fixed_over: Object.fromEntries([0.1, 0.2, 0.5].map(c =>
        [`over_${c}`, A.worst.filter(v => v > c).length])),
      fixed_over_0_2: A.over02,
      fixed_wrong_rate: rate(A.over02, A.worst.length),
      /** **자동으로 놓였는데 크게 틀린 것** — 고치기 부담에 안 잡히는 집단이다(S-8b 잔여). */
      silent_wrong: A.silentWrong,
      silent_wrong_rate_of_placed: rate(A.silentWrong, A.autoPlaced),
    });

    const report = {
      spec: "S-10 (a) 고치기 부하. **§1의 왕복 횟수 지표** — 크면 도구가 성립하지 않는다.",
      constants: constantsSnapshot(),
      why: (
        "D-S22가 돌린 시점의 배치율을 0.25~0.46으로 떨어뜨렸다. 안 놓인 획은 `고치기`로 가는데 "
        + "**그 부담을 재지 않았다.** 부담이 크면 '조용히 틀리게 놓지 않는다'는 선택이 "
        + "도구를 못 쓰게 만든 것이 된다."
      ),
      op_model: {
        select: 1, candidate_click: "끝마다 1(양 끝이면 2)", depth_slider: 1,
        go_to_view: "돌린 시점 획인데 지금 그 시점이 아니면 1 — **이 시나리오에서는 0이다**"
          + "(그 시점에서 바로 고친다). 시점을 옮겨 다니면 그만큼 는다.",
        note: "앱의 `refreshCandidates` → `editClick` → `applyPicks` 경로와 같다. 후보 반경도 같다.",
      },
      user_models: Object.fromEntries(USERS.map(u => [u.key, u.what])),
      metrics: {
        ops_per_drawn_stroke: "**핵심 지표.** 그린 획 하나당 추가 조작 수. 0이면 손댈 것이 없다.",
        fixed_wrong_rate: "손으로 붙인 것 중 참값에서 상자 대각의 0.2를 넘게 떨어진 비율. "
          + "**사용자가 고른 앵커에는 검사를 안 걸므로**(D-S18) 이것이 그 대가다.",
        silent_wrong_rate_of_placed: "자동으로 놓였는데 크게 틀린 비율 — **고치기로 오지 않는다**. "
          + "사용자가 알아채야 고칠 수 있다(S-8b 잔여, D-S22).",
      },
      condition: {
        composition: "요 35°·피치 15° 3점, 직육면체 하나", grade: "medium", skew: 0.12,
        end_jitter: END_JITTER, elev_deg: 18, orbit_deg: ANGLES, seeds: SEEDS, boxes_per_cell: 30,
        first_view_opts: "FIRST_VIEW_OPTS", view_opts: "VIEW_OPTS + VIEW_AXIS_CFG(출하 구성)",
        strokes_per_scene: {
          first_view: "직육면체 모서리 **12획**(사선 없음)",
          rotated_view: "**면 대각선 2 + 뒤 모서리 1 = 3획**",
          warning: "**두 셀의 획 구성이 다르다** — 시점만 다른 것이 아니다(`rotated_view_by_kind` 참조).",
        },
        ops_not_counted: [
          "어느 획이 안 놓였는지 **찾는** 조작(목록을 훑는 것)",
          "붙인 뒤 **확인**하는 조작 — 25~49%가 크게 틀리는데 화면에 경고가 없다",
          "잘못 골랐을 때 **되돌리기**",
          "**조용히 틀린 자동 배치**를 찾아 고치는 조작(`ops_per_drawn_with_silent_fix`가 그 추정)",
          "`depth_slider`는 이 표본에서 **한 번도 발화하지 않았다**(`ops_dist.max`가 전부 3)",
        ],
        single_composition_warning: "구도가 하나뿐이다. 실획에서 다시 본다(AS-13).",
        end_jitter_warning: "끝점 겨냥 오차 1%는 **이 방식이 성립한다고 주장하는 구간**이고 "
          + "손에 있는 실획 자릿수(2.8~5.1%)는 그 밖이다(AS-12). 부담은 그쪽에서 더 커진다.",
      },
      first_view: Object.fromEntries(USERS.map(u => [u.key, view1(first[u.key])])),
      rotated_view: Object.fromEntries(ANGLES.map(d => [String(d),
        Object.fromEntries(USERS.map(u => [u.key, view1(view[u.key][d])]))])),
      /**
       * **획 종류로 가른 값**(리뷰어 4). 첫 시점 셀은 **모서리 12획뿐**이고 돌린 시점 셀은
       * **사선 2 + 모서리 1**이다 — 종류를 안 가르면 "시점 차이"가 사실은 "획 종류 차이"일 수 있다.
       */
      rotated_view_by_kind: Object.fromEntries(ANGLES.map(d => [String(d),
        Object.fromEntries(USERS.map(u => [u.key, {
          diagonal: view1(viewByKind[u.key][d].diag),
          edge: view1(viewByKind[u.key][d].edge),
        }]))])),
      /**
       * **후보 반경을 넓히면 옳은 앵커가 목록에 들어오는가**(PROTOTYPE 1.2). `oracle`로 고른다 —
       * 재는 것이 "고르는 능력"이 아니라 **목록 안에 답이 있는가**이기 때문이다.
       * 대가는 `candidates_seen`(사용자가 봐야 하는 점의 수)이다.
       */
      candidate_radius_sweep: Object.fromEntries(RADIUS_MULTS.map(m => {
        const R = radiusArm[m];
        return [`mult_${m}`, {
          n_fixed: R.n,
          wrong_rate: R.worst.length ? +(R.over02 / R.worst.length).toFixed(4) : null,
          worst_end: stat(R.worst, 4),
          no_candidate_rate: R.n ? +(R.noCand / R.n).toFixed(4) : null,
          candidates_seen: stat(R.seen, 2),
          /** **틀린 고치기의 원인을 가른다** — 앵커로 쓴 획이 애초에 틀려 있었는가. */
          anchor_stroke_wrong: m === PLACE_TOL.fix_candidate_radius_mult ? R.anchorBad : null,
          wrong_because_anchor_wrong: m === PLACE_TOL.fix_candidate_radius_mult ? R.anchorBadAndWrong : null,
          wrong_though_anchor_ok: m === PLACE_TOL.fix_candidate_radius_mult ? R.anchorGoodButWrong : null,
          note: m === PLACE_TOL.fix_candidate_radius_mult ? "**지금 값**" : "후보",
        }];
      })),
      /**
       * **손으로 하나 붙인 뒤 자동 배치를 다시 돌리면** 다른 획이 공짜로 놓이는가.
       * **앱은 지금 그것을 안 한다**(`applyPicks`가 `settle`을 부르지 않는다) — 만약 크면
       * 코드 한 줄로 부하가 준다. 사용자 모형은 `nearest`(실제로 UI가 먼저 보여 주는 것)다.
       */
      fix_then_settle: {
        scenes: cascade.scenes, strokes: cascade.strokes,
        hand_fixed: cascade.fixed,
        free_placements_after_settle: cascade.freeAdds,
        /** **공짜로 놓인 것이 맞는가.** 부담이 줄어도 조용히 틀린 배치가 늘면 안 된다(A-3). */
        free_placement_error: stat(cascade.freeErr, 4),
        free_placement_wrong: cascade.freeWrong,
        free_placement_wrong_rate: cascade.freeErr.length
          ? +(cascade.freeWrong / cascade.freeErr.length).toFixed(4) : null,
        free_per_hand_fix: cascade.fixed ? +(cascade.freeAdds / cascade.fixed).toFixed(4) : null,
        ops_total: cascade.ops,
        ops_per_drawn_stroke: cascade.strokes ? +(cascade.ops / cascade.strokes).toFixed(4) : null,
        note: "같은 장면의 비연쇄 값은 `first_view.nearest.ops_per_drawn_stroke`다 — 둘의 차가 이득이다.",
      },
      reference_frame: (
        "**손 모델링과의 비교는 측정하지 않았다**(대조 실험이 없다). 다만 자릿수는 이렇게 읽는다 — "
        + "CAD에서 모서리 하나를 놓으려면 최소 두 번(시작·끝)의 스냅 클릭이 필요하고, 여기서는 "
        + "**그린 획 하나당 위 `ops_per_drawn_stroke`만큼만** 추가된다. 그 값이 2에 가까워지면 "
        + "이 도구의 이점이 사라진다고 본다."
      ),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "fix_load.json"), JSON.stringify(report, null, 2), "utf-8");

    // 측정이 실제로 돌았는가 — 미배치가 0이면 이 원장은 아무 말도 하지 않는다
    expect(view.nearest[45].drawn).toBeGreaterThan(20);
    expect(view.nearest[45].unplaced + first.nearest.unplaced).toBeGreaterThan(0);
  }, 600_000);
});
