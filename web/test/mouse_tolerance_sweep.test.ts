// V-5b (c) — **실제 마우스 잉크**(Quick,Draw raw)에서 tolerance 스윕.
// 질문: 현행 단일 세트(TUNED_PRECISE+PALEO 기본) 대비 마우스 전용 세트가 이득이 있는가.
// 합성이 실제를 대표하지 않음(V-o 반증)이 밝혀졌으므로, 튜닝 판단은 **실획으로만** 한다.
// 지표: 자기정합 IoU(복원, 원본 잉크 외곽) 중앙값 + parseable율 (stage1/measure_capture와 동일 양).
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Pt, Capture, Stroke } from "../src/parser/types.js";
import { normalizeToIR, type TolOverride } from "../src/parser/normalize.js";
import { TUNED_PRECISE } from "../src/parser/tolerances.js";

const ROOT = resolve(__dirname, "../..");

function loadQuickDraw(word: string, limit: number): Capture[] {
  const p = resolve(ROOT, "data/quickdraw", `${word}.ndjson`);
  if (!existsSync(p)) return [];
  const out: Capture[] = [];
  for (const ln of readFileSync(p, "utf-8").split("\n")) {
    if (!ln.trim()) continue;
    const d = JSON.parse(ln);
    if (d.recognized === false) continue;
    const strokes: Stroke[] = d.drawing.map((s: number[][], i: number) => ({
      points: s[0].map((x: number, k: number) => [x, s[1][k], s[2] ? s[2][k] : k, 0.5]),
      pen: "mass", seq: i,
    })).filter((s: Stroke) => s.points.length >= 2);
    if (strokes.length) out.push({ frame: "plan", w: 320, h: 320, strokes });
    if (out.length >= limit) break;
  }
  return out;
}
function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
function rasterIoU(a: Pt[], b: Pt[], grid = 110): number {
  if (a.length < 3 || b.length < 3) return 0;
  const xs = [...a, ...b].map(p => p[0]), ys = [...a, ...b].map(p => p[1]);
  const lo: Pt = [Math.min(...xs), Math.min(...ys)], hi: Pt = [Math.max(...xs), Math.max(...ys)];
  let I = 0, U = 0;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const p: Pt = [lo[0] + (hi[0] - lo[0]) * (i + 0.5) / grid, lo[1] + (hi[1] - lo[1]) * (j + 0.5) / grid];
    const A = pointInPoly(p, a), B = pointInPoly(p, b);
    if (A || B) U++; if (A && B) I++;
  }
  return U ? I / U : 0;
}
const inkOutline = (cap: Capture): Pt[] => cap.strokes.flatMap(s => s.points.map(p => [p[0], p[1]] as Pt));
const med = (a: number[]) => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(4) : 0;

function score(caps: Capture[], tol: TolOverride) {
  const ious: number[] = []; let par = 0;
  for (const cap of caps) {
    const { ir, meta } = normalizeToIR(cap, "v1", tol);
    if (ir.volumes.length && meta.parseable) { par++; ious.push(rasterIoU(ir.volumes[0].footprint, inkOutline(cap))); }
  }
  return { parseable: +(par / Math.max(1, caps.length)).toFixed(3), iouMed: med(ious) };
}

describe("V-5b 실획 tolerance 스윕 (마우스 전용 세트 필요성)", () => {
  it("현행 단일 세트 대비 개선 여지 측정", { timeout: 600_000 }, () => {
    const N = 100;
    const sets: Record<string, Capture[]> = { square: loadQuickDraw("square", N), door: loadQuickDraw("door", N) };
    const base: TolOverride = { ...TUNED_PRECISE };
    // 1인자 스윕(현행 주변). smooth_sigma·turn_thresh_deg는 PALEO 기본(4.0/40)에서 이동.
    const variants: Record<string, TolOverride> = {
      "base(현행)": base,
      "smooth_sigma=2": { ...base, smooth_sigma: 2 },
      "smooth_sigma=8": { ...base, smooth_sigma: 8 },
      "smooth_sigma=12": { ...base, smooth_sigma: 12 },
      "turn_thresh=30": { ...base, turn_thresh_deg: 30 },
      "turn_thresh=50": { ...base, turn_thresh_deg: 50 },
      "resample=3": { ...base, resample_spacing: 3 },
      "resample=8": { ...base, resample_spacing: 8 },
      "min_seg=15": { ...base, min_segment_len: 15 },
      "min_seg=30": { ...base, min_segment_len: 30 },
      "coincident=25": { ...base, coincident_dist: 25 },
      "coincident=50": { ...base, coincident_dist: 50 },
    };
    const report: any = {};
    for (const [name, tol] of Object.entries(variants)) {
      report[name] = {};
      for (const [word, caps] of Object.entries(sets)) if (caps.length) report[name][word] = score(caps, tol);
    }
    const outp = resolve(ROOT, "stage0/out/mouse_tolerance_sweep.json");
    mkdirSync(dirname(outp), { recursive: true });
    writeFileSync(outp, JSON.stringify({ note: "실제 마우스 잉크(Quick,Draw raw) 자기정합 IoU. 합성 미사용(V-o 반증).", n_per_cat: N, results: report }, null, 2), "utf-8");
    expect(report["base(현행)"].square.iouMed).toBeGreaterThan(0.5);
  });
});
