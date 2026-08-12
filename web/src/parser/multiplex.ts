// 볼륨 다중화 — 획 뭉치 그룹핑(union-find) → 다중 볼륨. 참조: python/stage4/multiplex.py. V-1.
import type { Pt, Capture, IR, Volume } from "./types.js";
import { emptyIR } from "./types.js";
import { hypot } from "./geometry.js";
import { normalizeToIR, type NormMeta } from "./normalize.js";

interface Grp { strokes: Capture["strokes"]; }

function bbox(pts: number[][]): [Pt, Pt] {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
function bboxGap(b1: [Pt, Pt], b2: [Pt, Pt]): number {
  const dx = Math.max(0, Math.max(b1[0][0] - b2[1][0], b2[0][0] - b1[1][0]));
  const dy = Math.max(0, Math.max(b1[0][1] - b2[1][1], b2[0][1] - b1[1][1]));
  return hypot(dx, dy);
}

export function groupStrokes(cap: Capture, gapRatio = 0.05): Capture["strokes"][] {
  const mass = cap.strokes.filter(s => (s.pen ?? "mass") === "mass" && s.points.length >= 2);
  if (mass.length === 0) return [];
  const diag = hypot(cap.w ?? 1000, cap.h ?? 1000);
  const gap = gapRatio * diag;
  const boxes = mass.map(s => bbox(s.points));
  const parent = mass.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < mass.length; i++)
    for (let j = i + 1; j < mass.length; j++)
      if (bboxGap(boxes[i], boxes[j]) <= gap) parent[find(i)] = find(j);
  const groups = new Map<number, Capture["strokes"]>();
  mass.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(s); });
  // 좌상단 순 정렬(안정 id)
  const arr = [...groups.values()];
  arr.sort((g1, g2) => {
    const k = (g: Capture["strokes"]) => {
      const lo = g.map(s => bbox(s.points)[0]).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Infinity, Infinity]);
      return [Math.round(lo[1] / 10) * 10, lo[0]];
    };
    const a = k(g1), b = k(g2);
    return a[0] - b[0] || a[1] - b[1];
  });
  return arr;
}

export function multiplex(cap: Capture): { ir: IR; metas: NormMeta[] } {
  const groups = groupStrokes(cap);
  const ir = emptyIR();
  const metas: NormMeta[] = [];
  groups.forEach((g, k) => {
    const sub: Capture = { frame: cap.frame, w: cap.w, h: cap.h, strokes: g };
    const { ir: sir, meta } = normalizeToIR(sub, `v${k + 1}`);
    metas.push(meta);
    if (sir.volumes.length) ir.volumes.push(sir.volumes[0]);
  });
  if (ir.volumes.length === 0) ir.unresolved.push(`다중화 실패: 파싱 가능한 매스 영역 없음(그룹 ${groups.length}개)`);
  return { ir, metas };
}
