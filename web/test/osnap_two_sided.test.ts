// **오스냅 반경 — 붙어야 할 곳과 붙지 말아야 할 곳을 함께 잰다**(2026-08-18 9차 항목 2).
// 산출: `stage0/out/osnap_two_sided.json`.
//
// ## 왜 새 픽스처인가 — **기존 스윕이 다른 양을 쟀다**
//
// 지시 그대로: *"합성 스윕은 '붙어야 할 곳에 붙는가'를 잰다. 픽스처의 모든 획이 기존
// 기하에 연결되도록 설계돼 있으면 반경이 클수록 좋아지는 것이 당연하다. 사용자 불만은
// 반대다 — '안 붙어야 할 곳에 붙는다.'"*
//
// `boxLattice`는 **상자 하나의 12모서리**이고 모두 서로 이어져 있다. 그 픽스처에서 반경을
// 넓히면 놓친 연결만 줄어들고 **잘못된 연결은 만들 수가 없다** — 측정이 반경을 편들도록
// 설계돼 있는 것이다(AS-L24·L25와 같은 계열, 방향만 반대다).
//
// 그래서 **연결 의도가 없는 획을 넣는다**: 기존 기하에서 떨어진 곳에 **두 번째 덩어리**를
// 그린다. 그 덩어리의 획은 **첫 덩어리의 어느 점에도 붙으면 안 된다.**
//
// ## 두 지표(지시 2-c)
//
//   `missed`  — **붙어야 하는데 안 붙음**: 같은 덩어리 안에서 참 정점을 겨냥했는데 안 걸렸다
//   `wrong`   — **안 붙어야 하는데 붙음**: 다른 덩어리(또는 무관한 점)에 걸렸다
//
// 둘을 **같은 반경 축 위에** 놓는 것이 이 원장의 존재 이유다. 하나만 재면 반경은
// 언제나 큰 쪽이 이긴다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md` 9차 항목 2 착수 표에 있다.
// 특히 **#12**(반경을 하나 안 고른다) · **#11**(두 지표의 분모가 다르다 — 갈라 적는다) ·
// **#20**(거름을 선택 전에 걸지 않는다) · **#30**(양성 채널 = 떨어진 덩어리) ·
// **#26**(사전 등록) · **#5**(참 정점 겨냥은 픽스처가 만든 것이지 측정이 아니다).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type Pt2 } from "../src/s3d/camera.js";
import { resolve2dCore } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, projectWarped, round, median, quantile,
         type Scene, type TrueEdge } from "./scene3d.js";
import { fraction, rate, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `order_lock`·`classify_leak`·`snap_stage`와 **같은 다섯 구도**(#27). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];
/** **반경을 하나 안 고른다**(#12). 앱의 슬라이더 범위(4~40)를 덮는다. */
const RADII = [4, 6, 8, 10, 12, 15, 20, 25, 30, 40];

/**
 * **떨어진 두 번째 덩어리의 화면 오프셋**(지시 2-a). 두 덩어리가 **화면에서 안 겹치도록**
 * 충분히 떼되 캔버스 안에 있어야 한다. 겹치면 "안 붙어야 한다"의 판정이 흐려진다.
 */
const FAR_OFFSET: Pt2 = [330, -60];

/**
 * **구도별 보정 오프셋**(2026-08-18 11차 항목 3-a). 고정 오프셋 하나(`FAR_OFFSET`)는
 * 구도마다 **다른 화면 간격**을 만든다 — 3점 구도에서는 두 덩어리가 40~60px로 가깝고
 * 1점·2점에서는 훨씬 멀어서, **반경 40px에서도 잘못된 연결이 원리적으로 안 난다**
 * (`by_composition`의 `reachable_any_radius: false` 둘). 그 구도에서 `wrong = 0`은
 * "반경이 안전하다"가 아니라 **이 픽스처가 그 층에서 대상을 못 만든 것**이다(#35·#40 ③).
 *
 * 보정 팔은 오프셋을 구도마다 줄여 **참 정점 사이 최소 간격을 40px 바로 위**로 맞춘다 —
 * 그러면 반경 축이 그 간격을 실제로 넘나들 수 있다. 본 팔은 그대로 두고(인용된 값이라
 * 움직이지 않는다) **팔을 더한다**(#30 — 같은 실행 안의 대조).
 */
const CALIB_SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15];

const REGISTERED =
  "① **두 지표가 반대로 움직인다**: 반경을 넓히면 `missed`(붙어야 하는데 안 붙음)가 **줄고** "
  + "`wrong`(안 붙어야 하는데 붙음)이 **는다**. 둘 중 하나라도 반경에 대해 **단조가 아니면** "
  + "이 픽스처는 반경을 못 정한다(그때는 그 사실을 적고 반경을 안 바꾼다). "
  + "② **`wrong`이 0이 아닌 반경이 존재한다**: 어떤 반경에서도 `wrong`이 0이면 "
  + "**이 픽스처가 '안 붙어야 할 곳'을 못 만든 것**이고(#35 — 대상이 도달 불가), "
  + "그러면 이 원장은 8차의 스윕과 같은 편향을 반복한다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 4 × 반경 10 = 2400실행이고 "
  + "**두 지표의 분모가 다르다**(#11): `missed`의 분모는 **같은 덩어리 안에서 참 정점을 "
  + "겨냥한 끝점**, `wrong`의 분모는 **겨냥이 없는 끝점 전부**다. "
  + "**[11차 항목 3-a 추가 등록]** ③ **도달 가능성을 구도별로 본다**(#40 ③ 모집단 불일치): "
  + "본 팔의 합계가 0이 아니어도 **1점·2점 구도가 어떤 반경에서도 0**이면 그 층의 결론은 "
  + "픽스처가 만든 것이다. **보정 팔**(`by_composition_calibrated`)이 구도마다 오프셋을 "
  + "줄여 참 정점 간격을 40px 바로 위로 맞추고, **다섯 구도 전부에서 `wrong`이 도달 "
  + "가능한지**를 낸다. 도달 불가 구도가 남으면 그 사실을 원장이 든다. "
  + "⚠ 이것은 이 항목이 등록한 게이트다(#41).";

/** 한 획의 끝 하나에 대한 판정. */
interface EndRow {
  comp: string; jitter: number; grade: InkGrade; seed: number; radius: number;
  which: "start" | "end";
  /** 이 끝이 **같은 덩어리의 참 정점**을 겨냥했는가(픽스처가 아는 사실). */
  intended: boolean;
  /** 겨냥한 참 정점까지의 화면 거리(px). `intended`일 때만 유효. */
  aimPx: number | null;
  /** 스냅이 걸렸는가. */
  engaged: boolean;
  /** 걸린 자리가 **다른 덩어리**의 후보였는가(= 잘못된 연결). */
  wrong: boolean;
  /** 걸린 자리가 겨냥한 참 정점과 같은가(= 옳은 연결). */
  right: boolean;
}

interface Fx {
  segsA: Snap2Seg[];          // 첫 덩어리(이미 그려진 것 — 후보의 출처)
  vertsA: Pt2[];              // 첫 덩어리의 참 정점(화면)
  vertsB: Pt2[];              // 둘째 덩어리의 참 정점(화면)
  strokesB: { a: Pt2; b: Pt2; aimA: Pt2 | null; aimB: Pt2 | null }[];
}

/** 참 정점(모서리 끝점)을 화면으로 투영해 **중복을 합친다**. */
function trueVerts(sc: Scene, edges: TrueEdge[]): Pt2[] {
  const out: Pt2[] = [];
  for (const e of edges) for (const v of [e.a, e.b]) {
    const q = projectWarped(v, sc, 0, 0);
    if (!q) continue;
    if (!out.some(o => Math.hypot(o[0] - q[0], o[1] - q[1]) < 1e-6)) out.push(q);
  }
  return out;
}

const near = (p: Pt2, list: Pt2[]): { at: Pt2; d: number } | null => {
  let best: { at: Pt2; d: number } | null = null;
  for (const q of list) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = { at: q, d };
  }
  return best;
};

describe("osnap_two_sided — 반경의 두 방향", () => {
  it("놓친 연결과 잘못된 연결을 같은 축 위에 낸다", () => {
    const rows: EndRow[] = [];
    /** 둘째 덩어리가 첫 덩어리와 화면에서 겹치는 실행 — 판정이 흐려지므로 뺀다(#11) */
    let overlapDropped = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const C = COMPOSITIONS[ci];
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      const O = groundPoint(sc, C.origin);
      const O2 = groundPoint(sc, [C.origin[0] + FAR_OFFSET[0], C.origin[1] + FAR_OFFSET[1]]);
      if (!O || !O2) continue;
      const edgesA = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
      const edgesB = boxLattice(sc, O2, C.box[0], C.box[1], C.box[2], 1);
      const vertsA = trueVerts(sc, edgesA), vertsB = trueVerts(sc, edgesB);
      // **두 덩어리가 화면에서 떨어져 있어야 한다** — 안 그러면 "안 붙어야 한다"가 흐려진다
      let minCross = Infinity;
      for (const p of vertsA) for (const q of vertsB)
        minCross = Math.min(minCross, Math.hypot(p[0] - q[0], p[1] - q[1]));
      if (!(minCross > 40)) { overlapDropped += 1; continue; }

      for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS) {
        const rng = rng32(seed * 7919 + ci * 131 + 1);
        const dA = drawEdges(sc, edgesA, grade, rng, 0.12, jit, 0);
        const dB = drawEdges(sc, edgesB, grade, rng, 0.12, jit, 0);
        if (!dA || !dB) continue;
        // 첫 덩어리는 **이미 그려진 것**이다 — 후보의 출처가 된다
        const segsA: Snap2Seg[] = dA.map((e, i) => ({ id: `a${i}`, a: e.a2d, b: e.b2d }));
        for (const radius of RADII) {
          const cands = static2dCandidates(segsA, Math.hypot(SZ[0], SZ[1]));
          for (let i = 0; i < dB.length; i++) {
            const e = dB[i];
            const raw = e.pts2d as Pt2[];
            const r = resolve2dCore(raw, { cands, vps: [], radiusPx: radius,
                                           relSnap: false, segs: segsA });
            const a0 = raw[0], b0 = raw[raw.length - 1];
            for (const which of ["start", "end"] as const) {
              const q = which === "start" ? a0 : b0;
              const got = which === "start" ? r.start2 : r.end2;
              // **둘째 덩어리 안의 참 정점을 겨냥했는가** — 픽스처가 아는 사실이다.
              // ⚠ 후보는 **첫 덩어리에서만** 나오므로 이 겨냥은 **절대 붙을 수 없다**.
              // 즉 여기서 `intended`는 "붙어야 할 곳"이 아니라 **연결 의도**의 표시이고,
              // 붙으면 그것이 곧 `wrong`이다(지시 2-a의 "연결 의도가 없는 획").
              const nb = near(q, vertsB);
              const na = near(q, vertsA);
              const intended = !!nb && nb.d <= 12;
              rows.push({
                comp: C.name, jitter: jit, grade, seed, radius, which,
                intended, aimPx: nb ? round(nb.d, 4) : null,
                engaged: !!got,
                // **걸렸으면 전부 잘못된 연결이다** — 후보가 첫 덩어리뿐이기 때문이다
                wrong: !!got,
                right: false,
              });
              void na;
            }
          }
        }
      }
    }

    // ---- **보정 팔**(11차 항목 3-a) — 구도마다 오프셋을 줄여 참 정점 최소 간격을
    //      40px 바로 위로 맞춘다. 본 팔은 안 건드린다(인용된 값이 움직이지 않게).
    const rowsC: EndRow[] = [];
    /** 구도별 보정 결과 — 무엇을 골랐고 그때 간격이 얼마인가(원장이 든다). */
    const calib: Record<string, { scale: number; min_cross_px: number | null;
                                  min_cand_px: number | null }> = {};

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const C = COMPOSITIONS[ci];
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      const O = groundPoint(sc, C.origin);
      if (!O) continue;
      const edgesA = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
      const vertsA = trueVerts(sc, edgesA);

      // **간격이 40px 바로 위가 되는 배율을 고른다** — 결정론적 훑기다(난수 없음).
      let pick: { scale: number; O2: [number, number, number]; minCross: number } | null = null;
      for (const sf of CALIB_SCALES) {
        const O2 = groundPoint(sc, [C.origin[0] + FAR_OFFSET[0] * sf,
                                    C.origin[1] + FAR_OFFSET[1] * sf]);
        if (!O2) continue;
        const edgesB = boxLattice(sc, O2, C.box[0], C.box[1], C.box[2], 1);
        const vertsB = trueVerts(sc, edgesB);
        let mc = Infinity;
        for (const p of vertsA) for (const q of vertsB)
          mc = Math.min(mc, Math.hypot(p[0] - q[0], p[1] - q[1]));
        if (!(mc > 40)) continue;
        if (!pick || mc < pick.minCross) pick = { scale: sf, O2, minCross: mc };
      }
      if (!pick) { calib[C.name] = { scale: 0, min_cross_px: null, min_cand_px: null }; continue; }

      const edgesB = boxLattice(sc, pick.O2, C.box[0], C.box[1], C.box[2], 1);
      // **후보까지의 최소 거리**도 낸다 — 참 정점 간격보다 이것이 `wrong`의 실제 문턱이다
      // (후보에는 중점·교차점·정점이 섞인다). 잡음 없는 기준 획으로 한 번만 잰다.
      let minCand: number | null = null;
      {
        const rng = rng32(ci * 131 + 1);
        const dA0 = drawEdges(sc, edgesA, "precise", rng, 0.12, 0, 0);
        const dB0 = drawEdges(sc, edgesB, "precise", rng, 0.12, 0, 0);
        if (dA0 && dB0) {
          const segs0: Snap2Seg[] = dA0.map((e, i) => ({ id: `a${i}`, a: e.a2d, b: e.b2d }));
          const cands0 = static2dCandidates(segs0, Math.hypot(SZ[0], SZ[1]));
          for (const e of dB0) {
            const raw = e.pts2d as Pt2[];
            for (const q of [raw[0], raw[raw.length - 1]] as Pt2[])
              for (const c of cands0) {
                const d = Math.hypot(c.at[0] - q[0], c.at[1] - q[1]);
                if (minCand == null || d < minCand) minCand = d;
              }
          }
        }
      }
      calib[C.name] = { scale: pick.scale, min_cross_px: round(pick.minCross, 4),
                        min_cand_px: minCand == null ? null : round(minCand, 4) };

      for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS) {
        const rng = rng32(seed * 7919 + ci * 131 + 1);
        const dA = drawEdges(sc, edgesA, grade, rng, 0.12, jit, 0);
        const dB = drawEdges(sc, edgesB, grade, rng, 0.12, jit, 0);
        if (!dA || !dB) continue;
        const segsA: Snap2Seg[] = dA.map((e, i) => ({ id: `a${i}`, a: e.a2d, b: e.b2d }));
        for (const radius of RADII) {
          const cands = static2dCandidates(segsA, Math.hypot(SZ[0], SZ[1]));
          for (const e of dB) {
            const raw = e.pts2d as Pt2[];
            const r = resolve2dCore(raw, { cands, vps: [], radiusPx: radius,
                                           relSnap: false, segs: segsA });
            const a0 = raw[0], b0 = raw[raw.length - 1];
            for (const which of ["start", "end"] as const) {
              const got = which === "start" ? r.start2 : r.end2;
              rowsC.push({
                comp: C.name, jitter: jit, grade, seed, radius, which,
                intended: false, aimPx: null,
                engaged: !!got, wrong: !!got, right: false,
              });
            }
          }
        }
      }
    }

    expect(rows.length).toBeGreaterThan(1000);

    // ---- **붙어야 할 곳** 팔: 같은 덩어리 안에서 이어 긋는다(8차 스윕과 같은 조건).
    //      두 팔의 분모가 다르므로 **갈라 낸다**(#11).
    const connRows: { radius: number; hit: boolean; aimPx: number }[] = [];
    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      const C = COMPOSITIONS[ci];
      const sc = scene(C.yaw, C.pitch, 1000, SZ);
      const O = groundPoint(sc, C.origin);
      if (!O) continue;
      const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
      for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS) {
        const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
        if (!drawn) continue;
        for (const radius of RADII) {
          const segs: Snap2Seg[] = [];
          for (const e of drawn) {
            const raw = e.pts2d as Pt2[];
            const cands = segs.length ? static2dCandidates(segs, Math.hypot(SZ[0], SZ[1])) : [];
            const r = resolve2dCore(raw, { cands, vps: [], radiusPx: radius,
                                           relSnap: false, segs });
            // **겨냥한 것은 이미 그린 획의 끝점 중 최근접**이다(그 획들과 이어 그리는 상황)
            const prevEnds: Pt2[] = segs.flatMap(sg => [sg.a, sg.b]);
            const nb = near(raw[0], prevEnds);
            if (nb && nb.d <= 40) connRows.push({ radius, hit: !!r.start2, aimPx: round(nb.d, 4)! });
            segs.push({ id: `s${segs.length}`, a: r.a, b: r.b });
          }
        }
      }
    }

    const sweep = RADII.map(R => {
      const far = rows.filter(r => r.radius === R);
      const conn = connRows.filter(r => r.radius === R);
      const wrong = far.filter(r => r.wrong).length;
      const missed = conn.filter(r => !r.hit).length;
      return {
        radius_px: R,
        // **잘못된 연결** — 분모는 **떨어진 덩어리의 끝 전부**다
        wrong: fraction(wrong, far.length), wrong_rate: rate(wrong, far.length),
        // **놓친 연결** — 분모는 **40px 안에 이을 대상이 있던 시작점**이다(다른 분모다, #11)
        missed: fraction(missed, conn.length), missed_rate: rate(missed, conn.length),
        connected: fraction(conn.length - missed, conn.length),
      };
    });

    // ⚠⚠ **반경 15 한 점만 내면 결론 층의 도달 가능성이 안 보인다**(9-R″ [3] · #35·#40 ②③):
    // "1점·2점에서 15의 잘못된 연결이 0"이 **어떤 반경에서도 0**이면 그것은
    // "반경이 안전하다"가 아니라 **이 픽스처가 그 층에서 대상을 못 만든 것**이다.
    // 그래서 **구도 × 반경 전부**를 낸다.
    const byComp = Object.fromEntries(COMPOSITIONS.map(C => {
      const all = rows.filter(r => r.comp === C.name);
      const at15 = all.filter(r => r.radius === 15);
      const byR = Object.fromEntries(RADII.map(R => {
        const f = all.filter(r => r.radius === R);
        return [`r${R}`, fraction(f.filter(r => r.wrong).length, f.length)];
      }));
      return [C.name, {
        n: at15.length, wrong: fraction(at15.filter(r => r.wrong).length, at15.length),
        by_radius: byR,
        // **이 구도에서 잘못된 연결이 한 번이라도 나는가** — 아니오면 결론이 이 층에
        // 기댈 수 없다(#35: 기준을 못 넘은 것이 신호의 성질인지 픽스처의 성질인지)
        reachable_any_radius: all.some(r => r.wrong),
        max_wrong_at: RADII.reduce((best, R) => {
          const k = all.filter(r => r.radius === R && r.wrong).length;
          return k > best.k ? { r: R, k } : best;
        }, { r: 0, k: 0 }),
      }];
    }));

    const byCompCal = Object.fromEntries(COMPOSITIONS.map(C => {
      const all = rowsC.filter(r => r.comp === C.name);
      const byR = Object.fromEntries(RADII.map(R => {
        const f = all.filter(r => r.radius === R);
        return [`r${R}`, fraction(f.filter(r => r.wrong).length, f.length)];
      }));
      return [C.name, {
        n: all.length,
        offset_scale: calib[C.name]?.scale ?? null,
        min_cross_px: calib[C.name]?.min_cross_px ?? null,
        min_cand_px: calib[C.name]?.min_cand_px ?? null,
        by_radius: byR,
        reachable_any_radius: all.some(r => r.wrong),
        max_wrong_at: RADII.reduce((best, R) => {
          const k = all.filter(r => r.radius === R && r.wrong).length;
          return k > best.k ? { r: R, k } : best;
        }, { r: 0, k: 0 }),
      }];
    }));
    /** 보정 팔에서도 대상을 못 만든 구도(있으면 원장이 이름으로 든다 — 숨기지 않는다). */
    const calUnreachable = COMPOSITIONS.map(C => C.name)
      .filter(n => (byCompCal[n] as { n: number; reachable_any_radius: boolean }).n > 0
                && !(byCompCal[n] as { reachable_any_radius: boolean }).reachable_any_radius);

    const aimAll = connRows.filter(r => r.radius === RADII[0]).map(r => r.aimPx);

    const out = {
      what: "**반경의 두 방향을 같은 축 위에 낸다**(9차 항목 2). 8차까지의 스윕은 "
          + "**모든 획이 이어지는 픽스처**에서 '붙는가'만 재서 반경이 클수록 좋아졌다 — "
          + "사용자 불만(**안 붙어야 할 곳에 붙는다**)은 그 스윕이 만들 수 없는 경우다.",
      population: { compositions: COMPOSITIONS.length, jitters: JITTERS, grades: GRADES,
                    seeds: SEEDS, radii: RADII,
                    far_ends: rows.length, conn_starts: connRows.length,
                    overlap_dropped_compositions: overlapDropped },
      fixture: {
        far_offset_px: FAR_OFFSET,
        min_cross_px_min: 40,
        note: "**둘째 덩어리는 첫 덩어리에서 화면으로 떨어져 있다**(참 정점 사이 최소 40px). "
            + "후보는 **첫 덩어리에서만** 나오므로 둘째 덩어리의 끝이 스냅에 걸리면 "
            + "그것은 **정의상 잘못된 연결**이다 — 그리는 사람은 새 덩어리를 시작한 것이다.",
      },
      sweep,
      by_composition: byComp,
      by_composition_calibrated: byCompCal,
      calibrated_unreachable_compositions: calUnreachable,
      selfcheck_notes: {
        "sweep[9].missed_rate = 0": "**정상이고 뜻이 있다** — 반경 40px은 이 픽스처의 "
          + "겨냥 거리 분포(p90 26.95px)를 통째로 덮어서 놓친 연결이 하나도 안 남는다. "
          + "**측정 미작동이 아니라 반경이 분포를 넘어선 것**이고, 같은 행의 `wrong` 536/4608이 "
          + "그 대가를 낸다(#5 — 0의 출처를 원장에 적는다).",
        "by_composition_calibrated.*.by_radius 값의 크기": "**픽스처가 정한 인접도의 "
          + "귀결이다**(#46 · #5) — 보정이 두 덩어리를 배제선(40px) 바로 위까지 붙이므로 "
          + "이 팔은 **최악 인접**의 값이고 전형적 사용의 비율이 아니다. 이 팔이 싣는 정보는 "
          + "① **도달 가능성**(다섯 구도 전부 `wrong`이 난다 — 본 팔에서 1점·2점이 0이던 것이 "
          + "픽스처 탓임을 보인다) ② **반경에 대한 단조성**(다섯 구도 전부에서 반경과 함께 "
          + "늘어난다) ③ **구도 간 순서**(같은 인접도에서 1점이 3점보다 이르게 샌다)다. "
          + "크기를 반경 결정의 근거로 인용하지 않는다.",
        "by_composition.3pt_yaw35_pitch15.n = 0": "**판정 전에 뺐다**(#20). 그 구도는 "
          + "두 덩어리의 참 정점이 화면에서 40px 안으로 겹쳐 '안 붙어야 한다'가 흐려진다. "
          + "뺀 수는 `population.overlap_dropped_compositions`에 있다 — **뺄셈으로 만든 "
          + "집합이 아니라 직접 센 것**이다(#10).",
      },
      aim_px_when_connecting: {
        n: aimAll.length, p10: round(quantile(aimAll, 0.1)), median: round(median(aimAll)),
        p90: round(quantile(aimAll, 0.9)),
        note: "**이을 때의 겨냥 거리** — 반경이 이 분포의 어디를 덮는지가 `missed`를 정한다.",
      },
      what_this_does_not_say: [
        "**실획이 아니다**(AS-L24·L25). 합성 잉크의 끝점 지터 분포가 실제 손과 다르면 두 곡선의 교차점도 다르다.",
        "**`wrong`의 정의가 픽스처에 기댄다**(#5) — '떨어진 덩어리에 붙으면 틀렸다'는 이 픽스처가 만든 규약이다. 실제로는 사용자가 두 덩어리를 잇고 싶을 수도 있다.",
        "**관계 스냅(`alignAxes`)을 껐다** — 반경 하나만 보기 위해서다. 켠 상태의 거동은 `snap_stage`·`rel_snap_flow`가 따로 낸다.",
        "**3D 오스냅을 안 잰다** — 확정 전(2D 단계)뿐이다. 3D 판의 반경 거동은 `snap.json`이 낸다.",
        "**이 원장이 '잘못된 연결'의 유일한 측정이 아니다**(11차 항목 3-b): `snap.json`의 "
          + "`unintended_snap`이 **먼저** 같은 쪽을 재고 있었다 — 캔버스 균등 난수 24점/픽스처에서 "
          + "스냅이 끼어드는 비율이고, 반경 축(비율 0.008~0.280)에서 단조 증가하며 **0인 칸이 "
          + "없다**(밀도 k1~k3 전부). 즉 도달 가능성 결함은 이 픽스처의 것이지 '측정이 없었다'가 "
          + "아니다. 두 지표는 **질의 분포가 다르다**: `unintended_snap`은 화면 전역 난수, "
          + "이 원장은 **사람이 실제로 새 덩어리를 시작할 자리**(떨어진 상자의 모서리)다.",
        "**보정 팔의 오프셋 배율은 구도마다 다르다**(0.2~0.8) — 그러므로 구도 간 크기 비교는 "
          + "같은 인접도에서의 비교이지 같은 손짓에서의 비교가 아니다(#24).",
      ],
      gate: gate({
        registered: REGISTERED,
        reachability: "**이 픽스처가 '안 붙어야 할 곳'을 실제로 만드는가**가 도달 가능성이다"
          + "(#35). 어떤 반경에서도 `wrong`이 0이면 그것은 반경이 안전하다는 뜻이 아니라 "
          + "**픽스처가 그 경우를 못 만든 것**이고, 그러면 이 원장은 8차 스윕과 같은 편향을 "
          + "반복한다. 가장 큰 반경(40px)의 `wrong` 수가 그 판정값이다. "
          + "**[11차 항목 3-a]** 그 합계는 **3점 구도 둘이 혼자 만든다** — 본 팔의 1점·2점은 "
          + "어떤 반경에서도 0이라 합계 도달 가능성이 그 층의 도달 불가를 덮고 있었다(#40 ③). "
          + "그래서 **보정 팔의 최약 구도 값**을 함께 든다: 다섯 구도 각각의 최대 `wrong` 중 "
          + "**가장 작은 것**(`calibrated_min_reachable_n`)이 0이면 게이트 ③이 깨진다.",
        reachability_value: rows.filter(r => r.radius === 40 && r.wrong).length,
        reachability_source: "wrong_at_40_n",
      }),
      wrong_at_40_n: rows.filter(r => r.radius === 40 && r.wrong).length,
      /** 보정 팔의 **최약 구도** 도달값(#40 ③ — 합계가 층의 0을 덮지 못하게 한다). */
      calibrated_min_reachable_n: Math.min(...COMPOSITIONS.map(C =>
        (byCompCal[C.name] as { max_wrong_at: { k: number } }).max_wrong_at.k)),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "osnap_two_sided.json"), JSON.stringify(out, null, 2), "utf8");
    expect(connRows.length).toBeGreaterThan(100);
    // **게이트 ③**(11차 항목 3-a): 보정 팔에서 다섯 구도 전부 `wrong`이 도달 가능해야 한다.
    // 깨지면 픽스처가 다시 그 층의 대상을 못 만드는 것이고, 그때는 결론이 아니라
    // **픽스처의 성질**을 읽고 있는 것이다(#35·#40 ③).
    expect(calUnreachable).toEqual([]);
  }, 300_000);
});
