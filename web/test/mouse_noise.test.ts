// V-5(c,d) **합성** 마우스 모델 특성화. ⚠ V-5b에서 이 합성 모델은 실제 마우스를 대표하지
// 않음이 확인됐다(V-o 반증): 합성=고주파 화이트 jitter, 실획=저주파 변 휘어짐
// (스펙트럼 lowFreq 0.007 vs 0.075, highFreq 14.5° vs 3.4°).
// → **여기 수치로 마우스 현실을 주장하지 말 것.** 실획 판정은 mouse_real_vs_synth /
//    mouse_tolerance_sweep(Quick,Draw raw)에 있다. 이 파일은 합성 모델의 거동 기록 +
//    필압 비의존성(d) 검증용으로 유지한다.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

  it("(d) 필압 상수 0.5(마우스)에서도 confidence 정상(기하 기반) — 합성", () => {
    const { cap } = mouseRect(240, 180, 20, 0.005, 42);
    const { meta } = normalizeToIR(cap);
    expect(meta.confidence).toBeGreaterThan(0.7);   // 필압 무관, 둘레지지율²·적합도
  });

  // (d) 실획 검증 — Quick,Draw raw는 필압/기울기 자체가 없다(마우스·손가락 입력).
  // 필압 경로가 confidence에 개입한다면 여기서 무너져야 한다.
  it("(d) 실제 마우스 잉크(필압 없음)에서도 confidence 정상", () => {
    const p = resolve(__dirname, "../../data/quickdraw/square.ndjson");
    if (!existsSync(p)) return;                     // 데이터 없으면 스킵
    const confs: number[] = [];
    for (const ln of readFileSync(p, "utf-8").split("\n").slice(0, 60)) {
      if (!ln.trim()) continue;
      const d = JSON.parse(ln);
      const strokes = d.drawing.map((s: number[][], i: number) => ({
        points: s[0].map((x: number, k: number) => [x, s[1][k], k, 0.5]), pen: "mass", seq: i,
      })).filter((s: any) => s.points.length >= 2);
      if (!strokes.length) continue;
      const { ir, meta } = normalizeToIR({ frame: "plan", w: 320, h: 320, strokes });
      if (ir.volumes.length && meta.parseable) confs.push(meta.confidence);
    }
    expect(confs.length).toBeGreaterThan(20);
    const m = [...confs].sort((a, b) => a - b)[confs.length >> 1];
    expect(m).toBeGreaterThan(0.7);                 // 실획 중앙 confidence (측정 0.91)
  });
});
