// 정규화 래퍼 — 획 → IR 볼륨(+confidence). 참조: python/stage1/normalize.py. 지시서 V-1.
// §1.4 표에 없던 필수 이식분: 스케일정규화·fit게이트·둘레지지율·confidence.
import type { Pt, IR, Capture, Volume } from "./types.js";
import { emptyIR } from "./types.js";
import { hypot, ptp, ptSegDist } from "./geometry.js";
import { parseLines, footprintFromLines, lineLen } from "./parse.js";
import { TUNED_PRECISE, CANON_DIAG, LINE_CAP, FIT_MAX } from "./tolerances.js";

export function massStrokes(cap: Capture): Pt[][] {
  return cap.strokes.filter(s => (s.pen ?? "mass") === "mass" && s.points.length >= 2)
    .map(s => s.points.map(p => [p[0], p[1]] as Pt));
}

function perimeterCoverage(scaled: Pt[][], verts: Pt[], tol = 0.05, nSamples = 120): number {
  if (verts.length < 3) return 0;
  const pts = scaled.flat();
  const edges: [Pt, Pt][] = [];
  for (let i = 0; i < verts.length; i++) edges.push([verts[i], verts[(i + 1) % verts.length]]);
  const lens = edges.map(([a, b]) => hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((x, y) => x + y, 0) || 1;
  const tolAbs = tol * CANON_DIAG;
  let covered = 0, tot = 0;
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e], L = lens[e];
    const k = Math.max(1, Math.round(nSamples * L / total));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const sp: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      tot++;
      let dmin = Infinity;
      for (const p of pts) { const d = hypot(p[0] - sp[0], p[1] - sp[1]); if (d < dmin) dmin = d; }
      if (dmin < tolAbs) covered++;
    }
  }
  return covered / Math.max(1, tot);
}

function fitResidual(scaled: Pt[][], verts: Pt[]): number {
  if (verts.length < 3) return 1.0;
  const edges: [Pt, Pt][] = [];
  for (let i = 0; i < verts.length; i++) edges.push([verts[i], verts[(i + 1) % verts.length]]);
  const pts = scaled.flat();
  const dev = pts.map(p => Math.min(...edges.map(([a, b]) => ptSegDist(p, a, b))));
  dev.sort((a, b) => a - b);
  const m = dev.length >> 1;
  const med = dev.length % 2 ? dev[m] : (dev[m - 1] + dev[m]) / 2;
  return med / CANON_DIAG;
}

export interface NormMeta {
  n_lines: number; fit_residual: number; edge_coverage: number;
  confidence: number; parseable: boolean; scale: number;
}

export function normalizeToIR(cap: Capture, volId = "v1"): { ir: IR; meta: NormMeta } {
  const mass = massStrokes(cap);
  const ir = emptyIR();
  if (mass.length === 0) { ir.unresolved.push("매스(검정) 채널 획 없음"); return { ir, meta: zeroMeta() }; }
  const all = mass.flat();
  const cx = Math.min(...all.map(p => p[0])), cy = Math.min(...all.map(p => p[1]));
  const diag = hypot(ptp(all.map(p => p[0])), ptp(all.map(p => p[1]))) || 1;
  const s = CANON_DIAG / diag;
  const scaled: Pt[][] = mass.map(st => st.map(p => [(p[0] - cx) * s, (p[1] - cy) * s] as Pt));

  const lines = parseLines(scaled, TUNED_PRECISE);
  const scaledVerts = footprintFromLines(lines);
  const verts = scaledVerts.map(v => [v[0] / s + cx, v[1] / s + cy] as Pt);

  const resid = lines.length >= 3 ? fitResidual(scaled, scaledVerts) : 1.0;
  const coverage = lines.length >= 3 ? perimeterCoverage(scaled, scaledVerts) : 0;
  const residScore = Math.max(0, Math.min(1, 1 - resid / FIT_MAX));
  const confidence = round3(coverage ** 2 * (0.6 + 0.4 * residScore));
  const parseable = lines.length >= 3 && lines.length <= LINE_CAP && resid <= FIT_MAX;
  const meta: NormMeta = {
    n_lines: lines.length, fit_residual: round4(resid), edge_coverage: round3(coverage),
    confidence, parseable, scale: round4(s),
  };
  if (!parseable) {
    const why = lines.length < 3 ? "라인<3" : lines.length > LINE_CAP ? `라인 ${lines.length}>${LINE_CAP}`
      : `적합잔차 ${resid.toFixed(3)}>${FIT_MAX}`;
    ir.unresolved.push(`폴리곤 미형성(${why}) — 관계만 수용(§5.3)`);
    return { ir, meta };
  }
  const vol: Volume = {
    id: volId, footprint: verts.map(v => [round2(v[0]), round2(v[1])] as Pt),
    base: 0, height: null, height_src: "unset", confidence, label: "",
  };
  ir.volumes.push(vol);
  return { ir, meta };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round4 = (x: number) => Math.round(x * 10000) / 10000;
function zeroMeta(): NormMeta { return { n_lines: 0, fit_residual: 1, edge_coverage: 0, confidence: 0, parseable: false, scale: 1 }; }
