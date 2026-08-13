// V-5b 재측정 — 합성 마우스 획 vs Quick,Draw **실제 마우스/터치 획**. 가정 V-o 검증.
// 동기: V-5 1차 보고의 모순(합성=precise·IoU0.99 ↔ Quick,Draw=실마우스=medium/coarse f1 0.62~0.72).
// 두 주장이 동시에 성립할 수 없음 → 합성 모델이 실제를 대표하는지 직접 시험.
//
// 데이터: data/quickdraw/*.ndjson = **raw** 포맷([x],[y],[t], RDP 미적용, 원본 좌표)
//   → 브라우저 마우스/터치의 실제 샘플링. simplified(RDP eps=2) 아님.
// 정답 폴리곤이 없으므로 stage1/measure_capture.py와 동일한 자기정합 IoU 사용:
//   IoU(복원 폴리곤, 원본 잉크 외곽 폴리곤).
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Pt, Capture, Stroke } from "../src/parser/types.js";
import { normalizeToIR } from "../src/parser/normalize.js";
import { detectGrade } from "../src/parser/grade.js";

const ROOT = resolve(__dirname, "../..");

// ---------- 합성 마우스 모델 (V-5 1차와 동일 — 명시) ----------
// 모델: **직선 변 + 점별 독립 균등 jitter**(x,y 각각 U(-j,+j)·대각비).
// 즉 화이트/고주파만. 실제 마우스의 저주파(변 휘어짐)·코너 오버슈트·시종점 어긋남 없음.
function lcg(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function synthMouseRect(w: number, h: number, perEdge: number, jitterFrac: number, seed: number): Capture {
  const rnd = lcg(seed), diag = Math.hypot(w, h);
  const jit = () => (rnd() * 2 - 1) * jitterFrac * diag;
  const c: Pt[] = [[40, 40], [40 + w, 40], [40 + w, 40 + h], [40, 40 + h]];
  const pts: number[][] = [];
  for (let e = 0; e < 4; e++) {
    const a = c[e], b = c[(e + 1) % 4];
    for (let k = 0; k < perEdge; k++) { const t = k / perEdge; pts.push([a[0] + (b[0] - a[0]) * t + jit(), a[1] + (b[1] - a[1]) * t + jit(), t, 0.5]); }
  }
  pts.push([c[0][0], c[0][1], 1, 0.5]);
  return { frame: "plan", w: 400, h: 300, strokes: [{ points: pts, pen: "mass", seq: 0 }] };
}

// ---------- Quick,Draw 실획 로더 ----------
function loadQuickDraw(word: string, limit: number): Capture[] {
  const p = resolve(ROOT, "data/quickdraw", `${word}.ndjson`);
  if (!existsSync(p)) return [];
  const out: Capture[] = [];
  const lines = readFileSync(p, "utf-8").split("\n");
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const d = JSON.parse(ln);
    if (d.recognized === false) continue;
    const strokes: Stroke[] = d.drawing.map((s: number[][], i: number) => ({
      points: s[0].map((x: number, k: number) => [x, s[1][k], s[2] ? s[2][k] : k, 0.5]),
      pen: "mass", seq: i,
    })).filter((s: Stroke) => s.points.length >= 2);
    if (!strokes.length) continue;
    out.push({ frame: "plan", w: 320, h: 320, strokes });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- 공통 측정 ----------
function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
function rasterIoU(a: Pt[], b: Pt[], grid = 130): number {
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
const inkOutline = (cap: Capture): Pt[] =>
  cap.strokes.filter(s => (s.pen ?? "mass") === "mass").flatMap(s => s.points.map(p => [p[0], p[1]] as Pt));

const med = (a: number[]) => a.length ? +[...a].sort((x, y) => x - y)[a.length >> 1].toFixed(3) : 0;

interface Row { n: number; grades: Record<string, number>; straightMed: number; parseableRate: number; selfIoUMed: number; confMed: number; nLinesMed: number; }
function measure(caps: Capture[]): Row {
  const grades: Record<string, number> = {}; const straight: number[] = [], ious: number[] = [], confs: number[] = [], lines: number[] = [];
  let par = 0;
  for (const cap of caps) {
    const g = detectGrade(cap.strokes.map(s => s.points.map(p => [p[0], p[1]] as Pt)));
    grades[g.grade] = (grades[g.grade] ?? 0) + 1; straight.push(g.median);
    const { ir, meta } = normalizeToIR(cap);
    lines.push(meta.n_lines);
    if (ir.volumes.length && meta.parseable) {
      par++; confs.push(meta.confidence);
      ious.push(rasterIoU(ir.volumes[0].footprint, inkOutline(cap)));
    }
  }
  return { n: caps.length, grades, straightMed: med(straight), parseableRate: +(par / Math.max(1, caps.length)).toFixed(3), selfIoUMed: med(ious), confMed: med(confs), nLinesMed: med(lines) };
}

// 노이즈 주파수 분해 — 왜 다른지 진단.
// 저주파(변 휘어짐): 획을 4구간으로 나눠 각 구간 양끝 현(chord) 대비 중점 편차 / 현 길이.
// 고주파(점간 떨림): 연속 3점 각도변화(방향 급변)의 중앙 절대값.
function noiseSpectrum(cap: Capture): { lowFreq: number; highFreq: number } {
  const pts = cap.strokes[0].points.map(p => [p[0], p[1]] as Pt);
  const n = pts.length;
  if (n < 12) return { lowFreq: 0, highFreq: 0 };
  const bows: number[] = [];
  const seg = Math.floor(n / 4);
  for (let s = 0; s + seg < n; s += seg) {
    const a = pts[s], b = pts[s + seg], m = pts[s + (seg >> 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const d = Math.abs((b[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (b[1] - a[1])) / L;
    bows.push(d / L);
  }
  const turns: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    turns.push(d * 180 / Math.PI);
  }
  return { lowFreq: med(bows), highFreq: med(turns) };
}

describe("V-5b 합성 마우스 vs Quick,Draw 실획 (V-o 검증)", () => {
  it("실획·합성 등급 분포와 파싱 품질을 나란히 측정", { timeout: 180_000 }, () => {
    const N = 120;
    const real: Record<string, Row> = {};
    for (const word of ["square", "door", "house"]) {
      const caps = loadQuickDraw(word, N);
      if (caps.length) real[word] = measure(caps);
    }
    const synth: Record<string, Row> = {
      "perEdge8_jit0.008": measure(Array.from({ length: N }, (_, r) => synthMouseRect(240, 180, 8, 0.008, 100 + r * 7))),
      "perEdge16_jit0.008": measure(Array.from({ length: N }, (_, r) => synthMouseRect(240, 180, 16, 0.008, 100 + r * 7))),
      "perEdge16_jit0.035": measure(Array.from({ length: N }, (_, r) => synthMouseRect(240, 180, 16, 0.035, 100 + r * 7))),
    };
    // 노이즈 주파수 분해(대표 표본)
    const spec = {
      synth_jit0008: noiseSpectrum(synthMouseRect(240, 180, 16, 0.008, 7)),
      synth_jit0035: noiseSpectrum(synthMouseRect(240, 180, 16, 0.035, 7)),
      real_square: (() => { const c = loadQuickDraw("square", 40); const l = c.map(noiseSpectrum); return { lowFreq: med(l.map(x => x.lowFreq)), highFreq: med(l.map(x => x.highFreq)) }; })(),
    };
    const report = { note: "V-5b 재측정. 합성=직선+점별 독립 균등 jitter(화이트/고주파만). 실획=Quick,Draw raw(마우스/터치).", real, synth, noise_spectrum: spec };
    const outp = resolve(ROOT, "stage0/out/mouse_real_vs_synth.json");
    mkdirSync(dirname(outp), { recursive: true });
    writeFileSync(outp, JSON.stringify(report, null, 2), "utf-8");

    expect(Object.keys(real).length).toBeGreaterThan(0);   // 데이터 존재
    // 이 테스트의 목적은 게이트가 아니라 대조 측정 → 결과는 progress.md/JSON.
    // 회귀 방지 최소 게이트: 실획이 파서를 크래시시키지 않는다.
    for (const r of Object.values(real)) expect(r.n).toBeGreaterThan(0);
  });
});
