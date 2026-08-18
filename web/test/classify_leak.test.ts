// **`classifyLine`의 4°가 무엇을 먹는가**(2026-08-18 8차 3차 지시 항목 0-a).
// 산출: `stage0/out/classify_leak.json`.
//
// ## 왜 새 하네스인가
//
// `order_lock.json`의 `truth_events`가 **귀결**(깊이 획이 `support`·`screen_axis`로 샌다)을
// 세지만, **왜 새는지**를 못 가른다 — 새는 획의 화면 각이 임계 안인지, 손떨림이 밀어 넣은
// 것인지, 아니면 애초에 기하가 그렇게 얕은지가 그 원장에 없다. 여기가 그 자리다:
// **`classifyLine` 하나만** 참 축 라벨과 대조한다(상태 전이 없음 — 판정만).
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 9차 항목 0 착수 표에 있다.
// 여기서 특히: **#12**(임계를 스윕한다) · **#11**(분모는 참 축이 깊이인 획 전부) ·
// **#14**(시드 여섯 · 분자/분모) · **#16**(누수가 물음으로 옮겨간 것을 없어진 것으로
// 읽지 않는다 — `ambiguous`를 함께 낸다) · **#30**(양성 채널 = 참 각도 팔).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { classifyLine, RULE_TOL, type LineKind } from "../src/s3d/vpRules.js";
import { representative } from "../src/s3d/axis.js";
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, projectWarped, round, median, quantile,
         type DrawnEdge } from "./scene3d.js";
import { fraction, rate, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `order_lock`과 **같은 다섯 구도**다(#27 — 대역을 다른 픽스처에서 안 가져온다). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0, 0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];

/** **사전 등록**(#26). 이 항목이 등록한 게이트이고 CLAUDE.md §2의 중단 조건이 아니다(#41). */
const REGISTERED =
  "① **참 각도 팔이 누수를 만들지 않는다**: 손떨림·잉크가 없는 참 투영선(`true_angle_arm`)에서 "
  + "참 축이 깊이인 획이 화면 축으로 읽히는 수가 **깊이 획의 5% 미만**이다. "
  + "이 팔이 크게 새면 누수의 원인은 임계가 아니라 **기하 자체**이고 임계를 좁혀도 안 준다. "
  + "② **임계 스윕이 단조롭다**: `screen_axis_deg`를 좁히면 깊이 누수(`leak`)가 **줄고** "
  + "화면 획의 미검출(`screen_missed` = 참 축이 화면인데 `depth`·`ambiguous`로 읽힘)이 **는다**. "
  + "두 곡선이 갈리는 자리가 있어야 임계를 고를 수 있다 — 없으면 임계로 못 가른다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 {0,0.005,0.01,0.03,0.05} = 300픽스처 × 12획 = 3600획이고 "
  + "**분모는 참 축이 깊이인 획 전부**다(#11). ⚠ 이것은 이 항목이 등록한 게이트다(#41).";

interface Row {
  comp: string; jitter: number; grade: InkGrade; seed: number;
  truth: "screen" | "depth";
  /** 그린 획(잉크+지터)의 화면 각 — `min(toH, toV)` */
  near: number;
  /** **참 투영선**의 화면 각(잉크·지터 없음). 양성 채널(#30) */
  nearTrue: number;
  /** 그린 획이 화면 수평 쪽인가 수직 쪽인가 */
  side: "h" | "v";
  /** 참 투영선이 화면 수평 쪽인가 수직 쪽인가 */
  sideTrue: "h" | "v";
  /**
   * **앱의 2D 오스냅을 지난 뒤**의 화면 각(#17 — 앱은 `resolve2dCore`를 먼저 돌린다).
   * `screenOrthoSnap`이 **같은 4°**로 끝점을 축 위로 옮기므로, 걸린 획은 정확히 0°/90°가
   * 되어 `classifyLine`이 **반드시** 화면 축을 낸다(`axisSnap.ts`의 주석 그대로).
   */
  nearSnap: number;
  /** 오스냅 뒤의 수평/수직 쪽 */
  sideSnap: "h" | "v";
  /** 화면 직교 스냅이 끝점을 옮겼는가 */
  orthoFired: boolean;
  /** 시작점 오스냅이 붙었는가 */
  startSnapped: boolean;
  /** 끝점 오스냅이 붙었는가 */
  endSnapped: boolean;
  /** 관계 스냅(`alignAxes` — 후보의 x·y에 성분을 맞춘다)이 몇 번 걸렸는가 */
  guides: number;
  /** 제거 실험 팔별 화면 각 */
  abl: Record<string, number>;
  /**
   * **참 소실점이 화면 중심에서 몇 대각 떨어져 있는가**(무한대면 `null`).
   *
   * ⚠⚠ **참 라벨이 과포함이다** — `isFiniteVp`의 `VP_INFINITE_RATIO`가 **50대각**이라
   * 6만 px 밖 소실점도 "깊이"로 세어진다. 그 획은 사람 눈에도 화면 평행이고
   * 화면 축으로 읽히는 것이 **오독이 아니다.** 그래서 거리로 나눠 센다(#11).
   */
  vpRatio: number | null;
}

function rowsOf(): Row[] {
  const out: Row[] = [];
  for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
    const C = COMPOSITIONS[ci];
    const sc = scene(C.yaw, C.pitch, 1000, SZ);
    const O = groundPoint(sc, C.origin);
    if (!O) continue;
    const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
    for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS) {
      const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
      if (!drawn) continue;
      // **앱과 같은 조건**(#17): 확정 전(P0)에는 소실점이 없으므로 `vps: []`이고,
      // 후보는 앞서 먹인 획들이다(`order_lock`의 `fedSegs`와 같은 근사).
      const fedSegs: Snap2Seg[] = [];
      const ablFed: Record<string, Snap2Seg[]> = {};
      for (const k of Object.keys(ABLATIONS)) ablFed[k] = [];
      const fxDiag = Math.hypot(SZ[0], SZ[1]);
      for (const e of drawn as DrawnEdge[]) {
        const rep = representative(e.pts2d as Pt2[]);
        if (!rep) continue;
        const v = classifyLine(rep.a, rep.b);
        const cands = fedSegs.length ? static2dCandidates(fedSegs, fxDiag) : [];
        const r2 = resolve2dCore(e.pts2d as Pt2[], { cands, vps: [],
                                                    radiusPx: OSNAP_RADIUS_PX, relSnap: true });
        const repS = representative(r2.pts);
        const vs = repS ? classifyLine(repS.a, repS.b) : v;
        if (repS) fedSegs.push({ id: `f${fedSegs.length}`, a: repS.a, b: repS.b });
        // **제거 실험**(ablation) — 어느 스냅이 각을 바꾸는가. 팔마다 후보 풀이 따로 쌓인다
        const abl: Record<string, number> = {};
        for (const [k, o] of Object.entries(ABLATIONS)) {
          const fs = ablFed[k];
          const cs = fs.length ? static2dCandidates(fs, fxDiag) : [];
          const rr = resolve2dCore(e.pts2d as Pt2[], { cands: cs, vps: [],
                                                      radiusPx: o.radiusPx, relSnap: o.relSnap,
                                                      kindFlipGuard: o.kindFlipGuard,
                                                      kinds: o.kinds });
          const rp = representative(rr.pts);
          const vv = rp ? classifyLine(rp.a, rp.b) : v;
          abl[k] = Math.min(vv.toH, vv.toV);
          if (rp) fs.push({ id: `f${fs.length}`, a: rp.a, b: rp.b });
        }
        const a0 = projectWarped(e.a, sc, 0, 0), b0 = projectWarped(e.b, sc, 0, 0);
        if (!a0 || !b0) continue;
        const t = classifyLine(a0, b0);
        const vp = sc.vps[e.axis];
        const vpRatio = (vp && Number.isFinite(vp[0]) && Number.isFinite(vp[1]))
          ? Math.hypot(vp[0] - SZ[0] / 2, vp[1] - SZ[1] / 2) / Math.hypot(SZ[0], SZ[1])
          : null;
        out.push({
          comp: C.name, jitter: jit, grade, seed,
          truth: isFiniteVp(sc.vps[e.axis], SZ) ? "depth" : "screen",
          near: Math.min(v.toH, v.toV), nearTrue: Math.min(t.toH, t.toV),
          side: v.toH <= v.toV ? "h" : "v",
          sideTrue: t.toH <= t.toV ? "h" : "v", vpRatio,
          nearSnap: Math.min(vs.toH, vs.toV), sideSnap: vs.toH <= vs.toV ? "h" : "v",
          orthoFired: !!r2.ortho,
          startSnapped: !!r2.start2, endSnapped: !!r2.end2, guides: r2.guides.length, abl,
        });
      }
    }
  }
  return out;
}

/** 임계 하나에서의 판정 — `classifyLine`과 **같은 식**이다(#17: 규칙을 다시 안 짠다). */
const kindAt = (near: number, side: "h" | "v", scr: number, dep: number): LineKind =>
  near <= scr ? (side === "h" ? "screen_h" : "screen_v")
  : near >= dep ? "depth" : "ambiguous";

const BANDS = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 20, 90];

/**
 * **제거 실험**(#39의 형태) — 2D 스냅 사슬의 어느 부분이 깊이 획의 각을 바꾸는가.
 * 하나씩 끄고 같은 것을 잰다. ⚠ 위약이 필요하다: **앱 기본과 같은 팔**(D-L85 이후
 * `r8_rel_on`)이 끈 것이 없는 팔이고, `osnap_arm`과 같은 값을 내야 실험이 성립한다.
 * ⚠ 팔 이름의 r15·r8은 **문자 그대로의 반경**이다(D-L85가 기본을 8로 내리며
 * `OSNAP_RADIUS_PX` 참조를 리터럴로 바꿨다 — 상수가 움직여도 팔 이름이 거짓말하지 않게).
 */
const ABLATIONS: Record<string, { radiusPx: number; relSnap: boolean;
                                  kindFlipGuard?: boolean;
                                  kinds?: Record<string, boolean> }> = {
  r15_rel_on:  { radiusPx: 15, relSnap: true },                // 옛 기본(D-L56)
  r15_rel_off: { radiusPx: 15, relSnap: false },
  r8_rel_on:   { radiusPx: 8, relSnap: true },                 // **위약(앱 그대로 — D-L85)**
  r8_rel_off:  { radiusPx: 8, relSnap: false },                // 관계 스냅만 끔
  r0_rel_off:  { radiusPx: 0, relSnap: false },                // 오스냅 전부 끔(= 화면 직교만)
  // **양성 채널**(#30) — 가드를 끈 팔이 곧 옛 거동이다(D-L78 이전)
  guard_off:   { radiusPx: OSNAP_RADIUS_PX, relSnap: true, kindFlipGuard: false },
};

describe("classify_leak — 4°가 무엇을 먹는가", () => {
  it("판정 × 참 축 · 임계 스윕", () => {
    const rows = rowsOf();
    expect(rows.length).toBeGreaterThan(3000);

    const depth = rows.filter(r => r.truth === "depth");
    const screen = rows.filter(r => r.truth === "screen");

    // ---- ① 각도 분포. **두 참 축이 어디에 있는가**가 임계를 고를 수 있는지를 정한다
    const hist = (xs: number[]) => {
      const h: Record<string, number> = {};
      for (let i = 0; i + 1 < BANDS.length; i++) {
        const lo = BANDS[i], hi = BANDS[i + 1];
        h[`${lo}-${hi}`] = xs.filter(x => x >= lo && x < hi).length;
      }
      return h;
    };
    const q = (xs: number[]) => ({
      n: xs.length, min: round(xs.length ? Math.min(...xs) : null),
      p10: round(quantile(xs, 0.1)), median: round(median(xs)),
      p90: round(quantile(xs, 0.9)), max: round(xs.length ? Math.max(...xs) : null),
    });

    // ---- ② 임계 스윕(#12 — 동작점을 하나 고르지 않는다)
    const SCR = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
    const sweep = SCR.map(scr => {
      const dep = Math.max(scr * 2, RULE_TOL.depth_min_deg);
      const cnt = (rs: Row[]) => {
        const c: Record<string, number> = { screen_h: 0, screen_v: 0, depth: 0, ambiguous: 0 };
        for (const r of rs) c[kindAt(r.near, r.side, scr, dep)] += 1;
        return c;
      };
      const d = cnt(depth), s = cnt(screen);
      const leak = d.screen_h + d.screen_v;
      const missed = s.depth + s.ambiguous;
      return {
        screen_axis_deg: scr, depth_min_deg: dep,
        // **분자/분모로 적는다**(#14)
        leak: fraction(leak, depth.length), leak_rate: rate(leak, depth.length),
        // ⚠ **#16 — 누수가 물음으로 옮겨간 것을 없어진 것으로 읽지 않는다**
        depth_ambiguous: fraction(d.ambiguous, depth.length),
        screen_missed: fraction(missed, screen.length), screen_missed_rate: rate(missed, screen.length),
        screen_ambiguous: fraction(s.ambiguous, screen.length),
        screen_as_depth: fraction(s.depth, screen.length),
      };
    });

    // ---- ③ **양성 채널**(#30) — 참 투영선(잉크·지터 없음)에서 같은 것을 잰다
    const trueArm = SCR.map(scr => {
      const dep = Math.max(scr * 2, RULE_TOL.depth_min_deg);
      let leak = 0, missed = 0;
      for (const r of depth) {
        const k = kindAt(r.nearTrue, r.sideTrue, scr, dep);
        if (k === "screen_h" || k === "screen_v") leak += 1;
      }
      for (const r of screen) {
        const k = kindAt(r.nearTrue, r.sideTrue, scr, dep);
        if (k === "depth" || k === "ambiguous") missed += 1;
      }
      return { screen_axis_deg: scr, leak_n: leak, leak: fraction(leak, depth.length),
               screen_missed: fraction(missed, screen.length) };
    });

    // ---- ④ 현행 4°에서 새는 획은 **기하가 얕은 것인가 손이 민 것인가**
    const leaked4 = depth.filter(r => r.near <= RULE_TOL.screen_axis_deg);
    const geomShallow = leaked4.filter(r => r.nearTrue <= RULE_TOL.screen_axis_deg).length;
    const byComp: Record<string, unknown> = {};
    for (const C of COMPOSITIONS) {
      const d = depth.filter(r => r.comp === C.name);
      const l = d.filter(r => r.near <= RULE_TOL.screen_axis_deg);
      byComp[C.name] = {
        leak: fraction(l.length, d.length),
        geom_shallow: fraction(l.filter(r => r.nearTrue <= RULE_TOL.screen_axis_deg).length, d.length),
        near_median: round(median(d.map(r => r.near))),
      };
    }
    const bySeed: Record<string, unknown> = {};
    for (const s of SEEDS) {
      const d = depth.filter(r => r.seed === s);
      bySeed[`seed_${s}`] = fraction(d.filter(r => r.near <= RULE_TOL.screen_axis_deg).length, d.length);
    }
    const byJitter: Record<string, unknown> = {};
    for (const j of JITTERS) {
      const d = depth.filter(r => r.jitter === j), sc2 = screen.filter(r => r.jitter === j);
      byJitter[`jit_${j}`] = {
        depth_leak: fraction(d.filter(r => r.near <= RULE_TOL.screen_axis_deg).length, d.length),
        screen_near_p90: round(quantile(sc2.map(r => r.near), 0.9)),
        screen_near_max: round(sc2.length ? Math.max(...sc2.map(r => r.near)) : null),
      };
    }

    // ---- ⑤ **참 라벨을 소실점 거리로 나눈다**(#11 — 분모가 무엇인지 먼저 본다).
    // `isFiniteVp`가 50대각까지 "깊이"라 부르므로 그 안에 **사실상 화면 평행**인 획이 섞인다.
    const VP_BANDS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 10], [10, 50], [50, 1e9]];
    const byVp = VP_BANDS.map(([lo, hi]) => {
      const d = depth.filter(r => r.vpRatio != null && r.vpRatio >= lo && r.vpRatio < hi);
      const l = d.filter(r => r.near <= RULE_TOL.screen_axis_deg);
      const lt = d.filter(r => r.nearTrue <= RULE_TOL.screen_axis_deg);
      // ⚠⚠ **`at_current_4deg.geom_shallow`와 다른 양이다**(9-R [M1]이 잡았다) —
      // 거기는 **누수의 부분집합**(샌 것 ∩ 참도 얕음)이고 여기는 **그 대역의 깊이 획 중
      // 참 투영선이 얕은 것 전부**다. 그래서 `leak`보다 클 수 있다(0-1 대역 240 > 232).
      // 이름을 갈랐다 — 같은 이름 두 정의가 실제로 오독을 만들었다(#23과 같은 자리).
      return { vp_dist_diag: `${lo}-${hi}`, n: d.length,
               leak: fraction(l.length, d.length), leak_rate: rate(l.length, d.length),
               true_shallow: fraction(lt.length, d.length),
               near_true_median: round(median(d.map(r => r.nearTrue))) };
    });
    // **소실점이 화면 대각 3배 안**인 획만 — 사람이 수렴을 보는 구간이다
    const nearVp = depth.filter(r => r.vpRatio != null && r.vpRatio < 3);
    const nearVpLeak = nearVp.filter(r => r.near <= RULE_TOL.screen_axis_deg).length;
    const nearVpGeom = nearVp.filter(r => r.nearTrue <= RULE_TOL.screen_axis_deg).length;
    const sweepNearVp = SCR.map(scr => {
      const dep = Math.max(scr * 2, RULE_TOL.depth_min_deg);
      let leak = 0, amb = 0;
      for (const r of nearVp) {
        const k = kindAt(r.near, r.side, scr, dep);
        if (k === "screen_h" || k === "screen_v") leak += 1;
        else if (k === "ambiguous") amb += 1;
      }
      return { screen_axis_deg: scr, leak: fraction(leak, nearVp.length),
               leak_rate: rate(leak, nearVp.length), ambiguous: fraction(amb, nearVp.length) };
    });

    // ---- ⑥ **앱 경로 팔**(#17·#30) — `resolve2dCore`를 지난 뒤 같은 것을 잰다.
    // 이 팔과 위 팔의 차이가 곧 **오스냅이 만든 누수**다.
    const leakAt = (rs: Row[], f: (r: Row) => number) =>
      rs.filter(r => f(r) <= RULE_TOL.screen_axis_deg).length;
    const osnapArm = {
      what: "앱은 P0에서 `resolve2dCore`를 먼저 돌린다. `screenOrthoSnap`이 **같은 4°**로 "
          + "끝점을 축 위로 옮기므로 판정은 그 뒤에 온다 — 즉 4°가 **두 번** 쓰인다.",
      leak_raw: fraction(leakAt(depth, r => r.near), depth.length),
      leak_after_osnap: fraction(leakAt(depth, r => r.nearSnap), depth.length),
      ortho_fired_depth: fraction(depth.filter(r => r.orthoFired).length, depth.length),
      ortho_fired_screen: fraction(screen.filter(r => r.orthoFired).length, screen.length),
      screen_missed_raw: fraction(screen.filter(r => r.near > RULE_TOL.screen_axis_deg).length,
                                  screen.length),
      screen_missed_after_osnap: fraction(
        screen.filter(r => r.nearSnap > RULE_TOL.screen_axis_deg).length, screen.length),
      by_composition: Object.fromEntries(COMPOSITIONS.map(C => {
        const d = depth.filter(r => r.comp === C.name);
        return [C.name, { n: d.length,
                          raw: fraction(leakAt(d, r => r.near), d.length),
                          after_osnap: fraction(leakAt(d, r => r.nearSnap), d.length) }];
      })),
      near_vp_only: {
        n: nearVp.length,
        raw: fraction(leakAt(nearVp, r => r.near), nearVp.length),
        after_osnap: fraction(leakAt(nearVp, r => r.nearSnap), nearVp.length),
      },
      // **새로 샌 것만** 골라 기전을 가른다 — 원래 4° 밖이던 깊이 획이 오스냅 뒤 안으로 들어온 것.
      // ⚠ 배타 분류가 아니다(한 획에 여럿이 걸린다) — 그래서 **겹침도 함께 적는다**(#11).
      newly_leaked: (() => {
        const nl = depth.filter(r => r.near > RULE_TOL.screen_axis_deg
                                  && r.nearSnap <= RULE_TOL.screen_axis_deg);
        return {
          n: nl.length,
          of_depth: fraction(nl.length, depth.length),
          ortho: fraction(nl.filter(r => r.orthoFired).length, nl.length),
          start_osnap: fraction(nl.filter(r => r.startSnapped).length, nl.length),
          end_osnap: fraction(nl.filter(r => r.endSnapped).length, nl.length),
          align_guides: fraction(nl.filter(r => r.guides > 0).length, nl.length),
          none_of_them: fraction(nl.filter(r => !r.orthoFired && !r.startSnapped
                                             && !r.endSnapped && r.guides === 0).length, nl.length),
          by_composition: Object.fromEntries(COMPOSITIONS.map(C => [C.name,
            fraction(nl.filter(r => r.comp === C.name).length,
                     depth.filter(r => r.comp === C.name).length)])),
          // **원본 판정으로 나눈다** — `depth`(≥8°)에서 화면 축이 된 것은 **모순**이고,
          // `ambiguous`(4~8°)에서 된 것은 스냅이 모호를 **가른 것**이다(8차 지시 2-b).
          from_raw_depth: fraction(nl.filter(r => r.near >= RULE_TOL.depth_min_deg).length, nl.length),
          from_raw_ambiguous: fraction(
            nl.filter(r => r.near < RULE_TOL.depth_min_deg).length, nl.length),
          from_raw_depth_by_comp: Object.fromEntries(COMPOSITIONS.map(C => [C.name,
            fraction(nl.filter(r => r.comp === C.name && r.near >= RULE_TOL.depth_min_deg).length,
                     depth.filter(r => r.comp === C.name).length)])),
        };
      })(),
      // **반대 방향도 센다**(#15·#16) — 오스냅이 구해 낸 획도 있다
      ablation: Object.keys(ABLATIONS).map(k => {
        const nl = depth.filter(r => r.near > RULE_TOL.screen_axis_deg
                                  && r.abl[k] <= RULE_TOL.screen_axis_deg);
        return {
          arm: k, ...ABLATIONS[k],
          // **모순만** 센다 — 원본이 `depth`(≥8°)인데 화면 축이 된 것(D-L78이 없애는 것)
          contradiction: fraction(
            depth.filter(r => r.near >= RULE_TOL.depth_min_deg
                           && r.abl[k] <= RULE_TOL.screen_axis_deg).length, depth.length),
          contradiction_1pt: fraction(
            depth.filter(r => r.comp === "1pt_yaw0_pitch0" && r.near >= RULE_TOL.depth_min_deg
                           && r.abl[k] <= RULE_TOL.screen_axis_deg).length,
            depth.filter(r => r.comp === "1pt_yaw0_pitch0").length),
          leak: fraction(depth.filter(r => r.abl[k] <= RULE_TOL.screen_axis_deg).length,
                         depth.length),
          newly_leaked: fraction(nl.length, depth.length),
          screen_missed: fraction(screen.filter(r => r.abl[k] > RULE_TOL.screen_axis_deg).length,
                                  screen.length),
          onept: fraction(depth.filter(r => r.comp === "1pt_yaw0_pitch0"
                                         && r.abl[k] <= RULE_TOL.screen_axis_deg).length,
                          depth.filter(r => r.comp === "1pt_yaw0_pitch0").length),
          // **팔마다 구도별로 낸다**(9-R′ [R1]) — 초판은 `onept` 하나뿐이라
          // 문서가 적은 나머지 넷의 출처가 원장에 없었다
          by_composition: Object.fromEntries(COMPOSITIONS.map(C => {
            const d = depth.filter(r => r.comp === C.name);
            return [C.name, fraction(
              d.filter(r => r.abl[k] <= RULE_TOL.screen_axis_deg).length, d.length)];
          })),
        };
      }),
      // **되돌림이 화면 획을 다치게 하는가**(#15·#16) — 참 축이 화면인데 원본이 `depth`(≥8°)이고
      // 스냅 뒤 화면 축이 된 획. 이 획들은 되돌리면 **잃는다**.
      retry_cost_on_screen: (() => {
        const hit = screen.filter(r => r.near >= RULE_TOL.depth_min_deg
                                    && r.nearSnap <= RULE_TOL.screen_axis_deg);
        return { n: hit.length, of_screen: fraction(hit.length, screen.length) };
      })(),
      newly_fixed: (() => {
        const nf = depth.filter(r => r.near <= RULE_TOL.screen_axis_deg
                                  && r.nearSnap > RULE_TOL.screen_axis_deg);
        return { n: nf.length, of_depth: fraction(nf.length, depth.length) };
      })(),
    };

    const out = {
      what: "`classifyLine`의 화면 축 임계(4°)가 참 축이 깊이인 획을 얼마나 먹는가 — "
          + "판정만 본다(상태 전이 없음). `order_lock.truth_events`가 세는 귀결의 **원인 쪽**이다.",
      population: { compositions: COMPOSITIONS.length, jitters: JITTERS, grades: GRADES,
                    seeds: SEEDS, strokes: rows.length,
                    depth_truth: depth.length, screen_truth: screen.length },
      angle: {
        depth_drawn: q(depth.map(r => r.near)), depth_true: q(depth.map(r => r.nearTrue)),
        screen_drawn: q(screen.map(r => r.near)), screen_true: q(screen.map(r => r.nearTrue)),
        // ⚠⚠ **`screen_true`가 전부 0인 것은 보장이지 측정이 아니다**(#5 · CLAUDE.md §5 —
        // selfcheck가 "분포 전체가 한 값"으로 플래그한다. 원인은 이것이고 정상이다):
        // 화면 평행 축은 정의상 소실점이 무한원이고(이론서 2.2, c=0) 롤이 0이므로
        // **참 투영선이 정확히 0°·90°**다. 그래서 여기에 **임계를 걸지 않는다.**
        // 의미가 있는 것은 그 옆의 `screen_drawn`(잉크·지터가 얹힌 것)이고, 그 분포가
        // 임계를 정하는 쪽이다 — p90 6.9988 · max 27.9056.
        note_screen_true: "**보장이다**(#5) — 화면 평행 축은 참 투영선이 정확히 0°/90°다"
          + "(이론서 2.2, c=0 · 롤 0). 임계를 걸지 않는다. 임계를 정하는 것은 `screen_drawn`이다.",
        hist_depth_drawn: hist(depth.map(r => r.near)),
        hist_screen_drawn: hist(screen.map(r => r.near)),
      },
      sweep,
      true_angle_arm: trueArm,
      at_current_4deg: {
        leak: fraction(leaked4.length, depth.length),
        // **기하가 얕아서 샌 것** — 참 투영선에서도 4° 안이다. 임계로는 못 고친다
        geom_shallow: fraction(geomShallow, depth.length),
        // **손이 민 것** — 참은 4° 밖인데 그린 것이 안으로 들어왔다
        hand_pushed: fraction(leaked4.length - geomShallow, depth.length),
        side: { h: leaked4.filter(r => r.side === "h").length,
                v: leaked4.filter(r => r.side === "v").length },
      },
      osnap_arm: osnapArm,
      by_vp_distance: byVp,
      near_vp_only: {
        what: "**소실점이 화면 대각 3배 안**인 깊이 획만 — 사람이 수렴을 실제로 보는 구간이다. "
            + "`isFiniteVp`(50대각)의 과포함을 뺀 분모다(#11).",
        n: nearVp.length,
        leak: fraction(nearVpLeak, nearVp.length), leak_rate: rate(nearVpLeak, nearVp.length),
        // ⚠ **부분집합이 아니다** — `by_vp_distance.true_shallow`와 같은 정의다(9-R [M1])
        true_shallow: fraction(nearVpGeom, nearVp.length),
        sweep: sweepNearVp,
      },
      by_composition: byComp, by_seed: bySeed, by_jitter: byJitter,
      what_this_does_not_say: [
        "**차수·배치를 안 잰다.** 여기는 판정 하나뿐이고 귀결은 `order_lock.json`이 낸다.",
        "⚠ **`angle`·`sweep`·`true_angle_arm`은 앱의 2D 오스냅을 안 지난다** — 원시 획의 각만 본다. "
        + "앱 경로(`resolve2dCore`를 지난 뒤)는 **`osnap_arm`과 `ablation`**이 따로 낸다(9-R′ [R3] — "
        + "초판은 이 줄을 한정 없이 적어 자기 원장의 절반과 모순했다).",
        "**합성이다**(AS-L24·L25). 실획의 손떨림 분포는 다를 수 있다.",
      ],
      gate: gate({
        registered: REGISTERED,
        reachability: "**참 투영선 팔**(`true_angle_arm`)이 도달 가능성이다 — 손떨림·잉크가 "
          + "없는 이상적 입력에서 같은 임계가 얼마나 새는지. 그 값이 누수의 **기하 하한**이고, "
          + "임계를 아무리 좁혀도 그 아래로는 못 간다(⚠ 하한이 크면 기준을 낮추는 것이 아니라 "
          + "**임계가 아닌 다른 기전이 필요하다**는 뜻이다 — #35).",
        // ⚠ **경로 구분자는 `/`다**(selfcheck `_resolve`) — 목록을 통째로 가리키면 안 풀린다.
        // 현행 임계(4°) 행 하나를 박는다. 나머지 대역은 `true_angle_arm` 전체에 있다.
        reachability_value: trueArm[trueArm.length - 1].leak_n,
        reachability_source: "true_angle_arm/7/leak_n",
        /**
         * **판정을 낸다**(9-R [M2] · #26 — 등록만 하고 판정을 안 내면 등록이 장식이다).
         * ⚠ ①은 **전 스윕 점에서 실패**하고, **그 실패가 이 항목의 결론을 지지한다** —
         * 참 투영선(손떨림 0)에서도 45.8%가 화면 축으로 읽히면 원인은 임계가 아니라
         * **기하**다. 실패했다고 기준을 낮추지 않는다(#35·#26).
         */
        result: {
          registered_1_true_arm_under_5pct: {
            passed: trueArm.every(t => t.leak_n / depth.length < 0.05),
            at_4deg: fraction(trueArm[trueArm.length - 1].leak_n, depth.length),
            at_0p25deg: fraction(trueArm[0].leak_n, depth.length),
            note: "⛔ **실패다** — 4°에서 45.8% · 가장 좁은 0.25°에서도 12.5%. "
                + "**임계로는 못 가른다**는 이 항목의 결론이 바로 이 실패다.",
          },
          registered_2_sweep_monotone: {
            leak_monotone_down: sweep.every((r, i) => i === 0
              || Number(r.leak.split("/")[0]) >= Number(sweep[i - 1].leak.split("/")[0])),
            screen_missed_monotone_up: sweep.every((r, i) => i === 0
              || Number(r.screen_missed.split("/")[0]) <= Number(sweep[i - 1].screen_missed.split("/")[0])),
            note: "두 곡선이 반대로 움직인다 — 그러나 **교차점이 쓸 만한 자리에 없다**: "
                + "누수를 68/2880까지 낮추는 0.25°에서 화면 획을 663/720 놓친다.",
          },
        },
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "classify_leak.json"), JSON.stringify(out, null, 2), "utf8");
    expect(depth.length).toBeGreaterThan(0);
    expect(screen.length).toBeGreaterThan(0);
  }, 120_000);
});
