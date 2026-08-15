// **굽은 획의 비율** — 산출: `stage0/out/bend_share.json`.
//
// D-S17이 `bend > bend_max`인 획을 평면 경로 둘 다에서 뺐다. 그 결정의 **규모**를 몰랐다:
// DEFERRED가 "`bend > 0.18`인 실획 비율은 **아직 잰 적이 없다**"고 적어 두었고,
// AS-7이 인용하던 26.5%는 **다른 임계**(`straight_tol` 0.10)에서 나온 값이라 같은 집단이 아니다.
//
// 여기서 재는 것은 **판정이 실제로 쓰는 그 양**이다 — `representative(pts).bend`,
// 즉 대표 직선(PCA 주축)에서의 최대 편차 ÷ 길이. 임계 하나가 아니라 **분포**를 낸다:
// `bend_max` 0.18은 측정이 정당화하지 못한 잠정값이므로(D-S2·HANDOFF),
// 값 하나에 결론을 걸면 그 결론은 임계와 함께 흔들린다.
//
// **표본은 Quick,Draw다**(마우스 낙서). AS-13에 따라 **설계 결정을 하지 않는다** —
// 규모의 자릿수만 본다. 실획이 들어오면 `real_ink`가 같은 양을 다시 낸다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { representative, maxTurn, AXIS_TOL } from "../src/s3d/axis.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { newStroke, settle, resetStrokeIds, placeByUser, anchorCandidates, PLACE_TOL, diagOf,
         type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { FIRST_VIEW_OPTS } from "../src/s3d/appPlace.js";
import { norm3, sub3, project } from "../src/s3d/geom3d.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, drawEdges, type Scene } from "./scene3d.js";
import { loadQuickDraw, QUICKDRAW_WORDS } from "../src/data/quickdraw.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { stat } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);
/** **임계 하나에 결론을 걸지 않는다** — `bend_max` 0.18은 잠정값이다. */
const CUTS = [0.08, 0.12, 0.18, 0.25, 0.4];

const SC: Scene = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };

describe("굽은 획이 지금 어떻게 되는가", () => {
  /** 상자 하나를 세우고, 그 위에 **크게 휜 획**을 하나 얹는다. */
  function bentOnBox() {
    const r = rng32(777);
    const O = groundPoint(SC, [430, 470])!;
    const edges = boxEdges(SC, O, 1.2, 1.0, 0.9);
    const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01)!;
    resetStrokeIds();
    const list: Stroke[] = drawn.map(d => {
      const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {},
                               { principal: SC.principal, f: SC.f });
      return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
    });
    settle(list, CTX, FIRST_VIEW_OPTS);
    // 상자 두 모서리 끝을 잇되 **크게 부풀린** 획(화면에서 만든다 — 노이즈는 2D에만)
    const a = project(edges[0].a, SC.principal, SC.f)!;
    const b = project(edges[3].b, SC.principal, SC.f)!;
    const pts: [number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const u = i / 25, w = Math.sin(Math.PI * u) * 0.45;
      pts.push([a[0] + (b[0] - a[0]) * u + w * (b[1] - a[1]),
                a[1] + (b[1] - a[1]) * u - w * (b[0] - a[0])]);
    }
    return { list, pts, edges };
  }

  it("**축 경로로 놓이지 않는다** — 판정이 `too_bent`로 미분류에 두므로 축 경로에 아예 안 온다", () => {
    const { list, pts } = bentOnBox();
    const v = classifyStroke(pts, SC.vps, SC.imgSize, {},
                             { principal: SC.principal, f: SC.f });
    expect(v.reason).toBe("too_bent");
    expect(v.axis).toBe("free");                       // 축이 아니므로 축 경로가 못 받는다
    expect(v.rep!.bend).toBeGreaterThan(AXIS_TOL.bend_max);
    // 평면 경로도 D-S17이 막는다 → **미배치로 남는다**
    const s = newStroke(pts, v.axis);
    list.push(s);
    settle(list, CTX, FIRST_VIEW_OPTS);
    expect(s.pts3d.length, "굽은 획이 자동으로 놓였다 — D-S17이 막아야 한다").toBe(0);
  });

  it("**`고치기`로는 놓인다**(D-S18) — 굽은 획도 사용자 지정 경로가 받는다", () => {
    const { list, pts, edges } = bentOnBox();
    const radius = PLACE_TOL.join_ratio * diagOf(CTX.imgSize) * PLACE_TOL.fix_candidate_radius_mult;
    const placed = list.filter(t => t.pts3d.length);
    const ca = anchorCandidates(placed, pts[0], radius);
    const cb = anchorCandidates(placed, pts[pts.length - 1], radius);
    expect(ca.length, "시작 쪽 후보가 있어야 한다").toBeGreaterThan(0);
    expect(cb.length, "끝 쪽 후보가 있어야 한다").toBeGreaterThan(0);
    const s = newStroke(pts, "free");
    const r = placeByUser(s, CTX, { a: ca[0].pos, b: cb[0].pos })!;
    expect(r).not.toBeNull();
    expect(r.provisional).toBe(false);                 // 양 끝을 고르면 확정이다
    expect(r.pts3d.length).toBe(pts.length);           // **획을 버리지 않는다** — 점 수가 그대로다
    // 양 끝이 고른 앵커에 정확히 붙는다
    expect(norm3(sub3(r.pts3d[0], ca[0].pos))).toBeLessThan(1e-9);
    expect(norm3(sub3(r.pts3d[r.pts3d.length - 1], cb[0].pos))).toBeLessThan(1e-9);
    void edges;
  });
});

describe("굽은 획의 비율", () => {
  it("Quick,Draw 실획의 `bend` 분포를 낸다", () => {
    const bends: number[] = [];
    /**
     * **무엇이 섞였는지 먼저 가른다**(HANDOFF 10). `bend`가 큰 획에는 두 종류가 있다 —
     * **꺾인 획**(한 획에 방향이 여럿. 정사각형을 한 획에 그린 것)과 **매끄럽게 휜 획**.
     * 앞의 것은 **AS-6이 이미 잡은 집단**이고 평면 경로와 무관하게 못 쓴다.
     * D-S17이 새로 뺀 것은 **뒤의 것뿐**이므로 그것을 갈라 세야 규모가 나온다.
     */
    const smooth: number[] = [], turned: number[] = [];
    const byWord: Record<string, { n: number; bend: number[]; short: number; smooth: number[] }> = {};
    let tooShort = 0, degenerate = 0;

    for (const w of QUICKDRAW_WORDS) {
      const caps = loadQuickDraw(ROOT, w, 300);
      if (!caps.length) continue;
      byWord[w] = { n: 0, bend: [], short: 0, smooth: [] };
      for (const cap of caps) {
        const diag = Math.hypot(cap.w ?? 320, cap.h ?? 320);   // Quick,Draw 캔버스는 320×320
        for (const s of cap.strokes) {
          const pts = s.points.map(p => [p[0], p[1]] as Pt2);
          const rep = representative(pts);
          if (!rep) { degenerate += 1; continue; }
          // **판정이 먼저 거르는 것과 같은 순서로 센다** — 너무 짧은 획은 방향을 안 믿는다
          if (rep.len < AXIS_TOL.min_len_ratio * diag) { tooShort += 1; byWord[w].short += 1; continue; }
          bends.push(rep.bend);
          byWord[w].bend.push(rep.bend);
          byWord[w].n += 1;
          // 판정과 같은 기준으로 꺾임을 본다(`multi_axis`가 쓰는 그 값이다)
          const turn = maxTurn(pts, AXIS_TOL.turn_window_ratio);
          if (turn > AXIS_TOL.turn_deg) turned.push(rep.bend);
          else { smooth.push(rep.bend); byWord[w].smooth.push(rep.bend); }
        }
      }
    }

    const over = (xs: number[]) =>
      Object.fromEntries(CUTS.map(c => [`over_${c}`, rate(xs.filter(v => v > c).length, xs.length)]));

    const report = {
      spec: "굽은 획의 비율. **D-S17이 평면 경로에서 뺀 집단의 규모**를 잰다.",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      what: (
        "`representative(pts).bend` — 대표 직선(PCA 주축)에서의 최대 편차 ÷ 길이. "
        + "**판정이 실제로 쓰는 그 양이다**(`classifyStroke`가 `bend > bend_max`면 `too_bent`로 "
        + "미분류에 둔다). 너무 짧은 획(`min_len_ratio` 미만)은 판정과 같은 순서로 먼저 뺀다."
      ),
      caveat: (
        "**표본이 Quick,Draw(마우스 낙서)다** — AS-13에 따라 이 수치로 설계 결정을 하지 않는다. "
        + "대상 사용자(스타일러스·투시도 숙련자)를 대표하지 않는다. 재는 것은 **자릿수**뿐이고, "
        + "실획이 들어오면 `real_ink.json`이 같은 양을 다시 낸다. "
        + "**AS-7의 26.5%와 직접 비교하지 않는다** — 그 값은 `straight_tol` 0.10 기준의 다른 지표다."
      ),
      threshold_note: (
        "`bend_max` **0.18은 측정이 정당화하지 못한 잠정값**이다(D-S2가 같은 상수에 대해 "
        + "'이 표본이 임계를 시험하지 못한다'고 적었다). 그래서 절단값 다섯을 다 낸다 — "
        + "임계가 움직이면 이 비율이 얼마나 움직이는지가 함께 보여야 한다."
      ),
      bend_max_now: AXIS_TOL.bend_max,
      n_strokes: bends.length,
      n_too_short: tooShort,
      n_degenerate: degenerate,
      bend: stat(bends, 4),
      share_over: over(bends),
      /**
       * **갈라 센 것 — 이쪽이 D-S17의 실제 규모다.**
       * `turned`는 한 획에 방향이 여럿인 획(`maxTurn > turn_deg`)이고 **AS-6이 이미 잡았다**.
       * 평면 경로가 있든 없든 그 획들은 축에 못 담긴다. D-S17이 **새로** 뺀 것은 `smooth` 중
       * `bend`가 임계를 넘는 것뿐이다.
       */
      split: {
        n_turned: turned.length, n_smooth: smooth.length,
        turned_share: rate(turned.length, bends.length),
        turned: { bend: stat(turned, 4), share_over: over(turned) },
        smooth: { bend: stat(smooth, 4), share_over: over(smooth) },
      },
      by_word: Object.fromEntries(Object.entries(byWord).map(([w, v]) => [w, {
        n: v.n, n_too_short: v.short, bend: stat(v.bend, 4), share_over: over(v.bend),
        smooth: { n: v.smooth.length, share_over: over(v.smooth) },
      }])),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "bend_share.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(bends.length).toBeGreaterThan(100);
  }, 300_000);
});
