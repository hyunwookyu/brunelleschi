// W-0 부수 측정 — 코너 검출 파라미터를 **측정으로 고른다**(A-3 "측정이 가리키는 방향").
//
// 1차 측정에서 under_split 0.135~0.23이 전부 **얕은 코너(45~70°)** 에서 나왔다
// (exact 0.37~0.58 vs 깊은 코너 0.73~0.88). 평활이 얕은 코너를 임계 아래로 뭉갠 것으로 보인다.
// 그런데 같은 측정에서 **없는 코너를 만든 비율은 전 등급 0**이었다 — 임계를 낮출 여유가 있다.
//
// 여기서 재는 것은 두 오류의 맞바꿈이다. 임계를 낮추면 얕은 코너를 잡는 대신 떨림을 코너로
// 오인하기 시작한다. 그 지점을 찾는다. 산출물: stage0/out/corner_tol_sweep.json
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt } from "../src/parser/types.js";
import { parseStroke, WIRE_TOL, type WireCfg } from "../src/wire/strokeEdge.js";
import { renderInk, rng32, type InkGrade } from "../src/wire/synthInk.js";
import { loadQuickDraw } from "../src/data/quickdraw.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

function shapeWithTurns(nCorner: number, r: () => number, minTurn: number, maxTurn: number) {
  const pts: Pt[] = [[0, 0]];
  const turns: number[] = [];
  let ang = r() * Math.PI * 2;
  for (let i = 0; i <= nCorner; i++) {
    const L = 180 * (0.35 + 0.5 * r());
    const last = pts[pts.length - 1];
    pts.push([last[0] + Math.cos(ang) * L, last[1] + Math.sin(ang) * L]);
    const turn = (minTurn + r() * (maxTurn - minTurn)) * Math.PI / 180;
    if (i < nCorner) turns.push(turn * 180 / Math.PI);
    ang += r() < 0.5 ? turn : -turn;
  }
  return { verts: pts, turns };
}

function evalCfg(cfg: WireCfg, seed: number, n = 240) {
  let exact = 0, over = 0, under = 0, shallowN = 0, shallowOk = 0;
  let straightN = 0, spurious = 0;
  for (const grade of ["precise", "medium", "coarse"] as InkGrade[]) {
    const r = rng32(seed + grade.length * 97);
    for (let i = 0; i < n; i++) {
      const nCorner = Math.floor(r() * 4);
      // 얕은 코너를 일부러 많이 섞는다 — 실패가 거기 몰려 있으므로
      const shallow = r() < 0.5;
      const { verts } = shapeWithTurns(nCorner, r, shallow ? 40 : 70, shallow ? 70 : 135);
      const got = parseStroke(renderInk(verts, grade, r), cfg).runs.length;
      const ok = got === nCorner + 1;
      if (ok) exact += 1; else if (got > nCorner + 1) over += 1; else under += 1;
      if (nCorner === 0) { straightN += 1; if (got > 1) spurious += 1; }
      else if (shallow) { shallowN += 1; if (ok) shallowOk += 1; }
    }
  }
  const N = n * 3;
  return {
    exact: rate(exact, N), over_split: rate(over, N), under_split: rate(under, N),
    shallow_exact: rate(shallowOk, shallowN),
    spurious_corner_rate: rate(spurious, straightN),
  };
}

/** 실획에서의 대가 — 임계를 낮추면 곡선/떨림이 폴리라인으로 쪼개져 엣지 수가 부푼다. */
function realInkCost(cfg: WireCfg) {
  let strokes = 0, runs = 0, curve = 0, line = 0, inkLen = 0, edgeLen = 0;
  for (const w of ["house", "castle", "skyscraper", "square"]) {
    for (const cap of loadQuickDraw(ROOT, w, 60)) {
      for (const s of cap.strokes) {
        const pr = parseStroke(s.points.map(p => [p[0], p[1]] as Pt), cfg);
        strokes += 1; runs += pr.runs.length;
        if (pr.kind === "curve") curve += 1;
        if (pr.kind === "line") line += 1;
        inkLen += pr.pathLen;
        for (const rn of pr.runs) if (rn.straight) edgeLen += rn.len;
      }
    }
  }
  return {
    n_strokes: strokes,
    runs_per_stroke: +(runs / Math.max(1, strokes)).toFixed(3),
    curve_rate: rate(curve, strokes), line_rate: rate(line, strokes),
    edge_coverage: inkLen > 0 ? +(edgeLen / inkLen).toFixed(4) : null,
  };
}

describe("W-0 코너 검출 파라미터 선택", () => {
  it("임계·평활을 훑어 두 오류의 맞바꿈 지점을 찾는다", () => {
    const grid: { name: string; cfg: WireCfg }[] = [];
    for (const corner_deg of [10, 15, 20, 25, 30, 35]) {
      for (const smooth_sigma of [0.5, 1.0, 1.5, 2.0]) {
        grid.push({ name: `deg${corner_deg}_sig${smooth_sigma}`, cfg: { corner_deg, smooth_sigma } });
      }
    }
    const rows = grid.map(g => ({
      ...g, synthetic: evalCfg(g.cfg, 31), real: realInkCost(g.cfg),
    }));

    // 선택 규칙을 **먼저** 적는다(측정 후 유리한 쪽을 고르지 않기 위해).
    //   조건: 없는 코너를 만들지 않을 것 (spurious ≤ 0.02)
    //   목표: 그 안에서 합성 exact 최대
    // **격자 끝을 고르면 안 된다** — 더 낮출수록 좋다면 그것은 대가를 못 재고 있다는 뜻이다.
    // 그래서 임계를 10°까지 내려 실제로 꺾이는지 확인한다.
    // 동점 처리도 미리 정한다: exact 차이가 **유효 자릿수 안**(0.02, V-H 시드 변동폭)이면
    // 평활이 큰 쪽을 고른다. 잉크가 이 노이즈 모델보다 거칠 때 덜 무너지는 쪽이다.
    const eligible = rows.filter(r => (r.synthetic.spurious_corner_rate ?? 1) <= 0.02);
    const top = Math.max(...eligible.map(r => r.synthetic.exact ?? 0));
    const best = eligible
      .filter(r => top - (r.synthetic.exact ?? 0) <= 0.02)
      .sort((a, b) => (b.cfg.smooth_sigma ?? 0) - (a.cfg.smooth_sigma ?? 0))[0];

    const report = {
      spec: "W-0 코너 검출 파라미터 스윕. 얕은 코너 누락 ↔ 없는 코너 생성의 맞바꿈.",
      selection_rule: ("① spurious_corner_rate ≤ 0.02 ② 그 안에서 합성 exact 최대 "
        + "③ 최대와 0.02 이내로 동점이면 평활 큰 쪽(거친 잉크 대비). 규칙을 측정 전에 고정했다."),
      current: { name: `deg${WIRE_TOL.corner_deg}_sig${WIRE_TOL.smooth_sigma}` },
      chosen: best ? { name: best.name, cfg: best.cfg, synthetic: best.synthetic, real: best.real } : null,
      grid: rows,
      note: ("실획 열의 runs_per_stroke·curve_rate는 **정답이 없다** — 임계를 낮출 때 "
        + "엣지가 부푸는 정도를 보는 용도이지 성능 지표가 아니다."),
    };
    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "corner_tol_sweep.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(rows.length).toBe(24);
    expect(best).toBeTruthy();
  }, 300_000);
});
