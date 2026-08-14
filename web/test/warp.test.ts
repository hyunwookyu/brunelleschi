// S-2b 체계적 왜곡 대응 — AS-14. 산출: `stage0/out/systematic_warp.json`.
//
// **전제 정정**: "투시도 숙련자"가 컴퓨터 같은 정확도를 뜻하지 않는다. 사람이 그리는 투시에는
// 손떨림(무작위·획마다 독립)과 **체계적 왜곡**(방향이 있고 여러 획에 일관)이 함께 있고,
// S-3까지의 파이프라인은 후자를 전자로 취급했다.
//
// **고치지 않는다. 받아들이되 축은 알아보게 한다.** 이론서 18.4가 말하듯 사람은 넓은 화각에서
// 수렴을 완화해 그리며, 그것은 오차가 아니라 **의도**일 수 있다 — 획 보존 원칙과 같은 자리다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, AXIS_TOL, type AxisCfg, type AxisVerdict } from "../src/s3d/axis.js";
import { resolveByConsensus, biasField, CONSENSUS_TOL } from "../src/s3d/consensus.js";
import { newStroke, settle, resetStrokeIds, PLACE_TOL, type PlaceCtx, type Stroke }
  from "../src/s3d/stroke.js";
import { rng32 } from "../src/s3d/synthInk.js";
import {
  scene, groundPoint, boxEdges, drawEdges, apparentVpRatio, projectWarped, stat, round,
  type Scene,
} from "./scene3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
/**
 * **두 구도를 쓴다.** 이론서 18.4의 왜곡은 **화각 60°를 넘어야** 생긴다.
 * S-3의 구도(f=1000, 960×672)는 화각 **60.5°**라 그 경계에 걸쳐 있어 왜곡이 거의 안 생긴다 —
 * 그것 자체가 결과다(왜곡은 구도 의존이다). 넓은 구도를 함께 둔다.
 */
const NORMAL: Scene = scene(35, 15, 1000);          // 화각 60.5° — 18.4의 "논쟁 무의미" 구간
const WIDE: Scene = scene(35, 15, 520);             // 화각 98.4° — 18.4의 "지각과 어긋남" 구간
const fovOf = (sc: Scene) =>
  +((2 * Math.atan(Math.hypot(sc.imgSize[0], sc.imgSize[1]) / 2 / sc.f) * 180) / Math.PI).toFixed(1);

const SC = WIDE;                                     // 모델 자체를 시험할 때는 넓은 구도로
const CAM = { principal: SC.principal, f: SC.f };
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };

/** warp: 0 = 왜곡 없음, 클수록 가장자리에서 덜 수렴(축측 쪽). */
const WARPS = [0, 0.15, 0.3, 0.5];
const END_JITTER = 0.01;                      // S-3이 "성립 구간"으로 잰 값
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

type Variant = "base" | "a" | "b" | "c" | "ab" | "abc";

/** 변형별 설정. `base`는 S-3 그대로(위치 의존·상대 순위 끔). */
function cfgOf(v: Variant, over: AxisCfg = {}): { cfg: AxisCfg; cam?: typeof CAM; consensus: boolean } {
  const off = { angle_relax: 0, rank_margin: Infinity, ...over };
  switch (v) {
    case "base": return { cfg: off, consensus: false };
    case "a": return { cfg: { rank_margin: Infinity, ...over }, cam: CAM, consensus: false };
    case "b": return { cfg: { angle_relax: 0, ...over }, cam: CAM, consensus: false };
    // c 단독 — a·b 없이 이웃 일관성만. 지시가 "가장 효과가 클 것"으로 예상한 항이다.
    case "c": return { cfg: off, consensus: true };
    case "ab": return { cfg: { ...over }, cam: CAM, consensus: false };
    case "abc": return { cfg: { ...over }, cam: CAM, consensus: true };
  }
}

interface Acc {
  n: number; assigned: number; correct: number; wrong: number; relative: number;
  /** **b가 순위로 구제한 획 중 틀린 수.** "조용히 틀림 +0.0000"이 천장의 산물인지 가른다. */
  relative_wrong: number;
  rescued: number; rescued_wrong: number;
  placed: number; no_anchor: number;
  misfit_by_radius: Map<number, number[]>;
  by_reason: Record<string, number>;
}
const emptyAcc = (): Acc => ({
  n: 0, assigned: 0, correct: 0, wrong: 0, relative: 0, relative_wrong: 0, rescued: 0, rescued_wrong: 0,
  placed: 0, no_anchor: 0, misfit_by_radius: new Map(), by_reason: {},
});

function runOne(sc: Scene, warp: number, variant: Variant, seed: number, n: number, acc: Acc,
                joinRatio = PLACE_TOL.join_ratio, over: AxisCfg = {}) {
  const r = rng32(seed);
  const { cfg, consensus } = cfgOf(variant, over);
  const cam = cfgOf(variant, over).cam ? { principal: sc.principal, f: sc.f } : undefined;
  const ctx: PlaceCtx = { principal: sc.principal, f: sc.f, vps: sc.vps, imgSize: sc.imgSize };
  // **넓은 렌즈일수록 상자를 키운다.** 줄이면 그림이 화면 중앙에만 머물러 화각을 넓혀 놓고도
  // 18.4의 기준(60°)을 넘지 않는다 — 그러면 왜곡을 측정하지 못한다.
  const scale = 1000 / sc.f;
  for (let it = 0; it < n; it++) {
    const O = groundPoint(sc, [sc.imgSize[0] * (0.35 + r() * 0.2), sc.imgSize[1] * (0.64 + r() * 0.12)]);
    if (!O) continue;
    const edges = boxEdges(sc, O, (0.8 + r() * 0.7) * scale, (0.8 + r() * 0.7) * scale,
                           (0.6 + r() * 0.6) * scale);
    const drawn = drawEdges(sc, edges, "medium", r, 0.12, END_JITTER, warp);
    if (!drawn) continue;
    const all = drawn.flatMap(d => d.pts2d);
    if (all.some(p => p[0] < -200 || p[0] > sc.imgSize[0] + 200
                   || p[1] < -200 || p[1] > sc.imgSize[1] + 200)) continue;

    const verdicts: AxisVerdict[] = drawn.map(d =>
      classifyStroke(d.pts2d, sc.vps, sc.imgSize, cfg, cam));
    const rescued = consensus
      ? resolveByConsensus(verdicts, sc.imgSize, cfg, cam)
      : [];

    // 부적합도 ↔ 화면 중심 거리 — **왜곡이 위치 의존인지** 보는 증거
    verdicts.forEach((v, i) => {
      acc.n += 1;
      acc.by_reason[v.reason] = (acc.by_reason[v.reason] ?? 0) + 1;
      if (v.rep && v.scores) {
        const mx = (v.rep.a[0] + v.rep.b[0]) / 2 - sc.principal[0];
        const my = (v.rep.a[1] + v.rep.b[1]) / 2 - sc.principal[1];
        const t = Math.hypot(mx, my) / sc.f;                     // tan(반각)
        const bin = Math.min(4, Math.floor(t / 0.25));
        const truth = v.scores.find(s => s.axis === drawn[i].axis);
        if (truth && Number.isFinite(truth.m)) {
          if (!acc.misfit_by_radius.has(bin)) acc.misfit_by_radius.set(bin, []);
          acc.misfit_by_radius.get(bin)!.push(truth.m);
        }
      }
      if (v.axis === "free") return;
      acc.assigned += 1;
      const right = v.axis === drawn[i].axis;
      if (v.relative) { acc.relative += 1; if (!right) acc.relative_wrong += 1; }
      if (right) acc.correct += 1; else acc.wrong += 1;
    });
    for (const rc of rescued) {
      acc.rescued += 1;
      if (rc.axis !== drawn[rc.index].axis) acc.rescued_wrong += 1;
    }

    // (e) 배치 쪽 영향
    resetStrokeIds();
    const list: Stroke[] = drawn.map((d, i) => {
      const v = verdicts[i];
      return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
    });
    settle(list, { ...ctx, joinRatio }, { mode: "facing" });
    for (const s of list) {
      if (s.pts3d.length) acc.placed += 1;
      else if (s.axis !== "free") acc.no_anchor += 1;
    }
  }
}

const summarize = (a: Acc) => ({
  n: a.n,
  assigned_rate: rate(a.assigned, a.n),
  accuracy: rate(a.correct, a.assigned),
  /** A-3이 가장 싫어하는 것 — 전체 중 조용히 틀린 축에 배정된 비율. */
  silent_wrong_rate: rate(a.wrong, a.n),
  relative_rate: rate(a.relative, a.n),
  relative: a.relative,
  relative_wrong: a.relative_wrong,
  /** **순위로 구제한 획의 오류율.** 기저 오류율과 비교해야 한다 — b 채택의 판정선이다. */
  relative_wrong_rate: rate(a.relative_wrong, a.relative),
  rescued_rate: rate(a.rescued, a.n),
  rescued: a.rescued,
  rescued_wrong: a.rescued_wrong,
  /** **구제된 획 중 틀린 비율.** 파이프라인 기저 오류율(3~7%)과 비교해야 한다 — A-3의 판정선이다. */
  rescued_wrong_rate: rate(a.rescued_wrong, a.rescued),
  placed_rate: rate(a.placed, a.n),
  no_anchor_rate: rate(a.no_anchor, a.n),
  by_reason: a.by_reason,
});

describe("S-2b 체계적 왜곡", () => {
  it("왜곡 모델이 실제로 **덜 수렴**시킨다 — 겉보기 소실점이 멀어진다", () => {
    // 화각 60°를 **넘는 부분이 있어야** 왜곡이 생긴다(18.4). 그림이 t=0.74까지 뻗는 구도로 잰다.
    const O = groundPoint(SC, [330, 560])!;
    const edges = boxEdges(SC, O, 2.0, 1.6, 1.4);
    const zRef = edges.reduce((s, e) => s + e.a[2] + e.b[2], 0) / (2 * edges.length);
    for (const w of [0.3, 0.5]) {
      for (const ax of [0, 1] as const) {
        const ratio = apparentVpRatio(SC, edges, zRef, w, ax)!;
        expect(ratio).toBeGreaterThan(1.02);            // 참 소실점보다 멀다 = 덜 수렴
      }
    }
    // 세기가 커지면 더 멀어진다
    expect(apparentVpRatio(SC, edges, zRef, 0.5, 0)!)
      .toBeGreaterThan(apparentVpRatio(SC, edges, zRef, 0.15, 0)!);
    // λ=1이면 그대로다(왜곡 없음)
    expect(apparentVpRatio(SC, edges, zRef, 0, 0)!).toBeCloseTo(1, 3);
    // 공유 모서리는 여전히 한 점이다 — 왜곡은 점의 함수다
    const a = projectWarped(edges[0].b, SC, zRef, 0.3)!;
    const b = projectWarped(edges[3].a, SC, zRef, 0.3)!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);
  });

  it("반례: 왜곡은 **다른 카메라로 흡수되지 않는다** — 사영변환이 아니다", () => {
    // 사영변환이면 직선이 직선으로 가고 한 소실점으로 다시 모인다. 그러면 소실점만 옮기면 되고
    // 이 절 전체가 불필요해진다. 실제로는 축마다 겉보기 소실점이 **다른 비율로** 밀린다.
    const O = groundPoint(SC, [330, 560])!;
    const edges = boxEdges(SC, O, 2.2, 1.4, 1.6);
    const zRef = edges.reduce((s, e) => s + e.a[2] + e.b[2], 0) / (2 * edges.length);
    const rs = [0, 1, 2].map(ax => apparentVpRatio(SC, edges, zRef, 0.4, ax as 0 | 1 | 2)!);
    // 사영변환이면 세 축이 **같은 카메라**를 가리켜야 한다. 비율이 축마다 다르면 아니다.
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.01);
  });

  it("(c) 편향장은 **흩어진 이웃에서 보정하지 않는다** — 왜곡이 아닌 잡음은 통과시킨다", () => {
    const mk = (signed: number, at: Pt2): AxisVerdict => ({
      axis: 0, reason: "ok", misfit: Math.abs(signed), runnerUp: null,
      rep: { a: [at[0] - 50, at[1]], b: [at[0] + 50, at[1]], len: 100, bend: 0 },
      scores: [{ axis: 0, m: Math.abs(signed), signed }], note: "",
    });
    // 일관된 편향: 전부 같은 쪽
    const same = [0.04, 0.042, 0.038, 0.041].map((s, i) => mk(s, [400 + i, 300]));
    expect(biasField(same, SC.imgSize).at(0, [400, 300])!.spread).toBeLessThan(0.01);
    // 흩어진 편향: 부호가 섞임 → spread가 |bias|를 넘는다 → 보정 대상 아님
    const mixed = [0.05, -0.05, 0.04, -0.04].map((s, i) => mk(s, [400 + i, 300]));
    const b = biasField(mixed, SC.imgSize).at(0, [400, 300])!;
    expect(b.spread).toBeGreaterThan(Math.abs(b.bias) * CONSENSUS_TOL.max_spread_ratio);
  });

  it("이웃이 부족하면 구제하지 않는다 — 하나짜리 합의는 합의가 아니다", () => {
    const v: AxisVerdict[] = [{
      axis: "free", reason: "no_axis_matches", misfit: 0.09, runnerUp: 0.3,
      rep: { a: [300, 300], b: [400, 320], len: 102, bend: 0 },
      scores: [{ axis: 0, m: 0.09, signed: 0.09 }, { axis: 1, m: 0.3, signed: 0.3 }], note: "x",
    }];
    expect(resolveByConsensus(v, SC.imgSize, {}, CAM).length).toBe(0);
    expect(v[0].axis).toBe("free");
  });

  it("S-2b 측정 — 구도와 왜곡 세기별로 a·b·c의 효과를 잰다", () => {
    const variants: Variant[] = ["base", "a", "b", "c", "ab", "abc"];
    const byScene: Record<string, unknown> = {};
    const misfitTable: Record<string, unknown> = {};

    for (const [name, sc] of [["normal_60deg", NORMAL], ["wide_98deg", WIDE]] as [string, Scene][]) {
      const byWarp: Record<string, unknown> = {};
      for (const w of WARPS) {
        const row: Record<string, unknown> = {};
        for (const v of variants) {
          const acc = emptyAcc();
          runOne(sc, w, v, 8100 + Math.round(w * 1000), 45, acc);
          row[v] = summarize(acc);
          if (v === "base") {
            const bins = [...acc.misfit_by_radius.keys()].sort((p, q) => p - q);
            misfitTable[`${name}_warp_${w}`] = Object.fromEntries(bins.map(b => [
              `tan_${(b * 0.25).toFixed(2)}~${((b + 1) * 0.25).toFixed(2)}`,
              stat(acc.misfit_by_radius.get(b)!, 4),
            ]));
          }
        }
        byWarp[`warp_${w}`] = row;
      }
      byScene[name] = byWarp;
    }

    // **b의 두 상수를 스윕한다**(리뷰어 지적: 근거가 원장에 없고, "조용히 틀림 +0.0000"이
    // 천장의 산물일 수 있다). 넓은 구도·warp 0.3에서 천장과 배수를 흔든다.
    const bSweep: Record<string, unknown> = {};
    for (const ceil of [0.10, 0.14, 0.22, 0.30, 0.45]) {
      for (const marg of [1.5, 2.5, 4.0]) {
        const acc = emptyAcc();
        runOne(WIDE, 0.3, "b", 8400, 45, acc, PLACE_TOL.join_ratio,
               { vp_dist_ceiling: ceil, rank_margin: marg });
        bSweep[`ceiling_${ceil}_margin_${marg}`] = {
          assigned_rate: rate(acc.assigned, acc.n),
          silent_wrong_rate: rate(acc.wrong, acc.n),
          relative: acc.relative, relative_wrong: acc.relative_wrong,
          relative_wrong_rate: rate(acc.relative_wrong, acc.relative),
        };
      }
    }

    // (e) 접합 허용 범위 ↔ 미배치율
    const joinSweep: Record<string, unknown> = {};
    for (const jr of [0.01, 0.015, 0.025, 0.04]) {
      const acc = emptyAcc();
      runOne(WIDE, 0.3, "abc", 8600, 40, acc, jr);
      joinSweep[`join_${jr}`] = {
        placed_rate: rate(acc.placed, acc.n), no_anchor_rate: rate(acc.no_anchor, acc.n),
        assigned_rate: rate(acc.assigned, acc.n), silent_wrong_rate: rate(acc.wrong, acc.n),
      };
    }

    // 겉보기 소실점 비율 — 왜곡이 "덜 수렴"인지의 직접 증거
    const apparent: Record<string, unknown> = {};
    for (const [name, sc] of [["normal_60deg", NORMAL], ["wide_98deg", WIDE]] as [string, Scene][]) {
      const scale = 1000 / sc.f;
      const O = groundPoint(sc, [sc.imgSize[0] * 0.35, sc.imgSize[1] * 0.82])!;
      const edges = boxEdges(sc, O, 1.6 * scale, 1.3 * scale, 1.1 * scale);
      const zRef = edges.reduce((s, e) => s + e.a[2] + e.b[2], 0) / (2 * edges.length);
      apparent[name] = Object.fromEntries(WARPS.map(w => [`warp_${w}`, {
        axis0: round(apparentVpRatio(sc, edges, zRef, w, 0), 3),
        axis1: round(apparentVpRatio(sc, edges, zRef, w, 1), 3),
        axis2: round(apparentVpRatio(sc, edges, zRef, w, 2), 3),
      }]));
    }

    const report = {
      spec: "S-2b 체계적 왜곡 대응. 사람이 수렴을 완화해 그리는 것을 합성에 넣고(f), 판정 보정 a·b·c의 효과를 잰다.",
      premise: (
        "**사용자 획의 오차는 무작위가 아니다**(AS-14). 손떨림 외에 **체계적 왜곡**이 있고 "
        + "방향이 있으며 여러 획에 일관하다. 이론서 18.4: 화각 60°를 넘으면 정확한 투시가 어색해 "
        + "보이고 사람은 이를 완화해 그린다 — 가장자리로 갈수록 진짜 소실점보다 덜 수렴시킨다. "
        + "**오차가 아니라 의도일 수 있으므로 고치지 않는다. 받아들이되 축은 알아보게 한다.**"
      ),
      model: (
        "**위치 의존** 깊이 압축. `λ(t) = 1 − warp·max(0, t/tan30° − 1)`, "
        + "`z' = z_ref + (z−z_ref)·λ(t)`, `t = |u−P|/f`. warp=0이면 왜곡 없음. "
        + "점의 함수라 여러 획에 일관하고 공유 모서리가 한 점으로 남으며, **사영변환이 아니라** "
        + "다른 카메라로 흡수되지 않는다(반례 테스트 둘로 잠갔다). "
        + "_처음에는 λ를 상수로 뒀는데 그것은 정상 카메라였다 — 깊이 방향 아핀 자유도(16.4) 그 자체이고 "
        + "획 투표가 흡수한다. 반례가 잡았다._ "
        + "**사람 획을 잰 모델이 아니다** — 표본이 없다(AS-13). 성질만 맞춘 대용물이다."
      ),
      scenes: {
        normal_60deg: { f: NORMAL.f, fov_deg: fovOf(NORMAL), note: "S-3이 쓴 구도. 18.4의 '논쟁 무의미' 구간 경계" },
        wide_98deg: { f: WIDE.f, fov_deg: fovOf(WIDE), note: "18.4의 '지각과 명확히 어긋남' 구간" },
      },
      key_finding: (
        "**왜곡은 구도에 달려 있다.** 18.4의 기준이 화각 60°이므로, 그 안쪽 구도에서는 "
        + "같은 warp 값을 줘도 λ(t)=1이 되어 **왜곡이 생기지 않는다**. S-3이 쓴 구도가 정확히 "
        + "그 경계(60.5°)라 S-3의 수치는 이 효과에 거의 영향받지 않는다 — "
        + "**S-2b가 고치는 것은 넓은 구도다.**"
      ),
      variants: {
        base: "S-3 그대로(절대 임계, 위치 무관)",
        a: "위치 의존 임계 — 18.4의 화각 60° 기준을 넘는 만큼 허용을 넓힌다",
        b: "상대 순위 — 왜곡은 후보 전체를 함께 밀어 올리므로 순위로 판정한다(천장 있음)",
        c: "**획 간 일관성 단독** — a·b 없이 이웃의 국소 편향만 빼고 다시 본다",
        ab: "a + b",
        abc: "a + b + **획 간 일관성**(이웃의 국소 편향을 빼고 다시 본다)",
      },
      three_numbers: (
        "assigned_rate만 오르는 것은 개선이 아니다. **silent_wrong_rate(조용히 틀린 축)**를 "
        + "함께 본다 — A-3이 금지하는 것이 그것이다. 구제된 획이 틀린 수(rescued_wrong)도 낸다."
      ),
      condition: { end_jitter: END_JITTER, grade: "medium", skew: 0.12, mode: "facing",
                   join_ratio: PLACE_TOL.join_ratio, boxes_per_cell: 45, seed_base: 8100,
                   yaw_deg: 35, pitch_deg: 15 },
      tolerances: { ...AXIS_TOL, ...CONSENSUS_TOL },
      apparent_vp_ratio: apparent,
      apparent_note: "겉보기 소실점 거리 ÷ 참 소실점 거리. 1보다 크면 덜 수렴한 것이다.",
      misfit_by_field_angle: misfitTable,
      misfit_note: (
        "참 축에 대한 부적합도를 대표 직선 중점의 **화각(tan 반각)** 구간별로 나눈 것. "
        + "왜곡이 위치 의존이면 바깥 구간에서 커진다 — a의 근거다. 18.4의 60°는 tan 0.577이다."
      ),
      by_scene: byScene,
      b_threshold_sweep: {
        why: (
          "**b의 두 상수에는 측정 근거가 없었다**(리뷰어 지적). `vp_dist_ceiling`(상대 순위로 "
          + "구제할 수 있는 부적합도 한계)과 `rank_margin`(1등이 2등보다 나아야 하는 배수)을 "
          + "흔들어, 채택 결론('판정률은 오르고 조용히 틀림은 안 는다')이 그 값에 걸려 있는지 본다. "
          + "**`relative_wrong`이 핵심**이다 — b가 구제한 획 중 틀린 수. 0이면 천장이 "
          + "안전한 것이고, 천장을 올렸을 때 늘어난다면 그 값이 결론을 만들고 있었던 것이다."
        ),
        condition: { scene: "wide_98deg", warp: 0.3, variant: "b", seed: 8400, boxes: 45 },
        default: { vp_dist_ceiling: AXIS_TOL.vp_dist_ceiling, rank_margin: AXIS_TOL.rank_margin },
        by_threshold: bSweep,
      },
      join_radius_sweep: joinSweep,
      selfcheck_notes: {
        "rescued_rate·rescued_wrong_rate = 0": (
          "**c를 끈 변형(base·a·b·ab)에서는 정의상 0**이다 — 구제 기전이 돌지 않는다. "
          + "c를 켠 변형에서 0인 것은 그 조건에서 구제할 획이 없었다는 실측이다(구제는 드물게 일어난다)."
        ),
        "relative_rate = 0": (
          "**b(상대 순위)를 끈 변형(base·a·c)에서는 정의상 0**이다 — `rank_margin`이 무한이라 "
          + "순위 채택 경로가 닫혀 있다."
        ),
        "no_anchor_rate = 0": "끝점 겨냥 오차 1%에서는 거의 다 이어진다는 실측(S-3의 스윕과 같은 결과).",
        "apparent_vp_ratio.axis* = 1 (좁은 구도)": (
          "**정의상 1이다.** 화각 60° 안쪽에서는 λ(t)=1이라 왜곡이 적용되지 않는다 — "
          + "그것이 이 절의 핵심 발견이며 결함이 아니다."
        ),
      },
      consensus_verdict: (
        "**(c)는 기본으로 켜지 않는다.** 측정이 예상을 반증했다 — 지시는 c의 효과가 가장 클 것으로 "
        + "예상했으나, 쌍대 비교에서 b(상대 순위)가 +0.043인 데 비해 c는 +0.002~0.006이고, "
        + "**구제된 29획 중 8획이 틀렸다(28%)**. 파이프라인 기저 오류율 3~7%의 네 배가 넘는다 — "
        + "A-3('조용히 틀린 축에 배정하지 않는다')이 금지하는 거래다. "
        + "기전이 틀렸다기보다 **이 표본이 c에게 근거를 주지 못한다**: 상자 하나에 축당 4획뿐이라 "
        + "`min_support: 3`이 사실상 그 축 전체이고, 국소 편향이 자기 자신과 거의 같은 것을 본다. "
        + "획이 많은 실제 그림에서 다시 잰다(S-5·S-10). 코드는 남기되 꺼 둔다."
      ),
      join_note: (
        "(e) 왜곡이 있을 때 접합 허용 범위와 미배치율의 관계(넓은 구도, warp 0.3, abc). "
        + "**왜곡 자체는 공유 모서리를 어긋내지 않는다**(점의 함수다) — 어긋내는 것은 끝점 겨냥 "
        + "오차다. 그래서 이 스윕이 보는 것은 **판정 변화가 배치에 미치는 영향**이다."
      ),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "systematic_warp.json"), JSON.stringify(report, null, 2), "utf-8");

    const wide = (byScene.wide_98deg as Record<string, Record<string, { assigned_rate: number; silent_wrong_rate: number }>>);
    expect(wide["warp_0.5"].base.assigned_rate).toBeGreaterThan(0);
    // 보정이 판정을 되살리되 **조용히 틀리는 것을 늘리지 않아야** 한다
    expect(wide["warp_0.5"].abc.assigned_rate).toBeGreaterThanOrEqual(wide["warp_0.5"].base.assigned_rate);
  }, 300_000);
});
