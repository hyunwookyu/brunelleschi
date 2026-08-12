// 관계 추론(기하) — 참조: python/stage5/relate.py infer_geometric. V-1.
// adjacent/separated/aligned/penetrate (XY). above_below는 Z 필요→발화(서버). confidence≥0.5만.
import type { IR, Pt, Relation, Volume } from "./types.js";
import { hypot, polyArea } from "./geometry.js";

const MIN_CONFIDENCE = 0.5;

function centroid(fp: Pt[]): Pt {
  let x = 0, y = 0; for (const p of fp) { x += p[0]; y += p[1]; } return [x / fp.length, y / fp.length];
}
function sceneScale(vols: Volume[]): number {
  const all = vols.flatMap(v => v.footprint);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  return hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
}
function edges(fp: Pt[]): [Pt, Pt][] {
  const e: [Pt, Pt][] = []; for (let i = 0; i < fp.length; i++) e.push([fp[i], fp[(i + 1) % fp.length]]); return e;
}
// SAT 없이 근사: bbox 겹침 면적으로 penetrate 판정 대체는 부정확 → 다각형 교차 필요.
// 프로토타입: 볼록/직교 가정 하 bbox 교차 면적 비로 근사(참조 Python은 shapely).
function overlapRatio(a: Pt[], b: Pt[]): number {
  const bb = (fp: Pt[]) => { const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const A = bb(a), B = bb(b);
  const ix = Math.max(0, Math.min(A[2], B[2]) - Math.max(A[0], B[0]));
  const iy = Math.max(0, Math.min(A[3], B[3]) - Math.max(A[1], B[1]));
  const inter = ix * iy;
  return inter / Math.max(1e-9, Math.min(polyArea(a), polyArea(b)));
}
function bboxDist(a: Pt[], b: Pt[]): number {
  const bb = (fp: Pt[]) => { const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const A = bb(a), B = bb(b);
  const dx = Math.max(0, Math.max(A[0] - B[2], B[0] - A[2]));
  const dy = Math.max(0, Math.max(A[1] - B[3], B[1] - A[3]));
  return hypot(dx, dy);
}
function adiff(a: number, b: number) { let d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
// a의 각 변 무한직선에 대해 b의 평행 변이 근접(공선)하면 정렬. python _aligned.
function aligned(a: Pt[], b: Pt[], scale: number, angTol = 5, offTol = 0.03): boolean {
  for (const [a0, a1] of edges(a)) {
    const va = [a1[0] - a0[0], a1[1] - a0[1]], na = hypot(va[0], va[1]); if (na < 1e-6) continue;
    const nrm = [-va[1] / na, va[0] / na];
    const angA = Math.atan2(va[1], va[0]) * 180 / Math.PI;
    for (const [b0, b1] of edges(b)) {
      const vb = [b1[0] - b0[0], b1[1] - b0[1]], nb = hypot(vb[0], vb[1]); if (nb < 1e-6) continue;
      const angB = Math.atan2(vb[1], vb[0]) * 180 / Math.PI;
      if (adiff(angA, angB) > angTol) continue;
      const off = Math.abs((b0[0] - a0[0]) * nrm[0] + (b0[1] - a0[1]) * nrm[1]);
      if (off / scale <= offTol) return true;
    }
  }
  return false;
}

export function inferGeometric(ir: IR, adjRatio = 0.06, sepRatio = 0.25): Relation[] {
  const vols = ir.volumes.filter(v => v.confidence >= MIN_CONFIDENCE);
  if (vols.length < 2) return [];
  const scale = sceneScale(vols);
  const rels: Relation[] = [];
  for (let i = 0; i < vols.length; i++)
    for (let j = i + 1; j < vols.length; j++) {
      const a = vols[i], b = vols[j];
      if (overlapRatio(a.footprint, b.footprint) > 0.1)
        rels.push({ a: a.id, b: b.id, type: "penetrate", src: "geometry" });
      else {
        const d = bboxDist(a.footprint, b.footprint);
        if (d <= adjRatio * scale) rels.push({ a: a.id, b: b.id, type: "adjacent", src: "geometry" });
        else if (d >= sepRatio * scale) rels.push({ a: a.id, b: b.id, type: "separated", src: "geometry" });
      }
      if (aligned(a.footprint, b.footprint, scale)) rels.push({ a: a.id, b: b.id, type: "aligned", src: "geometry" });
    }
  return rels;
}

export function inferRelations(ir: IR): IR {
  const rels = inferGeometric(ir);
  const seen = new Set<string>();
  ir.relations = [];
  for (const r of rels) {
    const key = r.type === "above_below" ? `${r.type}:${r.a},${r.b}` : `${r.type}:${[r.a, r.b].sort().join(",")}`;
    if (!seen.has(key)) { seen.add(key); ir.relations.push(r); }
  }
  return ir;
}
