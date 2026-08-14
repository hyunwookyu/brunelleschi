// W-0. 획 → 엣지 매핑 측정 — **이 방식 전체의 전제를 잰다**(계획서 §6.1, A-2 유일 중단 조건).
//
// 두 갈래로 잰다. 섞으면 안 된다.
//   실획(Quick,Draw raw)   정답 라벨이 없다 → **분포**만 잰다. 얼마나 자주 그러한가.
//   합성(정답 있음)        검출기가 **맞는가**를 잰다. 정확도·재현율.
//
// 실획만 보면 "검출기가 맞는지" 모르고, 합성만 보면 "실제로 그런지" 모른다.
// 산출물은 stage0/out/stroke_edge.json — selfcheck가 스캔한다(CLAUDE.md §4).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt } from "../src/parser/types.js";
import { loadQuickDraw } from "../src/data/quickdraw.js";
import {
  parseStroke, groupOvertraces, overtraceScore, overshoots, pathLength,
  type Seg, type StrokeParse, type WireCfg,
} from "../src/wire/strokeEdge.js";
import { renderInk, retrace, rng32, type InkGrade } from "../src/wire/synthInk.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORDS = ["square", "house", "castle", "skyscraper", "door", "line", "triangle"];
// `line`은 정의상 1획=1엣지가 0.9 근처다. 이것을 섞은 종합 비율 하나로 중단을 판정하면
// 표본 구성이 판정을 만든다 → **폐곡선 범주만의 비율을 따로 낸다**(리뷰어 지적).
const CLOSED_SHAPE_WORDS = ["square", "house", "castle", "skyscraper", "door", "triangle"];
const N_PER_WORD = 120;

function med(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return +(s[Math.floor(s.length / 2)]).toFixed(4);
}
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

// ---------------------------------------------------------------- (a)(c)(d) 실획 분포

interface WordStat {
  n_strokes: number; n_drawings: number;
  kind: Record<string, number>;
  one_stroke_one_edge_all: number | null;
  one_stroke_one_edge_inscope: number | null;
  runs_median: number | null;
  multi_run_rate: number | null;
  overtrace_rate: number | null;
  overshoot_rate: number | null;
  overshoot_tail_median: number | null;
  /** 잉크 경로 길이 중 **직선 런으로 덮인 비율**. 1:1 이 아니어도 엣지가 되면 잡힌다. */
  edge_coverage: number | null;
}

function measureWord(word: string, cfg: WireCfg = {}): WordStat | null {
  const caps = loadQuickDraw(ROOT, word, N_PER_WORD);
  if (!caps.length) return null;
  const kind: Record<string, number> = { dot: 0, line: 0, polyline: 0, curve: 0 };
  let nStroke = 0, nInScope = 0, nLineInScope = 0;
  const runCounts: number[] = [];
  let nSegAll = 0, nSegMerged = 0, nSegOvershoot = 0;
  const tails: number[] = [];
  let inkLen = 0, edgeLen = 0;

  for (const cap of caps) {
    const parses: StrokeParse[] = [];
    for (const s of cap.strokes) {
      const pts = s.points.map(p => [p[0], p[1]] as Pt);
      const pr = parseStroke(pts, cfg);
      parses.push(pr);
      nStroke += 1;
      kind[pr.kind] += 1;
      if (pr.kind !== "dot") runCounts.push(pr.runs.length);
      // 범위 안 = 곡선이 아닌 것. 곡선은 애초에 이 도구의 범위 밖이다(계획서 §1.2).
      if (pr.kind === "line" || pr.kind === "polyline") {
        nInScope += 1;
        if (pr.kind === "line") nLineInScope += 1;
      }
      // 덮임: 곡선 획이라도 그 안의 직선 런은 엣지가 된다. 획 단위 분류보다 관대하지만
      // **더 정직하다** — 실제로 기하가 되는 양을 잰다.
      inkLen += pr.pathLen;
      for (const rn of pr.runs) if (rn.straight) edgeLen += rn.len;
    }
    // 그림 하나 안의 모든 런을 모아 덧그림·지나침을 본다
    const segs: Seg[] = parses.flatMap(p => p.runs);
    if (segs.length >= 2) {
      const g = groupOvertraces(segs);
      const sizes = new Map<number, number>();
      for (const gi of g) sizes.set(gi, (sizes.get(gi) ?? 0) + 1);
      nSegAll += segs.length;
      for (const [, c] of sizes) if (c > 1) nSegMerged += c;
      const ov = overshoots(segs);
      const hit = new Set(ov.map(o => o.seg));
      nSegOvershoot += hit.size;
      for (const o of ov) tails.push(o.tail);
    } else {
      nSegAll += segs.length;
    }
  }
  return {
    n_strokes: nStroke, n_drawings: caps.length, kind,
    one_stroke_one_edge_all: rate(kind.line, nStroke),
    one_stroke_one_edge_inscope: rate(nLineInScope, nInScope),
    runs_median: med(runCounts),
    multi_run_rate: rate(runCounts.filter(r => r >= 2).length, runCounts.length),
    overtrace_rate: rate(nSegMerged, nSegAll),
    overshoot_rate: rate(nSegOvershoot, nSegAll),
    overshoot_tail_median: med(tails),
    edge_coverage: inkLen > 0 ? +(edgeLen / inkLen).toFixed(4) : null,
  };
}

// ---------------------------------------------------------------- (b)(c) 합성 정답 대조

/** 코너 수를 아는 폴리라인. 투시 스케치처럼 축 정렬이 아닌 방향을 쓴다. */
function polylineWithTurns(nCorner: number, r: () => number, scale = 180):
    { verts: Pt[]; turns: number[] } {
  const pts: Pt[] = [[0, 0]];
  const turns: number[] = [];
  let ang = r() * Math.PI * 2;
  for (let i = 0; i <= nCorner; i++) {
    const L = scale * (0.35 + 0.5 * r());
    const last = pts[pts.length - 1];
    pts.push([last[0] + Math.cos(ang) * L, last[1] + Math.sin(ang) * L]);
    // 다음 변은 45~135° 꺾는다. 이보다 얕으면 사람도 코너로 안 본다.
    const turn = (Math.PI / 4) + r() * (Math.PI / 2);
    if (i < nCorner) turns.push(turn * 180 / Math.PI);
    ang += r() < 0.5 ? turn : -turn;
  }
  return { verts: pts, turns };
}
const polyline = (nCorner: number, r: () => number, scale = 180): Pt[] =>
  polylineWithTurns(nCorner, r, scale).verts;

function segmentAccuracyCfg(cfg: WireCfg, grade: InkGrade, seed: number, n = 200) {
  const r = rng32(seed);
  let exact = 0;
  for (let i = 0; i < n; i++) {
    const nCorner = Math.floor(r() * 4);
    const { verts } = polylineWithTurns(nCorner, r);
    if (parseStroke(renderInk(verts, grade, r), cfg).runs.length === nCorner + 1) exact += 1;
  }
  return { exact: rate(exact, n) };
}

function segmentAccuracy(grade: InkGrade, seed: number, n = 200) {
  const r = rng32(seed);
  let exact = 0, over = 0, under = 0;
  // 꺾임각 구간별 — under_split 이 어디서 오는지 보려면 나눠야 한다
  const byTurn: Record<string, { n: number; exact: number }> = {
    "45~70": { n: 0, exact: 0 }, "70~100": { n: 0, exact: 0 }, "100~135": { n: 0, exact: 0 },
  };
  let straightOnly = 0, straightOver = 0;
  for (let i = 0; i < n; i++) {
    const nCorner = Math.floor(r() * 4);          // 0~3 코너 (엣지 1~4개)
    const { verts, turns } = polylineWithTurns(nCorner, r);
    const ink = renderInk(verts, grade, r);
    const got = parseStroke(ink).runs.length;
    const ok = got === nCorner + 1;
    if (ok) exact += 1;
    else if (got > nCorner + 1) over += 1;
    else under += 1;
    if (nCorner === 0) { straightOnly += 1; if (got > 1) straightOver += 1; }
    for (const t of turns) {
      const k = t < 70 ? "45~70" : t < 100 ? "70~100" : "100~135";
      byTurn[k].n += 1; if (ok) byTurn[k].exact += 1;
    }
  }
  return {
    n, exact: rate(exact, n), over_split: rate(over, n), under_split: rate(under, n),
    // over_split 이 정확히 0으로 나오면 지표가 그 방향을 아예 못 재는 것일 수 있다(§13 규칙 3).
    // 코너 0(순수 직선)만 따로 세어 "없는 코너를 만드는가"를 직접 확인한다.
    straight_only: { n: straightOnly, spurious_corner_rate: rate(straightOver, straightOnly) },
    exact_by_turn_deg: Object.fromEntries(
      Object.entries(byTurn).map(([k, v]) => [k, { n: v.n, exact: rate(v.exact, v.n) }])),
  };
}

function overtraceAccuracy(grade: InkGrade, seed: number, n = 200) {
  const r = rng32(seed);
  let tp = 0, fn = 0, fp = 0, tn = 0;
  for (let i = 0; i < n; i++) {
    // 양성: 같은 변을 두 번 그은 것
    const base = polyline(0, r);
    const a = parseStroke(renderInk(base, grade, r)).runs[0];
    const b = parseStroke(retrace(renderInk(base, grade, r), r)).runs[0];
    if (a && b) (overtraceScore(a, b).merge ? tp++ : fn++);
    // 음성: 나란한 다른 변(벽 두께처럼 가까이 평행). 여기서 오탐이 나면 벽이 한 줄로 접힌다.
    // **임계 바로 근처까지 붙인다**(길이의 3~15%). 넉넉히 떼어 놓으면 precision 1.0은
    // 판별력이 아니라 표본이 쉬웠다는 뜻이 된다 — selfcheck가 "정확히 1"로 잡아 고쳤다.
    const off = (0.03 + 0.12 * r()) * 180;
    const shifted: Pt[] = base.map(([x, y]) => [x, y + off]);
    const c = parseStroke(renderInk(shifted, grade, r)).runs[0];
    if (a && c) (overtraceScore(a, c).merge ? fp++ : tn++);
  }
  const precision = tp + fp ? +(tp / (tp + fp)).toFixed(4) : null;
  const recall = tp + fn ? +(tp / (tp + fn)).toFixed(4) : null;
  return { n_pairs: n * 2, tp, fn, fp, tn, precision, recall };
}

// ---------------------------------------------------------------- 실행

describe("W-0 획→엣지 매핑", () => {
  it("실획 분포 + 합성 정확도를 재고 stage0/out/stroke_edge.json에 남긴다", () => {
    const byWord: Record<string, WordStat> = {};
    for (const w of WORDS) {
      const s = measureWord(w);
      if (s) byWord[w] = s;
    }
    expect(Object.keys(byWord).length).toBeGreaterThan(0);

    // 전체 집계 — 단어별 비율의 평균이 아니라 **획 수 가중**이어야 한다.
    const tot = Object.values(byWord).reduce((a, s) => {
      a.strokes += s.n_strokes;
      a.line += s.kind.line; a.polyline += s.kind.polyline;
      a.curve += s.kind.curve; a.dot += s.kind.dot;
      a.covW += (s.edge_coverage ?? 0) * s.n_strokes; a.covN += s.n_strokes;
      return a;
    }, { strokes: 0, line: 0, polyline: 0, curve: 0, dot: 0, covW: 0, covN: 0 });
    const inScope = tot.line + tot.polyline;

    // 폐곡선만 — 표본 구성이 판정을 만들지 않게
    const closed = CLOSED_SHAPE_WORDS.map(w => byWord[w]).filter(Boolean);
    const ct = closed.reduce((a, s) => {
      a.strokes += s.n_strokes; a.line += s.kind.line; a.polyline += s.kind.polyline;
      a.covW += (s.edge_coverage ?? 0) * s.n_strokes;
      return a;
    }, { strokes: 0, line: 0, polyline: 0, covW: 0 });

    const report = {
      spec: "W-0 획→엣지 매핑 측정 (계획서 §6.1). 실획 분포 + 합성 정답 대조.",
      source: {
        real: `Quick,Draw raw ${JSON.stringify(WORDS)} 각 ${N_PER_WORD}장 상한`,
        synthetic: "코너 수를 아는 폴리라인 + 실측 잉크 노이즈(archive_pre_W/ink_noise_model.json)",
        caveat: [
          "Quick,Draw는 **마우스·손가락 낙서**다. 작도 도구로 한 획씩 긋는 상황이 아니다.",
          "따라서 실획 비율은 이 도구에서의 성능이 아니라 **하한**으로 읽어야 한다.",
          "애플펜슬 대표성은 여전히 미검증(assumptions V-A).",
        ],
      },
      real_ink: {
        totals: {
          n_strokes: tot.strokes,
          kind: { line: tot.line, polyline: tot.polyline, curve: tot.curve, dot: tot.dot },
          // (a) 1획 = 1엣지
          one_stroke_one_edge_all: rate(tot.line, tot.strokes),
          one_stroke_one_edge_inscope: rate(tot.line, inScope),
          inscope_rate: rate(inScope, tot.strokes),
          // (a')를 대신할 능력 지표 — 획 단위 1:1이 아니어도 잉크가 엣지가 되는가
          edge_coverage: rate(tot.covW, tot.covN),
        },
        closed_shapes_only: {
          words: CLOSED_SHAPE_WORDS,
          n_strokes: ct.strokes,
          one_stroke_one_edge_all: rate(ct.line, ct.strokes),
          one_stroke_one_edge_inscope: rate(ct.line, ct.line + ct.polyline),
          edge_coverage: rate(ct.covW, ct.strokes),
          why: "`line` 범주는 1획=1엣지가 자명하다. 그것을 빼면 판정이 표본 구성에 덜 좌우된다.",
        },
        by_word: byWord,
        reading: [
          "one_stroke_one_edge_all: 분모가 곡선 포함 전 획. 곡선은 이 도구의 범위 밖이므로 과소평가다.",
          "one_stroke_one_edge_inscope: 분모가 직선·폴리라인. 중단 조건(0.5)은 이쪽에 건다.",
          "polyline 비율이 곧 (c) 분절이 필요한 비율이다 — 한 획이 여러 엣지인 경우.",
          "edge_coverage: 잉크 길이 중 직선 런으로 덮인 비율. 1:1 매핑이 아니어도 엣지가 되는 양.",
          "**주의**: one_stroke_one_edge 는 검출기가 좋아질수록 내려간다(아래 metric_direction 참조).",
        ],
      },
      synthetic_accuracy: {
        segmentation: {   // (c) 분절 오류율
          precise: segmentAccuracy("precise", 11),
          medium: segmentAccuracy("medium", 12),
          coarse: segmentAccuracy("coarse", 13),
          note: "exact = 코너 수를 정확히 맞춘 비율. over_split = 없는 코너를 만든 비율(떨림을 코너로 오인).",
        },
        overtrace: {      // (b) 덧그림 병합 정확도
          precise: overtraceAccuracy("precise", 21),
          medium: overtraceAccuracy("medium", 22),
          coarse: overtraceAccuracy("coarse", 23),
          note: "음성 표본은 **나란한 다른 변**(벽 두께). 오탐이 나면 두 줄이 한 줄로 접힌다.",
        },
      },
      metric_direction: (() => {
        // **이 지표가 어느 방향을 가리키는지 직접 잰다**(§13 규칙 3 반례 테스트).
        // 코너 검출을 일부러 둔감하게 하면 코너를 놓쳐 런이 1개가 되고,
        // 그러면 "1획=1엣지" 비율이 **올라간다**. 능력이 떨어졌는데 지표는 좋아진다.
        const blunt: WireCfg = { corner_deg: 45, smooth_sigma: 3.0 };
        const agg = (cfg: WireCfg) => {
          let st = 0, ln = 0, poly = 0, covW = 0;
          for (const w of CLOSED_SHAPE_WORDS) {
            const r = measureWord(w, cfg);
            if (!r) continue;
            st += r.n_strokes; ln += r.kind.line; poly += r.kind.polyline;
            covW += (r.edge_coverage ?? 0) * r.n_strokes;
          }
          return {
            one_stroke_one_edge_inscope: rate(ln, ln + poly),
            edge_coverage: rate(covW, st),
          };
        };
        return {
          chosen: agg({}),
          deliberately_blunt: agg(blunt),
          synthetic_exact: { chosen: segmentAccuracy("medium", 12, 120).exact,
                             blunt: segmentAccuracyCfg(blunt, "medium", 12, 120).exact },
          verdict: ("둔감한 검출기가 1획=1엣지 비율은 **높이고** 덮임률과 합성 정확도는 낮춘다면, "
            + "이 비율은 능력이 아니라 **그리기 습관 + 검출 실패**를 재는 것이다. "
            + "중단 판정을 여기에 걸면 나쁜 검출기가 통과한다."),
        };
      })(),
      cross_check: {
        overshoot_prev_measurement: 0.1134,
        note: ("구 잉크 모델이 잰 코너 오버슈트(medium 0.1134, 변 길이 대비)와 여기 "
          + "overshoot_tail_median은 **다른 양**이다. 구 값은 코너에서 삐져나온 길이, "
          + "여기 값은 교차점을 지난 꼬리 비율. 같은 현상의 두 측면이라 크기만 대조한다."),
      },
    };

    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "stroke_edge.json"), JSON.stringify(report, null, 2), "utf-8");

    // 측정이 성립했는지만 확인한다(값 자체는 판단 대상이지 통과 조건이 아니다).
    expect(tot.strokes).toBeGreaterThan(500);
    expect(inScope).toBeGreaterThan(100);
  }, 120_000);

  // --- 반례 테스트 (§13 규칙 3) — 지표가 의도한 것을 재는지 ---

  it("반례: 깨끗한 직선 하나는 line, 사각형 한 획은 폴리라인 4구간", () => {
    const r = rng32(7);
    const line = parseStroke(renderInk([[0, 0], [200, 60]], "precise", r));
    expect(line.kind).toBe("line");
    expect(line.runs.length).toBe(1);

    const sq: Pt[] = [[0, 0], [180, 0], [180, 180], [0, 180], [0, 0]];
    const box = parseStroke(renderInk(sq, "precise", r));
    expect(box.kind).toBe("polyline");
    expect(box.runs.length).toBe(4);
  });

  it("반례: 원은 curve로 걸러져 엣지가 되지 않는다", () => {
    const circle: Pt[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      circle.push([100 + 90 * Math.cos(t), 100 + 90 * Math.sin(t)]);
    }
    expect(parseStroke(circle).kind).toBe("curve");
  });

  it("반례: 나란한 두 변(벽 두께)을 덧그림으로 접지 않는다", () => {
    const r = rng32(9);
    const a = parseStroke(renderInk([[0, 0], [200, 0]], "precise", r)).runs[0];
    const b = parseStroke(renderInk([[0, 14], [200, 14]], "precise", r)).runs[0];
    expect(overtraceScore(a, b).merge).toBe(false);
    // 반대로 같은 자리를 되그은 것은 접어야 한다 — 지표가 항상 false가 아님을 확인
    const c = parseStroke(retrace(renderInk([[0, 0], [200, 0]], "precise", r), r)).runs[0];
    expect(overtraceScore(a, c).merge).toBe(true);
  });

  it("반례: 가운데서 만나는 십자는 지나침이 아니다", () => {
    const mk = (p: Pt, q: Pt): Seg => ({ a: p, b: q, len: pathLength([p, q]), residual: 0, straight: true });
    const cross = overshoots([mk([-100, 0], [100, 0]), mk([0, -100], [0, 100])]);
    expect(cross.length).toBe(0);
    // 살짝 지나친 T자는 잡아야 한다
    const t = overshoots([mk([-100, 0], [10, 0]), mk([0, -100], [0, 100])]);
    expect(t.length).toBeGreaterThan(0);
  });

  it("반례: 지표가 능력에 반비례한다 — 둔감한 검출기가 1획=1엣지를 높인다", () => {
    // 이 테스트가 깨지면(둔감화가 비율을 낮추면) 그때는 지표를 다시 봐야 한다.
    const r = rng32(41);
    const blunt: WireCfg = { corner_deg: 45, smooth_sigma: 3.0 };
    let lineChosen = 0, lineBlunt = 0, n = 0;
    for (const cap of loadQuickDraw(ROOT, "house", 60)) {
      for (const st of cap.strokes) {
        const pts = st.points.map(p => [p[0], p[1]] as Pt);
        const a = parseStroke(pts), b = parseStroke(pts, blunt);
        if (a.kind === "line" || a.kind === "polyline") { n += 1; if (a.kind === "line") lineChosen += 1; }
        if (b.kind === "line") lineBlunt += 1;
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(lineBlunt).toBeGreaterThan(lineChosen);          // 둔감할수록 "1획=1엣지"가 많아진다
    const ex = segmentAccuracyCfg(blunt, "medium", 12, 120).exact ?? 0;
    expect(ex).toBeLessThan(segmentAccuracy("medium", 12, 120).exact ?? 1);   // 실제 능력은 낮다
    void r;
  }, 60_000);

  it("반례: 스케일을 10배 해도 같은 엣지 수가 나온다(절대 픽셀 임계 금지, V-s)", () => {
    const r = rng32(5);
    const verts = polylineWithTurns(2, r).verts;
    const ink = renderInk(verts, "medium", rng32(5));
    const big = ink.map(([x, y]) => [x * 10, y * 10] as Pt);
    expect(parseStroke(big).runs.length).toBe(parseStroke(ink).runs.length);
  });

  it("재현성: 같은 시드는 같은 값을 낸다(V-H)", () => {
    expect(segmentAccuracy("medium", 12, 40)).toEqual(segmentAccuracy("medium", 12, 40));
  });
});
