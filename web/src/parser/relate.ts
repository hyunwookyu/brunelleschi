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
// --- P3: 폴리곤 기반(직교 포함 일반 단순폴리곤). bbox 근사 폐기. shapely 불필요. ---
function ptSeg(p: Pt, a: Pt, b: Pt): number {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby + 1e-12)));
  return hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}
function segsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segSegDist(p1: Pt, p2: Pt, p3: Pt, p4: Pt): number {
  if (segsCross(p1, p2, p3, p4)) return 0;
  return Math.min(ptSeg(p1, p3, p4), ptSeg(p2, p3, p4), ptSeg(p3, p1, p2), ptSeg(p4, p1, p2));
}
function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
// 내부 겹침(penetrate): 정점 포함 또는 변 교차. 단순 접촉(distance 0, 포함 없음)은 인접.
function polysOverlap(a: Pt[], b: Pt[]): boolean {
  for (const p of a) if (pointInPoly(p, b)) return true;
  for (const p of b) if (pointInPoly(p, a)) return true;
  for (const [a0, a1] of edges(a)) for (const [b0, b1] of edges(b)) if (segsCross(a0, a1, b0, b1)) return true;
  return false;
}
// 폴리곤 경계 최소거리 (shapely .distance()와 동치, 미겹침시).
function boundaryDist(a: Pt[], b: Pt[]): number {
  let m = Infinity;
  for (const [a0, a1] of edges(a)) for (const [b0, b1] of edges(b)) { const d = segSegDist(a0, a1, b0, b1); if (d < m) m = d; }
  return m;
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
      if (polysOverlap(a.footprint, b.footprint))
        rels.push({ a: a.id, b: b.id, type: "penetrate", src: "geometry" });
      else {
        const d = boundaryDist(a.footprint, b.footprint);   // 폴리곤 경계 최소거리
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
