// register 등급 진단 — 국소 창 직진성(순수 기하, pressure/tilt 비의존). 참조: stage1/normalize.detect_grade.
// 마우스 입력(필압 상수)도 이 경로로 등급 판정 가능(가정 V-m/d). 등급은 정보용(표시·측정),
// 파싱 tolerance는 단일 세트(PaleoSketch가 등급 강건).
import type { Pt } from "./types.js";

// 총최소제곱(PCA) 부축 RMS / 주축 길이. 낮을수록 직선. 참조: common/normalize_core.stroke_straightness.
export function strokeStraightness(pts: Pt[]): number | null {
  const n = pts.length;
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  // 2×2 공분산 → 고유분해(대칭). 주/부축.
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);   // 큰 고유값(주축 분산)
  const l2 = tr / 2 - Math.sqrt(disc);   // 작은 고유값(부축 분산)
  // 주축 방향
  let vx: number, vy: number;
  if (Math.abs(sxy) > 1e-12) { vx = l1 - syy; vy = sxy; } else { vx = sxx >= syy ? 1 : 0; vy = sxx >= syy ? 0 : 1; }
  const vn = Math.hypot(vx, vy) || 1; vx /= vn; vy /= vn;
  // 주축 투영 범위(major length)
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const t = (p[0] - mx) * vx + (p[1] - my) * vy; if (t < lo) lo = t; if (t > hi) hi = t; }
  const major = hi - lo;
  if (major < 1e-6) return null;
  const minorRms = Math.sqrt(Math.max(0, l2));   // 부축 RMS = sqrt(작은 고유값)
  return minorRms / major;
}

// Quick,Draw 등급 centroid(직진성 중앙값, CP-0.6). Quick,Draw=브라우저 마우스/터치 입력.
export const GRADE_CENTROID = { precise: 0.049, medium: 0.197, coarse: 0.215 } as const;
export type Grade = keyof typeof GRADE_CENTROID;

// 국소 창 직진성 중앙값 → 최근접 등급. 전체 폐곡선은 형태 좌우 → 국소 '떨림'만.
export function detectGrade(strokes: Pt[][], win = 12, step = 6): { grade: Grade; median: number } {
  const vals: number[] = [];
  for (const s of strokes.slice(0, 8)) {
    for (let i = 0; i < Math.max(1, s.length - win); i += step) {
      const v = strokeStraightness(s.slice(i, i + win));
      if (v != null) vals.push(v);
    }
  }
  if (vals.length === 0) return { grade: "precise", median: 0 };
  vals.sort((a, b) => a - b);
  const m = vals.length >> 1;
  const median = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  let grade: Grade = "precise", best = Infinity;
  for (const g of Object.keys(GRADE_CENTROID) as Grade[]) {
    const d = Math.abs(GRADE_CENTROID[g] - median);
    if (d < best) { best = d; grade = g; }
  }
  return { grade, median };
}
