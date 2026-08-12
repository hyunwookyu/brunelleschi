// 표시층 tentative hint — 판정 D. 참조: python/stage1/tentative.py. V-1.
// 미폐합 획뭉치 → 축정렬 bbox(파선상자). IR 밖. 폐합 시 정식 볼륨 교체.
import type { Pt, Capture, Volume } from "./types.js";
import { groupStrokes } from "./multiplex.js";
import { normalizeToIR } from "./normalize.js";
import { CONF_MIN } from "./tolerances.js";

export interface Hint { id: string; bbox: Pt[]; n_strokes: number; n_pts: number; confidence: number; parseable: boolean; }

function aabb(pts: Pt[]): Pt[] {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const lo: Pt = [Math.min(...xs), Math.min(...ys)], hi: Pt = [Math.max(...xs), Math.max(...ys)];
  return [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]];
}

export function resolve(cap: Capture): { volumes: Volume[]; hints: Hint[] } {
  const groups = groupStrokes(cap);
  const volumes: Volume[] = [], hints: Hint[] = [];
  groups.forEach((g, k) => {
    const sub: Capture = { frame: cap.frame, w: cap.w, h: cap.h, strokes: g };
    const { ir, meta } = normalizeToIR(sub, `v${k + 1}`);
    if (ir.volumes.length && meta.confidence >= CONF_MIN) volumes.push(ir.volumes[0]);
    else {
      const pts: Pt[] = g.flatMap(s => s.points.map(p => [p[0], p[1]] as Pt));
      hints.push({ id: `hint_${k + 1}`, bbox: aabb(pts), n_strokes: g.length, n_pts: pts.length, confidence: meta.confidence, parseable: meta.parseable });
    }
  });
  return { volumes, hints };
}
