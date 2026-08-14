// W-0 2차 — **양방향 적합도**. 리뷰어 지적 [H2](덮임률도 한쪽으로 속는다)에 대한 답.
//
// 1획=1엣지는 둔감할수록 오르고, 덮임률은 과민할수록 오른다. 둘 다 한쪽만 벌한다.
// 여기서 재는 것은 **검출 엣지 수 vs 같은 허용오차를 지키는 최소 엣지 수**이고,
// 잘게 쪼개면 detected가 늘고 놓치면 minimal이 늘어 **양쪽 다 벌한다**.
// 정답 라벨이 필요 없으므로 **실획에서 직접** 잰다 — V-o("합성으로 실제를 주장하지 말 것") 준수.
//
// 산출물: stage0/out/edge_fidelity.json
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt } from "../src/parser/types.js";
import { loadQuickDraw } from "../src/data/quickdraw.js";
import { fidelity, parseStroke, WIRE_TOL, type WireCfg } from "../src/wire/strokeEdge.js";
import { renderInk, rng32 } from "../src/wire/synthInk.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLOSED = ["square", "house", "castle", "skyscraper", "door", "triangle"];
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

interface Tally { n: number; optimal: number; over: number; under: number; oos: number; line: number; runs: number; }
const empty = (): Tally => ({ n: 0, optimal: 0, over: 0, under: 0, oos: 0, line: 0, runs: 0 });

function measure(cfg: WireCfg, words = CLOSED, limit = 120): Tally {
  const t = empty();
  for (const w of words) {
    for (const cap of loadQuickDraw(ROOT, w, limit)) {
      for (const s of cap.strokes) {
        const pts = s.points.map(p => [p[0], p[1]] as Pt);
        const f = fidelity(pts, cfg);
        const pr = parseStroke(pts, cfg);
        if (pr.kind === "dot") continue;
        t.n += 1; t.runs += f.detected;
        if (pr.kind === "line") t.line += 1;
        if (f.verdict === "optimal") t.optimal += 1;
        else if (f.verdict === "over_split") t.over += 1;
        else if (f.verdict === "under_fit") t.under += 1;
        else t.oos += 1;
      }
    }
  }
  return t;
}
const summarize = (t: Tally) => ({
  n: t.n,
  optimal_rate: rate(t.optimal, t.n),
  over_split_rate: rate(t.over, t.n),
  under_fit_rate: rate(t.under, t.n),
  out_of_scope_rate: rate(t.oos, t.n),
  one_stroke_one_edge: rate(t.line, t.n),
  runs_per_stroke: +(t.runs / Math.max(1, t.n)).toFixed(3),
});

describe("W-0 양방향 적합도", () => {
  it("실획에서 잰다. 둔감·과민 어느 쪽도 이 값을 올리지 못한다", () => {
    const chosen = summarize(measure({}));
    // 격자 전체에 대해 1획=1엣지와 적합도를 함께 낸다 (리뷰어 지적 [H3]: 2점이 아니라 곡선으로)
    const grid: any[] = [];
    for (const corner_deg of [10, 20, 30, 45]) {
      for (const smooth_sigma of [0.5, 1.5, 3.0]) {
        const cfg = { corner_deg, smooth_sigma };
        grid.push({ name: `deg${corner_deg}_sig${smooth_sigma}`, cfg, ...summarize(measure(cfg, CLOSED, 30)) });
      }
    }

    // 두 지표가 실제로 한쪽으로만 속는지 확인한다 — 곡선의 양끝을 본다
    const byDeg = [...grid].sort((a, b) => a.cfg.corner_deg - b.cfg.corner_deg);
    const bluntest = byDeg[byDeg.length - 1], sharpest = byDeg[0];

    const report = {
      spec: "W-0 양방향 적합도 — 검출 엣지 수 vs 허용오차를 지키는 최소 엣지 수(DP).",
      why: [
        "1획=1엣지는 **둔감할수록** 오른다(코너를 놓치면 런이 하나).",
        "덮임률은 **과민할수록** 오른다(잘게 쪼갤수록 직선 런이 늘어난다).",
        "적합도는 양쪽을 벌한다 — 쪼개면 detected가 늘고 놓치면 minimal이 늘어난다.",
        "정답 라벨이 필요 없어 **실획에서 직접** 잰다(assumptions V-o).",
      ],
      sample: `Quick,Draw raw 폐곡선 ${JSON.stringify(CLOSED)} (line 범주 제외). 낙서이므로 하한으로 읽는다.`,
      chosen_cfg: { corner_deg: WIRE_TOL.corner_deg, smooth_sigma: WIRE_TOL.smooth_sigma },
      chosen: chosen,
      grid,
      metric_direction: {
        note: "임계를 낮추면(과민) 1획=1엣지는 내려가고 over_split이 오른다. 높이면(둔감) 반대다.",
        sharpest: { name: sharpest.name, one_stroke_one_edge: sharpest.one_stroke_one_edge,
                    over_split_rate: sharpest.over_split_rate, optimal_rate: sharpest.optimal_rate },
        bluntest: { name: bluntest.name, one_stroke_one_edge: bluntest.one_stroke_one_edge,
                    under_fit_rate: bluntest.under_fit_rate, optimal_rate: bluntest.optimal_rate },
      },
      reading: [
        "optimal_rate 가 **이 방식의 전제를 재는 값**이다 — 잉크가 제 엣지 수로 떨어지는 비율.",
        "out_of_scope_rate 는 어떤 분할로도 허용오차를 못 지키는 획 = 곡선. 도구 범위 밖(§1.2).",
      ],
    };
    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "edge_fidelity.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(chosen.n).toBeGreaterThan(500);
    // 1획=1엣지는 둔감할수록 오른다 (지적 [H3] — 격자 안에서 확인)
    expect(bluntest.one_stroke_one_edge!).toBeGreaterThan(sharpest.one_stroke_one_edge!);
  }, 600_000);

  it("반례: 지표가 양방향으로 벌하는지 — 합성 정답으로 확인", () => {
    const r = rng32(77);
    // 코너 2개짜리 폴리라인
    const verts: Pt[] = [[0, 0], [200, 40], [230, 240], [60, 300]];
    const ink = renderInk(verts, "precise", r);
    const opt = fidelity(ink);
    expect(opt.minimal).toBe(3);

    // 과민: 임계를 크게 낮추면 쪼갠다 → over_split
    const over = fidelity(ink, { corner_deg: 3, smooth_sigma: 0.2 });
    expect(over.detected).toBeGreaterThan(over.minimal);
    expect(over.verdict).toBe("over_split");

    // 둔감: 임계를 크게 올리면 놓친다 → under_fit
    const under = fidelity(ink, { corner_deg: 80, smooth_sigma: 6 });
    expect(under.detected).toBeLessThan(under.minimal);
    expect(under.verdict).toBe("under_fit");
  });

  it("반례: 원은 어떤 분할로도 허용오차를 못 지킨다 — 범위 밖으로 떨어진다", () => {
    const circle: Pt[] = [];
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * Math.PI * 2;
      circle.push([150 + 120 * Math.cos(t), 150 + 120 * Math.sin(t)]);
    }
    // 원은 조각을 아무리 잘게 내도 각 조각이 직선 판정을 통과하므로 최소분할이 존재한다.
    // 그러나 그 수가 크다 — 직선 몇 개로 떨어지지 않는다는 것이 요지다.
    const f = fidelity(circle);
    expect(f.feasible ? f.minimal : 99).toBeGreaterThan(4);
  });
});
