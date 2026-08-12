// PaleoSketch 직교 폴리라인 인식 — 참조: python/common/paleosketch.py. 지시서 V-1.
// 기본 분할 경로(프레임 우선 → H/V 런 → 런교차 정점). 화이트노이즈 강건.
import type { Pt } from "./types.js";
import { resample, gaussianSmooth1d, hypot } from "./geometry.js";

export const PALEO = {
  resample_spacing: 3.0,
  smooth_sigma: 4.0,
  turn_window: 7,
  turn_thresh_deg: 40.0,
  min_corner_sep: 6,
  speed_weight: 0.3,
};
export type PaleoCfg = Partial<typeof PALEO>;

function smoothPath(rs: Pt[], sigma: number): Pt[] {
  if (sigma <= 0 || rs.length < 5) return rs.slice();
  const xs = gaussianSmooth1d(rs.map(p => p[0]), sigma);
  const ys = gaussianSmooth1d(rs.map(p => p[1]), sigma);
  return xs.map((x, i) => [x, ys[i]] as Pt);
}

// 지배 방향(mod 90°) — 국소 방향의 원형평균(길이 가중, 이중각). python _dominant_orientation.
function dominantOrientation(rs: Pt[], w: number): number {
  let sx = 0, sy = 0;
  for (let i = w; i < rs.length - w; i++) {
    const vx = rs[i + w][0] - rs[i - w][0], vy = rs[i + w][1] - rs[i - w][1];
    const L = hypot(vx, vy);
    if (L < 1e-9) continue;
    const ang = Math.atan2(vy, vx);
    sx += L * Math.cos(4 * ang); sy += L * Math.sin(4 * ang);
  }
  if (sx === 0 && sy === 0) return 0;
  let d = (Math.atan2(sy, sx) * 180 / Math.PI) / 4;
  d = ((d % 90) + 90) % 90;
  return d;
}

export function recognizeRectilinear(path: Pt[], cfg: PaleoCfg = {}): Pt[] {
  const c = { ...PALEO, ...cfg };
  let rs = resample(path, c.resample_spacing);
  if (rs.length < 5) return rs.map(p => [p[0], p[1]] as Pt);
  rs = smoothPath(rs, Math.max(2.0, c.smooth_sigma * 0.5));
  const w = Math.floor(c.turn_window);
  const frame = dominantOrientation(rs, Math.max(2, Math.floor(w / 2)));
  const th = frame * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  // world -> frame: q = rs @ R.T,  R=[[cos,sin],[-sin,cos]]
  const q: Pt[] = rs.map(([x, y]) => [x * cs + y * sn, -x * sn + y * cs]);
  const n = q.length;
  const lab: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n - 1, i + w);
    const vx = q[b][0] - q[a][0], vy = q[b][1] - q[a][1];
    lab[i] = Math.abs(vx) >= Math.abs(vy) ? "H" : "V";
  }
  // 런 분할
  let runs: [string, number, number][] = [];
  let s = 0;
  for (let i = 1; i < n; i++) if (lab[i] !== lab[s]) { runs.push([lab[s], s, i - 1]); s = i; }
  runs.push([lab[s], s, n - 1]);
  // 짧은 런 흡수
  const minrun = Math.max(3, Math.floor(c.min_corner_sep));
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k];
      if (r[2] - r[1] + 1 < minrun) {
        if (k === 0) runs[1][1] = r[1]; else runs[k - 1][2] = r[2];
        runs.splice(k, 1); changed = true; break;
      }
    }
  }
  // 인접 동일라벨 병합
  const merged: [string, number, number][] = [runs[0]];
  for (let k = 1; k < runs.length; k++) {
    if (runs[k][0] === merged[merged.length - 1][0]) merged[merged.length - 1][2] = runs[k][2];
    else merged.push(runs[k]);
  }
  runs = merged;
  if (runs.length < 2) return rs.map(p => [p[0], p[1]] as Pt);
  // 런별 일정좌표(중앙값)
  const median = (arr: number[]) => { const s2 = arr.slice().sort((a, b) => a - b); const m = s2.length >> 1; return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2; };
  const coord = runs.map(([lb, a, b]) => {
    const seg = q.slice(a, b + 1);
    return lb === "H" ? ["H", median(seg.map(p => p[1]))] as [string, number]
                      : ["V", median(seg.map(p => p[0]))] as [string, number];
  });
  // 연속 런 교차 → 정점
  const vq: Pt[] = [];
  for (let k = 0; k < runs.length; k++) {
    const [lb, val] = coord[k], [nb, nval] = coord[(k + 1) % runs.length];
    if (lb === nb) continue;
    const y = lb === "H" ? val : nval;
    const x = lb === "V" ? val : nval;
    vq.push([x, y]);
  }
  if (vq.length < 3) return rs.map(p => [p[0], p[1]] as Pt);
  vq.push([vq[0][0], vq[0][1]]);  // 폐곡선 명시
  // frame -> world: verts_q @ R, R=[[cos,sin],[-sin,cos]]
  return vq.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs] as Pt);
}

// 다중 획 병합(끝점 근접). python merge_polyline.
export function mergePolyline(strokes: Pt[][], joinDist: number): Pt[] {
  const polys = strokes.filter(s => s.length >= 2);
  if (polys.length === 0) return [];
  const merged: Pt[] = polys[0].slice();
  for (let i = 1; i < polys.length; i++) {
    const s = polys[i], end = merged[merged.length - 1];
    if (hypot(end[0] - s[0][0], end[1] - s[0][1]) <= joinDist) merged.push(...s.slice(1));
    else if (hypot(end[0] - s[s.length - 1][0], end[1] - s[s.length - 1][1]) <= joinDist)
      merged.push(...s.slice().reverse().slice(1));
    else merged.push(...s);
  }
  return merged;
}
