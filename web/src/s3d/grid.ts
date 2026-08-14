// W-1 투시 가이드 — 계획서 §3.8. 카메라가 정해지면 캔버스에 축 가이드를 깐다.
//
// 목적은 장식이 아니다. **그리기 전에 축 방향이 보이면 스냅이 예측 가능해진다.**
// 건축가가 구축선을 먼저 긋고 그리는 방식과 같다.
//
// 지금 까는 것: 각 소실점으로 모이는 부챗살 + 지평선.
// **아직 안 까는 것: 눈금이 있는 지면 격자.** 격자 간격은 실척이 있어야 정해지고
// 실척은 지면 씨앗점에서 나온다(W-3 앵커 체인). 그전에 눈금을 그리면 **없는 정보를
// 있는 것처럼 보여 주게 된다** — 이 프로젝트가 반복해서 걸린 유형이다. DEFERRED에 기록.
import type { Pt2, CameraSolution } from "./camera.js";

export interface GuideLine {
  a: Pt2; b: Pt2;
  kind: "axis" | "horizon";
  axis?: 0 | 1 | 2;
}

/** 화면 사각형과 직선(점+방향)의 교차 구간. 소실점이 화면 밖이어도 살을 그릴 수 있다. */
export function clipToRect(p: Pt2, d: Pt2, w: number, h: number): [Pt2, Pt2] | null {
  const [dx, dy] = d;
  if (Math.hypot(dx, dy) < 1e-12) return null;
  // Liang-Barsky: 각 경계마다 pᵢ·t ≤ qᵢ
  let t0 = -Infinity, t1 = Infinity;
  const P = [-dx, dx, -dy, dy];
  const Q = [p[0] - 0, w - p[0], p[1] - 0, h - p[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(P[i]) < 1e-12) {
      if (Q[i] < 0) return null;          // 경계에 평행하면서 밖
      continue;
    }
    const t = Q[i] / P[i];
    if (P[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}

/**
 * 소실점으로 모이는 부챗살. 화면 테두리를 균등 분할한 점들을 향해 긋는다.
 * 소실점 자체가 화면 안이면 그 주위로 고르게 퍼진다.
 */
export function fanFromVp(vp: Pt2, imgSize: [number, number], n = 12, axis: 0 | 1 | 2 = 0): GuideLine[] {
  const [w, h] = imgSize;
  const out: GuideLine[] = [];
  const perim: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    perim.push([t * w, 0], [t * w, h], [0, t * h], [w, t * h]);
  }
  const seen = new Set<string>();
  for (const q of perim) {
    const d: Pt2 = [q[0] - vp[0], q[1] - vp[1]];
    const L = Math.hypot(d[0], d[1]);
    if (L < 1e-6) continue;
    const key = (Math.atan2(d[1], d[0]) * 40).toFixed(0);   // 방향 중복 제거
    if (seen.has(key)) continue;
    seen.add(key);
    const seg = clipToRect(vp, [d[0] / L, d[1] / L], w, h);
    if (seg) out.push({ a: seg[0], b: seg[1], kind: "axis", axis });
  }
  return out;
}

/** 카메라 상태 → 가이드선. 확정된 축만 그린다 — 모르는 것을 그리지 않는다. */
export function guides(
  cam: CameraSolution, vps: (Pt2 | null)[], imgSize: [number, number],
  horizonY?: number | null,
): GuideLine[] {
  const [w, h] = imgSize;
  const out: GuideLine[] = [];
  const y = horizonY ?? (cam.principalPoint ? cam.principalPoint[1] : null);
  if (y != null && y > -h && y < 2 * h) {
    out.push({ a: [0, y], b: [w, y], kind: "horizon" });
  }
  vps.forEach((v, i) => {
    if (!v) return;
    out.push(...fanFromVp(v, imgSize, 10, i as 0 | 1 | 2));
  });
  return out;
}

/** 축별 색 (§4.4 "축별 색상"). SketchUp 관례에 맞춘다 — 빨강/초록/파랑. */
export const AXIS_COLOR = ["#c0392b", "#1e8449", "#2471a3"] as const;
export const HORIZON_COLOR = "#8e8e8e";
