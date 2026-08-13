// V-5(c,d) 마우스 획 노이즈 → register 등급·파싱 품질. 가정 V-m 해소.
// 마우스는 (1) 샘플 희소(coalesced 없음) (2) 필압/기울기 없음(상수). 이 두 차이만 격리해
// 파싱 품질(parseable·confidence·IoU)과 등급을 측정 → 마우스 전용 tolerance 세트 필요 판단.
// 참조: Quick,Draw=브라우저 마우스/터치 입력 → 기존 등급 분포가 실마우스 대표(progress CP-0.6).
import { describe, it, expect } from "vitest";
import type { Pt, Capture } from "../src/parser/types.js";
import { normalizeToIR } from "../src/parser/normalize.js";
import { detectGrade, strokeStraightness } from "../src/parser/grade.js";

// 결정론 LCG(테스트 재현). Math.random 미사용.
function lcg(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

// 마우스 사각형 획: perEdge 샘플/변 + jitter(대각 대비 비율) + 필압 상수(0.5).
function mouseRect(w: number, h: number, perEdge: number, jitterFrac: number, seed: number): { cap: Capture; truth: Pt[] } {
  const rnd = lcg(seed);
  const diag = Math.hypot(w, h);
  const jit = () => (rnd() * 2 - 1) * jitterFrac * diag;
  const corners: Pt[] = [[40, 40], [40 + w, 40], [40 + w, 40 + h], [40, 40 + h]];
  const pts: number[][] = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4];
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      pts.push([a[0] + (b[0] - a[0]) * t + jit(), a[1] + (b[1] - a[1]) * t + jit(), t, 0.5]);   // p=0.5 상수(마우스)
    }
  }
  pts.push([corners[0][0], corners[0][1], 1, 0.5]);   // 폐합
  return { cap: { frame: "plan", w: 400, h: 300, strokes: [{ points: pts, pen: "mass", seq: 0 }] }, truth: corners };
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
function rasterIoU(a: Pt[], b: Pt[], grid = 120): number {
  const xs = [...a, ...b].map(p => p[0]), ys = [...a, ...b].map(p => p[1]);
  const lo: Pt = [Math.min(...xs), Math.min(...ys)], hi: Pt = [Math.max(...xs), Math.max(...ys)];
  let inter = 0, uni = 0;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const p: Pt = [lo[0] + (hi[0] - lo[0]) * (i + 0.5) / grid, lo[1] + (hi[1] - lo[1]) * (j + 0.5) / grid];
    const ina = pointInPoly(p, a), inb = pointInPoly(p, b);
    if (ina || inb) uni++; if (ina && inb) inter++;
  }
  return uni ? inter / uni : 0;
}

function evalCase(perEdge: number, jitterFrac: number, reps = 8) {
  let par = 0; const ious: number[] = [], confs: number[] = [], meds: number[] = []; const grades: Record<string, number> = {};
  for (let r = 0; r < reps; r++) {
    const { cap, truth } = mouseRect(240, 180, perEdge, jitterFrac, 100 + r * 7);
    const { ir, meta } = normalizeToIR(cap);
    const g = detectGrade(cap.strokes.map(s => s.points.map(p => [p[0], p[1]] as Pt)));
    grades[g.grade] = (grades[g.grade] ?? 0) + 1; meds.push(g.median);
    if (ir.volumes.length && meta.parseable) { par++; ious.push(rasterIoU(truth, ir.volumes[0].footprint)); confs.push(meta.confidence); }
  }
  const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
  return { parseableRate: +(par / reps).toFixed(2), iouMed: +med(ious).toFixed(3), confMed: +med(confs).toFixed(3), straightMed: +med(meds).toFixed(3), grades };
}

describe("V-5 마우스 획 노이즈 → 등급·파싱 품질(V-m)", () => {
  it("straightness 포팅 정합 — Python(common.normalize_core) 값과 일치", () => {
    const line: Pt[] = Array.from({ length: 20 }, (_, i) => [i, 0]);
    const zig: Pt[] = Array.from({ length: 20 }, (_, i) => [i, i % 2 ? 5 : -5]);
    const L: Pt[] = [...Array.from({ length: 10 }, (_, i) => [i, 0] as Pt), ...Array.from({ length: 10 }, (_, j) => [10, j] as Pt)];
    expect(strokeStraightness(line)!).toBeCloseTo(0.0, 5);
    expect(strokeStraightness(zig)!).toBeCloseTo(0.234857, 4);   // Python 참조
    expect(strokeStraightness(L)!).toBeCloseTo(0.151131, 4);     // Python 참조
  });

  it("샘플 밀도 스윕(마우스 희소 vs 펜 조밀), jitter 저(0.008)", () => {
    const table: any = {};
    for (const pe of [4, 8, 16, 30]) table[`perEdge_${pe}`] = evalCase(pe, 0.008);
    console.log("[V-5 밀도] " + JSON.stringify(table));
    // 마우스 현실(8+ 샘플/변)은 파싱·복원 양호해야 — 희소 4는 경계 허용
    expect(table.perEdge_8.parseableRate).toBeGreaterThanOrEqual(0.75);
    expect(table.perEdge_8.iouMed).toBeGreaterThan(0.85);
    expect(table.perEdge_16.iouMed).toBeGreaterThan(0.85);
  });

  it("jitter 스윕(마우스 떨림) @ 밀도16 → 등급 매핑", () => {
    const table: any = {};
    for (const jf of [0.0, 0.006, 0.012, 0.02, 0.035]) table[`jit_${jf}`] = evalCase(16, jf);
    console.log("[V-5 jitter] " + JSON.stringify(table));
    // 저jitter(마우스 전형)는 precise/medium, 고품질 파싱
    expect(table["jit_0.006"].iouMed).toBeGreaterThan(0.85);
    expect(table["jit_0.006"].parseableRate).toBeGreaterThanOrEqual(0.75);
  });

  it("(d) 필압 상수 0.5(마우스)에서도 confidence 정상(기하 기반)", () => {
    const { cap } = mouseRect(240, 180, 20, 0.005, 42);
    const { meta } = normalizeToIR(cap);
    expect(meta.confidence).toBeGreaterThan(0.7);   // 필압 무관, 둘레지지율²·적합도
  });
});
