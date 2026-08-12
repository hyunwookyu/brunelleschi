// 기하 유틸 — 참조: python/common/normalize_core.py, paleosketch.py. 지시서 V-1.
import type { Pt } from "./types.js";

export const hypot = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

export function ptp(a: number[]): number {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo;
}

export function polyArea(fp: Pt[]): number {
  if (fp.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < fp.length; i++) {
    const [x1, y1] = fp[i], [x2, y2] = fp[(i + 1) % fp.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

// np.interp: xp 오름차순 가정, 경계 밖은 끝값 클램프
export function interp(x: number, xp: number[], fp: number[]): number {
  const n = xp.length;
  if (x <= xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xp[m] <= x) lo = m; else hi = m; }
  const t = (x - xp[lo]) / (xp[hi] - xp[lo]);
  return fp[lo] + t * (fp[hi] - fp[lo]);
}

// 호길이 등간격 리샘플 (python resample / _resample와 동일)
export function resample(pts: Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < 1e-9) return [pts[0]];
  const n = Math.max(2, Math.floor(total / spacing) + 1);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const tt = (total * i) / (n - 1);
    out.push([interp(tt, cum, xs), interp(tt, cum, ys)]);
  }
  return out;
}

// Douglas-Peucker (2D cross z-성분). python douglas_peucker와 동일.
export function douglasPeucker(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  const lx = ex - sx, ly = ey - sy, L = hypot(lx, ly);
  let idx = 0, dmax = -1;
  for (let i = 0; i < pts.length; i++) {
    const vx = pts[i][0] - sx, vy = pts[i][1] - sy;
    const d = L < 1e-9 ? hypot(vx, vy) : Math.abs(lx * vy - ly * vx) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = douglasPeucker(pts.slice(0, idx + 1), eps);
    const right = douglasPeucker(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

// scipy.ndimage.gaussian_filter1d(mode="nearest") 재현 — 파리티 핵심(PaleoSketch 평활)
export function gaussianSmooth1d(a: number[], sigma: number, truncate = 4.0): number[] {
  if (sigma <= 0 || a.length < 5) return a.slice();
  const radius = Math.floor(truncate * sigma + 0.5);
  const w: number[] = [];
  let sum = 0;
  for (let x = -radius; x <= radius; x++) { const v = Math.exp(-0.5 * (x * x) / (sigma * sigma)); w.push(v); sum += v; }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  const n = a.length, out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (j < 0) j = 0; else if (j >= n) j = n - 1;   // mode nearest (edge clamp)
      acc += a[j] * w[k + radius];
    }
    out[i] = acc;
  }
  return out;
}

// 점-선분 수직거리
export function ptSegDist(p: Pt, a: Pt, b: Pt): number {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby + 1e-9)));
  return hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}
