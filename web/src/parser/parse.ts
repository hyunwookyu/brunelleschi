// 파서 — 획 → 폴리곤 정점. 참조: python/common/normalize_core.parse_strokes (paleo 분기). 지시서 V-1.
import type { Pt } from "./types.js";
import { hypot } from "./geometry.js";
import { recognizeRectilinear, mergePolyline, PALEO } from "./paleosketch.js";
import type { Tol } from "./tolerances.js";

export interface Line { p0: Pt; p1: Pt; }
export const lineLen = (l: Line) => hypot(l.p1[0] - l.p0[0], l.p1[1] - l.p0[1]);
export const lineAngle = (l: Line) => Math.atan2(l.p1[1] - l.p0[1], l.p1[0] - l.p0[0]) * 180 / Math.PI;

function adiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

// 거의 일직선 + 끝점 일치 연속 선분 병합. python _merge_collinear.
function mergeCollinear(lines: Line[], deg: number): Line[] {
  if (lines.length === 0) return lines;
  const out: Line[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const last = out[out.length - 1], l = lines[i];
    if (adiff(lineAngle(last), lineAngle(l)) <= deg &&
        hypot(last.p1[0] - l.p0[0], last.p1[1] - l.p0[1]) < 1e-6) {
      out[out.length - 1] = { p0: last.p0, p1: l.p1 };
    } else out.push(l);
  }
  return out;
}

// 획들 → 라인 체인(폴리곤 변). python parse_strokes paleo 분기 스텝 1~5(제약추론 제외).
export function parseLines(strokes: Pt[][], tol: Tol): Line[] {
  const merged = mergePolyline(strokes, tol.coincident_dist);
  if (merged.length < 3) return [];
  // tuned와 PALEO 키 교집합만 cfg로(파이썬 {k:t[k] for k in PALEO if k in t})
  const cfg: Record<string, number> = {};
  for (const k of Object.keys(PALEO)) if (k in tol) cfg[k] = (tol as any)[k];
  let verts = recognizeRectilinear(merged, cfg).map(p => [p[0], p[1]] as Pt);
  let lines: Line[] = [];
  for (let i = 0; i < verts.length - 1; i++) lines.push({ p0: verts[i], p1: verts[i + 1] });
  lines = lines.filter(l => lineLen(l) >= tol.min_segment_len);
  lines = mergeCollinear(lines, tol.collinear_merge_deg);
  return lines;
}

// 라인 체인 → 폴리곤 정점 배열(footprint). 첫 정점 + 각 변 끝점.
export function footprintFromLines(lines: Line[]): Pt[] {
  if (lines.length === 0) return [];
  const verts: Pt[] = [lines[0].p0];
  for (const l of lines) verts.push(l.p1);
  return verts;
}
